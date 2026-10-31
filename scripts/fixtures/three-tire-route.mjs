// Digitized interpretation of the user's photographed route: right below,
// upper above, left below. The large lower-left loop is intentionally uneven.
export function threeTireRoute(){
 const points=[];let last={x:424,y:150};points.push(last);
 const line=(x,y)=>{last={x,y};points.push(last);};
 const curve=(a,b,end)=>{const start=last;for(let i=1;i<=24;i++){const t=i/24,u=1-t;points.push({x:u*u*u*start.x+3*u*u*t*a.x+3*u*t*t*b.x+t*t*t*end.x,y:u*u*u*start.y+3*u*u*t*a.y+3*u*t*t*b.y+t*t*t*end.y});}last=end;};
 line(424,420);
 curve({x:424,y:470},{x:295,y:535},{x:316,y:435});
 curve({x:323,y:390},{x:376,y:294},{x:371,y:266});
 curve({x:363,y:220},{x:269,y:220},{x:251,y:284});
 curve({x:230,y:325},{x:309,y:395},{x:263,y:455});
 curve({x:227,y:510},{x:169,y:570},{x:119,y:515});
 curve({x:65,y:458},{x:132,y:391},{x:145,y:334});
 const tires=[{id:'upper',type:'tire',x:287,y:291,color:'#111827'},{id:'left',type:'tire',x:240,y:390,color:'#111827'},{id:'right',type:'tire',x:348,y:390,color:'#111827'}];
 return [{id:'route',type:'curve',...points[0],points,color:'#111827',motion:'forward'},...tires];
}
