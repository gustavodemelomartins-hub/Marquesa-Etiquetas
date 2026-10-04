import { chamar, type Connection } from '../../services/client';
import type {
  ClienteLista, CreditoCliente, DadosCadastro, PerfilCliente,
  BaseDeClientes, DependenciasCliente, SugestaoDeFoto,
} from './tipos';

/** As cinco rotas de Clientes que já existem no Worker. Nenhuma inventada:
 *
 *    GET    /api/clientes?busca=&limite=     `clientes.js › buscarClientes`
 *    POST   /api/clientes                    `clientes.js › criarCliente`
 *    PATCH  /api/clientes/:id                `clientes.js › atualizarCliente`
 *    GET    /api/clientes/perfil?id=|norm=   `analytics.js › perfilCliente`
 *    GET    /api/clientes/:id/credito        `credito.js › saldoDeCredito`
 */

export function listarClientes(
  conexao: Connection, busca: string, sinal?: AbortSignal, arquivadas = false,
): Promise<ClienteLista[]> {
  /* Sem busca, a lista INTEIRA: ela é a agenda da casa, e cortar em 100
     escondia todo mundo depois da letra B. Com busca, 100 bastam. */
  const q = new URLSearchParams({ limite: busca.trim() ? '100' : '2000' });
  if (busca.trim()) q.set('busca', busca.trim());
  if (arquivadas) q.set('arquivadas', 'sim');
  return chamar<ClienteLista[]>(conexao, 'GET', `/api/clientes?${q}`, undefined, { signal: sinal });
}

/** A ficha. Abre por id quando existe cadastro e por `norm` quando a
 *  cliente só aparece no histórico da planilha — os dois caminhos são do
 *  backend, e o segundo é o que impede a ficha de quem nunca foi cadastrada
 *  de aparecer vazia. */
export function buscarPerfil(
  conexao: Connection, chave: { id: number } | { norm: string }, sinal?: AbortSignal,
): Promise<PerfilCliente> {
  const q = 'id' in chave ? `id=${chave.id}` : `norm=${encodeURIComponent(chave.norm)}`;
  return chamar<PerfilCliente>(conexao, 'GET', `/api/clientes/perfil?${q}`, undefined, { signal: sinal });
}

/** Saldo e extrato. Só LEITURA: consumir crédito como meio de pagamento é
 *  decisão que o backend deliberadamente não toma sozinho (§11, trava 3), e
 *  esta tela não a toma por ele. */
export function buscarCredito(
  conexao: Connection, clienteId: number, sinal?: AbortSignal,
): Promise<CreditoCliente> {
  return chamar<CreditoCliente>(
    conexao, 'GET', `/api/clientes/${clienteId}/credito`, undefined, { signal: sinal },
  );
}

/** Só os campos preenchidos sobem. O backend recusa `PATCH` sem nada para
 *  atualizar, e mandar string vazia em tudo apagaria o que já estava lá. */
function limpar(dados: Partial<DadosCadastro>): Record<string, string> {
  const corpo: Record<string, string> = {};
  for (const [k, v] of Object.entries(dados)) {
    if (typeof v === 'string' && v.trim()) corpo[k] = v.trim();
  }
  return corpo;
}

export function criarCliente(
  conexao: Connection, dados: Partial<DadosCadastro>,
): Promise<{ id: number; nome: string; tel: string }> {
  return chamar(conexao, 'POST', '/api/clientes', limpar(dados));
}

/** Na edição, campo esvaziado É uma intenção — apagar o que estava lá —, e
 *  o backend traduz string vazia em NULL. Por isso aqui vai tudo o que foi
 *  tocado, inclusive o que ficou em branco. */
export function atualizarCliente(
  conexao: Connection, id: number, dados: Partial<DadosCadastro>,
): Promise<unknown> {
  return chamar(conexao, 'PATCH', `/api/clientes/${id}`, dados);
}

/** A base de clientes medida em VENDAS, com o estado de cada uma pela régua
 *  do sistema (§25). `periodo`: `90d` | `12m` | `tudo`. */
export function buscarBase(
  conexao: Connection, periodo: string, sinal?: AbortSignal,
): Promise<BaseDeClientes> {
  return chamar<BaseDeClientes>(
    conexao, 'GET', `/api/analytics/crm?periodo=${encodeURIComponent(periodo)}`, undefined, { signal: sinal },
  );
}

/** O que impede excluir o cadastro (§28). Vazio = pode excluir. */
export function buscarDependencias(
  conexao: Connection, id: number, sinal?: AbortSignal,
): Promise<DependenciasCliente> {
  return chamar<DependenciasCliente>(conexao, 'GET', `/api/clientes/${id}/dependencias`, undefined, { signal: sinal });
}

/** Só cadastro sem histórico; com histórico o backend devolve 409. */
export function excluirCliente(conexao: Connection, id: number): Promise<unknown> {
  return chamar(conexao, 'DELETE', `/api/clientes/${id}`);
}

export function arquivarCliente(conexao: Connection, id: number, motivo?: string): Promise<unknown> {
  return chamar(conexao, 'POST', `/api/clientes/${id}/arquivar`, motivo ? { motivo } : {});
}

export function reativarCliente(conexao: Connection, id: number): Promise<unknown> {
  return chamar(conexao, 'POST', `/api/clientes/${id}/reativar`, {});
}

/** Foto da cliente (avatar do Instagram público) — `api/src/cliente-avatar.js`.
 *  Nada confirma sozinho: estas três são as únicas portas. */
export function sugestaoDeFoto(conexao: Connection, id: number, depoisDe?: number): Promise<SugestaoDeFoto> {
  return chamar<SugestaoDeFoto>(conexao, 'GET',
    `/api/clientes/${id}/avatar/sugestao${depoisDe ? `?depoisDe=${depoisDe}` : ''}`);
}

export function decidirFoto(
  conexao: Connection, id: number, candidatoId: number, acao: 'confirmar' | 'recusar',
): Promise<unknown> {
  return chamar(conexao, 'POST', `/api/clientes/${id}/avatar/decidir`, { candidatoId, acao });
}

export function removerFoto(conexao: Connection, id: number): Promise<unknown> {
  return chamar(conexao, 'DELETE', `/api/clientes/${id}/avatar`);
}
