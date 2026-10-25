import { describe, expect, it, vi } from 'vitest';
import { finishAction, newSession, appendMessage } from './cortex';
import { runChatAction, type IntentServices } from './intent';
import type { Schedule } from './schedules';

const schedule: Schedule = { id: 's1', revision: 3, status: 'active', title: 'Call mom', timezone: 'UTC', timing: { type: 'daily', time: '10:00' }, action: { type: 'reminder', message: 'Call mom' }, next_due_ms: 1, created_ms: 1, updated_ms: 1 };
function services() {
  return {
    schedules: { get: vi.fn().mockResolvedValue(schedule), cancel: vi.fn().mockResolvedValue({ ...schedule, status: 'cancelled' }), list: vi.fn().mockResolvedValue({ items: [schedule], total: 1, next_offset: null }), update: vi.fn() },
    memories: { delete: vi.fn().mockResolvedValue({ id: 'f1', deleted: true, deleted_ms: 1 }), recall: vi.fn() },
    answer: vi.fn(), newId: () => 'id',
  } as unknown as IntentServices & { schedules: { cancel: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }; memories: { delete: ReturnType<typeof vi.fn> } };
}

describe('chat actions', () => {
  it('Undo on a reminder cancels the current revision of that schedule', async () => {
    const svc = services();
    const result = await runChatAction({ kind: 'undo_schedule', label: 'Undo', scheduleId: 's1' }, [], svc);
    expect(svc.schedules.get).toHaveBeenCalledWith('s1');
    expect(svc.schedules.cancel).toHaveBeenCalledWith(schedule);
    expect(result.body).toBe('Undone: cancelled “Call mom”.');
  });
  it('Undo on a new fact deletes it by id and the revision it was saved at', async () => {
    const svc = services();
    expect((await runChatAction({ kind: 'undo_fact', label: 'Undo', factId: 'f1', revision: 1 }, [], svc)).body).toContain('deleted');
    expect(svc.memories.delete).toHaveBeenCalledWith({ id: 'f1', revision: 1 });
  });
  it('a stale Undo surfaces the revision conflict instead of reporting success', async () => {
    const svc = services();
    svc.memories.delete.mockRejectedValue(new Error('revision conflict'));
    await expect(runChatAction({ kind: 'undo_fact', label: 'Undo', factId: 'f1', revision: 1 }, [], svc)).rejects.toThrow('revision conflict');
  });
  it('Cancel changes nothing; Confirm runs the stored intent as confirmed', async () => {
    const svc = services();
    expect((await runChatAction({ kind: 'dismiss', label: 'Cancel' }, [], svc)).body).toBe('Okay, nothing was changed.');
    expect(svc.schedules.cancel).not.toHaveBeenCalled();
    await runChatAction({ kind: 'confirm', label: 'Confirm', intent: { type: 'schedule_manage', operation: 'cancel', selector: 's1' } }, [], svc);
    expect(svc.schedules.cancel).toHaveBeenCalledWith(schedule);
  });
  it('finishing an action removes the buttons from their message so they cannot run twice', () => {
    const asked = appendMessage(newSession('cancel it'), { role: 'assistant', body: 'Cancel?', actions: [{ kind: 'dismiss', label: 'Cancel' }], pendingIntent: { type: 'decision', draft: {} } });
    const done = finishAction(asked, 1, { role: 'assistant', body: 'Done' });
    expect(done.messages[1]).not.toHaveProperty('actions', expect.anything());
    expect(done.messages[1].pendingIntent).toBeUndefined();
    expect(done.messages.at(-1)?.body).toBe('Done');
  });
});
