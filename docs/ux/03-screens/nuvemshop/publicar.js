(async () => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const date = iso => iso.split('-').reverse().join('/');
  const states = {
    waiting:['Aguardando ação',0,'Solicite a preparação do título, da descrição e das informações da loja.','Preparar conteúdo'],
    preparing:['Agente preparando',1,'Título, descrição e SEO em preparação. Depois, você revisa.','Ver andamento'],
    review:['Aguardando aprovação',2,'Conteúdo pronto. Confira as informações e as fotos antes de aprovar.','Revisar e aprovar'],
    publishing:['Publicando',3,'Aprovação recebida. Enviando o produto para a loja.','Publicando…'],
    published:['Publicado',4,'Produto publicado na loja após a aprovação.','Ver publicação'],
    failed:['Falha na publicação',3,'A aprovação está preservada. O envio não foi concluído; tente novamente.','Tentar novamente']
  };
  const seeds = [
    {sku:'132721',name:'Brinco Libélula Colorida',category:'',price:0,stock:5,date:'2026-09-12',state:'waiting',shape:'earrings'},
    {sku:'218178',name:'Anel Micro Zircônia',category:'Anéis',price:129,stock:3,date:'2026-09-11',state:'preparing',shape:'ring'},
    {sku:'191620',name:'Brinco Corações Pendurados',category:'Infantil',price:119,stock:4,date:'2026-09-10',state:'review',shape:'earrings'},
    {sku:'337421',name:'Pulseira Pérolas e Coração',category:'Pulseiras',price:149,stock:6,date:'2026-09-09',state:'published',shape:'bracelet'},
    {sku:'220018',name:'Colar Coração Delicado',category:'Colares',price:99,stock:2,date:'2026-09-08',state:'failed',shape:'necklace'}
  ].map(p=>({...p,title:p.name+' · Banho de Ouro 18k',description:'Uma peça delicada para acompanhar os seus momentos.\nBanho de ouro 18k e acabamento polido.\nEvite contato com perfumes e guarde separadamente após o uso.',summary:'Delicadeza e brilho para compor o seu dia.',seoTitle:p.name+' | Marquesa Semijoias',seoDescription:'Conheça '+p.name+' e descubra os detalhes da coleção Marquesa.',keywords:p.category.toLowerCase()+', semijoia, dourado',photos:p.state==='waiting'?[]:[{id:'illustration',name:'Imagem ilustrativa',illustration:true}],approved:['published','failed'].includes(p.state)}));
  await window.MarquesaDemo?.ready;
  const products = window.MarquesaDemo?.get('publication.products', seeds) || seeds;
  const persistenceCopy=()=>{const persistent=window.MarquesaDemo?.status.persistent;$('[data-persistence]').textContent=persistent?'Demonstração · salva neste navegador':'Demonstração · alterações somente nesta sessão'};
  async function persist(){try{await window.MarquesaDemo?.set('publication.products',products)}catch{notice('Armazenamento indisponível. As alterações duram esta sessão.')}persistenceCopy()}
  persistenceCopy();
  // A browser closure may interrupt a simulated send. Resume as retryable failure.
  products.forEach(p=>{if(p.state==='publishing')p.state='failed'});
  let filter='all', current, draft, progressProduct;
  const missing=p=>[!p.photos.length&&'Imagens',!p.category&&'Categoria',!(p.price>0)&&'Preço'].filter(Boolean);
  const fields=['category','price','title','description','summary','seoTitle','seoDescription','keywords'];
  const art = p => {
    const photo=p.photos?.[0];
    if(photo && !photo.illustration)return `<div class="product-art"><img src="${escape(photo.url)}" alt="${escape(p.name)}"></div>`;
    if(!photo)return '<div class="product-art"><small>Sem foto</small></div>';
    const shapes={ring:'<ellipse cx="50" cy="59" rx="23" ry="29" transform="rotate(28 50 59)"/><ellipse cx="50" cy="59" rx="18" ry="24" transform="rotate(28 50 59)"/><path d="m62 24 8-8 8 8-8 9Z"/>',earrings:'<path d="M25 32c-10-22 23-22 15 0M61 32c-10-22 23-22 15 0M25 32l8 13 7-13M61 32l8 13 7-13M33 46c-22-19-27 10 0 26 27-16 22-45 0-26ZM69 46c-22-19-27 10 0 26 27-16 22-45 0-26Z"/>',bracelet:'<ellipse cx="50" cy="52" rx="31" ry="29" stroke-dasharray="2 7" stroke-width="5"/><path d="M50 73c-18-14-23 9 0 22 23-13 18-36 0-22Z"/>',necklace:'<path d="M18 10c-12 85 76 85 64 0M50 62c-20-15-26 9 0 24 26-15 20-39 0-24Z"/>'};
    return `<div class="product-art"><svg viewBox="0 0 100 110" role="img" aria-label="Ilustração da peça">${shapes[p.shape]}</svg><small>Ilustração</small></div>`;
  };
  function notice(message){$('[data-toast]').textContent=message;$('[data-toast]').hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('[data-toast]').hidden=true,4000)}
  const tick='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.4 4.6 4.6L19 7.6"/></svg>';
  const bang='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 6v7"/><path d="M12 17.4h.01"/></svg>';
  function pipeline(p){
    const stage=states[p.state][1], failed=p.state==='failed', ended=p.state==='published';
    return `<div class="mq-steps" role="img" aria-label="Etapa atual: ${['Cadastro','Preparo','Revisão','Envio','Publicado'][Math.min(stage,4)]}">`
      +['Cadastro','Preparo','Revisão','Envio','Publicado'].map((label,i)=>{
        const done=ended||i<stage, current=i===stage;
        const cls=failed&&current?'is-failed':done?'is-done':current?'is-current':'';
        return `<div class="mq-step ${cls}"${current?' aria-current="step"':''}><span class="mq-step__dot">${failed&&current?bang:done?tick:''}</span><span class="mq-step__label">${label}</span></div>`;
      }).join('')+`</div>`;
  }
  function render(){
    $('[data-filters]').innerHTML=[['all','Todos'],['waiting','Aguardando ação'],['preparing','Preparando'],['review','Para aprovar'],['publishing','Publicando'],['published','Publicados'],['failed','Falha']].map(([id,label])=>`<button type="button" data-filter="${id}" aria-pressed="${filter===id}">${label}<b class="mq-badge">${products.filter(p=>id==='all'||p.state===id).length}</b></button>`).join('');
    const term=$('[data-search]').value.toLocaleLowerCase('pt-BR').trim(), status=$('[data-status]').value;
    const visible=products.filter(p=>(filter==='all'||p.state===filter)&&(status==='all'||p.state===status)&&($('[data-missing]').value==='all'||($('[data-missing]').value==='photos'&&!p.photos.length)||($('[data-missing]').value==='category'&&!p.category)||($('[data-missing]').value==='price'&&!(p.price>0)))&&`${p.name} ${p.sku}`.toLocaleLowerCase('pt-BR').includes(term));
    $('[data-products]').innerHTML=visible.map(p=>{
      const gaps=missing(p), presence=p.observedPresence||(p.state==='published'?'publicado (exemplo)':'não confirmada');
      const tone={waiting:'open',preparing:'info',review:'warn',publishing:'info',published:'ok',failed:'risk'}[p.state]||'open';
      return `<article class="publication-row" data-sku="${p.sku}">
        <div class="publication-row__piece">${art(p)}</div>
        <div class="publication-row__id">
          <h2>${escape(p.name)}</h2>
          <p class="mq-sku">SKU ${p.sku}</p>
          <div class="publication-row__tags">
            <span class="mq-chip mq-chip--soft">${escape(p.category||'Sem categoria')}</span>
            <em class="mq-status mq-status--${tone} publication-status ${p.state}">${states[p.state][0]}</em>
          </div>
          <p class="publication-checks">${p.photos.length} imagem(ns) · ${gaps.length?`<b class="mq-warn">falta ${gaps.join(', ').toLowerCase()}</b>`:'conteúdo completo'}</p>
          <p class="publication-presence">Presença na loja: ${escape(presence)}</p>
        </div>
        <dl class="publication-meta">
          <div><dt>Cadastrado</dt><dd>${date(p.date)}</dd></div>
          <div><dt>Estoque</dt><dd>${p.stock} <span>peças</span></dd></div>
          <div><dt>Preço</dt><dd class="money">${money(p.price)}</dd></div>
        </dl>
        <div class="publication-row__flow">
          ${pipeline(p)}
          <p class="publication-context ${p.state}">${states[p.state][2]}${p.state==='failed'?' Bloqueio técnico: conexão interrompida (simulada).':''}</p>
        </div>
        <div class="publication-actions">
          <button class="mq-btn ${['waiting','review','failed'].includes(p.state)?'mq-btn--primary':'mq-btn--secondary'}" data-action="${p.sku}" ${p.state==='publishing'?'disabled':''}>${states[p.state][3]}</button>
          <button class="mq-btn mq-btn--link detail-button" data-details="${p.sku}">Ver detalhes →</button>
        </div>
      </article>`;
    }).join('');
    $('[data-empty]').hidden=visible.length>0;$('[data-result-count]').textContent=`${visible.length} ${visible.length===1?'produto':'produtos'}`;$('[data-page-count]').textContent=`${visible.length} de ${products.length} produtos`;
  }
  $('[data-filters]').onclick=e=>{const button=e.target.closest('[data-filter]');if(button){filter=button.dataset.filter;$('[data-status]').value='all';render()}};
  $('[data-missing]').onchange=render;$('[data-search]').oninput=render;$('[data-status]').onchange=()=>{filter='all';render()};
  $('[data-reset]').onclick=()=>{filter='all';$('[data-search]').value='';$('[data-missing]').value='all';$('[data-status]').value='all';render()};
  function readFields(){for(const field of fields){const value=$('[data-review-form]').elements[field].value.trim();draft[field]=field==='price'?Number(value):value}}
  function tab(name){$$('[data-review-panel]').forEach(p=>p.hidden=p.dataset.reviewPanel!==name);$$('[data-review-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.reviewTab===name));if(name==='preview'){readFields();renderPreview()}if(name==='photos')renderGallery()}
  $$('[data-review-tab]').forEach(button=>button.onclick=()=>tab(button.dataset.reviewTab));
  function renderPreview(){$('[data-preview]').innerHTML=`${art(draft)}<div><h3>${escape(draft.title)}</h3><strong>${money(draft.price)}</strong><p>${escape(draft.summary)}</p><p>${escape(draft.description)}</p><p>${draft.stock} peças disponíveis · SKU ${draft.sku}</p></div>`}
  function renderGallery(){
    $('[data-gallery]').innerHTML=draft.photos.length?draft.photos.map((photo,i)=>`<article class="photo-card">${photo.illustration?art({...draft,photos:[photo]}):`<img src="${escape(photo.url)}" alt="${escape(photo.name)}">`}<p>${i===0?'Principal · ':''}${escape(photo.name)}</p><div class="photo-controls"><button type="button" data-photo-action="principal" data-index="${i}" ${i===0?'disabled':''}>Definir principal</button><button type="button" aria-label="Mover foto ${i+1} para antes" data-photo-action="up" data-index="${i}" ${i===0?'disabled':''}>←</button><button type="button" aria-label="Mover foto ${i+1} para depois" data-photo-action="down" data-index="${i}" ${i===draft.photos.length-1?'disabled':''}>→</button><button type="button" data-photo-action="remove" data-index="${i}">Remover</button></div></article>`).join(''):'<p class="photo-help">Nenhuma foto. Adicione uma imagem para revisar a apresentação do produto.</p>';
    if(current.state==='publishing')$$('[data-photo-action]').forEach(b=>b.disabled=true);
  }
  function openReview(p,preview=false){
    current=p;draft={...p,photos:p.photos.map(x=>({...x}))};
    $('#review-title').textContent=p.name;$('[data-review-subtitle]').textContent=`SKU ${p.sku} · ${p.category}`;
    $('[data-basics]').innerHTML=`<div><small>Nome no cadastro</small><strong>${escape(p.name)}</strong></div><div><small>Preço</small><strong>${money(p.price)}</strong></div><div><small>Estoque</small><strong>${p.stock} peças</strong></div>`;
    const readonly=p.state==='publishing';$('[data-simulate-failure]').checked=false;$('[data-simulate-failure]').disabled=readonly;
    fields.forEach(f=>{const input=$('[data-review-form]').elements[f];input.value=p[f];input.readOnly=readonly});
    $('[data-review-state]').textContent=states[p.state][0];$('[data-feedback]').textContent='';
    $('[data-approve]').hidden=p.state!=='review';$('[data-save]').hidden=readonly;
    $('[data-upload]').disabled=readonly;
    $('[data-approval-copy]').textContent=p.state==='published'?'Editar conteúdo, preço, categoria ou fotos invalida a aprovação e devolve o produto à revisão. A presença observada na loja permanece registrada.':readonly?'Publicação demonstrativa. Não há anúncio real vinculado a este exemplo.':p.state==='review'?'Ao aprovar, você inicia a publicação demonstrativa. Nenhum dado é enviado à loja.':'Você pode revisar os dados; a aprovação fica disponível quando o conteúdo estiver pronto.';
    $('.agent-hint').hidden=p.state==='waiting';
    tab(preview?'preview':'content');$('[data-review]').showModal();
  }
  $('[data-close]').onclick=()=>$('[data-review]').close();
  $('[data-gallery]').onclick=e=>{const button=e.target.closest('[data-photo-action]');if(!button)return;const i=Number(button.dataset.index),action=button.dataset.photoAction;const [photo]=draft.photos.splice(i,1);if(action==='principal')draft.photos.unshift(photo);if(action==='up')draft.photos.splice(i-1,0,photo);if(action==='down')draft.photos.splice(i+1,0,photo);renderGallery()};
  $('[data-upload]').onchange=async e=>{
    let accepted=0,rejected=0;$('[data-save]').disabled=true;$('[data-approve]').disabled=true;
    for(const file of e.target.files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){rejected++;continue}const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)});draft.photos.push({id:crypto.randomUUID(),name:file.name,url});accepted++}
    $('[data-feedback]').textContent=`${accepted} foto(s) adicionada(s).${rejected?' '+rejected+' arquivo(s) fora do formato ou limite de 8 MB.':''}`;e.target.value='';$('[data-save]').disabled=false;$('[data-approve]').disabled=false;renderGallery();
  };
  async function save(){readFields();if(!draft.title||!draft.description){tab('content');$('[data-review-form]').reportValidity();return false}const changed=fields.some(f=>current[f]!==draft[f])||JSON.stringify(current.photos)!==JSON.stringify(draft.photos);if(changed&&current.state==='published'&&!current.publishedSnapshot)current.publishedSnapshot={title:current.title,category:current.category,price:current.price,stock:current.stock};Object.assign(current,...fields.map(f=>({[f]:draft[f]})),{photos:draft.photos});if(changed&&current.approved){if(current.state==='published')current.observedPresence='publicado (exemplo)';current.approved=false;current.state='review'}render();await persist();return true}
  $('[data-save]').onclick=async()=>{if(await save()){$('[data-review]').close();notice('Revisão salva na demonstração.')}};
  function publish(p,fail=false){
    if(!p.approved)return;
    p.state='publishing';render();persist();notice('Aprovação concluída. Publicação demonstrativa em andamento.');
    setTimeout(()=>{p.state=fail?'failed':'published';if(!fail){p.observedPresence='publicado (exemplo)';p.publishedSnapshot={title:p.title,category:p.category,price:p.price,stock:p.stock}};render();persist();notice(fail?'Falha técnica simulada. Sua aprovação foi preservada; tente novamente.':'Produto publicado na demonstração.');if(current===p&&$('[data-review]').open){$('[data-review]').close();openReview(p,true)}},1400);
  }
  $('[data-review-form]').onsubmit=async e=>{e.preventDefault();if(current.state!=='review'||!await save())return;if(missing(current).length){tab(!current.photos.length?'photos':'content');$('[data-feedback]').textContent='Complete antes de aprovar: '+missing(current).join(', ')+'.';return}current.approved=true;const fail=$('[data-simulate-failure]').checked;$('[data-review]').close();publish(current,fail)};
  function showProgress(p){progressProduct=p;$('[data-progress-name]').textContent=p.name;$('[data-progress]').showModal()}
  $('[data-close-progress]').onclick=()=>$('[data-progress]').close();
  $('[data-ready]').onclick=()=>{progressProduct.state='review';persist();$('[data-progress]').close();render();notice('Conteúdo pronto para a sua revisão. Nenhuma publicação foi iniciada.')};
  $('[data-products]').onclick=e=>{
    const button=e.target.closest('[data-action],[data-details]');if(!button)return;
    const p=products.find(x=>x.sku===(button.dataset.action||button.dataset.details));
    if(button.hasAttribute('data-details'))return openReview(p);
    if(p.state==='waiting'){p.state='preparing';persist();render();showProgress(p)}else if(p.state==='preparing')showProgress(p);else if(p.state==='failed')publish(p);else if(p.state==='review')openReview(p);else if(p.state==='published')openReview(p,true);
  };
  render();
  const selected=new URLSearchParams(location.search).get('sku');if(selected){const product=products.find(p=>p.sku===selected);if(product)openReview(product,product.state==='published')}
})();
