import { fmtData, money } from '../../domain/formato';
import { ROTULO_FONTE, rotuloDoTipo, type SaidaSemFaturamento } from './tipos';

/** A lista de saídas sem faturamento, com o DINHEIRO ao lado das peças.
 *
 *  Uma tabela só, usada em Vendas › Saída sem faturamento e em Financeiro ›
 *  Saiu sem faturar: duas listas do mesmo fato já divergiram antes (tipos.ts).
 *
 *  Valor e custo mostram o que foi GRAVADO na saída. Sem valor, a célula diz
 *  "não informado" e oferece completar — nunca mostra R$ 0,00, que seria
 *  afirmar que a peça não valia nada. No celular a linha vira cartão
 *  (`.mq-table` sem `--scroll`), em vez de uma tabela espremida. */
export function TabelaDeSaidas({
  saidas, aoCompletar, aoEstornar, estornando = null, recusa = null,
}: {
  saidas: SaidaSemFaturamento[];
  aoCompletar?: (s: SaidaSemFaturamento) => void;
  aoEstornar?: (s: SaidaSemFaturamento) => void;
  estornando?: number | null;
  recusa?: { id: number; texto: string } | null;
}) {
  return (
    <div className="mq-table saidas-lista" role="table" aria-label="Saídas sem faturamento">
      <div className="mq-tr mq-tr--head" role="row">
        <span role="columnheader">Data</span>
        <span role="columnheader">Motivo</span>
        <span role="columnheader">Peça</span>
        <span role="columnheader" className="mq-cell--num">Qtd</span>
        <span role="columnheader" className="mq-cell--num">Valor de venda</span>
        <span role="columnheader" className="mq-cell--num">Custo</span>
        <span role="columnheader">Situação</span>
      </div>
      {saidas.map((s) => {
        const semValor = s.precoUnit == null;
        const semCusto = s.custoUnit == null;
        return (
          <div className={`mq-tr${s.estornada ? ' saidas-lista__estornada' : ''}`} role="row" key={s.id}>
            <span className="mq-cell" role="cell">
              <b className="mq-date">{fmtData(s.data)}</b>
            </span>
            <span className="mq-cell" role="cell">
              <span className={s.tipo === 'perda' ? 'mq-chip' : 'mq-chip mq-chip--soft'} title={s.tipoRotulo}>
                {rotuloDoTipo(s.tipo)}
              </span>
              {s.sentido === 'entrada' && <small>sobra devolvida</small>}
            </span>
            <span className="mq-cell" role="cell">
              <b>{s.produto ?? s.sku}</b>
              <small className="mq-sku">
                {s.sku}{s.variacao ? ` · ${s.variacao}` : ''}
                {s.inventarioId != null ? ` · contagem #${s.inventarioId}` : ''}
              </small>
              {(s.motivo || s.observacao) && (
                <small className="saida-obs" title={[s.motivo, s.observacao].filter(Boolean).join(' — ')}>
                  {[s.motivo, s.observacao].filter(Boolean).join(' — ')}
                </small>
              )}
              <small className="saida-origem">
                {origemDaSaida(s)}
                {s.origemUsuario ? ` · por ${s.origemUsuario}` : ''}
                {s.movimentoId ? ` · movimento #${s.movimentoId}` : ''}
              </small>
            </span>
            <span className="mq-cell mq-cell--num" role="cell" data-label="Qtd">
              <b className="mq-qty">{s.sentido === 'entrada' ? `+${s.qtd}` : s.qtd}</b>
            </span>
            <span className="mq-cell mq-cell--num" role="cell" data-label="Valor de venda">
              {semValor ? (
                <small className="saidas-lista__vazio">valor não informado</small>
              ) : (
                <>
                  <b className="mq-money">{money(s.valorTotal ?? (s.precoUnit ?? 0) * s.qtd)}</b>
                  <small>{money(s.precoUnit)} cada{s.precoFonte ? ` · ${ROTULO_FONTE[s.precoFonte]}` : ''}</small>
                </>
              )}
            </span>
            <span className="mq-cell mq-cell--num" role="cell" data-label="Custo">
              {semCusto ? (
                <small className="saidas-lista__vazio">custo não informado</small>
              ) : (
                <>
                  <b className="mq-money">{money(s.custoTotal ?? (s.custoUnit ?? 0) * s.qtd)}</b>
                  <small>{money(s.custoUnit)} cada</small>
                </>
              )}
            </span>
            <span className="mq-cell saidas-lista__acoes" role="cell">
              {s.estornada ? (
                <>
                  <span className="mq-status">estornada</span>
                  <small>{fmtData(s.estornoEm)}{s.estornoMotivo ? ` · ${s.estornoMotivo}` : ''}</small>
                </>
              ) : (
                <>
                  <span className="mq-status mq-status--ok">valendo</span>
                  {!s.estoqueRefletido && <small>só classifica — não baixou estoque</small>}
                </>
              )}
              <span className="mq-btns mq-btns--tight">
                {aoCompletar && !s.estornada && (
                  <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" onClick={() => aoCompletar(s)}>
                    {semValor || semCusto ? 'Informar valor' : 'Corrigir valor'}
                  </button>
                )}
                {aoEstornar && !s.estornada && (
                  <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm"
                    disabled={estornando === s.id} onClick={() => aoEstornar(s)}>
                    Estornar
                  </button>
                )}
              </span>
              {recusa?.id === s.id && <small className="mq-money--risk" role="alert">{recusa.texto}</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** De onde a saída veio — é o que responde "quem lançou isto?" meses depois. */
function origemDaSaida(s: SaidaSemFaturamento): string {
  if (s.origemRegistro === 'migracao_historico') return 'Planilha de vendas antiga';
  if (s.inventarioId != null) return 'Inventário';
  return 'Lançada no sistema';
}
