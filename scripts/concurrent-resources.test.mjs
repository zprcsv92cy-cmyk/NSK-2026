import test from 'node:test';import assert from 'node:assert/strict';
import {mergeConcurrent,mergeTraining,lineupSnapshot} from '../concurrency-merge.mjs';
import {withConcurrentResources} from '../worker/concurrent-resources.js';
import {concurrentStaffStore} from '../worker/concurrent-staff.js';
import {fixture} from './helpers/auth-d1-fixture.mjs';
import {readFileSync} from 'node:fs';
const env={NSK_MULTIUSER_ENABLED:'true'};
const req=(path,data)=>new Request('https://test'+path,{method:'PUT',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(data)});
function resources(initial){let state=structuredClone(initial),revision=1,puts=0;const handler=withConcurrentResources(async request=>{if(request.headers.get('Authorization')!=='Bearer test')return Response.json({ok:false},{status:403});if(request.method==='GET')return Response.json({ok:true,...state,revision});const data=await request.json();if(data.revision!==revision)return Response.json({ok:false},{status:409});puts++;revision++;state={...state,...Object.fromEntries(Object.entries(data).filter(([k])=>k!=='revision'))};return Response.json({ok:true,revision});});return {handler,state:()=>state,revision:()=>revision,puts:()=>puts};}
test('three-way merge combines independent fields, additions and checklist items; rejects conflicting edit/delete',()=>{
 assert.deepEqual(mergeConcurrent({a:1,b:1},{a:2,b:1},{a:1,b:2}),{a:2,b:2});
 const base=[{id:'list',title:'A',items:[{id:'one',done:false},{id:'two',done:false}]}];
 const mine=structuredClone(base),theirs=structuredClone(base);mine[0].items[0].done=true;theirs[0].items[1].done=true;
 assert(mergeConcurrent(base,mine,theirs)[0].items.every(i=>i.done));
 assert.equal(mergeConcurrent([],[{id:'a'}],[{id:'b'}]).length,2);
 assert.throws(()=>mergeConcurrent({a:1},{a:2},{a:3}),{status:409});
 assert.throws(()=>mergeConcurrent([{id:'a',name:'A'}],[],[{id:'a',name:'B'}]),{status:409});
});
test('different person cards save with an old board revision; same-field conflict never writes',async()=>{
 const f=resources({card:{number:'18',hollow:'17 mm'}}),base={card:{number:'18',hollow:'17 mm'}};
 assert.equal((await f.handler(req('/api/person-card',{revision:0,base,card:{number:'18',hollow:'19 mm'}}),env)).status,200);
 assert.equal((await f.handler(req('/api/person-card',{revision:0,base,card:{number:'20',hollow:'17 mm'}}),env)).status,200);
 assert.deepEqual(f.state().card,{number:'20',hollow:'19 mm'});
 const before=f.puts();assert.equal((await f.handler(req('/api/person-card',{revision:0,base,card:{number:'22',hollow:'17 mm'}}),env)).status,409);assert.equal(f.puts(),before);
});
test('equipment merges separate checklist changes without replacing a new slip request',async()=>{
 const base={requests:[],checklists:[{id:'list',title:'A',items:[{id:'one',done:false},{id:'two',done:false}]}]},f=resources(base);
 const a=structuredClone(base),b=structuredClone(base);a.requests.push({id:'slip',done:false});a.checklists[0].items[0].done=true;b.checklists[0].items[1].done=true;
 for(const data of [a,b])assert.equal((await f.handler(req('/api/equipment',{...data,revision:1,base}),env)).status,200);
 assert.equal(f.state().requests.length,1);assert(f.state().checklists[0].items.every(i=>i.done));
});
test('resource merge cannot bypass denied read or permission validation',async()=>{
 let writes=0;const denied=withConcurrentResources(async request=>{if(request.method==='PUT')writes++;return Response.json({ok:false},{status:403});});
 assert.equal((await denied(req('/api/person-card',{revision:1,card:{},base:{card:{}}}),env)).status,403);assert.equal(writes,0);
});
test('training merges separate attendance changes; true field conflict needs explicit resolution',async()=>{
 const base={selected:['1'],selectedCoaches:[],goalies:[],goalieCount:0,allocation:[],shirtColorCount:3,hall:''};
 const a={...base,selected:['1','2']},b={...base,selected:['1','3']};assert.deepEqual(mergeTraining(base,a,b).selected,['1','3','2']);
 assert.throws(()=>mergeTraining(base,{...base,hall:'Lilla Hallen'},{...base,hall:'Stora hallen'}),{status:409});
 const resolved=mergeTraining(base,{...base,hall:'Lilla Hallen'},{...base,hall:'Stora hallen',shirtColorCount:4},true);assert.equal(resolved.hall,'Lilla Hallen');assert.equal(resolved.shirtColorCount,4);
 const f=resources({session:base});
 // A training handler returns session reads and accepts flat training writes.
 let session=base,revision=1;
 const handler=withConcurrentResources(async r=>{if(r.method==='GET')return Response.json({ok:true,session:{...session,revision}});const body=await r.json();if(body.revision!==revision)return Response.json({ok:false},{status:409});session=body;return Response.json({ok:true,revision:++revision});});
 for(const draft of [a,b]){const result=await handler(req('/api/training',{...draft,revision:0,base:{session:base}}),env);assert.equal(result.status,200);assert((await result.json()).session);}
 assert.deepEqual(session.selected,['1','2','3']);assert.deepEqual(session.allocation,[['1'],['2'],['3']]);
});
test('staff adapter retains overlapping additions, scopes teams and rejects conflicting same-record edits',async t=>{
 const f=await fixture(t);await f.db.prepare(readFileSync(new URL('../migrations/20261027_concurrent_staff.sql',import.meta.url),'utf8')).run();
 const legacyData=new Map([['lagpersonal:team:18',[{id:'original',name:'Original',role:'Lagledare'}]]]);let legacyWrites=0;
 const legacy={get:async k=>structuredClone(legacyData.get(k)||null),put:async()=>{legacyWrites++;}};
 const a=concurrentStaffStore(f.db,legacy),b=concurrentStaffStore(f.db,legacy),key='lagpersonal:team:18';const [aa,bb]=await Promise.all([a.get(key,'json'),b.get(key,'json')]);
 await Promise.all([a.put(key,JSON.stringify([...aa,{id:'a',name:'A',role:'Lagledare'}])),b.put(key,JSON.stringify([...bb,{id:'b',name:'B',role:'Lagledare'}]))]);
 assert.equal((await concurrentStaffStore(f.db,legacy).get(key,'json')).length,3);assert.equal(legacyWrites,0);assert.equal(await a.get('lagpersonal:team:19','json'),null);
 const c=concurrentStaffStore(f.db,legacy),d=concurrentStaffStore(f.db,legacy),ca=await c.get(key,'json'),da=await d.get(key,'json');ca[0].name='C';da[0].name='D';await c.put(key,JSON.stringify(ca));await assert.rejects(()=>d.put(key,JSON.stringify(da)),{status:409});
 assert.equal(legacyData.get(key)[0].name,'Original');
});
test('lineup snapshots agree for raw Baserow and normalized browser records',()=>{
 const raw={Starttid:'10:00',Motståndare:'Away',Plan:'Plan 1','Antal spelare':1,Målvakt:[{id:1}],'Spelare på plan':[1,2]};const normal={start_time:'10:00',opponent:'Away',plan:'Plan 1',player_count:1,goalie_player_id:1,players_on_field:[1,2]};
 assert.deepEqual(lineupSnapshot(raw,[{Persontyp:{value:'Spelare'},'Person-ID':2,Sorteringsordning:1}]),lineupSnapshot(normal,[{person_type:'player',person_id:2,sort_order:1}]));
});

test('real material handler accepts independent simultaneous card edits and retains field permissions',async t=>{
 const {createEquipmentHandler,emptyPersonCard}=await import('../worker/equipment-api.js');
 const f=await fixture(t);await f.db.prepare(readFileSync(new URL('../migrations/20261026_equipment_boards.sql',import.meta.url),'utf8')).run();
 let permissions=['read','roster:manage'],role='coach';
 const original=createEquipmentHandler(f.env,async()=>[{id:18,Namn:'A','Säsong':'2026'}],{verifyIdentity:async()=>({user:{id:'fixture'},memberships:[{team_id:'A',role}],permissions}),readPerson:async()=>({name:'Synthetic'})});
 const wrapped=withConcurrentResources(original),card=emptyPersonCard();
 const requests=[101,102].map((id,i)=>req('/api/person-card?team_id=18&kind=player&person_id='+id,{revision:0,card:{...card,number:String(18+i)},base:{card}}));
 const replies=await Promise.all(requests.map(r=>wrapped(r,env)));assert(replies.every(r=>r.status===200));
 const saved=JSON.parse((await f.db.prepare('SELECT board_json FROM equipment_boards WHERE team_id=?').bind('18').first()).board_json);assert.equal(saved.profiles['player:101'].number,'18');assert.equal(saved.profiles['player:102'].number,'19');
 role='equipment';permissions=['read'];
 const current=await(await original(new Request('https://test/api/person-card?team_id=18&kind=player&person_id=101',{headers:{Authorization:'Bearer test'}}))).json();
 const response=await wrapped(req('/api/person-card?team_id=18&kind=player&person_id=101',{revision:current.revision,card:{...current.card,number:'88'},base:{card:current.card}}),env);assert.equal(response.status,403);
});

test('training merge rejects a read without a valid revision instead of attempting a write',async()=>{
 let writes=0;const original=withConcurrentResources(async r=>{if(r.method==='GET')return Response.json({ok:true,session:{selected:[]}});writes++;return Response.json({ok:true});});
 const base={selected:[],selectedCoaches:[],goalies:[],goalieCount:0,allocation:[],shirtColorCount:3,hall:''};const result=await original(req('/api/training',{...base,revision:0,base:{session:base}}),env);assert.equal(result.status,502);assert.equal(writes,0);
});
