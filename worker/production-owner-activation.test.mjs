import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleProductionAuth} from './production-auth-boundary.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const token='T'.repeat(43),pw='strong-password-2026',hash=Array.from(new Uint8Array(
 await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))
)).map(x=>x.toString(16).padStart(2,'0')).join('');
let issued=true,enabled=false,claims=0,updated=0,cleared=0,updateChanges=1;
const db={prepare(sql){return {bind(...args){return {
 first:async()=>{
  if(sql.includes('SELECT t.user_id FROM auth_setup_tokens'))
    return issued&&!enabled&&args[0]===hash?{user_id:'root'}:null;
  return null;
 },
 all:async()=>{
  if(sql.includes('UPDATE auth_setup_tokens SET used_at')){
    if(!issued)return {results:[]};
    issued=false;claims++;
    return {results:[{user_id:'root'}]};
  }
  throw Error('Unexpected query');
 },
 run:async()=>{
  if(sql.startsWith('UPDATE auth_users')){updated++;if(updateChanges===1)enabled=true;return {success:true,meta:{changes:updateChanges}};}
  if(sql.startsWith('DELETE FROM auth_setup_tokens')){cleared++;return {success:true,meta:{changes:1}};}
  throw Error('Unexpected write');
 }
 };}}}};
const req=(password=pw,authToken=token)=>new Request('https://nsk-api.invalid/api/auth/activate',{
 method:'POST',headers:{Origin:'https://zprcsv92cy-cmyk.github.io','Content-Type':'application/json'},
 body:JSON.stringify({token:authToken,password})
});
let response=await handleProductionAuth(req(),{AUTH_DB:db});
assert.equal(response.status,200);
assert.deepEqual(await response.json(),{ok:true});
assert.equal(enabled,true);
assert.equal(claims,1);assert.equal(updated,1);assert.equal(cleared,1);
response=await handleProductionAuth(req(),{AUTH_DB:db});
assert.equal(response.status,400,'Activation token cannot be reused');
assert.equal(updated,1);
response=await handleProductionAuth(req('short'),{AUTH_DB:db});
assert.equal(response.status,400);
response=await handleProductionAuth(req(pw,'invalid'),{AUTH_DB:db});
assert.equal(response.status,400);
issued=true;enabled=false;updateChanges=0;
response=await handleProductionAuth(req(),{AUTH_DB:db});
assert.equal(response.status,500,'Do not claim success when no user row is enabled');
assert.equal(cleared,1,'Cleanup must not run after a failed user update');
response=await handleProductionAuth(req(),{AUTH_DB:db});
assert.equal(response.status,400,'Consumed activation token must stay unavailable');
console.log('PASS production activation: account enabled, one-time token, invalid/short rejected, missing update fails closed');
