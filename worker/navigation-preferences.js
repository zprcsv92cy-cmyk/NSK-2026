// Personal presentation settings. Identity always comes from the verified session.
export const DEFAULT_SHORTCUTS = Object.freeze(['startsida','truppen','traningsgrupper']);
export const MENU_PAGES = Object.freeze(['startsida','truppen','traningsgrupper','ovningsarkiv','ritverktyg','malvaktsstatistik','materialforvaltare','mittkonto']);
export function menuChoices(actor) {
 return [...MENU_PAGES,...(actor?.permissions?.includes('users:manage')?['anvandare']:[])];
}
export function effectiveShortcuts(value,allowed) {
 const selected=[];
 for(const slug of [...(Array.isArray(value)?value:[]),...DEFAULT_SHORTCUTS,...allowed])
  if(allowed.includes(slug)&&!selected.includes(slug)&&selected.length<3)selected.push(slug);
 return selected;
}
export async function handleNavigationPreferences(request,db,actor,json) {
 if(!actor)return json({error:'Inte inloggad'},401);
 if(!actor.memberships?.some(m=>m.team_id==='NSK Team 18')||!actor.permissions?.includes('read'))
  return json({error:'Åtkomst nekad'},403);
 const allowed=menuChoices(actor);
 if(request.method==='GET'){
  const row=await db.prepare('SELECT shortcuts_json,revision FROM auth_navigation_preferences WHERE user_id=?').bind(actor.user.id).first();
  let saved;try{saved=JSON.parse(row?.shortcuts_json||'null');}catch{saved=null;}
  return json({shortcuts:effectiveShortcuts(saved,allowed),revision:row?.revision||0});
 }
 if(request.method!=='PUT')return json({error:'Otillåten metod'},405);
 let body;try{body=await request.json();}catch{return json({error:'Ogiltig JSON'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['shortcuts','revision'].includes(k))||
 !Array.isArray(body.shortcuts)||body.shortcuts.length!==3||new Set(body.shortcuts).size!==3||
 body.shortcuts.some(s=>!allowed.includes(s))||!Number.isSafeInteger(body.revision)||body.revision<0)
  return json({error:'Välj tre olika tillgängliga sidor.'},400);
 const {shortcuts,revision}=body;
 const statement=revision===0?
 db.prepare('INSERT OR IGNORE INTO auth_navigation_preferences(user_id,shortcuts_json,revision) VALUES(?,?,1)').bind(actor.user.id,JSON.stringify(shortcuts)):
 db.prepare("UPDATE auth_navigation_preferences SET shortcuts_json=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND revision=?").bind(JSON.stringify(shortcuts),actor.user.id,revision);
 const result=await statement.run();
 if(!result.meta?.changes)return json({error:'Menyn har ändrats på en annan enhet. Ladda om inställningarna.'},409);
 return json({ok:true,shortcuts,revision:revision+1});
}
