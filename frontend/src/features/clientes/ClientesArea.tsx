import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ListaClientes } from './ListaClientes';
import { VisaoGeralClientes } from './VisaoGeralClientes';
import { PerfilCliente, type ChaveCliente } from './PerfilCliente';
import { FormCliente } from './FormCliente';
import { buscarBase } from './api';
import type { Connection } from '../../services/client';
import type { CadastroCliente, ClienteDaBase, PerfilCliente as Perfil } from './tipos';

interface Props {
  conexao: Connection;
  /** O endereço da tela:
   *    `null`             Visão geral
   *    `todos`            Todos os clientes
   *    `<id>`             a ficha, pelo cadastro
   *    `norm:<nome>`      a ficha de quem só existe no histórico da planilha */
  sub: string | null;
  aoNavegar: (sub: string | null) => void;
  /** "Nova venda para esta cliente" — leva ao balcão com ela escolhida.
   *  O id viaja junto porque §2 é explícito: nome não é identidade, e uma
   *  venda amarrada só pelo nome é uma venda que some quando alguém
   *  renomeia a cliente. */
  aoNovaVenda: (clienteId: number | null, nome: string) => void;
}

/** O módulo Clientes: Visão geral, a lista, a ficha e o cadastro. */
export function ClientesArea({ conexao, sub, aoNavegar, aoNovaVenda }: Props) {
  /* `null` = fechado; `{cadastro: null}` = criando; senão, editando. */
  const [form, setForm] = useState<{ cadastro: CadastroCliente | null } | null>(null);
  /* Força a ficha a recarregar depois de salvar, sem recriar o componente
     inteiro: a chave da cliente não mudou, só o conteúdo dela. */
  const [versao, setVersao] = useState(0);

  const aberta = chaveDaSub(sub);
  const aba: 'visao' | 'todos' = sub === 'todos' ? 'todos' : 'visao';

  /* A base inteira (histórico todo) serve às duas abas: na Visão geral ela
     diz quem sumiu e quem é recorrente; na lista, a última compra e o total
     de cada uma. Uma leitura só, compartilhada. */
  const base = useApi((s) => buscarBase(conexao, 'tudo', s), [conexao, aberta === null]);
  const porCliente = useMemo(() => {
    const m = new Map<number, ClienteDaBase>();
    for (const c of base.dados?.todos ?? []) if (c.clienteId !== null) m.set(c.clienteId, c);
    return m;
  }, [base.dados]);

  const abrir = (c: ClienteDaBase) => aoNavegar(c.clienteId !== null ? String(c.clienteId) : `norm:${c.norm}`);

  return (
    <>
      {aberta === null ? (
        <>
          <div className="mq-pagehead">
            <div className="mq-pagehead__text">
              <h1 className="mq-display">Clientes</h1>
            </div>
            <div className="mq-pagehead__actions">
              <button type="button" className="mq-btn mq-btn--primary" onClick={() => setForm({ cadastro: null })}>
                <Icone nome="plus" />
                Nova cliente
              </button>
            </div>
          </div>

          <nav className="mq-tabs" aria-label="Clientes">
            <button type="button" aria-selected={aba === 'visao'} onClick={() => aoNavegar(null)}>
              Visão geral
            </button>
            <button type="button" aria-selected={aba === 'todos'} onClick={() => aoNavegar('todos')}>
              Todos os clientes
            </button>
          </nav>

          {aba === 'visao' ? (
            <VisaoGeralClientes conexao={conexao} baseInteira={base} aoAbrir={abrir} />
          ) : (
            <ListaClientes
              conexao={conexao}
              porCliente={porCliente}
              aoAbrir={(c) => aoNavegar(String(c.id))}
              aoCadastrar={() => setForm({ cadastro: null })}
            />
          )}
        </>
      ) : (
        <PerfilCliente
          key={`${sub}-${versao}`}
          conexao={conexao}
          chave={aberta}
          aoVoltar={() => aoNavegar(null)}
          aoExcluir={() => aoNavegar('todos')}
          aoEditar={(p: Perfil) => p.cadastro && setForm({ cadastro: p.cadastro })}
          aoNovaVenda={(p: Perfil) => aoNovaVenda(p.clienteId, p.nomeExibicao)}
        />
      )}

      {form && (
        <FormCliente
          conexao={conexao}
          cadastro={form.cadastro}
          aoFechar={() => setForm(null)}
          aoSalvar={(id) => {
            setForm(null);
            setVersao((v) => v + 1);
            aoNavegar(String(id));
          }}
        />
      )}
    </>
  );
}

/** `7` abre por id; `norm:vitoria prado` abre pelo nome normalizado;
 *  `todos` e `null` são as duas abas, não uma ficha. */
export function chaveDaSub(sub: string | null): ChaveCliente | null {
  if (!sub || sub === 'todos') return null;
  if (sub.startsWith('norm:')) return { norm: sub.slice(5) };
  const id = Number(sub);
  return Number.isSafeInteger(id) && id > 0 ? { id } : null;
}
