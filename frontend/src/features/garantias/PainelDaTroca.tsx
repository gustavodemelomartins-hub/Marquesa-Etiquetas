import { useMemo, useState } from 'react';
import { Icone } from '../../components/Icone';
import { money, fmtData, hojeISO } from '../../domain/formato';
import {
  estornarTroca, motivoDaRecusa, pagarDiferenca, registrarTroca,
} from './api';
import { ENCERRADOS } from './tipos';
import type { Connection } from '../../services/client';
import type { Garantia, Troca } from './tipos';
import type { ProdutoDoEstado } from '../vendas/tipos';

interface Props {
  conexao: Connection;
  garantia: Garantia;
  produtos: ProdutoDoEstado[];
  aoMudar: () => void;
}

/** A TROCA — a peça não tinha conserto, e outra saiu no lugar.
 *
 *  O que esta tela NÃO decide, e é o ponto inteiro:
 *
 *   · **a diferença**. Quem a calcula é o servidor, que conhece o valor
 *     PAGO na compra original. Repetir a conta aqui criaria dois números
 *     para o mesmo fato.
 *   · **de quem é o dinheiro**. Peça nova mais cara é `a_receber` DA
 *     CLIENTE; mais barata é CRÉDITO DELA, e o servidor recusa "receber"
 *     um crédito. As duas situações têm o mesmo número e donos opostos, e
 *     é por isso que a tela nunca escreve só "diferença: R$ 18".
 *   · **se pode trocar**. Caso encerrado não troca peça (5.4f), venda
 *     cancelada não troca peça, e peça sem estoque não troca. As três são
 *     recusas do servidor, e a frase dele é o que aparece.
 */
export function PainelDaTroca({ conexao, garantia, produtos, aoMudar }: Props) {
  const [abrindo, setAbrindo] = useState(false);
  const [busca, setBusca] = useState('');
  const [peca, setPeca] = useState<ProdutoDoEstado | null>(null);
  const [data, setData] = useState(hojeISO());
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const troca = garantia.troca ?? null;
  const encerrado = ENCERRADOS.includes(garantia.status);

  const achados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    return produtos
      .filter((p) => p.status === 'ativo' && p.disponivel > 0)
      .filter((p) => p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t))
      .slice(0, 8);
  }, [produtos, busca]);

  async function registrar() {
    if (!peca) return;
    setOcupado(true);
    setErro('');
    const r = await registrarTroca(conexao, garantia.id, {
      skuNovo: peca.sku,
      data,
      ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
    }).catch((e: unknown) => ({ erro: motivoDaRecusa(e, 'Não consegui registrar a troca.') }));
    setOcupado(false);
    if (r && 'erro' in r && r.erro) { setErro(String(r.erro)); return; }
    setAbrindo(false);
    setPeca(null);
    aoMudar();
  }

  async function pagar() {
    const quando = prompt(
      'Em que dia a diferença entrou? (AAAA-MM-DD)\n\n'
      + 'É a data EFETIVA do pagamento — é ela que manda no faturamento, e '
      + 'pagamento parcial não é tratado aqui.',
      hojeISO(),
    );
    if (!quando?.trim()) return;
    setOcupado(true);
    setErro('');
    const r = await pagarDiferenca(conexao, garantia.id, quando.trim())
      .catch((e: unknown) => ({ erro: motivoDaRecusa(e, 'Não consegui registrar o pagamento.') }));
    setOcupado(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoMudar();
  }

  async function estornar() {
    const motivo = prompt(
      'Desfazer a troca?\n\n'
      + 'A peça nova volta ao estoque e o registro comercial dela é CANCELADO, '
      + 'não apagado. A garantia continua onde está.\n\nPor quê?',
    );
    if (!motivo?.trim()) return;
    setOcupado(true);
    setErro('');
    const r = await estornarTroca(conexao, garantia.id, motivo.trim())
      .catch((e: unknown) => ({ erro: motivoDaRecusa(e, 'Não consegui estornar.') }));
    setOcupado(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoMudar();
  }

  return (
    <section className="mq-stack mq-stack--tight">
      <h3 className="mq-subtitle">Troca</h3>
      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

      {troca ? (
        <ResumoDaTroca
          troca={troca}
          ocupado={ocupado}
          aoPagar={pagar}
          aoEstornar={estornar}
        />
      ) : encerrado ? (
        <p className="mq-hint">
          Caso em &quot;{garantia.statusRotulo}&quot;: de estado terminal não se
          sai, e por isso ele não troca peça. Se a peça voltou de novo, o
          caminho é um atendimento novo ligado a este.
        </p>
      ) : !abrindo ? (
        <>
          <p className="mq-hint">
            Nenhuma troca registrada. A peça nova sai do estoque, e o servidor
            calcula a diferença contra o que a cliente pagou
            {garantia.valorPagoOriginal != null
              ? ` (${money(garantia.valorPagoOriginal)})`
              : ' — que esta garantia não conhece, e por isso a diferença pode vir zerada'}.
          </p>
          <div className="mq-btns">
            <button type="button" className="mq-btn mq-btn--secondary" onClick={() => setAbrindo(true)}>
              <Icone nome="swap" />
              Registrar troca
            </button>
          </div>
        </>
      ) : (
        <>
          {peca ? (
            <p className="mq-chips">
              <span className="mq-chip mq-chip--brand">
                {peca.desc} · {peca.disponivel} disponível ·{' '}
                {peca.semPreco ? 'sem preço' : money(peca.preco)}
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
                  placeholder="Qual peça saiu no lugar"
                  aria-label="Buscar peça nova"
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
                      <span className="mq-item__side">
                        <b className="mq-money">{p.semPreco ? '—' : money(p.preco)}</b>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="mq-hint">
                Só peça ativa e com saldo aparece: trocar por algo que não existe
                deixaria o estoque negativo.
              </p>
            </>
          )}

          <div className="mq-grid mq-grid--2">
            <label className="mq-field">
              <span>Data da troca</span>
              <input
                className="mq-input"
                type="date"
                value={data}
                max={hojeISO()}
                onChange={(e) => setData(e.target.value)}
              />
            </label>
            <label className="mq-field">
              <span>Observação <small>opcional</small></span>
              <input
                className="mq-input"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </label>
          </div>

          <div className="mq-btns">
            <button
              type="button"
              className="mq-btn mq-btn--primary"
              disabled={!peca || ocupado}
              onClick={registrar}
            >
              {ocupado ? 'Registrando…' : 'Registrar troca'}
            </button>
            <button type="button" className="mq-btn mq-btn--ghost" onClick={() => setAbrindo(false)}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════ a troca já registrada */

function ResumoDaTroca({
  troca, ocupado, aoPagar, aoEstornar,
}: {
  troca: Troca;
  ocupado: boolean;
  aoPagar: () => void;
  aoEstornar: () => void;
}) {
  /* O estado diz também se o crédito já entrou no extrato da cliente. */
  const situacao = {
    nenhuma: { rotulo: 'sem diferença', tom: 'mq-status--ok' },
    a_receber: { rotulo: 'a receber da cliente', tom: 'mq-status--risk' },
    credito: { rotulo: 'crédito anterior', tom: 'mq-status--info' },
    credito_emitido: { rotulo: 'crédito lançado', tom: 'mq-status--ok' },
    pendente_regra: { rotulo: 'crédito pendente', tom: 'mq-status--risk' },
    paga: { rotulo: 'diferença paga', tom: 'mq-status--ok' },
  }[troca.diferencaStatus] ?? { rotulo: 'situação a conferir', tom: 'mq-status--risk' };

  return (
    <>
      <div className="mq-item">
        <span className="mq-item__icon mq-item__icon--brand"><Icone nome="swap" /></span>
        <span className="mq-item__main">
          <b>{troca.produtoNovoNome ?? troca.skuNovo}</b>
          <small>
            {troca.skuNovo}
            {troca.variacaoNova ? ` · ${troca.variacaoNova}` : ''} · {fmtData(troca.data)}
            {troca.vendaId ? ` · registro comercial #${troca.vendaId}` : ' · sem registro comercial (troca anterior a §36)'}
          </small>
        </span>
        <span className="mq-item__side">
          <span className={`mq-status ${situacao.tom}`}>{situacao.rotulo}</span>
        </span>
      </div>

      <dl className="mq-dl">
        <div><dt>Pago na compra original</dt><dd>{money(troca.valorOriginal)}</dd></div>
        <div><dt>Peça nova</dt><dd>{money(troca.valorNovo)}</dd></div>
        <div>
          <dt>Diferença</dt>
          <dd>
            {troca.diferenca === 0 ? '—' : (
              <b className={troca.diferenca > 0 ? 'mq-money mq-money--risk' : 'mq-money mq-money--ok'}>
                {troca.diferenca > 0 ? '+' : '−'}{money(Math.abs(troca.diferenca))}
              </b>
            )}
          </dd>
        </div>
        {troca.diferencaPagaEm && (
          <div><dt>Paga em</dt><dd>{fmtData(troca.diferencaPagaEm)}</dd></div>
        )}
      </dl>

      {troca.diferencaStatus === 'credito_emitido' && (
        <p className="mq-note mq-note--info">
          <Icone nome="alert" />
          <span>
            A peça nova custou <b>menos</b>: {money(troca.creditoAoCliente)} são
            crédito <b>da cliente</b>, já lançado no extrato da ficha da cliente.
          </span>
        </p>
      )}
      {troca.diferencaStatus === 'pendente_regra' && (
        <p className="mq-note mq-note--risk">
          <Icone nome="alert" />
          <span>
            {money(troca.creditoAoCliente)} são a favor da cliente, mas o crédito
            ainda não foi lançado: é preciso confirmar o vínculo com a cliente.
            Não cobre esse valor dela.
          </span>
        </p>
      )}
      {troca.diferencaStatus === 'credito' && (
        <p className="mq-note mq-note--info">
          <Icone nome="alert" />
          <span>
            Registro anterior de crédito a favor da cliente. Confira o extrato
            da ficha antes de considerar esse valor disponível.
          </span>
        </p>
      )}

      <div className="mq-btns">
        {troca.diferencaStatus === 'a_receber' && (
          <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado} onClick={aoPagar}>
            Recebi a diferença
          </button>
        )}
        <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" disabled={ocupado} onClick={aoEstornar}>
          Estornar troca
        </button>
      </div>

      {troca.diferencaStatus === 'paga' && (
        <p className="mq-hint">
          Estornar uma troca com a diferença já paga é recusado pelo servidor:
          deixaria o dinheiro sem origem. Trate o reembolso antes.
        </p>
      )}
    </>
  );
}
