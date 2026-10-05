import { useCallback, useEffect, useRef, useState } from 'react';
import { AvatarCliente } from '../../components/AvatarCliente';
import { decidirFoto, pedirBuscaDeFoto, removerFoto, sugestaoDeFoto } from './api';
import { fmtData } from '../../domain/formato';
import type { Connection } from '../../services/client';
import type { EstadoDaBuscaDeFoto, SugestaoDeFoto as Sugestao } from './tipos';

interface Props {
  conexao: Connection;
  clienteId: number;
  nome: string;
  /** Foto já confirmada: o diálogo mostra ela e oferece remover. */
  avatarUrl?: string | null;
  aoFechar: () => void;
  /** Confirmou ou removeu: a ficha relê. */
  aoMudar: () => void;
}

/** "É ela / Não é ela / Próxima sugestão" — e só isso. Sem sugestão, diz em
 *  que pé está a busca e oferece "Buscar foto".
 *
 *  Nada confirma sozinho: o servidor não tem autoaceite, e esta é a única
 *  porta. Se o download da foto falhar (link expirado, R2 fora), o erro
 *  aparece aqui e a sugestão continua pendente. */
export function SugestaoDeFoto({ conexao, clienteId, nome, avatarUrl, aoFechar, aoMudar }: Props) {
  const [s, setS] = useState<Sugestao | null>(null);
  const [carregando, setCarregando] = useState(!avatarUrl);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [fotoIndisponivel, setFotoIndisponivel] = useState(false);
  /* Não há sugestão (nunca houve, ou acabaram): o diálogo fica aberto e
     explica, em vez de piscar e fechar. `undefined` = ainda não sabemos. */
  const [semSugestao, setSemSugestao] = useState<EstadoDaBuscaDeFoto | null | undefined>(undefined);
  const primeiro = useRef<HTMLButtonElement>(null);
  const teveSugestao = useRef(false);

  const carregar = useCallback(async (depoisDe?: number) => {
    setCarregando(true);
    setErro('');
    setFotoIndisponivel(false);
    try {
      const r = await sugestaoDeFoto(conexao, clienteId, depoisDe);
      if (!r.sugestao) {
        // acabaram as sugestões: a ficha relê (a bolinha some) e o diálogo explica
        if (teveSugestao.current) aoMudar();
        setS(null);
        setSemSugestao(r.busca ?? null);
        return;
      }
      teveSugestao.current = true;
      setSemSugestao(undefined);
      setS(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui carregar a sugestão.');
    } finally {
      setCarregando(false);
    }
  }, [conexao, clienteId, aoMudar]);

  useEffect(() => { if (!avatarUrl) void carregar(); }, [avatarUrl, carregar]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aoFechar]);
  useEffect(() => { primeiro.current?.focus(); }, [s, avatarUrl, semSugestao]);

  async function agir(fn: () => Promise<unknown>, depois: () => void) {
    setOcupado(true);
    setErro('');
    try { await fn(); depois(); } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui.');
    } finally { setOcupado(false); }
  }

  const sg = s?.sugestao ?? null;
  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" tabIndex={-1} onClick={aoFechar} />
      <div className="mq-drawer mq-encerrar" role="dialog" aria-modal="true" aria-label={`Foto de ${nome}`}>
        <div className="mq-drawer__head"><div><h2 className="mq-title">{nome}</h2></div></div>
        <div className="mq-drawer__body mq-foto-sug">
          {avatarUrl ? (
            <>
              <AvatarCliente nome={nome} avatarUrl={avatarUrl} conexao={conexao} tamanho="xl" />
              <p className="mq-foto-sug__ajuda">Foto confirmada.</p>
              {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
              <div className="mq-btns">
                <button type="button" className="mq-btn mq-btn--ghost" disabled={ocupado} ref={primeiro}
                  onClick={() => agir(() => removerFoto(conexao, clienteId), () => { aoMudar(); aoFechar(); })}>
                  Remover foto
                </button>
                <button type="button" className="mq-btn mq-btn--secondary" onClick={aoFechar}>Fechar</button>
              </div>
            </>
          ) : carregando && !sg ? (
            <p className="mq-skel mq-skel--line" aria-busy="true" />
          ) : sg ? (
            <>
              <AvatarCliente
                nome={nome}
                avatarUrl={fotoIndisponivel ? null : sg.foto}
                conexao={conexao}
                tamanho="xl"
              />
              {/* A imagem falhou dentro do avatar: ele já voltou às iniciais;
                  isto só explica por quê. */}
              <ImagemProva src={sg.foto} aoFalhar={() => setFotoIndisponivel(true)} />
              {fotoIndisponivel && <p className="mq-foto-sug__ajuda">Foto indisponível agora.</p>}
              <p className="mq-foto-sug__quem"><b>@{sg.username}</b>{sg.nome && <small>{sg.nome}</small>}</p>
              {s?.aviso && <p className="mq-note mq-note--warn" role="status"><span>{s.aviso}</span></p>}
              {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
              <div className="mq-btns">
                <button type="button" className="mq-btn mq-btn--primary" disabled={ocupado} ref={primeiro}
                  onClick={() => agir(() => decidirFoto(conexao, clienteId, sg.candidatoId, 'confirmar'),
                    () => { aoMudar(); aoFechar(); })}>
                  É ela
                </button>
                <button type="button" className="mq-btn mq-btn--ghost" disabled={ocupado}
                  onClick={() => agir(() => decidirFoto(conexao, clienteId, sg.candidatoId, 'recusar'),
                    () => { void carregar(); })}>
                  Não é ela
                </button>
                {(s?.restantes ?? 0) > 0 && (
                  <button type="button" className="mq-btn mq-btn--ghost" disabled={ocupado}
                    onClick={() => { void carregar(sg.candidatoId); }}>
                    Próxima sugestão
                  </button>
                )}
              </div>
            </>
          ) : semSugestao !== undefined ? (
            <>
              <AvatarCliente nome={nome} conexao={conexao} tamanho="xl" />
              <p className="mq-foto-sug__ajuda">{explicarBusca(semSugestao)}</p>
              {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
              <div className="mq-btns">
                {semSugestao?.status !== 'pedida' && (
                  <button type="button" className="mq-btn mq-btn--primary" disabled={ocupado} ref={primeiro}
                    onClick={() => agir(() => pedirBuscaDeFoto(conexao, clienteId),
                      () => setSemSugestao({ status: 'pedida', em: null }))}>
                    {semSugestao ? 'Buscar de novo' : 'Buscar foto'}
                  </button>
                )}
                <button type="button" className="mq-btn mq-btn--secondary" onClick={aoFechar}
                  ref={semSugestao?.status === 'pedida' ? primeiro : undefined}>
                  Fechar
                </button>
              </div>
            </>
          ) : (
            <>
              {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
              <button type="button" className="mq-btn mq-btn--secondary" onClick={aoFechar} ref={primeiro}>Fechar</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Por que não há sugestão, em português — nunca o status cru da busca. */
export function explicarBusca(b: EstadoDaBuscaDeFoto | null): string {
  const quando = b?.em ? ` (${fmtData(b.em.slice(0, 10))})` : '';
  switch (b?.status) {
    case undefined:
      return 'Ainda não procuramos a foto dela no Instagram.';
    case 'pedida':
      return `Busca pedida${quando}. A sugestão aparece aqui depois da próxima rodada da busca — você confirma se é ela.`;
    case 'sem_resultado':
      return `A última busca${quando} não achou perfil que combine com o nome dela.`;
    case 'ignorada':
      return 'Só o primeiro nome não basta para achar a pessoa certa. Cadastre o sobrenome ou o @ do Instagram dela.';
    case 'erro':
      return `A última busca${quando} não conseguiu falar com o Instagram. Ela volta para a fila sozinha.`;
    default:
      return 'Nenhuma sugestão esperando. As que apareceram já foram recusadas.';
  }
}

/** Sonda invisível: o avatar já esconde a imagem que falha, mas quem avisa o
 *  diálogo é esta — assim a mensagem "indisponível" aparece só quando é
 *  verdade. */
function ImagemProva({ src, aoFalhar }: { src: string; aoFalhar: () => void }) {
  return <img src={src} alt="" hidden referrerPolicy="no-referrer" onError={aoFalhar} />;
}
