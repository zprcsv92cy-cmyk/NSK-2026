import assert from 'node:assert/strict';
import { handleProductionAuth as auth } from './production-auth-boundary.js';
import candidate from './production-entry-candidate.js';

const base='https://nsk-api.invalid';
const req=(path, method='GET', origin='https://zprcsv92cy-cmyk.github.io')=>
  new Request(base+path,{method,headers:{...(origin?{Origin:origin}:{})}});
const env={}; // Deliberately no production auth D1 bound.
for (const path of ['/api/auth/staging/bootstrap-test','/api/auth/roster-staging',
  '/api/auth/lineups-staging','/api/auth/integration/roster','/api/auth/team-members',
  '/api/auth/users']) {
  const response=await auth(req(path),env);
  assert.equal(response.status,404,path+' must be inaccessible');
  const viaCandidate=await candidate.fetch(req(path),env,{});
  assert.equal(viaCandidate.status,404,path+' must be denied by entrypoint');
}
for (const [path,method] of Object.entries({
  '/api/auth/login':'POST','/api/auth/me':'GET','/api/auth/logout':'POST',
  '/api/auth/feature-access':'GET','/api/auth/integration/access':'GET',
  '/api/auth/activate':'POST'
})) {
  let response=await auth(req(path,method),env);
  assert.equal(response.status,503,path+' must fail closed without AUTH_DB');
  response=await auth(req(path,method,'https://evil.invalid'),env);
  assert.equal(response.status,403,path+' must block foreign Origin');
  response=await auth(req(path,'OPTIONS'),env);
  assert.equal(response.status,204,path+' must support trusted preflight');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://zprcsv92cy-cmyk.github.io');
}
const invalid=await auth(req('/api/auth/login','GET'),env);
assert.equal(invalid.status,405);
console.log('PASS production auth boundary: staging routes rejected, production routes fail closed');
