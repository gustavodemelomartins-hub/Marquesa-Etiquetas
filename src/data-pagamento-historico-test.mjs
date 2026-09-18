/** §30 — a data do pagamento é um fato informável nas TRÊS portas.
 *
 *  Achado da cross-review UI ↔ backend de 16/09/2026. O protótipo V2 do
 *  Codex deixa a DATA DA VENDA editável e prende a DATA DO PAGAMENTO ao dia
 *  de hoje. Auditando o backend para responder se o gap era de UI ou dos
 *  dois lados, apareceu um gap real, e num lugar só:
 *
 *    `POST /api/vendas`                  aceita `dataPagamento`     ✓
 *    `POST /api/vendas/:id/pagamento`    aceita `dataPagamento`     ✓
 *    `POST /api/garantias/:id/troca/pagar` aceita `pagaEm`          ✓
 *    `POST /api/contas-receber/receber`  aceita `pagaEm`, VALIDAVA
 *                                        e DESCARTAVA no ramo histórico ✗
 *
 *  `receberConta` validava a data e chamava `marcarContaPaga` sem ela; lá
 *  dentro, `paga_em` recebia `agora()`. Quem vendeu em 10/09, recebeu em
 *  12/09 e lançou em 16/09 via o dinheiro entrar no faturamento do dia 16 —
 *  e §30 diz, em letra: `paga_em` governa o faturamento da cobrança
 *  histórica que nasceu aberta e foi paga depois.
 *
 *  O que fica provado aqui:
 *
 *   A. a data informada é a que fica gravada, e não a de hoje;
 *   B. sem data informada, o carimbo continua sendo agora — o padrão de
 *      quem recebeu neste instante não mudou;
 *   C. as três recusas de `quitarVenda` valem também aqui: data que não
 *      existe, data que ainda não chegou, e pagamento anterior à venda;
 *   D. uma recusa não escreve nada nem consome versão.
 *
 *  E, no mesmo achado, a pendência de crédito:
 *
 *   E. `GET /api/pendencias` parou de anunciar como indefinida a regra
 *      fechada em 12/09/2026, e diz o motivo verdadeiro de cada linha.
 *
 *  Usa `node:sqlite`, embutido no Node 22.5+. Onde não existir, o teste diz
 *  que não rodou em vez de fingir que passou.
 *
 *      node src/data-pagamento-historico-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.log('  --   node:sqlite indisponível nesta versão do Node — teste NÃO rodou');
  process.exit(0);
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(raiz, p), 'utf8');
const mod = (p) => import(pathToFileURL(join(raiz, p)).href);

let provas = 0;
const prova = (t) => { provas += 1; console.log(`  ok   ${t}`); };

const adaptador = (raw) => {
  const preparar = (sql) => {
    const st = { sql, args: [] };
    st.bind = (...a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run });
    st.first = async function () { return raw.prepare(this.sql).get(...this.args) ?? null; };
    st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
    st.run = async function () {
      const r = raw.prepare(this.sql).run(...this.args);
      return { meta: { changes: r.changes } };
    };
    return st;
  };
  return {
    prepare: preparar,
    batch: async (stmts) => {
      raw.exec('BEGIN');
      try {
        const saida = [];
        for (const s of stmts) saida.push(await s.run());
        raw.exec('COMMIT');
        return saida;
      } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
};

const hoje = () => new Date().toISOString().slice(0, 10);

/* A venda é de 10/09/2026 e o recebimento, de 12/09 — o cenário exato do
   pedido. As datas são fixas de propósito: um teste que usa `hoje()` para
   montar o cenário passa mesmo quando o código volta a carimbar o relógio. */
const DATA_VENDA = '2026-09-10';
const DATA_PAGAMENTO = '2026-09-12';

const SEED = `
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria');
INSERT INTO vendas_historico_lotes (id, arquivo_nome, arquivo_hash, status)
  VALUES (1, 'planilha.xlsx', 'hash-1', 'importado');
INSERT INTO vendas_historicas (id, lote_id, chave, regra, cliente_nome, cliente_nome_norm,
                               cliente_id, data, valor_total, valor_pago, status)
  VALUES (10, 1, 'vitoria|${DATA_VENDA}', 'teste', 'Vitoria', 'vitoria', 1,
          '${DATA_VENDA}', 100.0, 0.0, 'nao_paga'),
         (11, 1, 'vitoria|2026-09-11', 'teste', 'Vitoria', 'vitoria', 1,
          '2026-09-11', 50.0, 0.0, 'nao_paga'),
         (12, 1, 'vitoria|2026-09-01', 'teste', 'Vitoria', 'vitoria', 1,
          '2026-09-01', 70.0, 0.0, 'nao_paga');
INSERT INTO historico_operacoes
  (id, lote_id, venda_chave, fingerprint, papel, cliente_id, cliente_nome_norm,
   cobranca_status, valor_efetivo_centavos, saldo_centavos)
  VALUES (100, 1, 'vitoria|${DATA_VENDA}', 'fp-1', 'cliente', 1, 'vitoria', 'aberta', 10000, 10000),
         (101, 1, 'vitoria|2026-09-11',    'fp-2', 'cliente', 1, 'vitoria', 'aberta',  5000,  5000),
         (102, 1, 'vitoria|2026-09-01',    'fp-3', 'cliente', 1, 'vitoria', 'aberta',  7000,  7000);
`;

const novoBanco = () => {
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  raw.exec(SEED);
  return raw;
};

const { receberConta } = await mod('api/src/contas-receber.js');

const pagaEmDe = (raw, chave) => raw.prepare(
  `SELECT paga_em, cobranca_status, versao FROM historico_operacoes
    WHERE venda_chave = ? AND status_registro = 'ativa'`,
).get(chave);

/* ══════════════════════════════════════════ A · a data informada é a que fica */
{
  const raw = novoBanco();
  const db = adaptador(raw);

  const r = await receberConta(db, {
    chave: 'historico:100', confirmar: true, versaoEsperada: 1, pagaEm: DATA_PAGAMENTO,
  });
  assert.equal(r.ok, true, r.erro);

  const linha = pagaEmDe(raw, `vitoria|${DATA_VENDA}`);
  assert.equal(linha.cobranca_status, 'paga');
  assert.equal(String(linha.paga_em).slice(0, 10), DATA_PAGAMENTO,
    `paga_em devia ser ${DATA_PAGAMENTO}, veio ${linha.paga_em}`);
  assert.notEqual(String(linha.paga_em).slice(0, 10), hoje(),
    'o relógio do servidor não pode substituir a data informada');
  prova(`venda ${DATA_VENDA}, recebimento ${DATA_PAGAMENTO}: as duas datas sobrevivem`);

  /* O que a tela lê de volta precisa dizer a mesma coisa que o banco: uma
     resposta que devolvesse hoje faria a UI mostrar a data errada mesmo com
     a gravação certa. */
  assert.equal(String(r.conta.pagaEm).slice(0, 10), DATA_PAGAMENTO);
  prova('e a resposta devolve a data informada, não a de hoje');

  /* A leitura de faturamento normaliza com `date(paga_em)`. Gravar a data
     pura tem de continuar casando com o mês de setembro por essa porta. */
  const mes = raw.prepare(
    `SELECT strftime('%Y-%m', date(paga_em)) AS mes FROM historico_operacoes
      WHERE venda_chave = ? AND status_registro = 'ativa'`,
  ).get(`vitoria|${DATA_VENDA}`);
  assert.equal(mes.mes, '2026-09');
  prova('date(paga_em) continua legível — o faturamento acha o mês certo');
}

/* ══════════════════════════════════════════ B · sem data, o padrão não mudou */
{
  const raw = novoBanco();
  const db = adaptador(raw);

  const r = await receberConta(db, { chave: 'historico:100', confirmar: true, versaoEsperada: 1 });
  assert.equal(r.ok, true, r.erro);

  const linha = pagaEmDe(raw, `vitoria|${DATA_VENDA}`);
  assert.equal(String(linha.paga_em).slice(0, 10), hoje());
  assert.ok(String(linha.paga_em).includes('T'),
    'sem data informada o carimbo continua sendo o timestamp de agora');
  prova('quem recebeu agora continua carimbando agora');
}

/* ══════════════════════════════════════════ C · as três recusas, e D · nada escrito */
{
  const casos = [
    ['2026-02-31', 'data que não existe no calendário'],
    ['3000-01-01', 'data que ainda não chegou'],
    ['2026-09-09', 'pagamento anterior à própria venda'],
    ['12/09/2026', 'data fora do formato AAAA-MM-DD'],
  ];

  for (const [data, nome] of casos) {
    const raw = novoBanco();
    const db = adaptador(raw);

    const r = await receberConta(db, {
      chave: 'historico:100', confirmar: true, versaoEsperada: 1, pagaEm: data,
    });
    assert.equal(r.ok, false, `${nome} devia ser recusada`);
    assert.equal(r.statusHttp, 400, `${nome}: 400, não ${r.statusHttp}`);

    const linha = pagaEmDe(raw, `vitoria|${DATA_VENDA}`);
    assert.equal(linha.cobranca_status, 'aberta', `${nome} não pode quitar nada`);
    assert.equal(linha.paga_em, null);
    assert.equal(Number(linha.versao), 1, `${nome} não pode consumir uma versão`);
    prova(`recusa sem escrever: ${nome}`);
  }
}

/* ══════════════════════════════════════════ C.2 · a recusa é da data, não do id
 *
 *  A ordem importa: uma data impossível responde 400 dizendo qual é o
 *  problema. Responder 409 de versão faria a tela mandar recarregar e tentar
 *  de novo com a MESMA data errada, para sempre. */
{
  const raw = novoBanco();
  const db = adaptador(raw);

  const r = await receberConta(db, {
    chave: 'historico:100', confirmar: true, versaoEsperada: 99, pagaEm: '2026-02-31',
  });
  assert.equal(r.statusHttp, 400);
  assert.match(r.erro, /Data de pagamento inválida/);
  prova('data impossível responde 400 mesmo com versão velha junto');
}

/* ══════════════════════════════════════════ C.3 · venda e pagamento no mesmo dia */
{
  const raw = novoBanco();
  const db = adaptador(raw);

  const r = await receberConta(db, {
    chave: 'historico:102', confirmar: true, versaoEsperada: 1, pagaEm: '2026-09-01',
  });
  assert.equal(r.ok, true, r.erro);
  assert.equal(String(pagaEmDe(raw, 'vitoria|2026-09-01').paga_em).slice(0, 10), '2026-09-01');
  prova('receber no mesmo dia da venda é aceito — a recusa é só de data ANTERIOR');
}

/* ══════════════════════════════════════════ E · a pendência diz o motivo verdadeiro
 *
 *  Duas trocas negativas que não viraram crédito, por motivos diferentes:
 *  uma sem cliente identificada, outra anterior à regra de 12/09/2026. A
 *  frase antiga dizia "crédito ou reembolso ainda não é regra definida" para
 *  as duas — e isso deixou de ser verdade quando a regra fechou. */
{
  const raw = novoBanco();
  const db = adaptador(raw);

  raw.exec(`
    INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES
      ('100001', 'Anel Solitario', 'Anel', 100.0, 10),
      ('100002', 'Anel Simples',   'Anel',  60.0, 10);
    INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                        cancelada, pago)
      VALUES (900, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-04', 100.0, 0, 1),
             (901, NULL, 'Cliente da planilha', 'cliente da planilha', 'balcao',
              '2026-09-04', 100.0, 0, 1);
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES
      (900, '100001', 'Anel Solitario', 1, 100.0),
      (901, '100001', 'Anel Solitario', 1, 100.0);
    -- A troca 1 e de garantia SEM cliente identificada; a 2, de cliente
    -- identificada e anterior a regra. Sao os dois motivos que hoje restam
    -- em pendente_regra, e cada um tem a sua saida. (Comentario em SQL, nao
    -- em JS: isto esta dentro de um template literal, e uma crase fecharia
    -- a string.)
    INSERT INTO garantias (id, origem_fonte, venda_id, sku, cliente_id, cliente_nome,
                           cliente_nome_norm, motivo, data_entrada, status)
      VALUES (1, 'operacional', 901, '100001', NULL, 'Cliente da planilha',
              'cliente da planilha', 'pedra caiu', '2026-09-05', 'em_reparo'),
             (2, 'operacional', 900, '100001', 1, 'Vitoria', 'vitoria',
              'pedra caiu', '2026-09-05', 'em_reparo');
    INSERT INTO garantia_trocas (id, garantia_id, data, sku_novo, valor_original, valor_novo,
                                 diferenca, diferenca_status, estornada)
      VALUES (1, 1, '2026-09-06', '100002', 100.0, 60.0, -40.0, 'pendente_regra', 0),
             (2, 2, '2026-09-06', '100002', 100.0, 60.0, -40.0, 'pendente_regra', 0);
  `);

  const { listarPendencias } = await mod('api/src/pendencias.js');
  const r = await listarPendencias(db, { tipo: 'garantia' });
  const daTroca = (id) => r.pendencias.find((p) => p.chave === `troca:${id}`);

  assert.ok(daTroca(1) && daTroca(2), 'as duas trocas continuam pendentes');
  for (const id of [1, 2]) {
    assert.doesNotMatch(daTroca(id).explicacao, /ainda não é regra definida/,
      'a regra de crédito fechou em 12/09/2026 e não pode ser anunciada como inexistente');
  }
  prova('nenhuma pendência anuncia como indefinida uma regra já decidida');

  assert.match(daTroca(1).explicacao, /não tem cliente identificada/);
  prova('sem cliente: a pendência diz que crédito sem dona não é lançado');

  assert.match(daTroca(2).explicacao, /anterior à regra/);
  prova('com cliente: a pendência diz que a troca é anterior à regra');

  /* A chave do motivo não muda: o rótulo do painel legado é indexado por
     ela, e renomear apagaria a explicação de lá sem trocar o fato. */
  assert.equal(daTroca(1).motivo, 'credito_sem_regra');
  prova('a chave do motivo continua estável para o painel legado');
}

console.log(`\n  ${provas} provas · §30 e a pendência de crédito\n`);
