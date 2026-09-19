/** A identidade de uma linha de `venda_itens` — Fase 5.2.
 *
 *  Um módulo de uma função porque quatro lugares diferentes inserem item de
 *  venda (venda de balcão, acerto de maleta, pedido do site e troca de
 *  garantia) e nenhum deles deveria ter opinião própria sobre como um id
 *  nasce.
 *
 *  POR QUE A APLICAÇÃO GERA, E NÃO O BANCO
 *
 *  `registrarVenda` escreve os itens dentro de um `db.batch`, que é
 *  tudo-ou-nada e não devolve id por instrução. Um inteiro atribuído pelo
 *  SQLite só seria conhecido relendo a tabela — e reler pelo trio
 *  (venda_id, sku, variante_id) é exatamente o que deixou de identificar
 *  quando §27 passou a permitir duas linhas do mesmo código com preços
 *  diferentes. Gerando antes, quem monta a venda já sabe o nome de cada
 *  linha na hora de escrevê-la.
 *
 *  `MAX(id) + 1` foi descartado: duas vendas simultâneas leem o mesmo
 *  máximo e escrevem o mesmo id, e não há sequência no D1 para arbitrar.
 *
 *  O gatilho `venda_itens_id_ao_inserir` preenche o id de quem esquecer de
 *  chamar isto aqui. Ele é a garantia do banco, não a rota normal: quem usa
 *  esta função conhece o id ANTES da escrita, que é o ponto.
 */

/** UUID v4. `crypto.randomUUID` existe no runtime dos Workers e no Node 19+;
 *  o `fallback` cobre runtime antigo sem mudar o formato — o mesmo que o
 *  gatilho em SQL produz, para que as duas origens sejam indistinguíveis
 *  depois de gravadas. */
export function novoVendaItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Reconhece a forma, para que um teste possa afirmar "isto é um id de
 *  item" sem depender de qual dos dois geradores o produziu. */
export function ehVendaItemId(v) {
  return typeof v === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
}
