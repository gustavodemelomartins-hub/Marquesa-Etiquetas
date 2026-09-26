import { chamar, type Connection } from '../../services/client';
import { buscarPainelAnalytics } from '../../domain/analytics';
import { listarSaidas } from '../saidas/api';
import type {
  Conferencia, ConferenciaCredito, ContasAReceber, LancamentosDoDia,
  PainelFinanceiro, Recorte, Saidas, VendasDoDia,
} from './tipos';

/** As rotas do Financeiro que já existem no Worker. Nenhuma inventada:
 *
 *    GET  /api/analytics/painel?periodo=&de=&ate=   `analytics.js › painel`
 *    GET  /api/contas-receber?status=               `contas-receber.js`
 *    POST /api/contas-receber/prazo                 definir vencimento
 *    POST /api/contas-receber/receber               receber, com data efetiva
 *    GET  /api/financeiro/conferir                  a razão do dinheiro
 *    GET  /api/credito/conferir                     a razão do crédito
 *    GET  /api/vendas/lancamentos?data=             o fechamento do dia
 *    GET  /api/vendas/dia?data=                     as linhas do dia
 *    GET  /api/saidas                               §30, o que saiu sem faturar
 */

/* `comRecorte` e o painel agregado moram em `domain/analytics.ts`: Vendas
   faz as MESMAS perguntas sobre o MESMO recorte, e duas montagens da mesma
   query string é a forma mais barata de as duas telas discordarem. */

export function buscarPainel(
  conexao: Connection, recorte: Recorte, sinal?: AbortSignal,
): Promise<PainelFinanceiro> {
  return buscarPainelAnalytics(conexao, recorte, sinal);
}

export function buscarAReceber(
  conexao: Connection, status: 'aberta' | 'paga', sinal?: AbortSignal,
): Promise<ContasAReceber> {
  return chamar(conexao, 'GET', `/api/contas-receber?status=${status}`, undefined, { signal: sinal });
}

export function conferirFinanceiro(conexao: Connection, sinal?: AbortSignal): Promise<Conferencia> {
  return chamar(conexao, 'GET', '/api/financeiro/conferir', undefined, { signal: sinal });
}

export function conferirCredito(conexao: Connection, sinal?: AbortSignal): Promise<ConferenciaCredito> {
  return chamar(conexao, 'GET', '/api/credito/conferir', undefined, { signal: sinal });
}

export function buscarLancamentos(
  conexao: Connection, data: string, sinal?: AbortSignal,
): Promise<LancamentosDoDia> {
  return chamar(conexao, 'GET', `/api/vendas/lancamentos?data=${data}`, undefined, { signal: sinal });
}

export function buscarVendasDoDia(
  conexao: Connection, data: string, sinal?: AbortSignal,
): Promise<VendasDoDia> {
  return chamar(conexao, 'GET', `/api/vendas/dia?data=${data}`, undefined, { signal: sinal });
}

/** §30. O adaptador canônico mora em `features/saidas/api.ts` — Financeiro
 *  só reexporta o recorte que ele usa. */
export function buscarSaidas(conexao: Connection, sinal?: AbortSignal): Promise<Saidas> {
  return listarSaidas(conexao, { limite: 200 }, sinal);
}

/** Marcar a conta como recebida.
 *
 *  `pagaEm` é a DATA EFETIVA do pagamento, e é o ponto inteiro de §30: sem
 *  ela o backend carimba hoje, e quem vendeu em 10/09, recebeu em 12/09 e
 *  lançou em 16/09 vê o dinheiro entrar no faturamento do dia 16.
 *
 *  `versaoEsperada` é a trava de corrida: duas pessoas na mesma conta, a
 *  segunda é recusada em vez de sobrescrever a primeira.
 *
 *  Não existe recebimento PARCIAL por aqui. O backend quita a conta inteira
 *  — `quitarVenda`/`marcarContaPaga` — e um recebimento em partes é a
 *  decisão D2, que continua fechada. A tela diz isso em vez de fingir. */
export function receberConta(
  conexao: Connection,
  { chave, pagaEm, versaoEsperada }: { chave: string; pagaEm: string; versaoEsperada: number },
): Promise<{ ok?: boolean; erro?: string; jaEstavaPaga?: boolean; versao?: number }> {
  return chamar(conexao, 'POST', '/api/contas-receber/receber', {
    chave, confirmar: true, pagaEm, versaoEsperada,
  });
}

export function definirPrazo(
  conexao: Connection,
  { chave, vencimentoEm, versaoEsperada }:
  { chave: string; vencimentoEm: string | null; versaoEsperada: number },
): Promise<{ ok?: boolean; erro?: string; versao?: number }> {
  return chamar(conexao, 'POST', '/api/contas-receber/prazo', {
    chave, vencimentoEm, versaoEsperada,
  });
}

/** "Corrigir lançamento": o recebimento registrado aqui estava errado.
 *
 *  O backend não apaga nada: a cobrança histórica ganha uma versão nova, de
 *  volta a aberta, e a paga fica como substituída; a venda leva a nota com o
 *  motivo e a data que estava lançada. O recebimento certo entra depois pela
 *  porta de sempre. `motivo` é obrigatório no servidor. */
export function estornarRecebimento(
  conexao: Connection,
  { chave, motivo, versaoEsperada }: { chave: string; motivo: string; versaoEsperada: number },
): Promise<{ ok?: boolean; erro?: string; versao?: number; trilha?: string }> {
  return chamar(conexao, 'POST', '/api/contas-receber/estornar', {
    chave, motivo, versaoEsperada,
  });
}

/** Desfazer o pagamento de uma venda, com motivo.
 *
 *  Existe porque marcar pago errado acontece, e a alternativa — cancelar a
 *  venda — apagaria um fato que aconteceu. §36: quando a venda representa a
 *  diferença de uma troca, desfazer REABRE a diferença, e as duas tabelas
 *  voltam juntas. */
export function desfazerPagamento(
  conexao: Connection, vendaId: number, motivo: string,
): Promise<{ ok?: boolean; erro?: string }> {
  return chamar(conexao, 'POST', `/api/vendas/${vendaId}/pagamento`, {
    pago: false, observacao: motivo,
  });
}
