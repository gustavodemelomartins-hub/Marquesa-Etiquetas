import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone, type NomeIcone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { AvatarCliente } from '../../components/AvatarCliente';
import { money, fmtData, moneyNumero } from '../../domain/formato';
import { buscarCredito, buscarPerfil } from './api';
import { AcoesDaCliente } from './AcoesDaCliente';
import { SugestaoDeFoto } from './SugestaoDeFoto';
import { montarLinhaDoTempo, type EventoRelacao, type TipoEvento } from './eventos';
import type { Connection } from '../../services/client';
import type { GarantiaDoPerfil, PerfilCliente as Perfil, VendaDoPerfil } from './tipos';

export type ChaveCliente = { id: number } | { norm: string };

/* Eram seis abas até 01/10/2026. "Financeiro" repetia os três números do
   topo e explicava regra; "Atividade" era a linha do tempo do Resumo sem
   corte. O que falta receber subiu para o Resumo — é a primeira coisa que
   se quer saber — e a linha do tempo inteira abre ali mesmo. */
type Aba = 'resumo' | 'compras' | 'garantias' | 'credito';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'resumo', rotulo: 'Resumo' },
  { id: 'compras', rotulo: 'Compras' },
  { id: 'garantias', rotulo: 'Garantias e trocas' },
  { id: 'credito', rotulo: 'Crédito' },
];

interface Props {
  conexao: Connection;
  chave: ChaveCliente;
  aoVoltar: () => void;
  aoEditar: (perfil: Perfil) => void;
  aoNovaVenda: (perfil: Perfil) => void;
  /** O cadastro foi excluído: a ficha não existe mais. */
  aoExcluir?: () => void;
}

/** A FICHA — a relação inteira com uma cliente, num lugar só.
 *
 *  Ela responde uma pergunta: COMO ESTÁ A RELAÇÃO COM ESTA CLIENTE. Por
 *  isso abre no resumo e não numa tabela: quem abre a ficha quer saber o
 *  estado antes de saber os detalhes.
 *
 *  §38 governa o topo. `Comprou`, `Pago` e `Em aberto` são TRÊS números
 *  diferentes e aparecem os três, com seus nomes — a versão antiga
 *  mostrava um chamando pelo nome do outro, e a conta nunca fechava para
 *  quem olhava. Eles não somam entre si por construção, e a ficha diz isso
 *  em letra em vez de deixar quem lê descobrir sozinha.
 */
export function PerfilCliente({ conexao, chave, aoVoltar, aoEditar, aoNovaVenda, aoExcluir }: Props) {
  const [aba, setAba] = useState<Aba>('resumo');
  const [foto, setFoto] = useState(false);
  const chaveId = 'id' in chave ? `id:${chave.id}` : `norm:${chave.norm}`;

  const perfil = useApi((sinal) => buscarPerfil(conexao, chave, sinal), [conexao, chaveId]);
  const clienteId = perfil.dados?.clienteId ?? null;

  /* O crédito é uma segunda chamada, e de propósito: ele só existe para
     quem tem cadastro (a razão é por `cliente_id`), e a ficha aberta pelo
     histórico da planilha não tem um. Buscar junto faria a ficha inteira
     falhar por causa de um bloco que nem se aplica. */
  const credito = useApi(
    (sinal) => (clienteId === null
      ? Promise.resolve(null)
      : buscarCredito(conexao, clienteId, sinal)),
    [conexao, clienteId],
  );

  const linhaDoTempo = useMemo(
    () => (perfil.dados ? montarLinhaDoTempo(perfil.dados, credito.dados) : []),
    [perfil.dados, credito.dados],
  );

  if (perfil.erro) {
    return (
      <>
        <Voltar aoVoltar={aoVoltar} />
        <section className="mq-card">
          <ErrorState erro={perfil.erro} aoTentarDeNovo={perfil.recarregar} />
        </section>
      </>
    );
  }

  if (!perfil.dados) {
    return (
      <>
        <Voltar aoVoltar={aoVoltar} />
        <section className="mq-card mq-card--pad" aria-busy="true">
          <p className="mq-skel mq-skel--title" />
          <p className="mq-skel mq-skel--line" style={{ marginTop: 16 }} />
          <p className="mq-skel mq-skel--short" style={{ marginTop: 8 }} />
        </section>
      </>
    );
  }

  const p = perfil.dados;
  const r = p.resumo;

  return (
    <>
      <Voltar aoVoltar={aoVoltar} />

      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Ficha da cliente</p>
          <h1 className="mq-display">{p.nomeExibicao}</h1>
          <p className="mq-lede">
            {p.cadastro?.arquivada_em && <><span className="mq-status">Arquivada</span>{' · '}</>}
            <EstadoDaRelacao estado={r.estado} dias={r.diasSemComprar} />
            {p.cadastro?.cidade ? ` · ${p.cadastro.cidade}` : ''}
            {p.cadastro?.tel ? ` · ${p.cadastro.tel}` : ''}
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <AvatarCliente
            nome={p.nomeExibicao}
            avatarUrl={p.avatarUrl}
            sugestao={p.avatarSugestao}
            conexao={conexao}
            tamanho="lg"
            aoClicar={p.clienteId != null && (p.avatarUrl || p.avatarSugestao) ? () => setFoto(true) : undefined}
          />
          <AcoesDaCliente
            conexao={conexao}
            perfil={p}
            aoEditar={() => aoEditar(p)}
            aoMudar={perfil.recarregar}
            aoExcluir={aoExcluir ?? aoVoltar}
          />
          <button type="button" className="mq-btn mq-btn--primary" onClick={() => aoNovaVenda(p)}>
            <Icone nome="plus" />
            Nova venda
          </button>
        </div>
      </div>

      {foto && p.clienteId != null && (
        <SugestaoDeFoto
          conexao={conexao}
          clienteId={p.clienteId}
          nome={p.nomeExibicao}
          avatarUrl={p.avatarUrl}
          aoFechar={() => setFoto(false)}
          aoMudar={perfil.recarregar}
        />
      )}

      {/* §2 — nome não é identidade, e a ficha diz quando isso a encolheu. */}
      {p.aviso && (
        <p className="mq-note mq-note--warn" role="status">{p.aviso}</p>
      )}

      <div className="mq-kpis">
        <div className="mq-kpi">
          <span className="mq-kpi__label">Comprou</span>
          <span className="mq-kpi__value"><i>R$</i>{moneyNumero(r.comprou)}</span>
          <span className="mq-kpi__foot">
            {r.vendas} {r.vendas === 1 ? 'compra' : 'compras'} · {r.pecas}{' '}
            {r.pecas === 1 ? 'peça' : 'peças'}
          </span>
        </div>
        <div className="mq-kpi mq-kpi--ok">
          <span className="mq-kpi__label">Pago</span>
          <span className="mq-kpi__value"><i>R$</i>{moneyNumero(r.pago)}</span>
          <span className="mq-kpi__foot">já recebido</span>
        </div>
        <div className={r.emAberto > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
          <span className="mq-kpi__label">Em aberto</span>
          <span className="mq-kpi__value"><i>R$</i>{moneyNumero(r.emAberto)}</span>
          <span className="mq-kpi__foot">{r.emAberto > 0 ? 'falta receber' : 'nada em aberto'}</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Ticket médio</span>
          <span className="mq-kpi__value">
            {r.ticketMedio === null ? '—' : <><i>R$</i>{moneyNumero(r.ticketMedio)}</>}
          </span>
          <span className="mq-kpi__foot">por compra</span>
        </div>
      </div>

      <nav className="mq-tabs" aria-label="Seções da ficha">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
          >
            {a.rotulo}
            {a.id === 'garantias' && p.garantiasPendentes.length > 0 && (
              <span className="mq-badge mq-badge--brand">{p.garantiasPendentes.length}</span>
            )}
          </button>
        ))}
      </nav>

      {aba === 'resumo' && <Resumo perfil={p} eventos={linhaDoTempo} />}
      {aba === 'compras' && <Compras vendas={p.vendas} />}
      {aba === 'credito' && (
        <Credito clienteId={clienteId} dados={credito.dados} erro={credito.erro} />
      )}
      {aba === 'garantias' && <Garantias garantias={p.garantias} />}
    </>
  );
}

function Voltar({ aoVoltar }: { aoVoltar: () => void }) {
  return (
    <p>
      <button type="button" className="mq-btn mq-btn--link" onClick={aoVoltar}>
        ← Clientes
      </button>
    </p>
  );
}

function EstadoDaRelacao({ estado, dias }: { estado: string; dias: number | null }) {
  const tom = estado === 'inativa' ? 'risk' : estado === 'em risco' ? 'warn' : 'ok';
  return (
    <>
      <span className={`mq-status mq-status--${tom}`}>{estado}</span>
      {dias !== null && (
        <span className="mq-hint">
          {' · '}
          {dias === 0 ? 'comprou hoje' : `há ${dias} ${dias === 1 ? 'dia' : 'dias'} sem comprar`}
        </span>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────── resumo */

function Resumo({ perfil, eventos }: { perfil: Perfil; eventos: EventoRelacao[] }) {
  const r = perfil.resumo;
  const [tudo, setTudo] = useState(false);
  const emAberto = perfil.vendas.filter((v) => v.valorReceber > 0);
  const POUCOS = 6;
  return (
    <div className="mq-grid mq-grid--main">
      <div className="mq-stack">
        {emAberto.length > 0 && (
          <section className="mq-card mq-card--flush">
            <div className="mq-card__head">
              <div><h2 className="mq-title">Falta receber</h2></div>
              <span className="mq-money mq-money--lg mq-money--risk">{money(r.emAberto)}</span>
            </div>
            <div className="mq-list">
              {emAberto.map((v) => (
                <div className="mq-item" key={`${v.fonte}-${v.id}`}>
                  <span className="mq-item__icon mq-item__icon--risk"><Icone nome="receipt" /></span>
                  <span className="mq-item__main">
                    <b>Compra de {fmtData(v.data)}</b>
                    <small>
                      {money(v.valor)} · recebido {money(v.valorRecebido)}
                      {v.vencimentoEm ? ` · vence ${fmtData(v.vencimentoEm)}` : ''}
                    </small>
                  </span>
                  <span className="mq-item__side">
                    <b className="mq-money mq-money--risk">{money(v.valorReceber)}</b>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mq-card mq-card--flush">
          <div className="mq-card__head">
            <div><h2 className="mq-title">Últimos acontecimentos</h2></div>
          </div>
          <div className="mq-card__body">
            {eventos.length === 0
              ? <p className="mq-hint">Nada registrado ainda.</p>
              : <LinhaDoTempo eventos={tudo ? eventos : eventos.slice(0, POUCOS)} />}
          </div>
          {eventos.length > POUCOS && (
            <div className="mq-card__foot">
              <button type="button" className="mq-btn mq-btn--link" onClick={() => setTudo((v) => !v)}>
                {tudo ? 'Mostrar menos' : `Ver tudo o que aconteceu (${eventos.length})`}
              </button>
            </div>
          )}
        </section>
      </div>

      <aside className="mq-stack">
        <section className="mq-card mq-card--pad">
          <h2 className="mq-subtitle">A relação</h2>
          <dl className="mq-dl">
            <div><dt>Primeira compra</dt><dd className="mq-date">{fmtData(r.primeiraCompra)}</dd></div>
            <div><dt>Última compra</dt><dd className="mq-date">{fmtData(r.ultimaCompra)}</dd></div>
            <div>
              <dt>Costuma comprar a cada</dt>
              <dd>{r.frequenciaDias ? `${r.frequenciaDias} dias` : '—'}</dd>
            </div>
            <div><dt>Canal preferido</dt><dd>{perfil.canalPreferido ?? '—'}</dd></div>
            {perfil.cadastro?.tel && <div><dt>Telefone</dt><dd>{perfil.cadastro.tel}</dd></div>}
            {perfil.cadastro?.instagram && <div><dt>Instagram</dt><dd>{perfil.cadastro.instagram}</dd></div>}
          </dl>
        </section>

        {perfil.categoriasPreferidas.length > 0 && (
          <section className="mq-card mq-card--pad">
            <h2 className="mq-subtitle">O que ela leva</h2>
            <p className="mq-chips">
              {perfil.categoriasPreferidas.map((c) => (
                <span key={c.valor} className="mq-chip mq-chip--soft">
                  {c.valor} <b>{c.qtd}</b>
                </span>
              ))}
            </p>
          </section>
        )}

        {perfil.cadastro?.obs && (
          <section className="mq-card mq-card--pad">
            <h2 className="mq-subtitle">Observações</h2>
            <p className="mq-lede">{perfil.cadastro.obs}</p>
          </section>
        )}
      </aside>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── compras */

const COLUNAS_COMPRAS = {
  gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr)',
};

function Compras({ vendas }: { vendas: VendaDoPerfil[] }) {
  if (vendas.length === 0) {
    return (
      <section className="mq-card">
        <div className="mq-state">
          <span className="mq-state__icon"><Icone nome="sale" /></span>
          <h3>Nenhuma compra registrada</h3>
          <p>Quando ela comprar, a venda aparece aqui com as peças que levou.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="mq-card mq-card--flush">
      <div className="mq-table" role="table" aria-label="Compras">
        <div className="mq-tr mq-tr--head" role="row" style={COLUNAS_COMPRAS}>
          <span>Data da venda</span>
          <span>Peças</span>
          <span>Cobrado</span>
          <span>Recebido</span>
          <span>Situação</span>
        </div>
        {vendas.map((v) => (
          <div className="mq-tr" role="row" key={`${v.fonte}-${v.id}`} style={COLUNAS_COMPRAS}>
            <span className="mq-cell">
              <b className="mq-date">{fmtData(v.data)}</b>
              <small>{v.fonte === 'historico' ? 'planilha' : `venda #${v.id}`}</small>
            </span>
            <span className="mq-cell">
              <b>{v.itens.map((i) => i.nome ?? i.sku).join(', ') || `${v.pecas} peças`}</b>
              <small>{v.canal ?? '—'}</small>
            </span>
            <span className="mq-cell mq-cell--num"><b className="mq-money">{money(v.valor)}</b></span>
            <span className="mq-cell mq-cell--num">
              <b className="mq-money mq-money--ok">{money(v.valorRecebido)}</b>
              {/* §30: a data do PAGAMENTO, que não é a da venda. */}
              {v.pagaEm && <small>pago em {fmtData(v.pagaEm)}</small>}
            </span>
            <span className="mq-cell"><SituacaoDaVenda venda={v} /></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SituacaoDaVenda({ venda }: { venda: VendaDoPerfil }) {
  if (venda.valorReceber <= 0) return <span className="mq-status mq-status--ok">pago</span>;
  /* Parcial e em aberto são estados diferentes, e a diferença entre eles é
     dinheiro que já entrou. O vencimento aparece nos dois: ele é a data que
     manda cobrar, e ela não deixa de existir porque metade foi paga. */
  const parcial = venda.valorRecebido > 0;
  return (
    <>
      <span className={parcial ? 'mq-status mq-status--warn' : 'mq-status mq-status--risk'}>
        {parcial ? 'parcial' : 'em aberto'}
      </span>
      <small>
        faltam {money(venda.valorReceber)}
        {venda.vencimentoEm ? ` · vence ${fmtData(venda.vencimentoEm)}` : ''}
      </small>
    </>
  );
}

/* ────────────────────────────────────────────────────────────── crédito */

function Credito({
  clienteId, dados, erro,
}: {
  clienteId: number | null;
  dados: Awaited<ReturnType<typeof buscarCredito>> | null;
  erro: unknown;
}) {
  if (clienteId === null) {
    return (
      <section className="mq-card">
        <div className="mq-state">
          <span className="mq-state__icon"><Icone nome="credit" /></span>
          <h3>Crédito exige cadastro</h3>
          <p>Cadastre a cliente para usar crédito.</p>
        </div>
      </section>
    );
  }
  if (erro) return <section className="mq-card"><ErrorState erro={erro} /></section>;
  if (!dados) return <section className="mq-card mq-card--pad"><p className="mq-skel mq-skel--line" /></section>;

  const saldo = dados.saldoCentavos / 100;
  return (
    <div className="mq-grid mq-grid--main">
      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div>
            <h2 className="mq-title">Extrato</h2>
          </div>
        </div>
        {dados.extrato.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="credit" /></span>
            <h3>Sem movimento de crédito</h3>
            <p>Crédito aparece quando ela troca por uma peça mais barata.</p>
          </div>
        ) : (
          <div className="mq-list">
            {dados.extrato.map((m) => (
              <div className="mq-item" key={m.id}>
                <span className={`mq-item__icon ${m.valorCentavos < 0 ? '' : 'mq-item__icon--ok'}`}>
                  <Icone nome="credit" />
                </span>
                <span className="mq-item__main">
                  <b>{m.tipo}</b>
                  <small>{m.motivo ?? m.origem} · {fmtData(m.criadoEm)}</small>
                </span>
                <span className="mq-item__side">
                  <b className={m.valorCentavos < 0 ? 'mq-money mq-money--muted' : 'mq-money mq-money--ok'}>
                    {money(m.valorCentavos / 100)}
                  </b>
                </span>
              </div>
            ))}
          </div>
        )}
        {!dados.extratoCompleto && (
          <p className="mq-pagination">O extrato foi cortado — há mais movimentos do que os mostrados.</p>
        )}
      </section>

      <aside className="mq-stack">
        <section className={saldo < 0 ? 'mq-card mq-card--pad' : 'mq-card mq-card--pad'}>
          <h2 className="mq-subtitle">Saldo</h2>
          <p className="mq-money mq-money--lg">{money(saldo)}</p>
          <dl className="mq-dl">
            <div><dt>Gerado</dt><dd className="mq-money">{money(dados.geradoCentavos / 100)}</dd></div>
            <div><dt>Usado</dt><dd className="mq-money">{money(dados.consumidoCentavos / 100)}</dd></div>
            <div><dt>Estornado</dt><dd className="mq-money">{money(dados.estornadoCentavos / 100)}</dd></div>
            <div><dt>Ajustes</dt><dd className="mq-money">{money(dados.ajusteLiquidoCentavos / 100)}</dd></div>
          </dl>
          {dados.saldoNegativo && (
            <p className="mq-note mq-note--risk" style={{ marginTop: 12 }}>
              O crédito ficou negativo. Não lance nada por cima: avise quem cuida do sistema.
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}

/* ───────────────────────────────────────────────── garantias e trocas */

function Garantias({ garantias }: { garantias: GarantiaDoPerfil[] }) {
  if (garantias.length === 0) {
    return (
      <section className="mq-card">
        <div className="mq-state">
          <span className="mq-state__icon"><Icone nome="shield" /></span>
          <h3>Nenhuma garantia registrada</h3>
          <p>Nenhuma peça dela voltou por defeito, reparo ou troca.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="mq-card mq-card--flush">
      <div className="mq-list">
        {garantias.map((g) => (
          <div className="mq-item" key={g.id}>
            <span className={`mq-item__icon ${g.pendente ? (g.atrasado ? 'mq-item__icon--risk' : 'mq-item__icon--warn') : 'mq-item__icon--ok'}`}>
              <Icone nome={g.troca ? 'swap' : 'shield'} />
            </span>
            <span className="mq-item__main">
              <b>{g.produtoNome ?? g.sku}{g.variacao ? ` · ${g.variacao}` : ''}</b>
              <small>
                {g.motivo} · entrou {fmtData(g.dataEntrada)}
                {g.vendaId ? ` · venda #${g.vendaId}` : ''}
                {g.troca ? ` · trocada por ${g.troca.produtoNovoNome ?? g.troca.skuNovo}` : ''}
              </small>
            </span>
            <span className="mq-item__side">
              {g.troca && g.troca.creditoAoCliente > 0 && (
                <span className="mq-chip mq-chip--brand">
                  crédito {money(g.troca.creditoAoCliente)}
                </span>
              )}
              <span className={`mq-status mq-status--${g.pendente ? (g.atrasado ? 'risk' : 'warn') : 'ok'}`}>
                {g.statusRotulo}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────── atividade */

const ICONE_DO_EVENTO: Record<TipoEvento, NomeIcone> = {
  compra: 'sale',
  pagamento: 'money',
  'garantia-aberta': 'shield',
  'garantia-encerrada': 'check',
  troca: 'swap',
  credito: 'credit',
};

function LinhaDoTempo({ eventos }: { eventos: EventoRelacao[] }) {
  return (
    <div className="mq-timeline">
      {eventos.map((e) => (
        <div className="mq-timeline__row" key={e.chave}>
          <span className="mq-timeline__dot"><Icone nome={ICONE_DO_EVENTO[e.tipo]} /></span>
          <span className="mq-timeline__body">
            <b>{e.titulo}</b>
            <small>
              {fmtData(e.data)}
              {e.detalhe ? ` · ${e.detalhe}` : ''}
              {e.valor !== null ? ` · ${money(e.valor)}` : ''}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}
