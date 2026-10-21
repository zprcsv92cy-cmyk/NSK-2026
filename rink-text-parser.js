// Deterministic Swedish hockey exercise interpreter; never sends user text to a server.
(function (root) {
 'use strict';
 const colors={röd:'#b11226',röda:'#b11226',blå:'#2563eb',blåa:'#2563eb',svart:'#111827',svarta:'#111827',grön:'#16a34a',gröna:'#16a34a'};
 const amounts={en:1,ett:1,två:2,tre:3,fyra:4,fem:5,sex:6,sju:7,åtta:8,nio:9,tio:10};
 const slots=[
  {re:/nedre vänst|nere till vänster|vänstra nedre/,x:120,y:680},
  {re:/nedre högr|nere till höger|högra nedre/,x:355,y:680},
  {re:/övre vänst|uppe till vänster|vänstra övre/,x:120,y:185},
  {re:/övre högr|uppe till höger|högra övre/,x:355,y:185},
  {re:/mittcirkel|mittpunkten|mittzon|mitten|center/,x:240,y:430},
  {re:/nedre mål|södra mål|eget mål/,x:240,y:775},
  {re:/övre mål|bortre mål|motståndarmål/,x:240,y:85},
  {re:/vänstra blålinjen|blålinjen till vänster/,x:120,y:590},
  {re:/högra blålinjen|blålinjen till höger/,x:360,y:270},
  {re:/blålinjen|blå linjen/,x:240,y:270},
  {re:/nedre zon|försvarszon/,x:240,y:675},
  {re:/övre zon|anfallszon/,x:240,y:175},
  {re:/vänstra tekningscirkel|vänster tekningscirkel/,x:135,y:185},
  {re:/högra tekningscirkel|höger tekningscirkel/,x:345,y:185},
  {re:/tekningscirkel/,x:140,y:180},
  {re:/längs vänstra sargen|vänster sarg|vänsterkanten/,x:55,y:420},
  {re:/längs högra sargen|höger sarg|högerkanten/,x:425,y:420},
  {re:/vänster/,x:130,y:430},
  {re:/höger/,x:350,y:430}
 ];
 const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
 function where(t, fallback){const a=slots.find(p=>p.re.test(t));return a?{x:a.x,y:a.y}:(fallback||null);}
 function count(w){if(!w)return 1;return clamp(amounts[w]||Number(w)||1,1,16);}
 function typeOf(w){return /målvakt/.test(w)?'goalie':/kon|markör/.test(w)?'cone':/puck/.test(w)?'puck':'player';}
 function parse(description,defaultColor='#b11226'){
  const text=String(description||'').toLocaleLowerCase('sv-SE').slice(0,3000).replace(/\s+/g,' ');
  const marks=[],warnings=[],references=new Map(),seen=new Set();
  const add=(type,x,y,color=defaultColor,x2,y2)=>{
   if(marks.length>=150)return null;
   const m={type,x:clamp(x,22,458),y:clamp(y,22,838),color};
   if(Number.isFinite(x2)&&Number.isFinite(y2)){m.x2=clamp(x2,22,458);m.y2=clamp(y2,22,838);}
   marks.push(m);return m;
  };
  const statements=text.split(/[.;!?]+/).map(x=>x.trim()).filter(Boolean);
  let remembered=null;
  for(const clause of statements){
   let touched=false;
   // Several objects in one sentence: "3 röda spelare vid blålinjen och 2 puckar i mitten".
   const matcher=/\b(?:(\d{1,2}|en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio)\s+)?(?:(röda?|blåa?|svarta?|gröna?)\s+)?(utespelare|spelare|målvakter?|puckar?|koner?|markörer?)\b/g;
   const found=[...clause.matchAll(matcher)];
   for(let i=0;i<found.length;i++){
    const match=found[i],label=match[3];
    // Don't create extra object for "spelare 1 passar till spelare 2": those are references.
    const after=clause.slice(match.index+match[0].length);
    if(/^ \d+\b/.test(after))continue;
    const end=i+1<found.length?found[i+1].index:clause.length;
    const phrase=clause.slice(match.index+match[0].length,end);
    const pos=where(phrase,where(clause,remembered||{x:240,y:430}));
    const n=count(match[1]),c=colors[match[2]]||defaultColor,type=typeOf(label);
    const existing=marks.filter(m=>m.type===type);
    for(let k=0;k<n;k++){
     const m=add(type,pos.x+(k%4-(Math.min(n,4)-1)/2)*31,pos.y+Math.floor(k/4)*33,c);
     if(m&&type==='player'){const num=existing.length+k+1;references.set('spelare '+num,m);}
    }
    remembered=pos;touched=true;
   }
   // A, B, C or "spelare 1" actions can reference existing positions.
   const resolve=fragment=>{
    const r=/spelare\s*(\d{1,2})\b/.exec(fragment);
    if(r&&references.has('spelare '+r[1]))return references.get('spelare '+r[1]);
    if(/(?:första|spelare a)\b/.test(fragment)&&references.has('spelare 1'))return references.get('spelare 1');
    if(/(?:andra|spelare b)\b/.test(fragment)&&references.has('spelare 2'))return references.get('spelare 2');
    return where(fragment,null);
   };
   let action=null;
   if(/(?:passar|passning|passa|spelar pucken)/.test(clause))action='pass';
   else if(/(?:skjuter|skott|avslutar|avslut)/.test(clause))action='skate';
   else if(/(?:åker|skridsko|åkväg|startar|driver|rundar|vänder)/.test(clause))action='skate';
   else if(/(?:avdelare|avgräns|sargdelare)/.test(clause))action='divider';
   if(action){
    const fromTo=/(?:från|ifrån)\s+(.+?)\s+(?:till|mot)\s+(.+)/.exec(clause);
    const actor=/(spelare\s*\d{1,2}|första spelaren|andra spelaren)/.exec(clause);
    const to=/(?:till|mot)\s+(.+)/.exec(clause);
    const a=fromTo?resolve(fromTo[1]):actor?resolve(actor[1]):remembered;
    let b=fromTo?resolve(fromTo[2]):to?resolve(to[1]):null;
    if(!b&&/mål|avslut|skott/.test(clause))b={x:240,y:85};
    if(a&&b){
     // Avoid a zero-length route and unrecognized implicit instructions.
     if(Math.hypot(a.x-b.x,a.y-b.y)>14){add(action,a.x,a.y,action==='pass'?'#2563eb':defaultColor,b.x,b.y);touched=true;}
    }else if(!touched)warnings.push('Kunde inte placera rörelsen: '+clause.slice(0,80));
   }
   if(!touched&&!action&&!/^(sedan|därefter|och|till sist)\b/.test(clause))warnings.push('Inte tolkat: '+clause.slice(0,80));
  }
  if(marks.length>=150)warnings.push('Maximalt 150 objekt ritades.');
  return {marks,warnings};
 }
 root.NskRinkTextParser=Object.freeze({parse});
})(typeof window!=='undefined'?window:globalThis);