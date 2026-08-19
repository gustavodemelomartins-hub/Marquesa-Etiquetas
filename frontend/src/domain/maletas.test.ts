import { describe, expect, it } from 'vitest';
import {
  agendaDeAcertos,
  prazoDe,
  precoEnvio,
  resumoDasRevendedoras,
  situacaoMaleta,
  valMaleta,
} from './maletas';
import { inconsistencias, porCategoria, totaisEstoque } from './estoque';
import { emCasa, estadoDeTeste, maleta, produto, revendedora } from '../testing/fixtures';

const HOJE = '2026-08-19';

describe('prazo e situação', () => {
  it('a data combinada manda; sem ela vale prazoDias a partir da saída', () => {
    expect(prazoDe(maleta({ id: 1, revId: 1, acertoEm: '2026-09-01' }), 45)).toBe('2026-09-01');
    expect(prazoDe(maleta({ id: 1, revId: 1, abertaEm: '2026-08-01' }), 45)).toBe('2026-09-15');
    expect(prazoDe(maleta({ id: 1, revId: 1, abertaEm: null }), 45)).toBeNull();
  });

  it('atraso é crítico; prazo próximo é atenção; o resto é informação', () => {
    const m = (acertoEm: string) => situacaoMaleta(maleta({ id: 1, revId: 1, acertoEm }), 45, HOJE);
    expect(m('2026-08-17')).toMatchObject({ tom: 'critico', atrasada: true });
    expect(m('2026-08-19')).toMatchObject({ tom: 'atencao', texto: 'acerto é hoje' });
    expect(m('2026-08-23')).toMatchObject({ tom: 'atencao' });
    expect(m('2026-09-30')).toMatchObject({ tom: 'neutro' });
  });

  it('maleta sem data marcada é neutra, nunca atrasada', () => {
    const s = situacaoMaleta(maleta({ id: 1, revId: 1, abertaEm: null }), 45, HOJE);
    expect(s).toEqual({ tom: 'neutro', texto: 'sem data marcada', atrasada: false });
  });
});

describe('§6.1 — o valor usa o preço congelado no envio', () => {
  const produtos = new Map([['A', emCasa('A', 0, { preco: 999 })]]);
  const m = maleta({ id: 1, revId: 1, itens: { A: 2 }, precos: { A: 100 } });

  it('prefere o preço do envio ao preço atual do catálogo', () => {
    expect(precoEnvio(m, 'A', produtos)).toBe(100);
    expect(valMaleta(m, produtos)).toBe(200);
  });

  it('cai no catálogo só quando o congelado não existe', () => {
    const semCongelado = maleta({ id: 2, revId: 1, itens: { A: 1 }, precos: {} });
    expect(precoEnvio(semCongelado, 'A', produtos)).toBe(999);
  });
});

describe('agenda de acertos', () => {
  const estado = estadoDeTeste({
    produtos: [emCasa('A', 10, { preco: 50 })],
    revendedoras: [
      revendedora({ id: 1, nome: 'Uma' }),
      revendedora({ id: 2, nome: 'Duas' }),
      revendedora({ id: 3, nome: 'Três' }),
    ],
    maletas: [
      maleta({ id: 1, revId: 1, acertoEm: '2026-09-10', itens: { A: 2 }, precos: { A: 50 } }),
      maleta({ id: 2, revId: 2, acertoEm: '2026-08-10', itens: { A: 3 }, precos: { A: 50 } }),
      maleta({ id: 3, revId: 3, abertaEm: null, itens: { A: 1 }, precos: { A: 50 } }),
      maleta({ id: 4, revId: 1, status: 'encerrada', itens: { A: 9 } }),
      maleta({ id: 5, revId: 2, status: 'cancelada', itens: { A: 9 } }),
    ],
  });

  it('lista só as maletas na rua, da mais urgente para a menos', () => {
    const a = agendaDeAcertos(estado, HOJE);
    expect(a.map((x) => x.maleta.id)).toEqual([2, 1, 3]);
  });

  it('maleta sem prazo vai para o fim, mas não some', () => {
    const a = agendaDeAcertos(estado, HOJE);
    expect(a[a.length - 1]!.dias).toBeNull();
  });

  it('traz peças, valor e o nome de quem está com ela', () => {
    const primeira = agendaDeAcertos(estado, HOJE)[0]!;
    expect(primeira).toMatchObject({ revNome: 'Duas', pecas: 3, valor: 150 });
    expect(primeira.situacao.atrasada).toBe(true);
  });

  it('o resumo por revendedora conta as maletas encerradas dela', () => {
    const r = resumoDasRevendedoras(estado, HOJE);
    expect(r.find((x) => x.id === 1)!.maletasFechadas).toBe(1);
    expect(r.find((x) => x.id === 2)!.maletasFechadas).toBe(0);
  });

  it('revendedora arquivada não aparece no resumo', () => {
    const comInativa = estadoDeTeste({
      revendedoras: [revendedora({ id: 9, nome: 'Saiu', status: 'inativa' })],
    });
    expect(resumoDasRevendedoras(comInativa)).toEqual([]);
  });
});

describe('totais de estoque', () => {
  const estado = estadoDeTeste({
    produtos: [
      produto({ sku: 'A', cat: 'Colar', preco: 100, qtd: 10, consignado: 4, disponivel: 6 }),
      produto({ sku: 'B', cat: 'Brinco', preco: 20, qtd: 5, consignado: 0, disponivel: 5 }),
    ],
    revendedoras: [revendedora({ id: 1, nome: 'Uma' })],
    maletas: [maleta({ id: 1, revId: 1, itens: { A: 4 }, precos: { A: 100 } })],
  });

  it('separa total, casa e rua, com o valor de cada um', () => {
    expect(totaisEstoque(estado)).toMatchObject({
      total: 15,
      fora: 4,
      casa: 11,
      valTotal: 1100,
      valFora: 400,
      valCasa: 700,
      codigos: 2,
    });
  });

  it('peça na rua que sumiu do catálogo ainda conta no total', () => {
    const orfa = estadoDeTeste({
      produtos: [],
      revendedoras: [revendedora({ id: 1, nome: 'Uma' })],
      maletas: [maleta({ id: 1, revId: 1, itens: { Z: 3 } })],
    });
    expect(totaisEstoque(orfa)).toMatchObject({ total: 3, fora: 3, casa: 0 });
  });

  it('o gráfico usa a mesma regra dos KPIs em cada escopo', () => {
    const soma = (e: 'total' | 'casa' | 'fora') =>
      porCategoria(estado, e).reduce((s, f) => s + f.qtd, 0);
    expect(soma('total')).toBe(15);
    expect(soma('casa')).toBe(11);
    expect(soma('fora')).toBe(4);
  });

  it('aponta código com mais peça na rua do que no cadastro', () => {
    const furado = estadoDeTeste({
      produtos: [produto({ sku: 'A', qtd: 1, consignado: 1, disponivel: 0 })],
      revendedoras: [revendedora({ id: 1, nome: 'Uma' })],
      maletas: [maleta({ id: 1, revId: 1, itens: { A: 5 } })],
    });
    expect(inconsistencias(furado)).toEqual([
      { sku: 'A', desc: 'Peça A', fora: 5, cadastro: 1 },
    ]);
  });
});
