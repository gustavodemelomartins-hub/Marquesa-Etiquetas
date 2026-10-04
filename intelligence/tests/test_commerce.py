"""Offline evidence for identity and commerce; fixtures are synthetic, without PII."""
import sqlite3
import unittest
from pathlib import Path

from marquesa_intelligence.commerce import build_identity_map, summarize_commerce
from marquesa_intelligence.analysis import analyze_opportunities, basket_pairs, funnel_metrics, normalize_google_for_commerce, cohort_user_metrics


ORIGIN = "https://example.test"


def snapshot():
    return {
        "produtos": [
            {"sku": "A", "desc": "Colar", "cat": "Colares", "preco": 100,
             "custo": 40, "qtd": 20, "produto_id_loja": "1", "status": "ativo",
             "url_loja": ORIGIN + "/produtos/colar/"},
            {"sku": "B", "desc": "Colar", "cat": "Colares", "preco": None,
             "qtd": 4, "produto_id_loja": "2", "status": "ativo"},
        ],
        "maletas": [{"id": 1, "status": "aberta"}, {"id": 2, "status": "encerrada"}],
        "maleta_itens": [{"maleta_id": 1, "sku": "A", "qtd": 5, "devolvida": 1},
                         {"maleta_id": 2, "sku": "A", "qtd": 10, "devolvida": 0}],
        "kit_componentes": [], "vendas": [], "venda_itens": [],
    }


class IdentityTests(unittest.TestCase):
    def test_tracking_and_trailing_slash_but_semantic_variants_preserved(self):
        s = snapshot()
        s["loja_variantes"] = [
            {"sku": "A", "produto_id": "1", "produto_url": ORIGIN + "/produtos/colar/?utm_source=x"},
            {"sku": "A", "produto_id": "1", "produto_url": ORIGIN + "/produtos/colar?variant=7"},
            {"sku": "A", "produto_id": "1", "produto_url": ORIGIN + "/produtos/colar?variant=8"},
        ]
        m = build_identity_map(s, ORIGIN)
        self.assertEqual(len(m["by_sku"]["A"]), 3)
        self.assertFalse(m["conflicts"])

    def test_never_match_same_name(self):
        s = snapshot()
        s["nuvemshop_products"] = [{"id": "999", "name": "Colar", "url": ORIGIN + "/unknown"}]
        m = build_identity_map(s, ORIGIN)
        self.assertNotIn(ORIGIN + "/unknown", m["by_url"])
        self.assertTrue(m["unmatched"])

    def test_external_id_exact_sku_contradiction_blocks(self):
        s = snapshot()
        s["loja_variantes"] = [{"sku": "A", "produto_id": "2", "produto_url": ORIGIN + "/other"}]
        m = build_identity_map(s, ORIGIN)
        self.assertTrue(m["conflicts"])
        self.assertNotIn(ORIGIN + "/other", m["by_url"])

    def test_shared_variant_product_url_is_not_arbitrary_attribution(self):
        s = snapshot()
        s["produtos"][1]["produto_id_loja"] = "1"
        s["nuvemshop_products"] = [{"id": "1", "url": ORIGIN + "/shared"}]
        m = build_identity_map(s, ORIGIN)
        self.assertEqual(m["by_url"][ORIGIN + "/shared"], ["A", "B"])
        self.assertIn(ORIGIN + "/shared", m["shared_urls"])

    def test_different_product_ids_claim_same_url_blocks_entire_url(self):
        s = snapshot()
        s["produtos"][1]["url_loja"] = s["produtos"][0]["url_loja"]
        m = build_identity_map(s, ORIGIN)
        self.assertNotIn(ORIGIN + "/produtos/colar", m["by_url"])
        self.assertTrue(m["conflicts"])

    def test_foreign_host_not_accepted(self):
        s = snapshot()
        s["produtos"][0]["url_loja"] = "https://evil.test/produtos/colar"
        self.assertFalse(build_identity_map(s, ORIGIN)["links"])

    def test_ga4_item_id_is_exact_variant_not_product_name_or_id(self):
        s = snapshot()
        s["storefront_products"] = [{"produto_id_loja": "1", "url": ORIGIN + "/produtos/colar",
                                     "variants": [{"variant_id": "777", "sku": "A"}]}]
        m = build_identity_map(s, ORIGIN)
        self.assertEqual(m["by_ga4_item_id"], {"777": "A"})
        self.assertNotIn("1", m["by_ga4_item_id"])

    def test_variant_claimed_by_two_skus_blocks_item_id(self):
        s = snapshot()
        s["loja_variantes"] = [{"variante_id": "777", "produto_id": "1", "sku": "A"},
                                {"variante_id": "777", "produto_id": "2", "sku": "B"}]
        m = build_identity_map(s, ORIGIN)
        self.assertNotIn("777", m["by_ga4_item_id"])
        self.assertIn("ambiguous_variant_id", {c["reason"] for c in m["conflicts"]})

    def test_variant_product_id_conflict_blocks_even_without_url(self):
        s = snapshot()
        s["loja_variantes"] = [{"variante_id": "777", "produto_id": "2", "sku": "A"}]
        m = build_identity_map(s, ORIGIN)
        self.assertNotIn("777", m["by_ga4_item_id"])
        self.assertTrue(m["conflicts"])


class CommerceTests(unittest.TestCase):
    def test_consignment_price_null_and_reference_margin(self):
        c = summarize_commerce(snapshot())
        a, b = c["products"]
        self.assertEqual(a["available_stock"], 16)
        self.assertEqual(a["reference_margin_rate"], .6)
        self.assertIsNone(a["historical_margin"])
        self.assertIsNone(b["price"])

    def test_missing_consignment_does_not_invent_available_stock(self):
        s = snapshot()
        del s["maletas"]
        self.assertIsNone(summarize_commerce(s)["products"][0]["available_stock"])

    def test_kit_uses_components_not_materialized_zero(self):
        s = snapshot()
        s["produtos"].append({"sku": "K", "qtd": 0, "preco": 150})
        s["kit_componentes"] = [{"kit_sku": "K", "componente_sku": "A", "qtd": 2}]
        kit = summarize_commerce(s)["products"][2]
        self.assertEqual(kit["available_stock"], 8)
        self.assertTrue(kit["is_kit"])

    def test_orders_and_received_are_distinct(self):
        s = snapshot()
        s["vendas"] = [{"id": 1, "origem": "site", "cancelada": 0, "total": 100,
                         "pago": 0, "valor_recebido": 30, "data": "2026-09-01"}]
        s["venda_itens"] = [{"venda_id": 1, "sku": "A", "qtd": 1, "preco": 100, "motivo": "venda"}]
        c = summarize_commerce(s)
        self.assertEqual(c["sales"]["order_value"], 100)
        self.assertEqual(c["sales"]["known_received"], 30)
        self.assertIsNone(c["products"][0]["historical_margin"])

    def test_stock_ledger_mismatch_blocks_commercial_eligibility(self):
        s = snapshot()
        s["movimentos_aggregate"] = [{"sku": "A", "saldo_movimentos": 19}]
        p = summarize_commerce(s)["products"][0]
        self.assertIsNone(p["available_stock"])
        self.assertFalse(p["eligible_for_campaign"])
        self.assertFalse(p["stock_ledger_matches"])

    def test_partial_payment_missing_amount_is_unknown_not_zero_receipt(self):
        s = snapshot()
        s["vendas"] = [{"id": 1, "origem": "site", "cancelada": 0, "total": 100,
                         "pago": 0, "pagamento_origem": "pagamento_parcial_indeterminado"}]
        self.assertEqual(summarize_commerce(s)["sales"]["unknown_payment_orders"], 1)

    def test_zero_reference_cost_does_not_invent_margin(self):
        s = snapshot()
        s["produtos"][0]["custo"] = 0
        self.assertIsNone(summarize_commerce(s)["products"][0]["reference_margin_rate"])

    def test_order_window_does_not_restrict_receipts_by_sale_date(self):
        s = snapshot()
        s["meta"] = {"sales_period": {"start_date": "2026-09-01", "end_date": "2026-09-30"},
                     "receipts_period": {"start_date": "2026-09-01", "end_date": "2026-09-30"}}
        s["vendas"] = [{"id": 1, "origem": "site", "cancelada": 0, "total": 100,
                         "pago": 1, "data": "2026-08-01", "data_pagamento": "2026-09-15"}]
        s["venda_itens"] = [{"venda_id": 1, "sku": "A", "qtd": 1, "preco": 100}]
        c = summarize_commerce(s)
        self.assertEqual(c["sales"]["orders"], 0)
        self.assertEqual(c["sales"]["known_received"], 100)
        self.assertEqual(c["products"][0]["sold_units"], 0)


class AnalyticsTests(unittest.TestCase):
    def test_missing_events_remain_null(self):
        f = funnel_metrics({"sessions": 100, "event_counts": {"view_item": 900}})
        self.assertIsNone(f["rates"]["pdp_to_cart"])
        self.assertIsNone(f["rates"]["conversion"])
        self.assertTrue(f["gaps"])

    def test_ratios_do_not_invent_session_counts_or_clamp_bad_data(self):
        f = funnel_metrics({"sessions": 100, "view_item_sessions": 40,
                            "add_to_cart_sessions": 50, "purchase_sessions": 120})
        self.assertIsNone(f["rates"]["pdp_to_cart"])
        self.assertIsNone(f["rates"]["conversion"])
        self.assertGreaterEqual(len(f["gaps"]), 2)

    def test_session_rates_and_ticket_have_correct_denominators(self):
        f = funnel_metrics({"sessions": 100, "view_item_sessions": 80, "add_to_cart_sessions": 20,
                            "begin_checkout_sessions": 10, "purchase_sessions": 5,
                            "purchases": 6, "purchase_revenue": 600})
        self.assertEqual(f["rates"]["pdp_to_cart"], .25)
        self.assertEqual(f["rates"]["conversion"], .05)
        self.assertEqual(f["average_order_value"], 100)
        self.assertEqual(f["revenue_per_session"], 6)

    def test_cohort_users_remain_separate_from_sessions(self):
        report = {"closed_funnel": True, "grain": "ordered_active_user_cohort", "rows": [
            {"funnelStepName": f"{i}. {step}", "activeUsers": count}
            for i, (step, count) in enumerate([( "session_start", 80), ("view_item", 40),
                        ("add_to_cart", 10), ("begin_checkout", 5), ("purchase", 2)], start=1)]}
        c = cohort_user_metrics(report)
        self.assertEqual(c["rates"]["pdp_to_cart"], .25)
        self.assertEqual(c["rates"]["cohort_completion"], .025)
        self.assertNotIn("sessions", c)

    def test_open_or_bad_cohort_never_gets_closed_funnel_rates(self):
        c = cohort_user_metrics({"closed_funnel": False, "rows": []})
        self.assertTrue(all(v is None for v in c["rates"].values()))

    def test_opportunities_require_evidence_and_are_suggestions(self):
        c = summarize_commerce(snapshot())
        self.assertEqual(analyze_opportunities(c)["opportunities"], [])
        a = analyze_opportunities(c, ga4={"products": [{"sku": "A", "sessions": 500,
                                   "view_item_sessions": 200, "purchase_sessions": 0,
                                   "add_to_cart_sessions": 0}]},
                                 gsc={"products": [{"sku": "A", "impressions": 1000,
                                                   "clicks": 5, "position": 8}]})
        self.assertTrue({"A", "E", "F", "G"}.issubset({o["code"] for o in a["opportunities"]}))
        self.assertTrue(all(o["status"] == "suggestion" for o in a["opportunities"]))
        self.assertEqual({o["code"] for o in a["coverage"]}, set("ABCDEFGHIJ"))

    def test_current_margin_not_historical_and_low_exposure_requires_known_impressions(self):
        c = summarize_commerce(snapshot())
        a = analyze_opportunities(c, gsc={"products": [{"sku": "A", "impressions": 10}]})
        d = next(o for o in a["opportunities"] if o["code"] == "D")
        self.assertIn("reference", d["margin_scope"])
        self.assertIsNone(c["products"][0]["historical_margin"])

    def test_alltime_commerce_not_compared_with_28_day_google_and_j_not_invented(self):
        s = snapshot()
        s["meta"] = {"sales_window_days": 28}  # This alone does not prove dates.
        c = summarize_commerce(s)
        a = analyze_opportunities(c, ga4={"meta": {"start_date": "2026-09-01", "end_date": "2026-09-28"}})
        self.assertFalse(a["period_comparability"]["commerce_ga4_dates_match"])
        self.assertFalse(a["period_comparability"]["cross_source_revenue_conversion_computed"])
        self.assertNotIn("J", {o["code"] for o in a["opportunities"]})

    def test_j_requires_dated_period_and_counts_only_recent_orders(self):
        s = snapshot()
        s["meta"] = {"sales_period": {"start_date": "2026-09-01", "end_date": "2026-09-30"}}
        s["vendas"] = [{"id": 1, "origem": "site", "cancelada": 0, "total": 100,
                         "data": "2026-08-01", "pago": 1}]
        s["venda_itens"] = [{"venda_id": 1, "sku": "A", "qtd": 1, "preco": 100}]
        a = analyze_opportunities(summarize_commerce(s))
        self.assertIn("J", {o["code"] for o in a["opportunities"]})
        self.assertEqual(basket_pairs(s)["basket_count"], 0)

    def test_google_adapter_keeps_units_events_and_landing_separate(self):
        s = snapshot()
        s["loja_variantes"] = [{"sku": "A", "produto_id": "1", "variante_id": "777"}]
        identity = build_identity_map(s, ORIGIN)
        ga4 = {"reports": {"all_traffic": {
            "overview": {"rows": [{"sessions": 100, "ecommercePurchases": 2, "purchaseRevenue": 200}]},
            "items": {"rows": [{"itemId": "777", "itemsViewed": 20, "itemsPurchased": 3, "itemRevenue": 200}]},
            "landing_pages": {"rows": [{"landingPagePlusQueryString": "/produtos/colar", "sessions": 50,
                                        "ecommercePurchases": 2, "purchaseRevenue": 200}]}}},
            "event_counts": {"all_traffic": {"view_item": 30}}}
        gsc = {"reports": {"page": {"dimensions": ["page"], "rows": [
            {"keys": [ORIGIN + "/produtos/colar/"], "clicks": 2, "impressions": 20, "position": 5}]}}}
        normalized = normalize_google_for_commerce(ga4, gsc, identity)
        product = normalized["ga4"]["products"][0]
        self.assertEqual(product["item_units_purchased"], 3)
        self.assertIsNone(product["sessions"])
        self.assertIsNone(product["purchase_sessions"])
        self.assertEqual(normalized["gsc"]["products"][0]["ctr"], .1)
        f = funnel_metrics(normalized["ga4"]["funnel"])
        self.assertEqual(f["average_order_value"], 100)
        self.assertIsNone(f["rates"]["conversion"])

    def test_google_adapter_shared_urls_stay_unallocated(self):
        s = snapshot()
        s["produtos"][1]["produto_id_loja"] = "1"
        s["produtos"][1]["url_loja"] = s["produtos"][0]["url_loja"]
        identity = build_identity_map(s, ORIGIN)
        gsc = {"reports": {"page": {"rows": [{"keys": [ORIGIN + "/produtos/colar"],
                                               "clicks": 1, "impressions": 10, "position": 5}]}}}
        normalized = normalize_google_for_commerce(None, gsc, identity)
        self.assertFalse(normalized["gsc"]["products"])
        self.assertTrue(normalized["identity_gaps"])

    def test_cross_sell_is_true_site_basket_no_acerto_cancelled_or_components(self):
        s = snapshot()
        s["vendas"] = [{"id": i, "origem": "site", "cancelada": 0} for i in (1, 2, 3)]
        s["vendas"] += [{"id": 4, "origem": "acerto", "cancelada": 0},
                        {"id": 5, "origem": "site", "cancelada": 1}]
        s["venda_itens"] = [{"venda_id": i, "sku": sku, "qtd": 1, "motivo": "venda"}
                            for i, skus in [(1, ["A", "B"]), (2, ["A", "B"]), (3, ["A"]),
                                            (4, ["A", "B"]), (5, ["A", "B"])] for sku in skus]
        s["venda_personalizacao_itens"] = [{"venda_id": 1, "sku": "COMPONENT", "qtd": 3}]
        r = basket_pairs(s)
        self.assertEqual(r["basket_count"], 3)
        pair = r["pairs"][0]
        self.assertEqual(pair["count"], 2)
        self.assertAlmostEqual(pair["confidence_a_to_b"], 2 / 3)
        self.assertEqual(pair["confidence_b_to_a"], 1)
        self.assertEqual(pair["lift"], 1)
        self.assertTrue(pair["small_sample"])

    def test_refunded_and_abandoned_orders_not_cross_sell_baskets(self):
        s = snapshot()
        s["vendas"] = [{"id": i, "origem": "site", "cancelada": 0, "pagamento_origem": origin}
                       for i, origin in [(1, "nuvemshop_reembolsado"), (2, "nuvemshop_abandonado")]]
        s["venda_itens"] = [{"venda_id": i, "sku": sku, "qtd": 1, "motivo": "venda"}
                            for i in [1, 2] for sku in ["A", "B"]]
        self.assertEqual(basket_pairs(s)["basket_count"], 0)

    def test_readonly_export_matches_local_schema_without_pii(self):
        root = Path(__file__).resolve().parents[2]
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript((root / "api/schema.sql").read_text(encoding="utf-8"))
        sql = (root / "intelligence/commerce-readonly.sql").read_text(encoding="utf-8")
        for part in sql.split(";"):
            if part.strip():
                cursor = db.execute(part)
                fields = [column[0] for column in cursor.description]
                self.assertFalse({"cliente_id", "cliente_nome", "cliente_nome_norm", "observacao", "obs", "rev_id"} & set(fields))


if __name__ == "__main__":
    unittest.main()
