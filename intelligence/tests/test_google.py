import unittest
import json
import tempfile
from pathlib import Path
from datetime import date
from unittest.mock import patch

from marquesa_intelligence.config import ROOT

from marquesa_intelligence.google import GoogleCollectors, GoogleAPIError, date_window, event_ratios
from marquesa_intelligence.storage import SnapshotStore, digest, assert_safe


class Store:
    def __init__(self):
        self.calls = []

    def capture(self, source, request_meta, payload, **kwargs):
        self.calls.append((source, request_meta, payload))
        return {"source": source, "sequence": len(self.calls)}


class CollectorTests(unittest.TestCase):
    def test_pagespeed_resource_credentials_redacted_before_snapshot_metrics_preserved(self):
        payload = {'lighthouseResult': {'lighthouseVersion':'13.0.0',
            'categories':{'performance':{'score':.71}}, 'audits':{'requests':{'details':{'items':[
                {'url':'https://cdn.example/image?token=asset-secret&width=800'},
                {'url':'https://cdn.example/script?KEY=another-secret&x=1'},
                {'url':'https://cdn.example/pixel?access_token=third-secret'}]}}}}}
        with tempfile.TemporaryDirectory() as folder:
            store = SnapshotStore(folder)
            failure = None
            try:
                report = GoogleCollectors({'GOOGLE_API_KEY':'private-google-key'},store,
                    lambda *args, **kwargs: payload).collect_pagespeed('https://example.com/')
            except ValueError:
                failure = 'Snapshot guard blocked unsanitized resource credentials'
            self.assertIsNone(failure, failure)
            self.assertEqual(report['performance_score'],.71)
            raw = json.loads(next((Path(folder)/'raw/pagespeed').glob('*.json')).read_text(encoding='utf-8'))
            text = json.dumps(raw)
            for secret in ('asset-secret','another-secret','third-secret','private-google-key'):
                self.assertNotIn(secret,text)
            self.assertIn('width=800',text)
            self.assertIn('x=1',text)
            self.assertEqual(raw['payload']['security_redaction']['removed_url_parameters'],3)
            self.assertEqual(raw['payload']['security_redaction']['original_payload_sha256'],digest(payload))
            # The shared gate remains strict for every other collector/snapshot.
            with self.assertRaises(ValueError):
                assert_safe('https://cdn.example/image?token=asset-secret')

    def test_window_is_inclusive_and_validated(self):
        self.assertEqual(date_window(28, "2026-10-01"), ("2026-09-04", "2026-10-01"))
        self.assertEqual(date_window(90, date(2026, 10, 1)), ("2026-07-04", "2026-10-01"))
        with self.assertRaises(ValueError):
            date_window(0, "2026-10-01")

    def test_gsc_separate_dimensions_paginate_capture_before_normalization(self):
        store, calls = Store(), []
        def transport(method, url, body=None, headers=None):
            calls.append((method, url, body))
            if not body["dimensions"]:
                return {"rows": [{"clicks": 8, "impressions": 100, "ctr": .08, "position": 5}]}
            if body["startRow"] == 0:
                return {"rows": [{"keys": ["x"] * len(body["dimensions"]), "clicks": 1}] * 2}
            return {"rows": [{"keys": ["y"] * len(body["dimensions"]), "clicks": 1}]}
        result = GoogleCollectors({"GSC_PROPERTY": "sc-domain:example.com", "GSC_PAGE_SIZE": 2}, store, transport).collect_gsc(28, "2026-10-01")
        self.assertEqual(set(result["reports"]), {"query", "page", "query_page", "totals"})
        self.assertEqual(len(result["reports"]["query"]["rows"]), 3)
        self.assertEqual(len(store.calls), 7)
        self.assertTrue(all(c[2]["dataState"] == "final" for c in calls))
        self.assertTrue(all("indexing" not in c[1] for c in calls))
        self.assertFalse(result["reports"]["query"]["coverage"]["all_search_traffic"])

    def test_gsc_limit_has_explicit_incomplete_coverage(self):
        result = GoogleCollectors({"GSC_PROPERTY": "sc-domain:a.com", "GSC_PAGE_SIZE": 2, "GSC_MAX_ROWS": 2}, Store(), lambda *a, **kw: {"rows": [{"keys": ["a"]}, {"keys": ["b"]}]}).collect_gsc(28, "2026-10-01")
        self.assertTrue(result["reports"]["query"]["coverage"]["limit_reached"])
        self.assertFalse(result["reports"]["query"]["coverage"]["pagination_exhausted"])

    def test_key_header_never_in_snapshot_or_url(self):
        store, calls = Store(), []
        def transport(method, url, body=None, headers=None):
            calls.append((url, headers))
            return {"lighthouseResult": {"lighthouseVersion": "13.0.0"}}
        GoogleCollectors({"GOOGLE_API_KEY": "secret-key"}, store, transport).collect_pagespeed("https://example.com/p/")
        self.assertEqual(calls[0][1]["X-Goog-Api-Key"], "secret-key")
        self.assertNotIn("secret-key", str(store.calls))
        self.assertNotIn("secret-key", calls[0][0])

    def test_exceptions_do_not_leak_transport_secrets(self):
        store = Store()
        def broken(*a, **kw):
            raise RuntimeError("secret-key Authorization bearer")
        with self.assertRaises(GoogleAPIError) as failure:
            GoogleCollectors({"GOOGLE_API_KEY": "secret-key"}, store, broken).collect_pagespeed("https://example.com")
        self.assertNotIn("secret-key", str(failure.exception))
        self.assertNotIn("secret-key", str(store.calls))
        self.assertEqual(store.calls[0][2], {"collector_error": {"source": "pagespeed", "http_status": None}})

    def test_real_auth_rejects_repository_credentials_before_read(self):
        collector = GoogleCollectors({"GOOGLE_APPLICATION_CREDENTIALS": str(ROOT / "unsafe-service-account.json")}, Store())
        with patch("google.oauth2.service_account.Credentials.from_service_account_file") as read:
            with self.assertRaises(ValueError):
                collector._network("GET", "https://www.googleapis.com/webmasters/v3/sites")
            read.assert_not_called()

    def test_google_error_payload_saves_status_only(self):
        store = Store()
        transport = lambda *a, **kw: {"error": {"code": 403, "message": "secret-key echoed credential"}}
        with self.assertRaises(GoogleAPIError):
            GoogleCollectors({"GOOGLE_API_KEY": "secret-key"}, store, transport).collect_pagespeed("https://example.com")
        self.assertEqual(store.calls[0][2]["collector_error"]["http_status"], 403)
        self.assertNotIn("secret-key", str(store.calls))

    def test_event_ratios_are_event_volume_not_session_conversion(self):
        values = event_ratios({"view_item": 20, "add_to_cart": 4, "begin_checkout": 2, "purchase": 1})
        self.assertEqual(values["pdp_to_cart_event_ratio"], .2)
        self.assertNotIn("conversion_rate", values)
        missing = event_ratios({"view_item": 0, "purchase": 2})
        self.assertIsNone(missing["pdp_to_cart_event_ratio"])
        self.assertIsNone(missing["checkout_to_purchase_event_ratio"])

    def test_ga4_missing_and_nonfinite_values_are_unknown_not_zero(self):
        payload = {"metricHeaders": [{"name": "purchaseRevenue"}, {"name": "eventCount"}],
                   "rows": [{"metricValues": [{}, {"value": "NaN"}]}]}
        self.assertEqual(GoogleCollectors._ga4_rows(payload), [{"purchaseRevenue": None, "eventCount": None}])

    def test_crux_404_reports_insufficient_data_not_auth(self):
        def missing(*a, **kw):
            raise GoogleAPIError("crux", 404)
        result = GoogleCollectors({"GOOGLE_API_KEY": "key"}, Store(), missing).collect_crux("https://example.com")
        self.assertEqual(result["status"], "insufficient_field_data")

    def test_write_endpoints_and_secret_target_urls_are_rejected(self):
        collector = GoogleCollectors({}, Store(), lambda *a, **kw: {})
        for method, url in (("POST", "https://indexing.googleapis.com/v3/urlNotifications:publish"),
                            ("POST", "https://analyticsadmin.googleapis.com/v1beta/properties/123"),
                            ("DELETE", "https://www.googleapis.com/webmasters/v3/sites")):
            with self.assertRaises(ValueError):
                collector._request("unsafe", method, url)
        for url in ("http://example.com", "https://user:password@example.com", "https://127.0.0.1", "https://example.com?key=secret"):
            with self.assertRaises(ValueError):
                collector.collect_pagespeed(url)

    def test_ga4_report_pagination_and_threshold_metadata_preserved(self):
        calls, store = [], Store()
        def transport(method, url, body=None, headers=None):
            calls.append((url, body))
            if url.endswith(":checkCompatibility"):
                return {}
            count = 2 if body["offset"] == "0" else 1
            return {"dimensionHeaders": [{"name": "eventName"}], "metricHeaders": [{"name": "eventCount"}],
                    "rows": [{"dimensionValues": [{"value": "purchase"}], "metricValues": [{"value": "1"}]}] * count,
                    "rowCount": 3, "metadata": {"subjectToThresholding": True}}
        collector = GoogleCollectors({"GA4_PAGE_SIZE": 2}, store, transport)
        result = collector._ga4_report("123", "2026-09-01", "2026-09-28", ["eventName"], ["eventCount"], False, {"eventName"}, {"eventCount"})
        self.assertEqual(len(result["rows"]), 3)
        self.assertEqual(calls[-1][1]["offset"], "2")
        self.assertEqual(len(store.calls), 3)
        self.assertTrue(result["metadata"][0]["subjectToThresholding"])

    def test_ga4_incompatible_item_scope_not_requested(self):
        calls = []
        def transport(method, url, body=None, headers=None):
            calls.append(url)
            return {"metricCompatibilities": [{"metricMetadata": {"apiName": "itemsPurchased"}, "compatibility": "INCOMPATIBLE"}]}
        result = GoogleCollectors({}, Store(), transport)._ga4_report("123", "2026-09-01", "2026-09-28", ["itemId"], ["itemsPurchased"], False, {"itemId"}, {"itemsPurchased"})
        self.assertEqual(result["status"], "incompatible")
        self.assertEqual(len(calls), 1)

    def test_ga4_unrequested_incompatible_candidates_do_not_veto_report(self):
        calls = []
        def transport(method, url, body=None, headers=None):
            calls.append(url)
            if url.endswith(":checkCompatibility"):
                return {"metricCompatibilities": [
                    {"metricMetadata": {"apiName": "sessions"}, "compatibility": "COMPATIBLE"},
                    {"metricMetadata": {"apiName": "itemsPurchased"}, "compatibility": "INCOMPATIBLE"}],
                    "dimensionCompatibilities": [{"dimensionMetadata": {"apiName": "itemName"}, "compatibility": "INCOMPATIBLE"}]}
            return {"rows": [], "rowCount": 0}
        result = GoogleCollectors({}, Store(), transport)._ga4_report("123", "2026-09-01", "2026-09-28", [], ["sessions"], False, set(), {"sessions"})
        self.assertEqual(result["status"], "collected")
        self.assertTrue(calls[-1].endswith(":runReport"))

    def test_closed_ordered_funnel_preserves_active_user_grain(self):
        requests, store = [], Store()
        def transport(method, url, body=None, headers=None):
            requests.append(body)
            return {"funnelTable": {"dimensionHeaders": [{"name": "funnelStepName"}],
                     "metricHeaders": [{"name": "activeUsers"}, {"name": "funnelStepCompletionRate"}],
                     "rows": [{"dimensionValues": [{"value": "1. session_start"}],
                               "metricValues": [{"value": "100"}, {"value": ".5"}]}],
                     "metadata": {"samplingMetadatas": [{"samplesReadCount": "100", "samplingSpaceSize": "1000"}]}}}
        result = GoogleCollectors({"GA4_PROPERTY_ID": "123"}, store, transport).collect_funnel(28, "2026-10-01")
        self.assertFalse(requests[0]["funnel"]["isOpenFunnel"])
        self.assertEqual([x["filterExpression"]["funnelEventFilter"]["eventName"] for x in requests[0]["funnel"]["steps"]], ["session_start", "view_item", "add_to_cart", "begin_checkout", "purchase"])
        self.assertEqual(result["grain"], "ordered_active_user_cohort")
        self.assertEqual(result["rows"][0]["activeUsers"], 100)
        self.assertEqual(len(store.calls), 1)
        self.assertNotIn("sessions", result["rows"][0])

    def test_funnel_failure_is_gap_for_independent_baseline(self):
        def unavailable(*a, **kw):
            raise GoogleAPIError("ga4", 403)
        result = GoogleCollectors({"GA4_PROPERTY_ID": "123"}, Store(), unavailable).collect_funnel(28, "2026-10-01")
        self.assertEqual(result["status"], "api_gap")
        self.assertEqual(result["http_status"], 403)

    def test_ga4_events_missing_are_gaps_metadata_is_not_payload_proof(self):
        def transport(method, url, body=None, headers=None):
            if url.endswith("/metadata"):
                return {"dimensions": [{"apiName": x} for x in ["eventName", "landingPage", "sessionDefaultChannelGroup", "itemId", "itemName", "itemCategory"]], "metrics": [{"apiName": x} for x in ["sessions", "engagedSessions", "screenPageViews", "ecommercePurchases", "purchaseRevenue", "eventCount", "itemsViewed", "itemsAddedToCart", "itemsCheckedOut", "itemsPurchased", "itemRevenue"]]}
            if url.endswith(":checkCompatibility"):
                return {}
            if body["dimensions"] == [{"name": "eventName"}]:
                return {"dimensionHeaders": [{"name": "eventName"}], "metricHeaders": [{"name": "eventCount"}], "rows": [{"dimensionValues": [{"value": "view_item"}], "metricValues": [{"value": "10"}]}], "rowCount": 1}
            return {"rows": [], "rowCount": 0, "metadata": {"timeZone": "America/Sao_Paulo", "currencyCode": "BRL"}}
        result = GoogleCollectors({"GA4_PROPERTY_ID": "123"}, Store(), transport).collect_ga4(28, "2026-10-01")
        self.assertIn("purchase", result["event_gaps"]["all_traffic"])
        self.assertIsNone(result["event_ratios"]["all_traffic"]["checkout_to_purchase_event_ratio"])
        self.assertFalse(result["instrumentation_verified"])
        self.assertTrue(any("transaction_id" in gap for gap in result["gaps"]))


if __name__ == "__main__":
    unittest.main()
