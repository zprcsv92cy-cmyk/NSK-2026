// Add the schedule editor while retaining all production wrappers and bindings.
export function patchScheduleEditorWorker(source,modules,editor){
 const classic=s=>s.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').trim();
 const once=(before,after)=>{if(source.split(before).length!==2)throw Error('Unexpected live Worker source: '+before.slice(0,70));source=source.replace(before,after);};
 for(const [oldModule,newModule] of modules)once(classic(oldModule),classic(newModule));
 const marker='      if (request.method === "GET" && url.searchParams.get("action") === "svenskalag-saved") {';
 once(marker,`      if (request.method === "POST" && url.searchParams.get("action") === "calendar-pool-schedule") {
        if (!authorizeTeamFeature(access,team[0],"pool").allowed) return fail(403,"Pool edit permission required");
        if (!(await listTeams()).some(t=>String(t.id)===team[0]&&t.Namn==='NSK Team 18'&&String(t['Säsong'])==='2026')) return fail(403,"Wrong team");
        return editCalendarPoolSchedule(db,request);
      }
`+marker);
 once(".filter(item=>item.type!=='pool-state'&&!item.calendarPermanent&&(!item.calendarHidden||url.searchParams.get('include_removed')==='1'&&item.type==='pool'))",".filter(item=>item.type!=='pool-state'&&!item.calendarPermanent&&!item.calendarSuppressed&&(!item.calendarHidden||url.searchParams.get('include_removed')==='1'&&item.type==='pool'))");
 return source+'\n'+classic(editor)+'\n';
}
