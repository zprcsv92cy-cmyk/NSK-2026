// Startsida: read-only training presentation. Editing stays on the training page.
(() => {
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function actions(date,hall=''){
  const href='../traningsgrupper/?date='+encodeURIComponent(date)+(hall?'&calendar_hall='+encodeURIComponent(hall):'');
  return '<div class="nsk-training-grid"><button type="button" class="nsk-training-function" data-training-colors aria-expanded="false"><span aria-hidden="true">♙</span>Tröjfärger</button><a class="nsk-training-function" href="'+esc(href)+'"><span aria-hidden="true">↻</span>Träningsplanering</a></div><div class="nsk-training-presentation" data-training-presentation hidden></div>';
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
  if(!groups.length)return html+'<p>Tröjfärger är inte fördelade ännu.</p>';
  return html+'<div class="nsk-training-color-groups">'+groups.slice(0,4).map((ids,index)=>'<section class="nsk-training-color nsk-training-color-'+index+'"><h4>'+colors[index]+'</h4><ul>'+ids.filter(id=>selected.has(String(id))&&!goalies.has(String(id))).map(id=>'<li>'+name(id)+'</li>').join('')+'</ul></section>').join('')+'</div>';
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
 function reorder(root=document.getElementById('savedTrainingsList'),now=new Date()){
  if(!root)return;const title=root.querySelector('#pastTrainingsTitle'),up=root.querySelector('#upcomingTrainingsTitle');if(!title||!up)return;
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
 window.NSKTrainingCards={actions,presentation,finished,reorder};
 document.addEventListener('DOMContentLoaded',()=>{setInterval(()=>reorder(),15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)reorder();});});
 document.addEventListener('click',async event=>{
  const button=event.target.closest?.('[data-training-colors]');if(!button)return;
  const row=button.closest('details[data-date]'),panel=row?.querySelector('[data-training-presentation]');if(!panel)return;
  if(!panel.hidden){panel.hidden=true;button.setAttribute('aria-expanded','false');return;}
  panel.hidden=false;button.setAttribute('aria-expanded','true');panel.textContent='Hämtar…';button.disabled=true;
  const team=Auth.activeTeam(),date=decodeURIComponent(row.dataset.date);
  try{
   const [data,players]=await Promise.all([SharedTraining.get(date),SharedTraining.listPlayers()]);
   if(!row.isConnected||Auth.activeTeam()!==team)return;
   panel.innerHTML=presentation(data.session,players);
  }catch{panel.textContent='Kunde inte hämta tröjfärger. Försök igen.';}
  finally{button.disabled=false;}
 });
})();
