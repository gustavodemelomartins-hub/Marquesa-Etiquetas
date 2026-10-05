import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Icone, type NomeIcone } from '../../components/Icone';
import { FotoDaPeca } from '../../components/FotoDaPeca';
import { fotoDaPeca } from '../../domain/foto';
import { CasoDeReparo } from './CasoDeReparo';
import { produtoDaGarantia } from './reparo';
import type { Connection } from '../../services/client';
import type { ProdutoDoEstado } from '../vendas/tipos';

interface Casos {
  /** Abre o caso — de qualquer tela, sempre o mesmo `CasoDeReparo`. */
  abrir: (id: number) => void;
  /** Sobe a cada mudança feita dentro do caso: quem lista casos põe este
   *  número nas dependências da leitura e relê sozinho. */
  versao: number;
  produtoDe: (sku: string | null | undefined) => ProdutoDoEstado | null;
}

const Contexto = createContext<Casos | null>(null);

/** `null` fora do provedor (um teste que monta só uma tela): a linha então
 *  continua sendo só informação, como era. */
export function useCasosDeReparo(): Casos | null {
  return useContext(Contexto);
}

/** Uma porta só para o detalhe do reparo. Mora no App, acima de todos os
 *  módulos, para que Início, ficha da cliente e Garantias abram o MESMO caso
 *  do MESMO jeito — e fechar volte para a tela de onde se veio. */
export function CasosDeReparoProvider({
  conexao, produtos, aoAbrirCliente, children,
}: {
  conexao: Connection;
  produtos: ProdutoDoEstado[];
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState<number | null>(null);
  const [versao, setVersao] = useState(0);

  const produtoDe = useCallback(
    (sku: string | null | undefined) => produtoDaGarantia(produtos, sku),
    [produtos],
  );
  const valor = useMemo<Casos>(() => ({ abrir: setAberto, versao, produtoDe }), [versao, produtoDe]);
  const fechar = useCallback(() => setAberto(null), []);
  const mudou = useCallback(() => setVersao((v) => v + 1), []);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {aberto !== null && (
        <CasoDeReparo
          key={aberto}
          conexao={conexao}
          id={aberto}
          produtos={produtos}
          produtoDe={produtoDe}
          aoFechar={fechar}
          aoMudar={mudou}
          aoAbrirCliente={aoAbrirCliente}
        />
      )}
    </Contexto.Provider>
  );
}

/** A miniatura de um caso numa LISTA: a foto da peça que o sistema já tem
 *  (galeria/R2, ou a da loja que o cadastro já conhece); sem foto, o ícone
 *  de sempre. Nunca procura imagem fora. */
export function MiniaturaDoReparo({
  sku, nome, tom, icone = 'repair',
}: {
  sku: string | null | undefined;
  nome: string;
  tom: 'risk' | 'warn' | 'ok' | 'brand';
  icone?: NomeIcone;
}) {
  const casos = useCasosDeReparo();
  const p = casos?.produtoDe(sku) ?? null;
  if (p && fotoDaPeca(p)) return <FotoDaPeca peca={p} alt={nome} />;
  return (
    <span className={`mq-item__icon mq-item__icon--${tom}`} aria-hidden="true">
      <Icone nome={icone} />
    </span>
  );
}
