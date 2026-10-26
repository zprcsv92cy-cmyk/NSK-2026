// Deploy only this new capability feature into an otherwise unchanged, hash-verified Worker.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const [baselinePath,outputPath]=process.argv.slice(2);if(!baselinePath||!outputPath)throw Error('Usage: baseline.mjs output.json');
const strip=text=>text.replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const module=fs.readFileSync(new URL('../worker/sharpening-links-api.js',import.meta.url),'utf8');
const addon='\n// BEGIN NSK PERSONAL SHARPENING\nfunction createSharpeningAddon(createPersonalRosterIdentityVerifier,mapTrustedMembershipsToLegacyTeams){\n'+strip(module)+'\nreturn {createSharpeningHandler,readSharpeningPerson};\n}\nvar __nskSharpening=createSharpeningAddon(createPersonalRosterIdentityVerifier,mapTrustedMembershipsToLegacyTeams);\n// END NSK PERSONAL SHARPENING\n';
const source=fs.readFileSync(new URL('../worker/production-api-v42-reference.js',import.meta.url),'utf8'),start=source.indexOf('  if (["/api/sharpening/link",'),end=source.indexOf('  if (["/api/equipment"',start);if(start<0||end<0)throw Error('Missing routes');
const route=source.slice(start,end).replace('await createSharpeningHandler(','await __nskSharpening.createSharpeningHandler(').replace('readPerson:(team,id)=>readSharpeningPerson(env,TABLES.spelare,team,id,fetch)','readPerson:(team,id)=>__nskSharpening.readSharpeningPerson(env,TABLES.spelare,team,id,fetchBaserowRead)');
const baseline=fs.readFileSync(baselinePath,'utf8').trim(),moduleAnchor='var worker_default =',routeAnchor='  if (["/api/equipment", "/api/person-card"].includes(url.pathname)) {';
const hash=text=>createHash('sha256').update(text.trim()).digest('hex');let patched,upgrade=null;
if(baseline.includes('BEGIN NSK PERSONAL SHARPENING')){
 const addonStart='\n// BEGIN NSK PERSONAL SHARPENING\n',addonEnd='// END NSK PERSONAL SHARPENING\n',routeStart='  if (["/api/sharpening/link",';
 const at=baseline.indexOf(addonStart),end=baseline.indexOf(addonEnd,at)+addonEnd.length,routeAt=baseline.indexOf(routeStart),routeEnd=baseline.indexOf(routeAnchor,routeAt);
 if(at<0||end<at||routeAt<0||routeEnd<routeAt||baseline.split(addonStart).length!==2||baseline.split(routeStart).length!==2)throw Error('Unexpected addon');
 const oldAddon=baseline.slice(at,end),oldRoute=baseline.slice(routeAt,routeEnd);patched=baseline.replace(oldAddon,addon).replace(oldRoute,route)+'\n';upgrade={addonStart,addonEnd,routeStart,oldAddonHash:hash(oldAddon),oldRouteHash:hash(oldRoute)};
}else{
 if(baseline.split(moduleAnchor).length!==2||baseline.split(routeAnchor).length!==2)throw Error('Unexpected baseline');
 patched=baseline.replace(moduleAnchor,addon+'\n'+moduleAnchor).replace(routeAnchor,route+routeAnchor)+'\n';
}
fs.writeFileSync(outputPath,JSON.stringify({baselineHash:hash(baseline),patchedHash:hash(patched),moduleAnchor,routeAnchor,addon,route,upgrade}));fs.writeFileSync(outputPath+'.mjs',patched);console.log(JSON.stringify({baselineHash:hash(baseline),patchedHash:hash(patched)}));
