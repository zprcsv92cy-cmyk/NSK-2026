import { readPersonallyAuthorizedTeams } from './production-team-read.js';
import { authorizePersonalWorkerWrite } from './personal-roster-worker-adapter.js';
import { createProductionRosterReadHandler } from './production-roster-read-integration.js';
import { readPersonallyAuthorizedTeamCollection } from './production-team-collection-read.js';
import { handlePersonalLagpersonalWrite } from './production-lagpersonal-write-handler.js';
import { createPersonalRosterIdentityVerifier } from './personal-roster-identity-adapter.js';
import { createPoolOwnerResolver } from './production-shift-pool-owner-resolver.js';
import { authorizeTeamFeature } from './team-authorization-policy.js';
import { authorizePersonalPoolWrite } from './production-pool-write-authorization.js';
import { authorizePersonalMatchWrite } from './production-match-write-authorization.js';
import { authorizeCoachSelection } from './production-coach-selection-authorization.js';
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
var TABLES = { lag: 1255083, spelare: 1255098, tranare: 1255100, poolspel: 1255101, matcher: 1255109, laguppstallningar: 1255113, bytesschema: 1255115, malvaktsstatistik: 1255119, spelaretranare: 1255152, matchkonfiguration: 1255157 };
function resolveBaserowTables(env) {
  if (env?.NSK_ISOLATED_MODE === 'true' && (!env.BASEROW_TABLE_IDS || !env.BASEROW_TOKEN || !env.BASEROW_DATABASE_ID)) throw new Error('Invalid Baserow table mapping');
  if (env?.BASEROW_TABLE_IDS === undefined) return TABLES;
  let mapping;
  try { mapping = typeof env.BASEROW_TABLE_IDS === "string" ? JSON.parse(env.BASEROW_TABLE_IDS) : env.BASEROW_TABLE_IDS; }
  catch { throw new Error("Invalid Baserow table mapping"); }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw new Error("Invalid Baserow table mapping");
  const keys = Object.keys(TABLES);
  if (Object.keys(mapping).length !== keys.length || keys.some((key) => !Number.isSafeInteger(mapping[key]) || mapping[key] <= 0 || Object.values(TABLES).includes(mapping[key])) || new Set(Object.values(mapping)).size !== keys.length)
    throw new Error("Invalid Baserow table mapping");
  return mapping;
}
var ORIGIN = "https://zprcsv92cy-cmyk.github.io";
var encoder = new TextEncoder();
function hex(bytes) {
  return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(hex, "hex");
async function sha(s) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
}
__name(sha, "sha");
function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { ...headers, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
__name(json, "json");
function tokenFrom(req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get("Authorization") || "");
  return m?.[1] || null;
}
__name(tokenFrom, "tokenFrom");
async function session(req, env) {
  const t = tokenFrom(req);
  if (!t) return null;
  const id = await sha(t);
  return await env.ADMIN_KV.get("session:" + id);
}
__name(session, "session");
var ShiftLock = class {
  static {
    __name(this, "ShiftLock");
  }
  constructor(ctx, env) {
    this.env = env;
    this.queue = Promise.resolve();
  }
  async fetch(request) {
    if (request.method !== "POST") return json({ ok: false, error: "Metoden till\xE5ts inte" }, 405);
    const operation = /* @__PURE__ */ __name(async () => {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Ogiltig JSON" }, 400);
      }
      if (body?.action === "save") return this.save(body);
      if (body?.action === "done") return this.done(body);
      return json({ ok: false, error: "Ogiltig \xE5tg\xE4rd" }, 400);
    }, "operation");
    const result = this.queue.then(operation);
    this.queue = result.then(() => void 0, () => void 0);
    return result;
  }
  async save(body) {
    const reply = json;
    let TABLES;
    try { TABLES = resolveBaserowTables(this.env); } catch { return reply({ ok: false, error: "Invalid Baserow table mapping" }, 503); }
    const pos = /* @__PURE__ */ __name((n) => Number.isSafeInteger(n) && n > 0, "pos");
    const { pool_id: poolId, lag_no: lagNo, match_no: matchNo, shifts } = body || {};
    if (!pos(poolId) || !pos(lagNo) || !pos(matchNo) || !Array.isArray(shifts) || shifts.length > 200)
      return reply({ ok: false, error: "Ogiltigt bytesschema" }, 400);
    if (shifts.some((s) => !s || !pos(s.period_no) || typeof s.time_left !== "string" || !/^\d{2,3}:\d{2}$/.test(s.time_left) || !Array.isArray(s.players) || s.players.length > 25 || s.players.some((x) => !pos(x)) || new Set(s.players).size !== s.players.length))
      return reply({ ok: false, error: "Ogiltiga byten" }, 400);
    const auth = { Authorization: `Token ${this.env.BASEROW_TOKEN}` };
    const base = "https://api.baserow.io/api/database/rows/table/";
    const ids = /* @__PURE__ */ __name((v) => Array.isArray(v) ? v.map((x) => Number(typeof x === "object" ? x.id : x)) : [], "ids");
    try {
      const pr = await fetch(`${base}${TABLES.poolspel}/${poolId}/?user_field_names=true`, { headers: auth });
      if (!pr.ok) return reply({ ok: false, error: "Poolspel kunde inte l\xE4sas" }, 502);
      const pool = await pr.json();
      const owner = await createPoolOwnerResolver(this.env)({ poolId, lagNo });
      const team = { id: Number(owner.baserowTeamRowId) };
      if (!ids(pool.Lag).includes(team.id)) return reply({ ok: false, error: "Fel poolspel" }, 403);
      if (lagNo > Number(pool["Antal lag"]) || matchNo > Number(pool["Antal matcher"]) || shifts.some((s) => s.period_no > Number(pool.Perioder)))
        return reply({ ok: false, error: "Lag, match eller period utanf\xF6r poolspelet" }, 400);
      let valid = /* @__PURE__ */ new Set(), page = 1;
      while (page <= 100) {
        const r = await fetch(`${base}${TABLES.spelare}/?user_field_names=true&page=${page}&size=200`, { headers: auth });
        if (!r.ok) throw new Error("Spelare kunde inte kontrolleras");
        const d = await r.json();
        for (const x of d.results || []) if (ids(x.Lag).includes(Number(team.id))) valid.add(Number(x.id));
        if (!d.next) break;
        page++;
      }
      if (page > 100) throw new Error("F\xF6r m\xE5nga spelare");
      if (shifts.some((s) => s.players.some((x) => !valid.has(x)))) return reply({ ok: false, error: "Spelare tillh\xF6r inte laget" }, 403);
      const getOld = /* @__PURE__ */ __name(async () => {
        const found = [];
        let p = 1;
        while (p <= 100) {
          const r = await fetch(`${base}${TABLES.bytesschema}/?user_field_names=true&page=${p}&size=200`, { headers: auth });
          if (!r.ok) throw new Error("Bytesschema kunde inte l\xE4sas");
          const d = await r.json();
          found.push(...(d.results || []).filter((x) => ids(x.Poolspel).includes(poolId) && Number(x.Lagnummer) === lagNo && Number(x.Matchnummer) === matchNo));
          if (!d.next) return found;
          p++;
        }
        throw new Error("F\xF6r m\xE5nga sidor i bytesschemat");
      }, "getOld");
      const old = await getOld();
      if (old.length > shifts.length) return reply({ ok: false, error: "Fler sparade byten \xE4n nya. Automatisk radering \xE4r sp\xE4rrad f\xF6r att skydda data.", saved: old.length, expected: shifts.length }, 409);
      const byNo = /* @__PURE__ */ new Map();
      for (const x of old) {
        const n = Number(x.Bytenummer);
        if (!pos(n) || n > shifts.length || byNo.has(n)) return reply({ ok: false, error: "Dubbletter eller ogiltiga byten finns. Ingen \xE4ndring gjordes.", shift_no: n }, 409);
        byNo.set(n, x);
      }
      const same = /* @__PURE__ */ __name((current, x) => current && Number(current.Periodnummer) === x.period_no && String(current["Tid kvar"]) === x.time_left && JSON.stringify(ids(current["Spelare p\xE5 plan"]).sort((a, b) => a - b)) === JSON.stringify([...x.players].sort((a, b) => a - b)), "same");
      if (old.some((x) => x["Genomf\xF6rt"] === true) && (old.length !== shifts.length || shifts.some((x, i) => !same(byNo.get(i + 1), x))))
        return reply({ ok: false, error: "Matchen har redan genomf\xF6rda byten. Schemat f\xE5r inte \xE4ndras.", saved: old.length }, 409);
      const writeHeaders = { ...auth, "Content-Type": "application/json" };
      for (let i = 0; i < shifts.length; i++) {
        const x = shifts[i], current = byNo.get(i + 1);
        if (same(current, x)) continue;
        const desired = { Poolspel: [poolId], Lagnummer: lagNo, Matchnummer: matchNo, Bytenummer: i + 1, Periodnummer: x.period_no, "Tid kvar": x.time_left, "Spelare p\xE5 plan": x.players };
        if (!current) desired["Genomf\xF6rt"] = false;
        const endpoint = current ? `${base}${TABLES.bytesschema}/${current.id}/?user_field_names=true` : `${base}${TABLES.bytesschema}/?user_field_names=true`;
        const r = await fetch(endpoint, { method: current ? "PATCH" : "POST", headers: writeHeaders, body: JSON.stringify(desired) });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          return reply({ ok: false, error: "Sparningen avbr\xF6ts utan att gamla byten raderades. Kontrollera felet f\xF6re nytt f\xF6rs\xF6k.", shift_no: i + 1, status: r.status, detail: d.detail || d.error || null }, 502);
        }
        return reply({ ok: true, cleanup_pending: true, progress: i + 1, expected: shifts.length });
      }
      const saved = await getOld();
      if (saved.length !== shifts.length) return reply({ ok: false, error: "Antalet sparade byten st\xE4mmer inte", expected: shifts.length, actual: saved.length }, 502);
      return reply({ ok: true, count: saved.length, verified: true });
    } catch (e) {
      return reply({ ok: false, error: e?.message || "Databasfel" }, 502);
    }
  }
  async done(body) {
    const reply = json;
    let TABLES;
    try { TABLES = resolveBaserowTables(this.env); } catch { return reply({ ok: false, error: "Invalid Baserow table mapping" }, 503); }
    const { id, pool_id: poolId, lag_no: lagNo, match_no: matchNo, done } = body;
    if (!Number.isSafeInteger(id) || id <= 0 || ![poolId, lagNo, matchNo].every((n) => Number.isSafeInteger(n) && n > 0) || typeof done !== "boolean")
      return reply({ ok: false, error: "Ogiltig beg\xE4ran" }, 400);
    const auth = { Authorization: `Token ${this.env.BASEROW_TOKEN}` };
    const base = "https://api.baserow.io/api/database/rows/table/";
    const ids = /* @__PURE__ */ __name((v) => Array.isArray(v) ? v.map((x) => Number(typeof x === "object" ? x.id : x)) : [], "ids");
    try {
      const r = await fetch(`${base}${TABLES.bytesschema}/${id}/?user_field_names=true`, { headers: auth });
      if (!r.ok) return reply({ ok: false, error: "Byte saknas" }, 404);
      const row = await r.json();
      if (!ids(row.Poolspel).includes(poolId) || Number(row.Lagnummer) !== lagNo || Number(row.Matchnummer) !== matchNo)
        return reply({ ok: false, error: "Bytet tillh\xF6r inte matchen" }, 409);
      const pr = await fetch(`${base}${TABLES.poolspel}/${poolId}/?user_field_names=true`, { headers: auth });
      if (!pr.ok) return reply({ ok: false, error: "Poolspel saknas" }, 403);
      const pool = await pr.json();      const owner = await createPoolOwnerResolver(this.env)({ shiftRowId: id });
      const team = { id: Number(owner.baserowTeamRowId) };
      if (owner.poolId !== poolId || !ids(pool.Lag).includes(team.id)) return reply({ ok: false, error: "Fel lag" }, 403);
      if (row["Genomf\xF6rt"] === done) return reply({ ok: true, row });
      const wr = await fetch(`${base}${TABLES.bytesschema}/${id}/?user_field_names=true`, { method: "PATCH", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ "Genomf\xF6rt": done }) });
      if (!wr.ok) return reply({ ok: false, error: "Kunde inte \xE4ndra byte" }, 502);
      return reply({ ok: true, row: await wr.json() });
    } catch (e) {
      return reply({ ok: false, error: e?.message || "Databasfel" }, 502);
    }
  }
};
async function listTrustedRosterTeams(env) {
  if (!env.BASEROW_TOKEN) throw new Error("Baserow credentials missing");
  const teamTableId = resolveBaserowTables(env).lag;
  const teams = [];
  for (let page = 1; page <= 100; page++) {
    const response = await fetch(
      `https://api.baserow.io/api/database/rows/table/${teamTableId}/?user_field_names=true&size=200&page=${page}`,
      { headers: { Authorization: `Token ${env.BASEROW_TOKEN}` } }
    );
    if (!response.ok) throw new Error("Trusted teams unavailable");
    const data = await response.json();
    if (!Array.isArray(data.results) || data.results.length > 200)
      throw new Error("Invalid trusted team page");
    if (data.next != null) {
      const cursor = new URL(data.next);
      if (cursor.origin !== "https://api.baserow.io" ||
          cursor.pathname !== `/api/database/rows/table/${teamTableId}/` ||
          cursor.searchParams.getAll("page").length !== 1 ||
          cursor.searchParams.get("page") !== String(page + 1))
        throw new Error("Invalid trusted team pagination cursor");
    }
    teams.push(...data.results);
    if (!data.next) return teams;
  }
  throw new Error("Trusted team pagination limit exceeded");
}

var worker_default = { async fetch(req, env) {
  let TABLES;
  try { TABLES = resolveBaserowTables(env); } catch { return json({ ok: false, error: "Invalid Baserow table mapping" }, 503); }
  const url = new URL(req.url), origin = req.headers.get("Origin");
  const cors = { "Vary": "Origin", ...origin === ORIGIN ? { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "Content-Type,Authorization", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS" } : {} };
  const reply = /* @__PURE__ */ __name((obj, status = 200) => json(obj, status, cors), "reply");
  const personalPoolWritesEnabled = env.NSK_REQUIRE_PERSONAL_POOL_WRITES === "true";
  const personalMatchWritesEnabled = env.NSK_REQUIRE_PERSONAL_MATCH_WRITES === "true";
  const checkPersonalMatchWrite = async request => {
    const base = "https://api.baserow.io/api/database/rows/table/";
    const tableIds = resolveBaserowTables(env);
    const readRow = async (table, rowId) => {
      if (!env.BASEROW_TOKEN) throw new Error("Baserow credentials missing");
      const response = await fetch(`${base}${tableIds[table]}/${rowId}/?user_field_names=true`, {
        headers: { Authorization: `Token ${env.BASEROW_TOKEN}` }
      });
      if (!response.ok) return null;
      return response.json();
    };
    return authorizePersonalMatchWrite(request, env, {
      listTeams: () => listTrustedRosterTeams(env),
      readPool: poolId => readRow("poolspel", poolId),
      readMatchConfig: configId => readRow("matchkonfiguration", configId)
    });
  };
  const checkPersonalPoolWrite = async request => authorizePersonalPoolWrite(request, env, {
    listTeams: () => listTrustedRosterTeams(env),
    readPool: async poolId => {
      if (!env.BASEROW_TOKEN) throw new Error("Baserow credentials missing");
      const tableId = resolveBaserowTables(env).poolspel;
      const response = await fetch(`https://api.baserow.io/api/database/rows/table/${tableId}/${poolId}/?user_field_names=true`, {
        headers: { Authorization: `Token ${env.BASEROW_TOKEN}` }
      });
      if (!response.ok) return null;
      return response.json();
    }
  });
  if (req.method === "OPTIONS") return new Response(null, { status: origin === ORIGIN ? 204 : 403, headers: cors });
  if (origin && origin !== ORIGIN) return reply({ ok: false, error: "Origin not allowed" }, 403);
  if (url.pathname === "/api/coach-selection" && (req.method === "GET" || req.method === "POST")) {
    if (!env.NSK_TRAINERS) return reply({ ok: false, error: "NSK_TRAINERS saknas i Worker Bindings" }, 503);
    if (env.NSK_REQUIRE_PERSONAL_COACH_SELECTION === "true") {
      const access = await authorizeCoachSelection(req, env, {
        readPool: async id => {
          const response = await fetch(`https://api.baserow.io/api/database/rows/table/${TABLES.poolspel}/${id}/?user_field_names=true`, {
            headers: { Authorization: `Token ${env.BASEROW_TOKEN}` }
          });
          return response.ok ? response.json() : null;
        },
        listTeams: () => listTrustedRosterTeams(env)
      });
      if (!access.allowed) return reply({ ok: false, error: access.error }, access.status);
    } else if (!env.ADMIN_KV || !await session(req, env)) return reply({ ok: false, error: "Adminl\xE4ge kr\xE4vs" }, 401);
    let poolId, lagNo, matchNo, coachIds;
    if (req.method === "GET") {
      poolId = Number(url.searchParams.get("pool_id"));
      lagNo = Number(url.searchParams.get("lag_no"));
      matchNo = Number(url.searchParams.get("match_no"));
    } else {
      if (!(req.headers.get("Content-Type") || "").startsWith("application/json")) return reply({ ok: false, error: "JSON kr\xE4vs" }, 415);
      if (Number(req.headers.get("Content-Length") || 0) > 4096) return reply({ ok: false, error: "F\xF6r stor beg\xE4ran" }, 413);
      let body;
      try {
        body = await req.json();
      } catch {
        return reply({ ok: false, error: "Ogiltig JSON" }, 400);
      }
      poolId = body?.pool_id;
      lagNo = body?.lag_no;
      matchNo = body?.match_no;
      coachIds = body?.coach_ids;
      if (!Array.isArray(coachIds) || coachIds.length > 20 || coachIds.some((x) => !Number.isSafeInteger(x) || x <= 0) || new Set(coachIds).size !== coachIds.length)
        return reply({ ok: false, error: "Ogiltiga tr\xE4nar-ID" }, 400);
    }
    if (![poolId, lagNo, matchNo].every((x) => Number.isSafeInteger(x) && x > 0)) return reply({ ok: false, error: "Ogiltigt poolspel, lag eller match" }, 400);
    const auth = { Authorization: `Token ${env.BASEROW_TOKEN}` };
    const base = "https://api.baserow.io/api/database/rows/table/";
    try {
      const [pr, tr] = await Promise.all([
        fetch(`${base}${TABLES.poolspel}/${poolId}/?user_field_names=true`, { headers: auth }),
        fetch(`${base}${TABLES.lag}/?user_field_names=true&size=100`, { headers: auth })
      ]);
      if (!pr.ok || !tr.ok) return reply({ ok: false, error: "Kunde inte kontrollera poolspel" }, 502);
      const pool = await pr.json();
      const team = (await tr.json()).results?.find((x) => x.Namn === "NSK Team 18" && String(x["S\xE4song"]) === "2026");
      const ids = /* @__PURE__ */ __name((v) => Array.isArray(v) ? v.map((x) => Number(typeof x === "object" ? x.id : x)) : [], "ids");
      if (!team || !ids(pool.Lag).includes(Number(team.id))) return reply({ ok: false, error: "Fel poolspel" }, 403);
      if (lagNo > Number(pool["Antal lag"]) || matchNo > Number(pool["Antal matcher"])) return reply({ ok: false, error: "Lag eller match utanf\xF6r poolspelet" }, 400);
      const key = `coaches:v1:${poolId}:${lagNo}:${matchNo}`;
      if (req.method === "GET") {
        const saved = await env.NSK_TRAINERS.get(key, "json");
        return reply({ ok: true, coach_ids: Array.isArray(saved?.coach_ids) ? saved.coach_ids : [], saved: !!saved });
      }
      const allowed = /* @__PURE__ */ new Set();
      let page2 = 1;
      while (page2 <= 100) {
        const r = await fetch(`${base}${TABLES.tranare}/?user_field_names=true&page=${page2}&size=200`, { headers: auth });
        if (!r.ok) throw new Error("Kunde inte kontrollera tr\xE4nare");
        const data = await r.json();
        for (const coach of data.results || []) if (ids(coach.Lag).includes(Number(team.id))) allowed.add(Number(coach.id));
        if (!data.next) break;
        page2++;
      }
      if (page2 > 100) throw new Error("F\xF6r m\xE5nga tr\xE4nare att kontrollera");
      if (coachIds.some((id) => !allowed.has(id))) return reply({ ok: false, error: "En vald tr\xE4nare tillh\xF6r inte laget" }, 403);
      await env.NSK_TRAINERS.put(key, JSON.stringify({ coach_ids: coachIds, updated_at: (/* @__PURE__ */ new Date()).toISOString() }));
      return reply({ ok: true, coach_ids: coachIds });
    } catch (e) {
      return reply({ ok: false, error: e?.message || "Kunde inte spara tr\xE4nare" }, 502);
    }
  }
  if (url.pathname === "/health" && req.method === "GET") {
    try {
      const r = await fetch(`https://api.baserow.io/api/database/rows/table/${TABLES.lag}/?user_field_names=true&size=1`, { headers: { Authorization: `Token ${env.BASEROW_TOKEN}` } });
      return reply({ ok: r.ok, database: "NSK", table: "Lag", status: r.status }, r.ok ? 200 : 502);
    } catch {
      return reply({ ok: false, error: "Baserow unavailable" }, 502);
    }
  }
  if (url.pathname === "/api/match/login" && req.method === "POST") {
    if (!env.ADMIN_KV || !env.MATCH_PASSWORD || env.MATCH_PASSWORD.length < 8) return reply({ ok: false, error: "Matchkod \xE4r inte konfigurerad (minst 8 tecken)" }, 503);
    if (!(req.headers.get("Content-Type") || "").startsWith("application/json")) return reply({ ok: false, error: "JSON kr\xE4vs" }, 415);
    if (Number(req.headers.get("Content-Length") || 0) > 2048) return reply({ ok: false, error: "F\xF6r stor beg\xE4ran" }, 413);
    const ip = req.headers.get("CF-Connecting-IP") || "unknown";
    const attemptKey = "match-attempt:" + await sha(ip);
    const attempts = Number(await env.ADMIN_KV.get(attemptKey) || 0);
    if (attempts >= 5) return reply({ ok: false, error: "F\xF6r m\xE5nga f\xF6rs\xF6k. F\xF6rs\xF6k igen om 15 minuter." }, 429);
    let body;
    try {
      body = await req.json();
    } catch {
      return reply({ ok: false, error: "Ogiltig JSON" }, 400);
    }
    const password = typeof body?.password === "string" ? body.password : "";
    if (await sha(password) !== await sha(env.MATCH_PASSWORD)) {
      await env.ADMIN_KV.put(attemptKey, String(attempts + 1), { expirationTtl: 900 });
      return reply({ ok: false, error: "Fel matchkod" }, 401);
    }
    await env.ADMIN_KV.delete(attemptKey);
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.ADMIN_KV.put("match-session:" + await sha(token), "match", { expirationTtl: 604800 });
    return reply({ ok: true, token, expires_in: 604800 });
  }
  // After complete personal cutover, stop issuing shared Adminläge credentials.
  // Keep logout/status endpoints for legacy-session cleanup and diagnostics.
  if (url.pathname === "/api/admin/login" && req.method === "POST" &&
      personalPoolWritesEnabled && personalMatchWritesEnabled &&
      env.NSK_REQUIRE_PERSONAL_COACH_SELECTION === "true") {
    return reply({ ok: false, error: "Använd personlig inloggning" }, 410);
  }
  if (url.pathname.startsWith("/api/admin/")) {
    if (!env.ADMIN_KV || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) return reply({ ok: false, error: "Admin configuration incomplete" }, 503);
    if (url.pathname === "/api/admin/status" && req.method === "GET") return reply({ ok: true, admin: !!await session(req, env) });
    if (url.pathname === "/api/admin/logout" && req.method === "POST") {
      const t = tokenFrom(req);
      if (t) await env.ADMIN_KV.delete("session:" + await sha(t));
      return reply({ ok: true });
    }
    if (url.pathname === "/api/admin/login" && req.method === "POST") {
      const ip = req.headers.get("CF-Connecting-IP") || "unknown";
      const ipkey = "attempt:" + await sha(ip);
      const attempts = Number(await env.ADMIN_KV.get(ipkey) || 0);
      if (attempts >= 5) return reply({ ok: false, error: "F\xF6r m\xE5nga f\xF6rs\xF6k. F\xF6rs\xF6k igen om 15 minuter." }, 429);
      if (!(req.headers.get("Content-Type") || "").startsWith("application/json")) return reply({ ok: false, error: "JSON required" }, 415);
      if (Number(req.headers.get("Content-Length") || 0) > 2048) return reply({ ok: false, error: "Too large" }, 413);
      let body;
      try {
        body = await req.json();
      } catch {
        return reply({ ok: false, error: "Invalid JSON" }, 400);
      }
      const pass = typeof body?.password === "string" ? body.password : "";
      const a = await sha(pass), b = await sha(env.ADMIN_PASSWORD);
      if (a !== b) {
        await env.ADMIN_KV.put(ipkey, String(attempts + 1), { expirationTtl: 900 });
        return reply({ ok: false, error: "Fel l\xF6senord" }, 401);
      }
      await env.ADMIN_KV.delete(ipkey);
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = hex(bytes);
      await env.ADMIN_KV.put("session:" + await sha(token), "admin", { expirationTtl: 2592e3 });
      return reply({ ok: true, token, expires_in: 2592e3 });
    }
    return reply({ ok: false, error: "Not found" }, 404);
  }
  if ((/^\/api\/(spelare|tranare)$/.test(url.pathname) && req.method === "POST") || (/^\/api\/(spelare|tranare)\/\d+$/.test(url.pathname) && ["PATCH", "DELETE"].includes(req.method))) {

    const saveRoster = async () => {
    const table = url.pathname.split("/")[2];
    const tableId = TABLES[table];
    if (req.method === "DELETE") {
      const rowId = url.pathname.split("/").pop();
      try {
        const r = await fetch(`https://api.baserow.io/api/database/rows/table/${tableId}/${rowId}/`, {
          method: "DELETE",
          headers: { Authorization: `Token ${env.BASEROW_TOKEN}` }
        });
        if (!r.ok) return reply({ ok: false, error: "Baserow kunde inte ta bort posten", status: r.status }, 502);
        return reply({ ok: true, deleted: true });
      } catch {
        return reply({ ok: false, error: "Baserow kunde inte nås" }, 502);
      }
    }
    if (!(req.headers.get("Content-Type") || "").startsWith("application/json")) return reply({ ok: false, error: "JSON kr\xE4vs" }, 415);    if (Number(req.headers.get("Content-Length") || 0) > 2048) return reply({ ok: false, error: "F\xF6r stor beg\xE4ran" }, 413);
    let body;
    try {
      body = await req.json();
    } catch {
      return reply({ ok: false, error: "Ogiltig JSON" }, 400);
    }
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) return reply({ ok: false, error: "Ange ett giltigt namn (max 120 tecken)" }, 400);
    let payload = { Namn: name };
    let team = null;
    if (req.method === "POST") {
      const teamResp = await fetch(`https://api.baserow.io/api/database/rows/table/${TABLES.lag}/?user_field_names=true&size=100`, { headers: { Authorization: `Token ${env.BASEROW_TOKEN}` } });
      if (!teamResp.ok) return reply({ ok: false, error: "Kunde inte kontrollera lag" }, 502);
      const teams = (await teamResp.json()).results || [];
      team = teams.find((t) => t.Namn === "NSK Team 18" && String(t["S\xE4song"]) === "2026");
      if (!team) return reply({ ok: false, error: "Laget saknas" }, 409);
      payload.Lag = [team.id];
    }
    const rowId = req.method === "PATCH" ? url.pathname.split("/").pop() : null;
    if (rowId) {
      const teamResp = await fetch(`https://api.baserow.io/api/database/rows/table/${TABLES.lag}/?user_field_names=true&size=100`, { headers: { Authorization: `Token ${env.BASEROW_TOKEN}` } });
      if (!teamResp.ok) return reply({ ok: false, error: "Kunde inte kontrollera lag" }, 502);
      const teams = (await teamResp.json()).results || [];
      team = teams.find((t) => t.Namn === "NSK Team 18" && String(t["S\xE4song"]) === "2026");
      if (!team) return reply({ ok: false, error: "Laget saknas" }, 409);
    }
    if (rowId) {
      const check = await fetch("https://api.baserow.io/api/database/rows/table/" + tableId + "/" + rowId + "/?user_field_names=true", { headers: { Authorization: `Token ${env.BASEROW_TOKEN}` } });
      if (!check.ok) return reply({ ok: false, error: "Posten kunde inte kontrolleras" }, 404);
      const old = await check.json();
      const teamIds = (Array.isArray(old.Lag) ? old.Lag : []).map((x) => Number(typeof x === "object" ? x.id : x));
      if (!teamIds.includes(Number(team.id))) return reply({ ok: false, error: "Posten tillh\xF6r inte NSK Team 18" }, 403);
    }
    const endpoint = "https://api.baserow.io/api/database/rows/table/" + tableId + "/" + (rowId ? rowId + "/" : "") + "?user_field_names=true";
    try {
      const r = await fetch(endpoint, { method: req.method, headers: { Authorization: `Token ${env.BASEROW_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) return reply({ ok: false, error: "Baserow kunde inte spara posten", status: r.status }, 502);
      return reply({ ok: true, row: await r.json() }, req.method === "POST" ? 201 : 200);
    } catch {
      return reply({ ok: false, error: "Baserow kunde inte n\xE5s" }, 502);
    }
    };
    const result = await authorizePersonalWorkerWrite(req, env, {
      authorizationTeamId: "NSK Team 18",
      listTeams: () => listTrustedRosterTeams(env),
      readRow: async (table, id) => {
        const r = await fetch(`https://api.baserow.io/api/database/rows/table/${TABLES[table]}/${id}/?user_field_names=true`, {
          headers: { Authorization: `Token ${env.BASEROW_TOKEN}` }
        });
        if (!r.ok) throw new Error("Row lookup failed");
        return r.json();
      },
      mutateRoster: saveRoster
    });
    if (result instanceof Response) return result;
    return reply(result, result.status || 500);
  }
  if (/^\/api\/poolspel\/\d+\/aktiv$/.test(url.pathname) && req.method === "PATCH") {
    if (personalPoolWritesEnabled) {
      const access = await checkPersonalPoolWrite(req);
      if (!access.allowed) return reply({ ok: false, error: access.error }, access.status);
    } else if (!env.ADMIN_KV || !await session(req, env)) return reply({ok:false,error:"Adminläge krävs"},401);
    let data;
    try { data = await req.json(); } catch { return reply({ok:false,error:"Ogiltig JSON"},400); }
    if (!data || Object.keys(data).length !== 1 || typeof data.active !== "boolean") return reply({ok:false,error:"Ogiltigt Aktiv-värde"},400);
    const id = Number(url.pathname.split("/")[3]);
    const auth = {Authorization:"Token " + env.BASEROW_TOKEN};
    try {
      const teamsResp = await fetch("https://api.baserow.io/api/database/rows/table/" + TABLES.lag + "/?user_field_names=true&size=100",{headers:auth});
      if (!teamsResp.ok) return reply({ok:false,error:"Lagkontroll misslyckades"},502);
      const team = (await teamsResp.json()).results?.find(t=>t.Namn==="NSK Team 18" && String(t["Säsong"])==="2026");
      if (!team) return reply({ok:false,error:"Laget saknas"},409);
      const endpoint = "https://api.baserow.io/api/database/rows/table/" + TABLES.poolspel + "/" + id + "/?user_field_names=true";
      const oldResp = await fetch(endpoint,{headers:auth});
      if (!oldResp.ok) return reply({ok:false,error:"Poolspelet saknas"},404);
      const old = await oldResp.json();
      if (!Array.isArray(old.Lag) || !old.Lag.some(t=>Number(typeof t==="object"?t.id:t)===team.id)) return reply({ok:false,error:"Fel lag"},403);
      const res = await fetch(endpoint,{method:"PATCH",headers:{...auth,"Content-Type":"application/json"},body:JSON.stringify({Status:data.active ? "Planerat" : "Avslutat",Aktiv:data.active})});
      if (!res.ok) return reply({ok:false,error:"Uppdateringen misslyckades"},502);
      return reply({ok:true,row:await res.json()});
    } catch { return reply({ok:false,error:"Databasfel"},502); }
  }
  if (url.pathname === "/api/poolspel" && req.method === "POST" || /^\/api\/poolspel\/\d+$/.test(url.pathname) && req.method === "PATCH") {
    let authorizedPoolTeam = null;
    if (personalPoolWritesEnabled) {
      const access = await checkPersonalPoolWrite(req);
      if (!access.allowed) return reply({ ok: false, error: access.error }, access.status);
      authorizedPoolTeam = access.teamId;
    } else if (!env.ADMIN_KV || !await session(req, env)) return reply({ ok: false, error: "Adminl\xE4ge kr\xE4vs" }, 401);
    if (!(req.headers.get("Content-Type") || "").startsWith("application/json")) return reply({ ok: false, error: "JSON kr\xE4vs" }, 415);
    if (Number(req.headers.get("Content-Length") || 0) > 4096) return reply({ ok: false, error: "F\xF6r stor beg\xE4ran" }, 413);
    let body;
    try {
      body = await req.json();
    } catch {
      return reply({ ok: false, error: "Ogiltig JSON" }, 400);
    }
    const keys = ["title", "place", "hall", "pool_date", "status", "teams", "matches", "players_on_field", "periods", "period_time", "sub_time"];
    if (personalPoolWritesEnabled && req.method === "POST") keys.push("team_id");
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((k) => !keys.includes(k))) return reply({ ok: false, error: "Ogiltiga f\xE4lt" }, 400);
    const place = typeof body.place === "string" ? body.place.trim() : "";
    const hall = typeof body.hall === "string" ? body.hall.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const date = body.pool_date;
    if (!place || place.length > 150 || !title || title.length > 150 || hall.length > 150) return reply({ ok: false, error: "Ange ort och namn (max 150 tecken)" }, 400);
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return reply({ ok: false, error: "Ange ett giltigt datum" }, 400);
    const ranges = { teams: [1, 20], matches: [1, 20], players_on_field: [1, 20], periods: [1, 10], period_time: [1, 120], sub_time: [1, 3600] };
    for (const [k, [min, max]] of Object.entries(ranges)) if (!Number.isInteger(body[k]) || body[k] < min || body[k] > max) return reply({ ok: false, error: "Ogiltigt v\xE4rde: " + k }, 400);
    if (body.status !== "Aktiv") return reply({ ok: false, error: "Ogiltig status" }, 400);
    const auth = { Authorization: `Token ${env.BASEROW_TOKEN}` };
    try {
      const teamsResp = await fetch(`https://api.baserow.io/api/database/rows/table/${TABLES.lag}/?user_field_names=true&size=100`, { headers: auth });
      if (!teamsResp.ok) return reply({ ok: false, error: "Kunde inte kontrollera f\xF6reningslag" }, 502);
      const teamRows = (await teamsResp.json()).results;
      const matches = Array.isArray(teamRows) ? teamRows.filter((t) => t.Namn === (authorizedPoolTeam || "NSK Team 18") && String(t["S\xE4song"]) === "2026" && Number.isSafeInteger(Number(t.id)) && Number(t.id) > 0) : [];
      if (matches.length !== 1) return reply({ ok: false, error: "Lagkopplingen kunde inte verifieras" }, 409);
      const team = matches[0];
      const rowId = req.method === "PATCH" ? Number(url.pathname.split("/").pop()) : null;
      if (rowId) {
        const oldResp = await fetch(`https://api.baserow.io/api/database/rows/table/${TABLES.poolspel}/${rowId}/?user_field_names=true`, { headers: auth });
        if (!oldResp.ok) return reply({ ok: false, error: "Poolspel saknas" }, 404);
        const old = await oldResp.json();
        if (!(Array.isArray(old.Lag) && old.Lag.some((t) => Number(typeof t === "object" ? t.id : t) === team.id))) return reply({ ok: false, error: "Fel f\xF6reningslag" }, 403);
        if (body.teams < Number(old["Antal lag"] || 0)) {
          let page2 = 1;
          while (page2 <= 100) {
            const r2 = await fetch(`https://api.baserow.io/api/database/rows/table/${TABLES.matchkonfiguration}/?user_field_names=true&page=${page2}&size=200`, { headers: auth });
            if (!r2.ok) return reply({ ok: false, error: "Kunde inte kontrollera matcher" }, 502);
            const d = await r2.json();
            if ((d.results || []).some((c) => Array.isArray(c.Poolspel) && c.Poolspel.some((p) => Number(typeof p === "object" ? p.id : p) === rowId) && Number(c.Lagnummer) > body.teams)) return reply({ ok: false, error: "Kan inte minska antal lag: matchkonfiguration finns" }, 409);
            if (!d.next) break;
            page2++;
          }
          if (page2 > 100) return reply({ ok: false, error: "F\xF6r m\xE5nga matcher att kontrollera" }, 409);
        }
      }
      const payload = { Namn: title, Plats: place, Ishall: hall, Datum: date, "Antal lag": body.teams, "Antal matcher": body.matches, "Spelare p\xE5 plan": body.players_on_field, Perioder: body.periods, Periodtid: body.period_time, Bytestid: body.sub_time };
      if (!rowId) payload.Lag = [team.id];
      const endpoint = `https://api.baserow.io/api/database/rows/table/${TABLES.poolspel}/${rowId ? rowId + "/" : ""}?user_field_names=true`;
      const r = await fetch(endpoint, { method: req.method, headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) {
        const details = await r.json().catch(() => ({}));
        return reply({ ok: false, error: "Baserow kunde inte spara poolspel", status: r.status, baserow_error: details.error || null, baserow_detail: details.detail || null }, 502);
      }
      return reply({ ok: true, row: await r.json() }, rowId ? 200 : 201);
    } catch {
      return reply({ ok: false, error: "Baserow kunde inte n\xE5s" }, 502);
    }
  }
  if (url.pathname === "/api/matchkonfiguration" && req.method === "POST" || /^\/api\/matchkonfiguration\/\d+$/.test(url.pathname) && req.method === "PATCH" || /^\/api\/laguppstallningar\/\d+$/.test(url.pathname) && req.method === "POST") {
    if (personalMatchWritesEnabled) {
      const access = await checkPersonalMatchWrite(req);
      if (!access.allowed) return reply({ ok: false, error: access.error }, access.status);
    } else if (!env.ADMIN_KV || !await session(req, env)) return reply({ ok: false, error: "Adminl\xE4ge kr\xE4vs" }, 401);
    if (!(req.headers.get("Content-Type") || "").startsWith("application/json")) return reply({ ok: false, error: "JSON kr\xE4vs" }, 415);
    if (Number(req.headers.get("Content-Length") || 0) > 16384) return reply({ ok: false, error: "F\xF6r stor beg\xE4ran" }, 413);
    let body;
    try {
      body = await req.json();
    } catch {
      return reply({ ok: false, error: "Ogiltig JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ ok: false, error: "Ogiltig data" }, 400);
    const auth = { Authorization: `Token ${env.BASEROW_TOKEN}` };
    const base = "https://api.baserow.io/api/database/rows/table/";
    const getRow = /* @__PURE__ */ __name(async (table, rowId) => {
      const r = await fetch(`${base}${TABLES[table]}/${rowId}/?user_field_names=true`, { headers: auth });
      return r.ok ? await r.json() : null;
    }, "getRow");
    const linkIds = /* @__PURE__ */ __name((v) => Array.isArray(v) ? v.map((x) => Number(typeof x === "object" ? x.id : x)) : [], "linkIds");
    const positive = /* @__PURE__ */ __name((n) => Number.isSafeInteger(n) && n > 0, "positive");
    const belongs = /* @__PURE__ */ __name(async (poolId) => {
      const pool = await getRow("poolspel", poolId);
      if (!pool) return null;
      const r = await fetch(`${base}${TABLES.lag}/?user_field_names=true&size=100`, { headers: auth });
      if (!r.ok) throw new Error("Kunde inte kontrollera lag");      const team = (await r.json()).results?.find((x) => x.Namn === "NSK Team 18" && String(x["S\xE4song"]) === "2026");
      return team && linkIds(pool.Lag).includes(Number(team.id)) ? pool : null;
    }, "belongs");
    try {
      if (url.pathname.startsWith("/api/matchkonfiguration")) {
        const poolId2 = body.pool_id, lagNo = body.lag_no, matchNo = body.match_no;
        if (!positive(poolId2) || !positive(lagNo) || !positive(matchNo)) return reply({ ok: false, error: "Ogiltigt poolspel, lag eller match" }, 400);
        const pool = await belongs(poolId2);
        if (!pool) return reply({ ok: false, error: "Poolspel saknas eller tillh\xF6r annat lag" }, 403);
        if (lagNo > Number(pool["Antal lag"]) || matchNo > Number(pool["Antal matcher"])) return reply({ ok: false, error: "Lag eller match utanf\xF6r poolspelet" }, 400);
        if (body.start_time != null && (typeof body.start_time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(body.start_time))) return reply({ ok: false, error: "Ogiltig starttid" }, 400);
        if (typeof body.opponent !== "string" || body.opponent.length > 150 || typeof body.plan !== "string" || body.plan.length > 80) return reply({ ok: false, error: "Ogiltig motst\xE5ndare eller plan" }, 400);
        if (!positive(body.player_count) || body.player_count > 25) return reply({ ok: false, error: "Ogiltigt antal spelare" }, 400);
        if (!positive(body.goalie_player_id)) return reply({ ok: false, error: "Ogiltig m\xE5lvakt" }, 400);
        if (!Array.isArray(body.players_on_field) || body.players_on_field.some((x) => !positive(x)) || new Set(body.players_on_field).size !== body.players_on_field.length || !body.players_on_field.includes(body.goalie_player_id)) return reply({ ok: false, error: "Ogiltiga spelare" }, 400);
        const teamResp2 = await fetch(`${base}${TABLES.lag}/?user_field_names=true&size=100`, { headers: auth });
        if (!teamResp2.ok) throw new Error("Kunde inte kontrollera lag");
        const team2 = (await teamResp2.json()).results?.find((x) => x.Namn === "NSK Team 18" && String(x["S\xE4song"]) === "2026");
        if (!team2) return reply({ ok: false, error: "Laget saknas" }, 409);
        const allowed = /* @__PURE__ */ new Set();
        let playerPage = 1;
        while (playerPage <= 100) {
          const pr = await fetch(`${base}${TABLES.spelare}/?user_field_names=true&page=${playerPage}&size=200`, { headers: auth });
          if (!pr.ok) throw new Error("Kunde inte kontrollera spelare");
          const pd = await pr.json();
          for (const person of pd.results || []) if (linkIds(person.Lag).includes(Number(team2.id))) allowed.add(Number(person.id));
          if (!pd.next) break;
          playerPage++;
        }
        if (playerPage > 100) throw new Error("F\xF6r m\xE5nga spelare");
        if (!allowed.has(body.goalie_player_id) || body.players_on_field.some((pid) => !allowed.has(pid))) return reply({ ok: false, error: "En vald spelare tillh\xF6r inte laget" }, 403);
        const rowId = req.method === "PATCH" ? Number(url.pathname.split("/").pop()) : null;
        if (rowId) {
          const old = await getRow("matchkonfiguration", rowId);
          if (!old || !linkIds(old.Poolspel).includes(poolId2) || Number(old.Lagnummer) !== lagNo || Number(old.Matchnummer) !== matchNo) return reply({ ok: false, error: "Matchkonfiguration tillh\xF6r inte vald match" }, 403);
        }
        const payload = { Poolspel: [poolId2], Lagnummer: lagNo, Matchnummer: matchNo, Starttid: body.start_time || null, "Motst\xE5ndare": body.opponent, Plan: body.plan, "Antal spelare": body.player_count, "M\xE5lvakt": [body.goalie_player_id], "Spelare p\xE5 plan": body.players_on_field };
        const r = await fetch(`${base}${TABLES.matchkonfiguration}/${rowId ? rowId + "/" : ""}?user_field_names=true`, { method: req.method, headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return reply({ ok: false, error: "Baserow kunde inte spara matchkonfiguration", status: r.status, detail: data.detail || data.error || null }, 502);
        return reply({ ok: true, row: data }, rowId ? 200 : 201);
      }
      const configId = Number(url.pathname.split("/").pop());
      if (!positive(configId) || !Array.isArray(body.players) || !Array.isArray(body.coaches)) return reply({ ok: false, error: "Ogiltig laguppst\xE4llning" }, 400);
      const config = await getRow("matchkonfiguration", configId);
      const poolId = linkIds(config?.Poolspel)[0];
      if (!positive(poolId) || !await belongs(poolId)) return reply({ ok: false, error: "Matchkonfiguration saknas eller tillh\xF6r annat lag" }, 403);
      const players = body.players, coaches = body.coaches;
      if (players.length > 25 || coaches.length > 20 || [...players, ...coaches].some((x) => !positive(x)) || new Set(players).size !== players.length || new Set(coaches).size !== coaches.length) return reply({ ok: false, error: "Ogiltiga person-ID" }, 400);
      const teamResp = await fetch(`${base}${TABLES.lag}/?user_field_names=true&size=100`, { headers: auth });
      if (!teamResp.ok) throw new Error("Kunde inte kontrollera lag");
      const team = (await teamResp.json()).results?.find((x) => x.Namn === "NSK Team 18" && String(x["S\xE4song"]) === "2026");
      if (!team) return reply({ ok: false, error: "Laget saknas" }, 409);
      const listIds = /* @__PURE__ */ __name(async (table) => {
        let ids = /* @__PURE__ */ new Set(), page3 = 1;
        while (page3 <= 100) {
          const r = await fetch(`${base}${TABLES[table]}/?user_field_names=true&page=${page3}&size=200`, { headers: auth });
          if (!r.ok) throw new Error("Kunde inte kontrollera personer");
          const d = await r.json();
          for (const x of d.results || []) if (linkIds(x.Lag).includes(Number(team.id))) ids.add(Number(x.id));
          if (!d.next) return ids;
          page3++;
        }
        throw new Error("F\xF6r m\xE5nga personposter");
      }, "listIds");
      const [validPlayers, validCoaches] = await Promise.all([listIds("spelare"), listIds("tranare")]);
      if (players.some((x) => !validPlayers.has(x)) || coaches.some((x) => !validCoaches.has(x))) return reply({ ok: false, error: "En person tillh\xF6r inte laget" }, 403);
      let existing = [], page2 = 1;
      while (page2 <= 100) {
        const r = await fetch(`${base}${TABLES.laguppstallningar}/?user_field_names=true&page=${page2}&size=200`, { headers: auth });
        if (!r.ok) throw new Error("Kunde inte l\xE4sa laguppst\xE4llningar");
        const d = await r.json();
        existing.push(...(d.results || []).filter((x) => linkIds(x.Matchkonfiguration).includes(configId)));
        if (!d.next) break;
        page2++;
      }
      if (page2 > 100) throw new Error("F\xF6r m\xE5nga laguppst\xE4llningar");
      existing.sort((a, b) => Number(a.id) - Number(b.id));
      const entries = [...players.map((personId, i) => ({ personId, type: "Spelare", order: i + 1 })), ...coaches.map((personId, i) => ({ personId, type: "Tr\xE4nare", order: players.length + i + 1 }))];
      const rowUrl = /* @__PURE__ */ __name((id) => `${base}${TABLES.laguppstallningar}/${id}/?user_field_names=true`, "rowUrl");
      const errors = [];
      for (let i = 0; i < entries.length; i++) {
        const x = entries[i];
        const payload = { Poolspel: [poolId], Matchkonfiguration: [configId], Persontyp: x.type, "Person-ID": x.personId, Sorteringsordning: x.order };
        const current = existing[i];
        const r = await fetch(current ? rowUrl(current.id) : `${base}${TABLES.laguppstallningar}/?user_field_names=true`, {
          method: current ? "PATCH" : "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          return reply({ ok: false, error: "Kunde inte spara laguppst\xE4llningen", status: r.status, detail: d.detail || d.error || null }, 502);
        }
      }
      const surplus = existing.slice(entries.length);
      const cleanupBatch = 10;
      let removed = 0;
      for (const old of surplus.slice(0, cleanupBatch)) {
        let r;
        try {
          r = await fetch(`${base}${TABLES.laguppstallningar}/${old.id}/`, { method: "DELETE", headers: auth });
        } catch (e) {
          return reply({ ok: false, error: "Uppst\xE4llningen uppdaterades men rensningen av dubbletter avbr\xF6ts", failed_row_id: old.id, detail: String(e) }, 502);
        }
        if (!r.ok && r.status !== 404) {
          return reply({ ok: false, error: "Uppst\xE4llningen uppdaterades men en dubblett kunde inte tas bort", failed_row_id: old.id, baserow_status: r.status }, 502);
        }
        removed++;
      }
      return reply({ ok: true, count: entries.length, duplicates_removed: removed, duplicates_remaining: Math.max(0, surplus.length - removed), cleanup_pending: surplus.length > removed });
    } catch (e) {
      return reply({ ok: false, error: e?.message || "Databasfel" }, 502);
    }
  }
  if (url.pathname === "/api/bytesschema/save" && req.method === "POST") {
    if (!env.AUTH_DB || !env.BASEROW_TOKEN) return reply({ ok: false, error: "Personlig behörighetskontroll saknas" }, 503);
    if (!(req.headers.get("Content-Type") || "").startsWith("application/json")) return reply({ ok: false, error: "JSON krävs" }, 415);
    if (Number(req.headers.get("Content-Length") || 0) > 65536) return reply({ ok: false, error: "F\xF6r stor beg\xE4ran" }, 413);
    let body;
    try {
      body = await req.json();
    } catch {
      return reply({ ok: false, error: "Ogiltig JSON" }, 400);
    }
    const pos = /* @__PURE__ */ __name((n) => Number.isSafeInteger(n) && n > 0, "pos");
    const { pool_id: poolId, lag_no: lagNo, match_no: matchNo } = body || {};
    if (!pos(poolId) || !pos(lagNo) || !pos(matchNo)) return reply({ ok: false, error: "Ogiltigt bytesschema" }, 400);
    if (Object.hasOwn(body || {}, "team_id") || Object.hasOwn(body || {}, "teamId")) return reply({ ok: false, error: "Lag får inte anges av klienten" }, 400);
    const identityToken = /^Bearer ([^\s]+)$/.exec(req.headers.get("Authorization") || "")?.[1];
    let actor = null;
    try { actor = identityToken ? await createPersonalRosterIdentityVerifier(env)(identityToken) : null; } catch { actor = null; }
    if (!actor) return reply({ ok: false, error: "Personlig inloggning krävs" }, 401);
    try {
      const owner = await createPoolOwnerResolver(env)({ poolId, lagNo });
      const access = authorizeTeamFeature(actor, owner.teamId, "shifts");
      if (!access.allowed) return reply({ ok: false, error: access.reason }, access.status);
    } catch { return reply({ ok: false, error: "Lag och behörighet kunde inte verifieras" }, 503); }
    if (!env.SHIFT_LOCK) return reply({ ok: false, error: "SHIFT_LOCK saknas" }, 503);
    const stub = env.SHIFT_LOCK.get(env.SHIFT_LOCK.idFromName(`${poolId}:${lagNo}:${matchNo}`));
    try {
      const result = await stub.fetch("https://shift-lock.internal/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, action: "save" }) });
      return new Response(result.body, { status: result.status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } catch (e) {
      return reply({ ok: false, error: "Kunde inte spara bytesschema", detail: String(e) }, 502);
    }
  }
  if (/^\/api\/bytesschema\/\d+\/done$/.test(url.pathname) && req.method === "PATCH") {
    if (!env.AUTH_DB || !env.BASEROW_TOKEN) return reply({ ok: false, error: "Personlig behörighetskontroll saknas" }, 503);
    if (!(req.headers.get("Content-Type") || "").startsWith("application/json")) return reply({ ok: false, error: "JSON kr\xE4vs" }, 415);
    if (Number(req.headers.get("Content-Length") || 0) > 2048) return reply({ ok: false, error: "F\xF6r stor beg\xE4ran" }, 413);
    let body;
    try {
      body = await req.json();
    } catch {
      return reply({ ok: false, error: "Ogiltig JSON" }, 400);
    }    if (typeof body?.done !== "boolean") return reply({ ok: false, error: "Ogiltigt v\xE4rde" }, 400);
    const id = Number(url.pathname.split("/")[3]);
    if (!env.SHIFT_LOCK) return reply({ ok: false, error: "SHIFT_LOCK saknas" }, 503);
      const identityToken = /^Bearer ([^\s]+)$/.exec(req.headers.get("Authorization") || "")?.[1];
      let actor = null;
      try { actor = identityToken ? await createPersonalRosterIdentityVerifier(env)(identityToken) : null; } catch { actor = null; }
      if (!actor) return reply({ ok: false, error: "Personlig inloggning krävs" }, 401);
    const auth = { Authorization: `Token ${env.BASEROW_TOKEN}` };
    const base = "https://api.baserow.io/api/database/rows/table/";
    try {
      const r = await fetch(`${base}${TABLES.bytesschema}/${id}/?user_field_names=true`, { headers: auth });
      if (!r.ok) return reply({ ok: false, error: "Byte saknas" }, 404);
      const row = await r.json();
      const poolId = Number((row.Poolspel || [])[0]?.id || (row.Poolspel || [])[0]);
      const lagNo = Number(row.Lagnummer), matchNo = Number(row.Matchnummer);
      if (![poolId, lagNo, matchNo].every((n) => Number.isSafeInteger(n) && n > 0)) return reply({ ok: false, error: "Ogiltig match" }, 400);
      const owner = await createPoolOwnerResolver(env)({ shiftRowId: id });
      const access = authorizeTeamFeature(actor, owner.teamId, "shifts");
      if (!access.allowed) return reply({ ok: false, error: access.reason }, access.status);
      const stub = env.SHIFT_LOCK.get(env.SHIFT_LOCK.idFromName(`${poolId}:${lagNo}:${matchNo}`));
      const result = await stub.fetch("https://shift-lock.internal/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "done", id, pool_id: poolId, lag_no: lagNo, match_no: matchNo, done: body.done }) });
      return new Response(result.body, { status: result.status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } catch (e) {
      return reply({ ok: false, error: "Kunde inte \xE4ndra byte", detail: String(e) }, 502);
    }
  }
  // Personally authorized staff writes. Fail closed if D1, KV or Baserow is unavailable.
  if (url.pathname === "/api/lagpersonal" && ["POST", "PATCH"].includes(req.method)) {
    try {
      const result = await handlePersonalLagpersonalWrite(req, env, {
        listTeams: async () => {
          if (!env.BASEROW_TOKEN || !env.BASEROW_DATABASE_ID) throw Error("Baserow credentials missing");
          const teams = [];
          for (let page = 1; page <= 100; page++) {
            const response = await fetch("https://api.baserow.io/api/database/rows/table/" + TABLES.lag + "/?user_field_names=true&size=200&page=" + page, {
              headers: { Authorization: "Token " + env.BASEROW_TOKEN }
            });
            if (!response.ok) throw Error("Trusted team list unavailable");
            const data = await response.json();
            if (!Array.isArray(data.results)) throw Error("Invalid trusted team list");
            teams.push(...data.results);
            if (!data.next) return teams;
          }
          throw Error("Trusted team list exceeded pagination limit");
        }
      });
      return reply(result, result.status || 500);
    } catch {
      return reply({ ok: false, error: "Lagring eller laguppslag kunde inte verifieras" }, 503);
    }
  }
  // Scoped rollout supports a safe two-phase deployment: authenticated new
  // clients are scoped immediately, while the global flag later forces legacy
  // clients through the same authorization boundary (and denies missing sessions).
  // Any Authorization header triggers the scoped path so malformed credentials
  // cannot fall through to the legacy, unscoped roster read.
  if (req.method === "GET" &&
      (url.pathname === "/api/lagpersonal" || env.NSK_REQUIRE_SCOPED_ROSTER_READS === "true" || req.headers.has("Authorization")) &&
      /^\/api\/(?:spelare|tranare|lagpersonal)(?:\/\d+)?$/.test(url.pathname)) {
    const listTrustedTeams = async () => {
      if (!env.BASEROW_TOKEN) throw Error("Trusted teams unavailable");
      const teamTableId = resolveBaserowTables(env).lag;
      const teams = [];
      for (let page = 1; page <= 100; page++) {
        const response = await fetch("https://api.baserow.io/api/database/rows/table/" + teamTableId + "/?user_field_names=true&size=200&page=" + page, {
          headers: { Authorization: "Token " + env.BASEROW_TOKEN }
        });
        if (!response.ok) throw Error("Trusted teams unavailable");
        const data = await response.json();
        if (!Array.isArray(data.results) || data.results.length > 200) throw Error("Invalid trusted team page");
        if (data.next != null) {
          const cursor = new URL(data.next);
          if (cursor.origin !== "https://api.baserow.io" ||
              cursor.pathname !== "/api/database/rows/table/" + teamTableId + "/" ||
              cursor.searchParams.getAll("page").length !== 1 ||
              cursor.searchParams.get("page") !== String(page + 1))
            throw Error("Invalid trusted team pagination cursor");
        }
        teams.push(...data.results);
        if (!data.next) return teams;
      }
      throw Error("Trusted team pagination limit exceeded");
    };
    const fetchAllRosterRows = async table => {
      if (!["spelare", "tranare"].includes(table) || !env.BASEROW_TOKEN) throw Error("Invalid roster source");
      const rosterTableId = resolveBaserowTables(env)[table];
      const rows = [];
      for (let page = 1; page <= 100; page++) {
        const response = await fetch("https://api.baserow.io/api/database/rows/table/" + rosterTableId + "/?user_field_names=true&page=" + page + "&size=200", {
          headers: { Authorization: "Token " + env.BASEROW_TOKEN }
        });
        if (!response.ok) throw Error("Roster source unavailable");
        const data = await response.json();
        if (!Array.isArray(data.results) || data.results.length > 200) throw Error("Incomplete roster page");
        if (data.next !== null && data.next !== undefined &&
            (typeof data.next !== "string" || new URL(data.next).origin !== "https://api.baserow.io" ||
             new URL(data.next).pathname !== "/api/database/rows/table/" + rosterTableId + "/" ||
             new URL(data.next).searchParams.getAll("page").length !== 1 ||
             new URL(data.next).searchParams.get("page") !== String(page + 1)))
          throw Error("Invalid roster pagination cursor");
        rows.push(...data.results);
        if (!data.next) return rows;
      }
      throw Error("Roster pagination limit exceeded");
    };
    const handler = createProductionRosterReadHandler(env, {
      listTrustedTeams,
      resolveOwnerTeam: async request => {
        const ids = new URL(request.url).searchParams.getAll("team_id");
        if (ids.length !== 1 || !/^[1-9]\d*$/.test(ids[0]) || !Number.isSafeInteger(Number(ids[0]))) throw Error("Missing trusted team selection");
        const teams = await listTrustedTeams();
        if (!teams.some(team => String(team.id) === ids[0])) throw Error("Unknown team");
        return ids[0];
      },
      fetchAllRosterRows,
      fetchTeamStaff: async teamId => {
        if (!env.NSK_TRAINERS) throw Error("Staff store unavailable");
        return await env.NSK_TRAINERS.get("lagpersonal:team:" + teamId, "json") || [];
      }
    });
    const scopedResponse = await handler(req);
    const scopedHeaders = new Headers(scopedResponse.headers);
    for (const [name, value] of Object.entries(cors)) scopedHeaders.set(name, value);
    return new Response(scopedResponse.body, {status: scopedResponse.status, headers: scopedHeaders});
  }
  // Opt-in collection authorization. An Authorization header always routes to
  // the guarded path, preventing credential-bearing requests from falling back
  // to the unscoped legacy collection API.
  if (req.method === "GET" &&
      /^\/api\/(?:poolspel|matchkonfiguration|laguppstallningar|bytesschema|spelaretranare)$/.test(url.pathname) &&
      (env.NSK_REQUIRE_SCOPED_COLLECTION_READS === "true" || req.headers.has("Authorization"))) {
    const tableIds = resolveBaserowTables(env);
    const readRows = async table => {
      if (!Object.hasOwn(tableIds, table) || !env.BASEROW_TOKEN)
        throw Error("Baserow collection unavailable");
      const id = tableIds[table];
      const rows = [];
      for (let page = 1; page <= 100; page++) {
        const endpoint = "https://api.baserow.io/api/database/rows/table/" + id + "/";
        const result = await fetch(endpoint + "?user_field_names=true&size=200&page=" + page, {
          headers: { Authorization: "Token " + env.BASEROW_TOKEN }
        });
        if (!result.ok) throw Error("Collection unavailable");
        const body = await result.json();
        if (!Array.isArray(body.results) || body.results.length > 200)
          throw Error("Invalid collection page");
        if (body.next != null) {
          if (typeof body.next !== "string") throw Error("Invalid collection cursor");
          const next = new URL(body.next);
          if (next.origin !== "https://api.baserow.io" || next.pathname !==
              "/api/database/rows/table/" + id + "/" ||
              next.searchParams.getAll("page").length !== 1 ||
              next.searchParams.get("page") !== String(page + 1))
            throw Error("Invalid collection cursor");
        }
        rows.push(...body.results);
        if (!body.next) return rows;
      }
      throw Error("Collection pagination exceeded");
    };
    const scoped = await readPersonallyAuthorizedTeamCollection(req, env, {
      readRows,
      listTrustedTeams: () => readRows("lag")
    });
    const headers = new Headers(scoped.headers);
    for (const [name, value] of Object.entries(cors)) headers.set(name, value);
    return new Response(scoped.body, { status: scoped.status, headers });
  }
  if (req.method !== "GET") return reply({ ok: false, error: "Skrivning \xE4r avst\xE4ngd" }, 405);
  if (url.pathname === "/api/lagpersonal" && req.method === "GET") {
    const teamId = Number(url.searchParams.get("team_id"));
    if (!Number.isSafeInteger(teamId) || teamId <= 0) return reply({ok:false,error:"Ogiltigt lag"},400);
    if (!env.NSK_TRAINERS) return reply({ok:false,error:"Lagring saknas"},503);
    const key = "lagpersonal:team:" + teamId;
    if (req.method === "GET") return reply({ok:true,results:await env.NSK_TRAINERS.get(key,"json") || []});

  }
  // Personally authorized team discovery.
  if (req.method === "GET" && url.pathname === "/api/lag" &&
      (env.NSK_REQUIRE_SCOPED_TEAM_READS === "true" ||
       req.headers.has("Authorization"))) {
    const readRows = async () => {
      const results = [];
      const tableId = resolveBaserowTables(env).lag;
      for (let page = 1; page <= 100; page++) {
        const endpoint = `https://api.baserow.io/api/database/rows/table/${tableId}/`;
        const r = await fetch(
          `${endpoint}?user_field_names=true&page=${page}&size=200`,
          { headers: { Authorization: `Token ${env.BASEROW_TOKEN}` } }
        );
        if (!r.ok) throw Error("Trusted team source unavailable");
        const body = await r.json();
        if (!Array.isArray(body.results) || body.results.length > 200)
          throw Error("Invalid team page");
        results.push(...body.results);
        if (!body.next) return results;
        if (page === 100) throw Error("Team pagination exceeded");
        const next = new URL(body.next);
        if (next.origin !== "https://api.baserow.io" ||
            next.pathname !== endpoint.replace("https://api.baserow.io", "") ||
            next.searchParams.getAll("page").length !== 1 ||
            next.searchParams.get("page") !== String(page + 1))
          throw Error("Invalid team cursor");
      }
      throw Error("Team pagination exceeded");
    };
    const scoped = await readPersonallyAuthorizedTeams(req, env, {
      listTrustedTeams: readRows
    });
    const headers = new Headers(scoped.headers);
    for (const [name, value] of Object.entries(cors))
      headers.set(name, value);
    return new Response(scoped.body, {
      status: scoped.status,
      headers
    });
  }
  // Never expose arbitrary Baserow tables via the legacy generic GET route.
  // All supported collections must pass an explicit authorization boundary.
  return reply({ ok: false, error: "Behörighetskontrollerad läsning krävs" }, 403);
} };
export {
  ShiftLock,
  worker_default as default
};
//# sourceMappingURL=worker.js.map