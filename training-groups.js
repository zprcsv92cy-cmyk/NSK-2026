// Local-first attendance prototype. Personal data is never sent to third-party services.
(() => {
  const palette = [{name:'Röd',hex:'#b11226',text:'#fff'},{name:'Vit',hex:'#fff',text:'#17181b'},{name:'Svart',hex:'#17181b',text:'#fff'}];
  const $ = id => document.getElementById(id);
  const storagePrefix = 'nsk_training_v1:';
  let players = [], coaches = [], team = '';
  let selectedCoaches = new Set();
  let selected = new Set();
  let allocation = [];
  let goalies = [];
  let goalieCount = 0;
  const storageKey = () => storagePrefix + team + ':' + $('trainingDate').value;
  function restore() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey()) || '{}');
      const allowed = new Set(players.map(p => String(p.id)));
      selected = new Set((Array.isArray(data.selected) ? data.selected : []).map(String).filter(x => allowed.has(x)));
      const allowedCoaches = new Set(coaches.map(p=>String(p.id)));
      selectedCoaches = new Set((Array.isArray(data.selectedCoaches)?data.selectedCoaches:[]).map(String).filter(x=>allowedCoaches.has(x)));
      allocation = Array.isArray(data.allocation) ? data.allocation : [];
      goalies = (Array.isArray(data.goalies) ? data.goalies : []).map(String).filter((id,i,a)=>allowed.has(id)&&selected.has(id)&&a.indexOf(id)===i).slice(0,2);
      goalieCount = Number.isInteger(data.goalieCount) && data.goalieCount>=0 && data.goalieCount<=2 ? data.goalieCount : goalies.length;
      $('trainingGoalieCount').value = String(goalieCount);
    } catch { selected = new Set(); selectedCoaches = new Set(); allocation = []; goalies = []; goalieCount=0; $('trainingGoalieCount').value='0'; }
  }
  function persist() { localStorage.setItem(storageKey(),JSON.stringify({selected:[...selected],selectedCoaches:[...selectedCoaches],allocation,goalies,goalieCount})); }
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
  const normalized = value => String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sv-SE').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  function importCandidates(text){
    const roster=[...players.map(p=>({...p,kind:'player'})),...coaches.map(p=>({...p,kind:'coach'}))];
    const lines=String(text||'').split(/\n/).map(x=>x.trim()).filter(Boolean);
    const found=new Map();
    for(const line of lines){
      const cleaned=normalized(line.replace(/\s*\|.*$/,'').replace(/\s*[-–]\s*(ass\.?\s*tranare|huvudtranare|materialare|lagledare).*$/i,''));
      if(!cleaned||cleaned.length<3)continue;
      const matches=roster.filter(p=>{
        const full=normalized(p.full_name);
        const parts=full.split(' ');
        const abbreviated=parts.length>1?parts[0]+' '+parts[parts.length-1][0]:'';
        return cleaned===full||cleaned===abbreviated;
      });
      if(matches.length===1)found.set(matches[0].kind+':'+matches[0].id,matches[0]);
    }
    return [...found.values()];
  }
  async function readImageText(){
    const files=[...$('trainingImportImages').files];
    if(!files.length)return '';
    if(typeof window.TextDetector!=='function')return ''; // Optional local OCR; never upload images.
    const detector=new window.TextDetector();
    const texts=[];
    for(const file of files){
      const bitmap=await createImageBitmap(file);
      try{
        const blocks=await detector.detect(bitmap);
        texts.push(blocks.map(b=>b.rawValue||'').join('\n'));
      }finally{bitmap.close();}
    }
    return texts.join('\n');
  }
  function showImportReview(matches){
    const root=$('trainingImportReview');root.replaceChildren();
    for(const person of matches){
      const label=document.createElement('label'),check=document.createElement('input');
      check.type='checkbox';check.checked=true;check.dataset.kind=person.kind;check.dataset.id=String(person.id);
      label.append(check,document.createTextNode(person.full_name+' ('+(person.kind==='player'?'spelare':'tränare')+')'));
      root.append(label);
    }
    $('trainingImportApply').disabled=!matches.length;
  }
  function initImport(){
    $('trainingImportImages').addEventListener('change',()=>{
      const root=$('trainingImportPreviews');root.replaceChildren();
      for(const file of $('trainingImportImages').files){
        if(!file.type.startsWith('image/'))continue;
        const img=document.createElement('img');img.className='training-import-preview';img.alt='Vald skärmbild från SvenskaLag';
        const url=URL.createObjectURL(file);img.src=url;img.addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});
        root.append(img);
      }
      $('trainingImportApply').disabled=true;
      $('trainingImportReview').replaceChildren();
    });
    $('trainingImportRead').addEventListener('click',async()=>{
      $('trainingImportApply').disabled=true;
      if(!players.length&&!coaches.length){$('trainingImportStatus').textContent='Truppen måste hämtas först.';return;}
      let text=$('trainingImportText').value;
      try{
        const detected=await readImageText();
        if(detected){text+=(text?'\n':'')+detected;$('trainingImportText').value=text;}
      }catch{$('trainingImportStatus').textContent='Kunde inte läsa bildtext automatiskt. Skriv namnen i textrutan.';}
      importMatches=importCandidates(text);
      showImportReview(importMatches);
      $('trainingImportStatus').textContent=importMatches.length
        ?importMatches.length+' unika namn matchade. Kontrollera markeringarna och bekräfta. Övriga närvaroval ändras inte.'
        :'Inga säkra namnmatchningar. Skriv ett namn per rad som i NSK-truppen. På iPhone kan automatisk bildtextläsning saknas.';
    });
    $('trainingImportApply').addEventListener('click',()=>{
      if(!importMatches.length)return;
      const checks=[...$('trainingImportReview').querySelectorAll('input:checked')];
      for(const check of checks){
        if(check.dataset.kind==='player')selected.add(check.dataset.id);
        else selectedCoaches.add(check.dataset.id);
      }
      allocation=[];persist();renderRoster();renderCoaches();renderGoalieSelectors();renderGroups();
      $('trainingImportStatus').textContent=checks.length+' deltagare markerade som Kommer. Tidigare markeringar har behållits.';
      $('trainingImportApply').disabled=true;
    });
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    initImport();
    $('trainingDate').value=new Date().toLocaleDateString('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'});
    $('trainingDate').addEventListener('change',()=>{restore();renderRoster();renderCoaches();renderGoalieSelectors();renderGroups();});
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
      [players,coaches]=await Promise.all([DB.listPlayers(),DB.listCoaches()]);
      restore();renderRoster();renderCoaches();renderGoalieSelectors();renderGroups();
      $('trainingStatus').textContent=players.length+' spelare och '+coaches.length+' tränare hämtade från NSK-truppen.';
    }catch(error){$('trainingStatus').textContent=error.message||'Kunde inte läsa truppen.';}
  });
})();
