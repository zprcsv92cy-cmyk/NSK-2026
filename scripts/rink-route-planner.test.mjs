import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {threeTireRoute} from './fixtures/three-tire-route.mjs';
const context={};vm.runInNewContext(fs.readFileSync(new URL('../rink-route-planner.js',import.meta.url),'utf8'),context);const api=context.NskRoutePlanner;
const arc=(c,r,a,b,n=20)=>Array.from({length:n+1},(_,i)=>{const t=a+(b-a)*i/n,rr=r+Math.sin(i*1.7)*4;return {x:c.x+rr*Math.cos(t),y:c.y+rr*Math.sin(t)};});
const route=(id,points)=>({id,type:'curve',x:points[0].x,y:points[0].y,points,color:'#15803d',motion:'forward'});
const tire={id:'t',type:'tire',x:240,y:300,color:'#111827'};
const approach=()=>route('r',[{x:80,y:600},{x:90,y:540},{x:100,y:480},{x:160,y:380},...arc(tire,50,Math.PI,2*Math.PI),{x:320,y:380},{x:350,y:450},{x:380,y:500}]);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),plain=v=>JSON.parse(JSON.stringify(v));
test('a drawn approach is interpreted as a fixed pass point followed by a circular rounding',()=>{
 const r=approach(),pass={id:'p',type:'pass',x:100,y:480,x2:40,y2:480,color:'#2563eb'},result=api.plan([r,tire,pass]),fit=result.plans.get('r');assert.ok(fit);assert.equal(fit.routeStyle,'planned');assert.deepEqual(plain(fit.points[0]),r.points[0]);assert.deepEqual(plain(fit.points[1]),{x:100,y:480});assert.deepEqual(plain(fit.points.at(-1)),r.points.at(-1));
 const radius=13+result.clearance,rounding=fit.points.filter(p=>Math.abs(dist(p,tire)-radius)<1e-7);assert.ok(rounding.length>=12);assert.ok(rounding.every(p=>p.y<=tire.y));assert.equal(pass.x,100);
});
test('successive tires and cones share clearance with a straight tangent between them',()=>{
 const a={id:'a',type:'tire',x:140,y:400},b={id:'b',type:'cone',x:330,y:400},r=route('r',[{x:50,y:300},...arc(a,40,Math.PI,0),{x:240,y:400},...arc(b,55,Math.PI,2*Math.PI),{x:430,y:500}]),result=api.plan([r,a,b]),fit=result.plans.get('r');assert.ok(fit);
 const ra=13+result.clearance,rb=14+result.clearance,aa=fit.points.map((p,i)=>({p,i})).filter(({p})=>Math.abs(dist(p,a)-ra)<1e-6),bb=fit.points.map((p,i)=>({p,i})).filter(({p})=>Math.abs(dist(p,b)-rb)<1e-6);assert.ok(aa.length>=8&&bb.length>=8);assert.ok(Math.abs((dist(aa[3].p,a)-13)-(dist(bb[3].p,b)-14))<1e-6);assert.equal(bb[0].i,aa.at(-1).i+1);
 const p=aa.at(-1).p,q=bb[0].p,v={x:q.x-p.x,y:q.y-p.y};assert.ok(Math.abs((p.x-a.x)*v.x+(p.y-a.y)*v.y)<1e-5);assert.ok(Math.abs((q.x-b.x)*v.x+(q.y-b.y)*v.y)<1e-5);
});
test('closed loops become circular and keep their turning direction',()=>{
 for(const dir of [-1,1]){const points=arc({x:240,y:430},48,0,dir*Math.PI*2,40);points[points.length-1]={...points[0]};const marker={...tire,y:430},r=route('r',points),result=api.plan([r,marker]),fit=result.plans.get('r');assert.ok(fit);const distances=fit.points.map(p=>dist(p,marker));assert.ok(Math.max(...distances)-Math.min(...distances)<1e-6);const cross=(fit.points[0].x-marker.x)*(fit.points[1].y-marker.y)-(fit.points[0].y-marker.y)*(fit.points[1].x-marker.x);assert.equal(Math.sign(cross),dir);assert.deepEqual(plain(fit.points.at(-1)),plain(fit.points[0]));}
});
test('a pass-only waypoint remains exact when the approach is straightened',()=>{
 const r=route('r',[{x:100,y:600},{x:112,y:530},{x:100,y:460},{x:120,y:380},{x:100,y:300}]),pass={id:'p',type:'pass',x:100,y:460,x2:35,y2:460};const fit=api.plan([r,pass]).plans.get('r');assert.ok(fit);assert.ok(fit.points.some(p=>p.x===100&&p.y===460));assert.equal(fit.points.length,3);
});
test('an unrelated stroke without rounding marks or passes is not reinterpreted',()=>{
 const r=route('r',[{x:100,y:100},{x:100,y:200},{x:200,y:200}]),before=JSON.stringify(r);assert.equal(api.plan([r]).plans.size,0);assert.equal(JSON.stringify(r),before);
});
test('planned circular geometry survives a fresh interpretation without losing its radius',()=>{
 const first=api.plan([approach(),tire]),fit=first.plans.get('r');assert.ok(fit);const second=api.plan([fit,tire]);assert.ok(second.plans.get('r'));assert.ok(Math.abs(second.clearance-first.clearance)<.2);
});

test('separate circles around cones and tires use the same shared clearance',()=>{
 const a={id:'a',type:'tire',x:110,y:300},b={id:'b',type:'cone',x:330,y:600};const pa=arc(a,35,0,Math.PI*2,40),pb=arc(b,55,0,-Math.PI*2,40);pa[pa.length-1]={...pa[0]};pb[pb.length-1]={...pb[0]};const result=api.plan([route('ra',pa),route('rb',pb),a,b]),ra=result.plans.get('ra'),rb=result.plans.get('rb');assert.ok(ra&&rb);assert.ok(Math.abs((dist(ra.points[5],a)-13)-(dist(rb.points[5],b)-14))<1e-6);
});

test('an open rounding remains an arc, never completed to a full circle',()=>{
 const r=route('partial',[{x:100,y:400},...arc(tire,50,Math.PI,2*Math.PI),{x:380,y:400}]),fit=api.plan([r,tire]).plans.get(r.id);assert.ok(fit);assert.deepEqual(plain(fit.points[0]),r.points[0]);assert.deepEqual(plain(fit.points.at(-1)),r.points.at(-1));assert.ok(dist(fit.points[0],fit.points.at(-1))>200);
});

test('a figure eight touching the exact same crossing vertex is protected',()=>{
 const r={...route('8',[{x:200,y:400},{x:100,y:300},{x:100,y:500},{x:200,y:400},{x:300,y:300},{x:300,y:500},{x:200,y:400}]),routeStyle:'planned'};assert.equal(api.hasRouteFeatures(r),true);assert.equal(api.plan([r,tire]).plans.size,0);
});
test('the photographed three-tire route becomes three equal-radius turns joined by tangents',()=>{
 const marks=threeTireRoute(),[r,...tires]=marks,before=JSON.stringify(marks),fit=api.plan(marks).plans.get(r.id);assert.ok(fit);assert.equal(fit.routeStyle,'planned');assert.deepEqual(plain(fit.points[0]),r.points[0]);assert.deepEqual(plain(fit.points.at(-1)),r.points.at(-1));
 const arcs=[tires[2],tires[0],tires[1]].map(t=>{const radius=Math.min(...fit.points.map(p=>dist(p,t)));const pts=fit.points.map((p,i)=>({p,i})).filter(({p})=>Math.abs(dist(p,t)-radius)<1e-6);assert.ok(pts.length>=8);return {t,radius,pts};});
 assert.ok(Math.max(...arcs.map(a=>a.radius))-Math.min(...arcs.map(a=>a.radius))<1e-6);
 for(let i=1;i<arcs.length;i++){const a=arcs[i-1],b=arcs[i];assert.equal(b.pts[0].i,a.pts.at(-1).i+1);const p=a.pts.at(-1).p,q=b.pts[0].p,v={x:q.x-p.x,y:q.y-p.y};assert.ok(Math.abs((p.x-a.t.x)*v.x+(p.y-a.t.y)*v.y)<1e-5);assert.ok(Math.abs((q.x-b.t.x)*v.x+(q.y-b.t.y)*v.y)<1e-5);}
 assert.ok(arcs[0].pts.some(({p})=>p.y>arcs[0].t.y+arcs[0].radius*.9));assert.ok(arcs[1].pts.some(({p})=>p.y<arcs[1].t.y-arcs[1].radius*.9));assert.ok(arcs[2].pts.some(({p})=>p.y>arcs[2].t.y+arcs[2].radius*.9));assert.equal(JSON.stringify(marks),before);
});
test('hand-drawn circles around every printed rink circle and faceoff dot become concentric',()=>{
 for(const landmark of api.rinkLandmarks)for(const dir of [-1,1]){
  const radius=landmark.circleRadius||35,points=arc(landmark,radius,0,dir*Math.PI*2,48);points[points.length-1]={...points[0]};const r=route('reference',points),fit=api.plan([r]).plans.get(r.id);assert.ok(fit,landmark.id);
  const radii=fit.points.map(p=>dist(p,landmark));assert.ok(Math.max(...radii)-Math.min(...radii)<1e-6,landmark.id);assert.deepEqual(plain(fit.points[0]),points[0]);assert.deepEqual(plain(fit.points.at(-1)),points.at(-1));
  const cross=(fit.points[0].x-landmark.x)*(fit.points[1].y-landmark.y)-(fit.points[0].y-landmark.y)*(fit.points[1].x-landmark.x);assert.equal(Math.sign(cross),dir);
 }
});
test('open turns around printed circles and dots stay open with fixed approach and exit',()=>{
 for(const center of api.rinkLandmarks){
  const radius=center.circleRadius||35,points=[{x:center.x-radius-15,y:center.y+100},...arc(center,radius,Math.PI,2*Math.PI,32),{x:center.x+radius+15,y:center.y+100}],r=route('open',points),fit=api.plan([r]).plans.get(r.id);assert.ok(fit,center.id);assert.deepEqual(plain(fit.points[0]),points[0]);assert.deepEqual(plain(fit.points.at(-1)),points.at(-1));assert.ok(dist(fit.points[0],fit.points.at(-1))>50);const fittedRadius=center.circleRadius||Math.min(...fit.points.map(p=>dist(p,center)));assert.ok(Math.abs(fittedRadius-radius)<10);assert.ok(fit.points.filter(p=>Math.abs(dist(p,center)-fittedRadius)<1e-6).length>=8,center.id);
 }
});

test('a rounding starting directly on the arc is fitted without requiring a tangent approach',()=>{
 const center={id:'direct-tire',type:'tire',x:240,y:300};for(const radius of [30,40,60]){const points=arc(center,radius,Math.PI,2*Math.PI,44),r=route('direct',points),fit=api.plan([r,center]).plans.get(r.id);assert.ok(fit);assert.deepEqual(plain(fit.points[0]),points[0]);assert.deepEqual(plain(fit.points.at(-1)),points.at(-1));const radii=fit.points.slice(1,-1).map(p=>dist(p,center));assert.ok(Math.max(...radii)-Math.min(...radii)<1e-6);assert.ok(fit.points.every(p=>p.y<=center.y+1e-6));}
});

// A tire-only fit previously skipped the entire later faceoff-circle rounding.
test('one stroke keeps both its equipment rounding and its printed-circle rounding',()=>{
 const equipment={id:'mixed-tire',type:'tire',x:128,y:300},center=api.rinkLandmarks.find(p=>p.x===353&&p.y===698);
 const points=[{x:40,y:400},...arc(equipment,40,Math.PI,2*Math.PI,32),{x:240,y:480},...arc(center,70,Math.PI,0,32),{x:440,y:600}];
 const r=route('mixed',points),marks=[r,equipment],before=JSON.stringify(marks),fit=api.plan(marks).plans.get(r.id);assert.ok(fit);
 assert.deepEqual(plain(fit.points[0]),points[0]);assert.deepEqual(plain(fit.points.at(-1)),points.at(-1));
 assert.ok(fit.points.filter(p=>Math.abs(dist(p,center)-70)<1e-6).length>=12,'the faceoff circle must not become a straight shortcut');
 assert.ok(fit.points.filter(p=>Math.abs(dist(p,equipment)-Math.min(...fit.points.map(q=>dist(q,equipment))))<1e-6).length>=8);
 assert.equal(JSON.stringify(marks),before);
});
test('an equipment rounding and later rounding around a neutral-zone faceoff dot are fitted together',()=>{
 const equipment={id:'mixed-cone',type:'cone',x:128,y:300},center=api.rinkLandmarks.find(p=>p.x===353&&p.y===525);
 const points=[{x:40,y:400},...arc(equipment,40,Math.PI,2*Math.PI,32),{x:240,y:480},...arc(center,35,Math.PI,0,32),{x:440,y:450}],r=route('mixed-dot',points),fit=api.plan([r,equipment]).plans.get(r.id);assert.ok(fit);
 const radius=Math.min(...fit.points.map(p=>dist(p,center)));assert.ok(Math.abs(radius-35)<8);
 assert.ok(fit.points.filter(p=>Math.abs(dist(p,center)-radius)<1e-6).length>=12);
 assert.deepEqual(plain(fit.points[0]),points[0]);assert.deepEqual(plain(fit.points.at(-1)),points.at(-1));
});
