import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const shell=readFileSync(new URL('../app-shell.js',import.meta.url),'utf8'),entry=readFileSync(new URL('../shell-entry.js',import.meta.url),'utf8');
const root=new URL('https://example.test/NSK-2026/'),pages=new Set(['startsida','truppen','ritverktyg','laguppstallning']);
const routeSource=shell.slice(shell.indexOf(' function route('),shell.indexOf(' const context='));
const parse=Function('root','pages','location',routeSource+'return route;')(root,pages,{href:root.href+'startsida/'});
test('shell routes normalize app pages and reject external or unrecognized documents',()=>{
 assert.equal(parse('../truppen/index.html?x=1#card').url.href,root.href+'truppen/?x=1#card');
 for(const url of ['https://evil.test/NSK-2026/truppen/','//evil.test/','javascript:alert(1)','/elsewhere/truppen/','../login/','../worker/file.js','../unknown/'])assert.equal(parse(url),null,url);
});
test('flow view identity separates pool, own team and match while ignoring unrelated edit context',()=>{
 const section=shell.slice(shell.indexOf(' const keyFor='),shell.indexOf(' const find='));
 const keyFor=Function('flow',section+'return keyFor;')(new Set(['laguppstallning']));
 const r=parse('../laguppstallning/'),a={nsk2_pool_id:'10',nsk2_lag_nr:'1',nsk2_match_no:'1'};
 assert.notEqual(keyFor(r,a),keyFor(r,{...a,nsk2_pool_id:'11'}));assert.notEqual(keyFor(r,a),keyFor(r,{...a,nsk2_lag_nr:'2'}));assert.notEqual(keyFor(r,a),keyFor(r,{...a,nsk2_match_no:'2'}));assert.equal(keyFor(r,a),keyFor(r,{...a,nsk2_edit_pool_id:'999'}));
});
test('page eviction protects active views, pending views, drafts and in-flight saves',()=>{
 const entries=new Map(),active={used:10},pending={used:11};const protectedDraft={used:1,dirty:true},protectedWrite={used:2,writes:1};for(const [key,e] of [['active',active],['pending',pending],['draft',protectedDraft],['write',protectedWrite],['old',{used:3}],['new',{used:4}]])entries.set(key,e);
 const removed=[];const remove=e=>{const item=[...entries].find(([,v])=>v===e);removed.push(item[0]);entries.delete(item[0]);};
 const code=shell.slice(shell.indexOf(' function prune()'),shell.indexOf(' function selection('));Function('entries','active','pending','remove',code+'prune();')(entries,active,pending,remove);
 assert.deepEqual(removed,['old']);assert(entries.has('draft'));assert(entries.has('write'));assert(entries.has('active'));assert(entries.has('pending'));
});
function embedded(){
 const events={},intervals=[],calls=[];let resolveWrite;
 const host={navigate:(...args)=>calls.push(['navigate',...args]),writing:(_source,n)=>calls.push(['writing',n]),changed:()=>calls.push(['changed']),ready:()=>calls.push(['ready'])};
 const document={currentScript:{src:root.href+'shell-entry.js'},hidden:false,readyState:'loading',documentElement:{style:{}},createElement:()=>({}),head:{append(){}},addEventListener:(event,fn)=>(events[event]??=[]).push(fn)};
 const window={addEventListener(){},parent:{NSKAppShell:host},setInterval:fn=>{intervals.push(fn);return intervals.length;},fetch:()=>new Promise(resolve=>resolveWrite=resolve)};
 vm.runInNewContext(entry,{window,document,history:{},location:{href:root.href+'truppen/'},URL,Request:class{},MutationObserver:class{observe(){}},setTimeout});
 return {window,document,intervals,calls,resolve:response=>resolveWrite(response)};
}
test('inactive pages pause periodic reads but a pending write completes and notifies the shell',async()=>{
 const f=embedded();let ticks=0;f.window.setInterval(()=>ticks++,1000);f.intervals[0]();assert.equal(ticks,0);f.window.NSKShellActive=true;f.intervals[0]();assert.equal(ticks,1);f.document.hidden=true;f.intervals[0]();assert.equal(ticks,1);
 const pending=f.window.fetch('https://api.test/endpoint',{method:'PUT'});f.window.NSKShellActive=false;assert.deepEqual(f.calls,[['writing',1]]);f.resolve({ok:true});await pending;assert.deepEqual(f.calls,[['writing',1],['changed'],['writing',-1]]);
});
test('failed writes release their saving guard without reporting a confirmed change',async()=>{
 const f=embedded(),pending=f.window.fetch('https://api.test/endpoint',{method:'POST'});f.resolve({ok:false});await pending;assert.deepEqual(f.calls,[['writing',1],['writing',-1]]);
});

// Exercise the real activation path after retained detail state has been restored.
for(const returning of [false,true])test('training attendance opens on '+(returning?'retained menu/calendar return':'initial calendar/menu entry'),()=>{
 const panel={open:false},events=[];
 const context={sequence:1,signedOut:false,active:null,pending:null,lastRoutes:{},Date,Event:class{constructor(type){this.type=type;}},clearTimeout(){},document:{querySelector:()=>null},persist(){},selection(){},restore(){panel.open=false;},status(){},prune(){},remember(){}};
 const e={everActive:returning,route:{slug:'traningsgrupper',url:new URL(root.href+'traningsgrupper/?date=2026-11-02')},frame:{dataset:{},setAttribute(){},contentWindow:{dispatchEvent:event=>events.push(event.type)},contentDocument:{getElementById:id=>id==='trainingAttendance'?panel:null,dispatchEvent:event=>events.push(event.type)}}};
 const code=shell.slice(shell.indexOf(' function activate('),shell.indexOf(' async function navigate('));
 vm.runInNewContext(code+'this.run=activate;',context);context.run(e,1,{history:false});
 assert.equal(panel.open,true);assert.equal(e.frame.dataset.active,'true');
 if(returning)assert(events.includes('nsk:page-show'));
 // User can still collapse it during this visit; there is no forced-open observer.
 panel.open=false;assert.equal(panel.open,false);
});
test('saved shirt groups no longer automatically collapse the attendance panel',()=>{
 const groups=readFileSync(new URL('../training-groups.js',import.meta.url),'utf8');
 assert.doesNotMatch(groups,/trainingAttendance'\)\.open\s*=\s*false/);
 assert.match(readFileSync(new URL('../traningsgrupper/index.html',import.meta.url),'utf8'),/id="trainingAttendance" open/);
});
