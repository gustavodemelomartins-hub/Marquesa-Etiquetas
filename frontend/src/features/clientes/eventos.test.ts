import { describe, it, expect } from 'vitest';
import { montarLinhaDoTempo } from './eventos';
import type { CreditoCliente, PerfilCliente } from './tipos';

/* Um perfil mínimo, no formato REAL de `analytics.js › perfilCliente`. Só
   os campos que a linha do tempo lê precisam ser verdadeiros; o resto é
   preenchido para o tipo fechar. */
function perfil(parcial: Partial<PerfilCliente>): PerfilCliente {
  return {
    ok: true,
    cadastro: null,
    clienteId: 7,
    norm: 'vitoria',
    homonimos: 1,
    nomeAmbiguo: false,
    aviso: null,
    nomeExibicao: 'Vitória',
    resumo: {
      comprou: 0, pago: 0, emAberto: 0, faturamento: 0, pecas: 0, vendas: 0,
      ticketMedio: null, ticketMedioRecebido: null, gastoMedioPorPeca: null,
      regraFinanceira: '', primeiraCompra: null, ultimaCompra: null,
      estado: 'ativa', diasSemComprar: 0, frequenciaDias: null,
      itensLancados: 0, vendasSistema: 0,
    },
    canalPreferido: null,
    categoriasPreferidas: [],
    produtosPreferidos: [],
    contextos: [],
    vendas: [],
    totalItens: 0,
    correcoes: [],
    garantias: [],
    garantiasPendentes: [],
    ...parcial,
  };
}

const venda = (p: Partial<PerfilCliente['vendas'][number]>) => ({
  fonte: 'operacional' as const,
  id: 1, data: '2026-09-10', pecas: 2, valor: 300, valorRecebido: 0, valorReceber: 300,
  status: null, cobrancaStatus: null, vencimentoEm: null, pagaEm: null,
  canal: 'balcao', contexto: null, observacao: null, itens: [],
  ...p,
});

describe('a linha do tempo da relação', () => {
  /** §30, que é a razão de a ficha existir assim: vender e receber são
   *  dois fatos, em dois dias, e a tela não pode fundi-los. */
  it('uma venda paga depois vira DOIS eventos, cada um na sua data', () => {
    const eventos = montarLinhaDoTempo(
      perfil({ vendas: [venda({ pagaEm: '2026-09-12', valorRecebido: 300, valorReceber: 0 })] }),
      null,
    );
    expect(eventos.map((e) => [e.tipo, e.data])).toEqual([
      ['pagamento', '2026-09-12'],
      ['compra', '2026-09-10'],
    ]);
  });

  it('venda sem data de pagamento não inventa um evento de pagamento', () => {
    const eventos = montarLinhaDoTempo(
      /* Recebido sem `pagaEm` existe no histórico antigo: o valor entrou,
         mas ninguém sabe QUANDO. Carimbar a data da venda seria mentir. */
      perfil({ vendas: [venda({ valorRecebido: 300, valorReceber: 0 })] }),
      null,
    );
    expect(eventos.map((e) => e.tipo)).toEqual(['compra']);
  });

  it('garantia com troca e encerramento rende as três linhas, nas três datas', () => {
    const eventos = montarLinhaDoTempo(perfil({
      garantias: [{
        id: 5, status: 'encerrada', statusRotulo: 'Encerrada', pendente: false,
        vendaId: 1, sku: 'C1', variacao: null, produtoNome: 'Colar Lua',
        dataVenda: '2026-09-10', dataEntrada: '2026-09-20', motivo: 'fecho quebrado',
        observacao: null, encerradaEm: '2026-09-28',
        troca: {
          id: 2, data: '2026-09-26', skuNovo: 'C2', produtoNovoNome: 'Colar Sol',
          valorOriginal: 150, valorNovo: 120, diferenca: -30,
          diferencaStatus: 'credito', creditoAoCliente: 30,
        },
      }],
    }), null);
    expect(eventos.map((e) => [e.tipo, e.data])).toEqual([
      ['garantia-encerrada', '2026-09-28'],
      ['troca', '2026-09-26'],
      ['garantia-aberta', '2026-09-20'],
    ]);
  });

  it('o extrato de crédito entra na mesma linha do tempo, com a origem preservada', () => {
    const credito = {
      extrato: [{
        id: 9, tipo: 'credito', valorCentavos: 3000, origem: 'garantia_troca',
        origemId: 2, vendaId: null, motivo: 'troca por peça mais barata',
        criadoEm: '2026-09-26 12:00:00',
      }],
    } as unknown as CreditoCliente;

    const [evento] = montarLinhaDoTempo(perfil({}), credito);
    expect(evento?.origem).toBe('credito');
    expect(evento?.origemId).toBe(9);
    expect(evento?.data).toBe('2026-09-26');
    expect(evento?.valor).toBe(30);
  });

  it('a ordem é estável: duas montagens da mesma ficha dão a mesma lista', () => {
    const p = perfil({
      vendas: [
        venda({ id: 2, data: '2026-09-10' }),
        venda({ id: 1, data: '2026-09-10' }),
      ],
    });
    const a = montarLinhaDoTempo(p, null).map((e) => e.chave);
    const b = montarLinhaDoTempo(p, null).map((e) => e.chave);
    expect(a).toEqual(b);
    expect(a).toEqual(['venda:1:compra', 'venda:2:compra']);
  });

  it('não soma dinheiro entre origens: cada evento carrega só o valor dele', () => {
    const eventos = montarLinhaDoTempo(
      perfil({ vendas: [venda({ valor: 300, valorRecebido: 120, valorReceber: 180, pagaEm: '2026-09-12' })] }),
      null,
    );
    expect(eventos.find((e) => e.tipo === 'compra')?.valor).toBe(300);
    expect(eventos.find((e) => e.tipo === 'pagamento')?.valor).toBe(120);
  });
});
