import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import type { Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { hojeISO, money, plural } from '../../domain/formato';
import { buscarEstrutura } from '../catalogo/variacoes';
import { opcoesDaEstrutura, type OpcaoDeVariacao } from '../vendas/carrinho';
import { TabelaDeSaidas } from './TabelaDeSaidas';
import { RegistrosAntigos } from './RegistrosAntigos';
import { ValorDaSaida } from './ValorDaSaida';
import { estornarSaida, listarSaidas, registrarSaida } from './api';
import { TIPOS_DE_SAIDA as TIPOS, type SaidaSemFaturamento, type TipoDeSaida } from './tipos';
import type { AppState } from '../../types/api';
import type { ProdutoDoEstado } from '../vendas/tipos';

/* Os quatro tipos, a forma da resposta e o adaptador moram em `./tipos.ts` e
   `./api.ts` desde a consolidacao: eram duas descricoes do mesmo JSON, uma
   aqui e outra no Financeiro, e elas ja divergiam em `estornada`. */

interface Props {
  conexao: Connection;
  estado: AppState | null;
  aoMudarEstoque: () => void;
  /** EMBUTIDA em "Nova venda › Saída sem faturamento". Nesse modo ela não
   *  desenha o cabeçalho grande — o seletor dos três modos já está acima —,
   *  mas o botão "Registrar saída" fica NO TOPO, à vista. Antes o formulário
   *  aparecia no fim da página, depois da lista inteira (QA 29/09/2026). */
  embutida?: boolean;
}

/** SAÍDAS SEM FATURAMENTO — a peça que saiu e não virou dinheiro.
 *
 *  §30. Elas existem para que a diferença entre "saiu do estoque" e "foi
 *  vendido" tenha nome. Sem este registro a diferença vira suspeita de
 *  furo, e alguém passa a tarde conferindo uma peça que foi dada de
 *  presente há duas semanas.
 *
 *  Nenhuma delas entra em faturamento, ticket médio, peças vendidas ou
 *  ranking de clientes — e isso é regra do backend, não escolha da tela.
 */
export function SaidasArea({
  conexao, estado, aoMudarEstoque, embutida = false,
}: Props) {
  const [filtro, setFiltro] = useState<TipoDeSaida | null>(null);
  const [incluirEstornadas, setIncluirEstornadas] = useState(true);
  const [busca, setBusca] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const lista = useApi(
    (s) => listarSaidas(conexao, {
      tipo: filtro, incluirEstornadas, busca, de: de || null, ate: ate || null,
    }, s),
    [conexao, filtro, incluirEstornadas, busca, de, ate],
  );
  const [registrando, setRegistrando] = useState(false);
  const [completando, setCompletando] = useState<SaidaSemFaturamento | null>(null);
  const [estornando, setEstornando] = useState<number | null>(null);
  const [recusa, setRecusa] = useState<{ id: number; texto: string } | null>(null);

  /** O estorno NÃO apaga a saída: ele grava o movimento inverso e deixa a
   *  original no histórico, marcada. Quem estorna precisa saber disso antes
   *  de clicar — e precisa dizer por quê. */
  async function estornar(sa: SaidaSemFaturamento) {
    const aviso = sa.estoqueRefletido
      ? 'A peça volta para o estoque e a saída continua no histórico, marcada.'
      : 'Esta linha só CLASSIFICA uma saída que já tinha acontecido — o estorno '
        + 'não devolve peça nenhuma ao estoque.';
    const motivo = prompt(
      `Estornar a ${sa.tipoRotulo.toLowerCase()} de ${sa.produto ?? sa.sku}?`
      + `\n\n${aviso}\n\nPor quê?`,
    );
    if (!motivo?.trim()) return;
    setEstornando(sa.id);
    setRecusa(null);
    const r = await estornarSaida(conexao, sa.id, motivo.trim())
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui estornar.' }));
    setEstornando(null);
    if (r && 'erro' in r && r.erro) setRecusa({ id: sa.id, texto: String(r.erro) });
    else { lista.recarregar(); aoMudarEstoque(); }
  }

  const produtos = (estado?.produtos ?? []) as unknown as ProdutoDoEstado[];
  const saidas = lista.dados?.saidas ?? [];

  return (
    <>
      {embutida && (
        <div className="saida-topo">
          <div>
            <h2 className="mq-title">Saída sem faturamento</h2>
            <p className="mq-lede">Brinde, uso próprio, perda ou sorteio: a peça sai do estoque e não vira venda.</p>
          </div>
          <button type="button" className="mq-btn mq-btn--primary" onClick={() => setRegistrando(true)}>
            <Icone nome="plus" />
            Registrar saída
          </button>
        </div>
      )}

      {!embutida && (
        <div className="mq-pagehead">
          <div className="mq-pagehead__text">
            <p className="mq-eyebrow">Estoque</p>
            <h1 className="mq-display">Saiu sem faturar</h1>
            <p className="mq-lede">
              Brinde, uso próprio, perda e sorteio. É o que explica a diferença
              entre o que saiu do estoque e o que foi vendido.
            </p>
          </div>
          <div className="mq-pagehead__actions">
            <button type="button" className="mq-btn mq-btn--primary" onClick={() => setRegistrando(true)}>
              <Icone nome="plus" />
              Registrar saída
            </button>
          </div>
        </div>
      )}

      <div className="mq-kpis">
        {TIPOS.map((t) => (
          <div className="mq-kpi" key={t.id}>
            <span className="mq-kpi__label">{t.rotulo}</span>
            <span className="mq-kpi__value">{lista.dados?.resumo?.[t.id] ?? 0}</span>
            <span className="mq-kpi__foot">{t.explica}</span>
          </div>
        ))}
        <div className="mq-kpi mq-kpi--accent">
          <span className="mq-kpi__label">Total sem faturar</span>
          <span className="mq-kpi__value">{lista.dados?.resumo?.total ?? 0}</span>
          <span className="mq-kpi__foot">
            peças · {lista.dados?.resumo?.estornadas ?? 0}{' '}
            {plural(lista.dados?.resumo?.estornadas ?? 0, 'estornada', 'estornadas')} fora da conta
          </span>
        </div>
      </div>

      <div className="mq-filters">
        <div className="mq-chipset" role="group" aria-label="Motivo">
          <button type="button" aria-pressed={filtro === null} onClick={() => setFiltro(null)}>
            Todos
          </button>
          {TIPOS.map((t) => (
            <button key={t.id} type="button" aria-pressed={filtro === t.id} onClick={() => setFiltro(t.id)}>
              {t.rotulo}
            </button>
          ))}
        </div>
        <div className="mq-chipset" role="group" aria-label="Estornadas">
          <button type="button" aria-pressed={incluirEstornadas} onClick={() => setIncluirEstornadas(true)}>
            Com estornadas
          </button>
          <button type="button" aria-pressed={!incluirEstornadas} onClick={() => setIncluirEstornadas(false)}>
            Só as que valem
          </button>
        </div>
        <label className="mq-search">
          <Icone nome="search" />
          <input
            className="mq-input"
            type="search"
            placeholder="Código, peça ou motivo"
            aria-label="Buscar saída"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <label className="saida-periodo">
          <span>De</span>
          <input className="mq-input" type="date" aria-label="Desde" value={de} max={ate || undefined}
            onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="saida-periodo">
          <span>Até</span>
          <input className="mq-input" type="date" aria-label="Até" value={ate} min={de || undefined}
            onChange={(e) => setAte(e.target.value)} />
        </label>
        <span className="mq-filters__count">
          {lista.carregando
            ? 'buscando…'
            : `${saidas.length} ${plural(saidas.length, 'lançamento', 'lançamentos')}`}
        </span>
      </div>

      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div>
            <h2 className="mq-title">Lançamentos</h2>
            <p className="mq-lede">
              Nenhum entra no faturamento.
            </p>
          </div>
        </div>

        {lista.erro ? (
          <ErrorState erro={lista.erro} aoTentarDeNovo={lista.recarregar} />
        ) : saidas.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="box" /></span>
            <h3>Nenhuma saída registrada</h3>
            <p>Quando uma peça sair sem virar venda, registre aqui — é o que evita procurar um furo que não existe.</p>
          </div>
        ) : (
          <TabelaDeSaidas
            saidas={saidas}
            aoCompletar={setCompletando}
            aoEstornar={estornar}
            estornando={estornando}
            recusa={recusa}
          />
        )}
      </section>

      <RegistrosAntigos legado={lista.dados?.legado ?? []} />

      {completando && (
        <ValorDaSaida
          conexao={conexao}
          saida={completando}
          aoFechar={() => setCompletando(null)}
          aoSalvar={() => { setCompletando(null); lista.recarregar(); }}
        />
      )}

      {registrando && (
        <FormSaida
          conexao={conexao}
          produtos={produtos}
          aoFechar={() => setRegistrando(false)}
          aoRegistrar={() => {
            setRegistrando(false);
            lista.recarregar();
            aoMudarEstoque();
          }}
        />
      )}
    </>
  );
}

/** O formulário de uma saída, sempre numa gaveta por cima da lista.
 *
 *  A ordem é a do balcão: o que aconteceu, qual peça (e qual variação,
 *  quando o código tem mais de uma), quantas, quando, e por quê. O valor da
 *  peça aparece antes de registrar — é ele que o Financeiro vai mostrar —, e
 *  quem grava o preço e o custo daquele momento é o servidor. */
function FormSaida({
  conexao, produtos, aoFechar, aoRegistrar,
}: {
  conexao: Connection;
  produtos: ProdutoDoEstado[];
  aoFechar: () => void;
  aoRegistrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoDeSaida>('brinde');
  const [busca, setBusca] = useState('');
  const [peca, setPeca] = useState<ProdutoDoEstado | null>(null);
  /* `null` = ainda lendo; `[]` = o código não tem variação a escolher. */
  const [variacoes, setVariacoes] = useState<OpcaoDeVariacao[] | null>([]);
  const [varianteId, setVarianteId] = useState('');
  const [qtd, setQtd] = useState(1);
  const [data, setData] = useState(hojeISO());
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setVarianteId('');
    if (!peca) { setVariacoes([]); return undefined; }
    const ctl = new AbortController();
    setVariacoes(null);
    buscarEstrutura(conexao, peca.sku, ctl.signal)
      .then((e) => setVariacoes(opcoesDaEstrutura(e?.variacoes)))
      .catch(() => { if (!ctl.signal.aborted) setVariacoes([]); });
    return () => ctl.abort();
  }, [conexao, peca]);

  const achados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    const exato = produtos.filter((p) => p.sku.toLowerCase() === t);
    const resto = produtos
      .filter((p) => p.sku.toLowerCase() !== t)
      .filter((p) => p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t));
    return [...exato, ...resto].slice(0, 8);
  }, [produtos, busca]);

  const variacao = (variacoes ?? []).find((v) => v.varianteId === varianteId) ?? null;
  const problemas: string[] = [];
  if (!peca) problemas.push('Escolha a peça que saiu.');
  if (peca && qtd > peca.disponivel) problemas.push(`${peca.desc}: só tem ${peca.disponivel} disponível.`);
  if ((variacoes ?? []).length > 1 && !variacao) problemas.push('Escolha qual variação saiu.');
  if (variacao && qtd > variacao.saldo) {
    problemas.push(`${variacao.nome}: só tem ${variacao.saldo} nesta variação.`);
  }
  if (!Number.isInteger(qtd) || qtd < 1) problemas.push('Quantidade tem que ser um número inteiro de peças.');
  if (!motivo.trim()) problemas.push('Diga o que aconteceu — sem motivo, a saída é indistinguível de um furo.');

  async function registrar() {
    if (!peca) return;
    setEnviando(true);
    setErro('');
    const r = await registrarSaida(conexao, {
      tipo, sku: peca.sku, qtd, data, motivo: motivo.trim(),
      ...(variacao ? { varianteId: variacao.varianteId, variacao: variacao.nome } : {}),
    }).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui registrar.' }));
    setEnviando(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoRegistrar();
  }

  const preco = peca && !peca.semPreco && peca.preco != null ? peca.preco : null;
  const custo = peca?.custo ?? null;

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-drawer" role="dialog" aria-modal="true" aria-label="Registrar saída sem faturamento">
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">Saída sem faturamento</p>
            <h2 className="mq-title">Registrar saída</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-drawer__body">
          <fieldset className="mq-fieldset">
            <legend>Motivo</legend>
            <div className="mq-chipset">
              {TIPOS.map((t) => (
                <button key={t.id} type="button" aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)}>
                  {t.rotuloLongo}
                </button>
              ))}
            </div>
            <p className="mq-hint">{TIPOS.find((t) => t.id === tipo)?.explica}</p>
          </fieldset>

          <fieldset className="mq-fieldset">
            <legend>Peça</legend>
            {peca ? (
              <p className="mq-chips">
                <span className="mq-chip mq-chip--brand">
                  {peca.desc} · {peca.sku} · {peca.disponivel} disponível
                  <button type="button" aria-label="Trocar peça" onClick={() => setPeca(null)}>×</button>
                </span>
              </p>
            ) : (
              <>
                <label className="mq-search">
                  <Icone nome="search" />
                  <input
                    className="mq-input"
                    type="search"
                    placeholder="Buscar peça por código ou nome"
                    aria-label="Buscar peça"
                    value={busca}
                    autoFocus
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </label>
                {achados.length > 0 && (
                  <div className="mq-list mq-list--compacta">
                    {achados.map((p) => (
                      <button type="button" className="mq-item" key={p.sku}
                        disabled={p.disponivel <= 0}
                        onClick={() => { setPeca(p); setBusca(''); setQtd(1); }}>
                        <span className="mq-item__main">
                          <b>{p.desc}</b>
                          <small>{p.sku} · {p.disponivel} disponível{p.semPreco ? ' · sem preço' : ` · ${money(p.preco)}`}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {peca && variacoes === null && <p className="mq-hint">Lendo as variações…</p>}
            {peca && (variacoes ?? []).length > 1 && (
              <label className="mq-field">
                <span>Qual variação saiu?</span>
                <select className="mq-select" value={varianteId} onChange={(e) => setVarianteId(e.target.value)}>
                  <option value="">Escolha…</option>
                  {(variacoes ?? []).map((v) => (
                    <option key={v.varianteId} value={v.varianteId} disabled={v.saldo <= 0}>
                      {v.nome} · {v.saldo} {plural(v.saldo, 'peça', 'peças')}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </fieldset>

          <div className="mq-grid mq-grid--2">
            <label className="mq-field">
              <span>Quantidade</span>
              <input
                className="mq-input"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={qtd}
                onChange={(e) => setQtd(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              />
            </label>
            <label className="mq-field">
              <span>Data</span>
              <input
                className="mq-input"
                type="date"
                value={data}
                max={hojeISO()}
                onChange={(e) => setData(e.target.value)}
              />
            </label>
          </div>

          <label className="mq-field">
            <span>O que aconteceu</span>
            <input
              className="mq-input"
              placeholder='ex.: "presente para a cliente Ana", "caiu e quebrou o fecho"'
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>

          {peca && (
            <dl className="mq-dl saida-valor">
              <div>
                <dt>Valor de venda</dt>
                <dd className="mq-money">
                  {preco == null ? 'não informado' : `${money(preco * qtd)} (${money(preco)} cada)`}
                </dd>
              </div>
              <div>
                <dt>Custo</dt>
                <dd className="mq-money">
                  {custo == null ? 'não informado — dá para completar depois' : `${money(custo * qtd)} (${money(custo)} cada)`}
                </dd>
              </div>
            </dl>
          )}

          <p className="mq-note mq-note--info">
            <Icone nome="alert" />
            <span>
              A peça sai do estoque e <b>não</b> entra em faturamento, ticket médio, peças vendidas nem
              ranking de clientes. O valor e o custo de hoje ficam gravados nesta saída.
            </span>
          </p>

          {problemas.length > 0 && (peca || busca) && (
            <div className="mq-note mq-note--warn">
              <Icone nome="alert" />
              <span>{problemas.map((x) => <span key={x} style={{ display: 'block' }}>{x}</span>)}</span>
            </div>
          )}
          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

          <div className="mq-btns">
            <button
              type="button"
              className="mq-btn mq-btn--primary"
              disabled={enviando || problemas.length > 0}
              onClick={registrar}
            >
              {enviando ? 'Registrando…' : 'Registrar saída'}
            </button>
            <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
