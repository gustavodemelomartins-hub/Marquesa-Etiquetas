import argparse
import json
import sys
from .config import load_config, configure_google_project
from .pipeline import collect, commercial_baseline, doctor, save_normalized
from .scheduler import plan
from .storage import SnapshotStore
from .google import GoogleCollectors, GoogleAPIError


def main(argv=None):
    parser = argparse.ArgumentParser(description='Marquesa Intelligence: deterministic read-only collectors')
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('doctor', 'schedule-plan', 'pending'):
        sub.add_parser(name)
    discover = sub.add_parser('discover-google')
    discover.add_argument('--ga4-admin', action='store_true', help='Only if Admin API already enabled')
    configure = sub.add_parser('configure-google')
    configure.add_argument('--project', required=True)
    configure.add_argument('--gsc-property')
    configure.add_argument('--ga4-property', help='Numeric ID, not the measurement ID')
    imported = sub.add_parser('import-gsc-connector')
    imported.add_argument('--file', required=True, help='Local JSON responses exported by Codex, no credentials')
    for name in ('baseline', 'collect'):
        action = sub.add_parser(name)
        action.add_argument('--windows', default='28,90')
        action.add_argument('--end-date')
        if name == 'collect':
            action.add_argument('--sources', default='commerce,storefront,gsc,ga4')
            action.add_argument('--due', action='store_true')
            action.add_argument('--pdp-url', action='append', default=[])
            action.add_argument('--database', choices=('marquesa-db-prod', 'marquesa-db-dev', 'marquesa-db-staging-v2'), default='marquesa-db-prod')
    args = parser.parse_args(argv)
    try:
        config = load_config()
        store = SnapshotStore(config['MARQUESA_INTELLIGENCE_STORAGE'])
        if args.command == 'doctor':
            result = doctor(config)
        elif args.command == 'configure-google':
            result = configure_google_project(args.project, args.gsc_property, ga4_property=args.ga4_property)
        elif args.command == 'import-gsc-connector':
            from pathlib import Path
            from .connector import import_gsc_reports
            result = import_gsc_reports(store, json.loads(Path(args.file).read_text(encoding='utf-8')))
        elif args.command == 'schedule-plan':
            result = plan()
        elif args.command == 'pending':
            result = {'events': store.pending(), 'llm_calls': 0}
        elif args.command == 'discover-google':
            google = GoogleCollectors(config, store)
            result = {}
            methods = [('gsc', google.discover_gsc)] + ([('ga4_admin', google.discover_ga4)] if args.ga4_admin else [])
            for name, method in methods:
                try:
                    data = method()
                    save_normalized(store, 'discovery_'+name, data)
                    result[name] = data
                except GoogleAPIError as error:
                    result[name] = {'status': 'api_gap', 'http_status': error.status}
        else:
            windows = tuple(int(value) for value in args.windows.split(','))
            if not windows or len(set(windows)) != len(windows) or any(not 1 <= days <= 365 for days in windows):
                raise ValueError('Use unique day windows between 1 and 365')
            result = commercial_baseline(store, windows, args.end_date) if args.command == 'baseline' else collect(
                config, args.sources.split(','), windows, args.end_date, args.pdp_url, args.due, args.database)
        print(json.dumps(result, ensure_ascii=True, indent=2, allow_nan=False))
        if args.command in ('collect', 'discover-google'):
            statuses = result.get('collectors', result)
            if any(isinstance(v, dict) and v.get('status') in ('api_gap', 'collector_gap') for v in statuses.values()):
                return 2
        return 0
    except Exception:
        print(json.dumps({'status': 'configuration_or_runtime_gap', 'note': 'Validate external configuration, supported arguments and runtime. No credential or exception body is printed.'}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
