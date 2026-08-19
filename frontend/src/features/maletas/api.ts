/** As chamadas de maleta. Nenhuma regra nova: são exatamente os endpoints
 *  que o painel legado já usa.
 *
 *  ------------------------------------------------------------------
 *  LACUNA CONHECIDA — criação em dois passos
 *
 *  Não existe hoje um endpoint que crie a maleta JÁ com as peças. O
 *  backend expõe:
 *
 *      POST /api/maletas            cria a maleta vazia
 *      POST /api/maletas/:id/itens  consigna as peças, uma validação por
 *                                   SKU, devolvendo `recusados`
 *
 *  Ou seja: se a segunda chamada recusar peça, a maleta já existe e ficou
 *  aberta e vazia (ou parcial). Isso NÃO é corrompido — a maleta vazia é
 *  legítima, `POST /api/maletas/:id/cancelar` a desfaz (§28), e nenhum
 *  movimento de estoque foi gravado para o que não entrou. Mas o fluxo
 *  precisa contar isso à pessoa em vez de dizer "criada" e ficar quieto
 *  (regra 9 do CLAUDE.md).
 *
 *  A alternativa seria inventar `POST /api/maletas {itens}` atômico. Não
 *  foi feito: mexer no contrato de escrita de estoque exige decisão humana,
 *  e o caminho existente já é seguro. A lacuna está registrada em
 *  docs/TECH_DEBT.md.
 *  ------------------------------------------------------------------
 *
 *  A validação de "cabe no estoque?" é do SERVIDOR (`adicionarItens` recusa
 *  `qtd > disponivel`). A tela também confere antes de enviar, mas é uma
 *  cortesia para não gastar uma ida ao servidor — a palavra final é dele.
 */
import { chamar, type Connection } from '../../services/client';
import type { Reseller, Suitcase } from '../../types/api';

export interface MaletaCriada {
  id: number;
  revId: number;
  status: Suitcase['status'];
  abertaEm: string | null;
  acertoEm: string | null;
  itens: Record<string, number>;
}

export interface ItemRecusado {
  sku: string;
  desc?: string;
  motivo: string;
}

export interface RespostaItens {
  ok: true;
  adicionados: number;
  recusados: ItemRecusado[];
}

export function criarMaleta(
  conexao: Connection,
  dados: { revId: number; abertaEm?: string | null; acertoEm?: string | null; obs?: string | null },
): Promise<MaletaCriada> {
  return chamar<MaletaCriada>(conexao, 'POST', '/api/maletas', {
    revId: dados.revId,
    abertaEm: dados.abertaEm ?? null,
    acertoEm: dados.acertoEm ?? null,
    obs: dados.obs ?? null,
  });
}

export function adicionarItens(
  conexao: Connection,
  maletaId: number,
  itens: Record<string, number>,
): Promise<RespostaItens> {
  return chamar<RespostaItens>(conexao, 'POST', `/api/maletas/${maletaId}/itens`, { itens });
}

export function criarRevendedora(
  conexao: Connection,
  dados: { nome: string; tel?: string; cidade?: string; obs?: string },
): Promise<Reseller> {
  return chamar<Reseller>(conexao, 'POST', '/api/revendedoras', dados);
}
