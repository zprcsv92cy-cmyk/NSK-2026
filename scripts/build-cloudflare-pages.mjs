import {assembleFrontend} from './assemble-frontend.mjs';
// Pages builds only the frontend allowlist. No API source, SQL or deployment credentials are published.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.env.CF_PAGES_BRANCH&&process.env.CF_PAGES_BRANCH!=='main')throw Error('Only main may be deployed');
const out=path.join(root,'_site');fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out);
assembleFrontend(root,out);
const stamp=spawnSync(process.execPath,[path.join(root,'scripts/bump-version.cjs')],{cwd:out,env:{...process.env,NSK_TARGET_VERSION:String(Date.now())},encoding:'utf8'});if(stamp.status!==0)throw Error(stamp.stderr||stamp.stdout||'Version stamping failed');
fs.writeFileSync(path.join(out,'_redirects'),'/NSK-2026/* /:splat 302\n');
fs.writeFileSync(path.join(out,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Cache-Control: no-cache\n');
for(const file of ['index.html','login/index.html','startsida/index.html','truppen/index.html','app/index.html','manifest.webmanifest'])if(!fs.statSync(path.join(out,file)).size)throw Error('Missing frontend asset: '+file);
for(const forbidden of ['worker','scripts','migrations','.git','wrangler.api.production.toml'])if(fs.existsSync(path.join(out,forbidden)))throw Error('Non-frontend content in output');
console.log('Cloudflare Pages frontend ready in _site (visible app version unchanged).');
