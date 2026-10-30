import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentsPage } from './AgentsPage';
import { controlsFor, responseFor, sortJobs, type AgentInteraction, type AgentJob, type AgentService } from '../lib/agents';

const idle = new Promise<never>(() => {});
const service = { list: () => idle, get: () => idle, events: () => idle } as unknown as AgentService;
const job = (id: string, status: AgentJob['status'], updated: string): AgentJob => ({ task_id: id, status, version: 1, objective: id, progress: null, outcome: null, error: null, created_at: updated, updated_at: updated });

it('opens with a New agent button and no dialog', () => {
  const html = renderToStaticMarkup(<AgentsPage service={service} />);
  expect(html).toContain('New agent');
  expect(html).not.toContain('role="dialog"');
});

it('puts agents that need the user first, finished ones last', () => {
  const sorted = sortJobs([job('done', 'completed', '2026-10-30T10:00:00Z'), job('busy', 'running', '2026-10-30T09:00:00Z'), job('ask', 'waiting_approval', '2026-10-30T08:00:00Z')]);
  expect(sorted.map(j => j.task_id)).toEqual(['ask', 'busy', 'done']);
});

it('offers only controls that fit the state', () => {
  expect(controlsFor('running')).toEqual(['pause', 'cancel']);
  expect(controlsFor('paused')).toEqual(['resume', 'cancel']);
  expect(controlsFor('failed')).toEqual(['retry']);
  expect(controlsFor('completed')).toEqual([]);
});

it('builds the service response for a question and for a review', () => {
  const question = { kind: 'clarification', payload: { fields: [{ field: 'topic' }] } } as unknown as AgentInteraction;
  const review = { kind: 'approval', payload: {} } as unknown as AgentInteraction;
  expect(responseFor(question, { kind: 'text', text: ' pgvector ' })).toEqual({ answer: { topic: 'pgvector' } });
  expect(responseFor(review, { kind: 'approve' })).toEqual({ decision: 'approve' });
  expect(responseFor(review, { kind: 'text', text: 'shorter' })).toEqual({ decision: 'request_changes', feedback: 'shorter' });
});
