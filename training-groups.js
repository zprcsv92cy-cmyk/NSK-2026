// Shared attendance; uploaded screenshots and OCR text are never persisted.
(() => {
  const palette = [{name:'Röd',hex:'#b11226',text:'#fff'},{name:'Vit',hex:'#fff',text:'#17181b'},{name:'Svart',hex:'#17181b',text:'#fff'}];
  const $ = id => document.getElementById(id);
  let players = [], coaches = [], team = '';
  let selectedCoaches = new Set();
  let selected = new Set();
  let allocation = [];
  let goalies = [];
  let goalieCount = 0;
  async function restore(){
    const date=$('trainingDate').value;
    const response=await SharedTraining.get(date);
    if($('trainingDate').value!==date)return false;
    const data=response.session||{};
    const allowed=new Set(players.map(p=>String(p.id)));
    const allowedCoaches=new Set(coaches.map(p=>String(p.id)));
    selected=new Set((data.selected||[]).map(String).filter(x=>allowed.has(x)));
    selectedCoaches=new Set((data.selectedCoaches||[]).map(String).filter(x=>allowedCoaches.has(x)));
    allocation=Array.isArray(data.allocation)?data.allocation:[];
    goalies=(data.goalies||[]).map(String).filter(id=>allowed.has(id)&&selected.has(id));
    goalieCount=Number(data.goalieCount)||0;
    revision=Number(data.revision)||0;
    loadedDate=$('trainingDate').value;
    $('trainingGoalieCount').value=String(goalieCount);
    return true;
  }
  let revision=0;
  let saveQueue=Promise.resolve();
  let saveBlocked=false;
  let loadedDate='';
  function persist(){
    if(saveBlocked){$('trainingStatus').textContent='Sparning stoppad efter konflikt. Ladda om sidan innan du ändrar träningen igen.';return;}
    if($('trainingDate').value!==loadedDate){$('trainingStatus').textContent='Vänta tills träningen för valt datum har lästs in.';return;}
    const date=$('trainingDate').value;
    if(goalies.filter(Boolean).length!==goalieCount){$('trainingStatus').textContent='Välj namn för alla målvakter innan träningen sparas.';return;}
    const snapshot={selected:[...selected],selectedCoaches:[...selectedCoaches],allocation:allocation.map(group=>[...group]),goalies:[...goalies],goalieCount};
    $('trainingStatus').textContent='Sparar träningen…';
    saveQueue=saveQueue.then(async()=>{
      if(saveBlocked)return;
      const saved=await SharedTraining.save(date,{...snapshot,revision});
      revision=saved.revision;
      $('trainingStatus').textContent='Träningen är sparad för laget.';
    }).catch(error=>{saveBlocked=true;$('trainingStatus').textContent='Kunde inte spara: '+error.message+' Ladda om sidan för att hämta den senaste träningen.';});
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
  // SvenskaLag screenshots include invitations, headings, roles and comments.
  // Only use the 'Kommer' list under 'Anmälda' when those headings are detected.
  const normalized = value => String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sv-SE').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const normalizeImportLine = line => String(line||'')
    .replace(/^\s*(?:[•*✓✔☑-]|\d+[.)])\s*/, '')
    .replace(/\s*\|.*$/, '')
    .replace(/\s*[-–]\s*(ass\.?\s*tränare|huvudtränare|materialare|lagledare).*$/i, '')
    .replace(/\s*\((?:spelare|tränare|kommer)\)\s*$/i, '')
    .trim();
  function importCandidates(text){
    const roster=[...players.map(p=>({...p,kind:'player'})),...coaches.map(p=>({...p,kind:'coach'}))];
    const lines=String(text||'').split(/\n/).map(x=>x.trim()).filter(Boolean);
    const section=lines.findIndex(line=>/^anmalda(?:\s|$)/.test(normalized(line)));
    // OCR often separates "Kommer" and "14+9" into different lines, or
    // renders the counter as "Kommer 14 9" after punctuation removal.
    const status=section<0?-1:lines.findIndex((line,i)=>i>section&&/^kommer(?:\s|$)/.test(normalized(line)));
    // A missing OCR header must not silently turn a valid roster into zero matches.
    // If the Anmälda heading was recognized, skip the invitation section.
    const relevant=lines.slice(status>=0?status+1:section>=0?section+1:0);
    const found=new Map();
    // OCR may place a name after a bullet, a number, or another UI fragment.
    // Only accept a name at a token boundary, and require a unique roster match.
    const skip=/^(kommer|kan ej|kallade|anmalda|anmalan|kalender|samling|svara senast|ej svarat)(?: |$)/;
    for(const line of relevant){
      const cleaned=normalized(normalizeImportLine(line));
      if(!cleaned||cleaned.length<3||skip.test(cleaned))continue;
      const matches=roster.map(person=>{
        const full=normalized(person.full_name);
        const parts=full.split(' ');
        if(parts.length<2)return null;
        const shortName=parts[0]+' '+parts[parts.length-1][0];
        // Prefer a complete name; otherwise match first name plus surname initial.
        // An OCR line can contain role labels and other text before or after a name.
        const fullMatch=new RegExp('(?:^| )'+full+'(?: |$)').test(cleaned);
        const shortMatch=new RegExp('(?:^| )'+shortName+'(?: |$)').test(cleaned);
        return fullMatch||shortMatch?{...person,exact:fullMatch}:null;
      }).filter(Boolean);
      if(matches.length===1){
        const person=matches[0],key=person.kind+':'+person.id;
        const previous=found.get(key);
        if(!previous||person.exact)found.set(key,person);
      }
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
    for(const person of matches.filter(p=>!p.exact)){
      const label=document.createElement('label'),check=document.createElement('input');
      check.type='checkbox';check.checked=person.exact===true;check.dataset.kind=person.kind;check.dataset.id=String(person.id);
      label.append(check,document.createTextNode(person.full_name+' ('+(person.kind==='player'?'spelare':'tränare')+')'+(person.exact?'':' – kontrollera, endast initial matchade')));
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
      // SvenskaLag's "Kommer 14+9" is a source count, not an NSK roster count.
      // OCR may put the count on the following line.
      const attendanceHeader=String(text||'').match(/kommer\\s*(\\d+)\\s*\\+\\s*(\\d+)/i)
        ||String(text||'').match(/kommer\\s*\\n\\s*(\\d+)\\s*\\+\\s*(\\d+)/i);
      const sourcePlayers=attendanceHeader?Number(attendanceHeader[1]):null;
      const sourceStaff=attendanceHeader?Number(attendanceHeader[2]):null;
      const matchedPlayers=importMatches.filter(p=>p.kind==='player').length;
      const matchedStaff=importMatches.filter(p=>p.kind==='coach').length;
      const sourceSummary=attendanceHeader
        ?'SvenskaLag: '+sourcePlayers+' spelare och '+sourceStaff+' ledare/funktionärer. Matchade i NSK: '+matchedPlayers+' spelare och '+matchedStaff+' tränare. Ej matchade mot NSK: '+Math.max(0,sourcePlayers-matchedPlayers)+' spelare och '+Math.max(0,sourceStaff-matchedStaff)+' ledare/funktionärer (kan saknas i truppen). '
        :'Antalet anmälda kunde inte avläsas säkert. Matchade i NSK: '+matchedPlayers+' spelare och '+matchedStaff+' tränare. ';
      text=''; // OCR output is never copied to a field or persisted.
      showImportReview(importMatches);
      $('trainingImportStatus').textContent=importMatches.length
        ?sourceSummary+importMatches.filter(p=>p.exact).length+' säkra namn identifierade automatiskt. '+importMatches.filter(p=>!p.exact).length+' osäkra behöver granskas. Bekräfta för att uppdatera närvaron.'
         :sourceSummary+'Inga namn matchade mot NSK-truppen. Skriv ett namn per rad som i NSK-truppen. Kontrollera att namnen står på egna rader.';
    });
    $('trainingImportApply').addEventListener('click',()=>{
      if(!importMatches.length)return;
      const checks=[...$('trainingImportReview').querySelectorAll('input:checked')];
      const approved=[...importMatches.filter(p=>p.exact),...checks.map(check=>importMatches.find(p=>p.kind===check.dataset.kind&&String(p.id)===check.dataset.id)).filter(Boolean)];
      for(const person of approved){
        if(person.kind==='player')selected.add(String(person.id));
        else selectedCoaches.add(String(person.id));
      }
      allocation=[];persist();renderRoster();renderCoaches();renderGoalieSelectors();renderGroups();
      $('trainingImportStatus').textContent=approved.length+' deltagare markerade som Kommer. Tidigare markeringar har behållits.';
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
    $('trainingDate').addEventListener('change',async()=>{try{await saveQueue;if(saveBlocked)throw Error('Sparningen misslyckades. Ladda om sidan innan du byter träning.');if(!await restore())return;renderRoster();renderCoaches();renderGoalieSelectors();renderGroups();$('trainingStatus').textContent='Träningen för '+loadedDate+' är inläst.';}catch(error){if(loadedDate)$('trainingDate').value=loadedDate;$('trainingStatus').textContent=error.message;}});
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
      [players,coaches]=await Promise.all([SharedTraining.listPlayers(),SharedTraining.listCoaches()]);
      await restore();saveBlocked=false;renderRoster();renderCoaches();renderGoalieSelectors();renderGroups();
      $('trainingStatus').textContent=players.length+' spelare och '+coaches.length+' tränare hämtade från NSK-truppen.';
    }catch(error){$('trainingStatus').textContent=error.message||'Kunde inte läsa truppen.';}
  });
})();
