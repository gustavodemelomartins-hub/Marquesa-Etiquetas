import type { Connection } from '../../services/client';
import { Icone } from '../../components/Icone';

/** O ATALHO para as fotos da loja, dentro das pendências de catálogo.
 *
 *  Até 29/09/2026 este componente era a importação inteira — um botão
 *  "Procurar fotos na loja online" escondido aqui, que copiava UMA foto por
 *  peça para as colunas antigas. A importação agora mora em Peças (botão
 *  "Importar fotos da Nuvemshop" e, peça a peça, na aba Fotos da ficha) e
 *  traz a galeria inteira. Aqui fica só o caminho até lá, para quem chegar
 *  pelas pendências não precisar saber onde procurar. */
export function FotosDaLoja(_: { conexao: Connection; aoTerminar: (recado: string) => void }) {
  return (
    <div className="mq-pend__fotos">
      <a className="mq-btn mq-btn--secondary mq-btn--sm" href="#/estoque/importar-fotos">
        <Icone nome="cloud" /> Importar fotos da Nuvemshop
      </a>
    </div>
  );
}
