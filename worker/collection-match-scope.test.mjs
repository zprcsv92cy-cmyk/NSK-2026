import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCollectionMatchScope,collectionMatchFilters} from './collection-match-scope.js';
import {readPersonallyAuthorizedTeamCollection as read} from './production-team-collection-read.js';
const token='a'.repeat(43), actor={user:{id:'synthetic'},memberships:[{team_id:'NSK Team 18',role:'coach'}],permissions:['read']};
const request=query=>new Request('https://api.invalid/api/bytesschema?team_id=18&'+query,{headers:{Authorization:'Bearer '+token}});
const pools=[{id:10,Lag:[18],'Antal lag':1},{id:20,Lag:[27],'Antal lag':1}];
const deps={verifyPersonalSession:async()=>actor,listTrustedTeams:async()=>[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]};
test('scope filters use fixed field names and AND for pool, own team and match',()=>{
 const scope=parseCollectionMatchScope(new URL(request('pool_id=10&lag_no=1&match_no=3').url),'bytesschema');
 assert.deepEqual(collectionMatchFilters('bytesschema',scope),{filter_type:'AND',filters:[{field:'Poolspel',type:'link_row_has',value:'10'},{field:'Lagnummer',type:'equal',value:'1'},{field:'Matchnummer',type:'equal',value:'3'}],groups:[]});
 assert.equal(collectionMatchFilters('poolspel'),null);
});
test('malformed and duplicate match selectors stop before database reads',async()=>{
 for(const query of ['match_no=0','lag_no=-1','pool_id=1&pool_id=2','match_no=1&match_no=1','pool_id=9007199254740992','match_no=1%26filter_type=OR']){
  let reads=0;const r=await read(request(query),{},{...deps,readRows:async()=>{reads++;return [];}});assert.equal(r.status,400,query);assert.equal(reads,0);
 }
});
test('narrowing is passed to storage and enforced even if upstream returns extra matches or foreign rows',async()=>{
 const calls=[],rows=[{id:1,Poolspel:[10],Lagnummer:1,Matchnummer:3},{id:2,Poolspel:[10],Lagnummer:1,Matchnummer:4},{id:3,Poolspel:[20],Lagnummer:1,Matchnummer:3}];
 const r=await read(request('pool_id=10&lag_no=1&match_no=3'),{},{...deps,readRows:async(table,scope)=>{calls.push({table,scope});return table==='poolspel'?pools:rows;}});
 assert.equal(r.status,200);const body=await r.json();assert.deepEqual(body.results,[rows[0]]);assert.equal(body.count,1);assert.deepEqual(calls.find(c=>c.table==='bytesschema').scope,{pool_id:10,lag_no:1,match_no:3});
});
test('selecting a foreign pool cannot bypass ownership and unscoped callers still receive their authorized matches',async()=>{
 const rows=[{id:1,Poolspel:[10],Lagnummer:1,Matchnummer:3},{id:2,Poolspel:[10],Lagnummer:1,Matchnummer:4},{id:3,Poolspel:[20],Lagnummer:1,Matchnummer:3}];
 const d={...deps,readRows:async table=>table==='poolspel'?pools:rows};
 assert.deepEqual((await (await read(request('pool_id=20'),{},d)).json()).results,[]);
 assert.deepEqual((await (await read(request(''),{},d)).json()).results,rows.slice(0,2));
});
test('production route sends match filters on every Baserow page and keeps credential destination fixed',async t=>{
 const {default:worker}=await import('./production-api-v42-reference.js');
 const before=globalThis.fetch,calls=[];
 t.after(()=>{globalThis.fetch=before;});
 globalThis.fetch=async(input,init)=>{
  const url=new URL(input);assert.equal(url.origin,'https://api.baserow.io');assert.equal(init.headers.Authorization,'Token synthetic');calls.push(url);
  const table=Number(url.pathname.split('/')[5]);
  if(table===1255083)return Response.json({results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}],next:null});
  if(table===1255101)return Response.json({results:pools,next:null});
  assert.equal(table,1255115);
  const filters=JSON.parse(url.searchParams.get('filters'));assert.equal(filters.filters.length,3);assert.equal(filters.filters[2].value,'3');
  const page=Number(url.searchParams.get('page'));
  return Response.json({results:[{id:page,Poolspel:[10],Lagnummer:1,Matchnummer:3}],next:page===1?'https://untrusted.invalid/never-follow':null});
 };
 const env={BASEROW_TOKEN:'synthetic',AUTH_DB:{prepare(sql){return {bind(){return this;},async first(){return {id:'synthetic',display_name:'Synthetic',is_global_admin:0};},async all(){return {results:sql.includes('auth_team_memberships')?[{team_id:'NSK Team 18',role:'coach'}]:[{permission:'read'}]};}};}}};
 const r=await worker.fetch(request('pool_id=10&lag_no=1&match_no=3'),env,{});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).results.length,2);assert.equal(calls.filter(u=>u.pathname.includes('/1255115/')).length,2);
});
