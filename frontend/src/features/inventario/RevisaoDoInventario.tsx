import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import type { Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { plural } from '../../domain/formato';
import {
  aplicarAjustes, buscarResultado, motivosDaLinha, pedidoDaLinha, temResultado,
  type LinhaDeDiferenca, type MotivoDeDiferenca, type ResultadoDoInventario,
} from './resultado';

/** O motivo escolhido para UMA linha. `texto` só existe no "Outro", e é ele
 *  que vira o rótulo — do mesmo jeito que o motivo do desconto na venda. */
interface EscolhaDeMotivo { id: string; texto: string }

const chaveDa = (l: LinhaDeDiferenca) => `${l.sku}|${l.variacao ?? ''}`;

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

  const dados = r.dados;
  const pronto = temResultado(dados);

  const pendentes = useMemo(
    () => (pronto ? [...dados.faltando, ...dados.sobrando].filter((l) => !l.aplicado) : []),
    [pronto, dados],
  );
  const resolvidas = useMemo(
    () => (pronto ? [...dados.faltando, ...dados.sobrando].filter((l) => l.aplicado) : []),
    [pronto, dados],
  );

  const alvos = pendentes.filter((l) => marcadas.has(chaveDa(l)));
  const semMotivo = pronto
    ? alvos.filter((l) => !rotuloFinal(dados.motivos, motivos.get(chaveDa(l))))
    : [];
  const prontasParaAplicar = alvos.length - semMotivo.length;

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
    if (!pronto || !alvos.length || semMotivo.length) return;
    const total = alvos.length;
    if (!confirm(
      `Resolver ${total} ${plural(total, 'diferença', 'diferenças')} e ajustar o estoque?\n\n`
      + 'Cada uma vira uma saída sem faturamento amarrada a este inventário, '
      + 'com movimento na razão, o motivo que você escolheu e estorno possível. '
      + 'Nada é apagado.',
    )) return;

    setAplicando(true);
    setErro('');
    const resposta = await aplicarAjustes(
      conexao, id,
      alvos.map((l) => pedidoDaLinha(l, rotuloFinal(dados.motivos, motivos.get(chaveDa(l))))),
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
              <> {c.bloqueadas} {plural(c.bloqueadas, 'código espera', 'códigos esperam')}{' '}
                alguém dizer de qual variação é — isso não é decisão de estoque.</>
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
              disabled={aplicando || alvos.length === 0 || semMotivo.length > 0}
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
            {dados.conferido} {plural(dados.conferido, 'código conferido', 'códigos conferidos')}{' '}
            sem diferença nenhuma
          </summary>
          {dados.conferidosItens.length === 0 ? (
            <p className="mq-hint">Nenhum código bateu exatamente neste inventário.</p>
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
              {plural(dados.naoConferido.length, 'código', 'códigos')} sem bipe
            </summary>
            <p className="mq-hint">
              {dados.contagemCompleta ? (
                <>
                  Você declarou a conferência completa, e mesmo assim estes
                  ficaram de fora — cada um diz por quê. <b>Nenhum vira
                  diferença</b>: o sistema não inventa de qual variação é uma
                  falta que ele não consegue atribuir.
                </>
              ) : (
                <>
                  Estes códigos não foram contados, e a contagem não foi
                  declarada completa. <b>Não contado não é zero</b>: nenhum
                  deles vira diferença, e é essa trava que impede um
                  inventário parado pela metade de zerar meio catálogo.
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
              {plural(dados.naoComparavel.length, 'código travado', 'códigos travados')}
            </summary>
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
          </details>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────── uma das duas listas que pedem ação */

function ListaParaResolver({
  titulo, tom, explica, linhas, motivosDisponiveis, marcadas, motivos,
  aoAlternar, aoMarcarTodas, aoDefinirMotivo,
}: {
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
            em {linhas.length} {plural(linhas.length, 'código', 'códigos')}. {explica}
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
                    {l.sku}{l.variacao ? ` · ${l.variacao}` : ''} · sistema {l.esperado} ·
                    {' '}contado {l.contado}
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
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export type { ResultadoDoInventario };
