import assert from 'node:assert/strict';
import {protectedLegacyWrite} from '../worker/protected-legacy-write.js';
const url='https://example.invalid/api/spelare';
const request=()=>new Request(url,{method:'POST'});
const admin={memberships:[{team_id:'team-a',role:'team_admin'}],permissions:['roster:manage']};
let writes=0;
const handleWrite=async()=>{writes++;return new Response('saved',{status:201})};
const args={authenticate:async()=>admin,resolveTeamId:async()=> 'team-a',handleWrite};
assert.equal((await protectedLegacyWrite(request(),args)).status,201);
assert.equal(writes,1);
const denialCases=[
 {...args,authenticate:async()=>null},
 {...args,authenticate:async()=>{throw Error('auth down')}},
 {...args,resolveTeamId:async()=> 'team-b'},
 {...args,resolveTeamId:async()=>{throw Error('db down')}},
 {...args,resolveTeamId:async()=>null},
 {...args,authenticate:async()=>({...admin,permissions:[]})},
 {...args,authenticate:async()=>({...admin,memberships:[{team_id:'team-a',role:'viewer'}]})},
 {...args,handleWrite:null}
];
for(const entry of denialCases){
 const result=await protectedLegacyWrite(request(),entry);
 assert.notEqual(result.status,201);
 assert.equal(writes,1,'Denied request must never call write handler');
}
const unsupported=new Request(url,{method:'DELETE'});
assert.equal((await protectedLegacyWrite(unsupported,args)).status,405);
assert.equal(writes,1);
console.log('PASS protected migration gateway prevents unauthorized legacy writes');

const poolUrl='https://example.invalid/api/poolspel/2/aktiv';
const poolRequest=active=>new Request(poolUrl,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({active})});
const finishOnly={...admin,permissions:['pool:finish']};
const finishArgs={...args,authenticate:async()=>finishOnly};
assert.equal((await protectedLegacyWrite(poolRequest(false),finishArgs)).status,201);
const afterFinish=writes;
assert.equal((await protectedLegacyWrite(poolRequest(true),finishArgs)).status,403);
assert.equal(writes,afterFinish,'Reopening cannot use finish permission');
assert.equal((await protectedLegacyWrite(poolRequest('false'),finishArgs)).status,400);
assert.equal(writes,afterFinish,'Invalid pool status must not write');
console.log('PASS pool finish/reopen gateway permissions');

const poolEditRequest=new Request('https://example.invalid/api/poolspel/2',{method:'PATCH'});
const poolCreateOnly={...admin,permissions:['pool:create']};
const beforePoolEdit=writes;
assert.equal((await protectedLegacyWrite(poolEditRequest,{...args,authenticate:async()=>poolCreateOnly})).status,403);
assert.equal(writes,beforePoolEdit,'Pool creator cannot update existing match data');
const matchEditor={...admin,permissions:['match:manage']};
assert.equal((await protectedLegacyWrite(poolEditRequest,{...args,authenticate:async()=>matchEditor})).status,201);
const afterPoolEdit=writes;
assert.equal((await protectedLegacyWrite(poolEditRequest,{...args,authenticate:async()=>matchEditor,resolveTeamId:async()=> 'team-b'})).status,403);
assert.equal(writes,afterPoolEdit,'Cross-team pool updates must never reach write handler');
console.log('PASS pool updates require match permission and matching team');
