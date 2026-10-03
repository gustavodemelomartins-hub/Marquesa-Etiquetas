import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { plural } from '../../domain/formato';
import {
  estadoDe, pecasFaltandoEm, type Conferida, type ResumoDaConferencia,
} from './conferencia';

/** O que a estação sabe de uma referência do catálogo. */
export interface ReferenciaDaEstacao {
  sku: string;
  desc: string;
  esperado: number;
  total: number;
  consignado: number;
  revendedoras?: { nome: string; qtd: number; maletaId?: number }[];
  variacoes?: { nome: string; varianteId: string | null; esperado: number | null }[];
  variacaoComIdentidade?: boolean;
}

export interface LeituraRecente {
  id: number;
  sku: string | null;
  texto: string;
  tom: 'ok' | 'neutro' | 'erro';
}

export interface EstacaoHandle { focar: () => void }

interface Props {
  pausado: boolean;
  /** A lista do que se espera em casa já chegou. Antes dela um bipe não
   *  teria contra o que conferir — e viraria "fora da lista" em silêncio. */
  pronto: boolean;
  feedback: { texto: string; tom: 'ok' | 'neutro' | 'erro' } | null;
  /** A última referência lida, com as linhas dela nesta sessão. */
  ultima: { ref: ReferenciaDaEstacao; variacao: string; linhas: Conferida[] } | null;
  recentes: LeituraRecente[];
  resumo: ResumoDaConferencia;
  aoLer: (texto: string) => void;
  aoInformarFalta: (variacao: string, n: number) => void;
  aoInformarEncontradas: (variacao: string, n: number) => void;
  aoEscolherVariacao: (variacao: string) => void;
  aoCriarVariacao: (valor: string) => Promise<boolean>;
  aoTentarDeNovo: () => void;
}

/** A ESTAÇÃO DE LEITURA — o leitor primeiro, todo o resto em volta dele.
 *
 *  O que ela garante, e é por isso que a Sthefany consegue bipar no ritmo
 *  do Excel:
 *
 *   · o campo do leitor LIMPA sozinho a cada leitura e NUNCA perde o foco
 *     por causa da tela. No QA de 02/10 o campo guardava "263571", o bipe
 *     seguinte virava "263571421089" e ela tinha de apagar à mão;
 *   · uma tecla digitada com o foco "solto" (depois de clicar num botão) é
 *     devolvida ao leitor — o leitor de código de barras é um teclado, e um
 *     bipe que cai fora do campo é uma peça que não foi conferida;
 *   · nada bloqueia a próxima leitura: a gravação acontece por trás, numa
 *     fila com retentativa, e quem está de pé só vê o resultado;
 *   · não há modal, botão de salvar nem quantidade a digitar no caminho
 *     feliz. Falta é a exceção: o campo Faltando, ou "2 + Enter" no próprio
 *     leitor. */
export const EstacaoDeLeitura = forwardRef<EstacaoHandle, Props>(function EstacaoDeLeitura({
  pausado, pronto, feedback, ultima, recentes, resumo,
  aoLer, aoInformarFalta, aoInformarEncontradas, aoEscolherVariacao, aoCriarVariacao, aoTentarDeNovo,
}, ref) {
  const leitor = useRef<HTMLInputElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const bloqueado = pausado || !pronto;
  const focar = () => { if (!bloqueado) leitor.current?.focus(); };
  useImperativeHandle(ref, () => ({ focar }));

  useEffect(() => { focar(); }, [bloqueado]); // eslint-disable-line react-hooks/exhaustive-deps

  /* A tecla que cai fora de qualquer campo volta para o leitor. Sem isto,
     um bipe logo depois de clicar em "Variações" se perderia inteiro. */
  useEffect(() => {
    if (bloqueado) return undefined;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const alvo = document.activeElement;
      const campo = alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement
        || alvo instanceof HTMLSelectElement;
      if (campo) return;
      if (document.querySelector('[role="dialog"]')) return;
      const el = leitor.current;
      if (!el) return;
      e.preventDefault();
      el.focus();
      el.value += e.key;
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [bloqueado]);

  function ler() {
    const el = leitor.current;
    if (!el) return;
    const texto = el.value;
    el.value = '';
    aoLer(texto);
    el.focus();
  }

  return (
    <div className="estacao" ref={raiz}>
      <div className="estacao__leitor">
        <label className="estacao__campo">
          <Icone nome="search" />
          <input
            ref={leitor}
            className="mq-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            aria-label="Bipar peça"
            placeholder={pausado ? 'Inventário pausado' : pronto ? 'Bipe a peça' : 'Carregando o inventário…'}
            disabled={bloqueado}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || (e.key === 'Tab' && e.currentTarget.value.trim())) {
                e.preventDefault();
                ler();
              }
            }}
          />
        </label>
        <p className={`estacao__feedback estacao__feedback--${feedback?.tom ?? 'neutro'}`} role="status" aria-live="polite">
          {feedback?.texto ?? 'Bipe uma peça. Se faltar, digite só quanto falta.'}
        </p>
      </div>

      {ultima && (
        <UltimaPeca
          key={`${ultima.ref.sku}|${ultima.variacao}`}
          ultima={ultima}
          pausado={pausado}
          voltar={focar}
          aoInformarFalta={aoInformarFalta}
          aoInformarEncontradas={aoInformarEncontradas}
          aoEscolherVariacao={aoEscolherVariacao}
          aoCriarVariacao={aoCriarVariacao}
        />
      )}

      <dl className="estacao__resumo" aria-label="Resumo da conferência">
        <div className="is-ok"><dt>Conferidos</dt><dd>{resumo.conferidos}</dd></div>
        <div className={resumo.comFalta ? 'is-risk' : ''}>
          <dt>Com falta</dt>
          <dd>{resumo.comFalta}{resumo.pecasFaltando ? <small> · {resumo.pecasFaltando} {plural(resumo.pecasFaltando, 'peça', 'peças')}</small> : null}</dd>
        </div>
        {resumo.sobrando > 0 && <div className="is-brand"><dt>Sobrando</dt><dd>{resumo.sobrando}</dd></div>}
        <div><dt>Pendentes</dt><dd>{resumo.pendentes}</dd></div>
        {resumo.naoSalvos > 0 && (
          <div className="is-risk">
            <dt>Não salvos</dt>
            <dd>
              {resumo.naoSalvos}{' '}
              <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={aoTentarDeNovo}>
                Tentar de novo
              </button>
            </dd>
          </div>
        )}
      </dl>

      {recentes.length > 0 && (
        <ol className="estacao__recentes" aria-label="Leituras recentes">
          {recentes.map((r) => (
            <li key={r.id} className={`is-${r.tom}`}>{r.texto}</li>
          ))}
        </ol>
      )}
    </div>
  );
});

function UltimaPeca({
  ultima, pausado, voltar, aoInformarFalta, aoInformarEncontradas, aoEscolherVariacao, aoCriarVariacao,
}: {
  ultima: NonNullable<Props['ultima']>;
  pausado: boolean;
  voltar: () => void;
  aoInformarFalta: Props['aoInformarFalta'];
  aoInformarEncontradas: Props['aoInformarEncontradas'];
  aoEscolherVariacao: Props['aoEscolherVariacao'];
  aoCriarVariacao: Props['aoCriarVariacao'];
}) {
  const { ref, variacao, linhas } = ultima;
  const linha = linhas.find((l) => l.variacao === variacao);
  const estado = estadoDe(linha);
  const porFalta = !linha || linha.faltando != null;
  const valorInicial = linha
    ? String(porFalta ? (linha.faltando ?? 0) : (linha.contado ?? ''))
    : '0';
  const [valor, setValor] = useState(valorInicial);
  const [criando, setCriando] = useState(false);
  const [novaVariacao, setNovaVariacao] = useState('');
  useEffect(() => { setValor(valorInicial); }, [valorInicial]);

  const esperadoVariacao = variacao ? ref.variacoes?.find((v) => v.nome === variacao)?.esperado ?? null : null;
  const esperado = variacao ? esperadoVariacao : ref.esperado;
  const temVariacoes = (ref.variacoes?.length ?? 0) > 0;
  const fora = (ref.revendedoras ?? []).filter((r) => r.qtd > 0);

  /* `focar` só no Enter: no blur o foco já está indo para onde ela clicou
     (a variação, por exemplo), e puxá-lo de volta ao leitor o roubaria. */
  function confirmar(focar: boolean) {
    const n = Number(valor);
    if (valor.trim() === '' || !Number.isInteger(n) || n < 0) { setValor(valorInicial); if (focar) voltar(); return; }
    if (String(n) !== valorInicial || !linha) {
      if (porFalta) aoInformarFalta(variacao, n);
      else aoInformarEncontradas(variacao, n);
    }
    if (focar) voltar();
  }

  const rotuloEstado: Record<string, string> = {
    nao_conferido: 'Não conferido', conferido: 'Conferido', com_falta: 'Com falta', sobra: 'Sobrando',
  };

  return (
    <section className={`estacao__ultima is-${estado}`} aria-label="Última peça">
      <div className="estacao__peca">
        <span className="estacao__marca" aria-hidden="true">{estado === 'com_falta' ? '!' : estado === 'nao_conferido' ? '·' : '✓'}</span>
        <div>
          <b>{ref.desc}</b>
          <small className="mq-sku">
            SKU {ref.sku}{variacao ? ` · ${variacao}` : ''} · {rotuloEstado[estado]}
            {linha?.gravacao === 'salvando' ? ' · salvando…' : ''}
            {linha?.gravacao === 'erro' ? ` · NÃO SALVO${linha.erro ? ` — ${linha.erro}` : ''}` : ''}
          </small>
        </div>
      </div>

      <dl className="estacao__numeros">
        <div>
          <dt>Esperado em casa</dt>
          <dd>{esperado == null ? '—' : esperado}</dd>
        </div>
        {!variacao && fora.length > 0 && (
          <div>
            <dt>Com revendedoras</dt>
            <dd className="estacao__fora">{fora.map((r) => `${r.nome.split(' ')[0]} ${r.qtd}`).join(' · ')}</dd>
          </div>
        )}
        <div className="estacao__falta">
          <dt><label htmlFor="estacao-quantidade">{porFalta ? 'Faltando' : 'Encontradas'}</label></dt>
          <dd>
            <input
              id="estacao-quantidade"
              className="mq-input"
              type="number"
              min={0}
              inputMode="numeric"
              value={valor}
              disabled={pausado}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirmar(true); }
                if (e.key === 'Escape') { e.preventDefault(); setValor(valorInicial); voltar(); }
              }}
              onBlur={() => { if (valor !== valorInicial) confirmar(false); }}
            />
          </dd>
        </div>
      </dl>
      {!porFalta && esperado != null && esperado <= 0 && (
        <p className="estacao__aviso">O sistema não esperava esta peça em casa.</p>
      )}

      <div className="estacao__variacoes">
        {temVariacoes && (
          <label>
            <span>Variação</span>
            <select
              className="mq-input"
              value={variacao}
              disabled={pausado}
              onChange={(e) => { aoEscolherVariacao(e.target.value); }}
            >
              <option value="">Código inteiro</option>
              {ref.variacoes!.map((v) => {
                const feita = linhas.some((l) => l.variacao === v.nome);
                return (
                  <option key={v.nome} value={v.nome}>
                    {feita ? '✓ ' : ''}{v.nome}{v.esperado != null ? ` (${v.esperado} em casa)` : ''}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        {!criando ? (
          <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" disabled={pausado} onClick={() => setCriando(true)}>
            + Adicionar variação
          </button>
        ) : (
          <form
            className="estacao__nova"
            onSubmit={async (e) => {
              e.preventDefault();
              const v = novaVariacao.trim();
              if (!v) return;
              const ok = await aoCriarVariacao(v);
              if (ok) { setCriando(false); setNovaVariacao(''); voltar(); }
            }}
          >
            <input
              className="mq-input"
              aria-label="Nova variação"
              placeholder="ex.: Aro 18"
              value={novaVariacao}
              autoFocus
              onChange={(e) => setNovaVariacao(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setCriando(false); voltar(); } }}
            />
            <button type="submit" className="mq-btn mq-btn--secondary mq-btn--sm">Salvar</button>
            <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={() => { setCriando(false); voltar(); }}>
              Cancelar
            </button>
          </form>
        )}
      </div>
      {linhas.length > 1 && (
        <p className="estacao__aviso">
          {linhas.map((l) => `${l.variacao || 'código'}: ${estadoDe(l) === 'com_falta' ? `falta ${pecasFaltandoEm(l)}` : 'ok'}`).join(' · ')}
        </p>
      )}
    </section>
  );
}
