/** AUDITORIA DE LEITURA DO D1 — mede, não estima.
 *
 *  A conta bateu no limite de linhas lidas do D1 e ninguém sabia de onde
 *  vinha a leitura. Este script responde com número: sobe um banco local com
 *  o TAMANHO da produção, chama cada rota do painel com a medição ligada
 *  (`X-D1-Metricas: 1`, ver api/src/d1-metrica.js) e imprime quantas linhas
 *  cada uma leu, além das três consultas mais caras de cada uma.
 *
 *  Não toca a nuvem. O banco é o SQLite local do `wrangler dev --local`.
 *
 *  Pré-requisitos:
 *    1. Worker local no ar em :8787 com o banco VAZIO;
 *    2. este script semeia o volume de produção sozinho, via API e SQL.
 *
 *  Uso:
 *    node src/d1-uso-audit.mjs             mede
 *    node src/d1-uso-audit.mjs --semear    só semeia e sai
 *    node src/d1-uso-audit.mjs --medir     só mede (banco já semeado)
 *
 *  O tamanho semeado sai de docs/PLANO-MESTRE-MARQUESA.md § go-live e dos
 *  números que o próprio painel mostra hoje:
 *    772 produtos · 1.171 movimentos · 343 clientes · 4 maletas abertas com
 *    382 peças · 25 meses de histórico · ~1.375 vendas históricas.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execFileP = promisify(execFile);
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';
const API_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'api');

const PRODUTOS = 772;
const CLIENTES = 343;
const MESES = 25;
const VENDAS_HIST = 1375;
const MALETAS_ABERTAS = 4;
const PECAS_EM_MALETA = 382;

const so = (n, casas = 0) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: casas });

/* ─────────────────────────────────────────────────────────── semeadura */

function sql() {
  const L = [];
  const push = (s) => L.push(s);
  const lote = (tabela, colunas, linhas) => {
    for (let i = 0; i < linhas.length; i += 200) {
      push(`INSERT OR IGNORE INTO ${tabela} (${colunas}) VALUES\n`
        + linhas.slice(i, i + 200).join(',\n') + ';');
    }
  };

  push("INSERT OR IGNORE INTO categorias (nome, ordem) VALUES ('Anel',1),('Brinco',2),('Colar',3),('Pulseira',4),('Pingente',5);");

  const CATS = ['Anel', 'Brinco', 'Colar', 'Pulseira', 'Pingente'];
  const produtos = [];
  for (let i = 0; i < PRODUTOS; i++) {
    const sku = String(100000 + i * 7);
    const cat = CATS[i % CATS.length];
    const preco = 39 + (i % 120);
    produtos.push(`('${sku}','${cat} modelo ${i} Banho de Ouro 18k','${cat}',${preco},0,'ativo')`);
  }
  lote('produtos', 'sku, desc, cat, preco, qtd, status', produtos);

  /* movimentos: entrada de estoque. `produtos.qtd` é ajustado por UPDATE a
     partir da própria razão, para a invariante fechar sem depender de mim. */
  const movs = [];
  for (let i = 0; i < PRODUTOS; i++) {
    const sku = String(100000 + i * 7);
    const q = 1 + (i % 4);
    movs.push(`('${sku}','entrada',${q},'importacao','carga inicial')`);
  }
  /* mais movimentos para chegar perto de 1.171: vendas antigas */
  for (let i = 0; i < 400; i++) {
    const sku = String(100000 + (i * 13 % PRODUTOS) * 7);
    movs.push(`('${sku}','venda',-1,'venda','venda antiga ${i}')`);
  }
  lote('movimentos', 'sku, tipo, qtd, origem, obs', movs);
  push('UPDATE produtos SET qtd = COALESCE((SELECT SUM(m.qtd) FROM movimentos m WHERE m.sku = produtos.sku), 0);');

  const clientes = [];
  for (let i = 0; i < CLIENTES; i++) {
    clientes.push(`('Cliente ${i} Silva','cliente ${i} silva','historico')`);
  }
  lote('clientes', 'nome, nome_norm, origem', clientes);

  const revs = [];
  for (let i = 0; i < 12; i++) revs.push(`('Revendedora ${i}','ativa')`);
  lote('revendedoras', 'nome, status', revs);

  const maletas = [];
  for (let i = 1; i <= MALETAS_ABERTAS; i++) {
    maletas.push(`(${(i % 12) + 1},'aberta','2026-08-0${i}')`);
  }
  lote('maletas', 'rev_id, status, aberta_em', maletas);
  const mitens = [];
  for (let i = 0; i < PECAS_EM_MALETA; i++) {
    const maleta = (i % MALETAS_ABERTAS) + 1;
    const sku = String(100000 + (i * 3 % PRODUTOS) * 7);
    mitens.push(`(${maleta},'${sku}',1,89,0)`);
  }
  lote('maleta_itens', 'maleta_id, sku, qtd, preco_envio, devolvida', mitens);

  /* ─── o histórico da planilha, que é o volume real de leitura */
  push(`INSERT OR IGNORE INTO vendas_historico_lotes
          (id, arquivo_nome, arquivo_hash, status, linhas_total, linhas_importadas)
        VALUES (1,'auditoria.xlsx','hash-auditoria','importado',${VENDAS_HIST * 2},${VENDAS_HIST * 2});`);

  const vhs = [];
  const vhi = [];
  for (let i = 0; i < VENDAS_HIST; i++) {
    const mes = 1 + (i % MESES);
    const ano = 2024 + Math.floor((mes - 1) / 12);
    const mm = String(((mes - 1) % 12) + 1).padStart(2, '0');
    const dd = String(1 + (i % 27)).padStart(2, '0');
    const data = `${ano}-${mm}-${dd}`;
    const cli = i % CLIENTES;
    const total = 60 + (i % 300);
    vhs.push(`(1,'v${i}','venda','agrupamento por cliente e data','Cliente ${cli} Silva','cliente ${cli} silva',${cli + 1},'${data}',2,2,${total},${total},'paga','Maleta','Feira',1,'[${i}]')`);
  }
  lote('vendas_historicas',
    'lote_id, chave, classe, regra, cliente_nome, cliente_nome_norm, cliente_id, data, itens, pecas, '
    + 'valor_total, valor_pago, status, canal, contexto, elegivel_ticket, origem_linhas', vhs);

  for (let i = 0; i < VENDAS_HIST; i++) {
    const mes = 1 + (i % MESES);
    const ano = 2024 + Math.floor((mes - 1) / 12);
    const mm = String(((mes - 1) % 12) + 1).padStart(2, '0');
    const dd = String(1 + (i % 27)).padStart(2, '0');
    const data = `${ano}-${mm}-${dd}`;
    const cli = i % CLIENTES;
    for (let k = 0; k < 2; k++) {
      const sku = String(100000 + ((i * 5 + k) % PRODUTOS) * 7);
      const linha = i * 2 + k;
      vhi.push(`(1,'v${i}',${linha},'${data}','${sku}','${sku}','Peça ${sku}',1,`
        + `${60 + (i % 200)},${60 + (i % 200)},1,'Cliente ${cli} Silva','cliente ${cli} silva',${cli + 1},'Maleta','Feira')`);
    }
  }
  lote('vendas_historico_itens',
    'lote_id, pedido_chave, origem_linha, data, sku, sku_base, nome_produto_historico, qtd, '
    + 'preco_unit, valor_total, pago, cliente_nome_original, cliente_nome_norm, cliente_id, canal, contexto', vhi);

  push(`UPDATE vendas_historico_itens
           SET venda_historica_id = (SELECT vh.id FROM vendas_historicas vh
                                      WHERE vh.lote_id = vendas_historico_itens.lote_id
                                        AND vh.chave = vendas_historico_itens.pedido_chave);`);

  /* espelho da loja: 2 variantes para 200 códigos */
  const lv = [];
  for (let i = 0; i < 200; i++) {
    const sku = String(100000 + i * 7);
    for (let k = 0; k < 2; k++) {
      lv.push(`('${i}${k}','${i}','${sku}','${sku}','[{\\"atributo\\":\\"Tamanho\\",\\"valor\\":\\"1${k}\\"}]','1${k}',${2 + k},89,'Produto ${i}',1,${k})`);
    }
  }
  lote('loja_variantes',
    'variante_id, produto_id, sku, sku_norm, valores_json, nome, estoque, preco, produto_nome, produto_visivel, posicao', lv);

  return L.join('\n');
}

async function semear() {
  const arquivo = path.join(os.tmpdir(), `marquesa-d1-audit-${Date.now()}.sql`);
  fs.writeFileSync(arquivo, sql(), 'utf8');
  console.log(`semeando (${so(fs.statSync(arquivo).size / 1024)} KB de SQL)…`);
  await execFileP('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', `--file=${arquivo}`],
    { cwd: API_DIR, maxBuffer: 1024 * 1024 * 64 });
  fs.unlinkSync(arquivo);
  console.log('semeado.');
}

/* ─────────────────────────────────────────────────────────── medição */

const ROTAS = [
  ['/api/state', 'estado inteiro — chamado por 50 pontos do painel'],
  ['/api/analytics/painel', 'Painel de Vendas (aba inteira)'],
  ['/api/analytics/vendas', 'cartões do topo'],
  ['/api/analytics/evolucao?granularidade=mes', 'gráfico Evolução por mês'],
  ['/api/analytics/categorias', 'rosca de categorias'],
  ['/api/analytics/produtos?limite=20', 'peças mais vendidas'],
  ['/api/analytics/clientes?limite=50', 'ranking de clientes'],
  ['/api/analytics/crm', 'aba Clientes'],
  ['/api/analytics/revendedoras', 'aba Revendedoras'],
  ['/api/clientes/perfil?norm=cliente%2010%20silva', 'ficha de uma cliente'],
  ['/api/vendas?data=2026-08-05', 'lista de vendas do dia'],
  ['/api/vendas/dia?data=2026-08-05', 'tudo que aconteceu no dia'],
  ['/api/vendas/lancamentos?data=2026-08-05', 'cartões de Lançamentos (novo)'],
  ['/api/contas-receber', 'A receber'],
  ['/api/variacoes/revisao', 'pendências de variação'],
  ['/api/estoque/conferir', 'prova da razão'],
  ['/api/pendencias', 'Central de Pendências (nova)'],
];

async function medir() {
  const linhas = [];
  for (const [rota, oque] of ROTAS) {
    let r;
    try {
      r = await fetch(API + rota, {
        headers: { Authorization: `Bearer ${KEY}`, 'X-D1-Metricas': '1' },
      });
    } catch (e) {
      linhas.push({ rota, oque, lidas: null, erro: e.message });
      continue;
    }
    await r.arrayBuffer();
    linhas.push({
      rota,
      oque,
      status: r.status,
      lidas: Number(r.headers.get('X-D1-Rows-Read') ?? -1),
      escritas: Number(r.headers.get('X-D1-Rows-Written') ?? 0),
      consultas: Number(r.headers.get('X-D1-Queries') ?? 0),
      top: r.headers.get('X-D1-Top') || '',
    });
  }

  linhas.sort((a, b) => (b.lidas ?? 0) - (a.lidas ?? 0));
  console.log('\n╔══ LINHAS LIDAS DO D1, POR ROTA ' + '═'.repeat(46));
  for (const l of linhas) {
    if (l.erro) { console.log(`║ ${l.rota}  → erro: ${l.erro}`); continue; }
    if (l.status === 404) { console.log(`║ ${l.rota.padEnd(48)} (rota ainda não existe)`); continue; }
    console.log(`║ ${String(so(l.lidas)).padStart(9)} linhas · ${String(l.consultas).padStart(3)} consultas  ${l.rota}`);
    console.log(`║ ${' '.repeat(9)}          ${l.oque}`);
    if (l.top) for (const t of l.top.split(' | ')) console.log(`║             · ${t}`);
  }
  const total = linhas.reduce((s, l) => s + (l.lidas > 0 ? l.lidas : 0), 0);
  console.log('╚' + '═'.repeat(78));
  console.log(`\nsoma de uma passada por todas as rotas: ${so(total)} linhas lidas`);
  console.log('(o painel não chama todas de uma vez; a soma serve de ordem de grandeza)\n');
  return linhas;
}

const args = process.argv.slice(2);
if (!args.includes('--medir')) await semear();
if (!args.includes('--semear')) await medir();
