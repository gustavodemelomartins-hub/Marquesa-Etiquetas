/** §43 — MONTE SEU COLAR: produto configurável
 *
 *  A Sthefany vende um colar Veneziana com um a três pingentes de filho,
 *  cada um com sexo e cor escolhidos na hora da venda. O caminho óbvio —
 *  criar uma variante permanente para cada combinação — explode o cadastro:
 *  três posições × dois sexos × seis cores já são 1.728 variantes que
 *  ninguém vai manter, e cada uma com saldo próprio para desencontrar.
 *
 *  A modelagem aqui é a que o pacote pediu, em três peças:
 *
 *    PRODUTO BASE   um SKU que já existe no catálogo (o Colar Veneziana).
 *    COMPONENTES    SKUs que já existem no catálogo (o "Pingente Filho
 *                   Verde Banho de Ouro 18k" é, hoje, a peça que mais
 *                   vendeu no painel). Não são estrutura nova.
 *    CONFIGURAÇÃO   escolhida por VENDA, não cadastrada antes.
 *
 *  ─── o que se reusa, e o que não dava para reusar
 *
 *  `kit_componentes` já implementa "um SKU que não tem saldo próprio e cujo
 *  disponível é o mínimo entre os componentes". A IDEIA e o mecanismo de
 *  baixa vêm de lá. O que não serve é a composição FIXA: um kit é sempre os
 *  mesmos componentes, e aqui eles mudam a cada venda. Por isso a
 *  composição mora em `venda_personalizacoes` + `venda_personalizacao_itens`
 *  — no lado da VENDA, não no do produto.
 *
 *  ─── a baixa, que é onde mora o risco
 *
 *  Uma venda personalizada consome EXATAMENTE UMA VEZ a base e cada
 *  componente. Nem a base duas vezes (ela é o item do recibo E uma peça
 *  física), nem o componente pelo caminho do kit e de novo pelo da
 *  personalização. Os movimentos saem de uma lista só, montada aqui, e
 *  `registrarVenda` a executa junto com o resto do carrinho.
 *
 *  E `estoque_ja_refletido` é a trava do §7.4: a venda que JÁ ACONTECEU
 *  antes de esta tela existir entra como histórico comercial e não
 *  movimenta nada. A flag fica gravada, auditável, porque é ela que separa
 *  "registrei o passado" de "vendi agora" — e é ela que impede a baixa dupla
 *  quando alguém registra a mesma venda duas vezes por engano.
 *
 *  ─── §7.5: por que isto não está preso à tela
 *
 *  Modelo e opções são DADO, não interface: `GET /api/personalizacao/modelos`
 *  devolve o que existe, com disponibilidade, e a venda entra pela mesma
 *  rota de sempre (`POST /api/vendas`, campo `personalizacoes`). Uma página
 *  de produto da Nuvemshop pode ler o primeiro e postar no segundo sem que
 *  nada aqui mude — o configurador do site e o do balcão passam a ser duas
 *  telas sobre a mesma regra, e não duas regras.
 */
import { saldosDoSku } from './estoque.js';

/** Pacote 2 — a família de colares de filhos deixou de ser configurável por
 * improviso. Estes são os SKUs confirmados pela operação em 07/09/2026.
 *
 * `MONTE-COLAR` é deliberadamente um SKU COMERCIAL interno: aparece como a
 * única linha da composição livre, mas não tem saldo nem movimento próprio.
 * O físico continua sendo sempre a Veneziana + os produtos escolhidos. */
export const SKU_BASE_COLAR = '444032';
export const SKU_COMERCIAL_LIVRE = 'MONTE-COLAR';

const OPCOES_CANONICAS = [
  { sku: '263236', rotulo: 'Menina rosa claro', grupo: 'Menina', nome: 'Colar Menina Zircônia Rosa Claro Banho de Ouro 18k' },
  { sku: '273470', rotulo: 'Menina incolor', grupo: 'Menina', nome: 'Colar Menina Zircônia Incolor Banho de Ouro 18k' },
  { sku: '251551', rotulo: 'Menino azul', grupo: 'Menino', nome: 'Colar Menino Zircônia Azul Banho de Ouro 18k' },
  { sku: '251552', rotulo: 'Menino incolor', grupo: 'Menino', nome: 'Colar Menino Zircônia Incolor Banho de Ouro 18k' },
  { sku: '329494', rotulo: 'Menino verde', grupo: 'Menino', nome: 'Colar Menino Zircônia Verde Banho de Ouro 18k' },
];

const MODELOS_CANONICOS = [
  { slug: 'casal', skuComercial: '326660', nome: 'Colar Casal Banho de Ouro 18k', slotTipos: ['Menino', 'Menina'], preco: 129 },
  { slug: 'duas-meninas', skuComercial: '364945', nome: 'Colar Filhas Duas Meninas Banho de Ouro 18k', slotTipos: ['Menina', 'Menina'], preco: 129 },
  { slug: 'dois-meninos', skuComercial: '311066', nome: 'Colar Filhos Dois Meninos Banho de Ouro 18k', slotTipos: ['Menino', 'Menino'], preco: 129 },
  { slug: 'dois-meninos-uma-menina', skuComercial: '314161', nome: 'Colar Filhos Dois Meninos e Uma Menina Banho de Ouro 18k', slotTipos: ['Menino', 'Menino', 'Menina'], preco: 159 },
  { slug: 'duas-meninas-um-menino', skuComercial: '399872', nome: 'Colar Filhos Duas Meninas e Um Menino Banho de Ouro 18k', slotTipos: ['Menina', 'Menina', 'Menino'], preco: 159 },
  { slug: 'livre', skuComercial: SKU_COMERCIAL_LIVRE, nome: 'Monte seu Colar — composição livre', slotTipos: [], preco: null, livre: true },
];

const modeloCanonico = ({ modeloSlug, modeloId } = {}) => {
  const chave = String(modeloSlug ?? modeloId ?? '').replace(/^canonico:/, '');
  return MODELOS_CANONICOS.find((m) => m.slug === chave) ?? null;
};

/** Trava operacional do lançamento de 2026-09-06 — Produtos Montáveis
 *  ("Monte seu Colar") ficou parado antes de fechar SKU comercial x base x
 *  componentes, base trocável, Ouro 18k/Prata 925 e o estorno de troca.
 *  Fail-closed, mesmo padrão de NUVEMSHOP_WRITES_ENABLED em nuvemshop.js: só
 *  a string exata "true" liga; ausente, "false" ou qualquer outra coisa
 *  mantém a feature fora do ar. Schema e código continuam no lugar — só o
 *  acesso fecha. Ver SESSION_CLOSE_2026-09-06.md § Retomar amanhã. */
export function personalizacaoAtiva(env) {
  return String(env?.PERSONALIZACAO_ATIVA || '').trim() === 'true';
}

const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });
const dinheiro = (v) => Math.round(Number(v) * 100) / 100;
const slugificar = (s) => String(s ?? '').trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ═══════════════════════════════════════════════════════ os modelos */

/** Os modelos com as opções e a disponibilidade de cada componente.
 *
 *  A disponibilidade sai do MESMO `saldosDoSku` que a venda usa, e não de
 *  uma contagem paralela: o número que a tela mostra e o que o registro
 *  valida têm de ser o mesmo, senão a venda é recusada depois de a cliente
 *  já ter escolhido. */
export async function listarModelos(db, { incluirInativos = false } = {}) {
  const { results: modelos } = await db.prepare(
    `SELECT * FROM personalizacao_modelos
      WHERE (? = 1 OR ativo = 1) ORDER BY ordem, nome`,
  ).bind(incluirInativos ? 1 : 0).all().catch(() => ({ results: [] }));

  /* Os modelos confirmados só aparecem quando a base física existe no
     catálogo deste ambiente. Assim instalações antigas, testes isolados e
     bancos ainda não preparados continuam vendo exatamente seus modelos
     dinâmicos; no catálogo real, a família canônica nasce sem cadastro
     manual paralelo. */
  const baseCanonica = await saldosDoSku(db, SKU_BASE_COLAR);
  const saldosCanonicos = new Map();
  if (baseCanonica) {
    for (const o of OPCOES_CANONICAS) saldosCanonicos.set(o.sku, await saldosDoSku(db, o.sku));
  }
  const canonicos = baseCanonica ? MODELOS_CANONICOS.map((m) => ({
    id: `canonico:${m.slug}`,
    slug: m.slug,
    nome: m.nome,
    skuComercial: m.skuComercial,
    slotsMin: m.livre ? 1 : m.slotTipos.length,
    slotsMax: m.livre ? 12 : m.slotTipos.length,
    slotTipos: m.slotTipos,
    composicaoLivre: !!m.livre,
    baseSkuPadrao: SKU_BASE_COLAR,
    baseNome: baseCanonica.desc,
    baseDisponivel: baseCanonica.disponivel,
    precoSugerido: m.preco,
    ativo: true,
    canonico: true,
    obs: m.livre
      ? 'Valor obrigatório informado na venda; um único SKU comercial para qualquer combinação livre.'
      : 'Preço e composição comercial confirmados pela operação.',
    opcoes: OPCOES_CANONICAS.map((o, i) => {
      const s = saldosCanonicos.get(o.sku);
      return {
        id: `canonico:${o.sku}`,
        componenteSku: o.sku,
        componenteNome: s?.desc ?? o.nome,
        variacao: null,
        varianteId: null,
        rotulo: o.rotulo,
        grupo: o.grupo,
        preco: s?.preco ?? null,
        disponivel: s?.disponivel ?? 0,
        indisponivel: !s ? 'peça fora do catálogo' : (s.disponivel <= 0 ? 'sem peça em estoque' : null),
        ordem: i,
      };
    }),
  })) : [];

  if ((!modelos || !modelos.length) && !canonicos.length) {
    return {
      ok: true, modelos: [],
      regra: 'Nenhum modelo cadastrado ainda. Um modelo diz quantas posições o '
        + 'colar tem e quais peças do catálogo podem ocupar cada uma.',
    };
  }

  const { results: opcoes } = await db.prepare(
    `SELECT o.*, p.desc AS componente_nome, p.preco AS componente_preco
       FROM personalizacao_opcoes o
       LEFT JOIN produtos p ON p.sku = o.componente_sku
      WHERE o.ativo = 1
      ORDER BY o.modelo_id, o.ordem, o.rotulo`,
  ).all().catch(() => ({ results: [] }));

  /* Uma passada de saldo por SKU distinto — base e componentes — em vez de
     uma por opção. §34: a lista é lida a cada abertura da tela de venda. */
  const skus = new Set();
  for (const m of modelos) if (m.base_sku_padrao) skus.add(m.base_sku_padrao);
  for (const o of opcoes ?? []) skus.add(o.componente_sku);
  const saldo = new Map();
  for (const sku of skus) {
    const s = await saldosDoSku(db, sku);
    saldo.set(sku, s ? { desc: s.desc, preco: s.preco, disponivel: s.disponivel, qtd: s.qtd } : null);
  }

  const porModelo = new Map();
  for (const o of opcoes ?? []) {
    if (!porModelo.has(o.modelo_id)) porModelo.set(o.modelo_id, []);
    const s = saldo.get(o.componente_sku);
    porModelo.get(o.modelo_id).push({
      id: Number(o.id),
      componenteSku: o.componente_sku,
      componenteNome: o.componente_nome ?? o.componente_sku,
      variacao: o.variacao ?? null,
      varianteId: o.variante_id == null ? null : String(o.variante_id),
      rotulo: o.rotulo,
      grupo: o.grupo ?? null,
      preco: s ? s.preco : null,
      disponivel: s ? s.disponivel : 0,
      /* §22 — o componente que saiu do catálogo aparece com o motivo, e não
         some da lista: sumir faria a opção parecer nunca ter existido. */
      indisponivel: !s ? 'peça fora do catálogo' : (s.disponivel <= 0 ? 'sem peça em estoque' : null),
    });
  }

  return {
    ok: true,
    modelos: [...canonicos, ...modelos
      .filter((m) => !canonicos.some((c) => c.slug === m.slug))
      .map((m) => {
      const base = m.base_sku_padrao ? saldo.get(m.base_sku_padrao) : null;
      return {
        id: Number(m.id),
        slug: m.slug,
        nome: m.nome,
        slotsMin: Number(m.slots_min),
        slotsMax: Number(m.slots_max),
        baseSkuPadrao: m.base_sku_padrao ?? null,
        baseNome: base ? base.desc : null,
        baseDisponivel: base ? base.disponivel : null,
        precoSugerido: m.preco_sugerido == null ? null : Number(m.preco_sugerido),
        ativo: !!m.ativo,
        obs: m.obs ?? null,
        opcoes: porModelo.get(m.id) ?? [],
      };
    })],
    regra: 'Nesta família, a base é sempre a Veneziana 444032. A linha da venda '
      + 'usa o SKU comercial do modelo; o estoque baixa a base e cada produto escolhido uma vez.',
  };
}

/** Cria ou atualiza um modelo com as opções dele.
 *
 *  As opções são substituídas por inteiro: quem manda a lista está dizendo
 *  o quadro completo, e mesclar deixaria sobras de uma versão anterior
 *  aparecendo na tela de venda. */
export async function salvarModelo(db, corpo = {}) {
  const nome = String(corpo.nome ?? '').trim();
  if (!nome) return ERRO(400, 'Diga o nome do modelo.');
  const slug = slugificar(corpo.slug || nome);
  if (!slug) return ERRO(400, 'Nome inválido para o modelo.');

  const slotsMin = Number(corpo.slotsMin ?? corpo.slots ?? 1);
  const slotsMax = Number(corpo.slotsMax ?? corpo.slots ?? slotsMin);
  if (!Number.isInteger(slotsMin) || slotsMin < 1) return ERRO(400, 'O modelo precisa de ao menos uma posição.');
  if (!Number.isInteger(slotsMax) || slotsMax < slotsMin) return ERRO(400, 'O máximo de posições não pode ser menor que o mínimo.');

  const baseSku = corpo.baseSkuPadrao ? String(corpo.baseSkuPadrao).trim().toUpperCase() : null;
  if (baseSku) {
    const b = await saldosDoSku(db, baseSku);
    if (!b) return ERRO(400, `A base ${baseSku} não está no catálogo.`, { sku: baseSku });
  }
  const preco = corpo.precoSugerido == null || corpo.precoSugerido === ''
    ? null : dinheiro(corpo.precoSugerido);
  if (preco != null && (!Number.isFinite(preco) || preco < 0)) return ERRO(400, 'Preço sugerido inválido.');

  const opcoes = Array.isArray(corpo.opcoes) ? corpo.opcoes : [];
  for (const o of opcoes) {
    const sku = String(o.componenteSku ?? '').trim().toUpperCase();
    if (!sku) return ERRO(400, 'Toda opção precisa de um código de componente.');
    const s = await saldosDoSku(db, sku);
    if (!s) return ERRO(400, `O componente ${sku} não está no catálogo.`, { sku });
    if (!String(o.rotulo ?? '').trim()) {
      return ERRO(400, `Diga como a tela chama a opção ${sku} ("Menino Verde").`);
    }
  }

  const existente = await db.prepare('SELECT id FROM personalizacao_modelos WHERE slug = ?')
    .bind(slug).first();

  let id;
  if (existente) {
    id = Number(existente.id);
    await db.prepare(
      `UPDATE personalizacao_modelos
          SET nome = ?, slots_min = ?, slots_max = ?, base_sku_padrao = ?,
              preco_sugerido = ?, ativo = ?, ordem = ?, obs = ?
        WHERE id = ?`,
    ).bind(nome, slotsMin, slotsMax, baseSku, preco,
      corpo.ativo === false ? 0 : 1, Number(corpo.ordem ?? 0),
      String(corpo.obs ?? '').trim() || null, id).run();
  } else {
    const r = await db.prepare(
      `INSERT INTO personalizacao_modelos
         (slug, nome, slots_min, slots_max, base_sku_padrao, preco_sugerido, ativo, ordem, obs)
       VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`,
    ).bind(slug, nome, slotsMin, slotsMax, baseSku, preco,
      corpo.ativo === false ? 0 : 1, Number(corpo.ordem ?? 0),
      String(corpo.obs ?? '').trim() || null).first();
    id = Number(r.id);
  }

  if (opcoes.length) {
    await db.batch([
      db.prepare('DELETE FROM personalizacao_opcoes WHERE modelo_id = ?').bind(id),
      ...opcoes.map((o, i) => db.prepare(
        `INSERT INTO personalizacao_opcoes
           (modelo_id, componente_sku, variacao, variante_id, rotulo, grupo, ordem, ativo)
         VALUES (?,?,?,?,?,?,?,1)`,
      ).bind(id, String(o.componenteSku).trim().toUpperCase(),
        String(o.variacao ?? '').trim() || null,
        o.varianteId == null || o.varianteId === '' ? null : String(o.varianteId),
        String(o.rotulo).trim(), String(o.grupo ?? '').trim() || null,
        Number(o.ordem ?? i))),
    ]);
  }

  const lista = await listarModelos(db, { incluirInativos: true });
  return { ok: true, modelo: lista.modelos.find((m) => m.id === id) ?? null, criado: !existente };
}

/* ══════════════════════════════════ a configuração de uma venda */

/** Valida e normaliza as personalizações de um carrinho.
 *
 *  Devolve, para cada uma, a linha que entra em `venda_itens` (o recibo
 *  mostra a composição, não cinco peças soltas — é assim que ela pensa a
 *  venda) e a lista de MOVIMENTOS que a baixa precisa: a base e cada
 *  componente, uma vez cada.
 *
 *  `reservar` é o mesmo mecanismo dos kits em `registrarVenda`: duas
 *  composições no mesmo carrinho que usam o pingente verde disputam a mesma
 *  peça física, e validar cada uma contra o disponível do BANCO aprovaria as
 *  duas — o banco só muda no batch, lá no fim. */
export async function prepararPersonalizacoes(db, lista, {
  disponivelReal, reservar, estoqueJaRefletido = false,
} = {}) {
  const preparadas = [];
  for (const [i, p] of (lista ?? []).entries()) {
    const onde = `Composição ${i + 1}`;

    /* O modelo canônico é regra de negócio; modelos positivos salvos no D1
       continuam aceitos para preservar as integrações e os testes existentes. */
    const canonico = modeloCanonico(p);
    let modelo = null;
    if (canonico) {
      modelo = {
        id: null,
        slug: canonico.slug,
        nome: canonico.nome,
        slots_min: canonico.livre ? 1 : canonico.slotTipos.length,
        slots_max: canonico.livre ? 12 : canonico.slotTipos.length,
        base_sku_padrao: SKU_BASE_COLAR,
        preco_sugerido: canonico.preco,
        ativo: 1,
      };
    } else if (p.modeloId != null || p.modeloSlug) {
      modelo = await db.prepare(
        'SELECT * FROM personalizacao_modelos WHERE (id = ? OR slug = ?) LIMIT 1',
      ).bind(p.modeloId ?? -1, p.modeloSlug ?? '').first();
      if (!modelo) return { erro: ERRO(400, `${onde}: modelo não encontrado.`) };
      if (!modelo.ativo) return { erro: ERRO(409, `${onde}: o modelo "${modelo.nome}" está inativo.`) };
    }

    const basePedida = String(p.baseSku ?? modelo?.base_sku_padrao ?? '').trim().toUpperCase();
    if (canonico && basePedida && basePedida !== SKU_BASE_COLAR) {
      return { erro: ERRO(409, `${onde}: esta família usa sempre a base ${SKU_BASE_COLAR}.`) };
    }
    const baseSku = canonico ? SKU_BASE_COLAR : basePedida;
    if (!baseSku) return { erro: ERRO(400, `${onde}: diga qual base foi usada.`) };
    const base = await saldosDoSku(db, baseSku);
    if (!base) return { erro: ERRO(400, `${onde}: a base ${baseSku} não está no catálogo.`, { sku: baseSku }) };

    const componentes = Array.isArray(p.componentes) ? p.componentes : [];
    if (!componentes.length) return { erro: ERRO(400, `${onde}: escolha ao menos um componente.`) };
    if (modelo) {
      const n = componentes.reduce((s, c) => s + (Number(c.qtd ?? 1) || 1), 0);
      if (n < modelo.slots_min || n > modelo.slots_max) {
        return {
          erro: ERRO(409,
            `${onde}: "${modelo.nome}" leva de ${modelo.slots_min} a ${modelo.slots_max} `
            + `${modelo.slots_max === 1 ? 'peça' : 'peças'}, e vieram ${n}.`),
        };
      }
    }

    /* O preço é da COMPOSIÇÃO, não a soma das peças: "Colar personalizado
       3 filhos R$ 149" é o que ela cobra, e somar base + pingentes daria
       outro número. §24 continua valendo — sem preço, não vende. */
    let preco = p.preco == null || p.preco === ''
      ? (modelo && modelo.preco_sugerido != null ? Number(modelo.preco_sugerido) : null)
      : dinheiro(p.preco);
    if (canonico && !canonico.livre) {
      if (preco != null && preco !== canonico.preco) {
        return { erro: ERRO(409, `${onde}: o modelo ${canonico.skuComercial} custa R$ ${canonico.preco.toFixed(2).replace('.', ',')}.`) };
      }
      preco = canonico.preco;
    }
    if (preco == null || !Number.isFinite(preco) || preco < 0) {
      return { erro: ERRO(409, `${onde}: diga o valor desta composição.`) };
    }

    /* ─── a demanda de peças físicas: a base uma vez, e cada componente
       quantas vezes ele aparecer. */
    const baseVariacao = String(p.baseVariacao ?? '').trim() || null;
    const baseVarianteId = p.baseVarianteId == null || p.baseVarianteId === ''
      ? null : String(p.baseVarianteId);
    const movimentos = [{
      sku: baseSku, qtd: 1, papel: 'base', nome: base.desc,
      variacao: baseVariacao, varianteId: baseVarianteId,
    }];
    const slots = [];
    for (const [k, c] of componentes.entries()) {
      const sku = String(c.componenteSku ?? c.sku ?? '').trim().toUpperCase();
      if (!sku) return { erro: ERRO(400, `${onde}: componente sem código na posição ${k + 1}.`) };
      const qtd = Number(c.qtd ?? 1) || 1;
      if (qtd < 1) return { erro: ERRO(400, `${onde}: quantidade inválida na posição ${k + 1}.`) };
      const s = await saldosDoSku(db, sku);
      if (!s) return { erro: ERRO(400, `${onde}: o componente ${sku} não está no catálogo.`, { sku }) };
      if (canonico) {
        const opcao = OPCOES_CANONICAS.find((o) => o.sku === sku);
        if (!opcao) {
          return { erro: ERRO(409, `${onde}: ${sku} não é uma opção física desta família.`) };
        }
        const tipoEsperado = canonico.slotTipos[k];
        if (tipoEsperado && opcao.grupo !== tipoEsperado) {
          return { erro: ERRO(409, `${onde}: a posição ${k + 1} pede ${tipoEsperado.toLowerCase()}.`) };
        }
      }
      slots.push({
        posicao: Number(c.posicao ?? k + 1),
        componenteSku: sku,
        componenteNome: s.desc,
        variacao: String(c.variacao ?? '').trim() || null,
        varianteId: c.varianteId == null || c.varianteId === '' ? null : String(c.varianteId),
        rotulo: String(c.rotulo ?? '').trim() || s.desc,
        qtd,
      });
      const variacao = String(c.variacao ?? '').trim() || null;
      const varianteId = c.varianteId == null || c.varianteId === '' ? null : String(c.varianteId);
      const ja = movimentos.find((m) => m.sku === sku && m.papel === 'componente'
        && m.variacao === variacao && m.varianteId === varianteId);
      if (ja) ja.qtd += qtd;
      else movimentos.push({ sku, qtd, papel: 'componente', nome: s.desc, variacao, varianteId });
    }

    /* ─── disponibilidade, quando a venda vai mesmo baixar estoque.
       Registro retroativo (§7.4) não confere: a peça saiu meses atrás e o
       saldo de hoje não diz nada sobre ela. */
    if (!estoqueJaRefletido) {
      for (const m of movimentos) {
        const s = await saldosDoSku(db, m.sku);
        const disp = disponivelReal ? disponivelReal(m.sku, s.disponivel) : s.disponivel;
        if (m.qtd > disp) {
          return {
            erro: ERRO(409,
              `${onde}: ${s.desc} tem ${disp} ${disp === 1 ? 'disponível' : 'disponíveis'} `
              + `e a composição precisa de ${m.qtd}.`, { sku: m.sku, disponivel: disp }),
          };
        }
      }
      if (reservar) for (const m of movimentos) reservar(m.sku, m.qtd);
    }

    const skuComercial = canonico ? canonico.skuComercial : baseSku;
    const comercial = await saldosDoSku(db, skuComercial);
    if (!comercial) {
      return { erro: ERRO(409, `${onde}: o SKU comercial ${skuComercial} não está no catálogo.`, { sku: skuComercial }) };
    }

    const nomeComposicao = (modelo?.nome ?? 'Colar personalizado')
      + ' — ' + slots.map((s) => s.rotulo).join(', ');

    preparadas.push({
      modeloId: modelo?.id == null ? null : Number(modelo.id),
      modeloNome: modelo?.nome ?? 'Colar personalizado',
      modeloSlug: modelo?.slug ?? null,
      skuComercial,
      baseSku,
      baseNome: base.desc,
      baseVariacao,
      baseVarianteId,
      preco,
      precoTabela: base.preco == null ? null : Number(base.preco),
      observacao: String(p.observacao ?? '').trim() || null,
      slots,
      movimentos,
      /* O que vai para `venda_itens`: UMA linha, a composição inteira. O
         recibo mostra "Colar personalizado — 3 filhos · Menino Verde,
         Menina Rosa, Menino Azul", e não quatro peças soltas que ninguém
         reconhece como o colar que a cliente levou.

         Os nomes dos campos são os que `registrarVenda` já grava — `rotulo`
         e `precoTabela`, não `descontoRotulo`. O preço de tabela é o
         SUGERIDO do modelo quando existe: vender a composição por menos que
         o sugerido é desconto de verdade, e §27 quer isso registrado. */
      linha: {
        sku: skuComercial,
        desc: nomeComposicao,
        qtd: 1,
        preco,
        variacao: null,
        varianteId: null,
        precoTabela: modelo && modelo.preco_sugerido != null
          ? Number(modelo.preco_sugerido) : preco,
        rotulo: modelo && modelo.preco_sugerido != null
          && Number(modelo.preco_sugerido) !== preco
          ? `Preço combinado — ${modelo.nome}` : null,
      },
    });
  }
  return { ok: true, preparadas };
}

/** Grava as composições de uma venda já criada. Os movimentos ficam por
 *  conta de quem chama — é ele que junta tudo num batch só. */
export async function gravarPersonalizacoes(db, vendaId, preparadas, {
  estoqueJaRefletido = false, movimentoPorSku = new Map(),
} = {}) {
  const gravadas = [];
  for (const p of preparadas) {
    const r = await db.prepare(
      `INSERT INTO venda_personalizacoes
         (venda_id, sku_comercial, base_sku, base_variacao, base_variante_id, modelo_id, modelo_nome,
          preco, estoque_ja_refletido, observacao)
       VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    ).bind(vendaId, p.skuComercial, p.baseSku, p.baseVariacao, p.baseVarianteId, p.modeloId,
      p.modeloNome, p.preco, estoqueJaRefletido ? 1 : 0, p.observacao).first();

    await db.batch(p.slots.map((s) => db.prepare(
      `INSERT INTO venda_personalizacao_itens
         (personalizacao_id, posicao, componente_sku, componente_nome, variacao,
          variante_id, rotulo, qtd, movimento_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(r.id, s.posicao, s.componenteSku, s.componenteNome, s.variacao,
      s.varianteId, s.rotulo, s.qtd,
      /* NULL quando o estoque já estava refletido — e aqui NULL quer dizer
         exatamente "não movimentei, de propósito". */
      estoqueJaRefletido ? null : (movimentoPorSku.get(s.componenteSku) ?? null))));

    gravadas.push({ id: Number(r.id), ...p });
  }
  return gravadas;
}

/** As composições de um conjunto de vendas, para o histórico da cliente
 *  mostrar UMA venda personalizada com a configuração por baixo — e não
 *  cinco peças soltas que ninguém reconhece como o colar que ela comprou. */
export async function personalizacoesDeVendas(db, vendaIds = []) {
  const ids = [...new Set((vendaIds ?? []).filter((x) => x != null))];
  if (!ids.length) return new Map();
  const qs = ids.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT vp.*, vpi.posicao, vpi.componente_sku, vpi.componente_nome,
            vpi.variacao AS item_variacao, vpi.variante_id AS item_variante_id,
            vpi.rotulo, vpi.qtd AS item_qtd,
            vpi.movimento_id
       FROM venda_personalizacoes vp
       LEFT JOIN venda_personalizacao_itens vpi ON vpi.personalizacao_id = vp.id
      WHERE vp.venda_id IN (${qs})
      ORDER BY vp.id, vpi.posicao`,
  ).bind(...ids).all().catch(() => ({ results: [] }));

  const porVenda = new Map();
  const porId = new Map();
  for (const r of results ?? []) {
    if (!porId.has(r.id)) {
      const p = {
        id: Number(r.id),
        vendaId: Number(r.venda_id),
        modeloId: r.modelo_id == null ? null : Number(r.modelo_id),
        modeloNome: r.modelo_nome,
        skuComercial: r.sku_comercial ?? r.base_sku,
        baseSku: r.base_sku,
        baseVariacao: r.base_variacao ?? null,
        preco: Number(r.preco ?? 0),
        estoqueJaRefletido: !!r.estoque_ja_refletido,
        observacao: r.observacao ?? null,
        criadoEm: r.criado_em,
        componentes: [],
      };
      porId.set(r.id, p);
      if (!porVenda.has(p.vendaId)) porVenda.set(p.vendaId, []);
      porVenda.get(p.vendaId).push(p);
    }
    if (r.componente_sku) {
      porId.get(r.id).componentes.push({
        posicao: Number(r.posicao ?? 0),
        sku: r.componente_sku,
        nome: r.componente_nome ?? r.componente_sku,
        variacao: r.item_variacao ?? null,
        varianteId: r.item_variante_id ?? null,
        rotulo: r.rotulo ?? null,
        qtd: Number(r.item_qtd ?? 1),
        movimentoId: r.movimento_id == null ? null : Number(r.movimento_id),
      });
    }
  }
  return porVenda;
}
