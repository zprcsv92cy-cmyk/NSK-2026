import { browserModuleText } from './legacy-db-guard-source.js';
import { integrationStatusPage } from './integration-status-page.js';
import { legacyDbGuardTestPage } from './legacy-db-guard-test-page.js';
import { existingTruppenLayoutPage } from './existing-truppen-layout-page.js';
import { legacyTruppenTestPage } from './legacy-truppen-test-page.js';
import { usersPage } from './users-page.js';
import { rosterAccessPage } from './roster-access-page.js';
import { lineupAccessPage } from './lineup-access-page.js';
import { loginPage } from './login-page.js';
import { bootstrapTestAccount } from './staging-bootstrap.js';
import { bootstrapPage } from './bootstrap-page.js';
import { activationPage } from './activation-page.js';
import { handleTeamAuth } from './team-auth.js';
import { handleActivation } from './account-activation.js';
import { createStagingAuthHandler } from './staging-auth-dispatch.js';

const handleAuthRequest = createStagingAuthHandler({ handleTeamAuth, handleActivation, bootstrapTestAccount });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Browser login on the existing GitHub Pages app requires CORS preflight.
    // Allow only the NSK site; never reflect arbitrary Origin values.
    const origin = request.headers.get('Origin');
    const allowedOrigin = origin === 'https://zprcsv92cy-cmyk.github.io' ? origin : null;
    if (url.pathname.startsWith('/api/auth/') && request.method === 'OPTIONS') {
      if (!allowedOrigin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin'
      } });
    }
    // All authenticated API responses must carry the same restricted CORS policy.
    if (url.pathname.startsWith('/api/auth/') && allowedOrigin) {
      const response = await handleAuthRequest(request, env);
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', allowedOrigin);
      headers.set('Vary', 'Origin');
      headers.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers });
    }
    if (url.pathname === '/integrationsstatus/' || url.pathname === '/integrationsstatus') return new Response(integrationStatusPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
    if (url.pathname === '/staging/legacy-db-auth-guard.js') return new Response(browserModuleText,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
    if (url.pathname === '/datalager-behorighet/' || url.pathname === '/datalager-behorighet') return new Response(legacyDbGuardTestPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
    if (url.pathname === '/skapa-testkod/' || url.pathname === '/skapa-testkod') return new Response(bootstrapPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
    if (url.pathname === '/api/auth/staging/bootstrap-test') return bootstrapTestAccount(request, env);
    if (url.pathname === '/aktivera/' || url.pathname === '/aktivera') {
      return new Response(activationPage, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
    }
    if (url.pathname === '/logga-in/' || url.pathname === '/logga-in') {
      return new Response(loginPage, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
    }
    if (['/truppen-test/','/truppen-test','/truppen/','/truppen'].includes(url.pathname)) return new Response(rosterAccessPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
    if (['/truppen-befintlig/','/truppen-befintlig'].includes(url.pathname)) return new Response(existingTruppenLayoutPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
    if (['/truppen-integration/','/truppen-integration'].includes(url.pathname)) return new Response(legacyTruppenTestPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
    if (url.pathname === '/laguppstallning/' || url.pathname === '/laguppstallning') return new Response(lineupAccessPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
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
    return handleAuthRequest(request, env);
  }
};
