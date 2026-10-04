/** Foto da cliente (avatar do Instagram) — regras, banco, R2 e resiliência.
 *
 *  Sem rede, sem Worker, sem Instagram: o módulo `api/src/cliente-avatar.js`
 *  roda contra um SQLite em memória (node:sqlite) montado com o MESMO
 *  `schema.sql`, um R2 de mentira e um `fetch` injetado. Rodar:
 *      node src/cliente-avatar-test.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  pontuar, tokens, tipoPorBytes, baixarImagem, urlImagemValida, filaDeBusca, registrarCandidatos,
  sugestaoDaCliente, decidirCandidato, removerAvatar, anexarAvatares, servirAvatar, resumoAvatares,
  limparHandle, chaveAvatar, AVATAR_MAX_BYTES,
} from '../api/src/cliente-avatar.js';
import { normalizarNomeCliente } from '../api/src/vendas-historico-normalizar.js';

let falhas = 0, total = 0;
const ok = (t) => { total++; console.log(`  ok   ${t}`); };
const bad = (t, x = '') => { total++; falhas++; console.log(`  FALHA ${t}  → ${x}`); };
const eq = (t, a, b) => (JSON.stringify(a) === JSON.stringify(b) ? ok(t) : bad(t, `esperava ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`));
const sec = (t) => console.log(`\n=== ${t} ===`);

const ler = (f) => readFileSync(new URL(`../api/${f}`, import.meta.url), 'utf8');

/* D1 de mentira por cima do node:sqlite — a mesma interface que o módulo usa. */
function d1(raw) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => raw.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: raw.prepare(sql).all(...args) }),
    run: async () => { raw.prepare(sql).run(...args); return { success: true }; },
    _run: () => raw.prepare(sql).run(...args),
  });
  return { prepare: (s) => stmt(s), batch: async (l) => { raw.exec('BEGIN'); try { l.forEach((x) => x._run()); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } } };
}
const novoBanco = () => { const raw = new DatabaseSync(':memory:'); raw.exec(ler('schema.sql')); return { raw, db: d1(raw) }; };

function r2() {
  const o = new Map();
  return { o, puts: 0, async put(k, b, opts) { this.puts++; o.set(k, { body: b, httpMetadata: opts.httpMetadata, size: b.byteLength }); },
    async get(k) { return o.get(k) ?? null; }, async delete(k) { o.delete(k); } };
}
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(2000).fill(7)]).buffer;
const resp = (corpo, status = 200) => async () => new Response(corpo, { status });
const PIC = (n) => `https://scontent-gru1-${n}.cdninstagram.com/v/t51/foto${n}.jpg`;
const env = (extra = {}) => ({ API_KEY: 'chave-de-teste', FOTOS: r2(), ...extra });
const cli = (raw, nome, extra = {}) => Number(raw.prepare(
  `INSERT INTO clientes (nome, nome_norm, instagram) VALUES (?, ?, ?)`).run(nome, normalizarNomeCliente(nome), extra.instagram ?? null).lastInsertRowid);
const perfil = (username, full_name, n = 1) => ({ user_id: `${n}00${n}`, username, full_name, profile_pic_url: PIC(n) });

sec('1. Pontuação — nome, ordem, acento, abreviação, homônimo');
{
  eq('nome completo idêntico', pontuar('Kamila Pereira', { username: 'kamilapereira', full_name: 'Kamila Pereira' }).score >= 0.9, true);
  eq('acento e caixa não atrapalham', pontuar('Vitória Conceição', { username: 'vi', full_name: 'VITORIA CONCEICAO' }).motivo, 'nome_completo');
  eq('ordem trocada pontua menos', pontuar('Pereira Kamila', { username: 'x', full_name: 'Kamila Pereira' }).motivo, 'ordem_diferente');
  eq('abreviação razoável (K. Pereira) passa, mas fraca', pontuar('Kamila Pereira', { username: 'x', full_name: 'K. Pereira' }), { score: 0.7, motivo: 'abreviacao' });
  eq('partículas (de/da) são ignoradas', pontuar('Maria da Silva', { username: 'x', full_name: 'Maria Silva' }).score >= 0.9, true);
  eq('só o primeiro nome NÃO é evidência', pontuar('Kamila Pereira', { username: 'kamila', full_name: 'Kamila Souza' }).score < 0.6, true);
  eq('só o sobrenome NÃO é evidência', pontuar('Kamila Pereira', { username: 'x', full_name: 'Joana Pereira' }).score < 0.6, true);
  eq('cliente de nome único nunca pontua', pontuar('Kamila', { username: 'kamila', full_name: 'Kamila' }).score, 0);
  eq('sem nome público: username com primeiro+último vale pouco', pontuar('Kamila Pereira', { username: 'kamila.pereira_', full_name: '' }).score, 0.6);
  eq('sem nome público e username genérico: nada', pontuar('Kamila Pereira', { username: 'loja_bonita', full_name: '' }).score, 0);
  eq('tokens tira acento/partícula', tokens('Ana de Souza'), ['ana', 'souza']);
  eq('@ do cadastro é normalizado', [limparHandle('@Loja.X'), limparHandle('https://www.instagram.com/loja.x/'), limparHandle('nome com espaço')], ['loja.x', 'loja.x', null]);
}

sec('2. Migration — aditiva, idempotente, reversível, sem tocar em clientes');
{
  const { raw, db } = novoBanco();
  const id = cli(raw, 'Cliente Antiga');
  raw.prepare(`INSERT INTO vendas (cliente_id, total, data, origem) VALUES (?, 10, '2026-01-01', 'balcao')`).run(id);
  const antes = { c: raw.prepare('SELECT COUNT(*) n FROM clientes').get().n, v: raw.prepare('SELECT COUNT(*) n FROM vendas').get().n };
  raw.exec(ler('migracao-cliente-avatar-rollback.sql'));
  eq('rollback remove as 3 tabelas', raw.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'cliente_avatar%'`).get().n, 0);
  eq('rollback preserva clientes e vendas', { c: raw.prepare('SELECT COUNT(*) n FROM clientes').get().n, v: raw.prepare('SELECT COUNT(*) n FROM vendas').get().n }, antes);
  const linhas = [{ clienteId: id }];
  await anexarAvatares(db, env(), linhas);
  eq('SEM a migration, a lista segue igual (sem erro, sem foto)', linhas, [{ clienteId: id }]);
  raw.exec(ler('migracao-cliente-avatar.sql'));
  raw.exec(ler('migracao-cliente-avatar.sql'));
  eq('migration aplicada duas vezes (idempotente)', raw.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'cliente_avatar%' AND type='table'`).get().n, 3);
  eq('migration não altera clientes/vendas', { c: raw.prepare('SELECT COUNT(*) n FROM clientes').get().n, v: raw.prepare('SELECT COUNT(*) n FROM vendas').get().n }, antes);
  eq('colunas de clientes intactas', raw.prepare(`SELECT COUNT(*) n FROM pragma_table_info('clientes')`).get().n, 16);
}

sec('3. Cliente sem avatar / com avatar confirmado');
{
  const { raw, db } = novoBanco(); const e = env();
  const a = cli(raw, 'Kamila Pereira'), b = cli(raw, 'Joana Lima');
  let linhas = [{ clienteId: a }, { clienteId: b }];
  await anexarAvatares(db, e, linhas);
  eq('sem avatar: nenhum campo extra (a tela mostra iniciais)', linhas, [{ clienteId: a }, { clienteId: b }]);
  await registrarCandidatos(db, { clienteId: a, resultado: 'ok', candidatos: [perfil('kamilapereira', 'Kamila Pereira')] });
  linhas = [{ clienteId: a }, { clienteId: b }];
  await anexarAvatares(db, e, linhas);
  eq('candidato aguardando: avatarSugestao, ainda sem foto', [linhas[0].avatarSugestao, linhas[0].avatarUrl, linhas[1].avatarSugestao], [true, undefined, undefined]);
  const s = await sugestaoDaCliente(db, a);
  const r = await decidirCandidato(db, e, a, { candidatoId: s.sugestao.candidatoId, acao: 'confirmar' }, resp(JPEG));
  eq('confirmação ok', r.status, 200);
  eq('bytes foram para o R2 em clientes/<id>/avatar', [...e.FOTOS.o.keys()], [chaveAvatar(a)]);
  eq('tipo gravado no R2', e.FOTOS.o.get(chaveAvatar(a)).httpMetadata.contentType, 'image/jpeg');
  const row = raw.prepare('SELECT * FROM cliente_avatar WHERE cliente_id = ?').get(a);
  eq('banco: username, user id, source, chave', [row.instagram_username, row.instagram_user_id, row.source, row.r2_key], ['kamilapereira', '1001', 'instagram', 'clientes/' + a + '/avatar']);
  eq('banco: confirmed_at e updated_at preenchidos', !!row.confirmed_at && !!row.updated_at, true);
  linhas = [{ clienteId: a }, { clienteId: b }];
  await anexarAvatares(db, e, linhas);
  eq('com foto confirmada: avatarUrl assinada; sem sugestão pendente', [/^\/api\/clientes\/\d+\/avatar\?exp=\d+&sig=[0-9a-f]+&v=\d+$/.test(linhas[0].avatarUrl), linhas[0].avatarSugestao], [true, undefined]);
  const q = new URL('http://x' + linhas[0].avatarUrl).searchParams;
  const servida = await servirAvatar(db, e, a, q.get('exp'), q.get('sig'));
  eq('link assinado serve a imagem', [!!servida.foto, servida.foto?.tipo], [true, 'image/jpeg']);
  eq('assinatura adulterada é negada', (await servirAvatar(db, e, a, q.get('exp'), 'ff' + q.get('sig').slice(2))).negado, true);
  eq('assinatura de OUTRA cliente não vale', (await servirAvatar(db, e, b, q.get('exp'), q.get('sig'))).negado, true);
  eq('link expirado é negado', (await servirAvatar(db, e, a, '1', q.get('sig'))).negado, true);
}

sec('4. Rejeitar, próxima sugestão, não reabrir recusado');
{
  const { raw, db } = novoBanco(); const e = env();
  const a = cli(raw, 'Kamila Pereira');
  await registrarCandidatos(db, { clienteId: a, resultado: 'ok', candidatos: [
    perfil('kamila.p', 'Kamila Pereira', 1), perfil('kpereira', 'Kamila Pereira Souza', 2), perfil('kam_per', 'K Pereira', 3)] });
  let s = await sugestaoDaCliente(db, a);
  eq('mostra a de maior score primeiro, com as outras contadas', [s.sugestao.username, s.restantes], ['kamila.p', 2]);
  const n = await sugestaoDaCliente(db, a, { depoisDe: s.sugestao.candidatoId });
  eq('"Próxima sugestão" avança sem recusar ninguém', [n.sugestao.username, n.restantes], ['kpereira', 2]);
  eq('…e nada foi gravado como recusado', raw.prepare(`SELECT COUNT(*) n FROM cliente_avatar_candidato WHERE status='recusado'`).get().n, 0);
  const r = await decidirCandidato(db, e, a, { candidatoId: s.sugestao.candidatoId, acao: 'recusar' });
  eq('"Não é ela" recusa', r.status, 200);
  s = await sugestaoDaCliente(db, a);
  eq('a recusada some; segue a próxima', s.sugestao.username, 'kpereira');
  eq('recusar não grava foto nem toca no R2', [raw.prepare('SELECT COUNT(*) n FROM cliente_avatar').get().n, e.FOTOS.puts], [0, 0]);
  await registrarCandidatos(db, { clienteId: a, resultado: 'ok', candidatos: [perfil('kamila.p', 'Kamila Pereira', 1)] });
  eq('refazer a busca NÃO reabre quem foi recusado', raw.prepare(`SELECT status FROM cliente_avatar_candidato WHERE username='kamila.p'`).get().status, 'recusado');
  eq('decidir duas vezes a mesma sugestão: 409', (await decidirCandidato(db, e, a, { candidatoId: 1, acao: 'recusar' })).status, 409);
  eq('ação inválida: 400', (await decidirCandidato(db, e, a, { candidatoId: s.sugestao.candidatoId, acao: 'talvez' })).status, 400);
  eq('sugestão de outra cliente: 404', (await decidirCandidato(db, e, 999, { candidatoId: s.sugestao.candidatoId, acao: 'confirmar' })).status, 404);
  await decidirCandidato(db, e, a, { candidatoId: s.sugestao.candidatoId, acao: 'confirmar' }, resp(JPEG));
  eq('confirmar descarta as demais pendentes', raw.prepare(`SELECT COUNT(*) n FROM cliente_avatar_candidato WHERE status='pendente'`).get().n, 0);
}

sec('5. Falhas externas — Instagram fora, rate limit, sessão expirada, perfil inexistente');
{
  const { raw, db } = novoBanco();
  const a = cli(raw, 'Kamila Pereira');
  for (const motivo of ['instagram_indisponivel', 'rate_limit', 'sessao_expirada']) {
    const r = await registrarCandidatos(db, { clienteId: a, resultado: 'erro', erro: motivo });
    eq(`erro "${motivo}" é registrado, sem quebrar`, r.corpo.status, 'erro');
  }
  const b = raw.prepare('SELECT status, tentativas, erro FROM cliente_avatar_busca WHERE cliente_id=?').get(a);
  eq('checkpoint conta tentativas e guarda o último erro', [b.status, b.tentativas, b.erro], ['erro', 3, 'sessao_expirada']);
  eq('cliente existente/sua ficha intacta', raw.prepare('SELECT nome FROM clientes WHERE id=?').get(a).nome, 'Kamila Pereira');
  eq('erro recente não volta à fila na hora (backoff de 1h)', (await filaDeBusca(db)).length, 0);
  raw.prepare(`UPDATE cliente_avatar_busca SET consultado_em = datetime('now','-2 hours'), tentativas = 1`).run();
  eq('passada 1h e com poucas tentativas, volta à fila', (await filaDeBusca(db)).map((x) => x.id), [a]);
  raw.prepare(`UPDATE cliente_avatar_busca SET tentativas = 3`).run();
  eq('esgotadas 3 tentativas, desiste (não martela o Instagram)', (await filaDeBusca(db)).length, 0);
  const c = cli(raw, 'Fulana Inexistente');
  const r = await registrarCandidatos(db, { clienteId: c, resultado: 'ok', candidatos: [] });
  eq('perfil inexistente → sem_resultado, nada acontece', [r.corpo.status, r.corpo.candidatos], ['sem_resultado', 0]);
  eq('…e a cliente fica sem avatar nem sugestão', [raw.prepare('SELECT COUNT(*) n FROM cliente_avatar').get().n, raw.prepare('SELECT COUNT(*) n FROM cliente_avatar_candidato').get().n], [0, 0]);
  eq('sem_resultado não entra de novo na fila', (await filaDeBusca(db)).some((x) => x.id === c), false);
  eq('refazer=1 só reabre depois de 90 dias', (await filaDeBusca(db, { refazer: true })).some((x) => x.id === c), false);
  raw.prepare(`UPDATE cliente_avatar_busca SET consultado_em = datetime('now','-100 days') WHERE cliente_id = ?`).run(c);
  eq('…passados 90 dias, reabre', (await filaDeBusca(db, { refazer: true })).some((x) => x.id === c), true);
  eq('cliente inexistente: 404', (await registrarCandidatos(db, { clienteId: 999, resultado: 'ok', candidatos: [] })).status, 404);
}

sec('6. Download da foto — erro, expirada, tipo, tamanho, host, R2 ausente');
{
  const { raw, db } = novoBanco();
  const a = cli(raw, 'Kamila Pereira');
  await registrarCandidatos(db, { clienteId: a, resultado: 'ok', candidatos: [perfil('kamilapereira', 'Kamila Pereira')] });
  const id = (await sugestaoDaCliente(db, a)).sugestao.candidatoId;
  const tenta = async (e, buscar) => {
    const r = await decidirCandidato(db, e, a, { candidatoId: id, acao: 'confirmar' }, buscar);
    const intacto = raw.prepare('SELECT COUNT(*) n FROM cliente_avatar').get().n === 0
      && raw.prepare(`SELECT status FROM cliente_avatar_candidato WHERE id=?`).get(id).status === 'pendente' && (e.FOTOS?.puts ?? 0) === 0;
    return [r.status, intacto];
  };
  eq('CDN responde 403 (URL expirada): 502, nada gravado, sugestão segue pendente', await tenta(env(), resp('x', 403)), [502, true]);
  eq('rede cai no meio: 502, nada gravado', await tenta(env(), async () => { throw new Error('boom'); }), [502, true]);
  eq('resposta que não é imagem (HTML)', await tenta(env(), resp('<html>login</html>')), [502, true]);
  eq('imagem grande demais', await tenta(env(), resp(new Uint8Array(AVATAR_MAX_BYTES + 1).fill(0xff))), [502, true]);
  eq('resposta vazia', await tenta(env(), resp(new Uint8Array(0))), [502, true]);
  eq('R2 ausente (prod sem R2): 503 com mensagem clara, nada gravado', await tenta({ API_KEY: 'k' }, resp(JPEG)), [503, true]);
  eq('SSRF: URL que não é do Instagram é recusada sem buscar', [urlImagemValida('https://evil.com/x.jpg'), urlImagemValida('http://scontent.cdninstagram.com/x.jpg'), urlImagemValida('https://cdninstagram.com.evil.com/x'), urlImagemValida(PIC(1))], [false, false, false, true]);
  let chamou = false;
  eq('baixarImagem com host estranho nem chama fetch', (await baixarImagem('https://evil.com/a.jpg', async () => { chamou = true; })).erro != null && !chamou, true);
  eq('magic bytes: jpeg/png/webp/outro', [tipoPorBytes(JPEG), tipoPorBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]).buffer), tipoPorBytes(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]).buffer), tipoPorBytes(new TextEncoder().encode('GIF89a-----').buffer)], ['image/jpeg', 'image/png', 'image/webp', null]);
  const e = env();
  eq('depois da falha, tentar de novo funciona', (await decidirCandidato(db, e, a, { candidatoId: id, acao: 'confirmar' }, resp(JPEG))).status, 200);
}

sec('7. Candidatos — filtro de qualidade, homônimos, limite de dados');
{
  const { raw, db } = novoBanco();
  const a = cli(raw, 'Kamila Pereira');
  const r = await registrarCandidatos(db, { clienteId: a, resultado: 'ok', candidatos: [
    perfil('kamilapereira', 'Kamila Pereira', 1),
    perfil('kamila_souza', 'Kamila Souza', 2),                                  // só primeiro nome
    { user_id: '9', username: 'sem_foto', full_name: 'Kamila Pereira', profile_pic_url: null },
    { user_id: '8', username: 'foto_externa', full_name: 'Kamila Pereira', profile_pic_url: 'https://evil.com/a.jpg' },
    { user_id: '7', username: 'Nome Inválido!', full_name: 'Kamila Pereira', profile_pic_url: PIC(7) },
  ] });
  eq('só o candidato sólido é guardado (primeiro nome, sem foto, host falso e username inválido caem)', r.corpo.candidatos, 1);
  const col = raw.prepare(`SELECT name FROM pragma_table_info('cliente_avatar_candidato')`).all().map((x) => x.name);
  eq('privacidade: só id, username, nome e foto — sem seguidores/posts/bio', col.filter((c) => /follow|segu|post|bio|story|like|curt/i.test(c)), []);
  // homônimos
  const b = cli(raw, 'Kamila Pereira');
  const sb = await sugestaoDaCliente(db, a);
  eq('duas clientes com o mesmo nome: aviso de homônimo', /mesmo nome/.test(sb.aviso), true);
  const c = cli(raw, 'Ana Souza');
  await registrarCandidatos(db, { clienteId: c, resultado: 'ok', candidatos: [perfil('ana.souza', 'Ana Souza', 4), perfil('anasouza_', 'Ana Souza', 5)] });
  eq('dois perfis igualmente fortes: aviso, e NADA é confirmado sozinho', [/Mais de um perfil/.test((await sugestaoDaCliente(db, c)).aviso), raw.prepare('SELECT COUNT(*) n FROM cliente_avatar').get().n], [true, 0]);
  eq('nenhum score é "autoaceito": toda sugestão fica pendente', raw.prepare(`SELECT COUNT(*) n FROM cliente_avatar_candidato WHERE status <> 'pendente'`).get().n, 0);
  // o mesmo @ não vira foto de duas clientes
  const e = env();
  await decidirCandidato(db, e, c, { candidatoId: raw.prepare(`SELECT id FROM cliente_avatar_candidato WHERE username='ana.souza'`).get().id, acao: 'confirmar' }, resp(JPEG));
  const d = cli(raw, 'Ana Souza');
  await registrarCandidatos(db, { clienteId: d, resultado: 'ok', candidatos: [perfil('ana.souza', 'Ana Souza', 4)] });
  const r409 = await decidirCandidato(db, e, d, { candidatoId: raw.prepare(`SELECT id FROM cliente_avatar_candidato WHERE cliente_id=?`).get(d).id, acao: 'confirmar' }, resp(JPEG));
  eq('o mesmo @ já confirmado em outra cliente: 409 com explicação', [r409.status, /já é a foto de Ana Souza/.test(r409.corpo.erro)], [409, true]);
  // @ cadastrado
  const h = cli(raw, 'Beatriz Gomes', { instagram: '@bia.gomes' });
  await registrarCandidatos(db, { clienteId: h, resultado: 'ok', candidatos: [perfil('bia.gomes', 'Bia', 6)] });
  const sh = await sugestaoDaCliente(db, h);
  eq('@ do cadastro vira candidato forte, mas continua pedindo confirmação', [sh.sugestao.motivo, sh.sugestao.score, raw.prepare('SELECT COUNT(*) n FROM cliente_avatar WHERE cliente_id=?').get(h).n], ['cadastro', 0.9, 0]);
}

sec('8. Fila: clientes novas entram sozinhas; nome único não vai ao Instagram');
{
  const { raw, db } = novoBanco();
  const a = cli(raw, 'Kamila Pereira'), u = cli(raw, 'Marcia'), h = cli(raw, 'Dani', { instagram: 'dani.joias' });
  const f = await filaDeBusca(db, { limite: 10 });
  eq('fila: nome completo e nome único COM @ cadastrado; nome único sem @ fica de fora', f.map((x) => x.id), [a, h]);
  eq('…e a de nome único é ANUNCIADA como ignorada, não engolida', raw.prepare('SELECT status, erro FROM cliente_avatar_busca WHERE cliente_id=?').get(u), { status: 'ignorada', erro: 'nome_curto' });
  eq('o @ cadastrado viaja na fila (consulta direta, sem busca por nome)', f.find((x) => x.id === h).instagram, 'dani.joias');
  await registrarCandidatos(db, { clienteId: a, resultado: 'ok', candidatos: [] });
  const nova = cli(raw, 'Cliente Nova');   // criada DEPOIS — sem nenhum código extra
  eq('cliente criada depois entra na fila sozinha (checkpoint retoma de onde parou)', (await filaDeBusca(db)).map((x) => x.id), [h, nova]);
  eq('limite respeitado', (await filaDeBusca(db, { limite: 1 })).length, 1);
  const r = await resumoAvatares(db);
  eq('resumo para acompanhar o lote', [r.clientes, r.semResultado, r.ignoradas, r.naFila], [4, 1, 1, 2]);
}

sec('9. Substituir e remover avatar (limpeza do R2)');
{
  const { raw, db } = novoBanco(); const e = env();
  const a = cli(raw, 'Kamila Pereira');
  await registrarCandidatos(db, { clienteId: a, resultado: 'ok', candidatos: [perfil('kamila.p', 'Kamila Pereira', 1)] });
  await decidirCandidato(db, e, a, { candidatoId: 1, acao: 'confirmar' }, resp(JPEG));
  await registrarCandidatos(db, { clienteId: a, resultado: 'ok', candidatos: [perfil('kamila.novo', 'Kamila Pereira', 2)] });
  const novo = raw.prepare(`SELECT id FROM cliente_avatar_candidato WHERE username='kamila.novo'`).get().id;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(300).fill(1)]).buffer;
  await decidirCandidato(db, e, a, { candidatoId: novo, acao: 'confirmar' }, resp(png));
  eq('substituir sobrescreve o MESMO objeto (sem lixo no bucket)', [[...e.FOTOS.o.keys()].length, e.FOTOS.o.get(chaveAvatar(a)).httpMetadata.contentType], [1, 'image/png']);
  eq('uma linha por cliente, já com o novo @', raw.prepare('SELECT instagram_username FROM cliente_avatar WHERE cliente_id=?').all(a).map((x) => x.instagram_username), ['kamila.novo']);
  eq('remover: apaga R2 e linha', [(await removerAvatar(db, e, a)).status, e.FOTOS.o.size, raw.prepare('SELECT COUNT(*) n FROM cliente_avatar').get().n], [200, 0, 0]);
  eq('remover sem foto: 404', (await removerAvatar(db, e, a)).status, 404);
  eq('cliente e histórico seguem intactos', raw.prepare('SELECT nome FROM clientes WHERE id=?').get(a).nome, 'Kamila Pereira');
}

console.log(`\n${total - falhas}/${total} asserções ok`);
process.exit(falhas ? 1 : 0);
