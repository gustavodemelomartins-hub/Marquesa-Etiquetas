"""External credentials and metadata-only validation."""
from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAMES = ('GOOGLE_CLOUD_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_API_KEY', 'GSC_PROPERTY',
         'GA4_PROPERTY_ID', 'MARQUESA_STOREFRONT_URL', 'MARQUESA_API_URL',
         'MARQUESA_API_KEY', 'NUVEMSHOP_STORE_ID', 'NUVEMSHOP_TOKEN',
         'MARQUESA_INTELLIGENCE_STORAGE')


def load_config(environ=None, config_dir=None):
    env = dict(os.environ if environ is None else environ)
    folder = Path(config_dir) if config_dir is not None else Path.home()/'.config'/'marquesa-seo'
    values = {}
    external = folder/'.env'
    # Never source/evaluate shell content. No substitution or arbitrary keys.
    if external.exists():
        if external.resolve().is_relative_to(ROOT):
            raise ValueError('Real credential configuration must be outside the repository')
        for line in external.read_text(encoding='utf-8-sig').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            name, value = line.split('=', 1)
            cleaned = value.strip().strip('\"\'')
            if name.strip() in NAMES and cleaned:
                values[name.strip()] = cleaned
    for name in NAMES:
        if env.get(name):
            values[name] = env[name]
    values.setdefault('MARQUESA_INTELLIGENCE_STORAGE', str(ROOT/'.local'/'intelligence'))
    return values


def validate_config(config):
    account = config.get('GOOGLE_APPLICATION_CREDENTIALS', '')
    account_status = 'missing'
    if account:
        path = Path(account).expanduser().resolve()
        if path.is_relative_to(ROOT):
            account_status = 'unsafe_path'
        else:
            account_status = 'file_present_unverified' if path.is_file() else 'file_missing'
    prop = config.get('GSC_PROPERTY', '')
    ga4 = str(config.get('GA4_PROPERTY_ID', '')).removeprefix('properties/')
    return {
        'google_cloud_project': {'configured': bool(config.get('GOOGLE_CLOUD_PROJECT')),
            'format_valid': valid_project_id(config.get('GOOGLE_CLOUD_PROJECT', '')),
            'verified_remote': False},
        'google_service_account': {'configured': account_status == 'file_present_unverified', 'status': account_status},
        'google_api_key': {'configured': bool(config.get('GOOGLE_API_KEY'))},
        'gsc_property': {'configured': bool(prop), 'format_valid': bool(re.fullmatch(r'sc-domain:[^/\s]+', prop) or re.fullmatch(r'https://[^\s]+/', prop))},
        'ga4_property': {'configured': bool(ga4), 'format_valid': bool(re.fullmatch(r'\d+', ga4))},
        'marquesa_api': {'configured': bool(config.get('MARQUESA_API_URL') and config.get('MARQUESA_API_KEY'))},
        'nuvemshop': {'configured': bool(config.get('NUVEMSHOP_STORE_ID') and config.get('NUVEMSHOP_TOKEN'))},
        'indexing_api': {'enabled_by_this_tool': False, 'supported': False},
        'permissions_verified': False,
    }


def valid_project_id(value):
    return bool(re.fullmatch(r'[a-z][a-z0-9-]{4,28}[a-z0-9]', str(value)))


def configure_google_project(project_id, gsc_property=None, config_dir=None, ga4_property=None):
    """Persist only non-secret metadata externally, preserving credential lines."""
    if not valid_project_id(project_id):
        raise ValueError('Invalid Google Cloud project ID')
    if gsc_property and not validate_config({'GSC_PROPERTY': gsc_property})['gsc_property']['format_valid']:
        raise ValueError('Invalid GSC property')
    if ga4_property is not None and not re.fullmatch(r'\d+', str(ga4_property)):
        raise ValueError('Invalid numeric GA4 property ID')
    folder = Path(config_dir) if config_dir else Path.home()/'.config/marquesa-seo'
    if folder.resolve().is_relative_to(ROOT):
        raise ValueError('Google configuration must be outside the repository')
    if not folder.is_dir():
        raise ValueError('Run external configuration setup first')
    path = folder/'.env'
    existing = path.read_text(encoding='utf-8-sig') if path.is_file() else ''
    update = {'GOOGLE_CLOUD_PROJECT': project_id}
    if gsc_property:
        update['GSC_PROPERTY'] = gsc_property
    if ga4_property is not None:
        update['GA4_PROPERTY_ID'] = str(ga4_property)
    lines, seen = [], set()
    for line in existing.splitlines():
        key, separator, value = line.partition('=')
        if separator and key.strip() in update:
            key = key.strip()
            prior = value.strip().strip('\"\'')
            if prior and prior != update[key]:
                raise ValueError('Existing Google metadata differs; no implicit project/property switch')
            lines.append(key+'='+update[key])
            seen.add(key)
        else:
            lines.append(line)
    for key in update.keys()-seen:
        lines.append(key+'='+update[key])
    # In-place write retains the restricted ACL of the existing external file.
    path.write_text('\n'.join(lines)+'\n', encoding='utf-8')
    return {'project_id': project_id, 'property_configured': bool(gsc_property),
            'ga4_property_configured': ga4_property is not None,
            'credential_values_changed': False, 'remote_configuration_verified': False}


def require_external_credentials(config):
    status = validate_config(config)['google_service_account']
    if not status['configured']:
        raise ValueError('Google service account missing or unsafe credential path')
