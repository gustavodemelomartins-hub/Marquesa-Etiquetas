import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { money, fmtData, hojeISO } from '../../domain/formato';
import { listarVendas } from '../vendas/api';
import { abrirGarantia, motivoDaRecusa, type CandidataDeItem, type NovaGarantia } from './api';
import type { Connection } from '../../services/client';
import type { ItemDaLista } from '../vendas/tipos';

interface Props {
  conexao: Connection;
  aoFechar: () => void;
  aoAbrir: (id: number) => void;
}

/** ABRIR GARANTIA — a peça voltou.
 *
 *  O caso começa pela COMPRA, não por um formulário vazio: uma garantia sem
 *  a linha da venda atrás dela não sabe quanto a cliente pagou, e sem isso a
 *  troca não consegue calcular diferença nenhuma. Por isso a primeira coisa
 *  aqui é achar a peça no histórico.
 *
 *  `/api/vendas/lista` já devolve o `id` de cada linha, e ele É o ponteiro
 *  que `abrirGarantia` quer: `venda_item_id` do lado operacional,
 *  `historico_item_id` do lado da planilha. `fonte` diz qual — e é por isso
 *  que nenhuma rota nova foi precisa para fechar este buraco.
 *
 *  AMBIGUIDADE NÃO É ERRO. Quando o servidor acha mais de uma candidata ele
 *  devolve 409 COM elas, e a tela pergunta. Escolher por conta própria seria
 *  o chute que a regra 2 do CLAUDE.md proíbe — duas peças iguais na mesma
 *  compra são duas unidades físicas diferentes desde 5.4b.
 */
export function AbrirGarantia({ conexao, aoFechar, aoAbrir }: Props) {
  const hoje = hojeISO();
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [item, setItem] = useState<ItemDaLista | null>(null);
  const [motivo, setMotivo] = useState('');
  const [dataEntrada, setDataEntrada] = useState(hoje);
  const [prazo, setPrazo] = useState(45);
  const [candidatas, setCandidatas] = useState<CandidataDeItem[] | null>(null);
  const [escolhida, setEscolhida] = useState<CandidataDeItem | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca), 280);
    return () => clearTimeout(t);
  }, [busca]);

  const vendas = useApi(
    (s) => (buscaAtiva.trim().length >= 2
      ? listarVendas(conexao, { busca: buscaAtiva, incluirCanceladas: false }, s)
      : Promise.resolve({ itens: [], limite: 0, offset: 0 })),
    [conexao, buscaAtiva],
  );

  const problemas: string[] = [];
  if (!item) problemas.push('Ache a compra de onde a peça saiu.');
  if (!motivo.trim()) problemas.push('Diga qual é o problema da peça.');
  if (dataEntrada > hoje) problemas.push(`${fmtData(dataEntrada)} ainda não chegou.`);
  if (!Number.isInteger(prazo) || prazo <= 0) problemas.push('O prazo é em dias úteis, inteiro.');

  async function abrir() {
    if (!item) return;
    setEnviando(true);
    setErro('');
    setCandidatas(null);

    /* Uma das três formas, nunca uma mistura. O `id` da linha resolve
       sozinho quando existe; a escolha manual entra quando o servidor já
       respondeu "encontrei demais". */
    const corpo: NovaGarantia = {
      motivo: motivo.trim(),
      dataEntrada,
      prazoDiasUteis: prazo,
      ...(escolhida
        ? { vendaItemId: escolhida.vendaItemId }
        : item.fonte === 'historico'
          ? { historicoItemId: Number(item.id) }
          : { vendaItemId: item.id }),
    };

    const r = await abrirGarantia(conexao, corpo)
      .catch((e: unknown) => {
        const corpoErro = (e as { corpo?: { candidatas?: CandidataDeItem[] } })?.corpo;
        return {
          erro: motivoDaRecusa(e, 'Não consegui abrir a garantia.'),
          candidatas: corpoErro?.candidatas,
        };
      });
    setEnviando(false);

    if (r && 'candidatas' in r && r.candidatas?.length) {
      setCandidatas(r.candidatas);
      setErro(r.erro ?? 'Mais de uma linha desta compra pode ser a peça. Diga qual.');
      return;
    }
    if (r && 'erro' in r && r.erro) { setErro(String(r.erro)); return; }
    if (r && 'id' in r && typeof r.id === 'number') aoAbrir(r.id);
    else aoFechar();
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-drawer mq-drawer--larga" role="dialog" aria-modal="true" aria-label="Abrir garantia">
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">Pós-venda</p>
            <h2 className="mq-title">A peça voltou</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-drawer__body mq-stack">
          <section className="mq-stack mq-stack--tight">
            <h3 className="mq-subtitle">De qual compra ela saiu</h3>
            {item ? (
              <div className="mq-item">
                <span className="mq-item__icon mq-item__icon--brand"><Icone nome="sale" /></span>
                <span className="mq-item__main">
                  <b>{item.produto ?? item.sku}</b>
                  <small>
                    {item.cliente ?? 'cliente não identificada'} · {fmtData(item.data)} ·{' '}
                    {item.fonte === 'historico' ? 'planilha' : `venda #${item.referencia}`}
                  </small>
                </span>
                <span className="mq-item__side">
                  <b className="mq-money">{money(item.valor)}</b>
                  <button
                    type="button"
                    className="mq-btn mq-btn--ghost mq-btn--sm"
                    onClick={() => { setItem(null); setCandidatas(null); setEscolhida(null); }}
                  >
                    Trocar
                  </button>
                </span>
              </div>
            ) : (
              <>
                <label className="mq-search">
                  <Icone nome="search" />
                  <input
                    className="mq-input"
                    type="search"
                    placeholder="Cliente, peça ou código da venda"
                    aria-label="Buscar a compra"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </label>
                <p className="mq-hint">
                  A garantia nasce ligada à linha da compra. Sem ela, ninguém sabe
                  quanto a cliente pagou — e uma troca sem isso não calcula
                  diferença nenhuma.
                </p>
                {vendas.carregando && <p className="mq-hint">buscando…</p>}
                {(vendas.dados?.itens ?? []).length > 0 && (
                  <div className="mq-list mq-list--compacta">
                    {(vendas.dados?.itens ?? []).slice(0, 12).map((i) => (
                      <button
                        type="button"
                        className="mq-item"
                        key={`${i.fonte}:${i.id}`}
                        onClick={() => setItem(i)}
                      >
                        <span className="mq-item__main">
                          <b>{i.produto ?? i.sku}</b>
                          <small>
                            {i.cliente ?? 'cliente não identificada'} · {fmtData(i.data)} ·{' '}
                            {i.sku}
                          </small>
                        </span>
                        <span className="mq-item__side"><b className="mq-money">{money(i.valor)}</b></span>
                      </button>
                    ))}
                  </div>
                )}
                {buscaAtiva.trim().length >= 2 && !vendas.carregando
                  && (vendas.dados?.itens ?? []).length === 0 && (
                  <p className="mq-hint">Nenhuma compra com esse termo.</p>
                )}
              </>
            )}
          </section>

          {candidatas && (
            <section className="mq-stack mq-stack--tight">
              <h3 className="mq-subtitle">Qual peça voltou?</h3>
              <p className="mq-note mq-note--warn">
                <Icone nome="alert" />
                <span>
                  Esta compra tem mais de uma linha deste código. Desde 5.4b duas
                  peças iguais na mesma compra são duas <b>unidades físicas</b>{' '}
                  diferentes, e o servidor recusa escolher por nós.
                </span>
              </p>
              <div className="mq-list">
                {candidatas.map((c) => (
                  <button
                    type="button"
                    className="mq-item"
                    key={String(c.vendaItemId)}
                    aria-pressed={escolhida?.vendaItemId === c.vendaItemId}
                    onClick={() => setEscolhida(c)}
                  >
                    <span className="mq-item__icon">
                      <Icone nome={escolhida?.vendaItemId === c.vendaItemId ? 'check' : 'box'} />
                    </span>
                    <span className="mq-item__main">
                      <b>{c.variacao ?? 'sem variação'}</b>
                      <small>
                        linha #{c.vendaItemId} · {c.qtd} un.
                        {c.descontoRotulo ? ` · ${c.descontoRotulo}` : ''}
                      </small>
                    </span>
                    <span className="mq-item__side"><b className="mq-money">{money(c.precoPago)}</b></span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <label className="mq-field">
            <span>Qual é o problema</span>
            <input
              className="mq-input"
              placeholder='ex.: "soltou a pedra", "fecho quebrou"'
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>

          <div className="mq-grid mq-grid--2">
            <label className="mq-field">
              <span>Entrada</span>
              <input
                className="mq-input"
                type="date"
                value={dataEntrada}
                max={hoje}
                onChange={(e) => setDataEntrada(e.target.value)}
              />
              <small>quando a peça chegou às nossas mãos</small>
            </label>
            <label className="mq-field">
              <span>Prazo em dias úteis</span>
              <input
                className="mq-input"
                type="number"
                min={1}
                inputMode="numeric"
                value={prazo}
                onChange={(e) => setPrazo(Number(e.target.value) || 0)}
              />
              <small>
                feriado cadastrado não conta, e o relógio para quando o caso
                encerra — a conta é do servidor
              </small>
            </label>
          </div>

          {problemas.length > 0 && (
            <div className="mq-note mq-note--warn">
              <Icone nome="alert" />
              <span>{problemas.map((p) => <span key={p} style={{ display: 'block' }}>{p}</span>)}</span>
            </div>
          )}
          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

          <div className="mq-btns">
            <button
              type="button"
              className="mq-btn mq-btn--primary"
              disabled={enviando || problemas.length > 0 || (!!candidatas && !escolhida)}
              onClick={abrir}
            >
              {enviando ? 'Abrindo…' : 'Abrir garantia'}
            </button>
            <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>Cancelar</button>
          </div>
        </div>
      </div>
    </>
  );
}
