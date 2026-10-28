import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { transcriptRecords } from './workspace.js';

test('oversized unicode transcript events reconstruct losslessly and retry with identical sequences', () => {
  const value = {role:'tool', content:'🪷\n\\"'.repeat(18000)};
  const raw = JSON.stringify(value);
  const records = transcriptRecords([raw]);
  assert.ok(records.length > 1);
  assert.deepEqual(records, transcriptRecords([raw]));
  assert.ok(records.every(line => Buffer.byteLength(line) < 28_000));
  const joined = records.map(line => JSON.parse(line).text).join('');
  assert.deepEqual(JSON.parse(joined), value);
});
