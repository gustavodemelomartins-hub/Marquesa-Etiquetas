/** Gate de código-fonte da Fase 4.4 — as travas do inventário, no código.
 *
 *  `src/inventario-4-4-test.mjs` prova que hoje o comportamento está certo,
 *  contra o schema real. Este gate prova outra coisa: que os pontos onde o
 *  inventário voltaria a mentir continuam fechados, mesmo que alguém mexa
 *  neles sem rodar a suíte inteira.
 *
 *  Os quatro defeitos que ele existe para impedir, todos já vividos:
 *
 *   1. **não contado virar zero.** Era o defeito mais caro: concluir com
 *      metade do catálogo conferido tratava o resto como faltante, e a tela
 *      oferecia corrigir tudo de uma vez. Um inventário interrompido zerava
 *      meio catálogo — por movimentação registrada, mas zerava;
 *   2. **movimento sem variação.** `movimentar()` aceita `variacao`; o
 *      inventário antigo não passava nenhuma. Num código com variação, ele
 *      FABRICAVA um movimento incompleto novo — o problema que o documento
 *      do histórico existe para impedir;
 *   3. **diferença sem dono.** O vínculo entre o movimento e o inventário
 *      era a frase do `obs`. Texto livre não sustenta índice nem estorno;
 *   4. **idempotência de aplicação.** O flag `ajustado` era lido e escrito
 *      no mesmo batch, sem índice: duas abas abertas duplicavam o ajuste.
 *
 *  Roda sem banco, sem Worker e sem rede: só lê os arquivos.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ler = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const semComentario = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

let regras = 0;
const prova = (titulo) => { regras += 1; console.log(`  ok   ${titulo}`); };

const inventario = semComentario(ler('api/src/inventario.js'));
const saidas = semComentario(ler('api/src/saidas.js'));
const schema = ler('api/schema.sql');
const migration = ler('api/migracao-inventario-4-4.sql');

/* ── 1. O tri-estado tem de existir no BANCO, não só na cabeça de quem leu.
   É a ausência de linha que significa "não contado"; um `DEFAULT 0` em
   `contado` transformaria o silêncio em zero de novo. */
{
  for (const [nome, fonte] of [['schema.sql', schema], ['a migration', migration]]) {
    assert.match(fonte, /CREATE TABLE IF NOT EXISTS inventario_contagem/,
      `inventario_contagem sumiu de ${nome}`);
    const corpo = fonte.slice(fonte.indexOf('CREATE TABLE IF NOT EXISTS inventario_contagem'));
    const ate = corpo.slice(0, corpo.indexOf(');'));
    assert.match(ate, /contado\s+INTEGER NOT NULL CHECK \(contado >= 0\)/,
      `${nome}: contado deixou de aceitar zero, ou passou a aceitar negativo`);
    assert.ok(!/contado\s+INTEGER NOT NULL DEFAULT 0/.test(ate),
      `${nome}: contado ganhou DEFAULT 0 — o silêncio voltou a ser zero`);
    assert.match(ate, /PRIMARY KEY \(inventario_id, sku, variacao\)/,
      `${nome}: a chave da contagem deixou de incluir a variação`);
  }
  prova('a contagem tem chave por variação e zero é um valor, não um default');
}

/* ── 2. Contar zero nunca é descartado no caminho de UMA linha.
   O caminho em lote (a tela legada) descarta `qtd <= 0` porque ele não tem
   como dizer zero — mas o caminho novo tem, e descartar ali apagaria o
   único gesto que existe para "conferi, não tem nenhuma". */
{
  const i = inventario.indexOf('export async function contarItem(');
  assert.ok(i > 0, 'contarItem sumiu de inventario.js');
  const corpo = inventario.slice(i, inventario.indexOf('\n}', i));
  assert.ok(!/if \(!\(contado > 0\)\)/.test(corpo),
    'contarItem voltou a descartar a contagem zero');
  assert.match(corpo, /contado < 0/,
    'contarItem deixou de recusar contagem negativa');
  prova('contar zero é aceito; contar negativo, não');
}

/* ── 3. O inventário não movimenta estoque por conta própria.
   Toda diferença passa por `saidas.js › registrar`, que é quem grava
   variação, amarra `movimento_id` e sabe estornar. Voltar a chamar
   `movimentar` daqui reabriria os quatro defeitos de uma vez. */
{
  assert.ok(!/from '\.\/estoque\.js'/.test(inventario),
    'inventario.js voltou a importar estoque.js — a diferença tem de passar por saidas.js');
  assert.ok(!/\bmovimentar\(/.test(inventario),
    'inventario.js voltou a chamar movimentar() direto');
  assert.match(inventario, /import \{ registrarSaida \} from '\.\/saidas\.js'/,
    'inventario.js deixou de aplicar a diferença por saidas.js');
  prova('a diferença de inventário só vira estoque por saidas.js');
}

/* ── 4. A quantidade aplicada vem do retrato congelado, nunca do cliente.
   Ela já foi decidida no fechamento; aceitar um número novo aqui deixaria a
   tela reabrir a comparação sem ninguém recontar nada. */
{
  const i = inventario.indexOf('async function aplicarDiferenca(');
  assert.ok(i > 0, 'aplicarDiferenca sumiu de inventario.js');
  const corpo = inventario.slice(i, inventario.indexOf('\n}', i));
  assert.ok(!/pedido\.qtd|\.qtd\b\s*[,)]/.test(corpo.replace(/qtd: Math\.abs\(linha\.dif\)/g, '')),
    'a aplicação passou a ler a quantidade do corpo do cliente');
  assert.match(corpo, /qtd: Math\.abs\(linha\.dif\)/,
    'a aplicação deixou de usar a diferença congelada');
  assert.match(corpo, /inventarioId: id/,
    'a saída deixou de nascer vinculada ao inventário');
  prova('a aplicação usa a diferença congelada e vincula a saída ao inventário');
}

/* ── 5. Não conferido e não comparável nunca entram em correção.
   Esta é a trava que impede um inventário parado pela metade de zerar o
   catálogo, e a que impede inventar de qual aro a peça saiu. */
{
  const i = inventario.indexOf('async function aplicarDiferenca(');
  const corpo = inventario.slice(i, inventario.indexOf('\n}', i));
  assert.match(corpo, /situacao === 'nao_conferido'/,
    'a aplicação parou de recusar item não conferido');
  assert.match(corpo, /situacao === 'nao_comparavel'/,
    'a aplicação parou de recusar item não comparável');
  prova('não conferido e não comparável são recusados na aplicação');
}

/* ── 6. A idempotência é do banco. O índice único é a diferença entre
   "duas abas abertas duplicam o ajuste" e "a segunda tentativa é recusada",
   e a cláusula `estornada = 0` é o que permite relançar depois do estorno. */
{
  for (const [nome, fonte] of [['schema.sql', schema], ['a migration', migration]]) {
    assert.match(fonte, /CREATE UNIQUE INDEX IF NOT EXISTS idx_saida_inventario_unica/,
      `o índice de idempotência sumiu de ${nome}`);
    const i = fonte.indexOf('idx_saida_inventario_unica');
    const corpo = fonte.slice(i, fonte.indexOf(';', i));
    assert.match(corpo, /inventario_id, sku, COALESCE\(variacao, ''\)/,
      `${nome}: o índice deixou de separar por variação`);
    assert.match(corpo, /estornada = 0/,
      `${nome}: o índice passou a valer para linha estornada — o relançamento fica travado`);
  }
  assert.match(saidas, /UNIQUE constraint/i,
    'saidas.js parou de traduzir a recusa do índice em resposta');
  prova('a segunda aplicação é recusada pelo índice, e o estorno libera o relançamento');
}

/* ── 7. A ORIGEM do movimento diz de onde o fato nasceu.
   O motivo explica que é diferença; a origem diz que veio de uma contagem
   física, e é ela que a tela de histórico da peça mostra. */
{
  assert.match(saidas, /function origemDoMovimento\(tipo, inventarioId\)/,
    'saidas.js perdeu a origem por inventário');
  assert.match(saidas, /origem: origemDoMovimento\(tipo, inventarioId\)/,
    'o movimento da saída voltou a ter a origem fixa no tipo');
  assert.match(saidas, /inventarioId != null \? 'inventario' : tipo/,
    'a diferença de inventário deixou de nascer com origem `inventario`');
  prova('a diferença de inventário nasce com origem `inventario`');
}

/* ── 8. A tabela antiga é histórica: nada escreve nela.
   Ela não comporta variação na chave, e voltar a escrever ali é voltar a
   ter uma contagem por código que não sabe qual aro contou. */
{
  for (const escrita of [/INSERT\s+INTO\s+inventario_itens/i, /UPDATE\s+inventario_itens/i,
    /DELETE\s+FROM\s+inventario_itens/i]) {
    assert.ok(!escrita.test(inventario),
      `inventario.js voltou a escrever em inventario_itens (${escrita})`);
  }
  assert.match(inventario, /FROM inventario_itens/,
    'inventario.js parou de LER inventario_itens — os inventários antigos ficaram ilegíveis');
  prova('inventario_itens só é lida; os inventários antigos continuam legíveis');
}

/* ── 9. A migration é aditiva. Nenhum DROP, nenhuma tabela reconstruída,
   nenhum backfill — é o que a mantém Classe C e reversível. */
{
  const efetivo = migration.replace(/^--.*$/gm, '');
  assert.ok(!/\bDROP\b/i.test(efetivo), 'a migration ganhou um DROP');
  assert.ok(!/\bUPDATE\b/i.test(efetivo), 'a migration ganhou um backfill');
  assert.ok(!/\bINSERT\b/i.test(efetivo), 'a migration ganhou escrita de dado');
  assert.ok(!/_nova\b|_old\b|RENAME TO/i.test(efetivo),
    'a migration reconstrói tabela — é a operação que ela existe para evitar');
  assert.match(efetivo, /CREATE TABLE IF NOT EXISTS inventarios /,
    'a migration presume que migracao-inventario.sql já rodou em produção');
  prova('a migration é aditiva, idempotente e não presume o estado de produção');
}

console.log(`Inventário 4.4: ok — ${regras} travas no lugar`);
