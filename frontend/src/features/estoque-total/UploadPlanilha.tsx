import { useRef, useState } from 'react';
import type { ModoPlanilha } from './tipos';
import { parsePlanilha, type ResultadoParse } from './parsePlanilha';

interface Props {
  modo: ModoPlanilha;
  /** Só dispara quando a pessoa clica em "Analisar planilha" — selecionar
   *  o arquivo nunca, sozinho, manda nada pro servidor (§16 do pedido). */
  aoAnalisar: (resultado: ResultadoParse) => void;
  analisando: boolean;
  aoVoltar: () => void;
}

/** Seleciona → lê no navegador → mostra o que foi identificado → só então
 *  a pessoa decide analisar. Nada é enviado à API aqui dentro. */
export function UploadPlanilha({ modo, aoAnalisar, analisando, aoVoltar }: Props) {
  const [resultado, setResultado] = useState<ResultadoParse | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function selecionar(file: File) {
    setLendo(true);
    setErroLeitura(null);
    setResultado(null);
    try {
      const r = await parsePlanilha(file);
      if (r.semColunaSku) {
        setErroLeitura(
          'Não reconheci uma coluna de código nesta planilha. Confira se ela tem uma coluna chamada "SKU", "Código" ou "Id Produto".',
        );
        return;
      }
      if (!r.produtos.length) {
        setErroLeitura('Essa planilha não tem nenhuma linha com código preenchido.');
        return;
      }
      setResultado(r);
    } catch {
      setErroLeitura('Não consegui ler esse arquivo. Confira se é uma planilha .xlsx ou .csv.');
    } finally {
      setLendo(false);
    }
  }

  return (
    <div className="cartao" style={{ padding: 'var(--r5)' }}>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void selecionar(f);
        }}
      />

      {!resultado && (
        <div className="dropzone-upload" onClick={() => inputRef.current?.click()}>
          <p>
            <strong>Selecionar arquivo</strong>
          </p>
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>
            Planilha .xlsx ou .csv com o código de cada peça.
          </p>
          {lendo && <p style={{ marginTop: 'var(--r3)' }}>Lendo o arquivo…</p>}
        </div>
      )}

      {erroLeitura && (
        <div className="aviso" data-tom="critico" style={{ marginTop: 'var(--r4)' }}>
          {erroLeitura}
        </div>
      )}

      {resultado && (
        <>
          <div className="aviso" data-tom="neutro">
            <b>{resultado.nomeArquivo}</b>
            <div className="corpo">
              {resultado.linhasLidas} {resultado.linhasLidas === 1 ? 'linha lida' : 'linhas lidas'} ·{' '}
              {resultado.produtos.length}{' '}
              {resultado.produtos.length === 1 ? 'código identificado' : 'códigos identificados'}
              {resultado.sufixosSomados.length > 0 && (
                <>
                  {' '}
                  · {resultado.sufixosSomados.length}{' '}
                  {resultado.sufixosSomados.length === 1
                    ? 'código com sufixo somado ao código base'
                    : 'códigos com sufixo somados ao código base'}
                </>
              )}
            </div>
          </div>

          {resultado.conflitosDescricao.length > 0 && (
            <div className="aviso" data-tom="atencao" style={{ marginTop: 'var(--r3)' }}>
              <b>
                {resultado.conflitosDescricao.length}{' '}
                {resultado.conflitosDescricao.length === 1
                  ? 'código tem descrição diferente entre sufixos'
                  : 'códigos têm descrição diferente entre sufixos'}
              </b>
              <div className="corpo">Foram somados assim mesmo. Confira se são a mesma peça, depois da análise.</div>
            </div>
          )}

          <div className="acoes" style={{ marginTop: 'var(--r4)' }}>
            <button type="button" className="btn btn-leitura" onClick={() => setResultado(null)}>
              Trocar arquivo
            </button>
            <button
              type="button"
              className="btn btn-analise"
              disabled={analisando}
              onClick={() => aoAnalisar(resultado)}
            >
              {analisando
                ? 'Analisando…'
                : modo === 'estoque-total'
                  ? 'Analisar planilha'
                  : 'Analisar peças novas'}
            </button>
          </div>
        </>
      )}

      <div className="acoes" style={{ marginTop: 'var(--r4)' }}>
        <button type="button" className="btn btn-leitura btn-sm" onClick={aoVoltar} disabled={analisando}>
          Voltar
        </button>
      </div>
    </div>
  );
}
