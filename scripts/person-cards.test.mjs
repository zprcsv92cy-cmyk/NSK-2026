import test from 'node:test';
import assert from 'node:assert/strict';
import {createEquipmentHandler,emptyPersonCard,validatePersonCard} from '../worker/equipment-api.js';
const teams=[{id:18,Namn:'A','Säsong':'2026'},{id:19,Namn:'B','Säsong':'2026'}];
const card=()=>({...emptyPersonCard(),number:'18',position:'Back',hand:'Left',model:'Exempelmodell',hollow:'16 mm',profile:'Exempelprofil',radius:'10 ft',notes:'Kontrollera skenan'});
const req=(route,method='GET',data,team='18')=>new Request('https://example.test'+route+(route.includes('?')?'&':'?')+'team_id='+team,{method,headers:{Authorization:'Bearer valid'},...(data===undefined?{}:{body:JSON.stringify(data)})});
const endpoint='/api/person-card?kind=player&person_id=101';
function fixture(){
 const rows=new Map();let role='team_admin',permissions=['read','roster:manage'],personReads=0;
 const db={prepare(sql){let args;const statement={bind(...p){args=p;return statement;},async first(){return rows.get(args[0])||null;},async run(){
  if(sql.startsWith('INSERT')){const [team,json]=args;if(rows.has(team))return {meta:{changes:0}};rows.set(team,{board_json:json,revision:1});}
  else{const [json,,team,revision]=args,r=rows.get(team);if(!r||r.revision!==revision)return {meta:{changes:0}};rows.set(team,{board_json:json,revision:revision+1});}return {meta:{changes:1}};
 }};return statement;}};
 const handler=createEquipmentHandler({AUTH_DB:db},async()=>teams,{verifyIdentity:async()=>({user:{id:'one'},memberships:[{team_id:'A',role}],permissions}),readPerson:async(team,kind,id)=>{personReads++;return team==='18'&&['101','201'].includes(id)?{name:kind==='player'?'Spelare A':'Tränare A'}:null;}});
 return {handler,rows,setRole:r=>role=r,setPermissions:p=>permissions=p,personReads:()=>personReads};
}
test('person card fields validate optional values, Right/Left and reject unknown keys',()=>{
 assert.equal(validatePersonCard(emptyPersonCard()),true);assert.equal(validatePersonCard(card()),true);
 for(const bad of [null,{...card(),hand:'Vänster'},{...card(),number:'ABC'},{...card(),hollow:'x'.repeat(61)},{...card(),injected:true},{...card(),radius:'x'.repeat(61)}])assert.equal(validatePersonCard(bad),false);
});
test('person card is keyed by team, kind and person and denies invalid queries and outside-team references',async()=>{
 const f=fixture();let r=await f.handler(req(endpoint));assert.equal(r.status,200);assert.equal((await r.json()).name,'Spelare A');
 assert.equal((await f.handler(req(endpoint,'GET',undefined,'19'))).status,403);assert.equal(f.personReads(),1);
 for(const path of ['/api/person-card?kind=player&person_id=999','/api/person-card?kind=coach&person_id=999'])assert.equal((await f.handler(req(path))).status,404);
 for(const path of ['/api/person-card?kind=other&person_id=101','/api/person-card?kind=player&person_id=101&person_id=201','/api/person-card?kind=player&person_id=0'])assert.equal((await f.handler(req(path))).status,400);
});
test('cards and material changes coexist; pending orders follow the card while completed history survives edits',async()=>{
 const f=fixture();let r=await f.handler(req(endpoint,'PUT',{revision:0,card:card()}));assert.equal(r.status,200);
 const board=await (await f.handler(req('/api/equipment'))).json();assert.deepEqual(board.requests,[]);assert.equal(board.revision,1);
 const order={id:'one',kind:'player',personId:'101',name:'Forged name',note:'Inför match',done:false,skates:{model:'forged',hollow:'forged',profile:'forged',notes:'forged'}};
 r=await f.handler(req('/api/equipment','PUT',{revision:1,requests:[order],checklists:[]}));assert.equal(r.status,200);
 let saved=await r.json();assert.equal(saved.requests[0].name,'Spelare A');assert.equal(saved.requests[0].skates.hollow,'16 mm');assert.equal(saved.requests[0].skates.profile,'Exempelprofil');assert.equal(saved.requests[0].skates.radius,'10 ft');
 r=await f.handler(req(endpoint,'GET'));let profile=await r.json();assert.equal(profile.card.hand,'Left');assert.equal(profile.revision,2);
 r=await f.handler(req(endpoint,'PUT',{revision:2,card:{...card(),hollow:'20 mm'}}));assert.equal(r.status,200);
 assert.equal((await f.handler(req(endpoint,'PUT',{revision:2,card:card()}))).status,409);
 saved=await (await f.handler(req('/api/equipment'))).json();assert.equal(saved.requests[0].skates.hollow,'20 mm');
 // Older material clients do not send profiles or skate snapshots. They must not erase either.
 const {skates,...legacyOrder}=saved.requests[0];legacyOrder.done=true;
 r=await f.handler(req('/api/equipment','PUT',{revision:3,requests:[legacyOrder],checklists:[]}));assert.equal(r.status,200);saved=await r.json();assert.equal(saved.requests[0].skates.hollow,'20 mm');
 profile=await (await f.handler(req(endpoint))).json();assert.equal(profile.card.hollow,'20 mm');
 r=await f.handler(req(endpoint,'PUT',{revision:4,card:{...card(),hollow:'22 mm',profile:'Quad XS'}}));assert.equal(r.status,200);
 saved=await (await f.handler(req('/api/equipment'))).json();assert.equal(saved.requests[0].done,true);assert.equal(saved.requests[0].skates.hollow,'20 mm');
 const newOrder={...order,id:'two'};delete newOrder.skates;
 r=await f.handler(req('/api/equipment','PUT',{revision:5,requests:[...saved.requests,newOrder],checklists:[]}));assert.equal(r.status,200);saved=await r.json();assert.equal(saved.requests[1].skates.hollow,'22 mm');assert.equal(saved.requests[1].skates.profile,'Quad XS');
 const coach=await (await f.handler(req('/api/person-card?kind=coach&person_id=101'))).json();assert.equal(coach.card.hollow,'17 mm');
});
test('readers cannot save cards or request sharpening; material staff can edit skates but cannot change jersey, position or handedness',async()=>{
 const f=fixture();f.setRole('viewer');assert.equal((await f.handler(req(endpoint,'PUT',{revision:0,card:card()}))).status,403);
 let result=await (await f.handler(req(endpoint))).json();assert.equal(result.canEditSkates,false);assert.equal(result.canRequest,false);
 f.setRole('equipment');f.setPermissions(['read']);
 assert.equal((await f.handler(req(endpoint,'PUT',{revision:0,card:card()}))).status,403);
 const onlySkates={...emptyPersonCard(),hollow:'16 mm',profile:'Profil A'};
 assert.equal((await f.handler(req(endpoint,'PUT',{revision:0,card:onlySkates}))).status,200);
 result=await (await f.handler(req(endpoint))).json();assert.equal(result.canEditSkates,true);assert.equal(result.canEditProfile,false);
 f.setPermissions([]);const reads=f.personReads();assert.equal((await f.handler(req(endpoint))).status,403);assert.equal(f.personReads(),reads);
});
test('person card rejects oversized requests and invalid bodies; new slip requests require a trusted roster member',async()=>{
 const f=fixture();assert.equal((await f.handler(req(endpoint,'PUT',{revision:0,card:{...card(),notes:'x'.repeat(9000)}}))).status,413);
 assert.equal((await f.handler(req(endpoint,'PUT',{revision:0,card:{...card(),hand:'Other'}}))).status,400);
 const request={id:'one',kind:'coach',personId:'999',name:'Another team',note:'',done:false};assert.equal((await f.handler(req('/api/equipment','PUT',{revision:0,requests:[request],checklists:[]}))).status,400);
});

test('legacy card saves preserve the separately stored radius and new slip requests include it',async()=>{
 const f=fixture();assert.equal((await f.handler(req(endpoint,'PUT',{revision:0,card:card()}))).status,200);
 const {radius,...legacy}=card();legacy.hollow='18 mm';
 assert.equal((await f.handler(req(endpoint,'PUT',{revision:1,card:legacy}))).status,200);
 const read=await (await f.handler(req(endpoint))).json();assert.equal(read.card.radius,'10 ft');assert.equal(read.card.profile,'Exempelprofil');assert.equal(read.card.hollow,'18 mm');
 const order={id:'radius-one',kind:'player',personId:'101',name:'Spelare A',note:'',done:false};
 const response=await f.handler(req('/api/equipment','PUT',{revision:2,requests:[order],checklists:[]}));assert.equal(response.status,200);
 const saved=await response.json();assert.equal(saved.requests[0].skates.radius,'10 ft');assert.equal(saved.requests[0].skates.profile,'Exempelprofil');
});

test('existing pending slip requests resolve current card settings; completed requests keep their settings',async()=>{
 const f=fixture();
 const order={id:'pending',kind:'player',personId:'101',name:'Spelare A',note:'',done:false,skates:{model:'',hollow:'16 mm',profile:'Gammal profil',notes:''}};
 f.rows.set('18',{revision:8,board_json:JSON.stringify({requests:[order,{...order,id:'done',done:true}],checklists:[],profiles:{'player:101':{...card(),hollow:'21 mm',profile:'Quad XS'}}})});
 const result=await (await f.handler(req('/api/equipment'))).json();assert.equal(result.revision,8);assert.equal(result.requests[0].skates.hollow,'21 mm');assert.equal(result.requests[0].skates.profile,'Quad XS');assert.equal(result.requests[1].skates.hollow,'16 mm');
 const persisted=JSON.parse(f.rows.get('18').board_json);assert.equal(persisted.requests[0].skates.hollow,'16 mm');
 // Completing from an older client must freeze the current card settings, not its stale submitted values.
 const response=await f.handler(req('/api/equipment','PUT',{revision:8,requests:[{...order,done:true},result.requests[1]],checklists:[]}));assert.equal(response.status,200);
 const saved=await response.json();assert.equal(saved.requests[0].skates.hollow,'21 mm');assert.equal(saved.requests[1].skates.hollow,'16 mm');
});
