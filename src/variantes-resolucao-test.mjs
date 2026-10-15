/** Fase 4, item 2 — a resolução de variação, fixada antes de qualquer
 *  refatoração.
 *
 *  `resolverVariantes` decide, para UM código, se dá para empurrar estoque
 *  para a loja e quanto vai em cada caixinha. É o ponto do sistema onde
 *  adivinhar tem consequência física: escolher a variante errada põe o aro
 *  16 à venda no lugar do 18, e a peça sai da prateleira errada.
 *
 *  Os defeitos que este teste existe para impedir:
 *
 *   1. código duplicado na loja virar escolha arbitrária — "manda para o
 *      primeiro" divide estoque entre dois anúncios sem que ninguém tenha
 *      decidido isso;
 *   2. saldo sem identidade casar "pelo nome, por coincidência". Nome igual
 *      não é prova: a loja renomeia valores, e o mesmo texto pode ser outra
 *      caixinha;
 *   3. `variante_id` ausente ser tratado como zero, ou o id `0` ser tratado
 *      como ausente. São coisas diferentes: NULL é "não sei", 0 é um id;
 *   4. repartição pela metade empurrar assim mesmo — as caixinhas somadas
 *      dariam menos do que existe aqui, e a diferença sumiria da loja;
 *   5. saldo zero numa variação que a loja não tem mais virar bloqueio: não
 *      há peça nenhuma para endereçar errado;
 *   6. o mesmo aro chegando por dois caminhos (id e nome) virar acusação de
 *      conflito — é o caso NORMAL de todo código que já vendeu;
 *   7. a ordem das recusas mudar. Quem lê o relatório precisa ver primeiro
 *      o problema mais perigoso;
 *   8. `varianteId` perder o tipo que a loja mandou. A Nuvemshop compara id
 *      por identidade: "801" onde ela espera 801 não dá erro, ela só não
 *      encontra a variante e o estoque fica como estava — falha silenciosa;
 *   9. um alvo sair negativo.
 */
import assert from 'node:assert/strict';
import { resolverVariantes, IMPEDIMENTOS } from '../api/src/variantes.js';

/** Uma entrada de loja como `mapearSkus` monta. */
const loja = (variantes, produtos = [1]) => ({
  produtos: new Set(produtos),
  variantes: variantes.map((v) => ({
    varianteId: v.id, produtoId: v.produtoId ?? 1, nome: v.nome,
    estoque: v.estoque ?? 0, locais: v.locais ?? [],
  })),
});

const peca = (qtd, casa = qtd) => ({ sku: 'BR1234', qtd, casa });

/* 1 — dois anúncios com o mesmo código: não há como dividir. */
{
  const r = resolverVariantes(peca(5), loja([{ id: 10, nome: '16' }], [1, 2]), {
    saldoPorVariante: new Map([['10', 5]]),
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'duplicado', 'código duplicado deixou de ser recusado');
  assert.deepEqual(r.detalhe.produtos, ['1', '2']);
  assert.equal(r.explicacao, IMPEDIMENTOS.duplicado);
  console.log('  ok   código em dois anúncios recusa em vez de escolher um');
}

/* Peça fora de casa e sem identidade: recusa, dizendo quanto falta. */
{
  const r = resolverVariantes(peca(10, 6), loja([{ id: 10, nome: '16' }]), {
    saldoPorVariante: new Map([['10', 6]]),
    consignadoPorVariacao: new Map([['16', 1]]),
  });
  assert.equal(r.motivo, 'maleta');
  assert.equal(r.detalhe.consignado, 4);
  assert.equal(r.detalhe.identificado, 1);
  assert.equal(r.detalhe.faltaIdentificar, 3, 'a recusa deixou de dizer quanto falta identificar');

  /* Tudo identificado: a maleta para de bloquear. */
  const ok = resolverVariantes(peca(10, 6), loja([{ id: 10, nome: '16' }]), {
    saldoPorVariante: new Map([['10', 10]]),
    consignadoPorVariacao: new Map([['16', 4]]),
  });
  assert.equal(ok.ok, true, 'maleta inteiramente identificada continuou bloqueando');
  console.log('  ok   maleta sem identidade recusa e diz quanto falta; identificada libera');
}

/* 3 — NULL é "não sei"; 0 é um id. */
{
  for (const ausente of [null, undefined, '']) {
    const r = resolverVariantes(peca(2), loja([{ id: 10, nome: '16' }, { id: ausente, nome: '18' }]), {
      saldoPorVariante: new Map([['10', 2]]),
    });
    assert.equal(r.motivo, 'sem_variante_id',
      `variante com id ${JSON.stringify(ausente)} deixou de bloquear`);
  }

  /* O id 0 NÃO é ausente: ele identifica uma caixinha e tem de casar. */
  const zero = resolverVariantes(peca(2), loja([{ id: 0, nome: '16' }]), {
    saldoPorVariante: new Map([['0', 2]]),
  });
  assert.equal(zero.ok, true, 'o id 0 foi confundido com ausente');
  assert.equal(zero.alvos[0].varianteId, 0);
  assert.equal(zero.alvos[0].para, 2);
  console.log('  ok   id ausente bloqueia; o id 0 é um id, não uma ausência');
}

/* 2 — nome sem id persistido não casa por coincidência. */
{
  const r = resolverVariantes(peca(3), loja([{ id: 10, nome: '16' }]), {
    saldoPorNome: new Map([['16', 3]]),
    persistido: new Map(),   // ninguém persistiu o id deste nome
  });
  assert.equal(r.motivo, 'variacao_nao_mapeada',
    'saldo casou pelo NOME sem id persistido — nome igual não é prova de mesma caixinha');
  assert.deepEqual(r.detalhe.variacoes, [{ chave: '16', saldo: 3, por: 'nome', idPersistido: null }]);

  /* Com o id persistido, o mesmo nome casa. */
  const ok = resolverVariantes(peca(3), loja([{ id: 10, nome: '16' }]), {
    saldoPorNome: new Map([['16', 3]]),
    persistido: new Map([['16', 10]]),
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.alvos[0].para, 3);
  console.log('  ok   nome só casa com o id que a sincronização persistiu');
}

/* Id persistido que não existe mais na loja também não casa. */
{
  const r = resolverVariantes(peca(3), loja([{ id: 10, nome: '16' }]), {
    saldoPorNome: new Map([['18', 3]]),
    persistido: new Map([['18', 99]]),
  });
  assert.equal(r.motivo, 'variacao_nao_mapeada');
  assert.equal(r.detalhe.variacoes[0].idPersistido, '99');
  console.log('  ok   id persistido que sumiu da loja não vira casamento');
}

/* 5 — saldo zero em variação que a loja não tem mais não bloqueia. */
{
  const r = resolverVariantes(peca(4), loja([{ id: 10, nome: '16' }]), {
    saldoPorVariante: new Map([['10', 4], ['99', 0]]),
    saldoPorNome: new Map([['aro antigo', 0]]),
  });
  assert.equal(r.ok, true, 'saldo zero numa variação extinta passou a bloquear');
  assert.equal(r.alvos[0].para, 4);
  console.log('  ok   saldo zero em variação extinta não bloqueia — não há peça para errar');
}

/* 6 — id e nome apontando para a mesma caixinha SOMAM. */
{
  const r = resolverVariantes(peca(5), loja([{ id: 10, nome: '16' }]), {
    saldoPorVariante: new Map([['10', 3]]),
    saldoPorNome: new Map([['16', 2]]),
    persistido: new Map([['16', 10]]),
  });
  assert.equal(r.ok, true, 'o mesmo aro por dois caminhos virou conflito');
  assert.equal(r.alvos[0].para, 5, 'os dois baldes da mesma caixinha deixaram de somar');
  console.log('  ok   id e nome da mesma caixinha somam, não brigam');
}

/* 4 — repartição pela metade não empurra. */
{
  const r = resolverVariantes(peca(10), loja([{ id: 10, nome: '16' }]), {
    saldoPorVariante: new Map([['10', 6]]),
  });
  assert.equal(r.motivo, 'sem_reparticao');
  assert.deepEqual({ ...r.detalhe }, { total: 10, atribuido: 6 });

  /* Nem sobra: atribuir MAIS do que existe também não passa. */
  const demais = resolverVariantes(peca(4), loja([{ id: 10, nome: '16' }]), {
    saldoPorVariante: new Map([['10', 6]]),
  });
  assert.equal(demais.motivo, 'sem_reparticao', 'atribuir mais do que existe passou');

  /* Código sem nenhuma peça não empurra: não há o que dizer à loja. */
  const vazio = resolverVariantes(peca(0), loja([{ id: 10, nome: '16' }]), {});
  assert.equal(vazio.motivo, 'sem_reparticao');
  console.log('  ok   repartição incompleta, excedente ou zerada não empurra nada');
}

/* 7 — a ordem das recusas: o mais perigoso primeiro. */
{
  /* Aqui cabem as duas: há variação não mapeada E a soma não fecha. */
  const r = resolverVariantes(peca(10), loja([{ id: 10, nome: '16' }]), {
    saldoPorVariante: new Map([['10', 4], ['99', 2]]),
  });
  assert.equal(r.motivo, 'variacao_nao_mapeada',
    'a recusa genérica passou na frente da específica — quem lê o relatório perde o caso perigoso');
  console.log('  ok   variação não mapeada vem antes de "falta repartir"');
}

/* 8 e 9 — o alvo que vai para a Nuvemshop. */
{
  const r = resolverVariantes(peca(7), loja([{ id: 801, nome: '16', estoque: 2, locais: ['L1'] },
                                             { id: 802, nome: '18', estoque: 9 }]), {
    saldoPorVariante: new Map([['801', 7], ['802', 0]]),
  });
  assert.equal(r.ok, true);
  assert.equal(typeof r.alvos[0].varianteId, 'number',
    'o varianteId perdeu o tipo da loja — a Nuvemshop compara id por identidade e não acharia a variante');
  assert.deepEqual(r.alvos.map((a) => [a.varianteId, a.de, a.para]), [[801, 2, 7], [802, 9, 0]]);
  assert.deepEqual(r.alvos[0].locais, ['L1'], 'os locais de estoque sumiram do alvo');
  assert.equal(r.alvos[1].nome, '18');

  /* Nenhum alvo negativo, mesmo com saldo local negativo. */
  const negativo = resolverVariantes({ sku: 'X', qtd: -2, casa: -2 },
    loja([{ id: 801, nome: '16' }]), { saldoPorVariante: new Map([['801', -2]]) });
  assert.equal(negativo.ok, false, 'total negativo passou a empurrar');
  console.log('  ok   o alvo mantém o tipo do id da loja, traz de/para e nunca sai negativo');
}

/* Toda recusa vem com a explicação em português — a tela mostra isso. */
{
  for (const motivo of Object.keys(IMPEDIMENTOS)) {
    assert.equal(typeof IMPEDIMENTOS[motivo], 'string');
    assert.ok(IMPEDIMENTOS[motivo].length > 20, `${motivo}: explicação vazia demais para a tela`);
  }
  assert.deepEqual(Object.keys(IMPEDIMENTOS).sort(),
    ['duplicado', 'maleta', 'sem_reparticao', 'sem_variante_id', 'variacao_nao_mapeada'],
    'a lista de impedimentos mudou — cada um é uma coisa que o sistema decidiu não fazer');
  console.log('  ok   os cinco impedimentos, cada um com a explicação que a tela mostra');
}

console.log('Resolução de variação: ok');
