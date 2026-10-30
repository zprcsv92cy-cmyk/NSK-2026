import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../rink-drawer.js',import.meta.url),'utf8');
const context={document:{addEventListener(){}},window:{},Blob};
vm.runInNewContext(code.replace(/\}\)\(\);\s*$/,'window.testLayout={tidyLayout};})();'),context);
const tidy=marks=>JSON.parse(JSON.stringify(context.window.testLayout.tidyLayout(marks)));
const cone=(id,x,y)=>({id,type:'cone',x,y,color:'#b11226'});
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
 const path={id:'p',type:'skate',x:100,y:200,x2:300,y2:200,color:'#b11226',motion:'backward'},player={id:'a',type:'player',x:200,y:180,color:'#b11226',number:'7'},r=tidy([path,player]);assert.ok(r[0].labelOffset);assert.deepEqual(r[1],player);assert.equal(r[0].x,100);assert.equal(r[0].x2,300);
});
test('empty and tidy drawings remain unchanged',()=>{assert.deepEqual(tidy([]),[]);const a=[cone('a',100,200),cone('b',150,200),cone('c',200,200)];assert.deepEqual(tidy(a),a);});

test('faster sparse hand-drawn jitter is visibly straightened rather than skipped',()=>{
 const path={id:'p',type:'curve',x:80,y:400,color:'#15803d',points:[{x:80,y:400},{x:125,y:410},{x:170,y:392},{x:215,y:409},{x:270,y:400}]};const r=tidy([path])[0];assert.equal(r.points.length,2);assert.deepEqual(r.points[0],path.points[0]);assert.deepEqual(r.points.at(-1),path.points.at(-1));
});
test('both ends of a curved route follow their adjusted equipment anchors',()=>{
 const row=[cone('a',100,300),{...cone('b',135,312),type:'tire'},cone('c',220,300)],path={id:'p',type:'curve',x:135,y:312,color:'#15803d',points:[{x:135,y:312},{x:170,y:390},{x:220,y:300}]};const r=tidy([...row,path]),route=r[3];assert.deepEqual(route.points[0],{x:r[1].x,y:r[1].y});assert.deepEqual(route.points.at(-1),{x:r[2].x,y:r[2].y});
});
