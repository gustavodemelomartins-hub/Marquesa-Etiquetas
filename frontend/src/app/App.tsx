import { useEffect, useMemo } from 'react';
import { useConnection } from '../hooks/useConnection';
import { AppShell } from './AppShell';
import { useRota } from './rota';
import type { ModuloId } from './modulos';
import { ConnectionForm } from './ConnectionForm';
import { AreaPendente } from './AreaPendente';
import { ClientesArea } from '../features/clientes/ClientesArea';
import { FinanceiroArea } from '../features/financeiro/FinanceiroArea';
import { VendasArea } from '../features/vendas/VendasArea';
import { GarantiasArea } from '../features/garantias/GarantiasArea';
import { HomeArea } from '../features/home/HomeArea';
import { ConfiguracoesArea } from '../features/configuracoes/ConfiguracoesArea';
import { EstoqueArea } from '../features/estoque/EstoqueArea';
import { NuvemshopPage } from '../features/nuvemshop/NuvemshopPage';
import { PendenciasArea } from '../features/home/PendenciasArea';
import {
  RevendedorasArea,
  type SubRotaRevendedoras,
} from '../features/revendedoras/RevendedorasArea';
import { LogoMarquesa } from '../components/LogoMarquesa';
import type { Connection } from '../services/client';
import { useEstado } from '../hooks/useEstado';
import { usePlanejamento } from '../hooks/usePlanejamento';
import { CasosDeReparoProvider } from '../features/garantias/CasosDeReparo';
import type { ProdutoDoEstado } from '../features/vendas/tipos';

export function App() {
  const { conexao, conectar, desconectar } = useConnection();

  if (!conexao) {
    return (
      <div className="mq-entrada">
        <div className="mq-entrada__marca">
          <LogoMarquesa altura={46} />
          <small>Sistema</small>
        </div>
        <ConnectionForm aoConectar={conectar} />
      </div>
    );
  }

  /* Componente separado porque os hooks de leitura precisam de uma conexão
     que já existe — e um hook não pode nascer depois de um `return`. */
  return <AppConectado conexao={conexao} aoDesconectar={desconectar} />;
}

function AppConectado({
  conexao,
  aoDesconectar,
}: {
  conexao: Connection;
  aoDesconectar: () => void;
}) {
  /* A tela mora no endereço, e não só na memória do componente: recarregar
     a página volta para onde se estava, o voltar do navegador funciona, e
     um link de ficha pode ser mandado para alguém. */
  const { rota, ir, trocar } = useRota();

  /* `GET /api/state` também sobe: Estoque e Revendedoras contam as MESMAS
     peças, e duas leituras independentes podem discordar. */
  const estado = useEstado(conexao);
  const planejamento = usePlanejamento(estado.dados);
  /* O catálogo que o caso de reparo usa para a miniatura da peça e para a
     troca — o MESMO `GET /api/state`, sem segunda leitura. */
  const produtos = useMemo(
    () => (estado.dados?.produtos ?? []) as unknown as ProdutoDoEstado[],
    [estado.dados],
  );

  const modulo = rota.modulo;

  /* ENDEREÇOS ANTIGOS. Desde 27/09/2026 o menu tem menos portas, e cada
     endereço que perdeu a sua é trocado (sem empilhar no voltar) pelo da
     tela que o substituiu — link salvo ou mandado antes continua levando
     ao lugar certo. Os dois últimos são atalhos de uma vez só do Início:
     a tela já abriu o formulário, e o endereço volta ao normal para
     recarregar a página não abri-lo de novo. */
  useEffect(() => {
    const { modulo: m, sub } = rota;
    if (m === 'catalogo') trocar({ modulo: 'estoque', sub: sub === 'novo' ? 'novo' : null });
    else if (m === 'notificacoes') trocar({ modulo: 'home', sub: 'pendencias' });
    else if (m === 'agenda') trocar({ modulo: 'revendedoras' });
    else if (m === 'estoque' && sub === 'pendencias') trocar({ modulo: 'nuvemshop' });
    else if (m === 'garantias' && sub === 'nova') trocar({ modulo: 'garantias' });
    else if (m === 'revendedoras' && sub === 'nova-maleta') trocar({ modulo: 'revendedoras' });
  }, [rota, trocar]);

  /* A aba da revendedora mora no ENDEREÇO, não num `useState`. Enquanto ela
     era estado local, recarregar a página em cima da ficha de alguém
     devolvia a Visão Geral, o voltar do navegador saía do módulo inteiro, e
     não havia link para mandar "abre a maleta da Fulana". */
  const subRev: SubRotaRevendedoras = rota.sub && /^\d+$/.test(rota.sub)
    ? Number(rota.sub)
    : rota.sub === 'todas' || rota.sub === 'historico' || rota.sub === 'configuracoes'
      ? rota.sub
      : 'visao-geral';

  const abrirCliente = (chave: { id: number } | { norm: string }) => {
    ir({ modulo: 'clientes', sub: 'id' in chave ? String(chave.id) : `norm:${chave.norm}` });
  };

  return (
    /* O detalhe do reparo abre por cima de QUALQUER módulo, sempre o mesmo
       componente — ver `CasosDeReparoProvider`. */
    <CasosDeReparoProvider conexao={conexao} produtos={produtos} aoAbrirCliente={abrirCliente}>
    <AppShell
      conexao={conexao}
      modulo={modulo}
      aoNavegar={(m: ModuloId) => ir({ modulo: m })}
      aoNavegarPara={(d) => ir({ modulo: d.modulo, sub: d.sub })}
      estado={estado.dados}
      aoDesconectar={aoDesconectar}
    >
      {modulo === 'home' && rota.sub === 'pendencias' && (
        <PendenciasArea
          conexao={conexao}
          estado={estado.dados}
          aoIr={(m, sub) => ir({ modulo: m, sub: sub ?? null })}
          aoVoltar={() => ir({ modulo: 'home' })}
          aoMudarEstado={estado.recarregar}
        />
      )}

      {modulo === 'home' && rota.sub !== 'pendencias' && (
        <HomeArea
          conexao={conexao}
          aoIr={(m, sub) => ir({ modulo: m, sub: sub ?? null })}
          aoAbrirCliente={abrirCliente}
        />
      )}

      {modulo === 'clientes' && (
        <ClientesArea
          conexao={conexao}
          sub={rota.sub}
          aoNavegar={(sub) => ir({ modulo: 'clientes', sub })}
          aoNovaVenda={(id, nome) => ir({ modulo: 'vendas', sub: `nova:${id ?? ''}:${encodeURIComponent(nome)}` })}
        />
      )}

      {modulo === 'vendas' && (
        <VendasArea
          conexao={conexao}
          sub={rota.sub}
          aoNavegar={(sub) => ir({ modulo: 'vendas', sub })}
          estado={estado.dados}
          aoMudarEstoque={estado.recarregar}
          aoAbrirCliente={abrirCliente}
          aoAbrirModulo={(m) => ir({ modulo: m })}
        />
      )}

      {modulo === 'configuracoes' && (
        <ConfiguracoesArea conexao={conexao} estado={estado.dados} aoMudar={estado.recarregar} />
      )}

      {modulo === 'garantias' && (
        <GarantiasArea
          conexao={conexao}
          sub={rota.sub}
          aoNavegar={(sub) => trocar({ modulo: 'garantias', sub })}
        />
      )}

      {modulo === 'financeiro' && (
        <FinanceiroArea
          conexao={conexao}
          aoMudarEstado={estado.recarregar}
          sub={rota.sub}
          aoNavegar={(sub) => trocar({ modulo: 'financeiro', sub })}
          aoAbrirCliente={abrirCliente}
        />
      )}

      {modulo === 'estoque' && (
        <EstoqueArea
          conexao={conexao}
          sub={rota.sub}
          /* Trocar de aba e fechar a ficha substituem o endereço. ABRIR a
             ficha empilha: desde 29/09/2026 ela é uma página inteira, e no
             celular o "voltar" tem de voltar para a lista — não sair de
             Peças. Trocar de aba DENTRO da ficha substitui, para o voltar
             não desfazer aba por aba. */
          aoNavegar={(sub) => {
            const abrindoFicha = !!sub && sub.startsWith('peca:')
              && !(rota.sub ?? '').startsWith('peca:');
            (abrindoFicha ? ir : trocar)({ modulo: 'estoque', sub });
          }}
          estado={estado.dados}
          planejamento={planejamento}
          aoVerPlanejamento={() => ir({ modulo: 'revendedoras', sub: 'configuracoes' })}
          aoMudarEstoque={estado.recarregar}
        />
      )}

      {modulo === 'nuvemshop' && (
        <NuvemshopPage
          conexao={conexao}
          aoAnalisar={() => undefined}
          sub={rota.sub}
          aoNavegarSub={(s) => trocar({ modulo: 'nuvemshop', sub: s })}
        />
      )}

      {modulo === 'revendedoras' && (
        <RevendedorasArea
          conexao={conexao}
          estado={estado.dados}
          carregando={estado.carregando}
          erro={estado.erro}
          recarregar={estado.recarregar}
          planejamento={planejamento}
          sub={subRev}
          criarAoEntrar={rota.sub === 'nova-maleta'}
          aoNavegarSub={(r) => ir({
            modulo: 'revendedoras',
            sub: r === 'visao-geral' ? null : String(r),
          })}
        />
      )}

      {modulo === 'etiquetas' && <AreaPendente modulo={modulo} />}
    </AppShell>
    </CasosDeReparoProvider>
  );
}
