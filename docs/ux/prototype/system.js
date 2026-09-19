(() => {
  const script = document.currentScript;
  const base = new URL('../03-screens/', script.src);
  const config=window.__MARQUESA_PROTOTYPE__;
  const url = (path) => {
    if(!config)return new URL(path,base).href;
    const [source,hash]=path.split('#');
    const pages=config.pages.filter(p=>p.source==='03-screens/'+source);
    const target=pages.find(p=>p.view===hash)||pages[0];
    return target?target.path+(hash&&hash!==target.view?'#'+hash:''):new URL(path,base).href;
  };
  const paths = {
    home:'<path d="m3 10 9-7 9 7v10H3Z M9 20v-7h6v7"/>',
    sale:'<path d="M4 4v16h16M7 15l4-5 4 2 5-7"/>',
    person:'<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    box:'<path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10"/>',
    bag:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v3h4v-3"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 6-3 7-3 9h18c0-2-3-3-3-9M10 21h4"/>',
    money:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 9v6M19 9v6"/>',
    card:'<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h4"/>',
    pix:'<path d="m12 2 10 10-10 10L2 12ZM4 10h4l4 4 4-4h4M4 14h4l4-4 4 4h4"/>',
    shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6ZM8 12l3 3 5-6"/>',
    tag:'<path d="M3 3h9l9 9-9 9-9-9Z"/><circle cx="8" cy="8" r="1"/>',
    cloud:'<path d="M7 18a5 5 0 0 1-1-10 7 7 0 0 1 13 2 4 4 0 0 1 0 8ZM12 9v12m-3-3 3 3 3-3"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-3 5 5"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    link:'<path d="M14 3h7v7M21 3 10 14M10 5H3v16h16v-7"/>',
    close:'<path d="m5 5 14 14M19 5 5 19"/>'
  };
  const icon = (name) => `<svg class="v2-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`;
  window.MarquesaUI = { icon, url };
  function boot() {
    document.body.classList.add('v2-system');
    const current = config?config.source.split('/').slice(-2).join('/'):location.pathname.split('/').slice(-2).join('/');
    const nav = [ ['Home','dashboard/master.html','home'], ['Vendas','vendas/master.html#painel','sale'], ['Clientes','vendas/master.html#clientes','person'], ['Financeiro','financeiro/master.html','money'], ['Estoque','estoque/master.html','box'], ['Catálogo','catalogo/master.html','tag'], ['Revendedoras','revendedoras/master.html','bag'], ['Garantias / Reparos','reparos/master.html','shield'], ['Etiquetas','etiquetas/master.html','tag'], ['Nuvemshop','nuvemshop/publicar.html','cloud'], ['Agenda','dashboard/master.html#calendar','clock'], ['Notificações','notificacoes/master.html','bell'], ['Configurações','configuracoes/master.html#preferences','settings'] ];
    const all = [...nav, ['Inventário','estoque/master.html#inventario','check'], ['Maletas e acertos','revendedoras/master.html#maletas','bag'], ['Monte seu Colar','vendas/master.html#colar','tag'], ['Saída sem faturamento','vendas/master.html#saida','box'], ['Produtos na loja','nuvemshop/master.html','cloud'], ['Pendências','nuvemshop/master.html#pending','check'], ['Sincronização','nuvemshop/master.html#analysis','cloud'], ['Perfil','configuracoes/master.html#profile','person'] ];
    const active = (p) => config ? new URL(url(p),location.href).pathname===config.path : p.split('#')[0]===current&&(!p.includes('#')||(location.hash||'#painel')==='#'+p.split('#')[1]);
    const link = ([label,p,name]) => `<a href="${url(p)}" ${active(p)?'aria-current="page"':''}>${icon(name)}<span>${label}</span></a>`;
    let header = document.querySelector('.header-main');
    if(!header){document.body.insertAdjacentHTML('afterbegin','<header class="app-header"><div class="header-main"></div></header>');header=document.querySelector('.header-main');}
    header.className='v2-header-main';
    const hub=config?'/prototype/hub/':new URL('index.html',script.src).href;
    const logo=new URL('../01-brand/logo_sistema-marquesa_preta-transparente.png',script.src);
    header.innerHTML=`<div class="v2-brand-row"><a class="v2-brand" href="${url('dashboard/master.html')}" aria-label="Marquesa — Home"><img src="${logo}" alt="Marquesa Semijoias"></a><div class="v2-tools"><a href="${hub}">Hub de revisão</a><a class="v2-avatar" href="${url('configuracoes/master.html#profile')}" aria-label="Meu perfil">SM</a></div></div><nav class="v2-primary" aria-label="Navegação principal">${nav.map(link).join('')}</nav>`;
    document.querySelector('#profile-menu')?.remove();
    document.querySelector('.hub-header')?.remove();
    document.body.insertAdjacentHTML('beforeend',`<footer class="v2-demo-bar"><span data-demo-storage>Dados demonstrativos · neste navegador</span><a href="${hub}">Pronto para sua revisão</a><button type="button" data-demo-reset>Restaurar demonstração</button></footer>`);
    const store=window.MarquesaDemo;
    if(store){store.ready.then(()=>{document.querySelector('[data-demo-storage]').textContent=store.status.persistent?'Demonstração · alterações salvas neste navegador':'Armazenamento indisponível · alterações apenas nesta sessão';});document.querySelector('[data-demo-reset]').onclick=()=>{if(confirm('Restaurar os exemplos? As alterações desta demonstração serão apagadas neste navegador.'))store.reset();};}
    if(config?.id==='hub'){
      const section=document.createElement('section');section.id='inventory';section.className='v2-route-inventory';
      section.innerHTML='<h2>Todos os destinos</h2><p>Prontos para revisão · nenhuma aprovação visual automática.</p><nav>'+config.pages.map(p=>`<a href="${p.path}">${p.label}</a>`).join('')+config.flows.map(f=>`<a href="${config.pages.find(p=>p.id===f.page).path}#${f.hash}">${f.label}</a>`).join('')+'</nav>';
      document.querySelector('main').append(section);
    }
    // Resolve historical hub shortcuts to their actual module instead of a card in the hub.
    const destinations = Object.fromEntries(all.map(x=>[x[1].split('/')[0],x[1].split('#')[0]]));
    document.querySelectorAll('[data-href], a[href]').forEach(el=>{
      const attr=el.hasAttribute('data-href')?'data-href':'href'; const value=el.getAttribute(attr);
      if(value?.includes('prototype/index.html#')) {const key=value.split('#')[1]; const target=destinations[key] || (key==='garantias'?'reparos/master.html':null);if(target)el.setAttribute(attr,url(target));}
    });
    if(current.startsWith('catalogo/')) {
      document.querySelectorAll('[data-catalog-tab="store"]').forEach(b=>b.addEventListener('click',()=>location.href=url('nuvemshop/publicar.html')));
    }
    if(current.startsWith('estoque/')) {
      const secondary=document.querySelector('.secondary-nav');
      secondary?.insertAdjacentHTML('beforeend',`<a href="${url('estoque/master.html#inventario')}">Inventário</a><a href="${url('nuvemshop/publicar.html')}">Publicar na Nuvemshop</a>`);
    }
    const route = () => {
      const hash=location.hash.slice(1)||(config?.view||'');
      if(current.startsWith('vendas/')) {
        const name=hash==='historico'?'painel':(['saida','colar','nova-venda'].includes(hash)?'lancamentos':hash);
        document.querySelector(`[data-screen="${name}"]`)?.click();
        if(hash==='saida')document.querySelector('[data-launch-screen="saidas"]')?.click();
        if(hash==='colar')document.querySelector('[data-launch-type="collar"]')?.click();
        if(hash==='nova-venda')document.querySelector('[data-launch-type="sale"]')?.click();
      } else if(hash==='inventario') {
        document.querySelector('[data-inventory-tab="open"]')?.click();
        document.querySelector('[data-inventory-tab="open"]')?.scrollIntoView({block:'center'});
      } else if(hash==='maletas') document.querySelector('[data-open-reseller]')?.click();
      else ['home','finance','settings','cloud','catalog','warranty','label'].some(prefix=>{const el=document.querySelector(`[data-${prefix}-tab="${hash}"]`);if(el){el.click();return true}return false});
      document.querySelectorAll('.v2-primary a,.v2-mobile-nav a').forEach(a=>{const same=new URL(a.href).pathname===location.pathname; if(same && (new URL(a.href).hash===location.hash||!new URL(a.href).hash))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
    };
    window.addEventListener('hashchange',route); if(location.hash||config?.view)(window.MarquesaDemo?.ready||Promise.resolve()).then(()=>requestAnimationFrame(route));
    document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
    const decorate = () => {
      document.querySelectorAll('strong,b,dd,time,small,td,span').forEach(el=>{if(!el.children.length && /\d|R\$/.test(el.textContent))el.classList.add('v2-number')});
      document.querySelectorAll('[data-payment-method],[data-receipt-method]').forEach(el=>{
        const name=/pix/i.test(el.value)?'pix':/cartão/i.test(el.value)?'card':'money';
        let mark=el.parentElement.querySelector('.v2-method-icon');
        if(!mark){mark=document.createElement('span');mark.className='v2-method-icon';el.before(mark)}
        if(mark.dataset.name!==name){mark.innerHTML=icon(name);mark.dataset.name=name}
      });
    };
    decorate();
    let queued=false;
    new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;decorate()})}}).observe(document.querySelector('main') || document.body,{childList:true,subtree:true,characterData:true});
    document.addEventListener('change',decorate);
    document.dispatchEvent(new Event('marquesa-ready'));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
