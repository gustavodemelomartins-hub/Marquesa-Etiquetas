// Lê os contratos HTTP servidos pelo Worker direto do código, sem subir nada.
//
// Existe para o strangler: enquanto uma rota vive no despachante de
// `api/src/index.js` e depois passa a viver num módulo de rota declarado, o
// conjunto método+caminho tem de continuar idêntico. O inventário versionado
// em `docs/architecture/api-contracts.json` é a linha de base dessa igualdade.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const DESPACHANTE = 'api/src/index.js';
const PASTA_DE_ROTAS = 'api/src/http/routes';

const METODOS = /met === '([A-Z]+)'/g;

/** `/^\/api\/produtos\/([^/]+)\/foto\/(original|tratada)$/` vira
 *  `/api/produtos/:param/foto/:param`: o que importa é a forma do caminho. */
function caminhoDoRegex(fonte) {
  let alvo = fonte.replace(/^\^/, '').replace(/\$$/, '').replace(/\\\//g, '/');
  alvo = alvo.replace(/\((?:\?:)?[^)]*\)/g, ':param');
  return alvo;
}

/** Isola a condição de cada `if` fechando parênteses, e não procurando `{`:
 *  boa parte do despachante responde na mesma linha, sem bloco. */
function condicoesDoDespachante(texto) {
  // Tudo que decide antes desta linha responde sem Bearer: health, callback
  // OAuth e a foto assinada por HMAC. Depois dela, a chave é obrigatória.
  const portaDaChave = texto.indexOf('if (!checarChave(');
  if (portaDaChave < 0) throw new Error('porta de autenticação não encontrada em ' + DESPACHANTE);
  const condicoes = [];
  const inicio = /\bif\s*\(/g;
  let achado;
  while ((achado = inicio.exec(texto))) {
    let profundidade = 1;
    let i = achado.index + achado[0].length;
    for (; i < texto.length && profundidade > 0; i += 1) {
      if (texto[i] === '(') profundidade += 1;
      else if (texto[i] === ')') profundidade -= 1;
    }
    const condicao = texto.slice(achado.index + achado[0].length, i - 1);
    const auth = achado.index < portaDaChave ? 'sem-bearer' : 'bearer';
    if (/\bpath\b/.test(condicao)) condicoes.push({ condicao, auth });
  }
  return condicoes;
}

function contratosDaCondicao({ condicao, auth }) {
  const caminhos = [];
  for (const achado of condicao.matchAll(/path === '([^']+)'/g)) caminhos.push(achado[1]);
  for (const achado of condicao.matchAll(/path\.match\(\/(.+?)\/\)/g)) caminhos.push(caminhoDoRegex(achado[1]));
  if (!caminhos.length) return [];

  const metodos = [...condicao.matchAll(METODOS)].map((achado) => achado[1]);
  const unicos = [...new Set(metodos.length ? metodos : ['ANY'])];
  return caminhos.flatMap((caminho) => unicos.map((metodo) => ({ contrato: `${metodo} ${caminho}`, auth })));
}

/** Rotas já extraídas do despachante declaram método e caminho num módulo
 *  próprio; a forma esperada é `export const rota = { metodo, caminho }` ou
 *  uma lista `export const rotas = [{ metodo, caminho }, ...]`. */
function contratosDeclarados(raiz) {
  const pasta = path.join(raiz, PASTA_DE_ROTAS);
  let entradas;
  try {
    entradas = readdirSync(pasta);
  } catch {
    return [];
  }
  const contratos = [];
  for (const entrada of entradas) {
    const completo = path.join(pasta, entrada);
    if (statSync(completo).isDirectory()) continue;
    if (!entrada.endsWith('.js')) continue;
    const texto = readFileSync(completo, 'utf8');
    const declaracao = /metodo:\s*'([A-Z]+)'\s*,\s*caminho:\s*'([^']+)'\s*,\s*auth:\s*'(bearer|sem-bearer)'/g;
    for (const achado of texto.matchAll(declaracao)) {
      // O nome do parâmetro é documentação da rota, não parte do contrato:
      // `/api/estoque/:sku/movimentos` e `/api/estoque/:param/movimentos` são
      // o mesmo caminho para quem chama.
      const caminho = achado[2].replace(/\/:[A-Za-z0-9_]+/g, '/:param');
      contratos.push({ contrato: `${achado[1]} ${caminho}`, auth: achado[3] });
    }
  }
  return contratos;
}

/** Devolve `{ contrato, auth }` por método+caminho, ordenado e sem repetição.
 *  Um mesmo caminho servido antes e depois da porta da chave conta uma vez,
 *  como `sem-bearer`: é assim que a foto assinada aparece hoje. */
export function lerContratos(raiz) {
  const despachante = readFileSync(path.join(raiz, DESPACHANTE), 'utf8');
  const achados = [
    ...condicoesDoDespachante(despachante).flatMap(contratosDaCondicao),
    ...contratosDeclarados(raiz),
  ];
  const porContrato = new Map();
  for (const achado of achados) {
    const anterior = porContrato.get(achado.contrato);
    if (!anterior || achado.auth === 'sem-bearer') porContrato.set(achado.contrato, achado);
  }
  return [...porContrato.values()].sort((a, b) => a.contrato.localeCompare(b.contrato, 'en'));
}
