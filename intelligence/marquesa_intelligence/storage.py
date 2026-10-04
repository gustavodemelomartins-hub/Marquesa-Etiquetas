"""Immutable raw snapshots, lineage and deterministic deduplicated pending events."""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

SECRET_FIELDS = {'private_key', 'private_key_id', 'access_token', 'refresh_token',
                 'client_secret', 'authorization', 'api_key', 'google_api_key',
                 'nuvemshop_token', 'marquesa_api_key', 'cookie', 'set-cookie'}


def assert_safe(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in SECRET_FIELDS:
                raise ValueError('Credential/authentication fields are forbidden in snapshots')
            assert_safe(child)
    elif isinstance(value, (list, tuple)):
        for child in value:
            assert_safe(child)
    elif isinstance(value, str):
        if '-----BEGIN PRIVATE KEY-----' in value or '-----BEGIN RSA PRIVATE KEY-----' in value:
            raise ValueError('Private key is forbidden in snapshots')
        if value.startswith(('https://', 'http://')):
            parsed = urlsplit(value)
            if parsed.username or parsed.password:
                raise ValueError('Credential-bearing URL is forbidden in snapshots')
            if any(key.lower() in {'key', 'token', 'access_token', 'api_key'} for key, _ in parse_qsl(parsed.query)):
                raise ValueError('Secret-bearing URL is forbidden in snapshots')


def serialized(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(serialized(value).encode('utf-8')).hexdigest()


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf-8')
    os.replace(temporary, path)


@contextmanager
def lease(path, timeout=5):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    while True:
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            break
        except FileExistsError:
            if time.monotonic()-started > timeout:
                raise RuntimeError('Another collection holds the local lease; no overlapping run')
            time.sleep(0.05)
    try:
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        yield
    finally:
        path.unlink(missing_ok=True)


class SnapshotStore:
    def __init__(self, root):
        self.root = Path(root).resolve()
        repository = Path(__file__).resolve().parents[2]
        if self.root.is_relative_to(repository) and not self.root.is_relative_to(repository/'.local/intelligence'):
            raise ValueError('Operational evidence inside the repository must use the ignored .local/intelligence directory')

    def capture(self, source, request_meta, payload, *, enqueue=True, comparison_payload=None):
        if not re.fullmatch(r'[a-zA-Z0-9_.-]+', source):
            raise ValueError('Invalid snapshot source')
        assert_safe(request_meta)
        assert_safe(payload)
        now = datetime.now(timezone.utc).isoformat()
        snapshot_id = uuid.uuid4().hex
        content_hash = digest(payload)
        comparison = payload if comparison_payload is None else comparison_payload
        # Quota consumption and D1 execution timings are operational metadata.
        # Keep them in the immutable raw; they must not wake an analyst.
        if source.startswith('ga4') and isinstance(comparison, dict):
            comparison = {k: v for k, v in comparison.items() if k != 'propertyQuota'}
        if source.startswith('d1_') and isinstance(comparison, list):
            comparison = [{'results': item.get('results'), 'success': item.get('success')} for item in comparison]
        assert_safe(comparison)
        comparison_hash = digest(comparison)
        # A request identity is explicit; time windows can be retained by collector.
        identity = digest({'source': source, 'request': request_meta})
        path = self.root/'raw'/source/(snapshot_id+'.json')
        envelope = {'snapshot_id': snapshot_id, 'source': source, 'captured_at': now,
                    'request': request_meta, 'payload_sha256': content_hash, 'comparison_sha256': comparison_hash, 'payload': payload}
        with lease(self.root/'.snapshot.lock'):
            index_path = self.root/'state'/'snapshots.json'
            index = json.loads(index_path.read_text(encoding='utf-8')) if index_path.exists() else {}
            previous = index.get(identity)
            changed = previous is None or previous.get('comparison_sha256', previous['payload_sha256']) != comparison_hash
            atomic_json(path, envelope)
            index[identity] = {k: envelope[k] for k in ('snapshot_id', 'captured_at', 'payload_sha256', 'comparison_sha256')}
            atomic_json(index_path, index)
            if changed and enqueue:
                event = {'event_id': digest({'identity': identity, 'hash': content_hash, 'prior_snapshot': previous and previous['snapshot_id']}),
                         'trigger': 'baseline' if previous is None else 'changed',
                         'source': source, 'snapshot_id': snapshot_id, 'previous_snapshot_id': previous and previous['snapshot_id'],
                         'payload_sha256': content_hash, 'comparison_sha256': comparison_hash, 'captured_at': now, 'status': 'pending_analysis', 'llm_calls': 0}
                queue = self.root/'pending'/'events.jsonl'
                queue.parent.mkdir(parents=True, exist_ok=True)
                with queue.open('a', encoding='utf-8') as stream:
                    stream.write(serialized(event)+'\n')
        return {'snapshot_id': snapshot_id, 'path': str(path), 'sha256': content_hash, 'changed': changed, 'llm_calls': 0}

    def pending(self):
        queue = self.root/'pending'/'events.jsonl'
        return [json.loads(line) for line in queue.read_text(encoding='utf-8').splitlines()] if queue.exists() else []

    def write_analysis(self, name, payload):
        if not re.fullmatch(r'[a-zA-Z0-9_.-]+', name):
            raise ValueError('Invalid analysis name')
        assert_safe(payload)
        path = self.root/'analysis'/(name+'.json')
        atomic_json(path, payload)
        return str(path)
