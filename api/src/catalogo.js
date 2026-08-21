/** Catálogo: analisar antes de aplicar, e aplicar em lote.
 *
 *  Duas importações diferentes moram aqui, e a diferença entre elas é a
 *  regra mais importante deste arquivo:
 *
 *   - ESTOQUE TOTAL  ajusta a quantidade de quem já existe. Nunca cria.
 *   - PEÇAS NOVAS    cria quem ainda não existe. Nunca ajusta.
 *
 *  Misturar as duas é o que fazia a importação travar: bastava a planilha
 *  trazer um código novo para o fluxo inteiro parar, quando o certo era
 *  separar esse código e seguir com os outros 700 (§22 — a importação
 *  sinaliza, não corrige em silêncio, e também não desiste em silêncio).
 *
 *  Nenhuma função deste arquivo escreve durante a ANÁLISE. Escrever só
 *  acontece em `aplicarEstoqueTotal` e `cadastrarNovos`, cada uma com a
 *  lista que a análise aprovou.
 */

import { movimentar } from './estoque.js';
import { liberarReserva } from './sku.js';

/* Quanto detalhe volta dos grupos que a tela só EXIBE. O total sempre é o
   de verdade — o corte é só do que ela desenha, para uma planilha de 5.000
   linhas não virar uma resposta de megabytes. */
const TETO_DETALHE = 500;

const texto = (v) => String(v == null ? '' : v).trim();
const normSku = (v) => texto(v).replace(/\s+/g, '').toUpperCase();

/** Número inteiro escrito por gente. Devolve `null` quando a célula tinha
 *  algo que não é número — é essa diferença que separa "quantidade zero"
 *  de "quantidade inválida", e sem ela um "a definir" na planilha viraria
 *  um zero que apaga estoque de verdade. */
function inteiroOuNulo(bruto, jaNumero) {
  if (bruto === undefined || bruto === null || texto(bruto) === '') {
    return Number.isFinite(+jaNumero) ? Math.trunc(+jaNumero) : null;
  }
  const s = texto(bruto).replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.trunc(+s);
}

function precoOuNulo(bruto, jaNumero) {
  if (bruto === undefined || bruto === null || texto(bruto) === '') {
    const n = +jaNumero;
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const s = texto(bruto).replace(/[R$\s]/gi, '').replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;   // undefined = escrito errado
  const n = +s;
  return n > 0 ? n : null;                            // null = sem preço (§24)
}

const SKU_LIMPO = /^[A-Z0-9][A-Z0-9._\-/]*$/;

function corta(lista) {
  return { total: lista.length, itens: lista.slice(0, TETO_DETALHE) };
}

/** Grupo que a tela não só mostra: ela AGE sobre ele — é esta lista que
 *  volta no "aplicar" e no "cadastrar todos". Cortar aqui perderia trabalho
 *  em silêncio: com 782 linhas certas, 282 sumiriam sem ninguém saber, e a
 *  tela ainda diria que deu tudo certo. Vai inteira. */
function inteira(lista) {
  return { total: lista.length, itens: lista };
}

/** Leitura do banco que as duas análises precisam. */
async function retrato(db) {
  const [prod, cats, kits, cons, pend, naLoja, reservas] = await Promise.all([
    db.prepare(`SELECT sku, desc, cat, preco, qtd, status FROM produtos`).all(),
    db.prepare(`SELECT nome FROM categorias`).all(),
    db.prepare(`SELECT DISTINCT kit_sku FROM kit_componentes`).all(),
    db.prepare(`SELECT mi.sku, SUM(mi.qtd - mi.devolvida) AS fora
                  FROM maleta_itens mi JOIN maletas m ON m.id = mi.maleta_id
                 WHERE m.status IN ('aberta','em_acerto') GROUP BY mi.sku`).all(),
    /* Os três abaixo entram porque "esse código está livre?" não se
       responde só com a tabela `produtos`. Um código pode estar preso na
       fila de peças novas, existir numa variante da Nuvemshop que ainda não
       foi cadastrada aqui, ou estar reservado por um "gerar SKU" de dois
       minutos atrás. São carregados de uma vez, e não por linha, porque a
       mesma função analisa planilha de 700 linhas. */
    db.prepare(`SELECT sku, desc FROM produtos_pendentes`).all(),
    db.prepare(`SELECT sku_norm, variante_id, produto_id, nome, produto_nome
                  FROM loja_variantes WHERE sku_norm IS NOT NULL`).all(),
    db.prepare(`SELECT sku, expira_em FROM sku_reservas WHERE expira_em > datetime('now')`).all(),
  ]);

  const variantesPorSku = new Map();
  for (const v of naLoja.results) {
    if (!variantesPorSku.has(v.sku_norm)) variantesPorSku.set(v.sku_norm, []);
    variantesPorSku.get(v.sku_norm).push(v);
  }

  return {
    existentes: new Map(prod.results.map(p => [p.sku, p])),
    categorias: new Set(cats.results.map(c => c.nome)),
    kits: new Set(kits.results.map(k => k.kit_sku)),
    consignado: new Map(cons.results.map(c => [c.sku, c.fora])),
    pendentes: new Map(pend.results.map(p => [normSku(p.sku), p])),
    variantesPorSku,
    reservas: new Map(reservas.results.map(r => [normSku(r.sku), r])),
  };
}

/** Onde este código já está em uso, olhando os quatro lugares de uma vez.
 *  Devolve lista vazia quando está livre. Dizer ONDE é o ponto: bloquear
 *  sem explicar obriga a pessoa a procurar o duplicado à mão. */
function ondeEstaEmUso(sku, r) {
  const usos = [];
  const p = r.existentes.get(sku);
  if (p) usos.push({ onde: 'produtos', sku: p.sku, desc: p.desc, status: p.status, qtd: p.qtd });
  const pend = r.pendentes && r.pendentes.get(sku);
  if (pend) usos.push({ onde: 'produtos_pendentes', sku: pend.sku, desc: pend.desc });
  for (const v of (r.variantesPorSku && r.variantesPorSku.get(sku)) || []) {
    usos.push({
      onde: 'loja_variantes', varianteId: String(v.variante_id),
      produtoId: String(v.produto_id), variacao: v.nome, produto: v.produto_nome,
    });
  }
  const res = r.reservas && r.reservas.get(sku);
  if (res) usos.push({ onde: 'reserva', expiraEm: res.expira_em });
  return usos;
}

/* ==================================================================== */
/* 1. ESTOQUE TOTAL — analisar                                          */
/* ==================================================================== */

/** Classifica cada linha da planilha nos cinco grupos combinados:
 *
 *   A  existe e está igual            → nada a fazer
 *   B  existe e a quantidade mudou    → pronto para aplicar
 *   C  não existe aqui                → peça nova; NÃO é criada por este fluxo
 *   D  existe aqui e não veio na planilha → aviso, e só
 *   E  problema de verdade            → fica de fora, sozinho
 *
 *  Um item do grupo E não derruba nenhum outro: ele sai da conta e o resto
 *  segue. Era exatamente isso que faltava.
 *
 *  `modo: 'casa'` quer dizer que a planilha contou só a prateleira, sem o
 *  que está com revendedora. Aí o consignado é somado de volta antes de
 *  comparar — senão a peça que só mudou de lugar apareceria como sumida.
 */
export async function analisarEstoqueTotal(db, { produtos, modo = 'total' } = {}) {
  if (!Array.isArray(produtos)) return { erro: 'Nada para analisar' };
  const { existentes, kits, consignado } = await retrato(db);
  const emCasa = modo === 'casa';

  const iguais = [], mudam = [], novos = [], revisao = [];
  const vistos = new Map();          // sku → índice em uma das listas acima
  const naPlanilha = new Set();
  let linhas = 0;

  const paraRevisar = (sku, motivo, detalhe, extra = {}) =>
    revisao.push({ sku, motivo, detalhe, ...extra });

  for (const bruto of produtos) {
    linhas++;
    const sku = normSku(bruto.sku);
    const desc = texto(bruto.desc);

    if (!sku) { paraRevisar('', 'codigo_vazio', desc || '(linha sem código e sem descrição)'); continue; }
    if (!SKU_LIMPO.test(sku)) { paraRevisar(sku, 'codigo_suspeito', desc); continue; }

    if (vistos.has(sku)) {
      /* Repetido na planilha. Repetir com a MESMA descrição é o caso normal
         dos códigos com sufixo, que somam — quem soma é a tela, antes de
         mandar. Chegar repetido aqui com descrição diferente é ambiguidade
         de verdade: duas peças disputando um código. */
      const antes = vistos.get(sku);
      paraRevisar(sku, 'duplicado_planilha', desc,
        { outraDesc: antes.desc, detalhe2: 'O mesmo código aparece em duas linhas com descrições diferentes.' });
      continue;
    }

    const qtd = inteiroOuNulo(bruto.brutoQtd, bruto.qtd);
    if (qtd === null) { paraRevisar(sku, 'qtd_invalida', desc, { valor: texto(bruto.brutoQtd) }); continue; }
    if (qtd < 0) { paraRevisar(sku, 'qtd_negativa', desc, { valor: qtd }); continue; }

    const preco = precoOuNulo(bruto.brutoPreco, bruto.preco);
    if (preco === undefined) { paraRevisar(sku, 'preco_invalido', desc, { valor: texto(bruto.brutoPreco) }); continue; }

    vistos.set(sku, { desc });
    naPlanilha.add(sku);

    const ex = existentes.get(sku);
    if (!ex) { novos.push({ sku, desc, cat: texto(bruto.cat) || null, preco, qtd }); continue; }

    if (kits.has(sku)) {
      /* Kit não tem saldo próprio (o disponível dele sai dos componentes),
         então "a planilha diz 4" não tem onde ser gravado sem inventar um
         estoque que não existe. */
      paraRevisar(sku, 'kit', ex.desc, { valor: qtd });
      continue;
    }

    const fora = consignado.get(sku) || 0;
    const alvo = emCasa ? qtd + fora : qtd;

    if (alvo < fora) {
      /* Menos peças no total do que já estão na mão de revendedora: a peça
         existe, alguém está com ela. Aplicar isso apagaria estoque real. */
      paraRevisar(sku, 'abaixo_do_consignado', ex.desc, { valor: alvo, fora });
      continue;
    }

    const delta = alvo - ex.qtd;
    if (delta === 0) iguais.push({ sku, desc: ex.desc, qtd: ex.qtd });
    else mudam.push({ sku, desc: ex.desc, de: ex.qtd, para: alvo, delta, somouConsignado: emCasa && fora > 0 });
  }

  /* Grupo D: existe aqui, não veio na planilha. Aviso e nada mais — zerar
     sozinho quem não apareceu é como se apagar peça fosse o padrão. */
  const ausentes = [];
  for (const [sku, p] of existentes) {
    if (naPlanilha.has(sku) || p.status !== 'ativo' || kits.has(sku)) continue;
    ausentes.push({ sku, desc: p.desc, qtd: p.qtd });
  }
  ausentes.sort((a, b) => b.qtd - a.qtd);

  const mudamOrdenados = mudam.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    modo,
    linhas,
    existentes: iguais.length + mudam.length,
    iguais: corta(iguais),
    mudam: inteira(mudamOrdenados),   // vira o "aplicar"
    novos: inteira(novos),            // vira a fila de peças novas
    ausentes: corta(ausentes),
    revisao: corta(revisao),
    /* O saldo da conta em uma linha, que é o que a tela mostra primeiro. */
    resumo: {
      linhas,
      semMudanca: iguais.length,
      vaoMudar: mudam.length,
      pecasAMais: mudam.reduce((s, m) => s + Math.max(0, m.delta), 0),
      pecasAMenos: mudam.reduce((s, m) => s + Math.min(0, m.delta), 0),
      novos: novos.length,
      ausentes: ausentes.length,
      revisao: revisao.length,
    },
  };
}

/* ==================================================================== */
/* 2. ESTOQUE TOTAL — aplicar                                           */
/* ==================================================================== */

/** Aplica só o que a análise aprovou, e recalcula o delta AGORA.
 *
 *  A tela manda `{sku, para}` — o alvo — e nunca o delta. Isso não é
 *  detalhe: entre a análise e o clique pode ter entrado uma venda de
 *  balcão, e um delta calculado lá atrás cobraria essa venda duas vezes.
 *  O alvo é estável, o delta não.
 *
 *  §19: a diferença vira um movimento de ajuste rastreável, nunca um
 *  UPDATE direto no saldo.
 */
export async function aplicarEstoqueTotal(db, { itens } = {}) {
  if (!Array.isArray(itens) || !itens.length) return { erro: 'Nada para aplicar' };

  const { existentes, kits, consignado } = await retrato(db);
  const stmts = [], aplicados = [], recusados = [];

  for (const it of itens) {
    const sku = normSku(it.sku);
    const ex = existentes.get(sku);
    if (!ex) { recusados.push({ sku, motivo: 'nao_existe' }); continue; }
    if (kits.has(sku)) { recusados.push({ sku, motivo: 'kit' }); continue; }

    const alvo = inteiroOuNulo(undefined, it.para);
    if (alvo === null || alvo < 0) { recusados.push({ sku, motivo: 'alvo_invalido' }); continue; }

    const fora = consignado.get(sku) || 0;
    if (alvo < fora) { recusados.push({ sku, motivo: 'abaixo_do_consignado', fora }); continue; }

    const delta = alvo - ex.qtd;
    if (delta === 0) continue;   // alguém já acertou entre a análise e o clique

    stmts.push(...movimentar(db, {
      sku, tipo: 'ajuste', quantidade: delta, origem: 'importacao',
      obs: `Estoque total: planilha diz ${alvo}, sistema tinha ${ex.qtd}`,
    }));
    aplicados.push({ sku, de: ex.qtd, para: alvo, delta });
  }

  /* Lotes: o D1 tem limite de statements por batch, e uma planilha grande
     passa disso com folga. */
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));

  return { ok: true, aplicados: aplicados.length, recusados, detalhe: corta(aplicados) };
}

/* ==================================================================== */
/* 3. PEÇAS NOVAS — analisar em lote                                    */
/* ==================================================================== */

/** Separa o lote em três, e só o terceiro pede atenção humana:
 *
 *   prontos    → cadastráveis do jeito que estão, todos de uma vez
 *   jaExistem  → o código já é nosso; este fluxo NÃO altera cadastro
 *   revisao    → exceção de verdade, com o motivo dito por extenso
 *
 *  A regra de ouro: se 782 linhas estão certas, ninguém deveria clicar 782
 *  vezes. A revisão é por exceção, não por item.
 */
export async function analisarNovos(db, { produtos } = {}) {
  if (!Array.isArray(produtos)) return { erro: 'Nada para analisar' };
  const r = await retrato(db);
  const { categorias } = r;

  const prontos = [], jaExistem = [], revisao = [];
  const vistos = new Map();
  let linhas = 0;

  const paraRevisar = (sku, desc, motivos, extra = {}) => revisao.push({ sku, desc, motivos, ...extra });

  for (const bruto of produtos) {
    linhas++;
    const sku = normSku(bruto.sku);
    const desc = texto(bruto.desc);
    const motivos = [];

    if (!sku) { paraRevisar('', desc, ['codigo_vazio']); continue; }
    if (!SKU_LIMPO.test(sku)) motivos.push('codigo_suspeito');

    if (vistos.has(sku)) {
      const antes = vistos.get(sku);
      const mesmaCoisa = antes.desc.toLowerCase() === desc.toLowerCase();
      paraRevisar(sku, desc, [mesmaCoisa ? 'duplicado_planilha' : 'dados_conflitantes'], { outraDesc: antes.desc });
      continue;
    }
    vistos.set(sku, { desc });

    /* Só `produtos` é duplicado de verdade. Estar na loja é o caminho
       NORMAL deste fluxo — cadastrar aqui o código que a Nuvemshop já tem é
       como os dois lados se casam — e estar na fila de pendentes é o que
       este lote veio resolver. Os dois viram aviso, não recusa. */
    const usos = ondeEstaEmUso(sku, r);
    const noCatalogo = usos.find(u => u.onde === 'produtos');
    if (noCatalogo) {
      jaExistem.push({
        sku, desc: noCatalogo.desc, descPlanilha: desc,
        // ONDE, não só "já existe": é a diferença entre a pessoa resolver
        // em dez segundos e ir procurar à mão.
        usos,
      });
      continue;
    }
    const avisosDeUso = usos.filter(u => u.onde === 'loja_variantes');

    if (!desc) motivos.push('sem_descricao');

    const qtd = inteiroOuNulo(bruto.brutoQtd, bruto.qtd);
    if (qtd === null) motivos.push('qtd_invalida');
    else if (qtd < 0) motivos.push('qtd_negativa');

    const preco = precoOuNulo(bruto.brutoPreco, bruto.preco);
    if (preco === undefined) motivos.push('preco_invalido');

    const cat = texto(bruto.cat);
    if (cat && !categorias.has(cat)) motivos.push('categoria_inexistente');

    if (motivos.length) {
      paraRevisar(sku, desc, motivos, {
        cat: cat || null, preco: preco === undefined ? null : preco,
        qtd: qtd === null ? 0 : qtd, valorPreco: texto(bruto.brutoPreco), valorQtd: texto(bruto.brutoQtd),
      });
    } else {
      /* Peça sem preço NÃO é exceção: §24 trata "sem preço" como um estado
         legítimo e conhecido, diferente de R$ 0, e a venda dela já é
         bloqueada por isso lá na frente. Mandar para revisão seria trocar um
         estado que o sistema sabe tratar por um clique a mais em cada peça —
         justamente o que este fluxo existe para acabar. Ela entra marcada. */
      prontos.push({ sku, desc, cat: cat || 'Outros', preco, qtd,
                     alertas: [
                       ...(preco === null ? ['sem_preco'] : []),
                       ...(avisosDeUso.length ? ['ja_na_loja'] : []),
                     ],
                     naLoja: avisosDeUso.length ? avisosDeUso : undefined });
    }
  }

  return {
    linhas,
    prontos: inteira(prontos),        // vira o "cadastrar todos os válidos"
    jaExistem: corta(jaExistem),
    revisao: corta(revisao),
    resumo: {
      linhas, prontos: prontos.length, jaExistem: jaExistem.length, revisao: revisao.length,
      pecas: prontos.reduce((s, p) => s + p.qtd, 0),
      semPreco: prontos.filter(p => p.preco === null).length,
    },
  };
}

/* ==================================================================== */
/* 4. PEÇAS NOVAS — cadastrar em lote                                   */
/* ==================================================================== */

/** Cria os que ainda não existem. Quem já existe é DEVOLVIDO na lista de
 *  ignorados, nunca alterado — este fluxo serve para criar, e alterar
 *  cadastro por engano é o tipo de coisa que ninguém percebe até a etiqueta
 *  sair errada.
 *
 *  §24: preço ausente entra como NULL, jamais como R$ 0.
 *  §19: o saldo inicial entra como movimento de entrada, não como número
 *       digitado na coluna qtd.
 */
export async function cadastrarNovos(db, { produtos } = {}) {
  if (!Array.isArray(produtos) || !produtos.length) return { erro: 'Nada para cadastrar' };
  const r = await retrato(db);
  const { categorias } = r;

  const stmts = [], criados = [], ignorados = [], avisos = [];
  const nesteLote = new Set();

  for (const p of produtos) {
    const sku = normSku(p.sku);
    if (!sku) { ignorados.push({ sku: '', motivo: 'codigo_vazio' }); continue; }
    if (nesteLote.has(sku)) { ignorados.push({ sku, motivo: 'ja_existe', onde: 'duplicado no mesmo lote' }); continue; }

    /* A checagem roda AQUI, no backend, e não só na tela: validação de
       frontend é conveniência, não trava. A trava final é o índice único
       `idx_produtos_sku_norm`, que pega inclusive dois requests no mesmo
       instante — mas chegar nele significaria devolver um 500 sem
       explicação, e a resposta útil é dizer ONDE o código já está.

       O retrato foi lido UMA vez, lá em cima, e não por linha: esta função
       cadastra lotes de centenas de peças, e quatro consultas por linha
       viraria alguns milhares de idas ao banco por planilha. */
    if (!SKU_LIMPO.test(sku)) { ignorados.push({ sku, motivo: 'codigo_suspeito' }); continue; }
    const usos = ondeEstaEmUso(sku, r);
    const noCatalogo = usos.find(u => u.onde === 'produtos');
    if (noCatalogo) { ignorados.push({ sku, motivo: 'ja_existe', usos: [noCatalogo] }); continue; }
    nesteLote.add(sku);

    let cat = texto(p.cat) || 'Outros';
    if (!categorias.has(cat)) { avisos.push({ tipo: 'categoria_desconhecida', sku, detalhe: cat }); cat = 'Outros'; }

    const precoBruto = p.preco;
    const preco = (precoBruto === null || precoBruto === undefined || precoBruto === '' || +precoBruto === 0)
      ? null : +precoBruto;
    if (preco === null) avisos.push({ tipo: 'sem_preco', sku, detalhe: texto(p.desc) });

    const qtd = Math.max(0, inteiroOuNulo(undefined, p.qtd) ?? 0);

    stmts.push(db.prepare(
      `INSERT INTO produtos (sku, desc, cat, preco, qtd, foto_status) VALUES (?, ?, ?, ?, 0, 'sem_foto')`
    ).bind(sku, texto(p.desc) || sku, cat, preco));
    if (qtd) {
      stmts.push(...movimentar(db, {
        sku, tipo: 'entrada', quantidade: qtd, origem: 'importacao',
        obs: 'Saldo inicial do cadastro de peças novas',
      }));
    }
    stmts.push(db.prepare(`DELETE FROM produtos_pendentes WHERE sku = ?`).bind(sku));
    // O código saiu da fila de espera e virou peça: a reserva não tem mais
    // o que segurar. Vai no MESMO batch do INSERT para as duas coisas nunca
    // ficarem em estados diferentes.
    stmts.push(liberarReserva(db, sku));
    criados.push({ sku, desc: texto(p.desc) || sku, qtd });
  }

  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return { ok: true, criados: criados.length, ignorados, avisos, detalhe: corta(criados) };
}

/* ==================================================================== */
/* 5. FILA DE PEÇAS NOVAS                                               */
/* ==================================================================== */

/** A ponte entre os dois fluxos. A análise do estoque total encontra
 *  códigos novos; em vez de jogá-los fora (e obrigar a reimportar o mesmo
 *  arquivo), eles ficam aqui esperando o lote ser aprovado. */
export async function enfileirarPendentes(db, { produtos, origem = 'planilha' } = {}) {
  if (!Array.isArray(produtos)) return { erro: 'Nada para enfileirar' };
  const { existentes } = await retrato(db);
  const stmts = [];
  let n = 0;
  for (const p of produtos) {
    const sku = normSku(p.sku);
    if (!sku || existentes.has(sku)) continue;
    stmts.push(db.prepare(
      `INSERT INTO produtos_pendentes (sku, desc, cat, preco, qtd, origem, motivo)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sku) DO UPDATE SET desc=excluded.desc, cat=excluded.cat,
         preco=excluded.preco, qtd=excluded.qtd, origem=excluded.origem`
    ).bind(sku, texto(p.desc) || null, texto(p.cat) || null,
           p.preco == null ? null : +p.preco, Math.max(0, +p.qtd || 0),
           origem, texto(p.motivo) || 'Encontrado na planilha de estoque total'));
    n++;
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return { ok: true, enfileirados: n };
}

export async function listarPendentes(db) {
  const r = await db.prepare(
    `SELECT p.* FROM produtos_pendentes p
      WHERE NOT EXISTS (SELECT 1 FROM produtos x WHERE x.sku = p.sku)
      ORDER BY p.criado_em, p.sku`).all();
  return {
    produtos: r.results.map(p => ({
      sku: p.sku, desc: p.desc || '', cat: p.cat || null, preco: p.preco,
      qtd: p.qtd, origem: p.origem, motivo: p.motivo, criadoEm: p.criado_em,
    })),
  };
}

export async function limparPendentes(db, skus) {
  if (Array.isArray(skus) && skus.length) {
    const stmts = skus.map(s => db.prepare(`DELETE FROM produtos_pendentes WHERE sku = ?`).bind(normSku(s)));
    for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
    return { ok: true, removidos: skus.length };
  }
  await db.prepare(`DELETE FROM produtos_pendentes`).run();
  return { ok: true, removidos: 'todos' };
}
