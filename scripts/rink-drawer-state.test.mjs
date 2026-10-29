import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../rink-drawer.js',import.meta.url),'utf8');
const DRAFT='nsk_rink_draft_v2',SAVED='nsk_rink_drawing_v1';
function editor(stored={}){
 const nodes=new Map(),storage=new Map(Object.entries(stored)),timers=new Map(),documentEvents={},windowEvents={};let nextId=0,quota=false;
 class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.attrs={};this.events={};this.value='';this.dataset={};this.hidden=false;this.open=false;this.options=[];this.textContent='';}
  setAttribute(k,v){this.attrs[k]=v;}
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
 const tools=['move','player','goalie','puck','cone','skate','pass','shot','divider','divider-yellow','divider-blue','tire','erase','curve','pan'].map(tool=>{const n=new Node('button');n.dataset.tool=tool;return n;});
 node('rinkColor').value='#b11226';node('rinkCategory').value='Passningar';node('rinkCategory').options=[{value:'Passningar'},{value:'Skott'}];
 const document={activeElement:null,hidden:false,getElementById:node,createElementNS:(_ns,tag)=>new Node(tag),querySelectorAll:selector=>selector==='[data-tool]'?tools:[],addEventListener:(type,fn)=>{documentEvents[type]=fn;},body:{classList:{toggle:()=>true}}};
 const context={document,window:{addEventListener:(type,fn)=>windowEvents[type]=fn},crypto:{randomUUID:()=>String(++nextId)},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{if(quota)throw Error('Quota exceeded');storage.set(key,value);}},setTimeout:fn=>{const id=++nextId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),Blob};
 vm.runInNewContext(code,context);documentEvents.DOMContentLoaded();
 const flush=()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}};
 const pointer=(type,x,y)=>node('rinkSvg').emit(type,{clientX:x,clientY:y,pointerId:1,isPrimary:true,pointerType:'touch',button:0});
 const choose=tool=>tools.find(t=>t.dataset.tool===tool).onclick();
 return {node,choose,pointer,flush,storage,context,draft:()=>JSON.parse(storage.get(DRAFT)),quota:()=>{quota=true;},leave:()=>windowEvents.pagehide()};
}
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
  assert.equal(f.draft().marks[0].type,tool);assert.equal(f.draft().marks[0].x2,320);
  const shape=f.node('rinkSvg').children.find(n=>n.attrs['data-mark']===f.draft().marks[0].id).children[0];assert.equal(shape.attrs.stroke,tool==='divider-yellow'?'#facc15':'#2563eb');assert.equal(shape.attrs['marker-end'],undefined);
  f.node('rinkDuplicate').onclick();f.flush();assert.equal(f.draft().marks.length,2);
  f.node('rinkUndo').onclick();f.flush();assert.equal(f.draft().marks.length,1);
  const restored=editor(Object.fromEntries(f.storage));restored.choose('move');restored.pointer('pointerdown',150,180);assert.equal(restored.node('rinkSelectedLabel').textContent,tool==='divider-yellow'?'Gul rinkavdelare markerad':'Blå rinkavdelare markerad');
  restored.pointer('pointermove',160,200);restored.pointer('pointerup',160,200);restored.flush();assert.equal(restored.draft().marks[0].x2,330);
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
