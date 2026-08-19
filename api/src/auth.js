/** Chave única compartilhada — não é um sistema de contas, é uma senha de
 *  acesso ao painel. Proporcional a uma ferramenta interna de uma pessoa só;
 *  não confundir com autenticação de verdade se este projeto crescer. */
/** Remove um BOM (U+FEFF) do início, se houver. `wrangler secret put`
 *  rodado no Windows às vezes grava o segredo com esse caractere na
 *  frente — artefato de como o Wrangler lê o stdin nesse ambiente, não do
 *  valor que a pessoa digitou. Sem isto, um secret gravado assim nunca
 *  bate com a chave que a pessoa cola no painel, e o erro parece "chave
 *  errada" quando na verdade é "byte invisível a mais". */
function semBom(s) {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function checarChave(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const chave = auth.replace(/^Bearer\s+/i, '').trim();
  const apiKey = semBom(String(env.API_KEY || ''));
  return chave && apiKey && chave === apiKey;
}

export function respostaNaoAutorizada() {
  return json({ erro: 'Chave de acesso ausente ou incorreta.' }, 401);
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Só os endereços do painel podem chamar a API pelo navegador.
 *  ORIGENS_PERMITIDAS é uma lista separada por vírgula; sem ela, libera
 *  geral — aceitável apenas em desenvolvimento local. */
export function corsHeaders(req, env) {
  const permitidas = String((env && env.ORIGENS_PERMITIDAS) || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const origem = (req && req.headers.get('Origin')) || '';
  const permitir = permitidas.length
    ? (permitidas.includes(origem) ? origem : permitidas[0])
    : '*';
  return {
    'Access-Control-Allow-Origin': permitir,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** Aplica o CORS na resposta pronta — um lugar só, sem espalhar pelo roteador. */
export function comCors(resp, req, env) {
  const out = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(corsHeaders(req, env))) out.headers.set(k, v);
  return out;
}
