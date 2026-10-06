import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { plural } from '../../domain/formato';
import { acharVariacao } from '../../domain/variacao';
import {
  estadoDoCodigo, planoDaDigitacao, ROTULO_DA_SITUACAO,
  type EsperadoDoInventario, type Gesto, type LinhaContada, type PlanoDaDigitacao,
} from './contagem';
import { AvisoDaContagem } from './AvisoDaContagem';

export type RespostaDaCriacao =
  | { ok: true; nome: string }
  | { jaExiste: true; existente: string }
  | { erro: string };

export interface ExtraDaLeitura {
  variacao?: string; quantidade?: number; de?: string; para?: string; naoInformadas?: boolean;
}

interface Props {
  peca: EsperadoDoInventario;
  linhas: LinhaContada[] | undefined;
  pausado: boolean;
  aoContar: (gesto: Gesto, extra?: ExtraDaLeitura) => void;
  aoCriarVariacao: (valor: string, quantidade: number) => Promise<RespostaDaCriacao>;
  aoIdentificarNaMaleta: (maletaId: number, distribuicao: { variacao: string; qtd: number }[]) => Promise<string | null>;
  aoFechar: () => void;
}

/** A PEÇA NA MÃO — o que a Sthefany vê depois de bipar.
 *
 *  É a linha da planilha dela, em cartão: estoque total, com revendedoras,
 *  em casa, conferido e faltando. Embaixo, o que ela faz com a peça: contar
 *  mais uma, tirar uma, "estão todas aqui", "não achei nenhuma". Peça com
 *  variação conta por variação — duas do nº23 são DUAS — e a peça bipada sem
 *  dizer a variação fica "não informada" até ela tocar na certa.
 *
 *  Nada técnico aparece aqui: nem id de variação, nem nome de rota, nem
 *  estado em código. */
export function ConferenciaDaPeca({
  peca, linhas, pausado, aoContar, aoCriarVariacao, aoIdentificarNaMaleta, aoFechar,
}: Props) {
  const e = estadoDoCodigo(peca, linhas);
  const variacoes = peca.variacoes ?? [];
  const temVariacao = variacoes.length > 0;
  const naoInformadas = e.porVariacao.get('') ?? 0;
  const fora = (peca.revendedoras ?? []).filter((r) => r.qtd > 0);
  const [criando, setCriando] = useState(false);
  /* O número digitado sobre uma contagem que já existe espera ela dizer. */
  const [pergunta, setPergunta] = useState<{ variacao?: string; n: number; plano: PlanoDaDigitacao } | null>(null);
  /* Muda quando ela desiste: o campo volta a mostrar o que estava. */
  const [versao, setVersao] = useState(0);

  /** O número digitado é o TOTAL da linha (§59): nunca soma ao que já
   *  estava, e substituir uma contagem pede confirmação. */
  function definir(variacao: string | undefined, n: number) {
    const plano = planoDaDigitacao(linhas, variacao ?? '', n);
    if (plano.tipo === 'igual') return;
    if (plano.tipo === 'direto') {
      aoContar('definir', { ...(variacao !== undefined ? { variacao } : {}), quantidade: n });
      return;
    }
    setPergunta({ variacao, n, plano });
  }
  function responder(extra: ExtraDaLeitura | null) {
    if (pergunta && extra) {
      aoContar('definir', {
        ...(pergunta.variacao !== undefined ? { variacao: pergunta.variacao } : {}), quantidade: pergunta.n, ...extra,
      });
    }
    if (!extra) setVersao((v) => v + 1);
    setPergunta(null);
  }
  /* A peça que acabou de abrir fica à vista — no telefone ela nasce abaixo
     do leitor e da busca. */
  const raiz = useRef<HTMLElement>(null);
  useEffect(() => { raiz.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, []);

  return (
    <section ref={raiz} className={`conf-peca is-${e.situacao}`} aria-label="Peça em conferência">
      <header className="conf-peca__head">
        <div className="conf-peca__nome">
          <b>{peca.desc}</b>
          <small>
            Código {peca.sku}{peca.cat ? ` · ${peca.cat}` : ''}
          </small>
        </div>
        <span className={`conf-peca__selo is-${e.situacao}`}>{ROTULO_DA_SITUACAO[e.situacao]}</span>
        <button type="button" className="mq-btn mq-btn--ghost mq-btn--icon" aria-label="Fechar a peça" onClick={aoFechar}>
          <Icone nome="close" />
        </button>
      </header>

      <dl className="conf-numeros" aria-label="Quantidades">
        <div><dt>Estoque total</dt><dd>{peca.total}</dd></div>
        <div><dt>Com revendedoras</dt><dd>{peca.consignado || '—'}</dd></div>
        <div className="is-casa"><dt>Em casa</dt><dd>{Math.max(0, peca.esperado)}</dd></div>
        <div className="is-conferido"><dt>Conferido</dt><dd>{e.conferido ?? '—'}</dd></div>
        <div className={e.faltando ? 'is-falta' : e.sobrando ? 'is-sobra' : ''}>
          <dt>{e.sobrando ? 'Sobrando' : 'Faltando'}</dt>
          <dd>{e.sobrando ? e.sobrando : e.faltando || '—'}</dd>
        </div>
      </dl>

      {!temVariacao && (
        <Contador
          rotulo="Conferido"
          valor={e.porVariacao.get('') ?? 0}
          versao={versao}
          desligado={pausado}
          aoMenos={() => aoContar('menos')}
          aoMais={() => aoContar('mais')}
          aoDefinir={(n) => definir(undefined, n)}
        />
      )}

      <div className="conf-atalhos">
        {peca.esperado > 0 && e.conferido !== peca.esperado && (
          <button type="button" className="mq-btn mq-btn--secondary" disabled={pausado} onClick={() => aoContar('todas')}>
            <Icone nome="check" />
            Estão todas aqui ({peca.esperado})
          </button>
        )}
        {e.conferido !== 0 && (
          <button type="button" className="mq-btn mq-btn--ghost" disabled={pausado} onClick={() => aoContar('nenhuma')}>
            Não achei nenhuma
          </button>
        )}
        {e.conferido != null && (
          <button type="button" className="mq-btn mq-btn--ghost" disabled={pausado} onClick={() => aoContar('limpar')}>
            Desfazer conferência
          </button>
        )}
      </div>

      {temVariacao && (
        <section className="conf-variacoes" aria-label="Variações">
          <h3 className="mq-subtitle">Variações</h3>
          {naoInformadas > 0 && (
            <div className="conf-qual">
              <p>
                <b>{naoInformadas} {plural(naoInformadas, 'peça', 'peças')} sem variação.</b>{' '}
                Toque na variação dela:
              </p>
              <div className="conf-qual__chips">
                {variacoes.map((v) => (
                  <button key={v.nome} type="button" className="mq-chip" disabled={pausado}
                    onClick={() => aoContar('mover', { de: '', para: v.nome })}>
                    {v.nome}
                  </button>
                ))}
                <button type="button" className="mq-chip mq-chip--soft" disabled={pausado} onClick={() => setCriando(true)}>
                  + Outra
                </button>
              </div>
            </div>
          )}
          <ul className="conf-variacoes__lista">
            {variacoes.map((v) => (
              <li key={v.nome}>
                <span className="conf-variacoes__nome">
                  <b>{v.nome}</b>
                  <small>
                    {v.esperado != null ? `em casa ${Math.max(0, v.esperado)}` : 'em casa: não informado'}
                    {v.comRevendedoras ? ` · ${v.comRevendedoras} com revendedora` : ''}
                  </small>
                </span>
                <Contador
                  rotulo={`Conferido em ${v.nome}`}
                  valor={e.porVariacao.get(v.nome) ?? 0}
                  versao={versao}
                  desligado={pausado}
                  compacto
                  aoMenos={() => aoContar('menos', { variacao: v.nome })}
                  aoMais={() => aoContar('mais', { variacao: v.nome })}
                  aoDefinir={(n) => definir(v.nome, n)}
                />
              </li>
            ))}
            <li className="is-nao-informada">
              <span className="conf-variacoes__nome">
                <b>Variação não informada</b>
                <small>
                  {peca.naoInformada && peca.naoInformada.esperado != null && peca.naoInformada.esperado > 0
                    ? `em casa ${peca.naoInformada.esperado}` : 'peças sem a variação dita'}
                </small>
              </span>
              <Contador
                rotulo="Conferido sem variação"
                valor={naoInformadas}
                versao={versao}
                desligado={pausado}
                compacto
                aoMenos={() => aoContar('menos', { variacao: '' })}
                aoMais={() => aoContar('mais', { variacao: '' })}
                aoDefinir={(n) => definir('', n)}
              />
            </li>
          </ul>
        </section>
      )}

      <CriarVariacao
        aberta={criando}
        variacoes={variacoes.map((v) => v.nome)}
        desligado={pausado}
        aoAbrir={() => setCriando(true)}
        aoFechar={() => setCriando(false)}
        aoCriar={aoCriarVariacao}
        aoContarExistente={(nome) => {
          if (naoInformadas > 0) aoContar('mover', { de: '', para: nome });
          else aoContar('mais', { variacao: nome });
          setCriando(false);
        }}
      />

      {pergunta && pergunta.plano.tipo !== 'igual' && pergunta.plano.tipo !== 'direto' && (
        <PerguntaDaDigitacao
          plano={pergunta.plano}
          variacao={pergunta.variacao ?? ''}
          aoResponder={responder}
        />
      )}

      {fora.length > 0 && (
        <section className="conf-fora" aria-label="Com revendedoras">
          <h3 className="mq-subtitle">Com revendedoras</h3>
          <ul>
            {fora.map((r) => (
              <ComRevendedora
                key={`${r.nome}-${r.maletaId ?? ''}`}
                r={r}
                variacoes={variacoes.map((v) => v.nome)}
                aoIdentificar={aoIdentificarNaMaleta}
              />
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

/** − número + — o número também se digita (teclado numérico). */
function Contador({
  rotulo, valor, versao = 0, desligado, compacto = false, aoMenos, aoMais, aoDefinir,
}: {
  rotulo: string; valor: number; versao?: number; desligado: boolean; compacto?: boolean;
  aoMenos: () => void; aoMais: () => void; aoDefinir: (n: number) => void;
}) {
  const [texto, setTexto] = useState(String(valor));
  /* `versao` muda quando ela cancela a substituição: o campo volta ao que
     estava conferido. */
  useEffect(() => { setTexto(String(valor)); }, [valor, versao]);
  const confirmar = () => {
    const n = Number(texto);
    if (texto.trim() === '' || !Number.isInteger(n) || n < 0 || n > 9999) { setTexto(String(valor)); return; }
    if (n !== valor) aoDefinir(n);
  };
  return (
    <div className={`conf-contador${compacto ? ' is-compacto' : ''}`} role="group" aria-label={`Contador: ${rotulo}`}>
      <button type="button" className="conf-contador__botao" aria-label={`Tirar uma — ${rotulo}`}
        disabled={desligado || valor <= 0} onClick={aoMenos}>−</button>
      <input
        className="conf-contador__valor"
        type="number" inputMode="numeric" min={0} max={9999}
        aria-label={rotulo}
        value={texto}
        disabled={desligado}
        onFocus={(ev) => ev.currentTarget.select()}
        onChange={(ev) => setTexto(ev.target.value)}
        onBlur={confirmar}
        /* Enter só tira o foco: quem grava é o blur, uma vez. */
        onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ev.currentTarget.blur(); } }}
      />
      <button type="button" className="conf-contador__botao is-mais" aria-label={`Contar mais uma — ${rotulo}`}
        disabled={desligado} onClick={aoMais}>+</button>
    </div>
  );
}

/** "Substituir a quantidade conferida?" — o número digitado sobre o que já
 *  estava. Mostra o antes e o depois; nada é gravado sem o toque dela. */
function PerguntaDaDigitacao({
  plano, variacao, aoResponder,
}: {
  plano: Exclude<PlanoDaDigitacao, { tipo: 'igual' } | { tipo: 'direto' }>;
  variacao: string;
  aoResponder: (extra: ExtraDaLeitura | null) => void;
}) {
  const cancelar = { rotulo: 'Cancelar', tom: 'neutro' as const, aoEscolher: () => aoResponder(null) };

  if (plano.tipo === 'semVariacao') {
    const varias = plano.naoInformadas > 1;
    return (
      <AvisoDaContagem
        titulo={varias ? `As peças bipadas sem variação são do ${variacao}?` : `A peça bipada sem variação é do ${variacao}?`}
        aoDesistir={() => aoResponder(null)}
        opcoes={[
          { rotulo: varias ? `Sim, são do ${variacao}` : `Sim, é do ${variacao}`, tom: 'primario',
            aoEscolher: () => aoResponder({ naoInformadas: true }) },
          { rotulo: varias ? 'Não, são de outra variação' : 'Não, é de outra variação', tom: 'secundario',
            aoEscolher: () => aoResponder({}) },
          cancelar,
        ]}
      >
        <p>
          Esta peça tem {plano.naoInformadas}{' '}
          {plural(plano.naoInformadas, 'peça bipada sem variação', 'peças bipadas sem variação')}, e você
          digitou {plano.depois} em {variacao}.
        </p>
        <ul className="conf-aviso__saidas">
          <li>
            Se {varias ? 'forem' : 'for'} do {variacao}: {variacao} fica com {plano.depois} e a peça
            com <b>{plano.totalSeForem}</b> no total.
          </li>
          <li>Se {varias ? 'forem' : 'for'} de outra variação: a peça fica com <b>{plano.totalSeNaoForem}</b>.</li>
        </ul>
      </AvisoDaContagem>
    );
  }

  const onde = variacao ? ` em ${variacao}` : '';
  return (
    <AvisoDaContagem
      titulo="Substituir a quantidade conferida?"
      aoDesistir={() => aoResponder(null)}
      opcoes={[
        { rotulo: `Substituir por ${plano.depois}`, tom: 'primario', aoEscolher: () => aoResponder({}) },
        cancelar,
      ]}
    >
      <p>
        {plano.antes > 0
          ? <>{plano.antes > 1 ? 'Já foram conferidas' : 'Já foi conferida'} {plano.antes}{' '}
            {plural(plano.antes, 'unidade', 'unidades')} desta peça{onde}.</>
          : <>Esta peça já tem {plano.totalAntes}{' '}
            {plural(plano.totalAntes, 'unidade conferida', 'unidades conferidas')} nas variações.</>}
        {' '}O número digitado substitui o que estava — não soma.
      </p>
      <p className="conf-aviso__troca">
        <span>{plano.antes}</span> → <b>{plano.depois}</b>
      </p>
      {plano.totalDepois !== plano.depois && (
        <p className="conf-aviso__nota">Total conferido da peça: {plano.totalAntes} → {plano.totalDepois}</p>
      )}
    </AvisoDaContagem>
  );
}

/** "+ Criar variação" — Número e Quantidade encontrada, sem sair da tela. */
function CriarVariacao({
  aberta, variacoes, desligado, aoAbrir, aoFechar, aoCriar, aoContarExistente,
}: {
  aberta: boolean; variacoes: string[]; desligado: boolean;
  aoAbrir: () => void; aoFechar: () => void;
  aoCriar: (valor: string, quantidade: number) => Promise<RespostaDaCriacao>;
  aoContarExistente: (nome: string) => void;
}) {
  const [valor, setValor] = useState('');
  const [qtd, setQtd] = useState('1');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; existente?: string } | null>(null);

  if (!aberta) {
    return (
      <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm conf-criar" disabled={desligado} onClick={aoAbrir}>
        <Icone nome="plus" /> {variacoes.length ? 'Criar variação' : 'Esta peça tem variação (aro, cor…)'}
      </button>
    );
  }

  /* A mesma regra do servidor, antes de enviar: "23" já é o "nº23". */
  const existente = valor.trim() ? acharVariacao(variacoes.map((nome) => ({ nome })), valor) : null;

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    const v = valor.trim();
    const n = Number(qtd || '0');
    if (!v) { setAviso({ texto: 'Diga qual é a variação (ex.: 19).' }); return; }
    if (!Number.isInteger(n) || n < 0) { setAviso({ texto: 'A quantidade tem que ser um número inteiro.' }); return; }
    if (existente) { setAviso({ texto: `Essa variação já existe: ${existente.nome}.`, existente: existente.nome }); return; }
    setOcupado(true);
    const r = await aoCriar(v, n);
    setOcupado(false);
    if ('ok' in r) { setValor(''); setQtd('1'); setAviso(null); aoFechar(); return; }
    if ('jaExiste' in r) { setAviso({ texto: `Essa variação já existe: ${r.existente}.`, existente: r.existente }); return; }
    setAviso({ texto: r.erro });
  }

  return (
    <form className="conf-nova" onSubmit={salvar} aria-label="Criar variação">
      <p className="conf-nova__titulo"><b>Variação não encontrada?</b> Crie aqui — ela fica no cadastro da peça.</p>
      <div className="conf-nova__campos">
        <label className="mq-field">
          <span>Variação</span>
          <input className="mq-input" value={valor} placeholder="ex.: 19" autoFocus
            onChange={(ev) => { setValor(ev.target.value); setAviso(null); }} />
        </label>
        <label className="mq-field">
          <span>Quantidade encontrada</span>
          <input className="mq-input" type="number" inputMode="numeric" min={0} value={qtd}
            onChange={(ev) => setQtd(ev.target.value)} />
        </label>
      </div>
      {(aviso || existente) && (
        <p className="mq-note mq-note--warn" role="status">
          <Icone nome="alert" />
          <span>
            {aviso?.texto ?? `Essa variação já existe: ${existente!.nome}.`}
            {(aviso?.existente ?? existente?.nome) && (
              <>
                {' '}
                <button type="button" className="mq-btn mq-btn--link"
                  onClick={() => aoContarExistente((aviso?.existente ?? existente?.nome)!)}>
                  Contar uma em {aviso?.existente ?? existente?.nome}
                </button>
              </>
            )}
          </span>
        </p>
      )}
      <div className="mq-btns">
        <button type="submit" className="mq-btn mq-btn--primary" disabled={ocupado || desligado}>
          {ocupado ? 'Salvando…' : 'Salvar e continuar'}
        </button>
        <button type="button" className="mq-btn mq-btn--ghost" onClick={() => { setAviso(null); aoFechar(); }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Uma revendedora com a peça: quantas, e de qual variação — ou "variação
 *  não informada", sem nunca escolher por ela. "Identificar" é para quando
 *  a informação aparece (a peça voltou, ou ela lembrou). */
function ComRevendedora({
  r, variacoes, aoIdentificar,
}: {
  r: NonNullable<EsperadoDoInventario['revendedoras']>[number];
  variacoes: string[];
  aoIdentificar: Props['aoIdentificarNaMaleta'];
}) {
  const ditas = r.variacoes ?? [];
  const semVariacao = r.qtd - ditas.reduce((s, v) => s + v.qtd, 0);
  const [abrindo, setAbrindo] = useState(false);
  const [escolha, setEscolha] = useState('');
  const [erro, setErro] = useState('');
  const primeiroNome = r.nome.split(' ')[0];

  async function salvar() {
    if (!escolha || !r.maletaId) return;
    const mapa = new Map(ditas.map((d) => [d.nome, d.qtd]));
    mapa.set(escolha, (mapa.get(escolha) ?? 0) + 1);
    const e = await aoIdentificar(r.maletaId, [...mapa.entries()].map(([variacao, qtd]) => ({ variacao, qtd })));
    if (e) { setErro(e); return; }
    setAbrindo(false); setEscolha(''); setErro('');
  }

  return (
    <li>
      <span>
        <b>{primeiroNome}</b> · {r.qtd} {plural(r.qtd, 'peça', 'peças')}
        {ditas.length > 0 && ` · ${ditas.map((d) => `${d.nome}${d.qtd > 1 ? ` (${d.qtd})` : ''}`).join(', ')}`}
        {variacoes.length > 0 && semVariacao > 0 && (
          <em> · {semVariacao > 1 ? `${semVariacao} com ` : ''}variação não informada</em>
        )}
      </span>
      {variacoes.length > 0 && semVariacao > 0 && r.maletaId && !abrindo && (
        <button type="button" className="mq-btn mq-btn--link" onClick={() => setAbrindo(true)}>
          Identificar variação
        </button>
      )}
      {abrindo && (
        <span className="conf-fora__identificar">
          <select className="mq-select" aria-label={`Variação da peça com ${primeiroNome}`} value={escolha}
            onChange={(ev) => setEscolha(ev.target.value)}>
            <option value="">Qual variação?</option>
            {variacoes.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" disabled={!escolha} onClick={salvar}>
            Salvar
          </button>
          <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={() => { setAbrindo(false); setErro(''); }}>
            Cancelar
          </button>
          {erro && <small className="mq-risk">{erro}</small>}
        </span>
      )}
    </li>
  );
}
