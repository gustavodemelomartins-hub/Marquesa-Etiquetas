import { useCallback, useEffect, useState } from 'react';
import { MODULOS, type ModuloId } from './modulos';

/** O endereço da tela, no hash da URL.
 *
 *  Por que hash e não caminho: o painel novo é publicado como arquivo
 *  estático no Pages, ao lado do painel clássico. Um caminho de verdade
 *  (`/v2/clientes/7`) exigiria o servidor reescrever tudo para o
 *  `index.html`, e um 404 num link colado no WhatsApp é pior do que um
 *  `#`. O hash funciona em qualquer hospedagem, hoje.
 *
 *  Por que não uma biblioteca de rotas: são treze módulos e no máximo dois
 *  segmentos. Trocar isto por um router quando fizer falta é barato;
 *  trocar um router por outro depois de ele estar em toda tela, não.
 *
 *  A forma é sempre `#/<modulo>` ou `#/<modulo>/<sub>`, e `<sub>` é o que
 *  cada módulo quiser dizer — o id de uma cliente, o nome de uma aba.
 */
export interface Rota {
  modulo: ModuloId;
  /** O segundo segmento, cru. `null` quando não há. */
  sub: string | null;
}

/* A Home é a porta: ela responde "o que precisa de mim agora", e é isso
   que se quer saber ao abrir o sistema de manhã. */
const PADRAO: Rota = { modulo: 'home', sub: null };

export function lerRota(hash: string): Rota {
  const partes = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const modulo = MODULOS.find((m) => m.id === partes[0]);
  if (!modulo) return PADRAO;
  return { modulo: modulo.id, sub: partes[1] ? decodeURIComponent(partes[1]) : null };
}

export function escreverRota({ modulo, sub }: Rota): string {
  return sub ? `#/${modulo}/${encodeURIComponent(sub)}` : `#/${modulo}`;
}

/** A rota atual, e as duas formas de mudá-la.
 *
 *  `ir` empilha (o voltar do navegador desfaz) e `trocar` substitui — a
 *  diferença importa: trocar de aba dentro de um módulo não deveria exigir
 *  cinco toques no voltar para sair da tela. */
export function useRota(): {
  rota: Rota;
  ir: (r: Partial<Rota> & { modulo: ModuloId }) => void;
  trocar: (r: Partial<Rota> & { modulo: ModuloId }) => void;
} {
  const [rota, setRota] = useState<Rota>(() => lerRota(
    typeof location === 'undefined' ? '' : location.hash,
  ));

  useEffect(() => {
    const aoMudar = () => setRota(lerRota(location.hash));
    addEventListener('hashchange', aoMudar);
    /* Uma URL sem hash é a primeira visita: escreve a rota padrão sem
       empilhar, para o primeiro "voltar" sair do app em vez de girar. */
    if (!location.hash) history.replaceState(null, '', escreverRota(PADRAO));
    return () => removeEventListener('hashchange', aoMudar);
  }, []);

  const mover = useCallback((r: Partial<Rota> & { modulo: ModuloId }, substituir: boolean) => {
    const destino: Rota = { modulo: r.modulo, sub: r.sub ?? null };
    const endereco = escreverRota(destino);
    if (endereco === location.hash) return;
    if (substituir) history.replaceState(null, '', endereco);
    else history.pushState(null, '', endereco);
    /* `pushState` não dispara `hashchange`: o estado local acompanha à mão,
       e o ouvinte acima continua respondendo pelo voltar/avançar. */
    setRota(destino);
  }, []);

  return {
    rota,
    ir: useCallback((r) => mover(r, false), [mover]),
    trocar: useCallback((r) => mover(r, true), [mover]),
  };
}
