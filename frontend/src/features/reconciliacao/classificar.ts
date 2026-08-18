/** Transforma o relato de uma rodada SECA num diff classificado por risco.
 *
 *  Função pura, sem rede e sem React: entra `SyncReport`, sai
 *  `ReconciliationAnalysis`. É o que permite testá-la sem navegador e sem
 *  servidor.
 *
 *  IMPORTANTE — o que isto NÃO é: não decide nada, não grava nada, não
 *  aplica nada. É leitura organizada de uma análise que o backend já sabe
 *  fazer. A aprovação e a aplicação são a próxima fase
 *  (docs/ROADMAP_RECONCILIATION.md).
 *
 *  A classificação existe porque um freio que só CONTA não distingue
 *  "acertar 30 estoques em 1 unidade" de "zerar 14 produtos que estavam
 *  vendendo". São coisas muito diferentes com o mesmo número.
 */
import type { SyncReport } from '../../types/sync';
import type {
  ReconciliationAnalysis,
  ReconciliationItem,
  ReconciliationPending,
  RiskLevel,
} from '../../types/reconciliation';
import { RISK_ORDER } from '../../types/reconciliation';

/** Diferença até aqui é rotina: uma peça a mais ou a menos. */
const LIMITE_TRIVIAL = 1;
/** Tirar esta quantidade ou mais do ar merece o olho de alguém. */
const LIMITE_PERIGOSO = 5;

/** O risco de uma mudança de estoque na loja.
 *
 *  A assimetria é deliberada: **tirar** estoque do ar é mais perigoso que
 *  **colocar**. Anunciar peça a mais vende algo que talvez não exista, e
 *  isso se resolve com um pedido cancelado; anunciar peça a menos tira do ar
 *  uma peça que está aqui, e isso não se resolve — a venda simplesmente não
 *  acontece, e ninguém fica sabendo. */
export function classificarEstoque(
  de: number,
  para: number,
): { risco: RiskLevel; motivo: string } {
  const delta = para - de;

  if (para === 0 && de > 0) {
    return {
      risco: 'perigoso',
      motivo: `Tira o produto do ar: a loja mostra ${de} e passaria a mostrar 0.`,
    };
  }
  if (delta <= -LIMITE_PERIGOSO) {
    return {
      risco: 'perigoso',
      motivo: `Tira ${Math.abs(delta)} peças do ar de uma vez (${de} → ${para}).`,
    };
  }
  if (Math.abs(delta) <= LIMITE_TRIVIAL) {
    return {
      risco: 'trivial',
      motivo:
        delta === 0
          ? 'Sem diferença.'
          : `Diferença de ${Math.abs(delta)} peça — rotina.`,
    };
  }
  if (delta > 0) {
    return {
      risco: 'confere',
      motivo: `Coloca ${delta} peças à venda (${de} → ${para}). Confira se o estoque daqui está certo.`,
    };
  }
  return {
    risco: 'confere',
    motivo: `Reduz ${Math.abs(delta)} peças na loja (${de} → ${para}).`,
  };
}

/** As situações que a análise viu e NÃO tem como decidir sozinha.
 *  Sinalizar em vez de engolir (§22) — mas sem fingir que existe um botão. */
function pendencias(relato: SyncReport): ReconciliationPending[] {
  const saida: ReconciliationPending[] = [];

  const porMotivo = {
    duplicado: relato.semEmpurrar.filter((v) => v.motivo === 'duplicado'),
    maleta: relato.semEmpurrar.filter((v) => v.motivo === 'maleta'),
    sem_reparticao: relato.semEmpurrar.filter((v) => v.motivo === 'sem_reparticao'),
  };

  if (porMotivo.duplicado.length) {
    saida.push({
      tipo: 'duplicado',
      quantidade: porMotivo.duplicado.length,
      descricao:
        'O mesmo código está cadastrado em dois produtos diferentes da loja. ' +
        'O estoque fica dividido entre dois anúncios e a conta nunca fecha — ' +
        'não há como dividir automaticamente, e por isso a rodada não toca neles.',
      skus: porMotivo.duplicado.map((v) => v.sku),
    });
  }

  if (porMotivo.maleta.length) {
    saida.push({
      tipo: 'maleta',
      quantidade: porMotivo.maleta.length,
      descricao:
        'Código com variação e peça em maleta. A maleta ainda não sabe qual ' +
        'variação saiu, e descontar da errada tiraria do ar uma peça que está aqui.',
      skus: porMotivo.maleta.map((v) => v.sku),
    });
  }

  if (porMotivo.sem_reparticao.length) {
    saida.push({
      tipo: 'variacao_sem_reparticao',
      quantidade: porMotivo.sem_reparticao.length,
      descricao:
        'Sobram peças sem variação atribuída. As caixinhas da loja somadas ' +
        'dariam menos do que existe aqui, e a diferença sairia do ar como se ' +
        'a peça não existisse.',
      skus: porMotivo.sem_reparticao.map((v) => v.sku),
    });
  }

  if (relato.naoSemeados.length) {
    saida.push({
      tipo: 'variacao_soma_nao_bate',
      quantidade: relato.naoSemeados.length,
      descricao:
        'A soma das variações na loja não bate com o total daqui. O desencontro ' +
        'não diz onde está o erro, então a rodada não repartiu nada — repartir ' +
        'no chute entupiria as primeiras variações e zeraria as últimas.',
      skus: relato.naoSemeados.map((v) => v.sku),
    });
  }

  if (relato.itensIgnorados.length) {
    saida.push({
      tipo: 'pedido_sem_sku',
      quantidade: relato.itensIgnorados.length,
      descricao:
        'Itens de pedido do site que não casaram com nenhum código do catálogo. ' +
        'Houve uma venda de verdade que o sistema não registrou.',
      skus: [...new Set(relato.itensIgnorados.map((i) => i.sku))],
    });
  }

  return saida;
}

/** Converte a rodada seca em análise classificada.
 *
 *  `em` entra por parâmetro em vez de sair de `new Date()` aqui dentro: uma
 *  função pura é testável, e o relógio é do chamador. */
export function analisarRelato(
  relato: SyncReport,
  em: string,
): ReconciliationAnalysis {
  const itens: ReconciliationItem[] = relato.mudancas.map((m) => {
    const { risco, motivo } = classificarEstoque(m.de, m.para);
    /* `desc` de uma mudança de variação vem como "Descrição · 45cm". O nome
       da variação é a parte depois do separador — a loja é quem o define, e
       não temos um campo separado no relato. */
    const variacao = m.varianteId !== undefined ? separarVariacao(m.desc) : null;
    return {
      id: `${m.sku}|${variacao ?? ''}|estoque_loja`,
      sku: m.sku,
      variacao,
      descricao: m.desc,
      origem: 'sync' as const,
      tipo: 'estoque_loja' as const,
      de: m.de,
      para: m.para,
      delta: m.para - m.de,
      risco,
      motivo,
      decisao: 'pendente' as const,
    };
  });

  itens.sort((a, b) => {
    const ra = RISK_ORDER.indexOf(a.risco);
    const rb = RISK_ORDER.indexOf(b.risco);
    if (ra !== rb) return ra - rb;
    /* Dentro do mesmo risco, a mudança maior primeiro: é a que mais muda a
       vida de alguém. */
    const da = Math.abs(a.delta ?? 0);
    const db = Math.abs(b.delta ?? 0);
    if (da !== db) return db - da;
    return a.sku.localeCompare(b.sku, 'pt');
  });

  const porRisco: Record<RiskLevel, number> = {
    trivial: 0,
    confere: 0,
    perigoso: 0,
    desconhecido: 0,
  };
  for (const i of itens) porRisco[i.risco]++;

  return {
    resumo: {
      origem: 'sync',
      em,
      total: itens.length,
      porRisco,
      zerando: relato.mudancas.filter((m) => m.zera).length,
      pendencias: pendencias(relato),
    },
    itens,
    simulado: false,
  };
}

/** "Colar de prata · 45cm" → "45cm". Sem separador, não há variação. */
function separarVariacao(desc: string): string | null {
  const i = desc.lastIndexOf(' · ');
  return i === -1 ? null : desc.slice(i + 3);
}
