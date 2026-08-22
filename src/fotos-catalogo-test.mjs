/** A4 — as fotos do catálogo INTEIRO chegam sozinhas.
 *
 *  Antes existia uma coluna só (`produtos.foto_url`), uma imagem por
 *  código, preenchida por um botão que alguém tinha de apertar. A galeria
 *  se perdia, a procedência se perdia (de qual produto? de qual variante?)
 *  e a ordem era suposição de quem exibia.
 *
 *  Agora a rodada de sincronização — que já lê o catálogo — guarda o
 *  espelho das imagens em `loja_fotos`, com product_id, variant_id, SKU,
 *  posição, URL e qual é a principal. E a tela passa a mostrar a foto sem
 *  ninguém apertar nada.
 *
 *  O que precisa ficar provado:
 *
 *   1. a sincronização guarda a galeria sozinha, sem segunda chamada à loja;
 *   2. imagem PRÓPRIA de variante casa por `image_id`, nunca por posição;
 *   3. produto que junta dois códigos e tem foto solta NÃO tem dono chutado;
 *   4. a foto aparece no state sem `vincular` ter rodado — e em campo
 *      próprio, sem fingir que alguém a gravou na peça;
 *   5. foto tratada nossa não é sobrescrita nem despriorizada;
 *   6. foto apagada na loja some daqui na rodada seguinte;
 *   7. a galeria completa é preservada e consultável;
 *   8. `seco` não grava nada.
 */
import { subirLojaFalsa } from './loja-falsa.mjs';

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

const prod = async sku => (await api('GET', '/api/state')).produtos.find(p => p.sku === sku);

const loja = await subirLojaFalsa();
const U = loja.url;

await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'GAL1', desc: 'Colar com galeria', cat: 'Colar', preco: 90, qtd: 2 },
    { sku: 'ANELD', desc: 'Anel dourado', cat: 'Anel', preco: 70, qtd: 1 },
    { sku: 'ANELP', desc: 'Anel prata', cat: 'Anel', preco: 70, qtd: 1 },
    { sku: 'JUNTOS', desc: 'Peça de produto misto', cat: 'Colar', preco: 50, qtd: 1 },
  ],
});

loja.estado.produtos = [
  /* Um código, três fotos. A galeria inteira tem de sobreviver. */
  {
    id: 100, name: { pt: 'Colar com galeria' }, handle: { pt: 'gal1' }, published: true,
    images: [
      { id: 1001, src: `${U}/img/gal1-a.jpg`, position: 1 },
      { id: 1002, src: `${U}/img/gal1-b.jpg`, position: 2 },
      { id: 1003, src: `${U}/img/gal1-c.jpg`, position: 3 },
    ],
    variants: [{ id: 10011, sku: 'GAL1', inventory_levels: [{ location_id: 'L1', stock: 2 }] }],
  },
  /* Dois códigos no MESMO produto da loja, cada variante com foto própria
     por `image_id`. É o caso que a amarração por posição erraria. */
  {
    id: 200, name: { pt: 'Anel banho' }, handle: { pt: 'anel' }, published: true,
    attributes: [{ pt: 'Banho' }],
    images: [
      { id: 2001, src: `${U}/img/anel-dourado.jpg`, position: 1 },
      { id: 2002, src: `${U}/img/anel-prata.jpg`, position: 2 },
      { id: 2003, src: `${U}/img/anel-ambiente.jpg`, position: 3 },
    ],
    variants: [
      { id: 20011, sku: 'ANELP', values: [{ pt: 'Ródio' }], image_id: 2002,
        inventory_levels: [{ location_id: 'L1', stock: 1 }] },
      { id: 20012, sku: 'ANELD', values: [{ pt: 'Dourado' }], image_id: 2001,
        inventory_levels: [{ location_id: 'L1', stock: 1 }] },
    ],
  },
];

console.log('\n=== 1. o ensaio lê tudo e não grava nada ===');
let r = await api('POST', '/api/fotos/sincronizar', { seco: true });
eq('leu as seis imagens', r.resumo.imagens, 6);
eq('de dois produtos', r.resumo.produtos, 2);
eq('e não gravou', r.resumo.gravadas, 0);
eq('nenhuma foto no state ainda', (await prod('GAL1')).fotoLojaUrl, 'undefined');

console.log('\n=== 2. a rodada de sincronização guarda a galeria sozinha ===');
/* Nenhum botão de foto foi apertado. É o ponto do pedido: a foto é dado do
   catálogo, e quem lê o catálogo é a rodada. */
const rodada = await api('POST', '/api/sync', { forcar: true });
eq('a rodada terminou bem', rodada.ok, 'true');
eq('e ela guardou as fotos', rodada.fotos.gravadas, 6);
eq('sem erro', rodada.fotos.ok, 'true');

console.log('\n=== 3. imagem própria de variante casa por image_id, não por posição ===');
const dourado = await api('GET', '/api/produtos/ANELD/fotos');
const prata = await api('GET', '/api/produtos/ANELP/fotos');
eq('o dourado ficou com a foto dourada', dourado.fotos[0].url, `${U}/img/anel-dourado.jpg`);
eq('e com o id da variante dele', dourado.fotos[0].varianteId, '20012');
eq('a prata ficou com a foto prata', prata.fotos[0].url, `${U}/img/anel-prata.jpg`);
eq('e com o id da variante dela', prata.fotos[0].varianteId, '20011');
eq('as duas sabem de qual produto da loja vieram',
  `${dourado.fotos[0].produtoId}/${prata.fotos[0].produtoId}`, '200/200');

console.log('\n=== 4. foto solta de produto com DOIS códigos não ganha dono chutado ===');
/* `anel-ambiente.jpg` não está amarrada a variante nenhuma, e o produto
   carrega ANELD e ANELP. Chutar faria a vitrine anunciar uma peça
   mostrando outra. */
eq('o dourado não herdou a foto de ambiente',
  dourado.fotos.some(f => /ambiente/.test(f.url)), 'false');
eq('a prata também não',
  prata.fotos.some(f => /ambiente/.test(f.url)), 'false');
eq('e a ingestão contou a imagem sem código', rodada.fotos.semCodigo, 1);

console.log('\n=== 5. a foto aparece na tela sem ninguém apertar "vincular" ===');
const g1 = await prod('GAL1');
eq('o state entrega o endereço da vitrine', g1.fotoLojaUrl, `${U}/img/gal1-a.jpg`);
eq('e é a PRINCIPAL, não a que veio primeiro por acaso',
  (await api('GET', '/api/produtos/GAL1/fotos')).fotos[0].principal, 'true');
/* Campo próprio, de propósito: `fotoUrl` é o endereço que ALGUÉM gravou na
   peça, com origem e data. Fingir que a leitura automática fez isso
   apagaria a diferença entre "a loja tem foto" e "nós anotamos qual é". */
eq('sem fingir que foi gravado na peça', g1.fotoUrl, 'undefined');

console.log('\n=== 6. a galeria completa é preservada ===');
const gal = await api('GET', '/api/produtos/GAL1/fotos');
eq('as três imagens estão lá', gal.total, 3);
eq('na ordem da loja, principal na frente',
  gal.fotos.map(f => f.posicao).join(','), '1,2,3');
eq('cada uma com o id dela na Nuvemshop',
  gal.fotos.map(f => f.imagemId).join(','), '1001,1002,1003');

console.log('\n=== 7. foto tratada nossa continua mandando ===');
/* O resolvedor de tela é o mesmo em todo lugar, e a ordem dele é de posse:
   o que é nosso vence o que é emprestado. Aqui isso é provado no dado que
   alimenta o resolvedor. */
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64');
await fetch(`${API}/api/produtos/GAL1/foto/tratada`, {
  method: 'PUT',
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'image/png' },
  body: pixel,
});
const g2 = await prod('GAL1');
eq('a tratada existe', !!g2.fotoTratadaUrl, 'true');
eq('e a da vitrine continua lá, sem sobrescrever nada', g2.fotoLojaUrl, `${U}/img/gal1-a.jpg`);
await api('POST', '/api/sync', { forcar: true });
const g3 = await prod('GAL1');
/* Compara o CAMINHO, não a URL inteira: o link é assinado e carrega `exp`,
   que muda a cada segundo. Comparar a query faria o teste falhar quando as
   duas leituras caíssem em segundos diferentes — falha de relógio com cara
   de foto perdida. */
const semQuery = u => String(u || '').split('?')[0];
eq('a rodada seguinte não apagou a tratada', semQuery(g3.fotoTratadaUrl), semQuery(g2.fotoTratadaUrl));

console.log('\n=== 8. foto apagada na loja some daqui ===');
/* Espelho que só cresce mente: a peça continuaria sendo anunciada aqui com
   uma imagem que a loja não publica mais. */
loja.estado.produtos[0].images = [{ id: 1001, src: `${U}/img/gal1-a.jpg`, position: 1 }];
await api('POST', '/api/sync', { forcar: true });
const gal2 = await api('GET', '/api/produtos/GAL1/fotos');
eq('sobrou uma imagem', gal2.total, 1);
eq('e é a que a loja ainda publica', gal2.fotos[0].imagemId, '1001');

console.log('\n=== 9. nada disso mexeu no estoque ===');
const conf = await api('GET', '/api/estoque/conferir');
eq('a razão continua fechando', conf.divergentes.length, 0);
eq('o estoque de GAL1 não se mexeu', (await prod('GAL1')).qtd, 2);

await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
