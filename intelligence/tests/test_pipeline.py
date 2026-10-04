import json
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch
from marquesa_intelligence.storage import SnapshotStore, atomic_json
from marquesa_intelligence.pipeline import collect, commercial_baseline, save_normalized, semantic
from marquesa_intelligence.scheduler import due, plan


def fixture():
    return {'tables': {'produtos': [{'sku': 'A', 'produto_id_loja': '12', 'url_loja': 'https://marquesasemijoias.com.br/produtos/a/',
        'status': 'ativo', 'qtd': 10, 'preco': 100, 'custo': 25}],
        'movimentos_aggregate': [{'sku': 'A', 'saldo_movimentos': 10}],
        'loja_variantes': [{'variante_id': '34', 'produto_id': '12', 'sku': 'A', 'produto_url': 'https://marquesasemijoias.com.br/produtos/a/'}],
        'maletas': [], 'maleta_itens': [], 'kit_componentes': [], 'vendas': [], 'venda_itens': []}, 'meta': {}}


class SchedulerTests(unittest.TestCase):
    def test_daily_weekly_and_backoff(self):
        now = datetime(2026, 10, 3, tzinfo=timezone.utc)
        yesterday = (now-timedelta(days=1)).isoformat()
        self.assertTrue(due('gsc', {'gsc': {'last_success': yesterday}}, now))
        self.assertFalse(due('pagespeed', {'pagespeed': {'last_success': yesterday}}, now))
        self.assertFalse(due('ga4', {'ga4': {'last_attempt': now.isoformat()}}, now))
        self.assertTrue(due('commerce', {}, now))
        self.assertFalse(plan()['registered'])

    def test_unknown_source_and_ambiguous_timestamp_fail(self):
        with self.assertRaises(ValueError):
            due('indexing', {})
        with self.assertRaises(ValueError):
            due('gsc', {'gsc': {'last_success': '2026-10-03T00:00:00'}})


class PipelineTests(unittest.TestCase):
    def test_missing_google_is_explicit_without_network(self):
        with tempfile.TemporaryDirectory() as d, patch('marquesa_intelligence.google.GoogleCollectors._network') as network:
            result = collect({'MARQUESA_INTELLIGENCE_STORAGE': d}, ['gsc','ga4','pagespeed','crux','nuvemshop'])
            self.assertEqual(result['collectors']['gsc']['status'], 'human_configuration_required')
            self.assertEqual(result['collectors']['ga4']['status'], 'human_configuration_required')
            self.assertEqual(result['collectors']['pagespeed']['status'], 'api_key_required')
            self.assertEqual(result['baseline']['status'], 'gap')
            network.assert_not_called()

    def test_no_site_coverage_blocks_dead_stock_campaign(self):
        with tempfile.TemporaryDirectory() as d:
            store = SnapshotStore(d)
            save_normalized(store, 'commerce', fixture())
            result = commercial_baseline(store, (28,90), '2026-09-30')
            self.assertEqual(result['ga4_variant_links'], 1)
            self.assertEqual(result['opportunities'], {'28':0,'90':0})
            report = json.loads(Path(result['report']).read_text(encoding='utf-8'))
            for period in report['periods'].values():
                coverage = next(c for c in period['opportunities']['coverage'] if c['code']=='J')
                self.assertEqual(coverage['evaluated'], 0)
                self.assertIn('operational_site_sales_coverage_unverified', coverage['missing'])
                self.assertIsNone(period['opportunities']['funnel']['stages']['sessions'])

    def test_second_baseline_does_not_enqueue_analysis(self):
        with tempfile.TemporaryDirectory() as d:
            store = SnapshotStore(d)
            save_normalized(store, 'commerce', fixture())
            commercial_baseline(store, (28,), '2026-09-30')
            n = len(store.pending())
            commercial_baseline(store, (28,), '2026-09-30')
            self.assertEqual(len(store.pending()), n)

    def test_some_site_rows_do_not_prove_complete_order_ingestion(self):
        with tempfile.TemporaryDirectory() as d:
            store = SnapshotStore(d)
            data = fixture()
            data['tables']['vendas'] = [{'id': '1', 'origem': 'site', 'cancelada': 0, 'data': '2026-09-20', 'total': 50}]
            save_normalized(store, 'commerce', data)
            result = commercial_baseline(store, (28,), '2026-09-30')
            report = json.loads(Path(result['report']).read_text(encoding='utf-8'))
            opportunities = report['periods']['28']['opportunities']['opportunities']
            self.assertFalse(any(p['code']=='J' for p in opportunities))

    def test_lineage_and_quota_do_not_wake_normalized_analysis(self):
        with tempfile.TemporaryDirectory() as d:
            store = SnapshotStore(d)
            save_normalized(store, 'ga4_28', {'rows': [], 'snapshots': [{'id':'a'}], 'propertyQuota': {'remaining':5}})
            second = save_normalized(store, 'ga4_28', {'rows': [], 'snapshots': [{'id':'b'}], 'propertyQuota': {'remaining':4}})
            self.assertFalse(second['changed'])

    def test_due_check_skips_remote_probe(self):
        with tempfile.TemporaryDirectory() as d, patch('marquesa_intelligence.cloudflare.CloudflareReadOnly.collect_commerce') as network:
            atomic_json(Path(d)/'state/schedule.json', {'commerce': {'last_success': datetime.now(timezone.utc).isoformat()}})
            result = collect({'MARQUESA_INTELLIGENCE_STORAGE': d}, ['commerce'], only_due=True)
            self.assertEqual(result['collectors']['commerce']['status'], 'not_due')
            network.assert_not_called()

    def test_remote_exception_body_cannot_leak(self):
        with tempfile.TemporaryDirectory() as d, patch('marquesa_intelligence.cloudflare.CloudflareReadOnly.collect_commerce', side_effect=RuntimeError('Bearer secret-example')):
            result = collect({'MARQUESA_INTELLIGENCE_STORAGE': d}, ['commerce'])
            self.assertNotIn('secret-example', json.dumps(result))
            self.assertEqual(result['collectors']['commerce']['status'], 'collector_gap')


if __name__ == '__main__':
    unittest.main()
