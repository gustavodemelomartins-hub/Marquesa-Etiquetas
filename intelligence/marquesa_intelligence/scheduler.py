"""Deterministic due checks; no system task registration or AI dispatch."""
from datetime import datetime, timezone, timedelta

INTERVALS = {'gsc': 86400, 'ga4': 86400, 'commerce': 86400,
             'storefront': 86400, 'nuvemshop': 86400,
             'pagespeed': 604800, 'crux': 604800}


def due(source, state, now=None):
    if source not in INTERVALS:
        raise ValueError('Unknown deterministic schedule source')
    now = now or datetime.now(timezone.utc)
    entry = state.get(source, {})
    previous = entry.get('last_success') or entry.get('last_attempt')
    if not previous:
        return True
    previous = datetime.fromisoformat(previous)
    if previous.tzinfo is None:
        raise ValueError('Schedule timestamps must contain timezone')
    return now >= previous + timedelta(seconds=INTERVALS[source])


def plan():
    return {'registered': False, 'llm_calls': 0, 'sources': {
        source: {'interval_seconds': seconds, 'runner': 'deterministic Python'}
        for source, seconds in INTERVALS.items()},
        'serp': 'Weekly later; requires approved provider/quota, not configured',
        'commerce_future': 'Prefer operational events; daily SELECT is fallback',
        'frontend_change': 'Explicit pagespeed/crux run after relevant changes',
        'pending': 'No automatic AI dispatch, publication or external writes'}
