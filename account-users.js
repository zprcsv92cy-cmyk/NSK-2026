(()=>{
 const $=id=>document.getElementById(id),base=String(window.APP_CONFIG?.AUTH_URL||'').replace(/\/$/,'');
 const permissionNames={'read':'Läsbehörighet','pool:create':'Skapa poolspel','lineup:edit':'Ändra laguppställning','shifts:check':'Checka byten','match:manage':'Hantera matchvy','pool:finish':'Avsluta poolspel','pool:reopen':'Återöppna poolspel','roster:manage':'Hantera truppen','users:manage':'Hantera användare'};
 const roles={viewer:'Läsare',coach:'Tränare',team_admin:'Administratör',team_manager:'Lagledare',fitness:'Fysansvarig',equipment:'Materialförvaltare',player:'Spelare'};
 let actor=null,users=[],memberships=[],emailDelivery=false;
 const message=text=>{$('status').textContent=text;};
 async function api(path,method='GET',body){
  const response=await fetch(base+path,{method,credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+window.Auth.getToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Åtgärden misslyckades. Kontrollera anslutningen och försök igen.');return data;
 }
 function choices(root,grants){
  root.replaceChildren();const inputs=[];
  for(const [value,text] of Object.entries(permissionNames)){
   const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=value;input.checked=grants.includes(value);label.append(input,document.createTextNode(text));root.append(label);inputs.push(input);
  }return ()=>inputs.filter(i=>i.checked).map(i=>i.value);
 }
 let newGrants=choices($('newPermissions'),['read']);
 function button(label,action,disabled=false){const b=document.createElement('button');b.type='button';b.className='nsk-action nsk-action--neutral';b.textContent=label;b.disabled=disabled;b.onclick=async()=>{b.disabled=true;try{await action();}catch(error){message(error.message);}finally{b.disabled=disabled;}};return b;}
 async function linkAction(user,root,send){
  const path='/api/auth/users/'+user.id+(send?'/send-link':user.setup_required?'/setup-token':'/password-token');
  const result=await api(path,'POST');
  root.replaceChildren();
  if(send){root.textContent='Länken har skickats till kontots e-postadress.';return;}
  const link=new URL('../aktivera/',location.href);link.hash=new URLSearchParams({token:result.token,purpose:result.purpose||'activate'}).toString();
  const note=document.createElement('p');note.textContent='Engångslänken gäller i '+result.expires_in_minutes+' minuter. Kontrollera mottagaren och dela länken enbart med den personen.';
  const copy=button('Kopiera '+(user.setup_required?'inbjudningslänk':'återställningslänk'),async()=>{try{await navigator.clipboard.writeText(link.href);message('Länken är kopierad.');}catch{message('Webbläsaren kunde inte kopiera. Tillåt urklipp och tryck Kopiera igen.');}});
  root.append(note,copy);
 }
 function render(){
  const filter=$('userSearch').value.trim().toLocaleLowerCase('sv-SE');$('members').replaceChildren();
  for(const user of users.filter(u=>(u.name+' '+u.email).toLocaleLowerCase('sv-SE').includes(filter))){
   const card=document.createElement('article');card.className='user-card';
   const heading=document.createElement('h3');heading.textContent=user.name+(user.is_primary_admin?' – Huvudadministratör':user.is_global_admin?' – Global administratör':'');
   const info=document.createElement('p');info.textContent=user.email;
   const state=document.createElement('p');state.className='user-state';state.textContent=user.setup_required?'Väntar på aktivering':user.disabled?'Inaktiverat konto':'Aktivt konto';
   if(user.recovery_requested_at)state.textContent+=' · Begäran om lösenordshjälp väntar';
   const locked=user.is_global_admin&&!actor.is_global_admin,self=user.id===actor.user.id;
   const member=memberships.find(m=>m.user_id===user.id&&m.team_id==='NSK Team 18');
   const roleLabel=document.createElement('label');roleLabel.textContent='Lagroll – NSK Team 18';const select=document.createElement('select');select.setAttribute('aria-label','Lagroll för '+user.name);
   for(const [value,label] of Object.entries(roles)){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}select.value=member?.role||'viewer';select.disabled=locked||user.is_primary_admin;roleLabel.append(select);
   const roleInfo=document.createElement('p');roleInfo.textContent=member?'Kopplat till NSK Team 18':'Ingen koppling till NSK Team 18';
   const actions=document.createElement('div');actions.className='user-actions';
   actions.append(button('Spara lagroll',async()=>{await api('/api/auth/team-members','PUT',{user_id:user.id,team_id:'NSK Team 18',role:select.value});await refresh();message('Lagrollen är sparad.');},locked||user.is_primary_admin));
   if(member)actions.append(button('Ta bort lagkoppling',async()=>{if(!confirm('Ta bort '+user.name+' från NSK Team 18? Inloggningskontot behålls.'))return;await api('/api/auth/team-members','DELETE',{user_id:user.id,team_id:'NSK Team 18'});await refresh();message('Lagkopplingen är borttagen.');},locked||self||user.is_primary_admin));
   const grantsBox=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent='Personliga behörigheter';const grid=document.createElement('div');grid.className='permission-list';const getGrants=choices(grid,user.permissions||[]);for(const input of grid.querySelectorAll('input'))input.disabled=locked||user.is_primary_admin||(self&&input.value==='users:manage');
   const save=button('Spara behörigheter',async()=>{await api('/api/auth/users/'+user.id+'/permissions','PUT',{permissions:getGrants()});await refresh();message('Behörigheterna är sparade. Borttagna behörigheter gäller direkt på servern.');},locked||user.is_primary_admin);grantsBox.append(legend,grid,save);
   const accountActions=document.createElement('div');accountActions.className='user-actions';const linkStatus=document.createElement('div');linkStatus.className='user-link-status';linkStatus.setAttribute('role','status');
   accountActions.append(button(user.setup_required?'Skapa inbjudningslänk':'Skapa återställningslänk',()=>linkAction(user,linkStatus,false),locked||(!user.setup_required&&user.disabled)));
   if(emailDelivery)accountActions.append(button(user.setup_required?'Skicka inbjudan':'Skicka återställningslänk',()=>linkAction(user,linkStatus,true),locked||(!user.setup_required&&user.disabled)));
   if(!user.setup_required)accountActions.append(button(user.disabled?'Återaktivera konto':'Inaktivera konto',async()=>{if(!confirm((user.disabled?'Återaktivera ':'Inaktivera ')+user.name+'?'))return;await api('/api/auth/users/'+user.id+'/status','PATCH',{disabled:!user.disabled});await refresh();message('Kontostatus uppdaterad.');},locked||self||user.is_primary_admin));
   accountActions.append(button('Ändra namn och e-post',async()=>{const name=prompt('Namn',user.name);if(name===null)return;const email=prompt('E-postadress',user.email);if(email===null)return;await api('/api/auth/users/'+user.id,'PATCH',{name,email});if(self&&email.trim().toLowerCase()!==user.email){await window.Auth.logout();location.replace(new URL('../login/',location.href).href);return;}await refresh();message('Uppgifterna är uppdaterade. Ändrad e-post kräver ny inloggning.');},locked||user.is_primary_admin));
   const remove=button('Ta bort användare',async()=>{if(!confirm('Ta bort inloggningskontot för '+user.name+' ('+user.email+') permanent? Konto, behörigheter och lagkopplingar tas bort. Truppen och matchhistoriken påverkas inte. Detta kan inte ångras.'))return;await api('/api/auth/users/'+user.id,'DELETE');await refresh();message('Användarkontot är borttaget.');},locked||self||user.is_primary_admin);remove.className='nsk-action nsk-action--delete';accountActions.append(remove);
   card.append(heading,info,state,roleLabel,roleInfo,actions,grantsBox,accountActions,linkStatus);$('members').append(card);
  }
  if(!$('members').children.length)$('members').textContent='Inga användare hittades.';
 }
 async function refresh(){
  actor=await window.Auth.init();
  if(!actor?.permissions?.includes('users:manage')){$('userAdmin').hidden=true;throw Error('Du saknar behörighet att hantera användare.');}
  const [records,teams]=await Promise.all([api('/api/auth/users'),api('/api/auth/team-members')]);users=records.users;memberships=teams.memberships;emailDelivery=records.email_delivery===true;
  $('administratorBadge').textContent=actor.is_primary_admin?'Inloggad som huvudadministratör – alltid full åtkomst':'Inloggad med behörighet att hantera användare';
  $('deliveryInfo').textContent=emailDelivery?'Inbjudan och återställningslänk kan skickas till användarens registrerade e-postadress.':'Automatiska e-postutskick är inte konfigurerade. Skapa en engångslänk och dela den säkert. Begäran från Glömt lösenord visas på användarens konto.';
  $('userAdmin').hidden=false;render();
 }
 $('userSearch').addEventListener('input',render);
 $('createUser').addEventListener('submit',async event=>{
  event.preventDefault();const submit=event.submitter||$('createUser').querySelector('button');submit.disabled=true;message('Skapar användare…');
  try{await api('/api/auth/users','POST',{name:$('newName').value.trim(),email:$('newEmail').value.trim(),team_id:$('newTeam').value,role:$('newRole').value,permissions:newGrants()});$('createUser').reset();newGrants=choices($('newPermissions'),['read']);await refresh();message('Kontot är skapat och väntar på aktivering. Skapa en inbjudningslänk på användarens konto nedan.');}
  catch(error){message(error.message);}finally{submit.disabled=false;}
 });
 refresh().then(()=>message('Användarhanteringen är klar.')).catch(error=>message(error.message));
})();
