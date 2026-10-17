import assert from 'node:assert/strict';
import candidate from './production-entry-candidate.js';

const url='https://nsk-api.invalid';
const request=(path,method='GET')=>new Request(url+path,{method});
const noPersonalBinding={};
let result=await candidate.fetch(request('/api/personal/spelare?team_id=18'),noPersonalBinding,{});
assert.equal(result.status,503,'Personal reads fail closed without AUTH_DB');
result=await candidate.fetch(request('/api/personal/spelare?team_id=18','POST'),noPersonalBinding,{});
assert.equal(result.status,405,'Personal write routes are disabled');
result=await candidate.fetch(request('/api/personal/unknown'),noPersonalBinding,{});
assert.equal(result.status,404,'Unrecognized personal path is denied');

const oldFetch=globalThis.fetch;
let calls=0;
globalThis.fetch=async requestUrl=>{
  assert.match(String(requestUrl), /^https:\/\/api\.baserow\.io\/api\/database\/rows\/table\/1255083\//);
  calls++;
  return Response.json({results:[]});
};
try {
  result=await candidate.fetch(request('/health'),{BASEROW_TOKEN:'mock-only'},{});
  assert.equal(result.status,200,'Existing health route remains available');
  const health=await result.json();
  assert.equal(health.ok,true,'Existing health shape retained');
  assert.equal(calls,1,'Legacy health still invokes its database dependency');
} finally {
  globalThis.fetch=oldFetch;
}
console.log('PASS migration entrypoint: legacy health preserved, personal endpoint fail closed');
