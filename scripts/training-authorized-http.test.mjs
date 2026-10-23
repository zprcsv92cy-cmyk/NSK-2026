import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingHandler} from '../worker/training-sessions-api.js';

const token='a'.repeat(40);
const teams=[{id:18,Namn:'Synthetic Team A','Säsong':'2026'},{id:19,Namn:'Synthetic Team B','Säsong':'2026'}];
const players=()=>({selected:['101'],selectedCoaches:['201'],goalies:[],goalieCount:0,allocation:[['101']],revision:0});
function fixture(){
 const rows=new Map();
 let actor='leader-a';
 const db={prepare(sql){
  let params=[];
  const statement={
   bind(...values){params=values;return statement;},
   async first(){
    if(sql.includes('FROM auth_sessions'))return {id:actor,display_name:actor,is_global_admin:0};
    if(sql.includes('FROM training_sessions')){
     const r=rows.get(params.join('|'));return r||null;
    }
    throw Error('Unexpected query: '+sql);
   },
   async all(){
    if(sql.includes('FROM auth_team_memberships'))return {results:[{team_id:actor==='outsider'?'Synthetic Team B':'Synthetic Team A',role:'team_admin'}]};
    if(sql.includes('FROM auth_user_permissions'))return {results:[{permission:'read'},{permission:'lineup:edit'}]};
    if(sql.includes('SELECT training_date'))return {results:[...rows.values()].filter(r=>r.team_id===params[0])};
    throw Error('Unexpected query: '+sql);
   },
   async run(){
    if(sql.startsWith('INSERT INTO training_sessions')){
     const [team,date,selected,coaches,goalies,goalieCount,allocation,updatedBy]=params;
     const key=team+'|'+date;if(rows.has(key))return {meta:{changes:0}};
     rows.set(key,{team_id:team,training_date:date,selected_players_json:selected,selected_coaches_json:coaches,goalies_json:goalies,goalie_count:goalieCount,allocation_json:allocation,revision:1,updated_by:updatedBy});
     return {meta:{changes:1}};
    }
    if(sql.startsWith('UPDATE training_sessions')){
     const [selected,coaches,goalies,goalieCount,allocation,updatedBy,team,date,revision]=params;
     const key=team+'|'+date,r=rows.get(key);
     if(!r||r.revision!==revision)return {meta:{changes:0}};
     Object.assign(r,{selected_players_json:selected,selected_coaches_json:coaches,goalies_json:goalies,goalie_count:goalieCount,allocation_json:allocation,updated_by:updatedBy,revision:revision+1});
     return {meta:{changes:1}};
    }
    throw Error('Unexpected write: '+sql);
   }
  };return statement;}};
 return {handler:createTrainingHandler({AUTH_DB:db},async()=>teams),setActor:x=>actor=x,rows};
}
function req(method,team,date,body){
 return new Request('https://isolated.example/api/training?team_id='+team+(date?'&date='+date:''),{
 method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})
 });
}
test('two synthetic authorized leaders can create, read, update and list one team training',async()=>{
 const f=fixture(),date='2026-10-23';
 let r=await f.handler(req('PUT',18,date,players()));assert.equal(r.status,200);assert.equal((await r.json()).revision,1);
 f.setActor('leader-b');
 r=await f.handler(req('GET',18,date));assert.equal(r.status,200);assert.deepEqual((await r.json()).session.selected,['101']);
 r=await f.handler(req('PUT',18,date,{...players(),selected:['102'],allocation:[['102']],revision:1}));
 assert.equal(r.status,200);assert.equal((await r.json()).revision,2);
 r=await f.handler(req('GET',18));assert.equal(r.status,200);assert.deepEqual((await r.json()).sessions,[{date,players:1,coaches:1}]);
 r=await f.handler(req('PUT',18,date,{...players(),revision:1}));assert.equal(r.status,409);
});
test('team outsider cannot read or write another team training',async()=>{
 const f=fixture();f.setActor('outsider');
 assert.equal((await f.handler(req('GET',18,'2026-10-23'))).status,403);
 assert.equal((await f.handler(req('PUT',18,'2026-10-23',players()))).status,403);
 assert.equal(f.rows.size,0);
});
