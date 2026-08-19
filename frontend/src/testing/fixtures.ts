/** Estados de teste. Só isso — nenhum componente do app importa daqui.
 *
 *  Os campos seguem `api/src/state.js › montarState`: quem muda o backend
 *  quebra estes testes, que é exatamente o ponto. */
import type { AppState, Product, Reseller, Suitcase } from '../types/api';

export function produto(p: Partial<Product> & { sku: string }): Product {
  return {
    desc: `Peça ${p.sku}`,
    cat: 'Colar',
    preco: 100,
    semPreco: false,
    qtd: 0,
    consignado: 0,
    disponivel: 0,
    status: 'ativo',
    visivel: null,
    ...p,
  };
}

/** Atalho para o caso comum: total em casa, nada consignado. */
export function emCasa(sku: string, qtd: number, extra: Partial<Product> = {}): Product {
  return produto({ sku, qtd, consignado: 0, disponivel: qtd, ...extra });
}

export function revendedora(r: Partial<Reseller> & { id: number; nome: string }): Reseller {
  return {
    tel: '',
    cidade: '',
    cpf: '',
    endereco: '',
    obs: '',
    status: 'ativa',
    criadaEm: '2026-01-01',
    ...r,
  };
}

export function maleta(m: Partial<Suitcase> & { id: number; revId: number }): Suitcase {
  return {
    status: 'aberta',
    abertaEm: '2026-08-01',
    acertoEm: null,
    encerradaEm: null,
    itens: {},
    precos: {},
    ...m,
  };
}

export function estadoDeTeste(over: Partial<AppState> = {}): AppState {
  return {
    v: 2,
    produtos: [],
    revendedoras: [],
    maletas: [],
    config: { prazoDias: 45, prataPct: 10, inventarioDias: 30, faixas: [] },
    loja: null,
    inventario: {},
    sync: {
      conectada: false,
      ultimaEm: null,
      ultimoStatus: null,
      pausada: null,
      erro: null,
      ultimaId: null,
      ultimaAnaliseEm: null,
    },
    categorias: [
      { nome: 'Colar', ordem: 1, cor: '#C2426B' },
      { nome: 'Brinco', ordem: 2, cor: '#C4802A' },
      { nome: 'Anel', ordem: 3, cor: '#D8646B' },
    ],
    ...over,
  };
}
