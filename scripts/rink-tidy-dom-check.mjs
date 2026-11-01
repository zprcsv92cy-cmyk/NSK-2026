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
$('rinkTidy').click();assert.equal($('rinkTidyPreview').hidden,false);assert.equal($('rinkTidyPreview').parentElement,$('rinkStage'));assert.equal(w.document.activeElement,$('rinkTidyApply'));
assert.equal($('rinkSvg').querySelector('[data-editor-ui="tidy-original"]').getAttribute('opacity'),'0.22');assert.ok($('rinkSvg').querySelector('[data-editor-ui="tidy-preview"]'));assert.deepEqual(JSON.parse(w.localStorage.getItem('nsk_rink_draft_v2')).marks,original);
$('rinkTidyCancel').click();assert.equal($('rinkTidyPreview').hidden,true);assert.equal(w.document.activeElement,$('rinkTidy'));
$('rinkTidy').click();$('rinkTidyApply').click();await new Promise(r=>setTimeout(r,300));assert.equal(JSON.parse(w.localStorage.getItem('nsk_rink_draft_v2')).marks[0].points.length,2);assert.equal($('rinkSvg').querySelector('[data-editor-ui="tidy-preview"]'),null);
dom.window.close();console.log('Actual rink DOM: preview, ghost, focus, cancel and accept passed; original storage untouched until accept.');
