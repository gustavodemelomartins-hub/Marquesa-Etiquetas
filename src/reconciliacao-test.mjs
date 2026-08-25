/** Motor de reconciliação — backend do fluxo Review → Apply, para as três
 *  origens: `nuvemshop`, `planilha_estoque_total`, `planilha_produtos_novos`.
 *
 *  Prova o que docs/RECONCILIATION_ENGINE.md promete: as duas preconditions,
 *  a diferença entre `obsoleto` e `erro`, a aplicação parcial, a
 *  idempotência (sessão E item), pendente e rejeitado nunca aplicados, que
 *  `forcar` nunca é usado por este motor, e as regras novas da planilha
 *  (fonte da verdade do total, consignação nunca quebrada, SKU existente
 *  nunca tocado por "produtos novos").
 *
 *  Todo teste passa pela API do Worker local — nada aqui fala com a
 *  Nuvemshop de verdade (só `loja-falsa.mjs`) nem com produção.
 *
 *  Alguns cenários de concorrência para `ajuste_qtd` (§6b/6c/11) semeiam a
 *  sessão e o item DIRETO no mesmo SQLite local que o Worker já está
 *  usando (`wrangler d1 execute --local`, sem `--persist-to`, no diretório
 *  `api/` — o mesmo estado que `wrangler dev --local` usa por padrão), só
 *  para isolar a corrida do resto do fluxo. Da aprovação em diante, é tudo
 *  API — a mesma rota que qualquer outro item usa.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

const API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async r => ({ status: r.status, corpo: await r.json() }));

/* --------------------------------------------------- inserção direta no D1
 * Só usada para semear o item `ajuste_qtd` (ver comentário do topo). */
const API_DIR = join(process.cwd(), 'api');
const SCRATCH = mkdtempSync(join(tmpdir(), 'marquesa-rec-test-'));
let contadorSql = 0;
function rodarSql(sql) {
  const f = join(SCRATCH, `q-${contadorSql++}.sql`);
  writeFileSync(f, sql, 'utf8');
  const out = execFileSync(
    'npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--file', f, '--json'],
    { cwd: API_DIR, encoding: 'utf8', shell: true },
  );
  const bloco = out.match(/\[[\s\S]*\]/);
  return bloco ? JSON.parse(bloco[0])[0].results : [];
}

/* ------------------------------------------------------------------ setup */

const loja = await subirLojaFalsa();
console.log('loja falsa em ' + loja.url);

async function importar(produtos) {
  const r = await api('POST', '/api/produtos/importar', { produtos });
  if (r.status !== 200 && r.status !== 201) throw new Error('importar falhou: ' + JSON.stringify(r.corpo));
}

/* =========================================================================
   1. FLUXO FELIZ — estoque_loja sem variação
   ========================================================================= */
console.log('\n=== 1. fluxo feliz: preview → aprovar → aplicar → aplicado ===');

await importar([{ sku: 'REC1', desc: 'Colar REC1', cat: 'Colar', preco: 50, qtd: 5 }]);
loja.estado.produtos.push(produtoFalso(101, [{ id: 1011, sku: 'REC1', estoque: 10 }]));

let r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
eq('sessão criada (201/200)', r.status < 300, 'true');
const sessao1 = r.corpo;
eq('sessão nasce em revisao', sessao1.status, 'revisao');
eq('tem 1 item (REC1: loja diz 10, nós dizemos 5)', sessao1.itens.length, 1);
const item1 = sessao1.itens[0];
eq('item pendente', item1.status, 'pendente');
eq('de = 10 (o que a loja tinha)', item1.de, '10');
eq('para = 5 (o que empurraríamos)', item1.para, '5');

r = await api('POST', `/api/reconciliacao/${sessao1.id}/itens/${item1.id}/aprovar`);
eq('aprovar deu ok', r.corpo.ok, 'true');

r = await api('POST', `/api/reconciliacao/${sessao1.id}/aplicar`);
eq('aplicar deu status aplicada', r.corpo.status, 'aplicada');
eq('1 aplicado, 0 obsoleto, 0 erro', `${r.corpo.aplicados}/${r.corpo.obsoletos}/${r.corpo.erros}`, '1/0/0');

const escritaREC1 = loja.estado.escritas.find(e => e.id === 101);
eq('o PATCH chegou na loja falsa', !!escritaREC1, 'true');
eq('valor mandado foi absoluto (5), não incremento', escritaREC1.variants[0].inventory_levels[0].stock, 5);

r = await api('GET', `/api/reconciliacao/${sessao1.id}`);
eq('item marcado aplicado', r.corpo.itens[0].status, 'aplicado');
eq('sessão marcada aplicada', r.corpo.status, 'aplicada');
eq('aplicadaEm foi gravado', !!r.corpo.aplicadaEm, 'true');

/* =========================================================================
   2. FLUXO FELIZ — estoque_loja COM variação (endereça a variante certa)
   ========================================================================= */
console.log('\n=== 2. fluxo feliz: variação — só a variante certa muda ===');

await importar([{ sku: 'RECVAR', desc: 'Anel RECVAR', cat: 'Anel', preco: 80, qtd: 5 }]);
loja.estado.produtos.push({
  id: 102, name: { pt: 'Anel RECVAR' }, handle: { pt: 'anel-recvar' }, published: true,
  attributes: [{ pt: 'Aro' }],
  variants: [
    { id: 1021, sku: 'RECVAR', values: [{ pt: '14' }], inventory_levels: [{ location_id: 'LOC1', stock: 3 }] },
    { id: 1022, sku: 'RECVAR', values: [{ pt: '16' }], inventory_levels: [{ location_id: 'LOC1', stock: 2 }] },
  ],
});

// primeira rodada (não seca): semeia sozinha, porque a soma da loja (3+2)
// bate com o nosso total (5) e o código está virgem.
let semear = await api('POST', '/api/sync', {});
eq('a semeadura rodou sem erro', semear.corpo.ok, 'true');
eq('RECVAR foi semeado', (semear.corpo.semeados || []).some(s => s.sku === 'RECVAR'), 'true');

// drift: alguém vende 1 peça do aro 14, só aqui — a loja continua achando
// que tem 3.
r = await api('POST', '/api/produtos/RECVAR/movimento', { tipo: 'ajuste', quantidade: -1, variacao: '14', obs: 'venda avulsa' });
eq('ajuste na variação aplicado', r.status < 300, 'true');

r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessao2 = r.corpo;
eq('1 item de variação (as outras não mudaram)', sessao2.itens.length, 1);
const item2 = sessao2.itens[0];
eq('é a variação certa (14)', item2.variacao, '14');
eq('de = 3 (loja) / para = 2 (nosso saldo novo)', `${item2.de}/${item2.para}`, '3/2');

// Nome é dado editável da loja; o endereço congelado é o variant_id. Renomear
// entre análise e Apply não pode mandar a mudança para outra caixinha.
loja.estado.produtos.find(p => p.id === 102).variants.find(v => v.id === 1021).values[0].pt = '14 renomeado';

await api('POST', `/api/reconciliacao/${sessao2.id}/itens/${item2.id}/aprovar`);
r = await api('POST', `/api/reconciliacao/${sessao2.id}/aplicar`);
eq('aplicou', r.corpo.status, 'aplicada');

const variante16 = loja.estado.produtos.find(p => p.id === 102).variants.find(v => v.id === 1022);
eq('a variação 16 (irmã) NÃO foi tocada', variante16.inventory_levels[0].stock, 2);
const variante14 = loja.estado.produtos.find(p => p.id === 102).variants.find(v => v.id === 1021);
eq('a variação 14 foi para 2', variante14.inventory_levels[0].stock, 2);

/* =========================================================================
   2b. VARIANT_ID TROCOU — mesmo nome não autoriza recasar
   ========================================================================= */
console.log('\n=== 2b. mesmo nome, outro variant_id → obsoleto, nunca escreve ===');

// Cria uma nova divergência na mesma peça e congela o id 1021 na sessão.
r = await api('POST', '/api/produtos/RECVAR/movimento', { tipo: 'ajuste', quantidade: -1, variacao: '14', obs: 'novo drift' });
eq('novo ajuste aplicado', r.status < 300, 'true');
r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessao2b = r.corpo;
const item2b = sessao2b.itens.find(i => i.sku === 'RECVAR');
await api('POST', `/api/reconciliacao/${sessao2b.id}/itens/${item2b.id}/aprovar`);

// A loja reutilizou o MESMO nome num id novo. Casar pelo nome aplicaria na
// variante errada; casar pelo id congelado torna a proposta obsoleta.
variante14.id = 9099;
const escritasAntes2b = loja.estado.escritas.length;
r = await api('POST', `/api/reconciliacao/${sessao2b.id}/aplicar`);
eq('ficou aplicada_parcial', r.corpo.status, 'aplicada_parcial');
eq('item ficou obsoleto', r.corpo.obsoletos, 1);
eq('nenhum PATCH saiu para o id novo', loja.estado.escritas.length, escritasAntes2b);
eq('estoque da loja ficou intacto', variante14.inventory_levels[0].stock, 2);

// Volta a fixture ao estado neutro para os cenários seguintes.
variante14.id = 1021;
await api('POST', '/api/produtos/RECVAR/movimento', { tipo: 'ajuste', quantidade: 1, variacao: '14', obs: 'restaura fixture' });

/* =========================================================================
   3. PRECONDITION A — destino mudou → obsoleto, nenhum PATCH
   ========================================================================= */
console.log('\n=== 3. destino mudou entre a análise e o apply → obsoleto, sem PATCH ===');

await importar([{ sku: 'REC3', desc: 'Colar REC3', cat: 'Colar', preco: 30, qtd: 8 }]);
loja.estado.produtos.push(produtoFalso(103, [{ id: 1031, sku: 'REC3', estoque: 20 }]));

r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessao3 = r.corpo;
const item3 = sessao3.itens.find(i => i.sku === 'REC3');
eq('de = 20 na análise', item3.de, '20');
await api('POST', `/api/reconciliacao/${sessao3.id}/itens/${item3.id}/aprovar`);

// alguém mexeu na loja DEPOIS da análise, ANTES do apply
loja.estado.produtos.find(p => p.id === 103).variants[0].inventory_levels[0].stock = 99;

const escritasAntes3 = loja.estado.escritas.length;
r = await api('POST', `/api/reconciliacao/${sessao3.id}/aplicar`);
eq('sessão terminou aplicada_parcial', r.corpo.status, 'aplicada_parcial');
eq('0 aplicado, 1 obsoleto, 0 erro', `${r.corpo.aplicados}/${r.corpo.obsoletos}/${r.corpo.erros}`, '0/1/0');
eq('nenhum PATCH novo foi enviado', loja.estado.escritas.length, escritasAntes3);

r = await api('GET', `/api/reconciliacao/${sessao3.id}`);
eq('item ficou obsoleto (não erro)', r.corpo.itens.find(i => i.sku === 'REC3').status, 'obsoleto');
eq('a loja continua com o valor que alguém pôs (99) — o motor não escreveu por cima', loja.estado.produtos.find(p => p.id === 103).variants[0].inventory_levels[0].stock, 99);

/* =========================================================================
   4. PRECONDITION B — origem mudou → obsoleto, loja não é alterada
   ========================================================================= */
console.log('\n=== 4. origem mudou (venda interna) entre a análise e o apply → obsoleto ===');

await importar([{ sku: 'REC4', desc: 'Colar REC4', cat: 'Colar', preco: 30, qtd: 8 }]);
loja.estado.produtos.push(produtoFalso(104, [{ id: 1041, sku: 'REC4', estoque: 20 }]));

r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessao4 = r.corpo;
const item4 = sessao4.itens.find(i => i.sku === 'REC4');
await api('POST', `/api/reconciliacao/${sessao4.id}/itens/${item4.id}/aprovar`);

// destino (loja) NÃO muda — só o lado de cá: uma venda de 3 peças
await api('POST', '/api/produtos/REC4/movimento', { tipo: 'venda', quantidade: 3, obs: 'venda simulada' });

const escritasAntes4 = loja.estado.escritas.length;
r = await api('POST', `/api/reconciliacao/${sessao4.id}/aplicar`);
eq('sessão aplicada_parcial', r.corpo.status, 'aplicada_parcial');
eq('0 aplicado, 1 obsoleto, 0 erro', `${r.corpo.aplicados}/${r.corpo.obsoletos}/${r.corpo.erros}`, '0/1/0');
eq('a precondition A sozinha teria passado (loja não mudou) — mas a B pegou', loja.estado.produtos.find(p => p.id === 104).variants[0].inventory_levels[0].stock, 20);
eq('nenhum PATCH foi enviado', loja.estado.escritas.length, escritasAntes4);

/* =========================================================================
   4b. RECUPERAÇÃO DE PATCH — destino já é "para" e a origem continua
   válida → recuperação idempotente, SEM reenviar o PATCH
   ========================================================================= */
console.log('\n=== 4b. destino já é "para" (PATCH de uma tentativa anterior) → recupera sem reenviar ===');

await importar([{ sku: 'REC4B', desc: 'Colar REC4B', cat: 'Colar', preco: 30, qtd: 8 }]);
loja.estado.produtos.push(produtoFalso(1042, [{ id: 10421, sku: 'REC4B', estoque: 20 }]));

r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessao4b = r.corpo;
const item4b = sessao4b.itens.find(i => i.sku === 'REC4B');
eq('de = 20, para = 8', `${item4b.de}/${item4b.para}`, '20/8');
await api('POST', `/api/reconciliacao/${sessao4b.id}/itens/${item4b.id}/aprovar`);

// Simula "o PATCH de uma tentativa anterior já chegou na loja, mas o
// Worker morreu antes de gravar o status do item" — sem passar pelo Apply,
// só mexendo direto no estado observável da loja (o Apply não sabe, e não
// precisa saber, COMO o destino chegou a esse valor).
loja.estado.produtos.find(p => p.id === 1042).variants[0].inventory_levels[0].stock = 8;

const escritasAntes4b = loja.estado.escritas.length;
r = await api('POST', `/api/reconciliacao/${sessao4b.id}/aplicar`);
eq('sessão aplicada (recuperação conta como sucesso)', r.corpo.status, 'aplicada');
eq('1 aplicado, 0 obsoleto, 0 erro', `${r.corpo.aplicados}/${r.corpo.obsoletos}/${r.corpo.erros}`, '1/0/0');
eq('NENHUM PATCH novo foi enviado — só confirmou o que já estava lá', loja.estado.escritas.length, escritasAntes4b);

r = await api('GET', `/api/reconciliacao/${sessao4b.id}`);
eq('item terminou aplicado', r.corpo.itens.find(i => i.sku === 'REC4B').status, 'aplicado');

/* =========================================================================
   4c. destino já é "para", MAS a origem mudou → NÃO conclui aplicado
   sozinho (obsoleto — não dá para confirmar que foi este Apply)
   ========================================================================= */
console.log('\n=== 4c. destino já é "para", mas a origem mudou → obsoleto, não recupera silenciosamente ===');

await importar([{ sku: 'REC4C', desc: 'Colar REC4C', cat: 'Colar', preco: 30, qtd: 8 }]);
loja.estado.produtos.push(produtoFalso(1043, [{ id: 10431, sku: 'REC4C', estoque: 20 }]));

r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessao4c = r.corpo;
const item4c = sessao4c.itens.find(i => i.sku === 'REC4C');
await api('POST', `/api/reconciliacao/${sessao4c.id}/itens/${item4c.id}/aprovar`);

// destino coincidentemente já é "para" (8) — mas por um motivo QUALQUER,
// não porque foi este Apply. E a origem também mudou de verdade (uma venda).
loja.estado.produtos.find(p => p.id === 1043).variants[0].inventory_levels[0].stock = 8;
await api('POST', '/api/produtos/REC4C/movimento', { tipo: 'venda', quantidade: 3, obs: 'venda simulada' });

const escritasAntes4c = loja.estado.escritas.length;
r = await api('POST', `/api/reconciliacao/${sessao4c.id}/aplicar`);
eq('sessão aplicada_parcial (não conclui aplicado por coincidência)', r.corpo.status, 'aplicada_parcial');
eq('0 aplicado, 1 obsoleto, 0 erro', `${r.corpo.aplicados}/${r.corpo.obsoletos}/${r.corpo.erros}`, '0/1/0');
eq('nenhum PATCH foi enviado', loja.estado.escritas.length, escritasAntes4c);

r = await api('GET', `/api/reconciliacao/${sessao4c.id}`);
eq('item obsoleto, não aplicado por acidente', r.corpo.itens.find(i => i.sku === 'REC4C').status, 'obsoleto');

/* =========================================================================
   5. DUPLA APLICAÇÃO — segunda chamada não tem efeito
   ========================================================================= */
console.log('\n=== 5. aplicar de novo uma sessão já aplicada → recusa, sem segundo efeito ===');

const escritasAntes5 = loja.estado.escritas.length;
r = await api('POST', `/api/reconciliacao/${sessao1.id}/aplicar`);
eq('segunda chamada recusada (409)', r.status, 409);
eq('nenhum PATCH novo', loja.estado.escritas.length, escritasAntes5);

/* =========================================================================
   6. DUAS CHAMADAS SIMULTÂNEAS — nenhuma duplica efeito
   ========================================================================= */
console.log('\n=== 6. duas chamadas de apply ao mesmo tempo → nenhuma duplica efeito ===');

// Desde a retomada de sessão (§10/§11 do pedido de hardening), a rota
// aceita reentrar numa sessão já 'aplicando' — então duas chamadas
// concorrentes já não são mais "uma vence, a outra 409 sempre": qual das
// duas passa primeiro é timing, não contrato. O `wrangler dev --local`
// roda num processo só, então as duas chamadas quase sempre serializam
// (uma termina, a sessão já não está mais 'revisao'/'aplicando' quando a
// outra chega, e ela recebe 409) — mas não é garantido, e o teste não pode
// depender de qual das duas ordens acontece. O que TEM que valer sempre,
// qualquer que seja o entrelaçamento: nenhuma vira erro 500, e o estado
// final é correto — um efeito só, nunca estado ambíguo.
await importar([{ sku: 'REC6', desc: 'Colar REC6', cat: 'Colar', preco: 30, qtd: 8 }]);
loja.estado.produtos.push(produtoFalso(106, [{ id: 1061, sku: 'REC6', estoque: 20 }]));
r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessao6 = r.corpo;
const item6 = sessao6.itens.find(i => i.sku === 'REC6');
await api('POST', `/api/reconciliacao/${sessao6.id}/itens/${item6.id}/aprovar`);

const [resA, resB] = await Promise.all([
  api('POST', `/api/reconciliacao/${sessao6.id}/aplicar`),
  api('POST', `/api/reconciliacao/${sessao6.id}/aplicar`),
]);
eq('nenhuma das duas quebrou (nunca 500)', [resA.status, resB.status].every(s => s < 500), 'true');

// O PATCH manda valor ABSOLUTO — se as duas chamadas genuinamente se
// entrelaçaram (cada uma faz sua própria leitura da loja, sem CAS a
// impedir, porque a proteção aqui é a natureza idempotente do PATCH, não
// um lock), é ESPERADO que mais de um PATCH tenha saído. O que importa é
// que todos concordam no mesmo valor final — nunca um "meio caminho".
const escritasREC6 = loja.estado.escritas.filter(e => e.id === 106);
eq('pelo menos um PATCH chegou na loja', escritasREC6.length >= 1, 'true');
eq('todo PATCH que chegou mandou o mesmo valor final (20→8, absoluto)', escritasREC6.every(e => e.variants[0].inventory_levels[0].stock === 8), 'true');

r = await api('GET', `/api/reconciliacao/${sessao6.id}`);
eq('item terminou aplicado (sem estado ambíguo)', r.corpo.itens.find(i => i.sku === 'REC6').status, 'aplicado');
eq('sessão terminou aplicada', r.corpo.status, 'aplicada');

/* =========================================================================
   6b. CONCORRÊNCIA REAL em ajuste_qtd — o resultado final nunca duplica,
   qualquer que seja o entrelaçamento das duas chamadas
   ========================================================================= */
console.log('\n=== 6b. duas chamadas concorrentes no MESMO item ajuste_qtd → nunca duplica ===');

await importar([{ sku: 'REC6B', desc: 'REC6B', cat: 'Colar', preco: 10, qtd: 8 }]);
let sessaoConc = null, itemConc = null;
rodarSql(`INSERT INTO reconciliacao_sessoes (origem, status) VALUES ('planilha_estoque_total', 'revisao');`);
sessaoConc = rodarSql(`SELECT id FROM reconciliacao_sessoes WHERE origem='planilha_estoque_total' AND status='revisao' ORDER BY id DESC LIMIT 1;`)[0].id;
rodarSql(
  `INSERT INTO reconciliacao_itens (sessao_id, sku, tipo, de, para, risco, motivo, status)
   VALUES (${sessaoConc}, 'REC6B', 'ajuste_qtd', '8', '13', 'confere', 'Contagem diverge.', 'pendente');`
);
itemConc = rodarSql(`SELECT id FROM reconciliacao_itens WHERE sessao_id=${sessaoConc} AND sku='REC6B';`)[0].id;
await api('POST', `/api/reconciliacao/${sessaoConc}/itens/${itemConc}/aprovar`);

const [concA, concB] = await Promise.all([
  api('POST', `/api/reconciliacao/${sessaoConc}/aplicar`),
  api('POST', `/api/reconciliacao/${sessaoConc}/aplicar`),
]);
eq('nenhuma das duas quebrou (nunca 500)', [concA.status, concB.status].every(s => s < 500), 'true');

const movsConc = await api('GET', '/api/estoque/REC6B/movimentos');
const ajustesConc = movsConc.corpo.movimentos.filter(m => m.origem === 'reconciliacao');
eq('exatamente 1 movimento, qualquer que tenha sido o entrelaçamento', ajustesConc.length, 1);
eq('produtos.qtd foi de 8 para 13, uma vez só', movsConc.corpo.saldos.qtd, 13);

r = await api('GET', `/api/reconciliacao/${sessaoConc}`);
eq('item terminou aplicado', r.corpo.itens[0].status, 'aplicado');
eq('sessão terminou aplicada', r.corpo.status, 'aplicada');

/* =========================================================================
   6c. PROVA DIRETA — o índice único do D1 local recusa mesmo, de verdade,
   dois movimentos com o MESMO reconciliacao_item_id (não é só teoria)
   ========================================================================= */
console.log('\n=== 6c. prova direta no D1: o índice único recusa dois movimentos do mesmo item ===');

await importar([{ sku: 'REC6C', desc: 'REC6C', cat: 'Colar', preco: 10, qtd: 0 }]);
rodarSql(`INSERT INTO reconciliacao_sessoes (origem, status) VALUES ('planilha_estoque_total', 'aplicada');`);
const sessao6cId = rodarSql(`SELECT id FROM reconciliacao_sessoes WHERE origem='planilha_estoque_total' AND status='aplicada' ORDER BY id DESC LIMIT 1;`)[0].id;
rodarSql(
  `INSERT INTO reconciliacao_itens (sessao_id, sku, tipo, de, para, risco, motivo, status)
   VALUES (${sessao6cId}, 'REC6C', 'ajuste_qtd', '0', '1', 'confere', 'x', 'aplicado');`
);
const item6cId = rodarSql(`SELECT id FROM reconciliacao_itens WHERE sessao_id=${sessao6cId} AND sku='REC6C';`)[0].id;

// O primeiro INSERT precisa manter a razão fechando (produtos.qtd ==
// SUM(movimentos.qtd)) — por isso a atualização de produtos.qtd vai
// JUNTO, no mesmo espírito de estoque.js › movimentar (só que direto no
// SQL, já que este teste fala com o D1 sem passar pelo Worker).
rodarSql(`INSERT INTO movimentos (sku, tipo, qtd, reconciliacao_item_id) VALUES ('REC6C', 'ajuste', 1, ${item6cId});`);
rodarSql(`UPDATE produtos SET qtd = qtd + 1 WHERE sku = 'REC6C';`);
let segundoRecusado = false, motivoRecusa = '';
try {
  rodarSql(`INSERT INTO movimentos (sku, tipo, qtd, reconciliacao_item_id) VALUES ('REC6C', 'ajuste', 1, ${item6cId});`);
} catch (e) {
  motivoRecusa = String((e && ((e.stdout || '') + (e.stderr || ''))) || e);
  segundoRecusado = /UNIQUE constraint failed/i.test(motivoRecusa);
}
eq('o D1 local RECUSA de verdade um segundo movimento com o mesmo reconciliacao_item_id', segundoRecusado, 'true');

/* =========================================================================
   7. FALHA TÉCNICA DO PATCH — item erro, sessão aplicada_parcial
   ========================================================================= */
console.log('\n=== 7. PATCH falha (Nuvemshop fora do ar) → item erro ===');

await importar([{ sku: 'REC7', desc: 'Colar REC7', cat: 'Colar', preco: 30, qtd: 8 }]);
loja.estado.produtos.push(produtoFalso(107, [{ id: 1071, sku: 'REC7', estoque: 20 }]));
r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessao7 = r.corpo;
const item7 = sessao7.itens.find(i => i.sku === 'REC7');
await api('POST', `/api/reconciliacao/${sessao7.id}/itens/${item7.id}/aprovar`);

loja.estado.falharPatchParaProduto = new Set([107]);
r = await api('POST', `/api/reconciliacao/${sessao7.id}/aplicar`);
loja.estado.falharPatchParaProduto = null;

eq('sessão aplicada_parcial (não "erro" — o Apply terminou de contabilizar)', r.corpo.status, 'aplicada_parcial');
eq('0 aplicado, 0 obsoleto, 1 erro', `${r.corpo.aplicados}/${r.corpo.obsoletos}/${r.corpo.erros}`, '0/0/1');

r = await api('GET', `/api/reconciliacao/${sessao7.id}`);
const itemErro = r.corpo.itens.find(i => i.sku === 'REC7');
eq('item em erro, não obsoleto', itemErro.status, 'erro');
eq('a mensagem de erro não vaza token', /Bearer [^*]/i.test(itemErro.erro || ''), 'false');

/* =========================================================================
   8. MISTURA — aplicado + obsoleto + erro na mesma sessão
   ========================================================================= */
console.log('\n=== 8. mistura: um aplica, um fica obsoleto, um dá erro — tudo na mesma sessão ===');

await importar([
  { sku: 'REC8A', desc: 'REC8A', cat: 'Colar', preco: 10, qtd: 5 },
  { sku: 'REC8B', desc: 'REC8B', cat: 'Colar', preco: 10, qtd: 5 },
  { sku: 'REC8C', desc: 'REC8C', cat: 'Colar', preco: 10, qtd: 5 },
]);
loja.estado.produtos.push(
  produtoFalso(1081, [{ id: 10811, sku: 'REC8A', estoque: 9 }]),
  produtoFalso(1082, [{ id: 10821, sku: 'REC8B', estoque: 9 }]),
  produtoFalso(1083, [{ id: 10831, sku: 'REC8C', estoque: 9 }]),
);

r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessao8 = r.corpo;
for (const sku of ['REC8A', 'REC8B', 'REC8C']) {
  const it = sessao8.itens.find(i => i.sku === sku);
  await api('POST', `/api/reconciliacao/${sessao8.id}/itens/${it.id}/aprovar`);
}

// A: fica como está, deve aplicar normal.
// B: destino muda por fora → obsoleto.
loja.estado.produtos.find(p => p.id === 1082).variants[0].inventory_levels[0].stock = 42;
// C: PATCH falha só para este produto.
loja.estado.falharPatchParaProduto = new Set([1083]);

r = await api('POST', `/api/reconciliacao/${sessao8.id}/aplicar`);
loja.estado.falharPatchParaProduto = null;

eq('sessão aplicada_parcial', r.corpo.status, 'aplicada_parcial');
eq('1 aplicado, 1 obsoleto, 1 erro', `${r.corpo.aplicados}/${r.corpo.obsoletos}/${r.corpo.erros}`, '1/1/1');

r = await api('GET', `/api/reconciliacao/${sessao8.id}`);
const porSku = Object.fromEntries(r.corpo.itens.map(i => [i.sku, i.status]));
eq('A aplicado', porSku.REC8A, 'aplicado');
eq('B obsoleto', porSku.REC8B, 'obsoleto');
eq('C erro', porSku.REC8C, 'erro');

/* =========================================================================
   9. REJEITADO nunca é aplicado
   ========================================================================= */
console.log('\n=== 9. item rejeitado nunca é tocado pelo apply ===');

await importar([
  { sku: 'REC9A', desc: 'REC9A', cat: 'Colar', preco: 10, qtd: 5 },
  { sku: 'REC9B', desc: 'REC9B', cat: 'Colar', preco: 10, qtd: 5 },
]);
loja.estado.produtos.push(
  produtoFalso(1091, [{ id: 10911, sku: 'REC9A', estoque: 9 }]),
  produtoFalso(1092, [{ id: 10921, sku: 'REC9B', estoque: 9 }]),
);
r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessao9 = r.corpo;
const item9A = sessao9.itens.find(i => i.sku === 'REC9A');
const item9B = sessao9.itens.find(i => i.sku === 'REC9B');
await api('POST', `/api/reconciliacao/${sessao9.id}/itens/${item9A.id}/aprovar`);
await api('POST', `/api/reconciliacao/${sessao9.id}/itens/${item9B.id}/rejeitar`);

r = await api('POST', `/api/reconciliacao/${sessao9.id}/aplicar`);
eq('só 1 item entrou no apply (o rejeitado não conta)', r.corpo.total, 1);

r = await api('GET', `/api/reconciliacao/${sessao9.id}`);
eq('B continua rejeitado', r.corpo.itens.find(i => i.sku === 'REC9B').status, 'rejeitado');
eq('B não foi escrito na loja', loja.estado.produtos.find(p => p.id === 1092).variants[0].inventory_levels[0].stock, 9);

/* =========================================================================
   10. PENDENTE nunca é aplicado implicitamente
   ========================================================================= */
console.log('\n=== 10. item pendente (nunca decidido) fica de fora do apply ===');

await importar([
  { sku: 'REC10A', desc: 'REC10A', cat: 'Colar', preco: 10, qtd: 5 },
  { sku: 'REC10B', desc: 'REC10B', cat: 'Colar', preco: 10, qtd: 5 },
]);
loja.estado.produtos.push(
  produtoFalso(10101, [{ id: 101011, sku: 'REC10A', estoque: 9 }]),
  produtoFalso(10102, [{ id: 101021, sku: 'REC10B', estoque: 9 }]),
);
r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessao10 = r.corpo;
const item10A = sessao10.itens.find(i => i.sku === 'REC10A');
// item10B fica pendente de propósito — não aprova nem rejeita
await api('POST', `/api/reconciliacao/${sessao10.id}/itens/${item10A.id}/aprovar`);

r = await api('POST', `/api/reconciliacao/${sessao10.id}/aplicar`);
eq('sessão aplicada (o pendente não vira aplicada_parcial nem erro)', r.corpo.status, 'aplicada');
eq('só 1 no total (o pendente nem contou)', r.corpo.total, 1);

r = await api('GET', `/api/reconciliacao/${sessao10.id}`);
eq('B continua pendente', r.corpo.itens.find(i => i.sku === 'REC10B').status, 'pendente');

/* =========================================================================
   11. ajuste_qtd — um único movimento, mesmo aplicando duas vezes
   ========================================================================= */
console.log('\n=== 11. ajuste_qtd: um movimento só, idempotente ===');

await importar([{ sku: 'REC11', desc: 'REC11', cat: 'Colar', preco: 10, qtd: 8 }]);

let sessaoAjusteId = null, itemAjusteId = null;
try {
  rodarSql(`INSERT INTO reconciliacao_sessoes (origem, status) VALUES ('planilha_estoque_total', 'revisao');`);
  const s = rodarSql(`SELECT id FROM reconciliacao_sessoes WHERE origem='planilha_estoque_total' AND status='revisao' ORDER BY id DESC LIMIT 1;`);
  sessaoAjusteId = s[0].id;
  rodarSql(
    `INSERT INTO reconciliacao_itens (sessao_id, sku, tipo, de, para, risco, motivo, status)
     VALUES (${sessaoAjusteId}, 'REC11', 'ajuste_qtd', '8', '11', 'confere', 'Contagem da planilha diverge do sistema.', 'pendente');`
  );
  const i = rodarSql(`SELECT id FROM reconciliacao_itens WHERE sessao_id=${sessaoAjusteId} AND sku='REC11';`);
  itemAjusteId = i[0].id;
  ok('sessão e item ajuste_qtd inseridos direto no D1 local (setup de teste)');
} catch (e) {
  bad('setup direto do D1 local falhou', String(e.stderr || e.message || e).slice(0, 200));
}

if (itemAjusteId) {
  await api('POST', `/api/reconciliacao/${sessaoAjusteId}/itens/${itemAjusteId}/aprovar`);
  r = await api('POST', `/api/reconciliacao/${sessaoAjusteId}/aplicar`);
  eq('aplicou', r.corpo.status, 'aplicada');

  const movs1 = await api('GET', '/api/estoque/REC11/movimentos');
  const ajustesReconciliacao1 = movs1.corpo.movimentos.filter(m => m.origem === 'reconciliacao');
  eq('exatamente 1 movimento de reconciliação', ajustesReconciliacao1.length, 1);
  eq('produtos.qtd foi de 8 para 11 (delta +3, uma vez)', movs1.corpo.saldos.qtd, 11);

  // segunda tentativa de aplicar a MESMA sessão: recusada no nível da
  // sessão (ela não está mais em 'revisao') — a proteção real.
  r = await api('POST', `/api/reconciliacao/${sessaoAjusteId}/aplicar`);
  eq('segunda chamada recusada', r.status, 409);

  const movs2 = await api('GET', '/api/estoque/REC11/movimentos');
  const ajustesReconciliacao2 = movs2.corpo.movimentos.filter(m => m.origem === 'reconciliacao');
  eq('ainda exatamente 1 movimento — nenhum duplicado', ajustesReconciliacao2.length, 1);
  eq('produtos.qtd continua 11', movs2.corpo.saldos.qtd, 11);

  const conferir = await api('GET', '/api/estoque/conferir');
  eq('a razão continua fechando depois do ajuste', conferir.corpo.ok, 'true');
} else {
  bad('teste 11 pulado — setup do D1 direto falhou (ver acima)');
}

/* =========================================================================
   12. `forcar` — o motor de reconciliação nunca usa
   ========================================================================= */
console.log('\n=== 12. o código do motor nunca chama forcar:true ===');

const fonteReconciliacao = readFileSync(join(process.cwd(), 'api', 'src', 'reconciliacao.js'), 'utf8');
// A palavra aparece em comentários explicando a decisão — o que não pode
// existir é o USO: `forcar` como propriedade passada para alguma chamada.
const codigoSemComentarios = fonteReconciliacao
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
eq('nenhum uso de "forcar" fora de comentário', /forcar\s*[:=]/i.test(codigoSemComentarios), 'false');

/* =========================================================================
   13. SESSÕES CONCORRENTES — nova sessão supera a antiga em revisão
   ========================================================================= */
console.log('\n=== 13. abrir sessão nova supera a antiga (mesma origem) em revisão ===');

await importar([{ sku: 'REC13', desc: 'REC13', cat: 'Colar', preco: 10, qtd: 5 }]);
loja.estado.produtos.push(produtoFalso(113, [{ id: 1131, sku: 'REC13', estoque: 9 }]));
r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessaoVelha = r.corpo;
eq('a velha nasceu em revisao', sessaoVelha.status, 'revisao');

// muda de novo, e abre outra sessão da MESMA origem sem decidir a velha
loja.estado.produtos.find(p => p.id === 113).variants[0].inventory_levels[0].stock = 15;
r = await api('POST', '/api/reconciliacao', { origem: 'nuvemshop' });
const sessaoNova = r.corpo;
eq('a nova nasceu em revisao', sessaoNova.status, 'revisao');

r = await api('GET', `/api/reconciliacao/${sessaoVelha.id}`);
eq('a velha foi superada', r.corpo.status, 'superada');

r = await api('POST', `/api/reconciliacao/${sessaoVelha.id}/itens/${sessaoVelha.itens[0]?.id ?? 0}/aprovar`);
eq('não dá mais para decidir item de uma sessão superada', r.status, 409);

/* =========================================================================
   14. Aplicar sem nenhum item aprovado → recusa
   ========================================================================= */
console.log('\n=== 14. aplicar sessão sem item aprovado nenhum → recusa ===');

r = await api('POST', `/api/reconciliacao/${sessaoNova.id}/aplicar`);
eq('recusado (400) — nada para aplicar', r.status, 400);

/* =========================================================================
   15. Cancelar sessão em revisão
   ========================================================================= */
console.log('\n=== 15. cancelar sessão em revisão ===');

r = await api('POST', `/api/reconciliacao/${sessaoNova.id}/cancelar`);
eq('cancelada', r.corpo.ok, 'true');
r = await api('GET', `/api/reconciliacao/${sessaoNova.id}`);
eq('status cancelada', r.corpo.status, 'cancelada');
r = await api('POST', `/api/reconciliacao/${sessaoNova.id}/aplicar`);
eq('não dá para aplicar sessão cancelada', r.status, 409);

/* =========================================================================
   16. RETOMADA — sessão presa em "aplicando" (simulando Worker morto no
   meio) é retomada pela MESMA rota: ignora o já aplicado, processa o resto
   ========================================================================= */
console.log('\n=== 16. sessão presa em "aplicando" é retomada — ignora aplicado, processa o resto ===');

await importar([
  { sku: 'RESUME1', desc: 'RESUME1', cat: 'Colar', preco: 10, qtd: 5 },
  { sku: 'RESUME2', desc: 'RESUME2', cat: 'Colar', preco: 10, qtd: 5 },
]);
loja.estado.produtos.push(
  produtoFalso(200, [{ id: 2001, sku: 'RESUME1', estoque: 5 }]),  // já no valor "para" — a rodada anterior aplicou de verdade
  produtoFalso(201, [{ id: 2011, sku: 'RESUME2', estoque: 10 }]), // ainda intocado
);

const baseResume = JSON.stringify({ qtd_total: 5, consignado: 0, casa: 5 });
const dadosResume1 = JSON.stringify({ produtoId: 200, varianteId: 2001 });
const dadosResume2 = JSON.stringify({ produtoId: 201, varianteId: 2011 });
rodarSql(`INSERT INTO reconciliacao_sessoes (origem, status) VALUES ('planilha_estoque_total', 'aplicando');`);
const sessaoResumeId = rodarSql(
  `SELECT id FROM reconciliacao_sessoes WHERE origem='planilha_estoque_total' AND status='aplicando' ORDER BY id DESC LIMIT 1;`
)[0].id;
// item 1: uma execução anterior (que morreu ANTES de finalizar a sessão,
// mas DEPOIS de aplicar este item) já deixou aplicado — retomar não pode
// mexer nele de novo.
rodarSql(
  `INSERT INTO reconciliacao_itens (sessao_id, sku, tipo, de, para, base_json, dados_json, risco, motivo, status)
   VALUES (${sessaoResumeId}, 'RESUME1', 'estoque_loja', '10', '5', '${baseResume}', '${dadosResume1}', 'confere', 'teste', 'aplicado');`
);
// item 2: ainda aprovado — é o que a retomada precisa processar.
rodarSql(
  `INSERT INTO reconciliacao_itens (sessao_id, sku, tipo, de, para, base_json, dados_json, risco, motivo, status)
   VALUES (${sessaoResumeId}, 'RESUME2', 'estoque_loja', '10', '5', '${baseResume}', '${dadosResume2}', 'confere', 'teste', 'aprovado');`
);

r = await api('POST', `/api/reconciliacao/${sessaoResumeId}/aplicar`);
eq('a retomada terminou aplicada', r.corpo.status, 'aplicada');
eq('2 aplicados no total da sessão (1 de antes + 1 desta retomada)', r.corpo.aplicados, 2);

const escritasRESUME1 = loja.estado.escritas.filter(e => e.id === 200);
eq('RESUME1 (já aplicado antes) não recebeu PATCH nenhum na retomada', escritasRESUME1.length, 0);
const escritasRESUME2 = loja.estado.escritas.filter(e => e.id === 201);
eq('RESUME2 (ainda aprovado) recebeu exatamente 1 PATCH', escritasRESUME2.length, 1);
eq('RESUME2 foi para 5 na loja', loja.estado.produtos.find(p => p.id === 201).variants[0].inventory_levels[0].stock, 5);

r = await api('GET', `/api/reconciliacao/${sessaoResumeId}`);
eq('os dois itens terminam aplicado', r.corpo.itens.every(i => i.status === 'aplicado'), 'true');

/* =========================================================================
   17. PLANILHA ESTOQUE TOTAL — igual, aumentar, diminuir
   ========================================================================= */
console.log('\n=== 17. planilha estoque total: igual / aumentar / diminuir ===');

await importar([
  { sku: 'ET-IGUAL', desc: 'ET-IGUAL', cat: 'Colar', preco: 10, qtd: 5 },
  { sku: 'ET-SOBE', desc: 'ET-SOBE', cat: 'Colar', preco: 10, qtd: 5 },
  { sku: 'ET-DESCE', desc: 'ET-DESCE', cat: 'Colar', preco: 10, qtd: 8 },
]);

r = await api('POST', '/api/reconciliacao/planilha/estoque-total/analisar', {
  produtos: [
    { sku: 'ET-IGUAL', qtd: 5 },
    { sku: 'ET-SOBE', qtd: 8 },
    { sku: 'ET-DESCE', qtd: 5 },
  ],
});
eq('sessão criada (planilha_estoque_total)', r.status < 300, 'true');
const sessaoET1 = r.corpo;
eq('sessão nasce em revisao', sessaoET1.status, 'revisao');
eq('só 2 itens (o igual não vira item)', sessaoET1.itens.length, 2);
eq('resumo: sem alteração = 1', sessaoET1.resumo.semAlteracao, 1);

const itemSobe = sessaoET1.itens.find(i => i.sku === 'ET-SOBE');
eq('ET-SOBE: de=5, para=8', `${itemSobe.de}/${itemSobe.para}`, '5/8');
eq('ET-SOBE tipo ajuste_qtd', itemSobe.tipo, 'ajuste_qtd');
const itemDesce = sessaoET1.itens.find(i => i.sku === 'ET-DESCE');
eq('ET-DESCE: de=8, para=5', `${itemDesce.de}/${itemDesce.para}`, '8/5');

await api('POST', `/api/reconciliacao/${sessaoET1.id}/itens/${itemSobe.id}/aprovar`);
await api('POST', `/api/reconciliacao/${sessaoET1.id}/itens/${itemDesce.id}/aprovar`);
r = await api('POST', `/api/reconciliacao/${sessaoET1.id}/aplicar`);
eq('aplicou os dois', r.corpo.status, 'aplicada');

const movET1 = await api('GET', '/api/estoque/ET-SOBE/movimentos');
eq('ET-SOBE foi para 8 pela razão', movET1.corpo.saldos.qtd, 8);
const movET2 = await api('GET', '/api/estoque/ET-DESCE/movimentos');
eq('ET-DESCE foi para 5 pela razão', movET2.corpo.saldos.qtd, 5);
eq('movimento de ET-SOBE veio da reconciliação', movET1.corpo.movimentos.some(m => m.origem === 'reconciliacao'), 'true');

/* =========================================================================
   18. PLANILHA ESTOQUE TOTAL — SKU não encontrado no catálogo
   ========================================================================= */
console.log('\n=== 18. planilha estoque total: SKU da planilha que não existe no catálogo ===');

r = await api('POST', '/api/reconciliacao/planilha/estoque-total/analisar', {
  produtos: [{ sku: 'ET-INEXISTENTE-999', qtd: 5 }],
});
eq('não vira item (este fluxo não cria produto)', r.corpo.itens.length, 0);
eq('mas é contado em "novos" no resumo', r.corpo.resumo.novos, 1);
eq('e listado nominalmente', r.corpo.resumo.naoEncontrados.includes('ET-INEXISTENTE-999'), 'true');

/* =========================================================================
   19. PLANILHA ESTOQUE TOTAL — preview obsoleto (estoque mudou depois)
   ========================================================================= */
console.log('\n=== 19. planilha estoque total: preview obsoleto ===');

await importar([{ sku: 'ET-OBS', desc: 'ET-OBS', cat: 'Colar', preco: 10, qtd: 5 }]);
r = await api('POST', '/api/reconciliacao/planilha/estoque-total/analisar', { produtos: [{ sku: 'ET-OBS', qtd: 8 }] });
const sessaoET2 = r.corpo;
const itemET2 = sessaoET2.itens[0];
eq('de=5, para=8', `${itemET2.de}/${itemET2.para}`, '5/8');
await api('POST', `/api/reconciliacao/${sessaoET2.id}/itens/${itemET2.id}/aprovar`);

// alguém mexeu no estoque depois da análise — uma venda, por exemplo
await api('POST', '/api/produtos/ET-OBS/movimento', { tipo: 'venda', quantidade: 1, obs: 'venda simulada' });

r = await api('POST', `/api/reconciliacao/${sessaoET2.id}/aplicar`);
eq('sessão aplicada_parcial', r.corpo.status, 'aplicada_parcial');
eq('0 aplicado, 1 obsoleto', `${r.corpo.aplicados}/${r.corpo.obsoletos}`, '0/1');
const movET2b = await api('GET', '/api/estoque/ET-OBS/movimentos');
eq('produtos.qtd continua 4 (só a venda mexeu, não o delta antigo)', movET2b.corpo.saldos.qtd, 4);

/* =========================================================================
   20. PLANILHA ESTOQUE TOTAL — total menor que consignado: conflito, nunca
   aplica automaticamente (mesmo se aprovado)
   ========================================================================= */
console.log('\n=== 20. planilha estoque total: total < consignado → conflito, nunca aplica ===');

await importar([{ sku: 'ET-CONS', desc: 'ET-CONS', cat: 'Colar', preco: 10, qtd: 5 }]);
r = await api('POST', '/api/revendedoras', { nome: 'Revendedora ET-CONS' });
const revEtCons = r.corpo;
r = await api('POST', '/api/maletas', { revId: revEtCons.id });
const maletaEtCons = r.corpo;
await api('POST', `/api/maletas/${maletaEtCons.id}/itens`, { itens: { 'ET-CONS': 3 } });

r = await api('POST', '/api/reconciliacao/planilha/estoque-total/analisar', { produtos: [{ sku: 'ET-CONS', qtd: 2 }] });
const sessaoET3 = r.corpo;
eq('gerou 1 item mesmo sendo conflito (visível, não engolido)', sessaoET3.itens.length, 1);
const itemET3 = sessaoET3.itens[0];
eq('risco desconhecido (sistema não sabe qual número está certo)', itemET3.risco, 'desconhecido');
eq('dados estruturados marcam o conflito', itemET3.dados && itemET3.dados.conflito, 'total_menor_que_consignado');
eq('resumo conta em críticos', sessaoET3.resumo.criticos, 1);

// aprovado MESMO ASSIM (simulando alguém que ignorou o aviso) — o Apply
// ainda tem que recusar, não é a análise que protege sozinha.
await api('POST', `/api/reconciliacao/${sessaoET3.id}/itens/${itemET3.id}/aprovar`);
r = await api('POST', `/api/reconciliacao/${sessaoET3.id}/aplicar`);
eq('mesmo aprovado, não aplica — obsoleto', r.corpo.status, 'aplicada_parcial');
eq('0 aplicado, 1 obsoleto', `${r.corpo.aplicados}/${r.corpo.obsoletos}`, '0/1');
const movET3 = await api('GET', '/api/estoque/ET-CONS/movimentos');
eq('produtos.qtd continua 5 — nada foi mexido', movET3.corpo.saldos.qtd, 5);

/* =========================================================================
   21. PLANILHA ESTOQUE TOTAL — concorrência real (mesmo item, duas chamadas)
   ========================================================================= */
console.log('\n=== 21. planilha estoque total: duas chamadas concorrentes no mesmo item → nunca duplica ===');

await importar([{ sku: 'ET-CONC', desc: 'ET-CONC', cat: 'Colar', preco: 10, qtd: 5 }]);
r = await api('POST', '/api/reconciliacao/planilha/estoque-total/analisar', { produtos: [{ sku: 'ET-CONC', qtd: 9 }] });
const sessaoET4 = r.corpo;
await api('POST', `/api/reconciliacao/${sessaoET4.id}/itens/${sessaoET4.itens[0].id}/aprovar`);

const [etA, etB] = await Promise.all([
  api('POST', `/api/reconciliacao/${sessaoET4.id}/aplicar`),
  api('POST', `/api/reconciliacao/${sessaoET4.id}/aplicar`),
]);
eq('nenhuma quebrou', [etA.status, etB.status].every(s => s < 500), 'true');
const movET4 = await api('GET', '/api/estoque/ET-CONC/movimentos');
const ajustesET4 = movET4.corpo.movimentos.filter(m => m.origem === 'reconciliacao');
eq('exatamente 1 movimento', ajustesET4.length, 1);
eq('produtos.qtd foi para 9, uma vez só', movET4.corpo.saldos.qtd, 9);

/* =========================================================================
   22. PLANILHA PRODUTOS NOVOS — novo entra, existente é ignorado por
   completo (mesmo com dados diferentes na planilha)
   ========================================================================= */
console.log('\n=== 22. planilha produtos novos: novo entra, existente é 100% ignorado ===');

await importar([{ sku: 'PN-EXISTE', desc: 'Descrição original', cat: 'Colar', preco: 77, qtd: 4 }]);
const antesPN = await api('GET', '/api/estoque/PN-EXISTE/movimentos');

r = await api('POST', '/api/reconciliacao/planilha/produtos-novos/analisar', {
  produtos: [
    { sku: 'PN-NOVO', desc: 'Peça Nova', cat: 'Colar', preco: 99, qtd: 3 },
    // mesma linha, dados TOTALMENTE diferentes do catálogo — não pode mudar nada
    { sku: 'PN-EXISTE', desc: 'Descrição da planilha (diferente!)', cat: 'Anel', preco: 1, qtd: 999 },
  ],
});
eq('sessão criada (planilha_produtos_novos)', r.status < 300, 'true');
const sessaoPN1 = r.corpo;
eq('só 1 item (o novo) — o existente nunca vira item', sessaoPN1.itens.length, 1);
eq('resumo: 1 novo, 1 ignorado', `${sessaoPN1.resumo.novos}/${sessaoPN1.resumo.ignorados}`, '1/1');
const itemPN1 = sessaoPN1.itens[0];
eq('é o PN-NOVO', itemPN1.sku, 'PN-NOVO');
eq('tipo produto_novo', itemPN1.tipo, 'produto_novo');
eq('dados estruturados trazem desc/cat/preco/qtdInicial', `${itemPN1.dados.desc}/${itemPN1.dados.cat}/${itemPN1.dados.preco}/${itemPN1.dados.qtdInicial}`, 'Peça Nova/Colar/99/3');

const depoisPN = await api('GET', '/api/estoque/PN-EXISTE/movimentos');
eq('PN-EXISTE: nenhum movimento novo (nem olhado)', depoisPN.corpo.movimentos.length, antesPN.corpo.movimentos.length);
eq('PN-EXISTE: saldo idêntico', depoisPN.corpo.saldos.qtd, antesPN.corpo.saldos.qtd);
eq('PN-EXISTE: descrição idêntica (a da planilha nunca chegou perto)', depoisPN.corpo.saldos.desc, 'Descrição original');

await api('POST', `/api/reconciliacao/${sessaoPN1.id}/itens/${itemPN1.id}/aprovar`);
r = await api('POST', `/api/reconciliacao/${sessaoPN1.id}/aplicar`);
eq('aplicou', r.corpo.status, 'aplicada');

r = await api('GET', '/api/estoque/PN-NOVO/movimentos');
eq('PN-NOVO existe agora, com 3 de entrada', r.corpo.saldos.qtd, 3);
eq('PN-EXISTE continua com a descrição original (confirmando de novo)',
  (await api('GET', '/api/estoque/PN-EXISTE/movimentos')).corpo.saldos.desc, 'Descrição original');

/* =========================================================================
   23. PLANILHA PRODUTOS NOVOS — mistura: só os novos viram candidatos
   ========================================================================= */
console.log('\n=== 23. planilha produtos novos: mistura de 10 linhas, 3 novas ===');

await importar([
  { sku: 'PNM-E1', desc: 'PNM-E1', cat: 'Colar', preco: 10, qtd: 1 },
  { sku: 'PNM-E2', desc: 'PNM-E2', cat: 'Colar', preco: 10, qtd: 1 },
  { sku: 'PNM-E3', desc: 'PNM-E3', cat: 'Colar', preco: 10, qtd: 1 },
  { sku: 'PNM-E4', desc: 'PNM-E4', cat: 'Colar', preco: 10, qtd: 1 },
  { sku: 'PNM-E5', desc: 'PNM-E5', cat: 'Colar', preco: 10, qtd: 1 },
  { sku: 'PNM-E6', desc: 'PNM-E6', cat: 'Colar', preco: 10, qtd: 1 },
  { sku: 'PNM-E7', desc: 'PNM-E7', cat: 'Colar', preco: 10, qtd: 1 },
]);
r = await api('POST', '/api/reconciliacao/planilha/produtos-novos/analisar', {
  produtos: [
    ...['PNM-E1', 'PNM-E2', 'PNM-E3', 'PNM-E4', 'PNM-E5', 'PNM-E6', 'PNM-E7'].map(sku => ({ sku, desc: sku, cat: 'Colar', preco: 10, qtd: 1 })),
    { sku: 'PNM-N1', desc: 'PNM-N1', cat: 'Colar', preco: 10, qtd: 1 },
    { sku: 'PNM-N2', desc: 'PNM-N2', cat: 'Colar', preco: 10, qtd: 1 },
    { sku: 'PNM-N3', desc: 'PNM-N3', cat: 'Colar', preco: 10, qtd: 1 },
  ],
});
const sessaoPN2 = r.corpo;
eq('10 linhas lidas', sessaoPN2.resumo.linhasLidas, 10);
eq('só 3 candidatas (as novas)', sessaoPN2.itens.length, 3);
eq('resumo bate: 3 novos, 7 ignorados', `${sessaoPN2.resumo.novos}/${sessaoPN2.resumo.ignorados}`, '3/7');

/* =========================================================================
   24. PLANILHA PRODUTOS NOVOS — corrida: SKU criado entre preview e apply
   ========================================================================= */
console.log('\n=== 24. planilha produtos novos: SKU criado por fora entre preview e apply → não sobrescreve ===');

r = await api('POST', '/api/reconciliacao/planilha/produtos-novos/analisar', {
  produtos: [{ sku: 'PN-CORRIDA', desc: 'PN-CORRIDA', cat: 'Colar', preco: 10, qtd: 2 }],
});
const sessaoPN3 = r.corpo;
const itemPN3 = sessaoPN3.itens[0];
await api('POST', `/api/reconciliacao/${sessaoPN3.id}/itens/${itemPN3.id}/aprovar`);

// alguém (outro processo qualquer) cria o SKU por fora, com dados diferentes
await importar([{ sku: 'PN-CORRIDA', desc: 'Criado por outro caminho', cat: 'Anel', preco: 500, qtd: 1 }]);

r = await api('POST', `/api/reconciliacao/${sessaoPN3.id}/aplicar`);
eq('sessão aplicada_parcial', r.corpo.status, 'aplicada_parcial');
eq('0 aplicado, 1 obsoleto', `${r.corpo.aplicados}/${r.corpo.obsoletos}`, '0/1');
r = await api('GET', '/api/estoque/PN-CORRIDA/movimentos');
eq('o produto continua com os dados de quem criou por fora — não foi sobrescrito', r.corpo.saldos.desc, 'Criado por outro caminho');

/* =========================================================================
   25. PLANILHA PRODUTOS NOVOS — retry nunca cria duas vezes
   ========================================================================= */
console.log('\n=== 25. planilha produtos novos: retry (duas chamadas concorrentes) nunca duplica ===');

r = await api('POST', '/api/reconciliacao/planilha/produtos-novos/analisar', {
  produtos: [{ sku: 'PN-RETRY', desc: 'PN-RETRY', cat: 'Colar', preco: 10, qtd: 4 }],
});
const sessaoPN4 = r.corpo;
await api('POST', `/api/reconciliacao/${sessaoPN4.id}/itens/${sessaoPN4.itens[0].id}/aprovar`);

const [pnA, pnB] = await Promise.all([
  api('POST', `/api/reconciliacao/${sessaoPN4.id}/aplicar`),
  api('POST', `/api/reconciliacao/${sessaoPN4.id}/aplicar`),
]);
eq('nenhuma quebrou', [pnA.status, pnB.status].every(s => s < 500), 'true');

r = await api('GET', '/api/estoque/PN-RETRY/movimentos');
eq('exatamente 1 movimento de entrada', r.corpo.movimentos.filter(m => m.tipo === 'entrada').length, 1);
eq('qtd final é 4, não 8', r.corpo.saldos.qtd, 4);

/* =========================================================================
   26. a razão fecha depois de tudo isso (§19 do CLAUDE.md)
   ========================================================================= */
console.log('\n=== 26. a razão continua fechando depois de todos os fluxos ===');

r = await api('GET', '/api/estoque/conferir');
eq('produtos.qtd == SUM(movimentos.qtd) em todo SKU', r.corpo.ok, 'true');

/* ------------------------------------------------------------------- fim */

await loja.fechar();
console.log(`\n${falhas === 0 ? 'TUDO CERTO' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
