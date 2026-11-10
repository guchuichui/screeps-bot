import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from screeps_analyze import analyze, counter_delta
from screeps_hourly import SingleInstance, cache_layouts, capture_once


def sample(hours=0, code='same'):
    now = datetime(2026, 11, 11, 0, tzinfo=timezone.utc) + timedelta(hours=hours)
    return {'collectedAt': now.isoformat(), 'activeCode': {'sha256': code},
        'facts': {'runtimeSnapshotTick': hours * 1000, 'observationAgeTicks': 0, 'cpu': {'used': 2, 'limit': 20}},
        'roomSummaries': {'E22S37': {'spawnSites': [{'id': 'site', 'progress': 100}]}},
        'telemetry': {'available': True, 'rooms': {'E22S36': {
            'sources': [{'id': 'source', 'capacity': 3000, 'energy': 3000, 'assignedByMemory': [],
                         'adjacentCandidates': [], 'regenerationPeriod': 300, 'baseHarvestPower': 2}],
            'energy': {'storage': 20000 + hours * 100}, 'energyAvailable': 100,
            'controller': {'my': True, 'level': 6, 'progress': 1, 'ticksToDowngrade': 10000},
            'structureCounts': {'spawn': 1, 'storage': 1}, 'productionDemand': {'needed': True}, 'rclLimits': {'link': 2}, 'links': []}},
            'counters': {'rooms': {'E22S36': {'epoch': 'one', 'observedTicks': hours * 1000, 'spawnBusyTicks': 0,
                'workerObservedTicks': hours * 2000, 'emptyWorkerTicks': hours * 1900, 'controllerProgressObserved': 0}}}},
        'staticLayouts': {'E22S36': {'routes': [{'targetId': 'source', 'length': 50, 'chebyshevLowerBound': 15}]}}, 'errors': []}


class HourlyTests(unittest.TestCase):
    def test_null_counter_and_unreachable_static_path_remain_missing(self):
        rows = [sample(0), sample(1), sample(2)]
        for row in rows:
            row['telemetry']['counters'] = None
            row['staticLayouts']['E22S36']['routes'][0]['length'] = None
        result = analyze(rows)
        self.assertFalse(any(f['rule'] in ['links', 'layout', 'logistics', 'controller'] for f in result['findings']))

    def test_event_rate_uses_only_covered_event_ticks(self):
        rows = [sample(0), sample(1), sample(2)]
        for index, row in enumerate(rows):
            row['telemetry']['counters']['sources'] = {'source': {'epoch': 'same', 'eventTicksRead': index * 100, 'harvestAmountEvents': index * 250}}
        result = analyze(rows)
        measurement = result['rules']['harvest_capacity']['measurements'][0]
        self.assertEqual(measurement['eventTicksRead'], 200)
        self.assertEqual(measurement['amountPerCoveredEventTick'], 2.5)

    def test_single_snapshot_never_becomes_a_long_term_claim(self):
        result = analyze([sample()]); self.assertFalse(result['trendReady'])
        self.assertFalse(any(f['kind'] == 'trend_candidate' for f in result['findings']))

    def test_three_comparable_hours_produce_reviewable_candidates(self):
        result = analyze([sample(0), sample(1), sample(2)])
        self.assertTrue(result['trendReady'])
        found = {f['rule'] for f in result['findings']}
        self.assertTrue({'source_unattended', 'harvest_capacity', 'logistics', 'spawn_wait', 'stored_energy', 'controller', 'pioneer', 'links', 'layout'} <= found)

    def test_missing_rich_telemetry_is_unavailable_not_zero(self):
        row = sample(); del row['telemetry']
        result = analyze([row]); self.assertIn('sources', result['unavailable'])
        self.assertEqual(result['rules']['source_unattended']['status'], 'unavailable')

    def test_deployment_changes_and_close_samples_do_not_make_a_trend(self):
        self.assertFalse(analyze([sample(0, 'a'), sample(1, 'a'), sample(2, 'b')])['trendReady'])
        self.assertFalse(analyze([sample(0), sample(.1), sample(.2)])['trendReady'])

    def test_counter_epoch_changes_or_resets_cannot_be_bridged(self):
        self.assertIsNone(counter_delta({'epoch': 1, 'x': 5}, {'epoch': 2, 'x': 6}, 'x'))
        self.assertIsNone(counter_delta({'epoch': 1, 'x': 5}, {'epoch': 1, 'x': 1}, 'x'))

    def test_long_span_with_duplicate_close_endpoints_is_not_three_hourly_samples(self):
        self.assertFalse(analyze([sample(0), sample(2.1), sample(2.2)])['trendReady'])

    def test_missing_source_capacity_is_unavailable_not_a_numeric_zero(self):
        rows = [sample(0), sample(1), sample(2)]
        for row in rows: row['telemetry']['rooms']['E22S36']['sources'][0]['capacity'] = None
        result = analyze(rows)
        self.assertFalse(any(f['rule'] == 'source_unattended' for f in result['findings']))

    def test_valid_read_only_capture_redacts_credentials_and_preserves_schema1_limits(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'tests') as directory:
            self.assertTrue(Path(directory).resolve().is_relative_to(ROOT.resolve()))
            output = Path(directory); credential = output / 'credential'; credential.write_text('unit-only-placeholder')
            capture = {'source': 'test', 'shard': 'shard3', 'serverTick': 10, 'errors': [],
                'activeCode': {'branch': 'agent-test'}, 'expansion': {'tasks': {}, 'lastError': {'reason': 'unit-only-placeholder'},
                    'observation': {'schema': 1, 'tick': 10, 'rooms': {}, 'creeps': []}}}
            result = capture_once({'tokenFile': str(credential), 'shard': 'shard3'}, output, lambda _: capture)
            self.assertTrue(result['fresh']); report = (output / 'latest.json').read_text()
            self.assertNotIn('unit-only-placeholder', report)
            self.assertFalse(json.loads(report)['telemetry']['available'])

    def test_controller_risk_is_explicitly_instantaneous(self):
        row = sample(); row['telemetry']['rooms']['E22S36']['controller']['ticksToDowngrade'] = 100
        result = analyze([row]); self.assertEqual(result['findings'][0]['kind'], 'instantaneous')

    def test_single_instance_lock_rejects_overlap_and_recovers(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'tests') as directory:
            self.assertTrue(Path(directory).resolve().is_relative_to(ROOT.resolve()))
            lock = Path(directory) / 'lock'
            with SingleInstance(lock):
                with self.assertRaises(BlockingIOError):
                    with SingleInstance(lock): pass
            with SingleInstance(lock): pass

    def test_layout_cache_is_content_addressed_without_duplication(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'tests') as directory:
            self.assertTrue(Path(directory).resolve().is_relative_to(ROOT.resolve()))
            data = {'telemetryStatic': {'E22S36': {'terrain': '0' * 2500}}}
            a, _ = cache_layouts(data, directory); b, _ = cache_layouts(data, directory)
            self.assertEqual(a, b)
            self.assertEqual(len(list((Path(directory) / 'static').glob('E22S36-*.json'))), 1)
            self.assertEqual(len(list((Path(directory) / 'static').glob('terrain-*.json'))), 1)
            data['telemetryStatic']['E22S36']['structures'] = [{'type': 'road', 'x': 1, 'y': 2}]
            cache_layouts(data, directory)
            self.assertEqual(len(list((Path(directory) / 'static').glob('terrain-*.json'))), 1)

    def test_credential_failure_is_saved_and_does_not_overwrite_last_success(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'tests') as directory:
            self.assertTrue(Path(directory).resolve().is_relative_to(ROOT.resolve()))
            output = Path(directory); previous = output / 'last-success.json'; previous.write_text('{"baseline":true}')
            result = capture_once({'tokenFile': str(output / 'missing'), 'shard': 'shard3'}, output)
            self.assertFalse(result['ok']); self.assertEqual(json.loads(previous.read_text()), {'baseline': True})
            self.assertTrue((output / 'latest.json').exists()); self.assertEqual(len((output / 'history.jsonl').read_text().splitlines()), 1)


if __name__ == '__main__': unittest.main()
