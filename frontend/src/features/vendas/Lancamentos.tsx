import { Icone } from '../../components/Icone';
import type { NomeIcone } from '../../components/Icone';

export type TipoDeLancamento = 'venda' | 'colar' | 'saida';

interface Opcao {
  id: TipoDeLancamento;
  rotulo: string;
  sub: string;
  explica: string;
  icone: NomeIcone;
}

/** Os TRÊS lançamentos do protótipo. Não são três telas soltas: são as três
 *  maneiras de uma peça sair do estoque, e o que as separa é o que acontece
 *  com o dinheiro.
 *
 *    venda normal   peça com etiqueta → vira faturamento
 *    monte seu colar composição física → UMA linha comercial, vários movimentos
 *    saída          brinde, uso próprio, perda, sorteio → NÃO vira faturamento
 *
 *  Mostrar as três juntas é o ponto: quem está com a cliente na frente
 *  escolhe aqui, e não precisa saber que "saída sem faturamento" mora noutro
 *  módulo do menu.
 */
export const LANCAMENTOS: Opcao[] = [
  {
    id: 'venda',
    rotulo: 'Venda normal',
    sub: 'Peças com etiqueta',
    explica: 'Uma ou mais peças do catálogo, com preço, desconto e pagamento.',
    icone: 'sale',
  },
  {
    id: 'colar',
    rotulo: 'Monte seu Colar',
    sub: 'Modelo e composição',
    explica: 'Corrente e pingentes escolhidos. Sai como UMA peça comercial e baixa cada componente.',
    icone: 'star',
  },
  {
    id: 'saida',
    rotulo: 'Saída sem faturamento',
    sub: 'Brinde, uso próprio, perda ou sorteio',
    explica: 'A peça sai do estoque e NÃO entra em faturamento, ticket médio nem ranking.',
    icone: 'box',
  },
];

interface Props {
  aoEscolher: (tipo: TipoDeLancamento) => void;
  /** O que o rodapé mostra do dia: quantas vendas e quanto entrou. */
  resumoDoDia?: { vendas: number; valor: number; texto: string } | null;
}

/** LANÇAMENTOS — a porta da operação do dia. */
export function Lancamentos({ aoEscolher, resumoDoDia }: Props) {
  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Operação do dia</p>
          <h1 className="mq-display">Novo lançamento</h1>
          <p className="mq-lede">
            Escolha o que aconteceu. As três saem do estoque; só a primeira e a
            segunda viram dinheiro.
          </p>
        </div>
      </div>

      <div className="mq-grid mq-grid--3" role="group" aria-label="Tipo de lançamento">
        {LANCAMENTOS.map((o) => (
          <button
            type="button"
            key={o.id}
            className="mq-card mq-card--pad mq-escolha"
            onClick={() => aoEscolher(o.id)}
          >
            <span className="mq-item__icon mq-item__icon--brand"><Icone nome={o.icone} /></span>
            <b className="mq-title">{o.rotulo}</b>
            <small className="mq-eyebrow">{o.sub}</small>
            <p className="mq-lede">{o.explica}</p>
            <span className="mq-btn mq-btn--ghost mq-btn--sm">
              Abrir <Icone nome="arrow" />
            </span>
          </button>
        ))}
      </div>

      {resumoDoDia && (
        <section className="mq-card mq-card--pad mq-card--quiet">
          <h2 className="mq-title">Hoje</h2>
          <p className="mq-lede">{resumoDoDia.texto}</p>
        </section>
      )}
    </>
  );
}
