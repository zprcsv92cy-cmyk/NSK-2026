(() => {
 const $=id=>document.getElementById(id);
 const base=()=>String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
 let board,team,teamName,canWrite=false,busy=false,people=[];
 const status=message=>{$('equipmentStatus').textContent=message;};
 function lock(){for(const control of document.querySelectorAll('form input,form select,form textarea,form button,.equipment-row input,.equipment-row button,.equipment-actions button'))control.disabled=busy||!canWrite;$('equipmentReload').disabled=busy;}
 async function request(payload){
  if(Auth.activeTeam()!==teamName)throw Error('Laget har ändrats. Ladda om sidan.');
  const response=await fetch(base()+'/api/equipment?team_id='+encodeURIComponent(team),{method:payload?'PUT':'GET',headers:{Authorization:'Bearer '+Auth.getToken(),...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok){if(response.status===409)canWrite=false;throw Error(data.error||'Materialuppgifterna kunde inte hämtas eller sparas.');}
  return data;
 }
 function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
 function button(text,run){const b=element('button',text);b.type='button';b.onclick=run;return b;}
 async function change(update){
  if(busy||!canWrite)return;busy=true;lock();status('Sparar…');
  try{const next=structuredClone(board);update(next);const result=await request(next);next.revision=result.revision;next.requests=result.requests;next.checklists=result.checklists;board=next;status('Sparat för laget.');render();return true;}
  catch(error){status(error.message+' Ändringen har inte bekräftats som sparad.');render();return false;}
  finally{busy=false;lock();}
 }
 function row(label,done,toggle,remove){
  const r=element('div');r.className='equipment-row'+(done?' equipment-done':'');
  const l=element('label'),check=element('input');check.type='checkbox';check.checked=done;check.disabled=!canWrite;
  check.onchange=()=>{const selected=check.checked;check.checked=done;void toggle(selected);};
  l.append(check,label);r.append(l);
  if(canWrite&&remove)r.append(button('Ta bort',remove));return r;
 }
 function render(){
  $('sharpeningForm').hidden=!canWrite;$('checklistForm').hidden=!canWrite;
  const requests=$('sharpeningList');requests.replaceChildren();
  if(!board.requests.length)requests.append(element('p','Inga slipönskemål ännu.'));
  const pending=board.requests.filter(r=>!r.done).length;
  if(board.requests.length)requests.append(element('p',pending+' väntar på slipning'));
  for(const item of [...board.requests].sort((a,b)=>Number(a.done)-Number(b.done))){
   const label=element('span',item.name+' · '+(item.kind==='player'?'Spelare':'Tränare'));
   label.append(element('small',item.note|| (item.done?'Slipning klar':'Önskar slipning')));
   const skates=item.skates;
   label.append(element('small','Skåldjup: '+(skates?.hollow||'Ej angivet – kontrollera före slipning')));
   label.append(element('small','Profil: '+(skates?.profile||'Ej angiven')));
   if(skates?.model)label.append(element('small','Skridskor: '+skates.model));
   if(skates?.notes)label.append(element('small',skates.notes));
   requests.append(row(label,item.done,done=>change(b=>{b.requests.find(r=>r.id===item.id).done=done;}),()=>{if(confirm('Ta bort slipönskemålet för '+item.name+'?'))void change(b=>{b.requests=b.requests.filter(r=>r.id!==item.id);});}));
  }
  const lists=$('equipmentChecklists');lists.replaceChildren();
  if(!board.checklists.length)lists.append(element('p','Inga checklistor ännu.'));
  for(const list of board.checklists){
   const section=element('section');section.append(element('h3',list.title),element('p',list.items.filter(i=>i.done).length+' av '+list.items.length+' klara'));
   for(const item of list.items)section.append(row(element('span',item.label),item.done,done=>change(b=>{b.checklists.find(c=>c.id===list.id).items.find(i=>i.id===item.id).done=done;})));
   if(canWrite){const actions=element('div');actions.className='equipment-actions';actions.append(button('Återställ bockar',()=>{if(confirm('Återställ alla bockar i '+list.title+'?'))void change(b=>{b.checklists.find(c=>c.id===list.id).items.forEach(i=>{i.done=false;});});}),button('Ta bort lista',()=>{if(confirm('Ta bort checklistan '+list.title+'?'))void change(b=>{b.checklists=b.checklists.filter(c=>c.id!==list.id);});}));section.append(actions);}
   lists.append(section);
  }
  lock();
 }
 async function load(){
  if(busy)return;busy=true;canWrite=false;lock();status('Hämtar materialuppgifter…');
  try{
   await Auth.init();teamName=Auth.activeTeam();if(!teamName)throw Error('Välj ett lag i Mitt konto.');
   $('equipmentTeam').textContent=teamName;
   const response=await fetch(base()+'/api/lag',{headers:{Authorization:'Bearer '+Auth.getToken()},cache:'no-store'});
   if(!response.ok)throw Error('Laget kunde inte hämtas.');
   const data=await response.json(),teams=(data.results||[]).filter(t=>t.Namn===teamName&&String(t['Säsong'])==='2026');
   if(teams.length!==1)throw Error('Lagkopplingen kunde inte verifieras.');team=String(teams[0].id);
   const saved=await request();board={revision:saved.revision,requests:saved.requests,checklists:saved.checklists};
   if(saved.canWrite){
    const [players,coaches]=await Promise.all([SharedTraining.listPlayers(),SharedTraining.listCoaches()]);
    people=[...players.map(p=>({...p,kind:'player'})),...coaches.map(p=>({...p,kind:'coach'}))];
    const select=$('equipmentPerson');select.replaceChildren(new Option('Välj person',''));
    for(const [kind,title] of [['player','Spelare'],['coach','Tränare']]){const group=element('optgroup');group.label=title;people.filter(p=>p.kind===kind).forEach(p=>group.append(new Option(p.full_name,kind+':'+p.id)));select.append(group);}
   }
   canWrite=saved.canWrite;render();status(canWrite?'Alla ändringar sparas för laget.':'Läsbehörighet. Ledare och materialförvaltare kan ändra.');
  }catch(error){canWrite=false;status(error.message);if(board)render();}
  finally{busy=false;lock();}
 }
 let selectionVersion=0;
 $('equipmentPerson').onchange=async()=>{
  const generation=++selectionVersion,value=$('equipmentPerson').value;
  if(!value){$('equipmentSkates').textContent='';return;}
  $('equipmentSkates').textContent='Hämtar skridskouppgifter…';
  const [kind,id]=value.split(':');
  try{const result=await PersonCards.get(team,kind,id);if(generation!==selectionVersion)return;
   $('equipmentSkates').textContent='Skåldjup: '+(result.card.hollow||'Ej angivet')+' · Profil: '+(result.card.profile||'Ej angiven')+'. Hämtas automatiskt från personkortet.';
  }catch(error){if(generation===selectionVersion)$('equipmentSkates').textContent=error.message;}
 };
 $('equipmentReload').onclick=()=>void load();
 $('sharpeningForm').onsubmit=async event=>{
  event.preventDefault();const person=people.find(p=>p.kind+':'+p.id===$('equipmentPerson').value);if(!person)return;
  if(board.requests.some(r=>r.kind===person.kind&&r.personId===String(person.id)&&!r.done)){status('Det finns redan ett väntande slipönskemål för '+person.full_name+'.');return;}
  const note=$('equipmentNote').value.trim();
  if(await change(b=>b.requests.push({id:crypto.randomUUID(),kind:person.kind,personId:String(person.id),name:person.full_name,note,done:false}))){$('sharpeningForm').reset();selectionVersion++;$('equipmentSkates').textContent='';}
 };
 $('checklistForm').onsubmit=async event=>{
  event.preventDefault();const title=$('checklistTitle').value.trim(),items=$('checklistItems').value.split('\n').map(x=>x.trim()).filter(Boolean);
  if(!title||!items.length||items.length>100||items.some(i=>i.length>150)){status('Ange ett namn och 1–100 rader med högst 150 tecken per rad.');return;}
  if(await change(b=>b.checklists.push({id:crypto.randomUUID(),title,items:items.map(label=>({id:crypto.randomUUID(),label,done:false}))})))$('checklistForm').reset();
 };
 $('equipmentAwayTemplate').onclick=()=>{if(($('checklistTitle').value||$('checklistItems').value)&&!confirm('Ersätt utkastet med mallen Material bortamatch?'))return;$('checklistTitle').value='Material bortamatch';$('checklistItems').value='Matchtröjor\nMålvaktsutrustning\nPuckar\nVattenflaskor\nFörbandsväska\nTejp\nVerktyg och reservdelar';};
 void load();
})();
