import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root=process.cwd(), ux='docs/ux/';
const manifest=JSON.parse(await fs.readFile(ux+'prototype/routes.json','utf8'));
const output=path.resolve(process.argv[2]||'.tmp/prototype-site');
if(!output.startsWith(root+path.sep))throw Error('Output must be inside workspace');
const prototypeOutput=path.join(output,'prototype');
if(!prototypeOutput.startsWith(output+path.sep))throw Error('Prototype output escaped target');
await fs.rm(prototypeOutput,{recursive:true,force:true});
const sources=[...new Set(manifest.pages.map(p=>ux+p.source))];
const assets=new Map();
const read=f=>fs.readFile(f,'utf8');
const resolve=(from,ref)=>path.posix.normalize(path.posix.join(path.posix.dirname(from),ref.split(/[?#]/)[0]));
function assetAllowed(f){return /^(docs\/ux\/(prototype|03-screens)\/[^]*\.(css|js)|docs\/ux\/01-brand\/logo_sistema-marquesa_preta-transparente\.png|brand\/fonts\/(jost|cormorant)\.woff2|docs\/ux\/03-screens\/catalogo\/images\/[^/]+\.(svg|webp|png))$/.test(f)&&!f.includes('/concepts/')&&!f.includes('verify-');}
async function collect(f){
  if(assets.has(f))return;
  if(!assetAllowed(f))throw Error('Asset outside allowlist: '+f);
  const data=await fs.readFile(f);assets.set(f,data);
  if(/\.(js|css)$/.test(f))await dependencies(f,data.toString());
}
async function dependencies(from,text){
  for(const match of text.matchAll(/(?:src\s*=\s*["']|url\(\s*["']?)([^"'\s)<>]+)|["']([^"'\s]+\.(?:css|js|woff2|png|webp|svg))(?:\?[^"']*)?["']/g)){
    const ref=match[1]||match[2];
    if(!ref||/^(data:|https?:|#|\/)/.test(ref)||ref.includes('${'))continue;
    if(/\.(?:css|js|woff2|png|webp|svg)(?:[?#]|$)/.test(ref))await collect(resolve(from,ref));
  }
}
for(const f of sources)await dependencies(f,await read(f));
for(const f of ['prototype/system.js','prototype/system.css','prototype/demo-store.js','prototype/module-state.js','01-brand/logo_sistema-marquesa_preta-transparente.png'])await collect(ux+f);
const hash=crypto.createHash('sha256');
for(const f of sources)hash.update(await read(f));
for(const [f,b] of [...assets].sort())hash.update(f).update(b);
hash.update(JSON.stringify(manifest));
const version=hash.digest('hex').slice(0,12),base='/prototype/_assets/'+version+'/';
// Marca da aba: monograma Marquesa em bordo, embutido - evita requisicao de favicon.
const favicon="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#4a0b22"/><text x="16" y="23" font-family="Georgia,serif" font-size="20" fill="#fff" text-anchor="middle">M</text></svg>');
function routeFor(f,tail=''){
  const [query,fragment]=tail.split('#');
  const candidates=manifest.pages.filter(p=>ux+p.source===f);
  const page=candidates.find(p=>p.view===fragment)||candidates[0];
  if(!page)return null;
  return page.path+(query||'')+(fragment&&fragment!==page.view?'#'+fragment:'');
}
function transform(text,from,route){
  if(from==='docs/ux/prototype/system.js')return text;
  text=text.replace(/(["'`])([^"'`\s<>]+\.html)((?:\?[^"'`\s<>#]*)?(?:#[^"'`\s<>]*)?)\1/g,(all,q,ref,tail)=>{
    if(/^(https?:|data:)/.test(ref)||ref.includes('${'))return all;
    const target=routeFor(resolve(from,ref),tail);
    if(!target)throw Error('Unmapped HTML link '+ref+' in '+from);
    return q+target+q;
  });
  // Private handoff documents stay in Git; the public hub links its generated inventory.
  text=text.replace(/href=["'][^"']+\.md(?:#[^"']*)?["']/g,'href="/prototype/hub/#inventory"');
  if(route)text=text.replace(/\b(href|data-href)=(["'])#([^"']*)\2/g,(_all,attribute,_quote,fragment)=>`${attribute}="${route}#${fragment}"`);
  return text;
}
await fs.mkdir(output,{recursive:true});
for(const [f,data] of assets){
  const dest=path.join(output,base,f);await fs.mkdir(path.dirname(dest),{recursive:true});
  await fs.writeFile(dest,/\.(css|js)$/.test(f)?transform(data.toString(),f):data);
}
for(const page of manifest.pages){
  const f=ux+page.source;let html=transform(await read(f),f,page.path);
  const config={...page,version,assetBase:base,pages:manifest.pages,flows:manifest.flows};
  html=html.replace('<head>',`<head>\n<base href="${base+path.posix.dirname(f)}/">\n<link rel="icon" href="${favicon}">\n<meta name="robots" content="noindex,nofollow">\n<script>window.__MARQUESA_PROTOTYPE__=${JSON.stringify(config).replaceAll('<','\\u003c')};</script>`);
  html=html.replace(/<script\b[^>]*src=["'][^"']*demo-store\.js[^"']*["'][^>]*><\/script>/g,'');
  html=html.replace('<head>','<head>\n<script src="'+base+ux+'prototype/demo-store.js"></script>');
  if(!html.includes('system.css'))html=html.replace('</head>',`<link rel="stylesheet" href="${base+ux}prototype/system.css"></head>`);
  if(!html.includes('src="system.js"')&&!html.includes('prototype/system.js'))html=html.replace('</head>',`<script defer src="${base+ux}prototype/system.js"></script></head>`);
  html=html.replace('</head>',`<script defer src="${base+ux}prototype/module-state.js"></script></head>`);
  const dest=path.join(output,page.path,'index.html');await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,html);
}
let sha='local';try{sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
await fs.writeFile(path.join(output,'prototype','build.json'),JSON.stringify({sha,version,approval:manifest.approval,counts:manifest.counts,pages:manifest.pages.map(({id,path,label,source,view})=>({id,path,label,source,view})),flows:manifest.flows,future:manifest.future},null,2));
console.log(`Prototype: ${manifest.pages.length} routes, ${assets.size} allowlisted assets; version ${version}; ${output}`);
