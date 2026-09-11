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

export { normSku } from './sku.js';
import { normSku } from './sku.js';

/* ==================================================================== */
/* 1. DEPENDÊNCIAS — a pergunta que decide                              */
/* ==================================================================== */

/** Quem ACOMPANHA a peca quando ela e apagada, em vez de impedir.
 *
 *  A lista e curta de proposito, e cada entrada precisa satisfazer o mesmo
 *  criterio: a linha so existe por causa DESTA peca e nao explica nenhum
 *  numero de outra. Uma linha de `movimentos` descreve o estoque dela;
 *  apagando os dois juntos, a invariante §19 continua fechando. Uma linha de
 *  `venda_itens` nao — ela explica o faturamento de um mes.
 *
 *  A ORDEM importa: o D1 forca chave estrangeira em toda query e nao aceita
 *  `PRAGMA foreign_keys`. Filho antes de pai, sempre.
 */
const LEVA_JUNTO = [
  { tabela: 'produto_fotos', coluna: 'sku' },
  { tabela: 'catalogo_publicacoes', coluna: 'sku' },
  { tabela: 'preparacao_tarefas', coluna: 'sku' },
  { tabela: 'produto_variacoes', coluna: 'sku' },
  { tabela: 'produtos_pendentes', coluna: 'sku' },   // sem FK; some junto assim mesmo
  { tabela: 'movimentos', coluna: 'sku' },
];
const LEVA_JUNTO_NOMES = new Set(LEVA_JUNTO.map(x => x.tabela));

/** Como a tela explica cada bloqueio. Tabela que nao estiver aqui ainda
 *  bloqueia — so aparece com o nome cru, que e infinitamente melhor que
 *  passar batido. */
const FRASES = {
  venda_itens: (n) => `${n} ${n === 1 ? 'venda registrada' : 'vendas registradas'}`,
  maleta_itens: (n) => `${n} ${n === 1 ? 'saída em maleta' : 'saídas em maleta'}`,
  maleta_item_variacoes: (n) => `${n} ${n === 1 ? 'variação enviada em maleta' : 'variações enviadas em maleta'}`,
  inventario_itens: (n) => `${n} ${n === 1 ? 'contagem de inventário' : 'contagens de inventário'}`,
  inventario_contagem: (n) => `${n} ${n === 1 ? 'linha de contagem' : 'linhas de contagem'}`,
  inventario_resultado: (n) => `${n} ${n === 1 ? 'diferença de inventário' : 'diferenças de inventário'}`,
  reconciliacao_itens: (n) => `${n} ${n === 1 ? 'item de reconciliação' : 'itens de reconciliação'}`,
  saidas_sem_faturamento: (n) => `${n} ${n === 1 ? 'saída sem faturamento' : 'saídas sem faturamento'}`,
  garantia_trocas: (n) => `${n} ${n === 1 ? 'troca de garantia' : 'trocas de garantia'}`,
  personalizacao_modelos: (n) => `é a base de ${n} ${n === 1 ? 'modelo de personalização' : 'modelos de personalização'}`,
  personalizacao_opcoes: (n) => `é opção de ${n} ${n === 1 ? 'modelo de personalização' : 'modelos de personalização'}`,
  venda_personalizacoes: (n) => `${n} ${n === 1 ? 'venda personalizada' : 'vendas personalizadas'}`,
  venda_personalizacao_itens: (n) => `${n} ${n === 1 ? 'componente usado em venda' : 'componentes usados em vendas'}`,
  venda_item_correcoes: (n) => `${n} ${n === 1 ? 'correção de item de venda' : 'correções de item de venda'}`,
};

/** TODAS as tabelas que referenciam `produtos`, perguntadas ao BANCO.
 *
 *  Esta funcao existe porque a versao anterior listava cinco tabelas a mao,
 *  e o banco tem dezesseis referencias em quatorze tabelas. As tres que a
 *  Fase 4.4 criou ficaram de fora, e o resultado nao era um bloqueio que
 *  falhava: era um `podeExcluir: true` mentiroso. O batch apagava
 *  `movimentos` e so entao o `DELETE FROM produtos` batia na FK — a peca
 *  perdia a razao e continuava existindo, quebrando
 *  `produtos.qtd == SUM(movimentos.qtd)` para sempre.
 *
 *  Derivando do schema, uma fase futura que acrescente tabela passa a ser
 *  coberta sozinha, sem ninguem lembrar de atualizar uma lista.
 */
export async function referenciasAProdutos(db) {
  const { results } = await db.prepare(`
    SELECT m.name AS tabela, f."from" AS coluna
      FROM sqlite_master m
      JOIN pragma_foreign_key_list(m.name) f
     WHERE m.type = 'table' AND f."table" = 'produtos'
     ORDER BY m.name, f."from"`).all();
  return results ?? [];
}

/** Tudo que existe em outro lugar por causa desta peça.
 *
 *  O criterio nao e uma preferencia, e uma pergunta que o banco responde:
 *  **existe alguma linha em outro lugar que so faz sentido por causa desta
 *  peca?** Havendo, arquiva. Nao havendo, apaga.
 */
export async function dependenciasDoProduto(db, sku) {
  const k = normSku(sku);
  const p = await db.prepare(
    `SELECT sku, desc, cat, qtd, status, arquivado_em, arquivado_motivo
       FROM produtos WHERE sku = ?`).bind(k).first();
  if (!p) return { erro: `Código ${sku} não está no catálogo`, status: 404 };

  const conta = async (tabela, coluna) => {
    try {
      const r = await db.prepare(
        `SELECT COUNT(*) n FROM "${tabela}" WHERE "${coluna}" = ?`).bind(p.sku).first();
      return r ? r.n : 0;
    } catch {
      /* Tabela que ainda nao existe neste banco (migration pendente) conta
         zero. Ela nao pode ter linha desta peca se nao existe. */
      return 0;
    }
  };

  const bloqueios = [];
  for (const { tabela, coluna } of await referenciasAProdutos(db)) {
    if (LEVA_JUNTO_NOMES.has(tabela)) continue;
    const n = await conta(tabela, coluna);
    if (!n) continue;
    const frase = FRASES[tabela] ? FRASES[tabela](n) : `${n} ${n === 1 ? 'registro' : 'registros'} em ${tabela}`;
    bloqueios.push({ tipo: tabela, coluna, quantas: n, frase });
  }

  /* Kit e as duas pontas da mesma tabela, e as duas bloqueiam por motivos
     que a tela explica com frases diferentes. O laco acima ja conta
     `kit_componentes` por cada coluna, entao aqui so o nome e ajustado. */
  for (const b of bloqueios) {
    if (b.tipo !== 'kit_componentes') continue;
    b.tipo = b.coluna === 'kit_sku' ? 'kit' : 'componente';
    b.frase = b.coluna === 'kit_sku'
      ? 'é um kit, montado a partir de outras peças'
      : `é componente de ${b.quantas} ${b.quantas === 1 ? 'kit' : 'kits'}`;
  }

  const levaJunto = {};
  for (const { tabela, coluna } of LEVA_JUNTO) levaJunto[tabela] = await conta(tabela, coluna);

  // Informativo: existir na loja não impede nada aqui, porque excluir
  // localmente NÃO mexe na Nuvemshop.
  const naLoja = (await db.prepare(
    `SELECT COUNT(*) n FROM loja_variantes WHERE sku_norm = ?`).bind(k).first()).n;

  /* `status` aqui é o do PRODUTO ('ativo' | 'inativo' | 'arquivado'), não um
     código HTTP — a rota só usa `status` como HTTP quando há `erro`. Trocar
     essa regra devolve "Responses may only be constructed with status codes
     in the range 200 to 599". */
  return {
    sku: p.sku, desc: p.desc, cat: p.cat, qtd: p.qtd, status: p.status,
    arquivadoEm: p.arquivado_em || null, arquivadoMotivo: p.arquivado_motivo || null,
    podeExcluir: bloqueios.length === 0,
    bloqueios,
    // O que a confirmação precisa dizer que vai junto
    levaJunto: {
      ...levaJunto,
      // nomes antigos, para a tela que já os lê não quebrar
      movimentos: levaJunto.movimentos,
      variacoes: levaJunto.produto_variacoes,
      pendentes: levaJunto.produtos_pendentes,
    },
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
export async function excluirProduto(db, sku, env = null) {
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

  /* Os bytes das fotos proprias saem ANTES das linhas: apagar a referencia
     primeiro deixaria objeto orfao no bucket sem ninguem para reencontra-lo.
     Sem `env` (chamada interna, teste puro) os bytes ficam — e a resposta
     diz isso em vez de fingir que limpou. */
  let fotosNoArmazenamento = 0;
  if (env && env.FOTOS) {
    try {
      const { results } = await db.prepare(
        `SELECT original_key, preparada_key FROM produto_fotos WHERE sku = ?`).bind(k).all();
      for (const f of results ?? []) {
        for (const chave of [f.original_key, f.preparada_key]) {
          if (!chave) continue;
          await env.FOTOS.delete(chave);
          fotosNoArmazenamento++;
        }
      }
    } catch { /* banco sem a tabela: nao ha byte proprio para apagar */ }
  }

  /* A ordem vem de LEVA_JUNTO, filho antes de pai — o D1 forca FK em toda
     query e falharia no meio do batch. Uma tabela que ainda nao existe
     neste banco derrubaria o batch inteiro, entao cada DELETE so entra se a
     tabela responder. */
  const stmts = [];
  for (const { tabela, coluna } of LEVA_JUNTO) {
    try {
      await db.prepare(`SELECT 1 FROM "${tabela}" LIMIT 1`).first();
    } catch { continue; }
    stmts.push(db.prepare(`DELETE FROM "${tabela}" WHERE "${coluna}" = ?`).bind(k));
  }
  stmts.push(db.prepare(`DELETE FROM produtos WHERE sku = ?`).bind(k));
  await db.batch(stmts);

  /* `loja_variantes` NÃO é tocada: ela é o espelho do que a Nuvemshop tem, e
     a Nuvemshop continua tendo. Apagar a linha faria o espelho mentir até a
     próxima leitura. */
  return {
    ok: true, excluido: dep.sku, desc: dep.desc,
    apagou: dep.levaJunto,
    fotosNoArmazenamento,
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
  /* O id que REALMENTE foi gravado em cada combinação, incluindo o gerado
     agora. Sem isto a resposta devolvia `varianteId: null` para todo produto
     novo, e quem chamasse em seguida para distribuir o estoque não teria
     como endereçar as quantidades — a tela de cadastro precisa exatamente
     disso, na mesma sequência. */
  const idsUsados = new Map();
  for (const [i, c] of combinacoes.entries()) {
    /* O id de quem já existia é PRESERVADO. Regerar um id local a cada
       salvamento faria o saldo se desencontrar da estrutura toda vez que
       alguém corrigisse a ordem dos valores. */
    const id = idPorNome.get(c.nome) || idLocal();
    idsUsados.set(c.nome, String(id));
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
      ...c, varianteId: idsUsados.get(c.nome) || null, ordem: i,
    })),
    saldoDevolvido: devolvidos,
    total: p.qtd,
  };
}

/* ==================================================================== */
/* 5. A ESTRUTURA COMO A TELA DE EDIÇÃO PRECISA VER                     */
/* ==================================================================== */

/** As variações de um código juntando as três coisas que a tela de edição
 *  precisa mostrar na mesma linha, e que moram em tabelas diferentes:
 *
 *   - `loja_variantes`   — o que a Nuvemshop tem HOJE (fato dela);
 *   - `produto_variacoes` — o que decidimos aqui, com o `variante_id`
 *     persistido que amarra os dois lados;
 *   - `movimentos`        — quantas peças estão em cada variação AQUI.
 *
 *  Existe separada de `variantesDoSku` porque as perguntas são diferentes:
 *  aquela lê a loja e só a loja (é a fonte de "importe a estrutura de lá"),
 *  esta responde "o que este produto tem, venha de onde vier" — inclusive
 *  quando o produto só existe aqui e as variações foram criadas na mão.
 *
 *  Somente leitura. Não cria, não casa, não conserta: uma variação nossa sem
 *  par na loja aparece marcada como sem par, e não vira vínculo por
 *  semelhança de nome. Adivinhar aqui seria o mesmo erro que a FASE 1
 *  arrancou do motor de sincronização.
 */
export async function estruturaDoProduto(db, sku) {
  const k = normSku(sku);
  const p = await db.prepare(
    `SELECT sku, desc, cat, qtd, preco, status FROM produtos WHERE sku = ?`).bind(k).first();
  if (!p) return { erro: `Código ${sku} não está no catálogo`, status: 404 };

  const naLoja = (await db.prepare(
    `SELECT variante_id, nome, estoque, valores_json, posicao
       FROM loja_variantes WHERE sku_norm = ? ORDER BY posicao`).bind(k).all()).results;

  const nossas = (await db.prepare(
    `SELECT nome, variante_id, valores_json, origem, ordem
       FROM produto_variacoes WHERE sku = ? ORDER BY ordem, nome`).bind(k).all()).results;

  /* O saldo por variação pelas DUAS chaves, igual ao motor de sincronização.
     Ler só por `variante_id` perderia o saldo das vendas antigas, que
     gravavam apenas o nome. */
  const baldes = (await db.prepare(
    `SELECT variacao, variante_id, SUM(qtd) AS saldo FROM movimentos
      WHERE sku = ? AND (variacao IS NOT NULL OR variante_id IS NOT NULL)
      GROUP BY variacao, variante_id`).bind(k).all()).results;

  const idPorNome = new Map(nossas.filter(v => v.variante_id).map(v => [v.nome, String(v.variante_id)]));
  const saldoPorId = new Map();
  let saldoSemVariacao = 0;
  for (const b of baldes) {
    if (!b.saldo) continue;
    const vid = b.variante_id ? String(b.variante_id) : idPorNome.get(b.variacao);
    if (vid) saldoPorId.set(vid, (saldoPorId.get(vid) || 0) + b.saldo);
    else saldoSemVariacao += b.saldo;
  }

  const linhas = [];
  const vistos = new Set();
  for (const v of naLoja) {
    const vid = String(v.variante_id);
    vistos.add(vid);
    const nossa = nossas.find(x => String(x.variante_id) === vid);
    linhas.push({
      varianteId: vid, nome: nossa ? nossa.nome : v.nome,
      valores: parseJson(v.valores_json, []),
      estoqueLoja: v.estoque == null ? null : v.estoque,
      saldo: saldoPorId.get(vid) || 0,
      daLoja: true, mapeada: !!nossa,
    });
  }
  for (const v of nossas) {
    const vid = v.variante_id ? String(v.variante_id) : null;
    if (vid && vistos.has(vid)) continue;
    linhas.push({
      varianteId: vid, nome: v.nome,
      valores: parseJson(v.valores_json, []),
      estoqueLoja: null, saldo: vid ? (saldoPorId.get(vid) || 0) : 0,
      daLoja: false, mapeada: false,
    });
  }

  /* Os atributos saem dos valores lidos, na ordem em que aparecem. Lista fixa
     não serve: quem vende por "Banho" e "Pedra" precisa ver "Banho" e
     "Pedra", não "Cor" e "Tamanho". */
  const atributos = [];
  for (const l of linhas) {
    for (const v of l.valores) {
      let a = atributos.find(x => x.nome === v.atributo);
      if (!a) { a = { nome: v.atributo, valores: [] }; atributos.push(a); }
      if (!a.valores.includes(v.valor)) a.valores.push(v.valor);
    }
  }

  /* `status` = o do produto, não HTTP — ver a nota em dependenciasDoProduto. */
  return {
    sku: p.sku, desc: p.desc, cat: p.cat, qtd: p.qtd,
    preco: p.preco == null ? null : p.preco, status: p.status,
    fonte: naLoja.length ? 'loja' : (nossas.length ? 'local' : 'nenhuma'),
    temVariacao: linhas.length > 1,
    atributos, variacoes: linhas,
    saldoSemVariacao,
    somaLoja: naLoja.reduce((s, v) => s + (v.estoque || 0), 0),
  };
}

function parseJson(txt, padrao) {
  try { const v = JSON.parse(txt); return v == null ? padrao : v; } catch (e) { return padrao; }
}
