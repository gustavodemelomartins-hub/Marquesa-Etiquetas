import { useCallback, useEffect, useRef, useState } from 'react';
import { Icone } from '../Icone';
import { criarBipe, montarLeitor, temCamera, type Decodificador } from './leitorDeEtiqueta';

/** O que o consumidor responde para cada leitura.
 *
 *  Quem sabe se o código virou alguma coisa é quem chamou — o Inventário
 *  sabe se a peça está na lista do que se espera em casa, Revendedoras vai
 *  saber se ela saiu naquela maleta. O leitor não sabe, e não deve saber:
 *  ele só mostra a resposta e toca o som correspondente. */
export interface ResultadoDaLeitura {
  ok: boolean;
  texto: string;
}

export interface Props {
  /** Chamado a cada leitura aceita pelo antirrepique, com o código CRU —
   *  do jeito que saiu da etiqueta. Normalizar e resolver para SKU é do
   *  consumidor, com `codigoDaEtiqueta.ts`.
   *
   *  Enquanto a promessa não resolve, NENHUM quadro novo é lido. É o que
   *  impede uma fila de leituras se acumular enquanto o servidor responde,
   *  e é também o que segura a câmera enquanto um diálogo está aberto. */
  aoLer: (codigo: string) => Promise<ResultadoDaLeitura>;
  /** Fechar o leitor. Quem chama decide o que fazer; a câmera já foi
   *  desligada quando isto roda. */
  aoFechar: () => void;
  /** Congela a leitura sem desligar a câmera — para enquanto um diálogo
   *  está aberto por cima. A imagem continua viva, e é isso que faz a
   *  retomada ser instantânea. */
  pausado?: boolean;
  titulo?: string;
  dica?: string;
  /** Quanto tempo o MESMO código espera para valer de novo. O padrão é o
   *  do painel clássico. */
  intervaloRepetidoMs?: number;
}

/* A câmera enxerga o mesmo código dezenas de vezes por segundo. Sem esta
   janela, uma peça parada na frente da lente vira dez peças contadas.

   1800ms é o número do painel clássico, medido na operação: é mais que o
   tempo de tirar uma peça e pôr a próxima, e menos que a paciência de quem
   está contando. Diminuir conta peça a mais; aumentar faz ela achar que o
   leitor travou e balançar a peça — o que conta a mais de novo. */
const INTERVALO_REPETIDO_PADRAO = 1800;

/* Cinco quadros por segundo. Mais que isso esquenta o telefone sem ler
   mais rápido: o gargalo é a decodificação, não a captura. */
const INTERVALO_QUADRO_MS = 200;

/** LEITOR DE ETIQUETAS — a câmera como periférico de entrada.
 *
 *  Ele faz três coisas e só três: abre a câmera, transforma quadro em
 *  código, e entrega o código a quem pediu. Não conhece inventário, não
 *  conhece maleta, não conhece SKU — a única coisa que sabe do domínio é
 *  que o resultado de uma leitura tem um texto e um "deu certo".
 *
 *      captura → decodificação → antirrepique → aoLer(codigo)
 *
 *  Essa fronteira é o ponto. O Inventário decide o que fazer com o código;
 *  Revendedoras vai decidir outra coisa com o mesmo código, e as duas telas
 *  não precisam concordar sobre nada além do formato da etiqueta.
 *
 *  Ver `frontend/src/components/scanner/README.md`.
 */
export function LeitorDeEtiquetas({
  aoLer,
  aoFechar,
  pausado = false,
  titulo = 'Bipe a etiqueta da peça',
  dica,
  intervaloRepetidoMs = INTERVALO_REPETIDO_PADRAO,
}: Props) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [estado, setEstado] = useState<'abrindo' | 'lendo' | 'erro'>('abrindo');
  const [erro, setErro] = useState('');
  const [ultimo, setUltimo] = useState<ResultadoDaLeitura | null>(null);
  const [manual, setManual] = useState('');

  /* Tudo o que precisa sobreviver entre quadros SEM redesenhar a tela.
     Um `useState` aqui redesenharia o componente cinco vezes por segundo,
     e a imagem da câmera piscaria. */
  const trilha = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const vivo = useRef(true);
  const lendo = useRef(false);
  const ultimoCodigo = useRef('');
  const ultimoQuando = useRef(0);
  const quadro = useRef<HTMLCanvasElement | null>(null);
  const decodificar = useRef<Decodificador | null>(null);
  const bipe = useRef(criarBipe());

  /* `pausado` e `aoLer` mudam de identidade a cada render do consumidor. O
     laço lê os valores por referência para não precisar ser remontado —
     remontá-lo desligaria e religaria a câmera a cada contagem. */
  const pausadoRef = useRef(pausado);
  pausadoRef.current = pausado;
  const aoLerRef = useRef(aoLer);
  aoLerRef.current = aoLer;

  /** Desligar de verdade. `getTracks().forEach(stop)` é o que apaga a luz
   *  da câmera; soltar só a referência deixa a lente ligada até o
   *  navegador decidir recolher — e no telefone isso é visível. */
  const desligar = useCallback(() => {
    vivo.current = false;
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
    if (trilha.current) {
      trilha.current.getTracks().forEach((t) => t.stop());
      trilha.current = null;
    }
    if (video.current) video.current.srcObject = null;
  }, []);

  const fechar = useCallback(() => { desligar(); aoFechar(); }, [desligar, aoFechar]);

  useEffect(() => {
    vivo.current = true;
    let cancelado = false;

    async function abrir() {
      try {
        decodificar.current = await montarLeitor();
        /* Pedir resolução explicitamente é o que mais importa aqui. Sem
           pedir, o navegador costuma entregar 640x480, e nessa resolução a
           etiqueta de bijuteria ocupa poucos pixels — o código de barras
           simplesmente não tem barras suficientes para ser lido. `ideal` em
           vez de `exact` para nunca falhar em aparelho que não alcance: ele
           entrega o que puder. O foco contínuo evita a imagem borrada de
           perto, que é a distância em que ela vai usar. */
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            focusMode: { ideal: 'continuous' },
          } as MediaTrackConstraints,
          audio: false,
        });
        /* A tela pode ter sido fechada enquanto a permissão estava na mão
           da pessoa. Sem isto, a câmera abriria depois de o componente sair
           e ficaria ligada sem ninguém para desligá-la. */
        if (cancelado || !vivo.current) { stream.getTracks().forEach((t) => t.stop()); return; }

        trilha.current = stream;
        const v = video.current;
        if (v) {
          v.srcObject = stream;
          /* `play()` rejeita no Safari quando a aba perde o foco no meio.
             Não é motivo para falhar a abertura: o elemento tem `autoPlay`
             e volta sozinho. */
          await v.play().catch(() => {});
        }
        quadro.current = document.createElement('canvas');
        setEstado('lendo');
        laco();
      } catch (e) {
        if (cancelado) return;
        setEstado('erro');
        const nome = (e as { name?: string })?.name;
        setErro(
          nome === 'NotAllowedError'
            ? 'Preciso da permissão da câmera. Libere nos ajustes do navegador e abra de novo.'
            : nome === 'NotFoundError'
              ? 'Não achei uma câmera neste aparelho. Dá para digitar o código abaixo.'
              : ((e as Error)?.message || 'Não consegui abrir a câmera.'),
        );
      }
    }

    async function laco() {
      if (!vivo.current) return;
      const v = video.current;
      const c = quadro.current;
      const ler = decodificar.current;

      if (v && c && ler && !pausadoRef.current && !lendo.current && v.videoWidth) {
        try {
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          c.getContext('2d', { willReadFrequently: true })?.drawImage(v, 0, 0);
          const codigo = await ler(c);
          const agora = Date.now();
          /* O ANTIRREPIQUE. Código diferente passa na hora — bipar duas
             peças diferentes em sequência rápida é o caso normal. O MESMO
             código só passa de novo depois da janela, e é isso que separa
             "a segunda unidade da mesma peça" de "a etiqueta parada na
             frente da lente". */
          if (codigo && (codigo !== ultimoCodigo.current
            || agora - ultimoQuando.current > intervaloRepetidoMs)) {
            ultimoCodigo.current = codigo;
            ultimoQuando.current = agora;
            await entregar(codigo);
          }
        } catch {
          /* quadro ruim é normal; tenta o próximo */
        }
      }
      if (vivo.current) timer.current = window.setTimeout(laco, INTERVALO_QUADRO_MS);
    }

    abrir();
    return () => { cancelado = true; desligar(); };
    // `desligar` é estável e o laço lê o resto por referência: este efeito
    // roda UMA vez, que é o que mantém a câmera ligada entre contagens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Entrega o código e mostra a resposta. Serializado: enquanto o
   *  consumidor não responde, nenhum quadro novo é lido. */
  async function entregar(codigo: string) {
    lendo.current = true;
    try {
      const r = await aoLerRef.current(codigo);
      if (!vivo.current) return;
      setUltimo(r);
      bipe.current(r.ok);
    } catch (e) {
      if (!vivo.current) return;
      const r = { ok: false, texto: e instanceof Error ? e.message : 'Não consegui registrar.' };
      setUltimo(r);
      bipe.current(false);
    } finally {
      lendo.current = false;
    }
  }

  /** A ENTRADA MANUAL, que não é um consolo.
   *
   *  Ela cobre três casos de verdade: o leitor USB, que "digita" o código e
   *  dá Enter sozinho; a etiqueta rasgada, que a câmera não lê e o olho lê;
   *  e o aparelho sem câmera. O caminho depois do Enter é o MESMO da
   *  câmera — mesma função, mesmo antirrepique desligado de propósito,
   *  porque quem digita duas vezes quis contar duas. */
  async function enviarManual(e: React.FormEvent) {
    e.preventDefault();
    const codigo = manual.trim();
    if (!codigo) return;
    setManual('');
    await entregar(codigo);
  }

  const semCamera = !temCamera();

  return (
    <section className="mq-cam" aria-label="Leitor de etiquetas">
      <div className="mq-cam__head">
        <div>
          <p className="mq-eyebrow">Leitura por câmera</p>
          <h3 className="mq-subtitle">{titulo}</h3>
          {dica && <p className="mq-hint">{dica}</p>}
        </div>
        {/* "Desligar a câmera" e não "Fechar": a tela que abriu o leitor
            tem o próprio Fechar, e dois botões com o mesmo nome fazendo
            coisas diferentes na mesma tela é como se perde um inventário.
            O nome veio do painel clássico, onde ela já o conhece. */}
        <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" onClick={fechar}>
          <Icone nome="close" />
          Desligar a câmera
        </button>
      </div>

      {!semCamera && (
        <div className={estado === 'lendo' ? 'mq-cam__palco is-lendo' : 'mq-cam__palco'}>
          <video ref={video} playsInline muted autoPlay />
          <div className="mq-cam__alvo" aria-hidden="true" />
          {estado === 'abrindo' && <p className="mq-cam__estado">Abrindo a câmera…</p>}
          {pausado && estado === 'lendo' && (
            <p className="mq-cam__estado">Pausado — responda a pergunta acima para continuar</p>
          )}
        </div>
      )}

      {estado === 'erro' && (
        <p className="mq-note mq-note--risk" role="alert">
          <Icone nome="alert" />
          <span>{erro}</span>
        </p>
      )}

      {/* O ÚLTIMO RESULTADO fica na tela até o próximo. Quem está de pé,
          com uma peça na mão, não consegue olhar a lista inteira a cada
          bipada — mas olha uma linha. */}
      {ultimo && (
        <p
          className={ultimo.ok ? 'mq-note mq-note--ok' : 'mq-note mq-note--risk'}
          role="status"
          aria-live="polite"
        >
          <Icone nome={ultimo.ok ? 'check' : 'alert'} />
          <span>{ultimo.texto}</span>
        </p>
      )}

      <form className="mq-cam__manual" onSubmit={enviarManual}>
        <label className="mq-field">
          <span>Ou digite o código da etiqueta</span>
          <input
            className="mq-input"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="230076"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Código da etiqueta"
          />
        </label>
        <button type="submit" className="mq-btn mq-btn--secondary" disabled={!manual.trim()}>
          Contar
        </button>
      </form>
    </section>
  );
}
