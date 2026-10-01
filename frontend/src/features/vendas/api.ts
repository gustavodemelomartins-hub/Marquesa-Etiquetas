import { chamar, type Connection } from '../../services/client';
import type {
  ListaDeVendas, ListaDeVendasFeitas, RespostaDaVenda, VendaFeita, VendaFeitaApi,
} from './tipos';

/** As rotas de Vendas que já existem:
 *
 *    GET  /api/vendas/feitas?de=&ate=&busca=&canceladas=&limite=&offset=
 *                                          uma linha = uma VENDA, peças dentro
 *    GET  /api/vendas/lista?de=&ate=&busca=&canal=&origem=&canceladas=
 *                                          item a item (auditoria, garantia)
 *    POST /api/vendas                      registrar
 *    POST /api/vendas/:id/pagamento        §29/§30, com a data efetiva
 *    POST /api/vendas/:id/cancelar         devolve a peça ao estoque
 */

export function listarVendas(
  conexao: Connection,
  filtro: { de?: string; ate?: string; busca?: string; incluirCanceladas?: boolean },
  sinal?: AbortSignal,
): Promise<ListaDeVendas> {
  const q = new URLSearchParams({ limite: '400' });
  if (filtro.de) q.set('de', filtro.de);
  if (filtro.ate) q.set('ate', filtro.ate);
  if (filtro.busca?.trim()) q.set('busca', filtro.busca.trim());
  if (filtro.incluirCanceladas === false) q.set('canceladas', 'nao');
  return chamar(conexao, 'GET', `/api/vendas/lista?${q}`, undefined, { signal: sinal });
}

export function registrarVenda(
  conexao: Connection, corpo: unknown,
): Promise<RespostaDaVenda> {
  return chamar(conexao, 'POST', '/api/vendas', corpo);
}

/** §29 — o dinheiro entrou. Registra a data DO PAGAMENTO e não toca na data
 *  da venda; não mexe em estoque, porque a peça já saiu quando a venda foi
 *  registrada. */
export function pagarVenda(
  conexao: Connection, id: number, dataPagamento: string,
): Promise<RespostaDaVenda> {
  return chamar(conexao, 'POST', `/api/vendas/${id}/pagamento`, { pago: true, dataPagamento });
}

export function cancelarVenda(conexao: Connection, id: number): Promise<RespostaDaVenda> {
  return chamar(conexao, 'POST', `/api/vendas/${id}/cancelar`, {});
}

/** "Vendas feitas": a página é de VENDAS, e cada uma vem com todas as peças.
 *
 *  Até 01/10/2026 esta tela lia `/api/vendas/lista` (item a item) e agrupava
 *  pela `referencia` — que, nas vendas da planilha, é o Nº da LINHA. Uma
 *  compra de 5 peças por R$ 504,00 aparecia como 5 vendas de R$ 504,00. Quem
 *  sabe o que é uma venda é o servidor; a tela só mostra. */
export function listarVendasFeitas(
  conexao: Connection,
  filtro: { busca?: string; incluirCanceladas?: boolean; limite?: number; offset?: number },
  sinal?: AbortSignal,
): Promise<ListaDeVendasFeitas> {
  const q = new URLSearchParams({
    limite: String(filtro.limite ?? 50), offset: String(filtro.offset ?? 0),
  });
  if (filtro.busca?.trim()) q.set('busca', filtro.busca.trim());
  if (filtro.incluirCanceladas === false) q.set('canceladas', 'nao');
  return chamar(conexao, 'GET', `/api/vendas/feitas?${q}`, undefined, { signal: sinal });
}

/* `financeiro` vem em CENTAVOS INTEIROS (contrato API-VEN-015); o resto da
   tela trabalha em reais. Até 29/09/2026 os dois eram lidos do mesmo jeito,
   e uma venda de R$ 504,00 aparecia "a receber R$ 50.400,00". */
const deCentavos = (v: number | null | undefined): number | null =>
  (v == null || Number.isNaN(Number(v)) ? null : Number(v) / 100);

/** A venda como a tela mostra. Nada é somado aqui: valor, recebido e saldo
 *  são os da venda, e o que o servidor não sabe continua `null`. */
export function paraTela(v: VendaFeitaApi): VendaFeita {
  const f = v.financeiro;
  const situacao: VendaFeita['situacao'] = v.cancelada ? 'cancelada'
    : f.statusPagamento === 'paga' ? 'paga'
      : f.statusPagamento === 'parcial' ? 'parcial'
        : f.statusPagamento === 'nao_paga' ? 'a_receber'
          : 'sem_informacao';
  return {
    chave: v.chave,
    fonte: v.fonte,
    id: v.id,
    data: v.data,
    cliente: v.cliente,
    clienteNorm: v.clienteNorm,
    canal: v.canal,
    cancelada: v.cancelada,
    emAReceber: v.emAReceber ?? false,
    pecas: v.pecas,
    valor: deCentavos(f.valorVenda),
    recebido: deCentavos(f.valorRecebido),
    aReceber: deCentavos(f.valorAReceber),
    situacao,
    itens: v.itens,
  };
}
