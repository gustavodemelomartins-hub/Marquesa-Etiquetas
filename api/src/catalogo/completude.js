/** "Esta peça está pronta?" — a resposta, uma vez só.
 *
 *  A auditoria da Fase 4.5 encontrou QUATRO definições de peça completa, e
 *  elas discordavam entre si:
 *
 *    fotos.js › pendenciasDePublicacao      preço NULL bloqueia, preço 0 passa
 *    publicacao-catalogo.js › faltasBasicas preço 0 bloqueia
 *    sync.js › analisarSincronizacao        preço NULL bloqueia, preço 0 passa
 *    painel legado › LISTAS_PUB             a sua própria
 *
 *  O efeito prático: a mesma peça aparecia como "pronta para publicar" numa
 *  tela e "falta preço" na outra. Não era bug de nenhuma delas — era a
 *  ausência de um dono para a pergunta.
 *
 *  Este módulo é esse dono. Quem quiser saber o que falta numa peça chama
 *  aqui; ninguém mais decide.
 *
 *  ── A distinção que este arquivo existe para fazer ──────────────────────
 *
 *  `faltas` e `bloqueios` são listas SEPARADAS, e misturá-las foi o que
 *  travou a fase inteira antes:
 *
 *    faltas     trabalho humano que alguém pode fazer hoje — dar nome,
 *               escolher categoria, definir preço, tirar a foto.
 *    bloqueios  o que o sistema não consegue fazer porque uma peça de
 *               infraestrutura não existe neste ambiente — R2 desabilitado,
 *               preparador não configurado.
 *
 *  A auditoria mostrou por que isso importa: `foto_tratada_key` era exigida
 *  para sair de "em preparação", e produção não tem R2 para preenchê-la.
 *  Logo NENHUMA peça podia alcançar "aguardando aprovação" — a publicação
 *  não estava esperando o executor, estava bloqueada dois passos antes dele,
 *  e a tela dizia "falta fundo branco" como se fosse trabalho da Sthefany.
 */
import { normSku } from '../sku.js';

/** A sentinela de "sem categoria". É uma LINHA em `categorias`, com
 *  `sentinela = 1`, e não um nome mágico espalhado pelo código — mas o
 *  nome precisa existir como constante porque `produtos.cat` guarda o nome,
 *  não o id (ver o § 5 do desenho: a PK continua sendo o nome). */
export const SEM_CATEGORIA = 'Sem categoria';

/** As faltas possíveis, nomeadas. A tela usa estes códigos; mudá-los é
 *  mudar contrato. */
export const FALTA = {
  NOME: 'nome',
  CATEGORIA: 'categoria',
  PRECO: 'preco',
  QUANTIDADE: 'quantidade',
  FOTO: 'foto',
};

export const BLOQUEIO = {
  SEM_R2: 'sem_r2',
  SEM_PREPARADOR: 'sem_preparador',
  FOTO_NAO_PREPARADA: 'foto_nao_preparada',
};

const texto = (v) => String(v == null ? '' : v).trim();

/** O nome é da peça ou é o próprio código repetido?
 *
 *  Compara NORMALIZADO dos dois lados porque `desc` de importação vem com o
 *  código escrito de qualquer jeito — `br1234`, `BR 1234` — e a pergunta
 *  "isto é um nome ou é o código de novo?" não deveria depender de
 *  maiúscula. */
export function temNome(peca) {
  const desc = texto(peca?.desc);
  if (!desc) return false;
  return normSku(desc) !== normSku(peca?.sku);
}

/** Categoria de verdade ≠ ausência de categoria.
 *
 *  `'Outros'` é categoria REAL (decisão de 10/09/2026). Ela era usada como
 *  código para "não sei" em três lugares, e o efeito era que uma peça
 *  legitimamente "Outros" ficava incompleta para sempre — não havia como
 *  sair de lá, porque a própria escolha certa era lida como pendência. */
export function temCategoria(peca, { sentinelas } = {}) {
  const cat = texto(peca?.cat);
  if (!cat) return false;
  if (cat === SEM_CATEGORIA) return false;
  /* Quando quem chama conseguiu ler a tabela, a sentinela é o que a tabela
     disser — não o literal acima. O literal é o fallback para o caminho que
     não tem a lista à mão. */
  if (sentinelas && sentinelas.has(cat)) return false;
  return true;
}

/** §24 mais a decisão de 10/09/2026 sobre preço zero.
 *
 *  `NULL` é "sem preço" e sempre bloqueou. `0` é o caso novo: a peça pode
 *  EXISTIR com preço zero (rascunho, peça incompleta, brinde ainda sem
 *  política), mas não é vendável nem publicável. As duas situações produzem
 *  a mesma falta porque, do ponto de vista de publicar, elas são a mesma
 *  coisa: não há preço para anunciar. */
export function temPreco(peca) {
  const p = peca?.preco;
  if (p == null) return false;
  return Number(p) > 0;
}

/** "Em casa" — o total menos o que está consignado em maleta aberta.
 *  Publicar o que está na mão de uma revendedora anunciaria peça que não
 *  está aqui para despachar. */
export function temQuantidade(peca) {
  return Number(peca?.casa ?? 0) > 0;
}

/** Existe imagem em ALGUM lugar?
 *
 *  Três camadas respondem a pergunta, e a ordem é a de precedência: a nossa
 *  vence, depois o endereço anotado, depois o espelho da vitrine. Para o
 *  gate de completude, qualquer uma serve — a pergunta aqui é "a peça tem
 *  como ser mostrada?", não "os bytes são nossos?". Quem precisa da segunda
 *  pergunta usa `fotoPropria`. */
export function temFoto(peca) {
  return !!(peca?.temFotoPropria || peca?.foto_original_key || peca?.foto_tratada_key
    || peca?.foto_url || peca?.temFotoDaLoja);
}

/** A foto já passou pelo preparo (fundo branco)?
 *
 *  Isto NÃO é falta. É objetivo do pipeline, e a ausência dele vira
 *  bloqueio — ver o cabeçalho. */
export function temFotoPreparada(peca) {
  return !!(peca?.temFotoPreparadaPropria || peca?.foto_tratada_key);
}

/** O veredito.
 *
 *  `capacidades` descreve o AMBIENTE, não a peça: `{ temR2, temPreparador }`.
 *  Sem ele, nada é bloqueado por infraestrutura — o que é o comportamento
 *  certo para quem só quer saber o que a pessoa precisa fazer.
 */
export function faltasDaPeca(peca, capacidades = {}) {
  const faltas = [];
  if (!temNome(peca)) faltas.push(FALTA.NOME);
  if (!temCategoria(peca, capacidades)) faltas.push(FALTA.CATEGORIA);
  if (!temPreco(peca)) faltas.push(FALTA.PRECO);
  if (!temQuantidade(peca)) faltas.push(FALTA.QUANTIDADE);
  if (!temFoto(peca)) faltas.push(FALTA.FOTO);

  const bloqueios = [];
  if (!temFotoPreparada(peca)) {
    /* A MESMA ausência, dois nomes, e a diferença é quem pode resolver:
       sem R2 no ambiente ninguém consegue preparar foto nenhuma; com R2 e
       sem preparador, falta configurar o serviço; com os dois, é só a foto
       desta peça que ainda não passou. */
    if (capacidades.temR2 === false) bloqueios.push(BLOQUEIO.SEM_R2);
    else if (capacidades.temPreparador === false) bloqueios.push(BLOQUEIO.SEM_PREPARADOR);
    else if (temFoto(peca)) bloqueios.push(BLOQUEIO.FOTO_NAO_PREPARADA);
  }

  return { faltas, bloqueios };
}

/** Pronta para PUBLICAR é a ausência de faltas — e só isso.
 *
 *  Bloqueio de infraestrutura não entra: uma peça com nome, categoria,
 *  preço, estoque e foto está pronta do lado de cá. Se o ambiente não
 *  consegue preparar a imagem, isso é problema do ambiente e aparece
 *  separado, em vez de fazer a peça parecer incompleta. */
export function prontaParaPublicar(peca, capacidades = {}) {
  return faltasDaPeca(peca, capacidades).faltas.length === 0;
}

/** As capacidades do ambiente, lidas uma vez por requisição.
 *
 *  Fica aqui, e não em cada chamador, porque "o que este ambiente consegue
 *  fazer" é parte da resposta de completude — foi justamente a falta dessa
 *  noção que fez o sistema cobrar da Sthefany um trabalho que ele mesmo não
 *  tinha como aceitar. */
export function capacidadesDoAmbiente(config) {
  return {
    temR2: !!config?.fotos?.temR2,
    temPreparador: !!texto(config?.catalogo?.preparadorUrl),
  };
}

/** Os nomes das categorias sentinela, lidos da tabela.
 *
 *  Tolerante a banco sem a migration: sem a coluna, devolve o literal
 *  conhecido em vez de derrubar a leitura. Um ambiente atrasado continua
 *  respondendo, só não conhece sentinela nova. */
export async function sentinelasDeCategoria(db) {
  try {
    const { results } = await db.prepare(
      `SELECT nome FROM categorias WHERE sentinela = 1`).all();
    const nomes = (results ?? []).map((c) => c.nome);
    return new Set(nomes.length ? nomes : [SEM_CATEGORIA]);
  } catch {
    return new Set([SEM_CATEGORIA]);
  }
}
