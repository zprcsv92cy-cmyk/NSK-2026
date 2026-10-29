(() => {
 const $=id=>document.getElementById(id);
 const base=()=>String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
 let board,team,teamName,canWrite=false,busy=false,people=[],creatingChecklist=false,refreshing=false,changeVersion=0,editingChecklistId=null,editingChecklistBase=null,linkCleanup=null,linksReady=false;
 let pageLimit=10,selectedRequests=new Set(),activePane='slips';
 const status=message=>{$('equipmentStatus').textContent=message;};
 function lock(){for(const control of document.querySelectorAll('form input,form select,form textarea,form button,.equipment-row input,.equipment-row button,.equipment-actions button,.equipment-select,#equipmentCompleteSelected,#checklistCreateButton'))control.disabled=busy||!canWrite;$('equipmentReload').disabled=busy;}
 async function fetchJson(url,options){
  try{
   const signal=typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(15000):undefined;
   const response=await fetch(url,{...options,...(signal?{signal}:{})});
   let data;
   try{data=await response.json();}
   catch(error){
    if(['AbortError','TimeoutError'].includes(error.name))throw error;
    if(response.ok)throw Error('Svaret kunde inte läsas. Åtgärden kan inte bekräftas. Ladda om materialuppgifterna innan du försöker igen.');
    data={};
   }
   return {response,data};
  }catch(error){
   if(['AbortError','TimeoutError'].includes(error.name))throw Error('Anropet tog för lång tid. Ladda om materialuppgifterna innan du försöker igen.');
   throw error;
  }
 }
 async function request(payload){
  if(Auth.activeTeam()!==teamName)throw Error('Laget har ändrats. Ladda om sidan.');
  const expectedToken=Auth.getToken(),expectedTeam=teamName;
  const {response,data}=await fetchJson(base()+'/api/equipment?team_id='+encodeURIComponent(team),{method:payload?'PUT':'GET',headers:{Authorization:'Bearer '+expectedToken,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
  if(Auth.getToken()!==expectedToken||Auth.activeTeam()!==expectedTeam)throw Object.assign(Error('Inloggningen eller laget ändrades. Ladda om sidan.'),{sessionChanged:true});
  if(!response.ok){if(response.status===409)canWrite=false;throw Object.assign(Error(data?.error||'Materialuppgifterna kunde inte hämtas eller sparas.'),{status:response.status});}
  if(data?.ok!==true||!Number.isSafeInteger(data.revision)||data.revision<(payload?1:0)||!Array.isArray(data.requests)||!Array.isArray(data.checklists))throw Error('Åtgärden kan inte bekräftas. Ladda om materialuppgifterna innan du försöker igen.');
  return data;
 }
 function denyBoard(){linkCleanup?.();linkCleanup=null;linksReady=false;$('sharpeningLinksBox').hidden=true;window.NSKViewCache?.clear();board=null;people=[];canWrite=false;$('sharpeningList').replaceChildren();$('equipmentChecklists').replaceChildren();for(const id of ['sharpeningCreate','sharpeningForm','checklistCreateButton','checklistForm'])$(id).hidden=true;lock();}
 async function rememberBoard(){if(!window.NSKViewCache||!board)return;const data={team,board};const view=await NSKViewCache.open('equipment');view.save(data);}
 function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
 function button(text,run){const b=element('button',text);b.type='button';b.onclick=run;return b;}
 async function change(update,{optimistic=false}={}){
  if(busy||!canWrite)return;const expectedToken=Auth.getToken(),expectedTeam=teamName;changeVersion++;busy=true;lock();status('Sparar…');
  const before=board;
  try{const next=structuredClone(board);update(next);if(optimistic){board=next;render();}const result=await request({...next,base:{requests:before.requests,checklists:before.checklists}});if(Auth.getToken()!==expectedToken||Auth.activeTeam()!==expectedTeam){canWrite=false;denyBoard();return false;}next.revision=result.revision;next.requests=result.requests;next.checklists=result.checklists;board=next;window.NSKViewCache?.clear();void rememberBoard();status('Sparat · '+new Date().toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'}));render();return true;}
  catch(error){if(error.sessionChanged||Auth.getToken()!==expectedToken||Auth.activeTeam()!==expectedTeam){denyBoard();status('Inloggningen eller laget ändrades. Ladda om sidan.');return false;}board=before;status(error.message+' Ändringen har inte bekräftats som sparad.');render();return false;}
  finally{busy=false;lock();}
 }
 function row(label,done,toggle,remove){
  const r=element('div');r.className='equipment-row'+(done?' equipment-done':'');
  const l=element('label'),check=element('input');check.type='checkbox';check.checked=done;check.disabled=!canWrite;
  check.onchange=event=>{void toggle(event.currentTarget.checked);};
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
  selectedRequests=new Set([...selectedRequests].filter(id=>board.requests.some(r=>r.id===id&&!r.done)));const nameQuery=$('equipmentNameSearch').value.trim().toLocaleLowerCase('sv-SE'),doneFilter=$('equipmentStatusFilter').value==='done',matches=board.requests.filter(r=>r.done===doneFilter&&r.name.toLocaleLowerCase('sv-SE').includes(nameQuery));
  $('equipmentVisibleCount').textContent=matches.length+' '+(doneFilter?'klara':'väntande')+' · '+Math.min(pageLimit,matches.length)+' visas';$('equipmentShowMore').hidden=matches.length<=pageLimit;$('equipmentCompleteSelected').hidden=!selectedRequests.size;$('equipmentCompleteSelected').disabled=busy||!canWrite;$('equipmentCompleteSelected').textContent='Markera '+selectedRequests.size+' valda klara';
  const requestContent=document.createDocumentFragment();
  if(!matches.length)requestContent.append(element('p','Inga slipönskemål ännu.'));
  const pending=board.requests.filter(r=>!r.done).length;
  $('sharpeningCount').textContent=pending+' önskar slipning · '+(board.requests.length-pending)+' klara';
  for(const item of matches.slice(0,pageLimit)){
   const section=element('details');section.className='equipment-slip';section.dataset.requestId=item.id;section.dataset.viewKey='slip:'+item.id;section.open=openRequests.has(item.id);
   const summary=element('summary'),name=element('span',item.name);name.className='equipment-slip-name';name.append(element('small',(item.pair==='goalie'?'Målvaktsskridskor':'Ordinarie skridskor')+(item.note?' · 💬':'')));const select=element('input');select.type='checkbox';select.className='equipment-select';select.setAttribute('aria-label','Välj '+item.name+' '+(item.pair==='goalie'?'målvaktsskridskor':'ordinarie skridskor'));select.checked=selectedRequests.has(item.id);select.disabled=busy||!canWrite||item.done;select.onclick=e=>e.stopPropagation();select.onchange=event=>{if(event.currentTarget.checked)selectedRequests.add(item.id);else selectedRequests.delete(item.id);render();};if(canWrite&&!item.done)summary.append(select);
   const light=lamp(item.done);light.setAttribute('aria-label',item.done?'Klar':'Önskar slipning');summary.append(name,element('span',item.skates?.hollow||'Ej angivet'),light);section.append(summary);
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
   for(const item of list.items){const itemRow=row(element('span',item.label),item.done,async done=>{const saved=await change(b=>{b.checklists.find(c=>c.id===list.id).items.find(i=>i.id===item.id).done=done;},{optimistic:true});if(saved){lastCheck={listId:list.id,itemId:item.id,before:item.done,after:done};undoButton.hidden=false;} });itemRow.dataset.viewKey='item:'+list.id+':'+item.id;body.append(itemRow);}
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
   const {response,data}=await fetchJson(base()+'/api/lag',{headers:{Authorization:'Bearer '+expectedToken},cache:'no-store'});
   if(Auth.getToken()!==expectedToken||Auth.activeTeam()!==expectedTeam)throw Object.assign(Error('Inloggningen eller laget ändrades. Ladda om sidan.'),{sessionChanged:true});
   if(!response.ok)throw Object.assign(Error('Laget kunde inte hämtas.'),{status:response.status});
   const teams=(data?.results||[]).filter(t=>t.Namn===teamName&&String(t['Säsong'])==='2026');
   if(teams.length!==1)throw Error('Lagkopplingen kunde inte verifieras.');team=String(teams[0].id);
   const saved=await request();if(Auth.getToken()!==expectedToken||Auth.activeTeam()!==expectedTeam)return;board={revision:saved.revision,requests:saved.requests,checklists:saved.checklists};
   if(saved.canWrite){
    const [players,coaches]=await Promise.all([SharedTraining.listPlayers(),SharedTraining.listCoaches()]);
    people=[...players.map(p=>({...p,kind:'player'})),...coaches.map(p=>({...p,kind:'coach'}))];
    const select=$('equipmentPerson');select.replaceChildren(new Option('Välj person',''));
    for(const [kind,title] of [['player','Spelare'],['coach','Tränare']]){const group=element('optgroup');group.label=title;people.filter(p=>p.kind===kind).forEach(p=>group.append(new Option(p.full_name,kind+':'+p.id)));select.append(group);}
   }
   if(Auth.getToken()!==expectedToken||Auth.activeTeam()!==expectedTeam)return;
   linksReady=!!saved.canWrite&&!!window.SharpeningLinks?.allowed();$('equipmentTabLinks').hidden=!linksReady;if(linksReady)linkCleanup=SharpeningLinks.bulk($('equipmentQrBulk'),{team,people});
   canWrite=saved.canWrite;void rememberBoard();render();status('Uppdaterat '+new Date().toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})+(canWrite?'':' · Läsbehörighet'));
  }catch(error){canWrite=false;if(error.sessionChanged||window.NSKViewCache?.denied(error)){denyBoard();}status(error.message);if(board)render();}
  finally{busy=false;lock();}
 }

 for(const button of document.querySelectorAll('[data-pane]'))button.onclick=()=>{activePane=button.dataset.pane;for(const [key,id] of [['slips','equipmentPaneSlips'],['lists','equipmentPaneLists'],['links','equipmentPaneLinks']])$(id).hidden=key!==activePane;for(const tab of document.querySelectorAll('[data-pane]'))tab.setAttribute('aria-selected',String(tab===button));};
 $('equipmentNameSearch').oninput=$('equipmentStatusFilter').onchange=()=>{pageLimit=10;selectedRequests.clear();if(board)render();};$('equipmentShowMore').onclick=()=>{pageLimit+=10;render();};$('equipmentCompleteSelected').onclick=()=>void change(b=>{for(const r of b.requests)if(selectedRequests.has(r.id))r.done=true;selectedRequests.clear();});
 let selectionVersion=0;
 $('equipmentPerson').onchange=async()=>{
  const generation=++selectionVersion,value=$('equipmentPerson').value;
  if(!value){$('equipmentSkates').textContent='';return;}
  $('equipmentSkates').textContent='Hämtar skridskouppgifter…';
  const [kind,id]=value.split(':');
  try{const result=await PersonCards.get(team,kind,id);if(generation!==selectionVersion)return;
   const pairSelect=$('equipmentPair');pairSelect.replaceChildren(new Option('Ordinarie skridskor','regular'));if(result.card.goalieEnabled){pairSelect.append(new Option('Målvaktsskridskor','goalie'),new Option('Båda paren','both'));}
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
 $('checklistCancel').onclick=()=>{if(busy)return;setCreation(false);editingChecklistId=null;editingChecklistBase=null;$('checklistForm').reset();window.NSKShellHost?.clean?.(window);$('checklistCreateButton').focus();};
 async function refresh(){
  if(busy||refreshing||!board||document.hidden||window.NSKShellActive===false)return;
  const generation=changeVersion,expectedTeam=team,expectedToken=Auth.getToken();refreshing=true;
  try{
   const data=await request();
   if(busy||generation!==changeVersion||team!==expectedTeam||Auth.getToken()!==expectedToken)return;
   const changed=data.revision!==board.revision||data.canWrite!==canWrite||JSON.stringify(data.requests)!==JSON.stringify(board.requests);
   if(changed){board={revision:data.revision,requests:data.requests,checklists:data.checklists};canWrite=data.canWrite;render();status('Uppdaterat från lagets personkort och checklistor.');}void rememberBoard();
  }catch(error){if(!busy&&generation===changeVersion){if(error.sessionChanged||window.NSKViewCache?.denied(error))denyBoard();status('Automatisk uppdatering misslyckades. '+error.message);}}
  finally{refreshing=false;}
 }
 window.addEventListener('focus',()=>void refresh());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 setInterval(()=>void refresh(),15000);
 $('equipmentReload').onclick=()=>void load();
 $('sharpeningForm').onsubmit=async event=>{
  event.preventDefault();const person=people.find(p=>p.kind+':'+p.id===$('equipmentPerson').value);if(!person)return;
  const keys=$('equipmentPair').value==='both'?['regular','goalie']:[$('equipmentPair').value],needed=keys.filter(key=>!board.requests.some(r=>r.kind===person.kind&&r.personId===String(person.id)&&(r.pair||'regular')===key&&!r.done));
  if(!needed.length){status('Det finns redan ett väntande slipönskemål för '+person.full_name+'.');return;}
  const note=$('equipmentNote').value.trim();
  if(await change(b=>b.requests.push(...needed.map(pair=>({id:crypto.randomUUID(),kind:person.kind,personId:String(person.id),pair,name:person.full_name,note,done:false}))))){$('sharpeningForm').reset();selectionVersion++;$('equipmentSkates').textContent='';}
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
 let lastCheck=null;const undoButton=button('Ångra senaste bockning',async()=>{
  if(busy||!lastCheck)return;const previous=lastCheck,item=board.checklists.find(l=>l.id===previous.listId)?.items.find(i=>i.id===previous.itemId);
  if(!item||item.done!==previous.after){status('Checklistan har ändrats. Läs om innan du ändrar.');lastCheck=null;undoButton.hidden=true;return;}
  if(await change(b=>{b.checklists.find(l=>l.id===previous.listId).items.find(i=>i.id===previous.itemId).done=previous.before;},{optimistic:true})){lastCheck=null;undoButton.hidden=true;}
 });undoButton.hidden=true;$('equipmentStatus').after(undoButton);
 void load();
})();
