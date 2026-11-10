"""Hourly capture + deterministic analysis. Only GET requests; no AI calls."""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import sys
from datetime import datetime, timedelta, timezone
import screeps_diagnose as api
from screeps_analyze import analyze, load_history


class SingleInstance:
    def __init__(self, path):
        self.path, self.handle = Path(path), None
    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = self.path.open('a+b')
        if self.path.stat().st_size == 0:
            self.handle.write(b'0'); self.handle.flush()
        self.handle.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.handle.close(); self.handle = None
            raise BlockingIOError('SAMPLE_ALREADY_RUNNING') from None
        return self
    def __exit__(self, *args):
        if self.handle:
            self.handle.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
            self.handle.close()


def save_json(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def cache_layouts(expansion, output):
    refs, layouts = {}, {}
    for room, layout in (expansion.get('telemetryStatic') or {}).items():
        if not re.fullmatch(r'[WE]\d+[NS]\d+', room):
            continue
        layout = dict(layout)
        terrain = layout.pop('terrain', None)
        if isinstance(terrain, str) and re.fullmatch(r'[0-3]{2500}', terrain):
            terrain_hash = hashlib.sha256(terrain.encode('ascii')).hexdigest()
            terrain_file = Path(output) / 'static' / f'terrain-{terrain_hash}.json'
            if not terrain_file.exists():
                save_json(terrain_file, {'terrain': terrain, 'encoding': 'y*50+x; terrain mask'})
            layout['terrainRef'] = {'sha256': terrain_hash, 'file': str(terrain_file)}
        else:
            layout['terrainStatus'] = 'unavailable_invalid_encoding'
        content = json.dumps(layout, sort_keys=True, separators=(',', ':')).encode('utf-8')
        digest = hashlib.sha256(content).hexdigest()
        file = Path(output) / 'static' / f'{room}-{digest}.json'
        if not file.exists():
            save_json(file, layout)
        refs[room] = {'sha256': digest, 'file': str(file)}
        layouts[room] = layout
    return refs, layouts


def capture_once(config, output, capture_fn=None):
    now = datetime.now(timezone(timedelta(hours=8)))
    secret = None
    try:
        file = Path(config['tokenFile'])
        if file.stat().st_size > 8192:
            raise ValueError()
        secret = file.read_text(encoding='utf-8-sig').strip()
        if not secret or '\n' in secret or '\r' in secret:
            raise ValueError()
        capture = (capture_fn or (lambda token: api.live_capture(api.Client(token, config['shard']))))(secret)
        report = api.build_report([capture], config.get('homeRoom', 'E22S36'), config.get('targetRoom', 'E22S37'))
        expansion = capture.get('expansion') or {}
        observation = expansion.get('observation') or {}
        details = observation.get('details')
        report['telemetry'] = details if details else {'available': False, 'reason': 'Active code has not published telemetry-v2; not automatically deployed'}
        refs, layouts = cache_layouts(api.sanitize(expansion, secret), output)
        report['staticRefs'] = refs
        summaries = {}
        for room in config.get('targetRooms', ['E22S37', 'E22S38']):
            task = expansion.get('tasks', {}).get(f"{config.get('homeRoom','E22S36')}:{room}", {})
            data = observation.get('rooms', {}).get(room, {})
            summaries[room] = {'state': task.get('state'), 'status': task.get('status'), 'owned': data.get('owned'),
                'visible': data.get('visible'), 'spawns': data.get('spawnCount'),
                'spawnSites': [s for s in data.get('sites', []) if s.get('type') == 'spawn'],
                'pioneers': [c for c in observation.get('creeps', []) if c.get('role') == 'expansionPioneer' and c.get('target') == room],
                'supportCheck': task.get('supportCheck'), 'supportLaunches': task.get('supportLaunches'),
                'supportEnergySpent': task.get('supportEnergySpent'), 'failureReason': task.get('failureReason'), 'lastError': task.get('lastError')}
        report['roomSummaries'] = summaries
        for check in report.get('checks', []):
            if check['code'] == 'LAST_RECORDED_SUPPORT_WAIT' and capture.get('serverTick') is not None:
                check['evidence']['ageTicks'] = capture['serverTick'] - check['evidence']['tick']
                check['evidence']['ageReference'] = 'serverTick'
        report = api.sanitize(report, secret)
    except (OSError, UnicodeError, ValueError, KeyError):
        report = {'status': 'error', 'errors': [{'code': 'TOKEN_OR_CONFIG_READ_FAILED'}]}
        layouts = {}
    except Exception:
        report = {'status': 'error', 'errors': [{'code': 'CAPTURE_OR_DECODE_FAILED'}]}
        layouts = {}
    report['collectedAt'] = now.isoformat()
    sample_path = Path(output) / 'samples' / f"{now.strftime('%Y-%m-%d_%H-%M-%S')}-{os.getpid()}.json"
    save_json(sample_path, report)
    save_json(Path(output) / 'latest.json', report)
    successful = not report.get('errors') and bool(report.get('activeCode', {}).get('branch'))
    fresh = successful and report.get('facts', {}).get('observationAgeTicks', 101) <= 100
    if fresh:
        save_json(Path(output) / 'last-success.json', report)
    history = {'collectedAt': report['collectedAt'], 'file': str(sample_path), 'ok': successful, 'fresh': fresh,
        'runtimeTick': report.get('facts', {}).get('runtimeSnapshotTick'), 'activeCode': report.get('activeCode'),
        'cpu': report.get('facts', {}).get('cpu'), 'home': report.get('facts', {}).get('rooms', {}).get(config.get('homeRoom','E22S36')),
        'homePopulation': report.get('facts', {}).get('homePopulation'), 'rooms': report.get('roomSummaries'), 'errors': report.get('errors', [])}
    with (Path(output) / 'history.jsonl').open('a', encoding='utf-8') as stream:
        stream.write(json.dumps(history, ensure_ascii=False) + '\n')
    samples = load_history(output)
    analysis = analyze(samples)
    save_json(Path(output) / 'analysis-latest.json', analysis)
    save_json(Path(output) / 'analysis' / sample_path.name, analysis)
    save_json(Path(output) / 'alerts-latest.json', {'collectedAt': report['collectedAt'],
        'priority': 'P0' if any(f['priority'] == 'P0' for f in analysis['findings']) else None,
        'findings': [f for f in analysis['findings'] if f['priority'] == 'P0'],
        'delivery': 'Local file only; does not invoke an AI or send external messages'})
    return {'ok': successful, 'fresh': fresh, 'file': str(sample_path), 'tick': history['runtimeTick'],
            'rooms': report.get('roomSummaries'), 'home': history['home'], 'analysisStatus': analysis['status'],
            'findings': analysis['findings'], 'unavailable': analysis.get('unavailable'), 'errors': report.get('errors', [])}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    args = parser.parse_args(argv)
    try:
        config = json.loads(Path(args.config).read_text(encoding='utf-8-sig'))
        output = Path(config['outputDir']); output.mkdir(parents=True, exist_ok=True)
        with SingleInstance(output / 'sample.lock'):
            result = capture_once(config, output)
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result['ok'] else 2
    except BlockingIOError:
        print(json.dumps({'ok': False, 'skipped': 'SAMPLE_ALREADY_RUNNING'})); return 0
    except Exception:
        print(json.dumps({'ok': False, 'error': 'MONITOR_SETUP_FAILED'})); return 2


if __name__ == '__main__':
    sys.exit(main())
