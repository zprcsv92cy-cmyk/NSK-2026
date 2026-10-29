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
test('only slightly uneven rows of matching symbols align, with endpoints kept fixed',()=>{
 const row=[cone('a',100,300),cone('b',146,303),cone('c',200,300)],r=tidy(row);assert.deepEqual(r[0],row[0]);assert.deepEqual(r[2],row[2]);assert.deepEqual([r[1].x,r[1].y],[150,300]);
 const deliberate=[cone('a',100,300),cone('b',125,303),cone('c',200,300)];assert.deepEqual(tidy(deliberate),deliberate);
 const different=[row[0],{...row[1],color:'#2563eb'},row[2]];assert.deepEqual(tidy(different),different);
});
test('connected row symbols, goals and goalie positions are never rearranged',()=>{
 const row=[cone('a',100,300),cone('b',146,303),cone('c',200,300)],line={id:'p',type:'skate',x:146,y:303,x2:146,y2:450,color:'#b11226'},goal={id:'g',type:'goal',x:240,y:78,angle:90,color:'#b11226'},goalie={id:'q',type:'goalie',x:240,y:110,color:'#2563eb'};const r=tidy([...row,line,goal,goalie]);assert.deepEqual(r[1],row[1]);assert.deepEqual(r[3],line);assert.deepEqual(r[4],goal);assert.deepEqual(r[5],goalie);
});
test('overlapping generated captions move without changing the exercise symbols',()=>{
 const path={id:'p',type:'skate',x:100,y:200,x2:300,y2:200,color:'#b11226',motion:'backward'},player={id:'a',type:'player',x:200,y:180,color:'#b11226',number:'7'},r=tidy([path,player]);assert.ok(r[0].labelOffset);assert.deepEqual(r[1],player);assert.equal(r[0].x,100);assert.equal(r[0].x2,300);
});
test('empty and tidy drawings remain unchanged',()=>{assert.deepEqual(tidy([]),[]);const a=[cone('a',100,200),cone('b',150,200),cone('c',200,200)];assert.deepEqual(tidy(a),a);});
