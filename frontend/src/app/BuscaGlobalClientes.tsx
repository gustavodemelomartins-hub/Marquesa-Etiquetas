import { useEffect, useId, useState } from 'react';
import { chamar, type Connection } from '../services/client';

interface ClienteEncontrada {
  id: number;
  nome: string;
  tel: string;
  cidade: string;
}

interface Props {
  conexao: Connection;
}

type EstadoBusca = 'inicial' | 'buscando' | 'pronto' | 'erro';

/** Busca operacional compartilhada pelo cabeçalho. Enquanto o módulo de
 * Clientes ainda vive no painel legado, cada resultado leva à ficha por ID —
 * identidade forte, sem tentar decidir por nome. */
export function BuscaGlobalClientes({ conexao }: Props) {
  const listaId = useId();
  const [termo, setTermo] = useState('');
  const [clientes, setClientes] = useState<ClienteEncontrada[]>([]);
  const [estado, setEstado] = useState<EstadoBusca>('inicial');
  const [aberta, setAberta] = useState(false);
  const [ativa, setAtiva] = useState(-1);

  useEffect(() => {
    const q = termo.trim();
    if (q.length < 2) {
      setClientes([]);
      setEstado('inicial');
      setAtiva(-1);
      return;
    }

    const controle = new AbortController();
    const timer = window.setTimeout(async () => {
      setEstado('buscando');
      try {
        const encontrados = await chamar<ClienteEncontrada[]>(
          conexao,
          'GET',
          `/api/clientes?limite=8&busca=${encodeURIComponent(q)}`,
          undefined,
          { signal: controle.signal },
        );
        setClientes(encontrados);
        setEstado('pronto');
        setAtiva(-1);
      } catch (erro) {
        if (erro instanceof DOMException && erro.name === 'AbortError') return;
        setClientes([]);
        setEstado('erro');
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controle.abort();
    };
  }, [conexao, termo]);

  function mover(direcao: 1 | -1) {
    if (!clientes.length) return;
    setAtiva((atual) => (atual + direcao + clientes.length) % clientes.length);
  }

  const mostrarLista = aberta && (termo.trim().length < 2 || estado !== 'inicial');
  const idAtivo = ativa >= 0 ? `${listaId}-opcao-${ativa}` : undefined;

  return (
    <div
      className="busca-global"
      onFocus={() => setAberta(true)}
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget)) setAberta(false);
      }}
    >
      <label className="busca-global-campo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input
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
              document.getElementById(`${listaId}-opcao-${ativa}`)?.click();
            }
          }}
          placeholder="Buscar cliente por nome ou telefone"
          aria-label="Buscar cliente por nome ou telefone"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-activedescendant={idAtivo}
        />
      </label>

      {mostrarLista && (
        <div className="busca-global-resultados" id={listaId} role="listbox" aria-label="Clientes encontrados">
          {termo.trim().length < 2 && <p>Digite pelo menos 2 caracteres.</p>}
          {estado === 'buscando' && <p>Buscando…</p>}
          {estado === 'erro' && <p>Não consegui buscar agora.</p>}
          {estado === 'pronto' && !clientes.length && <p>Nenhuma cliente encontrada.</p>}
          {estado === 'pronto' &&
            clientes.map((cliente, indice) => {
              const extra = [cliente.cidade, cliente.tel].filter(Boolean).join(' · ');
              return (
                <a
                  key={cliente.id}
                  id={`${listaId}-opcao-${indice}`}
                  href={`../../dashboard.html?clienteId=${encodeURIComponent(cliente.id)}`}
                  role="option"
                  aria-selected={indice === ativa}
                  onMouseEnter={() => setAtiva(indice)}
                  onClick={() => setAberta(false)}
                >
                  <b>{cliente.nome}</b>
                  {extra && <small>{extra}</small>}
                </a>
              );
            })}
        </div>
      )}
    </div>
  );
}
