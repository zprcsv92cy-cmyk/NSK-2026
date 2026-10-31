import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
