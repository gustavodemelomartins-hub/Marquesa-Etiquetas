import type { GarantiaDoPerfil } from '../clientes/tipos';

/** A garantia como o backend a projeta, com o relógio já calculado.
 *
 *  Mora aqui, e não dentro da tela, porque `api.ts`, a lista, o caso e a
 *  ficha da cliente leem a MESMA resposta — e um contrato descrito dentro
 *  de um componente é um contrato que a próxima tela vai redescrever.
 */
export interface Garantia extends GarantiaDoPerfil {
  origemFonte: string;
  vendaItemId: string | null;
  /** 5.2b — `ambiguo` e `sem_match` são as garantias que o backfill se
   *  recusou a adivinhar. A tela precisa poder dizer isso. */
  vendaItemVinculo: string | null;
  garantiaAnteriorId: number | null;
  reabertura: { deGarantiaId: number; diasUteisDesdeAEntrega: number | null } | null;
  clienteId: number | null;
  clienteNome: string | null;
  clienteNomeNorm: string | null;
  valorPagoOriginal: number | null;
  previsaoRetorno: string | null;
  prazoDiasUteis: number | null;
  diasUteisDecorridos: number | null;
  diasUteisRestantes: number | null;
  atrasado: boolean;
  atrasoDiasUteis: number;
  relogioParado: boolean;
  /** A troca, quando ela existe. `GarantiaDoPerfil` já declara uma versão
   *  mínima dela — a que a ficha da cliente mostra — e `Troca` é o
   *  SUPERCONJUNTO daquela: uma só forma, não duas.
   *
   *  `diferencaStatus` distingue crédito emitido de crédito ainda pendente. */
  troca: Troca | null;
  eventos: {
    id: number; tipo: string; data: string; statusNovo: string | null;
    statusRotulo: string | null; observacao: string | null;
  }[];
}

/** A troca, como `publica()` a projeta. Só a NÃO estornada viaja: a query
 *  filtra `estornada = 0`, então uma troca desfeita volta como `null` e o
 *  caso reaparece sem troca — que é o que ele voltou a ser. */
export interface Troca {
  id: number;
  data: string;
  skuNovo: string;
  variacaoNova: string | null;
  produtoNovoNome: string | null;
  valorOriginal: number;
  valorNovo: number;
  /** Positivo: a cliente deve. Negativo: nós devemos a ela. */
  diferenca: number;
  /** Estados atuais do servidor e `credito` legado. Nunca tratar um crédito
   *  pendente como saldo já lançado na conta da cliente. */
  diferencaStatus: 'nenhuma' | 'a_receber' | 'credito' | 'credito_emitido' | 'pendente_regra' | 'paga';
  diferencaPagaEm: string | null;
  /** Valor a favor da cliente. O lançamento efetivo depende de diferencaStatus. */
  creditoAoCliente: number;
  diferencaValorPago: number | null;
  /** §36 — o registro comercial da peça nova. `null` nas trocas anteriores
   *  à regra, e é assim que toda soma distingue as duas populações sem
   *  contar dinheiro duas vezes. */
  vendaId: number | null;
  movimentoId: number | null;
}

export const STATUS: { id: string; rotulo: string }[] = [
  { id: 'em_reparo', rotulo: 'Em reparo' },
  { id: 'reparada', rotulo: 'Reparada · aguardando entrega' },
  { id: 'sem_conserto', rotulo: 'Sem conserto · troca autorizada' },
  { id: 'devolvida', rotulo: 'Peça devolvida' },
  { id: 'concluida', rotulo: 'Concluída' },
  { id: 'cancelada', rotulo: 'Cancelada' },
];

export const PENDENTES = ['em_reparo', 'reparada', 'sem_conserto'];

/** 5.4e — de estado terminal não se sai. Se a peça voltou, o caminho é um
 *  atendimento NOVO ligado ao anterior; trocar o status do caso antigo
 *  apagaria a história. */
export const ENCERRADOS = ['devolvida', 'concluida', 'cancelada'];

export const rotuloDoStatus = (id: string) =>
  STATUS.find((s) => s.id === id)?.rotulo ?? id;
