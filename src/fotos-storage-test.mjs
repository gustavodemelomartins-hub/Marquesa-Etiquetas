/** go-live 2026-08-22 — a conta Cloudflare de produção responde erro 10042
 *  (R2 não habilitado). `env.FOTOS` virou opcional em `fotos-storage.js` —
 *  este teste prova os dois caminhos, com e sem o binding, sem precisar do
 *  Worker nem de rede: importa o módulo direto, como `sku-gerador-test.mjs`
 *  importa `api/src/sku.js`.
 *
 *  O que precisa ficar provado:
 *   1. com `env.FOTOS` presente, o comportamento de sempre não muda;
 *   2. sem `env.FOTOS`, `salvarFoto` recusa com mensagem clara — nunca
 *      lança `TypeError`, nunca finge que gravou;
 *   3. sem `env.FOTOS`, `lerFoto` devolve `null` — a mesma resposta de
 *      "não encontrada" que a chave errada já dá, então a rota que serve a
 *      imagem responde 404 controlado, nunca 500;
 *   4. sem `env.FOTOS`, `apagarFoto` não lança — apagar o que não existe
 *      continua sendo o estado final desejado, com ou sem bucket;
 *   5. `env.FOTOS` ausente é tratado igual a `env.FOTOS` indefinido —
 *      nenhuma das três funções olha para outra coisa além da presença dele.
 */
import { salvarFoto, lerFoto, apagarFoto, validarBytes, chaveFoto } from '../api/src/fotos-storage.js';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const bytesFake = new TextEncoder().encode('fake-jpeg-bytes').buffer;
const TIPO = 'image/jpeg';

/* Bucket de mentira: só o suficiente para provar que, QUANDO o binding
   existe, o caminho de sempre continua chamando `put`/`get`/`delete`. */
function bucketFalso() {
  const objetos = new Map();
  return {
    chamadas: { put: 0, get: 0, delete: 0 },
    async put(key, bytes, opts) {
      this.chamadas.put++;
      objetos.set(key, { body: bytes, httpMetadata: opts?.httpMetadata, size: bytes.byteLength });
    },
    async get(key) {
      this.chamadas.get++;
      return objetos.get(key) || null;
    },
    async delete(key) {
      this.chamadas.delete++;
      objetos.delete(key);
    },
  };
}

console.log('\n=== 1. COM binding: comportamento de sempre, sem mudança ===');
{
  const FOTOS = bucketFalso();
  const env = { FOTOS };
  const gravado = await salvarFoto(env, 'ABC123', 'original', bytesFake, TIPO);
  eq('grava sem erro', !!gravado.erro, 'false');
  eq('a chave é determinística por sku/versão', gravado.key, chaveFoto('ABC123', 'original'));
  eq('o bucket recebeu o put', FOTOS.chamadas.put, 1);

  const lido = await lerFoto(env, gravado.key);
  eq('lê de volta os mesmos bytes', !!lido, 'true');
  eq('com o content-type certo', lido.tipo, TIPO);
  eq('o bucket recebeu o get', FOTOS.chamadas.get, 1);

  await apagarFoto(env, gravado.key);
  eq('o bucket recebeu o delete', FOTOS.chamadas.delete, 1);
  const depois = await lerFoto(env, gravado.key);
  eq('depois de apagar, não encontra mais', depois, null);
}

console.log('\n=== 2. SEM binding: salvarFoto recusa, nunca lança nem finge sucesso ===');
{
  const env = {}; // env.FOTOS ausente — conta sem R2 habilitado (erro 10042)
  let lancou = false;
  let gravado;
  try {
    gravado = await salvarFoto(env, 'ABC123', 'original', bytesFake, TIPO);
  } catch {
    lancou = true;
  }
  eq('nunca lança TypeError', lancou, 'false');
  eq('devolve erro controlado, não sucesso', !!gravado.erro, 'true');
  eq('não devolve chave nenhuma', gravado.key, undefined);
  eq('a mensagem explica R2, não expõe stack', /R2/.test(gravado.erro), 'true');
}

console.log('\n=== 3. SEM binding: lerFoto devolve null, igual a "não encontrada" ===');
{
  const env = {};
  let lancou = false;
  let lido;
  try {
    lido = await lerFoto(env, chaveFoto('ABC123', 'original'));
  } catch {
    lancou = true;
  }
  eq('nunca lança', lancou, 'false');
  eq('null — a mesma resposta de chave inexistente', lido, null);
  eq('env.FOTOS ausente (undefined) se comporta igual a null', await lerFoto({ FOTOS: null }, 'x'), null);
}

console.log('\n=== 4. SEM binding: apagarFoto não lança — apagar o que não existe não é erro ===');
{
  const env = {};
  let lancou = false;
  try {
    await apagarFoto(env, chaveFoto('ABC123', 'original'));
  } catch {
    lancou = true;
  }
  eq('nunca lança', lancou, 'false');
}

console.log('\n=== 5. validação de bytes continua igual, com ou sem binding ===');
{
  eq('bytes vazios são recusados antes de olhar o binding',
    validarBytes(new ArrayBuffer(0), TIPO), 'Arquivo vazio.');
  eq('tipo inválido é recusado antes de olhar o binding',
    validarBytes(bytesFake, 'application/pdf'), 'Formato não reconhecido — envie JPEG, PNG ou WebP.');
  const semBinding = await salvarFoto({}, 'X', 'original', new ArrayBuffer(0), TIPO);
  eq('sem binding E sem bytes: a validação vence, mensagem de bytes, não de R2',
    semBinding.erro, 'Arquivo vazio.');
}

console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
