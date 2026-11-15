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
 const participants=document.getElementById('poolParticipants');
 const participantCount=document.getElementById('poolParticipantCount');
 const settings=document.getElementById('poolSelectionSettings');
 const includeFuture=document.getElementById('poolIncludeFutureTraining');
 const futureStatus=document.getElementById('poolFutureTrainingStatus');
 const submit=settings.querySelector('button[type="submit"]');
 let history;
 function session(){return JSON.stringify([Auth.activeTeam(),Auth.getToken()]);}
 async function init(){
  await Auth.init();
  const current=session();
  if(await Auth.checkTeamFeature('lineup')&&session()===current)section.hidden=false;
 }
 async function readAttendance(dates){
  const attendance=[];
  for(let offset=0;offset<dates.length;offset+=8){
   const batch=await Promise.all(dates.slice(offset,offset+8).map(SharedTraining.get));
   for(const {session} of batch){
    if(session?.selected?.length)attendance.push(new Set(session.selected.map(String)));
   }
  }
  return attendance;
 }
 async function trainingHistory(date){
  const {sessions}=await SharedTraining.listWithTeam();
  const dates=sessions.filter(training=>training.players>0).map(training=>training.date);
  return {
   past:await readAttendance(dates.filter(day=>day<date)),
   futureDates:dates.filter(day=>day>=date)
  };
 }
 function countedAttendance(){
  return includeFuture.checked?[...history.past,...(history.future||[])]:history.past;
 }
 const formatPoints=new Intl.NumberFormat('sv-SE',{maximumFractionDigits:1});
 function selectionScores(){
  const attendance=countedAttendance();
  const trainingCount=attendance.length;
  const selected=new Set(new FormData(form).getAll('player'));
  const candidates=history.players.filter(player=>selected.has(String(player.id)));
  const baseline=candidates.length?candidates:history.players;
  const least=Math.min(...baseline.map(player=>player.total_matches));
  return history.players.map(player=>{
   const present=attendance.filter(training=>training.has(String(player.id))).length;
   const rotation=Math.max(0,100-20*Math.max(0,player.total_matches-least));
   const matchPoints=trainingCount?7*rotation:rotation;
   const trainingPoints=300*present;
   const points=trainingCount?matchPoints*trainingCount+trainingPoints:rotation;
   const matchScore=trainingCount?matchPoints/10:rotation;
   const trainingScore=trainingCount?trainingPoints/(10*trainingCount):0;
   return {...player,present,trainingCount,points,matchScore,trainingScore};
  });
 }
 function scoreLabel(player){
  return formatPoints.format(player.matchScore+player.trainingScore)+'/100 poäng';
 }
 function compareScores(a,b){
  return b.points-a.points||String(a.last_match||'').localeCompare(b.last_match||'')||a.total_matches-b.total_matches||a.name.localeCompare(b.name,'sv');
 }
 function describeScore(player){
  const match=formatPoints.format(player.matchScore)+'/'+(player.trainingCount?70:100)+' matchpoäng';
  const training=player.trainingCount
   ? formatPoints.format(player.trainingScore)+'/30 träningspoäng ('+player.present+'/'+player.trainingCount+' träningar)'
   : 'träningsnärvaro saknas';
  return player.total_matches+' matcher · '+match+' · '+training;
 }
 function updatePlayerScores(){
  if(!history)return;
  const scores=new Map(selectionScores().map(player=>[String(player.id),player]));
  const focused=document.activeElement;
  const rows=[...choices.children].map(row=>{
   const checkbox=row.querySelector('input');
   const player=scores.get(checkbox.value);
   row.querySelector('[data-player-name]').textContent=player.name+' · '+scoreLabel(player);
   row.querySelector('[data-player-detail]').textContent=describeScore(player);
   return {row,checkbox,player};
  });
  rows.sort((a,b)=>Number(b.checkbox.checked)-Number(a.checkbox.checked)||
   (a.checkbox.checked?compareScores(a.player,b.player):a.player.name.localeCompare(b.player.name,'sv')));
  rows.forEach(({row},index)=>{
   if(choices.children[index]!==row)choices.insertBefore(row,choices.children[index]||null);
  });
  if(rows.some(({checkbox})=>checkbox===focused)&&document.activeElement!==focused)focused.focus({preventScroll:true});
 }
 function updateSelectionSettings(){
  const count=choices.querySelectorAll('input:checked').length;
  participantCount.textContent='Spelare som kan delta ('+count+')';
  settings.hidden=settings.disabled=!count;
 }
 open.addEventListener('click',async()=>{
  open.disabled=true;
  status.textContent='Hämtar matchhistorik och träningsnärvaro…';
  form.hidden=true;
  output.replaceChildren();
  try{
   const current=session();
   const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'});
   const [players,training]=await Promise.all([DB.listPoolSelectionStats(date),trainingHistory(date)]);
   if(current!==session()||!section.isConnected)return;
   history={current,players,...training};
   choices.replaceChildren(...[...players].sort((a,b)=>a.name.localeCompare(b.name,'sv')).map(player=>{
    const row=document.createElement('div');
    const label=document.createElement('label');
    const input=document.createElement('input');
    input.type='checkbox';
    input.name='player';
    input.value=player.id;
    const name=document.createElement('span');
    name.dataset.playerName='';
    label.append(input,' ',name);
    const detail=document.createElement('div');
    detail.className='small';
    detail.dataset.playerDetail='';
    row.append(label,detail);
    return row;
   }));
   status.textContent=players.length
    ? training.past.length+' tidigare träningar med sparad spelarnärvaro. Markera vilka som kan delta.'
    : 'Det finns inga spelare i truppen.';
   participants.open=true;
   form.reset();
   futureStatus.textContent='';
   updatePlayerScores();
   updateSelectionSettings();
   form.hidden=!players.length;
  }catch(error){status.textContent=error.message||'Uttagningsunderlaget kunde inte hämtas.';}
  finally{open.disabled=false;}
 });
 includeFuture.addEventListener('change',async()=>{
  if(!history||history.current!==session())return;
  const source=history;
  if(includeFuture.checked&&!source.future){
   includeFuture.disabled=submit.disabled=open.disabled=true;
   futureStatus.textContent='Hämtar närvaro för kommande träningar…';
   try{source.future=await readAttendance(source.futureDates);}
   catch{
    includeFuture.checked=false;
    futureStatus.textContent='Närvaron kunde inte hämtas. Försök igen.';
    updatePlayerScores();
    return;
   }finally{includeFuture.disabled=submit.disabled=open.disabled=false;}
  }
  if(source!==history||source.current!==session()||!section.isConnected)return;
  futureStatus.textContent=includeFuture.checked
   ? source.future.length+' kommande träningar med sparad närvaro räknas med.'
   : '';
  updatePlayerScores();
  output.replaceChildren();
 });
 const importImages=document.getElementById('selectionImportImages');
 const importText=document.getElementById('selectionImportText');
 const importRead=document.getElementById('selectionImportRead');
 const importApply=document.getElementById('selectionImportApply');
 const importStatus=document.getElementById('selectionImportStatus');
 const importReview=document.getElementById('selectionImportReview');
 function clearImportReview(){
  importReview.replaceChildren();
  importApply.disabled=true;
  importStatus.textContent='';
 }
 importImages.addEventListener('change',clearImportReview);
 importText.addEventListener('input',clearImportReview);
 open.addEventListener('click',clearImportReview);
 importRead.addEventListener('click',async()=>{
  if(!history||history.current!==session())return;
  const source=history;
  clearImportReview();
  importRead.disabled=importImages.disabled=importText.disabled=open.disabled=true;
  const roster=source.players.map(player=>({id:player.id,full_name:player.name,kind:'player'}));
  const parse=text=>window.NSKAttendanceImport.importCandidates(text,roster);
  const updateStatus=message=>{importStatus.textContent=message;};
  const pasted=importText.value;
  let detected='';
  let imageError='';
  try{
   detected=await window.NSKAttendanceImport.recognizeImages(importImages.files,parse,updateStatus);
  }catch(error){imageError=(error.message||'Bilden kunde inte läsas.')+' ';}
  finally{
   importImages.value='';
   importRead.disabled=importImages.disabled=importText.disabled=open.disabled=false;
  }
  if(history!==source||source.current!==session()||!section.isConnected)return;
  const matches=new Map();
  for(const pass of [pasted,...detected.split('\n__OCR_PASS__\n')]){
   for(const player of parse(pass))matches.set(String(player.id),player);
  }
  for(const player of matches.values()){
   const row=document.createElement('div');
   const label=document.createElement('label');
   const input=document.createElement('input');
   input.type='checkbox';
   input.checked=true;
   input.value=player.id;
   label.append(input,' '+player.full_name);
   row.append(label);
   importReview.append(row);
  }
  const expected=/kommer\s*(\d+)\s*\+\s*\d+/i.exec(pasted+'\n'+detected);
  const sourceCount=expected?' SvenskaLag visar '+expected[1]+' anmälda spelare.':'';
  importApply.disabled=!matches.size;
  updateStatus(imageError+matches.size+' spelare matchade.'+sourceCount+' Kontrollera listan före import.');
 });
 importApply.addEventListener('click',()=>{
  if(!history||history.current!==session())return;
  const selected=new Set([...importReview.querySelectorAll('input:checked')].map(input=>input.value));
  if(!selected.size){importStatus.textContent='Markera minst en rad att importera.';return;}
  choices.querySelectorAll('input').forEach(input=>{input.checked=selected.has(input.value);});
  output.replaceChildren();
  updatePlayerScores();
  clearImportReview();
  importText.value='';
  importStatus.textContent=selected.size+' deltagare importerade. De visas överst i poängordning.';
  importImages.closest('details').open=false;
  participants.open=true;
  updateSelectionSettings();
  settings.querySelector('[name="places"]').focus();
 });
 form.addEventListener('input',event=>{
  if(['teams','places','player'].includes(event.target.name))output.replaceChildren();
  if(event.target.name==='player'){updatePlayerScores();updateSelectionSettings();}
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(submit.disabled)return;
  if(!history||history.current!==session()){
   status.textContent='Lagvalet eller inloggningen har ändrats. Hämta underlaget igen.';
   return;
  }
  const data=new FormData(form);
  const places=Number(data.get('places'));
  const teams=Number(data.get('teams'));
  const ids=new Set(data.getAll('player'));
  const candidates=history.players.filter(player=>ids.has(String(player.id)));
  if(!candidates.length){
   status.textContent='Markera minst en spelare som kan delta.';
   return;
  }
  if(teams>places){
   status.textContent='Ange minst en spelare per lag.';
   return;
  }
  if(places>candidates.length){
   status.textContent='Markera minst '+places+' spelare som kan delta eller sänk det totala antalet spelare.';
   return;
  }
  const trainingCount=countedAttendance().length;
  const scores=selectionScores();
  const ranked=scores.filter(player=>ids.has(String(player.id))).sort(compareScores);
  participants.open=false;
  status.textContent=trainingCount?'Viktning 70 % spelade matcher och 30 % träningsnärvaro.':'Spelade matcher avgör eftersom träningsnärvaro saknas.';
  const groups=Array.from({length:teams+1},(_,index)=>{
   const heading=document.createElement('h3');
   const list=document.createElement('ol');
   return {name:index<teams?'Lag '+(index+1):'Reserver',heading,list};
  });
  const count=document.createElement('p');
  count.setAttribute('role','status');
  function updateCounts(){
   groups.forEach(({name,heading,list})=>{
    heading.textContent=name+' ('+list.children.length+')';
   });
   const selected=groups.slice(0,teams).reduce((sum,group)=>sum+group.list.children.length,0);
   count.textContent=selected+' av '+places+' önskade spelare uttagna'+(selected===places?'.':'. Justera uttagningen till '+places+' spelare.');
  }
  const addLabel=document.createElement('label');
  const addPlayer=document.createElement('select');
  const addButton=document.createElement('button');
  addButton.type='button';
  addButton.textContent='Lägg till';
  addButton.disabled=true;
  addLabel.append('Lägg till spelare ',addPlayer);
  const empty=document.createElement('option');
  empty.value='';
  empty.textContent='Välj spelare';
  addPlayer.append(empty);
  const remaining=scores.filter(player=>!ids.has(String(player.id))).sort((a,b)=>a.name.localeCompare(b.name,'sv'));
  for(const player of remaining){
   const option=document.createElement('option');
   option.value=String(player.id);
   option.textContent=player.name;
   addPlayer.append(option);
  }
  const addControls=document.createElement('p');
  addControls.append(addLabel,' ',addButton);
  addControls.hidden=!remaining.length;
  output.replaceChildren(count,addControls,...groups.flatMap(({heading,list})=>[heading,list]));
  function smallestTeam(){
   return groups.slice(0,teams).reduce((smallest,group,index)=>group.list.children.length<groups[smallest].list.children.length?index:smallest,0);
  }
  function renderPlayer(player,destination){
   const row=document.createElement('li');
   const name=document.createElement('strong');
   name.textContent=player.name+' · '+scoreLabel(player);
   const detail=document.createElement('div');
   detail.className='small';
   detail.textContent=describeScore(player);
   row.append(name,detail);
   const move=document.createElement('select');
   move.setAttribute('aria-label','Flytta '+player.name);
   groups.forEach(({name},groupIndex)=>{
    const option=document.createElement('option');
    option.value=groupIndex;
    option.textContent=groupIndex===teams?'Reserv':name;
    move.append(option);
   });
   const membership=document.createElement('button');
   membership.type='button';
   membership.setAttribute('aria-label','Ändra uttagning för '+player.name);
   function assign(groupIndex){
    move.value=String(groupIndex);
    groups[groupIndex].list.append(row);
    membership.textContent=groupIndex===teams?'Ta ut':'Ta bort från laget';
    updateCounts();
   }
   move.addEventListener('change',()=>{
    assign(Number(move.value));
    move.focus();
   });
   membership.addEventListener('click',()=>{
    assign(Number(move.value)===teams?smallestTeam():teams);
    membership.focus();
   });
   row.append(move,' ',membership);
   assign(destination);
  }
  addPlayer.addEventListener('change',()=>{addButton.disabled=!addPlayer.value;});
  addButton.addEventListener('click',()=>{
   const player=remaining.find(candidate=>String(candidate.id)===addPlayer.value);
   if(!player)return;
   renderPlayer(player,smallestTeam());
   addPlayer.selectedOptions[0].remove();
   addPlayer.value='';
   addButton.disabled=true;
   if(addPlayer.options.length===1){addControls.hidden=true;output.tabIndex=-1;output.focus();}
   else addPlayer.focus();
  });
  ranked.forEach((player,index)=>renderPlayer(player,index<places?index%teams:teams));
  updateCounts();
 });
 init().catch(error=>console.error('Kunde inte öppna uttagningen:',error));
})();
