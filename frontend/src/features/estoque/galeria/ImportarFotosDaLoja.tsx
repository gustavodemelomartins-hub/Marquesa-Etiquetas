import { useEffect, useRef, useState } from 'react';
import type { Connection } from '../../../services/client';
import { Icone } from '../../../components/Icone';
import { miniaturaDaFoto } from '../../../domain/foto';
import { analisarLoja, importarLote, type Analise, type GrupoParaRevisar } from './api';

interface Props {
  conexao: Connection;
  aoFechar: () => void;
  /** A importação mudou fotos: quem mostra a lista relê o estado. */
  aoTerminar: () => void;
  aoAbrirPeca: (sku: string) => void;
}

/** Fotos por chamada. Cada foto são duas buscas na CDN (original e
 *  miniatura); 12 deixa folga para o teto de subrequisições do Worker. */
const LOTE = 12;

type Fase =
  | { f: 'lendo' }
  | { f: 'erro'; msg: string }
  | { f: 'pronto'; a: Analise }
  | { f: 'importando'; a: Analise; feitas: number; falhas: Falha[]; parar: boolean }
  | { f: 'fim'; a: Analise; feitas: number; falhas: Falha[]; interrompida: boolean };

interface Falha { imagemId: string; sku: string; motivo: string }

const n = (v: number | undefined) => (v ?? 0).toLocaleString('pt-BR');

/** IMPORTAR FOTOS DA NUVEMSHOP — a migração do catálogo inteiro para o R2.
 *
 *  Primeiro LÊ (a análise é o dry-run: nada é baixado nem vinculado) e
 *  mostra as contas — quantos anúncios casaram, quantos não, quantas fotos
 *  são novas e quais precisam de uma pessoa. Só então, com um toque,
 *  importa, em lotes curtos, com a barra andando. Parar no meio não perde
 *  nada: o que entrou, entrou; rodar de novo continua de onde parou. */
export function ImportarFotosDaLoja({ conexao, aoFechar, aoTerminar, aoAbrirPeca }: Props) {
  const [fase, setFase] = useState<Fase>({ f: 'lendo' });
  const parar = useRef(false);
  const importou = useRef(false);

  async function ler() {
    setFase({ f: 'lendo' });
    try {
      const a = await analisarLoja(conexao);
      if (!a.ok) setFase({ f: 'erro', msg: a.erro || 'A loja online não respondeu.' });
      else setFase({ f: 'pronto', a });
    } catch (e) {
      setFase({ f: 'erro', msg: e instanceof Error ? e.message : 'A loja online não respondeu.' });
    }
  }

  useEffect(() => { void ler(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape' && fase.f !== 'importando') fechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  });

  function fechar() {
    if (importou.current) aoTerminar();
    aoFechar();
  }

  async function importar(a: Analise, repetirFalhas = false, falhasAntes: Falha[] = []) {
    parar.current = false;
    const ignorar: string[] = repetirFalhas ? [] : falhasAntes.map((f) => f.imagemId);
    const falhas: Falha[] = repetirFalhas ? [] : [...falhasAntes];
    let feitas = 0;
    setFase({ f: 'importando', a, feitas, falhas, parar: false });
    let interrompida = false;
    try {
      for (let volta = 0; volta < 1000; volta++) {
        if (parar.current) { interrompida = true; break; }
        const r = await importarLote(conexao, LOTE, ignorar);
        if (!r.ok) throw new Error(r.erro || 'A importação parou.');
        feitas += r.importadas;
        if (r.importadas) importou.current = true;
        for (const f of r.falhas) { ignorar.push(f.imagemId); falhas.push(f); }
        setFase({ f: 'importando', a, feitas, falhas: [...falhas], parar: parar.current });
        /* Um lote inteiro sem nenhuma foto gravada e com o MESMO motivo em
           todas é infraestrutura (armazenamento fora), não foto ruim:
           parar e dizer, em vez de girar mil vezes. */
        const motivos = new Set(r.falhas.map((f) => f.motivo));
        if (r.importadas === 0 && r.falhas.length > 1 && motivos.size === 1 && /armazenamento|R2/i.test([...motivos][0] ?? '')) {
          interrompida = true;
          break;
        }
        if (!r.restantes) break;
      }
    } catch (e) {
      falhas.push({ imagemId: '—', sku: '—', motivo: e instanceof Error ? e.message : 'A importação parou.' });
      interrompida = true;
    }
    setFase({ f: 'fim', a, feitas, falhas, interrompida });
  }

  const a = fase.f === 'lendo' || fase.f === 'erro' ? null : fase.a;
  const s = a?.resumo;
  const alvo = s?.fotosNovas ?? 0;
  const feitas = fase.f === 'importando' || fase.f === 'fim' ? fase.feitas : 0;
  const falhas = fase.f === 'importando' || fase.f === 'fim' ? fase.falhas : [];
  const pct = alvo ? Math.min(100, Math.round(((feitas + falhas.length) / alvo) * 100)) : 0;

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={() => { if (fase.f !== 'importando') fechar(); }} />
      <div className="mq-modal mq-modal--wide mq-importacao" role="dialog" aria-modal="true" aria-label="Importar fotos da Nuvemshop">
        <div className="mq-modal__head">
          <div>
            <p className="mq-eyebrow">Peças · fotos</p>
            <h2 className="mq-title">Importar fotos da Nuvemshop</h2>
            <p className="mq-hint">
              Traz TODAS as fotos de cada anúncio da loja online para a galeria da peça certa,
              na ordem da loja. Nada muda na loja, e o estoque não é tocado.
            </p>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" disabled={fase.f === 'importando'} onClick={fechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-modal__body">
          {fase.f === 'lendo' && (
            <div className="mq-importacao__lendo" role="status">
              <span className="mq-importacao__giro" aria-hidden="true" />
              <p><b>Lendo o catálogo da loja online…</b><br />Isto só lê: nenhuma foto é baixada ainda.</p>
            </div>
          )}

          {fase.f === 'erro' && (
            <p className="mq-note mq-note--risk" role="alert">
              <Icone nome="alert" />
              <span>{fase.msg}</span>
            </p>
          )}

          {s && (
            <>
              <div className="mq-importacao__numeros">
                <Numero rotulo="Anúncios na loja" valor={s.anunciosNaLoja} nota={s.anunciosSemFoto ? `${n(s.anunciosSemFoto)} sem foto` : undefined} />
                <Numero rotulo="Com correspondência" valor={s.anunciosComCorrespondencia} tom="ok" />
                <Numero rotulo="Sem correspondência" valor={s.anunciosSemCorrespondencia} />
                <Numero rotulo="Precisa revisar" valor={s.anunciosParaRevisar} tom={s.anunciosParaRevisar ? 'warn' : undefined} />
              </div>
              <div className="mq-importacao__numeros">
                <Numero rotulo="Fotos encontradas" valor={s.fotosEncontradas} />
                <Numero rotulo="Já no sistema" valor={s.fotosJaNoR2} nota={s.fotosRemovidasAqui ? `+${n(s.fotosRemovidasAqui)} removidas por você` : undefined} />
                <Numero rotulo="Novas" valor={s.fotosNovas} tom="brand" nota={s.pecasComFotoNova ? `para ${n(s.pecasComFotoNova)} peças` : undefined} />
                <Numero rotulo="Falharam" valor={falhas.length} tom={falhas.length ? 'risk' : undefined} />
              </div>

              {(fase.f === 'importando' || fase.f === 'fim') && (
                <div className="mq-importacao__progresso" role="status" aria-live="polite">
                  <span className="mq-meter" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                  <p>
                    <b>{pct}%</b> · {n(feitas)} de {n(alvo)} fotos importadas
                    {falhas.length ? ` · ${n(falhas.length)} falharam` : ''}
                    {fase.f === 'importando' && (fase.parar ? ' · parando depois deste lote…' : '')}
                  </p>
                </div>
              )}

              {fase.f === 'fim' && (
                <p className={`mq-note ${fase.falhas.length || fase.interrompida ? 'mq-note--warn' : 'mq-note--ok'}`} role="status">
                  <Icone nome={fase.falhas.length || fase.interrompida ? 'alert' : 'check'} />
                  <span>
                    {fase.interrompida ? 'Importação interrompida. ' : 'Importação concluída. '}
                    {n(fase.feitas)} {fase.feitas === 1 ? 'foto entrou' : 'fotos entraram'} nas galerias.
                    {fase.falhas.length ? ` ${n(fase.falhas.length)} não — o motivo de cada uma está abaixo.` : ''}
                    {fase.interrompida ? ' Importar de novo continua de onde parou, sem duplicar.' : ''}
                  </span>
                </p>
              )}

              {falhas.length > 0 && (
                <details className="mq-importacao__lista" open={fase.f === 'fim'}>
                  <summary>Fotos que falharam ({n(falhas.length)})</summary>
                  <ul>
                    {falhas.slice(0, 100).map((f, i) => (
                      <li key={`${f.imagemId}-${i}`}>
                        {f.sku !== '—'
                          ? <button type="button" className="mq-btn mq-btn--link mq-btn--sm" onClick={() => aoAbrirPeca(f.sku)}>{f.sku}</button>
                          : null}
                        <span>{f.motivo}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {a.revisar.length > 0 && (
                <details className="mq-importacao__lista">
                  <summary>Precisa revisar ({n(a.revisar.length)} {a.revisar.length === 1 ? 'anúncio' : 'anúncios'}, {n(s.fotosParaRevisar)} {s.fotosParaRevisar === 1 ? 'foto' : 'fotos'}) — nenhuma foto foi vinculada</summary>
                  <GruposDaLoja grupos={a.revisar} aoAbrirPeca={aoAbrirPeca} />
                </details>
              )}
              {a.semPeca.length > 0 && (
                <details className="mq-importacao__lista">
                  <summary>Sem correspondência ({n(a.semPeca.length)} {a.semPeca.length === 1 ? 'anúncio' : 'anúncios'}) — o código da loja não existe aqui</summary>
                  <GruposDaLoja grupos={a.semPeca} aoAbrirPeca={aoAbrirPeca} />
                </details>
              )}
            </>
          )}
        </div>

        <div className="mq-modal__foot">
          {fase.f === 'erro' && <button type="button" className="mq-btn mq-btn--secondary" onClick={ler}>Tentar de novo</button>}
          {fase.f === 'pronto' && (
            <>
              <button type="button" className="mq-btn mq-btn--ghost" onClick={fechar}>Agora não</button>
              {alvo > 0
                ? <button type="button" className="mq-btn mq-btn--primary" onClick={() => importar(fase.a)}>
                    <Icone nome="cloud" /> Iniciar importação de {n(alvo)} {alvo === 1 ? 'foto' : 'fotos'}
                  </button>
                : <button type="button" className="mq-btn mq-btn--primary" onClick={fechar}>Nada novo para importar</button>}
            </>
          )}
          {fase.f === 'importando' && (
            <button type="button" className="mq-btn mq-btn--secondary" disabled={fase.parar}
              onClick={() => { parar.current = true; setFase({ ...fase, parar: true }); }}>
              Pausar
            </button>
          )}
          {fase.f === 'fim' && (
            <>
              {fase.falhas.some((f) => f.imagemId !== '—') && (
                <button type="button" className="mq-btn mq-btn--secondary" onClick={() => importar(fase.a, true)}>
                  Tentar de novo as que falharam
                </button>
              )}
              {fase.interrompida && (
                <button type="button" className="mq-btn mq-btn--secondary" onClick={() => importar(fase.a, false, fase.falhas)}>
                  Continuar
                </button>
              )}
              <button type="button" className="mq-btn mq-btn--primary" onClick={fechar}>Ver as peças</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Numero({ rotulo, valor, nota, tom }: { rotulo: string; valor: number | undefined; nota?: string; tom?: 'ok' | 'warn' | 'risk' | 'brand' }) {
  return (
    <div className={`mq-importacao__numero${tom ? ` mq-importacao__numero--${tom}` : ''}`}>
      <span>{rotulo}</span>
      <b>{n(valor)}</b>
      {nota && <small>{nota}</small>}
    </div>
  );
}

function GruposDaLoja({ grupos, aoAbrirPeca }: { grupos: GrupoParaRevisar[]; aoAbrirPeca: (sku: string) => void }) {
  return (
    <ul className="mq-importacao__grupos">
      {grupos.slice(0, 150).map((g) => (
        <li key={g.produtoId}>
          <img src={miniaturaDaFoto(g.foto) ?? g.foto} alt="" />
          <div>
            <b>{g.produtoNome || `Anúncio ${g.produtoId}`}</b>
            <small>
              {g.imagens} {g.imagens === 1 ? 'foto' : 'fotos'}
              {g.codigosNaLoja.length ? ` · na loja: ${g.codigosNaLoja.join(', ')}` : ' · sem código na loja'}
            </small>
            <span>{g.motivo}</span>
            {g.candidatos.some((c) => c.existe) && (
              <span className="mq-importacao__candidatos">
                Possíveis peças:{' '}
                {g.candidatos.filter((c) => c.existe).map((c) => (
                  <button key={c.sku} type="button" className="mq-btn mq-btn--link mq-btn--sm" onClick={() => aoAbrirPeca(c.sku)}>
                    {c.sku}{c.desc ? ` — ${c.desc}` : ''}
                  </button>
                ))}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
