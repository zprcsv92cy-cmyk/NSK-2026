(()=>{
 const $=id=>document.getElementById(id),base=String(window.APP_CONFIG?.AUTH_URL||'').replace(/\/$/,'');
 async function request(path,body,token){
  const response=await fetch(base+path,{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Tjänsten kunde inte nås. Försök igen.');return data;
 }
 function destination(){
  const fallback=new URL('../startsida/',location.href),raw=new URLSearchParams(location.search).get('next');
  if(!raw||!raw.startsWith('/')||raw.startsWith('//')||raw.includes('\\'))return fallback.href;
  const target=new URL(raw,location.origin),root=new URL('../',location.href).pathname,slug=target.pathname.startsWith(root)?target.pathname.slice(root.length).split('/')[0]:'';
  return target.origin===location.origin&&['startsida','truppen','skapapoolspel','malvaktsstatistik','bytesschema','matchvy','lag','laguppstallning','anvandare','mittkonto','traningsgrupper','ovningsarkiv','ritverktyg'].includes(slug)?target.href:fallback.href;
 }
 if($('loginForm')){
  let busy=false;window.Auth.init().then(actor=>{if(actor)location.replace(destination());}).catch(()=>{});
  $('loginForm').addEventListener('submit',async event=>{
   event.preventDefault();if(busy)return;busy=true;$('submitButton').disabled=true;$('message').textContent='Loggar in…';
   try{await window.Auth.login($('email').value.trim(),$('password').value);location.replace(destination());}
   catch(error){$('message').textContent=error.message||'Inloggningen misslyckades';}
   finally{$('password').value='';busy=false;$('submitButton').disabled=false;}
  });
  $('forgotOpen').addEventListener('click',()=>{const open=$('forgotPanel').hidden;$('forgotPanel').hidden=!open;$('forgotOpen').setAttribute('aria-expanded',String(open));if(open){$('forgotEmail').value=$('email').value;$('forgotEmail').focus();}});
  fetch(base+'/api/auth/account-options',{credentials:'omit',cache:'no-store'}).then(r=>r.ok?r.json():{}).then(options=>{
   $('forgotInfo').textContent=options.email_delivery?'Ange din registrerade e-postadress. Om ett aktivt konto finns får du en engångslänk för att välja nytt lösenord.':'Ange din registrerade e-postadress. Huvudadministratören får din begäran i användarhanteringen och kan ge dig en säker engångslänk. Automatiska e-postutskick är inte aktiverade.';
  }).catch(()=>{});
  $('forgotForm').addEventListener('submit',async event=>{
   event.preventDefault();$('forgotSubmit').disabled=true;$('forgotMessage').textContent='Tar emot begäran…';
   try{const result=await request('/api/auth/forgot-password',{email:$('forgotEmail').value.trim()});$('forgotMessage').textContent=result.message;}
   catch(error){$('forgotMessage').textContent=error.message;}
   finally{$('forgotSubmit').disabled=false;}
  });
 }
 if($('accountPasswordForm')){
  const parts=new URLSearchParams(location.hash.slice(1)),purpose=parts.get('purpose')==='reset'?'reset':'activate';let secret=parts.get('token')||'';
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  if(secret){$('manualTokenLabel').hidden=true;$('token').required=false;}else $('token').required=true;
  if(purpose==='reset'){$('accessTitle').textContent='Återställ lösenord';$('accessInfo').textContent='Välj ett nytt lösenord. Länken kan bara användas en gång. Efteråt behöver du logga in igen.';$('accessSubmit').textContent='Spara nytt lösenord';document.title='Återställ lösenord – NSK';}
  $('accountPasswordForm').addEventListener('submit',async event=>{
   event.preventDefault();const password=$('newPassword').value;
   if(password!==$('confirmPassword').value){$('accessMessage').textContent='Lösenorden stämmer inte överens.';return;}
   if(password.length<12){$('accessMessage').textContent='Använd minst 12 tecken.';return;}
   $('accessSubmit').disabled=true;$('accessMessage').textContent='Sparar…';
   try{await request(purpose==='reset'?'/api/auth/reset-password':'/api/auth/activate',{token:secret||$('token').value.trim(),password});secret='';$('token').value='';$('accountPasswordForm').reset();$('accessMessage').textContent=purpose==='reset'?'Lösenordet är ändrat. Logga in med ditt nya lösenord.':'Kontot är aktiverat. Du kan nu logga in.';$('accessSubmit').hidden=true;}
   catch(error){$('accessMessage').textContent=error.message;}
   finally{$('newPassword').value='';$('confirmPassword').value='';$('accessSubmit').disabled=false;}
  });
 }
 if($('changePasswordForm')){
  window.Auth.init().then(actor=>{if(actor)$('passwordChangeSection').hidden=false;}).catch(()=>{});
  $('changePasswordForm').addEventListener('submit',async event=>{
   event.preventDefault();const message=$('changePasswordMessage'),submit=$('changePasswordSubmit');
   if($('changeNewPassword').value!==$('changeConfirmPassword').value){message.textContent='Lösenorden stämmer inte överens.';return;}
   submit.disabled=true;message.textContent='Ändrar lösenord…';
   try{await request('/api/auth/change-password',{current_password:$('currentPassword').value,password:$('changeNewPassword').value},window.Auth.getToken());await window.Auth.logout();message.textContent='Lösenordet är ändrat. Logga in igen.';setTimeout(()=>location.replace(new URL('../login/',location.href).href),1000);}
   catch(error){message.textContent=error.message;}
   finally{for(const id of ['currentPassword','changeNewPassword','changeConfirmPassword'])$(id).value='';submit.disabled=false;}
  });
 }
})();
