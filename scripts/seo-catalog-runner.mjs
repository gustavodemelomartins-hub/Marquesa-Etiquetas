/** Integral, resumable orchestration over the existing Marquesa content writer.
 * Products use prepare/apply/rollback unchanged. No business-field writes.
 * Private credentials are consumed in-process and never printed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';

export const CONTENT_FIELDS=['description','seo_title','seo_description'];
export const localized=v=>v&&typeof v==='object'?v.pt??'':v??'';
export function patchFor(draft) {
 const out={};for(const k of CONTENT_FIELDS) if(Object.hasOwn(draft.after??{},k)&&localized(draft.after[k])!==localized(draft.before[k]))out[k]=localized(draft.after[k]);
 if(Object.keys(draft.after??{}).some(k=>!CONTENT_FIELDS.includes(k)))throw Error('UNSAFE_DRAFT_FIELD');
 if(out.seo_title&&new TextEncoder().encode(out.seo_title).length>70)throw Error('TITLE_EXCEEDS_VERIFIED_API_BYTE_LIMIT');
 return out;
}
export function categoryBusiness(value) {
 const out=structuredClone(value);for(const k of [...CONTENT_FIELDS,'updated_at'])delete out[k];return out;
}
export function contentMatches(product,draft) {
 return CONTENT_FIELDS.every(k=>!Object.hasOwn(draft.before??{},k)||localized(product[k])===localized(draft.before[k]));
}
export function inventoryCounts(rows,status) {
 const out=Object.fromEntries(['PENDING','SKIPPED','PREVIEWED','WRITTEN','VALIDATED','FAILED'].map(k=>[k,0]));
 for(const d of rows){const current=status[String(d.id)]?.status??'PENDING';out[d.disposition==='draft'&&current==='SKIPPED'?'PENDING':current]++;}
 return out;
}
export function publicStatus(proof) {
 if(proof?.valid===true)return 'VALIDATED';
 if(proof?.cache_pending===true&&proof?.origin_valid===true&&proof?.origin_proof?.valid===true)return 'WRITTEN';
 throw Error('PUBLIC_VALIDATION_FAILED');
}
export function productBusiness(value) {
 const out=structuredClone(value);for(const k of [...CONTENT_FIELDS,'name','updated_at'])delete out[k];
 for(const v of out.variants??[])delete v.updated_at;return out;
}
export function nonStockBusiness(value){const out=productBusiness(value);for(const k of ['stock','inventory_levels','has_stock'])delete out[k];for(const v of out.variants??[])for(const k of ['stock','inventory_levels','has_stock'])delete v[k];return out;}
function stockValues(value){const fields=v=>Object.fromEntries(['stock','inventory_levels','has_stock'].filter(k=>Object.hasOwn(v,k)).map(k=>[k,v[k]]));return {...fields(value),variants:(value.variants??[]).map(v=>({id:String(v.id),...fields(v)})).sort((a,b)=>a.id.localeCompare(b.id))};}
export async function reconcileProduct(plan,live,digest,observedStock) {
 const {planHash,...body}=plan;
 if(await digest(body)!==planHash||String(live.id)!==String(plan.productId))throw Error('RECOVERY_PLAN_INVALID');
 if(await digest(live)===plan.beforeHash)return 'BEFORE';
 const desired={...Object.fromEntries(['name',...CONTENT_FIELDS].map(k=>[k,plan.before[k]??null])),...plan.payload};
 const actual=Object.fromEntries(['name',...CONTENT_FIELDS].map(k=>[k,live[k]??null]));
 if(await digest(actual)!==await digest(desired))throw Error('RECOVERY_CONTENT_OR_COMMERCE_DRIFT');
 if(await digest(productBusiness(live))!==plan.businessHash){
  // Read-only validation may use independently captured commercial stock.
  // Original plans/receipts stay immutable; no apply/rollback accepts this context.
  if(observedStock&&String(observedStock.id)===String(live.id)&&await digest(stockValues(live))===await digest(stockValues(observedStock))&&await digest(nonStockBusiness(live))===await digest(nonStockBusiness(plan.before)))return 'APPLIED_WITH_RECORDED_EXTERNAL_STOCK';
  throw Error('RECOVERY_CONTENT_OR_COMMERCE_DRIFT');
 }
 return 'APPLIED';
}
export async function atomicJson(file,value) {
 await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+crypto.randomUUID()+'.tmp';
 const h=await fs.open(tmp,'wx',0o600);try{await h.writeFile(JSON.stringify(value,null,2)+'\n');await h.sync();}finally{await h.close();}await fs.rename(tmp,file);
}
export async function updateCategory(env,client,before,patch,digest,journal,options={}) {
 if(env.NUVEMSHOP_STORE_ID!=='5134350'||env.NUVEMSHOP_WRITES_ENABLED!=='true'||env.NUVEMSHOP_PUBLICACAO_ENABLED!=='true')throw Error('CATEGORY_GATE_DISABLED');
 if(!/^\d+$/.test(String(before.id))||Object.keys(patch).some(k=>!CONTENT_FIELDS.includes(k)))throw Error('CATEGORY_SCOPE_INVALID');
 // Category PUT resets omitted localized name/handle on the live API.
 // Send the exact existing objects; neither field can come from a draft.
 if(!localized(before.name)||!localized(before.handle))throw Error('CATEGORY_IDENTITY_MISSING');
 const payload={name:structuredClone(before.name),handle:structuredClone(before.handle),parent:before.parent||null};
 const shopping=Object.hasOwn(options,'shoppingCategory');
 if(Object.keys(options).some(k=>k!=='shoppingCategory'))throw Error('CATEGORY_OPTIONS_INVALID');
 if(shopping){const value=options.shoppingCategory;if(typeof value!=='string'||!value.startsWith('Vestuário e acessórios > Joias')||value.length>300||/[<\n\r]/.test(value))throw Error('GOOGLE_CATEGORY_INVALID');payload.google_shopping_category=value;}
 for(const [k,v]of Object.entries(patch)){if(!v||typeof v!=='string'||(/<(?:script|style|iframe|form)\b|\bon\w+\s*=|javascript:/i.test(v)))throw Error('CATEGORY_CONTENT_INVALID');if(!before[k]||typeof before[k]!=='object'||Array.isArray(before[k]))throw Error('CATEGORY_TRANSLATION_UNKNOWN');payload[k]={...before[k],pt:v};}
 const projection=v=>{const out=categoryBusiness(v);if(shopping)delete out.google_shopping_category;return out;};
 const hash=await digest(before),businessHash=await digest(projection(before));
 await journal({type:'before_category_write',before,payload,hash,businessHash});
 if(await digest(await client.chamar(`/categories/${before.id}`))!==hash)throw Error('CATEGORY_CONCURRENT_EDIT');
 let after;
 try{await client.chamar(`/categories/${before.id}`,{method:'PUT',body:JSON.stringify(payload)});after=await client.chamar(`/categories/${before.id}`);}
 catch(e){if(e.status===422)throw e;await journal({type:'category_write_or_readback_uncertain',productId:String(before.id)});throw Error('WRITE_OR_READBACK_UNCERTAIN');}
 const contentOk=Object.keys(patch).every(k=>JSON.stringify(after[k])===JSON.stringify(payload[k]))&&(!shopping||after.google_shopping_category===payload.google_shopping_category);
 const businessOk=await digest(projection(after))===businessHash;
 const receipt={type:'category_readback',productId:String(before.id),after,contentOk,businessOk,remoteWrites:1};await journal(receipt);
 if(!contentOk||!businessOk)throw Error('CATEGORY_READBACK_FAILED');return receipt;
}
export async function updateCategoryShopping(env,client,before,shoppingCategory,digest,journal){
 const retained=Object.fromEntries(CONTENT_FIELDS.map(k=>[k,localized(before[k])]));
 if(Object.values(retained).some(v=>!v))throw Error('GOOGLE_CATEGORY_REQUIRES_NONEMPTY_SEO_BACKUP');
 return updateCategory(env,client,before,retained,digest,journal,{shoppingCategory});
}

async function main(){
 const {values:a}=parseArgs({options:{'writer-root':{type:'string'},storage:{type:'string'},python:{type:'string'},'stock-snapshot':{type:'string'},mode:{type:'string',default:'preview'},limit:{type:'string'},kind:{type:'string',default:'products'},drafts:{type:'string',default:'drafts.json'}}});
 if(!a['writer-root']||!a.storage||!a.python)throw Error('EXPLICIT_RUNTIME_PATHS_REQUIRED');
 const root=path.resolve(a.storage),writerRoot=path.resolve(a['writer-root']);
 const writer=await import(pathToFileURL(path.join(writerRoot,'api/src/catalogo/conteudo-seguro.js')));
 const {Nuvemshop}=await import(pathToFileURL(path.join(writerRoot,'api/src/nuvemshop.js')));
 const backup=JSON.parse(await fs.readFile(path.join(root,'seo-before-2026-10-08.json'),'utf8'));
 if(String(backup.store_id)!=='5134350'||!backup.products?.length||!backup.categories?.length)throw Error('INTEGRAL_BACKUP_REQUIRED');
 const draftSet=JSON.parse(await fs.readFile(path.join(root,a.drafts),'utf8'));
 const rows=a.kind==='categories'?draftSet.category_drafts:draftSet.product_drafts;
 if(!Array.isArray(rows)||new Set(rows.map(d=>String(d.id))).size!==rows.length)throw Error('INVALID_DRAFT_INVENTORY');
 const env={NUVEMSHOP_WRITES_ENABLED:'false',NUVEMSHOP_PUBLICACAO_ENABLED:'false'};
 for(const line of (await fs.readFile(path.join(os.homedir(),'.config/marquesa-seo/.env'),'utf8')).replace(/^\uFEFF/,'').split(/\r?\n/)){
  const i=line.indexOf('=');if(i<0)continue;const k=line.slice(0,i).trim();if(['NUVEMSHOP_STORE_ID','NUVEMSHOP_TOKEN'].includes(k))env[k]=line.slice(i+1).trim().replace(/^['"]|['"]$/g,'');
 }
 if(env.NUVEMSHOP_STORE_ID!=='5134350'||!env.NUVEMSHOP_TOKEN)throw Error('PROTECTED_CREDENTIAL_UNAVAILABLE');
 if(a.mode==='apply'){env.NUVEMSHOP_WRITES_ENABLED='true';env.NUVEMSHOP_PUBLICACAO_ENABLED='true';}
 else if(a.mode!=='preview'&&a.mode!=='verify')throw Error('INVALID_MODE');
 const client=new Nuvemshop(env);
 let stockContext,stockProducts;
 if(a['stock-snapshot']){if(a.mode!=='verify'||a.kind!=='products')throw Error('STOCK_CONTEXT_READ_ONLY_VERIFICATION_REQUIRED');stockContext=JSON.parse(await fs.readFile(path.resolve(a['stock-snapshot']),'utf8'));if(String(stockContext.store_id)!=='5134350'||!Number.isFinite(Date.parse(stockContext.captured_at)))throw Error('STOCK_CONTEXT_INVALID');stockProducts=new Map(stockContext.products.map(p=>[String(p.id),p]));}
 const statusFile=path.join(root,a.kind+'-status.json');let status={};try{status=JSON.parse(await fs.readFile(statusFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const d of rows)status[String(d.id)]??=d.disposition==='skipped'?{status:'SKIPPED',reason:d.reason,eligible:d.eligible}:{status:'PENDING',eligible:d.eligible};
 await atomicJson(statusFile,status);
 await fs.mkdir(path.join(root,'journal'),{recursive:true});
 const journal=async e=>{const file=path.join(root,'journal',Date.now()+'-'+crypto.randomUUID()+'.json');const h=await fs.open(file,'wx',0o600);try{await h.writeFile(JSON.stringify({...e,recorded_at:new Date().toISOString()},null,2)+'\n');await h.sync();}finally{await h.close();}};
 const verify=async(d,p)=>{
  const input=path.join(root,'verification-input.json');await atomicJson(input,{draft:d,product:p,kind:a.kind,storage:root,runtime_root:writerRoot});
  const r=spawnSync(a.python,[path.join(import.meta.dirname,'seo-public-verify.py'),input],{encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  let proof;try{proof=JSON.parse(r.stdout.trim());}catch{throw Error('PUBLIC_VERIFIER_PROCESS_FAILED');}
  try{publicStatus(proof);}catch{const e=Error('PUBLIC_VALIDATION_FAILED');e.proof=proof;throw e;}return proof;
 };
 const counter=()=>inventoryCounts(rows,status);
 let attempted=0;const max=a.limit?Number(a.limit):Infinity;if(!(max>0))throw Error('INVALID_LIMIT');
 for(const d of rows){const id=String(d.id);
  if(d.disposition==='skipped'){status[id]={status:'SKIPPED',reason:d.reason,eligible:d.eligible};continue;}
  if(d.disposition!=='draft')throw Error('UNREVIEWED_DISPOSITION');
  if(status[id]?.status==='VALIDATED'&&a.mode!=='verify')continue;
  if(attempted>=max){status[id]??={status:'PENDING',reason:'CHECKPOINT_CONTINUATION'};continue;}
  attempted++;const patch=patchFor(d);writer.validateContentPatch(patch);
  let plan,receipt;const previous=status[id];
  try{
   const live=await client.chamar(`/${a.kind==='categories'?'categories':'products'}/${id}`);
   let recovered=false;
   if(a.kind==='products'){
    let saved;try{saved=JSON.parse(await fs.readFile(path.join(root,'plans',id+'.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(saved){const outcome=await reconcileProduct(saved,live,writer.contentDigest,stockProducts?.get(id));recovered=outcome==='APPLIED'||outcome==='APPLIED_WITH_RECORDED_EXTERNAL_STOCK';
     if(outcome==='APPLIED_WITH_RECORDED_EXTERNAL_STOCK'){status[id]={...status[id],external_stock_observed_at:stockContext.captured_at,external_stock_snapshot_hash:await writer.contentDigest(stockContext)};await journal({type:'read_only_external_stock_reconciled',productId:id,originalPlanHash:saved.planHash,stockSnapshotHash:status[id].external_stock_snapshot_hash,stockObservedAt:stockContext.captured_at,originalPlanPreserved:true,remoteWrites:0});}
     if(recovered&&previous.status==='PENDING'){const events=(await fs.readdir(path.join(root,'journal'))).filter(f=>f.endsWith('.json'));let D0;
      for(const f of events){const e=JSON.parse(await fs.readFile(path.join(root,'journal',f),'utf8'));if((e.plan?.planHash??e.planHash)===saved.planHash&&e.type==='before_write')D0=e.recorded_at;}
      status[id]={...previous,status:'WRITTEN',written:true,contentOk:true,businessOk:true,planHash:saved.planHash,fields:Object.keys(saved.patch),D0,recovered:true};await journal({type:'interrupted_write_reconciled',productId:id,planHash:saved.planHash,after:live});
     }
    }else if(previous?.uncertain||previous?.written)throw Error('RECOVERY_PLAN_MISSING');
   }else if(previous?.uncertain){throw Error('CATEGORY_UNCERTAIN_REQUIRES_JOURNAL_RECONCILIATION');}
   if(a.mode==='verify'||recovered||previous?.status==='WRITTEN'||previous?.status==='FAILED'&&(previous?.written||previous?.uncertain)){
    if(Object.keys(patch).some(k=>localized(live[k])!==patch[k]))throw Error('UNCERTAIN_WRITE_REQUIRES_MANUAL_RECONCILIATION');
    const proof=await verify(d,live);status[id]={...status[id],status:publicStatus(proof),reason:proof.valid?'PUBLIC_VALIDATED':'PUBLIC_CACHE_PENDING',proof,verified_at:new Date().toISOString()};
   }else{
    if(!contentMatches(live,d))throw Error('CONTENT_CHANGED_SINCE_AUDIT');
    if(a.kind==='categories'){
     if(a.mode==='preview'){status[id]={status:'PREVIEWED',fields:Object.keys(patch)};continue;}
     receipt=await updateCategory(env,client,live,patch,writer.contentDigest,journal);
    }else{
     if(!live.published||live.visibility==='hidden'||!live.variants?.some(v=>(v.stock_management===false||v.stock===null||v.stock>0)&&Number(v.promotional_price||v.price)>0))throw Error('PRODUCT_NO_LONGER_ELIGIBLE');
     plan=await writer.prepareContentPlan(env,{productId:id,expectedStore:'5134350',variants:live.variants.map(v=>({sku:v.sku,variant_id:v.id})),patch},client);
     if(!contentMatches(plan.before,d))throw Error('CONTENT_CHANGED_SINCE_AUDIT');
     await atomicJson(path.join(root,'plans',id+'.json'),plan);
     if(a.mode==='preview'){await writer.applyContentPlan(env,plan,{approvedPlanHash:plan.planHash,dryRun:true},client);status[id]={status:'PREVIEWED',fields:Object.keys(patch),planHash:plan.planHash};continue;}
     receipt=await writer.applyContentPlan(env,plan,{approvedPlanHash:plan.planHash,dryRun:false,journal},client);
    }
    status[id]={status:'WRITTEN',written:true,fields:Object.keys(patch),planHash:plan?.planHash,afterHash:receipt.afterHash,contentOk:receipt.contentOk,businessOk:receipt.businessOk,D0:new Date().toISOString()};await atomicJson(statusFile,status);
    const proof=await verify(d,receipt.after);status[id]={...status[id],status:publicStatus(proof),reason:proof.valid?'PUBLIC_VALIDATED':'PUBLIC_CACHE_PENDING',proof};
   }
  }catch(e){
   status[id]={...status[id],status:'FAILED',reason:e.codigo||(/^[A-Z0-9_]+$/.test(e.message)?e.message:'REMOTE_OR_LOCAL_OPERATION_FAILED'),uncertain:(e.codigo||e.message)==='WRITE_OR_READBACK_UNCERTAIN',httpStatus:e.status,proof:e.proof};
   // A commercial regression or uncertain PUT requires review before any more writes.
   if(['POST_WRITE_VALIDATION_FAILED_STOP_BATCH','WRITE_OR_READBACK_UNCERTAIN','CATEGORY_READBACK_FAILED','RECOVERY_PLAN_INVALID','RECOVERY_CONTENT_OR_COMMERCE_DRIFT','RECOVERY_PLAN_MISSING','CATEGORY_UNCERTAIN_REQUIRES_JOURNAL_RECONCILIATION'].includes(e.codigo||e.message)){await atomicJson(statusFile,status);console.log(JSON.stringify({status:'SAFETY_STOP',id,counts:counter()}));process.exitCode=2;return;}
  }
  if(status[id].D0){const start=new Date(status[id].D0);status[id].checkpoints=Object.fromEntries([7,28,56,84].map(n=>['D'+n,new Date(start.getTime()+n*86400000).toISOString()]));}
  await atomicJson(statusFile,status);console.log(JSON.stringify({id,status:status[id].status,reason:status[id].reason,counts:counter()}));
 }
 await atomicJson(statusFile,status);const counts=counter();const complete=counts.PENDING===0&&counts.FAILED===0&&(a.mode==='preview'||counts.VALIDATED+counts.SKIPPED===rows.length);
 console.log(JSON.stringify({status:complete?'COMPLETE':a.limit?'CHECKPOINT':'INCOMPLETE',kind:a.kind,mode:a.mode,attempted,total:rows.length,counts}));
 if(!complete&&!a.limit)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))main().catch(()=>{console.error(JSON.stringify({status:'RUNNER_BLOCKED',credentialValuesPrinted:false}));process.exitCode=1;});
