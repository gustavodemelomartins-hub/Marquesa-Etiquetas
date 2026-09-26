/** SAÍDAS SEM FATURAMENTO — a fonte ÚNICA do contrato no React.
 *
 *  §30. Duas features descreviam esta mesma resposta com formas diferentes:
 *  `features/saidas` tinha um `Saida` com `estornada: number`, e
 *  `features/financeiro` um `SaidaSemFaturamento` sem metade dos campos.
 *  Nenhuma das duas estava errada o bastante para quebrar, e é exatamente
 *  esse o problema: elas divergiriam em silêncio na primeira mudança do
 *  backend. O contrato agora mora aqui, e Financeiro reexporta daqui.
 *
 *  A forma abaixo é a de `api/src/saidas.js › publica(row)`, campo a campo.
 */

/** Os QUATRO tipos que o backend aceita (`TIPOS` em `api/src/saidas.js`).
 *  Não há um quinto, e a tela não inventa um: um tipo novo é decisão de
 *  negócio, não campo de texto. */
export type TipoDeSaida = 'brinde' | 'uso_proprio' | 'perda' | 'sorteio';

export interface OpcaoDeSaida {
  id: TipoDeSaida;
  /** O rótulo curto, para chip e coluna. */
  rotulo: string;
  /** O rótulo do backend (`ROTULO`), quando ele é mais longo que o curto. */
  rotuloLongo: string;
  explica: string;
}

export const TIPOS_DE_SAIDA: OpcaoDeSaida[] = [
  {
    id: 'brinde',
    rotulo: 'Brinde',
    rotuloLongo: 'Brinde',
    explica: 'saiu de presente, para cliente ou parceira',
  },
  {
    id: 'uso_proprio',
    rotulo: 'Uso próprio',
    rotuloLongo: 'Uso próprio',
    explica: 'ficou com a casa — foto, vitrine, uso pessoal',
  },
  {
    id: 'perda',
    rotulo: 'Perda',
    rotuloLongo: 'Diferença de inventário / Perda',
    explica: 'quebrou, sumiu, ou a contagem não achou',
  },
  {
    id: 'sorteio',
    rotulo: 'Sorteio',
    rotuloLongo: 'Sorteio',
    explica: 'saiu numa ação de divulgação',
  },
];

export function rotuloDoTipo(tipo: string): string {
  return TIPOS_DE_SAIDA.find((t) => t.id === tipo)?.rotulo ?? tipo;
}

export interface SaidaSemFaturamento {
  id: number;
  tipo: string;
  /** O rótulo que o BACKEND escolheu. A tela prefere este ao seu próprio
   *  quando ele existe — quem nomeia o fato é o dono dele. */
  tipoRotulo: string;
  /** `saida` baixa; `entrada` devolve. Só `perda` pode ser entrada — é a
   *  sobra de uma contagem, e forçá-la para baixo esconderia a sobra. */
  sentido: 'saida' | 'entrada';
  data: string;
  sku: string;
  produto: string | null;
  variacao: string | null;
  varianteId: string | null;
  qtd: number;
  motivo: string | null;
  observacao: string | null;
  movimentoId: number | null;
  /** `false` = esta linha só CLASSIFICA uma saída que já aconteceu (a linha
   *  da planilha já baixou a peça), e por isso o estorno dela não devolve
   *  nada ao estoque. A tela precisa dizer isso antes de alguém estornar. */
  estoqueRefletido: boolean;
  origemUsuario: string | null;
  inventarioId: number | null;
  estornada: boolean;
  estornoEm: string | null;
  estornoMotivo: string | null;
  origemRegistro: string;
  historicoItemId: number | null;
  criadoEm: string;
  atualizadoEm: string | null;
}

/** O resumo conta PEÇAS, não lançamentos, e desconta a entrada da saída —
 *  é por isso que ele pode ser menor que o número de linhas. */
export interface ResumoDeSaidas {
  brinde: number;
  uso_proprio: number;
  perda: number;
  sorteio: number;
  total: number;
  estornadas: number;
}

/** Linha da planilha reclassificada como não-venda que NÃO pôde virar
 *  saída (sem data, ou código fora do catálogo). Não some: vem à parte. */
export interface SaidaLegada {
  reclassificacaoId: number;
  tipo: string;
  tipoRotulo: string;
  data: string | null;
  sku: string | null;
  produto: string | null;
  qtd: number | null;
  valorPlanilha: number | null;
  pessoa: string | null;
  observacao: string | null;
  motivo: string;
  linhaPlanilha: string | number | null;
  historicoItemId: number;
  decididoEm: string | null;
  decididoPor: string | null;
  porque: string;
}

export interface Saidas {
  ok: true;
  saidas: SaidaSemFaturamento[];
  resumo: ResumoDeSaidas;
  limite?: number;
  offset?: number;
  legado?: SaidaLegada[];
}

export interface NovaSaida {
  tipo: TipoDeSaida;
  sku: string;
  qtd: number;
  data: string;
  motivo: string;
  sentido?: 'saida' | 'entrada';
  observacao?: string;
  variacao?: string | null;
  varianteId?: string | null;
}
