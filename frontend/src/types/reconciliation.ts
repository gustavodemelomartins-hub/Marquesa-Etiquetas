/** Vocabulário da reconciliação.
 *
 *  ATENÇÃO — nada disto existe no backend ainda.
 *
 *  Estes tipos descrevem o fluxo combinado
 *  ANALISAR → DIFF → CLASSIFICAR → REVISAR → APROVAR → APLICAR → VALIDAR →
 *  AUDITAR, e nesta fase servem para DUAS coisas legítimas:
 *
 *    1. dar forma à leitura que já é possível hoje — a rodada seca
 *       (`POST /api/sync {"seco": true}`) é uma análise de verdade, e as
 *       mudanças dela são um diff de verdade;
 *    2. deixar a interface pronta para quando a aprovação existir.
 *
 *  O que NÃO existe: sessão persistida, decisão gravada, aplicação do
 *  aprovado. O SCHEMA para isso já está fechado (§ "estado persistido" no
 *  fim deste arquivo, e api/migracao-reconciliacao.sql), mas nenhuma rota
 *  da API o lê nem escreve ainda. Ver docs/RECONCILIATION_ENGINE.md.
 */

/** Classificação de risco. A ordem importa: é a ordem de atenção que a
 *  tela usa para ordenar, e a que decide o que pode ser aprovado em bloco.
 *
 *  trivial       aplica sem drama (diferença de 1 para mais, campo de texto)
 *  confere       grande, mas explicável — merece o olho antes do sim
 *  perigoso      pode tirar peça do ar, ou mexe em dinheiro
 *  desconhecido  o sistema NÃO sabe o que é certo. Nunca em bloco.
 */
export type RiskLevel = 'trivial' | 'confere' | 'perigoso' | 'desconhecido';

export const RISK_ORDER: readonly RiskLevel[] = [
  'desconhecido',
  'perigoso',
  'confere',
  'trivial',
] as const;

/** De onde veio a proposta de mudança. */
export type ReconciliationSource = 'sync' | 'importacao';

/** O que está sendo mudado. */
export type ReconciliationKind =
  | 'estoque_loja' // o número que a loja publica
  | 'produto_novo' // código que ainda não existe no catálogo
  | 'ajuste_qtd' // saldo-alvo vindo de uma planilha
  | 'campo'; // descrição, categoria, preço

/** Decisão humana sobre um item nesta análise (ainda não persistida — ver
 *  o aviso no topo do arquivo). Vocabulário alinhado de propósito com a
 *  máquina de estados de `reconciliacao_itens.status` no banco
 *  (api/migracao-reconciliacao.sql): 'rejeitado', não 'recusado'. */
export type ReconciliationDecision = 'pendente' | 'aprovado' | 'rejeitado';

/** Uma linha do diff: o que está hoje, o que aconteceria, e o quanto isso
 *  merece atenção. */
export interface ReconciliationItem {
  /** Estável dentro de uma análise: `${sku}|${variacao ?? ''}|${tipo}`. */
  id: string;
  sku: string;
  /** `null` = o código inteiro; senão, o nome da variação. */
  variacao: string | null;
  descricao: string;

  origem: ReconciliationSource;
  tipo: ReconciliationKind;

  /** Valor atual. `null` quando ainda não existe (produto novo). */
  de: number | string | null;
  /** Valor proposto. */
  para: number | string | null;
  /** Só faz sentido quando os dois lados são número. */
  delta: number | null;

  risco: RiskLevel;
  /** A frase que explica POR QUE este risco — não o rótulo, a razão. */
  motivo: string;

  decisao: ReconciliationDecision;
}

/** O que uma análise encontrou, em números. */
export interface ReconciliationSummary {
  origem: ReconciliationSource;
  /** Quando a análise rodou. */
  em: string;
  total: number;
  porRisco: Record<RiskLevel, number>;
  /** Quantas mudanças tirariam um produto do ar. */
  zerando: number;
  /** Situações que a análise viu e NÃO tem como decidir sozinha. */
  pendencias: ReconciliationPending[];
}

/** Algo que precisa de uma pessoa, mas que este fluxo não resolve.
 *  Sinalizar em vez de engolir (§22) — mas sem fingir que há um botão. */
export interface ReconciliationPending {
  tipo:
    | 'duplicado' // mesmo código em dois anúncios da loja
    | 'variacao_sem_reparticao' // repartição pela metade
    | 'variacao_soma_nao_bate' // a loja discorda do nosso total
    | 'maleta' // peça consignada segura o empurrão
    | 'pedido_sem_sku' // venda no site que não virou movimento
    | 'falta_cadastrar'; // código com peça em casa e sem anúncio
  /** Quantos casos. */
  quantidade: number;
  /** Uma frase que diz o que está acontecendo. */
  descricao: string;
  /** Os códigos envolvidos, para a tela poder listar. */
  skus: string[];
}

/** Uma análise inteira: o resumo e as linhas. Sem estado persistido — hoje
 *  ela vive só enquanto a tela estiver aberta. */
export interface ReconciliationAnalysis {
  resumo: ReconciliationSummary;
  itens: ReconciliationItem[];
  /** `true` quando os dados vieram de exemplo, não do servidor. A tela é
   *  obrigada a dizer isso em voz alta. */
  simulado: boolean;
}

/* ==================================================== estado persistido
 *
 * A partir daqui: o que `reconciliacao_sessoes` e `reconciliacao_itens`
 * (api/migracao-reconciliacao.sql) vão expor quando existir uma rota. Os
 * tipos acima (`ReconciliationItem`, `ReconciliationDecision`) descrevem a
 * análise EFÊMERA de hoje; estes descrevem o REGISTRO — o schema já está
 * fechado mesmo sem rota nenhuma que o leia ou escreva ainda.
 * ======================================================================= */

/** Máquina de estados da sessão. Transições permitidas:
 *
 *  revisao   → aplicando | cancelada | superada
 *  aplicando → aplicada | aplicada_parcial | erro
 *  (as demais são terminais)
 */
export type SessionStatus =
  | 'revisao' // esperando decisão humana sobre os itens
  | 'aplicando' // o Apply está em andamento (transitório)
  | 'aplicada' // todo item aprovado foi escrito com sucesso
  | 'aplicada_parcial' // pelo menos um item aprovado ficou obsoleto ou deu erro
  | 'cancelada' // encerrada sem aplicar nada, por decisão humana
  | 'superada' // uma sessão mais nova da mesma origem nasceu antes desta ser decidida
  | 'erro'; // o Apply foi interrompido por falha catastrófica

/** Máquina de estados do item. Transições permitidas:
 *
 *  pendente → aprovado | rejeitado
 *  aprovado → aplicado | obsoleto | erro
 *  (as demais são terminais NESTA sessão)
 *
 *  `obsoleto` × `erro` é a distinção que protege peça física: `obsoleto`
 *  quer dizer que o mundo mudou desde a análise (a concorrência que a
 *  precondition A ou B pegou) — não é falha técnica, e o item nunca se
 *  reaplica sozinho, só numa sessão nova. `erro` quer dizer que as duas
 *  preconditions passaram e a ESCRITA em si falhou (rede, Nuvemshop fora
 *  do ar, D1 indisponível).
 */
export type ItemStatus =
  | 'pendente'
  | 'aprovado'
  | 'rejeitado'
  | 'aplicado'
  | 'obsoleto'
  | 'erro';

/** O que `base_json` guarda por `tipo` — o estado interno MÍNIMO que
 *  produziu `para`, não um retrato inteiro do sistema. `null` para os
 *  tipos vindos de planilha (`produto_novo`, `ajuste_qtd`, `campo`): a
 *  origem deles é o arquivo importado, congelada em `dados_json`, e nada
 *  externo pode deixá-la obsoleta sozinha — só `de` (a precondition do
 *  destino) pode divergir. */
export interface BaseEstoqueLojaSimples {
  /** `produtos.qtd` no momento da análise. */
  qtd_total: number;
  /** Soma de `maleta_itens` em maletas abertas/em_acerto. */
  consignado: number;
  /** `qtd_total - consignado` — o que a proposta usou antes do `max(0, …)`. */
  casa: number;
}
export interface BaseEstoqueLojaKit {
  /** `saldosDoSku(kit).disponivel` — o mínimo entre componentes, já calculado. */
  disponivel_kit: number;
}
export interface BaseEstoqueLojaVariacao {
  /** `SUM(movimentos.qtd) WHERE sku = X AND variacao = Y`. */
  saldo_variacao: number;
}
export type ReconciliationBase =
  | BaseEstoqueLojaSimples
  | BaseEstoqueLojaKit
  | BaseEstoqueLojaVariacao
  | null;
