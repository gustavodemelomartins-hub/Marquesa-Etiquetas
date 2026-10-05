// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { CasosDeReparoProvider, useCasosDeReparo } from './CasosDeReparo';
import { acoesDoCaso, mostraTroca, produtoDaGarantia, rotuloDoEvento } from './reparo';
import { HomeArea } from '../home/HomeArea';
import { ClientesArea } from '../clientes/ClientesArea';
import type { Connection } from '../../services/client';
import type { ProdutoDoEstado } from '../vendas/tipos';

const conexao: Connection = { url: 'http://localhost:8787', key: 'chave-de-teste' };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const prod = (sku: string, extra: Partial<ProdutoDoEstado> = {}) => ({
  sku, desc: `Peça ${sku}`, cat: 'Colar', preco: 100, semPreco: false, qtd: 1, consignado: 0,
  disponivel: 1, status: 'ativo', fotoStatus: null, ...extra,
}) as ProdutoDoEstado;

const COM_FOTO = prod('222759', { fotoGaleriaUrl: 'http://localhost:8787/api/galeria/222759/f1?sig=x', fotoMiniUrl: 'http://localhost:8787/api/galeria/222759/f1-mini?sig=x' } as Partial<ProdutoDoEstado>);
const SEM_FOTO = prod('300100');

/** O caso como `GET /api/garantias/:id` devolve — com um vínculo que é
 *  identificador de banco, para provar que ele não chega à tela. */
const CASO = (extra: Record<string, unknown> = {}) => ({
  id: 15, status: 'em_reparo', statusRotulo: 'Em reparo', pendente: true, vendaId: null,
  sku: '222759', variacao: null, produtoNome: 'Berloque Separador Coração', dataVenda: null,
  dataEntrada: '2026-09-02', motivo: 'Banho', observacao: null, encerradaEm: null,
  origemFonte: 'manual', vendaItemId: null, vendaItemVinculo: 'nao_se_aplica', garantiaAnteriorId: null,
  reabertura: null, clienteId: 31, clienteNome: 'Brenda Vitachi', clienteNomeNorm: 'brenda vitachi',
  valorPagoOriginal: null, previsaoRetorno: '2026-11-04', prazoDiasUteis: 45, diasUteisDecorridos: 23,
  diasUteisRestantes: 22, atrasado: false, atrasoDiasUteis: 0, relogioParado: false, troca: null,
  eventos: [{ id: 1, tipo: 'aberta', data: '2026-09-02', statusNovo: 'em_reparo', statusRotulo: 'Em reparo', observacao: null }],
  ...extra,
});

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json' },
});

/** Um backend de mentira que responde por rota e anota o que foi pedido. */
function comBackend(rotas: (url: string, init?: RequestInit) => unknown) {
  const chamadas: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (entrada: string, init?: RequestInit) => {
    const url = String(entrada);
    chamadas.push({ url, init });
    return json(rotas(url, init) ?? {});
  }));
  return chamadas;
}

function Porta({ id }: { id: number }) {
  const casos = useCasosDeReparo();
  return <button type="button" onClick={() => casos?.abrir(id)}>abrir</button>;
}

function comCaso(caso = CASO(), produtos: ProdutoDoEstado[] = [COM_FOTO, SEM_FOTO]) {
  const chamadas = comBackend((url, init) => {
    if (url.endsWith('/status') && init?.method === 'POST') return { ok: true };
    if (url.includes('/api/garantias/15')) return caso;
    return {};
  });
  const aoAbrirCliente = vi.fn();
  render(
    <CasosDeReparoProvider conexao={conexao} produtos={produtos} aoAbrirCliente={aoAbrirCliente}>
      <Porta id={15} />
    </CasosDeReparoProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'abrir' }));
  return { chamadas, aoAbrirCliente };
}

/* ───────────────────────────────────────────────────────── regras puras */

describe('acoesDoCaso — uma principal, secundárias, uma destrutiva', () => {
  it('em reparo: a principal é "reparada"; cancelar é a destrutiva', () => {
    const a = acoesDoCaso({ status: 'em_reparo', troca: null });
    expect(a.principal?.status).toBe('reparada');
    expect(a.secundarias.map((x) => x.status)).toEqual(['sem_conserto', 'devolvida', 'concluida']);
    expect(a.destrutiva?.status).toBe('cancelada');
  });

  it('reparada: a principal é entregar (peça devolvida)', () => {
    expect(acoesDoCaso({ status: 'reparada' }).principal?.status).toBe('devolvida');
  });

  it('sem conserto e sem troca: nenhum status compete com a TROCA', () => {
    const a = acoesDoCaso({ status: 'sem_conserto', troca: null });
    expect(a.principal).toBeNull();
    expect(mostraTroca({ status: 'sem_conserto', troca: null })).toBe(true);
  });

  it('com troca registrada: some o que o servidor recusaria (voltar a reparo, cancelar)', () => {
    const a = acoesDoCaso({ status: 'sem_conserto', troca: { id: 1 } });
    expect(a.principal?.status).toBe('concluida');
    expect(a.destrutiva).toBeNull();
    expect(a.secundarias.some((x) => x.status === 'em_reparo')).toBe(false);
  });

  it('caso encerrado não oferece ação nenhuma (5.4e)', () => {
    for (const status of ['devolvida', 'concluida', 'cancelada']) {
      expect(acoesDoCaso({ status })).toEqual({ principal: null, secundarias: [], destrutiva: null });
    }
  });

  it('em reparo, o painel da troca não aparece (era um quinto botão)', () => {
    expect(mostraTroca({ status: 'em_reparo', troca: null })).toBe(false);
  });
});

describe('rotuloDoEvento e produtoDaGarantia', () => {
  it('tipo desconhecido vira "Registro", nunca o identificador cru', () => {
    expect(rotuloDoEvento({ tipo: 'algo_novo_do_banco', statusRotulo: null })).toBe('Registro');
    expect(rotuloDoEvento({ tipo: 'troca_estornada', statusRotulo: null })).toBe('Troca desfeita');
    expect(rotuloDoEvento({ tipo: 'aberta', statusRotulo: 'Em reparo' })).toBe('Caso aberto');
  });

  it('acha a peça pelo código exato, ou pela mesma peça de outra remessa', () => {
    expect(produtoDaGarantia([COM_FOTO], ' 222759 ')?.sku).toBe('222759');
    expect(produtoDaGarantia([COM_FOTO], '222759-2')?.sku).toBe('222759');
    expect(produtoDaGarantia([COM_FOTO], '999')).toBeNull();
    expect(produtoDaGarantia([], '222759')).toBeNull();
  });
});

/* ──────────────────────────────────────────────────────────── o caso */

describe('CasoDeReparo — o detalhe', () => {
  it('mostra peça, cliente, status, prazo — e nenhum identificador de banco', async () => {
    comCaso();
    const d = await screen.findByRole('dialog', { name: /Berloque Separador/ });
    expect(within(d).getByText('Caso #15')).toBeTruthy();
    expect(within(d).getByRole('button', { name: 'Brenda Vitachi' })).toBeTruthy();
    expect(within(d).getByText('04/11/2026')).toBeTruthy();
    expect(within(d).getByText('22 dias úteis')).toBeTruthy();
    const texto = d.textContent ?? '';
    expect(texto).not.toContain('nao_se_aplica');
    expect(texto).not.toMatch(/vínculo/i);
    expect(texto).not.toMatch(/\b[a-z]+_[a-z_]+\b/);   // nada de snake_case
  });

  it('peça com foto no sistema: mostra a miniatura real', async () => {
    comCaso();
    const d = await screen.findByRole('dialog', { name: /Berloque/ });
    const img = d.querySelector('.caso__peca img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toContain('/api/galeria/222759/f1-mini');
  });

  it('peça sem foto: o ícone de sempre, sem <img> e sem buscar imagem de fora', async () => {
    comCaso(CASO({ sku: '300100' }));
    const d = await screen.findByRole('dialog', { name: /Berloque/ });
    expect(d.querySelector('.caso__peca img')).toBeNull();
    expect(d.querySelector('.caso__icone')).toBeTruthy();
  });

  it('ações por importância: uma principal, cancelar como destrutiva', async () => {
    comCaso();
    const d = await screen.findByRole('dialog', { name: /Berloque/ });
    const principal = within(d).getByRole('button', { name: 'Reparada · aguardando entrega' });
    expect(principal.className).toContain('mq-btn--primary');
    expect(within(d).getAllByRole('button').filter((b) => b.className.includes('mq-btn--primary'))).toHaveLength(1);
    expect(within(d).getByRole('button', { name: 'Cancelar caso' }).className).toContain('mq-btn--danger');
  });

  it('a mudança de status passa por confirmação e manda o mesmo POST de antes', async () => {
    const { chamadas } = comCaso();
    const d = await screen.findByRole('dialog', { name: /Berloque/ });
    fireEvent.click(within(d).getByRole('button', { name: 'Reparada · aguardando entrega' }));
    fireEvent.change(within(d).getByPlaceholderText(/O que foi feito/), { target: { value: 'banho refeito' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(chamadas.some((c) => c.init?.method === 'POST')).toBe(true));
    const post = chamadas.find((c) => c.init?.method === 'POST')!;
    expect(post.url).toContain('/api/garantias/15/status');
    const corpo = JSON.parse(String(post.init?.body));
    expect(corpo.status).toBe('reparada');
    expect(corpo.observacao).toBe('banho refeito');
  });

  it('cancelar pede confirmação destrutiva antes de mandar', async () => {
    const { chamadas } = comCaso();
    const d = await screen.findByRole('dialog', { name: /Berloque/ });
    fireEvent.click(within(d).getByRole('button', { name: 'Cancelar caso' }));
    expect(within(d).getByText('Cancelar este caso?')).toBeTruthy();
    expect(chamadas.some((c) => c.init?.method === 'POST')).toBe(false);
    fireEvent.click(within(d).getByRole('button', { name: 'Voltar' }));
    expect(within(d).queryByText('Cancelar este caso?')).toBeNull();
  });

  it('caso encerrado: sem ações, com a data em que encerrou', async () => {
    comCaso(CASO({ status: 'devolvida', statusRotulo: 'Peça devolvida', pendente: false, encerradaEm: '2026-09-20' }));
    const d = await screen.findByRole('dialog', { name: /Berloque/ });
    expect(within(d).queryByRole('button', { name: /Cancelar/ })).toBeNull();
    expect(within(d).getByText(/Atendimento encerrado em 20\/09\/2026/)).toBeTruthy();
  });

  it('tocar na cliente fecha o caso e abre a ficha dela', async () => {
    const { aoAbrirCliente } = comCaso();
    const d = await screen.findByRole('dialog', { name: /Berloque/ });
    fireEvent.click(within(d).getByRole('button', { name: 'Brenda Vitachi' }));
    expect(aoAbrirCliente).toHaveBeenCalledWith({ id: 31 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

/* ─────────────────────────────────────── as portas: Início e a ficha */

const PAINEL = {
  geral: { faturamento: 0, vendas: 0, pecas: 0 },
  contasReceber: { contas: [], resumo: { total: 0, quantidade: 0, semPrazo: 0 } },
  saidasSemFaturamento: { pecas: 0 },
  pecasEmReparo: {
    total: 1, atrasadas: 0,
    itens: [{ id: 15, produtoNome: 'Berloque Separador Coração', sku: '222759', clienteNome: 'Brenda Vitachi', dataEntrada: '2026-09-02', atrasado: false, statusRotulo: 'Em reparo' }],
  },
};

const PERFIL_COM_GARANTIA = {
  ok: true, clienteId: 31, norm: 'brenda vitachi', homonimos: 1, nomeAmbiguo: false, aviso: null,
  nomeExibicao: 'Brenda Vitachi',
  cadastro: { id: 31, nome: 'Brenda Vitachi', tel: '', email: null, instagram: null, cidade: null, cpf: null, nascimento: null, obs: null, nome_norm: 'brenda vitachi' },
  resumo: {
    comprou: 0, pago: 0, emAberto: 0, faturamento: 0, pecas: 0, vendas: 0, ticketMedio: null,
    ticketMedioRecebido: null, gastoMedioPorPeca: null, regraFinanceira: '', primeiraCompra: null,
    ultimaCompra: null, estado: 'ativa', diasSemComprar: null, frequenciaDias: null, itensLancados: 0, vendasSistema: 0,
  },
  canalPreferido: null, categoriasPreferidas: [], produtosPreferidos: [], contextos: [], vendas: [],
  totalItens: 0, correcoes: [],
  garantias: [{
    id: 15, status: 'em_reparo', statusRotulo: 'Em reparo', pendente: true, vendaId: null, sku: '222759',
    variacao: null, produtoNome: 'Berloque Separador Coração', dataVenda: null, dataEntrada: '2026-09-02',
    motivo: 'Banho', observacao: null, encerradaEm: null, atrasado: false, troca: null,
  }],
  garantiasPendentes: [],
};

function rotasDasPortas(url: string) {
  if (url.includes('/api/analytics/painel')) return PAINEL;
  if (url.includes('/api/pendencias')) return { resumo: { total: 0, porTipo: {} }, itens: [] };
  if (url.includes('/api/garantias/15')) return CASO();
  if (url.includes('/api/clientes/perfil')) return PERFIL_COM_GARANTIA;
  if (url.includes('/credito')) return { ok: true, saldoCentavos: 0, extrato: [], extratoCompleto: true };
  return {};
}

function Ficha() {
  const [sub, setSub] = useState<string | null>('31');
  return <ClientesArea conexao={conexao} sub={sub} aoNavegar={setSub} aoNovaVenda={() => {}} />;
}

describe('o MESMO caso abre do Início e da ficha da cliente', () => {
  it('Início › Peças em reparo: a linha inteira abre o detalhe, com a miniatura da peça', async () => {
    const chamadas = comBackend(rotasDasPortas);
    render(
      <CasosDeReparoProvider conexao={conexao} produtos={[COM_FOTO]} aoAbrirCliente={() => {}}>
        <HomeArea conexao={conexao} aoIr={() => {}} />
      </CasosDeReparoProvider>,
    );
    const linha = await screen.findByRole('button', { name: 'Abrir o caso de Berloque Separador Coração' });
    expect(linha.querySelector('img')?.getAttribute('src')).toContain('/api/galeria/222759/f1-mini');
    fireEvent.click(linha);
    const d = await screen.findByRole('dialog', { name: /Berloque/ });
    expect(d.className).toContain('caso');
    expect(within(d).getByText('Caso #15')).toBeTruthy();
    expect(chamadas.some((c) => c.url.includes('/api/garantias/15'))).toBe(true);
  });

  it('Cliente › Garantias e trocas: a linha abre o MESMO detalhe (mesmo componente, mesmo caso)', async () => {
    const chamadas = comBackend(rotasDasPortas);
    render(
      <CasosDeReparoProvider conexao={conexao} produtos={[SEM_FOTO]} aoAbrirCliente={() => {}}>
        <Ficha />
      </CasosDeReparoProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Garantias e trocas/ }));
    const linha = await screen.findByRole('button', { name: 'Abrir o caso de Berloque Separador Coração' });
    expect(linha.querySelector('img')).toBeNull();               // peça sem foto: ícone de sempre
    fireEvent.click(linha);
    const d = await screen.findByRole('dialog', { name: /Berloque/ });
    expect(d.className).toContain('caso');
    expect(within(d).getByText('Caso #15')).toBeTruthy();
    expect(chamadas.filter((c) => c.url.includes('/api/garantias/15')).length).toBeGreaterThan(0);
  });
});
