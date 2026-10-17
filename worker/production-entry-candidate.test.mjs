import assert from 'node:assert/strict';
import candidate from './production-entry-candidate.js';

const url='https://nsk-api.invalid';
const request=(path,method='GET')=>new Request(url+path,{method});
const noPersonalBinding={};
let result=await candidate.fetch(request('/api/personal/spelare?team_id=18'),noPersonalBinding,{});
assert.equal(result.status,503,'Personal reads fail closed without AUTH_DB');
result=await candidate.fetch(request('/api/personal/spelare?team_id=18','POST'),noPersonalBinding,{});
assert.equal(result.status,503,'Personal write routes fail closed without production AUTH_DB');
result=await candidate.fetch(request('/api/personal/unknown'),noPersonalBinding,{});
assert.equal(result.status,404,'Unrecognized personal path is denied');

for (const path of ['/api/poolspel','/api/bytesschema']) {
  for (const method of ['GET','POST']) {
    result=await candidate.fetch(request(path,method),noPersonalBinding,{});
    assert.equal(result.status,503,`${method} ${path} must fail closed until authorized`);
    assert.equal(result.headers.get('cache-control'),'no-store');
  }
}

for(const path of ['/api/lag','/api/lagpersonal?team_id=18','/api/spelare?team_id=18','/api/tranare?team_id=18']){
  result=await candidate.fetch(request(path),noPersonalBinding,{});
  assert.equal(result.status,503,'Authorized legacy GET must fail closed without AUTH_DB: '+path);
  result=await candidate.fetch(request(path,'POST'),noPersonalBinding,{});
  assert.equal(result.status,503,'Legacy mutations remain disabled: '+path);
}

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
console.log('PASS migration entrypoint: legacy API denied, legacy health preserved, personal endpoint fail closed');
