import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './production-api-v42-reference.js';

for (const table of ['matcher', 'malvaktsstatistik', 'spelaretranare']) {
  test('scoped rollout denies legacy ' + table + ' without Baserow access', async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('unexpected network request'); };
    try {
      const response = await worker.fetch(
        new Request('https://nsk-api.example/api/' + table),
        { NSK_REQUIRE_SCOPED_COLLECTION_READS: 'true' },
        {}
      );
      assert.equal(response.status, 403);
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = original;
    }
  });
}
