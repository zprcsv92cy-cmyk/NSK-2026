import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const code=readFileSync(new URL('../auth.js',import.meta.url),'utf8');
const cfg={ API_URL:'https://nsk-api.test', AUTH_URL:'https://auth-staging.test',
  PRODUCTION_AUTH_URL:'https://nsk-api.test', AUTH_MODE:'production' };
function storage(values={}){
  const data=new Map(Object.entries(values));
  return {getItem:key=>data.get(key)??null,
    setItem:(key,val)=>data.set(key,String(val)),
    removeItem:key=>data.delete(key)};
}
const saved=storage({nsk_user_token:'staging-do-not-send',nsk_active_team:'NSK Team 18'});
const requests=[];
const identity={user:{id:'u1',name:'Test'},memberships:[{team_id:'NSK Team 18',role:'viewer'}],permissions:['read']};
const fetch=async (url,options={})=>{
  requests.push({url:String(url),headers:options.headers||{}});
  if(String(url)==='https://nsk-api.test/api/auth/me')
    return Response.json(identity);
  if(String(url).includes('/api/personal/lag')) {
    assert.equal(options.headers.Authorization,'Bearer production-only');
    return Response.json({results:[{id:18,Namn:'NSK Team 18','Säsong':2026}]});
  }
  if(String(url).includes('/api/personal/')){
    assert.equal(options.headers.Authorization,'Bearer production-only');
    assert.match(String(url),/team_id=18/);
    if(String(url).includes('/spelare'))return Response.json({ok:true,results:[{id:1,Namn:'Player',Lag:[18]}],next:null});
    return Response.json({ok:true,results:[],next:null});
  }
  throw Error('Unexpected URL: '+url);
};
const context={window:{APP_CONFIG:cfg},sessionStorage:saved,fetch,Response,URLSearchParams,
  console};
vm.runInNewContext(code,context);
assert.equal(context.window.Auth.getMode(),'production');
assert.equal(await context.window.Auth.init(),null,'Staging token must not become production identity');
assert.equal(requests.length,0,'No staging token may be sent to any API');
saved.setItem('nsk_prod_user_token','production-only');
await context.window.Auth.init();
context.window.Auth.selectTeam('NSK Team 18');
await assert.rejects(()=>context.window.Auth.stagingRosterList(),/Testtruppen/);
const rows=await context.window.Auth.personalRosterList();
assert.equal(rows.players[0].id,1);
assert.equal(rows.coaches.length,0);
assert.equal(rows.staff.length,0);
assert.equal(saved.getItem('nsk_user_token'),'staging-do-not-send','Staging token preserved in separate key');
assert.ok(requests.every(x=>!String(x.headers.Authorization||'').includes('staging-do-not-send')));
console.log('PASS production mode never leaks staging session and scoped read works');
