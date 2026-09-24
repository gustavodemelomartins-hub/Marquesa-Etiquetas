import { useEffect, useRef, useState } from 'react';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { combinar, type Atributo } from './combinacoes';

/** O laudo de `POST /api/produtos/novos/analisar`. Só a parte que uma peça
 *  digitada à mão pode produzir: a resposta tem lotes, e aqui o lote tem
 *  sempre uma linha. */
interface Laudo {
  prontos: { itens: LinhaPronta[] };
  jaExistem: { itens: { sku: string; desc: string; usos: Uso[] }[] };
  revisao: { itens: { sku: string; desc: string; motivos: string[] }[] };
}

interface LinhaPronta {
  sku: string;
  desc: string;
  cat: string;
  preco: number | null;
  qtd: number;
  alertas?: string[];
  naLoja?: Uso[];
}

interface Uso {
  onde: string;
  produto?: string;
  variacao?: string;
  desc?: string;
}

interface Checagem {
  sku: string;
  valido: boolean;
  bloqueiam?: Uso[];
  avisos?: Uso[];
  formato?: { ok: boolean; recado?: string };
  motivo?: string;
}

interface Props {
  conexao: Connection;
  /** As categorias VIVAS, do `GET /api/state`. O backend só aceita uma
   *  delas; qualquer outra coisa cai na sentinela "sem categoria", e é
   *  melhor a tela oferecer a lista do que a pessoa descobrir depois. */
  categorias: string[];
  aoCancelar: () => void;
  /** Chamado com o código criado. Quem chamou decide para onde ir — e é
   *  sempre para um lugar onde a peça recém-criada APARECE. */
  aoCriado: (sku: string) => void;
}

/* Seis dígitos, o primeiro diferente de zero. A MESMA expressão do
   `SKU_SEIS` do backend (api/REGRAS.md §17), repetida aqui de propósito:
   aqui ela é conveniência — a pessoa descobre antes de terminar —, lá é
   recusa, e no banco o índice único é o que pega dois cadastros no mesmo
   instante. Esta camada pode falhar sem estragar nada. */
const SEIS_NUMEROS = /^[1-9][0-9]{5}$/;

const MOTIVOS: Record<string, string> = {
  codigo_vazio: 'o código está vazio',
  codigo_suspeito: 'o código tem caracteres que o catálogo não usa',
  codigo_fora_do_formato: 'o código precisa ter 6 números',
  sem_descricao: 'falta o nome da peça',
  qtd_invalida: 'a quantidade não é um número',
  qtd_negativa: 'a quantidade não pode ser negativa',
  preco_invalido: 'o preço não é um número',
  categoria_inexistente: 'essa categoria não existe no sistema',
  duplicado_planilha: 'o código se repete',
  dados_conflitantes: 'o mesmo código com dois nomes',
};

/** NOVO PRODUTO — uma peça nasce aqui, de verdade.
 *
 *  Este formulário NÃO abre um caminho novo de escrita. Ele usa exatamente
 *  o mesmo par de rotas que a importação de planilha usa — `novos/analisar`
 *  e depois `novos/cadastrar`, com `origem: 'manual'` —, porque uma peça
 *  digitada à mão é, para o sistema, uma peça nova como outra qualquer: só
 *  muda de onde a linha veio. Um segundo INSERT em `produtos`, escrito só
 *  para esta tela, seria uma segunda regra de cadastro convivendo com a
 *  primeira, e as duas divergiriam no primeiro ajuste.
 *
 *  Três coisas o formulário não decide sozinho:
 *
 *  §17 — o código. Gerar RESERVA no banco antes de responder; digitar é
 *        conferido contra produtos, fila, loja e reservas.
 *  §24 — preço vazio entra como NULL, nunca R$ 0. Sem preço é um estado
 *        legítimo, e a venda já é bloqueada por ele lá na frente.
 *  §19 — a quantidade inicial vira um MOVIMENTO de entrada. Ninguém
 *        escreve `produtos.qtd`, nem aqui.
 */
export function NovoProduto({ conexao, categorias, aoCancelar, aoCriado }: Props) {
  const [sku, setSku] = useState('');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('');
  const [preco, setPreco] = useState('');
  const [qtd, setQtd] = useState('');

  /* Variações desligadas por padrão, e isso é a decisão: a maioria das
     peças não tem variação, e um formulário que já abre pedindo "Cor" e
     "Tamanho" ensina a preencher qualquer coisa para poder seguir. */
  const [temVariacao, setTemVariacao] = useState(false);
  const [atributos, setAtributos] = useState<Atributo[]>([{ nome: '', valores: '' }]);
  const [qtds, setQtds] = useState<Record<string, string>>({});

  const [checagem, setChecagem] = useState<Checagem | null>(null);
  const [checando, setChecando] = useState(false);
  const [laudo, setLaudo] = useState<Laudo | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState('');
  const [recado, setRecado] = useState('');

  const combinacoes = temVariacao ? combinar(atributos).combinacoes : [];
  /* Com variações, a quantidade é a SOMA delas — nunca as duas coisas ao
     mesmo tempo. Os dois campos juntos produzem a pergunta que ninguém
     sabe responder ("inicial 6, soma 4, qual vale?"), e a resposta errada
     some com duas peças de verdade. */
  const somaVariacoes = combinacoes.reduce((s, c) => s + (parseInt(qtds[c.nome] ?? '', 10) || 0), 0);
  const qtdFinal = temVariacao ? somaVariacoes : (parseInt(qtd, 10) || 0);

  /* Espera a pessoa parar de digitar. Sem isso seria uma requisição por
     tecla, e a resposta da penúltima chegaria depois da última. */
  const geracao = useRef(0);
  useEffect(() => {
    const bruto = sku.trim();
    if (!bruto) { setChecagem(null); setChecando(false); return; }
    setChecando(true);
    const meu = ++geracao.current;
    const t = setTimeout(async () => {
      try {
        const r = await chamar<Checagem>(
          conexao, 'GET', `/api/produtos/sku/checar?sku=${encodeURIComponent(bruto)}`,
        );
        if (meu === geracao.current) setChecagem(r);
      } catch {
        /* Conferir o código é conveniência. Falhar aqui não pode impedir
           o cadastro: a trava real está no backend e no índice único. */
        if (meu === geracao.current) setChecagem(null);
      } finally {
        if (meu === geracao.current) setChecando(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [sku, conexao]);

  const bloqueado = (checagem?.bloqueiam ?? []).length > 0;
  const formatoOk = SEIS_NUMEROS.test(sku.trim());

  async function gerar() {
    setErro('');
    setTrabalhando(true);
    try {
      const r = await chamar<{ ok?: boolean; sku?: string; erro?: string }>(
        conexao, 'POST', '/api/produtos/sku/gerar', { origem: 'cadastro-manual' },
      );
      if (!r.ok || !r.sku) { setErro(r.erro || 'Não foi possível gerar um código.'); return; }
      setSku(r.sku);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar um código.');
    } finally {
      setTrabalhando(false);
    }
  }

  async function conferir() {
    setErro('');
    const codigo = sku.trim().toUpperCase();
    if (!codigo || !desc.trim()) { setErro('Preencha o código e o nome da peça.'); return; }
    if (!formatoOk) { setErro('O código digitado à mão precisa ter 6 números (§17).'); return; }
    if (temVariacao && !combinacoes.length) {
      setErro('Escreva um atributo com pelo menos um valor, ou desligue "Variações".');
      return;
    }

    setTrabalhando(true);
    try {
      const r = await chamar<Laudo>(conexao, 'POST', '/api/produtos/novos/analisar', {
        origem: 'manual',
        produtos: [{
          sku: codigo,
          desc: desc.trim(),
          cat,
          /* Vazio é AUSENTE, não zero (§24). O backend reconhece os dois
             campos; mandar o texto cru é o que deixa "12,90" virar 12.9
             pela mesma regra que a planilha usa. */
          preco: preco.trim() === '' ? null : preco.trim(),
          qtd: qtdFinal,
          brutoPreco: preco.trim(),
          brutoQtd: String(qtdFinal),
        }],
      });
      setLaudo(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui conferir este cadastro.');
    } finally {
      setTrabalhando(false);
    }
  }

  async function cadastrar() {
    const item = laudo?.prontos.itens[0];
    if (!item) return;
    setErro('');
    setTrabalhando(true);
    try {
      const r = await chamar<{ criados?: number; ignorados?: { sku: string; motivo: string }[]; erro?: string }>(
        conexao, 'POST', '/api/produtos/novos/cadastrar', { origem: 'manual', produtos: [item] },
      );
      if (r.erro) { setErro(r.erro); return; }
      if (!r.criados) {
        const i = r.ignorados?.[0];
        setErro(i ? `${i.sku}: ${MOTIVOS[i.motivo] ?? i.motivo}` : 'Nada foi cadastrado.');
        return;
      }

      /* A peça JÁ existe. Daqui para a frente, o que falhar não desfaz o
         cadastro — e dizer "não deu" seria mentira. Cada passo seguinte
         relata o que ficou pendente, com o nome da tela que resolve. */
      if (temVariacao) {
        const pendente = await aplicarVariacoes(item.sku, item.qtd);
        if (pendente) {
          aoCriado(item.sku);
          return;
        }
      }
      aoCriado(item.sku);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui cadastrar.');
    } finally {
      setTrabalhando(false);
    }
  }

  /** Estrutura e divisão, aplicadas sobre o código que acabou de existir,
   *  pelas MESMAS rotas que a tela de Pendências usa. Devolve `true` quando
   *  algo ficou para depois — e nesse caso o recado já foi dado. */
  async function aplicarVariacoes(codigo: string, total: number): Promise<boolean> {
    const { atributos: limpos } = combinar(atributos);
    try {
      const estrutura = await chamar<{ combinacoes?: { nome: string; varianteId: string | null }[] }>(
        conexao, 'PUT', `/api/produtos/${encodeURIComponent(codigo)}/variacoes`,
        { atributos: limpos },
      );
      const distribuicao = (estrutura.combinacoes ?? [])
        .filter((c) => c.varianteId)
        .map((c) => ({ varianteId: c.varianteId, qtd: Math.max(0, parseInt(qtds[c.nome] ?? '', 10) || 0) }));
      const soma = distribuicao.reduce((s, d) => s + d.qtd, 0);
      if (soma !== total) {
        /* Não deveria acontecer: a quantidade cadastrada É a soma. Se
           acontecer, a estrutura fica gravada e a divisão espera em
           Pendências — melhor um produto que aparece lá do que uma
           divisão que esta tela inventou. */
        setRecado(`${codigo} foi cadastrado e a estrutura salva, mas a divisão ficou pendente `
          + `(soma ${soma}, total ${total}). Ela espera em Estoque › Pendências.`);
        return true;
      }
      await chamar(conexao, 'POST', `/api/produtos/${encodeURIComponent(codigo)}/variacoes/distribuir`, { distribuicao });
      return false;
    } catch (e) {
      setRecado(`${codigo} foi cadastrado, mas as variações não: `
        + `${e instanceof Error ? e.message : 'erro ao gravar a estrutura'}. `
        + 'A peça já está no catálogo e a estrutura pode ser definida em "Ver variações".');
      return true;
    }
  }

  const jaExiste = laudo?.jaExistem.itens[0];
  const emRevisao = laudo?.revisao.itens[0];
  const pronto = laudo?.prontos.itens[0];

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoCancelar} />
      <div className="mq-modal mq-modal--wide" role="dialog" aria-modal="true" aria-label="Novo produto">
        <div className="mq-modal__head">
          <div>
            <p className="mq-eyebrow">Cadastro e edição</p>
            <h2 className="mq-title">Novo produto</h2>
            <p className="mq-lede">
              A peça nasce com código, nome e o saldo que você tem hoje. Foto e
              publicação vêm depois, no cadastro dela.
            </p>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoCancelar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-modal__body">
          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
          {recado && <p className="mq-note mq-note--warn"><span>{recado}</span></p>}

          <div className="mq-form-grid">
            <label className="mq-field mq-field--wide">
              <span>Código</span>
              <div className="mq-row">
                <input
                  className="mq-input mq-input--grow"
                  value={sku}
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="6 números"
                  onChange={(e) => { setSku(e.target.value); setLaudo(null); }}
                />
                <button type="button" className="mq-btn mq-btn--secondary" onClick={gerar} disabled={trabalhando}>
                  Gerar código
                </button>
              </div>
              <RecadoDoSku
                sku={sku}
                checando={checando}
                checagem={checagem}
                formatoOk={formatoOk}
              />
            </label>

            <label className="mq-field mq-field--wide">
              <span>Nome da peça</span>
              <input
                className="mq-input"
                value={desc}
                onChange={(e) => { setDesc(e.target.value); setLaudo(null); }}
                placeholder="Anel Solitário Zircônia"
              />
            </label>

            <label className="mq-field">
              <span>Categoria</span>
              <select className="mq-input" value={cat} onChange={(e) => { setCat(e.target.value); setLaudo(null); }}>
                <option value="">Sem categoria</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            <label className="mq-field">
              <span>Preço</span>
              <input
                className="mq-input"
                value={preco}
                inputMode="decimal"
                placeholder="em branco = sem preço"
                onChange={(e) => { setPreco(e.target.value); setLaudo(null); }}
              />
              <small>§24: em branco entra como SEM PREÇO, nunca R$ 0.</small>
            </label>

            {!temVariacao && (
              <label className="mq-field">
                <span>Quantidade inicial</span>
                <input
                  className="mq-input"
                  value={qtd}
                  inputMode="numeric"
                  placeholder="0"
                  onChange={(e) => { setQtd(e.target.value); setLaudo(null); }}
                />
                <small>§19: entra como movimento de entrada, não como número digitado.</small>
              </label>
            )}
          </div>

          <label className="mq-check">
            <input
              type="checkbox"
              checked={temVariacao}
              onChange={(e) => { setTemVariacao(e.target.checked); setLaudo(null); }}
            />
            <span>
              <b>Esta peça tem variações</b>
              <small>
                Aro, cor, banho — o que a peça realmente tem. Ligando, a
                quantidade passa a ser a soma das variações.
              </small>
            </span>
          </label>

          {temVariacao && (
            <Variacoes
              atributos={atributos}
              aoMudar={(a) => { setAtributos(a); setLaudo(null); }}
              combinacoes={combinacoes}
              qtds={qtds}
              aoMudarQtd={(nome, v) => { setQtds((q) => ({ ...q, [nome]: v })); setLaudo(null); }}
              soma={somaVariacoes}
            />
          )}

          {/* O LAUDO. É a mesma conferência da importação de planilha, com
              uma linha só: nada é criado antes de a pessoa ver o que vai
              ser criado. */}
          {laudo && (
            <section className="mq-card mq-card--flush">
              <div className="mq-card__head">
                <div><h3 className="mq-subtitle">Confira antes de criar</h3></div>
              </div>
              <div className="mq-card__body mq-stack mq-stack--tight">
                {pronto && (
                  <>
                    <dl className="mq-figures">
                      <div><dt>Código</dt><dd>{pronto.sku}</dd></div>
                      <div><dt>Nome</dt><dd>{pronto.desc}</dd></div>
                      <div><dt>Categoria</dt><dd>{pronto.cat}</dd></div>
                      <div><dt>Preço</dt><dd>{pronto.preco === null ? 'sem preço' : `R$ ${pronto.preco}`}</dd></div>
                      <div><dt>Quantidade</dt><dd>{pronto.qtd}</dd></div>
                    </dl>
                    {(pronto.alertas ?? []).includes('ja_na_loja') && (
                      <p className="mq-note"><span>
                        Este código já existe na Nuvemshop
                        {pronto.naLoja?.[0]?.produto ? ` como "${pronto.naLoja[0].produto}"` : ''}.
                        Cadastrar aqui é o que casa os dois lados.
                      </span></p>
                    )}
                  </>
                )}
                {jaExiste && (
                  <p className="mq-note mq-note--risk" role="alert"><span>
                    <b>{jaExiste.sku} já está no catálogo</b>
                    {jaExiste.desc ? ` como "${jaExiste.desc}"` : ''}. Este fluxo cria
                    peças novas e nunca altera cadastro existente — abra a peça em
                    Cadastro de produtos para editá-la.
                  </span></p>
                )}
                {emRevisao && (
                  <p className="mq-note mq-note--risk" role="alert"><span>
                    <b>Falta corrigir:</b>{' '}
                    {emRevisao.motivos.map((m) => MOTIVOS[m] ?? m).join(' · ')}
                  </span></p>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="mq-modal__foot">
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoCancelar}>
            Cancelar
          </button>
          {pronto ? (
            <button type="button" className="mq-btn mq-btn--primary" onClick={cadastrar} disabled={trabalhando}>
              {trabalhando ? 'Cadastrando…' : 'Criar produto'}
            </button>
          ) : (
            <button
              type="button"
              className="mq-btn mq-btn--primary"
              onClick={conferir}
              disabled={trabalhando || bloqueado || !sku.trim() || !desc.trim()}
            >
              {trabalhando ? 'Conferindo…' : 'Conferir e criar'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** O recado embaixo do código, enquanto se digita.
 *
 *  Dizer ONDE o código já é usado, e não só "ocupado": bloquear sem dizer
 *  onde obriga a caçar o duplicado à mão no meio de centenas de peças. */
function RecadoDoSku({ sku, checando, checagem, formatoOk }: {
  sku: string; checando: boolean; checagem: Checagem | null; formatoOk: boolean;
}) {
  if (!sku.trim()) return null;
  if (checando) return <small className="sku-recado checando">Conferindo…</small>;
  if (!formatoOk) {
    return <small className="sku-recado ocupado">O código deve ter 6 números.</small>;
  }
  if (!checagem) return null;

  const bloqueia = (checagem.bloqueiam ?? [])[0];
  if (bloqueia) {
    return (
      <small className="sku-recado ocupado">
        {`"${checagem.sku}" já é de `}
        {bloqueia.desc || 'outra peça'} no catálogo.
      </small>
    );
  }
  /* Estar na loja NÃO impede cadastrar — é o contrário: é assim que os dois
     lados se casam. Vira aviso, com o produto nomeado. */
  const naLoja = (checagem.avisos ?? []).find((u) => u.onde === 'loja_variantes');
  if (naLoja) {
    return (
      <small className="sku-recado aviso">
        {`"${checagem.sku}" já existe na Nuvemshop`}
        {naLoja.produto ? ` como "${naLoja.produto}"` : ''}
        {naLoja.variacao ? ` (${naLoja.variacao})` : ''}. Cadastrar aqui vai casar os dois.
      </small>
    );
  }
  const naFila = (checagem.avisos ?? []).find((u) => u.onde === 'produtos_pendentes');
  if (naFila) {
    return <small className="sku-recado aviso">{`"${checagem.sku}" está na fila de peças novas.`}</small>;
  }
  return <small className="sku-recado livre">{`"${checagem.sku}" está livre.`}</small>;
}

/** Os atributos e as combinações que eles produzem.
 *
 *  Atributo é livre: quem vende por "Banho" e "Pedra" escreve "Banho" e
 *  "Pedra". Uma lista fixa de Cor/Tamanho obrigaria a operação a mentir
 *  para caber no formulário. */
function Variacoes({ atributos, aoMudar, combinacoes, qtds, aoMudarQtd, soma }: {
  atributos: Atributo[];
  aoMudar: (a: Atributo[]) => void;
  combinacoes: { nome: string }[];
  qtds: Record<string, string>;
  aoMudarQtd: (nome: string, v: string) => void;
  soma: number;
}) {
  return (
    <section className="mq-card mq-card--flush variacoes-novo">
      <div className="mq-card__head">
        <div>
          <h3 className="mq-subtitle">Variações</h3>
          <p className="mq-lede">Um atributo por linha, valores separados por vírgula.</p>
        </div>
        <button
          type="button"
          className="mq-btn mq-btn--secondary mq-btn--sm"
          onClick={() => aoMudar([...atributos, { nome: '', valores: '' }])}
        >
          <Icone nome="plus" />
          Atributo
        </button>
      </div>
      <div className="mq-card__body mq-stack mq-stack--tight">
        {atributos.map((a, i) => (
          <div className="mq-row" key={i}>
            <input
              className="mq-input"
              placeholder="Aro"
              value={a.nome}
              onChange={(e) => aoMudar(atributos.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))}
            />
            <input
              className="mq-input mq-input--grow"
              placeholder="16, 17, 18, 19"
              value={a.valores}
              onChange={(e) => aoMudar(atributos.map((x, j) => (j === i ? { ...x, valores: e.target.value } : x)))}
            />
            {atributos.length > 1 && (
              <button
                type="button"
                className="mq-btn mq-btn--ghost mq-btn--sm"
                aria-label={`Remover atributo ${i + 1}`}
                onClick={() => aoMudar(atributos.filter((_, j) => j !== i))}
              >
                Remover
              </button>
            )}
          </div>
        ))}

        {combinacoes.length > 0 && (
          <>
            <div className="mq-table" role="table" aria-label="Quantidade por variação">
              {combinacoes.map((c) => (
                <div className="mq-tr" role="row" key={c.nome}>
                  <span className="mq-cell"><b>{c.nome}</b></span>
                  <span className="mq-cell mq-cell--num">
                    <input
                      className="mq-input mq-input--num"
                      inputMode="numeric"
                      aria-label={`Quantidade de ${c.nome}`}
                      value={qtds[c.nome] ?? ''}
                      onChange={(e) => aoMudarQtd(c.nome, e.target.value)}
                    />
                  </span>
                </div>
              ))}
            </div>
            <p className="mq-note"><span>
              <b>Quantidade da peça: {soma}.</b> Com variações, o total é a soma
              delas — os dois números ao mesmo tempo produziriam a pergunta que
              ninguém sabe responder.
            </span></p>
          </>
        )}
      </div>
    </section>
  );
}
