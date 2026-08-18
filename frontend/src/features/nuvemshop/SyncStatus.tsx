import type { SyncSummary } from '../../types/api';
import type { DiagnosticoSync, EstadoSync } from './saude';
import { parseDataBackend } from '../../services/datas';
import { StatusBadge, type Tom } from '../../components/StatusBadge';

interface Props {
  sync: SyncSummary;
  lidoEm: string | null;
  /** O MESMO diagnóstico que decide as pendências. Uma segunda cópia da
   *  regra aqui em cima é como a tela passa a dizer "Conectada" enquanto a
   *  lista abaixo diz que ninguém vai consertar nada. */
  diagnostico: DiagnosticoSync;
}

/** Data e hora no fuso de quem está olhando, sem inventar precisão. */
export function fmtDataHora(iso: string | null): string {
  if (!iso) return '—';
  const d = parseDataBackend(iso);
  if (!d) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** As duas rodadas automáticas: 06:00 e 18:00 em Brasília
 *  (cron `0 9,21 * * *` UTC, em api/wrangler.toml). */
export function proximaRodada(agora: Date): string {
  const hora = agora.getHours();
  if (hora < 6) return 'hoje às 06:00';
  if (hora < 18) return 'hoje às 18:00';
  return 'amanhã às 06:00';
}

/** Que gravidade visual cada estado merece. `desconectada` é `neutro` de
 *  propósito: nunca ter ligado a loja é uma decisão, não uma falha — quem
 *  atualiza por arquivo não precisa ver vermelho todo dia. */
const TOM_POR_ESTADO: Record<EstadoSync, Tom> = {
  saudavel: 'positivo',
  desconectada: 'neutro',
  nunca_rodou: 'atencao',
  atrasada: 'atencao',
  pausada: 'atencao',
  travada: 'critico',
  erro: 'critico',
};

/** O ESTADO da integração. Uma linha, um tom, sem banner.
 *
 *  No painel legado isto ocupa três avisos empilhados com a mesma
 *  severidade visual — e aviso que está sempre lá deixa de ser aviso. */
export function SyncStatus({ sync, lidoEm, diagnostico }: Props) {
  const tom: Tom = TOM_POR_ESTADO[diagnostico.estado];
  const rotulo = diagnostico.rotulo;
  /* Estado saudável não precisa de parágrafo: "Sincronizando normalmente"
     já disse tudo, e explicar o normal é o que enche a tela de ruído. */
  const detalhe = diagnostico.estado === 'saudavel' ? null : diagnostico.motivo;

  return (
    <section className="secao">
      <div className="cartao" style={{ padding: 'var(--r4)' }}>
        <div
          style={{
            display: 'flex',
            gap: 'var(--r4)',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <StatusBadge tom={tom} ponto>
            {rotulo}
          </StatusBadge>

          <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
            Última sincronização: <strong>{fmtDataHora(sync.ultimaEm)}</strong>
          </span>

          {sync.conectada && (
            <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
              Próxima: <strong>{proximaRodada(new Date())}</strong>
            </span>
          )}

          {lidoEm && lidoEm !== sync.ultimaEm && (
            <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
              Retrato da loja: <strong>{fmtDataHora(lidoEm)}</strong>
            </span>
          )}
        </div>

        {detalhe && (
          <p style={{ marginTop: 'var(--r3)', fontSize: 13.5, color: 'var(--muted)' }}>
            {detalhe}
          </p>
        )}
      </div>
    </section>
  );
}
