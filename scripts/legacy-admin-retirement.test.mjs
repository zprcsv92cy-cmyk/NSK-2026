import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import vm from 'node:vm';
import worker from '../worker/production-api-v42-reference.js';
test('production blocks shared admin and match-code login before accessing credentials or storage',async()=>{
 for(const [path,method] of [['/api/admin/login','POST'],['/api/admin/status','GET'],['/api/admin/logout','POST'],['/api/match/login','POST']]){
  const env={NSK_DISABLE_LEGACY_AUTH:'true',ADMIN_KV:{get(){throw Error('Legacy store must not be read');}}};
  const result=await worker.fetch(new Request('https://api.test'+path,{method}),env);
  assert.equal(result.status,410,path);assert.match((await result.json()).error,/personliga NSK/);
 }
});
test('production pages do not load the old admin widget',()=>{
 for(const folder of readdirSync(new URL('../',import.meta.url),{withFileTypes:true}).filter(d=>d.isDirectory())){
  let html;try{html=readFileSync(new URL('../'+folder.name+'/index.html',import.meta.url),'utf8');}catch{continue;}
  assert.doesNotMatch(html,/src="[^\"]*admin-mode\.js/,folder.name);
 }
 assert.match(readFileSync(new URL('../app.js',import.meta.url),'utf8'),/data-delete-pool="\$\{poolId\}"/);
});
test('team count updates preserve pool rules and use personal authorization',async()=>{
 const requests=[];const raw={id:9,Lag:[1],Namn:'Poolspel',Plats:'Eskilstuna',Ishall:'Smehallen',Datum:'2026-11-08','Antal lag':1,'Antal matcher':4,'Spelare på plan':3,Perioder:1,Periodtid:15,Bytestid:90};
 const window={APP_CONFIG:{API_URL:'https://api.test',REQUIRE_PERSONAL_POOL_WRITES:true,REQUIRE_SCOPED_COLLECTION_READS:true},Auth:{getToken:()=> 'personal',activeTeam:()=> 'NSK Team 18'}};
 const fetch=async(url,init)=>{requests.push({url,init});return {ok:true,json:async()=>init.method==='PATCH'?{ok:true,row:raw}:{ok:true,results:url.includes('/api/lag?')?[{id:1,Namn:'NSK Team 18','Säsong':'2026'}]:[raw],next:null}};};
 vm.runInNewContext(readFileSync(new URL('../db.js',import.meta.url),'utf8'),{window,fetch,URLSearchParams,localStorage:{getItem(){throw Error('No admin fallback');}}});
 await window.DB.updatePoolTeams(9,2);const write=requests.find(r=>r.init.method==='PATCH');const data=JSON.parse(write.init.body);
 assert.equal(write.init.headers.Authorization,'Bearer personal');assert.equal(data.teams,2);assert.equal(data.matches,4);assert.equal(data.period_time,15);assert.equal(data.sub_time,90);
});

test('team editor uses the stamped application version instead of a stale fixed cache key',()=>{
 const html=readFileSync(new URL('../lag/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('pool-team-editor.js?v=\' + window.NSK_VERSION'));
 assert.doesNotMatch(html,/pool-team-editor\.js\?v=1/);
});
