#!/usr/bin/env node
/** Gera `docs/ux/07-mapping/paridade-prototype-v2.md` a partir do manifesto.
 *
 *  A FONTE É O CÓDIGO, e este script só o transcreve. Uma matriz mantida à
 *  mão num .md diverge do repositório na primeira semana e ninguém percebe —
 *  foi para isso que `frontend/src/testing/paridade.ts` nasceu com teste que
 *  confere cada linha contra o arquivo que ela cita.
 *
 *    node scripts/build-paridade.mjs            reescreve o documento
 *    node scripts/build-paridade.mjs --check    falha se ele estiver velho
 *
 *  O `--check` existe pelo mesmo motivo do painel do projeto: um documento
 *  gerado que alguém esqueceu de regerar é pior que documento nenhum, porque
 *  ele tem cara de atual.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const ORIGEM = 'frontend/src/testing/paridade.ts';
const DESTINO = 'docs/ux/07-mapping/paridade-prototype-v2.md';

/* O manifesto é TypeScript com tipos. Em vez de compilar, lê-se o literal:
   ele é dado puro, e o que interessa aqui são os campos, não os tipos. */
const fonte = readFileSync(raiz + ORIGEM, 'utf8');

function extrairModulos() {
  const modulos = [];
  const reModulo = /\{\s*\n\s*id: '([^']+)',\s*\n\s*rotulo: '([^']+)',\s*\n\s*prototipo: '([^']+)',\s*\n\s*capacidades: \[/g;
  let m;
  while ((m = reModulo.exec(fonte))) {
    const [, id, rotulo, prototipo] = m;
    const corpo = ateOFecha(fonte, reModulo.lastIndex - 1);
    modulos.push({ id, rotulo, prototipo, capacidades: extrairCapacidades(corpo) });
  }
  return modulos;
}

/** Do `[` até o `]` que o fecha, contando aninhamento. */
function ateOFecha(texto, abre) {
  let nivel = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === '[') nivel++;
    else if (texto[i] === ']' && --nivel === 0) return texto.slice(abre + 1, i);
  }
  throw new Error('bloco de capacidades não fecha');
}

function extrairCapacidades(corpo) {
  const out = [];
  /* `\s*` entre os campos, e não um espaço literal: um rótulo comprido quebra
     a linha, e uma expressão de uma linha só DEIXAVA A CAPACIDADE DE FORA em
     silêncio — a matriz publicada dizia 120 onde o manifesto tinha 128. Era
     exatamente a divergência que este gerador existe para impedir, cometida
     por ele mesmo. Daí a conferência de contagem no fim. */
  const re = /id:\s*'([^']+)',\s*rotulo:\s*'((?:[^'\\]|\\.)*)',\s*estado:\s*'([a-z]+)'/g;
  let m;
  while ((m = re.exec(corpo))) {
    const [, id, rotulo, estado] = m;
    /* O trecho desta capacidade vai até o id seguinte (ou o fim). */
    const fim = corpo.slice(re.lastIndex).search(/\n\s*id:\s*'/);
    const trecho = corpo.slice(m.index, fim === -1 ? corpo.length : re.lastIndex + fim);
    out.push({
      id,
      rotulo: rotulo.replace(/\\'/g, "'"),
      estado,
      rota: (trecho.match(/rota:\s*'([^']+)'/) || [])[1] ?? null,
      porque: juntar(trecho, 'porque'),
      arquivo: (trecho.match(/arquivo:\s*`\$\{F\}([^`]+)`/) || [])[1] ?? null,
    });
  }

  /* Uma capacidade que o padrão não casar sairia da matriz sem reclamar.
     Contar os `id:` declarados e comparar é o que torna esse silêncio
     impossível. */
  const declarados = (corpo.match(/\n\s*id:\s*'/g) || []).length;
  if (declarados !== out.length) {
    throw new Error(
      `O bloco tem ${declarados} capacidades e o padrão leu ${out.length}. `
      + 'Alguma linha do manifesto está num formato que o gerador não entende.',
    );
  }
  return out;
}

/** `porque` é escrito como várias strings concatenadas com `+`. Juntá-las é
 *  o que faz a frase chegar inteira ao documento. */
function juntar(trecho, campo) {
  const i = trecho.indexOf(`${campo}: `);
  if (i === -1) return null;
  const resto = trecho.slice(i + campo.length + 2);
  const partes = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let m;
  let cursor = 0;
  while ((m = re.exec(resto))) {
    /* Para no primeiro campo novo: entre uma string e a próxima só pode
       haver espaço, quebra de linha e o `+`. */
    const entre = resto.slice(cursor, m.index);
    if (partes.length && !/^[\s+]*$/.test(entre)) break;
    partes.push((m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"'));
    cursor = re.lastIndex;
  }
  return partes.length ? partes.join('') : null;
}

const SIMBOLO = {
  pronta: '🟢 pronta',
  parcial: '🟡 parcial',
  pendente: '⚪ pendente',
  indisponivel: '⛔ indisponível',
};

const modulos = extrairModulos();
if (!modulos.length) {
  console.error(`Nenhum módulo lido de ${ORIGEM}. O formato do manifesto mudou?`);
  process.exit(1);
}

const todas = modulos.flatMap((m) => m.capacidades);
const conta = (e) => todas.filter((c) => c.estado === e).length;
const suportadas = todas.length - conta('indisponivel');

const linhas = [];
linhas.push('# Matriz Protótipo → V2');
linhas.push('');
linhas.push('> **Gerado.** A fonte é [`' + ORIGEM + '`](../../../' + ORIGEM + '), e');
linhas.push('> `paridade.test.ts` confere cada linha contra o arquivo que ela cita.');
linhas.push('> Editar este `.md` à mão não muda nada: rode');
linhas.push('> `node scripts/build-paridade.mjs`.');
linhas.push('');
linhas.push('A régua é **capacidade**, não rota. Uma matriz de rotas daria 13 de 13');
linhas.push('com Vendas sendo uma tabela — a rota existe, e o Painel, os Lançamentos,');
linhas.push('o Monte seu Colar e a Saída não. O que a usuária reconhece é o que ela');
linhas.push('consegue fazer.');
linhas.push('');
linhas.push('## Placar');
linhas.push('');
linhas.push('| | capacidades |');
linhas.push('|---|---|');
linhas.push(`| 🟢 pronta | ${conta('pronta')} |`);
linhas.push(`| 🟡 parcial | ${conta('parcial')} |`);
linhas.push(`| ⚪ pendente — o backend tem, a tela não | ${conta('pendente')} |`);
linhas.push(`| ⛔ indisponível — o backend não sustenta | ${conta('indisponivel')} |`);
linhas.push(`| **total** | **${todas.length}** |`);
linhas.push('');
linhas.push(`**${conta('pronta')} de ${suportadas}** capacidades que o backend sustenta já estão`);
linhas.push('na V2. As `⛔ indisponível` não contam contra o frontend: entregá-las');
linhas.push('exigiria simular algo que o servidor não faz, e a tela diz isso em vez de');
linhas.push('fingir.');
linhas.push('');

for (const m of modulos) {
  const p = (e) => m.capacidades.filter((c) => c.estado === e).length;
  linhas.push(`## ${m.rotulo}`);
  linhas.push('');
  linhas.push(`Autoridade de UX: \`${m.prototipo}\` · `
    + `🟢 ${p('pronta')} · 🟡 ${p('parcial')} · ⚪ ${p('pendente')} · ⛔ ${p('indisponivel')}`);
  linhas.push('');
  linhas.push('| Capacidade | Estado | Onde | Observação |');
  linhas.push('|---|---|---|---|');
  for (const c of m.capacidades) {
    const onde = c.rota ? `\`${c.rota}\`` : (c.arquivo ? `\`${c.arquivo.replace(/^\//, '')}\`` : '—');
    const obs = (c.porque ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    linhas.push(`| ${c.rotulo} | ${SIMBOLO[c.estado]} | ${onde} | ${obs || '—'} |`);
  }
  linhas.push('');
}

const texto = linhas.join('\n') + '\n';

if (process.argv.includes('--check')) {
  let atual = '';
  try { atual = readFileSync(raiz + DESTINO, 'utf8'); } catch { /* ainda não existe */ }
  if (atual !== texto) {
    console.error(`${DESTINO} está desatualizado. Rode: node scripts/build-paridade.mjs`);
    process.exit(1);
  }
  console.log(`${DESTINO} está em dia.`);
} else {
  writeFileSync(raiz + DESTINO, texto, 'utf8');
  console.log(`${DESTINO} · ${todas.length} capacidades em ${modulos.length} módulos`);
}
