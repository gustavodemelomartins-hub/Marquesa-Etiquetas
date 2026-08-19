import { useEffect, useState } from 'react';
import type { Connection } from '../../services/client';
import { Drawer } from '../../components/Drawer';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { criarRevendedora } from '../maletas/api';

interface Props {
  aberto: boolean;
  conexao: Connection;
  aoFechar: () => void;
  /** Recebe o id de quem foi criada, para a tela já abrir a aba dela. */
  aoCriar: (id: number) => void;
}

/** Cadastro de revendedora. Só o nome é obrigatório — é o que o backend
 *  exige, e pedir mais na hora de criar só atrasa quem está com a pessoa na
 *  frente. O resto se completa depois. */
export function NovaRevendedora({ aberto, conexao, aoFechar, aoCriar }: Props) {
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [cidade, setCidade] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<unknown>(null);

  useEffect(() => {
    if (!aberto) return;
    setNome('');
    setTel('');
    setCidade('');
    setErro(null);
    setSalvando(false);
  }, [aberto]);

  async function salvar() {
    if (!nome.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await criarRevendedora(conexao, { nome: nome.trim(), tel, cidade });
      aoCriar(r.id);
    } catch (e) {
      setErro(e);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Drawer aberto={aberto} titulo="Nova revendedora" aoFechar={aoFechar}>
      {!!erro && <ErrorState erro={erro} />}
      <section className="fluxo-etapa">
        <label className="campo">
          <span>Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        </label>
        <label className="campo">
          <span>Telefone</span>
          <input value={tel} onChange={(e) => setTel(e.target.value)} />
        </label>
        <label className="campo">
          <span>Cidade</span>
          <input value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </label>
        {salvando ? (
          <LoadingState>Cadastrando…</LoadingState>
        ) : (
          <div className="fluxo-acoes">
            <button type="button" className="btn btn-leitura" onClick={aoFechar}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-escrita"
              disabled={!nome.trim()}
              onClick={salvar}
            >
              Cadastrar
            </button>
          </div>
        )}
      </section>
    </Drawer>
  );
}
