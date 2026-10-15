/** A tradução de erro é o que a pessoa no balcão realmente lê quando algo
 *  quebra. Ela saiu do `catch` do entrypoint na Fase 3, e sem teste próprio
 *  a extração poderia mudar uma mensagem sem ninguém ver.
 *
 *  Os defeitos que este teste existe para impedir:
 *
 *   1. um erro de migração cair no 500 genérico — "Falha interna" manda
 *      procurar bug onde só falta rodar um .sql;
 *   2. a migração de foto ERRADA ser indicada: são três, e a ordem do teste
 *      é a regra — `loja_fotos` contém "foto_" e casaria com `foto_url`;
 *   3. o estouro de cota do D1 virar 500, que já mandou gente procurar
 *      defeito em cadastro, em payload e no banco de produção;
 *   4. o status deixar de ser 503 — o painel distingue "espere" de "quebrou";
 *   5. o `detalhe` do 500 sumir: a tela de conexão precisa da CAUSA;
 *   6. o log de falha deixar de sair, ou passar a imprimir a chave.
 */
import assert from 'node:assert/strict';
import {
  traduzirErro, registrarFalha, mensagemDe, tradutores,
} from '../api/src/http/erros.js';

const corpo = async (resposta) => JSON.parse(await resposta.text());

async function checar(nome, entrada, esperado) {
  const resposta = traduzirErro(entrada);
  const dados = await corpo(resposta);
  assert.equal(resposta.status, esperado.status, `${nome}: status`);
  for (const [campo, valor] of Object.entries(esperado.campos)) {
    assert.equal(dados[campo], valor, `${nome}: campo ${campo}`);
  }
  assert.equal(
    resposta.headers.get('Content-Type'),
    'application/json; charset=utf-8',
    `${nome}: content-type`,
  );
  console.log(`  ok   ${nome}`);
}

/* 1 e 4 — cada migração conhecida vira instrução, com 503. */
await checar('ficha de cliente sem a coluna cpf',
  new Error('D1_ERROR: no such column: cpf'),
  { status: 503, campos: { migracao: 'cliente-cpf' } });

await checar('cpf_norm também é reconhecido',
  new Error('no such column: cpf_norm'),
  { status: 503, campos: { migracao: 'cliente-cpf' } });

await checar('desconto por peça',
  new Error('no such column: desconto_valor'),
  { status: 503, campos: { migracao: 'venda-desconto' } });

await checar('preço de tabela conta como a mesma migração',
  new Error('no such column: preco_tabela'),
  { status: 503, campos: { migracao: 'venda-desconto' } });

/* 2 — as três migrações de foto, e a precedência entre elas. */
await checar('galeria da loja',
  new Error('no such table: loja_fotos'),
  { status: 503, campos: { migracao: 'fotos-loja' } });

await checar('vincular foto pela url',
  new Error('no such column: foto_url'),
  { status: 503, campos: { migracao: 'foto-url' } });

await checar('colunas de foto do catálogo',
  new Error('no such column: p.foto_original'),
  { status: 503, campos: { migracao: 'catalogo' } });

await checar('loja_fotos vence foto_url quando os dois aparecem',
  new Error('no such column: loja_fotos.foto_url'),
  { status: 503, campos: { migracao: 'fotos-loja' } });

await checar('produtos_pendentes cai na migração do catálogo',
  new Error('no such table: produtos_pendentes'),
  { status: 503, campos: { migracao: 'catalogo' } });

/* 3 — cota do D1: não é bug, é limite da conta. */
await checar('limite diário de leitura do D1',
  new Error('Too many API requests by single worker invocation. exceeded daily limit for rows read (D1)'),
  { status: 503, campos: { limite: 'd1-leitura-diaria' } });

{
  const dados = await corpo(traduzirErro(
    new Error('exceeded daily limit: rows read'),
  ));
  assert.ok(
    dados.detalhe.includes('exceeded daily limit: rows read'),
    'a mensagem crua do banco tem de continuar visível no detalhe da cota',
  );
  assert.ok(dados.detalhe.includes('21h de Brasília'), 'o horário de reset sumiu do detalhe');
  console.log('  ok   a cota mostra a mensagem do banco e a hora do reset');
}

/* 5 — o que ninguém reconhece continua chegando inteiro. */
{
  const resposta = traduzirErro(new Error('kaboom inesperado'));
  const dados = await corpo(resposta);
  assert.equal(resposta.status, 500);
  assert.equal(dados.erro, 'Falha interna');
  assert.equal(dados.detalhe, 'kaboom inesperado');
  console.log('  ok   erro desconhecido vira 500 com a causa no detalhe');
}

{
  /* Um `throw` de string, ou de algo sem `.message`, não pode virar
     "undefined" na tela. */
  assert.equal(mensagemDe('só um texto'), 'só um texto');
  assert.equal(mensagemDe({ toString: () => 'objeto falante' }), 'objeto falante');
  const dados = await corpo(traduzirErro('no such column: cpf'));
  assert.equal(dados.migracao, 'cliente-cpf', 'string lançada crua deixou de ser traduzida');
  console.log('  ok   exceção sem .message ainda produz mensagem útil');
}

/* Um erro comum de escrita não pode ser confundido com falta de migração:
   "no such column" é a marca, não a palavra "foto" sozinha. */
await checar('erro de negócio segue sendo 500',
  new Error('Estoque insuficiente para a foto do produto'),
  { status: 500, campos: { erro: 'Falha interna' } });

/* 6 — o log. `wrangler tail` imprime "Ok" para exceção tratada; sem esta
   linha a causa não chega a ninguém. */
{
  const linhas = [];
  const falso = { error: (...args) => linhas.push(args.join(' ')) };
  registrarFalha(new Error('estourou'), { metodo: 'POST', path: '/api/vendas', console: falso });
  assert.equal(linhas.length, 1, 'a falha deixou de ser registrada');
  assert.ok(linhas[0].includes('POST'), 'o método sumiu do log');
  assert.ok(linhas[0].includes('/api/vendas'), 'o caminho sumiu do log');
  assert.ok(linhas[0].includes('estourou'), 'a mensagem sumiu do log');
  assert.ok(!/Bearer|Authorization/i.test(linhas[0]), 'o log passou a citar credencial');
  console.log('  ok   a falha é registrada com método, caminho e causa');
}

/* A tabela é ordenada e cada tradutor tem de ser identificável — id
   duplicado esconde qual regra respondeu. */
{
  const ids = tradutores.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'há id de tradutor repetido');
  for (const t of tradutores) {
    assert.equal(typeof t.reconhece, 'function', `${t.id}: reconhece`);
    assert.equal(typeof t.resposta, 'function', `${t.id}: resposta`);
  }
  console.log(`  ok   tabela com ${ids.length} tradutores: ${ids.join(', ')}`);
}

console.log('Política de erros: ok');
