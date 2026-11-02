"""Process adapter for the standalone Sentient fork; the fork owns the agent/tool loop."""
from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
from pathlib import Path

from .database import ConflictError


class NativeAgents:
    def __init__(self, settings, db):
        self.settings, self.db = settings, db
        default = Path(__file__).resolve().parents[5] / 'cortex-sentient-trial' / 'CortexTrial'
        self.root = Path(os.environ.get('CORTEX_SENTIENT_TRIAL_DIR', str(default)))
        self.runs = {}

    def owns(self, task_id):
        return task_id in self.runs

    def assert_available(self):
        if not (self.root / 'run.py').is_file() or not (self.root / '.build/sentient-native-trial').is_file():
            raise ConflictError('Build the standalone Sentient native trial before using this window.')

    def start(self, task_id, payload):
        run = {'payload': payload, 'process': None}
        self.runs[task_id] = run
        run['task'] = asyncio.create_task(self.run(task_id, run), name=f'native-job-{task_id}')

    async def state(self, task_id, status, **fields):
        current = await self.db.get_task(task_id)
        progress = {**(current['progress'] if current else {}), 'runner': 'sentient_native', 'stage': status}
        return await self.db.set_task_state(task_id, status, progress, **fields)

    async def run(self, task_id, run):
        payload = run['payload']
        process = None
        try:
            self.assert_available()
            workspace = self.settings.workspace_root / task_id
            origin_file = workspace / 'origin-target.json'
            origin_file.write_text(json.dumps(payload['origin_target']))
            origin_file.chmod(0o600)
            task = payload['task']
            if payload.get('supporting_documents'):
                task += '\n\nUser-supplied documents:\n' + '\n\n'.join(d['content'] for d in payload['supporting_documents'])
            task_file = workspace / 'native-task.txt'
            task_file.write_text(task)
            task_file.chmod(0o600)
            await self.state(task_id, 'running')
            # No shell interpretation, model loop, or submission-time target resolution here.
            process = await asyncio.create_subprocess_exec(
                sys.executable, str(self.root / 'run.py'), '--task-file', str(task_file),
                '--origin-file', str(origin_file), '--service',
                '--timeout', str(payload['limits']['max_active_seconds']),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
            )
            run['process'] = process
            async def errors():
                tail = bytearray()
                while chunk := await process.stderr.read(4096):
                    tail.extend(chunk)
                    if len(tail) > 4096:
                        del tail[:-4096]
                return tail.decode(errors='replace')
            error_task = asyncio.create_task(errors())
            outcome = None
            blocked = False
            async for line in process.stdout:
                try:
                    event = json.loads(line)
                except (ValueError, UnicodeDecodeError):
                    continue
                if event.get('event') == 'tool':
                    blocked = blocked or event.get('origin_blocked', False)
                    await self.db.append_event(task_id, 'agent_step', {
                        'action': str(event.get('tool', 'native action'))[:80],
                        'status': str(event.get('status', ''))[:30],
                    })
                elif event.get('event') == 'result':
                    outcome = event
            code = await process.wait()
            detail = await error_task
            if blocked:
                raise RuntimeError('The originating window/tab changed. The native task stopped without selecting another target. Restore it and explicitly retry if appropriate.')
            if code or not outcome or outcome.get('exit_code'):
                raise RuntimeError(detail[-1500:] or 'The native task ended before confirming completion.')
            response = outcome.get('response', '')
            # Native failures must not become a successful task just because the CLI exited cleanly.
            if 'STATUS: DONE' not in response or 'STATUS: COULD_NOT' in response:
                raise RuntimeError(response or 'The native agent did not confirm completion.')
            await self.state(task_id, 'completed', outcome={'response': response})
            await self.db.append_event(task_id, 'task_completed', {})
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - isolate a native process failure to its task
            current = await self.db.get_task(task_id)
            if current and current['status'] not in {'cancelled', 'completed'}:
                await self.state(task_id, 'failed', error={'code': 'native_agent', 'message': str(exc)[:2000]})
        finally:
            if process and process.returncode is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    await asyncio.wait_for(process.wait(), 15)
                except TimeoutError:
                    os.killpg(process.pid, signal.SIGKILL)
                    await process.wait()

    async def control(self, task_id, action, version):
        run = self.runs[task_id]
        if action == 'retry':
            current = await self.db.get_task(task_id)
            if not current or current['version'] != version or current['status'] != 'failed':
                raise ConflictError('Only the current failed native task can be retried.')
            await self.state(task_id, 'queued')
            self.start(task_id, run['payload'])  # Same immutable origin, never a new current window.
        elif action == 'cancel':
            await self.db.pause_or_control(task_id, version, 'cancel')
            run['task'].cancel()
            await asyncio.gather(run['task'], return_exceptions=True)
        else:
            raise ConflictError('The native trial supports Stop and Retry; pause/resume is not available yet.')
        task = await self.db.get_task(task_id)
        return {'task_id': task_id, 'status': task['status'], 'version': task['version'], 'queued_segment_id': None}

    async def message(self, task_id, text):
        raise ConflictError('Stop this native trial before starting a revised request. Its original window/tab binding cannot be changed.')

    async def respond(self, task_id, interaction_id, response):
        raise ConflictError('This native trial does not have a pending interactive question.')

    async def close(self):
        tasks = [run['task'] for run in self.runs.values() if not run['task'].done()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
