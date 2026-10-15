/** De qual peça é esta foto? — perguntado ao nome do arquivo, e só a ele.
 *
 *  A Sthefany fotografa em lote e nomeia pelo código:
 *
 *      132721.jpg   132721_1.jpg   132721_2.jpg
 *      132721-frente.jpg           132721-detalhe.jpg
 *
 *  ── A armadilha que este arquivo existe para não cair ───────────────────
 *
 *  Existe uma convenção histórica nas planilhas da Marquesa em que
 *  `212223`, `212223-2` e `212223-3` são a MESMA peça comercial — a
 *  primeira, a segunda e a terceira compra dela. Seria tentador remover
 *  qualquer sufixo `-N` aqui e acabar com o assunto.
 *
 *  Seria errado. O hífen também faz parte de códigos legítimos — o catálogo
 *  de produção tem exatamente um, `MONTE-COLAR`, e ele é real. A convenção
 *  de compra pertence ao importador de HISTÓRICO, que é onde ela tem
 *  significado (ver docs/domains/SKU-SUFIXO-DE-COMPRA.md); o identificador
 *  genérico de foto não pode herdá-la, porque aqui ela não quer dizer nada.
 *
 *  Então nada é removido por regra. O que existe é uma BUSCA, do candidato
 *  mais específico para o menos, e quem decide é o catálogo:
 *
 *      132721-detalhe-2  →  132721-detalhe-2 · 132721-detalhe · 132721
 *
 *  O primeiro que existir como produto vence. Se DOIS existirem — o dia em
 *  que `212223` e `212223-2` forem ambos cadastrados — o resultado é
 *  `nome_ambiguo` e o arquivo para. Adivinhar ali faria a vitrine anunciar
 *  uma peça mostrando outra, que é o estrago que este projeto recusa em
 *  todos os outros lugares.
 *
 *  A normalização é a canônica (`sku.js › normSku`), nunca uma segunda
 *  escrita à mão.
 */
import { normSku, SKU_LIMPO } from '../sku.js';

export const SITUACAO = {
  VINCULADO: 'vinculado',
  MULTIPLAS: 'multiplas',
  NAO_ENCONTRADO: 'sku_nao_encontrado',
  AMBIGUO: 'nome_ambiguo',
  INVALIDO: 'nome_invalido',
  DUPLICADO: 'duplicado',
  ERRO_UPLOAD: 'erro_upload',
};

const EXTENSOES = /\.(jpe?g|png|webp|gif|bmp|heic|heif|tiff?)$/i;

/** O nome sem a pasta e sem a extensão. Aceita os dois separadores porque
 *  um ZIP feito no Windows e um arrastar-e-soltar no Mac chegam diferentes. */
export function baseDoArquivo(nome) {
  const so = String(nome == null ? '' : nome).split(/[\\/]/).pop() || '';
  return so.replace(EXTENSOES, '').trim();
}

/** Os candidatos a código, do mais específico para o menos.
 *
 *  `132721_2` produz `132721_2` e depois `132721`. Nenhum deles é "o
 *  código": são as hipóteses, em ordem de especificidade, e quem responde é
 *  o catálogo. */
export function candidatosDoNome(nome) {
  const base = baseDoArquivo(nome);
  if (!base) return [];
  const pedacos = base.split(/[-_]/);
  const vistos = new Set();
  const saida = [];
  for (let i = pedacos.length; i >= 1; i--) {
    /* Remonta com os separadores originais, para `MONTE-COLAR` voltar a ser
       `MONTE-COLAR` e não `MONTECOLAR`. */
    let fim = 0, corte = 0;
    for (let j = 0; j < i; j++) { corte = fim + pedacos[j].length; fim = corte + 1; }
    const candidato = normSku(base.slice(0, corte));
    if (!candidato || vistos.has(candidato)) continue;
    if (!SKU_LIMPO.test(candidato)) continue;
    vistos.add(candidato);
    saida.push(candidato);
  }
  return saida;
}

/** O veredito para UM arquivo, contra um conjunto de códigos conhecidos.
 *
 *  `catalogo` é um Set de SKUs já normalizados. Fica do lado de fora porque
 *  um lote de 300 fotos não pode fazer 300 consultas — quem chama lê o
 *  catálogo uma vez.
 */
export function casarArquivo(nome, catalogo) {
  const arquivo = String(nome == null ? '' : nome);
  const base = baseDoArquivo(arquivo);
  const candidatos = candidatosDoNome(arquivo);

  if (!base || !candidatos.length) {
    return {
      arquivo, base, candidatos, sku: null, situacao: SITUACAO.INVALIDO,
      detalhe: 'O nome do arquivo não contém nada que pareça um código.',
    };
  }

  const encontrados = candidatos.filter((c) => catalogo.has(c));
  if (!encontrados.length) {
    return {
      arquivo, base, candidatos, sku: null, situacao: SITUACAO.NAO_ENCONTRADO,
      detalhe: `Nenhum código do catálogo corresponde a "${base}".`,
    };
  }
  if (encontrados.length > 1) {
    return {
      arquivo, base, candidatos, sku: null, situacao: SITUACAO.AMBIGUO,
      detalhe: `Dois códigos do catálogo poderiam ser o dono: ${encontrados.join(' e ')}. `
        + 'Renomeie o arquivo com o código inteiro para desfazer a dúvida.',
    };
  }
  return { arquivo, base, candidatos, sku: encontrados[0], situacao: SITUACAO.VINCULADO, detalhe: null };
}

/** O lote inteiro, já AGRUPADO por código.
 *
 *  Da segunda foto do mesmo código em diante a situação vira `multiplas` —
 *  que não é erro nem duplicata: é a galeria funcionando. Antes desta fase
 *  a segunda foto de uma peça simplesmente não tinha onde existir.
 *
 *  A ordem dentro de cada código é a ordem dos arquivos como vieram, que é
 *  a ordem em que a pessoa os selecionou. É um palpite melhor que qualquer
 *  outro, e ela pode reordenar depois.
 */
export function casarLote(nomes, catalogo) {
  const itens = [];
  const porSku = new Map();
  const arquivosVistos = new Set();

  for (const nome of nomes || []) {
    const arquivo = String(nome == null ? '' : nome);
    if (arquivosVistos.has(arquivo)) {
      itens.push({
        arquivo, base: baseDoArquivo(arquivo), candidatos: [], sku: null,
        situacao: SITUACAO.DUPLICADO, ordemNoSku: null,
        detalhe: 'Este mesmo nome de arquivo aparece duas vezes no lote.',
      });
      continue;
    }
    arquivosVistos.add(arquivo);

    const r = casarArquivo(arquivo, catalogo);
    if (r.situacao === SITUACAO.VINCULADO) {
      const jaTem = porSku.get(r.sku) || [];
      r.ordemNoSku = jaTem.length;
      if (jaTem.length) r.situacao = SITUACAO.MULTIPLAS;
      jaTem.push(r);
      porSku.set(r.sku, jaTem);
    } else {
      r.ordemNoSku = null;
    }
    itens.push(r);
  }

  const contar = (s) => itens.filter((i) => i.situacao === s).length;
  return {
    itens,
    grupos: [...porSku.entries()].map(([sku, fotos]) => ({ sku, fotos: fotos.length })),
    resumo: {
      arquivos: itens.length,
      vinculados: contar(SITUACAO.VINCULADO) + contar(SITUACAO.MULTIPLAS),
      codigos: porSku.size,
      multiplas: contar(SITUACAO.MULTIPLAS),
      naoEncontrados: contar(SITUACAO.NAO_ENCONTRADO),
      ambiguos: contar(SITUACAO.AMBIGUO),
      invalidos: contar(SITUACAO.INVALIDO),
      duplicados: contar(SITUACAO.DUPLICADO),
    },
  };
}
