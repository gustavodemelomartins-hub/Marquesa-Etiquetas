import { useMemo, useState } from 'react';
import { Icone } from '../../components/Icone';
import { plural } from '../../domain/formato';
import {
  categoriaDe, estadoDoCodigo, ROTULO_DA_SITUACAO, type EsperadoDoInventario, type LinhaContada, type Situacao,
} from './contagem';

export type FiltroDaLista = 'nao_conferido' | 'diferenca' | 'conferido' | 'todos';

const FILTROS: [FiltroDaLista, string][] = [
  ['nao_conferido', 'Não conferidas'],
  ['diferenca', 'Com diferença'],
  ['conferido', 'Tudo certo'],
  ['todos', 'Todas'],
];

const passa = (f: FiltroDaLista, s: Situacao) => (
  f === 'todos' ? true
    : f === 'diferenca' ? s === 'faltando' || s === 'sobrando'
      : f === 'conferido' ? s === 'conferido' : s === 'nao_conferido');

/** A LISTA — a planilha da Sthefany, peça por peça.
 *
 *  Mesmas colunas que ela usa: código, descrição, estoque total,
 *  revendedoras, em casa, conferido e faltando. No computador é tabela; no
 *  telefone cada peça vira um cartão com os mesmos números — uma planilha
 *  de sete colunas não cabe em 390px.
 *
 *  Tocar numa peça abre a conferência dela: é por aqui que se resolve uma
 *  não conferida, sem leitor. */
export function ListaDoInventario({
  pecas, contagem, categoria, aoAbrir, filtroInicial = 'nao_conferido',
}: {
  pecas: EsperadoDoInventario[];
  contagem: Map<string, LinhaContada[]>;
  categoria: string | null;
  aoAbrir: (sku: string) => void;
  filtroInicial?: FiltroDaLista;
}) {
  const [filtro, setFiltro] = useState<FiltroDaLista>(filtroInicial);
  const [limite, setLimite] = useState(120);

  const linhas = useMemo(() => pecas
    .filter((p) => !categoria || categoriaDe(p) === categoria)
    .map((p) => ({ p, e: estadoDoCodigo(p, contagem.get(p.sku)) }))
    .filter(({ e }) => passa(filtro, e.situacao)),
  [pecas, contagem, categoria, filtro]);

  return (
    <section className="inv-lista" aria-label="Lista do inventário">
      <div className="inv-lista__filtros mq-chipset" role="group" aria-label="Mostrar">
        {FILTROS.map(([f, r]) => (
          <button key={f} type="button" className={filtro === f ? 'mq-chip is-on' : 'mq-chip'}
            aria-pressed={filtro === f} onClick={() => { setFiltro(f); setLimite(120); }}>
            {r}
          </button>
        ))}
        <span className="mq-filters__count">{linhas.length} {plural(linhas.length, 'peça', 'peças')}</span>
      </div>

      {linhas.length === 0 ? (
        <p className="mq-hint inv-lista__vazia">
          {filtro === 'nao_conferido' ? 'Nenhuma peça esperando conferência aqui.' : 'Nada nesta lista.'}
        </p>
      ) : (
        <div className="inv-tabela">
          <div className="inv-tabela__cab" aria-hidden="true">
            <span>Código</span>
            <span>Descrição</span>
            <span className="is-num">Estoque</span>
            <span className="is-num">Revendedoras</span>
            <span className="is-num">Em casa</span>
            <span className="is-num">Conferido</span>
            <span className="is-num">Faltando</span>
          </div>
          {linhas.slice(0, limite).map(({ p, e }) => (
            <button key={p.sku} type="button" className={`inv-tabela__linha is-${e.situacao}`}
              onClick={() => aoAbrir(p.sku)} aria-label={`${p.desc}, código ${p.sku}: ${ROTULO_DA_SITUACAO[e.situacao]}`}>
              <span className="inv-c-codigo">{p.sku}</span>
              <span className="inv-c-desc">
                <b>{p.desc}</b>
                <small className={`inv-situacao is-${e.situacao}`}>{ROTULO_DA_SITUACAO[e.situacao]}</small>
              </span>
              <span className="is-num" data-rotulo="Estoque">{p.total}</span>
              <span className="is-num" data-rotulo="Revendedoras">{p.consignado || '—'}</span>
              <span className="is-num is-casa" data-rotulo="Em casa">{Math.max(0, p.esperado)}</span>
              <span className="is-num" data-rotulo="Conferido">{e.conferido ?? '—'}</span>
              <span className={`is-num${e.faltando ? ' is-falta' : e.sobrando ? ' is-sobra' : ''}`}
                data-rotulo={e.sobrando ? 'Sobrando' : 'Faltando'}>
                {e.sobrando ? `+${e.sobrando}` : e.faltando || '—'}
              </span>
              <span className="inv-c-ir" aria-hidden="true"><Icone nome="chevron" /></span>
            </button>
          ))}
        </div>
      )}
      {linhas.length > limite && (
        <button type="button" className="mq-btn mq-btn--ghost mq-btn--block" onClick={() => setLimite((n) => n + 200)}>
          Mostrar mais {Math.min(200, linhas.length - limite)} de {linhas.length - limite}
        </button>
      )}
    </section>
  );
}
