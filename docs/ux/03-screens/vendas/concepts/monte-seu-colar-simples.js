const models = {
  '1-1': { sku: '326660', name: 'Colar Casal', price: 129 },
  '0-2': { sku: '364945', name: 'Colar Filhas Duas Meninas', price: 129 },
  '2-0': { sku: '311066', name: 'Colar Filhos Dois Meninos', price: 129 },
  '2-1': { sku: '314161', name: 'Colar Filhos Dois Meninos e Uma Menina', price: 159 },
  '1-2': { sku: '399872', name: 'Colar Filhos Duas Meninas e Um Menino', price: 159 },
};

const colors = {
  boy: [
    { sku: '251551', label: 'Azul', stock: 4, gem: '#79a5bd' },
    { sku: '251552', label: 'Incolor', stock: 3, gem: '#e5e0df' },
    { sku: '329494', label: 'Verde', stock: 2, gem: '#6fa77c' },
  ],
  girl: [
    { sku: '263236', label: 'Rosa claro', stock: 5, gem: '#efa9ba' },
    { sku: '273470', label: 'Incolor', stock: 5, gem: '#e5e0df' },
  ],
};

const state = { boy: 0, girl: 0, boyColors: [], girlColors: [], extra: false };
const $ = (selector) => document.querySelector(selector);
const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

const colorSection = $('[data-color-section]');
const colorList = $('[data-color-list]');
const commercialSection = $('[data-commercial-section]');
const matchBanner = $('[data-match-banner]');
const commercialSku = $('[data-commercial-sku]');
const commercialName = $('[data-commercial-name]');
const standardPrice = $('[data-standard-price]');
const finalPrice = $('[data-final-price]');
const priceReasonField = $('[data-price-reason-field]');
const priceReason = $('[data-price-reason]');
const newModelHelp = $('[data-new-model-help]');
const extraSku = $('[data-extra-sku]');
const addSale = $('[data-add-sale]');

function currentModel() {
  if (state.extra) return null;
  return models[`${state.boy}-${state.girl}`] || null;
}

function quantityLabel() {
  const parts = [];
  if (state.boy) parts.push(`${state.boy} ${state.boy === 1 ? 'menino' : 'meninos'}`);
  if (state.girl) parts.push(`${state.girl} ${state.girl === 1 ? 'menina' : 'meninas'}`);
  if (state.extra) parts.push('1 pingente extra');
  return parts.join(' + ');
}

function generatedName() {
  const label = quantityLabel();
  return label ? `Monte seu Colar — ${label}` : '';
}

function syncArray(type) {
  const list = state[`${type}Colors`];
  while (list.length < state[type]) list.push('');
  if (list.length > state[type]) list.splice(state[type]);
}

function renderColorRows() {
  const rows = [];
  ['boy', 'girl'].forEach((type) => {
    const title = type === 'boy' ? 'Menino' : 'Menina';
    state[`${type}Colors`].forEach((value, index) => {
      const options = colors[type].map((color) => `<option value="${color.sku}" ${color.sku === value ? 'selected' : ''}>${color.label} · SKU ${color.sku} · ${color.stock} disp.</option>`).join('');
      rows.push(`<div class="color-row"><span>${rows.length + 1}</span><label><strong>${title} ${index + 1}</strong><small>Peça física</small></label><select data-color-type="${type}" data-color-index="${index}" aria-label="Cor de ${title} ${index + 1}"><option value="">Escolha a cor</option>${options}</select></div>`);
    });
  });
  colorList.innerHTML = rows.join('');
  colorSection.hidden = rows.length === 0;
}

function selectedComponents() {
  const selected = [];
  ['boy', 'girl'].forEach((type) => {
    state[`${type}Colors`].forEach((sku, index) => {
      const color = colors[type].find((item) => item.sku === sku);
      if (color) selected.push({ ...color, type, position: index + 1 });
    });
  });
  return selected;
}

function renderPreview() {
  const preview = $('[data-preview-pendants]');
  const pieces = [];
  ['boy', 'girl'].forEach((type) => {
    state[`${type}Colors`].forEach((sku) => {
      const color = colors[type].find((item) => item.sku === sku);
      pieces.push(`<i class="preview-piece ${type === 'girl' ? 'girl' : ''}" style="--gem:${color?.gem || '#e7dadd'}" title="${color?.label || 'Cor ainda não escolhida'}"></i>`);
    });
  });
  if (state.extra) pieces.push('<i class="preview-piece extra" title="Pingente extra"></i>');
  preview.innerHTML = pieces.length ? pieces.join('') : '<p>Seu colar começa vazio</p>';
}

function renderCommercial(resetFields = false) {
  const total = state.boy + state.girl;
  commercialSection.hidden = total === 0;
  if (!total) return;

  const model = currentModel();
  if (model) {
    matchBanner.className = 'match-banner';
    matchBanner.innerHTML = `<strong>✓ Modelo reconhecido</strong><span>${model.sku} · preço cadastrado</span>`;
    commercialSku.value = model.sku;
    commercialSku.readOnly = true;
    commercialName.value = model.name;
    commercialName.readOnly = true;
    standardPrice.value = money(model.price);
    if (resetFields || !finalPrice.value) finalPrice.value = model.price.toFixed(2);
    newModelHelp.hidden = true;
  } else {
    matchBanner.className = 'match-banner new';
    matchBanner.innerHTML = '<strong>Nova combinação</strong><span>precisa de um SKU comercial</span>';
    commercialSku.readOnly = false;
    commercialName.readOnly = false;
    standardPrice.value = 'Novo cadastro';
    if (resetFields) {
      commercialSku.value = '';
      commercialName.value = generatedName();
      finalPrice.value = '';
      priceReason.value = '';
    }
    newModelHelp.hidden = false;
  }
}

function validateStock() {
  const counts = {};
  selectedComponents().forEach((component) => { counts[component.sku] = (counts[component.sku] || 0) + 1; });
  return Object.entries(counts).every(([sku, needed]) => {
    const color = [...colors.boy, ...colors.girl].find((item) => item.sku === sku);
    return needed <= color.stock;
  });
}

function updatePriceState() {
  const model = currentModel();
  const changed = model && finalPrice.value && Math.abs(Number(finalPrice.value) - model.price) > .005;
  priceReasonField.hidden = !changed;
  if (!changed) priceReason.value = '';
}

function updateFooter() {
  const model = currentModel();
  const componentCount = selectedComponents().length;
  const expected = state.boy + state.girl;
  const allColors = expected > 0 && componentCount === expected;
  const hasCommercialData = model || (commercialSku.value.trim() && commercialName.value.trim());
  const hasPrice = Number(finalPrice.value) > 0;
  const changedPriceNeedsReason = !priceReasonField.hidden && !priceReason.value.trim();
  const extraComplete = !state.extra || extraSku.value.trim();
  addSale.disabled = !(allColors && validateStock() && hasCommercialData && hasPrice && extraComplete && !changedPriceNeedsReason);
  $('[data-footer-label]').textContent = quantityLabel() || 'Nenhum pingente';
  $('[data-footer-price]').textContent = hasPrice ? money(finalPrice.value) : 'R$ 0,00';
}

function render(resetCommercial = false) {
  $('[data-count="boy"]').textContent = state.boy;
  $('[data-count="girl"]').textContent = state.girl;
  syncArray('boy');
  syncArray('girl');
  renderColorRows();
  renderPreview();
  renderCommercial(resetCommercial);
  updatePriceState();
  updateFooter();
}

document.addEventListener('click', (event) => {
  const quantityButton = event.target.closest('[data-quantity]');
  if (quantityButton) {
    const type = quantityButton.dataset.quantity;
    state[type] = Math.max(0, Math.min(4, state[type] + Number(quantityButton.dataset.delta)));
    render(true);
    return;
  }
  if (event.target.closest('[data-extra-trigger]')) {
    state.extra = !state.extra;
    $('[data-extra-fields]').hidden = !state.extra;
    $('[data-extra-trigger]').setAttribute('aria-expanded', String(state.extra));
    if (!state.extra) extraSku.value = '';
    render(true);
    if (state.extra) extraSku.focus();
    return;
  }
  if (event.target.closest('[data-remove-extra]')) {
    state.extra = false;
    extraSku.value = '';
    $('[data-extra-fields]').hidden = true;
    $('[data-extra-trigger]').setAttribute('aria-expanded', 'false');
    render(true);
    return;
  }
  if (event.target.closest('[data-add-sale]')) {
    const components = selectedComponents();
    const extraLine = state.extra ? `<small>Extra · ${escapeHtml(extraSku.value.trim())}</small>` : '';
    $('[data-review-content]').innerHTML = `<div class="review-card"><div><span>SKU comercial</span><strong>${escapeHtml(commercialSku.value)}</strong><small>${escapeHtml(commercialName.value)}</small></div><div><span>Composição</span><strong>${escapeHtml(quantityLabel())}</strong><small>Veneziana 444032 · ${components.map((item) => `${item.type === 'boy' ? 'Menino' : 'Menina'} ${item.position} ${item.label} (${item.sku})`).join(' · ')}</small>${extraLine}</div><div><span>Preço final</span><strong>${money(finalPrice.value)}</strong>${priceReason.value ? `<small>Alteração: ${escapeHtml(priceReason.value)}</small>` : ''}</div></div>`;
    $('[data-review-dialog]').showModal();
    return;
  }
  if (event.target.closest('[data-close-review]')) $('[data-review-dialog]').close();
  if (event.target.closest('[data-confirm-concept]')) {
    $('[data-review-dialog]').close();
    const toast = $('[data-toast]');
    toast.hidden = false;
    clearTimeout(window.conceptToastTimer);
    window.conceptToastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
  }
});

colorList.addEventListener('change', (event) => {
  const select = event.target.closest('[data-color-type]');
  if (!select) return;
  state[`${select.dataset.colorType}Colors`][Number(select.dataset.colorIndex)] = select.value;
  renderPreview();
  updateFooter();
});

[commercialSku, commercialName, finalPrice, priceReason, extraSku].forEach((field) => {
  field.addEventListener('input', () => {
    updatePriceState();
    updateFooter();
  });
});

render();
