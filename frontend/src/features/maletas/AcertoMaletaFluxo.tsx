import { useMemo, useRef, useState, type ComponentType } from 'react';
import type { AppState, Reseller, Suitcase } from '../../types/api';
import { ApiError } from '../../types/api';
import type { Connection } from '../../services/client';
import { Drawer } from '../../components/Drawer';
import { money, plural } from '../../domain/formato';
import { precoEnvio } from '../../domain/maletas';
import { encerrarAcerto, type DestinoAcerto, type DocumentoAcerto, type RespostaAcerto } from './api';
import {
  registrarConferenciaFisica,
  type ConferidosPorSku,
} from './conferenciaFisica';

const DESTINOS: Array<{ valor: DestinoAcerto; rotulo: string }> = [
  { valor: 'vendida', rotulo: 'Vendida' }, { valor: 'ficou', rotulo: 'Ficou com a revendedora' },
  { valor: 'troca', rotulo: 'Troca' }, { valor: 'brinde', rotulo: 'Brinde' },
  { valor: 'perdida', rotulo: 'Perdida' }, { valor: 'quebra', rotulo: 'Quebra' },
  { valor: 'dano', rotulo: 'Dano' },
];
type Linha = { qtd: number; destino: DestinoAcerto };
type Conferencia = Record<string, { devolvidas: number; linhas: Linha[] }>;

/** Fronteira entre o Acerto e o scanner compartilhado.
 *
 * A câmera e a resolução da etiqueta ficam em `components/scanner`, sob
 * responsabilidade da camada compartilhada. Revendedoras recebe somente um
 * SKU canônico por leitura. */
export interface ResultadoLeituraScanner {
  ok: boolean;
  texto: string;
}

export interface LeitorEtiquetaProps {
  aoLer: (codigo: string) => Promise<ResultadoLeituraScanner>;
  aoFechar: () => void;
  pausado?: boolean;
  titulo?: string;
  dica?: string;
  intervaloRepetidoMs?: number;
}

export interface IntegracaoScannerAcerto {
  Leitor: ComponentType<LeitorEtiquetaProps>;
  resolverSku: (
    bruto: string | null | undefined,
    conhecidos: { has(sku: string): boolean },
  ) => string | null;
}

interface Props {
  aberto: boolean; conexao: Connection; estado: AppState; maleta: Suitcase | null;
  revendedora: Reseller; aoFechar: () => void; aoConcluir: () => void;
  scannerCompartilhado?: IntegracaoScannerAcerto;
}

const inicial = (maleta: Suitcase | null): Conferencia => Object.fromEntries(
  Object.entries(maleta?.itens ?? {}).map(([sku, qtd]) => [sku, { devolvidas: qtd, linhas: [] }]),
);

/** A interface fecha cada SKU; o servidor repete a prova antes de tocar em
 * venda, movimento ou saldo. */
export function AcertoMaletaFluxo({
  aberto, conexao, estado, maleta, revendedora, aoFechar, aoConcluir, scannerCompartilhado,
}: Props) {
  const [dados, setDados] = useState<Conferencia>(() => inicial(maleta));
  const [conferidos, setConferidos] = useState<ConferidosPorSku>({});
  const conferidosRef = useRef<ConferidosPorSku>({});
  const [cameraAberta, setCameraAberta] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<RespostaAcerto | null>(null);
  const produtos = useMemo(() => new Map(estado.produtos.map((p) => [p.sku, p])), [estado.produtos]);
  const skusConhecidos = useMemo(() => new Set(estado.produtos.map((p) => p.sku)), [estado.produtos]);
  if (!maleta) return null;
  const maletaId = maleta.id;

  const atualizarDevolvidas = (sku: string, valor: number) => {
    const enviadas = maleta.itens[sku] ?? 0;
    const devolvidas = Math.max(0, Math.min(enviadas, Math.floor(valor || 0)));
    const restante = enviadas - devolvidas;
    setDados((atual) => ({ ...atual, [sku]: {
      devolvidas,
      linhas: restante > 0 ? [{ qtd: restante, destino: atual[sku]?.linhas[0]?.destino ?? 'vendida' }] : [],
    } }));
  };
  const receberLeitura = async (codigo: string): Promise<ResultadoLeituraScanner> => {
    if (!scannerCompartilhado) return { ok: false, texto: 'Leitor indisponível.' };
    const sku = scannerCompartilhado.resolverSku(codigo, skusConhecidos);
    if (!sku) return { ok: false, texto: `Código ${codigo} não encontrado no catálogo.` };

    const leitura = registrarConferenciaFisica(maleta.itens, conferidosRef.current, sku);
    conferidosRef.current = leitura.conferidos;
    setConferidos(leitura.conferidos);
    if (leitura.tipo === 'fora_da_maleta') {
      return { ok: false, texto: `Esta peça não pertence a esta maleta · SKU ${sku}` };
    }
    const nome = produtos.get(sku)?.desc ?? sku;
    if (leitura.tipo === 'completa') {
      return { ok: false, texto: `${nome} já está completa · ${leitura.quantidade} de ${leitura.enviadas} conferidos` };
    }
    return { ok: true, texto: `✓ ${nome} · SKU ${sku} · ${leitura.quantidade} de ${leitura.enviadas} conferidos` };
  };
  const atualizarLinha = (sku: string, indice: number, parte: Partial<Linha>) => setDados((atual) => ({
    ...atual, [sku]: { ...atual[sku]!, linhas: atual[sku]!.linhas.map((l, i) => i === indice ? { ...l, ...parte } : l) },
  }));
  const dividir = (sku: string) => setDados((atual) => {
    const item = atual[sku]!;
    const primeira = item.linhas.findIndex((l) => l.qtd > 1);
    if (primeira < 0) return atual;
    const linhas = item.linhas.map((l, i) => i === primeira ? { ...l, qtd: l.qtd - 1 } : l);
    linhas.push({ qtd: 1, destino: 'vendida' });
    return { ...atual, [sku]: { ...item, linhas } };
  });
  const documento: DocumentoAcerto = {
    devolvidas: Object.fromEntries(Object.entries(dados).map(([sku, d]) => [sku, d.devolvidas])),
    faltas: Object.entries(dados).filter(([, d]) => d.linhas.length > 0).map(([sku, d]) => ({ sku, linhas: d.linhas })),
  };
  const divergencias = Object.entries(maleta.itens).filter(([sku, qtd]) => {
    const d = dados[sku];
    return !d || d.devolvidas + d.linhas.reduce((s, l) => s + l.qtd, 0) !== qtd
      || d.linhas.some((l) => !Number.isInteger(l.qtd) || l.qtd <= 0);
  });
  const enviadas = Object.values(maleta.itens).reduce((s, q) => s + q, 0);
  const devolvidas = Object.values(dados).reduce((s, d) => s + d.devolvidas, 0);
  const vendidas = Object.values(dados).flatMap((d) => d.linhas).filter((l) => l.destino === 'vendida').reduce((s, l) => s + l.qtd, 0);
  const bruto = Object.entries(dados).reduce((s, [sku, d]) => s + d.linhas.filter((l) => l.destino === 'vendida')
    .reduce((t, l) => t + l.qtd * (precoEnvio(maleta, sku, produtos) ?? 0), 0), 0);

  async function concluir() {
    if (divergencias.length) return;
    setSalvando(true); setErro('');
    try { const r = await encerrarAcerto(conexao, maletaId, documento); setResultado(r); aoConcluir(); }
    catch (e) { setErro(e instanceof ApiError ? e.message : 'Não foi possível concluir o acerto.'); }
    finally { setSalvando(false); }
  }

  return <Drawer aberto={aberto} largura="largo" titulo={`Acerto da maleta ${maleta.id}`}
    sub={`${revendedora.nome} · confira o destino de todas as ${enviadas} peças`} aoFechar={aoFechar}
    rodape={!resultado && <div className="fluxo-acoes">
      <button type="button" className="btn btn-leitura" onClick={aoFechar}>Cancelar</button>
      {!confirmando
        ? <button type="button" className="btn btn-escrita" disabled={!!divergencias.length} onClick={() => { setCameraAberta(false); setConfirmando(true); }}>Revisar acerto</button>
        : <button type="button" className="btn btn-escrita" disabled={salvando || !!divergencias.length} onClick={concluir}>{salvando ? 'Gravando…' : 'Confirmar e encerrar maleta'}</button>}
    </div>}>
    {resultado ? <div className="fluxo-etapa acerto-concluido">
      <h3>Acerto concluído</h3><p>{resultado.acerto.vendidas} vendidas · {resultado.acerto.devolvidas} devolvidas.</p>
      <dl className="acerto-resumo-financeiro"><div><dt>Vendido</dt><dd>{money(resultado.acerto.totalVendido)}</dd></div><div><dt>Comissão</dt><dd>{money(resultado.acerto.comissao)}</dd></div><div><dt>Líquido Marquesa</dt><dd>{money(resultado.acerto.liquido)}</dd></div></dl>
      <button type="button" className="btn btn-escrita" onClick={aoFechar}>Voltar para a revendedora</button>
    </div> : confirmando ? <div className="fluxo-etapa">
      <h3>Confira antes de gravar</h3><div className="acerto-resumo"><b>{enviadas} enviadas</b><span>{devolvidas} devolvidas</span><span>{vendidas} vendidas</span><span>{money(bruto)} vendido</span></div>
      <p className="fluxo-nota">A comissão e o líquido oficiais serão calculados pelo servidor com os preços congelados no envio. Esta ação grava a venda, as movimentações e encerra a maleta.</p>
      <button type="button" className="btn btn-leitura btn-sm" onClick={() => setConfirmando(false)}>Voltar à conferência</button>{erro && <div className="aviso" data-tom="erro">{erro}</div>}
    </div> : <div className="fluxo-etapa">
      <div className="acerto-resumo"><b>{enviadas} enviadas</b><span>{devolvidas} devolvidas</span><span>{vendidas} vendidas</span></div>
      {scannerCompartilhado && <section className="acerto-scanner" aria-label="Conferência pela câmera">
        <div className="acerto-scanner__cabeca">
          <div><b>Conferência física</b><small>Cada bip marca uma unidade encontrada. Venda, devolução e estoque continuam abaixo.</small></div>
          {!cameraAberta && <button type="button" className="btn btn-leitura" onClick={() => setCameraAberta(true)}>Abrir câmera</button>}
        </div>
        {cameraAberta && <scannerCompartilhado.Leitor
          aoLer={receberLeitura}
          aoFechar={() => setCameraAberta(false)}
          titulo="Bipe as peças desta maleta"
          dica="A câmera fica aberta. Cada leitura só marca uma unidade encontrada."
        />}
      </section>}
      <div className="acerto-itens">{Object.entries(maleta.itens).map(([sku, qtd]) => {
        const d = dados[sku]!; const destinado = d.linhas.reduce((s, l) => s + l.qtd, 0); const fecha = d.devolvidas + destinado === qtd;
        return <section className="acerto-item" key={sku}><div className="acerto-item__topo"><div><b>{produtos.get(sku)?.desc ?? sku}</b><small>{sku} · {qtd} {plural(qtd, 'enviada', 'enviadas')}</small>{scannerCompartilhado && <small className={conferidos[sku] === qtd ? 'acerto-conferido completo' : 'acerto-conferido'}>{conferidos[sku] ?? 0} de {qtd} conferidos</small>}</div><span className={fecha ? 'acerto-fecha' : 'acerto-diverge'}>{d.devolvidas + destinado}/{qtd}</span></div>
          <label className="campo"><span>Voltaram para casa</span><input aria-label={`Devolvidas de ${sku}`} type="number" min={0} max={qtd} value={d.devolvidas} onChange={(e) => atualizarDevolvidas(sku, Number(e.target.value))} /></label>
          {d.linhas.map((l, i) => <div className="acerto-destino" key={`${sku}-${i}`}><label><span>Quantidade</span><input aria-label={`Quantidade destinada de ${sku} ${i + 1}`} type="number" min={1} value={l.qtd} onChange={(e) => atualizarLinha(sku, i, { qtd: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></label><label><span>Destino</span><select aria-label={`Destino de ${sku} ${i + 1}`} value={l.destino} onChange={(e) => atualizarLinha(sku, i, { destino: e.target.value as DestinoAcerto })}>{DESTINOS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select></label>{d.linhas.length > 1 && <button type="button" className="btn btn-leitura btn-sm" onClick={() => setDados((a) => ({ ...a, [sku]: { ...a[sku]!, linhas: a[sku]!.linhas.filter((_, j) => j !== i) } }))}>Remover</button>}</div>)}
          {destinado > 1 && <button type="button" className="btn btn-leitura btn-sm" onClick={() => dividir(sku)}>Dividir destino</button>}{!fecha && <small className="acerto-diverge">A soma deve fechar exatamente {qtd}.</small>}
        </section>;
      })}</div>{erro && <div className="aviso" data-tom="erro">{erro}</div>}
    </div>}
  </Drawer>;
}
