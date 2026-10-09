import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { money, fmtData, plural } from '../../domain/formato';
import { ApiError } from '../../types/api';
import { buscarFila, publicarNaNuvemshop, salvarPrevia } from './api';
import {
  SITUACOES, FILTROS_DE_PENDENCIA, ROTULO_DA_PENDENCIA, ROTULO_DA_VISIBILIDADE,
  porSituacao, fraseDaPeca, checklistDaPeca, situacaoDaTela,
  type SituacaoDaTela, type ItemDaFila,
} from './tipos';
import type { Connection } from '../../services/client';

interface Props {
  conexao: Connection;
}

/** PREPARAÇÃO PARA NUVEMSHOP — §61 e §62.
 *
 *  A Sthefany não precisa abrir o painel da Nuvemshop para descobrir o que
 *  falta. Cada peça responde, nesta ordem:
 *
 *    existe na Nuvemshop?   não cadastrada · oculta · visível
 *    o que falta?           foto, descrição, SEO, preço, variação, estoque
 *    pode ficar visível?    "Pronto para publicar" — e só o clique publica
 *
 *  Cadastrar e tornar visível são dois atos (§62). O sistema CADASTRA a peça
 *  OCULTA na loja quando a estrutura é segura (hidden: não aparece, não é
 *  comprável, mas já tem estoque, texto e SEO). Ficar visível é sempre o
 *  clique em "Publicar na Nuvemshop", e o servidor confere tudo NA LOJA antes.
 *
 *  `bloqueios` do servidor (R2 ausente, preparador) continuam separados do
 *  que falta na peça: "Ainda não disponível:" é infraestrutura, não cadastro.
 */
export function FilaArea({ conexao }: Props) {
  const fila = useApi((s) => buscarFila(conexao, s), [conexao]);
  const [situacao, setSituacao] = useState<SituacaoDaTela>('oculto');
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [abertoSku, setAbertoSku] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<{ sku: string; texto: string } | null>(null);
  const [aviso, setAviso] = useState<{ sku: string; texto: string } | null>(null);

  const d = fila.dados;
  const listas = useMemo(() => porSituacao(d?.itens ?? []), [d]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const chaves = FILTROS_DE_PENDENCIA.find((f) => f.id === filtro)?.chaves ?? [];
    return listas[situacao].filter((i) => {
      if (chaves.length && !(i.pendencias ?? []).some((k) => chaves.includes(k))) return false;
      if (!t) return true;
      return i.sku.toLowerCase().includes(t) || (i.desc ?? '').toLowerCase().includes(t);
    });
  }, [listas, situacao, filtro, busca]);

  const naoCadastrados = listas.nao_cadastrado;
  const seraoCriados = naoCadastrados.filter((i) => i.nuvemshop?.criavel).length;

  async function publicar(sku: string) {
    setOcupado(sku);
    setRecusa(null);
    setAviso(null);
    try {
      const r = await publicarNaNuvemshop(conexao, sku, 'Preparação para Nuvemshop');
      setAviso({ sku, texto: r.confirmadoPelaLoja ? 'Publicado: a Nuvemshop confirmou que está visível.' : 'Publicado.' });
      fila.recarregar();
    } catch (e) {
      const corpo = e instanceof ApiError ? (e.corpo as { faltam?: string[] } | null) : null;
      const faltam = corpo?.faltam?.length
        ? ` Falta: ${corpo.faltam.map((f) => ROTULO_DA_PENDENCIA[f] ?? f).join(', ')}.`
        : '';
      setRecusa({ sku, texto: `${e instanceof Error ? e.message : 'Não consegui publicar.'}${faltam}` });
    } finally {
      setOcupado(null);
    }
  }

  async function salvarTexto(sku: string, r: { nomeSite: string; descricaoSite: string }) {
    setOcupado(sku);
    setRecusa(null);
    try {
      await salvarPrevia(conexao, sku, r);
      fila.recarregar();
    } catch (e) {
      setRecusa({ sku, texto: e instanceof Error ? e.message : 'Não consegui salvar.' });
    } finally {
      setOcupado(null);
    }
  }

  if (fila.erro) return <ErrorState erro={fila.erro} aoTentarDeNovo={fila.recarregar} />;

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Nuvemshop · Fila de publicação</p>
          <h1 className="mq-display">Preparação para Nuvemshop</h1>
          <p className="mq-lede">
            Cada peça diz se já existe na Nuvemshop, se está oculta ou visível e o
            que falta. Ficar visível na loja é sempre um clique seu.
          </p>
        </div>
      </div>

      {d && d.catalogoAtivo === false && (
        <p className="mq-note mq-note--warn">
          <Icone nome="alert" />
          <span>
            <b>O cadastro na Nuvemshop está desligado.</b>{' '}
            Nada é criado nem publicado na loja. O estoque das peças que já estão lá
            continua sincronizando.
          </span>
        </p>
      )}
      {d && d.catalogoAtivo !== false && (
        <p className="mq-note mq-note--info">
          <Icone nome="cloud" />
          <span>
            Peças com cadastro seguro são criadas <b>ocultas</b> na Nuvemshop: já têm
            estoque, texto e SEO, mas não aparecem na loja nem podem ser compradas.
            Elas só ficam visíveis quando você clica em <b>Publicar na Nuvemshop</b>.
          </span>
        </p>
      )}

      {!d ? <LoadingState /> : (
        <>
          <div className="mq-kpis">
            <div className="mq-kpi">
              <span className="mq-kpi__label">Não cadastrados</span>
              <span className="mq-kpi__value">{listas.nao_cadastrado.length}</span>
              <span className="mq-kpi__foot">
                {seraoCriados} {plural(seraoCriados, 'será criada oculta', 'serão criadas ocultas')}
                {' · '}{naoCadastrados.length - seraoCriados} precisam de decisão
              </span>
            </div>
            <div className="mq-kpi">
              <span className="mq-kpi__label">Ocultos em preparação</span>
              <span className="mq-kpi__value">{listas.oculto.length}</span>
              <span className="mq-kpi__foot">na Nuvemshop, sem aparecer na loja</span>
            </div>
            <div className="mq-kpi mq-kpi--accent">
              <span className="mq-kpi__label">Prontos para publicar</span>
              <span className="mq-kpi__value">{listas.pronto.length}</span>
              <span className="mq-kpi__foot">esperando o seu clique</span>
            </div>
            <div className={listas.erro.length ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
              <span className="mq-kpi__label">Publicados</span>
              <span className="mq-kpi__value">{listas.publicado.length}</span>
              <span className="mq-kpi__foot">
                {listas.erro.length ? `${listas.erro.length} com erro` : 'visíveis na loja'}
              </span>
            </div>
          </div>

          <nav className="mq-tabs" aria-label="Situação na Nuvemshop">
            {SITUACOES.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-selected={situacao === g.id}
                onClick={() => { setSituacao(g.id); setFiltro('todos'); }}
              >
                {g.rotulo}
                <span className="mq-badge">{listas[g.id].length}</span>
              </button>
            ))}
          </nav>

          <div className="mq-chipset" role="group" aria-label="Filtrar pelo que falta">
            {FILTROS_DE_PENDENCIA.map((f) => {
              const n = f.chaves.length
                ? listas[situacao].filter((i) => (i.pendencias ?? []).some((k) => f.chaves.includes(k))).length
                : listas[situacao].length;
              if (f.chaves.length && !n) return null;
              return (
                <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
                  {f.rotulo} · {n}
                </button>
              );
            })}
          </div>

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
                <h3>Nada em &quot;{SITUACOES.find((g) => g.id === situacao)?.rotulo}&quot;</h3>
                <p>
                  {situacao === 'erro'
                    ? 'Nenhum erro de integração.'
                    : filtro !== 'todos'
                      ? 'Nenhuma peça com essa pendência nesta aba.'
                      : 'Nenhuma peça nesta situação agora.'}
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
                    aviso={aviso?.sku === i.sku ? aviso.texto : null}
                    publicacaoLigada={d.catalogoAtivo !== false}
                    aoAlternar={() => setAbertoSku(abertoSku === i.sku ? null : i.sku)}
                    aoPublicar={() => publicar(i.sku)}
                    aoSalvarPrevia={(r) => salvarTexto(i.sku, r)}
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

const MARCA = { ok: '✓', falta: '✕', aviso: '⚠' } as const;
const TOM_DA_MARCA = { ok: 'mq-money--ok', falta: 'mq-money--risk', aviso: 'mq-money--warn' } as const;

function rotuloNaLoja(i: ItemDaFila): { texto: string; tom: string } {
  const s = situacaoDaTela(i);
  const vis = i.nuvemshop?.visibilidade;
  if (s === 'erro') return { texto: 'Nuvemshop: ERRO', tom: 'mq-status--risk' };
  if (s === 'nao_cadastrado') return { texto: 'Nuvemshop: NÃO CADASTRADO', tom: 'mq-status--warn' };
  if (s === 'publicado') return { texto: 'Nuvemshop: VISÍVEL', tom: 'mq-status--ok' };
  if (s === 'pronto') return { texto: 'Pronto para ficar visível', tom: 'mq-status--ok' };
  return { texto: `Nuvemshop: ${vis ? ROTULO_DA_VISIBILIDADE[vis] ?? 'OCULTO' : 'OCULTO'}`, tom: 'mq-status--warn' };
}

function LinhaDaFila({
  item, aberta, ocupado, recusa, aviso, publicacaoLigada,
  aoAlternar, aoPublicar, aoSalvarPrevia,
}: {
  item: ItemDaFila;
  aberta: boolean;
  ocupado: boolean;
  recusa: string | null;
  aviso: string | null;
  publicacaoLigada: boolean;
  aoAlternar: () => void;
  aoPublicar: () => void;
  aoSalvarPrevia: (r: { nomeSite: string; descricaoSite: string }) => void;
}) {
  const [nome, setNome] = useState(item.rascunho?.nomeSite ?? item.desc ?? '');
  const [descricao, setDescricao] = useState(item.rascunho?.descricaoSite ?? '');
  const [confirmando, setConfirmando] = useState(false);

  const ns = item.nuvemshop;
  const s = situacaoDaTela(item);
  const rotulo = rotuloNaLoja(item);
  const lista = checklistDaPeca(item);
  const bloqueiosDaPeca = s === 'nao_cadastrado' && ns && !ns.criavel ? ns.bloqueios : [];
  const texto = ns?.texto;

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
          <small className={(item.pendencias ?? []).length ? 'mq-money--risk' : undefined}>
            {fraseDaPeca(item)}
          </small>
        </span>
        <span className="mq-item__side">
          <span className={`mq-status ${rotulo.tom}`}>{rotulo.texto}</span>
        </span>
      </button>

      {aberta && (
        <div className="mq-card__body mq-stack">
          <ul className="mq-checklist" aria-label="O que a peça já tem">
            {lista.map((c) => (
              <li key={c.rotulo}>
                <span className={TOM_DA_MARCA[c.marca]} aria-hidden="true">{MARCA[c.marca]}</span>{' '}
                <b>{c.rotulo}</b>
                {c.marca !== 'ok' && c.detalhe ? <small> — {c.detalhe}</small> : null}
              </li>
            ))}
          </ul>

          {bloqueiosDaPeca.length > 0 && (
            <p className="mq-note mq-note--warn">
              <Icone nome="alert" />
              <span>
                <b>Precisa de decisão antes de ir para a Nuvemshop:</b>{' '}
                {bloqueiosDaPeca.join(' ')}
              </span>
            </p>
          )}
          {s === 'nao_cadastrado' && ns?.criavel && (
            <p className="mq-note mq-note--info">
              <Icone nome="cloud" />
              <span>
                {publicacaoLigada
                  ? 'Será cadastrada OCULTA na Nuvemshop automaticamente — sem aparecer na loja.'
                  : 'Pronta para ser cadastrada oculta quando o cadastro na Nuvemshop for ligado.'}
              </span>
            </p>
          )}
          {s === 'pronto' && (
            <p className="mq-note mq-note--info">
              <Icone nome="cloud" />
              <span>Tudo conferido. Está oculta na Nuvemshop e só fica visível com o seu clique.</span>
            </p>
          )}

          {/* O que falta NO SERVIDOR. Trabalho de infraestrutura — e cobrar
              isso de quem cadastra peça seria culpar a pessoa errada. */}
          {item.bloqueios.length > 0 && (
            <p className="mq-note mq-note--info">
              <Icone nome="alert" />
              <span>
                <b>Ainda não disponível:</b>{' '}
                {item.bloqueios.map((b) => String(b.motivo ?? b)).join(' · ')}.
                {' '}Isto não é da peça — é o que este servidor ainda não consegue fazer.
              </span>
            </p>
          )}

          {(ns?.ultimoErro || item.erroSincronizacao) && (
            <p className="mq-note mq-note--risk" role="alert">
              <Icone nome="alert" />
              <span>{ns?.ultimoErro || `Estoque não chegou à loja: ${item.erroSincronizacao}`}</span>
            </p>
          )}

          {ns && ns.variacoes.length > 0 && (
            <section className="mq-stack mq-stack--tight">
              <h3 className="mq-subtitle">Variações que vão para a loja</h3>
              <ul className="mq-checklist">
                {ns.variacoes.map((v) => (
                  <li key={v.nome}><b>{v.nome}</b> <small>· {v.estoque} em estoque</small></li>
                ))}
              </ul>
            </section>
          )}
          {ns && ns.variacoesSoAqui.length > 0 && (
            <p className="mq-hint">
              Variações só no Marquesa (a loja ainda não tem): {ns.variacoesSoAqui.join(', ')}.
            </p>
          )}

          {/* O texto do site: o que vai (ou foi) para a Nuvemshop. Antes do
              cadastro, dá para escrever à mão — o escrito por gente vence o
              gerado. */}
          {(s === 'nao_cadastrado' || texto) && (
            <section className="mq-stack mq-stack--tight">
              <h3 className="mq-subtitle">O texto do site</h3>
              {texto?.seoTitulo && (
                <p className="mq-hint">
                  SEO: <b>{texto.seoTitulo}</b>{texto.seoDescricao ? ` · ${texto.seoDescricao}` : ''}
                </p>
              )}
              {texto?.precisaInformacao && (
                <p className="mq-note mq-note--warn">
                  <Icone nome="alert" />
                  <span><b>Precisa de informação:</b> {texto.precisaInformacao}</span>
                </p>
              )}
              {s === 'nao_cadastrado' && (
                <>
                  <label className="mq-field">
                    <span>Nome na loja</span>
                    <input className="mq-input" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} />
                  </label>
                  <label className="mq-field">
                    <span>Descrição (opcional — vence a gerada)</span>
                    <textarea className="mq-textarea" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                  </label>
                </>
              )}
            </section>
          )}

          {recusa && <p className="mq-note mq-note--risk" role="alert"><span>{recusa}</span></p>}
          {aviso && <p className="mq-note mq-note--info" role="status"><span>{aviso}</span></p>}

          <div className="mq-btns">
            {s === 'pronto' && !confirmando && (
              <button
                type="button"
                className="mq-btn mq-btn--primary mq-btn--sm"
                disabled={ocupado || !publicacaoLigada}
                onClick={() => setConfirmando(true)}
              >
                Publicar na Nuvemshop
              </button>
            )}
            {s === 'pronto' && confirmando && (
              <>
                <button
                  type="button"
                  className="mq-btn mq-btn--primary mq-btn--sm"
                  disabled={ocupado}
                  onClick={() => { setConfirmando(false); aoPublicar(); }}
                >
                  Confirmar: deixar visível na loja
                </button>
                <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={() => setConfirmando(false)}>
                  Cancelar
                </button>
              </>
            )}
            {s === 'nao_cadastrado' && (
              <button
                type="button"
                className="mq-btn mq-btn--ghost mq-btn--sm"
                disabled={ocupado}
                onClick={() => aoSalvarPrevia({ nomeSite: nome, descricaoSite: descricao })}
              >
                Salvar texto
              </button>
            )}
            {s === 'publicado' && item.urlLoja && (
              <a
                className="mq-btn mq-btn--link mq-btn--sm"
                href={`https://marquesasemijoias.com.br/produtos/${item.urlLoja}/`}
                target="_blank"
                rel="noreferrer"
              >
                Ver na loja
              </a>
            )}
          </div>

          <details className="mq-details">
            <summary>Detalhe técnico</summary>
            <dl className="mq-figures">
              <div><dt>Produto na Nuvemshop</dt><dd>{ns?.produtoId ?? item.produtoIdLoja ?? '—'}</dd></div>
              <div><dt>Visibilidade</dt><dd>{ns?.visibilidade ?? '—'}</dd></div>
              <div>
                <dt>Cadastro</dt>
                <dd>{ns?.origemCatalogo === 'criado' ? 'criado pelo Marquesa' : ns?.origemCatalogo === 'adotado' ? 'já existia na loja' : '—'}</dd>
              </div>
              <div>
                <dt>Estoque na fila</dt><dd>{ns?.estoque ?? '—'}</dd>
                <small>{ns?.sincronizadoEm ? `em ${fmtData(ns.sincronizadoEm)}` : ''}</small>
              </div>
            </dl>
          </details>
        </div>
      )}
    </div>
  );
}
