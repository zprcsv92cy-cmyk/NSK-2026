// Team-count editor: personal permissions in the coordinated release; legacy Adminläge only before cutover.
(()=>{
 const API=window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev';
 const editor=document.getElementById('poolTeamEditor');
 const input=document.getElementById('poolTeamCount');
 const save=document.getElementById('poolTeamSave');
 const message=document.getElementById('poolTeamMessage');
 if(!editor||!input||!save)return;
 const personal=window.APP_CONFIG?.REQUIRE_PERSONAL_POOL_WRITES===true;
 let poolId=null;
 async function refresh(){
   editor.hidden=true;
   save.disabled=true;
   try{
     if(personal){
       if(!window.Auth?.getSession?.())await window.Auth?.init?.();
       const team=window.Auth?.activeTeam?.();
       if(!team||!await window.Auth?.checkTeamFeature?.('pool',team))return;
     } else {
       const token=localStorage.getItem('nsk_admin_token');
       if(!token)return;
       const status=await fetch(API+'/api/admin/status',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
       const state=await status.json();
       if(!state.admin)return;
     }
     poolId=sessionStorage.getItem('nsk2_pool_id');
     if(!poolId)return;
     const pool=await window.DB.getPool(poolId);
     if(!pool)return;
     input.value=pool.teams||2;
     editor.hidden=false;
     save.disabled=false;
   }catch(err){message.textContent=err.message||'Kunde inte läsa poolspel';}
 }
 save.addEventListener('click',async()=>{
   const teams=Number(input.value);
   if(!Number.isInteger(teams)||teams<1||teams>20){message.textContent='Ange 1–20 lag';return;}
   if(!poolId){message.textContent='Välj ett poolspel';return;}
   save.disabled=true;message.textContent='Sparar…';
   try{
     if(personal){
       const team=window.Auth?.activeTeam?.();
       if(!team||!await window.Auth?.checkTeamFeature?.('pool',team))throw Error('Saknar behörighet att ändra poolspel');
     }
     await window.DB.updatePoolTeams(poolId,teams);
     message.textContent='Sparat!';
     location.reload();
   }catch(err){message.textContent=err.message||'Kunde inte spara';}
   finally{save.disabled=false;}
 });
 if(personal){
   window.addEventListener('storage',refresh);
   window.addEventListener('focus',refresh);
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
   refresh();
   return;
 }
 // Keep the old Adminläge behavior only until all client/API switches are ready.
 const observer=new MutationObserver(()=>{const token=localStorage.getItem('nsk_admin_token');if(editor.hidden&&token)refresh();else if(!token)editor.hidden=true;});
 const bar=()=>document.getElementById('nsk-admin-bar');
 const timer=setInterval(()=>{if(bar()){clearInterval(timer);observer.observe(bar(),{childList:true,subtree:true});refresh();}},100);
 setTimeout(()=>clearInterval(timer),10000);
})();
