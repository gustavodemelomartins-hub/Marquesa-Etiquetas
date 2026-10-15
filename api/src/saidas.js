/** §30 — SAÍDAS SEM FATURAMENTO
 *
 *  Brinde, uso próprio, perda/diferença de inventário e sorteio. Todas saem
 *  do estoque e nenhuma delas é venda.
 *
 *  O defeito que este módulo existe para corrigir: essas saídas entravam
 *  como CLIENTE e como VENDA. "Brinde dia das mães" virou uma cliente no
 *  ranking; a retirada pessoal virou compra dela; a peça perdida no
 *  inventário virou faturamento. Todo indicador comercial — faturamento,
 *  ticket médio, peças vendidas, clientes ativos — nasceu contaminado por
 *  dinheiro que nunca entrou.
 *
 *  As regras, que valem para os quatro tipos:
 *
 *    · baixa o estoque UMA vez, por `estoque.js › movimentar` (§19);
 *    · não cria cliente, não cria venda, não cria contas a receber;
 *    · não aparece em faturamento, ticket médio ou ranking — e isso não é
 *      um filtro que alguém precisa lembrar de escrever: a linha não está
 *      em `vendas`, então nenhuma soma de venda a alcança;
 *    · corrigir é ESTORNAR, não apagar: o histórico fica, o estoque volta.
 */
import { movimentar, saldosDoSku, componentesDoKit } from './estoque.js';
import { normSku } from './sku.js';

const TIPOS = new Set(['brinde', 'uso_proprio', 'perda', 'sorteio']);
const ROTULO = {
  brinde: 'Brinde',
  uso_proprio: 'Uso próprio',
  perda: 'Diferença de inventário / Perda',
  sorteio: 'Sorteio',
};

/** O tipo de MOVIMENTO que cada saída produz. Brinde e uso próprio sempre
 *  baixam; perda baixa ou devolve, conforme o sentido — uma diferença de
 *  inventário pode ser para os dois lados, e forçar tudo para baixo
 *  esconderia a sobra. Entrada usa `ajuste` porque é o único tipo cujo sinal
 *  vem no valor, e é o que a devolução de uma sobra realmente é. */
function tipoDeMovimento(tipo, sentido) {
  if (sentido === 'entrada') return 'ajuste';
  if (tipo === 'uso_proprio') return 'uso_proprio';
  if (tipo === 'brinde') return 'brinde';
  if (tipo === 'sorteio') return 'sorteio';
  return 'perda';
}

/** A ORIGEM do movimento — de onde o fato nasceu, que é outra coisa do que
 *  ele é. Uma diferença de inventário é `perda` como TIPO e `inventario`
 *  como ORIGEM: o motivo explica que é diferença, e a origem é o que a tela
 *  de histórico da peça mostra para dizer que aquilo veio de uma contagem
 *  física, não de um lançamento avulso. (Fase 4.4, decisão D9.) */
function origemDoMovimento(tipo, inventarioId) {
  return inventarioId != null ? 'inventario' : tipo;
}

const hojeISO = () => new Date().toISOString().slice(0, 10);
const dataValida = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function publica(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    tipoRotulo: ROTULO[row.tipo] ?? row.tipo,
    sentido: row.sentido,
    data: row.data,
    sku: row.sku,
    produto: row.produto ?? null,
    variacao: row.variacao ?? null,
    varianteId: row.variante_id ?? null,
    qtd: row.qtd,
    motivo: row.motivo ?? null,
    observacao: row.observacao ?? null,
    movimentoId: row.movimento_id ?? null,
    /* Quem é dono da baixa física. `false` = esta linha só CLASSIFICA uma
       saída que já aconteceu (a linha da planilha já baixou a peça), e por
       isso o estorno dela não devolve nada. */
    estoqueRefletido: !!row.estoque_refletido,
    origemUsuario: row.origem_usuario ?? null,
    inventarioId: row.inventario_id ?? null,
    estornada: !!row.estornada,
    estornoEm: row.estorno_em ?? null,
    estornoMotivo: row.estorno_motivo ?? null,
    origemRegistro: row.origem_registro,
    historicoItemId: row.historico_item_id ?? null,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em ?? null,
  };
}

/* ────────────────────────────────────────────────────────────── registrar */

export async function registrarSaida(db, corpo = {}) {
  const tipo = String(corpo.tipo ?? '').trim();
  if (!TIPOS.has(tipo)) {
    return { ok: false, statusHttp: 400, erro: 'Tipo inválido. Use brinde, uso_proprio, perda ou sorteio.' };
  }
  const sentido = String(corpo.sentido ?? 'saida').trim();
  if (sentido !== 'saida' && sentido !== 'entrada') {
    return { ok: false, statusHttp: 400, erro: 'Sentido inválido. Use saida ou entrada.' };
  }
  /* Sobra só existe em diferença de inventário. Brinde que ENTRA no estoque
     não é brinde — é devolução, e tem caminho próprio. */
  if (sentido === 'entrada' && tipo !== 'perda') {
    return {
      ok: false, statusHttp: 400,
      erro: 'Só a diferença de inventário pode somar peça. Brinde, uso próprio e sorteio sempre saem.',
    };
  }

  const data = corpo.data ? String(corpo.data).trim() : hojeISO();
  if (!dataValida(data)) return { ok: false, statusHttp: 400, erro: 'Data inválida. Use AAAA-MM-DD.' };
  /* Data futura é erro de digitação, pelo mesmo motivo da venda (§28): ela
     deslocaria a saída para um mês que ainda não aconteceu. */
  if (data > hojeISO()) {
    return { ok: false, statusHttp: 400, erro: `${data} ainda não chegou.` };
  }

  const sku = normSku(corpo.sku);
  if (!sku) return { ok: false, statusHttp: 400, erro: 'Informe o código da peça.' };
  const qtd = Number(corpo.qtd);
  if (!Number.isInteger(qtd) || qtd <= 0) {
    return { ok: false, statusHttp: 400, erro: 'Quantidade tem que ser um inteiro maior que zero.' };
  }

  /* §3 da revisão — de quem é a baixa física.
   *
   *  Uma linha vinda da planilha JÁ baixou a peça quando o lote foi
   *  importado. Reclassificá-la como brinde não pode baixar de novo: seria
   *  a segunda baixa da mesma peça. Ela entra como registro CLASSIFICATÓRIO
   *  — `estoque_refletido = 0`, sem movimento, e o estorno dela também não
   *  devolve peça nenhuma. Cada alteração física acontece uma vez só. */
  const daMigracao = corpo.origemRegistro === 'migracao_historico'
    || corpo.historicoItemId != null;
  const estoqueRefletido = !daMigracao;

  const s = await saldosDoSku(db, sku);
  if (!s) return { ok: false, statusHttp: 400, erro: `Código ${sku} não está no catálogo.`, sku };

  /* Kit não sai daqui. Ele não tem saldo próprio, e dar um brinde de kit
     precisaria decidir quais componentes saem — §2: não se chuta. */
  if ((await componentesDoKit(db, sku)).length) {
    return {
      ok: false, statusHttp: 409, sku,
      erro: `${s.desc} é um kit. Lance a saída dos componentes, um a um.`,
    };
  }

  if (estoqueRefletido && sentido === 'saida' && qtd > s.disponivel) {
    return { ok: false, statusHttp: 409, erro: `${s.desc}: só tem ${s.disponivel} disponível.`, sku };
  }

  const motivo = String(corpo.motivo ?? '').trim() || null;
  const observacao = String(corpo.observacao ?? '').trim() || null;
  /* Saída sem nenhuma explicação é indistinguível de erro de lançamento seis
     meses depois — a mesma regra que o desconto na venda já segue (§27).
     Perda aceita só a observação, porque "PERDIDO" é o que ela escreve. */
  if (!motivo && !observacao) {
    return {
      ok: false, statusHttp: 409,
      erro: 'Diga o motivo ou escreva uma observação — saída sem explicação não se audita depois.',
    };
  }

  const variacao = String(corpo.variacao ?? '').trim() || null;
  const varianteId = corpo.varianteId == null || corpo.varianteId === '' ? null : String(corpo.varianteId);

  /* §4.4/D8 — a diferença de inventário aponta para a contagem que a
     explicou. Só `perda` pode ter esse vínculo: brinde, uso próprio e
     sorteio não nascem de contagem nenhuma, e deixá-los entrar aqui daria a
     eles a origem `inventario` sem que ninguém tivesse contado nada. */
  const inventarioId = corpo.inventarioId == null ? null : Number(corpo.inventarioId);
  if (inventarioId != null && (!Number.isInteger(inventarioId) || tipo !== 'perda')) {
    return {
      ok: false, statusHttp: 400,
      erro: 'Só diferença de inventário se liga a um inventário.',
    };
  }

  let linha;
  try {
    linha = await db.prepare(
      `INSERT INTO saidas_sem_faturamento
         (tipo, sentido, data, sku, variacao, variante_id, qtd, motivo, observacao,
          origem_usuario, origem_registro, historico_item_id, estoque_refletido, inventario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    ).bind(
      tipo, sentido, data, sku, variacao, varianteId, qtd, motivo, observacao,
      String(corpo.usuario ?? '').trim() || null,
      daMigracao ? 'migracao_historico' : 'manual',
      corpo.historicoItemId ?? null,
      estoqueRefletido ? 1 : 0,
      inventarioId,
    ).first();
  } catch (e) {
    /* A idempotência é do BANCO, não da aplicação: `idx_saida_inventario_unica`
       recusa a segunda aplicação da mesma diferença mesmo sob crash-e-retry
       ou duas abas abertas — o que o antigo flag lido e escrito no mesmo
       batch não garantia. O relançamento depois do ESTORNO continua livre,
       porque o índice só vale para `estornada = 0`. */
    if (inventarioId != null && /UNIQUE constraint/i.test(String(e?.message ?? e))) {
      return {
        ok: false, statusHttp: 409, sku,
        erro: `A diferença de ${sku}${variacao ? ` (${variacao})` : ''} `
          + `do inventário ${inventarioId} já foi lançada.`,
      };
    }
    throw e;
  }

  /* Linha classificatória para aqui: nenhum movimento, nenhum saldo tocado,
     e a resposta diz isso em voz alta em vez de deixar quem chamou supor. */
  if (!estoqueRefletido) {
    return {
      ok: true,
      saida: publica({ ...linha, produto: s.desc }),
      estoque: { sku, desc: s.desc, antes: s.qtd, depois: s.qtd },
      estoqueAlterado: false,
      porQueNaoAlterouEstoque:
        'a linha histórica já baixou esta peça na importação — baixar aqui seria a segunda baixa',
      faturamento: 0,
      criouVenda: false,
      criouCliente: false,
    };
  }

  const obsMov = `${ROTULO[tipo]} ${linha.id}`
    + (motivo ? ` · ${motivo}` : '')
    + (data === hojeISO() ? '' : ` · de ${data}`);

  /* `efeitoDe` aplica o sinal do TIPO, então a quantidade vai sempre
     positiva aqui — menos no `ajuste` da sobra, que é o único tipo cujo
     sinal vem no valor e por isso precisa ser dito. */
  const stmts = movimentar(db, {
    sku,
    tipo: tipoDeMovimento(tipo, sentido),
    quantidade: qtd,
    origem: origemDoMovimento(tipo, inventarioId),
    obs: obsMov,
    variacao,
    varianteId,
  });
  await db.batch(stmts);

  /* O movimento recém-gravado é buscado depois porque `movimentar` devolve
     statements para o batch, e o batch não devolve o id de volta. `obs`
     carrega o id da saída, então a busca é exata — não é "o último". */
  const mov = await db.prepare(
    `SELECT id FROM movimentos WHERE sku = ? AND obs = ? ORDER BY id DESC LIMIT 1`,
  ).bind(sku, obsMov).first();
  if (mov) {
    await db.prepare('UPDATE saidas_sem_faturamento SET movimento_id = ? WHERE id = ?')
      .bind(mov.id, linha.id).run();
    linha.movimento_id = mov.id;
  }

  const depois = await saldosDoSku(db, sku);
  return {
    ok: true,
    saida: publica({ ...linha, produto: s.desc }),
    estoque: { sku, desc: s.desc, antes: s.qtd, depois: depois.qtd },
    estoqueAlterado: true,
    /* §30 dito em voz alta na resposta: quem chamou não precisa deduzir. */
    faturamento: 0,
    criouVenda: false,
    criouCliente: false,
  };
}

/* ───────────────────────────────────────────────────────────────── estorno */

/** Estornar NÃO apaga. Um segundo movimento devolve a peça, e a linha
 *  continua no histórico dizendo que houve, e que foi desfeita. Soft delete
 *  sem rastro deixaria o estoque certo e a explicação perdida. */
export async function estornarSaida(db, id, { motivo = null } = {}) {
  const linha = await db.prepare('SELECT * FROM saidas_sem_faturamento WHERE id = ?').bind(id).first();
  if (!linha) return { ok: false, statusHttp: 404, erro: 'Saída não encontrada.' };
  if (linha.estornada) return { ok: false, statusHttp: 409, erro: 'Esta saída já foi estornada.' };

  const razao = String(motivo ?? '').trim();
  if (!razao) return { ok: false, statusHttp: 400, erro: 'Diga por que está estornando.' };

  const antes = await saldosDoSku(db, linha.sku);

  /* A linha que nunca foi dona da baixa não devolve peça ao ser estornada.
     Devolver aqui somaria ao estoque uma unidade que jamais saiu por causa
     dela — a peça saiu na importação da planilha, e continua fora. O
     estorno existe mesmo assim: ele desfaz a CLASSIFICAÇÃO. */
  if (!linha.estoque_refletido) {
    const atualizada = await db.prepare(
      `UPDATE saidas_sem_faturamento
          SET estornada = 1, estorno_em = datetime('now'), estorno_motivo = ?,
              atualizado_em = datetime('now')
        WHERE id = ? RETURNING *`,
    ).bind(razao, id).first();
    return {
      ok: true,
      saida: publica(atualizada),
      estoque: { sku: linha.sku, antes: antes.qtd, depois: antes.qtd },
      estoqueAlterado: false,
      porQueNaoAlterouEstoque:
        'esta linha nunca baixou estoque — quem baixou foi a linha da planilha, e ela continua baixada',
    };
  }

  const obsMov = `Estorno da ${ROTULO[linha.tipo]} ${linha.id} · ${razao}`;

  /* O inverso exato do movimento original, sempre por `ajuste` — o tipo cujo
     sinal vem no valor. Saída estornada devolve (+qtd); sobra estornada
     retira (−qtd). */
  const stmts = movimentar(db, {
    sku: linha.sku,
    tipo: 'ajuste',
    quantidade: linha.sentido === 'entrada' ? -linha.qtd : linha.qtd,
    origem: 'estorno',
    obs: obsMov,
    variacao: linha.variacao,
    varianteId: linha.variante_id,
  });
  await db.batch(stmts);

  const mov = await db.prepare(
    `SELECT id FROM movimentos WHERE sku = ? AND obs = ? ORDER BY id DESC LIMIT 1`,
  ).bind(linha.sku, obsMov).first();

  const atualizada = await db.prepare(
    `UPDATE saidas_sem_faturamento
        SET estornada = 1, estorno_em = datetime('now'), estorno_motivo = ?,
            estorno_movimento_id = ?, atualizado_em = datetime('now')
      WHERE id = ? RETURNING *`,
  ).bind(razao, mov?.id ?? null, id).first();

  const depois = await saldosDoSku(db, linha.sku);
  return {
    ok: true,
    saida: publica(atualizada),
    estoque: { sku: linha.sku, antes: antes.qtd, depois: depois.qtd },
    estoqueAlterado: true,
  };
}

/* ───────────────────────────────────────────────────────────────── leitura */

export async function listarSaidas(db, {
  de = null, ate = null, tipo = null, incluirEstornadas = true, limite = 200, offset = 0,
} = {}) {
  const t = tipo && TIPOS.has(tipo) ? tipo : null;
  const { results } = await db.prepare(
    `SELECT s.*, p.desc AS produto
       FROM saidas_sem_faturamento s
       LEFT JOIN produtos p ON p.sku = s.sku
      WHERE (? IS NULL OR s.data >= ?)
        AND (? IS NULL OR s.data <= ?)
        AND (? IS NULL OR s.tipo = ?)
        AND (? = 1 OR s.estornada = 0)
      ORDER BY s.data DESC, s.id DESC
      LIMIT ? OFFSET ?`,
  ).bind(de, de, ate, ate, t, t, incluirEstornadas ? 1 : 0, limite, offset).all();

  const linhas = (results ?? []).map(publica);
  /* O resumo diz, na mesma resposta, quantas PEÇAS saíram sem virar venda.
     É o número que responde "quanto eu dei de brinde este mês" — e ele não
     existe em lugar nenhum das métricas de venda, de propósito. */
  const resumo = { brinde: 0, uso_proprio: 0, perda: 0, sorteio: 0, total: 0, estornadas: 0 };
  for (const l of linhas) {
    if (l.estornada) { resumo.estornadas++; continue; }
    const n = l.sentido === 'entrada' ? -l.qtd : l.qtd;
    resumo[l.tipo] += n;
    resumo.total += n;
  }
  return { ok: true, saidas: linhas, resumo, limite, offset };
}

export { ROTULO as ROTULO_SAIDA, TIPOS as TIPOS_SAIDA };
