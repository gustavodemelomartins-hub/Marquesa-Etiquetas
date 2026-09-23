import type { SaidaSemFaturamento } from './tipos';
import { TIPOS_DE_SAIDA } from './tipos';

/** AS CONTAS DA ANÁLISE DE SAÍDAS — e a que o sistema se recusa a fazer.
 *
 *  O protótipo desenha quatro cartões de CUSTO: custo líquido, custo
 *  estornado, custo das saídas e custo por peça. Nenhum deles existe.
 *
 *  Não há coluna de custo em `produtos` nem em `saidas_sem_faturamento`, e
 *  nenhuma rota devolve uma. O que existe é `produtos.preco` — o preço de
 *  VENDA cadastrado, que é um fato do catálogo e não o que a peça custou
 *  para a Marquesa. Somar preço de venda e chamar de custo inverteria o
 *  sinal da margem: uma peça dada de brinde apareceria "custando" o valor
 *  que ela teria rendido.
 *
 *  Então estas funções contam PEÇAS, que são reais, e devolvem o custo
 *  como `null` — "não informado" —, com o número de registros sem custo à
 *  vista. É o que a tela mostra: a forma do protótipo, e a recusa dita.
 */

export interface LinhaPorMotivo {
  tipo: string;
  rotulo: string;
  /** Peças que saíram por este motivo, já descontadas as entradas. */
  pecas: number;
  /** Quantos lançamentos, o que não é a mesma coisa que peças. */
  lancamentos: number;
  /** `null` enquanto não existir custo no sistema. Nunca 0: zero diria
   *  que a saída não custou nada. */
  custo: number | null;
}

export interface ResumoDaAnalise {
  /** Peças efetivamente retiradas: saídas menos entradas, sem as
   *  estornadas — elas voltaram para o estoque. */
  pecasRetiradas: number;
  /** Peças que voltaram por estorno. */
  pecasEstornadas: number;
  lancamentos: number;
  /** Quantos registros não têm custo. Hoje: todos. */
  semCusto: number;
  /** `null` enquanto não houver custo em registro nenhum. */
  custoLiquido: number | null;
  custoEstornado: number | null;
  custoDasSaidas: number | null;
  custoPorPeca: number | null;
  porMotivo: LinhaPorMotivo[];
  /** O motivo com mais PEÇAS no período. `null` sem saída nenhuma. */
  maiorMotivo: LinhaPorMotivo | null;
}

/** O sinal da linha: `entrada` devolve peça ao estoque, e só `perda` pode
 *  ser entrada (é a sobra de uma contagem). Somar as duas como se fossem a
 *  mesma coisa esconderia a sobra. */
const pecasDe = (s: SaidaSemFaturamento) => (s.sentido === 'entrada' ? -s.qtd : s.qtd);

export function resumirSaidas(saidas: SaidaSemFaturamento[]): ResumoDaAnalise {
  const vivas = saidas.filter((s) => !s.estornada);
  const estornadas = saidas.filter((s) => s.estornada);

  const porMotivo: LinhaPorMotivo[] = TIPOS_DE_SAIDA.map((t) => {
    const minhas = vivas.filter((s) => s.tipo === t.id);
    return {
      tipo: t.id,
      rotulo: t.rotulo,
      pecas: minhas.reduce((n, s) => n + pecasDe(s), 0),
      lancamentos: minhas.length,
      custo: null,
    };
  });

  const pecasRetiradas = vivas.reduce((n, s) => n + pecasDe(s), 0);

  /* O maior motivo é o de mais PEÇAS, e só existe se alguma peça saiu.
     Com tudo zerado não há "maior" — e escolher um daria destaque a uma
     linha vazia. */
  const comPecas = porMotivo.filter((m) => m.pecas > 0);
  const maiorMotivo = comPecas.length
    ? comPecas.reduce((a, b) => (b.pecas > a.pecas ? b : a))
    : null;

  return {
    pecasRetiradas,
    pecasEstornadas: estornadas.reduce((n, s) => n + pecasDe(s), 0),
    lancamentos: vivas.length,
    /* TODOS os registros estão sem custo, porque o campo não existe. O
       número é dito na tela em vez de virar um zero silencioso. */
    semCusto: saidas.length,
    custoLiquido: null,
    custoEstornado: null,
    custoDasSaidas: null,
    custoPorPeca: null,
    porMotivo,
    maiorMotivo,
  };
}

/** O recorte de datas que `GET /api/saidas` aceita, a partir dos atalhos
 *  do protótipo. `null` em `de` significa "tudo", e o backend não recebe
 *  o parâmetro. */
export function intervaloDoAtalho(
  atalho: 'tudo' | '30d' | '7d', hoje: Date = new Date(),
): { de: string | null; ate: string | null } {
  if (atalho === 'tudo') return { de: null, ate: null };
  const dias = atalho === '7d' ? 7 : 30;
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - dias);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { de: iso(inicio), ate: iso(hoje) };
}
