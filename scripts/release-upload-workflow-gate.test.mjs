import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/stage-personal-permissions-candidate.yml',import.meta.url),'utf8');
const preflight=readFileSync(new URL('./production-cutover-readonly-preflight.mjs',import.meta.url),'utf8');
const baselineWorkflow=readFileSync(new URL('../.github/workflows/production-cutover-readonly-preflight.yml',import.meta.url),'utf8');

test('upload-only workflow targets the actual reviewed release branch',()=>{
 assert.match(workflow,/github\.ref == 'refs\/heads\/release\/personal-permissions-rebased-20261020'/);
 assert.doesNotMatch(workflow,/refs\/heads\/release\/personal-permissions-production-20261020/);
});
test('upload requires exact source SHA and manual confirmation',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/inputs\.confirmation == 'UPLOAD_ONLY'/);
 assert.match(workflow,/test "\$EXPECTED_SHA" = "\$ACTUAL_SHA"/);
});
test('production preflight expects verified absent live personal-write switches',()=>{
 assert.match(workflow,/EXPECTED_PERSONAL_WRITE_FLAGS: 'false'/);
 assert.match(workflow,/EXPECTED_ACTIVE_VERSION: 7434d756-524c-43c4-95b2-73cc942a256b/);
});
test('candidate upload never routes traffic to the new version',()=>{
 assert.match(workflow,/wrangler@4\.151\.2 versions upload/);
 assert.doesNotMatch(workflow,/wrangler@[^\n]*versions deploy|wrangler@[^\n]*deploy --name/);
});

test('preflight validates the actually deployed version against explicitly expected write flags',()=>{
 assert.match(preflight,/EXPECTED_PERSONAL_WRITE_FLAGS/);
 assert.match(preflight,/const liveVersion=await get\('\/versions\/'\+expected\)/);
 assert.match(preflight,/assert\.ok\(!item\|\|item\.type==='plain_text'/);
 assert.match(preflight,/item\?\.text\?\?'false',expectedWriteFlags/);
 assert.doesNotMatch(preflight,/Active deployed Worker keeps personal write flags disabled/);
});

test('preflight checks live scoped read flags rather than mutable uploaded settings',()=>{
 assert.match(preflight,/liveBindings\.find\(x=>x\.name===name\)\?\.text,'true','Active deployed version scoped read flag drift: '/);
 assert.doesNotMatch(preflight,/bindings\.find\(x=>x\.name===name\)\?\.text,'true','Scoped read disabled: '/);
});

test('preflight verifies live version resource identifiers and named secrets',()=>{
 assert.match(preflight,/const item=liveBindings\.find\(x=>x\.name===name\)/);
 assert.match(preflight,/liveBindings\.find\(x=>x\.name===name\)\?\.type,'secret_text'/);
 assert.doesNotMatch(preflight,/const item=bindings\.find\(x=>x\.name===name\)/);
});

test('preflight never reads mutable script settings and handles absent bindings',()=>{
 assert.match(preflight,/const deployment=await get\('\/deployments'\)/);
 assert.doesNotMatch(preflight,/get\('\/settings'\)/);
 assert.match(preflight,/item\?\.database_id\|\|item\?\.namespace_id/);
});

test('main push read-only workflow uses verified disabled personal-write baseline',()=>{
 assert.match(baselineWorkflow,/github\.event_name == 'push' && 'false' \|\| inputs\.expected_personal_write_flags/);
 assert.match(baselineWorkflow,/github\.event_name == 'push' && '7434d756-524c-43c4-95b2-73cc942a256b'/);
});
