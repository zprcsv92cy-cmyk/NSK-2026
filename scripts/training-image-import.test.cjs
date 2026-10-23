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
 assert.match(js,/if\(uniqueIds\.size===1\)/);
 assert.match(js,/selected\.add\(String\(person\.id\)\)/);
 assert.match(js,/selectedCoaches\.add\(String\(person\.id\)\)/);
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


test('training date responses must be ignored after date changes',()=>{
 const source=fs.readFileSync('training-groups.js','utf8');
 assert.match(source,/const date=\$\('trainingDate'\)\.value;[\s\S]*?SharedTraining\.get\(date\)/);
 assert.match(source,/if\(\$\('trainingDate'\)\.value!==date\)return/);
});

test('only uncertain OCR matches require review',()=>{
 assert.match(js,/matches\.filter\(p=>!p\.exact\)/);
 assert.match(js,/importMatches\.filter\(p=>p\.exact\)/);
 assert.match(js,/const approved=/);
});

test('OCR matches first name and surname initial within noisy lines',()=>{
 assert.match(js,/const shortName=parts\[0\]\+' '\+parts\[parts\.length-1\]\[0\]/);
 assert.match(js,/uniqueIds\.size===1/);
 assert.match(js,/fullMatch\|\|shortMatch/);
});

test('attendance parsing matches abbreviated Swedish names and excludes non-attendees',()=>{
 const vm=require('node:vm');
 const begin=js.indexOf('  const normalized =');
 const end=js.indexOf('  async function readImageText()',begin);
 assert.ok(begin>=0&&end>begin);
 const roster=[
  {id:1,full_name:'Peter Hasselberg'},
  {id:2,full_name:'Viggo Kronvall'},
  {id:3,full_name:'Olle Åstrand'},
  {id:4,full_name:'Oliver Englund'},
  {id:5,full_name:'Oliver Johansson'}
 ];
 const context={players:roster,coaches:[]};
 vm.createContext(context);
 vm.runInContext(js.slice(begin,end)+';globalThis.parseAttendance=importCandidates;',context);
 const matches=context.parseAttendance('Anmälan\nPeter H Kommer\nAnmälda\nKommer 14+9\nPeter H\nViggo K\nOlle Å | Huvudtränare\nOliver E\nOliver J\nKan ej 4+4\nPeter H');
 assert.equal(matches.length,5);
 assert.deepEqual([...matches.map(p=>p.id)].sort((a,b)=>a-b),[1,2,3,4,5]);
});

test('SvenskaLag 14+9 count uses real regex whitespace escapes',()=>{
 assert.match(js,/const attendanceHeader=String\(text\|\|''\)\.match/);
 assert.ok(js.includes(String.raw`/kommer\\s*(\\d+)\\s*\\+\\s*(\\d+)/i`));
 assert.ok(!js.includes(String.raw`/kommer\\\\s*`));
});
