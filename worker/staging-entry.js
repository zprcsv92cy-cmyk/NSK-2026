import { usersPage } from './users-page.js';
import { rosterAccessPage } from './roster-access-page.js';
import { loginPage } from './login-page.js';
import { bootstrapTestAccount } from './staging-bootstrap.js';
import { bootstrapPage } from './bootstrap-page.js';
import { activationPage } from './activation-page.js';
import { handleTeamAuth } from './team-auth.js';
import { handleActivation } from './account-activation.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/skapa-testkod/' || url.pathname === '/skapa-testkod') return new Response(bootstrapPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
    if (url.pathname === '/api/auth/staging/bootstrap-test') return bootstrapTestAccount(request, env);
    if (url.pathname === '/aktivera/' || url.pathname === '/aktivera') {
      return new Response(activationPage, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
    }
    if (url.pathname === '/logga-in/' || url.pathname === '/logga-in') {
      return new Response(loginPage, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
    }
    if (['/truppen-test/','/truppen-test','/truppen/','/truppen'].includes(url.pathname)) return new Response(rosterAccessPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
    if (url.pathname === '/anvandare/' || url.pathname === '/anvandare') return new Response(usersPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
    if (!url.pathname.startsWith('/api/auth/')) {
      return new Response(JSON.stringify({ error: 'Okänd adress' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }
    if (url.pathname === '/api/auth/activate') {
      try {
        return await handleActivation(request, env);
      } catch (error) {
        console.error('Activation failure:', error);
        return new Response(JSON.stringify({ error: 'Internt serverfel vid aktivering' }), { status: 500, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      }
    }
    return handleTeamAuth(request, env);
  }
};
