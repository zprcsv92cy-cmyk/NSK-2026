// Local-first attendance prototype. Personal data is never sent to third-party services.
(() => {
  const palette = [{name:'Röd',hex:'#b11226',text:'#fff'},{name:'Vit',hex:'#fff',text:'#17181b'},{name:'Svart',hex:'#17181b',text:'#fff'}];
  const $ = id => document.getElementById(id);
  const storagePrefix = 'nsk_training_v1:';
  let players = [], team = '';
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
      allocation = Array.isArray(data.allocation) ? data.allocation : [];
      goalies = (Array.isArray(data.goalies) ? data.goalies : []).map(String).filter((id,i,a)=>allowed.has(id)&&selected.has(id)&&a.indexOf(id)===i).slice(0,2);
      goalieCount = Number.isInteger(data.goalieCount) && data.goalieCount>=0 && data.goalieCount<=2 ? data.goalieCount : goalies.length;
      $('trainingGoalieCount').value = String(goalieCount);
    } catch { selected = new Set(); allocation = []; goalies = []; goalieCount=0; $('trainingGoalieCount').value='0'; }
  }
  function persist() { localStorage.setItem(storageKey(),JSON.stringify({selected:[...selected],allocation,goalies,goalieCount})); }
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
  document.addEventListener('DOMContentLoaded',async()=>{
    $('trainingDate').value=new Date().toLocaleDateString('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'});
    $('trainingDate').addEventListener('change',()=>{restore();renderRoster();renderGoalieSelectors();renderGroups();});
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
      players=await DB.listPlayers();
      restore();renderRoster();renderGroups();
      $('trainingStatus').textContent=players.length+' spelare hämtade från NSK-truppen.';
    }catch(error){$('trainingStatus').textContent=error.message||'Kunde inte läsa truppen.';}
  });
})();
