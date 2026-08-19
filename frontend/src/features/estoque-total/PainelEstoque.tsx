import { useState } from 'react';
import type { AppState } from '../../types/api';
import { Kpi, Kpis } from '../../components/Kpi';
import { Painel, Colunas } from '../../components/Painel';
import { Donut } from '../../components/Donut';
import { StatusBadge } from '../../components/StatusBadge';
import { money, plural } from '../../domain/formato';
import {
  inconsistencias,
  porCategoria,
  semPreco,
  totaisEstoque,
  type EscopoCategoria,
} from '../../domain/estoque';
import { calcularCapacidade } from '../../domain/capacidade';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';

const ESCOPOS: { chave: EscopoCategoria; rotulo: string; centro: string; vazio: string }[] = [
  { chave: 'total', rotulo: 'Estoque total', centro: 'no total', vazio: 'Sem peças para mostrar.' },
  { chave: 'casa', rotulo: 'Em casa', centro: 'em casa', vazio: 'Nada em casa no momento.' },
  {
    chave: 'fora',
    rotulo: 'Com revendedoras',
    centro: 'na rua',
    vazio: 'Nenhuma peça está com revendedoras no momento.',
  },
];

interface Props {
  estado: AppState;
  planejamento: UsoPlanejamento;
  /** Leva para Revendedoras › Visão Geral, onde o módulo de maletas mora
   *  inteiro. Aqui existe só o resumo. */
  aoVerPlanejamento: () => void;
}

/** O dashboard inicial do Estoque Total.
 *
 *  Cinco números, um gráfico e o que precisa de gente. As ações de
 *  importação (Atualizar Estoque Total, Adicionar Peças Novas) continuam
 *  logo abaixo, intocadas — o painel situa antes de agir, não substitui a
 *  ação. */
export function PainelEstoque({ estado, planejamento, aoVerPlanejamento }: Props) {
  const [escopo, setEscopo] = useState<EscopoCategoria>('total');
  const t = totaisEstoque(estado);
  const inc = inconsistencias(estado);
  const sp = semPreco(estado);
  const cap = calcularCapacidade(estado, planejamento.config);

  /* Nem tudo que está em casa pode ir para a loja: a sincronização recusa
     código duplicado, código com peça em maleta e código sem repartição de
     variação. `loja.variacoes` é a lista que ELA gravou, não uma conta
     feita aqui — ver docs/SYNC_ENGINE.md. */
  const travados = estado.loja?.variacoes ?? [];
  const pecasTravadas = travados.reduce((s, v) => s + (v.casa || 0), 0);
  const temRetratoDaLoja = !!estado.loja?.lidoEm;

  const pendencias =
    inc.length + sp.length + (estado.loja?.duplicados.length ?? 0) + travados.length;

  return (
    <>
      <Kpis>
        <Kpi
          rotulo="Estoque total"
          valor={t.total}
          acento="marca"
          nota={
            <>
              {t.codigos} {plural(t.codigos, 'código', 'códigos')} · {money(t.valTotal)}
            </>
          }
        />
        <Kpi
          rotulo="Em casa"
          valor={t.casa}
          acento="casa"
          nota={<>{money(t.valCasa)} parados aqui</>}
        />
        <Kpi
          rotulo="Com revendedoras"
          valor={t.fora}
          acento="rua"
          nota={<>{money(t.valFora)} na rua</>}
        />
        <Kpi
          rotulo="Disponível para Nuvemshop"
          valor={temRetratoDaLoja ? t.casa - pecasTravadas : t.casa}
          acento="valor"
          nota={
            !temRetratoDaLoja ? (
              'A loja ainda não foi lida — este é o número de casa, sem descontar travas.'
            ) : pecasTravadas > 0 ? (
              <>
                {pecasTravadas} {plural(pecasTravadas, 'peça está', 'peças estão')} em códigos que a
                sincronização não empurra
              </>
            ) : (
              'Nenhum código travado na última leitura da loja'
            )
          }
        />
      </Kpis>

      <Colunas>
        <Painel
          titulo="Por categoria"
          dica="Quanto de cada tipo de peça você tem"
          acoes={
            <div className="seg" role="group" aria-label="Escopo do gráfico">
              {ESCOPOS.map((e) => (
                <button
                  key={e.chave}
                  type="button"
                  aria-pressed={escopo === e.chave}
                  onClick={() => setEscopo(e.chave)}
                >
                  {e.rotulo}
                </button>
              ))}
            </div>
          }
        >
          <Donut
            dados={porCategoria(estado, escopo)}
            legendaCentro={ESCOPOS.find((e) => e.chave === escopo)!.centro}
            textoVazio={ESCOPOS.find((e) => e.chave === escopo)!.vazio}
          />
        </Painel>

        <div className="pilha">
          <Painel
            titulo="Potencial para consignação"
            dica="Resumo — o planejamento mora em Revendedoras"
            acoes={
              <button type="button" className="btn btn-leitura btn-sm" onClick={aoVerPlanejamento}>
                Ver planejamento
              </button>
            }
          >
            <div className="resumo-capacidade">
              <div className="numero">{cap.maletas}</div>
              <div className="texto">
                {plural(cap.maletas, 'nova maleta', 'novas maletas')} de {cap.tamanhoAlvo} peças,
                mantendo {cap.reservaPct}% de cada código em casa.
                <br />
                <span className="secundario">
                  {cap.consignavel} de {cap.emCasa} peças liberadas · premissa configurável, não
                  regra do sistema.
                </span>
              </div>
            </div>
          </Painel>

          <Painel titulo="Saúde do estoque" dica="O que precisa de uma pessoa">
            {pendencias === 0 ? (
              <p className="tudo-certo">
                <StatusBadge tom="positivo" ponto>
                  Nada pendente
                </StatusBadge>{' '}
                A razão fecha e nenhum código está travado para a loja.
              </p>
            ) : (
              <ul className="lista-saude">
                {inc.length > 0 && (
                  <li>
                    <StatusBadge tom="critico">{inc.length}</StatusBadge>
                    <div>
                      <b>
                        {plural(inc.length, 'código tem', 'códigos têm')} mais peças na rua do que no
                        cadastro
                      </b>
                      <p>
                        Costuma ser código com sufixo ({inc.slice(0, 3).map((i) => i.sku).join(', ')}
                        {inc.length > 3 ? '…' : ''}) que saiu na maleta pelo código-base. Corrija o
                        total em Atualizar Estoque Total.
                      </p>
                    </div>
                  </li>
                )}
                {sp.length > 0 && (
                  <li>
                    <StatusBadge tom="atencao">{sp.length}</StatusBadge>
                    <div>
                      <b>{plural(sp.length, 'código sem preço', 'códigos sem preço')}</b>
                      <p>
                        §24: sem preço não dá para vender nem encerrar acerto. Estas peças ficam
                        fora de qualquer sugestão de maleta.
                      </p>
                    </div>
                  </li>
                )}
                {(estado.loja?.duplicados.length ?? 0) > 0 && (
                  <li>
                    <StatusBadge tom="critico">{estado.loja!.duplicados.length}</StatusBadge>
                    <div>
                      <b>
                        {plural(
                          estado.loja!.duplicados.length,
                          'código duplicado na loja',
                          'códigos duplicados na loja',
                        )}
                      </b>
                      <p>
                        O mesmo SKU em mais de um anúncio — a sincronização não sabe em qual mexer e
                        não mexe em nenhum.
                      </p>
                    </div>
                  </li>
                )}
                {travados.length > 0 && (
                  <li>
                    <StatusBadge tom="atencao">{travados.length}</StatusBadge>
                    <div>
                      <b>
                        {plural(
                          travados.length,
                          'código não empurrado para a loja',
                          'códigos não empurrados para a loja',
                        )}
                      </b>
                      <p>
                        Variação sem repartição, peça em maleta ou cadastro duplicado. Os detalhes
                        estão na aba Nuvemshop.
                      </p>
                    </div>
                  </li>
                )}
              </ul>
            )}
          </Painel>
        </div>
      </Colunas>
    </>
  );
}
