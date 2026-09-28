import { corpoDaComposicao, type ComposicaoDoColar } from './colar';
import type { ProdutoDoEstado } from './tipos';

/** O carrinho de uma venda nova — as contas, sem tela.
 *
 *  Tudo aqui é regra que o BACKEND já aplica, repetida no navegador por um
 *  motivo só: recusar no balcão é mais barato que recusar depois de a
 *  pessoa ter conferido tudo. A autoridade continua sendo o Worker — se as
 *  duas discordarem, quem manda é ele, e a tela mostra a recusa dele.
 *
 *  As três regras que valem aqui:
 *
 *   1. peça sem preço cadastrado não é vendável (§24: NULL não é zero);
 *   2. não se vende mais do que está disponível;
 *   3. preço diferente do de tabela EXIGE motivo — sem ele, desconto é
 *      indistinguível de erro de digitação, e o dinheiro sai do
 *      faturamento sem que ninguém consiga perguntar quanto foi dado,
 *      para quem, e por quê.
 */

/** Uma variação vendável do código (aro, cor, banho) — a da LOJA, que é a
 *  que `POST /api/vendas` aceita em `varianteId`. `saldo` é a NOSSA razão:
 *  quanto desta variação existe de verdade, depois de repartido. */
export interface OpcaoDeVariacao {
  varianteId: string;
  nome: string;
  saldo: number;
}

export interface LinhaDoCarrinho {
  /** Identidade da LINHA, não da peça: o mesmo anel em dois aros são duas
   *  linhas do mesmo SKU. */
  chave: string;
  sku: string;
  /** O nome de catálogo, congelado no momento em que a linha entrou. */
  desc: string;
  qtd: number;
  /** O preço de catálogo. Nunca editável — é referência. */
  precoTabela: number;
  /** O preço COBRADO. Igual ao de tabela até alguém mudar. */
  preco: number;
  /** Obrigatório quando `preco !== precoTabela`. */
  descontoRotulo: string;
  /** Quanto ainda existe para vender, no momento em que a linha entrou. */
  disponivel: number;
  /** As variações do código. `null` = ainda não se sabe (carregando);
   *  `[]` = o código não pede variação. Com mais de uma, a venda precisa
   *  dizer qual saiu — o servidor recusa sem isso (§ regra 2: nunca chutar
   *  a distribuição de uma variante). */
  variacoes: OpcaoDeVariacao[] | null;
  varianteId: string | null;
}

export function linhaDoProduto(p: ProdutoDoEstado, chave: string = p.sku): LinhaDoCarrinho {
  return {
    chave,
    variacoes: null,
    varianteId: null,
    sku: p.sku,
    desc: p.desc,
    qtd: 1,
    precoTabela: p.preco ?? 0,
    preco: p.preco ?? 0,
    descontoRotulo: '',
    disponivel: p.disponivel,
  };
}

/** As opções que a venda precisa oferecer, a partir da estrutura da peça.
 *  Só variação da LOJA entra: é ela que `POST /api/vendas` reconhece por
 *  `varianteId`. Com uma só, o servidor escolhe sozinho — não há o que
 *  perguntar, e a lista volta vazia. */
export function opcoesDaEstrutura(
  variacoes: { varianteId: string | null; nome: string; saldo: number; daLoja: boolean }[] | undefined,
): OpcaoDeVariacao[] {
  const daLoja = (variacoes ?? [])
    .filter((v) => v.daLoja && v.varianteId)
    .map((v) => ({ varianteId: String(v.varianteId), nome: v.nome, saldo: Number(v.saldo) || 0 }));
  return daLoja.length > 1 ? daLoja : [];
}

export const totalDaLinha =(l: LinhaDoCarrinho) => Math.round(l.preco * l.qtd * 100) / 100;

export const totalDoCarrinho = (linhas: LinhaDoCarrinho[]) =>
  Math.round(linhas.reduce((s, l) => s + totalDaLinha(l), 0) * 100) / 100;

export const descontoDoCarrinho = (linhas: LinhaDoCarrinho[]) =>
  Math.round(linhas.reduce((s, l) => s + (l.precoTabela - l.preco) * l.qtd, 0) * 100) / 100;

export const pecasDoCarrinho = (linhas: LinhaDoCarrinho[]) =>
  linhas.reduce((s, l) => s + l.qtd, 0);

export const temDesconto = (l: LinhaDoCarrinho) => l.preco !== l.precoTabela;

/** O que impede esta venda de ser registrada, em frases.
 *
 *  Lista vazia significa que o backend vai aceitar — pelas regras que esta
 *  tela conhece. Ele ainda pode recusar por algo que só ele sabe (uma peça
 *  que acabou entre abrir a tela e apertar o botão), e essa recusa aparece
 *  onde acontece. */
export function impedimentos(
  linhas: LinhaDoCarrinho[],
  clienteNome: string,
  data: string,
  hoje: string,
  /* §43 — uma venda só de composição é venda cheia. Ignorá-las aqui faria a
     tela dizer "sem nenhuma peça" com um colar montado no carrinho. */
  composicoes: ComposicaoDoColar[] = [],
): string[] {
  const erros: string[] = [];

  if (!clienteNome.trim()) erros.push('Diga para quem é esta venda.');
  if (linhas.length === 0 && composicoes.length === 0) {
    erros.push('A venda está sem nenhuma peça.');
  }
  if (data > hoje) erros.push(`${data.split('-').reverse().join('/')} ainda não chegou.`);

  for (const l of linhas) {
    if (l.qtd <= 0) erros.push(`${l.desc}: quantidade tem que ser pelo menos 1.`);
    /* Peça é unidade física: "1,5 anel" não existe, e o estoque que sobra
       dela ("14,5 disponível") não corresponde a nada na gaveta. */
    if (!Number.isInteger(l.qtd)) erros.push(`${l.desc}: quantidade tem que ser um número inteiro de peças.`);
    if (l.variacoes && l.variacoes.length > 1 && !l.varianteId) {
      erros.push(`${l.desc}: escolha qual variação saiu (aro, cor, banho).`);
    }
    if (l.qtd > l.disponivel) {
      erros.push(`${l.desc}: só tem ${l.disponivel} disponível.`);
    }
    if (!l.precoTabela) {
      erros.push(`${l.desc} está sem preço cadastrado. Defina o preço antes de vender.`);
    }
    if (temDesconto(l) && !l.descontoRotulo.trim()) {
      erros.push(`${l.desc}: diga o motivo do preço diferente do de tabela.`);
    }
    if (l.preco < 0) erros.push(`${l.desc}: preço inválido.`);
  }

  /* A mesma peça em duas linhas somaria acima do disponível sem que nenhuma
     das duas parecesse errada. */
  const vistos = new Map<string, number>();
  for (const l of linhas) vistos.set(l.sku, (vistos.get(l.sku) ?? 0) + l.qtd);
  for (const [sku, qtd] of vistos) {
    const linha = linhas.find((l) => l.sku === sku) as LinhaDoCarrinho;
    if (qtd > linha.disponivel) {
      erros.push(`${linha.desc}: as linhas somam ${qtd}, e só tem ${linha.disponivel}.`);
    }
  }

  /* O saldo da VARIAÇÃO, somado entre linhas. Zero aqui quase sempre quer
     dizer "o código ainda não foi repartido entre as variações" — e vender
     assim seria escolher, por ela, de qual aro a peça saiu. */
  const porVariante = new Map<string, { l: LinhaDoCarrinho; v: OpcaoDeVariacao; qtd: number }>();
  for (const l of linhas) {
    const v = l.varianteId ? l.variacoes?.find((x) => x.varianteId === l.varianteId) : undefined;
    if (!v) continue;
    const k = `${l.sku}|${v.varianteId}`;
    const atual = porVariante.get(k);
    porVariante.set(k, { l, v, qtd: (atual?.qtd ?? 0) + l.qtd });
  }
  for (const { l, v, qtd } of porVariante.values()) {
    if (qtd > v.saldo) {
      erros.push(`${l.desc} · ${v.nome}: só tem ${v.saldo} nesta variação. `
        + 'Reparta o estoque do código entre as variações (Pendências ou ficha da peça) antes de vender.');
    }
  }

  return [...new Set(erros)];
}

/** O corpo que `POST /api/vendas` espera. Só os campos que ele aceita.
 *
 *  O que ele NÃO aceita, e por isso não viaja daqui:
 *    `canal`/`origem`  — `INSERT INTO vendas` grava `'balcao'` fixo. A tela
 *                        diz isso em vez de mandar um campo que se perde.
 *    `pagamentos[]`    — a quitação é integral (§29). Recebimento em partes
 *                        é a decisão D2, que continua fechada.
 *
 *  §43 — as composições do "Monte seu Colar" viajam no MESMO corpo, em
 *  `personalizacoes`. A venda é uma só: separá-las criaria duas vendas para
 *  uma compra, e o histórico da cliente mostraria a mesma tarde duas vezes. */
export function corpoDaVenda({
  linhas, composicoes = [], clienteId, clienteNome, data, pago, dataPagamento, observacao,
}: {
  linhas: LinhaDoCarrinho[];
  composicoes?: ComposicaoDoColar[];
  clienteId: number | null;
  clienteNome: string;
  data: string;
  pago: boolean;
  dataPagamento: string | null;
  observacao: string;
}) {
  return {
    ...(clienteId ? { clienteId } : {}),
    clienteNome: clienteNome.trim(),
    data,
    pago,
    /* §30 — a data do pagamento só viaja quando a venda nasce paga, e é
       ela, não a de hoje, que manda no faturamento. */
    ...(pago && dataPagamento ? { dataPagamento } : {}),
    ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
    itens: linhas.map((l) => ({
      sku: l.sku,
      qtd: l.qtd,
      preco: l.preco,
      ...(l.varianteId ? { varianteId: l.varianteId } : {}),
      ...(temDesconto(l) ? { descontoRotulo: l.descontoRotulo.trim() } : {}),
    })),
    ...(composicoes.length ? { personalizacoes: composicoes.map(corpoDaComposicao) } : {}),
  };
}

/* ─────────────────────────────────── o carrinho com composições dentro */

/** O total da venda inteira: as peças avulsas mais as composições. O preço
 *  de uma composição é o da CONFIGURAÇÃO, não a soma dos componentes — por
 *  isso ele entra inteiro, uma vez, e não item a item. */
export const totalDaVenda = (
  linhas: LinhaDoCarrinho[], composicoes: ComposicaoDoColar[],
) => Math.round((totalDoCarrinho(linhas)
  + composicoes.reduce((s, c) => s + c.preco, 0)) * 100) / 100;

export const pecasDaVenda = (
  linhas: LinhaDoCarrinho[], composicoes: ComposicaoDoColar[],
) => pecasDoCarrinho(linhas) + composicoes.length;
