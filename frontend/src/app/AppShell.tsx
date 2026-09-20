import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DevBadge } from './DevBadge';
import { BuscaGlobal } from './BuscaGlobal';
import { Icone } from '../components/Icone';
import { LogoMarquesa } from '../components/LogoMarquesa';
import { GRUPOS, NO_TELEFONE, acharModulo, grupoDe, type ModuloId } from './modulos';
import type { Connection } from '../services/client';
import type { AppState } from '../types/api';

/** Nome antigo do tipo, mantido porque o resto do código já o escreve. O
 *  conceito é o mesmo: a área principal onde a usuária está. */
export type AreaPrincipal = ModuloId;

interface Props {
  conexao: Connection;
  modulo: ModuloId;
  aoNavegar: (m: ModuloId) => void;
  /** Ir para um módulo E uma sub-rota — é o que a busca global precisa para
   *  abrir a ficha de uma cliente, e não só o módulo Clientes. */
  aoNavegarPara?: (destino: { modulo: ModuloId; sub: string | null }) => void;
  /** `GET /api/state`, que o App já leu. A busca procura peça e revendedora
   *  nele sem uma requisição a mais. */
  estado?: AppState | null;
  /** Contagens que o trilho mostra ao lado do módulo — pendências, avisos.
   *  Só entram as que alguém precisa ver de longe. */
  contagens?: Partial<Record<ModuloId, number>>;
  aoDesconectar?: () => void;
  children: ReactNode;
}

/** O CASCO — a única implementação de cabeçalho global do produto.
 *
 *  Trilho bordô à esquerda com os treze módulos em quatro grupos, barra
 *  superior dizendo onde estou, conteúdo, rodapé. Nenhuma tela desenha
 *  marca, busca ou perfil por conta própria: era isso que fazia duas
 *  páginas do mesmo sistema parecerem dois sistemas, e é por isso que a
 *  navegação mora aqui e em nenhum outro lugar.
 *
 *  Sem biblioteca de rotas ainda. A URL não muda porque o painel clássico
 *  ainda é o sistema principal e os dois convivem no mesmo domínio; trocar
 *  este estado por um router é barato depois, trocar um router por outro
 *  não é.
 */
export function AppShell({
  conexao, modulo, aoNavegar, aoNavegarPara, estado, contagens, aoDesconectar, children,
}: Props) {
  const atual = acharModulo(modulo);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  /* No telefone a busca não cabe ao lado do nome do módulo — ela era
     escondida por CSS, e o resultado é que quem usa o sistema DE PÉ, no
     balcão, não tinha busca nenhuma. Agora ela abre numa faixa que ocupa a
     barra inteira, e o botão que a abre fica onde o polegar alcança. */
  const [buscaAberta, setBuscaAberta] = useState(false);
  const burger = useRef<HTMLButtonElement>(null);

  /* Navegar fecha a gaveta: no telefone ela cobre a tela inteira, e deixá-la
     aberta em cima do destino esconde exatamente o que se foi buscar. */
  useEffect(() => { setGavetaAberta(false); setBuscaAberta(false); }, [modulo]);

  /* Esc fecha, e o foco volta para o botão que abriu — senão ele cai no
     começo da página e quem navega por teclado se perde. */
  useEffect(() => {
    if (!gavetaAberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setGavetaAberta(false);
      burger.current?.focus();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [gavetaAberta]);

  const irPara = (id: ModuloId) => () => aoNavegar(id);

  return (
    <div className="mq-shell">
      <nav
        id="mq-rail"
        className={gavetaAberta ? 'mq-rail is-open' : 'mq-rail'}
        aria-label="Módulos do sistema"
      >
        <button type="button" className="mq-rail__brand" onClick={irPara('home')}>
          <LogoMarquesa tom="claro" altura={30} className="mq-rail__logo" />
          {/* Trilho mínimo (901–1180px): o logo inteiro em 76px vira borrão.
              A janela abaixo recorta o MESMO arquivo no ornamento + M — não
              é um segundo desenho, e por isso não pode divergir do oficial. */}
          <span className="mq-rail__marca" aria-hidden="true">
            <LogoMarquesa tom="claro" altura={57} />
          </span>
        </button>

        <div className="mq-rail__nav">
          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo}>
              <p className="mq-rail__group">{grupo.titulo}</p>
              {grupo.modulos.map((m) => {
                const conta = contagens?.[m.id];
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={m.pendente ? 'mq-rail__item mq-rail__item--pendente' : 'mq-rail__item'}
                    aria-current={modulo === m.id ? 'page' : undefined}
                    onClick={irPara(m.id)}
                  >
                    <Icone nome={m.icone} />
                    <span>{m.rotulo}</span>
                    {conta ? <b className="mq-rail__conta">{conta}</b> : null}
                    {!conta && m.pendente ? (
                      <i className="mq-rail__dot" aria-label="ainda no painel clássico" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mq-rail__foot">
          <span>Painel novo · em migração</span>
          <a href="/dashboard.html">Abrir o painel clássico</a>
        </div>
      </nav>

      {gavetaAberta && (
        <button
          type="button"
          className="mq-scrim mq-scrim--menu"
          aria-label="Fechar menu"
          onClick={() => setGavetaAberta(false)}
        />
      )}

      <div className="mq-shell__frame">
        <header className="mq-topbar">
          <button
            type="button"
            ref={burger}
            className="mq-iconbtn mq-burger"
            aria-label="Abrir menu"
            aria-expanded={gavetaAberta}
            aria-controls="mq-rail"
            onClick={() => setGavetaAberta((v) => !v)}
          >
            <Icone nome="menu" />
          </button>

          {/* ONDE ESTOU — o módulo e o grupo dele, em toda tela, sem exceção. */}
          <div className="mq-topbar__where">
            <Icone nome={atual.icone} />
            <b>{atual.rotulo}</b>
            <span className="mq-topbar__grupo">· {grupoDe(modulo)}</span>
          </div>

          <div className={buscaAberta ? 'mq-topbar__search is-aberta' : 'mq-topbar__search'}>
            <BuscaGlobal
              conexao={conexao}
              estado={estado ?? null}
              aoNavegar={(d) => {
                setBuscaAberta(false);
                if (aoNavegarPara) aoNavegarPara(d);
                else aoNavegar(d.modulo);
              }}
            />
          </div>

          <div className="mq-topbar__tools">
            {/* Só no telefone: acima da gaveta, a busca já está aberta. */}
            <button
              type="button"
              className="mq-iconbtn mq-busca-botao"
              aria-label={buscaAberta ? 'Fechar busca' : 'Buscar'}
              aria-expanded={buscaAberta}
              onClick={() => setBuscaAberta((v) => !v)}
            >
              <Icone nome={buscaAberta ? 'close' : 'search'} />
            </button>
            <DevBadge />
            <button
              type="button"
              className="mq-iconbtn"
              aria-label="Notificações"
              onClick={irPara('notificacoes')}
            >
              <Icone nome="bell" />
            </button>
            <button
              type="button"
              className="mq-iconbtn"
              aria-label="Perfil do usuário, disponível em breve"
              title="Perfis e permissões serão implementados em uma etapa futura"
            >
              <Icone nome="person" />
            </button>
            {aoDesconectar && (
              <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={aoDesconectar}>
                Desconectar
              </button>
            )}
          </div>
        </header>

        <main className="mq-shell__main">{children}</main>

        <footer className="mq-shell__foot">
          Painel novo, em migração. Os módulos marcados seguem em{' '}
          <a href="/dashboard.html">dashboard.html</a>.
        </footer>
      </div>

      <nav className="mq-bottomnav" aria-label="Atalhos">
        {NO_TELEFONE.map((id) => {
          const m = acharModulo(id);
          return (
            <button
              key={id}
              type="button"
              aria-current={modulo === id ? 'page' : undefined}
              onClick={irPara(id)}
            >
              <Icone nome={m.icone} />
              {m.rotulo}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="Abrir menu"
          aria-expanded={gavetaAberta}
          aria-controls="mq-rail"
          onClick={() => setGavetaAberta((v) => !v)}
        >
          <Icone nome="menu" />
          Menu
        </button>
      </nav>
    </div>
  );
}
