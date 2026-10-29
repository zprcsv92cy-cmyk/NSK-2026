import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../ritverktyg/egna-ovningar.js',import.meta.url),'utf8');
const context={Blob,window:{},document:{addEventListener(){}}};
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/,'window.testing={validateTraining,trainingSnapshot,isDrawing};})();'),context);
const api=context.window.testing;
const part=()=>({id:'part',source:'file',minutes:10,exercise:{title:'Passning',category:'Passningar',blob:new Blob(['<svg/>'],{type:'image/svg+xml'}),filename:'hockeyovning.svg'}});
test('training archive accepts only local drawing file snapshots and rejects incomplete sessions',()=>{
 assert.throws(()=>api.validateTraining(' ',[part()]),/namn/);
 assert.throws(()=>api.validateTraining('Träning',[]),/övningar/);
 for(const minutes of [0,-1,1.5,'',181,NaN])assert.throws(()=>api.validateTraining('Träning',[{...part(),minutes}]),/minuter/);
 assert.throws(()=>api.validateTraining('Träning',[{...part(),source:'academy'}]),/minuter/);
 const missing=part();delete missing.exercise.blob;assert.throws(()=>api.validateTraining('Träning',[missing]),/saknas/);
});
test('saved plans snapshot independent metadata and preserve selected order, durations and drawing blobs',async()=>{
 const first=part(),second={...part(),id:'two',minutes:'15',exercise:{...part().exercise,title:'Avslut'}};
 const result=api.validateTraining('Träning',[second,first]);assert.equal(result[0].exercise.title,'Avslut');assert.equal(result[0].minutes,15);
 first.exercise.title='Ändrat original';first.minutes=20;assert.equal(result[1].exercise.title,'Passning');assert.equal(result[1].minutes,10);
 assert.equal(await result[1].exercise.blob.text(),'<svg/>');assert.equal(result.length,2);
});
test('the drawing archive recognizes old rink drawings without including unrelated uploaded files',()=>{
 assert.equal(api.isDrawing({filename:'hockeyovning.svg'}),true);assert.equal(api.isDrawing({origin:'rink-drawer',filename:'renamed.svg'}),true);
 assert.equal(api.isDrawing({filename:'match.pdf'}),false);assert.equal(api.isDrawing({filename:'ovning.png'}),false);
 assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|api\/training/);
});
