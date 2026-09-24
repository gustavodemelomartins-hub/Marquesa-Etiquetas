import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import type { Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { fmtData, hojeISO, plural } from '../../domain/formato';
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
  /** EMBUTIDA em "Novo lançamento", que é onde o protótipo a põe. Nesse
   *  modo ela não desenha cabeçalho próprio — "Operação do dia · Novo
   *  lançamento" já está acima, junto com o seletor dos três modos — e
   *  abre direto no formulário, que é o que a pessoa foi fazer ali. */
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
  const lista = useApi(
    (s) => listarSaidas(conexao, { tipo: filtro, incluirEstornadas }, s),
    [conexao, filtro, incluirEstornadas],
  );
  const [registrando, setRegistrando] = useState(embutida);
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
              Cada um vira um movimento na razão do estoque, e nenhum entra em
              faturamento.
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
          <div className="mq-scroll-x">
            <div className="mq-table" role="table" aria-label="Saídas sem faturamento">
              <div className="mq-tr mq-tr--head" role="row" style={COLUNAS}>
                <span>Data</span><span>Motivo</span><span>Peça e explicação</span>
                <span>Peças</span><span>Estado</span><span>Ações</span>
              </div>
              {saidas.map((s) => (
                <div className="mq-tr" role="row" key={s.id} style={COLUNAS}>
                  <span className="mq-cell"><b className="mq-date">{fmtData(s.data)}</b></span>
                  <span className="mq-cell">
                    <span className={s.tipo === 'perda' ? 'mq-chip' : 'mq-chip mq-chip--soft'}>
                      {s.tipoRotulo}
                    </span>
                    {s.sentido === 'entrada' && <small>devolução de sobra</small>}
                  </span>
                  <span className="mq-cell">
                    <b>{s.produto ?? s.sku}</b>
                    <small>
                      {s.sku}
                      {s.motivo ? ` · ${s.motivo}` : ''}
                      {s.inventarioId != null ? ` · contagem #${s.inventarioId}` : ''}
                      {s.origemUsuario ? ` · ${s.origemUsuario}` : ''}
                    </small>
                  </span>
                  <span className="mq-cell mq-cell--num"><b className="mq-qty">{s.qtd}</b></span>
                  <span className="mq-cell">
                    {s.estornada ? (
                      <>
                        <span className="mq-status">estornada</span>
                        <small>
                          {fmtData(s.estornoEm)}
                          {s.estornoMotivo ? ` · ${s.estornoMotivo}` : ''}
                        </small>
                      </>
                    ) : (
                      <>
                        <span className="mq-status mq-status--warn">concluída</span>
                        {!s.estoqueRefletido && <small>só classifica — não baixou estoque</small>}
                      </>
                    )}
                  </span>
                  <span className="mq-cell">
                    {!s.estornada && (
                      <button
                        type="button"
                        className="mq-btn mq-btn--ghost mq-btn--sm"
                        disabled={estornando === s.id}
                        onClick={() => estornar(s)}
                      >
                        Estornar
                      </button>
                    )}
                    {recusa?.id === s.id && <small className="mq-money--risk">{recusa.texto}</small>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {registrando && (
        <FormSaida
          conexao={conexao}
          produtos={produtos}
          embutida={embutida}
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

const COLUNAS = {
  gridTemplateColumns: 'minmax(0,0.8fr) minmax(0,1fr) minmax(0,1.8fr) 64px minmax(0,1fr) auto',
};

function FormSaida({
  conexao, produtos, aoFechar, aoRegistrar, embutida = false,
}: {
  conexao: Connection;
  produtos: ProdutoDoEstado[];
  aoFechar: () => void;
  aoRegistrar: () => void;
  /** EMBUTIDA em Lançamentos: cartão no fluxo, e não gaveta modal.
   *
   *  A gaveta cobria o seletor dos três modos com um scrim — justamente o
   *  que o protótipo mantém na tela para quem quiser trocar de ideia. Fora
   *  de Lançamentos (Estoque, Financeiro) ela continua gaveta, porque ali
   *  é uma ação sobre uma lista que fica atrás. */
  embutida?: boolean;
}) {
  const [tipo, setTipo] = useState<TipoDeSaida>('brinde');
  const [busca, setBusca] = useState('');
  const [peca, setPeca] = useState<ProdutoDoEstado | null>(null);
  const [qtd, setQtd] = useState(1);
  const [data, setData] = useState(hojeISO());
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const achados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    return produtos
      .filter((p) => p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t))
      .slice(0, 8);
  }, [produtos, busca]);

  const problemas: string[] = [];
  if (!peca) problemas.push('Escolha a peça que saiu.');
  if (peca && qtd > peca.disponivel) problemas.push(`${peca.desc}: só tem ${peca.disponivel} disponível.`);
  if (qtd < 1) problemas.push('Quantidade tem que ser pelo menos 1.');
  if (!motivo.trim()) problemas.push('Diga o que aconteceu — sem motivo, a saída é indistinguível de um furo.');

  async function registrar() {
    if (!peca) return;
    setEnviando(true);
    setErro('');
    const r = await registrarSaida(conexao, {
      tipo, sku: peca.sku, qtd, data, motivo: motivo.trim(),
    }).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui registrar.' }));
    setEnviando(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoRegistrar();
  }

  const cabeca = (
    <div className="mq-drawer__head">
      <div>
        <p className="mq-eyebrow">Estoque</p>
        <h2 className="mq-title">Registrar saída</h2>
      </div>
      {/* Embutida não tem "fechar": não há nada por baixo para voltar.
          Quem desiste troca de modo no seletor, que está logo acima. */}
      {!embutida && (
        <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
          <Icone nome="close" />
        </button>
      )}
    </div>
  );

  const corpo = (
    <>
      {cabeca}

        <div className="mq-drawer__body">
          <fieldset className="mq-fieldset">
            <legend>O que aconteceu</legend>
            <div className="mq-chipset">
              {TIPOS.map((t) => (
                <button key={t.id} type="button" aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)}>
                  {t.rotulo}
                </button>
              ))}
            </div>
            <p className="mq-hint">{TIPOS.find((t) => t.id === tipo)?.explica}</p>
          </fieldset>

          {peca ? (
            <p className="mq-chips">
              <span className="mq-chip mq-chip--brand">
                {peca.desc} · {peca.disponivel} disponível
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
                  onChange={(e) => setBusca(e.target.value)}
                />
              </label>
              {achados.length > 0 && (
                <div className="mq-list mq-list--compacta">
                  {achados.map((p) => (
                    <button type="button" className="mq-item" key={p.sku} onClick={() => { setPeca(p); setBusca(''); }}>
                      <span className="mq-item__main">
                        <b>{p.desc}</b>
                        <small>{p.sku} · {p.disponivel} disponível</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="mq-grid mq-grid--2">
            <label className="mq-field">
              <span>Quantidade</span>
              <input
                className="mq-input"
                type="number"
                min={1}
                inputMode="numeric"
                value={qtd}
                onChange={(e) => setQtd(Math.max(1, Number(e.target.value) || 1))}
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
              placeholder='ex.: "brinde para a Sthefany", "caiu e quebrou o fecho"'
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>

          <p className="mq-note mq-note--info">
            <Icone nome="alert" />
            <span>
              Esta saída tira a peça do estoque e <b>não</b> entra em
              faturamento, ticket médio, peças vendidas nem no ranking de
              clientes.
            </span>
          </p>

          {problemas.length > 0 && (
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
            {!embutida && (
              <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>
                Cancelar
              </button>
            )}
          </div>
        </div>
    </>
  );

  if (embutida) return <section className="mq-card saida-embutida">{corpo}</section>;
  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div
        className="mq-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Registrar saída sem faturamento"
      >
        {corpo}
      </div>
    </>
  );
}
