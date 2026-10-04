import { useCallback, useEffect, useRef, useState } from 'react';
import { AvatarCliente } from '../../components/AvatarCliente';
import { decidirFoto, removerFoto, sugestaoDeFoto } from './api';
import type { Connection } from '../../services/client';
import type { SugestaoDeFoto as Sugestao } from './tipos';

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

/** "É ela / Não é ela / Próxima sugestão" — e só isso.
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
  const primeiro = useRef<HTMLButtonElement>(null);

  const carregar = useCallback(async (depoisDe?: number) => {
    setCarregando(true);
    setErro('');
    setFotoIndisponivel(false);
    try {
      const r = await sugestaoDeFoto(conexao, clienteId, depoisDe);
      if (!r.sugestao) { aoMudar(); aoFechar(); return; }   // acabaram as sugestões
      setS(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui carregar a sugestão.');
    } finally {
      setCarregando(false);
    }
  }, [conexao, clienteId, aoMudar, aoFechar]);

  useEffect(() => { if (!avatarUrl) void carregar(); }, [avatarUrl, carregar]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aoFechar]);
  useEffect(() => { primeiro.current?.focus(); }, [s, avatarUrl]);

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

/** Sonda invisível: o avatar já esconde a imagem que falha, mas quem avisa o
 *  diálogo é esta — assim a mensagem "indisponível" aparece só quando é
 *  verdade. */
function ImagemProva({ src, aoFalhar }: { src: string; aoFalhar: () => void }) {
  return <img src={src} alt="" hidden referrerPolicy="no-referrer" onError={aoFalhar} />;
}
