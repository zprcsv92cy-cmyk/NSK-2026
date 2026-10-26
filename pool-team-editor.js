// Team count editing uses the same personal pool permission as the pool form.
(()=>{
 const editor=document.getElementById('poolTeamEditor'),input=document.getElementById('poolTeamCount'),save=document.getElementById('poolTeamSave'),message=document.getElementById('poolTeamMessage');
 if(!editor||!input||!save)return;
 let poolId=null;
 async function allowed(){
  const team=window.Auth?.activeTeam?.();
  return !!team&&await window.Auth.checkTeamFeature('pool',team)&&window.Auth.activeTeam()===team;
 }
 async function refresh(){
  editor.hidden=true;
  try{
   await window.Auth.init();if(!await allowed())return;
   poolId=sessionStorage.getItem('nsk2_pool_id');if(!poolId)return;
   const pool=await window.DB.getPool(poolId);if(!pool||pool.active===false)return;
   input.value=pool.teams||1;editor.hidden=false;
  }catch(error){message.textContent=error.message||'Kunde inte läsa poolspel';}
 }
 save.addEventListener('click',async()=>{
  const teams=Number(input.value);
  if(!Number.isInteger(teams)||teams<1||teams>20){message.textContent='Ange 1–20 lag';return;}
  save.disabled=true;message.textContent='Sparar…';
  try{
   if(!await allowed()||poolId!==sessionStorage.getItem('nsk2_pool_id'))throw Error('Välj poolspel och kontrollera din personliga behörighet.');
   await window.DB.updatePoolTeams(poolId,teams);(window.NSKNavigate?window.NSKNavigate(location.href,{reload:true,replace:true}):location.reload());
  }catch(error){message.textContent=error.message||'Kunde inte spara';}
  finally{save.disabled=false;}
 });
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
 window.addEventListener('focus',refresh);
})();
