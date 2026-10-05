import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData } from '../../domain/formato';
import { AbrirGarantia } from './AbrirGarantia';
import { MiniaturaDoReparo, useCasosDeReparo } from './CasosDeReparo';
import { PENDENTES, STATUS, type Garantia } from './tipos';

/* A forma da garantia, os rótulos de status e as duas listas de estado moram
   em `./tipos.ts`: a ficha da cliente lê a MESMA resposta, e um contrato
   descrito dentro de um componente é um contrato que a próxima tela
   redescreve. */

interface Props {
  conexao: Connection;
  sub: string | null;
  aoNavegar: (sub: string | null) => void;
}

/** GARANTIAS, REPAROS E TROCAS — o que está em andamento e o que espera
 *  uma ação nossa.
 *
 *  O relógio vem pronto do backend: dias ÚTEIS, feriado cadastrado não
 *  conta, e ele PARA quando o caso encerra. A tela não recalcula nada —
 *  duas contas de prazo é como as duas discordam.
 *
 *  5.4e — de estado terminal não se sai. Se a peça voltou, o caminho é um
 *  atendimento novo ligado ao anterior, e não trocar o status do caso
 *  antigo, que apagaria a história.
 */
export function GarantiasArea({ conexao, sub, aoNavegar }: Props) {
  const filtro = sub && STATUS.some((s) => s.id === sub) ? sub : (sub === 'todas' ? null : 'pendentes');
  /* O detalhe do caso é o MESMO do Início e da ficha da cliente
     (`CasoDeReparo`, aberto pelo provedor do App). */
  const casos = useCasosDeReparo();
  /* `#/garantias/nova` é o atalho "A peça voltou" do Início. */
  const [abrindo, setAbrindo] = useState(sub === 'nova');

  const lista = useApi(
    (s) => chamar<{ garantias: Garantia[] }>(
      conexao, 'GET',
      `/api/garantias?limite=200${filtro && filtro !== 'pendentes' ? `&status=${filtro}` : ''}`,
      undefined, { signal: s },
    ),
    [conexao, filtro, casos?.versao],
  );

  const garantias = useMemo(() => {
    const todas = lista.dados?.garantias ?? [];
    return filtro === 'pendentes' ? todas.filter((g) => g.pendente) : todas;
  }, [lista.dados, filtro]);

  const atrasadas = garantias.filter((g) => g.atrasado).length;

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Pós-venda</p>
          <h1 className="mq-display">Garantias e reparos</h1>
          <p className="mq-lede">
            O que está em andamento e o que espera uma ação nossa. O prazo é
            em dias úteis, e ele para quando o caso encerra.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <button type="button" className="mq-btn mq-btn--primary" onClick={() => setAbrindo(true)}>
            <Icone nome="plus" />
            A peça voltou
          </button>
        </div>
      </div>

      <div className="mq-kpis">
        <div className="mq-kpi">
          <span className="mq-kpi__label">Em andamento</span>
          <span className="mq-kpi__value">{garantias.filter((g) => g.pendente).length}</span>
          <span className="mq-kpi__foot">casos que ainda pedem alguma coisa</span>
        </div>
        <div className={atrasadas ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
          <span className="mq-kpi__label">Atrasadas</span>
          <span className="mq-kpi__value">{atrasadas}</span>
          <span className="mq-kpi__foot">passaram do prazo combinado</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Trocas com crédito</span>
          <span className="mq-kpi__value">
            {garantias.filter((g) => g.troca && g.troca.creditoAoCliente > 0).length}
          </span>
          <span className="mq-kpi__foot">peça mais barata virou crédito da cliente</span>
        </div>
      </div>

      <div className="mq-filters">
        <div className="mq-chipset" role="group" aria-label="Situação">
          <button type="button" aria-pressed={filtro === 'pendentes'} onClick={() => aoNavegar(null)}>
            Em andamento
          </button>
          <button type="button" aria-pressed={filtro === null} onClick={() => aoNavegar('todas')}>
            Todas
          </button>
          {STATUS.map((s) => (
            <button key={s.id} type="button" aria-pressed={filtro === s.id} onClick={() => aoNavegar(s.id)}>
              {s.rotulo.split(' · ')[0]}
            </button>
          ))}
        </div>
        <span className="mq-filters__count">
          {lista.carregando ? 'carregando…' : `${garantias.length} ${garantias.length === 1 ? 'caso' : 'casos'}`}
        </span>
      </div>

      <section className="mq-card mq-card--flush">
        {lista.erro ? (
          <ErrorState erro={lista.erro} aoTentarDeNovo={lista.recarregar} />
        ) : garantias.length === 0 && !lista.carregando ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="shield" /></span>
            <h3>Nenhum caso aqui</h3>
            <p>Peça que volta por defeito, reparo ou troca aparece nesta lista com o prazo correndo.</p>
          </div>
        ) : (
          <div className="mq-list">
            {garantias.map((g) => (
              <button type="button" className="mq-item" key={g.id} onClick={() => casos?.abrir(g.id)}>
                <MiniaturaDoReparo
                  sku={g.sku}
                  nome={g.produtoNome ?? g.sku}
                  tom={g.atrasado ? 'risk' : g.pendente ? 'warn' : 'ok'}
                  icone={g.troca ? 'swap' : 'shield'}
                />
                <span className="mq-item__main">
                  <b>{g.produtoNome ?? g.sku}{g.variacao ? ` · ${g.variacao}` : ''}</b>
                  <small>
                    {g.clienteNome ?? 'cliente não identificada'} · {g.motivo} · entrou {fmtData(g.dataEntrada)}
                    {g.pendente && g.diasUteisRestantes !== null
                      ? (g.atrasado
                        ? ` · ${g.atrasoDiasUteis} dias úteis de atraso`
                        : ` · faltam ${g.diasUteisRestantes} dias úteis`)
                      : ''}
                  </small>
                </span>
                <span className="mq-item__side">
                  {g.troca && g.troca.creditoAoCliente > 0 && (
                    <span className="mq-chip mq-chip--brand">crédito {money(g.troca.creditoAoCliente)}</span>
                  )}
                  <span className={`mq-status ${g.atrasado ? 'mq-status--risk' : g.pendente ? 'mq-status--warn' : 'mq-status--ok'}`}>
                    {g.statusRotulo}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {abrindo && (
        <AbrirGarantia
          conexao={conexao}
          aoFechar={() => setAbrindo(false)}
          aoAbrir={(id) => {
            setAbrindo(false);
            lista.recarregar();
            casos?.abrir(id);
          }}
        />
      )}
    </>
  );
}

export { PENDENTES };
