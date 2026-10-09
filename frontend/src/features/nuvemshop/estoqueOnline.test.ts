import { describe, it, expect } from 'vitest';
import { saudeDoEstoqueOnline, comoDiagnostico } from './estoqueOnline';
import type { EstoqueOnline } from '../../services/nuvemshopEstoque';
import { fraseDaPeca, porSituacao, checklistDaPeca, type ItemDaFila } from '../publicacao/tipos';

const AGORA = new Date('2026-10-08T18:00:00Z');
const haMin = (m: number) => new Date(AGORA.getTime() - m * 60_000).toISOString();

function resumo(over: Partial<EstoqueOnline> = {}): EstoqueOnline {
  return {
    ok: true, migrado: true, conectada: true, escritaHabilitada: true, ativo: true,
    corteEm: '2026-10-08T16:30:57.000Z',
    contagens: { sincronizado: 600, pendente: 0, erro: 0, revisao: 0 },
    ultimaSincronizacaoEm: haMin(3), cronEm: haMin(4), freio: null,
    ...over,
  };
}

describe('saúde do estoque online (§61)', () => {
  it('tudo em dia diz "Tudo sincronizado" e se corrige sozinho', () => {
    const s = saudeDoEstoqueOnline(resumo(), AGORA);
    expect(s.rotulo).toBe('Tudo sincronizado');
    expect(s.tom).toBe('positivo');
    expect(s.autoCorrige).toBe(true);
  });

  it('pendentes contam produtos, no singular e no plural', () => {
    expect(saudeDoEstoqueOnline(resumo({ contagens: { pendente: 3 } }), AGORA).rotulo)
      .toBe('3 produtos aguardando sincronização');
    expect(saudeDoEstoqueOnline(resumo({ contagens: { pendente: 1 } }), AGORA).rotulo)
      .toBe('1 produto aguardando sincronização');
  });

  it('erro vence pendente e não promete conserto automático', () => {
    const s = saudeDoEstoqueOnline(resumo({ contagens: { erro: 1, pendente: 5 } }), AGORA);
    expect(s.rotulo).toBe('1 erro na Nuvemshop');
    expect(s.tom).toBe('critico');
    expect(s.autoCorrige).toBe(false);
  });

  it('kill switch desligado é dito com todas as letras', () => {
    const s = saudeDoEstoqueOnline(resumo({ ativo: false }), AGORA);
    expect(s.rotulo).toBe('Sincronização automática desligada');
    expect(s.autoCorrige).toBe(false);
  });

  it('sem corte de pedidos é crítico: nada é enviado', () => {
    expect(saudeDoEstoqueOnline(resumo({ corteEm: null }), AGORA).tom).toBe('critico');
  });

  it('cron mudo há mais de meia hora vira atenção', () => {
    const s = saudeDoEstoqueOnline(resumo({ cronEm: haMin(45) }), AGORA);
    expect(s.rotulo).toBe('A rodada automática não está rodando');
  });

  it('freio anunciado manda usar "Sincronizar pendências"', () => {
    const s = saudeDoEstoqueOnline(resumo({ freio: { motivo: 'Zeraria 60.', mudancas: 60, zerando: 60, em: haMin(1) } }), AGORA);
    expect(s.motivo).toContain('Sincronizar pendências');
  });

  it('vira o diagnóstico que as Pendências já entendem', () => {
    expect(comoDiagnostico(saudeDoEstoqueOnline(resumo(), AGORA)).autoCorrige).toBe(true);
    expect(comoDiagnostico(saudeDoEstoqueOnline(resumo({ contagens: { erro: 2 } }), AGORA)).estado).toBe('erro');
  });
});

const item = (over: Partial<ItemDaFila>): ItemDaFila => ({
  sku: 'X', desc: 'Peça', cat: 'Colar', preco: 10, casa: 1, qtd: 1, fotoStatus: 'sem_foto',
  temOriginal: false, temTratada: false, temFotoPropria: false, temEnderecoDaLoja: false,
  estado: 'falta_informacao', estadoRotulo: 'Falta informação', falta: [], bloqueios: [],
  presencaNaLoja: false, produtoIdLoja: null, estadoObservado: false, pronto: false,
  aprovacaoInvalidada: false, bloqueioExterno: null, erroPublicacao: null, tentativas: 0,
  rascunho: null, aprovadoEm: null, aprovadoPor: null, publicadoEm: null, urlLoja: null,
  dadosAssinaturaAtual: null, ...over,
});

describe('Preparação para Nuvemshop: a frase de cada peça', () => {
  it('diz o que falta', () => {
    expect(fraseDaPeca(item({ situacao: 'nao_cadastrado', pendencias: ['foto', 'descricao'] })))
      .toBe('Falta foto · Falta descrição');
  });
  it('oculto na Nuvemshop diz o que falta', () => {
    expect(fraseDaPeca(item({ situacao: 'oculto', pendencias: ['foto', 'preco'] })))
      .toBe('Oculto na Nuvemshop · Falta foto · Falta preço');
  });
  it('pronto para publicar', () => {
    expect(fraseDaPeca(item({ situacao: 'pronto', pendencias: [] }))).toBe('Pronto para ficar visível');
  });
  it('publicado e sincronizado', () => {
    expect(fraseDaPeca(item({ situacao: 'publicado', sincronizacao: 'sincronizado', pendencias: [] })))
      .toBe('Publicado · Estoque sincronizado');
  });
  it('publicado, mas sem SEO na loja', () => {
    expect(fraseDaPeca(item({ situacao: 'publicado', sincronizacao: 'sincronizado', pendencias: ['seo'] })))
      .toBe('Publicado · Estoque sincronizado · Falta SEO');
  });
  it('separa por situação; sem situação (ou a antiga "preparacao") cai em não cadastrados', () => {
    const m = porSituacao([item({ situacao: 'erro' }), item({}), item({ situacao: 'publicado' }),
      item({ situacao: 'preparacao' }), item({ situacao: 'revisao' })]);
    expect(m.erro).toHaveLength(1);
    expect(m.nao_cadastrado).toHaveLength(2);
    expect(m.oculto).toHaveLength(1);
    expect(m.publicado).toHaveLength(1);
  });
  it('o checklist marca ✓ ✕ ⚠ pela pendência', () => {
    const c = checklistDaPeca(item({
      situacao: 'oculto', pendencias: ['foto', 'estoque_variacao'], presencaNaLoja: true,
    }));
    const marca = Object.fromEntries(c.map((x) => [x.rotulo, x.marca]));
    expect(marca.Cadastro).toBe('ok');
    expect(marca.Foto).toBe('falta');
    expect(marca.Estoque).toBeUndefined();
    expect(marca.SEO).toBe('ok');
  });
});
