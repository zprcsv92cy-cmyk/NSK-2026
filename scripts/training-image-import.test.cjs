const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('training-groups.js','utf8');
const html=fs.readFileSync('traningsgrupper/index.html','utf8');
test('image import requires explicit confirmation',()=>{
 for(const id of ['trainingImportImages','trainingImportText','trainingImportReview','trainingImportApply'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/id="trainingImportApply" disabled/);
 assert.match(js,/trainingImportApply'\)\.addEventListener\('click'/);
});
test('attendance import matches unique names and does not clear existing attendance',()=>{
 assert.match(js,/if\(matches\.length===1\)/);
 assert.match(js,/selected\.add\(check\.dataset\.id\)/);
 assert.match(js,/selectedCoaches\.add\(check\.dataset\.id\)/);
 assert.doesNotMatch(js.slice(js.indexOf("trainingImportApply').addEventListener")),/selected\.clear\(|selectedCoaches\.clear\(/);
});
test('OCR uses local worker and releases it',()=>{
 assert.match(js,/Tesseract\.createWorker\('swe'\)/);
 assert.match(js,/await worker\.terminate\(\)/);
 assert.match(js,/worker\.recognize\(files\[i\]\)/);
});
test('manual text fallback and shared attendance saving remain available',()=>{
 assert.match(js,/trainingImportText/);
 assert.match(js,/SharedTraining\.save\(date/);
 assert.doesNotMatch(js,/localStorage\.setItem\(/);
});

test('selected screenshots are discarded and never previewed or stored',()=>{
 assert.doesNotMatch(html,/id="trainingImportPreviews"/);
 assert.doesNotMatch(js,/createObjectURL\(/);
 assert.match(js,/function clearImportImages\(\)/);
 assert.match(js,/trainingImportImages'\)\.value=''/);
 assert.match(js,/finally\s*\{\s*clearImportImages\(\)/);
 assert.doesNotMatch(js,/trainingImportText'\)\.value=text/);
});

test('privacy: image input is cleared on early exit and when replacing selection',()=>{
 assert.match(js,/if\(!players\.length&&!coaches\.length\)\{clearImportImages\(\)/);
 assert.match(js,/trainingImportImages'\)\.addEventListener\('change',[\s\S]*?importMatches=\[\]/);
});

test('training restore remains async for shared API loading',()=>{
 assert.match(js,/async function restore\(\)/);
 assert.match(js,/await SharedTraining\.get\(/);
});

test('queued training saves snapshot group and goalie arrays',()=>{
 assert.match(js,/allocation:allocation\.map\(group=>\[\.\.\.group\]\)/);
 assert.match(js,/goalies:\[\.\.\.goalies\]/);
});


test('shared training save is blocked until selected date is loaded',()=>{
 assert.match(js,/let loadedDate=''/);
 assert.match(js,/loadedDate=\$\('trainingDate'\)\.value/);
 assert.match(js,/\$\('trainingDate'\)\.value!==loadedDate/);
});

test('failed shared save blocks subsequent writes and date changes',()=>{
 assert.match(js,/let saveBlocked=false/);
 assert.match(js,/saveBlocked=true/);
 assert.match(js,/if\(saveBlocked\)throw Error/);
 assert.match(js,/if\(saveBlocked\)\{/);
});

test('incomplete goalie selections are not sent to shared storage',()=>{
 assert.match(js,/goalies\.filter\(Boolean\)\.length!==goalieCount/);
});
