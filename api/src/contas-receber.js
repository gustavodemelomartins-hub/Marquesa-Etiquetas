/** §37 — A RECEBER, COM TUDO O QUE ALGUÉM DEVE
 *
 *  O defeito: "A receber" no Painel lia UMA fonte só — as operações
 *  históricas (`historico_operacoes` com `papel='cliente'`). Ficavam de fora:
 *
 *    · a venda de balcão lançada como NÃO PAGA. A peça saiu, a cliente ficou
 *      devendo, e o Painel não mostrava — apesar de `vendas.pago` e
 *      `vendas.cobravel` existirem desde §29 e §36.4 exatamente para isso;
 *    · a diferença de uma troca de garantia. O caso da Evelyn Veiga aparecia
 *      no histórico dela como texto — "diferença R$ 10 · a receber" — e em
 *      lugar nenhum onde pudesse ser cobrada.
 *
 *  Aqui as três fontes viram uma lista só. Cada linha carrega uma `chave`
 *  (`historico:12`, `venda:45`, `troca:7`) que diz de onde ela veio e para
 *  onde a ação vai — não existe "conta genérica" cujo tipo se descobre pelo
 *  formato do id.
 *
 *  O que NÃO entra, e por quê:
 *
 *    acerto de revendedora   não é dívida de cliente (REGRAS.md §29);
 *    cobravel = 0            reembolso, anulação e pedido abandonado: a loja
 *                            declara que ninguém deve, e status técnico não
 *                            vira cobrança (§36.4);
 *    venda cancelada         §28;
 *    venda operacional que   já está representada pela operação histórica —
 *    é duplicata             o mesmo filtro do painel, para não cobrar duas
 *                            vezes a mesma compra;
 *    diferença negativa      crédito/reembolso nunca foi definido como regra.
 *                            Fica `pendente_regra`, anunciada, sem virar
 *                            nem dívida nem crédito;
 *    troca com venda ligada  ela JÁ está na lista como venda (§36). Contá-la
 *                            de novo dobraria os R$ 10.
 *
 *  Nada aqui escreve em estoque. Receber dinheiro não faz peça sair.
 */
import { listarContasReceber, definirVencimento, marcarContaPaga } from './historico-operacoes.js';
import { pagarDiferencaTroca, registrarPagamentoDaDiferenca } from './garantias.js';

const hojeISO = () => new Date().toISOString().slice(0, 10);
const dataIsoValida = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(v + 'T00:00:00Z'))
  && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const dinheiro = (v) => Math.round(Number(v || 0) * 100) / 100;

/** As vendas operacionais que ainda não foram pagas. */
async function vendasEmAberto(db) {
  const { results } = await db.prepare(
    `SELECT v.id, v.data, v.total, v.valor_recebido, v.observacao, v.origem,
            v.vencimento_em, v.cliente_id, v.cliente_nome_norm, v.cliente_ambiguo,
            COALESCE(c.nome, v.cliente_nome) AS cliente,
            (SELECT COUNT(*) FROM garantia_trocas gt WHERE gt.venda_id = v.id) AS de_troca
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE v.cancelada = 0
        AND v.pago = 0
        AND v.cobravel = 1
        AND v.origem <> 'acerto' AND v.revendedora_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM historico_operacao_vendas hov
           WHERE hov.venda_id = v.id AND hov.status_registro = 'ativa'
        )
      ORDER BY v.data, v.id`,
  ).all();
  return (results ?? []).map((v) => {
    /* §36.4 — o saldo é o que falta, não o total: pagamento parcial com
       valor conhecido deixa de cobrar o que já entrou. */
    const recebido = v.valor_recebido == null ? 0 : dinheiro(v.valor_recebido);
    const saldo = Math.max(0, dinheiro(dinheiro(v.total) - recebido));
    const daTroca = Number(v.de_troca ?? 0) > 0;
    return {
      chave: `venda:${v.id}`,
      tipo: 'venda',
      id: Number(v.id),
      versao: null,
      vendaId: Number(v.id),
      data: v.data,
      /* §2 — a venda em que o sistema se recusou a escolher entre homônimas
         não tem dona. A cobrança existe (alguém levou a peça), mas o nome
         não navega para ficha nenhuma. */
      clienteId: v.cliente_ambiguo ? null : (v.cliente_id ?? null),
      clienteNorm: v.cliente_ambiguo ? null : (v.cliente_nome_norm ?? null),
      cliente: v.cliente ?? null,
      clienteAmbiguo: !!v.cliente_ambiguo,
      origem: daTroca ? 'Diferença de troca/garantia'
        : (v.origem === 'site' ? 'Site' : 'Balcão'),
      contexto: null,
      observacao: v.observacao ?? null,
      valorTotal: dinheiro(v.total),
      valorRecebido: recebido,
      valorReceber: saldo,
      vencimentoEm: v.vencimento_em ?? null,
      vencida: !!v.vencimento_em && v.vencimento_em < hojeISO(),
      pagaEm: null,
      cobrancaStatus: 'aberta',
      podeDefinirPrazo: true,
    };
  });
}

/** As diferenças de troca ANTERIORES a §36 — as que não têm venda ligada.
 *  Depois de §36 a diferença nasce como venda e entra pela lista acima. */
async function trocasEmAberto(db) {
  const { results } = await db.prepare(
    `SELECT t.id, t.garantia_id, t.data, t.diferenca, t.sku_novo, t.produto_novo_nome,
            g.sku AS sku_original, g.cliente_id, g.cliente_nome, g.cliente_nome_norm
       FROM garantia_trocas t
       JOIN garantias g ON g.id = t.garantia_id
      WHERE t.diferenca_status = 'a_receber' AND t.venda_id IS NULL
      ORDER BY t.data, t.id`,
  ).all().catch(() => ({ results: [] }));
  return (results ?? []).map((t) => ({
    chave: `troca:${t.garantia_id}`,
    tipo: 'troca',
    id: Number(t.id),
    versao: null,
    garantiaId: Number(t.garantia_id),
    data: t.data,
    clienteId: t.cliente_id ?? null,
    clienteNorm: t.cliente_nome_norm ?? null,
    cliente: t.cliente_nome ?? null,
    origem: 'Diferença de troca/garantia',
    contexto: `${t.sku_original} → ${t.sku_novo}`,
    observacao: t.produto_novo_nome ?? null,
    valorTotal: dinheiro(t.diferenca),
    valorRecebido: 0,
    valorReceber: dinheiro(t.diferenca),
    /* A troca antiga não tem onde guardar prazo, e inventar uma coluna só
       para ela seria estrutura nova para um caso em extinção. A tela mostra
       "sem prazo" e o campo fica desabilitado, dizendo por quê. */
    vencimentoEm: null,
    vencida: false,
    pagaEm: null,
    cobrancaStatus: 'aberta',
    podeDefinirPrazo: false,
  }));
}

export async function contasAReceber(db, { status = 'aberta' } = {}) {
  const historico = await listarContasReceber(db, { status });
  if (!historico.ok) return historico;

  const doHistorico = (historico.contas ?? []).map((c) => ({
    ...c,
    chave: `historico:${c.id}`,
    tipo: 'historico',
    valorTotal: c.valorEfetivo,
    podeDefinirPrazo: c.cobrancaStatus === 'aberta',
  }));

  /* Venda e troca só têm o estado "em aberto" para mostrar: quitadas, elas
     saem daqui e continuam inteiras no histórico da cliente. Pedir
     `status=paga` devolve só a metade histórica, e a resposta diz isso. */
  const [vendas, trocas] = status === 'paga'
    ? [[], []]
    : await Promise.all([vendasEmAberto(db), trocasEmAberto(db)]);

  const contas = [...doHistorico, ...vendas, ...trocas];
  const abertas = contas.filter((c) => c.cobrancaStatus === 'aberta');

  const ordem = (c) => (c.vencida ? 0 : c.vencimentoEm ? 1 : 2);
  contas.sort((a, b) => ordem(a) - ordem(b)
    || String(a.vencimentoEm ?? '9999').localeCompare(String(b.vencimentoEm ?? '9999'))
    || String(a.data ?? '').localeCompare(String(b.data ?? ''))
    || String(a.cliente ?? '').localeCompare(String(b.cliente ?? '')));

  const somar = (lista) => +lista.reduce((s, c) => s + Number(c.valorReceber || 0), 0).toFixed(2);
  const porTipo = {};
  for (const c of abertas) {
    const t = porTipo[c.tipo] ?? { quantidade: 0, total: 0 };
    t.quantidade += 1; t.total = +(t.total + Number(c.valorReceber || 0)).toFixed(2);
    porTipo[c.tipo] = t;
  }

  return {
    ok: true,
    resumo: {
      quantidade: abertas.length,
      total: somar(abertas),
      totalCentavos: Math.round(somar(abertas) * 100),
      vencidas: abertas.filter((c) => c.vencida).length,
      semPrazo: abertas.filter((c) => !c.vencimentoEm).length,
      porTipo,
    },
    contas,
    regra: 'Entram: compra histórica em aberto, venda do sistema não paga e '
      + 'diferença de troca de garantia. Não entram: acerto de revendedora, '
      + 'venda cancelada, pedido reembolsado ou anulado (cobravel = 0) e '
      + 'diferença negativa, cuja regra de crédito ainda não existe.',
  };
}

/* ══════════════════════════════════════════════════ as duas ações da lista

   Cada uma despacha pela `chave`. Um `switch` explícito, e não um id que
   muda de significado conforme a tabela: cobrar a conta errada é o tipo de
   erro que só aparece depois, no extrato de alguém. */

function partes(chave) {
  const m = /^(historico|venda|troca):(\d+)$/.exec(String(chave ?? ''));
  return m ? { tipo: m[1], id: Number(m[2]) } : null;
}

export async function definirPrazoDaConta(db, { chave, vencimentoEm = null, versaoEsperada = null } = {}) {
  const p = partes(chave);
  if (!p) return { ok: false, statusHttp: 400, erro: 'Conta inválida.' };
  const prazo = vencimentoEm === '' ? null : vencimentoEm;
  if (prazo != null && !dataIsoValida(prazo)) {
    return { ok: false, statusHttp: 400, erro: 'Prazo inválido. Use uma data real no formato AAAA-MM-DD.' };
  }

  if (p.tipo === 'historico') {
    return definirVencimento(db, p.id, { vencimentoEm: prazo, versaoEsperada });
  }
  if (p.tipo === 'venda') {
    const v = await db.prepare('SELECT id, pago, cancelada FROM vendas WHERE id = ?').bind(p.id).first();
    if (!v) return { ok: false, statusHttp: 404, erro: 'Venda não encontrada.' };
    if (v.cancelada) return { ok: false, statusHttp: 409, erro: 'Venda cancelada não recebe prazo.' };
    if (v.pago) return { ok: false, statusHttp: 409, erro: 'Esta venda já está paga.' };
    await db.prepare('UPDATE vendas SET vencimento_em = ? WHERE id = ?').bind(prazo, p.id).run();
    return { ok: true, chave, vencimentoEm: prazo };
  }
  return {
    ok: false, statusHttp: 409,
    erro: 'A diferença de troca antiga não tem prazo próprio. Registre o pagamento quando ele acontecer.',
  };
}

export async function receberConta(db, { chave, confirmar = false, versaoEsperada = null, pagaEm = null } = {}) {
  if (!confirmar) return { ok: false, statusHttp: 400, erro: 'Confirme explicitamente que o valor foi pago.' };
  const p = partes(chave);
  if (!p) return { ok: false, statusHttp: 400, erro: 'Conta inválida.' };

  const data = pagaEm ? String(pagaEm).trim() : hojeISO();
  if (!dataIsoValida(data)) {
    return { ok: false, statusHttp: 400, erro: 'Data de pagamento inválida. Use AAAA-MM-DD.' };
  }
  if (data > hojeISO()) {
    return { ok: false, statusHttp: 400, erro: `${data} ainda não chegou.` };
  }

  if (p.tipo === 'historico') return marcarContaPaga(db, p.id, { confirmar, versaoEsperada });
  if (p.tipo === 'troca') return pagarDiferencaTroca(db, p.id, { pagaEm: data });

  /* Venda: a MESMA regra de §29 — grava a data do pagamento, não toca em
     `data`, não chama `movimentar`. A peça saiu quando a venda foi
     registrada; receber o dinheiro não a faz sair de novo. */
  const v = await db.prepare('SELECT * FROM vendas WHERE id = ?').bind(p.id).first();
  if (!v) return { ok: false, statusHttp: 404, erro: 'Venda não encontrada.' };
  if (v.cancelada) return { ok: false, statusHttp: 409, erro: 'Venda cancelada não recebe pagamento.' };
  if (v.pago) return { ok: true, jaEstavaPaga: true, chave };
  if (data < v.data) {
    return {
      ok: false, statusHttp: 400,
      erro: `O pagamento (${data}) é anterior à venda (${v.data}). Confira as duas datas.`,
    };
  }

  /* A venda que nasceu de uma troca tem duas linhas para fechar: a venda e a
     `garantia_trocas`. Fecham juntas, no mesmo batch, ou o Painel mostraria
     a diferença como paga num lugar e em aberto no outro. */
  const troca = await db.prepare(
    'SELECT id, garantia_id, diferenca, diferenca_status FROM garantia_trocas WHERE venda_id = ?',
  ).bind(p.id).first().catch(() => null);

  const escritas = [
    db.prepare(
      `UPDATE vendas
          SET pago = 1, data_pagamento = ?, pagamento_origem = 'informado', cobravel = 0
        WHERE id = ? AND pago = 0`,
    ).bind(data, p.id),
  ];
  if (troca) {
    escritas.push(db.prepare(
      `UPDATE garantia_trocas
          SET diferenca_status = 'paga', diferenca_paga_em = ?, diferenca_valor_pago = ?,
              atualizado_em = datetime('now')
        WHERE id = ? AND diferenca_status = 'a_receber'`,
    ).bind(data, dinheiro(troca.diferenca), troca.id));
  }
  await db.batch(escritas);

  /* 5.4c — esta é a porta por onde a diferença de uma troca é recebida de
     verdade: desde §36 ela aparece no A Receber como VENDA, e nenhuma tela
     chama a rota da garantia. O dinheiro já fechava nos dois lugares; o que
     faltava era a linha do tempo do CASO registrar o fato.
   *
   *  Só entra aqui o que é mesmo diferença de troca: `troca` só existe quando
   *  há uma linha de `garantia_trocas` apontando para esta venda. Venda de
   *  balcão e conta histórica passam direto — a histórica nem chega aqui,
   *  sai antes por `marcarContaPaga`.
   *
   *  Escrever o evento NÃO pode derrubar um recebimento que já gravou: o
   *  dinheiro está no banco, e um histórico incompleto é melhor que uma
   *  cobrança perdida. §9 — a falha é dita, não engolida. */
  let eventoGravado = false;
  if (troca) {
    try {
      eventoGravado = await registrarPagamentoDaDiferenca(db, Number(troca.garantia_id), {
        trocaId: Number(troca.id),
        valor: dinheiro(troca.diferenca),
        pagaEm: data,
        vendaId: p.id,
      });
    } catch (e) {
      console.error('receberConta: diferença paga, mas o evento da garantia não gravou', e);
    }
  }

  return {
    ok: true,
    chave,
    vendaId: p.id,
    pagaEm: data,
    faturamentoEm: data,
    garantiaId: troca ? Number(troca.garantia_id) : null,
    /* Dito em voz alta para a tela não precisar deduzir se o caso foi
       atualizado: `false` numa conta comum, e numa retentativa de uma
       diferença que já tinha evento. */
    eventoDeGarantiaRegistrado: eventoGravado,
    /* §29 dito na resposta, para nenhuma tela precisar deduzir. */
    estoqueTocado: false,
  };
}
