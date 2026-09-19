// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ClientesArea } from './ClientesArea';
import type { Connection } from '../../services/client';

const conexao: Connection = { url: 'http://localhost:8787', key: 'chave-de-teste' };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const LISTA = [
  { id: 7, nome: 'Vitória Prado', tel: '11988887777', cidade: 'São Paulo' },
  { id: 8, nome: 'Camila Reis', tel: '', cidade: 'Santos' },
];

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
    render(<ClientesArea conexao={conexao} />);

    expect(await screen.findByText('Vitória Prado')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Buscar cliente/), { target: { value: 'camila' } });

    await waitFor(() => {
      expect(chamadas.some((u) => u.includes('busca=camila'))).toBe(true);
    });
  });

  it('abrir uma cliente pede o perfil por ID e mostra os TRÊS números de §38', async () => {
    const chamadas = comBackend();
    render(<ClientesArea conexao={conexao} />);

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
    render(<ClientesArea conexao={conexao} />);
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

  it('Financeiro lista o que falta receber, venda a venda', async () => {
    comBackend();
    render(<ClientesArea conexao={conexao} />);
    fireEvent.click(await screen.findByText('Vitória Prado'));
    fireEvent.click(await screen.findByRole('button', { name: 'Financeiro' }));

    expect(await screen.findByText('Venda de 15/09/2026')).toBeTruthy();
    expect(screen.getByText(/COMPROU é o total comercial/)).toBeTruthy();
  });

  it('Crédito mostra saldo e extrato, e não oferece consumir', async () => {
    comBackend();
    render(<ClientesArea conexao={conexao} />);
    fireEvent.click(await screen.findByText('Vitória Prado'));
    fireEvent.click(await screen.findByRole('button', { name: 'Crédito' }));

    expect(await screen.findByText('troca por peça mais barata · 26/09/2026')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /usar crédito/i })).toBeNull();
  });

  it('Atividade junta compra, pagamento e crédito numa linha do tempo só', async () => {
    comBackend();
    render(<ClientesArea conexao={conexao} />);
    fireEvent.click(await screen.findByText('Vitória Prado'));
    fireEvent.click(await screen.findByRole('button', { name: 'Atividade' }));

    const linhas = [...document.querySelectorAll('.mq-timeline__row')].map((r) => r.textContent ?? '');
    expect(linhas.some((l) => l.includes('Crédito gerado'))).toBe(true);
    expect(linhas.some((l) => l.includes('Pagamento recebido') && l.includes('12/09/2026'))).toBe(true);
    expect(linhas.some((l) => l.includes('Compra de 2 peças') && l.includes('10/09/2026'))).toBe(true);
  });

  it('editar manda PATCH para a rota real e volta para a ficha', async () => {
    const chamadas = comBackend();
    render(<ClientesArea conexao={conexao} />);
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
    render(<ClientesArea conexao={conexao} />);
    fireEvent.click(await screen.findByText('Vitória Prado'));
    fireEvent.click(await screen.findByRole('button', { name: 'Crédito' }));

    expect(await screen.findByText('Crédito exige cadastro')).toBeTruthy();
  });
});
