import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { fmtData, plural } from '../../domain/formato';
import {
  DialogoDeVariacao,
  type EscolhaDaVariacao,
  type PedidoDeVariacao,
} from './DialogoDeVariacao';
import { DialogoDeEncerramento, type EscolhaDoEncerramento } from './DialogoDeEncerramento';
import { ProgressoDaContagem } from './ProgressoDaContagem';
import { RevisaoDoInventario } from './RevisaoDoInventario';
import { TODAS, filtrarPorCategoria } from './progresso';
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
  /* A categoria filtrada vive AQUI, e não dentro do progresso, porque a
     lista da contagem segue o mesmo filtro: escolher "Brincos" no gráfico e
     continuar rolando 790 linhas seria oferecer meio filtro. */
  const [categoria, setCategoria] = useState<string>(TODAS);
  /* Finalizar deixou de ser um `confirm()`: ele não tem três saídas. */
  const [encerrando, setEncerrando] = useState(false);

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

  /* A busca e o filtro de categoria se somam, nesta ordem: a categoria
     recorta a prateleira, o texto acha a peça dentro dela. */
  const lista = useMemo(() => {
    const porCat = filtrarPorCategoria(esperados, categoria);
    const t = busca.trim().toLowerCase();
    if (!t) return porCat;
    return porCat.filter(
      (p) => p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t),
    );
  }, [esperados, busca, categoria]);

  const status = detalhe.dados?.status ?? 'aberto';
  const pausado = status === 'pausado';
  const encerrado = status === 'concluido' || status === 'cancelado';

  /** O resumo que o protótipo mostra no rodapé da contagem, e que a
   *  finalização repete antes de encerrar. São CONTAGENS DE CÓDIGO, e
   *  "não conferido" é a maior delas no começo — por construção.
   *
   *  `pecasContadas` é a única em PEÇAS, e vai junto porque o diálogo de
   *  encerramento precisa dizer o tamanho do trabalho que está sendo
   *  congelado: "184 peças" é o que a pessoa reconhece como a tarde dela. */
  const resumo = useMemo(() => {
    let conferido = 0, faltando = 0, sobrando = 0, pecasContadas = 0;
    for (const p of esperados) {
      const c = contados.get(p.sku);
      if (!c) continue;
      pecasContadas += c.contado;
      if (c.contado === p.esperado) conferido += 1;
      else if (c.contado < p.esperado) faltando += 1;
      else sobrando += 1;
    }
    return {
      conferido, faltando, sobrando, pecasContadas,
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

  /** FINALIZAR não pode ser um clique a seco — e não pode ser só um aviso.
   *
   *  Concluir congela o retrato: depois dele a contagem não muda mais. O
   *  que a versão anterior fazia era avisar, num `confirm()`, que os não
   *  conferidos continuariam incógnitas, e encerrar o assunto. O aviso
   *  estava certo e o fluxo estava incompleto: quem terminou de conferir a
   *  loja INTEIRA não tinha como dizer isso, e centenas de códigos ficavam
   *  sem resolução e sem caminho nenhum.
   *
   *  Agora a pergunta tem TRÊS saídas, desenhadas como escolhas com
   *  consequências diferentes — ver `DialogoDeEncerramento`. O que NENHUMA
   *  delas faz é mexer em estoque: mesmo declarar a contagem completa só
   *  muda o significado das linhas no retrato, e a resolução continua sendo
   *  um segundo ato, item a item, com motivo obrigatório. */
  async function finalizar(escolha: EscolhaDoEncerramento) {
    const ok = await acao(`/api/inventarios/${id}/concluir`, {
      contagemCompleta: escolha.contagemCompleta,
    });
    if (ok) setEncerrando(false);
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

  /* A COBERTURA continua vindo do servidor e continua sendo o texto do
     cabeçalho. A porcentagem saiu daqui: ela agora é calculada dentro de
     `ProgressoDaContagem`, junto com a fatia por categoria, para o número
     grande e as barras nunca discordarem por serem duas contas. */
  const cobertura = detalhe.dados?.cobertura;

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
        <RevisaoDoInventario conexao={conexao} id={id} aoAplicar={aoMudar} />
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
            onClick={() => setEncerrando(true)}
          >
            Finalizar inventário
          </button>
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoSair}>
            Fechar
          </button>
        </div>
      </header>

      {/* O PROGRESSO DA CONFERÊNCIA. Era uma barra de 6px com um número ao
          lado, que respondia "quanto falta" e mais nada: ela não sabia dizer
          QUAL parte do estoque ainda não tinha sido percorrida, e é essa a
          pergunta de quem está de pé na frente das gavetas. */}
      <ProgressoDaContagem
        esperados={esperados}
        contados={contados}
        categoria={categoria}
        aoFiltrar={setCategoria}
      />

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

      {encerrando && (
        <DialogoDeEncerramento
          resumo={resumo}
          ocupado={!!ocupado}
          aoConfirmar={finalizar}
          aoCancelar={() => setEncerrando(false)}
        />
      )}

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
