/** Comandos de catalogo que ainda moravam dentro do despachante: importar a
 *  planilha de produtos, editar a ficha, montar ou desmontar um kit e
 *  espelhar o catalogo da loja.
 *
 *  Codigo movido inteiro, sem alteracao de comportamento. Ele ainda devolve
 *  `Response` em vez de resultado puro; separar decisao de formatacao e
 *  trabalho da Fase 4.
 *
 *  Duas invariantes vivem aqui e continuam valendo: a ficha recusa editar
 *  `qtd` (saldo so muda por movimento, 19) e kit tem saldo proprio zero,
 *  nunca contem outro kit (CAT-04). */
import { json } from './auth.js';
import { movimentar, consignadoDoSku, ehKit } from './estoque.js';
import { comExecucao } from './plataforma/execucao.js';
/* A normalizacao CANONICA. Este arquivo fazia `String(p.sku).trim()`
   enquanto `catalogo.js › cadastrarNovos` fazia `normSku` — duas
   normalizacoes em dois caminhos de CRIACAO, que e exatamente como nasce a
   peca fantasma que a loja nunca encontra. */
import { normSku } from './sku.js';
import { SEM_CATEGORIA } from './catalogo/completude.js';

/* Copia deliberada do helper do despachante, que ainda precisa dele. */
const int = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };

/** §22: a importação não corrige em silêncio — devolve o que estranhou.
 *  §24: preço ausente entra como NULL, nunca como zero. */
/** Importação de planilha: uma rodada só, muitos ajustes de estoque. */
export function importarProdutos(db, entrada = {}) {
  return comExecucao('importacao', {
    dados: { fonte: 'produtos', itens: (entrada.produtos || []).length },
    resumir: (r) => ({ status: r && r.status }),
  }, () => importarProdutosRodada(db, entrada));
}

async function importarProdutosRodada(db, { produtos }) {
  if (!Array.isArray(produtos) || !produtos.length) return json({ erro: 'Lista vazia' }, 400);

  /* Indexado pela forma CANONICA, nao pelo que esta escrito na coluna: um
     `br1234` na planilha precisa reconhecer o `BR1234` do catalogo como a
     mesma peca, em vez de tentar inserir um segundo produto e bater no
     indice unico com um 500 sem explicacao. */
  const existentes = new Map(
    (await db.prepare(`SELECT sku, qtd FROM produtos`).all()).results
      .map(p => [normSku(p.sku), { sku: p.sku, qtd: p.qtd }])
  );
  const cats = new Set((await db.prepare(`SELECT nome FROM categorias`).all()).results.map(c => c.nome));

  const stmts = [], avisos = [];
  let novos = 0, ajustados = 0;

  for (const p of produtos) {
    const sku = normSku(p.sku);
    if (!sku) { avisos.push({ tipo: 'sku_vazio', detalhe: p.desc || '(sem descrição)' }); continue; }

    const preco = (p.preco === null || p.preco === undefined || p.preco === '' || +p.preco === 0) ? null : +p.preco;
    if (preco === null) avisos.push({ tipo: 'sem_preco', sku, detalhe: p.desc });

    /* Categoria desconhecida cai na SENTINELA, nao em 'Outros'. Antes as
       duas coisas eram o mesmo valor, e uma peca que e legitimamente
       "Outros" ficava marcada como incompleta para sempre. */
    let cat = p.cat || SEM_CATEGORIA;
    if (!cats.has(cat)) {
      avisos.push({ tipo: 'categoria_desconhecida', sku, detalhe: cat });
      cat = cats.has(SEM_CATEGORIA) ? SEM_CATEGORIA : 'Outros';
    }

    const qtdAlvo = int(p.qtd);

    if (!existentes.has(sku)) {
      stmts.push(db.prepare(
        `INSERT INTO produtos (sku, desc, cat, preco, qtd, origem_cadastro, autoridade)
         VALUES (?, ?, ?, ?, 0, 'planilha', 'marquesa')`
      ).bind(sku, p.desc || sku, cat, preco));
      if (qtdAlvo !== 0) {
        stmts.push(...movimentar(db, {
          sku, tipo: 'entrada', quantidade: qtdAlvo, origem: 'importacao',
          obs: 'Saldo inicial da importação',
        }));
      }
      novos++;
    } else {
      /* O SKU gravado continua sendo o do CATALOGO, nao o da planilha: a
         forma canonica serve para RECONHECER, e reescrever a chave primaria
         de 790 pecas nao e trabalho de uma importacao. */
      const atual = existentes.get(sku);
      stmts.push(db.prepare(
        `UPDATE produtos SET desc = ?, cat = ?, preco = ?, atualizado_em = datetime('now') WHERE sku = ?`
      ).bind(p.desc || atual.sku, cat, preco, atual.sku));
      // §19: a planilha traz um saldo-alvo; a diferença vira um AJUSTE rastreável
      const delta = qtdAlvo - atual.qtd;
      if (delta !== 0) {
        stmts.push(...movimentar(db, {
          sku: atual.sku, tipo: 'ajuste', quantidade: delta, origem: 'importacao',
          obs: `Importação: planilha diz ${qtdAlvo}, sistema tinha ${atual.qtd}`,
        }));
        ajustados++;
      }
    }
  }

  if (stmts.length) await db.batch(stmts);
  return json({ ok: true, novos, ajustados, avisos });
}

/** Os tres status que a ficha aceita. Nao ha CHECK no banco — derruba-lo
 *  para ca exigiria reconstruir `produtos` — entao a validacao mora aqui, e
 *  o que ela impede e concreto: um status escrito errado some das consultas
 *  que filtram `status = 'ativo'` e a peca desaparece da sincronizacao, da
 *  fila de fotos e do empurrao de estoque, sem nenhum erro. */
const STATUS_VALIDOS = new Set(['ativo', 'inativo', 'arquivado']);

export async function editarProduto(db, sku, b) {
  const campos = [], vals = [];
  if (b.desc !== undefined) { campos.push('desc = ?'); vals.push(String(b.desc)); }
  if (b.cat !== undefined) {
    /* Antes, categoria inexistente caia na FK do D1 e voltava como erro
       generico. A pessoa lia "erro ao salvar" sem saber que o problema era
       o nome da categoria. */
    const cat = String(b.cat);
    const existe = await db.prepare(`SELECT nome FROM categorias WHERE nome = ?`).bind(cat).first();
    if (!existe) {
      const { results } = await db.prepare(`SELECT nome FROM categorias ORDER BY ordem`).all();
      return json({
        erro: `A categoria "${cat}" não existe.`,
        categoriasDisponiveis: (results ?? []).map(c => c.nome),
      }, 400);
    }
    campos.push('cat = ?'); vals.push(cat);
  }
  if (b.preco !== undefined) { campos.push('preco = ?'); vals.push(b.preco === null ? null : +b.preco); }
  if (b.status !== undefined) {
    const status = String(b.status);
    if (!STATUS_VALIDOS.has(status)) {
      return json({
        erro: `Status "${status}" não existe.`,
        statusValidos: [...STATUS_VALIDOS],
        explicacao: 'Para tirar de circulação use POST /api/produtos/:sku/arquivar, '
          + 'que registra a data e o motivo (§28).',
      }, 400);
    }
    campos.push('status = ?'); vals.push(status);
  }
  if (b.qtd !== undefined) {
    return json({ erro: 'Saldo não se edita direto (§19). Use POST /api/produtos/:sku/movimento' }, 400);
  }
  if (!campos.length) return json({ erro: 'Nada para atualizar' }, 400);
  campos.push("atualizado_em = datetime('now')");
  await db.prepare(`UPDATE produtos SET ${campos.join(', ')} WHERE sku = ?`).bind(...vals, normSku(sku)).run();
  return json({ ok: true });
}

/** Define (ou remove) os componentes de um kit — ver kit_componentes no
 *  schema. `componentes: []` remove o kit e o produto volta a ser normal.
 *
 *  Recusa transformar em kit um produto que ainda tem saldo próprio: virar
 *  kit muda o SIGNIFICADO do saldo (de "quanto existe" para "sempre 0,
 *  calculado pelos componentes"), e zerar isso sozinho seria inventar um
 *  ajuste que ninguém pediu (§19, §22). Ela lança um ajuste explícito
 *  primeiro — o histórico mostra o motivo — e só depois monta o kit. */
export async function definirKit(db, kitSku, { componentes }) {
  const kit = await db.prepare(`SELECT sku, qtd, desc FROM produtos WHERE sku = ?`).bind(kitSku).first();
  if (!kit) return json({ erro: `Código ${kitSku} não está no catálogo` }, 404);

  const lista = Array.isArray(componentes) ? componentes.filter(c => c && c.sku && c.qtd > 0) : [];

  if (!lista.length) {
    await db.prepare(`DELETE FROM kit_componentes WHERE kit_sku = ?`).bind(kitSku).run();
    return json({ ok: true, kit: kitSku, componentes: [] });
  }

  if (kit.qtd !== 0) {
    return json({
      erro: `${kit.desc} tem ${kit.qtd} no saldo próprio. Zere com um ajuste antes de virar kit — `
          + 'transformar em kit sem isso apagaria esse número em silêncio.',
    }, 409);
  }
  const consignado = await consignadoDoSku(db, kitSku);
  if (consignado > 0) {
    return json({ erro: `${kit.desc} tem ${consignado} peça(s) em maleta. Kit não pode estar consignado.` }, 409);
  }

  for (const c of lista) {
    if (c.sku === kitSku) return json({ erro: 'Um kit não pode ser componente de si mesmo' }, 400);
    const comp = await db.prepare(`SELECT sku FROM produtos WHERE sku = ?`).bind(c.sku).first();
    if (!comp) return json({ erro: `Componente ${c.sku} não está no catálogo` }, 400);
    if (await ehKit(db, c.sku)) {
      return json({ erro: `${c.sku} também é um kit — kit dentro de kit não é suportado` }, 400);
    }
  }

  const stmts = [db.prepare(`DELETE FROM kit_componentes WHERE kit_sku = ?`).bind(kitSku)];
  for (const c of lista) {
    stmts.push(db.prepare(
      `INSERT INTO kit_componentes (kit_sku, componente_sku, qtd) VALUES (?, ?, ?)`
    ).bind(kitSku, c.sku, int(c.qtd)));
  }
  await db.batch(stmts);
  return json({ ok: true, kit: kitSku, componentes: lista });
}

/** Importação do retrato da loja. */
export function importarLoja(db, entrada = {}) {
  return comExecucao('importacao', {
    dados: { fonte: 'loja', itens: (entrada.produtos || []).length },
    resumir: (r) => ({ status: r && r.status }),
  }, () => importarLojaRodada(db, entrada));
}

async function importarLojaRodada(db, { snapshot, produtos }) {
  const stmts = [];
  if (snapshot) {
    stmts.push(db.prepare(
      `INSERT INTO loja_snapshot (id, lido_em, produtos_na_loja, produtos_casados, so_na_loja, codigos_casados, duplicados_json)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET lido_em=excluded.lido_em, produtos_na_loja=excluded.produtos_na_loja,
         produtos_casados=excluded.produtos_casados, so_na_loja=excluded.so_na_loja,
         codigos_casados=excluded.codigos_casados, duplicados_json=excluded.duplicados_json`
    ).bind(snapshot.lidoEm, snapshot.produtosNaLoja, snapshot.produtosCasados, snapshot.soNaLoja,
      snapshot.codigosCasados, JSON.stringify(snapshot.duplicados || [])));
  }
  /* Limpa SO quem sumiu da loja, em vez de zerar a coluna do catalogo
     inteiro e repovoar. A diferenca aparece quando o arquivo importado esta
     incompleto: com o `UPDATE` global, toda peca que o arquivo nao
     mencionava passava a constar como "nao publicada" — e como a tela de
     publicacao lia `url_loja`, um arquivo truncado mudava o estado de
     centenas de pecas sem que ninguem tivesse decidido nada. */
  const vistos = new Set((produtos || []).map(p => normSku(p.sku)));
  const publicados = (await db.prepare(
    `SELECT sku FROM produtos WHERE url_loja IS NOT NULL`).all()).results;
  for (const { sku } of publicados) {
    if (vistos.has(normSku(sku))) continue;
    stmts.push(db.prepare(
      `UPDATE produtos SET url_loja=NULL, estoque_loja=NULL, visivel=NULL WHERE sku=?`).bind(sku));
  }
  for (const p of (produtos || [])) {
    stmts.push(db.prepare(`UPDATE produtos SET url_loja=?, estoque_loja=?, visivel=?, nome_loja=? WHERE sku=?`)
      .bind(p.urlLoja, p.estoqueLoja, p.visivel === null ? null : (p.visivel ? 1 : 0), p.nomeLoja || null, normSku(p.sku)));
  }
  await db.batch(stmts);
  return json({ ok: true, n: (produtos || []).length });
}
