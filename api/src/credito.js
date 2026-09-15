/** Fase 5.3e — a razão de crédito da cliente.
 *
 *  A regra é da Sthefany (12/09/2026): troca com peça nova mais barata vira
 *  CRÉDITO da cliente, não volta em dinheiro. O sistema registrava e parava,
 *  porque não existia lugar onde um crédito pudesse viver.
 *
 *  Este módulo é esse lugar, e é uma RAZÃO — a mesma forma de `movimentos`:
 *  cada real tem uma linha, um motivo e uma origem nomeada, e o saldo é
 *  `SUM`, nunca coluna. `clientes.saldo_credito` foi descartado de propósito
 *  (§12.A): um número no cadastro não diz de onde veio, e dois `UPDATE
 *  saldo = saldo - ?` concorrentes perdem um.
 *
 *  Módulo FOLHA. Não importa `garantias.js`, `vendas-comandos.js` nem
 *  `contas-receber.js` — todos são chamadores dele, pelo mesmo motivo que
 *  `pagamento-venda.js` existe: o dono do fato é um só.
 *
 *  As quatro decisões de 13/09/2026, e onde cada uma vive:
 *
 *    1. o crédito NÃO EXPIRA          → não existe validade em lugar nenhum
 *    2. crédito é de cliente IDENTIFICADA → `CLIENTE_NAO_IDENTIFICADA`, uma
 *       recusa nomeada, em vez de `cliente_id NULL`
 *    3. o saldo é PROJEÇÃO            → `saldoDeCredito` deriva por SUM
 *    4. legado sem cliente confiável é PENDÊNCIA → a emissão devolve
 *       `emitido: false` com motivo, e a troca segue `pendente_regra`
 *
 *  Detalhe: docs/domains/AUDITORIA-5-3-FIN-101-CONTAS-A-RECEBER.md §11.
 */

const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });

export const ORIGEM_TROCA = 'troca_garantia';
export const ORIGEM_AJUSTE = 'ajuste_manual';
export const ORIGEM_ESTORNO = 'estorno';

const idDaTroca = (trocaId) => `troca:${trocaId}`;

/** Centavos, sempre inteiro, e pode ser negativo — ao contrário do
 *  `centavosValidos` de `historico-operacoes.js`, que recusa negativo porque
 *  lá dinheiro só anda num sentido. Aqui o sinal É a informação. */
function centavosValidos(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return { ok: false };
  const n = Number(valor);
  if (!Number.isSafeInteger(n)) return { ok: false };
  return { ok: true, valor: n };
}

/** `duplicate`/`UNIQUE constraint failed` é a idempotência funcionando, não
 *  um erro: o índice `idx_credito_origem` garante que `troca:7` emita no
 *  máximo uma linha de crédito. Quem chama precisa distinguir isso de uma
 *  falha real, então a checagem do texto fica AQUI, num lugar só. */
const ehDuplicata = (e) => /UNIQUE constraint failed|duplicate/i.test(String(e?.message ?? ''));

async function lancar(db, { clienteId, tipo, valorCentavos, origem, origemId, vendaId = null, motivo }) {
  await db.prepare(
    `INSERT INTO credito_movimentos
       (cliente_id, tipo, valor_centavos, origem, origem_id, venda_id, motivo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(clienteId, tipo, valorCentavos, origem, origemId, vendaId, motivo).run();

  return db.prepare(
    `SELECT * FROM credito_movimentos
      WHERE tipo = ? AND origem = ? AND origem_id = ?`,
  ).bind(tipo, origem, origemId).first();
}

/* ══════════════════════════════════════════════════════════ saldo e extrato
 *
 *  O saldo é derivado, e o extrato explica o saldo. É o que permite dizer
 *  "gerou X, consumiu Y, estornou Z, sobrou W" em vez de exibir um número
 *  que ninguém sabe defender. */

export async function saldoDeCredito(db, clienteId, { limite = 200 } = {}) {
  const id = Number(clienteId);
  if (!Number.isSafeInteger(id) || id <= 0) return ERRO(400, 'Cliente inválido.');

  const cliente = await db.prepare('SELECT id, nome FROM clientes WHERE id = ?').bind(id).first();
  if (!cliente) return ERRO(404, 'Cliente não encontrada.');

  const totais = await db.prepare(
    `SELECT COALESCE(SUM(valor_centavos), 0) AS saldo,
            COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor_centavos ELSE 0 END), 0) AS gerado,
            COALESCE(SUM(CASE WHEN tipo = 'consumo' THEN valor_centavos ELSE 0 END), 0) AS consumido,
            COALESCE(SUM(CASE WHEN tipo = 'estorno' THEN valor_centavos ELSE 0 END), 0) AS estornado,
            COALESCE(SUM(CASE WHEN tipo = 'ajuste'  THEN valor_centavos ELSE 0 END), 0) AS ajustado,
            COUNT(*) AS linhas
       FROM credito_movimentos WHERE cliente_id = ?`,
  ).bind(id).first();

  const { results } = await db.prepare(
    `SELECT id, tipo, valor_centavos, origem, origem_id, venda_id, motivo, criado_em
       FROM credito_movimentos WHERE cliente_id = ?
      ORDER BY criado_em DESC, id DESC LIMIT ?`,
  ).bind(id, Math.min(Number(limite) || 200, 1000)).all();

  return {
    ok: true,
    cliente: { id: cliente.id, nome: cliente.nome },
    moeda: 'centavos',
    saldoCentavos: Number(totais.saldo),
    /* Consumo e estorno são negativos na razão. A projeção os devolve em
       módulo, porque "consumiu −3000" é a mesma frase escrita para confundir. */
    geradoCentavos: Number(totais.gerado),
    consumidoCentavos: Math.abs(Number(totais.consumido)),
    estornadoCentavos: Math.abs(Number(totais.estornado)),
    ajusteLiquidoCentavos: Number(totais.ajustado),
    /* A invariante, na própria resposta: saldo negativo é defeito, não estado.
       Quem lê não precisa ir a `/api/credito/conferir` para saber que há um. */
    saldoNegativo: Number(totais.saldo) < 0,
    extrato: (results ?? []).map((m) => ({
      id: m.id,
      tipo: m.tipo,
      valorCentavos: Number(m.valor_centavos),
      origem: m.origem,
      origemId: m.origem_id,
      vendaId: m.venda_id ?? null,
      motivo: m.motivo,
      criadoEm: m.criado_em,
    })),
    /* O extrato pode ter sido cortado; dizer isso é mais barato que deixar
       alguém somar 200 linhas e achar que fechou o saldo. */
    extratoCompleto: (results ?? []).length >= Number(totais.linhas),
    regra: 'Crédito não expira, pertence a uma cliente identificada e nunca é '
      + 'consumido automaticamente. O saldo é derivado da razão, não armazenado.',
  };
}

/* ═══════════════════════════════════════════════════ a invariante agregada
 *
 *  SQLite não tem CHECK agregado: `SUM(valor_centavos) >= 0` por cliente não
 *  cabe no schema. Em vez de fingir que a trava existe, ela vira prova
 *  consultável — irmã de `GET /api/estoque/conferir`, que faz exatamente o
 *  mesmo pelo saldo de peça. */
export async function conferirCredito(db) {
  const { results } = await db.prepare(
    `SELECT cm.cliente_id AS clienteId, c.nome AS cliente,
            SUM(cm.valor_centavos) AS saldo, COUNT(*) AS linhas
       FROM credito_movimentos cm
       LEFT JOIN clientes c ON c.id = cm.cliente_id
      GROUP BY cm.cliente_id
     HAVING SUM(cm.valor_centavos) < 0`,
  ).all();

  const divergentes = (results ?? []).map((r) => ({
    clienteId: r.clienteId,
    cliente: r.cliente ?? null,
    saldoCentavos: Number(r.saldo),
    linhas: Number(r.linhas),
  }));

  return {
    ok: divergentes.length === 0,
    divergentes,
    invariante: 'SUM(valor_centavos) >= 0 por cliente — a loja não pode dever '
      + 'crédito negativo. SQLite não tem CHECK agregado, então a trava é esta consulta.',
  };
}

/* ═════════════════════════════════════════════ emissão a partir da troca */

/** `pendente_regra` → `credito_emitido`.
 *
 *  Idempotente pelo índice único `(tipo, origem, origem_id)`: chamar duas
 *  vezes para `troca:7` grava uma linha só. Isso é trava de banco, não de
 *  lógica — um retry depois de timeout de rede não duplica crédito.
 *
 *  NÃO lança nada quando a cliente não está identificada: devolve
 *  `emitido: false` com `motivo: 'CLIENTE_NAO_IDENTIFICADA'`, e quem chama
 *  deixa a troca em `pendente_regra`. É a trava 1 de §11, e a decisão 4 da
 *  Sthefany: legado sem cliente confiável vira pendência, não crédito
 *  anônimo. §2 vale inteiro — ninguém escolhe a dona pelo nome. */
export async function emitirCreditoDaTroca(db, { trocaId, clienteId, diferenca, descricao = null }) {
  const id = Number(trocaId);
  if (!Number.isSafeInteger(id) || id <= 0) return ERRO(400, 'Troca inválida.');

  const valor = Math.round(Number(diferenca) * 100);
  if (!Number.isSafeInteger(valor)) return ERRO(400, 'Diferença inválida.');
  /* Só diferença NEGATIVA vira crédito. Positiva é conta a receber e tem
     dono desde 5.3b; zero não é nada. Emitir aqui por engano criaria
     dinheiro do lado errado da razão. */
  if (valor >= 0) {
    return { ok: true, emitido: false, motivo: 'DIFERENCA_NAO_NEGATIVA', valorCentavos: 0 };
  }

  if (clienteId == null) {
    return {
      ok: true, emitido: false, motivo: 'CLIENTE_NAO_IDENTIFICADA', valorCentavos: -valor,
      aviso: 'A troca gerou crédito, mas a cliente não está identificada. '
        + 'O valor fica registrado na troca como pendência de reconciliação; '
        + 'o sistema não cria crédito sem dona.',
    };
  }

  const cliente = await db.prepare('SELECT id FROM clientes WHERE id = ?').bind(clienteId).first();
  if (!cliente) {
    return {
      ok: true, emitido: false, motivo: 'CLIENTE_NAO_ENCONTRADA', valorCentavos: -valor,
      aviso: 'A cliente apontada pela garantia não existe mais no cadastro.',
    };
  }

  const motivo = descricao
    ? `Crédito de troca de garantia · ${descricao}`
    : `Crédito de troca de garantia ${id}`;

  try {
    const linha = await lancar(db, {
      clienteId: cliente.id, tipo: 'credito', valorCentavos: -valor,
      origem: ORIGEM_TROCA, origemId: idDaTroca(id), motivo,
    });
    return { ok: true, emitido: true, jaExistia: false, valorCentavos: -valor, movimentoId: linha?.id ?? null };
  } catch (e) {
    if (!ehDuplicata(e)) throw e;
    const linha = await db.prepare(
      `SELECT * FROM credito_movimentos WHERE tipo = 'credito' AND origem = ? AND origem_id = ?`,
    ).bind(ORIGEM_TROCA, idDaTroca(id)).first();
    return {
      ok: true, emitido: true, jaExistia: true,
      valorCentavos: Number(linha?.valor_centavos ?? -valor), movimentoId: linha?.id ?? null,
    };
  }
}

/** Estorno da troca → contrapartida, NUNCA `DELETE` (§28).
 *
 *  A peça voltou, o registro comercial foi cancelado, e o crédito precisa
 *  seguir o mesmo caminho: uma linha de sinal oposto, que explica o que
 *  aconteceu. Apagar a linha de crédito faria o extrato da cliente mentir
 *  sobre o passado dela.
 *
 *  Também idempotente pelo índice único, e silencioso quando não há o que
 *  estornar: troca sem crédito emitido não é erro, é o caso comum. */
export async function estornarCreditoDaTroca(db, { trocaId, motivo = null }) {
  const id = Number(trocaId);
  if (!Number.isSafeInteger(id) || id <= 0) return ERRO(400, 'Troca inválida.');

  const original = await db.prepare(
    `SELECT * FROM credito_movimentos WHERE tipo = 'credito' AND origem = ? AND origem_id = ?`,
  ).bind(ORIGEM_TROCA, idDaTroca(id)).first();
  if (!original) return { ok: true, estornado: false, motivo: 'SEM_CREDITO_EMITIDO' };

  const razao = String(motivo ?? '').trim() || 'Troca estornada';
  try {
    const linha = await lancar(db, {
      clienteId: original.cliente_id, tipo: 'estorno',
      valorCentavos: -Number(original.valor_centavos),
      origem: ORIGEM_ESTORNO, origemId: idDaTroca(id),
      motivo: `Estorno do crédito da troca ${id} · ${razao}`,
    });
    return { ok: true, estornado: true, jaExistia: false, valorCentavos: -Number(original.valor_centavos), movimentoId: linha?.id ?? null };
  } catch (e) {
    if (!ehDuplicata(e)) throw e;
    return { ok: true, estornado: true, jaExistia: true, valorCentavos: -Number(original.valor_centavos) };
  }
}

/* ══════════════════════════════════════════════════════════ ajuste manual */

/** Correção humana, com motivo OBRIGATÓRIO.
 *
 *  Duas recusas que não são burocracia:
 *
 *  1. **motivo vazio** — um ajuste sem explicação é exatamente o furo que a
 *     razão existe para fechar. A linha ficaria para sempre dizendo que
 *     alguém mudou o saldo e nada sobre por quê.
 *
 *  2. **saldo resultante negativo** — é a invariante de `conferirCredito`
 *     aplicada na ESCRITA. SQLite não consegue impedir por CHECK, então quem
 *     impede é esta porta: recusar aqui é barato, descobrir depois em
 *     `/conferir` é arqueologia. */
export async function registrarAjuste(db, { clienteId, valorCentavos, motivo, origemId = null } = {}) {
  const id = Number(clienteId);
  if (!Number.isSafeInteger(id) || id <= 0) return ERRO(400, 'Cliente inválido.');

  const v = centavosValidos(valorCentavos);
  if (!v.ok) return ERRO(400, 'Valor inválido. Use centavos inteiros — positivo credita, negativo debita.');
  if (v.valor === 0) return ERRO(400, 'Ajuste de zero não é ajuste.');

  const razao = String(motivo ?? '').trim();
  if (!razao) return ERRO(400, 'Diga por que está ajustando o crédito. Ajuste sem motivo não entra na razão.');

  const cliente = await db.prepare('SELECT id, nome FROM clientes WHERE id = ?').bind(id).first();
  if (!cliente) return ERRO(404, 'Cliente não encontrada.');

  const atual = await db.prepare(
    `SELECT COALESCE(SUM(valor_centavos), 0) AS saldo FROM credito_movimentos WHERE cliente_id = ?`,
  ).bind(id).first();
  const depois = Number(atual.saldo) + v.valor;
  if (depois < 0) {
    return ERRO(409,
      'Este ajuste deixaria o saldo negativo, e a loja não deve crédito negativo a ninguém.',
      { saldoAtualCentavos: Number(atual.saldo), saldoResultanteCentavos: depois });
  }

  /* `origem_id` livre para o chamador, mas único por natureza: sem ele, dois
     ajustes iguais no mesmo instante seriam indistinguíveis na razão. */
  const chave = String(origemId ?? '').trim()
    || `ajuste:${id}:${new Date().toISOString()}:${v.valor}`;

  try {
    const linha = await lancar(db, {
      clienteId: id, tipo: 'ajuste', valorCentavos: v.valor,
      origem: ORIGEM_AJUSTE, origemId: chave, motivo: razao,
    });
    return {
      ok: true, movimentoId: linha?.id ?? null,
      valorCentavos: v.valor,
      saldoAnteriorCentavos: Number(atual.saldo),
      saldoCentavos: depois,
    };
  } catch (e) {
    if (!ehDuplicata(e)) throw e;
    return ERRO(409, 'Este ajuste já foi registrado.', { origemId: chave });
  }
}
