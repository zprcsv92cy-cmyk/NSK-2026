import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {cupAddress,parseCupPages,importCuponline,validCup} from '../worker/cuponline-import.js';
import {createCupPlansHandler} from '../worker/cup-plans-api.js';import {fixture} from './helpers/auth-d1-fixture.mjs';
const address='https://cuponline.se/start.aspx?cupid=39900';
const start='<meta property="og:title" content="Rosvalla Gästabuds Cup U9"><meta name="description" content="Spelas 2027-04-03 - 2027-04-03"><span id="ctl00_cup_date">3 apr 2027</span><span id="ctl00_cup_play_place">Nyköping</span><span id="ctl00_cup_players_age">U9</span><div id="cuponline-main"><h1>Rosvalla Gästabuds Cup U9</h1><div class="editor-container"><p>Matchtid 2 x 8 min.</p><p>Spelaravgift 395 kr.</p><script>stealSecrets()</script></div></div>';
const teams='<a href="teamView.aspx?cupid=39900&id=1">NSK Svart</a><a href="teamView.aspx?cupid=39900&id=2">NSK Vit</a><a href="https://evil.test/team.aspx">Wrong Team</a><a href="teamView.aspx?cupid=39900&id=1">NSK Svart</a>';
const games='<div id="cuponline-main"><table><tr><th>Tid</th><th>Lag</th><th>Plan</th></tr><tr><td>09:00</td><td>NSK &amp; IK</td><td>A</td></tr></table></div>';
const imported=()=>parseCupPages(address,{start,teams,games,arenas:'<div id="cuponline-main"><h1>Arenor</h1><p>Rosvalla</p></div>'},new Date('2026-11-08T10:00:00Z'));
test('Cuponline URLs are constrained and canonicalized without forwarding user URL parameters',()=>{
 assert.deepEqual(cupAddress('https://www.cuponline.se/information.aspx?cupID=39900&lc=sv'),{cupId:'39900',sourceUrl:address});
 for(const value of ['http://cuponline.se/start.aspx?cupid=39900','https://cuponline.se.evil.test/start.aspx?cupid=39900','https://cuponline.se@127.0.0.1/start.aspx?cupid=39900','https://cuponline.se/admin/login.aspx?cupid=39900',address+'&cupID=39901',address.replace('39900','x'),address.replace('cuponline.se','cuponline.se:444')])assert.throws(()=>cupAddress(value),undefined,value);
});
test('cup parser extracts dates, information, teams and schedule without running or retaining scripts',()=>{
 const cup=imported();assert.equal(cup.name,'Rosvalla Gästabuds Cup U9');assert.equal(cup.startDate,'2027-04-03');assert.equal(cup.place,'Nyköping');assert.equal(cup.age,'U9');assert.match(cup.info,/395 kr/);assert.doesNotMatch(cup.info,/stealSecrets|script/);assert.deepEqual(cup.teams,['NSK Svart','NSK Vit']);assert.equal(cup.schedule[0][1],'NSK & IK');assert(validCup(cup));assert.equal(validCup({...cup,sourceUrl:'https://evil.test/'}),false);
 assert.throws(()=>parseCupPages(address,{start:'<h1>Not found</h1>'}));
});
test('import uses public requests only, tolerates missing optional pages and rejects redirect escapes',async()=>{
 const calls=[];const cup=await importCuponline(address,async(url,options)=>{calls.push({url,options});return new Response(url.includes('start.aspx')?start:teams,{status:url.includes('games.aspx')?503:200,headers:{'Content-Type':'text/html'}});});
 assert.equal(calls.length,4);assert.equal(cup.warnings.length,1);assert.equal(cup.schedule.length,0);assert(calls.every(c=>!c.options.headers.Authorization&&c.options.redirect==='manual'));
 await assert.rejects(importCuponline(address,async()=>new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private'}})),/omdirigerade/);
 await assert.rejects(importCuponline(address,async()=>new Response('x'.repeat(1000001),{headers:{'Content-Type':'text/html'}})),/stort/);
});
async function setup(t){const f=await fixture(t);await f.db.prepare(readFileSync(new URL('../migrations/20261108_cup_plans.sql',import.meta.url),'utf8')).run();await f.db.prepare('INSERT INTO auth_user_permissions VALUES(?,?)').bind(f.root,'pool:create').run();const fetches=[];const handler=createCupPlansHandler(f.env,async()=>[{id:18,Namn:'NSK Team 18','Säsong':'2026'},{id:19,Namn:'Other','Säsong':'2026'}],{fetcher:async(url,options)=>{fetches.push({url,options});return new Response(url.includes('start.aspx')?start:teams,{headers:{'Content-Type':'text/html'}});}});return {...f,handler,fetches};}
const request=(f,method,body,user='root',team=18)=>f.handler(new Request('https://test.invalid/api/cups?team_id='+team,{method,headers:{...(user?{Authorization:'Bearer '+f.tokens[user]}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
test('cup planning authorizes before fetch or write and shares saved plans only with team members',async t=>{
 const f=await setup(t);assert.equal((await request(f,'GET',null,null)).status,401);assert.equal((await request(f,'GET',null,'user',19)).status,403);assert.equal((await request(f,'POST',{url:address},'user')).status,403);assert.equal(f.fetches.length,0);
 const preview=await request(f,'POST',{url:address});assert.equal(preview.status,200);assert.equal((await f.db.prepare('SELECT count(*) AS n FROM cup_plans').first()).n,0);
 const cup=(await preview.json()).cup;assert.equal((await request(f,'PUT',{cup,notes:'Samling',status:'Planerad',revision:0})).status,200);
 const list=await(await request(f,'GET',null,'user')).json();assert.equal(list.canEdit,false);assert.equal(list.plans.length,1);assert.equal(list.plans[0].notes,'Samling');
 assert.equal((await request(f,'PUT',{cup,notes:'Viewer',status:'Anmäld',revision:1},'user')).status,403);assert.equal((await request(f,'POST',{url:'https://evil.test/'})).status,400);
});
test('cup planning uses revisions for updates, duplicate imports and deletion',async t=>{
 const f=await setup(t),body={cup:imported(),notes:'Original',status:'Planerad',revision:0};
 assert.equal((await request(f,'PUT',body)).status,200);assert.equal((await request(f,'PUT',body)).status,409);
 assert.equal((await request(f,'PUT',{...body,notes:'Updated',revision:1})).status,200);assert.equal((await request(f,'PUT',{...body,notes:'Stale',revision:1})).status,409);
 assert.equal((await request(f,'DELETE',{cupId:'39900',revision:1})).status,409);assert.equal((await request(f,'DELETE',{cupId:'39900',revision:2})).status,200);
 assert.equal((await(await request(f,'GET')).json()).plans.length,0);
});
test('frontend package and persistent navigation include the cup planner',()=>{
 for(const path of ['navigation.js','app-shell.js','shell-entry.js','account-access.js','scripts/assemble-frontend.mjs'])assert.match(readFileSync(new URL('../'+path,import.meta.url),'utf8'),/cupplanerare/);
 assert.match(readFileSync(new URL('../worker/production-api-v42-reference.js',import.meta.url),'utf8'),/createCupPlansHandler/);
});
