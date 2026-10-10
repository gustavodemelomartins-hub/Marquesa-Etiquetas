import { chamar, type Connection } from '../../services/client';
import type { AnuncioDaLoja, FilaDePublicacao, ItemDaFila, RascunhoDoSite } from './tipos';

/** As rotas da fila de publicação, e a que esta tela NÃO chama.
 *
 *    GET  /api/catalogo/publicacao                  a fila inteira
 *    POST /api/catalogo/publicacao/:sku/preparar    dispara a preparação
 *    POST /api/catalogo/publicacao/:sku/previa      salva o rascunho do site
 *    POST /api/catalogo/publicacao/:sku/aprovar     registra a aprovação
 *    POST /api/catalogo/publicacao/:sku/reabrir     volta para revisão
 *    POST /api/catalogo/publicacao/:sku/repetir     retry de uma falha
 *
 *    POST /api/nuvemshop/catalogo/:sku/publicar     §62: oculto → visível
 *    GET  /api/nuvemshop/catalogo/:sku/anuncio      §63: prévia, lida da loja
 *
 *  ── NÃO CHAMADA, DE PROPÓSITO ──────────────────────────────────────────
 *    POST /api/catalogo/publicacao/:sku/publicar
 *    POST /api/catalogo/publicacao/:sku/despublicar
 *    POST /api/catalogo/publicacao/rodada
 *
 *  As três são o caminho antigo da Fase 4.5 (cria e publica num passo, trava
 *  NUVEMSHOP_PUBLICACAO_ENABLED) e continuam fora da tela. O caminho de §62
 *  separa os atos: o sistema CADASTRA a peça oculta na loja (cron, com kill
 *  switch), e só o clique em "Publicar na Nuvemshop" a torna visível — depois
 *  de o servidor conferir tudo na própria loja.
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

export interface RespostaDaPublicacao {
  ok?: boolean;
  erro?: string;
  faltam?: string[];
  visibilidade?: string;
  confirmadoPelaLoja?: boolean;
}

/** §62 — "Publicar na Nuvemshop": oculto → visível. O servidor confere foto,
 *  nome, SKU, variantes, preço, estoque, descrição, SEO e categoria NA LOJA
 *  antes de trocar, e só responde ok quando a releitura confirma visível. */
export function publicarNaNuvemshop(
  conexao: Connection, sku: string, por = 'operador',
): Promise<RespostaDaPublicacao> {
  return chamar(conexao, 'POST', `/api/nuvemshop/catalogo/${emSku(sku)}/publicar`, { por });
}

/** §63 — o anúncio como a loja o tem AGORA: uma leitura, nenhuma escrita. */
export function lerAnuncio(
  conexao: Connection, sku: string, sinal?: AbortSignal,
): Promise<AnuncioDaLoja> {
  return chamar(conexao, 'GET', `/api/nuvemshop/catalogo/${emSku(sku)}/anuncio`, undefined, { signal: sinal });
}
