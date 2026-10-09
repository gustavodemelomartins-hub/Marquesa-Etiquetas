"""Publish a sanitized per-product SEO ledger, never a backup or stock dump."""
import argparse,csv,json,hashlib
from pathlib import Path
from collections import Counter
from datetime import datetime,timezone,timedelta

def local(v):return v.get('pt','') if isinstance(v,dict) else v or ''
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--storage',required=True);ap.add_argument('--out',required=True);ap.add_argument('--prior-ledger',default='.local/intelligence/analysis/catalog-published45-2026-10-06.json');a=ap.parse_args()
    r=Path(a.storage);out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    read=lambda n:json.loads((r/n).read_text(encoding='utf-8-sig'))
    before=read('seo-before-2026-10-08.json');drafts=read('products-reviewed.json')['product_drafts'];status=read('products-status.json')
    parity=read('parity-after.json');public_proofs={str(x['product_id']):x for x in parity['products']}
    products={str(p['id']):p for p in before['products']}
    prior=json.loads(Path(a.prior_ledger).read_text(encoding='utf-8-sig'))
    prior_clocks={str(x['produto_id_loja']):x['experiment']['D0'] for x in prior['products']}
    assert len(drafts)==len(products) and {str(p['id']) for p in drafts}==set(products),'INCOMPLETE_LEDGER'
    rows=[]
    for d in drafts:
        pid=str(d['id']);p=products[pid];s=status.get(pid,{'status':'PENDING','reason':'NO_STATUS'});public=bool(p['published']) and p.get('visibility')!='hidden'
        after=d.get('after',{}) if s.get('written') else {}
        D0=s.get('D0') or (prior_clocks.get(pid) if d.get('reason')=='PREVIOUS_45_REAUDITED_CONTENT_PRESERVED' else None);checkpoints={}
        if D0:
            start=datetime.fromisoformat(D0.replace('Z','+00:00'));checkpoints={f'D{n}':(start+timedelta(days=n)).isoformat() for n in [7,28,56,84]}
        # Only public content enters Git. Unpublished records retain identity and reason.
        visible=lambda field,new=False:local(after.get(field,p.get(field))) if public and new else local(p.get(field)) if public else '[private snapshot]'
        rows.append({'product_id':pid,'sku':' | '.join(str(v.get('sku') or '') for v in p['variants']) if public else '[private snapshot]',
            'old_url':d['url'] if public else '[private snapshot]','new_url':d['url'] if public else '[private snapshot]',
            'old_title':visible('seo_title'),'new_title':visible('seo_title',True),'old_meta':visible('seo_description'),'new_meta':visible('seo_description',True),
            'status':s['status'],'motivo':d.get('reason') or s.get('reason') or '', 'validation_reason':s.get('reason',''), 'eligible_at_latest_capture':d['eligible'],
            'cohort':'NEW_CONTENT_WRITE' if s.get('written') else 'PREVIOUS_45_PRESERVED' if pid in prior_clocks else 'PRESERVED_NO_WRITE',
            'description_changed':bool(s.get('written') and 'description' in after and local(after['description'])!=local(p.get('description'))),
            'seo_title_changed':bool(s.get('written') and 'seo_title' in after and local(after['seo_title'])!=local(p.get('seo_title'))),
            'seo_description_changed':bool(s.get('written') and 'seo_description' in after and local(after['seo_description'])!=local(p.get('seo_description'))),
            'url_changed':False,'redirect_status':'UNCHANGED','commercial_readback_ok':s.get('businessOk') if s.get('written') else '',
            'clean_public_validated':s.get('proof',{}).get('valid',False) if s.get('written') else '',
            'public_commercial_parity':public_proofs.get(pid,{}).get('valid',False) if public else '', 'D0':D0 or '',**{f'D{n}':checkpoints.get(f'D{n}','') for n in [7,28,56,84]}})
    with(out/'products.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows(rows)
    stats={'generated_at':datetime.now(timezone.utc).isoformat(),'products':len(rows),'published':sum(p['published'] for p in before['products']),
        'unpublished':sum(not p['published'] for p in before['products']),'variants':sum(len(p['variants']) for p in before['products']),'categories':len(before['categories']),
        'eligible_latest':sum(d['eligible'] for d in drafts),'states':dict(Counter(x['status'] for x in rows)),
        'eligible_states':dict(Counter(x['status'] for x in rows if x['eligible_at_latest_capture'])),
        'changes':{k:sum(bool(x[k]) for x in rows) for k in ['description_changed','seo_title_changed','seo_description_changed','url_changed']},
        'skipped_reasons':dict(Counter(x['motivo'] for x in rows if x['status']=='SKIPPED')),
        'backup_sha256':hashlib.sha256((r/'seo-before-2026-10-08.json').read_bytes()).hexdigest(),
        'public_parity_summary':parity['summary'],'private_values_exported':False,'all_product_records_accounted_for':True}
    (out/'catalogue-summary.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(stats,ensure_ascii=True))
    if any(x['status'] not in ['VALIDATED','SKIPPED'] or (x['status']=='SKIPPED' and not x['motivo'].strip()) or (x['status']=='VALIDATED' and (x['clean_public_validated'] is not True or x['commercial_readback_ok'] is not True)) for x in rows):return 1
    if parity['summary'].get('failed')!=0 or parity['summary'].get('published_targets')!=sum(bool(p['published']) for p in before['products']) or any(x['public_commercial_parity'] is not True for x in rows if x['old_url']!='[private snapshot]'):return 1
    return 0
if __name__=='__main__':raise SystemExit(main())
