import { describe, it, expect } from 'vitest';
import type { SyncSummary } from '../../types/api';
import { diagnosticarSync, LIMITE_ATRASO_H, LIMITE_TRAVADA_H } from './saude';
import { parseDataBackend, horasDesde } from '../../services/datas';

/** Instante fixo. Testar "está atrasado?" com o relógio de verdade é como
 *  o teste passa hoje e falha às 3 da manhã. */
const AGORA = new Date('2026-08-18T12:00:00Z');

/** Timestamp no formato que o backend grava mesmo: `datetime('now')` do
 *  SQLite, UTC e SEM o "Z". Usar ISO aqui esconderia o bug de fuso. */
function haHoras(h: number): string {
  return new Date(AGORA.getTime() - h * 3600_000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

function resumo(over: Partial<SyncSummary> = {}): SyncSummary {
  return {
    conectada: true,
    ultimaEm: haHoras(3),
    ultimoStatus: 'ok',
    pausada: null,
    erro: null,
    ultimaId: 7,
    ...over,
  };
}

describe('parseDataBackend', () => {
  it('lê o formato do SQLite como UTC, não como hora local', () => {
    const d = parseDataBackend('2026-08-18 09:00:00');
    expect(d?.toISOString()).toBe('2026-08-18T09:00:00.000Z');
  });

  it('aceita ISO com Z sem mexer', () => {
    expect(parseDataBackend('2026-08-18T09:00:00.000Z')?.toISOString()).toBe(
      '2026-08-18T09:00:00.000Z',
    );
  });

  it('devolve null para vazio e para lixo, nunca uma data inventada', () => {
    expect(parseDataBackend(null)).toBeNull();
    expect(parseDataBackend('')).toBeNull();
    expect(parseDataBackend('ontem de tarde')).toBeNull();
  });

  it('horasDesde não confunde "ilegível" com "faz muito tempo"', () => {
    expect(horasDesde(null, AGORA)).toBeNull();
    expect(horasDesde(haHoras(5), AGORA)).toBeCloseTo(5, 5);
  });
});

describe('diagnosticarSync', () => {
  /* ---------------------------------------------------- caso saudável */

  it('rodada recente e bem-sucedida se auto-corrige', () => {
    const d = diagnosticarSync(resumo(), AGORA);
    expect(d.estado).toBe('saudavel');
    expect(d.autoCorrige).toBe(true);
  });

  it('12 horas é o intervalo normal entre rodadas e continua saudável', () => {
    expect(diagnosticarSync(resumo({ ultimaEm: haHoras(12) }), AGORA).autoCorrige).toBe(true);
  });

  it('uma rodada em andamento agora é saudável', () => {
    const d = diagnosticarSync(
      resumo({ ultimoStatus: 'rodando', ultimaEm: haHoras(0.05) }),
      AGORA,
    );
    expect(d.estado).toBe('saudavel');
    expect(d.autoCorrige).toBe(true);
  });

  /* --------------------------------------------- casos que NÃO corrigem */

  it('loja desconectada nunca se corrige', () => {
    const d = diagnosticarSync(resumo({ conectada: false }), AGORA);
    expect(d.estado).toBe('desconectada');
    expect(d.autoCorrige).toBe(false);
  });

  it('última rodada em erro não se corrige, e o motivo vem do servidor', () => {
    const d = diagnosticarSync(
      resumo({ ultimoStatus: 'erro', erro: 'A Nuvemshop devolveu 401.' }),
      AGORA,
    );
    expect(d.estado).toBe('erro');
    expect(d.autoCorrige).toBe(false);
    expect(d.motivo).toContain('401');
  });

  it('erro sem mensagem ainda assim não se corrige', () => {
    const d = diagnosticarSync(resumo({ ultimoStatus: 'erro', erro: null }), AGORA);
    expect(d.autoCorrige).toBe(false);
    expect(d.motivo.length).toBeGreaterThan(10);
  });

  it('pausada pelo freio não se corrige, PORQUE o cron não força', () => {
    const d = diagnosticarSync(
      resumo({
        ultimoStatus: 'pausado',
        pausada: { motivo: 'A rodada zeraria 30 produtos na loja (o limite é 15).', mudancas: 44, zerando: 30 },
      }),
      AGORA,
    );
    expect(d.estado).toBe('pausada');
    expect(d.autoCorrige).toBe(false);
    /* A parte que a tela precisa dizer: esperar não resolve. */
    expect(d.motivo).toContain('não força');
    expect(d.motivo).toContain('30 produtos');
  });

  it('nunca ter rodado não é o mesmo que ter rodado bem', () => {
    const d = diagnosticarSync(resumo({ ultimoStatus: null, ultimaEm: null, ultimaId: null }), AGORA);
    expect(d.estado).toBe('nunca_rodou');
    expect(d.autoCorrige).toBe(false);
  });

  it('rodada presa em "rodando" há mais de uma hora morreu no meio', () => {
    const d = diagnosticarSync(
      resumo({ ultimoStatus: 'rodando', ultimaEm: haHoras(LIMITE_TRAVADA_H + 0.5) }),
      AGORA,
    );
    expect(d.estado).toBe('travada');
    expect(d.autoCorrige).toBe(false);
  });

  it('duas rodadas perdidas é atraso, e atraso não se corrige sozinho', () => {
    const d = diagnosticarSync(resumo({ ultimaEm: haHoras(LIMITE_ATRASO_H + 1) }), AGORA);
    expect(d.estado).toBe('atrasada');
    expect(d.autoCorrige).toBe(false);
  });

  it('logo abaixo do limite ainda é saudável — a borda não oscila', () => {
    expect(diagnosticarSync(resumo({ ultimaEm: haHoras(LIMITE_ATRASO_H - 0.1) }), AGORA).estado)
      .toBe('saudavel');
    expect(diagnosticarSync(resumo({ ultimaEm: haHoras(LIMITE_ATRASO_H + 0.1) }), AGORA).estado)
      .toBe('atrasada');
  });

  /* ------------------------------------------------------- precedência */

  it('pausada há três dias é "pausada", não "atrasada": o freio é o motivo real', () => {
    const d = diagnosticarSync(
      resumo({
        ultimoStatus: 'pausado',
        ultimaEm: haHoras(72),
        pausada: { motivo: 'Freio.', mudancas: 99, zerando: 0 },
      }),
      AGORA,
    );
    expect(d.estado).toBe('pausada');
  });

  it('desconectada vence qualquer outra coisa que o histórico diga', () => {
    const d = diagnosticarSync(
      resumo({ conectada: false, ultimoStatus: 'erro', erro: 'qualquer' }),
      AGORA,
    );
    expect(d.estado).toBe('desconectada');
  });

  it('data ilegível não vira atraso silencioso', () => {
    /* Se o backend um dia mudar o formato, o certo é continuar dizendo
       "saudável" com base no status, e não decretar atraso porque a
       string não foi entendida. */
    const d = diagnosticarSync(resumo({ ultimaEm: 'formato-novo-qualquer' }), AGORA);
    expect(d.estado).toBe('saudavel');
  });
});
