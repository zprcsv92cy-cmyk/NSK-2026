import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
test('repeated publication stamps fresh builds while preserving the manually chosen release',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nsk-release-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const name of ['version.js','deploy.json','manifest.webmanifest','sw.js'])fs.copyFileSync(new URL('../'+name,import.meta.url),path.join(dir,name));
 const release=JSON.parse(fs.readFileSync(path.join(dir,'deploy.json'),'utf8')).appVersion;
 fs.writeFileSync(path.join(dir,'index.html'),'<script src="version.js?v=872"></script>');
 const base=Number(fs.readFileSync(path.join(dir,'version.js'),'utf8').match(/NSK_VERSION\s*=\s*"(\d+)"/)[1]);
 for(const build of [String(base+1),String(base+2)]){
  execFileSync(process.execPath,[new URL('./bump-version.cjs',import.meta.url).pathname],{cwd:dir,env:{...process.env,NSK_TARGET_VERSION:build}});
  const globals={};vm.runInNewContext(fs.readFileSync(path.join(dir,'version.js'),'utf8'),{window:globals});assert.equal(globals.NSK_VERSION,build);assert.equal(globals.NSK_APP_VERSION,release);
  const deploy=JSON.parse(fs.readFileSync(path.join(dir,'deploy.json'),'utf8')),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.webmanifest'),'utf8'));
  assert.equal(deploy.version,build);assert.equal(deploy.appVersion,release);assert.equal(manifest.version,release);assert.equal(manifest.build,build);assert(manifest.start_url.includes('v='+build));assert(fs.readFileSync(path.join(dir,'sw.js'),'utf8').includes('nsk-team18-v'+build));assert(fs.readFileSync(path.join(dir,'index.html'),'utf8').includes('version.js?v='+build));
 }
});
test('minor build updates hide build IDs; major release notices are accurate and offline labels remain stable',async()=>{
 const nodes=new Map();const node=()=>({textContent:'',setAttribute(){},addEventListener(){},appendChild(child){nodes.set(child.id,child);},querySelector(selector){const id=selector.slice(1);if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},remove(){nodes.delete(this.id);}}),hero=node();
 const document={body:{classList:{contains:()=>true},appendChild(child){nodes.set(child.id,child);}},getElementById:id=>nodes.get(id),createElement:node,querySelector:selector=>selector.includes('script')?{src:'https://test/NSK-2026/app.js'}:hero};
 let data={version:'1002',appVersion:'1.0'},offline=false;
 const context={window:{NSK_VERSION:'1001',NSK_APP_VERSION:'1.0'},document,URL,location:{href:'https://test/NSK-2026/startsida/'},console:{warn(){}},fetch:async()=>{if(offline)throw Error('offline');return {ok:true,json:async()=>data};}};
 const js=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').split('// Installerad app:')[0];const api=vm.runInNewContext(js+'\n({showNskVersion,checkAppVersion})',context);
 api.showNskVersion();await api.checkAppVersion();assert.equal(nodes.get('nsk-current-version').textContent,'NSK-2026 · version 1.0');assert.equal(nodes.get('nsk-update-message').textContent,'En uppdatering finns tillgänglig.');assert(!nodes.get('nsk-update-message').textContent.includes('1002'));
 data={version:'1003',appVersion:'1.1'};await api.checkAppVersion();assert.equal(nodes.get('nsk-update-message').textContent,'Ny version 1.1 finns tillgänglig.');assert.equal(nodes.get('nsk-current-version').textContent,'NSK-2026 · version 1.0');
 offline=true;await api.checkAppVersion();assert.equal(nodes.get('nsk-current-version').textContent,'NSK-2026 · version 1.0');
});
