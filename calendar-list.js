// One chronological calendar, using the original cards and their event handlers.
(() => {
 function sortEntries(entries){
  return entries.slice().sort((a,b)=>Number(a.finished)-Number(b.finished)||(a.finished?b.date.localeCompare(a.date):a.date.localeCompare(b.date))||a.time.localeCompare(b.time)||a.kind.localeCompare(b.kind));
 }
 let observer;
 function render(now=new Date()){
  const root=document.getElementById('activityList');if(!root)return;
  observer?.disconnect();
  try{
   const entries=[...root.querySelectorAll('details.nsk-pool-row[data-date],details.nsk-pool-row[data-pool-date]')].map(row=>{
    const training=!!row.dataset.date;
    const name=row.querySelector('.nsk-pool-name');
    if(name&&!name.querySelector('.calendar-kind')){
      const label=document.createElement('span');label.className='calendar-kind';label.textContent=training?'Träning':'Poolspel';name.prepend(label);
    }
    // Keep the date intact without preventing long event names from wrapping.
    if(name&&!name.querySelector('.calendar-date')){
      for(const node of [...name.childNodes]){
        if(node.nodeType!==3)continue;
        const match=node.textContent.match(/\b\d{4}-\d{2}-\d{2}\b/);if(!match)continue;
        const dateLabel=document.createElement('span');dateLabel.className='calendar-date';dateLabel.textContent=match[0];
        node.replaceWith(document.createTextNode(node.textContent.slice(0,match.index)),dateLabel,document.createTextNode(node.textContent.slice(match.index+match[0].length)));break;
      }
    }
    const raw=training?decodeURIComponent(row.dataset.date):row.dataset.poolDate;
    const date=raw.replaceAll('-','');
    const time=training?(row.querySelector('.nsk-training-time')?.textContent||'').trim():'';
    const finished=training?window.NSKTrainingCards.finished(raw,time,now):row.dataset.poolFinished==='true';
    if(training)row.dataset.trainingFinished=String(finished);
    return {row,date,time,finished,kind:training?'training':'pool'};
   });
   const ordered=sortEntries(entries),up=ordered.filter(item=>!item.finished),past=ordered.filter(item=>item.finished);
   const upTitle=document.getElementById('upcomingActivitiesTitle'),pastTitle=document.getElementById('pastActivitiesTitle');
   upTitle.textContent='Kommande ('+up.length+')';pastTitle.textContent='Avslutade ('+past.length+')';
   const toggle=document.getElementById('togglePastActivities');if(toggle){toggle.hidden=!past.length;const expanded=toggle.getAttribute('aria-expanded')==='true';toggle.textContent=expanded?'Dölj avslutade':'Visa avslutade';for(const item of past)item.row.hidden=!expanded;}for(const item of up)item.row.hidden=false;
   const actions=root.querySelector('.calendar-create-actions');
   if(actions.nextElementSibling!==pastTitle)root.insertBefore(actions,pastTitle);
   // Compare real DOM order before moving cards, preserving keyboard focus and open state.
   const current=[...root.children].filter(node=>node.matches('details.nsk-pool-row'));
   const correct=current.length===ordered.length&&current.every((row,i)=>row===ordered[i].row)&&up.every(item=>item.row.compareDocumentPosition(pastTitle)&Node.DOCUMENT_POSITION_FOLLOWING)&&past.every(item=>pastTitle.compareDocumentPosition(item.row)&Node.DOCUMENT_POSITION_FOLLOWING);
   if(!correct){for(const item of up)root.insertBefore(item.row,actions);for(const item of past)root.append(item.row);}
  }finally{observer?.observe(root,{subtree:true,childList:true,characterData:true});}
 }
 window.NSKCalendarList={sortEntries,render};
 document.addEventListener('DOMContentLoaded',()=>{
  const root=document.getElementById('activityList');if(!root)return;
  document.getElementById('togglePastActivities')?.addEventListener('click',event=>{const button=event.currentTarget;button.setAttribute('aria-expanded',String(button.getAttribute('aria-expanded')!=='true'));render();});
  observer=new MutationObserver(()=>render());render();
  window.addEventListener('nsk:saved-pools-rendered',()=>render());
  window.addEventListener('nsk:saved-trainings-rendered',()=>render());
 });
})();
