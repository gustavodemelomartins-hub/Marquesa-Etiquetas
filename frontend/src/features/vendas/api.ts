import { chamar, type Connection } from '../../services/client';
import type { ItemDaLista, ListaDeVendas, RespostaDaVenda, VendaAgrupada } from './tipos';

/** As rotas de Vendas que já existem:
 *
 *    GET  /api/vendas/lista?de=&ate=&busca=&canal=&origem=&canceladas=
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

/** As linhas de `/api/vendas/lista` são ITENS. Agrupá-las pela referência
 *  reconstrói a venda — e isso é agregação factual: mesma referência é,
 *  por construção do backend, a mesma venda. Nada é somado entre vendas, e
 *  o que o backend declarou indeterminado continua indeterminado. */
export function agrupar(itens: ItemDaLista[]): VendaAgrupada[] {
  const mapa = new Map<string, VendaAgrupada>();
  for (const i of itens) {
    const chave = `${i.fonte}:${i.referencia}`;
    let v = mapa.get(chave);
    if (!v) {
      v = {
        chave,
        fonte: i.fonte,
        id: i.venda_id,
        referencia: i.referencia,
        data: i.data,
        cliente: i.cliente,
        clienteNorm: i.cliente_norm,
        canal: i.canal,
        pago: i.pago === 1,
        cancelada: i.cancelada === 1,
        pecas: 0,
        /* O valor da VENDA vem do backend uma vez, na linha; somar os itens
           daria outro número quando houver desconto de cabeçalho. */
        valor: Number(i.venda_valor ?? 0),
        recebido: i.financeiro?.valorRecebido ?? null,
        aReceber: i.financeiro?.valorAReceber ?? null,
        indeterminado: i.financeiro?.indeterminado ?? [],
        itens: [],
      };
      mapa.set(chave, v);
    }
    v.pecas += Number(i.qtd ?? 0);
    v.itens.push(i);
  }
  return [...mapa.values()].sort((a, b) => (a.data === b.data
    ? b.referencia.localeCompare(a.referencia)
    : (a.data < b.data ? 1 : -1)));
}
