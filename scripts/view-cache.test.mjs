import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../view-cache.js',import.meta.url),'utf8');
function fixture(){
 const storage=new Map();let token='private-token',user='u1',team='A',allowed=true,permissions=['read'],now=10000,quota=false;
 const sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(quota)throw Error('quota');storage.set(k,v);},removeItem:k=>storage.delete(k)};
 const window={crypto:webcrypto,NSK_VERSION:'1',APP_CONFIG:{API_URL:'https://api.test'},Auth:{getToken:()=>token,getSession:()=>({user:{id:user},permissions,memberships:[{team_id:team,role:'coach'}]}),activeTeam:()=>team,can:()=>allowed}};
 vm.runInNewContext(code,{window,sessionStorage,TextEncoder,Uint8Array,Date:{now:()=>now}});
 return {cache:window.NSKViewCache,storage,change:values=>{if('token'in values)token=values.token;if('user'in values)user=values.user;if('team'in values)team=values.team;if('allowed'in values)allowed=values.allowed;if('permissions'in values)permissions=values.permissions;},advance:n=>now+=n,quota:()=>quota=true};
}
test('presentation snapshots are isolated by user, token, team and verified permissions without storing credentials',async()=>{
 for(const values of [{team:'B'},{user:'u2'},{token:'other-token'},{permissions:['read','roster:manage']},{allowed:false}]){
  const f=fixture(),view=await f.cache.open('roster');view.save({players:['A']});assert.equal(JSON.stringify((await f.cache.open('roster')).data),JSON.stringify({players:['A']}));assert(!JSON.stringify([...f.storage]).includes('private-token'));
  const active=await f.cache.open('roster');assert.equal(active.current(),true);f.change(values);assert.equal(active.current(),false);assert.equal((await f.cache.open('roster')).data,null);
 }
});
test('late reads cannot repopulate cache after writes, logout or identity changes',async()=>{
 const f=fixture(),old=await f.cache.open('calendar');old.save({old:true});f.cache.clear();old.save({late:true});assert.equal((await f.cache.open('calendar')).data,null);assert.equal(old.current(),false);
 const current=await f.cache.open('calendar');f.change({token:'new'});current.save({late:true});assert.equal((await f.cache.open('calendar')).data,null);
});
test('snapshots expire, empty results are valid, and unavailable storage does not block live data',async()=>{
 const f=fixture();(await f.cache.open('roster')).save([]);assert.equal(JSON.stringify((await f.cache.open('roster')).data),'[]');f.advance(300001);assert.equal((await f.cache.open('roster')).data,null);f.quota();const v=await f.cache.open('roster');assert.doesNotThrow(()=>v.save(['fresh']));assert.equal(v.current(),true);
});
test('authorization denials are distinct from transient connectivity failures',()=>{
 const f=fixture();assert(f.cache.denied({status:403}));assert(f.cache.denied(Error('API-fel för spelare: 401')));assert(!f.cache.denied(Error('Failed to fetch')));
});

test('a slower earlier read cannot replace the most recent read of the same resource',async()=>{
 const f=fixture(),older=await f.cache.open('roster'),newer=await f.cache.open('roster');assert.equal(older.current(),false);newer.save(['new']);older.save(['old']);assert.equal(JSON.stringify((await f.cache.open('roster')).data),'["new"]');
});
