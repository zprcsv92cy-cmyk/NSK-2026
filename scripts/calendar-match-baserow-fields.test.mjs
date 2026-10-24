import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const worker = readFileSync(new URL('../worker/production-api-v42-reference.js',import.meta.url),'utf8');

test('schedule-only Baserow payload uses the exact Motståndare field',()=>{
  const start = worker.indexOf('const schedulePayload =');
  assert.ok(start >= 0,'schedule-only payload must exist');
  const end = worker.indexOf('const saved =',start);
  assert.ok(end > start,'schedule-only write must exist');
  const snippet = worker.slice(start,end);
  assert.ok(snippet.includes('"Motståndare":body.opponent.trim()'));
  assert.ok(!snippet.includes('Motst\\\\xE5ndare'),'literal escaped field names are invalid');
});
