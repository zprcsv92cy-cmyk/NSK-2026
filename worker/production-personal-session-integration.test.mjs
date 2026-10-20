import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPersonalRosterIdentityVerifier} from './personal-roster-identity-adapter.js';
import {authorizePersonalPoolWrite} from './production-pool-write-authorization.js';
const token='q'.repeat(43);
function env({team='NSK Team 18',valid=true,role='team_admin'}={}){
 const hash=createHash('sha256').update(token).digest('hex');
 return {AUTH_DB:{prepare(sql){return {bind(...args){assert.equal(args[0],sql.includes('auth_sessions')?hash:'u1');return this},
 async first(){return valid?{id:'u1',display_name:'Test',is_global_admin:0}:null},
 async all(){return {results:sql.includes('auth_team_memberships')?[{team_id:team,role}]:[{permission:'pool:create'}]}}}}}};
}
const request=()=>new Request('https://test.invalid/api/poolspel',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({team_id:'NSK Team 18'})});
const options={listTeams:async()=>[{id:18,Namn:'NSK Team 18','Säsong':'2026'}],readPool:async()=>null};
test('actual D1 session verifier permits correct membership and denies different team',async()=>{
 for(const [state,expected] of [[{},200],[{team:'NSK Testlag 2'},403],[{valid:false},401],[{role:'viewer'},403]]){
  const result=await authorizePersonalPoolWrite(request(),env(state),options);
  assert.equal(result.status,expected);
  assert.equal(result.allowed,expected===200);
 }
});
test('actual D1 verifier never accepts unknown bearer',async()=>{
 assert.equal(await createPersonalRosterIdentityVerifier(env())('x'.repeat(43)),null);
});
