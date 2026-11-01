import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './production-api-v42-reference.js';

const origin = 'https://zprcsv92cy-cmyk.github.io';
const env = { NSK_REQUIRE_SCOPED_COLLECTION_READS: 'true' };
const request = (path, headers = {}) => new Request('https://nsk-api.example.test' + path, {
  headers: { Origin: origin, ...headers }
});

test('real Worker route rejects unauthenticated scoped collection reads before Baserow', async () => {
  for (const table of ['poolspel','matchkonfiguration','laguppstallningar','bytesschema']) {
    const response = await worker.fetch(request('/api/' + table + '?team_id=11'), env);
    assert.equal(response.status, 401, table);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  }
});

test('real Worker route rejects duplicate and missing team selectors', async () => {
  for (const path of ['/api/poolspel', '/api/poolspel?team_id=11&team_id=22']) {
    const response = await worker.fetch(request(path, {
      Authorization: 'Bearer ' + 'a'.repeat(64)
    }), env);
    assert.equal(response.status, 400, path);
  }
});

test('real Worker route rejects missing personal session dependencies without leaking data', async () => {
  const response = await worker.fetch(request('/api/poolspel?team_id=11', {
    Authorization: 'Bearer ' + 'a'.repeat(64)
  }), env);
  assert.equal(response.status, 401);
});

test('authorization header routes through guard even when rollout flag is off', async () => {
  const response = await worker.fetch(request('/api/poolspel?team_id=11', {
    Authorization: 'Bearer ' + 'a'.repeat(64)
  }), {});
  assert.equal(response.status, 401);
});

test('real Worker verifies D1 session and isolates shared-pool rows end-to-end', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const token = 'b'.repeat(64);
  const rows = {
    1255083: [{id:11,Namn:'NSK Team 18','Säsong':'2026'}, {id:22,Namn:'NSK Testlag 2','Säsong':'2026'}],
    1255101: [{id:103,Lag:[{id:11},{id:22}],'Antal lag':2}],
    1255157: [{id:303,Poolspel:[{id:103}],Lagnummer:1}, {id:304,Poolspel:[{id:103}],Lagnummer:2}],
    1255113: [{id:403,Poolspel:[{id:103}],Matchkonfiguration:[{id:303}]},
      {id:404,Poolspel:[{id:103}],Matchkonfiguration:[{id:304}]}],
    1255115: [{id:503,Poolspel:[{id:103}],Lagnummer:1},
      {id:504,Poolspel:[{id:103}],Lagnummer:2}]
  };
  let networkReads = 0;
  globalThis.fetch = async (url, init) => {
    networkReads++;
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.baserow.io');
    assert.equal(init.headers.Authorization, 'Token test-token');
    const id = Number(parsed.pathname.match(/\/table\/(\d+)\//)?.[1]);
    assert.ok(Object.hasOwn(rows,id), 'unexpected Baserow table');
    return Response.json({results:rows[id],next:null});
  };
  const authDb = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              assert.match(sql, /auth_sessions/);
              assert.equal(args[0].length,64);
              return {id:'u1',display_name:'Coach',is_global_admin:0};
            },
            async all() {
              if (sql.includes('auth_team_memberships'))
                return {results:[{team_id:'NSK Team 18',role:'coach'}]};
              if (sql.includes('auth_user_permissions'))
                return {results:[{permission:'read'}]};
              throw Error('Unexpected D1 query');
            }
          };
        }
      };
    }
  };
  try {
    for (const [table,expected] of [
      ['poolspel',[103]],['matchkonfiguration',[303]],
      ['laguppstallningar',[403]],['bytesschema',[503]]
    ]) {
      const response = await worker.fetch(request('/api/'+table+'?team_id=11',{
        Authorization:'Bearer '+token
      }),{...env,BASEROW_TOKEN:'test-token',AUTH_DB:authDb});
      assert.equal(response.status,200,table);
      assert.deepEqual((await response.json()).results.map(r=>r.id),expected,table);
    }
    assert.ok(networkReads > 0);
    const denied = await worker.fetch(request('/api/poolspel?team_id=22',{
      Authorization:'Bearer '+token
    }),{...env,BASEROW_TOKEN:'test-token',AUTH_DB:authDb});
    assert.equal(denied.status,403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for(const next of ['http://api.baserow.io/api/database/rows/table/1255115/?page=2','?page=2','https://untrusted.example/never-follow?token=private'])
 test('paginated shift read uses fixed HTTPS origin and own page counter: '+next.split('?')[0],{concurrency:false},async()=>{
  const previous=globalThis.fetch,calls=[];
  const authDb={prepare(sql){return {bind(){return {async first(){return {id:'u1',display_name:'Fixture',is_global_admin:0};},async all(){return {results:sql.includes('auth_team_memberships')?[{team_id:'NSK Team 18',role:'coach'}]:[{permission:'read'}]};}};}};}};
  globalThis.fetch=async(input,init)=>{
   const u=new URL(input);calls.push(u.href);
   assert.equal(u.origin,'https://api.baserow.io');assert.equal(init.headers.Authorization,'Token fixture');
   const id=Number(u.pathname.match(/\/table\/(\d+)\//)?.[1]),page=Number(u.searchParams.get('page'));
   if(id===1255083)return Response.json({results:[{id:11,Namn:'NSK Team 18','Säsong':'2026'}],next:null});
   if(id===1255101)return Response.json({results:[{id:103,Lag:[{id:11}],'Antal lag':1}],next:null});
   assert.equal(id,1255115);assert.ok(page===1||page===2);
   return Response.json({results:Array.from({length:page===1?200:1},(_,i)=>({id:(page-1)*200+i+1,Poolspel:[{id:103}],Lagnummer:1})),next:page===1?next:null});
  };
  try{
   const res=await worker.fetch(request('/api/bytesschema?team_id=11',{Authorization:'Bearer '+'p'.repeat(64)}),{...env,BASEROW_TOKEN:'fixture',AUTH_DB:authDb});
   assert.equal(res.status,200);const rows=(await res.json()).results;assert.equal(rows.length,201);assert.equal(rows.at(-1).id,201);
   const pages=calls.filter(u=>u.includes('/1255115/')).map(u=>new URL(u).searchParams.get('page'));assert.deepEqual(pages,['1','2']);
  }finally{globalThis.fetch=previous;}
 });
