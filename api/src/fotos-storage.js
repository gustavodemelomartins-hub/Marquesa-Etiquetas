/** Onde as fotos realmente moram: o bucket R2 (binding `FOTOS`).
 *
 *  O D1 nunca guarda bytes de imagem — só a chave do objeto, o tipo e o
 *  tamanho (ver `migracao-catalogo.sql`). Este arquivo é a única porta de
 *  entrada e saída dessas duas coisas, para o resto do sistema não precisar
 *  saber como o R2 funciona.
 *
 *  A chave é DETERMINÍSTICA por SKU e versão — `produtos/<sku>/original` ou
 *  `.../tratada`, sem extensão nem timestamp. Trocar a foto sobrescreve o
 *  mesmo objeto, então não sobra lixo órfão no bucket a cada re-upload, e o
 *  D1 nunca aponta para uma chave que não existe mais.
 */

const TIPOS_ACEITOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const TAMANHO_MAXIMO = 8 * 1024 * 1024; // 8 MB — cobre foto de celular com folga

export function tipoValido(tipo) {
  return TIPOS_ACEITOS.has(String(tipo || '').toLowerCase().split(';')[0].trim());
}

export function chaveFoto(sku, versao) {
  return `produtos/${sku}/${versao}`;
}

/** Confere tipo e tamanho antes de gastar uma escrita no bucket — os dois
 *  erros que uma pessoa comente sem querer (PDF em vez de foto, ou uma
 *  imagem gigante direto da câmera) devem voltar como mensagem, não como
 *  exceção não tratada no meio do upload. */
export function validarBytes(bytes, tipo) {
  if (!tipoValido(tipo)) return 'Formato não reconhecido — envie JPEG, PNG ou WebP.';
  if (!bytes || !bytes.byteLength) return 'Arquivo vazio.';
  if (bytes.byteLength > TAMANHO_MAXIMO) return 'Arquivo maior que 8 MB — reduza antes de enviar.';
  return null;
}

/** Mensagem de recusa quando a conta Cloudflare não tem R2 habilitado
 *  (erro 10042) e o binding `FOTOS` foi removido do `wrangler.toml` de
 *  produção por causa disso. Controlada — nunca deixa a chamada virar
 *  exceção não tratada nem sucesso falso. */
const SEM_R2 = 'Upload e edição de foto exigem R2, que não está habilitado '
             + 'nesta conta Cloudflare ainda. Fotos existentes por URL '
             + 'externa continuam funcionando normalmente.';

/** Grava e devolve o que o D1 precisa guardar como referência.
 *  Sem o binding `FOTOS` (conta sem R2 habilitado), recusa de forma
 *  explícita em vez de lançar `TypeError` ou fingir que gravou. */
export async function salvarFoto(env, sku, versao, bytes, tipo) {
  const erro = validarBytes(bytes, tipo);
  if (erro) return { erro };
  if (!env.FOTOS) return { erro: SEM_R2 };
  const key = chaveFoto(sku, versao);
  await env.FOTOS.put(key, bytes, { httpMetadata: { contentType: tipo } });
  return { key, tipo, tamanho: bytes.byteLength };
}

/** Lê os bytes para a rota de exibição servir ao navegador. `null` quando
 *  o objeto não existe (chave errada, já foi apagado, ou — sem o binding
 *  `FOTOS` — quando o ambiente não tem R2 habilitado). Tratado igual a
 *  "não encontrada": a peça continua com a URL externa como retrato, e
 *  nenhuma rota que só lê quebra por falta do bucket. */
export async function lerFoto(env, key) {
  if (!key || !env.FOTOS) return null;
  const obj = await env.FOTOS.get(key);
  if (!obj) return null;
  return { corpo: obj.body, tipo: obj.httpMetadata?.contentType || 'application/octet-stream', tamanho: obj.size };
}

/** Apaga sem reclamar se já não existir — apagar o que não existe não é
 *  erro aqui, é o estado final que se queria de qualquer forma. Sem o
 *  binding `FOTOS`, mesma lógica: não há bytes para apagar. */
export async function apagarFoto(env, key) {
  if (!key || !env.FOTOS) return;
  await env.FOTOS.delete(key);
}
