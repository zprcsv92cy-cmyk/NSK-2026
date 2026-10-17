import assert from 'node:assert/strict';
import {productionRateLimitedLogin} from './production-login-guard.js';

let attempts=0,logins=0,deletions=0;
const env={AUTH_DB:{prepare(sql){
  return {bind(...args){return {
    first:async()=>{
      assert.match(sql,/ON CONFLICT/);
      assert.match(args[0],/^[a-f0-9]{64}$/);
      assert.match(args[1],/^\d{4}-\d\d-\d\dT/);
      attempts++;
      return {attempts};
    },
    run:async()=>{assert.match(sql,/DELETE FROM auth_login_attempts/);deletions++;}
  };}};
}}};
const req=(email='example@nsk.invalid')=>new Request('https://nsk.invalid/api/auth/login',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({email,password:'not-logged-or-persisted'})
});
const wrong=async()=>{logins++;return Response.json({error:'Fel lösenord'},{status:401});};
for(let i=0;i<8;i++){
  const response=await productionRateLimitedLogin(req(),env,wrong);
  assert.equal(response.status,401);
}
const denied=await productionRateLimitedLogin(req(),env,wrong);
assert.equal(denied.status,429);
assert.equal(denied.headers.get('retry-after'),'900');
assert.equal(logins,8,'Rate-limited login must not call password verification');
assert.equal(deletions,0);
attempts=0;
const success=await productionRateLimitedLogin(req(),env,async()=>Response.json({token:'dummy'}));
assert.equal(success.status,200);
assert.equal(deletions,1);
const unavailable=await productionRateLimitedLogin(req(),{},wrong);
assert.equal(unavailable.status,503);
const malformed=await productionRateLimitedLogin(new Request('https://nsk.invalid/api/auth/login',{
  method:'POST',body:'not-json'}),env,wrong);
assert.equal(malformed.status,400);
console.log('PASS production login lockout, no password verification after limit and fail closed DB');
