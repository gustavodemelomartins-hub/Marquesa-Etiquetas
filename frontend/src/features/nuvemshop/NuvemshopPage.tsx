import { useMemo } from 'react';
import type { Connection } from '../../services/client';
import { useApi } from '../../hooks/useApi';
import { buscarEstoqueOnline } from '../../services/nuvemshopEstoque';
import type { AppState, Product } from '../../types/api';
import type { ModuloId } from '../../app/modulos';
import { buscarFila } from '../publicacao/api';
import { FilaArea } from '../publicacao/FilaArea';
import { SITUACOES, situacaoDaTela, type SituacaoDaTela } from '../publicacao/tipos';
import { VisaoGeralArea } from './VisaoGeralArea';

interface Props {
  conexao: Connection;
  /** O estado compartilhado do App: dá a miniatura de cada peça sem
   *  uma segunda leitura de `/api/state`. */
  estado?: AppState | null;
  /** `publicacao` (ou `publicacao:<aba>`) abre a Preparação. Mora no
   *  endereço para o link poder ser mandado para alguém. */
  sub?: string | null;
  aoNavegarSub?: (sub: string | null) => void;
  aoIr?: (modulo: ModuloId, sub?: string) => void;
  /** Publicar muda a visibilidade das peças: o estado do App relê. */
  aoMudarEstado?: () => void;
}

/** LOJA ONLINE — §63 (09/10/2026).
 *
 *  Duas abas, duas perguntas, nenhuma repetida:
 *
 *    Visão geral   a loja está sincronizada? o que exige a minha atenção?
 *    Preparação    o que falta em cada peça, e o clique de publicar.
 *
 *  Antes, a "Situação da loja" juntava dez números de universos diferentes,
 *  um painel técnico aberto e trezentos "problemas" que eram só peças
 *  ocultas de propósito (§62). O técnico continua existindo — atrás de
 *  "Ver detalhes da sincronização" — e a tela operacional ficou com o que
 *  se decide. */
export function NuvemshopPage({ conexao, estado, sub, aoNavegarSub, aoIr, aoMudarEstado }: Props) {
  const naPreparacao = !!sub && sub.startsWith('publicacao');
  const abaPedida = sub && sub.includes(':') ? sub.split(':')[1] : null;
  const abaInicial = (SITUACOES.some((s) => s.id === abaPedida) ? abaPedida : null) as SituacaoDaTela | null;

  const online = useApi((s) => buscarEstoqueOnline(conexao, s), [conexao]);
  const fila = useApi((s) => buscarFila(conexao, s), [conexao]);

  const produtos = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of estado?.produtos ?? []) m.set(p.sku, p);
    return m;
  }, [estado]);

  const prontos = (fila.dados?.itens ?? []).filter((i) => situacaoDaTela(i) === 'pronto').length;

  function irPara(aba: SituacaoDaTela | null) {
    aoNavegarSub?.(aba ? `publicacao:${aba}` : 'publicacao');
  }

  function mudou() {
    online.recarregar();
    fila.recarregar();
    aoMudarEstado?.();
  }

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Nuvemshop</p>
          <h1 className="mq-display">Loja online</h1>
          <p className="mq-lede">Produtos, publicação e sincronização com a Nuvemshop.</p>
        </div>
      </div>

      {aoNavegarSub && (
        <nav className="mq-tabs" aria-label="Loja online">
          <button type="button" aria-selected={!naPreparacao} onClick={() => aoNavegarSub(null)}>
            Visão geral
          </button>
          <button type="button" aria-selected={naPreparacao} onClick={() => irPara(null)}>
            Preparação
            {prontos > 0 && <span className="mq-badge mq-badge--brand" title="Prontos para publicar">{prontos}</span>}
          </button>
        </nav>
      )}

      {naPreparacao ? (
        <FilaArea
          key={abaInicial ?? 'preparacao'}
          conexao={conexao}
          fila={fila}
          produtos={produtos}
          abaInicial={abaInicial}
          aoMudar={mudou}
        />
      ) : (
        <VisaoGeralArea
          conexao={conexao}
          online={online}
          fila={fila}
          aoIrPreparacao={irPara}
          aoIrPendencias={() => aoIr?.('home', 'pendencias')}
          aoMudar={mudou}
        />
      )}
    </>
  );
}
