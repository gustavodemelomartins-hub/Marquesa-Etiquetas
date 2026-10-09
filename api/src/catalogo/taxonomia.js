/** §64 — A TAXONOMIA DA LOJA, numa fonte só.
 *
 *  Duas perguntas que o sistema fazia a uma pessoa e que os dados já
 *  respondem: "que atributo é este valor?" e "em que categoria da loja esta
 *  peça entra?". Cada uma tem UMA resposta aqui; quem precisa dela chama.
 *
 *  ── Atributos — o que a auditoria de 09/10/2026 achou na loja ───────────
 *
 *    "Cor"      673 valores: 640 são o BANHO (Banho de Ouro 18k, Prata 925,
 *               Banho de Prata, Ródio) e 33 são cor de pedra em peça sem
 *               banho variável. É a convenção da loja desde sempre, e a
 *               vitrine e os filtros dela são construídos sobre ela.
 *    "Tamanho"  119 valores, todos aro (n°18) ou comprimento (18cm).
 *    "Cores"    22 valores: a cor da pedra quando "Cor" já é o banho.
 *
 *  Logo a taxonomia canônica desta loja é:
 *
 *    aro, comprimento        → Tamanho
 *    cor de pedra/esmalte    → Cor   (ou "Cores", quando "Cor" já é o banho)
 *    banho/material          → Cor   (convenção da loja; NÃO se cria um
 *                                     terceiro atributo "Acabamento")
 *
 *  Renomear "Cor" para "Acabamento" nos ~600 anúncios seria um segundo
 *  conceito concorrente com o que a loja inteira usa, e a API da Nuvemshop
 *  não documenta renomear atributo de produto existente. Fica registrado
 *  como decisão, não como pendência.
 *
 *  O que é ERRO, e se corrige sozinho: o valor contradiz o atributo.
 *  "Tamanho = Azul" (a tela gravava "Tamanho" por padrão) vira "Cor";
 *  "Cor = nº19" vira "Tamanho". Valor que não se reconhece (ex.: "Casal de
 *  Filhos") não é tocado: na dúvida, o atributo fica como está.
 *
 *  ── Categorias — a árvore da loja em 09/10/2026 ──────────────────────────
 *
 *    Anel · Brinco (Brincos, Trio e Duplas, Piercing) · Berloque · Colar ·
 *    Pulseira (Bracelete) · Infantil · Masculino · Prata 925 (…, Conjuntos) ·
 *    Raizes · Essência · Coleções · Presentes
 *
 *  Não existe "Argola" nem "Pingente" na loja. Argola é brinco (é onde a
 *  vitrine a mostra). Pingente Menino/Menina é da linha Raizes — todos os
 *  publicados estão lá. Conjunto só tem categoria em Prata 925; conjunto
 *  banhado a ouro não tem casa na loja, e isso é decisão de gente.
 */
import { normalizar } from './texto-site.js';
import { chaveDaVariacao } from '../variacao-nome.js';

/* ======================================================================== */
/* ATRIBUTOS                                                                 */
/* ======================================================================== */

const COR_DE_PEDRA = /^(azul|cristal|vermelh|verde|pink|rosa|roxo|lilas|marsala|pret[oa]|branc[oa]|amarel|incolor|colorid|turquesa|laranja|nude|champagne|fume|esmeralda|rubi|safira|ametista|bordo|vinho|cinza|bege|marrom|lavanda|menta|coral|madreperola|multicolor)/;
const ACABAMENTO = /(banho|prata 925|rodio|aco inox|ouro 18|folhead|ouro branco|ouro rose)/;

/** O que um valor de variação É — ou `null` quando não se sabe.
 *
 *    aro          n°18, nº 19, N19, Aro 19, 19
 *    comprimento  18cm, 45 cm
 *    acabamento   Banho de Ouro 18k, Prata 925, Banho de Ródio Branco
 *    cor          Azul, Verde Esmeralda, Cristal, Pink */
export function tipoDoValor(valor) {
  const s = normalizar(valor);
  if (!s) return null;
  if (/^\d{1,3}([.,]\d)?\s*cm$/.test(s)) return 'comprimento';
  if (/^\d{1,2}$/.test(chaveDaVariacao(valor))) return 'aro';
  if (ACABAMENTO.test(s)) return 'acabamento';
  if (COR_DE_PEDRA.test(s)) return 'cor';
  return null;
}

const EH_TAMANHO = /^(tamanho|tam|aro|numero|num|medida)\b/;
const EH_COR = /^(cor|cores)\b/;

/** O atributo certo para um conjunto de valores que hoje está em `nome`.
 *  Só muda quando TODOS os valores contradizem o atributo — um valor que
 *  não se reconhece deixa tudo como está. Devolve o nome (igual ao de
 *  entrada quando nada há a corrigir). */
export function atributoCanonico(nome, valores = []) {
  const atual = String(nome || '').trim();
  const n = normalizar(atual);
  const tipos = (valores || []).map(tipoDoValor);
  if (!tipos.length || tipos.some((t) => t == null)) return atual;
  if (EH_TAMANHO.test(n) && tipos.every((t) => t === 'cor' || t === 'acabamento')) return 'Cor';
  if (EH_COR.test(n) && tipos.every((t) => t === 'aro' || t === 'comprimento')) return 'Tamanho';
  return atual;
}

/** O atributo de uma variação NOVA, quando ninguém disse qual. Antes era
 *  sempre "Tamanho" — foi assim que "Tamanho = Azul" nasceu. */
export function atributoPadrao(valor) {
  const t = tipoDoValor(valor);
  return t === 'cor' || t === 'acabamento' ? 'Cor' : 'Tamanho';
}

/** Normaliza uma estrutura `[{ nome, valores }]` (a de `combinar`): cada
 *  atributo cujo conteúdo o contradiz ganha o nome certo — desde que o
 *  nome certo não esteja já em uso por outro atributo do mesmo produto (a
 *  loja recusa dois atributos com o mesmo nome). */
export function normalizarAtributos(atributos = []) {
  const nomes = atributos.map((a) => a.nome);
  const trocas = [];
  const saida = atributos.map((a, i) => {
    const certo = atributoCanonico(a.nome, a.valores);
    if (certo === a.nome) return a;
    const ocupado = nomes.some((x, j) => j !== i && normalizar(x) === normalizar(certo));
    if (ocupado) return a;
    nomes[i] = certo;
    trocas.push({ de: a.nome, para: certo, valores: [...a.valores] });
    return { ...a, nome: certo };
  });
  return { atributos: saida, trocas };
}

/* ======================================================================== */
/* CATEGORIAS                                                                */
/* ======================================================================== */

/** Primeira palavra do nome → tipo. Para peça em "Outros"/"Sem categoria". */
const TIPO_PELO_NOME = [
  [/^(anel|aneis)\b/, 'anel'],
  [/^(brinco|brincos|piercing|ear cuff|trio|dupla)\b/, 'brinco'],
  [/^(argola|argolas)\b/, 'argola'],
  [/^(colar|colares|choker|gargantilha|corrente|cordao|escapulario)\b/, 'colar'],
  [/^(pulseira|pulseiras|bracelete|braceletes)\b/, 'pulseira'],
  [/^(berloque|berloques)\b/, 'berloque'],
  [/^(pingente|pingentes)\b/, 'pingente'],
  [/^(conjunto|conjuntos)\b/, 'conjunto'],
];

/** Categoria daqui (ou o tipo tirado do nome) → categoria da loja.
 *  `regra` é o porquê, em português, para a tela e o relatório. */
function destinoDoTipo(tipo, nomeNormal) {
  switch (tipo) {
    case 'anel': case 'brinco': case 'colar': case 'pulseira': case 'berloque':
      return { chave: tipo, regra: `"${tipo}" tem categoria própria na loja` };
    case 'argola':
      return { chave: 'brinco', regra: 'Argola é brinco na loja (Brinco › Brincos)' };
    case 'pingente':
      if (/^pingentes?( e separador)? menin[oa]\b/.test(nomeNormal)) {
        return { chave: 'raizes', regra: 'Pingente Menino/Menina é da linha Raizes, onde estão todos os publicados' };
      }
      return null;
    case 'conjunto':
      if (/prata 925/.test(nomeNormal)) return { chave: 'prata 925/conjuntos', regra: 'Conjunto de prata 925 vai em Prata 925 › Conjuntos' };
      return null;
    default:
      return null;
  }
}

/** A categoria da loja para uma peça — `{ id, chave, regra }`, ou
 *  `{ id: null, motivo }` quando não dá para saber com segurança.
 *
 *  `mapa`: chave normalizada → id (`mapearCategorias`), com subcategorias
 *  como "pai/filho". A categoria daqui manda; "Outros" e "Sem categoria"
 *  caem no nome. */
export function categoriaCanonica(peca, mapa) {
  const nome = normalizar(peca?.desc ?? peca?.nome ?? '');
  const cat = normalizar(peca?.cat ?? peca?.categoria ?? '');
  const SINGULAR = { aneis: 'anel', brincos: 'brinco', argolas: 'argola', colares: 'colar', pulseiras: 'pulseira',
    berloques: 'berloque', pingentes: 'pingente', conjuntos: 'conjunto' };
  let tipo = cat && !['outros', 'sem categoria'].includes(cat) ? (SINGULAR[cat] || cat) : null;
  if (!tipo || !['anel', 'brinco', 'argola', 'colar', 'pulseira', 'berloque', 'pingente', 'conjunto'].includes(tipo)) {
    const pelo = TIPO_PELO_NOME.find(([re]) => re.test(nome));
    tipo = pelo ? pelo[1] : tipo;
  }
  const destino = destinoDoTipo(tipo, nome);
  if (!destino) {
    return { id: null, motivo: tipo
      ? `A loja não tem categoria para "${peca?.cat || tipo}" desta peça. Escolha uma.`
      : 'Não dá para saber a categoria pelo cadastro nem pelo nome. Escolha uma.' };
  }
  const id = mapa ? mapa[destino.chave] : undefined;
  if (mapa && !id) return { id: null, chave: destino.chave, motivo: `A categoria "${destino.chave}" não foi encontrada na loja.` };
  return { id: id ?? null, chave: destino.chave, regra: destino.regra };
}
