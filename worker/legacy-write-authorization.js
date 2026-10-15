// Explicit migration map for legacy NSK write routes. This is not mounted in production.
// Every future protected write must resolve its team on the server, never trust a browser team_id.
import {authorizeTeamFeature} from './team-authorization-policy.js';

const ROUTES=[
  [/^\/api\/(spelare|tranare)(?:\/\d+)?$/, 'roster'],
  [/^\/api\/lagpersonal$/, 'roster'],
  [/^\/api\/poolspel(?:\/\d+)?$/, 'pool'],
  [/^\/api\/poolspel\/\d+\/aktiv$/, 'pool_finish'],
  [/^\/api\/matchkonfiguration(?:\/\d+)?$/, 'matches'],
  [/^\/api\/laguppstallningar\/\d+$/, 'lineup'],
  [/^\/api\/coach-selection$/, 'lineup'],
  [/^\/api\/bytesschema\/save$/, 'shifts'],
  [/^\/api\/bytesschema\/\d+\/done$/, 'shifts']
];
// Match the method too: unknown combinations must fail closed.
export function legacyWriteOperation(method,pathname,operation){
  const verb=String(method||'').toUpperCase();
  const feature=legacyWriteFeature(pathname);
  if(!feature)return null;
  if(verb==='GET'||verb==='HEAD'||verb==='OPTIONS')return null;
  if(/^\/api\/poolspel\/\d+\/aktiv$/.test(pathname))return verb==='PATCH' && (operation==='finish'||operation==='reopen') ? (operation==='reopen'?'pool_reopen':'pool_finish') : null;
  if(/^\/api\/bytesschema\/\d+\/done$/.test(pathname))return verb==='PATCH'?feature:null;
  if(/^\/api\/bytesschema\/save$/.test(pathname))return verb==='POST'?feature:null;
  if(/^\/api\/laguppstallningar\/\d+$/.test(pathname))return verb==='POST'?feature:null;
  if(/^\/api\/coach-selection$/.test(pathname))return verb==='POST'?feature:null;
  if(verb==='POST'&&!/\/\d+$/.test(pathname))return feature;
  if(verb==='PATCH'&&/\/\d+$/.test(pathname))return feature;
  if(pathname==='/api/lagpersonal'&&verb==='PATCH')return feature;
  return null;
}
export function authorizeLegacyOperation(actor,serverResolvedTeamId,method,pathname,operation){
 const feature=legacyWriteOperation(method,pathname,operation);
 if(!feature)return {allowed:false,status:405,reason:'Skrivmetoden stöds inte'};
 return authorizeTeamFeature(actor,serverResolvedTeamId,feature);
}
export function legacyWriteFeature(pathname){
  if(typeof pathname!=='string')return null;
  return ROUTES.find(([pattern])=>pattern.test(pathname))?.[1]??null;
}
export function authorizeLegacyWrite(actor,serverResolvedTeamId,pathname){
  const feature=legacyWriteFeature(pathname);
  if(!feature)return {allowed:false,status:404,reason:'Okänd skrivfunktion'};
  return authorizeTeamFeature(actor,serverResolvedTeamId,feature);
}

// Migration boundary: team identity must come from a trusted server resolver.
// Never authorize from request query parameters or JSON body.
export async function authorizeResolvedLegacyOperation(actor,method,pathname,resolveTeamId,operation){
 const feature=legacyWriteOperation(method,pathname,operation);
 if(!feature)return {allowed:false,status:405,reason:'Skrivmetoden stöds inte'};
 if(typeof resolveTeamId!=='function')return {allowed:false,status:503,reason:'Lagkoppling saknas på servern'};
 let teamId;
 try{teamId=await resolveTeamId();}
 catch{return {allowed:false,status:503,reason:'Kunde inte fastställa lag på servern'};}
 if(typeof teamId!=='string'||!teamId.trim())return {allowed:false,status:503,reason:'Lag kunde inte fastställas'};
 return authorizeTeamFeature(actor,teamId,feature);
}
