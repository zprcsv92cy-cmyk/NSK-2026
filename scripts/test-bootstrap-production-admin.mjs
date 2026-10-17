import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const script=resolve('scripts/bootstrap-production-admin.mjs');
const inputs=['coach@nsk.invalid','Coach'];
function run(args,env={}) {
  return spawnSync(process.execPath,[script,...args],{
    encoding:'utf8',env:{...process.env,NSK_PRODUCTION_BOOTSTRAP:'',
      NSK_D1_DATABASE_ID:'',...env}});
}
let r=run(inputs);
assert.equal(r.status,2,'No production confirmation must fail');
r=run([...inputs,'NSK Team 18']);
assert.equal(r.status,2,'Explicit team scope must fail for global owner');
const dir=mkdtempSync(join(tmpdir(),'nsk-admin-bootstrap-'));
try{
 const mock=join(dir,'npx');
 const output=join(dir,'args.json');
 writeFileSync(mock,`#!/usr/bin/env node
require('fs').writeFileSync(process.env.NSK_MOCK_ARGS,JSON.stringify(process.argv.slice(2)));
`);
 chmodSync(mock,0o755);
 r=run(inputs,{NSK_PRODUCTION_BOOTSTRAP:'CONFIRM_PRODUCTION',
    NSK_D1_DATABASE_ID:'9f937bcb-b0c0-4129-af5b-775cf284dfcb',
    NSK_MOCK_ARGS:output,PATH:dir+':'+process.env.PATH});
 assert.equal(r.status,0,r.stderr);
 const args=JSON.parse(readFileSync(output,'utf8'));
 assert.deepEqual(args.slice(0,5),['wrangler','d1','execute','nsk-auth-production','--remote']);
 const sql=args[args.indexOf('--command')+1];
 assert.match(sql,/INSERT INTO auth_users/);
 assert.match(sql,/auth_team_memberships[\\s\\S]*'\\*','owner'/);
 assert.match(sql,/INSERT INTO auth_setup_tokens/);
 assert.match(sql,/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/);
 assert.match(r.stdout,/Production admin bootstrap succeeded/);
 assert.match(r.stdout,/Activation token/);
 assert.doesNotMatch(sql,/coach@nsk.invalid.*Activation token/);
}finally{rmSync(dir,{recursive:true,force:true});}
console.log('PASS bootstrap requires confirmation, team name, UUID and generates activation SQL without contacting Cloudflare');
