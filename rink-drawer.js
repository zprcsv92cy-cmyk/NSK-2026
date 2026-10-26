// Mobile rink editor. Drafts and archive files stay on this browser/device.
(() => {
 const NS='http://www.w3.org/2000/svg',W=480,H=860,$=id=>document.getElementById(id);
 const palette=['#b11226','#2563eb','#111827','#16a34a'];
 const types=['player','goalie','puck','cone','divider','skate','pass','shot','curve'];
 const names={player:'Spelare',goalie:'Målvakt',puck:'Puck',cone:'Kon',divider:'Avdelare',skate:'Åkväg',pass:'Passning',shot:'Skott',curve:'Böjd åkväg'};
 const DRAFT='nsk_rink_draft_v2',SAVED='nsk_rink_drawing_v1';
 let marks=[],history=[],future=[],tool='move',drag=null,selectedId=null,draftTimer=0,draftDirty=false,numberEditId=null;
 let zoom=1,viewX=0,viewY=0;
 const geometry=m=>m.points||[{x:m.x,y:m.y},...(m.x2===undefined?[]:[{x:m.x2,y:m.y2}])];
 function viewport(){$('rinkSvg').setAttribute('viewBox',[viewX,viewY,W/zoom,H/zoom].join(' '));$('rinkZoomLabel').textContent=Math.round(zoom*100)+'%';$('rinkZoomOut').disabled=zoom===1;$('rinkZoomIn').disabled=zoom===3;}
 function changeZoom(next){const cx=viewX+W/zoom/2,cy=viewY+H/zoom/2;zoom=clamp(next,1,3);viewX=clamp(cx-W/zoom/2,0,W-W/zoom);viewY=clamp(cy-H/zoom/2,0,H-H/zoom);viewport();}
 const el=(tag,props={},parent)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(props))n.setAttribute(k,v);if(parent)parent.append(n);return n;};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const snapshot=()=>JSON.stringify(marks);
 const remember=()=>{history.push(snapshot());if(history.length>40)history.shift();future=[];};
 const announce=text=>{$('rinkStatus').textContent=text;};
 const uuid=()=>crypto.randomUUID();
 const selected=()=>marks.find(m=>m.id===selectedId);
 function record(){return {title:$('rinkTitle').value.slice(0,100),description:$('rinkDescription').value.slice(0,2000),category:$('rinkCategory').value,marks};}
 function flushDraft(){
  clearTimeout(draftTimer);draftTimer=0;if(!draftDirty)return;
  try{localStorage.setItem(DRAFT,JSON.stringify({...record(),updated:Date.now()}));draftDirty=false;$('rinkDraftStatus').textContent='Utkast sparat på denna enhet.';}
  catch{$('rinkDraftStatus').textContent='Utkastet kunde inte sparas på denna enhet.';}
 }
 function saveDraft(){draftDirty=true;$('rinkDraftStatus').textContent='Sparar utkast…';clearTimeout(draftTimer);draftTimer=setTimeout(flushDraft,250);$('rinkSettingsSummary').textContent=$('rinkTitle').value.trim()||'Övningens uppgifter';}
 function updateControls(){
  $('rinkUndo').disabled=!history.length;$('rinkRedo').disabled=!future.length;
  const m=selected();$('rinkSelectionPanel').hidden=!m;if(!m)return;
  $('rinkSelectedLabel').textContent=names[m.type]+(m.number?' '+m.number:'')+' markerad';
  $('rinkNumberField').hidden=!['player','goalie'].includes(m.type);
  $('rinkSelectedColorField').hidden=!['player','goalie','skate','pass','shot','curve'].includes(m.type);
  $('rinkSelectedColor').value=m.color;
  if(document.activeElement!==$('rinkNumber'))$('rinkNumber').value=m.number||'';
 }
 function closeMenus(){document.querySelectorAll('[data-tool-menu]').forEach(d=>{d.open=false;});}
 function setTool(next){tool=next;closeMenus();document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));announce(tool==='pan'?'Dra för att flytta den inzoomade rinken.':tool==='curve'?'Böjd åkväg: dra med fingret längs hela vägen.':tool==='move'?'Tryck för att markera. Dra för att flytta.':tool==='erase'?'Tryck på objektet som ska tas bort.':names[tool]+': '+(['skate','pass','shot','divider'].includes(tool)?'dra en linje på rinken.':'tryck på rinken.'));}
 function rink(){
  const s=$('rinkSvg');s.replaceChildren();
  el('rect',{x:13,y:10,width:454,height:840,rx:84,fill:'white',stroke:'#555c66','stroke-width':6},s);
  for(const y of [90,770])el('line',{x1:22,y1:y,x2:458,y2:y,stroke:'#c62036','stroke-width':4},s);
  for(const y of [270,590])el('line',{x1:20,y1:y,x2:460,y2:y,stroke:'#2065c2','stroke-width':7},s);
  el('line',{x1:18,y1:430,x2:462,y2:430,stroke:'#c62036','stroke-width':4},s);
  el('circle',{cx:240,cy:430,r:65,fill:'none',stroke:'#c62036','stroke-width':3},s);
  el('circle',{cx:240,cy:430,r:5,fill:'#2165b6'},s);
  for(const y of [174,686])for(const x of [132,348]){
    el('circle',{cx:x,cy:y,r:57,fill:'none',stroke:'#c62036','stroke-width':3},s);
    el('circle',{cx:x,cy:y,r:4,fill:'#c62036'},s);
  }
  for(const y of [41,819]){
   el('rect',{x:207,y:y-10,width:66,height:19,rx:3,fill:'#e4f2fc',stroke:'#b11226','stroke-width':3},s);
   el('path',{d:y<430?'M 195 90 Q 240 145 285 90':'M 195 770 Q 240 715 285 770',fill:'none',stroke:'#55a8df','stroke-width':2},s);
  }
  const defs=el('defs',{},s);
  for(const c of palette){const marker=el('marker',{id:'arr-'+c.slice(1),viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:4,markerHeight:4,orient:'auto-start-reverse'},defs);el('path',{d:'M 1 1 L 9 5 L 1 9',fill:'none',stroke:c,'stroke-width':2},marker);}
  for(const m of marks)draw(m,s);
 }
 function draw(m,s){
  const group=el('g',{'data-mark':m.id},s);
  if(m.type==='player'||m.type==='goalie'){
   el('circle',{cx:m.x,cy:m.y,r:m.type==='goalie'?17:13,fill:m.color,stroke:'white','stroke-width':3},group);
   if(m.type==='goalie'&&!m.number)el('circle',{cx:m.x,cy:m.y,r:7,fill:'white'},group);
   if(m.number){const text=el('text',{x:m.x,y:m.y+4,'text-anchor':'middle',fill:'white','font-size':12,'font-weight':750,'font-family':'system-ui,sans-serif','pointer-events':'none'},group);text.textContent=m.number;}
  }else if(m.type==='curve'){
   const pts=m.points;let d='M '+pts[0].x+' '+pts[0].y;for(let i=1;i<pts.length-1;i++)d+=' Q '+pts[i].x+' '+pts[i].y+' '+((pts[i].x+pts[i+1].x)/2)+' '+((pts[i].y+pts[i+1].y)/2);const last=pts[pts.length-1];d+=' L '+last.x+' '+last.y;
   el('path',{d,fill:'none',stroke:m.color,'stroke-width':4,'stroke-linecap':'round','stroke-linejoin':'round','marker-end':'url(#arr-'+m.color.slice(1)+')'},group);
  }else if(m.type==='puck')el('ellipse',{cx:m.x,cy:m.y,rx:9,ry:6,fill:'#171717',stroke:'white','stroke-width':1},group);
  else if(m.type==='cone')el('polygon',{points:m.x+','+(m.y-14)+' '+(m.x-12)+','+(m.y+10)+' '+(m.x+12)+','+(m.y+10),fill:'#ef8a18',stroke:'#9a5208','stroke-width':2},group);
  else{
   const props={x1:m.x,y1:m.y,x2:m.x2,y2:m.y2,stroke:m.type==='divider'?'#e67717':m.color,'stroke-width':m.type==='divider'?8:4,'stroke-linecap':'round'};
   if(m.type==='pass')props['stroke-dasharray']='10 9';
   if(m.type!=='divider')props['marker-end']='url(#arr-'+m.color.slice(1)+')';
   if(m.type==='shot'){el('line',{...props,'stroke-width':9},group);el('line',{...props,stroke:'white','stroke-width':3,'marker-end':''},group);}
   else el('line',props,group);
  }
 }
 function selectionOutline(){
  const m=selected();if(!m)return;
  const group=el('g',{'data-editor-ui':'selection','pointer-events':'none'},$('rinkSvg'));
  const props={fill:'none',stroke:'#0085ff','stroke-width':2,'stroke-dasharray':'5 4'};
  const pts=geometry(m),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  if(pts.length>1)el('rect',{...props,x:Math.min(...xs)-12,y:Math.min(...ys)-12,width:(Math.max(...xs)-Math.min(...xs))+24,height:(Math.max(...ys)-Math.min(...ys))+24,rx:8},group);
  else el('circle',{...props,cx:m.x,cy:m.y,r:23},group);
 }
 function render(){rink();selectionOutline();updateControls();}
 function cleanSvg(){const svg=$('rinkSvg').cloneNode(true);svg.querySelectorAll('[data-editor-ui]').forEach(n=>n.remove());svg.setAttribute('xmlns',NS);svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.setAttribute('width',String(W));svg.setAttribute('height',String(H));return svg;}
 function pos(e){const s=$('rinkSvg'),matrix=s.getScreenCTM();if(!matrix)return null;const p=s.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const v=p.matrixTransform(matrix.inverse());return {x:clamp(v.x,22,W-22),y:clamp(v.y,20,H-20)};}
 function hit(p){
  const matrix=$('rinkSvg').getScreenCTM(),scale=matrix?Math.hypot(matrix.a,matrix.b):1;
  let best=null,bestDistance=Infinity;
  for(let i=marks.length-1;i>=0;i--){const m=marks[i];let distance;
   if(geometry(m).length>1){const pts=geometry(m);distance=Infinity;for(let j=1;j<pts.length;j++){const a=pts[j-1],b=pts[j],dx=b.x-a.x,dy=b.y-a.y,k=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);distance=Math.min(distance,Math.hypot(a.x+k*dx-p.x,a.y+k*dy-p.y));}}
   else distance=Math.hypot(m.x-p.x,m.y-p.y);
   const tolerance=Math.max(m.x2!==undefined?16:23,22/(scale||1));
   if(distance<=tolerance&&distance<bestDistance){best=m;bestDistance=distance;}
  }return best;
 }
 function translate(m,dx,dy){
  const pts=geometry(m),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  dx=clamp(dx,22-Math.min(...xs),W-22-Math.max(...xs));dy=clamp(dy,20-Math.min(...ys),H-20-Math.max(...ys));
  m.x+=dx;m.y+=dy;if(m.points)m.points=m.points.map(p=>({x:p.x+dx,y:p.y+dy}));if(m.x2!==undefined){m.x2+=dx;m.y2+=dy;}
 }
 function pointers(){
  const s=$('rinkSvg');
  s.addEventListener('pointerdown',e=>{
   if(drag||!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0))return;
   const p=pos(e);if(!p)return;closeMenus();numberEditId=null;
   if(tool==='pan'){drag={id:e.pointerId,pan:true,startX:e.clientX,startY:e.clientY,x:viewX,y:viewY,scale:Math.hypot(s.getScreenCTM().a,s.getScreenCTM().b)};s.setPointerCapture(e.pointerId);return;}
   if(tool==='erase'){const m=hit(p);if(m){remember();marks=marks.filter(a=>a!==m);selectedId=null;render();saveDraft();}return;}
   if(tool==='move'){
    const m=hit(p);selectedId=m?.id||null;render();if(!m)return;
    drag={id:e.pointerId,m,p,startX:e.clientX,startY:e.clientY,changed:false,before:snapshot(),history:history.slice(),future:future.slice(),moving:true};s.setPointerCapture(e.pointerId);return;
   }
   if(marks.length>=250){announce('Högst 250 objekt per övning.');return;}
   const before=snapshot(),oldHistory=history.slice(),oldFuture=future.slice();remember();
   const m={id:uuid(),type:tool,x:p.x,y:p.y,color:$('rinkColor').value};
   if(tool==='curve'){m.points=[{...p}];drag={id:e.pointerId,m,p,changed:true,before,history:oldHistory,future:oldFuture,moving:false};}
   if(['skate','pass','shot','divider'].includes(tool)){m.x2=p.x;m.y2=p.y;drag={id:e.pointerId,m,p,changed:true,before,history:oldHistory,future:oldFuture,moving:false};}
   marks.push(m);selectedId=m.id;render();s.setPointerCapture(e.pointerId);
   if(!drag)saveDraft();
  });
  s.addEventListener('pointermove',e=>{
   if(!drag||e.pointerId!==drag.id)return;if(drag.pan){viewX=clamp(drag.x-(e.clientX-drag.startX)/drag.scale,0,W-W/zoom);viewY=clamp(drag.y-(e.clientY-drag.startY)/drag.scale,0,H-H/zoom);viewport();return;}const p=pos(e);if(!p)return;
   if(drag.moving){
    if(!drag.changed&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<4)return;
    if(!drag.changed){remember();drag.changed=true;}
    translate(drag.m,p.x-drag.p.x,p.y-drag.p.y);drag.p=p;
   }else if(drag.m.points){const last=drag.m.points.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)>=3&&drag.m.points.length<500)drag.m.points.push({...p});}else{drag.m.x2=p.x;drag.m.y2=p.y;}render();
  });
  const end=(e,cancelled=false)=>{
   if(!drag||e.pointerId!==drag.id)return;
   if(drag.pan){drag=null;return;}
   if(!cancelled&&drag.m.points){const p=pos(e);if(p&&drag.m.points.length<500)drag.m.points.push(p);}
   if(cancelled||(drag.m.points&&!drag.m.points.some(p=>Math.hypot(p.x-drag.m.x,p.y-drag.m.y)>=3))){marks=JSON.parse(drag.before);history=drag.history;future=drag.future;selectedId=null;}
   const changed=drag.changed;drag=null;render();if(changed)saveDraft();
  };
  s.addEventListener('pointerup',e=>end(e));s.addEventListener('pointercancel',e=>end(e,true));
  s.addEventListener('lostpointercapture',e=>{if(drag&&e.pointerId===drag.id)end(e,true);});
 }
 function safeMarks(input){
  const ids=new Set();return input.filter(m=>m&&types.includes(m.type)&&[m.x,m.y].every(Number.isFinite)&&palette.includes(m.color)&&(m.type!=='curve'||(Array.isArray(m.points)&&m.points.length>=2&&m.points.length<=500&&m.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))))&&(m.x2===undefined?!['skate','pass','shot','divider'].includes(m.type):[m.x2,m.y2].every(Number.isFinite))).slice(0,250).map(m=>{
   const n={id:typeof m.id==='string'&&!ids.has(m.id)?m.id:uuid(),type:m.type,x:clamp(m.x,22,W-22),y:clamp(m.y,20,H-20),color:m.color};ids.add(n.id);
   if(m.type==='curve'){n.points=m.points.map(p=>({x:clamp(p.x,22,W-22),y:clamp(p.y,20,H-20)}));n.x=n.points[0].x;n.y=n.points[0].y;}
   if(m.x2!==undefined){n.x2=clamp(m.x2,22,W-22);n.y2=clamp(m.y2,20,H-20);}
   if(['player','goalie'].includes(m.type)&&/^\d{1,2}$/.test(String(m.number??'')))n.number=String(m.number);
   return n;
  });
 }
 function readStored(key){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&Array.isArray(value.marks)?value:null;}catch{return null;}}
 function applyRecord(value){
  marks=safeMarks(value.marks);history=[];future=[];selectedId=null;
  $('rinkTitle').value=String(value.title||'').slice(0,100);$('rinkDescription').value=String(value.description||'').slice(0,2000);
  if([...$('rinkCategory').options].some(o=>o.value===value.category))$('rinkCategory').value=value.category;
  $('rinkSettingsSummary').textContent=$('rinkTitle').value.trim()||'Övningens uppgifter';render();
 }
 function restore(){const draft=readStored(DRAFT),saved=draft||readStored(SAVED);if(saved){applyRecord(saved);$('rinkDraftStatus').textContent=draft?'Utkast återställt från denna enhet.':'Senaste sparade övningen öppnad.';}else render();}
 function drawFromText(){
  const text=$('rinkDescription').value.trim();if(!text){announce('Beskriv först övningen.');return;}
  const parser=window.NskRinkTextParser;if(!parser){announce('Texttolkningen kunde inte laddas. Uppdatera sidan.');return;}
  const result=parser.parse(text,$('rinkColor').value);if(!result.marks.length){announce('Ingen ritning skapades. Prova: 2 röda spelare vid nedre vänstra hörnet.');return;}
  if(marks.length&&!confirm('Ersätt ritningen med övningen från beskrivningen?'))return;
  remember();marks=safeMarks(result.marks.map(m=>({...m,id:uuid()})));selectedId=null;render();saveDraft();$('rinkSettings').open=false;
  announce(marks.length+' objekt ritade.'+(result.warnings.length?' Förtydliga: '+result.warnings.slice(0,2).join(' / '):''));
 }
 function archiveDrawing(record){
  return new Promise((resolve,reject)=>{
   const request=indexedDB.open('nsk_exercise_files_v1',1);
   request.onupgradeneeded=()=>{
    if(!request.result.objectStoreNames.contains('files'))request.result.createObjectStore('files',{keyPath:'id'});
   };
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
    const db=request.result;
    const tx=db.transaction('files','readwrite');
    tx.objectStore('files').put(record);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
    tx.onabort=()=>{db.close();reject(tx.error);};
   };
  });
 }
 async function saveDrawing(){
  if(!marks.length){announce('Rita först symboler och rörelser på rinken.');return;}
  const button=$('rinkSave');button.disabled=true;closeMenus();
  try{
   const saved={...record(),title:$('rinkTitle').value.trim()||'Min hockeyövning'};
   localStorage.setItem(SAVED,JSON.stringify(saved));flushDraft();
   const blob=new Blob([new XMLSerializer().serializeToString(cleanSvg())],{type:'image/svg+xml'});
   await archiveDrawing({id:uuid(),title:saved.title,description:saved.description,category:saved.category,filename:'hockeyovning.svg',blob,created:Date.now()});
   announce('Sparad i Övningsarkivet på denna enhet.');
  }catch(error){announce('Kunde inte spara i Övningsarkivet: '+(error.message||'okänt fel'));}
  finally{button.disabled=false;}
 }
 function exportImage(){
  closeMenus();const blob=new Blob([new XMLSerializer().serializeToString(cleanSvg())],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob),img=new Image();
  img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=960;canvas.height=1720;canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);canvas.toBlob(png=>{
   if(!png){announce('Kunde inte skapa PNG.');return;}const href=URL.createObjectURL(png),a=document.createElement('a');a.href=href;a.download=($('rinkTitle').value.trim()||'nsk-hockeyovning').replace(/[^a-z0-9åäö _-]/gi,'')+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);announce('Bilden exporterades.');
  },'image/png');};img.onerror=()=>{URL.revokeObjectURL(url);announce('Bilden kunde inte exporteras.');};img.src=url;
 }
 document.addEventListener('DOMContentLoaded',()=>{
  viewport();$('rinkZoomIn').onclick=()=>changeZoom(zoom+.5);$('rinkZoomOut').onclick=()=>changeZoom(zoom-.5);$('rinkZoomReset').onclick=()=>{zoom=1;viewX=0;viewY=0;viewport();};
  pointers();document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
  document.querySelectorAll('[data-tool-menu]').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)document.querySelectorAll('[data-tool-menu]').forEach(other=>{if(other!==d)other.open=false;});}));
  $('rinkUndo').onclick=()=>{if(!history.length)return;future.push(snapshot());marks=JSON.parse(history.pop());selectedId=null;render();saveDraft();};
  $('rinkRedo').onclick=()=>{if(!future.length)return;history.push(snapshot());marks=JSON.parse(future.pop());selectedId=null;render();saveDraft();};
  $('rinkClear').onclick=()=>{if(marks.length&&confirm('Rensa alla symboler från rinken?')){remember();marks=[];selectedId=null;render();saveDraft();}closeMenus();};
  $('rinkSelectedMove').onclick=()=>setTool('move');
  $('rinkDuplicate').onclick=()=>{const m=selected();if(!m)return;if(marks.length>=250){announce('Högst 250 objekt per övning.');return;}remember();const copy={...JSON.parse(JSON.stringify(m)),id:uuid()};translate(copy,25,25);marks.push(copy);selectedId=copy.id;render();saveDraft();};
  $('rinkDelete').onclick=()=>{if(!selected())return;remember();marks=marks.filter(m=>m.id!==selectedId);selectedId=null;render();saveDraft();};
  $('rinkDeselect').onclick=()=>{selectedId=null;numberEditId=null;render();};
  $('rinkSelectedColor').onchange=()=>{const m=selected();if(!m||m.color===$('rinkSelectedColor').value)return;remember();m.color=$('rinkSelectedColor').value;$('rinkColor').value=m.color;render();saveDraft();};
  $('rinkNumber').oninput=()=>{const m=selected();if(!m)return;const number=$('rinkNumber').value.replace(/\D/g,'').slice(0,2);$('rinkNumber').value=number;if((m.number||'')===number)return;if(numberEditId!==m.id){remember();numberEditId=m.id;}if(number)m.number=number;else delete m.number;render();saveDraft();};
  $('rinkNumber').onblur=()=>{numberEditId=null;};
  for(const id of ['rinkTitle','rinkDescription'])$(id).addEventListener('input',saveDraft);
  $('rinkCategory').addEventListener('change',saveDraft);
  $('rinkSave').onclick=saveDrawing;
  $('rinkLoad').onclick=()=>{const saved=readStored(SAVED);if(!saved){announce('Ingen sparad övning finns på denna enhet.');return;}if(marks.length&&JSON.stringify(record())!==JSON.stringify(saved)&&!confirm('Ersätt utkastet med senaste sparade övningen?'))return;applyRecord(saved);saveDraft();closeMenus();announce('Senaste sparade övningen öppnad.');};
  $('rinkExport').onclick=exportImage;$('rinkFromText').onclick=drawFromText;
  $('rinkTextExample').onclick=()=>{$('rinkDescription').value='Två röda spelare vid nedre vänstra hörnet. En puck i mittcirkeln. Tre koner vid övre högra hörnet. Åkväg från nedre vänstra hörnet till mittcirkeln. Passning från mittcirkeln till övre högra hörnet.';saveDraft();};
  $('rinkFullscreen').onclick=()=>{closeMenus();const on=document.body.classList.toggle('rink-fullscreen');$('rinkFullscreen').textContent=on?'Avsluta helskärm':'Helskärm';};
  const saveOnLeave=()=>{if(drag?.changed)draftDirty=true;flushDraft();};window.addEventListener('pagehide',saveOnLeave);document.addEventListener('visibilitychange',()=>{if(document.hidden)saveOnLeave();});
  restore();
 });
})();
