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
import type { AppState } from '../../types/api';
import type { ProdutoDoEstado } from '../vendas/tipos';

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

interface DetalheInventario {
  id: number;
  status: string;
  iniciadoEm: string;
  pausadoEm: string | null;
  concluidoEm: string | null;
  contagem: LinhaContada[];
  naoIdentificado: unknown[];
  cobertura: { conferidos: number; total: number };
}

interface Props {
  conexao: Connection;
  estado: AppState | null;
  aoMudarEstoque: () => void;
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
export function InventarioArea({ conexao, estado, aoMudarEstoque }: Props) {
  const lista = useApi(
    (s) => chamar<InventarioResumo[]>(conexao, 'GET', '/api/inventarios', undefined, { signal: s }),
    [conexao],
  );
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const [erroAcao, setErroAcao] = useState('');

  const emAndamento = (lista.dados ?? []).find((i) => i.status === 'aberto' || i.status === 'pausado');
  const idAtual = abertoId ?? emAndamento?.id ?? null;

  async function abrir() {
    setErroAcao('');
    const r = await chamar<{ id?: number; erro?: string }>(conexao, 'POST', '/api/inventarios', {})
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui abrir.' }));
    if (r && 'erro' in r && r.erro) { setErroAcao(String(r.erro)); return; }
    lista.recarregar();
    if (r && 'id' in r && r.id) setAbertoId(r.id);
  }

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Conferência física</p>
          <h1 className="mq-display">Inventário</h1>
          <p className="mq-lede">
            Contar o que existe de verdade, e comparar com o que o sistema
            acha que existe.
          </p>
        </div>
        {!emAndamento && (
          <div className="mq-pagehead__actions">
            <button type="button" className="mq-btn mq-btn--primary" onClick={abrir}>
              <Icone nome="plus" />
              Abrir inventário
            </button>
          </div>
        )}
      </div>

      <p className="mq-note mq-note--info">
        <Icone nome="alert" />
        <span>
          <b>Não contado não é zero.</b> Peça que ninguém conferiu fica de
          fora da conta; peça conferida e ausente vale zero, e isso é um
          resultado. Dá para pausar e continuar depois sem perder nada.
        </span>
      </p>

      {erroAcao && <p className="mq-note mq-note--risk" role="alert"><span>{erroAcao}</span></p>}
      {lista.erro ? <section className="mq-card"><ErrorState erro={lista.erro} aoTentarDeNovo={lista.recarregar} /></section> : null}

      {idAtual !== null ? (
        <Contagem
          conexao={conexao}
          id={idAtual}
          estado={estado}
          aoMudar={() => { lista.recarregar(); aoMudarEstoque(); }}
          aoSair={() => setAbertoId(null)}
        />
      ) : null}

      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div><h2 className="mq-title">Inventários</h2></div>
        </div>
        {(lista.dados ?? []).length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="inventory" /></span>
            <h3>Nenhum inventário ainda</h3>
            <p>Abra um quando for contar a loja. Ele pode ser pausado e retomado.</p>
          </div>
        ) : (
          <div className="mq-list">
            {(lista.dados ?? []).map((i) => (
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
}

/* ───────────────────────────────────────────────────────── a contagem */

function Contagem({
  conexao, id, estado, aoMudar, aoSair,
}: {
  conexao: Connection;
  id: number;
  estado: AppState | null;
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

  const produtos = (estado?.produtos ?? []) as unknown as ProdutoDoEstado[];
  const contados = useMemo(
    () => new Map((detalhe.dados?.contagem ?? []).map((c) => [c.sku, c])),
    [detalhe.dados],
  );

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return produtos
      .filter((p) => !t || p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t))
      .sort((a, b) => a.desc.localeCompare(b.desc));
  }, [produtos, busca]);

  const status = detalhe.dados?.status ?? 'aberto';
  const pausado = status === 'pausado';
  const encerrado = status === 'concluido' || status === 'cancelado';

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

  async function contar(sku: string, contado: number) {
    setOcupado(sku);
    setErro('');
    const r = await chamar<{ erro?: string }>(conexao, 'POST', `/api/inventarios/${id}/itens`, { sku, contado })
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui gravar a contagem.' }));
    setOcupado(null);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else detalhe.recarregar();
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

  return (
    <section className="mq-card mq-card--flush">
      <div className="mq-card__head">
        <div>
          <h2 className="mq-title">Inventário #{id}</h2>
          <p className="mq-lede">
            {cobertura
              ? `${cobertura.conferidos} de ${cobertura.total} códigos conferidos`
              : 'carregando…'}
            {pausado ? ' · pausado' : ''}
          </p>
        </div>
        <div className="mq-btns">
          {!encerrado && !pausado && (
            <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm"
              disabled={!!ocupado} onClick={() => acao(`/api/inventarios/${id}/pausar`)}>
              Pausar
            </button>
          )}
          {pausado && (
            <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm"
              disabled={!!ocupado} onClick={() => acao(`/api/inventarios/${id}/retomar`)}>
              Continuar
            </button>
          )}
          {!encerrado && (
            <button type="button" className="mq-btn mq-btn--primary mq-btn--sm"
              disabled={!!ocupado} onClick={() => acao(`/api/inventarios/${id}/concluir`)}>
              Concluir
            </button>
          )}
          <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={aoSair}>
            Fechar
          </button>
        </div>
      </div>

      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

      {encerrado ? (
        <Resultado conexao={conexao} id={id} aoAplicar={aoMudar} />
      ) : (
        <>
          <div className="mq-filters">
            <label className="mq-search">
              <Icone nome="search" />
              <input
                className="mq-input"
                type="search"
                placeholder="Buscar a peça que está na mão"
                aria-label="Buscar peça para contar"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            <span className="mq-filters__count">{lista.length} códigos</span>
          </div>

          <div className="mq-list">
            {lista.map((p) => {
              const c = contados.get(p.sku);
              const divergente = c && c.contado !== p.qtd;
              return (
                <div className="mq-item" key={p.sku}>
                  <span className={`mq-item__icon ${c ? (divergente ? 'mq-item__icon--warn' : 'mq-item__icon--ok') : ''}`}>
                    <Icone nome={c ? (divergente ? 'alert' : 'check') : 'box'} />
                  </span>
                  <span className="mq-item__main">
                    <b>{p.desc}</b>
                    <small>
                      {p.sku} · sistema diz {p.qtd}
                      {c ? ` · contado ${c.contado}` : ' · ainda não contado'}
                      {divergente ? ` · diferença ${c.contado - p.qtd > 0 ? '+' : ''}${c.contado - p.qtd}` : ''}
                    </small>
                  </span>
                  <span className="mq-item__side mq-inv-acoes">
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
        </>
      )}
    </section>
  );
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
