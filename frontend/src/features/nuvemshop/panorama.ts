/** O panorama da loja: o que está publicado, o que diverge, o que falta.
 *
 *  Porte FIEL de `panoramaLoja()` do dashboard legado
 *  (src/dashboard.tpl.html). As regras são as mesmas, linha por linha —
 *  modernizar a interface não pode mudar o que os números significam.
 *
 *  Função pura: recebe o estado, devolve o panorama. Sem React, sem fetch,
 *  sem data. É o que permite testá-la sem navegador.
 */
import type { AppState, Product, UnpushedCode } from '../../types/api';
import type { DiagnosticoSync } from './saude';

export interface Panorama {
  /** SKU → quanto está em casa (total − consignado). */
  casa: Record<string, number>;
  /** Códigos nossos que existem na loja. */
  naLoja: Product[];
  /** Códigos nossos que NÃO existem na loja. */
  fora: Product[];

  /** Produtos da Nuvemshop (não códigos) que casaram com o catálogo.
   *  Um produto pode carregar várias variações, cada uma com o seu SKU —
   *  por isso este número é menor que o de códigos casados. É este que
   *  aparece no painel da Nuvemshop. */
  produtos: number;
  produtosNaLoja: number;
  /** Produtos que só existem lá. Não os tocamos: não conhecer um produto
   *  não é o mesmo que saber que ele tem zero. */
  soNaLoja: number;
  lidoEm: string | null;
  /** Quantos códigos casados são variações de um produto já contado. */
  variacoes: number;

  /** Mesmo código em produtos DIFERENTES — cadastro duplicado de verdade. */
  duplicados: string[];
  /** Códigos que a rodada decidiu não empurrar, com o motivo. */
  comVariacao: UnpushedCode[];
  /** Como a loja chama o que varia. Não é lista fixa nossa. */
  atributos: string[];

  /** Tem peça em casa e não existe na loja. */
  faltaSubir: Product[];
  /** A loja mostra número diferente do que existe em casa. */
  desatualizados: Product[];
  /** Dos desatualizados, os que a loja mostra a MAIS do que existe aqui.
   *  A diferença não é simétrica: mostrando a menos, deixamos de vender;
   *  mostrando a mais, a loja aceita um pedido de uma peça que já saiu. Só
   *  este lado vira compromisso com um cliente. */
  vendendoDemais: Product[];
  /** Publicados mas fora do ar. */
  ocultos: Product[];
  /** Dos ocultos, os que têm peça em casa e podiam estar vendendo. */
  ocultosComPeca: Product[];

  pecasPublicadas: number;
  valorPublicado: number;
}

/** Quanto está em casa, por SKU. O servidor já calcula `disponivel`
 *  (total − consignado, e o mínimo entre componentes quando é kit), então
 *  aqui é só indexar — a conta não se repete de dois lados. */
export function mapaEmCasa(produtos: Product[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of produtos) out[p.sku] = p.disponivel;
  return out;
}

export function montarPanorama(state: AppState): Panorama {
  const casa = mapaEmCasa(state.produtos);
  const naLoja = state.produtos.filter((p) => !!p.urlLoja);
  const fora = state.produtos.filter((p) => !p.urlLoja);
  const certo = (p: Product): number => Math.max(0, casa[p.sku] ?? 0);

  const L = state.loja;
  const produtos =
    L?.produtosCasados ?? new Set(naLoja.map((p) => p.urlLoja)).size;

  /* Códigos que na loja são mais de uma variação, ou que a rodada não
     empurrou por outro motivo. Eles ficam FORA de "estoque errado" de
     propósito: cobrar uma correção que não tem botão seria só barulho —
     eles têm o aviso próprio, que explica o que está acontecendo. */
  const semEmpurrar: UnpushedCode[] = L?.variacoes ?? [];
  const skusSemEmpurrar = new Set(semEmpurrar.map((v) => v.sku));

  const ocultos = naLoja.filter((p) => p.visivel === false);
  const desatualizados = naLoja.filter(
    (p) => !skusSemEmpurrar.has(p.sku) && (p.estoqueLoja ?? 0) !== certo(p),
  );

  return {
    casa,
    naLoja,
    fora,
    produtos,
    produtosNaLoja: L?.produtosNaLoja ?? produtos,
    soNaLoja: L?.soNaLoja ?? 0,
    lidoEm: L?.lidoEm ?? null,
    variacoes: Math.max(0, naLoja.length - produtos),
    duplicados: L?.duplicados ?? [],
    comVariacao: semEmpurrar,
    atributos: [...new Set(semEmpurrar.flatMap((v) => v.atributos ?? []))].sort(
      (a, b) => a.localeCompare(b, 'pt'),
    ),
    faltaSubir: fora.filter((p) => certo(p) > 0),
    desatualizados,
    vendendoDemais: desatualizados.filter((p) => (p.estoqueLoja ?? 0) > certo(p)),
    ocultos,
    ocultosComPeca: ocultos.filter((p) => certo(p) > 0),
    pecasPublicadas: naLoja.reduce((s, p) => s + (p.estoqueLoja ?? 0), 0),
    /* Produto sem preço é `null` (§24), e `null` numa soma vira 0 — o valor
       publicado ignora o que não tem preço em vez de inventar zero reais. */
    valorPublicado: naLoja.reduce(
      (s, p) => s + (p.estoqueLoja ?? 0) * (p.preco ?? 0),
      0,
    ),
  };
}

/** Quantos casos precisam de uma pessoa.
 *
 *  "Estoque divergente" entra ou não conforme o diagnóstico: enquanto a
 *  sincronização estiver de pé, ela conserta sozinha e cobrar seria só
 *  barulho; quando não estiver, ninguém conserta e a divergência passa a
 *  ser trabalho de gente. Ver `saude.ts › diagnosticarSync`.
 *
 *  O diagnóstico é obrigatório de propósito. Um parâmetro opcional teria
 *  de assumir algo quando ausente, e a única suposição barata — "está
 *  saudável" — é justamente a que esconde o problema. */
export function contarPendencias(p: Panorama, diag: DiagnosticoSync): number {
  return (
    p.duplicados.length +
    p.comVariacao.length +
    p.faltaSubir.length +
    p.ocultosComPeca.length +
    (diag.autoCorrige ? 0 : p.desatualizados.length)
  );
}
