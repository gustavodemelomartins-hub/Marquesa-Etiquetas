import { useState } from 'react';
import { DiffView } from '../../components/DiffView';
import { EmptyState } from '../../components/EmptyState';
import { RiskBadge } from '../../components/RiskBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { FILTROS, ROTULO_FILTRO, contarFiltro, ehConflito, filtrarItens, type FiltroItem } from './itens';
import type { DadosProdutoNovo, ItemSessao } from './tipos';

interface Props {
  itens: ItemSessao[];
  /** `undefined` quando a sessão já não aceita mais decisão (aplicando, ou
   *  terminada) — some a coluna de ação. */
  aoDecidir?: (itemId: number, aprovar: boolean) => void;
  decidindoId?: number | null;
}

const ROTULO_STATUS: Record<ItemSessao['status'], { texto: string; tom: 'neutro' | 'positivo' | 'atencao' | 'critico' }> = {
  pendente: { texto: 'Aguardando decisão', tom: 'neutro' },
  aprovado: { texto: 'Aprovado', tom: 'positivo' },
  rejeitado: { texto: 'Rejeitado', tom: 'neutro' },
  aplicado: { texto: 'Aplicado', tom: 'positivo' },
  obsoleto: { texto: 'Precisa nova análise', tom: 'atencao' },
  erro: { texto: 'Erro', tom: 'critico' },
};

function descricaoLinha(item: ItemSessao): string {
  if (item.tipo === 'produto_novo') {
    const d = item.dados as DadosProdutoNovo | null;
    return d?.desc || item.sku;
  }
  return item.descricao || item.sku;
}

/** A tabela de revisão — serve Estoque Total e Produtos Novos, e mais
 *  adiante a Nuvemshop (§17 do pedido: um só sistema de review). */
export function TabelaItensSessao({ itens, aoDecidir, decidindoId }: Props) {
  const [filtro, setFiltro] = useState<FiltroItem>('todos');

  if (!itens.length) {
    return <EmptyState titulo="Nada para revisar" descricao="A análise não encontrou nenhuma linha." />;
  }

  const visiveis = filtrarItens(itens, filtro);

  return (
    <>
      <div className="filtros">
        {FILTROS.map((f) => {
          const n = contarFiltro(itens, f);
          if (n === 0 && f !== 'todos') return null;
          return (
            <button
              key={f}
              type="button"
              className="pill"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
            >
              {ROTULO_FILTRO[f]} ({n})
            </button>
          );
        })}
      </div>

      {visiveis.length === 0 ? (
        <EmptyState titulo="Nada neste filtro" />
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Produto</th>
                <th scope="col">{itens[0]?.tipo === 'produto_novo' ? 'Quantidade inicial' : 'Hoje → Planilha'}</th>
                <th scope="col">Situação</th>
                {aoDecidir && <th scope="col">Decisão</th>}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((item) => {
                const conflito = ehConflito(item);
                const status = ROTULO_STATUS[item.status];
                const dadosNovo = item.tipo === 'produto_novo' ? (item.dados as DadosProdutoNovo | null) : null;

                return (
                  <tr key={item.id} data-conflito={conflito || undefined}>
                    <td>
                      <span className="sku">{item.sku}</span>
                    </td>
                    <td>
                      {descricaoLinha(item)}
                      {item.variacao && (
                        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>variação {item.variacao}</div>
                      )}
                      {dadosNovo && (
                        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                          {dadosNovo.cat} ·{' '}
                          {dadosNovo.preco === null
                            ? 'sem preço'
                            : dadosNovo.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {item.tipo === 'produto_novo' ? item.para : <DiffView de={item.de} para={item.para} />}
                    </td>
                    <td>
                      {conflito ? (
                        <StatusBadge tom="critico">Precisa de revisão</StatusBadge>
                      ) : (
                        <RiskBadge risco={item.risco} />
                      )}
                      <div style={{ marginTop: 4 }}>
                        <StatusBadge tom={status.tom}>{status.texto}</StatusBadge>
                      </div>
                      {item.motivo && (
                        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, maxWidth: '36ch' }}>
                          {item.motivo}
                        </div>
                      )}
                    </td>
                    {aoDecidir && (
                      <td>
                        {item.status === 'pendente' ? (
                          <div className="acoes">
                            <button
                              type="button"
                              className={conflito ? 'btn btn-critico btn-sm' : 'btn btn-leitura btn-sm'}
                              disabled={decidindoId === item.id}
                              onClick={() => aoDecidir(item.id, false)}
                            >
                              Rejeitar
                            </button>
                            <button
                              type="button"
                              className="btn btn-escrita btn-sm"
                              disabled={decidindoId === item.id || conflito}
                              title={conflito ? 'Este item precisa de revisão humana fora deste fluxo — não pode ser aprovado aqui.' : undefined}
                              onClick={() => aoDecidir(item.id, true)}
                            >
                              Aprovar
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: 13 }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
