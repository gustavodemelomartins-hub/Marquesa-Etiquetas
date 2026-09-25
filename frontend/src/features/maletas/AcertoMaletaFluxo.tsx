import { useMemo, useRef, useState, type ComponentType, type FormEvent } from 'react';
import type { AppState, Reseller, Suitcase } from '../../types/api';
import { ApiError } from '../../types/api';
import type { Connection } from '../../services/client';
import { Drawer } from '../../components/Drawer';
import { Icone } from '../../components/Icone';
import { money, plural } from '../../domain/formato';
import { precoEnvio } from '../../domain/maletas';
import { encerrarAcerto, type DestinoAcerto, type DocumentoAcerto, type RespostaAcerto } from './api';
import {
  registrarConferenciaFisica,
  type DevolvidasPorSku,
} from './conferenciaFisica';

const DESTINOS: Array<{ valor: DestinoAcerto; rotulo: string }> = [
  { valor: 'vendida', rotulo: 'Vendida' }, { valor: 'ficou', rotulo: 'Ficou com a revendedora' },
  { valor: 'troca', rotulo: 'Troca' }, { valor: 'brinde', rotulo: 'Brinde' },
  { valor: 'perdida', rotulo: 'Perdida' }, { valor: 'quebra', rotulo: 'Quebra' },
  { valor: 'dano', rotulo: 'Dano' },
];
type Linha = { qtd: number; destino: DestinoAcerto };
type Conferencia = Record<string, { devolvidas: number; linhas: Linha[] }>;

function ajustarLinhasAoRestante(linhas: Linha[], restante: number): Linha[] {
  if (restante <= 0) return [];
  const atuais = linhas.filter((linha) => linha.qtd > 0).map((linha) => ({ ...linha }));
  const totalAtual = atuais.reduce((soma, linha) => soma + linha.qtd, 0);

  if (totalAtual < restante) {
    const vendida = atuais.find((linha) => linha.destino === 'vendida');
    if (vendida) vendida.qtd += restante - totalAtual;
    else atuais.unshift({ qtd: restante - totalAtual, destino: 'vendida' });
    return atuais;
  }

  let remover = totalAtual - restante;
  const ordem = [
    ...atuais.map((_, indice) => indice).filter((indice) => atuais[indice]!.destino === 'vendida'),
    ...atuais.map((_, indice) => indice).filter((indice) => atuais[indice]!.destino !== 'vendida').reverse(),
  ];
  for (const indice of ordem) {
    if (remover <= 0) break;
    const retiradas = Math.min(atuais[indice]!.qtd, remover);
    atuais[indice]!.qtd -= retiradas;
    remover -= retiradas;
  }
  return atuais.filter((linha) => linha.qtd > 0);
}

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
  Object.entries(maleta?.itens ?? {}).map(([sku, qtd]) => [sku, {
    devolvidas: 0,
    linhas: qtd > 0 ? [{ qtd, destino: 'vendida' as const }] : [],
  }]),
);

/** A interface fecha cada SKU; o servidor repete a prova antes de tocar em
 * venda, movimento ou saldo. */
export function AcertoMaletaFluxo({
  aberto, conexao, estado, maleta, revendedora, aoFechar, aoConcluir, scannerCompartilhado,
}: Props) {
  const [dados, setDados] = useState<Conferencia>(() => inicial(maleta));
  const dadosRef = useRef<Conferencia>(dados);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<RespostaAcerto | null>(null);
  const [filtro, setFiltro] = useState('');
  const [somenteNaoDevolvidas, setSomenteNaoDevolvidas] = useState(false);
  const [codigoManual, setCodigoManual] = useState('');
  const [lendoManual, setLendoManual] = useState(false);
  const [retornoManual, setRetornoManual] = useState<ResultadoLeituraScanner | null>(null);
  const codigoManualRef = useRef<HTMLInputElement | null>(null);
  const produtos = useMemo(() => new Map(estado.produtos.map((p) => [p.sku, p])), [estado.produtos]);
  const skusConhecidos = useMemo(() => new Set(estado.produtos.map((p) => p.sku)), [estado.produtos]);
  if (!maleta) return null;
  const maletaId = maleta.id;

  const mudarDados = (calcular: (atual: Conferencia) => Conferencia) => {
    const proximo = calcular(dadosRef.current);
    dadosRef.current = proximo;
    setDados(proximo);
  };

  const atualizarDevolvidas = (sku: string, valor: number) => {
    const enviadas = maleta.itens[sku] ?? 0;
    const devolvidas = Math.max(0, Math.min(enviadas, Math.floor(valor || 0)));
    const restante = enviadas - devolvidas;
    mudarDados((atual) => ({ ...atual, [sku]: {
      devolvidas,
      linhas: ajustarLinhasAoRestante(atual[sku]?.linhas ?? [], restante),
    } }));
  };
  const receberLeitura = async (codigo: string): Promise<ResultadoLeituraScanner> => {
    if (!scannerCompartilhado) return { ok: false, texto: 'Leitor indisponível.' };
    const sku = scannerCompartilhado.resolverSku(codigo, skusConhecidos);
    if (!sku) return { ok: false, texto: `Código ${codigo} não encontrado no catálogo.` };

    const devolvidasAtuais: DevolvidasPorSku = Object.fromEntries(
      Object.entries(dadosRef.current).map(([codigo, item]) => [codigo, item.devolvidas]),
    );
    const leitura = registrarConferenciaFisica(maleta.itens, devolvidasAtuais, sku);
    if (leitura.tipo === 'fora_da_maleta') {
      return { ok: false, texto: `Esta peça não pertence a esta maleta · SKU ${sku}` };
    }
    const nome = produtos.get(sku)?.desc ?? sku;
    if (leitura.tipo === 'completa') {
      return { ok: false, texto: `${nome} já está completa · ${leitura.quantidade} de ${leitura.enviadas} devolvidas` };
    }
    atualizarDevolvidas(sku, leitura.quantidade);
    return { ok: true, texto: `✓ ${nome} · SKU ${sku} · ${leitura.quantidade} de ${leitura.enviadas} devolvidas` };
  };
  const enviarCodigoManual = async (evento: FormEvent) => {
    evento.preventDefault();
    const codigo = codigoManual.trim();
    if (!codigo || lendoManual) return;
    setLendoManual(true);
    const retorno = await receberLeitura(codigo);
    setRetornoManual(retorno);
    if (retorno.ok) setCodigoManual('');
    setLendoManual(false);
    codigoManualRef.current?.focus();
  };
  const atualizarLinha = (sku: string, indice: number, parte: Partial<Linha>) => mudarDados((atual) => ({
    ...atual, [sku]: { ...atual[sku]!, linhas: atual[sku]!.linhas.map((l, i) => i === indice ? { ...l, ...parte } : l) },
  }));
  const dividir = (sku: string) => mudarDados((atual) => {
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
  const outrosDestinos = Object.values(dados).flatMap((d) => d.linhas).filter((l) => l.destino !== 'vendida').reduce((s, l) => s + l.qtd, 0);
  const bruto = Object.entries(dados).reduce((s, [sku, d]) => s + d.linhas.filter((l) => l.destino === 'vendida')
    .reduce((t, l) => t + l.qtd * (precoEnvio(maleta, sku, produtos) ?? 0), 0), 0);
  const filtroNormalizado = filtro.trim().toLocaleLowerCase('pt-BR');
  const itensVisiveis = Object.entries(maleta.itens).filter(([sku, qtd]) => {
    const encontrado = !filtroNormalizado
      || sku.toLocaleLowerCase('pt-BR').includes(filtroNormalizado)
      || (produtos.get(sku)?.desc ?? '').toLocaleLowerCase('pt-BR').includes(filtroNormalizado);
    return encontrado && (!somenteNaoDevolvidas || (dados[sku]?.devolvidas ?? 0) < qtd);
  });

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
      <h3>Confira antes de gravar</h3><div className="acerto-resumo"><b>{enviadas} enviadas</b><span>{devolvidas} devolvidas</span><span>{vendidas} vendidas</span>{outrosDestinos > 0 && <span>{outrosDestinos} em outros destinos</span>}<span>{money(bruto)} vendido</span></div>
      {devolvidas === 0 && <p className="fluxo-nota acerto-atencao">Nenhuma peça foi marcada como devolvida. Ao confirmar, todas as peças serão tratadas pelos destinos escolhidos.</p>}
      <p className="fluxo-nota">A comissão e o líquido oficiais serão calculados pelo servidor com os preços congelados no envio. Esta ação grava a venda, as movimentações e encerra a maleta.</p>
      <button type="button" className="btn btn-leitura btn-sm" onClick={() => setConfirmando(false)}>Voltar à conferência</button>{erro && <div className="aviso" data-tom="erro">{erro}</div>}
    </div> : <div className="fluxo-etapa">
      <div className="acerto-resumo"><b>{enviadas} enviadas</b><span>{devolvidas} devolvidas</span><span>{vendidas} vendidas provisórias</span>{outrosDestinos > 0 && <span>{outrosDestinos} em outros destinos</span>}</div>
      <ol className="acerto-guia" aria-label="Como fazer a conferência">
        <li><b>Comece em zero.</b><span>Bipe cada unidade que voltou.</span></li>
        <li><b>Revise o restante.</b><span>O que não voltou fica como venda provisória.</span></li>
        <li><b>Trate as exceções.</b><span>Troque o destino quando não for venda.</span></li>
      </ol>
      {scannerCompartilhado && <section className="acerto-scanner" aria-label="Conferência de devoluções">
        <div className="acerto-scanner__cabeca">
          <div><b>Registrar peça devolvida</b><small>Digite o código ou use a câmera. Cada leitura soma uma unidade devolvida.</small></div>
        </div>
        {!cameraAberta && <form className="acerto-entrada" onSubmit={enviarCodigoManual}>
          <label className="campo"><span>Código da etiqueta</span><input ref={codigoManualRef} value={codigoManual} onChange={(e) => setCodigoManual(e.target.value)} placeholder="326660" inputMode="numeric" autoComplete="off" autoCapitalize="off" spellCheck={false} /></label>
          <button type="submit" className="btn btn-escrita" disabled={!codigoManual.trim() || lendoManual}>{lendoManual ? 'Registrando…' : 'Registrar devolução'}</button>
          <button type="button" className="btn btn-leitura acerto-camera" aria-label="Abrir câmera" title="Abrir câmera" onClick={() => { setRetornoManual(null); setCameraAberta(true); }}><Icone nome="camera" /></button>
        </form>}
        {retornoManual && <p className={retornoManual.ok ? 'acerto-retorno sucesso' : 'acerto-retorno erro'} role="status">{retornoManual.texto}</p>}
        {cameraAberta && <scannerCompartilhado.Leitor
          aoLer={receberLeitura}
          aoFechar={() => setCameraAberta(false)}
          titulo="Bipe as peças devolvidas"
          dica="A câmera fica aberta. Nada é gravado até você revisar e confirmar o acerto."
        />}
      </section>}
      <div className="acerto-filtros">
        <label className="campo"><span>Buscar peça nesta maleta</span><input type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Nome ou SKU" /></label>
        <label className="acerto-check"><input type="checkbox" checked={somenteNaoDevolvidas} onChange={(e) => setSomenteNaoDevolvidas(e.target.checked)} /><span>Mostrar apenas peças com quantidade não devolvida</span></label>
      </div>
      <div className="acerto-itens">{itensVisiveis.map(([sku, qtd]) => {
        const d = dados[sku]!; const destinado = d.linhas.reduce((s, l) => s + l.qtd, 0); const fecha = d.devolvidas + destinado === qtd;
        return <section className="acerto-item" key={sku}><div className="acerto-item__topo"><div><b>{produtos.get(sku)?.desc ?? sku}</b><small>{sku} · {qtd} {plural(qtd, 'enviada', 'enviadas')}</small></div><span className={d.devolvidas === qtd ? 'acerto-status completo' : 'acerto-status'}>{d.devolvidas} de {qtd} devolvidas</span></div>
          <label className="campo"><span>Quantidade devolvida</span><input aria-label={`Devolvidas de ${sku}`} type="number" min={0} max={qtd} value={d.devolvidas} onChange={(e) => atualizarDevolvidas(sku, Number(e.target.value))} /></label>
          {d.linhas.map((l, i) => <div className="acerto-destino" key={`${sku}-${i}`}><label><span>Quantidade não devolvida</span><input aria-label={`Quantidade destinada de ${sku} ${i + 1}`} type="number" min={1} value={l.qtd} onChange={(e) => atualizarLinha(sku, i, { qtd: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></label><label><span>Destino das não devolvidas</span><select aria-label={`Destino de ${sku} ${i + 1}`} value={l.destino} onChange={(e) => atualizarLinha(sku, i, { destino: e.target.value as DestinoAcerto })}>{DESTINOS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select></label>{d.linhas.length > 1 && <button type="button" className="btn btn-leitura btn-sm" onClick={() => mudarDados((a) => ({ ...a, [sku]: { ...a[sku]!, linhas: a[sku]!.linhas.filter((_, j) => j !== i) } }))}>Remover</button>}</div>)}
          {destinado > 1 && <button type="button" className="btn btn-leitura btn-sm" onClick={() => dividir(sku)}>Dividir em outro destino</button>}{!fecha && <small className="acerto-diverge">A soma deve fechar exatamente {qtd}.</small>}
        </section>;
      })}{itensVisiveis.length === 0 && <p className="acerto-vazio">Nenhuma peça corresponde a este filtro.</p>}</div>{erro && <div className="aviso" data-tom="erro">{erro}</div>}
    </div>}
  </Drawer>;
}
