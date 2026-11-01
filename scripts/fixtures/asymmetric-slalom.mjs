// Unevenly spaced tires and a deliberately shaky touch stroke, not a fitted route.
export function asymmetricSlalom({jitter=12,density=40}={}){
 const tires=[[200,250],[120,350],[220,460],[135,560],[200,690]].map(([x,y],i)=>({id:'asym-tire-'+i,type:'tire',x,y,color:'#111827'}));
 const anchors=[{x:200,y:150},{x:265,y:250},{x:55,y:350},{x:285,y:460},{x:70,y:560},{x:265,y:690},{x:200,y:790}],points=[];
 for(let i=0;i<anchors.length-1;i++){
  const p0=anchors[Math.max(0,i-1)],p1=anchors[i],p2=anchors[i+1],p3=anchors[Math.min(anchors.length-1,i+2)];
  for(let k=0;k<density;k++){const t=k/density,t2=t*t,t3=t2*t,n=points.length;
   points.push({x:.5*(2*p1.x+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3)+Math.sin(n*2.3)*jitter,y:.5*(2*p1.y+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)+Math.sin(n*1.8)*jitter*.5});
  }
 }
 points[0]=anchors[0];points.push(anchors.at(-1));
 return [{id:'asym-route',type:'curve',...points[0],points,color:'#111827',motion:'forward'},...tires];
}
