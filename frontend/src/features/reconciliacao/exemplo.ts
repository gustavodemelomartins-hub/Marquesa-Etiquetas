/** Uma análise de EXEMPLO, para a tela de reconciliação poder mostrar a
 *  forma do fluxo antes de o backend saber gravá-lo.
 *
 *  `simulado: true` obriga a interface a dizer isso em voz alta — a faixa
 *  listrada no topo. Interface bonita que esconde a origem do dado é pior
 *  que interface feia.
 *
 *  Os números foram escolhidos para exercitar os quatro riscos, inclusive o
 *  caso que o freio de segurança realmente pegou em produção: um código cuja
 *  soma na loja não bate com o nosso total, e que por isso não é repartido.
 */
import type { ReconciliationAnalysis } from '../../types/reconciliation';
import { classificarEstoque } from './classificar';

interface Linha {
  sku: string;
  desc: string;
  variacao: string | null;
  de: number;
  para: number;
}

const LINHAS: Linha[] = [
  { sku: '486476', desc: 'Colar Ponto de Luz', variacao: null, de: 3, para: 0 },
  { sku: '150164', desc: 'Brinco Argola Média', variacao: null, de: 9, para: 2 },
  { sku: '120029', desc: 'Pulseira Veneziana', variacao: null, de: 1, para: 4 },
  { sku: '818325', desc: 'Anel Solitário', variacao: '16', de: 2, para: 1 },
  { sku: '818325', desc: 'Anel Solitário', variacao: '18', de: 0, para: 1 },
  { sku: '774310', desc: 'Corrente Cadeado 45cm', variacao: null, de: 5, para: 6 },
];

export function analiseDeExemplo(em: string): ReconciliationAnalysis {
  const itens = LINHAS.map((l) => {
    const { risco, motivo } = classificarEstoque(l.de, l.para);
    return {
      id: `${l.sku}|${l.variacao ?? ''}|estoque_loja`,
      sku: l.sku,
      variacao: l.variacao,
      descricao: l.variacao ? `${l.desc} · ${l.variacao}` : l.desc,
      origem: 'sync' as const,
      tipo: 'estoque_loja' as const,
      de: l.de,
      para: l.para,
      delta: l.para - l.de,
      risco,
      motivo,
      decisao: 'pendente' as const,
    };
  });

  return {
    resumo: {
      origem: 'sync',
      em,
      total: itens.length,
      porRisco: {
        trivial: itens.filter((i) => i.risco === 'trivial').length,
        confere: itens.filter((i) => i.risco === 'confere').length,
        perigoso: itens.filter((i) => i.risco === 'perigoso').length,
        desconhecido: itens.filter((i) => i.risco === 'desconhecido').length,
      },
      zerando: itens.filter((i) => i.para === 0 && typeof i.de === 'number' && i.de > 0)
        .length,
      pendencias: [
        {
          tipo: 'variacao_soma_nao_bate',
          quantidade: 1,
          descricao:
            'A soma das variações na loja não bate com o total daqui. O desencontro não diz onde está o erro, então a rodada não repartiu nada.',
          skus: ['486476'],
        },
        {
          tipo: 'duplicado',
          quantidade: 2,
          descricao:
            'O mesmo código está cadastrado em dois produtos diferentes da loja. Não há como dividir o estoque entre dois anúncios.',
          skus: ['DUPLO-1', 'DUPLO-2'],
        },
      ],
    },
    itens,
    simulado: true,
  };
}
