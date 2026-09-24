import { useEffect, useState } from 'react';
import type { Reseller } from '../../types/api';
import type { Connection } from '../../services/client';
import { Drawer } from '../../components/Drawer';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { atualizarRevendedora } from '../maletas/api';

interface Props {
  aberto: boolean;
  conexao: Connection;
  revendedora: Reseller;
  aoFechar: () => void;
  aoSalvar: () => void;
}

export function EditarRevendedora({ aberto, conexao, revendedora, aoFechar, aoSalvar }: Props) {
  const [nome, setNome] = useState(revendedora.nome);
  const [tel, setTel] = useState(revendedora.tel);
  const [cidade, setCidade] = useState(revendedora.cidade);
  const [cpf, setCpf] = useState(revendedora.cpf);
  const [endereco, setEndereco] = useState(revendedora.endereco);
  const [obs, setObs] = useState(revendedora.obs);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<unknown>(null);

  useEffect(() => {
    if (!aberto) return;
    setNome(revendedora.nome); setTel(revendedora.tel); setCidade(revendedora.cidade);
    setCpf(revendedora.cpf); setEndereco(revendedora.endereco); setObs(revendedora.obs);
    setErro(null); setSalvando(false);
  }, [aberto, revendedora]);

  async function salvar() {
    if (!nome.trim()) return;
    setSalvando(true); setErro(null);
    try {
      await atualizarRevendedora(conexao, revendedora.id, {
        nome: nome.trim(), tel: tel.trim(), cidade: cidade.trim(), cpf: cpf.trim(),
        endereco: endereco.trim(), obs: obs.trim(),
      });
      aoSalvar();
      aoFechar();
    } catch (e) { setErro(e); } finally { setSalvando(false); }
  }

  return <Drawer aberto={aberto} titulo="Editar cadastro" sub={revendedora.nome} aoFechar={aoFechar}>
    {!!erro && <ErrorState erro={erro} />}
    <section className="fluxo-etapa">
      <label className="campo"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></label>
      <div className="fluxo-campos">
        <label className="campo"><span>Telefone</span><input value={tel} onChange={(e) => setTel(e.target.value)} /></label>
        <label className="campo"><span>Cidade</span><input value={cidade} onChange={(e) => setCidade(e.target.value)} /></label>
      </div>
      <label className="campo"><span>CPF</span><input value={cpf} onChange={(e) => setCpf(e.target.value)} /></label>
      <label className="campo"><span>Endereço</span><input value={endereco} onChange={(e) => setEndereco(e.target.value)} /></label>
      <label className="campo"><span>Observações</span><textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={4} /></label>
      {salvando ? <LoadingState>Salvando cadastro…</LoadingState> : <div className="fluxo-acoes">
        <button type="button" className="btn btn-leitura" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn btn-escrita" disabled={!nome.trim()} onClick={salvar}>Salvar alterações</button>
      </div>}
    </section>
  </Drawer>;
}
