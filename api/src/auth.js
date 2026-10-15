/** Chave única compartilhada — não é um sistema de contas, é uma senha de
 *  acesso ao painel. Proporcional a uma ferramenta interna de uma pessoa só;
 *  não confundir com autenticação de verdade se este projeto crescer.
 *
 *  A normalização do valor (inclusive o BOM que o `wrangler secret put`
 *  grava no Windows) mora em plataforma/config.js — um lugar só, para que
 *  nenhum módulo leia o mesmo segredo de um jeito diferente. */
import { lerConfig } from './plataforma/config.js';

export function checarChave(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const chave = auth.replace(/^Bearer\s+/i, '').trim();
  /* Fail-closed: sem chave no servidor, NADA passa. O 401 daqui é o mesmo
     para "não mandou chave", "mandou a errada" e "o servidor não tem chave
     configurada" — de propósito: quem ainda não provou quem é não recebe
     diagnóstico da configuração do servidor. Esse caso aparece no log, via
     registrarBloqueios. */
  const apiKey = lerConfig(env).api.chave;
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
  const permitidas = lerConfig(env || {}).cors.origensPermitidas;
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
