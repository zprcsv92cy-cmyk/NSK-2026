import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchBaserowRead } from './baserow-read-fetch.js';

const url = 'https://api.baserow.io/api/database/rows/table/123/';

test('503 GET retries once and succeeds', async () => {
  let calls = 0;
  const logs = [];
  const delays = [];

  const response = await fetchBaserowRead(url, {}, {
    fetcher: async () =>
      ++calls === 1
        ? new Response('unavailable', { status: 503 })
        : Response.json({ results: [] }),
    wait: async ms => delays.push(ms),
    log: event => logs.push(event)
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [300]);
  assert.deepEqual(logs, [{
    event: 'baserow_read_failure',
    status: 503,
    attempt: 1
  }]);
});

test('network failure retries once', async () => {
  let calls = 0;

  const response = await fetchBaserowRead(url, {}, {
    fetcher: async () => {
      if (++calls === 1) throw Error('network');
      return new Response('ok');
    },
    wait: async () => {},
    log: () => {}
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('POST writes are never retried', async () => {
  let calls = 0;

  const response = await fetchBaserowRead(
    url,
    { method: 'POST' },
    {
      fetcher: async () => {
        calls++;
        return new Response('failed', { status: 503 });
      },
      wait: async () => assert.fail('Unexpected retry')
    }
  );

  assert.equal(response.status, 503);
  assert.equal(calls, 1);
});

test('other providers are never retried', async () => {
  let calls = 0;

  const response = await fetchBaserowRead(
    'https://example.com/',
    {},
    {
      fetcher: async () => {
        calls++;
        return new Response('failed', { status: 503 });
      }
    }
  );

  assert.equal(response.status, 503);
  assert.equal(calls, 1);
});

test('403 errors are not retried', async () => {
  let calls = 0;

  const response = await fetchBaserowRead(url, {}, {
    fetcher: async () => {
      calls++;
      return new Response('denied', { status: 403 });
    },
    log: () => {}
  });

  assert.equal(response.status, 403);
  assert.equal(calls, 1);
});

test('long Retry-After is respected', async () => {
  let calls = 0;

  const response = await fetchBaserowRead(url, {}, {
    fetcher: async () => {
      calls++;
      return new Response('busy', {
        status: 429,
        headers: { 'Retry-After': '60' }
      });
    },
    wait: async () => assert.fail('Unexpected wait'),
    log: () => {}
  });

  assert.equal(response.status, 429);
  assert.equal(calls, 1);
});

test('repeated 502 errors stop after two attempts', async () => {
  let calls = 0;

  const response = await fetchBaserowRead(url, {}, {
    fetcher: async () => {
      calls++;
      return new Response('failed', { status: 502 });
    },
    wait: async () => {},
    log: () => {}
  });

  assert.equal(response.status, 502);
  assert.equal(calls, 2);
});

test('identical concurrent reads stay independent', async () => {
  let calls = 0;
  let release;

  const gate = new Promise(resolve => { release = resolve; });
  const fetcher = async () => {
    calls++;
    await gate;
    return Response.json({ results: [{ id: 1 }] });
  };

  const options = { fetcher };
  const first = fetchBaserowRead(url, {}, options);
  const second = fetchBaserowRead(url, {}, options);

  assert.equal(calls, 2);
  release();

  const responses = await Promise.all([first, second]);
  assert.deepEqual(
    await responses[0].json(),
    await responses[1].json()
  );
});

test('different credentials stay independent', async () => {
  let calls = 0;

  const fetcher = async () => {
    calls++;
    return Response.json({ results: [] });
  };

  await Promise.all([
    fetchBaserowRead(url, {
      headers: { Authorization: 'Token A' }
    }, { fetcher }),
    fetchBaserowRead(url, {
      headers: { Authorization: 'Token B' }
    }, { fetcher })
  ]);

  assert.equal(calls, 2);
});

test('abort signals do not share requests', async () => {
  let calls = 0;

  const fetcher = async () => {
    calls++;
    return new Response('ok');
  };

  await Promise.all([
    fetchBaserowRead(url, {
      signal: new AbortController().signal
    }, { fetcher }),
    fetchBaserowRead(url, {
      signal: new AbortController().signal
    }, { fetcher })
  ]);

  assert.equal(calls, 2);
});

test('large responses are returned without shared buffering', async () => {
  const body = 'x'.repeat(8 * 1024 * 1024 + 1);

  const response = await fetchBaserowRead(url, {}, {
    fetcher: async () => new Response(body)
  });

  assert.equal((await response.text()).length, body.length);
});
