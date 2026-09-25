/** O PROGRESSO DA CONFERÊNCIA — as contas, separadas da tela.
 *
 *  A regra que manda em tudo aqui, e que é o motivo de este arquivo existir
 *  em vez de umas somas soltas dentro do componente:
 *
 *      DURANTE a contagem, "não conferido" NÃO é "faltando".
 *
 *  Um gráfico de inventário é o lugar mais fácil do sistema para mentir. Se
 *  a barra medir "peças encontradas sobre peças esperadas", ela começa em 0%
 *  e sobe — e o vermelho que sobra ao lado parece perda. Não é: são peças
 *  que ninguém olhou ainda. Depois de vinte minutos de contagem a tela
 *  estaria dizendo "você perdeu 94% do estoque", que é falso e assustador.
 *
 *  Por isso a medida é COBERTURA, e a unidade é o CÓDIGO:
 *
 *      progresso = códigos visitados ÷ códigos a percorrer
 *
 *  Ela responde à única pergunta que quem está contando faz — *quanto falta
 *  percorrer* —, nunca passa de 100%, e não tem como sugerir divergência:
 *  visitar um código é um fato sobre a CONFERÊNCIA, não sobre o estoque.
 *
 *  As peças aparecem como número absoluto ao lado ("184 peças conferidas"),
 *  e de propósito sem denominador: contar 2 onde o sistema diz 3 é um
 *  resultado legítimo da contagem, e uma barra de "peças" ficaria eternamente
 *  abaixo de 100% em toda loja que tem uma única diferença — transformando
 *  a divergência em aparência de progresso incompleto.
 *
 *  O que é `esperado` já vem do servidor com a regra da casa aplicada: total
 *  menos consignado, sem kit e sem configuração montável. A tela não
 *  recalcula, e é isso que impede peça em maleta de reaparecer como falta.
 */

/** A linha do que se espera encontrar em casa, como o servidor manda
 *  (`api/src/inventario.js › SQL_ESPERADO`). */
export interface EsperadoDaContagem {
  sku: string;
  desc: string;
  cat: string | null;
  esperado: number;
}

/** Uma linha já contada. `contado` é absoluto, não incremento. */
export interface ContadoDaContagem {
  sku: string;
  contado: number;
  contadoEm: string;
}

/** O rótulo de quem não tem categoria. Uma string vazia viraria um chip sem
 *  nome, e agrupá-la com as outras esconderia o buraco de cadastro. */
export const SEM_CATEGORIA = 'Sem categoria';

export interface FatiaDoProgresso {
  /** A chave do filtro. `TODAS` é a fatia agregada. */
  cat: string;
  rotulo: string;
  /** Códigos a percorrer nesta categoria. */
  codigos: number;
  /** Códigos já visitados — contados com qualquer valor, zero inclusive. */
  visitados: number;
  /** Quanto do caminho foi percorrido, 0–100, inteiro. */
  pct: number;
  /** Peças que ela contou nesta categoria. Sem denominador, de propósito. */
  pecasContadas: number;
  /** O que o sistema diz haver em casa — o tamanho da prateleira, não uma
   *  meta que a contagem tenha de bater. */
  pecasEsperadas: number;
}

export const TODAS = '__todas__';

/** A categoria de uma linha, normalizada. */
const catDe = (p: { cat: string | null }) => (p.cat ?? '').trim() || SEM_CATEGORIA;

/**
 * AS CATEGORIAS VÊM DOS DADOS, nunca de uma lista escrita à mão.
 *
 * A fonte real é `produtos.cat` — a mesma coluna que o catálogo usa e que
 * `categorias.nome` referencia como chave estrangeira. Ela chega até aqui
 * dentro de `esperados`, que é a lista do que se conta: derivar os filtros
 * dela garante que nenhum chip aponte para uma categoria sem peça para
 * contar, e que nenhuma categoria contável fique sem chip.
 *
 * Uma constante `['Brincos','Anéis',…]` pareceria funcionar e erraria em
 * silêncio no dia em que a Sthefany criar "Tornozeleira" — e erraria
 * de novo em "Brinco" vs "Brincos", que são duas categorias diferentes de
 * propósito (ver `api/src/catalogo/categorias.js`).
 */
export function progressoDaContagem(
  esperados: EsperadoDaContagem[],
  contados: Map<string, ContadoDaContagem>,
): { total: FatiaDoProgresso; categorias: FatiaDoProgresso[] } {
  const porCat = new Map<string, FatiaDoProgresso>();
  const total: FatiaDoProgresso = {
    cat: TODAS, rotulo: 'Todos', codigos: 0, visitados: 0, pct: 0,
    pecasContadas: 0, pecasEsperadas: 0,
  };

  for (const p of esperados) {
    const cat = catDe(p);
    let f = porCat.get(cat);
    if (!f) {
      f = { cat, rotulo: cat, codigos: 0, visitados: 0, pct: 0, pecasContadas: 0, pecasEsperadas: 0 };
      porCat.set(cat, f);
    }
    const c = contados.get(p.sku);

    f.codigos += 1;
    f.pecasEsperadas += p.esperado;
    total.codigos += 1;
    total.pecasEsperadas += p.esperado;

    /* `c` existir é o que significa "visitado" — inclusive quando
       `contado` é 0, que é o gesto "conferi, não tem nenhuma". Tratar o
       zero como não visitado apagaria a única resposta que a contagem tem
       para uma prateleira vazia. */
    if (c) {
      f.visitados += 1;
      f.pecasContadas += c.contado;
      total.visitados += 1;
      total.pecasContadas += c.contado;
    }
  }

  const pct = (f: FatiaDoProgresso) => (f.codigos > 0 ? Math.round((f.visitados / f.codigos) * 100) : 0);
  total.pct = pct(total);
  const categorias = [...porCat.values()];
  for (const f of categorias) f.pct = pct(f);

  /* A ordem: o maior trabalho primeiro, e "Sem categoria" sempre por último.
     Quem abre a tela quer ver onde está o grosso da conferência, e o buraco
     de cadastro não pode disputar o topo com uma categoria de verdade. */
  categorias.sort((a, b) => {
    if ((a.cat === SEM_CATEGORIA) !== (b.cat === SEM_CATEGORIA)) return a.cat === SEM_CATEGORIA ? 1 : -1;
    return b.codigos - a.codigos || a.rotulo.localeCompare(b.rotulo, 'pt');
  });

  return { total, categorias };
}

/** A fatia que o filtro escolheu. `TODAS` devolve o agregado. */
export function fatiaSelecionada(
  p: { total: FatiaDoProgresso; categorias: FatiaDoProgresso[] }, cat: string,
): FatiaDoProgresso {
  if (cat === TODAS) return p.total;
  return p.categorias.find((f) => f.cat === cat) ?? p.total;
}

/** A lista da contagem, seguindo o filtro. Fora daqui para a tela não ter
 *  duas ideias de "o que é a categoria desta linha". */
export function filtrarPorCategoria<T extends { cat: string | null }>(
  linhas: T[], cat: string,
): T[] {
  if (cat === TODAS) return linhas;
  return linhas.filter((l) => catDe(l) === cat);
}

/* ────────────────────────────────────── a evolução da sessão */

export interface PontoDaEvolucao {
  /** Fim do balde, em milissegundos. */
  em: number;
  /** Peças contadas ATÉ aqui — acumulado, nunca a taxa. */
  acumulado: number;
}

/** A CURVA DO ACUMULADO, em baldes de tempo iguais.
 *
 *  Ela responde a "a contagem está andando?" — a pergunta de quem voltou do
 *  almoço, ou de quem está há uma hora nisso e quer ver que a pilha diminui.
 *  É acumulada, e não taxa por minuto: uma curva que sobe e desce pareceria
 *  um problema quando é só o ritmo normal de quem atende uma cliente no
 *  meio da contagem.
 *
 *  Com menos de dois momentos distintos não há curva nenhuma, e a tela não
 *  desenha um gráfico de um ponto só: devolve vazio, e quem chama omite a
 *  seção. Um eixo com um traço é ruído com aparência de informação.
 */
export function evolucaoDaSessao(
  contados: ContadoDaContagem[], baldes = 12,
): PontoDaEvolucao[] {
  const linhas = contados
    .map((c) => ({ em: Date.parse(c.contadoEm.includes('T') ? c.contadoEm : `${c.contadoEm.replace(' ', 'T')}Z`), qtd: c.contado }))
    .filter((l) => Number.isFinite(l.em))
    .sort((a, b) => a.em - b.em);

  if (linhas.length < 2) return [];
  const inicio = linhas[0]!.em;
  const fim = linhas[linhas.length - 1]!.em;
  if (fim <= inicio) return [];

  const passo = (fim - inicio) / baldes;
  const pontos: PontoDaEvolucao[] = [];
  let i = 0;
  let acumulado = 0;
  for (let b = 1; b <= baldes; b += 1) {
    const ate = inicio + passo * b;
    /* `b === baldes` fecha no `<=` para a última leitura nunca ficar de
       fora por arredondamento de ponto flutuante. */
    while (i < linhas.length && (b === baldes ? linhas[i]!.em <= ate : linhas[i]!.em < ate)) {
      acumulado += linhas[i]!.qtd;
      i += 1;
    }
    pontos.push({ em: ate, acumulado });
  }
  return pontos;
}

/** O caminho de uma sparkline, em coordenadas 0–100 × 0–100.
 *  SVG puro: uma biblioteca de gráfico para desenhar uma linha de doze
 *  pontos custaria mais que a tela inteira. */
export function caminhoDaEvolucao(pontos: PontoDaEvolucao[]): string {
  if (pontos.length < 2) return '';
  const topo = Math.max(...pontos.map((p) => p.acumulado)) || 1;
  return pontos
    .map((p, i) => {
      const x = (i / (pontos.length - 1)) * 100;
      const y = 100 - (p.acumulado / topo) * 100;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
