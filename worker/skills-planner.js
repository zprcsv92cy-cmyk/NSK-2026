// Private planning inputs remain on the server. Scores are never part of shared groups/schedules.
export const SKILL_GROUPS=Object.freeze([
 {key:'skating',name:'Skridskoåkning',color:'#36a4f4',items:[['forward','Framåtåkning'],['backward','Bakåtåkning'],['balance','Balans och kroppskontroll'],['turns','Svängar och översteg'],['acceleration','Start, stopp och acceleration']]},
 {key:'stick',name:'Klubbteknik',color:'#ff3b61',items:[['puck','Puckkontroll'],['dribble','Dribbla i fart'],['pass','Passningsteknik'],['receive','Ta emot passningar'],['shot','Skotteknik']]},
 {key:'game',name:'Spelförståelse',color:'#40d58d',items:[['space','Hitta fria ytor'],['position','Positionering'],['decisions','Beslutsfattande'],['attack_defend','Förstå anfall och försvar']]},
 {key:'team',name:'Lagspel',color:'#aa72f3',items:[['cooperate','Samarbete'],['communicate','Kommunikation'],['support','Hjälpa lagkamrater']]},
 {key:'attitude',name:'Inställning',color:'#ff9b39',items:[['effort','Träningsvilja'],['courage','Mod att prova nya saker'],['focus','Koncentration']]}
]);
export const SKILL_KEYS=SKILL_GROUPS.flatMap(g=>g.items.map(([key])=>key));
const weights=[.3,.25,.2,.1,.15];
const average=values=>values.reduce((a,b)=>a+b,0)/values.length;
const vector=card=>SKILL_GROUPS.map(g=>average(g.items.map(([key])=>card?.ratings?.[key]??5.5)));
function rng(seed){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
const shuffled=(items,random)=>{const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};
function groupCost(groups,vectors,target){
 return groups.reduce((sum,group)=>sum+(group.length?weights.reduce((cost,w,k)=>cost+w*(average(group.map(id=>vectors.get(id)[k]))-target[k])**2,0):0),0);
}
function matchCost(groups,vectors,target){
 let result=groupCost(groups,vectors,target);const pairs=new Map();
 for(const group of groups){
  for(let k=0;k<3;k++)result+=(10-Math.max(...group.map(id=>vectors.get(id)[k])))*.035;
  for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const key=[group[i],group[j]].sort().join(':');pairs.set(key,(pairs.get(key)||0)+1);}
 }
 for(const count of pairs.values())result+=Math.max(0,count-1)**2*.012;
 return result;
}
export function planSkills({playerIds,goalieIds=[],mode,groupCount=3,playersOnField=3,shiftCount=10},cards={},seed=1){
 const ids=playerIds.filter(id=>!goalieIds.includes(id)),random=rng(seed),vectors=new Map(ids.map(id=>[id,vector(cards[id])])),target=SKILL_GROUPS.map((_,k)=>average(ids.map(id=>vectors.get(id)[k])));
 const order=shuffled(ids,random);let groups;
 if(mode==='training'){
  order.sort((a,b)=>average(vectors.get(b))-average(vectors.get(a)));
  groups=Array.from({length:groupCount},()=>[]);order.forEach((id,i)=>{const turn=Math.floor(i/groupCount);groups[turn%2?groupCount-1-i%groupCount:i%groupCount].push(id);});
 }else{
  const appearances=new Map(ids.map(id=>[id,0]));groups=[];
  for(let i=0;i<shiftCount;i++){
   const line=[];
   for(let j=0;j<playersOnField;j++){
    const available=shuffled(order.filter(id=>!line.includes(id)),random).sort((a,b)=>appearances.get(a)-appearances.get(b));
    const floor=appearances.get(available[0]),choices=available.filter(id=>appearances.get(id)===floor);
    choices.sort((a,b)=>groupCost([[...line,a]],vectors,target)-groupCost([[...line,b]],vectors,target));
    const pick=choices[0];line.push(pick);appearances.set(pick,appearances.get(pick)+1);
   }groups.push(line);
  }
 }
 const cost=mode==='training'?groupCost:matchCost;
 let best=cost(groups,vectors,target);
 // Swaps preserve exact group sizes and each player's total number of shifts.
 for(let step=0,limit=mode==='training'?450:Math.max(50,Math.floor(5000/(shiftCount*playersOnField)));step<limit;step++){
  const a=Math.floor(random()*groups.length),b=Math.floor(random()*groups.length);if(a===b||!groups[a].length||!groups[b].length)continue;
  const ai=Math.floor(random()*groups[a].length),bi=Math.floor(random()*groups[b].length),x=groups[a][ai],y=groups[b][bi];
  if(x===y||groups[a].includes(y)||groups[b].includes(x))continue;
  [groups[a][ai],groups[b][bi]]=[y,x];const next=cost(groups,vectors,target);
  if(next+1e-8<best)best=next;else [groups[a][ai],groups[b][bi]]=[x,y];
 }
 const appearances=Object.fromEntries(ids.map(id=>[id,groups.filter(group=>group.includes(id)).length]));
 const incomplete=ids.filter(id=>SKILL_KEYS.some(key=>cards[id]?.ratings?.[key]==null));
 return {mode,groups,goalieIds:[...goalieIds],appearances,incomplete,version:1};
}
