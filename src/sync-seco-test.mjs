/** Fase 4 — `seco = true` é simulação, e simulação não escreve.
 *
 *  REGRA OFICIAL (Gustavo, 10/09/2026): uma execução seca pode ler o D1, ler
 *  a Nuvemshop, calcular diferenças, produzir análise e dizer o que FARIA.
 *  Não pode produzir mutação operacional nenhuma — nem na loja, nem no
 *  banco: nada de `produtos`, `movimentos`, espelho, reconciliação, retrato
 *  da loja ou telemetria persistida.
 *
 *  O defeito que este teste existe para impedir é o de sempre nesta área:
 *  uma escrita nova entra numa rodada seca sem ninguém perceber, e o "modo
 *  simulação" passa a alterar o sistema que ele deveria só descrever. Por
 *  isso o banco falso aqui não é permissivo: ele EXPLODE em qualquer
 *  INSERT/UPDATE/DELETE executado, em `batch` e em `exec`.
 *
 *  A trava de escrita da Nuvemshop fica LIGADA de propósito
 *  (`NUVEMSHOP_WRITES_ENABLED = 'true'`). Se ela estivesse desligada, o
 *  teste passaria por causa dela e não por causa do `seco`.
 */
import assert from 'node:assert/strict';
import { sincronizar, sincronizarSomenteEstoque } from '../api/src/sync.js';

const ESCRITA_SQL = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;

/** D1 falso que recusa qualquer escrita executada. */
function bancoSoLeitura(responder = () => []) {
  const escritasTentadas = [];
  const leituras = [];
  const recusar = (sql) => {
    escritasTentadas.push(sql);
    throw new Error('ESCRITA EM RODADA SECA: ' + sql.slice(0, 140));
  };
  const db = {
    escritasTentadas,
    leituras,
    prepare(sql) {
      const limpo = String(sql).replace(/\s+/g, ' ').trim();
      const escrita = ESCRITA_SQL.test(limpo);
      let binds = [];
      const stmt = {
        sql: limpo,
        escrita,
        bind(...v) { binds = v; stmt.binds = v; return stmt; },
        async all() {
          if (escrita) recusar(limpo);
          leituras.push(limpo);
          return { results: responder(limpo, binds) || [] };
        },
        async first(coluna) {
          if (escrita) recusar(limpo);
          leituras.push(limpo);
          const r = (responder(limpo, binds) || [])[0] ?? null;
          return coluna === undefined ? r : (r == null ? null : r[coluna]);
        },
        async run() { recusar(limpo); },
        async raw() { if (escrita) recusar(limpo); return []; },
      };
      return stmt;
    },
    async batch(stmts) {
      const escritas = (stmts || []).filter((s) => s && s.escrita);
      if (escritas.length) recusar('batch com ' + escritas.length + ': ' + escritas[0].sql);
      return (stmts || []).map(() => ({ results: [], meta: {} }));
    },
    async exec(sql) { recusar('exec: ' + String(sql)); },
  };
  return db;
}

/** Catálogo mínimo, com um código cujo estoque local difere do da loja —
 *  assim a rodada TEM o que empurrar, e o `seco` é o único motivo para ela
 *  não empurrar. */
const PRODUTO = { sku: 'BR1234', desc: 'Anel liso', qtd: 5, casa: 5, preco: 100 };

function respostasDeLeitura(sql) {
  if (/FROM config/i.test(sql)) return [];
  if (/FROM produtos/i.test(sql) && /SELECT sku FROM produtos/i.test(sql)) return [{ sku: PRODUTO.sku }];
  if (/FROM produtos/i.test(sql)) {
    return [{ ...PRODUTO, estoque_loja: 2, url_loja: null, visivel: 1, variacao: null, variante_id: null }];
  }
  if (/FROM movimentos/i.test(sql)) return [];
  if (/FROM produto_variacoes/i.test(sql)) return [];
  if (/FROM loja_variantes/i.test(sql)) return [];
  if (/FROM maleta_itens/i.test(sql)) return [{ fora: 0 }];
  /* Agregações precisam de UMA linha, mesmo zerada: `first()` de um
     COALESCE(SUM(...)) nunca volta vazio no D1 de verdade. */
  if (/COALESCE\(SUM\(/i.test(sql)) return [{ fora: 0, saldo: 0, soma: 0, n: 0 }];
  if (/FROM vendas/i.test(sql)) return [];
  if (/FROM sync_execucoes/i.test(sql)) return [];
  return [];
}

/** Loja falsa: um produto com uma variante, estoque diferente do local. */
const PRODUTOS_LOJA = [{
  id: 900, name: 'Anel liso', handle: 'anel-liso', published: true, attributes: [],
  images: [],
  variants: [{ id: 801, sku: 'BR1234', stock: 2, values: [], inventory_levels: [] }],
}];

/** `fetch` falso. Registra tudo e recusa qualquer método de escrita. */
function fetchFalso() {
  const chamadas = [];
  const escritas = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    const metodo = String(opcoes.method || 'GET').toUpperCase();
    chamadas.push(metodo + ' ' + url);
    if (metodo !== 'GET') escritas.push(metodo + ' ' + url);
    const corpo = /\/products\?/.test(url) && /page=1\b/.test(url) ? PRODUTOS_LOJA : [];
    return {
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => corpo,
      text: async () => JSON.stringify(corpo),
    };
  };
  return { chamadas, escritas };
}

const env = {
  NUVEMSHOP_STORE_ID: '123',
  NUVEMSHOP_TOKEN: 'token-de-mentira',
  NUVEMSHOP_BASE: 'http://loja.falsa',
  /* LIGADA de propósito: quem tem de barrar a escrita aqui é o `seco`. */
  NUVEMSHOP_WRITES_ENABLED: 'true',
};

const fetchOriginal = globalThis.fetch;

async function rodar(fn) {
  const rede = fetchFalso();
  const db = bancoSoLeitura(respostasDeLeitura);
  const r = await fn(db, env, { seco: true });
  return { r, db, rede };
}

try {
  /* ───────────────────────────────── sincronizar(seco) */
  {
    const { r, db, rede } = await rodar(sincronizar);

    assert.deepEqual(db.escritasTentadas, [],
      'a rodada seca executou escrita no D1:\n    ' + db.escritasTentadas.join('\n    '));
    assert.deepEqual(rede.escritas, [],
      'a rodada seca escreveu na Nuvemshop:\n    ' + rede.escritas.join('\n    '));
    assert.equal(r.ok, true, 'a rodada seca falhou: ' + (r.erro || ''));
    assert.equal(r.seco, true, 'o relato deixou de dizer que a rodada foi seca');
    assert.ok(db.leituras.length > 0, 'a rodada seca não leu nada — o teste não provaria nada');
    assert.ok(rede.chamadas.some((c) => c.startsWith('GET')), 'a rodada seca não leu a loja');
    console.log(`  ok   sincronizar(seco): ${db.leituras.length} leituras no D1, `
      + `${rede.chamadas.length} na loja, ZERO escritas dos dois lados`);
  }

  /* ──────────────────────── sincronizarSomenteEstoque(seco) */
  {
    const { r, db, rede } = await rodar(sincronizarSomenteEstoque);
    assert.deepEqual(db.escritasTentadas, [],
      'a rodada seca de estoque executou escrita no D1:\n    ' + db.escritasTentadas.join('\n    '));
    assert.deepEqual(rede.escritas, [], 'a rodada seca de estoque escreveu na Nuvemshop');
    assert.equal(r.ok, true, 'a rodada seca de estoque falhou: ' + (r.erro || ''));
    assert.equal(r.seco, true);
    console.log('  ok   sincronizarSomenteEstoque(seco): ZERO escritas, mesma definição de seco');
  }

  /* ────────────────── a rodada seca ainda DIZ o que faria */
  {
    const { r } = await rodar(sincronizar);
    assert.ok(Array.isArray(r.mudancas), 'o relato perdeu a lista de mudanças');
    assert.ok(Array.isArray(r.semEmpurrar), 'o relato perdeu a lista do que não foi empurrado');
    assert.ok('produtosEnviados' in r, 'o relato perdeu a contagem de enviados');
    assert.equal(r.produtosEnviados, 0, 'a rodada seca contou produto como ENVIADO');
    console.log('  ok   a rodada seca continua descrevendo o que faria, sem ter feito');
  }

  /* ─────── o identificador da rodada seca vive no log, não no banco */
  {
    const { r } = await rodar(sincronizar);
    assert.equal(r.id, null,
      'a rodada seca voltou a ter id de `sync_execucoes` — isso é uma linha gravada');
    assert.equal(typeof r.correlacao, 'string',
      'a rodada seca ficou sem identificador nenhum; o log não teria como ser seguido');
    assert.ok(r.correlacao.length >= 8);
    console.log(`  ok   rodada seca sem linha em sync_execucoes, correlação ${r.correlacao} só no log`);
  }
  /* ══════════════ o contraprova: rodada DE VERDADE continua escrevendo.
     Sem isto, desligar o sync inteiro passaria neste teste. */
  {
    const rede = fetchFalso();
    const escritas = [];
    const db = {
      prepare(sql) {
        const limpo = String(sql).replace(/\s+/g, ' ').trim();
        const escrita = ESCRITA_SQL.test(limpo);
        const stmt = {
          sql: limpo, escrita,
          bind() { return stmt; },
          async all() { if (escrita) escritas.push(limpo); return { results: respostasDeLeitura(limpo) || [] }; },
          async first() {
            if (escrita) { escritas.push(limpo); return { id: 77 }; }
            return (respostasDeLeitura(limpo) || [])[0] ?? null;
          },
          async run() { escritas.push(limpo); return { meta: {} }; },
          async raw() { return []; },
        };
        return stmt;
      },
      async batch(stmts) { for (const x of stmts || []) if (x && x.escrita) escritas.push(x.sql); return []; },
      async exec(sql) { escritas.push('exec ' + sql); },
    };

    const r = await sincronizar(db, env, { seco: false });
    assert.equal(r.ok, true, 'a rodada real falhou: ' + (r.erro || ''));
    assert.equal(r.seco, false);
    assert.equal(r.id, 77, 'a rodada real deixou de abrir linha em sync_execucoes');
    assert.ok(escritas.some((x) => /INSERT INTO sync_execucoes/i.test(x)),
      'a rodada real não abriu a execução');
    assert.ok(escritas.some((x) => /UPDATE sync_execucoes/i.test(x)),
      'a rodada real não fechou a execução');
    assert.ok(escritas.some((x) => /UPDATE produtos SET url_loja/i.test(x)),
      'a rodada real deixou de gravar o retrato da loja — o `if (!seco)` virou bloqueio geral');
    console.log(`  ok   rodada real: ${escritas.length} escritas, execução aberta, fechada e retrato gravado`);
  }
} finally {
  globalThis.fetch = fetchOriginal;
}


/* `analisarSincronizacao` sempre se anunciou como leitura pura. Agora isso é
   garantido pelo mesmo invólucro, e não pelo comentário. */
{
  const rede = fetchFalso();
  const db = bancoSoLeitura(respostasDeLeitura);
  const { analisarSincronizacao } = await import('../api/src/sync.js');
  const r = await analisarSincronizacao(db, env);
  assert.deepEqual(db.escritasTentadas, [],
    'a análise escreveu no D1:\n    ' + db.escritasTentadas.join('\n    '));
  assert.deepEqual(rede.escritas, [], 'a análise escreveu na Nuvemshop');
  assert.equal(r.ok, true, 'a análise falhou: ' + (r.erro || ''));
  console.log('  ok   analisarSincronizacao: leitura pura, provada e não só documentada');
  globalThis.fetch = fetchOriginal;
}

console.log('Rodada seca: ok');
