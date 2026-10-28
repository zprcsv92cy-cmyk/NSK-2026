import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../navigation.js',import.meta.url),'utf8');
const section=source.slice(source.indexOf('  function editingViewport('),source.indexOf('  async function render()'));
function fixture(activeElement){
 const events={},visualEvents={},styles=new Map();let scrolls=0,writes=0;
 const document={activeElement,documentElement:{style:{getPropertyValue:key=>styles.get(key),setProperty:(key,value)=>{writes++;styles.set(key,value);}}},addEventListener:(name,callback)=>events[name]=callback};
 const window={innerWidth:390,innerHeight:700,scrollY:80,visualViewport:{scale:1,addEventListener:(name,callback)=>visualEvents[name]=callback},scrollTo:()=>{scrolls++;window.scrollY=0;},addEventListener:(name,callback)=>events[name]=callback};
 let scheduled;const api=Function('document','window','requestAnimationFrame','setTimeout',section+'bindMobileViewport();return {editingViewport};')(document,window,fn=>{scheduled=fn;return 1;},()=>{});
 return {api,window,document,scrolls:()=>scrolls,writes:()=>writes,resize(){visualEvents.resize();const fn=scheduled;scheduled=null;fn();}};
}
const input={tagName:'INPUT',matches:()=>true};
const body={tagName:'BODY',matches:()=>false};
const frame=activeElement=>({tagName:'IFRAME',matches:()=>false,contentDocument:{activeElement}});
test('keyboard pan is preserved while typing inside the users iframe',()=>{
 const f=fixture(frame(input));assert.equal(f.api.editingViewport(),true);assert.equal(f.scrolls(),0);
 f.window.innerHeight=420;f.resize();assert.equal(f.scrolls(),0);assert.equal(f.writes(),2);
 f.resize();assert.equal(f.writes(),2);assert.equal(f.scrolls(),0);
 f.document.activeElement.contentDocument.activeElement=body;f.resize();assert.equal(f.scrolls(),1);
});
test('direct and nested editors are protected, including contenteditable',()=>{
 for(const active of [input,frame(frame(input)),{tagName:'DIV',matches:()=>true}]){const f=fixture(active);assert.equal(f.scrolls(),0);}
});
test('unreadable frames do not trigger a competing viewport reset',()=>{
 const f=fixture({tagName:'IFRAME',matches:()=>false,get contentDocument(){throw Error('cross origin');}});assert.equal(f.scrolls(),0);
});
test('idle mobile viewport recovers after keyboard dismissal but zoom is preserved',()=>{
 const f=fixture(body);assert.equal(f.scrolls(),1);f.window.scrollY=60;f.window.visualViewport.scale=2;f.resize();assert.equal(f.scrolls(),1);
});
