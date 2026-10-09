// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NuvemshopPage } from './NuvemshopPage';
import type { Connection } from '../../services/client';
import type { AppState } from '../../types/api';

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

interface Chamada { metodo: string; caminho: string }
let chamadas: Chamada[] = [];
let mudou = new Set<string>();

const responder = (dados: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } }));

const info = (situacao: string, extra: Record<string, unknown> = {}) => ({
  situacao, naLoja: situacao !== 'nao_cadastrado', visibilidade: situacao === 'publicado' ? 'visible' : 'hidden',
  produtoId: '9', criavel: false, bloqueios: [], pendencias: [], variacoes: [], variacoesSoAqui: [], texto: null,
  estoque: 'sincronizado', sincronizadoEm: null, ultimoErro: null, fotoNaLoja: true, textoNaLoja: null,
  estadoCatalogo: null, origemCatalogo: null, ...extra,
});
const item = (sku: string, situacao: string, extra: Record<string, unknown> = {}) => ({
  sku, desc: `Peça ${sku}`, cat: sku.startsWith('B') ? 'Brinco' : 'Anel', preco: 79, casa: 2, qtd: 2,
  fotoStatus: 'sem_foto', temOriginal: false, temTratada: false, temFotoPropria: false, temEnderecoDaLoja: true,
  estado: 'publicado', estadoRotulo: '', falta: [], bloqueios: [], presencaNaLoja: situacao !== 'nao_cadastrado',
  produtoIdLoja: '9', estadoObservado: false, pronto: false, aprovacaoInvalidada: false, bloqueioExterno: null,
  erroPublicacao: null, tentativas: 0, rascunho: null, aprovadoEm: null, aprovadoPor: null, publicadoEm: null,
  urlLoja: null, dadosAssinaturaAtual: null, situacao, pendencias: [], nuvemshop: info(situacao), ...extra,
});

const FILA = {
  ok: true, migrado: true, escritaNaLojaHabilitada: true, catalogoAtivo: true, decisaoPendente: '',
  resumo: {}, prontos: [], semFoto: [], semFundoBranco: [], semDescricao: [], semCategoria: [], semPreco: [],
  itens: [
    item('A1', 'pronto'), item('A2', 'pronto'), item('B1', 'pronto'),
    item('O1', 'oculto', { pendencias: ['foto'], nuvemshop: info('oculto', { pendencias: [{ chave: 'foto', motivo: 'Falta foto.' }] }) }),
    item('P1', 'publicado'),
  ],
};

const ONLINE = {
  ok: true, migrado: true, conectada: true, escritaHabilitada: true, ativo: true,
  corteEm: '2026-10-08T16:30:57.000Z', cronEm: new Date().toISOString(), ultimaSincronizacaoEm: new Date().toISOString(),
  contagens: { sincronizado: 918, revisao: 1, ignorado: 27 },
  problemas: [{ sku: '191620', desc: 'Brinco Corações', status: 'revisao', acao: null, erro: 'x', tentativas: 0,
    proximaEm: null, ultimaTentativaEm: null, pedidoEm: '2026-10-09T10:00:00Z', motivoRevisao: 'sem_reparticao', casa: 3 }],
  conferencia: { em: '2026-10-09T09:51:00Z', produtosNaLoja: 926, variantesNaLoja: 1011, variantesMapeadas: 918,
    skusMapeados: 918, iguais: 917, divergentes: 1, porStatus: {} },
  divergentes: [{ sku: 'X1', produto: 'Peça X1', variante: null, ns_variante_id: '1', em_casa: 1, consignado: 0,
    online: 1, ns_estoque: 2, diferenca: -1, status: 'divergente' }],
  excecoes: [],
};

const ESTADO = {
  produtos: [
    { sku: 'A1', desc: 'Peça A1', fotoLojaUrl: 'https://d2r9epyceweg5n.cloudfront.net/stores/001/a1-1024-1024.jpg', fotoGaleriaUrl: 'https://r2/a1.jpg' },
    { sku: 'A2', desc: 'Peça A2', fotoGaleriaUrl: 'https://r2/a2.jpg', fotoMiniUrl: 'https://r2/a2-mini.jpg' },
    { sku: 'B1', desc: 'Peça B1' },
  ],
} as unknown as AppState;

beforeEach(() => {
  chamadas = [];
  mudou = new Set();
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
    const caminho = url.replace(conexao.url, '');
    const metodo = init.method ?? 'GET';
    chamadas.push({ metodo, caminho });
    if (caminho === '/api/nuvemshop/estoque') return responder(ONLINE);
    if (caminho === '/api/catalogo/publicacao') return responder(FILA);
    if (caminho === '/api/nuvemshop/estoque/conferir') return responder({ ok: true, resumo: { ...ONLINE.conferencia } });
    if (caminho === '/api/nuvemshop/estoque/reconciliar') return responder({ ok: true, codigos: 1 });
    const pub = caminho.match(/^\/api\/nuvemshop\/catalogo\/([^/]+)\/publicar$/);
    if (pub && metodo === 'POST') {
      const sku = decodeURIComponent(pub[1] ?? '');
      if (mudou.has(sku)) return responder({ ok: false, erro: 'Ainda falta coisa para publicar. Nada foi mudado na loja.', faltam: ['foto'] }, 409);
      return responder({ ok: true, sku, visibilidade: 'visible', confirmadoPelaLoja: true });
    }
    if (/\/anuncio$/.test(caminho)) return responder({ ok: false, erro: 'sem credencial' }, 409);
    return responder({ ok: true });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const abrir = (sub: string | null = null) => render(
  <NuvemshopPage conexao={conexao} estado={ESTADO} sub={sub} aoNavegarSub={() => {}} aoIr={() => {}} />,
);
const publicacoes = () => chamadas.filter((c) => c.metodo === 'POST' && c.caminho.endsWith('/publicar')).map((c) => c.caminho.split('/')[4]);

describe('§63 — Loja online › Visão geral', () => {
  it('estado, quatro números e só o que precisa de gente', async () => {
    abrir();
    expect(await screen.findByText('Sincronização ativa')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Loja online' })).toBeTruthy();
    await screen.findByText('Publicados na loja');
    const kpi = (rotulo: string) => screen.getByText(rotulo).closest('.mq-kpi')?.querySelector('.mq-kpi__value')?.textContent;
    expect(kpi('Publicados na loja')).toBe('1');
    expect(kpi('Ocultos em preparação')).toBe('1');
    expect(kpi('Prontos para publicar')).toBe('3');
    expect(screen.getByText('Conferir estoque por variação')).toBeTruthy();
    /* o oculto em preparação NÃO é problema; não há "Analisar sincronização" */
    expect(screen.queryByText(/fora do ar com peça/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Analisar sincronização' })).toBeNull();
  });

  it('"Conferir agora" só LÊ; corrigir pede confirmação antes de escrever', async () => {
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Conferir agora' }));
    await waitFor(() => expect(chamadas.some((c) => c.caminho === '/api/nuvemshop/estoque/conferir')).toBe(true));
    expect(chamadas.some((c) => c.caminho === '/api/nuvemshop/estoque/reconciliar')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Corrigir automaticamente o que é seguro' }));
    expect(chamadas.some((c) => c.caminho === '/api/nuvemshop/estoque/reconciliar')).toBe(false);
    expect(screen.getAllByText(/Isto muda o estoque na Nuvemshop/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirmar: corrigir na loja' })[0]!);
    await waitFor(() => expect(chamadas.some((c) => c.caminho === '/api/nuvemshop/estoque/reconciliar')).toBe(true));
    expect(publicacoes()).toEqual([]);
  });
});

describe('§63 — Loja online › Preparação', () => {
  it('pronto mostra a miniatura real: a da loja primeiro, a daqui depois', async () => {
    abrir('publicacao:pronto');
    await screen.findByText('Peça A1');
    const imgs = [...document.querySelectorAll('.mq-prep-linha img')].map((i) => i.getAttribute('src'));
    expect(imgs[0]).toContain('cloudfront.net/stores/001/a1');     // loja vence a galeria
    expect(imgs[1]).toBe('https://r2/a2-mini.jpg');                  // sem foto da loja: a daqui
    expect(document.querySelectorAll('.mq-prep-linha .mq-thumb--empty').length).toBe(1); // B1: losango
  });

  it('checklist compacto de oito itens na linha', async () => {
    abrir('publicacao:oculto');
    await screen.findByText('Peça O1');
    const itens = [...document.querySelectorAll('.mq-minicheck li:not(.mq-minicheck__resumo)')].map((l) => l.textContent?.replace(/:.*/, '').trim());
    expect(itens).toEqual(['✓ Cadastro', '✓ Descrição', '✓ SEO', '✓ Categoria', '✓ Preço', '✓ Estoque', '✓ Variações', '✕ Foto']);
  });

  it('publicar UM pede confirmação e só então escreve', async () => {
    abrir('publicacao:pronto');
    await screen.findByText('Peça A1');
    const linha = screen.getByText('Peça A1').closest('.mq-prep-linha') as HTMLElement;
    fireEvent.click(within(linha).getByRole('button', { name: 'Publicar' }));
    expect(publicacoes()).toEqual([]);
    const modal = screen.getByRole('dialog', { name: 'Publicar na Nuvemshop' });
    fireEvent.click(within(modal).getByRole('button', { name: 'Publicar 1 produto' }));
    await screen.findByText(/1 publicado/);
    expect(publicacoes()).toEqual(['A1']);
  });

  it('publicar SELECIONADOS: só os marcados', async () => {
    abrir('publicacao:pronto');
    await screen.findByText('Peça A1');
    fireEvent.click(screen.getByLabelText('Selecionar Peça A1'));
    fireEvent.click(screen.getByLabelText('Selecionar Peça B1'));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar selecionados (2)' }));
    const modal = screen.getByRole('dialog', { name: 'Publicar na Nuvemshop' });
    fireEvent.click(within(modal).getByRole('button', { name: 'Publicar 2 produtos' }));
    await screen.findByText(/2 publicados/);
    expect(publicacoes()).toEqual(['A1', 'B1']);
  });

  it('publicar TODOS: resumo antes; o que mudou no meio é pulado e o resto segue', async () => {
    mudou.add('A2');
    abrir('publicacao:pronto');
    await screen.findByText('Peça A1');
    fireEvent.click(screen.getByRole('button', { name: 'Publicar todos os prontos (3)' }));
    const modal = screen.getByRole('dialog', { name: 'Publicar na Nuvemshop' });
    expect(within(modal).getByText('3 produtos estão prontos para publicação.')).toBeTruthy();
    expect(within(modal).getByText('Pendências críticas').nextElementSibling?.textContent).toBe('0');
    expect(within(modal).getByText('Peças em casa').nextElementSibling?.textContent).toBe('6');
    fireEvent.click(within(modal).getByRole('button', { name: 'Publicar 3 produtos' }));
    await screen.findByText(/2 publicados/);
    expect(screen.getByText(/1 não publicado/)).toBeTruthy();
    expect(publicacoes()).toEqual(['A1', 'A2', 'B1']);
  });

  it('filtro por tipo + selecionar os filtrados = publicar só brincos', async () => {
    abrir('publicacao:pronto');
    await screen.findByText('Peça A1');
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'Brinco' } });
    fireEvent.click(screen.getByLabelText(/Selecionar os filtrados/));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar selecionados (1)' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Publicar na Nuvemshop' })).getByRole('button', { name: 'Publicar 1 produto' }));
    await screen.findByText(/1 publicado/);
    expect(publicacoes()).toEqual(['B1']);
  });
});
