import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import type { Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { fmtData, plural } from '../../domain/formato';
import { listarSaidas } from './api';
import { TIPOS_DE_SAIDA } from './tipos';
import { intervaloDoAtalho, resumirSaidas } from './analise';

type Atalho = 'tudo' | '30d' | '7d';
type Situacao = 'todas' | 'vigentes' | 'estornadas';

interface Props {
  conexao: Connection;
}

/** ANÁLISE DE SAÍDAS — a tela do protótipo, com os dados reais e uma
 *  recusa no lugar de um número inventado.
 *
 *  O protótipo desenha quatro cartões de CUSTO. Não existe custo no
 *  sistema: nem `produtos` nem `saidas_sem_faturamento` têm a coluna, e
 *  nenhuma rota devolve uma. O que existe é `produtos.preco`, que é o
 *  preço de VENDA — somá-lo e chamar de custo faria uma peça dada de
 *  brinde "custar" o valor que ela teria rendido.
 *
 *  Então a composição é a do protótipo e os cartões de custo dizem "não
 *  informado", com o número de registros sem custo à vista. O que é real
 *  — peças retiradas, peças estornadas, lançamentos, distribuição por
 *  motivo — aparece com o número de verdade.
 */
export function AnaliseDeSaidas({ conexao }: Props) {
  const [atalho, setAtalho] = useState<Atalho>('tudo');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('todas');
  const [motivo, setMotivo] = useState<string>('');

  /* O intervalo digitado VENCE o atalho: quem escreveu duas datas quer
     essas duas datas. Meia data é ignorada — e o atalho continua valendo,
     visivelmente marcado, em vez de a tela responder sobre um recorte que
     ninguém pediu. */
  const livre = de && ate && de <= ate;
  const janela = livre ? { de, ate } : intervaloDoAtalho(atalho);

  const lista = useApi(
    (s) => listarSaidas(conexao, {
      de: janela.de,
      ate: janela.ate,
      tipo: motivo || null,
      incluirEstornadas: situacao !== 'vigentes',
      limite: 500,
    }, s),
    [conexao, janela.de, janela.ate, motivo, situacao],
  );

  const saidas = useMemo(() => {
    const todas = lista.dados?.saidas ?? [];
    /* `estornadas` não é um filtro do backend — ele só sabe INCLUIR ou
       não. O recorte "só as estornadas" é feito aqui, sobre o que veio. */
    if (situacao === 'estornadas') return todas.filter((s) => s.estornada);
    return todas;
  }, [lista.dados, situacao]);

  const r = useMemo(() => resumirSaidas(saidas), [saidas]);
  const maiorBarra = Math.max(1, ...r.porMotivo.map((m) => m.pecas));

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Estoque</p>
          <h1 className="mq-display">Análise de saídas</h1>
          <p className="mq-lede">
            Acompanhe as peças retiradas do estoque que não viraram
            faturamento — brinde, uso próprio, perda e sorteio.
          </p>
        </div>
      </div>

      <div className="mq-filters mq-filters--plain saidas-filtros">
        <div className="mq-chipset" role="group" aria-label="Período">
          {(['tudo', '30d', '7d'] as Atalho[]).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={!livre && atalho === a}
              onClick={() => { setAtalho(a); setDe(''); setAte(''); }}
            >
              {a === 'tudo' ? 'Tudo' : a === '30d' ? '30 dias' : '7 dias'}
            </button>
          ))}
        </div>

        <label className="mq-field">
          <span>Situação</span>
          <select
            className="mq-select"
            value={situacao}
            onChange={(e) => setSituacao(e.target.value as Situacao)}
          >
            <option value="todas">Todas</option>
            <option value="vigentes">Só as vigentes</option>
            <option value="estornadas">Só as estornadas</option>
          </select>
        </label>

        <label className="mq-field">
          <span>Motivo</span>
          <select className="mq-select" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="">Todos os motivos</option>
            {TIPOS_DE_SAIDA.map((t) => (
              <option key={t.id} value={t.id}>{t.rotuloLongo}</option>
            ))}
          </select>
        </label>

        <label className="mq-field">
          <span>De</span>
          <input className="mq-input" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="mq-field">
          <span>Até</span>
          <input className="mq-input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
      </div>

      {lista.erro && (
        <section className="mq-card">
          <ErrorState erro={lista.erro} aoTentarDeNovo={lista.recarregar} />
        </section>
      )}
      {lista.carregando && <LoadingState />}

      <div className="mq-kpis">
        {/* O ÚNICO cartão com número real. Os três de custo existem na
            composição do protótipo e dizem que não sabem. */}
        <div className="mq-kpi mq-kpi--accent">
          <span className="mq-kpi__label">Peças retiradas</span>
          <strong className="mq-kpi__value">{r.pecasRetiradas}</strong>
          <span className="mq-kpi__foot">
            {r.lancamentos} {plural(r.lancamentos, 'lançamento', 'lançamentos')} no período
          </span>
        </div>

        <div className="mq-kpi">
          <span className="mq-kpi__label">Peças estornadas</span>
          <strong className="mq-kpi__value">{r.pecasEstornadas}</strong>
          <span className="mq-kpi__foot">devolvidas ao estoque, e ainda no histórico</span>
        </div>

        <div className="mq-kpi">
          <span className="mq-kpi__label">Custo das saídas</span>
          <strong className="mq-kpi__value mq-kpi__value--vazio">Não informado</strong>
          <span className="mq-kpi__foot">
            {r.semCusto} de {r.semCusto} {plural(r.semCusto, 'registro', 'registros')} sem custo
          </span>
        </div>

        <div className="mq-kpi">
          <span className="mq-kpi__label">Custo por peça</span>
          <strong className="mq-kpi__value mq-kpi__value--vazio">Não informado</strong>
          <span className="mq-kpi__foot">depende do custo, que não existe</span>
        </div>
      </div>

      <p className="mq-note mq-note--warn">
        <Icone nome="alert" />
        <span>
          <b>Não existe custo no sistema.</b> Nem <code>produtos</code> nem{' '}
          <code>saidas_sem_faturamento</code> têm coluna de custo, e nenhuma rota
          devolve uma. O preço cadastrado é o de <b>venda</b>: somá-lo aqui faria
          uma peça dada de brinde "custar" o valor que ela teria rendido. Os
          totais de custo ficam vazios até o custo existir — nenhum deles é
          parcial, porque não há nenhuma parte.
        </span>
      </p>

      <div className="mq-grid mq-grid--aside">
        <section className="mq-card">
          <div className="mq-card__head">
            <div>
              <p className="mq-eyebrow">Distribuição</p>
              <h2 className="mq-title">Peças por motivo</h2>
            </div>
          </div>
          <div className="mq-card__body">
            <div className="mq-bars">
              {r.porMotivo.map((m) => (
                <div className="mq-bars__row" key={m.tipo}>
                  <span>{m.rotulo}</span>
                  <span className="mq-meter">
                    <i style={{ width: `${Math.round((m.pecas / maiorBarra) * 100)}%` }} />
                  </span>
                  <b>{m.pecas > 0 ? m.pecas : '—'}</b>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mq-card">
          <div className="mq-card__head">
            <div>
              <p className="mq-eyebrow">Destaques</p>
              <h2 className="mq-title">O período em três linhas</h2>
            </div>
          </div>
          <div className="mq-card__body">
            <dl className="mq-dl">
              <div>
                <dt>Maior motivo</dt>
                <dd>
                  {r.maiorMotivo
                    ? `${r.maiorMotivo.rotulo} · ${r.maiorMotivo.pecas}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Custo por peça</dt>
                <dd className="mq-money--muted">Não informado</dd>
              </div>
              <div>
                <dt>Sem custo informado</dt>
                <dd>{r.semCusto}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div>
            <p className="mq-eyebrow">Registro</p>
            <h2 className="mq-title">Saídas do período</h2>
            <p className="mq-lede">
              Nenhuma delas entra em faturamento, ticket médio ou ranking de
              clientes — e isso é regra do servidor, não escolha desta tela.
            </p>
          </div>
        </div>

        {saidas.length === 0 && !lista.carregando ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="box" /></span>
            <h3>Nenhuma saída neste recorte</h3>
            <p>Mude o período ou o motivo para ver outras.</p>
          </div>
        ) : (
          <div className="mq-scroll-x">
            <div className="mq-table saidas-tabela" role="table" aria-label="Saídas do período">
              <div className="mq-tr mq-tr--head" role="row">
                <span>Data</span>
                <span>Destino</span>
                <span>Motivo</span>
                <span className="mq-cell--num">Peças</span>
                <span className="mq-cell--num">Custo real</span>
                <span>Situação</span>
              </div>

              {saidas.map((s) => (
                <div className="mq-tr" role="row" key={s.id}>
                  <span className="mq-cell" data-label="Data">
                    <b className="mq-date">{fmtData(s.data)}</b>
                  </span>

                  <span className="mq-cell" data-label="Destino">
                    <b>{s.produto ?? s.sku}</b>
                    <small className="mq-sku">
                      SKU {s.sku}
                      {s.variacao ? ` · ${s.variacao}` : ''}
                      {s.origemUsuario ? ` · ${s.origemUsuario}` : ''}
                    </small>
                  </span>

                  <span className="mq-cell" data-label="Motivo">
                    <em className="mq-chip mq-chip--soft">{s.tipoRotulo}</em>
                    {s.motivo ? <small className="mq-sku">{s.motivo}</small> : null}
                  </span>

                  <span className="mq-cell mq-cell--num" data-label="Peças">
                    <b className="mq-qty">
                      {s.sentido === 'entrada' ? '+' : '−'}{s.qtd}
                    </b>
                  </span>

                  <span className="mq-cell mq-cell--num" data-label="Custo real">
                    <small className="mq-sku">Não informado</small>
                  </span>

                  <span className="mq-cell" data-label="Situação">
                    {s.estornada ? (
                      <span className="mq-status mq-status--warn">Estornada</span>
                    ) : s.estoqueRefletido ? (
                      <span className="mq-status mq-status--ok">Concluída</span>
                    ) : (
                      /* A linha que só CLASSIFICA uma saída que já tinha
                         acontecido — a da planilha reclassificada. Ela não
                         baixou peça, e estorná-la não devolve nenhuma. */
                      <span className="mq-status mq-status--open">Classificação</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
