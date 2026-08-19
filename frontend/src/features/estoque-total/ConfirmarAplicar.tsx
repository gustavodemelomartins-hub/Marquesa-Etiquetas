import type { ItemSessao, ModoPlanilha } from './tipos';

interface Props {
  modo: ModoPlanilha;
  aprovados: ItemSessao[];
  aplicando: boolean;
  aoVoltar: () => void;
  aoConfirmar: () => void;
}

/** A confirmação diz o que VAI acontecer, não "Continuar" — §19 do pedido:
 *  um botão ambíguo é o tipo de coisa que faz alguém aplicar sem saber o
 *  tamanho do que está aplicando. */
export function ConfirmarAplicar({ modo, aprovados, aplicando, aoVoltar, aoConfirmar }: Props) {
  const texto =
    modo === 'estoque-total'
      ? `${aprovados.length} ${aprovados.length === 1 ? 'alteração' : 'alterações'} poderão modificar o estoque do sistema.`
      : `${aprovados.length} ${aprovados.length === 1 ? 'novo produto será' : 'novos produtos serão'} cadastrados.`;

  return (
    <div className="cartao" style={{ padding: 'var(--r5)' }}>
      <h3 style={{ marginBottom: 'var(--r3)' }}>
        Você aprovou {aprovados.length} {aprovados.length === 1 ? 'item' : 'itens'}.
      </h3>
      <p style={{ color: 'var(--ink)', marginBottom: 'var(--r4)' }}>{texto}</p>
      <div className="acoes">
        <button type="button" className="btn btn-leitura" onClick={aoVoltar} disabled={aplicando}>
          Voltar
        </button>
        <button type="button" className="btn btn-escrita" onClick={aoConfirmar} disabled={aplicando || !aprovados.length}>
          {aplicando ? 'Aplicando…' : modo === 'estoque-total' ? 'Aplicar alterações' : 'Cadastrar novos produtos'}
        </button>
      </div>
    </div>
  );
}
