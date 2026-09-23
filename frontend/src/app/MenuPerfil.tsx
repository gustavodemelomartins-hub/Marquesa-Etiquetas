import { useEffect, useRef, useState } from 'react';
import { Icone } from '../components/Icone';
import { iniciaisDe, rotuloDoPerfil } from './iniciais';

interface Props {
  /** `config.operadorNome` do `GET /api/state`. `null` quando ninguém
   *  gravou um nome — e aí o avatar mostra a marca, não uma pessoa. */
  nome: string | null;
  aoAbrirConfiguracoes: () => void;
  aoDesconectar?: () => void;
}

/** O AVATAR do cabeçalho, e o pouco que cabe atrás dele.
 *
 *  O protótipo desenha um círculo bordô com "SM" que leva ao perfil. Aqui
 *  ele é a mesma forma, com duas diferenças que o servidor impõe:
 *
 *  1. As iniciais saem de `config.operadorNome` — um parâmetro da operação,
 *     não um usuário. Não há tabela de pessoas e a autenticação é UMA chave
 *     Bearer compartilhada; ver `app/iniciais.ts`.
 *  2. "Desconectar" mora aqui, e não solto na barra como um botão de texto
 *     que o protótipo não tem. Continua a um clique de distância, e para de
 *     deformar a composição do cabeçalho.
 *
 *  Perfis e permissões por pessoa continuam indisponíveis, e o menu diz
 *  isso em vez de abrir uma tela que fingiria tê-los.
 */
export function MenuPerfil({ nome, aoAbrirConfiguracoes, aoDesconectar }: Props) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  /* Clicar fora fecha, Esc fecha e devolve o foco ao avatar. Um menu que
     só fecha clicando nele de novo fica aberto por cima do conteúdo. */
  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAberto(false);
      botao.current?.focus();
    };
    document.addEventListener('mousedown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  const iniciais = iniciaisDe(nome);

  return (
    <div className="mq-perfil" ref={caixa}>
      <button
        type="button"
        ref={botao}
        className="mq-avatar"
        aria-label={rotuloDoPerfil(nome)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        onClick={() => setAberto((v) => !v)}
      >
        {iniciais}
      </button>

      {aberto && (
        <div className="mq-perfil__menu" role="menu">
          <p className="mq-perfil__quem">
            <b>{nome?.trim() || 'Ninguém identificado'}</b>
            <small>
              {nome?.trim()
                ? 'Nome da operação, gravado em Configurações'
                : 'Grave um nome em Configurações para ele aparecer aqui'}
            </small>
          </p>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAberto(false);
              aoAbrirConfiguracoes();
            }}
          >
            <Icone nome="settings" />
            Configurações
          </button>

          <p className="mq-perfil__limite">
            Perfis e permissões por pessoa ainda não existem: a autenticação é
            uma chave só, compartilhada.
          </p>

          {aoDesconectar && (
            <button
              type="button"
              role="menuitem"
              className="mq-perfil__sair"
              onClick={() => {
                setAberto(false);
                aoDesconectar();
              }}
            >
              <Icone nome="close" />
              Desconectar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
