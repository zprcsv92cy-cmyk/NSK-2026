import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/production-entry.js';
import {fixture} from './helpers/auth-d1-fixture.mjs';
const login=(f,email)=>worker.fetch(new Request('https://auth.test/api/auth/login',{method:'POST',headers:{Origin:'https://zprcsv92cy-cmyk.github.io','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({email,password:'Synthetic invalid password'})}),f.env);
test('concurrent login attempts enforce the per-email limit and store only hashed rate keys',async t=>{
 const f=await fixture(t),email='missing@example.invalid';const results=await Promise.all(Array.from({length:11},()=>login(f,email)));
 assert.equal(results.filter(r=>r.status===401).length,10);assert.equal(results.filter(r=>r.status===429).length,1);
 const rows=(await f.db.prepare('SELECT rate_key FROM auth_account_rate_limits').all()).results;
 assert.equal(rows.length,2);assert(rows.every(r=>/^[a-f0-9]{64}$/.test(r.rate_key)));assert.equal((await f.db.prepare('SELECT count(*) AS n FROM auth_sessions').first()).n,3);
});
test('changing email addresses cannot bypass the per-IP login limit',async t=>{
 const f=await fixture(t),statuses=[];for(let i=0;i<31;i++)statuses.push((await login(f,`missing-${i}@example.invalid`)).status);
 assert.equal(statuses.filter(s=>s===401).length,30);assert.equal(statuses.at(-1),429);
});
