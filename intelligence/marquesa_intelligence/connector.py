"""Import already authorized GSC Wizard responses without OAuth secrets.

MCP runs in Codex, not the scheduled Python process. This path supplements,
but does not configure, dedicated Google service-account authentication.
"""
import math
from datetime import date
from .pipeline import save_normalized


def import_gsc_reports(store, reports):
    datasets, summary = {}, {}
    for report in reports:
        request, result = report['args'], report['data']
        payload = result.get('structuredContent')
        if result.get('isError') or not isinstance(payload, dict):
            raise ValueError('Connector response unavailable; do not infer empty Google data')
        raw = store.capture('gsc_wizard_response', {'tool': 'query_search_analytics', **request}, payload, enqueue=False)
        if payload.get('siteUrl') != request.get('siteUrl'):
            raise ValueError('Connector property mismatch')
        dimensions = request.get('dimensions', [])
        if payload.get('dimensions') != dimensions:
            raise ValueError('Connector dimensions mismatch')
        start, end = payload.get('startDate'), payload.get('endDate')
        if start != request.get('startDate') or end != request.get('endDate'):
            raise ValueError('Connector date window mismatch')
        days = (date.fromisoformat(end)-date.fromisoformat(start)).days+1
        if days not in (28,90):
            raise ValueError('Only prepared 28/90-day baselines are supported')
        maturity = payload.get('dataMaturity', {})
        settled = maturity.get('settledThrough') or payload.get('settledThrough')
        if not settled or end > settled:
            raise ValueError('Baseline extends beyond the confirmed settled date')
        dataset = datasets.setdefault(days, {'source': 'gsc', 'transport': 'GSC Wizard MCP',
            'property': payload['siteUrl'], 'start_date': start, 'end_date': end,
            'timezone': 'America/Los_Angeles', 'search_type': 'web', 'reports': {},
            'gaps': ['MCP access is available in Codex; this is not proof of scheduled service-account access.',
                     'Query dimensions omit anonymized searches; top-row pagination does not prove all search traffic.']})
        if dataset['property'] != payload['siteUrl'] or dataset['start_date'] != start or dataset['end_date'] != end:
            raise ValueError('Cannot mix properties or windows in one baseline')
        name = '_'.join(dimensions) or 'totals'
        if name in dataset['reports']:
            raise ValueError('Duplicate report; pagination must be consolidated explicitly')
        rows = []
        for row in payload.get('rows', []):
            if len(row.get('keys', [])) != len(dimensions):
                raise ValueError('Unexpected connector row dimensions')
            numeric = {}
            for key in ('clicks','impressions','position'):
                value = float(row[key])
                if not math.isfinite(value) or value < 0:
                    raise ValueError('Invalid Google metric')
                numeric[key] = value
            if numeric['clicks'] > numeric['impressions']:
                raise ValueError('Invalid click/impression counts')
            # The connector returns CTR in percentage points; API-shaped
            # normalized data uses a fraction. Preserve the original in raw.
            rows.append({'keys': row['keys'], **numeric,
                'ctr': numeric['clicks']/numeric['impressions'] if numeric['impressions'] else 0.0})
        pagination = payload.get('pagination', {})
        if not isinstance(pagination.get('hasMore'), bool):
            raise ValueError('Missing pagination coverage; completeness cannot be inferred')
        dataset['reports'][name] = {'dimensions': dimensions, 'rows': rows, 'snapshots': [raw],
            'data_source': payload.get('dataSource'), 'data_maturity': maturity,
            'coverage': {'returned_rows': len(rows), 'limit_reached': pagination['hasMore'],
                         'pagination_exhausted': not pagination['hasMore'], 'all_search_traffic': not dimensions}}
    for days, dataset in datasets.items():
        if set(dataset['reports']) != {'totals','query','page','query_page'}:
            raise ValueError('Incomplete baseline report set')
        manifest = save_normalized(store, 'gsc_'+str(days), dataset)
        totals = dataset['reports']['totals']['rows']
        summary[str(days)] = {'start_date': dataset['start_date'], 'end_date': dataset['end_date'],
            'reports': {k: len(v['rows']) for k,v in dataset['reports'].items()},
            'totals': totals[0] if len(totals)==1 else None, 'changed': manifest['changed'],
            'service_account_connected': False}
    return summary
