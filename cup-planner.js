// Cup information is rendered as text; imported HTML never runs in the app.
(()=>{
 const $=id=>document.getElementById(id),base=()=>String(window.APP_CONFIG?.API_URL||'').replace(/\/$/,'');
 let teamId='',session=null,plans=[],canEdit=false,draft=null,busy=false,dirty=false;
 const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 const message=text=>$('cupStatus').textContent=text;
 function sameSession(){return session&&Auth.getToken()===session.token&&Auth.activeTeam()===session.team;}
 async function api(method,body){
  if(!sameSession())throw Error('Inloggningen eller lagvalet ändrades. Öppna sidan igen.');
  const response=await fetch(base()+'/api/cups?team_id='+encodeURIComponent(teamId),{method,headers:{Authorization:'Bearer '+session.token,...(body?{'Content-Type':'application/json'}:{})},cache:'no-store',signal:AbortSignal.timeout(45000),...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));if(!sameSession())throw Error('Inloggningen eller lagvalet ändrades. Öppna sidan igen.');
  if(!response.ok||data.ok!==true)throw Error(data.error||'Cupplaneraren kunde inte nås. Försök igen.');return data;
 }
 function setBusy(value){busy=value;for(const el of document.querySelectorAll('#cupImportForm button,#cupSaveForm input,#cupSaveForm select,#cupSaveForm textarea,#cupSaveForm button,#cupList button,#cupReload'))el.disabled=value||(!canEdit&&el.id!=='cupReload');}
 function markDirty(){dirty=true;window.NSKShellHost?.dirty(window);}
 function clearDirty(){dirty=false;window.NSKShellHost?.clean(window);}
 function cupView(cup){
  const root=node('div'),facts=node('dl',undefined,'cup-facts');
  for(const [label,value]of [['Datum',cup.startDate?[cup.startDate,cup.endDate&&cup.endDate!==cup.startDate?cup.endDate:''].filter(Boolean).join(' – '):cup.dateLabel],['Plats',cup.place],['Ålder/klass',cup.age],['Hämtad',new Date(cup.fetchedAt).toLocaleString('sv-SE')]]){const part=node('div');part.append(node('dt',label),node('dd',value||'Inte angivet'));facts.append(part);}root.append(facts);
  const source=node('a','Öppna cupen på Cuponline');source.href=cup.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';root.append(source);
  for(const warning of cup.warnings||[])root.append(node('p',warning,'cup-warning'));
  const disclosure=(title,text)=>{if(!text)return;const details=node('details');details.append(node('summary',title),node('p',text,'cup-source-text'));root.append(details);};
  disclosure('Information, spelform och avgifter',cup.info);disclosure('Hallar och adresser',cup.arenas);
  const teams=node('details');teams.append(node('summary','Anmälda lag ('+cup.teams.length+' hämtade)'));if(cup.teams.length){const ul=node('ul');for(const name of cup.teams)ul.append(node('li',name));teams.append(ul);}else teams.append(node('p','Inga lag kunde läsas. Kontrollera originalet på Cuponline.'));root.append(teams);
  const games=node('details');games.append(node('summary','Spelschema'));
  if(cup.schedule.length){const wrap=node('div',undefined,'cup-table-wrap'),table=node('table');if(cup.scheduleHeaders.length){const tr=node('tr');for(const cell of cup.scheduleHeaders)tr.append(node('th',cell));const head=node('thead');head.append(tr);table.append(head);}const body=node('tbody');for(const row of cup.schedule){const tr=node('tr');for(const cell of row)tr.append(node('td',cell));body.append(tr);}table.append(body);wrap.append(table);games.append(wrap);}else games.append(node('p','Inget läsbart spelschema hämtat ännu. Kontrollera originalet på Cuponline.'));root.append(games);return root;
 }
 function openEditor(plan){
  if(dirty&&!confirm('Lämna osparade ändringar?'))return false;
  draft=structuredClone(plan);$('cupEditorTitle').textContent=plan.cup.name;$('cupPreview').replaceChildren(cupView(plan.cup));$('cupNotes').value=plan.notes;$('cupPlanStatus').value=plan.status;$('cupEditor').hidden=false;clearDirty();setBusy(false);$('cupEditor').scrollIntoView?.({behavior:'smooth',block:'start'});return true;
 }
 function render(){
  const root=$('cupList');root.replaceChildren();
  if(!plans.length){root.append(node('p','Inga cuper sparade ännu.'));return;}
  for(const plan of [...plans].sort((a,b)=>(a.cup.startDate||'9999').localeCompare(b.cup.startDate||'9999')||a.cup.name.localeCompare(b.cup.name,'sv'))){
   const details=node('details',undefined,'card'),summary=node('summary');summary.append(node('strong',plan.cup.name),node('span',[plan.cup.startDate||plan.cup.dateLabel,plan.cup.place,plan.status].filter(Boolean).join(' • ')));const content=node('div',undefined,'cup-content');content.append(cupView(plan.cup));if(plan.notes)content.append(node('h3','Egna anteckningar'),node('p',plan.notes,'cup-source-text'));
   if(canEdit){const actions=node('div',undefined,'cup-actions'),edit=node('button','Öppna planering'),remove=node('button','Ta bort');edit.type=remove.type='button';edit.onclick=()=>{if(!busy)openEditor(plan);};remove.onclick=async()=>{if(busy||!confirm('Ta bort den sparade planeringen för '+plan.cup.name+'?'))return;setBusy(true);try{await api('DELETE',{cupId:plan.cup.cupId,revision:plan.revision});if(draft?.cup.cupId===plan.cup.cupId){draft=null;$('cupEditor').hidden=true;clearDirty();}await load();message('Cupplaneringen är borttagen.');}catch(error){message(error.message);}finally{setBusy(false);}};actions.append(edit,remove);content.append(actions);}details.append(summary,content);root.append(details);
  }
 }
 async function load(){const data=await api('GET');plans=data.plans;canEdit=data.canEdit;render();$('cupImportSection').hidden=!canEdit;setBusy(busy);}
 async function preview(url,existing=null){
  if(busy||!canEdit)return;
  if(dirty&&!existing&&!confirm('Lämna osparade ändringar?'))return;
  setBusy(true);message('Hämtar cupuppgifter från Cuponline…');
  try{const data=await api('POST',{url}),saved=existing||plans.find(p=>p.cup.cupId===data.cup.cupId);const plan={cup:data.cup,notes:existing?$('cupNotes').value:saved?.notes||'',status:existing?$('cupPlanStatus').value:saved?.status||'Planerad',revision:saved?.revision||0};clearDirty();openEditor(plan);markDirty();message('Cupuppgifterna är hämtade. Granska och spara planeringen.');}catch(error){message(error.message);}finally{setBusy(false);}
 }
 document.addEventListener('DOMContentLoaded',async()=>{
  $('cupImportForm').addEventListener('submit',event=>{event.preventDefault();void preview($('cupUrl').value.trim());});
  for(const id of ['cupNotes','cupPlanStatus'])$(id).addEventListener('input',markDirty);
  $('cupCancel').onclick=()=>{if(busy||(dirty&&!confirm('Lämna osparade ändringar?')))return;draft=null;$('cupEditor').hidden=true;clearDirty();};
  $('cupRefresh').onclick=()=>{if(draft)void preview(draft.cup.sourceUrl,draft);};
  $('cupReload').onclick=async()=>{if(busy)return;setBusy(true);try{await load();message('Listan är uppdaterad.');}catch(error){message(error.message);}finally{setBusy(false);}};
  $('cupSaveForm').addEventListener('submit',async event=>{event.preventDefault();if(!draft||busy||!canEdit)return;setBusy(true);try{const result=await api('PUT',{cup:draft.cup,notes:$('cupNotes').value,status:$('cupPlanStatus').value,revision:draft.revision});draft.revision=result.revision;draft.notes=$('cupNotes').value;draft.status=$('cupPlanStatus').value;clearDirty();message('Cupplaneringen är sparad.');try{await load();}catch{message('Cupplaneringen är sparad, men listan kunde inte uppdateras.');}}catch(error){message(error.message);}finally{setBusy(false);}});
  try{await Auth.init();session={token:Auth.getToken(),team:Auth.activeTeam()};if(!session.token||!session.team)throw Error('Logga in och välj lag.');const response=await fetch(base()+'/api/lag',{headers:{Authorization:'Bearer '+session.token},cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Lagkopplingen kunde inte hämtas.');const data=await response.json(),teams=(data.results||[]).filter(t=>t.Namn===session.team&&String(t['Säsong'])==='2026');if(!sameSession()||teams.length!==1)throw Error('Lagkopplingen kunde inte verifieras.');teamId=String(teams[0].id);await load();message('');}catch(error){message(error.message);}
 });
})();
