import { chamar, type Connection } from '../../services/client';

/** §54 — AJUSTAR ESTOQUE (05/10/2026).
 *
 *  A Sthefany pediu "mexer na quantidade das peças". O que ela ganha não é
 *  um campo que sobrescreve o saldo: é dizer qual é a quantidade CERTA e
 *  por quê. O servidor calcula a diferença e grava um movimento `ajuste`
 *  com o motivo e os dois números — o histórico da peça explica a mudança
 *  para sempre (§19). */

/** A mesma lista de `api/src/estoque-comandos.js › MOTIVOS_DE_AJUSTE`. Os
 *  ids são o contrato; um id que o servidor não conhece é recusado com a
 *  lista certa dentro da recusa. */
export const MOTIVOS_DE_AJUSTE = [
  { id: 'correcao_cadastro', rotulo: 'Correção de cadastro' },
  { id: 'contagem_fisica', rotulo: 'Contagem física' },
  { id: 'erro_entrada', rotulo: 'Erro de entrada' },
  { id: 'ajuste_administrativo', rotulo: 'Ajuste administrativo' },
  { id: 'outro', rotulo: 'Outro', livre: true },
] as const;

export type IdDoMotivo = (typeof MOTIVOS_DE_AJUSTE)[number]['id'];

export interface PreviaDoAjuste {
  /** Inteiro ≥ 0 digitado, ou null enquanto o campo não é um número válido. */
  para: number | null;
  diferenca: number;
  emCasaAntes: number;
  emCasaDepois: number;
  /** O que impede confirmar, por extenso; null = pode confirmar. */
  bloqueio: string | null;
}

/** A conta que a tela mostra ANTES de gravar. É a mesma do servidor; o
 *  servidor confere de novo (e recusa se o saldo mudou no meio). */
export function previaDoAjuste(
  atual: number, consignado: number, texto: string, motivo: string, observacao: string,
): PreviaDoAjuste {
  const t = texto.trim();
  const n = t === '' ? NaN : Number(t);
  const para = Number.isInteger(n) && n >= 0 ? n : null;
  const emCasaAntes = atual - consignado;
  const base = { para, diferenca: para === null ? 0 : para - atual, emCasaAntes, emCasaDepois: para === null ? emCasaAntes : para - consignado };
  if (t === '') return { ...base, bloqueio: 'Digite a quantidade correta.' };
  if (para === null) return { ...base, bloqueio: 'A quantidade é um número inteiro, zero ou mais.' };
  if (para === atual) return { ...base, bloqueio: 'A quantidade correta é igual à atual — nada a ajustar.' };
  if (para < consignado) {
    return {
      ...base,
      bloqueio: `${consignado} ${consignado === 1 ? 'peça está' : 'peças estão'} com revendedoras: `
        + 'o total não pode ficar abaixo disso.',
    };
  }
  if (!motivo) return { ...base, bloqueio: 'Escolha o motivo.' };
  if (motivo === 'outro' && !observacao.trim()) return { ...base, bloqueio: 'Em "Outro", escreva o que aconteceu.' };
  return { ...base, bloqueio: null };
}

export interface RespostaDoAjusteDeEstoque {
  ok?: boolean;
  erro?: string;
  de?: number;
  para?: number;
  diferenca?: number;
  variacoes?: { nome: string; saldo: number }[];
}

export function ajustarEstoque(
  conexao: Connection,
  sku: string,
  corpo: { quantidadeAtual: number; quantidadeCorreta: number; motivo: string; observacao?: string; variacao?: string | null },
): Promise<RespostaDoAjusteDeEstoque> {
  return chamar(conexao, 'POST', `/api/produtos/${encodeURIComponent(sku)}/ajustar-estoque`, corpo);
}
