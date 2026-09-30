import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../../hooks/useApi';
import type { Connection } from '../../../services/client';
import { Icone } from '../../../components/Icone';
import { ErrorState } from '../../../components/ErrorState';
import { fmtData } from '../../../domain/formato';
import { miniaturaDaFoto } from '../../../domain/foto';
import { Ampliada } from './Ampliada';
import {
  lerGaleria, definirPrincipal, reordenar, removerFoto, enviarFoto, prepararImagem,
  buscarNaLoja, mover, ORIGEM, type FotoDaGaleria, type ResultadoDaPeca,
} from './api';

interface Props {
  conexao: Connection;
  sku: string;
  desc: string;
  /** Quem mostra a lista precisa saber que a principal/contagem mudou. */
  aoMudar: () => void;
  /** Abrir já procurando na loja (o botão da aba "Loja online"). */
  buscarAoAbrir?: boolean;
}

type Loja =
  | { fase: 'parado' }
  | { fase: 'buscando' }
  | { fase: 'visto'; r: ResultadoDaPeca }
  | { fase: 'importando'; r: ResultadoDaPeca; feitas: number };

const TODAS = '__todas__';
const GERAL = '__geral__';

const tamanhoLegivel = (n: number | null) => (n == null ? '—'
  : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** A GALERIA DA PEÇA — todas as fotos, na ordem escolhida.
 *
 *  Três jeitos de ordenar, porque um só não serve a todo mundo: arrastar a
 *  miniatura (computador), os botões "para o início / antes / depois"
 *  (celular, onde arrastar é desajeitado), e "Definir como principal", que
 *  leva a foto escolhida para o início e a marca como capa.
 *
 *  Toda ação grava na hora e relê do servidor: a ordem que aparece é a
 *  ordem que está no banco, e não uma que só existe nesta aba. */
export function GaleriaDaPeca({ conexao, sku, desc, aoMudar, buscarAoAbrir = false }: Props) {
  const galeria = useApi((s) => lerGaleria(conexao, sku, s), [conexao, sku]);
  const [ordemLocal, setOrdemLocal] = useState<string[] | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<string>(TODAS);
  const [ocupado, setOcupado] = useState('');
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'risk' | 'warn'; texto: string; lista?: string[] } | null>(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [loja, setLoja] = useState<Loja>({ fase: 'parado' });
  const entradaArquivos = useRef<HTMLInputElement>(null);
  const entradaCamera = useRef<HTMLInputElement>(null);

  const todas = useMemo(() => {
    const base = galeria.dados?.fotos ?? [];
    if (!ordemLocal) return base;
    const porId = new Map(base.map((f) => [f.id, f]));
    return ordemLocal.map((id) => porId.get(id)).filter(Boolean) as FotoDaGaleria[];
  }, [galeria.dados, ordemLocal]);

  const variacoes = useMemo(() => [...new Set(todas.map((f) => f.variacao).filter(Boolean))] as string[], [todas]);
  const visiveis = filtro === TODAS ? todas
    : todas.filter((f) => (filtro === GERAL ? !f.variacao : f.variacao === filtro));
  const podeOrdenar = filtro === TODAS && !ocupado;

  /* A foto em destaque: a escolhida, ou a principal, ou a primeira. */
  const destaque = visiveis.find((f) => f.id === selecionada)
    ?? visiveis.find((f) => f.principal) ?? visiveis[0] ?? null;
  const posDestaque = destaque ? todas.findIndex((f) => f.id === destaque.id) : -1;

  useEffect(() => { setOrdemLocal(null); }, [galeria.dados]);

  const recarregar = () => { galeria.recarregar(); aoMudar(); };

  async function executar(rotulo: string, acao: () => Promise<unknown>, sucesso?: string) {
    setOcupado(rotulo);
    setAviso(null);
    try {
      await acao();
      if (sucesso) setAviso({ tom: 'ok', texto: sucesso });
    } catch (e) {
      setAviso({ tom: 'risk', texto: e instanceof Error ? e.message : 'Não deu certo. Tente de novo.' });
      setOrdemLocal(null);
    } finally {
      setOcupado('');
      recarregar();
    }
  }

  function reposicionar(de: number, para: number) {
    const ids = todas.map((f) => f.id);
    const nova = mover(ids, de, para);
    if (nova === ids) return;
    setOrdemLocal(nova);
    void executar('Salvando a ordem…', () => reordenar(conexao, sku, nova));
  }

  async function aoEscolherArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!arquivos.length) return;
    setAviso(null);
    const falhas: string[] = [];
    let enviadas = 0;
    for (const [i, arquivo] of arquivos.entries()) {
      setOcupado(arquivos.length > 1 ? `Enviando ${i + 1} de ${arquivos.length}…` : 'Enviando a foto…');
      try {
        const pronta = await prepararImagem(arquivo);
        await enviarFoto(conexao, sku, pronta);
        enviadas++;
      } catch (x) {
        falhas.push(`${arquivo.name}: ${x instanceof Error ? x.message : 'não foi enviada'}`);
      }
    }
    setOcupado('');
    recarregar();
    if (falhas.length) {
      setAviso({
        tom: enviadas ? 'warn' : 'risk',
        texto: enviadas
          ? `${enviadas} ${enviadas === 1 ? 'foto entrou' : 'fotos entraram'} no fim da galeria. ${falhas.length} não:`
          : 'Nenhuma foto foi enviada:',
        lista: falhas,
      });
    } else {
      setAviso({
        tom: 'ok',
        texto: enviadas === 1 ? 'Foto adicionada no fim da galeria.' : `${enviadas} fotos adicionadas no fim da galeria.`,
      });
    }
  }

  async function procurarNaLoja() {
    setAviso(null);
    setLoja({ fase: 'buscando' });
    try {
      const r = await buscarNaLoja(conexao, sku, true);
      setLoja({ fase: 'visto', r });
    } catch (e) {
      setLoja({ fase: 'parado' });
      setAviso({ tom: 'risk', texto: e instanceof Error ? e.message : 'A loja online não respondeu.' });
    }
  }

  async function importarDaLoja(r: ResultadoDaPeca) {
    setLoja({ fase: 'importando', r, feitas: 0 });
    const ignorar: string[] = [];
    const falhas: string[] = [];
    let feitas = 0;
    try {
      for (let volta = 0; volta < 20; volta++) {
        const x = await buscarNaLoja(conexao, sku, false, ignorar);
        const lote = x.importacao;
        if (!lote) break;
        if (!lote.ok) throw new Error(lote.erro || 'A importação parou.');
        feitas += lote.importadas;
        for (const f of lote.falhas) { ignorar.push(f.imagemId); falhas.push(`Foto ${f.imagemId}: ${f.motivo}`); }
        setLoja({ fase: 'importando', r, feitas });
        if (!lote.restantes) break;
      }
      setLoja({ fase: 'parado' });
      setAviso(falhas.length
        ? { tom: feitas ? 'warn' : 'risk', texto: `${feitas} ${feitas === 1 ? 'foto importada' : 'fotos importadas'} da loja online. ${falhas.length} não baixaram:`, lista: falhas }
        : { tom: 'ok', texto: `${feitas} ${feitas === 1 ? 'foto importada' : 'fotos importadas'} da loja online, na ordem da loja.` });
    } catch (e) {
      setLoja({ fase: 'parado' });
      setAviso({ tom: 'risk', texto: `${e instanceof Error ? e.message : 'A importação parou.'} Tentar de novo continua de onde parou.` });
    }
    recarregar();
  }

  /* "Buscar fotos na loja online" da aba Loja online abre esta aba já
     procurando — um toque, não dois. */
  const jaBuscou = useRef(false);
  useEffect(() => {
    if (buscarAoAbrir && !jaBuscou.current) { jaBuscou.current = true; void procurarNaLoja(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscarAoAbrir]);

  if (galeria.erro) return <ErrorState erro={galeria.erro} aoTentarDeNovo={galeria.recarregar} />;

  const total = todas.length;
  const daLoja = todas.filter((f) => f.origem === 'nuvemshop').length;

  return (
    <section className="mq-galeria" aria-label="Fotos da peça">
      <div className="mq-galeria__barra">
        <div>
          <h2 className="mq-title">Fotos</h2>
          <p className="mq-hint">
            {galeria.carregando && !galeria.dados ? 'Carregando…'
              : total === 0 ? 'Nenhuma foto nesta peça ainda.'
                : `${total} ${total === 1 ? 'foto' : 'fotos'}${daLoja ? ` · ${daLoja} da loja online` : ''}`
                  + (total > 1 ? ' · arraste para ordenar, ou use os botões' : '')}
          </p>
        </div>
        <div className="mq-btns">
          <button type="button" className="mq-btn mq-btn--primary" disabled={!!ocupado}
            onClick={() => entradaArquivos.current?.click()}>
            <Icone nome="upload" /> Adicionar fotos
          </button>
          <button type="button" className="mq-btn mq-btn--secondary" disabled={!!ocupado || loja.fase === 'buscando' || loja.fase === 'importando'}
            onClick={procurarNaLoja}>
            <Icone nome="cloud" /> Buscar fotos na loja online
          </button>
          <button type="button" className="mq-btn mq-btn--ghost" disabled={!!ocupado}
            onClick={() => entradaCamera.current?.click()}>
            <Icone nome="camera" /> Tirar foto
          </button>
        </div>
        <input ref={entradaArquivos} type="file" accept="image/*" multiple hidden onChange={aoEscolherArquivos}
          aria-label={`Escolher fotos para ${sku}`} />
        <input ref={entradaCamera} type="file" accept="image/*" capture="environment" hidden onChange={aoEscolherArquivos}
          aria-label={`Fotografar ${sku}`} />
      </div>

      <PainelDaLoja
        loja={loja}
        aoImportar={importarDaLoja}
        aoFechar={() => setLoja({ fase: 'parado' })}
      />

      {ocupado && <p className="mq-hint" role="status">{ocupado}</p>}
      {aviso && (
        <div className={`mq-note mq-note--${aviso.tom}`} role={aviso.tom === 'ok' ? 'status' : 'alert'}>
          <Icone nome={aviso.tom === 'ok' ? 'check' : 'alert'} />
          <span>
            {aviso.texto}
            {aviso.lista && <ul className="mq-galeria__falhas">{aviso.lista.map((l) => <li key={l}>{l}</li>)}</ul>}
          </span>
        </div>
      )}

      {total === 0 && !galeria.carregando ? (
        <div className="mq-galeria__vazia">
          <span className="mq-galeria__vazia-marca" aria-hidden="true">◇</span>
          <h3>Esta peça ainda não tem foto</h3>
          <p>Traga as fotos que a loja online já tem, ou adicione fotos do celular ou do computador — várias de uma vez.</p>
        </div>
      ) : destaque && (
        <div className="mq-galeria__corpo">
          <div className="mq-galeria__palco">
            <button type="button" className="mq-galeria__destaque" onClick={() => setAmpliada(posDestaque)}
              aria-label="Ampliar a foto">
              {destaque.urlGrande
                ? <img src={destaque.urlGrande} alt={`${desc}, foto ${posDestaque + 1}`} decoding="async" />
                : <span className="mq-galeria__sem-imagem">Imagem indisponível{destaque.erro ? `: ${destaque.erro}` : ''}</span>}
              <span className="mq-galeria__selos">
                {destaque.principal && <em className="mq-galeria__selo mq-galeria__selo--principal"><Icone nome="star" /> Principal</em>}
                {destaque.variacao && <em className="mq-galeria__selo">Variação {destaque.variacao}</em>}
              </span>
              <span className="mq-galeria__lupa" aria-hidden="true"><Icone nome="search" /> Ampliar</span>
            </button>
          </div>

          <div className="mq-galeria__lado">
            {variacoes.length > 0 && (
              <div className="mq-chipset" role="group" aria-label="Fotos por variação">
                <button type="button" aria-pressed={filtro === TODAS} onClick={() => setFiltro(TODAS)}>Todas ({total})</button>
                <button type="button" aria-pressed={filtro === GERAL} onClick={() => setFiltro(GERAL)}>
                  Peça inteira ({todas.filter((f) => !f.variacao).length})
                </button>
                {variacoes.map((v) => (
                  <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}>
                    {v} ({todas.filter((f) => f.variacao === v).length})
                  </button>
                ))}
              </div>
            )}

            <ol className="mq-galeria__tira" aria-label="Ordem das fotos">
              {visiveis.map((f) => {
                const pos = todas.findIndex((x) => x.id === f.id);
                return (
                  <li
                    key={f.id}
                    className={[
                      'mq-galeria__mini',
                      f.id === destaque.id ? 'is-on' : '',
                      arrastando === pos ? 'is-arrastando' : '',
                    ].join(' ')}
                    draggable={podeOrdenar}
                    onDragStart={(e) => { setArrastando(pos); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(pos)); }}
                    onDragOver={(e) => { if (podeOrdenar) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const de = Number(e.dataTransfer.getData('text/plain'));
                      setArrastando(null);
                      if (Number.isInteger(de)) reposicionar(de, pos);
                    }}
                    onDragEnd={() => setArrastando(null)}
                  >
                    <button type="button" onClick={() => setSelecionada(f.id)}
                      aria-label={`Foto ${pos + 1}${f.principal ? ', principal' : ''}${f.variacao ? `, variação ${f.variacao}` : ''}`}
                      aria-pressed={f.id === destaque.id}>
                      {f.urlMiniatura
                        ? <img src={f.urlMiniatura} alt="" loading="lazy" decoding="async" draggable={false} />
                        : <span aria-hidden="true">◇</span>}
                      <span className="mq-galeria__num">{pos + 1}</span>
                      {f.principal && <span className="mq-galeria__estrela" aria-hidden="true"><Icone nome="star" /></span>}
                      {f.origem === 'nuvemshop' && <span className="mq-galeria__origem" aria-hidden="true" title="Veio da loja online"><Icone nome="cloud" /></span>}
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="mq-galeria__acoes" aria-label="Ações da foto selecionada">
              <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" disabled={destaque.principal || !!ocupado}
                onClick={() => executar('Definindo a principal…', () => definirPrincipal(conexao, sku, destaque.id),
                  'Esta é a foto principal agora — é ela que aparece na lista, na busca e na venda.')}>
                <Icone nome="star" /> {destaque.principal ? 'É a principal' : 'Definir como principal'}
              </button>
              <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" disabled={!podeOrdenar || posDestaque <= 0}
                onClick={() => reposicionar(posDestaque, 0)}>Para o início</button>
              <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" disabled={!podeOrdenar || posDestaque <= 0}
                onClick={() => reposicionar(posDestaque, posDestaque - 1)} aria-label="Mover para trás">
                <span className="mq-galeria__seta-esq" aria-hidden="true"><Icone nome="chevron" /></span> Antes
              </button>
              <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" disabled={!podeOrdenar || posDestaque >= total - 1}
                onClick={() => reposicionar(posDestaque, posDestaque + 1)} aria-label="Mover para frente">
                Depois <Icone nome="chevron" />
              </button>
              <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm mq-galeria__remover" disabled={!!ocupado}
                onClick={() => setConfirmarRemocao(destaque.id)}>
                <Icone nome="close" /> Remover
              </button>
            </div>
            {filtro !== TODAS && <p className="mq-hint">Para mudar a ordem, volte para "Todas".</p>}

            {confirmarRemocao === destaque.id && (
              <div className="mq-note mq-note--warn" role="alert">
                <Icone nome="alert" />
                <span>
                  <b>Remover esta foto da peça?</b> O arquivo é apagado daqui.
                  {destaque.origem === 'nuvemshop'
                    ? ' Na loja online nada muda, e as próximas importações não a trazem de volta.'
                    : ''}
                  <span className="mq-btns mq-btns--tight">
                    <button type="button" className="mq-btn mq-btn--danger mq-btn--sm"
                      onClick={() => {
                        const id = destaque.id;
                        setConfirmarRemocao(null);
                        setSelecionada(null);
                        void executar('Removendo…', () => removerFoto(conexao, id), 'Foto removida.');
                      }}>
                      Remover
                    </button>
                    <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={() => setConfirmarRemocao(null)}>
                      Cancelar
                    </button>
                  </span>
                </span>
              </div>
            )}

            <details className="mq-galeria__detalhes">
              <summary>De onde veio esta foto</summary>
              <dl className="mq-dl">
                <div><dt>Origem</dt><dd>{ORIGEM[destaque.origem] ?? destaque.origem}</dd></div>
                <div><dt>{destaque.origem === 'nuvemshop' ? 'Importada em' : 'Enviada em'}</dt><dd>{fmtData(destaque.criadoEm)}</dd></div>
                {destaque.imagemIdLoja && <div><dt>ID da imagem na loja</dt><dd>{destaque.imagemIdLoja}</dd></div>}
                {destaque.produtoIdLoja && <div><dt>Anúncio na loja</dt><dd>{destaque.produtoIdLoja}{destaque.posicaoLoja ? ` · posição ${destaque.posicaoLoja}` : ''}</dd></div>}
                {destaque.variacao && <div><dt>Variação</dt><dd>{destaque.variacao}</dd></div>}
                {destaque.arquivo && <div><dt>Arquivo enviado</dt><dd>{destaque.arquivo}</dd></div>}
                <div><dt>Arquivo no armazenamento</dt><dd className="mq-sku">{destaque.arquivoR2 ?? '—'}</dd></div>
                <div>
                  <dt>Tamanho</dt>
                  <dd>
                    {tamanhoLegivel(destaque.tamanho)}
                    {destaque.largura && destaque.altura ? ` · ${destaque.largura}×${destaque.altura}` : ''}
                    {destaque.temMiniatura ? ' · com miniatura' : ''}
                  </dd>
                </div>
              </dl>
            </details>
          </div>
        </div>
      )}

      {(galeria.dados?.removidas ?? 0) > 0 && (
        <p className="mq-hint">
          {galeria.dados?.removidas} {galeria.dados?.removidas === 1 ? 'foto removida' : 'fotos removidas'} desta
          peça — o registro fica para a auditoria, e a importação da loja não as traz de volta.
        </p>
      )}

      {ampliada != null && (
        <Ampliada fotos={todas} indice={ampliada} titulo={desc} aoMudar={setAmpliada} aoFechar={() => setAmpliada(null)} />
      )}
    </section>
  );
}

/** O que a loja online tem desta peça, ANTES de importar. */
function PainelDaLoja({ loja, aoImportar, aoFechar }: {
  loja: Loja;
  aoImportar: (r: ResultadoDaPeca) => void;
  aoFechar: () => void;
}) {
  if (loja.fase === 'parado') return null;
  if (loja.fase === 'buscando') {
    return <p className="mq-hint mq-galeria__loja" role="status"><Icone nome="cloud" /> Procurando esta peça na loja online…</p>;
  }
  const r = loja.r;
  if (!r.encontrado) {
    return (
      <div className="mq-note mq-note--info mq-galeria__loja" role="status">
        <Icone nome="cloud" />
        <span>
          {r.detalhe}
          <button type="button" className="mq-btn mq-btn--link mq-btn--sm" onClick={aoFechar}>Fechar</button>
        </span>
      </div>
    );
  }
  const resumo = r.resumo ?? { novas: 0, jaImportadas: 0, removidas: 0, paraRevisar: 0 };
  const novas = r.fotos.filter((f) => f.situacao === 'nova');
  const importando = loja.fase === 'importando';
  return (
    <div className="mq-galeria__loja mq-card mq-card--tint">
      <div className="mq-galeria__loja-topo">
        <span>
          <Icone nome="cloud" />
          <b>Na loja online:</b>{' '}
          {r.anuncios.map((a) => `“${a.nome}” (${a.fotos} ${a.fotos === 1 ? 'foto' : 'fotos'})`).join(', ')}
        </span>
        {!importando && <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}><Icone nome="close" /></button>}
      </div>

      {novas.length > 0 && (
        <ol className="mq-galeria__previa" aria-label="Fotos que viriam da loja">
          {novas.map((f) => (
            <li key={f.imagemId}>
              <img src={miniaturaDaFoto(f.url) ?? f.url} alt="" loading="lazy" />
              {f.variacao && <small>{f.variacao}</small>}
            </li>
          ))}
        </ol>
      )}

      <p className="mq-hint">
        {resumo.novas > 0
          ? `${resumo.novas} ${resumo.novas === 1 ? 'foto nova' : 'fotos novas'} para trazer, na ordem da loja.`
          : r.anuncios.every((a) => a.fotos === 0)
            ? 'O anúncio da loja online não tem foto nenhuma — adicione as fotos por aqui.'
            : r.fotos.length === 0 && r.revisar.length === 0
              ? 'As fotos deste anúncio não estão presas a esta peça na loja online.'
              : 'Nenhuma foto nova: tudo o que a loja tem desta peça já está aqui.'}
        {resumo.jaImportadas > 0 ? ` ${resumo.jaImportadas} já ${resumo.jaImportadas === 1 ? 'está' : 'estão'} na galeria.` : ''}
        {resumo.removidas > 0 ? ` ${resumo.removidas} que você removeu não ${resumo.removidas === 1 ? 'volta' : 'voltam'}.` : ''}
      </p>

      {r.revisar.map((g) => (
        <p key={g.produtoId} className="mq-note mq-note--warn">
          <Icone nome="alert" />
          <span>
            <b>Precisa revisar:</b> {g.imagens} {g.imagens === 1 ? 'foto' : 'fotos'} do anúncio
            {g.produtoNome ? ` “${g.produtoNome}”` : ` ${g.produtoId}`} não {g.imagens === 1 ? 'foi trazida' : 'foram trazidas'}.
            {' '}{g.motivo}
          </span>
        </p>
      ))}
      {r.avisos.map((a) => <p key={a} className="mq-hint">{a}</p>)}

      {resumo.novas > 0 && (
        <div className="mq-btns">
          <button type="button" className="mq-btn mq-btn--primary" disabled={importando} onClick={() => aoImportar(r)}>
            {importando
              ? `Importando… ${loja.feitas} de ${resumo.novas}`
              : `Importar ${resumo.novas} ${resumo.novas === 1 ? 'foto' : 'fotos'}`}
          </button>
          {!importando && <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>Agora não</button>}
        </div>
      )}
    </div>
  );
}
