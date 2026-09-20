import type { CreditoCliente, GarantiaDoPerfil, PerfilCliente, VendaDoPerfil } from './tipos';

/** A LINHA DO TEMPO da relação — um feed único do que já aconteceu.
 *
 *  Por que ela existe: a ficha responde "como está a relação com esta
 *  cliente", e essa pergunta não se responde lendo quatro listas separadas
 *  e cruzando datas de cabeça. Ela comprou em 10/09, pagou em 12/09, abriu
 *  garantia em 20/09 e ganhou crédito na troca em 28/09 — isso é UMA
 *  história, e ela precisa ser lida como uma.
 *
 *  O que esta função é, e o limite que ela respeita: AGREGAÇÃO FACTUAL de
 *  eventos que o backend já reporta. Cada linha carrega de onde veio
 *  (`origem`), o identificador de lá (`origemId`), a data que o próprio
 *  backend gravou e o tipo do fato. Nada aqui inventa evento, deriva estado
 *  novo, decide o que "conta" ou soma dinheiro entre origens diferentes —
 *  isso seria decisão de negócio, e decisão de negócio não nasce numa
 *  função de tela.
 *
 *  As três datas de §30, que são três coisas diferentes:
 *    VENDA       quando a peça saiu.       `venda.data`
 *    PAGAMENTO   quando o dinheiro entrou. `venda.pagaEm`
 *    CADASTRO    quando o sistema soube.   não é evento da relação; não entra.
 *  Por isso uma venda paga gera DUAS linhas, e não uma — juntá-las é
 *  exatamente o erro que a V2 veio consertar.
 */

export type TipoEvento =
  | 'compra' | 'pagamento' | 'garantia-aberta' | 'garantia-encerrada'
  | 'troca' | 'credito';

export interface EventoRelacao {
  /** Estável e único dentro da ficha: `<origem>:<origemId>:<tipo>`. */
  chave: string;
  tipo: TipoEvento;
  origem: 'venda' | 'garantia' | 'credito';
  origemId: number;
  /** A data que o backend gravou para ESTE fato. `YYYY-MM-DD` ou timestamp. */
  data: string;
  titulo: string;
  detalhe: string | null;
  /** Em reais, quando o evento tem valor. `null` quando não tem — e `null`
   *  não é zero. */
  valor: number | null;
  /** O tom do Design System, para o ponto colorido da linha. */
  tom: 'neutro' | 'ok' | 'warn' | 'risk';
}

const soData = (v: string) => String(v).slice(0, 10);

/** O vocabulário de `garantia_trocas.diferenca_status`, em português.
 *  `pendente_regra` é o caso que o backend deixa em aberto de propósito:
 *  a peça nova saiu mais barata e o destino da diferença é decisão, não
 *  automatismo. */
const DIFERENCA: Record<string, string> = {
  a_receber: 'Diferença a receber da cliente',
  nenhuma: 'Sem diferença de valor',
  credito_emitido: 'Diferença virou crédito da cliente',
  pendente_regra: 'Diferença a favor da cliente, destino a definir',
  paga: 'Diferença já paga',
};

/** A peça que sai numa troca de garantia vira um registro comercial de
 *  valor zero (§36): é assim que o sistema guarda QUAL peça foi entregue.
 *  Chamar isso de "compra de R$ 0" na linha do tempo confundiria — ela não
 *  comprou nada ali. Quem diz que é troca é o canal, que o backend carimba. */
const ehTroca = (v: VendaDoPerfil) => v.canal === 'Troca de garantia';

function daVenda(v: VendaDoPerfil): EventoRelacao[] {
  const pecas = `${v.pecas} ${v.pecas === 1 ? 'peça' : 'peças'}`;
  const canal = v.canal ? ` · ${v.canal}` : '';
  const eventos: EventoRelacao[] = [{
    chave: `venda:${v.id}:compra`,
    tipo: 'compra',
    origem: 'venda',
    origemId: v.id,
    data: soData(v.data),
    titulo: ehTroca(v) ? `Peça entregue na troca · ${pecas}` : `Compra de ${pecas}`,
    detalhe: `${v.fonte === 'historico' ? 'Histórico' : 'Venda'} #${v.id}${canal}`,
    valor: ehTroca(v) ? null : v.valor,
    tom: 'neutro',
  }];

  /* Pagamento só vira evento quando o backend disse QUANDO ele aconteceu.
     Sem `pagaEm`, "está pago" é um estado, não um fato datado — e carimbar
     a data da venda nele produziria a mentira que §30 descreve. */
  if (v.pagaEm && v.valorRecebido > 0) {
    eventos.push({
      chave: `venda:${v.id}:pagamento`,
      tipo: 'pagamento',
      origem: 'venda',
      origemId: v.id,
      data: soData(v.pagaEm),
      titulo: 'Pagamento recebido',
      detalhe: `Referente à venda #${v.id}`,
      valor: v.valorRecebido,
      tom: 'ok',
    });
  }
  return eventos;
}

function daGarantia(g: GarantiaDoPerfil): EventoRelacao[] {
  const peca = g.produtoNome ?? g.sku;
  const eventos: EventoRelacao[] = [{
    chave: `garantia:${g.id}:garantia-aberta`,
    tipo: 'garantia-aberta',
    origem: 'garantia',
    origemId: g.id,
    data: soData(g.dataEntrada),
    titulo: `Garantia aberta · ${peca}`,
    detalhe: g.motivo,
    valor: null,
    tom: g.atrasado ? 'risk' : 'warn',
  }];

  if (g.troca) {
    eventos.push({
      chave: `garantia:${g.id}:troca`,
      tipo: 'troca',
      origem: 'garantia',
      origemId: g.id,
      data: soData(g.troca.data),
      titulo: `Troca por ${g.troca.produtoNovoNome ?? g.troca.skuNovo}`,
      /* A diferença é dita como o backend a classificou — só que em
         português. `credito_emitido` é vocabulário de banco de dados, e
         quem lê a ficha não tem por que aprendê-lo. */
      detalhe: DIFERENCA[g.troca.diferencaStatus] ?? `Diferença ${g.troca.diferencaStatus}`,
      valor: g.troca.diferenca,
      tom: 'neutro',
    });
  }

  if (g.encerradaEm) {
    eventos.push({
      chave: `garantia:${g.id}:garantia-encerrada`,
      tipo: 'garantia-encerrada',
      origem: 'garantia',
      origemId: g.id,
      data: soData(g.encerradaEm),
      titulo: `Garantia encerrada · ${g.statusRotulo}`,
      detalhe: `Caso #${g.id}`,
      valor: null,
      tom: 'ok',
    });
  }
  return eventos;
}

export function montarLinhaDoTempo(
  perfil: PerfilCliente, credito: CreditoCliente | null,
): EventoRelacao[] {
  const eventos: EventoRelacao[] = [
    ...perfil.vendas.flatMap(daVenda),
    ...perfil.garantias.flatMap(daGarantia),
    ...(credito?.extrato ?? []).map((m): EventoRelacao => ({
      chave: `credito:${m.id}:credito`,
      tipo: 'credito',
      origem: 'credito',
      origemId: m.id,
      data: soData(m.criadoEm),
      titulo: m.tipo === 'credito' ? 'Crédito gerado'
        : m.tipo === 'consumo' ? 'Crédito usado'
        : m.tipo === 'estorno' ? 'Crédito estornado' : 'Ajuste de crédito',
      detalhe: m.motivo ?? m.origem,
      valor: m.valorCentavos / 100,
      tom: m.valorCentavos < 0 ? 'neutro' : 'ok',
    })),
  ];

  /* Mais novo primeiro. Empate de data é desempatado pela chave, e não pela
     ordem em que as listas chegaram: a ficha precisa ficar igual entre duas
     aberturas, senão ninguém confia no que leu. */
  return eventos.sort((a, b) => (
    a.data === b.data ? a.chave.localeCompare(b.chave) : (a.data < b.data ? 1 : -1)
  ));
}
