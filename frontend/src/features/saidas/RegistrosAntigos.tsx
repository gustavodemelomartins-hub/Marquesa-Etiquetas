import { fmtData, money } from '../../domain/formato';
import type { SaidaLegada } from './tipos';

interface Props {
  legado: SaidaLegada[];
  /** O período da tela. Linha sem data só aparece quando não há período. */
  de?: string | null;
  ate?: string | null;
}

/** LINHAS DA PLANILHA ANTIGA QUE NÃO ERAM VENDA e não viraram uma saída
 *  própria — sem data, ou com o código fora do catálogo.
 *
 *  Elas saíram de Vendas e do faturamento pela reclassificação (§30.5), e
 *  é aqui que continuam consultáveis: o motivo, a peça, a data e o VALOR que
 *  a planilha registrava, para quem for auditar saber o que deixou de ser
 *  contado como venda. Antes moravam só na tela de lançar saída; o
 *  Financeiro mostrava a soma das saídas sem elas. */
export function RegistrosAntigos({ legado, de = null, ate = null }: Props) {
  const visiveis = legado.filter((l) => {
    if (!de && !ate) return true;
    if (!l.data) return false;
    return (!de || l.data >= de) && (!ate || l.data <= ate);
  });
  if (!visiveis.length) return null;

  return (
    <section className="mq-card mq-card--flush" aria-labelledby="saidas-legado">
      <div className="mq-card__head">
        <div>
          <h2 className="mq-title" id="saidas-legado">Registros antigos sem saída</h2>
          <p className="mq-lede">
            Linhas da planilha antiga que não eram venda, sem data ou com código
            fora do catálogo. {visiveis.length} {visiveis.length === 1 ? 'registro' : 'registros'}.
          </p>
        </div>
      </div>
      <ul className="saida-legado" aria-label="Registros antigos sem saída">
        {visiveis.map((l) => (
          <li key={l.reclassificacaoId}>
            <span className="mq-chip mq-chip--soft">{l.tipoRotulo}</span>
            <span>
              <b>{l.produto ?? l.sku ?? 'peça sem código'}</b>
              <small>
                {l.data ? fmtData(l.data) : 'sem data'} · {l.sku ?? '—'} · {l.qtd ?? '?'} peça(s)
                {l.pessoa ? ` · ${l.pessoa}` : ''} · planilha Nº {l.linhaPlanilha ?? '—'}
                {l.valorPlanilha != null ? ` · ${money(l.valorPlanilha)} na planilha` : ''}
                {l.custoInformado != null ? ` · custo ${money(l.custoInformado)}` : ''}
              </small>
              {l.observacao && <small>{l.observacao}</small>}
            </span>
            <small className="saida-legado__porque">{l.porque}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
