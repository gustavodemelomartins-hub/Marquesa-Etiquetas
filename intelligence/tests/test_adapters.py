import json
import unittest

from marquesa_intelligence.cloudflare import is_readonly_sql, sql_for_cli
from marquesa_intelligence.storefront import inspect_html, inspect_sitemap, collect_storefront
from marquesa_intelligence.storage import SnapshotStore
import tempfile


class AdapterTests(unittest.TestCase):
    def test_storefront_rejects_basic_auth_and_nonstandard_port(self):
        with tempfile.TemporaryDirectory() as d:
            for url in ('https://user:secret@marquesasemijoias.com.br/produtos/x/', 'https://marquesasemijoias.com.br:444/produtos/x/'):
                with self.assertRaises(ValueError):
                    collect_storefront('https://marquesasemijoias.com.br', SnapshotStore(d), [url], transport=lambda u: (200, ''))
    def test_sql_windows_transport_preserves_literals_removes_comments(self):
        sql = "-- registry\nSELECT 'two  spaces -- literal', \"desc\"\nFROM produtos; /* end */\nSELECT 1;"
        transport = sql_for_cli(sql)
        self.assertNotIn('\n', transport)
        self.assertIn("'two  spaces -- literal'", transport)
        self.assertNotIn('registry', transport)
        self.assertTrue(is_readonly_sql(transport))
    def test_sql_gate_denies_mutations_and_hidden_second_statement(self):
        for sql in ['DELETE FROM produtos', 'SELECT 1; UPDATE produtos SET qtd=0', 'PRAGMA writable_schema=1', 'SELECT 1; ATTACH DATABASE x AS y']:
            self.assertFalse(is_readonly_sql(sql))
        self.assertTrue(is_readonly_sql('-- metadata\nSELECT name FROM sqlite_master;'))
        self.assertTrue(is_readonly_sql('SELECT sku, SUM(qtd) FROM movimentos GROUP BY sku;'))

    def test_pdp_variant_id_is_not_product_or_sku(self):
        html = '''<link rel="canonical" href="https://shop.example/produtos/peca/">
        <script>LS.id=12; LS.variants = [{"product_id":34,"id":56,"sku":"AB1","stock":2,"price_number":89}];
        var ga4_measurement_id = "G-ABC123"; gtagTN('event','view_item',{});</script>'''
        result = inspect_html(html, 'https://shop.example/produtos/peca/')
        self.assertEqual(result['storefront_product']['produto_id_loja'], '34')
        self.assertEqual(result['storefront_product']['variants'][0]['variant_id'], '56')
        self.assertEqual(result['storefront_product']['variants'][0]['sku'], 'AB1')
        self.assertIn('view_item', result['declared_events'])
        self.assertFalse(result['events_received_verified'])
        self.assertEqual(result['ga4_measurement_ids'], ['G-ABC123'])

    def test_multiple_product_ids_block_identity(self):
        html = '<script>LS.variants=[{"id":1,"product_id":2,"sku":"X"},{"id":3,"product_id":4,"sku":"Y"}];</script>'
        result = inspect_html(html, 'https://shop.example/produtos/x/')
        self.assertIsNone(result['storefront_product']['produto_id_loja'])
        self.assertIn('multiple_product_ids', result['gaps'])

    def test_sitemap_counts_do_not_claim_all_products(self):
        body = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://shop.example/produtos/x/</loc><lastmod>2026-10-02</lastmod></url></urlset>'
        result = inspect_sitemap(body)
        self.assertEqual(result['pdp_urls'], 1)
        self.assertEqual(result['urls'][0], 'https://shop.example/produtos/x/')
        self.assertFalse(result['internal_catalogue_verified'])

    def test_catalogue_index_is_not_a_pdp_and_store_object_is_parsed(self):
        body = '<urlset><url><loc>https://shop.example/produtos/</loc></url><url><loc>https://shop.example/produtos/a/</loc></url></urlset>'
        self.assertEqual(inspect_sitemap(body)['pdp_urls'], 1)
        html = '<script>LS.store={id : 123, has_google_analytics_track_product_ids : false};</script>'
        parsed = inspect_html(html, 'https://shop.example/')
        self.assertEqual(parsed['store_id'], '123')
        self.assertFalse(parsed['ga4_track_product_ids_setting'])


if __name__ == '__main__':
    unittest.main()
