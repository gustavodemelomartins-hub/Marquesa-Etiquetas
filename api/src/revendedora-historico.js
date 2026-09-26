/** O histórico de uma revendedora — a relação inteira com a Marquesa.
 *
 *  Não é uma tabela nova e não guarda número nenhum: é LEITURA das tabelas
 *  que já registram cada fato, e cada evento devolvido aponta a linha de
 *  onde veio (`origem.tabela` + `origem.id`). Duas razões para não existir
 *  uma "tabela de eventos":
 *
 *    - uma segunda fonte de dinheiro diverge da primeira no primeiro erro de
 *      código — o total vendido aqui é o mesmo de Revendedoras › Visão geral
 *      porque sai do mesmo lugar (`acertosDeMaleta`);
 *    - o passado não é reescrito: movimento, venda, decisão documental e
 *      maleta encerrada já são imutáveis ou versionados onde nasceram.
 *
 *  As fontes, e o que cada uma diz:
 *
 *    revendedoras.criada_em       quando a relação começou no sistema
 *    maletas                      abertura, encerramento, cancelamento, obs
 *    movimentos (da maleta)       envio, devolução, venda no acerto, perda…
 *    historico_operacoes (acerto) acerto feito fora, com bruto/comissão/líquido
 *    maletas.acerto_json          acerto fechado pelo sistema
 *    vendas (origem acerto)       a venda que o acerto do sistema gerou
 *
 *  O que ele NÃO inventa: quem conferiu. O sistema não tem usuário (D4); o
 *  campo existe na resposta e vem nulo, dito por extenso. */
import { acertosDeMaleta } from './analytics.js';

const unidades = (obs, padrao = 1) => {
  const m = /^(\d+)\s*un\./.exec(String(obs ?? ''));
  return m ? Number(m[1]) : padrao;
};

const TITULO = {
  consignacao: 'Envio de peças',
  devolucao: 'Peças devolvidas',
  venda: 'Peças vendidas no acerto',
  perda: 'Peças perdidas', quebra: 'Peças quebradas', dano: 'Peças danificadas',
  brinde: 'Peças dadas como brinde', troca: 'Peças trocadas',
  ajuste: 'Ajuste de estoque', cancelamento: 'Devolução por cancelamento',
};
const GRUPO = {
  consignacao: 'envio', devolucao: 'devolucao', venda: 'acerto', cancelamento: 'devolucao',
  perda: 'ajuste', quebra: 'ajuste', dano: 'ajuste', brinde: 'ajuste', troca: 'ajuste', ajuste: 'ajuste',
};

export async function historicoDaRevendedora(db, id) {
  const rev = await db.prepare('SELECT * FROM revendedoras WHERE id = ?').bind(id).first();
  if (!rev) return { ok: false, statusHttp: 404, erro: 'Revendedora não encontrada.' };

  const maletas = (await db.prepare(
    'SELECT * FROM maletas WHERE rev_id = ? ORDER BY id',
  ).bind(id).all()).results ?? [];
  const idsMaleta = maletas.map((m) => m.id);
  const marcas = idsMaleta.map(() => '?').join(',') || 'NULL';

  const movimentos = idsMaleta.length ? ((await db.prepare(
    `SELECT mv.id, mv.sku, mv.tipo, mv.qtd, mv.origem, mv.maleta_id, mv.venda_id, mv.obs, mv.criado_em,
            p.desc
       FROM movimentos mv LEFT JOIN produtos p ON p.sku = mv.sku
      WHERE mv.maleta_id IN (${marcas})
      ORDER BY mv.criado_em, mv.id`,
  ).bind(...idsMaleta).all()).results ?? []) : [];

  const itensDaMaleta = new Map();
  if (idsMaleta.length) {
    for (const i of (await db.prepare(
      `SELECT mi.maleta_id, mi.sku, mi.qtd, mi.devolvida, mi.preco_envio, p.desc
         FROM maleta_itens mi LEFT JOIN produtos p ON p.sku = mi.sku
        WHERE mi.maleta_id IN (${marcas}) ORDER BY mi.sku`,
    ).bind(...idsMaleta).all()).results ?? []) {
      if (!itensDaMaleta.has(i.maleta_id)) itensDaMaleta.set(i.maleta_id, []);
      itensDaMaleta.get(i.maleta_id).push(i);
    }
  }

  /* ── eventos ──────────────────────────────────────────────────────── */
  const eventos = [];
  eventos.push({
    quando: rev.criada_em, data: String(rev.criada_em ?? '').slice(0, 10) || null,
    tipo: 'cadastro', grupo: 'cadastro', titulo: 'Cadastro no sistema',
    detalhe: rev.obs || null, origem: { tabela: 'revendedoras', id: rev.id },
  });

  const inicioDaMaleta = new Map();
  for (const mv of movimentos) {
    if (!inicioDaMaleta.has(mv.maleta_id)) inicioDaMaleta.set(mv.maleta_id, mv.criado_em);
  }
  for (const m of maletas) {
    const itens = itensDaMaleta.get(m.id) ?? [];
    const quando = m.aberta_em || inicioDaMaleta.get(m.id) || null;
    /* Maleta cancelada sem peça nenhuma foi um rascunho: o cancelamento
       fica, a "abertura" de algo que nunca levou peça não informa nada. */
    const rascunho = m.status === 'cancelada' && !itens.length;
    if (!rascunho) eventos.push({
      quando, data: quando ? String(quando).slice(0, 10) : null,
      tipo: 'maleta_aberta', grupo: 'maleta', titulo: `Maleta #${m.id} aberta`,
      detalhe: [
        m.acerto_em ? `acerto previsto para ${m.acerto_em}` : null,
        m.obs && m.status === 'aberta' ? m.obs : null,
      ].filter(Boolean).join(' · ') || null,
      pecas: itens.reduce((s, i) => s + Number(i.qtd), 0),
      maletaId: m.id, origem: { tabela: 'maletas', id: m.id },
    });
    if (m.status === 'encerrada' || m.status === 'cancelada') {
      eventos.push({
        quando: m.encerrada_em, data: m.encerrada_em ? String(m.encerrada_em).slice(0, 10) : null,
        tipo: m.status === 'encerrada' ? 'maleta_encerrada' : 'maleta_cancelada',
        grupo: 'maleta',
        titulo: `Maleta #${m.id} ${m.status === 'encerrada' ? 'encerrada' : 'cancelada'}`,
        detalhe: m.obs || null, maletaId: m.id, origem: { tabela: 'maletas', id: m.id },
      });
    }
  }

  /* Movimentos de um mesmo instante, tipo e maleta são UM gesto (um envio
     de 40 peças é uma linha na tela, não 40). Cada evento guarda os ids. */
  const gestos = new Map();
  for (const mv of movimentos) {
    const chave = `${mv.maleta_id}|${mv.tipo}|${mv.origem}|${String(mv.criado_em).slice(0, 16)}`;
    if (!gestos.has(chave)) {
      gestos.set(chave, {
        quando: mv.criado_em, data: String(mv.criado_em).slice(0, 10), tipo: mv.tipo,
        grupo: GRUPO[mv.tipo] ?? 'ajuste',
        titulo: TITULO[mv.tipo] ?? mv.tipo, maletaId: mv.maleta_id,
        pecas: 0, skus: [], documental: /acerto documental/.test(mv.obs ?? ''),
        origem: { tabela: 'movimentos', ids: [] },
      });
    }
    const g = gestos.get(chave);
    const n = mv.tipo === 'consignacao' || mv.tipo === 'devolucao' || mv.tipo === 'cancelamento'
      ? unidades(mv.obs) : Math.abs(Number(mv.qtd));
    g.pecas += n;
    g.skus.push({ sku: mv.sku, desc: mv.desc ?? null, qtd: n });
    g.origem.ids.push(mv.id);
  }
  for (const g of gestos.values()) {
    g.detalhe = `${g.pecas} peça(s), ${g.skus.length} código(s)`
      + (g.documental ? ' · acerto feito fora do sistema, venda no histórico' : '');
    eventos.push(g);
  }

  /* ── acertos: as duas fontes exatas, pela mesma leitura da Visão geral ── */
  const todos = await acertosDeMaleta(db, { periodo: 'tudo' });
  const meus = (todos.acertos ?? []).filter((a) => Number(a.revendedoraId) === Number(id));
  const acertos = [];
  for (const a of meus) {
    const [fonte, ref] = String(a.id).split(':');
    const acerto = {
      id: a.id, fonte: fonte === 'historico' ? 'documento' : 'sistema', data: a.data,
      pecasVendidas: a.pecas, vendido: a.vendido, comissao: a.comissao, liquido: a.liquido,
      conferidoPor: null,
      itensVendidos: [], itensDevolvidos: [], maletaId: null, enviadas: null, devolvidas: null,
      situacaoFinanceira: 'paga',
    };
    if (fonte === 'historico') {
      const op = await db.prepare(
        `SELECT ho.*, vh.data FROM historico_operacoes ho
           JOIN vendas_historicas vh ON vh.lote_id = ho.lote_id AND vh.chave = ho.venda_chave
          WHERE ho.id = ?`,
      ).bind(Number(ref)).first();
      const ev = (() => { try { return JSON.parse(op?.evidencia_json ?? '{}'); } catch { return {}; } })();
      acerto.vendaChave = op?.venda_chave ?? null;
      acerto.linhasPlanilha = ev.linhas ?? null;
      acerto.documento = ev.arquivo ?? ev.fonte ?? null;
      acerto.itensVendidos = ((await db.prepare(
        `SELECT h.sku_base AS sku, COALESCE(p.desc, h.nome_produto_historico) AS desc,
                SUM(h.qtd) AS qtd, SUM(h.valor_total) AS valor
           FROM vendas_historico_itens h LEFT JOIN produtos p ON p.sku = h.sku_base
          WHERE h.lote_id = ? AND h.pedido_chave = ? GROUP BY h.sku_base ORDER BY h.sku_base`,
      ).bind(op.lote_id, op.venda_chave).all()).results ?? []).map((i) => ({
        sku: i.sku, desc: i.desc, qtd: Number(i.qtd), valor: +Number(i.valor ?? 0).toFixed(2),
      }));
      /* A maleta que esse acerto encerrou, quando foi encerrada pelo acerto
         documental: a evidência nomeia a maleta, e a observação da maleta
         cita a chave da venda. Sem isso, não se associa — e é dito. */
      const m = maletas.find((x) => Number(x.id) === Number(ev.maleta))
        ?? maletas.find((x) => String(x.obs ?? '').includes(`acerto documental ${op.venda_chave}`));
      if (m) acerto.maletaId = m.id;
    } else {
      const m = maletas.find((x) => Number(x.id) === Number(ref));
      acerto.maletaId = m?.id ?? null;
      const aj = (() => { try { return JSON.parse(m?.acerto_json ?? '{}'); } catch { return {}; } })();
      acerto.vendaId = aj.vendaId ?? null;
      if (aj.vendaId) {
        const v = await db.prepare('SELECT pago, valor_recebido, total FROM vendas WHERE id = ?').bind(aj.vendaId).first();
        acerto.situacaoFinanceira = v?.pago ? 'paga' : 'a_receber';
        acerto.itensVendidos = ((await db.prepare(
          `SELECT vi.sku, vi.desc, SUM(vi.qtd) AS qtd, SUM(vi.qtd * vi.preco) AS valor, vi.motivo
             FROM venda_itens vi WHERE vi.venda_id = ? GROUP BY vi.sku, vi.motivo ORDER BY vi.sku`,
        ).bind(aj.vendaId).all()).results ?? []).map((i) => ({
          sku: i.sku, desc: i.desc, qtd: Number(i.qtd), valor: +Number(i.valor ?? 0).toFixed(2), destino: i.motivo,
        }));
      }
    }
    if (acerto.maletaId) {
      const itens = itensDaMaleta.get(acerto.maletaId) ?? [];
      acerto.enviadas = itens.reduce((s, i) => s + Number(i.qtd), 0);
      acerto.devolvidas = itens.reduce((s, i) => s + Number(i.devolvida), 0);
      acerto.itensDevolvidos = itens.filter((i) => Number(i.devolvida) > 0)
        .map((i) => ({ sku: i.sku, desc: i.desc, qtd: Number(i.devolvida) }));
    }
    acertos.push(acerto);
    eventos.push({
      quando: a.data, data: a.data, tipo: acerto.fonte === 'documento' ? 'acerto_documental' : 'acerto',
      grupo: 'acerto',
      titulo: acerto.fonte === 'documento' ? 'Acerto (registrado no histórico de vendas)' : 'Acerto no sistema',
      detalhe: `${a.pecas} vendida(s) · vendido ${a.vendido.toFixed(2)} · comissão ${a.comissao.toFixed(2)}`
        + ` · líquido ${a.liquido.toFixed(2)}`,
      pecas: a.pecas, valor: a.liquido, maletaId: acerto.maletaId, acertoId: a.id,
      origem: acerto.fonte === 'documento'
        ? { tabela: 'historico_operacoes', id: Number(ref) }
        : { tabela: 'maletas', id: Number(ref) },
    });
  }

  /* ── pendências de dinheiro da revendedora: vendas dela não pagas ── */
  const pendentes = (await db.prepare(
    `SELECT id, data, total, valor_recebido, origem FROM vendas
      WHERE revendedora_id = ? AND cancelada = 0 AND pago = 0`,
  ).bind(id).all()).results ?? [];
  for (const v of pendentes) {
    eventos.push({
      quando: v.data, data: v.data, tipo: 'pendencia', grupo: 'financeiro',
      titulo: 'Valor a receber', detalhe: `venda ${v.id} (${v.origem})`,
      valor: +(Number(v.total) - Number(v.valor_recebido ?? 0)).toFixed(2),
      origem: { tabela: 'vendas', id: v.id },
    });
  }

  eventos.sort((a, b) => String(b.quando ?? '').localeCompare(String(a.quando ?? ''))
    || String(b.tipo).localeCompare(String(a.tipo)));
  acertos.sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')));

  const soma = (f) => +acertos.reduce((s, a) => s + Number(f(a) ?? 0), 0).toFixed(2);
  const abertas = maletas.filter((m) => m.status === 'aberta' || m.status === 'em_acerto');
  const comEla = abertas.reduce((s, m) => s + (itensDaMaleta.get(m.id) ?? [])
    .reduce((t, i) => t + Number(i.qtd) - Number(i.devolvida), 0), 0);
  return {
    ok: true,
    revendedora: { id: rev.id, nome: rev.nome, status: rev.status, criadaEm: rev.criada_em },
    resumo: {
      acertos: acertos.length,
      pecasVendidas: acertos.reduce((s, a) => s + Number(a.pecasVendidas ?? 0), 0),
      vendido: soma((a) => a.vendido),
      comissao: soma((a) => a.comissao),
      liquido: soma((a) => a.liquido),
      aReceber: +pendentes.reduce((s, v) => s + Number(v.total) - Number(v.valor_recebido ?? 0), 0).toFixed(2),
      maletas: maletas.length,
      maletasAbertas: abertas.length,
      pecasComEla: comEla,
    },
    acertos,
    eventos,
    limites: [
      'Quem conferiu cada acerto não é registrado: o sistema ainda não tem usuários (D4).',
      'Acerto anterior ao sistema só aparece quando há documento da maleta ou venda histórica que o prove.',
    ],
  };
}
