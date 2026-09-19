/* =============================================================================
   MARQUESA V2 · APP SHELL
   Monta o mesmo casco em todas as superfícies do produto: trilho de módulos,
   barra superior, navegação de telefone e as abas do módulo no lugar certo.
   Também publica o dicionário de ícones oficial (window.MarquesaUI.icon).
   ========================================================================== */
(() => {
  const script = document.currentScript;
  const base = new URL('../03-screens/', script.src);
  const config = window.__MARQUESA_PROTOTYPE__;

  /* -- resolução de rota ---------------------------------------------------- */
  const url = (path) => {
    if (!config) return new URL(path, base).href;
    const [source, hash] = path.split('#');
    const pages = config.pages.filter(p => p.source === '03-screens/' + source);
    const target = pages.find(p => p.view === hash) || pages[0];
    return target ? target.path + (hash && hash !== target.view ? '#' + hash : '') : new URL(path, base).href;
  };

  /* -- dicionário de ícones ------------------------------------------------- */
  /* Um traço só (1.6), 24x24, sem emoji. Domínio da Marquesa incluído.        */
  const paths = {
    home:'<path d="M3 10.2 12 3.5l9 6.7V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z"/>',
    sale:'<path d="M4 20V4m0 16h16"/><path d="m7 15 3.5-4.2L14 13l5.5-6.5"/><circle cx="19.5" cy="6.5" r="1.2"/>',
    person:'<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    people:'<circle cx="9.5" cy="8.5" r="3.2"/><path d="M3 20.3a6.5 6.5 0 0 1 13 0"/><path d="M16.2 5.6a3.2 3.2 0 0 1 0 6"/><path d="M18 14.6a6.5 6.5 0 0 1 3 5.7"/>',
    money:'<rect x="2.5" y="5.5" width="19" height="13" rx="2.2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.4v5.2M18 9.4v5.2"/>',
    card:'<rect x="2.5" y="4.8" width="19" height="14.4" rx="2.4"/><path d="M2.5 9.6h19M6 15.2h3.6"/>',
    cash:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.4"/><path d="M5.8 12h.01M18.2 12h.01"/>',
    pix:'<path d="M12 3.4 8.6 6.8h1.6a2.6 2.6 0 0 1 1.8.8l2.4 2.4a1.4 1.4 0 0 0 2 0"/><path d="m3.4 12 3.4-3.4v1.6c0 .7.3 1.3.8 1.8l2.4 2.4a1.4 1.4 0 0 1 0 2"/><rect x="7.4" y="7.4" width="9.2" height="9.2" rx="2.2" transform="rotate(45 12 12)"/>',
    credit:'<circle cx="12" cy="12" r="8.6"/><path d="M15 9.2a3.6 3.6 0 1 0 0 5.6"/>',
    receipt:'<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4Z"/><path d="M9 8.5h6M9 12.5h6"/>',
    box:'<path d="M12 3.2 20.5 7v10L12 20.8 3.5 17V7Z"/><path d="M3.5 7 12 11l8.5-4M12 11v9.8"/>',
    inventory:'<rect x="3.2" y="4.2" width="17.6" height="15.6" rx="2"/><path d="M7 8.2v7.6M10.4 8.2v7.6M13.8 8.2v7.6M17.2 8.2v4"/>',
    tag:'<path d="M3.5 3.5h7.6l9.4 9.4-7.6 7.6L3.5 11.1Z"/><circle cx="8.2" cy="8.2" r="1.3"/>',
    label:'<path d="M3.5 6.5h13l4 5.5-4 5.5h-13Z"/><path d="M7 10.4h6M7 13.6h4"/>',
    cloud:'<path d="M7.4 18.5a4.6 4.6 0 0 1-.6-9.2 6.2 6.2 0 0 1 11.8 1.5 3.9 3.9 0 0 1-.6 7.7Z"/><path d="M12 21.2v-7m-2.6 2.4L12 14l2.6 2.6"/>',
    shield:'<path d="M12 3 19 5.8v5.5c0 4.5-3 7.6-7 9.7-4-2.1-7-5.2-7-9.7V5.8Z"/><path d="m9 12 2.2 2.2L15.4 10"/>',
    repair:'<path d="M14.8 6.2a3.8 3.8 0 0 0 4.9 4.9l-8 8a2.4 2.4 0 0 1-3.4-3.4Z"/><path d="m5.5 5.5 3 3"/>',
    swap:'<path d="M4 8.5h13l-3-3M20 15.5H7l3 3"/>',
    bag:'<path d="M4.5 8h15l-1 11.5a1.5 1.5 0 0 1-1.5 1.3H7a1.5 1.5 0 0 1-1.5-1.3Z"/><path d="M8.6 8V6.2A3.4 3.4 0 0 1 12 2.8a3.4 3.4 0 0 1 3.4 3.4V8"/><path d="M4.5 12.6h15"/>',
    bell:'<path d="M18 9.2a6 6 0 0 0-12 0c0 5.6-2.6 6.6-2.6 8.4h17.2c0-1.8-2.6-2.8-2.6-8.4"/><path d="M10 20.6h4"/>',
    clock:'<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 1.9"/>',
    calendar:'<rect x="3.4" y="5" width="17.2" height="15.6" rx="2"/><path d="M3.4 9.8h17.2M8 3.4v3.2M16 3.4v3.2"/>',
    settings:'<path d="M4 7.5h16M4 16.5h16"/><circle cx="9" cy="7.5" r="2.6"/><circle cx="15" cy="16.5" r="2.6"/>',
    search:'<circle cx="10.6" cy="10.6" r="6.4"/><path d="m15.4 15.4 4.4 4.4"/>',
    check:'<path d="m5 12.4 4.6 4.6L19 7.6"/>',
    close:'<path d="m5.6 5.6 12.8 12.8M18.4 5.6 5.6 18.4"/>',
    menu:'<path d="M3.6 7h16.8M3.6 12h16.8M3.6 17h16.8"/>',
    arrow:'<path d="M4.5 12h15m-6-6 6 6-6 6"/>',
    chevron:'<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    alert:'<path d="M12 4.2 21 19.5H3Z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
    image:'<rect x="3.4" y="4.4" width="17.2" height="15.2" rx="2"/><circle cx="8.6" cy="9.4" r="1.8"/><path d="m4 17.6 5-4.6 3.4 3 3-2.6 4.6 4.2"/>',
    upload:'<path d="M12 16.4V3.8m-4.6 4.6L12 3.8l4.6 4.6"/><path d="M4 14.4v5.8h16v-5.8"/>',
    doc:'<path d="M6 3.4h8l4 4v13.2H6Z"/><path d="M14 3.4v4h4M9 12.4h6M9 16h4"/>',
    filter:'<path d="M4 6h16l-6.2 7.2v5.4l-3.6 1.8v-7.2Z"/>',
    star:'<path d="m12 4 2.4 5 5.4.7-4 3.7 1.1 5.3L12 16.1 7.1 18.7l1.1-5.3-4-3.7 5.4-.7Z"/>',
    link:'<path d="M14 4.2h5.8V10M19.8 4.2 10.6 13.4"/><path d="M10 5.6H4.2v14.2h14.2V14"/>'
  };
  const icon = (name, cls) => `<svg class="${cls || 'mq-ico'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`;
  window.MarquesaUI = { icon, url, paths };

  /* -- arquitetura de navegação -------------------------------------------- */
  /* Três perguntas, três grupos: o que eu vendo, o que eu tenho, quem gira.  */
  const NAV = [
    ['Operação', [
      ['Home','dashboard/master.html','home'],
      ['Vendas','vendas/master.html#painel','sale'],
      ['Clientes','clientes/master.html','people'],
      ['Financeiro','financeiro/master.html','money']
    ]],
    ['Produto', [
      ['Estoque','estoque/master.html','box'],
      ['Catálogo','catalogo/master.html','tag'],
      ['Etiquetas','etiquetas/master.html','label'],
      ['Nuvemshop','nuvemshop/publicar.html','cloud']
    ]],
    ['Rede', [
      ['Revendedoras','revendedoras/master.html','bag'],
      ['Garantias e reparos','reparos/master.html','shield']
    ]],
    ['Sistema', [
      ['Agenda','dashboard/master.html#calendar','calendar'],
      ['Notificações','notificacoes/master.html','bell','5'],
      ['Configurações','configuracoes/master.html#preferences','settings']
    ]]
  ];
  const MOBILE = [
    ['Home','dashboard/master.html','home'],
    ['Vendas','vendas/master.html#painel','sale'],
    ['Clientes','clientes/master.html','people'],
    ['Estoque','estoque/master.html','box']
  ];
  const ALIASES = { dashboard:'dashboard/master.html', vendas:'vendas/master.html', clientes:'clientes/master.html',
    financeiro:'financeiro/master.html', estoque:'estoque/master.html', catalogo:'catalogo/master.html',
    revendedoras:'revendedoras/master.html', garantias:'reparos/master.html', reparos:'reparos/master.html',
    etiquetas:'etiquetas/master.html', nuvemshop:'nuvemshop/publicar.html', notificacoes:'notificacoes/master.html',
    configuracoes:'configuracoes/master.html', perfil:'configuracoes/master.html#profile' };

  function boot(){
    const body = document.body;
    body.classList.add('mq-app','v2-system');
    const current = config ? config.source.split('/').slice(-2).join('/')
                           : location.pathname.split('/').slice(-2).join('/');
    const isActive = (p) => config
      ? new URL(url(p), location.href).pathname === config.path
      : p.split('#')[0] === current;
    const hub = config ? '/prototype/hub/' : new URL('index.html', script.src).href;
    const logo = new URL('../01-brand/logo_sistema-marquesa_preta-transparente.png', script.src);

    let moduleLabel = 'Marquesa', moduleIcon = 'home', moduleGroup = '';
    NAV.forEach(([group, items]) => items.forEach(i => {
      if (isActive(i[1])) { moduleLabel = i[0]; moduleIcon = i[2]; moduleGroup = group; }
    }));

    /* --- trilho ----------------------------------------------------------- */
    const railLink = ([label, p, ico, badge]) =>
      `<a href="${url(p)}"${isActive(p) ? ' aria-current="page"' : ''}>${icon(ico)}<span>${label}</span>${badge ? `<b class="mq-badge">${badge}</b>` : ''}</a>`;
    const rail = document.createElement('aside');
    rail.className = 'mq-rail';
    rail.id = 'mq-rail';
    rail.innerHTML =
      `<a class="mq-rail__brand" href="${url('dashboard/master.html')}" aria-label="Marquesa Semijoias — Home">
         <img src="${logo}" alt="Marquesa Semijoias">
         <span class="mq-rail__mark" aria-hidden="true">M</span></a>
       <nav class="mq-rail__nav" aria-label="Módulos do sistema">
         ${NAV.map(([group, items]) => `<p class="mq-rail__group">${group}</p>${items.map(railLink).join('')}`).join('')}
       </nav>
       <div class="mq-rail__foot">
         <span>Protótipo de design · V2</span>
         <a href="${hub}">Hub de revisão</a>
       </div>`;
    body.prepend(rail);

    const scrim = document.createElement('button');
    scrim.className = 'mq-scrim'; scrim.type = 'button'; scrim.hidden = true;
    scrim.setAttribute('aria-label','Fechar menu');
    body.append(scrim);

    /* --- barra superior --------------------------------------------------- */
    const shell = document.querySelector('.app-shell') || body;
    const topbar = document.createElement('header');
    topbar.className = 'mq-topbar';
    topbar.innerHTML =
      `<button class="mq-iconbtn mq-burger" type="button" data-mq-menu aria-label="Abrir menu" aria-expanded="false" aria-controls="mq-rail">${icon('menu')}</button>
       <div class="mq-topbar__where">${icon(moduleIcon)}<b>${moduleLabel}</b>${moduleGroup ? `<span class="mq-hide@sm">· ${moduleGroup}</span>` : ''}</div>
       <div class="mq-search mq-topbar__search">${icon('search')}
         <input class="mq-input" type="search" placeholder="Buscar cliente, peça ou venda" aria-label="Busca global">
       </div>
       <div class="mq-topbar__tools">
         <a class="mq-iconbtn" href="${url('notificacoes/master.html')}" aria-label="Notificações">${icon('bell')}<span class="mq-iconbtn__dot" data-unread-count>5</span></a>
         <a class="mq-avatar" href="${url('configuracoes/master.html#profile')}" aria-label="Meu perfil" style="text-decoration:none">SM</a>
       </div>`;
    const oldHeader = shell.querySelector('.app-header');
    (oldHeader || shell).insertAdjacentElement(oldHeader ? 'beforebegin' : 'afterbegin', topbar);

    /* --- navegação de telefone -------------------------------------------- */
    const bottom = document.createElement('nav');
    bottom.className = 'mq-bottomnav';
    bottom.setAttribute('aria-label','Navegação rápida');
    bottom.innerHTML = MOBILE.map(([label, p, ico]) =>
      `<a href="${url(p)}"${isActive(p) ? ' aria-current="page"' : ''}>${icon(ico)}<span>${label}</span></a>`).join('')
      + `<button type="button" data-mq-menu>${icon('menu')}<span>Menu</span></button>`;
    body.append(bottom);

    const setMenu = (open) => {
      rail.classList.toggle('is-open', open);
      scrim.hidden = !open;
      document.querySelectorAll('[data-mq-menu]').forEach(b => b.setAttribute('aria-expanded', String(open)));
      body.style.overflow = open && matchMedia('(max-width:900px)').matches ? 'hidden' : '';
    };
    document.addEventListener('click', e => {
      if (e.target.closest('[data-mq-menu]')) { setMenu(!rail.classList.contains('is-open')); }
      else if (e.target.closest('.mq-scrim')) setMenu(false);
      else if (e.target.closest('.mq-rail a')) setMenu(false);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

    /* --- abas do módulo vão para dentro da página -------------------------- */
    const main = document.querySelector('main');
    const tabs = shell.querySelector('.secondary-nav');
    if (tabs && main) {
      const strip = document.createElement('div');
      strip.className = 'mq-modtabs';
      main.prepend(strip);
      strip.append(tabs);
    }
    document.querySelector('#profile-menu')?.remove();
    document.querySelector('.hub-header')?.remove();

    /* --- rodapé de demonstração ------------------------------------------- */
    body.insertAdjacentHTML('beforeend',
      `<footer class="mq-demobar">
         <span data-demo-storage>Dados demonstrativos · neste navegador</span>
         <a href="${hub}">Pronto para sua revisão</a>
         <button class="mq-btn mq-btn--secondary mq-btn--sm" type="button" data-demo-reset>Restaurar demonstração</button>
       </footer>`);
    const store = window.MarquesaDemo;
    if (store) {
      store.ready.then(() => {
        const el = document.querySelector('[data-demo-storage]');
        if (el) el.textContent = store.status.persistent
          ? 'Demonstração · alterações salvas neste navegador'
          : 'Armazenamento indisponível · alterações apenas nesta sessão';
      });
      const reset = document.querySelector('[data-demo-reset]');
      if (reset) reset.onclick = () => {
        if (confirm('Restaurar os exemplos? As alterações desta demonstração serão apagadas neste navegador.')) store.reset();
      };
    }

    /* --- hub: inventário de destinos -------------------------------------- */
    if (config?.id === 'hub' && main) {
      const section = document.createElement('section');
      section.id = 'inventory'; section.className = 'mq-card';
      section.innerHTML =
        `<div class="mq-card__head"><div><p class="mq-eyebrow">Mapa do protótipo</p>
           <h2 class="mq-title">Todos os destinos</h2>
           <p class="mq-lede">Prontos para revisão · nenhuma aprovação visual automática.</p></div></div>
         <div class="mq-card__body"><div class="mq-grid mq-grid--3">`
        + config.pages.map(p => `<a class="mq-btn mq-btn--secondary" href="${p.path}">${p.label}</a>`).join('')
        + config.flows.map(f => `<a class="mq-btn mq-btn--ghost" href="${config.pages.find(p => p.id === f.page).path}#${f.hash}">${f.label}</a>`).join('')
        + `</div></div>`;
      main.append(section);
    }

    /* --- atalhos históricos apontam para o módulo real --------------------- */
    document.querySelectorAll('[data-href], a[href]').forEach(el => {
      const attr = el.hasAttribute('data-href') ? 'data-href' : 'href';
      const value = el.getAttribute(attr);
      if (value?.includes('prototype/index.html#')) {
        const target = ALIASES[value.split('#')[1]];
        if (target) el.setAttribute(attr, url(target));
      }
    });
    if (current.startsWith('catalogo/')) {
      document.querySelectorAll('[data-catalog-tab="store"]').forEach(b =>
        b.addEventListener('click', () => location.href = url('nuvemshop/publicar.html')));
    }
    if (current.startsWith('estoque/')) {
      tabs?.insertAdjacentHTML('beforeend',
        `<a href="${url('estoque/master.html#inventario')}">Inventário</a><a href="${url('nuvemshop/publicar.html')}">Publicar na loja</a>`);
    }

    /* --- roteamento por fragmento ----------------------------------------- */
    const route = () => {
      const hash = location.hash.slice(1) || (config?.view || '');
      if (current.startsWith('vendas/')) {
        const name = hash === 'historico' ? 'painel'
          : (['saida','colar','nova-venda'].includes(hash) ? 'lancamentos' : hash);
        document.querySelector(`[data-screen="${name}"]`)?.click();
        if (hash === 'saida') document.querySelector('[data-launch-screen="saidas"]')?.click();
        if (hash === 'colar') document.querySelector('[data-launch-type="collar"]')?.click();
        if (hash === 'nova-venda') document.querySelector('[data-launch-type="sale"]')?.click();
      } else if (hash === 'inventario') {
        const t = document.querySelector('[data-inventory-tab="open"]');
        t?.click(); t?.scrollIntoView({ block:'center' });
      } else if (hash === 'maletas') {
        document.querySelector('[data-open-reseller]')?.click();
      } else {
        ['home','finance','settings','cloud','catalog','warranty','label','client']
          .some(prefix => { const el = document.querySelector(`[data-${prefix}-tab="${hash}"]`); if (el) { el.click(); return true; } return false; });
      }
      document.querySelectorAll('.mq-rail a,.mq-bottomnav a').forEach(a => {
        const u = new URL(a.href);
        const same = u.pathname === location.pathname && (!u.hash || u.hash === location.hash);
        same ? a.setAttribute('aria-current','page') : a.removeAttribute('aria-current');
      });
    };
    window.addEventListener('hashchange', route);
    if (location.hash || config?.view) (window.MarquesaDemo?.ready || Promise.resolve()).then(() => requestAnimationFrame(route));

    /* --- decoração: números tabulares e ícone de forma de pagamento -------- */
    const decorate = () => {
      /* Conteúdo montado por JS de módulo também recebe ícone: basta um
         <span data-icon="nome"></span> — o casco preenche quando aparecer. */
      document.querySelectorAll('[data-icon]').forEach(el => {
        if (el.dataset.iconDone === el.dataset.icon) return;
        el.innerHTML = icon(el.dataset.icon);
        el.dataset.iconDone = el.dataset.icon;
      });
      document.querySelectorAll('main strong,main b,main dd,main time,main small,main td,main span').forEach(el => {
        if (!el.children.length && /\d|R\$/.test(el.textContent)) el.classList.add('v2-number');
      });
      document.querySelectorAll('[data-payment-method],[data-receipt-method]').forEach(el => {
        const name = /pix/i.test(el.value) ? 'pix' : /cart/i.test(el.value) ? 'card' : /cr[ée]dito da/i.test(el.value) ? 'credit' : 'cash';
        let mark = el.parentElement.querySelector('.mq-method');
        if (!mark) { mark = document.createElement('span'); mark.className = 'mq-method'; el.before(mark); }
        if (mark.dataset.name !== name) { mark.innerHTML = icon(name); mark.dataset.name = name; }
      });
    };
    decorate();
    let queued = false;
    new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; decorate(); }); } })
      .observe(main || body, { childList:true, subtree:true, characterData:true });
    document.addEventListener('change', decorate);
    document.dispatchEvent(new Event('marquesa-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
