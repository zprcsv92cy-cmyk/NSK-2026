import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assembleFrontend} from './assemble-frontend.mjs';
test('shared frontend package includes account and match flows but excludes backend and retired login scripts',t=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'nsk-package-'));
 t.after(()=>fs.rmSync(out,{recursive:true,force:true}));
 assembleFrontend(fileURLToPath(new URL('../',import.meta.url)),out);
 for(const file of ['account-access.js','account-users.js','aktivera/index.html','login/index.html','db.js','laguppstallning/index.html','bytesschema/index.html','matchvy/index.html','sharpening-link-manager.js','concurrency-merge.mjs'])assert.ok(fs.statSync(path.join(out,file)).size,file);
 for(const file of ['worker','migrations','scripts','.git','wrangler.api.production.toml','login-patch.js','admin-mode.js'])assert.equal(fs.existsSync(path.join(out,file)),false,file);
});
