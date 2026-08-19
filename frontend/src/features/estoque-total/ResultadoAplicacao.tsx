import { MetricCard } from '../../components/MetricCard';
import type { RespostaAplicar } from './tipos';

interface Props {
  resultado: RespostaAplicar;
  aoNovaAnalise: () => void;
}

/** Mostra o estado REAL — §20 do pedido: nunca "Tudo certo!" quando não
 *  está tudo certo. */
export function ResultadoAplicacao({ resultado, aoNovaAnalise }: Props) {
  const tudoCerto = resultado.erros === 0 && resultado.obsoletos === 0;

  return (
    <div className="cartao" style={{ padding: 'var(--r5)' }}>
      <h3 style={{ marginBottom: 'var(--r3)' }}>
        {resultado.parcial
          ? 'Aplicação em andamento'
          : tudoCerto
            ? 'Importação concluída'
            : 'Importação concluída com pendências'}
      </h3>

      <div className="grade" style={{ marginBottom: 'var(--r4)' }}>
        <MetricCard rotulo="Aplicados" valor={resultado.aplicados} tom="positivo" />
        <MetricCard
          rotulo="Precisam de nova análise"
          valor={resultado.obsoletos}
          tom={resultado.obsoletos ? 'atencao' : 'neutro'}
          nota="O estoque mudou desde a análise"
        />
        <MetricCard rotulo="Erros" valor={resultado.erros} tom={resultado.erros ? 'critico' : 'neutro'} />
      </div>

      {resultado.obsoletos > 0 && (
        <div className="aviso" data-tom="atencao" style={{ marginBottom: 'var(--r3)' }}>
          <b>Alguns itens mudaram depois da análise.</b>
          <div className="corpo">
            O estoque desses códigos foi alterado por outro motivo entre a análise e agora. Gere uma nova análise
            antes de aplicá-los.
          </div>
        </div>
      )}

      {resultado.erros > 0 && (
        <div className="aviso" data-tom="critico" style={{ marginBottom: 'var(--r3)' }}>
          <b>Alguns itens não puderam ser aplicados.</b>
          <div className="corpo">Erro técnico na escrita — pode tentar novamente numa análise nova.</div>
        </div>
      )}

      {resultado.parcial && (
        <div className="aviso" data-tom="neutro" style={{ marginBottom: 'var(--r3)' }}>
          Ainda há itens sendo processados. Atualize a sessão em alguns instantes.
        </div>
      )}

      <div className="acoes">
        <button type="button" className="btn btn-leitura" onClick={aoNovaAnalise}>
          Nova análise
        </button>
      </div>
    </div>
  );
}
