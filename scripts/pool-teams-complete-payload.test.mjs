import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../db.js',import.meta.url),'utf8');
const config={REQUIRE_PERSONAL_POOL_WRITES:true,REQUIRE_SCOPED_ROSTER_READS:true,REQUIRE_SCOPED_COLLECTION_READS:true,REQUIRE_SCOPED_TEAM_READS:true};
test('updatePoolTeams sends complete payload without changing other pool settings',async()=>{
  const calls=[];
  const pool={id:42,title:'Testpool',place:'Södertälje',hall:'Hall A',pool_date:'2026-11-01',active:true,teams:2,matches:3,players_on_field:5,periods:2,period_time:15,sub_time:120};
  const app={APP_CONFIG:config,Auth:{getToken:()=> 'test-token',activeTeam:()=> 'NSK Team 18'},addEventListener:()=>{}};
  const sandbox={window:app,fetch:async(url,opts)=>{
    calls.push({url,opts});
    if(url.includes('/api/lag?'))return {ok:true,json:async()=>({ok:true,results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}],next:null})};
    if(url.includes('/api/poolspel?'))return {ok:true,json:async()=>({ok:true,results:[{id:42,Lag:[{id:18}],Namn:pool.title,Plats:pool.place,Ishall:pool.hall,Datum:pool.pool_date,Status:'Aktiv','Antal lag':pool.teams,'Antal matcher':pool.matches,'Spelare på plan':pool.players_on_field,Perioder:pool.periods,Periodtid:pool.period_time,Bytestid:pool.sub_time}],next:null})};
    if(url.endsWith('/api/poolspel/42'))return {ok:true,json:async()=>({ok:true,row:{id:42}})};
    throw Error('Unexpected URL '+url);
  },localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},console};
  vm.runInNewContext(source,sandbox);
  await app.DB.updatePoolTeams(42,4);
  const write=calls.find(x=>x.opts?.method==='PATCH');
  assert.ok(write,'expected PATCH request');
  const body=JSON.parse(write.opts.body);
  for(const k of ['title','place','hall','pool_date','status','teams','matches','players_on_field','periods','period_time','sub_time'])assert.ok(Object.hasOwn(body,k),'missing '+k);
  assert.equal(body.teams,4);
  assert.equal(body.matches,3);
  assert.equal(body.title,'Testpool');
});
