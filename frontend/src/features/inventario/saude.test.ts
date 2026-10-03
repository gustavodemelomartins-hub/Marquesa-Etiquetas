import { describe, expect, it } from 'vitest';
import { saudeDoEstoque } from './saude';

/* 03/10/2026 — o card "Saúde do estoque" mostrava ícone verde com
   "Conferência vencida". Verde é só para estoque conferido no prazo. */
describe('saúde do estoque', () => {
  it('sem inventário real concluído: primeira conferência pendente, nunca saudável', () => {
    const s = saudeDoEstoque({ diasDesde: null, prazoDias: 45, vencido: true, ultimoEm: null });
    expect(s.nivel).toBe('atencao');
    expect(s.titulo).toBe('Primeira conferência pendente');
    expect(s.detalhe).toBe('Nenhum inventário concluído ainda');
  });

  it('vencida: alerta, nunca aparência positiva', () => {
    const s = saudeDoEstoque({ diasDesde: 50, prazoDias: 45, vencido: true, ultimoEm: '2026-08-14' });
    expect(s.nivel).toBe('vencida');
    expect(s.titulo).toBe('Conferência vencida');
    expect(s.detalhe).toBe('Última em 14/08/2026 · 50 dias (prazo 45)');
  });

  it('no dia do prazo já é vencida', () => {
    expect(saudeDoEstoque({ diasDesde: 45, prazoDias: 45, ultimoEm: '2026-08-19' }).nivel).toBe('vencida');
  });

  it('perto de vencer (últimos 7 dias do prazo): atenção', () => {
    const s = saudeDoEstoque({ diasDesde: 40, prazoDias: 45, ultimoEm: '2026-08-24' });
    expect(s.nivel).toBe('atencao');
    expect(s.titulo).toBe('Conferência perto de vencer');
    expect(s.detalhe).toBe('Última em 24/08/2026 · vence em 5 dias');
  });

  it('depois de um inventário válido: saudável, com a data real dele', () => {
    const s = saudeDoEstoque({ diasDesde: 3, prazoDias: 45, vencido: false, ultimoEm: '2026-09-30' });
    expect(s.nivel).toBe('ok');
    expect(s.titulo).toBe('Estoque conferido');
    expect(s.detalhe).toBe('Última em 30/09/2026 · há 3 dias');
  });

  it('conferido hoje', () => {
    expect(saudeDoEstoque({ diasDesde: 0, prazoDias: 45, ultimoEm: '2026-10-03' }).detalhe)
      .toBe('Última em 03/10/2026 · hoje');
  });

  it('sem o resumo do servidor ainda: neutro, sem afirmar nada', () => {
    const s = saudeDoEstoque(undefined);
    expect(s.nivel).toBe('carregando');
  });

  it('prazo curto: a janela de atenção encolhe junto', () => {
    expect(saudeDoEstoque({ diasDesde: 4, prazoDias: 7, ultimoEm: '2026-09-29' }).nivel).toBe('ok');
    expect(saudeDoEstoque({ diasDesde: 5, prazoDias: 7, ultimoEm: '2026-09-28' }).nivel).toBe('atencao');
  });
});
