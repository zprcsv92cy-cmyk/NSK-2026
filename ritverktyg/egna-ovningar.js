// Device-local archive for exercises drawn with NSK's rink editor; no API writes.
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const isDrawing=entry=>entry?.origin==='rink-drawer'||entry?.filename==='hockeyovning.svg';
 function text(tag,value,className){const n=document.createElement(tag);n.textContent=value;if(className)n.className=className;return n;}
 function openExerciseDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('nsk_exercise_files_v1',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('files'))r.result.createObjectStore('files',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function exerciseTransaction(mode,work){const db=await openExerciseDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',mode),r=work(tx.objectStore('files'));let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
 const getFiles=async()=>{const files=await exerciseTransaction('readonly',os=>os.getAll());return files.filter(isDrawing);};
 let ownFiles=[],drawingUrls=[],previewUrl=null,refreshGeneration=0;
 function openPreview(entry){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(entry.blob);$('drawingPreviewImage').src=previewUrl;$('drawingPreviewImage').alt=entry.title;$('drawingPreviewTitle').textContent=entry.title;$('drawingPreviewDescription').textContent=entry.description||'';$('drawingPreview').showModal();}
 function closePreview(){ $('drawingPreview').close();$('drawingPreviewImage').removeAttribute('src');if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;} }
 function renderOwn(){
  drawingUrls.forEach(u=>URL.revokeObjectURL(u));drawingUrls=[];const root=$('drawingList');root.replaceChildren();const q=$('drawingSearch').value.trim().toLocaleLowerCase('sv'),cat=$('drawingCategory').value;
  const files=ownFiles.filter(e=>(!q||(e.title+' '+e.description).toLocaleLowerCase('sv').includes(q))&&(!cat||e.category===cat));
  for(const entry of files){const card=text('article','','archive-item');const img=document.createElement('img'),url=URL.createObjectURL(entry.blob);drawingUrls.push(url);img.src=url;img.alt=entry.title;img.loading='lazy';card.append(text('h3',entry.title),text('p',entry.category,'small'),img);const actions=text('div','','archive-actions');actions.append(planButton('Visa övning',()=>openPreview(entry)),planButton('Ta bort övning',async()=>{if(!confirm('Ta bort övningen från denna enhet? Kopior i sparade träningar behålls.'))return;try{await exerciseTransaction('readwrite',os=>os.delete(entry.id));await refreshAll();}catch(error){$('drawingStatus').textContent='Kunde inte ta bort: '+error.message;}}));card.append(actions);root.append(card);}
  if(!files.length)root.append(text('p',ownFiles.length?'Inga övningar matchar filtret.':'Inga ritade övningar sparade ännu. Öppna ritverktyget, ge övningen namn och kategori och spara den.','archive-empty'));
  $('drawingStatus').textContent=files.length+' egna övningar';
 }
 async function refreshAll(){const generation=++refreshGeneration;try{const files=await getFiles();if(generation!==refreshGeneration)return;ownFiles=files.sort((a,b)=>b.created-a.created);const picker=$('drawingCategory'),selected=picker.value;picker.replaceChildren(new Option('Alla kategorier',''));for(const cat of [...new Set(ownFiles.map(e=>e.category))].sort((a,b)=>a.localeCompare(b,'sv')))picker.append(new Option(cat,cat));picker.value=[...picker.options].some(o=>o.value===selected)?selected:'';renderOwn();await refreshTrainingChoices();await loadTrainingPlans();}catch(error){$('drawingStatus').textContent='Övningsarkivet kunde inte öppnas: '+error.message;}}
 const render=refreshAll;
  // Complete sessions are stored separately from individual exercise files.
  let trainingParts=[],trainingEditing=null,trainingChoices=[],trainingChoicesGeneration=0,trainingBusy=false;
  const selectedExercises=new Set();
  function trainingSnapshot(entry){
    const copy={};for(const key of ['title','category','description','filename','blob','sourceUrl','searchUrl','equipment','coaching','age','minutes'])if(entry[key]!==undefined)copy[key]=entry[key];return copy;
  }
  function validateTraining(title,parts){
    if(typeof title!=='string'||!title.trim()||title.trim().length>100)throw Error('Ge träningen ett namn på högst 100 tecken.');
    if(!Array.isArray(parts)||!parts.length||parts.length>40)throw Error('Välj mellan 1 och 40 övningar till träningen.');
    let bytes=0;
    for(const part of parts){
      if(part.source!=='file'||!part.exercise?.title||!Number.isInteger(Number(part.minutes))||Number(part.minutes)<1||Number(part.minutes)>180)throw Error('Varje övning behöver 1–180 hela minuter.');
      if(part.source==='file'){if(!(part.exercise.blob instanceof Blob)||part.exercise.blob.size>15*1024*1024)throw Error('En övningsfil saknas eller är för stor.');bytes+=part.exercise.blob.size;}
    }
    if(bytes>50*1024*1024)throw Error('Träningens övningsfiler får vara högst 50 MB tillsammans.');
    return parts.map(p=>({...p,minutes:Number(p.minutes),exercise:trainingSnapshot(p.exercise)}));
  }
  function openTrainingDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('nsk_training_plans_v1',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('plans'))req.result.createObjectStore('plans',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function trainingTransaction(mode,work){const db=await openTrainingDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('plans',mode),request=work(tx.objectStore('plans'));let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
  async function storeTraining(record,expectedRevision){
    const db=await openTrainingDb();try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('plans','readwrite'),os=tx.objectStore('plans'),request=os.get(record.id);let error;
      request.onsuccess=()=>{const current=request.result;if((current?.revision||0)!==expectedRevision||(expectedRevision&&!current)){error=Error('Träningen har ändrats i ett annat fönster. Dina ändringar finns kvar. Öppna senaste träningen eller spara som en ny träning.');tx.abort();return;}os.put(record);};
      tx.oncomplete=()=>resolve(record);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(error||tx.error||Error('Sparningen avbröts.'));
    });}finally{db.close();}
  }
  function planMessage(value){$('trainingPlanStatus').textContent=value;}
  function planButton(label,run){const button=text('button',label);button.type='button';button.onclick=()=>{if(!trainingBusy)return run();};return button;}
  function showTrainingExercise(part){
    const canView=part.source==='nsk'||/^image\//.test(part.exercise.blob?.type||'')||part.exercise.blob?.type==='application/pdf'||/\.(svg|png|jpe?g|webp|pdf)$/i.test(part.exercise.filename||'');
    return planButton(canView?'Visa övning':'Hämta övningsfil',()=>{if(canView){openPreview(part.exercise);return;}const url=URL.createObjectURL(part.exercise.blob),a=document.createElement('a');a.href=url;a.download=part.exercise.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);});
  }
  function drawTrainingParts(){
    const root=$('trainingPlanParts');root.replaceChildren();
    if(!trainingParts.length)root.append(text('p','Lägg till övningar från arkivet för att bygga träningen.','small'));
    trainingParts.forEach((part,index)=>{
      const row=text('article','', 'training-plan-part');row.append(text('h3',(index+1)+'. '+part.exercise.title),text('p',part.exercise.category||'Övning','small'));
      const label=text('label','Minuter'),minutes=document.createElement('input');minutes.type='number';minutes.min='1';minutes.max='180';minutes.step='1';minutes.value=part.minutes;minutes.setAttribute('aria-label','Minuter för övning '+(index+1));minutes.oninput=()=>{if(trainingBusy){minutes.value=part.minutes;return;}part.minutes=minutes.value;drawTrainingTotal();};label.append(minutes);row.append(label);
      const actions=text('div','','archive-actions'),up=planButton('Flytta upp',()=>{[trainingParts[index-1],trainingParts[index]]=[trainingParts[index],trainingParts[index-1]];drawTrainingParts();}),down=planButton('Flytta ned',()=>{[trainingParts[index+1],trainingParts[index]]=[trainingParts[index],trainingParts[index+1]];drawTrainingParts();});up.disabled=index===0;down.disabled=index===trainingParts.length-1;
      actions.append(showTrainingExercise(part),up,down,planButton('Ta bort ur träningen',()=>{trainingParts.splice(index,1);drawTrainingParts();}));row.append(actions);root.append(row);
    });drawTrainingTotal();
  }
  function drawTrainingTotal(){const minutes=trainingParts.reduce((sum,p)=>sum+(Number(p.minutes)||0),0);$('trainingPlanTotal').textContent=trainingParts.length+(trainingParts.length===1?' övning · ':' övningar · ')+minutes+' minuter';}
  function addTrainingPart(entry,source,index=0){if(trainingBusy)return;if(trainingParts.length>=40){planMessage('Högst 40 övningar i en träning.');return;}trainingParts.push({id:crypto.randomUUID(),source,index,minutes:Number.isInteger(entry.minutes)&&entry.minutes>0?Math.min(entry.minutes,180):10,exercise:trainingSnapshot(entry)});drawTrainingParts();planMessage('Övningen är tillagd. Spara träningen när den är klar.');}
  function updateSelectionCount(){
    $('trainingSelectionCount').textContent=selectedExercises.size+' valda övningar';
    $('trainingAddExercise').disabled=!selectedExercises.size;
  }
  function filterTrainingChoices(){
    const root=$('trainingExerciseChoices'),query=$('trainingExerciseSearch').value.trim().toLocaleLowerCase('sv');root.replaceChildren();
    const choices=trainingChoices.filter(choice=>!query||(choice.entry.title+' '+choice.entry.category).toLocaleLowerCase('sv').includes(query));
    for(const choice of choices){
      const label=text('label','','exercise-check'),check=document.createElement('input');check.type='checkbox';check.value=choice.key;check.checked=selectedExercises.has(choice.key);
      check.onchange=()=>{if(check.checked)selectedExercises.add(choice.key);else selectedExercises.delete(choice.key);updateSelectionCount();};
      label.append(check,text('span',choice.entry.title+' · '+choice.entry.category));root.append(label);
    }
    if(!choices.length)root.append(text('p',trainingChoices.length?'Inga övningar matchar sökningen.':'Inga övningar sparade ännu. Rita och spara en övning i Övningsarkiv först.','small'));
    updateSelectionCount();
  }
  async function refreshTrainingChoices(){
    if(!$('trainingPlanForm'))return;const generation=++trainingChoicesGeneration;
    const base=[];
    try{const files=await getFiles();if(generation!==trainingChoicesGeneration)return;trainingChoices=[...files.map(entry=>({key:'file:'+entry.id,entry,source:'file',index:0})),...base];for(const key of selectedExercises)if(!trainingChoices.some(c=>c.key===key))selectedExercises.delete(key);filterTrainingChoices();}
    catch{if(generation!==trainingChoicesGeneration)return;trainingChoices=base;filterTrainingChoices();planMessage('Övningsarkivet kunde inte läsas in. Försök ladda om sidan.');}
  }
  function editTraining(plan){if(trainingBusy)return;trainingEditing={id:plan.id,revision:plan.revision,created:plan.created};trainingParts=plan.parts.map(p=>({...p,exercise:trainingSnapshot(p.exercise)}));$('trainingPlanTitle').value=plan.title;$('trainingPlanNotes').value=plan.notes||'';$('trainingPlanSave').textContent='Spara ändringar';drawTrainingParts();planMessage('Träningen är öppnad för redigering.');$('trainingArchive').scrollIntoView({block:'start'});}
  async function loadTrainingPlans(){
    const root=$('trainingPlanList');if(!root)return;
    try{const plans=await trainingTransaction('readonly',os=>os.getAll());root.replaceChildren();for(const plan of plans.sort((a,b)=>(b.updated||b.created)-(a.updated||a.created))){
      const card=text('article','','archive-item');card.append(text('h3',plan.title),text('p',plan.parts.length+(plan.parts.length===1?' övning · ':' övningar · ')+plan.parts.reduce((n,p)=>n+Number(p.minutes),0)+' minuter','small'));if(plan.notes)card.append(text('p',plan.notes));
      const list=document.createElement('ol');for(const part of plan.parts){const item=text('li',part.exercise.title+' · '+part.minutes+' min ');item.append(showTrainingExercise(part));list.append(item);}card.append(list);
      const actions=text('div','','archive-actions');actions.append(planButton('Öppna träning',()=>editTraining(plan)),planButton('Ta bort träning',async()=>{if(trainingBusy||!confirm('Ta bort träningen från denna enhet?'))return;try{await trainingTransaction('readwrite',os=>os.delete(plan.id));if(trainingEditing?.id===plan.id)resetTraining();await loadTrainingPlans();planMessage('Träningen är borttagen. Övningsarkivet är oförändrat.');}catch(error){planMessage('Kunde inte ta bort träningen: '+error.message);}}));card.append(actions);root.append(card);
    }if(!plans.length)root.append(text('p','Inga färdiga träningar sparade ännu.'));
    }catch{root.replaceChildren(text('p','Träningsarkivet kunde inte öppnas i den här webbläsaren.'));;}
  }
  function resetTraining(){if(trainingBusy)return;trainingEditing=null;trainingParts=[];$('trainingPlanForm').reset();selectedExercises.clear();$('trainingPlanSave').textContent='Spara träning';filterTrainingChoices();drawTrainingParts();planMessage('Ny träning.');}
  function initTrainingArchive(){
    if(!$('trainingPlanForm'))return;drawTrainingParts();void refreshTrainingChoices();void loadTrainingPlans();
    $('trainingExerciseSearch').oninput=filterTrainingChoices;
    $('trainingAddExercise').onclick=()=>{
      if(trainingBusy)return;const choices=trainingChoices.filter(c=>selectedExercises.has(c.key));
      if(!choices.length){planMessage('Bocka i minst en övning först.');return;}
      if(trainingParts.length+choices.length>40){planMessage('Högst 40 övningar i en träning. Minska ditt urval.');return;}
      for(const choice of choices)addTrainingPart(choice.entry,choice.source,choice.index);
      selectedExercises.clear();filterTrainingChoices();planMessage(choices.length+' övningar tillagda. Spara träningen när den är klar.');
    };
    $('trainingPlanNew').onclick=resetTraining;
    $('trainingPlanCopy').onclick=()=>{if(trainingBusy)return;trainingEditing=null;$('trainingPlanSave').textContent='Spara träning';planMessage('Ange ett namn och tryck Spara träning för att spara upplägget som en ny träning.');$('trainingPlanTitle').focus();};
    $('trainingPlanForm').onsubmit=async event=>{
      event.preventDefault();if(trainingBusy)return;
      try{
        const title=$('trainingPlanTitle').value.trim(),parts=validateTraining(title,trainingParts),now=Date.now(),existing=trainingEditing;
        const plan={id:existing?.id||crypto.randomUUID(),revision:(existing?.revision||0)+1,title,notes:$('trainingPlanNotes').value.trim(),parts,created:existing?.created||now,updated:now};
        trainingBusy=true;$('trainingPlanForm').inert=true;$('trainingPlanSave').disabled=true;$('trainingPlanNew').disabled=true;$('trainingPlanCopy').disabled=true;
        await storeTraining(plan,existing?.revision||0);trainingEditing={id:plan.id,revision:plan.revision,created:plan.created};$('trainingPlanSave').textContent='Spara ändringar';await loadTrainingPlans();planMessage('Träningen är sparad på denna enhet.');window.NSKShellHost?.clean?.(window);
      }catch(error){planMessage('Kunde inte spara träningen: '+error.message);}finally{trainingBusy=false;$('trainingPlanForm').inert=false;$('trainingPlanSave').disabled=false;$('trainingPlanNew').disabled=false;$('trainingPlanCopy').disabled=false;}
    };

    document.addEventListener('nsk:page-show',()=>{void render();void refreshTrainingChoices();void loadTrainingPlans();});
  }

 function showArchive(){
  const training=location.hash==='#trainingArchive';
  $('ownExercises').hidden=training;$('trainingArchive').hidden=!training;
  $('archiveHeading').textContent=training?'Träningsarkiv':'Övningsarkiv';
  document.querySelector('.home-hero-sub').textContent=training?'Skapa en träning med övningar från ditt arkiv':'Rita en övning och spara med namn och kategori';
  for(const link of document.querySelectorAll('.mainmenu a[href^="#"]')){
    if(link.hash===(training?'#trainingArchive':'#ownExercises'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
 }
 document.addEventListener('DOMContentLoaded',()=>{
  showArchive();window.addEventListener('hashchange',showArchive);initTrainingArchive();void refreshAll();$('drawingSearch').oninput=renderOwn;$('drawingCategory').onchange=renderOwn;
  $('drawingPreviewClose').onclick=closePreview;$('drawingPreview').addEventListener('close',()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}});
  window.addEventListener('focus',()=>void refreshAll());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshAll();});
 });
})();
