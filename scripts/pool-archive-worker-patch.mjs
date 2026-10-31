// Preserve the deployed Worker and all wrappers; reject unexpected source before upload.
export function patchPoolArchiveWorker(source,oldHelper,newHelper){
 const once=(before,after)=>{if(source.split(before).length!==2)throw Error('Unexpected live Worker source: '+before.slice(0,60));source=source.replace(before,after);};
 const marker='      if (request.method === "GET" && url.searchParams.get("action") === "svenskalag-saved") {';
 once(marker,`      if (["GET","POST"].includes(request.method) && url.searchParams.get("action") === "pool-removal-state") {
        if (request.method === "POST" && !authorizeTeamFeature(access,team[0],"pool").allowed) return fail(403,"Pool edit permission required");
        if (!(await listTeams()).some(t=>String(t.id)===team[0]&&t.Namn==='NSK Team 18'&&String(t['Säsong'])==='2026')) return fail(403,"Wrong team");
        return savedPoolRemovalState(db,request);
      }
`+marker);
 once("(event_type='training' AND ?=1)) ORDER","(event_type='training' AND ?=1) OR json_extract(event_json,'$.calendarHidden')=1) ORDER");
 once('.filter(item=>!item.calendarHidden)',".filter(item=>item.type!=='pool-state'&&!item.calendarPermanent&&(!item.calendarHidden||url.searchParams.get('include_removed')==='1'&&item.type==='pool'))");
 once(oldHelper.replaceAll('export async function','async function').trim(),newHelper.replaceAll('export async function','async function').trim());
 return source;
}
