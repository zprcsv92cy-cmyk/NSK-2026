// Patch only calendar parsing and the marked SweHockey addon in an audited live baseline.
import fs from 'node:fs';import {createHash} from 'node:crypto';
const [baselinePath,outputPath]=process.argv.slice(2);
if(!baselinePath||!outputPath)throw Error('Usage: baseline.mjs patch.json');
const baseline=fs.readFileSync(baselinePath,'utf8');
const unique=(source,anchor)=>{if(source.split(anchor).length!==2)throw Error('Unexpected source anchor: '+anchor);return source.indexOf(anchor);};
const start=unique(baseline,'// worker/svenskalag-ical.js'),end=unique(baseline,'// worker/svenskalag-calendar-reconcile.js');
if(end<=start)throw Error('Invalid calendar module order');
const oldIcal=baseline.slice(start,end);
let newIcal=oldIcal;
for(const [before,after] of [
 ['items.push({ type: "pool", date, place, hall: "" });','items.push({ type: "pool", date, place, hall: "", fixtureOverview: true });'],
 ['else if (!older) unique.set(key, item);','else if (!older || (item.type === "pool" && older.fixtureOverview === true && item.fixtureOverview !== true)) unique.set(key, item);']
]){if(newIcal.includes(after))unique(newIcal,after);else{unique(newIcal,before);newIcal=newIcal.replace(before,after);}}
const hs=unique(baseline,'// BEGIN NSK SWEHOCKEY'),he=unique(baseline,'// END NSK SWEHOCKEY')+'// END NSK SWEHOCKEY'.length;
const oldHockey=baseline.slice(hs,he);
const newHockey='// BEGIN NSK SWEHOCKEY\n'+fs.readFileSync(new URL('../worker/swehockey-schedule.js',import.meta.url),'utf8').replace(/^export /gm,'')+'\n// END NSK SWEHOCKEY';
const replacements=[{before:oldIcal,after:newIcal},{before:oldHockey,after:newHockey}];
let patched=baseline;for(const r of replacements)patched=patched.replace(r.before,r.after);
let restored=patched;for(const r of replacements)restored=restored.replace(r.after,r.before);
if(restored!==baseline)throw Error('Unrelated code changed');
const hash=s=>createHash('sha256').update(s).digest('hex');
fs.writeFileSync(outputPath,JSON.stringify({baselineHash:hash(baseline),patchedHash:hash(patched),replacements}));
fs.writeFileSync(outputPath+'.mjs',patched);
console.log(JSON.stringify({baselineHash:hash(baseline),patchedHash:hash(patched),restorationVerified:true}));
