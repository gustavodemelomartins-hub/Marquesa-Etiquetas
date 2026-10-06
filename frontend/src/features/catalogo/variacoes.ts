import { chamar, type Connection } from '../../services/client';

/** VARIAÇÕES DA PEÇA — a estrutura, o saldo de cada uma, e a distribuição.
 *
 *  Este é o domínio da REGRA 2 do CLAUDE.md: *nunca chute a distribuição de
 *  uma variante*. A tela existe para tornar a dúvida visível, não para
 *  resolvê-la por conta própria — quando não se sabe qual aro saiu, o
 *  caminho é mostrar os dois números e parar.
 *
 *  As rotas:
 *
 *    GET  /api/produtos/:sku/variacoes             a estrutura + saldo
 *    POST /api/produtos/:sku/variacoes/distribuir  reparte o saldo
 *    GET  /api/loja/variantes/:sku                 o que a loja tem hoje
 *
 *  NÃO chamada por esta tela, de propósito:
 *    PUT /api/produtos/:sku/variacoes  — REESCREVE a estrutura, e com ela o
 *    saldo: uma variação que deixa de existir devolve o saldo dela para
 *    "sem variação", e desvincular da Nuvemshop para a sincronização da
 *    peça inteira. É Classe C com efeito em peça física.
 */

export interface ValorDeAtributo {
  atributo: string;
  valor: string;
}

export interface LinhaDeVariacao {
  varianteId: string | null;
  nome: string;
  valores: ValorDeAtributo[];
  /** O que a Nuvemshop diz que tem. `null` quando a peça não está publicada. */
  estoqueLoja: number | null;
  /** O que a NOSSA razão diz. É este que manda no físico. */
  saldo: number;
  /** A variação existe na loja. */
  daLoja: boolean;
  /** A variação da loja tem par no nosso cadastro. Uma `daLoja` sem par é
   *  uma variação órfã: a loja vende algo que aqui não tem nome. */
  mapeada: boolean;
  /** Quantas desta variação estão com revendedoras (maleta identificada). */
  comRevendedoras?: number;
}

export interface EstruturaDoProduto {
  sku: string;
  desc: string;
  cat: string | null;
  qtd: number;
  preco: number | null;
  /** O status do PRODUTO (`ativo`/`inativo`), não um código HTTP. */
  status: string;
  fonte: 'loja' | 'local' | 'nenhuma';
  temVariacao: boolean;
  /** Os atributos saem dos valores lidos, na ordem em que aparecem — quem
   *  vende por "Banho" e "Pedra" vê "Banho" e "Pedra", não "Cor" e
   *  "Tamanho". */
  atributos: { nome: string; valores: string[] }[];
  variacoes: LinhaDeVariacao[];
  /** O saldo que está no código e em nenhuma variação. É exatamente o que a
   *  distribuição existe para resolver — e enquanto ele for maior que zero
   *  numa peça com variação, ninguém sabe qual peça física está lá. */
  saldoSemVariacao: number;
  /** Com revendedoras, no total do código. */
  consignado?: number;
  /** Com revendedoras SEM variação identificada — fica "não informada". */
  consignadoSemVariacao?: number;
  somaLoja: number;
  erro?: string;
}

export function buscarEstrutura(
  conexao: Connection, sku: string, sinal?: AbortSignal,
): Promise<EstruturaDoProduto> {
  return chamar(
    conexao, 'GET', `/api/produtos/${encodeURIComponent(sku)}/variacoes`,
    undefined, { signal: sinal },
  );
}

export interface PedidoDeDistribuicao {
  varianteId: string;
  qtd: number;
}

export interface RespostaDaDistribuicao {
  ok?: boolean;
  erro?: string;
  status?: number;
  /** A soma pedida bate com `produtos.qtd`? O servidor recusa quando não, a
   *  menos que alguém diga explicitamente para ajustar o total. */
  total?: number;
  soma?: number;
  movimentos?: unknown[];
  [k: string]: unknown;
}

/** Reparte o saldo entre as variações.
 *
 *  `ajustarTotal` é a única porta que muda `produtos.qtd`, e ela EXIGE
 *  motivo: distribuir 7 peças num código que a razão diz ter 8 não é
 *  distribuição, é um ajuste de estoque — e um ajuste sem motivo é
 *  indistinguível de erro de digitação. */
export function distribuir(
  conexao: Connection, sku: string,
  corpo: {
    distribuicao: PedidoDeDistribuicao[];
    obs?: string;
    ajustarTotal?: boolean;
    motivo?: string;
    /** A distribuição CONHECIDA: a soma pode ficar abaixo do total, e o
     *  resto fica "variação ainda não informada" (06/10/2026). */
    parcial?: boolean;
  },
): Promise<RespostaDaDistribuicao> {
  return chamar(
    conexao, 'POST', `/api/produtos/${encodeURIComponent(sku)}/variacoes/distribuir`, corpo,
  );
}

/* ─────────────────────────────────────────────────── as contas da tela */

export const somaDistribuida = (d: Record<string, number>) =>
  Object.values(d).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);

/** O que impede ESTA distribuição de ser aceita (modo parcial, 06/10/2026).
 *
 *  A soma pode ficar ABAIXO do total — o resto é "variação ainda não
 *  informada", que é a verdade quando ninguém sabe o aro de uma peça. Acima
 *  do total, não: isso é mudar a quantidade da peça, e o caminho é Ajustar
 *  estoque. E a peça que está com revendedora sem variação conhecida tem de
 *  continuar em "não informada" — distribuí-la seria escolher o aro dela. */
export function impedimentosDaDistribuicao(
  estrutura: EstruturaDoProduto,
  distribuicao: Record<string, number>,
): string[] {
  const erros: string[] = [];
  for (const [vid, qtd] of Object.entries(distribuicao)) {
    const v = estrutura.variacoes.find((x) => x.varianteId === vid);
    if (!Number.isInteger(qtd) || qtd < 0) {
      erros.push(`${v?.nome ?? 'Uma variação'}: a quantidade tem que ser um número inteiro.`);
    } else if (v && (v.comRevendedoras ?? 0) > qtd) {
      erros.push(`${v.nome} tem ${v.comRevendedoras} com revendedora — não dá para deixar ${qtd}.`);
    }
  }
  const soma = somaDistribuida(distribuicao);
  if (soma > estrutura.qtd) {
    erros.push(`As variações somam ${soma}, e a peça tem ${estrutura.qtd} no total. `
      + 'Para mudar o total, use Ajustar estoque.');
  }
  const naoInformada = estrutura.qtd - soma;
  const semVariacaoFora = estrutura.consignadoSemVariacao ?? 0;
  if (soma <= estrutura.qtd && naoInformada < semVariacaoFora) {
    erros.push(`${semVariacaoFora} ${semVariacaoFora === 1 ? 'peça está' : 'peças estão'} com revendedora sem `
      + `variação informada. Deixe pelo menos ${semVariacaoFora} em "variação ainda não informada".`);
  }
  return [...new Set(erros)];
}

/** "+ Adicionar variação" em Peças. "23", "nº23" e "N23" são a mesma: se
 *  já existe, a resposta diz qual (`jaExiste`, `existente`). */
export function adicionarVariacao(
  conexao: Connection, sku: string, valor: string,
): Promise<{ ok?: boolean; valor?: string; criadas?: { nome: string }[]; erro?: string; jaExiste?: boolean; existente?: string }> {
  return chamar(conexao, 'POST', `/api/produtos/${encodeURIComponent(sku)}/variacoes/adicionar`, { valor });
}
