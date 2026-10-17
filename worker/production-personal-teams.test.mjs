import assert from 'node:assert/strict';
import {handlePersonalTeamList} from './production-personal-teams.js';
import candidate from './production-entry-candidate.js';

const base='https://nsk-api.invalid';
const bearer='A'.repeat(43);
const request=(token=bearer)=>new Request(base+'/api/personal/lag',{
  headers:{Origin:'https://zprcsv92cy-cmyk.github.io',
    ...(token?{Authorization:'Bearer '+token}:{})}
});
const env={BASEROW_TOKEN:'test-only',AUTH_DB:{prepare:sql=>({bind:()=>({
  first:async()=>({id:'u1',display_name:'Test'}),
  all:async()=>({results:sql.includes('auth_team_memberships')?
    [{team_id:'NSK Team 18',role:'team_admin'}]:
    [{permission:'read'}]})
})})}};
const rows=[
  {id:18,Namn:'NSK Team 18','Säsong':'2026'},
  {id:27,Namn:'NSK Testlag 2','Säsong':'2026'},
  {id:28,Namn:'NSK Team 18','Säsong':'2025'}
];
const savedFetch=globalThis.fetch;
globalThis.fetch=async resource=>{
  assert.match(String(resource),/\/1255083\//);
  return Response.json({results:rows,next:null});
};
try{
  let response=await handlePersonalTeamList(request(),env);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.results,[rows[0]]);
  assert.equal(data.results.some(row=>row.id===27),false);
  response=await handlePersonalTeamList(request(null),env);
  assert.equal(response.status,401);
  response=await handlePersonalTeamList(request(),{BASEROW_TOKEN:'test-only'});
  assert.equal(response.status,503);
  response=await candidate.fetch(request(),env,{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('access-control-allow-origin'),'https://zprcsv92cy-cmyk.github.io');
  assert.deepEqual((await response.json()).results,[rows[0]]);
  const denied=await candidate.fetch(new Request(base+'/api/personal/lag',{
    headers:{Origin:'https://other.example',Authorization:'Bearer '+bearer}}),env,{});
  assert.equal(denied.status,403);
  console.log('PASS production personal team list: only own team and CORS scope');
}finally{globalThis.fetch=savedFetch;}
