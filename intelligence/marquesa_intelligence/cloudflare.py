"""Read-only Cloudflare access through the existing authenticated Wrangler."""
from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATABASES = ('marquesa-db-prod', 'marquesa-db-dev', 'marquesa-db-staging-v2')
TABLES = ('produtos', 'categorias', 'maletas', 'maleta_itens', 'kit_componentes', 'loja_variantes', 'vendas', 'venda_itens')


def is_readonly_sql(sql):
    clean = re.sub(r'/\*.*?\*/|--[^\n]*', '', sql, flags=re.S)
    clean = re.sub(r"'(?:''|[^'])*'", "''", clean)
    statements = [s.strip() for s in clean.split(';') if s.strip()]
    return bool(statements) and all(re.match(r'^SELECT\b', s, re.I) for s in statements) and not re.search(
        r'\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|TRIGGER|load_extension)\b', clean, re.I)


def sql_for_cli(sql):
    """Remove comments/newlines outside literals for Windows argv transport."""
    tokens = re.findall(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|/\*.*?\*/|--[^\n]*|[^'\"/\-]+|.", sql, re.S)
    result = []
    for token in tokens:
        if token.startswith(('--', '/*')):
            result.append(' ')
        elif token.startswith(("'", '"')):
            if '\n' in token or '\r' in token:
                raise ValueError('Multiline SQL literals are unsupported by this read-only CLI adapter')
            result.append(token)
        else:
            result.append(re.sub(r'\s+', ' ', token))
    return ''.join(result).strip()


class CloudflareReadOnly:
    def __init__(self, store, database='marquesa-db-prod', runner=None):
        if database not in DATABASES:
            raise ValueError('Only explicitly configured Marquesa databases are allowed')
        self.store, self.database, self.runner = store, database, runner or subprocess.run

    def _run(self, args):
        # Fixed project executable; never npx install, shell evaluation or global config.
        command = ['node', str(ROOT/'api/node_modules/wrangler/bin/wrangler.js')] + args
        result = self.runner(command, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', timeout=120, shell=False)
        if result.returncode:
            raise RuntimeError('Read-only Wrangler probe failed; inspect authentication/permissions/schema locally')
        return result.stdout

    def query(self, source, sql):
        if not is_readonly_sql(sql):
            raise ValueError('Only SELECT statements are permitted by this adapter')
        raw = self._run(['d1', 'execute', self.database, '--config', str(ROOT/'api/wrangler.toml'), '--remote', '--json', '--command', sql_for_cli(sql)])
        data = json.loads(raw)
        if not isinstance(data, list) or any(not item.get('success', False) for item in data):
            raise RuntimeError('D1 read query did not return successful result sets')
        manifest = self.store.capture(source, {'database': self.database, 'sql': sql, 'operation': 'SELECT'}, data)
        return data, manifest

    def schema(self):
        sql = "SELECT m.name AS tabela, p.name AS coluna, p.type AS tipo FROM sqlite_master AS m JOIN pragma_table_info(m.name) AS p WHERE m.type='table' ORDER BY m.name,p.cid"
        data, manifest = self.query('d1_schema', sql)
        return {'columns': data[0]['results'], 'snapshot': manifest}

    def collect_commerce(self):
        # The registry is the reviewed, PII-free export; no user-defined SQL file.
        sql = (ROOT/'intelligence/commerce-readonly.sql').read_text(encoding='utf-8')
        data, manifest = self.query('d1_commerce', sql)
        if len(data) != len(TABLES):
            raise RuntimeError('Export registry/result set mismatch; no guessed table mapping')
        tables = {name: result['results'] for name, result in zip(TABLES, data)}
        ledger, ledger_manifest = self.query('d1_stock_ledger', 'SELECT p.sku, p.qtd, COALESCE(SUM(m.qtd),0) AS saldo_movimentos FROM produtos p LEFT JOIN movimentos m ON m.sku=p.sku GROUP BY p.sku,p.qtd')
        tables['movimentos_aggregate'] = ledger[0]['results']
        return {'tables': tables, 'meta': {'environment': self.database, 'exported_at': datetime.now(timezone.utc).isoformat(),
                'tables_complete': list(tables), 'sales_scope': 'site only, uncancelled, non-reseller and excluding active historical duplicates',
                'sales_window': 'all available site orders; not a 28/90-day GA4 comparison',
                'site_sales_coverage_verified': False,
                'coverage_reason': 'This export does not reconcile order ingestion against Nuvemshop order history.',
                'raw_snapshots': [manifest, ledger_manifest]}, 'gaps': ['Nuvemshop mirror freshness is its lido_em; no refresh or sync was performed.']}

    def r2_metadata(self):
        # Wrangler 4.123 supports this command without --json.
        output = self._run(['r2', 'bucket', 'list'])
        names = re.findall(r'^name:\s*(\S+)', output, re.M)
        if not names:
            try:
                names = [item['name'] for item in json.loads(output)]
            except (ValueError, TypeError, KeyError):
                names = [name for name in ('marquesa-fotos', 'marquesa-fotos-dev') if re.search(r'\b'+name+r'\b', output)]
        result = {'expected_buckets': {name: name in names for name in ('marquesa-fotos', 'marquesa-fotos-dev')}, 'objects_read': 0, 'operation': 'bucket metadata list'}
        return dict(result, snapshot=self.store.capture('r2_metadata', {'operation': 'list_buckets'}, result))
