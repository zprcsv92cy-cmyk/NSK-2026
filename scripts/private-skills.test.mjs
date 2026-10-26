import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateSkillsHandler,validSkillsCards} from '../worker/private-skills-api.js';
import {SKILL_KEYS,planSkills,SKILL_GROUPS} from '../worker/skills-planner.js';
import {PRIMARY_ADMIN_ID} from '../worker/primary-administrator.js';
const teams=[{id:18,Namn:'A','Säsong':'2026'},{id:19,Namn:'B','Säsong':'2026'}];
const blank=()=>({ratings:Object.fromEntries(SKILL_KEYS.map(k=>[k,null])),notes:''});
const request=(method='GET',data,token='valid',query='18',path='/api/skills',unlock='a'.repeat(64))=>new Request('https://test'+path+'?team_id='+query,{method,headers:{'X-NSK-Skills-Unlock':unlock,...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
function fixture(){
 let actor={user:{id:PRIMARY_ADMIN_ID},is_primary_admin:true,is_global_admin:true,memberships:[{team_id:'A',role:'owner'}],permissions:['read']},storageCalls=0,rosterCalls=0,teamCalls=0;const rows=new Map();
 const db={prepare(sql){storageCalls++;let args;const statement={bind(...values){args=values;return statement;},async first(){if(sql.includes('FROM private_skills_unlocks'))return {valid:1};return rows.get(args[0])||null;},async run(){
  if(sql.startsWith('INSERT')){const [team,json,enabled]=args;if(rows.has(team))return {meta:{changes:0}};rows.set(team,{cards_json:json,enabled,revision:1});}
  else{const [json,enabled,,team,revision]=args;if(rows.get(team)?.revision!==revision)return {meta:{changes:0}};rows.set(team,{cards_json:json,enabled,revision:revision+1});}
  return {meta:{changes:1}};
 }};return statement;}};
 const env={AUTH_DB:db};return {handler:createPrivateSkillsHandler(env,async()=>{teamCalls++;return teams;},{verifyIdentity:async token=>token==='valid'?actor:null,readRoster:async team=>{rosterCalls++;return [101,102,103,104,105,106,107].map(id=>({id:String(id),name:'Spelare '+id}));}}),env,rows,setActor:a=>actor=a,calls:()=>({storageCalls,rosterCalls,teamCalls}),primary:()=>actor};
}
test('skills reject all ordinary roles and global administrators before touching team or assessment data',async()=>{
 const f=fixture();for(const role of ['viewer','coach','equipment','team_manager','team_admin','owner']){
  f.setActor({user:{id:'ordinary'},is_global_admin:true,memberships:[{team_id:'A',role}],permissions:['read','roster:manage','users:manage']});
  for(const method of ['GET','PUT','DELETE','POST'])assert.equal((await f.handler(request(method,method==='GET'?undefined:{is_primary_admin:true}))).status,403);
 }
 f.setActor({user:{id:'other'},is_primary_admin:true,is_global_admin:true,memberships:[],permissions:['read']});assert.equal((await f.handler(request())).status,403);
 f.setActor({user:{id:PRIMARY_ADMIN_ID},is_primary_admin:false,is_global_admin:true,memberships:[],permissions:['read']});assert.equal((await f.handler(request())).status,403);
 assert.deepEqual(f.calls(),{storageCalls:0,rosterCalls:0,teamCalls:0});
});
test('anonymous, invalid and expired sessions cannot read assessments',async()=>{
 const f=fixture();assert.equal((await f.handler(request('GET',undefined,''))).status,401);assert.equal((await f.handler(request('GET',undefined,'invalid'))).status,401);assert.equal(f.calls().storageCalls,0);
});
test('primary-only cards persist with compare-and-swap and remain separate by team; disabling blocks proposals',async()=>{
 const f=fixture(),card=blank();card.ratings.forward=8;card.notes='Test observation';const first=await f.handler(request('PUT',{revision:0,enabled:true,cards:{101:card}}));assert.equal(first.status,200);assert.match(first.headers.get('Cache-Control'),/private, no-store/);assert.equal(first.headers.get('Pragma'),'no-cache');
 assert.equal((await f.handler(request('PUT',{revision:0,enabled:true,cards:{}}))).status,409);const saved=await(await f.handler(request())).json();assert.equal(saved.cards['101'].ratings.forward,8);assert.equal(saved.cards['101'].notes,'Test observation');assert.equal(saved.revision,1);assert.equal((await(await f.handler(request('GET',undefined,'valid','19'))).json()).cards['101'],undefined);
 const input={mode:'training',playerIds:['101','102','103','104'],goalieIds:[],groupCount:2};assert.equal((await f.handler(request('POST',input,'valid','18','/api/skills/suggest'))).status,200);
 assert.equal((await f.handler(request('PUT',{revision:1,enabled:false,cards:{101:card}}))).status,200);assert.equal((await f.handler(request('POST',input,'valid','18','/api/skills/suggest'))).status,409);assert.equal((await(await f.handler(request())).json()).cards['101'].ratings.forward,8);
 assert.equal((await f.handler(request('DELETE',{revision:2}))).status,200);const erased=await(await f.handler(request())).json();assert.deepEqual(erased.cards,{});assert.equal(erased.enabled,false);assert.equal(erased.revision,3);assert.equal((await f.handler(request('PUT',{revision:0,enabled:true,cards:{101:card}}))).status,409);
});
test('cards reject invalid ratings, unknown attributes, oversized notes, unknown players and malformed teams',async()=>{
 for(const bad of [null,[],JSON.parse('{"__proto__":{}}'),{101:{ratings:{},notes:''}},{101:{...blank(),notes:'x'.repeat(1001)}},{101:{...blank(),secret:true}}, {101:{ratings:{...blank().ratings,forward:0},notes:''}},{101:{ratings:{...blank().ratings,forward:10.5},notes:''}},{101:{ratings:{...blank().ratings,forward:'8'},notes:''}}])assert.equal(validSkillsCards(bad),false);
 const f=fixture();assert.equal((await f.handler(request('PUT',{revision:0,enabled:true,cards:{999:blank()}}))).status,400);assert.equal((await f.handler(request('GET',undefined,'valid','18&team_id=19'))).status,400);assert.equal((await f.handler(request('GET',undefined,'valid','999'))).status,403);assert.equal((await f.handler(request('PUT',{revision:0,enabled:true,cards:{},is_primary_admin:true}))).status,400);assert.equal((await f.handler(request('PATCH',{}))).status,405);
 f.env.NSK_DISABLE_PRIVATE_SKILLS='true';assert.equal((await f.handler(request())).status,404);
});
test('private proposals use the roster and never accept client supplied ratings',async()=>{
 const f=fixture(),input={mode:'match',playerIds:['101','102','103','104','105','106'],goalieIds:['106'],playersOnField:3,shiftCount:10};const response=await f.handler(request('POST',input,'valid','18','/api/skills/suggest')),body=await response.json();assert.equal(response.status,200);assert.equal(body.groups.length,10);assert(!body.groups.flat().includes('106'));assert(!Object.hasOwn(body,'ratings'));assert(!Object.hasOwn(body,'cards'));
 for(const bad of [{...input,ratings:{101:10}},{...input,playerIds:['999']},{...input,playerIds:['101','101','102']},{...input,goalieIds:['999']},{...input,shiftCount:61},{...input,playersOnField:7},{...input,mode:'unknown'}])assert.equal((await f.handler(request('POST',bad,'valid','18','/api/skills/suggest'))).status,400);
});
test('training groups include every skater exactly once, exclude goalies and keep sizes within one',()=>{
 for(let n=4;n<=30;n++)for(const count of [2,3,4])if(n-1>=count){const ids=Array.from({length:n},(_,i)=>String(i+1)),result=planSkills({mode:'training',playerIds:ids,goalieIds:['1'],groupCount:count},{},n);assert.deepEqual([...result.groups.flat()].sort(),ids.filter(x=>x!=='1').sort());const sizes=result.groups.map(g=>g.length);assert(Math.max(...sizes)-Math.min(...sizes)<=1);assert.equal(result.incomplete.length,n-1);}
});
test('match groups preserve equal opportunity: no duplicates, correct size and at most one shift difference',()=>{
 for(let n=3;n<=12;n++)for(const size of [2,3]){const ids=Array.from({length:n},(_,i)=>String(i+1)),result=planSkills({mode:'match',playerIds:ids,goalieIds:[],playersOnField:size,shiftCount:13},{},n);assert(result.groups.every(g=>g.length===size&&new Set(g).size===size));const counts=Object.values(result.appearances);assert(Math.max(...counts)-Math.min(...counts)<=1);}
});
test('assessment categories affect balanced planning without a single permanent player rank',()=>{
 const ids=['1','2','3','4'],cards={};ids.forEach((id,i)=>{cards[id]=blank();for(const key of SKILL_KEYS)cards[id].ratings[key]=i<2?10:1;});const result=planSkills({mode:'training',playerIds:ids,goalieIds:[],groupCount:2},cards,9);assert(result.groups.every(group=>group.filter(id=>['1','2'].includes(id)).length===1));assert.equal(SKILL_GROUPS.length,5);assert.equal(SKILL_KEYS.length,21);assert.deepEqual(result.incomplete,[]);
});

test('real D1 identity grants only the protected primary account; revocation immediately denies access',async t=>{
 const {fixture:authFixture}=await import('./helpers/auth-d1-fixture.mjs');const {tokenDigest}=await import('../worker/account-recovery.js');const {PRIMARY_ADMIN_EMAIL}=await import('../worker/primary-administrator.js');const {readFileSync}=await import('node:fs');
 const f=await authFixture(t);await f.db.prepare(readFileSync(new URL('../migrations/20261026_private_skills.sql',import.meta.url),'utf8')).run();
 for(const sql of readFileSync(new URL('../migrations/20261026_private_skills_pin.sql',import.meta.url),'utf8').split(';').filter(s=>s.trim()))await f.db.prepare(sql).run();
 const verifiedTeams=[{id:18,Namn:'NSK Team 18','Säsong':'2026'}];let rosterReads=0;const handler=createPrivateSkillsHandler(f.env,async()=>verifiedTeams,{readRoster:async()=>{rosterReads++;return [{id:'101',name:'Synthetic Player'}];}});
 assert.equal((await handler(request('GET',undefined,f.tokens.root))).status,403);assert.equal((await handler(request('GET',undefined,f.tokens.user))).status,403);assert.equal(rosterReads,0);
 const token='primary-private-skills-test-session-2026';await f.db.prepare('INSERT INTO auth_users(id,email,display_name,password_hash,disabled) VALUES(?,?,?,?,0)').bind(PRIMARY_ADMIN_ID,PRIMARY_ADMIN_EMAIL,'Primary test','unused').run();await f.db.prepare("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+2 hours'))").bind(await tokenDigest(token),PRIMARY_ADMIN_ID).run();
 const setup=await handler(request('POST',{action:'setup',pin:'7392',confirmPin:'7392'},token,'18','/api/skills/pin'));assert.equal(setup.status,400);
 const pinRequest=new Request('https://test/api/skills/pin',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'setup',pin:'7392',confirmPin:'7392'})});const pin=await(await handler(pinRequest)).json();assert(pin.unlock);
 assert.equal((await handler(request('GET',undefined,token))).status,423);
 assert.equal((await handler(request('PUT',{revision:0,enabled:true,cards:{101:blank()}},token,'18','/api/skills',pin.unlock))).status,200);assert.equal((await handler(request('GET',undefined,token,'18','/api/skills',pin.unlock))).status,200);assert.equal((await f.db.prepare('SELECT revision FROM private_skills_boards WHERE team_id=?').bind('18').first()).revision,1);
 await f.db.prepare("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE token_hash=?").bind(await tokenDigest(token)).run();const before=rosterReads;assert.equal((await handler(request('GET',undefined,token))).status,401);assert.equal(rosterReads,before);
});


test('criteria cover all 21 skills and distinguish passing decisions from passing technique',async()=>{
 const {SKILL_CRITERIA,SKILLS_GUIDANCE}=await import('../worker/skills-criteria.js');
 assert.deepEqual(Object.keys(SKILL_CRITERIA).sort(),[...SKILL_KEYS].sort());
 for(const criterion of Object.values(SKILL_CRITERIA)){assert(criterion.question.endsWith('?'));assert.equal(criterion.bands.length,5);assert(criterion.bands.every(text=>typeof text==='string'&&text.length>20));}
 assert.equal(SKILLS_GUIDANCE.bands.length,5);assert.equal(SKILLS_GUIDANCE.behaviorBands.length,5);
 assert.notEqual(SKILL_CRITERIA.pass.question,SKILL_CRITERIA.passing.question);
 const f=fixture(),response=await(await f.handler(request())).json();assert.equal(response.criteria.passing.question,SKILL_CRITERIA.passing.question);assert(response.guidance.withinBand);
});
test('legacy 20-skill cards keep ratings and assessment date; old clients cannot erase a new passing rating',async()=>{
 const f=fixture(),legacy=blank();legacy.ratings.forward=8;delete legacy.ratings.passing;const date='2026-10-20T10:00:00.000Z';
 const raw=JSON.stringify({101:{...legacy,assessedAt:date}});f.rows.set('18',{cards_json:raw,revision:1,enabled:1});
 const read=await(await f.handler(request())).json();assert.equal(read.cards['101'].ratings.forward,8);assert.equal(read.cards['101'].ratings.passing,null);assert.equal(read.assessedAt['101'],date);assert.equal(f.rows.get('18').cards_json,raw);
 assert.equal(validSkillsCards({101:legacy}),true);const invalid=structuredClone(legacy);delete invalid.ratings.shot;assert.equal(validSkillsCards({101:invalid}),false);
 const card=read.cards['101'];card.ratings.passing=9;assert.equal((await f.handler(request('PUT',{revision:1,enabled:true,cards:{101:card}}))).status,200);
 const old=structuredClone(legacy);old.notes='Legacy client edit';const saved=await(await f.handler(request('PUT',{revision:2,enabled:true,cards:{101:old}}))).json();assert.equal(saved.cards['101'].ratings.passing,9);assert.equal(saved.cards['101'].ratings.forward,8);
 saved.cards['101'].ratings.passing=null;const reset=await(await f.handler(request('PUT',{revision:3,enabled:true,cards:saved.cards}))).json();assert.equal(reset.cards['101'].ratings.passing,null);
});
test('passing awareness contributes to balanced groups independently of pass execution',()=>{
 const cards={};for(const id of ['1','2','3','4']){cards[id]=blank();for(const key of SKILL_KEYS)cards[id].ratings[key]=5;cards[id].ratings.passing=['1','2'].includes(id)?10:1;}
 const result=planSkills({mode:'training',playerIds:['1','2','3','4'],groupCount:2},cards,4);assert(result.groups.every(group=>group.filter(id=>['1','2'].includes(id)).length===1));
});
