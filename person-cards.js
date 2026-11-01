// Person cards and sharpening orders share the team's material board and revision.
(() => {
 const {profileGroups,profileDescription}=window.SkateFields;
 const base=()=>String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
 const mergeRoot=typeof document!=='undefined'&&document.currentScript?.src?new URL('./',document.currentScript.src):null;
 const concurrency=()=>import(new URL('concurrency-merge.mjs?v='+encodeURIComponent(window.NSK_VERSION||'1'),mergeRoot));
 async function request(path,team,payload){
  const expectedToken=Auth.getToken();
  try{
   const signal=typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(15000):undefined;
   const response=await fetch(base()+path+(path.includes('?')?'&':'?')+'team_id='+encodeURIComponent(team),{method:payload?'PUT':'GET',headers:{Authorization:'Bearer '+expectedToken,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store',...(signal?{signal}:{})});
   let data;
   try{data=await response.json();}
   catch(error){
    if(['AbortError','TimeoutError'].includes(error.name))throw error;
    if(response.ok)throw Error('Svaret kunde inte läsas. Åtgärden kan inte bekräftas. Läs om kortet innan du försöker igen.');
    data={};
   }
   if(Auth.getToken()!==expectedToken)throw Error('Inloggningen ändrades. Öppna kortet igen.');
   if(!response.ok){const error=Error(data?.error||'Kortet kunde inte hämtas eller sparas.');error.status=response.status;throw error;}
   const cardResponse=path.startsWith('/api/person-card?');
   if(data?.ok!==true||!Number.isSafeInteger(data.revision)||data.revision<(payload?1:0)||cardResponse&&(!data.card||typeof data.card!=='object'||Array.isArray(data.card)))throw Error('Åtgärden kan inte bekräftas. Läs om kortet innan du försöker igen.');
   if(payload){window.NSKViewCache?.clear();try{sessionStorage.removeItem('nsk_view_cache_v1');}catch{}}
   return data;
  }catch(error){
   if(['AbortError','TimeoutError'].includes(error.name))error=Error('Anropet tog för lång tid. Läs om kortet innan du försöker igen.');
   if(payload&&!error.status)error.uncertain=true;
   throw error;
  }
 }
 const path=(kind,id)=>'/api/person-card?kind='+encodeURIComponent(kind)+'&person_id='+encodeURIComponent(id);
 const summaries=new Map();
 const summaryKey=(team,kind,id)=>JSON.stringify([Auth.getToken(),team,kind,String(id)]);
 function remember(team,kind,id,data){
  if(data.card){summaries.set(summaryKey(team,kind,id),{...data.card});if(window.dispatchEvent&&typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('nsk:person-card',{detail:{team,kind,id:String(id)}}));}
  return data;
 }
 const summary=(team,kind,id)=>summaries.get(summaryKey(team,kind,id));
 const get=async(team,kind,id)=>remember(team,kind,id,await request(path(kind,id),team));
 const save=async(team,kind,id,card,revision,baseCard)=>remember(team,kind,id,await request(path(kind,id),team,{card,revision,...(baseCard===undefined?{}:{base:{card:baseCard}})}));
 async function sharpening(team,kind,id,name,note='',pair='regular'){
  const board=await request('/api/equipment',team);
  const keys=pair==='both'?['regular','goalie']:[pair],needed=keys.filter(key=>!board.requests.some(r=>r.kind===kind&&r.personId===String(id)&&(r.pair||'regular')===key&&!r.done));if(!needed.length)throw Error('Det finns redan ett väntande slipönskemål.');
  return request('/api/equipment',team,{base:{requests:board.requests,checklists:board.checklists},revision:board.revision,requests:[...board.requests,...needed.map(key=>({id:crypto.randomUUID(),kind,personId:String(id),pair:key,name,note,done:false}))],checklists:board.checklists});
 }
 window.PersonCards={get,save,sharpening,profileDescription,summary};
 if(!document.getElementById('playersList'))return;
 const dialog=document.createElement('dialog');dialog.className='person-card-dialog';dialog.setAttribute('aria-labelledby','personCardTitle');
 dialog.innerHTML=`<div class="person-card-header"><h2 id="personCardTitle">Spelarkort</h2><button type="button" id="personCardClose" aria-label="Stäng kort">×</button></div><p id="personCardStatus" role="status" aria-live="polite"></p><div id="personCardContent" hidden><div class="person-card-identity"><button type="button" id="personCardAvatar" aria-label="Visa profilbild i stor storlek" aria-haspopup="dialog"><img src="../icon-192.png" alt="NSK:s klubbmärke" width="92" height="92"></button><div><h3 id="personCardName"></h3><p id="personCardTeam" class="person-card-team"></p><span id="personCardRole" class="person-card-badge"></span><section id="personCardIdentityFacts" class="person-card-identity-facts"><h3 id="personCardDetailsTitle">Spelaruppgifter</h3><dl id="personCardDetails" class="person-card-facts"></dl></section></div></div><div id="personCardOverview"><section class="person-card-section"><h3>Skridskor</h3><div class="person-card-pair"><h4 id="personCardRegularTitle">Ordinarie skridskor</h4><dl id="personCardSkates" class="person-card-facts"></dl><details id="personCardProfileInfo" class="person-card-profile-info" hidden><summary>Om profileringen</summary><p id="personCardProfileDescription" class="person-card-note"></p></details><p id="personCardNotes" class="person-card-note" hidden></p></div><div id="personCardGoalieOverview" class="person-card-pair" hidden><h4 id="personCardGoalieTitle">Målvaktsskridskor</h4><dl id="personCardGoalieFacts" class="person-card-facts"></dl><details id="personCardGoalieProfileInfo" class="person-card-profile-info" hidden><summary>Om profileringen</summary><p id="personCardGoalieProfileDescription" class="person-card-note"></p></details><p id="personCardGoalieNote" class="person-card-note" hidden></p></div></section></div><form id="personCardForm" hidden><h3 id="personCardEditTitle">Redigera spelarkort</h3><div class="person-card-fields"><label id="personCardNumberField">Tröjnummer (valfritt)<input name="number" inputmode="numeric" maxlength="3" pattern="[0-9]{0,3}" autocomplete="off"></label><label><span id="personCardPositionLabel">Position (valfritt)</span><input name="position" maxlength="60" placeholder="Ange position"></label><label>Right / Left<select name="hand"><option value="">Ej angivet</option><option value="Right">Right</option><option value="Left">Left</option></select></label></div><h3>Skridskor</h3><div class="person-card-fields"><label>Skridskomodell<input name="model" maxlength="100" placeholder="Märke och modell"></label><label>Skålradie<select name="hollow" aria-label="Skålradie"></select></label><label class="person-card-profile-field">Profilering<select name="profile" aria-label="Profilering" aria-describedby="personCardProfileHelp"></select><small id="personCardProfileHelp"></small></label><input type="hidden" name="radius"></div><label class="person-card-notes">Övriga skridskouppgifter<textarea name="notes" rows="3" maxlength="500" placeholder="Exempelvis skenmodell eller särskilda önskemål"></textarea></label><label id="personCardGoalieLabel"><input id="personCardGoalieEnabled" type="checkbox"> Har även målvaktsskridskor</label><section id="personCardGoalieFields" hidden><h3>Målvaktsskridskor</h3><div id="personCardGoalieEditor" class="person-card-fields"></div></section><div class="person-card-edit-actions"><button type="submit" id="personCardSave" class="nsk-action nsk-action--save">Spara kort</button><button type="button" id="personCardCancel">Avbryt</button></div></form><p class="person-card-hint">Skålradie och profilering följer med nya slipönskemål.</p><div class="person-card-actions"><label id="personCardPairLabel">Önska slipning för<select id="personCardSharpenPair" aria-label="Skridskopar"><option value="regular">Ordinarie skridskor</option><option value="goalie">Målvaktsskridskor</option><option value="both">Båda paren</option></select></label><button type="button" id="personCardSharpen" class="nsk-action nsk-action--save">Önska slipning</button><button type="button" id="personCardEdit">Redigera kort</button><button type="button" id="personCardDismiss">Stäng</button></div></div>`;
 const pairStyle=document.createElement('style');pairStyle.textContent='#personCardGoalieEnabled{width:22px;min-height:22px;height:22px;margin-right:8px}#personCardGoalieLabel{display:flex;align-items:center;margin:16px 0}#personCardGoalieEditor label{display:grid;gap:6px}.goalie-card-facts{grid-column:1/-1;font-size:.85rem;line-height:1.5}';document.head.append(pairStyle);
 document.body.append(dialog);
 const $=id=>dialog.querySelector('#'+id),form=$('personCardForm');
 const photoActions=document.createElement('div');photoActions.className='person-card-photo-actions';photoActions.innerHTML='<button type="button" id="personPhotoLibrary">Välj bild</button><button type="button" id="personPhotoCamera">Kamera</button><button type="button" id="personPhotoRemove">Ta bort bild</button><input type="file" id="personPhotoLibraryInput" accept="image/*" hidden><input type="file" id="personPhotoCameraInput" accept="image/*" capture="environment" hidden>';$('personCardAvatar').closest('.person-card-identity').after(photoActions);
 const photoViewer=document.createElement('dialog');photoViewer.className='person-photo-viewer';photoViewer.setAttribute('aria-labelledby','personPhotoViewerTitle');
 photoViewer.innerHTML='<div class="person-photo-viewer-header"><h2 id="personPhotoViewerTitle"></h2><button type="button" aria-label="Stäng bilden">×</button></div><div class="person-photo-viewer-image"></div>';
 document.body.append(photoViewer);
 function closePhotoViewer(){if(photoViewer.open)photoViewer.close();photoViewer.querySelector('.person-photo-viewer-image').replaceChildren();}
 photoViewer.querySelector('button').onclick=closePhotoViewer;
 photoViewer.addEventListener('cancel',event=>{event.preventDefault();closePhotoViewer();});
 photoViewer.addEventListener('click',event=>{if(event.target===photoViewer)closePhotoViewer();});
 window.addEventListener('nsk:session-changed',closePhotoViewer);window.addEventListener('nsk:team-changed',closePhotoViewer);
 $('personCardAvatar').onclick=()=>{
  if(!current)return;
  photoViewer.querySelector('h2').textContent=current.name;
  const image=document.createElement('img');image.src=$('personCardAvatar').querySelector('img')?.src||'../icon-192.png';image.alt='Profilbild för '+current.name;
  photoViewer.querySelector('.person-photo-viewer-image').replaceChildren(image);
  window.PersonPhotos?.mount(image,current.team,current.kind,current.id);
  photoViewer.showModal();
 };
 const recovery=document.createElement('button');recovery.type='button';recovery.hidden=true;form.after(recovery);
 const skateIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h5l1 7 7 3v4H4V9h1zM3 21h17l2-2M7 17v4m10-4v4M7 6h3m-3 3h4"/></svg>';
 for(const id of ['personCardRegularTitle','personCardGoalieTitle','personCardSharpen'])$(id).insertAdjacentHTML('afterbegin',skateIcon);
 $('personCardEdit').insertAdjacentHTML('afterbegin','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 16-1 5 5-1L21 7l-4-4zM14 6l4 4M4 16l4 4"/></svg>');

 let current=null,pending=false,version=0,conflicted=false,editing=false,goalieEditor=null;
 const status=text=>{$('personCardStatus').textContent=text;};
 const flatValues=()=>Object.fromEntries([...form.elements].filter(e=>e.name&&(e.name!=='radius'||Object.hasOwn(current.card,'radius'))).map(e=>[e.name,e.value.trim()]));
 const values=()=>({...flatValues(),goalieEnabled:$('personCardGoalieEnabled').checked,goalie:{radius:current.card.goalie?.radius||'',...goalieEditor.get()}});
 const dirty=()=>editing&&current&&JSON.stringify(values())!==JSON.stringify({...current.card,goalieEnabled:current.card.goalieEnabled??false,goalie:{radius:'',model:'',hollow:'17 mm',profile:'',notes:'',...current.card.goalie}});
 function selectionOptions(card=current.card){
  const hollow=form.elements.hollow,profile=form.elements.profile;
  hollow.replaceChildren(new Option('Ej angivet',''));
  for(let mm=15;mm<=25;mm++)hollow.append(new Option(mm+' mm',mm+' mm'));
  profile.replaceChildren(new Option('Ej angivet',''));
  for(const [label,items] of profileGroups){const group=document.createElement('optgroup');group.label=label;for(const [name,description] of items){const option=new Option(name,name);option.title=description;group.append(option);}profile.append(group);}
  // Retain values saved before these lists existed; never silently replace them.
  for(const field of [hollow,profile]){const value=card[field.name]||'';if(value&&![...field.options].some(o=>o.value===value))field.prepend(new Option('Tidigare värde: '+value,value));}
 }
 function showProfileHelp(){
  const description=profileDescription(form.elements.profile.value);
  $('personCardProfileHelp').textContent=description;$('personCardProfileHelp').hidden=!description;
 }
 function fillForm(card=current.card){goalieEditor=SkateFields.editor($('personCardGoalieEditor'),card.goalie||{hollow:'17 mm'});$('personCardGoalieEnabled').checked=!!card.goalieEnabled;$('personCardGoalieFields').hidden=!card.goalieEnabled;selectionOptions(card);for(const field of [...form.elements].filter(e=>e.name))field.value=card[field.name]||'';showProfileHelp();}
 $('personCardGoalieEnabled').onchange=()=>{$('personCardGoalieFields').hidden=!$('personCardGoalieEnabled').checked;};
 form.elements.profile.addEventListener('change',showProfileHelp);
 function facts(target,rows){
  target.replaceChildren();
  for(const [label,value] of rows){const item=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=value||'Ej angivet';item.append(term,detail);target.append(item);}
 }
 function render(){
  const player=current.kind==='player',card=current.card;
  $('personCardName').textContent=current.name;$('personCardRole').textContent=player&&card.number?'#'+card.number:player?'Spelare':'Tränare';
  $('personCardTeam').textContent=window.Auth?.activeTeam?.()||'';
  const avatar=$('personCardAvatar');
  avatar.replaceChildren();const image=document.createElement('img');image.src='../icon-192.png';image.alt='Profilbild för '+current.name;image.width=image.height=124;avatar.append(image);window.PersonPhotos?.mount(image,current.team,current.kind,current.id);
  $('personCardDetailsTitle').textContent=player?'Spelaruppgifter':'Tränaruppgifter';
  facts($('personCardDetails'),player?[['Position',card.position],['Fattning',card.hand]]:[['Tränarroll / ansvar',card.position],['Klubbfattning',card.hand]]);
  facts($('personCardSkates'),[['Skålradie',card.hollow],['Profilering',card.profile],['Skridskomodell',card.model]]);
  const description=profileDescription(card.profile);$('personCardProfileDescription').textContent=description;$('personCardProfileInfo').hidden=!description;
  $('personCardNotes').textContent=card.notes;$('personCardNotes').hidden=!card.notes;
  $('personCardNumberField').hidden=!player;$('personCardGoalieLabel').hidden=!player;
  $('personCardGoalieOverview').hidden=!card.goalieEnabled;
  if(card.goalieEnabled){facts($('personCardGoalieFacts'),[['Skålradie',card.goalie?.hollow],['Profilering',card.goalie?.profile],['Skridskomodell',card.goalie?.model]]);const description=profileDescription(card.goalie?.profile);$('personCardGoalieProfileDescription').textContent=description;$('personCardGoalieProfileInfo').hidden=!description;$('personCardGoalieNote').textContent=card.goalie?.notes||'';$('personCardGoalieNote').hidden=!card.goalie?.notes;}
  $('personCardPositionLabel').textContent=player?'Position (valfritt)':'Tränarroll / ansvar (valfritt)';
  form.elements.position.placeholder=player?'Ange position':'Exempelvis huvudtränare eller målvaktstränare';
  $('personCardEditTitle').textContent=player?'Redigera spelarkort':'Redigera tränarkort';
  $('personCardIdentityFacts').hidden=editing;$('personCardOverview').hidden=editing;form.hidden=!editing;controls();
 }
 function controls(){
  recovery.hidden=!conflicted;recovery.disabled=pending;recovery.textContent=editing?'Hämta senaste och granska mina ändringar':'Läs om kortet';
  for(const field of [...form.elements].filter(e=>e.name))field.disabled=pending||conflicted||!current||(['number','position','hand'].includes(field.name)?!current.canEditProfile:!current.canEditSkates);
  $('personCardSave').disabled=pending||conflicted;
  photoActions.hidden=!current?.canEditPhoto;for(const button of photoActions.querySelectorAll('button'))button.disabled=pending||conflicted;
  $('personCardEdit').hidden=editing||!current?.canEditSkates;$('personCardEdit').disabled=pending||conflicted;
  $('personCardSharpenPair').disabled=pending||conflicted||!current?.canRequest;$('personCardSharpenPair').hidden=editing||!current?.canRequest||!current.card.goalieEnabled;$('personCardPairLabel').hidden=$('personCardSharpenPair').hidden;for(const field of dialog.querySelectorAll('#personCardGoalieFields input,#personCardGoalieFields select,#personCardGoalieFields textarea,#personCardGoalieEnabled'))field.disabled=pending||conflicted||!current?.canEditSkates;
  $('personCardSharpen').hidden=editing||!current?.canRequest;$('personCardSharpen').disabled=pending||conflicted;
  for(const id of ['personCardClose','personCardDismiss','personCardCancel'])$(id).disabled=pending;
 }
 function close(){if(pending)return;if(dirty()&&!confirm('Stäng kortet utan att spara ändringarna?'))return;version++;closePhotoViewer();dialog.close();current=null;}
 $('personCardClose').onclick=close;$('personCardDismiss').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 $('personCardEdit').onclick=()=>{if(!current||pending||conflicted)return;editing=true;fillForm();render();form.querySelector('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')?.focus();};
 $('personCardCancel').onclick=()=>{if(pending)return;fillForm();editing=false;render();status('');};
 async function open(target){
  if(pending)return;
  const [kind,id]=target.dataset.rosterName.split(':'),team=target.dataset.rosterTeam;

  for(const id of ['personCardProfileInfo','personCardGoalieProfileInfo'])$(id).open=false;
  const generation=++version;current=null;conflicted=false;editing=false;$('personCardContent').hidden=true;status('Hämtar kort…');
  $('personCardTitle').textContent=kind==='player'?'Spelarkort':'Tränarkort';dialog.showModal();
  try{
   const data=await get(team,kind,id);if(generation!==version)return;
   current={...data,team,kind,id};fillForm();render();$('personCardContent').hidden=false;
   status(data.canEditSkates?'':'Du har läsbehörighet.');
  }catch(error){if(generation===version)status(error.message);}
 }
 document.addEventListener('click',event=>{const target=event.target.closest('[data-roster-name][data-roster-team]');if(!target)return;event.preventDefault();void open(target);});
 async function recoverConflict(){
  if(!current||pending||!conflicted)return;
  const previous=current,expectedToken=Auth.getToken(),generation=version,draft=editing?values():null;
  pending=true;controls();status('Hämtar senaste kortet…');
  try{
   const latest=await get(previous.team,previous.kind,previous.id);
   let proposed=latest.card;
   if(draft){
    if(!latest.canEditSkates||!latest.canEditProfile&&['number','position','hand'].some(k=>draft[k]!==previous.card[k]))throw Error('Din behörighet att ändra kortet har ändrats. Utkastet är inte sparat.');
    const {mergeConcurrent}=await concurrency();
    proposed=mergeConcurrent(previous.card,draft,latest.card,true);
   }
   if(current!==previous||version!==generation||Auth.getToken()!==expectedToken)throw Error('Inloggningen eller kortet ändrades. Öppna kortet igen.');
   current={...previous,...latest};conflicted=false;fillForm(proposed);render();
   status(draft?'Senaste kortet är hämtat. Dina ändringar finns kvar i formuläret. Granska och tryck Spara kort.':'Senaste kortet är hämtat.');
  }catch(error){status(error.message+' Inga ändringar har sparats.');}
  finally{pending=false;controls();}
 }
 recovery.onclick=()=>void recoverConflict();
 async function perform(action){
  if(!current||pending||conflicted)return;pending=true;controls();
  try{await action();}catch(error){if(error.status===409||error.uncertain){conflicted=true;status(error.message+' Läs om kortet med knappen nedan.');}else status(error.message+' Ändringen har inte bekräftats som sparad.');}
  finally{pending=false;controls();}
 }
 form.onsubmit=event=>{event.preventDefault();void perform(async()=>{
  status('Sparar kort…');const result=await save(current.team,current.kind,current.id,values(),current.revision,current.card);
  current.card=result.card;current.revision=result.revision;editing=false;fillForm();render();status('Kortet är sparat.');
 });};
 async function changePhoto(file,remove=false){if(!current?.canEditPhoto||!window.PersonPhotos)return;await perform(async()=>{status(remove?'Tar bort profilbild…':'Förbereder profilbild…');const target=current,photo=remove?null:await PersonPhotos.compress(file),latest=await PersonPhotos.get(target.team,target.kind,target.id);if(!latest.canEdit)throw Error('Din behörighet att ändra bilden har ändrats.');await PersonPhotos.save(target.team,target.kind,target.id,photo,latest.revision);render();status(remove?'Profilbilden är borttagen. NSK-loggan visas.':'Profilbilden är sparad och synkas med Truppen.');});}
 $('personPhotoLibrary').onclick=()=>$('personPhotoLibraryInput').click();$('personPhotoCamera').onclick=()=>$('personPhotoCameraInput').click();
 for(const id of ['personPhotoLibraryInput','personPhotoCameraInput'])$(id).onchange=event=>{const file=event.target.files?.[0];event.target.value='';if(file)void changePhoto(file);};
 $('personPhotoRemove').onclick=()=>void changePhoto(null,true);
 $('personCardSharpen').onclick=()=>void perform(async()=>{
  status('Skapar slipönskemål…');
  if(!current.card.hollow&&!confirm('Skålradie saknas. Skicka önskemålet ändå med uppmaning till materialförvaltaren att kontrollera skålradien?')){status('Ange skålradie innan du skickar önskemålet.');return;}
  const result=await sharpening(current.team,current.kind,current.id,current.name,'',current.card.goalieEnabled?$('personCardSharpenPair').value:'regular');
  current.revision=result.revision;status('Slipönskemålet är sparat hos Materialförvaltare med kortets skridskouppgifter.');
 });
})();
