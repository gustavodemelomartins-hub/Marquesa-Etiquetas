"""Deterministic, evidence-gated suggestions. Never publishes or invokes AI."""
from collections import Counter, defaultdict
from itertools import combinations

from .commerce import canonical_url, declared_period, eligible_items, eligible_orders, number, order_in_period, tables


DEFAULT_THRESHOLDS = {
    "high_sessions": 200, "low_sessions": 50, "minimum_conversion_sessions": 30,
    "good_conversion": .03, "low_conversion": .01, "high_stock": 10,
    "good_reference_margin": .40, "high_impressions": 500, "low_ctr": .01,
    "position_min": 4, "position_max": 15, "offer_min_stock": 3,
    "minimum_product_view_sessions": 30, "high_cart_sessions": 20,
    "high_checkout_sessions": 10, "low_cart_checkout_rate": .30,
    "low_checkout_purchase_rate": .20, "stalled_window_days": 28,
}


def _rate(numerator, denominator, gaps, label):
    n, d = number(numerator), number(denominator)
    if n is None or d is None:
        gaps.append(f"{label}: missing session/cohort evidence")
        return None
    if n < 0 or d <= 0 or n > d:
        gaps.append(f"{label}: invalid denominator or inconsistent counts")
        return None
    return n / d


def funnel_metrics(funnel):
    """Session counts must be supplied explicitly, never inferred from events.

    Ratios of session-stage counts are descriptive; without a closed cohort
    report they do not prove ordered user transitions or drop-off attribution.
    Orders/unit counts are not substituted for sessions with purchase.
    """
    gaps = []
    stage_keys = ("sessions", "view_item_sessions", "add_to_cart_sessions",
                  "begin_checkout_sessions", "purchase_sessions")
    stages = {key: number(funnel.get(key)) for key in stage_keys}
    rates = {
        "pdp_to_cart": _rate(stages["add_to_cart_sessions"], stages["view_item_sessions"], gaps, "pdp_to_cart"),
        "cart_to_checkout": _rate(stages["begin_checkout_sessions"], stages["add_to_cart_sessions"], gaps, "cart_to_checkout"),
        "checkout_to_order": _rate(stages["purchase_sessions"], stages["begin_checkout_sessions"], gaps, "checkout_to_order"),
        "conversion": _rate(stages["purchase_sessions"], stages["sessions"], gaps, "conversion"),
    }
    purchases, revenue, sessions = (number(funnel.get(key)) for key in ("purchases", "purchase_revenue", "sessions"))
    return {"stages": stages, "rates": rates, "event_counts": funnel.get("event_counts", {}),
            "rate_scope": "ratios_of_sessions_with_event; not ordered transitions unless closed cohort verified",
            "cohort_verified": funnel.get("cohort_verified") is True,
            "average_order_value": revenue / purchases if revenue is not None and revenue >= 0 and purchases is not None and purchases > 0 else None,
            "revenue_per_session": revenue / sessions if revenue is not None and revenue >= 0 and sessions is not None and sessions > 0 else None,
            "purchases_per_session": purchases / sessions if purchases is not None and purchases >= 0 and sessions is not None and sessions > 0 else None,
            "gaps": gaps}


def cohort_user_metrics(report):
    """Google closed-funnel active-user cohort, kept separate from sessions.

    The API may follow a user across sessions. These rates therefore measure
    ordered user progression, never session conversion or per-SKU conversion.
    """
    expected = ("session_start", "view_item", "add_to_cart", "begin_checkout", "purchase")
    users = {step: None for step in expected}
    gaps = list(report.get("gaps", []))
    valid_scope = report.get("closed_funnel") is True and report.get("grain") == "ordered_active_user_cohort"
    if not valid_scope:
        gaps.append("not a verified closed active-user funnel; rates unavailable")
    for row in report.get("rows", []):
        name = str(row.get("funnelStepName", ""))
        # Google prefixes e.g. '1. session_start'. Strip a numeric prefix only.
        prefix, separator, remaining = name.partition(". ")
        if separator and prefix.isdigit():
            name = remaining
        if name in users:
            count = number(row.get("activeUsers"))
            if users[name] is not None:
                gaps.append(f"duplicate funnel step: {name}; counts unavailable")
                users[name] = None
                valid_scope = False
            else:
                users[name] = count
    pairs = {"pdp_to_cart": ("add_to_cart", "view_item"),
             "cart_to_checkout": ("begin_checkout", "add_to_cart"),
             "checkout_to_order": ("purchase", "begin_checkout"),
             "cohort_completion": ("purchase", "session_start")}
    rates = {label: _rate(users[n], users[d], gaps, label) if valid_scope else None
             for label, (n, d) in pairs.items()}
    return {"scope": "ordered_active_user_cohort_across_sessions", "users_by_step": users,
            "rates": rates, "gaps": gaps, "metadata": report.get("metadata", {}),
            "limitations": ["Do not divide these user counts by sessions",
                            "Coarse cohorts do not prove causal impact; thresholds/sampling must be assessed",
                            "This cohort is not attributed to individual SKU/category"]}


def normalize_google_for_commerce(ga4=None, gsc=None, identity=None, traffic_scope="all_traffic", funnel_report=None):
    """Bridge collectors to commerce with exact URL and persisted variant IDs.

    GA4 itemId is Nuvemshop variant_id in the observed storefront. Names are
    ignored. Multi-SKU product URLs stay unallocated; item units stay units,
    and landing-page purchases are not product-specific conversions.
    """
    identity = identity or {}
    ga4, gsc = ga4 or {}, gsc or {}
    origin = identity.get("storefront_origin", "")
    gaps = []
    scopes = ga4.get("reports", {})
    reports = scopes.get(traffic_scope, {})
    overview = reports.get("overview", {}).get("rows", [])
    row = overview[0] if len(overview) == 1 else {}
    normalized_ga4 = {"traffic_scope": traffic_scope, "products": [], "landing_pages": [],
                      "meta": {"start_date": ga4.get("start_date"), "end_date": ga4.get("end_date"),
                               "timezone": ga4.get("timezone"), "property": ga4.get("property"),
                               "reports_coverage": {k: v.get("coverage", {}) for k, v in reports.items()}},
                      "funnel": {"sessions": number(row.get("sessions")),
                                 "purchases": number(row.get("ecommercePurchases")),
                                 "purchase_revenue": number(row.get("purchaseRevenue")),
                                 "event_counts": ga4.get("event_counts", {}).get(traffic_scope, {})}}
    item_totals = defaultdict(lambda: defaultdict(float))
    item_coverage = defaultdict(Counter)
    for item in reports.get("items", {}).get("rows", []):
        item_id = str(item.get("itemId", ""))
        sku = identity.get("by_ga4_item_id", {}).get(item_id)
        if not sku:
            gaps.append({"source": "ga4.items", "reason": "unmapped_exact_variant_id", "item_id": item_id})
            continue
        for source, dest in (("itemsViewed", "item_views"), ("itemsAddedToCart", "item_adds_to_cart"),
                             ("itemsCheckedOut", "item_checkouts"), ("itemsPurchased", "item_units_purchased"),
                             ("itemRevenue", "item_revenue")):
            n = number(item.get(source))
            if n is not None:
                item_totals[sku][dest] += n
                item_coverage[sku][dest] += 1
        item_coverage[sku]["rows"] += 1
    for sku, values in sorted(item_totals.items()):
        metrics = {key: value if item_coverage[sku][key] == item_coverage[sku]["rows"] else None
                   for key, value in values.items()}
        normalized_ga4["products"].append({"sku": sku, **metrics,
            "sessions": None, "purchase_sessions": None, "scope": "item_units_not_sessions_or_orders"})
    for landing in reports.get("landing_pages", {}).get("rows", []):
        url = canonical_url(landing.get("landingPage") or landing.get("landingPagePlusQueryString"), origin) if origin else None
        skus = identity.get("by_url", {}).get(url, [])
        normalized_ga4["landing_pages"].append({"url": url, "skus": skus,
            "sessions": number(landing.get("sessions")), "purchases": number(landing.get("ecommercePurchases")),
            "purchase_revenue": number(landing.get("purchaseRevenue")),
            "scope": "landing_page_attribution_not_product_conversion"})
    seo_by_sku = defaultdict(lambda: {"clicks": 0.0, "impressions": 0.0, "weighted_position": 0.0, "position_known": True})
    page_report = gsc.get("reports", {}).get("page", {})
    dims = page_report.get("dimensions", ["page"])
    page_index = dims.index("page") if "page" in dims else None
    for seo in page_report.get("rows", []):
        keys = seo.get("keys", [])
        url = canonical_url(keys[page_index], origin) if origin and page_index is not None and len(keys) > page_index else None
        skus = identity.get("by_url", {}).get(url, [])
        if len(skus) != 1:
            gaps.append({"source": "gsc.page", "reason": "shared_or_unmapped_product_url", "url": url})
            continue
        clicks, impressions, position = (number(seo.get(key)) for key in ("clicks", "impressions", "position"))
        if clicks is None or impressions is None or impressions < 0 or clicks < 0:
            gaps.append({"source": "gsc.page", "reason": "missing_or_invalid_metrics", "url": url})
            continue
        bucket = seo_by_sku[skus[0]]
        bucket["clicks"] += clicks
        bucket["impressions"] += impressions
        if position is None:
            bucket["position_known"] = False
        else:
            bucket["weighted_position"] += position * impressions
    normalized_gsc = {"meta": {"start_date": gsc.get("start_date"), "end_date": gsc.get("end_date"),
                               "timezone": gsc.get("timezone"), "property": gsc.get("property"),
                               "coverage": page_report.get("coverage", {})},
                      "products": [{"sku": sku, "clicks": v["clicks"], "impressions": v["impressions"],
        "ctr": v["clicks"] / v["impressions"] if v["impressions"] else None,
        "position": v["weighted_position"] / v["impressions"] if v["impressions"] and v["position_known"] else None,
        "scope": "page_report_aggregated_by_exact_sku"} for sku, v in sorted(seo_by_sku.items())]}
    return {"ga4": normalized_ga4, "gsc": normalized_gsc, "identity_gaps": gaps,
            "cohort_users": cohort_user_metrics(funnel_report) if funnel_report else None}


def analyze_opportunities(commerce, ga4=None, gsc=None, thresholds=None):
    """A-J hypotheses with explicit thresholds, missing-evidence coverage.

    Thresholds are configurable starting hypotheses, not business decisions.
    Results are suggestions requiring human approval before any action.
    """
    cfg = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    ga4, gsc = ga4 or {}, gsc or {}
    ga_products = {p["sku"]: p for p in ga4.get("products", []) if p.get("sku")}
    seo_products = {p["sku"]: p for p in gsc.get("products", []) if p.get("sku")}
    opportunities, coverage = [], {code: {"code": code, "evaluated": 0, "missing": Counter()} for code in "ABCDEFGHIJ"}
    titles = {
        "A": "High traffic and low sales", "B": "Low traffic and good session conversion",
        "C": "Good conversion and high available stock", "D": "Good reference margin, high stock and low organic exposure",
        "E": "High Google impressions and low CTR", "F": "Position 4-15 and commercially eligible offer",
        "G": "Product views without add-to-cart", "H": "Cart sessions with low checkout ratio",
        "I": "Checkout sessions with low purchase ratio", "J": "Available product without sales in a known observation window",
    }
    sales_period = commerce.get("sales", {}).get("orders_period", {})
    window = number(sales_period.get("days"))
    for product in commerce.get("products", []):
        sku = product["sku"]
        ga, seo = ga_products.get(sku, {}), seo_products.get(sku, {})
        sessions, purchase_sessions, views, carts, checkouts = (number(ga.get(k)) for k in
            ("sessions", "purchase_sessions", "view_item_sessions", "add_to_cart_sessions", "begin_checkout_sessions"))
        stock = number(product.get("available_stock"))
        margin = number(product.get("reference_margin_rate"))
        price = number(product.get("price"))
        impressions, clicks, position = (number(seo.get(k)) for k in ("impressions", "clicks", "position"))
        ratio_gaps = []
        conversion = _rate(purchase_sessions, sessions, ratio_gaps, "conversion")
        cart_checkout = _rate(checkouts, carts, ratio_gaps, "cart_checkout")
        checkout_purchase = _rate(purchase_sessions, checkouts, ratio_gaps, "checkout_purchase")
        ctr = clicks / impressions if clicks is not None and impressions is not None and impressions > 0 and 0 <= clicks <= impressions else None
        fields = {"sessions": sessions, "session_conversion": conversion, "available_stock": stock,
                  "reference_margin_rate": margin, "price": price, "impressions": impressions, "ctr": ctr,
                  "position": position, "view_item_sessions": views, "add_to_cart_sessions": carts,
                  "begin_checkout_sessions": checkouts, "cart_checkout_rate": cart_checkout,
                  "checkout_purchase_rate": checkout_purchase, "sold_units": product.get("sold_units"),
                  "sales_window_days": window, "status": product.get("status")}
        rules = {
            "A": (["sessions", "session_conversion"], lambda: sessions >= cfg["high_sessions"] and conversion < cfg["low_conversion"]),
            "B": (["sessions", "session_conversion"], lambda: cfg["minimum_conversion_sessions"] <= sessions <= cfg["low_sessions"] and conversion >= cfg["good_conversion"]),
            "C": (["sessions", "session_conversion", "available_stock"], lambda: sessions >= cfg["minimum_conversion_sessions"] and conversion >= cfg["good_conversion"] and stock >= cfg["high_stock"]),
            "D": (["reference_margin_rate", "available_stock", "impressions", "status", "price"], lambda: margin >= cfg["good_reference_margin"] and stock >= cfg["high_stock"] and impressions < cfg["high_impressions"] and product.get("eligible_for_campaign") is True),
            "E": (["impressions", "ctr"], lambda: impressions >= cfg["high_impressions"] and ctr < cfg["low_ctr"]),
            "F": (["position", "available_stock", "reference_margin_rate", "price", "status"], lambda: cfg["position_min"] <= position <= cfg["position_max"] and stock >= cfg["offer_min_stock"] and margin >= cfg["good_reference_margin"] and product.get("eligible_for_campaign") is True),
            "G": (["view_item_sessions", "add_to_cart_sessions"], lambda: views >= cfg["minimum_product_view_sessions"] and carts == 0),
            "H": (["add_to_cart_sessions", "cart_checkout_rate"], lambda: carts >= cfg["high_cart_sessions"] and cart_checkout < cfg["low_cart_checkout_rate"]),
            "I": (["begin_checkout_sessions", "checkout_purchase_rate"], lambda: checkouts >= cfg["high_checkout_sessions"] and checkout_purchase < cfg["low_checkout_purchase_rate"]),
            "J": (["sales_window_days", "sold_units", "available_stock", "price", "status"], lambda: window >= cfg["stalled_window_days"] and product["sold_units"] == 0 and stock >= cfg["offer_min_stock"] and product.get("eligible_for_campaign") is True),
        }
        for code, (required, condition) in rules.items():
            missing = [key for key in required if fields[key] is None]
            if missing:
                coverage[code]["missing"].update(missing)
                continue
            coverage[code]["evaluated"] += 1
            if condition():
                opportunities.append({"code": code, "sku": sku, "title": titles[code], "status": "suggestion",
                    "requires_human_approval": True, "evidence": {key: fields[key] for key in required},
                    "margin_scope": "current_reference_only; not realized historical margin" if code in {"D", "F"} else None,
                    "periods": {"ga4": ga4.get("meta", {}), "gsc": gsc.get("meta", {}),
                                "commerce_sales": sales_period, "commerce_snapshot_at": commerce.get("meta", {}).get("exported_at")},
                    "thresholds": cfg})
    ga_period, gsc_period = ga4.get("meta", {}), gsc.get("meta", {})
    def dates_match(left, right):
        return bool(left.get("start_date") and left.get("end_date") and
                    left.get("start_date") == right.get("start_date") and left.get("end_date") == right.get("end_date"))
    return {"opportunities": opportunities,
            "coverage": [{**v, "missing": dict(v["missing"])} for v in coverage.values()],
            "funnel": funnel_metrics(ga4.get("funnel", {})), "thresholds": cfg,
            "period_comparability": {"commerce_ga4_dates_match": dates_match(sales_period, ga_period),
                                      "ga4_gsc_dates_match": dates_match(ga_period, gsc_period),
                                      "cross_source_revenue_conversion_computed": False,
                                      "note": "No GA4 metric is divided by alltime commerce orders/revenue; matching dates alone does not prove matching attribution/timezones"},
            "limitations": ["Current stock and cost are snapshots, not historical exposure or realized margin",
                            "Session-stage ratios alone do not prove ordered user transitions",
                            "No recommendation modifies storefront, product, price or stock"]}


def basket_pairs(snapshot, origins=("site",), minimum_support_count=2):
    if not isinstance(minimum_support_count, int) or minimum_support_count < 1:
        raise ValueError("minimum_support_count must be a positive integer")
    period = declared_period(snapshot.get("meta", {}))
    orders = [o for o in eligible_orders(snapshot, origins=origins) if order_in_period(o, period)]
    items = eligible_items(snapshot, orders)
    baskets = defaultdict(set)
    for item in items:
        if item.get("sku"):
            baskets[str(item["venda_id"])].add(str(item["sku"]))
    counts, pairs = Counter(), Counter()
    for basket in baskets.values():
        counts.update(basket)
        pairs.update(combinations(sorted(basket), 2))
    n = len(baskets)
    result = []
    for (a, b), count in sorted(pairs.items(), key=lambda p: (-p[1], p[0])):
        if count < minimum_support_count:
            continue
        result.append({"sku_a": a, "sku_b": b, "count": count, "support": count / n,
                       "confidence_a_to_b": count / counts[a], "confidence_b_to_a": count / counts[b],
                       "lift": count * n / (counts[a] * counts[b]), "small_sample": n < 100 or count < 10,
                       "status": "hypothesis", "requires_human_approval": True})
    return {"basket_count": n, "eligible_orders": len(orders), "pairs": result,
            "minimum_support_count": minimum_support_count, "origins": list(origins),
            "sales_period": period or {"scope": "all_available"},
            "excluded_orders_without_eligible_lines": len(orders) - n,
            "limitations": ["Site commercial lines only by default; acerto/reseller/cancelled excluded",
                            "Basket is a real order, not movement, composition or historical date group",
                            "Co-occurrence is descriptive, not causal; no component revenue is added"]}
