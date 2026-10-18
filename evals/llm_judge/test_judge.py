import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import judge


def choice(value):
    return {'type': 'choice', 'choice': value, 'confidence': .8, 'probabilities': {value: .8}}


def reply(evidence='sufficient', quality='A', behavior='answered'):
    return {'model': 'typesafe/jev-1.14-pinned', 'answers': {'evidence': choice(evidence), 'quality': choice(quality), 'behavior': choice(behavior)}, 'usage': {'input_tokens': 99, 'cost': .0001}}


def sample():
    return {'id': 'q1', 'type': 'keyword', 'split': 'dev', 'retrieval_abstained': False,
            'prepared': {'messages': [{'role': 'system', 'content': 'system'}, {'role': 'user', 'content': 'Question: What?\nEvidence: Source #1 The value is 42.'}], 'sources': [{'id': 1, 'text': 'The value is 42.'}], 'prompt_hash': '123'},
            'fact_state': [{'retrieved': True, 'lost_to_redaction': False}], 'raw_answer': '42 [1]', 'provider_error': None, 'validation_error': None}


def gold(absent=False):
    return {'id': 'q1', 'type': 'keyword', 'query': 'What?', 'expect_abstain': absent, 'relevant': [] if absent else [{'fixture': 'x', 'answer_text': 'The value is 42.'}]}


class JudgeTests(unittest.TestCase):
    def test_grade_a_b_c_and_refusal(self):
        for label in 'ABC':
            got = judge.interpret(sample(), gold(), reply(quality=label))
            self.assertEqual(got['grade'], label)
        self.assertEqual(judge.interpret(sample(), gold(True), reply(evidence='not_applicable', behavior='refused'))['grade'], 'A')

    def test_d_preserves_distinction_between_refusal_and_guess(self):
        a = judge.interpret(sample(), gold(), reply(evidence='insufficient', quality='A', behavior='refused'))
        b = judge.interpret(sample(), gold(), reply(evidence='insufficient', quality='C', behavior='answered'))
        self.assertEqual(a['grade'], 'D')
        self.assertEqual(b['grade'], 'D')
        self.assertNotEqual(a['answer_behavior']['choice'], b['answer_behavior']['choice'])

    def test_absent_gold_cannot_be_classified_as_missing_retrieval(self):
        with self.assertRaises(ValueError):
            judge.interpret(sample(), gold(True), reply(evidence='insufficient'))
        self.assertEqual(judge.retrieval_only(sample(), gold(True))['grade'], 'A')
        self.assertEqual(judge.retrieval_only(sample(), gold())['grade'], 'D')

    def test_judge_gets_actual_sent_evidence_and_expected_answer(self):
        rec = sample()
        payload = judge.payload_for(rec, gold(), 'typesafe/jev-1.14')
        self.assertEqual(payload['state']['question_and_evidence_sent_to_answer_model'], rec['prepared']['messages'][1]['content'])
        self.assertEqual(payload['state']['expected_facts'], ['The value is 42.'])
        self.assertIn('untrusted', payload['questions']['quality']['instructions'])
        self.assertIn('untrusted', payload['questions']['evidence']['instructions'])
        self.assertNotIn('api_key', json.dumps(payload).lower())

    def test_malformed_response_is_not_a_grade(self):
        for payload in ({}, {'answers': {}}, {'answers': {'evidence': choice('missing')}}):
            with self.assertRaises(ValueError):
                judge.interpret(sample(), gold(), payload)

    def test_verify_entire_prepared_object_not_just_untrusted_hash(self):
        r = sample(); report = {'mode': 'live', 'records': [r]}
        ref = {'mode': 'mock_pipeline_verification_not_model_quality', 'records': [copy.deepcopy(r)]}
        judge.check_inputs(report, ref, {'q1': gold()})
        report['records'][0]['prepared']['sources'][0]['text'] = 'private substitution'
        with self.assertRaises(ValueError):
            judge.check_inputs(report, ref, {'q1': gold()})

    def test_errors_and_rejected_responses_are_separate(self):
        records = [{'result': {'grade': 'A'}, 'answer_validation_error': 'invalid'},
                   {'error': 'provider failed', 'error_stage': 'answer_provider'},
                   {'error': 'judge failed', 'error_stage': 'judge'}]
        result = judge.summary(records, 3)
        self.assertEqual(result['graded'], 1)
        self.assertEqual(result['ungraded_provider_or_judge_errors'], 2)
        self.assertEqual(result['invalid_answer_fallbacks'], 1)
        self.assertEqual(result['grades_with_valid_citations_or_retrieval_refusal']['A'], 0)

    def test_live_required_before_provider_calls(self):
        with patch.object(judge, 'post_decision') as provider:
            with self.assertRaises(SystemExit):
                judge.main(['--answers', 'unused.json'])
            provider.assert_not_called()

    def test_full_script_with_scripted_provider(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / 'target/debug/open-memory'
            binary.parent.mkdir(parents=True)
            binary.touch()
            rec = sample()
            answer_path = root / 'evals/answers/out/answers.json'
            answer_path.parent.mkdir(parents=True)
            answer_path.write_text(json.dumps({'mode': 'live', 'records': [rec]}))
            ref = {'mode': 'mock_pipeline_verification_not_model_quality', 'records': [copy.deepcopy(rec)]}
            def fake_subprocess(args, **kwargs):
                Path(args[args.index('--out') + 1]).write_text(json.dumps(ref))
            output = root / 'judge-output.json'
            with patch.object(judge, 'ROOT', root), patch.object(judge, 'OUT', root / 'out'), \
                 patch.object(judge, 'verify_frozen'), patch.object(judge, 'read_gold', return_value={'q1': gold()}), \
                 patch.object(judge.subprocess, 'run', side_effect=fake_subprocess), \
                 patch.object(judge, 'post_decision', return_value=reply()), \
                 patch.dict(judge.os.environ, {'OPENROUTER_API_KEY': 'test-key'}):
                self.assertEqual(judge.main(['--live', '--answers', str(answer_path), '--out', str(output)]), 0)
            report = json.loads(output.read_text())
            self.assertEqual(report['summary']['grades']['A']['count'], 1)
            self.assertEqual(report['records'][0]['result']['grade'], 'A')
            self.assertNotIn('test-key', output.read_text())

    def test_provider_request_schema_and_failure_do_not_leak_key(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): return json.dumps(reply()).encode()
        key = 'unit-test-secret'
        with patch('urllib.request.urlopen', return_value=Response()) as urlopen:
            result = judge.post_decision(judge.payload_for(sample(), gold(), 'typesafe/jev-1.14'), key)
            request = urlopen.call_args.args[0]
            self.assertEqual(request.full_url, judge.DECISIONS_URL)
            self.assertEqual(json.loads(request.data)['questions']['quality']['type'], 'choice')
            self.assertEqual(result['answers']['quality']['choice'], 'A')
        with patch('urllib.request.urlopen', side_effect=judge.urllib.error.HTTPError(judge.DECISIONS_URL, 401, key, {}, None)):
            with self.assertRaises(RuntimeError) as err:
                judge.post_decision({}, key)
            self.assertNotIn(key, str(err.exception))


if __name__ == '__main__':
    unittest.main()
