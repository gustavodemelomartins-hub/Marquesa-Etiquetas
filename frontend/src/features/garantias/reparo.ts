import { baseSku, normSku } from '../estoque-total/normalizarSku';
import { ENCERRADOS } from './tipos';
import type { ProdutoDoEstado } from '../vendas/tipos';

/** O que a tela do CASO decide sozinha — e só isso. Mora fora do
 *  componente porque Início, ficha da cliente e Garantias abrem o MESMO caso,
 *  e a hierarquia das ações precisa de teste sem montar tela nenhuma.
 *
 *  Nenhuma regra de negócio nova: quem recusa uma mudança de status continua
 *  sendo o servidor (`mudarStatusGarantia`). Aqui só se escolhe qual botão
 *  é o principal, e se esconde o que o servidor já recusaria. */

export interface AcaoDoCaso {
  status: string;
  rotulo: string;
  /** Uma linha embaixo do rótulo, quando o rótulo sozinho não diz o efeito. */
  ajuda?: string;
}

export interface AcoesDoCaso {
  principal: AcaoDoCaso | null;
  secundarias: AcaoDoCaso[];
  destrutiva: AcaoDoCaso | null;
}

const A = {
  reparada: { status: 'reparada', rotulo: 'Reparada · aguardando entrega' },
  sem_conserto: { status: 'sem_conserto', rotulo: 'Sem conserto · troca autorizada' },
  devolvida: { status: 'devolvida', rotulo: 'Peça devolvida', ajuda: 'entregue à cliente; encerra o caso' },
  concluida: { status: 'concluida', rotulo: 'Concluir', ajuda: 'encerra o caso' },
  em_reparo: { status: 'em_reparo', rotulo: 'Voltar para reparo' },
  cancelada: { status: 'cancelada', rotulo: 'Cancelar caso' },
} satisfies Record<string, AcaoDoCaso>;

/** A ordem por importância, status a status.
 *
 *  - **em reparo**: o próximo passo natural é a peça ficar pronta.
 *  - **reparada**: falta entregar.
 *  - **sem conserto**: com a troca feita, falta concluir; sem a troca, o
 *    próximo passo é a TROCA (o painel dela), e nenhum status compete com ela.
 *  - **troca registrada**: o servidor recusa voltar a reparo e cancelar
 *    ("estorne a troca antes") — os dois botões nem aparecem.
 *  - **encerrado**: de estado terminal não se sai (5.4e). Nada. */
export function acoesDoCaso(g: { status: string; troca?: unknown | null }): AcoesDoCaso {
  if (ENCERRADOS.includes(g.status)) return { principal: null, secundarias: [], destrutiva: null };
  const comTroca = !!g.troca;
  switch (g.status) {
    case 'em_reparo':
      return {
        principal: A.reparada,
        secundarias: comTroca ? [A.devolvida, A.concluida] : [A.sem_conserto, A.devolvida, A.concluida],
        destrutiva: comTroca ? null : A.cancelada,
      };
    case 'reparada':
      return {
        principal: A.devolvida,
        secundarias: comTroca ? [A.concluida] : [A.concluida, A.sem_conserto, A.em_reparo],
        destrutiva: comTroca ? null : A.cancelada,
      };
    case 'sem_conserto':
      return comTroca
        ? { principal: A.concluida, secundarias: [A.devolvida], destrutiva: null }
        : { principal: null, secundarias: [A.em_reparo, A.devolvida, A.concluida], destrutiva: A.cancelada };
    default:
      return { principal: null, secundarias: [], destrutiva: null };
  }
}

/** Mostrar o painel da troca? Só quando ele é o assunto: já houve troca, ou
 *  a peça foi declarada sem conserto. Num caso em reparo ele era um quinto
 *  botão competindo com os outros. */
export function mostraTroca(g: { status: string; troca?: unknown | null }): boolean {
  return !!g.troca || g.status === 'sem_conserto';
}

const EVENTO: Readonly<Record<string, string | undefined>> = {
  aberta: 'Caso aberto',
  status: 'Situação alterada',
  devolvida: 'Peça devolvida',
  cancelada: 'Caso cancelado',
  troca: 'Troca registrada',
  troca_estornada: 'Troca desfeita',
  diferenca_paga: 'Diferença paga',
  diferenca_pagamento_desfeito: 'Pagamento da diferença desfeito',
  reaberta_em_novo_caso: 'A peça voltou: novo caso aberto',
  status_corrigido: 'Situação corrigida',
  ajuste: 'Registro corrigido',
};

/** O título de uma linha do histórico. O rótulo do status, quando o evento
 *  mudou o status; senão a tradução do tipo. Tipo desconhecido vira
 *  "Registro" — nunca o identificador cru do banco. */
export function rotuloDoEvento(e: { tipo: string; statusRotulo: string | null }): string {
  if (e.tipo === 'aberta') return 'Caso aberto';
  return e.statusRotulo ?? EVENTO[e.tipo] ?? 'Registro';
}

/** A peça do caso no catálogo que `GET /api/state` já trouxe — para a
 *  MINIATURA. Primeiro o código exato; depois a mesma peça de outra remessa
 *  (`120029-2` → `120029`), que tem a mesma foto. Não acha: `null`, e quem
 *  desenha usa o ícone de sempre. Nenhuma imagem de fora é procurada. */
export function produtoDaGarantia(
  produtos: readonly ProdutoDoEstado[] | null | undefined,
  sku: string | null | undefined,
): ProdutoDoEstado | null {
  if (!produtos?.length || !sku) return null;
  const n = normSku(sku);
  const exato = produtos.find((p) => normSku(p.sku) === n);
  if (exato) return exato;
  const b = baseSku(sku);
  return produtos.find((p) => baseSku(p.sku) === b) ?? null;
}
