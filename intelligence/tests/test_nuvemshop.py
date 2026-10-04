import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from marquesa_intelligence.nuvemshop import NuvemshopCollector, NuvemshopAPIError, BASE


class Store:
    def __init__(self):
        self.calls = []

    def capture(self, source, request, payload):
        self.calls.append((source, request, payload))
        return {"source": source, "sequence": len(self.calls)}


CONFIG = {"NUVEMSHOP_STORE_ID": "5134350", "NUVEMSHOP_TOKEN": "mock-secret-credential"}
PRODUCT = {"id": 12, "name": {"pt": "Anel"}, "canonical_url": "https://marquesasemijoias.com.br/produtos/anel/",
           "categories": [{"id": 3, "name": {"pt": "Anéis"}}],
           "variants": [{"id": 34, "product_id": 12, "sku": "ab-N-001", "price": "84.00", "stock": 0}]}


class NuvemshopTests(unittest.TestCase):
    def test_missing_invalid_config_never_requests_or_captures(self):
        for config in ({}, {"NUVEMSHOP_STORE_ID": "1/orders", "NUVEMSHOP_TOKEN": "x"},
                       {"NUVEMSHOP_STORE_ID": "0", "NUVEMSHOP_TOKEN": "x"},
                       {"NUVEMSHOP_STORE_ID": "1", "NUVEMSHOP_TOKEN": "x\ny"}):
            store = Store()
            with patch("marquesa_intelligence.nuvemshop.NuvemshopCollector._network") as network:
                with self.assertRaises(ValueError):
                    NuvemshopCollector(config, store).collect_products()
                network.assert_not_called()
            self.assertEqual(store.calls, [])

    def test_allowlist_rejects_mutations_orders_hosts_secrets_and_cap(self):
        collector = NuvemshopCollector(CONFIG, Store(), lambda *a, **kw: self.fail("network forbidden"))
        good = f"{BASE}/5134350/products?page=1&per_page=100"
        for method, url in (("POST", good), ("GET", good.replace("products", "orders")),
                            ("GET", good.replace("api.nuvemshop.com.br", "evil.example")),
                            ("GET", good + "&token=secret"), ("GET", good.replace("page=1&", "page=21&"))):
            with self.assertRaises(ValueError):
                collector._request(method, url)

    def test_pagination_raw_capture_before_normalization_exact_sku(self):
        store, calls = Store(), []
        def transport(method, url, body=None, headers=None):
            calls.append((method, url, headers))
            return [dict(PRODUCT, id=index) for index in range(100)] if "page=1&" in url else [PRODUCT]
        from marquesa_intelligence.nuvemshop import normalize_product
        def normalize_after_capture(product):
            self.assertGreater(len(store.calls), 0)
            self.assertEqual(store.calls[-1][0], "nuvemshop_products")
            return normalize_product(product)
        with patch("marquesa_intelligence.nuvemshop.normalize_product", side_effect=normalize_after_capture) as normalizer:
            result = NuvemshopCollector(CONFIG, store, transport).collect_products()
            self.assertEqual(normalizer.call_count, 101)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][2]["Authorization"], "Bearer mock-secret-credential")
        self.assertTrue(calls[0][2]["User-Agent"])
        self.assertEqual(result["products"][-1]["variants"][0]["sku"], "ab-N-001")
        self.assertEqual(result["products"][-1]["variants"][0]["variant_id"], "34")
        self.assertEqual(result["products"][-1]["variants"][0]["stock"], 0)
        self.assertEqual(store.calls[0][2][0]["variants"][0]["price"], "84.00")
        self.assertTrue(result["coverage"]["pagination_exhausted"])
        self.assertNotIn(CONFIG["NUVEMSHOP_TOKEN"], json.dumps(store.calls))
        self.assertNotIn("Authorization", json.dumps(store.calls))

    def test_cap_unknown_and_missing_stock_stays_unknown(self):
        product = dict(PRODUCT, variants=[{"id": 34, "sku": "001"}])
        result = NuvemshopCollector(CONFIG, Store(), lambda *a, **kw: [product] * 100).collect_products(max_pages=1)
        self.assertTrue(result["coverage"]["limit_reached"])
        self.assertFalse(result["coverage"]["pagination_exhausted"])
        self.assertEqual(result["coverage"]["duplicate_product_ids"], 99)
        self.assertIsNone(result["products"][0]["variants"][0]["stock"])
        for value in (0, 21, True, 1.5):
            with self.assertRaises(ValueError):
                NuvemshopCollector(CONFIG, Store()).collect_products(max_pages=value)

    def test_unknown_fields_never_persist_and_echoed_tokens_fail_closed(self):
        store = Store()
        product = dict(PRODUCT, name={"pt": "Anel", "customers": ["nested-private@example.invalid"], "access_token": "do-not-save"},
                       customers=[{"email": "private@example.invalid"}], access_token="do-not-save",
                       orders=[{"id": 1}])
        NuvemshopCollector(CONFIG, store, lambda *a, **kw: [product]).collect_products()
        saved = json.dumps(store.calls)
        for forbidden in ("customers", "private@example.invalid", "nested-private@example.invalid", "access_token", "do-not-save", "orders"):
            self.assertNotIn(forbidden, saved)
        store = Store()
        echoed = dict(PRODUCT, description={"pt": CONFIG["NUVEMSHOP_TOKEN"]})
        with self.assertRaises(NuvemshopAPIError):
            NuvemshopCollector(CONFIG, store, lambda *a, **kw: [echoed]).collect_products()
        self.assertNotIn(CONFIG["NUVEMSHOP_TOKEN"], json.dumps(store.calls))

    def test_error_preserves_status_only_never_body_or_transport_message(self):
        for response in ({"code": 403, "message": "mock-secret-credential"}, ["invalid"]):
            store = Store()
            with self.assertRaises(NuvemshopAPIError) as failure:
                NuvemshopCollector(CONFIG, store, lambda *a, **kw: response).collect_products()
            self.assertNotIn("mock-secret-credential", str(failure.exception))
            self.assertNotIn("mock-secret-credential", json.dumps(store.calls))
        store = Store()
        def denied(*a, **kw):
            raise NuvemshopAPIError(403)
        with self.assertRaises(NuvemshopAPIError) as failure:
            NuvemshopCollector(CONFIG, store, denied).collect_products()
        self.assertEqual(failure.exception.status, 403)
        self.assertEqual(store.calls[0][2], {"collector_error": {"http_status": 403}})

    def test_network_refuses_redirect_and_never_sends_body(self):
        class Response:
            status_code = 302
            text = "mock-secret-credential must not appear"
        collector = NuvemshopCollector(CONFIG, Store())
        session = MagicMock()
        with patch.dict("sys.modules", {"requests": SimpleNamespace(Session=session)}):
            session.return_value.request.return_value = Response()
            with self.assertRaises(NuvemshopAPIError):
                collector.collect_products()
            args, kwargs = session.return_value.request.call_args
            self.assertEqual(args[0], "GET")
            self.assertFalse(kwargs["allow_redirects"])
            self.assertNotIn("json", kwargs)
            self.assertNotIn("data", kwargs)


if __name__ == "__main__":
    unittest.main()
