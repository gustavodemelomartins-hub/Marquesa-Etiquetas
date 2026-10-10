import { describe, expect, it } from 'vitest';
import { publicarEmLote } from './lote';
import { ApiError } from '../../types/api';
import { checklistDaPeca, disponibilidadeDaPeca, resumoDoLote, CHECKLIST, FILTROS, type ItemDaFila } from './tipos';

/** Uma loja de mentira: quem está oculto e pronto vira visível; quem
 *  "mudou" recebe o 409 que `publicarNaLoja` devolve; quem quebra, 502. */
function loja(opts: { mudou?: Set<string>; quebra?: Set<string> } = {}) {
  const visiveis = new Set<string>();
  const chamadas: string[] = [];
  const publicarUm = async (sku: string) => {
    chamadas.push(sku);
    if (opts.mudou?.has(sku)) {
      throw new ApiError('Ainda falta coisa para publicar. Nada foi mudado na loja.', 409, { faltam: ['foto'] });
    }
    if (opts.quebra?.has(sku)) throw new ApiError('Não consegui confirmar a publicação.', 502, null);
    visiveis.add(sku);
    return { ok: true, confirmadoPelaLoja: true };
  };
  return { visiveis, chamadas, publicarUm };
}

describe('§63 — publicar em lote', () => {
  it('publica UM', async () => {
    const l = loja();
    const r = await publicarEmLote(['A'], l.publicarUm);
    expect(r.publicados).toEqual(['A']);
    expect([...l.visiveis]).toEqual(['A']);
  });

  it('publica só os selecionados, na ordem', async () => {
    const l = loja();
    const r = await publicarEmLote(['B', 'D'], l.publicarUm);
    expect(l.chamadas).toEqual(['B', 'D']);
    expect(r.publicados).toEqual(['B', 'D']);
    expect(l.visiveis.has('A')).toBe(false);
  });

  it('publica todos os prontos', async () => {
    const todos = Array.from({ length: 63 }, (_, i) => `P${i}`);
    const l = loja();
    const r = await publicarEmLote(todos, l.publicarUm);
    expect(r.publicados).toHaveLength(63);
    expect(r.pulados).toEqual([]);
  });

  it('o que deixou de estar pronto no meio do lote é PULADO, com o motivo, e os outros seguem', async () => {
    const l = loja({ mudou: new Set(['C']) });
    const r = await publicarEmLote(['A', 'B', 'C', 'D', 'E'], l.publicarUm);
    expect(r.publicados).toEqual(['A', 'B', 'D', 'E']);
    expect(r.pulados).toHaveLength(1);
    expect(r.pulados[0]?.sku).toBe('C');
    expect(r.pulados[0]?.motivo).toMatch(/falta foto/i);
    expect(l.visiveis.has('C')).toBe(false);
  });

  it('falha de rede num item não prejudica nenhum outro', async () => {
    const l = loja({ quebra: new Set(['B']) });
    const r = await publicarEmLote(['A', 'B', 'C'], l.publicarUm);
    expect(r.publicados).toEqual(['A', 'C']);
    expect(r.falhas.map((f) => f.sku)).toEqual(['B']);
  });

  it('nada fica visível antes do clique, e "Parar" vale antes da próxima peça', async () => {
    const l = loja();
    expect(l.visiveis.size).toBe(0);
    let n = 0;
    const r = await publicarEmLote(['A', 'B', 'C'], async (s) => { n += 1; return l.publicarUm(s); }, { deveParar: () => n >= 1 });
    expect(r.publicados).toEqual(['A']);
    expect(r.interrompido).toBe(true);
    expect(l.visiveis.has('B')).toBe(false);
  });
});

const peca = (over: Partial<ItemDaFila> & { chaves?: string[]; naLoja?: boolean } = {}): ItemDaFila => {
  const chaves = over.chaves ?? [];
  return {
    sku: 'X', desc: 'Peça', cat: 'Anel', preco: 79, casa: 2, qtd: 2, pendencias: chaves,
    presencaNaLoja: over.naLoja ?? true,
    nuvemshop: {
      situacao: chaves.length ? 'oculto' : 'pronto', naLoja: over.naLoja ?? true, visibilidade: 'hidden',
      produtoId: '1', criavel: false, bloqueios: [], pendencias: chaves.map((chave) => ({ chave, motivo: `motivo ${chave}` })),
      variacoes: [], variacoesSoAqui: [], texto: null, estoque: 'sincronizado', sincronizadoEm: null, ultimoErro: null,
      fotoNaLoja: true, textoNaLoja: null, estadoCatalogo: null, origemCatalogo: null,
    },
    ...over,
  } as unknown as ItemDaFila;
};

describe('§63 — o checklist é o do servidor', () => {
  it('§64 — sete itens de CADASTRO, na ordem pedida; estoque fica à parte', () => {
    expect(CHECKLIST.map((c) => c.rotulo)).toEqual(
      ['Cadastro', 'Descrição', 'SEO', 'Categoria', 'Preço', 'Variações', 'Foto']);
  });

  it('§64 — disponibilidade: estoque zero é estado (neutro), divisão por variação é aviso', () => {
    expect(disponibilidadeDaPeca(peca({ casa: 0 }))).toMatchObject({ marca: 'neutro', frase: expect.stringMatching(/fora da fila até entrar estoque/) });
    expect(disponibilidadeDaPeca(peca({ chaves: ['estoque_variacao'] })).marca).toBe('aviso');
    expect(disponibilidadeDaPeca(peca({ chaves: ['estoque'] })).marca).toBe('neutro');
    expect(disponibilidadeDaPeca(peca({ casa: 2 })).marca).toBe('ok');
    expect(checklistDaPeca(peca({ casa: 0 })).every((c) => c.marca === 'ok')).toBe(true);
  });

  it('cada chave de pendência do servidor marca a linha certa', () => {
    const casos: [string, string][] = [
      ['foto', 'Foto'], ['descricao', 'Descrição'], ['seo', 'SEO'], ['categoria', 'Categoria'],
      ['preco', 'Preço'], ['variacao', 'Variações'], ['sku_duplicado', 'Cadastro'],
      ['duplicidade', 'Cadastro'],
    ];
    for (const [chave, rotulo] of casos) {
      const lista = checklistDaPeca(peca({ chaves: [chave] }));
      const marcadas = lista.filter((c) => c.marca !== 'ok').map((c) => c.rotulo);
      expect(marcadas, chave).toEqual([rotulo]);
      expect(lista.find((c) => c.rotulo === rotulo)?.detalhe, chave).toBe(`motivo ${chave}`);
    }
  });

  it('§66 — possível duplicidade é ✕ no Cadastro (decisão de gente, não aviso)', () => {
    const lista = checklistDaPeca(peca({ chaves: ['duplicidade'] }));
    expect(lista.find((c) => c.rotulo === 'Cadastro')?.marca).toBe('falta');
    const filtro = FILTROS.find((f) => f.id === 'duplicidade')!;
    expect(filtro.rotulo).toBe('Possível duplicidade');
    expect(filtro.passa(peca({ chaves: ['duplicidade'] }))).toBe(true);
    expect(filtro.passa(peca({ chaves: ['foto'] }))).toBe(false);
  });

  it('pronto = tudo ✓; sem anúncio = Cadastro ✕', () => {
    expect(checklistDaPeca(peca()).every((c) => c.marca === 'ok')).toBe(true);
    expect(checklistDaPeca(peca({ naLoja: false })).find((c) => c.rotulo === 'Cadastro')?.marca).toBe('falta');
  });

  it('o resumo da confirmação conta produtos, peças, preço, foto e pendência crítica', () => {
    const r = resumoDoLote([peca({ casa: 2 }), peca({ sku: 'Y', casa: 3 }), peca({ sku: 'Z', casa: 1, chaves: ['foto'] })]);
    expect(r).toEqual({ produtos: 3, pecas: 6, comPreco: 3, comFoto: 2, criticas: 1 });
  });
});
