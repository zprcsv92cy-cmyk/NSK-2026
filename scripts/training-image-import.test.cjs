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
test('attendance import replaces old attendance with confirmed unique names',()=>{
 assert.match(js,/if\(uniqueIds\.size===1\)/);
 assert.match(js,/selected=new Set\(approved\.filter\(p=>p\.kind==='player'\)/);
 assert.match(js,/selectedCoaches=new Set\(approved\.filter\(p=>p\.kind==='coach'\)/);
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
 assert.match(js,/if\(!players\.length&&!coaches\.length&&!equipment\.length\)\{clearImportImages\(\)/);
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
 assert.match(js,/const surnameInitials=new Set/);
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
 const context={players:roster,equipment:[],coaches:[]};
 vm.createContext(context);
 vm.runInContext(js.slice(begin,end)+';globalThis.parseAttendance=importCandidates;',context);
 const matches=context.parseAttendance('Anmälan\nPeter H Kommer\nAnmälda\nKommer 14+9\nPeter H\nViggo K\nOlle Å | Huvudtränare\nOliver E\nOliver J\nKan ej 4+4\nPeter H');
 assert.equal(matches.length,5);
 assert.deepEqual([...matches.map(p=>p.id)].sort((a,b)=>a-b),[1,2,3,4,5]);
});

test('SvenskaLag 14+9 count uses real regex whitespace escapes',()=>{
 const line=js.split('\n').find(x=>x.includes('const attendanceHeader='));
 assert.ok(line);
 assert.ok(line.includes('\\s*'));
 assert.ok(line.includes('\\d+'));
 assert.ok(!line.includes('\\\\s*'));
});

test('SvenskaLag initials resolve compound surnames and Swedish names',()=>{
 const vm=require('node:vm');
 const begin=js.indexOf('  const normalized =');
 const end=js.indexOf('  async function readImageText()',begin);
 const context={players:[
  {id:1,full_name:'Noé Bonafous Sand'},
  {id:2,full_name:'Oliver Johansson Zoumbios'},
  {id:3,full_name:'Agnes Danielsson'},
  {id:4,full_name:'Theo Ydrenius'}
 ],equipment:[],coaches:[]};
 vm.createContext(context);
 vm.runInContext(js.slice(begin,end)+';globalThis.parseAttendance=importCandidates;',context);
 const matches=context.parseAttendance('Anmälda\nKommer 14+9\nNoé B\nOliver J\nAgnes D\nTheo Y');
 assert.equal(matches.length,4);
 assert.ok(matches.every(p=>p.exact));
});

test('shirt colors support red/white, black and green in order',()=>{
 assert.match(js,/let shirtColorCount = 3/);
 assert.match(js,/shirtColorCount=Number\(\$\('trainingShirtColorCount'\)\.value\)/);
 for(const n of ['2','3','4'])assert.ok(html.includes('value="'+n+'"'));
 assert.ok(js.indexOf("name:'Röd'")<js.indexOf("name:'Vit'"));
 assert.ok(js.indexOf("name:'Vit'")<js.indexOf("name:'Svart'"));
 assert.ok(js.indexOf("name:'Svart'")<js.indexOf("name:'Grön'"));
});

test('desktop table skips the response tabs and ignores a leading OCR table border',()=>{
 const vm=require('node:vm');
 const begin=js.indexOf('  const normalized ='),end=js.indexOf('  async function readImageText()',begin);
 const context={players:[{id:1,full_name:'Anna Testsson'},{id:2,full_name:'Erik Exempelsson'}],equipment:[],coaches:[{id:3,full_name:'Patrik Ledarsson'}]};
 vm.createContext(context);vm.runInContext(js.slice(begin,end)+';globalThis.parseAttendance=importCandidates;',context);
 const result=context.parseAttendance('Anmälan\nErik Exempelsson Kan ej\nAnmälda\nKan ej Kallade\n4+5 4+3\nNamn Anmäld\n| Anna Testsson 20 okt, 20:14\nPatrik Ledarsson | Tränare 20 okt, 21:00');
 assert.deepEqual([...result.map(x=>x.id)],[1,3]);
});

test('Kommer matches equipment managers separately and excludes Kan ej',()=>{
 const vm=require('node:vm');
 const start=js.indexOf('  const normalized =');const end=js.indexOf('  async function ',start);
 const context={players:[],coaches:[],equipment:[{id:'12345678-1234-1234-1234-123456789abc',full_name:'Anna Testsson'}]};
 vm.runInNewContext(js.slice(start,end)+';this.parse=importCandidates;',context);
 const matched=context.parse('Anmälda\nKommer 0+1\nNamn\nAnna Testsson | Materialare\nKan ej\nErik Exempelsson');
 assert.equal(matched.length,1);assert.equal(matched[0].kind,'equipment');assert.equal(matched[0].full_name,'Anna Testsson');
});
