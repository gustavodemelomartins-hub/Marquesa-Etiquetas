// Gera os dados do painel visual do projeto a partir da documentação
// versionada. NÃO é uma segunda fonte de verdade: tudo aqui é lido de
// docs/project/*.md e do próprio Git. Se um número estiver errado na tela,
// o erro está no documento, e é lá que se corrige.
//
//   node scripts/build-project-dashboard.mjs          gera data.json
//   node scripts/build-project-dashboard.mjs --check   falha se data.json
//                                                      estiver desatualizado
//
// O --check é o que permite usar isto como gate: o painel publicado nunca
// diverge silenciosamente dos documentos que ele resume.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const arquivoProjeto = (...p) => join(raiz, 'docs', 'project', ...p);
const saida = arquivoProjeto('dashboard', 'data.json');

const ler = (caminho) => readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n');

// ── markdown: tabelas ────────────────────────────────────────────────────
// Uma linha de tabela vira um array de células já sem o pipe das pontas.
// Um `\|` dentro de uma célula é um pipe literal, não uma divisão — as
// linhas de rota (`.../analisar\|cadastrar`) dependem disso.
function celulas(linha) {
  return linha
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, '|').trim());
}

const ehSeparador = (linha) => /^\|[\s:|-]+\|$/.test(linha.trim());
const ehLinhaTabela = (linha) => linha.trim().startsWith('|');

// Extrai as linhas de dados de todas as tabelas dentro de uma seção `## Nome`.
function tabelaDaSecao(texto, titulo) {
  const linhas = texto.split('\n');
  const inicio = linhas.findIndex(
    (l) => l.trim().toLowerCase() === `## ${titulo}`.toLowerCase(),
  );
  if (inicio === -1) return [];

  const saidaLinhas = [];
  let cabecalhoVisto = false;
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (linha.startsWith('## ')) break;
    if (!ehLinhaTabela(linha)) continue;
    if (ehSeparador(linha)) {
      cabecalhoVisto = true;
      continue;
    }
    if (!cabecalhoVisto) continue; // é o cabeçalho da tabela
    saidaLinhas.push(celulas(linha));
  }
  return saidaLinhas;
}

// Markdown inline → texto puro. A tela mostra texto; link e ênfase viram
// o rótulo, não o código-fonte.
function texto(md) {
  return (md || '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── domínio: o prefixo do Task ID ────────────────────────────────────────
const DOMINIOS = {
  EST: 'Estoque',
  INV: 'Inventário',
  CAT: 'Catálogo',
  NUV: 'Nuvemshop',
  VEN: 'Vendas',
  CLI: 'Clientes',
  REV: 'Revendedoras',
  GAR: 'Garantias',
  FIN: 'Financeiro',
  MON: 'Monte seu Colar',
  SAI: 'Saídas sem faturamento',
  ETQ: 'Etiquetas',
  ARQ: 'Arquitetura',
  DOC: 'Documentação',
  DR: 'Decisão',
};
const dominioDe = (id) => DOMINIOS[String(id).split('-')[0]] || 'Outros';

// ── PROJECT-STATUS.md ────────────────────────────────────────────────────
const SECOES = [
  ['DONE', 'DONE'],
  ['IN PROGRESS', 'IN PROGRESS'],
  ['NEXT', 'NEXT'],
  ['BLOCKED', 'BLOCKED'],
  ['DECISIONS REQUIRED', 'DECISIONS REQUIRED'],
];

function lerStatus() {
  const md = ler(arquivoProjeto('PROJECT-STATUS.md'));
  const tarefas = [];
  for (const [titulo, estado] of SECOES) {
    for (const linha of tabelaDaSecao(md, titulo)) {
      const id = texto(linha[0]);
      if (!id) continue;
      tarefas.push({
        id,
        estado,
        dominio: dominioDe(id),
        titulo: texto(linha[1]),
        // A 3ª coluna muda de nome por seção (Evidência / Onde está /
        // Depende de / Bloqueado por / Trava o quê). O sentido é sempre
        // "o que sustenta ou impede esta linha".
        contexto: texto(linha[2]),
        nota: texto(linha[3]),
      });
    }
  }
  const atualizado = (md.match(/\*\*Atualizado em:\*\*\s*(\S+)/) || [])[1] || null;
  return { tarefas, atualizado };
}

// ── LEGACY-PARITY-AUDIT.md ───────────────────────────────────────────────
// A escada completa, na ordem em que uma funcionalidade a sobe.
const ESCADA = [
  'LEGACY ONLY',
  'MAPPED',
  'BACKEND READY',
  'UX DESIGNED',
  'IMPLEMENTED',
  'TESTED',
  'DEV',
  'APPROVED',
  'PROD',
  'LEGACY REMOVABLE',
];

// A célula de situação pode carregar qualificador ("`TESTED` (React) /
// `LEGACY ONLY` (produção real)"). O degrau que vale é o MENOR citado —
// uma funcionalidade não está mais adiante do que o seu pedaço mais atrasado.
function situacaoDe(celula) {
  const citados = [...String(celula).matchAll(/`([A-Z][A-Z ]+)`/g)]
    .map((m) => m[1].trim())
    .filter((s) => ESCADA.includes(s));
  if (citados.length === 0) return { degrau: null, ressalva: texto(celula) };
  const degrau = citados.reduce((menor, atual) =>
    ESCADA.indexOf(atual) < ESCADA.indexOf(menor) ? atual : menor,
  );
  const ressalva = texto(celula);
  return { degrau, ressalva: ressalva === degrau ? '' : ressalva };
}

function lerParidade() {
  const md = ler(arquivoProjeto('LEGACY-PARITY-AUDIT.md'));
  const itens = [];
  for (const linha of md.split('\n')) {
    if (!ehLinhaTabela(linha) || ehSeparador(linha)) continue;
    const c = celulas(linha);
    // Linha de matriz: 9 colunas, primeira é um Task ID de 3 letras.
    if (c.length < 9) continue;
    if (!/^[A-Z]{3}-\d+$/.test(texto(c[0]))) continue;
    const { degrau, ressalva } = situacaoDe(c[8]);
    itens.push({
      id: texto(c[0]),
      dominio: dominioDe(texto(c[0])),
      funcionalidade: texto(c[1]),
      legado: texto(c[2]),
      backend: texto(c[3]),
      ux: texto(c[4]),
      frontend: texto(c[5]),
      testado: texto(c[6]),
      producao: texto(c[7]),
      degrau,
      ressalva,
    });
  }
  const contagem = Object.fromEntries(ESCADA.map((d) => [d, 0]));
  for (const item of itens) if (item.degrau) contagem[item.degrau] += 1;
  return { itens, contagem, escada: ESCADA };
}

// ── worklogs ─────────────────────────────────────────────────────────────
// Cada entrada é um `## <data> — <título>` seguido de uma tabela de
// duas colunas (Branch / Commits / Status).
function lerWorklog(nome, agente) {
  const caminho = arquivoProjeto(nome);
  if (!existsSync(caminho)) return [];
  const md = ler(caminho);
  const entradas = [];
  const linhas = md.split('\n');
  for (let i = 0; i < linhas.length; i += 1) {
    // A data pode vir com um qualificador entre parênteses ("(tarde)"),
    // que faz parte de quando, não do título.
    const m = linhas[i].match(/^## (\d{4}-\d{2}-\d{2})\s*(\([^)]*\))?\s*[—-]\s*(.+)$/);
    if (!m) continue;
    const campos = {};
    let ids = [];
    for (let j = i + 1; j < linhas.length && !linhas[j].startsWith('## '); j += 1) {
      if (ehLinhaTabela(linhas[j]) && !ehSeparador(linhas[j])) {
        const c = celulas(linhas[j]);
        if (c.length === 2 && c[0]) campos[texto(c[0]).toLowerCase()] = texto(c[1]);
      }
      const idsLinha = linhas[j].match(/\*\*Task IDs tocados:\*\*([\s\S]{0,400})/);
      if (idsLinha) {
        const bloco = linhas.slice(j, j + 6).join(' ');
        ids = [...new Set((bloco.match(/`([A-Z]{3}-\d+)`/g) || []).map((s) => s.replace(/`/g, '')))];
      }
    }
    entradas.push({
      agente,
      data: m[1] + (m[2] ? ` ${m[2]}` : ''),
      titulo: texto(m[3]),
      branch: campos.branch || '',
      commits: campos.commits || campos.commit || '',
      status: campos.status || '',
      taskIds: ids,
    });
  }
  return entradas.sort((a, b) => b.data.localeCompare(a.data));
}

// ── Git ──────────────────────────────────────────────────────────────────
const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();

function lerGit() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const recentes = git(
    'log', '-25', '--date=short', '--format=%h%ad%an%s',
  )
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [commit, data, autor, assunto] = l.split('');
      // O agente não está no log (todo commit é do mesmo usuário Git). O
      // sinal verificável é o prefixo do merge/branch, como os worklogs
      // já documentam. Sem sinal, não se adivinha.
      let agente = '';
      if (/^merge\(v2\)/.test(assunto)) agente = 'Claude';
      else if (/^docs\(ux\)|^docs\(ui\)|^chore\(codex\)/.test(assunto)) agente = 'Codex';
      const ids = [...new Set((assunto.match(/\b[A-Z]{3}-\d{3}\b/g) || []))];
      return { commit, data, autor, assunto, agente, taskIds: ids };
    });
  return { branch, recentes };
}

// ── ambientes ────────────────────────────────────────────────────────────
// Lidos de api/wrangler.toml para que a tela nunca invente um endereço.
function lerAmbientes() {
  const toml = ler(join(raiz, 'api', 'wrangler.toml'));
  const bloco = (inicio, fim) => {
    const i = toml.indexOf(inicio);
    if (i === -1) return '';
    const j = fim ? toml.indexOf(fim, i) : -1;
    return toml.slice(i, j === -1 ? toml.length : j);
  };
  const prod = bloco('name = "marquesa-api"', '[env.staging]');
  const dev = bloco('[env.staging]');
  const pegar = (txt, chave) =>
    (txt.match(new RegExp(`${chave}\\s*=\\s*"([^"]*)"`)) || [])[1] || '';

  return [
    {
      nome: 'LOCAL',
      papel: 'Worker e D1 descartáveis na máquina; nenhuma escrita sai daqui',
      worker: 'wrangler dev (127.0.0.1:8787)',
      banco: 'SQLite local, recriado a cada rodada',
      frontend: 'vite dev / python -m http.server',
      escritaNuvemshop: 'desligada',
      congelado: false,
    },
    {
      nome: 'DEV',
      papel: 'Destino único da reconstrução V2',
      worker: 'https://marquesa-api-staging.marquesaasemijoias.workers.dev',
      banco: pegar(dev, 'database_name') || 'marquesa-db-dev',
      r2: pegar(dev, 'bucket_name') || 'marquesa-fotos-dev',
      frontend: 'https://marquesa-dev.pages.dev',
      escritaNuvemshop: pegar(dev, 'NUVEMSHOP_WRITES_ENABLED') === 'true' ? 'LIGADA' : 'desligada',
      personalizacao: pegar(dev, 'PERSONALIZACAO_ATIVA'),
      deploy: 'push em `develop` publica o Pages; o Worker só por botão manual',
      congelado: false,
    },
    {
      nome: 'PROD',
      papel: 'CONGELADA para a V2 — nada desta reconstrução chega aqui',
      worker: 'https://marquesa-api.marquesaasemijoias.workers.dev',
      banco: pegar(prod, 'database_name') || 'marquesa-db-prod',
      r2: 'não habilitado',
      frontend: 'GitHub Pages (painel legado)',
      escritaNuvemshop: pegar(prod, 'NUVEMSHOP_WRITES_ENABLED') === 'true' ? 'LIGADA' : 'desligada',
      deploy: 'nenhum caminho automático; só comando humano explícito',
      congelado: true,
    },
  ];
}

// ── montagem ─────────────────────────────────────────────────────────────
function montar() {
  const status = lerStatus();
  const paridade = lerParidade();
  const worklogs = [
    ...lerWorklog('WORKLOG-CLAUDE.md', 'Claude'),
    ...lerWorklog('WORKLOG-CODEX.md', 'Codex'),
  ].sort((a, b) => b.data.localeCompare(a.data));

  const porEstado = {};
  for (const [, estado] of SECOES) porEstado[estado] = 0;
  for (const t of status.tarefas) porEstado[t.estado] += 1;

  // Progresso: só o que já terminou, sobre o que está no radar. Decisões
  // pendentes não entram no denominador — elas não são trabalho, são espera.
  const trabalho = status.tarefas.filter((t) => t.estado !== 'DECISIONS REQUIRED');
  const progresso = trabalho.length
    ? Math.round((porEstado.DONE / trabalho.length) * 100)
    : 0;

  const dominios = {};
  for (const t of status.tarefas) {
    dominios[t.dominio] ??= { nome: t.dominio, tarefas: [], paridade: [], contagem: {} };
    dominios[t.dominio].tarefas.push(t);
    dominios[t.dominio].contagem[t.estado] = (dominios[t.dominio].contagem[t.estado] || 0) + 1;
  }
  for (const p of paridade.itens) {
    dominios[p.dominio] ??= { nome: p.dominio, tarefas: [], paridade: [], contagem: {} };
    dominios[p.dominio].paridade.push(p);
  }

  return {
    gerado: new Date().toISOString().slice(0, 10),
    fonte: 'docs/project/*.md + api/wrangler.toml + git log — nenhum dado digitado aqui',
    atualizadoEm: status.atualizado,
    git: lerGit(),
    visaoGeral: { progresso, porEstado, totalTarefas: status.tarefas.length },
    tarefas: status.tarefas,
    dominios: Object.values(dominios).sort((a, b) => a.nome.localeCompare(b.nome)),
    paridade,
    worklogs,
    ambientes: lerAmbientes(),
  };
}

const dados = montar();
const json = `${JSON.stringify(dados, null, 2)}\n`;

if (process.argv.includes('--check')) {
  // O campo `gerado` e o git log mudam sozinhos com o tempo; compará-los
  // faria o gate falhar por passagem do dia, não por divergência real.
  const normalizar = (t) => {
    const o = JSON.parse(t);
    delete o.gerado;
    delete o.git;
    return JSON.stringify(o);
  };
  if (!existsSync(saida)) {
    console.error('Painel do projeto: FALHA — data.json não existe. Rode sem --check.');
    process.exit(1);
  }
  if (normalizar(readFileSync(saida, 'utf8')) !== normalizar(json)) {
    console.error(
      'Painel do projeto: FALHA — data.json não corresponde aos documentos.\n' +
        'Rode `node scripts/build-project-dashboard.mjs` e commite o resultado.',
    );
    process.exit(1);
  }
  console.log(
    `Painel do projeto: ok — ${dados.tarefas.length} tarefas, ` +
      `${dados.paridade.itens.length} linhas de paridade, em dia com os documentos.`,
  );
} else {
  writeFileSync(saida, json);
  // A mesma coisa como script: `fetch` de um arquivo ao lado é bloqueado
  // quando a página é aberta por `file://`, e abrir a página direto do
  // disco é justamente o caso de uso. O .json fica para quem lê por máquina.
  writeFileSync(
    join(raiz, 'docs', 'project', 'dashboard', 'data.js'),
    `// Gerado por scripts/build-project-dashboard.mjs — não edite à mão.\nwindow.MARQUESA_V2 = ${json.trimEnd()};\n`,
  );
  console.log(
    `Painel do projeto: ${dados.tarefas.length} tarefas, ` +
      `${dados.paridade.itens.length} linhas de paridade, ` +
      `${dados.worklogs.length} entradas de worklog -> docs/project/dashboard/data.json`,
  );
}
