// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RevendedorasArea, type SubRotaRevendedoras } from './RevendedorasArea';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';
import { emCasa, estadoDeTeste, maleta, revendedora } from '../../testing/fixtures';
import {
  filtrarAcertos, inicioDoPeriodo, normalizarAcertos, totalizar, FILTRO_INICIAL,
  type AcertoResumo, type AcertosDeMaleta, type HistoricoDaRevendedora,
} from './acertos';

vi.mock('../maletas/api');

/** O gap da homologação: a V2 tinha perdido o histórico consolidado de
 *  acertos, o Top revendedoras e as revendedoras inativas. Estes testes
 *  provam que voltaram — e que a volta não confunde "ativa" com "maleta
 *  aberta", não soma nada duas vezes e não escreve nada. */

const planejamento: UsoPlanejamento = {
  config: { modo: 'equilibrado', tamanhoAlvo: 8, tamanhoAlvoConfirmado: true },
  origemAlvo: { valor: 8, origem: 'historico', amostra: 2 },
  definirModo: () => {},
  definirTamanhoAlvo: () => {},
  restaurarPadrao: () => {},
};

const estado = estadoDeTeste({
  produtos: [emCasa('C1', 20, { cat: 'Colar', preco: 150 })],
  revendedoras: [
    revendedora({ id: 1, nome: 'Luciana Ativa', cidade: 'Hortolândia' }),
    revendedora({ id: 2, nome: 'Graciele Sem Maleta', cidade: 'Campinas' }),
    revendedora({ id: 3, nome: 'Jessica Inativa', status: 'inativa' }),
  ],
  maletas: [maleta({ id: 15, revId: 1, acertoEm: '2026-10-10', itens: { C1: 3 }, precos: { C1: 150 } })],
});

const acerto = (a: Partial<AcertoResumo> & { id: string; revendedoraId: number; revendedora: string }): AcertoResumo => ({
  data: '2026-09-01', status: 'ativa', pecas: 1, vendido: 100, comissao: 25, liquido: 75,
  fonte: 'documento da maleta', maletaId: null, enviadas: null, devolvidas: null,
  vendaId: null, vendaChave: null, situacaoFinanceira: 'paga', ...a,
});

const acertos: AcertosDeMaleta = {
  exato: true,
  pendentesRevisao: 0,
  acertos: [
    acerto({ id: 'historico:61', revendedoraId: 2, revendedora: 'Graciele Sem Maleta', data: '2026-09-22',
      pecas: 15, vendido: 1335, comissao: 333.75, liquido: 1001.25, maletaId: 12, enviadas: 94, devolvidas: 79 }),
    acerto({ id: 'historico:47', revendedoraId: 3, revendedora: 'Jessica Inativa', status: 'inativa', data: '2026-07-18',
      pecas: 8, vendido: 817, comissao: 122.55, liquido: 694.45 }),
    acerto({ id: 'historico:46', revendedoraId: 3, revendedora: 'Jessica Inativa', status: 'inativa', data: '2026-06-13',
      pecas: 36, vendido: 3431, comissao: 1062.2, liquido: 2368.8, situacaoFinanceira: 'parcial' }),
  ],
  revendedoras: [
    { revendedoraId: 3, nome: 'Jessica Inativa', status: 'inativa', acertos: 2, pecas: 44, vendido: 4248,
      comissao: 1184.75, liquido: 3063.25, ultimo: '2026-07-18', ticket: 96.55, enviadas: null, giro: null, ciclosSemEnvio: 2 },
    { revendedoraId: 2, nome: 'Graciele Sem Maleta', status: 'ativa', acertos: 1, pecas: 15, vendido: 1335,
      comissao: 333.75, liquido: 1001.25, ultimo: '2026-09-22', ticket: 89, enviadas: 94, giro: 0.1596, ciclosSemEnvio: 0 },
  ],
  totais: { acertos: 3, pecas: 59, vendido: 5583, comissao: 1518.5, liquido: 4064.5 },
};

const historicoDaGraciele: HistoricoDaRevendedora = {
  ok: true,
  resumo: { acertos: 1, pecasVendidas: 15, vendido: 1335, comissao: 333.75, liquido: 1001.25, aReceber: 0, maletas: 1, maletasAbertas: 0, pecasComEla: 0 },
  acertos: [{
    id: 'historico:61', fonte: 'documento', data: '2026-09-22', maletaId: 12, enviadas: 94, devolvidas: 79,
    pecasVendidas: 15, vendido: 1335, comissao: 333.75, liquido: 1001.25, situacaoFinanceira: 'paga',
    conferidoPor: null, itensVendidos: [{ sku: '429300', desc: 'Colar Ponto de Luz', qtd: 15, valor: 1001.25 }],
    itensDevolvidos: [{ sku: '566355', desc: 'Colar Chave', qtd: 79 }],
    linhasExcluidas: [], correcoes: [{ id: 21, versao: 1, situacao: 'substituida', pecas: 15, vendido: 1300, comissao: 325, liquido: 975, registradaEm: '2026-09-20' }],
    observacoes: ['Maleta'], versao: 2,
  }],
  eventos: [],
  limites: [],
};

let chamadas: { metodo: string; url: string }[] = [];
beforeEach(() => {
  chamadas = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ metodo: init?.method ?? 'GET', url: String(url) });
    const corpo = String(url).includes('/api/analytics/revendedoras') ? acertos
      : /\/api\/revendedoras\/2\/historico/.test(String(url)) ? historicoDaGraciele
        : /\/api\/revendedoras\/\d+\/historico/.test(String(url)) ? { ...historicoDaGraciele, acertos: [], resumo: { ...historicoDaGraciele.resumo, acertos: 0 } }
          : {};
    return new Response(JSON.stringify(corpo), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Area({ inicial = 'visao-geral' as SubRotaRevendedoras }) {
  const [sub, setSub] = useState<SubRotaRevendedoras>(inicial);
  return <RevendedorasArea conexao={{ url: 'http://api.local', key: 'k' }} estado={estado} carregando={false}
    erro={null} recarregar={() => {}} planejamento={planejamento} sub={sub} aoNavegarSub={setSub} />;
}

const linhaDe = (nome: RegExp) => screen.getByRole('button', { name: nome });

describe('Todas as revendedoras: o cadastro inteiro', () => {
  it('a inativa aparece, marcada como Inativa', () => {
    render(<Area inicial="todas" />);
    const linha = linhaDe(/Jessica Inativa/);
    expect(within(linha).getByText('Inativa')).toBeTruthy();
    expect(within(linha).getByText('Nenhuma maleta ativa')).toBeTruthy();
  });

  it('o filtro Ativas tira a inativa; o Inativas deixa só ela', () => {
    render(<Area inicial="todas" />);
    fireEvent.click(screen.getByRole('button', { name: /^Ativas/ }));
    expect(screen.queryByRole('button', { name: /Jessica Inativa/ })).toBeNull();
    expect(linhaDe(/Luciana Ativa/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Inativas/ }));
    expect(linhaDe(/Jessica Inativa/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Luciana Ativa/ })).toBeNull();
  });

  it('ativa não é o mesmo que maleta aberta', () => {
    render(<Area inicial="todas" />);
    const semMaleta = linhaDe(/Graciele Sem Maleta/);
    expect(within(semMaleta).getByText('Ativa')).toBeTruthy();
    expect(within(semMaleta).queryByText('Maleta aberta')).toBeNull();
    const comMaleta = linhaDe(/Luciana Ativa/);
    expect(within(comMaleta).getByText('Ativa')).toBeTruthy();
    expect(within(comMaleta).getByText('Maleta aberta')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Com maleta/ }));
    expect(screen.queryByRole('button', { name: /Graciele Sem Maleta/ })).toBeNull();
  });

  it('mostra o histórico de cada pessoa na linha', async () => {
    render(<Area inicial="todas" />);
    await waitFor(() => expect(within(linhaDe(/Jessica Inativa/)).getByText('2 acertos · 44 peças')).toBeTruthy());
    expect(within(linhaDe(/Luciana Ativa/)).getByText('Nenhum acerto fechado')).toBeTruthy();
  });
});

describe('Visão geral', () => {
  it('"Maletas ativas" lista só quem está com mercadoria — a inativa não entra', () => {
    render(<Area />);
    const painel = screen.getByRole('heading', { name: 'Maletas ativas' }).closest('section')!;
    expect(within(painel).getByText('Luciana Ativa')).toBeTruthy();
    expect(within(painel).queryByText('Jessica Inativa')).toBeNull();
    expect(within(painel).queryByText('Graciele Sem Maleta')).toBeNull();
    expect(within(painel).getByRole('button', { name: 'Ver todas as revendedoras' })).toBeTruthy();
  });

  it('mostra o resumo dos acertos concluídos e o Top, inativas incluídas', async () => {
    render(<Area />);
    const bloco = (await screen.findByRole('heading', { name: 'Histórico de acertos' })).closest('section')!;
    await waitFor(() => expect(within(bloco).getByText('R$ 5.583')).toBeTruthy());
    expect(within(bloco).getByText('R$ 1.518,50')).toBeTruthy();
    expect(within(bloco).getByText('R$ 4.064,50')).toBeTruthy();
    const top = screen.getByRole('list', { name: 'Top revendedoras' });
    const linhas = within(top).getAllByRole('button');
    expect(linhas).toHaveLength(2);
    expect(linhas[0]?.textContent).toMatch(/Jessica Inativa.*Inativa/);
    /* giro só quando todo ciclo tem maleta: Jessica não tem, Graciele tem */
    expect(within(linhas[0]!).getByTitle(/Giro indisponível/).textContent).toBe('—');
    expect(within(linhas[1]!).getByTitle(/Das 94 peças enviadas/).textContent).toBe('16%');
    expect(screen.getByText(/Sem acerto fechado ainda: Luciana Ativa/)).toBeTruthy();
  });

  it('o nome no Top abre a ficha — inclusive da inativa', async () => {
    render(<Area />);
    const top = await screen.findByRole('list', { name: 'Top revendedoras' });
    fireEvent.click(within(top).getByRole('button', { name: /Jessica Inativa/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Jessica Inativa' })).toBeTruthy();
  });
});

describe('ficha de revendedora inativa', () => {
  it('abre normalmente, diz Inativa e Nenhuma maleta ativa, e não oferece criar maleta', async () => {
    render(<Area inicial={3} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Jessica Inativa' })).toBeTruthy();
    expect(screen.getByText('Perfil da revendedora · cadastro inativo')).toBeTruthy();
    expect(screen.getByText('Nenhuma maleta ativa')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ Criar maleta' })).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Histórico da revendedora' })).toBeTruthy();
  });
});

describe('Histórico de acertos', () => {
  it('lista todos os acertos concluídos e o resumo soma as linhas filtradas', async () => {
    render(<Area inicial="historico" />);
    const tabela = await screen.findByRole('table', { name: 'Acertos' });
    expect(within(tabela).getAllByRole('row')).toHaveLength(4); // cabeçalho + 3
    fireEvent.change(screen.getByRole('combobox', { name: 'Revendedora' }), { target: { value: '3' } });
    expect(within(screen.getByRole('table', { name: 'Acertos' })).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByLabelText('Resumo dos acertos').textContent).toMatch(/R\$\s4\.248/);
    fireEvent.change(screen.getByRole('combobox', { name: 'Situação' }), { target: { value: 'parcial' } });
    expect(within(screen.getByRole('table', { name: 'Acertos' })).getAllByRole('row')).toHaveLength(2);
  });

  it('a linha abre o acerto inteiro, com SKUs, correções e o caminho para a ficha', async () => {
    render(<Area inicial="historico" />);
    fireEvent.click(await screen.findByRole('row', { name: /Acerto de Graciele Sem Maleta em 22\/09\/2026/ }));
    const gaveta = await screen.findByRole('dialog', { name: 'Acerto de Graciele Sem Maleta' });
    expect(await within(gaveta).findByText('429300')).toBeTruthy();
    expect(within(gaveta).getByText('566355')).toBeTruthy();
    expect(within(gaveta).getByText(/Versão 1 \(substituída/)).toBeTruthy();
    expect(within(gaveta).getByText('16%')).toBeTruthy();
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Abrir ficha de Graciele Sem Maleta' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Graciele Sem Maleta' })).toBeTruthy();
  });

  it('olhar o histórico não escreve nada', async () => {
    render(<Area inicial="historico" />);
    fireEvent.click(await screen.findByRole('row', { name: /Acerto de Graciele/ }));
    await screen.findByText('429300');
    expect(chamadas.length).toBeGreaterThan(0);
    expect(chamadas.every((c) => c.metodo === 'GET')).toBe(true);
  });
});

describe('filtros puros', () => {
  it('período: 30/90 dias contam para trás, "este ano" começa em 1º de janeiro', () => {
    expect(inicioDoPeriodo('30d', '2026-09-27')).toBe('2026-08-28');
    expect(inicioDoPeriodo('90d', '2026-09-27')).toBe('2026-06-29');
    expect(inicioDoPeriodo('ano', '2026-09-27')).toBe('2026-01-01');
    expect(inicioDoPeriodo('tudo', '2026-09-27')).toBeNull();
  });

  it('acerto sem data só entra em "tudo"; a busca acha por maleta e data', () => {
    const lista = [...acertos.acertos, acerto({ id: 'x', revendedoraId: 9, revendedora: 'Sem Data', data: null })];
    expect(filtrarAcertos(lista, { ...FILTRO_INICIAL, periodo: 'ano' }, '2026-09-27').map((a) => a.id)).not.toContain('x');
    expect(filtrarAcertos(lista, FILTRO_INICIAL, '2026-09-27')).toHaveLength(4);
    expect(filtrarAcertos(lista, { ...FILTRO_INICIAL, busca: 'maleta #12' }).map((a) => a.id)).toEqual(['historico:61']);
    expect(filtrarAcertos(lista, { ...FILTRO_INICIAL, busca: '18/07' }).map((a) => a.id)).toEqual(['historico:47']);
  });

  it('o total é a soma das linhas, cada uma uma vez', () => {
    expect(totalizar(acertos.acertos)).toEqual(acertos.totais);
  });

  it('uma resposta sem os campos novos não derruba a tela', () => {
    const n = normalizarAcertos({ acertos: [{ ...acertos.acertos[0]!, situacaoFinanceira: undefined as never }] });
    expect(n.revendedoras).toEqual([]);
    expect(n.acertos[0]?.situacaoFinanceira).toBe('desconhecida');
    expect(n.totais.vendido).toBe(1335);
    expect(normalizarAcertos(undefined).acertos).toEqual([]);
  });
});
