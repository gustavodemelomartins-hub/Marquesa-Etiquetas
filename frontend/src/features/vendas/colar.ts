import { chamar, type Connection } from '../../services/client';

/** MONTE SEU COLAR — §43.
 *
 *  O que o backend garante, e a tela repete sem reinterpretar:
 *
 *   1. **A base não é escolha.** A corrente da configuração sai
 *      automaticamente em toda montagem. Mandar outra é recusado (decisão
 *      de 10/09/2026).
 *   2. **O preço é da CONFIGURAÇÃO**, não a soma das peças. Mandar um preço
 *      diferente é recusado com o valor certo na mensagem. Por isso esta
 *      tela NÃO tem campo de preço final editável: o protótipo desenhou um,
 *      e ele não existe do lado de cá.
 *   3. **O SKU comercial não tem saldo próprio.** O disponível é quantas
 *      montagens as peças físicas sustentam — a base uma vez e cada
 *      componente escolhido uma vez.
 *   4. **As posições são exatas.** A configuração diz quantas peças de cada
 *      grupo; nem uma a mais nem a menos. Repetir a mesma cor dentro do
 *      grupo é permitido.
 *   5. **Desligável.** `PERSONALIZACAO_ATIVA=false` faz a rota devolver 503
 *      com `codigo: PERSONALIZACAO_DESATIVADA`, e o registro da venda é
 *      recusado do mesmo jeito. A tela continua visível e diz isso — ativar
 *      em silêncio seria vender uma composição que o servidor não aceita.
 */

export interface OpcaoDeComponente {
  id: number;
  componenteSku: string;
  componenteNome: string;
  variacao: string | null;
  varianteId: string | null;
  rotulo: string;
  grupo: string | null;
  preco: number | null;
  disponivel: number;
  /** O motivo, quando a opção não pode ser escolhida. A opção CONTINUA na
   *  lista: sumir faria ela parecer nunca ter existido (§22). */
  indisponivel: string | null;
}

export interface ModeloDeColar {
  id: number;
  slug: string;
  nome: string;
  skuComercial: string | null;
  slotsMin: number;
  slotsMax: number;
  slotTipos: string[];
  /** Quantas peças de cada grupo esta configuração leva. */
  slots: { grupo: string; qtd: number }[];
  composicaoLivre: boolean;
  baseSkuPadrao: string | null;
  baseNome: string | null;
  baseDisponivel: number | null;
  /** Montagens que as peças físicas sustentam. Nunca um saldo guardado. */
  disponivel: number;
  precoSugerido: number | null;
  ativo: boolean;
  obs: string | null;
  opcoes: OpcaoDeComponente[];
}

export interface ModelosDeColar {
  ok: true;
  modelos: ModeloDeColar[];
  regra: string;
}

/** O que a tela monta e manda para `POST /api/vendas › personalizacoes[]`. */
export interface ComposicaoDoColar {
  modeloId: number;
  /** Só para a tela: o nome do modelo e o texto das escolhas. */
  modeloNome: string;
  skuComercial: string;
  baseSku: string | null;
  baseNome: string | null;
  preco: number;
  componentes: {
    componenteSku: string;
    rotulo: string;
    grupo: string | null;
    variacao: string | null;
    varianteId: string | null;
    qtd: number;
    posicao: number;
  }[];
  observacao?: string;
}

/** `PERSONALIZACAO_DESATIVADA` é uma recusa esperada, não um defeito. */
export const CODIGO_DESATIVADA = 'PERSONALIZACAO_DESATIVADA';

export interface RecusaDaPersonalizacao {
  desativada: boolean;
  mensagem: string;
}

export function lerRecusa(erro: unknown): RecusaDaPersonalizacao | null {
  if (!erro) return null;
  const e = erro as { status?: number; corpo?: unknown; message?: string };
  const corpo = (e.corpo && typeof e.corpo === 'object' ? e.corpo : {}) as
    { codigo?: string; erro?: string };
  if (corpo.codigo === CODIGO_DESATIVADA || e.status === 503) {
    return {
      desativada: true,
      mensagem: corpo.erro
        ?? 'Produtos Montáveis (Monte seu Colar) está temporariamente desativado.',
    };
  }
  return {
    desativada: false,
    mensagem: corpo.erro ?? e.message ?? 'Não consegui carregar as configurações.',
  };
}

export function listarModelosDeColar(
  conexao: Connection, sinal?: AbortSignal,
): Promise<ModelosDeColar> {
  return chamar(conexao, 'GET', '/api/personalizacao/modelos', undefined, { signal: sinal });
}

/* ───────────────────────────────────────────────────── as contas da tela */

/** Quantas peças de cada grupo ainda faltam (ou sobram) para a composição
 *  fechar. O backend recusa uma composição que não bate EXATAMENTE — este
 *  cálculo é a mesma régua, aplicada antes do envio. */
export function faltaPorGrupo(
  modelo: ModeloDeColar, escolhas: EscolhaDeComponente[],
): { grupo: string; pedido: number; escolhido: number; falta: number }[] {
  return modelo.slots.map((s) => {
    const escolhido = escolhas
      .filter((e) => e.grupo === s.grupo)
      .reduce((n, e) => n + e.qtd, 0);
    return { grupo: s.grupo, pedido: s.qtd, escolhido, falta: s.qtd - escolhido };
  });
}

export interface EscolhaDeComponente {
  opcaoId: number;
  componenteSku: string;
  rotulo: string;
  grupo: string | null;
  variacao: string | null;
  varianteId: string | null;
  qtd: number;
}

/** O que impede ESTA composição de ser aceita, em frases.
 *
 *  Lista vazia significa que o backend vai aceitar pelas regras que a tela
 *  conhece. Ele ainda pode recusar por algo que só ele sabe — um componente
 *  que acabou entre abrir a tela e confirmar — e essa recusa aparece onde
 *  acontece. */
export function impedimentosDaComposicao(
  modelo: ModeloDeColar | null, escolhas: EscolhaDeComponente[],
): string[] {
  const erros: string[] = [];
  if (!modelo) return ['Escolha uma configuração.'];
  if (!modelo.ativo) erros.push(`A configuração "${modelo.nome}" está inativa.`);
  if (!modelo.skuComercial) erros.push(`A configuração "${modelo.nome}" não tem SKU comercial.`);
  if (!modelo.baseSkuPadrao) erros.push(`A configuração "${modelo.nome}" não tem corrente cadastrada.`);
  if (modelo.precoSugerido == null) {
    erros.push(`A configuração "${modelo.nome}" está sem preço cadastrado — sem preço, não vende.`);
  }
  if (!modelo.slots.length) erros.push(`A configuração "${modelo.nome}" não tem posições cadastradas.`);

  for (const f of faltaPorGrupo(modelo, escolhas)) {
    if (f.falta > 0) {
      erros.push(`Faltam ${f.falta} ${f.falta === 1 ? 'peça' : 'peças'} do grupo ${f.grupo}.`);
    } else if (f.falta < 0) {
      erros.push(`${f.grupo}: leva ${f.pedido}, e ${f.escolhido} foram escolhidas.`);
    }
  }

  /* A demanda física: a base uma vez, cada componente quantas vezes aparecer.
     Esta é a mesma conta que o backend faz antes de baixar o estoque. */
  const porSku = new Map<string, number>();
  for (const e of escolhas) porSku.set(e.componenteSku, (porSku.get(e.componenteSku) ?? 0) + e.qtd);
  for (const [sku, qtd] of porSku) {
    const o = modelo.opcoes.find((x) => x.componenteSku === sku);
    if (!o) continue;
    if (qtd > o.disponivel) {
      erros.push(`${o.componenteNome}: a composição precisa de ${qtd} e há ${o.disponivel}.`);
    }
  }
  if (modelo.baseDisponivel != null && modelo.baseDisponivel < 1) {
    erros.push(`${modelo.baseNome ?? modelo.baseSkuPadrao}: a corrente não tem peça em estoque.`);
  }

  return [...new Set(erros)];
}

export function composicaoDe(
  modelo: ModeloDeColar, escolhas: EscolhaDeComponente[], observacao = '',
): ComposicaoDoColar {
  let posicao = 0;
  const componentes = escolhas.flatMap((e) => Array.from({ length: e.qtd }, () => {
    posicao += 1;
    return {
      componenteSku: e.componenteSku,
      rotulo: e.rotulo,
      grupo: e.grupo,
      variacao: e.variacao,
      varianteId: e.varianteId,
      qtd: 1,
      posicao,
    };
  }));

  return {
    modeloId: modelo.id,
    modeloNome: modelo.nome,
    skuComercial: modelo.skuComercial as string,
    baseSku: modelo.baseSkuPadrao,
    baseNome: modelo.baseNome,
    preco: modelo.precoSugerido as number,
    componentes,
    ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
  };
}

/** O corpo de UMA composição, como `prepararPersonalizacoes` a lê. Nada a
 *  mais: `preco` vai junto só para o servidor CONFERIR, e ele recusa um
 *  valor diferente do da configuração em vez de aceitar o nosso. */
export function corpoDaComposicao(c: ComposicaoDoColar) {
  return {
    modeloId: c.modeloId,
    preco: c.preco,
    ...(c.observacao ? { observacao: c.observacao } : {}),
    componentes: c.componentes.map((x) => ({
      componenteSku: x.componenteSku,
      qtd: x.qtd,
      posicao: x.posicao,
      rotulo: x.rotulo,
      ...(x.variacao ? { variacao: x.variacao } : {}),
      ...(x.varianteId ? { varianteId: x.varianteId } : {}),
    })),
  };
}

export const descricaoDaComposicao = (c: ComposicaoDoColar) =>
  `${c.modeloNome} — ${c.componentes.map((x) => x.rotulo).join(', ')}`;
