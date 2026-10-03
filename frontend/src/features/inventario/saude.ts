/** "Saúde do estoque" — o primeiro dos três contextos do Inventário.
 *
 *  Quem decide se venceu é o servidor (`GET /api/state › inventario`, com o
 *  prazo de `config.inventarioDias`); aqui só se escolhe COMO dizer. Até
 *  03/10/2026 o card mostrava ícone verde ao lado de "Conferência vencida".
 *
 *  Hierarquia:
 *   - ok        → conferido dentro do prazo (aparência positiva);
 *   - atencao   → perto de vencer, ou NUNCA houve inventário real concluído
 *                 (ausência de divergência registrada não é estoque saudável);
 *   - vencida   → passou do prazo: ação necessária, alerta, nunca verde;
 *   - carregando→ o resumo ainda não chegou; não afirma nada.
 */
import { fmtData, plural } from '../../domain/formato';

export type NivelDeSaude = 'ok' | 'atencao' | 'vencida' | 'carregando';

export interface ResumoDoInventario {
  diasDesde?: number | null;
  prazoDias?: number | null;
  vencido?: boolean;
  ultimoEm?: string | null;
}

export interface Saude { nivel: NivelDeSaude; titulo: string; detalhe: string }

/** Prazo do servidor quando o resumo não o traz — o mesmo default de `state.js`. */
const PRAZO_PADRAO = 45;

/** A janela de "perto de vencer": os últimos 7 dias do prazo, ou um quarto
 *  dele quando o prazo é curto (prazo de 7 dias não pode passar a semana
 *  inteira em atenção). */
const janelaDeAtencao = (prazo: number) => Math.min(7, Math.ceil(prazo / 4));

export function saudeDoEstoque(resumo: ResumoDoInventario | null | undefined): Saude {
  if (!resumo) return { nivel: 'carregando', titulo: 'Saúde do estoque', detalhe: '—' };
  const { diasDesde } = resumo;
  if (diasDesde == null) {
    return { nivel: 'atencao', titulo: 'Primeira conferência pendente', detalhe: 'Nenhum inventário concluído ainda' };
  }
  const prazo = resumo.prazoDias && resumo.prazoDias > 0 ? resumo.prazoDias : PRAZO_PADRAO;
  const ultima = resumo.ultimoEm ? `Última em ${fmtData(resumo.ultimoEm)}` : 'Última conferência';
  if (resumo.vencido || diasDesde >= prazo) {
    return {
      nivel: 'vencida', titulo: 'Conferência vencida',
      detalhe: `${ultima} · ${diasDesde} ${plural(diasDesde, 'dia', 'dias')} (prazo ${prazo})`,
    };
  }
  const restam = prazo - diasDesde;
  if (restam <= janelaDeAtencao(prazo)) {
    return {
      nivel: 'atencao', titulo: 'Conferência perto de vencer',
      detalhe: `${ultima} · vence em ${restam} ${plural(restam, 'dia', 'dias')}`,
    };
  }
  return {
    nivel: 'ok', titulo: 'Estoque conferido',
    detalhe: `${ultima} · ${diasDesde === 0 ? 'hoje' : `há ${diasDesde} ${plural(diasDesde, 'dia', 'dias')}`}`,
  };
}
