#!/usr/bin/env node
/**
 * PreToolUse (Bash) — proteção proporcional ao risco.
 *
 * A governança é production-first: deploy, push, migration, secret e
 * rollback são Classe C e podem ser executados por agentes depois dos gates
 * de docs/SECURITY.md. Este hook não cria um botão humano para Classe C.
 * Ele intervém somente em Classe D (destruição extraordinária) ou quando não
 * consegue inspecionar o alvo/conteúdo com segurança.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function decidir(decisao, motivo) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decisao,
      permissionDecisionReason: motivo,
    },
  }));
  process.exit(0);
}

const perguntar = (motivo) => decidir('ask', motivo);
const negar = (motivo) => decidir('deny', motivo);

function semHeredoc(cmd) {
  return cmd.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm, ' <<HEREDOC ');
}

function semEnvelope(cmd) {
  let atual = cmd;
  for (let i = 0; i < 5; i += 1) {
    const anterior = atual;
    atual = atual
      .replace(/\b(?:ba|z|da|k)?sh\s+-[a-z]*c\s+(['"])([\s\S]*?)\1/g, ' ; $2 ; ')
      .replace(/\beval\s+(['"])([\s\S]*?)\1/g, ' ; $2 ; ');
    if (atual === anterior) break;
  }
  return atual;
}

function segmentos(cmd) {
  return cmd
    .split(/\n|;|\|\||&&|(?<!\d)[|&](?!\d)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      const partes = seg.split(/\s+/).filter((t) => !/^\w+=/.test(t));
      let i = 0;
      while (i < partes.length
        && (/^(sudo|env|npx|pnpm|yarn|bunx|time|timeout|nohup|stdbuf|command|xargs|nice)$/.test(partes[i])
          || (i > 0 && /^(-|\d+[smhd]?)$/.test(partes[i])))) i += 1;
      return [(partes[i] ?? '').replace(/^.*[\\/]/, ''), seg];
    });
}

function limparSql(sql) {
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''");
}

function arquivosSql(seg) {
  const achados = [];
  const re = /--file(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s;&|]+))/g;
  let m = re.exec(seg);
  while (m) {
    achados.push(m[1] ?? m[2] ?? m[3] ?? '');
    m = re.exec(seg);
  }
  return achados;
}

function comandosInline(seg) {
  const achados = [];
  const re = /--command(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s;&|]+))/g;
  let m = re.exec(seg);
  while (m) {
    achados.push(m[1] ?? m[2] ?? m[3] ?? '');
    m = re.exec(seg);
  }
  return achados;
}

function exigirClasseD(sql, origem) {
  const limpo = limparSql(sql);
  if (/\bdrop\s+(table|database|index|view|trigger)\b|\bdrop\s+column\b|\btruncate\b/i.test(limpo)) {
    perguntar(`${origem} contém remoção estrutural. É Classe D: exige instrução humana explícita para este alvo.`);
  }
  if (/\b(delete\s+from|update\s+[`"[\]\w.]+\s+set)\b/i.test(limpo) && !/\bwhere\b/i.test(limpo)) {
    perguntar(`${origem} contém DELETE/UPDATE em massa sem WHERE verificável. É Classe D.`);
  }
}

function conferirArquivo(bruto, base, raiz) {
  const abs = path.resolve(base, bruto);
  const relativo = path.relative(raiz, abs);
  if (relativo.startsWith('..') || path.isAbsolute(relativo)) {
    perguntar(`O SQL ${bruto} está fora do repositório. Confirme explicitamente esse artefato antes de executar.`);
  }
  try {
    exigirClasseD(readFileSync(abs, 'utf8'), `O arquivo ${bruto}`);
  } catch {
    perguntar(`Não foi possível ler ${bruto} para classificar o SQL antes da execução.`);
  }
}

let entrada = {};
try { entrada = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const comando = entrada?.tool_input?.command || entrada?.tool_input?.cmd || '';
if (!comando) process.exit(0);

const raiz = process.cwd();
let base = raiz;
for (const [nome, seg] of segmentos(semEnvelope(semHeredoc(comando)))) {
  if (nome === 'cd') {
    const alvo = seg.replace(/^cd\s+/, '').trim().replace(/^['"]|['"]$/g, '');
    if (alvo) base = path.resolve(base, alvo);
    continue;
  }

  if (/^(cat|type|less|more|head|tail|bat|strings|cp|open)$/.test(nome)
      && /(\.dev\.vars(?!\.example)|(^|[\s/])\.env(\.(?!example)\S*)?(\s|$)|backups[\\/]|seed\.sql)/i.test(seg)) {
    negar('Segredo ou dado real não entra no contexto do agente. Use somente nomes, metadados e contagens seguras.');
  }

  if (nome === 'git') {
    if (/\bpush\b.*(--force\b|--force-with-lease\b|(^|\s)-f(\s|$))/i.test(seg)
        || /\breset\s+--hard\b|\bclean\s+-[a-z]*f|\b(filter-branch|filter-repo)\b|\breflog\s+expire\b|\bgc\s+--prune=now\b/i.test(seg)) {
      perguntar('Operação Git destrutiva/reescrita de histórico é Classe D e exige instrução humana explícita.');
    }
  }

  if (nome === 'wrangler') {
    if (/\b(d1\s+delete|delete\s+marquesa-api|r2\s+(?:object|bucket)\s+delete)\b/i.test(seg)) {
      perguntar('Exclusão de recurso ou dado Cloudflare é Classe D e exige instrução humana explícita.');
    }
    if (/\bd1\s+(?:execute|migrations)\b/i.test(seg)) {
      for (const arquivo of arquivosSql(seg)) conferirArquivo(arquivo, base, raiz);
      for (const sql of comandosInline(seg)) exigirClasseD(sql, 'O SQL inline');
    }
  }

  if (nome === 'curl' && /forcar["'\s]*:\s*true/i.test(seg)
      && !/localhost|127\.0\.0\.1|staging/i.test(seg)) {
    perguntar('Sincronização forçada contra a loja real é Classe D sem uma solicitação explícita para esse efeito.');
  }
}

process.exit(0);
