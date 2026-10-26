// Loaded only in the private view. Assessments are kept in memory, never browser storage.
(() => {
 const $=id=>document.getElementById(id),base=()=>String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
 let board=null,team=null,token=null,player=null,dirty=false,busy=false,proposal=null,pools=[],generation=0,unlock=null,unlockTimer=null,unlockExpires=0,pinConfigured=true,pinBusy=false;
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const message=text=>{$('skillsStatus').textContent=text;};
 const planMessage=text=>{$('skillsPlanStatus').textContent=text;};
 const identity=()=>Auth.getSession()?.is_primary_admin===true&&Auth.getToken()===token&&!!Auth.activeTeam();
 function invalidate(){generation++;proposal=null;$('skillsApply').hidden=true;$('skillsPreview').replaceChildren();}
 function lock(){for(const control of document.querySelectorAll('#skillsContent input,#skillsContent textarea,#skillsContent select,#skillsContent button'))control.disabled=busy;$('skillsSuggest').disabled=busy||!board?.enabled;}
 async function api(method='GET',payload,suggest=false){
  if(!identity())throw Error('Åtkomst nekad. Logga in igen.');
  const activeUnlock=unlock;
  const response=await fetch(base()+'/api/skills'+(suggest?'/suggest':'')+'?team_id='+encodeURIComponent(team),{method,headers:{Authorization:'Bearer '+token,'X-NSK-Skills-Unlock':unlock||'',...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store',credentials:'omit'});
  const data=await response.json().catch(()=>({}));if(!identity()||activeUnlock!==unlock)throw Error('Inloggningen eller kodskyddet har ändrats.');
  if(response.status===423){showPinGate();throw Error(data.error||'Ange koden igen.');}
  if(!response.ok||!data.ok){if(response.status===401||response.status===403){board=null;proposal=null;$('skillsContent').hidden=true;$('skillsFields').replaceChildren();$('skillsPreview').replaceChildren();}throw Error(data.error||'Kunde inte hämta eller spara.');}return data;
 }
 const keys=()=>board.groups.flatMap(g=>g.items.map(([key])=>key));
 const blank=()=>({ratings:Object.fromEntries(keys().map(key=>[key,null])),notes:''});
 function edit(){const card=board.cards[player]||blank();return card;}
 function averages(){
  const card=edit();let rated=0;for(const group of board.groups){const values=group.items.map(([key])=>card.ratings[key]).filter(v=>v!==null);rated+=values.length;$('skillsAverage-'+group.key).textContent=values.length?(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)+' / 10':'Ej bedömd';}
  $('skillsCoverage').textContent=rated+' av '+keys().length+' färdigheter bedömda';
 }
 function renderCard(){
  $('skillsFields').replaceChildren();const person=board.roster.find(p=>p.id===player);$('skillsPlayerName').textContent=person?.name||'Ingen spelare';if(!person)return;
  const card=edit();$('skillsNotes').value=card.notes;const date=board.assessedAt?.[player];$('skillsAssessedAt').textContent=date?'Senast bedömd '+new Date(date).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'}):'Ingen sparad bedömning ännu.';
  for(const group of board.groups){
   const details=node('details');details.className='skills-category';details.id='skillsCategory-'+group.key;details.open=true;details.style.setProperty('--skill-color',group.color);
   const summary=node('summary'),average=node('span');average.id='skillsAverage-'+group.key;summary.append(node('span',group.name),average);details.append(summary);
   const body=node('div');body.className='skills-category-body';
   for(const [key,label] of group.items){
    const row=node('div');row.className='skill-row';const left=node('div'),caption=node('label',label),select=node('select'),meter=node('div');select.id='skill-'+key;caption.htmlFor=select.id;meter.className='skill-meter';meter.setAttribute('aria-hidden','true');
    select.append(new Option('Ej bedömd',''));for(let i=1;i<=10;i++)select.append(new Option(String(i),String(i)));select.value=card.ratings[key]===null?'':String(card.ratings[key]);
    const criterion=board.criteria?.[key],question=node('p',criterion?.question||''),selected=node('p');question.className='skill-question';question.id='skill-question-'+key;selected.className='skill-selected-level';selected.id='skill-level-'+key;selected.setAttribute('aria-live','polite');select.setAttribute('aria-describedby',question.id+' '+selected.id);
    const guide=node('details');guide.className='skill-guide';guide.append(node('summary','Bedömningsstöd 1–10'));
    if(criterion){const list=node('dl');criterion.bands.forEach((text,index)=>{list.append(node('dt',bandLabels(group)[index]),node('dd',text));});guide.append(list);}
    const paint=()=>{meter.replaceChildren();for(let i=1;i<=10;i++){const block=node('span');if(i<=Number(select.value))block.className='filled';meter.append(block);}selected.textContent=select.value?select.value+' / 10 · '+(criterion?.bands[Math.floor((Number(select.value)-1)/2)]||''):'Ej bedömd · Välj när du har tillräckligt underlag.';};
    paint();select.onchange=()=>{if(!board.cards[player])board.cards[player]=blank();board.cards[player].ratings[key]=select.value===''?null:Number(select.value);dirty=true;invalidate();paint();averages();message('Ändringar är inte sparade.');};left.append(caption,question,meter);row.append(left,select,selected,guide);body.append(row);
   }details.append(body);$('skillsFields').append(details);
  }averages();
 }
 function bandLabels(group){return ['team','attitude'].includes(group.key)?board.guidance.behaviorBands:board.guidance.bands;}
 function renderGuidance(){const root=$('skillsGuidanceBody');root.replaceChildren();if(!board.guidance)return;for(const key of ['intro','withinBand','unknown','behavior','passing'])root.append(node('p',board.guidance[key]));}
 function renderBoard(){
  $('skillsPlayer').replaceChildren();for(const person of board.roster)$('skillsPlayer').append(new Option(person.name,person.id));if(!board.roster.some(p=>p.id===player))player=board.roster[0]?.id||null;$('skillsPlayer').value=player||'';
  $('skillsOffNotice').hidden=board.enabled;$('skillsToggle').textContent=board.enabled?'Avaktivera Skills':'Aktivera Skills';renderGuidance();renderCard();$('skillsContent').hidden=false;lock();
 }
 async function save(nextEnabled=board.enabled,removeAll=false){
  if(busy)return;busy=true;lock();invalidate();message('Sparar privat…');
  try{const result=await api(removeAll?'DELETE':'PUT',removeAll?{revision:board.revision}:{revision:board.revision,enabled:nextEnabled,cards:board.cards});board={...board,...result};dirty=false;renderBoard();message(removeAll?'Alla skillsdata är raderade. Funktionen är avstängd.':'Bedömningarna är sparade privat.');}
  catch(error){message(error.message+' Dina ändringar finns kvar i vyn.');}finally{busy=false;lock();}
 }
 async function reload(){
  if(busy||dirty&&!confirm('Läs om och lämna osparade bedömningar?'))return;busy=true;lock();invalidate();
  try{board=await api();dirty=false;renderBoard();message('Privata uppgifter inlästa. Ingen annan användarroll har åtkomst.');}catch(error){message(error.message);}finally{busy=false;lock();}
 }
 function renderPoolChoices(){
  const pool=pools.find(p=>String(p.id)===$('skillsPool').value);for(const [id,count,label] of [['skillsOwnTeam',pool?.teams||0,'Lag'],['skillsMatch',pool?.matches||0,'Match']]){const select=$(id);select.replaceChildren();for(let i=1;i<=count;i++)select.append(new Option(label+' '+i,String(i)));}invalidate();
 }
 const sameIds=(a,b)=>JSON.stringify([...a].map(String).sort())===JSON.stringify([...b].map(String).sort());
 const trainingPayload=s=>({selected:(s.selected||[]).map(String),selectedCoaches:(s.selectedCoaches||[]).map(String),goalies:(s.goalies||[]).map(String),goalieCount:Number(s.goalieCount)||0,allocation:s.allocation||[],revision:Number(s.revision)||0,shirtColorCount:Number(s.shirtColorCount)||3,hall:s.hall||''});
 async function source(){
  if($('skillsMode').value==='training'){
   const date=$('skillsDate').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Välj träningsdatum.');const data=await SharedTraining.get(date);if(!data.session)throw Error('Spara närvaron för träningen först.');const session=trainingPayload(data.session);if(!session.selected.length)throw Error('Inga spelare är markerade på träningen.');
   return {mode:'training',date,session,fingerprint:JSON.stringify(session),payload:{mode:'training',playerIds:session.selected,goalieIds:session.goalies,groupCount:Number($('skillsColors').value)}};
  }
  const poolId=$('skillsPool').value,lag=$('skillsOwnTeam').value,match=$('skillsMatch').value;if(!poolId||!lag||!match)throw Error('Välj poolspel, eget lag och match.');
  const [pool,row,lineShifts]=await Promise.all([DB.getPool(poolId),DB.getPoolTeamMatchConfig(poolId,lag,match),DB.listShiftSchema(poolId,lag,match)]);
  if(!pool||pool.active===false)throw Error('Välj ett aktivt poolspel.');if(!row)throw Error('Spara laguppställningen för vald match först.');if(lineShifts.some(s=>s.done))throw Error('Matchen har genomförda byten och får inte ändras.');
  const lineup=await DB.getLineup(row.id),skaters=[...new Set(lineup.filter(p=>p.person_type==='player').map(p=>String(p.person_id)))],goalieIds=row.goalie_player_id?[String(row.goalie_player_id)]:[];
  const periods=Number(pool.periods),seconds=Number(pool.period_time)*60,sub=Number(pool.sub_time),perPeriod=Math.ceil(seconds/sub),shiftCount=periods*perPeriod;
  if(!Number.isSafeInteger(periods)||periods<1||!Number.isSafeInteger(seconds)||seconds<1||!Number.isSafeInteger(sub)||sub<1||shiftCount<1||shiftCount>60)throw Error('Matchens perioder och bytestid behöver kontrolleras. Förslaget kan innehålla högst 60 byten.');
  const payload={mode:'match',playerIds:[...new Set([...skaters,...goalieIds])],goalieIds,playersOnField:Number(pool.players_on_field),shiftCount};
  return {mode:'match',poolId,lag,match,periods,seconds,sub,perPeriod,payload,fingerprint:JSON.stringify({pool,row,lineup,lineShifts})};
 }
 function paintProposal(result,src){
  const preview=$('skillsPreview');preview.replaceChildren();const names=new Map(board.roster.map(p=>[p.id,p.name]));
  preview.append(node('p',src.mode==='training'?'Förslag för '+src.date:'Lag '+src.lag+' · Match '+src.match));const groups=node('div');groups.className='skills-preview-grid';const colors=['Röd','Vit','Svart','Grön'];
  result.groups.forEach((ids,index)=>{const box=node('section');box.className='skills-preview-group';let title=src.mode==='training'?colors[index]:'Byte '+(index+1);if(src.mode==='match'){const left=Math.max(0,src.seconds-index%src.perPeriod*src.sub);title+=' · P'+(Math.floor(index/src.perPeriod)+1)+' · '+String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');}box.append(node('h3',title));const list=node('ul');ids.forEach(id=>list.append(node('li',names.get(id)||'Spelare')));box.append(list);groups.append(box);});preview.append(groups);
  if(result.incomplete.length){const warning=node('p',result.incomplete.length+' spelare saknar delar av bedömningen. Saknade värden räknas neutralt (5,5), inte som låga betyg.');warning.className='skills-warning';preview.append(warning);}
  if(src.mode==='match'){const counts=node('p',Object.entries(result.appearances).map(([id,count])=>(names.get(id)||'Spelare')+': '+count+' byten').join(' · '));counts.className='skills-small';preview.append(counts);}
  $('skillsApply').textContent=src.mode==='training'?'Använd färggrupperna på träningen':'Använd bytena i vald match';$('skillsApply').hidden=false;
 }
 async function suggest(){
  if(busy)return;if(dirty){planMessage('Spara bedömningarna innan du skapar förslag.');return;}invalidate();const ticket=generation;busy=true;lock();planMessage('Tar fram förslag…');
  try{const src=await source();const result=await api('POST',src.payload,true);if(ticket!==generation)return;if(result.revision!==board.revision)throw Error('Bedömningarna har ändrats. Läs om innan du skapar förslag.');proposal={src,result,revision:result.revision};paintProposal(result,src);planMessage('Förslag klart. Granska innan du använder det.');}
  catch(error){planMessage(error.message);}finally{busy=false;lock();}
 }
 async function apply(){
  if(busy||!proposal)return;const chosen=proposal;if(!confirm(chosen.src.mode==='training'?'Ersätt träningens färggrupper med förslaget?':'Ersätt bytessammansättningen för vald match med förslaget?'))return;busy=true;lock();planMessage('Kontrollerar och sparar…');
  try{
   const freshBoard=await api();if(!freshBoard.enabled||freshBoard.revision!==chosen.revision)throw Error('Skills har ändrats eller stängts av. Skapa ett nytt förslag.');const fresh=await source();if(fresh.fingerprint!==chosen.src.fingerprint||JSON.stringify(fresh.payload)!==JSON.stringify(chosen.src.payload))throw Error('Närvaro, uppställning eller matchuppgifter har ändrats. Skapa ett nytt förslag.');
   if(fresh.mode==='training'){const session=fresh.session;if(!sameIds(chosen.result.groups.flat(),session.selected.filter(id=>!session.goalies.includes(id))))throw Error('Förslaget stämmer inte med närvaron.');await SharedTraining.save(fresh.date,{...session,shirtColorCount:fresh.payload.groupCount,allocation:chosen.result.groups});}
   else{const shifts=chosen.result.groups.map((players,index)=>{const left=Math.max(0,fresh.seconds-index%fresh.perPeriod*fresh.sub);return {period_no:Math.floor(index/fresh.perPeriod)+1,time_left:String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0'),players:players.map(Number)};});await DB.saveShiftSchema(fresh.poolId,fresh.lag,fresh.match,shifts);}
   invalidate();planMessage('Förslaget är sparat för laget. Endast grupp- eller bytesindelningen delas, inga skillsvärden.');
  }catch(error){planMessage(error.message+' Inget nytt förslag markeras som sparat.');}finally{busy=false;lock();}
 }
 function clearPrint(){document.body.classList.remove('skills-printing');$('skillsPrintout')?.remove();}
 function printSkills(mode){
  if(busy)return;
  if(!identity()||!unlock||Date.now()>=unlockExpires){showPinGate();message('Lås upp med koden innan du skriver ut.');return;}
  if(!board?.guidance||!board?.criteria){message('Läs om för att hämta bedömningskriterierna.');return;}
  const person=board.roster.find(p=>p.id===player);if(mode==='player'&&!person){message('Välj en spelare att skriva ut.');return;}
  clearPrint();const out=node('article');out.id='skillsPrintout';out.dataset.mode=mode;const header=node('header');header.append(node('p','PRIVAT · Endast huvudadministratören'),node('h1',mode==='criteria'?'Bedömningskriterier 1–10':'Spelarbedömning · '+person.name),node('p',Auth.activeTeam()+' · Utskriftsdatum '+new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'})));
  for(const key of (mode==='criteria'?['intro','withinBand','unknown','behavior','passing']:['intro','withinBand','unknown']))header.append(node('p',board.guidance[key]));out.append(header);
  const card=mode==='player'?edit():null;
  if(card){out.append(node('p',dirty?'Arbetskopia · Innehåller osparade ändringar.':$('skillsAssessedAt').textContent));}
  for(const group of board.groups){
   const section=node('section');section.className='skills-print-category';section.append(node('h2',group.name));
   for(const [key,label] of group.items){const criterion=board.criteria[key],item=node('section');item.className='skills-print-item';item.append(node('h3',label),node('p',criterion.question));
    if(card){const value=card.ratings[key];item.append(node('p',value===null?'Ej bedömd':value+' / 10 · '+criterion.bands[Math.floor((value-1)/2)]));}
    else{const list=node('dl');criterion.bands.forEach((text,index)=>list.append(node('dt',bandLabels(group)[index].split(' · ')[0]),node('dd',text)));item.append(list);}
    section.append(item);
   }out.append(section);
  }
  if(card){const notes=node('section');notes.className='skills-print-notes';notes.append(node('h2','Privata tränaranteckningar'),node('p',card.notes||'Inga anteckningar.'));out.append(notes);}
  document.body.append(out);document.body.classList.add('skills-printing');
  try{window.print();}catch{clearPrint();message('Utskriften kunde inte öppnas. Försök igen.');}
 }
 window.addEventListener('afterprint',clearPrint);
 $('skillsPrintCriteria').onclick=()=>printSkills('criteria');$('skillsPrintPlayer').onclick=()=>printSkills('player');
 async function pinRequest(method='GET',payload){
  if(!identity())throw Error('Åtkomst nekad. Logga in igen.');
  const response=await fetch(base()+'/api/skills/pin',{method,headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store',credentials:'omit'});
  const data=await response.json().catch(()=>({}));if(!identity())throw Error('Inloggningen har ändrats.');
  if(!response.ok||!data.ok)throw Error(data.error||'Kodskyddet kunde inte kontrolleras.');return data;
 }
 function showPinGate(){
  clearPrint();$('skillsGuidanceBody').replaceChildren();clearTimeout(unlockTimer);unlock=null;unlockExpires=0;board=null;dirty=false;player=null;invalidate();
  $('skillsContent').hidden=true;$('skillsFields').replaceChildren();$('skillsNotes').value='';$('skillsPlayer').replaceChildren();$('skillsPlayerName').textContent='';$('skillsCoverage').textContent='';$('skillsAssessedAt').textContent='';
  $('skillsPinGate').hidden=false;$('skillsPinForm').reset();
  $('skillsPinTitle').textContent=pinConfigured?'Lås upp Specialfunktioner':'Välj kod för Specialfunktioner';
  $('skillsPinHelp').textContent=pinConfigured?'Ange din kod. Fem felaktiga försök ger 15 minuters spärr.':'Välj en fyrsiffrig kod och bekräfta den. Koden gäller bara tillsammans med ditt huvudadministratörskonto. Spara koden på en säker plats.';
  $('skillsPinConfirmField').hidden=pinConfigured;$('skillsPinConfirm').required=!pinConfigured;$('skillsPinSubmit').textContent=pinConfigured?'Lås upp':'Spara kod och lås upp';
  message('Specialfunktioner är låsta.');
 }
 async function loadUnlocked(){
  const response=await fetch(base()+'/api/lag',{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(!response.ok)throw Error('Laget kunde inte verifieras.');const data=await response.json(),teams=(data.results||[]).filter(t=>t.Namn===Auth.activeTeam()&&String(t['Säsong'])==='2026');if(teams.length!==1)throw Error('Lagkopplingen kunde inte verifieras.');team=String(teams[0].id);board=await api();renderBoard();message('Privata uppgifter inlästa. Bedömningarna är bara tillgängliga för huvudadministratören.');
  pools=await DB.listPools();$('skillsPool').replaceChildren(new Option('Välj poolspel',''));pools.filter(p=>p.active!==false).forEach(p=>$('skillsPool').append(new Option([p.pool_date,p.place,p.title].filter(Boolean).join(' · '),String(p.id))));renderPoolChoices();
  $('skillsDate').value=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'});
 }
 document.addEventListener('DOMContentLoaded',async()=>{
  try{const session=await Auth.init();if(session?.is_primary_admin!==true)throw Error('Åtkomst nekad.');token=Auth.getToken();const state=await pinRequest();pinConfigured=state.configured;showPinGate();if(state.retryAfter)$('skillsPinMessage').textContent='Kodskyddet är spärrat. Försök igen om '+Math.ceil(state.retryAfter/60)+' minuter.';}
  catch(error){message(error.message);}
 });
 $('skillsPinForm').onsubmit=async event=>{
  event.preventDefault();if(pinBusy)return;pinBusy=true;$('skillsPinSubmit').disabled=true;$('skillsPinMessage').textContent='Kontrollerar…';
  const payload={action:pinConfigured?'unlock':'setup',pin:$('skillsPin').value,...(!pinConfigured?{confirmPin:$('skillsPinConfirm').value}:{})};$('skillsPinForm').reset();
  try{const data=await pinRequest('POST',payload);pinConfigured=true;unlock=data.unlock;unlockExpires=data.expiresAt*1000;$('skillsPinGate').hidden=true;$('skillsPinMessage').textContent='';clearTimeout(unlockTimer);unlockTimer=setTimeout(()=>{showPinGate();$('skillsPinMessage').textContent='Tiden har gått ut. Ange koden igen.';},Math.max(0,data.expiresAt*1000-Date.now()));await loadUnlocked();}
  catch(error){if(unlock)showPinGate();$('skillsPinMessage').textContent=error.message;message(error.message);}
  finally{pinBusy=false;$('skillsPinSubmit').disabled=false;}
 };
 $('skillsPinLock').onclick=async()=>{if(dirty&&!confirm('Lås och lämna osparade bedömningar?'))return;showPinGate();try{await pinRequest('DELETE');}catch(error){message(error.message);}};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&unlock&&Date.now()>=unlockExpires)showPinGate();});
 document.addEventListener('nsk:page-show',()=>{if(unlock&&Date.now()>=unlockExpires)showPinGate();if(!identity()&&token){showPinGate();$('skillsPinGate').hidden=true;message('Logga in igen.');}});
 $('skillsPlayer').onchange=()=>{player=$('skillsPlayer').value;renderCard();};
 $('skillsNotes').oninput=()=>{if(!player)return;if(!board.cards[player])board.cards[player]=blank();board.cards[player].notes=$('skillsNotes').value;dirty=true;invalidate();message('Ändringar är inte sparade.');};
 $('skillsForm').onsubmit=event=>{event.preventDefault();void save();};
 $('skillsResetPlayer').onclick=()=>{if(!player||!confirm('Rensa denna spelares privata bedömningar och anteckningar?'))return;delete board.cards[player];dirty=true;invalidate();renderCard();message('Bedömningen är rensad i vyn. Spara för att bekräfta.');};
 $('skillsToggle').onclick=()=>{if(confirm(board.enabled?'Avaktivera Skills? Bedömningar finns kvar, men nya förslag stoppas.':'Aktivera Skills igen?'))void save(!board.enabled);};
 $('skillsEraseAll').onclick=()=>{if(confirm('Radera ALLA privata skillsbedömningar och anteckningar för laget? Detta går inte att ångra.'))void save(false,true);};
 $('skillsReload').onclick=()=>void reload();$('skillsSuggest').onclick=()=>void suggest();$('skillsApply').onclick=()=>void apply();
 $('skillsMode').onchange=()=>{const training=$('skillsMode').value==='training';$('skillsDateField').hidden=!training;$('skillsColorsField').hidden=!training;$('skillsMatchFields').hidden=training;invalidate();};
 $('skillsPool').onchange=renderPoolChoices;for(const id of ['skillsDate','skillsColors','skillsOwnTeam','skillsMatch'])$(id).addEventListener('change',invalidate);
})();
