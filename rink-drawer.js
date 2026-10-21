// NSK mobile hockey rink drawing tool. All drawings are local to this browser.
(() => {
 const NS='http://www.w3.org/2000/svg', W=480,H=860, $=id=>document.getElementById(id);
 const palette=['#b11226','#2563eb','#111827','#16a34a'];
 let marks=[],history=[],tool='move',drag=null,preview=null;
 const el=(tag,props={},parent)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(props))n.setAttribute(k,v);if(parent)parent.append(n);return n;};
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const remember=()=>{history.push(JSON.stringify(marks));if(history.length>40)history.shift();};
 const announce=s=>{$('rinkStatus').textContent=s;};
 const uuid=()=>crypto.randomUUID();
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
   if(m.type==='goalie')el('circle',{cx:m.x,cy:m.y,r:7,fill:'white'},group);
  }else if(m.type==='puck')el('ellipse',{cx:m.x,cy:m.y,rx:9,ry:6,fill:'#171717',stroke:'white','stroke-width':1},group);
  else if(m.type==='cone')el('polygon',{points:(m.x)+','+(m.y-14)+' '+(m.x-12)+','+(m.y+10)+' '+(m.x+12)+','+(m.y+10),fill:'#ef8a18',stroke:'#9a5208','stroke-width':2},group);
  else if(['divider','skate','pass'].includes(m.type)){
   const a={x1:m.x,y1:m.y,x2:m.x2,y2:m.y2,stroke:m.type==='divider'?'#e67717':m.color,'stroke-width':m.type==='divider'?8:4,'stroke-linecap':'round'};
   if(m.type==='pass')a['stroke-dasharray']='10 9';
   if(m.type!=='divider')a['marker-end']='url(#arr-'+m.color.slice(1)+')';
   el('line',a,group);
  }
 }
 function pos(e){
  const s=$('rinkSvg'),matrix=s.getScreenCTM();if(!matrix)return null;
  const p=s.createSVGPoint();p.x=e.clientX;p.y=e.clientY;
  const v=p.matrixTransform(matrix.inverse());return{x:clamp(v.x,22,W-22),y:clamp(v.y,20,H-20)};
 }
 function hit(p){
  for(let i=marks.length-1;i>=0;i--){const m=marks[i];
   if(m.x2!==undefined){const dx=m.x2-m.x,dy=m.y2-m.y;const k=clamp(((p.x-m.x)*dx+(p.y-m.y)*dy)/(dx*dx+dy*dy||1),0,1);if(Math.hypot(m.x+k*dx-p.x,m.y+k*dy-p.y)<16)return m;}
   else if(Math.hypot(m.x-p.x,m.y-p.y)<23)return m;
  }return null;
 }
 function add(type,x,y,color=$('rinkColor').value,x2,y2){
  const m={id:uuid(),type,x,y,color};if(x2!==undefined){m.x2=x2;m.y2=y2;}marks.push(m);return m;
 }
 function setTool(t){tool=t;document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===t)));}
 function pointers(){
  const s=$('rinkSvg');
  s.addEventListener('pointerdown',e=>{
   if(e.pointerType==='mouse'&&e.button!==0)return;
   const p=pos(e);if(!p)return;
   if(tool==='erase'){const m=hit(p);if(m){remember();marks=marks.filter(a=>a!==m);rink();}return;}
   if(tool==='move'){const m=hit(p);if(!m)return;remember();drag={m,p};s.setPointerCapture(e.pointerId);return;}
   remember();
   if(['skate','pass','divider'].includes(tool)){const m=add(tool,p.x,p.y,$('rinkColor').value,p.x,p.y);drag={m,p};}
   else add(tool,p.x,p.y);
   rink();s.setPointerCapture(e.pointerId);
  });
  s.addEventListener('pointermove',e=>{
   if(!drag)return;const p=pos(e);if(!p)return;const m=drag.m;
   if(tool==='move'){
    const dx=p.x-drag.p.x,dy=p.y-drag.p.y;m.x=clamp(m.x+dx,22,W-22);m.y=clamp(m.y+dy,20,H-20);
    if(m.x2!==undefined){m.x2=clamp(m.x2+dx,22,W-22);m.y2=clamp(m.y2+dy,20,H-20);}drag.p=p;
   }else{m.x2=p.x;m.y2=p.y;}rink();
  });
  const end=()=>{if(drag){drag=null;rink();}};
  s.addEventListener('pointerup',end);s.addEventListener('pointercancel',end);
 }
 function restore(){
  try{const v=JSON.parse(localStorage.getItem('nsk_rink_drawing_v1')||'null');if(v&&Array.isArray(v.marks)){
   marks=v.marks.filter(m=>m&&['player','goalie','puck','cone','divider','skate','pass'].includes(m.type)&&[m.x,m.y].every(Number.isFinite)&&palette.includes(m.color)).slice(0,250);
   $('rinkTitle').value=String(v.title||'').slice(0,100);$('rinkDescription').value=String(v.description||'').slice(0,2000);
  }}catch{}rink();
 }
 const locations=[
  {keys:['nedre vänstra','nere till vänster'],x:118,y:665},{keys:['nedre högra','nere till höger'],x:360,y:665},
  {keys:['övre vänstra','uppe till vänster'],x:118,y:190},{keys:['övre högra','uppe till höger'],x:360,y:190},
  {keys:['mitten','mittcirkeln','mittzon'],x:240,y:430},
  {keys:['nedre målet','nedre mål'],x:240,y:760},{keys:['övre målet','övre mål'],x:240,y:100},
  {keys:['vänster'],x:135,y:430},{keys:['höger'],x:345,y:430}
 ];
 function locate(s,def={x:240,y:430}){
  const hit=locations.find(l=>l.keys.some(k=>s.includes(k)));return hit||def;
 }
 function kind(s){
  if(/målvakt/i.test(s))return 'goalie';
  if(/kon(er)?/i.test(s))return 'cone';
  if(/puck(ar)?/i.test(s))return 'puck';
  if(/spelare/i.test(s))return 'player';
  return null;
 }
 function count(s){const words={en:1,ett:1,två:2,tre:3,fyra:4,fem:5,sex:6};const m=s.match(/(?:^|\s)(\d+|en|ett|två|tre|fyra|fem|sex)\s+(?:röda?\s+|blåa?\s+|svarta?\s+|gröna?\s+)?(?:spelare|målvakter?|puckar?|koner?)/i);return clamp(m?(words[m[1].toLowerCase()]||Number(m[1])):1,1,20);}
 function drawFromText(){
  const txt=$('rinkDescription').value.trim().toLocaleLowerCase('sv');
  if(!txt){announce('Skriv en beskrivning först.');return;}
  const parts=txt.split(/[.;\n]+/).map(s=>s.trim()).filter(Boolean);
  let created=0;
  remember();marks=[];
  for(const part of parts){
   const t=kind(part), loc=locate(part);
   if(t){
    const n=count(part);let color=$('rinkColor').value;
    if(part.includes('röd'))color=palette[0];else if(part.includes('blå'))color=palette[1];else if(part.includes('svart'))color=palette[2];else if(part.includes('grön'))color=palette[3];
    for(let i=0;i<n;i++){const col=i%4,row=Math.floor(i/4);add(t,clamp(loc.x+(col-(Math.min(n,4)-1)/2)*28,35,445),clamp(loc.y+(row)*30,35,825),color);created++;}
   }
   if(/åkväg|skridsko(väg)?|åker från|åk från|passning från|passa från|avdelare från/.test(part)){
    const halves=part.split(/\s+till\s+/);if(halves.length>=2){
     const a=locate(halves[0],{x:120,y:650}),b=locate(halves[1],{x:300,y:350});
     const type=/pass/.test(part)?'pass':/avdelare/.test(part)?'divider':'skate';
     add(type,a.x,a.y,$('rinkColor').value,b.x,b.y);created++;
    }
   }
  }
  rink();announce(created?created+' symboler och linjer skapade från texten. Justera dem med Flytta.':'Beskrivningen kunde inte tolkas. Försök till exempel: Två spelare vid nedre vänstra hörnet. Tre koner vid övre högra hörnet.');
 }
 function exportImage(){
  const s=$('rinkSvg').cloneNode(true);s.setAttribute('xmlns',NS);s.setAttribute('width',String(W));s.setAttribute('height',String(H));
  const blob=new Blob([new XMLSerializer().serializeToString(s)],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob),img=new Image();
  img.onload=()=>{
   const canvas=document.createElement('canvas');canvas.width=960;canvas.height=1720;
   const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);
   URL.revokeObjectURL(url);canvas.toBlob(png=>{
    if(!png){announce('Kunde inte skapa PNG.');return;}
    const href=URL.createObjectURL(png),a=document.createElement('a');a.href=href;
    a.download=($('rinkTitle').value.trim()||'nsk-hockeyovning').replace(/[^a-z0-9åäö _-]/gi,'')+'.png';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);
    announce('Bilden exporterades.');
   },'image/png');
  };img.onerror=()=>{URL.revokeObjectURL(url);announce('Bilden kunde inte exporteras.');};img.src=url;
 }
 document.addEventListener('DOMContentLoaded',()=>{
  rink();pointers();
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  $('rinkUndo').onclick=()=>{if(history.length){marks=JSON.parse(history.pop());rink();}};
  $('rinkClear').onclick=()=>{if(confirm('Rensa alla symboler från rinken?')){remember();marks=[];rink();}};
  $('rinkSave').onclick=()=>{localStorage.setItem('nsk_rink_drawing_v1',JSON.stringify({title:$('rinkTitle').value,description:$('rinkDescription').value,marks}));announce('Övningen sparad på den här enheten.');};
  $('rinkLoad').onclick=()=>{restore();announce('Senaste lokalt sparade övningen öppnad.');};
  $('rinkExport').onclick=exportImage;
  $('rinkFromText').onclick=drawFromText;
  $('rinkTextExample').onclick=()=>{$('rinkDescription').value='Två röda spelare vid nedre vänstra hörnet. En puck i mittcirkeln. Tre koner vid övre högra hörnet. Åkväg från nedre vänstra hörnet till mittcirkeln. Passning från mittcirkeln till övre högra hörnet.';};
  $('rinkFullscreen').onclick=()=>{const on=document.body.classList.toggle('rink-fullscreen');$('rinkFullscreen').textContent=on?'Avsluta helskärm':'Helskärm';};
  restore();
 });
})();
