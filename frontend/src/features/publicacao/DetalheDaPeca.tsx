import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { FotoDaPeca } from '../../components/FotoDaPeca';
import { miniaturaDaFoto } from '../../domain/foto';
import { money } from '../../domain/formato';
import type { Product } from '../../types/api';
import type { Connection } from '../../services/client';
import { lerAnuncio } from './api';
import { checklistDaPeca, situacaoDaTela, ROTULO_DA_PENDENCIA, type ItemDaFila } from './tipos';
import { fotoDaPreparacao } from './miniatura';

interface Props {
  conexao: Connection;
  item: ItemDaFila;
  produto: Product | undefined;
  publicacaoLigada: boolean;
  aoFechar: () => void;
  aoPublicar: () => void;
  aoSalvarTexto: (r: { nomeSite: string; descricaoSite: string }) => void;
}

const MARCA = { ok: '✓', falta: '✕', aviso: '!' } as const;
const TOM_DA_MARCA = { ok: 'mq-money--ok', falta: 'mq-money--risk', aviso: 'mq-money--warn' } as const;

/** Texto do anúncio sem HTML. A prévia MOSTRA o que a loja tem; não
 *  injeta o HTML de lá nesta página. */
const semHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** §63 — A CONFERÊNCIA ANTES DE PUBLICAR.
 *
 *  O cadastro que vai para a loja, num painel: foto, nome, SKU, preço,
 *  estoque, categoria, variação, descrição, SEO, tags, atributos e o que
 *  falta. Para peça que já está na Nuvemshop (oculta ou visível), o painel
 *  LÊ o anúncio na hora — uma chamada, só leitura — e mostra o que está lá
 *  de fato; o que este sistema guardou pode estar atrasado. Não reproduz o
 *  admin da Nuvemshop: é a última olhada antes do clique. */
export function DetalheDaPeca({ conexao, item, produto, publicacaoLigada, aoFechar, aoPublicar, aoSalvarTexto }: Props) {
  const s = situacaoDaTela(item);
  const ns = item.nuvemshop;
  const naLoja = ns?.naLoja ?? item.presencaNaLoja;
  const anuncio = useApi(
    (sinal) => (naLoja ? lerAnuncio(conexao, item.sku, sinal) : Promise.resolve(null)),
    [conexao, item.sku, naLoja],
  );
  const [nome, setNome] = useState(item.rascunho?.nomeSite ?? item.desc ?? '');
  const [descricao, setDescricao] = useState(item.rascunho?.descricaoSite ?? '');

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  const a = anuncio.dados;
  const lista = checklistDaPeca(item);
  const texto = ns?.texto;
  const bloqueios = s === 'nao_cadastrado' && ns && !ns.criavel ? ns.bloqueios : [];

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-drawer mq-drawer--larga" role="dialog" aria-modal="true" aria-label="Detalhes da peça">
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">Preparação para Nuvemshop</p>
            <h2 className="mq-title">{item.desc || item.sku}</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-drawer__body mq-stack">
          <div className="mq-prep-detalhe__topo">
            <FotoDaPeca peca={fotoDaPreparacao(produto)} alt={item.desc || item.sku} tamanho="cartao" />
            <dl className="mq-figures">
              <div><dt>SKU</dt><dd className="mq-sku">{item.sku}</dd></div>
              <div><dt>Preço</dt><dd>{item.preco != null ? money(item.preco) : 'sem preço'}</dd></div>
              <div><dt>Estoque em casa</dt><dd>{item.casa}</dd></div>
              <div><dt>Categoria</dt><dd>{item.cat || '—'}</dd></div>
            </dl>
          </div>

          <section className="mq-stack mq-stack--tight">
            <h3 className="mq-subtitle">Checklist</h3>
            <ul className="mq-checklist" aria-label="O que a peça já tem">
              {lista.map((c) => (
                <li key={c.rotulo}>
                  <span className={TOM_DA_MARCA[c.marca]} aria-hidden="true">{MARCA[c.marca]}</span>{' '}
                  <b>{c.rotulo}</b>
                  {c.marca !== 'ok' && c.detalhe ? <small> — {c.detalhe}</small> : null}
                </li>
              ))}
            </ul>
          </section>

          {bloqueios.length > 0 && (
            <p className="mq-note mq-note--warn">
              <Icone nome="alert" />
              <span><b>Precisa de decisão antes de ir para a Nuvemshop:</b> {bloqueios.join(' ')}</span>
            </p>
          )}
          {ns?.foraDoArInesperado && (
            <p className="mq-note mq-note--risk">
              <Icone nome="alert" />
              <span><b>Saiu do ar:</b> foi publicada por aqui e não está mais visível na loja.</span>
            </p>
          )}
          {(ns?.ultimoErro || item.erroSincronizacao) && (
            <p className="mq-note mq-note--risk" role="alert">
              <Icone nome="alert" />
              <span>{ns?.ultimoErro || `Estoque não chegou à loja: ${item.erroSincronizacao}`}</span>
            </p>
          )}
          {item.bloqueios.length > 0 && (
            <p className="mq-note mq-note--info">
              <Icone nome="alert" />
              <span>
                <b>Ainda não disponível:</b> {item.bloqueios.map((b) => String(b.motivo ?? b)).join(' · ')}.
                {' '}Isto não é da peça — é o que este servidor ainda não consegue fazer.
              </span>
            </p>
          )}

          {ns && ns.variacoes.length > 0 && (
            <section className="mq-stack mq-stack--tight">
              <h3 className="mq-subtitle">Variações</h3>
              <ul className="mq-checklist">
                {ns.variacoes.map((v) => <li key={v.nome}><b>{v.nome}</b> <small>· {v.estoque} em estoque</small></li>)}
              </ul>
              {ns.variacoesSoAqui.length > 0 && (
                <p className="mq-hint">Só no Marquesa (a loja ainda não tem): {ns.variacoesSoAqui.join(', ')}.</p>
              )}
            </section>
          )}

          {/* ─── o anúncio como a loja o tem agora */}
          {naLoja && (
            <section className="mq-stack mq-stack--tight" aria-label="Na Nuvemshop agora">
              <h3 className="mq-subtitle">Na Nuvemshop agora</h3>
              {anuncio.carregando && <p className="mq-hint">Lendo o anúncio na loja…</p>}
              {!!anuncio.erro && (
                <p className="mq-note mq-note--warn">
                  <span>
                    Não consegui ler o anúncio agora ({anuncio.erro instanceof Error ? anuncio.erro.message : 'erro'}).
                    O checklist acima vem da última conferência.
                  </span>
                </p>
              )}
              {a && (
                <>
                  {a.imagens.length > 0 && (
                    <div className="mq-prep-detalhe__fotos">
                      {a.imagens.slice(0, 6).map((src) => (
                        <span key={src} className="mq-thumb mq-thumb--lg">
                          <img src={miniaturaDaFoto(src) ?? src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        </span>
                      ))}
                    </div>
                  )}
                  <dl className="mq-figures mq-prep-detalhe__anuncio">
                    <div><dt>Nome</dt><dd>{a.nome || '—'}</dd></div>
                    <div><dt>Visibilidade</dt><dd>{a.visibilidade === 'visible' ? 'visível' : a.visibilidade === 'hidden' ? 'oculto' : a.visibilidade ?? '—'}</dd></div>
                    <div><dt>Categoria</dt><dd>{a.categorias.join(', ') || '—'}</dd></div>
                    <div>
                      <dt>Variantes</dt>
                      <dd>
                        {a.variantes.map((v) => (
                          <span key={v.id} className="mq-prep-detalhe__variante">
                            {v.valores.join(' · ') || v.sku || v.id}: {v.preco != null ? money(v.preco) : 'sem preço'}, {v.estoque ?? '?'} em estoque
                          </span>
                        ))}
                      </dd>
                    </div>
                    <div><dt>Título SEO</dt><dd>{a.seoTitulo || '—'}</dd></div>
                    <div><dt>Meta description</dt><dd>{a.seoDescricao || '—'}</dd></div>
                    <div><dt>Tags</dt><dd>{a.tags.join(', ') || '—'}</dd></div>
                    <div><dt>Atributos</dt><dd>{a.atributos.join(', ') || '—'}</dd></div>
                    <div className="mq-prep-detalhe__descricao"><dt>Descrição</dt><dd>{semHtml(a.descricao) || '—'}</dd></div>
                  </dl>
                  {a.faltam.length > 0 && (
                    <p className="mq-note mq-note--warn">
                      <span><b>A loja diz que falta:</b> {a.faltam.map((f) => (ROTULO_DA_PENDENCIA[f] ?? f).toLowerCase()).join(', ')}.</span>
                    </p>
                  )}
                </>
              )}
            </section>
          )}

          {/* ─── peça sem anúncio: o texto que vai subir */}
          {!naLoja && (
            <section className="mq-stack mq-stack--tight">
              <h3 className="mq-subtitle">O texto do site</h3>
              {texto?.seoTitulo && (
                <dl className="mq-figures mq-prep-detalhe__anuncio">
                  <div><dt>Título SEO</dt><dd>{texto.seoTitulo}</dd></div>
                  <div><dt>Meta description</dt><dd>{texto.seoDescricao || '—'}</dd></div>
                  <div className="mq-prep-detalhe__descricao"><dt>Descrição</dt><dd>{semHtml(texto.descricao || '') || '—'}</dd></div>
                </dl>
              )}
              {texto?.precisaInformacao && (
                <p className="mq-note mq-note--warn">
                  <Icone nome="alert" />
                  <span><b>Precisa de informação:</b> {texto.precisaInformacao}</span>
                </p>
              )}
              <label className="mq-field">
                <span>Nome na loja</span>
                <input className="mq-input" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} />
              </label>
              <label className="mq-field">
                <span>Descrição (opcional — vence a gerada)</span>
                <textarea className="mq-textarea" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
              </label>
              <div className="mq-btns">
                <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={() => aoSalvarTexto({ nomeSite: nome, descricaoSite: descricao })}>
                  Salvar texto
                </button>
              </div>
            </section>
          )}

          <details className="mq-details">
            <summary>Detalhe técnico</summary>
            <dl className="mq-figures mq-prep-detalhe__anuncio">
              <div><dt>Produto na Nuvemshop</dt><dd>{ns?.produtoId ?? item.produtoIdLoja ?? '—'}</dd></div>
              <div><dt>Visibilidade registrada</dt><dd>{ns?.visibilidade ?? '—'}</dd></div>
              <div>
                <dt>Cadastro</dt>
                <dd>{ns?.origemCatalogo === 'criado' ? 'criado pelo Marquesa' : ns?.origemCatalogo === 'adotado' ? 'já existia na loja' : '—'}</dd>
              </div>
              <div><dt>Estoque na fila</dt><dd>{ns?.estoque ?? '—'}</dd></div>
              <div><dt>Pendências (chaves)</dt><dd>{(item.pendencias ?? []).join(', ') || '—'}</dd></div>
            </dl>
          </details>

          <div className="mq-btns">
            {s === 'pronto' && (
              <button type="button" className="mq-btn mq-btn--primary" disabled={!publicacaoLigada} onClick={aoPublicar}>
                Publicar na Nuvemshop
              </button>
            )}
            {s === 'publicado' && item.urlLoja && (
              <a
                className="mq-btn mq-btn--link"
                href={`https://marquesasemijoias.com.br/produtos/${item.urlLoja}/`}
                target="_blank" rel="noreferrer"
              >
                Ver na loja
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
