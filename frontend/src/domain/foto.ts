/** Qual endereço usar para MOSTRAR a foto de uma peça.
 *
 *  `GET /api/state` manda quatro, e eles não são intercambiáveis — a ordem
 *  é a que `api/src/state.js` documenta, e é a MESMA que o painel legado
 *  usa em `resolveFotoPrincipal` (`src/dashboard.tpl.html`). As duas telas
 *  discordarem sobre qual foto é "a" foto da peça seria pior que nenhuma
 *  das duas mostrar foto:
 *
 *    1. `fotoTratadaUrl`   nossos bytes, com fundo branco. Link assinado.
 *    2. `fotoOriginalUrl`  nossos bytes, como chegaram. Link assinado.
 *    3. `fotoUrl`          um endereço que ALGUÉM gravou no cadastro.
 *    4. `fotoLojaUrl`      a imagem que a vitrine publica hoje.
 *
 *  Os dois primeiros são nossos e expiram; os dois últimos são de terceiro
 *  e podem sumir sem aviso. Por isso a ordem, e por isso 3 e 4 são último
 *  recurso: é o que faz a peça que a loja ilustra parar de aparecer vazia
 *  no painel, sem nunca preferir a imagem de fora à nossa.
 *
 *  `null` significa NÃO HÁ IMAGEM — e quem exibe mostra o losango da marca,
 *  nunca um `<img>` quebrado.
 *
 *  ┌─ POR QUE O NAVEGADOR FALA COM A CDN DA NUVEMSHOP ──────────────────┐
 *  │ Os casos 3 e 4 são endereços da vitrine, e carregá-los é uma        │
 *  │ requisição para fora dos dois endereços do sistema. Isso é          │
 *  │ deliberado e não é novo: o painel legado, em produção desde o       │
 *  │ go-live, faz exatamente isto. É LEITURA de uma imagem que a loja    │
 *  │ já publica — não é a API da Nuvemshop, não manda dado nosso para    │
 *  │ lugar nenhum, e a trava de ESCRITA (`NUVEMSHOP_WRITES_ENABLED`)     │
 *  │ continua intocada, porque ela é do Worker e isto é do navegador.    │
 *  │                                                                     │
 *  │ Enquanto a conta não tiver R2 (`10042`), esta é a ÚNICA foto que    │
 *  │ existe: `fotoTratadaUrl` e `fotoOriginalUrl` vêm nulos em produção  │
 *  │ e no DEV da V2. Recusá-la deixaria a coluna de foto vazia em todo   │
 *  │ lugar, para sempre.                                                 │
 *  └─────────────────────────────────────────────────────────────────────┘
 */
export interface ComFoto {
  /** A principal da GALERIA — a que a pessoa escolheu. Vem antes de tudo. */
  fotoGaleriaUrl?: string | null;
  fotoMiniUrl?: string | null;
  fotoTratadaUrl?: string | null;
  fotoOriginalUrl?: string | null;
  fotoUrl?: string | null;
  fotoLojaUrl?: string | null;
}

/*  0. `fotoGaleriaUrl` (29/09/2026) — a PRINCIPAL da galeria própria, a
 *     que alguém escolheu com "Definir como principal". Uma escolha
 *     explícita vence qualquer regra de precedência, por isso ela vem antes
 *     das quatro fontes acima. */
export function fotoDaPeca(p: ComFoto | null | undefined): string | null {
  if (!p) return null;
  return p.fotoGaleriaUrl || p.fotoTratadaUrl || p.fotoOriginalUrl || p.fotoUrl || p.fotoLojaUrl || null;
}

/** A MINIATURA a pedir para a lista: a nossa (um objeto pequeno no R2)
 *  quando a principal é da galeria; senão, a da CDN derivada da grande. */
export function miniaturaDaPeca(p: ComFoto | null | undefined): string | null {
  if (!p) return null;
  if (p.fotoGaleriaUrl) return p.fotoMiniUrl || p.fotoGaleriaUrl;
  return miniaturaDaFoto(fotoDaPeca(p));
}

export interface ComContagemDeFotos extends ComFoto {
  fotosQtd?: number;
  fotosDaLoja?: number;
  fotosNaLoja?: number;
  naLoja?: boolean | null;
}

/** As situações de foto que a lista de Peças filtra. Uma peça pode estar
 *  em mais de uma (importada E várias fotos). */
export type SituacaoDeFoto =
  | 'sem_foto' | 'uma' | 'varias' | 'importadas' | 'so_na_loja' | 'fora_da_loja';

export function situacoesDeFoto(p: ComContagemDeFotos): Set<SituacaoDeFoto> {
  const s = new Set<SituacaoDeFoto>();
  const n = p.fotosQtd ?? 0;
  if (!fotoDaPeca(p)) s.add('sem_foto');
  if (n === 1) s.add('uma');
  if (n > 1) s.add('varias');
  if ((p.fotosDaLoja ?? 0) > 0) s.add('importadas');
  /* Aparece com foto na lista, mas os bytes não são nossos: a imagem é um
     endereço da vitrine. É a fila de "falta copiar para o R2". */
  if (n === 0 && fotoDaPeca(p)) s.add('so_na_loja');
  if (p.naLoja === false) s.add('fora_da_loja');
  return s;
}

/** A MINIATURA da CDN da Nuvemshop: o mesmo endereço com o tamanho antes
 *  da extensão. Portado de `fotoMiniUrl` no painel legado, e pelo mesmo
 *  motivo — baixar 790 imagens de 1024px para mostrá-las com 46px é o que
 *  faz uma tabela de mil linhas travar no 4G.
 *
 *  O endereço gravado JÁ vem com um tamanho (`…-1024-1024.jpg`), e a CDN
 *  aceita UM par, não dois: anexar o segundo produz `-1024-1024-240-0.jpg`,
 *  que responde 403. Então o par antigo SAI antes de o novo entrar.
 *  Conferido contra a CDN pelo legado: `-240-0` e `-320-0` respondem 200;
 *  `-1024-1024-240-0` e `-240-240`, 403.
 *
 *  Endereço que não é da CDN volta intocado: um link assinado nosso tem
 *  assinatura sobre o caminho, e mexer nele o invalidaria.
 */
export function miniaturaDaFoto(url: string | null): string | null {
  if (!url) return null;
  if (!/tiendanube\.com|nuvemshop\.com/.test(url)) return url;
  return url.replace(/(?:-\d{1,4}-\d{1,4})?(\.[a-z]{3,4})(\?.*)?$/i, '-240-0$1$2');
}
