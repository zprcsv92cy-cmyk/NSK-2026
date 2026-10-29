import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf("        if(flowLink&&byId('lineupMatch')){");const end=source.indexOf('        if(flowLink&&(matchvySaving||shiftToggleSaving))',start);assert(start>=0&&end>start);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const handler=new AsyncFunction('flowLink','byId','flushLineupChanges','e','window','location',source.slice(start,end));
async function navigate(saved,message){let prevented=false;const destinations=[];await handler({href:'https://app.test/bytesschema/'},id=>id==='lineupMatch'?{}:id==='appError'?{textContent:message}:null,async()=>saved,{preventDefault(){prevented=true;}},{NSKNavigate:url=>destinations.push(url)},{});return {prevented,destinations};}
test('saved lineup context can open shift view despite an informational copy warning',async()=>{
 const result=await navigate(true,'Kunde inte kopiera en fullständig uppställning från Match 1. Inga ändringar sparades.');assert.equal(result.prevented,true);assert.deepEqual(result.destinations,['https://app.test/bytesschema/']);
});
test('failed or incomplete saves still block navigation regardless of visible error text',async()=>{
 for(const message of ['', 'Sparningen blev inte klar.']){const result=await navigate(false,message);assert.equal(result.prevented,true);assert.deepEqual(result.destinations,[]);}
});
