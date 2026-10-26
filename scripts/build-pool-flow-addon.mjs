import fs from 'node:fs';import {createHash} from 'node:crypto';
const [baselinePath,outputPath]=process.argv.slice(2);if(!baselinePath||!outputPath)throw Error('Usage: baseline.mjs output.json');
const baseline=fs.readFileSync(baselinePath,'utf8').trim(),source=fs.readFileSync(new URL('../worker/pool-flow-api.js',import.meta.url),'utf8').replace(/^export /gm,'');
const moduleAnchor='var worker_default =',wrapAnchor='worker_default.scheduled =';
if(baseline.includes('BEGIN NSK POOL FLOW')||baseline.split(moduleAnchor).length!==2||baseline.split(wrapAnchor).length!==2)throw Error('Unexpected baseline');
const addon='\n// BEGIN NSK POOL FLOW\n'+source+'\n// END NSK POOL FLOW\n';
const wrap='worker_default.fetch=withPoolFlow(worker_default.fetch,{resolveTables:resolveBaserowTables,listTeams:listTrustedRosterTeams,verifyIdentity:(env,token)=>createPersonalRosterIdentityVerifier(env)(token),authorize:authorizeTeamFeature,fetcher:fetchBaserowRead});\n';
const patched=baseline.replace(moduleAnchor,addon+moduleAnchor).replace(wrapAnchor,wrap+wrapAnchor)+'\n';
const hash=s=>createHash('sha256').update(s.trim()).digest('hex');const patch={baselineHash:hash(baseline),patchedHash:hash(patched),moduleAnchor,wrapAnchor,addon,wrap};fs.writeFileSync(outputPath,JSON.stringify(patch));fs.writeFileSync(outputPath+'.mjs',patched);console.log(JSON.stringify({baselineHash:patch.baselineHash,patchedHash:patch.patchedHash}));
