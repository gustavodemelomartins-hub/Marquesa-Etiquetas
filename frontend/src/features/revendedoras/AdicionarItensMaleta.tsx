import { useEffect, useMemo, useState } from 'react';
import type { AppState, Suitcase } from '../../types/api';
import type { Connection } from '../../services/client';
import { Drawer } from '../../components/Drawer';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { money, plural } from '../../domain/formato';
import { adicionarItens, type ItemRecusado } from '../maletas/api';

interface Props {
  aberto: boolean;
  conexao: Connection;
  estado: AppState;
  maleta: Suitcase | null;
  aoFechar: () => void;
  aoConcluir: () => void;
}

export function AdicionarItensMaleta({ aberto, conexao, estado, maleta, aoFechar, aoConcluir }: Props) {
  const [busca, setBusca] = useState('');
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const [recusados, setRecusados] = useState<ItemRecusado[]>([]);

  useEffect(() => {
    if (!aberto) return;
    setBusca(''); setQuantidades({}); setErro(null); setRecusados([]); setEnviando(false);
  }, [aberto]);

  const elegiveis = useMemo(() => estado.produtos
    .filter((p) => p.status === 'ativo' && p.disponivel > 0 && !p.componentes)
    .sort((a, b) => (a.cat || 'Outros').localeCompare(b.cat || 'Outros') || a.desc.localeCompare(b.desc)), [estado.produtos]);
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const visiveis = termo
    ? elegiveis.filter((p) => `${p.sku} ${p.desc} ${p.cat}`.toLocaleLowerCase('pt-BR').includes(termo))
    : elegiveis;
  const total = Object.values(quantidades).reduce((s, q) => s + q, 0);

  function definir(sku: string, bruto: string, limite: number) {
    const qtd = Math.max(0, Math.min(limite, Math.floor(Number(bruto) || 0)));
    setQuantidades((atual) => ({ ...atual, [sku]: qtd }));
  }

  async function confirmar() {
    if (!maleta || total < 1) return;
    const itens = Object.fromEntries(Object.entries(quantidades).filter(([, qtd]) => qtd > 0));
    setEnviando(true); setErro(null); setRecusados([]);
    try {
      const resposta = await adicionarItens(conexao, maleta.id, itens);
      setRecusados(resposta.recusados);
      aoConcluir();
      if (!resposta.recusados.length) aoFechar();
    } catch (e) { setErro(e); } finally { setEnviando(false); }
  }

  return <Drawer aberto={aberto} titulo={`Adicionar itens à maleta #${maleta?.id ?? ''}`} sub="As peças entram com o preço atual congelado no envio." aoFechar={aoFechar} largura="largo">
    {!!erro && <ErrorState erro={erro} />}
    {!!recusados.length && <div className="aviso"><b>Alguns itens não entraram.</b><ul className="lista-recusa">{recusados.map((r) => <li key={r.sku}><code>{r.sku}</code> · {r.motivo}</li>)}</ul></div>}
    <section className="fluxo-etapa">
      <label className="campo"><span>Buscar no estoque de casa</span><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, peça ou categoria" autoFocus /></label>
      {!visiveis.length ? <EmptyState titulo="Nenhuma peça disponível encontrada" /> : <div className="rev-adicionar-lista">
        {visiveis.map((p) => <label key={p.sku} className="rev-adicionar-item">
          <span><b>{p.sku} · {p.desc}</b><small>{p.cat || 'Outros'} · {p.preco === null ? 'sem preço' : money(p.preco)} · {p.disponivel} disponíveis</small></span>
          <input className="qtd" aria-label={`Quantidade de ${p.sku}`} type="number" min={0} max={p.disponivel} value={quantidades[p.sku] || 0} onChange={(e) => definir(p.sku, e.target.value, p.disponivel)} />
        </label>)}
      </div>}
      {enviando ? <LoadingState>Adicionando itens…</LoadingState> : <div className="fluxo-acoes">
        <button type="button" className="btn btn-leitura" onClick={aoFechar}>Cancelar</button>
        <span className="fluxo-total">{total} {plural(total, 'peça selecionada', 'peças selecionadas')}</span>
        <button type="button" className="btn btn-escrita" disabled={!maleta || total < 1} onClick={confirmar}>Adicionar à maleta</button>
      </div>}
    </section>
  </Drawer>;
}
