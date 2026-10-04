import json
import tempfile
import unittest
from pathlib import Path
from marquesa_intelligence.config import configure_google_project, load_config, valid_project_id
from marquesa_intelligence.connector import import_gsc_reports
from marquesa_intelligence.storage import SnapshotStore


def fixture():
    reports=[]
    for dimensions in [[], ['query'], ['page'], ['query','page']]:
        request={'siteUrl':'sc-domain:example.com','startDate':'2026-09-02','endDate':'2026-09-29','dimensions':dimensions}
        payload={**request,'rows':[{'keys':['x']*len(dimensions),'clicks':2,'impressions':100,'ctr':2,'position':8}],
            'pagination':{'hasMore':False},'dataSource':'api','settledThrough':'2026-09-29'}
        reports.append({'args':request,'data':{'structuredContent':payload}})
    return reports


class ConnectorTests(unittest.TestCase):
    def test_raw_percentage_preserved_normalized_fraction_and_repeat_noop(self):
        with tempfile.TemporaryDirectory() as d:
            store=SnapshotStore(d)
            report=import_gsc_reports(store,fixture())
            self.assertEqual(report['28']['totals']['ctr'],.02)
            self.assertFalse(report['28']['service_account_connected'])
            raw=json.loads(next((Path(d)/'raw/gsc_wizard_response').glob('*.json')).read_text(encoding='utf-8'))
            self.assertEqual(raw['payload']['rows'][0]['ctr'],2)
            self.assertFalse(import_gsc_reports(store,fixture())['28']['changed'])
            self.assertEqual(len(store.pending()),1)

    def test_unsettled_window_rejected_after_preserving_raw(self):
        with tempfile.TemporaryDirectory() as d:
            reports=fixture();reports[0]['data']['structuredContent']['settledThrough']='2026-09-28'
            with self.assertRaises(ValueError):import_gsc_reports(SnapshotStore(d),reports)
            self.assertTrue(list((Path(d)/'raw').rglob('*.json')))
            self.assertFalse((Path(d)/'normalized/gsc_28.json').exists())

    def test_property_or_period_mismatch_rejected(self):
        for key,value in [('siteUrl','sc-domain:other.example'),('endDate','2026-09-30')]:
            with tempfile.TemporaryDirectory() as d:
                reports=fixture();reports[0]['data']['structuredContent'][key]=value
                with self.assertRaises(ValueError):import_gsc_reports(SnapshotStore(d),reports)

    def test_missing_dataset_or_pagination_cannot_claim_completeness(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):import_gsc_reports(SnapshotStore(d),fixture()[:3])
        with tempfile.TemporaryDirectory() as d:
            reports=fixture();reports[0]['data']['structuredContent']['pagination']={}
            with self.assertRaises(ValueError):import_gsc_reports(SnapshotStore(d),reports)


class GoogleProjectTests(unittest.TestCase):
    def test_ga4_numeric_metadata_persisted_and_invalid_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            configure_google_project('marquesa-seo', config_dir=d, ga4_property='473886060')
            self.assertEqual(load_config({},d)['GA4_PROPERTY_ID'], '473886060')
            for value in ('G-EXAMPLE', '123\nGOOGLE_API_KEY=x', '', '999'):
                with self.assertRaises(ValueError):
                    configure_google_project('marquesa-seo', config_dir=d, ga4_property=value)

    def test_configure_preserves_credential_lines(self):
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'.env';file.write_text('GOOGLE_API_KEY=test-only\nGSC_PROPERTY=\n',encoding='utf-8')
            status=configure_google_project('marquesa-seo','sc-domain:example.com',d)
            config=load_config({},d)
            self.assertEqual(config['GOOGLE_CLOUD_PROJECT'],'marquesa-seo')
            self.assertEqual(config['GOOGLE_API_KEY'],'test-only')
            self.assertNotIn('test-only',json.dumps(status))
            self.assertFalse(status['credential_values_changed'])

    def test_project_switch_or_newline_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'.env';file.write_text('GOOGLE_CLOUD_PROJECT=other-project\n',encoding='utf-8')
            before=file.read_text()
            with self.assertRaises(ValueError):configure_google_project('marquesa-seo',config_dir=d)
            self.assertEqual(file.read_text(),before)
        for project in ('abc','123456','bad;script','project\nGOOGLE_API_KEY=x'):
            self.assertFalse(valid_project_id(project))


if __name__=='__main__':unittest.main()
