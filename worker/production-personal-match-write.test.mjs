import assert from 'node:assert/strict';
import {handlePersonalMatchConfigWrite as write} from './production-personal-match-write.js';
import candidate from './production-entry-candidate.js';
const token='A'.repeat(43),base='https://nsk-api.invalid';
const body={team_id:'18',pool_id:100,lag_no:1,match_no:1,start_time:'13:00',
  opponent:'Test',plan:'1',player_count:5,goalie_player_id:1,players_on_field:[1,2]};
const req=(method,data=body,row='',auth=token)=>new Request(base+'/api/personal/matchkonfiguration'+row,{
  method,headers:{'Content-Type':'application/json',Origin:'https://zprcsv92cy-cmyk.github.io',
    ...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(data)});
const env={BASEROW_TOKEN:'test',AUTH_DB:{prepare:sql=>({bind:()=>({
  first:async()=>({id:'u',display_name:'Admin'}),
  all:async()=>({results:sql.includes('auth_team_memberships')?
    [{team_id:'NSK Team 18',role:'team_admin'}]:[{permission:'match:manage'}]})
})})}};
let writes=0,lastPayload=null;
const original=globalThis.fetch;
globalThis.fetch=async (resource,options={})=>{
  const s=String(resource),table=Number(/\/table\/(\d+)\//.exec(s)?.[1]);
  if(table===1255083)return Response.json({results:[
    {id:18,Namn:'NSK Team 18','Säsong':'2026'},
    {id:27,Namn:'NSK Testlag 2','Säsong':'2026'}],next:null});
  if(table===1255101)return Response.json({id:100,Lag:[18],'Antal lag':2,'Antal matcher':3});
  if(table===1255098)return Response.json({results:[
    {id:1,Lag:[18]},{id:2,Lag:[{id:18}]},{id:3,Lag:[27]}],next:null});
  if(table===1255157){
    if(!options.method||options.method==='GET')
      return Response.json({id:88,Poolspel:[100],Lagnummer:1,Matchnummer:1});
    writes++;
    lastPayload=JSON.parse(options.body);
    return Response.json({id:88,...lastPayload},{status:options.method==='POST'?201:200});
  }
  throw Error('Unexpected source '+s);
};
try{
  let r=await write(req('POST'),env);
  assert.equal(r.status,201);
  assert.equal(writes,1);
  assert.deepEqual(lastPayload['Spelare på plan'],[1,2]);
  r=await write(req('PATCH',body,'/88'),env);
  assert.equal(r.status,200);
  assert.equal(writes,2);
  r=await write(req('POST',{...body,team_id:'27'}),env);
  assert.equal(r.status,403);
  r=await write(req('POST',{...body,players_on_field:[1,3]}),env);
  assert.equal(r.status,403);
  r=await write(req('POST',{...body,goalie_player_id_typo:1}),env);
  assert.equal(r.status,400);
  r=await write(req('POST',body,'',null),env);
  assert.equal(r.status,401);
  assert.equal(writes,2,'No unauthorized writes');
  r=await candidate.fetch(req('POST'),env,{});
  assert.equal(r.status,201);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://zprcsv92cy-cmyk.github.io');
  console.log('PASS personally scoped match configuration writes');
}finally{globalThis.fetch=original;}
