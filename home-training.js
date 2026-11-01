// Saved training sessions are fetched from team-scoped shared storage.
(() => {
  const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let currentContext=null;
  async function loadSessions(base,token,team){
      const teamResponse=await fetch(base+'/api/lag',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if(!teamResponse.ok)throw Object.assign(Error('Kunde inte läsa lag'),{status:teamResponse.status});
      const teamData=await teamResponse.json();
      const teams=Array.isArray(teamData.results)?teamData.results:Array.isArray(teamData)?teamData:[];
      const matches=teams.filter(t=>t.Namn===team&&String(t['Säsong'])==='2026');
      if(matches.length!==1)throw Error('Lagkopplingen saknas');
      const response=await fetch(base+'/api/training?team_id='+encodeURIComponent(matches[0].id),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if(!response.ok)throw Object.assign(Error('Gemensamma träningar är ännu inte aktiverade'),{status:response.status});
      const data=await response.json();
      const calendar=await SharedTraining.calendarTrainings().catch(()=>[]);
      const sessions=(Array.isArray(data.sessions)?data.sessions:[]).map(session=>window.NSKTrainingCards.enrich(session,calendar));
    return {teamId:String(matches[0].id),sessions};
  }
  async function render(viewData = null){
    const root=document.getElementById('savedTrainingsList');
    if(!root)return;
    const eventRoot=document.getElementById('activityList')||root;
    try{
      if(!viewData)await Auth.init();
      const team=Auth.activeTeam();
      if(!team){root.textContent='Välj lag under Mitt konto för att se träningar.';return;}
      const token=Auth.getToken();
      if(!token)throw Error('Logga in först');
      const base=String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
      if(!viewData && window.NSKViewCache){
        const view=await NSKViewCache.open('calendar-trainings');
        if(view.data)await render(view.data);
        try{
          const snapshot=await loadSessions(base,token,team);
          if(!view.current())return;
          view.save(snapshot);if(JSON.stringify(view.data)!==JSON.stringify(snapshot))await render(snapshot);
        }catch(error){
          if(!view.current())return;
          if(NSKViewCache.denied(error)){NSKViewCache.clear();eventRoot.querySelectorAll(':scope > details[data-date]:not([data-svenskalag-training])').forEach(n=>n.remove());root.replaceChildren();}
          const status=document.getElementById('appError');if(status)status.textContent=view.data&&!NSKViewCache.denied(error)?'Visar senast hämtade träningar. Kunde inte uppdatera.':error.message;
        }
        return;
      }
      const snapshot=viewData||await loadSessions(base,token,team),matches=[{id:snapshot.teamId}],sessions=snapshot.sessions;
      currentContext={base,token,teamId:String(matches[0].id),dates:new Set(sessions.map(s=>s.date))};
      sessions.sort((a,b)=>a.date.localeCompare(b.date));
      const oldRows=[...eventRoot.querySelectorAll(':scope > details[data-date]:not([data-svenskalag-training])')];
      const scroller=document.querySelector('.arena-scroll')||document.scrollingElement,scrollTop=scroller?.scrollTop;
      if(!sessions.length){oldRows.forEach(row=>row.remove());root.innerHTML='<h3 class="training-section-title" id="upcomingTrainingsTitle">Kommande träningar (0)</h3><h3 class="training-section-title" id="pastTrainingsTitle">Avslutade träningar (0)</h3>';window.dispatchEvent(new Event('nsk:saved-trainings-rendered'));return;}
      const today=new Date().toLocaleDateString('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'}).split('-').join('-');
      const savedRow=s=>{
        const day=new Date(s.date+'T12:00:00');
        const weekday=Number.isNaN(day.getTime())?'Träning':day.toLocaleDateString('sv-SE',{weekday:'long'});
        const title=weekday.charAt(0).toLocaleUpperCase('sv-SE')+weekday.slice(1);
        const hall=['Lilla Hallen','Stora hallen'].includes(s.hall)?s.hall:'Hall ej vald';
        const start=s.startTime||s.start_time||s.start||'';const end=s.endTime||s.end_time||s.end||'';
        const time=[start,end].filter(Boolean).join('–');
        return '<details class="nsk-pool-row" data-view-key="training:'+escapeHtml(s.date)+'" data-view-revision="'+escapeHtml(JSON.stringify([s.revision,s.hall,start,end]))+'" data-date="'+encodeURIComponent(s.date)+'"><summary class="nsk-pool-summary"><span class="nsk-pool-name">'+escapeHtml(title+' • '+s.date)+'</span><span class="nsk-pool-hall">'+escapeHtml(hall)+'</span><span class="nsk-training-time">'+escapeHtml(time)+'</span><span class="nsk-pool-chevron" aria-hidden="true">⌄</span></summary><div class="nsk-pool-content"><p data-training-info></p>'+window.NSKTrainingCards.actions(s.date,s.hall)+'<div class="nsk-training-delete-row"><button type="button" class="nsk-training-delete" data-delete-training>Ta bort</button></div></div></details>';};
      const upcoming=sessions.filter(s=>s.date>=today),past=sessions.filter(s=>s.date<today).reverse();
      const html='<h3 class="training-section-title" id="upcomingTrainingsTitle">Kommande träningar ('+upcoming.length+')</h3>'+upcoming.map(savedRow).join('')+'<h3 class="training-section-title" id="pastTrainingsTitle">Avslutade träningar ('+past.length+')</h3>'+past.map(savedRow).join('');
      if(window.NSKViewCache)NSKViewCache.patch(root,html,oldRows);else{oldRows.forEach(row=>row.remove());root.innerHTML=html;}
      window.NSKTrainingCards.reorder(root);
      window.dispatchEvent(new Event('nsk:saved-trainings-rendered'));
      if(scroller&&Number.isFinite(scrollTop))scroller.scrollTop=scrollTop;
      eventRoot.onclick=async event=>{
        const button=event.target.closest?.('[data-delete-training]');
        if(!button)return;
        const row=button.closest('details[data-date]');
        const date=row?.dataset.date;
        const info=row?.querySelector('[data-training-info]');
        if(!date||!info)return;
        button.disabled=true;
        try{
          const url=base+'/api/training?team_id='+encodeURIComponent(matches[0].id)+'&date='+encodeURIComponent(date);
          const headers={Authorization:'Bearer '+token};
          const read=await fetch(url,{headers,cache:'no-store'});
          if(!read.ok)throw Error('Kunde inte kontrollera träningen.');
          const session=(await read.json()).session;
          if(!session)throw Error('Träningen finns inte längre. Uppdatera sidan.');
          const revision=Number(session.revision);
          if(!Number.isSafeInteger(revision)||revision<1)throw Error('Träningen saknar giltig version.');
          if(!window.confirm('Ta bort träningen '+date+' för hela laget? Sparad närvaro, målvakter och grupper tas bort. Detta kan inte ångras.'))return;
          const deleted=await fetch(url+'&revision='+revision,{method:'DELETE',headers,cache:'no-store'});
          if(!deleted.ok){
            const data=await deleted.json().catch(()=>({}));
            throw Error(deleted.status===409?'Träningen har ändrats av en annan ledare. Uppdatera sidan.':data.error||'Kunde inte ta bort träningen.');
          }
          window.NSKViewCache?.clear();await render();
        }catch(error){
          info.textContent='Kunde inte ta bort: '+(error.message||String(error));
        }finally{button.disabled=false;}
      };
      eventRoot._trainingToggleAbort?.abort();
      eventRoot._trainingToggleAbort=new AbortController();
      eventRoot.addEventListener('toggle',async event=>{
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
      },{capture:true,signal:eventRoot._trainingToggleAbort.signal});
    }catch(error){root.textContent='Kunde inte läsa sparade träningar: '+(error.message||String(error));}
  }
  const monthNames=['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
  function todayLocalDate(){
    const now=new Date();
    return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  }
  function parseCalendar(text){
    const lines=String(text).split(/\n/).map(x=>x.trim()).filter(Boolean);
    const headings=lines.map(line=>line.toLocaleLowerCase('sv-SE').match(/(?:^|\s)(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+(20\d{2})(?:$|\s)/)).filter(Boolean);
    // One screenshot is one month. Never infer a month from unrelated entries.
    if(!headings.length||headings.some(h=>h[1]!==headings[0][1]||h[2]!==headings[0][2]))return {month:null,items:[],valid:false};
    const month=monthNames.indexOf(headings[0][1])+1,year=Number(headings[0][2]);
    const monthKey=year+'-'+String(month).padStart(2,'0');
    const found=new Map();
    let day=null;
    for(let i=0;i<lines.length;i++){
      const normalized=lines[i].toLocaleLowerCase('sv-SE');
      if(/(?:^|\s)(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+20\d{2}/.test(normalized)){day=null;continue;}
      const inlineDay=normalized.match(/^(\d{1,2})\s+(?:(?:mån|tis|ons|tor|fre|lör|sön)\s+)?(?:\d{1,2}[:.]\d{2}\s+)?(?:is\b|träning\b|poolspel\b)/i);
      if(inlineDay)day=Number(inlineDay[1]);
      const dayMatch=normalized.match(/^(?:(?:mån|tis|ons|tor|fre|lör|sön)(?:dag)?\s+)?(\d{1,2})(?:\s+(?:mån|tis|ons|tor|fre|lör|sön))?\s*$/);
      if(dayMatch){
        const proposed=Number(dayMatch[1]);
        const date=monthKey+'-'+String(proposed).padStart(2,'0');
        const weekdayNames=['sön','mån','tis','ons','tor','fre','lör'];
        const weekdayLine=(lines[i+1]||'').toLocaleLowerCase('sv-SE');
        const weekday=normalized.match(/(?:mån|tis|ons|tor|fre|lör|sön)/)?.[0]||weekdayLine.match(/^(mån|tis|ons|tor|fre|lör|sön)(?:dag)?$/)?.[1];
        // Never attach an event to the preceding calendar day when OCR
        // loses the date in a multi-column screenshot.
        const validDate=new Date(date+'T12:00:00');
        day=validDate.getDate()===proposed&&(!weekday||weekdayNames[validDate.getDay()]===weekday)?proposed:null;
        continue;
      }
      // A new date on the activity line overrides any earlier OCR day header.
      if(!day)continue;
      const isTraining=/\b(?:träning|is(?:\s*1[789](?:\s*\/\s*1[789])?)?)\b/i.test(normalized)&&!/\bhockeyfritids\b/i.test(normalized);
      const isPool=/\bpoolspel\b/i.test(normalized)&&!/\bintresseanmälan\b/i.test(normalized);
      if(!isTraining&&!isPool)continue;
      const date=monthKey+'-'+String(day).padStart(2,'0');
      if(new Date(date+'T12:00:00').getDate()!==day||date<todayLocalDate()){day=null;continue;}
      const context=lines.slice(i,Math.min(i+4,lines.length)).filter(line=>!/^\d{1,2}(?:\s+(?:mån|tis|ons|tor|fre|lör|sön))?\s*$/i.test(line)).join(' ').toLocaleLowerCase('sv-SE');
      const hall=/\blilla\s+hallen\b/.test(context)?'Lilla Hallen':/\bstora\s+hallen\b/.test(context)?'Stora hallen':null;
      if(isPool){
        const place=''; // Legacy text-only OCR cannot establish a venue.
        found.set('pool:'+date+':'+place,{type:'pool',date,hall:hall||'',place});
      }else{
        found.set('training:'+date,{type:'training',date,hall});
      }
      day=null;
    }
    return {month:monthKey,items:[...found.values()],valid:found.size>0};
  }
  // Tesseract v6 returns block/paragraph/line/word geometry when requested.
  // Read day numbers from the left column, never from the previous OCR text line.
  // Hall names appear on the line BELOW the activity in Svenskalag calendars.
  // OCR can split the two words or confuse 'hallen' with 'hallen.'.
  function detectCalendarHall(words){
    const normalized=words.map(w=>({
      text:String(w.text||'').toLocaleLowerCase('sv-SE').replace(/[^a-zåäö]/g,''),
      x:w.bbox?.x0??0,y:w.bbox?.y0??0
    })).filter(w=>w.text);
    // OCR may split the venue over separate text lines or insert time tokens.
    // Compare spatially close words rather than relying on their array order.
    for(const word of normalized){
      if(/^(?:stor(?:a)?|lilla)(?:is)?hall(?:en)?$/.test(word.text))
        return word.text.startsWith('lill')?'Lilla Hallen':'Stora hallen';
    }
    for(const first of normalized){
      if(!/^(?:stora|stor|lilla)$/.test(first.text))continue;
      const second=normalized.find(w=>/^(?:is)?hall(?:en)?$/.test(w.text)
        &&Math.abs(w.y-first.y)<Math.max(22,Math.min(55,first.text.length*12))
        &&w.x>=first.x-20&&w.x-first.x<260);
      if(second)return first.text==='lilla'?'Lilla Hallen':'Stora hallen';
    }
    return null;
  }
    function extractCalendarWords(data){
    const words=[];
    function collect(node){
      if(!node)return;
      if(Array.isArray(node)){node.forEach(collect);return;}
      if(Array.isArray(node.words)){node.words.forEach(collect);return;}
      if(Array.isArray(node.lines)){node.lines.forEach(collect);return;}
      if(Array.isArray(node.paragraphs)){node.paragraphs.forEach(collect);return;}
      if(Array.isArray(node.blocks)){node.blocks.forEach(collect);return;}
      if(node.text&&node.bbox&&Number.isFinite(node.bbox.x0))words.push(node);
    }
    collect(data.blocks||data.words||[]);
    // Some browser builds return OCR text but omit block geometry.
    // TSV is a second, explicit coordinate output supported by Tesseract.js.
    if(!words.length&&typeof data.tsv==='string'){
      const lines=data.tsv.trim().split(/\r?\n/);
      const header=lines.shift()?.split('\t')||[];
      const col=name=>header.indexOf(name);
      const left=col('left'),top=col('top'),width=col('width'),height=col('height'),value=col('text');
      if([left,top,width,height,value].every(n=>n>=0)){
        for(const line of lines){
          const fields=line.split('\t');
          const x=Number(fields[left]),y=Number(fields[top]);
          const w=Number(fields[width]),h=Number(fields[height]);
          const t=fields.slice(value).join('\t').trim();
          if(t&&[x,y,w,h].every(Number.isFinite)&&w>0&&h>0)words.push({text:t,bbox:{x0:x,y0:y,x1:x+w,y1:y+h}});
        }
      }
    }
    return words;
  }
  function detectPoolVenue(words){
    // Calendar venues appear as their own small line underneath a match.
    // Do not treat the opposing team's name in a match title as a venue.
    const ordered=[...words].filter(w=>w?.bbox&&w.text).sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
    const lines=[];
    for(const word of ordered){
      const y=word.bbox.y0;
      let line=lines.find(l=>Math.abs(l.y-y)<Math.max(5,(word.bbox.y1-y)*0.55));
      if(!line){line={y,words:[]};lines.push(line);}
      line.words.push(word);
    }
    const venues=[];
    for(const line of lines){
      const text=line.words.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(w=>w.text).join(' ').trim();
      const normalized=text.toLocaleLowerCase('sv-SE');
      if(/\bmatch\s+mot\b|\bpoolspel\b|\bintresseanmälan\b/.test(normalized))continue;
      const explicit=normalized.match(/^(?:plats\s*[:：]\s*)?((?:strängnäs\s+ishall|månsbrorinken|smehallen))$/i);
      if(explicit)venues.push(text.replace(/^plats\s*[:：]\s*/i,'').trim());
    }
    return [...new Set(venues.map(v=>v.toLocaleLowerCase('sv-SE')))].length===1?venues[0]:'';
  }
  function detectExplicitCalendarPoolPlace(words){
    // Only read an explicitly labelled venue on its own OCR line; flattened
    // event text may otherwise append times, opponents or another activity.
    const ordered=[...words].filter(w=>w?.bbox&&w.text)
      .sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
    const lines=[];
    for(const word of ordered){
      const y=word.bbox.y0;
      let line=lines.find(l=>Math.abs(l.y-y)<Math.max(5,(word.bbox.y1-y)*0.55));
      if(!line){line={y,words:[]};lines.push(line);}
      line.words.push(word);
    }
    const places=lines.map(line=>{
      const lineText=line.words.sort((a,b)=>a.bbox.x0-b.bbox.x0)
        .map(w=>String(w.text)).join(' ').trim();
      const match=lineText.match(/^(?:plats|arena|ishall)\s*[:：]\s*(.+)$/i);
      return match?match[1].trim():'';
    }).filter(Boolean);
    return new Set(places.map(normalizeCalendarPoolPlace)).size===1?places[0]:'';
  }
  function parseCalendarLayout(data,monthKey,imageWidth){
    const words=Array.isArray(data)?data:extractCalendarWords(data);
    if(!words.length)return null;
    const dayColumn=imageWidth*0.115;
    const dates=words.filter(w=>w.bbox.x0<dayColumn&&/^\d{1,2}$/.test(w.text.trim()))
      .map(w=>({day:Number(w.text.trim()),y:w.bbox.y0,x:w.bbox.x0}))
      .filter(w=>w.day>=1&&w.day<=31)
      .sort((a,b)=>a.y-b.y);
    // A cropped section can contain only the month heading, weekday names or hall text.
    // Missing dates in one crop does not mean the OCR engine omitted coordinates.
    if(!dates.length)return [];
    const items=new Map();
    const rows=words.filter(w=>w.bbox.x0>=dayColumn)
      .sort((a,b)=>a.bbox.y0-b.bbox.y0);
    // Overlapping OCR crops can repeat the same date with slightly different y.
    // Merge repeated day markers before computing day boundaries.
    const uniqueDates=[];
    for(const date of dates){
      // Duplicate OCR anchors share nearly the same baseline; a full row must not be merged.
      if(uniqueDates.some(other=>other.day===date.day&&Math.abs(other.y-date.y)<Math.max(8,imageWidth*0.018)))continue;
      uniqueDates.push(date);
    }
    for(const date of uniqueDates){
      const next=uniqueDates.find(d=>d.y>date.y+Math.max(8,imageWidth*0.012));
      const lower=next?next.y:Infinity;
      const eventWords=rows.filter(w=>w.bbox.y0>=date.y-8&&w.bbox.y0<lower);
      if(!eventWords.length)continue;
      const content=eventWords.map(w=>w.text).join(' ').toLocaleLowerCase('sv-SE');
      // An interest-registration event may share a date with actual pool games.
      // Identify each pool title by its own OCR line, never reject the whole day.
      const interestWords=eventWords.filter(w=>/intresseanmälan/i.test(String(w.text)));
      const poolTitles=eventWords.filter(w=>/^poolspel(?:\s+\d{1,2}\s*\/\s*\d{1,2})?$/i.test(String(w.text).trim()));
      const realPoolTitles=poolTitles.filter(w=>{
        // A dated title must agree with the day-column anchor and month.
        // Otherwise an OCR crop may have moved the event onto a neighbouring day.
        const dated=String(w.text).trim().match(/^poolspel\s+(\d{1,2})\s*\/\s*(\d{1,2})$/i);
        if(dated&&(Number(dated[1])!==date.day||Number(dated[2])!==Number(monthKey.slice(5,7))))return false;
        return !interestWords.some(i=>
          Math.abs(i.bbox.y0-w.bbox.y0)<Math.max(20,imageWidth*0.025));
      });
      const isPool=realPoolTitles.length>0;
      const trainingStarts=eventWords.filter(w=>/^(?:träning|is(?:\s*1[789]\s*\/\s*1[789])?)$/i.test(String(w.text).trim()));
      const isTraining=trainingStarts.length>0;
      // Ignore other activities above the first actual training on this date.
      // In particular, Hockeyfritids must never supply the hall for an ice practice.
      const activityHeadings=eventWords.filter(w=>
        /^(?:träning|is(?:\s*1[789]\s*\/\s*1[789])?|poolspel(?:\s+\d{1,2}\s*\/\s*\d{1,2})?|hockeyfritids|fotografering|intresseanmälan)$/i.test(String(w.text).trim()));
      // Bound every activity to its own heading. A pool venue or another
      // activity's hall must never be assigned to a neighbouring training.
      const activityWords=(startY,otherHeadings)=>{
        if(!Number.isFinite(startY))return [];
        const next=otherHeadings.filter(w=>w.bbox.y0>startY+Math.max(7,imageWidth*0.008))
          .sort((a,b)=>a.bbox.y0-b.bbox.y0)[0];
        return eventWords.filter(w=>w.bbox.y0>=startY-4&&(!next||w.bbox.y0<next.bbox.y0-2));
      };
      const firstTrainingY=trainingStarts.length?Math.min(...trainingStarts.map(w=>w.bbox.y0)):Infinity;
      const trainingWords=activityWords(firstTrainingY,activityHeadings.filter(w=>
        !trainingStarts.includes(w)));
      const firstPoolY=realPoolTitles.length?Math.min(...realPoolTitles.map(w=>w.bbox.y0)):Infinity;
      const poolWords=activityWords(firstPoolY,activityHeadings.filter(w=>!realPoolTitles.includes(w)));
      if(!isPool&&!isTraining)continue;
      const day=String(date.day).padStart(2,'0');
      const fullDate=monthKey+'-'+day;
      const parsedDate=new Date(fullDate+'T12:00:00');
      if(Number.isNaN(parsedDate.getTime())||parsedDate.getFullYear()!==Number(monthKey.slice(0,4))||parsedDate.getMonth()+1!==Number(monthKey.slice(5,7))||parsedDate.getDate()!==date.day||fullDate<todayLocalDate())continue;
      // Hall text may sit below the time and be split by OCR into separate rows.
      // First inspect the date's words, then retry the same day with a focused,
      // higher-resolution OCR pass when the hall is missing.
      const hall=detectCalendarHall(isPool?poolWords:trainingWords);
      // A day can contain several independent ice sessions. If distinct halls
      // appear on that day, a single date-level record cannot safely represent
      // either session. Block automatic selection rather than assign one hall.
      const hallMentions=new Set();
      for(let i=0;i<trainingWords.length;i++){
        const mention=detectCalendarHall(trainingWords.slice(i,i+2));
        if(mention)hallMentions.add(mention);
      }
      const hallConflict=hallMentions.size>1;
      // Training storage is currently keyed by date, not by individual
      // start time. Never collapse multiple visible sessions into one.
      const trainingLabels=trainingStarts;
      const separateLabels=trainingLabels.filter((w,i)=>trainingLabels.findIndex(other=>Math.abs(other.bbox.y0-w.bbox.y0)<Math.max(8,imageWidth*0.009))===i);
      const multipleSessions=separateLabels.length>1;
      // Opponent names are not venues. Only accept a place on an explicit venue line.
      const explicitPlace=isPool?detectExplicitCalendarPoolPlace(poolWords):'';
      const recognizedPlace=isPool?detectPoolVenue(poolWords):'';
      // Conflicting readings are not safe to import as an asserted venue.
      const place=explicitPlace&&recognizedPlace&&normalizeCalendarPoolPlace(explicitPlace)!==normalizeCalendarPoolPlace(recognizedPlace)
        ?'':(explicitPlace||recognizedPlace);
      if(isPool){
        const item={type:'pool',date:fullDate,hall:hall||'',place};
        items.set(item.type+':'+fullDate+':'+(item.place||''),item);
      }
      if(isTraining){
        const item={type:'training',date:fullDate,hall:hallConflict||multipleSessions?null:detectCalendarHall(trainingWords),hallConflict,multipleSessions};
        items.set(item.type+':'+fullDate+':',item);
      }
    }
    return [...items.values()];
  }
  function normalizeCalendarPoolPlace(place){
    return String(place||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('sv-SE');
  }
  function reconcileCalendarPoolDuplicates(items){
    // The same date may contain genuinely different poolspel. Never discard
    // an unknown-venue event merely because another OCR crop saw a venue.
    // Keep unresolved entries for manual review and prevent auto-selection.
    const datesWithKnownVenue=new Set(items.filter(item=>
      item.type==='pool'&&String(item.place||'').trim()).map(item=>item.date));
    return items.map(item=>item.type==='pool'&&!String(item.place||'').trim()&&datesWithKnownVenue.has(item.date)
      ?{...item,possibleDuplicate:true}:item);
  }
  function calendarImportIdentity(item){
    return item.type==='pool'
      ?'pool:'+item.date+':'+normalizeCalendarPoolPlace(item.place)
      :'training:'+item.date;
  }
  function validCalendarImportDate(date,month){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||!/^\d{4}-\d{2}$/.test(String(month||'')))return false;
    if(!date.startsWith(month+'-')||date<todayLocalDate())return false;
    const parsed=new Date(date+'T12:00:00');
    return !Number.isNaN(parsed.getTime())&&
      parsed.getFullYear()===Number(date.slice(0,4))&&
      parsed.getMonth()+1===Number(date.slice(5,7))&&
      parsed.getDate()===Number(date.slice(8,10));
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
    let reviewChecks=new Map();
    let knownPools=[];
    let importMonth=null;
    async function showCandidates(parsed){
      if(!parsed.valid){status.textContent='Hittade inga aktiviteter att granska. Ingenting har sparats eller tagits bort.';return;}
      
        importMonth=parsed.month;
        candidates=parsed.items;
        knownPools=await DB.listPools();
        const unique=new Map(candidates.map(c=>[c.type+':'+c.date+':'+(c.place||''),c]));
        candidates=[...unique.values()];
        reviewChecks=new Map();
        for(const item of candidates){
          const exists=item.type==='training'?currentContext.dates.has(item.date):knownPools.some(p=>p.pool_date===item.date&&!!String(item.place||'').trim()&&normalizeCalendarPoolPlace(p.place)===normalizeCalendarPoolPlace(item.place));
          const label=document.createElement('label');label.className='training-review-item';
          const check=document.createElement('input');check.type='checkbox';check.value=item.type+':'+item.date+':'+(item.place||'');check.disabled=exists||(item.type==='pool'&&!item.place);check.checked=!check.disabled;
          reviewChecks.set(item,check);
          const text=document.createElement('span');text.textContent=(item.type==='pool'?'Poolspel':'Träning')+' · '+(item.place||item.hall||'Plats ej angiven')+(exists?' – finns redan':'');
          // OCR can misalign the narrow date column. Require an editable date
          // for each candidate so the user can correct it before any write.
          const dateInput=document.createElement('input');dateInput.type='date';
          dateInput.value=item.date;dateInput.min=importMonth+'-01';
          dateInput.max=importMonth+'-'+String(new Date(Number(importMonth.slice(0,4)),Number(importMonth.slice(5,7)),0).getDate()).padStart(2,'0');
          dateInput.setAttribute('aria-label','Kontrollera datum för '+(item.type==='pool'?'poolspel':'träning'));
          dateInput.addEventListener('change',()=>{
            const next=dateInput.value;
            if(!next.startsWith(importMonth+'-')){dateInput.value=item.date;return;}
            item.date=next;
            const already=item.type==='training'?currentContext.dates.has(next):knownPools.some(p=>p.pool_date===next&&!!normalizeCalendarPoolPlace(item.place)&&normalizeCalendarPoolPlace(p.place)===normalizeCalendarPoolPlace(item.place));
            check.value=item.type+':'+next+':'+(item.place||'');
            check.disabled=already||next<todayLocalDate()||(item.type==='training'&&(!item.hall||item.multipleSessions))||(item.type==='pool'&&!item.place);if(check.disabled)check.checked=false;
            text.textContent=(item.type==='pool'?'Poolspel':'Träning')+' • '+next+' • '+(item.place||item.hall||'Plats ej angiven')+(already?' – finns redan':'');
          });
          // Hall names are never inferred from another date. An unknown hall
          // requires an explicit selection before that training can be saved.
          if(item.type==='training'){
            const hallSelect=document.createElement('select');
            hallSelect.setAttribute('aria-label','Kontrollera hall för '+item.date);
            for(const [value,title] of [['','Välj hall – kontroll krävs'],['Stora hallen','Stora hallen'],['Lilla Hallen','Lilla Hallen']]){
              const option=document.createElement('option');option.value=value;option.textContent=title;hallSelect.append(option);
            }
            hallSelect.value=item.hall||'';
            if(!item.hall||item.multipleSessions){check.checked=false;check.disabled=true;text.textContent=item.multipleSessions?'Flera träningar samma dag – separat import stöds inte ännu':item.hallConflict?'Motstridiga halltolkningar – kontroll krävs':'Hall kunde inte läsas – kontroll krävs';}
            hallSelect.addEventListener('change',()=>{
              item.hall=hallSelect.value||null;
              const already=currentContext.dates.has(item.date);
              check.disabled=already||item.date<todayLocalDate()||!item.hall||!!item.multipleSessions;
              if(check.disabled)check.checked=false;
              text.textContent='Träning · '+(item.hall||'Hall måste kontrolleras')+(already?' – finns redan':'');
              if(item.hall)item.hallConflict=false;
            });
            label.append(check,text,dateInput,hallSelect);
          }else{
            const placeInput=document.createElement('input');
            placeInput.type='text';
            placeInput.value=item.place||'';
            placeInput.placeholder='Ange plats – kontroll krävs';
            placeInput.setAttribute('aria-label','Kontrollera plats för poolspel '+item.date);
            if(!item.place){check.checked=false;check.disabled=true;if(item.possibleDuplicate)text.textContent='Poolspel · okänd plats, möjligt överlapp – kontroll krävs';}
            placeInput.addEventListener('input',()=>{
              item.place=placeInput.value.trim();
              const already=knownPools.some(p=>p.pool_date===item.date&&!!String(item.place||'').trim()&&normalizeCalendarPoolPlace(p.place)===normalizeCalendarPoolPlace(item.place));
              check.value='pool:'+item.date+':'+item.place;
              check.disabled=already||item.date<todayLocalDate()||!item.place;
              if(check.disabled)check.checked=false;
              text.textContent='Poolspel · '+(item.place||'Plats måste kontrolleras')+(already?' – finns redan':'');
            });
            // These setup values are templates, not facts read from the calendar.
            // Make the distinction visible before the user creates a poolspel.
            const defaultsNote=document.createElement('small');
            defaultsNote.textContent='Standardinställningar (inte avlästa ur bilden): 2 lag, 3 spelare på plan, 1 period à 15 min, byten var 90:e sekund. Kontrollera inställningarna i Skapa poolspel efter import.';
            label.append(check,text,dateInput,placeInput,defaultsNote);
          }
          review.append(label);
        }
        // A narrow calendar screenshot can omit a complete day during OCR.
        // Let the user restore a missing training in the same review, without
        // uploading the image or modifying saved activities automatically.
        const missing=document.createElement('div');missing.className='training-review-item';
        const missingDate=document.createElement('input');missingDate.type='date';
        missingDate.min=importMonth+'-01';
        missingDate.max=importMonth+'-'+String(new Date(Number(importMonth.slice(0,4)),Number(importMonth.slice(5,7)),0).getDate()).padStart(2,'0');
        missingDate.setAttribute('aria-label','Datum för saknad träning');
        const missingHall=document.createElement('select');
        for(const hall of ['Stora hallen','Lilla Hallen']){
          const option=document.createElement('option');option.value=hall;option.textContent=hall;missingHall.append(option);
        }
        const addMissing=document.createElement('button');addMissing.type='button';addMissing.textContent='Lägg till saknad träning';
        addMissing.addEventListener('click',()=>{
          const date=missingDate.value;
          if(!date||!date.startsWith(importMonth+'-')||date<todayLocalDate()){
            status.textContent='Välj ett giltigt framtida datum i '+importMonth+'.';return;
          }
          if(candidates.some(c=>c.type==='training'&&c.date===date)||currentContext.dates.has(date)){
            status.textContent='Träningen '+date+' finns redan i listan eller är sparad.';return;
          }
          const item={type:'training',date,hall:missingHall.value};
          candidates.push(item);
          const label=document.createElement('label');label.className='training-review-item';
          const check=document.createElement('input');check.type='checkbox';check.checked=true;
          check.value='training:'+date+':';
          reviewChecks.set(item,check);
          const name=document.createElement('span');name.textContent='Träning • '+date+' • '+item.hall+' (tillagd manuellt)';
          label.append(check,name);review.insertBefore(label,missing);
          confirm.disabled=false;missingDate.value='';
          status.textContent='Träning '+date+' tillagd i förhandsgranskningen. Kontrollera innan import.';
        });
        missing.append(missingDate,missingHall,addMissing);review.append(missing);
        const fresh=candidates.filter(c=>c.type==='training'?!currentContext.dates.has(c.date):!knownPools.some(p=>p.pool_date===c.date&&!!String(c.place||'').trim()&&normalizeCalendarPoolPlace(p.place)===normalizeCalendarPoolPlace(c.place)));
        status.textContent='Kalendermånad '+importMonth+': hittade '+candidates.length+' aktiviteter, '+fresh.length+' nya. Granska före import. Importen lägger endast till aktiviteter; inga befintliga träningar eller poolspel tas bort.';
        confirm.disabled=!fresh.length;
      
    }
    let feedItems=[];
    const matchList=document.getElementById('trainingCalendarMatches');
    async function showFeedMonth(){
      const month=feedMonth.value;
      const items=feedItems.filter(item=>item.date.startsWith(month+'-'));
      const matches=items.filter(item=>item.type==='match');
      matchList.replaceChildren();
      if(matches.length){
        const heading=document.createElement('h3');heading.textContent='Matcher i SvenskaLag ('+matches.length+')';
        const note=document.createElement('p');note.textContent='Starttid och motståndare hämtas från kalendern. Matcherna visas endast och sparas inte i en laguppställning automatiskt.';
        const list=document.createElement('ul');
        for(const match of matches){
          const li=document.createElement('li');
          li.textContent=match.date+' kl. '+match.startTime+' – mot '+match.opponent+(match.place?' · '+match.place:'');
          list.append(li);
        }
        matchList.append(heading,note,list);
      }
      const activities=items.filter(item=>item.type==='training'||item.type==='pool');
      if(activities.length){
        await showCandidates({month,items:activities,valid:true});
      }else{
        candidates=[];reviewChecks=new Map();importMonth=null;review.replaceChildren();confirm.disabled=true;
        status.textContent=matches.length?'Visar '+matches.length+' matcher. Inga träningar eller poolspel att importera denna månad.':'Inga aktiviteter för denna månad.';
      }
    }
    const feedMonth=document.getElementById('trainingCalendarFeedMonth');
    const feedRead=document.getElementById('trainingCalendarFeedRead');
    feedRead.addEventListener('click',async()=>{
      confirm.disabled=true;review.replaceChildren();
      if(!currentContext){status.textContent='Logga in och välj lag innan kalendern hämtas.';return;}
      feedRead.disabled=true;status.textContent='Hämtar kalendern från SvenskaLag…';
      try{
        const url=currentContext.base+'/api/training?team_id='+encodeURIComponent(currentContext.teamId)+'&action=svenskalag-calendar';
        const response=await fetch(url,{headers:{Authorization:'Bearer '+currentContext.token},cache:'no-store'});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||!Array.isArray(result.items))throw Error(result.error||'Kalenderflödet är ännu inte aktiverat i API:t.');
        feedItems=result.items.filter(item=>['training','pool','match'].includes(item.type)&&/^\d{4}-\d{2}-\d{2}$/.test(item.date));
        const months=[...new Set(feedItems.map(item=>item.date.slice(0,7)))].sort();
        if(!months.length){status.textContent='Inga kommande träningar eller poolspel hittades i kalendern.';return;}
        if(!months.includes(feedMonth.value))feedMonth.value=months[0];
        feedMonth.hidden=false;
        await showFeedMonth();
      }catch(error){status.textContent='Kalendern kunde inte hämtas: '+(error.message||String(error));}
      finally{feedRead.disabled=false;}
    });
    feedMonth.addEventListener('change',async()=>{
      if(!feedItems.length)return;
      confirm.disabled=true;review.replaceChildren();
      await showCandidates({month:feedMonth.value,items:feedItems.filter(item=>item.date.startsWith(feedMonth.value+'-')),valid:true});
    });
    open.addEventListener('click',()=>{panel.hidden=!panel.hidden;if(!panel.hidden)feedRead.click();});
    document.getElementById('trainingCalendarRead').addEventListener('click',async()=>{
      matchList.replaceChildren();
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
          const monthMatch=headerText.toLocaleLowerCase('sv-SE').match(/(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+(20\d{2})/);
          if(!monthMatch)throw Error('Kunde inte läsa månad och år i bildens överkant.');
          const monthHeading=monthMatch[1]+' '+monthMatch[2];
          const merged=new Map();
          let chunksWithGeometry=0;
          let chunksWithoutGeometry=0;
          const globalWords=[];
          const globalWidth=Math.min(1800,bitmap.width*3);
          const chunkHeight=Math.max(300,Math.round(bitmap.width*2.3));
          const overlap=Math.round(chunkHeight*0.2);
          for(let top=0;top<bitmap.height;top+=chunkHeight-overlap){
            const height=Math.min(chunkHeight,bitmap.height-top);
            const canvas=document.createElement('canvas');
            canvas.width=Math.min(1800,bitmap.width*3);
            canvas.height=Math.round(height*canvas.width/bitmap.width);
            canvas.getContext('2d').drawImage(bitmap,0,top,bitmap.width,height,0,0,canvas.width,canvas.height);
            status.textContent='Läser kalendern dag för dag ('+Math.min(100,Math.round((top+height)/bitmap.height*100))+' %) …';
            const result=await worker.recognize(canvas,{}, {blocks:true,tsv:true});
            // Normalize all crop coordinates to the full screenshot. This keeps a
            // hall line with its date even when they fall in different OCR crops.
            const cropWords=extractCalendarWords(result.data);
            for(const word of cropWords){
              const factor=globalWidth/canvas.width;
              globalWords.push({text:word.text,bbox:{
                x0:word.bbox.x0*factor,x1:word.bbox.x1*factor,
                y0:word.bbox.y0*factor+top*globalWidth/bitmap.width,
                y1:word.bbox.y1*factor+top*globalWidth/bitmap.width
              }});
            }
            const layoutItems=parseCalendarLayout(result.data,monthMatch[2]+'-'+String(monthNames.indexOf(monthMatch[1])+1).padStart(2,'0'),canvas.width);
            // A second pass helps iPhone screenshots where the small venue line
            // disappears from the first OCR result. Both canvases remain in memory.
            if(layoutItems?.some(item=>item.type==='training'&&!item.hall)){
              const retryCanvas=document.createElement('canvas');
              retryCanvas.width=Math.min(3000,bitmap.width*5);
              retryCanvas.height=Math.round(height*retryCanvas.width/bitmap.width);
              const retryContext=retryCanvas.getContext('2d');
              retryContext.imageSmoothingEnabled=true;
              retryContext.imageSmoothingQuality='high';
              retryContext.drawImage(bitmap,0,top,bitmap.width,height,0,0,retryCanvas.width,retryCanvas.height);
              const retryResult=await worker.recognize(retryCanvas,{}, {blocks:true,tsv:true});
              // Include the higher-resolution venue words in the global pass as
              // well. Otherwise a hall below a crop boundary is lost again.
              for(const word of extractCalendarWords(retryResult.data)){
                const factor=globalWidth/retryCanvas.width;
                globalWords.push({text:word.text,bbox:{
                  x0:word.bbox.x0*factor,x1:word.bbox.x1*factor,
                  y0:word.bbox.y0*factor+top*globalWidth/bitmap.width,
                  y1:word.bbox.y1*factor+top*globalWidth/bitmap.width
                }});
              }
              const retryItems=parseCalendarLayout(retryResult.data,monthMatch[2]+'-'+String(monthNames.indexOf(monthMatch[1])+1).padStart(2,'0'),retryCanvas.width);
              if(retryItems){
                for(const item of layoutItems){
                  if(item.hall)continue;
                  const better=retryItems.find(candidate=>candidate.type===item.type&&candidate.date===item.date&&candidate.hall);
                  if(better)item.hall=better.hall;
                }
              }
            }
            // If geometry is unavailable, do not silently trust text ordering:
            // the date column can be read one day ahead of an activity.
            if(layoutItems===null){chunksWithoutGeometry++;continue;}
            chunksWithGeometry++;
            for(const item of layoutItems){
              const key=item.type+':'+item.date+':'+(item.place||'');
              const previous=merged.get(key);
              if(previous?.multipleSessions||item.multipleSessions){
                merged.set(key,{...item,hall:null,multipleSessions:true});
              }else if(previous?.hallConflict){
                merged.set(key,{...item,hall:null,hallConflict:true});
              }else if(previous?.hall&&item.hall&&previous.hall!==item.hall){
                merged.set(key,{...item,hall:null,hallConflict:true});
              }else if(!previous||(!previous.hall&&item.hall)){
                merged.set(key,item);
              }
            }
            if(top+height>=bitmap.height)break;
          }
          if(!chunksWithGeometry)throw Error('OCR-motorn gav inga läsbara positionsdata i någon bilddel. Ingen import har gjorts.');
          if(chunksWithoutGeometry)throw Error('Positionsdata saknades i '+chunksWithoutGeometry+' bilddelar. Importen stoppades för att inte missa aktiviteter.');
          // Parse the entire vertical calendar once, so overlapping crops cannot
          // truncate the date-to-venue association. Keep higher-resolution
          // per-crop matches as a fallback when the global read lacks a hall.
          const globalItems=parseCalendarLayout(globalWords,monthMatch[2]+'-'+String(monthNames.indexOf(monthMatch[1])+1).padStart(2,'0'),globalWidth)||[];
          for(const item of globalItems){
            const key=item.type+':'+item.date+':'+(item.place||'');
            const previous=merged.get(key);
            if(previous?.multipleSessions||item.multipleSessions){
              merged.set(key,{...item,hall:null,multipleSessions:true});
            }else if(previous?.hall&&item.hall&&previous.hall!==item.hall){
              // Conflicting OCR readings must not silently overwrite one another.
              merged.set(key,{...item,hall:null,hallConflict:true});
            }else if(previous?.hallConflict){
              merged.set(key,{...item,hall:null,hallConflict:true});
            }else if(!previous||item.hall&&!previous.hall)merged.set(key,item);
          }
          // Re-read only the unresolved day's own vertical interval at higher
          // resolution. Never infer a venue from the previous or next date.
          const dayAnchors=globalWords.filter(w=>w.bbox.x0<globalWidth*0.115&&/^\d{1,2}$/.test(String(w.text).trim()))
            .map(w=>({day:Number(w.text.trim()),y:w.bbox.y0}))
            .filter(w=>w.day>=1&&w.day<=31).sort((a,b)=>a.y-b.y);
          const distinctDays=[];
          for(const anchor of dayAnchors){
            if(!distinctDays.some(d=>d.day===anchor.day&&Math.abs(d.y-anchor.y)<Math.max(8,globalWidth*0.018)))
              distinctDays.push(anchor);
          }
          for(const item of merged.values()){
            if((item.type==='training'&&item.hall)||item.hallConflict||item.multipleSessions||(item.type==='pool'&&item.place))continue;
            const day=Number(item.date.slice(-2));
            const anchor=distinctDays.find(d=>d.day===day);
            if(!anchor)continue;
            const next=distinctDays.find(d=>d.y>anchor.y+globalWidth*0.012);
            if(!next)continue; // No reliable bottom boundary: never read adjacent days.
            const yStart=Math.max(0,Math.floor((anchor.y+globalWidth*0.012)*bitmap.width/globalWidth));
            const yEnd=Math.min(bitmap.height,Math.floor((next.y-globalWidth*0.008)*bitmap.width/globalWidth));
            if(yEnd-yStart<18)continue;
            const dayCanvas=document.createElement('canvas');
            dayCanvas.width=Math.min(3200,bitmap.width*6);
            dayCanvas.height=Math.round((yEnd-yStart)*dayCanvas.width/bitmap.width);
            dayCanvas.getContext('2d').drawImage(bitmap,0,yStart,bitmap.width,yEnd-yStart,0,0,dayCanvas.width,dayCanvas.height);
            const dayResult=await worker.recognize(dayCanvas,{}, {blocks:true,tsv:true});
            const dayWords=extractCalendarWords(dayResult.data);
            // The focused read is a cropped day without its original date anchor.
            // Re-run the same event-scoped parser with a synthetic anchor rather
            // than reading halls/venues from any unrelated activity on that day.
            const focused=dayWords.length?parseCalendarLayout([
              {text:String(day),bbox:{x0:0,x1:12,y0:0,y1:12}},
              ...dayWords
            ],item.date.slice(0,7),dayCanvas.width)||[]:[];
            const matches=focused.filter(candidate=>candidate.type===item.type);
            if(matches.length!==1)continue;
            const candidate=matches[0];
            if(item.type==='training'){
              if(candidate.hallConflict||candidate.multipleSessions){
                item.hall=null;item.hallConflict=!!candidate.hallConflict;
                item.multipleSessions=!!candidate.multipleSessions;
              }else if(candidate.hall&&item.hall&&item.hall!==candidate.hall){
                item.hall=null;item.hallConflict=true;
              }else if(candidate.hall&&!item.hallConflict)item.hall=candidate.hall;
            }else if(item.type==='pool'&&candidate.place){
              item.place=candidate.place;
            }
          }
          const reconciledItems=reconcileCalendarPoolDuplicates([...merged.values()]);
          parsed={month:monthNames.indexOf(monthMatch[1])+1,items:reconciledItems,valid:reconciledItems.length>0};
          parsed.month=monthMatch[2]+'-'+String(parsed.month).padStart(2,'0');
        }finally{bitmap.close();}
        await showCandidates(parsed);
      }catch(error){status.textContent='Bildtolkning misslyckades: '+(error.message||String(error));}
      finally{input.value='';if(worker)await worker.terminate();}
    });
    confirm.addEventListener('click',async()=>{
      if(!currentContext||!importMonth||!candidates.length)return;
      confirm.disabled=true;
      // Each candidate has its own checkbox: equal OCR keys must not select each other.
      const selected=candidates.filter(c=>{const check=reviewChecks.get(c);return !!check&&!check.disabled&&check.checked;});
      if(!selected.length){
        status.textContent='Inga aktiviteter är markerade för import. Kontrollera uppgifterna och markera minst en aktivitet.';
        confirm.disabled=false;return;
      }
      if(selected.some(c=>!validCalendarImportDate(c.date,importMonth))){
        status.textContent='Import stoppad: minst ett datum är ogiltigt, passerat eller utanför kalendermånaden.';
        confirm.disabled=false;return;
      }
      if(selected.some(c=>c.type==='pool'&&!c.place)){
        status.textContent='Import stoppad: ange plats för alla markerade poolspel.';
        confirm.disabled=false;return;
      }
      if(selected.some(c=>c.type==='training'&&(!c.hall||c.multipleSessions))){
        status.textContent='Import stoppad: välj hall för alla markerade träningar.';
        confirm.disabled=false;return;
      }
      if(new Set(selected.map(calendarImportIdentity)).size!==selected.length){
        status.textContent='Import stoppad: dubbla aktiviteter med samma datum och spelplats. Kontrollera uppgifterna.';
        confirm.disabled=false;return;
      }
      const knownTrainingDates=new Set(currentContext.dates);
      let created=0,skipped=0;
      for(const item of selected){
        if(item.date<todayLocalDate()){skipped++;continue;}
        if(item.type==='training'&&currentContext.dates.has(item.date)){skipped++;continue;}
        if(item.type==='pool'){
          try{
            const latest=await DB.listPools();
            if(latest.some(p=>p.pool_date===item.date&&!!String(item.place||'').trim()&&normalizeCalendarPoolPlace(p.place)===normalizeCalendarPoolPlace(item.place))){skipped++;continue;}
            await DB.addPool({title:'Poolspel',place:item.place,hall:item.hall,pool_date:item.date,status:'Aktiv',teams:2,matches:4,players_on_field:3,periods:1,period_time:15,sub_time:60,calendarImport:true});
            created++;continue;
          }catch(error){status.textContent='Importerade '+created+'. Poolspel '+item.date+' kunde inte sparas: '+error.message;confirm.disabled=false;return;}
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
        }catch(error){status.textContent='Importerade '+created+'. Avbröt vid '+item.date+': '+error.message;confirm.disabled=false;return;}
      }
      // Never delete when the user selected only a subset or OCR found no training.
      const selectedAll=candidates.every(c=>(reviewChecks.get(c)?.checked&&!reviewChecks.get(c)?.disabled)||
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
      window.NSKViewCache?.clear();await render();
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{setupCalendarImport();render();});
  document.addEventListener('nsk:page-show',()=>void render());
  window.addEventListener('pageshow',event=>{if(event.persisted)render();});
})();
