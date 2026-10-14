// Staging-only, authenticated, read-only check of existing NSK Team 18 roster IDs.
// No legacy admin token, writes, names or personal data returned to the browser.
export async function existingRosterReadCheck(request, actor, json) {
 if(request.method!=='GET')return json({error:'Endast läsning'},405);
 if(!actor)return json({error:'Inte inloggad'},401);
 const team='NSK Team 18';
 if(!actor.memberships.some(m=>m.team_id===team))return json({error:'Saknar åtkomst till NSK Team 18'},403);
 const base='https://nsk-api.peter-hasselberg.workers.dev';
 async function read(table){
  const result=[];let page=1;
  do{
   const response=await fetch(base+'/api/'+table+'?page='+page+'&size=200',{method:'GET',cache:'no-store'});
   if(!response.ok)throw Error('Läsning misslyckades: '+table);
   const data=await response.json();
   if(!data.ok||!Array.isArray(data.results))throw Error('Ogiltigt svar: '+table);
   result.push(...data.results);
   if(!data.next)return result;
   page++;
  }while(page<=25);
  throw Error('För många sidor');
 }
 const ids=x=>Array.isArray(x)?x.map(v=>Number(typeof v==='object'?v.id:v)).filter(Number.isSafeInteger):[];
 try{
  const teams=await read('lag');
  const teamRow=teams.find(t=>t.Namn===team&&String(t['Säsong'])==='2026');
  if(!teamRow)return json({error:'Laget hittades inte i befintlig datakälla'},404);
  const [players,coaches]=await Promise.all([read('spelare'),read('tranare')]);
  const p=players.filter(x=>ids(x.Lag).includes(teamRow.id));
  const c=coaches.filter(x=>ids(x.Lag).includes(teamRow.id));
  const valid=rows=>rows.every(x=>Number.isSafeInteger(Number(x.id))&&Number(x.id)>0);
  return json({ok:valid(p)&&valid(c),team_id:team,season:'2026',read_only:true,source:'existing_nsk_api',player_count:p.length,coach_count:c.length,numeric_ids_valid:valid(p)&&valid(c),names_returned:false});
 }catch(error){return json({error:'Kunde inte läsa befintlig datakälla'},502)}
}
