import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { fmtData, plural } from '../../domain/formato';
import {
  aplicaveis, aplicarAjustes, buscarResultado, pedidoDaLinha, temResultado,
  type LinhaDeDiferenca,
} from './resultado';
import {
  DialogoDeVariacao,
  type EscolhaDaVariacao,
  type PedidoDeVariacao,
} from './DialogoDeVariacao';
import type { AppState } from '../../types/api';
import { LeitorDeEtiquetas, type ResultadoDaLeitura } from '../../components/scanner/LeitorDeEtiquetas';
import { resolverSku } from '../../components/scanner/codigoDaEtiqueta';
import { temCamera } from '../../components/scanner/leitorDeEtiqueta';

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

interface LinhaContada {
  sku: string;
  desc?: string;
  variacao: string | null;
  contado: number;
  contadoEm: string;
}

/** O QUE SE ESPERA ENCONTRAR EM CASA, código a código, direto do servidor
 *  (`api/src/inventario.js › SQL_ESPERADO`).
 *
 *  A tela NÃO recalcula isso. `esperado` já é total menos consignado, e a
 *  lista já exclui kit e configuração montável. A versão anterior comparava
 *  contra `produtos.qtd` — o TOTAL —, e o efeito era a regra mais cara do
 *  inventário sendo violada em silêncio: peça que está na maleta de uma
 *  revendedora aparecia como FALTANDO na contagem da casa. */
interface Esperado {
  sku: string;
  desc: string;
  cat: string | null;
  preco: number | null;
  total: number;
  consignado: number;
  esperado: number;
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
    | { abertoId?: number | null; diasDesde?: number | null; vencido?: boolean; ultimoEm?: string | null }
    | undefined;

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
      <div className="inventory-contexts">
        <article className="inventory-context">
          <span className="context-icon success"><Icone nome="check" /></span>
          <span>
            <small>Saúde do estoque</small>
            <strong>
              {resumoDoEstado?.vencido ? 'Conferência vencida' : 'Situação geral'}
            </strong>
            <em>
              {resumoDoEstado?.diasDesde == null
                ? 'Nunca conferido'
                : `${resumoDoEstado.diasDesde} ${plural(resumoDoEstado.diasDesde, 'dia', 'dias')} desde a última`}
            </em>
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
      </div>

      <p className="mq-note mq-note--info">
        <Icone nome="alert" />
        <span>
          <b>Só conta o que deveria estar em casa.</b> Peça que saiu na maleta
          de uma revendedora NÃO aparece como faltante — o número da coluna
          "Sistema" já é o total menos o consignado. E <b>não contado não é
          zero</b>: peça que ninguém conferiu fica de fora da conta, e dá para
          pausar e continuar depois sem perder nada.
        </span>
      </p>

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
                    {i.concluidoEm ? ` · concluído em ${fmtData(i.concluidoEm)}` : ''}
                    {i.divergentes ? ` · ${i.divergentes} divergentes` : ''}
                  </small>
                </span>
                <span className="mq-item__side">
                  <span className={`mq-status ${i.status === 'concluido' ? 'mq-status--ok' : i.status === 'pausado' ? 'mq-status--warn' : ''}`}>
                    {i.status}
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

/** A CONTAGEM.
 *
 *  Não recebe mais o `AppState`: a lista do que se espera encontrar em casa
 *  vem de `GET /api/inventarios/:id › esperados`, já com a regra do
 *  servidor aplicada (total menos consignado, sem kit e sem configuração
 *  montável). Enquanto ela era derivada aqui de `produtos.qtd`, peça em
 *  maleta aparecia como FALTANDO. */
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
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  /* O 409 do servidor vira uma PERGUNTA, não uma mensagem de erro. */
  const [perguntandoVariacao, setPerguntandoVariacao] = useState<PedidoDeVariacao | null>(null);
  const [camera, setCamera] = useState(false);

  /* A LISTA DA CONTAGEM vem do servidor, não do `GET /api/state`: é ela
     que carrega a regra do "em casa". Ver o comentário de `Esperado`. */
  const esperados = detalhe.dados?.esperados ?? [];
  const contados = useMemo(
    () => new Map((detalhe.dados?.contagem ?? []).map((c) => [c.sku, c])),
    [detalhe.dados],
  );

  /* O índice que a câmera consulta a cada leitura. `Map` e não `Array`
     porque isto roda cinco vezes por segundo: varrer 790 linhas por quadro
     esquentaria o telefone para responder a mesma pergunta. */
  const esperadosPorSku = useMemo(
    () => new Map(esperados.map((p) => [p.sku, p])),
    [esperados],
  );

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return esperados;
    return esperados.filter(
      (p) => p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t),
    );
  }, [esperados, busca]);

  const status = detalhe.dados?.status ?? 'aberto';
  const pausado = status === 'pausado';
  const encerrado = status === 'concluido' || status === 'cancelado';

  /** O resumo que o protótipo mostra no rodapé da contagem, e que a
   *  finalização repete antes de encerrar. São CONTAGENS DE CÓDIGO, e
   *  "não conferido" é a maior delas no começo — por construção. */
  const resumo = useMemo(() => {
    let conferido = 0, faltando = 0, sobrando = 0;
    for (const p of esperados) {
      const c = contados.get(p.sku);
      if (!c) continue;
      if (c.contado === p.esperado) conferido += 1;
      else if (c.contado < p.esperado) faltando += 1;
      else sobrando += 1;
    }
    return {
      conferido, faltando, sobrando,
      naoConferido: Math.max(0, esperados.length - contados.size),
    };
  }, [esperados, contados]);

  /** A última gravação — o que diz a quem voltou depois do almoço que a
   *  contagem da manhã está lá. */
  const ultimaGravacao = useMemo(() => {
    let maior: string | null = null;
    for (const c of detalhe.dados?.contagem ?? []) {
      if (!maior || c.contadoEm > maior) maior = c.contadoEm;
    }
    return maior;
  }, [detalhe.dados]);

  async function acao(caminho: string, corpo?: unknown) {
    setOcupado(caminho);
    setErro('');
    const r = await chamar<{ erro?: string }>(conexao, 'POST', caminho, corpo ?? {})
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui.' }));
    setOcupado(null);
    if (r && 'erro' in r && r.erro) { setErro(String(r.erro)); return false; }
    detalhe.recarregar();
    aoMudar();
    return true;
  }

  /** FINALIZAR não pode ser um clique a seco.
   *
   *  Concluir congela o retrato — depois dele a contagem não muda mais — e
   *  tudo o que ficou sem contar entra como "não conferido". Quem para no
   *  meio precisa ver o tamanho disso ANTES, e não descobrir depois. O que
   *  concluir NÃO faz é mexer em estoque: o ajuste é o passo seguinte, e
   *  tem confirmação própria. */
  async function finalizar() {
    const resumoTexto = [
      `Faltando: ${resumo.faltando}`,
      `Sobrando: ${resumo.sobrando}`,
      `Conferidos e batendo: ${resumo.conferido}`,
      `NAO conferidos: ${resumo.naoConferido}`,
    ].join('\n');

    const sobreOsNaoConferidos = resumo.naoConferido > 0
      ? `Os ${resumo.naoConferido} codigos nao conferidos continuam como `
        + 'incognita: nao contado nao e zero, e nenhum deles vira diferenca.'
      : 'Todos os codigos esperados foram conferidos.';

    const aviso = [
      'Finalizar a contagem?',
      '',
      resumoTexto,
      '',
      'Finalizar CONGELA o retrato e NAO altera estoque nenhum.',
      'Os ajustes vem depois, um a um, com confirmacao propria.',
      '',
      sobreOsNaoConferidos,
    ].join('\n');

    if (!confirm(aviso)) return;
    await acao(`/api/inventarios/${id}/concluir`);
  }

  /** Grava uma contagem. `escolha` só existe quando o servidor já pediu a
   *  variação e a pessoa respondeu.
   *
   *  O 409 "tem variação cadastrada" NÃO é erro: é o servidor se recusando
   *  a chutar de qual aro a peça é (regra 2 do projeto), e mandando junto
   *  a lista para alguém responder. Enquanto a tela o tratava como erro, os
   *  27 códigos com variação eram impossíveis de contar — a mensagem
   *  aparecia e a contagem nunca gravava. */
  /** `contar` agora DEVOLVE o que aconteceu, além de mexer na tela.
   *
   *  Quem clica no `+` vê o resultado na própria linha e ignora o retorno.
   *  Quem bipa não está olhando a lista — está com uma peça na mão e o
   *  telefone na outra —, e precisa de uma frase. É a mesma gravação, pela
   *  mesma rota: o que muda é só quem conta a história de volta. */
  async function contar(
    sku: string, contado: number, escolha?: EscolhaDaVariacao,
    /* A bipada já mostra a recusa dentro do leitor, na linha que ela está
       olhando. Repeti-la no alto da tela poria a mesma frase em dois
       lugares, e a de cima ficaria lá depois de resolvida. */
    silencioso = false,
  ): Promise<ResultadoDaLeitura> {
    setOcupado(sku);
    setErro('');
    const falhou = (texto: string) => {
      if (!silencioso) setErro(texto);
      return { ok: false, texto };
    };

    if (escolha?.tipo === 'nao-sei') {
      /* §4.4/D5 — "não sei" é resposta, não desistência: registra a
         pendência, bloqueia o código para ajuste, não movimenta nada. */
      const r = await chamar<{ erro?: string }>(
        conexao, 'POST', `/api/inventarios/${id}/nao-identificado`, { sku, qtd: contado },
      ).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui registrar.' }));
      setOcupado(null);
      if (r && 'erro' in r && r.erro) return falhou(String(r.erro));
      detalhe.recarregar();
      return { ok: true, texto: `${sku} — anotado como "não sei a variação"` };
    }

    const corpo: Record<string, unknown> = { sku, contado };
    if (escolha?.tipo === 'variacao') {
      corpo.variacao = escolha.variacao;
      corpo.varianteId = escolha.varianteId;
    }

    const r = await chamar<{ erro?: string }>(
      conexao, 'POST', `/api/inventarios/${id}/itens`, corpo,
    ).catch((e: unknown) => {
      /* `chamar` embrulha o corpo da resposta em `corpo` — é de lá que sai
         a lista de variações que o servidor ofereceu. */
      const det = e as { status?: number; corpo?: { erro?: string; variacoes?: unknown } };
      const vs = det?.corpo?.variacoes;
      if (det?.status === 409 && Array.isArray(vs) && vs.length) {
        return { pedirVariacao: vs as PedidoDeVariacao['variacoes'] };
      }
      return { erro: e instanceof Error ? e.message : 'Não consegui gravar a contagem.' };
    });
    setOcupado(null);

    if (r && 'pedirVariacao' in r && r.pedirVariacao) {
      const linha = esperadosPorSku.get(sku);
      setPerguntandoVariacao({
        sku,
        desc: linha?.desc ?? sku,
        contado,
        variacoes: r.pedirVariacao,
      });
      /* Não é erro, e o leitor não deve tocar o som de recusa: a peça foi
         reconhecida, e o que falta é uma resposta humana. */
      return { ok: true, texto: `${linha?.desc ?? sku} tem variação — diga qual você contou` };
    }
    if (r && 'erro' in r && r.erro) return falhou(String(r.erro));
    detalhe.recarregar();
    const linha = esperadosPorSku.get(sku);
    return {
      ok: true,
      texto: linha
        ? `${linha.desc} ✓ ${contado} de ${linha.esperado}`
        : `${sku} ✓ contado ${contado}`,
    };
  }

  /** UMA LEITURA DA CÂMERA.
   *
   *  Aqui mora a única regra desta integração, e ela é curta: a bipada
   *  SOMA UM ao que já estava contado naquela linha.
   *
   *  Isso não é detalhe de implementação — é o que faz a segunda unidade da
   *  mesma peça ser contada como segunda unidade. `POST /itens` grava um
   *  valor ABSOLUTO (`contado`), então quem bipa precisa ler o valor atual
   *  e mandar o próximo. Mandar sempre `1` transformaria dez peças iguais
   *  em uma.
   *
   *  O painel clássico acumulava em memória (`scan.itens[sku]++`) e mandava
   *  o retrato inteiro no fim, por `PUT /contagem`. Aqui não: cada leitura
   *  grava na hora, pela mesma rota que o `+` da lista usa. É por isso que
   *  fechar a câmera, pausar ou perder a conexão não perde contagem — e é
   *  também por isso que NÃO existe rota de escrita nova nesta entrega. */
  async function aoBipar(codigoCru: string): Promise<ResultadoDaLeitura> {
    if (pausado) {
      return { ok: false, texto: 'O inventário está pausado. Toque em "Continuar" para contar.' };
    }
    /* Resolve contra o que se espera em casa. Não achou ali, manda o código
       normalizado assim mesmo: quem decide se ele existe é o SERVIDOR, e a
       recusa dele diz o motivo exato — fora do catálogo, kit sem saldo
       próprio, peça só de maleta. A tela chutando o motivo erraria. */
    const sku = resolverSku(codigoCru, esperadosPorSku);
    if (!sku) {
      const tentativa = String(codigoCru ?? '').trim().toUpperCase();
      if (!tentativa) return { ok: false, texto: 'Leitura vazia.' };
      const atual = contados.get(tentativa)?.contado ?? 0;
      return contar(tentativa, atual + 1, undefined, true);
    }
    const atual = contados.get(sku)?.contado ?? 0;
    return contar(sku, atual + 1, undefined, true);
  }

  async function descontar(sku: string) {
    setOcupado(sku);
    setErro('');
    await chamar(conexao, 'DELETE', `/api/inventarios/${id}/itens/${encodeURIComponent(sku)}`)
      .catch(() => null);
    setOcupado(null);
    detalhe.recarregar();
  }

  const cobertura = detalhe.dados?.cobertura;
  const pct = cobertura && cobertura.total > 0
    ? Math.round((cobertura.conferidos / cobertura.total) * 100)
    : 0;

  if (encerrado) {
    return (
      <section className="mq-card">
        <div className="mq-card__head">
          <div>
            <p className="mq-eyebrow">Contagem encerrada</p>
            <h2 className="mq-title">Revisão do inventário #{id}</h2>
            <p className="mq-lede">
              O retrato está congelado. Selecione as divergências comparáveis
              — o sistema calcula o ajuste, e nenhum é aplicado sem você.
            </p>
          </div>
          <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={aoSair}>
            Fechar
          </button>
        </div>
        {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
        <Resultado conexao={conexao} id={id} aoAplicar={aoMudar} />
      </section>
    );
  }

  return (
    <section className="mq-card mq-card--flush inventario-ativo">
      <header className="mq-card__head active-inventory-head">
        <div>
          <p className="mq-eyebrow">
            {pausado ? 'Inventário pausado' : 'Inventário em andamento'}
          </p>
          <h2 className="mq-title">Conferência do estoque em casa</h2>
          <p className="mq-lede">
            {cobertura
              ? `${cobertura.conferidos} de ${cobertura.total} itens conferidos`
              : 'carregando…'}
            {ultimaGravacao ? ` · última gravação ${fmtHora(ultimaGravacao)}` : ''}
          </p>
        </div>
        <div className="active-actions">
          {/* A CÂMERA é a primeira ação da contagem, e não um extra no
              rodapé: contar de pé, com o telefone, é o jeito normal de
              fazer isto — o teclado é a exceção. Some quando o inventário
              está pausado, porque pausado nada conta. */}
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
            <button
              type="button"
              className="mq-btn mq-btn--secondary"
              disabled={!!ocupado}
              onClick={() => acao(`/api/inventarios/${id}/pausar`)}
            >
              Pausar
            </button>
          ) : (
            <button
              type="button"
              className="mq-btn mq-btn--secondary"
              disabled={!!ocupado}
              onClick={() => acao(`/api/inventarios/${id}/retomar`)}
            >
              Continuar
            </button>
          )}
          <button
            type="button"
            className="mq-btn mq-btn--primary"
            disabled={!!ocupado}
            onClick={finalizar}
          >
            Finalizar inventário
          </button>
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoSair}>
            Fechar
          </button>
        </div>
      </header>

      <div className="mq-card__body inventory-progress">
        <span>
          <b style={{ width: `${pct}%` }} />
        </span>
        <strong>{pct}%</strong>
      </div>

      {pausado && (
        <p className="mq-note mq-note--warn">
          <Icone nome="alert" />
          <span>
            <b>Pausado.</b> Nada se perde — a contagem continua exatamente
            onde parou, e ninguém pode abrir um segundo inventário por cima
            dela.
          </span>
        </p>
      )}

      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

      {/* O leitor fica ACIMA da lista porque é de lá que a contagem entra
          quando ela está de pé. A lista continua inteira embaixo, e o
          número de cada linha muda sozinho a cada bipada. */}
      {camera && !pausado && (
        <div className="mq-card__body">
          <LeitorDeEtiquetas
            aoLer={aoBipar}
            aoFechar={() => setCamera(false)}
            /* Enquanto o servidor pergunta qual variação foi contada, a
               câmera para de ler. Sem isto ela continuaria bipando por trás
               do diálogo e enfileiraria respostas para uma pergunta que
               ainda não foi respondida. */
            pausado={!!perguntandoVariacao}
            titulo="Bipe cada peça que estiver aí"
            dica={'Cada leitura soma UMA unidade à peça. Pode bipar a mesma peça '
              + 'de novo para contar a segunda unidade — espere o bipe.'}
          />
        </div>
      )}

      <div className="mq-filters inventory-capture">
        <label className="mq-search">
          <Icone nome="search" />
          <input
            className="mq-input"
            type="search"
            placeholder="SKU ou nome da peça — bipe a etiqueta ou digite"
            aria-label="SKU ou nome da peça"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <span className="mq-filters__count">
          {lista.length} de {esperados.length} {plural(esperados.length, 'código', 'códigos')}
        </span>
      </div>

      <div className="mq-table inventory-count-list" role="table" aria-label="Itens contados">
        <div className="mq-tr mq-tr--head count-row" role="row">
          <span>Peça</span>
          <span className="mq-cell--num">Sistema</span>
          <span className="mq-cell--num">Contado</span>
          <span>Status</span>
          <span />
        </div>

        {lista.map((p) => {
          const c = contados.get(p.sku);
          const situacao = situacaoDaLinha(p, c?.contado);
          return (
            <div className="mq-tr count-row" role="row" key={p.sku}>
              <span className="mq-cell">
                <b>{p.sku} · {p.desc}</b>
                <small className="mq-sku">
                  {p.cat || 'sem categoria'}
                  {/* A frase que impede a dúvida mais cara da contagem: o
                      número da coluna "Sistema" NÃO é o estoque total. */}
                  {p.consignado > 0
                    ? ` · ${p.total} no total, ${p.consignado} com revendedoras`
                    : ''}
                </small>
              </span>

              <span className="mq-cell mq-cell--num" data-label="Sistema">
                <b className="mq-qty">{p.esperado}</b>
              </span>

              <span className="mq-cell mq-cell--num" data-label="Contado">
                <input
                  className="mq-input mq-inv-contagem"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-label={`Contagem de ${p.desc}`}
                  defaultValue={c ? c.contado : ''}
                  placeholder="—"
                  disabled={pausado || ocupado === p.sku}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === '') return;
                    const n = Number(v);
                    if (Number.isInteger(n) && n >= 0 && (!c || c.contado !== n)) contar(p.sku, n);
                  }}
                />
              </span>

              <span className="mq-cell" data-label="Status">
                <span className={situacao.classe}>{situacao.rotulo}</span>
              </span>

              <span className="mq-cell mq-cell--center">
                {c && (
                  <button
                    type="button"
                    className="mq-btn mq-btn--ghost mq-btn--sm"
                    disabled={pausado || ocupado === p.sku}
                    title="Voltar para não contado — que não é zero"
                    onClick={() => descontar(p.sku)}
                  >
                    Desfazer
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {perguntandoVariacao && (
        <DialogoDeVariacao
          pedido={perguntandoVariacao}
          aoCancelar={() => setPerguntandoVariacao(null)}
          aoConfirmar={(escolha) => {
            const pedido = perguntandoVariacao;
            setPerguntandoVariacao(null);
            contar(pedido.sku, pedido.contado, escolha);
          }}
        />
      )}

      <div className="mq-card__foot count-summary">
        <span><small>Faltando</small><strong>{resumo.faltando}</strong></span>
        <span><small>Sobrando</small><strong>{resumo.sobrando}</strong></span>
        <span><small>Conferidos</small><strong>{resumo.conferido}</strong></span>
        <span><small>Não conferidos</small><strong>{resumo.naoConferido}</strong></span>
      </div>
    </section>
  );
}

/** A hora da gravação, curta. A data não entra: quem lê isto está contando
 *  AGORA, e quer saber se o que gravou há dez minutos continua lá. */
function fmtHora(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
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

/* ──────────────────────────────────────────────────────── o resultado */

/** O RESULTADO da contagem.
 *
 *  O adaptador anterior lia `{ itens: [{ sistema, diferenca }] }` — três
 *  nomes que não existem na resposta. A tela dizia "Sem resultado para
 *  mostrar" em TODO inventário concluído, e o botão de ajustar mandava
 *  `POST /aplicar {}`, que aplica lista vazia e volta sem erro. O contrato
 *  real está em `./resultado.ts`; o backend não mudou uma linha.
 *
 *  As quatro listas são quatro coisas diferentes, e é por isso que elas não
 *  viram uma tabela só com uma coluna de diferença:
 *
 *    faltando/sobrando  têm diferença e PODEM ser corrigidas;
 *    não conferido      não foi contado — e não contado não é zero (D3);
 *    não comparável     foi contado sem dizer qual variação (D5).
 */
function Resultado({
  conexao, id, aoAplicar,
}: { conexao: Connection; id: number; aoAplicar: () => void }) {
  const r = useApi((s) => buscarResultado(conexao, id, s), [conexao, id]);
  const [erro, setErro] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [escolhidas, setEscolhidas] = useState<Set<string> | null>(null);

  const dados = r.dados;
  const pronto = temResultado(dados);
  const podeAjustar = pronto ? aplicaveis(dados) : [];
  const chave = (l: LinhaDeDiferenca) => `${l.sku}|${l.variacao ?? ''}`;

  /* Tudo marcado por padrão: o caminho comum é aceitar o retrato inteiro.
     Desmarcar é a exceção, e ela precisa existir — uma linha que a pessoa
     quer conferir de novo não pode obrigar a deixar todas as outras de fora. */
  const marcadas = escolhidas ?? new Set(podeAjustar.map(chave));
  const alvos = podeAjustar.filter((l) => marcadas.has(chave(l)));

  function alternar(l: LinhaDeDiferenca) {
    const nova = new Set(marcadas);
    if (nova.has(chave(l))) nova.delete(chave(l));
    else nova.add(chave(l));
    setEscolhidas(nova);
  }

  async function aplicar() {
    if (!alvos.length) return;
    if (!confirm(
      `Ajustar o estoque de ${alvos.length} ${plural(alvos.length, 'peça', 'peças')}?\n\n`
      + 'Cada ajuste vira uma saída sem faturamento amarrada a este inventário, '
      + 'com movimento na razão e estorno possível. Nada é apagado.',
    )) return;
    setAplicando(true);
    setErro('');
    const resposta = await aplicarAjustes(conexao, id, alvos.map(pedidoDaLinha))
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui aplicar.' }));
    setAplicando(false);
    if (resposta && 'erro' in resposta && resposta.erro) setErro(String(resposta.erro));
    else { setEscolhidas(null); r.recarregar(); aoAplicar(); }
  }

  if (r.erro) return <div className="mq-card__body"><ErrorState erro={r.erro} aoTentarDeNovo={r.recarregar} /></div>;

  return (
    <div className="mq-card__body mq-stack">
      {dados && !pronto && (
        <p className="mq-note mq-note--warn"><span>{(dados as { erro: string }).erro}</span></p>
      )}
      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

      {pronto && (
        <>
          <dl className="mq-figures">
            <div className="is-ok">
              <dt>Conferido</dt>
              <dd>{dados.conferido}</dd>
              <small>bateram exatamente</small>
            </div>
            <div className={dados.faltando.length ? 'is-risk' : ''}>
              <dt>Faltando</dt>
              <dd>{dados.faltando.length}</dd>
              <small>contou menos que o sistema</small>
            </div>
            <div className={dados.sobrando.length ? 'is-brand' : ''}>
              <dt>Sobrando</dt>
              <dd>{dados.sobrando.length}</dd>
              <small>contou mais que o sistema</small>
            </div>
            <div>
              <dt>Peças contadas</dt>
              <dd>{dados.pecasContadas}</dd>
              <small>
                {dados.cobertura.conferidos} de {dados.cobertura.total} códigos
              </small>
            </div>
          </dl>

          <ListaDeDiferenca
            titulo="Faltando"
            explica="Contou menos do que o sistema diz. O ajuste tira a diferença do estoque."
            linhas={dados.faltando}
            marcadas={marcadas}
            chave={chave}
            aoAlternar={alternar}
          />
          <ListaDeDiferenca
            titulo="Sobrando"
            explica="Contou mais do que o sistema diz. O ajuste devolve a diferença ao estoque."
            linhas={dados.sobrando}
            marcadas={marcadas}
            chave={chave}
            aoAlternar={alternar}
          />

          {dados.naoConferido.length > 0 && (
            <section>
              <h3 className="mq-subtitle">
                Não conferido · {dados.naoConferido.length}
              </h3>
              <p className="mq-hint">
                Estes códigos não foram contados. <b>Não contado não é zero</b>:
                o servidor recusa transformá-los em diferença, e é essa trava
                que impede um inventário parado pela metade de zerar meio
                catálogo.
              </p>
              <div className="mq-list">
                {dados.naoConferido.map((l) => (
                  <div className="mq-item" key={`${l.sku}|${l.variacao ?? ''}`}>
                    <span className="mq-item__icon"><Icone nome="box" /></span>
                    <span className="mq-item__main">
                      <b>{l.desc}</b>
                      <small>{l.sku}{l.variacao ? ` · ${l.variacao}` : ''}</small>
                    </span>
                    <span className="mq-item__side">
                      <b className="mq-qty">{l.esperado}</b>
                      <small>no sistema</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {dados.naoComparavel.length > 0 && (
            <section>
              <h3 className="mq-subtitle">
                Não comparável · {dados.naoComparavel.length}
              </h3>
              <p className="mq-hint">
                Contadas sem identidade suficiente. O código inteiro fica
                bloqueado até alguém dizer qual variação era — não se escreve
                estoque sobre uma dúvida.
              </p>
              <div className="mq-list">
                {dados.naoComparavel.map((l) => (
                  <div className="mq-item" key={`${l.sku}|${l.variacao ?? ''}|${l.naoIdentificado}`}>
                    <span className="mq-item__icon mq-item__icon--warn"><Icone nome="alert" /></span>
                    <span className="mq-item__main">
                      <b>{l.desc}</b>
                      <small>{l.sku}{l.variacao ? ` · ${l.variacao}` : ''} · {l.motivo}</small>
                    </span>
                    <span className="mq-item__side"><b className="mq-qty">{l.contado}</b></span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {podeAjustar.length > 0 ? (
            <div className="mq-btns">
              <button
                type="button"
                className="mq-btn mq-btn--primary"
                disabled={aplicando || alvos.length === 0}
                onClick={aplicar}
              >
                {aplicando
                  ? 'Ajustando…'
                  : `Ajustar ${alvos.length} ${plural(alvos.length, 'peça', 'peças')}`}
              </button>
              {alvos.length !== podeAjustar.length && (
                <button type="button" className="mq-btn mq-btn--ghost" onClick={() => setEscolhidas(null)}>
                  Marcar todas
                </button>
              )}
            </div>
          ) : (
            <p className="mq-hint">
              {dados.faltando.length + dados.sobrando.length === 0
                ? 'Nenhuma divergência: o que foi contado bate com o que o sistema diz.'
                : 'Todas as diferenças deste inventário já foram corrigidas.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Uma das duas listas corrigíveis. Elas têm a mesma forma e significados
 *  opostos, então compartilham o desenho e nunca o rótulo. */
function ListaDeDiferenca({
  titulo, explica, linhas, marcadas, chave, aoAlternar,
}: {
  titulo: string;
  explica: string;
  linhas: LinhaDeDiferenca[];
  marcadas: Set<string>;
  chave: (l: LinhaDeDiferenca) => string;
  aoAlternar: (l: LinhaDeDiferenca) => void;
}) {
  if (!linhas.length) return null;
  return (
    <section>
      <h3 className="mq-subtitle">{titulo} · {linhas.length}</h3>
      <p className="mq-hint">{explica}</p>
      <div className="mq-list">
        {linhas.map((l) => (
          <label className="mq-item" key={chave(l)}>
            <span className="mq-item__icon">
              <input
                type="checkbox"
                checked={l.aplicado ? false : marcadas.has(chave(l))}
                disabled={l.aplicado}
                aria-label={`Corrigir ${l.desc}`}
                onChange={() => aoAlternar(l)}
              />
            </span>
            <span className="mq-item__main">
              <b>{l.desc}</b>
              <small>
                {l.sku}{l.variacao ? ` · ${l.variacao}` : ''} · sistema {l.esperado} ·
                {' '}contado {l.contado}
                {l.aviso ? ` · ${l.aviso}` : ''}
              </small>
            </span>
            <span className="mq-item__side">
              <b className={l.dif < 0 ? 'mq-qty mq-money--risk' : 'mq-qty mq-money--ok'}>
                {l.dif > 0 ? '+' : ''}{l.dif}
              </b>
              {l.aplicado && <span className="mq-status mq-status--ok">corrigida</span>}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
