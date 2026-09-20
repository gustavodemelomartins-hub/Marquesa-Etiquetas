import type { Periodo, Recorte } from './analytics';

/** O recorte de tempo, e as três datas que ele NÃO confunde.
 *
 *  Mora em `domain/` porque Vendas, Financeiro e Estoque fazem a MESMA
 *  pergunta ao mesmo `/api/analytics/*`, e duas montagens do mesmo recorte
 *  divergem: uma tela diria "30 dias" e a outra "12 meses" com o mesmo
 *  rótulo na tela. `features/financeiro/periodo.ts` reexporta daqui.
 *
 *  Esta é a regra que o Financeiro inteiro obedece, e ela vem do backend,
 *  não desta tela:
 *
 *    DATA DA VENDA      quando a peça saiu. Recorta contagem de vendas,
 *                       de peças e de clientes.
 *    DATA DO PAGAMENTO  quando o dinheiro entrou. Recorta o FATURAMENTO.
 *    DATA DE REGISTRO   quando alguém lançou no sistema. Não recorta nada,
 *                       e por isso não aparece como filtro: ela é auditoria,
 *                       não operação.
 *
 *  Por isso "vendas" e "faturamento" no mesmo cartão podem discordar, e
 *  isso não é defeito — é a diferença entre vender e receber.
 */
export const ROTULOS: Record<Periodo, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
  '12m': '12 meses',
  tudo: 'Tudo',
};

export const PERIODOS: Periodo[] = ['7d', '30d', '90d', '12m', 'tudo'];

export const RECORTE_PADRAO: Recorte = { periodo: '30d', de: null, ate: null };

/** Um intervalo livre só vale quando os dois lados existem e estão em
 *  ordem. Meio intervalo silenciosamente ignorado é pior que uma recusa. */
export function intervaloValido(de: string | null, ate: string | null): boolean {
  if (!de || !ate) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return false;
  return de <= ate;
}

export function descreverRecorte(r: Recorte): string {
  if (intervaloValido(r.de, r.ate)) {
    const br = (iso: string) => iso.split('-').reverse().join('/');
    return `${br(r.de as string)} a ${br(r.ate as string)}`;
  }
  return ROTULOS[r.periodo];
}

/** O recorte vira e volta do endereço da tela, para um link de período
 *  poder ser colado para outra pessoa. */
export function recorteDaSub(sub: string | null): Recorte {
  if (!sub) return RECORTE_PADRAO;
  const [de, ate] = sub.split('~');
  if (intervaloValido(de ?? null, ate ?? null)) {
    return { periodo: 'tudo', de: de as string, ate: ate as string };
  }
  const p = PERIODOS.find((x) => x === sub);
  return p ? { periodo: p, de: null, ate: null } : RECORTE_PADRAO;
}

export function subDoRecorte(r: Recorte): string {
  return intervaloValido(r.de, r.ate) ? `${r.de}~${r.ate}` : r.periodo;
}
