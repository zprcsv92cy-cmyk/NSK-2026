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
function fixture({recoverable=false,denied=false,withCoach=false,writeBody,writeError,writeStatus=200}={}){
 const preview={html:'',sheet:null};
 const printButtons=new Map();const printDoc={open(){},write(html){preview.html=html;},close(){},images:[],body:{append(sheet){preview.sheet=sheet;}},importNode:sheet=>sheet,getElementById(id){if(!printButtons.has(id))printButtons.set(id,new Element('button'));return printButtons.get(id);}};
 const qrData=[];
 const calls=[],root=new Element('section'),tab=new Element('button'),pane={hidden:false},head=new Element('head');
 const document={head,hidden:false,getElementById:id=>id==='equipmentTabLinks'?tab:id==='equipmentPaneLinks'?pane:null,createElement:tag=>new Element(tag)};
 const Auth={getToken:()=> 'fixture-session',activeTeam:()=> 'NSK Team 18',getSession:()=>({is_primary_admin:true})};
 const window={open:()=>({document:printDoc,focus(){},print(){},close(){}}),Auth,APP_CONFIG:{API_URL:'https://api.example'},addEventListener(){},removeEventListener(){},qrcode:()=>({addData(value){qrData.push(value);},make(){},getModuleCount(){return 57;},isDark(y,x){return (x+y)%2===0;}})};
 const context={confirm:()=>true,Blob,TextEncoder,Uint8Array,window,Auth,document,Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}},location:{href:'https://nsk18.pages.dev/materialforvaltare/'},navigator:{},URL,AbortSignal,setInterval:()=>1,clearInterval(){},console};
 context.fetch=async(url,options)=>{calls.push({url,options});await tick();if(options.method==='PUT'){if(writeError)throw writeError;return {ok:writeStatus<400,status:writeStatus,json:async()=>writeBody};}const personal=new URL(url).searchParams.has('person_id'),coach=new URL(url).searchParams.get('kind')==='coach';const data=personal?{ok:true,mode:coach?'player':'parent',revision:1,recoverable,...(recoverable?{token:(coach?'cd':'ab').repeat(32)}:{})}:{ok:true,links:[{personId:'101',mode:'parent',revision:1,recoverable},...(withCoach?[{personId:'101',kind:'coach',mode:'player',revision:1,recoverable}]:[])]};return {ok:!denied,status:denied?403:200,json:async()=>denied?{ok:false,error:'Åtkomst nekad'}:data};};
 vm.runInNewContext(readFileSync(new URL('../sharpening-link-manager.js',import.meta.url),'utf8'),context);
 const dispose=window.SharpeningLinks.bulk(root,{team:'18',people:[{id:101,kind:'player',full_name:'Synthetic Player'},...(withCoach?[{id:101,kind:'coach',full_name:'Coach Person'}]:[])]});
 return {api:window.SharpeningLinks,context,preview,qrData,root,calls,dispose,cards:()=>root.querySelectorAll('*').filter(c=>c.className==='equipment-qr-player'),button:text=>root.querySelectorAll('*').find(c=>c.tagName==='BUTTON'&&c.textContent===text)};
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
 assert.match(f.preview.html,/grid-template-columns:repeat\(2,84mm\)/);
 assert.match(f.preview.html,/height:60mm/);assert.match(f.preview.html,/repeat\(4,43\.50000mm\)/);assert.match(f.preview.html,/size:A4 portrait/);
 const card=f.preview.sheet.children[0].children[0].children[0];
 assert.equal(card.children[0].className,'qr-sign-arena');assert.match(card.children[0].src,/^data:image\/jpeg;base64,/);assert.match(f.preview.html,/left:3mm;top:11mm/);assert.match(f.preview.html,/width:42mm;height:42mm/);assert.match(f.preview.html,/left:46mm;top:24mm/);
 assert.match(card.children[2].children[0].src,/^data:image\/png;base64,/);
 assert.equal(card.children[3].textContent,'Slipning');
 assert.equal(card.children[4].textContent,'Synthetic');
 assert.equal(card.children[5].className,'qr-sign-code');
 assert.match(card.children[5].src,/^data:image\/svg/);
 const svg=decodeURIComponent(card.children[5].src.split(',')[1]);
 assert.doesNotMatch(svg,/width="0\.45"/);assert.match(svg,/<image .*width="5" height="5"/);
 assert.match(svg,/<rect x="4" y="4" width="1" height="1" fill="#000"/);
 assert.match(svg,/<rect width="65" height="65" fill="white"/);
 assert(f.calls.every(c=>c.options.method==='GET'));f.dispose();
});

test('coach and player with same ID have distinct cards, requests and printed signs',async()=>{
 const f=fixture({recoverable:true,withCoach:true});await settle();const groups=f.root.querySelectorAll('*').filter(c=>c.className==='equipment-qr-group');assert.deepEqual(groups.map(g=>g.children[0].textContent),['Spelare','Tränare']);assert.equal(groups[0].children[1].dataset.personId,'101');assert.equal(groups[1].children[1].dataset.personId,'coach:101');assert.equal(f.cards().length,2);assert.deepEqual(f.cards().map(c=>c.dataset.personId),['101','coach:101']);
 for(const card of f.cards())card.open=true;await settle();
 const reads=f.calls.filter(c=>new URL(c.url).searchParams.has('person_id'));assert.equal(reads.length,2);assert(reads.some(c=>new URL(c.url).searchParams.get('kind')==='coach'));
 await f.button('Skapa aktuell QR-lista').onclick();await settle();f.button('Skriv ut').onclick();await settle();
 assert.equal(f.preview.sheet.children.length,2);const signs=f.preview.sheet.children.flatMap(p=>p.children.map(slot=>slot.children[0]));assert.deepEqual(signs.map(s=>s.children[4].textContent),['Synthetic','Coach']);assert(f.qrData.some(u=>u.endsWith('cd'.repeat(32))));assert(f.qrData.some(u=>u.endsWith('ab'.repeat(32))));assert(f.calls.every(c=>c.options.method==='GET'));f.dispose();
});

test('local PDF has A4 pages, equal configured sign dimensions and binary-safe cross references',async()=>{
 const f=fixture();await settle();const bytes=new Uint8Array([255,216,0,128,255,217]);
 const blob=f.api.buildPrintPdf(Array.from({length:31},(_,i)=>({kind:i<24?'player':'coach',width:992,height:709,bytes})));assert.equal(blob.type,'application/pdf');
 const data=new Uint8Array(await blob.arrayBuffer()),text=new TextDecoder('latin1').decode(data);assert(text.startsWith('%PDF-1.4'));
 assert.match(text,/\/Count 2/);assert.match(text,/\/MediaBox \[0 0 595\.2756 841\.8898\]/);assert.match(text,/123\.3071 0 0 88\.0765/);
 const start=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(new TextDecoder().decode(data.slice(start,start+4)),'xref');
 const entries=text.slice(start).split('\n').slice(3).filter(line=>/^\d{10} 00000 n/.test(line));entries.forEach((line,i)=>{const at=Number(line.slice(0,10));assert(new TextDecoder().decode(data.slice(at,at+20)).startsWith((i+1)+' 0 obj'));});
 f.dispose();
});
test('PDF can be prepared on the QR page without opening a popup',async()=>{
 const f=fixture({recoverable:true});await settle();assert.equal(f.button('Skapa PDF').disabled,true);
 f.context.Image=class{constructor(){this.width=650;this.height=650;}set src(value){setImmediate(()=>this.onload());}};
 const original=f.context.document.createElement;f.context.document.createElement=tag=>tag!=='canvas'?original(tag):{width:0,height:0,getContext:()=>({save(){},restore(){},translate(){},scale(){},drawImage(){},createLinearGradient:()=>({addColorStop(){}}),fillRect(){},fillText(){},measureText:()=>({width:10})}),toBlob:callback=>callback(new Blob([new Uint8Array([255,216,255,217])]))};
 const openPreview=f.context.window.open;f.context.window.open=()=>{throw Error('Popup must not be used for PDF generation');};
 await f.button('Skapa aktuell QR-lista').onclick();await settle();await f.button('Skapa PDF').onclick();await settle();
 const link=f.root.querySelectorAll('*').find(e=>e.tagName==='A'&&e.textContent==='Öppna PDF / Spara');assert.equal(link.hidden,false);assert.match(link.href,/^blob:/);assert.equal(link.download,'NSK-slipning-a4-portrait.pdf');const shared=[];f.context.File=File;f.context.navigator.canShare=()=>true;f.context.navigator.share=async data=>shared.push(data);f.button('Dela PDF').onclick();await settle();assert.equal(shared.length,1);assert.equal(shared[0].files[0].type,'application/pdf');const paper=f.root.querySelectorAll('*').find(e=>e.id==='qrPaper');paper.value='a3';paper.onchange();assert.equal(link.hidden,true);assert.equal(f.button('Dela PDF').disabled,true);assert.equal(f.button('Skriv ut').disabled,false);f.context.window.open=openPreview;f.button('Skriv ut').onclick();assert.match(f.preview.html,/size:A3 portrait/);
 assert(f.calls.every(c=>c.options.method==='GET'));f.dispose();
});

test('A4/A3 portrait and landscape share one size across player and coach pages',async()=>{
 const f=fixture();await settle();
 for(const [paper,direction,w,h,columns,rows,pageW,pageH] of [['a4','portrait',43.5,31.07142857,4,6,210,297],['a4','landscape',47.6,34,5,5,297,210],['a3','portrait',65.25,46.60714286,4,6,297,420],['a3','landscape',71.96,51.4,5,5,420,297]]){
  const l=f.api.printLayout(paper,direction,24);assert(Math.abs(l.cardWidth-w)<.00001);assert(Math.abs(l.cardHeight-h)<.00001);assert.equal(l.columns,columns);assert.equal(l.rows,rows);assert.equal(l.width,pageW);assert.equal(l.height,pageH);
  assert(l.columns*l.cardWidth+(l.columns-1)*l.gap<=pageW-24+.00001);assert(l.rows*l.cardHeight+(l.rows-1)*l.gap<=pageH-24+.00001);
  const blob=f.api.buildPrintPdf(Array.from({length:31},(_,i)=>({kind:i<24?'player':'coach',width:992,height:709,bytes:new Uint8Array([255,216,255,217])})),l),text=await blob.text();assert.match(text,/\/Count 2/);
  const matrices=[...text.matchAll(/q ([0-9.]+) 0 0 ([0-9.]+) /g)];assert.equal(matrices.length,31);assert.equal(new Set(matrices.map(m=>m[1]+':'+m[2])).size,1);
 }
 f.dispose();
});

for(const failure of ['timeout','invalid','invalid-token','missing-token','server-error'])test(`an unconfirmed QR renewal (${failure}) hides old QR and print output until reread`,async()=>{
 const f=fixture({recoverable:true,...(failure==='timeout'?{writeError:new DOMException('Timed out','TimeoutError')}:{writeStatus:failure==='server-error'?500:200,writeBody:failure==='invalid-token'?{ok:true,mode:'parent',revision:2,recoverable:true,token:'bad'}:failure==='missing-token'?{ok:true,mode:'parent',revision:2,recoverable:true}:{ok:true}})});await settle();
 f.cards()[0].open=true;await settle();await f.button('Skapa aktuell QR-lista').onclick();await settle();assert.equal(f.button('Skriv ut').disabled,false);assert(f.button('Dela länk'));
 f.button('Förnya QR').onclick();await settle();
 assert.equal(f.calls.filter(c=>c.options.method==='PUT').length,1);assert.equal(f.button('Skriv ut').disabled,true);assert.equal(f.button('Dela länk'),undefined);assert.equal(f.button('Förnya QR').disabled,true);assert.equal(f.button('Skapa aktuell QR-lista').disabled,false);
 const message=f.root.querySelectorAll('*').find(e=>e.id==='qrBulkStatus').textContent;assert.doesNotMatch(message,/Ny QR skapad/);assert.match(message,/bekräftas/);assert(f.button('Läs om QR'));
 f.button('Läs om QR').onclick();await settle();assert(f.button('Dela länk'));assert.equal(f.button('Förnya QR').disabled,false);assert.equal(f.calls.filter(c=>c.options.method==='PUT').length,1);f.dispose();
});
