document.querySelectorAll('[data-href]').forEach((button)=>button.addEventListener('click',()=>location.href=button.dataset.href));
const tabs=[...document.querySelectorAll('[data-cloud-tab]')];const views=[...document.querySelectorAll('[data-cloud-view]')];function openView(name){tabs.forEach((tab)=>tab.classList.toggle('active',tab.dataset.cloudTab===name));views.forEach((view)=>view.hidden=view.dataset.cloudView!==name);scrollTo({top:0,behavior:'smooth'})}tabs.forEach((tab)=>tab.addEventListener('click',()=>openView(tab.dataset.cloudTab)));document.querySelector('[data-open-pending]').addEventListener('click',()=>openView('pending'));
document.querySelectorAll('[data-filter]').forEach((button)=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach((item)=>item.classList.toggle('active',item===button));const kind=button.dataset.filter;let shown=0;document.querySelectorAll('.pending-list article').forEach((item)=>{item.hidden=kind!=='all'&&item.dataset.kind!==kind;if(!item.hidden)shown++});document.querySelector('.pending-empty').hidden=shown>0}));
const dialog=document.querySelector('[data-cloud-dialog]');const details={duplicate:['SKU duplicado em dois anúncios','O estoque foi preservado porque o mesmo código aparece em produtos diferentes.','Remover a duplicidade na loja e rodar uma nova análise seca.'],variant:['Variante sem vínculo exato','Há saldo no aro 16, mas nenhum variant_id confirmado para receber esse número.','Nunca casar variante por nome e nunca dividir saldo automaticamente.']};document.querySelectorAll('[data-detail]').forEach((button)=>button.addEventListener('click',()=>{const data=details[button.dataset.detail];dialog.querySelector('[data-dialog-title]').textContent=data[0];dialog.querySelector('[data-dialog-copy]').textContent=data[1];dialog.querySelector('[data-dialog-rule]').textContent=data[2];dialog.showModal()}));
document.querySelectorAll('[data-run-analysis]').forEach((button)=>button.addEventListener('click',()=>{openView('analysis');document.querySelector('[data-analysis-empty]').hidden=true;document.querySelector('[data-analysis-result]').hidden=false;const toast=document.querySelector('[data-cloud-toast]');toast.textContent='Análise seca concluída · nenhuma escrita realizada';toast.hidden=false;setTimeout(()=>toast.hidden=true,2600)}));

// Operational read-only sample, isolated from the real integration.
(() => {
 const products=[
  {name:'Argola Duas Linhas Cravejadas',sku:'120066',category:'Brincos',price:119,home:3,site:1,state:'divergent'},
  {name:'Pulseira Pérolas e Coração',sku:'337421',category:'Pulseiras',price:149,home:6,site:6,state:'ok'},
  {name:'Colar Coração Delicado',sku:'220018',category:'Colares',price:99,home:3,site:4,state:'divergent'},
  {name:'Anel Aurora · aro 16',sku:'451109',category:'Anéis',price:89,home:4,site:null,state:'hidden'},
  {name:'Brinco Libélula Colorida',sku:'132721',category:'Infantil',price:89,home:5,site:null,state:'absent'}
 ];
 const states={ok:'Publicado',divergent:'Estoque divergente',hidden:'Oculto',absent:'Não publicado'};
 const search=document.querySelector('[data-store-search]'),filter=document.querySelector('[data-store-status]');
 function render(){
  const term=search.value.toLowerCase().trim();const visible=products.filter(p=>(filter.value==='all'||p.state===filter.value)&&(p.name+' '+p.sku).toLowerCase().includes(term));
  document.querySelector('[data-store-products]').innerHTML=visible.map(p=>`<article class="store-table-row"><div><span class="store-photo" aria-label="Foto não disponível no exemplo">◇</span><span><b>${p.name}</b><small>SKU ${p.sku} · ${p.category}</small></span></div><span data-label="Preço">${p.price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span><span data-label="Em casa">${p.home} peças</span><span data-label="Na loja">${p.site===null?'Não informado':p.site+' peças'}</span><span><em class="status ${p.state==='ok'?'paid':'receivable'}">${states[p.state]}</em></span><a href="${p.state==='absent'?'publicar.html':p.state==='ok'?'../catalogo/master.html':'#pending'}">${p.state==='absent'?'Preparar':p.state==='ok'?'Ver cadastro':'Revisar'} →</a></article>`).join('');
  document.querySelector('[data-store-count]').textContent=visible.length+' produtos';document.querySelector('[data-store-empty]').hidden=visible.length>0;
 }
 search.oninput=render;filter.onchange=render;render();
})();
