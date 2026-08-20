/** Prova a metade do fluxo de fundo branco que os outros testes não cobrem.
 *
 *  `catalogo-test.mjs` (bloco 10) já prova a parte que importa em produção:
 *  com `FOTO_FUNDO_URL` indefinido — que é o estado real deste projeto até
 *  hoje — a peça fica `fundo_pendente` e nenhuma imagem é inventada.
 *
 *  Este arquivo prova a OUTRA metade: que o código funciona no dia em que
 *  alguém configurar o serviço de verdade. Ele nunca toca nada real — sobe
 *  um servidor HTTP de mentira só para esta chamada, direto neste processo
 *  Node, e chama `gerarFundoBranco` com um `env` também de mentira (D1 e R2
 *  simulados em memória, só aqui). `.dev.vars` nunca é tocado, então o
 *  Worker que os outros testes usam continua sem FOTO_FUNDO_URL configurado.
 */
const pixelOriginal = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const pixelTratado = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAAlSoWHAAAAC0lEQVR42mNkYPgPAAIBAQBl+DlGAAAAAElFTkSuQmCC';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

import http from 'node:http';

let chamadas = 0;
const servico = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', c => { corpo += c; });
  req.on('end', () => {
    chamadas++;
    const b = JSON.parse(corpo || '{}');
    if (!b.imagemBase64 || !b.sku) { res.writeHead(400); return res.end('faltou campo'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ imagemBase64: pixelTratado, tipo: 'image/png' }));
  });
});
await new Promise(r => servico.listen(0, '127.0.0.1', r));
const enderecoServico = `http://127.0.0.1:${servico.address().port}`;
console.log('serviço de mentira em ' + enderecoServico + ' — nunca a Cloudflare, nunca um serviço real');

const { gerarFundoBranco } = await import('../api/src/fotos.js');

/* D1 de mentira: só o suficiente para o que gerarFundoBranco realmente usa
   — um SELECT e dois UPDATEs, nenhum deles em lote. */
const produtos = new Map();
const objetos = new Map();
const db = {
  prepare(sql) {
    return {
      bind: (...args) => ({
        first: async () => (sql.includes('SELECT') ? (produtos.get(args[args.length - 1]) || null) : null),
        run: async () => {
          if (!sql.includes('UPDATE produtos')) return;
          const p = produtos.get(args[args.length - 1]) || {};
          if (sql.includes('foto_tratada_key')) {
            Object.assign(p, {
              foto_tratada_key: args[0], foto_tratada_tipo: args[1], foto_tratada_tam: args[2],
              foto_status: args[3], foto_erro: args[4],
            });
          } else {
            Object.assign(p, { foto_status: args[0], foto_erro: args[1] });
          }
          produtos.set(args[args.length - 1], p);
        },
      }),
    };
  },
};
/* R2 de mentira: mesma interface put/get do binding real. */
const env = {
  FOTO_FUNDO_URL: enderecoServico,
  FOTOS: {
    async put(key, bytes, opts) { objetos.set(key, { bytes, tipo: opts.httpMetadata.contentType }); },
    async get(key) {
      const o = objetos.get(key);
      if (!o) return null;
      return { body: new Response(o.bytes).body, httpMetadata: { contentType: o.tipo }, size: o.bytes.byteLength };
    },
  },
};

objetos.set('produtos/FB1/original', { bytes: Buffer.from(pixelOriginal, 'base64').buffer, tipo: 'image/png' });
produtos.set('FB1', {
  sku: 'FB1', desc: 'Peça FB1',
  foto_original_key: 'produtos/FB1/original', foto_original_tipo: 'image/png',
});

const r = await gerarFundoBranco(db, env, 'FB1');
eq('a chamada foi bem-sucedida', r.ok, 'true');
eq('o status virou "pronta"', r.status, 'fundo_gerado');
eq('o serviço de mentira foi chamado exatamente uma vez', chamadas, 1);

const salvo = objetos.get('produtos/FB1/tratada');
eq('a versão tratada foi gravada no armazenamento', !!salvo, 'true');
const bytesSalvos = Buffer.from(await new Response(salvo.bytes).arrayBuffer()).toString('base64');
eq('e são os bytes que o SERVIÇO devolveu, não a original de novo', bytesSalvos, pixelTratado);

console.log('\n=== erro do serviço vira estado de erro, sem inventar imagem ===');
const servicoRuim = http.createServer((req, res) => { req.resume(); res.writeHead(500); res.end(); });
await new Promise(r => servicoRuim.listen(0, '127.0.0.1', r));
const env2 = { ...env, FOTO_FUNDO_URL: `http://127.0.0.1:${servicoRuim.address().port}` };
produtos.set('FB1', {
  sku: 'FB1', desc: 'Peça FB1',
  foto_original_key: 'produtos/FB1/original', foto_original_tipo: 'image/png',
});
const r2 = await gerarFundoBranco(db, env2, 'FB1');
eq('a chamada falhou, e disse isso', r2.ok, 'false');
eq('o status virou "erro"', r2.status, 'erro');
eq('sem tratada nenhuma gravada por cima', produtos.get('FB1').foto_tratada_key, undefined);
servicoRuim.close();

servico.close();
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo certo — e nada disso tocou serviço real algum.\n');
process.exit(falhas ? 1 : 0);
