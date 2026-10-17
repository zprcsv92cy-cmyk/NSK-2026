import assert from 'node:assert/strict';
import candidate from './production-entry-candidate.js';

const origin='https://zprcsv92cy-cmyk.github.io';
const paths=[
 '/api/personal/lag',
 '/api/personal/poolspel',
 '/api/personal/spelare',
 '/api/personal/spelare/42',
 '/api/personal/tranare',
 '/api/personal/tranare/42',
 '/api/personal/lagpersonal',
 '/api/personal/bytesschema',
 '/api/personal/bytesschema/save',
 '/api/personal/bytesschema/42/done',
 '/api/personal/laguppstallningar',
 '/api/personal/laguppstallningar/42',
 '/api/personal/matchkonfiguration',
 '/api/personal/matchkonfiguration/42'
];
for(const path of paths){
 const response=await candidate.fetch(new Request('https://nsk-api.invalid'+path,{
  method:'OPTIONS',headers:{Origin:origin,
   'Access-Control-Request-Method':'POST',
   'Access-Control-Request-Headers':'authorization,content-type'}
 }),{},{});
 assert.equal(response.status,204,path+' preflight');
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin,path+' origin');
 assert.match(response.headers.get('Access-Control-Allow-Headers'),/Authorization/);
 const denied=await candidate.fetch(new Request('https://nsk-api.invalid'+path,{
  method:'OPTIONS',headers:{Origin:'https://foreign.invalid'}
 }),{},{});
 assert.equal(denied.status,403,path+' reject untrusted origin');
}
console.log('PASS candidate personal read/write preflights and deny foreign origins');
