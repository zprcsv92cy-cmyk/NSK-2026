(() => {
 const $=id=>document.getElementById(id);
 const base=()=>String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
 let board,team,teamName,canWrite=false,busy=false,people=[],creatingChecklist=false,refreshing=false,changeVersion=0,editingChecklistId=null,editingChecklistBase=null,linkCleanup=null,linksReady=false;
 const status=message=>{$('equipmentStatus').textContent=message;};
 function lock(){for(const control of document.querySelectorAll('form input,form select,form textarea,form button,.equipment-row input,.equipment-row button,.equipment-actions button,#checklistCreateButton'))control.disabled=busy||!canWrite;$('equipmentReload').disabled=busy;}
 async function request(payload){
  if(Auth.activeTeam()!==teamName)throw Error('Laget har ändrats. Ladda om sidan.');
  const response=await fetch(base()+'/api/equipment?team_id='+encodeURIComponent(team),{method:payload?'PUT':'GET',headers:{Authorization:'Bearer '+Auth.getToken(),...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok){if(response.status===409)canWrite=false;throw Object.assign(Error(data.error||'Materialuppgifterna kunde inte hämtas eller sparas.'),{status:response.status});}
  return data;
 }
 function denyBoard(){linkCleanup?.();linkCleanup=null;linksReady=false;$('sharpeningLinksBox').hidden=true;window.NSKViewCache?.clear();board=null;people=[];canWrite=false;$('sharpeningList').replaceChildren();$('equipmentChecklists').replaceChildren();for(const id of ['sharpeningCreate','sharpeningForm','checklistCreateButton','checklistForm'])$(id).hidden=true;lock();}
 async function rememberBoard(){if(!window.NSKViewCache||!board)return;const data={team,board};const view=await NSKViewCache.open('equipment');view.save(data);}
 function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
 function button(text,run){const b=element('button',text);b.type='button';b.onclick=run;return b;}
 async function change(update){
  if(busy||!canWrite)return;const expectedToken=Auth.getToken(),expectedTeam=teamName;changeVersion++;busy=true;lock();status('Sparar…');
  try{const next=structuredClone(board);update(next);const result=await request(next);if(Auth.getToken()!==expectedToken||Auth.activeTeam()!==expectedTeam){canWrite=false;return false;}next.revision=result.revision;next.requests=result.requests;next.checklists=result.checklists;board=next;window.NSKViewCache?.clear();void rememberBoard();status('Sparat för laget.');render();return true;}
  catch(error){status(error.message+' Ändringen har inte bekräftats som sparad.');render();return false;}
  finally{busy=false;lock();}
 }
 function row(label,done,toggle,remove){
  const r=element('div');r.className='equipment-row'+(done?' equipment-done':'');
  const l=element('label'),check=element('input');check.type='checkbox';check.checked=done;check.disabled=!canWrite;
  check.onchange=event=>{const control=event.currentTarget,selected=control.checked;control.checked=done;void toggle(selected);};
  l.append(check,label);r.append(l);
  if(canWrite&&remove)r.append(button('Ta bort',remove));return r;
 }
 function lamp(done){
  const label=element('span');label.className='equipment-lamp'+(done?' equipment-lamp--done':'');
  const dot=element('span');dot.className='equipment-lamp-dot';dot.setAttribute('aria-hidden','true');
  label.append(dot,element('span',done?'Klar':'Önskar slipning'));return label;
 }
 function skateFacts(skates){
  const facts=element('dl');facts.className='equipment-skate-facts';
  for(const [label,value] of [['Skålradie',skates?.hollow],['Profilering',skates?.profile],['Skridskor',skates?.model]]){
   const item=element('div');item.append(element('dt',label),element('dd',value||'Ej angivet'));facts.append(item);
  }
  return facts;
 }
 function setCreation(open){
  creatingChecklist=open&&canWrite;$('checklistForm').hidden=!creatingChecklist;
  $('checklistCreateButton').setAttribute('aria-expanded',String(creatingChecklist&&!editingChecklistId));
  $('checklistEditorTitle').textContent=editingChecklistId?'Redigera checklista':'Skapa checklista';
  $('checklistSaveButton').textContent=editingChecklistId?'Spara ändringar':'Spara checklista';
 }
 function render(){
  $('sharpeningLinksBox').hidden=!linksReady;
  const scroller=document.querySelector('.arena-scroll')||document.scrollingElement,top=scroller?.scrollTop;
  $('sharpeningCreate').hidden=!canWrite;$('sharpeningForm').hidden=!canWrite;
  $('checklistCreateButton').hidden=!canWrite;setCreation(creatingChecklist);
  const requests=$('sharpeningList');
  const openRequests=new Set([...requests.querySelectorAll('details[open]')].map(d=>d.dataset.requestId));
  const requestContent=document.createDocumentFragment();
  if(!board.requests.length)requestContent.append(element('p','Inga slipönskemål ännu.'));
  const pending=board.requests.filter(r=>!r.done).length;
  $('sharpeningCount').textContent=pending+' önskar slipning · '+(board.requests.length-pending)+' klara';
  for(const item of [...board.requests].sort((a,b)=>Number(a.done)-Number(b.done))){
   const section=element('details');section.className='equipment-slip';section.dataset.requestId=item.id;section.dataset.viewKey='slip:'+item.id;section.open=openRequests.has(item.id);
   const summary=element('summary'),name=element('span',item.name);name.className='equipment-slip-name';name.append(element('small',item.kind==='player'?'Spelare':'Tränare'));
   summary.append(name,lamp(item.done));section.append(summary);
   const body=element('div');body.className='equipment-slip-body';body.append(skateFacts(item.skates));
   const description=PersonCards.profileDescription?.(item.skates?.profile);
   if(description){const p=element('p',description);p.className='equipment-slip-notes';body.append(p);}
   if(!item.skates?.hollow&&!item.done){const missing=element('p','Skålradie saknas – kontrollera före slipning.');missing.className='equipment-slip-notes';body.append(missing);}
   for(const note of [item.note,item.skates?.notes])if(note){const p=element('p',note);p.className='equipment-slip-notes';body.append(p);}
   if(canWrite){const actions=element('div');actions.className='equipment-actions';
    actions.append(button(item.done?'Markera som önskar slipning':'Markera klar',()=>void change(b=>{b.requests.find(r=>r.id===item.id).done=!item.done;})),button('Ta bort',()=>{if(confirm('Ta bort slipönskemålet för '+item.name+'?'))void change(b=>{b.requests=b.requests.filter(r=>r.id!==item.id);});}));body.append(actions);
   }
   section.append(body);requestContent.append(section);
  }
  const lists=$('equipmentChecklists');
  const openLists=new Set([...lists.querySelectorAll('details[open]')].map(d=>d.dataset.checklistId));const checklistContent=document.createDocumentFragment();
  if(!board.checklists.length)checklistContent.append(element('p','Inga checklistor ännu.'));
  for(const list of board.checklists){
   const section=element('details');section.className='equipment-checklist';section.dataset.checklistId=list.id;section.dataset.viewKey='checklist:'+list.id;section.open=openLists.has(list.id);
   const summary=element('summary'),name=element('span',list.title);name.className='equipment-checklist-name';
   name.append(element('small',list.items.filter(i=>i.done).length+' av '+list.items.length+' klara'));summary.append(name);section.append(summary);
   const body=element('div');body.className='equipment-checklist-body';
   for(const item of list.items){const itemRow=row(element('span',item.label),item.done,done=>change(b=>{b.checklists.find(c=>c.id===list.id).items.find(i=>i.id===item.id).done=done;}));itemRow.dataset.viewKey='item:'+list.id+':'+item.id;body.append(itemRow);}
   if(canWrite){const actions=element('div');actions.className='equipment-actions';actions.append(button('Redigera',()=>editChecklist(list.id)),button('Återställ bockar',()=>{if(confirm('Återställ alla bockar i '+list.title+'?'))void change(b=>{b.checklists.find(c=>c.id===list.id).items.forEach(i=>{i.done=false;});});}),button('Ta bort lista',()=>{if(confirm('Ta bort checklistan '+list.title+'?'))void change(b=>{b.checklists=b.checklists.filter(c=>c.id!==list.id);});}));body.append(actions);}
   section.append(body);checklistContent.append(section);
  }
  if(window.NSKViewCache){NSKViewCache.patch(requests,requestContent);NSKViewCache.patch(lists,checklistContent);}else{requests.replaceChildren(requestContent);lists.replaceChildren(checklistContent);}
  lock();if(scroller&&Number.isFinite(top))scroller.scrollTop=top;
 }
 async function load(){
  if(busy)return;linkCleanup?.();linkCleanup=null;linksReady=false;changeVersion++;busy=true;canWrite=false;lock();status('Hämtar materialuppgifter…');
  try{
   await Auth.init();teamName=Auth.activeTeam();if(!teamName)throw Error('Välj ett lag i Mitt konto.');
   const expectedToken=Auth.getToken(),expectedTeam=teamName;
   const view=window.NSKViewCache?await NSKViewCache.open('equipment'):null;
   if(!board&&view?.data){team=view.data.team;board=view.data.board;render();status('Visar senast hämtade uppgifter.');}
   $('equipmentTeam').textContent=teamName;
   const response=await fetch(base()+'/api/lag',{headers:{Authorization:'Bearer '+Auth.getToken()},cache:'no-store'});
   if(!response.ok)throw Object.assign(Error('Laget kunde inte hämtas.'),{status:response.status});
   const data=await response.json(),teams=(data.results||[]).filter(t=>t.Namn===teamName&&String(t['Säsong'])==='2026');
   if(teams.length!==1)throw Error('Lagkopplingen kunde inte verifieras.');team=String(teams[0].id);
   const saved=await request();if(Auth.getToken()!==expectedToken||Auth.activeTeam()!==expectedTeam)return;board={revision:saved.revision,requests:saved.requests,checklists:saved.checklists};
   if(saved.canWrite){
    const [players,coaches]=await Promise.all([SharedTraining.listPlayers(),SharedTraining.listCoaches()]);
    people=[...players.map(p=>({...p,kind:'player'})),...coaches.map(p=>({...p,kind:'coach'}))];
    const select=$('equipmentPerson');select.replaceChildren(new Option('Välj person',''));
    for(const [kind,title] of [['player','Spelare'],['coach','Tränare']]){const group=element('optgroup');group.label=title;people.filter(p=>p.kind===kind).forEach(p=>group.append(new Option(p.full_name,kind+':'+p.id)));select.append(group);}
   }
   if(Auth.getToken()!==expectedToken||Auth.activeTeam()!==expectedTeam)return;
   linksReady=!!saved.canWrite&&!!window.SharpeningLinks?.allowed();const linkSelect=$('sharpeningLinkPerson');linkSelect.replaceChildren(new Option('Välj spelare',''));if(linksReady)for(const p of people.filter(p=>p.kind==='player'))linkSelect.append(new Option(p.full_name,String(p.id)));
   canWrite=saved.canWrite;void rememberBoard();render();status(canWrite?'Alla ändringar sparas för laget.':'Läsbehörighet. Ledare och materialförvaltare kan ändra.');
  }catch(error){canWrite=false;if(window.NSKViewCache?.denied(error)){denyBoard();}status(error.message);if(board)render();}
  finally{busy=false;lock();}
 }
 $('sharpeningLinkPerson').onchange=()=>{linkCleanup?.();linkCleanup=null;const id=$('sharpeningLinkPerson').value;if(linksReady&&people.some(p=>p.kind==='player'&&String(p.id)===id))linkCleanup=SharpeningLinks.mount($('equipmentLinkManager'),{team,personId:id});};
 let selectionVersion=0;
 $('equipmentPerson').onchange=async()=>{
  const generation=++selectionVersion,value=$('equipmentPerson').value;
  if(!value){$('equipmentSkates').textContent='';return;}
  $('equipmentSkates').textContent='Hämtar skridskouppgifter…';
  const [kind,id]=value.split(':');
  try{const result=await PersonCards.get(team,kind,id);if(generation!==selectionVersion)return;
   $('equipmentSkates').textContent='Skålradie: '+(result.card.hollow||'Ej angivet')+' · Profilering: '+(result.card.profile||'Ej angiven')+'. Hämtas automatiskt från personkortet.';
  }catch(error){if(generation===selectionVersion)$('equipmentSkates').textContent=error.message;}
 };
 function confirmReplaceDraft(){
  if(!creatingChecklist)return true;
  const title=$('checklistTitle').value.trim(),items=$('checklistItems').value.trim();
  const original=editingChecklistBase?JSON.parse(editingChecklistBase):null;
  const changed=original?title!==original.title||items!==original.items.map(i=>i.label).join('\n'):!!(title||items);
  return !changed||confirm('Lämna utkastet utan att spara?');
 }
 function editChecklist(id){
  if(busy||!canWrite)return;const list=board.checklists.find(c=>c.id===id);if(!list)return;
  if(editingChecklistId===id&&creatingChecklist){$('checklistTitle').focus();return;}
  if(!confirmReplaceDraft())return;
  editingChecklistId=id;editingChecklistBase=JSON.stringify(list);
  $('checklistTitle').value=list.title;$('checklistItems').value=list.items.map(i=>i.label).join('\n');
  setCreation(true);$('checklistTitle').focus();
 }
 $('checklistCreateButton').onclick=()=>{
  if(busy||!canWrite)return;
  if(editingChecklistId){if(!confirmReplaceDraft())return;editingChecklistId=null;editingChecklistBase=null;$('checklistForm').reset();setCreation(true);}
  else setCreation(!creatingChecklist);
  if(creatingChecklist)$('checklistTitle').focus();
 };
 $('checklistCancel').onclick=()=>{if(busy)return;setCreation(false);editingChecklistId=null;editingChecklistBase=null;$('checklistForm').reset();$('checklistCreateButton').focus();};
 async function refresh(){
  if(busy||refreshing||!board||document.hidden||window.NSKShellActive===false)return;
  const generation=changeVersion,expectedTeam=team,expectedToken=Auth.getToken();refreshing=true;
  try{
   const data=await request();
   if(busy||generation!==changeVersion||team!==expectedTeam||Auth.getToken()!==expectedToken)return;
   const changed=data.revision!==board.revision||data.canWrite!==canWrite||JSON.stringify(data.requests)!==JSON.stringify(board.requests);
   if(changed){board={revision:data.revision,requests:data.requests,checklists:data.checklists};canWrite=data.canWrite;render();status('Uppdaterat från lagets personkort och checklistor.');}void rememberBoard();
  }catch(error){if(!busy&&generation===changeVersion){if(window.NSKViewCache?.denied(error))denyBoard();status('Automatisk uppdatering misslyckades. '+error.message);}}
  finally{refreshing=false;}
 }
 window.addEventListener('focus',()=>void refresh());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 setInterval(()=>void refresh(),15000);
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
  const existing=editingChecklistId?board.checklists.find(c=>c.id===editingChecklistId):null;
  if(editingChecklistId&&(!existing||JSON.stringify(existing)!==editingChecklistBase)){status('Checklistan har ändrats eller tagits bort. Avbryt och öppna Redigera igen innan du sparar.');return;}
  const id=editingChecklistId||crypto.randomUUID();
  const available=new Map();
  for(const item of existing?.items||[]){if(!available.has(item.label))available.set(item.label,[]);available.get(item.label).push(item);}
  const updated={id,title,items:items.map(label=>{const previous=available.get(label)?.shift();return previous?{...previous}:{id:crypto.randomUUID(),label,done:false};})};
  if(await change(b=>{if(existing)b.checklists[b.checklists.findIndex(c=>c.id===id)]=updated;else b.checklists.push(updated);} )){
   $('checklistForm').reset();editingChecklistId=null;editingChecklistBase=null;setCreation(false);
   const saved=[...$('equipmentChecklists').querySelectorAll('details')].find(d=>d.dataset.checklistId===id);if(saved){saved.open=true;saved.querySelector('summary').focus();}
  }
 };
 $('equipmentAwayTemplate').onclick=()=>{if(($('checklistTitle').value||$('checklistItems').value)&&!confirm('Ersätt utkastet med mallen Material bortamatch?'))return;$('checklistTitle').value='Material bortamatch';$('checklistItems').value='Matchtröjor\nMålvaktsutrustning\nPuckar\nVattenflaskor\nFörbandsväska\nTejp\nVerktyg och reservdelar';};
 void load();
})();
