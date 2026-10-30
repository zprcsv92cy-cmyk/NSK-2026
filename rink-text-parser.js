// Local Swedish hockey interpreter. Coordinates match the embedded portrait NSK rink.
(function(root){
 'use strict';
 const rink=Object.freeze({width:480,height:860,centerX:240,centerY:430,left:28,right:452,top:22,bottom:838,blueUpper:301,blueLower:559,goalUpper:78,goalLower:786,faceLeft:128,faceRight:353,faceUpper:164,faceLower:698,neutralUpper:331,neutralLower:525,circleRadius:70});
 const colors={röd:'#b11226',röda:'#b11226',blå:'#2563eb',blåa:'#2563eb',svart:'#111827',svarta:'#111827',grön:'#16a34a',gröna:'#16a34a'};
 const amounts={en:1,ett:1,två:2,tre:3,fyra:4,fem:5,sex:6,sju:7,åtta:8,nio:9,tio:10};
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const point=(x,y,extra={})=>({x,y,...extra});
 function normalize(s){return String(s||'').toLocaleLowerCase('sv-SE').replace(/motståndarmål(?:et)?/g,'övre målet').replace(/hemmamål(?:et)?/g,'nedre målet').replace(/lång sarg/g,'långsarg').replace(/kort sarg/g,'kortsarg').replace(/framlänges/g,'framåt').replace(/blå linj/g,'blålinj').replace(/rödlinj/g,'mittlinj').replace(/framför kassen/g,'framför målet').replace(/bakom kassen/g,'bakom målet').replace(/\bkassen\b/g,'målet').replace(/\bmittpunkt(?:en)?\b/g,'mittcirkel').replace(/\s+/g,' ').trim();}
 function zone(t){return /nedre|nedersta|södra|eget|egna|försvars|hemma/.test(t)?'lower':/övre|översta|norra|bortre|motståndar|anfalls/.test(t)?'upper':/mittzon|neutral/.test(t)?'middle':null;}
 function side(t){return /vänst/.test(t)?'left':/högr|höger/.test(t)?'right':null;}
 function location(fragment,context={},report=()=>{}){
  const t=normalize(fragment),z=zone(t)||context.zone,s=side(t)||context.side;
  const upper=z==='upper',lower=z==='lower',x=s==='left'?rink.faceLeft:s==='right'?rink.faceRight:rink.centerX;
  if(!t)return null;
  if(/^nära /.test(t)){const p=location(t.slice(5),context,report);return p?point(p.x+Math.sign(240-p.x)*20,p.y+(Math.sign(430-p.y)||1)*20):null;}
  if(/mellan blålinjerna/.test(t))return point(x,430);
  if(/bås/.test(t)){report('Båsen syns inte på rinkbilden. Ange vänster eller höger långsarg i stället.');return null;}
  // Resolve two named places before generic words such as "mitt" or "sarg".
  const between=/mellan\s+(.+?)\s+och\s+(.+)/.exec(t);
  if(between){const a=location(between[1],context,report),b=location(between[2],context,report);return a&&b?point((a.x+b.x)/2,(a.y+b.y)/2):null;}
  const height=/i höjd med\s+(.+)/.exec(t);
  if(height){const a=location(height[1],context,report);return a?point(s==='left'?50:s==='right'?430:a.x,a.y):null;}
  const requireEnd=()=>{if(!upper&&!lower){report('Ange övre/anfallszon eller nedre/försvarszon: '+t);return false;}return true;};
  const endY=upper?rink.faceUpper:rink.faceLower,goalY=upper?rink.goalUpper:rink.goalLower,blueY=upper?rink.blueUpper:rink.blueLower;
  if(/mittcirkel|mittlinj|\bmitten\b|mittpunkt/.test(t))return point(/sarg/.test(t)?(s==='left'?45:s==='right'?435:x):x,rink.centerY,{radius:68});
  if(/blålinj/.test(t)){
   if(!requireEnd())return null;
   return point(/sarg/.test(t)?(s==='left'?45:s==='right'?435:x):x,blueY);
  }
  if(/teknings|tekpunkt|tekcirkel/.test(t)){
   if(!s){report('Ange vänster eller höger tekningspunkt/cirkel: '+t);return null;}
   if(/mittzon|neutral/.test(t)){
    if(!/övre|nedre|anfalls|försvars/.test(t)){report('Ange övre eller nedre tekningspunkten i mittzon.');return null;}
    return point(x,/övre|anfalls/.test(t)?rink.neutralUpper:rink.neutralLower);
   }
   if(!requireEnd())return null;
   return point(x,endY,{radius:rink.circleRadius});
  }
  if(/mållinj/.test(t)&&!/förlängda/.test(t)){if(!requireEnd())return null;return point(/sarg/.test(t)?(s==='left'?45:s==='right'?435:x):x,goalY);}
  if(/slott/.test(t)){
   if(!requireEnd())return null;
   const depth=/höga/.test(t)?165:/låga/.test(t)?58:100;
   return point(x,goalY+(upper?depth:-depth));
  }
  if(/framför|målgård/.test(t)&&/mål|kass|målgård/.test(t)){if(!requireEnd())return null;return point(x,goalY+(upper?28:-28));}
  if(/bakom|förlängda/.test(t)&&/mål|mållinj/.test(t)){if(!requireEnd())return null;return point(s==='left'?110:s==='right'?370:240,goalY+(upper?-34:34));}
  if(/målbur|\bmål(?:et|en)?\b/.test(t)){if(!requireEnd())return null;return point(240,goalY);}
  if(/hörn/.test(t)){if(!requireEnd())return null;if(!s){report('Ange vänster eller höger hörn: '+t);return null;}return point(s==='left'?72:408,upper?72:792);}
  if(/backplats|vänsterback|högerback|\bbackar?\b/.test(t))return point(x,z==='lower'?610:280);
  if(/center|forward/.test(t))return point(x,z==='lower'?660:z==='middle'?430:210);
  if(/kortsarg/.test(t)){if(!requireEnd())return null;return point(x,upper?30:830);}
  if(/långsarg|sargen|\bsarg\b|kanten/.test(t)){
   if(!s){report('Ange vänster eller höger långsarg: '+t);return null;}
   return point(s==='left'?45:435,upper?210:lower?650:430);
  }
  if(z)return point(x,upper?205:lower?665:430);
  if(s)return point(x,430);
  return null;
 }
 const objectPattern='utespelare|spelare|målvakter|målvakt|puckar|puck|koner|kon|markörer|markör|däck|backar|back|vänsterback|högerback|center|vänsterforward|högerforward|målburar|målbur|mål';
 const matcher=new RegExp('(?:(\\d{1,2}|en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio)\\s+)?(?:(röda?|blåa?|svarta?|gröna?)\\s+)?('+objectPattern+')(?![a-zåäö])','g');
 function parse(description,defaultColor='#b11226',options={}){
  const input=normalize(String(description||'').replace(/\n+/g,'. ')).slice(0,3000),marks=[],warnings=[],references=new Map();let remembered=null,heading=point(0,-1),context={};let goalReferences=(options.goals||[]).filter(g=>Number.isFinite(g.x)&&Number.isFinite(g.y)),declaredGoals=false;
  const warn=s=>{if(!warnings.includes(s))warnings.push(s);};
  const add=(type,p,color=defaultColor,end,extra={})=>{
   if(marks.length>=150)return null;
   const m={type,x:clamp(p.x,22,458),y:clamp(p.y,22,838),color,...extra};
   if(end){m.x2=clamp(end.x,22,458);m.y2=clamp(end.y,22,838);}
   if(['skate','curve'].includes(type)){m.motion=m.motion==='backward'?'backward':'forward';m.color=m.motion==='backward'?'#7c3aed':'#15803d';}
   if(m.points)m.points=m.points.map(p=>point(clamp(p.x,22,458),clamp(p.y,22,838)));
   marks.push(m);return m;
  };
  const front=(g,d)=>{const a=(g.angle||0)*Math.PI/180;return point(g.x-Math.sin(a)*d,g.y+Math.cos(a)*d);};
  const loc=(s,ctx=context)=>{
   if(/mål|kassen/.test(s)&&!/mållinj/.test(s)&&goalReferences.length){const z=zone(s)||ctx.zone;if(z==='upper'||z==='lower'){const g=goalReferences[z==='upper'?0:1];if(g){if(/framför|målgård/.test(s))return front(g,28);if(/bakom/.test(s))return front(g,-34);if(/slott/.test(s))return location(s,ctx,warn);return point(g.x,g.y);}}}
   return location(s,ctx,warn);
  };
  const resolve=s=>{const goal=/mål(?:bur)?\s*(\d{1,2})\b/.exec(s);if(goal){const p=goalReferences[Number(goal[1])-1];if(!p)warn('Mål '+goal[1]+' behöver placeras först.');return p||null;}const r=/(?:spelare\s*(\d{1,2}|[abc])|första spelaren|andra spelaren|tredje spelaren)/.exec(s);if(r){const key=r[1]?({a:'1',b:'2',c:'3'}[r[1]]||r[1]):/första/.test(r[0])?'1':/andra/.test(r[0])?'2':'3';if(references.has(key))return references.get(key);warn('Spelare '+key+' behöver placeras först.');return null;}return loc(s);};
  const typeOf=w=>/målvakt/.test(w)?'goalie':/mål/.test(w)?'goal':/kon|markör/.test(w)?'cone':/puck/.test(w)?'puck':/däck/.test(w)?'tire':'player';
  const clauses=input.split(/[,.;!?\n]+|,?\s+(?:sedan|därefter|och sedan|och därefter)\s*|\s+och\s+(?=sväng|svänger|vänd|stanna|passa|skjut|åk|runda|fortsätt|framåt|bakåt|baklänges)/).map(s=>s.trim()).filter(Boolean);
  for(const clause of clauses){
   const before=warnings.length;let touched=false;
   const moving=/(?:passar|passning|passa\b|spelar pucken|skjut(?:er)?|skott|avslut|åk\b|åker|åkning|skridsko|åkväg|driver|runda(?:r)?|runt\b|sväng|svänger|vänd(?:er|ning)?|slalom|framåt|bakåt|baklänges|stanna(?:r)?|stopp|översteg)/.test(clause);
   const divider=/avdelare|avgränsare|sargdelare/.test(clause);
   const localContext={...context};if(zone(clause))localContext.zone=zone(clause);
   // Object clauses have their own location; action subjects refer to already placed players.
   if(!moving&&!divider){
    const found=[...clause.matchAll(matcher)].filter(m=>typeOf(m[3])!=='goal'||m[1]||m.index===0||/^(?:placera|lägg till|ställ)\s*$/.test(clause.slice(0,m.index)));
    for(let i=0;i<found.length;i++){
     const match=found[i],type=typeOf(match[3]),next=i+1<found.length?found[i+1].index:clause.length;
     let phrase=clause.slice(match.index+match[0].length,next),number=/^\s+(\d{1,2})\b/.exec(phrase);
     if(number)phrase=phrase.slice(number[0].length);
     const orientation=/(?:vänt|vända|vänd|riktat|riktad|riktade)\s+(?:(?:åt|mot)\s+)?(vänster|höger|uppåt|nedåt)/.exec(phrase);if(orientation)phrase=phrase.slice(0,orientation.index);
     const role=/back|center|forward/.test(match[3])?match[3]+' ':'';
     const n=clamp(amounts[match[1]]||Number(match[1])||1,1,16),color=colors[match[2]]||defaultColor;
     let positions=[];
     if(/varje|vardera|båda/.test(phrase)&&/mål/.test(phrase))positions=goalReferences.length?goalReferences.map(g=>front(g,18)):[point(240,rink.goalUpper+18),point(240,rink.goalLower-18)];
     else if(/varje|vardera|båda/.test(phrase)&&/blålinj/.test(phrase)){
      const x=side(phrase)==='left'?45:side(phrase)==='right'?435:240;positions=[point(x,rink.blueUpper),point(x,rink.blueLower)];
     }else if(/varje|vardera|båda/.test(phrase)&&/hörn/.test(phrase))positions=[point(72,72),point(408,72),point(72,792),point(408,792)];
     else if(/backar/.test(match[3])&&n===2&&/blålinj/.test(phrase)&&!side(phrase)){
      const p=location(phrase,localContext,warn);if(p)positions=[point(128,p.y),point(353,p.y)];
     }else{const p=loc(role+phrase,localContext);if(p)positions=[p];}
     if(!positions.length){if(warnings.length===before)warn('Ange en plats för '+match[3]+': '+clause);continue;}
     const perPosition=positions.length>1&&/backar/.test(match[3])?1:n;
     for(const p of positions)for(let k=0;k<perPosition;k++){
      const m=add(type,point(p.x+(k%4-(Math.min(perPosition,4)-1)/2)*(type==='goal'?70:28),p.y+Math.floor(k/4)*30),color);
      if(m&&type==='goal'){m.angle=/mot varandra/.test(clause)&&n>1?(m.x<240?270:90):orientation?({vänster:90,höger:270,uppåt:180,nedåt:0}[orientation[1]]):p.y>430?180:0;if(!declaredGoals){goalReferences=[];declaredGoals=true;}goalReferences.push(m);}
      if(m&&type==='player'){const key=number?number[1]:String(references.size+1);m.number=key;references.set(key,m);}
     }
     remembered=positions.at(-1);context=localContext;touched=true;
    }
   }
   if(moving||divider){
    const isPass=/passar|passning|passa\b|spelar pucken/.test(clause),isShot=/skjut(?:er)?|skott|avslut/.test(clause);
    const backwards=/bakåt|baklänges/.test(clause),turn=/sväng|svänger|vänd|runda(?:r)?|runt\b|slalom/.test(clause),stop=/stanna(?:r)?|stopp/.test(clause),crossover=/översteg/.test(clause);
    const fromTo=/(?:från|ifrån)\s+(.+?)\s+(?:till|mot)\s+(.+)/.exec(clause),from=/(?:från|ifrån)\s+(.+?)(?=\s+(?:framåt|bakåt|baklänges|sväng|och|runt|i slalom)|$)/.exec(clause),actor=/(spelare\s*(?:\d{1,2}|[abc])|första spelaren|andra spelaren|tredje spelaren)/.exec(clause);
    const destination=/(?:till|mot)\s+(.+)/.exec(clause);
    let a=fromTo?resolve(fromTo[1]):from?resolve(from[1]):actor?resolve(actor[1]):remembered;
    let b=fromTo?resolve(fromTo[2]):destination?resolve(destination[1]):null;
    if(isShot&&!destination&&!fromTo)b=point(240,localContext.zone==='lower'?rink.goalLower:rink.goalUpper);
    const around=/(?:runt|runda(?:r)?)\s+(.+)/.exec(clause);
    if(around&&/cirkel|kon|däck/.test(around[1])){
     let c;
     if(/cirkel/.test(around[1]))c=location(around[1],localContext,warn);
     else {const type=/däck/.test(around[1])?'tire':'cone',number=/(\d{1,2})/.exec(around[1]),objects=marks.filter(m=>m.type===type);const target=number?objects[Number(number[1])-1]:objects.length===1?objects[0]:null;if(target)c=point(target.x,target.y,{radius:32});else warn('Ange vilken '+(type==='tire'?'däck':'kon')+' som ska rundas, till exempel kon 1.');}
     if(c){const radius=c.radius||70,start=Math.atan2((a?.y??c.y)-(c.y),(a?.x??c.x+radius)-c.x),direction=/medurs/.test(clause)&&!/moturs/.test(clause)?1:-1,pts=[];for(let k=0;k<=32;k++){const angle=start+direction*k/32*Math.PI*2;pts.push(point(c.x+radius*Math.cos(angle),c.y+radius*Math.sin(angle)));}if(a&&Math.hypot(a.x-pts[0].x,a.y-pts[0].y)>16)pts.unshift(point(a.x,a.y));const m=add('curve',pts[0],defaultColor,null,{points:pts,...(backwards?{motion:'backward'}:{}),...(crossover?{movementLabel:'Översteg'}:{})});if(m){remembered=pts.at(-1);touched=true;}}
    }else{
     if(!a&&/framåt|bakåt|baklänges|sväng/.test(clause)){warn('Ange var rörelsen börjar, till exempel: Åk framåt från mittpunkten.');}
     if(turn&&!around&&!destination&&!fromTo&&!/vänst|höger|högra|vänd|slalom/.test(clause)){warn('Ange sväng vänster, sväng höger eller ett mål för svängen.');a=null;}
     if(a&&!b&&!destination&&!fromTo){
      const metres=/(\d{1,2})\s*(?:meter|m\b)/.exec(clause),distance=metres?clamp(Number(metres[1])*14,20,350):120;
      let vector={...heading};
      if(/åt vänster|till vänster|sväng(?:er)? vänst/.test(clause))vector=point(-1,0);else if(/åt höger|till höger|sväng(?:er)? höger/.test(clause))vector=point(1,0);
      else if(/nedåt/.test(clause))vector=point(0,1);else if(/uppåt/.test(clause))vector=point(0,-1);
      else if(/vänd|u-sväng/.test(clause))vector=point(-heading.x,-heading.y);
      else if(backwards)vector=point(-heading.x,-heading.y);
      if(!stop||/åker|framåt|bakåt|från/.test(clause))b=point(clamp(a.x+vector.x*distance,30,450),clamp(a.y+vector.y*distance,28,832));
      else b=point(a.x+heading.x*24,a.y+heading.y*24);
     }
     if(a&&b&&Math.hypot(a.x-b.x,a.y-b.y)>4){
      const extra={...(backwards?{motion:'backward'}:{}),...(stop?{movementLabel:'Stopp'}:crossover?{movementLabel:'Översteg'}:{})};
      let type=divider?(/gul/.test(clause)?'divider-yellow':/blå/.test(clause)?'divider-blue':'divider'):isPass?'pass':isShot?'shot':'skate';
      if(turn&&!isPass&&!isShot&&!divider){
       const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),bend=/vänster/.test(clause)?-1:1,pts=[point(a.x,a.y)];
       if(/slalom/.test(clause)){for(let k=1;k<12;k++){const f=k/12,offset=Math.sin(f*Math.PI*6)*35;pts.push(point(a.x+dx*f-dy/len*offset,a.y+dy*f+dx/len*offset));}}
       else if(/vänd|u-sväng/.test(clause)){for(let k=1;k<12;k++){const f=k/12,offset=Math.sin(f*Math.PI)*65*bend;pts.push(point(a.x+dx*f-dy/len*offset,a.y+dy*f+dx/len*offset));}}
       else pts.push(point(a.x+heading.x*55,a.y+heading.y*55),point(b.x-heading.x*20,b.y-heading.y*20));
       pts.push(point(b.x,b.y));type='curve';extra.points=pts;
      }
      add(type,a,isPass?'#2563eb':defaultColor,b,extra);if(!isPass&&!isShot&&!divider){const len=Math.hypot(b.x-a.x,b.y-a.y);if(!backwards)heading=point((b.x-a.x)/len,(b.y-a.y)/len);remembered=b;if(actor){const ref=/(\d{1,2}|[abc])$/.exec(actor[1]);const key=ref?({a:'1',b:'2',c:'3'}[ref[1]]||ref[1]):/första/.test(actor[1])?'1':/andra/.test(actor[1])?'2':'3';references.set(key,b);}}touched=true;
     }
    }
    if(!touched&&warnings.length===before)warn('Förtydliga start och mål för rörelsen: '+clause.slice(0,100));
   }
   if(!touched&&warnings.length===before)warn('Inte tolkat: '+clause.slice(0,100));
  }
  if(marks.length>=150)warn('Maximalt 150 objekt ritades.');
  return {marks,warnings};
 }
 root.NskRinkTextParser=Object.freeze({parse,location:fragment=>location(fragment),rink});
})(typeof window!=='undefined'?window:globalThis);
