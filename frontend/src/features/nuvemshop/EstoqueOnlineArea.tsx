import { useMemo, useState } from 'react';
import type { Connection } from '../../services/client';
import {
  conferirEstoque, ligarAutomatico, reconciliarDivergencias, sincronizarPendencias,
  tentarDeNovo, type EstoqueOnline, type ProblemaDaFila,
} from '../../services/nuvemshopEstoque';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtDataHora } from './SyncStatus';
import { saudeDoEstoqueOnline } from './estoqueOnline';

interface Props {
  conexao: Connection;
  resumo: EstoqueOnline;
  aoMudar: () => void;
}

const ROTULO_STATUS: Record<string, string> = {
  erro: 'Erro', revisao: 'Revisão', pendente: 'Aguardando',
};

/** §61 — o estado do envio de estoque para a loja, sem virar painel técnico.
 *
 *  Uma frase diz se está tudo bem. Embaixo, só o que pede gente: os códigos
 *  com erro (com "Tentar novamente"), os que precisam de revisão e os que
 *  esperam. As ferramentas administrativas — conferir, reconciliar,
 *  sincronizar pendências e o interruptor — ficam num bloco recolhido: elas
 *  são reserva do automático, não o caminho do dia a dia. */
export function EstoqueOnlineArea({ conexao, resumo, aoMudar }: Props) {
  const saude = useMemo(() => saudeDoEstoqueOnline(resumo, new Date()), [resumo]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'risk'; texto: string } | null>(null);
  const [confirmarReconciliar, setConfirmarReconciliar] = useState(false);

  async function agir(chave: string, acao: () => Promise<string>) {
    setOcupado(chave);
    setAviso(null);
    try {
      setAviso({ tom: 'ok', texto: await acao() });
      aoMudar();
    } catch (e) {
      setAviso({ tom: 'risk', texto: e instanceof Error ? e.message : 'Não consegui.' });
    } finally {
      setOcupado(null);
    }
  }

  const c = resumo.contagens ?? {};
  const problemas = resumo.problemas ?? [];
  const erros = problemas.filter((p) => p.status === 'erro');
  const revisao = problemas.filter((p) => p.status === 'revisao');
  const pendentes = problemas.filter((p) => p.status === 'pendente');
  const conf = resumo.conferencia;

  return (
    <section className="secao" aria-label="Estoque online">
      <div className="cartao" style={{ padding: 'var(--r4)' }}>
        <div style={{ display: 'flex', gap: 'var(--r4)', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge tom={saude.tom} ponto>{saude.rotulo}</StatusBadge>
          <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
            Última sincronização: <strong>{fmtDataHora(resumo.ultimaSincronizacaoEm ?? null)}</strong>
          </span>
          <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
            {c.sincronizado ?? 0} {(c.sincronizado ?? 0) === 1 ? 'sincronizado' : 'sincronizados'}
            {' · '}{c.pendente ?? 0} aguardando · {c.erro ?? 0} com erro
          </span>
        </div>
        {saude.motivo && (
          <p style={{ marginTop: 'var(--r3)', fontSize: 13.5, color: 'var(--muted)' }}>{saude.motivo}</p>
        )}
        <p style={{ marginTop: 'var(--r2)', fontSize: 12.5, color: 'var(--muted)' }}>
          A loja recebe o estoque <strong>em casa</strong> — peças com revendedoras não aparecem à venda online.
          Toda venda, saída, maleta, acerto e ajuste atualiza a loja sozinha.
        </p>
      </div>

      {aviso && (
        <p className={`mq-note ${aviso.tom === 'risk' ? 'mq-note--risk' : 'mq-note--info'}`} role="status">
          <span>{aviso.texto}</span>
        </p>
      )}

      {erros.length > 0 && (
        <ListaDeProblemas
          titulo="Com erro na Nuvemshop" itens={erros} ocupado={ocupado}
          aoTentar={(sku) => agir(`tentar:${sku}`, async () => {
            const r = await tentarDeNovo(conexao, sku);
            return r.status === 'sincronizada' ? `${sku}: sincronizado.` : `${sku}: ${r.status}.`;
          })}
        />
      )}
      {revisao.length > 0 && <ListaDeProblemas titulo="Precisam de revisão" itens={revisao} ocupado={ocupado} />}
      {pendentes.length > 0 && <ListaDeProblemas titulo="Aguardando sincronização" itens={pendentes} ocupado={ocupado} />}

      <details className="mq-card mq-card--pad" style={{ marginTop: 'var(--r4)' }}>
        <summary><b>Conferir e reconciliar com a Nuvemshop</b></summary>
        <div className="mq-stack" style={{ marginTop: 'var(--r3)' }}>
          <p className="mq-hint">
            Reserva do automático. <b>Conferir</b> lê a loja inteira e compara — não muda nada lá.
            <b> Reconciliar</b> manda o saldo do Marquesa para os códigos que divergem.
          </p>
          {conf && (
            <p style={{ fontSize: 13.5 }}>
              Última conferência {fmtDataHora(conf.em)}: <b>{conf.iguais}</b> variantes iguais,{' '}
              <b>{conf.divergentes}</b> divergentes, {conf.skusMapeados} códigos mapeados de{' '}
              {conf.produtosNaLoja} produtos na loja.
            </p>
          )}
          {(resumo.divergentes ?? []).length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="tabela">
                <thead>
                  <tr><th>SKU</th><th>Produto</th><th>Variante</th><th>Marquesa</th><th>Nuvemshop</th><th>Diferença</th></tr>
                </thead>
                <tbody>
                  {(resumo.divergentes ?? []).slice(0, 100).map((d) => (
                    <tr key={`${d.sku}-${d.ns_variante_id}`}>
                      <td className="mq-sku">{d.sku}</td>
                      <td>{d.produto}</td>
                      <td>{d.variante ?? '—'}</td>
                      <td>{d.online}</td>
                      <td>{d.ns_estoque}</td>
                      <td>{d.diferenca}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(resumo.excecoes ?? []).length > 0 && (
            <p className="mq-hint">
              {(resumo.excecoes ?? []).length} exceções que o sistema não reconcilia sozinho
              (SKU ausente, duplicado ou variante sem vínculo) — elas pedem correção do cadastro.
            </p>
          )}
          <div className="mq-btns">
            <button
              type="button" className="mq-btn mq-btn--secondary mq-btn--sm" disabled={!!ocupado}
              onClick={() => agir('conferir', async () => {
                const r = await conferirEstoque(conexao);
                return `Conferido: ${r.resumo.iguais} iguais, ${r.resumo.divergentes} divergentes.`;
              })}
            >
              {ocupado === 'conferir' ? 'Lendo a loja…' : 'Conferir estoque com Nuvemshop'}
            </button>
            {!!conf && conf.divergentes > 0 && !confirmarReconciliar && (
              <button
                type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={!!ocupado}
                onClick={() => setConfirmarReconciliar(true)}
              >
                Reconciliar divergências
              </button>
            )}
            {confirmarReconciliar && (
              <button
                type="button" className="mq-btn mq-btn--danger mq-btn--sm" disabled={!!ocupado}
                onClick={() => agir('reconciliar', async () => {
                  setConfirmarReconciliar(false);
                  const r = await reconciliarDivergencias(conexao);
                  return `${r.codigos} códigos enviados com o saldo do Marquesa.`;
                })}
              >
                Confirmar: mandar o saldo do Marquesa para {conf?.divergentes} variantes
              </button>
            )}
            <button
              type="button" className="mq-btn mq-btn--ghost mq-btn--sm" disabled={!!ocupado}
              onClick={() => agir('sincronizar', async () => {
                const r = await sincronizarPendencias(conexao);
                return r.motivo || `${r.sincronizados} sincronizados, ${r.erros} com erro.`;
              })}
            >
              Sincronizar pendências
            </button>
            <button
              type="button" className="mq-btn mq-btn--link mq-btn--sm" disabled={!!ocupado}
              onClick={() => agir('automatico', async () => {
                const r = await ligarAutomatico(conexao, !resumo.ativo);
                return r.ativo ? 'Sincronização automática ligada.' : 'Sincronização automática desligada.';
              })}
            >
              {resumo.ativo ? 'Desligar automático (emergência)' : 'Ligar sincronização automática'}
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}

function ListaDeProblemas({
  titulo, itens, ocupado, aoTentar,
}: {
  titulo: string;
  itens: ProblemaDaFila[];
  ocupado: string | null;
  aoTentar?: (sku: string) => void;
}) {
  return (
    <section className="mq-card mq-card--flush" style={{ marginTop: 'var(--r4)' }} aria-label={titulo}>
      <h3 className="mq-subtitle" style={{ padding: 'var(--r3) var(--r4) 0' }}>{titulo} · {itens.length}</h3>
      <div className="mq-list">
        {itens.slice(0, 50).map((p) => (
          <div key={p.sku} className="mq-item" style={{ cursor: 'default' }}>
            <span className="mq-item__main">
              <b>{p.desc || p.sku}</b>
              <small>
                <span className="mq-sku">{p.sku}</span>
                {p.acao ? ` · ${p.acao}` : ''}
                {` · ${fmtDataHora(p.ultimaTentativaEm || p.pedidoEm)}`}
                {p.tentativas > 0 ? ` · ${p.tentativas} ${p.tentativas === 1 ? 'tentativa' : 'tentativas'}` : ''}
              </small>
              {p.erro && <small>{p.erro}</small>}
            </span>
            <span className="mq-item__side">
              <span className={`mq-status ${p.status === 'erro' ? 'mq-status--risk' : p.status === 'revisao' ? 'mq-status--warn' : 'mq-status--info'}`}>
                {ROTULO_STATUS[p.status] ?? p.status}
              </span>
              {aoTentar && (
                <button
                  type="button" className="mq-btn mq-btn--secondary mq-btn--sm"
                  disabled={!!ocupado} onClick={() => aoTentar(p.sku)}
                >
                  {ocupado === `tentar:${p.sku}` ? 'Enviando…' : 'Tentar novamente'}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
