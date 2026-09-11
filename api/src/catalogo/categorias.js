/** Categorias: o nome deixa de ser a identidade.
 *
 *  A auditoria da Fase 4.5 encontrou três coisas aqui, e as três eram
 *  consequência de uma só:
 *
 *    - `categorias.nome` é PRIMARY KEY e `produtos.cat` é FK dela. Logo
 *      renomear uma categoria é mudar a chave, e mudar a chave derrubaria os
 *      filhos. A API simplesmente não tinha como oferecer o botão;
 *    - não havia normalização nenhuma: `POST /api/categorias` fazia `.trim()`
 *      e pronto, então `"Colar "`, `"colar"` e `"Colar"` criavam três
 *      categorias diferentes;
 *    - `'Outros'` acumulava dois significados — categoria de verdade e código
 *      para "sem categoria" — e uma peça legitimamente "Outros" ficava
 *      marcada como incompleta para sempre.
 *
 *  A PK continua sendo o nome. Trocá-la exigiria reconstruir `categorias` E
 *  `produtos`, e não é o risco que se corre num catálogo com 790 peças
 *  vivas. O que entra é uma identidade PARALELA — `categorias.id` — que
 *  sobrevive ao nome, e com ela renomear vira um ato de quatro passos dentro
 *  de um `db.batch`, que no D1 é transação.
 *
 *  Mesclar duas categorias NÃO está aqui. A coluna `sucessora_id` existe
 *  para o dia em que estiver, e nenhum código a escreve: para onde vão as
 *  peças e o que acontece com o histórico de relatório é decisão comercial,
 *  não operação técnica.
 */
import { SEM_CATEGORIA } from './completude.js';

const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });

/** A forma canônica de um nome de categoria.
 *
 *  Colapsa espaço interno e caixa. NÃO mexe em plural, acento nem em nada
 *  além disso: "Colares" continua sendo outra categoria, e decidir que ela é
 *  a mesma que "Colar" seria adivinhar o catálogo da Sthefany a partir de
 *  uma regra de gramática. */
export function normalizarNomeCategoria(bruto) {
  return String(bruto == null ? '' : bruto)
    .replace(/[\s\u00a0]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** O identificador estável, derivado do nome na CRIAÇÃO e nunca depois.
 *
 *  Legível de propósito — `colar`, `brinco` — porque um id que a pessoa
 *  consegue ler numa resposta de API vale mais que um UUID quando o
 *  universo tem dez linhas. A unicidade é do banco, pelo índice parcial. */
export function idDeCategoria(nome) {
  const base = normalizarNomeCategoria(nome)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'categoria';
}

const texto = (v) => String(v == null ? '' : v).trim();

/** Toda categoria viva, com quantas peças cada uma tem.
 *
 *  A contagem vem junto porque a tela precisa dela para duas perguntas que a
 *  auditoria listou e que hoje não têm resposta: quantas peças cada
 *  categoria tem, e quais categorias não têm peça nenhuma. Órfã não é erro —
 *  é informação para quem decide arquivar. */
export async function listarCategorias(db) {
  const { results } = await db.prepare(`
    SELECT c.nome, c.ordem, c.cor, c.id, c.slug, c.nome_norm, c.sentinela,
           c.arquivada_em, c.criada_em,
           (SELECT COUNT(*) FROM produtos p WHERE p.cat = c.nome) AS pecas,
           (SELECT COUNT(*) FROM produtos p WHERE p.cat = c.nome AND p.status = 'ativo') AS pecasAtivas
      FROM categorias c
     WHERE c.arquivada_em IS NULL
     ORDER BY c.ordem, c.nome`).all();
  const itens = (results ?? []).map((c) => ({
    id: c.id || c.nome,
    nome: c.nome,
    ordem: c.ordem,
    cor: c.cor,
    sentinela: !!c.sentinela,
    pecas: Number(c.pecas ?? 0),
    pecasAtivas: Number(c.pecasAtivas ?? 0),
    orfa: Number(c.pecas ?? 0) === 0,
    criadaEm: c.criada_em || null,
    /* O que a tela PODE oferecer nesta linha. Vai explícito para nenhum
       botão existir sem a operação existir do lado de cá. */
    podeRenomear: !c.sentinela,
    podeArquivar: !c.sentinela && Number(c.pecas ?? 0) === 0,
  }));
  return {
    ok: true,
    itens,
    resumo: {
      total: itens.length,
      orfas: itens.filter((c) => c.orfa && !c.sentinela).length,
      semCategoria: itens.find((c) => c.sentinela)?.pecas ?? 0,
    },
  };
}

/** Cria ou atualiza ordem e cor — o contrato antigo de `POST /api/categorias`,
 *  agora com a normalização que faltava.
 *
 *  Um nome que colapsa para uma categoria existente NÃO cria outra: ele
 *  atualiza aquela. É a diferença entre ter uma categoria "Colar" e ter
 *  três que parecem a mesma na tela. */
export async function salvarCategoria(db, { nome, ordem, cor } = {}) {
  const limpo = texto(nome).replace(/[\s\u00a0]+/g, ' ');
  if (!limpo) return ERRO(400, 'Nome é obrigatório.');
  if (limpo.length > 120) return ERRO(400, 'Nome de categoria longo demais (máximo 120).');

  const norm = normalizarNomeCategoria(limpo);
  const existente = await db.prepare(
    `SELECT nome, id, sentinela FROM categorias
      WHERE nome_norm = ? AND arquivada_em IS NULL LIMIT 1`).bind(norm).first();

  if (existente) {
    if (existente.sentinela) {
      return ERRO(409, `"${existente.nome}" é o estado "sem categoria", não uma categoria editável.`);
    }
    await db.prepare(
      `UPDATE categorias SET ordem = ?, cor = ? WHERE nome = ?`
    ).bind(ordem ?? 99, cor || null, existente.nome).run();
    return { ok: true, criada: false, id: existente.id, nome: existente.nome };
  }

  const id = await idLivre(db, idDeCategoria(limpo));
  await db.prepare(
    `INSERT INTO categorias (nome, ordem, cor, id, slug, nome_norm, sentinela, criada_em)
     VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`
  ).bind(limpo, ordem ?? 99, cor || null, id, id, norm).run();
  return { ok: true, criada: true, id, nome: limpo };
}

/** Renomear — o ato que a API não tinha.
 *
 *  Quatro passos, um `db.batch`, e a ordem não é estilo: o D1 força chave
 *  estrangeira em toda query e não aceita `PRAGMA foreign_keys`.
 *
 *    1. arquiva a linha antiga  — ela sai do índice único parcial de `id`,
 *       liberando o mesmo id para a linha nova;
 *    2. insere a linha nova com o MESMO id — é isto que faz a categoria
 *       continuar sendo a mesma coisa depois de mudar de nome;
 *    3. move os produtos — agora existe um `cat` novo para eles apontarem;
 *    4. apaga a antiga — que a esta altura já não tem filho nenhum.
 *
 *  Se qualquer passo falhar, o batch inteiro volta atrás. Não existe estado
 *  intermediário em que metade do catálogo esteja numa categoria e metade na
 *  outra. */
export async function renomearCategoria(db, id, { nome } = {}) {
  const alvo = await db.prepare(
    `SELECT nome, id, ordem, cor, sentinela FROM categorias
      WHERE id = ? AND arquivada_em IS NULL LIMIT 1`).bind(texto(id)).first();
  if (!alvo) return ERRO(404, `Categoria "${id}" não existe.`);
  if (alvo.sentinela) {
    return ERRO(409, 'O estado "sem categoria" não se renomeia — ele não é uma categoria.');
  }

  const limpo = texto(nome).replace(/[\s\u00a0]+/g, ' ');
  if (!limpo) return ERRO(400, 'Nome é obrigatório.');
  if (limpo.length > 120) return ERRO(400, 'Nome de categoria longo demais (máximo 120).');
  if (limpo === alvo.nome) return { ok: true, id: alvo.id, nome: alvo.nome, semMudanca: true };

  const norm = normalizarNomeCategoria(limpo);
  const colide = await db.prepare(
    `SELECT nome FROM categorias
      WHERE nome_norm = ? AND id <> ? AND arquivada_em IS NULL LIMIT 1`).bind(norm, alvo.id).first();
  if (colide) {
    return ERRO(409, `Já existe a categoria "${colide.nome}".`, {
      explicacao: 'Juntar duas categorias numa é mesclar, e mesclar é decisão '
        + 'comercial sobre o catálogo — não está disponível aqui.',
    });
  }

  const { results } = await db.prepare(
    `SELECT COUNT(*) n FROM produtos WHERE cat = ?`).bind(alvo.nome).all();
  const pecas = Number(results?.[0]?.n ?? 0);

  await db.batch([
    db.prepare(`UPDATE categorias SET arquivada_em = datetime('now') WHERE nome = ?`).bind(alvo.nome),
    db.prepare(
      `INSERT INTO categorias (nome, ordem, cor, id, slug, nome_norm, sentinela, criada_em)
       VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`
    ).bind(limpo, alvo.ordem, alvo.cor, alvo.id, alvo.id, norm),
    db.prepare(`UPDATE produtos SET cat = ? WHERE cat = ?`).bind(limpo, alvo.nome),
    db.prepare(`DELETE FROM categorias WHERE nome = ?`).bind(alvo.nome),
  ]);

  return { ok: true, id: alvo.id, nome: limpo, nomeAnterior: alvo.nome, pecasMovidas: pecas };
}

/** Arquivar: tira da lista sem apagar.
 *
 *  Recusa enquanto houver peça — e a recusa diz quantas, porque "não dá" sem
 *  o número obriga a pessoa a caçar as peças à mão. Apagar a linha com
 *  filhos é impossível de qualquer forma (é a FK), mas descobrir isso por um
 *  erro de banco é pior que ser avisado. */
export async function arquivarCategoria(db, id) {
  const alvo = await db.prepare(
    `SELECT nome, id, sentinela FROM categorias
      WHERE id = ? AND arquivada_em IS NULL LIMIT 1`).bind(texto(id)).first();
  if (!alvo) return ERRO(404, `Categoria "${id}" não existe.`);
  if (alvo.sentinela) {
    return ERRO(409, 'O estado "sem categoria" não pode ser arquivado — é para onde '
      + 'uma peça vai quando ninguém escolheu categoria.');
  }

  const { n } = await db.prepare(
    `SELECT COUNT(*) n FROM produtos WHERE cat = ?`).bind(alvo.nome).first();
  if (n > 0) {
    return ERRO(409, `"${alvo.nome}" ainda tem ${n} ${n === 1 ? 'peça' : 'peças'}.`, {
      pecas: n,
      proximoPasso: `Mova as peças para outra categoria ou para "${SEM_CATEGORIA}" antes de arquivar.`,
    });
  }

  /* Arquivada, não apagada: a linha some das listas e sai dos dois índices
     únicos parciais, então o nome fica livre para ser reusado. Apagar de vez
     jogaria fora a única pista de que aquela categoria existiu. */
  await db.prepare(
    `UPDATE categorias SET arquivada_em = datetime('now') WHERE nome = ?`).bind(alvo.nome).run();
  return { ok: true, id: alvo.id, nome: alvo.nome, arquivada: true };
}

/** Um id que ainda não está em uso. Sufixo numérico só quando precisa —
 *  `colar`, `colar-2`, `colar-3`. */
async function idLivre(db, base) {
  for (let i = 0; i < 50; i++) {
    const tentativa = i === 0 ? base : `${base}-${i + 1}`;
    const usado = await db.prepare(
      `SELECT 1 x FROM categorias WHERE id = ? AND arquivada_em IS NULL LIMIT 1`).bind(tentativa).first();
    if (!usado) return tentativa;
  }
  return `${base}-${Date.now()}`;
}
