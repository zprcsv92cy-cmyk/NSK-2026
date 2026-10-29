// Preserve the full deployed bundle; change only the delegated request's Origin header.
import fs from 'node:fs';import {createHash} from 'node:crypto';
const [baselinePath,outputPath]=process.argv.slice(2);if(!baselinePath||!outputPath)throw Error('Usage: baseline.mjs patch.json');
const baseline=fs.readFileSync(baselinePath,'utf8');
const before="    const internal=(pathname,method,payload)=>new Request(new URL(pathname,req.url),{method,headers:{Authorization:req.headers.get('Authorization'),'Content-Type':'application/json'},body:JSON.stringify(payload)});";
const after="    const internal=(pathname,method,payload)=>new Request(new URL(pathname,req.url),{method,headers:{Authorization:req.headers.get('Authorization'),'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(payload)});";
if(baseline.split(before).length!==2)throw Error('Unexpected delegated-request source');
if(!fs.readFileSync(new URL('../worker/pool-flow-api.js',import.meta.url),'utf8').includes(after))throw Error('Source fix differs from patch');
const patched=baseline.replace(before,after);if(patched.replace(after,before)!==baseline)throw Error('Unrelated code changed');
const hash=s=>createHash('sha256').update(s).digest('hex');
fs.writeFileSync(outputPath,JSON.stringify({baselineHash:hash(baseline),patchedHash:hash(patched),replacements:[{before,after}]}));fs.writeFileSync(outputPath+'.mjs',patched);
console.log(JSON.stringify({baselineHash:hash(baseline),patchedHash:hash(patched),restorationVerified:true}));
