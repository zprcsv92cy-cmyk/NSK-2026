// Isolated DOM integration of the packaged rink controls; no network or production data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {JSDOM}=await import(process.env.NSK_JSDOM_MODULE||'jsdom');
const root=new URL('../',import.meta.url),html=fs.readFileSync(new URL('ritverktyg/index.html',root),'utf8');
const dom=new JSDOM(html,{url:'https://isolated.example.test/ritverktyg/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
const original=[{id:'r',type:'curve',x:100,y:100,color:'#111827',points:[{x:100,y:100},{x:120,y:102},{x:140,y:99},{x:160,y:101},{x:180,y:100}]}];
w.localStorage.setItem('nsk_rink_draft_v2',JSON.stringify({marks:original}));
for(const p of ['rink-route-planner.js','rink-drawer.js'])w.eval(fs.readFileSync(new URL(p,root),'utf8'));
await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r));
const $=id=>w.document.getElementById(id);
$('rinkTidy').click();assert.equal($('rinkTidyScope').value,'all');assert.equal($('rinkTidyMode').value,'lines');assert.equal($('rinkTidyRadius').type,'range');assert.equal($('rinkTidyRadius').value,'100');assert.equal($('rinkTidyRadius').disabled,true);assert.equal($('rinkTidySelectedOption').disabled,true);assert.equal($('rinkTidyPreview').hidden,false);assert.equal($('rinkTidyPreview').parentElement,$('rinkStage'));assert.equal(w.document.activeElement,$('rinkTidyApply'));
assert.equal($('rinkSvg').querySelector('[data-editor-ui="tidy-original"]').getAttribute('opacity'),'0.22');assert.ok($('rinkSvg').querySelector('[data-editor-ui="tidy-preview"]'));assert.deepEqual(JSON.parse(w.localStorage.getItem('nsk_rink_draft_v2')).marks,original);
$('rinkTidyMode').value='equipment';$('rinkTidyMode').dispatchEvent(new w.Event('change'));assert.deepEqual(JSON.parse(w.localStorage.getItem('nsk_rink_draft_v2')).marks,original);$('rinkTidyMode').value='lines';$('rinkTidyMode').dispatchEvent(new w.Event('change'));
$('rinkTidyCancel').click();assert.equal($('rinkTidyPreview').hidden,true);assert.equal(w.document.activeElement,$('rinkTidy'));
$('rinkTidy').click();$('rinkTidyApply').click();await new Promise(r=>setTimeout(r,300));assert.equal(JSON.parse(w.localStorage.getItem('nsk_rink_draft_v2')).marks[0].points.length,2);assert.equal($('rinkSvg').querySelector('[data-editor-ui="tidy-preview"]'),null);
// Place an uneven course and draw through the real pointer handlers.
const {asymmetricSlalom}=await import('./fixtures/asymmetric-slalom.mjs'),[stroke,...tires]=asymmetricSlalom();
w.confirm=()=>true;let uid=0;w.crypto.randomUUID=()=> 'asym-ui-'+(++uid);$('rinkClear').click();
const svg=$('rinkSvg');svg.getScreenCTM=()=>({a:1,b:0,inverse:()=>({})});svg.createSVGPoint=()=>({x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}});svg.setPointerCapture=()=>{};
const pointer=(type,p)=>{const e=new w.Event(type,{bubbles:true,cancelable:true});for(const [key,value] of Object.entries({clientX:p.x,clientY:p.y,pointerId:1,isPrimary:true,pointerType:'mouse',button:0}))Object.defineProperty(e,key,{value});svg.dispatchEvent(e);};
for(const tire of tires){w.document.querySelector('[data-tool="tire"]').click();pointer('pointerdown',tire);pointer('pointerup',tire);}
w.document.querySelector('[data-tool="curve"]').click();pointer('pointerdown',stroke.points[0]);for(const p of stroke.points.slice(1,-1))pointer('pointermove',p);pointer('pointerup',stroke.points.at(-1));await new Promise(r=>setTimeout(r,300));
const before=JSON.parse(w.localStorage.getItem('nsk_rink_draft_v2')).marks;
$('rinkTidy').click();assert.equal($('rinkTidyApply').disabled,false);assert.equal($('rinkTidyScope').value,'selected');assert.deepEqual(JSON.parse(w.localStorage.getItem('nsk_rink_draft_v2')).marks,before);
$('rinkTidyApply').click();await new Promise(r=>setTimeout(r,300));const after=JSON.parse(w.localStorage.getItem('nsk_rink_draft_v2')).marks,route=after.find(m=>m.type==='curve');assert.equal(route.routeStyle,'planned');assert.deepEqual(after.filter(m=>m.type==='tire'),before.filter(m=>m.type==='tire'));
const radii=tires.map(t=>{const radius=Math.min(...route.points.map(p=>Math.hypot(p.x-t.x,p.y-t.y)));assert.ok(route.points.filter(p=>Math.abs(Math.hypot(p.x-t.x,p.y-t.y)-radius)<1e-6).length>=8);return radius;});assert.ok(Math.max(...radii)-Math.min(...radii)<1e-6);
if(process.env.NSK_RINK_QA_OUT){fs.mkdirSync(process.env.NSK_RINK_QA_OUT,{recursive:true});fs.writeFileSync(process.env.NSK_RINK_QA_OUT+'/asymmetric-slalom.json',JSON.stringify({before:before.map(m=>m.type==='curve'?{...m,rendered:w.NskRoutePlanner.rendered(m)}:m),after:after.map(m=>m.type==='curve'?{...m,rendered:w.NskRoutePlanner.rendered(m)}:m)}));}
dom.window.close();console.log('Actual rink DOM: preview, ghost, focus, cancel and accept passed; original storage untouched until accept; asymmetric slalom drawn by pointer input becomes five equal-radius turns.');
