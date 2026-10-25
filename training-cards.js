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
 window.NSKTrainingCards={actions,presentation};
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
