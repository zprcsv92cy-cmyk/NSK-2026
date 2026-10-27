// Three-way merge: only changes made since the caller's confirmed base are applied.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function mergeConcurrent(base,desired,current,resolveConflicts=false){
 if(same(desired,base))return structuredClone(current);
 if(same(current,base)||same(desired,current))return structuredClone(desired);
 if(object(base)&&object(desired)&&object(current)){
  return Object.fromEntries([...new Set([...Object.keys(current),...Object.keys(desired),...Object.keys(base)])].map(k=>[k,mergeConcurrent(base[k],desired[k],current[k],resolveConflicts)]).filter(([,v])=>v!==undefined));
 }
 const keyed=a=>Array.isArray(a)&&a.every(x=>object(x)&&typeof x.id==='string')&&new Set(a.map(x=>x.id)).size===a.length;
 if(keyed(base)&&keyed(desired)&&keyed(current)){
  const maps=[base,desired,current].map(a=>new Map(a.map(x=>[x.id,x]))),ids=[...new Set([...current.map(x=>x.id),...desired.map(x=>x.id),...base.map(x=>x.id)])];
  return ids.map(id=>mergeConcurrent(...maps.map(m=>m.get(id)),resolveConflicts)).filter(v=>v!==undefined);
 }
 if(resolveConflicts)return structuredClone(desired);
 throw Object.assign(Error('Samma uppgift har ändrats av någon annan. Dina ändringar finns kvar. Läs om innan du sparar.'),{status:409});
}
export function trainingSnapshot(session={}){
 session=session||{};
 return {selected:session.selected||[],selectedCoaches:session.selectedCoaches||[],allocation:session.allocation||[],goalies:session.goalies||[],goalieCount:session.goalieCount||0,shirtColorCount:session.shirtColorCount||3,hall:session.hall||''};
}
export function lineupSnapshot(config,entries=[]){
 const ids=a=>(Array.isArray(a)?a:[]).map(x=>Number(typeof x==='object'?x.id:x));
 const number=v=>v===null||v===undefined||v===''?null:Number(v);
 const normalized=config?{start_time:config.start_time||config.Starttid||'',opponent:config.opponent??config.Motståndare??'',plan:config.plan??config.Plan??'',player_count:number(config.player_count??config['Antal spelare'])||null,goalie_player_id:number(config.goalie_player_id??ids(config.Målvakt)[0]),players_on_field:ids(config.players_on_field||config['Spelare på plan'])}:null;
 const positions=new Map();
 for(const e of [...entries].sort((a,b)=>Number(a.id||0)-Number(b.id||0))){const raw=e.person_type||e.Persontyp?.value||e.Persontyp,type=raw==='Spelare'?'player':raw==='Tränare'?'coach':raw,person=number(e.person_id??e['Person-ID']),order=Number(e.sort_order??e.Sorteringsordning);if(!['player','coach'].includes(type)||!person)continue;const key=type+':'+order;if(!positions.has(key))positions.set(key,{type,person,order});}
 return {config:normalized,entries:[...positions.values()].sort((a,b)=>a.order-b.order||a.type.localeCompare(b.type))};
}

export function mergeTraining(base,desired,current,resolveConflicts=false){
 const sets=['selected','selectedCoaches'],next={...desired};
 const b=trainingSnapshot(base),d=trainingSnapshot(desired),c=trainingSnapshot(current);
 for(const key of sets){const ids=[...new Set([...c[key],...d[key],...b[key]])];next[key]=ids.filter(id=>mergeConcurrent(b[key].includes(id),d[key].includes(id),c[key].includes(id),resolveConflicts));}
 const out=mergeConcurrent(Object.fromEntries(Object.entries(b).filter(([k])=>!sets.includes(k))),Object.fromEntries(Object.entries(d).filter(([k])=>!sets.includes(k))),Object.fromEntries(Object.entries(c).filter(([k])=>!sets.includes(k))),resolveConflicts);
 Object.assign(out,Object.fromEntries(sets.map(k=>[k,next[k]])));
 if(out.goalies.length!==out.goalieCount||out.goalies.some(id=>!out.selected.includes(id))||out.allocation.flat().some(id=>!out.selected.includes(id)||out.goalies.includes(id))||new Set(out.allocation.flat()).size!==out.allocation.flat().length)throw Object.assign(Error('Närvaro, målvakter eller tröjfärger ändrades samtidigt. Granska dina val innan du sparar.'),{status:409});
 return out;
}
