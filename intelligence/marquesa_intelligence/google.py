"""Read-only Google collectors owned by Marquesa; no Claude runner required.

Reference material: .agents/skills/seo-google/references/{search-console-api,
ga4-data-api,pagespeed-crux-api}.md. No upstream installer or Indexing API.
Every response is captured before normalization; headers are never persisted.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
import ipaddress
import math
import re
from pathlib import Path
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo
from .storage import digest


READ_ONLY_SCOPES = (
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
)
EXPECTED_EVENTS = ("view_item", "add_to_cart", "begin_checkout", "purchase")


class GoogleAPIError(RuntimeError):
    """Safe status-only error: no response body, credentials, or request headers."""

    def __init__(self, source, status=None):
        self.source, self.status = source, status
        super().__init__(f"Google collector {source} failed (HTTP {status or 'unavailable'}); inspect permissions, quota, and configuration.")


def date_window(days=28, end_date=None, *, lag_days=0, timezone_name="America/Los_Angeles"):
    if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= 365:
        raise ValueError("days must be an integer between 1 and 365")
    if end_date is None:
        end = datetime.now(ZoneInfo(timezone_name)).date() - timedelta(days=lag_days)
    else:
        end = date.fromisoformat(end_date) if isinstance(end_date, str) else end_date
        if not isinstance(end, date) or isinstance(end, datetime):
            raise ValueError("end_date must be an ISO date or datetime.date")
    return (end - timedelta(days=days - 1)).isoformat(), end.isoformat()


def event_ratios(counts):
    """Event-volume comparisons, not unique sessions, people, or ordered funnels."""
    result = {}
    for label, numerator, denominator in (
        ("pdp_to_cart_event_ratio", "add_to_cart", "view_item"),
        ("cart_to_checkout_event_ratio", "begin_checkout", "add_to_cart"),
        ("checkout_to_purchase_event_ratio", "purchase", "begin_checkout"),
    ):
        n, d = counts.get(numerator), counts.get(denominator)
        result[label] = n / d if n is not None and d is not None and d > 0 else None
    return result


def _public_url(value):
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query:
        raise ValueError("Use a public HTTPS URL without credentials or query parameters")
    if parsed.hostname.lower() in ("localhost", "localhost.localdomain"):
        raise ValueError("A public URL is required")
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError("A public URL is required")
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", "", ""))


def _redact_pagespeed_resource_urls(payload):
    """Remove credential query parameters before the shared snapshot safety gate."""
    removed = 0
    def visit(value):
        nonlocal removed
        if isinstance(value, dict):
            return {key: visit(child) for key, child in value.items()}
        if isinstance(value, list):
            return [visit(child) for child in value]
        if isinstance(value, str) and value.startswith(('https://', 'http://')):
            parsed = urlsplit(value)
            params = parse_qsl(parsed.query, keep_blank_values=True)
            safe = [(key, child) for key, child in params
                    if key.lower() not in {'key', 'token', 'access_token', 'api_key'}]
            count = len(params)-len(safe)
            if count:
                removed += count
                return urlunsplit(parsed._replace(query=urlencode(safe)))
        return value
    return visit(payload), removed


class GoogleCollectors:
    def __init__(self, config, store, transport=None):
        self.config, self.store, self.transport = config, store, transport
        self._authorized_session = None
        self._public_session = None

    def _network(self, method, url, body=None, headers=None):
        import requests
        if (headers and "X-Goog-Api-Key" in headers) or url.startswith("https://www.googleapis.com/pagespeedonline/"):
            if self._public_session is None:
                self._public_session = requests.Session()
            session = self._public_session
        else:
            if self._authorized_session is None:
                from .config import require_external_credentials
                require_external_credentials(self.config)
                from google.oauth2 import service_account
                from google.auth.transport.requests import AuthorizedSession
                path = str(Path(self.config["GOOGLE_APPLICATION_CREDENTIALS"]).expanduser().resolve())
                credentials = service_account.Credentials.from_service_account_file(path, scopes=READ_ONLY_SCOPES)
                self._authorized_session = AuthorizedSession(credentials)
            session = self._authorized_session
        response = session.request(method, url, json=body, headers=headers, timeout=(10, 90), allow_redirects=False)
        if not 200 <= response.status_code < 300:
            raise GoogleAPIError("http", response.status_code)
        return response.json()

    def _request(self, source, method, url, body=None, headers=None):
        # This allowlist deliberately excludes indexing, mutations, uploads and API enablement.
        patterns = {
            "GET": (r"https://www\.googleapis\.com/webmasters/v3/sites(?:/[^/?]+/sitemaps)?",
                    r"https://analyticsdata\.googleapis\.com/v1beta/properties/\d+/metadata",
                    r"https://analyticsadmin\.googleapis\.com/v1beta/accountSummaries\?[^#]+",
                    r"https://www\.googleapis\.com/pagespeedonline/v5/runPagespeed\?[^#]+"),
            "POST": (r"https://www\.googleapis\.com/webmasters/v3/sites/[^/?]+/searchAnalytics/query",
                     r"https://searchconsole\.googleapis\.com/v1/urlInspection/index:inspect",
                     r"https://analyticsdata\.googleapis\.com/v1beta/properties/\d+:(?:runReport|checkCompatibility)",
                     r"https://analyticsdata\.googleapis\.com/v1alpha/properties/\d+:runFunnelReport",
                     r"https://chromeuxreport\.googleapis\.com/v1/records:queryRecord"),
        }
        if not any(re.fullmatch(pattern, url) for pattern in patterns.get(method, ())):
            raise ValueError("Only the read-only Google collector endpoints are allowed")
        try:
            payload = (self.transport or self._network)(method, url, body=body, headers=headers)
        except GoogleAPIError as error:
            self._capture_error(source, method, url, body, error.status)
            raise GoogleAPIError(source, error.status) from None
        except Exception:
            self._capture_error(source, method, url, body, None)
            raise GoogleAPIError(source) from None
        if not isinstance(payload, dict):
            self._capture_error(source, method, url, body, None)
            raise GoogleAPIError(source)
        if "error" in payload:
            error = payload["error"]
            code = error.get("code") if isinstance(error, dict) else None
            code = code if isinstance(code, int) else None
            self._capture_error(source, method, url, body, code)
            raise GoogleAPIError(source, code)
        snapshot_payload = payload
        if source == 'pagespeed':
            sanitized, removed = _redact_pagespeed_resource_urls(payload)
            if removed:
                snapshot_payload = {'response': sanitized, 'security_redaction': {
                    'removed_url_parameters': removed, 'original_payload_sha256': digest(payload),
                    'representation': 'credential_redacted_response'}}
            payload = sanitized
        manifest = self.store.capture(source, {"method": method, "url": url, "body": body}, snapshot_payload, enqueue=False)
        return payload, manifest

    def _capture_error(self, source, method, url, body, status):
        # Error bodies can echo keys or identifiers: deliberately retain status only.
        self.store.capture(source + "_error", {"method": method, "url": url, "body": body},
                           {"collector_error": {"source": source, "http_status": status}}, enqueue=False)

    def _property(self, key):
        value = self.config.get(key)
        if not value:
            raise ValueError(f"Configure {key} before collection")
        return str(value)

    def discover_gsc(self):
        payload, snapshot = self._request("gsc_sites", "GET", "https://www.googleapis.com/webmasters/v3/sites")
        return {"source": "gsc", "sites": payload.get("siteEntry", []), "snapshot": snapshot,
                "note": "Select an accessible store property explicitly; never guess from its name."}

    def list_sitemaps(self):
        prop = self._property("GSC_PROPERTY")
        payload, snapshot = self._request("gsc_sitemaps", "GET", f"https://www.googleapis.com/webmasters/v3/sites/{quote(prop, safe='')}/sitemaps")
        return {"source": "gsc", "sitemaps": payload.get("sitemap", []), "snapshot": snapshot}

    def inspect_url(self, url):
        body = {"inspectionUrl": _public_url(url), "siteUrl": self._property("GSC_PROPERTY"), "languageCode": "pt-BR"}
        payload, snapshot = self._request("gsc_inspection", "POST", "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", body)
        return {"source": "gsc", "inspection": payload.get("inspectionResult", {}), "snapshot": snapshot}

    def collect_gsc(self, days=28, end_date=None, dimensions=None):
        prop = self._property("GSC_PROPERTY")
        start, end = date_window(days, end_date, lag_days=3)
        page_size = int(self.config.get("GSC_PAGE_SIZE", 25000))
        max_rows = int(self.config.get("GSC_MAX_ROWS", 100000))
        if not 1 <= page_size <= 25000 or max_rows < 1:
            raise ValueError("GSC page size must be 1..25000 and row cap positive")
        groups = dimensions or [("query",), ("page",), ("query", "page")]
        groups = list(groups) + [()]
        reports = {}
        for dims in groups:
            if any(d not in ("query", "page", "device", "country", "date", "searchAppearance") for d in dims):
                raise ValueError("Unsupported GSC dimension")
            rows, snapshots, exhausted, offset = [], [], False, 0
            while len(rows) < max_rows:
                size = min(page_size, max_rows - len(rows))
                body = {"startDate": start, "endDate": end, "dimensions": list(dims), "type": "web", "dataState": "final", "rowLimit": size, "startRow": offset}
                payload, snapshot = self._request("gsc_search_analytics", "POST", f"https://www.googleapis.com/webmasters/v3/sites/{quote(prop, safe='')}/searchAnalytics/query", body)
                snapshots.append(snapshot)
                batch = payload.get("rows", [])
                rows.extend(batch)
                if len(batch) < size or not dims:
                    exhausted = True
                    break
                offset += len(batch)
            reports["_".join(dims) or "totals"] = {
                "dimensions": list(dims), "rows": rows, "snapshots": snapshots,
                "coverage": {"returned_rows": len(rows), "max_rows": max_rows,
                    "limit_reached": not exhausted and len(rows) >= max_rows,
                    "pagination_exhausted": exhausted,
                    "all_search_traffic": not dims,
                    "note": "Search Analytics returns top rows; query dimensions omit anonymized queries. Exhausted pagination does not prove all traffic is represented."},
            }
        return {"source": "gsc", "property": prop, "start_date": start, "end_date": end,
                "timezone": "America/Los_Angeles", "data_state": "final", "search_type": "web",
                "freshness": "Default ends three Pacific calendar days before collection; latest available final date is not inferred.",
                "reports": reports, "gaps": ["GSC query-to-order attribution is aggregate, not a user/session join."]}

    def discover_ga4(self):
        summaries, snapshots, token = [], [], None
        for _ in range(100):
            params = {"pageSize": 200}
            if token:
                params["pageToken"] = token
            payload, snapshot = self._request("ga4_discovery", "GET", "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?" + urlencode(params))
            snapshots.append(snapshot)
            summaries.extend(payload.get("accountSummaries", []))
            token = payload.get("nextPageToken")
            if not token:
                break
        return {"source": "ga4_admin", "accounts": summaries, "snapshots": snapshots,
                "coverage": {"pagination_exhausted": not token},
                "note": "Admin API must already be enabled; this method never enables it. Select the matching store property explicitly."}

    def _ga4_property(self):
        prop = self._property("GA4_PROPERTY_ID").removeprefix("properties/")
        if not prop.isdigit():
            raise ValueError("GA4_PROPERTY_ID must be numeric or properties/<numeric>")
        return prop

    @staticmethod
    def _ga4_rows(payload):
        dimensions = [h["name"] for h in payload.get("dimensionHeaders", [])]
        metrics = [h["name"] for h in payload.get("metricHeaders", [])]
        rows = []
        for row in payload.get("rows", []):
            values = {k: v.get("value", "") for k, v in zip(dimensions, row.get("dimensionValues", []))}
            for k, v in zip(metrics, row.get("metricValues", [])):
                try:
                    number = float(v.get("value"))
                    values[k] = number if math.isfinite(number) else None
                except (ValueError, TypeError):
                    values[k] = None
            rows.append(values)
        return rows

    def _ga4_report(self, prop, start, end, dims, metrics, organic, known_dims, known_metrics):
        missing = [x for x in dims if x not in known_dims] + [x for x in metrics if x not in known_metrics]
        if organic and "sessionDefaultChannelGroup" not in known_dims:
            missing.append("sessionDefaultChannelGroup")
        if missing:
            return {"status": "metadata_gap", "gaps": missing, "rows": []}
        body = {"dateRanges": [{"startDate": start, "endDate": end}],
                "dimensions": [{"name": x} for x in dims], "metrics": [{"name": x} for x in metrics]}
        if organic:
            body["dimensionFilter"] = {"filter": {"fieldName": "sessionDefaultChannelGroup", "stringFilter": {"matchType": "EXACT", "value": "Organic Search"}}}
        base = f"https://analyticsdata.googleapis.com/v1beta/properties/{prop}"
        compatibility_body = {k: v for k, v in body.items() if k != "dateRanges"}
        compatibility, check_snapshot = self._request("ga4_compatibility", "POST", base + ":checkCompatibility", compatibility_body)
        # The API also lists fields that could be added to this report. An unrelated
        # incompatible candidate must not veto the dimensions/metrics we requested.
        requested_fields = set(dims) | set(metrics)
        if organic:
            requested_fields.add("sessionDefaultChannelGroup")
        incompatible = [entry.get("dimensionMetadata", entry.get("metricMetadata", {})).get("apiName")
                        for key in ("dimensionCompatibilities", "metricCompatibilities")
                        for entry in compatibility.get(key, []) if entry.get("compatibility") == "INCOMPATIBLE"
                        and entry.get("dimensionMetadata", entry.get("metricMetadata", {})).get("apiName") in requested_fields]
        if incompatible:
            return {"status": "incompatible", "gaps": incompatible, "rows": [], "snapshots": [check_snapshot]}
        max_rows = int(self.config.get("GA4_MAX_ROWS", 100000))
        page_size = int(self.config.get("GA4_PAGE_SIZE", 10000))
        if not 1 <= page_size <= 250000 or max_rows < 1:
            raise ValueError("GA4 row limits must be positive and page size <= 250000")
        rows, snapshots, metadata, offset, total = [], [check_snapshot], [], 0, None
        while offset < max_rows:
            request = dict(body, offset=str(offset), limit=str(min(page_size, max_rows - offset)), returnPropertyQuota=True)
            payload, snapshot = self._request("ga4_report", "POST", base + ":runReport", request)
            snapshots.append(snapshot)
            batch = self._ga4_rows(payload)
            rows.extend(batch)
            metadata.append(payload.get("metadata", {}))
            total = payload.get("rowCount")
            offset += len(batch)
            if not batch or (total is not None and offset >= total) or len(batch) < int(request["limit"]):
                break
        return {"status": "collected", "rows": rows, "snapshots": snapshots, "metadata": metadata,
                "coverage": {"returned_rows": len(rows), "api_row_count": total, "max_rows": max_rows,
                             "limit_reached": offset >= max_rows and (total is None or offset < total)},
                "gaps": ["Thresholding, sampling, other-row and attribution flags must be interpreted from raw metadata."]}

    def collect_ga4(self, days=28, end_date=None):
        prop = self._ga4_property()
        start, end = date_window(days, end_date, lag_days=2, timezone_name="America/Sao_Paulo")
        payload, metadata_snapshot = self._request("ga4_metadata", "GET", f"https://analyticsdata.googleapis.com/v1beta/properties/{prop}/metadata")
        known_dims = {x["apiName"] for x in payload.get("dimensions", [])}
        known_metrics = {x["apiName"] for x in payload.get("metrics", [])}
        reports, counts, gaps, ratios = {}, {}, {}, {}
        specs = {
            "overview": ([], ["sessions", "engagedSessions", "screenPageViews", "ecommercePurchases", "purchaseRevenue"]),
            "landing_pages": (["landingPage"], ["sessions", "engagedSessions", "ecommercePurchases", "purchaseRevenue"]),
            "events": (["eventName"], ["eventCount"]),
            "items": (["itemId", "itemName", "itemCategory"], ["itemsViewed", "itemsAddedToCart", "itemsCheckedOut", "itemsPurchased", "itemRevenue"]),
        }
        for scope, organic in (("all_traffic", False), ("organic_search", True)):
            reports[scope] = {}
            for name, (dims, metrics) in specs.items():
                try:
                    reports[scope][name] = self._ga4_report(prop, start, end, dims, metrics, organic, known_dims, known_metrics)
                except GoogleAPIError as error:
                    reports[scope][name] = {"status": "api_gap", "rows": [], "http_status": error.status,
                                            "gaps": ["Read report unavailable; inspect API enablement, permissions, compatibility or quota. Other reports remain independent."]}
            counts[scope] = {row["eventName"]: row["eventCount"] for row in reports[scope]["events"]["rows"]}
            gaps[scope] = [event for event in EXPECTED_EVENTS
                           if counts[scope].get(event) is None or counts[scope][event] <= 0]
            ratios[scope] = event_ratios(counts[scope])
        return {"source": "ga4", "property": f"properties/{prop}", "start_date": start, "end_date": end,
                "timezone": "Use the property timeZone returned in report metadata; default date boundary uses America/Sao_Paulo minus 2 days.",
                "metadata_snapshot": metadata_snapshot, "reports": reports, "event_counts": counts,
                "event_gaps": gaps, "event_ratios": ratios, "instrumentation_verified": False,
                "gaps": ["Event ratios are aggregate event volumes, not ordered cohort or session conversion rates.",
                         "itemId/itemName availability in metadata does not prove items were sent correctly.",
                         "value, currency and transaction_id event payloads require tag/debug validation or an authorized event-level export; aggregate Data API is insufficient.",
                         "An absent event may mean zero activity, incomplete consent, or missing tracking; no automatic diagnosis.",
                         "Purchase revenue is GA4-attributed, not the operational sales ledger. Reconcile cancellations, taxes, shipping and refunds."]}

    def collect_funnel(self, days=28, end_date=None):
        """Closed ordered user funnel. Users can span sessions; never a session funnel."""
        prop = self._ga4_property()
        start, end = date_window(days, end_date, lag_days=2, timezone_name="America/Sao_Paulo")
        events = ("session_start",) + EXPECTED_EVENTS
        body = {"dateRanges": [{"startDate": start, "endDate": end}],
                "funnel": {"isOpenFunnel": False, "steps": [
                    {"name": event, "isDirectlyFollowedBy": False,
                     "filterExpression": {"funnelEventFilter": {"eventName": event}}}
                    for event in events]}, "returnPropertyQuota": True}
        result = {"source": "ga4_funnel_v1alpha", "property": f"properties/{prop}",
                  "start_date": start, "end_date": end, "grain": "ordered_active_user_cohort",
                  "closed_funnel": True, "scope": "all_traffic", "steps": list(events),
                  "gaps": ["Alpha API may change. A user can complete steps across sessions in the selected period; this is not session conversion.",
                           "No cohort-to-product attribution is inferred. Inspect sampling/thresholding metadata and verify ecommerce instrumentation."]}
        try:
            payload, snapshot = self._request("ga4_funnel", "POST", f"https://analyticsdata.googleapis.com/v1alpha/properties/{prop}:runFunnelReport", body)
        except GoogleAPIError as error:
            return dict(result, status="api_gap", http_status=error.status, rows=[],
                        gaps=result["gaps"] + ["Funnel unavailable: validate Data API support, permissions and quotas; other baseline reports remain available."])
        table = payload.get("funnelTable", {})
        return dict(result, status="collected", snapshot=snapshot, rows=self._ga4_rows(table),
                    metadata=table.get("metadata", {}),
                    visualization_metadata=payload.get("funnelVisualization", {}).get("metadata", {}))

    def collect_pagespeed(self, url, strategy="mobile"):
        if strategy not in ("mobile", "desktop"):
            raise ValueError("strategy must be mobile or desktop")
        target = _public_url(url)
        api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?" + urlencode({"url": target, "strategy": strategy, "category": "performance"})
        key = self.config.get("GOOGLE_API_KEY")
        payload, snapshot = self._request("pagespeed", "GET", api, headers={"X-Goog-Api-Key": key} if key else None)
        lighthouse = payload.get("lighthouseResult", {})
        return {"source": "pagespeed", "url": target, "strategy": strategy, "snapshot": snapshot,
                "lighthouse_version": lighthouse.get("lighthouseVersion"), "fetch_time": lighthouse.get("fetchTime"),
                "performance_score": lighthouse.get("categories", {}).get("performance", {}).get("score"),
                "note": "Point-in-time laboratory measurement. Field data availability is independent."}

    def collect_crux(self, url):
        target = _public_url(url)
        key = self.config.get("GOOGLE_API_KEY")
        if not key:
            raise ValueError("Configure GOOGLE_API_KEY for CrUX")
        try:
            payload, snapshot = self._request("crux", "POST", "https://chromeuxreport.googleapis.com/v1/records:queryRecord", {"url": target}, {"X-Goog-Api-Key": key})
        except GoogleAPIError as error:
            if error.status == 404:
                return {"source": "crux", "url": target, "status": "insufficient_field_data",
                        "note": "No URL-level CrUX record; this is not evidence of an authentication failure. No origin fallback is silently substituted."}
            raise
        return {"source": "crux", "url": target, "status": "collected", "snapshot": snapshot,
                "record": payload.get("record", {}), "note": "Rolling field-data period is in record.collectionPeriod; URL-level only."}
