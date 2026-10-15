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
