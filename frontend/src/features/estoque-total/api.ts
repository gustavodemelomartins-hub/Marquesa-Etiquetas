/** Chamadas ao motor de reconciliação para os fluxos de planilha. Nenhum
 *  `fetch` direto — tudo passa por `chamar()` (services/client.ts), a mesma
 *  regra do resto do app. */
import { chamar, type Connection } from '../../services/client';
import type {
  ProdutoPlanilha,
  ResultadoAplicacao,
  RespostaAplicar,
  ResumoEstoqueTotal,
  ResumoProdutosNovos,
  SessaoReconciliacao,
} from './tipos';

interface Opcoes {
  signal?: AbortSignal;
}

export function analisarEstoqueTotal(
  conexao: Connection,
  produtos: ProdutoPlanilha[],
  opcoes: Opcoes = {},
): Promise<SessaoReconciliacao<ResumoEstoqueTotal>> {
  return chamar(
    conexao,
    'POST',
    '/api/reconciliacao/planilha/estoque-total/analisar',
    { produtos },
    opcoes,
  );
}

export function analisarProdutosNovos(
  conexao: Connection,
  produtos: ProdutoPlanilha[],
  opcoes: Opcoes = {},
): Promise<SessaoReconciliacao<ResumoProdutosNovos>> {
  return chamar(
    conexao,
    'POST',
    '/api/reconciliacao/planilha/produtos-novos/analisar',
    { produtos },
    opcoes,
  );
}

export function obterSessao(
  conexao: Connection,
  sessaoId: number,
  opcoes: Opcoes = {},
): Promise<SessaoReconciliacao> {
  return chamar(conexao, 'GET', `/api/reconciliacao/${sessaoId}`, undefined, opcoes);
}

export function aprovarItem(
  conexao: Connection,
  sessaoId: number,
  itemId: number,
): Promise<{ ok: true }> {
  return chamar(conexao, 'POST', `/api/reconciliacao/${sessaoId}/itens/${itemId}/aprovar`);
}

export function rejeitarItem(
  conexao: Connection,
  sessaoId: number,
  itemId: number,
): Promise<{ ok: true }> {
  return chamar(conexao, 'POST', `/api/reconciliacao/${sessaoId}/itens/${itemId}/rejeitar`);
}

export function cancelarSessao(conexao: Connection, sessaoId: number): Promise<{ ok: true }> {
  return chamar(conexao, 'POST', `/api/reconciliacao/${sessaoId}/cancelar`);
}

export function aplicarSessao(conexao: Connection, sessaoId: number): Promise<RespostaAplicar> {
  return chamar(conexao, 'POST', `/api/reconciliacao/${sessaoId}/aplicar`);
}

export type { ResultadoAplicacao };
