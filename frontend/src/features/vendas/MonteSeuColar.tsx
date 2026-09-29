import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { LoadingState } from '../../components/LoadingState';
import { money, plural } from '../../domain/formato';
import {
  composicaoDe, impedimentosDaComposicao, lerRecusa, listarModelosDeColar,
  type ComposicaoDoColar, type EscolhaDeComponente, type ModeloDeColar,
} from './colar';

interface Props {
  conexao: Connection;
  aoAdicionar: (c: ComposicaoDoColar) => void;
  aoCancelar: () => void;
}

interface ItemDoCardapio {
  sku: string;
  rotulo: string;
  desc: string | null;
  preco: number | null;
  disponivel: number;
  indisponivel: string | null;
}

interface Cardapio {
  ok: true;
  base: { sku: string; desc: string | null; preco: number | null; disponivel: number };
  grupos: { grupo: string; itens: ItemDoCardapio[] }[];
  /** As configurações OFICIAIS (29/09/2026): combinação → código e preço
   *  fixos. Opcional para conviver com um servidor anterior. */
  configuracoes?: ConfiguracaoOficial[];
  codigosComerciais: { sku: string; desc: string; preco: number | null; status: string; modelo: string | null }[];
  regra: string;
}

export interface ConfiguracaoOficial {
  sku: string;
  nome: string;
  preco: number;
  slots: { grupo: string; qtd: number }[];
  noCatalogo: boolean;
  modelo: string | null;
}

const NUMERO: Record<string, string[]> = {
  Menino: ['', 'Um', 'Dois', 'Três', 'Quatro', 'Cinco'],
  Menina: ['', 'Uma', 'Duas', 'Três', 'Quatro', 'Cinco'],
};

/** Um nome para a combinação nova — SUGESTÃO, a pessoa edita. Segue o
 *  padrão que já existe no catálogo ("Colar Filhos Dois Meninos e Uma
 *  Menina Banho de Ouro 18k"). */
export function nomeSugerido(contagem: Record<string, number>): string {
  const m = contagem.Menino ?? 0;
  const f = contagem.Menina ?? 0;
  const parte = (g: 'Menino' | 'Menina', n: number) =>
    `${NUMERO[g]?.[n] ?? n} ${n === 1 ? g : `${g}s`}`;
  let meio: string;
  if (m === 1 && f === 1) meio = 'Casal';
  else if (m && f) {
    meio = `Filhos ${m >= f
      ? `${parte('Menino', m)} e ${parte('Menina', f)}`
      : `${parte('Menina', f)} e ${parte('Menino', m)}`}`;
  } else if (f) meio = f === 1 ? 'Menina' : `Filhas ${parte('Menina', f)}`;
  else meio = m === 1 ? 'Menino' : `Filhos ${parte('Menino', m)}`;
  return `Colar ${meio} Banho de Ouro 18k`;
}

const assinatura = (slots: { grupo: string; qtd: number }[]) =>
  slots.filter((s) => s.qtd > 0).map((s) => `${s.grupo}:${s.qtd}`).sort().join('|');


/** MONTE SEU COLAR — a cliente escolhe os pingentes; o sistema acha o
 *  modelo, ou cadastra o modelo ali mesmo (§47, 27/09/2026).
 *
 *  Antes, a tela só vendia as configurações cadastradas de antemão, e
 *  nenhuma estava cadastrada: o botão existia e nunca funcionou. Agora a
 *  ordem é a do balcão — primeiro os pingentes, depois o nome e o preço —
 *  e o modelo nasce na primeira venda daquela combinação.
 *
 *  O que continua travado, de propósito: os pingentes são só os do
 *  cardápio (os "Colar Menino/Menina"), a corrente sai sozinha, e a baixa
 *  é da corrente e de cada pingente, uma vez — o colar não tem estoque
 *  próprio. */
export function MonteSeuColar({ conexao, aoAdicionar, aoCancelar }: Props) {
  const cardapio = useApi(
    (s) => chamar<Cardapio>(conexao, 'GET', '/api/personalizacao/componentes', undefined, { signal: s }),
    [conexao],
  );
  const modelos = useApi((s) => listarModelosDeColar(conexao, s), [conexao]);
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [observacao, setObservacao] = useState('');

  const recusa = lerRecusa(cardapio.erro ?? modelos.erro);
  const grupos = useMemo(() => cardapio.dados?.grupos ?? [], [cardapio.dados]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of grupos) c[g.grupo] = g.itens.reduce((n, it) => n + (qtd[it.sku] ?? 0), 0);
    return c;
  }, [grupos, qtd]);
  const pecas = Object.values(contagem).reduce((n, x) => n + x, 0);

  const modelo = useMemo(() => {
    if (!pecas) return null;
    const alvo = assinatura(Object.entries(contagem).map(([grupo, n]) => ({ grupo, qtd: n })));
    return (modelos.dados?.modelos ?? []).find((m) => assinatura(m.slots) === alvo) ?? null;
  }, [modelos.dados, contagem, pecas]);

  function mudar(it: ItemDoCardapio, delta: number) {
    setQtd((a) => {
      const n = Math.max(0, Math.min(it.disponivel, (a[it.sku] ?? 0) + delta));
      return { ...a, [it.sku]: n };
    });
  }

  function escolhasPara(m: ModeloDeColar): EscolhaDeComponente[] {
    return Object.entries(qtd).filter(([, n]) => n > 0).map(([sku, n]) => {
      const o = m.opcoes.find((x) => x.componenteSku === sku);
      return {
        opcaoId: o?.id ?? 0, componenteSku: sku, rotulo: o?.rotulo ?? sku, grupo: o?.grupo ?? null,
        variacao: o?.variacao ?? null, varianteId: o?.varianteId ?? null, qtd: n,
      };
    });
  }

  function adicionar(m: ModeloDeColar) {
    aoAdicionar(composicaoDe(m, escolhasPara(m), observacao));
  }

  const oficial = useMemo(() => {
    if (!pecas) return null;
    const alvo = assinatura(Object.entries(contagem).map(([grupo, n]) => ({ grupo, qtd: n })));
    return (cardapio.dados?.configuracoes ?? []).find((c) => assinatura(c.slots) === alvo) ?? null;
  }, [cardapio.dados, contagem, pecas]);

  const escolhasDoModelo = modelo ? escolhasPara(modelo) : [];
  const problemas = modelo ? impedimentosDaComposicao(modelo, escolhasDoModelo) : [];
  const base = cardapio.dados?.base;

  return (
    <>
      <div className="mq-card__head collar-heading">
        <div>
          <p className="mq-eyebrow">Monte seu Colar</p>
          <h2 className="mq-title mq-display">Escolha os pingentes</h2>
          <p className="mq-lede">
            Toque em + em cada pingente que a cliente escolheu. A corrente entra sozinha.
          </p>
        </div>
        <button type="button" className="mq-btn mq-btn--ghost" onClick={aoCancelar}>Voltar</button>
      </div>

      {recusa?.desativada && (
        <div className="mq-note mq-note--warn" role="alert">
          <Icone nome="alert" />
          <span>
            <b>O Monte seu Colar está desligado no servidor.</b>{' '}
            Enquanto isso, registre a venda do colar como <b>Venda normal</b>.
          </span>
        </div>
      )}
      {recusa && !recusa.desativada && (
        <div className="mq-note mq-note--risk" role="alert"><Icone nome="alert" /><span>{recusa.mensagem}</span></div>
      )}

      {(cardapio.carregando || modelos.carregando) && <LoadingState />}

      {base && (
        <section className="mq-card mq-card--pad">
          <div className="mq-item">
            <span className={base.disponivel > 0 ? 'mq-item__icon mq-item__icon--ok' : 'mq-item__icon mq-item__icon--warn'}>
              <Icone nome={base.disponivel > 0 ? 'check' : 'alert'} />
            </span>
            <span className="mq-item__main">
              <b>Corrente incluída automaticamente</b>
              <small>{base.desc ?? 'corrente fora do catálogo'} · {base.sku} · {base.disponivel} em estoque</small>
            </span>
            <span className="mq-item__side"><b className="mq-qty">1 un.</b></span>
          </div>
          {base.disponivel <= 0 && (
            <p className="mq-note mq-note--warn">
              <span>Sem corrente em estoque, o colar não pode ser vendido. Dê entrada nas correntes em Peças › Entrada de peças.</span>
            </p>
          )}
        </section>
      )}

      {grupos.map((g) => (
        <section className="mq-card mq-card--pad" key={g.grupo}>
          <div className="mq-spread">
            <h2 className="mq-title">{g.grupo}</h2>
            <span className="mq-status">
              {contagem[g.grupo] ?? 0} {plural(contagem[g.grupo] ?? 0, 'escolhido', 'escolhidos')}
            </span>
          </div>
          <div className="mq-grid mq-grid--3">
            {g.itens.map((it) => {
              const n = qtd[it.sku] ?? 0;
              const bloqueada = !!it.indisponivel;
              return (
                <div className={`mq-card mq-card--pad mq-colar__opcao${bloqueada ? ' mq-card--quiet' : ''}`} key={it.sku}>
                  {/* O rótulo do cardápio, e não o nome do catálogo: lá os
                      meninos estão como "Colar Menino…" e as meninas como
                      "Pingente Menina…", e isso fazia parecer duas linhas
                      diferentes. Aqui todos são o que são: pingentes. */}
                  <b>Pingente {it.rotulo}</b>
                  <small className="mq-sku" title={it.desc ?? undefined}>SKU {it.sku}</small>
                  <small className={bloqueada ? 'mq-money--risk' : 'mq-muted'}>
                    {it.indisponivel ?? `${it.disponivel} ${plural(it.disponivel, 'disponível', 'disponíveis')}`}
                  </small>
                  <div className="mq-btns">
                    <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm"
                      aria-label={`Menos ${it.rotulo}`} disabled={n === 0} onClick={() => mudar(it, -1)}>−</button>
                    <output className="mq-qty" aria-label={`Quantidade de ${it.rotulo}`}>{n}</output>
                    <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm"
                      aria-label={`Mais ${it.rotulo}`} disabled={bloqueada || n >= it.disponivel}
                      onClick={() => mudar(it, 1)}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {cardapio.dados && (
        <section className="mq-card mq-card--pad">
          <h2 className="mq-title">Confira o colar</h2>

          {pecas === 0 ? (
            <p className="mq-hint">Escolha pelo menos um pingente.</p>
          ) : modelo ? (
            <>
              <dl className="mq-dl">
                <div><dt>Modelo</dt><dd>{modelo.nome}{modelo.skuComercial ? ` · ${modelo.skuComercial}` : ''}</dd></div>
                <div>
                  <dt>Pingentes</dt>
                  <dd>{escolhasDoModelo.map((e) => `${e.qtd}× ${e.rotulo}`).join(', ')}</dd>
                </div>
                <div><dt>Preço</dt><dd>{modelo.precoSugerido == null ? '—' : money(modelo.precoSugerido)}</dd></div>
              </dl>
              <label className="mq-field">
                <span>Observação <small>opcional</small></span>
                <input className="mq-input" maxLength={120} placeholder="ex.: presente, embalar separado"
                  value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </label>
              {problemas.length > 0 && (
                <div className="mq-note mq-note--warn">
                  <Icone nome="alert" />
                  <span>{problemas.map((p) => <span key={p} style={{ display: 'block' }}>{p}</span>)}</span>
                </div>
              )}
              <div className="mq-btns">
                <button type="button" className="mq-btn mq-btn--primary" disabled={problemas.length > 0}
                  onClick={() => adicionar(modelo)}>
                  Adicionar à venda{modelo.precoSugerido != null ? ` · ${money(modelo.precoSugerido)}` : ''}
                </button>
                <button type="button" className="mq-btn mq-btn--ghost" onClick={aoCancelar}>Cancelar</button>
              </div>
            </>
          ) : (
            <CadastrarModelo
              /* Uma combinação nova é um formulário novo: a sugestão de
                 código, nome e preço é da combinação ATUAL, não da primeira
                 que passou pela tela. */
              key={assinatura(Object.entries(contagem).map(([grupo, n]) => ({ grupo, qtd: n })))}
              conexao={conexao}
              contagem={contagem}
              codigos={cardapio.dados.codigosComerciais}
              oficial={oficial}
              baseSemEstoque={!!base && base.disponivel <= 0}
              aoCadastrar={(m) => { modelos.recarregar(); cardapio.recarregar(); adicionar(m); }}
            />
          )}
        </section>
      )}
    </>
  );
}

/** A combinação escolhida ainda não tem modelo: cadastrar ali mesmo.
 *
 *  Nome e preço vêm sugeridos e são editáveis. O código comercial é um
 *  produto que já existe (os "Colar Casal/Filhos/Filhas" do catálogo) ou
 *  um código novo, gerado agora. A escolha é da pessoa: parecer pelo nome
 *  não é prova de que é o mesmo colar. */
function CadastrarModelo({
  conexao, contagem, codigos, oficial = null, baseSemEstoque, aoCadastrar,
}: {
  conexao: Connection;
  contagem: Record<string, number>;
  codigos: Cardapio['codigosComerciais'];
  oficial?: ConfiguracaoOficial | null;
  baseSemEstoque: boolean;
  aoCadastrar: (m: ModeloDeColar) => void;
}) {
  const sugestao = nomeSugerido(contagem);
  const livres = codigos.filter((c) => !c.modelo);
  /* Sem adivinhar pelo nome: "Colar Filhos Dois Meninos" começa igual a
     "Colar Filhos Dois Meninos e Uma Menina", e a adivinhação já escolheu o
     código errado. Combinação oficial tem código fixo (abaixo); a que não
     tem começa em "código novo", e a pessoa escolhe outro se quiser. */
  const [nome, setNome] = useState(oficial?.nome ?? sugestao);
  const [codigo, setCodigo] = useState<string>(oficial?.sku ?? 'novo');
  const [preco, setPreco] = useState(oficial ? String(oficial.preco) : '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  function escolherCodigo(sku: string) {
    setCodigo(sku);
    const c = livres.find((x) => x.sku === sku);
    if (c) {
      setNome(c.desc);
      if (c.preco != null) setPreco(String(c.preco));
    } else {
      setNome(sugestao);
    }
  }

  async function cadastrar() {
    setErro('');
    const n = Number(preco.replace(',', '.'));
    if (!nome.trim()) { setErro('Diga o nome do colar.'); return; }
    if (!Number.isFinite(n) || n <= 0) { setErro('Diga o preço do colar.'); return; }
    setSalvando(true);
    try {
      const r = await chamar<{ ok?: boolean; erro?: string; modelo?: ModeloDeColar }>(
        conexao, 'POST', '/api/personalizacao/modelos/na-venda', {
          nome: nome.trim(), preco: n, contagem,
          ...(codigo === 'novo' ? { gerarCodigo: true } : { skuComercial: codigo }),
        },
      );
      if (!r.ok || !r.modelo) { setErro(r.erro || 'Não consegui cadastrar o modelo.'); return; }
      aoCadastrar(r.modelo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui cadastrar o modelo.');
    } finally {
      setSalvando(false);
    }
  }

  if (oficial) {
    return (
      <div className="mq-stack" aria-label="Configuração oficial">
        <dl className="mq-dl">
          <div><dt>Modelo</dt><dd>{oficial.nome} · {oficial.sku}</dd></div>
          <div><dt>Preço</dt><dd>{money(oficial.preco)}</dd></div>
        </dl>
        <p className="mq-hint">
          Configuração oficial: código e preço são fixos. O colar não tem estoque
          próprio — saem a corrente e os pingentes escolhidos.
        </p>
        {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
        <div className="mq-btns">
          <button type="button" className="mq-btn mq-btn--primary" disabled={salvando || baseSemEstoque} onClick={cadastrar}>
            {salvando ? 'Adicionando…' : `Adicionar à venda · ${money(oficial.preco)}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mq-stack" aria-label="Cadastrar modelo de colar">
      <p className="mq-note mq-note--info">
        <Icone nome="alert" />
        <span>
          Essa combinação ainda não tem modelo. Confira o código, o nome e o preço —
          ele fica cadastrado e, da próxima vez, aparece pronto.
        </span>
      </p>
      <label className="mq-field">
        <span>Código do colar</span>
        <select className="mq-select" value={codigo} onChange={(e) => escolherCodigo(e.target.value)}>
          <option value="novo">Criar um código novo</option>
          {livres.map((c) => (
            <option key={c.sku} value={c.sku}>
              {c.sku} · {c.desc}{c.preco != null ? ` · ${money(c.preco)}` : ''}{c.status !== 'ativo' ? ` · ${c.status}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="mq-field">
        <span>Nome</span>
        <input className="mq-input" value={nome} onChange={(e) => setNome(e.target.value)} />
      </label>
      <label className="mq-field">
        <span>Preço do colar</span>
        <span className="mq-money-input">
          <input className="mq-input" type="number" min={0} step="0.01" inputMode="decimal"
            value={preco} onChange={(e) => setPreco(e.target.value)} aria-label="Preço do colar" />
        </span>
        <small>o preço do colar montado, não a soma das peças</small>
      </label>
      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
      <div className="mq-btns">
        <button type="button" className="mq-btn mq-btn--primary" disabled={salvando || baseSemEstoque} onClick={cadastrar}>
          {salvando ? 'Cadastrando…' : 'Cadastrar e adicionar à venda'}
        </button>
      </div>
    </div>
  );
}
