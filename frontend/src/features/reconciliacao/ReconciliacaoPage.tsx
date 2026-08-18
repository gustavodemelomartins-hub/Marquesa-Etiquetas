import { useMemo, useState } from 'react';
import type { ReconciliationAnalysis } from '../../types/reconciliation';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { ReconciliationSummary } from './ReconciliationSummary';
import { ReconciliationTable } from './ReconciliationTable';
import { analiseDeExemplo } from './exemplo';

interface Props {
  /** A última análise real feita na aba Nuvemshop, quando houver. */
  analise: ReconciliationAnalysis | null;
  aoIrParaNuvemshop: () => void;
}

/** A central de reconciliação — fundação.
 *
 *  O fluxo combinado é
 *  ANALISAR → DIFF → CLASSIFICAR → REVISAR → APROVAR → APLICAR → VALIDAR →
 *  AUDITAR. Desses, só os três primeiros existem hoje, e todos são leitura.
 *
 *  Esta tela mostra o que já é real (a rodada seca, classificada) e deixa a
 *  forma pronta para o resto. O que ela NÃO faz, deliberadamente: aprovar,
 *  guardar decisão, aplicar. Um botão de aprovar que não persiste nada seria
 *  pior que a ausência dele — pareceria que a pessoa decidiu algo. */
export function ReconciliacaoPage({ analise, aoIrParaNuvemshop }: Props) {
  const [verExemplo, setVerExemplo] = useState(false);
  const exemplo = useMemo(
    () => (verExemplo ? analiseDeExemplo(new Date().toISOString()) : null),
    [verExemplo],
  );

  const mostrar = analise ?? exemplo;

  return (
    <>
      <PageHeader
        kicker="Em construção"
        titulo="Reconciliação"
        sub="Onde a decisão vai morar entre “descobri o que mudaria” e “mudei”. Hoje esta tela só lê."
        acoes={
          !analise && (
            <button
              type="button"
              className="btn btn-leitura"
              onClick={() => setVerExemplo((v) => !v)}
            >
              {verExemplo ? 'Esconder exemplo' : 'Ver com dados de exemplo'}
            </button>
          )
        }
      />

      <div className="aviso" data-tom="neutro" style={{ marginBottom: 'var(--r5)' }}>
        <b>Aprovar e aplicar ainda não existem.</b>
        <div className="corpo">
          O fluxo pretendido é <strong>analisar → gerar diff → classificar por
          risco → revisar → aprovar → aplicar → validar → auditar</strong>. Os
          três primeiros passos já são reais e aparecem aqui; do quarto em
          diante, o backend ainda não tem onde guardar a decisão. Aplicar
          continua sendo feito pelo painel atual.
        </div>
      </div>

      {!mostrar && (
        <EmptyState
          titulo="Nenhuma análise ainda"
          descricao="Rode “Analisar sincronização” na aba Nuvemshop. Ela usa a rodada seca do backend: lê a loja inteira, calcula o que mudaria e não escreve nada lá."
          acoes={
            <button type="button" className="btn btn-analise" onClick={aoIrParaNuvemshop}>
              Ir para Nuvemshop
            </button>
          }
        />
      )}

      {mostrar && (
        <>
          <ReconciliationSummary analise={mostrar} />
          <ReconciliationTable itens={mostrar.itens} />
        </>
      )}
    </>
  );
}
