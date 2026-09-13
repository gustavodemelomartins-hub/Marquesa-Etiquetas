/** §37 / 5.3b — A PORTA FINANCEIRA ÚNICA DA VENDA
 *
 *  O defeito que este módulo existe para acabar: "a venda foi paga" era um
 *  fato com TRÊS escritores, e eles não escreviam a mesma coisa.
 *
 *    `receberConta`            fechava `vendas` E `garantia_trocas` no mesmo
 *                              batch, e preservava um parcial conhecido —
 *                              deixando `pago = 1` com `valor_recebido = 40`
 *                              de um total de 100, que afirma duas coisas
 *                              incompatíveis (B4);
 *    `registrarPagamentoVenda` fechava só a venda. A diferença de uma troca
 *                              ficava `a_receber` para sempre na linha do
 *                              tempo do caso (B2), e o parcial conhecido era
 *                              apagado com `valor_recebido = NULL` (B3);
 *    `pagarDiferencaTroca`     fechava as duas, por um terceiro caminho.
 *
 *  Três implementações do mesmo fato divergem por construção: a primeira que
 *  alguém corrigir deixa as outras duas para trás. Agora são três PORTAS e um
 *  NÚCLEO. Cada porta continua com o contrato HTTP que sempre teve; o estado
 *  que elas deixam no banco é, por construção, o mesmo.
 *
 *  Este módulo não importa `garantias.js`, `contas-receber.js` nem
 *  `vendas-comandos.js` — são todos chamadores dele. A única dependência é
 *  `garantia-eventos.js`, que é folha. É o que mantém o grafo numa direção só.
 *
 *  E, como §29 manda: NADA aqui toca estoque. A peça saiu quando a venda foi
 *  registrada. Receber o dinheiro não a faz sair de novo.
 */
import {
  registrarPagamentoDaDiferenca,
  registrarPagamentoDaDiferencaDesfeito,
} from './garantia-eventos.js';

const hojeISO = () => new Date().toISOString().slice(0, 10);
const dinheiro = (v) => Math.round(Number(v || 0) * 100) / 100;

/** `2026-02-31` casa com a regex e não existe no calendário. */
const dataIsoValida = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
  && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });

/** A troca VIVA representada por esta venda, se houver. §36: desde que a
 *  diferença nasce como venda, a venda e a linha de `garantia_trocas` são
 *  duas faces do mesmo real e fecham juntas ou não fecham. */
async function trocaDaVenda(db, vendaId) {
  return db.prepare(
    `SELECT id, garantia_id, diferenca, diferenca_status
       FROM garantia_trocas
      WHERE venda_id = ? AND estornada = 0`,
  ).bind(vendaId).first().catch(() => null);
}

/* ══════════════════════════════════════════ a semântica de valor_recebido

   Definida em 5.3b, e vale até a 5.8 trazer a coleção de recebimentos:

     `valor_recebido` é o TOTAL JÁ RECEBIDO que o sistema conhece.
     `NULL` significa "não há parcial conhecido" — e aí quem responde é
     `pago`: pago = 1 quer dizer recebido = total; pago = 0, recebido = 0.

   A invariante que nasce daí, e que este módulo passa a garantir:

     **`pago = 1` nunca coexiste com `valor_recebido < total`.**

   Quitar uma venda que tinha parcial conhecido leva `valor_recebido` ao
   total — o estado corrente passa a ser verdadeiro. Quitar uma que nunca
   teve número deixa `NULL`, porque "o sistema nunca soube um número aqui" e
   "o número é o total" são coisas diferentes, e as duas satisfazem a
   invariante.

   O QUE ISSO NÃO É: histórico de recebimentos. Não existe, neste sistema,
   lugar estruturado onde caiba "entraram 40 no dia 2, e 60 no dia 10".
   `historico_operacoes` é versionada mas pertence à planilha importada;
   `venda_item_correcoes` audita SKU de item. Nenhuma das duas serve, e
   improvisar uma terceira para escapar da limitação seria criar dinheiro
   fora do lugar. Então o número anterior é preservado do único jeito honesto
   disponível hoje — uma nota legível em `observacao`, com data e carimbo de
   origem, do mesmo modo que `estornarTroca` já anota o estorno — e o sistema
   NÃO afirma ter histórico de parcelas. Isso é 5.8. */
function notaDoParcial(valorAnterior, total, carimbo, data) {
  return `Quitada em ${data}: havia recebimento parcial conhecido de `
    + `${valorAnterior.toFixed(2)} de ${total.toFixed(2)}`
    + `${carimbo ? ` (${carimbo})` : ''}. Registro de parcelas só existe a partir da 5.8.`;
}

/** A versão do recebível DEPOIS da escrita. Quem a incrementa é o trigger
 *  `vendas_recebivel_versao`, então ela só se sabe relendo — e é isso que a
 *  resposta devolve, para a tela seguir escrevendo sem recarregar a lista. */
async function versaoDaVenda(db, vendaId) {
  const r = await db.prepare('SELECT recebivel_versao FROM vendas WHERE id = ?')
    .bind(vendaId).first();
  return r ? Number(r.recebivel_versao) : null;
}

/** O DINHEIRO DA VENDA ENTROU. Ponto único de escrita.
 *
 *  Devolve sempre um objeto de resultado; nunca uma Response. Quem traduz
 *  para HTTP é a porta, porque cada porta tem o seu contrato.
 *
 *  `jaEstavaPaga: true` não é erro e não escreve nada: é a resposta honesta a
 *  um retry. Cada porta decide se isso vira 200 ou 409 — o BANCO fica igual
 *  nos dois casos, que é o que a unificação existe para garantir. */
export async function quitarVenda(db, vendaId, {
  pagaEm = null, observacao = null, observacaoDoEvento = null, versaoEsperada = null,
} = {}) {
  const v0 = versaoEsperada == null ? null : Number(versaoEsperada);
  const v = await db.prepare('SELECT * FROM vendas WHERE id = ?').bind(vendaId).first();
  if (!v) return ERRO(404, 'Venda não encontrada.');
  if (v.cancelada) return ERRO(409, 'Venda cancelada não recebe pagamento.');
  if (v.pago) {
    /* 5.3c — a venda já está paga, e há dois motivos possíveis para isso, que
       não podem receber a mesma resposta:
     *
     *   · o MESMO clique chegando duas vezes (retry de rede, duplo clique).
     *     A tela segura a versão de antes do pagamento, que é a que ela viu;
     *     mas ela não mandou versão nenhuma, ou mandou a que ainda vale. Nada
     *     a escrever, e recusar com 409 faria a tela desfazer o que ela mesma
     *     conseguiu. Devolve `jaEstavaPaga`.
     *
     *   · OUTRA tela pagou no meio, com outra data. A versão que esta segura
       está velha, e responder "ok" faria ela acreditar que a SUA data entrou
     *     no faturamento. Ela não entrou. Isso é 409.
     *
     *  Quem separa os dois é exatamente a versão — e é por isso que ela não
     *  pode ser ignorada aqui só porque o resultado "já está pago" parece
     *  inofensivo. */
    if (v0 != null && Number(v.recebivel_versao) !== v0) {
      return ERRO(409, 'A cobrança mudou em outra ação. Recarregue antes de continuar.', {
        versaoAtual: Number(v.recebivel_versao),
      });
    }
    return {
      ok: true, jaEstavaPaga: true, vendaId: Number(v.id),
      pagaEm: v.data_pagamento ?? null, data: v.data,
      total: dinheiro(v.total), versao: Number(v.recebivel_versao ?? 1),
      estoqueTocado: false,
    };
  }

  const data = pagaEm ? String(pagaEm).trim() : hojeISO();
  if (!dataIsoValida(data)) return ERRO(400, 'Data de pagamento inválida. Use AAAA-MM-DD.');
  if (data > hojeISO()) return ERRO(400, `${data} ainda não chegou.`);
  /* Receber ANTES de vender é erro de digitação — e inverteria a ordem dos
     dois números no relatório de qualquer mês. */
  if (data < v.data) {
    return ERRO(400, `O pagamento (${data}) é anterior à venda (${v.data}). Confira as duas datas.`);
  }

  const total = dinheiro(v.total);
  const parcialAnterior = v.valor_recebido == null ? null : dinheiro(v.valor_recebido);
  const houveParcial = parcialAnterior != null && parcialAnterior > 0 && parcialAnterior < total;

  /* Só escreve número quando já havia número. Ver a nota de semântica acima. */
  const recebidoFinal = parcialAnterior == null ? null : total;

  /* `observacao` é a nota DA VENDA, e segue o contrato que
     `/api/vendas/:id/pagamento` sempre teve: substitui quando vem, preserva
     quando não vem. `observacaoDoEvento` é outra coisa — é a nota do
     PAGAMENTO na linha do tempo da garantia, e nunca encosta na venda.
     Confundir as duas foi um defeito de 5.3b: a nota do pagamento da
     diferença ia parar em `vendas.observacao`, apagando a anotação de quem
     tinha escrito ali antes, e sumia do evento, que era o lugar dela. */
  let obs = observacao != null ? observacao : (v.observacao ?? null);
  if (houveParcial) {
    const nota = notaDoParcial(parcialAnterior, total, v.pagamento_origem, data);
    obs = obs ? `${obs} · ${nota}` : nota;
  }

  const troca = await trocaDaVenda(db, vendaId);

  /* As duas linhas fecham no MESMO batch, ou o Painel mostraria a diferença
     como paga num lugar e em aberto no outro. O `AND pago = 0` é a trava
     contra o clique duplo: a segunda escrita muda zero linhas. */
  /* 5.3c — a versão viaja DENTRO do UPDATE, nunca num SELECT antes dele.
     Ler a versão e depois escrever sem condição deixa uma janela em que a
     outra tela grava no meio: o que se compara não é o que se escreve. */
  const escritas = [
    db.prepare(
      `UPDATE vendas
          SET pago = 1, data_pagamento = ?, pagamento_origem = 'informado',
              cobravel = 0, valor_recebido = ?, observacao = ?
        WHERE id = ? AND pago = 0${v0 == null ? '' : ' AND recebivel_versao = ?'}`,
    ).bind(...[data, recebidoFinal, obs, vendaId, ...(v0 == null ? [] : [v0])]),
  ];
  if (troca && troca.diferenca_status === 'a_receber') {
    /* NENHUM EFEITO PARCIAL. As duas escritas estão no mesmo batch, e a
       segunda só vale se a primeira valeu: sem este `EXISTS`, uma versão
       velha recusaria a venda e mesmo assim fecharia a diferença — que é a
       discordância entre tabelas que 5.3b acabou de eliminar. */
    escritas.push(db.prepare(
      `UPDATE garantia_trocas
          SET diferenca_status = 'paga', diferenca_paga_em = ?, diferenca_valor_pago = ?,
              atualizado_em = datetime('now')
        WHERE id = ? AND diferenca_status = 'a_receber'
          AND EXISTS (SELECT 1 FROM vendas WHERE id = ? AND pago = 1)`,
    ).bind(data, dinheiro(troca.diferenca), troca.id, vendaId));
  }
  const resultado = await db.batch(escritas);

  /* Zero linhas: ou a versão era velha, ou outra requisição pagou entre a
     leitura e a escrita. Nos dois casos NADA foi escrito — nem aqui nem na
     troca — e a resposta devolve a versão atual para a tela recarregar. */
  if (Number(resultado?.[0]?.meta?.changes ?? 1) === 0) {
    /* A linha foi lida como não paga e mesmo assim nada mudou: entre a
       leitura e a escrita alguém chegou antes. NADA foi gravado — nem aqui
       nem na troca, que depende deste UPDATE pelo `EXISTS`. */
    const agora = await db.prepare(
      'SELECT pago, data_pagamento, recebivel_versao FROM vendas WHERE id = ?',
    ).bind(vendaId).first();
    const versaoAtual = agora ? Number(agora.recebivel_versao) : null;
    /* Sem versão pedida, "já está pago" é resposta honesta a um retry. Com
       versão pedida, a que esta requisição segurava já não vale — e dizer
       "ok" esconderia que a data dela não entrou. */
    if (v0 == null && agora && Number(agora.pago) === 1) {
      return {
        ok: true, jaEstavaPaga: true, vendaId: Number(vendaId),
        pagaEm: agora.data_pagamento ?? null, data: v.data,
        total, versao: versaoAtual, estoqueTocado: false,
      };
    }
    return ERRO(409, 'A cobrança mudou em outra ação. Recarregue antes de continuar.', {
      versaoAtual,
    });
  }

  /* §9 — escrever o evento NÃO pode derrubar um recebimento que já gravou: o
     dinheiro está no banco, e um histórico incompleto é melhor que uma
     cobrança perdida. A falha é dita, não engolida. */
  let eventoGravado = false;
  if (troca) {
    try {
      eventoGravado = await registrarPagamentoDaDiferenca(db, Number(troca.garantia_id), {
        trocaId: Number(troca.id),
        valor: dinheiro(troca.diferenca),
        pagaEm: data,
        vendaId: Number(vendaId),
        observacao: observacaoDoEvento,
      });
    } catch (e) {
      console.error('quitarVenda: diferença paga, mas o evento da garantia não gravou', e);
    }
  }

  const versao = await versaoDaVenda(db, vendaId);
  return {
    ok: true,
    vendaId: Number(vendaId),
    data: v.data,
    pagaEm: data,
    total,
    versao,
    /* Dito em voz alta, para nenhuma tela precisar deduzir. */
    valorRecebido: recebidoFinal,
    parcialAnteriorPreservadoEmObservacao: houveParcial ? parcialAnterior : null,
    garantiaId: troca ? Number(troca.garantia_id) : null,
    trocaId: troca ? Number(troca.id) : null,
    eventoDeGarantiaRegistrado: eventoGravado,
    /* §29 na resposta: receber dinheiro não move peça. */
    estoqueTocado: false,
  };
}

/** O CAMINHO DE VOLTA. Também ponto único.
 *
 *  Três regras, e nenhuma delas inventa nada:
 *
 *   1. **desfazer nunca ELEVA `cobravel`** (5.3a). Ele volta a 1 só quando o
 *      pagamento desfeito tinha sido declarado por uma PESSOA daqui
 *      (`pagamento_origem = 'informado'`), que é a mesma autoridade que agora
 *      se corrige. Declarado pela LOJA, `cobravel` é preservado: §36.4 —
 *      estado técnico da loja não vira dívida de ninguém.
 *
 *   2. **a troca relacionada volta junto.** Se esta venda representa a
 *      diferença de uma troca (§36), a diferença reabre. Sem isto `vendas`
 *      diria "não paga" e `garantia_trocas` diria "paga" — a mesma
 *      discordância entre tabelas que 5.3b existe para acabar.
 *
 *   3. **nenhum parcial é inventado.** `valor_recebido` volta a NULL, que sob
 *      a semântica de 5.3b significa "recebido conhecido = 0". O sistema não
 *      sabe reconstituir um parcial que existiu antes da quitação, e fingir
 *      que sabe seria pior que dizer que não sabe. A nota em `observacao`
 *      permanece, e é a única coisa que sobrevive até a 5.8.
 *
 *  `pagamento_origem` volta a NULL como sempre voltou, e isso é o que devolve
 *  a venda à sincronização: sem o carimbo `informado`, a rodada seguinte pode
 *  reescrever o estado verdadeiro da loja em vez de ser recusada. */
export async function desfazerPagamentoVenda(db, vendaId, { motivo = null, versaoEsperada = null } = {}) {
  const v = await db.prepare('SELECT * FROM vendas WHERE id = ?').bind(vendaId).first();
  if (!v) return ERRO(404, 'Venda não encontrada.');
  if (v.cancelada) return ERRO(409, 'Venda cancelada não recebe pagamento.');
  if (!v.pago) return ERRO(409, 'Esta venda já está como NÃO PAGA.');

  const declaradoPorPessoa = v.pagamento_origem === 'informado';
  const cobravel = declaradoPorPessoa ? 1 : Number(v.cobravel);
  const troca = await trocaDaVenda(db, vendaId);
  const quando = hojeISO();

  /* 5.3c — a mesma trava do caminho de ida, pelo mesmo motivo. */
  const v0 = versaoEsperada == null ? null : Number(versaoEsperada);
  const escritas = [
    db.prepare(
      `UPDATE vendas SET pago = 0, data_pagamento = NULL, pagamento_origem = NULL,
              valor_recebido = NULL, cobravel = ?
        WHERE id = ? AND pago = 1${v0 == null ? '' : ' AND recebivel_versao = ?'}`,
    ).bind(...[cobravel, vendaId, ...(v0 == null ? [] : [v0])]),
  ];
  if (troca && troca.diferenca_status === 'paga') {
    /* Sem efeito parcial: a diferença só reabre se a venda realmente voltou. */
    escritas.push(db.prepare(
      `UPDATE garantia_trocas
          SET diferenca_status = 'a_receber', diferenca_paga_em = NULL,
              diferenca_valor_pago = NULL, atualizado_em = datetime('now')
        WHERE id = ? AND diferenca_status = 'paga'
          AND EXISTS (SELECT 1 FROM vendas WHERE id = ? AND pago = 0)`,
    ).bind(troca.id, vendaId));
  }
  const resultado = await db.batch(escritas);

  if (Number(resultado?.[0]?.meta?.changes ?? 1) === 0) {
    const agora = await db.prepare(
      'SELECT pago, recebivel_versao FROM vendas WHERE id = ?').bind(vendaId).first();
    return ERRO(409, 'A cobrança mudou em outra ação. Recarregue antes de continuar.', {
      versaoAtual: agora ? Number(agora.recebivel_versao) : null,
    });
  }

  let eventoGravado = false;
  if (troca && troca.diferenca_status === 'paga') {
    try {
      eventoGravado = await registrarPagamentoDaDiferencaDesfeito(db, Number(troca.garantia_id), {
        trocaId: Number(troca.id),
        valor: dinheiro(troca.diferenca),
        quando,
        vendaId: Number(vendaId),
        motivo,
      });
    } catch (e) {
      console.error('desfazerPagamentoVenda: diferença reaberta, mas o evento não gravou', e);
    }
  }

  return {
    ok: true,
    vendaId: Number(vendaId),
    data: v.data,
    total: dinheiro(v.total),
    versao: await versaoDaVenda(db, vendaId),
    cobravel,
    /* O que volta a ser cobrável é o total — e zero quando não é cobrável,
       porque uma venda que ninguém deve não tem valor a receber. */
    aReceber: cobravel ? dinheiro(v.total) : 0,
    /* §9 — por que o valor saiu do faturamento sem aparecer no A Receber. */
    porque: declaradoPorPessoa
      ? 'o pagamento tinha sido registrado aqui por uma pessoa: desfazê-lo devolve a venda '
        + 'para conta a receber, pelo valor inteiro'
      : `o pagamento foi declarado pela loja (${v.pagamento_origem ?? 'sem carimbo'}), não por `
        + 'uma pessoa. A venda sai do faturamento e NÃO vira conta a receber: §36.4 — estado '
        + 'técnico da loja não é dívida de ninguém, e a política de reembolso ainda não existe.',
    garantiaId: troca ? Number(troca.garantia_id) : null,
    trocaId: troca ? Number(troca.id) : null,
    diferencaReaberta: !!(troca && troca.diferenca_status === 'paga'),
    eventoDeGarantiaRegistrado: eventoGravado,
    estoqueTocado: false,
  };
}
