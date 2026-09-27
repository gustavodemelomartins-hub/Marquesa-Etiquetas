import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData } from '../../domain/formato';
import { fotoDaPeca } from '../../domain/foto';
import { EditarPeca } from '../catalogo/EditarPeca';
import { PainelDeVariacoes } from '../catalogo/PainelDeVariacoes';
import type { ProdutoDoEstado } from '../vendas/tipos';

interface Movimento {
  id: number;
  variacao: string | null;
  tipo: string;
  qtd: number;
  origem: string | null;
  venda_id: number | null;
  maleta_id: number | null;
  obs: string | null;
  criado_em: string;
}

interface RazaoDoSku {
  saldos: { qtd: number; consignado: number; disponivel: number };
  movimentos: Movimento[];
}

interface Props {
  conexao: Connection;
  peca: ProdutoDoEstado;
  categorias: string[];
  aoFechar: () => void;
  /** Salvar o cadastro ou mexer nas variações muda o estado compartilhado. */
  aoMudar: () => void;
}

/** A FICHA DA PEÇA — tudo sobre uma peça, num lugar só.
 *
 *  Antes, a mesma peça estava espalhada: a quantidade no Estoque, o preço
 *  numa gaveta do Catálogo, as variações noutro botão e a situação na loja
 *  numa terceira tela. Quem buscava "o brinco 102370" não tinha onde ver
 *  o brinco. A ficha responde, de cima para baixo: que peça é, onde ela
 *  está, o que falta no cadastro, e o que aconteceu com ela.
 *
 *  O histórico de movimentos só é lido quando alguém o abre: é o detalhe
 *  que responde "por que tem 5 e não 6", e não precisa pesar em toda ficha. */
export function FichaDaPeca({ conexao, peca, categorias, aoFechar, aoMudar }: Props) {
  const [editando, setEditando] = useState(false);
  const [variacoes, setVariacoes] = useState(false);
  const [historico, setHistorico] = useState(false);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape' && !variacoes) aoFechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar, variacoes]);

  const foto = fotoDaPeca(peca);
  const emCasa = peca.qtd - peca.consignado;
  const falta = [
    !foto && 'foto',
    !peca.cat && 'categoria',
    peca.semPreco && 'preço',
  ].filter(Boolean) as string[];

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-drawer" role="dialog" aria-modal="true" aria-label={`Ficha da peça ${peca.sku}`}>
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">Código {peca.sku}</p>
            <h2 className="mq-title">{peca.desc}</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-drawer__body">
          {editando ? (
            <EditarPeca
              conexao={conexao}
              peca={peca}
              categorias={categorias}
              aoCancelar={() => setEditando(false)}
              aoSalvar={() => { setEditando(false); aoMudar(); }}
            />
          ) : (
            <>
              <div className="mq-ficha">
                {foto
                  ? <img className="mq-ficha__foto" src={foto} alt={peca.desc} />
                  : <span className="mq-ficha__foto mq-ficha__foto--vazia" aria-hidden="true">◇</span>}
                <div className="mq-ficha__dados">
                  <b className="mq-money mq-ficha__preco">
                    {peca.preco === null ? 'Sem preço' : money(peca.preco)}
                  </b>
                  <span>{peca.cat || 'Sem categoria'}</span>
                  <span className={peca.status === 'ativo' ? 'mq-status mq-status--ok' : 'mq-status'}>
                    {peca.status}
                  </span>
                </div>
              </div>

              <dl className="mq-dl">
                <div><dt>Em casa</dt><dd className="mq-qty">{emCasa}</dd></div>
                <div><dt>Com revendedoras</dt><dd className="mq-qty">{peca.consignado}</dd></div>
                <div>
                  <dt>Na loja online</dt>
                  <dd className="mq-qty">{peca.estoqueLoja == null ? '—' : peca.estoqueLoja}</dd>
                </div>
                <div><dt>Total</dt><dd className="mq-qty">{peca.qtd}</dd></div>
              </dl>

              {falta.length > 0 && (
                <p className="mq-note mq-note--warn">
                  <Icone nome="alert" />
                  <span>
                    <b>Cadastro incompleto:</b> falta {falta.join(', ')}.
                    {peca.semPreco ? ' Sem preço, a peça não pode ser vendida nem publicada.' : ''}
                  </span>
                </p>
              )}

              <div className="mq-btns">
                <button type="button" className="mq-btn mq-btn--primary" onClick={() => setEditando(true)}>
                  Editar dados
                </button>
                <button type="button" className="mq-btn mq-btn--secondary" onClick={() => setVariacoes(true)}>
                  Variações
                </button>
                <button
                  type="button"
                  className="mq-btn mq-btn--ghost"
                  aria-expanded={historico}
                  onClick={() => setHistorico((v) => !v)}
                >
                  {historico ? 'Esconder histórico' : 'Ver histórico'}
                </button>
              </div>

              {historico && <Historico conexao={conexao} sku={peca.sku} />}
            </>
          )}
        </div>
      </div>

      {variacoes && (
        <PainelDeVariacoes
          conexao={conexao}
          sku={peca.sku}
          aoFechar={() => setVariacoes(false)}
          aoMudarEstoque={aoMudar}
        />
      )}
    </>
  );
}

/** Tudo o que entrou e saiu desta peça, do mais novo para o mais antigo.
 *  A soma das linhas é o saldo — se um dia não for, a ficha avisa em vez
 *  de esconder. */
function Historico({ conexao, sku }: { conexao: Connection; sku: string }) {
  const razao = useApi(
    (s) => chamar<RazaoDoSku>(conexao, 'GET', `/api/estoque/${encodeURIComponent(sku)}/movimentos`, undefined, { signal: s }),
    [conexao, sku],
  );

  if (razao.erro) return <ErrorState erro={razao.erro} aoTentarDeNovo={razao.recarregar} />;
  if (!razao.dados) return <p className="mq-hint">Carregando o histórico…</p>;

  const soma = razao.dados.movimentos.reduce((s, m) => s + Number(m.qtd), 0);
  const fecha = soma === razao.dados.saldos.qtd;

  return (
    <section aria-label="Histórico da peça">
      <h3 className="mq-subtitle">Histórico</h3>
      {!fecha && (
        <p className="mq-note mq-note--risk" role="alert">
          <Icone nome="alert" />
          <span>
            As entradas e saídas somam {soma}, mas o saldo é {razao.dados.saldos.qtd}.
            Não corrija à mão: isto precisa ser investigado.
          </span>
        </p>
      )}
      {razao.dados.movimentos.length === 0 ? (
        <p className="mq-hint">Nenhuma entrada ou saída registrada.</p>
      ) : (
        <div className="mq-timeline">
          {razao.dados.movimentos.slice().reverse().map((m) => (
            <div className="mq-timeline__row" key={m.id}>
              <span className="mq-timeline__dot">
                <Icone nome={m.qtd < 0 ? 'sale' : 'box'} />
              </span>
              <span className="mq-timeline__body">
                <b>
                  {m.tipo} {m.qtd > 0 ? '+' : ''}{m.qtd}
                  {m.variacao ? ` · ${m.variacao}` : ''}
                </b>
                <small>
                  {fmtData(m.criado_em)}
                  {m.venda_id ? ` · venda #${m.venda_id}` : ''}
                  {m.maleta_id ? ` · maleta #${m.maleta_id}` : ''}
                  {m.obs ? ` · ${m.obs}` : ''}
                </small>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
