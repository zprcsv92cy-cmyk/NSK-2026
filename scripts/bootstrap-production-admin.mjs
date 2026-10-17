#!/usr/bin/env node
// One-time production administrator bootstrap.
// Run only after reviewing the target D1 database ID and migration.
// Never commit generated tokens or execute against staging by accident.
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const [emailArg, displayArg] = process.argv.slice(2);
const email=(emailArg||'').trim().toLowerCase();
const display=(displayArg||'').trim();
const teamId='*'; // Reserved global owner membership; never assigned by normal user management.
const expectedDb='9f937bcb-b0c0-4129-af5b-775cf284dfcb';
if(!email||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||
   !display||display.length>120||process.argv.length!==4){
  console.error('Usage: node scripts/bootstrap-production-admin.mjs <admin-email> <display-name>');
  process.exit(2);
}
if(process.env.NSK_PRODUCTION_BOOTSTRAP!=='CONFIRM_PRODUCTION'||
   process.env.NSK_D1_DATABASE_ID!==expectedDb){
  console.error('Refusing to run. Set NSK_PRODUCTION_BOOTSTRAP=CONFIRM_PRODUCTION and NSK_D1_DATABASE_ID to the verified production D1 UUID.');
  process.exit(2);
}
const userId=randomUUID();
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const sql=[
  'PRAGMA foreign_keys=ON;',
  `INSERT INTO auth_users(id,email,display_name,password_hash,disabled) VALUES(${quote(userId)},${quote(email)},${quote(display)},'!activation-required!',1);`,
  `INSERT INTO auth_team_memberships(user_id,team_id,role) VALUES(${quote(userId)},${quote(teamId)},'owner');`,
  ...['read','pool:create','lineup:edit','shifts:check','match:manage','pool:finish','pool:reopen','roster:manage','users:manage'].map(p=>
    `INSERT INTO auth_user_permissions(user_id,permission) VALUES(${quote(userId)},${quote(p)});`)
].join('\n');
const result=spawnSync('npx',['wrangler','d1','execute','nsk-auth-production','--remote','--command',sql],{
  encoding:'utf8',stdio:['ignore','pipe','pipe']
});
if(result.status!==0){
  console.error(result.stderr||result.stdout||'D1 bootstrap failed');
  process.exit(result.status||1);
}
console.log('Production admin bootstrap succeeded.');
console.log('Account:',email);
console.log('Scope: Global owner (all app teams)');
console.log('Account remains disabled. No activation token was issued.');
console.log('Issue a short-lived activation token separately only after the production activation endpoint is available.');
