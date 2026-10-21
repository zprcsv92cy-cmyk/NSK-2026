// Local-first attendance prototype. Personal data is never sent to third-party services.
(() => {
  const palette = [{name:'Röd',hex:'#b11226'},{name:'Blå',hex:'#2563bc'},{name:'Gul',hex:'#a78307'},{name:'Grön',hex:'#218457'}];
  const $ = id => document.getElementById(id);
  const storagePrefix = 'nsk_training_v1:';
  let players = [], team = '';
  let selected = new Set();
  let allocation = [];
  const storageKey = () => storagePrefix + team + ':' + $('trainingDate').value;
  function restore() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey()) || '{}');
      const allowed = new Set(players.map(p => String(p.id)));
      selected = new Set((Array.isArray(data.selected) ? data.selected : []).map(String).filter(x => allowed.has(x)));
      allocation = Array.isArray(data.allocation) ? data.allocation : [];
    } catch { selected = new Set(); allocation = []; }
  }
  function persist() { localStorage.setItem(storageKey(),JSON.stringify({selected:[...selected],allocation})); }
  function renderRoster() {
    const root=$('trainingRoster');root.replaceChildren();
    for(const p of players){
      const label=document.createElement('label');
      const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(String(p.id));
      check.addEventListener('change',()=>{
        if(check.checked)selected.add(String(p.id));else selected.delete(String(p.id));
        allocation=[];persist();renderCount();renderGroups();
      });
      label.append(check,document.createTextNode(p.full_name));root.append(label);
    }
    renderCount();
  }
  function renderCount(){$('trainingCount').textContent=selected.size+' av '+players.length+' spelare kommer';}
  function renderGroups(){
    const root=$('trainingGroups');root.replaceChildren();
    const available=new Map(players.map(p=>[String(p.id),p.full_name]));
    for(const [i,ids] of allocation.entries()){
      if(!Array.isArray(ids))continue;
      const section=document.createElement('section');section.className='training-group';
      const heading=document.createElement('h3');heading.textContent=palette[i].name;heading.style.background=palette[i].hex;
      const ul=document.createElement('ul');
      for(const id of ids){const key=String(id);if(!selected.has(key)||!available.has(key))continue;
        const li=document.createElement('li');li.textContent=available.get(key);ul.append(li);}
      section.append(heading,ul);root.append(section);
    }
  }
  function distribute(){
    const ids=players.filter(p=>selected.has(String(p.id))).map(p=>String(p.id));
    if(!ids.length){$('trainingStatus').textContent='Markera först vilka som kommer.';return;}
    for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
    const count=Number($('trainingColorCount').value);
    allocation=Array.from({length:count},()=>[]);
    ids.forEach((id,i)=>allocation[i%count].push(id));
    persist();renderGroups();
    $('trainingStatus').textContent='Grupperna är fördelade. Du kan slumpa om genom att trycka igen.';
  }
  document.addEventListener('DOMContentLoaded',async()=>{
    $('trainingDate').value=new Date().toLocaleDateString('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'});
    $('trainingDate').addEventListener('change',()=>{restore();renderRoster();renderGroups();});
    $('trainingColorCount').addEventListener('change',()=>{allocation=[];persist();renderGroups();});
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
