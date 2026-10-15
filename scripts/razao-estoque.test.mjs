/** Fase 4, invariante 1 — a razão contábil, cobrada por um teste em vez de
 *  por disciplina.
 *
 *      produtos.qtd == SUM(movimentos.qtd)   para todo SKU
 *
 *  `GET /api/estoque/conferir` prova isso sobre os DADOS, e é a prova final.
 *  Mas ele só acusa depois que o número já saiu errado, num banco que já
 *  existe. Este teste olha o CÓDIGO e reprova o caminho que produziria a
 *  divergência, antes de qualquer dado se mexer.
 *
 *  Cinco regras, todas com o mesmo dono: `estoque.js › movimentar`.
 *
 *   1. `produtos.qtd` só é escrito por `estoque.js`;
 *   2. dentro de `estoque.js`, só dentro de `movimentar`;
 *   3. produto nasce com `qtd` literal 0 — quem cria com saldo pronto está
 *      inventando um saldo sem movimento que o explique;
 *   4. `INSERT INTO movimentos` só em `estoque.js`;
 *   5. `UPDATE movimentos` nunca toca `qtd`. Corrigir a IDENTIDADE de um
 *      movimento (qual variação saiu) é legítimo; corrigir a QUANTIDADE por
 *      fora quebraria a soma que sustenta a invariante.
 *
 *  Exceção nova não passa por aqui em silêncio: ela precisa entrar na lista
 *  de baixo, com motivo escrito, o que obriga alguém a decidir.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FONTE = join(RAIZ, 'api', 'src');
const DONO = 'api/src/estoque.js';

/** Exceções conhecidas, cada uma com o motivo pelo qual NÃO quebra a razão.
 *  Acrescentar arquivo aqui é decisão humana, não conveniência. */
const EXCECOES = {
  'DELETE FROM movimentos': {
    'api/src/produtos.js':
      'apagar produto remove a linha de `produtos` e a razão dele no MESMO batch — '
      + 'os dois lados somem juntos, então a invariante continua fechando',
  },
};

function arquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return caminho.endsWith('.js') ? [caminho] : [];
  });
}

const falhas = [];
const reprovar = (arquivo, linha, regra, trecho) =>
  falhas.push(`${arquivo}:${linha}  ${regra}\n        ${trecho.trim().slice(0, 120)}`);

/** Linha (1-based) de uma posição no texto. */
const linhaDe = (texto, pos) => texto.slice(0, pos).split('\n').length;

/** O corpo de uma função de topo, para saber se um trecho está dentro dela.
 *  A fronteira é a primeira `}` na coluna zero depois da assinatura — contar
 *  chaves não serve aqui, porque a assinatura de `movimentar` já abre uma
 *  com o parâmetro desestruturado. Se a função deixar de ser de topo, o
 *  teste reprova em vez de aprovar por engano. */
function corpoDa(texto, assinatura) {
  const inicio = texto.indexOf(assinatura);
  if (inicio < 0) return null;
  const fim = texto.indexOf('\n}', inicio);
  return fim < 0 ? null : [inicio, fim];
}

const fontes = arquivos(FONTE).map((caminho) => ({
  rel: relative(RAIZ, caminho).replace(/\\/g, '/'),
  texto: readFileSync(caminho, 'utf8'),
}));

for (const { rel, texto } of fontes) {
  /* 1 e 2 — quem escreve produtos.qtd. */
  for (const m of texto.matchAll(/UPDATE\s+produtos\s+SET\s+([\s\S]{0,400}?)(?:`|'|")/gi)) {
    if (!/\bqtd\s*=/i.test(m[1])) continue;
    if (rel !== DONO) {
      reprovar(rel, linhaDe(texto, m.index), 'escreve produtos.qtd fora de estoque.js', m[0]);
      continue;
    }
    const corpo = corpoDa(texto, 'export function movimentar(');
    if (!corpo || m.index < corpo[0] || m.index > corpo[1]) {
      reprovar(rel, linhaDe(texto, m.index), 'escreve produtos.qtd fora de movimentar()', m[0]);
    }
  }

  /* 3 — produto nasce sem saldo. */
  for (const m of texto.matchAll(/INSERT\s+INTO\s+produtos\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/gi)) {
    const colunas = m[1].split(',').map((c) => c.trim().toLowerCase());
    const valores = m[2].split(',').map((v) => v.trim());
    const i = colunas.indexOf('qtd');
    if (i < 0) continue;
    if (valores[i] !== '0') {
      reprovar(rel, linhaDe(texto, m.index),
        `produto criado com qtd = ${valores[i]} em vez de 0 — saldo sem movimento que o explique`, m[0]);
    }
  }

  /* 4 — quem grava na razão. */
  for (const m of texto.matchAll(/INSERT\s+INTO\s+movimentos\b/gi)) {
    if (rel !== DONO) {
      reprovar(rel, linhaDe(texto, m.index), 'grava movimento fora de estoque.js', m[0]);
    }
  }

  /* 5 — identidade pode ser corrigida; quantidade, não. */
  for (const m of texto.matchAll(/UPDATE\s+movimentos\s+SET\s+([\s\S]{0,400}?)(?:`|'|")/gi)) {
    if (/\bqtd\s*=/i.test(m[1])) {
      reprovar(rel, linhaDe(texto, m.index),
        'corrige a QUANTIDADE de um movimento por fora — isso quebra a soma da razão', m[0]);
    }
  }

  /* Exceções declaradas. */
  for (const [padrao, permitidos] of Object.entries(EXCECOES)) {
    const re = new RegExp(padrao.replace(/\s+/g, '\\s+'), 'gi');
    for (const m of texto.matchAll(re)) {
      if (rel === DONO || permitidos[rel]) continue;
      reprovar(rel, linhaDe(texto, m.index),
        `"${padrao}" em arquivo não declarado — se for legítimo, declare o motivo no teste`, m[0]);
    }
  }
}

/* A prova sobre os dados tem de continuar existindo. */
const estoque = fontes.find((f) => f.rel === DONO);
if (!estoque) falhas.push(`${DONO} sumiu — o dono da razão não existe mais`);
else if (!/export async function conferirEstoque\(/.test(estoque.texto)) {
  falhas.push(`${DONO}: conferirEstoque() sumiu — é a prova de /api/estoque/conferir`);
}

if (falhas.length) {
  console.error('Razão contábil: REPROVADO\n');
  for (const f of falhas) console.error('  ' + f);
  console.error('\nToda mudança de estoque passa por estoque.js › movimentar. Ver api/REGRAS.md §19.');
  process.exit(1);
}

const quantos = fontes.length;
console.log(`Razão contábil: ok — ${quantos} módulos varridos, um único dono de produtos.qtd`);
