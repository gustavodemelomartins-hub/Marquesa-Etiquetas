import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { chamar, type Connection } from '../services/client';
import { Icone } from '../components/Icone';
import { money, fmtData } from '../domain/formato';
import type { NomeIcone } from '../components/Icone';
import type { AppState } from '../types/api';
import type { ModuloId } from './modulos';
import type { VendaFeitaApi } from '../features/vendas/tipos';

interface ClienteEncontrada {
  id: number;
  nome: string;
  tel: string;
  cidade: string;
}

export interface Achado {
  chave: string;
  tipo: 'cliente' | 'peca' | 'venda' | 'revendedora';
  rotulo: string;
  titulo: string;
  detalhe: string;
  icone: NomeIcone;
  /** Para onde ir DENTRO da V2. Nunca para o painel clássico. */
  destino: { modulo: ModuloId; sub: string | null };
}

interface Props {
  conexao: Connection;
  /** Peças e revendedoras já estão em memória — `GET /api/state` sobe no
   *  App e é a MESMA leitura que Estoque e Revendedoras usam. Buscar nelas
   *  aqui não custa uma requisição a mais. */
  estado: AppState | null;
  aoNavegar: (destino: { modulo: ModuloId; sub: string | null }) => void;
  /** No telefone, a lupa abre a busca: o cursor tem que ir junto. Sem isto
   *  eram dois toques — um na lupa, outro no campo. */
  focar?: boolean;
}

type EstadoBusca = 'inicial' | 'buscando' | 'pronto' | 'erro';

const LIMITE_POR_TIPO = 4;

/** BUSCA GLOBAL — quatro coisas que a usuária procura pelo nome.
 *
 *  Antes, ela buscava só clientes e o resultado abria
 *  `dashboard.html?clienteId=…`: um clique na V2 saía da V2. Era o caminho
 *  mais curto para alguém concluir que o sistema novo não tem Clientes.
 *
 *  O que ela cobre, e por quê cada um cabe num contrato que JÁ existe:
 *
 *    cliente      `GET /api/clientes?busca=`      identidade forte, por id
 *    venda        `GET /api/vendas/feitas?busca=`  o backend já busca por
 *                                                 cliente, peça e código
 *    peça         `GET /api/state` (em memória)   sku e descrição
 *    revendedora  `GET /api/state` (em memória)   nome e cidade
 *
 *  O que ela NÃO cobre, e diz: garantia, maleta, inventário e conta a
 *  receber não têm rota de busca por termo. Inventá-las aqui exigiria ler
 *  listas inteiras a cada tecla — e §34 (o limite de leitura do D1 é da
 *  conta, e derruba DEV e produção juntos) é razão suficiente para não.
 */
export function BuscaGlobal({ conexao, estado, aoNavegar, focar = false }: Props) {
  const listaId = useId();
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focar) campo.current?.focus(); }, [focar]);
  const [termo, setTermo] = useState('');
  const [remotos, setRemotos] = useState<Achado[]>([]);
  const [estadoBusca, setEstadoBusca] = useState<EstadoBusca>('inicial');
  const [aberta, setAberta] = useState(false);
  const [ativa, setAtiva] = useState(-1);

  /* As peças e as revendedoras respondem na tecla, sem rede. */
  const locais = useMemo(() => acharLocais(termo, estado), [termo, estado]);

  useEffect(() => {
    const q = termo.trim();
    if (q.length < 2) {
      setRemotos([]);
      setEstadoBusca('inicial');
      setAtiva(-1);
      return;
    }

    const controle = new AbortController();
    const timer = window.setTimeout(async () => {
      setEstadoBusca('buscando');
      try {
        /* As duas em paralelo: em série, a lista de vendas — que é a mais
           lenta — atrasaria os nomes de cliente, que são o que a pessoa
           está esperando ver. */
        const [clientes, vendas] = await Promise.all([
          chamar<ClienteEncontrada[]>(
            conexao, 'GET',
            `/api/clientes?limite=${LIMITE_POR_TIPO}&busca=${encodeURIComponent(q)}`,
            undefined, { signal: controle.signal },
          ),
          chamar<{ vendas: VendaFeitaApi[] }>(
            conexao, 'GET',
            `/api/vendas/feitas?limite=${LIMITE_POR_TIPO}&busca=${encodeURIComponent(q)}`,
            undefined, { signal: controle.signal },
          ).catch(() => ({ vendas: [] as VendaFeitaApi[] })),
        ]);
        setRemotos([...deClientes(clientes), ...deVendas(vendas.vendas)]);
        setEstadoBusca('pronto');
        setAtiva(-1);
      } catch (erro) {
        if (erro instanceof DOMException && erro.name === 'AbortError') return;
        setRemotos([]);
        setEstadoBusca('erro');
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controle.abort();
    };
  }, [conexao, termo]);

  /* Código de peça digitado INTEIRO é a peça, antes de tudo: quem digita
     "100201" está com a etiqueta na mão. Antes, as vendas que citavam o
     código vinham primeiro e a própria peça aparecia por último. */
  const exato = termo.trim().toLowerCase();
  const pecaExata = locais.filter((a) => a.tipo === 'peca' && a.chave.toLowerCase() === `peca:${exato}`);
  const achados = [...pecaExata, ...remotos, ...locais.filter((a) => !pecaExata.includes(a))];

  function mover(direcao: 1 | -1) {
    if (!achados.length) return;
    setAtiva((atual) => (atual + direcao + achados.length) % achados.length);
  }

  function escolher(a: Achado) {
    setAberta(false);
    setTermo('');
    aoNavegar(a.destino);
  }

  const mostrarLista = aberta && (termo.trim().length < 2 || estadoBusca !== 'inicial' || locais.length > 0);
  const idAtivo = ativa >= 0 ? `${listaId}-opcao-${ativa}` : undefined;

  return (
    <div
      className="busca-global"
      onFocus={() => setAberta(true)}
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget)) setAberta(false);
      }}
    >
      {/* `mq-search` + `mq-input`: a MESMA forma do campo do protótipo —
          ícone dentro, à esquerda, e a pílula do design system. Estava num
          par de classes próprias (`busca-global-campo`) que desenhava um
          campo parecido, e "parecido" é o que fazia o cabeçalho não bater. */}
      <label className="mq-search busca-global-campo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="10.6" cy="10.6" r="6.4" />
          <path d="m15.4 15.4 4.4 4.4" />
        </svg>
        <input
          ref={campo}
          className="mq-input"
          type="search"
          value={termo}
          onChange={(evento) => {
            setTermo(evento.target.value);
            setAberta(true);
          }}
          onKeyDown={(evento) => {
            if (evento.key === 'Escape') {
              setAberta(false);
              evento.currentTarget.blur();
            } else if (evento.key === 'ArrowDown') {
              evento.preventDefault();
              mover(1);
            } else if (evento.key === 'ArrowUp') {
              evento.preventDefault();
              mover(-1);
            } else if (evento.key === 'Enter' && ativa >= 0) {
              evento.preventDefault();
              const a = achados[ativa];
              if (a) escolher(a);
            }
          }}
          /* O texto do protótipo. O `aria-label` continua dizendo as
             quatro coisas que a busca ACHA de verdade — encurtar a dica
             visual não encurta a capacidade. */
          placeholder="Buscar cliente, peça ou venda"
          aria-label="Buscar cliente, peça, venda ou revendedora"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-activedescendant={idAtivo}
        />
      </label>

      {mostrarLista && (
        <div className="busca-global-resultados" id={listaId} role="listbox" aria-label="Resultados da busca">
          {termo.trim().length < 2 && <p>Digite pelo menos 2 caracteres.</p>}
          {estadoBusca === 'buscando' && <p>Buscando…</p>}
          {estadoBusca === 'erro' && <p>Não consegui buscar agora.</p>}
          {estadoBusca === 'pronto' && achados.length === 0 && <p>Nada encontrado.</p>}

          {achados.map((a, indice) => (
            <button
              type="button"
              key={a.chave}
              id={`${listaId}-opcao-${indice}`}
              role="option"
              aria-selected={indice === ativa}
              onMouseEnter={() => setAtiva(indice)}
              onClick={() => escolher(a)}
            >
              <Icone nome={a.icone} />
              <b>{a.titulo}</b>
              <small>{a.rotulo} · {a.detalhe}</small>
            </button>
          ))}

          {achados.length > 0 && (
            <p className="busca-global-nota">
              Garantias, maletas e contas a receber se procuram dentro de cada
              módulo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────── os tradutores */

function deClientes(cs: ClienteEncontrada[]): Achado[] {
  return cs.slice(0, LIMITE_POR_TIPO).map((c) => ({
    chave: `cliente:${c.id}`,
    tipo: 'cliente' as const,
    rotulo: 'Cliente',
    titulo: c.nome,
    detalhe: [c.cidade, c.tel].filter(Boolean).join(' · ') || 'sem contato',
    icone: 'person' as NomeIcone,
    /* A ficha abre por ID — identidade forte, sem decidir por nome. */
    destino: { modulo: 'clientes' as ModuloId, sub: String(c.id) },
  }));
}

/** Uma venda por resultado — o servidor já devolve venda, não item. Até
 *  01/10/2026 este tradutor agrupava itens pela `referencia`, que nas vendas
 *  da planilha é a LINHA: a mesma compra aparecia uma vez por peça. */
function deVendas(vendas: VendaFeitaApi[]): Achado[] {
  return vendas.slice(0, LIMITE_POR_TIPO).map((v) => ({
    chave: `venda:${v.chave}`,
    tipo: 'venda' as const,
    rotulo: 'Venda',
    titulo: `${v.cliente ?? 'Cliente não identificada'} · ${
      v.financeiro.valorVenda === null ? '—' : money(v.financeiro.valorVenda / 100)}`,
    detalhe: `${fmtData(v.data)} · ${v.pecas} ${v.pecas === 1 ? 'peça' : 'peças'}`,
    icone: 'sale' as NomeIcone,
    destino: { modulo: 'vendas' as ModuloId, sub: 'historico' },
  }));
}

/** Sem acento e sem caixa — a MESMA régua que `normalizarNomeCliente` aplica
 *  no servidor. Sem isto, procurar "vitoria" não acha "Vitória": o lado
 *  remoto acharia e o local não, e a lista pareceria ter esquecido metade. */
const dobrar = (v: string) => String(v ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function acharLocais(termo: string, estado: AppState | null): Achado[] {
  const t = dobrar(termo.trim());
  if (t.length < 2 || !estado) return [];

  const pecas: Achado[] = estado.produtos
    .filter((p) => dobrar(p.sku).includes(t) || dobrar(p.desc).includes(t))
    .slice(0, LIMITE_POR_TIPO)
    .map((p) => ({
      chave: `peca:${p.sku}`,
      tipo: 'peca' as const,
      rotulo: 'Peça',
      titulo: p.desc,
      detalhe: `${p.sku} · ${p.disponivel} disponível · ${p.semPreco ? 'sem preço' : money(p.preco)}`,
      icone: 'box' as NomeIcone,
      /* Abre a FICHA da peça achada. Antes caía na lista inteira, e a
         peça que se buscou se perdia entre quase mil. */
      destino: { modulo: 'estoque' as ModuloId, sub: `peca:${p.sku}` },
    }));

  /* Inativa também é achada: a ficha dela guarda o histórico inteiro. */
  const revendedoras: Achado[] = estado.revendedoras
    .filter((r) => dobrar(r.nome).includes(t) || dobrar(r.cidade ?? '').includes(t))
    .slice(0, LIMITE_POR_TIPO)
    .map((r) => ({
      chave: `revendedora:${r.id}`,
      tipo: 'revendedora' as const,
      rotulo: 'Revendedora',
      titulo: r.nome,
      detalhe: [r.status === 'inativa' ? 'inativa' : null, r.cidade, r.tel].filter(Boolean).join(' · ') || 'sem contato',
      icone: 'bag' as NomeIcone,
      destino: { modulo: 'revendedoras' as ModuloId, sub: String(r.id) },
    }));

  return [...pecas, ...revendedoras];
}
