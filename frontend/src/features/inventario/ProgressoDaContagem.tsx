import { useMemo } from 'react';
import { Icone } from '../../components/Icone';
import { plural } from '../../domain/formato';
import {
  TODAS, caminhoDaEvolucao, evolucaoDaSessao, fatiaSelecionada, progressoDaContagem,
  type ContadoDaContagem, type EsperadoDaContagem,
} from './progresso';

interface Props {
  esperados: EsperadoDaContagem[];
  contados: Map<string, ContadoDaContagem>;
  /** A categoria filtrada, ou `TODAS`. Vive no pai porque a LISTA da
   *  contagem segue o mesmo filtro — dois estados separados divergiriam. */
  categoria: string;
  aoFiltrar: (cat: string) => void;
}

/** PROGRESSO DA CONFERÊNCIA — a tela dizendo, enquanto ela conta, onde ela
 *  está.
 *
 *  O que esta seção NÃO é, e é por isso que ela tem um arquivo só para si:
 *
 *   · não é mais quatro cartões. O rodapé já conta faltando/sobrando, e
 *     repeti-los aqui daria quatro números ao lado de outros quatro;
 *   · não é um gráfico de "encontrado × faltando". Durante a contagem esse
 *     gráfico seria uma mentira: o que não foi bipado não sumiu, só não foi
 *     olhado. Ver o cabeçalho de `progresso.ts`;
 *   · não é decoração. Cada elemento responde a uma pergunta que quem está
 *     de pé com o telefone na mão faz em voz alta: quanto falta percorrer,
 *     qual gaveta ainda não abri, e isto está andando?
 *
 *  A composição é a do Design System, sem componente novo: `.mq-bars` +
 *  `.mq-meter` são as mesmas barras de "Principais categorias" do painel de
 *  Estoque, e `.mq-chipset` é o mesmo filtro de Catálogo e A Receber. O que
 *  esta tela acrescenta é o arranjo, não vocabulário.
 */
export function ProgressoDaContagem({ esperados, contados, categoria, aoFiltrar }: Props) {
  const p = useMemo(() => progressoDaContagem(esperados, contados), [esperados, contados]);
  const fatia = fatiaSelecionada(p, categoria);

  /* A curva do acumulado. Some com menos de dois momentos distintos: um
     eixo com um traço é ruído com aparência de informação. */
  const evolucao = useMemo(
    () => evolucaoDaSessao([...contados.values()]),
    [contados],
  );
  const caminho = caminhoDaEvolucao(evolucao);

  if (!esperados.length) return null;

  const restam = fatia.codigos - fatia.visitados;

  return (
    <section className="mq-card__body inventory-progress-panel" aria-label="Progresso da conferência">
      <header className="progress-head">
        <div>
          <p className="mq-eyebrow">Progresso da conferência</p>
          <h3 className="mq-title">
            {fatia.cat === TODAS ? 'Todo o estoque em casa' : fatia.rotulo}
          </h3>
        </div>

        {/* O NÚMERO GRANDE é a cobertura, e o miúdo embaixo diz de quê —
            "de 790 códigos" tira a ambiguidade entre código e peça, que é
            a confusão mais cara desta tela. */}
        <p className="progress-figure">
          <strong>{fatia.pct}%</strong>
          <small>
            {fatia.visitados} de {fatia.codigos} {plural(fatia.codigos, 'código', 'códigos')}
          </small>
        </p>
      </header>

      <div className="progress-bar" role="img" aria-label={`${fatia.pct}% dos códigos percorridos`}>
        <span className="mq-meter"><i style={{ width: `${fatia.pct}%` }} /></span>
      </div>

      {/* Os TRÊS números que sobram depois da barra. Peças contadas vai sem
          denominador de propósito: contar 2 onde o sistema diz 3 é um
          resultado legítimo, e uma fração ali transformaria toda diferença
          em aparência de contagem incompleta. */}
      <dl className="mq-figures progress-figures">
        <div className="is-brand">
          <dt>Peças conferidas</dt>
          <dd>{fatia.pecasContadas.toLocaleString('pt-BR')}</dd>
          <small>somadas de tudo que você bipou</small>
        </div>
        <div>
          <dt>Ainda não visitados</dt>
          <dd>{restam.toLocaleString('pt-BR')}</dd>
          <small>
            {restam === 0
              ? 'você percorreu tudo desta seleção'
              : `${plural(restam, 'código', 'códigos')} sem nenhum bipe — não é falta`}
          </small>
        </div>
        <div>
          <dt>O sistema diz</dt>
          <dd>{fatia.pecasEsperadas.toLocaleString('pt-BR')}</dd>
          <small>peças que deveriam estar em casa</small>
        </div>
      </dl>

      {/* O FILTRO. As categorias saem dos dados (`produtos.cat`, via
          `esperados`), nunca de uma lista escrita aqui — ver `progresso.ts`. */}
      {p.categorias.length > 1 && (
        <div className="mq-chipset progress-filtro" role="group" aria-label="Categoria">
          <button
            type="button"
            aria-pressed={categoria === TODAS}
            onClick={() => aoFiltrar(TODAS)}
          >
            Todos <span className="mq-badge mq-badge--quiet">{p.total.codigos}</span>
          </button>
          {p.categorias.map((f) => (
            <button
              key={f.cat}
              type="button"
              aria-pressed={categoria === f.cat}
              onClick={() => aoFiltrar(f.cat)}
            >
              {f.rotulo} <span className="mq-badge mq-badge--quiet">{f.codigos}</span>
            </button>
          ))}
        </div>
      )}

      {/* AS BARRAS POR CATEGORIA — a pergunta "qual gaveta ainda não abri".
          A categoria filtrada fica acesa em vez de sumir: esconder as outras
          tiraria justamente a comparação que faz a barra valer a pena. */}
      {p.categorias.length > 1 && (
        <div className="mq-bars progress-bars">
          {p.categorias.map((f) => (
            <button
              type="button"
              className={`mq-bars__row progress-row${categoria === f.cat ? ' is-on' : ''}`}
              key={f.cat}
              aria-pressed={categoria === f.cat}
              onClick={() => aoFiltrar(categoria === f.cat ? TODAS : f.cat)}
            >
              <span>{f.rotulo}</span>
              <span className={f.pct === 100 ? 'mq-meter mq-meter--ok' : 'mq-meter'}>
                <i style={{ width: `${f.pct}%` }} />
              </span>
              <b>
                {f.pct}%
                <small>{f.visitados}/{f.codigos}</small>
              </b>
            </button>
          ))}
        </div>
      )}

      {/* A EVOLUÇÃO DA SESSÃO, discreta. Acumulada: uma curva que sobe e
          desce pareceria problema quando é só o ritmo de quem atendeu uma
          cliente no meio da contagem. */}
      {caminho && (
        <figure className="progress-spark">
          <figcaption>
            <span className="mq-eyebrow">Peças conferidas ao longo da sessão</span>
            <span className="mq-hint">
              0 <i aria-hidden="true">—</i> {p.total.pecasContadas.toLocaleString('pt-BR')}
            </span>
          </figcaption>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
            aria-label={`A contagem subiu até ${p.total.pecasContadas} peças nesta sessão`}>
            <path d={caminho} vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="progress-spark__eixo">
            <small>início</small>
            <small>agora</small>
          </span>
        </figure>
      )}

      <p className="mq-note mq-note--info progress-regra">
        <Icone nome="alert" />
        <span>
          A barra mede <b>quanto do estoque você já percorreu</b>, não quanto
          está faltando. Código sem bipe é código que ninguém olhou ainda — e
          enquanto o inventário estiver aberto ele não vira falta nenhuma.
        </span>
      </p>
    </section>
  );
}
