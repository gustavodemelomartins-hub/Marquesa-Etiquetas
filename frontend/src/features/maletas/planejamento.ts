/** Onde a configuração de planejamento fica guardada.
 *
 *  No NAVEGADOR, de propósito, e não em `/api/config`.
 *
 *  A reserva mínima em casa e o tamanho alvo de uma maleta não são regras
 *  da Marquesa hoje: `api/REGRAS.md` não define nenhuma das duas. Gravar
 *  esses números no banco os transformaria em regra de negócio do sistema
 *  sem que ninguém tenha decidido isso — e, uma vez no banco, viram a
 *  referência que outras telas passam a consultar.
 *
 *  Enquanto forem uma premissa de planejamento, moram onde uma premissa
 *  mora: no aparelho de quem está planejando, visível e editável na tela.
 *  Quando a decisão de negócio for tomada, o caminho é acrescentar a chave
 *  em `api/REGRAS.md` e à lista fechada de `PUT /api/config` — e este
 *  arquivo vira só um cache.
 */
import type { ConfigPlanejamento, ModoPlanejamento } from '../../domain/capacidade';

const CHAVE = 'marquesa_planejamento_v1';

const MODOS: ModoPlanejamento[] = ['conservador', 'equilibrado', 'agressivo'];

/** Lê o que foi guardado. `null` quando não há nada — quem chama decide o
 *  padrão, porque o tamanho alvo padrão depende do histórico de maletas e
 *  este módulo não conhece o estado. */
export function lerPlanejamento(): ConfigPlanejamento | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const c: unknown = JSON.parse(bruto);
    if (!c || typeof c !== 'object') return null;
    const { modo, tamanhoAlvo, tamanhoAlvoConfirmado } = c as Partial<ConfigPlanejamento>;
    if (!MODOS.includes(modo as ModoPlanejamento)) return null;
    if (typeof tamanhoAlvo !== 'number' || !Number.isFinite(tamanhoAlvo) || tamanhoAlvo < 1) {
      return null;
    }
    return {
      modo: modo as ModoPlanejamento,
      tamanhoAlvo: Math.round(tamanhoAlvo),
      tamanhoAlvoConfirmado: tamanhoAlvoConfirmado === true,
    };
  } catch {
    /* localStorage bloqueado não pode derrubar a tela — ela só volta a
       usar o padrão derivado do histórico. */
    return null;
  }
}

export function gravarPlanejamento(c: ConfigPlanejamento): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(c));
  } catch {
    /* idem */
  }
}
