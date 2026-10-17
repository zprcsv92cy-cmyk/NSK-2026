import assert from 'node:assert/strict';
import {handlePersonalLineupWrite} from './production-personal-lineup-write.js';
const token='A'.repeat(43);
const make=(body,t=token)=>new Request('https://test.invalid/api/personal/laguppstallningar/10',{
 method:'POST',headers:{...(t?{Authorization:'Bearer '+t}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)
});
const env={BASEROW_TOKEN:'mock',AUTH_DB:{prepare(sql){return {bind(){return {
 first:async()=>({id:'user',display_name:'Editor'}),
 all:async()=>({results:sql.includes('auth_team_memberships')?
 [{team_id:'NSK Team 18',role:'team_admin'}]:[{permission:'lineup:edit'}]})
};}}}}};
const rows={1255083:[{id:18,Namn:'NSK Team 18','Säsong':'2026'},{id:27,Namn:'NSK Testlag 2','Säsong':'2026'}],
1255098:[{id:1,Lag:[18]},{id:2,Lag:[27]}],1255100:[{id:4,Lag:[18]},{id:5,Lag:[27]}],1255113:[]};
const previous=globalThis.fetch;
let writes=0;
globalThis.fetch=async (resource,options={})=>{
 const url=String(resource);
 const table=Number(/\/table\/(\d+)\//.exec(url)?.[1]);
 if(table===1255157)return Response.json({id:10,Poolspel:[100]});
 if(table===1255101)return Response.json({id:100,Lag:[18]});
 if(options.method){writes++;return Response.json({id:1000+writes});}
 if(!rows[table])throw Error('Unexpected table '+table);
 return Response.json({results:rows[table],next:null});
};
try{
 const body={team_id:'18',players:[1],coaches:[4]};
 let response=await handlePersonalLineupWrite(make(body),env);
 assert.equal(response.status,200);
 assert.equal((await response.json()).count,2);
 assert.equal(writes,2);
 for(const invalid of [{...body,team_id:'27'},{...body,players:[2]},
 {...body,coaches:[5]}]){
  response=await handlePersonalLineupWrite(make(invalid),env);
  assert.equal(response.status,403);
 }
 response=await handlePersonalLineupWrite(make(body,null),env);
 assert.equal(response.status,401);
 response=await handlePersonalLineupWrite(make({...body,players:[1,1]}),env);
 assert.equal(response.status,400);
 assert.equal(writes,2);
 console.log('PASS own-team lineup write and cross-team write denial');
} finally {globalThis.fetch=previous;}
