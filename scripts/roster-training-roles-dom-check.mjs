import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';import {trainingSnapshot} from '../concurrency-merge.mjs';
const {JSDOM}=await import(pathToFileURL(process.env.NSK_JSDOM_MODULE));
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
async function ready(w){await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));}
test('Other roster roles share trainer-style rows without cards and a single add form with role choice',async()=>{
 const staffTemplate=read('truppen/index.html').match(/rows\.map\(r=>`(<details[^`]*data-view-key="staff:[^`]+)`\)/)[1];
 const staffRow=Function('r','role','esc','allowed','return `'+staffTemplate+'`;')({id:'synthetic',full_name:'Lagledare Person'},'leader',String,true);
 assert.match(staffRow,/class="roster-name"/);assert.match(staffRow,/class="roster-meta">Lagledare/);assert.doesNotMatch(staffRow,/data-roster-name|person-card-open|aria-haspopup|Tränarkort/);
 const section=(id,name,extra='')=>`<section><h2>${name}</h2><div class="roster-add-row"><input aria-label="Namn ${name}"><button>Lägg till</button></div>${extra}<div id="${id}"><details class="person-row"><summary>${name} Person</summary><input class="inline-name-input" value="${name} Person"></details></div></section>`;
 const dom=new JSDOM(`<body>${section('playersList','Spelare')}${section('coachesList','Tränare')}${section('leaderList','Lagledare')}${section('fitnessList','Fysansvarig')}${section('equipmentList','Materialförvaltare','<div class="roster-add-row"><select><option>Tränare</option></select></div>')}</body>`,{runScripts:'outside-only'});const w=dom.window;
 try{await ready(w);w.eval(read('roster-view.js'));w.document.getElementById('roster-tab-2').click();
  assert.equal(w.document.querySelectorAll('#roster-other details.roster-add').length,1);assert.equal(w.document.querySelectorAll('#roster-other section.card').length,0);assert.equal(w.document.querySelectorAll('#equipmentList').length,1);
  const add=w.document.querySelector('#roster-other details.roster-add');assert.equal(add.open,false);
  const role=w.document.getElementById('rosterStaffRole');assert.equal(role.options.length,3);role.value='equipmentList';role.dispatchEvent(new w.Event('change'));
  const material=add.querySelector('[data-staff-role=equipmentList]');assert.equal(material.hidden,false);assert.equal(material.querySelectorAll('.roster-add-row').length,2);assert.equal(add.querySelector('[data-staff-role=leaderList]').hidden,true);
  const search=w.document.getElementById('rosterNameSearch');search.value='lagledare';search.dispatchEvent(new w.Event('input'));
  assert.equal(w.document.querySelector('#leaderList .person-row').hidden,false);assert.equal(w.document.querySelector('#equipmentList .person-row').hidden,true);assert.equal(w.document.getElementById('rosterSearchStatus').textContent,'1 träff');
 }finally{w.close();}
});
test('training import marks both coach and material roles, counts one person and excludes recognized leaders',async()=>{
 const dom=new JSDOM(read('traningsgrupper/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://test.invalid/traningsgrupper/?date=2099-11-09',runScripts:'outside-only'});const w=dom.window,writes=[];
 try{await ready(w);w.structuredClone=structuredClone;w.setInterval=()=>0;w.Auth={init:async()=>({}),activeTeam:()=> 'NSK Team 18',getToken:()=> 'synthetic'};
  w.SharedTraining={listPlayers:async()=>[{id:1,full_name:'Anna Spelare'}],listCoaches:async()=>[{id:8,full_name:'Patrik Tränare'}],listEquipment:async()=>[{id:'material-8',coach_id:8,full_name:'Patrik Tränare'}],listLeaders:async()=>[{id:'leader-1',full_name:'Lisa Lagledare'}],calendarTrainings:async()=>[],upcomingDates:()=>[],calendarHall:async()=>'',snapshotSession:async data=>trainingSnapshot(data),get:async()=>({session:{...trainingSnapshot(),revision:1}}),save:async(_date,data)=>{writes.push(data);return {revision:2,session:trainingSnapshot(data)};}};
  w.eval(read('training-groups.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));const get=id=>w.document.getElementById(id);
  async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error(get('trainingStatus').textContent);}
  await until(()=>get('trainingRoster').children.length===1);
  get('trainingImportText').value='Anmälda\nKommer 1+2\nAnna Spelare\nPatrik Tränare\nLisa Lagledare';get('trainingImportRead').click();await until(()=>!get('trainingImportApply').disabled);
  assert.match(get('trainingImportStatus').textContent,/1 lagledare säkert identifierade/);assert.match(get('trainingImportStatus').textContent,/1 spelare och 2 ledare/);
  get('trainingImportApply').click();await until(()=>writes.length===1);
  assert.equal(get('trainingCoachRoster').querySelector('input').checked,true);assert.equal(get('trainingEquipmentRoster').querySelector('input').checked,true);
  assert.equal(get('trainingPersonCount').textContent,'2 personer totalt · 1 spelare · 1 tränare/materialförvaltare');
  assert.deepEqual([...writes[0].selectedCoaches].sort(),['8','equipment:material-8']);assert.equal(writes[0].selected.length,1);assert.match(get('trainingImportStatus').textContent,/2 deltagare markerade/);
 }finally{w.close();}
});
