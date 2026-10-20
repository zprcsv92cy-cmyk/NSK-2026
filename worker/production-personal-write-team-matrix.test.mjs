import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizePersonalPoolWrite } from './production-pool-write-authorization.js';
import { authorizePersonalMatchWrite } from './production-match-write-authorization.js';
import { authorizeCoachSelection } from './production-coach-selection-authorization.js';

const token = 'm'.repeat(43);
const teams = [
  {id:18,Namn:'NSK Team 18','Säsong':'2026'},
  {id:19,Namn:'NSK Testlag 2','Säsong':'2026'}
];
const member = (team='NSK Team 18',grants=['pool:create','pool:finish','pool:reopen','match:manage','lineup:edit','read'],role='team_admin')=>({
  user:{id:'test-user'}, memberships:[{team_id:team,role}],permissions:grants
});
const post = (path,body,method='POST') => new Request('https://nsk-api.example'+path,{
  method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify(body)
});
const poolRow = team=>({id:42,Lag:[{id:team}],'Antal lag':2,'Antal matcher':2});
const checks = [
  {
    name:'pool create',
    req:()=>post('/api/poolspel',{team_id:'NSK Testlag 2'}),
    fn:authorizePersonalPoolWrite,feature:'pool',fixedTeam:true
  },
  {
    name:'pool edit',
    req:()=>post('/api/poolspel/42',{team_id:'NSK Team 18'},'PATCH'),
    fn:authorizePersonalPoolWrite,feature:'pool'
  },
  {
    name:'pool finish',
    req:()=>post('/api/poolspel/42/aktiv',{active:false},'PATCH'),
    fn:authorizePersonalPoolWrite,feature:'pool_finish'
  },
  {
    name:'pool reopen',
    req:()=>post('/api/poolspel/42/aktiv',{active:true},'PATCH'),
    fn:authorizePersonalPoolWrite,feature:'pool_reopen'
  },
  {
    name:'match create',
    req:()=>post('/api/matchkonfiguration',{pool_id:42,team_id:'NSK Team 18'}),
    fn:authorizePersonalMatchWrite,feature:'matches'
  },
  {
    name:'match edit',
    req:()=>post('/api/matchkonfiguration/7',{pool_id:42,team_id:'NSK Team 18'},'PATCH'),
    fn:authorizePersonalMatchWrite,feature:'matches'
  },
  {
    name:'lineup save',
    req:()=>post('/api/laguppstallningar/7',{players:[],coaches:[],team_id:'NSK Team 18'}),
    fn:authorizePersonalMatchWrite,feature:'lineup'
  },
  {
    name:'coach save',
    req:()=>post('/api/coach-selection',{pool_id:42,lag_no:1,match_no:1,coach_ids:[],team_id:'NSK Team 18'}),
    fn:authorizeCoachSelection,feature:'lineup'
  }
];

function run(item,{actor=member(),owner=18}={}){
  return item.fn(item.req(),{AUTH_DB:{}},{
    listTeams:async()=>teams,
    readPool:async()=>poolRow(owner),
    readMatchConfig:async()=>({id:7,Poolspel:[{id:42}]}),
    verifyIdentity:async supplied=>supplied===token?actor:null
  });
}

test('authorized Team 18 admin may access every tested personal write feature',async()=>{
  for(const item of checks){
    const result=await run(item);
    assert.equal(result.allowed,true,item.name+': '+result.error);
    assert.equal(result.teamId,'NSK Team 18',item.name);
    if(result.feature)assert.equal(result.feature,item.feature,item.name);
  }
});

test('Team 18 membership never authorizes stored Testlag 2 write ownership',async()=>{
  for(const item of checks.filter(x=>!x.fixedTeam)){
    const result=await run(item,{owner:19});
    assert.equal(result.allowed,false,item.name);
    assert.equal(result.status,403,item.name+': '+result.error);
  }
});

test('Team 18 writes denied for Testlag 2-only member even when permitted globally',async()=>{
  for(const item of checks){
    const result=await run(item,{actor:member('NSK Testlag 2')});
    assert.equal(result.allowed,false,item.name);
    assert.equal(result.status,403,item.name);
  }
});

test('per-person permission is mandatory even with the correct team membership',async()=>{
  for(const item of checks){
    const result=await run(item,{actor:member('NSK Team 18',['read'])});
    assert.equal(result.allowed,false,item.name);
    assert.equal(result.status,403,item.name);
  }
});

test('viewer role cannot gain writes from permission strings alone',async()=>{
  for(const item of checks){
    const result=await run(item,{actor:member('NSK Team 18',undefined,'viewer')});
    assert.equal(result.allowed,false,item.name);
    assert.equal(result.status,403,item.name);
  }
});
