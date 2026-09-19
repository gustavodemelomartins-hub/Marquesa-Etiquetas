/* Local demonstrative state for operational modules. No network transport. */
(() => {
  async function boot(){
    const store=window.MarquesaDemo;if(!store)return;await store.ready;
    const page=window.__MARQUESA_PROTOTYPE__;
    const source=page?.source||location.pathname;
    const mod=source.split('/').slice(-2)[0];
    const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
    const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
    const panel=(selector,title)=>{const parent=$(selector);if(!parent)return null;let el=parent.querySelector('[data-demo-records]');if(!el){el=document.createElement('section');el.className='data-section demo-records';el.dataset.demoRecords='';el.append(text('h2',title));parent.append(el);}return el;};
    const listen=(selector,fn)=>$$(selector).forEach(el=>el.addEventListener('click',fn));
    const showRows=(el,records,format)=>{if(!el)return;el.querySelectorAll('article').forEach(x=>x.remove());for(const r of records){const row=text('article',format(r));el.append(row);}};
    const formValues=(selector)=>$$(selector+' input,'+selector+' textarea,'+selector+' select').map(el=>({value:el.value,checked:el.checked}));
    const putValues=(selector,values=[])=>$$(selector+' input,'+selector+' textarea,'+selector+' select').forEach((el,i)=>{if(values[i]){el.value=values[i].value;el.checked=values[i].checked;}});
    if(mod==='dashboard'){
      const render=()=>showRows(panel('[data-home-view="calendar"]','Compromissos adicionados'),store.get('agenda.events',[]),r=>`${r.title} · ${r.date.split('-').reverse().join('/')} ${r.time} · ${r.repeat}${r.notes?' · '+r.notes:''}`);
      render();listen('[data-save-event]',async()=>{const v=formValues('[data-new-event-dialog]');if(!v[0]?.value.trim()||!v[1]?.value){$('[data-new-event-dialog]').showModal();return;}const rows=store.get('agenda.events',[]);rows.push({id:crypto.randomUUID(),title:v[0].value,date:v[1].value,time:v[2].value,repeat:v[3].value,notes:v[4].value});await store.set('agenda.events',rows);render();});
      const sales=store.get('sales',[]);if(sales.length){const activity=panel('[data-home-view="today"]','Vendas da demonstração');showRows(activity,sales.filter(s=>s.id?.startsWith('demo-')),s=>`${s.customer} · ${Number(s.total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · ${s.due>0?'A receber':'Pago'}`);}
    }
    if(mod==='configuracoes'){
      for(const [view,button] of [['profile','[data-save-profile]'],['preferences','[data-save-preferences]']]){
        const selector=`[data-settings-view="${view}"]`;putValues(selector,store.get('settings.'+view,[]));listen(button,()=>store.set('settings.'+view,formValues(selector)));
      }
      const connection=$('[data-settings-view="connection"]');if(connection){connection.querySelector('.connection-status strong').textContent='Demonstração sem conexão externa';connection.querySelector('.connection-status p').textContent='Nenhum servidor ou banco está conectado';connection.querySelector('.connection-status em').textContent='Simulado';connection.querySelectorAll('input').forEach(i=>{i.value=i.type==='password'?'':'Nenhuma API conectada';i.disabled=true;});}
    }
    if(mod==='notificacoes'){
      const read=store.get('notifications.read',false);if(read){$$('.notice-item').forEach(i=>i.classList.remove('unread'));$$('[data-unread-count],[data-tab-count]').forEach(i=>i.textContent='0');}
      listen('[data-mark-all]',()=>store.set('notifications.read',true));
    }
    if(mod==='catalogo'){
      const selector='[data-catalog-view="product"]';putValues(selector,store.get('catalog.productForm',[]));listen('[data-save-product]',()=>store.set('catalog.productForm',formValues(selector)));
    }
    if(mod==='revendedoras'){
      const render=()=>showRows(panel('[data-view="overview"]','Maletas e acertos desta demonstração'),store.get('resellers.operations',[]),r=>r.description);
      render();listen('[data-confirm-case]',async()=>{const v=formValues('[data-create-dialog]'),rows=store.get('resellers.operations',[]);rows.push({id:crypto.randomUUID(),kind:'case',description:`Maleta criada · ${v[0].value} · acerto ${v[1].value} · 40 peças demonstrativas`});await store.set('resellers.operations',rows);render();});
      listen('[data-confirm-settlement]',async()=>{const rows=store.get('resellers.operations',[]);if(!rows.some(r=>r.kind==='settlement'))rows.push({id:'settlement-087',kind:'settlement',description:'Maleta #087 encerrada · 14 vendidas · 28 devolvidas · líquido R$ 970,20'});await store.set('resellers.operations',rows);$('[data-open-settlement]').disabled=true;$('[data-open-settlement]').textContent='Acerto demonstrativo concluído';render();});
      if(store.get('resellers.operations',[]).some(r=>r.kind==='settlement')){$('[data-open-settlement]').disabled=true;$('[data-open-settlement]').textContent='Acerto demonstrativo concluído';}
    }
    if(mod==='reparos'){
      const render=()=>showRows(panel('[data-warranty-view="cases"]')||panel('main','Casos desta demonstração'),store.get('warranty.cases',[]),r=>r.values.map(x=>x.value).filter(Boolean).join(' · '));render();
      listen('[data-prototype-save]',async()=>{const rows=store.get('warranty.cases',[]);rows.push({id:crypto.randomUUID(),values:formValues('[data-warranty-dialog]')});await store.set('warranty.cases',rows);render();});
      // Rows open the already-designed detail surface instead of stopping at the list.
      $$('.case-row[data-case]').forEach(row=>row.addEventListener('click',()=>{$('[data-warranty-tab="detail"]')?.click();}));
    }
    if(mod==='estoque'){
      const state=store.get('inventory.session',null);
      if(state){if(typeof activeSession!=='undefined')activeSession=state.active;if(typeof paused!=='undefined')paused=state.paused;if(typeof showPanel==='function')showPanel(state.panel);if(typeof updateOpenCard==='function')updateOpenCard(state.label,state.copy);if(state.choice){const row=$('.inventory-count-list .count-row:last-child');row.querySelector('small').textContent=state.choice;row.querySelector('.state').textContent=state.comparable?'Contado':'Não comparável';}}
      const save=()=>store.set('inventory.session',{active:typeof activeSession!=='undefined'&&activeSession,paused:typeof paused!=='undefined'&&paused,panel:$$('[data-inventory-panel]').find(x=>!x.hidden)?.dataset.inventoryPanel,label:$('[data-open-label]').textContent,copy:$('[data-open-copy]').textContent,choice:$('.inventory-count-list .count-row:last-child small')?.textContent,comparable:$('.inventory-count-list .count-row:last-child .state')?.textContent==='Contado'});
      listen('[data-confirm-start],[data-pause-inventory],[data-finish-inventory],[data-back-count],[data-apply-adjustments],[data-confirm-variation]',save);
    }
    if(mod==='etiquetas'){
      const rows=$$('[data-label-product]');
      const targets=rows.length?rows:$$('[data-qty]');
      const prior=store.get('labels.queue',[]);targets.forEach((r,i)=>{if(!prior[i])return;r.dataset.qty=prior[i].qty;r.dataset.short=prior[i].short;const q=r.querySelector('[data-qty-value]'),n=r.querySelector('[data-product-label]'),c=r.querySelector('input[type="checkbox"]');if(q)q.textContent=prior[i].qty;if(n)n.textContent=prior[i].short;if(c)c.checked=prior[i].selected;});
      if(typeof sync==='function')sync();if(typeof renderSheet==='function')renderSheet();
      const save=()=>store.set('labels.queue',targets.map(r=>({qty:r.dataset.qty,short:r.dataset.short,selected:r.querySelector('input[type="checkbox"]')?.checked})));
      listen('[data-qty-plus],[data-qty-minus],[data-save-label]',save);targets.forEach(r=>r.addEventListener('change',save));
      const render=()=>showRows(panel('[data-label-view="history"]','Lotes desta demonstração'),store.get('labels.batches',[]),r=>`${r.date} · ${r.count} etiquetas · ${r.kind} · impressão física não confirmada`);render();
      listen('[data-print-labels],[data-generate-pdf]',async e=>{const batches=store.get('labels.batches',[]);batches.push({id:crypto.randomUUID(),date:new Date().toLocaleDateString('pt-BR'),count:targets.reduce((n,r)=>n+(r.querySelector('input[type="checkbox"]')?.checked?Number(r.dataset.qty):0),0),kind:e.currentTarget.hasAttribute('data-print-labels')?'Prévia de impressão':'Prévia de PDF'});await store.set('labels.batches',batches);render();});
    }
    const scenario=new URLSearchParams(location.search).get('state');
    if(['empty','loading','error','partial'].includes(scenario)){
      const main=$('main'),block=document.createElement('section');block.className='data-section demo-scenario';block.setAttribute('role','status');
      const messages={empty:['Nenhum registro neste exemplo','Comece uma nova operação ou volte aos dados de demonstração.'],loading:['Carregando os dados','Exemplo de carregamento. Nenhuma consulta externa está sendo realizada.'],error:['Não foi possível carregar','Seus exemplos continuam preservados. Tente novamente.'],partial:['Informações parciais','Parte dos dados ainda não está disponível. Os valores incompletos não são totais confirmados.']};
      block.append(text('h1',messages[scenario][0]),text('p',messages[scenario][1]));const retry=text('a',scenario==='error'?'Tentar novamente':'Voltar à demonstração');const clean=new URL(location.href);clean.searchParams.delete('state');retry.href=clean.href;retry.className='button primary';block.append(retry);if(scenario==='loading')block.setAttribute('aria-busy','true');main.replaceChildren(block);
    }
    document.documentElement.dataset.demoReady='true';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot().catch(console.error));else boot().catch(console.error);
})();
