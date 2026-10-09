"""Compare every published PDP with the API snapshot used by the existing audit.

No network or writes to the store. Editorial SKIPPED never removes a PDP.
Regular/promotional prices remain separately protected by the API writer;
HTML exposes effective price only. Stock mismatches require a fresh API read.
"""
import argparse,json,re,unicodedata
from pathlib import Path
from decimal import Decimal,InvalidOperation
from datetime import datetime,timezone
from urllib.parse import urlsplit

def local(v):return v.get('pt','') if isinstance(v,dict) else v or ''
def normal(v):return re.sub(r'\s+',' ',unicodedata.normalize('NFC',str(v or ''))).strip()
def clean(v):return str(v or '').rstrip('/')
def asset(v):return re.sub(r'-\d+-\d+\.(?:webp|avif|png|jpe?g)$','',urlsplit(str(v)).path,flags=re.I)
def money(v):
    try:return Decimal(str(v))
    except (InvalidOperation,TypeError):return None
def effective(v):return money(v.get('promotional_price') or v.get('price'))
def available(v):return v.get('stock_management') is False or v.get('stock') is None or v.get('stock',0)>0

def compare(product,page):
    variants=product.get('variants',[]);visible=page.get('variants',[])
    actual={str(v['variant_id']):v for v in visible};url=product['canonical_url']
    checks={'http_200':page.get('status')==200,'canonical':clean(page.get('canonical_exact'))==clean(url),
        'product_identity':str(page.get('produto_id_loja'))==str(product['id']),
        'variant_identity':set(actual)=={str(v['id']) for v in variants} and len(actual)==len(visible),
        'variant_product_identity':all(str(v.get('product_id'))==str(product['id']) for v in visible),
        'name':normal(page.get('nome'))==normal(local(product.get('name'))),
        'sku':all(str(v.get('sku'))==str(actual.get(str(v['id']),{}).get('sku')) for v in variants),
        'effective_price':all(effective(v)==money(actual.get(str(v['id']),{}).get('price')) for v in variants),
        'stock':all(v.get('stock')==actual.get(str(v['id']),{}).get('stock') for v in variants),
        'images_count':page.get('imagens_count')==len(product.get('images',[])),
        'image_identity':{asset(i['src']) for i in page.get('images',[])}=={asset(i['src']) for i in product.get('images',[])},
        'purchase_cta':bool(page.get('purchase_cta_present')),
        'sellable_cta_enabled':not page.get('purchase_cta_disabled',False) if any(available(v) and (effective(v) or 0)>0 for v in variants) else True,
        'schema_parse':not page.get('schema_parse_errors')}
    primary=page.get('main_product_jsonld',[]);checks['primary_jsonld_product']=bool(primary)
    schema=[]
    for p in primary:
        offers=p.get('offers');offers=offers if isinstance(offers,list) else [offers]
        valid=bool(p.get('name') and p.get('image') and offers)
        valid=valid and normal(p.get('name'))==normal(local(product.get('name')))
        for o in offers:
            if not isinstance(o,dict):valid=False;continue
            matches=[v for v in variants if str(v.get('sku'))==str(p.get('sku')) and effective(v)==money(o.get('price'))]
            expected='InStock' if any(available(v) for v in matches) else 'OutOfStock'
            valid=valid and bool(matches) and o.get('priceCurrency')=='BRL' and str(o.get('availability','')).rsplit('/',1)[-1]==expected and clean(o.get('url'))==clean(url)
        schema.append(bool(valid))
    checks['schema_sku_price_currency_availability']=bool(schema) and all(schema)
    return {'product_id':str(product['id']),'url':url,'valid':all(checks.values()),'checks':checks,'failed_checks':[k for k,v in checks.items() if not v],
        'api_captured_at':None,'html_fetched_at':page.get('fetched_at'),'cache_headers':page.get('cache_headers',{}),'alt_missing':sum(not normal(i.get('alt')) for i in page.get('images',[]))}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--snapshot',required=True);ap.add_argument('--audit',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
    read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
    snapshot,audit=read(a.snapshot),read(a.audit);records=[]
    for p in snapshot['products']:
        if not p.get('published'):continue
        candidates=[x for x in audit['pages'] if not urlsplit(x['url']).query and clean(x['url'])==clean(p['canonical_url'])]
        if len(candidates)!=1:records.append({'product_id':str(p['id']),'url':p['canonical_url'],'valid':False,'failed_checks':['CLEAN_PAGE_UNAVAILABLE_OR_DUPLICATE']});continue
        result=compare(p,candidates[0]);result['api_captured_at']=snapshot['captured_at'];records.append(result)
    summary={'generated_at':datetime.now(timezone.utc).isoformat(),'snapshot_captured_at':snapshot['captured_at'],
        'published_targets':len(records),'passed':sum(x['valid'] for x in records),'failed':sum(not x['valid'] for x in records),
        'all_published_accounted_for':len(records)==sum(bool(p.get('published')) for p in snapshot['products']),
        'missing_public_gallery_alt':sum(x.get('alt_missing',0) for x in records),'remote_writes':0,
        'limitations':['HTML proves effective price; regular/promotional prices are separately checked by API invariants.',
            'Stock mismatches must be reconciled against a fresh API read before attributing them to SEO.',
            'Current theme emits primary Product; ProductGroup remains a separately documented source dependency.']}
    Path(a.out).write_text(json.dumps({'summary':summary,'products':records},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=True));return 0 if summary['failed']==0 else 1
if __name__=='__main__':raise SystemExit(main())
