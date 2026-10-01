// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ClientesArea } from './ClientesArea';
import type { Connection } from '../../services/client';

const conexao: Connection = { url: 'http://localhost:8787', key: 'chave-de-teste' };

/** A área agora recebe o endereço de fora — quem guarda a rota é o App, e
 *  é isso que faz recarregar a página voltar para a mesma ficha. Nos testes
 *  este casulo faz o papel do App: guarda o `sub` e o devolve. */
function Area({ inicio = 'todos' }: { inicio?: string | null }) {
  const [sub, setSub] = useState<string | null>(inicio);
  return <ClientesArea conexao={conexao} sub={sub} aoNavegar={setSub} aoNovaVenda={() => {}} />;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const LISTA = [
  { id: 7, nome: 'Vitória Prado', tel: '11988887777', cidade: 'São Paulo' },
  { id: 8, nome: 'Camila Reis', tel: '', cidade: 'Santos' },
];

/** A base de clientes (`/api/analytics/crm`), com a régua §25 já aplicada
 *  pelo servidor: o estado de cada uma vem pronto. */
const cli = (extra: Record<string, unknown>) => ({
  identificada: true, pecas: 1, faturamento: 0, ticketMedio: null, primeiraCompra: '2026-01-01',
  recorrente: false, frequenciaDias: null, diasSemComprar: 10, ...extra,
});
const BASE = {
  periodo: { de: null, ate: null, periodo: 'tudo' },
  kpis: { ativos: 4, recorrentes: 2, recorrentesPct: 50, novos: 1, ticketMedioPorVenda: 250 },
  saudeBase: { total: 4, grupos: [] },
  reativacao: [
    cli({ norm: 'sumida', nome: 'Sumida Antiga', clienteId: 9, vendas: 3, comprado: 900, estado: 'inativa', ultimaCompra: '2025-01-10', diasSemComprar: 600 }),
  ],
  todos: [
    cli({ norm: 'vitoria prado', nome: 'Vitória Prado', clienteId: 7, vendas: 2, comprado: 1000, estado: 'recorrente', ultimaCompra: '2026-09-15', frequenciaDias: 50 }),
    cli({ norm: 'elizama meira', nome: 'Elizama Meira', clienteId: 10, vendas: 1, comprado: 504, estado: 'ativa', ultimaCompra: '2026-09-19' }),
    cli({ norm: 'sumida', nome: 'Sumida Antiga', clienteId: 9, vendas: 3, comprado: 900, estado: 'inativa', ultimaCompra: '2025-01-10', diasSemComprar: 600 }),
    cli({ norm: 'sem-nome', nome: 'Cliente não identificado', identificada: false, clienteId: null, vendas: 9, comprado: 5000, estado: 'recorrente', ultimaCompra: '2026-09-01' }),
  ],
};

const PERFIL = {
  ok: true,
  cadastro: {
    id: 7, nome: 'Vitória Prado', tel: '11988887777', email: null, instagram: null,
    cidade: 'São Paulo', cpf: null, nascimento: null, obs: 'Prefere dourado.', nome_norm: 'vitoria prado',
  },
  clienteId: 7,
  norm: 'vitoria prado',
  homonimos: 1,
  nomeAmbiguo: false,
  aviso: null,
  nomeExibicao: 'Vitória Prado',
  resumo: {
    comprou: 1000, pago: 700, emAberto: 300, faturamento: 700, pecas: 5, vendas: 2,
    ticketMedio: 500, ticketMedioRecebido: 350, gastoMedioPorPeca: 200,
    regraFinanceira: 'COMPROU é o total comercial das compras dela.',
    primeiraCompra: '2026-06-01', ultimaCompra: '2026-09-10',
    estado: 'recorrente', diasSemComprar: 9, frequenciaDias: 50,
    itensLancados: 5, vendasSistema: 2,
  },
  canalPreferido: 'balcao',
  categoriasPreferidas: [{ valor: 'Colar', qtd: 3 }],
  produtosPreferidos: [],
  contextos: [],
  vendas: [
    {
      fonte: 'operacional', id: 21, data: '2026-09-10', pecas: 2, valor: 300,
      valorRecebido: 300, valorReceber: 0, status: 'paga', cobrancaStatus: null,
      vencimentoEm: null, pagaEm: '2026-09-12', canal: 'balcao', contexto: null,
      observacao: null, itens: [{ sku: 'C1', nome: 'Colar Lua', qtd: 1, preco: 150 }],
    },
    {
      fonte: 'operacional', id: 22, data: '2026-09-15', pecas: 3, valor: 700,
      valorRecebido: 400, valorReceber: 300, status: 'aberta', cobrancaStatus: 'aberta',
      vencimentoEm: '2026-10-15', pagaEm: null, canal: 'site', contexto: null,
      observacao: null, itens: [],
    },
  ],
  totalItens: 5,
  correcoes: [],
  garantias: [],
  garantiasPendentes: [],
};

const CREDITO = {
  ok: true,
  cliente: { id: 7, nome: 'Vitória Prado' },
  moeda: 'centavos',
  saldoCentavos: 3000,
  geradoCentavos: 3000, consumidoCentavos: 0, estornadoCentavos: 0, ajusteLiquidoCentavos: 0,
  saldoNegativo: false,
  extrato: [{
    id: 9, tipo: 'credito', valorCentavos: 3000, origem: 'garantia_troca',
    origemId: 2, vendaId: null, motivo: 'troca por peça mais barata',
    criadoEm: '2026-09-26 12:00:00',
  }],
  extratoCompleto: true,
  regra: 'Crédito não expira.',
};

/** Responde a cada rota com o corpo dela, e registra o que foi pedido — as
 *  URLs são parte do contrato e quebrá-las é quebrar a tela. */
function comBackend(extra: Record<string, unknown> = {}) {
  const chamadas: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (entrada: string) => {
    const url = String(entrada);
    chamadas.push(url);
    const corpo =
      url.includes('/api/clientes/perfil') ? PERFIL
      : url.includes('/api/analytics/crm') ? BASE
      : url.includes('/credito') ? CREDITO
      : url.includes('/api/clientes?') ? LISTA
      : (extra[url] ?? {});
    return new Response(JSON.stringify(corpo), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
  return chamadas;
}

describe('Clientes, ponta a ponta', () => {
  it('a lista busca no SERVIDOR, com o termo digitado', async () => {
    const chamadas = comBackend();
    render(<Area />);

    expect(await screen.findByText('Vitória Prado')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Buscar cliente/), { target: { value: 'camila' } });

    await waitFor(() => {
      expect(chamadas.some((u) => u.includes('busca=camila'))).toBe(true);
    });
  });

  it('abrir uma cliente pede o perfil por ID e mostra os TRÊS números de §38', async () => {
    const chamadas = comBackend();
    render(<Area />);

    fireEvent.click(await screen.findByText('Vitória Prado'));

    expect(await screen.findByRole('heading', { level: 1, name: 'Vitória Prado' })).toBeTruthy();
    expect(chamadas.some((u) => u.includes('/api/clientes/perfil?id=7'))).toBe(true);

    const kpis = [...document.querySelectorAll('.mq-kpi')].map((k) => k.textContent ?? '');
    expect(kpis[0]).toContain('Comprou');
    expect(kpis[0]).toContain('1.000');
    expect(kpis[1]).toContain('Pago');
    expect(kpis[1]).toContain('700');
    expect(kpis[2]).toContain('Em aberto');
    expect(kpis[2]).toContain('300');
  });

  /** A separação que a V2 existe para fazer: a data da venda e a do
   *  pagamento são colunas diferentes, com valores diferentes. */
  it('a aba Compras mostra a data da venda e a do pagamento separadas', async () => {
    comBackend();
    render(<Area />);
    fireEvent.click(await screen.findByText('Vitória Prado'));
    fireEvent.click(await screen.findByRole('button', { name: 'Compras' }));

    const linhas = [...document.querySelectorAll('.mq-table .mq-tr')].slice(1);
    const paga = linhas.find((l) => l.textContent?.includes('10/09/2026'));
    expect(paga?.textContent).toContain('pago em 12/09/2026');

    /* Recebeu 400 de 700: isso é PARCIAL, não "em aberto" — e o que falta
       aparece em número, junto com a data que manda cobrar. */
    const parcial = linhas.find((l) => l.textContent?.includes('15/09/2026'));
    expect(parcial?.textContent).toContain('parcial');
    expect(parcial?.textContent).toContain('faltam R$ 300');
    expect(parcial?.textContent).toContain('vence 15/10/2026');
  });

  /* 01/10/2026: a aba Financeiro saiu; o que falta receber é a primeira
     coisa do Resumo. E a regra financeira do servidor não vira parágrafo. */
  it('o Resumo abre com o que falta receber, compra a compra', async () => {
    comBackend();
    render(<Area />);
    fireEvent.click(await screen.findByText('Vitória Prado'));

    expect(await screen.findByText('Compra de 15/09/2026')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Falta receber' })).toBeTruthy();
    expect(screen.queryByText(/COMPROU é o total comercial/)).toBeNull();
    expect(screen.queryByText(/Três datas/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Financeiro' })).toBeNull();
  });

  it('Crédito mostra saldo e extrato, e não oferece consumir', async () => {
    comBackend();
    render(<Area />);
    fireEvent.click(await screen.findByText('Vitória Prado'));
    fireEvent.click(await screen.findByRole('button', { name: 'Crédito' }));

    expect(await screen.findByText('troca por peça mais barata · 26/09/2026')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /usar crédito/i })).toBeNull();
  });

  it('o Resumo junta compra, pagamento e crédito numa linha do tempo só', async () => {
    comBackend();
    render(<Area />);
    fireEvent.click(await screen.findByText('Vitória Prado'));
    await screen.findByText('Últimos acontecimentos');
    await waitFor(() => {
      expect(document.body.textContent).toContain('Crédito gerado');
    });

    const linhas = [...document.querySelectorAll('.mq-timeline__row')].map((r) => r.textContent ?? '');
    expect(linhas.some((l) => l.includes('Crédito gerado'))).toBe(true);
    expect(linhas.some((l) => l.includes('Pagamento recebido') && l.includes('12/09/2026'))).toBe(true);
    expect(linhas.some((l) => l.includes('Compra de 2 peças') && l.includes('10/09/2026'))).toBe(true);
  });

  it('editar manda PATCH para a rota real e volta para a ficha', async () => {
    const chamadas = comBackend();
    render(<Area />);
    fireEvent.click(await screen.findByText('Vitória Prado'));
    fireEvent.click(await screen.findByRole('button', { name: 'Editar dados' }));

    const nome = screen.getByRole('dialog').querySelector('input') as HTMLInputElement;
    fireEvent.change(nome, { target: { value: 'Vitória P. Prado' } });
    expect(screen.getByText(/Trocar o nome não perde o histórico/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => {
      expect(chamadas.some((u) => u.endsWith('/api/clientes/7'))).toBe(true);
    });
  });

  it('cliente sem cadastro não finge ter crédito', async () => {
    vi.stubGlobal('fetch', vi.fn(async (entrada: string) => {
      const url = String(entrada);
      const corpo = url.includes('/api/clientes/perfil')
        ? { ...PERFIL, cadastro: null, clienteId: null }
        : url.includes('/api/clientes?') ? LISTA : {};
      return new Response(JSON.stringify(corpo), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }));
    render(<Area />);
    fireEvent.click(await screen.findByText('Vitória Prado'));
    fireEvent.click(await screen.findByRole('button', { name: 'Crédito' }));

    expect(await screen.findByText('Crédito exige cadastro')).toBeTruthy();
  });
});

describe('Clientes › Visão geral', () => {
  it('abre na Visão geral, com o Top, quem chamar de volta e as recorrentes', async () => {
    const chamadas = comBackend();
    render(<Area inicio={null} />);

    const top = await screen.findByRole('region', { name: 'Top clientes' });
    const nomes = [...top.querySelectorAll('.mq-item b:not(.mq-money)')].map((b) => b.textContent);
    /* Ordem por quanto COMPROU, pago ou não; sem nome não entra no ranking. */
    expect(nomes).toEqual(['Vitória Prado', 'Sumida Antiga', 'Elizama Meira']);
    expect(top.textContent).toContain('R$ 504,00');

    const volta = screen.getByRole('region', { name: 'Para chamar de volta' });
    expect(volta.textContent).toContain('Sumida Antiga');
    expect(volta.textContent).toContain('parada');

    const fieis = screen.getByRole('region', { name: 'Clientes recorrentes' });
    expect(fieis.textContent).toContain('Vitória Prado');
    expect(fieis.textContent).not.toContain('Cliente não identificado');

    /* A régua vem do servidor: a tela pede a base inteira e a do período. */
    expect(chamadas.some((u) => u.includes('/api/analytics/crm?periodo=tudo'))).toBe(true);
    expect(chamadas.some((u) => u.includes('/api/analytics/crm?periodo=12m'))).toBe(true);
  });

  it('Todos os clientes mostra a última compra e o total de cada uma', async () => {
    comBackend();
    render(<Area />);
    await screen.findByText('Vitória Prado');
    await waitFor(() => {
      const linha = [...document.querySelectorAll('.mq-table .mq-tr')]
        .find((l) => l.textContent?.includes('Vitória Prado'));
      expect(linha?.textContent).toContain('15/09/2026');
      expect(linha?.textContent).toContain('R$ 1.000,00');
    });
  });

  it('abrir alguém da Visão geral abre a ficha pelo cadastro', async () => {
    const chamadas = comBackend();
    render(<Area inicio={null} />);
    const top = await screen.findByRole('region', { name: 'Top clientes' });
    fireEvent.click([...top.querySelectorAll('button')].find((b) => b.textContent?.includes('Vitória Prado'))!);
    await waitFor(() => {
      expect(chamadas.some((u) => u.includes('/api/clientes/perfil?id=7'))).toBe(true);
    });
  });
});
