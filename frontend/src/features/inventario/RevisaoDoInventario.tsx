import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import type { Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { plural } from '../../domain/formato';
import {
  aplicaveis, aplicarAjustes, buscarResultado, guardarVariacoes, motivosDaLinha, pedidoDaLinha, temResultado,
  type LinhaDeDiferenca, type MotivoDeDiferenca, type ResultadoDoInventario,
} from './resultado';

/** "nº21 2 · nº23 2 · sem variação 1" — o que ela contou por variação. */
const variacoesEmTexto = (l: Pick<LinhaDeDiferenca, 'variacoes' | 'naoInformada'>) => [
  ...(l.variacoes ?? []).filter((v) => (v.contado ?? 0) > 0).map((v) => `${v.nome} ${v.contado}`),
  ...((l.naoInformada?.contado ?? 0) > 0 ? [`sem variação ${l.naoInformada!.contado}`] : []),
].join(' · ');
const NAO_INFORMADA = '__nao_informada__';

/** O motivo escolhido para UMA linha. `texto` só existe no "Outro", e é ele
 *  que vira o rótulo — do mesmo jeito que o motivo do desconto na venda. */
interface EscolhaDeMotivo { id: string; texto: string }

const chaveDa = (l: LinhaDeDiferenca) => `${l.sku}|${l.variacao ?? ''}`;

/** §55 — o que a escolha vira. Sem `classe` na resposta (API antiga), toda
 *  diferença era perda, e a tela diz isso em vez de prometer ajuste. */
function classeDa(motivos: MotivoDeDiferenca[], e: EscolhaDeMotivo | undefined): 'ajuste' | 'perda' | null {
  if (!e || !e.id) return null;
  return motivos.find((m) => m.id === e.id)?.classe ?? 'perda';
}

/** O rótulo que efetivamente vai para o banco. String vazia = ainda não
 *  resolvida, e o botão de aplicar sabe contar isso. */
function rotuloFinal(motivos: MotivoDeDiferenca[], e: EscolhaDeMotivo | undefined): string {
  if (!e || !e.id) return '';
  if (e.id === 'outro') return e.texto.trim();
  return motivos.find((m) => m.id === e.id)?.rotulo ?? '';
}

/** REVISÃO DO INVENTÁRIO — a etapa que decide o que fazer com a diferença.
 *
 *  A tela anterior mostrava quatro números iguais em peso (conferido,
 *  faltando, sobrando, peças contadas) e, embaixo, quatro listas do mesmo
 *  tamanho. O efeito era que "642 códigos bateram" — que não pede nada de
 *  ninguém — ocupava o mesmo espaço que "14 peças sumiram", que é a única
 *  coisa ali que precisa de uma pessoa. E "Não conferido · 659" aparecia com
 *  uma explicação de por que nada podia ser feito, que é uma resposta
 *  honesta durante a contagem e um beco sem saída depois dela.
 *
 *  A regra da reorganização é uma frase:
 *
 *      o que está certo fica resumido; o que está errado recebe atenção.
 *
 *  Então a ordem da página é a ordem da decisão:
 *
 *   1. **quanto falta decidir** — a barra de conciliação, que responde
 *      "posso concluir este inventário agora?" sem obrigar ninguém a somar;
 *   2. **o que precisa de ação** — faltando e sobrando, com o motivo ali na
 *      linha e resolução em lote para quem tem centenas;
 *   3. **o que está resolvido ou não pede decisão** — recolhido em
 *      `<details>`: existe, é conferível, e não disputa a atenção.
 *
 *  O motivo é obrigatório e o servidor o exige: uma baixa de estoque sem
 *  explicação é indistinguível de erro de lançamento seis meses depois. Ele
 *  vai para `saidas_sem_faturamento.motivo` — a coluna que o schema chama de
 *  "rótulo curto e agrupável" — e de lá entra na razão dentro de
 *  `movimentos.obs`. Não é um campo que só existe nesta tela.
 */
export function RevisaoDoInventario({
  conexao, id, aoAplicar,
}: { conexao: Connection; id: number; aoAplicar: () => void }) {
  const r = useApi((s) => buscarResultado(conexao, id, s), [conexao, id]);
  const [erro, setErro] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [motivos, setMotivos] = useState<Map<string, EscolhaDeMotivo>>(new Map());
  /* O motivo do LOTE não é um segundo conceito: ele preenche os motivos das
     linhas marcadas. Um "motivo do lote" que vivesse separado criaria o
     estado em que a linha mostra um motivo e o servidor recebe outro. */
  const [motivoDoLote, setMotivoDoLote] = useState('');
  const [textoDoLote, setTextoDoLote] = useState('');
  /* A variação que ELA diz para a diferença de uma peça com variação cuja
     contagem teve peça sem variação. Sem isso a linha não é ajustada. */
  const [destinos, setDestinos] = useState<Map<string, string>>(new Map());
  const [guardando, setGuardando] = useState<string | null>(null);
  const [guardadas, setGuardadas] = useState<Set<string>>(new Set());

  const dados = r.dados;
  const pronto = temResultado(dados);

  /* `aplicaveis` mora no contrato porque a REGRA mora lá: uma linha já
     aplicada e não estornada é recusada pelo índice do banco, e mandá-la faria
     o servidor recusar o lote inteiro por causa dela. Refazer esse filtro
     aqui daria duas definições de "pendente" para divergirem. */
  const pendentes = useMemo(() => (pronto ? aplicaveis(dados) : []), [pronto, dados]);
  const resolvidas = useMemo(
    () => (pronto ? [...dados.faltando, ...dados.sobrando].filter((l) => l.aplicado) : []),
    [pronto, dados],
  );

  const alvos = pendentes.filter((l) => marcadas.has(chaveDa(l)));
  const semMotivo = pronto
    ? alvos.filter((l) => !rotuloFinal(dados.motivos, motivos.get(chaveDa(l))))
    : [];
  const semDestino = alvos.filter((l) => l.precisaVariacao && !destinos.get(chaveDa(l)));
  const prontasParaAplicar = alvos.length - semMotivo.length;
  const paraGuardar = pronto
    ? [...dados.faltando.filter((l) => l.aplicado), ...dados.sobrando.filter((l) => l.aplicado), ...dados.conferidosItens]
      .filter((l) => (l.distribuicaoContada?.length ?? 0) > 0 && !guardadas.has(l.sku))
    : [];

  async function guardar(sku: string) {
    setGuardando(sku);
    setErro('');
    const r = await guardarVariacoes(conexao, id, sku)
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui guardar.' }));
    setGuardando(null);
    if (r && 'erro' in r && r.erro) { setErro(String(r.erro)); return; }
    setGuardadas((g) => new Set(g).add(sku));
    aoAplicar();
  }

  function alternar(l: LinhaDeDiferenca) {
    const k = chaveDa(l);
    const nova = new Set(marcadas);
    if (nova.has(k)) nova.delete(k); else nova.add(k);
    setMarcadas(nova);
  }

  function marcarTodas(linhas: LinhaDeDiferenca[], ligar: boolean) {
    const nova = new Set(marcadas);
    for (const l of linhas) {
      if (ligar) nova.add(chaveDa(l)); else nova.delete(chaveDa(l));
    }
    setMarcadas(nova);
  }

  function definirMotivo(l: LinhaDeDiferenca, e: EscolhaDeMotivo) {
    const nova = new Map(motivos);
    nova.set(chaveDa(l), e);
    setMotivos(nova);
    /* Escolher um motivo é dizer que esta linha vai ser resolvida: marcar
       sozinho poupa o segundo clique sem nunca desmarcar nada. */
    if (e.id && !marcadas.has(chaveDa(l))) {
      const m = new Set(marcadas);
      m.add(chaveDa(l));
      setMarcadas(m);
    }
  }

  /** O LOTE. Aplica o motivo escolhido a todas as marcadas COMPATÍVEIS —
   *  um motivo de sobra não é escrito numa falta, mesmo em lote. */
  function aplicarMotivoAoLote() {
    if (!pronto || !motivoDoLote) return;
    const escolhido = dados.motivos.find((m) => m.id === motivoDoLote);
    if (!escolhido) return;
    const nova = new Map(motivos);
    for (const l of alvos) {
      const sentido = l.dif < 0 ? 'saida' : 'entrada';
      if (escolhido.sentido !== 'ambos' && escolhido.sentido !== sentido) continue;
      nova.set(chaveDa(l), { id: escolhido.id, texto: textoDoLote });
    }
    setMotivos(nova);
  }

  async function aplicar() {
    if (!pronto || !alvos.length || semMotivo.length || semDestino.length) return;
    const total = alvos.length;
    const perdas = alvos.filter((l) => classeDa(dados.motivos, motivos.get(chaveDa(l))) === 'perda').length;
    if (!confirm(
      `Resolver ${total} ${plural(total, 'diferença', 'diferenças')} e ajustar o estoque?\n\n`
      + 'Cada uma vira um ajuste de inventário no histórico da peça, com o motivo que você escolheu. '
      + (perdas
        ? `${perdas} ${plural(perdas, 'marcada', 'marcadas')} como perda também ${perdas === 1 ? 'entra' : 'entram'} em "Saiu sem faturar". `
        : 'Nenhuma é registrada como perda. ')
      + 'Nada é apagado.',
    )) return;

    setAplicando(true);
    setErro('');
    const resposta = await aplicarAjustes(
      conexao, id,
      alvos.map((l) => pedidoDaLinha(
        l, rotuloFinal(dados.motivos, motivos.get(chaveDa(l))), motivos.get(chaveDa(l))?.id,
        l.precisaVariacao
          ? (destinos.get(chaveDa(l)) === NAO_INFORMADA ? '' : destinos.get(chaveDa(l)) ?? null)
          : null,
      )),
    ).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui aplicar.' }));
    setAplicando(false);

    if (resposta && 'erro' in resposta && resposta.erro) { setErro(String(resposta.erro)); return; }
    setMarcadas(new Set());
    setMotivos(new Map());
    setMotivoDoLote('');
    setTextoDoLote('');
    r.recarregar();
    aoAplicar();
  }

  if (r.erro) {
    return <div className="mq-card__body"><ErrorState erro={r.erro} aoTentarDeNovo={r.recarregar} /></div>;
  }

  if (dados && !pronto) {
    return (
      <div className="mq-card__body">
        <p className="mq-note mq-note--warn"><span>{(dados as { erro: string }).erro}</span></p>
      </div>
    );
  }
  if (!pronto) return <div className="mq-card__body"><p className="mq-hint">carregando…</p></div>;

  const c = dados.conciliacao;
  const pctConciliado = c.divergencias > 0
    ? Math.round((c.resolvidas / c.divergencias) * 100)
    : 100;

  return (
    <div className="mq-card__body mq-stack revisao">
      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

      {/* ── 1. QUANTO FALTA DECIDIR ─────────────────────────────────────
          A primeira coisa da página responde à última pergunta da pessoa:
          posso concluir este inventário agora? */}
      <section className={`revisao-conciliacao${c.conciliado ? ' is-pronta' : ''}`}>
        <div className="revisao-conciliacao__texto">
          <p className="mq-eyebrow">Conciliação</p>
          {c.divergencias === 0 ? (
            <h3 className="mq-title">Nenhuma divergência para resolver</h3>
          ) : (
            <h3 className="mq-title">
              {c.resolvidas} de {c.divergencias}{' '}
              {plural(c.divergencias, 'divergência resolvida', 'divergências resolvidas')}
            </h3>
          )}
          <p className="mq-hint">
            {c.conciliado
              ? 'Tudo que pedia decisão já foi resolvido com um motivo no histórico.'
              : `Faltam ${c.pendentes} ${plural(c.pendentes, 'decisão', 'decisões')} sua.`}
            {c.bloqueadas > 0 && (
              <> {c.bloqueadas} {plural(c.bloqueadas, 'peça espera', 'peças esperam')}{' '}
                alguém dizer de qual variação é.</>
            )}
          </p>
        </div>
        <div className="revisao-conciliacao__barra">
          <span className={c.conciliado ? 'mq-meter mq-meter--ok' : 'mq-meter'}>
            <i style={{ width: `${pctConciliado}%` }} />
          </span>
          <strong>{pctConciliado}%</strong>
        </div>
      </section>

      {/* A declaração, dita em voz alta: é ela que explica por que um código
          que ninguém bipou está na lista de faltantes. */}
      {dados.contagemCompleta && (
        <p className="mq-note mq-note--info">
          <Icone nome="check" />
          <span>
            <b>A conferência foi declarada completa.</b> Você afirmou ter
            olhado fisicamente todo o estoque deste inventário — por isso
            peças que o sistema tem e que ninguém bipou entram abaixo como
            divergência, e não como incógnita.
          </span>
        </p>
      )}

      {/* ── 2. O QUE PRECISA DE AÇÃO ────────────────────────────────── */}
      {pendentes.length > 0 ? (
        <>
          <div className="revisao-secoes">
            <ListaParaResolver
              titulo="Faltando"
              tom="risk"
              explica="Você contou menos do que o sistema diz. Resolver tira a diferença do estoque — só a diferença, nunca o saldo inteiro."
              linhas={dados.faltando.filter((l) => !l.aplicado)}
              motivosDisponiveis={dados.motivos}
              marcadas={marcadas}
              motivos={motivos}
              aoAlternar={alternar}
              aoMarcarTodas={marcarTodas}
              aoDefinirMotivo={definirMotivo}
              destinos={destinos}
              aoDefinirDestino={(l, v) => setDestinos((m) => new Map(m).set(chaveDa(l), v))}
            />
            <ListaParaResolver
              titulo="Sobrando"
              tom="brand"
              explica="Você contou mais do que o sistema diz. Resolver devolve a diferença ao estoque, e também precisa de um motivo."
              linhas={dados.sobrando.filter((l) => !l.aplicado)}
              motivosDisponiveis={dados.motivos}
              marcadas={marcadas}
              motivos={motivos}
              aoAlternar={alternar}
              aoMarcarTodas={marcarTodas}
              aoDefinirMotivo={definirMotivo}
              destinos={destinos}
              aoDefinirDestino={(l, v) => setDestinos((m) => new Map(m).set(chaveDa(l), v))}
            />
          </div>

          {/* A BARRA DE AÇÃO. Fica colada no rodapé porque com centenas de
              linhas o botão estaria a três telas de distância do que a
              pessoa acabou de marcar. */}
          <div className="revisao-acao" role="group" aria-label="Resolver as diferenças selecionadas">
            <p className="revisao-acao__conta">
              <strong>{alvos.length}</strong>
              <small>
                {alvos.length === 0
                  ? 'nenhuma selecionada'
                  : `${plural(alvos.length, 'selecionada', 'selecionadas')}`}
                {semMotivo.length > 0 && (
                  <> · <b>{semMotivo.length} sem motivo</b></>
                )}
                {semDestino.length > 0 && (
                  <> · <b>{semDestino.length} sem a variação</b></>
                )}
              </small>
            </p>

            <label className="mq-field revisao-acao__motivo">
              <span>Aplicar um motivo a todas as selecionadas</span>
              <select
                className="mq-select"
                value={motivoDoLote}
                disabled={alvos.length === 0}
                onChange={(e) => setMotivoDoLote(e.target.value)}
              >
                <option value="">Escolha um motivo…</option>
                {dados.motivos.map((m) => (
                  <option key={m.id} value={m.id}>{m.rotulo}</option>
                ))}
              </select>
            </label>

            {motivoDoLote === 'outro' && (
              <label className="mq-field revisao-acao__livre">
                <span>Qual?</span>
                <input
                  className="mq-input"
                  maxLength={60}
                  value={textoDoLote}
                  placeholder="Escreva o que aconteceu"
                  onChange={(e) => setTextoDoLote(e.target.value)}
                />
              </label>
            )}

            <button
              type="button"
              className="mq-btn mq-btn--secondary"
              disabled={!motivoDoLote || alvos.length === 0
                || (motivoDoLote === 'outro' && !textoDoLote.trim())}
              onClick={aplicarMotivoAoLote}
            >
              Aplicar aos selecionados
            </button>

            <button
              type="button"
              className="mq-btn mq-btn--primary"
              disabled={aplicando || alvos.length === 0 || semMotivo.length > 0 || semDestino.length > 0}
              onClick={aplicar}
            >
              {aplicando
                ? 'Ajustando…'
                : `Resolver ${prontasParaAplicar} ${plural(prontasParaAplicar, 'diferença', 'diferenças')}`}
            </button>
          </div>
        </>
      ) : (
        <p className="mq-note mq-note--ok">
          <Icone nome="check" />
          <span>
            {c.divergencias === 0
              ? 'Nenhuma divergência: o que você contou bate com o que o sistema diz.'
              : 'Todas as diferenças deste inventário já foram resolvidas, cada uma com o motivo no histórico da peça.'}
          </span>
        </p>
      )}

      {/* ── 3. O QUE NÃO PEDE DECISÃO ──────────────────────────────────
          Recolhido: existe, é conferível, e não disputa atenção com o que
          precisa de uma pessoa. */}
      {paraGuardar.length > 0 && (
        <section className="revisao-guardar" aria-label="Variações contadas">
          <h3 className="mq-subtitle">Variações contadas</h3>
          <p className="mq-hint">
            Guardar no cadastro o que você contou em cada variação. O que ninguém
            disse fica como "variação não informada"; o total não muda.
          </p>
          <div className="mq-list">
            {paraGuardar.map((l) => (
              <div className="mq-item" key={l.sku}>
                <span className="mq-item__main">
                  <b>{l.desc}</b>
                  <small>Código {l.sku} · {variacoesEmTexto(l)}</small>
                </span>
                <span className="mq-item__side">
                  <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm"
                    disabled={guardando === l.sku} onClick={() => guardar(l.sku)}>
                    {guardando === l.sku ? 'Guardando…' : 'Guardar no cadastro'}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="revisao-resumos">
        {resolvidas.length > 0 && (
          <details className="revisao-resumo">
            <summary>
              <span className="mq-status mq-status--ok">Resolvidas</span>
              {resolvidas.length} {plural(resolvidas.length, 'diferença', 'diferenças')} já ajustadas
            </summary>
            <div className="mq-list">
              {resolvidas.map((l) => (
                <div className="mq-item" key={chaveDa(l)}>
                  <span className="mq-item__icon mq-item__icon--ok"><Icone nome="check" /></span>
                  <span className="mq-item__main">
                    <b>{l.desc}</b>
                    <small>
                      {l.sku}{l.variacao ? ` · ${l.variacao}` : ''}
                      {l.motivoAplicado ? ` · ${l.motivoAplicado}` : ''}
                    </small>
                  </span>
                  <span className="mq-item__side">
                    {l.classeAplicada && (
                      <span className={`mq-status ${l.classeAplicada === 'perda' ? 'mq-status--warn' : ''}`}>
                        {l.classeAplicada === 'perda' ? 'Perda' : 'Ajuste de inventário'}
                      </span>
                    )}
                    <b className="mq-qty">{l.dif > 0 ? '+' : ''}{l.dif}</b>
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        <details className="revisao-resumo">
          <summary>
            <span className="mq-status mq-status--ok">Bateram</span>
            {dados.conferido} {plural(dados.conferido, 'peça conferida', 'peças conferidas')}{' '}
            sem diferença nenhuma
          </summary>
          {dados.conferidosItens.length === 0 ? (
            <p className="mq-hint">Nenhuma peça bateu exatamente neste inventário.</p>
          ) : (
            <div className="mq-list">
              {dados.conferidosItens.map((l) => (
                <div className="mq-item" key={`${l.sku}|${l.variacao ?? ''}`}>
                  <span className="mq-item__icon mq-item__icon--ok"><Icone nome="check" /></span>
                  <span className="mq-item__main">
                    <b>{l.desc}</b>
                    <small>
                      {l.sku}{l.variacao ? ` · ${l.variacao}` : ''}
                      {l.aviso ? ` · ${l.aviso}` : ''}
                    </small>
                  </span>
                  <span className="mq-item__side"><b className="mq-qty">{l.contado}</b></span>
                </div>
              ))}
            </div>
          )}
        </details>

        {dados.naoConferido.length > 0 && (
          <details className="revisao-resumo">
            <summary>
              <span className="mq-status mq-status--open">Não conferido</span>
              {dados.naoConferido.length}{' '}
              {plural(dados.naoConferido.length, 'peça', 'peças')} sem conferência
            </summary>
            <p className="mq-hint">
              {dados.contagemCompleta ? (
                <>
                  Estas peças ficaram de fora mesmo com a conferência declarada
                  completa — cada uma diz por quê. <b>Nenhuma vira diferença</b>.
                </>
              ) : (
                <>
                  Estas peças não foram conferidas. <b>Não conferida não é
                  falta</b>: o estoque delas não mudou.
                </>
              )}
            </p>
            <div className="mq-list">
              {dados.naoConferido.map((l) => (
                <div className="mq-item" key={`${l.sku}|${l.variacao ?? ''}`}>
                  <span className="mq-item__icon"><Icone nome="box" /></span>
                  <span className="mq-item__main">
                    <b>{l.desc}</b>
                    <small>
                      {l.sku}{l.variacao ? ` · ${l.variacao}` : ''}
                      {l.motivo ? ` · ${l.motivo}` : ''}
                    </small>
                  </span>
                  <span className="mq-item__side">
                    <b className="mq-qty">{l.esperado}</b>
                    <small>no sistema</small>
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        {dados.naoComparavel.length > 0 && (
          <details className="revisao-resumo">
            <summary>
              <span className="mq-status mq-status--warn">Não comparável</span>
              {dados.naoComparavel.length}{' '}
              {plural(dados.naoComparavel.length, 'peça sem variação dita', 'peças sem variação dita')}
            </summary>
            <p className="mq-hint">
              Contadas sem dizer a variação, num inventário antigo. O estoque
              delas não muda até alguém dizer qual variação era.
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
          </details>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────── uma das duas listas que pedem ação */

function ListaParaResolver({
  titulo, tom, explica, linhas, motivosDisponiveis, marcadas, motivos,
  aoAlternar, aoMarcarTodas, aoDefinirMotivo, destinos, aoDefinirDestino,
}: {
  destinos: Map<string, string>;
  aoDefinirDestino: (l: LinhaDeDiferenca, v: string) => void;
  titulo: string;
  tom: 'risk' | 'brand';
  explica: string;
  linhas: LinhaDeDiferenca[];
  motivosDisponiveis: MotivoDeDiferenca[];
  marcadas: Set<string>;
  motivos: Map<string, EscolhaDeMotivo>;
  aoAlternar: (l: LinhaDeDiferenca) => void;
  aoMarcarTodas: (linhas: LinhaDeDiferenca[], ligar: boolean) => void;
  aoDefinirMotivo: (l: LinhaDeDiferenca, e: EscolhaDeMotivo) => void;
}) {
  if (!linhas.length) return null;
  const todasMarcadas = linhas.every((l) => marcadas.has(chaveDa(l)));
  const pecas = linhas.reduce((s, l) => s + Math.abs(l.dif), 0);

  return (
    <section className={`revisao-lista revisao-lista--${tom}`}>
      <header>
        <div>
          <h3 className="mq-subtitle">
            {titulo} · {pecas} {plural(pecas, 'peça', 'peças')}
          </h3>
          <p className="mq-hint">
            em {linhas.length} {plural(linhas.length, 'peça', 'peças')}. {explica}
          </p>
        </div>
        <label className="revisao-todas">
          <input
            type="checkbox"
            checked={todasMarcadas}
            onChange={() => aoMarcarTodas(linhas, !todasMarcadas)}
          />
          <span>Selecionar {linhas.length}</span>
        </label>
      </header>

      <div className="mq-list">
        {linhas.map((l) => {
          const k = chaveDa(l);
          const escolha = motivos.get(k);
          const oferecidos = motivosDaLinha(motivosDisponiveis, l.dif);
          return (
            <div className={`revisao-linha${marcadas.has(k) ? ' is-on' : ''}`} key={k}>
              <label className="revisao-linha__peca">
                <input
                  type="checkbox"
                  checked={marcadas.has(k)}
                  aria-label={`Resolver ${l.desc}`}
                  onChange={() => aoAlternar(l)}
                />
                <span>
                  <b>{l.desc}</b>
                  <small>
                    Código {l.sku}{l.variacao ? ` · ${l.variacao}` : ''} · em casa {l.esperado} ·
                    {' '}conferido {l.contado}
                    {variacoesEmTexto(l) ? ` · ${variacoesEmTexto(l)}` : ''}
                    {l.aviso ? ` · ${l.aviso}` : ''}
                  </small>
                  {/* A diferença de uma peça que NINGUÉM bipou tem uma
                      história diferente da de uma peça contada a menos, e a
                      linha diz qual é qual. */}
                  {l.declarado && (
                    <small className="revisao-linha__declarado">
                      <Icone nome="alert" /> não foi bipada — virou diferença
                      porque você declarou a conferência completa
                    </small>
                  )}
                </span>
              </label>

              <span className="revisao-linha__dif">
                <b className={l.dif < 0 ? 'mq-qty mq-money--risk' : 'mq-qty mq-money--ok'}>
                  {l.dif > 0 ? '+' : ''}{l.dif}
                </b>
              </span>

              <span className="revisao-linha__motivo">
                <select
                  className="mq-select"
                  aria-label={`Motivo da diferença de ${l.desc}`}
                  value={escolha?.id ?? ''}
                  onChange={(e) => aoDefinirMotivo(l, { id: e.target.value, texto: escolha?.texto ?? '' })}
                >
                  <option value="">O que aconteceu?</option>
                  {oferecidos.map((m) => (
                    <option key={m.id} value={m.id}>{m.rotulo}</option>
                  ))}
                </select>
                {escolha?.id && (
                  <small className="mq-hint" data-classe={classeDa(motivosDisponiveis, escolha) ?? ''}>
                    {classeDa(motivosDisponiveis, escolha) === 'perda'
                      ? 'Vira perda (entra em Saiu sem faturar).'
                      : 'Vira ajuste de inventário — não é perda.'}
                  </small>
                )}
                {escolha?.id === 'outro' && (
                  <input
                    className="mq-input"
                    maxLength={60}
                    placeholder="Escreva o motivo"
                    aria-label={`Motivo escrito para ${l.desc}`}
                    value={escolha.texto}
                    onChange={(e) => aoDefinirMotivo(l, { id: 'outro', texto: e.target.value })}
                  />
                )}
                {l.precisaVariacao && (
                  <select
                    className="mq-select"
                    aria-label={`Variação da diferença de ${l.desc}`}
                    value={destinos.get(k) ?? ''}
                    onChange={(e) => aoDefinirDestino(l, e.target.value)}
                  >
                    <option value="">De qual variação é a {l.dif < 0 ? 'falta' : 'sobra'}?</option>
                    {(l.variacoes ?? []).map((v) => <option key={v.nome} value={v.nome}>{v.nome}</option>)}
                    <option value={NAO_INFORMADA}>Variação não informada</option>
                  </select>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export type { ResultadoDoInventario };
