from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from cortex_agent_api.native_agent import NativeAgents
from cortex_agent_api.schemas import CreateTaskRequest

TARGET = {
    'app_path': '/Applications/Google Chrome.app', 'pid': 675,
    'launch_timestamp': 1234.5, 'window_id': 207, 'window_title': 'Origin A',
    'tab_hash': 123456, 'captured_at': 5678.9,
}


def test_native_task_requires_saved_origin_and_single_runner():
    for body in [
        {'workflow': 'agent', 'use_native_window': True},
        {'use_native_window': True, 'origin_target': TARGET},
        {'workflow': 'agent', 'use_native_window': True, 'use_browser_tab': True, 'origin_target': TARGET},
        {'workflow': 'agent', 'use_native_window': True, 'origin_target': {**TARGET, 'window_id': 0}},
        {'workflow': 'agent', 'use_native_window': True, 'origin_target': {**TARGET, 'launch_timestamp': float('nan')}},
    ]:
        with pytest.raises(ValidationError):
            CreateTaskRequest(task='Fill this form', **body)
    request = CreateTaskRequest(task='Fill this form', workflow='agent', use_native_window=True, origin_target=TARGET)
    assert request.origin_target.model_dump() == TARGET


class DB:
    def __init__(self):
        self.task = {'status': 'queued', 'version': 1, 'progress': {}}
        self.events = []

    async def get_task(self, _):
        return self.task

    async def set_task_state(self, _, status, progress, **fields):
        self.task.update(status=status, progress=progress, **fields)
        return self.task

    async def append_event(self, _, kind, data):
        self.events.append((kind, data))


@pytest.mark.asyncio
@pytest.mark.parametrize('blocked', [False, True])
async def test_native_adapter_preserves_origin_and_reports_scope_block(tmp_path, monkeypatch, blocked):
    trial = tmp_path / 'fork'
    (trial / '.build').mkdir(parents=True)
    (trial / '.build/sentient-native-trial').touch()
    (trial / 'run.py').write_text('''import argparse,json
p=argparse.ArgumentParser();p.add_argument('--task-file');p.add_argument('--origin-file');p.add_argument('--service',action='store_true');p.add_argument('--timeout');a=p.parse_args()
target=json.load(open(a.origin_file));assert target['window_id']==207 and target['tab_hash']==123456
assert open(a.task_file).read()=='Use original A'
print(json.dumps({'event':'tool','tool':'set_value','status':'failed' if BLOCKED else 'completed','origin_blocked':BLOCKED}),flush=True)
print(json.dumps({'event':'result','exit_code':0,'response':'STATUS: DONE'}),flush=True)
'''.replace('BLOCKED', repr(blocked)))
    monkeypatch.setenv('CORTEX_SENTIENT_TRIAL_DIR', str(trial))
    settings = SimpleNamespace(workspace_root=tmp_path / 'tasks')
    (settings.workspace_root / 'one').mkdir(parents=True)
    db = DB()
    runner = NativeAgents(settings, db)
    payload = {'task': 'Use original A', 'origin_target': TARGET, 'limits': {'max_active_seconds': 120}}
    runner.start('one', payload)
    await runner.runs['one']['task']
    assert json.loads((settings.workspace_root / 'one/origin-target.json').read_text()) == TARGET
    assert db.task['status'] == ('failed' if blocked else 'completed')
    assert db.task['progress']['runner'] == 'sentient_native'
    if blocked:
        assert 'originating window/tab changed' in db.task['error']['message']
        assert not any(kind == 'task_completed' for kind, _ in db.events)
    assert runner.runs['one']['process'].returncode == 0


@pytest.mark.parametrize('task', [
    'oepn top 5 emails from grok for daily startup hiring in new tabs use this window',
    'Open the top five emails',
    'Fill this form',
    'Hello',
])
def test_native_mode_is_explicit_and_independent_of_prompt_wording(task):
    request = CreateTaskRequest(task=task, workflow='agent', use_native_window=True, origin_target=TARGET)
    assert request.use_native_window is True
    assert request.origin_target.model_dump() == TARGET
