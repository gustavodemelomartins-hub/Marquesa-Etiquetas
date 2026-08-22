/** Compara as vendas de origem 'site' dos dois bancos, por `externo_id`.
 *
 *  É o Risco R3 do docs/PLANO-MESTRE-MARQUESA.md, em forma de ferramenta.
 *
 *  As duas bases divergiram sem que ninguém decidisse isso: a Sthefany
 *  operou no DEV, enquanto o cron de produção continuou puxando pedidos da
 *  Nuvemshop para o `marquesa-db`. Cada pedido puxado virou uma venda de
 *  verdade — com baixa de estoque — num banco que está prestes a ser
 *  aposentado.
 *
 *  Promover o DEV por cima sem olhar apagaria essas vendas em silêncio. Este
 *  script não decide nada: ele só torna impossível não ver.
 *
 *  Somente leitura, e nem sequer toca em banco — lê os dois JSON que o
 *  inventario-golive.sh já produziu.
 *
 *    node tools/diff-vendas-site.mjs <producao/vendas-site.json> <dev/vendas-site.json>
 */
import { readFileSync } from 'node:fs';

const [arqProd, arqDev] = process.argv.slice(2);
if (!arqProd || !arqDev) {
  console.error('uso: diff-vendas-site.mjs <producao.json> <dev.json>');
  process.exit(2);
}

const ler = (a) => {
  try { return JSON.parse(readFileSync(a, 'utf8')); }
  catch (e) { console.error(`não consegui ler ${a}: ${e.message}`); process.exit(2); }
};

const prod = ler(arqProd);
const dev = ler(arqDev);

const porChave = (linhas) => new Map(linhas.map(v => [String(v.externo_id), v]));
const mProd = porChave(prod);
const mDev = porChave(dev);

const soProd = [...mProd.keys()].filter(k => !mDev.has(k)).sort();
const soDev = [...mDev.keys()].filter(k => !mProd.has(k)).sort();
const nosDois = [...mProd.keys()].filter(k => mDev.has(k)).sort();

/* Estar nos dois lados não é o mesmo que ser a mesma venda. Um pedido pode
   ter sido puxado por rodadas diferentes, em datas diferentes, e ter total
   divergente se a loja o alterou entre uma leitura e outra. */
const divergentes = nosDois.filter(k => {
  const a = mProd.get(k), b = mDev.get(k);
  return String(a.data) !== String(b.data)
      || Number(a.total) !== Number(b.total)
      || Number(a.cancelada || 0) !== Number(b.cancelada || 0);
});

const dinheiro = (n) => `R$ ${Number(n || 0).toFixed(2)}`;
const linha = (v) => `  ${String(v.externo_id).padEnd(24)} ${String(v.data).padEnd(12)} ` +
                     `${dinheiro(v.total).padStart(12)}  ${v.cancelada ? '[CANCELADA] ' : ''}${v.cliente_nome || ''}`;

console.log(`vendas 'site' em produção : ${prod.length}`);
console.log(`vendas 'site' no DEV      : ${dev.length}`);
console.log(`nos dois                  : ${nosDois.length}`);
console.log();

if (soProd.length) {
  console.log(`*** ${soProd.length} VENDA(S) SÓ EM PRODUÇÃO — seriam perdidas no corte ***`);
  console.log();
  soProd.forEach(k => console.log(linha(mProd.get(k))));
  console.log();
  console.log('  Estas são vendas reais: o cron as puxou da Nuvemshop e deu baixa');
  console.log('  no estoque do marquesa-db. O banco novo, vindo do DEV, não as tem —');
  console.log('  então o estoque dele está mais ALTO do que o físico, nesses SKUs.');
  console.log();
  console.log('  Decisão necessária, uma a uma, antes da Fase 4. O caminho previsto');
  console.log('  é relançar cada uma no banco novo pelo fluxo normal, preservando o');
  console.log('  externo_id (que impede cobrança dupla) e com obs dizendo de onde veio.');
} else {
  console.log('✓ nenhuma venda do site existe só em produção — nada se perde no corte.');
}
console.log();

if (soDev.length) {
  console.log(`· ${soDev.length} venda(s) do site só no DEV (esperado: o DEV também lê a loja):`);
  soDev.forEach(k => console.log(linha(mDev.get(k))));
  console.log();
}

if (divergentes.length) {
  console.log(`*** ${divergentes.length} pedido(s) presentes nos DOIS com dados diferentes ***`);
  divergentes.forEach(k => {
    const a = mProd.get(k), b = mDev.get(k);
    console.log(`  ${k}`);
    console.log(`    produção: ${a.data}  ${dinheiro(a.total)}  ${a.cancelada ? 'cancelada' : 'ativa'}`);
    console.log(`    dev     : ${b.data}  ${dinheiro(b.total)}  ${b.cancelada ? 'cancelada' : 'ativa'}`);
  });
  console.log();
  console.log('  Divergência aqui não se resolve por palpite: mostre os dois números');
  console.log('  e decida com quem conhece o pedido. Ver a regra 2 do CLAUDE.md.');
} else if (nosDois.length) {
  console.log('✓ os pedidos presentes nos dois lados batem em data, total e cancelamento.');
}

/* Código de saída: 0 quando não há nada a decidir. Diferente de zero quando
   existe algo que precisa de gente — assim isto pode virar passo de
   checklist sem alguém ter que ler o texto todo para saber se passou. */
process.exit(soProd.length || divergentes.length ? 1 : 0);
