/** A configuração decide o que a API pode fazer, e o modo de falhar dela é
 *  o mais traiçoeiro do sistema: variável ausente não dá erro, dá silêncio.
 *  O Worker sobe, responde, e recusa tudo — ou pior, deixa de escrever na
 *  loja sem ninguém notar.
 *
 *  Os defeitos que este teste existe para impedir:
 *
 *   1. `NUVEMSHOP_WRITES_ENABLED` ficar generoso. Ausente TEM de significar
 *      bloqueado, e só a palavra exata `true` liga — "1", "yes" ou "TRUE"
 *      empurrariam estoque real para a loja por causa de um typo;
 *   2. o BOM que o `wrangler secret put` grava no Windows voltar a fazer um
 *      segredo correto parecer errado;
 *   3. a chave ausente no servidor virar passe livre em vez de 401;
 *   4. o CORS deixar de liberar geral sem lista, ou passar a ecoar uma
 *      origem estranha quando existe lista;
 *   5. o diagnóstico chamar de bloqueio o que é estado normal — R2 ausente e
 *      loja não configurada são avisos; DB e API_KEY são bloqueios;
 *   6. o log de configuração imprimir valor de segredo.
 */
import assert from 'node:assert/strict';
import {
  lerConfig, diagnosticar, bloqueios, registrarBloqueios,
} from '../api/src/plataforma/config.js';
import { checarChave, corsHeaders } from '../api/src/auth.js';

const BOM = '﻿';

const pedido = (cabecalhos = {}) => ({
  headers: { get: (k) => cabecalhos[k] ?? cabecalhos[k.toLowerCase()] ?? null },
});

/* 1 — a trava de escrita na loja. */
for (const valor of [undefined, '', 'false', '1', 'yes', 'on', 'TRUE', 'True', 'true ', ' true']) {
  const ligada = lerConfig({ NUVEMSHOP_WRITES_ENABLED: valor }).nuvemshop.escritaHabilitada;
  const esperado = String(valor || '').trim() === 'true';
  assert.equal(ligada, esperado,
    `NUVEMSHOP_WRITES_ENABLED=${JSON.stringify(valor)} passou a valer ${ligada}`);
}
assert.equal(lerConfig({}).nuvemshop.escritaHabilitada, false,
  'sem a variável, a escrita na loja tem de ficar BLOQUEADA');
console.log('  ok   escrita na Nuvemshop: ausente = bloqueada, só "true" liga');

/* 2 — o BOM do wrangler no Windows. */
{
  const comBom = BOM + 'segredo-de-verdade';
  assert.equal(lerConfig({ API_KEY: comBom }).api.chave, 'segredo-de-verdade');
  assert.equal(
    checarChave(pedido({ Authorization: 'Bearer segredo-de-verdade' }), { API_KEY: comBom }),
    true,
    'segredo gravado com BOM voltou a ser recusado — o sintoma parece "chave errada"',
  );
  console.log('  ok   BOM no segredo não faz a chave certa ser recusada');
}

/* 3 — fail-closed na porta. */
{
  const casos = [
    ['servidor sem chave, cliente sem chave', {}, {}],
    ['servidor sem chave, cliente com chave', {}, { Authorization: 'Bearer qualquer' }],
    ['servidor com chave, cliente sem chave', { API_KEY: 'k' }, {}],
    ['servidor com chave, cliente com a errada', { API_KEY: 'k' }, { Authorization: 'Bearer x' }],
    ['chave vazia dos dois lados', { API_KEY: '' }, { Authorization: 'Bearer ' }],
  ];
  for (const [nome, env, cab] of casos) {
    assert.equal(Boolean(checarChave(pedido(cab), env)), false, `passou quem não devia: ${nome}`);
  }
  assert.equal(checarChave(pedido({ Authorization: 'bearer  k ' }), { API_KEY: 'k' }), true,
    'a chave correta deixou de passar');
  console.log('  ok   sem chave no servidor nada passa; a chave correta continua passando');
}

/* 4 — CORS. */
{
  const semLista = corsHeaders(pedido({ Origin: 'https://qualquer.site' }), {});
  assert.equal(semLista['Access-Control-Allow-Origin'], '*');
  const env = { ORIGENS_PERMITIDAS: 'https://a.com, https://b.com' };
  assert.equal(
    corsHeaders(pedido({ Origin: 'https://b.com' }), env)['Access-Control-Allow-Origin'],
    'https://b.com', 'origem listada deixou de ser devolvida como ela mesma');
  assert.equal(
    corsHeaders(pedido({ Origin: 'https://intrusa.com' }), env)['Access-Control-Allow-Origin'],
    'https://a.com', 'origem não listada passou a receber "*" ou ela mesma');
  assert.equal(corsHeaders(pedido(), env).Vary, 'Origin');
  console.log('  ok   CORS: libera geral só sem lista; com lista, nunca ecoa origem estranha');
}

/* Normalizações que já existiam espalhadas e agora moram num lugar só. */
{
  const c = lerConfig({
    NUVEMSHOP_BASE: 'https://api.exemplo.com///',
    NUVEMSHOP_AUTH_BASE: 'https://auth.exemplo.com/',
    NUVEMSHOP_STORE_ID: '  123  ',
    ORIGENS_PERMITIDAS: ' https://a.com ,, https://b.com ,',
  });
  assert.equal(c.nuvemshop.base, 'https://api.exemplo.com');
  assert.equal(c.nuvemshop.authBase, 'https://auth.exemplo.com');
  assert.equal(c.nuvemshop.loja, '123');
  assert.deepEqual(c.cors.origensPermitidas, ['https://a.com', 'https://b.com']);
  const padrao = lerConfig({});
  assert.equal(padrao.nuvemshop.base, 'https://api.nuvemshop.com.br');
  assert.equal(padrao.nuvemshop.authBase, 'https://www.tiendanube.com');
  console.log('  ok   barra final, espaço, vírgula solta e valores padrão');
}

/* A configuração não pode ser alterada por quem a recebe. */
{
  const c = lerConfig({ API_KEY: 'k' });
  assert.throws(() => { c.api.chave = 'outra'; }, 'a configuração deixou de ser congelada');
  console.log('  ok   configuração congelada');
}

/* 5 — gravidade do diagnóstico. */
{
  const vazio = diagnosticar(lerConfig({}));
  const nomes = (lista, g) => lista.filter((x) => x.gravidade === g).map((x) => x.chave);
  assert.deepEqual(nomes(vazio, 'bloqueio').sort(), ['API_KEY', 'DB']);
  assert.ok(nomes(vazio, 'aviso').includes('FOTOS'), 'R2 ausente virou bloqueio — é estado normal');

  const completo = lerConfig({
    DB: {}, API_KEY: 'k', ORIGENS_PERMITIDAS: 'https://a.com', FOTOS: {},
    NUVEMSHOP_TOKEN: 't', NUVEMSHOP_STORE_ID: '1', NUVEMSHOP_WRITES_ENABLED: 'true',
    /* Fase 4.5: a segunda trava, específica de criar/atualizar/publicar
       produto na loja. "Completo" aqui significa toda capacidade ligada;
       no ambiente de verdade esta linha está deliberadamente ausente. */
    NUVEMSHOP_PUBLICACAO_ENABLED: 'true',
  });
  assert.equal(bloqueios(completo).length, 0, 'configuração completa acusou bloqueio');
  assert.equal(diagnosticar(completo).length, 0, 'configuração completa acusou aviso');

  /* E a trava nova, sozinha: escrita ligada e publicação desligada é o
     estado REAL de produção, e ele é aviso, nunca bloqueio. */
  const semPublicacao = lerConfig({
    DB: {}, API_KEY: 'k', ORIGENS_PERMITIDAS: 'https://a.com', FOTOS: {},
    NUVEMSHOP_TOKEN: 't', NUVEMSHOP_STORE_ID: '1', NUVEMSHOP_WRITES_ENABLED: 'true',
  });
  assert.equal(bloqueios(semPublicacao).length, 0, 'publicação desligada virou bloqueio');
  assert.ok(nomes(diagnosticar(semPublicacao), 'aviso').includes('NUVEMSHOP_PUBLICACAO_ENABLED'),
    'publicação desligada não aparece no diagnóstico');

  const semEscrita = lerConfig({
    DB: {}, API_KEY: 'k', ORIGENS_PERMITIDAS: 'https://a.com', FOTOS: {},
    NUVEMSHOP_TOKEN: 't', NUVEMSHOP_STORE_ID: '1',
  });
  /* As duas travas aparecem: a central e a de publicação. Elas são
     independentes de propósito — empurrar estoque para um produto que já
     existe e criar um produto na loja são atos de tamanhos diferentes. */
  assert.deepEqual(diagnosticar(semEscrita).map((x) => x.chave),
    ['NUVEMSHOP_WRITES_ENABLED', 'NUVEMSHOP_PUBLICACAO_ENABLED'],
    'a loja configurada sem escrita habilitada precisa aparecer no diagnóstico');
  console.log('  ok   bloqueio é DB e API_KEY; o resto é aviso');
}

/* 6 — o log conta o nome da variável, nunca o valor. */
{
  const linhas = [];
  const falso = { error: (...a) => linhas.push(a.join(' ')) };
  const quantos = registrarBloqueios(
    lerConfig({ NUVEMSHOP_TOKEN: 'segredo-que-nao-pode-vazar' }), { console: falso },
  );
  assert.equal(quantos, 2, 'os dois bloqueios deixaram de ser registrados');
  const tudo = linhas.join('\n');
  assert.ok(tudo.includes('API_KEY'), 'API_KEY sumiu do log');
  assert.ok(tudo.includes('DB'), 'DB sumiu do log');
  assert.ok(!tudo.includes('segredo-que-nao-pode-vazar'), 'o log passou a imprimir valor de segredo');
  assert.equal(registrarBloqueios(lerConfig({ DB: {}, API_KEY: 'k' }), { console: falso }), 0);
  console.log('  ok   o log nomeia a variável e o efeito, sem o valor');
}


/* Os adapters passaram a ler a configuração daqui em vez de `env`. O que
   eles DERIVAM dela — os endereços da loja e a trava de escrita — tem de
   continuar idêntico, senão a sincronização passa a falar com outro host
   sem ninguém ver. */
{
  const { Nuvemshop } = await import('../api/src/nuvemshop.js');

  const real = new Nuvemshop({ NUVEMSHOP_STORE_ID: ' 123 ', NUVEMSHOP_TOKEN: ' t ' });
  assert.equal(real.loja, '123');
  assert.equal(real.token, 't');
  assert.equal(real.base, 'https://api.nuvemshop.com.br/2025-03/123');
  assert.equal(real.basePedidos, 'https://api.nuvemshop.com.br/v1/123');
  assert.deepEqual(real.basesPedidos, [
    'https://api.nuvemshop.com.br/v1/123',
    'https://api.tiendanube.com/v1/123',
    'https://api.nuvemshop.com.br/2025-03/123',
  ], 'a lista de hosts de pedidos mudou — o fallback trocaria de endereço');
  assert.equal(real.configurada(), true);
  assert.equal(real.escritaHabilitada, false, 'sem a variável, a escrita tem de ficar desligada');

  /* A loja de mentira dos testes: com NUVEMSHOP_BASE definido, o fallback
     para os hosts oficiais NÃO existe — senão um teste local sairia
     falando com a Nuvemshop de verdade. */
  const falsa = new Nuvemshop({
    NUVEMSHOP_STORE_ID: '9', NUVEMSHOP_TOKEN: 't',
    NUVEMSHOP_BASE: 'http://localhost:9999///', NUVEMSHOP_WRITES_ENABLED: 'true',
  });
  assert.equal(falsa.base, 'http://localhost:9999/2025-03/9');
  assert.deepEqual(falsa.basesPedidos, ['http://localhost:9999/v1/9'],
    'a loja de mentira ganhou os hosts reais na lista de fallback');
  assert.equal(falsa.escritaHabilitada, true);

  assert.equal(new Nuvemshop({}).configurada(), false, 'cliente sem loja/token disse estar configurado');
  console.log('  ok   o cliente Nuvemshop deriva os mesmos endereços e a mesma trava');
}

console.log('Configuração da plataforma: ok');
