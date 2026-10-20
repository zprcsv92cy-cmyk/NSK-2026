import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../pool-team-editor.js',import.meta.url),'utf8');

async function start({personal,allowed,loggedIn=true}){
  const listeners=new Map(), requests=[], mutations=[];
  const elements=Object.fromEntries(['poolTeamEditor','poolTeamCount','poolTeamSave','poolTeamMessage'].map(id=>[id,{hidden:true,disabled:false,value:'',textContent:'',addEventListener:(event,fn)=>listeners.set(id+':'+event,fn)}]));
  const calls=[];
  const sandbox={
    window:{
      APP_CONFIG:{API_URL:'https://api.invalid',REQUIRE_PERSONAL_POOL_WRITES:personal},
      Auth:{
        getSession:()=>loggedIn?{user:{id:'test'}}:null,
        init:async()=>{calls.push('init');return null},
        activeTeam:()=>loggedIn?'NSK Team 18':null,
        checkTeamFeature:async(feature,team)=>{calls.push(feature+':'+team);return allowed},
      },
      DB:{getPool:async()=>({teams:3}),updatePoolTeams:async(id,teams)=>{mutations.push({id,teams})}},
      addEventListener:(event,fn)=>listeners.set('window:'+event,fn)
    },
    document:{getElementById:id=>elements[id],addEventListener:(event,fn)=>listeners.set('document:'+event,fn)},
    sessionStorage:{getItem:()=> '42'},
    localStorage:{getItem:()=>personal?null:'legacy-session'},
    fetch:async()=>{requests.push('legacy-admin-status');return {json:async()=>({admin:true})}},
    location:{reload:()=>{}},
    MutationObserver:class{observe(){}},
    setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,
    console
  };
  vm.runInNewContext(source,sandbox);
  await new Promise(resolve=>setTimeout(resolve,0));
  return {elements,calls,requests,mutations,listeners};
}

test('pool team editor permits personal grant without legacy admin status',async()=>{
  const x=await start({personal:true,allowed:true});
  assert.equal(x.elements.poolTeamEditor.hidden,false);
  assert.equal(x.elements.poolTeamSave.disabled,false);
  assert.deepEqual(x.requests,[]);
  assert.ok(x.calls.includes('pool:NSK Team 18'));
  await x.listeners.get('poolTeamSave:click')();
  assert.deepEqual(x.mutations,[{id:'42',teams:3}]);
});

test('pool team editor denies unauthorized personal account and does not query admin status',async()=>{
  const x=await start({personal:true,allowed:false});
  assert.equal(x.elements.poolTeamEditor.hidden,true);
  assert.equal(x.elements.poolTeamSave.disabled,true);
  assert.deepEqual(x.requests,[]);
  await x.listeners.get('poolTeamSave:click')();
  assert.equal(x.mutations.length,0);
});

test('legacy admin editor still exists when personal rollout disabled',async()=>{
  const x=await start({personal:false,allowed:false});
  assert.match(source,/\/api\/admin\/status/);
  assert.equal(x.listeners.has('poolTeamSave:click'),true);
  assert.equal(x.requests.length,0);
});
