import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData } from '../../domain/formato';
import { fotoDaPeca } from '../../domain/foto';
import { EditarPeca } from '../catalogo/EditarPeca';
import { PainelDeVariacoes } from '../catalogo/PainelDeVariacoes';
import { GaleriaDaPeca } from './galeria/GaleriaDaPeca';
import type { Galeria } from './galeria/api';
import type { ProdutoDoEstado } from '../vendas/tipos';

interface Movimento {
  id: number;
  variacao: string | null;
  tipo: string;
  qtd: number;
  origem: string | null;
  venda_id: number | null;
  maleta_id: number | null;
  obs: string | null;
  criado_em: string;
}

interface RazaoDoSku {
  saldos: { qtd: number; consignado: number; disponivel: number };
  movimentos: Movimento[];
}

export type AbaDaFicha = 'geral' | 'fotos' | 'estoque' | 'historico' | 'loja';

export const ABAS_DA_FICHA: { id: AbaDaFicha; rotulo: string }[] = [
  { id: 'geral', rotulo: 'Visão geral' },
  { id: 'fotos', rotulo: 'Fotos' },
  { id: 'estoque', rotulo: 'Estoque' },
  { id: 'historico', rotulo: 'Histórico' },
  { id: 'loja', rotulo: 'Loja online' },
];

interface Props {
  conexao: Connection;
  peca: ProdutoDoEstado;
  categorias: string[];
  aba: AbaDaFicha;
  aoTrocarAba: (aba: AbaDaFicha) => void;
  aoFechar: () => void;
  /** Salvar o cadastro, mexer nas variações ou nas fotos muda o estado compartilhado. */
  aoMudar: () => void;
}

/** A FICHA DA PEÇA — tudo sobre uma peça, numa página só.
 *
 *  Antes, a mesma peça estava espalhada: a quantidade no Estoque, o preço
 *  numa gaveta do Catálogo, as variações noutro botão e a situação na loja
 *  numa terceira tela. Até 29/09/2026 a ficha era uma gaveta estreita, e a
 *  foto era um botão "Subir foto" sem lugar para ver a galeria. Agora é uma
 *  página, com o cabeçalho que responde "que peça é e onde ela está", e
 *  cinco abas: o resumo, as fotos, o estoque, o histórico e a loja online.
 *
 *  A aba mora no endereço (`#/estoque/peca:<sku>|fotos`): o voltar do
 *  navegador volta de aba, e um link manda direto para as fotos. */
export function FichaDaPeca({ conexao, peca, categorias, aba, aoTrocarAba, aoFechar, aoMudar }: Props) {
  const [editando, setEditando] = useState(false);
  const [variacoes, setVariacoes] = useState(false);
  const [buscarNaLoja, setBuscarNaLoja] = useState(false);
  /* A galeria lida AGORA manda no topo: o estado geral só recarrega depois
     (ou nem recarrega, se o servidor falhar), e o topo dizendo "0 fotos"
     com duas fotos logo abaixo é o número errado que ninguém entende. */
  const [lida, setLida] = useState<{ sku: string; total: number; mini: string | null } | null>(null);
  const aoLerGaleria = (g: Galeria) => {
    const p = g.fotos.find((f) => f.principal) ?? g.fotos[0] ?? null;
    setLida({ sku: peca.sku, total: g.fotos.length, mini: p ? (p.urlMiniatura || p.urlGrande || null) : null });
  };
  const daGaleria = lida && lida.sku === peca.sku ? lida : null;

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !variacoes && !editando && !document.querySelector('.mq-ampliada')) aoFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar, variacoes, editando]);

  useEffect(() => { try { window.scrollTo({ top: 0 }); } catch { /* ambiente sem rolagem */ } }, [peca.sku]);

  const foto = (daGaleria && daGaleria.mini) || fotoDaPeca(peca);
  const emCasa = peca.qtd - peca.consignado;
  const qtdFotos = daGaleria ? daGaleria.total : (peca.fotosQtd ?? 0);
  const falta = [
    !foto && 'foto',
    !peca.cat && 'categoria',
    peca.semPreco && 'preço',
  ].filter(Boolean) as string[];

  const loja = situacaoNaLoja(peca);

  return (
    <article className="mq-peca" aria-label={`Ficha da peça ${peca.sku}`}>
      <nav className="mq-peca__voltar">
        <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={aoFechar}>
          <span className="mq-galeria__seta-esq" aria-hidden="true"><Icone nome="chevron" /></span> Peças
        </button>
      </nav>

      <header className="mq-peca__cabeca mq-card">
        <button type="button" className="mq-peca__foto" onClick={() => aoTrocarAba('fotos')}
          aria-label={qtdFotos ? `Ver as ${qtdFotos} fotos` : 'Ir para as fotos da peça'}>
          {foto
            ? <img src={(daGaleria && daGaleria.mini) || peca.fotoMiniUrl || foto} alt={peca.desc} decoding="async" />
            : <span className="mq-peca__foto-vazia" aria-hidden="true">◇</span>}
          <small>
            <Icone nome="camera" />
            {qtdFotos ? `${qtdFotos} ${qtdFotos === 1 ? 'foto' : 'fotos'}` : foto ? 'só na loja' : 'sem foto'}
          </small>
        </button>

        <div className="mq-peca__titulo">
          <p className="mq-eyebrow">
            SKU {peca.sku} · {peca.cat || 'Sem categoria'}
          </p>
          <h1 className="mq-display">{peca.desc}</h1>
          <div className="mq-peca__selos">
            <span className={peca.status === 'ativo' ? 'mq-status mq-status--ok' : 'mq-status'}>
              {peca.status === 'ativo' ? 'Ativa' : peca.status}
            </span>
            <span className={`mq-status mq-status--${loja.tom}`}>{loja.rotulo}</span>
            {falta.length > 0 && <span className="mq-status mq-status--warn">Cadastro incompleto</span>}
          </div>
        </div>

        <div className="mq-peca__preco">
          <span className="mq-label">Preço</span>
          <b className="mq-money mq-money--lg">{peca.preco === null ? 'Sem preço' : money(peca.preco)}</b>
          <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" onClick={() => { aoTrocarAba('geral'); setEditando(true); }}>
            Editar dados
          </button>
        </div>

        <dl className="mq-peca__numeros">
          <div><dt>Total</dt><dd>{peca.qtd}</dd></div>
          <div><dt>Em casa</dt><dd>{emCasa}</dd></div>
          <div><dt>Com revendedoras</dt><dd>{peca.consignado}</dd></div>
          <div><dt>Na loja online</dt><dd>{peca.estoqueLoja == null ? '—' : peca.estoqueLoja}</dd></div>
        </dl>
      </header>

      <nav className="mq-tabs mq-peca__abas" role="tablist" aria-label="Seções da peça">
        {ABAS_DA_FICHA.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => aoTrocarAba(a.id)}>
            {a.rotulo}
            {a.id === 'fotos' && <span className="mq-badge mq-badge--quiet">{qtdFotos}</span>}
          </button>
        ))}
      </nav>

      <div className="mq-peca__conteudo" role="tabpanel">
        {aba === 'geral' && (
          editando ? (
            <section className="mq-card mq-card--pad">
              <EditarPeca
                conexao={conexao}
                peca={peca}
                categorias={categorias}
                aoCancelar={() => setEditando(false)}
                aoSalvar={() => { setEditando(false); aoMudar(); }}
              />
            </section>
          ) : (
            <VisaoGeral
              peca={peca}
              falta={falta}
              aoFotos={() => aoTrocarAba('fotos')}
              aoEditar={() => setEditando(true)}
              aoVariacoes={() => setVariacoes(true)}
            />
          )
        )}

        {aba === 'fotos' && (
          <section className="mq-card mq-card--pad">
            <GaleriaDaPeca
              conexao={conexao}
              sku={peca.sku}
              desc={peca.desc}
              aoMudar={aoMudar}
              buscarAoAbrir={buscarNaLoja}
              aoLer={aoLerGaleria}
            />
          </section>
        )}

        {aba === 'estoque' && (
          <Estoque peca={peca} aoVariacoes={() => setVariacoes(true)} />
        )}

        {aba === 'historico' && (
          <section className="mq-card mq-card--pad">
            <Historico conexao={conexao} sku={peca.sku} />
          </section>
        )}

        {aba === 'loja' && (
          <LojaOnline
            peca={peca}
            aoBuscarFotos={() => { setBuscarNaLoja(true); aoTrocarAba('fotos'); }}
          />
        )}
      </div>

      {variacoes && (
        <PainelDeVariacoes
          conexao={conexao}
          sku={peca.sku}
          aoFechar={() => setVariacoes(false)}
          aoMudarEstoque={aoMudar}
        />
      )}
    </article>
  );
}

function situacaoNaLoja(p: ProdutoDoEstado): { rotulo: string; tom: 'ok' | 'warn' | 'plain' | 'info' } {
  if (p.naLoja === false && !p.urlLoja) return { rotulo: 'Não está na loja online', tom: 'plain' };
  if (p.naLoja == null && !p.urlLoja) return { rotulo: 'Loja online: sem leitura', tom: 'plain' };
  if (p.visivel === false) return { rotulo: 'Na loja online · oculta', tom: 'warn' };
  return { rotulo: 'Na loja online', tom: 'ok' };
}

function VisaoGeral({ peca, falta, aoFotos, aoEditar, aoVariacoes }: {
  peca: ProdutoDoEstado;
  falta: string[];
  aoFotos: () => void;
  aoEditar: () => void;
  aoVariacoes: () => void;
}) {
  const qtdFotos = peca.fotosQtd ?? 0;
  return (
    <div className="mq-peca__geral">
      <section className="mq-card mq-card--pad">
        <h2 className="mq-subtitle">Cadastro</h2>
        <dl className="mq-dl">
          <div><dt>Nome</dt><dd>{peca.desc}</dd></div>
          <div><dt>SKU</dt><dd className="mq-sku">{peca.sku}</dd></div>
          <div><dt>Categoria</dt><dd>{peca.cat || 'Sem categoria'}</dd></div>
          <div><dt>Preço</dt><dd className="mq-money">{peca.preco === null ? 'Sem preço' : money(peca.preco)}</dd></div>
          <div><dt>Custo</dt><dd className="mq-money">{peca.custo == null ? 'Não informado' : money(peca.custo)}</dd></div>
          <div><dt>Situação</dt><dd>{peca.status === 'ativo' ? 'Ativa' : peca.status}</dd></div>
          {peca.variacoes && peca.variacoes.length > 0 && (
            <div><dt>Variações</dt><dd>{peca.variacoes.map((v) => v.nome).join(' · ')}</dd></div>
          )}
        </dl>
        {falta.length > 0 && (
          <p className="mq-note mq-note--warn">
            <Icone nome="alert" />
            <span>
              <b>Cadastro incompleto:</b> falta {falta.join(', ')}.
              {peca.semPreco ? ' Sem preço, a peça não pode ser vendida nem publicada.' : ''}
            </span>
          </p>
        )}
        <div className="mq-btns">
          <button type="button" className="mq-btn mq-btn--primary" onClick={aoEditar}>Editar dados</button>
          <button type="button" className="mq-btn mq-btn--secondary" onClick={aoVariacoes}>Variações</button>
        </div>
      </section>

      <section className="mq-card mq-card--pad mq-peca__fotos-resumo">
        <h2 className="mq-subtitle">Fotos</h2>
        {qtdFotos > 0 ? (
          <p className="mq-hint">
            {qtdFotos} {qtdFotos === 1 ? 'foto' : 'fotos'} na galeria
            {peca.fotosDaLoja ? ` · ${peca.fotosDaLoja} vieram da loja online` : ''}.
            A principal é a que aparece na lista, na busca e na venda.
          </p>
        ) : fotoDaPeca(peca) ? (
          <p className="mq-hint">
            A foto que aparece hoje é a da loja online — ainda não foi copiada para cá.
            {(peca.fotosNaLoja ?? 0) > 1 ? ` A loja tem ${peca.fotosNaLoja} fotos desta peça.` : ''}
          </p>
        ) : (
          <p className="mq-hint">Esta peça ainda não tem foto.</p>
        )}
        <button type="button" className="mq-btn mq-btn--secondary" onClick={aoFotos}>
          <Icone nome="image" /> {qtdFotos ? 'Ver e organizar as fotos' : 'Adicionar ou importar fotos'}
        </button>
      </section>
    </div>
  );
}

function Estoque({ peca, aoVariacoes }: { peca: ProdutoDoEstado; aoVariacoes: () => void }) {
  const emCasa = peca.qtd - peca.consignado;
  return (
    <section className="mq-card mq-card--pad">
      <h2 className="mq-subtitle">Onde está</h2>
      <dl className="mq-dl">
        <div><dt>Em casa</dt><dd className="mq-qty">{emCasa}</dd></div>
        <div><dt>Com revendedoras</dt><dd className="mq-qty">{peca.consignado}</dd></div>
        <div><dt>Disponível para vender</dt><dd className="mq-qty">{peca.disponivel}</dd></div>
        <div><dt>Total</dt><dd className="mq-qty">{peca.qtd}</dd></div>
      </dl>
      {peca.variacoes && peca.variacoes.length > 0 && (
        <>
          <h3 className="mq-subtitle">Por variação</h3>
          <dl className="mq-dl">
            {peca.variacoes.map((v) => (
              <div key={v.nome}>
                <dt>{v.nome}</dt>
                <dd className="mq-qty">{v.qtd}{v.estoqueLoja != null ? <small> · loja {v.estoqueLoja}</small> : null}</dd>
              </div>
            ))}
            {(peca.semVariacao ?? 0) > 0 && (
              <div><dt>Sem variação definida</dt><dd className="mq-qty">{peca.semVariacao}</dd></div>
            )}
          </dl>
        </>
      )}
      <p className="mq-hint">
        O saldo é a soma das entradas e saídas registradas — veja cada uma na aba Histórico.
      </p>
      <div className="mq-btns">
        <button type="button" className="mq-btn mq-btn--secondary" onClick={aoVariacoes}>Variações</button>
      </div>
    </section>
  );
}

function LojaOnline({ peca, aoBuscarFotos }: { peca: ProdutoDoEstado; aoBuscarFotos: () => void }) {
  const loja = situacaoNaLoja(peca);
  return (
    <section className="mq-card mq-card--pad">
      <h2 className="mq-subtitle">Loja online</h2>
      <p><span className={`mq-status mq-status--${loja.tom}`}>{loja.rotulo}</span></p>
      <dl className="mq-dl">
        {peca.nomeLoja && <div><dt>Nome na loja</dt><dd>{peca.nomeLoja}</dd></div>}
        <div><dt>Estoque mostrado na loja</dt><dd className="mq-qty">{peca.estoqueLoja == null ? '—' : peca.estoqueLoja}</dd></div>
        <div><dt>Fotos na loja</dt><dd>{peca.fotosNaLoja ?? 0}</dd></div>
        <div><dt>Fotos aqui (da loja)</dt><dd>{peca.fotosDaLoja ?? 0} de {peca.fotosQtd ?? 0}</dd></div>
      </dl>
      {peca.urlLoja && (
        <p><a className="mq-btn mq-btn--link" href={peca.urlLoja} target="_blank" rel="noreferrer">Abrir o anúncio na loja</a></p>
      )}
      <p className="mq-hint">
        Buscar as fotos só LÊ a loja online e copia as imagens para a galeria desta peça.
        Nada muda na loja, e o estoque não é tocado.
      </p>
      <div className="mq-btns">
        <button type="button" className="mq-btn mq-btn--primary" onClick={aoBuscarFotos}>
          <Icone nome="cloud" /> Buscar fotos na loja online
        </button>
      </div>
    </section>
  );
}

/** Tudo o que entrou e saiu desta peça, do mais novo para o mais antigo.
 *  A soma das linhas é o saldo — se um dia não for, a ficha avisa em vez
 *  de esconder. */
function Historico({ conexao, sku }: { conexao: Connection; sku: string }) {
  const razao = useApi(
    (s) => chamar<RazaoDoSku>(conexao, 'GET', `/api/estoque/${encodeURIComponent(sku)}/movimentos`, undefined, { signal: s }),
    [conexao, sku],
  );

  if (razao.erro) return <ErrorState erro={razao.erro} aoTentarDeNovo={razao.recarregar} />;
  if (!razao.dados) return <p className="mq-hint">Carregando o histórico…</p>;

  const soma = razao.dados.movimentos.reduce((s, m) => s + Number(m.qtd), 0);
  const fecha = soma === razao.dados.saldos.qtd;

  return (
    <section aria-label="Histórico da peça">
      <h2 className="mq-subtitle">Histórico</h2>
      {!fecha && (
        <p className="mq-note mq-note--risk" role="alert">
          <Icone nome="alert" />
          <span>
            As entradas e saídas somam {soma}, mas o saldo é {razao.dados.saldos.qtd}.
            Não corrija à mão: isto precisa ser investigado.
          </span>
        </p>
      )}
      {razao.dados.movimentos.length === 0 ? (
        <p className="mq-hint">Nenhuma entrada ou saída registrada.</p>
      ) : (
        <div className="mq-timeline">
          {razao.dados.movimentos.slice().reverse().map((m) => (
            <div className="mq-timeline__row" key={m.id}>
              <span className="mq-timeline__dot">
                <Icone nome={m.qtd < 0 ? 'sale' : 'box'} />
              </span>
              <span className="mq-timeline__body">
                <b>
                  {m.tipo} {m.qtd > 0 ? '+' : ''}{m.qtd}
                  {m.variacao ? ` · ${m.variacao}` : ''}
                </b>
                <small>
                  {fmtData(m.criado_em)}
                  {m.venda_id ? ` · venda #${m.venda_id}` : ''}
                  {m.maleta_id ? ` · maleta #${m.maleta_id}` : ''}
                  {m.obs ? ` · ${m.obs}` : ''}
                </small>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
