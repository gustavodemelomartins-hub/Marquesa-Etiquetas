import { useRef, useState } from 'react';
import { enviarArquivo, type Connection } from '../../services/client';

interface Props {
  conexao: Connection;
  sku: string;
  /** Chamado depois que a foto foi gravada — quem chama recarrega o estado. */
  aoEnviar: () => void;
  compacto?: boolean;
}

/** Lado maior da foto enviada. Foto de celular sai com 4000 px e 3–6 MB;
 *  1600 px é mais que a loja e a etiqueta usam, e cabe folgado no limite
 *  de 8 MB do servidor. */
const LADO_MAXIMO = 1600;

/** Reduz no próprio aparelho antes de enviar. Se o navegador não conseguir
 *  decodificar (formato raro), manda o arquivo original e o servidor diz
 *  se aceita — nunca some com a foto em silêncio. */
async function reduzir(arquivo: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext('2d');
    if (!ctx) return arquivo;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    return blob ?? arquivo;
  } catch {
    return arquivo;
  }
}

/** SUBIR A FOTO DA PEÇA — da galeria (o jeito preferido) ou da câmera.
 *
 *  Dois botões e não um: no celular, o `capture` abre a câmera direto e
 *  esconde a galeria. Quem já tem a foto pronta precisa do outro. */
export function EnviarFoto({ conexao, sku, aoEnviar, compacto = false }: Props) {
  const galeria = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro('');
    setEnviando(true);
    try {
      const blob = await reduzir(arquivo);
      /* A rota responde 200 com `{erro}` quando recusa por regra (formato,
         tamanho, R2 desligado) — por isso o `erro` é lido mesmo no sucesso. */
      const r = await enviarArquivo<{ ok?: boolean; erro?: string }>(
        conexao, `/api/produtos/${encodeURIComponent(sku)}/foto/original`, blob,
      );
      if (r && r.erro) setErro(r.erro);
      else aoEnviar();
    } catch (x) {
      setErro(x instanceof Error ? x.message : 'Não consegui enviar a foto.');
    } finally {
      setEnviando(false);
    }
  }

  const tam = compacto ? ' mq-btn--sm' : '';
  return (
    <div className="mq-foto-envio">
      <div className="mq-btns">
        <button
          type="button"
          className={`mq-btn mq-btn--secondary${tam}`}
          disabled={enviando}
          onClick={() => galeria.current?.click()}
        >
          {enviando ? 'Enviando…' : 'Subir foto'}
        </button>
        <button
          type="button"
          className={`mq-btn mq-btn--ghost${tam}`}
          disabled={enviando}
          onClick={() => camera.current?.click()}
        >
          Tirar foto
        </button>
      </div>
      <input ref={galeria} type="file" accept="image/*" hidden onChange={aoEscolher}
        aria-label={`Foto da peça ${sku}`} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={aoEscolher}
        aria-label={`Foto da peça ${sku} pela câmera`} />
      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
    </div>
  );
}
