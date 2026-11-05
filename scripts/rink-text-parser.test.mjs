import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../rink-text-parser.js',import.meta.url),'utf8'),context={};vm.runInNewContext(source,context);
const {parse,location,rink,gridPoint}=context.NskRinkTextParser;
const xy=p=>p&&[p.x,p.y];
test('numbered cells place equipment and start the next movement',()=>{
 const r=parse('1 däck, sju däck, 9 start. Åk till ruta 8.');
 assert.equal(r.warnings.length,0);
 const [first,second,start,route]=r.marks;
 assert.deepEqual(Array.from(r.marks,m=>m.type),['tire','tire','player','skate']);
 assert.deepEqual(xy(first),xy(gridPoint(1)));
 assert.deepEqual(xy(second),xy(gridPoint(7)));
 assert.deepEqual(xy(start),xy(gridPoint(9)));
 assert.deepEqual(xy(route),xy(start));
 assert.deepEqual([route.x2,route.y2],xy(gridPoint(8)));
 assert.ok(gridPoint(1).x<gridPoint(9).x&&gridPoint(1).y<gridPoint(9).y);
 assert.equal(parse('10 däck').marks.length,0);
 assert.match(parse('10 däck').warnings[0],/mellan 1 och 9/);
});
test('named landmarks align with the portrait rink image',()=>{
 const cases=[['mellan blålinjerna',240,430],['mittpunkten',240,430],['övre blålinjen',240,301],['nedre blålinjen',240,559],['övre mållinjen',240,78],['nedre mållinjen',240,786],['vänstra tekningspunkten i anfallszon',128,164],['högra tekningscirkeln i försvarszon',353,698],['övre vänstra tekningspunkten i mittzon',128,331],['nedre högra tekningspunkten i mittzon',353,525],['vänster långsarg i höjd med övre blålinjen',50,301],['rödlinjen vid höger långsarg',435,430],['mellan mittpunkten och övre blålinjen',240,365.5]];
 for(const [name,x,y] of cases)assert.deepEqual(xy(location(name)),[x,y],name);
 assert.equal(rink.width,480);assert.equal(rink.height,860);
});
test('hockey zones, slot depth, creases, goal aliases and player roles have distinct positions',()=>{
 for(const name of ['försvarszon','mittzon','anfallszon','vänsterback i anfallszon','högerforward i anfallszon','center i försvarszon','övre vänstra hörnet','nedre höger kortsarg'])assert.ok(location(name),name);
 assert.deepEqual(xy(location('framför kassen i anfallszon')),[240,106]);
 assert.deepEqual(xy(location('bakom eget mål')),[240,820]);
 assert.ok(location('höga slottet i anfallszon').y>location('låga slottet i anfallszon').y);
 assert.deepEqual(xy(location('målgården i försvarszon')),[240,758]);
});
test('ambiguous locations and missing players produce warnings rather than guessed marks',()=>{
 for(const description of ['En spelare vid vänstra tekningspunkten.','En kon vid blålinjen.','En puck i hörnet.','En spelare i båset.','Spelare 9 åker framåt.','Sväng.']){const result=parse(description);assert.equal(result.marks.length,0,description);assert.ok(result.warnings.length,description);}
});
test('each goal, each blue line and paired defenders are distributed to actual rink features',()=>{
 const g=parse('En målvakt i varje mål.');assert.equal(g.marks.length,2);assert.ok(g.marks[0].y<110&&g.marks[1].y>750);
 const cones=parse('En kon på vardera blålinjen vid höger långsarg.');assert.deepEqual(cones.marks.map(m=>m.y).join(','),'301,559');assert.ok(cones.marks.every(m=>m.x===435));
 const backs=parse('Två backar på blålinjen i anfallszon.');assert.deepEqual(backs.marks.map(m=>m.x).join(','),'128,353');assert.ok(backs.marks.every(m=>m.y===301));
});
test('forward, left/right turns and backwards form a connected route with preserved skating mode',()=>{
 for(const [turn,x] of [['vänster',120],['höger',360]]){
  const r=parse('En spelare i mittcirkeln. Åk framåt, sväng '+turn+', åk bakåt.');assert.equal(r.warnings.length,0);assert.equal(r.marks.length,4);
  const [player,forward,curve,backward]=r.marks;assert.equal(forward.y2,310);assert.equal(curve.type,'curve');assert.equal(curve.x2,x);assert.ok(curve.points.some(p=>p.y!==310));assert.equal(backward.motion,'backward');assert.equal(backward.x,curve.x2);assert.equal(backward.x2,240);assert.equal(player.x,240);
 }
});
test('rounding circles, numbered cones, slalom, stops and crossovers produce editable paths',()=>{
 const circle=parse('Åkning runt vänstra tekningscirkeln i anfallszon medurs.');assert.equal(circle.warnings.length,0);assert.equal(circle.marks[0].type,'curve');assert.equal(circle.marks[0].points.length,33);
 const cone=parse('En kon i mittcirkeln. Åk runt kon 1.');assert.equal(cone.marks.at(-1).type,'curve');assert.equal(cone.warnings.length,0);
 const r=parse('En spelare vid nedre blålinjen. Åk slalom till övre blålinjen. Stanna. Åk med översteg till mittpunkten.');assert.equal(r.warnings.length,0);assert.equal(r.marks[1].type,'curve');assert.equal(r.marks[2].movementLabel,'Stopp');assert.equal(r.marks[3].movementLabel,'Översteg');
});
test('player references continue at their last destination and shots differ from passes',()=>{
 const r=parse('Spelare 1 i mittcirkeln. Spelare 1 åker till övre blålinjen. Spelare 1 åker bakåt till mittpunkten. Passning från mittpunkten till övre vänstra hörnet. Skott från slottet i anfallszon till motståndarmålet.');assert.equal(r.warnings.length,0);assert.equal(r.marks[2].y,301);assert.equal(r.marks[2].motion,'backward');assert.equal(r.marks[3].type,'pass');assert.equal(r.marks[4].type,'shot');assert.equal(r.marks[4].y2,78);
});
test('multiple goals have placement, orientation and explicit numbered shot targets',()=>{
 const r=parse('Ett mål i mittcirkeln vänt åt vänster. Skott från nedre vänstra hörnet till mål 1.');assert.equal(r.warnings.length,0);assert.equal(r.marks[0].type,'goal');assert.deepEqual(xy(r.marks[0]),[240,430]);assert.equal(r.marks[0].angle,90);assert.deepEqual([r.marks[1].x2,r.marks[1].y2],[240,430]);
 const goals=parse('Tre mål vid övre blålinjen.');assert.equal(goals.marks.length,3);assert.ok(goals.marks.every(m=>m.type==='goal'));assert.equal(new Set(goals.marks.map(m=>m.x)).size,3);
 const moved=parse('Skott från mittpunkten till mål 1.','#b11226',{goals:[{x:100,y:200,angle:90}]});assert.deepEqual([moved.marks[0].x2,moved.marks[0].y2],[100,200]);
});
test('newlines delimit commands, object limits and coordinates remain safe',()=>{
 const r=parse('En puck i mittpunkten\nEn kon i nedre vänstra hörnet');assert.equal(r.marks.length,2);
 const lots=parse(Array(30).fill('16 spelare i övre högra hörnet.').join(' '));assert.equal(lots.marks.length,150);assert.ok(lots.warnings.length);assert.ok(lots.marks.every(m=>m.x>=22&&m.x<=458&&m.y>=22&&m.y<=838));
});

test('goalkeepers follow moved and rotated goals rather than the printed creases',()=>{
 const r=parse('En målvakt i varje mål.','#b11226',{goals:[{x:150,y:300,angle:90},{x:320,y:550,angle:270}]});
 assert.equal(r.marks.length,2);assert.deepEqual(xy(r.marks[0]),[132,300]);assert.deepEqual(xy(r.marks[1]),[338,550]);
});

test('imperative instructions support turning, rounding and shooting',()=>{
 const r=parse('En spelare i mittcirkeln. Vänd. Skjut mot övre målet.');assert.equal(r.warnings.length,0);assert.equal(r.marks[1].type,'curve');assert.equal(r.marks[2].type,'shot');
 const cone=parse('En kon i mittcirkeln. Runda kon 1.');assert.equal(cone.warnings.length,0);assert.equal(cone.marks.at(-1).type,'curve');
});

test('spoken turn commands preserve the approach and treat left and right as directions',()=>{
 for(const side of ['vänster','höger']){
  const expected=parse('En spelare i mittcirkeln. Åk framåt. Sväng '+side+'. Åk bakåt.');
  const spoken=parse('En spelare i mittcirkeln. Åk framåt och sen sväng till '+side+' och sen åk bakåt.');
  assert.deepEqual(spoken,expected);
  assert.deepEqual(Array.from(spoken.marks,mark=>mark.type),['player','skate','curve','skate']);
  assert.equal(spoken.warnings.length,0);
 }
});

test('text-generated skating uses direction colors while passes and shots retain their own styles',()=>{
 const r=parse('En spelare i mittcirkeln. Åk framåt. Åk bakåt. Passning från mittpunkten till övre blålinjen. Skott från slottet i anfallszon till övre målet.');assert.equal(r.warnings.length,0);assert.equal(r.marks[1].color,'#111827');assert.equal(r.marks[2].color,'#7c3aed');assert.equal(r.marks[3].color,'#2563eb');assert.equal(r.marks[4].type,'shot');assert.equal(r.marks[4].color,'#b11226');
});

test('natural instructions keep the player position through equipment and implicit movement',()=>{
 const r=parse('Spelare 1 börjar i mittcirkeln och åker till övre blålinjen. En kon i nedre vänstra hörnet. Åk framåt. Spelare 1 skjuter mot övre målet.');
 assert.equal(r.warnings.length,0);
 const [player,approach,cone,next,shot]=r.marks;
 assert.equal(cone.type,'cone');
 assert.equal(approach.y,player.y);
 assert.equal(next.y,approach.y2);
 assert.equal(shot.type,'shot');
 assert.equal(shot.y,next.y2);
});

test('a player named as the pass recipient does not become the passer',()=>{
 const r=parse('Spelare 2 vid nedre blålinjen. Spelare 1 i mittcirkeln. Passa till spelare 2.');
 assert.equal(r.warnings.length,0);
 const [recipient,passer,pass]=r.marks;
 assert.equal(pass.type,'pass');
 assert.equal(pass.y,passer.y);
 assert.equal(pass.y2,recipient.y);
});
