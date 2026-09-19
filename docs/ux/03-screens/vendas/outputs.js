/* Protótipo local: nenhuma chamada à API ou alteração de estoque real. */
(async () => {
  await window.MarquesaDemo?.ready;
  const screen = document.querySelector('#lancamentos');
  const picker = screen.querySelector('.choice-grid');
  const choice = picker.querySelector('[data-launch-screen="saidas"]');
  const workspace = document.createElement('div');
  workspace.className = 'output-workspace';
  workspace.hidden = true;
  picker.after(workspace);
  workspace.innerHTML = `
    <form class="output-form">
      <header class="output-heading"><div><p class="context">Saída sem faturamento</p><h2>Nova saída sem faturamento</h2></div><span class="tag rose">Não gera receita</span></header>
      <div class="output-columns">
        <section aria-labelledby="output-items-title"><h3 id="output-items-title">Itens da saída</h3>
          <label class="output-field">Buscar peça<input type="search" data-output-search placeholder="Nome, SKU ou código da etiqueta" autocomplete="off"></label>
          <div data-output-results class="output-results"></div>
          <div data-output-cart></div>
        </section>
        <section aria-labelledby="output-details-title"><h3 id="output-details-title">Detalhes da saída</h3>
          <div class="output-fields">
            <label class="output-field">Motivo<select name="reason" required><option value="">Selecione</option><option>Brinde</option><option>Uso próprio</option><option>Perda</option><option>Sorteio</option></select></label>
            <label class="output-field">Responsável ou destino<input name="destination" placeholder="Pessoa, uso ou campanha"></label>
            <label class="output-field">Data da saída<input name="date" type="date" required></label>
            <label class="output-field">Local ou canal<select name="channel"><option>Balcão</option><option>WhatsApp</option><option>Instagram</option><option>Uso interno</option><option>Outro</option></select></label>
          </div>
          <label class="output-field">Explicação da saída<textarea name="note" rows="3" required placeholder="Conte por que estas peças estão saindo."></textarea></label>
          <p class="output-help">As peças serão retiradas do disponível. Esta saída não gera pagamento ou valor a receber.</p>
        </section>
      </div>
      <footer class="output-footer"><div><strong data-output-total>0 peças</strong><small data-output-cost-total>Custo real: —</small></div><button class="button primary" type="submit">Revisar saída</button></footer>
      <p class="output-feedback" data-output-feedback role="status"></p>
    </form>
    <section class="data-section period-details output-history"><div class="section-heading detail-heading"><div><h2>Análise de saídas</h2><p>Acompanhe o custo real das peças retiradas do estoque.</p></div><div class="output-history-controls"><div class="period-control" aria-label="Período do histórico de saídas"><button type="button" class="active" data-output-period="all">Tudo</button><button type="button" data-output-period="30d">30 dias</button><button type="button" data-output-period="7d">7 dias</button></div><div class="output-history-filters"><label class="output-field">Situação<select data-output-state><option value="">Todas</option><option value="active">Concluídas</option><option value="reversed">Estornadas</option></select></label><label class="output-field">Motivo<select data-output-filter><option value="">Todos os motivos</option><option>Brinde</option><option>Uso próprio</option><option>Perda</option><option>Sorteio</option></select></label><label class="output-field output-custom-date">De<input type="date" data-output-from></label><label class="output-field output-custom-date">Até<input type="date" data-output-to></label></div></div></div><div class="analytics-view active"><div class="output-overview" data-output-overview></div><div data-output-history></div></div><footer class="output-history-footer"><span data-output-history-count></span><span>Dados demonstrativos · custo de aquisição registrado na saída</span></footer></section>
    <dialog class="output-dialog" aria-labelledby="output-review-title"><h2 id="output-review-title">Conferir saída</h2><div data-output-review></div><p>Confirmação simulada. Nenhum dado real será gravado.</p><div class="output-actions"><button type="button" class="button ghost" data-output-back>Voltar e editar</button><button type="button" class="button primary" data-output-confirm>Confirmar saída</button></div></dialog>
    <dialog class="output-dialog" aria-labelledby="output-reverse-title"><form data-output-reverse-form><h2 id="output-reverse-title">Estornar saída</h2><p>Devolve as peças ao disponível e mantém o registro original no histórico desta sessão.</p><label class="output-field">Motivo do estorno<textarea name="explanation" required rows="3"></textarea></label><div class="output-actions"><button type="button" class="button ghost" data-output-reverse-back>Voltar</button><button class="button primary">Confirmar estorno</button></div></form></dialog>
    <dialog class="output-dialog output-cost-dialog" aria-labelledby="output-cost-title"><form data-output-history-cost-form><p class="context">Histórico da saída</p><h2 id="output-cost-title">Informar custo real</h2><p data-output-cost-context></p><div data-output-history-cost-fields></div><p class="output-help">O custo fica registrado nesta saída e não altera o preço de venda da peça.</p><div class="output-actions"><button type="button" class="button ghost" data-output-cost-back>Voltar</button><button class="button primary">Salvar custos</button></div></form></dialog>`;
  const form = workspace.querySelector('.output-form');
  const field = name => form.elements.namedItem(name);
  const find = selector => workspace.querySelector(selector);
  const today = new Date().toLocaleDateString('en-CA');
  field('date').value = today;
  const products = [
    { sku: '120060', name: 'Argola Duas Linhas Cravejadas', price: 72, cost: 2400, stock: 4 },
    { sku: '451109', name: 'Pulseira Medalha Salmo', price: 136, cost: 5200, stock: 3 },
    { sku: '220018-16', name: 'Anel Coração · aro 16', price: 89, cost: null, stock: 2 },
    { sku: '220018-18', name: 'Anel Coração · aro 18', price: 89, cost: 3100, stock: 1 },
  ];
  const cart = new Map();
  const costs = new Map();
  const expanded = new Set();
  const sampleItem = (index, qty) => ({ ...products[index], qty });
  const records = [
    { id: 1, time: '14:32', reason: 'Brinde', destination: 'Juliana Andrade', channel: 'Balcão', note: 'Presente de aniversário para uma cliente da loja.', items: [sampleItem(0, 1), sampleItem(1, 1)] },
    { id: 2, time: '13:10', reason: 'Sorteio', destination: 'Campanha Primavera', channel: 'Instagram', note: 'Kit entregue à ganhadora da campanha de primavera.', items: [sampleItem(0, 2), sampleItem(1, 1)] },
    { id: 3, time: '11:15', reason: 'Uso próprio', destination: 'Produção de conteúdo', channel: 'Uso interno', note: 'Anel destinado ao uso da equipe nas fotos da coleção.', items: [sampleItem(2, 1)] },
    { id: 4, time: '10:05', reason: 'Perda', destination: 'Mostruário da loja', channel: 'Uso interno', note: 'Fecho danificado, sem possibilidade de reparo. Peça retirada do disponível.', items: [sampleItem(1, 1)] },
    { id: 5, time: '09:20', reason: 'Brinde', destination: 'Mariana Souza', channel: 'WhatsApp', note: 'Mimo enviado junto ao pedido da cliente.', items: [sampleItem(0, 1)] },
    { id: 6, time: '08:45', reason: 'Uso próprio', destination: 'Equipe da loja', channel: 'Uso interno', note: 'Peça separada para apresentação da coleção.', reversed: 'Separação cancelada; peça devolvida ao estoque.', items: [sampleItem(3, 1)] },
  ].map(record => ({ ...record, date: today, count: record.items.reduce((sum, item) => sum + item.qty, 0), example: true }));
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const reference = record => record.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const financial = items => ({
    cents: items.reduce((sum, item) => sum + (item.cost === null ? 0 : item.cost * item.qty), 0),
    missing: items.filter(item => item.cost === null).reduce((sum, item) => sum + item.qty, 0),
  });
  const costLabel = items => {
    const total = financial(items);
    if (total.missing === items.reduce((sum, item) => sum + item.qty, 0) && total.missing) return 'Não informado';
    return `${money(total.cents / 100)}${total.missing ? ' · parcial' : ''}`;
  };
  const draftItems = () => [...cart].map(([sku, qty]) => ({ ...products.find(item => item.sku === sku), qty, cost: costs.get(sku) ?? null }));
  const reasonClass = reason => ({ 'Brinde': 'gift', 'Uso próprio': 'personal', 'Perda': 'loss', 'Sorteio': 'prize' }[reason]);
  let pending = null;
  let reverseId = null;
  let costRecordId = null;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const count = () => [...cart.values()].reduce((sum, qty) => sum + qty, 0);
  const feedback = message => { find('[data-output-feedback]').textContent = message; };
  function render() {
    find('[data-output-total]').textContent = `${count()} peças`;
    find('[data-output-cart]').innerHTML = cart.size ? [...cart].map(([sku, qty]) => {
      const product = products.find(item => item.sku === sku);
      return `<article class="output-item"><div><strong>${product.name}</strong><small>SKU ${sku} · ${product.stock} disponíveis</small></div><label class="output-field output-unit-cost">Custo unitário (R$)<input type="number" min="0" max="1000000" step="0.01" inputmode="decimal" data-output-cost="${sku}" aria-label="Custo unitário de ${product.name}" value="${costs.get(sku) == null ? '' : (costs.get(sku) / 100).toFixed(2)}" placeholder="Não informado"><small>Só para esta saída</small></label><div class="output-quantity"><button type="button" data-output-change="${sku}" data-delta="-1" aria-label="Diminuir ${product.name}" ${qty === 1 ? 'disabled' : ''}>−</button><output>${qty}</output><button type="button" data-output-change="${sku}" data-delta="1" aria-label="Aumentar ${product.name}" ${qty >= product.stock ? 'disabled' : ''}>+</button></div><div class="output-item-cost"><small>Custo total</small><strong data-output-item-cost="${sku}"></strong></div><button class="button ghost" type="button" data-output-remove="${sku}" aria-label="Remover ${product.name}">Remover</button></article>`;
    }).join('') : '<p class="output-empty">Busque uma peça para começar.<br><small>Escolha a variação exata quando houver aro ou tamanho.</small></p>';
    updateCostTotals();
    renderResults();
  }
  function renderResults() {
    const query = find('[data-output-search]').value.trim().toLocaleLowerCase('pt-BR');
    const matches = products.filter(item => `${item.name} ${item.sku}`.toLocaleLowerCase('pt-BR').includes(query));
    find('[data-output-results]').innerHTML = !query ? '' : matches.length ? matches.map(item => `<button type="button" data-output-add="${item.sku}" ${item.stock <= (cart.get(item.sku) || 0) ? 'disabled' : ''}><strong>${item.name}</strong><small>SKU ${item.sku} · ${item.stock} disponíveis</small><span>Adicionar</span></button>`).join('') : '<p>Nenhuma peça encontrada. Confira o nome ou SKU.</p>';
  }
  function updateCostTotals() {
    const items = draftItems();
    items.forEach(item => { find(`[data-output-item-cost="${item.sku}"]`).textContent = costLabel([item]); });
    const total = financial(items);
    find('[data-output-cost-total]').textContent = items.length ? `Custo real: ${costLabel(items)}${total.missing ? ` · ${total.missing} peça(s) sem custo` : ''}` : 'Custo real: —';
  }
  function detailsMarkup(record) {
    const hasMissingCost = record.items.some(item => item.cost === null);
    return `<div class="inline-sale-detail output-inline-detail"><div class="inline-sale-piece"><span class="compact-label">Peças retiradas</span><ul class="compact-sale-items">${record.items.map(item => `<li><span class="jewel">◇</span><div><b>${escape(item.name)}</b><small>SKU ${escape(item.sku)} · ${item.qty} peça${item.qty > 1 ? 's' : ''} · custo ${item.cost === null ? 'não informado' : money(item.cost / 100)}</small></div></li>`).join('')}</ul></div><dl class="inline-sale-values"><div><dt>Custo real</dt><dd>${costLabel(record.items)}</dd><button type="button" class="output-history-cost-action" data-output-open-cost="${record.id}">${hasMissingCost ? 'Informar custo' : 'Editar custo'}</button></div><div><dt>Preço de venda</dt><dd>${money(reference(record))}</dd></div><div><dt>Destino</dt><dd class="output-destination-value">${escape(record.destination || 'Não informado')}</dd></div></dl><div class="inline-sale-action"><span class="tag ${reasonClass(record.reason) === 'gift' ? 'rose' : reasonClass(record.reason) === 'personal' ? 'blue' : 'amber'}">${escape(record.reason)}</span><small>${escape(record.channel)}</small>${record.reversed ? '<span class="status neutral">Estornada</span>' : `<button type="button" class="button ghost" data-output-reverse="${record.id}">Estornar</button>`}</div><p class="output-detail-note"><strong>Explicação</strong><br>${escape(record.note)}${record.reversed ? `<br><strong>Motivo do estorno:</strong> ${escape(record.reversed)}` : ''}</p></div>`;
  }
  function history() {
    const filter = find('[data-output-filter]').value;
    const from = find('[data-output-from]').value;
    const to = find('[data-output-to]').value;
    const state = find('[data-output-state]').value;
    const visible = records.filter(record => (!filter || record.reason === filter) && (!from || record.date >= from) && (!to || record.date <= to) && (!state || (state === 'reversed' ? record.reversed : !record.reversed)));
    const allItems = visible.flatMap(record => record.items);
    const reversedItems = visible.filter(record => record.reversed).flatMap(record => record.items);
    const netItems = visible.filter(record => !record.reversed).flatMap(record => record.items);
    const missing = financial(allItems).missing;
    const reasonStats = ['Brinde', 'Uso próprio', 'Perda', 'Sorteio'].map(reason => {
      const items = visible.filter(record => record.reason === reason && !record.reversed).flatMap(record => record.items);
      return { reason, items, pieces: items.reduce((sum, item) => sum + item.qty, 0), cents: financial(items).cents };
    });
    const maxReasonCost = Math.max(1, ...reasonStats.map(item => item.cents));
    const strongest = reasonStats.reduce((best, item) => item.cents > best.cents ? item : best, reasonStats[0]);
    const netPieces = netItems.reduce((sum, item) => sum + item.qty, 0);
    find('[data-output-overview]').innerHTML = `<div class="metric-row monthly-metrics output-metrics"><article><span>Custo líquido</span><strong data-output-net>${costLabel(netItems)}</strong><small>saídas menos estornos</small></article><article><span>Peças retiradas</span><strong>${allItems.reduce((sum, item) => sum + item.qty, 0)}</strong><small>no período selecionado</small></article><article><span>Custo estornado</span><strong data-output-reversed-total>${costLabel(reversedItems)}</strong><small>devolvido ao estoque</small></article><article><span>Custo das saídas</span><strong data-output-gross>${costLabel(allItems)}</strong><small>antes dos estornos</small></article></div>${missing ? `<p class="pending-rule output-missing-cost" role="status">${missing} peça(s) sem custo informado. Os totais marcados como parciais somam apenas os custos conhecidos.</p>` : ''}<div class="month-grid faithful output-analysis-grid"><section><h3>Custo por motivo</h3><ul class="bars month-bars">${reasonStats.map(item => `<li><span>${item.reason}</span><i><b style="width:${Math.round(item.cents / maxReasonCost * 100)}%"></b></i><strong>${item.cents ? money(item.cents / 100) : '—'}</strong></li>`).join('')}</ul></section><section><h3>Destaques do período</h3><dl class="highlights"><div><dt>Maior custo</dt><dd>${strongest.cents ? strongest.reason : '—'}</dd></div><div><dt>Custo por peça</dt><dd>${netPieces ? money(financial(netItems).cents / 100 / netPieces) : '—'}</dd></div><div><dt>Sem custo informado</dt><dd>${financial(netItems).missing}</dd></div></dl></section></div>`;
    find('[data-output-history-count]').textContent = `${visible.length} registros · ${visible.filter(record => record.reversed).length} estornados`;
    find('[data-output-history]').innerHTML = visible.length ? `<section class="month-sales output-sales-list"><h3>Saídas do período</h3><div class="table-wrap"><table class="output-table"><thead><tr><th>Data</th><th>Destino</th><th>Motivo</th><th>Peças</th><th>Custo real</th><th>Situação</th><th aria-label="Ações"></th></tr></thead><tbody>${visible.map(record => `<tr class="sale-row output-record ${record.reversed ? 'is-reversed' : ''} ${expanded.has(record.id) ? 'expanded' : ''}" tabindex="0" aria-expanded="${expanded.has(record.id)}" data-record-id="${record.id}"><td data-label="Data"><strong>${record.date.split('-').reverse().join('/')}</strong><small>${escape(record.time || 'Agora')}</small></td><td data-label="Destino"><strong>${escape(record.destination || 'Destino não informado')}</strong><small>${escape(record.channel)}</small></td><td data-label="Motivo"><span class="output-reason ${reasonClass(record.reason)}">${escape(record.reason)}</span></td><td data-label="Peças">${record.count}<small>${record.items.length} ${record.items.length === 1 ? 'item' : 'itens'}</small></td><td data-label="Custo real" class="output-reference">${costLabel(record.items)}</td><td data-label="Situação"><span class="status ${record.reversed ? 'neutral' : 'paid'}">${record.reversed ? 'Estornada' : 'Concluída'}</span></td><td class="output-detail-cell"><button type="button" class="sale-open" data-output-expand="${record.id}" aria-label="${expanded.has(record.id) ? 'Recolher' : 'Expandir'} detalhes da saída">${expanded.has(record.id) ? '⌃' : '›'}</button></td></tr><tr class="sale-detail-row output-expanded-row" id="output-detail-${record.id}" ${expanded.has(record.id) ? '' : 'hidden'}><td colspan="7">${detailsMarkup(record)}</td></tr>`).join('')}</tbody></table></div></section>` : '<p class="output-empty">Nenhuma saída neste recorte.</p>';
  }
  choice.addEventListener('click', () => {
    activateLaunchChoice(choice);
    screen.querySelector('[data-launch-workspace]').hidden = true;
    screen.querySelector('[data-collar-workspace]').hidden = true;
    screen.querySelector('[data-launch-success]').hidden = true;
    workspace.hidden = false;
    screen.querySelector('.today-sales').hidden = true;
    screen.querySelector('.draft-tools').hidden = true;
    screen.querySelector('#launch-title + p').textContent = 'Escolha as peças e explique a saída, sem gerar faturamento.';
  });
  picker.querySelectorAll('[data-launch-type]').forEach(button => button.addEventListener('click', () => {
    workspace.hidden = true;
    screen.querySelector('.today-sales').hidden = false;
    screen.querySelector('.draft-tools').hidden = false;
    screen.querySelector('#launch-title + p').textContent = 'Adicione as peças, identifique a cliente e registre como o valor será recebido.';
  }));
  find('[data-output-search]').addEventListener('input', renderResults);
  ['[data-output-filter]', '[data-output-from]', '[data-output-to]', '[data-output-state]'].forEach(selector => find(selector).addEventListener('change', history));
  workspace.querySelectorAll('[data-output-period]').forEach(button => button.addEventListener('click', () => {
    workspace.querySelectorAll('[data-output-period]').forEach(item => item.classList.toggle('active', item === button));
    const days = button.dataset.outputPeriod === '30d' ? 30 : button.dataset.outputPeriod === '7d' ? 7 : null;
    find('[data-output-to]').value = '';
    find('[data-output-from]').value = days ? new Date(Date.now() - (days - 1) * 86400000).toLocaleDateString('en-CA') : '';
    history();
  }));
  workspace.addEventListener('input', event => {
    const sku = event.target.dataset.outputCost;
    if (!sku) return;
    const raw = event.target.value;
    costs.set(sku, raw === '' || !event.target.validity.valid ? null : Math.round(Number(raw) * 100));
    updateCostTotals();
  });
  workspace.addEventListener('click', event => {
    const button = event.target.closest('button');
    const expandButton = button?.dataset.outputExpand ? button : event.target.closest('.output-record')?.querySelector('[data-output-expand]');
    if (expandButton) {
      const id = Number(expandButton.dataset.outputExpand);
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      const row = find(`#output-detail-${id}`);
      row.hidden = !expanded.has(id);
      const recordRow = find(`[data-record-id="${id}"]`);
      recordRow.classList.toggle('expanded', expanded.has(id));
      recordRow.setAttribute('aria-expanded', String(expanded.has(id)));
      expandButton.setAttribute('aria-expanded', String(expanded.has(id)));
      expandButton.setAttribute('aria-label', `${expanded.has(id) ? 'Recolher' : 'Expandir'} detalhes da saída`);
      expandButton.textContent = expanded.has(id) ? '⌃' : '›';
    }
    if (!button) return;
    const sku = button.dataset.outputAdd || button.dataset.outputChange;
    if (sku) {
      const product = products.find(item => item.sku === sku);
      if (!cart.has(sku)) costs.set(sku, product.cost);
      cart.set(sku, Math.max(1, Math.min(product.stock, (cart.get(sku) || 0) + Number(button.dataset.delta || 1))));
      feedback(''); render();
    }
    if (button.dataset.outputRemove) { cart.delete(button.dataset.outputRemove); costs.delete(button.dataset.outputRemove); render(); }
    if (button.dataset.outputReverse) {
      reverseId = Number(button.dataset.outputReverse);
      find('[data-output-reverse-form]').reset();
      find('[aria-labelledby="output-reverse-title"]').showModal();
    }
    if (button.dataset.outputOpenCost) {
      costRecordId = Number(button.dataset.outputOpenCost);
      const record = records.find(item => item.id === costRecordId);
      find('[data-output-cost-context]').textContent = `${record.reason} para ${record.destination || 'destino não informado'} · ${record.date.split('-').reverse().join('/')}`;
      find('[data-output-history-cost-fields]').innerHTML = record.items.map((item, index) => `<div class="output-history-cost-row"><div><strong>${escape(item.name)}</strong><small>SKU ${escape(item.sku)} · ${item.qty} peça${item.qty > 1 ? 's' : ''}</small></div><label class="output-field">Custo unitário (R$)<input type="number" min="0" max="1000000" step="0.01" inputmode="decimal" required data-output-history-cost-index="${index}" value="${item.cost === null ? '' : (item.cost / 100).toFixed(2)}" placeholder="0,00"></label></div>`).join('');
      find('[aria-labelledby="output-cost-title"]').showModal();
      requestAnimationFrame(() => find('[data-output-history-cost-index]').focus());
    }
  });
  workspace.addEventListener('keydown', event => {
    const row = event.target.closest('.output-record');
    if (!row || event.target !== row || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    row.querySelector('[data-output-expand]').click();
  });
  const review = find('[aria-labelledby="output-review-title"]');
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!cart.size) { feedback('Adicione pelo menos uma peça.'); find('[data-output-search]').focus(); return; }
    if (!field('note').value.trim()) { feedback('Explique o motivo da saída.'); field('note').focus(); return; }
    pending = { id: records.length + 1, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), reason: field('reason').value, destination: field('destination').value.trim(), date: field('date').value, channel: field('channel').value, note: field('note').value.trim(), count: count(), items: draftItems() };
    find('[data-output-review]').innerHTML = `<p><strong>${escape(pending.reason)} · ${pending.count} peças</strong></p><ul>${pending.items.map(item => `<li>${item.qty} × ${item.name} · custo ${costLabel([item])}</li>`).join('')}</ul><p>${escape(pending.destination || 'Destino não informado')} · ${escape(pending.date)} · ${escape(pending.channel)}</p><p>${escape(pending.note)}</p><p><strong>Custo real: ${costLabel(pending.items)}</strong></p><p>Saída de ${pending.count} peças do disponível. Sem receita e sem valor a receber.</p>`;
    review.showModal();
  });
  find('[data-output-back]').addEventListener('click', () => review.close());
  find('[data-output-confirm]').addEventListener('click', () => {
    if (!pending || !review.open) return;
    pending.items.forEach(item => { products.find(product => product.sku === item.sku).stock -= item.qty; });
    records.unshift(pending); pending = null; cart.clear(); costs.clear(); form.reset(); field('date').value = today;
    review.close(); render(); history(); feedback('Saída simulada. Nenhum dado real foi gravado.');
  });
  const reversal = find('[aria-labelledby="output-reverse-title"]');
  find('[data-output-reverse-back]').addEventListener('click', () => reversal.close());
  find('[data-output-reverse-form]').addEventListener('submit', event => {
    event.preventDefault();
    const note = event.target.elements.explanation.value.trim();
    if (!note) return;
    const record = records.find(item => item.id === reverseId);
    if (!record || record.reversed) return;
    record.reversed = note;
    if (!record.example) record.items.forEach(item => { products.find(product => product.sku === item.sku).stock += item.qty; });
    reversal.close(); history(); render(); feedback('Estorno simulado. Registro original preservado.');
  });
  const costDialog = find('[aria-labelledby="output-cost-title"]');
  find('[data-output-cost-back]').addEventListener('click', () => costDialog.close());
  find('[data-output-history-cost-form]').addEventListener('submit', event => {
    event.preventDefault();
    const record = records.find(item => item.id === costRecordId);
    if (!record) return;
    event.target.querySelectorAll('[data-output-history-cost-index]').forEach(input => {
      record.items[Number(input.dataset.outputHistoryCostIndex)].cost = Math.round(Number(input.value) * 100);
    });
    costDialog.close();
    history();
    feedback('Custos atualizados nesta saída. Totais do histórico recalculados.');
  });
  render(); history();
  if (location.hash === '#saida') {
    activateScreen('lancamentos');
    choice.click();
  }
})();
