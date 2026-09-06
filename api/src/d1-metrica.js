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

export function criarContador() {
  return { consultas: [], lidas: 0, escritas: 0 };
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
  if (!contador) return resposta;
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

/** Ligada? A variável de ambiente vale para o ambiente inteiro; o cabeçalho
 *  liga uma requisição só, para medir sem religar nada. */
export function metricasLigadas(request, env) {
  if (String(env?.D1_METRICAS ?? '') === 'true') return true;
  return request?.headers?.get('X-D1-Metricas') === '1';
}
