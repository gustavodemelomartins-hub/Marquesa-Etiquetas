import { useState } from 'react';
import { chamar, type Connection } from '../../services/client';

interface Resposta {
  ok: boolean;
  erro?: string;
  resumo?: { casadas: number; orfas: number; jaTinham: number; falharam?: number; restantes?: number };
  falhas?: { sku: string; motivo?: string }[];
}

/** Quantas peças por chamada. Cada uma é um download da loja e uma
 *  gravação — o servidor tem teto de chamadas externas por requisição. */
const LOTE = 40;

/** COPIAR AS FOTOS DA LOJA — para as peças que a loja tem foto e o
 *  sistema não.
 *
 *  Primeiro uma leitura seca (quantas viriam), depois a cópia em lotes até
 *  acabar. Não sobrescreve foto que já existe aqui: foto que alguém subiu
 *  é mais nova que a da loja. A leitura da loja é pesada, por isso só roda
 *  quando alguém pede, e não a cada vez que a tela abre. */
export function FotosDaLoja({ conexao, aoTerminar }: { conexao: Connection; aoTerminar: (recado: string) => void }) {
  const [fase, setFase] = useState<'parado' | 'lendo' | 'pronto' | 'copiando'>('parado');
  const [previa, setPrevia] = useState<Resposta['resumo'] | null>(null);
  const [progresso, setProgresso] = useState({ copiadas: 0, falharam: 0 });
  const [erro, setErro] = useState('');

  async function ler() {
    setErro('');
    setFase('lendo');
    try {
      const r = await chamar<Resposta>(conexao, 'POST', '/api/fotos/importar-da-loja', { seco: true });
      if (!r.ok) { setErro(r.erro || 'A loja não respondeu.'); setFase('parado'); return; }
      setPrevia(r.resumo ?? null);
      setFase('pronto');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'A loja não respondeu.');
      setFase('parado');
    }
  }

  async function copiar() {
    setErro('');
    setFase('copiando');
    const ignorar: string[] = [];
    let copiadas = 0;
    try {
      for (;;) {
        const r = await chamar<Resposta>(conexao, 'POST', '/api/fotos/importar-da-loja', { limite: LOTE, ignorar });
        if (!r.ok) { setErro(r.erro || 'A loja não respondeu.'); break; }
        const res = r.resumo ?? { casadas: 0, orfas: 0, jaTinham: 0 };
        copiadas += res.casadas;
        for (const f of r.falhas ?? []) ignorar.push(f.sku);
        setProgresso({ copiadas, falharam: ignorar.length });
        /* Nenhuma copiada e todas falharam pelo mesmo motivo de infraestrutura
           (sem armazenamento de fotos): parar e dizer, em vez de girar. */
        const motivo = (r.falhas ?? [])[0]?.motivo;
        if (res.casadas === 0 && motivo) { setErro(motivo); break; }
        if (!res.restantes) break;
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'A cópia parou no meio. Tentar de novo continua de onde parou.');
    }
    setFase('parado');
    setPrevia(null);
    if (copiadas) aoTerminar(`${copiadas} fotos copiadas da loja${ignorar.length ? ` · ${ignorar.length} não baixaram` : ''}`);
  }

  return (
    <div className="mq-pend__fotos">
      {fase === 'parado' && (
        <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" onClick={ler}>
          Procurar fotos na loja online
        </button>
      )}
      {fase === 'lendo' && <p className="mq-hint">Lendo a loja…</p>}
      {fase === 'pronto' && previa && (
        previa.casadas > 0 ? (
          <div className="mq-btns">
            <span className="mq-hint">
              A loja tem foto de <b>{previa.casadas}</b> {previa.casadas === 1 ? 'peça' : 'peças'} que
              ainda não {previa.casadas === 1 ? 'tem' : 'têm'} foto aqui.
            </span>
            <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" onClick={copiar}>
              Copiar {previa.casadas} {previa.casadas === 1 ? 'foto' : 'fotos'}
            </button>
            <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={() => setFase('parado')}>Agora não</button>
          </div>
        ) : (
          <p className="mq-hint">
            A loja não tem foto nova para copiar. As peças que faltam não estão na loja —
            suba a foto de cada uma pelo botão Resolver.
          </p>
        )
      )}
      {fase === 'copiando' && (
        <p className="mq-hint" role="status">Copiando… {progresso.copiadas} prontas{progresso.falharam ? `, ${progresso.falharam} não baixaram` : ''}.</p>
      )}
      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
    </div>
  );
}
