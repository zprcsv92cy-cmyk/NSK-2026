import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const worker = readFileSync(new URL('../worker/production-api-v42-reference.js',import.meta.url),'utf8');

test('schedule-only Baserow payload uses the exact Motståndare field',()=>{
  const start = worker.indexOf('async scheduleCreate(body)');
  assert.ok(start >= 0,'schedule-only Durable Object method must exist');
  const end = worker.indexOf('async save(body)',start);
  assert.ok(end > start,'schedule-only method must end before shifts save');
  const snippet = worker.slice(start,end);
  assert.ok(snippet.includes('"Motståndare":body.opponent.trim()'));
  assert.ok(!snippet.includes('Motst\\\\xE5ndare'),'literal escaped field names are invalid');
});

test('calendar match create uses the per-match Durable Object lock',()=>{
  assert.ok(worker.includes('if (body?.action === "scheduleCreate") return this.scheduleCreate(body)'));
  assert.ok(worker.includes('env.SHIFT_LOCK.idFromName(`${poolId2}:${lagNo}:${matchNo}`)'));
  assert.ok(worker.includes('action:"scheduleCreate"'));
  assert.ok(worker.includes('if (data.results.some(c=>ids(c.Poolspel).includes(poolId)'));
});

test('calendar pool limits are enforced by the API before any Baserow write',()=>{
  const start=worker.indexOf('if (url.pathname === "/api/poolspel"');
  const end=worker.indexOf('if (url.pathname === "/api/matchkonfiguration"',start);
  assert.ok(start>=0&&end>start);
  const route=worker.slice(start,end);
  const limits=route.indexOf('body.calendar_import_key && (body.teams > 2 || body.matches > 8)');
  const post=route.indexOf('method: req.method');
  assert.ok(limits>=0,'calendar pool must be capped at two teams and eight matches per team');
  assert.ok(post>limits,'server must check the limits before its Baserow write');
});
