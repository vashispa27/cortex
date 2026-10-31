import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentsPage } from './AgentsPage';
import { agentErrorText } from './AgentChatCard';
import { controlsFor, documentFrom, followUpAgent, isTextDocument, responseFor, sortJobs, type AgentInteraction, type AgentJob, type AgentService } from '../lib/agents';

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

it('refuses screenshots and other binary files as attachments', () => {
  expect(() => documentFrom('Screenshot.png', '\uFFFDPNG\u0000garbage', 'image/png')).toThrow("isn't a text file");
  expect(isTextDocument('notes.txt', '\u0000\u0001binary')).toBe(false);
  expect(documentFrom('resume.md', '# Resume', 'text/markdown').name).toBe('resume.md');
});

it('sends what you type in an agent chat to the agent', async () => {
  const sent: unknown[] = [];
  const asking = (status: AgentJob['status'], pending?: Partial<AgentInteraction>): AgentService => ({
    get: async () => ({ ...job('a', status, '2026-10-30T10:00:00Z'), pending_interaction: pending ? { id: 'i', state: 'pending', operation: 'x', payload: {}, preview: { markdown: 'Which date?' }, ...pending } as AgentInteraction : null }),
    respond: async (_job: AgentJob, response: unknown) => { sent.push(['respond', response]); },
    message: async (_job: AgentJob, text: string) => { sent.push(['message', text]); },
  }) as unknown as AgentService;
  expect(await followUpAgent(asking('waiting_input', { kind: 'clarification', payload: { fields: [{ field: 'date' }] } }), 'a', '24 Nov')).toEqual({ result: 'answered', asked: 'Which date?' });
  expect(await followUpAgent(asking('waiting_approval', { kind: 'approval' }), 'a', 'yes')).toMatchObject({ result: 'answered' });
  expect(await followUpAgent(asking('waiting_approval', { kind: 'approval' }), 'a', 'use economy')).toMatchObject({ result: 'answered' });
  expect(await followUpAgent(asking('paused'), 'a', 'cheapest')).toEqual({ result: 'continued' });
  expect(await followUpAgent(asking('running'), 'a', 'also check prices')).toEqual({ result: 'continued' });
  expect(await followUpAgent(asking('waiting_event'), 'a', 'hi')).toEqual({ result: 'busy' });
  expect(await followUpAgent(asking('completed'), 'a', 'thanks')).toEqual({ result: 'finished' });
  expect(sent).toEqual([['respond', { answer: { date: '24 Nov' } }], ['respond', { decision: 'approve' }], ['respond', { decision: 'request_changes', feedback: 'use economy' }], ['message', 'cheapest'], ['message', 'also check prices']]);
});

it('explains provider failures instead of showing raw errors', () => {
  const failed = (message: string) => ({ ...job('f', 'failed', '2026-10-30T10:00:00Z'), error: { message } });
  expect(agentErrorText(failed("Error code: 402 - {'error': {'message': 'This request would exceed your available credits'}}"))).toContain('Add credits');
  expect(agentErrorText(failed('Error code: 429 - rate limit'))).toContain('Wait a minute');
});
