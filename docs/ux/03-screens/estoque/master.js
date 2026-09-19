const root = document.querySelector('.stock-shell');
const panels = [...root.querySelectorAll('[data-inventory-panel]')];
const tabs = [...root.querySelectorAll('[data-inventory-tab]')];
const startDialog = root.querySelector('.start-dialog');
const variationDialog = root.querySelector('.variation-dialog');
const toast = root.querySelector('[data-stock-toast]');
let activeSession = false;
let paused = false;

function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function showPanel(name) {
  panels.forEach((panel) => { panel.hidden = panel.dataset.inventoryPanel !== name; });
}

function selectTab(name) {
  tabs.forEach((tab) => {
    const active = tab.dataset.inventoryTab === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
}

function updateOpenCard(label, copy) {
  root.querySelector('[data-open-label]').textContent = label;
  root.querySelector('[data-open-copy]').textContent = copy;
}

root.querySelectorAll('[data-href]').forEach((control) => {
  control.addEventListener('click', () => { window.location.href = control.dataset.href; });
});

const profile = root.querySelector('.profile');
const profileMenu = root.querySelector('#stock-profile-menu');
profile.addEventListener('click', () => {
  const open = profile.getAttribute('aria-expanded') === 'true';
  profile.setAttribute('aria-expanded', String(!open));
  profileMenu.hidden = open;
});

tabs.forEach((tab) => tab.addEventListener('click', () => {
  const name = tab.dataset.inventoryTab;
  selectTab(name);
  if (name === 'history') showPanel('history');
  else if (name === 'open' && activeSession) showPanel('active');
  else showPanel('health');
}));

root.querySelector('[data-start-inventory]').addEventListener('click', () => startDialog.showModal());
root.querySelector('[data-confirm-start]').addEventListener('click', () => {
  startDialog.close();
  activeSession = true;
  paused = false;
  updateOpenCard('Em andamento', '214 de 790 conferidos');
  selectTab('open');
  showPanel('active');
  notify('Inventário iniciado no protótipo. Nenhum dado real foi gravado.');
});

const pauseButton = root.querySelector('[data-pause-inventory]');
pauseButton.addEventListener('click', () => {
  paused = !paused;
  pauseButton.textContent = paused ? 'Retomar' : 'Pausar';
  root.querySelector('[data-active-state]').textContent = paused ? 'Inventário pausado' : 'Inventário em andamento';
  root.querySelector('[data-count-search]').disabled = paused;
  root.querySelector('[data-add-count]').disabled = paused;
  updateOpenCard(paused ? 'Pausado' : 'Em andamento', paused ? 'Contagens preservadas' : '214 de 790 conferidos');
  notify(paused ? 'Contagem pausada e preservada.' : 'Contagem retomada no estado demonstrativo.');
});

root.querySelector('[data-finish-inventory]').addEventListener('click', () => {
  showPanel('review');
  updateOpenCard('Pronto para revisão', 'Ajustes ainda não aplicados');
  notify('A contagem foi encerrada. Nenhum ajuste foi aplicado.');
});

root.querySelector('[data-back-count]').addEventListener('click', () => {
  showPanel('active');
  updateOpenCard(paused ? 'Pausado' : 'Em andamento', paused ? 'Contagens preservadas' : '214 de 790 conferidos');
});

root.querySelector('[data-apply-adjustments]').addEventListener('click', () => {
  activeSession = false;
  updateOpenCard('Nenhum aberto', 'Último inventário finalizado');
  selectTab('history');
  showPanel('detail');
  notify('Aplicação simulada. A implementação futura enviará apenas as identidades selecionadas.');
});

root.querySelectorAll('[data-view-inventory]').forEach((button) => button.addEventListener('click', () => showPanel('detail')));
root.querySelector('[data-back-history]').addEventListener('click', () => {
  selectTab('history');
  showPanel('history');
});

root.querySelector('[data-add-count]').addEventListener('click', () => variationDialog.showModal());
root.querySelector('[data-count-search]').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    variationDialog.showModal();
  }
});

const variationConfirm = root.querySelector('[data-confirm-variation]');
root.querySelectorAll('[name="variation"]').forEach((radio) => radio.addEventListener('change', () => { variationConfirm.disabled = false; }));
variationConfirm.addEventListener('click', () => {
  const choice = root.querySelector('[name="variation"]:checked');
  if (!choice) return;
  variationDialog.close();
  const lastRow = root.querySelector('.inventory-count-list .count-row:last-child');
  if (choice.value === 'Não sei a variação') {
    lastRow.querySelector('small').textContent = 'Variação não identificada · pendência preservada';
    lastRow.querySelector('.state').textContent = 'Não comparável';
    lastRow.querySelector('.state').className = 'state neutral';
    notify('Pendência registrada sem comparação ou sugestão de ajuste.');
  } else {
    lastRow.querySelector('small').textContent = choice.value;
    lastRow.querySelector('.state').textContent = 'Contado';
    lastRow.querySelector('.state').className = 'state success';
    notify(`${choice.value} selecionado. Contagem demonstrativa atualizada.`);
  }
  choice.checked = false;
  variationConfirm.disabled = true;
});

const productSearch = root.querySelector('[data-product-search]');
const productRows = [...root.querySelectorAll('[data-product]')];
productSearch.addEventListener('input', () => {
  const query = productSearch.value.trim().toLocaleLowerCase('pt-BR');
  let visible = 0;
  productRows.forEach((row) => {
    row.hidden = query !== '' && !row.dataset.product.includes(query);
    if (!row.hidden) visible += 1;
  });
  root.querySelector('[data-product-count]').textContent = `${visible} ${visible === 1 ? 'produto demonstrativo' : 'produtos demonstrativos'}`;
  root.querySelector('[data-product-empty]').hidden = visible !== 0;
});
