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
  },
): Promise<RespostaDaDistribuicao> {
  return chamar(
    conexao, 'POST', `/api/produtos/${encodeURIComponent(sku)}/variacoes/distribuir`, corpo,
  );
}

/* ─────────────────────────────────────────────────── as contas da tela */

export const somaDistribuida = (d: Record<string, number>) =>
  Object.values(d).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);

/** O que impede ESTA distribuição de ser aceita.
 *
 *  A régua é a mesma do servidor, aplicada antes do envio — e a frase que
 *  importa é a última: a soma tem de bater com o total do código, porque
 *  `produtos.qtd == SUM(movimentos.qtd)` é a razão contábil do estoque, e
 *  distribuir sem fechar a deixaria em desacordo consigo mesma. */
export function impedimentosDaDistribuicao(
  estrutura: EstruturaDoProduto,
  distribuicao: Record<string, number>,
  ajustarTotal: boolean,
  motivo: string,
): string[] {
  const erros: string[] = [];
  const linhas = estrutura.variacoes.filter((v) => v.varianteId);

  if (linhas.length < 2) {
    erros.push(
      `${estrutura.sku} não tem variações para distribuir. Se ele existe na `
      + 'Nuvemshop, importe a estrutura antes; se é peça só daqui, defina as '
      + 'variações primeiro.',
    );
  }

  for (const [vid, qtd] of Object.entries(distribuicao)) {
    if (!Number.isInteger(qtd) || qtd < 0) {
      const nome = linhas.find((v) => v.varianteId === vid)?.nome ?? vid;
      erros.push(`${nome}: a quantidade tem que ser um inteiro maior ou igual a zero.`);
    }
  }

  const soma = somaDistribuida(distribuicao);
  if (soma !== estrutura.qtd) {
    if (!ajustarTotal) {
      erros.push(
        `A soma das variações é ${soma} e o código tem ${estrutura.qtd}. `
        + 'Ou a conta fecha, ou isto é um ajuste de estoque — e aí diga que é.',
      );
    } else if (!motivo.trim()) {
      erros.push(
        'Ajustar o total muda a quantidade da peça. Diga o motivo: sem ele, '
        + 'o ajuste é indistinguível de erro de digitação.',
      );
    }
  }

  return [...new Set(erros)];
}
