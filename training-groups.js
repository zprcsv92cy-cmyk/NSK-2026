// Shared attendance; uploaded screenshots and OCR text are never persisted.
(() => {
  const palette = [{name:'Röd',hex:'#b11226',text:'#fff'},{name:'Vit',hex:'#fff',text:'#17181b'},{name:'Svart',hex:'#17181b',text:'#fff'},{name:'Grön',hex:'#17834b',text:'#fff'}];
  const $ = id => document.getElementById(id);
  let players = [], coaches = [], equipment = [], team = '';
  let selectedEquipment = new Set();
  let selectedCoaches = new Set();
  let selected = new Set();
  let allocation = [];
  let goalies = [];
  let goalieCount = 0;
  let shirtColorCount = 3;
  let trainingHall = '';
  let calendarEvents=[],manualMode=false,pickerSignature='';
  function refreshTrainingChoices(now=new Date()){
    const picker=$('trainingCalendar');if(!picker||manualMode)return;
    const date=$('trainingDate').value,choices=SharedTraining.upcomingDates(calendarEvents,now);
    const signature=JSON.stringify([date,choices]);if(signature===pickerSignature)return;pickerSignature=signature;
    picker.replaceChildren();
    const selected=choices.some(choice=>choice.date===date);
    if(!selected){const option=document.createElement('option');option.value='';option.textContent=choices.length?'Välj kommande träning':'Inga kommande träningar';option.disabled=true;picker.append(option);}
    for(const choice of choices){const option=document.createElement('option');option.value=choice.date;option.textContent=choice.label;picker.append(option);}
    picker.value=selected?date:'';picker.disabled=!choices.length;
    // Keep the current editor and queued saves on their original date when it expires.
    // Historical sessions remain reachable from the calendar, but never enter this list.
    $('trainingDate').hidden=selected||!date;$('trainingDate').readOnly=true;
  }

  async function restore(){
    const date=$('trainingDate').value;
    if(!date)return false;
    const response=await SharedTraining.get(date);
    if($('trainingDate').value!==date)return false;
    const data=response.session||{};
    const fetchedHall=data.hall?'':await SharedTraining.calendarHall(date).catch(()=> '');
    if($('trainingDate').value!==date)return false;
    const allowed=new Set(players.map(p=>String(p.id)));
    const allowedCoaches=new Set(coaches.map(p=>String(p.id)));
    const allowedEquipment=new Set(equipment.map(p=>String(p.id)));
    selectedEquipment=new Set((data.selectedCoaches||[]).filter(id=>String(id).startsWith('equipment:')).map(id=>String(id).slice(10)).filter(id=>allowedEquipment.has(id)));
    selected=new Set((data.selected||[]).map(String).filter(x=>allowed.has(x)));
    selectedCoaches=new Set((data.selectedCoaches||[]).map(String).filter(x=>allowedCoaches.has(x)));
    allocation=Array.isArray(data.allocation)?data.allocation:[];
    goalies=(data.goalies||[]).map(String).filter(id=>allowed.has(id)&&selected.has(id));
    goalieCount=Number(data.goalieCount)||0;
    trainingHall=['Lilla Hallen','Stora hallen'].includes(data.hall)?data.hall:'';
    const calendarHall=new URLSearchParams(location.search).get('calendar_hall');
    if(!response.session&&new URLSearchParams(location.search).get('date')===date&&['Lilla Hallen','Stora hallen'].includes(calendarHall))trainingHall=calendarHall;
    if(!trainingHall)trainingHall=fetchedHall;
    $('trainingHall').value=trainingHall;
    shirtColorCount=[2,3,4].includes(Number(data.shirtColorCount))?Number(data.shirtColorCount):3;
    $('trainingShirtColorCount').value=String(shirtColorCount);
    revision=Number(data.revision)||0;
    confirmedTraining=await SharedTraining.snapshotSession(data);
    if($('trainingDate').value!==date)return false;
    loadedDate=$('trainingDate').value;
    $('trainingGoalieCount').value=String(goalieCount);
    return true;
  }
  let confirmedTraining={selected:[],selectedCoaches:[],allocation:[],goalies:[],goalieCount:0,shirtColorCount:3,hall:''};
  let recoveryStatus=0;
  let revision=0;
  let saveQueue=Promise.resolve();
  let saveBlocked=false;
  let saveGeneration=0;
  let loadedDate='';
  function persist(){
    if(saveBlocked){$('trainingStatus').textContent='Dina val finns kvar men är inte sparade. Använd knapparna nedan för att fortsätta.';return;}
    if($('trainingDate').value!==loadedDate){$('trainingStatus').textContent='Vänta tills träningen för valt datum har lästs in.';return;}
    const date=$('trainingDate').value;
    if(!date){$('trainingStatus').textContent='Välj en träning först.';return;}
    if(goalies.filter(Boolean).length!==goalieCount){$('trainingStatus').textContent='Välj namn för alla målvakter innan träningen sparas.';return;}
    const snapshot=captureTraining(),base=structuredClone(confirmedTraining);
    const generation=++saveGeneration;
    $('trainingStatus').textContent='Sparar träningen…';
    saveQueue=saveQueue.then(async()=>{
      if(saveBlocked)return;
      const saved=await SharedTraining.save(date,{...snapshot,revision,base:{session:base}});
      revision=saved.revision;confirmedTraining=saved.session||snapshot;
      if(generation===saveGeneration&&loadedDate===date&&saved.session&&JSON.stringify(snapshot)!==JSON.stringify(saved.session))applyTraining(saved.session);
      $('trainingStatus').textContent='Sparat '+new Date().toLocaleTimeString('sv-SE',{timeZone:'Europe/Stockholm',hour:'2-digit',minute:'2-digit'});
      if(generation===saveGeneration)window.NSKShellHost?.clean?.(window);
    }).catch(error=>{saveBlocked=true;recoveryStatus=error.status||0;$('trainingStatus').textContent='Kunde inte spara. Dina val finns kvar. '+error.message;showRecovery();});
  }
  function captureTraining(){return {selected:[...selected],selectedCoaches:[...selectedCoaches,...[...selectedEquipment].map(id=>'equipment:'+id)],allocation:allocation.map(group=>[...group]),goalies:[...goalies],goalieCount,shirtColorCount,hall:trainingHall};}
  function applyTraining(data){
    selected=new Set(data.selected);selectedCoaches=new Set(data.selectedCoaches.filter(id=>!id.startsWith('equipment:')));selectedEquipment=new Set(data.selectedCoaches.filter(id=>id.startsWith('equipment:')).map(id=>id.slice(10)));
    allocation=data.allocation;goalies=data.goalies;goalieCount=data.goalieCount;shirtColorCount=data.shirtColorCount;trainingHall=data.hall;
    $('trainingGoalieCount').value=String(goalieCount);$('trainingShirtColorCount').value=String(shirtColorCount);$('trainingHall').value=trainingHall;
    renderRoster();renderCoaches();renderEquipment();renderGoalieSelectors();renderGroups();
  }
  function showRecovery(){
    let root=$('trainingSaveRecovery');if(!root){root=document.createElement('div');root.id='trainingSaveRecovery';root.className='training-actions';$('trainingStatus').after(root);}root.replaceChildren();root.hidden=false;
    for(const [mode,label] of [['retry','Försök spara igen'],['latest','Läs senaste träningen'],...(recoveryStatus===409?[['mine','Behåll mina ändringar']]:[])]){
      const button=document.createElement('button');button.type='button';button.textContent=label;root.append(button);
      button.onclick=async()=>{
        if(mode==='latest'&&!confirm('Läsa senaste träningen och lämna dina osparade ändringar?'))return;
        if(mode==='mine'&&!confirm('Spara de uppgifter du själv ändrat även där en annan ledare ändrat samma uppgifter? Övriga ändringar behålls.'))return;
        if(mode==='retry'){root.hidden=true;saveBlocked=false;persist();return;}
        const date=loadedDate,controls=[...$('trainingAttendance').querySelectorAll('input,select,textarea,button')],disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
        try{
          const latest=await SharedTraining.get(date);
          if(!latest.session&&revision>0)throw Error('Träningen har tagits bort. Dina osparade val finns kvar.');
          const current=await SharedTraining.snapshotSession(latest.session);
          if(mode==='latest'){applyTraining(current);confirmedTraining=current;revision=latest.revision;}
          else{const draft=await SharedTraining.mergeDraft(confirmedTraining,captureTraining(),current);const saved=await SharedTraining.save(date,{...draft,revision:latest.revision,base:{session:current}});confirmedTraining=saved.session||draft;revision=saved.revision;applyTraining(confirmedTraining);}
          saveBlocked=false;root.hidden=true;$('trainingStatus').textContent=mode==='latest'?'Senaste träningen är inläst.':'Dina ändringar är sparade.';window.NSKShellHost?.clean?.(window);
        }catch(error){recoveryStatus=error.status||0;$('trainingStatus').textContent=error.message;}
        finally{controls.forEach((c,i)=>{if(c.isConnected)c.disabled=disabled[i];});}
      };
    }
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
  function renderEquipment(){
    const root=$('trainingEquipmentRoster');root.replaceChildren();
    for(const person of equipment){
      const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=selectedEquipment.has(String(person.id));
      check.addEventListener('change',()=>{if(check.checked)selectedEquipment.add(String(person.id));else selectedEquipment.delete(String(person.id));persist();renderEquipmentSummary();});
      label.append(check,document.createTextNode(person.full_name));root.append(label);
    }
    renderEquipmentSummary();
  }
  function renderEquipmentSummary(){
    const names=equipment.filter(person=>selectedEquipment.has(String(person.id))).map(person=>person.full_name);
    $('trainingEquipmentCount').textContent=names.length+' av '+equipment.length+' valda';
    $('trainingEquipmentSummary').textContent=names.join(', ')||'Inga materialförvaltare markerade';
  }
  function renderCoachesSummary(){
    const names=coaches.filter(p=>selectedCoaches.has(String(p.id))).map(p=>p.full_name);
    $('trainingCoachCount').textContent=names.length+' av '+coaches.length+' valda';
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
  function renderCount(){$('trainingCount').textContent=selected.size+' av '+players.length+' valda';}
  function movePlayerToColor(playerId,targetIndex){
    const id=String(playerId);
    if(!selected.has(id)||goalies.includes(id)||targetIndex<0||targetIndex>=shirtColorCount)return;
    const current=allocation.findIndex(group=>Array.isArray(group)&&group.map(String).includes(id));
    if(current<0||current===targetIndex)return;
    allocation=Array.from({length:shirtColorCount},(_,i)=>Array.isArray(allocation[i])?[...allocation[i]].map(String).filter(x=>x!==id):[]);
    allocation[targetIndex].push(id);
    persist();renderGroups();
  }
  function renderGroups(){
    const root=$('trainingGroups');root.replaceChildren();
    const available=new Map(players.map(p=>[String(p.id),p.full_name]));
    for(let i=0;i<shirtColorCount;i++){
      const ids=allocation[i];
      if(!Array.isArray(ids))continue;
      const section=document.createElement('section');section.className='training-group';
      section.dataset.colorIndex=String(i);
      const heading=document.createElement('h3');heading.textContent=palette[i].name;heading.style.background=palette[i].hex;heading.style.color=palette[i].text;
      const ul=document.createElement('ul');
      section.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('text/plain'))event.preventDefault();});
      section.addEventListener('drop',event=>{
        event.preventDefault();
        const id=event.dataTransfer?.getData('text/plain');
        if(id)movePlayerToColor(id,i);
      });
      for(const id of ids){
        const key=String(id);
        if(!selected.has(key)||goalies.includes(key)||!available.has(key))continue;
        const li=document.createElement('li');li.className='training-player';li.draggable=true;
        li.addEventListener('dragstart',event=>{
          event.dataTransfer.setData('text/plain',key);
          event.dataTransfer.effectAllowed='move';
        });
        const name=document.createElement('span');name.textContent=available.get(key);
        const select=document.createElement('select');
        select.setAttribute('aria-label','Flytta '+available.get(key)+' till tröjfärg');
        for(let color=0;color<shirtColorCount;color++){
          const option=document.createElement('option');option.value=String(color);option.textContent=palette[color].name;
          select.append(option);
        }
        select.value=String(i);
        select.addEventListener('change',()=>movePlayerToColor(key,Number(select.value)));
        li.append(name,select);ul.append(li);
      }
      section.append(heading,ul);root.append(section);
    }
  }
  function distribute(){
    if(goalieCount !== goalies.filter(Boolean).length){$('trainingStatus').textContent='Välj namn för alla målvakter först.';return;}
    const ids=players.filter(p=>selected.has(String(p.id))&&!goalies.includes(String(p.id))).map(p=>String(p.id));
    if(!ids.length){$('trainingStatus').textContent='Det finns inga utespelare att dela in.';return;}
    for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
    const count=shirtColorCount;
    allocation=Array.from({length:count},()=>[]);
    ids.forEach((id,i)=>allocation[i%count].push(id));
    persist();renderGroups();
    $('trainingStatus').textContent='Grupperna är fördelade.';
  }

  // Import is explicitly reviewed before any attendance state is changed.
  let importMatches=[];
  // SvenskaLag screenshots include invitations, headings, roles and comments.
  // Only use the 'Kommer' list under 'Anmälda' when those headings are detected.
  const normalized = value => String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sv-SE').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const normalizeImportLine = line => String(line||'')
    .replace(/^\s*\|\s*/, '')
    .replace(/^\s*(?:[•*✓✔☑-]|\d+[.)])\s*/, '')
    .replace(/\s*\|.*$/, '')
    .replace(/\s*[-–]\s*(ass\.?\s*tränare|huvudtränare|materialare|materialförvaltare|lagledare).*$/i, '')
    .replace(/\s*\((?:spelare|tränare|materialförvaltare|materialare|kommer)\)\s*$/i, '')
    .trim();
  function importCandidates(text){
    const coachNames=new Set([...coaches,...equipment].map(p=>normalized(p.full_name)));
    const roster=[...players.filter(p=>!coachNames.has(normalized(p.full_name))).map(p=>({...p,kind:'player'})),...coaches.map(p=>({...p,kind:'coach'})),...equipment.map(p=>({...p,kind:'equipment'}))];
    const lines=String(text||'').split(/\n/).map(x=>x.trim()).filter(Boolean);
    const section=lines.findIndex(line=>/^anmalda(?:\s|$)/.test(normalized(line)));
    // OCR often separates "Kommer" and "14+9" into different lines, or
    // renders the counter as "Kommer 14 9" after punctuation removal.
    const status=section<0?-1:lines.findIndex((line,i)=>i>section&&/^kommer(?:\s|$)/.test(normalized(line)));
    // A missing OCR header must not silently turn a valid roster into zero matches.
    // If the Anmälda heading was recognized, skip the invitation section.
    const table=section<0?-1:lines.findIndex((line,i)=>i>section&&/^namn(?: |$)/.test(normalized(line)));
    const relevant=lines.slice(table>=0?table+1:status>=0?status+1:section>=0?section+1:0);
    const found=new Map();
    const skip=/^(kommer|kan ej|kallade|anmalda|anmalan|kalender|samling|svara senast|ej svarat)(?: |$)/;
    // Match each attendance entry against the active roster. Do not treat names
    // in comments, other response tabs, or invitations as confirmed attendees.
    for(const line of relevant){
      const cleaned=normalized(normalizeImportLine(line));
      if(!cleaned||cleaned.length<3)continue;
      if(/^(kan ej|kallade|ej svarat)(?: |$)/.test(cleaned))break;
      if(skip.test(cleaned))continue;
      const matches=roster.map(person=>{
        const full=normalized(person.full_name);
        const parts=full.split(' ');
        if(parts.length<2)return null;
        // SvenskaLag abbreviates the first surname part; NSK may contain
        // compound surnames or a middle name (e.g. Oliver Johansson Zoumbios).
        const surnameInitials=new Set(parts.slice(1).map(part=>part[0]));
        const fullMatch=new RegExp('(?:^| )'+full+'(?: |$)').test(cleaned);
        const shortMatch=[...surnameInitials].some(initial=>
          new RegExp('(?:^| )'+parts[0]+' '+initial+'(?: |$)').test(cleaned));
        return fullMatch||shortMatch?{...person,exact:true}:null;
      }).filter(Boolean);
      // A shared initial (e.g. two Oliver J) must never be auto-approved.
      const uniqueIds=new Set(matches.map(p=>p.kind+':'+p.id));
      if(uniqueIds.size===1){
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
          // Retry with different in-memory image transformations until the
          // independently verified SvenskaLag player total is matched.
          let bitmap;
          try{
            bitmap=await createImageBitmap(files[i]);
            const variants=[
              {scale:2,contrast:false},
              {scale:3,contrast:true},
              {scale:2,contrast:true}
            ];
            const recognized=new Map();
            const collect=()=>{
              recognized.clear();
              for(const pass of texts){
                for(const person of importCandidates(pass)){
                  recognized.set(person.kind+':'+person.id,person);
                }
              }
            };
            collect();
            const header=()=>texts.join('\n').match(/kommer\s*(\d+)\s*\+\s*(\d+)/i);
            for(let attempt=0;attempt<variants.length;attempt++){
              const target=header();
              const matchedPlayers=[...recognized.values()].filter(p=>p.kind==='player').length;
              const matchedStaff=[...recognized.values()].filter(p=>p.kind!=='player').length;
              if(target&&matchedPlayers>=Number(target[1])&&matchedStaff>=Number(target[2]))break;
              const variant=variants[attempt];
              $('trainingImportStatus').textContent='Förbättrar bildtolkning '+(attempt+2)+' av '+(variants.length+1)+'…';
              const canvas=document.createElement('canvas');
              canvas.width=Math.round(bitmap.width*variant.scale);
              canvas.height=Math.round(bitmap.height*variant.scale);
              const ctx=canvas.getContext('2d');
              if(!ctx)break;
              ctx.imageSmoothingEnabled=true;
              ctx.imageSmoothingQuality='high';
              ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
              if(variant.contrast){
                const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
                for(let j=0;j<pixels.data.length;j+=4){
                  for(let c=0;c<3;c++)pixels.data[j+c]=Math.max(0,Math.min(255,(pixels.data[j+c]-128)*1.65+128));
                }
                ctx.putImageData(pixels,0,0);
              }
              try{
                const enlarged=await worker.recognize(canvas);
                texts.push(enlarged.data?.text||'');
                collect();
              }finally{canvas.width=0;canvas.height=0;}
            }
          }catch(error){console.warn('Extra OCR pass unavailable',error);}
          finally{bitmap?.close();}
        }
      }finally{await worker.terminate();}
      return texts.join('\n__OCR_PASS__\n');
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
      label.append(check,document.createTextNode(person.full_name+' ('+(person.kind==='player'?'spelare':person.kind==='equipment'?'materialförvaltare':'tränare')+')'+(person.exact?'':' – kontrollera, endast initial matchade')));
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
      if(!players.length&&!coaches.length&&!equipment.length){clearImportImages();$('trainingImportStatus').textContent='Truppen måste hämtas först.';return;}
      let text=$('trainingImportText').value;
      try{
        const detected=await readImageText();
        if(detected)text+=(text?'\n':'')+detected;
      }catch(error){
        $('trainingImportStatus').textContent=(error.message||'Kunde inte läsa bildtext')+' Skriv namnen i textrutan.';
      }finally{
        clearImportImages();
      }
      // Parse each OCR pass independently: a 'Kan ej' tab in pass one must
      // not hide the 'Kommer' names recovered by the enlarged second pass.
      const passes=text.split(/\n__OCR_PASS__\n/);
      const byPerson=new Map();
      for(const pass of passes){
        for(const person of importCandidates(pass)){
          const key=person.kind+':'+person.id;
          const existing=byPerson.get(key);
          if(!existing||person.exact)byPerson.set(key,person);
        }
      }
      importMatches=[...byPerson.values()];
      // SvenskaLag's "Kommer 14+9" is a source count, not an NSK roster count.
      // OCR may put the count on the following line.
      const attendanceHeader=String(text||'').match(/kommer\s*(\d+)\s*\+\s*(\d+)/i);
      const sourcePlayers=attendanceHeader?Number(attendanceHeader[1]):null;
      const sourceStaff=attendanceHeader?Number(attendanceHeader[2]):null;
      const matchedPlayers=importMatches.filter(p=>p.kind==='player').length;
      const matchedStaff=importMatches.filter(p=>p.kind!=='player').length;
      const playerCountMatches=sourcePlayers!==null&&matchedPlayers===sourcePlayers;
      const sourceSummary=attendanceHeader
        ?'SvenskaLag: '+sourcePlayers+' spelare och '+sourceStaff+' ledare/funktionärer. Matchade i NSK: '+matchedPlayers+' spelare och '+matchedStaff+' ledare/funktionärer. Ej matchade mot NSK: '+Math.max(0,sourcePlayers-matchedPlayers)+' spelare och '+Math.max(0,sourceStaff-matchedStaff)+' ledare/funktionärer (kan saknas i truppen). '
        :'Antalet anmälda kunde inte avläsas säkert. Matchade i NSK: '+matchedPlayers+' spelare och '+matchedStaff+' ledare/funktionärer. ';
      const countWarning=sourcePlayers===null?'OBS: Kontrollera antalet spelare mot SvenskaLag innan du bekräftar. ':playerCountMatches?'Spelarantalet stämmer med SvenskaLag. ':'OBS: '+Math.abs(sourcePlayers-matchedPlayers)+' spelare skiljer mot SvenskaLag. Kontrollera saknade namn före bekräftelse. ';
      text=''; // OCR output is never copied to a field or persisted.
      showImportReview(importMatches);
      $('trainingImportStatus').textContent=importMatches.length
        ?sourceSummary+countWarning+importMatches.filter(p=>p.exact).length+' säkra namn identifierade automatiskt. '+importMatches.filter(p=>!p.exact).length+' osäkra behöver granskas. Bekräfta för att uppdatera närvaron.'
         :sourceSummary+countWarning+'Inga namn matchade mot NSK-truppen. Skriv ett namn per rad som i NSK-truppen. Kontrollera att namnen står på egna rader.';
    });
    $('trainingHall').addEventListener('change',()=>{
      trainingHall=$('trainingHall').value;
      persist();
    });
    $('trainingShirtColorCount').addEventListener('change',()=>{
      shirtColorCount=Number($('trainingShirtColorCount').value);
      allocation=[];persist();renderGroups();
    });
    $('trainingImportApply').addEventListener('click',()=>{
      if(!importMatches.length)return;
      const checks=[...$('trainingImportReview').querySelectorAll('input:checked')];
      const approved=[...importMatches.filter(p=>p.exact),...checks.map(check=>importMatches.find(p=>p.kind===check.dataset.kind&&String(p.id)===check.dataset.id)).filter(Boolean)];
      // A new confirmed import replaces the previous attendance for this date.
      selected=new Set(approved.filter(p=>p.kind==='player').map(p=>String(p.id)));
      selectedCoaches=new Set(approved.filter(p=>p.kind==='coach').map(p=>String(p.id)));
      selectedEquipment=new Set(approved.filter(p=>p.kind==='equipment').map(p=>String(p.id)));
      goalies=goalies.filter(id=>selected.has(id));
      if(goalies.length<goalieCount){
        goalies=[];
        goalieCount=0;
        $('trainingGoalieCount').value='0';
      }
      allocation=[];persist();renderRoster();renderCoaches();renderEquipment();renderGoalieSelectors();renderGroups();
      $('trainingImportStatus').textContent=approved.length+' deltagare markerade som Kommer. Tidigare närvaro har ersatts.';
      $('trainingImportApply').disabled=true;
      importMatches=[];
      $('trainingImportText').value='';
      clearImportImages();
    });
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    initImport();
    const requestedDate=new URLSearchParams(location.search).get('date');
    const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'});
    $('trainingDate').value=/^\d{4}-\d{2}-\d{2}$/.test(requestedDate||'')?requestedDate:today;
    const changeTraining=async()=>{try{await saveQueue;if(saveBlocked)throw Error('Sparningen misslyckades. Ladda om sidan innan du byter träning.');if(!await restore())return;renderRoster();renderCoaches();renderEquipment();renderGoalieSelectors();renderGroups();refreshTrainingChoices();$('trainingStatus').textContent='Träningen för '+loadedDate+' är inläst.';}catch(error){if(loadedDate){$('trainingDate').value=loadedDate;refreshTrainingChoices();}$('trainingStatus').textContent=error.message;}};
    document.addEventListener('nsk:page-show',()=>{refreshTrainingChoices();if(loadedDate&&!saveBlocked)void changeTraining();});
    window.addEventListener('focus',()=>refreshTrainingChoices());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshTrainingChoices();});
    setInterval(()=>refreshTrainingChoices(),15000);
    $('trainingDate').addEventListener('change',changeTraining);
    $('trainingCalendar').addEventListener('change',()=>{$('trainingDate').value=$('trainingCalendar').value;changeTraining();});
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
      let calendarError='';
      let events;
      [players,coaches,equipment,events]=await Promise.all([
        SharedTraining.listPlayers(),SharedTraining.listCoaches(),SharedTraining.listEquipment(),
        SharedTraining.calendarTrainings().catch(()=>{calendarError='Kalendern kunde inte hämtas. Försök ladda om sidan.';return [];})
      ]);
      calendarEvents=events;
      const choices=SharedTraining.upcomingDates(events);
      const picker=$('trainingCalendar');
      const explicit=/^\d{4}-\d{2}-\d{2}$/.test(requestedDate||'');
      manualMode=new URLSearchParams(location.search).get('new')==='1';
      const date=explicit?requestedDate:(manualMode?today:(choices[0]?.date||''));
      picker.hidden=manualMode;
      $('trainingDate').value=date;$('trainingDate').hidden=!manualMode;$('trainingDate').readOnly=false;
      refreshTrainingChoices();
      await restore();saveBlocked=false;renderRoster();renderCoaches();renderEquipment();renderGoalieSelectors();renderGroups();
      if($('trainingAttendance')&&allocation.some(group=>group.length))$('trainingAttendance').open=false;
      $('trainingStatus').textContent=calendarError;
    }catch(error){$('trainingStatus').textContent=error.message||'Kunde inte läsa truppen.';}
  });
})();
