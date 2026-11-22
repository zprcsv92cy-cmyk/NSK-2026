const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('training-groups.js','utf8');
const begin=js.indexOf('  const normalized =');
const end=js.indexOf('  async function readImageText()',begin);
function parse(text,players,coaches=[]){
 const context={players,coaches,equipment:[],leaders:[]};
 vm.createContext(context);
 vm.runInContext(js.slice(begin,end)+';globalThis.parse=importCandidates;',context);
 return context.parse(text);
}
test('23 November: invitation August is excluded; abbreviated names require review',()=>{
 const people=[
 {id:1,full_name:'August Hasselberg'},
 {id:2,full_name:'Noé Bonnafous Sand'},
 {id:3,full_name:'Oliver Johansson Zoumblios'},
 {id:4,full_name:'Lea Svedlund'},
 {id:5,full_name:'Theo Ydrenius'}];
 const result=parse('Anmälan\nAugust H Kallad\nAnmälda\nKommer 18+6\nNoé BS\nOliver JZ\nLea S\nTheo Y\nKan ej 1+1',people);
 assert.deepEqual([...result.map(p=>p.id)].sort((a,b)=>a-b),[2,3,4,5]);
 assert(result.every(p=>p.exact===false));
});
test('missing attendance headings must not import invited players',()=>{
 const people=[{id:1,full_name:'August Hasselberg'}];
 assert.equal(parse('Anmälan\nAugust Hasselberg Kallad',people).length,0);
});
test('full exact names may be accepted without manual initials review',()=>{
 const people=[{id:1,full_name:'Lea Svedlund'}];
 const result=parse('Anmälda\nKommer 1+0\nLea Svedlund',people);
 assert.equal(result.length,1);assert.equal(result[0].exact,true);
});
test('ambiguous same-name initials are not auto-imported',()=>{
 const people=[{id:1,full_name:'Oliver Johansson'},{id:2,full_name:'Oliver Jansson'}];
 assert.equal(parse('Anmälda\nKommer 1+0\nOliver J',people).length,0);
});

test('23 November: first surname initial resolves compound names only for unique candidates',()=>{
 const people=[{id:1,full_name:'Noé Bonnafous Sand'},{id:2,full_name:'Oliver Johansson Zoumblios'},{id:3,full_name:'Lea Svedlund'},{id:4,full_name:'August Hasselberg'}];
 const result=parse('Anmälan\nAugust H Kallad\nAnmälda\nKommer 18+6\nAugust H\nNoé B\nOliver J\nLea S\nKan ej',people);
 assert.deepEqual([...result.map(p=>p.id)].sort((a,b)=>a-b),[1,2,3,4]);
 assert(result.every(p=>p.exact===false));
});
test('compound surname prefix stays unselected when multiple players share it',()=>{
 const people=[{id:1,full_name:'Oliver Johansson Zoumblios'},{id:2,full_name:'Oliver Jansson'}];
 assert.equal(parse('Anmälda\nKommer 1+0\nOliver J',people).length,0);
});

test('actual 23 November screenshot: all 18 players and 6 staff under Kommer, no invitation duplicates',()=>{
 const attending=["Oliver JZ","Emil T","August H","Måns Å","William Å","Melker A","Lea S","Gunnar E","Tommy E","Enzo O","Noé BS","Agnes D","Adrian E","Olle Å","Pelle Å","Henry G","Niklas G","Oliver E","Nikola K","Viggo K","Jood M","Theo Y","Joakim L","Peter H"];
 const coaches=["William Å","Tommy E","Olle Å","Niklas G","Joakim L","Peter H"];
 const players=attending.filter(name=>!coaches.includes(name)).map((name,i)=>({id:i+1,full_name:name}));
 const staff=coaches.map((name,i)=>({id:100+i,full_name:name}));
 const source='Anmälan\nAugust H Kallad Kommer\nPeter H Kallad Kommer\nSara B Ej svarat\nAnmälda\nKommer 18+6\n'+attending.join('\n')+'\nKan ej 1+1';
 const result=parse(source,players,staff);
 assert.equal(result.filter(p=>p.kind==='player').length,18);
 assert.equal(result.filter(p=>p.kind==='coach').length,6);
 assert.equal(result.length,24);
 assert(result.every(p=>p.exact===true));
});
