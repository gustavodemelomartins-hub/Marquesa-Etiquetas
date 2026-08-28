/** A categoria de uma peça, a partir do NOME dela.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  POR QUE ISTO PRECISOU EXISTIR
 *
 *  `produtos.cat` responde a pergunta para o que está no catálogo de hoje.
 *  Mas 833 das 1.341 linhas do histórico (62%, e 842 das 1.357 peças) são de
 *  peças que já saíram do catálogo — para elas não há `produtos.cat`.
 *
 *  O painel caía então em `vendas_historico_itens.tipo`, e isso estava
 *  errado: `tipo` é o MATERIAL (Prata 925, Aço Inox, Banhada, Bruto), não a
 *  categoria. A rosca "Distribuição por categoria vendida" mostrava
 *  "Banhada 445, Bruto 227, Prata 925 165" ao lado de "Brinco 153" —
 *  duas dimensões diferentes somadas no mesmo total, e um gráfico que não
 *  respondia a pergunta que o título fazia.
 *
 *  O nome histórico resolve, porque ele começa pela categoria:
 *  "Brinco Maxi Orgânico…", "Colar Cordão Baiano…", "Anel Losangos…".
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  UMA TABELA, DOIS LUGARES — e um teste que impede a divergência
 *
 *  A mesma tabela existe no painel legado (`CAT_MAP` em
 *  `src/dashboard.tpl.html`), onde ela classifica a planilha de etiquetas no
 *  navegador, sem rede. Não dá para o navegador importar este módulo, e
 *  mover aquele fluxo para o servidor está fora do escopo desta rodada.
 *
 *  Em vez de fingir que a duplicação não existe, ela é DECLARADA e
 *  VERIFICADA: `src/categoria-nome-test.mjs` lê o `CAT_MAP` do template e
 *  compara entrada por entrada com este arquivo. As duas tabelas não podem
 *  divergir em silêncio — divergiram, o teste falha.
 *
 *  Para relatório, a fonte da verdade é ESTE arquivo.
 */

/** A primeira palavra do nome, sem acento nem pontuação. É onde a categoria
 *  mora em 100% do catálogo conferido. */
function primeiraPalavra(desc) {
  return String(desc || '').trim().toLowerCase()
    .split(/[\s,\-]+/)[0]
    .replace(/[^a-zà-ú]/gi, '');
}

/** Palavra → categoria. Inclui os erros de digitação que existem de verdade
 *  na planilha (`binco`, `piecing`) — corrigir a grafia na origem não é
 *  opção, porque o texto original é o dado. */
export const CAT_MAP = {
  colar: 'Colar', colares: 'Colar', corrente: 'Colar', cordão: 'Colar', cordao: 'Colar',
  choker: 'Colar', gargantilha: 'Colar', escapulário: 'Colar', escapulario: 'Colar',
  brinco: 'Brinco', brincos: 'Brinco', binco: 'Brinco', bincos: 'Brinco',
  trio: 'Brinco', duo: 'Brinco', dupla: 'Brinco', piercing: 'Brinco', piecing: 'Brinco',
  argola: 'Argola', argolas: 'Argola',
  pulseira: 'Pulseira', pulseiras: 'Pulseira', bracelete: 'Pulseira', tornozeleira: 'Pulseira',
  berloque: 'Berloque', separador: 'Berloque',
  anel: 'Anel', aneis: 'Anel', anéis: 'Anel', aparador: 'Anel',
  pingente: 'Pingente',
  conjunto: 'Conjunto', conjuntos: 'Conjunto',
};

/** A categoria de um nome. `Outros` quando a primeira palavra não é
 *  conhecida — nunca um chute pela segunda palavra, que classificaria
 *  "Kit Brinco" como Brinco quando ele pode ser um conjunto. */
export function categoriaPeloNome(desc) {
  return CAT_MAP[primeiraPalavra(desc)] || 'Outros';
}

/** A categoria de um item de venda, na ordem de confiança:
 *  o catálogo de hoje primeiro (é cadastro, alguém decidiu), e o nome
 *  histórico depois (é leitura, mas é a categoria certa). `tipo` NUNCA
 *  entra aqui — ele é material. */
export function categoriaDoItem({ catCatalogo = null, nomeHistorico = null } = {}) {
  if (catCatalogo) return catCatalogo;
  if (nomeHistorico) return categoriaPeloNome(nomeHistorico);
  return 'Outros';
}
