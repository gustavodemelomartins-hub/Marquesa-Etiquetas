import { useState } from 'react';
import type { ReconciliationItem, RiskLevel } from '../../types/reconciliation';
import { RiskBadge } from '../../components/RiskBadge';
import { DiffView } from '../../components/DiffView';
import { EmptyState } from '../../components/EmptyState';

const FILTROS: Array<{ chave: RiskLevel | 'todos'; rotulo: string }> = [
  { chave: 'todos', rotulo: 'Todas' },
  { chave: 'perigoso', rotulo: 'Perigosas' },
  { chave: 'confere', rotulo: 'Para conferir' },
  { chave: 'trivial', rotulo: 'Rotina' },
];

/** A lista do diff, ordenada por atenção.
 *
 *  Não há coluna de decisão nem botão de aprovar: aprovar exige gravar a
 *  decisão em algum lugar, e esse lugar ainda não existe no backend. Uma
 *  caixinha de seleção que não persiste nada seria pior que a ausência
 *  dela — pareceria que a pessoa decidiu algo. */
export function ReconciliationTable({ itens }: { itens: ReconciliationItem[] }) {
  const [filtro, setFiltro] = useState<RiskLevel | 'todos'>('todos');

  if (!itens.length) {
    return (
      <EmptyState
        titulo="Nada a mudar"
        descricao="A loja já mostra exatamente o que existe em casa, código a código."
      />
    );
  }

  const visiveis = filtro === 'todos' ? itens : itens.filter((i) => i.risco === filtro);

  return (
    <>
      <div className="filtros">
        {FILTROS.map((f) => {
          const n =
            f.chave === 'todos'
              ? itens.length
              : itens.filter((i) => i.risco === f.chave).length;
          if (n === 0 && f.chave !== 'todos') return null;
          return (
            <button
              key={f.chave}
              type="button"
              className="pill"
              aria-pressed={filtro === f.chave}
              onClick={() => setFiltro(f.chave)}
            >
              {f.rotulo} ({n})
            </button>
          );
        })}
      </div>

      <div className="tabela-wrap">
        <table className="tabela">
          <caption className="sr-only" style={{ position: 'absolute', left: -9999 }}>
            Mudanças que a sincronização faria na loja
          </caption>
          <thead>
            <tr>
              <th scope="col">Código</th>
              <th scope="col">Produto</th>
              <th scope="col">Na loja → passaria a</th>
              <th scope="col">Risco</th>
              <th scope="col">Por quê</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((i) => (
              <tr key={i.id}>
                <td>
                  <span className="sku">{i.sku}</span>
                </td>
                <td>
                  {i.descricao}
                  {i.variacao && (
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      variação {i.variacao}
                    </div>
                  )}
                </td>
                <td className="num">
                  <DiffView de={i.de} para={i.para} />
                </td>
                <td>
                  <RiskBadge risco={i.risco} />
                </td>
                <td style={{ color: 'var(--muted)', fontSize: 13.5, maxWidth: '38ch' }}>
                  {i.motivo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 'var(--r3)', fontSize: 13, color: 'var(--muted)' }}>
        Esta é uma leitura. Aplicar estas mudanças continua sendo feito pelo
        painel atual, e a aprovação item a item é a próxima etapa.
      </p>
    </>
  );
}
