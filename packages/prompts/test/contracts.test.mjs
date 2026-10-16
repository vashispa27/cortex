import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest, validateOutput, buildPrompt } from '../index.mjs';

test('requires explicit cloud consent', () => assert.throws(() => validateRequest('answer', { text: 'Where?' }), { code: 'consent_required' }));
test('rejects invented source IDs', () => assert.throws(() => validateOutput('answer', { evidence: [{ id: 'real' }] }, { answer: 'Yes', evidence_ids: ['invented'], uncertainties: [] }), { code: 'ungrounded_source' }));
test('prompt labels evidence as untrusted and is versioned', () => {
  const prompt = buildPrompt('answer', { cloud_consent: true, text: 'When?', evidence: [{ id: 's1', text: 'Monday' }] });
  assert.match(prompt.system, /untrusted data/);
  assert.match(prompt.version, /^\d{4}-/);
});
test('abstains without a cited source and rejects invented dates', () => {
  const request = { evidence: [{ id: 's1', text: 'Review is Friday.' }] };
  assert.match(validateOutput('answer', request, { answer: 'Definitely Tuesday.', evidence_ids: [], uncertainties: [] }).answer, /couldn't find enough evidence/);
  assert.throws(() => validateOutput('answer', request, { answer: 'Review is Tuesday.', evidence_ids: ['s1'], uncertainties: [] }), { code: 'ungrounded_fact' });
});
