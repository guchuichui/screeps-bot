import base64
import contextlib
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('diagnose', ROOT / 'tools' / 'screeps_diagnose.py')
diagnose = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(diagnose)


class Reply:
    def __init__(self, data):
        self.body = json.dumps(data).encode()
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def read(self, limit):
        return self.body[:limit]


class FakeOpener:
    def __init__(self):
        self.requests = []
    def open(self, request, timeout):
        self.requests.append(request)
        if '/user/code' in request.full_url:
            return Reply({'ok': 1, 'branch': 'agent-test', 'modules': {'main': 'module.exports.loop = () => {};'}})
        if '/memory' in request.full_url:
            return Reply({'ok': 1, 'data': 'gz:' + base64.b64encode(gzip.compress(b'{"tasks":{}}')).decode()})
        return Reply({'ok': 1, 'time': 100})


class DiagnosticTests(unittest.TestCase):
    def test_only_three_get_endpoints_no_token_in_url(self):
        opener = FakeOpener()
        result = diagnose.live_capture(diagnose.Client('test-sensitive-value', 'shard3', opener=opener))
        self.assertEqual(len(opener.requests), 3)
        self.assertTrue(all(r.get_method() == 'GET' and r.data is None for r in opener.requests))
        self.assertTrue(all('test-sensitive-value' not in r.full_url for r in opener.requests))
        self.assertEqual(result['activeCode']['branch'], 'agent-test')
        self.assertEqual(result['expansion'], {'tasks': {}})

    def test_missing_token_is_json_error_and_no_network(self):
        with patch.dict(os.environ, {'SCREEPS_TOKEN': '', 'SCREEPS_SHARD': 'shard3'}):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                code = diagnose.main([])
        self.assertEqual(code, 2)
        self.assertIn('MISSING_SCREEPS_TOKEN', output.getvalue())

    def test_auth_failure_does_not_print_response_or_token(self):
        class Rejected:
            def open(self, request, timeout):
                raise urllib.error.HTTPError(request.full_url, 403, 'secret response', {}, io.BytesIO(b'secret response'))
        result = diagnose.live_capture(diagnose.Client('secret response', 'shard3', opener=Rejected()))
        rendered = json.dumps(result)
        self.assertNotIn('secret response', rendered)
        self.assertEqual(result['errors'][0]['code'], 'ENDPOINT_PERMISSION_DENIED')

    def test_gzip_plain_and_malformed_memory(self):
        expected = {'tasks': {'a': {'status': 'waiting'}}}
        data = json.dumps(expected)
        self.assertEqual(diagnose.decode_memory('gz:' + base64.b64encode(gzip.compress(data.encode())).decode()), expected)
        self.assertEqual(diagnose.decode_memory(data), expected)
        with self.assertRaises(diagnose.DiagnosticError):
            diagnose.decode_memory('gz:broken')

    def test_server_code_is_hashed_not_executed(self):
        self.assertEqual(diagnose.fingerprint({'main': 'a\r\nb'}), diagnose.fingerprint({'main': 'a\nb'}))
        self.assertNotEqual(diagnose.fingerprint({'main': 'a'}), diagnose.fingerprint({'main': 'b'}))

    def test_real_console_evidence_has_no_invented_active_branch(self):
        fixtures = [json.loads((ROOT / 'tests' / 'fixtures' / f'pioneer-console-{tick}.json').read_text())
                    for tick in [84190457, 84190469]]
        result = diagnose.build_report(fixtures)
        self.assertIsNone(result['activeCode']['branch'])
        self.assertEqual(result['facts']['homePopulation'], {'workers': 7, 'healthyWorkers': 1, 'healthyWorkParts': 12})
        self.assertEqual(result['facts']['rooms']['E22S37']['sites'][0]['progress'], 0)
        self.assertIn('OWNED_ROOM_WITHOUT_SPAWN_OR_PIONEER', [c['code'] for c in result['checks']])
        self.assertEqual(result['sources'][0]['tick'], 84190457)
        self.assertEqual(result['sources'][1]['tick'], 84190469)

    def test_old_memory_alone_cannot_prove_live_pioneer_count(self):
        result = diagnose.build_report([{'expansion': {'tasks': {'E22S36:E22S37': {'state': 'BUILD_SPAWN'}}}}])
        self.assertNotIn('pioneers', result['facts'])
        self.assertTrue(any('Pioneer count' in unknown for unknown in result['unknown']))

    def test_stale_observation_and_wrong_active_branch_are_reported(self):
        result = diagnose.build_report([{'serverTick': 500, 'activeCode': {'branch': 'default', 'matchesExpectedBranch': False},
            'expansion': {'observation': {'schema': 1, 'tick': 100, 'buildId': 'old', 'rooms': {}, 'creeps': []}}}])
        codes = [c['code'] for c in result['checks']]
        self.assertIn('STALE_RUNTIME_OBSERVATION', codes)
        self.assertIn('UNEXPECTED_ACTIVE_CODE_BRANCH', codes)

    def test_secret_redaction(self):
        rendered = json.dumps(diagnose.sanitize({'token': 'value', 'Cookie': 'value', 'message': 'X-Token: sensitive Bearer hidden'}, 'sensitive'))
        self.assertNotIn('sensitive', rendered)
        self.assertNotIn('hidden', rendered)
        self.assertNotIn('value', rendered)

    def test_redirect_and_write_endpoint_refused(self):
        client = diagnose.Client('never-print', 'shard3', opener=FakeOpener())
        with self.assertRaises(diagnose.DiagnosticError):
            client.get('/api/user/set-active-branch')
        with self.assertRaises(diagnose.DiagnosticError):
            diagnose.NoRedirect().redirect_request(type('R', (), {'full_url': 'https://screeps.com/api/user/code'})(), None, 302, '', {}, 'https://other.invalid')

    def test_task_error_and_build_mismatch_are_not_silent(self):
        result = diagnose.build_report([{'activeCode': {'branch': 'agent-test', 'buildId': 'new'},
            'expansion': {'tasks': {'E22S36:E22S37': {'lastError': {'tick': 1, 'reason': 'bad route'}}},
                          'observation': {'schema': 1, 'tick': 10, 'buildId': 'old', 'rooms': {}, 'creeps': []}}}])
        codes = [c['code'] for c in result['checks']]
        self.assertIn('TASK_EXCEPTION_RECORDED', codes)
        self.assertIn('ACTIVE_BUILD_NOT_OBSERVED_IN_RUNTIME', codes)

    def test_network_and_invalid_json_clear_errors(self):
        class NetworkFailure:
            def open(self, request, timeout):
                raise urllib.error.URLError('sensitive diagnostic data')
        result = diagnose.live_capture(diagnose.Client('sensitive', 'shard3', opener=NetworkFailure()))
        self.assertTrue(all(e['code'] == 'NETWORK_OR_TIMEOUT' for e in result['errors']))
        self.assertNotIn('sensitive', json.dumps(result))
        class InvalidJson:
            def open(self, request, timeout):
                reply = Reply({})
                reply.body = b'<html>not JSON</html>'
                return reply
        invalid = diagnose.live_capture(diagnose.Client('sensitive', 'shard3', opener=InvalidJson()))
        self.assertTrue(all(e['code'] == 'INVALID_JSON_RESPONSE' for e in invalid['errors']))
        with self.assertRaises(diagnose.DiagnosticError):
            diagnose.build_report([{'shard': 'shard2'}, {'shard': 'shard3'}])

    def test_cli_fixture_alert_exit_code(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = diagnose.main(['--snapshot', str(ROOT / 'tests/fixtures/pioneer-console-84190457.json'), '--fail-on-alert'])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(output.getvalue())['facts']['pioneers'], [])


if __name__ == '__main__':
    unittest.main()
