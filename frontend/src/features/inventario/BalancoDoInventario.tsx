import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { plural } from '../../domain/formato';

const fmtInt = (n: number) => Number(n || 0).toLocaleString('pt-BR');
import { motivosDaLinha, type MotivoDeDiferenca } from './resultado';

/** Uma linha de diferença do balanço (o mesmo formato do resultado). */
export interface LinhaDoBalanco {
  sku: string;
  desc: string;
  cat: string | null;
  contado: number;
  esperado: number;
  dif: number;
  aviso: string | null;
  precisaVariacao?: boolean;
  variacoes?: { nome: string; contado: number | null; esperado: number | null }[];
  naoInformada?: { contado: number | null } | null;
  distribuicaoContada?: { nome: string; varianteId: string | null; qtd: number }[] | null;
}

interface Balanco {
  numero: number;
  totais: {
    codigosEsperados: number; pecasEsperadas: number;
    codigosConferidos: number; pecasConferidas: number;
    naoConferidos: number; pecasNaoConferidas: number;
  };
  impacto: {
    reduzem: number; pecasAMenos: number; aumentam: number; pecasAMais: number;
    precisamVariacao: number; naoConferidos: number;
  };
  faltando: LinhaDoBalanco[];
  sobrando: LinhaDoBalanco[];
  naoConferido: { sku: string; desc: string; cat: string | null; esperado: number }[];
  conferidosItens: (LinhaDoBalanco & { variacoesDivergem?: boolean })[];
  motivos: MotivoDeDiferenca[];
}

interface Props {
  conexao: Connection;
  id: number;
  /** Espera as leituras a caminho chegarem ao servidor. */
  esperarLeituras: () => Promise<unknown>;
  leiturasNaoSalvas: number;
  aoContinuar: () => void;
  aoAbrirPeca: (sku: string) => void;
  aoFinalizado: (resumo: string) => void;
}

const PADRAO = 'contagem_fisica';
/** Diferenças por requisição ao aplicar (teto de 50 chamadas ao D1 no plano Free). */
export const LOTE_DE_AJUSTES = 20;
const chave = (l: { sku: string }) => l.sku;
const variacoesEmTexto = (l: LinhaDoBalanco) => [
  ...(l.variacoes ?? []).filter((v) => (v.contado ?? 0) > 0).map((v) => `${v.nome} ${v.contado}`),
  ...((l.naoInformada?.contado ?? 0) > 0 ? [`sem variação ${l.naoInformada!.contado}`] : []),
].join(' · ');

/** O BALANÇO FINAL — antes de qualquer ajuste, o que vai acontecer.
 *
 *  É a pergunta dela: "no final aparece quais peças não foram passadas?"
 *  Aparece — e também o que faltou, o que sobrou e o que bateu, cada grupo
 *  com a lista de peças, e cada peça tocável para voltar e conferir.
 *
 *  Finalizar NÃO é cego: a tela diz quantas peças terão o estoque reduzido,
 *  quantas aumentado, e que as não conferidas ficam como estão. Nenhuma
 *  diferença vira perda sozinha: o motivo padrão é "Contagem física" (ajuste
 *  de inventário); perda só se ela escolher. */
export function BalancoDoInventario({
  conexao, id, esperarLeituras, leiturasNaoSalvas, aoContinuar, aoAbrirPeca, aoFinalizado,
}: Props) {
  const b = useApi((s) => chamar<Balanco>(conexao, 'GET', `/api/inventarios/${id}/balanco`, undefined, { signal: s }), [conexao, id]);
  const [motivos, setMotivos] = useState<Map<string, { id: string; texto: string }>>(new Map());
  const [destinos, setDestinos] = useState<Map<string, string>>(new Map());
  const [semGuardar, setSemGuardar] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  const d = b.dados;
  const diferencas = useMemo(() => (d ? [...d.faltando, ...d.sobrando] : []), [d]);
  const paraGuardar = useMemo(() => (d
    ? [...d.faltando, ...d.sobrando, ...d.conferidosItens].filter((l) => l.distribuicaoContada?.length)
    : []), [d]);

  if (b.erro) return <div className="mq-card__body"><ErrorState erro={b.erro} aoTentarDeNovo={b.recarregar} /></div>;
  if (!d) return <div className="mq-card__body"><p className="mq-hint">Calculando o balanço…</p></div>;

  const motivoDe = (l: LinhaDoBalanco) => motivos.get(chave(l)) ?? { id: PADRAO, texto: '' };
  const rotuloDe = (l: LinhaDoBalanco) => {
    const m = motivoDe(l);
    if (m.id === 'outro') return m.texto.trim();
    return d.motivos.find((x) => x.id === m.id)?.rotulo ?? '';
  };
  const pendentesDeVariacao = diferencas.filter((l) => l.precisaVariacao && !destinos.get(chave(l)));
  const semMotivo = diferencas.filter((l) => !rotuloDe(l));
  const perdas = diferencas.filter((l) => d.motivos.find((m) => m.id === motivoDe(l).id)?.classe === 'perda').length;

  async function finalizar() {
    if (!d) return;
    setOcupado(true);
    setErro('');
    try {
      await esperarLeituras();
      await chamar(conexao, 'POST', `/api/inventarios/${id}/concluir`, {});

      /* As diferenças, com o motivo de cada uma. A que pede variação e não
         a recebeu fica pendente — na revisão, depois. Uma recusa do servidor
         para UMA peça não pode impedir as outras: ela sai do lote e o resto
         vai de novo. */
      const todos = diferencas
        .filter((l) => !(l.precisaVariacao && !destinos.get(chave(l))))
        .map((l) => ({
          sku: l.sku, motivo: rotuloDe(l), motivoId: motivoDe(l).id,
          ...(l.precisaVariacao ? { destino: destinos.get(chave(l)) === '__nao_informada__' ? '' : destinos.get(chave(l)) } : {}),
        }));
      const recusadas: string[] = [];
      /* Em lotes (08/10/2026, §60): cada diferença é uma chamada ao banco,
         e o plano gratuito da Cloudflare recusa a requisição que passa de
         50. Cada peça é aplicada uma vez só no servidor (repetir é
         recusado), então dividir não muda o resultado. */
      for (let i = 0; i < todos.length; i += LOTE_DE_AJUSTES) {
        let itens = todos.slice(i, i + LOTE_DE_AJUSTES);
        for (let tentativa = 0; itens.length && tentativa < 10; tentativa += 1) {
          try {
            await chamar(conexao, 'POST', `/api/inventarios/${id}/aplicar`, { itens });
            break;
          } catch (e) {
            const corpo = (e as { corpo?: { sku?: string } }).corpo;
            const sku = corpo?.sku;
            if (!sku || !itens.some((x) => x.sku === sku)) throw e;
            recusadas.push(`${sku}: ${(e as Error).message}`);
            itens = itens.filter((x) => x.sku !== sku);
          }
        }
      }

      const guardadas: string[] = [];
      for (const l of paraGuardar) {
        if (semGuardar.has(chave(l))) continue;
        try {
          await chamar(conexao, 'POST', `/api/inventarios/${id}/variacoes/guardar`, { sku: l.sku });
          guardadas.push(l.sku);
        } catch (e) {
          recusadas.push(`${l.sku}: ${(e as Error).message}`);
        }
      }

      const partes = [
        `Inventário #${d.numero} finalizado.`,
        d.impacto.reduzem ? `${d.impacto.reduzem} ${plural(d.impacto.reduzem, 'peça teve', 'peças tiveram')} o estoque reduzido.` : '',
        d.impacto.aumentam ? `${d.impacto.aumentam} ${plural(d.impacto.aumentam, 'peça teve', 'peças tiveram')} o estoque aumentado.` : '',
        guardadas.length ? `Variações guardadas em ${guardadas.length} ${plural(guardadas.length, 'peça', 'peças')}.` : '',
        d.impacto.naoConferidos ? `${d.impacto.naoConferidos} não ${plural(d.impacto.naoConferidos, 'conferida ficou', 'conferidas ficaram')} como estava.` : '',
        recusadas.length ? `Ficaram para resolver na revisão: ${recusadas.join(' · ')}` : '',
      ].filter(Boolean);
      aoFinalizado(partes.join(' '));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui finalizar.');
      setConfirmando(false);
    } finally {
      setOcupado(false);
    }
  }

  const t = d.totais;
  const im = d.impacto;
  const certos = d.conferidosItens.length;

  return (
    <div className="mq-card__body mq-stack balanco">
      <header className="balanco__topo">
        <p className="mq-eyebrow">Antes de finalizar</p>
        <h2 className="mq-title">Balanço do inventário #{d.numero}</h2>
      </header>

      <dl className="balanco__numeros" aria-label="Balanço">
        <div><dt>Unidades esperadas em casa</dt><dd>{fmtInt(t.pecasEsperadas)}</dd></div>
        <div className="is-ok"><dt>Unidades conferidas</dt><dd>{fmtInt(t.pecasConferidas)}</dd></div>
        <div className={t.naoConferidos ? 'is-atencao' : ''}><dt>Peças não conferidas</dt><dd>{fmtInt(t.naoConferidos)}</dd></div>
        <div className={im.reduzem ? 'is-falta' : ''}><dt>Peças com falta</dt><dd>{fmtInt(im.reduzem)}</dd></div>
        <div className={im.aumentam ? 'is-sobra' : ''}><dt>Peças com sobra</dt><dd>{fmtInt(im.aumentam)}</dd></div>
      </dl>

      <section className="balanco__impacto" aria-label="O que vai acontecer">
        <h3 className="mq-subtitle">Ao finalizar</h3>
        <ul>
          <li>{im.reduzem
            ? <><b>{im.reduzem} {plural(im.reduzem, 'peça terá', 'peças terão')} o estoque reduzido</b> (−{im.pecasAMenos} {plural(im.pecasAMenos, 'unidade', 'unidades')})</>
            : 'Nenhuma peça terá o estoque reduzido.'}</li>
          <li>{im.aumentam
            ? <><b>{im.aumentam} {plural(im.aumentam, 'peça terá', 'peças terão')} o estoque aumentado</b> (+{im.pecasAMais} {plural(im.pecasAMais, 'unidade', 'unidades')})</>
            : 'Nenhuma peça terá o estoque aumentado.'}</li>
          {im.naoConferidos > 0 && (
            <li><b>{im.naoConferidos} {plural(im.naoConferidos, 'peça não conferida continua', 'peças não conferidas continuam')} como está</b> — não conferida não vira falta.</li>
          )}
          {pendentesDeVariacao.length > 0 && (
            <li><b>{pendentesDeVariacao.length} {plural(pendentesDeVariacao.length, 'peça precisa', 'peças precisam')} que você diga a variação</b> — sem isso, fica para resolver depois.</li>
          )}
          <li>{perdas
            ? <>{perdas} {plural(perdas, 'diferença marcada', 'diferenças marcadas')} como perda.</>
            : 'Nenhuma diferença vira perda: tudo entra como ajuste de inventário.'}</li>
        </ul>
      </section>

      {leiturasNaoSalvas > 0 && (
        <p className="mq-note mq-note--warn">
          <Icone nome="alert" />
          <span>{leiturasNaoSalvas} {plural(leiturasNaoSalvas, 'leitura ainda não chegou', 'leituras ainda não chegaram')} ao sistema. Volte à conferência e toque em "Tentar de novo" antes de finalizar.</span>
        </p>
      )}
      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

      <Grupo titulo="Faltando" icone="↓" tom="falta" n={d.faltando.length} aberto>
        {d.faltando.map((l) => (
          <LinhaComDecisao key={l.sku} l={l} motivos={d.motivos} motivo={motivoDe(l)}
            destino={destinos.get(chave(l)) ?? ''}
            aoMotivo={(m) => setMotivos((x) => new Map(x).set(chave(l), m))}
            aoDestino={(v) => setDestinos((x) => new Map(x).set(chave(l), v))}
            aoAbrir={() => aoAbrirPeca(l.sku)} />
        ))}
      </Grupo>

      <Grupo titulo="Sobrando" icone="↑" tom="sobra" n={d.sobrando.length} aberto>
        {d.sobrando.map((l) => (
          <LinhaComDecisao key={l.sku} l={l} motivos={d.motivos} motivo={motivoDe(l)}
            destino={destinos.get(chave(l)) ?? ''}
            aoMotivo={(m) => setMotivos((x) => new Map(x).set(chave(l), m))}
            aoDestino={(v) => setDestinos((x) => new Map(x).set(chave(l), v))}
            aoAbrir={() => aoAbrirPeca(l.sku)} />
        ))}
      </Grupo>

      <Grupo titulo="Não conferidas" icone="!" tom="atencao" n={d.naoConferido.length} aberto={d.naoConferido.length > 0 && d.naoConferido.length <= 30}>
        <p className="mq-hint">Toque numa peça para conferir agora. As que ficarem aqui não mudam o estoque.</p>
        <ul className="balanco__lista">
          {d.naoConferido.map((l) => (
            <li key={l.sku}>
              <button type="button" className="balanco__peca" onClick={() => aoAbrirPeca(l.sku)}>
                <span><b>{l.desc}</b><small>Código {l.sku}</small></span>
                <span className="balanco__q"><small>Esperado</small><b>{l.esperado}</b></span>
                <span className="balanco__q"><small>Conferido</small><b>0</b></span>
              </button>
            </li>
          ))}
        </ul>
      </Grupo>

      <Grupo titulo="Tudo certo" icone="✓" tom="ok" n={certos}>
        <ul className="balanco__lista">
          {d.conferidosItens.map((l) => (
            <li key={l.sku}>
              <button type="button" className="balanco__peca" onClick={() => aoAbrirPeca(l.sku)}>
                <span><b>{l.desc}</b><small>Código {l.sku}{variacoesEmTexto(l) ? ` · ${variacoesEmTexto(l)}` : ''}</small></span>
                <span className="balanco__q"><small>Conferido</small><b>{l.contado}</b></span>
              </button>
            </li>
          ))}
        </ul>
      </Grupo>

      {paraGuardar.length > 0 && (
        <Grupo titulo="Variações contadas" icone="#" tom="info" n={paraGuardar.length} aberto>
          <p className="mq-hint">
            O que você contou em cada variação passa a ser o cadastro da peça. O que
            ninguém disse — inclusive a peça com revendedora sem variação conhecida —
            fica como "variação não informada". O total não muda.
          </p>
          <ul className="balanco__lista">
            {paraGuardar.map((l) => (
              <li key={l.sku}>
                <label className="balanco__guardar">
                  <input type="checkbox" checked={!semGuardar.has(chave(l))}
                    onChange={() => setSemGuardar((s) => { const n = new Set(s); if (n.has(chave(l))) n.delete(chave(l)); else n.add(chave(l)); return n; })} />
                  <span>
                    <b>{l.desc}</b>
                    <small>Guardar: {variacoesEmTexto(l)}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Grupo>
      )}

      <div className="balanco__acoes">
        <button type="button" className="mq-btn mq-btn--ghost" onClick={aoContinuar}>
          Continuar conferindo
        </button>
        <button type="button" className="mq-btn mq-btn--primary"
          disabled={ocupado || leiturasNaoSalvas > 0 || semMotivo.length > 0}
          onClick={() => setConfirmando(true)}>
          Finalizar inventário
        </button>
      </div>
      {semMotivo.length > 0 && (
        <p className="mq-hint">Escreva o motivo de {semMotivo.map((l) => l.sku).join(', ')} (você escolheu "Outro").</p>
      )}

      {confirmando && (
        <>
          <button type="button" className="mq-scrim" aria-label="Voltar" onClick={() => setConfirmando(false)} />
          <div className="mq-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-finalizar">
            <div className="mq-modal__head">
              <h2 className="mq-title" id="titulo-finalizar">Finalizar o inventário #{d.numero}?</h2>
            </div>
            <div className="mq-modal__body mq-stack">
              <ul className="balanco__confirma">
                <li>{im.reduzem} {plural(im.reduzem, 'peça terá', 'peças terão')} o estoque reduzido (−{im.pecasAMenos}).</li>
                <li>{im.aumentam} {plural(im.aumentam, 'peça terá', 'peças terão')} o estoque aumentado (+{im.pecasAMais}).</li>
                <li>{im.naoConferidos} não {plural(im.naoConferidos, 'conferida fica', 'conferidas ficam')} como está.</li>
                {pendentesDeVariacao.length > 0 && (
                  <li>{pendentesDeVariacao.length} {plural(pendentesDeVariacao.length, 'fica', 'ficam')} para resolver depois (falta dizer a variação).</li>
                )}
              </ul>
              <p className="mq-hint">Cada ajuste fica no histórico da peça, com o que você contou e o motivo. Nada é apagado.</p>
            </div>
            <div className="mq-modal__foot mq-btns">
              <button type="button" className="mq-btn mq-btn--ghost" disabled={ocupado} onClick={() => setConfirmando(false)}>
                Voltar
              </button>
              <button type="button" className="mq-btn mq-btn--primary" disabled={ocupado} onClick={finalizar}>
                {ocupado ? 'Finalizando…' : 'Finalizar e ajustar o estoque'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Grupo({
  titulo, icone, tom, n, aberto = false, children,
}: { titulo: string; icone: string; tom: string; n: number; aberto?: boolean; children: React.ReactNode }) {
  return (
    <details className={`balanco__grupo is-${tom}`} open={aberto && n > 0}>
      <summary>
        <span className="balanco__icone" aria-hidden="true">{icone}</span>
        <b>{titulo}</b>
        <span className="balanco__n">{n}</span>
      </summary>
      {n > 0 ? children : <p className="mq-hint">Nenhuma.</p>}
    </details>
  );
}

function LinhaComDecisao({
  l, motivos, motivo, destino, aoMotivo, aoDestino, aoAbrir,
}: {
  l: LinhaDoBalanco; motivos: MotivoDeDiferenca[];
  motivo: { id: string; texto: string }; destino: string;
  aoMotivo: (m: { id: string; texto: string }) => void;
  aoDestino: (v: string) => void;
  aoAbrir: () => void;
}) {
  const oferecidos = motivosDaLinha(motivos, l.dif);
  const classe = motivos.find((m) => m.id === motivo.id)?.classe;
  const detalhe = variacoesEmTexto(l);
  return (
    <div className={`balanco__dif${l.dif < 0 ? ' is-falta' : ' is-sobra'}`}>
      <button type="button" className="balanco__peca" onClick={aoAbrir}>
        <span><b>{l.desc}</b><small>Código {l.sku}{detalhe ? ` · ${detalhe}` : ''}</small></span>
        <span className="balanco__q"><small>Em casa</small><b>{l.esperado}</b></span>
        <span className="balanco__q"><small>Conferido</small><b>{l.contado}</b></span>
        <span className="balanco__q is-dif"><small>{l.dif < 0 ? 'Faltando' : 'Sobrando'}</small><b>{Math.abs(l.dif)}</b></span>
      </button>
      {l.aviso && <p className="mq-hint balanco__aviso"><Icone nome="alert" /> {l.aviso}</p>}
      <div className="balanco__decisao">
        <label className="mq-field">
          <span>Motivo</span>
          <select className="mq-select" value={motivo.id} aria-label={`Motivo de ${l.desc}`}
            onChange={(e) => aoMotivo({ id: e.target.value, texto: motivo.texto })}>
            {oferecidos.map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
          </select>
          <small className="mq-hint">{classe === 'perda' ? 'Vira perda (entra em Saiu sem faturar).' : 'Ajuste de inventário — não é perda.'}</small>
        </label>
        {motivo.id === 'outro' && (
          <label className="mq-field">
            <span>Qual?</span>
            <input className="mq-input" maxLength={60} value={motivo.texto}
              onChange={(e) => aoMotivo({ id: 'outro', texto: e.target.value })} />
          </label>
        )}
        {l.precisaVariacao && (
          <label className="mq-field">
            <span>De qual variação é a {l.dif < 0 ? 'falta' : 'sobra'}?</span>
            <select className="mq-select" value={destino} aria-label={`Variação da diferença de ${l.desc}`}
              onChange={(e) => aoDestino(e.target.value)}>
              <option value="">Não sei agora (resolver depois)</option>
              {(l.variacoes ?? []).map((v) => <option key={v.nome} value={v.nome}>{v.nome}</option>)}
              <option value="__nao_informada__">Variação não informada</option>
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
