import { handleStagingRosterRoute } from './staging-roster-route.js';

/**
 * Staging-only API adapter. Call from the deployed Worker fetch handler,
 * passing its existing handleTeamAuth as fallback.
 * Keep the production Worker completely separate.
 */
export async function dispatchStagingAuth(request, env, handleTeamAuth) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/auth/')) return new Response(null, { status: 404 });
  const origin = request.headers.get('Origin');
  const allowed = origin === 'https://zprcsv92cy-cmyk.github.io';
  const headers = {
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
    ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {})
  };
  if (request.method === 'OPTIONS') {
    if (!allowed) return new Response(null, { status: 403, headers });
    return new Response(null, { status: 204, headers: {
      ...headers,
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600'
    } });
  }
  const isRoster = path === '/api/auth/roster-staging' ||
    path.startsWith('/api/auth/roster-staging/');
  if (!isRoster && typeof handleTeamAuth !== 'function') {
    return new Response(JSON.stringify({ error: 'Autentisering saknas' }), {
      status: 503, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  let response;
  try {
    response = isRoster
      ? await handleStagingRosterRoute(request, env)
      : await handleTeamAuth(request, env);
  } catch {
    response = new Response(JSON.stringify({ error: 'Stagingtjänsten är tillfälligt otillgänglig' }), {
      status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  const responseHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(headers)) responseHeaders.set(key, value);
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}
