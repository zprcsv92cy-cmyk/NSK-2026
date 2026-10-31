import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../rink-drawer.js',import.meta.url),'utf8');
const context={document:{addEventListener(){}},window:{},Blob};
vm.runInNewContext(fs.readFileSync(new URL('../rink-route-planner.js',import.meta.url),'utf8'),context);
vm.runInNewContext(code.replace(/\}\)\(\);\s*$/,'window.testLayout={tidyLayout,preservesObstacleSide,renderedRoute,routeDistance};})();'),context);
const tidy=marks=>JSON.parse(JSON.stringify(context.window.testLayout.tidyLayout(marks)));
const cone=(id,x,y)=>({id,type:'cone',x,y,color:'#b11226'});
test('direction changes pin the shared point while jitter on each side is tidied',()=>{
 const forward={id:'a',type:'curve',routeStyle:'planned',directionBoundary:true,motion:'forward',x:80,y:400,color:'#111827',points:[{x:80,y:400},{x:120,y:406},{x:160,y:394},{x:200,y:400}]};
 const backward={...forward,id:'b',motion:'backward',color:'#7c3aed',x:200,y:400,points:[{x:200,y:400},{x:240,y:406},{x:280,y:394},{x:320,y:400}]};
 const result=tidy([forward,backward]);
 for(let i=0;i<2;i++){const original=[forward,backward][i];assert.equal(result[i].points.length,2);assert.deepEqual(result[i].points[0],original.points[0]);assert.deepEqual(result[i].points.at(-1),original.points.at(-1));assert.equal(result[i].motion,original.motion);assert.equal(result[i].color,original.color);assert.equal(result[i].routeStyle,'planned');assert.equal(result[i].directionBoundary,true);}
 assert.deepEqual(result[0].points.at(-1),result[1].points[0]);
});
test('a direction boundary still protects an intentional return and crossing',()=>{
 const route={id:'r',type:'curve',routeStyle:'planned',directionBoundary:true,motion:'backward',color:'#7c3aed',x:100,y:300,points:[{x:100,y:300},{x:200,y:400},{x:300,y:300},{x:300,y:400},{x:200,y:300},{x:100,y:400}]};
 assert.deepEqual(tidy([route]),[route]);
 const returning={...route,points:[{x:100,y:300},{x:300,y:300},{x:102,y:305}]};assert.deepEqual(tidy([returning]),[returning]);
});
test('jitter is removed on both sides of a pinned return after a direction change',()=>{
 const points=[{x:80,y:400},{x:120,y:405},{x:160,y:395},{x:200,y:400},{x:160,y:420},{x:120,y:414},{x:80,y:420}],route={id:'return',type:'curve',routeStyle:'planned',directionBoundary:true,motion:'backward',color:'#7c3aed',...points[0],points};
 const result=tidy([route])[0];assert.ok(result.points.length<points.length);assert.deepEqual(result.points[0],points[0]);assert.deepEqual(result.points.at(-1),points.at(-1));assert.ok(result.points.some(p=>p.x===200&&p.y===400));assert.equal(result.motion,'backward');
});
test('passing points attached to a drawn route remain fixed during interpretation',()=>{
 const pass={id:'pass',type:'pass',x:100,y:480,x2:40,y2:482,color:'#2563eb'},points=[{x:80,y:600},{x:100,y:480},{x:150,y:300}],route={id:'r',type:'curve',...points[0],points,color:'#15803d'},result=tidy([route,pass]);
 assert.deepEqual(result[1],pass);assert.ok(result[0].points.some(p=>p.x===100&&p.y===480));
});
test('straight freehand jitter is removed without changing endpoints, arrows or metadata',()=>{
 const path={id:'p',type:'curve',x:100,y:200,x2:200,y2:200,color:'#2563eb',motion:'backward',movementLabel:'Stopp',points:[{x:100,y:200},{x:125,y:202},{x:150,y:198},{x:175,y:201},{x:200,y:200}]};const original=structuredClone(path),r=tidy([path])[0];
 assert.deepEqual(r.points,[{x:100,y:200},{x:200,y:200}]);assert.equal(r.motion,'backward');assert.equal(r.movementLabel,'Stopp');assert.equal(r.x2,200);assert.deepEqual(path,original);
});
test('intentional corners, slalom and closed loops preserve their shape',()=>{
 const corner={id:'p',type:'curve',x:100,y:100,color:'#b11226',points:[{x:100,y:100},{x:100,y:200},{x:200,y:200}]};assert.deepEqual(tidy([corner])[0],corner);
 const circle={...corner,points:Array.from({length:33},(_,i)=>({x:240+70*Math.cos(i/32*Math.PI*2),y:430+70*Math.sin(i/32*Math.PI*2)}))};circle.x=circle.points[0].x;circle.y=circle.points[0].y;const loop=tidy([circle])[0];assert.deepEqual(loop.points[0],circle.points[0]);assert.deepEqual(loop.points.at(-1),circle.points.at(-1));assert.ok(loop.points.length>=16);assert.ok(loop.points.every(p=>Math.hypot(p.x-240,p.y-430)>65));
});
test('near-horizontal unattached passes straighten while connected arrows stay fixed',()=>{
 const pass={id:'p',type:'pass',x:100,y:200,x2:240,y2:204,color:'#2563eb'};const r=tidy([pass])[0];assert.equal(r.y,202);assert.equal(r.y2,202);
 const anchored=tidy([pass,cone('a',100,200)]);assert.deepEqual(anchored[0],pass);
 const diagonal={...pass,y2:260};assert.deepEqual(tidy([diagonal])[0],diagonal);
});
test('equipment rows receive even distances within the original span',()=>{
 const row=[cone('a',100,300),cone('b',125,313),cone('c',220,300)],r=tidy(row);
 assert.equal(r[0].x,100);assert.equal(r[2].x,220);assert.equal(r[1].x,160);assert.ok(r.every(m=>m.y===r[0].y));
 const differentColors=[row[0],{...row[1],color:'#2563eb'},row[2]];assert.equal(tidy(differentColors)[1].x,160);
});
test('mixed cones and tires are evenly spaced in horizontal and vertical rows',()=>{
 const mixed=[cone('a',100,300),{...cone('b',135,312),type:'tire'},cone('c',220,300)];const horizontal=tidy(mixed);assert.equal(horizontal[1].x,160);assert.ok(horizontal.every(m=>m.y===horizontal[0].y));assert.equal(horizontal[1].type,'tire');
 const vertical=tidy(mixed.map(m=>({...m,x:m.y,y:m.x})));assert.equal(vertical[1].y,160);assert.ok(vertical.every(m=>m.x===vertical[0].x));
});
test('intentional non-row arrangements and equipment order remain intact',()=>{
 const triangle=[cone('a',100,300),{...cone('b',150,370),type:'tire'},cone('c',220,300)];const r=tidy(triangle);assert.deepEqual(r.map(m=>m.id),triangle.map(m=>m.id));assert.deepEqual(r,triangle);
});
test('connected lines follow adjusted row symbols while goals and goalies stay fixed',()=>{
 const row=[cone('a',100,300),cone('b',135,313),cone('c',220,300)],line={id:'p',type:'skate',x:135,y:313,x2:135,y2:450,color:'#b11226'},goal={id:'g',type:'goal',x:240,y:78,angle:90,color:'#b11226'},goalie={id:'q',type:'goalie',x:240,y:110,color:'#2563eb'};const r=tidy([...row,line,goal,goalie]);assert.equal(r[1].x,160);assert.deepEqual([r[3].x,r[3].y],[r[1].x,r[1].y]);assert.deepEqual([r[3].x2,r[3].y2],[135,450]);assert.deepEqual(r[4],goal);assert.deepEqual(r[5],goalie);
});
test('overlapping generated captions move without changing the exercise symbols',()=>{
 const path={id:'p',type:'skate',x:100,y:200,x2:300,y2:200,color:'#b11226',motion:'backward',movementLabel:'Stopp'},player={id:'a',type:'player',x:200,y:180,color:'#b11226',number:'7'},r=tidy([path,player]);assert.ok(r[0].labelOffset);assert.deepEqual(r[1],player);assert.equal(r[0].x,100);assert.equal(r[0].x2,300);
});
test('empty and tidy drawings remain unchanged',()=>{assert.deepEqual(tidy([]),[]);const a=[cone('a',100,200),cone('b',150,200),cone('c',200,200)];assert.deepEqual(tidy(a),a);});

test('faster sparse hand-drawn jitter is visibly straightened rather than skipped',()=>{
 const path={id:'p',type:'curve',x:80,y:400,color:'#15803d',points:[{x:80,y:400},{x:125,y:410},{x:170,y:392},{x:215,y:409},{x:270,y:400}]};const r=tidy([path])[0];assert.equal(r.points.length,2);assert.deepEqual(r.points[0],path.points[0]);assert.deepEqual(r.points.at(-1),path.points.at(-1));
});
test('both ends of a curved route follow their adjusted equipment anchors',()=>{
 const row=[cone('a',100,300),{...cone('b',135,312),type:'tire'},cone('c',220,300)],path={id:'p',type:'curve',x:135,y:312,color:'#15803d',points:[{x:135,y:312},{x:170,y:390},{x:220,y:300}]};const r=tidy([...row,path]),route=r[3];assert.deepEqual(route.points[0],{x:r[1].x,y:r[1].y});assert.deepEqual(route.points.at(-1),{x:r[2].x,y:r[2].y});
});

test('a small detour around a tire is never straightened through it, in any orientation',()=>{
 for(const turn of [0,1,2,3]){const rotate=p=>{let x=p.x-150,y=p.y-207;for(let k=0;k<turn;k++)[x,y]=[-y,x];return {x:x+240,y:y+430};};const points=[{x:100,y:200},{x:125,y:191},{x:150,y:190},{x:175,y:191},{x:200,y:200}].map(rotate),center=rotate({x:150,y:207}),path={id:'p',type:'curve',...points[0],color:'#15803d',points},tire={id:'t',type:'tire',...center,color:'#111827'},r=tidy([path,tire]);
 assert.ok(r[0].points.length>2);assert.deepEqual(r[0].points[0],points[0]);assert.deepEqual(r[0].points.at(-1),points.at(-1));assert.deepEqual(r[1],tire);
 assert.ok(context.window.testLayout.preservesObstacleSide(path,r[0],[tire]));
 }
});
test('a clear final path on the opposite side is rejected by the swept-side guard',()=>{
 const tire={id:'t',type:'tire',x:150,y:200,color:'#111827'},before={id:'p',type:'curve',x:100,y:200,color:'#15803d',points:[{x:100,y:200},{x:125,y:150},{x:175,y:150},{x:200,y:200}]},after={...before,points:before.points.map(p=>({x:p.x,y:400-p.y}))};
 assert.equal(context.window.testLayout.preservesObstacleSide(before,after,[tire]),false);
});
test('equipment that a route rounds stays put even in an otherwise uneven row',()=>{
 const tire={...cone('t',150,300),type:'tire'},row=[cone('a',100,300),tire,cone('b',240,300)],points=Array.from({length:33},(_,i)=>({x:150+30*Math.cos(i/32*Math.PI*2),y:300+30*Math.sin(i/32*Math.PI*2)})),path={id:'p',type:'curve',...points[0],color:'#15803d',points};const r=tidy([...row,path]);assert.deepEqual(r.slice(0,3),row);assert.ok(context.window.testLayout.preservesObstacleSide(path,r[3],row));
});
test('rounding direction cannot reverse around an obstacle',()=>{
 const tire={...cone('t',200,300),type:'tire'},points=Array.from({length:33},(_,i)=>({x:200+40*Math.cos(i/32*Math.PI*2),y:300+40*Math.sin(i/32*Math.PI*2)})),path={id:'p',type:'curve',...points[0],color:'#15803d',points},reversed={...path,points:[...points].reverse()};assert.equal(context.window.testLayout.preservesObstacleSide(path,reversed,[tire]),false);
});
test('safe smoothing away from equipment still improves jitter',()=>{
 const path={id:'p',type:'curve',x:100,y:200,color:'#15803d',points:[{x:100,y:200},{x:125,y:202},{x:150,y:198},{x:200,y:200}]};assert.equal(tidy([path,{...cone('t',400,700),type:'tire'}])[0].points.length,2);
});

test('moving an obstacle across an unchanged route is also rejected',()=>{
 const tire={...cone('t',120,300),type:'tire'},route={id:'p',type:'skate',x:150,y:100,x2:150,y2:500,color:'#15803d'};assert.equal(context.window.testLayout.preservesObstacleSide(route,route,[tire],[{...tire,x:180}]),false);
 const row=[cone('a',100,300),tire,cone('b',240,300)],r=tidy([...row,route]);assert.deepEqual(r.slice(0,3),row);assert.deepEqual(r[3],route);
});

test('protecting a tire detour still permits unrelated equipment spacing improvements',()=>{
 const tire={...cone('t',150,207),type:'tire'},points=[{x:100,y:200},{x:125,y:191},{x:150,y:190},{x:175,y:191},{x:200,y:200}],path={id:'p',type:'curve',...points[0],color:'#15803d',points},row=[cone('a',100,700),cone('b',130,710),cone('c',220,700)],r=tidy([path,tire,...row]);assert.deepEqual(r[0].points,points);assert.equal(r[3].x,160);assert.ok(r.slice(2).every(m=>m.y===r[2].y));
});

test('tidy preserves a figure-eight crossing and a deliberate return point exactly',()=>{
 const eight={id:'e',type:'curve',routeStyle:'planned',x:100,y:300,color:'#111827',points:[{x:100,y:300},{x:200,y:400},{x:300,y:300},{x:300,y:400},{x:200,y:300},{x:100,y:400}]},reverse={id:'r',type:'curve',routeStyle:'planned',x:100,y:600,color:'#111827',points:[{x:100,y:600},{x:300,y:600},{x:102,y:605}]};
 assert.deepEqual(tidy([eight,reverse]),[eight,reverse]);
});
