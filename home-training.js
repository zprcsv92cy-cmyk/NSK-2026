// Saved training sessions are fetched from team-scoped shared storage.
(() => {
  const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let currentContext=null;
  async function render(){
    const root=document.getElementById('savedTrainingsList');
    if(!root)return;
    try{
      await Auth.init();
      const team=Auth.activeTeam();
      if(!team){root.textContent='Välj lag under Mitt konto för att se träningar.';return;}
      const token=Auth.getToken();
      if(!token)throw Error('Logga in först');
      const base=String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
      const teamResponse=await fetch(base+'/api/lag',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if(!teamResponse.ok)throw Error('Kunde inte läsa lag');
      const teamData=await teamResponse.json();
      const teams=Array.isArray(teamData.results)?teamData.results:Array.isArray(teamData)?teamData:[];
      const matches=teams.filter(t=>t.Namn===team&&String(t['Säsong'])==='2026');
      if(matches.length!==1)throw Error('Lagkopplingen saknas');
      const response=await fetch(base+'/api/training?team_id='+encodeURIComponent(matches[0].id),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if(!response.ok)throw Error('Gemensamma träningar är ännu inte aktiverade');
      const data=await response.json();
      const sessions=Array.isArray(data.sessions)?data.sessions:[];
      currentContext={base,token,teamId:String(matches[0].id),dates:new Set(sessions.map(s=>s.date))};
      sessions.sort((a,b)=>b.date.localeCompare(a.date));
      if(!sessions.length){root.textContent='Inga gemensamt sparade träningar ännu.';return;}
      root.innerHTML=sessions.map(s=>{
        const day=new Date(s.date+'T12:00:00');
        const weekday=Number.isNaN(day.getTime())?'Träning':day.toLocaleDateString('sv-SE',{weekday:'long'});
        const title=weekday.charAt(0).toLocaleUpperCase('sv-SE')+weekday.slice(1);
        const hall=['Lilla Hallen','Stora hallen'].includes(s.hall)?s.hall:'Hall ej vald';
        return '<details class="nsk-pool-row" data-date="'+encodeURIComponent(s.date)+'"><summary class="nsk-pool-summary"><span class="nsk-pool-name">'+escapeHtml(title+' • '+s.date)+'</span><span class="nsk-pool-hall">'+escapeHtml(hall)+'</span><span class="nsk-pool-chevron" aria-hidden="true">⌄</span></summary><div class="nsk-pool-content"><p data-training-info>Öppna för att visa träningsuppgifter.</p><div class="nsk-pool-actions"><a class="home-create-button" href="../traningsgrupper/?date='+encodeURIComponent(s.date)+'">Visa / redigera träning</a></div></div></details>';}).join('');
      root.addEventListener('toggle',async event=>{
        const details=event.target;
        if(!(details instanceof HTMLDetailsElement)||!details.open||details.dataset.loaded==='pending')return;
        const date=details.dataset.date;
        const info=details.querySelector('[data-training-info]');
        if(!info||!date)return;
        details.dataset.loaded='pending';
        info.textContent='Hämtar träningsuppgifter…';
        try{
          const response=await fetch(base+'/api/training?team_id='+encodeURIComponent(matches[0].id)+'&date='+encodeURIComponent(date),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
          if(!response.ok)throw Error('Kunde inte hämta träningen');
          const data=await response.json();
          const session=data.session;
          if(!session)throw Error('Träningen finns inte längre');
          const groups=Array.isArray(session.allocation)?session.allocation.length:0;
          info.textContent=(session.selected||[]).length+' spelare • '+(session.selectedCoaches||[]).length+' tränare • '+(Number(session.goalieCount)||0)+' målvakter • '+groups+' grupper';
          delete details.dataset.loaded;
        }catch(error){delete details.dataset.loaded;info.textContent=error.message||'Kunde inte hämta träningsuppgifter';}
      },true);
    }catch(error){root.textContent='Kunde inte läsa sparade träningar: '+(error.message||String(error));}
  }
  const monthNames=['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
  function todayLocalDate(){
    const now=new Date();
    return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  }
  function parseCalendar(text){
    const lines=String(text).split(/\n/).map(x=>x.trim()).filter(Boolean);
    const headings=lines.map(line=>line.toLocaleLowerCase('sv-SE').match(/(?:^|\\s)(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+(20\d{2})(?:$|\\s)/)).filter(Boolean);
    // One screenshot is one month. Never infer a month from unrelated entries.
    if(!headings.length||headings.some(h=>h[1]!==headings[0][1]||h[2]!==headings[0][2]))return {month:null,items:[],valid:false};
    const month=monthNames.indexOf(headings[0][1])+1,year=Number(headings[0][2]);
    const monthKey=year+'-'+String(month).padStart(2,'0');
    const found=new Map();
    let day=null;
    for(let i=0;i<lines.length;i++){
      const normalized=lines[i].toLocaleLowerCase('sv-SE');
      if(/(?:^|\\s)(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\\s+20\\d{2}/.test(normalized)){day=null;continue;}
      const dayMatch=normalized.match(/^(\\d{1,2})(?:\\s+(?:mån|tis|ons|tor|fre|lör|sön))?\\s*$/);
      if(dayMatch){day=Number(dayMatch[1]);continue;}
      if(!day)continue;
      const isTraining=/\\b(?:träning|is\\s*17\\s*[/\\\\]\\s*18)\\b/i.test(normalized);
      const isPool=/\\b(?:poolspel|intresseanmälan\\s+poolspel)\\b/i.test(normalized);
      if(!isTraining&&!isPool)continue;
      const date=monthKey+'-'+String(day).padStart(2,'0');
      if(new Date(date+'T12:00:00').getDate()!==day||date<todayLocalDate()){day=null;continue;}
      const context=lines.slice(i,Math.min(i+4,lines.length)).filter(line=>!/^\\d{1,2}(?:\\s+(?:mån|tis|ons|tor|fre|lör|sön))?\\s*$/i.test(line)).join(' ').toLocaleLowerCase('sv-SE');
      const hall=/\\blilla\\s+hallen\\b/.test(context)?'Lilla Hallen':/\\bstora\\s+hallen\\b/.test(context)?'Stora hallen':null;
      if(isPool){
        const place=/södertälje/i.test(context)?'Södertälje':'';
        found.set('pool:'+date+':'+place,{type:'pool',date,hall:hall||'',place});
      }else if(hall){
        found.set('training:'+date,{type:'training',date,hall});
      }
      day=null;
    }
    return {month:monthKey,items:[...found.values()],valid:found.size>0};
  }
  function setupCalendarImport(){
    const open=document.getElementById('importTrainingsOpen');
    const panel=document.getElementById('trainingCalendarImport');
    const input=document.getElementById('trainingCalendarImage');
    const status=document.getElementById('trainingCalendarStatus');
    const review=document.getElementById('trainingCalendarReview');
    const confirm=document.getElementById('trainingCalendarConfirm');
    if(!open)return;
    let candidates=[];
    let knownPools=[];
    let importMonth=null;
    open.addEventListener('click',()=>{panel.hidden=!panel.hidden;});
    document.getElementById('trainingCalendarRead').addEventListener('click',async()=>{
      confirm.disabled=true;review.replaceChildren();candidates=[];importMonth=null;
      const file=input.files?.[0];
      if(!file){status.textContent='Välj en kalenderbild först.';return;}
      if(!currentContext){status.textContent='Träningarna måste hämtas först. Försök ladda om startsidan.';input.value='';return;}
      if(!window.Tesseract?.createWorker){status.textContent='Bildtolkningen kunde inte startas.';input.value='';return;}
      let worker;
      try{
        status.textContent='Tolkar kalenderbilden…';
        worker=await window.Tesseract.createWorker('swe');
        // Process long SvenskaLag screenshots in enlarged day-sized sections.
        // Canvas crops stay in memory and are never uploaded or persisted.
        const bitmap=await createImageBitmap(file);
        let parsed;
        try{
          const headerCanvas=document.createElement('canvas');
          headerCanvas.width=Math.min(1600,bitmap.width*3);
          headerCanvas.height=Math.min(1200,bitmap.height*3);
          const headerHeight=Math.min(bitmap.height,Math.max(180,Math.round(bitmap.width*1.2)));
          headerCanvas.height=Math.round(headerHeight*headerCanvas.width/bitmap.width);
          headerCanvas.getContext('2d').drawImage(bitmap,0,0,bitmap.width,headerHeight,0,0,headerCanvas.width,headerCanvas.height);
          const headerResult=await worker.recognize(headerCanvas);
          const headerText=headerResult.data?.text||'';
          const monthMatch=headerText.toLocaleLowerCase('sv-SE').match(/(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\\s+(20\\d{2})/);
          if(!monthMatch)throw Error('Kunde inte läsa månad och år i bildens överkant.');
          const monthHeading=monthMatch[1]+' '+monthMatch[2];
          const merged=new Map();
          const chunkHeight=Math.max(300,Math.round(bitmap.width*2.3));
          const overlap=Math.round(chunkHeight*0.2);
          for(let top=0;top<bitmap.height;top+=chunkHeight-overlap){
            const height=Math.min(chunkHeight,bitmap.height-top);
            const canvas=document.createElement('canvas');
            canvas.width=Math.min(1800,bitmap.width*3);
            canvas.height=Math.round(height*canvas.width/bitmap.width);
            canvas.getContext('2d').drawImage(bitmap,0,top,bitmap.width,height,0,0,canvas.width,canvas.height);
            status.textContent='Läser kalendern dag för dag ('+Math.min(100,Math.round((top+height)/bitmap.height*100))+' %) …';
            const result=await worker.recognize(canvas);
            const section=parseCalendar(monthHeading+'\n'+(result.data?.text||''));
            for(const item of section.items)merged.set(item.type+':'+item.date+':'+(item.place||''),item);
            if(top+height>=bitmap.height)break;
          }
          parsed={month:monthNames.indexOf(monthMatch[1])+1,items:[...merged.values()],valid:merged.size>0};
          parsed.month=monthMatch[2]+'-'+String(parsed.month).padStart(2,'0');
        }finally{bitmap.close();}
        if(!parsed.valid){status.textContent='Kunde inte säkert läsa en enda kalendermånad med aktiviteter. Inget sparas eller tas bort.';return;}
        importMonth=parsed.month;
        candidates=parsed.items;
        knownPools=await DB.listPools();
        const unique=new Map(candidates.map(c=>[c.type+':'+c.date+':'+(c.place||''),c]));
        candidates=[...unique.values()];
        for(const item of candidates){
          const exists=item.type==='training'?currentContext.dates.has(item.date):knownPools.some(p=>p.pool_date===item.date&&(!item.place||String(p.place||'').toLocaleLowerCase('sv-SE')===item.place.toLocaleLowerCase('sv-SE')));
          const label=document.createElement('label');label.className='training-review-item';
          const check=document.createElement('input');check.type='checkbox';check.value=item.type+':'+item.date+':'+(item.place||'');check.disabled=exists;check.checked=!exists;
          const text=document.createElement('span');text.textContent=(item.type==='pool'?'Poolspel':'Träning')+' • '+item.date+' • '+(item.place||item.hall||'Plats ej angiven')+(exists?' – finns redan':'');
          label.append(check,text);review.append(label);
        }
        const fresh=candidates.filter(c=>c.type==='training'?!currentContext.dates.has(c.date):!knownPools.some(p=>p.pool_date===c.date&&(!c.place||String(p.place||'').toLocaleLowerCase('sv-SE')===c.place.toLocaleLowerCase('sv-SE'))));
        status.textContent='Kalendermånad '+importMonth+': hittade '+candidates.length+' aktiviteter, '+fresh.length+' nya. Granska före import. Borttagning kräver separat bekräftelse av att hela månaden har lästs korrekt.';
        confirm.disabled=!fresh.length;
      }catch(error){status.textContent='Bildtolkning misslyckades: '+(error.message||String(error));}
      finally{input.value='';if(worker)await worker.terminate();}
    });
    confirm.addEventListener('click',async()=>{
      if(!currentContext||!importMonth||!candidates.length)return;
      confirm.disabled=true;
      const checked=new Set([...review.querySelectorAll('input:checked')].map(x=>x.value));
      const knownTrainingDates=new Set(currentContext.dates);
      let created=0,skipped=0;
      for(const item of candidates.filter(c=>checked.has(c.type+':'+c.date+':'+(c.place||'')))){
        if(item.date<todayLocalDate()){skipped++;continue;}
        if(item.type==='training'&&currentContext.dates.has(item.date)){skipped++;continue;}
        if(item.type==='pool'){
          try{
            const latest=await DB.listPools();
            if(latest.some(p=>p.pool_date===item.date&&(!item.place||String(p.place||'').toLocaleLowerCase('sv-SE')===item.place.toLocaleLowerCase('sv-SE')))){skipped++;continue;}
            await DB.addPool({title:'Poolspel',place:item.place,hall:item.hall,pool_date:item.date,status:'Aktiv',teams:2,matches:4,players_on_field:3,periods:1,period_time:15,sub_time:90,calendarImport:true});
            created++;continue;
          }catch(error){status.textContent='Importerade '+created+'. Poolspel '+item.date+' kunde inte sparas: '+error.message;return;}
        }
        try{
          const url=currentContext.base+'/api/training?team_id='+encodeURIComponent(currentContext.teamId)+'&date='+encodeURIComponent(item.date);
          const headers={Authorization:'Bearer '+currentContext.token};
          const existing=await fetch(url,{headers,cache:'no-store'});
          if(!existing.ok)throw Error('Kunde inte kontrollera befintlig träning ('+existing.status+')');
          const existingData=await existing.json();
          if(existingData.session){currentContext.dates.add(item.date);skipped++;continue;}
          const response=await fetch(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({selected:[],selectedCoaches:[],goalies:[],goalieCount:0,allocation:[],revision:0,hall:item.hall,shirtColorCount:3,calendarImport:true}),cache:'no-store'});
          if(response.status===409){skipped++;continue;}
          if(!response.ok)throw Error('Kunde inte spara '+item.date+' ('+response.status+')');
          currentContext.dates.add(item.date);created++;
        }catch(error){status.textContent='Importerade '+created+'. Avbröt vid '+item.date+': '+error.message;return;}
      }
      // Never delete when the user selected only a subset or OCR found no training.
      const selectedAll=candidates.every(c=>checked.has(c.type+':'+c.date+':'+(c.place||''))||
        (c.type==='training'?knownTrainingDates.has(c.date):knownPools.some(p=>p.pool_date===c.date)));
      const trainingDates=candidates.filter(c=>c.type==='training').map(c=>c.date);
      let removed=0;
      // OCR can omit an entire day without reporting an error. Require an explicit
      // full-month completeness confirmation before any destructive synchronization.
      const approved=false && selectedAll&&trainingDates.length>0&&window.confirm(
        'Kontrollera kalenderbilden noggrant: alla träningar för '+importMonth+
        ' måste finnas i listan. Saknade framtida importerade träningar kan tas bort. '+
        'Har du jämfört HELA månaden med originalbilden och bekräftat att alla datum finns med?');
      if(approved){
        try{
          const response=await fetch(currentContext.base+'/api/training?team_id='+encodeURIComponent(currentContext.teamId)+'&action=sync-calendar',{
            method:'POST',headers:{Authorization:'Bearer '+currentContext.token,'Content-Type':'application/json'},
            body:JSON.stringify({month:importMonth,dates:trainingDates}),cache:'no-store'});
          if(!response.ok)throw Error('Synkronisering misslyckades ('+response.status+')');
          removed=Number((await response.json()).removed)||0;
        }catch(error){status.textContent='Importerade '+created+' aktiviteter. Ingen borttagning genomförd: '+error.message;await render();return;}
      }
      status.textContent='Importerade '+created+' aktiviteter. Hoppade över '+skipped+'. Tog bort '+removed+' framtida kalenderträningar. Bilder och bildtext sparades inte.';
      await render();
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{setupCalendarImport();render();});
})();
