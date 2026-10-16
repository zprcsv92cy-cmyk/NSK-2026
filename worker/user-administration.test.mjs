import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { handleTeamAuth } from './team-auth.js';

test('user administration rejects requests without login', async () => {
  let databaseCalls = 0;
  const env = {
    AUTH_DB: {
      prepare() {
        databaseCalls++;
        throw new Error('Database must not be accessed');
      }
    }
  };

  const request = new Request('https://example.test/api/auth/users');
  const response = await handleTeamAuth(request, env);

  assert.equal(response.status, 403);
  assert.equal(databaseCalls, 0);
});

test('user administration rejects permission changes without login', async () => {
  let databaseCalls = 0;
  const env = {
    AUTH_DB: {
      prepare() {
        databaseCalls++;
        throw new Error('Database must not be accessed');
      }
    }
  };

  const request = new Request(
    'https://example.test/api/auth/users/00000000-0000-4000-8000-000000000001/permissions',
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ permissions: ['users:manage'] })
    }
  );

  const response = await handleTeamAuth(request, env);
  assert.equal(response.status, 403);
  assert.equal(databaseCalls, 0);
});

test('administrator cannot remove own administration permission', async () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const token = 'a'.repeat(32);
  let writes = 0;

  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('FROM auth_sessions')) {
                return { id: userId, display_name: 'Test Admin' };
              }
              if (sql.includes('SELECT id FROM auth_users')) {
                return { id: userId };
              }
              return null;
            },
            async all() {
              if (sql.includes('auth_user_permissions')) {
                return { results: [{ permission: 'users:manage' }] };
              }
              return { results: [] };
            },
            async run() {
              writes++;
            }
          };
        }
      };
    },
    async batch() {
      writes++;
    }
  };

  const request = new Request(
    `https://example.test/api/auth/users/${userId}/permissions`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ permissions: ['read'] })
    }
  );

  const response = await handleTeamAuth(request, { AUTH_DB: db });
  const result = await response.json();

  assert.equal(response.status, 400);
  assert.match(result.error, /egen användaradministration/);
  assert.equal(writes, 0);
});

test('cannot remove permission from the last active administrator', async () => {
  const actorId = '00000000-0000-4000-8000-000000000001';
  const targetId = '00000000-0000-4000-8000-000000000002';
  let writes = 0;

  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('FROM auth_sessions')) {
                return { id: actorId, display_name: 'Test Admin' };
              }
              if (sql.includes('SELECT id FROM auth_users')) {
                return { id: targetId };
              }
              if (sql.includes('SELECT disabled FROM auth_users')) {
                return { disabled: 0 };
              }
              if (sql.includes('SELECT 1 AS allowed')) {
                return { allowed: 1 };
              }
              return null;
            },
            async all() {
              if (sql.includes('auth_user_permissions')) {
                return { results: [{ permission: 'users:manage' }] };
              }
              return { results: [] };
            }
          };
        },
        async first() {
          if (sql.includes('count(*)')) return { n: 1 };
          return null;
        }
      };
    },
    async batch() {
      writes++;
    }
  };

  const request = new Request(
    `https://example.test/api/auth/users/${targetId}/permissions`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${'a'.repeat(32)}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ permissions: ['read'] })
    }
  );

  const response = await handleTeamAuth(request, { AUTH_DB: db });
  const result = await response.json();

  assert.equal(response.status, 400);
  assert.match(result.error, /Sista aktiva administratörens behörighet/);
  assert.equal(writes, 0);
});
