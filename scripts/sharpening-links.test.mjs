import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/auth-d1-fixture.mjs';
import {createSharpeningHandler} from '../worker/sharpening-links-api.js';
import {createEquipmentHandler} from '../worker/equipment-api.js';
async function setup(t){
 const f=await fixture(t);for(const file of ['20261026_equipment_boards.sql','20261026_sharpening_links.sql','20261026_sharpening_history.sql'])for(const statement of readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8').split(/;\s*(?=CREATE|INSERT)/).filter(s=>s.trim()))await f.db.prepare(statement).run();
 let actor={user:{id:'manager'},is_primary_admin:true,permissions:['read'],memberships:[{team_id:'NSK Team 18',role:'owner'}]},present=true,teamReads=0;
 const teams=async()=>{teamReads++;return [{id:18,Namn:'NSK Team 18','Säsong':'2026'},{id:19,Namn:'Other','Säsong':'2026'}];},readPerson=async(team,id)=>present&&team==='18'&&id==='101'?{name:'Alex SyntheticSurname'}:null,verifyIdentity=async token=>token==='session'?actor:null;
 const handler=createSharpeningHandler(f.env,teams,{verifyIdentity,readPerson});
 const manage=(method='GET',data,team='18',person='101',token='session')=>handler(new Request(`https://test/api/sharpening/link?team_id=${team}&person_id=${person}`,{method,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}));
 const publicCall=(token,method='GET',data,suffix='')=>handler(new Request('https://test/api/sharpening/public'+suffix,{method,headers:{Authorization:'Sharpening '+token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}));
 const board={requests:[],checklists:[{id:'list',title:'Private checklist',items:[]}],profiles:{'player:101':{number:'18',hollow:'20 mm',profile:'Quad XS',model:'Private model',notes:'PRIVATE NOTES',position:'Forward'},'player:102':{number:'19',notes:'OTHER CHILD'}}};
 await f.db.prepare('INSERT INTO equipment_boards(team_id,board_json,revision,updated_by) VALUES (?,?,1,?)').bind('18',JSON.stringify(board),'fixture').run();
 const row=()=>f.db.prepare('SELECT board_json,revision FROM equipment_boards WHERE team_id=?').bind('18').first();
 const create=async(mode='parent',revision=0)=>{const r=await manage('PUT',{mode,revision});assert.equal(r.status,200);return r.json();};
 const equipment=createEquipmentHandler(f.env,teams,{verifyIdentity,readPerson:async(team,kind,id)=>kind==='player'?readPerson(team,id):null});
 const material=(method='GET',data)=>equipment(new Request('https://test/api/equipment?team_id=18',{method,headers:{Authorization:'Bearer session',...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}));
 return {...f,manage,publicCall,create,row,board,material,setActor:a=>actor=a,setPresent:v=>present=v,teamReads:()=>teamReads};
}
test('only primary administrator and team equipment role manage scoped player links',async t=>{
 const f=await setup(t);assert.equal((await f.manage('GET',null,'18','101','invalid')).status,401);
 for(const role of ['viewer','coach','team_admin','owner','team_manager']){f.setActor({user:{id:'ordinary'},is_global_admin:true,memberships:[{team_id:'NSK Team 18',role}],permissions:['read','roster:manage','users:manage']});assert.equal((await f.manage()).status,403);assert.equal((await f.manage('PUT',{mode:'parent',revision:0})).status,403);}
 f.setActor({user:{id:'equipment'},memberships:[{team_id:'NSK Team 18',role:'equipment'}],permissions:['read']});assert.equal((await f.manage()).status,200);assert.equal((await f.manage('GET',null,'19')).status,403);assert.equal((await f.manage('GET',null,'18','102')).status,404);assert.equal((await f.manage('GET',null,'18&team_id=19')).status,400);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM sharpening_links').first()).n,0);
});
test('public GET returns only own first name, number, settings and status; no app identity or team access',async t=>{
 const f=await setup(t),created=await f.create();assert.match(created.token,/^[a-f0-9]{64}$/);
 const stored=await f.db.prepare('SELECT token_hash FROM sharpening_links').first();assert.notEqual(stored.token_hash,created.token);const managed=await(await f.manage()).json();assert.deepEqual(managed,{ok:true,mode:'parent',revision:1});
 const r=await f.publicCall(created.token);assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/no-store/);assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');
 assert.deepEqual(await r.json(),{ok:true,firstName:'Alex',number:'18',mode:'parent',hollow:'20 mm',profile:'Quad XS',status:'none',history:[],noteRequired:false,nextRegularAt:null,historyHasUndated:false});
 assert.equal((await f.publicCall('invalid')).status,404);assert.equal((await f.publicCall(created.token,'GET',null,'?person_id=102')).status,400);assert.equal((await f.publicCall(created.token,'DELETE')).status,405);
 f.setPresent(false);assert.equal((await f.publicCall(created.token)).status,404);
});
test('public request uses trusted identity and skate profile; material status and revision synchronize without exposing other data',async t=>{
 const f=await setup(t),link=await f.create(),old=await f.row();
 const response=await f.publicCall(link.token,'POST',{note:'Hack i vänster skena'});assert.equal(response.status,200);assert.equal((await response.json()).status,'pending');const row=await f.row(),saved=JSON.parse(row.board_json),order=saved.requests[0];assert.equal(row.revision,old.revision+1);assert.equal(order.name,'Alex SyntheticSurname');assert.equal(order.personId,'101');assert.equal(order.skates.hollow,'20 mm');assert.equal(order.skates.notes,'PRIVATE NOTES');assert.equal(order.note,'Hack i vänster skena');assert.deepEqual(saved.checklists,f.board.checklists);assert.deepEqual(saved.profiles,f.board.profiles);
 assert.equal((await f.material('PUT',{revision:old.revision,requests:[],checklists:[]})).status,409);
 const material=await(await f.material()).json();assert.equal(material.requests[0].note,'Hack i vänster skena');material.requests[0].done=true;assert.equal((await f.material('PUT',{revision:material.revision,requests:material.requests,checklists:material.checklists})).status,200);assert.equal((await(await f.publicCall(link.token)).json()).status,'done');assert.equal((await f.publicCall(link.token,'POST',{note:''})).status,400);
 await f.db.prepare('UPDATE sharpening_links SET next_request_at=0').run();assert.equal((await f.publicCall(link.token,'POST',{note:'Next request'})).status,200);assert.equal(JSON.parse((await f.row()).board_json).requests.length,2);
});
test('duplicate and concurrent public submissions create exactly one waiting order',async t=>{
 const f=await setup(t),link=await f.create();const results=await Promise.all(Array.from({length:6},()=>f.publicCall(link.token,'POST',{note:'Same request'})));assert(results.every(r=>r.status===200));assert.equal(JSON.parse((await f.row()).board_json).requests.length,1);assert.equal((await f.row()).revision,2);
 for(const bad of [{note:'x',person_id:'102'},{note:'x',team_id:'19'},{note:'x',hollow:'99 mm'},{note:1},{note:'x'.repeat(301)},{},{note:'x',done:true}])assert.equal((await f.publicCall(link.token,'POST',bad)).status,400);
});
test('responsibility transfer, replacement and disable revoke old links while retaining pending requests',async t=>{
 const f=await setup(t),parent=await f.create();await f.publicCall(parent.token,'POST',{note:'Waiting'});const before=await f.row();
 const player=await f.create('player',1);assert.notEqual(parent.token,player.token);assert.equal((await f.publicCall(parent.token)).status,404);assert.equal((await(await f.publicCall(player.token)).json()).mode,'player');assert.equal((await(await f.publicCall(player.token)).json()).status,'pending');assert.equal((await f.row()).board_json,before.board_json);
 assert.equal((await f.manage('PUT',{mode:'parent',revision:1})).status,409);await f.create('off',2);assert.equal((await f.publicCall(player.token)).status,404);assert.equal((await f.row()).board_json,before.board_json);assert.equal((await f.db.prepare('SELECT token_hash FROM sharpening_links').first()).token_hash,null);
});
test('revocation racing a public submission is checked in the atomic board write',async t=>{
 const f=await setup(t),link=await f.create(),before=await f.row();const original=f.db.batch;let once=true;f.db.batch=async statements=>{if(once){once=false;await f.create('off',1);}return original(statements);};
 assert.equal((await f.publicCall(link.token,'POST',{note:'Racing request'})).status,404);assert.deepEqual(await f.row(),before);
});
test('concurrent board changes are retried without losing checklists, profiles or another request',async t=>{
 const f=await setup(t),link=await f.create();const original=f.db.batch;let once=true;f.db.batch=async statements=>{if(once){once=false;const board=JSON.parse((await f.row()).board_json);board.checklists.push({id:'new',title:'Concurrent checklist',items:[]});board.requests.push({id:'other',kind:'player',personId:'102',name:'Other',note:'',done:false});await f.db.prepare('UPDATE equipment_boards SET board_json=?,revision=revision+1 WHERE team_id=?').bind(JSON.stringify(board),'18').run();}return original(statements);};
 assert.equal((await f.publicCall(link.token,'POST',{note:'Concurrent parent'})).status,200);const saved=JSON.parse((await f.row()).board_json);assert.equal(saved.checklists.length,2);assert.equal(saved.requests.length,2);assert.equal(saved.requests[0].id,'other');assert.equal(saved.requests[1].personId,'101');assert.deepEqual(saved.profiles,f.board.profiles);
});
test('first request creates an empty material board safely; feature can be globally disabled',async t=>{
 const f=await setup(t),link=await f.create();await f.db.prepare('DELETE FROM equipment_boards').run();assert.equal((await f.publicCall(link.token,'POST',{note:''})).status,200);assert.equal((await f.row()).revision,1);assert.equal(JSON.parse((await f.row()).board_json).requests.length,1);
 f.env.NSK_DISABLE_PUBLIC_SHARPENING='true';assert.equal((await f.publicCall(link.token)).status,404);
});

test('completion log is timestamped, immutable on ordinary edits and survives removal of old requests',async t=>{
 const f=await setup(t),link=await f.create();await f.publicCall(link.token,'POST',{note:''});let data=await(await f.material()).json();data.requests[0].done=true;await f.material('PUT',{revision:data.revision,requests:data.requests,checklists:data.checklists});
 let result=await(await f.publicCall(link.token)).json();assert.equal(result.history.length,1);assert.match(result.history[0].completedAt,/^\d{4}-\d{2}-\d{2}T/);assert.deepEqual(Object.keys(result.history[0]).sort(),['completedAt','hollow','profile']);assert.equal(result.history[0].hollow,'20 mm');const first=result.history[0].completedAt;
 data=await(await f.material()).json();await f.material('PUT',{revision:data.revision,requests:data.requests,checklists:[]});result=await(await f.publicCall(link.token)).json();assert.equal(result.history.length,1);assert.equal(result.history[0].completedAt,first);
 data=await(await f.material()).json();await f.material('PUT',{revision:data.revision,requests:[],checklists:data.checklists});result=await(await f.publicCall(link.token)).json();assert.equal(result.history.length,1);assert.equal(result.status,'done');assert.equal(result.noteRequired,true);
});
test('a recent completed sharpening requires a nonblank message; exactly 14 days permits a normal request',async t=>{
 const f=await setup(t),link=await f.create();const date=new Date(Date.now()-13*86400000).toISOString();await f.db.prepare('INSERT INTO sharpening_history(team_id,request_id,person_id,completion_revision,completed_at) VALUES (?,?,?,?,?)').bind('18','prior','101',1,date).run();
 const read=await(await f.publicCall(link.token)).json();assert.equal(read.noteRequired,true);assert.equal(read.nextRegularAt,new Date(Date.parse(date)+14*86400000).toISOString());
 for(const note of ['', ' \n\t ']){const r=await f.publicCall(link.token,'POST',{note});assert.equal(r.status,400);assert.equal((await r.json()).code,'message_required');}assert.equal(JSON.parse((await f.row()).board_json).requests.length,0);
 assert.equal((await f.publicCall(link.token,'POST',{note:'Hack i skenan'})).status,200);assert.equal(JSON.parse((await f.row()).board_json).requests[0].note,'Hack i skenan');
 await f.db.prepare('UPDATE equipment_boards SET board_json=?,revision=revision+1 WHERE team_id=?').bind(JSON.stringify(f.board),'18').run();await f.db.prepare('UPDATE sharpening_history SET completed_at=?').bind(new Date(Date.now()-14*86400000).toISOString()).run();
 assert.equal((await(await f.publicCall(link.token)).json()).noteRequired,false);assert.equal((await f.publicCall(link.token,'POST',{note:''})).status,200);
});
test('only the latest ten own-player completions are exposed and history continues across responsibility transfer',async t=>{
 const f=await setup(t),link=await f.create();for(let i=0;i<12;i++)await f.db.prepare('INSERT INTO sharpening_history(team_id,request_id,person_id,completion_revision,completed_at,hollow,profile) VALUES (?,?,?,?,?,?,?)').bind('18','log-'+i,'101',i+1,new Date(Date.now()-i*86400000).toISOString(),String(i)+' mm','Profile '+i).run();
 for(const [team,person] of [['19','101'],['18','102']])await f.db.prepare('INSERT INTO sharpening_history(team_id,request_id,person_id,completion_revision,completed_at,hollow) VALUES (?,?,?,?,?,?)').bind(team,'private-'+person,person,1,new Date().toISOString(),'OTHER CHILD').run();
 const data=await(await f.publicCall(link.token)).json();assert.equal(data.history.length,10);assert.equal(data.history[0].hollow,'0 mm');assert.equal(data.history[9].hollow,'9 mm');assert(!JSON.stringify(data).includes('OTHER CHILD'));const player=await f.create('player',1);assert.deepEqual((await(await f.publicCall(player.token)).json()).history,data.history);
});
test('legacy completions get no invented date and additive migration can safely run twice',async t=>{
 const f=await setup(t),link=await f.create();for(const name of ['sharpening_completed_insert','sharpening_completed_update'])await f.db.prepare('DROP TRIGGER '+name).run();
 const board=structuredClone(f.board);board.requests=[{id:'legacy',kind:'player',personId:'101',name:'Alex',note:'Private old note',done:true,skates:{hollow:'19 mm',profile:'10 ft'}}];await f.db.prepare('UPDATE equipment_boards SET board_json=?,revision=revision+1 WHERE team_id=?').bind(JSON.stringify(board),'18').run();
 const sql=readFileSync(new URL('../migrations/20261026_sharpening_history.sql',import.meta.url),'utf8');for(let n=0;n<2;n++)for(const statement of sql.split(/;\s*(?=CREATE|INSERT)/).filter(s=>s.trim()))await f.db.prepare(statement).run();
 const data=await(await f.publicCall(link.token)).json();assert.deepEqual(data.history,[{completedAt:null,hollow:'19 mm',profile:'10 ft'}]);assert.equal(data.historyHasUndated,true);assert.equal(data.noteRequired,false);assert(!JSON.stringify(data).includes('Private old note'));
});
test('reusing a completed request records a new completion without erasing the previous sharpening',async t=>{
 const f=await setup(t),link=await f.create();await f.publicCall(link.token,'POST',{note:''});for(const done of [true,false,true]){const data=await(await f.material()).json();data.requests[0].done=done;assert.equal((await f.material('PUT',{revision:data.revision,requests:data.requests,checklists:data.checklists})).status,200);}
 assert.equal((await(await f.publicCall(link.token)).json()).history.length,2);
});
test('a concurrent new completion forces a fresh interval check before a public request is saved',async t=>{
 const f=await setup(t),link=await f.create();const original=f.db.batch;let once=true;f.db.batch=async statements=>{if(once){once=false;const board=JSON.parse((await f.row()).board_json);board.requests.push({id:'concurrent-done',kind:'player',personId:'101',name:'Alex',note:'',done:true,skates:{hollow:'20 mm',profile:'Quad XS'}});await f.db.prepare('UPDATE equipment_boards SET board_json=?,revision=revision+1 WHERE team_id=?').bind(JSON.stringify(board),'18').run();}return original(statements);};
 const result=await f.publicCall(link.token,'POST',{note:''});assert.equal(result.status,400);assert.equal((await result.json()).code,'message_required');assert.equal(JSON.parse((await f.row()).board_json).requests.length,1);
});
