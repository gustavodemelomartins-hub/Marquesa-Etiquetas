"""Bounded public HTML inspection; never execute checkout or analytics events."""
from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

EVENTS = ('view_item', 'add_to_cart', 'begin_checkout', 'purchase')


class MetadataParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical = None
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical = attrs.get('href')
        if tag == 'script' and attrs.get('src'):
            self.scripts.append(attrs['src'])


def inspect_html(html, url):
    parser = MetadataParser()
    parser.feed(html)
    variants, gaps = [], []
    match = re.search(r'LS\.variants\s*=\s*', html)
    if match:
        try:
            parsed, _ = json.JSONDecoder().raw_decode(html[match.end():])
            if isinstance(parsed, list):
                variants = [{'variant_id': str(v['id']), 'sku': v.get('sku'), 'product_id': str(v['product_id']),
                             'stock': v.get('stock'), 'price': v.get('price_number'), 'available': v.get('available')}
                            for v in parsed if v.get('id') is not None and v.get('product_id') is not None]
        except (ValueError, TypeError, KeyError):
            gaps.append('variants_parse_failed')
    product_ids = {v['product_id'] for v in variants}
    if len(product_ids) > 1:
        gaps.append('multiple_product_ids')
    store = re.search(r'LS\.store\s*=\s*\{\s*id\s*:\s*(\d+)', html) or re.search(r'LS\.id\s*=\s*[\"\']?(\d+)', html)
    grouped = re.search(r'has_google_analytics_track_product_ids\s*:\s*(true|false)', html)
    declared = [event for event in EVENTS if re.search(r"(?:['\"]event['\"]\s*[:,]\s*['\"]"+event+r"['\"]|event\s*:\s*['\"]"+event+r"['\"])", html)]
    parameters = [name for name in ('item_id', 'item_name', 'value', 'currency', 'transaction_id') if re.search(r"(?:['\"]"+name+r"['\"]|\b"+name+r"\b)\s*:", html)]
    item_ids = sorted(set(re.findall(r"(?:['\"]item_id['\"]|\bitem_id\b)\s*:\s*['\"]?(\d+)", html)))
    return {'url': url, 'canonical': parser.canonical, 'store_id': store.group(1) if store else None,
            'ga4_measurement_ids': sorted(set(re.findall(r'\bG-[A-Z0-9]{6,}\b', html))),
            'gtm_container_ids': sorted(set(re.findall(r'\bGTM-[A-Z0-9]+\b', html))),
            'declared_events': declared, 'events_received_verified': False,
            'declared_parameter_names': parameters, 'declared_numeric_item_ids': item_ids,
            'ga4_track_product_ids_setting': grouped.group(1) == 'true' if grouped else None,
            'tracking_layers': [layer for layer in ('dataLayerTN', 'dataLayer') if layer in html],
            'scripts': [urljoin(url, src) for src in parser.scripts],
            'storefront_product': {'url': parser.canonical or url, 'produto_id_loja': next(iter(product_ids)) if len(product_ids) == 1 else None, 'variants': variants},
            'gaps': gaps + ['HTML declarations do not prove consent, firing, GA4 receipt, revenue or transaction deduplication.']}


def inspect_sitemap(body):
    root = ET.fromstring(body)
    urls, mods, children = [], [], []
    for item in root:
        fields = {element.tag.rsplit('}', 1)[-1]: element.text for element in item}
        if item.tag.rsplit('}', 1)[-1] == 'sitemap':
            children.append(fields.get('loc'))
        elif fields.get('loc'):
            urls.append(fields['loc'])
            if fields.get('lastmod'):
                mods.append(fields['lastmod'])
    return {'urls': urls, 'url_count': len(urls), 'pdp_urls': sum(urlsplit(u).path.startswith('/produtos/') and bool(urlsplit(u).path[len('/produtos/'):].strip('/')) for u in urls),
            'lastmod_max': max(mods) if mods else None, 'child_sitemaps': children, 'internal_catalogue_verified': False}


def collect_storefront(origin, store, pdp_urls=(), transport=None):
    import requests
    parsed = urlsplit(origin)
    if parsed.scheme != 'https' or parsed.hostname != 'marquesasemijoias.com.br' or parsed.query or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('Only the confirmed public Marquesa storefront origin is allowed')
    urls = [urljoin(origin, path) for path in ('/', '/robots.txt', '/sitemap.xml')]
    for url in pdp_urls:
        p = urlsplit(url)
        if p.hostname != parsed.hostname or p.scheme != 'https' or not p.path.startswith('/produtos/') or p.query or p.username or p.password or p.port not in (None, 443):
            raise ValueError('Only public PDP URLs of the confirmed storefront are allowed')
        urls.append(url)
    if len(urls) > 23:
        raise ValueError('Public probe limited to 20 PDPs per explicit run')
    result = {'source': 'storefront_public', 'pages': [], 'gaps': []}
    for url in urls:
        if transport:
            status, text = transport(url)
        else:
            response = requests.get(url, timeout=(10, 40), allow_redirects=False, headers={'User-Agent': 'Marquesa-Intelligence/0.1 (+read-only audit)'})
            status, text = response.status_code, response.text
        raw = store.capture('storefront_public', {'url': url, 'method': 'GET'}, {'http_status': status, 'body': text}, enqueue=False)
        if status != 200:
            result['gaps'].append({'url': url, 'status': status})
            continue
        if urlsplit(url).path.endswith('/sitemap.xml'):
            result['sitemap'] = dict(inspect_sitemap(text), snapshot=raw)
        elif urlsplit(url).path.endswith('/robots.txt'):
            result['robots'] = {'snapshot': raw, 'sitemaps': re.findall(r'^Sitemap:\s*(.+)$', text, re.M)}
        else:
            parsed_page = inspect_html(text, url)
            semantic = {k: parsed_page[k] for k in ('canonical', 'store_id', 'ga4_measurement_ids', 'gtm_container_ids', 'declared_events', 'tracking_layers', 'storefront_product')}
            store.capture('storefront_identity', {'url': url}, semantic)
            result['pages'].append(dict(parsed_page, snapshot=raw))
    return result
