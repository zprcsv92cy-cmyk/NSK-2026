import assert from 'node:assert/strict';
import {PersonalShiftSaveLock} from './production-personal-shift-lock.js';

const env={BASEROW_TOKEN:'test'};
const lock=new PersonalShiftSaveLock({},env);
const original=globalThis.fetch;
const shifts=[{id:7,Poolspel:[100],Lagnummer:1,Matchnummer:1,
  Bytenummer:1,Periodnummer:1,'Tid kvar':'12:00','Spelare på plan':[1],
  'Genomfört':false}];
let active=0,maxActive=0,patched=0;
globalThis.fetch=async(resource,options={})=>{
 const s=String(resource);
 if(s.includes('/1255101/100/'))return Response.json({id:100,Lag:[18],
   'Antal lag':2,'Antal matcher':3,Perioder:2});
 if(s.includes('/1255083/'))return Response.json({results:[
   {id:18,Namn:'NSK Team 18','Säsong':'2026'}],next:null});
 if(s.includes('/1255098/'))return Response.json({results:[{id:1,Lag:[18]}],next:null});
 if(s.includes('/1255115/7/')&&!options.method)return Response.json({...shifts[0]});
 if(s.includes('/1255115/')&&options.method==='PATCH'){
   active++;maxActive=Math.max(active,maxActive);
   await new Promise(resolve=>setTimeout(resolve,5));
   patched++;shifts[0]['Genomfört']=JSON.parse(options.body)['Genomfört'];
   active--;return Response.json({...shifts[0]});
 }
 if(s.includes('/1255115/'))return Response.json({results:shifts.map(x=>({...x})),next:null});
 throw Error('Unexpected fetch '+s);
};
const request=body=>new Request('https://internal.invalid/',{
 method:'POST',body:JSON.stringify(body)});
try{
 const done={action:'done',team_id:18,id:7,pool_id:100,lag_no:1,match_no:1,done:true};
 const save={action:'save',team_id:18,pool_id:100,lag_no:1,match_no:1,
   shifts:[{period_no:1,time_left:'12:00',players:[1]}]};
 const a=lock.fetch(request(done));
 const b=lock.fetch(request(save));
 const [r1,r2]=await Promise.all([a,b]);
 assert.equal(r1.status,200);
 assert.equal(r2.status,200,'Save must accept unchanged completed shift');
 assert.equal(patched,1);
 assert.equal(maxActive,1,'Lock must serialize Baserow writes');
 const foreign=await lock.fetch(request({...done,team_id:27,done:false}));
 assert.equal(foreign.status,403);
 assert.equal(patched,1,'Foreign team cannot uncheck shift');
 console.log('PASS save + done share serialized ownership-checked lock');
}finally{globalThis.fetch=original;}
