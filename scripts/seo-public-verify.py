"""Validate final HTML against a successful content-only API readback.

No checkout, cart, orders, analytics event or remote mutation is performed.
"""
import json,sys,re,time,unicodedata
import html as htmlmod
from pathlib import Path
from urllib.parse import urlsplit
import requests
from bs4 import BeautifulSoup

def normal(value):
    return re.sub(r'\s+',' ',unicodedata.normalize('NFC',str(value or ''))).strip()

def nodes(value):
    if isinstance(value,dict):
        yield value
        for child in value.values():yield from nodes(child)
    elif isinstance(value,list):
        for child in value:yield from nodes(child)

def local(value):return value.get('pt','') if isinstance(value,dict) else value or ''

def image_key(value):
    return re.sub(r'-\d+-\d+\.(?:webp|avif|png|jpe?g)$','',urlsplit(value).path,flags=re.I)

def availability(v):
    return 'InStock' if v.get('stock_management') is False or v.get('stock') is None or v.get('stock',0)>0 else 'OutOfStock'

def main():
    payload=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    sys.path.insert(0,str(Path(payload['runtime_root'])/'intelligence'))
    from marquesa_intelligence.catalog_audit import parse_catalog_page,text
    draft,product=payload['draft'],payload['product'];url=draft['url']
    if urlsplit(url).hostname!='marquesasemijoias.com.br' or urlsplit(url).scheme!='https':raise ValueError('INVALID_PUBLIC_ORIGIN')
    root=Path(payload['storage']);kind=payload['kind'];out=root/'public-after';out.mkdir(exist_ok=True)
    origin_mode=False;clean_proof=None;alternate_path=False;alias_proof=None
    for attempt in range(5):
        request_url=(url.rstrip('/') if alternate_path else url)+('?seo_readback='+str(time.time_ns()) if origin_mode else '')
        r=requests.get(request_url,headers={'User-Agent':'Marquesa-SEO/1.0 (+public readback)'},timeout=(10,35),allow_redirects=False)
        html=r.content.decode('utf-8');soup=BeautifulSoup(html,'html.parser')
        canonical=soup.select_one('link[rel="canonical"]');target=canonical.get('href') if canonical else None
        # A slash-normalized clean request remains the same resource. CDN entries
        # can age independently; record the served path rather than fetching a
        # second, possibly stale alias and silently replacing this response.
        page=parse_catalog_page(html,target or url,r.status_code)
        checks={'http_200':r.status_code==200,'canonical_unchanged':target is not None and target.rstrip('/')==url.rstrip('/'),'title_matches':normal(page.get('seo_title'))==normal(local(draft['after'].get('seo_title',product.get('seo_title')))),'meta_matches':normal(page.get('seo_description'))==normal(local(draft['after'].get('seo_description',product.get('seo_description'))))}
        expected=local(draft['after'].get('description',product.get('description')))
        if kind=='products':
            checks['description_matches']=normal(page.get('description_text'))==normal(text(expected))
            checks['product_identity']=str(page.get('produto_id_loja'))==str(product['id'])
            checks['images_count_unchanged']=page.get('imagens_count')==len(product.get('images',[]))
            checks['images_identity_intact']={image_key(i['src']) for i in page.get('images',[])}=={image_key(i['src']) for i in product.get('images',[])}
            visible=page.get('variants',[])
            actual={str(v['variant_id']):v for v in visible}
            checks['variants_identity']=set(actual)=={str(v['id']) for v in product['variants']}
            checks['sku_intact']=all(str(v.get('sku'))==str(actual.get(str(v['id']),{}).get('sku')) for v in product['variants'])
            checks['prices_intact']=all(float(v.get('promotional_price') or v.get('price') or 0)==float(actual.get(str(v['id']),{}).get('price',-1)) for v in product['variants'])
            checks['stock_intact']=all(v.get('stock')==actual.get(str(v['id']),{}).get('stock') for v in product['variants'])
            checks['purchase_cta_present']=bool(page.get('purchase_cta_present'))
        else:
            # Some themes intentionally do not render category.description.
            checks['description_matches']=normal(text(expected)) in normal(soup.get_text(' ',strip=True))
        parsed=[];errors=0
        for script in soup.select('script[type="application/ld+json"]'):
            try:parsed.extend(nodes(json.loads(script.get_text())))
            except ValueError:errors+=1
        primary=[x for x in parsed if x.get('@type') in ('Product','ProductGroup') and any(isinstance(o,dict) and str(o.get('url','')).rstrip('/')==url.rstrip('/') for o in (x.get('offers') if isinstance(x.get('offers'),list) else [x.get('offers')]))]
        schema_gaps=[];schema_warnings=[]
        for p in primary:
            for k in ['name','image','offers']:
                if not p.get(k):schema_gaps.append('MISSING_'+k.upper())
            for k in ['description','sku','brand']:
                if not p.get(k):schema_warnings.append('MISSING_'+k.upper())
        if kind=='products':
            checks['schema_parse_valid']=errors==0
            checks['primary_product_schema']=bool(primary)
            checks['schema_required_fields']=not schema_gaps
            schema_price_ok=[]
            for p in primary:
                offers=p.get('offers');offers=offers if isinstance(offers,list) else [offers]
                for o in offers:
                    if not isinstance(o,dict):continue
                    schema_price_ok.append(o.get('priceCurrency')=='BRL' and float(o.get('price',-1)) in {float(v.get('promotional_price') or v.get('price') or 0) for v in product['variants']})
            checks['schema_price_currency']=bool(schema_price_ok) and all(schema_price_ok)
            paired=[];schema_images=[];schema_names=[];schema_descriptions=[]
            for p in primary:
                schema_names.append(normal(p.get('name'))==normal(local(product.get('name'))))
                schema_descriptions.append(normal(htmlmod.unescape(p.get('description','')))==normal(local(product.get('seo_description'))))
                images=p.get('image',[]);images=images if isinstance(images,list) else [images]
                schema_images.append(bool(images) and all(image_key(i if isinstance(i,str) else i.get('url','')) in {image_key(x['src']) for x in product.get('images',[])} for i in images))
                offers=p.get('offers');offers=offers if isinstance(offers,list) else [offers]
                for o in offers:
                    matching=[v for v in product['variants'] if str(v.get('sku'))==str(p.get('sku')) and float(v.get('promotional_price') or v.get('price') or 0)==float(o.get('price',-1))]
                    declared=str(o.get('availability','')).rsplit('/',1)[-1]
                    # Base offers may aggregate variants sharing one SKU and price.
                    expected='InStock' if any(availability(v)=='InStock' for v in matching) else 'OutOfStock'
                    paired.append(bool(matching) and declared==expected)
            checks['schema_name_intact']=bool(schema_names) and all(schema_names)
            if product.get('brand'):
                checks['schema_brand_intact']=all(normal(p.get('brand',{}).get('name') if isinstance(p.get('brand'),dict) else p.get('brand'))==normal(product['brand']) for p in primary)
            checks['schema_images_intact']=bool(schema_images) and all(schema_images)
            checks['schema_description_current']=bool(schema_descriptions) and all(schema_descriptions)
            checks['schema_sku_price_availability']=bool(paired) and all(paired)
        proof={'valid':all(checks.values()),'productId':str(product['id']),'url':url,'requested_url':request_url,'canonical':target,'checks':checks,'schema_gaps':schema_gaps,'schema_warnings':schema_warnings,'primary_schema_count':len(primary),'organization_logo_gaps':sum(x.get('@type')=='Organization' and not x.get('logo') for x in parsed),'cache_headers':{k:v for k,v in r.headers.items() if k.lower() in ['age','date','cf-cache-status']}}
        if alias_proof is not None:proof['cached_alias_proof']=alias_proof
        suffix='-origin' if origin_mode else ''
        (out/(str(product['id'])+suffix+'.html')).write_text(html,encoding='utf-8')
        (out/(str(product['id'])+suffix+'.json')).write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf-8')
        if origin_mode:
            proof={**clean_proof,'origin_valid':proof['valid'],'origin_proof':proof,'cache_pending':proof['valid']}
            (out/(str(product['id'])+'.json')).write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf-8')
            break
        if proof['valid']:break
        failed={k for k,v in checks.items() if not v}
        content_checks={'title_matches','meta_matches','description_matches','schema_description_current'}
        if kind=='products' and failed and failed<=content_checks and r.headers.get('cf-cache-status','').upper()=='HIT':
            if not alternate_path and url.endswith('/'):
                alias_proof=proof;alternate_path=True;continue
            clean_proof=proof;origin_mode=True;continue
        if attempt<4:time.sleep([2,4,8,12][attempt])
    print(json.dumps(proof,ensure_ascii=True));return 0 if proof['valid'] else 1

if __name__=='__main__':
    try:sys.exit(main())
    except Exception:print(json.dumps({'valid':False,'reason':'PUBLIC_FETCH_OR_PARSE_FAILED'}));sys.exit(1)
