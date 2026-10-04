"""Read-only Nuvemshop product snapshots; never orders, customers or mutations.

The immutable raw is an explicit product-field projection, captured before
normalization. Unexpected response fields and authentication headers are not
retained. Reference: https://tiendanube.github.io/api-documentation/v1/intro
"""
from __future__ import annotations

import json
import math
import re
from urllib.parse import urlencode

BASE = "https://api.nuvemshop.com.br/v1"
USER_AGENT = "Marquesa Intelligence (https://marquesasemijoias.com.br/)"
PRODUCT_FIELDS = ("id", "name", "description", "canonical_url", "permalink", "published", "created_at", "updated_at")
VARIANT_FIELDS = ("id", "product_id", "sku", "price", "promotional_price", "stock", "stock_management", "values")
CATEGORY_FIELDS = ("id", "name", "parent", "handle")


class NuvemshopAPIError(RuntimeError):
    """Status-only error; a server/transport message can echo credentials."""

    def __init__(self, status=None):
        self.status = status if isinstance(status, int) and not isinstance(status, bool) else None
        super().__init__(f"Nuvemshop product read failed (HTTP {self.status or 'unavailable'}); inspect configuration, permissions or quota.")


def _number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (ValueError, TypeError):
        return None


def _id(value):
    return str(value) if value is not None else None


def _localized(value):
    # No language guessing; pt is the Marquesa storefront language.
    return value.get("pt") if isinstance(value, dict) else value


def _project(product):
    if not isinstance(product, dict):
        raise NuvemshopAPIError()
    def value(key, item):
        if key in ("name", "description", "canonical_url", "permalink", "handle"):
            if isinstance(item, dict):
                return {language: text for language, text in item.items()
                        if re.fullmatch(r"[a-z]{2}(?:[-_][A-Za-z]{2})?", str(language)) and isinstance(text, str)}
            if item is None or isinstance(item, str):
                return item
        elif key == "values" and isinstance(item, list):
            return [value("name", entry) for entry in item]
        elif item is None or isinstance(item, (str, int, float, bool)):
            return item
        raise NuvemshopAPIError()
    projected = {key: value(key, product[key]) for key in PRODUCT_FIELDS if key in product}
    for field, keys in (("variants", VARIANT_FIELDS), ("categories", CATEGORY_FIELDS)):
        entries = product.get(field, [])
        if not isinstance(entries, list) or any(not isinstance(entry, dict) for entry in entries):
            raise NuvemshopAPIError()
        projected[field] = [{key: value(key, entry[key]) for key in keys if key in entry} for entry in entries]
    return projected


def normalize_product(product):
    """Exact SKU and external identifiers; stock is the external observation."""
    return {
        "id": _id(product.get("id")), "produto_id_loja": _id(product.get("id")),
        "name": _localized(product.get("name")),
        "canonical_url": _localized(product.get("canonical_url") or product.get("permalink")),
        "published": product.get("published"), "updated_at": product.get("updated_at"),
        "categories": [{"id": _id(category.get("id")), "name": _localized(category.get("name"))}
                       for category in product.get("categories", [])],
        "variants": [{"id": _id(variant.get("id")), "variant_id": _id(variant.get("id")),
                      "product_id": _id(variant.get("product_id") or product.get("id")),
                      "sku": variant.get("sku"), "price": _number(variant.get("price")),
                      "promotional_price": _number(variant.get("promotional_price")),
                      "stock": _number(variant.get("stock")),
                      "stock_management": variant.get("stock_management"),
                      "attributes": variant.get("values", [])}
                     for variant in product.get("variants", [])],
    }


class NuvemshopCollector:
    def __init__(self, config, store, transport=None):
        self.config, self.store, self.transport = config, store, transport
        self._session = None

    def _credentials(self):
        store = str(self.config.get("NUVEMSHOP_STORE_ID") or "").strip()
        token = str(self.config.get("NUVEMSHOP_TOKEN") or "").strip()
        if not re.fullmatch(r"[1-9][0-9]*", store) or not token or "\r" in token or "\n" in token:
            raise ValueError("Configure numeric NUVEMSHOP_STORE_ID and NUVEMSHOP_TOKEN externally before product collection")
        return store, token

    def _network(self, method, url, body=None, headers=None):
        import requests
        if self._session is None:
            self._session = requests.Session()
        response = self._session.request(method, url, headers=headers, timeout=(10, 60), allow_redirects=False)
        if not 200 <= response.status_code < 300:
            raise NuvemshopAPIError(response.status_code)
        return response.json()

    def _request(self, method, url):
        store, token = self._credentials()
        # No generic API path, arbitrary base, body, secret query or redirect.
        pattern = re.escape(f"{BASE}/{store}/products") + r"\?page=([1-9][0-9]*)&per_page=100"
        match = re.fullmatch(pattern, url)
        if method != "GET" or not match or int(match[1]) > 20:
            raise ValueError("Only capped read-only Nuvemshop product pagination is allowed")
        request = {"method": "GET", "url": url, "raw_projection": "product_catalog_fields_only"}
        try:
            payload = (self.transport or self._network)("GET", url, body=None,
                         headers={"Authorization": f"Bearer {token}", "User-Agent": USER_AGENT, "Accept": "application/json"})
            if not isinstance(payload, list) or len(payload) > 100:
                raise NuvemshopAPIError()
            raw = [_project(product) for product in payload]
            # Fail closed even if an upstream response echoes the actual token in
            # an otherwise allowed name/description. Never persist that response.
            if token in json.dumps(raw, ensure_ascii=False):
                raise NuvemshopAPIError()
        except Exception as error:
            status = error.status if isinstance(error, NuvemshopAPIError) else None
            self.store.capture("nuvemshop_products_error", request,
                               {"collector_error": {"http_status": status}})
            raise NuvemshopAPIError(status) from None
        snapshot = self.store.capture("nuvemshop_products", request, raw)
        return raw, snapshot

    def collect_products(self, *, max_pages=20):
        if isinstance(max_pages, bool) or not isinstance(max_pages, int) or not 1 <= max_pages <= 20:
            raise ValueError("max_pages must be an integer between 1 and 20")
        store, _ = self._credentials()
        products, snapshots, exhausted = [], [], False
        for page in range(1, max_pages + 1):
            url = f"{BASE}/{store}/products?" + urlencode({"page": page, "per_page": 100})
            raw, snapshot = self._request("GET", url)
            snapshots.append(snapshot)
            products.extend(normalize_product(product) for product in raw)
            if len(raw) < 100:
                exhausted = True
                break
        ids = [product["id"] for product in products if product["id"] is not None]
        return {
            "source": "nuvemshop_products", "store_id": store, "products": products, "snapshots": snapshots,
            "coverage": {"returned_products": len(products), "pages": len(snapshots), "page_size": 100,
                         "max_pages": max_pages, "pagination_exhausted": exhausted,
                         "limit_reached": not exhausted, "duplicate_product_ids": len(ids) - len(set(ids)),
                         "internal_catalogue_verified": False},
            "gaps": ["Pagination is a point-in-time external observation, not a transactionally consistent export; catalogue changes between pages can omit or duplicate products.",
                     "Full pages at the cap mean unknown remaining coverage, not a complete catalogue.",
                     "External stock, category and price do not replace the operational Marquesa ledger. Exact SKU/variant joins require reconciliation.",
                     "Snapshots retain an explicit product-field raw projection, excluding unexpected fields; no headers, customers or orders are retained."],
        }
