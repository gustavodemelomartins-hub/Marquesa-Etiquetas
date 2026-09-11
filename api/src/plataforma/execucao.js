/** Correlação de execução — Fase 3.
 *
 *  Sync, importação e reconciliação são operações longas, feitas de muitos
 *  passos, e duas podem estar no ar ao mesmo tempo: o cron roda de
 *  madrugada, e alguém pode clicar em sincronizar no mesmo minuto. Quando
 *  algo sai errado, as linhas no `wrangler tail` não dizem de QUAL rodada
 *  elas são.
 *
 *  Este módulo dá um identificador a cada rodada e o repete em toda linha
 *  dela. O formato é fixo para poder ser filtrado:
 *
 *      [exec] sync 9f3c1a2b inicio  seco=true forcar=false
 *      [exec] sync 9f3c1a2b fim     ms=1843 ok=true pausado=freio-de-seguranca
 *
 *  O que este módulo NÃO faz, de propósito:
 *
 *   - não grava nada no banco. Ligar o identificador a `sync_execucoes`
 *     exigiria coluna nova, e mudança de schema é proposta separada;
 *   - não entra em resposta de rota. Devolver o identificador ao painel é
 *     decisão de produto, não consequência de uma refatoração;
 *   - não imprime valor que o chamador não tenha passado. Quem chama decide
 *     o que é publicável — segredo e dado de cliente não entram aqui.
 */

/** O `cf-ray` é o identificador que a própria Cloudflare já usa para a
 *  requisição. Reaproveitá-lo faz a nossa linha de log cair no mesmo
 *  identificador que o painel da Cloudflare mostra, em vez de criar um
 *  segundo universo de ids para o mesmo evento. */
export function idDeExecucao(request) {
  const ray = request && request.headers && request.headers.get
    ? request.headers.get('cf-ray')
    : null;
  if (ray) return String(ray).split('-')[0].slice(0, 16);
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
}

/** `{a: 1, b: 'x'}` → `'a=1 b=x'`. Campo nulo ou indefinido não entra: uma
 *  linha com `erro=undefined` faz procurar erro que não houve. */
function campos(dados) {
  return Object.entries(dados || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${String(v).replace(/\s+/g, '_').slice(0, 120)}`)
    .join(' ');
}

/** Uma rodada. `tipo` é o assunto (`sync`, `importacao`, `reconciliacao`). */
export function novaExecucao(tipo, { id, console: saida = console, agora = () => Date.now() } = {}) {
  const identificador = id || idDeExecucao(null);
  const inicio = agora();
  const escrever = (evento, dados) => {
    const extra = campos(dados);
    saida.log(`[exec] ${tipo} ${identificador} ${evento}${extra ? ' ' + extra : ''}`);
  };
  return {
    id: identificador,
    tipo,
    decorrido: () => agora() - inicio,
    /** O início da rodada, com o que a decide — `seco`, `forcar`, quantos
     *  itens. É o que diz depois se a rodada era dry-run ou de verdade. */
    comecou(dados) { escrever('inicio', dados); return this; },
    /** Um passo intermediário. Use com parcimônia: log por item transforma
     *  uma importação de 700 peças em 700 linhas e esconde o resto. */
    passo(nome, dados) { escrever('passo:' + nome, dados); return this; },
    /** O fim, com o desfecho. Sempre chamado, inclusive quando falhou —
     *  rodada sem linha de fim é rodada que ninguém sabe se terminou. */
    terminou(dados) { escrever('fim', { ms: this.decorrido(), ...dados }); return this; },
  };
}

/** Envolve uma operação longa: registra início e fim, e garante a linha de
 *  fim mesmo quando a operação lança.
 *
 *  `resumir` traduz o resultado em campos publicáveis. Sem ele, o fim sai
 *  só com a duração — que já é mais do que existia antes.
 *
 *  A execução é devolvida ao `corpo` como segundo argumento para quem
 *  quiser registrar passos; quem não quiser, ignora. O valor de retorno é o
 *  do `corpo`, intacto: este invólucro não altera resultado nenhum. */
export async function comExecucao(tipo, { dados, resumir, id, console: saida } = {}, corpo) {
  const exec = novaExecucao(tipo, { id, console: saida });
  exec.comecou(dados);
  try {
    const resultado = await corpo(exec);
    exec.terminou(resumir ? resumir(resultado) : undefined);
    return resultado;
  } catch (e) {
    exec.terminou({ falhou: true, erro: (e && e.message) || String(e) });
    throw e;
  }
}
