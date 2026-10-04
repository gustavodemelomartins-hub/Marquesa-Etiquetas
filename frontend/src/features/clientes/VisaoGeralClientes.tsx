import { useState, type ReactNode } from 'react';
import { useApi, type EstadoRequisicao } from '../../hooks/useApi';
import { AvatarCliente } from '../../components/AvatarCliente';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData, plural } from '../../domain/formato';
import { buscarBase } from './api';
import { contarEstados, haQuanto, recorrentes, topCompradoras } from './base';
import type { Connection } from '../../services/client';
import type { BaseDeClientes, ClienteDaBase } from './tipos';

interface Props {
  conexao: Connection;
  /** A base inteira (`periodo=tudo`). Quem sumiu e quem é recorrente só se
   *  mede olhando a história toda — num recorte de 90 dias, quem parou de
   *  comprar há um ano nem aparece. */
  baseInteira: EstadoRequisicao<BaseDeClientes>;
  aoAbrir: (c: ClienteDaBase) => void;
}

const PERIODOS = [
  { id: '90d', rotulo: '3 meses' },
  { id: '12m', rotulo: '12 meses' },
  { id: 'tudo', rotulo: 'Tudo' },
] as const;

const POUCOS = 6;

/** CLIENTES › VISÃO GERAL — quem compra, quem compra sempre, e quem sumiu.
 *
 *  A composição saiu da auditoria do painel clássico (01/10/2026). Lá a aba
 *  chegou a ter oito blocos e a dona pediu "só os meus clientes"; ficaram
 *  Top clientes e a lista. Aqui a lista continua sendo a outra aba, e esta
 *  traz o que serve para AGIR: quatro números do período, o Top, quem
 *  chamar de volta e quem compra sempre. Sem gráfico decorativo. */
export function VisaoGeralClientes({ conexao, baseInteira, aoAbrir }: Props) {
  const [periodo, setPeriodo] = useState<string>('12m');
  const doPeriodo = useApi(
    (s) => (periodo === 'tudo' && baseInteira.dados
      ? Promise.resolve(baseInteira.dados)
      : buscarBase(conexao, periodo, s)),
    [conexao, periodo, periodo === 'tudo' ? baseInteira.dados : null],
  );

  const k = doPeriodo.dados?.kpis;
  const top = topCompradoras(doPeriodo.dados?.todos ?? []);
  const sumiram = (baseInteira.dados?.reativacao ?? []).filter((c) => c.identificada);
  const fieis = recorrentes(baseInteira.dados?.todos ?? []);
  const estados = contarEstados(baseInteira.dados?.todos ?? []);

  return (
    <>
      <div className="mq-filters mq-filters--plain">
        <div className="mq-chipset" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.id} type="button" aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}>
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      {doPeriodo.erro ? (
        <section className="mq-card"><ErrorState erro={doPeriodo.erro} aoTentarDeNovo={doPeriodo.recarregar} /></section>
      ) : (
        <div className="mq-kpis" aria-busy={!k}>
          <div className="mq-kpi">
            <span className="mq-kpi__label">Compraram</span>
            <span className="mq-kpi__value">{k ? k.ativos : '—'}</span>
            <span className="mq-kpi__foot">clientes no período</span>
          </div>
          <div className="mq-kpi mq-kpi--ok">
            <span className="mq-kpi__label">Novas</span>
            <span className="mq-kpi__value">{k?.novos ?? '—'}</span>
            <span className="mq-kpi__foot">{periodo === 'tudo' ? 'escolha um período' : 'primeira compra no período'}</span>
          </div>
          <div className="mq-kpi">
            <span className="mq-kpi__label">Voltaram a comprar</span>
            <span className="mq-kpi__value">{k ? k.recorrentes : '—'}</span>
            <span className="mq-kpi__foot">{k ? `${k.recorrentesPct}% compraram 2 vezes ou mais` : ''}</span>
          </div>
          <div className="mq-kpi">
            <span className="mq-kpi__label">Ticket médio</span>
            <span className="mq-kpi__value">{k?.ticketMedioPorVenda == null ? '—' : money(k.ticketMedioPorVenda)}</span>
            <span className="mq-kpi__foot">por compra</span>
          </div>
        </div>
      )}

      <div className="mq-grid mq-grid--2">
        <Bloco
          titulo="Top clientes"
          sub="quem mais comprou no período"
          vazio="Ninguém comprou neste período."
          carregando={!doPeriodo.dados}
          clientes={top}
          conexao={conexao} aoAbrir={aoAbrir}
          numerado
          detalhe={(c) => `${c.vendas} ${plural(c.vendas, 'compra', 'compras')} · última ${fmtData(c.ultimaCompra)}`}
          valor={(c) => money(c.comprado)}
        />

        <Bloco
          titulo="Para chamar de volta"
          sub={[
            estados['em risco'] ? `${estados['em risco']} ${plural(estados['em risco'], 'sumindo', 'sumindo')}` : '',
            estados.inativa ? `${estados.inativa} ${plural(estados.inativa, 'parada', 'paradas')}` : '',
          ].filter(Boolean).join(' · ') || 'sem comprar há mais tempo que o normal'}
          vazio="Ninguém sumiu. Todas estão comprando no ritmo de sempre."
          carregando={!baseInteira.dados}
          erro={baseInteira.erro}
          clientes={sumiram}
          conexao={conexao} aoAbrir={aoAbrir}
          detalhe={(c) => `última compra ${haQuanto(c.diasSemComprar)} · ${c.vendas} ${plural(c.vendas, 'compra', 'compras')}`}
          valor={(c) => money(c.comprado)}
          selo={(c) => (c.estado === 'inativa'
            ? <span className="mq-status mq-status--risk">parada</span>
            : <span className="mq-status mq-status--warn">sumindo</span>)}
        />
      </div>

      <Bloco
        titulo="Clientes recorrentes"
        sub="compram sempre e estão em dia"
        vazio="Ainda não há cliente recorrente."
        carregando={!baseInteira.dados}
        erro={baseInteira.erro}
        clientes={fieis}
        conexao={conexao} aoAbrir={aoAbrir}
        detalhe={(c) => `${c.vendas} compras · última ${fmtData(c.ultimaCompra)}${c.frequenciaDias ? ` · a cada ${c.frequenciaDias} dias` : ''}`}
        valor={(c) => money(c.comprado)}
      />
    </>
  );
}

function Bloco({
  titulo, sub, vazio, carregando, erro, clientes, aoAbrir, detalhe, valor, selo, numerado = false, conexao,
}: {
  conexao: Connection;
  titulo: string;
  sub: string;
  vazio: string;
  carregando: boolean;
  erro?: unknown;
  clientes: ClienteDaBase[];
  aoAbrir: (c: ClienteDaBase) => void;
  detalhe: (c: ClienteDaBase) => string;
  valor: (c: ClienteDaBase) => string;
  selo?: (c: ClienteDaBase) => ReactNode;
  numerado?: boolean;
}) {
  const [todos, setTodos] = useState(false);
  const visiveis = todos || numerado ? clientes : clientes.slice(0, POUCOS);
  return (
    <section className="mq-card mq-card--flush" aria-label={titulo}>
      <div className="mq-card__head">
        <div>
          <h2 className="mq-title">{titulo}</h2>
          {sub && <p className="mq-lede">{sub}</p>}
        </div>
      </div>
      {erro ? (
        <ErrorState erro={erro} />
      ) : carregando ? (
        <div className="mq-card__body"><p className="mq-skel mq-skel--line" /><p className="mq-skel mq-skel--line" /></div>
      ) : clientes.length === 0 ? (
        <div className="mq-state">
          <span className="mq-state__icon"><Icone nome="check" /></span>
          <p>{vazio}</p>
        </div>
      ) : (
        <div className="mq-list">
          {visiveis.map((c, i) => (
            <button type="button" className="mq-item" key={c.norm} onClick={() => aoAbrir(c)}>
              {numerado && <span className="mq-item__icon">{i + 1}</span>}
              <span className="mq-item__main mq-quem">
                <AvatarCliente nome={c.nome} avatarUrl={c.avatarUrl} sugestao={c.avatarSugestao} conexao={conexao} tamanho="sm" />
                <span className="mq-quem__txt">
                  <b>{c.nome}</b>
                  <small>{detalhe(c)}</small>
                </span>
              </span>
              <span className="mq-item__side">
                {selo?.(c)}
                <b className="mq-money">{valor(c)}</b>
              </span>
            </button>
          ))}
        </div>
      )}
      {!numerado && clientes.length > POUCOS && (
        <div className="mq-card__foot">
          <button type="button" className="mq-btn mq-btn--link" onClick={() => setTodos((v) => !v)}>
            {todos ? 'Mostrar menos' : `Ver todas (${clientes.length})`}
          </button>
        </div>
      )}
    </section>
  );
}
