import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { money, fmtData, plural } from '../../domain/formato';
import {
  aprovarPublicacao, buscarFila, prepararPublicacao, reabrirPublicacao,
  repetirPublicacao, salvarPrevia, type RespostaDaFila,
} from './api';
import {
  DEGRAUS, ESTADOS, ROTULO_DA_FALTA, degrauDoEstado, porDegrau,
  type Degrau, type ItemDaFila,
} from './tipos';
import type { Connection } from '../../services/client';

interface Props {
  conexao: Connection;
}

/** A CENTRAL OPERACIONAL DA PUBLICAÇÃO.
 *
 *  O protótipo desenha a lista como protagonista, e o funil como cabeçalho:
 *
 *      Preparar → Revisar → Aprovar → Publicando → Publicado
 *
 *  Cada degrau é uma FILA DE TRABALHO, e o que muda entre eles é quem tem
 *  a próxima ação. Foi por isso que o funil virou o filtro em vez de um
 *  enfeite: clicar em "Revisar" é dizer "me mostre o que espera meu olho".
 *
 *  DUAS COISAS QUE A TELA NUNCA MISTURA, porque elas culpam pessoas
 *  diferentes:
 *
 *    `falta`      o que a PEÇA não tem — preço, foto, nome, categoria.
 *                 Trabalho de gente, e a lista diz exatamente o quê.
 *    `bloqueios`  o que este SERVIDOR não consegue fazer — R2 ausente,
 *                 preparador não configurado. Trabalho de infraestrutura,
 *                 e cobrar isso de quem cadastra peça é ruído.
 *
 *  ESCRITA NA LOJA REAL CONTINUA PROIBIDA. `/publicar`, `/despublicar` e
 *  `/rodada` existem no Worker e não são importadas por esta tela — e o
 *  próprio servidor devolve `escritaNaLojaHabilitada: false`, que é o que
 *  a faixa no alto repete.
 */
export function FilaArea({ conexao }: Props) {
  const fila = useApi((s) => buscarFila(conexao, s), [conexao]);
  const [degrau, setDegrau] = useState<Degrau>('revisar');
  const [busca, setBusca] = useState('');
  const [abertoSku, setAbertoSku] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<{ sku: string; texto: string } | null>(null);

  const d = fila.dados;
  const listas = useMemo(() => porDegrau(d?.itens ?? []), [d]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = listas[degrau];
    if (!t) return base;
    return base.filter((i) => i.sku.toLowerCase().includes(t)
      || (i.desc ?? '').toLowerCase().includes(t));
  }, [listas, degrau, busca]);

  async function agir(
    sku: string, acao: (c: Connection, s: string) => Promise<RespostaDaFila>,
  ) {
    setOcupado(sku);
    setRecusa(null);
    const r = await acao(conexao, sku)
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui.' }));
    setOcupado(null);
    if (r && 'erro' in r && r.erro) {
      const faltam = (r as RespostaDaFila).faltam;
      setRecusa({
        sku,
        texto: String(r.erro) + (faltam?.length
          ? ` Faltam: ${faltam.map((f) => ROTULO_DA_FALTA[f] ?? f).join(', ')}.`
          : ''),
      });
      return;
    }
    fila.recarregar();
  }

  if (fila.erro) return <ErrorState erro={fila.erro} aoTentarDeNovo={fila.recarregar} />;

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Nuvemshop</p>
          <h1 className="mq-display">Fila de publicação</h1>
          <p className="mq-lede">
            O que está pronto para publicar, o que trava, e de quem é a próxima
            ação.
          </p>
        </div>
      </div>

      {d && !d.escritaNaLojaHabilitada && (
        <p className="mq-note mq-note--warn">
          <Icone nome="alert" />
          <span>
            <b>A escrita automática na loja está desligada no servidor.</b>{' '}
            {d.decisaoPendente} Preparar, revisar e aprovar são registros
            NOSSOS — nenhum deles toca a Nuvemshop. Publicar de verdade é uma
            decisão à parte, e esta tela não a toma.
          </span>
        </p>
      )}

      {!d ? <LoadingState /> : (
        <>
          <div className="mq-kpis">
            <div className="mq-kpi mq-kpi--accent">
              <span className="mq-kpi__label">Prontas para publicar</span>
              <span className="mq-kpi__value">{d.resumo.prontos}</span>
              <span className="mq-kpi__foot">
                {d.resumo.pecasProntas} {plural(d.resumo.pecasProntas, 'peça', 'peças')} ·{' '}
                {money(d.resumo.valorPronto)} em vitrine
              </span>
            </div>
            <div className={d.resumo.valorParado > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
              <span className="mq-kpi__label">Parado por falta</span>
              <span className="mq-kpi__value">{money(d.resumo.valorParado)}</span>
              <span className="mq-kpi__foot">
                valor que não chega à loja porque falta informação
              </span>
            </div>
            <div className="mq-kpi">
              <span className="mq-kpi__label">Sem foto</span>
              <span className="mq-kpi__value">{d.resumo.semFoto}</span>
              <span className="mq-kpi__foot">peça sem imagem nossa</span>
            </div>
            <div className="mq-kpi">
              <span className="mq-kpi__label">Sem preço</span>
              <span className="mq-kpi__value">{d.resumo.semPreco}</span>
              <span className="mq-kpi__foot">§24 — sem preço não publica e não vende</span>
            </div>
          </div>

          {/* ── o funil, que É o filtro ───────────────────────────────── */}
          <nav className="mq-tabs" aria-label="Etapa da publicação">
            {DEGRAUS.map((g, i) => (
              <button
                key={g.id}
                type="button"
                aria-selected={degrau === g.id}
                onClick={() => setDegrau(g.id)}
              >
                <span className="mq-badge mq-badge--quiet">{i + 1}</span>
                {g.rotulo}
                <span className="mq-badge">{listas[g.id].length}</span>
              </button>
            ))}
          </nav>

          <div className="mq-filters">
            <label className="mq-search">
              <Icone nome="search" />
              <input
                className="mq-input"
                type="search"
                placeholder="Buscar por código ou nome"
                aria-label="Buscar na fila"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            <span className="mq-filters__count">
              {visiveis.length} {plural(visiveis.length, 'peça', 'peças')}
            </span>
          </div>

          <section className="mq-card mq-card--flush">
            {visiveis.length === 0 ? (
              <div className="mq-state">
                <span className="mq-state__icon"><Icone nome="cloud" /></span>
                <h3>Nada em &quot;{DEGRAUS.find((g) => g.id === degrau)?.rotulo}&quot;</h3>
                <p>
                  {degrau === 'preparar'
                    ? 'Nenhuma peça esperando preparação.'
                    : degrau === 'publicado'
                      ? 'Nenhuma peça publicada ainda — e publicar continua desligado.'
                      : 'Nenhuma peça neste degrau agora.'}
                </p>
              </div>
            ) : (
              <div className="mq-list">
                {visiveis.map((i) => (
                  <LinhaDaFila
                    key={i.sku}
                    item={i}
                    aberta={abertoSku === i.sku}
                    ocupado={ocupado === i.sku}
                    recusa={recusa?.sku === i.sku ? recusa.texto : null}
                    aoAlternar={() => setAbertoSku(abertoSku === i.sku ? null : i.sku)}
                    aoPreparar={() => agir(i.sku, prepararPublicacao)}
                    aoAprovar={() => agir(i.sku, (c, s) => aprovarPublicacao(c, s))}
                    aoReabrir={() => agir(i.sku, reabrirPublicacao)}
                    aoRepetir={() => agir(i.sku, repetirPublicacao)}
                    aoSalvarPrevia={(r) => agir(i.sku, (c, s) => salvarPrevia(c, s, r))}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════ a linha da fila */

function LinhaDaFila({
  item, aberta, ocupado, recusa,
  aoAlternar, aoPreparar, aoAprovar, aoReabrir, aoRepetir, aoSalvarPrevia,
}: {
  item: ItemDaFila;
  aberta: boolean;
  ocupado: boolean;
  recusa: string | null;
  aoAlternar: () => void;
  aoPreparar: () => void;
  aoAprovar: () => void;
  aoReabrir: () => void;
  aoRepetir: () => void;
  aoSalvarPrevia: (r: { nomeSite: string; descricaoSite: string }) => void;
}) {
  const [nome, setNome] = useState(item.rascunho?.nomeSite ?? item.desc ?? '');
  const [descricao, setDescricao] = useState(item.rascunho?.descricaoSite ?? '');

  const degrau = degrauDoEstado(item.estado);
  const tom = item.estado === ESTADOS.FALTA ? 'mq-status--risk'
    : item.estado === ESTADOS.PUBLICADO ? 'mq-status--ok'
      : item.estado === ESTADOS.FALHOU ? 'mq-status--risk'
        : 'mq-status--warn';

  return (
    <div>
      <button type="button" className="mq-item" aria-expanded={aberta} onClick={aoAlternar}>
        <span className={`mq-thumb ${item.temFotoPropria ? '' : 'mq-thumb--empty'}`}>
          <Icone nome={item.temFotoPropria ? 'image' : 'box'} />
        </span>
        <span className="mq-item__main">
          <b>{item.desc || item.sku}</b>
          <small>
            <span className="mq-sku">{item.sku}</span>
            {item.cat ? ` · ${item.cat}` : ' · sem categoria'}
            {' · '}{item.casa} em casa
            {item.preco != null ? ` · ${money(item.preco)}` : ' · sem preço'}
          </small>
        </span>
        <span className="mq-item__side">
          <span className={`mq-status ${tom}`}>{item.estadoRotulo}</span>
          {item.aprovacaoInvalidada && (
            <small className="mq-money--risk">aprovação caiu: o dado mudou</small>
          )}
        </span>
      </button>

      {aberta && (
        <div className="mq-card__body mq-stack">
          {/* O que falta NA PEÇA. Trabalho de gente. */}
          {item.falta.length > 0 && (
            <p className="mq-note mq-note--warn">
              <Icone nome="alert" />
              <span>
                <b>Falta na peça:</b>{' '}
                {item.falta.map((f) => ROTULO_DA_FALTA[f] ?? f).join(', ')}.
                {' '}Resolver isso é cadastro, e é o que destrava o degrau.
              </span>
            </p>
          )}

          {/* O que falta NO SERVIDOR. Trabalho de infraestrutura — e cobrar
              isso de quem cadastra peça seria culpar a pessoa errada. */}
          {item.bloqueios.length > 0 && (
            <p className="mq-note mq-note--info">
              <Icone nome="alert" />
              <span>
                <b>Bloqueio do ambiente:</b>{' '}
                {item.bloqueios.map((b) => String(b.motivo ?? b)).join(' · ')}.
                {' '}Isto não é da peça — é o que este servidor ainda não consegue
                fazer.
              </span>
            </p>
          )}

          {item.bloqueioExterno && (
            <p className="mq-note mq-note--info">
              <Icone nome="alert" />
              <span>
                <b>{item.bloqueioExterno.motivo}</b> — {item.bloqueioExterno.proximoPasso}
              </span>
            </p>
          )}

          {item.erroPublicacao && (
            <p className="mq-note mq-note--risk" role="alert">
              <Icone nome="alert" />
              <span>
                Falhou ao publicar: {item.erroPublicacao}
                {item.tentativas > 0 ? ` · ${item.tentativas} ${plural(item.tentativas, 'tentativa', 'tentativas')}` : ''}
              </span>
            </p>
          )}

          <dl className="mq-figures">
            <div>
              <dt>Foto</dt>
              <dd>{item.temFotoPropria ? 'nossa' : item.temEnderecoDaLoja ? 'só da loja' : 'nenhuma'}</dd>
              <small>{item.temTratada ? 'com fundo branco' : 'sem tratamento'}</small>
            </div>
            <div>
              <dt>Na loja</dt>
              <dd>{item.presencaNaLoja ? 'sim' : 'não'}</dd>
              <small>{item.urlLoja ? 'a vitrine mostra' : 'a vitrine não mostra'}</small>
            </div>
            <div>
              <dt>Aprovada</dt>
              <dd>{item.aprovadoEm ? fmtData(item.aprovadoEm) : '—'}</dd>
              <small>{item.aprovadoPor ?? 'ninguém ainda'}</small>
            </div>
            <div>
              <dt>Publicada</dt>
              <dd>{item.publicadoEm ? fmtData(item.publicadoEm) : '—'}</dd>
            </div>
          </dl>

          {/* A prévia — o texto que a loja mostraria. */}
          {(degrau === 'revisar' || item.rascunho) && (
            <section className="mq-stack mq-stack--tight">
              <h3 className="mq-subtitle">O texto do site</h3>
              <label className="mq-field">
                <span>Nome na loja</span>
                <input
                  className="mq-input"
                  value={nome}
                  maxLength={120}
                  onChange={(e) => setNome(e.target.value)}
                />
              </label>
              <label className="mq-field">
                <span>Descrição</span>
                <textarea
                  className="mq-textarea"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </label>
              {item.rascunho && (
                <p className="mq-hint">
                  SEO atual: <b>{item.rascunho.seoTitulo || '—'}</b>
                  {item.rascunho.seoDescricao ? ` · ${item.rascunho.seoDescricao}` : ''}
                </p>
              )}
            </section>
          )}

          {recusa && <p className="mq-note mq-note--risk" role="alert"><span>{recusa}</span></p>}

          <div className="mq-btns">
            {(item.estado === ESTADOS.PRONTO || item.estado === ESTADOS.FALTA
              || item.estado === ESTADOS.DESPUBLICADO) && (
              <button
                type="button"
                className="mq-btn mq-btn--secondary mq-btn--sm"
                disabled={ocupado || item.estado === ESTADOS.FALTA}
                onClick={aoPreparar}
              >
                Preparar
              </button>
            )}

            {(degrau === 'revisar' || item.rascunho) && (
              <button
                type="button"
                className="mq-btn mq-btn--ghost mq-btn--sm"
                disabled={ocupado}
                onClick={() => aoSalvarPrevia({ nomeSite: nome, descricaoSite: descricao })}
              >
                Salvar prévia
              </button>
            )}

            {item.estado === ESTADOS.AGUARDANDO && (
              <button
                type="button"
                className="mq-btn mq-btn--primary mq-btn--sm"
                disabled={ocupado}
                onClick={aoAprovar}
              >
                Aprovar
              </button>
            )}

            {item.estado === ESTADOS.APROVADO && (
              <button
                type="button"
                className="mq-btn mq-btn--ghost mq-btn--sm"
                disabled={ocupado}
                onClick={aoReabrir}
              >
                Reabrir para revisão
              </button>
            )}

            {item.estado === ESTADOS.FALHOU && (
              <button
                type="button"
                className="mq-btn mq-btn--secondary mq-btn--sm"
                disabled={ocupado}
                onClick={aoRepetir}
              >
                Tentar de novo
              </button>
            )}

            {item.urlLoja && (
              <a
                className="mq-btn mq-btn--link mq-btn--sm"
                href={item.urlLoja}
                target="_blank"
                rel="noreferrer"
              >
                Ver na loja
              </a>
            )}
          </div>

          {item.estado === ESTADOS.APROVADO && (
            <p className="mq-hint">
              Aprovada e <b>parada aqui</b>: a publicação automática está
              desligada no servidor. Ela não vai para a loja sozinha, e esta
              tela não a manda.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
