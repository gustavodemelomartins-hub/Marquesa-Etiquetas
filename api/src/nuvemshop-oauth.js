/** Troca da instalação do app de parceiro pelo access_token da loja.
 *
 *  Só existe porque o caminho "Aplicativo sob medida" (token direto no
 *  painel da loja) não está disponível — provavelmente por causa do plano
 *  dela. Um app de parceiro/OAuth pede um passo a mais: o dono da loja
 *  autoriza o app, a Nuvemshop devolve um código de uso único (5 minutos de
 *  validade), e é esse código que se troca pelo token de verdade.
 *
 *  Fluxo: https://tiendanube.github.io/api-documentation/authentication
 */
const USER_AGENT = 'Marquesa Semijoias (contato via github.com/gustavodemelomartins-hub/Marquesa-Etiquetas)';

/** GET /api/nuvemshop/callback?code=...
 *
 *  Endereço que se cola no campo "URL de redirecionamento" da Configuração
 *  do app, no painel de parceiro. Fica FORA da chave da API de propósito:
 *  quem chama aqui é o navegador dela vindo da Nuvemshop, não o dashboard,
 *  e não carrega o Bearer da API_KEY — carrega o `code` que prova que foi
 *  ela mesma quem autorizou.
 *
 *  Não grava nada sozinho. Devolve o token numa página para copiar à mão
 *  para os Secrets — colar automaticamente exigiria a API da Cloudflare, e
 *  aqui vale o mesmo princípio do resto do sistema: chave de acesso não é
 *  algo que se move sozinho de um lugar para o outro. */
export async function trocarCodigoPorToken(env, code) {
  const clientId = String(env.NUVEMSHOP_CLIENT_ID || '').trim();
  const clientSecret = String(env.NUVEMSHOP_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    return html(erroPagina('Faltam NUVEMSHOP_CLIENT_ID e/ou NUVEMSHOP_CLIENT_SECRET nos Secrets do Worker. '
      + 'Eles vêm da tela "Chaves de acesso" do app, no painel de parceiro — App ID e Client Secret.'));
  }
  if (!code) {
    return html(erroPagina('Faltou o código na URL. Volte ao painel da loja e clique em autorizar de novo — '
      + 'o código vale só 5 minutos, então se demorou, é só refazer.'));
  }

  // NUVEMSHOP_AUTH_BASE existe só para o teste apontar para uma loja de
  // mentira local; fora do teste ninguém define e vale o endereço real.
  const base = String(env.NUVEMSHOP_AUTH_BASE || 'https://www.tiendanube.com').replace(/\/+$/, '');
  const resp = await fetch(`${base}/apps/authorize/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code }),
  });
  const corpo = await resp.json().catch(() => null);

  if (!resp.ok || !corpo || !corpo.access_token) {
    const motivo = (corpo && (corpo.error_description || corpo.message)) || `HTTP ${resp.status}`;
    return html(erroPagina(`A Nuvemshop recusou a troca: ${motivo}. `
      + 'O código de autorização vale só 5 minutos — se a página demorou a abrir, volte e autorize de novo.'));
  }

  return html(sucessoPagina(corpo.access_token, corpo.user_id, corpo.scope));
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const html = corpo => new Response(pagina(corpo), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

function pagina(corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conexão com a Nuvemshop</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#2b1e22;line-height:1.55}
  h1{font-size:22px}
  code{background:#f3e9ec;padding:2px 7px;border-radius:5px;font-size:14px;word-break:break-all}
  .campo{background:#fff;border:1px solid #e6d8dc;border-radius:10px;padding:14px 16px;margin:14px 0}
  .campo b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a5a68;margin-bottom:6px}
  .aviso{background:#fdf3e0;border:1px solid #f0d9a8;border-radius:10px;padding:14px 16px;margin:20px 0;font-size:14px}
  .erro{background:#fbe9e9;border:1px solid #f0b8b8}
</style></head><body>${corpo}</body></html>`;
}

function sucessoPagina(token, storeId, scope) {
  return `
  <h1>✓ Autorizado — copie os dois valores abaixo</h1>
  <p>Cole cada um no Secret correspondente do Worker (Cloudflare → seu Worker
  → Settings → Variables and Secrets):</p>
  <div class="campo"><b>NUVEMSHOP_TOKEN</b><code>${esc(token)}</code></div>
  <div class="campo"><b>NUVEMSHOP_STORE_ID</b><code>${esc(storeId)}</code></div>
  <div class="aviso">
    <b>Permissões concedidas:</b> ${esc(scope || '(não informado)')}<br><br>
    Depois de colar os dois, esta página não serve mais para nada — pode fechar.
    O código que trouxe você até aqui já foi usado e não funciona de novo.
  </div>`;
}

function erroPagina(motivo) {
  return `<h1>Não consegui concluir</h1><div class="aviso erro">${esc(motivo)}</div>`;
}
