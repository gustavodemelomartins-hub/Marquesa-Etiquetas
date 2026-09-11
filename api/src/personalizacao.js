/** §42 — MONTE SEU COLAR: configuração comercial montável
 *
 *  A Sthefany vende um colar Veneziana com um a três pingentes de filho,
 *  cada um com sexo e cor escolhidos na hora da venda. O caminho óbvio —
 *  criar uma variante permanente para cada combinação — explode o cadastro:
 *  três posições × dois sexos × seis cores já são 1.728 variantes que
 *  ninguém vai manter, e cada uma com saldo próprio para desencontrar.
 *
 *  ─── as duas identidades, que é a regra inteira
 *
 *    COMPONENTE FÍSICO   o que existe na gaveta e é contado: a Veneziana
 *                        `444032` e os pingentes de menino e menina. Tem
 *                        saldo, movimento, inventário e valor patrimonial.
 *    CONFIGURAÇÃO        o que foi vendido: "Colar Casal", `326660`. Tem
 *                        SKU, nome, preço e foto, e NÃO tem saldo próprio.
 *    COMPOSIÇÃO          a regra que liga os dois.
 *
 *  Contar a configuração como estoque somaria uma segunda vez as mesmas
 *  peças. Por isso `estoque.js › saldosDaConfiguracao` devolve `qtd 0` e
 *  calcula o disponível a partir dos componentes, e `produtos.qtd` do SKU
 *  comercial é ignorado de propósito — em produção ele não é zero, e ler
 *  esse número venderia um colar que só existe como nome.
 *
 *  ─── por que não é um kit
 *
 *  `kit_componentes` também é "um SKU sem saldo próprio", e a IDEIA vem de
 *  lá. O que não serve é a chave: uma linha de kit nomeia UM SKU, e aqui a
 *  composição é por SLOT TIPADO — "duas peças do grupo Menino" —, preenchido
 *  na venda com as cores que existirem. Reaproveitar a tabela faria a venda
 *  passar por `movimentarKit`, que baixaria só a Veneziana.
 *
 *  ─── onde cada coisa mora
 *
 *    personalizacao_modelos   a configuração: SKU comercial, base, preço
 *    personalizacao_slots     quantos slots de cada grupo
 *    personalizacao_opcoes    quais SKUs podem ocupar cada grupo
 *    venda_personalizacoes    qual configuração foi vendida
 *    venda_personalizacao_itens  o que fisicamente saiu, congelado
 *
 *  Tudo isso é DADO: cadastrar "Três Meninos" é criar o produto e gravar a
 *  configuração, sem deploy. Até 10/09/2026 as cinco configurações eram
 *  constantes neste arquivo, e por isso só mudavam com publicação.
 *
 *  ─── a baixa, que é onde mora o risco
 *
 *  Uma venda consome EXATAMENTE UMA VEZ a base e cada componente. Nem a
 *  base duas vezes, nem o componente pelo caminho do kit e de novo pelo da
 *  configuração. Os movimentos saem de uma lista só, montada aqui, e
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
 *  nada aqui mude.
 */
import { saldosDoSku, configuracaoDoSku, montagensPossiveis } from './estoque.js';
import { consultarEmLotes } from './plataforma/d1.js';
import { normSku } from './sku.js';

/** Trava operacional do lançamento de 2026-09-06 — Produtos Montáveis
 *  ("Monte seu Colar") ficou parado antes de fechar SKU comercial x base x
 *  componentes. Fail-closed, mesmo padrão de NUVEMSHOP_WRITES_ENABLED em
 *  nuvemshop.js: só a string exata "true" liga; ausente, "false" ou qualquer
 *  outra coisa mantém a feature fora do ar. Schema e código continuam no
 *  lugar — só o acesso fecha. */
export function personalizacaoAtiva(env) {
  return String(env?.PERSONALIZACAO_ATIVA || '').trim() === 'true';
}

const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });
const dinheiro = (v) => Math.round(Number(v) * 100) / 100;
const slugificar = (s) => String(s ?? '').trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Os grupos, um por slot, na ordem em que a tela pergunta.
 *  `['Menino', 'Menino', 'Menina']` para a configuração de três filhos —
 *  é o `slotTipos` que a tela sempre consumiu, agora vindo do banco. */
const tiposDosSlots = (slots) => slots.flatMap((s) => Array.from({ length: s.qtd }, () => s.grupo));

const totalDeSlots = (slots) => slots.reduce((n, s) => n + s.qtd, 0);

/* ═══════════════════════════════════════════════ as configurações */

/** Uma configuração inteira, pelo id, pelo slug ou pelo SKU comercial.
 *
 *  Aceita as três chaves porque a tela manda `modeloSlug`, integrações
 *  antigas mandam `modeloId` e uma página de produto da loja conhece só o
 *  SKU comercial — e as três apontam para a mesma linha. */
export async function configuracaoDaVenda(db, { modeloId, modeloSlug, skuComercial } = {}) {
  const slug = String(modeloSlug ?? '').replace(/^canonico:/, '').trim();
  const sku = skuComercial ? normSku(skuComercial) : '';
  const m = await db.prepare(
    `SELECT * FROM personalizacao_modelos
      WHERE (id = ? OR slug = ? OR sku_comercial = ?) LIMIT 1`,
  ).bind(modeloId ?? -1, slug, sku).first();
  if (!m || !m.sku_comercial) return null;
  return configuracaoDoSku(db, m.sku_comercial);
}

/** As configurações com as opções de cada grupo e a disponibilidade real.
 *
 *  A disponibilidade sai do MESMO caminho que a venda usa, e não de uma
 *  contagem paralela: o número que a tela mostra e o que o registro valida
 *  têm de ser o mesmo, senão a venda é recusada depois de a cliente já ter
 *  escolhido. */
export async function listarModelos(db, { incluirInativos = false } = {}) {
  const { results: modelos } = await db.prepare(
    `SELECT * FROM personalizacao_modelos
      WHERE (? = 1 OR ativo = 1) ORDER BY ordem, nome`,
  ).bind(incluirInativos ? 1 : 0).all().catch(() => ({ results: [] }));

  if (!modelos || !modelos.length) {
    return {
      ok: true, modelos: [],
      regra: 'Nenhuma configuração cadastrada ainda. Uma configuração diz qual '
        + 'é a base fixa, quantas posições de menino e de menina ela tem, e '
        + 'quais peças do catálogo podem ocupar cada posição.',
    };
  }

  const { results: opcoes } = await db.prepare(
    `SELECT o.*, p.desc AS componente_nome, p.preco AS componente_preco
       FROM personalizacao_opcoes o
       LEFT JOIN produtos p ON p.sku = o.componente_sku
      WHERE o.ativo = 1
      ORDER BY o.modelo_id, o.ordem, o.rotulo`,
  ).all().catch(() => ({ results: [] }));

  const { results: slots } = await db.prepare(
    `SELECT * FROM personalizacao_slots ORDER BY modelo_id, ordem, grupo`,
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

  const slotsPorModelo = new Map();
  for (const s of slots ?? []) {
    if (!slotsPorModelo.has(s.modelo_id)) slotsPorModelo.set(s.modelo_id, []);
    slotsPorModelo.get(s.modelo_id).push({
      grupo: s.grupo, qtd: Number(s.qtd), ordem: Number(s.ordem),
    });
  }

  const lista = [];
  for (const m of modelos) {
    const meusSlots = slotsPorModelo.get(m.id) ?? [];
    const base = m.base_sku_padrao ? saldo.get(m.base_sku_padrao) : null;
    const cfg = m.sku_comercial ? await configuracaoDoSku(db, m.sku_comercial) : null;
    lista.push({
      id: Number(m.id),
      slug: m.slug,
      nome: m.nome,
      skuComercial: m.sku_comercial ?? null,
      /* Sempre iguais: a faixa existia para a composição livre, encerrada
         em 10/09/2026. A tela continua lendo os dois. */
      slotsMin: totalDeSlots(meusSlots) || Number(m.slots_min),
      slotsMax: totalDeSlots(meusSlots) || Number(m.slots_max),
      slotTipos: tiposDosSlots(meusSlots),
      slots: meusSlots.map((s) => ({ grupo: s.grupo, qtd: s.qtd })),
      composicaoLivre: false,
      baseSkuPadrao: m.base_sku_padrao ?? null,
      baseNome: base ? base.desc : null,
      baseDisponivel: base ? base.disponivel : null,
      /* Quantas montagens desta configuração as peças sustentam. Nunca um
         número guardado: `produtos.qtd` do SKU comercial não é saldo. */
      disponivel: cfg ? await montagensPossiveis(db, cfg) : 0,
      precoSugerido: m.preco_sugerido == null ? null : Number(m.preco_sugerido),
      ativo: !!m.ativo,
      obs: m.obs ?? null,
      opcoes: porModelo.get(m.id) ?? [],
    });
  }

  return {
    ok: true,
    modelos: lista,
    regra: 'A base é sempre a Veneziana da configuração, e ela não é escolha. '
      + 'A linha da venda usa o SKU comercial; o estoque baixa a base e cada '
      + 'peça escolhida uma vez. O SKU comercial não tem saldo próprio.',
  };
}

/** Cria ou atualiza uma configuração com os slots e as opções dela.
 *
 *  Slots e opções são substituídos por inteiro: quem manda a lista está
 *  dizendo o quadro completo, e mesclar deixaria sobras de uma versão
 *  anterior aparecendo na tela de venda. */
export async function salvarModelo(db, corpo = {}) {
  const nome = String(corpo.nome ?? '').trim();
  if (!nome) return ERRO(400, 'Diga o nome da configuração.');
  const slug = slugificar(corpo.slug || nome);
  if (!slug) return ERRO(400, 'Nome inválido para a configuração.');

  /* O SKU comercial é a identidade da configuração na venda. Sem ele em
     dado, cadastrar uma configuração nova voltaria a exigir deploy. */
  const skuComercial = corpo.skuComercial ? normSku(corpo.skuComercial) : null;
  if (!skuComercial) return ERRO(400, 'Diga o SKU comercial da configuração.');
  const comercial = await db.prepare('SELECT sku, qtd FROM produtos WHERE sku = ?')
    .bind(skuComercial).first();
  if (!comercial) {
    return ERRO(400, `O SKU comercial ${skuComercial} não está no catálogo.`, { sku: skuComercial });
  }

  const baseSku = corpo.baseSkuPadrao ? normSku(corpo.baseSkuPadrao) : null;
  if (!baseSku) return ERRO(400, 'Diga qual é a base fixa (a Veneziana).');
  const base = await saldosDoSku(db, baseSku);
  if (!base) return ERRO(400, `A base ${baseSku} não está no catálogo.`, { sku: baseSku });
  if (base.montagem) {
    return ERRO(409, `${baseSku} é uma configuração montável e não pode ser base.`, { sku: baseSku });
  }
  if (baseSku === skuComercial) {
    return ERRO(409, 'A configuração não pode ser a própria base.');
  }

  const slots = Array.isArray(corpo.slots) ? corpo.slots : [];
  if (!slots.length) return ERRO(400, 'Diga quantas posições de cada grupo a configuração tem.');
  const porGrupo = new Map();
  for (const s of slots) {
    const grupo = String(s.grupo ?? '').trim();
    if (!grupo) return ERRO(400, 'Toda posição precisa de um grupo ("Menino", "Menina").');
    const qtd = Number(s.qtd ?? 1);
    if (!Number.isInteger(qtd) || qtd < 1) return ERRO(400, `Quantidade inválida no grupo ${grupo}.`);
    if (porGrupo.has(grupo)) return ERRO(400, `O grupo ${grupo} aparece duas vezes — some as posições numa linha só.`);
    porGrupo.set(grupo, qtd);
  }

  const opcoes = Array.isArray(corpo.opcoes) ? corpo.opcoes : [];
  if (!opcoes.length) return ERRO(400, 'Diga quais peças podem ocupar as posições.');
  const grupoDoSku = new Map();
  for (const o of opcoes) {
    const sku = normSku(o.componenteSku);
    if (!sku) return ERRO(400, 'Toda opção precisa de um código de componente.');
    const s = await saldosDoSku(db, sku);
    if (!s) return ERRO(400, `O componente ${sku} não está no catálogo.`, { sku });
    /* Componente é peça física. Deixar uma configuração ser componente de
       outra criaria composição dentro de composição — e o cálculo de
       disponibilidade passaria a se chamar sozinho. */
    if (s.montagem) return ERRO(409, `${sku} é uma configuração montável e não pode ser componente.`, { sku });
    const grupo = String(o.grupo ?? '').trim();
    if (!porGrupo.has(grupo)) {
      return ERRO(400, `A opção ${sku} está no grupo "${grupo}", que a configuração não tem.`, { sku });
    }
    /* O mesmo SKU em dois grupos quebraria a conta de disponibilidade: as
       peças do grupo são somadas, e a peça seria somada duas vezes. */
    if (grupoDoSku.has(sku) && grupoDoSku.get(sku) !== grupo) {
      return ERRO(409, `${sku} aparece em dois grupos da mesma configuração.`, { sku });
    }
    grupoDoSku.set(sku, grupo);
    if (!String(o.rotulo ?? '').trim()) {
      return ERRO(400, `Diga como a tela chama a opção ${sku} ("Menino Verde").`);
    }
  }
  for (const grupo of porGrupo.keys()) {
    if (![...grupoDoSku.values()].includes(grupo)) {
      return ERRO(400, `O grupo "${grupo}" tem posições e nenhuma peça que possa ocupá-las.`);
    }
  }

  const preco = corpo.precoSugerido == null || corpo.precoSugerido === ''
    ? null : dinheiro(corpo.precoSugerido);
  if (preco != null && (!Number.isFinite(preco) || preco < 0)) return ERRO(400, 'Preço sugerido inválido.');

  const total = [...porGrupo.values()].reduce((n, q) => n + q, 0);
  const existente = await db.prepare('SELECT id FROM personalizacao_modelos WHERE slug = ? OR sku_comercial = ?')
    .bind(slug, skuComercial).first();

  let id;
  if (existente) {
    id = Number(existente.id);
    await db.prepare(
      `UPDATE personalizacao_modelos
          SET nome = ?, slug = ?, sku_comercial = ?, slots_min = ?, slots_max = ?,
              base_sku_padrao = ?, preco_sugerido = ?, ativo = ?, ordem = ?, obs = ?
        WHERE id = ?`,
    ).bind(nome, slug, skuComercial, total, total, baseSku, preco,
      corpo.ativo === false ? 0 : 1, Number(corpo.ordem ?? 0),
      String(corpo.obs ?? '').trim() || null, id).run();
  } else {
    const r = await db.prepare(
      `INSERT INTO personalizacao_modelos
         (slug, nome, sku_comercial, slots_min, slots_max, base_sku_padrao, preco_sugerido, ativo, ordem, obs)
       VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    ).bind(slug, nome, skuComercial, total, total, baseSku, preco,
      corpo.ativo === false ? 0 : 1, Number(corpo.ordem ?? 0),
      String(corpo.obs ?? '').trim() || null).first();
    id = Number(r.id);
  }

  await db.batch([
    db.prepare('DELETE FROM personalizacao_slots WHERE modelo_id = ?').bind(id),
    ...[...porGrupo.entries()].map(([grupo, qtd], i) => db.prepare(
      'INSERT INTO personalizacao_slots (modelo_id, grupo, qtd, ordem) VALUES (?,?,?,?)',
    ).bind(id, grupo, qtd, i)),
    db.prepare('DELETE FROM personalizacao_opcoes WHERE modelo_id = ?').bind(id),
    ...opcoes.map((o, i) => db.prepare(
      `INSERT INTO personalizacao_opcoes
         (modelo_id, componente_sku, variacao, variante_id, rotulo, grupo, ordem, ativo)
       VALUES (?,?,?,?,?,?,?,1)`,
    ).bind(id, normSku(o.componenteSku),
      String(o.variacao ?? '').trim() || null,
      o.varianteId == null || o.varianteId === '' ? null : String(o.varianteId),
      String(o.rotulo).trim(), String(o.grupo ?? '').trim() || null,
      Number(o.ordem ?? i))),
  ]);

  const lista = await listarModelos(db, { incluirInativos: true });
  return { ok: true, modelo: lista.modelos.find((m) => m.id === id) ?? null, criado: !existente };
}

/* ══════════════════════════════════ a configuração de uma venda */

/** Valida e normaliza as montagens de um carrinho.
 *
 *  Devolve, para cada uma, a linha que entra em `venda_itens` (o recibo
 *  mostra a composição, não cinco peças soltas — é assim que ela pensa a
 *  venda) e a lista de MOVIMENTOS que a baixa precisa: a base e cada
 *  componente, uma vez cada.
 *
 *  `reservar` é o mesmo mecanismo dos kits em `registrarVenda`: duas
 *  montagens no mesmo carrinho que usam o pingente verde disputam a mesma
 *  peça física, e validar cada uma contra o disponível do BANCO aprovaria as
 *  duas — o banco só muda no batch, lá no fim. */
export async function prepararPersonalizacoes(db, lista, {
  disponivelReal, reservar, estoqueJaRefletido = false,
} = {}) {
  const preparadas = [];
  for (const [i, p] of (lista ?? []).entries()) {
    const onde = `Composição ${i + 1}`;

    const cfg = await configuracaoDaVenda(db, p);
    if (!cfg) return { erro: ERRO(400, `${onde}: configuração não encontrada.`) };
    if (!cfg.ativo) return { erro: ERRO(409, `${onde}: a configuração "${cfg.nome}" está inativa.`) };
    if (!cfg.slots.length) {
      return { erro: ERRO(409, `${onde}: a configuração "${cfg.nome}" não tem posições cadastradas.`) };
    }

    /* A base não é escolha. A decisão de 10/09/2026 revogou a troca de
       base: a Veneziana sai automaticamente em toda montagem, e o pedido
       que manda outra está enganado sobre o que está comprando. */
    const basePedida = p.baseSku ? normSku(p.baseSku) : null;
    if (basePedida && basePedida !== cfg.baseSku) {
      return { erro: ERRO(409, `${onde}: esta configuração usa sempre a base ${cfg.baseSku}.`) };
    }
    const baseSku = cfg.baseSku;
    if (!baseSku) return { erro: ERRO(409, `${onde}: a configuração não tem base cadastrada.`) };
    const base = await saldosDoSku(db, baseSku);
    if (!base) return { erro: ERRO(400, `${onde}: a base ${baseSku} não está no catálogo.`, { sku: baseSku }) };

    const componentes = Array.isArray(p.componentes) ? p.componentes : [];
    if (!componentes.length) return { erro: ERRO(400, `${onde}: escolha ao menos um componente.`) };

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
    const escolhasPorGrupo = new Map();
    for (const [k, c] of componentes.entries()) {
      const sku = normSku(c.componenteSku ?? c.sku);
      if (!sku) return { erro: ERRO(400, `${onde}: componente sem código na posição ${k + 1}.`) };
      const qtd = Number(c.qtd ?? 1) || 1;
      if (qtd < 1) return { erro: ERRO(400, `${onde}: quantidade inválida na posição ${k + 1}.`) };

      /* A peça escolhida tem de estar no cardápio DESTA configuração. Uma
         peça de fora seria uma composição inventada na venda, que é
         exatamente o que a configuração cadastrada existe para impedir. */
      const opcao = cfg.opcoes.find((o) => o.componenteSku === sku);
      if (!opcao) {
        return { erro: ERRO(409, `${onde}: ${sku} não é uma peça desta configuração.`, { sku }) };
      }
      const s = await saldosDoSku(db, sku);
      if (!s) return { erro: ERRO(400, `${onde}: o componente ${sku} não está no catálogo.`, { sku }) };
      escolhasPorGrupo.set(opcao.grupo, (escolhasPorGrupo.get(opcao.grupo) ?? 0) + qtd);

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

    /* ─── as posições, exatamente. Nem a mais — não existe quarto pingente
       numa configuração de três — nem a menos. Repetir a mesma cor DENTRO
       do grupo é permitido (decisão de 10/09/2026): o que a configuração
       fixa é quantas peças de cada grupo, não quais. */
    for (const slot of cfg.slots) {
      const veio = escolhasPorGrupo.get(slot.grupo) ?? 0;
      if (veio !== slot.qtd) {
        return {
          erro: ERRO(409,
            `${onde}: "${cfg.nome}" leva ${slot.qtd} `
            + `${slot.qtd === 1 ? 'peça' : 'peças'} do grupo ${slot.grupo}, e ${veio === 0 ? 'não veio nenhuma' : `vieram ${veio}`}.`),
        };
      }
    }
    for (const grupo of escolhasPorGrupo.keys()) {
      if (!cfg.slots.some((s) => s.grupo === grupo)) {
        return { erro: ERRO(409, `${onde}: "${cfg.nome}" não tem posição do grupo ${grupo}.`) };
      }
    }

    /* O preço é da CONFIGURAÇÃO, não a soma das peças: "Colar Casal
       R$ 129" é o que ela cobra, e somar base + pingentes daria outro
       número. §24 continua valendo — sem preço, não vende. */
    if (cfg.preco == null) {
      return { erro: ERRO(409, `${onde}: a configuração "${cfg.nome}" está sem preço cadastrado.`) };
    }
    const precoPedido = p.preco == null || p.preco === '' ? null : dinheiro(p.preco);
    if (precoPedido != null && precoPedido !== cfg.preco) {
      return {
        erro: ERRO(409,
          `${onde}: ${cfg.skuComercial} custa R$ ${cfg.preco.toFixed(2).replace('.', ',')}.`),
      };
    }
    const preco = cfg.preco;

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

    const skuComercial = cfg.skuComercial;
    const comercial = await db.prepare('SELECT sku FROM produtos WHERE sku = ?').bind(skuComercial).first();
    if (!comercial) {
      return { erro: ERRO(409, `${onde}: o SKU comercial ${skuComercial} não está no catálogo.`, { sku: skuComercial }) };
    }

    const nomeComposicao = cfg.nome + ' — ' + slots.map((s) => s.rotulo).join(', ');

    preparadas.push({
      modeloId: cfg.id,
      modeloNome: cfg.nome,
      modeloSlug: cfg.slug,
      skuComercial,
      baseSku,
      baseNome: base.desc,
      baseVariacao,
      baseVarianteId,
      preco,
      precoTabela: preco,
      observacao: String(p.observacao ?? '').trim() || null,
      slots,
      movimentos,
      /* O que vai para `venda_itens`: UMA linha, a composição inteira. O
         recibo mostra "Colar Casal — Menino Azul, Menina Rosa", e não três
         peças soltas que ninguém reconhece como o colar que a cliente
         levou. É esta linha que carrega a identidade comercial vendida; o
         estoque, que é outra coisa, sai pelos `movimentos`. */
      linha: {
        sku: skuComercial,
        desc: nomeComposicao,
        qtd: 1,
        preco,
        variacao: null,
        varianteId: null,
        precoTabela: preco,
        rotulo: null,
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
  /* Em lotes porque o D1 limita quantos parâmetros uma consulta aceita.
     O histórico de uma cliente antiga passa de cem vendas, e sem a quebra a
     consulta falhava inteira — com o `catch` transformando a falha em
     "nenhuma composição", que na tela vira o colar desmontado em peças
     soltas. Cada venda está em um lote só, então as linhas de uma mesma
     composição continuam juntas e na ordem de `vpi.posicao`. */
  let results = [];
  try {
    results = await consultarEmLotes(db, ids, (qs) => `
      SELECT vp.*, vpi.posicao, vpi.componente_sku, vpi.componente_nome,
             vpi.variacao AS item_variacao, vpi.variante_id AS item_variante_id,
             vpi.rotulo, vpi.qtd AS item_qtd,
             vpi.movimento_id
        FROM venda_personalizacoes vp
        LEFT JOIN venda_personalizacao_itens vpi ON vpi.personalizacao_id = vp.id
       WHERE vp.venda_id IN (${qs})
       ORDER BY vp.id, vpi.posicao`);
  } catch {
    results = [];
  }

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
        /* A coluna sempre foi gravada; não devolvê-la fazia o estorno
           perder a identidade da base — o total fechava e a razão por
           variação não. */
        baseVarianteId: r.base_variante_id ?? null,
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
