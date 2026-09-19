/* Clientes · painel de relacionamento sobre a fonte demonstrativa local. */
(async () => {
  await window.MarquesaDemo.ready;
  const demo = window.MarquesaDemo;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = n => n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const short = n => 'R$ ' + Math.round(n).toLocaleString('pt-BR');
  const date = s => s ? s.split('-').reverse().join('/') : '—';
  const today = new Date().toLocaleDateString('sv-SE');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  /* O casco resolve [data-icon] assim que existir; não depende da ordem de carga. */
  const icon = n => `<span data-icon="${n}"></span>`;

  const toast = $('[data-client-toast]');
  const notice = t => { toast.textContent = t; toast.hidden = false; clearTimeout(notice.t); notice.t = setTimeout(() => toast.hidden = true, 3000); };

  /* Pós-venda demonstrativo, por cliente. */
  const AFTER = { camila:2, ana:0, mariana:1, juliana:0, zilma:0 };

  let clients = demo.get('clients', []);
  const accounts = demo.get('accounts', {});
  let selected = 'camila', filter = 'all', timelineFilter = 'all';

  const accountOf = id => Object.values(accounts).find(a => a.clientId === id);
  const openOf = id => { const a = accountOf(id); return a ? Math.max(a.total - a.paid, 0) : 0; };
  const boughtOf = c => (c.historicalPaid || 0) + (accountOf(c.id)?.total || 0);
  const receivedOf = c => (c.historicalPaid || 0) + (accountOf(c.id)?.paid || 0);
  const salesOf = c => (c.historicalSales || 0) + (accountOf(c.id) ? 1 : 0);

  /* ---------------------------------------------------------------- views */
  const views = $$('[data-client-view]'), tabs = $$('[data-client-tab]');
  function showView(name) {
    views.forEach(v => v.hidden = v.dataset.clientView !== name);
    tabs.forEach(t => t.classList.toggle('active', t.dataset.clientTab === name));
    scrollTo({ top:0, behavior:'smooth' });
  }
  tabs.forEach(t => t.addEventListener('click', () => showView(t.dataset.clientTab)));

  /* ----------------------------------------------------------------- lista */
  function renderList() {
    const term = ($('[data-client-search]').value || '').trim().toLowerCase();
    const rows = clients.filter(c => {
      const hay = (c.name + ' ' + (c.phone || '')).toLowerCase();
      if (term && !hay.includes(term)) return false;
      if (filter === 'open') return openOf(c.id) > 0;
      if (filter === 'warranty') return (AFTER[c.id] || 0) > 0;
      return true;
    });
    $('[data-client-rows]').innerHTML = rows.map(c => {
      const open = openOf(c.id), a = accountOf(c.id);
      const late = a && a.due < today && open > 0;
      const status = open > 0
        ? `<em class="mq-status ${late ? 'mq-status--risk' : 'mq-status--open'}">${late ? 'Em atraso' : 'A receber'}</em>`
        : '<em class="mq-status mq-status--ok">Em dia</em>';
      return `<button class="mq-tr client-row" type="button" data-open-client="${c.id}" role="row">
        <span class="mq-cell"><b>${esc(c.name)}</b><small>${AFTER[c.id] ? AFTER[c.id] + ' ocorrência(s) de pós-venda' : 'Sem pós-venda aberto'}</small></span>
        <span class="mq-cell"><b>${esc(c.phone || '—')}</b><small>${c.phone ? 'WhatsApp' : 'contato não informado'}</small></span>
        <span class="mq-cell"><b>${salesOf(c)}</b><small>compras</small></span>
        <span class="mq-cell mq-cell--num" data-label="Total comprado"><b class="mq-money">${money(boughtOf(c))}</b></span>
        <span class="mq-cell mq-cell--num" data-label="A receber"><b class="mq-money${open > 0 ? ' mq-money--risk' : ' mq-money--muted'}">${money(open)}</b>${a && open > 0 ? `<small>vence ${date(a.due)}</small>` : ''}</span>
        <span class="mq-cell">${status}</span>
        <span class="mq-tr__chev">${icon('chevron')}</span>
      </button>`;
    }).join('');
    $('[data-client-empty]').hidden = rows.length > 0;
    $('[data-client-visible]').textContent = `${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}`;
    $('[data-client-range]').textContent = `1–${rows.length} de ${clients.length} clientes`;
    $('[data-client-count]').textContent = clients.length;
    $('[data-kpi-clients]').textContent = clients.length;
    const withOpen = clients.filter(c => openOf(c.id) > 0);
    $('[data-kpi-open]').textContent = withOpen.length;
    $('[data-kpi-open-value]').textContent = money(withOpen.reduce((n, c) => n + openOf(c.id), 0)) + ' a receber';
    $$('[data-open-client]').forEach(b => b.onclick = () => openClient(b.dataset.openClient));
  }

  $('[data-client-search]').oninput = renderList;
  $$('[data-client-filter]').forEach(b => b.onclick = () => {
    filter = b.dataset.clientFilter;
    $$('[data-client-filter]').forEach(x => x.classList.toggle('active', x === b));
    renderList();
  });
  $('[data-client-clear]').onclick = () => {
    filter = 'all'; $('[data-client-search]').value = '';
    $$('[data-client-filter]').forEach(x => x.classList.toggle('active', x.dataset.clientFilter === 'all'));
    renderList();
  };

  /* ---------------------------------------------------------------- perfil */
  function timelineFor(c) {
    const a = accountOf(c.id), items = [];
    if (a) {
      const [, num, day] = a.sale.match(/#(\d+)\D+([\d/]+)/) || [];
      items.push({ kind:'sale', date: day || '', title:`Venda #${num || ''}`, sub:`${date(a.due)} é o vencimento · saldo simples`, value:a.total, status: a.paid >= a.total ? 'ok' : 'open', label: a.paid >= a.total ? 'Paga' : 'A receber', ico:'sale' });
      a.events.forEach(e => items.push({
        kind:'money', date: date(e.date),
        title: `${e.correction ? 'Correção · ' : 'Recebimento por '}${e.method}`,
        sub: `Data efetiva ${date(e.date)}${e.correction ? ' · registro anterior preservado' : ''}`,
        value: e.value, status:'ok', label: e.correction ? 'Auditado' : 'Pago', ico: /pix/i.test(e.method) ? 'pix' : /cart/i.test(e.method) ? 'card' : 'cash'
      }));
    }
    if (c.historicalSales) items.push({ kind:'sale', date:'anterior', title:`${c.historicalSales} compra(s) anteriores`, sub:'Histórico consolidado antes desta demonstração', value:c.historicalPaid, status:'ok', label:'Pagas', ico:'receipt' });
    return items;
  }

  function openClient(id) {
    selected = id; showView('perfil');
    const c = clients.find(x => x.id === id) || clients[0];
    const a = accountOf(id), open = openOf(id);
    const initials = c.name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    $('[data-profile-name]').textContent = c.name;
    $('[data-profile-name-2]').textContent = c.name;
    $('[data-profile-lede]').textContent = `Compras, situação financeira e pós-venda de ${c.name.split(' ')[0]}.`;
    $('[data-profile-initials]').textContent = initials;
    $('[data-profile-phone]').textContent = c.phone || 'contato não informado';
    $('[data-profile-phone-2]').textContent = c.phone || '— ainda não informado —';
    $('[data-profile-channel]').textContent = c.phone ? 'WhatsApp' : 'sem canal registrado';
    $('[data-profile-purchases]').textContent = `${salesOf(c)} compras`;
    $('[data-profile-last]').textContent = a ? (a.sale.match(/([\d/]{10})/)?.[1] || '—') : '—';
    $('[data-profile-bought]').innerHTML = `<i>R$</i>${Math.round(boughtOf(c)).toLocaleString('pt-BR')}`;
    $('[data-profile-received]').innerHTML = `<i>R$</i>${Math.round(receivedOf(c)).toLocaleString('pt-BR')}`;
    $('[data-profile-open]').innerHTML = `<i>R$</i>${Math.round(open).toLocaleString('pt-BR')}`;
    const late = a && a.due < today && open > 0;
    $('[data-profile-open-foot]').textContent = open > 0
      ? (late ? `Vencido em ${date(a.due)}` : `Vence em ${date(a.due)} · saldo simples`)
      : 'Nada em aberto';
    const sales = salesOf(c);
    $('[data-profile-ticket]').innerHTML = `<i>R$</i>${sales ? Math.round(boughtOf(c) / sales).toLocaleString('pt-BR') : 0}`;
    $('[data-profile-open-count]').textContent = open > 0 ? '1 venda' : 'Nenhuma';
    $('[data-profile-due]').textContent = a && open > 0 ? date(a.due) : '—';
    const lateEl = $('[data-profile-late]');
    lateEl.textContent = late ? money(open) : 'Nenhum';
    lateEl.className = late ? 'mq-risk' : 'mq-ok';
    $('[data-profile-notes]').value = c.notes || '';
    renderTimeline(c);
  }

  function renderTimeline(c) {
    const items = timelineFor(c).filter(i => timelineFilter === 'all' || i.kind === timelineFilter);
    const box = $('[data-profile-timeline]');
    box.innerHTML = items.length ? items.map(i => `<div class="mq-item">
        <span class="timeline-date">${esc(i.date)}</span>
        <span class="mq-item__icon ${i.kind === 'money' ? 'mq-item__icon--ok' : 'mq-item__icon--brand'}">${icon(i.ico)}</span>
        <span class="mq-item__main"><b>${esc(i.title)}</b><small>${esc(i.sub)}</small></span>
        <span class="mq-item__side"><b class="mq-money">${money(i.value)}</b><em class="mq-status mq-status--${i.status}">${esc(i.label)}</em></span>
      </div>`).join('')
      : `<div class="mq-state"><span class="mq-state__icon">${icon('receipt')}</span><h3>Nada neste recorte</h3><p>Esta cliente não tem registros do tipo selecionado.</p></div>`;
  }

  $$('[data-timeline-filter]').forEach(b => b.onclick = () => {
    timelineFilter = b.dataset.timelineFilter;
    $$('[data-timeline-filter]').forEach(x => x.classList.toggle('active', x === b));
    renderTimeline(clients.find(c => c.id === selected));
  });

  $('[data-save-notes]').onclick = async () => {
    const c = clients.find(x => x.id === selected);
    c.notes = $('[data-profile-notes]').value.trim();
    await demo.set('clients', clients);
    notice('Observação salva nesta demonstração.');
  };

  /* --------------------------------------------------------------- cadastro */
  const dialog = $('[data-client-dialog]');
  $('[data-new-client]').onclick = () => {
    $('[data-client-dialog-context]').textContent = 'Cadastro';
    $('[data-client-dialog-title]').textContent = 'Nova cliente';
    ['name','phone','city','instagram','notes'].forEach(k => $(`[data-form-${k}]`).value = '');
    dialog.showModal();
  };
  $('[data-edit-client]').onclick = () => {
    const c = clients.find(x => x.id === selected);
    $('[data-client-dialog-context]').textContent = 'Cadastro';
    $('[data-client-dialog-title]').textContent = 'Editar cadastro';
    $('[data-form-name]').value = c.name; $('[data-form-phone]').value = c.phone || '';
    $('[data-form-city]').value = c.city || ''; $('[data-form-instagram]').value = c.instagram || '';
    $('[data-form-notes]').value = c.notes || '';
    dialog.showModal();
  };
  $('[data-save-client]').onclick = async () => {
    const name = $('[data-form-name]').value.trim();
    if (!name) { notice('Informe pelo menos o nome da cliente.'); return; }
    const editing = $('[data-client-dialog-title]').textContent.includes('Editar');
    const payload = { phone:$('[data-form-phone]').value.trim(), city:$('[data-form-city]').value.trim(),
      instagram:$('[data-form-instagram]').value.trim(), notes:$('[data-form-notes]').value.trim() };
    if (editing) Object.assign(clients.find(c => c.id === selected), { name, ...payload });
    else clients.push({ id:'c' + Date.now(), name, cpf:'', email:'', birth:'', historicalPaid:0, historicalSales:0, ...payload });
    await demo.set('clients', clients);
    clients = demo.get('clients', []);
    dialog.close(); renderList();
    if (editing) openClient(selected); else notice('Cliente demonstrativa cadastrada neste navegador.');
  };

  $$('[data-href]').forEach(b => b.addEventListener('click', () => location.href = b.dataset.href));

  renderList();
  openClient(new URLSearchParams(location.search).get('cliente') || 'camila');
  showView(location.hash === '#perfil' ? 'perfil' : 'lista');
})();
