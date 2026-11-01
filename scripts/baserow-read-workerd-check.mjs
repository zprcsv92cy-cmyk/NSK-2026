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
const upstream=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://fixture'),table=u.pathname.slice(1),page=Number(u.searchParams.get('page')||1);
 counts[table]=(counts[table]||0)+1;
 const rows=table==='bytesschema'?Array.from({length:page===1?200:1},(_,i)=>({id:(page-1)*200+i+1,Poolspel:[{id:101}],Lagnummer:1})):tables[table];
 const next=table==='bytesschema'&&page===1?'http://api.baserow.io/api/database/rows/table/1255115/?page=2':null;
 setTimeout(()=>{res.setHeader('Content-Type','application/json');res.write('{"results":');setTimeout(()=>res.end(JSON.stringify(rows)+',"next":'+JSON.stringify(next)+'}'),100);},100);
});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
let proc,logs='';
try{
const source=`import worker from ${JSON.stringify(root+'/worker/production-api-v42-reference.js')};
const nativeFetch=globalThis.fetch.bind(globalThis);
const tableNames={1255083:'lag',1255101:'poolspel',1255157:'matchkonfiguration',1255115:'bytesschema'};
globalThis.fetch=(input,init)=>{const u=new URL(input);const id=u.pathname.split('/').filter(Boolean).at(-1);if(u.origin!=='https://api.baserow.io'||!tableNames[id])throw Error('Unexpected upstream');return nativeFetch('http://127.0.0.1:${upstream.address().port}/'+tableNames[id]+u.search,init);};
const AUTH_DB={prepare(sql){return {bind(){return {async first(){return {id:'fixture',display_name:'Fixture',is_global_admin:0};},async all(){return {results:sql.includes('auth_team_memberships')?[{team_id:'NSK Team 18',role:'coach'}]:[{permission:'read'}]};}};}};}};
export default {fetch(request){if(new URL(request.url).pathname==='/health')return new Response('ok');return worker.fetch(request,{AUTH_DB,BASEROW_TOKEN:'fixture',NSK_REQUIRE_SCOPED_COLLECTION_READS:'true',NSK_REQUIRE_SCOPED_TEAM_READS:'true'});}};`;
await build({stdin:{contents:source,resolveDir:root,sourcefile:'fixture.mjs'},bundle:true,format:'esm',platform:'browser',outfile:resolve(dir,'bundle.mjs')});
await writeFile(resolve(dir,'config.capnp'),`using Workerd = import ${JSON.stringify(resolve(deps,'workerd/workerd.capnp'))};
const config :Workerd.Config = (services = [(name = "main", worker = (modules = [(name = "worker.mjs", esModule = embed "bundle.mjs")], compatibilityDate = "2026-10-10")), (name = "internet", network = (allow = ["private", "public"]))], sockets = [(name = "http", address = "127.0.0.1:${port}", http = (), service = "main")]);`);
proc=spawn(resolve(deps,'workerd/bin/workerd'),['serve','-I','/',resolve(dir,'config.capnp')],{stdio:['ignore','pipe','pipe']});proc.stdout.on('data',b=>logs+=b);proc.stderr.on('data',b=>logs+=b);
const base='http://127.0.0.1:'+port;let ready=false;
for(let i=0;i<100;i++){try{await fetch(base+'/health');ready=true;break;}catch{}await new Promise(r=>setTimeout(r,50));}assert.ok(ready,logs);
const headers={Authorization:'Bearer '+'a'.repeat(64)};
for(let round=0;round<2;round++){
 counts={};
 for(const [path,id] of [['lag',11],['matchkonfiguration',301],['bytesschema',null]]){
 const responses=await Promise.all(Array.from({length:8},async()=>{const r=await fetch(base+'/api/'+path+'?team_id=11',{headers});assert.equal(r.status,200);return r.json();}));
 for(const body of responses){if(id===null){assert.equal(body.results.length,201);assert.equal(body.results.at(-1).id,201);}else assert.deepEqual(body.results.map(r=>r.id),[id]);}
 }
 assert.deepEqual(counts,{lag:3,poolspel:2,matchkonfiguration:1,bytesschema:2});
}
assert.equal((await fetch(base+'/api/lag')).status,401);
assert.equal((await fetch(base+'/api/matchkonfiguration?team_id=11')).status,401);
assert.doesNotMatch(logs,/Cannot perform I\/O|locked to a reader/);
console.log('PASS: 48 concurrent full Worker requests, 201 paginated shifts, fresh subsequent reads, authentication denied without token');
}finally{if(proc){proc.kill();await new Promise(r=>proc.once('exit',r));}await new Promise(r=>upstream.close(r));await rm(dir,{recursive:true,force:true});}
