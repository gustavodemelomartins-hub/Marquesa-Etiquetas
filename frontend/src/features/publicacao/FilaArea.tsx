import { useMemo, useRef, useState } from 'react';
import type { EstadoRequisicao } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { FotoDaPeca } from '../../components/FotoDaPeca';
import { money, plural } from '../../domain/formato';
import type { Product } from '../../types/api';
import type { Connection } from '../../services/client';
import { publicarNaNuvemshop, salvarPrevia } from './api';
import { publicarEmLote, type ResultadoDoLote } from './lote';
import {
  SITUACOES, FILTROS, porSituacao, checklistDaPeca, disponibilidadeDaPeca, situacaoDaTela, resumoDoLote,
  type SituacaoDaTela, type ItemDaFila, type FilaDePublicacao,
} from './tipos';
import { DetalheDaPeca } from './DetalheDaPeca';
import { fotoDaPreparacao } from './miniatura';

interface Props {
  conexao: Connection;
  fila: EstadoRequisicao<FilaDePublicacao>;
  /** O cadastro de cada peça (de `/api/state`), para a miniatura. */
  produtos: Map<string, Product>;
  abaInicial?: SituacaoDaTela | null;
  aoMudar: () => void;
}

type Lote = {
  skus: string[];
  titulo: string;
  fase: 'confirmar' | 'rodando' | 'fim';
  feitos: number;
  atual: string;
  resultado: ResultadoDoLote | null;
};

/** PREPARAÇÃO PARA NUVEMSHOP — §61, §62 e §63.
 *
 *  Cada peça responde, de relance: existe na Nuvemshop? o que falta? pode
 *  ficar visível? A linha mostra a miniatura, o cadastro (código,
 *  categoria, preço, estoque em casa, variações) e o checklist de oito
 *  itens; o detalhe mostra o que vai para a loja.
 *
 *  Cadastrar e tornar visível são dois atos (§62). O sistema CADASTRA a
 *  peça OCULTA; ficar visível é sempre um clique — de uma, das
 *  selecionadas ou de todas as prontas —, e cada peça é conferida de novo
 *  NA LOJA na hora dela (§63, `lote.ts`).
 */
export function FilaArea({ conexao, fila, produtos, abaInicial, aoMudar }: Props) {
  const [situacao, setSituacao] = useState<SituacaoDaTela>(abaInicial ?? 'pronto');
  const [filtro, setFiltro] = useState('todos');
  const [categoria, setCategoria] = useState('');
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [detalheSku, setDetalheSku] = useState<string | null>(null);
  const [lote, setLote] = useState<Lote | null>(null);
  const [recado, setRecado] = useState<{ tom: 'ok' | 'risk'; texto: string } | null>(null);
  const parar = useRef(false);

  const d = fila.dados;
  const listas = useMemo(() => porSituacao(d?.itens ?? []), [d]);
  const daAba = listas[situacao];

  const categorias = useMemo(
    () => [...new Set(daAba.map((i) => i.cat || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt')),
    [daAba],
  );

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const passa = FILTROS.find((f) => f.id === filtro)?.passa ?? (() => true);
    return daAba.filter((i) => {
      if (categoria && (i.cat || '') !== categoria) return false;
      if (!passa(i)) return false;
      if (!t) return true;
      return i.sku.toLowerCase().includes(t) || (i.desc ?? '').toLowerCase().includes(t);
    });
  }, [daAba, filtro, categoria, busca]);

  const prontos = listas.pronto;
  const naAbaPronto = situacao === 'pronto';
  const selecionaveis = naAbaPronto ? visiveis : [];
  const todosMarcados = selecionaveis.length > 0 && selecionaveis.every((i) => selecionados.has(i.sku));
  const escolhidos = prontos.filter((i) => selecionados.has(i.sku));
  const ligado = d?.catalogoAtivo !== false;
  const detalhe = detalheSku ? (d?.itens ?? []).find((i) => i.sku === detalheSku) ?? null : null;

  function trocarAba(s: SituacaoDaTela) {
    setSituacao(s);
    setFiltro('todos');
    setCategoria('');
    setSelecionados(new Set());
  }

  function alternar(sku: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(sku)) novo.delete(sku); else novo.add(sku);
      return novo;
    });
  }

  function marcarTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(selecionaveis.map((i) => i.sku)));
  }

  function pedirPublicacao(itens: ItemDaFila[], titulo: string) {
    /* Só o que está pronto AGORA entra no lote. O servidor confere de novo,
       mas mandar o que a própria tela já sabe que não está pronto seria
       pedir uma recusa. */
    const skus = itens.filter((i) => situacaoDaTela(i) === 'pronto').map((i) => i.sku);
    if (!skus.length) return;
    parar.current = false;
    setRecado(null);
    setLote({ skus, titulo, fase: 'confirmar', feitos: 0, atual: '', resultado: null });
  }

  async function executar() {
    if (!lote) return;
    setLote({ ...lote, fase: 'rodando' });
    const r = await publicarEmLote(
      lote.skus,
      (sku) => publicarNaNuvemshop(conexao, sku, 'Preparação para Nuvemshop'),
      {
        aoProgresso: (feitos, _total, atual) => setLote((l) => (l ? { ...l, feitos, atual } : l)),
        deveParar: () => parar.current,
      },
    );
    setLote((l) => (l ? { ...l, fase: 'fim', resultado: r } : l));
    setSelecionados(new Set());
    aoMudar();
  }

  async function salvarTexto(sku: string, r: { nomeSite: string; descricaoSite: string }) {
    try {
      await salvarPrevia(conexao, sku, r);
      setRecado({ tom: 'ok', texto: 'Texto salvo.' });
      fila.recarregar();
    } catch (e) {
      setRecado({ tom: 'risk', texto: e instanceof Error ? e.message : 'Não consegui salvar.' });
    }
  }

  if (fila.erro) return <section className="mq-card"><ErrorState erro={fila.erro} aoTentarDeNovo={fila.recarregar} /></section>;

  return (
    <>
      {d && !ligado && (
        <p className="mq-note mq-note--warn">
          <Icone nome="alert" />
          <span>
            <b>O cadastro na Nuvemshop está desligado.</b> Nada é criado nem publicado na loja.
            O estoque das peças que já estão lá continua sincronizando.
          </span>
        </p>
      )}
      {d && ligado && (
        <p className="mq-hint">
          Peça <b>oculta</b> já está cadastrada na Nuvemshop, mas não aparece na loja nem pode ser
          comprada. Ela só fica visível com o seu clique em <b>Publicar</b>.
        </p>
      )}

      {recado && (
        <p className={`mq-note ${recado.tom === 'risk' ? 'mq-note--risk' : 'mq-note--ok'}`} role="status">
          <span>{recado.texto}</span>
        </p>
      )}

      {!d ? <LoadingState /> : (
        <>
          <nav className="mq-tabs" aria-label="Situação na Nuvemshop">
            {SITUACOES.map((g) => (
              <button key={g.id} type="button" aria-selected={situacao === g.id} onClick={() => trocarAba(g.id)}>
                {g.rotulo}
                <span className="mq-badge">{listas[g.id].length}</span>
              </button>
            ))}
          </nav>

          <div className="mq-filters mq-prep-filtros">
            <label className="mq-search">
              <Icone nome="search" />
              <input
                className="mq-input" type="search" placeholder="Buscar por nome ou código"
                aria-label="Buscar na Preparação" value={busca} onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            <select className="mq-input mq-select" aria-label="Tipo" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todos os tipos</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="mq-input mq-select" aria-label="Mostrar" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              {FILTROS.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
            </select>
            <span className="mq-filters__count">{visiveis.length} {plural(visiveis.length, 'peça', 'peças')}</span>
          </div>

          {naAbaPronto && prontos.length > 0 && (
            <div className="mq-card mq-card--pad mq-prep-lote" aria-label="Publicar em lote">
              <label className="mq-prep-lote__todos">
                <input type="checkbox" checked={todosMarcados} onChange={marcarTodos} disabled={!selecionaveis.length} />
                <span>Selecionar {categoria || filtro !== 'todos' || busca ? 'os filtrados' : 'todos'} ({selecionaveis.length})</span>
              </label>
              <div className="mq-btns">
                <button
                  type="button" className="mq-btn mq-btn--secondary mq-btn--sm"
                  disabled={!escolhidos.length || !ligado || !!lote}
                  onClick={() => pedirPublicacao(escolhidos, `${escolhidos.length} ${plural(escolhidos.length, 'produto selecionado', 'produtos selecionados')}.`)}
                >
                  Publicar selecionados{escolhidos.length ? ` (${escolhidos.length})` : ''}
                </button>
                <button
                  type="button" className="mq-btn mq-btn--primary mq-btn--sm"
                  disabled={!ligado || !!lote}
                  onClick={() => pedirPublicacao(prontos, `${prontos.length} ${plural(prontos.length, 'produto está pronto', 'produtos estão prontos')} para publicação.`)}
                >
                  Publicar todos os prontos ({prontos.length})
                </button>
              </div>
            </div>
          )}

          <section className="mq-card mq-card--flush">
            {visiveis.length === 0 ? (
              <div className="mq-state">
                <span className="mq-state__icon"><Icone nome="cloud" /></span>
                <h3>Nada em &quot;{SITUACOES.find((g) => g.id === situacao)?.rotulo}&quot;</h3>
                <p>
                  {situacao === 'erro' ? 'Nenhum erro de integração.'
                    : situacao === 'sem_estoque' && filtro === 'todos' && !categoria && !busca
                      ? 'Toda peça oculta tem estoque em casa.'
                    : filtro !== 'todos' || categoria || busca ? 'Nenhuma peça com esse filtro nesta aba.'
                      : 'Nenhuma peça nesta situação agora.'}
                </p>
              </div>
            ) : (
              <div className="mq-list">
                {visiveis.map((i) => (
                  <LinhaDaPreparacao
                    key={i.sku}
                    item={i}
                    produto={produtos.get(i.sku)}
                    selecionavel={naAbaPronto}
                    selecionado={selecionados.has(i.sku)}
                    publicacaoLigada={ligado && !lote}
                    aoSelecionar={() => alternar(i.sku)}
                    aoAbrir={() => setDetalheSku(i.sku)}
                    aoPublicar={() => pedirPublicacao([i], `Publicar ${i.desc || i.sku}.`)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {detalhe && (
        <DetalheDaPeca
          conexao={conexao}
          item={detalhe}
          produto={produtos.get(detalhe.sku)}
          publicacaoLigada={ligado && !lote}
          aoFechar={() => setDetalheSku(null)}
          aoPublicar={() => pedirPublicacao([detalhe], `Publicar ${detalhe.desc || detalhe.sku}.`)}
          aoSalvarTexto={(r) => salvarTexto(detalhe.sku, r)}
        />
      )}

      {lote && (
        <ModalDePublicacao
          lote={lote}
          itens={(d?.itens ?? []).filter((i) => lote.skus.includes(i.sku))}
          aoConfirmar={() => void executar()}
          aoParar={() => { parar.current = true; }}
          aoFechar={() => { setLote(null); if (lote.fase === 'fim') setDetalheSku(null); }}
        />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════ a linha */

const MARCA = { ok: '✓', falta: '✕', aviso: '!', auto: '↻' } as const;

function rotuloNaLoja(i: ItemDaFila): { texto: string; tom: string } {
  const s = situacaoDaTela(i);
  if (s === 'erro') return { texto: 'Com erro', tom: 'mq-status--risk' };
  if (s === 'nao_cadastrado') {
    if (i.nuvemshop?.naoSeAplica) return { texto: 'Kit — não vira anúncio', tom: 'mq-status--open' };
    return i.nuvemshop && !i.nuvemshop.criavel
      ? { texto: 'Precisa de decisão', tom: 'mq-status--warn' }
      : { texto: 'Será cadastrado oculto', tom: 'mq-status--open' };
  }
  if (s === 'sem_estoque') return { texto: 'Sem peça em casa', tom: 'mq-status--open' };
  if (s === 'publicado') return { texto: 'Visível na loja', tom: 'mq-status--ok' };
  if (s === 'pronto') return { texto: 'Pronto', tom: 'mq-status--brand' };
  if (i.nuvemshop?.foraDoArInesperado) return { texto: 'Saiu do ar', tom: 'mq-status--risk' };
  return { texto: 'Oculto', tom: 'mq-status--open' };
}

/** §64 — cadastro (7 itens) e, à parte, a disponibilidade. "↻" é o que o
 *  sistema resolve sozinho e não conta como pendente. */
export function MiniChecklist({ item }: { item: ItemDaFila }) {
  const lista = checklistDaPeca(item);
  const faltam = lista.filter((c) => c.marca === 'falta' || c.marca === 'aviso').length;
  const disp = disponibilidadeDaPeca(item);
  return (
    <ul className="mq-minicheck" aria-label="O que a peça já tem">
      {lista.map((c) => (
        <li key={c.rotulo} className={`is-${c.marca}`} title={c.detalhe}>
          <span aria-hidden="true">{MARCA[c.marca]}</span> {c.rotulo}
          <span className="mq-sr">{c.marca === 'ok' ? ': ok' : c.marca === 'auto' ? `: o sistema resolve — ${c.detalhe ?? ''}` : `: ${c.detalhe ?? 'falta'}`}</span>
        </li>
      ))}
      <li className={`mq-minicheck__resumo ${faltam ? 'is-falta' : 'is-ok'}`} aria-hidden="true">
        {faltam ? `${faltam} de ${lista.length} pendentes` : '✓ Cadastro completo'}
      </li>
      <li className={`mq-minicheck__disp is-${disp.marca}`} title={disp.frase}>
        {disp.casa} em casa
        <span className="mq-sr">: {disp.frase}</span>
      </li>
    </ul>
  );
}

function LinhaDaPreparacao({
  item, produto, selecionavel, selecionado, publicacaoLigada, aoSelecionar, aoAbrir, aoPublicar,
}: {
  item: ItemDaFila;
  produto: Product | undefined;
  selecionavel: boolean;
  selecionado: boolean;
  publicacaoLigada: boolean;
  aoSelecionar: () => void;
  aoAbrir: () => void;
  aoPublicar: () => void;
}) {
  const s = situacaoDaTela(item);
  const rotulo = rotuloNaLoja(item);
  const variacoes = item.nuvemshop?.variacoes ?? [];
  return (
    <div className={`mq-prep-linha${selecionado ? ' is-selected' : ''}`}>
      {selecionavel && (
        <label className="mq-prep-linha__check">
          <input type="checkbox" checked={selecionado} onChange={aoSelecionar} aria-label={`Selecionar ${item.desc || item.sku}`} />
        </label>
      )}
      <button type="button" className="mq-prep-linha__abrir" onClick={aoAbrir}>
        <FotoDaPeca peca={fotoDaPreparacao(produto)} alt={item.desc || item.sku} />
        <span className="mq-item__main">
          <b>{item.desc || item.sku}</b>
          <small>
            <span className="mq-sku">{item.sku}</span>
            {' · '}{item.cat || 'sem categoria'}
            {' · '}{item.preco != null ? money(item.preco) : 'sem preço'}
            {' · '}{item.casa} em casa
            {variacoes.length > 1 ? ` · ${variacoes.length} variações` : ''}
          </small>
          <MiniChecklist item={item} />
        </span>
      </button>
      <span className="mq-prep-linha__lado">
        <span className={`mq-status ${rotulo.tom}`}>{rotulo.texto}</span>
        {s === 'pronto' && (
          <button
            type="button" className="mq-btn mq-btn--primary mq-btn--sm"
            disabled={!publicacaoLigada} onClick={aoPublicar}
          >
            Publicar
          </button>
        )}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ a confirmação */

function ModalDePublicacao({
  lote, itens, aoConfirmar, aoParar, aoFechar,
}: {
  lote: Lote;
  itens: ItemDaFila[];
  aoConfirmar: () => void;
  aoParar: () => void;
  aoFechar: () => void;
}) {
  const r = resumoDoLote(itens);
  const n = lote.skus.length;
  const res = lote.resultado;
  const nome = (sku: string) => itens.find((i) => i.sku === sku)?.desc || sku;
  return (
    <>
      <button
        type="button" className="mq-scrim" aria-label="Fechar"
        onClick={lote.fase === 'rodando' ? undefined : aoFechar}
      />
      <div className="mq-modal" role="dialog" aria-modal="true" aria-label="Publicar na Nuvemshop">
        <div className="mq-modal__head">
          <div>
            <p className="mq-eyebrow">Nuvemshop</p>
            <h2 className="mq-title">
              {lote.fase === 'fim' ? 'Publicação concluída' : n === 1 ? 'Publicar na loja' : `Publicar ${n} produtos`}
            </h2>
            {lote.fase === 'confirmar' && <p className="mq-lede">{lote.titulo}</p>}
          </div>
          {lote.fase !== 'rodando' && (
            <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
              <Icone nome="close" />
            </button>
          )}
        </div>

        <div className="mq-modal__body">
          {lote.fase === 'confirmar' && (
            <>
              <dl className="mq-confirm mq-prep-resumo">
                <div><dt>Produtos</dt><dd>{r.produtos}</dd></div>
                <div><dt>Peças em casa</dt><dd>{r.pecas}</dd></div>
                <div><dt>Com preço</dt><dd>{r.comPreco}</dd></div>
                <div><dt>Com imagem</dt><dd>{r.comFoto}</dd></div>
                <div><dt>Pendências críticas</dt><dd>{r.criticas}</dd></div>
              </dl>
              <p className="mq-hint">
                Eles passam de <b>ocultos</b> para <b>visíveis</b> e podem ser comprados na loja.
                Cada produto é conferido de novo na Nuvemshop antes de ficar visível: se algum mudou
                desde esta lista, ele não é publicado e os outros continuam.
              </p>
            </>
          )}

          {lote.fase === 'rodando' && (
            <div className="mq-stack" role="status" aria-live="polite">
              <p><b>Publicando {Math.min(lote.feitos + 1, n)} de {n}…</b> {lote.atual && <span className="mq-sku">{lote.atual}</span>}</p>
              <span className="mq-meter"><i style={{ width: `${Math.round((lote.feitos / Math.max(1, n)) * 100)}%` }} /></span>
              <p className="mq-hint">Um de cada vez, conferido na loja. Não feche esta janela.</p>
            </div>
          )}

          {lote.fase === 'fim' && res && (
            <div className="mq-stack" role="status">
              <p className="mq-note mq-note--ok">
                <Icone nome="check" />
                <span><b>{res.publicados.length} {plural(res.publicados.length, 'publicado', 'publicados')}</b> — a Nuvemshop confirmou que {plural(res.publicados.length, 'está visível', 'estão visíveis')}.</span>
              </p>
              {res.pulados.length > 0 && (
                <section className="mq-stack mq-stack--tight">
                  <p className="mq-note mq-note--warn">
                    <Icone nome="alert" />
                    <span>
                      <b>{res.pulados.length} não {plural(res.pulados.length, 'publicado', 'publicados')}</b> porque{' '}
                      {plural(res.pulados.length, 'mudou', 'mudaram')} desde a conferência.
                    </span>
                  </p>
                  <ul className="mq-atencao__codigos">
                    {res.pulados.map((p) => <li key={p.sku}><span className="mq-sku">{p.sku}</span> {nome(p.sku)} — {p.motivo}</li>)}
                  </ul>
                </section>
              )}
              {res.falhas.length > 0 && (
                <section className="mq-stack mq-stack--tight">
                  <p className="mq-note mq-note--risk">
                    <Icone nome="alert" />
                    <span><b>{res.falhas.length} {plural(res.falhas.length, 'falhou', 'falharam')}</b> na comunicação com a loja. Pode tentar de novo.</span>
                  </p>
                  <ul className="mq-atencao__codigos">
                    {res.falhas.map((p) => <li key={p.sku}><span className="mq-sku">{p.sku}</span> {nome(p.sku)} — {p.motivo}</li>)}
                  </ul>
                </section>
              )}
              {res.interrompido && (
                <p className="mq-hint">
                  Interrompido: {n - res.publicados.length - res.pulados.length - res.falhas.length} ficaram ocultos, sem tentativa.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mq-modal__foot">
          {lote.fase === 'confirmar' && (
            <>
              <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>Cancelar</button>
              <button type="button" className="mq-btn mq-btn--primary" onClick={aoConfirmar} disabled={!n}>
                {n === 1 ? 'Publicar 1 produto' : `Publicar ${n} produtos`}
              </button>
            </>
          )}
          {lote.fase === 'rodando' && (
            <button type="button" className="mq-btn mq-btn--ghost" onClick={aoParar}>Parar depois deste</button>
          )}
          {lote.fase === 'fim' && (
            <button type="button" className="mq-btn mq-btn--primary" onClick={aoFechar}>Fechar</button>
          )}
        </div>
      </div>
    </>
  );
}
