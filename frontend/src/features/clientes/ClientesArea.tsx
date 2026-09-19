import { useState } from 'react';
import { ListaClientes } from './ListaClientes';
import { PerfilCliente, type ChaveCliente } from './PerfilCliente';
import { FormCliente } from './FormCliente';
import type { Connection } from '../../services/client';
import type { CadastroCliente, PerfilCliente as Perfil } from './tipos';

interface Props {
  conexao: Connection;
}

/** O módulo Clientes: a lista, a ficha e o cadastro.
 *
 *  A ficha é aberta por `id` quando há cadastro, e o backend também aceita
 *  abrir por `norm` — o caminho de quem só existe no histórico da planilha.
 *  Os dois estão no tipo `ChaveCliente` porque os dois são reais.
 */
export function ClientesArea({ conexao }: Props) {
  const [aberta, setAberta] = useState<ChaveCliente | null>(null);
  /* `null` = fechado; `{cadastro: null}` = criando; senão, editando. */
  const [form, setForm] = useState<{ cadastro: CadastroCliente | null } | null>(null);
  /* Força a ficha a recarregar depois de salvar, sem recriar o componente
     inteiro: a chave da cliente não mudou, só o conteúdo dela. */
  const [versao, setVersao] = useState(0);

  return (
    <>
      {aberta === null ? (
        <ListaClientes
          conexao={conexao}
          aoAbrir={(c) => setAberta({ id: c.id })}
          aoCadastrar={() => setForm({ cadastro: null })}
        />
      ) : (
        <PerfilCliente
          key={`${'id' in aberta ? aberta.id : aberta.norm}-${versao}`}
          conexao={conexao}
          chave={aberta}
          aoVoltar={() => setAberta(null)}
          aoEditar={(p: Perfil) => p.cadastro && setForm({ cadastro: p.cadastro })}
          aoNovaVenda={abrirVendas}
        />
      )}

      {form && (
        <FormCliente
          conexao={conexao}
          cadastro={form.cadastro}
          aoFechar={() => setForm(null)}
          aoSalvar={(id) => {
            setForm(null);
            setAberta({ id });
            setVersao((v) => v + 1);
          }}
        />
      )}
    </>
  );
}

/** "Nova venda para esta cliente".
 *
 *  Registrar venda ainda não existe em React — ela vive no painel clássico,
 *  e inventar aqui um caminho de pagamento ou de crédito seria criar
 *  backend novo por dentro de uma tela. O que esta função faz é o que dá
 *  para fazer com honestidade: levar para o lugar onde a venda se registra
 *  HOJE, já dizendo de quem ela é. */
function abrirVendas(perfil: Perfil) {
  const q = new URLSearchParams();
  if (perfil.clienteId !== null) q.set('cliente', String(perfil.clienteId));
  if (perfil.nomeExibicao) q.set('clienteNome', perfil.nomeExibicao);
  window.location.href = `../../dashboard.html?tela=vendas&${q}`;
}
