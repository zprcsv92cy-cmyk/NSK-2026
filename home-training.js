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
  function parseCalendar(text){
    const lines=String(text).split(/\n/).map(x=>x.trim()).filter(Boolean);
    let year=null,month=null,day=null;
    const found=new Map();
    for(let i=0;i<lines.length;i++){
      const normalized=lines[i].toLocaleLowerCase('sv-SE');
      const heading=normalized.match(/(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+(20\d{2})/);
      if(heading){month=monthNames.indexOf(heading[1])+1;year=Number(heading[2]);continue;}
      const dayMatch=normalized.match(/^(?:mån|tis|ons|tor|fre|lör|sön)?\s*(\d{1,2})(?:\s|$)/);
      if(dayMatch&&Number(dayMatch[1])>=1&&Number(dayMatch[1])<=31&&!/\d{1,2}:\d{2}/.test(normalized)){
        day=Number(dayMatch[1]);
      }
      if(!year||!month||!day)continue;
      if(!/(?:\bis\s*17\s*[/\\]\s*18\b|\bträning\b)/i.test(normalized))continue;
      if(/\bmatch\b|poolspel|klasspass/i.test(normalized))continue;
      const nearby=lines.slice(i,i+4).join(' ').toLocaleLowerCase('sv-SE');
      const hall=/\blilla\s+hallen\b/.test(nearby)?'Lilla Hallen':/\bstora\s+hallen\b/.test(nearby)?'Stora hallen':null;
      if(!hall)continue;
      const date=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
      if(new Date(date+'T12:00:00').getDate()!==day)continue;
      const key=date;
      if(!found.has(key))found.set(key,{date,hall});
    }
    return [...found.values()];
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
    open.addEventListener('click',()=>{panel.hidden=!panel.hidden;});
    document.getElementById('trainingCalendarRead').addEventListener('click',async()=>{
      confirm.disabled=true;review.replaceChildren();candidates=[];
      const file=input.files?.[0];
      if(!file){status.textContent='Välj en kalenderbild först.';return;}
      if(!currentContext){status.textContent='Träningarna måste hämtas först. Försök ladda om startsidan.';input.value='';return;}
      if(!window.Tesseract?.createWorker){status.textContent='Bildtolkningen kunde inte startas.';input.value='';return;}
      let worker;
      try{
        status.textContent='Tolkar kalenderbilden…';
        worker=await window.Tesseract.createWorker('swe');
        const result=await worker.recognize(file);
        candidates=parseCalendar(result.data?.text||'');
        const unique=new Map(candidates.map(c=>[c.date,c]));
        candidates=[...unique.values()];
        for(const item of candidates){
          const exists=currentContext.dates.has(item.date);
          const label=document.createElement('label');label.className='training-review-item';
          const check=document.createElement('input');check.type='checkbox';check.value=item.date;check.disabled=exists;check.checked=!exists;
          const text=document.createElement('span');text.textContent=item.date+' • '+item.hall+(exists?' – finns redan':'');
          label.append(check,text);review.append(label);
        }
        const fresh=candidates.filter(c=>!currentContext.dates.has(c.date));
        status.textContent=candidates.length?'Hittade '+candidates.length+' träningar. '+fresh.length+' kan importeras. Granska datum och hall före import.':'Inga säkra träningar hittades. Kontrollera att månad, år och hall syns tydligt.';
        confirm.disabled=!fresh.length;
      }catch(error){status.textContent='Bildtolkning misslyckades: '+(error.message||String(error));}
      finally{input.value='';if(worker)await worker.terminate();}
    });
    confirm.addEventListener('click',async()=>{
      if(!currentContext)return;
      confirm.disabled=true;
      const checked=new Set([...review.querySelectorAll('input:checked')].map(x=>x.value));
      let created=0,skipped=0;
      for(const item of candidates.filter(c=>checked.has(c.date))){
        if(currentContext.dates.has(item.date)){skipped++;continue;}
        try{
          const url=currentContext.base+'/api/training?team_id='+encodeURIComponent(currentContext.teamId)+'&date='+encodeURIComponent(item.date);
          const headers={Authorization:'Bearer '+currentContext.token};
          const existing=await fetch(url,{headers,cache:'no-store'});
          if(!existing.ok)throw Error('Kunde inte kontrollera befintlig träning ('+existing.status+')');
          const existingData=await existing.json();
          if(existingData.session){currentContext.dates.add(item.date);skipped++;continue;}
          const response=await fetch(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({selected:[],selectedCoaches:[],goalies:[],goalieCount:0,allocation:[],revision:0,hall:item.hall,shirtColorCount:3}),cache:'no-store'});
          if(response.status===409){skipped++;continue;}
          if(!response.ok)throw Error('Kunde inte spara '+item.date+' ('+response.status+')');
          currentContext.dates.add(item.date);created++;
        }catch(error){status.textContent='Importerade '+created+'. Avbröt vid '+item.date+': '+error.message;return;}
      }
      status.textContent='Importerade '+created+' träningar. Hoppade över '+skipped+' befintliga. Bilder och bildtext sparades inte.';
      await render();
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{setupCalendarImport();render();});
})();
