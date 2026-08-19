import type { AppState, Reseller, Suitcase } from '../../types/api';
import { Kpi, Kpis } from '../../components/Kpi';
import { Colunas, Painel } from '../../components/Painel';
import { Donut } from '../../components/Donut';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtData, money, plural } from '../../domain/formato';
import { corDaCategoria } from '../../domain/categorias';
import {
  maletaAbertaDe,
  maletaEncerrada,
  precoEnvio,
  prazoDe,
  qtdMaleta,
  situacaoMaleta,
  valMaleta,
} from '../../domain/maletas';

interface Props {
  estado: AppState;
  revendedora: Reseller;
  aoCriarMaleta: () => void;
}

/** A tela de uma revendedora: a maleta que está com ela e o histórico.
 *
 *  Os números saem das mesmas funções da Visão Geral — §6.1 inclusive, o
 *  preço congelado no envio. Duas contas diferentes para o mesmo valor é
 *  como a tela e o acerto passam a discordar. */
export function RevendedoraPage({ estado, revendedora, aoCriarMaleta }: Props) {
  const produtos = new Map(estado.produtos.map((p) => [p.sku, p]));
  const aberta = maletaAbertaDe(estado, revendedora.id);
  const fechadas = estado.maletas
    .filter((m) => m.revId === revendedora.id && maletaEncerrada(m))
    .sort((a, b) => (b.encerradaEm || '').localeCompare(a.encerradaEm || ''));

  const situacao = aberta ? situacaoMaleta(aberta, estado.config.prazoDias) : null;
  const pecas = aberta ? qtdMaleta(aberta) : 0;
  const valor = aberta ? valMaleta(aberta, produtos) : 0;

  const linhas = aberta
    ? Object.entries(aberta.itens)
        .map(([sku, qtd]) => {
          const p = produtos.get(sku);
          return {
            sku,
            qtd,
            desc: p ? p.desc : '(fora do catálogo)',
            cat: p ? p.cat || 'Outros' : 'Outros',
            preco: precoEnvio(aberta, sku, produtos),
          };
        })
        .sort((a, b) => a.cat.localeCompare(b.cat) || a.sku.localeCompare(b.sku))
    : [];

  const acc: Record<string, number> = {};
  for (const l of linhas) acc[l.cat] = (acc[l.cat] || 0) + l.qtd;
  const fatias = Object.entries(acc)
    .map(([cat, qtd]) => ({ cat, qtd, cor: corDaCategoria(estado.categorias, cat) }))
    .sort((a, b) => b.qtd - a.qtd);

  return (
    <>
      <Kpis>
        <Kpi
          rotulo="Peças com ela"
          valor={pecas}
          acento="rua"
          nota={aberta ? `Maleta ${aberta.id}` : 'Nenhuma maleta aberta'}
        />
        <Kpi rotulo="Valor na mão" valor={money(valor)} acento="valor" compacto nota="Preço do envio" />
        <Kpi
          rotulo="Acerto"
          valor={aberta ? fmtData(prazoDe(aberta, estado.config.prazoDias)) : '—'}
          acento="marca"
          compacto
          nota={situacao ? situacao.texto : 'Sem maleta na rua'}
        />
        <Kpi
          rotulo="Maletas fechadas"
          valor={fechadas.length}
          acento="casa"
          nota={revendedora.cidade || revendedora.tel || 'Histórico dela'}
        />
      </Kpis>

      {!aberta ? (
        <EmptyState
          titulo={`${revendedora.nome} não está com nenhuma maleta`}
          descricao="Monte uma maleta a partir do estoque em casa — o fluxo mostra a sugestão, deixa você revisar peça por peça, e só grava na confirmação."
          acoes={
            <button type="button" className="btn btn-escrita" onClick={aoCriarMaleta}>
              + Criar maleta para {revendedora.nome}
            </button>
          }
        />
      ) : (
        <Colunas>
          <Painel titulo={`Maleta ${aberta.id}`} dica="O que saiu, ao preço do envio" semPadding>
            <div className="tabela-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Peça</th>
                    <th>Categoria</th>
                    <th>Qtd</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.sku}>
                      <td className="sku">{l.sku}</td>
                      <td>{l.desc}</td>
                      <td>{l.cat}</td>
                      <td>{l.qtd}</td>
                      <td>{l.preco === null ? <i>Sem preço</i> : money(l.qtd * l.preco)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Painel>

          <Painel titulo="Mix da maleta" dica="Como as peças se distribuem">
            <Donut dados={fatias} legendaCentro="nesta maleta" textoVazio="Maleta ainda vazia." />
          </Painel>
        </Colunas>
      )}

      <Painel titulo="Histórico" dica="Maletas encerradas" semPadding>
        {!fechadas.length ? (
          <EmptyState titulo="Nenhuma maleta encerrada ainda" />
        ) : (
          <ul className="historico">
            {fechadas.map((m) => (
              <li key={m.id}>
                <span className="quando">
                  <b>{fmtData(m.encerradaEm)}</b>
                  Maleta {m.id}
                </span>
                <ResumoAcerto maleta={m} />
              </li>
            ))}
          </ul>
        )}
      </Painel>

      {aberta && (
        <p className="rodape-acao">
          <StatusBadge tom={situacao!.tom}>{situacao!.texto}</StatusBadge>{' '}
          O acerto e a devolução seguem no painel clássico. Aqui você monta a próxima maleta.
          <button type="button" className="btn btn-leitura btn-sm" onClick={aoCriarMaleta}>
            + Criar outra maleta
          </button>
        </p>
      )}
    </>
  );
}

interface Acerto {
  enviadas?: number;
  devolvidas?: number;
  vendidas?: number;
  totalVendido?: number;
  comissao?: number;
  liquido?: number;
}

/** O acerto vem do backend como JSON solto (`maletas.acerto_json`). Só os
 *  campos que a tela usa são lidos, e cada um pode faltar numa maleta
 *  antiga — por isso nada aqui assume presença. */
function ResumoAcerto({ maleta }: { maleta: Suitcase }) {
  const a = (maleta.acerto ?? null) as Acerto | null;
  if (!a) return <span className="stat">sem resumo gravado</span>;
  return (
    <>
      <span className="stat">
        Enviadas<b>{a.enviadas ?? '—'}</b>
      </span>
      <span className="stat">
        Vendidas<b>{a.vendidas ?? '—'}</b>
      </span>
      <span className="stat">
        Vendido<b>{a.totalVendido === undefined ? '—' : money(a.totalVendido)}</b>
      </span>
      <span className="stat">
        Comissão<b>{a.comissao === undefined ? '—' : money(a.comissao)}</b>
      </span>
      <span className="espaco" />
      <span className="stat">
        {a.devolvidas ?? 0} {plural(a.devolvidas ?? 0, 'devolvida', 'devolvidas')}
      </span>
    </>
  );
}
