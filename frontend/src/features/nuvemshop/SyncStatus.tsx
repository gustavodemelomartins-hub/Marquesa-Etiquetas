import type { SyncSummary } from '../../types/api';
import { StatusBadge, type Tom } from '../../components/StatusBadge';

interface Props {
  sync: SyncSummary;
  lidoEm: string | null;
}

/** Data e hora no fuso de quem está olhando, sem inventar precisão. */
export function fmtDataHora(iso: string | null): string {
  if (!iso) return '—';
  /* O backend grava `datetime('now')` do SQLite, que é UTC sem sufixo. Sem
     o "Z" o navegador leria como hora local e a última sincronização
     apareceria três horas no futuro. */
  const normalizado = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso)
    ? iso.replace(' ', 'T') + 'Z'
    : iso;
  const d = new Date(normalizado);
  if (Number.isNaN(d.getTime())) return iso;
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

/** O ESTADO da integração. Uma linha, um tom, sem banner.
 *
 *  No painel legado isto ocupa três avisos empilhados com a mesma
 *  severidade visual — e aviso que está sempre lá deixa de ser aviso. */
export function SyncStatus({ sync, lidoEm }: Props) {
  let tom: Tom = 'positivo';
  let rotulo = 'Conectada';
  let detalhe: string | null = null;

  if (!sync.conectada) {
    tom = 'neutro';
    rotulo = 'Não conectada';
    detalhe =
      'Falta cadastrar o token da loja nos Secrets do Worker. Enquanto isso, a atualização continua sendo por arquivo.';
  } else if (sync.erro) {
    tom = 'critico';
    rotulo = 'Última rodada falhou';
    detalhe = sync.erro;
  } else if (sync.pausada) {
    tom = 'atencao';
    rotulo = 'Pausada pelo freio';
    detalhe = `${sync.pausada.motivo} A rodada não mexeu na loja.`;
  }

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
