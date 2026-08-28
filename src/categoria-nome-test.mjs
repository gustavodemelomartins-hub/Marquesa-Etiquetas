/** A categoria de uma peça pelo NOME — e a trava contra a duplicação.
 *
 *  Duas coisas ficam provadas aqui:
 *
 *   1. o classificador acerta os nomes que existem de verdade no histórico,
 *      inclusive os erros de digitação da planilha (`Binco`, `Piecing`);
 *   2. a tabela do BACKEND (`api/src/categoria-nome.js`) e a do PAINEL
 *      LEGADO (`CAT_MAP` em `src/dashboard.tpl.html`) são idênticas.
 *
 *  O item 2 é o que importa a longo prazo. A tabela existe em dois lugares
 *  porque o painel de etiquetas classifica planilha no navegador, sem rede, e
 *  não pode importar um módulo do Worker. Duplicação declarada e verificada é
 *  aceitável; duplicação silenciosa é como "José" e "jose" viraram duas
 *  clientes. Se alguém acrescentar `tiara:'Outros'` num lado só, este teste
 *  falha no mesmo dia.
 *
 *  E o item 3, que é o defeito que originou o arquivo: `tipo` NÃO é
 *  categoria. `Banhada`, `Bruto` e `Prata 925` são material, e o painel os
 *  estava desenhando na rosca "Distribuição por categoria vendida".
 */
import { readFileSync } from 'node:fs';
import { CAT_MAP, categoriaPeloNome, categoriaDoItem } from '../api/src/categoria-nome.js';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

console.log('\n── 1. nomes reais do histórico da Marquesa');
/* todos copiados da planilha importada, sem inventar nenhum */
const reais = [
  ['Brinco Maxi Orgânico Mocha Mousse Banho de Ouro 18k', 'Brinco'],
  ['Colar Cordão Baiano 2mm Banho de Ouro 28k', 'Colar'],
  ['Colar Borboleta Madrepérola Banho de Ouro 18k', 'Colar'],
  ['Argola Borboleta Madrepérola Banho de Ouro 18k', 'Argola'],
  ['Anel Losangos Cravejados Banho de Ouro 18k', 'Anel'],
  ['Anel Cinco Elos com Zircônias Banho de Ouro 18k', 'Anel'],
  ['Pulseira Dupla Zircônias e Elos Longos Banho de Ouro 18k', 'Pulseira'],
  ['Bracelete Prego Liso Banho de Ouro 18k', 'Pulseira'],
  ['Pingente Fé Filho Verde Banho de Ouro 18k', 'Pingente'],
  ['Choker Riviera Cristal Banho de Ouro 18k', 'Colar'],
  ['Berloque Coração Banho de Ouro 18k', 'Berloque'],
  ['Conjunto Ponto de Luz Banho de Ouro 18k', 'Conjunto'],
  ['Tornozeleira Elos Banho de Ouro 18k', 'Pulseira'],
];
for (const [nome, esperado] of reais) eq(nome.slice(0, 42), categoriaPeloNome(nome), esperado);

console.log('\n── 2. os erros de digitação que existem na planilha');
eq('Binco (sem R)', categoriaPeloNome('Binco Argola Pequeno'), 'Brinco');
eq('Piecing', categoriaPeloNome('Piecing Coração'), 'Brinco');
eq('Aneis sem acento', categoriaPeloNome('Aneis Trio Liso'), 'Anel');
eq('Anéis com acento', categoriaPeloNome('Anéis Trio Liso'), 'Anel');

console.log('\n── 3. o que não se reconhece vira Outros, não um chute');
eq('palavra desconhecida', categoriaPeloNome('Tiara Cristal'), 'Outros');
eq('nome vazio', categoriaPeloNome(''), 'Outros');
eq('nulo', categoriaPeloNome(null), 'Outros');
/* não olha a segunda palavra: "Kit Brinco" pode ser um conjunto */
eq('não classifica pela segunda palavra', categoriaPeloNome('Kit Brinco e Colar'), 'Outros');

console.log('\n── 4. material NUNCA é categoria');
/* o defeito que originou este arquivo: a rosca somava Banhada/Bruto/Prata
   925 (material) com Brinco/Colar (categoria), no mesmo total */
for (const material of ['Banhada', 'Bruto', 'Prata 925', 'Aço Inox', 'Misto']) {
  eq(`"${material}" não é uma categoria conhecida`, CAT_MAP[material.toLowerCase()] ?? 'ausente', 'ausente');
}
eq('o catálogo tem prioridade sobre o nome',
  categoriaDoItem({ catCatalogo: 'Conjunto', nomeHistorico: 'Brinco Solitário' }), 'Conjunto');
eq('sem catálogo, vale o nome',
  categoriaDoItem({ catCatalogo: null, nomeHistorico: 'Brinco Solitário' }), 'Brinco');
eq('sem catálogo e sem nome, Outros',
  categoriaDoItem({ catCatalogo: null, nomeHistorico: null }), 'Outros');

console.log('\n── 5. a tabela do backend e a do painel legado são a MESMA');
const tpl = readFileSync(new URL('./dashboard.tpl.html', import.meta.url), 'utf8');
const bloco = tpl.match(/const CAT_MAP=\{([\s\S]*?)\};/);
if (!bloco) {
  bad('achei o CAT_MAP em src/dashboard.tpl.html');
} else {
  const doPainel = {};
  for (const m of bloco[1].matchAll(/([A-Za-zÀ-ÿ]+)\s*:\s*'([^']+)'/g)) doPainel[m[1]] = m[2];

  const chavesBack = Object.keys(CAT_MAP).sort();
  const chavesFront = Object.keys(doPainel).sort();
  eq('mesma quantidade de palavras', chavesBack.length, chavesFront.length);

  const soBack = chavesBack.filter((k) => !(k in doPainel));
  const soFront = chavesFront.filter((k) => !(k in CAT_MAP));
  eq('nada existe só no backend', soBack.join(',') || '(nada)', '(nada)');
  eq('nada existe só no painel', soFront.join(',') || '(nada)', '(nada)');

  const divergentes = chavesBack.filter((k) => doPainel[k] && doPainel[k] !== CAT_MAP[k]);
  eq('nenhuma palavra aponta para categorias diferentes',
    divergentes.map((k) => `${k}: ${CAT_MAP[k]}≠${doPainel[k]}`).join(' · ') || '(nenhuma)', '(nenhuma)');
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
