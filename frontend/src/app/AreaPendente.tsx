import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';

interface Props {
  titulo: string;
  descricao: string;
}

/** Placeholder para uma área principal que já tem lugar reservado na
 *  navegação, mas cuja tela em React ainda não foi construída — a
 *  funcionalidade real continua no painel clássico enquanto isso. */
export function AreaPendente({ titulo, descricao }: Props) {
  return (
    <>
      <PageHeader kicker="Em construção" titulo={titulo} />
      <EmptyState
        titulo="Esta área ainda não tem tela própria aqui"
        descricao={descricao}
        acoes={
          <a className="btn btn-leitura" href="../../dashboard.html">
            Abrir no painel clássico
          </a>
        }
      />
    </>
  );
}
