// Calendar training presentation and explicit confirmation of saved shirt colors.
(() => {
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function actions(date,hall=''){
  const href='../traningsgrupper/?date='+encodeURIComponent(date)+(hall?'&calendar_hall='+encodeURIComponent(hall):'');
  return '<div class="nsk-training-grid"><button type="button" class="nsk-training-function" data-training-colors aria-expanded="false"><span aria-hidden="true">♙</span>Tröjfärger</button><a class="nsk-training-function" href="'+esc(href)+'"><span aria-hidden="true">↻</span>Träningsplanering</a><a class="nsk-training-function" style="grid-column:1/-1" href="'+esc(href+'&edit=colors#trainingGroups')+'">Redigera tröjfärger</a><button type="button" class="nsk-training-function" data-training-save-colors>Spara tröjfärger</button><span class="small" data-training-save-status role="status"></span></div><div class="nsk-training-presentation" data-training-presentation hidden></div>';
 }
 function presentation(session,players){
  if(!session)return '<p>Ingen fördelning sparad ännu.</p>';
  const names=new Map(players.map(p=>[String(p.id),p.full_name]));
  const name=id=>esc(names.get(String(id))||'Spelare saknas i truppen');
  const goalies=new Set((session.goalies||[]).map(String));
  const selected=new Set((session.selected||[]).map(String));
  const colors=['Röd','Vit','Svart','Grön'];
  let html='<h4>Målvakter</h4><p>'+((session.goalies||[]).filter(id=>selected.has(String(id))).map(name).join(', ')||'Inga målvakter valda')+'</p>';
  const groups=Array.isArray(session.allocation)?session.allocation:[];
  const assigned=new Set(groups.flat().map(String)),unassigned=[...selected].filter(id=>!goalies.has(id)&&!assigned.has(id));
  const extra=unassigned.length?'<section class="nsk-training-color"><h4>Utan tröjfärg</h4><ul>'+unassigned.map(id=>'<li>'+name(id)+'</li>').join('')+'</ul></section>':'';
  if(!groups.length)return html+'<p>Tröjfärger är inte fördelade ännu.</p>'+extra;
  return html+'<div class="nsk-training-color-groups">'+groups.slice(0,4).map((ids,index)=>'<section class="nsk-training-color nsk-training-color-'+index+'"><h4>'+colors[index]+'</h4><ul>'+ids.filter(id=>selected.has(String(id))&&!goalies.has(String(id))).map(id=>'<li>'+name(id)+'</li>').join('')+'</ul></section>').join('')+extra+'</div>';
 }
 function enrich(session,events){
  const hall=value=>String(value||'').trim().toLocaleLowerCase('sv-SE').replace(/ishallen/g,'hallen');
  const savedHall=hall(session.hall);
  const byDate=events.filter(event=>event.type==='training'&&event.date===session.date);
  const matches=byDate.length===1?byDate:byDate.filter(event=>!savedHall||hall(event.hall||event.place)===savedHall);
  if(matches.length!==1)return {...session};
  const event=matches[0],key=hall(event.hall||event.place);
  const fallback=key==='lilla hallen'?'Lilla Hallen':key==='stora hallen'?'Stora hallen':'';
  return {...session,hall:session.hall||fallback,startTime:session.startTime||session.start_time||event.startTime||event.start_time||'',endTime:session.endTime||session.end_time||event.endTime||event.end_time||''};
 }
 function finished(date,time,now=new Date()){
  const span=String(time||'').match(/^(\d{2}:\d{2})[–-](\d{2}:\d{2})$/);
  if(!span)return date<new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm'}).format(now);
  if(span.some((t,i)=>i>0&&(Number(t.slice(0,2))>23||Number(t.slice(3))>59)))return false;
  let day=date;
  if(span[2]<span[1])day=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const target=day+' '+span[2];
  const format=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);
  const utc=Date.parse(day+'T'+span[2]+':00Z');
  const candidates=[1,2].map(offset=>utc-offset*3600000).filter(t=>format(new Date(t))===target);
  return candidates.length>0&&now.valueOf()>=Math.max(...candidates)+3600000;
 }
 function reorder(root=document.getElementById('activityList')||document.getElementById('savedTrainingsList'),now=new Date()){
  if(!root)return;
  if(root.id==='activityList'){window.NSKCalendarList?.render(now);return;}
  const title=root.querySelector('#pastTrainingsTitle'),up=root.querySelector('#upcomingTrainingsTitle');if(!title||!up)return;
  const rows=[...root.querySelectorAll('details[data-date]')],past=[],upcoming=[];
  for(const row of rows)(finished(decodeURIComponent(row.dataset.date),row.querySelector('.nsk-training-time')?.textContent.trim(),now)?past:upcoming).push(row);
  const key=row=>decodeURIComponent(row.dataset.date)+(row.querySelector('.nsk-training-time')?.textContent||'');
  upcoming.sort((a,b)=>key(a).localeCompare(key(b)));past.sort((a,b)=>key(b).localeCompare(key(a)));
  const desired=[...upcoming,...past];
  if(rows.some((row,i)=>row!==desired[i]||row.dataset.trainingFinished!==String(past.includes(row)))){
   for(const row of upcoming){row.dataset.trainingFinished='false';root.insertBefore(row,title);}
   for(const row of past){row.dataset.trainingFinished='true';root.append(row);}
  }
  up.textContent='Kommande träningar ('+upcoming.length+')';title.textContent='Avslutade träningar ('+past.length+')';
 }
 window.NSKTrainingCards={actions,presentation,enrich,finished,reorder};
 let colorsEpoch=0;
 const pendingColors=new WeakMap(),colorsContext=new WeakMap();
 async function loadColors(row,panel,button){
  const team=Auth.activeTeam(),token=Auth.getToken(),date=decodeURIComponent(row.dataset.date),epoch=colorsEpoch,key=JSON.stringify([team,token,date]);
  const previous=pendingColors.get(row);if(previous?.key===key&&previous.epoch===epoch)return previous.promise;
  if(colorsContext.get(row)!==key){panel.textContent='Hämtar…';colorsContext.set(row,key);}
  const entry={key,epoch};pendingColors.set(row,entry);button.disabled=true;
  entry.promise=(async()=>{
   try{
    const [data,players]=await Promise.all([SharedTraining.get(date),SharedTraining.listPlayers()]);
    if(!row.isConnected||panel.hidden||epoch!==colorsEpoch||Auth.activeTeam()!==team||Auth.getToken()!==token)return;
    const html=presentation(data.session,players);if(panel.innerHTML!==html)panel.innerHTML=html;
   }catch{
    if(row.isConnected&&!panel.hidden&&epoch===colorsEpoch&&Auth.activeTeam()===team&&Auth.getToken()===token)panel.textContent='Kunde inte uppdatera tröjfärger. Försök igen.';
   }finally{if(pendingColors.get(row)===entry){pendingColors.delete(row);button.disabled=false;}}
  })();
  return entry.promise;
 }
 async function refreshColors(){
  if(document.hidden||window.NSKShellActive===false)return;
  const root=document.getElementById('activityList')||document.getElementById('savedTrainingsList');if(!root)return;
  await Promise.all([...root.querySelectorAll('details[data-date]')].map(row=>{
   const panel=row.querySelector('[data-training-presentation]'),button=row.querySelector('[data-training-colors]');
   return row.open&&panel&&!panel.hidden&&button?loadColors(row,panel,button):Promise.resolve();
  }));
 }
 document.addEventListener('toggle',event=>{if(event.target?.open&&event.target.matches?.('details[data-date]'))void refreshColors();},true);
 document.addEventListener('nsk:page-show',()=>void refreshColors());
 window.addEventListener?.('focus',()=>void refreshColors());
 window.addEventListener?.('nsk:saved-trainings-rendered',()=>void refreshColors());
 window.addEventListener?.('nsk:page-hide',()=>{colorsEpoch++;});
 window.addEventListener?.('pagehide',()=>{colorsEpoch++;});
 document.addEventListener('DOMContentLoaded',()=>{setInterval(()=>{reorder();void refreshColors();},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){reorder();void refreshColors();}else colorsEpoch++;});});
 document.addEventListener('click',async event=>{
  const save=event.target.closest?.('[data-training-save-colors]');
  if(save){const row=save.closest('details[data-date]'),status=row?.querySelector('[data-training-save-status]');if(!row||!status)return;save.disabled=true;try{
   const date=decodeURIComponent(row.dataset.date),data=await SharedTraining.get(date);if(!data.session){status.textContent='Öppna Träningsplanering och fördela tröjfärger först.';return;}
   const {revision,...session}=data.session;await SharedTraining.save(date,{...session,revision,base:{session}});status.textContent='Tröjfärger sparade.';await refreshColors();
  }catch(error){status.textContent=error.message||'Tröjfärgerna kunde inte sparas.';}finally{save.disabled=false;}return;}
  const button=event.target.closest?.('[data-training-colors]');if(!button)return;
  const row=button.closest('details[data-date]'),panel=row?.querySelector('[data-training-presentation]');if(!panel)return;
  if(!panel.hidden){panel.hidden=true;button.setAttribute('aria-expanded','false');return;}
  panel.hidden=false;button.setAttribute('aria-expanded','true');panel.textContent='Hämtar…';
  await loadColors(row,panel,button);
 });
})();
