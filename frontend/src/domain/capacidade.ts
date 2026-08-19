/** "Com o estoque que tenho em casa hoje, quantas maletas novas monto?"
 *
 *  ---------------------------------------------------------------------
 *  LACUNA DE NEGÓCIO, DECLARADA
 *
 *  `api/REGRAS.md` não define tamanho mínimo nem alvo de uma maleta, e não
 *  define reserva mínima em casa. Procurei: o backend só impede consignar
 *  mais do que existe (`adicionarItens` recusa `qtd > disponivel`) e
 *  impede kit em maleta. Nada além disso.
 *
 *  Então esta tela NÃO decide a regra. Ela expõe dois parâmetros, mostra os
 *  dois na interface, e diz de onde cada um veio:
 *
 *    tamanhoAlvo   peças por maleta. Padrão = MEDIANA das maletas já
 *                  montadas (dado real, de `state.maletas`). Sem histórico
 *                  nenhum, cai num valor de partida configurado, marcado
 *                  como não confirmado.
 *
 *    reservaPct    quanto de CADA código fica em casa. Não tem origem em
 *                  dado nenhum — é escolha de negócio, e é exatamente o que
 *                  precisa de confirmação humana. Os três modos de
 *                  planejamento são três valores desse mesmo parâmetro,
 *                  nada mais: não há heurística escondida atrás deles.
 *
 *  Enquanto a decisão não vier, o número mostrado é uma projeção sob
 *  premissa declarada, não um fato do sistema (regra 9 do CLAUDE.md: o que
 *  o sistema decide não fazer é anunciado, nunca engolido).
 *  ---------------------------------------------------------------------
 *
 *  Duas travas que valem sempre, independentemente da configuração:
 *
 *  1. A reserva é aplicada POR CÓDIGO, não sobre o total. Um orçamento
 *     global permitiria zerar um código inteiro enquanto a média fecha —
 *     e código zerado em casa é anúncio fora do ar na Nuvemshop.
 *  2. Nada aqui pode propor mais do que `produto.disponivel`, que é o
 *     número que o próprio servidor usa para recusar a consignação. */
import type { AppState, Product } from '../types/api';
import { maletaEncerrada, maletasAbertas, qtdMaleta } from './maletas';

export type ModoPlanejamento = 'conservador' | 'equilibrado' | 'agressivo';

/** Os três modos são três reservas. Só isso, e de propósito. */
export const RESERVA_POR_MODO: Record<ModoPlanejamento, number> = {
  conservador: 50,
  equilibrado: 30,
  agressivo: 15,
};

export const ROTULO_MODO: Record<ModoPlanejamento, string> = {
  conservador: 'Conservador',
  equilibrado: 'Equilibrado',
  agressivo: 'Agressivo',
};

/** Valor de partida quando não há uma única maleta no histórico. Não é uma
 *  regra da Marquesa — é um número redondo para a tela não ficar sem eixo,
 *  e a interface diz isso em voz alta. */
export const TAMANHO_ALVO_SEM_HISTORICO = 40;

export interface ConfigPlanejamento {
  modo: ModoPlanejamento;
  /** Peças por maleta. Editável; o padrão vem do histórico. */
  tamanhoAlvo: number;
  /** `true` enquanto ninguém confirmou o tamanho alvo na interface. */
  tamanhoAlvoConfirmado: boolean;
}

export interface OrigemTamanhoAlvo {
  valor: number;
  /** 'historico' = mediana das maletas reais. 'padrao' = não há histórico. */
  origem: 'historico' | 'padrao';
  /** Quantas maletas entraram na mediana. */
  amostra: number;
}

/** Mediana de peças das maletas já montadas — abertas, em acerto e
 *  encerradas. Canceladas ficam de fora: elas nunca representaram uma
 *  decisão de montagem que valeu. */
export function tamanhoAlvoDoHistorico(estado: AppState): OrigemTamanhoAlvo {
  const tamanhos = estado.maletas
    .filter((m) => m.status !== 'cancelada')
    .map(qtdMaleta)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  if (!tamanhos.length) {
    return { valor: TAMANHO_ALVO_SEM_HISTORICO, origem: 'padrao', amostra: 0 };
  }

  const meio = Math.floor(tamanhos.length / 2);
  const alto = tamanhos[meio] ?? 0;
  const baixo = tamanhos[meio - 1] ?? alto;
  const mediana = tamanhos.length % 2 === 1 ? alto : Math.round((baixo + alto) / 2);

  return { valor: mediana, origem: 'historico', amostra: tamanhos.length };
}

/** Um código elegível para entrar numa maleta nova.
 *
 *  Kit fica de fora porque o BACKEND recusa kit em maleta (§28 e
 *  `adicionarItens`). Propor um kit aqui seria propor algo que a API vai
 *  negar — e uma sugestão impossível é pior que sugestão nenhuma. */
export function elegivelParaMaleta(p: Product): boolean {
  return !p.componentes && p.status === 'ativo' && (p.disponivel || 0) > 0;
}

export interface CodigoConsignavel {
  produto: Product;
  /** Em casa hoje: total − consignado, como o servidor calculou. */
  emCasa: number;
  /** Fica em casa por causa da reserva configurada. */
  reservado: number;
  /** Pode ir para maleta nova sem furar a reserva. */
  consignavel: number;
}

/** Quanto de cada código pode sair, dada a reserva.
 *
 *  `floor` de propósito: com 30% de reserva, um código com 1 peça em casa
 *  contribui com 0 e não com "0,7 arredondado para 1". Ele é a única peça
 *  daquele código — tirar de casa apaga o anúncio. */
export function consignaveis(estado: AppState, reservaPct: number): CodigoConsignavel[] {
  const fator = Math.max(0, Math.min(100, reservaPct)) / 100;
  return estado.produtos.filter(elegivelParaMaleta).map((p) => {
    const emCasa = p.disponivel || 0;
    const consignavel = Math.max(0, Math.floor(emCasa * (1 - fator)));
    return { produto: p, emCasa, reservado: emCasa - consignavel, consignavel };
  });
}

export interface Capacidade {
  /** Peças em casa e elegíveis (sem kit, sem inativo). */
  emCasa: number;
  /** Peças que a reserva mantém em casa. */
  reservado: number;
  /** Peças liberadas para consignação. */
  consignavel: number;
  /** Maletas inteiras que cabem dentro de `consignavel`. */
  maletas: number;
  /** Peças que sobram depois das maletas inteiras. */
  sobra: number;
  tamanhoAlvo: number;
  reservaPct: number;
  /** Códigos distintos com pelo menos uma peça liberada. */
  codigos: number;
  /** Peças elegíveis, mas sem preço (§24) — não entram em sugestão. */
  pecasSemPreco: number;
}

/** A conta inteira, em um objeto.
 *
 *  `maletas * tamanhoAlvo <= consignavel <= emCasa` por construção: a
 *  divisão inteira é o que garante que a capacidade nunca ultrapasse o
 *  estoque disponível. */
export function calcularCapacidade(
  estado: AppState,
  config: ConfigPlanejamento,
): Capacidade {
  const reservaPct = RESERVA_POR_MODO[config.modo];
  const lista = consignaveis(estado, reservaPct);

  const emCasa = lista.reduce((s, c) => s + c.emCasa, 0);
  const consignavel = lista.reduce((s, c) => s + c.consignavel, 0);
  const tamanhoAlvo = Math.max(1, Math.round(config.tamanhoAlvo));

  return {
    emCasa,
    reservado: emCasa - consignavel,
    consignavel,
    maletas: Math.floor(consignavel / tamanhoAlvo),
    sobra: consignavel % tamanhoAlvo,
    tamanhoAlvo,
    reservaPct,
    codigos: lista.filter((c) => c.consignavel > 0).length,
    pecasSemPreco: lista
      .filter((c) => c.produto.preco === null)
      .reduce((s, c) => s + c.consignavel, 0),
  };
}

/** Quantas maletas já estão na rua — o outro lado do número de capacidade. */
export function maletasNaRua(estado: AppState): number {
  return maletasAbertas(estado.maletas).length;
}

/** Quantas maletas já foram encerradas. Serve para dizer o tamanho da
 *  amostra de onde saiu o tamanho alvo. */
export function maletasEncerradas(estado: AppState): number {
  return estado.maletas.filter(maletaEncerrada).length;
}
