import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/auth-d1-fixture.mjs';
import {createTrainingHandler} from '../worker/training-sessions-api.js';
import {withConcurrentResources} from '../worker/concurrent-resources.js';
import {trainingClientFixture} from './helpers/training-client-fixture.mjs';
import {trainingSnapshot} from '../concurrency-merge.mjs';
test('real authenticated training save uses nested revision and calendar reads the saved attendance and colors',async t=>{
 const f=await fixture(t);for(const path of ['20261022_training_sessions.sql','20261023_training_hall_colors.sql'])for(const sql of readFileSync(new URL('../migrations/'+path,import.meta.url),'utf8').split(';').filter(s=>s.trim()))await f.db.prepare(sql).run();
 await f.db.prepare('INSERT INTO auth_user_permissions VALUES(?,?)').bind(f.root,'lineup:edit').run();
 const env={...f.env,NSK_MULTIUSER_ENABLED:'true'},handler=withConcurrentResources(createTrainingHandler(env,async()=>[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]));
 const call=(method,payload)=>handler(new Request('https://test/api/training?team_id=18&date=2026-10-28',{method,headers:{Authorization:'Bearer '+f.tokens.root,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),env);
 const initial={...trainingSnapshot(),selected:['1','2','3'],allocation:[['1'],['2'],['3']]};
 let response=await call('PUT',{...initial,revision:0,base:{session:trainingSnapshot()}});assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).revision,1);
 let read=await(await call('GET')).json();assert.equal(read.revision,undefined);assert.equal(read.session.revision,1);
 const client=trainingClientFixture(read.session,async(_date,payload)=>{const response=await call('PUT',payload);assert.equal(response.status,200,await response.clone().text());return response.json();});
 client.toggle('2',false);await client.api.queue();client.toggle('4',true);await client.api.queue();
 read=await(await call('GET')).json();assert.equal(read.session.revision,3);assert.deepEqual(read.session.selected,['1','3','4']);assert.deepEqual(read.session.allocation,[['1'],['4'],['3']]);
 // A retained older editor may omit a newly attending player's color. The API fills it too.
 const previous=trainingSnapshot(read.session),legacyDraft={...previous,selected:[...previous.selected,'5']};response=await call('PUT',{...legacyDraft,revision:3,base:{session:previous}});assert.equal(response.status,200,await response.clone().text());read=await(await call('GET')).json();assert.equal(read.session.revision,4);assert.deepEqual(read.session.allocation,[['1','5'],['4'],['3']]);
 const ctx={window:{},document:{addEventListener(){}}};vm.runInNewContext(readFileSync(new URL('../training-cards.js',import.meta.url),'utf8'),ctx);const html=ctx.window.NSKTrainingCards.presentation(read.session,[{id:1,full_name:'First'},{id:2,full_name:'Absent'},{id:3,full_name:'Third'},{id:4,full_name:'Added'}]);assert.match(html,/Vit<\/h4><ul><li>Added/);assert.doesNotMatch(html,/Absent/);assert.match(html,/Röd<\/h4><ul><li>First/);assert.match(html,/Svart<\/h4><ul><li>Third/);
});
