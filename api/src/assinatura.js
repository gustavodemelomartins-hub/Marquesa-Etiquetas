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
