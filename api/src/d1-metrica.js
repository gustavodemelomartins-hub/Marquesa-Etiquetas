/** MEDIR ANTES DE OTIMIZAR — quantas linhas cada requisição lê do D1.
 *
 *  A conta bateu no limite de leitura do D1 e a pergunta "quem está lendo"
 *  não tinha resposta: o painel da Cloudflare cobra por linha lida da conta
 *  inteira, sem separar por rota. Este módulo separa.
 *
 *  Como funciona: envolve o binding `env.DB` num objeto com a MESMA
 *  superfície (prepare/bind/first/all/run/raw/batch/exec) e soma o
 *  `meta.rows_read` que o próprio D1 devolve. Nada é estimado.
 *
 *  ─── por que é opt-in, e desligado por padrão
 *
 *  Para somar a leitura de um `.first()` é preciso pedir `.all()` no lugar
 *  dele (o `.first()` do D1 não devolve `meta`). Isso não muda o custo da
 *  consulta — o SQL é o mesmo, e o motor lê as mesmas linhas — mas traz
 *  todas para a memória do Worker em vez de uma. Numa consulta que devolve
 *  muitas linhas isso é desperdício, então não é o que roda em produção.
 *
 *  Ligar: `D1_METRICAS = "true"` nas vars do ambiente (DEV), ou o cabeçalho
 *  `X-D1-Metricas: 1` numa requisição avulsa. Ausente = desligado, e o
 *  Worker devolve o binding original sem envolver nada — custo zero.
 *
 *  A resposta ganha:
 *      X-D1-Rows-Read     total de linhas lidas na requisição
 *      X-D1-Rows-Written  total de linhas escritas
 *      X-D1-Queries       quantas consultas foram
 *      X-D1-Top           as três consultas mais caras, resumidas
 */

const REAL = Symbol('d1-real');

/** Um SQL longo não cabe num cabeçalho HTTP nem ajuda a ler o relatório.
 *  O resumo mantém o começo, que é onde está o FROM que importa. */
function resumirSql(sql) {
  return String(sql ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function criarContador({ leve = false } = {}) {
  return { consultas: [], lidas: 0, escritas: 0, leve };
}

function registrar(contador, sql, meta) {
  const lidas = Number(meta?.rows_read ?? 0);
  const escritas = Number(meta?.rows_written ?? 0);
  contador.lidas += lidas;
  contador.escritas += escritas;
  contador.consultas.push({ sql: resumirSql(sql), lidas, escritas });
}

function envolverStmt(stmt, sql, contador) {
  const envolvido = {
    [REAL]: stmt,
    bind(...args) { return envolverStmt(stmt.bind(...args), sql, contador); },
    async all(...args) {
      const r = await stmt.all(...args);
      registrar(contador, sql, r?.meta);
      return r;
    },
    /* `.first()` vira `.all()` só para o `meta` existir. Mesmo SQL, mesmas
       linhas lidas — o que muda é quantas voltam para a memória, e isso é
       o preço declarado de estar medindo. */
    async first(coluna) {
      /* Modo leve (a vigia de toda requisição): conta a consulta e NÃO
         troca o `.first()` por `.all()` — custo zero de memória, e a
         leitura dessa consulta fica desconhecida em vez de estimada. */
      if (contador.leve) {
        const linha = coluna === undefined ? await stmt.first() : await stmt.first(coluna);
        contador.consultas.push({ sql: resumirSql(sql), lidas: null, escritas: 0 });
        return linha;
      }
      const r = await stmt.all();
      registrar(contador, sql, r?.meta);
      const linha = (r?.results ?? [])[0] ?? null;
      if (coluna === undefined) return linha;
      return linha == null ? null : linha[coluna];
    },
    async run(...args) {
      const r = await stmt.run(...args);
      registrar(contador, sql, r?.meta);
      return r;
    },
    async raw(...args) {
      const r = await stmt.raw(...args);
      /* `.raw()` não devolve meta. A consulta é contada para o total de
         consultas não mentir, com leitura desconhecida em vez de zero. */
      contador.consultas.push({ sql: resumirSql(sql), lidas: null, escritas: 0 });
      return r;
    },
  };
  return envolvido;
}

/** Devolve `env.DB` envolvido, ou ele mesmo quando a medição está desligada. */
export function medirD1(db, contador) {
  if (!contador) return db;
  const sqlDe = new WeakMap();
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      sqlDe.set(stmt, sql);
      return envolverStmt(stmt, sql, contador);
    },
    async batch(stmts) {
      /* O D1 exige os statements DELE no batch — os envolvidos não servem.
         Desembrulha antes de mandar, e soma o meta de cada resultado. */
      const reais = (stmts ?? []).map((s) => (s && s[REAL]) || s);
      const rs = await db.batch(reais);
      for (const r of rs ?? []) registrar(contador, 'batch', r?.meta);
      return rs;
    },
    async exec(sql) {
      const r = await db.exec(sql);
      contador.consultas.push({ sql: resumirSql(sql), lidas: null, escritas: 0 });
      return r;
    },
    withSession: db.withSession ? (...a) => db.withSession(...a) : undefined,
  };
}

/** Escreve o resultado nos cabeçalhos da resposta pronta. Não altera o
 *  corpo: nenhuma tela precisa mudar para a medição existir. */
export function carimbarMetrica(resposta, contador) {
  if (!contador || contador.leve) return resposta;
  const out = new Response(resposta.body, resposta);
  out.headers.set('X-D1-Rows-Read', String(contador.lidas));
  out.headers.set('X-D1-Rows-Written', String(contador.escritas));
  out.headers.set('X-D1-Queries', String(contador.consultas.length));
  const top = [...contador.consultas]
    .sort((a, b) => (b.lidas ?? 0) - (a.lidas ?? 0))
    .slice(0, 3)
    .map((c) => `${c.lidas ?? '?'}=${c.sql.slice(0, 60)}`)
    .join(' | ');
  out.headers.set('X-D1-Top', top.replace(/[^\x20-\x7E]/g, '.'));
  return out;
}

/** A VIGIA DE TODA REQUISIÇÃO (08/10/2026, §60).
 *
 *  A cota diária de leitura do D1 acabou em 06/10/2026 no meio do
 *  inventário, e o Balanço do inventário fazia 886 consultas numa
 *  requisição só — o plano Free recusa a invocação que passa de 50. Nenhum
 *  dos dois aparecia em lugar nenhum até a tela cair.
 *
 *  Toda requisição passa pelo contador leve: ele conta as consultas e soma
 *  o `rows_read` que o D1 já devolve em `.all()`, `.run()` e `batch` (o
 *  `.first()` não traz, e não é forçado a trazer). A requisição pesada vira
 *  UMA linha de log estruturada — rota, método, consultas, linhas lidas
 *  conhecidas, duração. Sem corpo, sem query string, sem dado pessoal. Com
 *  o Workers Logs ligado (`[observability]` no wrangler.toml), a linha fica
 *  guardada e pesquisável por `evento`.
 *
 *  Limites: 35 consultas (70% das 50 do plano Free), 20.000 linhas lidas
 *  conhecidas, 5 s. */
export const ALERTA_D1 = { consultas: 35, linhas: 20000, ms: 5000 };

export function vigiarRequisicao(contador, { metodo, path, ms, status }, saida = console) {
  if (!contador) return null;
  const consultas = contador.consultas.length;
  const pesada = consultas >= ALERTA_D1.consultas || contador.lidas >= ALERTA_D1.linhas || ms >= ALERTA_D1.ms;
  if (!pesada) return null;
  const registro = {
    evento: 'd1-requisicao-pesada', metodo, caminho: path, status,
    consultas, linhasLidasConhecidas: contador.lidas, ms,
  };
  saida.warn(JSON.stringify(registro));
  return registro;
}

/** Ligada? A variável de ambiente vale para o ambiente inteiro; o cabeçalho
 *  liga uma requisição só, para medir sem religar nada. */
export function metricasLigadas(request, env) {
  if (String(env?.D1_METRICAS ?? '') === 'true') return true;
  return request?.headers?.get('X-D1-Metricas') === '1';
}
