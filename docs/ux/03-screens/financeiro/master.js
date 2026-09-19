(async () => {
await window.MarquesaDemo.ready;
const demo=window.MarquesaDemo;
const qs=(s,r=document)=>r.querySelector(s),qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const money=n=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),date=s=>s.split('-').reverse().join('/');
const today=new Date().toLocaleDateString('sv-SE');
const views=qsa('[data-finance-view]'),tabs=qsa('[data-finance-tab]'),dialog=qs('[data-receipt-dialog]'),toast=qs('[data-finance-toast]');
let mode='new',selected='camila',filter='all';
const accounts=demo.get('accounts',{});
let rows=[];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(text){toast.textContent=text;toast.hidden=false;clearTimeout(notice.t);notice.t=setTimeout(()=>toast.hidden=true,3200)}
function showView(name){views.forEach(v=>v.hidden=v.dataset.financeView!==name);tabs.forEach(t=>t.classList.toggle('active',t.dataset.financeTab===name));scrollTo({top:0,behavior:'smooth'})}
function state(a){return a.total-a.paid<.005?'Pago':a.paid?'Parcial':'A receber'}
function statusClass(a){return a.total-a.paid<.005?'paid':a.paid?'partial':'receivable'}
function render(){
 qsa('[data-account]').forEach(r=>r.remove());
 for(const [id,a] of Object.entries(accounts)){
   const row=document.createElement('button');row.type='button';row.className='account-row';row.dataset.account=id;row.dataset.search=(a.name+' '+a.sale).toLowerCase();
   const client=demo.get('clients',[]).find(c=>c.id===a.clientId);
   row.innerHTML=`<span><b>${escape(a.name)}</b><small>${escape(client?.phone||'')}</small></span><span>${escape(a.sale)}</span><span></span><span>${money(a.total)}</span><span></span><span></span><em></em>`;
   row.onclick=()=>selectAccount(id);qs('.account-list').append(row);
 }
 rows=qsa('[data-account]');
 rows.forEach(r=>{const a=accounts[r.dataset.account];r.children[2].innerHTML=`${(a.due?date(a.due):'Não informado')}<small>${a.due===today?'vence hoje':a.due<today?'em atraso':'a vencer'}</small>`;r.children[4].textContent=money(a.paid);r.children[5].textContent=money(a.total-a.paid);r.children[6].textContent=state(a);r.children[6].className='status '+statusClass(a);const term=qs('[data-finance-search]').value.trim().toLowerCase();r.hidden=!r.dataset.search.includes(term)||(filter==='today'&&a.due!==today)||(filter==='late'&&!(a.due<today&&a.paid<a.total));});
 qs('[data-finance-empty]').hidden=rows.some(r=>!r.hidden);
 const events=Object.values(accounts).flatMap(a=>a.events.map(e=>({...e,client:a.name,sale:a.sale}))).sort((a,b)=>b.date.localeCompare(a.date));
 qs('.simple-events').innerHTML=events.filter(e=>!e.correction).map(e=>`<article><span>${date(e.date)}<small>data do pagamento</small></span><b>${escape(e.client)}<small>${e.sale}</small></b><span>${escape(e.method)}</span><strong>${money(e.value)}</strong><em class="status paid">Pago</em></article>`).join('');
 qs('.audit-list').innerHTML=events.map(e=>`<article><span>${date(e.date)} · pagamento</span><div><b>${e.correction?'Forma ou data corrigida':'Recebimento registrado'}</b><small>${escape(e.client)} · ${escape(e.method)}${e.reason?' · '+escape(e.reason):''}</small></div><strong>${money(e.value)}</strong></article>`).join('');

 const values=Object.values(accounts),open=values.reduce((n,a)=>n+a.total-a.paid,0),received=values.reduce((n,a)=>n+a.paid,0);
 qs('[data-total-open]').textContent=money(open);qs('[data-month-received]').textContent=money(received);qs('[data-open-clients]').textContent=values.filter(a=>a.paid<a.total).length;
 const metrics=qsa('.finance-metrics article');qs('small',metrics[0]).textContent=values.filter(a=>a.paid<a.total).length+' clientes';qs('strong',metrics[1]).textContent=money(values.filter(a=>a.due===today).reduce((n,a)=>n+a.total-a.paid,0));qs('small',metrics[1]).textContent='saldo com vencimento hoje';qs('strong',metrics[2]).textContent=money(values.filter(a=>a.due<today).reduce((n,a)=>n+a.total-a.paid,0));qs('small',metrics[2]).textContent='saldo vencido';
}
function selectAccount(id){selected=id;rows.forEach(r=>r.classList.toggle('active',r.dataset.account===id));const a=accounts[id];qs('[data-detail-client]').textContent=a.name;qs('[data-detail-sale]').textContent=a.sale;qs('[data-detail-total]').textContent=money(a.total);qs('[data-detail-paid]').textContent=money(a.paid);qs('[data-detail-open]').textContent=money(a.total-a.paid);qs('[data-detail-status]').textContent=state(a);qs('[data-detail-status]').className='status '+statusClass(a);qs('[data-dialog-open]').textContent=money(a.total-a.paid);qs('[data-new-receipt]').disabled=a.paid>=a.total;qs('[data-correct-receipt]').disabled=!a.events.length;
 qs('[data-event-list]').innerHTML=a.events.map(e=>`<article><span>${e.correction?'Correção':'Recebido'}</span><div><b>${escape(e.method)} · ${money(e.value)}</b><small>Data efetiva ${date(e.date)}${e.correction?' · registro anterior preservado':''}</small>${e.reason?`<small>Motivo: ${escape(e.reason)}</small>`:''}</div><em class="status paid">${e.correction?'Auditado':'Pago'}</em></article>`).join('')||`<article class="pending"><span>A receber</span><div><b>${money(a.total-a.paid)}</b><small>Vencimento ${(a.due?date(a.due):'Não informado')}</small></div><em class="status receivable">Pendente</em></article>`;
}
function openDialog(nextMode){mode=nextMode;const a=accounts[selected],correction=mode==='correct',event=a.events.at(-1);qs('[data-dialog-context]').textContent=correction?'Correção auditável':'Novo recebimento';qs('[data-dialog-title]').textContent=correction?'Corrigir último recebimento':'Registrar recebimento';qs('[data-correction-reason]').hidden=!correction;qs('[data-receipt-value]').value=correction?event.value:(a.total-a.paid).toFixed(2);qs('[data-receipt-value]').readOnly=correction;qs('[data-receipt-date]').value=correction?event.date:today;qs('[data-receipt-date]').max=today;qs('[data-correction-reason] textarea').value='';qs('[data-receipt-error]').textContent='';dialog.showModal()}
const feedback=document.createElement('p');feedback.dataset.receiptError='';feedback.setAttribute('role','alert');feedback.style.color='var(--wine-700)';qs('.dialog-actions',dialog).before(feedback);
tabs.forEach(t=>t.addEventListener('click',()=>showView(t.dataset.financeTab)));rows.forEach(r=>r.addEventListener('click',()=>selectAccount(r.dataset.account)));qs('[data-finance-search]').oninput=render;
qsa('.finance-tools button').forEach((b,i)=>b.onclick=()=>{filter=['all','today','late'][i];qsa('.finance-tools button').forEach(x=>x.classList.toggle('active',x===b));render()});
qs('[data-new-receipt]').onclick=()=>openDialog('new');qs('[data-correct-receipt]').onclick=()=>openDialog('correct');
qs('[data-save-receipt]').onclick=async()=>{
 const a=accounts[selected],value=Number(qs('[data-receipt-value]').value),method=qs('[data-receipt-method]').value,effective=qs('[data-receipt-date]').value,reason=qs('[data-correction-reason] textarea').value.trim();
 if(!Number.isFinite(value)||value<=0||!effective||effective>today){feedback.textContent='Informe um valor positivo e a data real do pagamento, até hoje.';return}
 if(mode==='new'&&value>a.total-a.paid+.005){feedback.textContent='O valor ultrapassa o saldo. Ajuste o recebimento; crédito não é gerado nesta demonstração.';return}
 if(mode==='correct'&&!reason){feedback.textContent='Explique o motivo da correção.';return}
 if(mode==='new'){a.paid=Math.round((a.paid+value)*100)/100;a.events.push({id:crypto.randomUUID(),value,method,date:effective});notice('Recebimento demonstrativo registrado. Estoque preservado.')}else{a.events.push({id:crypto.randomUUID(),value,method,date:effective,reason,correction:true});notice('Correção demonstrativa registrada sem apagar o histórico.')}
 const sales=demo.get('sales',[]),sale=sales.find(s=>s.id===a.saleId);if(sale)sale.paid=a.paid;
 await demo.setMany({accounts,sales});
 render();selectAccount(selected);dialog.close();
};
qsa('[data-href]').forEach(b=>b.addEventListener('click',()=>location.href=b.dataset.href));
const requested=new URLSearchParams(location.search).get('cliente');render();selectAccount(accounts[requested]?requested:Object.keys(accounts).find(id=>accounts[id].clientId===requested&&accounts[id].paid<accounts[id].total)||'camila');
if(location.hash==='#receipts')showView('receipts');
})();
