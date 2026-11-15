// Team count editing uses the same personal pool permission as the pool form.
(()=>{
 const editor=document.getElementById('poolTeamEditor'),input=document.getElementById('poolTeamCount'),save=document.getElementById('poolTeamSave'),message=document.getElementById('poolTeamMessage');
 if(!editor||!input||!save)return;
 let poolId=null;
 async function allowed(){
  const team=window.Auth?.activeTeam?.();
  return !!team&&await window.Auth.checkTeamFeature('pool',team)&&window.Auth.activeTeam()===team;
 }
 async function refresh(){
  editor.hidden=true;
  try{
   await window.Auth.init();if(!await allowed())return;
   poolId=sessionStorage.getItem('nsk2_pool_id');if(!poolId)return;
   const pool=await window.DB.getPool(poolId);if(!pool||pool.active===false)return;
   input.value=pool.teams||1;editor.hidden=false;
  }catch(error){message.textContent=error.message||'Kunde inte läsa poolspel';}
 }
 save.addEventListener('click',async()=>{
  const teams=Number(input.value);
  if(!Number.isInteger(teams)||teams<1||teams>20){message.textContent='Ange 1–20 lag';return;}
  save.disabled=true;message.textContent='Sparar…';
  try{
   if(!await allowed()||poolId!==sessionStorage.getItem('nsk2_pool_id'))throw Error('Välj poolspel och kontrollera din personliga behörighet.');
   await window.DB.updatePoolTeams(poolId,teams);(window.NSKNavigate?window.NSKNavigate(location.href,{reload:true,replace:true}):location.reload());
  }catch(error){message.textContent=error.message||'Kunde inte spara';}
  finally{save.disabled=false;}
 });
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
 window.addEventListener('focus',refresh);
})();

// The coach picks available players and the number of places before ranking.
(()=>{
 const section=document.getElementById('poolSelection');
 if(!section)return;
 const open=document.getElementById('poolSelectionOpen');
 const form=document.getElementById('poolSelectionForm');
 const status=document.getElementById('poolSelectionStatus');
 const choices=document.getElementById('poolSelectionPlayers');
 const output=document.getElementById('poolSelectionResult');
 const poolId=sessionStorage.getItem('nsk2_pool_id');
 let history;
 function session(){return JSON.stringify([Auth.activeTeam(),Auth.getToken(),sessionStorage.getItem('nsk2_pool_id')]);}
 async function init(){
  if(!poolId)return;
  await Auth.init();
  const current=session();
  if(!await Auth.checkTeamFeature('lineup'))return;
  const pool=await DB.getPool(poolId);
  if(pool?.active&&!pool.removed&&!pool.deleting&&pool.pool_date&&session()===current)section.hidden=false;
 }
 async function trainingsBefore(date){
  const {sessions}=await SharedTraining.listWithTeam();
  const dates=sessions.filter(training=>training.date<date&&training.players>0).map(training=>training.date);
  const attendance=[];
  for(let offset=0;offset<dates.length;offset+=8){
   const batch=await Promise.all(dates.slice(offset,offset+8).map(SharedTraining.get));
   for(const {session} of batch){
    if(session?.selected?.length)attendance.push(new Set(session.selected.map(String)));
   }
  }
  return attendance;
 }
 open.addEventListener('click',async()=>{
  open.disabled=true;
  status.textContent='Hämtar matchhistorik och träningsnärvaro…';
  form.hidden=true;
  output.replaceChildren();
  try{
   const current=session();
   const pool=await DB.getPool(poolId);
   if(!pool?.active||pool.removed||pool.deleting||!pool.pool_date)throw Error('Välj ett aktuellt poolspel.');
   const date=[pool.pool_date,new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'})].sort()[0];
   const [players,attendance]=await Promise.all([DB.listPoolSelectionStats({...pool,pool_date:date}),trainingsBefore(date)]);
   if(current!==session()||!section.isConnected)return;
   history={current,players,attendance};
   choices.replaceChildren(...[...players].sort((a,b)=>a.name.localeCompare(b.name,'sv')).map(player=>{
    const row=document.createElement('div');
    const label=document.createElement('label');
    const input=document.createElement('input');
    input.type='checkbox';
    input.name='player';
    input.value=player.id;
    label.append(input,' '+player.name);
    row.append(label);
    return row;
   }));
   status.textContent=players.length
    ? attendance.length+' träningar med sparad spelarnärvaro. Markera vilka som kan delta.'
    : 'Det finns inga spelare i truppen.';
   form.hidden=!players.length;
  }catch(error){status.textContent=error.message||'Uttagningsunderlaget kunde inte hämtas.';}
  finally{open.disabled=false;}
 });
 form.addEventListener('input',()=>output.replaceChildren());
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(!history||history.current!==session()){
   status.textContent='Lagvalet eller inloggningen har ändrats. Hämta underlaget igen.';
   return;
  }
  const data=new FormData(form);
  const places=Number(data.get('places'));
  const ids=new Set(data.getAll('player'));
  const candidates=history.players.filter(player=>ids.has(String(player.id)));
  if(!candidates.length){
   status.textContent='Markera minst en spelare som kan delta.';
   return;
  }
  const least=Math.min(...candidates.map(player=>player.total_matches));
  const trainingCount=history.attendance.length;
  const ranked=candidates.map(player=>{
   const present=history.attendance.filter(training=>training.has(String(player.id))).length;
   const rotation=Math.max(0,100-20*(player.total_matches-least));
   const points=trainingCount ? 7*rotation*trainingCount+300*present : rotation;
   return {...player,present,points};
  }).sort((a,b)=>b.points-a.points||String(a.last_match||'').localeCompare(b.last_match||'')||a.total_matches-b.total_matches||a.name.localeCompare(b.name,'sv'));
  status.textContent=trainingCount?'Viktning 70 % spelade matcher och 30 % träningsnärvaro.':'Spelade matcher avgör eftersom träningsnärvaro saknas.';
  const list=document.createElement('ol');
  ranked.forEach((player,index)=>{
   const row=document.createElement('li');
   const attendance=trainingCount ? player.present+'/'+trainingCount+' träningar' : 'närvaro saknas';
   const group=index<places?'Föreslagen':'Reserv';
   const score=trainingCount ? player.points/(10*trainingCount) : player.points;
   row.textContent=group+' · '+player.name+' · '+player.total_matches+' matcher · '+attendance+' · '+score.toLocaleString('sv-SE',{maximumFractionDigits:2})+' poäng';
   list.append(row);
  });
  output.replaceChildren(list);
 });
 init().catch(error=>console.error('Kunde inte öppna uttagningen:',error));
})();
