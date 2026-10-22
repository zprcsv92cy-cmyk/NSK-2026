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
 assert.match(js,/localStorage\.setItem\(storageKey\(\)/);
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
