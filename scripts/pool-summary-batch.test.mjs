import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('all pool summaries use one personally scoped match read',async()=>{
 const requests=[];const window={APP_CONFIG:{API_URL:'https://api.test',REQUIRE_SCOPED_COLLECTION_READS:true,REQUIRE_SCOPED_TEAM_READS:true},Auth:{getToken:()=> 'test'}};
 const fetch=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({ok:true,next:null,results:url.includes('/api/lag?')?[{id:1,Namn:'NSK Team 18','Säsong':'2026'}]:[{id:1,Poolspel:[{id:10}],Lagnummer:1,Matchnummer:1,Motståndare:'A'},{id:2,Poolspel:[{id:11}],Lagnummer:1,Matchnummer:1,Motståndare:'B'},{id:3,Poolspel:[{id:999}],Motståndare:'Hidden'}]})};};
 vm.runInNewContext(readFileSync(new URL('../db.js',import.meta.url),'utf8'),{window,fetch,URLSearchParams,console});
 const summaries=await window.DB.listPoolMatchSummaries([10,11,12]);
 assert.equal(requests.filter(r=>r.url.includes('/api/matchkonfiguration?')).length,1);
 assert.ok(requests[1].url.includes('team_id=1'));assert.equal(requests[1].options.headers.Authorization,'Bearer test');
 assert.equal(summaries.get('10')[0].opponent,'A');assert.equal(summaries.get('11')[0].opponent,'B');assert.equal(summaries.get('12').length,0);assert.equal(summaries.has('999'),false);
});
