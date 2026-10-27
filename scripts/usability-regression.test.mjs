import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
import {withPoolFlow} from '../worker/pool-flow-api.js';import {withPagesOrigin} from '../worker/pages-migration.js';
import {readPersonallyAuthorizedTeamCollection} from '../worker/production-team-collection-read.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('pool preflight permits only exact app origins, route methods and approved headers, without reading data',async()=>{
 let touched=0;const handler=withPagesOrigin(withPoolFlow(()=>{throw Error('Unexpected delegation');},{resolveTables:()=>{touched++;return {};},listTeams:()=>{throw Error('No data access');},verifyIdentity:()=>null,authorize:()=>({allowed:false})}));
 const env={NSK_POOL_FLOW_ENABLED:'true',NSK_PAGES_MIGRATION_ENABLED:'true'};
 for(const origin of ['https://nsk18.pages.dev','https://zprcsv92cy-cmyk.github.io'])for(const [route,method]of [['material','GET'],['material','PUT'],['lineup','POST'],['match-info','POST']]){
  const response=await handler(new Request('https://api.test/api/poolspel/10/'+route,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':method,'Access-Control-Request-Headers':'authorization,content-type'}}),env);
  assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);assert.match(response.headers.get('Access-Control-Allow-Methods'),new RegExp(method));
 }
 assert.equal(touched,0);
 for(const headers of [{Origin:'https://evil.test','Access-Control-Request-Method':'GET'},{Origin:'https://nsk18.pages.dev','Access-Control-Request-Method':'DELETE'},{Origin:'https://nsk18.pages.dev','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'x-admin'}])assert.equal((await handler(new Request('https://api.test/api/poolspel/10/material',{method:'OPTIONS',headers}),env)).status,403);
 const anonymous=await handler(new Request('https://api.test/api/poolspel/10/material',{headers:{Origin:'https://nsk18.pages.dev'}}),env);assert.equal(anonymous.status,401);assert.equal(anonymous.headers.get('Access-Control-Allow-Origin'),'https://nsk18.pages.dev');
});
test('match filters narrow the real authorized response and cannot bypass missing identity or shared-pool ownership',async()=>{
 const actor={user:{id:'synthetic'},permissions:['read'],memberships:[{team_id:'NSK Team 18',role:'coach'}]};
 const teams=[{id:18,Namn:'NSK Team 18','Säsong':'2026'},{id:22,Namn:'Other','Säsong':'2026'}];
 const data={poolspel:[{id:10,Lag:[18,22],'Antal lag':2}],matchkonfiguration:[{id:30,Poolspel:[10],Lagnummer:1,Matchnummer:1},{id:31,Poolspel:[10],Lagnummer:2,Matchnummer:1}],laguppstallningar:[{id:40,Poolspel:[10],Matchkonfiguration:[30]},{id:41,Poolspel:[10],Matchkonfiguration:[31]}],bytesschema:[{id:50,Poolspel:[10],Lagnummer:1,Matchnummer:1},{id:51,Poolspel:[10],Lagnummer:2,Matchnummer:1}]};
 const original=req=>readPersonallyAuthorizedTeamCollection(req,{}, {listTrustedTeams:async()=>teams,readRows:async table=>data[table],verifyPersonalSession:async()=>actor});
 const handle=withPoolFlow(original,{}),env={NSK_POOL_FLOW_ENABLED:'true'};
 const run=(path,token=true)=>handle(new Request('https://api.test/api/'+path,{headers:token?{Authorization:'Bearer '+'a'.repeat(43)}:{}}),env);
 for(const table of ['bytesschema','matchkonfiguration']){const own=await (await run(table+'?team_id=18&pool_id=10&lag_no=1&match_no=1')).json();assert.equal(own.results.length,1);assert.equal((await (await run(table+'?team_id=18&pool_id=10&lag_no=2&match_no=1')).json()).results.length,0);assert.equal((await run(table+'?team_id=18&pool_id=10',false)).status,401);assert.equal((await run(table+'?team_id=22&pool_id=10')).status,403);assert.equal((await run(table+'?team_id=18&pool_id=10&pool_id=20')).status,400);}
 assert.equal((await (await run('laguppstallningar?team_id=18&match_config_id=31')).json()).results.length,0);assert.equal((await (await run('laguppstallningar?team_id=18&match_config_id=30')).json()).results[0].id,40);
});
function dbClient(imported=false){
 const calls=[];let token='a'.repeat(43);const config={API_URL:'https://api.test',REQUIRE_SCOPED_COLLECTION_READS:true,REQUIRE_SCOPED_TEAM_READS:true};
 const context={window:{APP_CONFIG:config,Auth:{getToken:()=>token,activeTeam:()=> 'NSK Team 18'}},URL,fetch:async url=>{calls.push(url);const table=new URL(url).pathname.split('/').pop();const results=table==='lag'?[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]:table==='poolspel'?[{id:10,Lag:[18],Aktiv:false,Status:'Avslutat','Antal lag':2,'Antal matcher':3,nsk_calendar_imported:imported}]:table==='matchkonfiguration'?[{id:1,Poolspel:[10],Lagnummer:1,Matchnummer:1,Starttid:'09:00',Motståndare:'A'},{id:2,Poolspel:[10],Lagnummer:1,Matchnummer:2,Starttid:'09:30',Motståndare:'B'},{id:3,Poolspel:[10],Lagnummer:2,Matchnummer:1,Starttid:'10:00',Motståndare:'C'}]:[];return {ok:true,json:async()=>({ok:true,results,next:null})};}};
 vm.runInNewContext(read('db.js'),context);return {api:context.window.DB,calls,changeToken:()=>token='b'.repeat(43)};
}
test('manual and imported closed pools share one match-plan API and keep their saved information',async()=>{
 for(const imported of [false,true]){const x=dbClient(imported),plan=await x.api.listPoolMatchPlan(10);assert.equal(plan.length,imported?3:6);assert.equal(plan[0].opponent,'A');assert.equal(plan[0].start_time,'09:00');assert.equal(plan.find(p=>p.lag_no===2&&p.match_no===1).opponent,'C');assert.equal((await x.api.getPool(10)).active,false);if(imported)assert.equal(plan.filter(p=>p.lag_no===2).length,1);}
});
test('read snapshots deduplicate sequential collection reads only within an operation and separate identities',async()=>{
 const x=dbClient();await x.api.withReadSnapshot(async()=>{await x.api.getPool(10);await x.api.listPoolMatchPlan(10);await x.api.getPoolTeamMatchConfig(10,1,1);});
 for(const table of ['lag','poolspel','matchkonfiguration'])assert.equal(x.calls.filter(url=>url.includes('/api/'+table+'?')).length,1,table);
 await x.api.getPool(10);assert.equal(x.calls.filter(url=>url.includes('/api/poolspel?')).length,2);
 await x.api.withReadSnapshot(async()=>{await x.api.getPool(10);x.changeToken();await x.api.getPool(10);x.api.invalidateReads();await x.api.getPool(10);});assert.equal(x.calls.filter(url=>url.includes('/api/poolspel?')).length,5);
});
test('a material service failure cannot hide a saved manual or imported shift table, closed checks remain locked',async()=>{
 const source=read('app.js'),section=source.slice(source.indexOf('  async function renderShiftSchemaData()'),source.indexOf('  async function getCoachNamesForLag'));
 for(const imported of [false,true]){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:true,attributes:{},setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]},addEventListener(){},querySelectorAll:()=>[]});return nodes.get(id);};
  const context={shiftViewGeneration:0,shiftUndo:null,byId:id=>id==='repairOutdatedShifts'?null:node(id),setText:(id,text)=>node(id).textContent=text,sessionStorage:{getItem:k=>k==='nsk2_pool_id'?'10':'1',setItem(){}},DB:{getPool:async()=>({active:false,calendar_imported:imported,players_on_field:1,place:'Test',pool_date:'2026-10-11'}),listPoolTeamMatchConfigs:async()=>[{id:30,lag_no:1,match_no:1,goalie_player_id:1,player_count:1,players_on_field:[1,2],opponent:'Away'}],listShiftSchema:async()=>[{id:90,shift_no:1,time_left:'15:00',players_json:[2],done:true}],getPoolMaterial:async()=>{throw Error('Network unavailable');}},getPlayersCached:async()=>[{id:1,full_name:'Goalie'},{id:2,full_name:'Player'}],getCoachesCached:async()=>[],getCoachNamesForLag:async()=> 'Coach',esc:String,shortName:String,setActiveShiftTeamButton(){},setActiveShiftMatchButton(){},document:{querySelectorAll:()=>[]},window:{}};
  vm.runInNewContext(section+';globalThis.run=renderShiftSchemaData',context);const loading=context.run();let prevented=false;node('openMatchView').onclick({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(node('openMatchView').attributes['aria-disabled'],'true');await loading;assert.match(node('shiftTableWrap').innerHTML,/<table/);assert.match(node('shiftTableWrap').innerHTML,/Player/);assert.match(node('shiftTableWrap').innerHTML,/aria-pressed="true" disabled/);assert.equal(node('shiftEquipmentName').textContent,'Kunde inte hämtas');assert.equal(node('openMatchView').textContent,'Visa matchvy');assert.equal(node('appError').textContent,'');
 }
});
test('local exercise backups round-trip binary files and reject malformed or oversized input before storage',async()=>{
 const context={window:{},Blob,Uint8Array,btoa,atob,crypto:webcrypto,Date};vm.runInNewContext(read('exercise-backup.js'),context);const api=context.window.NSKExerciseBackup;
 const original={title:'Övning',description:'Passning',category:'Passningar',filename:'ovning.png',blob:new Blob([new Uint8Array([0,1,127,128,255])],{type:'image/png'})};
 const encoded=await api.encode([original]),decoded=api.decode(encoded);assert.equal(decoded[0].title,'Övning');assert.deepEqual([...new Uint8Array(await decoded[0].blob.arrayBuffer())],[0,1,127,128,255]);assert.match(decoded[0].id,/^[a-f0-9-]{36}$/);
 assert.throws(()=>api.decode({...encoded,version:2}),/Ogiltig/);assert.throws(()=>api.decode({...encoded,files:[{...encoded.files[0],filename:'evil.html'}]}),/ogiltig/);assert.throws(()=>api.decode({...encoded,files:[{...encoded.files[0],data:'!'}]}),/ogiltig/);
 await assert.rejects(api.encode([{...original,blob:{size:51*1024*1024}}]),/50 MB/);
});
test('print actions are unavailable while the shift table is absent or refreshing',()=>{
 const table={getAttribute:()=> 'false',querySelector:()=>null};const context={window:{},document:{getElementById:id=>id==='shiftPrintButton'?{}:id==='shiftTableWrap'?table:null,addEventListener(){}},MutationObserver:class{},Event};
 vm.runInNewContext(read('print-view.js'),context);assert.equal(context.window.NSKPrint.ready(),false);table.querySelector=()=>({});assert.equal(context.window.NSKPrint.ready(),true);table.getAttribute=()=> 'true';assert.equal(context.window.NSKPrint.ready(),false);
});
test('the print preview opens synchronously, has no opener, and prints only after its explicit button is pressed',async()=>{
 const element=tag=>({tag,children:[],append(...nodes){this.children.push(...nodes);},setAttribute(){}});
 const head=element('head'),body=element('body'),previewDocument={head,body,images:[],open(){},write(){},close(){},createElement:element,importNode:node=>node,querySelectorAll:()=>[]};let prints=0;
 const tab={document:previewDocument,focus(){},close(){},print(){prints++;},opener:{}};
 const context={window:{open:()=>tab},document:{body:{className:'nsk-arena lineup-page'},head:{querySelectorAll:()=>[]},addEventListener(){}},MutationObserver:class{},Event};vm.runInNewContext(read('print-view.js'),context);
 context.window.NSKPrint.preview('Saved match',element('article'));assert.equal(tab.opener,null);assert.equal(prints,0);const button=body.children[0].children.find(n=>n.tag==='button');assert.equal(button.disabled,true);await Promise.resolve();await Promise.resolve();assert.equal(button.disabled,false);button.onclick();assert.equal(prints,1);assert.equal(body.className.includes('nsk-arena'),false);
 context.window.open=()=>null;assert.throws(()=>context.window.NSKPrint.preview('Match',element('article')),/popup/);
});
test('sharing a cached account invitation never extends its original expiry',async()=>{
 const code=read('account-users.js'),section=code.slice(code.indexOf(' async function linkAction('),code.indexOf(' function render()'));let now=0,calls=0;const cache=new Map();
 const context={shareLinks:cache,Date:{now:()=>now},api:async()=>({token:'token-'+(++calls),expires_in_minutes:120}),document:{createElement:()=>({})},button:()=>({}),navigator:{share:async()=>{}},location:{href:'https://nsk18.pages.dev/anvandare/'},URL,URLSearchParams,message(){}};
 vm.runInNewContext(section+';globalThis.run=linkAction',context);const user={id:'u1',setup_required:true,name:'Synthetic'},root={replaceChildren(){},append(){}};
 await context.run(user,root,false,true);const expires=cache.get('u1').until;now=119*60000;await context.run(user,root,false,true);assert.equal(cache.get('u1').until,expires);assert.equal(calls,1);now=121*60000;await context.run(user,root,false,true);assert.equal(calls,2);
});
