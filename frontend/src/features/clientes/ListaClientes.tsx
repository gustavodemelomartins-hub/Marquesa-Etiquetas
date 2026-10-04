import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { AvatarCliente } from '../../components/AvatarCliente';
import { ErrorState } from '../../components/ErrorState';
import { listarClientes } from './api';
import { money, fmtData } from '../../domain/formato';
import type { Connection } from '../../services/client';
import type { ClienteDaBase, ClienteLista } from './tipos';

interface Props {
  conexao: Connection;
  /** Compras de cada cadastro (última, total), pela base de vendas. Vazio
   *  enquanto carrega — a lista não espera por ele. */
  porCliente: Map<number, ClienteDaBase>;
  aoAbrir: (c: ClienteLista) => void;
  aoCadastrar: () => void;
}

/** A LISTA de clientes.
 *
 *  A busca é do servidor, não da tela: `GET /api/clientes?busca=` casa por
 *  nome normalizado, por nome cru E por telefone só-dígitos. Filtrar no
 *  navegador só encontraria o que já tinha vindo, e "Camila" digitado com
 *  acento não acharia "camila" — que é justamente o caso que o backend
 *  resolve.
 *
 *  Cada linha diz nome, telefone e CIDADE. A cidade não é enfeite: duas
 *  "Camila" só se distinguem por algum campo além do nome, e escolher a
 *  errada no balcão manda a venda para o histórico de outra pessoa.
 */
export function ListaClientes({ conexao, porCliente, aoAbrir, aoCadastrar }: Props) {
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  /* Arquivada sai da lista padrão; continua a um toque, para reativar. */
  const [arquivadas, setArquivadas] = useState(false);

  /* Espera a digitação parar. Sem isso, "Camila" dispara seis buscas e a
     resposta da terceira pode chegar depois da sexta. */
  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca), 280);
    return () => clearTimeout(t);
  }, [busca]);

  const lista = useApi(
    (sinal) => listarClientes(conexao, buscaAtiva, sinal, arquivadas),
    [conexao, buscaAtiva, arquivadas],
  );

  const clientes = lista.dados ?? [];

  return (
    <>
      <section className="mq-card mq-card--flush">
        <div className="mq-filters">
          <label className="mq-search">
            <Icone nome="search" />
            <input
              className="mq-input"
              type="search"
              placeholder="Buscar por nome, telefone ou CPF"
              aria-label="Buscar cliente por nome, telefone ou CPF"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
          <span className="mq-filters__count">
            {lista.carregando
              ? 'buscando…'
              : `${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}${arquivadas ? ' arquivadas' : ''}`}
          </span>
          <button
            type="button"
            className="mq-btn mq-btn--ghost mq-btn--sm"
            aria-pressed={arquivadas}
            onClick={() => setArquivadas((v) => !v)}
          >
            {arquivadas ? 'Ver ativas' : 'Arquivadas'}
          </button>
        </div>

        {lista.erro ? (
          <ErrorState erro={lista.erro} aoTentarDeNovo={lista.recarregar} />
        ) : lista.carregando && !lista.dados ? (
          <Esqueleto />
        ) : clientes.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="search" /></span>
            <h3>{arquivadas ? 'Nenhuma cliente arquivada'
              : buscaAtiva ? 'Nenhuma cliente com esse termo' : 'Nenhuma cliente cadastrada ainda'}</h3>
            {!arquivadas && (
              <>
                <p>
                  {buscaAtiva
                    ? 'Tente só o primeiro nome, ou parte do telefone.'
                    : 'Cadastre a primeira cliente.'}
                </p>
                <button type="button" className="mq-btn mq-btn--secondary" onClick={aoCadastrar}>
                  Cadastrar cliente
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="mq-table" role="table" aria-label="Clientes">
            <div className="mq-tr mq-tr--head" role="row" style={COLUNAS}>
              <span role="columnheader">Cliente</span>
              <span role="columnheader">Telefone</span>
              <span role="columnheader">Última compra</span>
              <span role="columnheader">Total comprado</span>
              <span aria-hidden="true" />
            </div>
            {clientes.map((c) => {
              const compras = porCliente.get(c.id);
              return (
              <button
                key={c.id}
                type="button"
                className="mq-tr"
                style={COLUNAS}
                onClick={() => aoAbrir(c)}
              >
                <span className="mq-cell mq-quem">
                  <AvatarCliente nome={c.nome} avatarUrl={c.avatarUrl} sugestao={c.avatarSugestao} conexao={conexao} tamanho="sm" />
                  <span className="mq-quem__txt">
                    <b>{c.nome}</b>
                    {(c.cidade || c.arquivada) && <small>{[c.arquivada ? 'arquivada' : '', c.cidade].filter(Boolean).join(' · ')}</small>}
                  </span>
                </span>
                {/* Vazio vira "—" na tabela, e some no telefone: dois
                    traços por cartão era ruído, não informação. */}
                <span className={c.tel ? 'mq-cell' : 'mq-cell mq-cell--vazia'}>
                  <b className="mq-num">{c.tel || '—'}</b>
                </span>
                <span className="mq-cell mq-cell--num" data-label="Última compra">
                  <b className="mq-date">{compras?.ultimaCompra ? fmtData(compras.ultimaCompra) : '—'}</b>
                </span>
                <span className="mq-cell mq-cell--num" data-label="Total comprado">
                  <b className="mq-money">{compras ? money(compras.comprado) : '—'}</b>
                </span>
                <Icone nome="chevron" className="mq-ico mq-tr__chev" />
              </button>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

/* A grade das colunas mora aqui, e não no CSS, porque ela é DESTA tabela:
   o Design System descreve a linha, cada tabela descreve suas colunas. */
const COLUNAS = { gridTemplateColumns: 'minmax(0,2.2fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) 20px' };

function Esqueleto() {
  return (
    <div className="mq-table" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="mq-tr" style={COLUNAS}>
          <span className="mq-skel mq-skel--short" />
          <span className="mq-skel" />
          <span className="mq-skel" />
          <span className="mq-skel" />
          <span />
        </div>
      ))}
    </div>
  );
}
