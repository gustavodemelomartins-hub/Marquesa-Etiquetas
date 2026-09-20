import { useState } from 'react';
import type { ReconciliationAnalysis } from '../types/reconciliation';
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
import { CatalogoArea } from '../features/catalogo/CatalogoArea';
import { EstoqueArea, type SubRotaEstoque } from '../features/estoque/EstoqueArea';
import {
  RevendedorasArea,
  type SubRotaRevendedoras,
} from '../features/revendedoras/RevendedorasArea';
import { LogoMarquesa } from '../components/LogoMarquesa';
import type { Connection } from '../services/client';
import { useEstado } from '../hooks/useEstado';
import { usePlanejamento } from '../hooks/usePlanejamento';

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
  const [subRev, setSubRev] = useState<SubRotaRevendedoras>('visao-geral');
  /* A análise é cara — lê a loja inteira a 2 requisições por segundo. Ela
     sobe até aqui para Nuvemshop e Pendências (dentro de Estoque)
     compartilharem o mesmo resultado em vez de cada uma pedir o seu. */
  const [analise, setAnalise] = useState<ReconciliationAnalysis | null>(null);

  /* `GET /api/state` também sobe: Estoque e Revendedoras contam as MESMAS
     peças, e duas leituras independentes podem discordar. */
  const estado = useEstado(conexao);
  const planejamento = usePlanejamento(estado.dados);

  const modulo = rota.modulo;
  /* Nuvemshop é módulo de primeiro nível no trilho E aba dentro de Estoque,
     porque é assim que se chega nela pelos dois caminhos reais. São duas
     PORTAS, não duas telas. */
  const emEstoque = modulo === 'estoque' || modulo === 'nuvemshop';
  const ABAS_ESTOQUE: SubRotaEstoque[] = ['estoque-total', 'pecas', 'inventario', 'saidas', 'pendencias'];
  const subEstoque: SubRotaEstoque = modulo === 'nuvemshop'
    ? 'nuvemshop'
    : (ABAS_ESTOQUE.find((a) => a === rota.sub) ?? 'estoque-total');

  const abrirCliente = (chave: { id: number } | { norm: string }) => {
    ir({ modulo: 'clientes', sub: 'id' in chave ? String(chave.id) : `norm:${chave.norm}` });
  };

  return (
    <AppShell
      conexao={conexao}
      modulo={modulo}
      aoNavegar={(m: ModuloId) => ir({ modulo: m })}
      contagens={analise?.itens.length ? { estoque: analise.itens.length } : undefined}
      aoDesconectar={() => {
        setAnalise(null);
        aoDesconectar();
      }}
    >
      {modulo === 'home' && (
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

      {modulo === 'catalogo' && (
        <CatalogoArea conexao={conexao} estado={estado.dados} aoMudar={estado.recarregar} />
      )}

      {modulo === 'configuracoes' && (
        <ConfiguracoesArea conexao={conexao} estado={estado.dados} aoMudar={estado.recarregar} />
      )}

      {modulo === 'garantias' && (
        <GarantiasArea
          conexao={conexao}
          sub={rota.sub}
          aoNavegar={(sub) => trocar({ modulo: 'garantias', sub })}
          aoAbrirCliente={abrirCliente}
        />
      )}

      {modulo === 'financeiro' && (
        <FinanceiroArea
          conexao={conexao}
          sub={rota.sub}
          aoNavegar={(sub) => trocar({ modulo: 'financeiro', sub })}
          aoAbrirCliente={abrirCliente}
        />
      )}

      {emEstoque && (
        <EstoqueArea
          conexao={conexao}
          sub={subEstoque}
          aoNavegarSub={(r) => ir(
            r === 'nuvemshop'
              ? { modulo: 'nuvemshop' }
              : { modulo: 'estoque', sub: r === 'estoque-total' ? null : r },
          )}
          analise={analise}
          aoAnalisar={setAnalise}
          estado={estado.dados}
          planejamento={planejamento}
          aoVerPlanejamento={() => {
            setSubRev('visao-geral');
            ir({ modulo: 'revendedoras' });
          }}
          aoMudarEstoque={estado.recarregar}
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
          aoNavegarSub={setSubRev}
        />
      )}

      {!['home', 'clientes', 'financeiro', 'revendedoras', 'vendas', 'garantias', 'configuracoes', 'catalogo'].includes(modulo) && !emEstoque && (
        <AreaPendente modulo={modulo} />
      )}
    </AppShell>
  );
}
