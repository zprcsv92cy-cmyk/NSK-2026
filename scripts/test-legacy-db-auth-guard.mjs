import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../worker/legacy-db-auth-guard.js', import.meta.url), 'utf8');
const { createAuthorizedLegacyDb } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const oldFetch = globalThis.fetch;
let reads = 0, permitted = true;
globalThis.fetch = async () => new Response(JSON.stringify({team_id:'NSK Team 18',allowed:false}), {status:permitted?200:403});
try {
 const db = {listPlayers: async () => {reads++; return [{id:473,full_name:'Test'}]},listCoaches:async()=>[{id:12}],listStaff:async()=>[{id:87}]};
 const guarded = createAuthorizedLegacyDb({legacyDb:db,teamId:'NSK Team 18',token:'test-token'});
 assert.equal((await guarded.listPlayers())[0].id,473);
 assert.equal((await guarded.listCoaches())[0].id,12);
 assert.equal((await guarded.listStaff('leader'))[0].id,87);
 assert.equal(guarded.addPlayer,undefined);
 permitted=false;
 await assert.rejects(guarded.listPlayers());
 assert.equal(reads,1);
 console.log('PASS: behörighetskontroll, ID:n och skrivspärr (simulerade data)');
} finally {globalThis.fetch=oldFetch}
