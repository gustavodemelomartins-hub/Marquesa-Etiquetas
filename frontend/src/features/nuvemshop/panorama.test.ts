import { describe, expect, it } from 'vitest';
import { montarPanorama, contarPendencias, mapaEmCasa } from './panorama';
import type { AppState, Product } from '../../types/api';

/** Um produto com o mínimo preenchido. Os testes sobrescrevem só o que
 *  importa para o caso. */
function produto(p: Partial<Product> & { sku: string }): Product {
  return {
    desc: p.sku,
    cat: 'Outros',
    preco: 10,
    semPreco: false,
    qtd: 0,
    consignado: 0,
    disponivel: 0,
    status: 'ativo',
    visivel: null,
    ...p,
  };
}

function estado(produtos: Product[], loja?: AppState['loja']): AppState {
  return {
    v: 2,
    produtos,
    revendedoras: [],
    maletas: [],
    config: { prazoDias: 45, prataPct: 10, inventarioDias: 30, faixas: [] },
    loja: loja ?? null,
    inventario: {},
    sync: {
      conectada: true,
      ultimaEm: null,
      ultimoStatus: 'ok',
      pausada: null,
      erro: null,
      ultimaId: 1,
    },
    categorias: [],
  };
}

describe('mapaEmCasa', () => {
  it('usa o disponivel que o servidor calculou, não recalcula', () => {
    /* A conta total − consignado (e o mínimo entre componentes, no kit)
       mora no servidor. Refazê-la aqui criaria duas contabilidades. */
    const m = mapaEmCasa([
      produto({ sku: 'A', qtd: 10, consignado: 3, disponivel: 7 }),
      produto({ sku: 'KIT', qtd: 0, consignado: 0, disponivel: 2 }),
    ]);
    expect(m).toEqual({ A: 7, KIT: 2 });
  });
});

describe('montarPanorama', () => {
  it('separa quem está na loja de quem não está', () => {
    const p = montarPanorama(
      estado([
        produto({ sku: 'A', urlLoja: 'colar-a', estoqueLoja: 2, disponivel: 2 }),
        produto({ sku: 'B', disponivel: 5 }),
      ]),
    );
    expect(p.naLoja.map((x) => x.sku)).toEqual(['A']);
    expect(p.fora.map((x) => x.sku)).toEqual(['B']);
  });

  it('conta como "falta subir" só quem tem peça em casa', () => {
    const p = montarPanorama(
      estado([
        produto({ sku: 'COM', disponivel: 3 }),
        produto({ sku: 'SEM', disponivel: 0 }),
      ]),
    );
    expect(p.faltaSubir.map((x) => x.sku)).toEqual(['COM']);
  });

  it('acusa divergência quando a loja mostra número diferente do que há em casa', () => {
    const p = montarPanorama(
      estado([
        produto({ sku: 'IGUAL', urlLoja: 'u', estoqueLoja: 4, disponivel: 4 }),
        produto({ sku: 'DIFERE', urlLoja: 'u2', estoqueLoja: 1, disponivel: 4 }),
      ]),
    );
    expect(p.desatualizados.map((x) => x.sku)).toEqual(['DIFERE']);
  });

  it('NÃO acusa divergência em código que a rodada decidiu não empurrar', () => {
    /* Regra do painel legado, preservada: cobrar correção sem oferecer botão
       seria só barulho. Estes códigos têm o aviso próprio. */
    const p = montarPanorama(
      estado(
        [produto({ sku: 'VAR', urlLoja: 'u', estoqueLoja: 1, disponivel: 6 })],
        {
          lidoEm: null,
          produtosNaLoja: 1,
          produtosCasados: 1,
          soNaLoja: 0,
          codigosCasados: 1,
          duplicados: [],
          variacoes: [
            {
              sku: 'VAR',
              desc: 'Anel',
              casa: 6,
              naLoja: 1,
              motivo: 'sem_reparticao',
              atributos: ['Tamanho'],
              variacoes: [],
            },
          ],
        },
      ),
    );
    expect(p.desatualizados).toHaveLength(0);
    expect(p.comVariacao).toHaveLength(1);
  });

  it('estoque negativo nunca vira alvo: em casa é no mínimo zero', () => {
    const p = montarPanorama(
      estado([produto({ sku: 'NEG', urlLoja: 'u', estoqueLoja: 0, disponivel: -2 })]),
    );
    /* -2 vira 0, e 0 === estoqueLoja 0, então não há divergência. */
    expect(p.desatualizados).toHaveLength(0);
  });

  it('produto sem preço não inventa zero reais no valor publicado', () => {
    const p = montarPanorama(
      estado([
        produto({ sku: 'COM', urlLoja: 'u', estoqueLoja: 2, preco: 50 }),
        produto({ sku: 'SEM', urlLoja: 'u2', estoqueLoja: 3, preco: null, semPreco: true }),
      ]),
    );
    expect(p.valorPublicado).toBe(100);
    expect(p.pecasPublicadas).toBe(5);
  });

  it('só conta como oculto-com-peça quem realmente tem peça', () => {
    const p = montarPanorama(
      estado([
        produto({ sku: 'OC1', urlLoja: 'u', visivel: false, disponivel: 3 }),
        produto({ sku: 'OC2', urlLoja: 'u2', visivel: false, disponivel: 0 }),
        produto({ sku: 'VIS', urlLoja: 'u3', visivel: true, disponivel: 4 }),
      ]),
    );
    expect(p.ocultos.map((x) => x.sku)).toEqual(['OC1', 'OC2']);
    expect(p.ocultosComPeca.map((x) => x.sku)).toEqual(['OC1']);
  });

  it('um produto pode ser oculto E divergente ao mesmo tempo', () => {
    /* As categorias não são excludentes, e isso é correto: estar fora do ar
       e mostrar o número errado são dois problemas diferentes do mesmo
       produto. A tela conta cada um no seu lugar. */
    const p = montarPanorama(
      estado([
        produto({ sku: 'OC', urlLoja: 'u', visivel: false, estoqueLoja: 0, disponivel: 3 }),
      ]),
    );
    expect(p.ocultosComPeca.map((x) => x.sku)).toEqual(['OC']);
    expect(p.desatualizados.map((x) => x.sku)).toEqual(['OC']);
  });

  it('aguenta loja nula — antes da primeira sincronização', () => {
    const p = montarPanorama(estado([produto({ sku: 'A', disponivel: 1 })]));
    expect(p.duplicados).toEqual([]);
    expect(p.comVariacao).toEqual([]);
    expect(p.soNaLoja).toBe(0);
    expect(p.lidoEm).toBeNull();
  });

  it('reúne os atributos que a loja declara, sem lista fixa', () => {
    const p = montarPanorama(
      estado([], {
        lidoEm: '2026-08-18T09:00:00Z',
        produtosNaLoja: 3,
        produtosCasados: 2,
        soNaLoja: 1,
        codigosCasados: 2,
        duplicados: ['D1'],
        variacoes: [
          {
            sku: 'A', desc: 'Anel', casa: 1, naLoja: 1,
            motivo: 'maleta', atributos: ['Tamanho'], variacoes: [],
          },
          {
            sku: 'B', desc: 'Corrente', casa: 1, naLoja: 1,
            motivo: 'sem_reparticao', atributos: ['Comprimento'], variacoes: [],
          },
        ],
      }),
    );
    expect(p.atributos).toEqual(['Comprimento', 'Tamanho']);
    expect(p.duplicados).toEqual(['D1']);
  });
});

describe('contarPendencias', () => {
  it('soma o que precisa de uma pessoa, e ignora o que a sincronização resolve', () => {
    const p = montarPanorama(
      estado(
        [
          /* divergente: a rodada acerta sozinha, NÃO é pendência */
          produto({ sku: 'DIV', urlLoja: 'u', estoqueLoja: 1, disponivel: 9 }),
          /* falta subir: precisa de gente */
          produto({ sku: 'FALTA', disponivel: 2 }),
          /* oculto com peça: precisa de gente. `estoqueLoja` igual ao
             disponível de propósito — assim ele NÃO é divergente também, e
             o teste mede uma coisa só. */
          produto({ sku: 'OC', urlLoja: 'u2', visivel: false, estoqueLoja: 1, disponivel: 1 }),
        ],
        {
          lidoEm: null, produtosNaLoja: 2, produtosCasados: 2, soNaLoja: 0,
          codigosCasados: 2, duplicados: ['DUP'], variacoes: [],
        },
      ),
    );
    expect(p.desatualizados).toHaveLength(1);
    /* 1 duplicado + 0 semEmpurrar + 1 faltaSubir + 1 ocultoComPeca */
    expect(contarPendencias(p)).toBe(3);
  });
});
