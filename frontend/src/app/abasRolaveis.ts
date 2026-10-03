/** Faixas que rolam de lado — abas (`.mq-tabs`) e chips (`.mq-chipset`).
 *
 *  No telefone, "A receber · Recebido · Resumo · Saiu sem faturar" não cabe
 *  em 390px. A faixa já rolava, mas nada dizia isso: a última aba aparecia
 *  cortada como se fosse o fim, e escolher uma aba pela URL podia deixá-la
 *  fora da vista. Duas coisas resolvem, e as duas moram aqui, uma vez só,
 *  para todas as faixas do produto:
 *
 *    1. `data-rola` diz para que lado ainda há conteúdo ('esq', 'dir' ou
 *       'esq dir'); o CSS do telefone desenha o degradê na borda;
 *    2. a escolhida é mantida à vista — também quando a faixa cresce
 *       depois (a fonte carrega, o número de uma aba chega da API). Até a
 *       pessoa pôr o dedo na faixa: a partir daí quem manda é ela, e só uma
 *       troca de aba volta a trazer a escolhida.
 *
 *  Nenhum componente precisa saber disto — o casco liga uma vez sobre o
 *  conteúdo, e uma faixa nova ganha o comportamento só por existir.
 */
const FAIXAS = '.mq-tabs, .mq-chipset';
const ESCOLHIDA = ':scope > [aria-selected="true"], :scope > [aria-current="page"], :scope > [aria-pressed="true"], :scope > .active';

/** Para que lado a faixa ainda tem o que mostrar. Exportada para teste. */
export function ladosComMais(f: { scrollLeft: number; scrollWidth: number; clientWidth: number }): string {
  const sobra = f.scrollWidth - f.clientWidth;
  if (sobra <= 1) return '';
  const lados: string[] = [];
  if (f.scrollLeft > 1) lados.push('esq');
  if (f.scrollLeft < sobra - 1) lados.push('dir');
  return lados.join(' ');
}

function marcar(faixa: HTMLElement) {
  const lados = ladosComMais(faixa);
  if ((faixa.dataset.rola ?? '') === lados) return;
  if (lados) faixa.dataset.rola = lados;
  else delete faixa.dataset.rola;
}

function trazerEscolhida(faixa: HTMLElement, vistas: WeakMap<HTMLElement, Element>, mexidas: WeakSet<HTMLElement>) {
  const escolhida = faixa.querySelector(ESCOLHIDA);
  if (!escolhida) return;
  const anterior = vistas.get(faixa);
  if (anterior !== escolhida) mexidas.delete(faixa);
  else if (mexidas.has(faixa)) return;
  vistas.set(faixa, escolhida);
  if (faixa.scrollWidth <= faixa.clientWidth) return;
  /* A primeira vez (a tela abriu já nesta aba) e os ajustes de layout são
     instantâneos; a troca por toque desliza, pelo `scroll-behavior` do CSS. */
  const primeira = anterior === escolhida || anterior === undefined;
  const caixa = faixa.getBoundingClientRect();
  const alvo = escolhida.getBoundingClientRect();
  const folga = 24;
  let delta = 0;
  if (alvo.left < caixa.left + folga) delta = alvo.left - (caixa.left + folga);
  else if (alvo.right > caixa.right - folga) delta = alvo.right - (caixa.right - folga);
  if (!delta) return;
  if (primeira) faixa.style.scrollBehavior = 'auto';
  faixa.scrollLeft += delta;
  if (primeira) faixa.style.scrollBehavior = '';
}

/** Liga o comportamento em tudo que estiver (ou vier a estar) dentro de
 *  `raiz`. Devolve a função que desliga. */
export function ligarAbasRolaveis(raiz: HTMLElement): () => void {
  const vistas = new WeakMap<HTMLElement, Element>();
  const mexidas = new WeakSet<HTMLElement>();
  let pendente = 0;

  const varrer = () => {
    pendente = 0;
    raiz.querySelectorAll<HTMLElement>(FAIXAS).forEach((faixa) => {
      trazerEscolhida(faixa, vistas, mexidas);
      marcar(faixa);
    });
  };
  const agendar = () => {
    if (pendente) return;
    pendente = requestAnimationFrame(varrer);
  };

  /* `scroll` não borbulha, mas é visto na captura. */
  const aoRolar = (e: Event) => {
    const alvo = e.target;
    if (alvo instanceof HTMLElement && alvo.matches(FAIXAS)) marcar(alvo);
  };

  /* O dedo (ou a roda do mouse) na faixa devolve o controle à pessoa. */
  const aoTocar = (e: Event) => {
    const faixa = e.target instanceof Element ? e.target.closest<HTMLElement>(FAIXAS) : null;
    if (faixa) mexidas.add(faixa);
  };

  const observador = new MutationObserver(agendar);
  /* A Jost chega depois do primeiro desenho e muda a largura de cada aba. */
  document.fonts?.ready.then(agendar).catch(() => {});
  observador.observe(raiz, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['aria-selected', 'aria-current', 'aria-pressed', 'class'],
  });
  raiz.addEventListener('scroll', aoRolar, true);
  raiz.addEventListener('pointerdown', aoTocar, true);
  raiz.addEventListener('wheel', aoTocar, { capture: true, passive: true });
  addEventListener('resize', agendar);
  agendar();

  return () => {
    observador.disconnect();
    raiz.removeEventListener('scroll', aoRolar, true);
    raiz.removeEventListener('pointerdown', aoTocar, true);
    raiz.removeEventListener('wheel', aoTocar, true);
    removeEventListener('resize', agendar);
    if (pendente) cancelAnimationFrame(pendente);
  };
}
