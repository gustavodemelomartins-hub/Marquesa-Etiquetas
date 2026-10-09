"""Read-only full storefront audit and factual catalogue SEO proposals.

No authenticated requests, catalogue writes or secrets. Two network workers,
per-URL immutable HTML/checkpoint cache, API snapshot and observed GSC only.
"""
import argparse, concurrent.futures, hashlib, html as htmlmod, json, re, sys, time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import xml.etree.ElementTree as ET

ORIGIN = 'https://marquesasemijoias.com.br'
PRESERVE = ['name','handle','canonical_url','variants','images','categories','price','stock','sku','brand','published','visibility']

def tr(value):
    return value.get('pt','') if isinstance(value,dict) else value or ''

def key(url):
    p=urlsplit(url)
    return p.scheme+'://'+p.netloc+p.path.rstrip('/') or ORIGIN

def norm(value):
    return re.sub(r'\s+',' ',value or '').casefold().strip()

def write_json(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    # Windows virus scanners/readers can briefly hold a checkpoint open.
    for attempt in range(6):
        try:tmp.replace(path);break
        except PermissionError:
            if attempt==5:raise
            time.sleep(.15*(attempt+1))

def safe_url(url):
    p=urlsplit(url)
    return p.scheme=='https' and p.netloc=='marquesasemijoias.com.br' and not re.search(r'/(?:checkout|finalizar|cart|carrinho|account|login)(?:/|$)',p.path,re.I)

def schema_nodes(node):
    if isinstance(node,dict):
        if '@type' in node: yield node
        for value in node.values(): yield from schema_nodes(value)
    elif isinstance(node,list):
        for value in node: yield from schema_nodes(value)

def augment_page(raw, url, status, parser, BeautifulSoup):
    page=parser(raw,url,status)
    if status!=200 or page.get('gap'): return page
    soup=BeautifulSoup(raw,'html.parser')
    can=soup.find('link',rel='canonical')
    page['canonical_exact']=urljoin(url,can.get('href','')) if can else None
    page['h1_count']=len(soup.select('h1'))
    micro=[]
    for scope in soup.select('[itemscope][itemtype]'):
        if not re.search(r'/(?:Product|ProductGroup)$',scope.get('itemtype','')): continue
        props={}
        for tag in scope.select('[itemprop]'):
            for name in tag.get('itemprop','').split():
                val=tag.get('content') or tag.get('href') or tag.get('src') or tag.get_text(' ',strip=True)
                if val: props.setdefault(name,[]).append(val)
        micro.append({'@type':scope['itemtype'].rsplit('/',1)[-1],'properties':props})
    page['microdata_products']=micro
    main_json=[]; other_products=[]; organization_without_logo=0
    for script in soup.select('script[type="application/ld+json"]'):
        try: nodes=list(schema_nodes(json.loads(script.get_text())))
        except (ValueError,TypeError): continue
        for node in nodes:
            types=node.get('@type',[]); types=types if isinstance(types,list) else [types]
            if 'Organization' in types and not node.get('logo'): organization_without_logo+=1
            if not any(t in ('Product','ProductGroup') for t in types): continue
            offers=node.get('offers',[]); offers=offers if isinstance(offers,list) else [offers]
            urls=[node.get('url')]+[x.get('url') for x in offers if isinstance(x,dict)]
            if any(u and key(urljoin(url,u))==key(page.get('canonical_exact') or url) for u in urls): main_json.append(node)
            else: other_products.append({k:node.get(k) for k in ('@type','name','sku','url')})
    page['main_product_jsonld']=main_json
    schema_issues=[]
    for product in main_json:
        for field in ('name','image','offers'):
            if not product.get(field):schema_issues.append('MAIN_PRODUCT_'+field.upper()+'_MISSING')
        offers=product.get('offers',[]);offers=offers if isinstance(offers,list) else [offers]
        for offer in offers:
            if not isinstance(offer,dict):continue
            if not offer.get('priceCurrency'):schema_issues.append('MAIN_OFFER_CURRENCY_MISSING')
            elif offer.get('priceCurrency')!='BRL':schema_issues.append('MAIN_OFFER_CURRENCY_NOT_BRL')
            try:
                if float(offer.get('price',0))<=0:schema_issues.append('MAIN_OFFER_PRICE_NOT_POSITIVE')
            except (ValueError,TypeError):schema_issues.append('MAIN_OFFER_PRICE_INVALID')
            if not str(offer.get('availability','')).startswith('https://schema.org/'):schema_issues.append('MAIN_OFFER_AVAILABILITY_MISSING_OR_INVALID')
    page['main_product_schema_issues']=sorted(set(schema_issues))
    page['recommended_product_jsonld_count']=len(other_products)
    page['organization_without_logo_count']=organization_without_logo
    page['main_product_schema_present']=bool(main_json or micro)
    page['schema_provenance']='JSON-LD scoped by own canonical/offer URL; Product microdata from own page scopes'
    # Retain the original parser output, but use actual main-page schema for gaps.
    page['jsonld_product_schema_from_recommendations_only']=bool(page.get('schema') and not main_json)
    page['parameter_links']=sorted({urljoin(url,a['href']) for a in soup.select('a[href]') if '?' in a['href'] and safe_url(urljoin(url,a['href']))})
    page['purchase_cta_disabled']=bool(soup.select('.js-addtocart[disabled], [name="add_to_cart"][disabled]'))
    return page

class Fetcher:
    def __init__(self, out, parser, BeautifulSoup, requests):
        self.cache=out/'public-before'; self.cache.mkdir(parents=True,exist_ok=True)
        self.parser=parser; self.bs=BeautifulSoup; self.requests=requests
    def paths(self,url):
        slug=hashlib.sha256(url.encode()).hexdigest()[:24]
        return self.cache/(slug+'.html'),self.cache/(slug+'.json')
    def fetch(self,url):
        htmlpath,jsonpath=self.paths(url)
        if jsonpath.exists(): return json.loads(jsonpath.read_text(encoding='utf-8'))
        if not safe_url(url): return {'url':url,'gap':'UNSAFE_OR_OUTSIDE_ORIGIN','status':None}
        for attempt in range(3):
            try:
                response=self.requests.get(url,timeout=(12,40),headers={'User-Agent':'Marquesa-SEO/1.0 (read-only catalogue audit)'},allow_redirects=False)
                history=[]; hop=response
                for _ in range(5):
                    if hop.status_code not in (301,302,303,307,308): break
                    target=urljoin(hop.url,hop.headers.get('Location',''))
                    history.append({'url':hop.url,'status':hop.status_code,'location':target})
                    if not safe_url(target): break
                    hop=self.requests.get(target,timeout=(12,40),headers={'User-Agent':'Marquesa-SEO/1.0 (read-only catalogue audit)'},allow_redirects=False)
                if hop.status_code in (429,500,502,503,504) and attempt<2:
                    time.sleep(2**(attempt+1)); continue
                raw=hop.content.decode('utf-8',errors='replace')
                htmlpath.write_bytes(hop.content)
                if 'xml' in hop.headers.get('Content-Type','') or url.endswith(('.xml','.txt')):
                    page={'url':url,'status':hop.status_code,'content_type':hop.headers.get('Content-Type'),'body_bytes':len(hop.content)}
                else: page=augment_page(raw,url,hop.status_code,self.parser,self.bs)
                page.update({'initial_status':response.status_code,'final_url':hop.url,'redirects':history,'fetched_at':datetime.now(timezone.utc).isoformat(),'public_baseline_path':str(htmlpath.resolve()),'checkpoint_path':str(jsonpath.resolve()),'x_robots_tag':hop.headers.get('X-Robots-Tag'),'cache_headers':{k:hop.headers.get(k) for k in ('Date','Age','CF-Cache-Status','Cache-Control')},'attempts':attempt+1})
                write_json(jsonpath,page); return page
            except self.requests.RequestException as exc:
                if attempt<2: time.sleep(2**(attempt+1)); continue
                page={'url':url,'status':None,'gap':'FETCH_FAILED','error_type':type(exc).__name__,'attempts':attempt+1,'fetched_at':datetime.now(timezone.utc).isoformat()}
                write_json(jsonpath,page); return page

def stock_price(product):
    vs=product.get('variants',[])
    stock=sum(v.get('stock') or 0 for v in vs)
    prices=[float(v.get('promotional_price') or v.get('price') or 0) for v in vs]
    eligible=bool(product.get('published') and any(float(v.get('promotional_price') or v.get('price') or 0)>0 and (v.get('stock') is None or v.get('stock',0)>0) for v in vs))
    return stock,min(prices) if prices else 0,eligible

def compact_name(name):
    name=re.sub(r'\s+',' ',name).strip()
    for old,new in [(r'\bBanho de Ouro\b','Banho Ouro'),(r'\bBanho de Ródio\b','Banho Ródio'),(r'\bBanho de Prata\b','Banho Prata'),(r'\bCravejado em Zircônias\b','com Zircônias'),(r'\bCravejada em Zircônias\b','com Zircônias')]:
        if len(name)>60: name=re.sub(old,new,name,flags=re.I)
    return name

def facts_for(product, BeautifulSoup):
    body=tr(product.get('description')); soup=BeautifulSoup(body,'html.parser')
    lines=[p.get_text(' ',strip=True) for p in soup.select('p,li')]
    facts={}
    for label,pattern in [('material',r'^Material\s*:\s*(.+)'),('finish',r'^Banho\s*:\s*(.+)'),('measure',r'^(?:Medidas?(?: das? peças?| corrente| pingente)?|Comprimento|Diâmetro|Tamanho)\s*:\s*(.+)'),('color',r'^Cores?\s*:\s*(.+)')]:
        for line in lines:
            match=re.search(pattern,line,re.I)
            if match:
                val=re.sub(r'\s+',' ',match.group(1)).strip(' ;.\xa0')
                if val and len(val)<130:
                    facts[label]=val
                    if label=='measure':facts['measurement_source_line']=line
                break
    return facts,lines

def intro_for(name,facts):
    n=norm(name)
    if 'chaveiro' in n: use='acompanhar as chaves ou complementar um presente'
    elif 'berloque' in n: use='personalizar a composição da sua pulseira'
    elif 'tornozel' in n: use='compor o visual com destaque no tornozelo'
    elif 'hand chain' in n or 'pulseira de mão' in n: use='compor um acessório entre o pulso e a mão'
    elif 'choker' in n: use='compor o visual próximo ao pescoço ou combinar com colares de outros comprimentos'
    elif 'colar' in n or 'gargantilha' in n or 'cordão' in n: use='compor o colo e combinar com os acessórios do seu visual'
    elif 'anel' in n or 'aliança' in n: use='compor um mix de anéis ou usar como destaque nas mãos'
    elif 'piercing' in n or 'piecing' in n: use='complementar a composição de acessórios na orelha'
    elif 'brinco' in n: use='dar destaque à composição de acessórios junto ao rosto'
    elif 'pulseira' in n or 'bracelete' in n: use='compor o pulso com outros acessórios ou usar como destaque'
    elif 'conjunto' in n: use='combinar as peças em uma mesma composição de acessórios'
    else: use=None
    if not use: return None
    # Design-specific context only when explicitly recorded in commercial name.
    details=[('coração','O desenho de coração destaca o tema afetivo da peça.'),('flor','O motivo de flor acrescenta uma referência floral à composição.'),('cruz','O desenho de cruz permite destacar esse símbolo no visual.'),('trevo','O formato de trevo traz um motivo reconhecível à composição.'),('estrela','O motivo de estrela destaca o desenho da peça.'),('argola','O formato de argola pode ser combinado com outros acessórios da mesma proposta.'),('ponto de luz','O ponto de luz serve como detalhe focal na composição de acessórios.'),('elo','O desenho de elos destaca a estrutura da peça.'),('pérola','O detalhe de pérola permite combinar a peça com outros acessórios de pérolas.'),('pet','O motivo pet permite destacar esse tema na composição.')]
    design=next((sentence for token,sentence in details if token in n),'')
    sentences=[name+'.']
    if design: sentences.append(design)
    if 'aparador' in n:sentences.append('Use junto à aliança ou a um anel solitário para compor as mãos.')
    elif 'chaveiro' in n:sentences.append('Um acessório para reunir as chaves e presentear com o tema da peça.')
    elif 'berloque' in n:sentences.append('Escolha este motivo para personalizar sua pulseira de berloques.')
    elif 'choker' in n:sentences.append('Use próximo ao pescoço ou em uma composição com colares de outros comprimentos.')
    elif 'hand chain' in n or 'pulseira de mão' in n:sentences.append('A proposta hand chain conecta a composição do pulso à mão.')
    elif 'regulável' in n:sentences.append('O modelo regulável permite compor um mix de acessórios; confira os detalhes do ajuste na ficha da peça.')
    elif 'argola' in n:sentences.append('Combine com brincos ou piercings para criar uma composição na orelha.')
    elif 'anel' in n:sentences.append('Use sozinho ou junto a outros anéis para destacar esse desenho nas mãos.')
    elif 'colar' in n or 'cordão' in n:sentences.append('Combine com outros comprimentos de colar ou deixe o desenho em destaque no colo.')
    elif 'pulseira' in n or 'bracelete' in n:sentences.append('Use no pulso como destaque ou combine com outras pulseiras.')
    elif 'brinco' in n or 'piercing' in n or 'piecing' in n:sentences.append('Combine com outros acessórios da orelha para destacar o desenho da peça.')
    elif 'conjunto' in n:sentences.append('As peças do conjunto podem ser usadas juntas em uma mesma composição.')
    elif use:sentences.append('Para '+use+'.')
    if facts.get('measure') and re.search(r'\d',facts['measure']): sentences.append('Medida: '+facts['measure']+'.')
    return ' '.join(sentences)

def title_needs_change(title,name):
    return bool(not title or len(title.encode('utf-8'))>70 or re.search(r'elegân|sofistica|brilho|glamour|delicadeza|charme|exclusiv|\bEst$',title,re.I) or (re.search(r'ouro\s*18k',title,re.I) and re.search(r'banho|banhad',name,re.I) and not re.search(r'banho|banhad',title,re.I)) or (re.search(r'banho de prata',name,re.I) and 'banho' not in norm(title)))

def meta_needs_change(meta,name):
    if not meta or not 65<=len(meta)<=160:return True
    n=norm(name);m=norm(meta)
    specific=[word for word in re.findall(r'\w+',n) if len(word)>3 and word not in ('banho','prata','ouro','brinco','colar','anel','pulseira')]
    if specific and not any(word in m for word in specific):return True
    if 'banho' in n and ('ouro' in n or 'prata' in n) and 'banho' not in m:return True
    return bool(re.search(r'garant|durável|durabilidade|hipoalerg|perfeito para qualquer|sorte|boas energias|ajuste perfeito',meta,re.I))

def natural_meta(name,facts):
    n=norm(name);base=compact_name(name)
    measure=facts.get('measure','')
    if measure and len(measure)<40:
        measure=measure.replace('≅','aprox.').replace('≈','aprox.').strip()
        detail=' Medida: '+measure+'.'
    elif 'choker' in n:detail=' Para usar próximo ao pescoço ou em mix de colares.'
    elif 'aparador' in n:detail=' Para combinar com sua aliança ou anel solitário.'
    elif 'berloque' in n:detail=' Personalize a composição da sua pulseira.'
    elif 'hand chain' in n:detail=' Um detalhe para compor o pulso e a mão.'
    elif 'argola' in n:detail=' Combine com seus brincos e piercings.'
    elif 'conjunto' in n:detail=' Use as peças juntas na mesma composição.'
    elif 'anel' in n:detail=' Use sozinho ou em um mix de anéis.'
    elif 'pulseira' in n:detail=' Combine no pulso com outros acessórios.'
    elif 'brinco' in n:detail=' Destaque o desenho junto ao rosto.'
    elif 'colar' in n or 'cordão' in n:detail=' Destaque o desenho no colo.'
    else:detail=''
    meta=base+'.'+detail+' Confira os detalhes.'
    if len(meta)>160:meta=base+'. Veja os detalhes e opções disponíveis na Marquesa.'
    if len(meta)>160:meta=base+'. Confira os detalhes.'
    return meta

def preserved_tail(body):
    # Exact source substring after first top-level paragraph; never serialize ficha/care.
    match=re.match(r'^\s*<p\b[^>]*>.*?</p>',body,re.I|re.S)
    if not match: return None
    first=match.group(0)
    if re.search(r'Informações|Material\s*:|Banho\s*:|Medidas?\s*:|Como cuidar|Como preservar|Garantia',htmlmod.unescape(first),re.I): return None
    return body[match.end():]

def gsc_map(dataset,pages):
    buckets={}
    for row in dataset.get('page',{}).get('rows',[]):
        url=row['keys'][0]; page=pages.get(url)
        # Group observed aliases only with a fetched canonical proof.
        target=key(page['canonical_exact']) if page and page.get('canonical_exact') and page.get('status')==200 else key(url) if not urlsplit(url).query else url
        entry=buckets.setdefault(target,{'clicks':0,'impressions':0,'weighted':0,'source_urls':[],'queries':[]})
        entry['clicks']+=row['clicks'];entry['impressions']+=row['impressions'];entry['weighted']+=row['position']*row['impressions'];entry['source_urls'].append(url)
    for row in dataset.get('pageQuery',{}).get('rows',[]):
        url,query=row['keys']; page=pages.get(url)
        target=key(page['canonical_exact']) if page and page.get('canonical_exact') and page.get('status')==200 else key(url) if not urlsplit(url).query else url
        if target in buckets: buckets[target]['queries'].append({'query':query,'clicks':row['clicks'],'impressions':row['impressions'],'position':row['position']})
    for entry in buckets.values():
        entry['position']=entry.pop('weighted')/entry['impressions'] if entry['impressions'] else None
        entry['ctr']=entry['clicks']/entry['impressions'] if entry['impressions'] else None
        entry['search_volume_unknown']=True
    return buckets

def build_drafts(snapshot,pages,sitemap_urls,prior_ids,dataset,BeautifulSoup,auditmodule,partial=False):
    metrics=gsc_map(dataset,pages); cats={c['id']:c for c in snapshot['categories']}
    cat_urls={}
    for cat in cats.values():
        path=[];cursor=cat;seen=set()
        while cursor and cursor['id'] not in seen:
            seen.add(cursor['id']);path.insert(0,tr(cursor['handle']));cursor=cats.get(cursor.get('parent'))
        cat_urls[cat['id']]=ORIGIN+'/'+'/'.join(path)+'/'
    duplicates=auditmodule.duplicate_fields(list(pages.values()))
    product_drafts=[]; used_titles={};used_metas={}; sku_index=defaultdict(list); gaps=defaultdict(list)
    name_groups=defaultdict(list)
    for product in snapshot['products']:
        if product.get('published'):name_groups[norm(tr(product.get('name')))].append(product)
    for p in snapshot['products']:
        for v in p.get('variants',[]):
            if v.get('sku'): sku_index[v['sku']].append({'id':p['id'],'variant_id':v['id']})
            else: gaps['missing_sku'].append({'id':p['id'],'variant_id':v['id']})
    for sku,items in sku_index.items():
        if len(items)>1: gaps['duplicate_sku'].append({'sku':sku,'products':items,'across_products':len({x['id'] for x in items})>1})
    for p in snapshot['products']:
        name=tr(p.get('name'));url=p.get('canonical_url') or ORIGIN+'/produtos/'+tr(p['handle'])+'/'
        page=pages.get(url) or pages.get(url.rstrip('/')) or next((x for x in pages.values() if x.get('produto_id_loja') and str(x['produto_id_loja'])==str(p['id']) and not urlsplit(x['url']).query),None)
        stock,price,eligible=stock_price(p);facts,lines=facts_for(p,BeautifulSoup)
        problems=auditmodule.page_problems(page,duplicates) if page else ['PUBLIC_NOT_YET_FETCHED' if partial else 'PUBLIC_PAGE_UNAVAILABLE']
        if page and page.get('main_product_schema_present'): problems=[x for x in problems if x!='PRODUCT_SCHEMA_MISSING']
        if page and page.get('main_product_jsonld')==[] and page.get('microdata_products'): problems.append('MAIN_PRODUCT_SCHEMA_MICRODATA')
        if page and page.get('status')==200 and page.get('page_type')=='product' and not page.get('purchase_cta_present'): problems.append('PURCHASE_CTA_MISSING')
        if any(re.search(r'hipoalerg|garantia|à prova d.?água|não escurece|sorte|boas energias',line,re.I) for line in lines): gaps['legacy_claims'].append({'id':p['id'],'lines':[line for line in lines if re.search(r'hipoalerg|garantia|à prova d.?água|não escurece|sorte|boas energias',line,re.I)]})
        images=sorted(p.get('images',[]),key=lambda x:x.get('position',999))
        if not images:gaps['missing_images'].append({'id':p['id']})
        elif (images[0].get('width') or 0)<500 or (images[0].get('height') or 0)<500:gaps['main_image_below_500'].append({'id':p['id'],'image_id':images[0]['id'],'width':images[0].get('width'),'height':images[0].get('height')})
        if re.search(r'\d+$|[a-z]{5}$',tr(p.get('handle'))) and re.search(r'-[a-z]{5}$|\d+$',tr(p.get('handle'))):gaps['legacy_handle_review'].append({'id':p['id'],'handle':tr(p['handle']),'gsc_impressions':metrics.get(key(url),{}).get('impressions'),'action':'KEEP; no handle change authorized'})
        entry={'id':p['id'],'url':url,'name':name,'eligible':eligible,'disposition':'skipped','reason':None,'before':{f:p.get(f,{'pt':''}) for f in ('seo_title','seo_description','description')},'after':{},'preserve_contract':PRESERVE,'evidence':{'registered_name':name,'facts':facts,'variant_ids':[v['id'] for v in p.get('variants',[])],'public_baseline_path':page.get('public_baseline_path') if page else None,'canonical_exact':page.get('canonical_exact') if page else None,'stock_snapshot':stock,'min_price_snapshot':price,'content_generated_without_new_guarantees_or_health_claims':True},'gsc':metrics.get(key(url),{}),'problems':problems}
        score,parts=auditmodule.opportunity_score(problems,entry['gsc'],stock,price);entry['priority_score']=score;entry['priority_components']=parts
        if not p.get('published'):entry['reason']='HIDDEN_OR_UNPUBLISHED_PRESERVE'
        elif not eligible:entry['reason']='NO_SELLABLE_VARIANT_PRESERVE'
        elif page is None:entry['reason']='PUBLIC_NOT_YET_FETCHED' if partial else 'PUBLIC_BASELINE_UNAVAILABLE'
        elif page.get('status')!=200 or page.get('gap'):entry['reason']='PUBLIC_BASELINE_UNAVAILABLE'
        elif page.get('produto_id_loja') and str(page['produto_id_loja'])!=str(p['id']):entry['reason']='PUBLIC_ID_MISMATCH'
        elif key(page.get('canonical_exact') or '')!=key(url):entry['reason']='CANONICAL_MISMATCH_REQUIRES_INVESTIGATION'
        elif p['id'] in prior_ids:entry['reason']='PREVIOUS_45_REAUDITED_CONTENT_PRESERVED';entry['previous_published_reaudited']=True
        elif facts.get('color') and ('incolor' in norm(name) and re.search(r'verde|azul|vermelh|rosa|roxo',norm(facts['color']))):
            entry['reason']='DATA_GAP_NAME_COLOR_CONFLICT';gaps['factual_conflicts'].append({'id':p['id'],'name':name,'color':facts['color'],'action':'PRESERVE; no new claims until conflict resolved'})
        elif (name_karats:=set(re.findall(r'\b(\d{1,2})\s*k\b',name,re.I))) and (fact_karats:=set(re.findall(r'\b(\d{1,2})\s*k\b',facts.get('finish',''),re.I))) and name_karats!=fact_karats:
            entry['reason']='DATA_GAP_FINISH_CONFLICT';gaps['factual_conflicts'].append({'id':p['id'],'name':name,'finish':facts['finish'],'action':'PRESERVE; no new claims until conflict resolved'})
        else:
            old_title=tr(p.get('seo_title'));old_meta=tr(p.get('seo_description'))
            title_change=title_needs_change(old_title,name) or norm(old_title) in duplicates.get('seo_title',{})
            meta_change=meta_needs_change(old_meta,name) or norm(old_meta) in duplicates.get('seo_description',{})
            # Existing editorial copy is retained unless weak or factually overpromising.
            body=tr(p.get('description'));first=BeautifulSoup(body,'html.parser').find('p');old_intro=first.get_text(' ',strip=True) if first else ''
            use_context=bool(re.search(r'dia a dia|visual|look|composi|combin|presente|uso|usar|junto|coleção|rosto|colo|mãos|pulso|criança|infantil',old_intro,re.I))
            existing_factual_intro=bool(len(old_intro)>=60 and re.search(r'banho|prata\s*925|aço|\d+[,.]?\d*\s*(?:cm|mm)',old_intro,re.I))
            intro_change=not (use_context or existing_factual_intro) or bool(re.search(r'garante|durabilidade|duradour|hipoalerg|sorte|boas energias|qualquer dedo|à prova',old_intro,re.I))
            if not title_change and not meta_change and not intro_change:
                entry['reason']='EXISTING_CONTENT_SUFFICIENT';entry['evidence']['sufficient_content_proof']={'title_unique_and_specific':True,'title_factual_finish':True,'meta_specific_and_within_65_160':True,'intro_has_family_use_context':use_context,'intro_already_factual':existing_factual_intro,'ficha_and_care_preserved':True}
                product_drafts.append(entry);used_titles[norm(old_title)]=p['id'];used_metas[norm(old_meta)]=p['id'];continue
            title=compact_name(name) if title_change else old_title
            if title_change and len((title+' | Marquesa').encode('utf-8'))<=70:title+=' | Marquesa'
            if len(title.encode('utf-8'))>70:entry['reason']='DATA_GAP_TITLE_TOO_LONG_PRESERVE_DISTINCTIVE_FACTS'
            else:
                meta=natural_meta(name,facts) if meta_change else old_meta
                if len(meta)>160:entry['reason']='DATA_GAP_META_NAME_TOO_LONG'
                else:
                    intro=intro_for(name,facts);tail=preserved_tail(tr(p.get('description')))
                    after={}
                    if title_change:after['seo_title']={'pt':title}
                    if meta_change:after['seo_description']={'pt':meta}
                    if intro_change and intro and tail is not None:
                        link=None
                        choices=sorted([cats.get(x['id'],x) for x in p.get('categories',[])],key=lambda c:bool(c.get('parent')),reverse=True)
                        for cat in choices:
                            cu=cat_urls.get(cat['id']);cp=pages.get(cu)
                            if cp and cp.get('status')==200 and not cp.get('gap') and key(cp.get('canonical_exact') or '')==key(cu):
                                context=tr(cat.get('name'))
                                parent=cats.get(cat.get('parent'))
                                if parent:context+=' em '+tr(parent.get('name')) if tr(parent.get('name'))=='Prata 925' else ' — '+tr(parent.get('name'))
                                link=' Veja também a categoria <a href="'+htmlmod.escape(cp['canonical_exact'],quote=True)+'">'+htmlmod.escape(context)+'</a>.';break
                        after['description']={'pt':'<p>'+htmlmod.escape(intro)+(link or '')+'</p>'+tail}
                        entry['evidence'].update({'original_tail_sha256':hashlib.sha256(tail.encode()).hexdigest(),'original_tail_exact_preserved':True,'intro':intro,'validated_category_link':bool(link)})
                    else:entry['evidence']['description_preserved_reason']='No safe first introductory paragraph or supported family; metadata only'
                    if norm(title) in used_titles or norm(meta) in used_metas or len(name_groups[norm(name)])>1:
                        # Exact same names must have a real differentiator, never artificial SKU copy.
                        peers=[facts_for(peer,BeautifulSoup)[0] for peer in name_groups[norm(name)] if peer['id']!=p['id']]
                        detail=next((facts.get(field) for field in ('measure','material','color') if facts.get(field) and all(norm(peer.get(field))!=norm(facts[field]) for peer in peers)),None) if peers else None
                        candidate=compact_name(name)+' — '+(detail or '')
                        candidate_meta=compact_name(name)+'. '+(detail or '')+'. Veja na Marquesa.'
                        if detail and len(candidate.encode('utf-8'))<=70 and len(candidate_meta)<=160 and norm(candidate) not in used_titles and norm(candidate_meta) not in used_metas:
                            after['seo_title']={'pt':candidate};after['seo_description']={'pt':candidate_meta}
                        else:entry['reason']='DATA_GAP_DUPLICATE_NO_FACTUAL_DISTINCTION';gaps['duplicate_name_no_distinction'].append({'id':p['id'],'name':name,'peer_ids':[peer['id'] for peer in name_groups[norm(name)] if peer['id']!=p['id']],'registered_facts':facts})
                    if not entry['reason']:
                        entry.update({'disposition':'draft','reason':'FACTUAL_METADATA_AND_FAMILY_USE_CONTEXT','after':after})
        if entry['disposition']=='skipped':
            title=tr(p.get('seo_title'));meta=tr(p.get('seo_description'))
        else:title=tr(entry['after'].get('seo_title',p.get('seo_title')));meta=tr(entry['after'].get('seo_description',p.get('seo_description')))
        used_titles[norm(title)]=p['id'];used_metas[norm(meta)]=p['id']
        product_drafts.append(entry)
    category_drafts=[]
    for c in snapshot['categories']:
        url=cat_urls[c['id']];page=pages.get(url);name=tr(c['name']);parent=cats.get(c.get('parent'));label=name
        if parent and tr(parent['name'])=='Prata 925':label=name+' em Prata 925'
        elif parent and tr(parent['name'])=='Infantil':label=name+' infantil'
        elif name=='Coleções':label='Coleções de acessórios'
        elif name in ('Anel','Brinco','Brincos','Colar','Pulseira','Bracelete','Piercing','Berloque','Conjuntos'):label=name+' — acessórios'
        title=label+' | Marquesa';meta='Explore '+label+' na Marquesa. Confira os modelos, as informações de cada peça e as opções disponíveis na categoria.'
        members=[p for p in snapshot['products'] if p.get('published') and any(x['id']==c['id'] for x in p.get('categories',[]))]
        # Parent category collects its children as its listing does.
        child_ids=set(c.get('subcategories',[]))
        if not members and child_ids:members=[p for p in snapshot['products'] if p.get('published') and any(x['id'] in child_ids for x in p.get('categories',[]))]
        family_tokens=Counter()
        for p in members:
            pn=norm(tr(p['name']))
            for token,labeltoken in [('brinco','brincos'),('anel','anéis'),('colar','colares'),('pulseira','pulseiras'),('bracelete','braceletes'),('berloque','berloques'),('piercing','piercings'),('conjunto','conjuntos'),('chaveiro','chaveiros')]:
                if token in pn:family_tokens[labeltoken]+=1;break
        families=[x for x,count in family_tokens.most_common(4)]
        intro='Na categoria '+label+', você encontra '+(', '.join(families) if families else 'os acessórios reunidos nesta seleção')+'. Consulte em cada página os detalhes, as medidas cadastradas e as variantes disponíveis para escolher a peça que combina com sua composição.'
        description=tr(c.get('description'))
        # Preserve existing category editorial text and remove no claim without authority.
        proposed='<p>'+htmlmod.escape(intro)+'</p>'+(description if description else '')
        entry={'id':c['id'],'url':url,'name':name,'eligible':True,'disposition':'draft','reason':'CATEGORY_SEARCH_INTENT_FROM_REAL_CATALOGUE','before':{f:c.get(f,{'pt':''}) for f in ('seo_title','seo_description','description')},'after':{'seo_title':{'pt':title},'seo_description':{'pt':meta},'description':{'pt':proposed}},'preserve_contract':['name','parent','handle','google_shopping_category','subcategories'],'evidence':{'public_baseline_path':page.get('public_baseline_path') if page else None,'canonical_exact':page.get('canonical_exact') if page else None,'member_product_ids':[p['id'] for p in members],'actual_family_counts':dict(family_tokens),'legacy_description_preserved':True},'gsc':metrics.get(key(url),{})}
        if not page or page.get('status')!=200 or page.get('gap') or key(page.get('canonical_exact') or '')!=key(url):entry.update({'disposition':'skipped','reason':'PUBLIC_CATEGORY_BASELINE_UNAVAILABLE_OR_CANONICAL_MISMATCH','after':{}})
        elif len(title.encode('utf-8'))>70 or len(meta)>160:entry.update({'disposition':'skipped','reason':'CATEGORY_LENGTH_REQUIRES_EDITORIAL_REVIEW','after':{}})
        category_drafts.append(entry)
        if re.search(r'\d$',tr(c['handle'])):gaps['legacy_category_handles'].append({'id':c['id'],'handle':tr(c['handle']),'action':'KEEP; real category link validated'})
        if re.search(r'garantia|hipoalerg',tr(c.get('seo_description'))+' '+description,re.I):gaps['legacy_category_claims'].append({'id':c['id'],'seo_description':tr(c.get('seo_description')),'description':description,'action':'replace metadata safely; preserve existing editorial claims for review'})
    # Check collisions against the entire final published catalogue, including
    # untouched entries and records that were deliberately skipped.
    published_ids={p['id'] for p in snapshot['products'] if p.get('published')}
    for _ in range(4):
        collisions=False
        for field in ('seo_title','seo_description'):
            groups=defaultdict(list)
            for entry in product_drafts:
                if entry['id'] in published_ids:
                    value=tr(entry['after'].get(field,entry['before'].get(field)))
                    if value:groups[norm(value)].append(entry)
            for value,entries in groups.items():
                changed=[entry for entry in entries if entry['disposition']=='draft' and field in entry['after']]
                if len(entries)>1 and changed:
                    collisions=True
                    for entry in changed:
                        gaps['final_metadata_collision'].append({'id':entry['id'],'field':field,'peer_ids':[e['id'] for e in entries if e['id']!=entry['id']],'candidate':tr(entry['after'][field])})
                        entry.update({'disposition':'skipped','reason':'DATA_GAP_DUPLICATE_FINAL_METADATA_COLLISION','after':{}})
        if not collisions:break
    for entry in product_drafts:
        # Advisory length warnings must not create a second, identical PUT.
        entry['after'] = {key: value for key, value in entry['after'].items()
                          if tr(value) != tr(entry['before'].get(key))}
        if entry['disposition']=='draft' and not entry['after']:
            entry.update({'disposition':'skipped','reason':'EXISTING_CONTENT_SUFFICIENT'})
    summary={'api_products':len(product_drafts),'published_products':sum(p.get('published',False) for p in snapshot['products']),'eligible':sum(x['eligible'] for x in product_drafts),'draft_products':sum(x['disposition']=='draft' for x in product_drafts),'skipped_products':dict(Counter(x['reason'] for x in product_drafts if x['disposition']=='skipped')),'eligible_skipped':dict(Counter(x['reason'] for x in product_drafts if x['eligible'] and x['disposition']=='skipped')),'category_total':len(category_drafts),'category_drafts':sum(x['disposition']=='draft' for x in category_drafts),'partial':partial}
    return {'schema_version':1,'generated_at':datetime.now(timezone.utc).isoformat(),'source':'immutable API snapshot + full public URL checkpoints + observed GSC','remote_writes':0,'partial':partial,'summary':summary,'product_drafts':sorted(product_drafts,key=lambda x:-x['priority_score']),'category_drafts':category_drafts,'data_gaps':dict(gaps)},cat_urls,duplicates

def retain_reviewed_categories(drafts, snapshot, pages, reviewed):
    """Keep a reviewed category only when its API content and public SEO match."""
    rows=reviewed['category_drafts'];ids=[str(x['id']) for x in rows]
    current={str(x['id']):x for x in snapshot['categories']}
    if len(ids)!=len(set(ids)) or not set(ids)<=set(current):
        raise ValueError('INVALID_REVIEWED_CATEGORY_INVENTORY')
    desired={str(x['id']):x for x in rows}
    for entry in drafts['category_drafts']:
        review=desired.get(str(entry['id']));page=pages.get(entry['url'],{})
        if not review or review.get('disposition')!='draft':continue
        expected=review.get('after',{})
        if set(expected)!={'description','seo_title','seo_description'}:continue
        if not all(tr(value) and current[str(entry['id'])].get(field)==value for field,value in expected.items()):continue
        if page.get('status')!=200 or page.get('gap') or key(page.get('canonical_exact') or '')!=key(entry['url']):continue
        if not all(norm(page.get(field))==norm(tr(expected[field])) for field in ['seo_title','seo_description']):continue
        entry.update({'disposition':'skipped','reason':'REVIEWED_CATEGORY_CONTENT_ALREADY_PRESENT','after':{}})
    drafts['summary']['category_drafts']=sum(x['disposition']=='draft' for x in drafts['category_drafts'])

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--runtime-root',required=True);ap.add_argument('--out',default='.local/intelligence/full-seo-2026-10-08');ap.add_argument('--drafts-only',action='store_true');ap.add_argument('--reviewed-categories');args=ap.parse_args()
    sys.path.insert(0,str(Path(args.runtime_root)/'intelligence'))
    from marquesa_intelligence import catalog_audit
    from bs4 import BeautifulSoup
    import requests
    out=Path(args.out);snapshot=json.loads((out/'seo-before-2026-10-08.json').read_text(encoding='utf-8-sig'));dataset=json.loads((out/'gsc-d0.json').read_text(encoding='utf-8-sig'))
    prior=json.loads(Path('.local/intelligence/analysis/catalog-published45-2026-10-06.json').read_text(encoding='utf-8-sig'));prior_ids={int(p['produto_id_loja']) for p in prior['products']}
    fetcher=Fetcher(out,catalog_audit.parse_catalog_page,BeautifulSoup,requests);pages={}
    for file in fetcher.cache.glob('*.json'):
        record=json.loads(file.read_text(encoding='utf-8'));pages[record['url']]=record
    # Reuse read-only probes collected moments before delegation.
    for i in (0,3):
        probe=out/f'probe-{i}.json';raw=out/f'probe-{i}.html'
        if probe.exists() and raw.exists():
            old=json.loads(probe.read_text(encoding='utf-8'));url=old['url']
            if url not in pages:
                body=raw.read_text(encoding='utf-8');hp,jp=fetcher.paths(url);hp.write_bytes(raw.read_bytes());rec=augment_page(body,url,old['status'],catalog_audit.parse_catalog_page,BeautifulSoup);rec.update({'initial_status':old['status'],'final_url':url,'redirects':[],'fetched_at':snapshot['captured_at'],'public_baseline_path':str(hp.resolve()),'checkpoint_path':str(jp.resolve()),'source':'same-run delegated public probe'});write_json(jp,rec);pages[url]=rec
    sitemap_urls=set();sitemap_documents=[]
    xml_url=ORIGIN+'/sitemap.xml';pending=[xml_url];seen=set()
    if args.drafts_only:
        for rec in pages.values():
            if rec.get('in_sitemap'):sitemap_urls.add(rec['url'])
    else:
        while pending:
            url=pending.pop()
            if url in seen:continue
            seen.add(url);rec=fetcher.fetch(url);pages[url]=rec;sitemap_documents.append(rec)
            hp,_=fetcher.paths(url)
            if rec.get('status')!=200 or not hp.exists():continue
            try:tree=ET.fromstring(hp.read_bytes())
            except ET.ParseError:continue
            if tree.tag.endswith('sitemapindex'):
                pending.extend(x.text.strip() for x in tree.findall('.//{*}loc') if x.text and safe_url(x.text.strip()))
            else:sitemap_urls.update(x.text.strip() for x in tree.findall('./{*}url/{*}loc') if x.text)
    drafts,cat_urls,duplicates=build_drafts(snapshot,pages,sitemap_urls,prior_ids,dataset,BeautifulSoup,catalog_audit,partial=not args.drafts_only)
    reviewed=json.loads(Path(args.reviewed_categories).read_text(encoding='utf-8-sig')) if args.reviewed_categories else None
    if reviewed is not None:retain_reviewed_categories(drafts,snapshot,pages,reviewed)
    if args.drafts_only:
        write_json(out/'drafts.json',drafts)
        auditpath=out/'audit.json'
        if auditpath.exists():
            audit=json.loads(auditpath.read_text(encoding='utf-8'));audit['summary']['drafts']=drafts['summary'];audit['data_gaps']=drafts['data_gaps'];audit['drafts_rebuilt_with_editorial_quality_gates_at']=drafts['generated_at'];write_json(auditpath,audit)
        print(json.dumps(drafts['summary']),flush=True);return
    urls={p.get('canonical_url') or ORIGIN+'/produtos/'+tr(p['handle'])+'/' for p in snapshot['products'] if p.get('published')}
    urls.update(cat_urls.values());urls.update(sitemap_urls);urls.update([ORIGIN+'/',ORIGIN+'/produtos/',ORIGIN+'/robots.txt'])
    urls.update(row['keys'][0] for row in dataset.get('page',{}).get('rows',[]) if safe_url(row['keys'][0]))
    # Observed catalogue parameters only, never invoke cart/checkout endpoints.
    sample=next((p for p in snapshot['products'] if p.get('published') and stock_price(p)[2] and len(p.get('variants',[]))>1),None)
    if sample:urls.add(sample['canonical_url']+'?variant='+str(sample['variants'][0]['id'])+'&pf=mc')
    urls.update([ORIGIN+'/produtos/?sort_by=price-ascending',ORIGIN+'/produtos/?page=2'])
    # Prioritize categories and eligible products to make reversible canary ready early.
    products={p.get('canonical_url'):p for p in snapshot['products']}
    def priority(url):
        if url in cat_urls.values():return (0,url)
        if url in products and stock_price(products[url])[2] and products[url]['id'] not in prior_ids:return (1,url)
        return (2,url)
    queue=sorted((url for url in urls if safe_url(url) and url not in pages),key=priority)
    print(json.dumps({'phase':'full_public_audit','unique_targets':len(urls),'queued':len(queue),'cached':len(pages),'sitemap_urls':len(sitemap_urls),'workers':2}),flush=True)
    last=time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures={pool.submit(fetcher.fetch,url):url for url in queue}
        for index,future in enumerate(concurrent.futures.as_completed(futures),1):
            rec=future.result();rec['in_sitemap']=rec['url'] in sitemap_urls;pages[rec['url']]=rec
            _,jp=fetcher.paths(rec['url']);write_json(jp,rec)
            if index%20==0 or time.monotonic()-last>40:
                draft,_,_=build_drafts(snapshot,pages,sitemap_urls,prior_ids,dataset,BeautifulSoup,catalog_audit,partial=True);write_json(out/'drafts.json',draft)
                print(json.dumps({'completed':index,'remaining':len(queue)-index,'drafts_ready':draft['summary']['draft_products'],'categories_ready':draft['summary']['category_drafts'],'errors':sum(bool(x.get('gap')) for x in pages.values())}),flush=True);last=time.monotonic()
    for rec in pages.values():rec['in_sitemap']=rec['url'] in sitemap_urls
    drafts,cat_urls,duplicates=build_drafts(snapshot,pages,sitemap_urls,prior_ids,dataset,BeautifulSoup,catalog_audit)
    if reviewed is not None:retain_reviewed_categories(drafts,snapshot,pages,reviewed)
    write_json(out/'drafts.json',drafts)
    product_pages=[x for x in pages.values() if x.get('page_type')=='product' and not urlsplit(x['url']).query]
    sitemap_checks=[]
    for url in sorted(sitemap_urls):
        page=pages.get(url,{});sitemap_checks.append({'url':url,'fetched':bool(page),'status':page.get('status'),'initial_status':page.get('initial_status'),'canonical_exact':page.get('canonical_exact'),'canonical_matches':key(page.get('canonical_exact') or '')==key(url),'noindex':'noindex' in (' '.join(page.get('robots',[]))+' '+(page.get('x_robots_tag') or '')).lower(),'gap':page.get('gap'),'within_safe_scope':safe_url(url)})
    parameter_pages=[x for x in pages.values() if urlsplit(x['url']).query]
    audit={'schema_version':1,'captured_at':datetime.now(timezone.utc).isoformat(),'source_snapshot':str((out/'seo-before-2026-10-08.json').resolve()),'remote_writes':0,'scope':'all API598 records, all499 published PDPs, all26categories, full sitemap, institutional, GSC aliases and observed parameters; checkout excluded','summary':{'targets':len(urls),'fetched':len(pages),'http_statuses':dict(Counter(str(x.get('status')) for x in pages.values())),'errors':sum(bool(x.get('gap')) for x in pages.values()),'sitemap_urls':len(sitemap_urls),'sitemap_http_non_200':sum(x['status']!=200 for x in sitemap_checks),'sitemap_noindex':sum(x['noindex'] for x in sitemap_checks),'sitemap_canonical_mismatch':sum(not x['canonical_matches'] for x in sitemap_checks),'published_pdp_targets':sum(p['published'] for p in snapshot['products']),'product_pages_parsed':len(product_pages),'main_product_schema_missing':sum(not x.get('main_product_schema_present') for x in product_pages),'microdata_main_product_count':sum(bool(x.get('microdata_products')) for x in product_pages),'jsonld_main_product_count':sum(bool(x.get('main_product_jsonld')) for x in product_pages),'organization_without_logo_pages':sum(bool(x.get('organization_without_logo_count')) for x in pages.values()),'parameter_targets':len(parameter_pages),'drafts':drafts['summary']},'pages':sorted(pages.values(),key=lambda x:x['url']),'sitemap_documents':sitemap_documents,'sitemap_inventory':sitemap_checks,'duplicate_fields':duplicates,'data_gaps':drafts['data_gaps'],'parameters':parameter_pages,'limitations':['GSC covers observed queries only; keyword volume unknown','Photo dimensions are catalogue metadata; no visual alterations','No new Product claims, guarantee, health, price or stock content','All network requests GET; no checkout/cart actions','Schema recommendations are distinguished from main PDP microdata/JSON-LD']}
    write_json(out/'audit.json',audit);print(json.dumps({'phase':'complete','summary':audit['summary']},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
