import { useEffect, useRef, useState, type ReactNode } from 'react';
import { arquivarCliente, buscarDependencias, excluirCliente, reativarCliente } from './api';
import type { Connection } from '../../services/client';
import type { DependenciasCliente, PerfilCliente } from './tipos';

interface Props {
  conexao: Connection;
  perfil: PerfilCliente;
  aoEditar: () => void;
  /** Arquivou ou reativou: a ficha relê. */
  aoMudar: () => void;
  /** Excluiu: a ficha não existe mais. */
  aoExcluir: () => void;
}

type Dialogo = null | 'arquivar' | 'excluir';

/** AS AÇÕES DE CADASTRO da ficha — discretas, atrás de "•••".
 *
 *  §28: cadastro com histórico não se apaga, arquiva. Quem decide se dá
 *  para excluir é o backend (`GET /api/clientes/:id/dependencias`), e a
 *  confirmação de "Excluir" já abre dizendo a resposta: sem histórico,
 *  exclui; com histórico, oferece arquivar no lugar. */
export function AcoesDaCliente({ conexao, perfil, aoEditar, aoMudar, aoExcluir }: Props) {
  const cadastro = perfil.cadastro;
  const [menu, setMenu] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [dep, setDep] = useState<DependenciasCliente | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const caixa = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!menu) return undefined;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setMenu(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [menu]);

  if (!cadastro) return null;
  const arquivada = !!cadastro.arquivada_em;

  const fechar = () => { setDialogo(null); setDep(null); setErro(''); };

  async function executar(acao: () => Promise<unknown>, depois: () => void) {
    setOcupado(true);
    setErro('');
    try {
      await acao();
      fechar();
      depois();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui.');
    } finally {
      setOcupado(false);
    }
  }

  function abrirExcluir() {
    setMenu(false);
    setDialogo('excluir');
    setDep(null);
    buscarDependencias(conexao, cadastro!.id)
      .then(setDep)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Não consegui conferir o histórico.'));
  }

  return (
    <span className="mq-acoes-cliente" ref={caixa}>
      <button
        type="button"
        className="mq-btn mq-btn--ghost"
        aria-label="Mais ações"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((v) => !v)}
      >
        •••
      </button>
      {menu && (
        <div className="mq-menu mq-acoes-cliente__menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); aoEditar(); }}>
            Editar dados
          </button>
          {arquivada ? (
            <button
              type="button"
              role="menuitem"
              disabled={ocupado}
              onClick={() => { setMenu(false); executar(() => reativarCliente(conexao, cadastro.id), aoMudar); }}
            >
              Reativar
            </button>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => { setMenu(false); setDialogo('arquivar'); }}>
                Arquivar
              </button>
              <hr />
              <button type="button" role="menuitem" className="is-danger" onClick={abrirExcluir}>
                Excluir
              </button>
            </>
          )}
        </div>
      )}

      {dialogo === 'arquivar' && (
        <Confirmacao
          titulo={`Arquivar ${perfil.nomeExibicao}?`}
          aoVoltar={fechar}
          erro={erro}
          acao={(
            <button
              type="button"
              className="mq-btn mq-btn--secondary"
              disabled={ocupado}
              onClick={() => executar(() => arquivarCliente(conexao, cadastro.id), aoMudar)}
            >
              {ocupado ? 'Arquivando…' : 'Arquivar'}
            </button>
          )}
        >
          <p>Sai da lista de clientes e de “Para chamar de volta”.</p>
          <p>As compras e o histórico continuam guardados, e dá para reativar depois.</p>
        </Confirmacao>
      )}

      {dialogo === 'excluir' && (
        !dep ? (
          <Confirmacao titulo="Conferindo o histórico…" aoVoltar={fechar} erro={erro} acao={null}>
            <p>Um instante.</p>
          </Confirmacao>
        ) : dep.podeExcluir ? (
          <Confirmacao
            titulo={`Excluir ${perfil.nomeExibicao}?`}
            aoVoltar={fechar}
            erro={erro}
            acao={(
              <button
                type="button"
                className="mq-btn mq-btn--danger"
                disabled={ocupado}
                onClick={() => executar(() => excluirCliente(conexao, cadastro.id), aoExcluir)}
              >
                {ocupado ? 'Excluindo…' : 'Excluir cliente'}
              </button>
            )}
          >
            <p>Ela não tem compras nem histórico. O cadastro será apagado definitivamente.</p>
          </Confirmacao>
        ) : (
          <Confirmacao
            titulo="Esta cliente tem histórico"
            aoVoltar={fechar}
            erro={erro}
            acao={(
              <button
                type="button"
                className="mq-btn mq-btn--secondary"
                disabled={ocupado}
                onClick={() => executar(() => arquivarCliente(conexao, cadastro.id), aoMudar)}
              >
                {ocupado ? 'Arquivando…' : 'Arquivar'}
              </button>
            )}
          >
            <p>
              Tem {descreverHistorico(dep)}.
              {' '}Cadastro com histórico não é excluído — arquive, e o histórico fica guardado.
            </p>
          </Confirmacao>
        )
      )}
    </span>
  );
}

/* "1 compra na planilha", não "1 compras da planilha, 1 vendas da planilha":
   a venda da planilha é o agrupamento das mesmas linhas, e contar as duas
   seria dizer a mesma coisa duas vezes. */
const NOMES: Record<string, [string, string]> = {
  vendas: ['venda', 'vendas'],
  historico: ['compra na planilha', 'compras na planilha'],
  operacoes: ['cobrança registrada', 'cobranças registradas'],
  garantias: ['garantia ou troca', 'garantias e trocas'],
  credito: ['movimento de crédito', 'movimentos de crédito'],
  vinculos: ['revisão de cadastro', 'revisões de cadastro'],
};

export function descreverHistorico(dep: DependenciasCliente): string {
  const temPlanilha = dep.dependencias.some((d) => d.chave === 'historico');
  return dep.dependencias
    .filter((d) => !(temPlanilha && d.chave === 'vendasHistoricas'))
    .map((d) => {
      const [um, varios] = NOMES[d.chave] ?? [d.rotulo, d.rotulo];
      return `${d.n} ${d.n === 1 ? um : varios}`;
    })
    .join(', ');
}

function Confirmacao({
  titulo, children, acao, erro, aoVoltar,
}: {
  titulo: string;
  children: ReactNode;
  acao: ReactNode;
  erro: string;
  aoVoltar: () => void;
}) {
  const voltar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoVoltar(); };
    document.addEventListener('keydown', tecla);
    voltar.current?.focus();
    return () => document.removeEventListener('keydown', tecla);
  }, [aoVoltar]);

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" tabIndex={-1} onClick={aoVoltar} />
      <div className="mq-drawer mq-encerrar" role="alertdialog" aria-modal="true" aria-label={titulo}>
        <div className="mq-drawer__head">
          <div><h2 className="mq-title">{titulo}</h2></div>
        </div>
        <div className="mq-drawer__body">
          {children}
          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
          <div className="mq-btns">
            <button type="button" className="mq-btn mq-btn--ghost" ref={voltar} onClick={aoVoltar}>
              Voltar
            </button>
            {acao}
          </div>
        </div>
      </div>
    </>
  );
}
