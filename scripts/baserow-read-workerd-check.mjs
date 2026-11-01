// Separate HTTP requests in real workerd; Node mocks cannot detect cross-request I/O.
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const deps=process.env.NSK_RUNTIME_DEPS;
assert.ok(deps,'Set NSK_RUNTIME_DEPS to isolated node_modules directory');
const {build}=await import(pathToFileURL(resolve(deps,'esbuild/lib/main.js')));
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=await mkdtemp(resolve(tmpdir(),'nsk-read-runtime-'));
const tables={lag:[{id:11,Namn:'NSK Team 18','Säsong':'2026'}],poolspel:[{id:101,Lag:[{id:11}],'Antal lag':1}],matchkonfiguration:[{id:301,Poolspel:[{id:101}],Lagnummer:1}]};
let counts={};
const upstream=http.createServer((req,res)=>{const table=req.url.slice(1);counts[table]=(counts[table]||0)+1;setTimeout(()=>{res.setHeader('Content-Type','application/json');res.write('{"results":');setTimeout(()=>res.end(JSON.stringify(tables[table])+'}'),100);},100);});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
let proc,logs='';
try{
const source=`import {fetchBaserowRead} from ${JSON.stringify(root+'/worker/baserow-read-fetch.js')};
import {readPersonallyAuthorizedTeams} from ${JSON.stringify(root+'/worker/production-team-read.js')};
import {readPersonallyAuthorizedTeamCollection} from ${JSON.stringify(root+'/worker/production-team-collection-read.js')};
const fetcher=input=>fetch('http://127.0.0.1:${upstream.address().port}/'+new URL(input).pathname.split('/').filter(Boolean).at(-1));
const readRows=async table=>(await (await fetchBaserowRead('https://api.baserow.io/'+table,{}, {fetcher})).json()).results;
const deps={listTrustedTeams:()=>readRows('lag'),readRows,verifyPersonalSession:async()=>({user:{id:'fixture'},memberships:[{team_id:'NSK Team 18',role:'coach'}],permissions:['read']})};
export default {fetch(request){if(new URL(request.url).pathname==='/health')return new Response('ok');return new URL(request.url).pathname==='/api/lag'?readPersonallyAuthorizedTeams(request,{},deps):readPersonallyAuthorizedTeamCollection(request,{},deps);}};`;
await build({stdin:{contents:source,resolveDir:root,sourcefile:'fixture.mjs'},bundle:true,format:'esm',platform:'browser',outfile:resolve(dir,'bundle.mjs')});
await writeFile(resolve(dir,'config.capnp'),`using Workerd = import ${JSON.stringify(resolve(deps,'workerd/workerd.capnp'))};
const config :Workerd.Config = (services = [(name = "main", worker = (modules = [(name = "worker.mjs", esModule = embed "bundle.mjs")], compatibilityDate = "2026-10-10")), (name = "internet", network = (allow = ["private", "public"]))], sockets = [(name = "http", address = "127.0.0.1:${port}", http = (), service = "main")]);`);
proc=spawn(resolve(deps,'workerd/bin/workerd'),['serve','-I','/',resolve(dir,'config.capnp')],{stdio:['ignore','pipe','pipe']});proc.stdout.on('data',b=>logs+=b);proc.stderr.on('data',b=>logs+=b);
const base='http://127.0.0.1:'+port;let ready=false;
for(let i=0;i<100;i++){try{await fetch(base+'/health');ready=true;break;}catch{}await new Promise(r=>setTimeout(r,50));}assert.ok(ready,logs);
const headers={Authorization:'Bearer '+'a'.repeat(64)};
for(let round=0;round<2;round++){
 counts={};
 for(const [path,id] of [['lag',11],['matchkonfiguration',301]]){
 const responses=await Promise.all(Array.from({length:8},async()=>{const r=await fetch(base+'/api/'+path+'?team_id=11',{headers});assert.equal(r.status,200);return r.json();}));
 for(const body of responses)assert.deepEqual(body.results.map(r=>r.id),[id]);
 }
 assert.deepEqual(counts,{lag:2,poolspel:1,matchkonfiguration:1});
}
assert.equal((await fetch(base+'/api/lag')).status,401);
assert.equal((await fetch(base+'/api/matchkonfiguration?team_id=11')).status,401);
assert.doesNotMatch(logs,/Cannot perform I\/O|locked to a reader/);
console.log('PASS: 32 separate concurrent authorized Workers requests, fresh subsequent reads, authentication denied without token');
}finally{if(proc){proc.kill();await new Promise(r=>proc.once('exit',r));}await new Promise(r=>upstream.close(r));await rm(dir,{recursive:true,force:true});}
