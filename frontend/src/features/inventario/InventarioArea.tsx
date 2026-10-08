import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { fmtData, plural } from '../../domain/formato';
import { saudeDoEstoque, type NivelDeSaude, type ResumoDoInventario as ResumoDoEstado } from './saude';
import { DialogoDeDescarte } from './DialogoDeDescarte';
import { DialogoDeExclusao } from './DialogoDeExclusao';
import { RevisaoDoInventario } from './RevisaoDoInventario';
import { BalancoDoInventario } from './BalancoDoInventario';
import { ConferenciaDaPeca, type ExtraDaLeitura, type RespostaDaCriacao } from './ConferenciaDaPeca';
import { AvisoDaContagem } from './AvisoDaContagem';
import { ListaDoInventario } from './ListaDoInventario';
import { useContagem } from './useContagem';
import {
  buscarNoInventario, novaLeituraId, pareceRebote, pecasDoInventario, pedeConfirmacaoDoBipe, resumoDoInventario,
  type Gesto, type UltimaLeitura,
} from './contagem';
import type { AppState } from '../../types/api';
import { LeitorDeEtiquetas, type ResultadoDaLeitura } from '../../components/scanner/LeitorDeEtiquetas';
import { resolverSku } from '../../components/scanner/codigoDaEtiqueta';
import { criarBipe, temCamera } from '../../components/scanner/leitorDeEtiqueta';

interface InventarioResumo {
  id: number;
  /** O número que a Sthefany vê ("Inventário #1"). O id é técnico. */
  numero?: number | null;
  status: 'aberto' | 'pausado' | 'concluido' | 'cancelado' | string;
  iniciadoEm: string;
  pausadoEm: string | null;
  concluidoEm: string | null;
  divergentes: number;
  pecas: number;
  /** §53 — o servidor diz se aceitaria excluir. Ausente = não oferece. */
  excluivel?: boolean;
  alterouEstoque?: boolean;
}

const ROTULO_DO_STATUS: Record<string, string> = {
  aberto: 'Em andamento',
  pausado: 'Pausado',
  concluido: 'Finalizado',
  cancelado: 'Descartado',
};
export const rotuloDoStatus = (status: string) => ROTULO_DO_STATUS[status] ?? 'Em andamento';

/** O número visível de um inventário. Nunca o id técnico na tela: sem
 *  número (servidor antigo), o texto fica sem número. */
const nomeDo = (i: { numero?: number | null }) => (i.numero ? `Inventário #${i.numero}` : 'Inventário');

interface Props {
  conexao: Connection;
  estado: AppState | null;
  aoMudarEstoque: () => void;
  /** Embutido como seção de outra tela, com cabeçalho de seção. */
  embutida?: boolean;
}

const ICONE_DA_SAUDE: Record<NivelDeSaude, { icone: 'check' | 'alert' | 'inventory'; classe: string }> = {
  ok: { icone: 'check', classe: 'success' },
  atencao: { icone: 'alert', classe: 'warn' },
  vencida: { icone: 'alert', classe: 'risk' },
  carregando: { icone: 'inventory', classe: '' },
};

/** INVENTÁRIO — conferir o que existe de verdade em casa.
 *
 *  Refeito em 06/10/2026 a partir da planilha da Sthefany e do primeiro
 *  inventário real, que ela largou no meio. A tela agora fala a língua da
 *  planilha — estoque total, com revendedoras, em casa, conferido, faltando
 *  — e um bipe é uma unidade. Ver `contagem.ts` para as regras. */
export function InventarioArea({ conexao, estado, aoMudarEstoque, embutida = false }: Props) {
  const lista = useApi(
    (s) => chamar<InventarioResumo[]>(conexao, 'GET', '/api/inventarios', undefined, { signal: s }),
    [conexao],
  );
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const [erroAcao, setErroAcao] = useState('');
  const [excluindo, setExcluindo] = useState<InventarioResumo | null>(null);
  const [ocupadoExclusao, setOcupadoExclusao] = useState(false);
  const [erroExclusao, setErroExclusao] = useState('');
  const [avisoExclusao, setAvisoExclusao] = useState('');

  const inventarios = Array.isArray(lista.dados) ? lista.dados : [];
  /* O que ela fechou (descartado, "Fechar a tela") não volta sozinho. */
  const [fechado, setFechado] = useState<number | null>(null);
  const emAndamento = inventarios.find((i) => (i.status === 'aberto' || i.status === 'pausado') && i.id !== fechado);
  const idAtual = abertoId ?? emAndamento?.id ?? null;
  /* O inventário em andamento fica preso à tela: ao finalizar ele deixa de
     estar "em andamento", e sem isto a tela pularia para o início e o
     resumo do que foi ajustado sumiria. */
  useEffect(() => {
    if (abertoId === null && emAndamento) setAbertoId(emAndamento.id);
  }, [abertoId, emAndamento]);
  const ultimoConcluido = inventarios.find((i) => i.status === 'concluido');
  const saude = saudeDoEstoque(estado?.inventario as ResumoDoEstado | undefined);

  async function excluir() {
    if (!excluindo) return;
    setOcupadoExclusao(true);
    setErroExclusao('');
    const r = await chamar<{ ok?: boolean; erro?: string; variacoesMantidas?: { sku: string; variacao: string }[] }>(
      conexao, 'DELETE', `/api/inventarios/${excluindo.id}`, {},
    ).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui excluir.' }));
    setOcupadoExclusao(false);
    if (r && 'erro' in r && r.erro) { setErroExclusao(String(r.erro)); return; }
    const mantidas = (r && 'variacoesMantidas' in r && r.variacoesMantidas) || [];
    setAvisoExclusao(`${nomeDo(excluindo)} excluído. Nenhum estoque foi alterado.`
      + (mantidas.length
        ? ` ${plural(mantidas.length, 'A variação criada', 'As variações criadas')} durante a conferência `
          + `${mantidas.length === 1 ? 'continua' : 'continuam'} no cadastro das peças.`
        : ''));
    if (abertoId === excluindo.id) setAbertoId(null);
    setExcluindo(null);
    lista.recarregar();
  }

  async function abrir() {
    setErroAcao('');
    const r = await chamar<{ id?: number; erro?: string }>(conexao, 'POST', '/api/inventarios', {})
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui abrir.' }));
    if (r && 'erro' in r && r.erro) { setErroAcao(String(r.erro)); return; }
    lista.recarregar();
    if (r && 'id' in r && r.id) { setFechado(null); setAbertoId(r.id); }
  }

  const acaoAbrir = emAndamento ? null : (
    <button type="button" className="mq-btn mq-btn--primary" onClick={abrir}>
      <Icone nome="plus" />
      Abrir inventário
    </button>
  );

  const cabecalho = embutida ? (
    <div className="mq-card__head inventory-heading">
      <div>
        <p className="mq-eyebrow">Conferência física</p>
        <h2 className="mq-title" id="inventario-titulo">Inventário</h2>
      </div>
      {acaoAbrir && <div className="mq-btns">{acaoAbrir}</div>}
    </div>
  ) : (
    <div className="mq-pagehead">
      <div className="mq-pagehead__text">
        <p className="mq-eyebrow">Conferência física</p>
        <h1 className="mq-display" id="inventario-titulo">Inventário</h1>
        <p className="mq-lede">Conferir o que está em casa, peça por peça.</p>
      </div>
      {acaoAbrir && <div className="mq-pagehead__actions">{acaoAbrir}</div>}
    </div>
  );
  const TituloHistorico = embutida ? 'h3' : 'h2';
  const resumoAtual = inventarios.find((i) => i.id === idAtual);

  const miolo = (
    <>
      {idAtual === null && (
        <div className="inventory-contexts">
          <article className={`inventory-context inventory-context--${saude.nivel}`} data-saude={saude.nivel}>
            <span className={`context-icon ${ICONE_DA_SAUDE[saude.nivel].classe}`}>
              <Icone nome={ICONE_DA_SAUDE[saude.nivel].icone} />
            </span>
            <span>
              <small>Saúde do estoque</small>
              <strong>{saude.titulo}</strong>
              <em>{saude.detalhe}</em>
            </span>
          </article>
          <article className="inventory-context">
            <span className="context-icon"><Icone nome="inventory" /></span>
            <span>
              <small>Último inventário</small>
              <strong>{ultimoConcluido ? fmtData(ultimoConcluido.concluidoEm ?? '') : 'Nenhum ainda'}</strong>
              <em className={ultimoConcluido ? 'positive' : ''}>
                {ultimoConcluido
                  ? (ultimoConcluido.divergentes
                    ? `${ultimoConcluido.divergentes} ${plural(ultimoConcluido.divergentes, 'diferença', 'diferenças')}`
                    : 'Finalizado sem diferença')
                  : 'Nenhuma conferência finalizada'}
              </em>
            </span>
          </article>
          <article className={emAndamento ? 'inventory-context active' : 'inventory-context'}>
            <span className="context-icon"><Icone nome="box" /></span>
            <span>
              <small>Em aberto</small>
              <strong>{emAndamento ? `${nomeDo(emAndamento)} · ${rotuloDoStatus(emAndamento.status)}` : 'Nenhum aberto'}</strong>
              <em>{emAndamento ? `aberto em ${fmtData(emAndamento.iniciadoEm)}` : 'Pronto para começar'}</em>
            </span>
          </article>
        </div>
      )}

      {erroAcao && <p className="mq-note mq-note--risk" role="alert"><span>{erroAcao}</span></p>}
      {avisoExclusao && <p className="mq-note mq-note--ok" role="status"><span>{avisoExclusao}</span></p>}
      {excluindo && (
        <DialogoDeExclusao
          nome={nomeDo(excluindo)}
          ocupado={ocupadoExclusao}
          erro={erroExclusao}
          aoConfirmar={excluir}
          aoVoltar={() => setExcluindo(null)}
        />
      )}
      {lista.erro ? <section className="mq-card"><ErrorState erro={lista.erro} aoTentarDeNovo={lista.recarregar} /></section> : null}

      {idAtual !== null && (
        <Contagem
          key={idAtual}
          conexao={conexao}
          id={idAtual}
          numero={resumoAtual?.numero ?? null}
          aoMudar={() => { lista.recarregar(); aoMudarEstoque(); }}
          aoSair={() => { setFechado(idAtual); setAbertoId(null); }}
        />
      )}

      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div>
            <p className="mq-eyebrow">Registro preservado</p>
            <TituloHistorico className="mq-title">Histórico de inventários</TituloHistorico>
          </div>
        </div>
        {inventarios.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="inventory" /></span>
            <h3>Nenhum inventário ainda</h3>
            <p>Abra um quando for conferir a loja. Dá para pausar e continuar outro dia.</p>
          </div>
        ) : (
          <div className="mq-list">
            {inventarios.map((i) => (
              <div className="mq-item inventario-hist" key={i.id}>
                <button type="button" className="inventario-hist__abrir" onClick={() => { setFechado(null); setAbertoId(i.id); }}>
                  <span className={`mq-item__icon ${i.divergentes ? 'mq-item__icon--warn' : 'mq-item__icon--ok'}`}>
                    <Icone nome="inventory" />
                  </span>
                  <span className="mq-item__main">
                    <b>{nomeDo(i)}</b>
                    <small>
                      aberto em {fmtData(i.iniciadoEm)}
                      {i.concluidoEm
                        ? ` · ${i.status === 'cancelado' ? 'descartado' : 'finalizado'} em ${fmtData(i.concluidoEm)}`
                        : ''}
                      {i.divergentes ? ` · ${i.divergentes} ${plural(i.divergentes, 'diferença', 'diferenças')}` : ''}
                      {i.alterouEstoque ? ' · ajustes aplicados no estoque' : ''}
                    </small>
                  </span>
                </button>
                <span className="mq-item__side">
                  <span className={`mq-status ${i.status === 'concluido' ? 'mq-status--ok' : i.status === 'pausado' ? 'mq-status--warn' : ''}`}>
                    {rotuloDoStatus(i.status)}
                  </span>
                  {(i.status === 'aberto' || i.status === 'pausado') && idAtual !== i.id && (
                    <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" onClick={() => { setFechado(null); setAbertoId(i.id); }}>
                      Continuar
                    </button>
                  )}
                  {i.excluivel && (
                    <button
                      type="button"
                      className="mq-btn mq-btn--ghost mq-btn--sm"
                      aria-label={`Excluir o ${nomeDo(i).toLowerCase()}`}
                      onClick={() => { setErroExclusao(''); setAvisoExclusao(''); setExcluindo(i); }}
                    >
                      Excluir
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );

  return embutida ? (
    <section className="mq-stack inventory-section" id="inventario" aria-labelledby="inventario-titulo">
      {cabecalho}
      {miolo}
    </section>
  ) : (
    <>
      {cabecalho}
      {miolo}
    </>
  );
}

/* ───────────────────────────────────────────────────────── a conferência */

/* A última peça bipada fica guardada no aparelho: recarregar a página no
   meio da conferência não pode transformar o próximo bipe da mesma peça em
   "primeiro bipe" (§59). */
const CHAVE_DA_ULTIMA = (id: number) => `marquesa:inventario:${id}:ultima-leitura`;
function lerUltima(id: number): UltimaLeitura | null {
  try {
    const u = JSON.parse(localStorage.getItem(CHAVE_DA_ULTIMA(id)) ?? 'null');
    return u && typeof u.sku === 'string' && typeof u.em === 'number' ? u : null;
  } catch { return null; }
}
function gravarUltima(id: number, u: UltimaLeitura) {
  try { localStorage.setItem(CHAVE_DA_ULTIMA(id), JSON.stringify(u)); } catch { /* fica só na memória */ }
}

/** O leitor USB é um teclado: com um aviso aberto por cima, a tecla NÃO vai
 *  para o campo de leitura — senão o Enter do próximo bipe confirmaria o
 *  aviso. O aviso de bipe repetido é a exceção (`data-leitor-livre`): o
 *  próximo bipe é justamente a resposta. */
const AVISO_QUE_PRENDE = '[role="dialog"], [role="alertdialog"]:not([data-leitor-livre])';

function Contagem({
  conexao, id, numero, aoMudar, aoSair,
}: {
  conexao: Connection;
  id: number;
  numero: number | null;
  aoMudar: () => void;
  aoSair: () => void;
}) {
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'neutro' | 'erro' | 'atencao' } | null>(null);
  const c = useContagem(conexao, id, (texto) => { setAviso({ texto, tom: 'erro' }); tocar(false); });
  const [aberta, setAberta] = useState<string | null>(null);
  /* O mesmo código bipado de novo, sem outro no meio, esperando ela dizer
     se é outra unidade ou engano. Nada foi contado ainda. */
  const [repeticao, setRepeticao] = useState<{ sku: string; rebote: boolean } | null>(null);
  const ultima = useRef<UltimaLeitura | null>(lerUltima(id));
  const lembrar = (u: UltimaLeitura) => { ultima.current = u; gravarUltima(id, u); };
  const [tela, setTela] = useState<'contagem' | 'balanco'>('contagem');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [resultados, setResultados] = useState<{ termo: string; skus: string[] } | null>(null);
  const [camera, setCamera] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [descartando, setDescartando] = useState(false);
  const [finalizado, setFinalizado] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const bipeRef = useRef<((ok: boolean) => void) | null>(null);
  function tocar(ok: boolean) {
    try { bipeRef.current = bipeRef.current ?? criarBipe(); bipeRef.current(ok); } catch { /* sem som */ }
  }

  const d = c.detalhe.dados;
  const numeroVisivel = d?.numero ?? numero;
  const titulo = numeroVisivel ? `Inventário #${numeroVisivel}` : 'Inventário';
  const status = d?.status ?? 'aberto';
  const pausado = status === 'pausado';
  const pecas = useMemo(() => pecasDoInventario(c.esperados, c.contagem), [c.esperados, c.contagem]);
  const resumo = useMemo(() => resumoDoInventario(c.esperados, c.contagem), [c.esperados, c.contagem]);
  const pct = resumo.codigos ? Math.round((resumo.conferidos / resumo.codigos) * 100) : 0;
  const tocaTela = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const focar = () => { if (!tocaTela && !pausado) campo.current?.focus(); };

  /* O leitor USB é um teclado: tecla digitada com o foco solto (depois de
     tocar num botão) volta para o campo de leitura, senão o bipe se perde. */
  useEffect(() => {
    if (pausado || tela !== 'contagem') return undefined;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const alvo = document.activeElement;
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement) return;
      if (document.querySelector(AVISO_QUE_PRENDE)) return;
      const el = campo.current;
      if (!el) return;
      e.preventDefault();
      el.focus();
      el.value += e.key;
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [pausado, tela]);

  function contar(sku: string, gesto: Gesto, extra: ExtraDaLeitura = {}) {
    if (pausado) return;
    c.registrar({ leituraId: novaLeituraId(), sku, gesto, ...extra });
  }

  function abrirPeca(sku: string) {
    setAberta(sku);
    setRepeticao(null);
    setResultados(null);
    setTela('contagem');
  }

  function lerCodigo(texto: string): ResultadoDaLeitura {
    const t = texto.trim();
    if (!t) return { ok: false, texto: '' };
    const sku = resolverSku(t, c.porSkuRef.current);
    if (!sku) {
      /* Não é etiqueta conhecida: é busca por nome, código ou variação. */
      const achados = buscarNoInventario(c.esperados, t);
      if (achados.length === 1) {
        abrirPeca(achados[0]!.sku);
        setAviso({ texto: `${achados[0]!.desc} — toque em + para contar.`, tom: 'neutro' });
        return { ok: true, texto: achados[0]!.desc };
      }
      setResultados({ termo: t, skus: achados.map((p) => p.sku) });
      setAviso(achados.length
        ? { texto: `${achados.length} ${plural(achados.length, 'peça encontrada', 'peças encontradas')} para "${t}". Toque na certa.`, tom: 'neutro' }
        : { texto: `Nada encontrado para "${t}".`, tom: 'erro' });
      if (!achados.length) tocar(false);
      return { ok: false, texto: achados.length ? 'Escolha na lista' : 'Não encontrado' };
    }
    const agora = Date.now();
    const ref = c.porSkuRef.current.get(sku)!;
    setAberta(sku);
    setResultados(null);
    const antes = conferidoDe(sku);
    /* A MESMA peça de novo, sem outra no meio, já conferida: não soma —
       pergunta. Sem prazo: 2 s ou 20 s depois, é a mesma pergunta (§59). */
    if (pedeConfirmacaoDoBipe(ultima.current, sku, antes)) {
      setRepeticao({ sku, rebote: pareceRebote(ultima.current, agora) });
      lembrar({ sku, em: agora });
      setAviso({ texto: `Essa peça já foi conferida · ${ref.desc} · nada foi somado`, tom: 'atencao' });
      tocar(false);
      return { ok: true, texto: 'Essa peça já foi conferida' };
    }
    /* Outra peça com a pergunta aberta: a repetida NÃO conta. */
    const largou = repeticao !== null;
    setRepeticao(null);
    lembrar({ sku, em: agora });
    contar(sku, 'bipe');
    tocar(true);
    setAviso({
      texto: `${largou ? 'A leitura repetida não foi contada · ' : ''}✓ 1 unidade conferida · ${ref.desc} · ${antes + 1} de ${Math.max(0, ref.esperado)} em casa`,
      tom: 'ok',
    });
    return { ok: true, texto: `1 unidade · ${ref.desc}` };
  }

  function conferidoDe(sku: string) {
    return (c.contagemRef.current.get(sku) ?? []).reduce((s, l) => s + l.contado, 0);
  }

  function contarOutraUnidade() {
    if (!repeticao) return;
    const { sku } = repeticao;
    const ref = c.porSkuRef.current.get(sku);
    const antes = conferidoDe(sku);
    contar(sku, 'bipe');
    lembrar({ sku, em: Date.now() });
    setRepeticao(null);
    tocar(true);
    setAviso({
      texto: `✓ Mais 1 unidade conferida · ${ref?.desc ?? ''} · ${antes + 1} de ${Math.max(0, ref?.esperado ?? 0)} em casa`,
      tom: 'ok',
    });
    focar();
  }

  function foiEngano() {
    setRepeticao(null);
    setAviso({ texto: 'Leitura repetida não contada.', tom: 'neutro' });
    focar();
  }

  async function acao(caminho: string) {
    setOcupado(true);
    setErro('');
    await c.esperarFila();
    const r = await chamar<{ erro?: string }>(conexao, 'POST', caminho, {})
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui.' }));
    setOcupado(false);
    if (r && 'erro' in r && r.erro) { setErro(String(r.erro)); return false; }
    c.detalhe.recarregar();
    aoMudar();
    return true;
  }

  async function criarVariacao(sku: string, valor: string, quantidade: number): Promise<RespostaDaCriacao> {
    await c.esperarFila();
    try {
      const r = await chamar<{ criadas?: { nome: string }[] }>(conexao, 'POST', `/api/inventarios/${id}/variacoes`,
        { sku, valor, quantidade, leituraId: novaLeituraId() });
      const nome = r.criadas?.[0]?.nome ?? valor;
      c.detalhe.recarregar();
      setAviso({ texto: `Variação ${nome} criada no cadastro${quantidade ? ` · ${quantidade} conferida${quantidade > 1 ? 's' : ''}` : ''}.`, tom: 'ok' });
      return { ok: true, nome };
    } catch (e) {
      const corpo = (e as { corpo?: { jaExiste?: boolean; existente?: string } }).corpo;
      if (corpo?.jaExiste && corpo.existente) return { jaExiste: true, existente: corpo.existente };
      return { erro: e instanceof Error ? e.message : 'Não consegui criar a variação.' };
    }
  }

  async function identificarNaMaleta(sku: string, maletaId: number, distribuicao: { variacao: string; qtd: number }[]) {
    try {
      await chamar(conexao, 'POST', '/api/pendencias/variacao/maleta', { maletaId, sku, distribuicao });
      c.detalhe.recarregar();
      setAviso({ texto: 'Variação da peça com a revendedora registrada.', tom: 'ok' });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Não consegui registrar.';
    }
  }

  if (status === 'cancelado') {
    return (
      <section className="mq-card">
        <div className="mq-card__head">
          <div>
            <h2 className="mq-title">{titulo}</h2>
            <p className="mq-lede">
              <span className="mq-status">Descartado</span>
              {d?.iniciadoEm ? ` · aberto em ${fmtData(d.iniciadoEm)}` : ''} · as contagens não mudaram o estoque.
            </p>
          </div>
          <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={aoSair}>Fechar</button>
        </div>
      </section>
    );
  }

  if (status === 'concluido') {
    return (
      <section className="mq-card">
        <div className="mq-card__head">
          <div>
            <p className="mq-eyebrow">Finalizado</p>
            <h2 className="mq-title">{titulo}</h2>
          </div>
          <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={aoSair}>Fechar</button>
        </div>
        {finalizado && <div className="mq-card__body"><p className="mq-note mq-note--ok" role="status"><Icone nome="check" /><span>{finalizado}</span></p></div>}
        <RevisaoDoInventario conexao={conexao} id={id} aoAplicar={aoMudar} />
      </section>
    );
  }

  const pecaAberta = aberta ? c.porSku.get(aberta) : undefined;

  return (
    <section className="mq-card mq-card--flush inventario-ativo" aria-label={titulo}>
      <header className="mq-card__head inv-topo">
        <div>
          <h2 className="mq-title">{titulo}</h2>
          <p className="mq-lede">
            <span className={pausado ? 'mq-status mq-status--warn' : 'mq-status mq-status--open'}>
              {pausado ? 'Pausado' : 'Em andamento'}
            </span>
            {d?.iniciadoEm ? ` · aberto em ${fmtData(d.iniciadoEm)}` : ''}
          </p>
        </div>
        <div className="inv-topo__acoes">
          {!pausado ? (
            <button type="button" className="mq-btn mq-btn--secondary" disabled={ocupado}
              onClick={() => acao(`/api/inventarios/${id}/pausar`)}>
              Pausar
            </button>
          ) : (
            <button type="button" className="mq-btn mq-btn--primary" disabled={ocupado}
              onClick={() => acao(`/api/inventarios/${id}/retomar`)}>
              Continuar conferindo
            </button>
          )}
          {tela === 'contagem' && (
            <button type="button" className={pausado ? 'mq-btn mq-btn--secondary' : 'mq-btn mq-btn--primary'}
              disabled={ocupado || !d} onClick={() => setTela('balanco')}>
              Revisar e finalizar
            </button>
          )}
          <details className="inv-topo__mais">
            <summary className="mq-btn mq-btn--ghost">Mais</summary>
            <div className="inv-topo__menu">
              <button type="button" className="mq-btn mq-btn--ghost" onClick={aoSair}>Fechar a tela</button>
              <button type="button" className="mq-btn mq-btn--danger" disabled={ocupado} onClick={() => setDescartando(true)}>
                Descartar inventário
              </button>
            </div>
          </details>
        </div>
      </header>

      {pausado && (
        <p className="mq-note mq-note--warn inv-faixa">
          <Icone nome="alert" />
          <span><b>Pausado.</b> Tudo o que você conferiu está guardado. Toque em "Continuar conferindo" para voltar.</span>
        </p>
      )}
      {erro && <p className="mq-note mq-note--risk inv-faixa" role="alert"><span>{erro}</span></p>}
      {c.detalhe.erro && !d ? <ErrorState erro={c.detalhe.erro} aoTentarDeNovo={c.detalhe.recarregar} /> : null}

      {tela === 'balanco' ? (
        <BalancoDoInventario
          conexao={conexao}
          id={id}
          esperarLeituras={c.esperarFila}
          leiturasNaoSalvas={c.naoSalvas}
          aoContinuar={() => setTela('contagem')}
          aoAbrirPeca={abrirPeca}
          aoFinalizado={(texto) => { setFinalizado(texto); c.detalhe.recarregar(); aoMudar(); }}
        />
      ) : (
        <div className="mq-card__body mq-stack inv-corpo">
          {/* ── o andamento ─────────────────────────────────────────── */}
          <section className="inv-andamento" aria-label="Andamento">
            <div className="inv-andamento__barra">
              <span className="mq-meter"><i style={{ width: `${pct}%` }} /></span>
              <b>{resumo.conferidos} de {resumo.codigos} {plural(resumo.codigos, 'peça conferida', 'peças conferidas')}</b>
            </div>
            <dl className="inv-andamento__numeros">
              <div className="is-ok"><dt>Tudo certo</dt><dd>{resumo.certos}</dd></div>
              <div className={resumo.comFalta + resumo.comSobra ? 'is-dif' : ''}><dt>Com diferença</dt><dd>{resumo.comFalta + resumo.comSobra}</dd></div>
              <div><dt>Não conferidas</dt><dd>{resumo.naoConferidos}</dd></div>
            </dl>
          </section>

          {/* ── o leitor e a busca ──────────────────────────────────── */}
          <div className="inv-leitor">
            <label className="inv-leitor__campo">
              <Icone nome="search" />
              <input
                ref={campo}
                className="mq-input"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                spellCheck={false}
                aria-label="Bipe a peça ou procure por código, nome ou variação"
                placeholder={pausado ? 'Inventário pausado' : d ? 'Bipe a peça ou procure (código, nome, variação)' : 'Carregando…'}
                disabled={pausado || !d}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || (e.key === 'Tab' && e.currentTarget.value.trim())) {
                    e.preventDefault();
                    const v = e.currentTarget.value;
                    e.currentTarget.value = '';
                    lerCodigo(v);
                  }
                }}
              />
            </label>
            {temCamera() && !pausado && (
              <button type="button" className={camera ? 'mq-btn mq-btn--secondary is-ativo' : 'mq-btn mq-btn--secondary'}
                aria-pressed={camera} onClick={() => setCamera((v) => !v)}>
                <Icone nome="camera" />
                <span className="inv-leitor__rotulo">{camera ? 'Fechar câmera' : 'Câmera'}</span>
              </button>
            )}
          </div>
          <p className={`inv-aviso is-${aviso?.tom ?? 'neutro'}`} role="status" aria-live="polite">
            {aviso?.texto ?? 'Bipe uma peça: cada bipe conta uma unidade. Sem leitor, digite o código ou o nome e aperte Enter.'}
          </p>
          {c.naoSalvas > 0 && (
            <p className={`mq-note ${c.comErro ? 'mq-note--risk' : 'mq-note--info'} inv-faixa`}>
              <Icone nome={c.comErro ? 'alert' : 'cloud'} />
              <span>
                {c.comErro && c.cotaEsgotada
                  ? <>{c.comErro} {plural(c.comErro, 'leitura ainda não foi salva', 'leituras ainda não foram salvas')}: o banco atingiu o limite diário de leitura e volta às 21h. O que já foi salvo continua salvo, e {plural(c.comErro, 'esta está guardada', 'estas estão guardadas')} neste aparelho — nada se perde nem conta duas vezes.{' '}
                    <button type="button" className="mq-btn mq-btn--link" onClick={c.tentarDeNovo}>Tentar de novo</button></>
                  : c.comErro
                  ? <>{c.comErro} {plural(c.comErro, 'leitura ainda não foi salva', 'leituras ainda não foram salvas')} (sem internet?). Elas estão guardadas neste aparelho.{' '}
                    <button type="button" className="mq-btn mq-btn--link" onClick={c.tentarDeNovo}>Tentar de novo</button></>
                  : <>Salvando {c.naoSalvas} {plural(c.naoSalvas, 'leitura', 'leituras')}…</>}
              </span>
            </p>
          )}

          {camera && !pausado && (
            <LeitorDeEtiquetas
              aoLer={async (codigo) => lerCodigo(codigo)}
              pausado={repeticao !== null}
              aoFechar={() => { setCamera(false); focar(); }}
              titulo="Aponte para a etiqueta"
              dica="Cada leitura conta uma unidade. A mesma peça lida de novo pede confirmação antes de contar."
            />
          )}

          {resultados && (
            <section className="inv-resultados" aria-label="Resultado da busca">
              <ul>
                {resultados.skus.map((sku) => {
                  const p = c.porSku.get(sku)!;
                  return (
                    <li key={sku}>
                      <button type="button" onClick={() => abrirPeca(sku)}>
                        <b>{p.desc}</b>
                        <small>Código {sku} · em casa {Math.max(0, p.esperado)}{p.variacoes?.length ? ` · ${p.variacoes.map((v) => v.nome).join(', ')}` : ''}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={() => setResultados(null)}>Fechar a busca</button>
            </section>
          )}

          {pecaAberta && (
            <ConferenciaDaPeca
              key={pecaAberta.sku}
              peca={pecaAberta}
              linhas={c.contagem.get(pecaAberta.sku)}
              pausado={pausado}
              aoContar={(gesto, extra) => contar(pecaAberta.sku, gesto, extra)}
              aoCriarVariacao={(valor, qtd) => criarVariacao(pecaAberta.sku, valor, qtd)}
              aoIdentificarNaMaleta={(maletaId, dist) => identificarNaMaleta(pecaAberta.sku, maletaId, dist)}
              aoFechar={() => { setAberta(null); setRepeticao(null); focar(); }}
            />
          )}

          {repeticao && c.porSku.get(repeticao.sku) && (
            <AvisoDaContagem
              titulo="Essa peça já foi conferida."
              leitorLivre
              aoDesistir={foiEngano}
              opcoes={[
                { rotulo: 'Contar outra unidade', tom: 'primario', aoEscolher: contarOutraUnidade },
                { rotulo: 'Foi engano', tom: 'neutro', aoEscolher: foiEngano },
              ]}
            >
              <p className="conf-aviso__peca">
                <b>{c.porSku.get(repeticao.sku)!.desc}</b>
                <small>Código {repeticao.sku}</small>
              </p>
              <p className="conf-aviso__qtd">
                Quantidade já conferida: <b>{conferidoDe(repeticao.sku)}</b>
              </p>
              <p>
                {repeticao.rebote ? 'O leitor pode ter lido a mesma etiqueta duas vezes. ' : ''}
                Você quer contar outra unidade desta mesma peça?
              </p>
            </AvisoDaContagem>
          )}

          {/* ── por categoria ───────────────────────────────────────── */}
          {resumo.categorias.length > 1 && (
            <section className="inv-categorias" aria-label="Andamento por categoria">
              <button type="button" className={categoria === null ? 'inv-cat is-on' : 'inv-cat'}
                aria-pressed={categoria === null} onClick={() => setCategoria(null)}>
                <b>Todas</b><small>{resumo.conferidos}/{resumo.codigos}</small>
              </button>
              {resumo.categorias.map((k) => (
                <button key={k.cat} type="button"
                  className={`inv-cat${categoria === k.cat ? ' is-on' : ''}${k.conferidos === k.codigos ? ' is-completa' : ''}`}
                  aria-pressed={categoria === k.cat} onClick={() => setCategoria(categoria === k.cat ? null : k.cat)}>
                  <b>{k.cat}</b><small>{k.conferidos}/{k.codigos}</small>
                </button>
              ))}
            </section>
          )}

          <ListaDoInventario pecas={pecas} contagem={c.contagem} categoria={categoria} aoAbrir={abrirPeca} />
        </div>
      )}

      {descartando && (
        <DialogoDeDescarte
          ocupado={ocupado}
          aoConfirmar={async () => {
            const ok = await acao(`/api/inventarios/${id}/cancelar`);
            setDescartando(false);
            if (ok) aoSair();
          }}
          aoVoltar={() => setDescartando(false)}
        />
      )}
    </section>
  );
}

/** A situação de uma linha (mantida para o painel e testes antigos): NÃO
 *  CONFERIDO não é zero. */
export function situacaoDaLinha(
  p: { esperado: number }, contado: number | undefined,
): { rotulo: string; classe: string } {
  if (contado === undefined) return { rotulo: 'Não conferido', classe: 'mq-status mq-status--open' };
  if (contado === p.esperado) return { rotulo: 'Conferido', classe: 'mq-status mq-status--ok' };
  if (contado < p.esperado) return { rotulo: 'Faltando', classe: 'mq-status mq-status--risk' };
  return { rotulo: 'Sobrando', classe: 'mq-status mq-status--warn' };
}
