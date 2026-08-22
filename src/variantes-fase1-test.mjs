/** FASE 1 — variações casadas por variant_id, catálogo completo da loja e
 *  SKU único.
 *
 *  O que precisa ficar provado, em ordem de importância:
 *
 *   1. a leitura importa o catálogo INTEIRO da loja — inclusive produto de
 *      variante única e variante cujo SKU não é nosso;
 *   2. os atributos são DINÂMICOS: "Banho", "Pedra", "Comprimento" chegam
 *      com o nome que a loja usa, não encaixados à força em cor/tamanho;
 *   3. produto sem variação continua se comportando exatamente como sempre;
 *   4. produto com variação SÓ é escrito quando cada peça tem dono por
 *      variant_id — e "não sabe" nunca vira "chuta";
 *   5. o mesmo total repartido de outro jeito manda números diferentes para
 *      as caixinhas, e nunca o total numa variante só;
 *   6. SKU repetido é recusado e a recusa diz ONDE ele já está;
 *   7. duas gerações simultâneas nunca devolvem o mesmo código.
 */
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

const API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

const prod = async sku => (await api('GET', '/api/state')).produtos.find(p => p.sku === sku);

const loja = await subirLojaFalsa();

/* ------------------------------------------------------------- o cenário
   Quatro casos reais lado a lado, de propósito:

     PULSEIRA  sem variação nenhuma — o caso da imensa maioria
     BRINCO    UMA variante só na loja (tem variant_id, mas nada varia)
     ANELB     TRÊS variantes, e o que varia é "Banho" e "Pedra" — nem cor
               nem tamanho, que é o ponto: não existe lista fixa nossa
     SONOLOJA  existe só lá, e nunca deve ser tocado                        */
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'PULSEIRA', desc: 'Pulseira lisa', cat: 'Pulseira', preco: 60, qtd: 4 },
    { sku: 'BRINCO', desc: 'Brinco ponto de luz', cat: 'Brinco', preco: 40, qtd: 3 },
    { sku: 'ANELB', desc: 'Anel Banho e Pedra', cat: 'Anel', preco: 120, qtd: 6 },
  ],
});

const anelVariantes = () => loja.estado.produtos.find(p => p.id === 30).variants;

loja.estado.produtos = [
  produtoFalso(10, [{ id: 101, sku: 'PULSEIRA', estoque: 4 }]),
  produtoFalso(20, [{ id: 201, sku: 'BRINCO', estoque: 1 }]),
  {
    id: 30, name: { pt: 'Anel Banho e Pedra' }, handle: { pt: 'anel-banho' }, published: true,
    // Dois atributos ao mesmo tempo, e nenhum deles é "Cor" ou "Tamanho".
    attributes: [{ pt: 'Banho' }, { pt: 'Pedra' }],
    images: [{ id: 3000, src: 'https://loja/anel-dourado.jpg', position: 1 },
             { id: 3001, src: 'https://loja/anel-prata.jpg', position: 2 }],
    variants: [
      { id: 301, sku: 'ANELB', values: [{ pt: 'Dourado' }, { pt: 'Zircônia' }], price: '120.00',
        image_id: 3000, inventory_levels: [{ location_id: 'L1', stock: 2 }] },
      { id: 302, sku: 'ANELB', values: [{ pt: 'Dourado' }, { pt: 'Cristal' }], price: '130.00',
        image_id: 3000, inventory_levels: [{ location_id: 'L1', stock: 3 }] },
      { id: 303, sku: 'ANELB', values: [{ pt: 'Ródio' }, { pt: 'Zircônia' }], price: '125.00',
        image_id: 3001, inventory_levels: [{ location_id: 'L1', stock: 1 }] },
    ],
  },
  produtoFalso(40, [{ id: 401, sku: 'SONOLOJA', estoque: 9 }]),
];

console.log('\n=== 1. importar o catálogo INTEIRO da loja ===');
/* Leitura pura: percorre tudo que existe lá e guarda por variante. Não é a
   sincronização — não empurra estoque nem cria produto. Saber o que a loja
   tem e decidir o que fazer com isso são atos separados. */
let r = await api('POST', '/api/loja/variantes/importar', { seco: true });
eq('o ensaio leu a loja', r.ok, 'true');
eq('e não gravou nada', r.aplicado, 'false');

r = await api('POST', '/api/loja/variantes/importar', {});
eq('a importação rodou', r.ok, 'true');
eq('quatro produtos na loja', r.produtosNaLoja, 4);
eq('seis variantes ao todo', r.variantes, 6);
eq('três delas do anel', r.produtosComVariacao, 1);
/* Variante de produto que não é nosso NÃO é descartada: é justamente o que
   a revisão humana precisa enxergar. */
eq('a variante que só existe na loja foi guardada', r.soNaLoja, 1);
eq('e as nossas foram casadas', r.casadas, 5);

console.log('\n=== 2. os atributos são os da loja, não uma lista nossa ===');
/* Presumir "cor e tamanho" quebraria neste produto, que varia por banho e
   por pedra. O vocabulário sai do próprio catálogo. */
eq('a loja varia por Banho', r.atributos.Banho, 3);
eq('e por Pedra', r.atributos.Pedra, 3);
eq('e por mais nada', Object.keys(r.atributos).sort().join(','), 'Banho,Pedra');

const est = await api('GET', '/api/loja/variantes/ANELB');
eq('o anel tem variação', est.temVariacao, 'true');
eq('os dois atributos, na ordem da loja', est.atributos.map(a => a.nome).join(','), 'Banho,Pedra');
eq('com os valores que existem de cada um',
  est.atributos.map(a => `${a.nome}:${a.valores.join('/')}`).join(' '),
  'Banho:Dourado/Ródio Pedra:Zircônia/Cristal');
eq('cada variante sabe qual valor é de qual atributo',
  est.variantes[0].valores.map(v => `${v.atributo}=${v.valor}`).join(' '),
  'Banho=Dourado Pedra=Zircônia');
eq('o preço da variante veio junto', est.variantes[1].preco, 130);
eq('e a imagem própria dela também', est.variantes[2].imagemUrl, 'https://loja/anel-prata.jpg');
eq('o variant_id ficou persistido', est.variantes.map(v => v.varianteId).join(','), '301,302,303');

const unico = await api('GET', '/api/loja/variantes/BRINCO');
eq('produto de UMA variante também foi guardado', unico.variantes.length, 1);
eq('mas não conta como "tem variação"', unico.temVariacao, 'false');
eq('e o id dele está lá', unico.variantes[0].varianteId, '201');

console.log('\n=== 3. produto sem variação não muda em nada ===');
r = await api('POST', '/api/sync', { forcar: true });
eq('a rodada terminou bem', r.ok, 'true');
eq('a pulseira continua sem variação', (await prod('PULSEIRA')).variacoes, 'undefined');
const pulseira = loja.estado.produtos.find(p => p.id === 10).variants[0];
eq('e o estoque dela foi empurrado normalmente', pulseira.inventory_levels[0].stock, 4);

console.log('\n=== 4. produto com UMA variante na loja é empurrado normalmente ===');
/* Ter variant_id não é o mesmo que ter variação. Com uma caixinha só não há
   ambiguidade nenhuma: o total do código É o conteúdo dela. */
const brinco = loja.estado.produtos.find(p => p.id === 20).variants[0];
eq('o brinco foi de 1 para 3', brinco.inventory_levels[0].stock, 3);

console.log('\n=== 5. produto com VÁRIAS variantes: repartido, cada um na sua ===');
/* A soma da loja (2+3+1) bate com o nosso total (6), então a repartição
   dela é confiável e entra inteira — sem ninguém confirmar. */
const anel = await prod('ANELB');
eq('as três variações chegaram', (anel.variacoes || []).length, 3);
eq('com os nomes compostos que a loja mostra',
  anel.variacoes.map(v => v.nome).join(' | '),
  'Dourado · Zircônia | Dourado · Cristal | Ródio · Zircônia');
eq('e o estoque foi repartido sozinho',
  anel.variacoes.map(v => v.qtd).join(','), '2,3,1');
eq('nenhuma variante recebeu o total do código',
  anelVariantes().some(v => v.inventory_levels[0].stock === 6), 'false');

console.log('\n=== 6. o SKU que só existe na loja não é tocado ===');
const soLoja = loja.estado.produtos.find(p => p.id === 40).variants[0];
eq('continua com o número que a loja tinha', soLoja.inventory_levels[0].stock, 9);

console.log('\n=== 7. mesmo total, distribuição diferente = escrita diferente ===');
/* O mesmo 6 repartido de outro jeito precisa chegar diferente em cada
   caixinha. Se o sistema mandasse o total do código, este bloco passaria
   com qualquer repartição — e é exatamente por isso que ele existe. */
r = await api('POST', '/api/produtos/ANELB/repartir', {
  distribuicao: { 'Dourado · Zircônia': 4, 'Dourado · Cristal': 1, 'Ródio · Zircônia': 1 },
});
eq('a repartição foi aceita', r.ok, 'true');
r = await api('POST', '/api/sync', { forcar: true });
eq('a rodada terminou bem', r.ok, 'true');
eq('cada variante recebeu o número DELA',
  anelVariantes().map(v => v.inventory_levels[0].stock).join(','), '4,1,1');
eq('o total do código não mudou por causa disso', (await prod('ANELB')).qtd, 6);
eq('e a soma das caixinhas é o total', anelVariantes().reduce((s, v) => s + v.inventory_levels[0].stock, 0), 6);

console.log('\n=== 8. variante SEM mapeamento trava a escrita inteira ===');
/* O caso que já bagunçou o estoque de verdade: a loja renomeia um valor.
   O nome que temos aqui deixa de existir lá, e casar por nome devolveria
   zero para uma caixinha que tem peça. O total continua fechando, então
   nenhum freio antigo dispararia — só o casamento por variant_id pega. */
anelVariantes()[0].values = [{ pt: 'Ouro Amarelo' }, { pt: 'Zircônia' }];
anelVariantes()[0].id = 999;          // a loja trocou a variante, não só o nome
const antes = anelVariantes().map(v => v.inventory_levels[0].stock).join(',');

r = await api('POST', '/api/sync', { forcar: true });
eq('a rodada terminou bem', r.ok, 'true');
let travado = (r.semEmpurrar || []).find(x => x.sku === 'ANELB');
eq('o anel ficou fora do empurrão', !!travado, 'true');
eq('e o motivo é a variação não mapeada', travado && travado.motivo, 'variacao_nao_mapeada');
eq('a recusa explica em português', !!(travado && travado.explicacao), 'true');
eq('a loja NÃO foi tocada', anelVariantes().map(v => v.inventory_levels[0].stock).join(','), antes);
eq('nenhuma variante recebeu o total do código',
  anelVariantes().some(v => v.inventory_levels[0].stock === 6), 'false');
eq('e o saldo órfão é mostrado, não engolido',
  travado && travado.detalhe.variacoes.reduce((s, v) => s + v.saldo, 0), 4);

console.log('\n=== 9. o produto travado aparece na lista de revisão ===');
await api('POST', '/api/loja/variantes/importar', {});
const revisao = await api('GET', '/api/variacoes/revisao');
const item = (revisao.itens || []).find(x => x.sku === 'ANELB');
eq('o anel está na revisão', !!item, 'true');
eq('com os dois números lado a lado',
  item && `nosso:${item.total} loja:${item.somaLoja}`, 'nosso:6 loja:6');
eq('e o motivo carimbado', item && item.motivo, 'variacao_nao_mapeada');
eq('a revisão lista as variantes reais da loja, com id',
  item && item.variantes.map(v => v.varianteId).sort().join(','), '302,303,999');

console.log('\n=== 10. a razão continua fechando (§19) ===');
const conf = await api('GET', '/api/estoque/conferir');
eq('saldo bate com a soma dos movimentos', conf.divergentes.length, 0);

console.log('\n=== 11. SKU repetido é recusado, e a recusa diz ONDE ===');
let c = await api('GET', '/api/produtos/sku/checar?sku=PULSEIRA');
eq('PULSEIRA não está disponível', c.disponivel, 'false');
eq('porque já é produto', c.usos[0].onde, 'produtos');
eq('e a resposta diz qual', c.usos[0].desc, 'Pulseira lisa');

c = await api('GET', '/api/produtos/sku/checar?sku=%20pulseira%20');
eq('minúscula com espaço é o MESMO código', c.sku, 'PULSEIRA');
eq('e também é recusado', c.disponivel, 'false');

/* Existir na loja NÃO impede cadastrar aqui — é o contrário: cadastrar o
   código que a Nuvemshop já tem é exatamente como os dois lados se casam.
   Vira aviso, com o produto e a variante nomeados, não recusa. */
c = await api('GET', '/api/produtos/sku/checar?sku=SONOLOJA');
eq('código que só existe na loja continua cadastrável', c.disponivel, 'true');
eq('mas o sistema avisa que ele já está lá', c.avisos[0].onde, 'loja_variantes');
eq('e nada bloqueia', c.bloqueiam.length, 0);

c = await api('GET', '/api/produtos/sku/checar?sku=NUNCAUSADO');
eq('código inédito está disponível', c.disponivel, 'true');

c = await api('GET', '/api/produtos/sku/checar?sku=-COMEÇA-ERRADO');
eq('formato inválido é recusado antes de qualquer consulta', c.motivo, 'formato_invalido');

console.log('\n=== 12. cadastro manual não deixa passar SKU repetido ===');
r = await api('POST', '/api/produtos/novos/analisar', {
  produtos: [{ sku: 'pulseira', desc: 'Tentativa de duplicar', qtd: 1, preco: 10 }],
});
eq('a análise não deixa passar', r.resumo.prontos, 0);
eq('e classifica como já existente', r.resumo.jaExistem, 1);
eq('dizendo onde ele já está', r.jaExistem.itens[0].usos[0].onde, 'produtos');

/* A trava de verdade é o backend, não a tela: mesmo mandando direto para o
   cadastro, sem passar pela análise, ele recusa. */
r = await api('POST', '/api/produtos/novos/cadastrar', {
  produtos: [{ sku: ' Pulseira ', desc: 'Tentativa direta', qtd: 1 }],
});
eq('o cadastro direto foi recusado', r.criados, 0);
eq('com o motivo certo', r.ignorados[0].motivo, 'ja_existe');
eq('a pulseira original ficou intacta', (await prod('PULSEIRA')).desc, 'Pulseira lisa');

console.log('\n=== 13. gerar SKU devolve um código livre, e curto ===');
/* O padrão mudou aqui, e de propósito: até a auditoria rodar, o gerado era
   `MQ` + 5 dígitos — um formato escolhido no escritório para não fingir uma
   sequência que ninguém tinha medido. A auditoria rodou contra o catálogo
   real (776 códigos, 100% com seis dígitos, sem prefixo) e o formato
   passou a ser esse. O teste do formato novo, com a decisão inteira, é
   `src/sku-gerador-test.mjs`; aqui fica só o que esta fase provava. */
r = await api('POST', '/api/produtos/sku/gerar', {});
eq('gerou', r.ok, 'true');
eq('no padrão do catálogo real: seis dígitos', /^\d{6}$/.test(r.sku || ''), 'true');
eq('e o código é curto o bastante para a etiqueta', (r.sku || '').length, 6);
c = await api('GET', '/api/produtos/sku/checar?sku=' + r.sku);
eq('o código gerado está reservado, não solto', c.usos.length, 1);
eq('e a reserva é o único uso dele', c.usos[0].onde, 'reserva');

console.log('\n=== 14. geração concorrente nunca repete ===');
/* Sem a reserva no banco isto falharia de vez em quando — e "de vez em
   quando" é o pior jeito de falhar: duas pessoas sorteando ao mesmo tempo
   podem cair no mesmo número, e quem descobre é a segunda, no fim do
   formulário. */
const lote = await Promise.all(
  Array.from({ length: 10 }, () => api('POST', '/api/produtos/sku/gerar', {})));
eq('as dez geraram', lote.filter(x => x.ok).length, 10);
const distintos = new Set(lote.map(x => x.sku));
eq('e todas devolveram códigos DIFERENTES', distintos.size, 10);
eq('todos no padrão', [...distintos].every(s => /^\d{6}$/.test(s)), 'true');

console.log('\n=== 15. o código gerado cadastra, e a reserva some ===');
const novo = lote[0].sku;
r = await api('POST', '/api/produtos/novos/cadastrar', {
  produtos: [{ sku: novo, desc: 'Peça criada aqui', cat: 'Anel', qtd: 2, preco: 55 }],
});
eq('cadastrou', r.criados, 1);
const criado = await prod(novo);
eq('com o saldo pedido', criado && criado.qtd, 2);
c = await api('GET', '/api/produtos/sku/checar?sku=' + novo);
eq('agora ele consta como produto, não como reserva', c.usos[0].onde, 'produtos');
eq('e a reserva sumiu', c.usos.length, 1);

console.log('\n=== 16. a razão fecha no fim de tudo (§19) ===');
const conf2 = await api('GET', '/api/estoque/conferir');
eq('saldo bate com a soma dos movimentos em todo SKU', conf2.divergentes.length, 0);

await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
