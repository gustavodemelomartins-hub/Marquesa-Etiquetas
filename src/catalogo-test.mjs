/** Catálogo: importar em lote sem travar, e nunca aplicar sem análise.
 *
 *  O que precisa ficar provado aqui, em ordem de importância:
 *
 *   1. planilha com produto novo NÃO derruba a importação dos outros
 *   2. análise não escreve nada — nem uma linha
 *   3. o que vai ser aplicado é recalculado na hora, não no momento da análise
 *   4. peça nova entra em lote; só a exceção pede olho humano
 *   5. o fluxo de peças novas NUNCA altera cadastro que já existe
 *   6. foto da loja casa por SKU exato; o que não bate vai para a fila
 *   7. fundo branco sem serviço configurado fica pendente, não fica "pronto"
 *
 *  Precisa do Worker local no ar e do banco limpo.
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

const estado = () => api('GET', '/api/state');
const saldo = async sku => {
  const p = (await estado()).produtos.find(x => x.sku === sku);
  return p ? p.qtd : null;
};

/* ------------------------------------------------------------------ */
console.log('\n=== 1. peças novas em lote ===');

let r = await api('POST', '/api/produtos/novos/analisar', {
  produtos: [
    { sku: 'C1', desc: 'Colar C1', cat: 'Colar', qtd: 5, preco: 100 },
    { sku: 'C2', desc: 'Brinco C2', cat: 'Brinco', qtd: 3, preco: 60 },
    { sku: 'C3', desc: 'Anel C3', cat: 'Anel', qtd: 2, preco: 80 },
    { sku: '', desc: 'linha sem código' },                       // exceção
    { sku: 'C4', desc: '', cat: 'Colar', qtd: 1, preco: 10 },     // exceção
    { sku: 'C5', desc: 'Sem preço', cat: 'Colar', qtd: 1 },       // NÃO é exceção (§24)
    { sku: 'C6', desc: 'Qtd torta', cat: 'Colar', preco: 10, brutoQtd: 'várias' }, // exceção
    { sku: 'C7', desc: 'Categoria que não existe', cat: 'Tiara', qtd: 1, preco: 10 }, // exceção
    { sku: 'C1', desc: 'Colar C1 de novo', cat: 'Colar', qtd: 9, preco: 100 },     // exceção
  ],
});
eq('9 linhas lidas', r.resumo.linhas, 9);
eq('4 prontas para cadastrar sem perguntar nada', r.resumo.prontos, 4);
eq('5 exceções separadas', r.resumo.revisao, 5);
eq('e nenhuma delas é "já existe"', r.resumo.jaExistem, 0);
eq('a linha repetida foi apontada como conflito',
  r.revisao.itens.find(x => x.sku === 'C1').motivos[0], 'dados_conflitantes');

/* Peça sem preço NÃO é exceção. §24 trata "sem preço" como um estado
   legítimo — diferente de R$ 0 — e a venda dela já fica bloqueada por
   isso. Mandar para revisão seria cobrar um clique por peça justamente
   no fluxo que existe para acabar com isso. Ela entra marcada. */
eq('sem preço entra no lote, não na revisão',
  r.prontos.itens.some(x => x.sku === 'C5'), 'true');
eq('com preço nulo, e não R$ 0 (§24)',
  r.prontos.itens.find(x => x.sku === 'C5').preco, 'null');
eq('e marcada, para a tela poder avisar', r.resumo.semPreco, 1);

r = await api('POST', '/api/produtos/novos/cadastrar', {
  produtos: [
    { sku: 'C1', desc: 'Colar C1', cat: 'Colar', qtd: 5, preco: 100 },
    { sku: 'C2', desc: 'Brinco C2', cat: 'Brinco', qtd: 3, preco: 60 },
    { sku: 'C3', desc: 'Anel C3', cat: 'Anel', qtd: 2, preco: 80 },
  ],
});
eq('os 3 válidos entraram de uma vez só', r.criados, 3);
eq('e o saldo veio do movimento de entrada', await saldo('C1'), 5);

console.log('\n=== 2. o fluxo de peças novas não altera cadastro existente ===');
r = await api('POST', '/api/produtos/novos/cadastrar', {
  produtos: [{ sku: 'C1', desc: 'NOME TROCADO', cat: 'Anel', qtd: 999, preco: 1 }],
});
eq('recusa mexer em quem já existe', r.ignorados[0].motivo, 'ja_existe');
const c1 = (await estado()).produtos.find(p => p.sku === 'C1');
eq('a descrição continua a de antes', c1.desc, 'Colar C1');
eq('e o saldo não foi tocado', c1.qtd, 5);

/* ------------------------------------------------------------------ */
console.log('\n=== 3. estoque total: produto novo não trava a planilha ===');

const planilha = {
  modo: 'total',
  produtos: [
    { sku: 'C1', desc: 'Colar C1', qtd: 5 },        // A — igual
    { sku: 'C2', desc: 'Brinco C2', qtd: 9 },       // B — muda
    { sku: 'NOVO', desc: 'Peça nova', qtd: 4, preco: 30 },  // C — não existe
    { sku: 'C3', desc: 'Anel C3', brutoQtd: 'ver com a Sthefany' }, // E — revisão
    // C3 fora do grupo B; C1 e C2 seguem normalmente
  ],
};
r = await api('POST', '/api/estoque-total/analisar', planilha);
eq('4 linhas analisadas', r.resumo.linhas, 4);
eq('1 já estava de acordo', r.resumo.semMudanca, 1);
eq('1 quantidade vai mudar', r.resumo.vaoMudar, 1);
eq('1 produto novo encontrado, e ele NÃO trava nada', r.resumo.novos, 1);
eq('1 item para revisão, sozinho', r.resumo.revisao, 1);
eq('e o item problemático não derrubou os outros',
  r.mudam.itens.length && r.mudam.itens[0].sku, 'C2');

console.log('\n=== 4. a análise não escreve nada ===');
eq('C2 continua com o saldo de antes da análise', await saldo('C2'), 3);
eq('e o produto novo não foi criado às escondidas',
  (await estado()).produtos.some(p => p.sku === 'NOVO'), 'false');

console.log('\n=== 5. aplicar recalcula o delta na hora ===');
/* Entre a análise e o clique alguém vendeu uma C2 no balcão. Se o aplicar
   confiasse no delta calculado antes (+6), o saldo terminaria errado. O
   alvo é 9, e 9 é o que precisa sair — não 3 − 1 + 6. */
await api('POST', '/api/produtos/C2/movimento', { tipo: 'venda', quantidade: 1 });
eq('a venda de balcão baixou C2 para 2', await saldo('C2'), 2);
r = await api('POST', '/api/estoque-total/aplicar', { itens: [{ sku: 'C2', para: 9 }] });
eq('1 alteração aplicada', r.aplicados, 1);
eq('o alvo da planilha é o que vale', await saldo('C2'), 9);
eq('e o ajuste foi de 7, não de 6', r.detalhe.itens[0].delta, 7);

r = await api('GET', '/api/estoque/conferir');
eq('a razão continua fechando (§19)', (r.divergentes || []).length, 0);

console.log('\n=== 6. aplicar recusa o que a análise não aprovaria ===');
r = await api('POST', '/api/estoque-total/aplicar', { itens: [{ sku: 'NOVO', para: 4 }] });
eq('não cria produto por dentro do fluxo de estoque', r.aplicados, 0);
eq('e diz por quê', r.recusados[0].motivo, 'nao_existe');

console.log('\n=== 7. a fila liga um fluxo ao outro ===');
await api('POST', '/api/produtos/pendentes', {
  origem: 'planilha',
  produtos: [{ sku: 'NOVO', desc: 'Peça nova', qtd: 4, preco: 30 }],
});
r = await api('GET', '/api/produtos/pendentes');
eq('o produto novo ficou esperando o lote', r.produtos.length, 1);
eq('com os dados da planilha, sem reimportar o arquivo', r.produtos[0].qtd, 4);
eq('e o painel sabe que existe fila', (await estado()).catalogo.pendentes, 1);

await api('POST', '/api/produtos/novos/cadastrar', {
  produtos: [{ sku: 'NOVO', desc: 'Peça nova', cat: 'Colar', qtd: 4, preco: 30 }],
});
eq('cadastrar tira da fila sozinho', (await estado()).catalogo.pendentes, 0);

/* ------------------------------------------------------------------ */
console.log('\n=== 8. análise da sincronização: leitura pura ===');
const loja = await subirLojaFalsa();
loja.estado.produtos = [
  produtoFalso(1, [{ id: 11, sku: 'C1', estoque: 5 }], { imagens: ['https://loja/c1.jpg'] }),
  produtoFalso(2, [{ id: 22, sku: 'C2', estoque: 1 }], { imagens: ['https://loja/c2.jpg'] }),
  produtoFalso(3, [{ id: 33, sku: 'SO-DA-LOJA', estoque: 7 }], { imagens: ['https://loja/x.jpg'] }),
];

const antes = await estado();
r = await api('POST', '/api/sync/analisar');
eq('a análise rodou', r.ok, 'true');
eq('C1 está em dia', r.resumo.sincronizados, 1);
eq('C2 tem estoque diferente (loja 1, real 9)', r.resumo.estoqueDiferente, 1);
eq('C3 e NOVO precisam ser criados na loja', r.resumo.criarNaLoja, 2);
eq('e a loja tem 1 código que não é nosso', r.resumo.soNaLoja, 1);
eq('todos os que faltam subir estão sem foto', r.resumo.semFoto, 2);
eq('nada foi escrito na loja', loja.estado.escritas.length, 0);
const depois = await estado();
eq('e nada mudou aqui também',
  JSON.stringify(depois.produtos.map(p => [p.sku, p.qtd])),
  JSON.stringify(antes.produtos.map(p => [p.sku, p.qtd])));

/* ------------------------------------------------------------------ */
console.log('\n=== 9. fotos da loja ===');
r = await api('POST', '/api/fotos/importar-da-loja', { seco: true });
eq('a prévia acha 2 fotos com dono', r.resumo.casadas, 2);
eq('e 1 sem correspondência', r.resumo.orfas, 1);
eq('prévia não grava nada', (await estado()).catalogo.fotosOrfas, 0);

r = await api('POST', '/api/fotos/importar-da-loja', {});
eq('a importação de verdade casa as 2', r.resumo.casadas, 2);
const c1f = (await estado()).produtos.find(p => p.sku === 'C1');
eq('C1 ficou com a foto original', c1f.fotoOriginal, 'https://loja/c1.jpg');
eq('e com o estado certo: falta o fundo branco', c1f.fotoStatus, 'original');
r = await api('GET', '/api/fotos/orfas');
eq('a foto sem dono foi para a fila, sem chute', r.fotos.length, 1);
eq('guardando o código que a loja usava', r.fotos[0].skuLoja, 'SO-DA-LOJA');

r = await api('POST', '/api/fotos/importar-da-loja', {});
eq('rodar de novo não sobrescreve foto que já existe', r.resumo.casadas, 0);
eq('e as 2 aparecem como já resolvidas', r.resumo.jaTinham, 2);

console.log('\n=== 10. fundo branco sem serviço configurado ===');
r = await api('POST', '/api/produtos/C1/foto/fundo-branco');
eq('a peça entra na fila', r.status, 'fundo_pendente');
const c1p = (await estado()).produtos.find(p => p.sku === 'C1');
eq('e NÃO ganha uma imagem tratada inventada', c1p.fotoTratada, 'undefined');

/* NOVO nunca esteve na loja, então não recebeu foto nenhuma na carga. */
r = await api('POST', '/api/produtos/NOVO/foto/fundo-branco');
eq('peça sem foto original recusa com explicação',
  /não tem foto original/.test(r.erro || ''), 'true');

console.log('\n=== 11. lote grande: nada pode sumir no caminho ===');
/* O cenário do pedido, com o número dele: 782 linhas certas. A resposta da
   análise corta as listas que a tela só EXIBE, e é fácil cortar por engano
   as que ela USA — aí 282 peças somem em silêncio e a tela ainda diz que
   deu tudo certo. Este bloco existe para esse corte não voltar. */
const lote = [];
for (let i = 0; i < 782; i++) {
  lote.push({ sku: 'L' + String(i).padStart(4, '0'), desc: 'Peça de lote ' + i,
              cat: 'Colar', preco: 50 + (i % 30), qtd: 1 });
}
r = await api('POST', '/api/produtos/novos/analisar', { produtos: lote });
eq('as 782 estão prontas', r.resumo.prontos, 782);
eq('e as 782 voltam inteiras, não cortadas', r.prontos.itens.length, 782);

r = await api('POST', '/api/produtos/novos/cadastrar', { produtos: r.prontos.itens });
eq('as 782 foram cadastradas de uma vez', r.criados, 782);
const total = (await estado()).produtos.filter(p => p.sku.startsWith('L')).length;
eq('e as 782 estão mesmo no catálogo', total, 782);

/* O mesmo risco do outro lado: aplicar estoque de um lote grande. */
const planilhaGrande = lote.map(p => ({ ...p, qtd: 5, brutoQtd: '5' }));
r = await api('POST', '/api/estoque-total/analisar', { modo: 'total', produtos: planilhaGrande });
eq('a análise vê as 782 quantidades mudando', r.resumo.vaoMudar, 782);
eq('e devolve as 782 para aplicar', r.mudam.itens.length, 782);

r = await api('POST', '/api/estoque-total/aplicar',
  { itens: r.mudam.itens.map(m => ({ sku: m.sku, para: m.para })) });
eq('todas as 782 foram aplicadas', r.aplicados, 782);
eq('sem sobrar código com o saldo velho',
  (await estado()).produtos.filter(p => p.sku.startsWith('L') && p.qtd !== 5).length, 0);

r = await api('GET', '/api/estoque/conferir');
eq('e a razão fecha depois do lote grande (§19)', (r.divergentes || []).length, 0);

console.log('\n=== 12. o que o agente de catálogo enxerga ===');
r = await api('GET', '/api/catalogo/publicacao');
eq('nada está pronto para publicar', r.resumo.prontos, 0);
/* 782 do lote + C3 e NOVO: nenhuma delas passou pela loja, então nenhuma
   tem foto. É por isso que a fila de "prontos para subir" está vazia. */
eq('porque nenhuma das que faltam subir tem foto', r.resumo.semFoto, 784);
eq('e o que está pronto nunca aparece também como pendente',
  r.prontos.some(x => r.semFoto.some(y => y.sku === x.sku)), 'false');

await loja.fechar();
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
