import assert from 'node:assert/strict';
import {legacyWriteFeature,authorizeLegacyWrite} from '../worker/legacy-write-authorization.js';
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
for(const path of ['/api/unknown','/api/spelare/1/other','/api/poolspel/2/aktiv/extra','/api/bytesschema/1/done/extra']){
 assert.equal(authorizeLegacyWrite(admin,'team-a',path).status,404,path);
}
console.log('PASS legacy write migration mapping and per-team denial checks');
