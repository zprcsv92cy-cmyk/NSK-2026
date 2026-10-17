// Production auth boundary; deny all staging/test endpoints.
// This is a candidate module, not part of the deployed nsk-api.
import { handleTeamAuth } from './team-auth.js';
import { handleActivation } from './account-activation.js';
import { productionRateLimitedLogin } from './production-login-guard.js';
import { handlePersonalTeamList } from './production-personal-teams.js';
import { authorizeTeamFeature } from './team-authorization-policy.js';
import { handleProductionOwnerAdministration } from './production-owner-administration.js';

const ORIGIN='https://zprcsv92cy-cmyk.github.io';
const METHODS=Object.freeze({
  '/api/auth/login':'POST',
  '/api/auth/me':'GET',
  '/api/auth/logout':'POST',
  '/api/auth/feature-access':'GET',
  '/api/auth/integration/access':'GET',
  '/api/auth/activate':'POST',
  '/api/auth/users':'GET,POST',
  '/api/auth/team-members':'GET'
});
function deny(status, error) {
  return Response.json({ok:false,error},{status,headers:{'cache-control':'no-store'}});
}
export async function handleProductionAuth(request, env) {
  const origin=request.headers.get('Origin');
  if(origin && origin!==ORIGIN) return deny(403,'Origin not allowed');
  const pathname=new URL(request.url).pathname;
  if(!Object.prototype.hasOwnProperty.call(METHODS,pathname))
    return deny(404,'Not found');
  if(request.method==='OPTIONS'){
    if(origin!==ORIGIN) return deny(403,'Origin not allowed');
    return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin':ORIGIN,
      'Access-Control-Allow-Methods':METHODS[pathname]+',OPTIONS',
      'Access-Control-Allow-Headers':'Authorization,Content-Type',
      'Access-Control-Max-Age':'600','Vary':'Origin'
    }});
  }
  if(!METHODS[pathname].split(',').includes(request.method))return deny(405,'Method not allowed');
  if(!env?.AUTH_DB)return deny(503,'Production authentication is not configured');
  let result;
  try {
    result=(pathname==='/api/auth/users'||pathname==='/api/auth/team-members')
      ? await handleProductionOwnerAdministration(request,env)
      : pathname==='/api/auth/activate'
      ? await handleActivation(request,env)
      : pathname==='/api/auth/login'
        ? await productionRateLimitedLogin(request,env,handleTeamAuth)
        : await handleTeamAuth(request,env);
  } catch {
    return deny(503,'Authentication is temporarily unavailable');
  }
  // Global owners still need the same server-verified team scoping as all
  // other users. Never grant a feature for an arbitrary query team_id.
  if((pathname==='/api/auth/feature-access'||pathname==='/api/auth/integration/access') && (result.ok||result.status===403)){
    const raw=await result.json();
      const me=await handleTeamAuth(new Request(new URL('/api/auth/me',request.url),{
        headers:{Authorization:request.headers.get('Authorization')||''}
      }),env);
      if(!me.ok)return deny(401,'Inloggningen kunde inte verifieras');
      const identity=await me.json();
      if(identity?.memberships?.some(m=>m.team_id==='*'&&m.role==='owner')){
        const teamResponse=await handlePersonalTeamList(new Request(
          new URL('/api/personal/lag',request.url),{
            headers:{Authorization:request.headers.get('Authorization')||''}
          }),env);
        if(!teamResponse.ok)return deny(503,'Lag kunde inte verifieras');
        const all=await teamResponse.json();
        const teamId=new URL(request.url).searchParams.get('team_id');
        const feature=new URL(request.url).searchParams.get('feature');
        const verified=(all.results||[]).filter(t=>t.Namn===teamId);
        if(verified.length===1){
          const access=authorizeTeamFeature(identity,teamId,feature);
          result=Response.json({team_id:teamId,feature,allowed:access.allowed,
            permission:access.permission,role:'owner'},{status:access.status===400?400:200});
        }else{
          result=Response.json({team_id:teamId,feature,allowed:false,role:null},{status:200});
        }
      }else{
        result=Response.json(raw,{status:200});
      }
  }
  if(pathname==='/api/auth/me' && result.ok){
    const identity=await result.json();
    if(identity?.memberships?.some(m=>m.team_id==='*'&&m.role==='owner')){
      const teamRequest=new Request(new URL('/api/personal/lag',request.url),{
        method:'GET',headers:{Authorization:request.headers.get('Authorization')||''}
      });
      const teamsResponse=await handlePersonalTeamList(teamRequest,env);
      if(!teamsResponse.ok)return deny(503,'Huvudadministratörens lag kunde inte verifieras');
      const data=await teamsResponse.json();
      const names=(data.results||[]).map(t=>t.Namn);
      if(!names.length||new Set(names).size!==names.length)
        return deny(503,'Lagmappning är ogiltig');
      identity.memberships=names.map(team_id=>({team_id,role:'owner'}));
      result=Response.json(identity,{status:200});
    }
  }
  const headers=new Headers(result.headers);
  headers.set('Vary','Origin');
  headers.set('cache-control','no-store');
  headers.delete('Access-Control-Allow-Origin');
  if(origin===ORIGIN)headers.set('Access-Control-Allow-Origin',ORIGIN);
  return new Response(result.body,{status:result.status,headers});
}
