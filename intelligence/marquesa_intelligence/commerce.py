"""Read-only normalizations of safe commerce exports. No database/network access.

Snapshots use table names as top-level keys (or a ``tables`` object). Missing
tables are unknown, not empty. ``meta`` should describe export time, period,
environment, filters and table completeness; these snapshots do not replace D1.
"""
from collections import defaultdict
from collections import Counter
from math import floor, isfinite
from datetime import date
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit


TRACKING_KEYS = {"gclid", "dclid", "fbclid", "msclkid", "gbraid", "wbraid", "_ga", "_gl"}


def tables(snapshot):
    return snapshot.get("tables", snapshot)


def number(value):
    """Missing/nonfinite values stay unknown; zero remains a real value."""
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _id(value):
    return str(value).strip() if value is not None and str(value).strip() else None


def declared_period(meta, kind="sales"):
    """A day count alone does not prove which dates were actually exported."""
    period = meta.get(kind + "_period", {})
    start = period.get("start_date") or meta.get(kind + "_start_date")
    end = period.get("end_date") or meta.get(kind + "_end_date")
    if not start or not end:
        return None
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {kind} period; require ISO start_date/end_date") from None
    if first > last:
        raise ValueError(f"Invalid {kind} period: start after end")
    return {"start_date": start, "end_date": end, "days": (last - first).days + 1}


def order_in_period(order, period, field="data"):
    if not period:
        return True
    day = str(order.get(field) or "")[:10]
    try:
        date.fromisoformat(day)
    except ValueError:
        return False
    return period["start_date"] <= day <= period["end_date"]


def canonical_url(value, storefront_origin):
    """Normalize tracking/trailing slash, preserve semantic variants and case.

    Only the configured origin is trusted. No www alias, path-name matching,
    variant removal, HTTP->HTTPS migration or percent-decoding is guessed.
    """
    if not isinstance(value, str) or not value.strip():
        return None
    origin = urlsplit(storefront_origin)
    try:
        parsed = urlsplit(urljoin(storefront_origin.rstrip("/") + "/", value.strip()))
        if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password:
            return None
        if (parsed.scheme.lower(), parsed.netloc.lower()) != (origin.scheme.lower(), origin.netloc.lower()):
            return None
        query = []
        for key, val in parse_qsl(parsed.query, keep_blank_values=True):
            low = key.lower()
            if any(secret in low for secret in ("password", "token", "secret", "api_key", "email")):
                return None
            if low.startswith("utm_") or low in TRACKING_KEYS:
                continue
            query.append((key, val))
        path = parsed.path.rstrip("/") or "/"
        return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), path,
                           urlencode(sorted(query)), ""))
    except ValueError:
        return None


def build_identity_map(snapshot, storefront_origin):
    """Link exact operational SKU, explicit external ID and public URL.

    Shared product URLs may map to multiple exact SKUs. This is a relationship,
    not permission to allocate URL metrics across variants. Contradictions
    block the affected URL instead of choosing a winner or matching names.
    """
    data = tables(snapshot)
    products = data.get("produtos", [])
    by_sku_product = {}
    product_ids = defaultdict(set)
    conflicts, unmatched, candidates = [], [], []
    duplicate_skus = set()
    variant_claims = defaultdict(set)
    for product in products:
        sku = _id(product.get("sku"))
        if not sku:
            continue
        if sku in by_sku_product and product != by_sku_product[sku]:
            duplicate_skus.add(sku)
            conflicts.append({"reason": "duplicate_operational_sku", "sku": sku})
        by_sku_product[sku] = product
        pid = _id(product.get("produto_id_loja"))
        if pid:
            product_ids[pid].add(sku)

    def add(sku, pid, raw_url, source):
        url = canonical_url(raw_url, storefront_origin)
        if not url:
            if raw_url:
                unmatched.append({"source": source, "reason": "invalid_or_foreign_url", "sku": sku})
            return
        if sku not in by_sku_product:
            unmatched.append({"source": source, "reason": "unknown_exact_sku", "url": url})
            return
        declared = _id(by_sku_product[sku].get("produto_id_loja"))
        if sku in duplicate_skus or (declared and pid and declared != pid):
            conflicts.append({"reason": "sku_product_id_contradiction", "sku": sku,
                              "url": url, "declared_id": declared, "observed_id": pid})
            candidates.append({"sku": sku, "url": url, "produto_id_loja": pid,
                               "source": source, "blocked": True})
            return
        candidates.append({"sku": sku, "url": url, "produto_id_loja": pid or declared,
                           "source": source, "blocked": False})

    def add_variant(sku, pid, variant_id):
        if not variant_id or sku not in by_sku_product:
            return
        declared = _id(by_sku_product[sku].get("produto_id_loja"))
        if declared and pid and declared != pid:
            conflicts.append({"reason": "sku_product_id_contradiction", "sku": sku,
                              "declared_id": declared, "observed_id": pid, "variant_id": variant_id})
            return
        variant_claims[variant_id].add(sku)

    for sku, product in by_sku_product.items():
        add(sku, _id(product.get("produto_id_loja")), product.get("url_loja"), "produtos.url_loja")

    for variant in data.get("loja_variantes", []):
        pid = _id(variant.get("produto_id"))
        sku = _id(variant.get("sku"))
        # sku_norm is a preexisting, explicitly persisted normalization, not a
        # license to fuzzy-match names or merge suffixes in this adapter.
        if sku not in by_sku_product:
            sku = _id(variant.get("sku_norm"))
        url = variant.get("produto_url")
        if sku in by_sku_product:
            add(sku, pid, url, "loja_variantes.exact_sku")
            if variant.get("variante_id") is not None:
                add_variant(sku, pid, str(variant["variante_id"]))
        elif pid in product_ids:
            for linked in sorted(product_ids[pid]):
                add(linked, pid, url, "loja_variantes.product_id")
        elif url:
            unmatched.append({"source": "loja_variantes", "reason": "no_safe_identity",
                              "produto_id_loja": pid})

    for external in data.get("nuvemshop_products", []) + data.get("storefront_products", []):
        pid = _id(external.get("id") or external.get("produto_id_loja"))
        url = external.get("canonical_url") or external.get("permalink") or external.get("url")
        if isinstance(url, dict):
            url = url.get("pt")
        exact_skus = {_id(v.get("sku")) for v in external.get("variants", [])} | {_id(external.get("sku"))}
        matched = {s for s in exact_skus if s in by_sku_product} | product_ids.get(pid, set())
        if not matched:
            unmatched.append({"source": "nuvemshop_products", "reason": "no_safe_identity",
                              "produto_id_loja": pid})
        for sku in sorted(matched):
            add(sku, pid, url, "nuvemshop_products.product_id_or_exact_sku")
        for variant in external.get("variants", []):
            vid = _id(variant.get("variant_id") or variant.get("id"))
            sku = _id(variant.get("sku"))
            if vid and sku in by_sku_product:
                add_variant(sku, pid, vid)

    url_candidates = defaultdict(list)
    for candidate in candidates:
        url_candidates[candidate["url"]].append(candidate)
    links, by_url, by_sku, shared_urls = [], {}, defaultdict(list), []
    for url, claims in sorted(url_candidates.items()):
        ids = {c["produto_id_loja"] for c in claims if c["produto_id_loja"]}
        skus = {c["sku"] for c in claims}
        if any(c["blocked"] for c in claims) or len(ids) > 1 or (len(skus) > 1 and any(not c["produto_id_loja"] for c in claims)):
            conflicts.append({"reason": "ambiguous_url_claims", "url": url,
                              "skus": sorted(skus), "produto_ids_loja": sorted(ids)})
            continue
        by_url[url] = sorted(skus)
        if len(skus) > 1:
            shared_urls.append(url)
        for sku in sorted(skus):
            selected = [c for c in claims if c["sku"] == sku]
            links.append({"url": url, "sku": sku, "produto_id_loja": selected[0]["produto_id_loja"],
                          "sources": sorted({c["source"] for c in selected}),
                          "url_metrics_attributable_to_single_sku": len(skus) == 1})
            by_sku[sku].append(url)
    by_ga4_item_id = {}
    for variant_id, skus in sorted(variant_claims.items()):
        if len(skus) != 1 or any(s in duplicate_skus for s in skus):
            conflicts.append({"reason": "ambiguous_variant_id", "variant_id": variant_id, "skus": sorted(skus)})
            continue
        sku = next(iter(skus))
        if any(c.get("sku") == sku and c["reason"] == "sku_product_id_contradiction" for c in conflicts):
            continue
        by_ga4_item_id[variant_id] = sku
    return {"links": links, "by_sku": dict(by_sku), "by_url": by_url, "by_ga4_item_id": by_ga4_item_id,
            "shared_urls": shared_urls, "conflicts": conflicts, "unmatched": unmatched,
            "storefront_origin": storefront_origin,
            "coverage": {"products": len(by_sku_product), "linked_skus": len(by_sku),
                         "links": len(links), "blocked_urls": len(url_candidates) - len(by_url)}}


def eligible_orders(snapshot, origins=("site",)):
    """Operational site purchases only; never aggregate acerto as one basket."""
    data = tables(snapshot)
    historical_duplicates = {str(r.get("venda_id")) for r in data.get("historico_operacao_vendas", [])
                             if r.get("status_registro") == "ativa"}
    result, seen = [], set()
    for order in data.get("vendas", []):
        oid = _id(order.get("id"))
        if (not oid or oid in seen or str(order.get("origem")) not in origins
                or order.get("revendedora_id") is not None or order.get("has_reseller") in (1, True)
                or order.get("cancelada") not in (0, False)
                or order.get("estornada") in (1, True) or order.get("duplicada_historico") in (1, True)
                or order.get("pagamento_origem") in {"nuvemshop_reembolsado", "nuvemshop_anulado", "nuvemshop_abandonado", "nuvemshop_cancelado"}
                or oid in historical_duplicates):
            continue
        seen.add(oid)
        result.append(order)
    return result


def eligible_items(snapshot, orders):
    ids = {str(o["id"]) for o in orders}
    # These are the commercial lines only. Composition/component consumption
    # in movimentos/venda_personalizacao_itens is not another sold item.
    return [item for item in tables(snapshot).get("venda_itens", [])
            if str(item.get("venda_id")) in ids and item.get("motivo") in (None, "venda", "vendida")
            and number(item.get("qtd")) is not None and number(item["qtd"]) > 0]


def summarize_commerce(snapshot):
    data = tables(snapshot)
    meta = snapshot.get("meta", {})
    sales_period = declared_period(meta)
    receipts_period = declared_period(meta, "receipts")
    gaps = list(snapshot.get("gaps", []))
    if not sales_period:
        gaps.append("sales are all available orders, not a dated GA4/GSC baseline")
    consignment_known = "maletas" in data and "maleta_itens" in data
    kit_known = "kit_componentes" in data
    if not consignment_known:
        gaps.append("maletas/maleta_itens missing: available stock unknown")
    if not kit_known:
        gaps.append("kit_componentes missing: kit status/availability unknown")
    ledger = {str(m.get("sku")): number(m.get("saldo_movimentos")) for m in data.get("movimentos_aggregate", [])}
    if not ledger:
        gaps.append("stock ledger not verified by this snapshot; operational qtd is a materialized balance")
    open_cases = {str(m.get("id")) for m in data.get("maletas", []) if m.get("status") in {"aberta", "em_acerto"}}
    consigned = defaultdict(float)
    for item in data.get("maleta_itens", []):
        if str(item.get("maleta_id")) in open_cases:
            qty, returned = number(item.get("qtd")), number(item.get("devolvida"))
            if qty is None or returned is None or qty < 0 or returned < 0 or returned > qty:
                consignment_known = False
                gaps.append("invalid consignment quantities: available stock unknown")
            else:
                consigned[str(item.get("sku"))] += qty - returned
    kit_components = defaultdict(list)
    for item in data.get("kit_componentes", []):
        kit_components[str(item.get("kit_sku"))].append(item)
    all_orders = eligible_orders(snapshot)
    orders = [o for o in all_orders if order_in_period(o, sales_period)]
    items = eligible_items(snapshot, orders)
    items_by_sku = defaultdict(list)
    order_by_id = {str(o["id"]): o for o in orders}
    for item in items:
        items_by_sku[str(item.get("sku"))].append(item)
    counts = Counter(str(p.get("sku")) for p in data.get("produtos", []))
    duplicate_skus = {sku for sku, count in counts.items() if count > 1}
    if duplicate_skus:
        gaps.append("duplicate operational SKU rows: stock/campaign eligibility blocked")
    by_sku = {}
    for product in data.get("produtos", []):
        sku = _id(product.get("sku"))
        if not sku:
            continue
        price, cost, total = number(product.get("preco")), number(product.get("custo")), number(product.get("qtd"))
        available = total - consigned[sku] if total is not None and consignment_known and kit_known else None
        ledger_total = ledger.get(sku)
        ledger_matches = ledger_total == total if ledger_total is not None and total is not None else None
        if ledger_matches is False or sku in duplicate_skus:
            available = None
            gaps.append(f"{sku}: stock ledger mismatch or duplicate identity")
        product_items = items_by_sku[sku]
        quantities_known = "vendas" in data and "venda_itens" in data
        values = [number(i.get("qtd")) * number(i.get("preco")) for i in product_items if number(i.get("preco")) is not None]
        sale_dates = [order_by_id[str(i["venda_id"])]["data"] for i in product_items if order_by_id[str(i["venda_id"])].get("data")]
        by_sku[sku] = {
            "sku": sku, "category": product.get("cat"), "status": product.get("status"),
            "produto_id_loja": _id(product.get("produto_id_loja")), "price": price,
            "reference_cost": cost, "reference_margin_rate": (price - cost) / price if price and price > 0 and cost is not None and cost > 0 else None,
            "historical_margin": None, "total_stock": total,
            "consigned_stock": consigned[sku] if consignment_known else None,
            "available_stock": available, "is_kit": bool(kit_components[sku]) if kit_known else None,
            "stock_ledger_matches": ledger_matches,
            "eligible_for_campaign": product.get("status") == "ativo" and price is not None and price > 0 and available is not None and available > 0,
            "sold_units": sum(number(i["qtd"]) for i in product_items) if quantities_known else None,
            "order_value": round(sum(values), 2) if quantities_known and len(values) == len(product_items) else None,
            "last_sale_date": max(sale_dates) if sale_dates else None,
        }

    def kit_available(sku, chain=()):
        if sku not in by_sku or sku in chain or sku in duplicate_skus or by_sku[sku]["stock_ledger_matches"] is False:
            return None
        if not kit_components[sku]:
            return by_sku[sku]["available_stock"]
        amounts = []
        for component in kit_components[sku]:
            quantity = number(component.get("qtd"))
            available = kit_available(str(component.get("componente_sku")), chain + (sku,))
            if quantity is None or quantity <= 0 or available is None:
                return None
            amounts.append(floor(available / quantity))
        return min(amounts) if amounts else None

    for sku in kit_components:
        if sku in by_sku and kit_components[sku]:
            p = by_sku[sku]
            p["available_stock"] = kit_available(sku)
            p["eligible_for_campaign"] = bool(p["status"] == "ativo" and p["price"] and p["price"] > 0 and p["available_stock"] is not None and p["available_stock"] > 0)
    received, unknown_received = 0.0, 0
    received_missing_date = 0
    for order in all_orders:
        if not order_in_period(order, receipts_period, field="data_pagamento"):
            if not order.get("data_pagamento"):
                received_missing_date += 1
            continue
        total, partial = number(order.get("total")), number(order.get("valor_recebido"))
        if order.get("pago") in (1, True) and total is not None and total >= 0:
            received += total
        elif partial is not None and total is not None and 0 <= partial <= total:
            received += partial
        elif partial is None and order.get("pago") in (0, False) and order.get("pagamento_origem") not in {"indeterminado_site", "pagamento_parcial_indeterminado"}:
            pass
        else:
            unknown_received += 1
    order_values = [number(o.get("total")) for o in orders]
    sales_known = "vendas" in data
    return {"products": list(by_sku.values()), "sales": {
        "scope": "operational_site_orders_only", "orders": len(orders) if sales_known else None,
        "order_value": round(sum(order_values), 2) if sales_known and all(v is not None for v in order_values) else None,
        "known_received": round(received, 2) if sales_known else None,
        "unknown_payment_orders": unknown_received if sales_known else None,
        "receipts_missing_date_excluded": received_missing_date if sales_known else None,
        "orders_period": sales_period or {"scope": "all_available"},
        "receipts_period": receipts_period or {"scope": "all_available"},
        "date_basis": "orders=data; receipts=data_pagamento; export period must declare both",
        "historical_margin": None,
    }, "meta": meta, "gaps": gaps,
        "coverage": {"products": len(by_sku), "stock_known": sum(p["available_stock"] is not None for p in by_sku.values()),
                     "ledger_checked": bool(ledger), "ledger_matched_products": sum(p["stock_ledger_matches"] is True for p in by_sku.values()),
                     "historical_margin_known": 0}}
