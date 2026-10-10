// Admin editor for the number of teams in the selected pool.
(()=>{
 const API=window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev';
 const editor=document.getElementById('poolTeamEditor');
 const input=document.getElementById('poolTeamCount');
 const save=document.getElementById('poolTeamSave');
 const message=document.getElementById('poolTeamMessage');
 if(!editor||!input||!save)return;
 let poolId=null;
 async function refresh(){
   const token=localStorage.getItem('nsk_admin_token');
   editor.hidden=true;
   if(!token)return;
   try{
     const status=await fetch(API+'/api/admin/status',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
     const state=await status.json();if(!state.admin)return;
     poolId=sessionStorage.getItem('nsk2_pool_id');if(!poolId)return;
     const pool=await window.DB.getPool(poolId);if(!pool)return;
     input.value=pool.teams||2;editor.hidden=false;
   }catch(err){message.textContent=err.message||'Kunde inte läsa poolspel';}
 }
 save.addEventListener('click',async()=>{
   const teams=Number(input.value);
   if(!Number.isInteger(teams)||teams<1||teams>20){message.textContent='Ange 1–20 lag';return;}
   save.disabled=true;message.textContent='Sparar…';
   try{await window.DB.updatePoolTeams(poolId,teams);message.textContent='Sparat!';location.reload();}
   catch(err){message.textContent=err.message||'Kunde inte spara';}
   finally{save.disabled=false;}
 });
 // Login/logout happens in the admin widget; detect it without modifying that file.
 const observer=new MutationObserver(()=>{const token=localStorage.getItem('nsk_admin_token');if(editor.hidden&&token)refresh();else if(!token)editor.hidden=true;});
 const bar=()=>document.getElementById('nsk-admin-bar');
 const timer=setInterval(()=>{if(bar()){clearInterval(timer);observer.observe(bar(),{childList:true,subtree:true});refresh();}},100);
 setTimeout(()=>clearInterval(timer),10000);
})();
