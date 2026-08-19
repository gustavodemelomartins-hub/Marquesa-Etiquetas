/** Contratos da sessão de reconciliação por planilha — derivados do código
 *  REAL do backend, não de suposição:
 *
 *    origem/resumo/itens   api/src/reconciliacao.js › detalheSessao
 *    resumo Estoque Total  api/src/reconciliacao.js › analisarPlanilhaEstoqueTotal
 *    resumo Produtos Novos api/src/reconciliacao.js › analisarPlanilhaProdutosNovos
 *    resultado do Apply    api/src/reconciliacao.js › aplicarSessao
 *
 *  Deliberadamente SEPARADO de `../../types/reconciliation.ts`: aqueles
 *  tipos descrevem a análise cliente-only do fluxo Nuvemshop (sem sessão
 *  persistida, sem decisão, sem Apply — ver o aviso no topo daquele
 *  arquivo) e ainda usam `ReconciliationSource = 'sync'|'importacao'`, os
 *  valores ANTIGOS de `origem`. Este módulo fala com sessão de verdade,
 *  com os três valores reais de origem. Não editar `reconciliation.ts`
 *  para "unificar" — são dois modelos diferentes por enquanto (ver
 *  docs/RECONCILIATION_ENGINE.md).
 */
import type { RiskLevel } from '../../types/reconciliation';

export type ModoPlanilha = 'estoque-total' | 'produtos-novos';

export type OrigemSessao = 'nuvemshop' | 'planilha_estoque_total' | 'planilha_produtos_novos';

export type StatusSessao =
  | 'revisao'
  | 'aplicando'
  | 'aplicada'
  | 'aplicada_parcial'
  | 'cancelada'
  | 'superada'
  | 'erro';

export type StatusItem = 'pendente' | 'aprovado' | 'rejeitado' | 'aplicado' | 'obsoleto' | 'erro';

export type TipoItem = 'estoque_loja' | 'ajuste_qtd' | 'produto_novo' | 'campo';

/** `dados_json` de um item `ajuste_qtd` em conflito de consignação. Ausente
 *  quando o item é uma alteração normal. */
export interface DadosAjusteQtd {
  conflito?: 'total_menor_que_consignado';
  consignadoNaAnalise?: number;
}

/** `dados_json` de um item `produto_novo`. */
export interface DadosProdutoNovo {
  desc: string;
  cat: string;
  preco: number | null;
  qtdInicial: number;
}

export interface ItemSessao {
  id: number;
  sku: string;
  variacao: string | null;
  descricao: string | null;
  tipo: TipoItem;
  de: string | null;
  para: string | null;
  risco: RiskLevel;
  motivo: string | null;
  status: StatusItem;
  erro: string | null;
  dados: DadosAjusteQtd | DadosProdutoNovo | Record<string, unknown> | null;
}

export interface ResumoEstoqueTotal {
  total: number;
  porRisco: Record<RiskLevel, number>;
  linhasLidas: number;
  linhasInvalidas: number;
  semAlteracao: number;
  seraoAlterados: number;
  novos: number;
  conflitos: number;
  criticos: number;
  naoEncontrados: string[];
  ausentesDaPlanilha: string[];
}

export interface ResumoProdutosNovos {
  total: number;
  porRisco: Record<RiskLevel, number>;
  linhasLidas: number;
  invalidos: number;
  ignorados: number;
  novos: number;
  precisamRevisao: number;
}

export interface SessaoReconciliacao<TResumo = ResumoEstoqueTotal | ResumoProdutosNovos> {
  id: number;
  origem: OrigemSessao;
  status: StatusSessao;
  criadaEm: string;
  decididaEm: string | null;
  aplicadaEm: string | null;
  resumo: TResumo | null;
  relato: ResultadoAplicacao | null;
  erro: string | null;
  itens: ItemSessao[];
}

export interface ResultadoAplicacao {
  total: number;
  aplicados: number;
  obsoletos: number;
  erros: number;
  itens: Array<{
    id: number;
    sku: string;
    variacao: string | null;
    tipo: TipoItem;
    resultado: 'aplicado' | 'obsoleto' | 'erro';
    motivo?: string;
  }>;
}

/** Resposta direta de `POST /:id/aplicar` — tem os mesmos campos de
 *  `ResultadoAplicacao` espalhados no corpo, mais `sessao`/`status`, em vez
 *  de aninhados em `relato` (esse aninhamento só existe depois, quando a
 *  sessão é relida por `detalheSessao`). */
export interface RespostaAplicar extends ResultadoAplicacao {
  sessao: number;
  status: StatusSessao;
  /** `true` quando ainda sobra item aprovado não decidido nesta chamada —
   *  outra execução concorrente está com ele, ou a chamada morreu no meio.
   *  A sessão continua 'aplicando'; chamar `aplicar` de novo retoma. */
  parcial?: boolean;
}

/** Payload de entrada dos dois endpoints de análise — o MESMO formato que
 *  `POST /api/produtos/importar` sempre aceitou (não é um contrato novo). */
export interface ProdutoPlanilha {
  sku: string;
  desc?: string;
  cat?: string;
  preco?: number | null;
  qtd?: number;
}
