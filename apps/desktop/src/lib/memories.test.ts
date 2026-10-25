import { expect, it } from 'vitest';
import { createMemoryService, type PersonalFact, type MemoryTransport } from './memories';
it('exposes personal recall and revision-checked mutations through the shared workspace API', async () => {
  const calls: unknown[] = [];
  const request: MemoryTransport = async <T>(operation: string, body: unknown) => { calls.push({ operation, body }); return {} as T; };
  const service = createMemoryService(request);
  const input = { subject: 'Invented Mira', attribute: 'email', value: 'mira@example.invalid', source: 'invented test', channel: 'chat' as const };
  const fact = { ...input, id: 'fact', revision: 2 } as PersonalFact;
  await service.remember(input); await service.recall('Mira email'); await service.update(fact, input); await service.delete(fact);
  expect(calls).toEqual([
    { operation: 'remember_fact', body: input },
    { operation: 'recall_facts', body: { query: 'Mira email', limit: 20 } },
    { operation: 'update_fact', body: { ...input, fact_id: 'fact', expected_revision: 2 } },
    { operation: 'delete_fact', body: { fact_id: 'fact', expected_revision: 2 } },
  ]);
});
