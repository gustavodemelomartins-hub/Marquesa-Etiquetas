/* Fonte demonstrativa local; sem transporte HTTP e sem credenciais. */
(() => {
  'use strict';
  const clone = value => structuredClone(value);
  const names = [['camila','Camila Ferreira','(19) 9 8123-4567',1125,3],['ana','Ana Luiza Sedassari','(19) 9 7790-3112',1704,6],['mariana','Mariana Souza','(19) 9 6681-4502',0,0],['juliana','Juliana Prado','(19) 9 9211-1098',898,4],['zilma','Zilma','',79,1]];
  const fixtures = () => ({
    clients:names.map(([id,name,phone,historicalPaid,historicalSales])=>({id,name,phone,cpf:'',email:'',city:'',instagram:'',birth:'',notes:id==='camila'?'Prefere peças douradas e contato pelo WhatsApp.':'',historicalPaid,historicalSales})),
    sales:[],
    accounts:{
      camila:{clientId:'camila',saleId:'1058',name:'Camila Ferreira',sale:'Venda #1058 · 05/09/2026',total:159,paid:0,due:'2026-09-16',events:[]},
      ana:{clientId:'ana',saleId:'1056',name:'Ana Luiza Sedassari',sale:'Venda #1056 · 03/09/2026',total:340,paid:100,due:'2026-09-12',events:[{id:'receipt-ana',value:100,method:'Dinheiro',date:'2026-09-14'}]},
      mariana:{clientId:'mariana',saleId:'1039',name:'Mariana Souza',sale:'Venda #1039 · 29/08/2026',total:229,paid:100,due:'2026-09-18',events:[{id:'receipt-mariana',value:100,method:'PIX',date:'2026-09-02'}]}
    }
  });
  let state=fixtures(), db, sequence=Promise.resolve();
  const status={persistent:false};
  function changed(key){window.dispatchEvent(new CustomEvent('marquesa:demo-change',{detail:{key}}));}
  const ready=new Promise(resolve=>{
    try {
      const request=indexedDB.open('marquesa-v2-demonstration',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('data');
      request.onerror=()=>resolve();request.onblocked=()=>resolve();
      request.onsuccess=()=>{
        db=request.result;db.onversionchange=()=>db.close();
        const tx=db.transaction('data','readonly'), req=tx.objectStore('data').get('snapshot-v1');
        req.onsuccess=()=>{if(req.result)state={...fixtures(),...req.result};status.persistent=true;resolve();};
        req.onerror=()=>resolve();
      };
    } catch {resolve();}
  });
  ready.then(() => changed('storage'));
  function persist(){
    const snapshot=clone(state);
    sequence=sequence.then(()=>new Promise(resolve=>{
      if(!db||!status.persistent){resolve();return;}
      try {const tx=db.transaction('data','readwrite');tx.objectStore('data').put(snapshot,'snapshot-v1');tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>{status.persistent=false;changed('storage');resolve();};}
      catch {status.persistent=false;changed('storage');resolve();}
    }));return sequence;
  }
  window.MarquesaDemo={ready,status,version:1,get:(key,fallback)=>clone(state[key]===undefined?fallback:state[key]),async set(key,value){await ready;state[key]=clone(value);await persist();changed(key);return clone(state[key]);},async setMany(changes){await ready;for(const [key,value] of Object.entries(changes))state[key]=clone(value);await persist();Object.keys(changes).forEach(changed);},async reset(){await ready;state=fixtures();await persist();changed('*');location.reload();}};
})();
