import { useState } from 'react';
import { ListaClientes } from './ListaClientes';
import { PerfilCliente, type ChaveCliente } from './PerfilCliente';
import { FormCliente } from './FormCliente';
import type { Connection } from '../../services/client';
import type { CadastroCliente, PerfilCliente as Perfil } from './tipos';

interface Props {
  conexao: Connection;
  /** O endereço da tela: `null` na lista, `<id>` ou `norm:<nome>` na ficha.
   *  As duas formas existem porque o backend abre a ficha pelas duas — e a
   *  segunda é o caminho de quem só existe no histórico da planilha. */
  sub: string | null;
  aoNavegar: (sub: string | null) => void;
  /** "Nova venda para esta cliente" — leva ao balcão com ela escolhida.
   *  O id viaja junto porque §2 é explícito: nome não é identidade, e uma
   *  venda amarrada só pelo nome é uma venda que some quando alguém
   *  renomeia a cliente. */
  aoNovaVenda: (clienteId: number | null, nome: string) => void;
}

/** O módulo Clientes: a lista, a ficha e o cadastro. */
export function ClientesArea({ conexao, sub, aoNavegar, aoNovaVenda }: Props) {
  /* `null` = fechado; `{cadastro: null}` = criando; senão, editando. */
  const [form, setForm] = useState<{ cadastro: CadastroCliente | null } | null>(null);
  /* Força a ficha a recarregar depois de salvar, sem recriar o componente
     inteiro: a chave da cliente não mudou, só o conteúdo dela. */
  const [versao, setVersao] = useState(0);

  const aberta = chaveDaSub(sub);

  return (
    <>
      {aberta === null ? (
        <ListaClientes
          conexao={conexao}
          aoAbrir={(c) => aoNavegar(String(c.id))}
          aoCadastrar={() => setForm({ cadastro: null })}
        />
      ) : (
        <PerfilCliente
          key={`${sub}-${versao}`}
          conexao={conexao}
          chave={aberta}
          aoVoltar={() => aoNavegar(null)}
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

/** `7` abre por id; `norm:vitoria prado` abre pelo nome normalizado. */
export function chaveDaSub(sub: string | null): ChaveCliente | null {
  if (!sub) return null;
  if (sub.startsWith('norm:')) return { norm: sub.slice(5) };
  const id = Number(sub);
  return Number.isSafeInteger(id) && id > 0 ? { id } : null;
}
