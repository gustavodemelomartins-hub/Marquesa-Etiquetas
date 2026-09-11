/* Painel da Marquesa V2. Lê `window.MARQUESA_V2` (gerado por
   scripts/build-project-dashboard.mjs) e desenha. Sem framework, sem rede,
   sem estado próprio — se os documentos mudarem, regere e recarregue. */

(function () {
  'use strict';

  const dados = window.MARQUESA_V2;
  const $ = (id) => document.getElementById(id);

  if (!dados) {
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<p style="padding:24px;font-family:monospace">data.js não carregou. ' +
        'Rode <b>node scripts/build-project-dashboard.mjs</b> na raiz do repositório.</p>',
    );
    return;
  }

  // Texto vindo do markdown nunca é interpolado como HTML.
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
    );

  const CLASSE_ESTADO = {
    DONE: 'done',
    'IN PROGRESS': 'progress',
    NEXT: 'next',
    BLOCKED: 'blocked',
    'DECISIONS REQUIRED': 'decisao',
  };
  const ROTULO_ESTADO = {
    DONE: 'Concluído',
    'IN PROGRESS': 'Em andamento',
    NEXT: 'A seguir',
    BLOCKED: 'Bloqueado',
    'DECISIONS REQUIRED': 'Decisão sua',
  };
  const ORDEM = ['DONE', 'IN PROGRESS', 'NEXT', 'BLOCKED', 'DECISIONS REQUIRED'];

  // ── carimbo ───────────────────────────────────────────────────────────
  $('carimbo').innerHTML =
    'Branch <b>' + esc(dados.git.branch) + '</b><br>' +
    'Documentos de <b>' + esc(dados.atualizadoEm || '—') + '</b><br>' +
    'Tela gerada em <b>' + esc(dados.gerado) + '</b>';

  $('rodape-fonte').textContent = 'Fonte: ' + dados.fonte;

  // ── frentes de trabalho (workstreams) ────────────────────────────────
  $('frentes').innerHTML = (dados.workstreams || [])
    .map((w) => {
      const linhas = Object.entries(w.campos)
        .map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>')
        .join('');
      return (
        '<div class="frente">' +
        '<div class="frente__nome">' + esc(w.agente) + '</div>' +
        '<p class="frente__papel">' + esc(w.frente) + '</p>' +
        '<dl class="frente__meta">' +
        '<dt>worktree</dt><dd>' + esc(w.worktree) + '</dd>' +
        '<dt>branch</dt><dd>' + esc(w.branch) + '</dd>' +
        '</dl>' +
        '<dl class="frente__campos">' + linhas + '</dl>' +
        '</div>'
      );
    })
    .join('');

  // ── ambientes ─────────────────────────────────────────────────────────
  $('ambientes').innerHTML = dados.ambientes
    .map((a) => {
      const campos = [
        ['worker', a.worker],
        ['banco', a.banco],
        ['r2', a.r2],
        ['frontend', a.frontend],
        ['nuvemshop', a.escritaNuvemshop],
        ['deploy', a.deploy],
      ].filter((p) => p[1]);
      return (
        '<div class="ambiente' + (a.congelado ? ' ambiente--congelado' : '') + '">' +
        '<div class="ambiente__nome">' + esc(a.nome) +
        (a.congelado ? '<span class="ambiente__selo">CONGELADA</span>' : '') +
        '</div>' +
        '<p class="ambiente__papel">' + esc(a.papel) + '</p>' +
        '<dl>' +
        campos
          .map((p) => '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>')
          .join('') +
        '</dl></div>'
      );
    })
    .join('');

  // ── visão geral ───────────────────────────────────────────────────────
  const vg = dados.visaoGeral;
  $('estados').innerHTML = ORDEM.map(
    (e) =>
      '<div class="estado estado--' + CLASSE_ESTADO[e] + '">' +
      '<div class="estado__n">' + (vg.porEstado[e] || 0) + '</div>' +
      '<div class="estado__r">' + esc(ROTULO_ESTADO[e]) + '</div></div>',
  ).join('');

  $('barra').style.width = vg.progresso + '%';
  const emTrabalho = vg.totalTarefas - (vg.porEstado['DECISIONS REQUIRED'] || 0);
  $('progresso-texto').textContent =
    vg.progresso + '% concluído — ' + (vg.porEstado.DONE || 0) + ' de ' +
    emTrabalho + ' tarefas de trabalho';
  $('progresso-nota').textContent =
    (vg.porEstado['DECISIONS REQUIRED'] || 0) + ' decisões fora da conta';

  // ── escada de paridade ────────────────────────────────────────────────
  const escada = dados.paridade.escada;
  const cont = dados.paridade.contagem;
  const total = dados.paridade.itens.length;
  $('paridade-total').textContent = total;

  $('escada-faixa').innerHTML = escada
    .map((d, i) => {
      const n = cont[d] || 0;
      return (
        '<div class="escada__pedaco" data-vazio="' + (n ? 'nao' : 'sim') + '" ' +
        'style="flex:' + n + ';background:var(--d' + i + ')" ' +
        'title="' + esc(d) + ': ' + n + '">' + (n >= 3 ? n : '') + '</div>'
      );
    })
    .join('');

  $('escada-degraus').innerHTML = escada
    .map((d, i) => {
      const n = cont[d] || 0;
      return (
        '<div class="degrau" data-n="' + n + '" style="border-left-color:var(--d' + i + ')">' +
        '<span class="degrau__n" style="color:var(--d' + i + ')">' + n + '</span>' +
        '<span class="degrau__r">' + esc(d) + '</span></div>'
      );
    })
    .join('');

  // ── decisões ──────────────────────────────────────────────────────────
  const decisoes = dados.tarefas.filter((t) => t.estado === 'DECISIONS REQUIRED');
  $('decisoes').innerHTML = decisoes
    .map(
      (t) =>
        '<tr><td class="id">' + esc(t.id) + '</td>' +
        '<td>' + esc(t.titulo) + '</td>' +
        '<td class="fraco">' + esc(t.contexto) + '</td></tr>',
    )
    .join('');

  // ── domínios ──────────────────────────────────────────────────────────
  $('dominios').innerHTML = dados.dominios
    .filter((d) => d.nome !== 'Decisão')
    .map((d) => {
      const legado = d.paridade.filter((p) => p.degrau === 'LEGACY ONLY').length;
      const barra = ORDEM.filter((e) => d.contagem[e])
        .map(
          (e) =>
            '<span style="flex:' + d.contagem[e] +
            ';background:var(--' +
            ({ DONE: 'ok', 'IN PROGRESS': 'latao', NEXT: 'regua-forte', BLOCKED: 'parado', 'DECISIONS REQUIRED': 'atencao' })[e] +
            ')" title="' + esc(ROTULO_ESTADO[e]) + ': ' + d.contagem[e] + '"></span>',
        )
        .join('');
      const pilulas = ORDEM.filter((e) => d.contagem[e])
        .map(
          (e) =>
            '<span class="pilula pilula--' + CLASSE_ESTADO[e] + '">' +
            d.contagem[e] + ' ' + esc(ROTULO_ESTADO[e]) + '</span>',
        )
        .join('');
      const linhas = d.tarefas
        .filter((t) => t.estado === 'IN PROGRESS' || t.estado === 'BLOCKED')
        .slice(0, 4)
        .map(
          (t) =>
            '<div class="dominio__linha"><span class="id">' + esc(t.id) + '</span>' +
            '<span>' + esc(t.titulo.slice(0, 72)) + '</span></div>',
        )
        .join('');
      return (
        '<div class="dominio"><h3>' + esc(d.nome) + '</h3>' +
        (barra ? '<div class="dominio__barra">' + barra + '</div>' : '') +
        '<div class="dominio__nums">' + pilulas +
        (legado
          ? '<span class="pilula pilula--next">' + legado + ' só no legado</span>'
          : '') +
        '</div>' + linhas + '</div>'
      );
    })
    .join('');

  // ── tarefas com filtro ────────────────────────────────────────────────
  let filtroAtivo = 'TODAS';

  function desenharTarefas() {
    const lista =
      filtroAtivo === 'TODAS'
        ? dados.tarefas
        : dados.tarefas.filter((t) => t.estado === filtroAtivo);
    const ordenadas = lista
      .slice()
      .sort((a, b) => ORDEM.indexOf(a.estado) - ORDEM.indexOf(b.estado) || a.id.localeCompare(b.id));
    $('tarefas').innerHTML = ordenadas
      .map(
        (t) =>
          '<tr><td class="id">' + esc(t.id) + '</td>' +
          '<td><span class="pilula pilula--' + CLASSE_ESTADO[t.estado] + '">' +
          esc(ROTULO_ESTADO[t.estado]) + '</span></td>' +
          '<td>' + esc(t.titulo) + '</td>' +
          '<td class="fraco">' + esc(t.contexto) +
          (t.nota ? ' — ' + esc(t.nota) : '') + '</td></tr>',
      )
      .join('');
  }

  $('filtro').innerHTML = ['TODAS'].concat(ORDEM)
    .map(
      (e) =>
        '<button type="button" id="f-' + e.replace(/\s/g, '-') + '" data-estado="' + e + '" ' +
        'aria-pressed="' + (e === 'TODAS') + '">' +
        (e === 'TODAS' ? 'Todas (' + dados.tarefas.length + ')'
          : ROTULO_ESTADO[e] + ' (' + (vg.porEstado[e] || 0) + ')') +
        '</button>',
    )
    .join('');

  $('filtro').addEventListener('click', (ev) => {
    const botao = ev.target.closest('button');
    if (!botao) return;
    filtroAtivo = botao.dataset.estado;
    $('filtro').querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b === botao));
    });
    desenharTarefas();
  });

  desenharTarefas();

  // ── agentes ───────────────────────────────────────────────────────────
  $('agentes').innerHTML = ['Claude', 'Codex']
    .map((agente) => {
      const entradas = dados.worklogs.filter((w) => w.agente === agente);
      const corpo = entradas.length
        ? entradas
            .map(
              (e) =>
                '<div class="entrada">' +
                '<div class="entrada__data">' + esc(e.data) +
                (e.branch ? ' · ' + esc(e.branch) : '') + '</div>' +
                '<div class="entrada__titulo">' + esc(e.titulo) + '</div>' +
                (e.status ? '<div class="entrada__status">' + esc(e.status) + '</div>' : '') +
                (e.taskIds.length
                  ? '<div class="entrada__ids">' +
                    e.taskIds.map((i) => '<span class="tag">' + esc(i) + '</span>').join('') +
                    '</div>'
                  : '') +
                '</div>',
            )
            .join('')
        : '<p class="fraco">Sem entradas no worklog.</p>';
      return (
        '<div class="agente"><h3>' + esc(agente) +
        '<span>' + entradas.length + ' entradas</span></h3>' + corpo + '</div>'
      );
    })
    .join('');

  // ── commits ───────────────────────────────────────────────────────────
  $('commits').innerHTML = dados.git.recentes
    .map(
      (c) =>
        '<tr><td class="mono">' + esc(c.data) + '</td>' +
        '<td class="mono">' + esc(c.commit) + '</td>' +
        '<td class="mono">' + esc(c.agente || '—') + '</td>' +
        '<td>' + esc(c.assunto) +
        (c.taskIds.length
          ? ' <span class="tag">' + c.taskIds.map(esc).join('</span> <span class="tag">') + '</span>'
          : '') +
        '</td></tr>',
    )
    .join('');
})();
