// Migration candidate for nsk-api, NOT deployed.
// Keep all legacy routes intact. Personal routes require isolated AUTH_DB D1.
import legacyWorker, { ShiftLock } from '../reference/legacy-nsk-api-worker-v42.snapshot.js';
import { handlePersonalRosterRead } from './production-personal-roster-endpoint.js';
import { handlePersonalRosterMutation } from './production-personal-roster-mutation.js';
import { handlePersonalStaffMutation } from './production-personal-staff-mutation.js';
import { handlePersonalTeamList } from './production-personal-teams.js';
import { handleProductionAuth } from './production-auth-boundary.js';

const PERSONAL_PREFIX = '/api/personal/';
export { ShiftLock };
export default {
  async fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/auth/')) {
      return handleProductionAuth(request, env);
    }
    if (pathname.startsWith(PERSONAL_PREFIX)) {
      const origin=request.headers.get('Origin');
      if(origin && origin!=='https://zprcsv92cy-cmyk.github.io')
        return Response.json({ok:false,error:'Origin not allowed'},{status:403});
      if(pathname==='/api/personal/lag' && request.method==='GET'){
        const response=await handlePersonalTeamList(request,env);
        const headers=new Headers(response.headers);
        headers.set('Vary','Origin');
        if(origin==='https://zprcsv92cy-cmyk.github.io')headers.set('Access-Control-Allow-Origin',origin);
        return new Response(response.body,{status:response.status,headers});
      }
      const mutation=/^\/api\/personal\/(spelare|tranare)(?:\/\d+)?$/.test(pathname);
      const staffMutation=pathname==='/api/personal/lagpersonal';
      if(request.method==='OPTIONS' && (mutation || staffMutation) && origin==='https://zprcsv92cy-cmyk.github.io')
        return new Response(null,{status:204,headers:{
          'Access-Control-Allow-Origin':origin,
          'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers':'Authorization,Content-Type',
          'Vary':'Origin'
        }});
      if(mutation && ['POST','PATCH','DELETE'].includes(request.method)){
        const response=await handlePersonalRosterMutation(request,env);
        const headers=new Headers(response.headers);
        headers.set('Vary','Origin');
        if(origin==='https://zprcsv92cy-cmyk.github.io')
          headers.set('Access-Control-Allow-Origin',origin);
        return new Response(response.body,{status:response.status,headers});
      }
      if(staffMutation && ['POST','PATCH'].includes(request.method)){
        const response=await handlePersonalStaffMutation(request,env);
        const headers=new Headers(response.headers);
        headers.set('Vary','Origin');
        if(origin==='https://zprcsv92cy-cmyk.github.io')headers.set('Access-Control-Allow-Origin',origin);
        return new Response(response.body,{status:response.status,headers});
      }
      return handlePersonalRosterRead(request, env);
    }
    // The historical API has no per-person, per-team authorization. Never expose
    // its routes from a production candidate with personal authentication enabled.
    // Re-enable each route only after it has a server-enforced authorization guard.
    if (pathname.startsWith('/api/')) {
      return Response.json({ ok: false, error: 'Legacy API route not migrated' }, {
        status: 503,
        headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
      });
    }
    return legacyWorker.fetch(request, env, context);
  }
};
