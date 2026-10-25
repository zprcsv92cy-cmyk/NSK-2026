import {execFileSync} from 'node:child_process';import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {passwordHash,tokenDigest} from '../../worker/account-recovery.js';
const python=fileURLToPath(new URL('./auth-sqlite.py',import.meta.url));
export async function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'nsk-auth-test-')),file=join(directory,'auth.sqlite');t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const run=data=>JSON.parse(execFileSync('python3',[python,file],{input:JSON.stringify(data),encoding:'utf8'}));
 const db={prepare(sql){return {sql,params:[],bind(...params){return {...this,params};},async first(){return run(this).results[0]??null;},async all(){return run(this);},async run(){return run(this);}};},async batch(statements){return run({batch:statements.map(({sql,params})=>({sql,params}))});}};
 run({script:`CREATE TABLE auth_users(id TEXT PRIMARY KEY,email TEXT UNIQUE,display_name TEXT,password_hash TEXT,disabled INTEGER DEFAULT 0);CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES auth_users(id) ON DELETE CASCADE,expires_at TEXT,revoked_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE auth_team_memberships(user_id TEXT REFERENCES auth_users(id) ON DELETE CASCADE,team_id TEXT,role TEXT,PRIMARY KEY(user_id,team_id));CREATE TABLE auth_user_permissions(user_id TEXT REFERENCES auth_users(id) ON DELETE CASCADE,permission TEXT,PRIMARY KEY(user_id,permission));CREATE TABLE auth_global_admins(user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,enabled INTEGER DEFAULT 0);CREATE TABLE auth_setup_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES auth_users(id) ON DELETE CASCADE,expires_at TEXT,used_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`+readFileSync(new URL('../../migrations/20261025_account_recovery.sql',import.meta.url),'utf8')});
 const root='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002',delegate='00000000-0000-4000-8000-000000000003';
 const password='Synthetic test password 2026!';const hashed=await passwordHash(password),tokens={};
 for(const [id,name,permissions] of [[root,'Root',['read','users:manage']],[user,'User',['read']],[delegate,'Delegate',['read','users:manage']]]){
  const token=id.replaceAll('-','')+'abcdefghijk';tokens[name.toLowerCase()]=token;
  await db.prepare('INSERT INTO auth_users VALUES(?,?,?,?,0)').bind(id,name.toLowerCase()+'@example.invalid',name,hashed).run();
  await db.prepare("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+2 hours'))").bind(await tokenDigest(token),id).run();
  await db.prepare('INSERT INTO auth_team_memberships VALUES(?,?,?)').bind(id,'NSK Team 18',id===root?'team_admin':'viewer').run();
  for(const grant of permissions)await db.prepare('INSERT INTO auth_user_permissions VALUES(?,?)').bind(id,grant).run();
 }
 await db.prepare('INSERT INTO auth_global_admins VALUES(?,1)').bind(root).run();
 return {db,env:{AUTH_DB:db},root,user,delegate,password,tokens};
}
