import json
import tempfile
import unittest
from pathlib import Path

from marquesa_intelligence.config import load_config, validate_config
from marquesa_intelligence.storage import SnapshotStore


class ConfigurationTests(unittest.TestCase):
    def test_blank_example_does_not_override_ignored_storage_default(self):
        from marquesa_intelligence.config import ROOT
        with tempfile.TemporaryDirectory() as d:
            Path(d, '.env').write_text('MARQUESA_INTELLIGENCE_STORAGE=\nGOOGLE_APPLICATION_CREDENTIALS=\n', encoding='utf-8')
            config = load_config({}, config_dir=Path(d))
            self.assertEqual(Path(config['MARQUESA_INTELLIGENCE_STORAGE']), ROOT/'.local/intelligence')
            self.assertNotIn('GOOGLE_APPLICATION_CREDENTIALS', config)
    def test_missing_secrets_are_status_only(self):
        with tempfile.TemporaryDirectory() as d:
            config = load_config({}, config_dir=Path(d))
            result = validate_config(config)
            self.assertFalse(result['google_service_account']['configured'])
            self.assertFalse(result['google_api_key']['configured'])
            self.assertNotIn('private_key', json.dumps(result))

    def test_credentials_inside_workspace_are_rejected(self):
        result = validate_config({'GOOGLE_APPLICATION_CREDENTIALS': str(Path.cwd()/'intelligence'/'service_account.json')})
        self.assertEqual(result['google_service_account']['status'], 'unsafe_path')

    def test_external_env_loading_does_not_override_process(self):
        with tempfile.TemporaryDirectory() as d:
            Path(d, '.env').write_text('GSC_PROPERTY=sc-domain:example.com\nGOOGLE_API_KEY=test-only\n', encoding='utf-8')
            config = load_config({'GSC_PROPERTY': 'sc-domain:override.example'}, config_dir=Path(d))
            self.assertEqual(config['GSC_PROPERTY'], 'sc-domain:override.example')
            self.assertEqual(config['GOOGLE_API_KEY'], 'test-only')
            self.assertNotIn('test-only', json.dumps(validate_config(config)))


class StorageTests(unittest.TestCase):
    def test_repository_root_cannot_receive_operational_snapshots(self):
        from marquesa_intelligence.config import ROOT
        for path in (ROOT, ROOT/'intelligence/raw', ROOT/'.local-other'):
            with self.assertRaises(ValueError):
                SnapshotStore(path)
        self.assertEqual(SnapshotStore(ROOT/'.local/intelligence').root, ROOT/'.local/intelligence')
    def test_volatile_quota_keeps_raw_without_waking_analysis(self):
        with tempfile.TemporaryDirectory() as d:
            store = SnapshotStore(d)
            first = store.capture('ga4_report', {}, {'rows': [], 'propertyQuota': {'remaining': 10}})
            second = store.capture('ga4_report', {}, {'rows': [], 'propertyQuota': {'remaining': 9}})
            self.assertFalse(second['changed'])
            self.assertNotEqual(first['sha256'], second['sha256'])
            self.assertEqual(len(store.pending()), 1)
            self.assertEqual(json.loads(Path(second['path']).read_text())['payload']['propertyQuota']['remaining'], 9)

    def test_d1_timings_are_not_commercial_changes(self):
        with tempfile.TemporaryDirectory() as d:
            store = SnapshotStore(d)
            store.capture('d1_commerce', {}, [{'results': [{'sku': 'A', 'qtd': 1}], 'success': True, 'meta': {'duration': 1}}])
            second = store.capture('d1_commerce', {}, [{'results': [{'sku': 'A', 'qtd': 1}], 'success': True, 'meta': {'duration': 2}}])
            self.assertFalse(second['changed'])
    def test_raw_is_auditable_and_unchanged_does_not_enqueue(self):
        with tempfile.TemporaryDirectory() as d:
            store = SnapshotStore(d)
            one = store.capture('gsc', {'property': 'sc-domain:example.com'}, {'rows': []})
            two = store.capture('gsc', {'property': 'sc-domain:example.com'}, {'rows': []})
            self.assertTrue(one['changed'])
            self.assertFalse(two['changed'])
            self.assertEqual(len(store.pending()), 1)
            self.assertEqual(len(list(Path(d, 'raw').rglob('*.json'))), 2)
            self.assertEqual(json.loads(Path(one['path']).read_text(encoding='utf-8'))['payload'], {'rows': []})

    def test_mutation_enqueues_once_and_source_is_separate(self):
        with tempfile.TemporaryDirectory() as d:
            store = SnapshotStore(d)
            store.capture('gsc', {'url': 'https://example.com'}, {'clicks': 1})
            store.capture('gsc', {'url': 'https://example.com'}, {'clicks': 2})
            store.capture('gsc', {'url': 'https://example.com'}, {'clicks': 2})
            store.capture('ga4', {'url': 'https://example.com'}, {'clicks': 2})
            self.assertEqual(len(store.pending()), 3)

    def test_secret_or_auth_metadata_cannot_be_persisted(self):
        with tempfile.TemporaryDirectory() as d:
            store = SnapshotStore(d)
            for secret in ({'private_key': 'test'}, {'nested': {'access_token': 'test'}}, {'Authorization': 'Bearer test'}):
                with self.assertRaises(ValueError):
                    store.capture('gsc', {}, secret)
            with self.assertRaises(ValueError):
                store.capture('gsc', {'url': 'https://example.com?key=test'}, {})
            self.assertEqual(list(Path(d).rglob('*.json')), [])


if __name__ == '__main__':
    unittest.main()
