export type TipoDeLancamento = 'venda' | 'colar' | 'saida';

interface Opcao {
  id: TipoDeLancamento;
  rotulo: string;
  sub: string;
}

/** Os TRÊS lançamentos do protótipo. Não são três telas soltas: são as três
 *  maneiras de uma peça sair do estoque, e o que as separa é o que acontece
 *  com o dinheiro.
 *
 *    venda normal    peça com etiqueta → vira faturamento
 *    monte seu colar composição física → UMA linha comercial, vários movimentos
 *    saída           brinde, uso próprio, perda, sorteio → NÃO vira faturamento
 *
 *  Mostrar as três JUNTAS, e mantê-las na tela depois da escolha, é o
 *  ponto. Quem está com a cliente na frente escolhe aqui e continua vendo
 *  as outras duas — trocar de ideia no meio é um clique, não voltar para
 *  um hub. A V2 navegava para outra rota e o seletor sumia: quem entrava
 *  em "Venda normal" não tinha mais como saber que "Saída sem faturamento"
 *  existia sem desfazer o caminho.
 */
export const LANCAMENTOS: Opcao[] = [
  { id: 'venda', rotulo: 'Venda normal', sub: 'Peças com etiqueta' },
  { id: 'colar', rotulo: 'Monte seu Colar', sub: 'Modelo e composição' },
  { id: 'saida', rotulo: 'Saída sem faturamento', sub: 'Brinde, uso próprio, perda ou sorteio' },
];

interface Props {
  /** `null` = nenhuma escolhida ainda, e a região operacional fica vazia
   *  com o convite para escolher. */
  ativo: TipoDeLancamento | null;
  aoEscolher: (tipo: TipoDeLancamento) => void;
}

/** O SELETOR de tipo de lançamento — a faixa de três que fica no topo de
 *  "Novo lançamento" e acompanha a operação inteira. */
export function SeletorDeLancamento({ ativo, aoEscolher }: Props) {
  return (
    <div className="mq-escolhas" role="radiogroup" aria-label="Tipo de lançamento">
      {LANCAMENTOS.map((o) => (
        <button
          type="button"
          key={o.id}
          role="radio"
          aria-checked={ativo === o.id}
          className={ativo === o.id ? 'mq-escolha is-ativa' : 'mq-escolha'}
          onClick={() => aoEscolher(o.id)}
        >
          <span>{o.rotulo}</span>
          <small>{o.sub}</small>
        </button>
      ))}
    </div>
  );
}

/** O cabeçalho de "Novo lançamento", igual em qualquer um dos três modos.
 *  Ele não muda quando o tipo muda: só a região abaixo muda, e é isso que
 *  faz a tela continuar sendo a mesma tela. */
export function CabecalhoDoLancamento() {
  return (
    <div className="mq-pagehead">
      <div className="mq-pagehead__text">
        <p className="mq-eyebrow">Operação do dia</p>
        <h1 className="mq-display">Novo lançamento</h1>
        <p className="mq-lede">
          Adicione as peças, identifique a cliente e registre como o valor será
          recebido.
        </p>
      </div>
    </div>
  );
}
