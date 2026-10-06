import { useEffect, useRef, type ReactNode } from 'react';

export interface OpcaoDoAviso {
  rotulo: string;
  tom: 'primario' | 'secundario' | 'neutro';
  aoEscolher: () => void;
}

const CLASSE_DO_TOM: Record<OpcaoDoAviso['tom'], string> = {
  primario: 'mq-btn--primary',
  secundario: 'mq-btn--secondary',
  neutro: 'mq-btn--ghost',
};

interface Props {
  titulo: string;
  children: ReactNode;
  opcoes: OpcaoDoAviso[];
  /** O gesto que NÃO muda nada ("Foi engano", "Cancelar"): o fundo e o Esc
   *  escolhem este. */
  aoDesistir: () => void;
  /** O leitor USB continua lendo com o aviso aberto (o bipe seguinte decide
   *  por ela). Sem isso, o foco vai para o próprio aviso. */
  leitorLivre?: boolean;
}

/** A PERGUNTA ANTES DE CONTAR DE NOVO (06/10/2026, §59).
 *
 *  Fica por cima de tudo — do leitor, da lista e da barra de navegação do
 *  telefone — com botões grandes, para ela decidir com o polegar sem
 *  procurar. Nada é gravado enquanto ela não toca.
 *
 *  O foco NUNCA cai num botão que grava: o leitor USB termina cada leitura
 *  com Enter, e um Enter num "Contar outra unidade" focado contaria a peça
 *  sem ela tocar. Com o leitor livre o foco fica no campo de leitura; sem
 *  ele, no próprio aviso. */
export function AvisoDaContagem({ titulo, children, opcoes, aoDesistir, leitorLivre = false }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const desistir = useRef(aoDesistir);
  desistir.current = aoDesistir;

  useEffect(() => {
    if (!leitorLivre) raiz.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') desistir.current(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [leitorLivre]);

  return (
    <>
      <button type="button" className="mq-scrim conf-aviso__fundo" aria-label="Fechar sem mudar nada" tabIndex={-1}
        onClick={aoDesistir} />
      <div
        ref={raiz}
        className="conf-aviso"
        role="alertdialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        data-leitor-livre={leitorLivre ? '' : undefined}
      >
        <h2 className="conf-aviso__titulo">{titulo}</h2>
        <div className="conf-aviso__corpo">{children}</div>
        <div className="conf-aviso__botoes">
          {opcoes.map((o) => (
            <button key={o.rotulo} type="button" className={`mq-btn ${CLASSE_DO_TOM[o.tom]} conf-aviso__botao`}
              onClick={o.aoEscolher}>
              {o.rotulo}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
