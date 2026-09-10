/** O ciclo de vida de uma VENDA: registrar, receber, cancelar e listar o dia.
 *
 *  Este código morava dentro do despachante — ele era a maior parte dele — e
 *  saiu de lá sem uma linha alterada. As regras continuam as mesmas, e o
 *  motivo de cada uma continua escrito onde ela está:
 *
 *    §24  peça sem preço bloqueia a venda em vez de vender por R$ 0;
 *    §27  o desconto viaja com a venda, com preço de tabela e rótulo;
 *    §29  o pagamento tem data própria e não mexe em estoque;
 *    §19 e §28  cancelar cria movimentação inversa, nunca apaga a venda;
 *    §43  o colar montado é UMA venda personalizada, não peças soltas.
 *
 *  O estoque só muda por `estoque.js › movimentar` — aqui e em qualquer
 *  lugar. */
import { json } from './auth.js';
import { movimentar, saldosDoSku, movimentarKit, ehKit } from './estoque.js';
import { atualizarEstoqueDaVenda } from './vendas-estoque-nuvemshop.js';
/* A normalização de nome de cliente é UMA, e mora no importador histórico.
   Este arquivo tinha uma cópia dela (`normalizarTextoSimples`) com a mesma
   regra escrita de novo — e cópia de regra é divergência esperando data
   marcada. §21 do plano mestre já cobrou essa dívida uma vez. */
import { normalizarNomeCliente } from './vendas-historico-normalizar.js';
/* §43 — Monte seu Colar: base + componentes + configuração da venda. */
import {
  prepararPersonalizacoes, gravarPersonalizacoes, personalizacoesDeVendas,
  personalizacaoAtiva,
} from './personalizacao.js';

const hoje = () => new Date().toISOString().slice(0, 10);

/** §24: peça sem preço bloqueia a venda, em vez de vender por R$ 0. */
/* Exportada para caracterização (Fase 4, item 2): é o ponto onde a venda
   decide QUAL variação saiu, e esse contrato precisa de teste próprio.
   Nenhum outro módulo a chama. */
export async function varianteDaVenda(db, sku, varianteId) {
  const loja = (await db.prepare(
    `SELECT variante_id, nome FROM loja_variantes WHERE sku_norm = ? ORDER BY posicao`
  ).bind(sku).all()).results;
  if (varianteId != null && varianteId !== '') {
    const v = loja.find(x => String(x.variante_id) === String(varianteId));
    if (!v) return { erro: `${sku}: o variant_id escolhido não pertence mais a este código na Nuvemshop.` };
    return { varianteId: String(v.variante_id), variacao: v.nome || null, exigeSaldo: loja.length > 1 };
  }
  if (loja.length === 1) return { varianteId: String(loja[0].variante_id), variacao: loja[0].nome || null, exigeSaldo: false };
  if (loja.length > 1) return { erro: `${sku} tem mais de uma variação. Diga qual foi vendida.` };
  return { varianteId: null, variacao: null };
}

export async function registrarVenda(db, env, {
  clienteId, clienteNome, itens, data: dataPedida,
  /* §43 — as composições do "Monte seu Colar", no MESMO carrinho dos itens
     normais. Elas entram aqui, e não numa rota própria, porque a venda é
     uma só: separar criaria duas vendas para uma compra, e o histórico da
     cliente mostraria a mesma tarde duas vezes.
     `estoqueJaRefletido` é o §7.4 — registrar uma venda personalizada que
     JÁ aconteceu, sem baixar peça que já saiu meses atrás. */
  personalizacoes: personalizacoesPedidas, estoqueJaRefletido: estoqueJaRefletidoPedido,
  /* §29 e §13 do pacote: a venda fecha dizendo se foi paga e por quê ela
     aconteceu. Os dois campos são OPCIONAIS e nascem com o valor que o
     sistema já assumia — venda paga hoje —, então quem não os manda
     continua com o comportamento de sempre. */
  pago: pagoPedido, dataPagamento: dataPagamentoPedida, observacao: observacaoPedida,
}) {
  const entradas = (itens || []).filter(i => i.qtd > 0);
  const composicoes = Array.isArray(personalizacoesPedidas) ? personalizacoesPedidas : [];
  /* Desligado no lançamento de 2026-09-06 — ver personalizacaoAtiva(). Falha
     antes de tocar catálogo ou D1: uma venda comum (sem composições) não
     passa por aqui e continua funcionando igual. */
  if (composicoes.length && !personalizacaoAtiva(env)) {
    return json({
      erro: 'Produtos Montáveis (Monte seu Colar) está temporariamente desativado.',
      codigo: 'PERSONALIZACAO_DESATIVADA',
    }, 503);
  }
  const estoqueJaRefletido = !!estoqueJaRefletidoPedido;
  if (!entradas.length && !composicoes.length) return json({ erro: 'Nenhum item na venda' }, 400);
  if (!clienteNome || !clienteNome.trim()) return json({ erro: 'Nome da cliente é obrigatório' }, 400);
  /* A flag do §7.4 vale para a venda inteira, e uma venda que mistura peça
     avulsa com composição não pode ter metade do estoque refletido e metade
     não — isso seria impossível de auditar depois. */
  if (estoqueJaRefletido && entradas.length) {
    return json({
      erro: 'Uma venda com "estoque já refletido" registra só a composição já realizada. '
        + 'Lance as peças avulsas em outra venda.',
    }, 409);
  }

  /* ─── §28: a venda pode ser de ontem
   *
   * `data` era `hoje()`, sem alternativa. Quem vendeu no sábado e só foi
   * lançar na segunda não tinha caminho nenhum: a venda entrava com a data
   * errada ou não entrava. O painel de vendas é filtrado por dia, então ela
   * também não reaparecia onde a pessoa foi procurar.
   *
   * Data FUTURA é recusada: venda que ainda não aconteceu é erro de
   * digitação, e aceitá-la contaminaria o faturamento do mês que vem.
   * Passado é livre — é justamente o caso de uso.
   *
   * `movimentos.criado_em` continua sendo AGORA, e isso é o correto: a
   * venda aconteceu no sábado, o sistema soube na segunda. As duas datas
   * são verdadeiras e dizem coisas diferentes. */
  const data = dataPedida ? String(dataPedida).trim() : hoje();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return json({ erro: 'Data da venda inválida. Use o formato AAAA-MM-DD.' }, 400);
  }
  if (data > hoje()) {
    return json({ erro: `${data} ainda não chegou. A venda não pode ser de uma data futura.` }, 400);
  }

  /* ─── §29: pago quando? não é a mesma pergunta que vendido quando?
   *
   * Uma venda "A Receber" marcada como paga depois tem que entrar no
   * faturamento do mês em que o DINHEIRO chegou, não no da venda. Vender em
   * julho e receber em setembro é uma frase que o sistema não sabia dizer:
   * `vendas` só tinha `data`, e toda venda operacional era contada como
   * paga naquele dia.
   *
   * O padrão continua sendo PAGA — é o que a venda de balcão é na imensa
   * maioria das vezes, e mudar o padrão para "não paga" abriria uma conta a
   * receber em toda venda de quem não mexeu em nada.
   *
   * `data_pagamento` de uma venda paga que não diz a data é a data da
   * venda: pagou na hora. Nula só quando NÃO foi paga — e aí o campo
   * significa exatamente "ainda não aconteceu". */
  const pago = pagoPedido === undefined || pagoPedido === null ? 1 : (pagoPedido ? 1 : 0);
  let dataPagamento = null;
  if (pago) {
    dataPagamento = dataPagamentoPedida ? String(dataPagamentoPedida).trim() : data;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
      return json({ erro: 'Data do pagamento inválida. Use o formato AAAA-MM-DD.' }, 400);
    }
    if (dataPagamento > hoje()) {
      return json({ erro: `${dataPagamento} ainda não chegou. O pagamento não pode ser de uma data futura.` }, 400);
    }
    /* Receber ANTES de vender é erro de digitação — e inverteria a ordem
       dos dois números no relatório de qualquer mês. */
    if (dataPagamento < data) {
      return json({
        erro: `O pagamento (${dataPagamento}) é anterior à venda (${data}). Confira as duas datas.`,
      }, 400);
    }
  } else if (dataPagamentoPedida) {
    return json({ erro: 'Uma venda marcada como NÃO PAGA não pode ter data de pagamento.' }, 400);
  }
  const observacao = String(observacaoPedida ?? '').trim() || null;

  const linhas = [];
  // Quanto de cada SKU-base este carrinho já reservou até aqui. Existe por
  // causa dos kits: dois anúncios que usam o mesmo componente (o pingente
  // que é comum a "Colar Casal" e "Colar Filho(a)") não podem ser validados
  // cada um contra o disponível do BANCO — o banco só muda depois, no
  // db.batch() lá embaixo. Sem isto, vender os dois no mesmo carrinho
  // aprovaria os dois contra a mesma peça física.
  const reservado = new Map();
  const disponivelReal = (sku, disponivelNoBanco) => disponivelNoBanco - (reservado.get(sku) || 0);
  const reservar = (sku, qtd) => reservado.set(sku, (reservado.get(sku) || 0) + qtd);

  for (const entrada of entradas) {
    const sku = String(entrada.sku || '').trim().toUpperCase();
    const qtd = +entrada.qtd || 0;
    const s = await saldosDoSku(db, sku);
    if (!s) return json({ erro: `Código ${sku} não está no catálogo`, sku }, 400);
    if (s.preco === null || s.preco === undefined) {
      return json({ erro: `${s.desc} está sem preço cadastrado. Defina o preço antes de vender.`, sku }, 409);
    }

    let disp;
    if (s.componentes) {
      // disponível do kit descontando o que OUTRAS linhas deste mesmo
      // carrinho já reservaram dos componentes em comum — não o disponível
      // "puro" do banco, que ainda não sabe de nada até o batch lá embaixo
      disp = Math.min(...await Promise.all(s.componentes.map(async c => {
        const sc = await saldosDoSku(db, c.sku);
        return Math.floor(disponivelReal(c.sku, sc.disponivel) / c.qtd);
      })));
    } else {
      disp = disponivelReal(sku, s.disponivel);
    }
    if (qtd > disp) {
      return json({ erro: `${s.desc}: só tem ${disp} disponível`, sku }, 409);
    }
    if (s.componentes) { for (const c of s.componentes) reservar(c.sku, qtd * c.qtd); }
    else { reservar(sku, qtd); }
    const v = await varianteDaVenda(db, sku, entrada.varianteId);
    if (v.erro) return json({ erro: v.erro, sku }, 409);
    if (v.varianteId && v.exigeSaldo) {
      const saldo = await db.prepare(`
        SELECT COALESCE(SUM(qtd),0) saldo FROM movimentos
         WHERE sku=? AND (variante_id=? OR (variante_id IS NULL AND variacao=?))
      `).bind(sku, v.varianteId, v.variacao).first();
      if (+saldo.saldo < qtd) {
        return json({ erro: `${s.desc} · ${v.variacao || v.varianteId}: saldo da variação é ${saldo.saldo}. Reparta em Pendências antes de vender.`, sku }, 409);
      }
    }
    /* ─── §27: o preço DESTA venda, que pode não ser o do catálogo
     *
     * `s.preco` é o cadastro e continua intocado: desconto é desta venda, não
     * reprecificação. Editar o catálogo a partir daqui mudaria, em silêncio,
     * o preço de toda venda futura da peça.
     *
     * A tela manda o preço FINAL ("vou fazer por 65"), não o abatimento — é
     * como ela fala no balcão. O desconto é derivado, não digitado, então não
     * existe o estado em que os dois números se contradizem. */
    const precoTabela = s.preco;
    let preco = precoTabela;
    let rotulo = null;
    if (entrada.preco !== undefined && entrada.preco !== null && entrada.preco !== '') {
      const bruto = Number(entrada.preco);
      if (!Number.isFinite(bruto) || bruto < 0) {
        return json({ erro: `${s.desc}: preço inválido.`, sku }, 400);
      }
      preco = Math.round(bruto * 100) / 100;
      rotulo = String(entrada.descontoRotulo ?? '').trim() || null;
      /* Preço diferente do catálogo SEM motivo é indistinguível de erro de
       * digitação. Exigir o motivo é o que separa "fiz por 65 para o Grupo
       * VIP" de "digitei 65 sem querer", e é o que transforma o desconto em
       * informação — sem ele, o dinheiro some do faturamento sem explicação
       * e ninguém consegue perguntar quanto foi dado, para quem, por quê. */
      if (preco !== precoTabela && !rotulo) {
        return json({
          erro: `${s.desc}: diga o motivo do preço diferente do de tabela.`, sku,
        }, 409);
      }
    }
    linhas.push({ sku, qtd, preco, precoTabela, rotulo,
      desc: s.desc, componentes: s.componentes || null,
      varianteId: v.varianteId, variacao: v.variacao });
  }

  /* §43 — as composições entram no MESMO carrinho, depois dos itens avulsos.
     Depois, e não antes, porque elas usam o mesmo `reservado`: uma peça
     avulsa e um componente de composição podem ser a mesma peça física, e
     validar cada um contra o disponível do BANCO aprovaria os dois — o banco
     só muda no batch, lá embaixo. */
  let personalizadas = [];
  if (composicoes.length) {
    const prep = await prepararPersonalizacoes(db, composicoes, {
      disponivelReal, reservar, estoqueJaRefletido,
    });
    if (prep.erro) return json(prep.erro, prep.erro.statusHttp ?? 409);
    personalizadas = prep.preparadas;
    for (const p of personalizadas) {
      linhas.push({ ...p.linha, componentes: null, personalizacao: p });
    }
  }

  /* O total sempre foi a soma de `preco * qtd`. Continua sendo — o que mudou
     é de onde `preco` vem. Nenhuma fórmula de analytics precisou mudar. */
  const total = linhas.reduce((s, l) => s + l.preco * l.qtd, 0);

  /* ─── a ficha de quem levou as peças
   *
   * A venda de balcão gravava o NOME e ia embora. O painel dizia, num
   * comentário, que "se o nome for novo, o servidor cria" — e o servidor
   * não criava. Efeito: vender para alguém pela primeira vez não abria
   * ficha nenhuma, então na segunda venda o autocompletar não a encontrava
   * (não havia o que encontrar), e não havia onde guardar o telefone dela.
   * O ciclo que a operação descreve — "vendo, seleciono a cliente, e vai
   * para a ficha dela" — não fechava.
   *
   * Duas regras, e a segunda é a que importa:
   *
   *   um cadastro com esse nome  → a venda se amarra a ele;
   *   nenhum                     → cria, com `origem='manual'`;
   *   mais de um                 → NÃO escolhe. §2: nome não é identidade,
   *                                e duas "Camila" podem ser duas pessoas.
   *                                A venda segue pelo nome normalizado, que
   *                                é como ela já seguia — nada se perde, e
   *                                ninguém é fundido por engano.
   *
   * `origem='manual'`, e não um valor novo: é o que garante que reverter um
   * lote de planilha nunca apague uma cliente que nasceu de uma venda de
   * verdade — a reversão só toca em `origem='historico'`. */
  const nomeLimpo = clienteNome.trim();
  const norm = normalizarNomeCliente(nomeLimpo);
  let idCliente = clienteId || null;
  /* A recusa de escolher precisa ficar ESCRITA (§2 da revisão). Enquanto ela
     era só a ausência de `cliente_id`, renomear uma das homônimas fazia o
     nome voltar a apontar para uma pessoa só — e a venda que ninguém nunca
     atribuiu entrava inteira na ficha da que sobrou. */
  let clienteAmbiguo = 0;
  if (!idCliente && norm) {
    const { results: iguais } = await db.prepare(
      'SELECT id FROM clientes WHERE nome_norm = ?',
    ).bind(norm).all();
    if ((iguais ?? []).length === 1) idCliente = iguais[0].id;
    else if ((iguais ?? []).length > 1) clienteAmbiguo = 1;
    else if (!(iguais ?? []).length) {
      const nova = await db.prepare(
        `INSERT INTO clientes (nome, nome_norm, origem, criada_em)
         VALUES (?, ?, 'manual', datetime('now')) RETURNING id`,
      ).bind(nomeLimpo, norm).first();
      idCliente = nova.id;
    }
  }
  /* `cliente_nome_norm` é gravado AQUI, na venda.
   *
   * Ele nascia só no `backfillNormalizacao` que roda depois de uma
   * importação de planilha. Efeito: a venda de balcão de hoje ficava com a
   * chave de agrupamento nula até a próxima importação — e até lá o painel
   * a contava em "sem-nome", separada do histórico da mesma cliente. Quem
   * vendeu para a Bruna de manhã não via a venda na ficha da Bruna à tarde.
   *
   * A regra é a MESMA do importador (`normalizarNomeCliente`), o que é
   * justamente o que faz as duas populações se encontrarem. */
  const venda = await db.prepare(
    `INSERT INTO vendas (cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                         nuvemshop_status, pago, data_pagamento, observacao, pagamento_origem,
                         cliente_ambiguo, cobravel)
     VALUES (?, ?, ?, 'balcao', ?, ?, 'pendente', ?, ?, ?, ?, ?, ?) RETURNING id`,
    /* §1 da revisão — de onde veio a data de pagamento. Aqui ela é FATO:
       um humano marcou PAGO e escolheu a data na tela. É o que distingue
       esta linha da venda antiga, cuja data de pagamento é a data da venda
       usada como aproximação porque nunca existiu outra. */
  ).bind(idCliente, nomeLimpo, norm, data, total, pago, dataPagamento, observacao,
    pago ? 'informado' : null, clienteAmbiguo,
    /* Venda de balcão não paga É conta a receber: a cliente levou a peça e
       ficou devendo. `cobravel = 0` existe só para o que a LOJA declara que
       ninguém deve (reembolso, anulação, abandono). */
    pago ? 0 : 1).first();

  const stmts = [];
  for (const l of linhas) {
    stmts.push(db.prepare(
      `INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo, variacao, variante_id,
                                preco_tabela, desconto_valor, desconto_rotulo)
       VALUES (?, ?, ?, ?, ?, 'venda', ?, ?, ?, ?, ?)`
    ).bind(venda.id, l.sku, l.desc, l.qtd, l.preco, l.variacao, l.varianteId,
      /* `preco_tabela` é gravado SEMPRE, com ou sem desconto: sem ele, um
         reajuste de catálogo no mês que vem faria o desconto de hoje parecer
         outro número. `desconto_valor` fica NULL quando não houve alteração —
         zero diria "houve desconto, de zero", que é outra coisa. */
      l.precoTabela,
      l.preco === l.precoTabela ? null : Math.round((l.precoTabela - l.preco) * 100) / 100,
      l.rotulo));
    // Kit: a baixa vai nos componentes, não no kit — ele não tem saldo
    // próprio. O recibo (venda_itens acima) continua mostrando o kit
    // inteiro, porque é assim que ela pensa na venda.
    /* Venda de outro dia diz isso no movimento. `criado_em` guarda quando o
       lançamento aconteceu; quem lê a movimentação da peça precisa saber que
       a saída é de sábado, e não do dia em que a linha foi digitada. */
    const obsMov = `Venda ${venda.id} · ${clienteNome.trim()}`
      + (data === hoje() ? '' : ` · venda de ${data}`);
    if (l.personalizacao) {
      /* §43 — a composição baixa a BASE e cada COMPONENTE, uma vez cada.
         Os movimentos saem de uma lista montada em `prepararPersonalizacoes`,
         e não de `kit_componentes`: a composição é escolhida por venda, e
         somar os dois caminhos baixaria o componente duas vezes.
         `estoqueJaRefletido` (§7.4) pula esta parte inteira: a venda já
         aconteceu, e a peça já saiu na época. */
      if (!estoqueJaRefletido) {
        for (const mv of l.personalizacao.movimentos) {
          stmts.push(...movimentar(db, {
            sku: mv.sku, tipo: 'venda', quantidade: mv.qtd, origem: 'personalizado',
            vendaId: venda.id,
            obs: `${obsMov} · ${l.personalizacao.modeloNome} (${mv.papel})`,
            variacao: mv.variacao || null, varianteId: mv.varianteId || null,
          }));
        }
      }
    } else if (l.componentes) {
      stmts.push(...await movimentarKit(db, {
        kitSku: l.sku, tipo: 'venda', quantidade: l.qtd, origem: 'venda',
        vendaId: venda.id, obs: obsMov,
      }));
    } else {
      stmts.push(...movimentar(db, {
        sku: l.sku, tipo: 'venda', quantidade: l.qtd, origem: 'venda',
        vendaId: venda.id, obs: obsMov,
        variacao: l.variacao, varianteId: l.varianteId,
      }));
    }
  }
  await db.batch(stmts);

  /* §43 — a configuração é gravada DEPOIS dos movimentos, e nunca antes: se
     a baixa falhar, não fica composição registrada de uma venda que não
     baixou peça nenhuma. */
  let composicoesGravadas = [];
  if (personalizadas.length) {
    composicoesGravadas = await gravarPersonalizacoes(db, venda.id, personalizadas,
      { estoqueJaRefletido });
  }

  /* Venda cujo estoque já estava refletido não empurra nada para a loja: a
     peça saiu meses atrás, e reescrever o estoque online agora inventaria
     uma movimentação que não houve. */
  const nuvemshop = estoqueJaRefletido
    ? { status: 'nao_aplicavel', motivo: 'estoque já refletido; nada foi movimentado aqui' }
    : await atualizarEstoqueDaVenda(db, env, venda.id);
  return json({
    ok: true, id: venda.id, data, total, itens: linhas, nuvemshop,
    /* §43 — o que foi montado, para a tela mostrar a composição sem
       precisar pedir de novo. */
    ...(composicoesGravadas.length ? {
      personalizacoes: composicoesGravadas.map((p) => ({
        id: p.id, modeloNome: p.modeloNome, baseSku: p.baseSku, preco: p.preco,
        componentes: p.slots.map((s2) => ({
          posicao: s2.posicao, sku: s2.componenteSku, rotulo: s2.rotulo,
        })),
      })),
      estoqueJaRefletido,
    } : {}),
    /* §2 anunciado, nunca engolido: o sistema não decidiu de quem é a venda,
       e diz isso em vez de deixar a tela supor que decidiu. */
    clienteId: idCliente,
    clienteAmbiguo: !!clienteAmbiguo,
    ...(clienteAmbiguo ? {
      aviso: `Existe mais de um cadastro com o nome "${nomeLimpo}". A venda foi `
        + 'registrada sem vínculo — abra a ficha certa e amarre, se for o caso.',
    } : {}),
    /* §29 na resposta: a tela não precisa deduzir para onde o dinheiro foi. */
    pago: !!pago,
    dataPagamento,
    observacao,
    faturamentoEm: pago ? dataPagamento : null,
    aReceber: pago ? 0 : total,
  }, 201);
}

/** §29 — o dinheiro de uma venda "A Receber" entrou.
 *
 *  O defeito: marcar a venda como paga não movia o valor para o mês do
 *  pagamento. Não movia porque não havia onde escrever a data — e sem ela,
 *  faturamento e data da venda eram forçosamente a mesma coisa.
 *
 *  O que esta rota faz, e só isto:
 *    · grava `pago = 1` e a data em que o dinheiro chegou;
 *    · deixa `data` — a da venda — exatamente como estava.
 *
 *  O que ela deliberadamente NÃO faz:
 *    · não toca em estoque. A peça saiu quando a venda foi registrada;
 *      baixar de novo aqui seria a segunda baixa da mesma peça (§15 do
 *      pacote: "MARCAR VENDA COMO PAGA não baixa estoque novamente");
 *    · não mexe na Nuvemshop, nos itens nem no total.
 */
export async function registrarPagamentoVenda(db, id, corpo = {}) {
  const v = await db.prepare('SELECT * FROM vendas WHERE id = ?').bind(id).first();
  if (!v) return json({ erro: 'Venda não encontrada' }, 404);
  if (v.cancelada) return json({ erro: 'Venda cancelada não recebe pagamento.' }, 409);

  /* `pago: false` desfaz — é o caminho de volta de quem marcou por engano.
     Ele limpa a data junto, senão sobraria uma data de pagamento numa venda
     que não foi paga, e o faturamento continuaria a enxergá-la. */
  const querPagar = corpo.pago === undefined ? true : !!corpo.pago;

  if (!querPagar) {
    if (!v.pago) return json({ erro: 'Esta venda já está como NÃO PAGA.' }, 409);
    const r = await db.prepare(
      /* Desfazer devolve a venda para "o cliente ainda deve": é o caminho de
         volta de quem marcou pago por engano, e o padrão de toda venda não
         paga lançada por uma pessoa. */
      `UPDATE vendas SET pago = 0, data_pagamento = NULL, pagamento_origem = NULL,
              valor_recebido = NULL, cobravel = 1
        WHERE id = ? RETURNING *`,
    ).bind(id).first();
    return json({
      ok: true, id: r.id, pago: false, data: r.data, dataPagamento: null,
      aReceber: Number(r.total), estoqueAlterado: false,
    });
  }

  if (v.pago) {
    return json({
      erro: `Esta venda já está paga${v.data_pagamento ? ` em ${v.data_pagamento}` : ''}.`,
      dataPagamento: v.data_pagamento ?? null,
    }, 409);
  }

  const dataPagamento = corpo.dataPagamento ? String(corpo.dataPagamento).trim() : hoje();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
    return json({ erro: 'Data do pagamento inválida. Use o formato AAAA-MM-DD.' }, 400);
  }
  if (dataPagamento > hoje()) {
    return json({ erro: `${dataPagamento} ainda não chegou.` }, 400);
  }
  if (dataPagamento < v.data) {
    return json({
      erro: `O pagamento (${dataPagamento}) é anterior à venda (${v.data}). Confira as duas datas.`,
    }, 400);
  }

  const r = await db.prepare(
    /* §36.4: pago por inteiro zera o que se tem a receber, e limpa qualquer
       parcial que existisse — o saldo virou zero, não sobra metade. */
    `UPDATE vendas SET pago = 1, data_pagamento = ?, pagamento_origem = 'informado',
            valor_recebido = NULL, cobravel = 0,
            observacao = COALESCE(?, observacao)
      WHERE id = ? RETURNING *`,
  ).bind(dataPagamento, String(corpo.observacao ?? '').trim() || null, id).first();

  return json({
    ok: true,
    id: r.id,
    pago: true,
    /* As duas datas, lado a lado, porque são duas coisas diferentes e é
       exatamente essa distinção que a rota existe para tornar possível. */
    data: r.data,
    dataPagamento: r.data_pagamento,
    faturamentoEm: r.data_pagamento,
    /* A data foi DITA por alguém, não deduzida. É a distinção que §1 da
       revisão exige que nunca se perca. */
    pagamentoOrigem: r.pagamento_origem,
    valor: Number(r.total),
    aReceber: 0,
    estoqueAlterado: false,
  });
}




/** §19 e §28: cancelar cria movimentação inversa, não apaga a venda. */
export async function cancelarVenda(db, env, vendaId) {
  const v = await db.prepare(`SELECT * FROM vendas WHERE id = ?`).bind(vendaId).first();
  if (!v) return json({ erro: 'Venda não encontrada' }, 404);
  if (v.cancelada) return json({ erro: 'Venda já está cancelada' }, 409);

  const itens = (await db.prepare(`SELECT * FROM venda_itens WHERE venda_id = ?`).bind(vendaId).all()).results;
  const personalizacoes = (await personalizacoesDeVendas(db, [vendaId])).get(vendaId) || [];
  const stmts = [];
  /* A linha comercial da composição não é uma peça física. Para cada colar,
     estornamos a base e todos os componentes congelados, e pulamos exatamente
     uma linha correspondente do recibo. Venda retroativa com estoque já
     refletido não devolve nada — a mesma regra que impediu a baixa original. */
  const linhasComerciais = new Map();
  for (const p of personalizacoes) {
    const skuLinha = String(p.skuComercial || p.baseSku);
    linhasComerciais.set(skuLinha, (linhasComerciais.get(skuLinha) || 0) + 1);
    if (p.estoqueJaRefletido) continue;
    stmts.push(...movimentar(db, {
      sku: p.baseSku, tipo: 'cancelamento', quantidade: 1, origem: 'cancelamento',
      vendaId, obs: `Estorno da venda ${vendaId} · ${p.modeloNome} (base)`,
    }));
    for (const c of p.componentes || []) {
      stmts.push(...movimentar(db, {
        sku: c.sku, tipo: 'cancelamento', quantidade: Number(c.qtd || 1),
        origem: 'cancelamento', vendaId,
        obs: `Estorno da venda ${vendaId} · ${p.modeloNome} (componente)`,
        variacao: c.variacao || null, varianteId: c.varianteId || null,
      }));
    }
  }
  for (const i of itens) {
    const restantes = linhasComerciais.get(String(i.sku)) || 0;
    if (restantes > 0) {
      linhasComerciais.set(String(i.sku), restantes - 1);
      continue;
    }
    // se o sku vendido era um kit, o estorno também precisa ir para os
    // componentes — é lá que a baixa original aconteceu
    if (await ehKit(db, i.sku)) {
      stmts.push(...await movimentarKit(db, {
        kitSku: i.sku, tipo: 'cancelamento', quantidade: +i.qtd, origem: 'cancelamento',
        vendaId, obs: `Estorno da venda ${vendaId}`,
      }));
    } else {
      stmts.push(...movimentar(db, {
        sku: i.sku, tipo: 'cancelamento', quantidade: +i.qtd, origem: 'cancelamento',
        vendaId, obs: `Estorno da venda ${vendaId}`,
        variacao: i.variacao, varianteId: i.variante_id,
      }));
    }
  }
  stmts.push(db.prepare(`UPDATE vendas SET cancelada = 1 WHERE id = ?`).bind(vendaId));
  await db.batch(stmts);
  const nuvemshop = await atualizarEstoqueDaVenda(db, env, vendaId);
  return json({ ok: true, nuvemshop, personalizacoesEstornadas: personalizacoes.length });
}

export async function listarVendas(db, data) {
  const vendas = (await db.prepare(`SELECT * FROM vendas WHERE data = ? ORDER BY id`).bind(data).all()).results;
  const itens = (await db.prepare(
    `SELECT vi.* FROM venda_itens vi JOIN vendas v ON v.id = vi.venda_id WHERE v.data = ?`).bind(data).all()).results;
  /* §43 — a configuração das composições do dia, numa consulta só para
     todas as vendas: pedir uma por venda seria o N+1 que a auditoria do D1
     mandou evitar. */
  const composicoes = await personalizacoesDeVendas(db, vendas.map((v) => v.id));
  const porVenda = new Map();
  for (const it of itens) {
    if (!porVenda.has(it.venda_id)) porVenda.set(it.venda_id, []);
    porVenda.get(it.venda_id).push({
      sku: it.sku, desc: it.desc, qtd: it.qtd, preco: it.preco, motivo: it.motivo,
      variacao: it.variacao, varianteId: it.variante_id,
      /* §27: o desconto viaja com a venda. Sem isto, quem abre a venda de
         ontem vê R$ 65,00 e não tem como saber que a peça é de R$ 89,00 nem
         por que saiu mais barata. */
      precoTabela: it.preco_tabela ?? null,
      descontoValor: it.desconto_valor ?? null,
      descontoRotulo: it.desconto_rotulo ?? null,
    });
  }
  return vendas.map(v => ({
    id: v.id, origem: v.origem, clienteNome: v.cliente_nome, revendedoraId: v.revendedora_id,
    maletaId: v.maleta_id, data: v.data, total: v.total, cancelada: !!v.cancelada,
    criadaEm: v.criada_em, externoId: v.externo_id,
    nuvemshopStatus: v.nuvemshop_status, nuvemshopErro: v.nuvemshop_erro,
    /* §29: a lista do dia precisa dizer o que foi recebido e o que não foi.
       Sem isto, a venda "A Receber" fica indistinguível da paga, e o botão
       de marcar o pagamento não tem onde aparecer. */
    pago: !!v.pago,
    dataPagamento: v.data_pagamento ?? null,
    aReceber: v.pago ? 0 : Number(v.total),
    observacao: v.observacao ?? null,
    itens: porVenda.get(v.id) || [],
    /* §43 — o colar montado aparece como UMA venda personalizada, com a
       configuração por baixo, e não como base e pingentes soltos que
       ninguém reconhece como o colar que a cliente levou. */
    ...(composicoes.has(v.id) ? { personalizacoes: composicoes.get(v.id) } : {}),
  }));
}
