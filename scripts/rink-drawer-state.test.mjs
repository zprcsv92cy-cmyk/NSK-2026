import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const plannerCode=fs.readFileSync(new URL('../rink-route-planner.js',import.meta.url),'utf8');
const code=fs.readFileSync(new URL('../rink-drawer.js',import.meta.url),'utf8');
const DRAFT='nsk_rink_draft_v2',SAVED='nsk_rink_drawing_v1';
function editor(stored={},movableGoals=false){
 const nodes=new Map(),storage=new Map(Object.entries(stored)),timers=new Map(),documentEvents={},windowEvents={};let nextId=0,quota=false;
 class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.attrs={};this.events={};this.value='';this.dataset={};this.hidden=false;this.open=false;this.options=[];this.textContent='';}
  setAttribute(k,v){this.attrs[k]=v;}
  getAttribute(k){return this.attrs[k]??null;}
  append(n){this.children.push(n);}
  replaceChildren(){this.children=[];}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
  emit(type,event={}){for(const fn of this.events[type]||[])fn(event);}
  focus(){this.focused=true;}
  setPointerCapture(){}
  getScreenCTM(){return {a:1,b:0,inverse:()=>({})};}
  createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}};}
 }
 const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const tools=['move','goal','player','goalie','puck','cone','skate','pass','shot','divider','divider-yellow','divider-blue','tire','erase','curve','pan'].map(tool=>{const n=new Node('button');n.dataset.tool=tool;return n;});
 if(movableGoals)node('rinkSvg').dataset.goalTemplate='movable';
 node('rinkColor').value='#b11226';node('rinkCategory').value='Passningar';node('rinkCategory').options=[{value:'Passningar'},{value:'Skott'}];
 const bodyClasses=new Set(),rootStyles=new Map();
 const document={documentElement:{style:{setProperty:(k,v)=>rootStyles.set(k,v),getPropertyValue:k=>rootStyles.get(k)||''}},activeElement:null,hidden:false,getElementById:node,createElementNS:(_ns,tag)=>new Node(tag),querySelectorAll:selector=>selector==='[data-tool]'?tools:[],addEventListener:(type,fn)=>{documentEvents[type]=fn;},body:{classList:{toggle:(name,on)=>{const enabled=on===undefined?!bodyClasses.has(name):on;if(enabled)bodyClasses.add(name);else bodyClasses.delete(name);return enabled;},contains:name=>bodyClasses.has(name)}}};
 const context={confirm:()=>true,document,window:{innerWidth:1200,innerHeight:700,requestAnimationFrame:fn=>fn(),addEventListener:(type,fn)=>windowEvents[type]=fn},crypto:{randomUUID:()=>String(++nextId)},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{if(quota)throw Error('Quota exceeded');storage.set(key,value);}},setTimeout:fn=>{const id=++nextId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),Blob};
 vm.runInNewContext(plannerCode,context);vm.runInNewContext(code,context);documentEvents.DOMContentLoaded();
 const flush=()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}};
 const pointer=(type,x,y,extra={})=>node('rinkSvg').emit(type,{clientX:x,clientY:y,pointerId:1,isPrimary:true,pointerType:'touch',button:0,...extra});
 const choose=tool=>tools.find(t=>t.dataset.tool===tool).onclick();
 return {node,choose,pointer,flush,storage,context,windowEvent:(name,event={})=>windowEvents[name]?.(event),draft:()=>JSON.parse(storage.get(DRAFT)),quota:()=>{quota=true;},leave:()=>windowEvents.pagehide()};
}
function viewTransform(f,rotated=false){
 const svg=f.node('rinkSvg');
 svg.getScreenCTM=()=>{const [x,y,width]=svg.attrs.viewBox.split(' ').map(Number),scale=480/width;return {a:rotated?0:scale,b:rotated?scale:0,inverse:()=>({x,y,scale,rotated})};};
 svg.createSVGPoint=()=>({x:0,y:0,matrixTransform(m){return m.rotated?{x:m.x+this.y/m.scale,y:m.y+(860-this.x)/m.scale}:{x:m.x+this.x/m.scale,y:m.y+this.y/m.scale};}});
 return ()=>svg.attrs.viewBox.split(' ').map(Number);
}
test('pinch zoom keeps the point between both fingers anchored and never edits marks',()=>{
 const mark={id:'a',type:'player',x:120,y:200,color:'#b11226'},f=editor({[DRAFT]:JSON.stringify({marks:[mark]})}),view=viewTransform(f);f.node('rinkTitle').emit('input');f.flush();
 f.pointer('pointerdown',100,300);f.pointer('pointerdown',300,300,{pointerId:2,isPrimary:false});f.pointer('pointermove',400,300,{pointerId:2,isPrimary:false});
 const [x,y,width]=view(),scale=480/width;assert.equal(scale,1.5);assert.ok(Math.abs(x+250/scale-200)<1e-6);assert.ok(Math.abs(y+300/scale-300)<1e-6);
 f.pointer('pointerup',400,300,{pointerId:2,isPrimary:false});f.pointer('pointerup',100,300);f.node('rinkTitle').emit('input');f.flush();assert.deepEqual(f.draft().marks,[mark]);assert.equal(f.node('rinkUndo').disabled,true);
});
test('two fingers pan a zoomed rink without moving objects or changing scale',()=>{
 const mark={id:'a',type:'tire',x:220,y:365,color:'#111827'},f=editor({[DRAFT]:JSON.stringify({marks:[mark]})}),view=viewTransform(f);f.node('rinkZoomIn').onclick();f.node('rinkZoomIn').onclick();const [oldX,oldY,width]=view();
 f.pointer('pointerdown',100,300);f.pointer('pointerdown',300,300,{pointerId:2,isPrimary:false});f.pointer('pointermove',120,320);f.pointer('pointermove',320,320,{pointerId:2,isPrimary:false});
 assert.ok(Math.abs(view()[0]-(oldX-10))<1e-6);assert.ok(Math.abs(view()[1]-(oldY-10))<1e-6);assert.equal(view()[2],width);f.pointer('pointerup',320,320,{pointerId:2,isPrimary:false});f.pointer('pointerup',120,320);f.node('rinkTitle').emit('input');f.flush();assert.deepEqual(f.draft().marks,[mark]);
});
test('pinching rolls back provisional drawing, placement, erasure and object movement',()=>{
 for(const tool of ['curve','skate','pass','shot','player','cone','tire','erase','move']){
  const mark={id:'a',type:'player',x:100,y:200,color:'#b11226'},f=editor({[DRAFT]:JSON.stringify({marks:[mark]})});viewTransform(f);f.choose(tool);f.pointer('pointerdown',100,200);f.pointer('pointermove',130,230);f.pointer('pointerdown',300,300,{pointerId:2,isPrimary:false});f.flush();
  f.pointer('pointerup',300,300,{pointerId:2,isPrimary:false});f.pointer('pointermove',160,260);f.pointer('pointerup',160,260);f.node('rinkTitle').emit('input');f.flush();assert.deepEqual(f.draft().marks,[mark],tool);assert.equal(f.node('rinkUndo').disabled,true,tool);assert.equal(f.context.document.body.classList.contains('rink-gesturing'),false);
  f.choose('cone');f.pointer('pointerdown',250,400);f.pointer('pointerup',250,400);f.flush();assert.equal(f.draft().marks.length,2,tool);
 }
});
test('a pinch preserves redo history when it cancels a newly started stroke',()=>{
 const f=editor();viewTransform(f);f.choose('player');f.pointer('pointerdown',100,200);f.pointer('pointerup',100,200);f.node('rinkUndo').onclick();f.choose('curve');f.pointer('pointerdown',100,300);f.pointer('pointermove',150,350);f.pointer('pointerdown',300,300,{pointerId:2,isPrimary:false});f.pointer('pointerup',300,300,{pointerId:2,isPrimary:false});f.pointer('pointerup',150,350);assert.equal(f.node('rinkRedo').disabled,false);f.node('rinkRedo').onclick();f.flush();assert.equal(f.draft().marks.length,1);assert.equal(f.draft().marks[0].type,'player');
});
test('pinch cancellation and zoom limits keep all viewport edges within the rink',()=>{
 const f=editor();const view=viewTransform(f);f.choose('curve');f.pointer('pointerdown',100,300);f.pointer('pointerdown',200,300,{pointerId:2,isPrimary:false});f.pointer('pointermove',1000,300,{pointerId:2,isPrimary:false});assert.equal(view()[2],160);
 f.pointer('pointercancel',1000,300,{pointerId:2,isPrimary:false});f.pointer('lostpointercapture',100,300);f.node('rinkTitle').emit('input');f.flush();assert.deepEqual(f.draft().marks,[]);assert.equal(f.context.document.body.classList.contains('rink-gesturing'),false);
 f.pointer('pointerdown',100,300);f.pointer('pointerdown',300,300,{pointerId:2,isPrimary:false});f.pointer('pointermove',101,300,{pointerId:2,isPrimary:false});assert.deepEqual(view(),[0,0,480,860]);f.pointer('pointerup',101,300,{pointerId:2,isPrimary:false});f.pointer('pointerup',100,300);
});
test('pinch anchoring follows the rotated rink coordinate transform',()=>{
 const f=editor(),view=viewTransform(f,true);f.pointer('pointerdown',300,200);f.pointer('pointerdown',500,200,{pointerId:2,isPrimary:false});f.pointer('pointermove',700,200,{pointerId:2,isPrimary:false});const [x,y,width]=view(),scale=480/width;assert.equal(scale,2);assert.ok(Math.abs(x+200/scale-200)<1e-6);assert.ok(Math.abs(y+(860-500)/scale-460)<1e-6);f.pointer('pointerup',700,200,{pointerId:2,isPrimary:false});f.pointer('pointerup',300,200);
});
test('leaving during a pinch clears held fingers so drawing works on return',()=>{
 const f=editor();viewTransform(f);f.choose('curve');f.pointer('pointerdown',100,300);f.pointer('pointermove',150,350);f.pointer('pointerdown',300,300,{pointerId:2,isPrimary:false});f.leave();assert.deepEqual(f.draft().marks,[]);assert.equal(f.context.document.body.classList.contains('rink-gesturing'),false);
 f.choose('cone');f.pointer('pointerdown',200,400);f.pointer('pointerup',200,400);f.flush();assert.equal(f.draft().marks.length,1);assert.equal(f.draft().marks[0].type,'cone');
});
test('rink drafts preserve symbol changes, numbers, duplication and undo/redo without replacing manual saves',()=>{
 const f=editor({[SAVED]:JSON.stringify({title:'Arkiv',category:'Passningar',description:'',marks:[]})});
 f.choose('player');f.pointer('pointerdown',100,100);f.pointer('pointerup',100,100);f.flush();assert.equal(f.draft().marks.length,1);
 f.node('rinkNumber').value='18';f.node('rinkNumber').oninput();f.node('rinkNumber').onblur();f.node('rinkDuplicate').onclick();f.flush();assert.deepEqual(f.draft().marks.map(m=>m.number),['18','18']);
 f.node('rinkSelectedColor').value='#2563eb';f.node('rinkSelectedColor').onchange();f.flush();assert.equal(f.draft().marks[1].color,'#2563eb');
 f.node('rinkUndo').onclick();f.flush();assert.equal(f.draft().marks[1].color,'#b11226');f.node('rinkRedo').onclick();f.flush();assert.equal(f.draft().marks[1].color,'#2563eb');
 f.node('rinkTitle').value='Ny övning';f.node('rinkTitle').emit('input');f.leave();assert.equal(f.draft().title,'Ny övning');assert.equal(JSON.parse(f.storage.get(SAVED)).title,'Arkiv');
 const restored=editor(Object.fromEntries(f.storage));assert.equal(restored.node('rinkTitle').value,'Ny övning');restored.choose('move');restored.pointer('pointerdown',125,125);assert.equal(restored.node('rinkNumber').value,'18');
});
test('cancelled movement restores the diagram and history, and leaving mid-drag saves the latest geometry',()=>{
 const f=editor();f.choose('player');f.pointer('pointerdown',100,100);f.pointer('pointerup',100,100);f.flush();f.choose('move');f.pointer('pointerdown',100,100);f.pointer('pointermove',170,170);f.pointer('pointercancel',170,170);f.flush();assert.equal(f.draft().marks[0].x,100);
 f.node('rinkUndo').onclick();f.flush();assert.equal(f.draft().marks.length,0);f.node('rinkRedo').onclick();f.flush();assert.equal(f.draft().marks[0].x,100);
 f.pointer('pointerdown',100,100);f.pointer('pointermove',180,190);f.leave();assert.equal(f.draft().marks[0].x,180);assert.equal(f.draft().marks[0].y,190);
});
test('empty drafts override old manual drawings; malformed geometry is filtered and quota failures remain visible',()=>{
 const one={id:'old',type:'player',x:100,y:100,color:'#b11226'};
 const f=editor({[SAVED]:JSON.stringify({marks:[one]}),[DRAFT]:JSON.stringify({marks:[],title:'Tomt utkast'})});f.node('rinkTitle').emit('input');f.flush();assert.equal(f.draft().marks.length,0);
 const invalid=editor({[DRAFT]:JSON.stringify({marks:[one,{...one,id:'line',type:'pass',x2:'bad',y2:2}]})});invalid.node('rinkTitle').emit('input');invalid.flush();assert.equal(invalid.draft().marks.length,1);invalid.quota();invalid.node('rinkTitle').emit('input');invalid.flush();assert.match(invalid.node('rinkDraftStatus').textContent,/kunde inte sparas/);
});
test('line gestures persist endpoints, preserve line length at rink edges and cancel incomplete strokes',()=>{
 const f=editor();f.choose('pass');f.pointer('pointerdown',100,200);f.pointer('pointermove',250,300);f.pointer('pointerup',250,300);f.flush();assert.equal(f.draft().marks[0].x2,250);assert.equal(f.draft().marks[0].y2,300);
 f.choose('move');f.pointer('pointerdown',175,250);f.pointer('pointermove',900,700);f.pointer('pointerup',900,700);f.flush();let line=f.draft().marks[0];assert.equal(line.x2-line.x,150);assert.equal(line.y2-line.y,100);assert.equal(line.x2,458);
 f.choose('shot');f.pointer('pointerdown',200,400);f.pointer('pointermove',300,500);f.pointer('pointercancel',300,500);f.flush();assert.equal(f.draft().marks.length,1);
 f.pointer('pointerdown',200,400);f.pointer('pointermove',300,500);f.pointer('pointerup',300,500);f.flush();assert.equal(f.draft().marks[1].type,'shot');
 const restored=editor(Object.fromEntries(f.storage));restored.node('rinkTitle').emit('input');restored.flush();assert.equal(restored.draft().marks[1].x2,300);
});

test('curved paths survive copy, translation, undo and recovery; malformed points are rejected',()=>{
 const f=editor();f.choose('curve');f.pointer('pointerdown',100,200);f.pointer('pointermove',140,230);f.pointer('pointermove',160,300);f.pointer('pointerup',210,340);f.flush();
 const original=f.draft().marks[0];assert.equal(original.points.length,4);assert.equal(original.points[3].x,210);
 f.node('rinkDuplicate').onclick();f.flush();assert.equal(f.draft().marks[0].points[0].x,100);assert.equal(f.draft().marks[1].points[0].x,125);
 f.choose('move');f.pointer('pointerdown',210,340);f.pointer('pointermove',230,360);f.pointer('pointerup',230,360);f.flush();assert.equal(f.draft().marks[0].points[0].x,120);
 f.node('rinkUndo').onclick();f.flush();assert.equal(f.draft().marks[0].points[0].x,100);
 const restored=editor(Object.fromEntries(f.storage));restored.node('rinkTitle').emit('input');restored.flush();assert.deepEqual(restored.draft().marks[0].points,original.points);
 const bad=editor({[DRAFT]:JSON.stringify({marks:[{...original,points:[{x:'bad',y:1}]}]})});bad.node('rinkTitle').emit('input');bad.flush();assert.equal(bad.draft().marks.length,0);
});
test('tapping or moving an existing curved route never appends the release point',()=>{
 const route={id:'r',type:'curve',routeStyle:'planned',motion:'forward',color:'#111827',x:100,y:300,points:[{x:100,y:300},{x:200,y:300},{x:300,y:300}]};
 const f=editor({[DRAFT]:JSON.stringify({marks:[route]})});f.choose('move');
 f.pointer('pointerdown',200,300);f.pointer('pointerup',200,300);f.node('rinkTitle').emit('input');f.flush();assert.deepEqual(f.draft().marks[0].points,route.points);
 f.node('rinkSelectedDirection').value='backward';f.node('rinkSelectedDirection').onchange();f.flush();const split=f.draft().marks;assert.equal(split.length,2);assert.deepEqual(split[0].points.at(-1),{x:200,y:300});assert.deepEqual(split[1].points[0],{x:200,y:300});assert.deepEqual(split[1].points.at(-1),{x:300,y:300});
 const moved=editor({[DRAFT]:JSON.stringify({marks:[route]})});moved.choose('move');moved.pointer('pointerdown',200,300);moved.pointer('pointermove',210,320);moved.pointer('pointerup',210,320);moved.flush();assert.deepEqual(moved.draft().marks[0].points,route.points.map(p=>({x:p.x+10,y:p.y+20})));
});
test('equipment pattern cleanup is one undoable action and survives draft recovery',()=>{
 const marks=[[210,559],[110,635],[195,710],[100,770]].map(([x,y],i)=>({id:'t'+i,type:'tire',x,y,color:'#111827'})).concat([{id:'a',type:'cone',x:353,y:650,color:'#b11226'},{id:'b',type:'cone',x:302,y:725,color:'#b11226'},{id:'c',type:'cone',x:410,y:733,color:'#b11226'}]);
 const f=editor({[DRAFT]:JSON.stringify({marks})});f.node('rinkTidy').onclick();f.flush();const cleaned=f.draft().marks;assert.ok(cleaned[0].y>=589);assert.equal(cleaned[0].x,cleaned[2].x);assert.equal(cleaned[1].x,cleaned[3].x);assert.match(f.node('rinkTidyReport').textContent,/koner\/däck/);
 f.node('rinkUndo').onclick();f.flush();assert.deepEqual(f.draft().marks,marks);f.node('rinkRedo').onclick();f.flush();assert.deepEqual(f.draft().marks,cleaned);
 const restored=editor(Object.fromEntries(f.storage));restored.node('rinkTitle').emit('input');restored.flush();assert.deepEqual(restored.draft().marks,cleaned);
});
test('selection tools start compact, expand on demand and clear when choosing a drawing tool',()=>{
 const marks=[{id:'a',type:'player',x:100,y:200,color:'#b11226'},{id:'b',type:'player',x:300,y:300,color:'#2563eb'}],f=editor({[DRAFT]:JSON.stringify({marks})});
 f.pointer('pointerdown',100,200);f.pointer('pointerup',100,200);assert.equal(f.node('rinkSelectionPanel').getAttribute('data-expanded'),'false');f.node('rinkSelectionMore').onclick();assert.equal(f.node('rinkSelectionMore').getAttribute('aria-expanded'),'true');
 f.choose('curve');assert.equal(f.node('rinkSelectionPanel').hidden,true);assert.equal(f.node('rinkLineSummary').textContent,'Åkväg');assert.equal(f.node('rinkSvg').children.some(n=>n.attrs['data-editor-ui']==='selection'),false);
 f.choose('move');f.pointer('pointerdown',300,300);f.pointer('pointerup',300,300);assert.equal(f.node('rinkSelectionPanel').hidden,false);assert.equal(f.node('rinkSelectionPanel').getAttribute('data-expanded'),'false');assert.equal(f.node('rinkSelectionMore').textContent,'Fler val');
});
test('small finger jitter selects without moving equipment or adding an undo step',()=>{
 const mark={id:'a',type:'tire',x:120,y:300,color:'#111827'},f=editor({[DRAFT]:JSON.stringify({marks:[mark]})});f.pointer('pointerdown',120,300);f.pointer('pointermove',125,303);f.pointer('pointerup',125,303);f.node('rinkTitle').emit('input');f.flush();assert.deepEqual(f.draft().marks,[mark]);assert.equal(f.node('rinkUndo').disabled,true);
 f.pointer('pointerdown',120,300);f.pointer('pointermove',140,320);assert.equal(f.node('rinkSelectionPanel').hidden,true);f.pointer('pointerup',140,320);f.flush();assert.equal(f.draft().marks[0].x,140);assert.equal(f.node('rinkSelectionPanel').hidden,false);f.node('rinkUndo').onclick();f.flush();assert.deepEqual(f.draft().marks,[mark]);
});
test('zoom and pan change only the view, not saved drawing coordinates or undo history',()=>{
 const f=editor();f.choose('player');f.pointer('pointerdown',100,200);f.pointer('pointerup',100,200);f.flush();const before=f.storage.get(DRAFT);
 f.node('rinkZoomIn').onclick();assert.equal(f.node('rinkZoomLabel').textContent,'150%');f.choose('pan');f.pointer('pointerdown',200,300);f.pointer('pointermove',160,250);f.pointer('pointerup',160,250);assert.equal(f.node('rinkSvg').attrs.viewBox.split(' ')[0],'120');assert.equal(f.storage.get(DRAFT),before);
 f.node('rinkZoomReset').onclick();assert.equal(f.node('rinkSvg').attrs.viewBox,'0 0 480 860');f.node('rinkUndo').onclick();f.flush();assert.equal(f.draft().marks.length,0);
});

test('the NSK template is embedded below editable marks without changing their coordinates',()=>{
 const f=editor();const svg=f.node('rinkSvg'),background=svg.children[0];
 assert.equal(background.tagName,'image');assert.match(background.attrs.href,/^data:image\/png;base64,/);
 assert.equal(background.attrs['pointer-events'],'none');assert.equal(background.attrs.width,464);assert.equal(background.attrs.height,848);
 f.choose('player');f.pointer('pointerdown',240,430);f.pointer('pointerup',240,430);f.flush();
 assert.equal(f.draft().marks[0].x,240);assert.equal(f.draft().marks[0].y,430);
 assert.equal(f.node('rinkSvg').children[0].attrs['data-rink-background'],'nsk');
});

test('yellow and blue rink dividers retain their endpoints and color type through copy, undo and reload',()=>{
 for(const tool of ['divider-yellow','divider-blue']){
  const f=editor();f.choose(tool);f.pointer('pointerdown',80,180);f.pointer('pointermove',320,180);f.pointer('pointerup',320,180);f.flush();
  assert.equal(f.draft().marks[0].type,tool);assert.ok(Math.abs(f.draft().marks[0].x2-(80+436/30*2.5))<1e-9);
  const shape=f.node('rinkSvg').children.find(n=>n.attrs['data-mark']===f.draft().marks[0].id).children[0];assert.equal(shape.attrs.stroke,tool==='divider-yellow'?'#facc15':'#2563eb');assert.equal(shape.attrs['marker-end'],undefined);
  f.node('rinkDuplicate').onclick();f.flush();assert.equal(f.draft().marks.length,2);
  f.node('rinkUndo').onclick();f.flush();assert.equal(f.draft().marks.length,1);
  const restored=editor(Object.fromEntries(f.storage));restored.choose('move');restored.pointer('pointerdown',100,180);assert.equal(restored.node('rinkSelectedLabel').textContent,tool==='divider-yellow'?'Gul rinkavdelare markerad':'Blå rinkavdelare markerad');
  restored.pointer('pointermove',110,200);restored.pointer('pointerup',110,200);restored.flush();assert.ok(Math.abs(restored.draft().marks[0].x2-(90+436/30*2.5))<1e-9);
 }
});
test('small tires stay hollow, editable and recoverable like other symbols',()=>{
 const f=editor();f.choose('tire');f.pointer('pointerdown',140,240);f.pointer('pointerup',140,240);f.flush();
 assert.equal(f.draft().marks[0].type,'tire');
 const group=f.node('rinkSvg').children.find(n=>n.attrs['data-mark']===f.draft().marks[0].id);
 assert(group.children.some(n=>n.tagName==='circle'&&n.attrs.fill==='none'&&n.attrs.r===10));
 f.node('rinkDuplicate').onclick();f.flush();assert.equal(f.draft().marks.length,2);
 const restored=editor(Object.fromEntries(f.storage));restored.choose('move');restored.pointer('pointerdown',140,240);assert.equal(restored.node('rinkSelectedLabel').textContent,'Däck markerad');
 restored.node('rinkDelete').onclick();restored.flush();assert.equal(restored.draft().marks.length,1);
});

test('saving a drawn exercise requires an explicit name and category before writing to the archive',async()=>{
 const f=editor();f.choose('player');f.pointer('pointerdown',120,180);f.pointer('pointerup',120,180);
 await f.node('rinkSave').onclick();assert.match(f.node('rinkStatus').textContent,/namn/);assert.equal(f.node('rinkSettings').open,true);assert.equal(f.node('rinkTitle').focused,true);
 f.node('rinkTitle').value='Min övning';f.node('rinkCategory').value='';await f.node('rinkSave').onclick();assert.match(f.node('rinkStatus').textContent,/kategori/);assert.equal(f.node('rinkCategory').focused,true);assert.equal(f.storage.has(SAVED),false);
});
test('multiple exercise categories survive draft save and restore',()=>{
 const f=editor(),picker=f.node('rinkCategory');picker.options=[{value:'Skridskoåkning'},{value:'Skott och avslut'},{value:'Uppvärmning'}];Object.defineProperty(picker,'selectedOptions',{get(){return this.options.filter(o=>o.selected);}});
 picker.options[0].selected=true;picker.options[1].selected=true;picker.emit('change');f.flush();
 assert.deepEqual(f.draft().categories,['Skridskoåkning','Skott och avslut']);
 assert.equal(f.draft().category,'Skridskoåkning, Skott och avslut');
});

test('template goals can move, rotate, copy and reload; clearing does not recreate them',()=>{
 const f=editor({},true);f.choose('move');f.pointer('pointerdown',240,78);f.pointer('pointermove',310,200);f.pointer('pointerup',310,200);f.flush();
 assert.equal(f.draft().marks.length,2);assert.equal(f.draft().marks[0].x,310);
 f.node('rinkGoalRotation').value='90';f.node('rinkGoalRotation').onchange();f.node('rinkDuplicate').onclick();f.flush();
 assert.equal(f.draft().marks.length,3);assert.equal(f.draft().marks[2].angle,90);
 f.node('rinkUndo').onclick();f.flush();assert.equal(f.draft().marks.length,2);assert.equal(f.draft().marks[0].angle,90);
 const g=editor(Object.fromEntries(f.storage),true);g.leave();assert.equal(g.draft().marks.length,2);assert.equal(g.draft().marks[0].angle,90);
 g.node('rinkClear').onclick();g.flush();const cleared=editor(Object.fromEntries(g.storage),true);cleared.leave();assert.equal(cleared.draft().marks.length,0);
});
test('backwards skating and movement labels survive loading, copying and draft recovery',()=>{
 const f=editor({[DRAFT]:JSON.stringify({title:'Bakåt',marks:[{id:'b',type:'skate',x:240,y:430,x2:240,y2:550,color:'#b11226',motion:'backward',movementLabel:'Stopp'}]})});
 f.choose('move');f.pointer('pointerdown',240,490);f.pointer('pointerup',240,490);f.node('rinkDuplicate').onclick();f.flush();
 assert.equal(f.draft().marks[1].motion,'backward');assert.equal(f.draft().marks[1].movementLabel,'Stopp');
});

test('tidying is a single undoable action and persists as a draft',()=>{
 const original=[{id:'j',type:'curve',x:100,y:100,color:'#7c3aed',points:[{x:100,y:100},{x:120,y:102},{x:140,y:99},{x:160,y:101},{x:180,y:100}],motion:'backward'}];
 const f=editor({[DRAFT]:JSON.stringify({title:'Städa',marks:original})});f.node('rinkTidy').onclick();f.flush();
 assert.equal(f.draft().marks[0].points.length,2);assert.equal(f.draft().marks[0].motion,'backward');
 f.node('rinkUndo').onclick();f.flush();assert.deepEqual(f.draft().marks,original);
 f.node('rinkRedo').onclick();f.flush();assert.equal(f.draft().marks[0].points.length,2);
 const restored=editor(Object.fromEntries(f.storage));restored.leave();assert.equal(restored.draft().marks[0].points.length,2);
});

test('2.5 metre divider length holds for every orientation and near the rink edges',()=>{
 const length=m=>Math.hypot((m.x2-m.x)/(436/30),(m.y2-m.y)/(820/60));
 for(const [start,end] of [[[240,430],[420,430]],[[240,430],[240,720]],[[240,430],[400,650]],[[450,830],[458,838]],[[30,30],[22,20]]]){
  const f=editor();f.choose('divider-yellow');f.pointer('pointerdown',...start);f.pointer('pointermove',...end);f.pointer('pointerup',...end);f.flush();const m=f.draft().marks[0];assert.ok(Math.abs(length(m)-2.5)<1e-9);assert.ok([m.x,m.x2].every(x=>x>=22&&x<=458));assert.ok([m.y,m.y2].every(y=>y>=20&&y<=840));
  f.node('rinkDuplicate').onclick();f.flush();assert.ok(Math.abs(length(f.draft().marks[1])-2.5)<1e-9);
 }
});
test('old divider lengths normalize around their midpoint on reload',()=>{
 const f=editor({[DRAFT]:JSON.stringify({marks:[{id:'d',type:'divider-blue',x:80,y:200,x2:400,y2:200,color:'#2563eb'}]})});f.node('rinkTitle').emit('input');f.flush();const m=f.draft().marks[0];assert.ok(Math.abs((m.x+m.x2)/2-240)<1e-9);assert.ok(Math.abs((m.x2-m.x)/(436/30)-2.5)<1e-9);
});
test('skating direction controls green forward and purple backward with undo and recovery',()=>{
 const f=editor();f.choose('skate');f.pointer('pointerdown',200,300);f.pointer('pointermove',200,500);f.pointer('pointerup',200,500);f.flush();assert.equal(f.draft().marks[0].color,'#111827');assert.equal(f.draft().marks[0].motion,'forward');
 f.node('rinkSelectedDirection').value='backward';f.node('rinkSelectedDirection').onchange();f.flush();assert.equal(f.draft().marks[0].color,'#7c3aed');assert.equal(f.draft().marks[0].motion,'backward');
 f.node('rinkUndo').onclick();f.flush();assert.equal(f.draft().marks[0].motion,'forward');f.node('rinkRedo').onclick();f.flush();
 const restored=editor(Object.fromEntries(f.storage));restored.leave();assert.equal(restored.draft().marks[0].color,'#7c3aed');
 f.node('rinkSkatingDirection').value='backward';f.choose('curve');f.pointer('pointerdown',100,100);f.pointer('pointermove',120,120);f.pointer('pointerup',150,160);f.flush();assert.equal(f.draft().marks[1].motion,'backward');assert.equal(f.draft().marks[1].color,'#7c3aed');
});

test('divider endpoint handles stretch and rotate, with undo and persistent custom length',()=>{
 const f=editor();f.choose('divider-yellow');f.pointer('pointerdown',100,200);f.pointer('pointerup',100,200);f.flush();const initial=f.draft().marks[0];
 f.choose('move');f.pointer('pointerdown',initial.x2,initial.y2);f.pointer('pointermove',220,340);f.pointer('pointerup',220,340);f.flush();const extended=f.draft().marks[0];assert.equal(extended.x,100);assert.equal(extended.y,200);assert.ok(Math.abs(extended.x2-220)<1e-8);assert.ok(Math.abs(extended.y2-340)<1e-8);assert.ok(extended.lengthMetres>2.5);
 f.node('rinkUndo').onclick();f.flush();assert.ok(Math.abs(f.draft().marks[0].lengthMetres-2.5)<1e-9);f.node('rinkRedo').onclick();f.flush();
 const restored=editor(Object.fromEntries(f.storage));restored.node('rinkTitle').emit('input');restored.flush();assert.ok(Math.abs(restored.draft().marks[0].lengthMetres-extended.lengthMetres)<1e-9);
 f.pointer('pointerdown',(extended.x+extended.x2)/2,(extended.y+extended.y2)/2);f.pointer('pointerup',(extended.x+extended.x2)/2,(extended.y+extended.y2)/2);f.node('rinkDuplicate').onclick();f.flush();assert.equal(f.draft().marks[1].lengthMetres,extended.lengthMetres);
});
test('either divider end can be dragged while the other end remains anchored',()=>{
 const f=editor();f.choose('divider-blue');f.pointer('pointerdown',100,200);f.pointer('pointerup',100,200);f.flush();const initial=f.draft().marks[0];f.choose('move');
 f.pointer('pointerdown',initial.x,initial.y);f.pointer('pointermove',70,320);f.pointer('pointerup',70,320);f.flush();const m=f.draft().marks[0];assert.ok(Math.abs(m.x-70)<1e-8);assert.ok(Math.abs(m.y-320)<1e-8);assert.ok(Math.abs(m.x2-initial.x2)<1e-8);assert.equal(m.y2,initial.y2);
});
test('numeric divider length and angle work, and cancelled handle drags restore geometry',()=>{
 const f=editor();f.choose('divider-yellow');f.pointer('pointerdown',200,300);f.pointer('pointerup',200,300);f.flush();f.node('rinkDividerLength').value='5';f.node('rinkDividerAngle').value='90';f.node('rinkDividerLength').onchange();f.flush();const before=f.draft().marks[0];assert.ok(Math.abs(before.x2-before.x)<1e-8);assert.ok(Math.abs((before.y2-before.y)/(820/60)-5)<1e-8);
 f.choose('move');f.pointer('pointerdown',before.x2,before.y2);f.pointer('pointermove',300,500);f.pointer('pointercancel',300,500);f.flush();assert.deepEqual(f.draft().marks[0],before);
});
test('tidy gives a visible result count for equipment and a clear explanation when unchanged',()=>{
 const marks=[{id:'c1',type:'cone',x:100,y:300,color:'#b11226'},{id:'t',type:'tire',x:130,y:315,color:'#b11226'},{id:'c2',type:'cone',x:220,y:300,color:'#b11226'}],f=editor({[DRAFT]:JSON.stringify({marks})});f.node('rinkTidy').onclick();f.flush();assert.equal(f.draft().marks[1].x,160);assert.equal(f.node('rinkTidyReport').hidden,false);assert.match(f.node('rinkTidyReport').textContent,/koner\/däck jämnt fördelade/);
 f.node('rinkUndo').onclick();f.flush();assert.deepEqual(f.draft().marks,marks);assert.equal(f.node('rinkTidyReport').hidden,true);
 const empty=editor();empty.node('rinkTidy').onclick();assert.match(empty.node('rinkTidyReport').textContent,/Ingen förändring/);assert.equal(empty.node('rinkTidyReport').hidden,false);
});

test('twelve standard dividers exactly span the thirty metre rink width',()=>{
 const marks=Array.from({length:12},(_,i)=>({id:'d'+i,type:'divider-yellow',x:22+i*436/12,y:430,x2:22+(i+1)*436/12,y2:430,color:'#b11226',lengthMetres:2.5}));
 const f=editor({[DRAFT]:JSON.stringify({marks})});f.node('rinkTitle').emit('input');f.flush();const ds=f.draft().marks;
 assert.ok(Math.abs(ds[0].x-22)<1e-8);assert.ok(Math.abs(ds.at(-1).x2-458)<1e-8);
 for(let i=1;i<ds.length;i++)assert.ok(Math.abs(ds[i-1].x2-ds[i].x)<1e-8);
 assert.ok(Math.abs(ds.reduce((n,m)=>n+Math.hypot((m.x2-m.x)/(436/30),(m.y2-m.y)/(820/60)),0)-30)<1e-8);
});

test('fullscreen fits the screen, hides controls initially, and restores zoom without editing marks',()=>{
 const f=editor();f.choose('player');f.pointer('pointerdown',100,200);f.pointer('pointerup',100,200);f.flush();const before=f.storage.get(DRAFT),hostCalls=[];f.context.window.NSKShellHost={fullscreen:(_source,on)=>hostCalls.push(on)};
 f.node('rinkZoomIn').onclick();assert.equal(f.node('rinkZoomLabel').textContent,'150%');f.node('rinkFullscreen').onclick();assert.equal(f.context.document.body.classList.contains('rink-fullscreen'),true);assert.equal(f.node('rinkZoomLabel').textContent,'100%');assert.equal(f.node('rinkFullControls').hidden,false);assert.equal(f.node('rinkFullTools').getAttribute('aria-expanded'),'false');
 assert.equal(f.context.document.documentElement.style.getPropertyValue('--rink-full-width'),'1200px');assert.equal(f.context.document.documentElement.style.getPropertyValue('--rink-full-height'),'700px');
 f.node('rinkFullTools').onclick();assert.equal(f.context.document.body.classList.contains('rink-fullscreen-tools'),true);f.node('rinkFullTools').onclick();assert.equal(f.context.document.body.classList.contains('rink-fullscreen-tools'),false);
 f.context.window.innerWidth=390;f.context.window.innerHeight=844;f.windowEvent('resize');assert.equal(f.context.document.documentElement.style.getPropertyValue('--rink-full-width'),'390px');assert.equal(f.context.document.documentElement.style.getPropertyValue('--rink-full-height'),'844px');
 f.windowEvent('keydown',{key:'Escape'});assert.equal(f.context.document.body.classList.contains('rink-fullscreen'),false);assert.equal(f.node('rinkZoomLabel').textContent,'150%');assert.equal(f.node('rinkFullControls').hidden,true);assert.deepEqual(hostCalls,[true,false]);assert.equal(f.storage.get(DRAFT),before);
});

test('exercise metadata is opened explicitly and remains reachable from fullscreen',()=>{
 const f=editor();f.node('rinkFullscreen').onclick();f.node('rinkShowSettings').onclick();assert.equal(f.context.document.body.classList.contains('rink-fullscreen'),false);assert.equal(f.node('rinkSettings').hidden,false);assert.equal(f.node('rinkSettings').open,true);f.node('rinkCloseSettings').onclick();assert.equal(f.node('rinkSettings').hidden,true);
});
test('backward routes retain their color and line pattern without repeated direction captions',()=>{
 const f=editor({[DRAFT]:JSON.stringify({marks:[{id:'b',type:'skate',x:100,y:200,x2:200,y2:300,color:'#7c3aed',motion:'backward'}]})});
 const group=f.node('rinkSvg').children.find(n=>n.attrs['data-mark']==='b');assert.equal(group.children[0].attrs.stroke,'#7c3aed');assert.equal(group.children[0].attrs['stroke-dasharray'],undefined);assert.match(group.children[0].attrs.d,/ Q /);assert.equal(group.children.filter(n=>n.tagName==='text').length,0);
});

test('interpreted pass-and-round route keeps exact geometry through undo and recovery',()=>{
 const tire={id:'t',type:'tire',x:240,y:300,color:'#111827'},arc=Array.from({length:21},(_,i)=>{const a=Math.PI+i/20*Math.PI,r=50+Math.sin(i*1.7)*4;return {x:240+r*Math.cos(a),y:300+r*Math.sin(a)};}),points=[{x:80,y:600},{x:90,y:540},{x:100,y:480},{x:160,y:380},...arc,{x:320,y:380},{x:350,y:450},{x:380,y:500}],marks=[{id:'r',type:'curve',x:80,y:600,points,color:'#15803d',motion:'forward'},tire,{id:'pass',type:'pass',x:100,y:480,x2:40,y2:480,color:'#2563eb'}],f=editor({[DRAFT]:JSON.stringify({marks})});
 f.node('rinkTitle').emit('input');f.flush();const before=f.draft().marks;f.node('rinkTidy').onclick();f.flush();const route=f.draft().marks[0];assert.equal(route.routeStyle,'planned');assert.ok(route.points.some(p=>p.x===100&&p.y===480));
 const path=f.node('rinkSvg').children.find(n=>n.attrs['data-mark']==='r').children[0];assert.doesNotMatch(path.attrs.d,/ Q /);f.node('rinkUndo').onclick();f.flush();assert.deepEqual(f.draft().marks,before);f.node('rinkRedo').onclick();f.flush();
 const restored=editor(Object.fromEntries(f.storage));restored.node('rinkTitle').emit('input');restored.flush();assert.equal(restored.draft().marks[0].routeStyle,'planned');assert.deepEqual(restored.draft().marks[0].points,route.points);
});

test('shot ending belongs to route, aims at goal and survives reload without a separate arrow',()=>{
 const marks=[{id:'r',type:'skate',x:100,y:200,x2:300,y2:200,color:'#111827'},{id:'g',type:'goal',x:350,y:90,angle:90,color:'#b11226'}],f=editor({[DRAFT]:JSON.stringify({marks})});
 f.pointer('pointerdown',180,210);f.pointer('pointerup',180,210);f.node('rinkAddShot').onclick();f.flush();let route=f.draft().marks[0];assert.equal(f.draft().marks.length,2);assert.equal(route.x2,300);assert.equal(route.shotEnd.goalId,'g');assert.equal(route.shotEnd.x,350);
 const group=f.node('rinkSvg').children.find(n=>n.attrs['data-mark']==='r');assert.equal(group.children[0].attrs['marker-end'],'');assert.equal(group.children.filter(n=>n.attrs['data-shot-ending']==='true').length,2);
 f.node('rinkChooseTarget').onclick();f.pointer('pointerdown',400,300);f.pointer('pointerup',400,300);f.flush();route=f.draft().marks[0];assert.equal(route.x2,300);assert.equal(route.shotEnd.x,400);assert.equal(route.shotEnd.y,300);
 const restored=editor(Object.fromEntries(f.storage));restored.leave();assert.deepEqual(restored.draft().marks[0].shotEnd,route.shotEnd);
 f.node('rinkUndo').onclick();f.flush();assert.equal(f.draft().marks[0].shotEnd.goalId,'g');f.node('rinkUndo').onclick();f.flush();assert.equal(f.draft().marks[0].shotEnd,undefined);
 f.pointer('pointerdown',230,210);f.pointer('pointerup',230,210);f.node('rinkAddPass').onclick();f.pointer('pointerdown',60,500);f.pointer('pointerup',60,500);f.flush();const pass=f.draft().marks.at(-1);assert.equal(pass.type,'pass');assert.equal(pass.x,230);assert.equal(pass.y,200);assert.equal(pass.x2,60);assert.equal(pass.y2,500);
});

test('direction changes start at a touched route point, preserve the shot ending and survive tidy and recovery',()=>{
 const route={id:'r',type:'skate',x:100,y:300,x2:400,y2:300,color:'#111827',motion:'forward',shotEnd:{x:240,y:78}},f=editor({[DRAFT]:JSON.stringify({marks:[route]})});
 f.pointer('pointerdown',220,310);f.pointer('pointerup',220,310);f.node('rinkSelectedDirection').value='backward';f.node('rinkSelectedDirection').onchange();f.flush();
 let ms=f.draft().marks;assert.equal(ms.length,2);assert.equal(ms[0].motion,'forward');assert.equal(ms[1].motion,'backward');assert.deepEqual(ms[0].points.at(-1),{x:220,y:300});assert.deepEqual(ms[1].points[0],{x:220,y:300});assert.equal(ms[0].shotEnd,undefined);assert.deepEqual(ms[1].shotEnd,route.shotEnd);
 const before=structuredClone(ms);f.node('rinkTidy').onclick();f.flush();assert.deepEqual(f.draft().marks,before);
 const restored=editor(Object.fromEntries(f.storage));restored.leave();assert.deepEqual(restored.draft().marks,before);
 f.node('rinkUndo').onclick();f.flush();assert.equal(f.draft().marks.length,1);assert.equal(f.draft().marks[0].type,'skate');
});
