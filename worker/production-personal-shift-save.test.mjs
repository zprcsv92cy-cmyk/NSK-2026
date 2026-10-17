import assert from 'node:assert/strict';
import {handlePersonalShiftSave} from './production-personal-shift-save.js';
import {PersonalShiftSaveLock} from './production-personal-shift-lock.js';
const token='A'.repeat(43),root='https://test.invalid';
const payload={team_id:'18',pool_id:100,lag_no:1,match_no:1,
 shifts:[{period_no:1,time_left:'12:00',players:[1]}]};
const req=(p=payload,auth=token)=>new Request(root+'/api/personal/bytesschema/save',{
 method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},
 body:JSON.stringify(p)});
const tables={1255083:[{id:18,Namn:'NSK Team 18','Säsong':'2026'},
 {id:27,Namn:'NSK Testlag 2','Säsong':'2026'}],
 1255098:[{id:1,Lag:[18]},{id:2,Lag:[27]}],1255115:[]};
const original=globalThis.fetch;
let writes=0,forwarded=0,lock;
const env={BASEROW_TOKEN:'mock',AUTH_DB:{prepare:sql=>({bind:()=>({
 first:async()=>({id:'u',display_name:'Coach'}),
 all:async()=>({results:sql.includes('auth_team_memberships')?
 [{team_id:'NSK Team 18',role:'team_admin'}]:[{permission:'shifts:check'}]})
})})}};
env.SHIFT_SAVE_LOCK={idFromName:s=>s,get:key=>({fetch:async(_url,options)=>{
 forwarded++;assert.equal(key,'100:1:1');
 return lock.fetch(new Request('https://lock.invalid/',options));
}})};
globalThis.fetch=async (resource,options={})=>{
 const s=String(resource),table=Number(/\/table\/(\d+)\//.exec(s)?.[1]);
 if(table===1255101)return Response.json({id:100,Lag:[18],'Antal lag':2,'Antal matcher':3,Perioder:2});
 if(options.method==='POST'||options.method==='PATCH'){writes++;return Response.json({id:99});}
 if(tables[table])return Response.json({results:tables[table],next:null});
 throw Error('Unexpected upstream '+s);
};
try{
 lock=new PersonalShiftSaveLock({},env);
 let r=await handlePersonalShiftSave(req(),env);
 assert.equal(r.status,200);assert.equal(writes,1);
 r=await handlePersonalShiftSave(req({...payload,team_id:'27'}),env);
 assert.equal(r.status,403);assert.equal(writes,1);
 r=await handlePersonalShiftSave(req({...payload,shifts:[{period_no:1,time_left:'12:00',players:[2]}]}),env);
 assert.equal(r.status,403);assert.equal(writes,1);
 r=await handlePersonalShiftSave(req(payload,null),env);
 assert.equal(r.status,401);assert.equal(writes,1);
 r=await lock.fetch(new Request('https://lock.invalid/',{method:'POST',
 body:JSON.stringify({...payload,team_id:27})}));
 assert.equal(r.status,403);assert.equal(writes,1);
 r=await handlePersonalShiftSave(req(),{AUTH_DB:env.AUTH_DB,BASEROW_TOKEN:'mock'});
 assert.equal(r.status,503);assert.equal(writes,1);
 assert.equal(forwarded,2);
 console.log('PASS authorized multi-team shift save; foreign team/player denied');
}finally{globalThis.fetch=original;}
