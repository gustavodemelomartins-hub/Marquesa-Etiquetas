import type { ReconciliationAnalysis } from '../../types/reconciliation';
import { MetricCard } from '../../components/MetricCard';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtDataHora } from '../nuvemshop/SyncStatus';

/** O resumo de uma análise: quantas mudanças, de que gravidade, e o que
 *  ficou de fora porque ninguém sabe decidir sozinho. */
export function ReconciliationSummary({ analise }: { analise: ReconciliationAnalysis }) {
  const { resumo } = analise;

  return (
    <>
      {analise.simulado && (
        <div className="faixa-simulado" role="note">
          <strong>Dados de exemplo.</strong> Nada aqui veio do servidor — esta
          tela existe para mostrar a forma da revisão que ainda vai ser
          construída. Nenhum número corresponde ao estoque real.
        </div>
      )}

      <p style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 'var(--r3)' }}>
        Rodada seca de {fmtDataHora(resumo.em)} — leu a loja, calculou o que
        mudaria e <strong>não escreveu nada lá</strong>.
      </p>

      <div className="grade" style={{ marginBottom: 'var(--r4)' }}>
        <MetricCard rotulo="Mudanças propostas" valor={resumo.total} />
        <MetricCard
          rotulo="Perigosas"
          valor={resumo.porRisco.perigoso}
          tom={resumo.porRisco.perigoso ? 'critico' : 'positivo'}
          nota="Tiram peça do ar"
        />
        <MetricCard
          rotulo="Para conferir"
          valor={resumo.porRisco.confere}
          tom={resumo.porRisco.confere ? 'atencao' : 'neutro'}
        />
        <MetricCard
          rotulo="Rotina"
          valor={resumo.porRisco.trivial}
          nota="Diferença de uma peça"
        />
      </div>

      {resumo.zerando > 0 && (
        <div className="aviso" data-tom="critico" style={{ marginBottom: 'var(--r4)' }}>
          <b>
            {resumo.zerando === 1
              ? '1 produto sairia do ar'
              : `${resumo.zerando} produtos sairiam do ar`}
            .
          </b>
          <div className="corpo">
            Mudança em massa quase sempre é dado nosso quebrado — uma importação
            que entrou errada, uma maleta lançada em dobro — e não a loja inteira
            tendo se esgotado de uma vez. Confira antes de aplicar pelo painel
            atual.
          </div>
        </div>
      )}

      {resumo.pendencias.length > 0 && (
        <div className="cartao" style={{ marginBottom: 'var(--r4)' }}>
          {resumo.pendencias.map((p) => (
            <article key={p.tipo} className="pendencia">
              <div className="cabeca">
                <span className="titulo">{TITULO_PENDENCIA[p.tipo]}</span>
                <StatusBadge tom="atencao">{p.quantidade}</StatusBadge>
              </div>
              <p className="descricao">{p.descricao}</p>
              {p.skus.length > 0 && (
                <div className="skus">
                  {p.skus.slice(0, 12).map((s) => (
                    <code key={s}>{s}</code>
                  ))}
                  {p.skus.length > 12 && (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      e mais {p.skus.length - 12}
                    </span>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

const TITULO_PENDENCIA: Record<string, string> = {
  duplicado: 'Cadastro duplicado na loja',
  variacao_sem_reparticao: 'Repartição de variação pela metade',
  variacao_soma_nao_bate: 'A loja discorda do nosso total',
  maleta: 'Peça com variação em maleta',
  pedido_sem_sku: 'Venda no site sem código conhecido',
  falta_cadastrar: 'Falta cadastrar na loja',
};
