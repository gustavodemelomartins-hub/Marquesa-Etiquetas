/** Candidate content-only operation using the existing official transport.
 * No D1 writes, create, visibility, handle, SKU, price, stock or image mutations.
 * Both existing production gates remain mandatory. No HTTP route is exposed.
 */
import { Nuvemshop } from '../nuvemshop.js';
import { lerConfig } from '../plataforma/config.js';
const FIELDS = new Set(['name','description','seo_title','seo_description']);
const stable = (v) => JSON.stringify(sort(v));
function sort(v) { if(Array.isArray(v)) return v.map(sort); if(v && typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])); return v; }
export async function contentDigest(value) {
 const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)));
 return [...new Uint8Array(raw)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function fail(code) { const e=new Error(code);e.codigo=code;throw e; }
export function validateContentPatch(patch) {
 if(!patch || typeof patch!=='object' || Array.isArray(patch) || !Object.keys(patch).length) fail('EMPTY_CONTENT_PATCH');
 for(const [k,v] of Object.entries(patch)) {
  if(!FIELDS.has(k)) fail('FIELD_OUTSIDE_CONTENT_SCOPE');
  if(typeof v!=='string' || !v.trim()) fail('INVALID_CONTENT_VALUE');
  if(k!=='description' && /[<>]/.test(v)) fail('HTML_IN_TEXT_FIELD');
  const max={name:100,description:40000,seo_title:70,seo_description:320}[k];
  if([...v].length>max) fail('CONTENT_TOO_LONG');
  if(k==='description' && /<(?:script|style|iframe|object|embed|form|input)\b|\bon\w+\s*=|(?:javascript|data)\s*:/i.test(v)) fail('UNSAFE_DESCRIPTION_HTML');
 }
 return patch;
}
export function contentProjection(p) { return Object.fromEntries([...FIELDS].map(k=>[k,p[k] ?? null])); }
function businessProjection(p) { const copy=structuredClone(p); for(const k of [...FIELDS,'updated_at']) delete copy[k]; for(const v of copy.variants||[]) delete v.updated_at;return copy; }
function assertIdentity(p,id,variants) {
 if(String(p.id)!==String(id) || !Array.isArray(variants) || !variants.length) fail('PRODUCT_IDENTITY_MISMATCH');
 const actual=p.variants||[];
 if(actual.length!==variants.length || variants.some(v=>!actual.some(a=>String(a.id)===String(v.variant_id) && String(a.sku)===String(v.sku)))) fail('VARIANT_SKU_IDENTITY_MISMATCH');
 if(new Set(variants.map(v=>String(v.variant_id))).size!==variants.length) fail('DUPLICATE_VARIANT');
}
function apiPayload(before,patch) {
 const out={};for(const [k,v] of Object.entries(patch)) {
  if(before[k] && typeof before[k]==='object' && !Array.isArray(before[k])) {
   out[k]={...before[k],pt:v};
  } else if(k==='seo_title' || k==='seo_description') {
   if(before[k] == null) out[k]={pt:v};
   else if(typeof before[k]==='string') out[k]=v;
   else fail('UNVERIFIED_TRANSLATION_SHAPE');
  } else fail('UNVERIFIED_TRANSLATION_SHAPE');
 }
 return out;
}
function assertEnv(env,expectedStore,write) {
 const cfg=lerConfig(env).nuvemshop;
 if(!cfg.loja || !cfg.token) fail('NUVEMSHOP_CREDENTIAL_NOT_CONFIGURED');
 if(!expectedStore || cfg.loja!==String(expectedStore)) fail('STORE_IDENTITY_MISMATCH');
 if(cfg.base && cfg.base!=='https://api.nuvemshop.com.br') fail('UNEXPECTED_NUVEMSHOP_ORIGIN');
 if(write && (!cfg.escritaHabilitada || !cfg.publicacaoHabilitada)) fail('CATALOGUE_WRITE_GATE_DISABLED');
}
export async function prepareContentPlan(env,{productId,expectedStore,variants,patch},client=new Nuvemshop(env)) {
 if(!/^\d+$/.test(String(productId))) fail('INVALID_PRODUCT_ID');
 assertEnv(env,expectedStore,false);validateContentPatch(patch);
 const before=await client.produto(productId);assertIdentity(before,productId,variants);
 const payload=apiPayload(before,patch);const plan={productId:String(productId),expectedStore:String(expectedStore),variants:structuredClone(variants),patch:structuredClone(patch),payload,before,beforeHash:await contentDigest(before),businessHash:await contentDigest(businessProjection(before))};
 plan.planHash=await contentDigest(plan);return plan;
}
export async function applyContentPlan(env,plan,{approvedPlanHash,journal,dryRun=true}={},client=new Nuvemshop(env)) {
 assertEnv(env,plan.expectedStore,!dryRun);validateContentPatch(plan.patch);
 const {planHash,...body}=plan;
 if(approvedPlanHash!==planHash || await contentDigest(body)!==planHash) fail('UNAPPROVED_OR_CHANGED_PLAN');
 const fresh=await client.produto(plan.productId);assertIdentity(fresh,plan.productId,plan.variants);
 if(await contentDigest(fresh)!==plan.beforeHash) fail('PRODUCT_CHANGED_SINCE_PREVIEW');
 if(stable(apiPayload(fresh,plan.patch))!==stable(plan.payload)) fail('PAYLOAD_MISMATCH');
 if(dryRun) return {status:'PREVIEW',remoteWrites:0,planHash,fields:Object.keys(plan.payload)};
 if(typeof journal!=='function') fail('DURABLE_BACKUP_REQUIRED');
 // Caller must await a durable private snapshot/diff. A failed backup aborts PUT.
 await journal({type:'before_write',plan});
 // This check is not atomic CAS: upstream API If-Match support is unproven.
 const immediate=await client.produto(plan.productId);
 if(await contentDigest(immediate)!==plan.beforeHash) fail('PRODUCT_CHANGED_BEFORE_WRITE');
 let after;
 try { await client.atualizarProduto(plan.productId,plan.payload); after=await client.produto(plan.productId); }
 catch { await journal({type:'write_or_readback_uncertain',planHash});fail('WRITE_OR_READBACK_UNCERTAIN'); }
 const desired={...contentProjection(fresh),...plan.payload};
 const contentOk=stable(contentProjection(after))===stable(desired);
 const businessOk=await contentDigest(businessProjection(after))===plan.businessHash;
 const receipt={type:'readback',planHash,productId:plan.productId,after,afterHash:await contentDigest(after),contentOk,businessOk,remoteWrites:1,publicValidation:'PENDING'};
 await journal(receipt);
 if(!contentOk || !businessOk) fail('POST_WRITE_VALIDATION_FAILED_STOP_BATCH');
 return receipt;
}
export async function rollbackContentPlan(env,plan,receipt,{journal}={},client=new Nuvemshop(env)) {
 assertEnv(env,plan.expectedStore,true);
 validateContentPatch(plan.patch);
 const {planHash,...body}=plan;
 if(await contentDigest(body)!==planHash) fail('CHANGED_ROLLBACK_PLAN');
 if(!receipt.after || await contentDigest(receipt.after)!==receipt.afterHash) fail('INVALID_ROLLBACK_AFTER_HASH');
 if(typeof journal!=='function' || receipt.planHash!==plan.planHash || receipt.productId!==plan.productId) fail('INVALID_ROLLBACK_RECEIPT');
 const current=await client.produto(plan.productId);
 if(await contentDigest(current)!==receipt.afterHash) fail('ROLLBACK_CONCURRENT_EDIT');
 const payload=Object.fromEntries(Object.keys(plan.patch).map(k=>[k,plan.before[k]]));
 await journal({type:'before_rollback',productId:plan.productId,payload,current});
 const immediate=await client.produto(plan.productId);
 if(await contentDigest(immediate)!==receipt.afterHash) fail('ROLLBACK_CONCURRENT_EDIT');
 await client.atualizarProduto(plan.productId,payload);
 const after=await client.produto(plan.productId);
 const good=Object.keys(payload).every(k=>stable(after[k])===stable(payload[k])) && await contentDigest(businessProjection(after))===plan.businessHash;
 await journal({type:'rollback_readback',productId:plan.productId,ok:good});
 if(!good) fail('ROLLBACK_VALIDATION_FAILED');
 return {status:'ROLLED_BACK',remoteWrites:1};
}


/** Expand only after every earlier reviewed product passed public verification. */
export function selectContentPlan(plans,productId,proofs=[]) {
 if(!Array.isArray(plans)||!plans.length||plans.length>10) fail('INVALID_REVIEWED_BATCH');
 const index=productId==null?0:plans.findIndex(p=>p.productId===String(productId));
 if(index<0) fail('PRODUCT_OUTSIDE_REVIEWED_BATCH');
 const required=['http_200','canonical_unchanged','title_matches','meta_matches','description_matches','images_count_unchanged'];
 const verified=p=>Array.isArray(proofs)&&proofs.some(v=>v.productId===p.productId&&v.planHash===p.planHash&&v.valid===true&&v.checks&&typeof v.checks==='object'&&!Array.isArray(v.checks)&&required.every(k=>Object.hasOwn(v.checks,k)&&v.checks[k]===true)&&Object.values(v.checks).every(x=>x===true));
 if(verified(plans[index])) fail('PRODUCT_ALREADY_PUBLICLY_VALIDATED');
 if(plans.slice(0,index).some(p=>!verified(p))) fail('PREVIOUS_PRODUCT_PUBLIC_VALIDATION_REQUIRED');
 return plans[index];
}
