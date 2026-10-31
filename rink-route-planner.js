// Interpret existing rink marks locally: preserve route order, pass anchors and turning side.
(function(root){
 'use strict';
 const TAU=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),copy=p=>({x:p.x,y:p.y});
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 function project(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,f=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return {x:a.x+f*dx,y:a.y+f*dy};}
 const segmentDistance=(p,a,b)=>distance(p,project(p,a,b));
 const circlePoint=(c,r,a)=>({x:c.x+r*Math.cos(a),y:c.y+r*Math.sin(a)});
 const tangent=(angle,dir)=>({x:-Math.sin(angle)*dir,y:Math.cos(angle)*dir});
 function rendered(m){
  if(m.type!=='curve')return [{x:m.x,y:m.y},{x:m.x2,y:m.y2}];
  if(m.routeStyle==='planned')return m.points.map(copy);
  const out=[copy(m.points[0])];let start=m.points[0];
  for(let i=1;i<m.points.length-1;i++){
   const c=m.points[i],b={x:(c.x+m.points[i+1].x)/2,y:(c.y+m.points[i+1].y)/2},n=Math.max(4,Math.min(50,Math.ceil((distance(start,c)+distance(c,b))/4)));
   for(let k=1;k<=n;k++){const t=k/n,u=1-t;out.push({x:u*u*start.x+2*u*t*c.x+t*t*b.x,y:u*u*start.y+2*u*t*c.y+t*t*b.y});}start=b;
  }
  out.push(copy(m.points.at(-1)));return out;
 }
 function sample(points){
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+distance(points[i-1],points[i]));
  const count=Math.min(450,Math.max(24,Math.ceil(lengths.at(-1)/3))),out=[];let j=1;
  for(let k=0;k<count;k++){const d=lengths.at(-1)*k/(count-1);while(j<points.length-1&&lengths[j]<d)j++;const f=(d-lengths[j-1])/(lengths[j]-lengths[j-1]||1);out.push({x:points[j-1].x+(points[j].x-points[j-1].x)*f,y:points[j-1].y+(points[j].y-points[j-1].y)*f});}return out;
 }
 function turns(points,center){
  let polar=0,bend=0,previousAngle=Math.atan2(points[0].y-center.y,points[0].x-center.x),previousHeading=null,variation=0;
  for(let i=1;i<points.length;i++){const a=Math.atan2(points[i].y-center.y,points[i].x-center.x),d=wrap(a-previousAngle);polar+=d;variation+=Math.abs(d);previousAngle=a;
   if(distance(points[i],points[i-1])>1e-5){const h=Math.atan2(points[i].y-points[i-1].y,points[i].x-points[i-1].x);if(previousHeading!==null)bend+=wrap(h-previousHeading);previousHeading=h;}
  }return {polar,bend,variation};
 }
 function passAnchors(points,passes){
  const found=[];
  for(const pass of passes)for(const p of [{x:pass.x,y:pass.y},{x:pass.x2,y:pass.y2}]){
   let best={d:Infinity,index:0};for(let i=1;i<points.length;i++){const q=project(p,points[i-1],points[i]),d=distance(p,q);if(d<best.d)best={d,index:i,q};}
   if(best.d<=16&&best.index>2&&best.index<points.length-3&&!found.some(a=>Math.abs(a.index-best.index)<5))found.push({kind:'point',point:copy(p),index:best.index,passId:pass.id});
  }return found.sort((a,b)=>a.index-b.index);
 }
 function analyze(route,equipment,passes=[]){
  const points=sample(rendered(route)),anchors=passAnchors(points,passes),events=[];
  for(const obstacle of equipment){
   const footprint=obstacle.type==='tire'?13:14,distances=points.map(p=>distance(p,obstacle)),closest=Math.min(...distances);
   if(closest<footprint+3||closest>100)continue;
   const limit=Math.min(120,closest+Math.max(9,closest*.3)),runs=[];let run=null;
   for(let i=0;i<points.length;i++){
    const nearest=equipment.every(o=>o.id===obstacle.id||distance(points[i],o)>=distances[i]-5);
    if(distances[i]<=limit&&nearest){if(!run){run=[];runs.push(run);}run.push(i);}else run=null;
   }
   for(const indices of runs){
    const start=indices[0],end=indices.at(-1);if(end-start<4||anchors.some(p=>p.index>start&&p.index<end))continue;
    const part=points.slice(start,end+1),turn=turns(part,obstacle);
    if(Math.abs(turn.polar)<.85||Math.abs(turn.bend)<.85||Math.sign(turn.polar)!==Math.sign(turn.bend)||Math.abs(turn.polar)<turn.variation*.65)continue;
    const radii=indices.map(i=>distances[i]).sort((a,b)=>a-b),radius=radii[Math.floor(radii.length/2)];
    events.push({kind:'arc',center:copy(obstacle),obstacleId:obstacle.id,footprint,radius,start,end,index:(start+end)/2,dir:Math.sign(turn.polar),sweep:Math.abs(turn.polar),oldEntry:Math.atan2(part[0].y-obstacle.y,part[0].x-obstacle.x),oldExit:Math.atan2(part.at(-1).y-obstacle.y,part.at(-1).x-obstacle.x),closed:start===0&&end===points.length-1&&distance(points[0],points.at(-1))<8&&Math.abs(turn.polar)>5});
   }
  }
  // Overlapping interpretations are ambiguous: retain the one with the clearest turn.
  const chosen=[];for(const e of events.sort((a,b)=>b.sweep-a.sweep))if(!chosen.some(c=>e.start<c.end&&e.end>c.start))chosen.push(e);
  return {route,points,anchors,events:chosen.sort((a,b)=>a.index-b.index)};
 }
 function pointConnection(point,arc,incoming){
  const d=distance(point,arc.center);if(d<=arc.fitRadius+.1)return null;
  const bearing=Math.atan2(point.y-arc.center.y,point.x-arc.center.x),offset=Math.acos(arc.fitRadius/d),candidates=[];
  for(const angle of [bearing+offset,bearing-offset]){
   const at=circlePoint(arc.center,arc.fitRadius,angle),travel=incoming?{x:at.x-point.x,y:at.y-point.y}:{x:point.x-at.x,y:point.y-at.y},len=Math.hypot(travel.x,travel.y),t=tangent(angle,arc.dir);
   if((travel.x*t.x+travel.y*t.y)/len>.99)candidates.push({angle,at});
  }return candidates[0]||null;
 }
 function circleConnection(a,b){
  const dx=b.center.x-a.center.x,dy=b.center.y-a.center.y,d=Math.hypot(dx,dy);if(d<1)return null;const bearing=Math.atan2(dy,dx),options=[];
  for(const sa of [-1,1])for(const sb of [-1,1]){
   const q=(sa*a.fitRadius-sb*b.fitRadius)/d;if(Math.abs(q)>=1)continue;
   for(const sign of [-1,1]){const normal=bearing+sign*Math.acos(q),aa=normal+(sa<0?Math.PI:0),ba=normal+(sb<0?Math.PI:0),p=circlePoint(a.center,a.fitRadius,aa),r=circlePoint(b.center,b.fitRadius,ba),len=distance(p,r),ta=tangent(aa,a.dir),tb=tangent(ba,b.dir),vx=(r.x-p.x)/len,vy=(r.y-p.y)/len;
    if(vx*ta.x+vy*ta.y>.99&&vx*tb.x+vy*tb.y>.99)options.push({a:aa,b:ba,score:Math.abs(wrap(aa-a.oldExit))+Math.abs(wrap(ba-b.oldEntry))});
   }
  }return options.sort((x,y)=>x.score-y.score)[0]||null;
 }
 function directedSweep(entry,exit,dir,originalSweep){let sweep=(dir*(exit-entry)%TAU+TAU)%TAU;const options=[sweep,sweep+TAU];if(sweep<.02)options.push(TAU);return options.sort((a,b)=>Math.abs(a-originalSweep)-Math.abs(b-originalSweep))[0];}
 function arcPoints(arc,entry,exit){
  const sweep=directedSweep(entry,exit,arc.dir,arc.sweep);if(sweep<.35||Math.abs(sweep-arc.sweep)>2.4)return null;
  const steps=Math.max(8,Math.ceil(sweep/(Math.PI/36)));return Array.from({length:steps+1},(_,i)=>circlePoint(arc.center,arc.fitRadius,entry+arc.dir*sweep*i/steps));
 }
 function build(analysis,clearance){
  const {route,points,anchors}=analysis;if(!analysis.events.length&&!anchors.length)return null;
  const arcs=analysis.events.map(e=>({...e,fitRadius:e.footprint+clearance}));
  // A full circle can use one exact radius without moving an attached start/pass point.
  if(arcs.length===1&&arcs[0].closed&&!anchors.length){
   const arc=arcs[0];if(analysis.startPinned)arc.fitRadius=distance(points[0],arc.center);const entry=arc.oldEntry,steps=Math.max(72,Math.ceil(arc.sweep/(Math.PI/36))),ps=Array.from({length:steps+1},(_,i)=>circlePoint(arc.center,arc.fitRadius,entry+arc.dir*arc.sweep*i/steps));ps[ps.length-1]=copy(ps[0]);if(ps.some(p=>p.x<22||p.x>458||p.y<20||p.y>840))return null;
   return {...route,x:ps[0].x,y:ps[0].y,...(route.x2!==undefined?{x2:ps.at(-1).x,y2:ps.at(-1).y}:{}),points:ps,routeStyle:'planned'};
  }
  const nodes=[{kind:'point',point:copy(points[0]),index:0},...arcs,...anchors,{kind:'point',point:copy(points.at(-1)),index:points.length-1}].sort((a,b)=>a.index-b.index);
  const connections=[];
  for(let i=1;i<nodes.length;i++){
   const a=nodes[i-1],b=nodes[i];
   if(a.kind==='point'&&b.kind==='point'){connections.push({start:a.point,end:b.point});continue;}
   if(a.kind==='point'){const c=pointConnection(a.point,b,true);if(!c)return null;b.entry=c.angle;connections.push({start:a.point,end:c.at});}
   else if(b.kind==='point'){const c=pointConnection(b.point,a,false);if(!c)return null;a.exit=c.angle;connections.push({start:c.at,end:b.point});}
   else{const c=circleConnection(a,b);if(!c)return null;a.exit=c.a;b.entry=c.b;connections.push({start:circlePoint(a.center,a.fitRadius,c.a),end:circlePoint(b.center,b.fitRadius,c.b)});}
  }
  const out=[];const append=p=>{if(!out.length||distance(out.at(-1),p)>.001)out.push(copy(p));};
  for(let i=0;i<nodes.length;i++){
   const node=nodes[i];
   if(node.kind==='point')append(node.point);
   else{const ps=arcPoints(node,node.entry,node.exit);if(!ps)return null;ps.forEach(append);}
   if(i<connections.length){const a=nodes[i],b=nodes[i+1],c=connections[i];append(c.start);
    if(a.kind==='point'&&b.kind==='point'){
     const original=points.slice(Math.floor(a.index),Math.ceil(b.index)+1);if(original.some(p=>segmentDistance(p,c.start,c.end)>30))return null;
    }
    append(c.end);
   }
  }
  if(out.length<2||out.length>500||out.some(p=>p.x<22||p.x>458||p.y<20||p.y>840))return null;
  return {...route,x:out[0].x,y:out[0].y,...(route.x2!==undefined?{x2:out.at(-1).x,y2:out.at(-1).y}:{}),points:out,routeStyle:'planned'};
 }
 // Preserve explicit reversals and figure-eight crossings instead of guessing a shortcut.
 function hasRouteFeatures(route){
  const raw=rendered(route),ps=raw.length>450?sample(raw):raw;if(route.directionBoundary)return true;
  const significant=[ps[0]];for(const p of ps.slice(1))if(distance(p,significant.at(-1))>=8)significant.push(p);
  for(let i=1;i<significant.length-1;i++){const a=significant[i-1],b=significant[i],c=significant[i+1],u=distance(a,b),v=distance(b,c);if(u&&v&&((b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y))/(u*v)<-.75)return true;}
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  for(let i=1;i<ps.length;i++)for(let j=i+2;j<ps.length;j++){const a=ps[i-1],b=ps[i],c=ps[j-1],d=ps[j];if(cross(a,b,c)*cross(a,b,d)<-1e-6&&cross(c,d,a)*cross(c,d,b)<-1e-6)return true;}
  return false;
 }
 function plan(marks){
  const equipment=marks.filter(m=>['tire','cone'].includes(m.type)),passes=marks.filter(m=>m.type==='pass'),analyses=marks.filter(m=>m.type==='curve'&&m.points?.length>=3).map(m=>analyze(m,equipment,passes));
  for(const analysis of analyses)analysis.startPinned=marks.some(m=>['player','goalie','puck'].includes(m.type)&&distance(m,analysis.points[0])<24)||passes.some(p=>distance(p,analysis.points[0])<16||distance({x:p.x2,y:p.y2},analysis.points[0])<16);
  const gaps=analyses.flatMap(a=>a.events.map(e=>e.radius-e.footprint)).sort((a,b)=>a-b),clearance=gaps.length?clamp(gaps[Math.floor(gaps.length/2)],18,65):24,plans=new Map();
  for(const analysis of analyses){if(hasRouteFeatures(analysis.route))continue;const candidate=build(analysis,clearance);if(candidate)plans.set(analysis.route.id,candidate);}
  return {plans,clearance};
 }
 root.NskRoutePlanner=Object.freeze({plan,analyze,rendered,hasRouteFeatures});
})(typeof window!=='undefined'?window:globalThis);
