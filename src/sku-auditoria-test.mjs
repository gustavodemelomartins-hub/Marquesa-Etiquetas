/** A2 — a auditoria do padrão de SKU, e o que ela tem PERMISSÃO de dizer.
 *
 *  A pergunta "qual código o sistema deve gerar?" não tem resposta de
 *  escritório: depende de fatos que só o catálogo responde. Este teste
 *  monta catálogos com respostas conhecidas e cobra que a auditoria diga
 *  exatamente aquilo — inclusive "não sei", que é a resposta certa quando
 *  não existe regra.
 *
 *  O que precisa ficar provado:
 *
 *   1. a auditoria olha os TRÊS lugares onde um código existe (catálogo,
 *      fila de peças novas, variantes da loja) — ler só `produtos` mente;
 *   2. formatos que convivem são contados, não escolhidos;
 *   3. números crescentes NÃO são sequência: quem decide é a densidade;
 *   4. catálogo esparso ⇒ `regraInequivoca: false`, com o motivo escrito;
 *   5. catálogo realmente sequencial ⇒ `regraInequivoca: true`;
 *   6. colisão normalizada (`br1234` ao lado de `BR1234`) aparece;
 *   7. o gerador não decide escondido — a auditoria conta qual formato ele
 *      está usando, ao lado da medida que levou a ele.
 *
 *  A decisão que saiu desta auditoria (sortear seis dígitos, sem sequência)
 *  é provada em `src/sku-gerador-test.mjs`. Aqui fica só a MEDIDA.
 */
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

const API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const api = (m, p, b) => fetch(API + p, {
  method: m, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

const auditar = () => api('GET', '/api/produtos/sku/auditoria');

const loja = await subirLojaFalsa();

/* ------------------------------------------------------------- cenário 1
   O retrato da operação real, em miniatura: códigos de SEIS dígitos,
   numéricos, espalhados por toda a faixa. Eles são do fornecedor — nascem
   fora daqui e não seguem ordem nenhuma.                                */
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: '122809', desc: 'a', cat: 'Colar', preco: 10, qtd: 1 },
    { sku: '340012', desc: 'b', cat: 'Colar', preco: 10, qtd: 1 },
    { sku: '551117', desc: 'c', cat: 'Anel', preco: 10, qtd: 1 },
    { sku: '780004', desc: 'd', cat: 'Anel', preco: 10, qtd: 1 },
    { sku: '997620', desc: 'e', cat: 'Brinco', preco: 10, qtd: 1 },
  ],
});

console.log('\n=== 1. o formato predominante é medido, não escolhido ===');
let a = await auditar();
eq('cinco códigos no universo', a.total, 5);
eq('um formato só', a.formas.length, 1);
eq('e ele é seis dígitos', a.predominante.curta, '9×6');
eq('cobrindo o catálogo inteiro', a.predominante.pct, 100);
eq('sem prefixo nenhum', a.prefixos[0].prefixo, '(nenhum)');
eq('o exemplo da tela sai do catálogo real', a.conclusao.exemploReal, '122809');

console.log('\n=== 2. número crescente NÃO é sequência ===');
/* Cinco códigos numa faixa de 874.812 lugares. `max + 1` ali não é "o
   próximo": é um número que o fornecedor ainda pode usar amanhã. */
eq('menor e maior lidos', `${a.sequencia.geral.menor}..${a.sequencia.geral.maior}`, '122809..997620');
eq('a faixa é enorme', a.sequencia.geral.amplitude, 874812);
eq('e quase toda vazia', a.sequencia.geral.veredito, 'esparso');
eq('logo NÃO existe regra inequívoca', a.conclusao.regraInequivoca, 'false');
eq('e o motivo está escrito', /N[ÃA]O formam sequ[êe]ncia/i.test(a.conclusao.motivo), 'true');

console.log('\n=== 3. o gerador diz o que está fazendo ===');
/* APOSENTADO aqui, e trocado de propósito: este bloco cobrava que o código
   gerado viesse marcado como PROVISÓRIO (`padrao.provisorio`) e que o
   gerador se apresentasse como `MQ00001`. Os dois existiam pela mesma razão
   — a auditoria ainda não tinha rodado contra o catálogo real, e inventar
   um formato definitivo sem medir seria exatamente o que este arquivo
   existe para impedir.
   
   A auditoria rodou: 776 códigos, 776 com seis dígitos, forma única, sem
   prefixo. O formato deixou de ser suposição, o aviso de "provisório" saiu
   da tela e o campo `padrao` saiu da resposta. A regra nova, inteira e com
   as travas dela, é provada em `src/sku-gerador-test.mjs`.
   
   O que continua sendo verdade — e é o que este bloco guarda agora — é que
   a auditoria conta o que o gerador está fazendo, em vez de deixar a
   decisão escondida no meio do código. */
eq('ele diz que sorteia', a.geradorAtual.modo, 'sorteio');
eq('com seis dígitos', a.geradorAtual.digitos, 6);
eq('e sem prefixo', a.geradorAtual.prefixo, '(nenhum)');
const g = await api('POST', '/api/produtos/sku/gerar', { origem: 'teste' });
eq('gerou um código', g.ok, 'true');
eq('no formato do catálogo real', /^\d{6}$/.test(g.sku || ''), 'true');
eq('e ele NÃO vem mais relativizado como provisório', g.padrao === undefined, 'true');

console.log('\n=== 4. formatos que convivem são contados ===');
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'BR-1', desc: 'f', cat: 'Colar', preco: 10, qtd: 1 },
    { sku: '551117-2', desc: 'g', cat: 'Colar', preco: 10, qtd: 1 },
  ],
});
a = await auditar();
eq('agora são três formatos', a.formas.length, 3);
eq('o de seis dígitos continua predominando', a.predominante.curta, '9×6');
eq('mas já não cobre tudo', a.predominante.pct < 100, 'true');
eq('e os que fogem dele são listados', a.foraDoPadrao.total, 2);
eq('o sufixo "-2" aparece como sufixo', a.sufixos.some(s => s.sufixo === '-2'), 'true');
eq('e o prefixo BR aparece como prefixo', a.prefixos.some(p => p.prefixo === 'BR'), 'true');

console.log('\n=== 5. a auditoria olha os TRÊS lugares, não só `produtos` ===');
/* Um código que existe SÓ na loja continua sendo um código em uso: cadastrar
   outra peça com ele faria a sincronização casar as coisas erradas. */
loja.estado.produtos = [produtoFalso(10, [{ id: 101, sku: 'SOLOJA9', estoque: 1 }])];
await api('POST', '/api/loja/variantes/importar', {});
await api('POST', '/api/produtos/pendentes', {
  produtos: [{ sku: 'NAFILA1', desc: 'h', cat: 'Colar', preco: 10, qtd: 1, origem: 'teste' }],
});
a = await auditar();
eq('a loja entrou na conta', a.porFonte.loja_variantes >= 1, 'true');
eq('a fila de peças novas também', a.porFonte.produtos_pendentes >= 1, 'true');
eq('e o universo cresceu junto', a.total, 9);

console.log('\n=== 6. colisão normalizada é vista ===');
/* `produtos.sku` é PRIMARY KEY e o índice normalizado impede o quase-igual
   DENTRO de `produtos`. Entre fontes ele ainda cabe — e é justamente o caso
   em que uma peça daqui deixa de casar com a variante de lá. */
loja.estado.produtos = [produtoFalso(11, [{ id: 111, sku: ' br-1 ', estoque: 1 }])];
await api('POST', '/api/loja/variantes/importar', {});
a = await auditar();
const col = a.colisoes.itens.find(c => c.sku === 'BR-1');
eq('a colisão apareceu', !!col, 'true');
eq('com as duas grafias', col && col.escritoComo.length >= 2, 'true');
eq('e dizendo em que fontes', col && col.onde.sort().join(','), 'loja_variantes,produtos');

console.log('\n=== 7. catálogo DE VERDADE sequencial ⇒ a auditoria diz que sim ===');
/* O caso simétrico, e é ele que prova que o "não" do passo 2 é medida e não
   teimosia: numeração densa e com prefixo único tem, sim, um próximo. */
/* Peça com histórico não se apaga (§28), então o cenário sequencial entra
   AO LADO do esparso — que é como ele apareceria na vida real: uma
   numeração nossa convivendo com os códigos do fornecedor. É por isso que
   a auditoria recorta a sequência por prefixo, e não só no geral. */
const banco = [];
for (let i = 1; i <= 40; i++) {
  banco.push({ sku: 'SEQ' + String(i).padStart(4, '0'), desc: 'seq' + i, cat: 'Colar', preco: 10, qtd: 1 });
}
await api('POST', '/api/produtos/importar', { produtos: banco });
a = await auditar();
const seq = a.sequencia.porPrefixo.find(p => p.prefixo === 'SEQ');
eq('o prefixo SEQ foi reconhecido', !!seq, 'true');
eq('com os 40 códigos', seq && seq.n, 40);
eq('e a faixa dele é densa', seq && seq.faixa.veredito, 'sequencial');
eq('agora existe regra inequívoca? não — o catálogo inteiro continua misto',
  a.conclusao.regraInequivoca, 'false');
eq('e o motivo mudou para o certo', /formatos diferentes/.test(a.conclusao.motivo), 'true');

console.log('\n=== 8. nada disso escreveu nada ===');
const antes = (await api('GET', '/api/state')).produtos.length;
await auditar(); await auditar();
eq('auditar duas vezes não muda o catálogo', (await api('GET', '/api/state')).produtos.length, antes);
const conf = await api('GET', '/api/estoque/conferir');
eq('e a razão continua fechando', conf.divergentes.length, 0);

await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
