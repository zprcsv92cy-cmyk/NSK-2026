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

test('identical concurrent reads share one upstream request with independent response bodies',async()=>{
 let calls=0,release;const gate=new Promise(r=>release=r),fetcher=async()=>{calls++;await gate;return Response.json({results:[{id:1}]});};
 const options={fetcher};const a=fetchBaserowRead(url,{headers:{Authorization:'Token A'}},options),b=fetchBaserowRead(url,{headers:{Authorization:'Token A'}},options);assert.equal(calls,1);release();
 const responses=await Promise.all([a,b]);assert.deepEqual(await responses[0].json(),await responses[1].json());await fetchBaserowRead(url,{headers:{Authorization:'Token A'}},options);assert.equal(calls,2);
});
test('different upstream credentials never share a read',async()=>{
 let calls=0,release;const gate=new Promise(r=>release=r),fetcher=async()=>{calls++;await gate;return Response.json({results:[]});};
 const a=fetchBaserowRead(url,{headers:{Authorization:'Token A'}},{fetcher}),b=fetchBaserowRead(url,{headers:{Authorization:'Token B'}},{fetcher});assert.equal(calls,2);release();await Promise.all([a,b]);
});
test('shared read bounds buffered data and clears failed in-flight entries',async()=>{
 let calls=0,cancelled=false;
 const fetcher=async()=>++calls===1?new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(8*1024*1024+1));},cancel(){cancelled=true;}})):Response.json({results:[]});
 await assert.rejects(fetchBaserowRead(url,{}, {fetcher}),/exceeds shared read limit/);
 assert.equal(cancelled,true);assert.equal((await fetchBaserowRead(url,{}, {fetcher})).status,200);assert.equal(calls,2);
});
test('caller abort signals keep independent upstream requests',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response('ok');};
 await Promise.all([fetchBaserowRead(url,{signal:new AbortController().signal},{fetcher}),fetchBaserowRead(url,{signal:new AbortController().signal},{fetcher})]);assert.equal(calls,2);
});
