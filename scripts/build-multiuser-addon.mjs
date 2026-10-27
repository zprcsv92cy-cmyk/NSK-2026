// Build a source-only patch for the existing deployed Worker; never replace unrelated hotfixes.
import {readFileSync,writeFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const clean=source=>source.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const prelude='const NSKConcurrent=(()=>{\n'+['concurrency-merge.mjs','worker/training-session-validation.js','worker/concurrent-resources.js','worker/concurrent-staff.js'].map(p=>clean(read(p))).join('\n')+'\nreturn {withConcurrentResources,withConcurrentStaff,lineupSnapshot};\n})();\nconst lineupSnapshot=NSKConcurrent.lineupSnapshot;\n';
const poolFlow=clean(read('worker/pool-flow-api.js')).trim();
const install='\nworker_default.fetch=withPagesOrigin(NSKConcurrent.withConcurrentStaff(NSKConcurrent.withConcurrentResources(worker_default.fetch)));\n';
const result={prelude,poolFlow,install};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result));else process.stdout.write(JSON.stringify(result));
