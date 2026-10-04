"""Codex-first collection and commercial baseline. Local artifacts only."""
from __future__ import annotations
import copy
import importlib.metadata
import json
from datetime import datetime, timezone
from .analysis import analyze_opportunities, basket_pairs, normalize_google_for_commerce
from .commerce import build_identity_map, summarize_commerce, canonical_url
from .config import validate_config
from .google import GoogleCollectors, GoogleAPIError, date_window
from .scheduler import due
from .storage import SnapshotStore, atomic_json, lease

ORIGIN = 'https://marquesasemijoias.com.br'
SOURCES = ('commerce', 'storefront', 'nuvemshop', 'gsc', 'ga4', 'pagespeed', 'crux')
PACKAGES = ('google-api-python-client', 'google-auth', 'google-auth-oauthlib',
            'google-auth-httplib2', 'google-analytics-data', 'requests', 'tzdata',
            'matplotlib', 'weasyprint', 'openpyxl')


def doctor(config):
    packages = {}
    for name in PACKAGES:
        try:
            packages[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            packages[name] = 'not_installed'
    return {'configuration': validate_config(config), 'packages': packages,
            'executor': 'Codex + Python', 'remote_write_endpoints': 0,
            'note': 'Configured/installed does not prove authentication or native PDF support.'}


def semantic(value):
    """Exclude lineage/timestamps from diff; raw remains complete."""
    ignored = {'snapshot', 'snapshots', 'raw_snapshots', 'metadata_snapshot', 'exported_at',
               'captured_at', 'fetch_time', 'propertyQuota'}
    if isinstance(value, dict):
        return {k: semantic(v) for k, v in value.items() if k not in ignored}
    if isinstance(value, list):
        return [semantic(v) for v in value]
    return value


def cached(store, name):
    path = store.root/'normalized'/(name+'.json')
    return json.loads(path.read_text(encoding='utf-8')) if path.is_file() else None


def save_normalized(store, name, result):
    atomic_json(store.root/'normalized'/(name+'.json'), result)
    return store.capture('normalized_'+name, {'dataset': name}, result,
                         comparison_payload=semantic(result))


def commercial_baseline(store, windows=(28, 90), end_date=None):
    snapshot = cached(store, 'commerce')
    if snapshot is None:
        return {'status': 'gap', 'gap': 'No operational snapshot; collect commerce first'}
    working = copy.deepcopy(snapshot)
    storefront = cached(store, 'storefront') or {}
    working['tables']['storefront_products'] = [p['storefront_product'] for p in storefront.get('pages', [])]
    nuvemshop = cached(store, 'nuvemshop')
    if nuvemshop:
        working['tables']['nuvemshop_products'] = nuvemshop.get('products', [])
    identity = build_identity_map(working, ORIGIN)
    published_urls = {canonical_url(url, ORIGIN) for url in storefront.get('sitemap', {}).get('urls', [])}
    verified_skus = set()
    for page in storefront.get('pages', []):
        url = canonical_url(page.get('canonical') or page.get('url'), ORIGIN)
        if page.get('storefront_product', {}).get('produto_id_loja'):
            verified_skus.update(identity['by_url'].get(url, []))
    identity['coverage'].update(public_html_verified_skus=len(verified_skus),
        mapped_urls_in_current_sitemap=sum(url in published_urls for url in identity['by_url']),
        stored_urls_not_in_current_sitemap=sum(url not in published_urls for url in identity['by_url']))
    identity['freshness'] = {'external_mirror_is_a_snapshot': True,
        'current_canonical_urls_verified_only_for_bounded_html_sample': True,
        'note': 'An exact stored URL/ID relation does not prove the URL is current. No /produtos/ prefix rewrite or name matching is inferred.'}
    atomic_json(store.root/'normalized'/'identity.json', identity)
    full = summarize_commerce(working)
    periods = {}
    for days in windows:
        start, end = date_window(days, end_date, lag_days=3)
        scoped = copy.deepcopy(working)
        scoped['meta'].update(sales_period={'start_date': start, 'end_date': end},
                              receipts_period={'start_date': start, 'end_date': end}, sales_window_days=days)
        commerce = summarize_commerce(scoped)
        normalized = normalize_google_for_commerce(cached(store, 'ga4_'+str(days)) or {},
            cached(store, 'gsc_'+str(days)) or {}, identity, funnel_report=cached(store, 'funnel_'+str(days)))
        analysis = analyze_opportunities(commerce, normalized['ga4'], normalized['gsc'])
        # No exported site rows does not prove no orders at the external store.
        if working.get('meta', {}).get('site_sales_coverage_verified') is not True:
            analysis['opportunities'] = [p for p in analysis['opportunities'] if p['code'] != 'J']
            for coverage in analysis['coverage']:
                if coverage['code'] == 'J':
                    coverage['evaluated'] = 0
                    coverage['missing']['operational_site_sales_coverage_unverified'] = len(commerce['products'])
        periods[str(days)] = {'commerce': commerce, 'google': normalized,
                             'opportunities': analysis, 'cross_sell': basket_pairs(scoped)}
    report = {'status': 'prepared', 'identity': identity, 'commerce_all_available': full,
              'periods': periods, 'storefront_tracking': storefront,
              'gaps': ['Verify order ingestion/store coverage before treating absent site rows as zero ecommerce demand.',
                       'Stored mirror URLs can differ from current canonical /produtos/ URLs; validate redirects or HTML before allocating unmapped Google pages.',
                       'GA4 event receipt and deduplication require authorized Google data and tracking validation.',
                       'Per-product/category conversion requires session-grain evidence; item units are not sessions.',
                       'Current cost is reference margin only; contribution margin needs fees, discounts, shipping and historical cost.'],
              'merchandising': {'status': 'proposal', 'automatic_actions': False,
                  'score': 'Calibrate conversion + revenue + contribution margin + available stock + trend + organic demand after coverage validation'},
              'llm_calls': 0, 'remote_writes': 0}
    store.write_analysis('commercial-baseline', report)
    decisions = {str(days): {'opportunities': periods[str(days)]['opportunities']['opportunities'],
                            'coverage': periods[str(days)]['opportunities']['coverage'],
                            'pairs': periods[str(days)]['cross_sell']['pairs']} for days in windows}
    store.capture('commercial_hypotheses', {'windows': list(windows)}, decisions, comparison_payload=semantic(decisions))
    return {'status': 'prepared', 'identity_coverage': identity['coverage'],
            'ga4_variant_links': len(identity['by_ga4_item_id']), 'identity_conflicts': len(identity['conflicts']),
            'commerce_coverage': full['coverage'], 'site_orders_exported': full['sales']['orders'],
            'windows': list(periods), 'opportunities': {k: len(v['opportunities']['opportunities']) for k, v in periods.items()},
            'report': str(store.root/'analysis'/'commercial-baseline.json'), 'llm_calls': 0, 'remote_writes': 0}


def collect(config, sources, windows=(28, 90), end_date=None, pdp_urls=(), only_due=False, database='marquesa-db-prod'):
    store = SnapshotStore(config['MARQUESA_INTELLIGENCE_STORAGE'])
    with lease(store.root/'.collection.lock'):
        return _collect(config, sources, windows, end_date, pdp_urls, only_due, database)


def _collect(config, sources, windows, end_date, pdp_urls, only_due, database):
    if any(source not in SOURCES for source in sources):
        raise ValueError('Unknown collector source')
    store = SnapshotStore(config['MARQUESA_INTELLIGENCE_STORAGE'])
    google = GoogleCollectors(config, store)
    readiness = validate_config(config)
    state_path = store.root/'state'/'schedule.json'
    state = json.loads(state_path.read_text(encoding='utf-8')) if state_path.exists() else {}
    results = {}
    for source in sources:
        if only_due and not due(source, state):
            results[source] = {'status': 'not_due'}
            continue
        status, datasets = 'collected', {}
        try:
            if source in ('gsc', 'ga4'):
                if not readiness['google_service_account']['configured'] or not readiness[source+'_property']['format_valid']:
                    results[source] = {'status': 'human_configuration_required'}
                    continue
                for days in windows:
                    _, common_end = date_window(days, end_date, lag_days=3)
                    method = google.collect_gsc if source == 'gsc' else google.collect_ga4
                    datasets[source+'_'+str(days)] = method(days, common_end)
                    if source == 'ga4':
                        datasets['funnel_'+str(days)] = google.collect_funnel(days, common_end)
            elif source in ('pagespeed', 'crux'):
                if not readiness['google_api_key']['configured']:
                    results[source] = {'status': 'api_key_required', 'anonymous_retry': False}
                    continue
                method = google.collect_pagespeed if source == 'pagespeed' else google.collect_crux
                datasets[source] = method(ORIGIN+'/')
            elif source == 'commerce':
                from .cloudflare import CloudflareReadOnly
                datasets[source] = CloudflareReadOnly(store, database).collect_commerce()
            elif source == 'storefront':
                from .storefront import collect_storefront
                datasets[source] = collect_storefront(ORIGIN, store, pdp_urls)
            elif source == 'nuvemshop':
                if not readiness['nuvemshop']['configured']:
                    results[source] = {'status': 'credential_missing', 'mirror_available': bool(cached(store, 'commerce'))}
                    continue
                from .nuvemshop import NuvemshopCollector
                datasets[source] = NuvemshopCollector(config, store).collect_products()
            results[source] = {'status': status, 'datasets': {name: save_normalized(store, name, data)['changed'] for name, data in datasets.items()}}
            state[source] = {'last_success': datetime.now(timezone.utc).isoformat(), 'status': status}
        except GoogleAPIError as error:
            status = 'api_gap'
            results[source] = {'status': status, 'http_status': error.status}
        except Exception:
            status = 'collector_gap'
            results[source] = {'status': status, 'note': 'Check credentials, connectivity, quota and schema; no exception body logged.'}
        if status != 'collected':
            state[source] = {'last_attempt': datetime.now(timezone.utc).isoformat(), 'status': status}
        atomic_json(state_path, state)
    return {'collectors': results, 'baseline': commercial_baseline(store, windows, end_date),
            'pending_events': len(store.pending()), 'llm_calls': 0, 'remote_writes': 0}
