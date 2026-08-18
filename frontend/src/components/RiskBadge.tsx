import type { RiskLevel } from '../types/reconciliation';
import { StatusBadge, type Tom } from './StatusBadge';

const TOM: Record<RiskLevel, Tom> = {
  trivial: 'neutro',
  confere: 'atencao',
  perigoso: 'critico',
  desconhecido: 'critico',
};

const ROTULO: Record<RiskLevel, string> = {
  trivial: 'Rotina',
  confere: 'Confira',
  perigoso: 'Perigoso',
  desconhecido: 'Não sei dizer',
};

/** O rótulo diz o que fazer, não o nome interno da categoria.
 *  "Não sei dizer" é honesto de propósito: quando o sistema não sabe qual
 *  número está certo, fingir confiança é o pior caminho. */
export function RiskBadge({ risco }: { risco: RiskLevel }) {
  return <StatusBadge tom={TOM[risco]}>{ROTULO[risco]}</StatusBadge>;
}

export { ROTULO as ROTULO_RISCO };
