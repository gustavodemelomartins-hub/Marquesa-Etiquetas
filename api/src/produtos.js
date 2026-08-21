/** Ciclo de vida de um produto: o que pode ser apagado, o que só pode ser
 *  arquivado, e como uma peça criada aqui ganha variações.
 *
 *  A regra que manda em tudo neste arquivo é o §28: **não apagar
 *  histórico**. Uma peça que já foi vendida, já saiu numa maleta ou já foi
 *  contada num inventário explica números que continuam valendo hoje — o
 *  faturamento do mês, o acerto de uma revendedora, a diferença que a
 *  contagem encontrou. Apagá-la não some com um cadastro: some com a
 *  explicação de coisas que ninguém vai conseguir reconstruir depois.
 *
 *  Mas "nunca apagar nada" também é errado, e foi o que motivou este
 *  arquivo: peça de teste, cadastrada para experimentar a tela, entulha a
 *  lista para sempre. Ela não tem histórico nenhum — apagá-la não perde
 *  informação de coisa alguma.
 *
 *  Então a decisão não é uma preferência, é uma pergunta que o banco
 *  responde: **existe alguma linha em outro lugar que só faz sentido por
 *  causa desta peça?** Havendo, arquiva. Não havendo, apaga.
 *
 *  Excluir aqui NUNCA exclui da Nuvemshop. São dois catálogos, e sumir com
 *  o anúncio de alguém como efeito colateral de uma faxina local seria o
 *  tipo de estrago que só aparece quando uma cliente reclama.
 */
import { movimentar } from './estoque.js';

export const normSku = (v) => String(v == null ? '' : v).trim().replace(/[\s ]+/g, '').toUpperCase();

/* ==================================================================== */
/* 1. DEPENDÊNCIAS — a pergunta que decide                              */
/* ==================================================================== */

/** Tudo que existe em outro lugar por causa desta peça.
 *
 *  Os `movimentos` ficam de FORA dos bloqueios de propósito, e é a decisão
 *  mais delicada daqui: todo produto tem pelo menos um movimento (a entrada
 *  do saldo inicial), então contá-los como histórico tornaria a exclusão
 *  impossível para qualquer peça — inclusive a de teste que este fluxo
 *  existe para limpar. O movimento de uma peça só descreve o estoque DELA;
 *  apagando os dois juntos, a invariante §19 continua fechando.
 *
 *  O que bloqueia é o que amarra a peça a OUTRA coisa: uma venda, uma
 *  maleta, um inventário, um kit, uma sessão de reconciliação. Aí o
 *  movimento deixa de ser só dela.
 */
export async function dependenciasDoProduto(db, sku) {
  const k = normSku(sku);
  const p = await db.prepare(
    `SELECT sku, desc, cat, qtd, status, arquivado_em, arquivado_motivo
       FROM produtos WHERE sku = ?`).bind(k).first();
  if (!p) return { erro: `Código ${sku} não está no catálogo`, status: 404 };

  const conta = async (sql) => (await db.prepare(sql).bind(k).first()).n;

  const vendas = await conta(`SELECT COUNT(*) n FROM venda_itens WHERE sku = ?`);
  const maletas = await conta(`SELECT COUNT(*) n FROM maleta_itens WHERE sku = ?`);
  const inventarios = await conta(`SELECT COUNT(*) n FROM inventario_itens WHERE sku = ?`);
  // Duas perguntas diferentes: "esta peça É um kit?" e "esta peça compõe um
  // kit de outra?". As duas bloqueiam, mas por motivos que a tela explica
  // com frases diferentes.
  const ehKit = await conta(`SELECT COUNT(*) n FROM kit_componentes WHERE kit_sku = ?`);
  const compoeKit = await conta(`SELECT COUNT(*) n FROM kit_componentes WHERE componente_sku = ?`);
  const reconciliacao = await conta(`SELECT COUNT(*) n FROM reconciliacao_itens WHERE sku = ?`);

  // Não bloqueiam — vão junto na exclusão. Contados para a confirmação
  // poder dizer o que vai sumir, em vez de sumir em silêncio.
  const movimentos = await conta(`SELECT COUNT(*) n FROM movimentos WHERE sku = ?`);
  const variacoes = await conta(`SELECT COUNT(*) n FROM produto_variacoes WHERE sku = ?`);
  const pendentes = await conta(`SELECT COUNT(*) n FROM produtos_pendentes WHERE sku = ?`);
  const naLoja = await conta(`SELECT COUNT(*) n FROM loja_variantes WHERE sku_norm = ?`);

  const bloqueios = [];
  if (vendas) bloqueios.push({ tipo: 'vendas', quantas: vendas, frase: `${vendas} ${vendas === 1 ? 'venda registrada' : 'vendas registradas'}` });
  if (maletas) bloqueios.push({ tipo: 'maletas', quantas: maletas, frase: `${maletas} ${maletas === 1 ? 'saída em maleta' : 'saídas em maleta'}` });
  if (inventarios) bloqueios.push({ tipo: 'inventarios', quantas: inventarios, frase: `${inventarios} ${inventarios === 1 ? 'contagem de inventário' : 'contagens de inventário'}` });
  if (ehKit) bloqueios.push({ tipo: 'kit', quantas: ehKit, frase: 'é um kit, montado a partir de outras peças' });
  if (compoeKit) bloqueios.push({ tipo: 'componente', quantas: compoeKit, frase: `é componente de ${compoeKit} ${compoeKit === 1 ? 'kit' : 'kits'}` });
  if (reconciliacao) bloqueios.push({ tipo: 'reconciliacao', quantas: reconciliacao, frase: `${reconciliacao} ${reconciliacao === 1 ? 'item de reconciliação' : 'itens de reconciliação'}` });

  return {
    sku: p.sku, desc: p.desc, cat: p.cat, qtd: p.qtd, status: p.status,
    arquivadoEm: p.arquivado_em || null, arquivadoMotivo: p.arquivado_motivo || null,
    podeExcluir: bloqueios.length === 0,
    bloqueios,
    // O que a confirmação precisa dizer que vai junto
    levaJunto: { movimentos, variacoes, pendentes },
    // Informativo: existir na loja não impede nada aqui, porque excluir
    // localmente NÃO mexe na Nuvemshop.
    naLoja,
  };
}

/* ==================================================================== */
/* 2. EXCLUIR — só quem não deixa buraco                                */
/* ==================================================================== */

/** Apaga de vez. Recusa se houver qualquer dependência.
 *
 *  A ordem das exclusões não é estilo: o D1 força chave estrangeira em toda
 *  query e não aceita `PRAGMA foreign_keys`. Apagar `produtos` antes dos
 *  filhos falharia, e falharia no meio do batch. */
export async function excluirProduto(db, sku) {
  const dep = await dependenciasDoProduto(db, sku);
  if (dep.erro) return dep;

  if (!dep.podeExcluir) {
    return {
      status: 409,
      erro: `${dep.sku} tem histórico e não pode ser apagado.`,
      // A alternativa vem na mesma resposta: recusar sem oferecer saída
      // deixa a pessoa sem o que fazer com a peça que ela quer tirar da lista.
      alternativa: 'arquivar',
      explicacao: 'Apagar levaria junto a explicação de números que continuam valendo — '
        + 'o faturamento do mês, o acerto de uma revendedora, a diferença de uma contagem. '
        + 'Arquivar tira a peça de circulação e da sincronização, e preserva tudo.',
      bloqueios: dep.bloqueios,
      podeExcluir: false,
    };
  }

  const k = normSku(sku);
  await db.batch([
    db.prepare(`DELETE FROM produto_variacoes WHERE sku = ?`).bind(k),
    db.prepare(`DELETE FROM produtos_pendentes WHERE sku = ?`).bind(k),
    db.prepare(`DELETE FROM movimentos WHERE sku = ?`).bind(k),
    db.prepare(`DELETE FROM produtos WHERE sku = ?`).bind(k),
  ]);

  /* `loja_variantes` NÃO é tocada: ela é o espelho do que a Nuvemshop tem, e
     a Nuvemshop continua tendo. Apagar a linha faria o espelho mentir até a
     próxima leitura. */
  return {
    ok: true, excluido: dep.sku, desc: dep.desc,
    apagou: dep.levaJunto,
    naLojaAinda: dep.naLoja > 0,
  };
}

/* ==================================================================== */
/* 3. ARQUIVAR — o destino de quem tem histórico                        */
/* ==================================================================== */

/** Tira de circulação sem apagar nada.
 *
 *  Não precisou de tratamento especial em lugar nenhum: as consultas que
 *  importam já filtram `status = 'ativo'`, então o arquivado sai sozinho da
 *  sincronização, da fila de fotos e do empurrão de estoque. O saldo
 *  continua onde estava — arquivar não é dar baixa, e transformar em baixa
 *  seria inventar uma perda que ninguém declarou. */
export async function arquivarProduto(db, sku, { motivo } = {}) {
  const k = normSku(sku);
  const p = await db.prepare(`SELECT sku, desc, status, qtd FROM produtos WHERE sku = ?`).bind(k).first();
  if (!p) return { erro: `Código ${sku} não está no catálogo`, status: 404 };
  if (p.status === 'arquivado') return { ok: true, jaEstava: true, sku: p.sku };

  await db.prepare(
    `UPDATE produtos SET status = 'arquivado', arquivado_em = datetime('now'),
            arquivado_motivo = ?, atualizado_em = datetime('now')
      WHERE sku = ?`).bind(motivo || null, k).run();

  return {
    ok: true, sku: p.sku, desc: p.desc, qtd: p.qtd,
    aviso: p.qtd > 0
      ? `${p.sku} foi arquivada ainda com ${p.qtd} ${p.qtd === 1 ? 'peça' : 'peças'} em estoque. `
        + 'O saldo continua contado: arquivar não dá baixa.'
      : null,
  };
}

export async function desarquivarProduto(db, sku) {
  const k = normSku(sku);
  const p = await db.prepare(`SELECT sku, status FROM produtos WHERE sku = ?`).bind(k).first();
  if (!p) return { erro: `Código ${sku} não está no catálogo`, status: 404 };
  await db.prepare(
    `UPDATE produtos SET status = 'ativo', arquivado_em = NULL, arquivado_motivo = NULL,
            atualizado_em = datetime('now') WHERE sku = ?`).bind(k).run();
  return { ok: true, sku: p.sku };
}

/* ==================================================================== */
/* 4. ESTRUTURA DE VARIAÇÕES CRIADA AQUI                                */
/* ==================================================================== */

/** Id de uma variação que só existe aqui.
 *
 *  Ela precisa de identidade tanto quanto uma da loja — pelo mesmo motivo:
 *  o nome pode ser corrigido ("Dourdo" → "Dourado") e o saldo não pode se
 *  perder no caminho. O prefixo deixa óbvio, em qualquer consulta, que
 *  aquela linha ainda não tem correspondente na Nuvemshop. */
const idLocal = () => 'local:' + crypto.randomUUID();

/** Monta as combinações a partir dos atributos.
 *
 *  Tamanho[16,17] × Cor[Dourado,Prata] dá quatro peças diferentes, e é isso
 *  que a tela precisa mostrar. O produto cartesiano é feito aqui, no
 *  servidor, para a tela e o banco nunca discordarem sobre quantas
 *  combinações existem. */
export function combinar(atributos) {
  const limpos = (atributos || [])
    .map(a => ({
      nome: String(a.nome || '').trim(),
      valores: [...new Set((a.valores || []).map(v => String(v).trim()).filter(Boolean))],
    }))
    .filter(a => a.nome && a.valores.length);

  if (!limpos.length) return { atributos: [], combinacoes: [] };

  let combos = [[]];
  for (const a of limpos) {
    const proximo = [];
    for (const parcial of combos) {
      for (const valor of a.valores) proximo.push([...parcial, { atributo: a.nome, valor }]);
    }
    combos = proximo;
  }

  return {
    atributos: limpos,
    combinacoes: combos.map(valores => ({
      valores,
      nome: valores.map(v => v.valor).join(' · '),
    })),
  };
}

/** Define a estrutura de variações de um produto — os atributos, os valores
 *  e as combinações. **Não mexe em estoque**: quantidade é o outro ato, e
 *  passa por `distribuirVariantes`.
 *
 *  Uma linha que já tem `variante_id` da Nuvemshop NÃO é removida nem tem o
 *  id trocado sem `desvincular: true` explícito. Perder esse vínculo em
 *  silêncio é como o estoque volta a ser escrito na caixinha errada — e o
 *  pedido foi exatamente esse: "não permitir alteração que faça o sistema
 *  perder o vínculo sem aviso explícito".
 */
export async function definirVariacoes(db, sku, { atributos, desvincular = false } = {}) {
  const k = normSku(sku);
  const p = await db.prepare(`SELECT sku, qtd FROM produtos WHERE sku = ?`).bind(k).first();
  if (!p) return { erro: `Código ${sku} não está no catálogo`, status: 404 };

  const { atributos: limpos, combinacoes } = combinar(atributos);

  const atuais = (await db.prepare(
    `SELECT nome, variante_id, origem FROM produto_variacoes WHERE sku = ? ORDER BY ordem, nome`)
    .bind(k).all()).results;

  const nomesNovos = new Set(combinacoes.map(c => c.nome));
  const daLoja = atuais.filter(v => v.origem !== 'local' && v.variante_id);
  const perdidas = daLoja.filter(v => !nomesNovos.has(v.nome));

  if (perdidas.length && !desvincular) {
    return {
      status: 409,
      erro: `Esta mudança desfaria o vínculo de ${perdidas.length} `
        + `${perdidas.length === 1 ? 'variação que existe' : 'variações que existem'} na Nuvemshop.`,
      explicacao: 'Enquanto a variação está vinculada, o estoque dela vai para a caixinha certa da loja. '
        + 'Sem o vínculo, o produto inteiro para de ser sincronizado até alguém remapear.',
      perdidas: perdidas.map(v => ({ nome: v.nome, varianteId: v.variante_id })),
      precisaConfirmar: 'desvincular',
    };
  }

  /* Saldo preso numa variação que vai deixar de existir volta para "sem
     variação" — senão a peça continuaria contada num nome que sumiu da
     tela, invisível e insolúvel. */
  const saldos = (await db.prepare(
    `SELECT variacao, variante_id, SUM(qtd) AS saldo FROM movimentos
      WHERE sku = ? AND variacao IS NOT NULL GROUP BY variacao, variante_id`).bind(k).all()).results;

  const stmts = [];
  const devolvidos = [];
  for (const s of saldos) {
    if (!s.saldo || nomesNovos.has(s.variacao)) continue;
    devolvidos.push({ nome: s.variacao, saldo: s.saldo });
    stmts.push(...movimentar(db, {
      sku: k, variacao: s.variacao, varianteId: s.variante_id,
      tipo: 'ajuste', quantidade: -s.saldo, origem: 'variacao',
      obs: `Estrutura de variações redefinida: "${s.variacao}" deixou de existir e o saldo volta a ficar sem variação`,
    }));
    stmts.push(...movimentar(db, {
      sku: k, tipo: 'ajuste', quantidade: s.saldo, origem: 'variacao',
      obs: `Estrutura de variações redefinida: contrapartida de "${s.variacao}"`,
    }));
  }

  // Fora as que continuam, some o resto.
  for (const v of atuais) {
    if (nomesNovos.has(v.nome)) continue;
    stmts.push(db.prepare(`DELETE FROM produto_variacoes WHERE sku = ? AND nome = ?`).bind(k, v.nome));
  }

  const idPorNome = new Map(atuais.map(v => [v.nome, v.variante_id]));
  for (const [i, c] of combinacoes.entries()) {
    /* O id de quem já existia é PRESERVADO. Regerar um id local a cada
       salvamento faria o saldo se desencontrar da estrutura toda vez que
       alguém corrigisse a ordem dos valores. */
    const id = idPorNome.get(c.nome) || idLocal();
    const daLojaAqui = daLoja.some(v => v.nome === c.nome);
    stmts.push(db.prepare(
      `INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, ordem, valores_json, origem)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(sku, nome) DO UPDATE SET
         atributo=excluded.atributo, ordem=excluded.ordem, valores_json=excluded.valores_json`
    ).bind(
      k, c.nome, limpos.map(a => a.nome).join(' · ') || null,
      id, i, JSON.stringify(c.valores), daLojaAqui ? 'loja' : 'local',
    ));
  }

  if (stmts.length) await db.batch(stmts);

  return {
    ok: true, sku: p.sku,
    atributos: limpos,
    combinacoes: combinacoes.map((c, i) => ({
      ...c, varianteId: idPorNome.get(c.nome) || null, ordem: i,
    })),
    saldoDevolvido: devolvidos,
    total: p.qtd,
  };
}
