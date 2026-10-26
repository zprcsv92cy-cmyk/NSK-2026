// Package only the new feature for insertion into a hash-verified, existing Worker.
// Existing authentication code and protected account values are not re-uploaded by this path.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const [baselinePath,outputPath]=process.argv.slice(2);
if(!baselinePath||!outputPath)throw Error('Usage: node scripts/build-private-skills-addon.mjs baseline.mjs output.json');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const strip=text=>text.replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const addon='\n// BEGIN NSK PRIVATE SKILLS TRIAL\nfunction createSkillsTrialAddon(createPersonalRosterIdentityVerifier,mapTrustedMembershipsToLegacyTeams,PRIMARY_ADMIN_ID){\n'+strip(read('worker/skills-planner.js'))+'\n'+strip(read('worker/private-skills-api.js'))+'\nreturn {createPrivateSkillsHandler,readSkillsRoster};\n}\nvar __nskPrivateSkills=createSkillsTrialAddon(createPersonalRosterIdentityVerifier,mapTrustedMembershipsToLegacyTeams,PRIMARY_ADMIN_ID);\n// END NSK PRIVATE SKILLS TRIAL\n';
const source=read('worker/production-api-v42-reference.js'),start=source.indexOf('  if (["/api/skills","/api/skills/suggest"]'),end=source.indexOf('  if (["/api/equipment"',start);
if(start<0||end<0)throw Error('Feature route missing');
const route=source.slice(start,end).replace('await createPrivateSkillsHandler(', 'await __nskPrivateSkills.createPrivateSkillsHandler(').replace('team=>readSkillsRoster(env,TABLES.spelare,team,fetch)', 'team=>__nskPrivateSkills.readSkillsRoster(env,TABLES.spelare,team,fetchBaserowRead)');
const baseline=fs.readFileSync(baselinePath,'utf8').trim();
const moduleAnchor='var worker_default =',routeAnchor='  if (["/api/equipment", "/api/person-card"].includes(url.pathname)) {';
if(baseline.split(moduleAnchor).length!==2||baseline.split(routeAnchor).length!==2||baseline.includes('BEGIN NSK PRIVATE SKILLS TRIAL'))throw Error('Unexpected baseline');
const patched=baseline.replace(moduleAnchor,addon+'\n'+moduleAnchor).replace(routeAnchor,route+routeAnchor)+'\n';
const hash=text=>createHash('sha256').update(text.trim()).digest('hex');
fs.writeFileSync(outputPath,JSON.stringify({baselineHash:hash(baseline),patchedHash:hash(patched),moduleAnchor,routeAnchor,addon,route}));
fs.writeFileSync(outputPath+'.mjs',patched);
console.log(JSON.stringify({baselineHash:hash(baseline),patchedHash:hash(patched),addonBytes:addon.length,routeBytes:route.length}));
