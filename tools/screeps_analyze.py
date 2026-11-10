"""Deterministic, read-only low-frequency analysis; no model or game API calls."""
import json
from datetime import datetime
from pathlib import Path

RULES = {
    'source_unattended': 'P1', 'harvest_capacity': 'P1', 'logistics': 'P1', 'spawn_wait': 'P1',
    'stored_energy': 'P1', 'controller': 'P0', 'cpu': 'P4', 'pioneer': 'P0', 'links': 'P3', 'layout': 'P2', 'runtime': 'P0'
}


def time_of(sample):
    try:
        value = datetime.fromisoformat(sample.get('collectedAt') or sample.get('generatedAt'))
        return value.timestamp() if value.tzinfo else None
    except (ValueError, TypeError):
        return None


def counter_delta(before, after, name):
    if not before or not after or before.get('epoch') != after.get('epoch'):
        return None
    a, b = before.get(name), after.get(name)
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)) or b < a:
        return None
    return b - a


def analyze(samples):
    attempts = sorted((s for s in samples if time_of(s) is not None), key=time_of)
    good = [s for s in samples if not s.get('errors') and isinstance(s.get('facts'), dict) and
            s['facts'].get('observationAgeTicks', 0) <= 100 and time_of(s) is not None]
    good.sort(key=time_of)
    if not good:
        return {'schema': 1, 'status': 'insufficient_data', 'rules': {k: {'status': 'unavailable'} for k in RULES},
                'findings': [], 'reason': 'No fresh successful timestamped samples'}
    latest = good[-1]
    build = latest.get('activeCode', {}).get('sha256')
    # Do not pool different deployments or closely spaced legacy five-minute polls.
    window = []
    for sample in reversed(good):
        if sample.get('activeCode', {}).get('sha256') != build:
            continue
        if not window or time_of(window[-1]) - time_of(sample) >= 1800:
            window.append(sample)
    window.reverse()
    trend = len(window) >= 3 and time_of(window[-1]) - time_of(window[-3]) >= 7200
    recent = window[-3:] if trend else [latest]
    telemetry = latest.get('telemetry') or {}
    rooms = telemetry.get('rooms') or {}
    findings = []
    statuses = {k: {'status': 'unavailable' if not telemetry.get('available') else 'insufficient_history',
                    'reason': 'Requires telemetry-v2 and at least three comparable samples spanning two hours'} for k in RULES}

    def add(rule, room, evidence, kind='trend_candidate', message=''):
        findings.append({'rule': rule, 'priority': RULES[rule], 'room': room, 'kind': kind,
                         'message': message, 'evidence': evidence})
        statuses[rule].update({'status': 'finding', 'kind': kind})

    error = latest['facts'].get('lastError') or {}
    tick = latest['facts'].get('runtimeSnapshotTick')
    if isinstance(tick, int) and isinstance(error.get('tick'), int) and 0 <= tick - error['tick'] <= 100:
        add('runtime', None, error, 'instantaneous', 'Recent persisted runtime exception')

    # Existing schema1 expansion/CPU data remains usable, without inventing richer fields.
    cpu = latest['facts'].get('cpu') or {}
    if cpu.get('limit'):
        statuses['cpu'] = {'status': 'snapshot_checked', 'trendReady': trend}
    if latest.get('roomSummaries'):
        statuses['pioneer'] = {'status': 'snapshot_checked', 'trendReady': trend}
    statuses['runtime'] = {'status': 'persisted_records_checked', 'scope': 'Not a complete Console log'}
    if cpu.get('limit') and cpu.get('used', 0) / cpu['limit'] >= 0.8:
        add('cpu', None, cpu, 'instantaneous', 'One high CPU snapshot; not sustained CPU load')
    for name, summary in latest.get('roomSummaries', {}).items():
        for unit in summary.get('pioneers') or []:
            action = unit.get('lastAction') or {}
            if action.get('code') in ['REPATH_EXHAUSTED', 'PIONEER_EXCEPTION', 'TARGET_NOT_OWNED']:
                add('pioneer', name, {'tick': action.get('tick'), 'unit': unit.get('name'), 'action': action},
                    'instantaneous', 'Inspect recorded failure; do not change live Memory')
    for name, room in rooms.items():
        controller = room.get('controller') or {}
        if controller.get('my') and isinstance(controller.get('ticksToDowngrade'), (int, float)) and controller['ticksToDowngrade'] < 3000:
            add('controller', name, controller, 'instantaneous', 'Controller maintenance risk')
        if not trend:
            continue
        series = [(s.get('telemetry') or {}).get('rooms', {}).get(name) for s in recent]
        if not all(series):
            continue
        for source in room.get('sources', []):
            rows = [next((p for p in r.get('sources', []) if p['id'] == source['id']), None) for r in series]
            if not all(rows):
                continue
            source_counters = [((s.get('telemetry') or {}).get('counters') or {}).get('sources', {}).get(source['id'], {}) for s in recent]
            covered_events = counter_delta(source_counters[0], source_counters[-1], 'eventTicksRead')
            harvest_amount = counter_delta(source_counters[0], source_counters[-1], 'harvestAmountEvents')
            if covered_events and harvest_amount is not None:
                statuses['harvest_capacity'].setdefault('measurements', []).append({'source': source['id'],
                    'eventTicksRead': covered_events, 'harvestEventAmount': harvest_amount,
                    'amountPerCoveredEventTick': harvest_amount / covered_events,
                    'scope': 'All Source harvest actors in covered event ticks; not unobserved interval throughput'})
            if all(isinstance(p.get('capacity'), (int, float)) and p['capacity'] > 0 and isinstance(p.get('energy'), (int, float)) and p['energy'] >= 0.9 * p['capacity'] and
                   not p.get('assignedByMemory') and not p.get('adjacentCandidates') for p in rows):
                add('source_unattended', name, {'source': source['id'], 'ticks': [p.get('tick') for p in rows]},
                    message='Full source without assigned or adjacent workers across sparse samples; not an exact utilization rate')
            period, power = source.get('regenerationPeriod'), source.get('baseHarvestPower')
            if period and power and source.get('capacity'):
                required = source['capacity'] / period / power
                if all(sum(c.get('work', 0) for c in p.get('adjacentCandidates', [])) < required for p in rows):
                    add('harvest_capacity', name, {'source': source['id'], 'unboostedWorkRequired': required,
                        'observedAdjacentWork': [sum(c.get('work', 0) for c in p.get('adjacentCandidates', [])) for p in rows]},
                        message='Potential harvesting capacity below unboosted reference; assignments/boosts require review')
        totals = [r.get('energy', {}) for r in series]
        stocks = [sum(e.get(k, 0) or 0 for k in ['storage', 'container']) for e in totals]
        if min(stocks) >= 10000 and stocks[-1] > stocks[0] and all((r.get('energyAvailable') or 0) < 200 for r in series):
            add('stored_energy', name, {'storedEnergy': stocks, 'roomEnergy': [r.get('energyAvailable') for r in series]},
                message='Stored energy increases while room production energy stays low')
        counters = [((s.get('telemetry') or {}).get('counters') or {}).get('rooms', {}).get(name, {}) for s in recent]
        covered = counter_delta(counters[0], counters[-1], 'observedTicks')
        busy = counter_delta(counters[0], counters[-1], 'spawnBusyTicks')
        empty = counter_delta(counters[0], counters[-1], 'emptyWorkerTicks')
        units = counter_delta(counters[0], counters[-1], 'workerObservedTicks')
        if covered and covered >= 300 and busy is not None and room.get('structureCounts', {}).get('spawn', 0) > 0:
            statuses['spawn_wait'] = {'status': 'measured', 'coveredTicks': covered, 'busyObservedRatio': busy / covered}
            if busy == 0 and all(r.get('productionDemand', {}).get('needed') is True for r in series):
                add('spawn_wait', name, {'coveredTicks': covered, 'busyTicks': busy, 'demand': room.get('productionDemand')},
                    message='Observed Spawn idle despite persistent population demand')
        if units and empty is not None and units >= 300:
            statuses['logistics'] = {'status': 'measured', 'emptyWorkerObservedRatio': empty / units}
            if empty / units > 0.8:
                add('logistics', name, {'observedUnitTicks': units, 'emptyUnitTicks': empty}, message='Long empty-cargo exposure; harvesting and idling must be distinguished')
        progress = counter_delta(counters[0], counters[-1], 'controllerProgressObserved')
        if progress == 0 and all(r.get('controller', {}).get('progress') is not None and r.get('controller', {}).get('level', 8) < 8 and
                                 (r.get('energy', {}).get('storage') or 0) > 10000 for r in series):
            add('controller', name, {'progressObservedDelta': 0, 'ticks': covered}, message='No observed progress despite stored energy; not energy-per-upgrade efficiency')
        links = room.get('links') or []
        if (room.get('rclLimits', {}).get('link') or 0) >= 2 and room.get('structureCounts', {}).get('storage', 0) > 0:
            for source in room.get('sources', []):
                layout = latest.get('staticLayouts', {}).get(name, {})
                routes = layout.get('routes', [])
                route = next((r for r in routes if r.get('targetId') == source['id']), {})
                if isinstance(route.get('length'), (int, float)) and route['length'] > 20 and not any(source['id'] in l.get('nearSources', []) for l in links):
                    add('links', name, {'source': source['id'], 'route': route, 'existingLinks': len(links)},
                        'planning_candidate', 'Possible Source Link opportunity; no transfer throughput or live benefit established')
        for route in latest.get('staticLayouts', {}).get(name, {}).get('routes', []):
            if isinstance(route.get('length'), (int, float)) and route['length'] > max(40, (route.get('chebyshevLowerBound') or 0) * 2):
                add('layout', name, route, 'planning_candidate', 'Long static route; terrain may explain it, inspect before modifying layout')
    if trend:
        cpus = [s['facts'].get('cpu') or {} for s in recent]
        if all(c.get('limit') and c.get('used', 0) >= c['limit'] * 0.8 for c in cpus):
            add('cpu', None, {'samples': cpus}, message='High CPU snapshots across the low-frequency window; not per-tick CPU coverage')
        for name in latest.get('roomSummaries', {}):
            rows = [s.get('roomSummaries', {}).get(name, {}) for s in recent]
            values = [sum(site.get('progress', 0) for site in r.get('spawnSites', [])) for r in rows]
            identities = [[p.get('id') for p in r.get('spawnSites', [])] for r in rows]
            if all(identities) and identities[0] == identities[1] == identities[2] and values[0] == values[1] == values[2]:
                add('pioneer', name, {'progress': values, 'siteIds': identities[0]}, message='Same Spawn site has no net progress across two hours')
    attempt = attempts[-1] if attempts else latest
    if attempt.get('errors') or (attempt.get('facts') or {}).get('observationAgeTicks', 0) > 100:
        add('runtime', None, {'collectedAt': attempt.get('collectedAt'), 'errors': attempt.get('errors'),
            'ageTicks': (attempt.get('facts') or {}).get('observationAgeTicks')},
            'observation_failure', 'Latest collection failed or is stale; prior successful data is retained, not current health proof')
        findings[-1]['priority'] = 'P1'
    for check in attempt.get('checks', []):
        if check.get('code') in ['UNEXPECTED_ACTIVE_CODE_BRANCH', 'ACTIVE_BUILD_NOT_OBSERVED_IN_RUNTIME']:
            add('runtime', None, check, 'instantaneous', 'Observed branch or runtime build mismatch')
    missing = [] if telemetry.get('available') else ['sources', 'cargo', 'storage/container/terminal', 'controller', 'links', 'terrain/layout', 'per-tick counters']
    return {'schema': 1, 'status': 'analyzed' if trend else 'insufficient_history', 'sampleCount': len(good),
            'comparableSamples': len(window), 'trendReady': trend, 'latestTick': latest['facts'].get('runtimeSnapshotTick'),
            'latestAttemptAt': attempt.get('collectedAt'), 'analysisSampleAt': latest.get('collectedAt'),
            'rules': statuses, 'findings': findings, 'unavailable': missing,
            'limits': 'Sparse hourly snapshots do not establish per-tick throughput. Counter gaps/epoch changes are not bridged.'}


def load_history(directory):
    result = []
    for file in sorted(Path(directory).glob('samples/*.json'))[-168:]:
        try:
            sample = json.loads(file.read_text(encoding='utf-8'))
            sample['staticLayouts'] = {}
            for room, ref in sample.get('staticRefs', {}).items():
                try:
                    path = Path(ref['file']).resolve()
                    if path.is_relative_to((Path(directory) / 'static').resolve()) and path.exists():
                        sample['staticLayouts'][room] = json.loads(path.read_text(encoding='utf-8'))
                except (ValueError, OSError, KeyError):
                    sample.setdefault('staticCacheErrors', []).append({'room': room, 'error': 'STATIC_CACHE_UNREADABLE'})
            result.append(sample)
        except (ValueError, OSError):
            continue
    return result


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True)
    parser.add_argument('--output')
    args = parser.parse_args()
    report = analyze(load_history(args.directory))
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(text + '\n', encoding='utf-8')
    else:
        print(text)
