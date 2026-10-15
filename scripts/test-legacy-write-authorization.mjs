import assert from 'node:assert/strict';
import {legacyWriteFeature,authorizeLegacyWrite,legacyWriteOperation,authorizeLegacyOperation,authorizeResolvedLegacyOperation} from '../worker/legacy-write-authorization.js';
const cases=[
 ['/api/spelare','roster'],['/api/spelare/42','roster'],['/api/tranare/12','roster'],
 ['/api/lagpersonal','roster'],['/api/poolspel','pool'],['/api/poolspel/2','pool'],
 ['/api/poolspel/2/aktiv','pool_finish'],['/api/matchkonfiguration/2','matches'],
 ['/api/laguppstallningar/2','lineup'],['/api/coach-selection','lineup'],
 ['/api/bytesschema/save','shifts'],['/api/bytesschema/2/done','shifts']
];
const grants={roster:'roster:manage',pool:'pool:create',pool_finish:'pool:finish',matches:'match:manage',lineup:'lineup:edit',shifts:'shifts:check'};
const admin={memberships:[{team_id:'team-a',role:'team_admin'}],permissions:Object.values(grants)};
for(const [path,feature] of cases){
 assert.equal(legacyWriteFeature(path),feature,path);
 assert.equal(authorizeLegacyWrite(admin,'team-a',path).allowed,true,path);
 assert.equal(authorizeLegacyWrite(admin,'team-b',path).status,403,path);
 assert.equal(authorizeLegacyWrite(null,'team-a',path).status,401,path);
 assert.equal(authorizeLegacyWrite({...admin,memberships:[{team_id:'team-a',role:'viewer'}]},'team-a',path).status,403,path);
}
// An administrator must also have the exact feature permission; no global admin bypass.
for(const [path,feature] of cases){
 const withoutGrant={...admin,permissions:Object.values(grants).filter(p=>p!==grants[feature])};
 assert.equal(authorizeLegacyWrite(withoutGrant,'team-a',path).status,403,path+' requires '+grants[feature]);
 assert.equal(authorizeLegacyWrite(admin,'',path).status,400,path+' requires server-resolved team');
 assert.equal(authorizeLegacyWrite(admin,null,path).status,400,path+' rejects missing team');
}
for(const role of ['viewer','player','coach','team_manager']){
 const actor={...admin,memberships:[{team_id:'team-a',role}]};
 for(const [path] of cases)assert.equal(authorizeLegacyWrite(actor,'team-a',path).status,403,role+' cannot write '+path);
}
for(const path of ['/api/unknown','/api/spelare/1/other','/api/poolspel/2/aktiv/extra','/api/bytesschema/1/done/extra']){
 assert.equal(authorizeLegacyWrite(admin,'team-a',path).status,404,path);
}
console.log('PASS legacy write migration mapping and per-team denial checks');

const methods=[
 ['POST','/api/spelare','roster'],['PATCH','/api/spelare/42','roster'],
 ['POST','/api/poolspel','pool'],['PATCH','/api/poolspel/2','pool'],
 ['PATCH','/api/poolspel/2/aktiv','pool_finish','finish'],
 ['POST','/api/laguppstallningar/2','lineup'],
 ['POST','/api/bytesschema/save','shifts'],['PATCH','/api/bytesschema/2/done','shifts']
];
for(const [method,path,feature,operation] of methods){
 assert.equal(legacyWriteOperation(method,path,operation),feature,method+' '+path);
 assert.equal(authorizeLegacyOperation(admin,'team-a',method,path,operation).allowed,true,method+' '+path);
 assert.equal(authorizeLegacyOperation(admin,'team-b',method,path,operation).status,403,method+' '+path);
}
for(const method of ['GET','HEAD','OPTIONS','DELETE']){
 for(const [,path] of methods)assert.equal(authorizeLegacyOperation(admin,'team-a',method,path).status,405,method+' '+path);
}
assert.equal(authorizeLegacyOperation(admin,'team-a','POST','/api/spelare/42').status,405);
assert.equal(authorizeLegacyOperation(admin,'team-a','PATCH','/api/bytesschema/save').status,405);
console.log('PASS method-aware legacy write authorization');

let resolverCalls=0;
const trusted=async()=>{resolverCalls++;return 'team-a';};
assert.equal((await authorizeResolvedLegacyOperation(admin,'POST','/api/spelare',trusted)).allowed,true);
assert.equal((await authorizeResolvedLegacyOperation(admin,'POST','/api/spelare',async()=> 'team-b')).status,403);
assert.equal((await authorizeResolvedLegacyOperation(admin,'POST','/api/spelare',null)).status,503);
assert.equal((await authorizeResolvedLegacyOperation(admin,'POST','/api/spelare',async()=>{throw Error('database offline')})).status,503);
assert.equal((await authorizeResolvedLegacyOperation(admin,'POST','/api/spelare',async()=>null)).status,503);
assert.equal((await authorizeResolvedLegacyOperation(admin,'POST','/api/spelare',async()=>'' )).status,503);
const before=resolverCalls;
assert.equal((await authorizeResolvedLegacyOperation(admin,'GET','/api/spelare',trusted)).status,405);
assert.equal(resolverCalls,before,'Unsupported method must not access resolver');
console.log('PASS trusted server-side team resolution fails closed');

import {readFileSync} from 'node:fs';
const dbSource=readFileSync(new URL('../db.js',import.meta.url),'utf8');
// Each legacy write family used by db.js must be represented in the migration policy.
const requiredRoutes=[
 ['POST','/api/spelare'],['PATCH','/api/spelare/1'],
 ['POST','/api/tranare'],['PATCH','/api/tranare/1'],
 ['POST','/api/lagpersonal'],['PATCH','/api/lagpersonal'],
 ['POST','/api/poolspel'],['PATCH','/api/poolspel/1'],
 ['PATCH','/api/poolspel/1/aktiv','finish'],
 ['POST','/api/matchkonfiguration'],['PATCH','/api/matchkonfiguration/1'],
 ['POST','/api/laguppstallningar/1'],['POST','/api/coach-selection'],
 ['POST','/api/bytesschema/save'],['PATCH','/api/bytesschema/1/done']
];
for(const [method,path,operation] of requiredRoutes){
 assert.ok(legacyWriteOperation(method,path,operation),method+' '+path+' must have a migration permission');
}
for(const family of ['spelare','tranare','lagpersonal','poolspel','matchkonfiguration','laguppstallningar','coach-selection','bytesschema']){
 assert.ok(dbSource.includes(family),'Legacy API family unexpectedly missing from db.js: '+family);
}
console.log('PASS existing db.js write families are covered by migration policy');

assert.equal(legacyWriteOperation('PATCH','/api/poolspel/2/aktiv'),null,'Ambiguous pool transition must be denied');
assert.equal(legacyWriteOperation('PATCH','/api/poolspel/2/aktiv','reopen'),'pool_reopen');
assert.equal(legacyWriteOperation('PATCH','/api/poolspel/2/aktiv','finish'),'pool_finish');
const finishOnly={...admin,permissions:['pool:finish']};
assert.equal(authorizeLegacyOperation(finishOnly,'team-a','PATCH','/api/poolspel/2/aktiv','finish').allowed,true);
assert.equal(authorizeLegacyOperation(finishOnly,'team-a','PATCH','/api/poolspel/2/aktiv','reopen').status,403);
console.log('PASS pool reopen requires independent permission');
