import { useEffect, useState } from 'react';
import type { Connection } from '../../services/client';
import { Drawer } from '../../components/Drawer';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtData, money, plural } from '../../domain/formato';
import {
  buscarHistorico, ROTULO_SITUACAO, TOM_SITUACAO, giroDoCiclo, pct,
  type AcertoHistorico, type AcertoResumo,
} from './acertos';

/** Tudo o que se sabe de UM acerto, lido do registro real.
 *
 *  O que o sistema não tem é dito no lugar do número — "maleta não
 *  registrada", "quem conferiu: não registrado" — em vez de um zero ou de
 *  um traço que parece dado. */
export function DetalheDoAcerto({ acerto }: { acerto: AcertoHistorico }) {
  const vendidas = acerto.itensVendidos.reduce((s, i) => s + i.qtd, 0);
  const devolvidas = acerto.itensDevolvidos.reduce((s, i) => s + i.qtd, 0);
  const valorDaVenda = acerto.fonte === 'documento' ? 'valor na planilha' : 'valor na venda';
  const giro = giroDoCiclo(acerto);
  return (
    <div className="acerto-detalhe">
      <dl className="acerto-detalhe__numeros">
        <div><dt>Maleta</dt><dd>{acerto.maletaId ? `#${acerto.maletaId}` : 'não registrada'}</dd></div>
        <div><dt>Enviadas</dt><dd>{acerto.enviadas ?? '—'}</dd></div>
        <div><dt>Vendidas</dt><dd>{acerto.pecasVendidas}</dd></div>
        <div><dt>Devolvidas</dt><dd>{acerto.devolvidas ?? '—'}</dd></div>
        <div><dt>Giro do ciclo</dt><dd>{pct(giro)}</dd></div>
      </dl>
      <dl className="acerto-detalhe__dinheiro">
        <div><dt>Vendido</dt><dd>{money(acerto.vendido)}</dd></div>
        <div><dt>Comissão</dt><dd>{money(acerto.comissao)}</dd></div>
        <div><dt>Líquido Marquesa</dt><dd>{money(acerto.liquido)}</dd></div>
      </dl>

      <section className="acerto-detalhe__bloco" aria-label="Peças vendidas">
        <h4>Vendidas <small>{vendidas} {plural(vendidas, 'peça', 'peças')} · {acerto.itensVendidos.length} {plural(acerto.itensVendidos.length, 'código', 'códigos')}</small></h4>
        {acerto.itensVendidos.length ? (
          <ul className="acerto-detalhe__itens">
            {acerto.itensVendidos.map((i) => (
              <li key={`v${i.sku}${i.destino ?? ''}`}>
                <code>{i.sku}</code><span>{i.desc ?? 'fora do catálogo'}</span>
                <b>× {i.qtd}</b>
                <small>{i.valor != null ? money(i.valor) : ''}{i.destino && i.destino !== 'vendida' ? ` · ${i.destino}` : ''}</small>
              </li>
            ))}
          </ul>
        ) : <p className="dica">Nenhuma peça vendida neste acerto.</p>}
        {acerto.itensVendidos.some((i) => i.valor != null) && (
          <p className="dica">Valores por peça: {valorDaVenda}{acerto.fonte === 'documento' ? ' (o que a revendedora pagou, já sem a comissão)' : ''}.</p>
        )}
      </section>

      <section className="acerto-detalhe__bloco" aria-label="Peças devolvidas">
        <h4>Devolvidas <small>{devolvidas} {plural(devolvidas, 'peça', 'peças')}</small></h4>
        {acerto.itensDevolvidos.length ? (
          <ul className="acerto-detalhe__itens">
            {acerto.itensDevolvidos.map((i) => (
              <li key={`d${i.sku}`}><code>{i.sku}</code><span>{i.desc ?? 'fora do catálogo'}</span><b>× {i.qtd}</b><small /></li>
            ))}
          </ul>
        ) : (
          <p className="dica">{acerto.maletaId
            ? 'Nenhuma peça devolvida.'
            : 'Acerto anterior ao sistema: a maleta dele não está registrada aqui, então as devolvidas não são conhecidas.'}</p>
        )}
      </section>

      {!!acerto.linhasExcluidas?.length && (
        <section className="acerto-detalhe__bloco" aria-label="Linhas excluídas do acerto">
          <h4>Fora do acerto</h4>
          <ul className="acerto-detalhe__itens">
            {acerto.linhasExcluidas.map((l) => (
              <li key={`x${l.linha}`}><code>{l.sku}</code><span>{l.motivo ?? 'linha excluída pela decisão'} · linha {l.linha}</span><b>× {l.qtd}</b><small>{money(l.valor)}</small></li>
            ))}
          </ul>
        </section>
      )}

      {!!acerto.correcoes?.length && (
        <section className="acerto-detalhe__bloco" aria-label="Correções">
          <h4>Correções <small>versão atual: {acerto.versao ?? 1}</small></h4>
          <ul className="acerto-detalhe__correcoes">
            {acerto.correcoes.map((c) => (
              <li key={c.id}>
                Versão {c.versao} ({c.situacao === 'substituida' ? 'substituída' : c.situacao}
                {c.registradaEm ? `, registrada em ${fmtData(String(c.registradaEm))}` : ''}):
                {' '}{c.pecas} {plural(c.pecas, 'peça', 'peças')} · vendido {money(c.vendido)} · comissão {money(c.comissao)} · líquido {money(c.liquido)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="acerto-detalhe__origem" aria-label="Origem do acerto">
        <h4>Origem</h4>
        <p>
          {acerto.fonte === 'sistema' ? 'Acerto feito no sistema' : 'Acerto registrado no histórico de vendas'}
          {acerto.documento ? ` · ${acerto.documento}` : ''}
          {acerto.vendaId ? ` · venda #${acerto.vendaId} gerada pelo acerto` : ''}
          {acerto.linhasPlanilha?.length ? ` · linhas da planilha ${acerto.linhasPlanilha.join(', ')}` : ''}.
        </p>
        {!!acerto.observacoes?.length && <p>Observações: {acerto.observacoes.join(' · ')}</p>}
        <p>Conferido por: {acerto.conferidoPor ?? 'não registrado (o sistema ainda não tem usuários)'}.</p>
      </section>
    </div>
  );
}

/** A gaveta que abre de qualquer linha de acerto fora da ficha. Lê o
 *  histórico da revendedora — a fonte com SKU a SKU — e acha o acerto pelo
 *  mesmo id que a Visão geral usa. */
export function AcertoDrawer({
  conexao, acerto, aoFechar, aoAbrirRevendedora,
}: {
  conexao: Connection;
  acerto: AcertoResumo | null;
  aoFechar: () => void;
  aoAbrirRevendedora: (id: number) => void;
}) {
  const [detalhe, setDetalhe] = useState<AcertoHistorico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const id = acerto?.id ?? null;
  const revId = acerto?.revendedoraId ?? null;

  useEffect(() => {
    if (!id || revId == null) return;
    const ctl = new AbortController();
    setDetalhe(null);
    setErro(null);
    buscarHistorico(conexao, revId, ctl.signal)
      .then((h) => {
        const achado = h.acertos.find((a) => a.id === id);
        if (achado) setDetalhe(achado);
        else setErro('Este acerto não está mais no histórico da revendedora. Atualize a página.');
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setErro(e instanceof Error ? e.message : 'Não consegui ler o acerto.');
      });
    return () => ctl.abort();
  }, [conexao, id, revId]);

  if (!acerto) return null;
  return (
    <Drawer
      aberto
      largura="largo"
      titulo={`Acerto de ${acerto.revendedora}`}
      sub={[
        acerto.data ? fmtData(acerto.data) : 'sem data',
        acerto.maletaId ? `Maleta #${acerto.maletaId}` : null,
        acerto.fonte,
      ].filter(Boolean).join(' · ')}
      aoFechar={aoFechar}
      rodape={
        <button type="button" className="btn btn-leitura" onClick={() => aoAbrirRevendedora(acerto.revendedoraId)}>
          Abrir ficha de {acerto.revendedora}
        </button>
      }
    >
      <div className="acerto-detalhe__selos">
        <StatusBadge tom={TOM_SITUACAO[acerto.situacaoFinanceira]}>{ROTULO_SITUACAO[acerto.situacaoFinanceira]}</StatusBadge>
        {acerto.status === 'inativa' && <StatusBadge tom="neutro">Revendedora inativa</StatusBadge>}
      </div>
      {erro && <p className="rev-historico-aviso" role="alert">{erro}</p>}
      {!detalhe && !erro && <p className="rev-historico-aviso" aria-busy="true">Lendo as peças do acerto…</p>}
      {detalhe && <DetalheDoAcerto acerto={detalhe} />}
    </Drawer>
  );
}
