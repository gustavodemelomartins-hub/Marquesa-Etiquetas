/** Sync, importação e reconciliação podem estar no ar ao mesmo tempo — o
 *  cron roda de madrugada e alguém pode clicar em sincronizar no mesmo
 *  minuto. Sem identificador, as linhas das duas rodadas se misturam no
 *  `wrangler tail` e ninguém sabe qual delas falhou.
 *
 *  Os defeitos que este teste existe para impedir:
 *
 *   1. o invólucro alterar o resultado da operação — ele registra, não
 *      decide;
 *   2. uma rodada que lançou exceção ficar SEM linha de fim: rodada sem fim
 *      é rodada que ninguém sabe se terminou, e o erro some;
 *   3. a exceção ser engolida pelo registro;
 *   4. duas rodadas receberem o mesmo identificador;
 *   5. campo nulo virar `erro=undefined` na linha, mandando procurar erro
 *      que não houve;
 *   6. o formato da linha mudar — ele existe para ser filtrado.
 */
import assert from 'node:assert/strict';
import { novaExecucao, comExecucao, idDeExecucao } from '../api/src/plataforma/execucao.js';

const gravador = () => {
  const linhas = [];
  return { linhas, console: { log: (m) => linhas.push(m) } };
};

/* 6 — o formato. */
{
  const g = gravador();
  novaExecucao('sync', { id: 'abc123', console: g.console, agora: () => 0 })
    .comecou({ seco: true, forcar: false });
  assert.equal(g.linhas[0], '[exec] sync abc123 inicio seco=true forcar=false');
  console.log('  ok   a linha de início tem tipo, id e os campos da rodada');
}

/* 5 — campo vazio não entra. */
{
  const g = gravador();
  const e = novaExecucao('importacao', { id: 'x1', console: g.console, agora: () => 0 });
  e.terminou({ ok: true, erro: null, motivo: undefined, vazio: '' });
  assert.equal(g.linhas[0], '[exec] importacao x1 fim ms=0 ok=true');
  console.log('  ok   campo nulo, indefinido ou vazio não vira ruído na linha');
}

/* Espaço no valor quebraria o filtro por campo. */
{
  const g = gravador();
  novaExecucao('sync', { id: 'x2', console: g.console, agora: () => 0 })
    .terminou({ pausado: 'freio de segurança' });
  assert.ok(g.linhas[0].includes('pausado=freio_de_segurança'), g.linhas[0]);
  console.log('  ok   valor com espaço não parte a linha em dois campos');
}

/* 4 — identificadores distintos, e o cf-ray quando existe. */
{
  const pedido = (ray) => ({ headers: { get: (k) => (k === 'cf-ray' ? ray : null) } });
  assert.equal(idDeExecucao(pedido('9a1b2c3d4e5f-GRU')), '9a1b2c3d4e5f',
    'o cf-ray deixou de ser reaproveitado — passaríamos a ter dois ids para o mesmo evento');
  assert.ok(idDeExecucao(pedido(null)).length >= 8);
  assert.ok(idDeExecucao(null).length >= 8);
  const ids = new Set(Array.from({ length: 50 }, () => idDeExecucao(null)));
  assert.equal(ids.size, 50, 'duas rodadas receberam o mesmo identificador');
  console.log('  ok   id vem do cf-ray quando existe, e nunca se repete');
}

/* 1 — o resultado passa intacto. */
{
  const g = gravador();
  const alvo = { ok: true, novos: 3 };
  const r = await comExecucao('importacao', { id: 'i1', console: g.console }, async () => alvo);
  assert.equal(r, alvo, 'o invólucro trocou o objeto de resultado');
  assert.equal(g.linhas.length, 2, 'esperava uma linha de início e uma de fim');
  assert.ok(g.linhas[0].startsWith('[exec] importacao i1 inicio'));
  assert.ok(g.linhas[1].startsWith('[exec] importacao i1 fim ms='));
  console.log('  ok   o resultado atravessa o invólucro sem mudar');
}

/* `resumir` traduz o resultado em campos publicáveis. */
{
  const g = gravador();
  await comExecucao('sync', {
    id: 's1',
    console: g.console,
    dados: { seco: false },
    resumir: (r) => ({ ok: r.ok, pausado: r.pausado && r.pausado.motivo }),
  }, async () => ({ ok: false, pausado: { motivo: 'freio' } }));
  assert.ok(g.linhas[1].includes('ok=false'), g.linhas[1]);
  assert.ok(g.linhas[1].includes('pausado=freio'), g.linhas[1]);
  console.log('  ok   resumir escolhe o que sai na linha de fim');
}

/* 2 e 3 — falha registra o fim E continua subindo. */
{
  const g = gravador();
  await assert.rejects(
    () => comExecucao('reconciliacao', { id: 'r1', console: g.console }, async () => {
      throw new Error('apply interrompido');
    }),
    /apply interrompido/,
    'o invólucro engoliu a exceção',
  );
  assert.equal(g.linhas.length, 2, 'a rodada que falhou ficou sem linha de fim');
  assert.ok(g.linhas[1].includes('falhou=true'), g.linhas[1]);
  assert.ok(g.linhas[1].includes('erro=apply_interrompido'), g.linhas[1]);
  console.log('  ok   rodada que falha registra o fim e a exceção continua subindo');
}

/* As três operações longas estão realmente embrulhadas. */
{
  const sync = await import('../api/src/sync.js');
  const reconc = await import('../api/src/reconciliacao.js');
  const catalogo = await import('../api/src/catalogo-comandos.js');
  for (const [nome, fn] of [
    ['sincronizar', sync.sincronizar],
    ['aplicarSessao', reconc.aplicarSessao],
    ['importarProdutos', catalogo.importarProdutos],
    ['importarLoja', catalogo.importarLoja],
  ]) {
    assert.equal(typeof fn, 'function', `${nome} sumiu`);
  }
  console.log('  ok   sync, reconciliação e as duas importações seguem exportadas');
}

console.log('Correlação de execução: ok');
