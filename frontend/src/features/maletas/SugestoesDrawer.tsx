import type { AppState } from '../../types/api';
import { Drawer } from '../../components/Drawer';
import { EmptyState } from '../../components/EmptyState';
import { money, plural, pctTexto } from '../../domain/formato';
import { ROTULO_MODO, type ConfigPlanejamento } from '../../domain/capacidade';
import { gerarSugestoes, type Sugestao } from '../../domain/sugestoes';

interface Props {
  aberto: boolean;
  estado: AppState;
  config: ConfigPlanejamento;
  /** Quando informado, a proposta "Equilibrada" usa o histórico desta
   *  pessoa em vez da composição do estoque. */
  pesosPorCategoria?: Record<string, number>;
  aoFechar: () => void;
  aoCriarDaSugestao: (s: Sugestao) => void;
}

/** Três propostas, nunca mais. E fora da primeira tela, de propósito: a
 *  Visão Geral responde "quantas maletas dá para montar"; "qual maleta
 *  montar" é a pergunta seguinte, e ela merece espaço próprio. */
export function SugestoesDrawer({
  aberto,
  estado,
  config,
  pesosPorCategoria,
  aoFechar,
  aoCriarDaSugestao,
}: Props) {
  const sugestoes = aberto
    ? gerarSugestoes(estado, config, pesosPorCategoria ? { pesosPorCategoria } : {})
    : [];
  const temAlguma = sugestoes.some((s) => s.pecas > 0);

  return (
    <Drawer
      aberto={aberto}
      titulo="Sugestões de maleta"
      sub={`Modo ${ROTULO_MODO[config.modo]} · alvo de ${config.tamanhoAlvo} peças. Nenhuma proposta usa peça que não exista em casa.`}
      aoFechar={aoFechar}
      largura="largo"
    >
      {!temAlguma ? (
        <EmptyState
          titulo="Não há peças liberadas suficientes"
          descricao="Com a reserva escolhida, o estoque em casa não libera peça para montar uma maleta. Tente o modo Agressivo, reduza as peças por maleta, ou aguarde a entrada de mercadoria."
        />
      ) : (
        <div className="sugestoes">
          {sugestoes.map((s) => (
            <CartaoSugestao key={s.estrategia} s={s} aoCriar={() => aoCriarDaSugestao(s)} />
          ))}
        </div>
      )}
    </Drawer>
  );
}

function CartaoSugestao({ s, aoCriar }: { s: Sugestao; aoCriar: () => void }) {
  const vazia = s.pecas === 0;

  return (
    <article className="sugestao">
      <header>
        <h3>{s.nome}</h3>
        <p className="explica">{s.explicacao}</p>
      </header>

      <div className="sug-numeros">
        <div>
          <span className="rot">Peças</span>
          <b>{s.pecas}</b>
        </div>
        <div>
          <span className="rot">Valor estimado</span>
          <b>{money(s.valor)}</b>
        </div>
        <div>
          <span className="rot">Códigos</span>
          <b>{s.itens.length}</b>
        </div>
      </div>

      {!s.atingiuAlvo && !vazia && (
        <p className="sug-aviso">
          O estoque liberado deu {s.pecas} de {s.alvo} peças. A proposta para no que existe — não
          completa com peça que não há.
        </p>
      )}

      <div className="sug-comp">
        <span className="rot">Composição</span>
        <ul className="barras">
          {s.porCategoria.map((c) => (
            <li key={c.cat}>
              <span className="ponto" style={{ background: c.cor }} aria-hidden="true" />
              <span className="nome">{c.cat}</span>
              <span className="barra" aria-hidden="true">
                <i style={{ width: `${(c.qtd / s.pecas) * 100}%`, background: c.cor }} />
              </span>
              <span className="qt">
                {c.qtd} · {pctTexto(c.qtd, s.pecas)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="sug-impacto">
        <div>
          <dt>Em casa depois</dt>
          <dd>
            {s.emCasaAntes} → <b>{s.emCasaDepois}</b> {plural(s.emCasaDepois, 'peça', 'peças')}
          </dd>
        </div>
        <div>
          <dt>Reserva preservada</dt>
          <dd>
            {s.reservaMinima} {plural(s.reservaMinima, 'peça', 'peças')}
          </dd>
        </div>
      </dl>

      <p className="sug-base">{s.base}</p>

      <button type="button" className="btn btn-escrita btn-sm" disabled={vazia} onClick={aoCriar}>
        Criar esta maleta
      </button>
    </article>
  );
}
