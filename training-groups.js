// Local-first attendance prototype. Personal data is never sent to third-party services.
(() => {
  const palette = [{name:'Röd',hex:'#b11226',text:'#fff'},{name:'Vit',hex:'#fff',text:'#17181b'},{name:'Svart',hex:'#17181b',text:'#fff'}];
  const $ = id => document.getElementById(id);
  const storagePrefix = 'nsk_training_v1:';
  let players = [], coaches = [], team = '';
  let selectedCoaches = new Set();
  let selected = new Set();
  let allocation = [];
  let goalies = [];
  let goalieCount = 0;
  const storageKey = () => storagePrefix + team + ':' + $('trainingDate').value;
  async function restore(){
    const response=await SharedTraining.get($('trainingDate').value);
    const data=response.session||{};
    const allowed=new Set(players.map(p=>String(p.id)));
    const allowedCoaches=new Set(coaches.map(p=>String(p.id)));
    selected=new Set((data.selected||[]).map(String).filter(x=>allowed.has(x)));
    selectedCoaches=new Set((data.selectedCoaches||[]).map(String).filter(x=>allowedCoaches.has(x)));
    allocation=Array.isArray(data.allocation)?data.allocation:[];
    goalies=(data.goalies||[]).map(String).filter(id=>allowed.has(id)&&selected.has(id));
    goalieCount=Number(data.goalieCount)||0;
    revision=Number(data.revision)||0;
    $('trainingGoalieCount').value=String(goalieCount);
  }
  let revision=0;
  let saveQueue=Promise.resolve();
  function persist(){
    const date=$('trainingDate').value;
    const snapshot={selected:[...selected],selectedCoaches:[...selectedCoaches],allocation,goalies,goalieCount};
    saveQueue=saveQueue.then(async()=>{
      const saved=await SharedTraining.save(date,{...snapshot,revision});
      revision=saved.revision;
      $('trainingStatus').textContent='Träningen är sparad för laget.';
    }).catch(error=>{$('trainingStatus').textContent='Kunde inte spara: '+error.message;});
  }
  function renderRoster() {
    const root=$('trainingRoster');root.replaceChildren();
    for(const p of players){
      const label=document.createElement('label');
      const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(String(p.id));
      check.addEventListener('change',()=>{
        if(check.checked)selected.add(String(p.id));else selected.delete(String(p.id));
        goalies = goalies.filter(id=>selected.has(id));
        allocation=[];persist();renderCount();renderGoalieSelectors();renderGroups();
      });
      label.append(check,document.createTextNode(p.full_name));root.append(label);
    }
    renderCount();
  }
  function renderCoaches(){
    const root=$('trainingCoachRoster');root.replaceChildren();
    for(const coach of coaches){
      const label=document.createElement('label');
      const check=document.createElement('input');check.type='checkbox';
      check.checked=selectedCoaches.has(String(coach.id));
      check.addEventListener('change',()=>{
        if(check.checked)selectedCoaches.add(String(coach.id));else selectedCoaches.delete(String(coach.id));
        persist();renderCoachesSummary();
      });
      label.append(check,document.createTextNode(coach.full_name));root.append(label);
    }
    renderCoachesSummary();
  }
  function renderCoachesSummary(){
    const names=coaches.filter(p=>selectedCoaches.has(String(p.id))).map(p=>p.full_name);
    $('trainingCoachCount').textContent=names.length+' av '+coaches.length+' tränare kommer';
    $('trainingCoachSummary').textContent=names.join(', ')||'Inga tränare markerade';
  }
  function renderGoalieSelectors(){
    const root=$('trainingGoalies');root.replaceChildren();
    const attendees=players.filter(p=>selected.has(String(p.id)));
    goalies=goalies.filter(id=>attendees.some(p=>String(p.id)===id)).slice(0,goalieCount);
    for(let index=0;index<goalieCount;index++){
      const label=document.createElement('label');label.textContent='Målvakt '+(index+1);
      const select=document.createElement('select');
      const empty=document.createElement('option');empty.value='';empty.textContent='Välj spelare';select.append(empty);
      for(const player of attendees){
        const id=String(player.id);
        if(goalies.some((chosen,i)=>chosen===id&&i!==index))continue;
        const option=document.createElement('option');option.value=id;option.textContent=player.full_name;select.append(option);
      }
      select.value=goalies[index]||'';
      select.addEventListener('change',()=>{
        const next=select.value;
        if(next&&goalies.some((id,i)=>i!==index&&id===next))return;
        goalies[index]=next;
        goalies=Array.from({length:goalieCount},(_,i)=>goalies[i]||'');
        allocation=[];persist();renderGoalieSelectors();renderGroups();
      });
      label.append(select);root.append(label);
    }
    const count=goalies.filter(Boolean).length;
    $('trainingGoalieSummary').textContent=count?goalies.filter(Boolean).map(id=>attendees.find(p=>String(p.id)===id)?.full_name).filter(Boolean).join(', '):'Inga målvakter valda';
  }
  function renderCount(){$('trainingCount').textContent=selected.size+' av '+players.length+' spelare kommer';}
  function renderGroups(){
    const root=$('trainingGroups');root.replaceChildren();
    const available=new Map(players.map(p=>[String(p.id),p.full_name]));
    for(const [i,ids] of allocation.entries()){
      if(!Array.isArray(ids))continue;
      const section=document.createElement('section');section.className='training-group';
      const heading=document.createElement('h3');heading.textContent=palette[i].name;heading.style.background=palette[i].hex;heading.style.color=palette[i].text;
      const ul=document.createElement('ul');
      for(const id of ids){const key=String(id);if(!selected.has(key)||goalies.includes(key)||!available.has(key))continue;
        const li=document.createElement('li');li.textContent=available.get(key);ul.append(li);}
      section.append(heading,ul);root.append(section);
    }
  }
  function distribute(){
    if(goalieCount !== goalies.filter(Boolean).length){$('trainingStatus').textContent='Välj namn för alla målvakter först.';return;}
    const ids=players.filter(p=>selected.has(String(p.id))&&!goalies.includes(String(p.id))).map(p=>String(p.id));
    if(!ids.length){$('trainingStatus').textContent='Det finns inga utespelare att dela in.';return;}
    for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
    const count=palette.length;
    allocation=Array.from({length:count},()=>[]);
    ids.forEach((id,i)=>allocation[i%count].push(id));
    persist();renderGroups();
    $('trainingStatus').textContent='Grupperna är fördelade. Du kan slumpa om genom att trycka igen.';
  }

  // Import is explicitly reviewed before any attendance state is changed.
  let importMatches=[];
  const normalized = value => String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sv-SE').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  function importCandidates(text){
    const roster=[...players.map(p=>({...p,kind:'player'})),...coaches.map(p=>({...p,kind:'coach'}))];
    const lines=String(text||'').split(/\n/).map(x=>x.trim()).filter(Boolean);
    const found=new Map();
    for(const line of lines){
      const cleaned=normalized(line.replace(/\s*\|.*$/,'').replace(/\s*[-–]\s*(ass\.?\s*tranare|huvudtranare|materialare|lagledare).*$/i,''));
      if(!cleaned||cleaned.length<3||/^(kommer|kan ej|kallade|anmalda|anmalan|kalender|samling|svara senast)$/.test(cleaned))continue;
      const matches=roster.filter(p=>{
        const full=normalized(p.full_name);
        const parts=full.split(' ');
        const abbreviated=parts.length>1?parts[0]+' '+parts[parts.length-1][0]:'';
        return cleaned===full||cleaned===abbreviated;
      });
      if(matches.length===1)found.set(matches[0].kind+':'+matches[0].id,matches[0]);
    }
    return [...found.values()];
  }
  async function readImageText(){
    const files=[...$('trainingImportImages').files].filter(f=>f.type.startsWith('image/'));
    if(!files.length)return '';
    const texts=[];
    if(window.Tesseract?.createWorker){
      // OCR runs locally in a Web Worker; do not send children's images to an OCR API.
      const worker=await window.Tesseract.createWorker('swe');
      try{
        for(let i=0;i<files.length;i++){
          $('trainingImportStatus').textContent='Läser bild '+(i+1)+' av '+files.length+'…';
          const result=await worker.recognize(files[i]);
          texts.push(result.data?.text||'');
        }
      }finally{await worker.terminate();}
      return texts.join('\n');
    }
    if(typeof window.TextDetector==='function'){
      const detector=new window.TextDetector();
      for(const file of files){
        const bitmap=await createImageBitmap(file);
        try{const blocks=await detector.detect(bitmap);texts.push(blocks.map(b=>b.rawValue||'').join('\n'));}
        finally{bitmap.close();}
      }
      return texts.join('\n');
    }
    throw Error('Bildtolkning kunde inte startas. Kontrollera nätanslutningen eller skriv namnen manuellt.');
  }
  function showImportReview(matches){
    const root=$('trainingImportReview');root.replaceChildren();
    for(const person of matches){
      const label=document.createElement('label'),check=document.createElement('input');
      check.type='checkbox';check.checked=true;check.dataset.kind=person.kind;check.dataset.id=String(person.id);
      label.append(check,document.createTextNode(person.full_name+' ('+(person.kind==='player'?'spelare':'tränare')+')'));
      root.append(label);
    }
    $('trainingImportApply').disabled=!matches.length;
  }
  function initImport(){
    // Never retain preview object URLs or selected image references after processing.
    function clearImportImages(){
      $('trainingImportImages').value='';
    }
    $('trainingImportImages').addEventListener('change',()=>{
      // No preview is created: screenshots are only read transiently for OCR.
      $('trainingImportApply').disabled=true;
      importMatches=[];
      $('trainingImportReview').replaceChildren();
    });
    $('trainingImportRead').addEventListener('click',async()=>{
      $('trainingImportApply').disabled=true;
      if(!players.length&&!coaches.length){clearImportImages();$('trainingImportStatus').textContent='Truppen måste hämtas först.';return;}
      let text=$('trainingImportText').value;
      try{
        const detected=await readImageText();
        if(detected)text+=(text?'\n':'')+detected;
      }catch(error){
        $('trainingImportStatus').textContent=(error.message||'Kunde inte läsa bildtext')+' Skriv namnen i textrutan.';
      }finally{
        clearImportImages();
      }
      importMatches=importCandidates(text);
      text=''; // OCR output is never copied to a field or persisted.
      showImportReview(importMatches);
      $('trainingImportStatus').textContent=importMatches.length
        ?importMatches.length+' unika namn matchade. Kontrollera markeringarna och bekräfta. Övriga närvaroval ändras inte.'
        :'Inga säkra namnmatchningar. Skriv ett namn per rad som i NSK-truppen. Kontrollera att namnen står på egna rader.';
    });
    $('trainingImportApply').addEventListener('click',()=>{
      if(!importMatches.length)return;
      const checks=[...$('trainingImportReview').querySelectorAll('input:checked')];
      for(const check of checks){
        if(check.dataset.kind==='player')selected.add(check.dataset.id);
        else selectedCoaches.add(check.dataset.id);
      }
      allocation=[];persist();renderRoster();renderCoaches();renderGoalieSelectors();renderGroups();
      $('trainingImportStatus').textContent=checks.length+' deltagare markerade som Kommer. Tidigare markeringar har behållits.';
      $('trainingImportApply').disabled=true;
      importMatches=[];
      $('trainingImportText').value='';
      clearImportImages();
    });
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    initImport();
    const requestedDate=new URLSearchParams(location.search).get('date');
    const today=new Date().toLocaleDateString('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'});
    $('trainingDate').value=/^\d{4}-\d{2}-\d{2}$/.test(requestedDate||'')?requestedDate:today;
    $('trainingDate').addEventListener('change',()=>{restore();renderRoster();renderCoaches();renderGoalieSelectors();renderGroups();});
    $('trainingGoalieCount').addEventListener('change',()=>{
      goalieCount=Number($('trainingGoalieCount').value);
      goalies=goalies.slice(0,goalieCount);
      allocation=[];persist();renderGoalieSelectors();renderGroups();
    });
    $('trainingGroupButton').addEventListener('click',distribute);
    $('trainingPrintButton').addEventListener('click',()=>window.print());
    try{
      const session=await Auth.init();
      if(!session)throw Error('Du måste vara inloggad.');
      if(!Auth.activeTeam() && session.memberships?.length)Auth.selectTeam(session.memberships[0].team_id);
      team=Auth.activeTeam();
      if(!team)throw Error('Välj ett aktivt lag under Mitt konto.');
      [players,coaches]=await Promise.all([DB.listPlayers(),DB.listCoaches()]);
      restore();renderRoster();renderCoaches();renderGoalieSelectors();renderGroups();
      $('trainingStatus').textContent=players.length+' spelare och '+coaches.length+' tränare hämtade från NSK-truppen.';
    }catch(error){$('trainingStatus').textContent=error.message||'Kunde inte läsa truppen.';}
  });
})();
