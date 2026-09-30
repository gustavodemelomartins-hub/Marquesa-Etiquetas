/** Assina um link de imagem para poder ser usado num `<img src>`.
 *
 *  As fotos ficam no R2 e não são públicas. O navegador é quem exibe a
 *  imagem, e uma tag `<img>` não manda o `Authorization: Bearer` que o
 *  resto da API exige — por isso essas duas rotas de leitura (a de
 *  original e a de tratada) não passam pelo `checarChave` comum, igual ao
 *  callback de OAuth da Nuvemshop já faz por um motivo parecido.
 *
 *  Em vez disso, o link carrega um prazo de validade e uma assinatura
 *  HMAC calculada com a própria API_KEY. Quem não tem a chave não
 *  consegue forjar um link, e um link vazado expira sozinho — o `state`
 *  é recarregado com frequência, então o link é renovado sem ninguém
 *  perceber.
 */

async function chaveHmac(segredo) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

function paraHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** `sku|versao|validade-até` assinado. `validadeSeg` é quanto tempo a
 *  partir de agora — 6h cobre uma sessão de trabalho inteira. */
export async function assinarFoto(env, sku, versao, validadeSeg = 6 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + validadeSeg;
  const msg = `${sku}|${versao}|${exp}`;
  const chave = await chaveHmac(String(env.API_KEY || ''));
  const sig = paraHex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(msg)));
  return { exp, sig };
}

export async function conferirAssinaturaFoto(env, sku, versao, exp, sig) {
  const expNum = parseInt(exp, 10);
  if (!expNum || Date.now() / 1000 > expNum) return false;
  if (!sig) return false;
  const msg = `${sku}|${versao}|${expNum}`;
  const chave = await chaveHmac(String(env.API_KEY || ''));
  const esperado = paraHex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(msg)));
  // comparação em tempo constante — não vaza quantos caracteres bateram
  if (esperado.length !== String(sig).length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/* ── Galeria (29/09/2026) ─────────────────────────────────────────────────
 *
 *  A galeria tem uma foto por LINHA, e o link é da linha, não do SKU:
 *  `galeria|<fotoId>|<versao>|<exp>`. O prefixo impede que uma assinatura
 *  de galeria seja aceita na rota antiga (e vice-versa).
 *
 *  O prazo NÃO é "agora + 6h", que mudaria o endereço a cada recarga do
 *  estado e obrigaria o navegador a baixar de novo as mesmas 60 miniaturas.
 *  É o fim da janela de 12h corrente MAIS 12h: dentro de uma janela o
 *  endereço é idêntico (o cache do navegador serve), e todo link vale
 *  entre 12h e 24h. O objeto nunca muda sob a mesma chave — trocar a foto
 *  cria outra linha —, então servir do cache é sempre servir a foto certa. */
const JANELA_GALERIA_SEG = 12 * 3600;

export function prazoDaGaleria(agoraSeg = Math.floor(Date.now() / 1000)) {
  return (Math.floor(agoraSeg / JANELA_GALERIA_SEG) + 2) * JANELA_GALERIA_SEG;
}

/** A assinatura é da JANELA, não da foto: `galeria|*|<exp>`, um HMAC por
 *  requisição. Uma por foto custava ~140 ms de CPU no `/api/state` com
 *  1.100 fotos, e o plano gratuito do Workers dá 10 ms — o estado passou a
 *  morrer sem resposta depois da importação da loja (29/09/2026).
 *
 *  O que se abre mão: um link vazado lê, até expirar, qualquer foto cujo id
 *  a pessoa conheça. O id é UUID aleatório e só sai no `/api/state` (que
 *  exige a chave), e as fotos são as mesmas da vitrine pública da loja. */
export function assinadorDaGaleria(env) {
  const exp = prazoDaGaleria();
  let sig = null;
  return async function assinar(fotoId, versao) {
    if (!sig) {
      const chave = await chaveHmac(String(env?.API_KEY || ''));
      sig = paraHex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`galeria|*|${exp}`)));
    }
    return `/api/galeria/${encodeURIComponent(fotoId)}/${versao}?exp=${exp}&sig=${sig}`;
  };
}

function mesmoTexto(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function conferirAssinaturaGaleria(env, fotoId, versao, exp, sig) {
  const expNum = parseInt(exp, 10);
  if (!expNum || Date.now() / 1000 > expNum) return false;
  if (!sig) return false;
  const chave = await chaveHmac(String(env?.API_KEY || ''));
  const assinar = async (msg) => paraHex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(msg)));
  if (mesmoTexto(await assinar(`galeria|*|${expNum}`), String(sig))) return true;
  /* Links assinados foto a foto (antes de 29/09 22h) valem até o prazo deles. */
  return mesmoTexto(await assinar(`galeria|${fotoId}|${versao}|${expNum}`), String(sig));
}
