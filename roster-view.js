// Presentation only: reuse existing roster data and card reads, without extra API requests.
(() => {
 function init(){
  const players=document.getElementById('playersList'),coaches=document.getElementById('coachesList');
  if(!players||!coaches)return;
  const staff=['leaderList','fitnessList','equipmentList'].map(id=>document.getElementById(id)).filter(Boolean);
  const playerPanel=players.closest('section'),coachPanel=coaches.closest('section');
  const other=document.createElement('div');other.className='roster-other';other.id='roster-other';
  coachPanel.after(other);for(const list of staff)other.append(list.closest('section'));
  const toolbar=document.createElement('div');toolbar.className='roster-toolbar no-print';
  toolbar.innerHTML='<div class="roster-tabs" role="tablist" aria-label="Roll i truppen"></div><label for="rosterNameSearch">Sök namn<input type="search" id="rosterNameSearch" placeholder="Sök namn" autocomplete="off"></label><p id="rosterSearchStatus" class="small" role="status" aria-live="polite" hidden></p>';
  playerPanel.before(toolbar);
  const tabs=toolbar.querySelector('[role=tablist]'),search=toolbar.querySelector('input'),message=toolbar.querySelector('[role=status]');
  const groups=[{label:'Spelare',panel:playerPanel,lists:[players]},{label:'Tränare',panel:coachPanel,lists:[coaches]},{label:'Övriga',panel:other,lists:staff}];
  let selected=0;
  for(const [index,group] of groups.entries()){
   group.panel.classList.add('roster-tab-panel');group.panel.id=group.panel.id||'roster-panel-'+index;group.panel.setAttribute('role','tabpanel');group.panel.setAttribute('aria-labelledby','roster-tab-'+index);
   const button=document.createElement('button');button.type='button';button.id='roster-tab-'+index;button.setAttribute('role','tab');button.setAttribute('aria-controls',group.panel.id);button.addEventListener('click',()=>select(index));tabs.append(button);group.button=button;
  }
  function select(index){selected=index;for(const [i,group] of groups.entries()){group.panel.hidden=i!==index;group.button.setAttribute('aria-selected',String(i===index));group.button.tabIndex=i===index?0:-1;}refresh();}
  tabs.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(selected+1)%groups.length;else if(event.key==='ArrowLeft')next=(selected+groups.length-1)%groups.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=groups.length-1;else return;event.preventDefault();select(next);groups[next].button.focus();});
  for(const [panel,label] of [[playerPanel,'spelare'],[coachPanel,'tränare']]){
   const row=panel.querySelector('.roster-add-row');if(!row)continue;
   const details=document.createElement('details');details.className='roster-add no-print';const summary=document.createElement('summary');summary.textContent='＋ Lägg till '+label;row.before(details);details.append(summary,row);panel.append(details);
  }
  const setText=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
  function refresh(){
   const term=search.value.trim().toLocaleLowerCase('sv');let matches=0;
   for(const [index,group] of groups.entries()){
    const rows=group.lists.flatMap(list=>[...list.querySelectorAll('.person-row')]);setText(group.button,group.label+' ('+(!rows.length&&index<2&&document.body.dataset.rosterLoading==='true'?'…':rows.length)+')');
    for(const row of rows){
     const button=row.querySelector('[data-roster-name]');const name=button?.querySelector('.roster-name')?.textContent||row.querySelector('summary')?.textContent||'';
     const hide=!!term&&!name.toLocaleLowerCase('sv').includes(term);if(row.hidden!==hide)row.hidden=hide;
     if(hide)row.dataset.rosterSearchHidden='true';else delete row.dataset.rosterSearchHidden;
     if(index===selected&&!hide)matches++;
     if(button){const [kind,id]=button.dataset.rosterName.split(':');const badge=button.querySelector('.roster-shirt');if(badge&&window.PersonPhotos){let image=badge.querySelector('img');if(!image){badge.replaceChildren();image=document.createElement('img');image.alt='';image.width=image.height=36;badge.append(image);}window.PersonPhotos.mount(image,button.dataset.rosterTeam,kind,id);}const card=window.PersonCards?.summary?.(button.dataset.rosterTeam,kind,id);if(card){setText(button.querySelector('.roster-meta'),[card.position,card.hand].filter(Boolean).join(' · ')||(kind==='player'?'Spelarkort':'Tränarkort'));setText(button.querySelector('.roster-shirt-number'),kind==='player'?card.number||'':'');}}
    }
   }
   message.hidden=!term;setText(message,term?(matches?matches+(matches===1?' träff':' träffar'):'Inga namn matchar sökningen.'):'');
  }
  let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;refresh();});};
  const observer=new MutationObserver(schedule);for(const list of [players,coaches,...staff])observer.observe(list,{childList:true,subtree:true});
  search.addEventListener('input',refresh);window.addEventListener('nsk:roster-loading',schedule);window.addEventListener('nsk:person-card',schedule);window.addEventListener('nsk:team-changed',schedule);
  select(0);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
