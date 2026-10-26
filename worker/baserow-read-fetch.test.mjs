import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchBaserowRead} from './baserow-read-fetch.js';
const url='https://api.baserow.io/api/database/rows/table/123/';
test('transient Baserow GET retries once and succeeds without exposing data in logs',async()=>{
 let calls=0;const logs=[],delays=[];
 const r=await fetchBaserowRead(url,{headers:{Authorization:'Token secret'}},{fetcher:async()=>++calls===1?new Response('unavailable',{status:503}):Response.json({results:[]}),wait:async n=>delays.push(n),log:e=>logs.push(e)});
 assert.equal(r.status,200);assert.equal(calls,2);assert.deepEqual(delays,[300]);assert.deepEqual(logs,[{event:'baserow_read_failure',status:503,attempt:1}]);
});
test('network read failure gets one retry',async()=>{
 let calls=0;const r=await fetchBaserowRead(url,{}, {fetcher:async()=>{if(++calls===1)throw Error('network');return new Response('ok');},wait:async()=>{},log:()=>{}});assert.equal(r.status,200);assert.equal(calls,2);
});
for(const [name,target,init,status] of [['write',url,{method:'POST'},503],['other provider','https://example.com/',{},503],['denied read',url,{},403],['long cooldown',url,{},429]])test(name+' is never retried',async()=>{
 let calls=0;const r=await fetchBaserowRead(target,init,{fetcher:async()=>{calls++;return new Response('failed',{status,headers:{'Retry-After':'60'}});},wait:async()=>assert.fail('unexpected wait'),log:()=>{}});assert.equal(r.status,status);assert.equal(calls,1);
});
test('repeated outage fails after two reads',async()=>{let calls=0;const r=await fetchBaserowRead(url,{}, {fetcher:async()=>{calls++;return new Response('failed',{status:502});},wait:async()=>{},log:()=>{}});assert.equal(r.status,502);assert.equal(calls,2);});
