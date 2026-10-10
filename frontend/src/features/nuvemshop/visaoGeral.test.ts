import { describe, expect, it } from 'vitest';
import { montarVisaoGeral, statusDaLoja } from './visaoGeral';
import type { EstoqueOnline, ProblemaDaFila } from '../../services/nuvemshopEstoque';
import type { FilaDePublicacao, ItemDaFila, InfoNuvemshop } from '../publicacao/tipos';

const AGORA = new Date('2026-10-09T15:00:00Z');

const online = (over: Partial<EstoqueOnline> = {}): EstoqueOnline => ({
  ok: true, migrado: true, conectada: true, escritaHabilitada: true, ativo: true,
  corteEm: '2026-10-08T16:30:57.000Z', cronEm: '2026-10-09T14:55:00Z',
  ultimaSincronizacaoEm: '2026-10-09T14:50:00Z',
  contagens: { sincronizado: 918, revisao: 0, ignorado: 27 },
  problemas: [], conferencia: null, divergentes: [], excecoes: [],
  ...over,
});

const problema = (sku: string, motivoRevisao: string | null, status: ProblemaDaFila['status'] = 'revisao'): ProblemaDaFila => ({
  sku, desc: `Peça ${sku}`, status, acao: null, erro: 'x', tentativas: 0,
  proximaEm: null, ultimaTentativaEm: null, pedidoEm: '2026-10-09T10:00:00Z', motivoRevisao,
});

const ns = (over: Partial<InfoNuvemshop>): InfoNuvemshop => ({
  situacao: 'oculto', naLoja: true, visibilidade: 'hidden', produtoId: '1', criavel: false,
  bloqueios: [], pendencias: [], variacoes: [], variacoesSoAqui: [], texto: null, estoque: 'sincronizado',
  sincronizadoEm: null, ultimoErro: null, fotoNaLoja: true, textoNaLoja: null,
  estadoCatalogo: null, origemCatalogo: null, ...over,
});

const item = (sku: string, info: Partial<InfoNuvemshop>, pendencias: string[] = []): ItemDaFila => ({
  sku, desc: `Peça ${sku}`, cat: 'Anel', preco: 79, casa: 1, qtd: 1, pendencias,
  nuvemshop: ns({ pendencias: pendencias.map((chave) => ({ chave, motivo: chave })), ...info }),
} as unknown as ItemDaFila);

const fila = (itens: ItemDaFila[]): FilaDePublicacao => ({ ok: true, itens } as unknown as FilaDePublicacao);

describe('§63 — Loja online › Visão geral', () => {
  it('oculto intencional (§62) NÃO vira atenção: 300 ocultos, zero problemas', () => {
    const ocultos = Array.from({ length: 300 }, (_, i) => item(`O${i}`, { situacao: 'oculto' }, ['foto']));
    const v = montarVisaoGeral(online(), fila(ocultos), AGORA);
    expect(v.kpis?.ocultos).toBe(300);
    expect(v.kpis?.atencao).toBe(0);
    expect(v.atencao).toEqual([]);
  });

  it('só o publicado por aqui que saiu do ar é alerta', () => {
    const v = montarVisaoGeral(online(), fila([
      item('A', { situacao: 'oculto' }, ['foto']),
      item('B', { situacao: 'oculto', foraDoArInesperado: true, publicadoEm: '2026-10-09T12:00:00Z' }),
    ]), AGORA);
    const fora = v.atencao.find((a) => a.chave === 'fora_do_ar');
    expect(fora?.codigos.map((c) => c.sku)).toEqual(['B']);
    expect(v.kpis?.atencao).toBe(1);
  });

  it('cada número conta UM universo: publicados, ocultos e prontos não se misturam', () => {
    const v = montarVisaoGeral(online(), fila([
      item('P1', { situacao: 'publicado', visibilidade: 'visible' }),
      item('P2', { situacao: 'publicado', visibilidade: 'visible' }),
      item('O1', { situacao: 'oculto' }, ['foto']),
      item('R1', { situacao: 'pronto' }),
      item('N1', { situacao: 'nao_cadastrado', naLoja: false, criavel: true }),
    ]), AGORA);
    expect(v.kpis).toEqual({ publicados: 2, ocultos: 1, prontos: 1, atencao: 0 });
    /* "sincronizados" é outro universo (a fila de estoque), e vem dela. */
    expect(v.status.sincronizados).toBe(918);
  });

  it('revisão vira UMA ação por motivo: conferir variação × maleta × duplicado', () => {
    const v = montarVisaoGeral(online({
      contagens: { sincronizado: 900, revisao: 4 },
      problemas: [
        problema('S1', 'sem_reparticao'), problema('S2', 'sem_reparticao'),
        problema('M1', 'maleta'), problema('D1', 'duplicado'),
      ],
    }), fila([]), AGORA);
    const chaves = v.atencao.map((a) => a.chave);
    expect(chaves).toContain('estoque_variacao');
    expect(chaves).toContain('maleta_variacao');
    expect(chaves).toContain('duplicado');
    expect(v.atencao.find((a) => a.chave === 'estoque_variacao')?.titulo).toBe('Conferir estoque por variação');
    expect(v.atencao.find((a) => a.chave === 'estoque_variacao')?.quantidade).toBe(2);
    /* nenhuma frase técnica na tela principal */
    for (const a of v.atencao) {
      expect(`${a.titulo} ${a.oQueAconteceu} ${a.porQue} ${a.oQueFazer}`).not.toMatch(/linha_de_base|variante_criada|sem_reparticao|resultado_json/);
    }
    /* o duplicado é crítico e vem antes */
    expect(v.atencao[0]?.chave).toBe('duplicado');
  });

  it('revisão não derruba o estado da sincronização: ela continua ativa', () => {
    const s = statusDaLoja(online({ contagens: { sincronizado: 900, revisao: 27 }, problemas: [problema('S1', 'maleta')] }), AGORA);
    expect(s.rotulo).toBe('Sincronização ativa');
    expect(s.tom).toBe('positivo');
  });

  it('sincronização desligada aparece como item próprio', () => {
    const v = montarVisaoGeral(online({ ativo: false }), fila([]), AGORA);
    expect(v.status.rotulo).toBe('Sincronização automática desligada');
    expect(v.atencao[0]?.chave).toBe('sincronizacao_parada');
  });

  it('erro de envio pede "Tentar de novo" e é crítico', () => {
    const v = montarVisaoGeral(online({ contagens: { sincronizado: 917, erro: 1 }, problemas: [problema('E1', null, 'erro')] }), fila([]), AGORA);
    const e = v.atencao.find((a) => a.chave === 'erro_sincronizacao');
    expect(e?.tom).toBe('critico');
    expect(e?.acao?.destino).toEqual({ tipo: 'tentar' });
  });

  it('conferir (leitura) nunca é item; corrigir (escrita) só aparece com divergência', () => {
    const conf = { em: '2026-10-09T09:51:00Z', produtosNaLoja: 926, variantesNaLoja: 1011, variantesMapeadas: 918, skusMapeados: 918, iguais: 918, divergentes: 0, porStatus: {} };
    const limpo = montarVisaoGeral(online({ conferencia: conf }), fila([]), AGORA);
    expect(limpo.atencao.some((a) => a.acao?.destino.tipo === 'corrigir')).toBe(false);
    const sujo = montarVisaoGeral(online({
      conferencia: { ...conf, iguais: 916, divergentes: 2 },
      divergentes: [
        { sku: 'X1', produto: 'Peça X1', variante: null, ns_variante_id: '1', em_casa: 1, consignado: 0, online: 1, ns_estoque: 2, diferenca: -1, status: 'divergente' },
        { sku: 'X2', produto: 'Peça X2', variante: null, ns_variante_id: '2', em_casa: 0, consignado: 0, online: 0, ns_estoque: 1, diferenca: -1, status: 'divergente' },
      ],
    }), fila([]), AGORA);
    const d = sujo.atencao.find((a) => a.chave === 'divergencia');
    expect(d?.acao?.destino).toEqual({ tipo: 'corrigir' });
    expect(d?.quantidade).toBe(2);
  });

  it('peça sem anúncio que precisa de decisão leva à Preparação; a criável não', () => {
    const v = montarVisaoGeral(online(), fila([
      item('N1', { situacao: 'nao_cadastrado', naLoja: false, criavel: false, bloqueios: ['Pode ser o mesmo modelo.'] }),
      item('N2', { situacao: 'nao_cadastrado', naLoja: false, criavel: true }),
    ]), AGORA);
    const dec = v.atencao.find((a) => a.chave === 'decidir_cadastro');
    expect(dec?.codigos.map((c) => c.sku)).toEqual(['N1']);
    expect(dec?.acao?.destino).toEqual({ tipo: 'preparacao', aba: 'nao_cadastrado' });
  });

  it('§66 — oculto com possível duplicidade é atenção; publicado × publicado e resolvido não são', () => {
    const dup = (tipo: 'inconclusivo' | 'diferente', informativo = false) => ({
      tipo, decidir: tipo !== 'diferente' && !informativo, informativo, com: [], motivo: 'Pode ser o mesmo modelo de X.', proposta: null,
    });
    const v = montarVisaoGeral(online(), fila([
      item('G1', { situacao: 'oculto', duplicidade: dup('inconclusivo') }, ['duplicidade']),
      item('G2', { situacao: 'oculto', duplicidade: dup('diferente') }),
      item('G3', { situacao: 'publicado', visibilidade: 'visible', duplicidade: dup('inconclusivo', true) }),
    ]), AGORA);
    const a = v.atencao.find((x) => x.chave === 'possivel_duplicidade');
    expect(a?.codigos.map((c) => c.sku)).toEqual(['G1']);
    expect(a?.acao?.destino).toEqual({ tipo: 'preparacao', aba: 'oculto' });
    expect(v.kpis?.atencao).toBe(1);
  });
});
