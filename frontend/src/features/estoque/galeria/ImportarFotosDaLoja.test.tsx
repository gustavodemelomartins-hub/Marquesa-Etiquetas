// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ImportarFotosDaLoja } from './ImportarFotosDaLoja';

/* PROD, 29/09/2026: a importação entrou ~1.100 fotos e depois toda chamada
   voltou "Não consegui falar com o servidor" — o Worker estourando o limite
   do plano gratuito, sem resposta nenhuma. Estas provas fixam o que a tela
   faz com isso: abre sem reler a loja, repete com lote menor, e pula uma
   foto que derruba o servidor sozinha — mas só com o servidor no ar. */

const conexao = { url: 'http://api.test', key: 'k' };

let fila: string[];
let assassina: string | null;
let servidorFora: boolean;
let cairDepoisDeLotes: number | null;
let chamadas: { metodo: string; url: string; corpo: unknown }[];

const resumo = (novas: number) => ({
  anunciosComFoto: 10, anunciosComCorrespondencia: 10, anunciosSemCorrespondencia: 0, anunciosParaRevisar: 0,
  fotosEncontradas: novas, fotosJaNoR2: 0, fotosRemovidasAqui: 0, fotosNovas: novas, fotosParaRevisar: 0,
  fotosSemPeca: 0, pecasComFotoNova: novas, pecasComFotoDaLoja: novas,
});

function servidor() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const metodo = (init.method || 'GET').toUpperCase();
    const corpo = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    chamadas.push({ metodo, url, corpo });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/api/health')) {
      if (servidorFora) throw new TypeError('Failed to fetch');
      return json({ ok: true });
    }
    if (url.endsWith('/api/fotos/loja/plano')) {
      return json({
        ok: true, resumo: resumo(fila.length), revisar: [], semPeca: [], skusParaRevisar: [],
        ultimaAnalise: { ...resumo(fila.length), em: '2026-09-29T22:05:00.000Z', anunciosNaLoja: 600, anunciosSemFoto: 3 },
      });
    }
    if (url.endsWith('/api/fotos/loja/analisar')) return json({ ok: false, erro: 'não devia reler a loja' }, 500);
    if (url.endsWith('/api/fotos/loja/importar')) {
      if (servidorFora) throw new TypeError('Failed to fetch');
      const { limite, ignorar } = corpo as { limite: number; ignorar: string[] };
      const disponiveis = fila.filter((id) => !ignorar.includes(id));
      const lote = disponiveis.slice(0, limite);
      if (assassina && lote.includes(assassina)) throw new TypeError('Failed to fetch');
      fila = fila.filter((id) => !lote.includes(id));
      if (cairDepoisDeLotes !== null && --cairDepoisDeLotes <= 0) servidorFora = true;
      return json({
        ok: true, importadas: lote.length, jaExistiam: 0, duplicadas: 0, falharam: 0, falhas: [],
        restantes: disponiveis.length - lote.length, total: disponiveis.length + ignorar.length,
        proximos: disponiveis.slice(lote.length, lote.length + 20).map((id) => ({ imagemId: id, sku: `S-${id}` })),
      });
    }
    return json({ ok: false, erro: 'rota inesperada' }, 404);
  }));
}

beforeEach(() => {
  fila = Array.from({ length: 20 }, (_, i) => `a${i + 1}`);
  assassina = null;
  servidorFora = false;
  cairDepoisDeLotes = null;
  chamadas = [];
  servidor();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const abrir = () => render(
  <ImportarFotosDaLoja conexao={conexao} aoFechar={() => {}} aoTerminar={() => {}} aoAbrirPeca={() => {}} pausaEntreQuedas={1} />,
);

describe('Importar fotos da Nuvemshop', () => {
  it('abre pelo plano gravado, sem reler o catálogo inteiro da loja', async () => {
    abrir();
    await screen.findByText(/Loja lida em/);
    expect(chamadas.some((c) => c.url.endsWith('/analisar'))).toBe(false);
    expect(screen.getByRole('button', { name: /Iniciar importação de 20 fotos/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ler a loja de novo' })).toBeTruthy();
  });

  it('uma foto que derruba o servidor sozinha é pulada com o motivo, e o resto entra', async () => {
    assassina = 'a7';
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Iniciar importação/ }));
    await screen.findByText(/Importação concluída/, undefined, { timeout: 5000 });
    expect(fila).toEqual(['a7']);
    expect(screen.getByText(/19 fotos entraram/)).toBeTruthy();
    expect(screen.getByText(/O servidor caiu ao importar esta foto/)).toBeTruthy();
    const lotes = chamadas.filter((c) => c.url.endsWith('/importar')).map((c) => (c.corpo as { limite: number }).limite);
    expect(lotes[0]).toBe(6);
    expect(lotes).toContain(3);
    expect(lotes).toContain(1);
    expect(chamadas.some((c) => c.url.endsWith('/api/health'))).toBe(true);
  });

  it('servidor fora do ar: para e diz, sem pular foto nenhuma', async () => {
    cairDepoisDeLotes = 1;
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Iniciar importação/ }));
    await screen.findByText(/Importação interrompida/, undefined, { timeout: 5000 });
    expect(screen.queryByText(/O servidor caiu ao importar esta foto/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy();
    expect(fila.length).toBe(14);
  });
});
