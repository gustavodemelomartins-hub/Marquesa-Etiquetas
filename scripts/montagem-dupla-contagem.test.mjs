/** Gate de código-fonte: uma configuração montável nunca soma estoque.
 *
 *  A regra de ouro do Monte seu Colar é uma só:
 *
 *      ESTOQUE FINANCEIRO = somente aquilo que fisicamente existe
 *
 *  Se "Colar Casal" contar como peça ao lado das venezianas e dos pingentes
 *  que ele consome, as mesmas peças são contadas duas vezes — em
 *  quantidade, em valor e na contagem física. O erro não aparece na tela:
 *  os dois números continuam plausíveis, e ninguém descobre até a Sthefany
 *  contar a gaveta.
 *
 *  Os testes de comportamento (`src/montagem-*-test.mjs`) provam que hoje
 *  está certo. Este gate prova outra coisa: que os quatro pontos onde a
 *  dupla contagem entraria continuam fechados no código, mesmo que alguém
 *  mexa neles sem rodar a suíte inteira.
 *
 *  Roda sem banco, sem Worker e sem rede: só lê os arquivos.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ler = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const semComentario = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

let regras = 0;
const prova = (titulo) => { regras++; console.log(`  ok   ${titulo}`); };

/* ── 1. O inventário não conta configuração.
   Bipar um "Colar Casal" e somá-lo aos pingentes que já foram bipados é a
   dupla contagem na sua forma mais direta — e a mais difícil de desfazer,
   porque vira ajuste de estoque assinado. */
{
  const src = semComentario(ler('api/src/inventario.js'));
  assert.match(
    src,
    /NOT IN \(SELECT sku_comercial FROM personalizacao_modelos/,
    'o inventário voltou a contar configurações montáveis',
  );
  assert.match(src, /NOT IN \(SELECT kit_sku FROM kit_componentes\)/,
    'o inventário voltou a contar kits');
  prova('o inventário exclui configuração montável e kit');
}

/* ── 2. Configuração não entra em maleta.
   A consignação tem efeito 0 no saldo. Mandar a configuração para a maleta
   reservaria peças que continuariam "disponíveis" para outra venda. */
{
  const src = semComentario(ler('api/src/maletas-comandos.js'));
  assert.match(src, /semSaldoProprio\(s\)/,
    'a maleta deixou de recusar o que não tem saldo próprio');
  prova('a maleta recusa configuração montável e kit');
}

/* ── 3. Ninguém vende a configuração como peça avulsa.
   É o caminho mais fácil para o `produtos.qtd` legado dela virar baixa de
   estoque: `326660` tem 1 em produção, herdado de uma importação. */
{
  const src = semComentario(ler('api/src/vendas-comandos.js'));
  assert.match(src, /if \(s\.montagem\)/,
    'a venda de linha avulsa deixou de recusar configuração montável');
  prova('a venda avulsa de um SKU comercial de configuração é recusada');
}

/* ── 4. `produtos.qtd` de uma configuração nunca é lido como saldo.
   `saldosDaConfiguracao` devolve `qtd: 0` fixo. Trocar isso por
   `produto.qtd` faria o resíduo virar estoque sem nenhum erro visível. */
{
  const src = ler('api/src/estoque.js');
  const i = src.indexOf('export async function saldosDaConfiguracao');
  assert.ok(i > 0, 'saldosDaConfiguracao sumiu de estoque.js');
  const corpo = src.slice(i, src.indexOf('\n}', i));
  assert.match(corpo, /qtd: 0, consignado: 0/,
    'a configuração passou a devolver saldo próprio');
  assert.ok(!/produto\.qtd/.test(semComentario(corpo)),
    'saldosDaConfiguracao passou a ler produtos.qtd — é resíduo, não peça');
  prova('o saldo de uma configuração é sempre zero, nunca produtos.qtd');
}

/* ── 5. Nenhuma soma patrimonial de estoque existe no backend.
   Hoje não existe — medido em 10/09/2026. Este gate não proíbe criar uma:
   proíbe criar uma que varra `produtos` sem excluir o que não é peça. Se
   alguém precisar do valor do estoque, tem de dizer aqui o que exclui. */
{
  const dir = 'api/src';
  const arquivos = [];
  const varrer = (d) => {
    for (const e of readdirSync(join(process.cwd(), d), { withFileTypes: true })) {
      if (e.isDirectory()) varrer(`${d}/${e.name}`);
      else if (e.name.endsWith('.js')) arquivos.push(`${d}/${e.name}`);
    }
  };
  varrer(dir);

  /* `SUM(...qtd * ...preco)` sobre a tabela `produtos`. Sobre `venda_itens`
     é faturamento, que é outra coisa e continua livre. */
  const soma = /SUM\s*\(\s*[\w.]*qtd\s*\*\s*[\w.]*preco/i;
  const suspeitos = [];
  for (const f of arquivos) {
    const src = semComentario(ler(f));
    if (!soma.test(src)) continue;
    for (const trecho of src.split(/;\s*\n/)) {
      if (soma.test(trecho) && /FROM\s+produtos\b/i.test(trecho)) suspeitos.push(f);
    }
  }
  assert.deepEqual(suspeitos, [],
    `soma patrimonial sobre produtos sem exclusão declarada em: ${suspeitos.join(', ')}. `
    + 'Se o valor do estoque passar a existir, ele tem de excluir kit e configuração '
    + 'montável — senão conta a mesma peça duas vezes.');
  prova(`nenhuma soma patrimonial cega sobre produtos (${arquivos.length} módulos varridos)`);
}

/* ── 6. A configuração não pode ser componente de si mesma nem de outra.
   Composição dentro de composição faria `montagensPossiveis` se chamar em
   cadeia e a mesma peça entrar duas vezes na conta. */
{
  const src = semComentario(ler('api/src/personalizacao.js'));
  assert.match(src, /não pode ser componente/,
    'o cadastro deixou de recusar configuração como componente');
  assert.match(src, /não pode ser base/,
    'o cadastro deixou de recusar configuração como base');
  assert.match(src, /aparece em dois grupos/,
    'o cadastro deixou de recusar o mesmo SKU em dois grupos — ele seria somado duas vezes');
  prova('o cadastro recusa composição dentro de composição e SKU em dois grupos');
}

console.log(`Dupla contagem de montagem: ok — ${regras} travas no lugar`);
