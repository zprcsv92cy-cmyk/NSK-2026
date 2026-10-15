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
export function legacyWriteFeature(pathname){
  if(typeof pathname!=='string')return null;
  return ROUTES.find(([pattern])=>pattern.test(pathname))?.[1]??null;
}
export function authorizeLegacyWrite(actor,serverResolvedTeamId,pathname){
  const feature=legacyWriteFeature(pathname);
  if(!feature)return {allowed:false,status:404,reason:'Okänd skrivfunktion'};
  return authorizeTeamFeature(actor,serverResolvedTeamId,feature);
}
