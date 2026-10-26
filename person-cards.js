// Person cards and sharpening orders share the team's material board and revision.
(() => {
 const {profileGroups,profileDescription}=window.SkateFields;
 const base=()=>String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
 async function request(path,team,payload){
  const response=await fetch(base()+path+(path.includes('?')?'&':'?')+'team_id='+encodeURIComponent(team),{method:payload?'PUT':'GET',headers:{Authorization:'Bearer '+Auth.getToken(),...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok){const error=Error(data.error||'Kortet kunde inte hämtas eller sparas.');error.status=response.status;throw error;}
  if(payload){window.NSKViewCache?.clear();try{sessionStorage.removeItem('nsk_view_cache_v1');}catch{}}
  return data;
 }
 const path=(kind,id)=>'/api/person-card?kind='+encodeURIComponent(kind)+'&person_id='+encodeURIComponent(id);
 const get=(team,kind,id)=>request(path(kind,id),team);
 const save=(team,kind,id,card,revision)=>request(path(kind,id),team,{card,revision});
 async function sharpening(team,kind,id,name,note='',pair='regular'){
  const board=await request('/api/equipment',team);
  const keys=pair==='both'?['regular','goalie']:[pair],needed=keys.filter(key=>!board.requests.some(r=>r.kind===kind&&r.personId===String(id)&&(r.pair||'regular')===key&&!r.done));if(!needed.length)throw Error('Det finns redan ett väntande slipönskemål.');
  return request('/api/equipment',team,{revision:board.revision,requests:[...board.requests,...needed.map(key=>({id:crypto.randomUUID(),kind,personId:String(id),pair:key,name,note,done:false}))],checklists:board.checklists});
 }
 window.PersonCards={get,save,sharpening,profileDescription};
 if(!document.getElementById('playersList'))return;
 const dialog=document.createElement('dialog');dialog.className='person-card-dialog';dialog.setAttribute('aria-labelledby','personCardTitle');
 dialog.innerHTML=`<div class="person-card-header"><h2 id="personCardTitle">Spelarkort</h2><button type="button" id="personCardClose" aria-label="Stäng kort">×</button></div><p id="personCardStatus" role="status" aria-live="polite"></p><div id="personCardContent" hidden><div class="person-card-identity"><div id="personCardAvatar"><img src="../icon-192.png" alt="NSK:s klubbmärke" width="92" height="92"></div><h3 id="personCardName"></h3><span id="personCardRole" class="person-card-badge"></span></div><div id="personCardOverview"><section class="person-card-section"><h3 id="personCardDetailsTitle">Spelaruppgifter</h3><dl id="personCardDetails" class="person-card-facts"></dl></section><section class="person-card-section"><h3>Skridskor</h3><dl id="personCardSkates" class="person-card-facts"></dl><p id="personCardProfileDescription" class="person-card-note" hidden></p><p id="personCardNotes" class="person-card-note" hidden></p></section></div><form id="personCardForm" hidden><h3 id="personCardEditTitle">Redigera spelarkort</h3><div class="person-card-fields"><label id="personCardNumberField">Tröjnummer (valfritt)<input name="number" inputmode="numeric" maxlength="3" pattern="[0-9]{0,3}" autocomplete="off"></label><label><span id="personCardPositionLabel">Position (valfritt)</span><input name="position" maxlength="60" placeholder="Ange position"></label><label>Right / Left<select name="hand"><option value="">Ej angivet</option><option value="Right">Right</option><option value="Left">Left</option></select></label></div><h3>Skridskor</h3><div class="person-card-fields"><label>Skridskomodell<input name="model" maxlength="100" placeholder="Märke och modell"></label><label>Skålradie<select name="hollow" aria-label="Skålradie"></select></label><label class="person-card-profile-field">Profilering<select name="profile" aria-label="Profilering" aria-describedby="personCardProfileHelp"></select><small id="personCardProfileHelp"></small></label><input type="hidden" name="radius"></div><label class="person-card-notes">Övriga skridskouppgifter<textarea name="notes" rows="3" maxlength="500" placeholder="Exempelvis skenmodell eller särskilda önskemål"></textarea></label><label id="personCardGoalieLabel"><input id="personCardGoalieEnabled" type="checkbox"> Har även målvaktsskridskor</label><section id="personCardGoalieFields" hidden><h3>Målvaktsskridskor</h3><div id="personCardGoalieEditor" class="person-card-fields"></div></section><div class="person-card-edit-actions"><button type="submit" id="personCardSave" class="nsk-action nsk-action--save">Spara kort</button><button type="button" id="personCardCancel">Avbryt</button></div></form><p class="person-card-hint">Skålradie och profilering följer med nya slipönskemål.</p><div class="person-card-actions"><select id="personCardSharpenPair" aria-label="Skridskopar"><option value="regular">Ordinarie skridskor</option><option value="goalie">Målvaktsskridskor</option><option value="both">Båda paren</option></select><button type="button" id="personCardSharpen" class="nsk-action nsk-action--save">Önska slipning</button><button type="button" id="personCardEdit">Redigera kort</button><button type="button" id="personCardDismiss">Stäng</button></div></div>`;
 const pairStyle=document.createElement('style');pairStyle.textContent='#personCardGoalieEnabled{width:22px;min-height:22px;height:22px;margin-right:8px}#personCardGoalieLabel{display:flex;align-items:center;margin:16px 0}#personCardGoalieEditor label{display:grid;gap:6px}.goalie-card-facts{grid-column:1/-1;font-size:.85rem;line-height:1.5}';document.head.append(pairStyle);
 document.body.append(dialog);
 const $=id=>dialog.querySelector('#'+id),form=$('personCardForm');
 let current=null,pending=false,version=0,conflicted=false,editing=false,goalieEditor=null;
 const status=text=>{$('personCardStatus').textContent=text;};
 const flatValues=()=>Object.fromEntries([...form.elements].filter(e=>e.name&&(e.name!=='radius'||Object.hasOwn(current.card,'radius'))).map(e=>[e.name,e.value.trim()]));
 const values=()=>({...flatValues(),goalieEnabled:$('personCardGoalieEnabled').checked,goalie:{radius:current.card.goalie?.radius||'',...goalieEditor.get()}});
 const dirty=()=>editing&&current&&JSON.stringify(values())!==JSON.stringify({...current.card,goalieEnabled:current.card.goalieEnabled??false,goalie:{radius:'',model:'',hollow:'17 mm',profile:'',notes:'',...current.card.goalie}});
 function selectionOptions(){
  const hollow=form.elements.hollow,profile=form.elements.profile;
  hollow.replaceChildren(new Option('Ej angivet',''));
  for(let mm=15;mm<=25;mm++)hollow.append(new Option(mm+' mm',mm+' mm'));
  profile.replaceChildren(new Option('Ej angivet',''));
  for(const [label,items] of profileGroups){const group=document.createElement('optgroup');group.label=label;for(const [name,description] of items){const option=new Option(name,name);option.title=description;group.append(option);}profile.append(group);}
  // Retain values saved before these lists existed; never silently replace them.
  for(const field of [hollow,profile]){const value=current.card[field.name]||'';if(value&&![...field.options].some(o=>o.value===value))field.prepend(new Option('Tidigare värde: '+value,value));}
 }
 function showProfileHelp(){
  const description=profileDescription(form.elements.profile.value);
  $('personCardProfileHelp').textContent=description;$('personCardProfileHelp').hidden=!description;
 }
 function fillForm(){goalieEditor=SkateFields.editor($('personCardGoalieEditor'),current.card.goalie||{hollow:'17 mm'});$('personCardGoalieEnabled').checked=!!current.card.goalieEnabled;$('personCardGoalieFields').hidden=!current.card.goalieEnabled;selectionOptions();for(const field of [...form.elements].filter(e=>e.name))field.value=current.card[field.name]||'';showProfileHelp();}
 $('personCardGoalieEnabled').onchange=()=>{$('personCardGoalieFields').hidden=!$('personCardGoalieEnabled').checked;};
 form.elements.profile.addEventListener('change',showProfileHelp);
 function facts(target,rows){
  target.replaceChildren();
  for(const [label,value] of rows){const item=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=value||'Ej angivet';item.append(term,detail);target.append(item);}
 }
 function render(){
  const player=current.kind==='player',card=current.card;
  $('personCardName').textContent=current.name;$('personCardRole').textContent=player?'Spelare':'Tränare';
  $('personCardDetailsTitle').textContent=player?'Spelaruppgifter':'Tränaruppgifter';
  facts($('personCardDetails'),player?[['Tröjnummer',card.number],['Position',card.position],['Fattning',card.hand]]:[['Tränarroll / ansvar',card.position],['Klubbfattning',card.hand]]);
  facts($('personCardSkates'),[['Skålradie',card.hollow],['Profilering',card.profile],['Skridskomodell',card.model]]);
  const description=profileDescription(card.profile);$('personCardProfileDescription').textContent=description;$('personCardProfileDescription').hidden=!description;
  $('personCardNotes').textContent=card.notes;$('personCardNotes').hidden=!card.notes;
  $('personCardNumberField').hidden=!player;$('personCardGoalieLabel').hidden=!player;if(!editing&&card.goalieEnabled){const section=document.createElement('div');section.className='goalie-card-facts';section.textContent='Målvaktsskridskor · Skålradie: '+(card.goalie?.hollow||'Ej angivet')+' · Profilering: '+(card.goalie?.profile||'Ej angiven');$('personCardSkates').append(section);}
  $('personCardPositionLabel').textContent=player?'Position (valfritt)':'Tränarroll / ansvar (valfritt)';
  form.elements.position.placeholder=player?'Ange position':'Exempelvis huvudtränare eller målvaktstränare';
  $('personCardEditTitle').textContent=player?'Redigera spelarkort':'Redigera tränarkort';
  $('personCardOverview').hidden=editing;form.hidden=!editing;controls();
 }
 function controls(){
  for(const field of [...form.elements].filter(e=>e.name))field.disabled=pending||conflicted||!current||(['number','position','hand'].includes(field.name)?!current.canEditProfile:!current.canEditSkates);
  $('personCardSave').disabled=pending||conflicted;
  $('personCardEdit').hidden=editing||!current?.canEditSkates;$('personCardEdit').disabled=pending||conflicted;
  $('personCardSharpenPair').disabled=pending||conflicted||!current?.canRequest;$('personCardSharpenPair').hidden=editing||!current?.canRequest||!current.card.goalieEnabled;for(const field of dialog.querySelectorAll('#personCardGoalieFields input,#personCardGoalieFields select,#personCardGoalieFields textarea,#personCardGoalieEnabled'))field.disabled=pending||conflicted||!current?.canEditSkates;
  $('personCardSharpen').hidden=editing||!current?.canRequest;$('personCardSharpen').disabled=pending||conflicted;
  for(const id of ['personCardClose','personCardDismiss','personCardCancel'])$(id).disabled=pending;
 }
 function close(){if(pending)return;if(dirty()&&!confirm('Stäng kortet utan att spara ändringarna?'))return;version++;dialog.close();current=null;}
 $('personCardClose').onclick=close;$('personCardDismiss').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 $('personCardEdit').onclick=()=>{if(!current||pending||conflicted)return;editing=true;fillForm();render();form.querySelector('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')?.focus();};
 $('personCardCancel').onclick=()=>{if(pending)return;fillForm();editing=false;render();status('');};
 async function open(target){
  if(pending)return;
  const [kind,id]=target.dataset.rosterName.split(':'),team=target.dataset.rosterTeam;

  const generation=++version;current=null;conflicted=false;editing=false;$('personCardContent').hidden=true;status('Hämtar kort…');
  $('personCardTitle').textContent=kind==='player'?'Spelarkort':'Tränarkort';dialog.showModal();
  try{
   const data=await get(team,kind,id);if(generation!==version)return;
   current={...data,team,kind,id};fillForm();render();$('personCardContent').hidden=false;
   status(data.canEditSkates?'':'Du har läsbehörighet.');
  }catch(error){if(generation===version)status(error.message);}
 }
 document.addEventListener('click',event=>{const target=event.target.closest('[data-roster-name][data-roster-team]');if(!target)return;event.preventDefault();void open(target);});
 async function perform(action){
  if(!current||pending||conflicted)return;pending=true;controls();
  try{await action();}catch(error){if(error.status===409){conflicted=true;status(error.message+' Stäng och öppna kortet igen.');}else status(error.message+' Ändringen har inte bekräftats som sparad.');}
  finally{pending=false;controls();}
 }
 form.onsubmit=event=>{event.preventDefault();void perform(async()=>{
  status('Sparar kort…');const result=await save(current.team,current.kind,current.id,values(),current.revision);
  current.card=result.card;current.revision=result.revision;editing=false;fillForm();render();status('Kortet är sparat.');
 });};
 $('personCardSharpen').onclick=()=>void perform(async()=>{
  status('Skapar slipönskemål…');
  if(!current.card.hollow&&!confirm('Skålradie saknas. Skicka önskemålet ändå med uppmaning till materialförvaltaren att kontrollera skålradien?')){status('Ange skålradie innan du skickar önskemålet.');return;}
  const result=await sharpening(current.team,current.kind,current.id,current.name,'',current.card.goalieEnabled?$('personCardSharpenPair').value:'regular');
  current.revision=result.revision;status('Slipönskemålet är sparat hos Materialförvaltare med kortets skridskouppgifter.');
 });
})();
