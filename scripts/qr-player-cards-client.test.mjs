import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.className='';this.events=new Map();this._open=false;this.value='';this.complete=true;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(name,value){this[name]=value;}
 addEventListener(name,fn){this.events.set(name,fn);}
 removeEventListener(name){this.events.delete(name);}
 set open(value){if(this._open===value)return;this._open=value;setImmediate(()=>this.events.get('toggle')?.({target:this}));}
 get open(){return this._open;}
 querySelectorAll(selector){const all=this.children.flatMap(c=>c instanceof Element?[c,...c.querySelectorAll('*')]:[]);if(selector==='*')return all;if(selector==='details.equipment-qr-player[open]')return all.filter(c=>c.className==='equipment-qr-player'&&c.open);return [];}
 querySelector(){return null;}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<20;i++)await tick();}
function fixture({recoverable=false,denied=false}={}){
 const preview={html:'',sheet:null};
 const printButtons=new Map();const printDoc={open(){},write(html){preview.html=html;},close(){},images:[],body:{append(sheet){preview.sheet=sheet;}},importNode:sheet=>sheet,getElementById(id){if(!printButtons.has(id))printButtons.set(id,new Element('button'));return printButtons.get(id);}};
 const calls=[],root=new Element('section'),tab=new Element('button'),pane={hidden:false},head=new Element('head');
 const document={head,hidden:false,getElementById:id=>id==='equipmentTabLinks'?tab:id==='equipmentPaneLinks'?pane:null,createElement:tag=>new Element(tag)};
 const Auth={getToken:()=> 'fixture-session',activeTeam:()=> 'NSK Team 18',getSession:()=>({is_primary_admin:true})};
 const window={open:()=>({document:printDoc,focus(){},print(){},close(){}}),Auth,APP_CONFIG:{API_URL:'https://api.example'},addEventListener(){},removeEventListener(){},qrcode:()=>({addData(){},make(){},getModuleCount(){return 57;},isDark(y,x){return (x+y)%2===0;}})};
 const context={window,Auth,document,Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}},location:{href:'https://nsk18.pages.dev/materialforvaltare/'},navigator:{},URL,AbortSignal,setInterval:()=>1,clearInterval(){},console};
 context.fetch=async(url,options)=>{calls.push({url,options});await tick();const personal=new URL(url).searchParams.has('person_id');const data=personal?{ok:true,mode:'parent',revision:1,recoverable,...(recoverable?{token:'ab'.repeat(32)}:{})}:{ok:true,links:[{personId:'101',mode:'parent',revision:1,recoverable}]};return {ok:!denied,status:denied?403:200,json:async()=>denied?{ok:false,error:'Åtkomst nekad'}:data};};
 vm.runInNewContext(readFileSync(new URL('../sharpening-link-manager.js',import.meta.url),'utf8'),context);
 const dispose=window.SharpeningLinks.bulk(root,{team:'18',people:[{id:101,full_name:'Synthetic Player'}]});
 return {preview,root,calls,dispose,cards:()=>root.querySelectorAll('*').filter(c=>c.className==='equipment-qr-player'),button:text=>root.querySelectorAll('*').find(c=>c.tagName==='BUTTON'&&c.textContent===text)};
}
test('opening a legacy QR card performs one read and does not start a re-render request loop',async()=>{
 const f=fixture();await settle();f.cards()[0].open=true;await settle();
 assert.equal(f.calls.filter(c=>new URL(c.url).searchParams.has('person_id')).length,1);
 assert.equal(f.cards()[0].open,true);assert(f.calls.every(c=>c.options.method==='GET'));f.dispose();
});
test('current QR cards and list creation read existing tokens without rotating links',async()=>{
 const f=fixture({recoverable:true});await settle();f.cards()[0].open=true;await settle();
 assert.equal(f.calls.filter(c=>new URL(c.url).searchParams.has('person_id')).length,1);
 await f.button('Skapa aktuell QR-lista').onclick();await settle();
 assert.equal(f.button('Skriv ut').disabled,false);assert.equal(f.calls.length,3);assert(f.calls.every(c=>c.options.method==='GET'));f.dispose();
});
test('denied equipment access removes private cards and disables list controls',async()=>{
 const f=fixture({denied:true});await settle();assert.equal(f.cards().length,0);assert.equal(f.button('Skapa aktuell QR-lista').disabled,true);assert.equal(f.button('Skriv ut').disabled,true);f.dispose();
});

test('printed NSK signs show first name, heading and unchanged QR with embedded crest',async()=>{
 const f=fixture({recoverable:true});await settle();await f.button('Skapa aktuell QR-lista').onclick();await settle();f.button('Skriv ut').onclick();await settle();
 assert.match(f.preview.html,/grid-template-columns:repeat\(3,60mm\)/);
 assert.match(f.preview.html,/height:84mm/);
 const card=f.preview.sheet.children[0];
 assert.equal(card.children[0].className,'qr-sign-brand');
 assert.match(card.children[0].children[0].src,/^data:image\/png;base64,/);
 assert.equal(card.children[1].textContent,'Skridskoslipning');
 assert.equal(card.children[2].textContent,'Synthetic');
 assert.equal(card.children[3].className,'qr-sign-code');
 assert.match(card.children[3].src,/^data:image\/svg/);
 assert(f.calls.every(c=>c.options.method==='GET'));f.dispose();
});
