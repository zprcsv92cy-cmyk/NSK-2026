import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../navigation.js',import.meta.url),'utf8');
const section=source.slice(source.indexOf('  function editingViewport('),source.indexOf('  function mountCodes('));
function fixture({editing=true,nested=true,zoom=1,height=390,offset=60,embedded=false}={}){
 const events={},visualEvents={},styles=new Map(),classes=new Set();
 const scroll={scrollTop:0,getBoundingClientRect:()=>({top:0,bottom:300})};
 const input={tagName:'INPUT',matches:()=>true,closest:()=>scroll,getBoundingClientRect:()=>({top:400,bottom:444})};
 const body={tagName:'BODY',matches:()=>false};
 const inner={activeElement:editing?input:body};
 const document={activeElement:nested?{tagName:'IFRAME',matches:()=>false,contentDocument:inner}:inner.activeElement,
  documentElement:{classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)},style:{getPropertyValue:key=>styles.get(key),setProperty:(key,value)=>styles.set(key,value)}},
  addEventListener:(name,fn)=>events[name]=fn};
 const window={innerWidth:390,innerHeight:800,scrollY:0,visualViewport:{scale:zoom,height,offsetTop:offset,addEventListener:(name,fn)=>visualEvents[name]=fn},addEventListener:()=>{},scrollTo:()=>{window.scrollY=0;}};
 window.parent=window;if(embedded)window.NSKShellHost={};
 let queued;
 Function('document','window','requestAnimationFrame','setTimeout',section+'bindMobileViewport();')(document,window,fn=>{queued=fn;return 1;},()=>{});
 return {window,inner,body,document,styles,classes,scroll,resize(){visualEvents.resize();queued();}};
}
test('keyboard inside iframe uses visible height and pan and reveals field',()=>{
 const f=fixture();assert.equal(f.styles.get('--nsk-app-height'),'390px');assert.equal(f.styles.get('--nsk-app-top'),'60px');assert(f.classes.has('nsk-keyboard-open'));assert.equal(f.scroll.scrollTop,160);
});
test('keyboard dismissal restores full height even if input stays focused',()=>{
 const f=fixture();f.window.visualViewport.height=800;f.window.visualViewport.offsetTop=0;f.resize();assert.equal(f.styles.get('--nsk-app-height'),'800px');assert.equal(f.styles.get('--nsk-app-top'),'0px');assert(!f.classes.has('nsk-keyboard-open'));
});
test('pinch zoom is not mistaken for keyboard',()=>{
 const f=fixture({zoom:2});assert.equal(f.styles.get('--nsk-app-height'),'800px');assert(!f.classes.has('nsk-keyboard-open'));assert.equal(f.scroll.scrollTop,0);
});
test('non-editing viewport and desktop preserve normal navigation',()=>{
 const f=fixture({editing:false});assert(!f.classes.has('nsk-keyboard-open'));
 const g=fixture();g.window.innerWidth=1200;g.resize();assert(!g.classes.has('nsk-keyboard-open'));
});
test('direct editors supported and inner frames do not shrink twice',()=>{
 const f=fixture({nested:false});assert(f.classes.has('nsk-keyboard-open'));
 const g=fixture();g.window.parent={};g.resize();assert.equal(g.styles.get('--nsk-app-height'),'800px');assert(!g.classes.has('nsk-keyboard-open'));
});

test('iOS equal viewport heights still hide menu during iframe editing and restore on blur',()=>{
 const f=fixture();f.window.innerHeight=390;f.window.visualViewport.height=390;f.resize();
 assert(!f.classes.has('nsk-keyboard-open'));assert(f.classes.has('nsk-mobile-editing'));
 f.inner.activeElement=f.body;f.resize();assert(!f.classes.has('nsk-mobile-editing'));
});
test('mobile focus hides menu before keyboard resize; desktop and child frames do not',()=>{
 const f=fixture({height:800,offset:0});assert(f.classes.has('nsk-mobile-editing'));
 f.window.innerWidth=1200;f.resize();assert(!f.classes.has('nsk-mobile-editing'));
 const g=fixture();g.window.parent={};g.resize();assert(!g.classes.has('nsk-mobile-editing'));
});

test('embedded editor leaves viewport sizing exclusively to its outer shell',()=>{
 const f=fixture({embedded:true});
 assert.equal(f.styles.size,0);assert.equal(f.classes.size,0);assert.equal(f.scroll.scrollTop,0);
});
