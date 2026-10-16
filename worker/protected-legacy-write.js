// Isolated migration gateway; not mounted in production or staging.
// Authentication and team lookup must be supplied by trusted server functions.
// A denied request never reaches the legacy write handler.
import {authorizeResolvedLegacyOperation} from './legacy-write-authorization.js';

const deny=(status,error)=>new Response(JSON.stringify({ok:false,error}),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
export async function protectedLegacyWrite(request,{authenticate,resolveTeamId,handleWrite}={}){
 if(!(request instanceof Request))return deny(400,'Ogiltig begäran');
 const path=new URL(request.url).pathname;
 if(typeof authenticate!=='function'||typeof resolveTeamId!=='function'||typeof handleWrite!=='function')
  return deny(503,'Säkerhetskopplingen är inte färdig');
 let actor;
 try{actor=await authenticate(request);}catch{return deny(503,'Autentisering kunde inte kontrolleras');}
 if(!actor)return deny(401,'Inte inloggad');
 let operation;
 if(/^\/api\/poolspel\/\d+\/aktiv$/.test(path)){
  let body;
  try{body=await request.clone().json();}catch{return deny(400,'Ogiltig JSON');}
  if(typeof body?.active!=='boolean')return deny(400,'Ogiltig poolstatus');
  operation=body.active?'reopen':'finish';
 }
 const decision=await authorizeResolvedLegacyOperation(actor,request.method,path,
  ()=>resolveTeamId(request,actor),operation);
 if(!decision.allowed)return deny(decision.status,decision.reason);
 return handleWrite(request,actor);
}
