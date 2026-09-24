/** O LEITOR — quem transforma um quadro da câmera num código.
 *
 *  PORTADO de `src/dashboard.tpl.html › montarLeitor`, que é o código que
 *  está em produção hoje e que a Sthefany usa. Cada decisão abaixo tem um
 *  motivo medido na mão dela, e nenhuma foi redesenhada nesta migração —
 *  os comentários vieram junto porque eles são a razão de o leitor
 *  funcionar num aparelho de verdade.
 *
 *  Dois leitores, e o motivo é o iPhone. O Chrome do Android traz
 *  `BarcodeDetector` pronto, que é o mais rápido e não custa nada. O Safari
 *  do iPhone não tem — e é o aparelho que ela usa. Então carregamos o ZXing
 *  sob demanda.
 *
 *  O ZXing vem de `/vendor/zxing.min.js`, o MESMO arquivo que o painel
 *  clássico usa: 362 KB que o Pages já serve e que o navegador já tem em
 *  cache de quando ela abriu o painel antigo. Empacotá-lo no bundle do Vite
 *  somaria 362 KB a um bundle de 900 KB que desce toda vez — e pagaria de
 *  novo por um arquivo que já está na máquina dela.
 *
 *  O caminho é ABSOLUTO de propósito. A V2 é servida em `/v2/` e também em
 *  `/painel-novo/`, e um caminho relativo apontaria para
 *  `/v2/vendor/zxing.min.js`, que não existe.
 */

/** Recebe o `<canvas>` de um quadro e devolve o código lido, ou `null`. */
export type Decodificador = (canvas: HTMLCanvasElement) => Promise<string | null>;

export const CAMINHO_ZXING = '/vendor/zxing.min.js';

/* O ZXing é UMD e pendura `ZXing` no `window`. Só os pedaços que usamos. */
interface ZXingGlobal {
  DecodeHintType: { POSSIBLE_FORMATS: unknown; TRY_HARDER: unknown };
  BarcodeFormat: { CODE_128: unknown; EAN_13: unknown };
  MultiFormatReader: new () => {
    decode(bitmap: unknown, hints: unknown): { getText(): string } | null;
    reset(): void;
  };
  HTMLCanvasElementLuminanceSource: new (c: HTMLCanvasElement) => unknown;
  BinaryBitmap: new (b: unknown) => unknown;
  HybridBinarizer: new (f: unknown) => unknown;
}

interface ComBarcodeDetector {
  BarcodeDetector?: new (o: { formats: string[] }) => {
    detect(fonte: CanvasImageSource): Promise<{ rawValue?: string }[]>;
  };
  ZXing?: ZXingGlobal;
}

/** A câmera existe em qualquer navegador moderno servido por HTTPS; o que
 *  varia é só QUEM decodifica. Por isso não há mais aparelho sem o botão. */
export function temCamera(): boolean {
  return !!(typeof navigator !== 'undefined'
    && navigator.mediaDevices
    && navigator.mediaDevices.getUserMedia);
}

let carregando: Promise<ZXingGlobal> | null = null;

export function carregarZXing(): Promise<ZXingGlobal> {
  const janela = window as unknown as ComBarcodeDetector;
  if (janela.ZXing) return Promise.resolve(janela.ZXing);
  if (carregando) return carregando;
  carregando = new Promise<ZXingGlobal>((ok, erro) => {
    const s = document.createElement('script');
    s.src = CAMINHO_ZXING;
    s.onload = () => (janela.ZXing ? ok(janela.ZXing) : erro(new Error('leitor não carregou')));
    s.onerror = () => { carregando = null; erro(new Error('não consegui baixar o leitor')); };
    document.head.appendChild(s);
  });
  return carregando;
}

/** Monta o decodificador. Fica isolado assim — sem câmera, sem React —
 *  para o teste poder decodificar uma etiqueta de verdade. */
export async function montarLeitor(): Promise<Decodificador> {
  const janela = window as unknown as ComBarcodeDetector;

  if (janela.BarcodeDetector) {
    try {
      const d = new janela.BarcodeDetector({ formats: ['code_128', 'ean_13'] });
      return async (canvas) => {
        const r = await d.detect(canvas);
        return r.length ? String(r[0]?.rawValue ?? '').trim() || null : null;
      };
    } catch {
      /* formato não suportado: cai para o ZXing */
    }
  }

  const Z = await carregarZXing();
  const hints = new Map<unknown, unknown>();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.EAN_13]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const leitor = new Z.MultiFormatReader();

  /* As `hints` vão em TODA chamada, e não uma vez por `setHints`, porque o
     `decode` do ZXing é assim por dentro:

         decode(imagem, hints){ this.hints!==hints && this.setHints(hints); ... }

     Chamar `decode(imagem)` sem o segundo argumento passa `undefined` e
     REDEFINE as configurações para o padrão. Era o que acontecia no painel
     clássico antes da correção: o leitor voltava a tentar QR, Aztec, PDF417
     e Data Matrix a cada quadro, e perdia o TRY_HARDER — que é o que manda
     tentar a etiqueta girada. */
  const decodificar = (canvas: HTMLCanvasElement): string | null => {
    try {
      const fonte = new Z.HTMLCanvasElementLuminanceSource(canvas);
      const mapa = new Z.BinaryBitmap(new Z.HybridBinarizer(fonte));
      const r = leitor.decode(mapa, hints);
      return r ? String(r.getText() ?? '').trim() || null : null;
    } catch {
      return null;   /* quadro sem código é o caso normal */
    } finally {
      leitor.reset();
    }
  };

  /* Duas tentativas por quadro, e cada uma também de lado.
   *
   *  A primeira é o QUADRO INTEIRO. A segunda é o RECORTE DA MIRA,
   *  ampliado — ver a ordem logo abaixo, que não é a intuitiva.
   *
   *  O giro de 90° existe porque etiqueta de bijuteria quase sempre acaba
   *  deitada no quadro quando o celular está em pé, e o leitor lê código de
   *  barras na horizontal.
   *
   *  Os canvas são reaproveitados entre quadros: isto roda cinco vezes por
   *  segundo e criar canvas novo a cada vez enche a memória do celular. */
  const cMira = document.createElement('canvas');
  const cGiro = document.createElement('canvas');

  const girar = (origem: HTMLCanvasElement): HTMLCanvasElement => {
    cGiro.width = origem.height; cGiro.height = origem.width;
    const g = cGiro.getContext('2d', { willReadFrequently: true });
    if (!g) return origem;
    g.setTransform(0, 1, -1, 0, cGiro.width, 0);
    g.drawImage(origem, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return cGiro;
  };

  /* Mesma proporção da mira desenhada na tela (`.mq-cam__alvo`): 76% da
     largura e 36% da altura, no centro. Se a mira mudar de tamanho no CSS,
     estes números mudam junto. */
  const mirar = (origem: HTMLCanvasElement): HTMLCanvasElement => {
    const w = origem.width * 0.76, h = origem.height * 0.36, amp = 2;
    cMira.width = w * amp; cMira.height = h * amp;
    const g = cMira.getContext('2d', { willReadFrequently: true });
    if (!g) return origem;
    g.imageSmoothingQuality = 'high';
    g.drawImage(origem, (origem.width - w) / 2, (origem.height - h) / 2, w, h, 0, 0, cMira.width, cMira.height);
    return cMira;
  };

  /* O quadro INTEIRO vem primeiro, e a mira é o reforço — não o contrário.
     Recortar antes parece esperto e quebra o caso mais comum de todos: com
     a peça perto do celular a etiqueta preenche o quadro, e aí o recorte
     corta o começo e o fim do código de barras, que é onde ficam as marcas
     que dizem onde ele começa e termina. Some o código inteiro.

     A mira só ajuda quando a peça está longe e o código ficou pequeno; por
     isso entra em quadros alternados. Assim o caminho comum responde em
     ~100ms e a câmera não parece travada, sem perder o caso difícil. */
  let volta = 0;
  return async (canvas) => {
    const inteiro = decodificar(canvas) || decodificar(girar(canvas));
    if (inteiro) return inteiro;
    if (++volta % 2) return null;
    const mira = mirar(canvas);
    return decodificar(mira) || decodificar(girar(mira));
  };
}

/** O bipe. Som é enfeite; se o navegador bloquear, segue sem.
 *
 *  Portado do `beep` do painel clássico, inclusive as frequências: 880 Hz
 *  senoidal para aceito, 220 Hz quadrado para recusado. Quem conta cem
 *  peças aprende o som e para de olhar a tela — trocar isso agora
 *  obrigaria a reaprender. */
export function criarBipe(): (ok: boolean) => void {
  let ctx: AudioContext | null = null;
  return (ok: boolean) => {
    try {
      const Ctor = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = ctx ?? new Ctor();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = ok ? 880 : 220;
      o.type = ok ? 'sine' : 'square';
      g.gain.setValueAtTime(0.09, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.09 : 0.22));
      o.start(); o.stop(ctx.currentTime + (ok ? 0.1 : 0.24));
    } catch {
      /* som bloqueado pelo navegador: a tela já diz o que aconteceu */
    }
  };
}
