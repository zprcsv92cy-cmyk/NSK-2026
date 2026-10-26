export const pairKey=request=>request.pair||'regular';
export const pairLabel=key=>key==='goalie'?'Målvaktsskridskor':'Ordinarie skridskor';
export const pairFields={model:100,hollow:60,profile:100,radius:60,notes:500};
export const pairEmpty=()=>({model:'',hollow:'17 mm',profile:'',radius:'',notes:''});
export const pairSettings=(card,key='regular')=>Object.fromEntries(Object.keys(pairFields).map(k=>[k,(key==='goalie'?card?.goalie:card)?.[k]??(k==='hollow'?'17 mm':'')]));
export const pairEnabled=(card,key)=>key==='regular'||key==='goalie'&&card?.goalieEnabled===true;
export const pairValid=s=>!!s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>Object.hasOwn(pairFields,k)&&typeof s[k]==='string'&&s[k].length<=pairFields[k])&&['model','hollow','profile','notes'].every(k=>Object.hasOwn(s,k));
export const pairSyncRequests=(requests,kind,id,card)=>requests.map(r=>r.kind===kind&&r.personId===id&&!r.done?{...r,skates:pairSettings(card,pairKey(r))}:r);
