/** Motor de reconciliação — Review → Apply.
 *
 *  Schema e invariantes: docs/RECONCILIATION_ENGINE.md. Este módulo é a
 *  primeira implementação do fluxo:
 *
 *    análise (sync seco) → sessão em revisão → aprovar/rejeitar itens
 *      → aplicar só os aprovados → precondition destino + precondition
 *      origem → executar → gravar resultado → resumo
 *
 *  Princípio (CLAUDE.md §2): não sabe se a proposta ainda vale? Não
 *  escreve. Item cuja precondition falhar vira 'obsoleto' e volta para
 *  revisão numa sessão nova — nunca recalcula e aplica por aproximação.
 *
 *  O Apply NUNCA usa `forcar: true` — esse freio é do fluxo antigo
 *  (POST /api/sync), e o motor de reconciliação existe para substituí-lo,
 *  não para herdar o atalho.
 */
import { json } from './auth.js';
import { movimentar, saldosDoSku, ehKit, consignadoDoSku } from './estoque.js';
import { sincronizar } from './sync.js';
import { Nuvemshop, mapearSkus } from './nuvemshop.js';

/* ----------------------------------------------------------- base_json ---
 * A mesma leitura serve dois papéis: no momento da análise, vira o
 * `base_json` gravado no item; no momento do Apply, é recalculada e
 * comparada contra esse `base_json` — é a Precondition B. Um só código,
 * duas chamadas, para nunca divergir a regra entre "gerar" e "conferir". */

async function lerBaseEstoqueLoja(db, sku, variacao) {
  if (variacao) {
    const r = await db.prepare(
      `SELECT COALESCE(SUM(qtd), 0) AS saldo FROM movimentos WHERE sku = ? AND variacao = ?`
    ).bind(sku, variacao).first();
    return { saldo_variacao: r.saldo };
  }
  if (await ehKit(db, sku)) {
    const s = await saldosDoSku(db, sku);
    return { disponivel_kit: s ? s.disponivel : 0 };
  }
  const p = await db.prepare(`SELECT qtd FROM produtos WHERE sku = ?`).bind(sku).first();
  const qtdTotal = p ? p.qtd : 0;
  const consignado = await consignadoDoSku(db, sku);
  return { qtd_total: qtdTotal, consignado, casa: qtdTotal - consignado };
}

/** Comparação semântica, não textual: {a:1,b:2} e {b:2,a:1} são o mesmo
 *  estado, e "8" precisa bater com 8. */
function baseIgual(a, b) {
  if (a == null || b == null) return a === b;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => Number(a[k]) === Number(b[k]));
}

function numIgual(a, b) {
  const na = Number(a), nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return String(a) === String(b);
  return na === nb;
}

function intSeguro(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

/* ---------------------------------------------------------- abrir sessão -
 * As três origens (nuvemshop / planilha_estoque_total / planilha_produtos_novos)
 * geram itens de formas bem diferentes, mas todas terminam aqui: um só
 * lugar que cria a sessão, supera a anterior da mesma origem, e grava os
 * itens — para sessão, estados, auditoria e idempotência serem sempre os
 * mesmos, não um motor por origem (docs/RECONCILIATION_ENGINE.md § Três
 * origens, um motor). */
async function criarSessaoComItens(db, origem, itens, resumoExtra = {}) {
  // No máximo uma sessão 'revisao' por origem — o índice único garante.
  // A antiga é marcada 'superada' no MESMO batch em que a nova nasce:
  // "uma prévia velha nunca sobrescreve a realidade porque alguém voltou
  // nela depois" (docs/RECONCILIATION_ENGINE.md § Sessões concorrentes).
  await db.batch([
    db.prepare(`UPDATE reconciliacao_sessoes SET status = 'superada' WHERE origem = ? AND status = 'revisao'`).bind(origem),
    db.prepare(`INSERT INTO reconciliacao_sessoes (origem, status, resumo_json) VALUES (?, 'revisao', ?)`)
      .bind(origem, JSON.stringify({ total: itens.length, porRisco: contarPorRisco(itens), ...resumoExtra })),
  ]);

  // Ninguém mais consegue ter criado outra 'revisao' desta origem entre o
  // batch acima e esta leitura: o índice único recusaria. É a NOSSA sessão.
  const sessao = await db.prepare(
    `SELECT id FROM reconciliacao_sessoes WHERE origem = ? AND status = 'revisao' ORDER BY id DESC LIMIT 1`
  ).bind(origem).first();

  if (itens.length) {
    const stmts = itens.map(p => db.prepare(
      `INSERT INTO reconciliacao_itens
         (sessao_id, sku, variacao, descricao, tipo, de, para, base_json, risco, motivo, dados_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      sessao.id, p.sku, p.variacao || null, p.descricao || null, p.tipo,
      p.de === undefined ? null : p.de, p.para === undefined ? null : p.para,
      p.base_json ? JSON.stringify(p.base_json) : null,
      p.risco, p.motivo || null,
      p.dados_json ? JSON.stringify(p.dados_json) : null,
    ));
    await db.batch(stmts);
  }

  return sessao.id;
}

function contarPorRisco(itens) {
  const c = {};
  for (const i of itens) c[i.risco] = (c[i.risco] || 0) + 1;
  return c;
}

/** Origem `nuvemshop`: a análise é a mesma rodada seca de sempre
 *  (`POST /api/sync {"seco": true}`) — o motor não reinventa como
 *  descobrir o que mudaria, só passa a congelar o resultado numa sessão em
 *  vez de deixá-lo evaporar na resposta HTTP. */
export async function abrirSessao(db, env, origem = 'nuvemshop') {
  if (origem !== 'nuvemshop') {
    return json({ erro: `Origem "${origem}" não é gerada por esta rota.` }, 400);
  }

  const preview = await sincronizar(db, env, { seco: true });
  if (!preview.ok) {
    return json({ erro: `Não foi possível gerar a análise: ${preview.erro}` }, 502);
  }

  const itens = [];
  for (const m of preview.mudancas || []) {
    const variacao = m.variacao || null;
    const base = await lerBaseEstoqueLoja(db, m.sku, variacao);
    itens.push({
      sku: m.sku, variacao,
      descricao: m.desc,
      tipo: 'estoque_loja',
      de: String(m.de), para: String(m.para),
      base_json: base,
      risco: m.zera ? 'perigoso' : 'confere',
      motivo: m.zera
        ? 'Zeraria o estoque publicado — confira antes de aprovar.'
        : 'Estoque nosso está diferente do publicado na loja.',
      dados_json: { varianteId: m.varianteId || null, produtoId: m.produtoId || null, locais: m.locais || null },
    });
  }

  const sessaoId = await criarSessaoComItens(db, 'nuvemshop', itens);
  return await detalheSessao(db, sessaoId);
}

/** Origem `planilha_estoque_total`: a planilha da Stéfane é a fonte da
 *  verdade TEMPORÁRIA do físico total por SKU (produtos.qtd) — nunca do
 *  disponível para a Nuvemshop, que continua sendo derivado (total menos
 *  consignado). Ver docs/RECONCILIATION_ENGINE.md § Fonte da verdade.
 *
 *  `produtos` chega já normalizado (SKU, sufixo consolidado, casa/total
 *  resolvido) — o mesmo formato que `POST /api/produtos/importar` sempre
 *  aceitou. Esta função não faz parsing nenhum, só compara e classifica —
 *  ela NUNCA escreve em `produtos` nem em `movimentos`. */
export async function analisarPlanilhaEstoqueTotal(db, produtos) {
  if (!Array.isArray(produtos) || !produtos.length) return json({ erro: 'Lista vazia' }, 400);

  const vistos = new Set();
  const linhas = [];
  let linhasInvalidas = 0;
  for (const p of produtos) {
    const sku = String(p.sku || '').trim();
    if (!sku) { linhasInvalidas++; continue; }
    if (vistos.has(sku)) continue; // planilha já vem consolidada por sufixo — duplicata aqui é a mesma linha
    vistos.add(sku);
    linhas.push({ sku, qtd: intSeguro(p.qtd) });
  }

  const existentes = new Map(
    (await db.prepare(`SELECT sku, qtd FROM produtos`).all()).results.map(p => [p.sku, p.qtd])
  );

  const itens = [];
  const semAlteracao = [];
  // SKU da planilha que não existe no catálogo: este fluxo NÃO cria
  // produto (§3 do pedido — isso é o trabalho de planilha_produtos_novos).
  // Só anunciado, nunca ignorado em silêncio.
  const naoEncontrados = [];

  for (const l of linhas) {
    if (!existentes.has(l.sku)) { naoEncontrados.push(l.sku); continue; }
    const atual = existentes.get(l.sku);
    if (l.qtd === atual) { semAlteracao.push(l.sku); continue; }

    // §7 do pedido: a planilha é verdade do TOTAL, mas não autoriza
    // apagar ou redistribuir maleta em silêncio. Total proposto menor que
    // o que já está com revendedoras é uma contradição de dados — o
    // sistema genuinamente não sabe qual dos dois números está certo.
    const consignado = await consignadoDoSku(db, l.sku);
    if (l.qtd < consignado) {
      itens.push({
        sku: l.sku, tipo: 'ajuste_qtd', de: String(atual), para: String(l.qtd),
        risco: 'desconhecido',
        motivo: `A planilha informa ${l.qtd} unidade(s) totais, mas existem ${consignado} `
              + `registrada(s) com revendedoras. É necessário revisar antes de alterar o estoque.`,
        dados_json: { conflito: 'total_menor_que_consignado', consignadoNaAnalise: consignado },
      });
      continue;
    }

    itens.push({
      sku: l.sku, tipo: 'ajuste_qtd', de: String(atual), para: String(l.qtd),
      risco: (l.qtd === 0 && atual > 0) ? 'perigoso' : 'confere',
      motivo: `Planilha diz ${l.qtd}, sistema tinha ${atual}.`,
    });
  }

  // "Produto que não está na planilha não é apagado nem zerado. Ausência
  // não é informação" — regra já estabelecida (marquesa-safe-import,
  // regra 4) para o importador atual, e mantida aqui pelo mesmo motivo:
  // a planilha pode legitimamente não cobrir kit, código técnico ou linha
  // que a própria Stéfane já não relaciona. Só anunciado — nunca vira
  // item, nunca é tocado. Ver docs/RECONCILIATION_ENGINE.md § decisões
  // abertas para o que precisa de confirmação humana antes de mudar isso.
  const ausentes = [...existentes.keys()].filter(sku => !vistos.has(sku));

  const criticos = itens.filter(i => i.risco === 'desconhecido').length;
  const conflitos = itens.filter(i => i.risco === 'desconhecido' || i.risco === 'perigoso').length;

  const sessaoId = await criarSessaoComItens(db, 'planilha_estoque_total', itens, {
    linhasLidas: produtos.length, linhasInvalidas,
    semAlteracao: semAlteracao.length,
    seraoAlterados: itens.length - itens.filter(i => i.dados_json && i.dados_json.conflito).length,
    novos: naoEncontrados.length, conflitos, criticos,
    naoEncontrados, ausentesDaPlanilha: ausentes,
  });

  return await detalheSessao(db, sessaoId);
}

/** Origem `planilha_produtos_novos`: objetivo único é criar SKU que ainda
 *  não existe. SKU existente é IGNORADO por completo — nunca vira item,
 *  nunca é comparado, nunca é tocado, mesmo que quantidade/descrição/preço
 *  da planilha sejam diferentes do catálogo. Este fluxo é estruturalmente
 *  incapaz de gerar um item para SKU existente: a checagem `existentes.has`
 *  acontece ANTES de qualquer outro processamento da linha. */
export async function analisarPlanilhaProdutosNovos(db, produtos) {
  if (!Array.isArray(produtos) || !produtos.length) return json({ erro: 'Lista vazia' }, 400);

  const existentes = new Set((await db.prepare(`SELECT sku FROM produtos`).all()).results.map(p => p.sku));
  const cats = new Set((await db.prepare(`SELECT nome FROM categorias`).all()).results.map(c => c.nome));

  const itens = [];
  const vistos = new Set();
  let invalidos = 0, ignorados = 0;

  for (const p of produtos) {
    const sku = String(p.sku || '').trim();
    if (!sku) { invalidos++; continue; }
    if (vistos.has(sku)) continue; // mesma linha duas vezes na planilha
    vistos.add(sku);

    if (existentes.has(sku)) { ignorados++; continue; } // §11: SKU existente — nenhuma alteração, ponto final

    const preco = (p.preco === null || p.preco === undefined || p.preco === '' || +p.preco === 0) ? null : +p.preco;
    const catInformada = p.cat || 'Outros';
    const categoriaDesconhecida = !cats.has(catInformada);
    const cat = categoriaDesconhecida ? 'Outros' : catInformada;
    const qtdInicial = intSeguro(p.qtd);
    const desc = String(p.desc || '').trim() || sku;

    itens.push({
      sku, tipo: 'produto_novo', de: null, para: String(qtdInicial),
      risco: (preco === null || categoriaDesconhecida) ? 'confere' : 'trivial',
      motivo: preco === null
        ? 'Sem preço na planilha — ficará sem preço (§24 de api/REGRAS.md), defina antes de vender.'
        : categoriaDesconhecida
          ? `Categoria "${catInformada}" não existe — cairá em "Outros".`
          : 'Código novo, pronto para criar.',
      dados_json: { desc, cat, preco, qtdInicial },
    });
  }

  const sessaoId = await criarSessaoComItens(db, 'planilha_produtos_novos', itens, {
    linhasLidas: produtos.length, invalidos, ignorados, novos: itens.length,
    precisamRevisao: itens.filter(i => i.risco !== 'trivial').length,
  });

  return await detalheSessao(db, sessaoId);
}

/* --------------------------------------------------------- ler sessão ---- */

export async function detalheSessao(db, sessaoId) {
  const sessao = await db.prepare(`SELECT * FROM reconciliacao_sessoes WHERE id = ?`).bind(sessaoId).first();
  if (!sessao) return json({ erro: 'Sessão não encontrada' }, 404);
  const itens = (await db.prepare(
    `SELECT * FROM reconciliacao_itens WHERE sessao_id = ? ORDER BY risco = 'perigoso' DESC, id`
  ).bind(sessaoId).all()).results;

  return json({
    id: sessao.id, origem: sessao.origem, status: sessao.status,
    criadaEm: sessao.criada_em, decididaEm: sessao.decidida_em, aplicadaEm: sessao.aplicada_em,
    resumo: sessao.resumo_json ? JSON.parse(sessao.resumo_json) : null,
    relato: sessao.relato_json ? JSON.parse(sessao.relato_json) : null,
    erro: sessao.erro,
    itens: itens.map(i => ({
      id: i.id, sku: i.sku, variacao: i.variacao, descricao: i.descricao, tipo: i.tipo,
      de: i.de, para: i.para, risco: i.risco, motivo: i.motivo, status: i.status, erro: i.erro,
      // Dado estruturado, não só a frase em `motivo` — o frontend consegue
      // decidir o que mostrar (badge de conflito, campos do produto novo,
      // endereçamento da Nuvemshop) sem precisar interpretar texto solto.
      dados: i.dados_json ? JSON.parse(i.dados_json) : null,
    })),
  });
}

/* ---------------------------------------------------- aprovar / rejeitar - */

/** Só decide item de sessão em revisão, e só item pendente — as duas
 *  travas são compare-and-set no SQL, não leitura-e-depois-escreve. */
export async function decidirItem(db, sessaoId, itemId, novoStatus) {
  const sessao = await db.prepare(`SELECT id, status FROM reconciliacao_sessoes WHERE id = ?`).bind(sessaoId).first();
  if (!sessao) return json({ erro: 'Sessão não encontrada' }, 404);
  if (sessao.status !== 'revisao') {
    return json({ erro: `Sessão está "${sessao.status}" — só dá para decidir itens de uma sessão em revisão` }, 409);
  }

  const r = await db.prepare(
    `UPDATE reconciliacao_itens SET status = ? WHERE id = ? AND sessao_id = ? AND status = 'pendente'`
  ).bind(novoStatus, itemId, sessaoId).run();
  if (!r.meta.changes) {
    const item = await db.prepare(`SELECT status FROM reconciliacao_itens WHERE id = ? AND sessao_id = ?`).bind(itemId, sessaoId).first();
    if (!item) return json({ erro: 'Item não encontrado nesta sessão' }, 404);
    return json({ erro: `Item já está "${item.status}" — não é mais "pendente"` }, 409);
  }

  // Revisão "termina" quando não sobra pendente nenhum — é o que
  // decidida_em documenta, sem precisar de coluna nova por item.
  const restam = await db.prepare(
    `SELECT COUNT(*) AS n FROM reconciliacao_itens WHERE sessao_id = ? AND status = 'pendente'`
  ).bind(sessaoId).first();
  if (restam.n === 0) {
    await db.prepare(
      `UPDATE reconciliacao_sessoes SET decidida_em = datetime('now') WHERE id = ? AND decidida_em IS NULL`
    ).bind(sessaoId).run();
  }

  return json({ ok: true });
}

export const aprovarItem = (db, sessaoId, itemId) => decidirItem(db, sessaoId, itemId, 'aprovado');
export const rejeitarItem = (db, sessaoId, itemId) => decidirItem(db, sessaoId, itemId, 'rejeitado');

/* --------------------------------------------------------------- cancelar */

export async function cancelarSessao(db, sessaoId) {
  const r = await db.prepare(
    `UPDATE reconciliacao_sessoes SET status = 'cancelada' WHERE id = ? AND status = 'revisao'`
  ).bind(sessaoId).run();
  if (!r.meta.changes) {
    const sessao = await db.prepare(`SELECT status FROM reconciliacao_sessoes WHERE id = ?`).bind(sessaoId).first();
    if (!sessao) return json({ erro: 'Sessão não encontrada' }, 404);
    return json({ erro: `Sessão está "${sessao.status}" — só dá para cancelar uma sessão em revisão` }, 409);
  }
  return json({ ok: true });
}

/* ------------------------------------------------------------------ apply */

/** Mensagem seguro para status='erro' — nunca token, nunca corpo cru da
 *  resposta da Nuvemshop (pode ecoar o header Authorization em alguns
 *  erros de proxy). */
function mensagemSeguraDeErro(e) {
  const msg = String((e && e.message) || e || 'Falha desconhecida');
  return msg.replace(/Bearer\s+\S+/gi, 'Bearer ***').slice(0, 300);
}

/** Aplica os itens aprovados de uma sessão. Não toca em pendente,
 *  rejeitado, obsoleto, erro ou aplicado — só em 'aprovado'.
 *
 *  Ordem por item: Precondition A (destino) → Precondition B (origem) →
 *  só então a escrita. Nenhuma escrita acontece antes das duas passarem.
 *
 *  RETOMADA (docs/RECONCILIATION_ENGINE.md § Sessão aplicando): se o Worker
 *  morre no meio de um Apply anterior, a sessão fica presa em 'aplicando'
 *  para sempre — não existe um segundo processo (cron, timeout) que a
 *  destrave sozinha, e não é este o lugar para inventar um. Em vez disso,
 *  a MESMA rota aceita reentrar numa sessão já 'aplicando': ela não é um
 *  estado exclusivo de "alguém está processando agora", é "esta sessão
 *  ainda não terminou de decidir seus itens aprovados" — e chamar de novo
 *  é seguro porque cada item, e cada movimento, tem sua própria proteção
 *  (CAS de item + UNIQUE de `reconciliacao_item_id`). Isso também cobre
 *  duas chamadas concorrentes: nenhuma das duas precisa "vencer" a outra
 *  para progredir — as duas processam, e a proteção por item garante que
 *  o efeito acontece uma vez só. O que continua proibido é reabrir sessão
 *  TERMINADA (aplicada, aplicada_parcial, cancelada, superada, erro). */
export async function aplicarSessao(db, env, sessaoId) {
  const sessaoInicial = await db.prepare(`SELECT * FROM reconciliacao_sessoes WHERE id = ?`).bind(sessaoId).first();
  if (!sessaoInicial) return json({ erro: 'Sessão não encontrada' }, 404);

  if (sessaoInicial.status === 'revisao') {
    const temAprovado = await db.prepare(
      `SELECT 1 FROM reconciliacao_itens WHERE sessao_id = ? AND status = 'aprovado' LIMIT 1`
    ).bind(sessaoId).first();
    if (!temAprovado) return json({ erro: 'Nenhum item aprovado — nada para aplicar' }, 400);

    // Transição de entrada. Se outra chamada venceu esta corrida — changes
    // === 0 — não é erro: a sessão está 'aplicando' agora (por ela, ou por
    // uma retomada que chegou entre a leitura acima e este UPDATE), e
    // seguimos como retomada logo abaixo, sem tratamento especial.
    await db.prepare(
      `UPDATE reconciliacao_sessoes SET status = 'aplicando' WHERE id = ? AND status = 'revisao'`
    ).bind(sessaoId).run();
  } else if (sessaoInicial.status !== 'aplicando') {
    return json({
      erro: `Sessão está "${sessaoInicial.status}" — só dá para aplicar (ou retomar) uma sessão em revisão ou já aplicando`,
    }, 409);
  }

  const aprovados = (await db.prepare(
    `SELECT * FROM reconciliacao_itens WHERE sessao_id = ? AND status = 'aprovado'`
  ).bind(sessaoId).all()).results;

  let resultadoDaChamada;
  try {
    resultadoDaChamada = await executarAprovados(db, env, sessaoId, sessaoInicial.origem, aprovados);
  } catch (e) {
    // Falha catastrófica: não deu para nem contabilizar o que foi feito
    // nesta chamada. A sessão fica 'erro' — mas isto NÃO é terminal do
    // jeito que os outros estados terminais são: um erro catastrófico
    // aqui normalmente é a loja fora do ar antes de processar item
    // nenhum (ver executarAprovados), e reaplicar mais tarde é seguro
    // pela mesma proteção por item — só que a política desta tarefa
    // (§12) é não reabrir sessão terminada, então 'erro' também fecha.
    // Quem precisar retentar cria sessão nova.
    await db.prepare(
      `UPDATE reconciliacao_sessoes SET status = 'erro', erro = ?, aplicada_em = datetime('now') WHERE id = ?`
    ).bind(mensagemSeguraDeErro(e), sessaoId).run();
    return json({ erro: `Apply interrompido: ${mensagemSeguraDeErro(e)}` }, 500);
  }

  // Finalização idempotente: sempre a partir do estado REAL no banco, não
  // só do que esta chamada processou — uma retomada pode encontrar itens
  // que uma execução anterior (que morreu antes de finalizar a sessão) já
  // tinha deixado aplicado/obsoleto/erro, e a contagem final precisa
  // refletir a sessão inteira, não só o que esta chamada fez.
  const restamAprovados = await db.prepare(
    `SELECT COUNT(*) AS n FROM reconciliacao_itens WHERE sessao_id = ? AND status = 'aprovado'`
  ).bind(sessaoId).first();
  if (restamAprovados.n > 0) {
    // Um item aprovado ainda não foi decidido — outra execução concorrente
    // está com ele agora (ou morreu com ele em mãos). Não finaliza: a
    // sessão continua 'aplicando', e uma chamada futura retoma.
    return json({ sessao: sessaoId, status: 'aplicando', parcial: true, ...resultadoDaChamada });
  }

  const contagem = await db.prepare(
    `SELECT
       SUM(CASE WHEN status = 'aplicado' THEN 1 ELSE 0 END) AS aplicados,
       SUM(CASE WHEN status = 'obsoleto' THEN 1 ELSE 0 END) AS obsoletos,
       SUM(CASE WHEN status = 'erro' THEN 1 ELSE 0 END) AS erros
     FROM reconciliacao_itens
     WHERE sessao_id = ? AND status IN ('aplicado', 'obsoleto', 'erro')`
  ).bind(sessaoId).first();
  const resultado = {
    total: (contagem.aplicados || 0) + (contagem.obsoletos || 0) + (contagem.erros || 0),
    aplicados: contagem.aplicados || 0, obsoletos: contagem.obsoletos || 0, erros: contagem.erros || 0,
    itens: resultadoDaChamada.itens,
  };
  const statusFinal = resultado.erros === 0 && resultado.obsoletos === 0 ? 'aplicada' : 'aplicada_parcial';

  // CAS também na finalização: se outra chamada concorrente já finalizou
  // (só uma das duas encontra a sessão ainda 'aplicando' neste instante),
  // a segunda não sobrescreve — o relato já gravado descreve o mesmo
  // estado final, porque a contagem acima é sempre lida do banco inteiro.
  await db.prepare(
    `UPDATE reconciliacao_sessoes SET status = ?, aplicada_em = datetime('now'), relato_json = ?
      WHERE id = ? AND status = 'aplicando'`
  ).bind(statusFinal, JSON.stringify(resultado), sessaoId).run();

  return json({ sessao: sessaoId, status: statusFinal, ...resultado });
}

async function executarAprovados(db, env, sessaoId, sessaoOrigem, aprovados) {
  const detalhe = { total: aprovados.length, aplicados: 0, obsoletos: 0, erros: 0, itens: [] };

  // Uma leitura só da Nuvemshop para todos os itens `estoque_loja` desta
  // aplicação — "não confiar no snapshot antigo" não significa uma
  // requisição HTTP por item.
  const precisaLojaFresca = aprovados.some(i => i.tipo === 'estoque_loja');
  let mapaFresco = null, lojaCliente = null;
  if (precisaLojaFresca) {
    lojaCliente = new Nuvemshop(env);
    if (!lojaCliente.configurada()) throw new Error('A loja não está conectada — não dá para conferir a precondition de destino.');
    const produtosLoja = await lojaCliente.produtos();
    mapaFresco = mapearSkus(produtosLoja).mapa;
  }

  for (const item of aprovados) {
    try {
      const checagem = item.tipo === 'estoque_loja'
        ? checarPreconditionsEstoqueLoja(item, mapaFresco)
        : await checarPreconditionsInternas(db, item);

      if (!checagem.ok) {
        await db.prepare(
          `UPDATE reconciliacao_itens SET status = 'obsoleto', erro = ? WHERE id = ? AND status = 'aprovado'`
        ).bind(checagem.motivo, item.id).run();
        detalhe.obsoletos++;
        detalhe.itens.push({ id: item.id, sku: item.sku, variacao: item.variacao, tipo: item.tipo, resultado: 'obsoleto', motivo: checagem.motivo });
        continue;
      }

      if (item.tipo === 'estoque_loja') {
        await aplicarEstoqueLoja(db, lojaCliente, item, checagem.alvo, checagem.destinoAtual);
      } else if (item.tipo === 'ajuste_qtd') {
        await aplicarAjusteQtd(db, sessaoId, item);
      } else if (item.tipo === 'produto_novo') {
        // Autorizado SOMENTE para planilha_produtos_novos (§13 do pedido) —
        // hoje só ela gera este tipo, mas a checagem fica explícita aqui
        // também, em vez de confiar só em "ninguém mais gera isso".
        if (sessaoOrigem !== 'planilha_produtos_novos') {
          throw new Error(`Tipo "produto_novo" só é executado a partir de sessões "planilha_produtos_novos" (esta é "${sessaoOrigem}").`);
        }
        await aplicarProdutoNovo(db, sessaoId, item);
      } else {
        throw Object.assign(new Error(`Tipo "${item.tipo}" ainda não tem execução implementada no Apply.`), { naoImplementado: true });
      }

      detalhe.aplicados++;
      detalhe.itens.push({ id: item.id, sku: item.sku, variacao: item.variacao, tipo: item.tipo, resultado: 'aplicado' });
    } catch (e) {
      const motivo = mensagemSeguraDeErro(e);
      if (e && e.obsoleto) {
        // A Precondition B só pode ser conferida dentro de aplicarEstoqueLoja
        // (é assíncrona) — se falhar ali, ainda é concorrência, não falha
        // técnica, então o item vira 'obsoleto' e NENHUM PATCH foi enviado
        // (a checagem acontece antes da escrita, ver aplicarEstoqueLoja).
        await db.prepare(
          `UPDATE reconciliacao_itens SET status = 'obsoleto', erro = ? WHERE id = ? AND status = 'aprovado'`
        ).bind(motivo, item.id).run();
        detalhe.obsoletos++;
        detalhe.itens.push({ id: item.id, sku: item.sku, variacao: item.variacao, tipo: item.tipo, resultado: 'obsoleto', motivo });
        continue;
      }
      // Se o item já foi rebaixado para 'erro' por aplicarAjusteQtd (a
      // escrita interna falhou e o item já não está mais em 'aprovado'),
      // este UPDATE não muda nada. Inofensivo.
      await db.prepare(
        `UPDATE reconciliacao_itens SET status = 'erro', erro = ? WHERE id = ? AND status = 'aprovado'`
      ).bind(motivo, item.id).run();
      detalhe.erros++;
      detalhe.itens.push({ id: item.id, sku: item.sku, variacao: item.variacao, tipo: item.tipo, resultado: 'erro', motivo });
    }
  }

  return detalhe;
}

/* ----------------------------------------------------------- preconditions */

function checarPreconditionsEstoqueLoja(item, mapaFresco) {
  const entrada = mapaFresco.get(item.sku);
  if (!entrada) {
    return { ok: false, motivo: `O código ${item.sku} não existe mais (ou saiu do ar) na Nuvemshop.` };
  }

  let dados;
  try {
    dados = JSON.parse(item.dados_json || '{}');
  } catch {
    return { ok: false, motivo: `A revisão de ${item.sku} perdeu o endereço congelado da variante. Gere uma análise nova.` };
  }

  const varianteId = dados.varianteId;
  if (varianteId == null || varianteId === '') {
    return { ok: false, motivo: `A revisão de ${item.sku} não congelou o variant_id. Gere uma análise nova; nada foi escrito.` };
  }

  const variante = entrada.variantes.find(v => String(v.varianteId) === String(varianteId));
  if (!variante) {
    return { ok: false, motivo: `A variante ${varianteId} de ${item.sku} não existe mais na loja. Gere uma análise nova.` };
  }
  if (dados.produtoId != null && String(variante.produtoId) !== String(dados.produtoId)) {
    return { ok: false, motivo: `A variante ${varianteId} mudou de produto na Nuvemshop. Gere uma análise nova; nada foi escrito.` };
  }

  const destinoAtual = variante.estoque;
  const alvo = {
    produtoId: variante.produtoId,
    varianteId: variante.varianteId,
    locais: variante.locais || [],
  };

  // A classificação completa (inclusive a Precondition A) mora em
  // aplicarEstoqueLoja, porque agora ela também precisa decidir entre
  // "ainda não aplicado" e "provavelmente já aplicado por uma tentativa
  // anterior que morreu antes de gravar o status" — e essa segunda
  // pergunta exige comparar contra `para`, não só contra `de`. Esta função
  // só resolve o endereçamento (síncrono, mapa em memória).
  return { ok: true, alvo, destinoAtual };
}

/** Para tipos com escrita interna: destino é o nosso próprio produtos.qtd
 *  (a mesma coluna que a escrita vai mudar), e não existe leitura externa
 *  para fazer. */
async function checarPreconditionsInternas(db, item) {
  if (item.tipo === 'ajuste_qtd') {
    const p = await db.prepare(`SELECT qtd FROM produtos WHERE sku = ?`).bind(item.sku).first();
    if (!p) return { ok: false, motivo: `${item.sku} não está mais no catálogo.` };
    // Precondition A — destino: produtos.qtd ainda é o que a análise viu.
    if (!numIgual(p.qtd, item.de)) {
      return { ok: false, motivo: `${item.sku} está com ${p.qtd} agora; a análise viu ${item.de}. Estoque mudou desde então.` };
    }
    // ajuste_qtd não tem base_json (a origem é o arquivo importado — ver
    // docs/RECONCILIATION_ENGINE.md § base_json): a Precondition A já cobre
    // a deriva possível.

    // Precondition extra, só para ajuste_qtd: a planilha nunca autoriza
    // deixar o total abaixo do que já está consignado com revendedoras —
    // regra de negócio formal (§7). Conferida de NOVO aqui, no Apply, não
    // só na análise: a maleta pode ter mudado depois da análise, ou o
    // conflito sinalizado pode ter sido aprovado mesmo assim. Nunca aplica
    // por aproximação — vira obsoleto, sempre.
    const paraNum = Number(item.para);
    if (Number.isFinite(paraNum)) {
      const consignadoAgora = await consignadoDoSku(db, item.sku);
      if (paraNum < consignadoAgora) {
        return {
          ok: false,
          motivo: `A proposta deixaria o total em ${paraNum}, mas existem ${consignadoAgora} unidade(s) `
                + `com revendedoras agora. Não aplicado — revise a maleta ou a planilha antes.`,
        };
      }
    }
    return { ok: true };
  }
  if (item.tipo === 'produto_novo') {
    // Precondition A — destino: o SKU ainda não existe. Se passou a
    // existir entre a análise e o apply (outra ação qualquer, não a nossa
    // — ver aplicarProdutoNovo para a recuperação da NOSSA própria
    // tentativa), o item fica obsoleto: não sabemos se o produto que
    // apareceu é o mesmo que a planilha propunha.
    const existe = await db.prepare(`SELECT 1 FROM produtos WHERE sku = ?`).bind(item.sku).first();
    if (existe) {
      return { ok: false, motivo: `${item.sku} passou a existir no catálogo entre a análise e o apply — não sobrescreve.` };
    }
    return { ok: true };
  }
  // campo: ainda não tem execução no Apply (ver executarAprovados) — a
  // checagem aqui não é alcançada porque o tipo cai no branch "não
  // implementado" antes.
  return { ok: true };
}

async function checarBaseAtual(db, item) {
  if (!item.base_json) return { ok: true };
  const atual = await lerBaseEstoqueLoja(db, item.sku, item.variacao);
  const esperado = JSON.parse(item.base_json);
  if (!baseIgual(atual, esperado)) {
    return { ok: false, motivo: `O estoque daqui mudou desde a análise (era ${item.base_json}, agora é ${JSON.stringify(atual)}).` };
  }
  return { ok: true };
}

/* ------------------------------------------------------------ execuções -- */

/** Classifica o destino de um item `estoque_loja` frente ao estado atual —
 *  a peça central da recuperação de PATCH (docs/RECONCILIATION_ENGINE.md §
 *  Idempotência externa). Três respostas possíveis, nunca uma heurística
 *  frouxa: só `de`, `para`, `base_json` atual e destino atual decidem.
 *
 *  'pendente'  destino ainda é `de` → o efeito não aconteceu. Aplica se a
 *              origem também continuar válida; senão é 'obsoleto'.
 *  'recuperado' destino já é `para` E a origem continua batendo com
 *              `base_json` → o efeito já está lá. Provavelmente um PATCH de
 *              uma tentativa anterior que morreu antes de salvar o status.
 *              NÃO reenvia — só confirma.
 *  'obsoleto'  qualquer outro caso: destino não é nem `de` nem `para` (algo
 *              mais mudou lá fora), OU destino é `para` mas a origem já não
 *              é `base_json` (o valor bate por coincidência, não porque foi
 *              ESTE apply — não conclui aplicado sozinho, § "não confunda
 *              já aplicado com obsoleto"). */
async function classificarDestinoEstoqueLoja(db, item, destinoAtual) {
  const baseEsperada = item.base_json ? JSON.parse(item.base_json) : null;
  const baseAtual = item.base_json ? await lerBaseEstoqueLoja(db, item.sku, item.variacao) : null;
  const origemValida = !baseEsperada || baseIgual(baseAtual, baseEsperada);
  const motivoOrigem = () => `O estoque daqui mudou desde a análise (era ${item.base_json}, agora é ${JSON.stringify(baseAtual)}).`;

  if (numIgual(destinoAtual, item.para)) {
    if (!origemValida) {
      return {
        estado: 'obsoleto',
        motivo: `A loja já mostra o valor proposto (${item.para}), mas ${motivoOrigem()} Sem a origem batendo, não dá para confirmar que foi este Apply — pode ser coincidência.`,
      };
    }
    return { estado: 'recuperado' };
  }

  if (!numIgual(destinoAtual, item.de)) {
    return {
      estado: 'obsoleto',
      motivo: `A loja mostra ${destinoAtual} agora — não é nem o "de" (${item.de}) nem o "para" (${item.para}) da análise. Alguém mexeu lá fora.`,
    };
  }

  if (!origemValida) {
    return { estado: 'obsoleto', motivo: motivoOrigem() };
  }

  return { estado: 'pendente' };
}

async function marcarAplicado(db, itemId) {
  await db.prepare(
    `UPDATE reconciliacao_itens SET status = 'aplicado' WHERE id = ? AND status = 'aprovado'`
  ).bind(itemId).run();
  // changes === 0 é esperado sob concorrência: outra execução já marcou.
  // O efeito (PATCH ou movimento) só é reconfirmado, nunca refeito.
}

async function aplicarEstoqueLoja(db, loja, item, alvo, destinoAtual) {
  const classe = await classificarDestinoEstoqueLoja(db, item, destinoAtual);

  if (classe.estado === 'obsoleto') {
    const e = new Error(classe.motivo);
    e.obsoleto = true;
    throw e;
  }

  if (classe.estado === 'recuperado') {
    // O efeito desejado já está na loja e a origem continua válida —
    // recuperação idempotente de um PATCH cuja resposta se perdeu (ou cujo
    // Worker morreu antes de gravar o status). Nenhum PATCH novo.
    await marcarAplicado(db, item.id);
    return;
  }

  const para = Number(item.para);
  const variante = { id: alvo.varianteId };
  if (alvo.locais.length) variante.inventory_levels = [{ location_id: alvo.locais[0], stock: para }];
  else variante.stock = para; // loja ainda sem multi-estoque, igual sync.js

  // PATCH manda valor ABSOLUTO — reenviar o mesmo item duas vezes dá o
  // mesmo resultado (é o que faz a classificação 'recuperado' acima ser
  // segura mesmo sem trava no lado da Nuvemshop).
  await loja.atualizarEstoque([{ id: alvo.produtoId, variants: [variante] }]);
  await marcarAplicado(db, item.id);
}

/** `ajuste_qtd` — a proteção real é o índice único
 *  `idx_movimentos_reconciliacao_item` (api/migracao-idempotencia-reconciliacao.sql),
 *  não mais um CAS separado antes do batch. O INSERT do movimento e a
 *  atualização de `produtos.qtd` e do status do item entram no MESMO
 *  `db.batch()` — atômico de verdade: ou os três acontecem, ou nenhum. Não
 *  existe mais o instante "item reivindicado, movimento ainda não gravado"
 *  que a versão anterior desta função tinha (ela reivindicava ANTES do
 *  batch, porque D1 batch não aborta condicionalmente no meio). Se o
 *  Worker morre DURANTE o batch, o D1 não commitou nada — na retomada o
 *  item continua 'aprovado' e este código roda de novo do zero, sem
 *  segundo efeito, porque nada do primeiro tentativa existiu de verdade.
 *
 *  O que o índice único ainda protege: duas EXECUÇÕES CONCORRENTES do
 *  mesmo item (duas chamadas de /aplicar disputando o mesmo 'aprovado').
 *  A primeira a commitar grava o movimento; a segunda tenta inserir outro
 *  movimento com o MESMO `reconciliacao_item_id` e o banco recusa — a
 *  UNIQUE constraint falhando não é erro técnico aqui, é a prova de que
 *  outra execução já resolveu este item, e o código trata como recuperação
 *  idempotente (confirma 'aplicado', não tenta de novo, não conta como
 *  'erro'). */
async function aplicarAjusteQtd(db, sessaoId, item) {
  const baseOk = await checarBaseAtual(db, item); // base_json é NULL para este tipo — sempre ok, mas mantém o mesmo caminho
  if (!baseOk.ok) {
    const e = new Error(baseOk.motivo);
    e.obsoleto = true;
    throw e;
  }

  const delta = Number(item.para) - Number(item.de);
  if (!Number.isFinite(delta) || delta === 0) {
    // Nada para mover — a proposta em si não tem efeito de estoque.
    // Ainda assim marca aplicado: não é erro nem obsolescência, é uma
    // proposta que, quando confirmada, não move ponteiro nenhum.
    await marcarAplicado(db, item.id);
    return;
  }

  try {
    await db.batch([
      ...movimentar(db, {
        sku: item.sku, tipo: 'ajuste', quantidade: delta, origem: 'reconciliacao',
        variacao: item.variacao || null, reconciliacaoItemId: item.id,
        obs: `Reconciliação sessão ${sessaoId}, item ${item.id}`,
      }),
      db.prepare(`UPDATE reconciliacao_itens SET status = 'aplicado' WHERE id = ? AND status = 'aprovado'`).bind(item.id),
    ]);
  } catch (e) {
    if (await movimentoJaExiste(db, item.id)) {
      // Outra execução (concorrente, ou uma retomada que chegou primeiro)
      // já gravou o movimento deste item nesta mesma corrida — a UNIQUE
      // constraint recusou o nosso INSERT, e o batch inteiro voltou atrás
      // (D1 batch é tudo-ou-nada: a atualização de status desta tentativa
      // TAMBÉM não foi gravada). Confirma o que já é verdade — não é 'erro'.
      await marcarAplicado(db, item.id);
      return;
    }
    // Falha de verdade (D1 indisponível, erro de constraint que não é o
    // esperado): o batch não commitou nada — nem movimento, nem status —
    // então não há estado intermediário para limpar. O item continua
    // 'aprovado' de fato; marcamos 'erro' aqui só para não silenciar a
    // falha, e uma retomada futura pode tentar de novo com segurança.
    await db.prepare(`UPDATE reconciliacao_itens SET status = 'erro', erro = ? WHERE id = ? AND status = 'aprovado'`)
      .bind(mensagemSeguraDeErro(e), item.id).run();
    throw e;
  }
}

async function movimentoJaExiste(db, reconciliacaoItemId) {
  const r = await db.prepare(
    `SELECT 1 FROM movimentos WHERE reconciliacao_item_id = ? LIMIT 1`
  ).bind(reconciliacaoItemId).first();
  return !!r;
}

/** `produto_novo` — só para `planilha_produtos_novos`. Cria o produto e,
 *  se a planilha trouxe quantidade inicial, o movimento de entrada
 *  correspondente — tudo no MESMO `db.batch()`, mesmo raciocínio de
 *  atomicidade de `aplicarAjusteQtd`.
 *
 *  A idempotência aqui vem de graça: `produtos.sku` já é `PRIMARY KEY`.
 *  Duas execuções tentando criar o MESMO SKU — concorrência, ou uma
 *  retomada que chega depois de uma tentativa que morreu já tendo
 *  commitado — colidem na própria chave primária, não precisam de nenhum
 *  índice novo. Quem perde a corrida detecta que o produto já existe e
 *  trata como recuperação, não como erro. */
async function aplicarProdutoNovo(db, sessaoId, item) {
  const dados = JSON.parse(item.dados_json || '{}');
  const qtdInicial = Number(dados.qtdInicial) || 0;

  const stmts = [
    db.prepare(`INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES (?, ?, ?, ?, 0)`)
      .bind(item.sku, dados.desc || item.sku, dados.cat || 'Outros', dados.preco ?? null),
  ];
  if (qtdInicial !== 0) {
    stmts.push(...movimentar(db, {
      sku: item.sku, tipo: 'entrada', quantidade: qtdInicial, origem: 'reconciliacao',
      reconciliacaoItemId: item.id, obs: `Reconciliação (produto novo) sessão ${sessaoId}, item ${item.id}`,
    }));
  }
  stmts.push(db.prepare(`UPDATE reconciliacao_itens SET status = 'aplicado' WHERE id = ? AND status = 'aprovado'`).bind(item.id));

  try {
    await db.batch(stmts);
  } catch (e) {
    const existeAgora = await db.prepare(`SELECT 1 FROM produtos WHERE sku = ?`).bind(item.sku).first();
    if (existeAgora) {
      // Ou foi a NOSSA própria tentativa anterior (o batch commitou de
      // verdade e o Worker morreu antes de responder), ou outra execução
      // concorrente venceu. Nos dois casos o produto já existe com o
      // efeito desejado — confirma, não recria, não é erro.
      await marcarAplicado(db, item.id);
      return;
    }
    await db.prepare(`UPDATE reconciliacao_itens SET status = 'erro', erro = ? WHERE id = ? AND status = 'aprovado'`)
      .bind(mensagemSeguraDeErro(e), item.id).run();
    throw e;
  }
}
