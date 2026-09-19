import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { listarClientes } from './api';
import type { Connection } from '../../services/client';
import type { ClienteLista } from './tipos';

interface Props {
  conexao: Connection;
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
export function ListaClientes({ conexao, aoAbrir, aoCadastrar }: Props) {
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');

  /* Espera a digitação parar. Sem isso, "Camila" dispara seis buscas e a
     resposta da terceira pode chegar depois da sexta. */
  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca), 280);
    return () => clearTimeout(t);
  }, [busca]);

  const lista = useApi(
    (sinal) => listarClientes(conexao, buscaAtiva, sinal),
    [conexao, buscaAtiva],
  );

  const clientes = lista.dados ?? [];

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Relacionamento</p>
          <h1 className="mq-display">Clientes</h1>
          <p className="mq-lede">
            Quem compra, quanto já comprou e o que ainda está em aberto. Abra
            uma cliente para ver a relação inteira.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <button type="button" className="mq-btn mq-btn--primary" onClick={aoCadastrar}>
            <Icone nome="plus" />
            Nova cliente
          </button>
        </div>
      </div>

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
              : `${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}`}
          </span>
        </div>

        {lista.erro ? (
          <ErrorState erro={lista.erro} aoTentarDeNovo={lista.recarregar} />
        ) : lista.carregando && !lista.dados ? (
          <Esqueleto />
        ) : clientes.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="search" /></span>
            <h3>{buscaAtiva ? 'Nenhuma cliente com esse termo' : 'Nenhuma cliente cadastrada ainda'}</h3>
            <p>
              {buscaAtiva
                ? 'A busca procura por nome, telefone e CPF. Tente só o primeiro nome, ou parte do telefone.'
                : 'Quem compra pela planilha aparece aqui assim que tiver cadastro. Você também pode criar uma agora.'}
            </p>
            <button type="button" className="mq-btn mq-btn--secondary" onClick={aoCadastrar}>
              Cadastrar cliente
            </button>
          </div>
        ) : (
          <div className="mq-table" role="table" aria-label="Clientes">
            <div className="mq-tr mq-tr--head" role="row" style={COLUNAS}>
              <span role="columnheader">Cliente</span>
              <span role="columnheader">Telefone</span>
              <span role="columnheader">Cidade</span>
              <span aria-hidden="true" />
            </div>
            {clientes.map((c) => (
              <button
                key={c.id}
                type="button"
                className="mq-tr"
                style={COLUNAS}
                onClick={() => aoAbrir(c)}
              >
                <span className="mq-cell">
                  <b>{c.nome}</b>
                  <small>#{c.id}</small>
                </span>
                <span className="mq-cell">
                  <b className="mq-num">{c.tel || '—'}</b>
                </span>
                <span className="mq-cell">
                  <b>{c.cidade || '—'}</b>
                </span>
                <Icone nome="chevron" className="mq-ico mq-tr__chev" />
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* A grade das colunas mora aqui, e não no CSS, porque ela é DESTA tabela:
   o Design System descreve a linha, cada tabela descreve suas colunas. */
const COLUNAS = { gridTemplateColumns: 'minmax(0,2.2fr) minmax(0,1.2fr) minmax(0,1.2fr) 20px' };

function Esqueleto() {
  return (
    <div className="mq-table" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="mq-tr" style={COLUNAS}>
          <span className="mq-skel mq-skel--short" />
          <span className="mq-skel" />
          <span className="mq-skel" />
          <span />
        </div>
      ))}
    </div>
  );
}
