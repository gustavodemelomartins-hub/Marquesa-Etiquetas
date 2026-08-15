/** Chave única compartilhada — não é um sistema de contas, é uma senha de
 *  acesso ao painel. Proporcional a uma ferramenta interna de uma pessoa só;
 *  não confundir com autenticação de verdade se este projeto crescer. */
export function checarChave(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const chave = auth.replace(/^Bearer\s+/i, '').trim();
  return chave && chave === env.API_KEY;
}

export function respostaNaoAutorizada() {
  return json({ erro: 'Chave de acesso ausente ou incorreta.' }, 401);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS });
}
