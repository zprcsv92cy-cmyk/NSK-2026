import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import worker from './production-api-v42-reference.js';

const bearer='p'.repeat(43);
const title='Isolated route test - no remote writes';
const payload={team_id:'NSK Team 18',title,place:'Teststad',hall:'Testhall',pool_date:'2026-12-01',status:'Aktiv',teams:2,matches:2,players_on_field:5,periods:2,period_time:15,sub_time:120};
const team={id:18,Namn:'NSK Team 18','Säsong':'2026'};
function fixture(memberTeam){
 const writes=[];
 const db={prepare(sql){
  const query={bind(...args){query.args=args;return query},
   async first(){if(!sql.includes('auth_sessions'))throw Error('Unexpected first');assert.equal(query.args[0],createHash('sha256').update(bearer).digest('hex'));return {id:'test-only',display_name:'Test account',is_global_admin:0}},
   async all(){if(sql.includes('auth_team_memberships'))return {results:[{team_id:memberTeam,role:'team_admin'}]};if(sql.includes('auth_user_permissions'))return {results:[{permission:'pool:create'}]};throw Error('Unexpected query') }};
  return query;
 }};
 const env={AUTH_DB:db,BASEROW_TOKEN:'test-only-not-a-real-secret',BASEROW_DATABASE_ID:'589073',NSK_REQUIRE_PERSONAL_POOL_WRITES:'true',NSK_REQUIRE_PERSONAL_MATCH_WRITES:'true',NSK_REQUIRE_PERSONAL_COACH_SELECTION:'true'};
 return {writes,env};
}
function req(){return new Request('https://api.example.invalid/api/poolspel',{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify(payload)})}
async function run(memberTeam){
 const {writes,env}=fixture(memberTeam);
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init={})=>{
  const u=new URL(String(url));
  assert.equal(u.origin,'https://api.baserow.io','No real external network');
  if(u.pathname.endsWith('/1255083/'))return Response.json({results:[team],next:null});
  if(u.pathname.endsWith('/1255101/')&&init.method==='POST'){
    const row=JSON.parse(init.body);writes.push(row);return Response.json({id:999,...row});
  }
  throw Error('Unexpected mock request '+u.pathname);
 };
 try{const response=await worker.fetch(req(),env);return {status:response.status,data:await response.json(),writes};}
 finally{globalThis.fetch=original;}
}
test('real Worker router creates a pool for Team 18 with D1 auth and mocked Baserow',async()=>{
 const r=await run('NSK Team 18');
 assert.equal(r.status,201,JSON.stringify(r.data));
 assert.equal(r.data.ok,true);
 assert.equal(r.writes.length,1);
 assert.deepEqual(r.writes[0].Lag,[18]);
 assert.equal(r.writes[0].Namn,title);
});
test('real Worker router denies Testlag 2 member before any Baserow mutation',async()=>{
 const r=await run('NSK Testlag 2');
 assert.equal(r.status,403,JSON.stringify(r.data));
 assert.equal(r.writes.length,0);
});
