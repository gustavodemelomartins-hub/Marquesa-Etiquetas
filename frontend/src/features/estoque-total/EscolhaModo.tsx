import type { ModoPlanilha } from './tipos';

interface Props {
  aoEscolher: (modo: ModoPlanilha) => void;
}

/** "O que você deseja fazer?" — a bifurcação da importação por planilha,
 *  em linguagem operacional, sem jargão de sessão/motor/reconciliação. */
export function EscolhaModo({ aoEscolher }: Props) {
  return (
    <div className="grade-escolha">
      <button type="button" className="cartao-escolha" onClick={() => aoEscolher('estoque-total')}>
        <h3>Atualizar Estoque Total</h3>
        <p>
          Usar a planilha completa como referência e comparar com o estoque
          atual do sistema. Mostra o que mudaria antes de alterar qualquer
          coisa.
        </p>
      </button>

      <button type="button" className="cartao-escolha" onClick={() => aoEscolher('produtos-novos')}>
        <h3>Adicionar Peças Novas</h3>
        <p>
          Adicionar somente códigos que ainda não existem no sistema.
          Produtos já cadastrados não serão alterados de forma nenhuma.
        </p>
      </button>
    </div>
  );
}
