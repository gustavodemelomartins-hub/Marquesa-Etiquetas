import { useState } from 'react';
import { chamar, type Connection } from '../../services/client';
import { money } from '../../domain/formato';
import { EnviarFoto } from '../catalogo/EnviarFoto';
import type { ModuloId } from '../../app/modulos';
import type { Pendencia } from './PendenciasArea';

interface Props {
  conexao: Connection;
  p: Pendencia;
  categorias: string[];
  /** Resolvido: recarrega a lista (o caso some sozinho, porque ela é
   *  derivada do estado) e o estado compartilhado. `recado` vai para o
   *  aviso no alto da tela. */
  aoResolver: (recado: string) => void;
  aoIr: (modulo: ModuloId, sub?: string) => void;
  /** Mostrar outra pendência do mesmo código (a da maleta). */
  aoBuscar: (texto: string) => void;
}

const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Não consegui salvar.');

/** Resposta que diz "não" com status 200 (`{erro}`), comum nas rotas
 *  antigas de catálogo e foto. Tratada igual a uma recusa. */
function recusou(r: unknown): string | null {
  if (r && typeof r === 'object' && 'erro' in r && (r as { erro?: unknown }).erro) {
    return String((r as { erro: unknown }).erro);
  }
  return null;
}

/** O FORMULÁRIO DE RESOLVER, aberto dentro da própria linha.
 *
 *  Um caso de cada tipo, cada um com a rota que JÁ existia no servidor —
 *  esta tela não inventa regra: escolher a variação é identidade (nada sai
 *  do estoque de novo), distribuir tem de fechar a soma, e o que não se
 *  sabe continua em "Revisar depois". Antes, só o painel clássico tinha os
 *  botões; a V2 listava e mandava para lá. */
export function ResolverPendencia({ conexao, p, categorias, aoResolver, aoIr, aoBuscar }: Props) {
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function executar(acao: () => Promise<unknown>, recado: string) {
    setErro('');
    setOcupado(true);
    try {
      const r = await acao();
      const nao = recusou(r);
      if (nao) setErro(nao);
      else aoResolver(recado);
    } catch (e) {
      setErro(erroDe(e));
    } finally {
      setOcupado(false);
    }
  }

  const falhou = erro ? <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p> : null;

  /* ─── catálogo: completar o cadastro ali mesmo */
  if (p.motivo === 'falta_informacao' && p.sku) {
    return (
      <div className="mq-pend__form">
        <CompletarCadastro
          conexao={conexao} p={p} categorias={categorias}
          ocupado={ocupado} executar={executar}
        />
        {falhou}
        <button type="button" className="mq-btn mq-btn--link mq-btn--sm" onClick={() => aoIr('estoque', `peca:${p.sku}`)}>
          Abrir a ficha da peça
        </button>
      </div>
    );
  }

  if (p.motivo === 'preparando' && p.sku) {
    return (
      <div className="mq-pend__form">
        <p className="mq-hint">A foto com fundo branco e o texto da loja ainda estão sendo preparados.</p>
        <div className="mq-btns">
          <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado}
            onClick={() => executar(() => chamar(conexao, 'POST', `/api/catalogo/publicacao/${encodeURIComponent(p.sku!)}/preparar`, {}),
              `${p.sku}: preparação pedida`)}>
            Preparar de novo
          </button>
          <button type="button" className="mq-btn mq-btn--link mq-btn--sm" onClick={() => aoIr('nuvemshop', 'publicacao')}>
            Abrir Publicar peças
          </button>
        </div>
        {falhou}
      </div>
    );
  }

  if (p.motivo === 'falhou' && p.sku) {
    return (
      <div className="mq-pend__form">
        <p className="mq-hint">A última tentativa de publicar não terminou. Tentar de novo refaz o envio com os mesmos dados aprovados.</p>
        <div className="mq-btns">
          <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado}
            onClick={() => executar(() => chamar(conexao, 'POST', `/api/catalogo/publicacao/${encodeURIComponent(p.sku!)}/repetir`, {}),
              `${p.sku}: nova tentativa preparada`)}>
            Tentar de novo
          </button>
          <button type="button" className="mq-btn mq-btn--link mq-btn--sm" onClick={() => aoIr('nuvemshop', 'publicacao')}>
            Abrir Publicar peças
          </button>
        </div>
        {falhou}
      </div>
    );
  }

  /* ─── produto novo da planilha, esperando virar peça */
  if (p.motivo === 'cadastro_pendente' && p.sku) {
    return (
      <div className="mq-pend__form">
        <p className="mq-hint">
          {p.produto} · {p.cat || 'sem categoria'} · {p.preco == null ? 'sem preço' : money(p.preco)} · {p.qtd ?? 0} em casa
        </p>
        <div className="mq-btns">
          <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado}
            onClick={() => executar(() => chamar(conexao, 'POST', '/api/produtos/novos/cadastrar', {
              origem: 'fila',
              produtos: [{ sku: p.sku, desc: p.produto, cat: p.cat, preco: p.preco, qtd: p.qtd ?? 0 }],
            }).then((r) => {
              const x = r as { criados?: number; ignorados?: { motivo: string }[] };
              if (!x.criados) return { erro: `Não cadastrado: ${x.ignorados?.[0]?.motivo ?? 'motivo desconhecido'}` };
              return x;
            }), `${p.sku} cadastrada`)}>
            Cadastrar a peça
          </button>
          <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" disabled={ocupado}
            onClick={() => executar(() => chamar(conexao, 'DELETE', '/api/produtos/pendentes', { skus: [p.sku] }),
              `${p.sku} descartada da fila`)}>
            Descartar
          </button>
        </div>
        {falhou}
      </div>
    );
  }

  /* ─── foto da loja sem dono */
  if (p.motivo === 'foto_sem_correspondencia' && p.fotoOrfaId) {
    return <FotoSemDono conexao={conexao} p={p} ocupado={ocupado} executar={executar} erro={falhou} />;
  }

  /* ─── qual variação saiu na venda */
  if (p.motivo === 'variacao_da_venda' && p.vendaId && p.sku) {
    return <EscolherVariacao conexao={conexao} p={p} ocupado={ocupado} executar={executar} erro={falhou} />;
  }

  /* ─── quantas de cada variação estão na maleta */
  if (p.motivo === 'variacao_da_maleta' && p.maletaId && p.sku) {
    return <VariacoesDaMaleta conexao={conexao} p={p} ocupado={ocupado} executar={executar} erro={falhou} />;
  }

  /* ─── repartir o estoque entre as variações */
  if (p.tipo === 'variacao' && p.motivo === 'sem_reparticao' && p.sku) {
    return <Repartir conexao={conexao} p={p} ocupado={ocupado} executar={executar} erro={falhou} />;
  }

  /* ─── o mesmo código, visto pela maleta: resolve-se lá */
  if (p.tipo === 'variacao' && p.motivo === 'maleta' && p.sku) {
    return (
      <div className="mq-pend__form">
        <p className="mq-hint">
          Este aviso some sozinho quando você disser, na pendência da maleta,
          qual variação está com a revendedora. É o mesmo caso visto de outro lado.
        </p>
        <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" onClick={() => aoBuscar(p.sku!)}>
          Mostrar a pendência da maleta
        </button>
      </div>
    );
  }

  if (p.tipo === 'variacao' && p.sku) {
    return (
      <div className="mq-pend__form">
        <p className="mq-hint">{p.informacaoFaltante || p.explicacao}</p>
        <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" onClick={() => aoIr('estoque', `peca:${p.sku}`)}>
          Abrir a peça e conferir as variações
        </button>
      </div>
    );
  }

  /* ─── venda que não chegou à loja online */
  if (p.tipo === 'nuvemshop' && p.vendaId) {
    return <ReenviarParaLoja conexao={conexao} p={p} ocupado={ocupado} executar={executar} erro={falhou} />;
  }

  /* ─── nome da planilha parecido com uma cliente */
  if (p.motivo === 'vinculo_em_duvida' && p.revisaoId) {
    return (
      <div className="mq-pend__form">
        <p className="mq-hint">
          Na planilha: <b>{p.cliente}</b> ({p.qtd ?? 0} {p.qtd === 1 ? 'linha' : 'linhas'}).
          {p.candidato ? <> Parecida com a cliente <b>{p.candidato}</b>{p.candidatoTelefone ? ` · ${p.candidatoTelefone}` : ''}.</> : ' Nenhum cadastro candidato.'}
        </p>
        <div className="mq-btns">
          {p.candidatoId ? (
            <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado}
              onClick={() => executar(() => chamar(conexao, 'POST', `/api/clientes/revisao/${p.revisaoId}`, {
                decisao: 'vincular', clienteId: p.candidatoId,
              }), `${p.cliente} ligada a ${p.candidato}`)}>
              É a mesma pessoa
            </button>
          ) : null}
          <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" disabled={ocupado}
            onClick={() => executar(() => chamar(conexao, 'POST', `/api/clientes/revisao/${p.revisaoId}`, {
              decisao: 'separar',
            }), `${p.cliente} mantida como pessoa diferente`)}>
            São pessoas diferentes
          </button>
        </div>
        {falhou}
      </div>
    );
  }

  /* ─── troca de garantia com crédito sem lançar */
  if (p.tipo === 'garantia') {
    return (
      <div className="mq-pend__form">
        <p className="mq-hint">{p.explicacao}</p>
        <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" onClick={() => aoIr('garantias')}>
          Abrir Garantias
        </button>
      </div>
    );
  }

  /* ─── operação da planilha marcada para revisão */
  if (p.motivo === 'operacao_em_revisao' && p.vendaChave) {
    return <OperacaoDaPlanilha conexao={conexao} p={p} ocupado={ocupado} executar={executar} erro={falhou} />;
  }

  return (
    <div className="mq-pend__form">
      <p className="mq-hint">{p.informacaoFaltante || p.explicacao}</p>
    </div>
  );
}

/* ═════════════════════════════════════════════════════ as partes */

interface Parte {
  conexao: Connection;
  p: Pendencia;
  ocupado: boolean;
  executar: (acao: () => Promise<unknown>, recado: string) => Promise<void>;
  erro?: React.ReactNode;
}

function CompletarCadastro({ conexao, p, categorias, ocupado, executar }: Parte & { categorias: string[] }) {
  const falta = p.falta ?? [];
  const [preco, setPreco] = useState('');
  const [cat, setCat] = useState('');
  const precisaPreco = falta.includes('preco');
  const precisaCat = falta.includes('categoria');
  const precisaFoto = falta.includes('foto');

  async function salvarDados() {
    const corpo: Record<string, unknown> = {};
    if (precisaPreco && preco.trim()) {
      const n = Number(preco.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) throw new Error('Digite o preço em reais.');
      corpo.preco = n;
    }
    if (precisaCat && cat) corpo.cat = cat;
    if (!Object.keys(corpo).length) throw new Error('Preencha o que falta antes de salvar.');
    return chamar(conexao, 'PATCH', `/api/produtos/${encodeURIComponent(p.sku!)}`, corpo);
  }

  return (
    <>
      {(precisaPreco || precisaCat) && (
        <div className="mq-pend__campos">
          {precisaPreco && (
            <label className="mq-field">
              <span>Preço de venda</span>
              <span className="mq-money-input">
                <input className="mq-input" type="number" min={0} step="0.01" inputMode="decimal"
                  value={preco} onChange={(e) => setPreco(e.target.value)}
                  aria-label={`Preço de ${p.sku}`} />
              </span>
            </label>
          )}
          {precisaCat && (
            <label className="mq-field">
              <span>Categoria</span>
              <select className="mq-select" value={cat} onChange={(e) => setCat(e.target.value)}
                aria-label={`Categoria de ${p.sku}`}>
                <option value="">Escolha…</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado}
            onClick={() => executar(salvarDados, `${p.sku}: cadastro salvo`)}>
            Salvar
          </button>
        </div>
      )}
      {precisaFoto && (
        <EnviarFoto
          conexao={conexao}
          sku={p.sku!}
          compacto
          aoEnviar={() => void executar(async () => ({ ok: true }), `${p.sku}: foto enviada`)}
        />
      )}
    </>
  );
}

function FotoSemDono({ conexao, p, ocupado, executar, erro }: Parte) {
  const [sku, setSku] = useState('');
  return (
    <div className="mq-pend__form">
      {p.fotoUrl && <img className="mq-pend__foto" src={p.fotoUrl} alt="Foto sem peça correspondente" />}
      <div className="mq-pend__campos">
        <label className="mq-field">
          <span>Código correto da peça</span>
          <input className="mq-input" value={sku} placeholder="Ex.: 647729" onChange={(e) => setSku(e.target.value)} />
        </label>
        <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado || !sku.trim()}
          onClick={() => executar(() => chamar(conexao, 'POST', '/api/fotos/orfas/adotar', { id: p.fotoOrfaId, sku: sku.trim() }),
            `Foto ligada a ${sku.trim()}`)}>
          Ligar a foto
        </button>
      </div>
      {erro}
    </div>
  );
}

function SemVariacao({ sku }: { sku: string }) {
  return (
    <p className="mq-note mq-note--warn">
      <span>
        <b>{sku} não tem variação cadastrada.</b> Cadastre as variações na
        ficha da peça antes — aqui se escolhe entre as que existem.
      </span>
    </p>
  );
}

function EscolherVariacao({ conexao, p, ocupado, executar, erro }: Parte) {
  const vars = p.variacoesPossiveis ?? [];
  const [escolha, setEscolha] = useState(vars[0]?.nome ?? '');
  if (!vars.length) return <div className="mq-pend__form"><SemVariacao sku={p.sku!} /></div>;
  return (
    <div className="mq-pend__form">
      <p className="mq-hint">Qual variação saiu nesta venda? Escolher não baixa estoque de novo — a peça já saiu.</p>
      <div className="mq-pend__opcoes" role="radiogroup" aria-label="Variação vendida">
        {vars.map((v) => (
          <label key={v.nome} className="mq-pend__opcao">
            <input type="radio" name={`pv-${p.chave}`} value={v.nome} aria-label={v.nome}
              checked={escolha === v.nome} onChange={() => setEscolha(v.nome)} />
            <span>{v.nome}</span>
            <small>tem {v.saldo}{v.estoqueLoja != null ? ` · loja ${v.estoqueLoja}` : ''}</small>
          </label>
        ))}
      </div>
      <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado || !escolha}
        onClick={() => executar(() => chamar(conexao, 'POST', '/api/pendencias/variacao/venda', {
          vendaId: p.vendaId, sku: p.sku, itemId: p.itemId ?? undefined, variacao: escolha,
        }), `${p.sku}: variação da venda registrada`)}>
        Salvar variação
      </button>
      {erro}
    </div>
  );
}

function Quantidades({
  p, valores, mudar,
}: { p: Pendencia; valores: Record<string, string>; mudar: (nome: string, v: string) => void }) {
  return (
    <div className="mq-pend__opcoes">
      {(p.variacoesPossiveis ?? []).map((v) => (
        <label key={v.nome} className="mq-pend__opcao mq-pend__opcao--qtd">
          <span>{v.nome}</span>
          <small>tem {v.saldo}{v.estoqueLoja != null ? ` · loja ${v.estoqueLoja}` : ''}</small>
          <input className="mq-input" type="number" min={0} step={1} inputMode="numeric"
            value={valores[v.nome] ?? ''} placeholder="0"
            aria-label={`Quantas ${v.nome}`}
            onChange={(e) => mudar(v.nome, e.target.value)} />
        </label>
      ))}
    </div>
  );
}

function VariacoesDaMaleta({ conexao, p, ocupado, executar, erro }: Parte) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const vars = p.variacoesPossiveis ?? [];
  if (!vars.length) return <div className="mq-pend__form"><SemVariacao sku={p.sku!} /></div>;
  const distribuicao = vars
    .map((v) => ({ variacao: v.nome, qtd: Math.max(0, Math.floor(Number(valores[v.nome] || 0))) }))
    .filter((d) => d.qtd > 0);
  const soma = distribuicao.reduce((n, d) => n + d.qtd, 0);
  return (
    <div className="mq-pend__form">
      <p className="mq-hint">
        Quantas de cada variação estão com {p.revendedora ?? 'a revendedora'}?
        {p.fora != null ? ` Saíram ${p.fora}` : ''}{p.identificado ? `, já identificadas ${p.identificado}` : ''}.
        Nada sai do estoque de novo.
      </p>
      <Quantidades p={p} valores={valores} mudar={(n, v) => setValores((a) => ({ ...a, [n]: v }))} />
      <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado || soma === 0}
        onClick={() => executar(() => chamar(conexao, 'POST', '/api/pendencias/variacao/maleta', {
          maletaId: p.maletaId, sku: p.sku, distribuicao,
        }), `${p.sku}: variações da maleta registradas`)}>
        Salvar ({soma} de {p.qtd ?? 0})
      </button>
      {erro}
    </div>
  );
}

function Repartir({ conexao, p, ocupado, executar, erro }: Parte) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const vars = p.variacoesPossiveis ?? [];
  if (!vars.length) return <div className="mq-pend__form"><SemVariacao sku={p.sku!} /></div>;
  const total = p.qtd ?? 0;
  const linhas = vars.map((v) => ({ v, qtd: Math.max(0, Math.floor(Number(valores[v.nome] || 0))) }));
  const soma = linhas.reduce((n, l) => n + l.qtd, 0);
  const semId = linhas.some((l) => l.qtd > 0 && !l.v.varianteId);
  return (
    <div className="mq-pend__form">
      <p className="mq-hint">
        Conte as {total} peças e diga quantas são de cada variação. A soma precisa dar {total}.
        Isso diz qual é qual — o total do estoque não muda.
      </p>
      <Quantidades p={p} valores={valores} mudar={(n, v) => setValores((a) => ({ ...a, [n]: v }))} />
      {semId && <p className="mq-hint">Uma variação escolhida não existe na loja; ela será repartida só aqui.</p>}
      <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado || soma !== total}
        onClick={() => executar(() => chamar(conexao, 'POST', `/api/produtos/${encodeURIComponent(p.sku!)}/variacoes/distribuir`, {
          distribuicao: linhas.filter((l) => l.qtd > 0).map((l) => ({ varianteId: l.v.varianteId ?? '', qtd: l.qtd })),
        }), `${p.sku}: estoque repartido entre as variações`)}>
        {soma === total ? 'Salvar a repartição' : `A soma dá ${soma}, precisa dar ${total}`}
      </button>
      {erro}
    </div>
  );
}

function ReenviarParaLoja({ conexao, p, ocupado, executar, erro }: Parte) {
  const [pausa, setPausa] = useState<string | null>(null);

  async function enviar(forcar: boolean) {
    const r = await chamar<{ pausado?: { mudancas?: number; quantidade?: number }; status?: string; erro?: string }>(
      conexao, 'POST', `/api/vendas/${p.vendaId}/nuvemshop`, { forcar },
    );
    if (r.pausado && !forcar) {
      setPausa(String(r.pausado.mudancas ?? r.pausado.quantidade ?? 'muitos'));
      return { erro: 'A trava de segurança parou o envio. Confira abaixo.' };
    }
    if (r.status !== 'sincronizada' && r.status !== 'cancelada') {
      return { erro: r.erro || 'A loja ainda não confirmou. Tente de novo em alguns minutos.' };
    }
    return r;
  }

  return (
    <div className="mq-pend__form">
      <p className="mq-hint">{p.explicacao}</p>
      <div className="mq-btns">
        <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado}
          onClick={() => executar(() => enviar(false), `Venda #${p.vendaId}: estoque da loja atualizado`)}>
          Tentar de novo
        </button>
        {pausa && (
          <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" disabled={ocupado}
            onClick={() => executar(() => enviar(true), `Venda #${p.vendaId}: estoque da loja atualizado`)}>
            Conferi: aplicar mesmo assim ({pausa} produtos)
          </button>
        )}
      </div>
      {erro}
    </div>
  );
}

function OperacaoDaPlanilha({ conexao, p, ocupado, executar, erro }: Parte) {
  const [plano, setPlano] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [recusa, setRecusa] = useState('');
  const operacoes = [{ vendaChave: p.vendaChave, papel: 'cliente' }];

  /* Primeiro a rodada SECA: o servidor diz se a decisão fecha e devolve o
     hash do plano. Confirmar manda o hash de volta — se o banco mudou no
     meio, a escrita é recusada em vez de aplicar outra coisa. */
  async function conferir() {
    setRecusa('');
    setConferindo(true);
    try {
      const r = await chamar<{ planoHash?: string }>(conexao, 'POST', '/api/vendas/historico/operacoes', {
        operacoes, seco: true,
      });
      setPlano(r.planoHash ?? '');
    } catch (e) {
      setRecusa(erroDe(e));
    } finally {
      setConferindo(false);
    }
  }

  return (
    <div className="mq-pend__form">
      <p className="mq-hint">
        Esta linha da planilha está parada. Se foi uma venda para {p.cliente ?? 'a cliente'},
        ela passa a contar como venda (e, se ficou saldo, como conta a receber).
      </p>
      <div className="mq-btns">
        {plano === null ? (
          <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" disabled={ocupado || conferindo}
            onClick={conferir}>
            {conferindo ? 'Conferindo…' : 'Foi venda para a cliente — conferir'}
          </button>
        ) : (
          <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado}
            onClick={() => executar(() => chamar(conexao, 'POST', '/api/vendas/historico/operacoes', {
              operacoes, planoEsperado: plano || null,
            }), `${p.cliente ?? 'Operação'}: contada como venda`)}>
            Confirmar: contar como venda
          </button>
        )}
      </div>
      {recusa && <p className="mq-note mq-note--risk" role="alert"><span>{recusa}</span></p>}
      {erro}
    </div>
  );
}
