import {withPagesOrigin} from './pages-migration.js';
import { handleTeamAuth } from './team-auth.js';
import { handleActivation } from './account-activation.js';
import {handleAccountRecovery} from './account-recovery.js';

const allowed = new Map([['/api/auth/login','POST'],['/api/auth/logout','POST'],['/api/auth/me','GET'],['/api/auth/feature-access','GET'],['/api/auth/integration/access','GET'],['/api/auth/activate','POST'],['/api/auth/users','GET,POST'],['/api/auth/users/email-check','POST'],['/api/auth/team-members','GET,PUT,DELETE'],['/api/auth/account-options','GET'],['/api/auth/forgot-password','POST'],['/api/auth/reset-password','POST'],['/api/auth/change-password','POST']]);
const productionAuth = {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const userRecord = /^\/api\/auth\/users\/[a-f0-9-]{36}$/.test(path);
    const userAction = /^\/api\/auth\/users\/[a-f0-9-]{36}\/(?:permissions|setup-token|password-token|send-link|status)$/.test(path);
    const actionMethod = path.endsWith('/permissions') ? 'PUT' : (path.endsWith('/status') ? 'PATCH' : 'POST');
    const methods = allowed.get(path) || (userRecord ? 'PATCH,DELETE' : (userAction ? actionMethod : null));
    if (!methods) return new Response('Not found', {status:404});
    const origin = request.headers.get('Origin');
    const site = 'https://zprcsv92cy-cmyk.github.io';
    if (origin && origin !== site) return new Response('Forbidden', {status:403});
    const headers = new Headers({'Cache-Control':'no-store', 'Vary':'Origin'});
    if (origin === site) headers.set('Access-Control-Allow-Origin', site);
    if (request.method === 'OPTIONS') {
      if (origin !== site) return new Response(null, {status:403});
      headers.set('Access-Control-Allow-Methods', methods + ', OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return new Response(null, {status:204, headers});
    }
    if (!methods.split(',').includes(request.method)) return new Response('Method not allowed', {status:405, headers});
    if(Number(request.headers.get('Content-Length')||0)>8192)return new Response('Request too large',{status:413,headers});
    if(request.body&&['POST','PUT','PATCH','DELETE'].includes(request.method)){
      const reader=request.body.getReader(),chunks=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return new Response('Request too large',{status:413,headers});}chunks.push(value);}
      const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
      request=new Request(request.url,{method:request.method,headers:request.headers,body});
    }
    let result;
    try { result = await (path === '/api/auth/activate' ? handleActivation(request, env) : ['/api/auth/account-options','/api/auth/forgot-password','/api/auth/reset-password'].includes(path) ? handleAccountRecovery(request,env) : handleTeamAuth(request, env)); }
    catch { return new Response('Service unavailable', {status:503, headers}); }
    const output = new Headers(result.headers);
    output.delete('Access-Control-Allow-Origin');
    for (const [key, value] of headers) output.set(key, value);
    output.set('X-Content-Type-Options', 'nosniff');
    return new Response(result.body, {status:result.status, headers:output});
  }
};

export default {fetch:withPagesOrigin(productionAuth.fetch)};
