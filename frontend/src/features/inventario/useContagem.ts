import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import {
  comRetentativa, efeitoDaLeitura, type EsperadoDoInventario, type Leitura, type LinhaContada,
} from './contagem';

/** O inventário aberto, como `GET /api/inventarios/:id` responde. */
export interface DetalheDoInventario {
  id: number;
  numero?: number | null;
  status: string;
  iniciadoEm: string;
  pausadoEm: string | null;
  concluidoEm: string | null;
  contagem: { sku: string; variacao: string | null; contado: number; contadoEm: string }[];
  esperados?: EsperadoDoInventario[];
  eventos?: { tipo: string; sku: string; desc: string; variacao: string | null; em: string }[];
  cobertura: { conferidos: number; total: number };
}

interface RespostaDaLeitura {
  ok?: boolean;
  repetida?: boolean;
  sku: string;
  linhas: { variacao: string; contado: number }[];
}

export interface LeituraPendente extends Leitura {
  /** `erro` = a rede falhou e ela espera "Tentar de novo". */
  estado: 'enviando' | 'erro';
}

const CHAVE_DA_FILA = (id: number) => `marquesa:inventario:${id}:leituras-pendentes`;

function lerFila(id: number): LeituraPendente[] {
  try {
    const bruto = localStorage.getItem(CHAVE_DA_FILA(id));
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.map((l) => ({ ...l, estado: 'erro' as const })) : [];
  } catch { return []; }
}
function gravarFila(id: number, fila: LeituraPendente[]) {
  try {
    if (fila.length) localStorage.setItem(CHAVE_DA_FILA(id), JSON.stringify(fila));
    else localStorage.removeItem(CHAVE_DA_FILA(id));
  } catch { /* armazenamento indisponível: a fila vive só na memória */ }
}

/** A CONTAGEM VIVA de um inventário.
 *
 *  O servidor é a fonte. Por cima dele a tela mostra, na hora, o efeito das
 *  leituras que ainda estão a caminho — a próxima leitura nunca espera a
 *  rede. Cada leitura tem um id próprio: reenviá-la (rede ruim, aba
 *  recarregada) não soma duas vezes, porque o servidor reconhece o id.
 *
 *  A fila do que ainda não chegou fica guardada no aparelho: fechar o
 *  navegador no meio não perde a leitura — ela é reenviada ao abrir de
 *  novo. */
export function useContagem(conexao: Connection, id: number, aoErro: (texto: string) => void) {
  const detalhe = useApi(
    (s) => chamar<DetalheDoInventario>(conexao, 'GET', `/api/inventarios/${id}`, undefined, { signal: s }),
    [conexao, id],
  );
  const esperados = useMemo(() => detalhe.dados?.esperados ?? [], [detalhe.dados]);
  const porSku = useMemo(() => new Map(esperados.map((p) => [p.sku, p])), [esperados]);
  const porSkuRef = useRef(porSku);
  porSkuRef.current = porSku;

  /* O que o servidor disse por último de cada código: a carga inicial, e
     depois cada resposta de leitura (que traz as linhas do código inteiro). */
  const [respostas, setRespostas] = useState<Map<string, LinhaContada[]>>(new Map());
  useEffect(() => { setRespostas(new Map()); }, [detalhe.dados]);
  const doServidor = useMemo(() => {
    const m = new Map<string, LinhaContada[]>();
    for (const c of detalhe.dados?.contagem ?? []) {
      const l = m.get(c.sku) ?? [];
      l.push({ variacao: c.variacao ?? '', contado: c.contado });
      m.set(c.sku, l);
    }
    for (const [sku, linhas] of respostas) m.set(sku, linhas);
    return m;
  }, [detalhe.dados, respostas]);

  const [fila, setFila] = useState<LeituraPendente[]>(() => lerFila(id));
  const filaRef = useRef(fila);
  filaRef.current = fila;
  useEffect(() => { gravarFila(id, fila); }, [id, fila]);

  /* A contagem que a tela mostra: a do servidor + o efeito das que ainda
     não chegaram, na ordem em que ela leu. */
  const contagem = useMemo(() => {
    const m = new Map(doServidor);
    for (const l of fila) {
      m.set(l.sku, efeitoDaLeitura(l, m.get(l.sku) ?? [], porSku.get(l.sku)));
      if (l.gesto === 'limpar') m.delete(l.sku);
    }
    return m;
  }, [doServidor, fila, porSku]);
  const contagemRef = useRef(contagem);
  contagemRef.current = contagem;

  /* Uma gravação por vez, na ordem das leituras. */
  const corrente = useRef<Promise<unknown>>(Promise.resolve());
  const aoErroRef = useRef(aoErro);
  aoErroRef.current = aoErro;

  const enviar = useCallback((leitura: Leitura) => {
    const vez = corrente.current.then(async () => {
      setFila((f) => f.map((x) => (x.leituraId === leitura.leituraId ? { ...x, estado: 'enviando' } : x)));
      try {
        const { estado: _e, ...corpo } = leitura as LeituraPendente;
        const r = await comRetentativa(() => chamar<RespostaDaLeitura>(
          conexao, 'POST', `/api/inventarios/${id}/leituras`, corpo));
        setRespostas((m) => new Map(m).set(r.sku, (r.linhas ?? []).map((l) => ({ variacao: l.variacao ?? '', contado: l.contado }))));
        setFila((f) => f.filter((x) => x.leituraId !== leitura.leituraId));
      } catch (e) {
        const err = e as { status?: number; message?: string };
        if (err.status && err.status >= 400 && err.status < 500) {
          /* Recusa é resposta: a leitura sai da fila e a tela diz por quê. */
          setFila((f) => f.filter((x) => x.leituraId !== leitura.leituraId));
          aoErroRef.current(err.message ?? 'A leitura não foi aceita.');
          detalhe.recarregar();
        } else {
          setFila((f) => f.map((x) => (x.leituraId === leitura.leituraId ? { ...x, estado: 'erro' } : x)));
        }
      }
    });
    corrente.current = vez.catch(() => undefined);
    return vez;
  }, [conexao, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const registrar = useCallback((leitura: Leitura) => {
    setFila((f) => [...f, { ...leitura, estado: 'enviando' }]);
    void enviar(leitura);
  }, [enviar]);

  const tentarDeNovo = useCallback(() => {
    for (const l of filaRef.current) if (l.estado === 'erro') void enviar(l);
  }, [enviar]);

  /* Ao abrir: o que ficou guardado no aparelho é reenviado. E quando a
     internet volta, também. */
  useEffect(() => {
    if (filaRef.current.length) tentarDeNovo();
    const aoVoltar = () => tentarDeNovo();
    window.addEventListener('online', aoVoltar);
    return () => window.removeEventListener('online', aoVoltar);
  }, [tentarDeNovo]);

  /* Fechar a aba com leitura a caminho: o navegador avisa. */
  const naoSalvas = fila.length;
  useEffect(() => {
    if (!naoSalvas) return undefined;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [naoSalvas]);

  /** Espera a fila esvaziar — antes de pausar, finalizar ou descartar. */
  const esperarFila = useCallback(() => corrente.current, []);

  return {
    detalhe, esperados, porSku, porSkuRef, contagem, contagemRef,
    fila, naoSalvas, comErro: fila.filter((l) => l.estado === 'erro').length,
    registrar, tentarDeNovo, esperarFila,
  };
}
