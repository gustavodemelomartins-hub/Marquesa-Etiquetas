import { useEffect, useState } from 'react';
import { iniciaisDe } from '../app/iniciais';
import type { Connection } from '../services/client';

interface Props {
  nome: string;
  /** Link assinado que a API manda quando a foto foi confirmada (relativo
   *  à API) — ou o endereço absoluto de uma foto sugerida. */
  avatarUrl?: string | null;
  /** Há uma sugestão de foto aguardando "É ela": a bolinha avisa, o resto
   *  continua sendo as iniciais. */
  sugestao?: boolean;
  conexao: Connection;
  tamanho?: 'sm' | 'md' | 'lg' | 'xl';
  /** Com `aoClicar` vira botão; sem, é só desenho (dentro de linha clicável). */
  aoClicar?: () => void;
}

/** O AVATAR da cliente — o único lugar do React que o desenha.
 *
 *  Foto confirmada → foto. Sem foto (ou foto que falhou) → as iniciais,
 *  que estão por baixo da imagem o tempo todo: se a imagem não carrega, ela
 *  se retira e o que sobra é o avatar de sempre, nunca ícone quebrado. */
export function AvatarCliente({ nome, avatarUrl, sugestao = false, conexao, tamanho = 'md', aoClicar }: Props) {
  const src = avatarUrl ? (avatarUrl.startsWith('/') ? conexao.url + avatarUrl : avatarUrl) : null;
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [src]);

  const comFoto = !!src && !falhou;
  const classe = `mq-avatar mq-avatar--quiet mq-avatar--${tamanho}${sugestao && !comFoto ? ' mq-avatar--sug' : ''}`;
  const miolo = (
    <>
      {iniciaisDe(nome)}
      {comFoto && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFalhou(true)}
        />
      )}
    </>
  );

  if (aoClicar) {
    return (
      <button
        type="button"
        className={classe}
        aria-label={comFoto ? `Foto de ${nome}` : sugestao ? `Sugestão de foto para ${nome}` : `Buscar foto de ${nome}`}
        onClick={aoClicar}
      >
        {miolo}
      </button>
    );
  }
  return <span className={classe} aria-hidden="true">{miolo}</span>;
}
