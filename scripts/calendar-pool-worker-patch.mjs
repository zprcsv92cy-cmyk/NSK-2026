// Apply only this reviewed change to the deployed bundle, retaining other live wrappers.
export function patchCalendarPoolWorker(source,helper){
 const once=(before,after)=>{if(source.split(before).length!==2)throw Error('Unexpected live Worker source: '+before.slice(0,70));source=source.replace(before,after);};
 const marker='      if (request.method === "GET" && url.searchParams.get("action") === "svenskalag-saved") {';
 once(marker,`      if (request.method === "POST" && url.searchParams.get("action") === "calendar-pool-visibility") {
        if (!authorizeTeamFeature(access, team[0], "pool").allowed) return fail(403, "Pool edit permission required");
        if (!(await listTeams()).some(t=>String(t.id)===team[0]&&t.Namn==='NSK Team 18'&&String(t['Säsong'])==='2026')) return fail(403, "Wrong team");
        return changeCalendarPoolVisibility(db,request);
      }
`+marker);
 once('...JSON.parse(r.event_json) }))','...JSON.parse(r.event_json) })).filter(item=>!item.calendarHidden)');
 once('previous.manuallyEdited === true','(previous.manuallyEdited === true || previous.manuallyEdited === 1)');
 if(source.includes('function changeCalendarPoolVisibility('))throw Error('Helper already exists');
 return source+'\n'+helper.replace('export async function','async function');
}
