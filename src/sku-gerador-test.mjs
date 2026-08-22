/** A2 — o código gerado, depois que a auditoria respondeu.
 *
 *  A auditoria rodou contra o catálogo real e não deixou margem: 776
 *  códigos, todos com exatamente seis dígitos, forma `9×6` em 100% deles,
 *  nenhum prefixo, nenhum sufixo, zero colisões — e densidade 0,001 na
 *  faixa de 100633 a 997620.
 *
 *  Os dois fatos decidem coisas diferentes, e é isso que este teste guarda:
 *
 *    o FORMATO existe   ⇒ o gerado tem de ter a cara dos outros: seis
 *                         números, sem letra nenhuma. `MQ00001` inventava
 *                         um segundo formato num catálogo que só tem um.
 *    a SEQUÊNCIA não    ⇒ nada de `max + 1`. Continuar uma contagem que não
 *                         existe é escolher um número que o fornecedor
 *                         ainda pode usar amanhã, e a colisão só apareceria
 *                         meses depois, numa etiqueta impressa.
 *
 *  O que precisa ficar provado:
 *
 *   1. o gerado é sempre seis dígitos, dentro de 100000–999999, sem prefixo;
 *   2. o formato antigo (`MQ` + 5) não sai mais de jeito nenhum;
 *   3. duas chamadas simultâneas nunca recebem o mesmo código;
 *   4. o sorteio que cai em cima de um código já usado é DESCARTADO e
 *      sorteia outro — em `produtos`, na loja e na reserva de alguém;
 *   5. o código digitado à mão é conferido: letra, cinco ou sete dígitos e
 *      duplicado são recusados, e a recusa é do BACKEND, não da tela;
 *   6. a regra dos seis dígitos vale para o que se digita AQUI e não para o
 *      que vem de planilha — senão a importação do catálogo do fornecedor
 *      quebraria inteira;
 *   7. nenhum código que já existia foi alterado por nada disso.
 */
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';
import { gerarSku, formatoManual } from '../api/src/sku.js';

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

const gerar = (origem = 'teste') => api('POST', '/api/produtos/sku/gerar', { origem });
const checar = sku => api('GET', '/api/produtos/sku/checar?sku=' + encodeURIComponent(sku));

const loja = await subirLojaFalsa();

/* --------------------------------------------------------------- cenário
   Um catálogo pequeno com a cara do real: códigos numéricos de seis
   dígitos, espalhados, vindos do fornecedor. */
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: '122809', desc: 'Anel cristal', cat: 'Anel', preco: 90, qtd: 3 },
    { sku: '551117', desc: 'Colar ponto de luz', cat: 'Colar', preco: 120, qtd: 2 },
    { sku: '997620', desc: 'Brinco argola', cat: 'Brinco', preco: 70, qtd: 5 },
  ],
});

console.log('\n=== 1. o gerado tem a cara dos códigos reais ===');
const lote = [];
for (let i = 0; i < 25; i++) lote.push((await gerar()).sku);
eq('gerou os 25', lote.filter(Boolean).length, 25);
eq('todos com SEIS dígitos e nada além disso', lote.every(s => /^\d{6}$/.test(s)), 'true');
eq('todos dentro da faixa 100000–999999',
  lote.every(s => Number(s) >= 100000 && Number(s) <= 999999), 'true');
eq('nenhum com prefixo de letra', lote.some(s => /[A-Za-z]/.test(s)), 'false');

console.log('\n=== 2. o formato antigo MQ não existe mais ===');
/* Ele foi uma decisão consciente enquanto a auditoria não tinha rodado.
   Rodou: o catálogo tem UM formato, e não é esse. */
eq('nenhum código gerado começa com MQ', lote.some(s => s.startsWith('MQ')), 'false');
const aud = await api('GET', '/api/produtos/sku/auditoria');
eq('e a auditoria descreve o gerador de hoje', aud.geradorAtual.modo, 'sorteio');
eq('com seis dígitos', aud.geradorAtual.digitos, 6);
eq('sem prefixo', aud.geradorAtual.prefixo, '(nenhum)');
eq('e a faixa dita por extenso', `${aud.geradorAtual.min}-${aud.geradorAtual.max}`, '100000-999999');
eq('a regra em vigor está escrita', /sorteado entre 100000 e 999999/.test(aud.conclusao.regraEmVigor), 'true');
/* O que a auditoria MEDE continua o que era: não há sequência a continuar.
   A decisão não contradiz a medida — ela nasce dela. */
eq('e a medida não foi maquiada para caber na decisão',
  aud.conclusao.regraInequivoca, 'false');

console.log('\n=== 3. não repete, nem com todo mundo clicando junto ===');
const simultaneos = await Promise.all(Array.from({ length: 15 }, () => gerar()));
eq('as quinze geraram', simultaneos.filter(x => x.ok).length, 15);
eq('e todas com códigos DIFERENTES', new Set(simultaneos.map(x => x.sku)).size, 15);
eq('todos no formato', simultaneos.every(x => /^\d{6}$/.test(x.sku)), 'true');
/* Cada código sai RESERVADO, não solto: é a reserva que impede a segunda
   pessoa de receber o mesmo número enquanto a primeira preenche o resto do
   formulário. */
const c1 = await checar(simultaneos[0].sku);
eq('o gerado já está reservado no banco', c1.usos.length, 1);
eq('e a reserva é o único uso dele', c1.usos[0].onde, 'reserva');

console.log('\n=== 4. o sorteio nunca devolve código de alguém ===');
const usados = new Set(['122809', '551117', '997620', ...lote, ...simultaneos.map(x => x.sku)]);
const mais = [];
for (let i = 0; i < 20; i++) mais.push((await gerar()).sku);
eq('nenhum sorteado bateu em código já em uso', mais.some(s => usados.has(s)), 'false');

console.log('\n=== 5. e quando bate, ele DESCARTA e sorteia outro ===');
/* O sorteio de verdade quase nunca colide — 800 códigos em 900 mil lugares.
   "Quase nunca" não é teste: aqui o sorteio é forçado a cair em cima de
   cada um dos quatro lugares que impedem, um de cada vez, e o que se cobra
   é que o gerador jogue fora e continue em vez de devolver o código de
   alguém. */
const bancoFalso = ({ produtos = [], pendentes = [], loja: naLoja = [], reservas = [] }) => {
  const res = new Set(reservas);
  const consulta = (sql, args) => {
    const chave = String(args[0] || '');
    if (/FROM produtos_pendentes/.test(sql)) return pendentes.filter(s => s === chave).map(s => ({ sku: s }));
    if (/FROM loja_variantes/.test(sql)) {
      return naLoja.filter(s => s === chave)
        .map(s => ({ variante_id: 9, produto_id: 1, nome: 'Cristal', produto_nome: 'Anel' }));
    }
    if (/FROM sku_reservas/.test(sql)) return res.has(chave) ? [{ sku: chave, expira_em: 'depois', origem: 'outro' }] : [];
    if (/FROM produtos/.test(sql)) return produtos.filter(s => s === chave).map(s => ({ sku: s, desc: 'peça', status: 'ativo', qtd: 1 }));
    return [];
  };
  const executa = (sql, args) => {
    if (/DELETE FROM sku_reservas WHERE expira_em/.test(sql)) return { meta: { changes: 0 } };
    if (/INSERT OR IGNORE INTO sku_reservas/.test(sql)) {
      if (res.has(args[0])) return { meta: { changes: 0 } };     // outra chamada levou este
      res.add(args[0]);
      return { meta: { changes: 1 } };
    }
    if (/DELETE FROM sku_reservas WHERE sku/.test(sql)) { res.delete(args[0]); return { meta: { changes: 1 } }; }
    return { meta: { changes: 0 } };
  };
  const corpo = (sql, args) => ({
    run: async () => executa(sql, args),
    first: async () => consulta(sql, args)[0] || null,
    all: async () => ({ results: consulta(sql, args) }),
  });
  return { prepare: sql => ({ bind: (...args) => corpo(sql, args), ...corpo(sql, []) }), reservas: res };
};

/** Faz o sorteio sair na ordem que o teste mandar, e depois devolve o
    `crypto` de verdade. `sortear` lê `globalThis.crypto` na hora de sortear,
    então trocá-lo aqui é o suficiente. */
const cryptoReal = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
function sorteioForcado(codigos) {
  let i = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues(buf) {
        const n = codigos[Math.min(i++, codigos.length - 1)];
        buf[0] = n - 100000;                    // sortear() faz SKU_MIN + (buf % faixa)
        return buf;
      },
    },
  });
}
const devolverCrypto = () => Object.defineProperty(globalThis, 'crypto', cryptoReal);

for (const [onde, banco, sobra] of [
  /* Nos três primeiros o gerador chegou a reservar o sorteado e tem de
     DESFAZER a própria reserva ao descartá-lo — senão cada colisão iria
     entupindo a tabela com códigos presos que ninguém vai usar.
     No quarto não: a reserva de 100001 é de OUTRA pessoa, e apagá-la seria
     roubar o código de quem está preenchendo o formulário. */
  ['produtos', bancoFalso({ produtos: ['100001'] }), false],
  ['loja_variantes', bancoFalso({ loja: ['100001'] }), false],
  ['produtos_pendentes', bancoFalso({ pendentes: ['100001'] }), false],
  ['reserva de outra pessoa', bancoFalso({ reservas: ['100001'] }), true],
]) {
  sorteioForcado([100001, 100002]);
  const r = await gerarSku(banco, { origem: 'teste' });
  devolverCrypto();
  eq(`sorteio que cai em ${onde} é descartado`, r.sku, '100002');
  eq('  e o código sai na segunda tentativa', r.tentativas, 2);
  eq('  a reserva de 100001 fica como devia', banco.reservas.has('100001'), String(sobra));
  eq('  e a que valeu está reservada', banco.reservas.has('100002'), 'true');
}

/* E quando nada dá certo, ele DIZ que não deu — não devolve um código que
   não foi conferido, nem gira para sempre. */
sorteioForcado([100001]);
const semSaida = await gerarSku(bancoFalso({ produtos: ['100001'] }), {});
devolverCrypto();
eq('esgotadas as tentativas, a resposta é um não explicado', semSaida.ok, 'false');
eq('com o motivo escrito', /tentativas/.test(semSaida.erro || ''), 'true');

console.log('\n=== 6. o código digitado à mão é conferido ===');
eq('letra não passa', formatoManual('ANELB').motivo, 'nao_sao_seis_numeros');
eq('cinco dígitos não passam', formatoManual('12280').motivo, 'nao_sao_seis_numeros');
eq('sete dígitos não passam', formatoManual('1228091').motivo, 'nao_sao_seis_numeros');
eq('zero à esquerda não passa (fica fora da faixa)', formatoManual('012280').motivo, 'nao_sao_seis_numeros');
eq('seis dígitos passam', formatoManual('123456').ok, 'true');
eq('e o recado é o que a tela mostra', formatoManual('ABC').recado, 'O código deve ter 6 números.');

/* A mesma pergunta pela rota que a tela usa enquanto se digita. */
const cLetra = await checar('ANELB');
eq('a rota de checagem também diz que o formato não serve', cLetra.formato.ok, 'false');
eq('com o mesmo recado', cLetra.formato.recado, 'O código deve ter 6 números.');
const cLivre = await checar('654321');
eq('e um código de seis dígitos inédito está livre', cLivre.disponivel, 'true');
eq('com o formato aprovado', cLivre.formato.ok, 'true');

console.log('\n=== 7. a trava é do BACKEND, não da tela ===');
/* Mandando direto para a rota, sem passar pela tela, com `origem: manual`. */
let r = await api('POST', '/api/produtos/novos/analisar', {
  origem: 'manual',
  produtos: [{ sku: 'ANELB', desc: 'Digitado errado', qtd: 1, preco: 10 }],
});
eq('a análise manda para revisão', r.resumo.revisao, 1);
eq('com o motivo certo', r.revisao.itens[0].motivos.includes('codigo_fora_do_formato'), 'true');

r = await api('POST', '/api/produtos/novos/cadastrar', {
  origem: 'manual',
  produtos: [{ sku: 'ANELB', desc: 'Digitado errado', cat: 'Anel', qtd: 1, preco: 10 }],
});
eq('e o cadastro direto é recusado', r.criados, 0);
eq('dizendo por quê', r.ignorados[0].motivo, 'codigo_fora_do_formato');

r = await api('POST', '/api/produtos/novos/cadastrar', {
  origem: 'manual',
  produtos: [{ sku: '122809', desc: 'Duplicado', cat: 'Anel', qtd: 1, preco: 10 }],
});
eq('código de seis dígitos que já é peça também é recusado', r.criados, 0);
eq('e a recusa é a de sempre', r.ignorados[0].motivo, 'ja_existe');

console.log('\n=== 8. planilha continua aceitando o código do fornecedor ===');
/* A regra dos seis dígitos é do que se DIGITA aqui. Se ela valesse para a
   importação, um catálogo com `BR-1` derrubaria o arquivo inteiro — e é a
   loja e o fornecedor que escolhem o código deles, não nós. */
r = await api('POST', '/api/produtos/novos/analisar', {
  produtos: [{ sku: 'BR-1', desc: 'Código do fornecedor', qtd: 1, preco: 10 }],
});
eq('sem origem manual, o código de outro formato passa', r.resumo.prontos, 1);
r = await api('POST', '/api/produtos/novos/cadastrar', {
  produtos: [{ sku: 'BR-1', desc: 'Código do fornecedor', cat: 'Anel', qtd: 1, preco: 10 }],
});
eq('e cadastra', r.criados, 1);

console.log('\n=== 9. nada disso mexeu no que já existia ===');
const estado = await api('GET', '/api/state');
const antes = { '122809': 3, '551117': 2, '997620': 5 };
for (const [sku, qtd] of Object.entries(antes)) {
  const p = estado.produtos.find(x => x.sku === sku);
  eq(`${sku} continua igual`, p && p.qtd, qtd);
}
eq('nenhum código existente virou outro',
  Object.keys(antes).every(s => estado.produtos.some(p => p.sku === s)), 'true');
const conf = await api('GET', '/api/estoque/conferir');
eq('e a razão fecha (§19)', (conf.divergentes || conf.divergencias || []).length, 0);

await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
