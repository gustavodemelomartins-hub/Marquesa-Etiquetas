import { chamar, type Connection } from '../../services/client';
import type { FilaDePublicacao, ItemDaFila, RascunhoDoSite } from './tipos';

/** As rotas da fila de publicação, e a que esta tela NÃO chama.
 *
 *    GET  /api/catalogo/publicacao                  a fila inteira
 *    POST /api/catalogo/publicacao/:sku/preparar    dispara a preparação
 *    POST /api/catalogo/publicacao/:sku/previa      salva o rascunho do site
 *    POST /api/catalogo/publicacao/:sku/aprovar     registra a aprovação
 *    POST /api/catalogo/publicacao/:sku/reabrir     volta para revisão
 *    POST /api/catalogo/publicacao/:sku/repetir     retry de uma falha
 *
 *  ── NÃO CHAMADA, DE PROPÓSITO ──────────────────────────────────────────
 *    POST /api/catalogo/publicacao/:sku/publicar
 *    POST /api/catalogo/publicacao/:sku/despublicar
 *    POST /api/catalogo/publicacao/rodada
 *
 *  Escrita na loja real continua PROIBIDA nesta trilha. As três existem no
 *  Worker e nenhuma é importada aqui — e é por isso que este comentário está
 *  neste arquivo e não numa página de documentação: quem for ligar a escrita
 *  passa por aqui.
 *
 *  O próprio servidor concorda: a fila devolve `escritaNaLojaHabilitada:
 *  false` e uma `decisaoPendente` em texto. A tela repete a palavra dele.
 */

export function buscarFila(
  conexao: Connection, sinal?: AbortSignal,
): Promise<FilaDePublicacao> {
  return chamar(conexao, 'GET', '/api/catalogo/publicacao', undefined, { signal: sinal });
}

export interface RespostaDaFila {
  ok?: boolean;
  erro?: string;
  item?: ItemDaFila;
  escritaNaLoja?: boolean;
  aviso?: string;
  /** 409 de "ainda falta": o servidor diz O QUÊ, em vez de só recusar. */
  faltam?: string[];
  estado?: string;
}

const emSku = (sku: string) => encodeURIComponent(sku);

/** Dispara a preparação. Tratamento de foto e geração de texto são serviços
 *  configuráveis: a ausência deles vira BLOQUEIO explícito na resposta, nunca
 *  falso sucesso. */
export function prepararPublicacao(
  conexao: Connection, sku: string,
): Promise<RespostaDaFila> {
  return chamar(conexao, 'POST', `/api/catalogo/publicacao/${emSku(sku)}/preparar`, {});
}

/** Salva a prévia — o texto que a loja vai mostrar. Ela é recusada enquanto
 *  faltar informação obrigatória, e a recusa vem com a lista do que falta. */
export function salvarPrevia(
  conexao: Connection, sku: string, rascunho: Partial<RascunhoDoSite>,
): Promise<RespostaDaFila> {
  return chamar(conexao, 'POST', `/api/catalogo/publicacao/${emSku(sku)}/previa`, rascunho);
}

/** Aprova. Só uma prévia COMPLETA, com todos os gates válidos, é aprovável —
 *  e a aprovação CAI sozinha se o dado mudar depois dela
 *  (`aprovacaoInvalidada`), o que é o ponto: aprovar um texto e publicar
 *  outro seria pior que não aprovar. */
export function aprovarPublicacao(
  conexao: Connection, sku: string, aprovadoPor = 'operador',
): Promise<RespostaDaFila> {
  return chamar(conexao, 'POST', `/api/catalogo/publicacao/${emSku(sku)}/aprovar`, { aprovadoPor });
}

export function reabrirPublicacao(
  conexao: Connection, sku: string,
): Promise<RespostaDaFila> {
  return chamar(conexao, 'POST', `/api/catalogo/publicacao/${emSku(sku)}/reabrir`, {});
}

/** Retry seguro de uma falha: o servidor PRESERVA a aprovação só quando a
 *  assinatura dos dados continua idêntica. */
export function repetirPublicacao(
  conexao: Connection, sku: string,
): Promise<RespostaDaFila> {
  return chamar(conexao, 'POST', `/api/catalogo/publicacao/${emSku(sku)}/repetir`, {});
}
