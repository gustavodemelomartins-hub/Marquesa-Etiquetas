import { useEffect, useMemo, useState } from 'react';
import type { AppState } from '../../types/api';
import type { Connection } from '../../services/client';
import { Drawer } from '../../components/Drawer';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { money, hojeISO, plural, addDias } from '../../domain/formato';
import { RESERVA_POR_MODO, ROTULO_MODO, type ConfigPlanejamento } from '../../domain/capacidade';
import { gerarSugestoes, pesosDaRevendedora, type EstrategiaSugestao, type ItemSugerido, type Sugestao } from '../../domain/sugestoes';
import { adicionarItens, criarMaleta, type ItemRecusado } from './api';

type Etapa = 'revendedora' | 'estrategia' | 'revisao' | 'confirmacao' | 'enviando' | 'resultado';

interface Props {
  aberto: boolean;
  estado: AppState;
  conexao: Connection;
  config: ConfigPlanejamento;
  /** Quando o fluxo começa a partir de "Criar esta maleta" numa sugestão. */
  sugestaoInicial?: Sugestao | null;
  /** Quando o fluxo começa de dentro da aba de uma revendedora. */
  revendedoraInicial?: number | null;
  aoFechar: () => void;
  /** Chamado depois de criar, para a tela reler `GET /api/state`. */
  aoConcluir: () => void;
}

interface Resultado {
  maletaId: number;
  adicionados: number;
  recusados: ItemRecusado[];
  pecas: number;
}

/** Criar maleta é uma sequência, nunca um botão.
 *
 *  revendedora → estratégia → sugestão → revisão das peças → confirmação →
 *  criação. Clicar em "+ Criar maleta" abre esta sequência; ela só escreve
 *  no passo de confirmação, e o passo de confirmação diz exatamente o que
 *  vai acontecer (regra 3: nenhuma peça muda de lugar sem um movimento que
 *  explique).
 *
 *  A criação usa os MESMOS endpoints do painel legado — não existe uma
 *  segunda implementação de maleta aqui. Ver o cabeçalho de `api.ts` para
 *  a lacuna dos dois passos. */
export function CriarMaletaFluxo({
  aberto,
  estado,
  conexao,
  config,
  sugestaoInicial,
  revendedoraInicial,
  aoFechar,
  aoConcluir,
}: Props) {
  const [etapa, setEtapa] = useState<Etapa>('revendedora');
  const [revId, setRevId] = useState<number | null>(null);
  const [estrategia, setEstrategia] = useState<EstrategiaSugestao>('equilibrada');
  const [alvo, setAlvo] = useState(config.tamanhoAlvo);
  const [usarHistorico, setUsarHistorico] = useState(false);
  const [itens, setItens] = useState<ItemSugerido[]>([]);
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [acertoEm, setAcertoEm] = useState('');
  const [erro, setErro] = useState<unknown>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const ativas = useMemo(
    () => estado.revendedoras.filter((r) => r.status !== 'inativa'),
    [estado.revendedoras],
  );

  /* Reabrir o fluxo tem que começar do zero: uma revisão pela metade
     guardada de uma abertura anterior é a forma mais fácil de consignar a
     peça errada para a pessoa errada. */
  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setResultado(null);
    setAlvo(config.tamanhoAlvo);
    setAcertoEm(addDias(hojeISO(), estado.config.prazoDias));
    setUsarHistorico(false);

    if (sugestaoInicial) {
      setEstrategia(sugestaoInicial.estrategia);
      setItens(sugestaoInicial.itens);
      setQuantidades(Object.fromEntries(sugestaoInicial.itens.map((i) => [i.sku, i.qtd])));
    } else {
      setEstrategia('equilibrada');
      setItens([]);
      setQuantidades({});
    }

    const rev = revendedoraInicial ?? null;
    setRevId(rev);
    setEtapa(rev ? (sugestaoInicial ? 'revisao' : 'estrategia') : 'revendedora');
  }, [aberto, sugestaoInicial, revendedoraInicial, config.tamanhoAlvo, estado.config.prazoDias]);

  function gerar() {
    const pesos = usarHistorico && revId !== null ? pesosDaRevendedora(estado, revId) : undefined;
    const temPeso = pesos && Object.values(pesos).some((n) => n > 0);
    const s = gerarSugestoes(estado, config, {
      alvo,
      ...(temPeso ? { pesosPorCategoria: pesos } : {}),
    }).find((x) => x.estrategia === estrategia);
    setItens(s ? s.itens : []);
    setQuantidades(s ? Object.fromEntries(s.itens.map((i) => [i.sku, i.qtd])) : {});
    setEtapa('revisao');
  }

  function mudarQtd(sku: string, valor: number, limite: number) {
    const q = Math.max(0, Math.min(limite, Math.round(valor) || 0));
    setQuantidades((atual) => ({ ...atual, [sku]: q }));
  }

  const revisados = itens
    .map((i) => ({ ...i, qtd: quantidades[i.sku] ?? 0 }))
    .filter((i) => i.qtd > 0);
  const totalPecas = revisados.reduce((s, i) => s + i.qtd, 0);
  const totalValor = revisados.reduce((s, i) => s + i.qtd * (i.preco || 0), 0);
  const revNome = ativas.find((r) => r.id === revId)?.nome ?? '';

  /* Trava de tela. A palavra final continua sendo do servidor, que recusa
     `qtd > disponivel` peça por peça — mas mandar um número impossível
     para descobrir isso seria desperdiçar a viagem. */
  const excedidos = revisados.filter((i) => i.qtd > i.limite);

  async function confirmar() {
    if (revId === null || !revisados.length) return;
    setEtapa('enviando');
    setErro(null);
    try {
      const maleta = await criarMaleta(conexao, {
        revId,
        abertaEm: hojeISO(),
        acertoEm: acertoEm || null,
      });
      const r = await adicionarItens(
        conexao,
        maleta.id,
        Object.fromEntries(revisados.map((i) => [i.sku, i.qtd])),
      );
      setResultado({
        maletaId: maleta.id,
        adicionados: r.adicionados,
        recusados: r.recusados || [],
        pecas: totalPecas,
      });
      setEtapa('resultado');
      aoConcluir();
    } catch (e) {
      setErro(e);
      setEtapa('confirmacao');
    }
  }

  const passo =
    etapa === 'revendedora' ? 1 : etapa === 'estrategia' ? 2 : etapa === 'revisao' ? 3 : 4;

  return (
    <Drawer
      aberto={aberto}
      titulo="Criar maleta"
      sub={
        etapa === 'resultado'
          ? undefined
          : `Passo ${passo} de 4 · nada é gravado até você confirmar`
      }
      aoFechar={aoFechar}
      largura="largo"
    >
      {!!erro && <ErrorState erro={erro} />}

      {etapa === 'revendedora' && (
        <section className="fluxo-etapa">
          <h3>Para quem é esta maleta?</h3>
          {!ativas.length ? (
            <EmptyState
              titulo="Nenhuma revendedora ativa"
              descricao="Cadastre uma revendedora antes de montar a maleta."
            />
          ) : (
            <ul className="escolha-lista">
              {ativas.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="escolha"
                    aria-pressed={revId === r.id}
                    onClick={() => setRevId(r.id)}
                  >
                    <b>{r.nome}</b>
                    {r.cidade && <span>{r.cidade}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="fluxo-acoes">
            <button
              type="button"
              className="btn btn-analise"
              disabled={revId === null}
              onClick={() => setEtapa(itens.length ? 'revisao' : 'estrategia')}
            >
              Continuar
            </button>
          </div>
        </section>
      )}

      {etapa === 'estrategia' && (
        <section className="fluxo-etapa">
          <h3>Quantas peças, e com que critério?</h3>
          <div className="fluxo-campos">
            <label className="campo">
              <span>Peças na maleta</span>
              <input
                type="number"
                min={1}
                value={alvo}
                onChange={(e) => setAlvo(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <div className="campo">
              <span>Critério</span>
              <div className="seg" role="group" aria-label="Critério da sugestão">
                {(['equilibrada', 'giro', 'premium'] as EstrategiaSugestao[]).map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={estrategia === e}
                    onClick={() => setEstrategia(e)}
                  >
                    {e === 'equilibrada' ? 'Equilibrada' : e === 'giro' ? 'Giro rápido' : 'Premium'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="caixa">
            <input
              type="checkbox"
              checked={usarHistorico}
              onChange={(e) => setUsarHistorico(e.target.checked)}
            />
            <span>
              Usar o histórico {revNome ? `da ${revNome}` : 'desta revendedora'} para pesar as
              categorias — o que ela já levou em maletas anteriores. Sem histórico, o critério
              escolhido vale como está.
            </span>
          </label>
          <p className="fluxo-nota">
            Modo {ROTULO_MODO[config.modo]}: {RESERVA_POR_MODO[config.modo]}% de cada código fica em
            casa. Nenhuma peça é proposta além do que essa reserva liberou.
          </p>
          <div className="fluxo-acoes">
            <button type="button" className="btn btn-leitura" onClick={() => setEtapa('revendedora')}>
              Voltar
            </button>
            <button type="button" className="btn btn-analise" onClick={gerar}>
              Gerar sugestão
            </button>
          </div>
        </section>
      )}

      {etapa === 'revisao' && (
        <section className="fluxo-etapa">
          <h3>Revise as peças</h3>
          <p className="fluxo-nota">
            Ajuste ou zere o que não deve ir. O limite de cada linha é o que a reserva liberou
            daquele código — o servidor recusa qualquer número acima do disponível.
          </p>
          {!itens.length ? (
            <EmptyState
              titulo="A sugestão veio vazia"
              descricao="Com a reserva atual não há peça liberada. Volte e escolha um alvo menor, ou mude o modo de planejamento."
            />
          ) : (
            <div className="tabela-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Peça</th>
                    <th>Categoria</th>
                    <th>Em casa</th>
                    <th>Limite</th>
                    <th>Levar</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.sku}>
                      <td className="sku">{i.sku}</td>
                      <td>{i.desc}</td>
                      <td>{i.cat}</td>
                      <td>{i.emCasa}</td>
                      <td>{i.limite}</td>
                      <td>
                        <input
                          className="qtd"
                          type="number"
                          min={0}
                          max={i.limite}
                          value={quantidades[i.sku] ?? 0}
                          aria-label={`Quantidade de ${i.sku}`}
                          onChange={(e) => mudarQtd(i.sku, Number(e.target.value), i.limite)}
                        />
                      </td>
                      <td>{money((quantidades[i.sku] ?? 0) * (i.preco || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="fluxo-acoes">
            <button type="button" className="btn btn-leitura" onClick={() => setEtapa('estrategia')}>
              Voltar
            </button>
            <span className="fluxo-total">
              {totalPecas} {plural(totalPecas, 'peça', 'peças')} · {money(totalValor)}
            </span>
            <button
              type="button"
              className="btn btn-analise"
              disabled={!totalPecas || excedidos.length > 0}
              onClick={() => setEtapa('confirmacao')}
            >
              Revisar e confirmar
            </button>
          </div>
        </section>
      )}

      {(etapa === 'confirmacao' || etapa === 'enviando') && (
        <section className="fluxo-etapa">
          <h3>Confirmar a criação</h3>
          <div className="aviso" data-tom="atencao">
            <b>Isto grava.</b>
            <div className="corpo">
              Uma maleta será aberta para <b>{revNome}</b> com {totalPecas}{' '}
              {plural(totalPecas, 'peça', 'peças')} ({money(totalValor)}). Cada peça vira um
              movimento de consignação na razão — o estoque total não muda, mas as peças deixam de
              estar disponíveis em casa.
            </div>
          </div>
          <label className="campo">
            <span>Data combinada do acerto</span>
            <input type="date" value={acertoEm} onChange={(e) => setAcertoEm(e.target.value)} />
          </label>
          <p className="fluxo-nota">
            Sem data, o prazo passa a valer {estado.config.prazoDias} dias a partir de hoje.
          </p>
          {etapa === 'enviando' ? (
            <LoadingState>Criando a maleta e consignando as peças…</LoadingState>
          ) : (
            <div className="fluxo-acoes">
              <button type="button" className="btn btn-leitura" onClick={() => setEtapa('revisao')}>
                Voltar
              </button>
              <button type="button" className="btn btn-escrita" onClick={confirmar}>
                Criar maleta para {revNome}
              </button>
            </div>
          )}
        </section>
      )}

      {etapa === 'resultado' && resultado && (
        <section className="fluxo-etapa">
          <h3>Maleta {resultado.maletaId} criada</h3>
          <p className="fluxo-nota">
            {resultado.adicionados} {plural(resultado.adicionados, 'código', 'códigos')} consignados
            para {revNome}.
          </p>
          {resultado.recusados.length > 0 && (
            <div className="aviso" data-tom="critico">
              <b>
                {resultado.recusados.length}{' '}
                {plural(resultado.recusados.length, 'código foi recusado', 'códigos foram recusados')}{' '}
                pelo servidor.
              </b>
              <div className="corpo">
                A maleta existe e está aberta — o que entrou está lá, e o que não entrou não gerou
                movimento nenhum. Ajuste no painel clássico ou cancele a maleta.
                <ul className="lista-recusa">
                  {resultado.recusados.map((r) => (
                    <li key={r.sku}>
                      <code>{r.sku}</code> {r.desc ? `— ${r.desc}` : ''}: {r.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="fluxo-acoes">
            <button type="button" className="btn btn-analise" onClick={aoFechar}>
              Concluir
            </button>
          </div>
        </section>
      )}
    </Drawer>
  );
}
