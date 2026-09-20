import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { fmtData, hojeISO } from '../../domain/formato';
import type { AppState } from '../../types/api';
import type { ProdutoDoEstado } from '../vendas/tipos';

interface Saida {
  id: number;
  data: string;
  tipo: string;
  sentido: string;
  sku: string;
  produto: string | null;
  qtd: number;
  motivo: string | null;
  observacao: string | null;
  estornada: number;
}

interface RespostaSaidas {
  ok: true;
  saidas: Saida[];
  resumo: Record<string, number>;
}

/** Os quatro tipos que o backend aceita. Não há um quinto, e a tela não
 *  inventa um: um tipo novo é decisão de negócio, não campo de texto. */
const TIPOS = [
  { id: 'brinde', rotulo: 'Brinde', explica: 'saiu de presente, para cliente ou parceira' },
  { id: 'uso_proprio', rotulo: 'Uso próprio', explica: 'ficou com a casa — foto, vitrine, uso pessoal' },
  { id: 'perda', rotulo: 'Perda', explica: 'quebrou, sumiu, ou a contagem não achou' },
  { id: 'sorteio', rotulo: 'Sorteio', explica: 'saiu numa ação de divulgação' },
];

interface Props {
  conexao: Connection;
  estado: AppState | null;
  aoMudarEstoque: () => void;
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
export function SaidasArea({ conexao, estado, aoMudarEstoque }: Props) {
  const lista = useApi(
    (s) => chamar<RespostaSaidas>(conexao, 'GET', '/api/saidas?limite=200', undefined, { signal: s }),
    [conexao],
  );
  const [registrando, setRegistrando] = useState(false);

  const produtos = (estado?.produtos ?? []) as unknown as ProdutoDoEstado[];
  const saidas = lista.dados?.saidas ?? [];

  return (
    <>
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

      <div className="mq-kpis">
        {TIPOS.map((t) => (
          <div className="mq-kpi" key={t.id}>
            <span className="mq-kpi__label">{t.rotulo}</span>
            <span className="mq-kpi__value">{lista.dados?.resumo?.[t.id] ?? 0}</span>
            <span className="mq-kpi__foot">{t.explica}</span>
          </div>
        ))}
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
          <div className="mq-list">
            {saidas.map((s) => (
              <div className="mq-item" key={s.id}>
                <span className={`mq-item__icon ${s.estornada ? '' : 'mq-item__icon--warn'}`}>
                  <Icone nome={s.tipo === 'perda' ? 'alert' : 'box'} />
                </span>
                <span className="mq-item__main">
                  <b>{s.produto ?? s.sku}</b>
                  <small>
                    {TIPOS.find((t) => t.id === s.tipo)?.rotulo ?? s.tipo} · {fmtData(s.data)}
                    {s.motivo ? ` · ${s.motivo}` : ''}
                  </small>
                </span>
                <span className="mq-item__side">
                  <b className="mq-qty">{s.qtd}</b>
                  {s.estornada ? <span className="mq-status">estornada</span> : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

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

function FormSaida({
  conexao, produtos, aoFechar, aoRegistrar,
}: {
  conexao: Connection;
  produtos: ProdutoDoEstado[];
  aoFechar: () => void;
  aoRegistrar: () => void;
}) {
  const [tipo, setTipo] = useState('brinde');
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
    const r = await chamar<{ erro?: string }>(conexao, 'POST', '/api/saidas', {
      tipo, sku: peca.sku, qtd, data, motivo: motivo.trim(),
    }).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui registrar.' }));
    setEnviando(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoRegistrar();
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-drawer" role="dialog" aria-modal="true" aria-label="Registrar saída sem faturamento">
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">Estoque</p>
            <h2 className="mq-title">Registrar saída</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

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
            <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>Cancelar</button>
          </div>
        </div>
      </div>
    </>
  );
}
