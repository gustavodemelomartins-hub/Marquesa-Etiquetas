import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { fmtData, plural } from '../../domain/formato';
import { saudeDoEstoque, type NivelDeSaude, type ResumoDoInventario } from './saude';
import { DialogoDeEncerramento, type EscolhaDoEncerramento } from './DialogoDeEncerramento';
import { DialogoDeDescarte } from './DialogoDeDescarte';
import { ProgressoDaContagem } from './ProgressoDaContagem';
import { RevisaoDoInventario } from './RevisaoDoInventario';
import { TODAS, filtrarPorCategoria } from './progresso';
import {
  chaveDe, comRetentativa, estadoDe, interpretarLeitura, pecasFaltandoEm, resumoDaConferencia,
  type Conferida, type EstadoDaReferencia,
} from './conferencia';
import {
  EstacaoDeLeitura, type EstacaoHandle, type LeituraRecente, type ReferenciaDaEstacao,
} from './EstacaoDeLeitura';
import type { AppState } from '../../types/api';
import { LeitorDeEtiquetas, type ResultadoDaLeitura } from '../../components/scanner/LeitorDeEtiquetas';
import { resolverSku } from '../../components/scanner/codigoDaEtiqueta';
import { criarBipe, temCamera } from '../../components/scanner/leitorDeEtiqueta';

interface InventarioResumo {
  id: number;
  status: 'aberto' | 'pausado' | 'concluido' | 'cancelado' | string;
  iniciadoEm: string;
  pausadoEm: string | null;
  concluidoEm: string | null;
  divergentes: number;
  pecas: number;
  naoComparaveis: number;
}

const ROTULO_DO_STATUS: Record<string, string> = {
  aberto: 'Em andamento',
  pausado: 'Pausado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};
export const rotuloDoStatus = (status: string) => ROTULO_DO_STATUS[status] ?? status;

interface LinhaContada {
  sku: string;
  desc?: string;
  variacao: string | null;
  contado: number;
  contadoEm: string;
  /** "Bipou e marcha": o esperado que o servidor usou e a falta dita. */
  esperadoNaHora?: number | null;
  faltando?: number | null;
}

/** O QUE SE ESPERA ENCONTRAR EM CASA, código a código, direto do servidor
 *  (`api/src/inventario.js › SQL_ESPERADO`).
 *
 *  A tela NÃO recalcula isso. `esperado` já é total menos consignado, e a
 *  lista já exclui kit e configuração montável. A versão anterior comparava
 *  contra `produtos.qtd` — o TOTAL —, e o efeito era a regra mais cara do
 *  inventário sendo violada em silêncio: peça que está na maleta de uma
 *  revendedora aparecia como FALTANDO na contagem da casa. */
interface Esperado extends ReferenciaDaEstacao {
  cat: string | null;
  preco: number | null;
}

interface DetalheInventario {
  id: number;
  status: string;
  iniciadoEm: string;
  pausadoEm: string | null;
  concluidoEm: string | null;
  contagem: LinhaContada[];
  naoIdentificado: unknown[];
  cobertura: { conferidos: number; total: number };
  /** Vem preenchido só enquanto o inventário está em andamento. */
  esperados?: Esperado[];
  /** Variações criadas durante a contagem. */
  eventos?: { tipo: string; sku: string; desc: string; variacao: string | null; em: string }[];
}

interface Props {
  conexao: Connection;
  estado: AppState | null;
  aoMudarEstoque: () => void;
  /** EMBUTIDA — o inventário como SEÇÃO da Visão geral, que é onde o
   *  protótipo o coloca: entre "Onde está o patrimônio" e "Todos os
   *  produtos", no mesmo documento, sem trocar de tela.
   *
   *  Fora daqui ele continua sendo uma tela inteira em `#/estoque/inventario`
   *  — o endereço não quebra, e quem vem de um link antigo chega no mesmo
   *  lugar. A diferença é só o cabeçalho: seção tem `mq-card__head`, tela
   *  tem `mq-pagehead`. O miolo é literalmente o mesmo código, porque dois
   *  inventários que divergem é exatamente o defeito que esta tela existe
   *  para não ter. */
  embutida?: boolean;
}

/** INVENTÁRIO — contar o que existe de verdade.
 *
 *  A regra que governa a tela inteira, e que o backend aplica:
 *
 *    NÃO CONTADO não é ZERO.
 *
 *  Uma peça que ninguém conferiu é uma incógnita; uma peça conferida e
 *  ausente é um zero, e é um RESULTADO. Tratar as duas como a mesma coisa
 *  zeraria o estoque de tudo o que ficou para amanhã. Por isso contar tem
 *  um caminho e desfazer a contagem tem outro — voltar para "não contado"
 *  não é escrever zero.
 *
 *  Pausar existe pelo mesmo motivo: contagem de loja acontece entre um
 *  atendimento e outro, e um inventário que não pode ser interrompido é um
 *  inventário que ninguém termina.
 */
/** A aparência de cada nível, só com os tokens do Design System
 *  (`--mq-ok`, `--mq-warn`, `--mq-risk`). */
const ICONE_DA_SAUDE: Record<NivelDeSaude, { icone: 'check' | 'alert' | 'inventory'; classe: string }> = {
  ok: { icone: 'check', classe: 'success' },
  atencao: { icone: 'alert', classe: 'warn' },
  vencida: { icone: 'alert', classe: 'risk' },
  carregando: { icone: 'inventory', classe: '' },
};

export function InventarioArea({ conexao, estado, aoMudarEstoque, embutida = false }: Props) {
  const lista = useApi(
    (s) => chamar<InventarioResumo[]>(conexao, 'GET', '/api/inventarios', undefined, { signal: s }),
    [conexao],
  );
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const [erroAcao, setErroAcao] = useState('');

  /* `GET /api/inventarios` devolve uma lista. Se um dia devolver outra
     coisa — erro serializado como objeto, resposta truncada, rota ainda
     não publicada naquele ambiente —, a Visão geral inteira não pode cair
     junto: o inventário é UMA seção dela agora, e uma seção que não sabe
     o que mostrar mostra o estado vazio, não uma tela branca. */
  const inventarios = Array.isArray(lista.dados) ? lista.dados : [];

  const emAndamento = inventarios.find((i) => i.status === 'aberto' || i.status === 'pausado');
  const idAtual = abertoId ?? emAndamento?.id ?? null;

  /* O último inventário CONCLUÍDO — não o último criado. Um cancelado não
     é uma conferência que aconteceu, e mostrá-lo como "último inventário"
     daria a impressão de que a loja foi contada quando não foi. */
  const ultimoConcluido = inventarios.find((i) => i.status === 'concluido');

  /* `GET /api/state › inventario` — o resumo que o servidor já monta, com
     o prazo de `config.inventarioDias` aplicado. A tela não recalcula
     "está vencido": quem sabe disso é quem guarda o prazo. */
  const resumoDoEstado = estado?.inventario as
    | (ResumoDoInventario & { abertoId?: number | null })
    | undefined;
  /* Verde só para estoque conferido no prazo; nunca ter contado é "primeira
     conferência pendente", não saúde (`saude.ts`). */
  const saude = saudeDoEstoque(resumoDoEstado);

  async function abrir() {
    setErroAcao('');
    const r = await chamar<{ id?: number; erro?: string }>(conexao, 'POST', '/api/inventarios', {})
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui abrir.' }));
    if (r && 'erro' in r && r.erro) { setErroAcao(String(r.erro)); return; }
    lista.recarregar();
    if (r && 'id' in r && r.id) setAbertoId(r.id);
  }

  /* Abrir é o MESMO ato nos dois cabeçalhos. Ele só muda de lugar: canto
     do `mq-pagehead` quando a tela é inteira, canto da seção quando ela
     mora dentro da Visão geral. */
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
        <p className="mq-lede">
          Contar o que existe de verdade, e comparar com o que o sistema acha
          que existe. Contagem e correção permanecem etapas separadas.
        </p>
      </div>
      {acaoAbrir && <div className="mq-btns">{acaoAbrir}</div>}
    </div>
  ) : (
    <div className="mq-pagehead">
      <div className="mq-pagehead__text">
        <p className="mq-eyebrow">Conferência física</p>
        <h1 className="mq-display" id="inventario-titulo">Inventário</h1>
        <p className="mq-lede">
          Contar o que existe de verdade, e comparar com o que o sistema
          acha que existe.
        </p>
      </div>
      {acaoAbrir && <div className="mq-pagehead__actions">{acaoAbrir}</div>}
    </div>
  );

  /* O nível do título do histórico segue o do cabeçalho: embutido, a
     seção já é `h2` e o histórico é `h3`; em tela inteira o cabeçalho é
     `h1` e o histórico é `h2`. Pular um nível é o tipo de coisa que só
     atrapalha quem navega por leitor de tela. */
  const TituloHistorico = embutida ? 'h3' : 'h2';

  const miolo = (
    <>
      {/* OS TRÊS CONTEXTOS do protótipo. Não são abas: são três fatos
          sobre a mesma coisa, e quem chega precisa dos três de uma vez —
          "como está o estoque", "quando foi a última vez" e "há algo
          aberto agora". */}
      {/* Com uma contagem aberta, o leitor é a tela: os três fatos de contexto
          e a nota saem do caminho (02/10/2026). */}
      {idAtual === null && <div className="inventory-contexts">
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
            <strong>
              {ultimoConcluido ? fmtData(ultimoConcluido.concluidoEm ?? '') : 'Nenhum ainda'}
            </strong>
            <em className={ultimoConcluido ? 'positive' : ''}>
              {ultimoConcluido
                ? (ultimoConcluido.divergentes
                  ? `${ultimoConcluido.divergentes} ${plural(ultimoConcluido.divergentes, 'divergência', 'divergências')}`
                  : 'Finalizado sem divergência')
                : 'Nenhuma conferência concluída'}
            </em>
          </span>
        </article>

        <article className={emAndamento ? 'inventory-context active' : 'inventory-context'}>
          <span className="context-icon"><Icone nome="box" /></span>
          <span>
            <small>Inventário em aberto</small>
            <strong>
              {emAndamento
                ? (emAndamento.status === 'pausado' ? 'Pausado' : 'Em andamento')
                : 'Nenhum aberto'}
            </strong>
            <em>
              {emAndamento
                ? `aberto em ${fmtData(emAndamento.iniciadoEm)}`
                : 'Pronto para iniciar'}
            </em>
          </span>
        </article>
      </div>}

      {idAtual === null && (
        <p className="mq-note mq-note--info">
          <Icone nome="alert" />
          <span>
            <b>O sistema já sabe quanto deveria ter em casa.</b> Bipe uma peça de
            cada referência; se faltar, digite só quanto falta.
          </span>
        </p>
      )}

      {erroAcao && <p className="mq-note mq-note--risk" role="alert"><span>{erroAcao}</span></p>}
      {lista.erro ? <section className="mq-card"><ErrorState erro={lista.erro} aoTentarDeNovo={lista.recarregar} /></section> : null}

      {idAtual !== null ? (
        <Contagem
          conexao={conexao}
          id={idAtual}
          aoMudar={() => { lista.recarregar(); aoMudarEstoque(); }}
          aoSair={() => setAbertoId(null)}
        />
      ) : null}

      {/* O histórico, com a mesma legenda da tela aprovada: o registro do
          que foi conferido não se apaga, e é por ele que se responde
          "quando foi a última vez" sem ter de confiar na memória. */}
      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div>
            <p className="mq-eyebrow">Registro preservado</p>
            <TituloHistorico className="mq-title">Histórico de inventários</TituloHistorico>
            <p className="mq-lede">
              Cobertura, divergências e ajustes efetivamente aplicados.
            </p>
          </div>
        </div>
        {inventarios.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="inventory" /></span>
            <h3>Nenhum inventário ainda</h3>
            <p>Abra um quando for contar a loja. Ele pode ser pausado e retomado.</p>
          </div>
        ) : (
          <div className="mq-list">
            {inventarios.map((i) => (
              <button type="button" className="mq-item" key={i.id} onClick={() => setAbertoId(i.id)}>
                <span className={`mq-item__icon ${i.divergentes ? 'mq-item__icon--warn' : 'mq-item__icon--ok'}`}>
                  <Icone nome="inventory" />
                </span>
                <span className="mq-item__main">
                  <b>Inventário #{i.id}</b>
                  <small>
                    aberto em {fmtData(i.iniciadoEm)}
                    {i.concluidoEm
                      ? ` · ${i.status === 'cancelado' ? 'cancelado' : 'concluído'} em ${fmtData(i.concluidoEm)}`
                      : ''}
                    {i.divergentes ? ` · ${i.divergentes} divergentes` : ''}
                  </small>
                </span>
                <span className="mq-item__side">
                  <span className={`mq-status ${i.status === 'concluido' ? 'mq-status--ok' : i.status === 'pausado' ? 'mq-status--warn' : ''}`}>
                    {rotuloDoStatus(i.status)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );

  /* Embutida, o inventário é uma SEÇÃO com um título — não uma tela
     dentro de outra. Por isso não ganha mais um `mq-card` por fora: os
     cartões que ele já tem dentro (a contagem, o histórico) ficariam
     aninhados dentro de outro cartão, e dois quadros concêntricos é
     exatamente o que o protótipo não faz. */
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

/* ───────────────────────────────────────────────────────── a contagem */

/** A CONTAGEM — "bipou e marcha" (02/10/2026).
 *
 *  Antes a tela era uma tabela de 790 linhas com um campo "Contado" em cada
 *  uma, e o campo de cima só FILTRAVA a tabela: o leitor de código de barras
 *  digitava nele, nada era gravado, e o bipe seguinte grudava no anterior.
 *  A Sthefany conta mais rápido no Excel porque lá ela não redigita o que o
 *  sistema já sabe.
 *
 *  Agora o leitor é a tela. Um bipe confere a referência inteira contra o
 *  esperado em casa que o SERVIDOR calcula na hora (`faltando: 0`); falta é
 *  a exceção, e ela diz só quanto. Cada leitura entra numa fila de gravação
 *  com retentativa e aparece na hora — a próxima leitura nunca espera a
 *  rede. A lista completa continua existindo, recolhida, para quem precisa
 *  procurar uma peça sem etiqueta. */
function Contagem({
  conexao, id, aoMudar, aoSair,
}: {
  conexao: Connection;
  id: number;
  aoMudar: () => void;
  aoSair: () => void;
}) {
  const detalhe = useApi(
    (s) => chamar<DetalheInventario>(conexao, 'GET', `/api/inventarios/${id}`, undefined, { signal: s }),
    [conexao, id],
  );
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [categoria, setCategoria] = useState<string>(TODAS);
  const [busca, setBusca] = useState('');
  const [filtroLista, setFiltroLista] = useState<'pendentes' | 'com_falta' | 'todos'>('pendentes');
  const [encerrando, setEncerrando] = useState(false);
  const [descartando, setDescartando] = useState(false);

  const esperados = detalhe.dados?.esperados ?? [];
  const esperadosPorSku = useMemo(() => new Map(esperados.map((p) => [p.sku, p])), [esperados]);
  const esperadosRef = useRef(esperadosPorSku);
  esperadosRef.current = esperadosPorSku;

  /* ── O QUE ESTA SESSÃO CONFERIU. O servidor é a fonte; por cima dele a
     tela guarda só o que ela mudou e ele ainda não releu (salvando, não
     salvo, ou desfeito). Uma releitura nunca apaga uma leitura que ainda não
     chegou — e a soma das duas é síncrona, para a tela não piscar vazia. */
  const doServidor = useMemo(() => {
    const m = new Map<string, Conferida>();
    for (const c of detalhe.dados?.contagem ?? []) {
      const variacao = c.variacao ?? '';
      m.set(chaveDe(c.sku, variacao), {
        sku: c.sku, variacao,
        faltando: c.faltando ?? null,
        contado: c.contado,
        esperado: c.esperadoNaHora ?? (variacao ? null : esperadosPorSku.get(c.sku)?.esperado ?? null),
        gravacao: 'salvo',
        contadoEm: c.contadoEm,
      });
    }
    return m;
  }, [detalhe.dados, esperadosPorSku]);
  const [locais, setLocais] = useState<Map<string, Conferida | null>>(new Map());
  useEffect(() => {
    setLocais((atual) => {
      let mudou = false;
      const prox = new Map(atual);
      for (const [k, v] of atual) {
        const salvoNoServidor = v && v.gravacao === 'salvo' && doServidor.has(k);
        const desfeitoNoServidor = v === null && !doServidor.has(k);
        if (salvoNoServidor || desfeitoNoServidor) { prox.delete(k); mudou = true; }
      }
      return mudou ? prox : atual;
    });
  }, [doServidor]);
  const conferidas = useMemo(() => {
    const m = new Map(doServidor);
    for (const [k, v] of locais) { if (v === null) m.delete(k); else m.set(k, v); }
    return m;
  }, [doServidor, locais]);
  const conferidasRef = useRef(conferidas);
  conferidasRef.current = conferidas;

  const atualizar = (sku: string, variacao: string, mudar: (c: Conferida | undefined) => Conferida | undefined) => {
    const k = chaveDe(sku, variacao);
    const novo = mudar(conferidasRef.current.get(k));
    const prox = new Map(conferidasRef.current);
    if (novo) prox.set(k, novo); else prox.delete(k);
    conferidasRef.current = prox;
    setLocais((atual) => new Map(atual).set(k, novo ?? null));
  };

  /* ── A FILA. Uma gravação por vez, na ordem em que ela bipou; cada uma com
     retentativa para rede ruim. Nada aqui segura a próxima leitura. */
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const enfileirar = (tarefa: () => Promise<unknown>) => {
    const vez = fila.current.then(tarefa);
    fila.current = vez.catch(() => undefined);
    return vez;
  };
  const bipe = useRef<((ok: boolean) => void) | null>(null);
  const tocar = (ok: boolean) => { bipe.current = bipe.current ?? criarBipe(); bipe.current(ok); };

  interface RespostaDaContagem {
    contado?: number; esperado?: number | null; faltando?: number | null;
    erro?: string; precisaContado?: boolean;
  }

  function gravar(sku: string, variacao: string, quanto: { faltando: number } | { contado: number }) {
    const ref = esperadosRef.current.get(sku);
    const varianteId = variacao ? ref?.variacoes?.find((v) => v.nome === variacao)?.varianteId ?? null : null;
    const esperadoLocal = variacao
      ? ref?.variacoes?.find((v) => v.nome === variacao)?.esperado ?? null
      : ref?.esperado ?? null;
    atualizar(sku, variacao, () => ({
      sku, variacao,
      faltando: 'faltando' in quanto ? quanto.faltando : null,
      contado: 'contado' in quanto ? quanto.contado
        : (esperadoLocal != null ? esperadoLocal - quanto.faltando : null),
      esperado: esperadoLocal,
      gravacao: 'salvando',
      contadoEm: new Date().toISOString(),
    }));
    const corpo: Record<string, unknown> = { sku, origem: 'bipagem', ...quanto };
    if (variacao) { corpo.variacao = variacao; corpo.varianteId = varianteId; }
    else if (ref?.variacoes?.length) corpo.codigoInteiro = true;

    return enfileirar(async () => {
      try {
        const r = await comRetentativa(() => chamar<RespostaDaContagem>(
          conexao, 'POST', `/api/inventarios/${id}/itens`, corpo));
        atualizar(sku, variacao, (c) => c && ({
          ...c,
          contado: r.contado ?? c.contado,
          esperado: r.esperado ?? c.esperado,
          faltando: r.faltando ?? ('faltando' in quanto ? quanto.faltando : null),
          gravacao: 'salvo', erro: undefined,
        }));
      } catch (e) {
        const det = e as { corpo?: RespostaDaContagem; message?: string };
        /* O servidor não sabe o esperado desta linha (aro sem identidade, ou
           peça que ele não esperava em casa): a pergunta passa a ser
           "quantas você achou" — a linha fica marcada até ela responder. */
        if (det.corpo?.precisaContado) {
          atualizar(sku, variacao, (c) => c && ({
            ...c, faltando: null, contado: null, esperado: null,
            gravacao: 'erro', erro: 'diga quantas encontrou',
          }));
        } else {
          atualizar(sku, variacao, (c) => c && ({
            ...c, gravacao: 'erro', erro: det.corpo?.erro ?? det.message ?? 'não consegui salvar',
          }));
        }
        tocar(false);
      }
    });
  }

  function apagarLinha(sku: string, variacao: string) {
    atualizar(sku, variacao, () => undefined);
    return enfileirar(() => comRetentativa(() => chamar(conexao, 'DELETE',
      `/api/inventarios/${id}/itens/${encodeURIComponent(sku)}?variacao=${encodeURIComponent(variacao)}`))
      .catch(() => { setErro(`Não consegui desfazer ${sku}. Recarregue a tela antes de continuar.`); }));
  }

  /* ── A LEITURA. */
  const [ultima, setUltima] = useState<{ sku: string; variacao: string } | null>(null);
  const [feedback, setFeedback] = useState<{ texto: string; tom: 'ok' | 'neutro' | 'erro' } | null>(null);
  const [recentes, setRecentes] = useState<LeituraRecente[]>([]);
  const contador = useRef(0);
  const estacao = useRef<EstacaoHandle>(null);
  const anotar = (sku: string | null, texto: string, tom: LeituraRecente['tom']) => {
    contador.current += 1;
    const n = contador.current;
    setFeedback({ texto, tom });
    setRecentes((r) => [{ id: n, sku, texto, tom }, ...r].slice(0, 8));
  };

  function linhasDe(sku: string) {
    return [...conferidasRef.current.values()].filter((c) => c.sku === sku);
  }

  function lerCodigo(texto: string): ResultadoDaLeitura {
    const leitura = interpretarLeitura(texto);
    if (leitura.tipo === 'vazio') return { ok: false, texto: '' };
    if (leitura.tipo === 'falta') {
      if (!ultima) {
        anotar(null, 'Bipe a peça antes de dizer quanto falta.', 'erro');
        tocar(false);
        return { ok: false, texto: 'Bipe a peça antes.' };
      }
      informarFalta(ultima.variacao, leitura.quantidade, ultima.sku);
      return { ok: true, texto: `Falta ${leitura.quantidade}` };
    }
    const sku = resolverSku(leitura.codigo, esperadosRef.current);
    if (!sku) {
      const c = leitura.codigo.toUpperCase();
      anotar(null, `${c} não está na lista deste inventário.`, 'erro');
      tocar(false);
      return { ok: false, texto: `${c} não está na lista.` };
    }
    const ref = esperadosRef.current.get(sku)!;
    const ja = linhasDe(sku);
    if (ja.length) {
      setUltima({ sku, variacao: ja[0]!.variacao });
      anotar(sku, `Já conferido · ${ref.desc}`, 'neutro');
      return { ok: true, texto: `Já conferido · ${ref.desc}` };
    }
    setUltima({ sku, variacao: '' });
    if (ref.esperado <= 0) {
      void gravar(sku, '', { contado: 1 });
      anotar(sku, `${ref.desc} · não era esperada em casa — 1 encontrada`, 'neutro');
      tocar(true);
      return { ok: true, texto: `${ref.desc} · não era esperada em casa` };
    }
    void gravar(sku, '', { faltando: 0 });
    anotar(sku, `✓ ${ref.desc} · ${ref.esperado} em casa`, 'ok');
    tocar(true);
    return { ok: true, texto: `✓ ${ref.desc} · ${ref.esperado} em casa` };
  }

  function informarFalta(variacao: string, n: number, sku = ultima?.sku) {
    if (!sku) return;
    const ref = esperadosRef.current.get(sku);
    const linha = conferidasRef.current.get(chaveDe(sku, variacao));
    if (linha && linha.faltando == null) {
      anotar(sku, 'Esta peça pede quantas você encontrou, não quantas faltam.', 'erro');
      tocar(false);
      return;
    }
    const esperado = variacao
      ? ref?.variacoes?.find((v) => v.nome === variacao)?.esperado ?? null
      : ref?.esperado ?? null;
    if (esperado != null && n > esperado) {
      anotar(sku, `Falta ${n} é mais que as ${esperado} esperadas em casa.`, 'erro');
      tocar(false);
      return;
    }
    void gravar(sku, variacao, { faltando: n });
    anotar(sku, n ? `${ref?.desc ?? sku} · falta ${n}` : `✓ ${ref?.desc ?? sku} · sem falta`, n ? 'neutro' : 'ok');
  }

  function informarEncontradas(variacao: string, n: number) {
    if (!ultima) return;
    void gravar(ultima.sku, variacao, { contado: n });
    anotar(ultima.sku, `${esperadosRef.current.get(ultima.sku)?.desc ?? ultima.sku} · ${n} encontrada(s)`, 'neutro');
  }

  /* VARIAÇÃO — secundária. O bipe comum confere o código inteiro; escolher
     um aro troca a conferência agregada por uma conferência daquele aro. */
  async function escolherVariacao(variacao: string) {
    if (!ultima) return;
    const { sku } = ultima;
    const ref = esperadosRef.current.get(sku);
    if (variacao === '') {
      for (const l of linhasDe(sku)) if (l.variacao) void apagarLinha(sku, l.variacao);
      setUltima({ sku, variacao: '' });
      if (!conferidasRef.current.has(chaveDe(sku, ''))) void gravar(sku, '', { faltando: 0 });
      estacao.current?.focar();
      return;
    }
    if (conferidasRef.current.has(chaveDe(sku, ''))) void apagarLinha(sku, '');
    setUltima({ sku, variacao });
    if (!conferidasRef.current.has(chaveDe(sku, variacao))) {
      const esperado = ref?.variacoes?.find((v) => v.nome === variacao)?.esperado ?? null;
      if (esperado != null && esperado > 0) void gravar(sku, variacao, { faltando: 0 });
      else void gravar(sku, variacao, { contado: 1 });
    }
    estacao.current?.focar();
  }

  async function criarVariacao(valor: string): Promise<boolean> {
    if (!ultima) return false;
    const { sku } = ultima;
    const r: { criadas?: { nome: string }[]; erro?: string } = await chamar<{ criadas?: { nome: string }[]; erro?: string }>(
      conexao, 'POST', `/api/inventarios/${id}/variacoes`, { sku, valor },
    ).catch((e: unknown) => ({ erro: (e as { corpo?: { erro?: string }; message?: string })?.corpo?.erro
      ?? (e instanceof Error ? e.message : 'Não consegui criar a variação.') }));
    if (r.erro || !r.criadas?.length) {
      anotar(sku, r.erro ?? 'A variação não foi criada.', 'erro');
      tocar(false);
      return false;
    }
    const nome = r.criadas[0]!.nome;
    /* A peça está na mão dela: a variação nova nasce conferida com uma. */
    if (conferidasRef.current.has(chaveDe(sku, ''))) void apagarLinha(sku, '');
    setUltima({ sku, variacao: nome });
    void gravar(sku, nome, { contado: 1 });
    anotar(sku, `Variação ${nome} criada · 1 encontrada`, 'ok');
    detalhe.recarregar();
    return true;
  }

  function tentarDeNovo() {
    for (const c of conferidasRef.current.values()) {
      if (c.gravacao !== 'erro' || c.erro === 'diga quantas encontrou') continue;
      if (c.faltando != null) void gravar(c.sku, c.variacao, { faltando: c.faltando });
      else if (c.contado != null) void gravar(c.sku, c.variacao, { contado: c.contado });
    }
  }

  /* Fechar a aba com leitura a caminho perde a leitura: o navegador avisa. */
  const resumo = useMemo(() => resumoDaConferencia(esperados, conferidas.values()), [esperados, conferidas]);
  useEffect(() => {
    if (!resumo.naoSalvos) return undefined;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [resumo.naoSalvos]);

  const status = detalhe.dados?.status ?? 'aberto';
  const pausado = status === 'pausado';
  const encerrado = status === 'concluido' || status === 'cancelado';

  async function acao(caminho: string, corpo?: unknown) {
    setOcupado(caminho);
    setErro('');
    await fila.current;
    const r = await chamar<{ erro?: string }>(conexao, 'POST', caminho, corpo ?? {})
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui.' }));
    setOcupado(null);
    if (r && 'erro' in r && r.erro) { setErro(String(r.erro)); return false; }
    detalhe.recarregar();
    aoMudar();
    return true;
  }

  async function finalizar(escolha: EscolhaDoEncerramento) {
    const ok = await acao(`/api/inventarios/${id}/concluir`, { contagemCompleta: escolha.contagemCompleta });
    if (ok) setEncerrando(false);
  }

  async function descartar() {
    const ok = await acao(`/api/inventarios/${id}/cancelar`);
    setDescartando(false);
    if (ok) aoSair();
  }

  /* A lista recolhida e o progresso por categoria leem a mesma conferência. */
  const contadosPorSku = useMemo(() => {
    const m = new Map<string, { sku: string; contado: number; contadoEm: string }>();
    for (const c of conferidas.values()) {
      const a = m.get(c.sku);
      const em = c.contadoEm ?? '';
      m.set(c.sku, {
        sku: c.sku, contado: (a?.contado ?? 0) + (c.contado ?? 0),
        contadoEm: a && a.contadoEm > em ? a.contadoEm : em,
      });
    }
    return m;
  }, [conferidas]);
  const estadoDoSku = (sku: string): EstadoDaReferencia => {
    let pior: EstadoDaReferencia = 'nao_conferido';
    const peso = { nao_conferido: 0, conferido: 1, sobra: 2, com_falta: 3 };
    for (const c of conferidas.values()) {
      if (c.sku !== sku) continue;
      const e = estadoDe(c);
      if (peso[e] > peso[pior]) pior = e;
    }
    return pior;
  };
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return filtrarPorCategoria(esperados, categoria).filter((p) => {
      if (t && !(p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t))) return false;
      if (t) return true;
      const e = estadoDoSku(p.sku);
      if (filtroLista === 'pendentes') return e === 'nao_conferido';
      if (filtroLista === 'com_falta') return e === 'com_falta' || e === 'sobra';
      return true;
    });
  }, [esperados, categoria, busca, filtroLista, conferidas]); // eslint-disable-line react-hooks/exhaustive-deps

  const cobertura = detalhe.dados?.cobertura;
  const eventos = detalhe.dados?.eventos ?? [];

  if (status === 'cancelado') {
    return (
      <section className="mq-card">
        <div className="mq-card__head">
          <div>
            <h2 className="mq-title">Inventário #{id}</h2>
            <p className="mq-lede">
              <span className="mq-status">Cancelado</span>
              {detalhe.dados?.iniciadoEm ? ` · iniciado em ${fmtData(detalhe.dados.iniciadoEm)}` : ''}
              {' · '}as contagens não foram aplicadas ao estoque.
            </p>
          </div>
          <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={aoSair}>
            Fechar
          </button>
        </div>
      </section>
    );
  }

  if (encerrado) {
    return (
      <section className="mq-card">
        <div className="mq-card__head">
          <div>
            <p className="mq-eyebrow">Contagem encerrada</p>
            <h2 className="mq-title">Revisão do inventário #{id}</h2>
            <p className="mq-lede">
              Selecione as divergências — o sistema calcula o ajuste, e nenhum
              é aplicado sem você.
            </p>
          </div>
          <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={aoSair}>
            Fechar
          </button>
        </div>
        {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
        <RevisaoDoInventario conexao={conexao} id={id} aoAplicar={aoMudar} />
      </section>
    );
  }

  const ultimaRef = ultima ? esperadosPorSku.get(ultima.sku) : undefined;

  return (
    <section className="mq-card mq-card--flush inventario-ativo">
      <header className="mq-card__head active-inventory-head">
        <div>
          <h2 className="mq-title">Inventário #{id}</h2>
          <p className="mq-lede">
            <span className={pausado ? 'mq-status mq-status--warn' : 'mq-status mq-status--open'}>
              {pausado ? 'Pausado' : 'Em andamento'}
            </span>
            {detalhe.dados?.iniciadoEm ? ` · iniciado em ${fmtData(detalhe.dados.iniciadoEm)}` : ''}
            {cobertura ? ` · ${cobertura.total} códigos` : ''}
          </p>
        </div>
        <div className="active-actions">
          {temCamera() && !pausado && (
            <button
              type="button"
              className={camera ? 'mq-btn mq-btn--secondary is-ativo' : 'mq-btn mq-btn--secondary'}
              aria-pressed={camera}
              onClick={() => setCamera((v) => !v)}
            >
              <Icone nome="camera" />
              {camera ? 'Fechar câmera' : 'Abrir câmera'}
            </button>
          )}
          {!pausado ? (
            <button type="button" className="mq-btn mq-btn--secondary" disabled={!!ocupado}
              onClick={() => acao(`/api/inventarios/${id}/pausar`)}>
              Pausar
            </button>
          ) : (
            <button type="button" className="mq-btn mq-btn--secondary" disabled={!!ocupado}
              onClick={() => acao(`/api/inventarios/${id}/retomar`)}>
              Continuar
            </button>
          )}
          <button type="button" className="mq-btn mq-btn--primary" disabled={!!ocupado}
            onClick={() => setEncerrando(true)}>
            Concluir
          </button>
          <button type="button" className="mq-btn mq-btn--danger" disabled={!!ocupado}
            onClick={() => setDescartando(true)}>
            Descartar
          </button>
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoSair}>
            Fechar
          </button>
        </div>
      </header>

      {pausado && (
        <p className="mq-note mq-note--warn">
          <Icone nome="alert" />
          <span><b>Pausado.</b> A contagem continua de onde parou.</span>
        </p>
      )}
      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
      {detalhe.erro && !detalhe.dados ? (
        <ErrorState erro={detalhe.erro} aoTentarDeNovo={detalhe.recarregar} />
      ) : null}

      {camera && !pausado && (
        <div className="mq-card__body">
          <LeitorDeEtiquetas
            aoLer={async (codigo) => lerCodigo(codigo)}
            aoFechar={() => { setCamera(false); estacao.current?.focar(); }}
            titulo="Bipe uma peça de cada referência"
            dica="Um bipe confere a referência inteira. Se faltar, digite só quanto falta."
          />
        </div>
      )}

      <div className="mq-card__body">
        <EstacaoDeLeitura
          ref={estacao}
          pausado={pausado}
          pronto={!!detalhe.dados}
          feedback={feedback}
          ultima={ultima && ultimaRef ? { ref: ultimaRef, variacao: ultima.variacao, linhas: linhasDe(ultima.sku) } : null}
          recentes={recentes}
          resumo={resumo}
          aoLer={(t) => { lerCodigo(t); }}
          aoInformarFalta={(v, n) => informarFalta(v, n)}
          aoInformarEncontradas={informarEncontradas}
          aoEscolherVariacao={escolherVariacao}
          aoCriarVariacao={criarVariacao}
          aoTentarDeNovo={tentarDeNovo}
        />
      </div>

      <details className="inventario-lista">
        <summary>Lista e progresso por categoria</summary>
        <ProgressoDaContagem
          esperados={esperados}
          contados={contadosPorSku}
          categoria={categoria}
          aoFiltrar={setCategoria}
        />
        <div className="mq-filters inventory-capture">
          <label className="mq-search">
            <Icone nome="search" />
            <input
              className="mq-input"
              type="search"
              placeholder="Procurar peça sem etiqueta"
              aria-label="Procurar peça na lista"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
          <div className="mq-chipset" role="group" aria-label="Mostrar">
            {([['pendentes', 'Pendentes'], ['com_falta', 'Com falta'], ['todos', 'Todos']] as const).map(([v, r]) => (
              <button key={v} type="button" className={filtroLista === v ? 'mq-chip is-on' : 'mq-chip'}
                aria-pressed={filtroLista === v} onClick={() => setFiltroLista(v)}>
                {r}
              </button>
            ))}
          </div>
          <span className="mq-filters__count">{lista.length} {plural(lista.length, 'código', 'códigos')}</span>
        </div>
        <div className="mq-table inventory-count-list" role="table" aria-label="Itens do inventário">
          <div className="mq-tr mq-tr--head count-row" role="row">
            <span>Peça</span>
            <span className="mq-cell--num">Esperado em casa</span>
            <span className="mq-cell--num">Faltando</span>
            <span>Status</span>
            <span />
          </div>
          {lista.slice(0, 300).map((p) => {
            const e = estadoDoSku(p.sku);
            const falta = linhasDe(p.sku).reduce((s, c) => s + pecasFaltandoEm(c), 0);
            const sit = situacaoDoEstado(e);
            return (
              <div className="mq-tr count-row" role="row" key={p.sku}>
                <span className="mq-cell">
                  <b>{p.sku} · {p.desc}</b>
                  <small className="mq-sku">
                    {p.cat || 'sem categoria'}
                    {p.consignado > 0 ? ` · ${p.consignado} com revendedoras` : ''}
                  </small>
                </span>
                <span className="mq-cell mq-cell--num" data-label="Esperado em casa"><b className="mq-qty">{p.esperado}</b></span>
                <span className="mq-cell mq-cell--num" data-label="Faltando">{e === 'nao_conferido' ? '—' : falta}</span>
                <span className="mq-cell" data-label="Status"><span className={sit.classe}>{sit.rotulo}</span></span>
                <span className="mq-cell mq-cell--center">
                  {e === 'nao_conferido' ? (
                    <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" disabled={pausado}
                      onClick={() => { lerCodigo(p.sku); estacao.current?.focar(); }}>
                      Conferir
                    </button>
                  ) : (
                    <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" disabled={pausado}
                      title="Voltar para não conferido — que não é falta"
                      onClick={() => {
                        for (const l of linhasDe(p.sku)) void apagarLinha(p.sku, l.variacao);
                        if (ultima?.sku === p.sku) setUltima(null);
                      }}>
                      Desfazer
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          {lista.length > 300 && (
            <p className="mq-lede">Mostrando 300 de {lista.length}. Procure pelo nome ou código.</p>
          )}
        </div>
      </details>

      {encerrando && (
        <DialogoDeEncerramento
          resumo={{
            conferido: resumo.conferidos,
            faltando: resumo.comFalta,
            sobrando: resumo.sobrando,
            naoConferido: resumo.pendentes,
            pecasContadas: resumo.pecasContadas,
            pecasFaltando: resumo.pecasFaltando,
            naoSalvos: resumo.naoSalvos,
            variacoesCriadas: eventos.filter((e) => e.tipo === 'variacao_criada')
              .map((e) => `${e.desc} · ${e.variacao ?? ''}`),
          }}
          ocupado={!!ocupado}
          aoConfirmar={finalizar}
          aoCancelar={() => { setEncerrando(false); estacao.current?.focar(); }}
        />
      )}

      {descartando && (
        <DialogoDeDescarte
          ocupado={!!ocupado}
          aoConfirmar={descartar}
          aoVoltar={() => { setDescartando(false); estacao.current?.focar(); }}
        />
      )}
    </section>
  );
}

function situacaoDoEstado(e: EstadoDaReferencia): { rotulo: string; classe: string } {
  if (e === 'nao_conferido') return { rotulo: 'Não conferido', classe: 'mq-status mq-status--open' };
  if (e === 'conferido') return { rotulo: 'Conferido', classe: 'mq-status mq-status--ok' };
  if (e === 'com_falta') return { rotulo: 'Com falta', classe: 'mq-status mq-status--risk' };
  return { rotulo: 'Sobrando', classe: 'mq-status mq-status--warn' };
}

/** Os quatro estados que o protótipo desenha, e o que cada um significa.
 *
 *  A diferença que importa é a última: NÃO CONFERIDO não é zero. Uma peça
 *  que ninguém contou é uma incógnita, e o servidor recusa transformá-la em
 *  diferença — é essa trava que impede um inventário parado pela metade de
 *  zerar meio catálogo. */
export function situacaoDaLinha(
  p: { esperado: number }, contado: number | undefined,
): { rotulo: string; classe: string } {
  if (contado === undefined) return { rotulo: 'Não conferido', classe: 'mq-status mq-status--open' };
  if (contado === p.esperado) return { rotulo: 'Conferido', classe: 'mq-status mq-status--ok' };
  if (contado < p.esperado) return { rotulo: 'Faltando', classe: 'mq-status mq-status--risk' };
  return { rotulo: 'Sobrando', classe: 'mq-status mq-status--warn' };
}

/* ──────────────────────────────────────────────────────── o resultado
 *
 *  A REVISÃO saiu deste arquivo. Ela era uma função `Resultado` com quatro
 *  listas do mesmo tamanho e quatro números do mesmo peso, e virou uma etapa
 *  de conciliação com prioridade própria — o que precisa de decisão na
 *  frente, o que está certo recolhido, e o motivo obrigatório na linha.
 *
 *  Mora em `./RevisaoDoInventario.tsx`, que é onde o raciocínio dela está
 *  escrito por extenso. Aqui ficou só a contagem.
 */
