// Uppdateringar visas för användaren och installeras bara efter godkännande.
const NSK_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
let nskPendingVersion = "";
let nskDismissedVersion = "";

function nskPoolGathering(times) {
  const minutes=times.map(value=>String(value||'').trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/))
    .filter(match=>match&&match[0].slice(0,5)!=='00:00').map(match=>Number(match[1])*60+Number(match[2]));
  if(!minutes.length)return '';
  const gathering=(Math.min(...minutes)+1440-60)%1440;
  return 'Samling kl '+String(Math.floor(gathering/60)).padStart(2,'0')+':'+String(gathering%60).padStart(2,'0');
}

function nskPoolWeekday(date){
  const iso=String(date||'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return '';
  const day=new Date(iso+'T12:00:00Z');
  if(Number.isNaN(day.getTime())||day.toISOString().slice(0,10)!==iso)return '';
  const name=day.toLocaleDateString('sv-SE',{weekday:'long',timeZone:'Europe/Stockholm'});
  return name.charAt(0).toLocaleUpperCase('sv-SE')+name.slice(1);
}

function nskVersionRoot() {
  const src = document.querySelector('script[src*="app.js"]')?.src;
  return new URL("./", src || new URL("../", location.href));
}

function nskDisplayVersion() { return String(window.NSK_APP_VERSION || "1.0"); }

function showNskVersion() {
  if (!document.body.classList.contains("home-page") || document.getElementById("nsk-current-version")) return;
  const label = document.createElement("div");
  label.id = "nsk-current-version";
  label.className = "nsk-current-version";
  label.textContent = "NSK-2026 · version " + nskDisplayVersion();
  document.querySelector(".home-hero")?.appendChild(label);
}

function showNskUpdate(version, appVersion) {
  if (nskPendingVersion === version && document.getElementById("nsk-update-notice")) return;
  if (nskDismissedVersion === version) return;
  nskPendingVersion = version;
  let notice = document.getElementById("nsk-update-notice");
  if (!notice) {
    notice = document.createElement("aside");
    notice.id = "nsk-update-notice";
    notice.className = "nsk-update-notice";
    notice.setAttribute("role", "status");
    notice.innerHTML = '<span id="nsk-update-message"></span><button type="button" id="nsk-update-now">Uppdatera nu</button><button type="button" id="nsk-update-later">Senare</button>';
    document.body.appendChild(notice);
    notice.querySelector("#nsk-update-now").addEventListener("click", async () => {
      const next = new URL(location.href);
      next.searchParams.set("nsk_v", nskPendingVersion);
      const button = notice.querySelector("#nsk-update-now");
      button.disabled = true;
      button.textContent = "Uppdaterar…";
      // Ta bort gamla offline-cacher först efter användarens uttryckliga val.
      // En installerad iPhone-app kan annars fortsätta starta från en gammal shell.
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          const scope = new URL(nskVersionRoot()).href;
          await Promise.all(registrations.filter(reg => reg.scope === scope).map(reg => reg.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter(key => key.startsWith("nsk-team18-")).map(key => caches.delete(key)));
        }
      } catch (err) {
        console.warn("Kunde inte rensa äldre appcache", err);
      }
      if(window.NSKNavigate)window.NSKNavigate(next.href,{reloadApp:true});else location.replace(next.href);
    });
    notice.querySelector("#nsk-update-later").addEventListener("click", () => {
      nskDismissedVersion = nskPendingVersion;
      notice.hidden = true;
    });
  }
  notice.querySelector("#nsk-update-message").textContent = appVersion && appVersion !== nskDisplayVersion() ? "Ny version " + appVersion + " finns tillgänglig." : "En uppdatering finns tillgänglig.";
  notice.hidden = false;
}

async function checkAppVersion() {
  if(window.NSKShellActive===false)return;
  try {
    const res = await fetch(new URL("deploy.json?ts=" + Date.now(), nskVersionRoot()), { cache: "no-store" });
    if (!res.ok) throw new Error("Versionsfilen kunde inte hämtas");
    const data = await res.json();
    const published = String(data?.version || "");
    const loaded = String(window.NSK_VERSION || "");
    // Compare internal build numbers for cache updates; display only the manually selected release.
    if (!/^[1-9]\d*$/.test(published)) throw new Error("Ogiltig publicerad version");
    if (/^[1-9]\d*$/.test(published)) {
      const label = document.getElementById("nsk-current-version");
      if (label) label.textContent = "NSK-2026 · version " + nskDisplayVersion();
    }
    if (!published || !loaded || published === loaded) {
      if (published === loaded) {
        nskPendingVersion = "";
        nskDismissedVersion = "";
        document.getElementById("nsk-update-notice")?.remove();
      }
      return;
    }
    const appVersion = /^\d+\.\d+(?:\.\d+)?$/.test(String(data.appVersion || "")) ? String(data.appVersion) : nskDisplayVersion();
    showNskUpdate(published, appVersion);
  } catch (err) {
    const label = document.getElementById("nsk-current-version");
    if (label) label.textContent = "NSK-2026 · version " + nskDisplayVersion();
    console.warn("Versionskontroll misslyckades", err);
  }
}

// Installerad app: samma nätverksprioriterade service worker på dator och mobil.
function registerNskServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const script = new URL("sw.js", document.querySelector('script[src*="app.js"]')?.src || new URL("../", location.href));
  navigator.serviceWorker.register(script.href, { updateViaCache: "none" })
    .then((reg) => reg.update().catch(() => {}))
    .catch((err) => console.warn("Service worker kunde inte registreras", err));
}

window.NSK2App = (() => {
  function byId(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (m) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]
    ));
  }

  function setText(id, text) {
    const el = byId(id);
    if (el) el.textContent = text || "";
  }

  function setHtml(id, html) {
    const el = byId(id);
    if (el) el.innerHTML = html || "";
  }

  function shortName(fullName) {
    const name = String(fullName || "").trim();
    if (!name || name === "—") return name || "";
    const parts = name.split(/\s+/);
    const first = parts[0] || "";
    const lastInitial = parts.length > 1 ? (parts[parts.length - 1][0] + ".") : "";
    return lastInitial ? `${first} ${lastInitial}` : first;
  }

  function normalizeCoachMapName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function safeInt(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function cleanUUID(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (!s || s === "null" || s === "undefined") return null;
    return s;
  }

  function cleanUUIDList(values) {
    const out = [];
    for (const value of Array.isArray(values) ? values : []) {
      const clean = cleanUUID(value);
      if (clean && !out.includes(clean)) out.push(clean);
    }
    return out;
  }

  const saveTimers = {};
  let truppenRealtime = null;
  let globalClicksBound = false;
  let matchCurrentShiftIndex = 0;
  const matchShiftKey = (poolId, lagNo, matchNo) =>
    `nsk2_current_shift_${poolId}_${lagNo}_${matchNo}`;
  function rememberMatchShift() {
    if (!matchvyCache) return;
    sessionStorage.setItem(matchShiftKey(matchvyCache.poolId, matchvyCache.lagNo, matchvyCache.matchNo), String(matchCurrentShiftIndex));
  }

  const rosterCache = {
    players: null,
    coaches: null,
    playerCoachMap: null,
    playersPromise: null,
    coachesPromise: null,
    mapPromise: null
  };

  function clearRosterCache() {
    rosterCache.players = null;
    rosterCache.coaches = null;
    rosterCache.playerCoachMap = null;
    rosterCache.playersPromise = null;
    rosterCache.coachesPromise = null;
    rosterCache.mapPromise = null;
  }

  async function getPlayersCached(force = false) {
    if (force) {
      rosterCache.players = null;
      rosterCache.playersPromise = null;
    }

    if (rosterCache.players) return rosterCache.players;
    if (rosterCache.playersPromise) return rosterCache.playersPromise;

    rosterCache.playersPromise = DB.listPlayers().then((data) => {
      rosterCache.players = Array.isArray(data) ? data : [];
      rosterCache.playersPromise = null;
      return rosterCache.players;
    }).catch((err) => {
      rosterCache.playersPromise = null;
      throw err;
    });

    return rosterCache.playersPromise;
  }

  async function getCoachesCached(force = false) {
    if (force) {
      rosterCache.coaches = null;
      rosterCache.coachesPromise = null;
    }

    if (rosterCache.coaches) return rosterCache.coaches;
    if (rosterCache.coachesPromise) return rosterCache.coachesPromise;

    rosterCache.coachesPromise = DB.listCoaches().then((data) => {
      rosterCache.coaches = Array.isArray(data) ? data : [];
      rosterCache.coachesPromise = null;
      return rosterCache.coaches;
    }).catch((err) => {
      rosterCache.coachesPromise = null;
      throw err;
    });

    return rosterCache.coachesPromise;
  }

  async function getPlayerCoachMapCached(force = false) {
    if (force) {
      rosterCache.playerCoachMap = null;
      rosterCache.mapPromise = null;
    }

    if (rosterCache.playerCoachMap) return rosterCache.playerCoachMap;
    if (rosterCache.mapPromise) return rosterCache.mapPromise;

    rosterCache.mapPromise = DB.listPlayerCoachMap().then((data) => {
      rosterCache.playerCoachMap = Array.isArray(data) ? data : [];
      rosterCache.mapPromise = null;
      return rosterCache.playerCoachMap;
    }).catch((err) => {
      rosterCache.mapPromise = null;
      throw err;
    });

    return rosterCache.mapPromise;
  }

  async function init() {
    // The shared DOMContentLoaded handler checks the version in the background.

    if (window.Auth?.init) {
      try {
        await Auth.init();
      } catch (err) {
        console.warn("Auth init failed", err);
      }
    }

    bindGlobalClicks();

    const pages = [
      initStartsidaPage,
      initSkapaPoolspelPage,
      initLaguppstallningPage,
      initBytesschemaPage,
      initTruppenPage,
      initGoalieStatsPage,
      initLagPage,
      initMatchvyPage
    ];

    for (const fn of pages) {
      try {
        await fn();
      } catch (err) {
        console.warn("Page init failed:", fn.name, err);
        setText("appError", err?.message || String(err));
      }
    }
  }

  function bindGlobalClicks() {
    if (globalClicksBound) return;
    globalClicksBound = true;

    document.addEventListener("click", async (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const t = target.closest("button,[data-shift-toggle],a") || target;

      try {
        if (t.dataset.editPool) {
          sessionStorage.setItem("nsk2_edit_pool_id", t.dataset.editPool);
          (window.NSKNavigate||((url)=>{(window.location||location).href=url;}))("../skapapoolspel/");
          return;
        }

        if (t.dataset.poolStatusId && t.dataset.poolStatusNext) {
          const poolId = t.dataset.poolStatusId;
          const nextStatus = t.dataset.poolStatusNext;
          if (!["Aktiv", "Avslutad"].includes(nextStatus)) return;
          const current = await DB.getPool(poolId);
          if (!current) throw new Error("Poolspelet hittades inte. Ladda om sidan.");
          const currentlyClosed = current.active === false;
          if (currentlyClosed === (nextStatus === "Avslutad")) {
            (window.NSKNavigate?window.NSKNavigate(location.href,{reload:true,replace:true}):window.location.reload());
            return;
          }
          const question = nextStatus === "Avslutad"
            ? "Avsluta poolspelet? Matcher, laguppställningar och bytesscheman sparas."
            : "Återöppna poolspelet? All sparad matchhistorik behålls.";
          if (!window.confirm(question)) return;
          t.disabled = true;
          try {
            await DB.updatePoolActive(poolId, nextStatus === "Aktiv");
            (window.NSKNavigate?window.NSKNavigate(location.href,{reload:true,replace:true}):window.location.reload());
          } finally {
            t.disabled = false;
          }
          return;
        }

        if (t.dataset.deletePool) {
          const ok = window.confirm("Ta bort poolspelet permanent? Detta kan inte ångras.");
          if (!ok) return;
          t.disabled=true;
          try{await DB.deletePool(t.dataset.deletePool);}finally{t.disabled=false;}
          for(const key of ["nsk2_pool_id","nsk2_edit_pool_id"])if(sessionStorage.getItem(key)===t.dataset.deletePool)sessionStorage.removeItem(key);
          (window.NSKNavigate?window.NSKNavigate(location.href,{reload:true,replace:true}):window.location.reload());
          return;
        }

        const flowLink=t.closest('.pool-flow-actions a');
        if(t.closest('a[href]')&&byId('lineupMatch')&&!flowLink){e.preventDefault();if(await flushLineupChanges())(window.NSKNavigate||((url)=>{location.href=url;}))(t.closest('a[href]').href);return;}
        if(flowLink&&byId('lineupMatch')){
          e.preventDefault();
          if(!await flushLineupChanges())return;
          if(byId('appError')?.textContent?.trim())return;
          (window.NSKNavigate||((url)=>{(window.location||location).href=url;}))(flowLink.href);return;
        }
        if(flowLink&&(matchvySaving||shiftToggleSaving)){e.preventDefault();setText("shiftMsg","Vänta tills bytet har sparats.");return;}
        const teamChoice = t.closest("[data-pool-team-choice]");
        if (teamChoice) {
          const panel = teamChoice.closest(".nsk-pool-content");
          if (!panel) return;
          const selected = teamChoice.dataset.poolTeamChoice || "1";
          panel.dataset.selectedLag = selected;
          panel.querySelectorAll("[data-pool-team-choice]").forEach((btn) => {
            const active = btn.dataset.poolTeamChoice === selected;
            btn.classList.toggle("is-selected", active);
            btn.setAttribute("aria-pressed", String(active));
          });
          return;
        }

        const poolAction = t.closest("[data-pool-team-action]");
        if (poolAction) {
          const panel = poolAction.closest(".nsk-pool-content");
          const lagNo = panel?.dataset.selectedLag || "1";
          const poolId = poolAction.dataset.poolActionId || "";
          if (!poolId) return;
          sessionStorage.setItem("nsk2_pool_id", poolId);
          sessionStorage.setItem("nsk2_lag_nr", lagNo);
          (window.NSKNavigate||((url)=>{(window.location||location).href=url;}))(poolAction.dataset.poolTeamAction === "shift"
            ? "../bytesschema/" : "../laguppstallning/index.html");
          return;
        }

        if (t.dataset.poolId && t.dataset.lagNo) {
          sessionStorage.setItem("nsk2_pool_id", t.dataset.poolId || "");
          sessionStorage.setItem("nsk2_lag_nr", t.dataset.lagNo || "1");
          (window.NSKNavigate||((url)=>{(window.location||location).href=url;}))("../laguppstallning/index.html");
          return;
        }

        if (t.dataset.poolShifts && t.dataset.lagNo) {
          sessionStorage.setItem("nsk2_pool_id", t.dataset.poolShifts || "");
          sessionStorage.setItem("nsk2_lag_nr", t.dataset.lagNo || "1");
          (window.NSKNavigate||((url)=>{(window.location||location).href=url;}))("../bytesschema/");
          return;
        }

        if (t.dataset.startPoolId) {
          sessionStorage.setItem("nsk2_pool_id", t.dataset.startPoolId || "");
          sessionStorage.setItem("nsk2_match_no", "1");
          (window.NSKNavigate||((url)=>{(window.location||location).href=url;}))("../lag/");
          return;
        }

        if (t.dataset.activeLag && t.dataset.activePool) {
          sessionStorage.setItem("nsk2_pool_id", t.dataset.activePool || "");
          sessionStorage.setItem("nsk2_lag_nr", t.dataset.activeLag || "1");
          sessionStorage.setItem("nsk2_match_no", sessionStorage.getItem(`nsk2_team_match_${t.dataset.activePool}_${t.dataset.activeLag}`)||"1");
          (window.NSKNavigate||((url)=>{(window.location||location).href=url;}))("../bytesschema/");
          return;
        }

        if (t.dataset.shiftMatchCard) {
          const sel = byId("shiftMatch");
          if (sel) sel.value = String(t.dataset.shiftMatchCard);
          sessionStorage.setItem("nsk2_match_no", String(t.dataset.shiftMatchCard));
          setActiveShiftMatchButton(String(t.dataset.shiftMatchCard));
          await renderShiftSchema();
          return;
        }

        if (t.dataset.lagTeam) {
          if(!await flushLineupChanges())return;
          sessionStorage.setItem("nsk2_lag_nr", String(t.dataset.lagTeam));
          setActiveLagButton(String(t.dataset.lagTeam));
          await fillLaguppstallningFormFromSelection();
          return;
        }

        if (t.dataset.matchNo) {
          if(!await flushLineupChanges())return;
          const sel = byId("lineupMatch");
          if (sel) sel.value = String(t.dataset.matchNo);
          setActiveMatchButton(String(t.dataset.matchNo));
          await fillLaguppstallningFormFromSelection();
          return;
        }

        if (t.dataset.editPlayer || t.dataset.editCoach) {
          if (!document.body.classList.contains('nsk-roster-admin')) return;
          const input=t.closest('.person-row')?.querySelector('.inline-name-input');
          if(input&&!input.readOnly){input.focus();input.select();}
          return;
        }
        if (t.dataset.deletePlayer) {
          await deletePlayer(t.dataset.deletePlayer);
          return;
        }

        if (t.dataset.deleteCoach) {
          await deleteCoach(t.dataset.deleteCoach);
          return;
        }

        if (t.dataset.randomGoalie) {
          await randomizeGoalie();
          return;
        }

        if (t.dataset.shiftToggle) {
          await toggleShiftDone(t.dataset.shiftToggle);
          return;
        }
      } catch (err) {
        setText("appError", err?.message || String(err));
      }
    });

    document.addEventListener("input", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;

      if (t.dataset.inlinePlayer) {
        queueInlinePlayerSave(t.dataset.inlinePlayer, t.value);
      }
      if (t.dataset.inlineCoach) {
        queueInlineCoachSave(t.dataset.inlineCoach, t.value);
      }
    });

    document.addEventListener("blur", async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;

      try {
        if (t.dataset.inlinePlayer) {
          await flushInlinePlayerSave(t.dataset.inlinePlayer, t.value);
        }
        if (t.dataset.inlineCoach) {
          await flushInlineCoachSave(t.dataset.inlineCoach, t.value);
        }
      } catch (err) {
        setText("appError", err?.message || String(err));
      }
    }, true);
  }

  async function initStartsidaPage(viewData = null) {
    const box = byId("savedPoolsList");
    if (!box) return;
    if(!viewData && window.NSKViewCache){
      const view=await NSKViewCache.open('calendar-pools');
      if(view.data)await initStartsidaPage(view.data);
      try{
        const pools=await DB.listPools();
        let summaries;
        try{summaries=typeof DB.listPoolMatchSummaries==='function'
          ? await DB.listPoolMatchSummaries(pools.map(p=>p.id))
          : new Map(await Promise.all(pools.map(async p=>[String(p.id),await DB.listPoolTeamMatchConfigs(p.id)])));}
        catch(error){if(NSKViewCache.denied(error))throw error;summaries=new Map(pools.map(p=>[String(p.id),null]));}
        if(!view.current())return;
        const data={pools,summaries:[...summaries]};view.save(data);
        if(JSON.stringify(view.data)!==JSON.stringify(data))await initStartsidaPage(data);
      }catch(error){
        if(!view.current())return;
        if(NSKViewCache.denied(error)){NSKViewCache.clear();document.querySelectorAll('#activityList > details[data-pool-date]:not([data-svenskalag-pool])').forEach(n=>n.remove());box.replaceChildren();}
        setText('appError',view.data&&!NSKViewCache.denied(error)?'Visar senast hämtade uppgifter. Kunde inte uppdatera kalendern.':error.message);
      }
      return;
    }
    try {
      const pools = viewData?.pools || await DB.listPools();

      const today = new Date();
      const localToday = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const isArchived = (p) => p.active === false;
      // Normalize Baserow date values before sorting; keep every pool, including cancelled titles.
      const poolDay = p => {
        const raw = String(p.pool_date || '').trim();
        const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) return iso[1] + iso[2] + iso[3];
        const local = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
        if (local) return local[3] + local[2].padStart(2,'0') + local[1].padStart(2,'0');
        return '99999999';
      };
      const byDate = (a,b) => poolDay(a).localeCompare(poolDay(b)) || String(a.id).localeCompare(String(b.id));
      const upcoming = pools.filter(p => !isArchived(p)).sort(byDate);
      const archived = pools.filter(isArchived).sort((a,b) => -byDate(a,b));
      let matchSummaries;
      if(viewData){matchSummaries=new Map(viewData.summaries);}
      else if(typeof DB.listPoolMatchSummaries==='function'){
        try { matchSummaries=await DB.listPoolMatchSummaries(pools.map(p=>p.id)); }
        catch { matchSummaries=new Map(pools.map(p=>[String(p.id),null])); }
      }else{
        matchSummaries = new Map(await Promise.all(pools.map(async p => {
          try { return [String(p.id), await DB.listPoolTeamMatchConfigs(p.id)]; }
          catch { return [String(p.id), null]; }
        })));
      }
      const renderPools = (items) => items.map((p) => {
        const teams = safeInt(p.teams || "2", 2);
        const poolId = Number(p.id);
        const gathering=nskPoolGathering((matchSummaries.get(String(p.id))||[]).map(match=>match.start_time));
        const teamChoices = teams > 1 ? `
          <div class="nsk-pool-team-selector">
            <div class="nsk-pool-team-label">Välj lag</div>
            <div class="nsk-pool-team-options">${Array.from({ length: teams }, (_, i) => {
              const lagNo = i + 1;
              return `<button type="button" class="nsk-pool-team-choice${i === 0 ? " is-selected" : ""}" data-pool-team-choice="${lagNo}" aria-pressed="${i === 0 ? "true" : "false"}">Lag ${lagNo}</button>`;
            }).join("")}</div>
          </div>` : "";

        return `
          <details class="nsk-pool-row" data-view-key="pool:${poolId}" data-view-revision="${esc(JSON.stringify([p,matchSummaries.get(String(p.id))]))}" data-pool-date="${esc(poolDay(p))}" data-pool-finished="${isArchived(p)}">
            <summary class="nsk-pool-summary">
              <span class="nsk-pool-name">${esc([nskPoolWeekday(poolDay(p)),p.place || "Ort",p.pool_date || "Datum"].filter(Boolean).join(" • "))}</span>
              <span class="nsk-pool-hall" data-pool-hall-id="${poolId}" data-gathering="${esc(gathering)}">${esc([p.hall,gathering].filter(Boolean).join(" • "))}</span>
              <span class="nsk-pool-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div class="nsk-pool-content" data-selected-lag="1">
              ${teamChoices}
              ${(() => {
                const matches = matchSummaries.get(String(p.id));
                if (!matches) return '<div class="small">Matchuppgifter kunde inte hämtas.</div>';
                if (!matches.length) return '<div class="small">Inga matchuppgifter sparade ännu.</div>';
                return `<div class="nsk-pool-match-summary"><strong>Matcher</strong>${[...new Set(matches.map(m => Number(m.lag_no) || 1))].sort((a,b) => a-b).map(lagNo =>
                  `<div class="nsk-pool-match-team"><strong>Lag ${esc(lagNo)}</strong>${matches.filter(m => (Number(m.lag_no) || 1) === lagNo).map(m =>
                    `<div class="small nsk-pool-match-line"><span class="nsk-pool-match-number">Match ${esc(m.match_no)}</span> <span class="nsk-pool-match-time">${esc(!m.start_time || String(m.start_time).slice(0,5)==='00:00' ? 'Tid ej angiven' : String(m.start_time).slice(0,5))}</span> <span class="nsk-pool-match-opponent">${esc(m.opponent || 'Motståndare saknas')}</span></div>`
                  ).join('')}</div>`
                ).join('')}</div>`;
              })()}
              <div class="nsk-pool-grid">
                <button class="nsk-pool-function" type="button" data-pool-team-action="lineup" data-pool-action-id="${poolId}">
                  <span class="nsk-pool-function-icon" aria-hidden="true">♙</span>
                  <span>Laguppställning</span>
                </button>
                <button class="nsk-pool-function" type="button" data-pool-team-action="shift" data-pool-action-id="${poolId}">
                  <span class="nsk-pool-function-icon" aria-hidden="true">↻</span>
                  <span>Bytesschema</span>
                </button>
              </div>
              <div class="nsk-pool-actions">
                ${isArchived(p)||p.deleting?'':`<button class="start-pool-btn nsk-action nsk-action--primary nsk-action--wide" type="button" data-start-pool-id="${poolId}">Påbörja poolspel</button>`}
                <div class="nsk-pool-secondary-actions">
                  ${isArchived(p)||p.deleting?'':`<button class="row-btn nsk-action nsk-action--edit" type="button" data-edit-pool="${poolId}">Redigera</button>`}<button class="row-btn nsk-action" type="button" data-delete-pool="${poolId}">${p.deleting?'Fortsätt radering':'Ta bort'}</button>
                  <button class="row-btn nsk-action ${isArchived(p) ? "nsk-action--neutral" : "nsk-action--finish"}" type="button" data-pool-status-id="${poolId}" data-pool-status-next="${isArchived(p) ? "Aktiv" : "Avslutad"}">${isArchived(p) ? "Återöppna" : "Avsluta"}</button>
                </div>
              </div>
            </div>
          </details>
        `;
      }).join("");
      const oldRows=[...document.querySelectorAll('#activityList > details[data-pool-date]:not([data-svenskalag-pool])')];
      const scroller=document.querySelector('.arena-scroll')||document.scrollingElement,scrollTop=scroller?.scrollTop;
      const html = `
        <section class="pool-overview-section">
          <h2>Kommande poolspel (${upcoming.length})</h2>
          ${upcoming.length ? renderPools(upcoming) : '<div class="listrow">Inga kommande poolspel.</div>'}
        </section>
        <section class="pool-overview-section">
          <h2>Avslutade poolspel (${archived.length})</h2>
          ${archived.length ? renderPools(archived) : '<div class="listrow">Inga avslutade poolspel ännu.</div>'}
        </section>`;
      if(window.NSKViewCache)NSKViewCache.patch(box,html,oldRows);else{oldRows.forEach(row=>row.remove());box.innerHTML=html;}
      box.querySelectorAll('[data-selected-lag]').forEach(content=>{if(!content.querySelector('[data-pool-team-choice="'+content.dataset.selectedLag+'"]'))content.dataset.selectedLag='1';});
      window.dispatchEvent(new Event('nsk:saved-pools-rendered'));
      if(scroller&&Number.isFinite(scrollTop))scroller.scrollTop=scrollTop;
    } catch (err) {
      setText("appError", err?.message || String(err));
    }
  }

  async function initSkapaPoolspelPage() {
    if(new URLSearchParams(typeof window==='undefined'?'':window.location?.search||'').get("new")==="1"){sessionStorage.removeItem("nsk2_edit_pool_id");sessionStorage.removeItem("nsk2_pool_id");}
    const saveBtn = byId("savePool");
    const teamsSel = byId("teams");
    if (!saveBtn || !teamsSel) return;
    const interruptedImport=sessionStorage.getItem('nsk2_calendar_match_import_errors');
    const unconfirmedPoolKey=sessionStorage.getItem('nsk2_calendar_pool_import_key');
    const unconfirmedPoolPayload=sessionStorage.getItem('nsk2_calendar_pool_import_payload');
    if(unconfirmedPoolKey){
      if(!unconfirmedPoolPayload){
        setText('appError','En kalenderimport saknar sparat underlag. Inget nytt poolspel får skapas.');
      }else{
        try {
          const previous=JSON.parse(unconfirmedPoolPayload);
          const fields={poolPlace:previous.place,poolHall:previous.hall,poolDate:previous.pool_date,
            teams:previous.teams,matches:previous.matches,players:previous.players_on_field,
            periods:previous.periods,periodTime:previous.period_time,subTime:previous.sub_time};
          for(const [field,value] of Object.entries(fields)){
            const input=byId(field);
            if(!input || value==null)continue;
            if(input.tagName==='SELECT' && !Array.from(input.options).some(option=>String(option.value)===String(value)))
              input.add(new Option(String(value),String(value)));
            input.value=String(value);
          }
          setText('appError','Tidigare kalenderimport återupptas med samma importnyckel och poolspelsuppgifter.');
        }catch{
          setText('appError','Sparade uppgifter för en avbruten kalenderimport är ogiltiga. Inget nytt poolspel får skapas.');
        }
      }
    }
    if(interruptedImport){
      let poolId='';
      try {poolId=String(JSON.parse(interruptedImport)?.poolId||'');}catch{}
      setText('appError','En tidigare kalenderimport till poolspel '+(poolId||'(okänt ID)')+' är inte klar. Tryck Spara för att återuppta i samma poolspel; inget nytt poolspel skapas.');
    }

    const editId = sessionStorage.getItem("nsk2_edit_pool_id");

    if (!editId && !unconfirmedPoolKey) {
      if (byId("poolPlace")) byId("poolPlace").value = "";
      if (byId("poolHall")) byId("poolHall").value = "";
      if (byId("poolDate")) byId("poolDate").value = "";
    }

    if (!editId) {
      const draft=sessionStorage.getItem('nsk2_svenskalag_pool_draft');
      if(draft && (interruptedImport || unconfirmedPoolKey)){
        // Kassera det nyare utkastet så att det inte startas oavsiktligt vid nästa besök.
        // Den avbrutna importens matchunderlag behålls däremot oförändrat.
        sessionStorage.removeItem('nsk2_svenskalag_pool_draft');
        setText('appError','Slutför först den avbrutna kalenderimporten. Nytt kalenderutkast ignorerades.');
      } else if(draft){
        sessionStorage.removeItem('nsk2_svenskalag_pool_draft');
        try{
          const imported=JSON.parse(draft);
          if(/^20\d{2}-\d{2}-\d{2}$/.test(imported.date)){
            if(byId('poolDate'))byId('poolDate').value=imported.date;
            if(byId('poolPlace'))byId('poolPlace').value=String(imported.place||'').slice(0,120);
            if(byId('poolHall'))byId('poolHall').value=String(imported.hall||'').slice(0,120);
             // Samma testade matchfördelning används i kalenderförhandsvisningen.
             const {planCalendarMatches}=await import(new URL('calendar-match-plan.mjs',nskVersionRoot()).href);
             const plan=planCalendarMatches(imported.matches||[]);
             const calendarMatches=plan.schedule.map(m=>({startTime:m.start_time || '',opponent:m.opponent,plan:m.plan}));
             const count=calendarMatches.length;
             if(count)sessionStorage.setItem('nsk2_calendar_match_pending',JSON.stringify(calendarMatches));
             else sessionStorage.removeItem('nsk2_calendar_match_pending');
             const teamCount=plan.teams||1;
             const teamSelect=byId('teams');
             if(teamSelect){
               for(let n=teamSelect.options.length+1;n<=teamCount;n++)teamSelect.add(new Option(String(n),String(n)));
               teamSelect.value=String(teamCount);
             }
             const perTeamMatches=plan.matchesPerTeam;
             const matchesSelect=byId('matches');
             if(matchesSelect&&count){
               if(!Array.from(matchesSelect.options).some(option=>Number(option.value)===perTeamMatches)){
                 matchesSelect.add(new Option(String(perTeamMatches),String(perTeamMatches)));
               }
               matchesSelect.value=String(perTeamMatches);
             }
             const preview=byId('calendarPoolMatches');
             if(preview){
               preview.hidden=false;
               const heading=document.createElement('strong');
               heading.textContent=calendarMatches.length?'Matcher från SvenskaLag ('+calendarMatches.length+')':'Inga matchtider eller motståndare finns angivna i kalendern.';
               preview.append(heading);
               calendarMatches.forEach((match,index)=>{
                 const row=document.createElement('div');
                 const team=plan.schedule[index].lag_no;
                 row.textContent='Lag '+team+' • Match '+plan.schedule[index].match_no+' • '+(match.startTime || 'Tid ej angiven')+' – '+match.opponent;
                 preview.append(row);
               });
               const note=document.createElement('p');
               note.className='small';
               note.textContent='Högst två NSK-lag: 1–4 matcher ger ett lag, fler än fyra ger två. Matcherna fördelas i starttidsordning så jämnt som möjligt. Matchernas starttider och motståndare sparas när poolspelet skapas. Målvakt och spelare kan väljas senare.';
               preview.append(note);
             }
          }
        }catch{}
      }
    }
    if (editId) {
      try {
        const pool = await DB.getPool(editId);
        if (byId("poolPlace")) byId("poolPlace").value = pool.place || "";
        if (byId("poolHall")) byId("poolHall").value = pool.hall || "";
        if (byId("poolDate")) byId("poolDate").value = pool.pool_date || "";
        if (byId("teams")) byId("teams").value = String(pool.teams || 2);
        if (byId("matches")) byId("matches").value = String(pool.matches || 4);
        if (byId("players")) byId("players").value = String(pool.players_on_field || 3);
        if (byId("periods")) byId("periods").value = String(pool.periods || 1);
        if (byId("periodTime")) byId("periodTime").value = String(pool.period_time || 15);
        if (byId("subTime")) byId("subTime").value = String(pool.sub_time || 90);
      } catch (err) {
        setText("appError", err?.message || String(err));
      }
    }

    renderLaguppstallningButtons();
    teamsSel.addEventListener("change", () => renderLaguppstallningButtons());
    saveBtn.addEventListener("click", savePool);
    // En uttrycklig kalenderknapp får starta samma behörighetsstyrda, återupptagbara sparflöde.
    // Konsumera markören innan anropet så omladdning aldrig utlöser ett nytt försök.
    if(sessionStorage.getItem('nsk2_calendar_auto_save_once')==='1'){
      sessionStorage.removeItem('nsk2_calendar_auto_save_once');
      if(!editId && !interruptedImport && !unconfirmedPoolKey && sessionStorage.getItem('nsk2_calendar_match_pending')){
        await savePool();
      }else{
        setText('appError','Automatisk sparning avbröts. Kontrollera kalenderimporten och tryck Spara för att återuppta.');
      }
    }
  }

  function renderLaguppstallningButtons() {
    const teams = safeInt(byId("teams")?.value || "2", 2);
    const box = byId("lagButtons");
    if (!box) return;

    box.innerHTML = "";
    for (let i = 1; i <= teams; i++) {
      const btn = document.createElement("button");
      btn.className = "team-btn";
      btn.type = "button";
      btn.textContent = `Lag ${i}`;
      btn.addEventListener("click", () => {
        const saved=sessionStorage.getItem("nsk2_pool_id");
        if(!saved){setText("appError","Spara poolspelet innan du väljer lag.");return;}
        sessionStorage.setItem("nsk2_lag_nr", String(i));
        sessionStorage.removeItem("nsk2_lineup_from_create");
        (window.NSKNavigate||((url)=>{(window.location||location).href=url;}))("../laguppstallning/index.html");
      });
      box.appendChild(btn);
    }
  }

  // Vid ändring av spelregler måste lagrade bytesscheman ersättas.
  // Varje ersättning använder db.js batchrensning (flera Worker-anrop).
  async function updateAffectedShiftSchemas(poolId, pool) {
    const configs = await DB.listPoolTeamMatchConfigs(poolId);
    const targets = new Map();
    for (const c of configs) {
      if (Number(c.lag_no) <= Number(pool.teams) && Number(c.match_no) <= Number(pool.matches)) {
        targets.set(`${c.lag_no}:${c.match_no}`, [c.lag_no, c.match_no]);
      }
    }
    // Befintliga scheman kan även finnas för matcher som använder Match 1:s uppställning.
    // Regenerera bara sådana matcher där en uppställning faktiskt finns.
    const errors = [];
    for (const [lagNo, matchNo] of targets.values()) {
      try {
        const config = await DB.getPoolTeamMatchConfig(poolId, lagNo, matchNo);
        const source = config || (Number(matchNo) !== 1 ? await DB.getPoolTeamMatchConfig(poolId, lagNo, 1) : null);
        const lineup = source?.id ? await DB.getLineup(source.id) : [];
        if (!lineup.some(p => p.person_type === "player")) continue;
        await regenerateShiftSchemaFor(poolId, lagNo, matchNo);
      } catch (err) {
        errors.push(`Lag ${lagNo}, Match ${matchNo}: ${err?.message || String(err)}`);
      }
    }
    return errors;
  }

  async function savePool() {
    const saveButton = byId("savePool");
    if (saveButton?.disabled) return;
    try {
      const payload = {
        title: "Poolspel",
        place: byId("poolPlace")?.value?.trim() || "",
        hall: byId("poolHall")?.value?.trim() || "",
        pool_date: byId("poolDate")?.value || null,
        status: "Aktiv",
        teams: safeInt(byId("teams")?.value || "1", 1),
        matches: safeInt(byId("matches")?.value || "4", 4),
        players_on_field: safeInt(byId("players")?.value || "3", 3),
        periods: safeInt(byId("periods")?.value || "1", 1),
        period_time: safeInt(byId("periodTime")?.value || "15", 15),
        sub_time: safeInt(byId("subTime")?.value || "90", 90)
      };
      const editId = sessionStorage.getItem("nsk2_edit_pool_id");
      if(editId && sessionStorage.getItem('nsk2_calendar_match_import_errors'))
        throw new Error('Slutför den avbrutna kalenderimporten innan ett poolspel redigeras.');
      let changedRules = false;
      if (editId) {
        const previous = await DB.getPool(editId);
        if (!previous) throw new Error("Poolspelet kunde inte hittas. Ladda om sidan.");
        // Redigering av plats, datum eller spelregler får inte återaktivera ett avslutat poolspel.
        payload.status = previous.status || "Aktiv";
        const rules = ["players_on_field", "periods", "period_time", "sub_time"];
        changedRules = rules.some(k => Number(previous[k]) !== Number(payload[k]));
        // Kontrollera samtliga tidigare matcher innan några pooluppgifter sparas.
        // Även minskat antal lag/matcher får inte dölja redan genomförda byten.
        const changedStructure = ["teams", "matches"].some(k => Number(previous[k]) !== Number(payload[k]));
        if (changedRules || changedStructure) {
          if (typeof DB?.listShiftSchema !== "function") {
            throw new Error("Kan inte kontrollera genomförda byten. Inga ändringar sparades.");
          }
          for (let lagNo = 1; lagNo <= Number(previous.teams); lagNo++) {
            for (let matchNo = 1; matchNo <= Number(previous.matches); matchNo++) {
              const shifts = await DB.listShiftSchema(editId, lagNo, matchNo);
              if (shifts.some(shift => shift.done === true)) {
                throw new Error(
                  `Lag ${lagNo}, match ${matchNo} har genomförda byten. ` +
                  "Spelregler och antal lag/matcher kan därför inte ändras. " +
                  "Plats, ishall och datum kan fortfarande ändras. Inga ändringar sparades."
                );
              }
            }
          }
        }
        if (changedRules && !window.confirm(
          "Du har ändrat spelregler som påverkar bytesscheman. " +
          "Befintliga bytesscheman behöver uppdateras. " +
          "Scheman med genomförda byten får inte ändras. Fortsätta?"
        )) return;
      }
      if (saveButton) saveButton.disabled = true;
      try {
        if (editId) {
          await DB.updatePool(editId, payload);
          sessionStorage.setItem("nsk2_pool_id", editId);
          if (changedRules) {
            setText("poolMsg", "Poolspel sparat. Uppdaterar bytesscheman – vänta...");
            const errors = await updateAffectedShiftSchemas(editId, payload);
            if (errors.length) {
              throw new Error("Poolspel sparat, men vissa bytesscheman kunde inte uppdateras: " + errors.join("; ") + ". Försök inte ändra spelregler igen innan detta är åtgärdat.");
            }
          }
          sessionStorage.removeItem("nsk2_edit_pool_id");
        } else {
          const pending=sessionStorage.getItem('nsk2_calendar_match_pending');
          if(!pending && (sessionStorage.getItem('nsk2_calendar_pool_import_key') ||
              sessionStorage.getItem('nsk2_calendar_pool_import_payload')))
            throw new Error('Matchunderlaget för den pågående kalenderimporten saknas. Inget nytt poolspel skapas.');
          const retryRaw=sessionStorage.getItem('nsk2_calendar_match_import_errors');
          let retry=null, schedule=null, pool=null;
          if(retryRaw){
            try { retry=JSON.parse(retryRaw); } catch {}
            if(!retry || !Number.isSafeInteger(Number(retry.poolId)) || Number(retry.poolId)<=0)
              throw new Error('En äldre kalenderimport är ofullständig. Kontrollera den innan du skapar ett nytt poolspel.');
          }
          if(pending){
            try {
              const {planCalendarMatches}=await import(new URL('calendar-match-plan.mjs',nskVersionRoot()).href);
              schedule=planCalendarMatches(JSON.parse(pending));
            } catch {throw new Error('Kalenderimporten kunde inte läsas. Öppna poolspelet från kalendern igen.');}
            if(!schedule.schedule.length)
              throw new Error('Kalenderimporten saknar giltiga matcher. Öppna poolspelet från kalendern igen.');
            if(window.APP_CONFIG?.REQUIRE_PERSONAL_MATCH_WRITES!==true)
              throw new Error('Kalenderimporten är ännu inte aktiverad i produktionskonfigurationen. Inget poolspel har skapats.');
          }
          if(retry){
            // Ett sparat poolspel får aldrig skapas igen efter ett delvis misslyckat försök.
            if(!schedule)throw new Error('Matchunderlaget saknas för den tidigare importen. Skapa inte ett nytt poolspel.');
            pool=await DB.getPool(retry.poolId);
            if(!pool)throw new Error('Det tidigare poolspelet kunde inte verifieras. Ingen ny import utfördes.');
            if(schedule.teams!==Number(pool.teams) || schedule.matchesPerTeam>Number(pool.matches))
              throw new Error('Det befintliga poolspelet stämmer inte med kalendern. Ingen ändring gjordes.');
          } else {
            if(schedule && (schedule.teams!==payload.teams || schedule.matchesPerTeam>payload.matches))
              throw new Error('Antal lag eller matcher stämmer inte med kalenderimporten. Inget poolspel skapades.');
            let poolPayload=payload;
            if(schedule){
              let importKey=sessionStorage.getItem('nsk2_calendar_pool_import_key');
              const savedPayload=sessionStorage.getItem('nsk2_calendar_pool_import_payload');
              if(importKey && savedPayload){
                try {poolPayload=JSON.parse(savedPayload);} catch {throw new Error('Sparat poolspelsunderlag kan inte läsas. Ingen ny import gjordes.');}
                if(JSON.stringify(poolPayload)!==JSON.stringify(payload))
                  throw new Error('Poolspeluppgifterna har ändrats under avbruten import. Återställ de sparade uppgifterna innan nytt försök.');
              } else if(importKey || savedPayload) {
                throw new Error('Kalenderimportens återhämtningsuppgifter är ofullständiga. Skapa inte ett nytt poolspel.');
              } else {
                importKey=crypto.randomUUID();
                sessionStorage.setItem('nsk2_calendar_pool_import_key',importKey);
                sessionStorage.setItem('nsk2_calendar_pool_import_payload',JSON.stringify(payload));
              }
              poolPayload={...poolPayload,calendar_import_key:importKey};
            }
            pool=await DB.addPool(poolPayload);
            sessionStorage.setItem("nsk2_pool_id",pool.id);
            if(schedule){
              sessionStorage.setItem('nsk2_calendar_match_import_errors',JSON.stringify({poolId:String(pool.id),errors:['Importen pågår']}));
              sessionStorage.setItem('nsk2_calendar_match_schedule',JSON.stringify({poolId:String(pool.id),matches:JSON.parse(pending),teams:payload.teams}));
            }
          }
          sessionStorage.setItem("nsk2_pool_id",String(pool.id));
          if(schedule){
            const errors=[];
            const existing=await DB.listPoolTeamMatchConfigs(pool.id);
            for(const match of schedule.schedule){
              const saved=existing.filter(row=>Number(row.lag_no)===match.lag_no && Number(row.match_no)===match.match_no);
              if(saved.length>1){errors.push('Dubbletter finns för lag '+match.lag_no+', match '+match.match_no);continue;}
              if(saved.length===1){
                // Ett tidigare lyckat skrivsteg ska inte skrivas över eller skickas igen.
                const row=saved[0];
                if((String(row.start_time||'').slice(0,5)||null)===match.start_time &&
                   String(row.opponent||'').trim()===match.opponent.trim() &&
                   String(row.plan||'Plan 1')===String(match.plan||'Plan 1'))continue;
                errors.push('Befintlig match skiljer sig från kalendern för lag '+match.lag_no+', match '+match.match_no);
                continue;
              }
              try {
                await DB.saveCalendarMatchSchedule({pool_id:Number(pool.id),...match});
              } catch(error) {
                errors.push('Lag '+match.lag_no+', match '+match.match_no+': '+(error?.message||'Kunde inte spara'));
              }
            }
            if(errors.length){
              sessionStorage.setItem('nsk2_calendar_match_import_errors',JSON.stringify({poolId:String(pool.id),errors}));
              throw new Error('Poolspel '+pool.id+' finns redan. '+errors.join('; ')+'. Rätta felet och tryck Spara igen för att återuppta importen, utan att skapa nytt poolspel.');
            }
            sessionStorage.removeItem('nsk2_calendar_match_pending');
            sessionStorage.removeItem('nsk2_calendar_match_schedule');
            sessionStorage.removeItem('nsk2_calendar_match_import_errors');
            sessionStorage.removeItem('nsk2_calendar_pool_import_key');
            sessionStorage.removeItem('nsk2_calendar_pool_import_payload');
          }
        }
        setText("poolMsg", "Poolspel och berörda scheman sparade");
        const calendarParams=new URLSearchParams(window.location.search);
        const calendarAction=calendarParams.get('calendar_date')===payload.pool_date&&calendarParams.get('calendar_place')===payload.place?calendarParams.get('calendar_action'):null;
        const savedPoolId=sessionStorage.getItem('nsk2_pool_id');
        if(calendarAction==='finish'){
          sessionStorage.setItem('nsk2_edit_pool_id',savedPoolId);
          await DB.updatePoolActive(savedPoolId,false);
          sessionStorage.removeItem('nsk2_edit_pool_id');
        }
        if(['start','lineup','shift'].includes(calendarAction)){
          sessionStorage.setItem('nsk2_pool_id',savedPoolId);
          sessionStorage.setItem('nsk2_lag_nr','1');sessionStorage.setItem('nsk2_match_no','1');
          (window.NSKNavigate||((url)=>{(window.location||location).href=url;}))(calendarAction==='shift'?'../bytesschema/':calendarAction==='lineup'?'../laguppstallning/index.html':'../lag/');
        }else (window.NSKNavigate||((url)=>{(window.location||location).href=url;}))("../startsida/");
      } finally {
        if (saveButton) saveButton.disabled = false;
      }
    } catch (err) {
      setText("appError", err?.message || String(err));
    }
  }

  function renderLaguppstallningTeamButtons(teams) {
    const box = byId("laguppstallningTeamButtons");
    if (!box) return;
    box.innerHTML = "";

    for (let i = 1; i <= teams; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "team-btn lag-team-btn";
      btn.textContent = `Lag ${i}`;
      btn.dataset.lagTeam = String(i);
      box.appendChild(btn);
    }
  }

  function renderLaguppstallningMatchOptions(matches) {
    const sel = byId("lineupMatch");
    if (!sel) return;
    sel.innerHTML = "";
    for (let i = 1; i <= matches; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `Match ${i}`;
      sel.appendChild(opt);
    }
  }

  function renderMatchButtons(matches) {
    const box = byId("matchButtons");
    const hiddenSelect = byId("lineupMatch");
    if (!box || !hiddenSelect) return;

    box.innerHTML = "";
    for (let i = 1; i <= matches; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "team-btn match-btn";
      btn.textContent = `Match ${i}`;
      btn.dataset.matchNo = String(i);
      box.appendChild(btn);
    }
  }

  function setActiveLagButton(lagNo) {
    document.querySelectorAll(".lag-team-btn").forEach((btn) => {
      if (btn.dataset.lagTeam === String(lagNo)) btn.classList.add("active-team-btn");
      else btn.classList.remove("active-team-btn");
    });
  }

  function setActiveMatchButton(matchNo) {
    sessionStorage.setItem('nsk2_match_no',String(matchNo));
    sessionStorage.setItem('nsk2_lineup_match_'+sessionStorage.getItem('nsk2_pool_id')+'_'+(sessionStorage.getItem('nsk2_lag_nr')||'1'),String(matchNo));
    document.querySelectorAll(".match-btn").forEach((btn) => {
      if (btn.dataset.matchNo === String(matchNo)) btn.classList.add("active-team-btn");
      else btn.classList.remove("active-team-btn");
    });
  }

  function renderPlayerCountOptions(defaultCount) {
    const sel = byId("lineupPlayerCount");
    if (!sel) return;

    const current = safeInt(defaultCount || sel.value || "3", 3);
    sel.innerHTML = "";
    for (let i = 1; i <= 25; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      if (i === current) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  async function renderCoachOptions() {
    const coachSelect = byId("lineupCoach");
    if (!coachSelect) return;

    const coaches = typeof DB?.listCoaches === "function"
      ? await getCoachesCached()
      : [];

    coachSelect.innerHTML = "";

    if (!coaches.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Inga tränare";
      coachSelect.appendChild(opt);
      coachSelect.disabled = true;
      return;
    }

    coachSelect.disabled = false;
    coaches.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = String(c.id);
      opt.textContent = c.full_name;
      coachSelect.appendChild(opt);
    });
    coachSelect.dispatchEvent(new Event("lineup-coaches-refresh"));
  }

  async function getUsedPlayersInSameMatch(poolId, currentLagNo, matchNo) {
    const used = new Set();
    if (!poolId || typeof DB?.listPoolTeamMatchConfigs !== "function") return used;

    const rows = await DB.listPoolTeamMatchConfigs(poolId);

    for (const row of rows) {
      const sameMatch = String(row.match_no) === String(matchNo);
      const otherLag = String(row.lag_no) !== String(currentLagNo);
      if (!sameMatch || !otherLag) continue;

      const rowGoalieId = cleanUUID(row.goalie_player_id);
      if (rowGoalieId) used.add(String(rowGoalieId));

      if (row.id && typeof DB?.getLineup === "function") {
        const lineup = await DB.getLineup(row.id);
        lineup
          .filter((x) => x.person_type === "player")
          .forEach((x) => used.add(String(x.person_id)));
      }
    }

    return used;
  }

  async function renderLineupSelectors() {
    const box = byId("lineupSelectors");
    if (!box) return;

    try {
      const poolId = sessionStorage.getItem("nsk2_pool_id");
      const lagNo = sessionStorage.getItem("nsk2_lag_nr") || "1";
      const currentMatchNo = byId("lineupMatch")?.value || "1";

      // All squad members must remain available in every match. The match-specific
      // list may be stale/incomplete and otherwise makes a saved ID unselectable.
      const players = typeof DB?.listPlayers === "function" ? await getPlayersCached() : [];

      const usedSameMatchSet = poolId ? await getUsedPlayersInSameMatch(poolId, lagNo, currentMatchNo) : new Set();

      let matchRow = poolId && typeof DB?.getPoolTeamMatchConfig === "function"
        ? await DB.getPoolTeamMatchConfig(poolId, lagNo, currentMatchNo)
        : null;

      if (!matchRow && poolId && String(currentMatchNo) !== "1" && typeof DB?.getPoolTeamMatchConfig === "function") {
        matchRow = await DB.getPoolTeamMatchConfig(poolId, lagNo, 1);
      }

      if(sessionStorage.getItem('nsk2_pool_id')!==poolId||(sessionStorage.getItem('nsk2_lag_nr')||'1')!==lagNo||(byId('lineupMatch')?.value||'1')!==currentMatchNo)return;
      // Selection data is loaded once in fillLaguppstallningFormFromSelection.
      // Do not paint a corrupt saved lineup during selector construction.
      const lineup = [];

      const ownSet = new Set();
      const matchGoalieId = cleanUUID(matchRow?.goalie_player_id);
      if (matchGoalieId) ownSet.add(String(matchGoalieId));
      (lineup || [])
        .filter((x) => x.person_type === "player")
        .forEach((x) => ownSet.add(String(x.person_id)));

      const allowedPlayers = (players || []).filter((p) => {
        const pid = String(p.id);
        return !usedSameMatchSet.has(pid) || ownSet.has(pid);
      });

      const playerOptions = ['<option value="">Välj spelare</option>']
        .concat(allowedPlayers.map((p) => `<option value="${p.id}">${esc(p.full_name)}</option>`))
        .join("");

      let html = `
        <div class="goalie-row">
          <div class="goalie-col">
            <label for="lineupGoalie">Målvakt</label>
            <select id="lineupGoalie">${playerOptions}</select>
          </div>
          <div class="goalie-col goalie-random-col">
            <label>&nbsp;</label>
            <button type="button" class="row-btn nsk-action nsk-action--neutral" data-random-goalie="1">Slumpa</button>
          </div>
        </div>
      `;

      html += '<h3 class="lineup-player-heading">Spelare</h3>';
      for (let i = 1; i <= 25; i++) {
        html += `
          <label for="lineupPlayer${i}" data-player-label="${i}">Spelare ${i}</label>
          <select id="lineupPlayer${i}" data-player-select="${i}">${playerOptions}</select>
        `;
      }

      box.innerHTML = html;

      const goalieEl = byId("lineupGoalie");
      if (goalieEl) goalieEl.value = cleanUUID(matchRow?.goalie_player_id) || "";

      if (Array.isArray(lineup) && lineup.length) {
        const playerIds = lineup
          .filter((x) => x.person_type === "player")
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((x) => String(x.person_id));

        const coachIds = lineup
          .filter((x) => x.person_type === "coach")
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((x) => String(x.person_id));

        for (let i = 1; i <= 25; i++) {
          const el = byId(`lineupPlayer${i}`);
          if (el) el.value = playerIds[i - 1] || "";
        }

        const coachSelect = byId("lineupCoach");
        if (coachSelect) {
          Array.from(coachSelect.options).forEach((opt) => {
            opt.selected = coachIds.includes(String(opt.value));
          });
          coachSelect.dispatchEvent(new Event("lineup-coaches-refresh"));
        }
      }

      for(const field of box.querySelectorAll("select"))field.disabled=true;
      attachLineupHandlers();
      updateVisiblePlayers();
      syncGoalieAgainstPlayers();
      syncSelectedPlayersAcrossLineup();
      updateCoachEnabledState();
    } catch (err) {
      setText("appError", err?.message || String(err));
    }
  }

  function updateVisiblePlayers() {
    const countSel = byId("lineupPlayerCount");
    const count = safeInt(countSel?.value || "3", 3);

    for (let i = 1; i <= count; i++) {
      const label = document.querySelector(`[data-player-label="${i}"]`);
      const field = byId(`lineupPlayer${i}`);
      if (!field) continue;
      field.style.display = "";
      if (label) label.style.display = "";
    }

    for (let i = count + 1; i <= 25; i++) {
      const label = document.querySelector(`[data-player-label="${i}"]`);
      const field = byId(`lineupPlayer${i}`);
      if (!field) continue;
      field.style.display = "none";
      field.value = "";
      if (label) label.style.display = "none";
    }

    updateCoachEnabledState();
    syncGoalieAgainstPlayers();
    syncSelectedPlayersAcrossLineup();
  }

  let lineupPendingSnapshot=null,lineupSaveFailed=false,lineupIncomplete=false;
  function queueAutoSaveLineup() {
    clearTimeout(window.__nskLineupSaveTimer);
    lineupPendingSnapshot=captureLineupSnapshot();
    setText('lineupMsg','Ändringar väntar på att sparas…');
    window.__nskLineupSaveTimer=setTimeout(()=>{void flushLineupChanges();},350);
  }
  async function flushLineupChanges(){
    clearTimeout(window.__nskLineupSaveTimer);
    if(lineupPendingSnapshot){const snapshot=lineupPendingSnapshot;lineupPendingSnapshot=null;try{await saveLaguppstallningMatchConfig(false,snapshot);}catch(error){lineupSaveFailed=true;setText('appError',error.message);}}
    await Promise.all([lineupSaveChain,coachSaveChain]);
    return !lineupSaveFailed&&!lineupIncomplete&&!coachSaveFailed;
  }
  // Spara varje tränarändring omedelbart, oberoende av laguppställningens status.
  let coachSaveChain = Promise.resolve(),coachSaveFailed=false;
  function saveCoachSelectionImmediately() {
    const poolId = sessionStorage.getItem('nsk2_pool_id') || '';
    const lagNo = sessionStorage.getItem('nsk2_lag_nr') || '1';
    const matchNo = byId('lineupMatch')?.value || '1';
    const coachIds = Array.from(byId('lineupCoach')?.selectedOptions || []).map(o => Number(o.value)).filter(Number.isSafeInteger);
    if (!poolId) { setText('appError','Välj poolspel innan tränare sparas.'); return Promise.resolve(); }
    const stillSelected = () => sessionStorage.getItem('nsk2_pool_id') === poolId &&
      (sessionStorage.getItem('nsk2_lag_nr') || '1') === lagNo && (byId('lineupMatch')?.value || '1') === matchNo;
    const next = coachSaveChain.catch(() => {}).then(async () => {
      try {
        await DB.saveCoachSelection(poolId,lagNo,matchNo,coachIds);coachSaveFailed=false;
        if(stillSelected()) { setText('appError',''); setText('lineupMsg','Tränarval sparat för Match '+matchNo+'.'); }
      } catch(err) {
        coachSaveFailed=true;if(stillSelected()) setText('appError','Tränarval kunde inte sparas: '+(err?.message || String(err)));
      }
    });
    coachSaveChain = next;
    return next;
  }
  async function loadCoachSelectionFromKV(poolId,lagNo,matchNo) {
    if (!poolId || typeof DB?.getCoachSelection !== 'function') return;
    const result = await DB.getCoachSelection(poolId,lagNo,matchNo);
    // Äldre Baserow-val behålls tills något uttryckligen sparats i KV.
    if (!result.saved) return;
    if(sessionStorage.getItem('nsk2_pool_id') !== poolId ||
      (sessionStorage.getItem('nsk2_lag_nr') || '1') !== lagNo ||
      (byId('lineupMatch')?.value || '1') !== matchNo) return;
    const selected = new Set(result.coach_ids.map(String));
    const coachSelect=byId('lineupCoach');
    if (!coachSelect) return;
    Array.from(coachSelect.options).forEach(o => { o.selected=selected.has(String(o.value)); });
    coachSelect.dispatchEvent(new Event('lineup-coaches-refresh'));
  }

  function updateCoachEnabledState() {
    const coachSelect = byId("lineupCoach");
    if (!coachSelect) return;

    const goalie = cleanUUID(byId("lineupGoalie")?.value) || "";
    const count = safeInt(byId("lineupPlayerCount")?.value || "3", 3);

    let selectedPlayers = 0;
    for (let i = 1; i <= count; i++) {
      const v = cleanUUID(byId(`lineupPlayer${i}`)?.value);
      if (v) selectedPlayers++;
    }

    const enabled = !!goalie && selectedPlayers === count;
    coachSelect.disabled = false; // Tränare kan väljas även innan alla spelare är ifyllda.

    // Rensa inte tränarvalen vid tillfälligt ofullständig uppställning.
  }

  function getSelectedLineupPlayerIds() {
    const count = safeInt(byId("lineupPlayerCount")?.value || "3", 3);
    const ids = [];

    for (let i = 1; i <= count; i++) {
      const v = cleanUUID(byId(`lineupPlayer${i}`)?.value);
      if (v) ids.push(String(v));
    }

    return ids;
  }

  function syncSelectedPlayersAcrossLineup() {
    const goalieId = cleanUUID(byId("lineupGoalie")?.value) || "";
    const count = safeInt(byId("lineupPlayerCount")?.value || "3", 3);

    const selectedIds = new Set();
    if (goalieId) selectedIds.add(String(goalieId));

    for (let i = 1; i <= count; i++) {
      const v = cleanUUID(byId(`lineupPlayer${i}`)?.value);
      if (v) selectedIds.add(String(v));
    }

    for (let i = 1; i <= count; i++) {
      const sel = byId(`lineupPlayer${i}`);
      if (!sel) continue;

      const currentValue = sel.value;
      Array.from(sel.options).forEach((opt) => {
        if (!opt.value) {
          opt.hidden = false;
          opt.disabled = false;
          return;
        }

        const isOwnValue = String(opt.value) === String(currentValue);
        const isTaken = selectedIds.has(String(opt.value)) && !isOwnValue;
        opt.hidden = false;
        opt.disabled = isTaken;
      });
    }

    const goalieSel = byId("lineupGoalie");
    if (goalieSel) {
      const currentGoalie = goalieSel.value;

      Array.from(goalieSel.options).forEach((opt) => {
        if (!opt.value) {
          opt.hidden = false;
          opt.disabled = false;
          return;
        }

        let usedAsPlayer = false;
        for (let i = 1; i <= count; i++) {
          const v = cleanUUID(byId(`lineupPlayer${i}`)?.value);
          if (String(v || "") === String(opt.value)) {
            usedAsPlayer = true;
            break;
          }
        }

        const isOwnValue = String(opt.value) === String(currentGoalie);
        const isTaken = usedAsPlayer && !isOwnValue;
        opt.hidden = false;
        opt.disabled = isTaken;
      });
    }
  }

  function attachLineupHandlers() {
    const goalie = byId("lineupGoalie");
    if (goalie && !goalie.dataset.bound) {
      goalie.dataset.bound = "1";
      goalie.addEventListener("change", async () => {
        // The former goalie must be selectable as an outfield player.
        // Never automatically assign that player to the emptied position.
        const previousGoalieId = goalie.dataset.previousGoalieId || "";
        const nextGoalieId = goalie.value || "";
        const count = safeInt(byId("lineupPlayerCount")?.value || "3", 3);
        for (let i = 1; i <= count; i++) {
          const field = byId(`lineupPlayer${i}`);
          if (field && field.value === nextGoalieId) field.value = "";
        }
        if (previousGoalieId && previousGoalieId !== nextGoalieId) {
          const previousOption = Array.from(goalie.options).find(o => o.value === previousGoalieId);
          for (let i = 1; i <= count; i++) {
            const field = byId(`lineupPlayer${i}`);
            if (!field) continue;
            if (!Array.from(field.options).some(o => o.value === previousGoalieId) && previousOption) {
              field.add(new Option(previousOption.textContent, previousGoalieId));
            }
            const option = Array.from(field.options).find(o => o.value === previousGoalieId);
            if (option) { option.disabled = false; option.hidden = false; }
          }
        }
        goalie.dataset.previousGoalieId = nextGoalieId;
        syncGoalieAgainstPlayers();
        syncSelectedPlayersAcrossLineup();
        updateCoachEnabledState();
        queueAutoSaveLineup();
      });
    }

    for (let i = 1; i <= 25; i++) {
      const el = byId(`lineupPlayer${i}`);
      if (el && !el.dataset.bound) {
        el.dataset.bound = "1";
        el.addEventListener("change", async () => {
          syncGoalieAgainstPlayers();
          syncSelectedPlayersAcrossLineup();
          updateCoachEnabledState();
          queueAutoSaveLineup();
        });
      }
    }

    const coachSelect = byId("lineupCoach");
    if (coachSelect && !coachSelect.dataset.bound) {
      coachSelect.dataset.bound = "1";
      coachSelect.addEventListener("change", () => saveCoachSelectionImmediately());
    }

    const startTime = byId("lineupStartTime");
    if (startTime && !startTime.dataset.bound) {
      startTime.dataset.bound = "1";
      startTime.addEventListener("change", () => queueAutoSaveLineup());
    }

    const opponent = byId("lineupOpponent");
    if (opponent && !opponent.dataset.bound) {
      opponent.dataset.bound = "1";
      opponent.addEventListener("input", () => queueAutoSaveLineup());
    }

    const plan = byId("lineupPlan");
    if (plan && !plan.dataset.bound) {
      plan.dataset.bound = "1";
      plan.addEventListener("change", () => queueAutoSaveLineup());
    }

    const countSel = byId("lineupPlayerCount");
    if (countSel && !countSel.dataset.bound) {
      countSel.dataset.bound = "1";
      countSel.addEventListener("change", () => {
        updateVisiblePlayers();
        syncSelectedPlayersAcrossLineup();
        queueAutoSaveLineup();
      });
    }
  }

  function syncGoalieAgainstPlayers() {
    const goalieId = cleanUUID(byId("lineupGoalie")?.value) || "";
    const count = safeInt(byId("lineupPlayerCount")?.value || "3", 3);

    for (let i = 1; i <= count; i++) {
      const sel = byId(`lineupPlayer${i}`);
      if (!sel) continue;
      if (sel.value && String(sel.value) === String(goalieId)) {
        sel.value = "";
      }
    }

    syncSelectedPlayersAcrossLineup();
  }

  async function applyAutoCoach(playerIds) {
    if (typeof DB?.listPlayers !== "function" || typeof DB?.listCoaches !== "function" || typeof DB?.listPlayerCoachMap !== "function") {
      return;
    }

    const players = await getPlayersCached();
    const coaches = await getCoachesCached();
    const mappings = await getPlayerCoachMapCached();

    const playerMap = {};
    players.forEach((p) => { playerMap[String(p.id)] = p.full_name; });

    const coachMap = {};
    coaches.forEach((c) => { coachMap[normalizeCoachMapName(c.full_name)] = String(c.id); });

    const playerCoachMap = {};
    (mappings || []).forEach((m) => {
      const playerKey = normalizeCoachMapName(m.player_name);
      const coachKey = normalizeCoachMapName(m.coach_name);
      if (playerKey && coachKey) playerCoachMap[playerKey] = coachKey;
    });

    const autoCoachIds = new Set();
    (playerIds || []).forEach((pid) => {
      const playerName = normalizeCoachMapName(playerMap[String(pid)]);
      const coachName = playerCoachMap[playerName];
      if (coachName && coachMap[coachName]) {
        autoCoachIds.add(coachMap[coachName]);
      }
    });

    const coachSelect = byId("lineupCoach");
    if (!coachSelect) return;

    Array.from(coachSelect.options).forEach((opt) => {
      opt.selected = autoCoachIds.has(String(opt.value));
    });
  }

  async function applyAutoCoachFromCurrentSelection() {
    const count = safeInt(byId("lineupPlayerCount")?.value || "3", 3);
    const ids = [];

    const goalie = cleanUUID(byId("lineupGoalie")?.value) || "";
    if (goalie) ids.push(goalie);

    for (let i = 1; i <= count; i++) {
      const v = cleanUUID(byId(`lineupPlayer${i}`)?.value);
      if (v) ids.push(v);
    }

    await applyAutoCoach(ids);
    updateCoachEnabledState();
  }

  async function randomizeGoalie() {
    if (typeof DB?.listPlayers !== "function" || typeof DB?.listGoalieStats !== "function") return;

    const selectedPlayerIds = getSelectedLineupPlayerIds();
    const players = await getPlayersCached();
    const goalieStats = await DB.listGoalieStats();

    const statCount = {};
    players.forEach((p) => { statCount[p.full_name] = 0; });
    goalieStats.forEach((g) => {
      const n = String(g.goalie_name || "");
      statCount[n] = (statCount[n] || 0) + 1;
    });

    const candidates = players.filter((p) => !selectedPlayerIds.includes(String(p.id)));
    if (!candidates.length) {
      setText("lineupMsg", "Ingen spelare finns kvar att slumpa som målvakt.");
      return;
    }

    let min = Infinity;
    candidates.forEach((p) => {
      const c = statCount[p.full_name] ?? 0;
      if (c < min) min = c;
    });

    const lowest = candidates.filter((p) => (statCount[p.full_name] ?? 0) === min);
    const chosen = lowest.length === 1 ? lowest[0] : lowest[Math.floor(Math.random() * lowest.length)];

    const goalieSel = byId("lineupGoalie");
    if (goalieSel) goalieSel.value = String(chosen.id);

    syncGoalieAgainstPlayers();
    queueAutoSaveLineup();
    setText("lineupMsg", `Målvakt slumpad: ${chosen.full_name}`);
  }

  function renderPoolMaterial(data,poolId){
    const root=byId('poolEquipment');if(!root)return;root.replaceChildren();
    const chosen=new Set(data.staff_ids||[]),options=data.options||[];
    const names=options.filter(p=>chosen.has(p.id)).map(p=>p.name);
    setText('poolEquipmentNames',names.length?'Valda materialförvaltare: '+names.join(', '):data.legacy_name?'Tidigare val: '+data.legacy_name+'. Välj bland registrerade materialförvaltare.':'Inga materialförvaltare valda');
    if(!options.length){root.textContent='Inga materialförvaltare registrerade i Truppen.';return;}
    for(const person of options){const button=document.createElement('button');button.type='button';button.className='coach-choice'+(chosen.has(person.id)?' selected':'');button.textContent=person.name;button.dataset.materialStaff=person.id;button.setAttribute('aria-pressed',String(chosen.has(person.id)));button.disabled=window.__nskLineupClosed===true;
      button.onclick=()=>{const next=new Set(chosen);if(next.has(person.id))next.delete(person.id);else next.add(person.id);for(const item of root.querySelectorAll('button'))item.disabled=true;setText('poolEquipmentMsg','Sparar materialval…');coachSaveChain=coachSaveChain.catch(()=>{}).then(async()=>{try{const saved=await DB.savePoolMaterial(poolId,[...next],data.revision);coachSaveFailed=false;renderPoolMaterial({...data,...saved,legacy_name:''},poolId);byId('poolEquipmentReload').hidden=true;setText('poolEquipmentMsg','Materialval sparat för hela poolspelet.');}catch(error){coachSaveFailed=true;renderPoolMaterial(data,poolId);byId('poolEquipmentReload').hidden=false;setText('poolEquipmentMsg',error.message);}});};root.append(button);}
  }
  async function fillLaguppstallningFormFromSelection() {
    const loadGeneration=(window.__nskLineupLoadGeneration||0)+1;window.__nskLineupLoadGeneration=loadGeneration;
    const selectedNow=()=>loadGeneration===window.__nskLineupLoadGeneration;
    const loading=disabled=>{for(const field of (typeof document==='undefined'?null:document.querySelectorAll?.("#lineupSelectors select,#lineupCoach,#lineupStartTime,#lineupOpponent,#lineupPlan,#lineupPlayerCount,#lineupSaveButton,#poolEquipment,.coach-choice"))||[])field.disabled=disabled||window.__nskLineupClosed===true;};
    loading(true);
    clearTimeout(window.__nskLineupSaveTimer);
    const lagNo = sessionStorage.getItem("nsk2_lag_nr") || "1";
    const matchNo = byId("lineupMatch")?.value || "1";
    const poolId = sessionStorage.getItem("nsk2_pool_id") || "";

    const title = byId("laguppstallningTitle");
    if (title) title.textContent = `Lag ${lagNo} • Match ${matchNo}`;

    const fromCreate = sessionStorage.getItem("nsk2_lineup_from_create") === "1";
    if (fromCreate) {
      sessionStorage.removeItem("nsk2_lineup_from_create");

      if (byId("lineupStartTime")) byId("lineupStartTime").value = "";
      if (byId("lineupOpponent")) byId("lineupOpponent").value = "";
      if (byId("lineupPlan")) byId("lineupPlan").value = "Plan 1";
      if (byId("lineupGoalie")) byId("lineupGoalie").value = "";

      const coachSelect = byId("lineupCoach");
      if (coachSelect) {
        Array.from(coachSelect.options).forEach((opt) => { opt.selected = false; });
      }

      for (let i = 1; i <= 25; i++) {
        const el = byId(`lineupPlayer${i}`);
        if (el) el.value = "";
      }

      updateCoachEnabledState();
      syncSelectedPlayersAcrossLineup();
      return;
    }

    if (!poolId) return;

    try {
      const rowCurrent = typeof DB?.getPoolTeamMatchConfig === "function"
        ? await DB.getPoolTeamMatchConfig(poolId, lagNo, matchNo)
        : null;
      const row1 = (String(matchNo) !== "1" && typeof DB?.getPoolTeamMatchConfig === "function")
        ? await DB.getPoolTeamMatchConfig(poolId, lagNo, 1)
        : null;

      if(!selectedNow())return;
      const sourceRow = rowCurrent?.goalie_player_id ? rowCurrent : (row1 || rowCurrent);

      await renderCoachOptions();
      if(!selectedNow())return;loading(true);
      await renderLineupSelectors();
      if(!selectedNow())return;

      let importedMatch=null;
      try{
        const schedule=JSON.parse(sessionStorage.getItem('nsk2_calendar_match_schedule')||'null');
        if(schedule&&String(schedule.poolId)===String(poolId)&&Array.isArray(schedule.matches)){
          const perTeam=Math.ceil(schedule.matches.length/Math.max(1,Math.min(2,Number(schedule.teams)||1)));
          const index=(Number(lagNo)-1)*perTeam+Number(matchNo)-1;
          importedMatch=schedule.matches[index]||null;
        }
      }catch{}
      if (byId("lineupStartTime")) byId("lineupStartTime").value = rowCurrent?.start_time || importedMatch?.startTime || "";
      if (byId("lineupOpponent")) byId("lineupOpponent").value = rowCurrent?.opponent || importedMatch?.opponent || "";
      if (byId("lineupPlan")) byId("lineupPlan").value = rowCurrent?.plan || "Plan 1";
      if (byId("lineupPlayerCount")) {
        byId("lineupPlayerCount").value = String(
          rowCurrent?.player_count || sourceRow?.player_count || byId("lineupPlayerCount")?.value || "3"
        );
      }

      updateVisiblePlayers();
      setActiveMatchButton(matchNo);

      if (byId("lineupGoalie")) {
        byId("lineupGoalie").value = cleanUUID(rowCurrent?.goalie_player_id) || cleanUUID(sourceRow?.goalie_player_id) || "";
      }

      let lineup = [];
      if (rowCurrent?.id && typeof DB?.getLineup === "function") {
        lineup = await DB.getLineup(rowCurrent.id);
        // Older failed saves left duplicate rows. The Worker now updates the
        // oldest row per position; ignore surplus rows when displaying.
        const byPosition = new Map();
        for (const entry of [...lineup].sort((a, b) => Number(a.id) - Number(b.id))) {
          const key = `${entry.person_type}:${entry.sort_order}`;
          if (!byPosition.has(key)) byPosition.set(key, entry);
        }
        lineup = [...byPosition.values()];
      }

      // A saved lineup is valid only if all requested positions have distinct IDs.
      // Old failed writes can leave 7 identical entries (or only one entry).
      const expectedCount = safeInt(byId("lineupPlayerCount")?.value || "3", 3);
      const isValidLineup = (entries) => {
        const ids = (entries || []).filter(x => x.person_type === "player")
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map(x => String(x.person_id));
        return ids.length === expectedCount && new Set(ids).size === expectedCount &&
          ids.every(id => id && id !== "0");
      };
      if(!selectedNow())return;
      const savedEmptyDraft = false;
      if (String(matchNo) !== "1" && !savedEmptyDraft && !isValidLineup(lineup)) {
        const baseLineup = row1?.id && typeof DB?.getLineup === "function"
          ? await DB.getLineup(row1.id) : [];
        if(!selectedNow())return;
        if (isValidLineup(baseLineup)) {
          if(!selectedNow())return;
          lineup = baseLineup;
          setText("lineupMsg", "Uppställning hämtad från Match 1. Tryck Spara för att använda den i Match " + matchNo + ".");
        } else {
          lineup = [];
          setText("appError", "Kunde inte kopiera en fullständig uppställning från Match 1. Inga ändringar sparades.");
        }
      }

      if (lineup?.length) {
        const playerIds = lineup
          .filter((x) => x.person_type === "player")
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((x) => String(x.person_id));

        const coachIds = lineup
          .filter((x) => x.person_type === "coach")
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((x) => String(x.person_id));

        const coachSelect = byId("lineupCoach");
        if (coachSelect) {
          Array.from(coachSelect.options).forEach((opt) => {
            opt.selected = coachIds.includes(String(opt.value));
          });
          coachSelect.dispatchEvent(new Event("lineup-coaches-refresh"));
        }

        for (let i = 1; i <= 25; i++) {
          const el = byId(`lineupPlayer${i}`);
          if (el) el.value = playerIds[i - 1] || "";
        }
      } else {
        const coachSelect = byId("lineupCoach");
        if (coachSelect) {
          Array.from(coachSelect.options).forEach((opt) => {
            opt.selected = false;
          });
          coachSelect.dispatchEvent(new Event("lineup-coaches-refresh"));
        }

        for (let i = 1; i <= 25; i++) {
          const el = byId(`lineupPlayer${i}`);
          if (el) el.value = "";
        }
      }

      syncGoalieAgainstPlayers();
      syncSelectedPlayersAcrossLineup();
      if (byId("lineupGoalie")) {
        byId("lineupGoalie").dataset.previousGoalieId = byId("lineupGoalie").value || "";
      }
      // KV är primär källa för tränarval; Baserow är fallback för äldre matcher.
      try { await loadCoachSelectionFromKV(poolId,lagNo,matchNo); }
      catch(err) { setText('appError','Kunde inte hämta tränarval: '+(err?.message || String(err))); }
      updateCoachEnabledState();

      if(byId('poolEquipment')&&DB.getPoolMaterial){const selected=await DB.getPoolMaterial(poolId);if(!selectedNow())return;renderPoolMaterial(selected,poolId);}
      loading(false);
      // Do not auto-save when merely opening another match. Save on user changes.

    } catch (err) {
      if(selectedNow()){loading(false);setText("appError", err?.message || String(err));}
    }
  }

  async function validateUniquePlayersPerMatch(poolId, lagNo, matchNo, goalieId, playerIds) {
    if (typeof DB?.listPoolTeamMatchConfigs !== "function") return "";

    const rows = await DB.listPoolTeamMatchConfigs(poolId);

    for (const row of rows) {
      const sameMatch = String(row.match_no) === String(matchNo);
      const otherLag = String(row.lag_no) !== String(lagNo);
      if (!sameMatch || !otherLag) continue;

      const taken = new Set();
      const rowGoalieId = cleanUUID(row.goalie_player_id);
      if (rowGoalieId) taken.add(String(rowGoalieId));

      const lineup = row.id && typeof DB?.getLineup === "function" ? await DB.getLineup(row.id) : [];
      lineup
        .filter((x) => x.person_type === "player")
        .forEach((x) => taken.add(String(x.person_id)));

      if (goalieId && taken.has(String(goalieId))) {
        return "Vald målvakt används redan i ett annat lag i samma match.";
      }

      for (const pid of playerIds) {
        if (taken.has(String(pid))) {
          return "En vald spelare används redan i ett annat lag i samma match.";
        }
      }
    }

    return "";
  }

  function buildShiftSchedule({ matchNo, playerIds, playersOnField, periods, periodTime, subTime }) {
    const shifts = [];
    if (!playerIds || !playerIds.length) return shifts;

    const totalSeconds = periodTime * 60;
    const shiftCountPerPeriod = Math.max(1, Math.ceil(totalSeconds / subTime));
    const totalShifts = periods * shiftCountPerPeriod;

    const ids = [...playerIds];
    const playerCount = ids.length;
    const onField = Math.min(safeInt(playersOnField, 0), playerCount);
    if (onField <= 0) return shifts;

    let startIndex = ((Math.max(1, safeInt(matchNo, 1)) - 1) * onField) % playerCount;

    const appearances = {};
    ids.forEach((id) => { appearances[String(id)] = 0; });

    let previousLine = [];

    function sameLine(a, b) {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      if (a.length !== b.length) return false;
      const aa = [...a].map(String).sort();
      const bb = [...b].map(String).sort();
      for (let i = 0; i < aa.length; i++) {
        if (aa[i] !== bb[i]) return false;
      }
      return true;
    }

    for (let shiftIndex = 0; shiftIndex < totalShifts; shiftIndex++) {
      const periodNo = Math.floor(shiftIndex / shiftCountPerPeriod) + 1;
      const shiftInPeriod = shiftIndex % shiftCountPerPeriod;
      const elapsed = shiftInPeriod * subTime;
      const left = Math.max(0, totalSeconds - elapsed);
      const mm = String(Math.floor(left / 60)).padStart(2, "0");
      const ss = String(left % 60).padStart(2, "0");

      const rotated = [];
      for (let i = 0; i < playerCount; i++) {
        rotated.push(ids[(startIndex + i) % playerCount]);
      }

      rotated.sort((a, b) => {
        const diff = appearances[String(a)] - appearances[String(b)];
        if (diff !== 0) return diff;
        return 0;
      });

      let line = rotated.slice(0, onField);

      if (sameLine(line, previousLine)) {
        const bench = rotated.slice(onField);
        if (bench.length > 0) {
          let replaceIndex = 0;
          let maxAppearances = -1;
          for (let i = 0; i < line.length; i++) {
            const count = appearances[String(line[i])] || 0;
            if (count > maxAppearances) {
              maxAppearances = count;
              replaceIndex = i;
            }
          }
          line[replaceIndex] = bench[0];
        } else if (line.length > 1) {
          const first = line.shift();
          line.push(first);
        }
      }

      line.forEach((id) => { appearances[String(id)] += 1; });

      shifts.push({
        period_no: periodNo,
        time_left: `${mm}:${ss}`,
        players: [...line]
      });

      previousLine = [...line];
      startIndex = (startIndex + onField) % playerCount;
    }

    return shifts;
  }

  async function regenerateShiftSchemaFor(poolId, lagNo, matchNo) {
    if (typeof DB?.getPool !== "function") return [];
    const pool = await DB.getPool(poolId);

    let row = typeof DB?.getPoolTeamMatchConfig === "function"
      ? await DB.getPoolTeamMatchConfig(poolId, lagNo, matchNo)
      : null;
    let sourceRow = row;

    if (!sourceRow && String(matchNo) !== "1" && typeof DB?.getPoolTeamMatchConfig === "function") {
      sourceRow = await DB.getPoolTeamMatchConfig(poolId, lagNo, 1);
    }

    if (!sourceRow?.id) return [];

    let lineup = [];
    if (typeof DB?.getLineup === "function") {
      lineup = await DB.getLineup(sourceRow.id);
    }

    // En spelare får bara förekomma en gång i ett byte.
    // Dubbla laguppställningsrader får inte skapa [7, 7, 7].
    const playerIds = [...new Set(lineup
      .filter((x) => x.person_type === "player")
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((x) => String(x.person_id))
      .filter((id) => /^\d+$/.test(id) && Number(id) > 0))];

    if (playerIds.length < Math.max(1, safeInt(pool?.players_on_field || 3, 3))) {
      throw new Error(`Laguppställningen innehåller bara ${playerIds.length} unika spelare, men ${safeInt(pool?.players_on_field || 3, 3)} krävs på planen. Kontrollera laguppställningen innan du återskapar. Inga byten har ändrats.`);
    }

    if (!playerIds.length) {
      if (typeof DB?.deleteShiftSchema === "function") {
        await DB.deleteShiftSchema(poolId, lagNo, matchNo);
      }
      return [];
    }

    const shifts = buildShiftSchedule({
      matchNo: safeInt(matchNo, 1),
      playerIds,
      playersOnField: safeInt(pool?.players_on_field || 3, 3),
      periods: safeInt(pool?.periods || 1, 1),
      periodTime: safeInt(pool?.period_time || 15, 15),
      subTime: safeInt(pool?.sub_time || 90, 90)
    });

    if (typeof DB?.saveShiftSchema === "function") {
      await DB.saveShiftSchema(poolId, lagNo, matchNo, shifts);
    }
    return shifts;
  }

  // Capture the selected match and fields before entering the write queue.
  // Never read another match's controls from a delayed queued save.
  let lineupSaveChain = Promise.resolve();
  function captureLineupSnapshot() {
    const snapshot = {
      poolId: sessionStorage.getItem("nsk2_pool_id") || "",
      lagNo: sessionStorage.getItem("nsk2_lag_nr") || "1",
      matchNo: byId("lineupMatch")?.value || "1",
      goalie: cleanUUID(byId("lineupGoalie")?.value),
      playerCount: safeInt(byId("lineupPlayerCount")?.value || "3", 3),
      players: [],
      coachIds: Array.from(byId("lineupCoach")?.selectedOptions || []).map(o => String(o.value)).filter(Boolean),
      startTime: byId("lineupStartTime")?.value || null,
      opponent: byId("lineupOpponent")?.value?.trim() || "",
      plan: byId("lineupPlan")?.value || "Plan 1"
    };
    for (let i = 1; i <= snapshot.playerCount; i++) {
      snapshot.players.push(cleanUUID(byId(`lineupPlayer${i}`)?.value));
    }
    return snapshot;
  }
  function saveLaguppstallningMatchConfig(silent = false, snapshot=captureLineupSnapshot()) {
    const next = lineupSaveChain.catch(() => {}).then(() =>
      saveLaguppstallningMatchConfigInternal(silent, snapshot)
    );
    lineupSaveChain = next.catch(() => {});
    return next;
  }

  async function saveLaguppstallningMatchConfigInternal(silent = false, snapshot) {
    const {poolId, lagNo, matchNo, goalie, playerCount} = snapshot;
    const stillSelected = () =>
      sessionStorage.getItem("nsk2_pool_id") === poolId &&
      (sessionStorage.getItem("nsk2_lag_nr") || "1") === lagNo &&
      (byId("lineupMatch")?.value || "1") === matchNo;
    const message = (id, value) => { if (stillSelected()) setText(id, value); };
    lineupIncomplete=false;
    if (!poolId) { lineupIncomplete=true;if (!silent) message("appError", "Saknar valt poolspel."); return; }
    const selectedPlayers = snapshot.players.filter(Boolean);
    const emptyDraft = !goalie && selectedPlayers.length === 0;

    if (selectedPlayers.includes(goalie)) { lineupIncomplete=true;message("lineupMsg", "Målvakt kan inte vara samma som spelare."); return; }
    if (new Set(selectedPlayers).size !== selectedPlayers.length) {
      lineupIncomplete=true;message("lineupMsg", "En spelare kan bara väljas en gång."); return;
    }
    if (!emptyDraft && (!goalie||selectedPlayers.length !== playerCount)) {
      lineupIncomplete=true;
      try{await DB.saveMatchInfo({pool_id:Number(poolId),lag_no:Number(lagNo),match_no:Number(matchNo),start_time:snapshot.startTime,opponent:snapshot.opponent,plan:snapshot.plan});message('appError','');}catch(error){lineupSaveFailed=true;message('appError',error.message);}
      message("lineupMsg", "Matchinfo sparas separat. Fyll alla spelarplatser innan du går vidare."); return;
    }
    try {
      const poolConflict = await validateUniquePlayersPerMatch(poolId, lagNo, matchNo, goalie, selectedPlayers);
      if (poolConflict) { lineupIncomplete=true;message("lineupMsg", poolConflict); return; }
      // Do not update controls after an asynchronous wait: another match may be open.
      // Spara de tränare som faktiskt markerats, inte en ny automatisk beräkning.
      const coachIds = [...new Set(snapshot.coachIds)];
      const played=DB.listShiftSchema?await DB.listShiftSchema(poolId,lagNo,matchNo):[];
      if(played.some(r=>r.done)){
        const current=await DB.getPoolTeamMatchConfig(poolId,lagNo,matchNo),entries=current?.id?await DB.getLineup(current.id):[];
        const ids=entries.filter(r=>r.person_type==='player').sort((a,b)=>a.sort_order-b.sort_order).map(r=>String(r.person_id));
        if(String(current?.goalie_player_id)!==String(goalie)||JSON.stringify(ids)!==JSON.stringify(selectedPlayers))throw Error('Matchen har genomförda byten. Uppställningen är låst.');
        await DB.saveMatchInfo({pool_id:Number(poolId),lag_no:Number(lagNo),match_no:Number(matchNo),start_time:snapshot.startTime,opponent:snapshot.opponent,plan:snapshot.plan});lineupSaveFailed=false;message('appError','');message('lineupMsg','Matchinfo sparad. Spelarna är låsta efter matchstart.');return;
      }
      const matchConfig = {
        pool_id: Number(poolId), lag_no: Number(lagNo), match_no: Number(matchNo),
        start_time: snapshot.startTime, opponent: snapshot.opponent, plan: snapshot.plan,
        player_count: emptyDraft ? null : playerCount, goalie_player_id: emptyDraft ? null : Number(goalie),
        players_on_field: emptyDraft ? [] : [goalie, ...selectedPlayers].map(Number)
      };
      if(DB.saveFullLineup)await DB.saveFullLineup(matchConfig,selectedPlayers.map(Number),coachIds.map(Number));
      else{const matchRow=await DB.savePoolTeamMatchConfig(matchConfig);await DB.saveLineup(matchRow.id,selectedPlayers.map(Number),coachIds.map(Number));}
      if(!emptyDraft)await regenerateShiftSchemaFor(poolId,lagNo,matchNo);else if(played.length&&DB.deleteShiftSchema)await DB.deleteShiftSchema(poolId,lagNo,matchNo);
      lineupSaveFailed=false;
      if(String(matchNo)==='1'&&!emptyDraft){
        const pool=await DB.getPool(poolId);
        const plan=DB.listPoolMatchPlan?await DB.listPoolMatchPlan(poolId):Array.from({length:Number(pool.matches)},(_,i)=>({lag_no:Number(lagNo),match_no:i+1}));
        for(const item of plan.filter(r=>Number(r.lag_no)===Number(lagNo)&&Number(r.match_no)>1)){const n=Number(item.match_no);
          const target=await DB.getPoolTeamMatchConfig(poolId,lagNo,n);
          const existing=target?.id?await DB.getLineup(target.id):[];
          const shifts=await DB.listShiftSchema(poolId,lagNo,n);
          if(existing.some(x=>x.person_type==='player')||target?.goalie_player_id||shifts.some(x=>x.done))continue;
          const conflict=await validateUniquePlayersPerMatch(poolId,lagNo,String(n),goalie,selectedPlayers);if(conflict)throw Error('Match '+n+': '+conflict);
          const copyConfig={pool_id:Number(poolId),lag_no:Number(lagNo),match_no:n,start_time:target?.start_time||null,opponent:target?.opponent||'',plan:target?.plan||'Plan 1',player_count:playerCount,goalie_player_id:Number(goalie),players_on_field:[goalie,...selectedPlayers].map(Number)};
          if(DB.saveFullLineup)await DB.saveFullLineup(copyConfig,selectedPlayers.map(Number),coachIds.map(Number));else{const copied=await DB.savePoolTeamMatchConfig(copyConfig);await DB.saveLineup(copied.id,selectedPlayers.map(Number),coachIds.map(Number));}
          await DB.saveCoachSelection(poolId,lagNo,String(n),coachIds.map(Number));
          await regenerateShiftSchemaFor(poolId,lagNo,String(n));
        }
      }
      message("appError", "");
      message("lineupMsg", "Laguppställning sparad för Match " + matchNo + ".");
    } catch (err) {
      lineupSaveFailed=true;message("appError", "Sparningen blev inte klar. Dina val finns kvar. Tryck Spara igen. "+(err?.message || String(err)));
    }
  }

  async function initLaguppstallningPage() {
    const teamButtonsBox = byId("laguppstallningTeamButtons");
    const matchSelect = byId("lineupMatch");
    const lineupBox = byId("lineupSelectors");
    const coachSelect = byId("lineupCoach");

    if (!teamButtonsBox || !matchSelect || !lineupBox || !coachSelect) return;

    byId('poolEquipmentReload')?.addEventListener('click',async()=>{try{const poolId=sessionStorage.getItem('nsk2_pool_id'),data=await DB.getPoolMaterial(poolId);renderPoolMaterial(data,poolId);coachSaveFailed=false;byId('poolEquipmentReload').hidden=true;setText('poolEquipmentMsg','Materialval hämtat.');}catch(error){setText('poolEquipmentMsg',error.message);}});
    byId("lineupSaveButton")?.addEventListener("click",async()=>{lineupPendingSnapshot=captureLineupSnapshot();await flushLineupChanges();});
    try {
      const poolId = sessionStorage.getItem("nsk2_pool_id");
      let teams = 2;
      let matches = 4;
      let playersOnField = 3;

      if (poolId && typeof DB?.getPool === "function") {
        const pool = await DB.getPool(poolId);
        teams = safeInt(pool?.teams || "2", 2);
        matches = safeInt(pool?.matches || "4", 4);
        playersOnField = safeInt(pool?.players_on_field || "3", 3);
        window.__nskLineupClosed=pool?.active===false;
      }

      await Promise.all([
        typeof DB?.listPlayers === "function" ? getPlayersCached() : Promise.resolve([]),
        typeof DB?.listCoaches === "function" ? getCoachesCached() : Promise.resolve([]),
        typeof DB?.listPlayerCoachMap === "function" ? getPlayerCoachMapCached() : Promise.resolve([])
      ]);

      renderLaguppstallningTeamButtons(teams);
      renderLaguppstallningMatchOptions(matches);
      const rememberedMatch=sessionStorage.getItem('nsk2_lineup_match_'+poolId+'_'+(sessionStorage.getItem('nsk2_lag_nr')||'1'))||sessionStorage.getItem('nsk2_match_no')||'1';
      if(Number(rememberedMatch)>=1&&Number(rememberedMatch)<=matches)matchSelect.value=rememberedMatch;
      renderMatchButtons(matches);
      renderPlayerCountOptions(playersOnField);

      const savedLag = sessionStorage.getItem("nsk2_lag_nr") || "1";
      setActiveLagButton(savedLag);
      const currentMatch = byId("lineupMatch")?.value || "1";
      setActiveMatchButton(currentMatch);

      updateVisiblePlayers();
      attachLineupHandlers();
      updateCoachEnabledState();
      await fillLaguppstallningFormFromSelection();
      if(window.__nskLineupClosed)setText("lineupMsg","Poolspelet är avslutat. Återöppna det i kalendern för att ändra.");

      if (!matchSelect.dataset.bound) {
        matchSelect.dataset.bound = "1";
        matchSelect.addEventListener("change", async () => {
          if(!await flushLineupChanges())return;
          setActiveMatchButton(matchSelect.value || "1");
          await fillLaguppstallningFormFromSelection();
        });
      }
    } catch (err) {
      setText("appError", err?.message || String(err));
    }
  }

  function renderShiftTeamButtons(teams) {
    const box = byId("shiftTeamButtons");
    if (!box) return;
    box.innerHTML = "";

    for (let i = 1; i <= teams; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "team-btn lag-team-btn";
      btn.textContent = `Lag ${i}`;
      btn.dataset.shiftLag = String(i);
      btn.addEventListener("click", async () => {
        sessionStorage.setItem("nsk2_lag_nr", String(i));
        const saved=sessionStorage.getItem(`nsk2_team_match_${sessionStorage.getItem('nsk2_pool_id')}_${i}`)||'1';
        const selector=byId('shiftMatch');if(selector&&Array.from(selector.options).some(o=>o.value===saved))selector.value=saved;
        setActiveShiftTeamButton(String(i));
        await renderShiftSchema();
      });
      box.appendChild(btn);
    }
  }

  function setActiveShiftTeamButton(lagNo) {
    document.querySelectorAll("[data-shift-lag]").forEach((btn) => {
      if (btn.dataset.shiftLag === String(lagNo)) btn.classList.add("active-team-btn");
      else btn.classList.remove("active-team-btn");
    });
  }

  function renderShiftMatchList(matches) {
    const box = byId("shiftMatchList");
    if (!box) return;
    box.innerHTML = "";

    for (let i = 1; i <= matches; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "match-list-item";
      btn.dataset.shiftMatchCard = String(i);
      btn.innerHTML = `<div class="match-list-title">Match ${i}</div><div class="match-list-sub">Visa bytesschema</div>`;
      box.appendChild(btn);
    }
  }

  function renderShiftMatchOptions(matches) {
    const sel = byId("shiftMatch");
    if (!sel) return;
    sel.innerHTML = "";
    for (let i = 1; i <= matches; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `Match ${i}`;
      sel.appendChild(opt);
    }
  }

  function setActiveShiftMatchButton(matchNo) {
    document.querySelectorAll("[data-shift-match-card]").forEach((btn) => {
      if (btn.dataset.shiftMatchCard === String(matchNo)) btn.classList.add("active-team-btn");
      else btn.classList.remove("active-team-btn");
    });
  }

  let shiftToggleSaving = false;
  const shiftPending=new Set();
  let shiftRefreshBusy = false;
  let shiftViewGeneration = 0;

  async function toggleShiftDone(shiftNo) {
    const poolId = sessionStorage.getItem("nsk2_pool_id");
    const lagNo = sessionStorage.getItem("nsk2_lag_nr") || "1";
    const matchNo = byId("shiftMatch")?.value || "1";

    const el = document.querySelector(`[data-shift-toggle="${shiftNo}"]`);
    const key=[poolId,lagNo,matchNo,shiftNo].join(":");
    if (!el || !poolId || shiftPending.has(key)) return;
    shiftPending.add(key);shiftToggleSaving = true;
    el.disabled=true;el.setAttribute("aria-busy","true");setText("shiftMsg","Sparar byte "+shiftNo+"…");

    const nextDone = !el.classList.contains("done");
    el.classList.toggle("done", nextDone);

    try {
      await DB.setShiftDone(poolId, lagNo, matchNo, shiftNo, nextDone);
      el.setAttribute("aria-pressed",String(nextDone));el.textContent=nextDone?"✓":"";setText("shiftMsg","Byte "+shiftNo+" sparat.");
    } catch (err) {
      el.classList.toggle("done", !nextDone);
      setText("appError", err?.message || String(err));
    } finally {
      shiftPending.delete(key);shiftToggleSaving=shiftPending.size>0;el.disabled=false;el.removeAttribute("aria-busy");
    }
  }

  // Synkronisera enbart avbockningarna. Bygg inte om tabellen under match.
  async function refreshShiftDoneMarks() {
    if (document.hidden || window.NSKShellActive===false || shiftRefreshBusy || shiftToggleSaving || !byId("shiftTableWrap")) return;
    const poolId = sessionStorage.getItem("nsk2_pool_id");
    const lagNo = sessionStorage.getItem("nsk2_lag_nr") || "1";
    const matchNo = byId("shiftMatch")?.value || "1";
    if (!poolId) return;
    const generation = shiftViewGeneration;
    shiftRefreshBusy = true;
    try {
      const rows = await DB.listShiftSchema(poolId, lagNo, matchNo);
      if (shiftToggleSaving || generation !== shiftViewGeneration ||
          sessionStorage.getItem("nsk2_pool_id") !== poolId ||
          (sessionStorage.getItem("nsk2_lag_nr") || "1") !== lagNo ||
          (byId("shiftMatch")?.value || "1") !== matchNo) return;
      const checks = [...document.querySelectorAll("#shiftTableWrap [data-shift-toggle]")];
      if (checks.length !== rows.length) return; // Schemat ändrades; rör inte tabellen.
      for (const check of checks) {
        const n = Number(check.dataset.shiftToggle);
        if (Number.isSafeInteger(n) && n >= 1 && rows.some(r=>Number(r.shift_no)===n))
          {const done=!!rows.find(r=>Number(r.shift_no)===n)?.done;check.classList.toggle("done",done);check.setAttribute("aria-pressed",String(done));check.textContent=done?"✓":"";}
      }
    } catch (err) {
      console.warn("Kunde inte synkronisera bytesschema", err);
    } finally {
      shiftRefreshBusy = false;
    }
  }

  if (!window.__nskShiftSyncBound) {
    window.__nskShiftSyncBound = true;
    window.addEventListener("focus", refreshShiftDoneMarks);
    document.addEventListener("visibilitychange", refreshShiftDoneMarks);
    window.setInterval(refreshShiftDoneMarks, 5000);
  }

  async function initBytesschemaPage() {
    const teamBox = byId("shiftTeamButtons");
    const matchSelect = byId("shiftMatch");
    if (!teamBox || !matchSelect) return;

    try {
      const poolId = sessionStorage.getItem("nsk2_pool_id");
      if (!poolId) {
        setText("shiftMsg", "Välj först ett poolspel från startsidan.");
        return;
      }

      const pool = await DB.getPool(poolId);
      const teams = safeInt(pool?.teams || "2", 2);
      const matches = safeInt(pool?.matches || "4", 4);

      renderShiftTeamButtons(teams);
      renderShiftMatchOptions(matches);
      renderShiftMatchList(matches);
      const savedMatch = sessionStorage.getItem("nsk2_match_no") || "1";
      if (Number(savedMatch) >= 1 && Number(savedMatch) <= matches) matchSelect.value = savedMatch;

      const lagNo = sessionStorage.getItem("nsk2_lag_nr") || "1";
      setActiveShiftTeamButton(lagNo);
      setActiveShiftMatchButton(matchSelect.value || "1");

      if (!matchSelect.dataset.bound) {
        matchSelect.dataset.bound = "1";
        matchSelect.addEventListener("change", async () => {
          sessionStorage.setItem("nsk2_match_no", matchSelect.value || "1");
          setActiveShiftMatchButton(matchSelect.value || "1");
          await renderShiftSchema();
        });
      }

      await renderShiftSchema();
    } catch (err) {
      setText("appError", err?.message || String(err));
    }
  }

  async function renderShiftSchema() {
    const generation=++shiftViewGeneration;
    const isCurrent=()=>generation===shiftViewGeneration;
    const poolId = sessionStorage.getItem("nsk2_pool_id");
    const lagNo = sessionStorage.getItem("nsk2_lag_nr") || "1";
    const matchNo = byId("shiftMatch")?.value || "1";
    sessionStorage.setItem("nsk2_match_no", matchNo);
    sessionStorage.setItem(`nsk2_team_match_${poolId}_${lagNo}`,matchNo);
    if (!poolId) return;

    const pool = await DB.getPool(poolId);
    if(!isCurrent())return;
    let row = await DB.getPoolTeamMatchConfig(poolId, lagNo, matchNo);
    if (!row && String(matchNo) !== "1") {const base=await DB.getPoolTeamMatchConfig(poolId, lagNo, 1);row=base?{...base,start_time:null,opponent:"",plan:"Plan 1"}:null;}
    if(!isCurrent())return;

    const players = await getPlayersCached();
    if(!isCurrent())return;
    const coaches = await getCoachesCached();
    if(!isCurrent())return;
    const playerMap = {};
    const coachMap = {};
    players.forEach((p) => { playerMap[String(p.id)] = p.full_name; });
    coaches.forEach((c) => { coachMap[String(c.id)] = c.full_name; });

    const title = `Match ${matchNo} • Lag ${lagNo}`;
    setText("bytesschemaTitle", title);
    setText("shiftHeaderMain", title);
    setText("shiftStart", row?.start_time || "—");
    setText("shiftDate", pool?.pool_date || "—");
    setText("shiftOpponent", row?.opponent || "—");
    setText("shiftPlan", row?.plan || "—");

    const goalieName = row?.goalie_player_id ? shortName(playerMap[String(row.goalie_player_id)] || "—") : "—";
    setText("shiftGoalieName", goalieName);

    const coachNames = await getCoachNamesForLag(poolId, lagNo, matchNo);
    if(!isCurrent())return;
    setText("shiftCoachNames", coachNames);
    if(DB.getPoolMaterial){const material=await DB.getPoolMaterial(poolId);if(!isCurrent())return;setText("shiftEquipmentName",material.name||"—");}

    setActiveShiftTeamButton(lagNo);
    setActiveShiftMatchButton(matchNo);

    const rows = await DB.listShiftSchema(poolId, lagNo, matchNo);
    if(!isCurrent())return;
    const openMatch=byId('openMatchView');
    if(openMatch){openMatch.textContent=rows.some(r=>r.done)?'Återgå till matchvy':'Starta match '+matchNo;openMatch.setAttribute('aria-disabled',String(!rows.length));openMatch.onclick=async event=>{event.preventDefault();try{if(!rows.length)throw Error('Spara laguppställning och skapa bytesschema först.');if(DB.assertMatchReady)await DB.assertMatchReady(poolId,lagNo,matchNo);(window.NSKNavigate||((url)=>{location.href=url;}))('../matchvy/');}catch(error){setText('shiftMsg',error.message);}};}
    const wrap = byId("shiftTableWrap");
    if (!wrap) return;

    if (!rows.length) {
      // Saknat schema: återskapa bara den valda matchen, aldrig andra matcher.
      const source = row;
      const lineup = source?.id ? await DB.getLineup(source.id) : [];
      const hasPlayers = lineup.some(x => x.person_type === "player");
      wrap.innerHTML = hasPlayers
        ? `<div class="small" style="margin-bottom:12px">Bytesschemat saknas för Match ${esc(matchNo)}, Lag ${esc(lagNo)}, men laguppställningen finns kvar.</div><button type="button" class="row-btn nsk-action nsk-action--neutral" id="restoreMissingShift">Återskapa bytesschema för Match ${esc(matchNo)}</button>`
        : '<div class="small">Inget bytesschema ännu. Spara laguppställning först.</div>';
      if(!isCurrent())return;
      const restore = byId("restoreMissingShift");
      if (restore) restore.addEventListener("click", async () => {
        if (!window.confirm(`Återskapa endast Match ${matchNo}, Lag ${lagNo} enligt aktuella poolspelsinställningar?`)) return;
        restore.disabled = true;
        try {
          // Kontrollera igen före skrivning för att undvika att ersätta schema som just skapats på annan enhet.
          const existing = await DB.listShiftSchema(poolId, lagNo, matchNo);
          if (existing.length) throw new Error("Schemat finns redan. Uppdatera sidan i stället.");
          const result = await regenerateShiftSchemaFor(poolId, lagNo, matchNo);
          if (!result.length) throw new Error("Kunde inte skapa schema från laguppställningen.");
          setText("appError", "");
          await renderShiftSchema();
        } catch (err) {
          setText("appError", err?.message || String(err));
          restore.disabled = false;
        }
      });
      return;
    }

    // Alla matcher: upptäck även scheman med rätt antal rader men fel periodtid.
    let repairHtml = "";
    if (pool) {
      const seconds = Number(pool.period_time) * 60;
      const interval = Number(pool.sub_time);
      const periods = Number(pool.periods);
      if (seconds > 0 && interval > 0 && periods > 0) {
        const expected = Math.ceil(seconds / interval) * periods;
        const expectedStart = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
        const actualStart = String(rows[0]?.time_left || "").trim();
        const outdated = rows.length !== expected || actualStart !== expectedStart;
        if (outdated) {
          repairHtml = `<div class="small" style="margin-bottom:12px">Match ${esc(matchNo)} har ett bytesschema som inte stämmer med poolspelsinställningarna. Sparat: ${rows.length} byten, start ${esc(actualStart || "—")}. Aktuellt: ${expected} byten, start ${expectedStart}. Ingen ändring görs utan bekräftelse.</div>`;
          if (rows.some(r => r.done)) repairHtml += `<div class="small" style="margin-bottom:8px">Matchen har genomförda byten. Schemat är låst och får inte återskapas.</div>`;
          if(!rows.some(r=>r.done))repairHtml += `<button type="button" class="row-btn nsk-action nsk-action--neutral" id="repairOutdatedShifts" style="margin-bottom:12px">Återskapa Match ${esc(matchNo)} enligt aktuella inställningar</button>`;
        }
      }
    }

    wrap.innerHTML = repairHtml + `
      <table class="shift-table">
        <thead>
          <tr>
            <th></th>
            <th>#</th>
            <th>Tid kvar</th>
            <th>På plan</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => {
            const shiftNo = Number(r.shift_no)||i+1;
            const names = (Array.isArray(r.players_json) ? r.players_json : [])
              .map((id) => shortName(playerMap[String(id)] || "—"))
              .join("<br>");
            const done = r.done ? "done" : "";
            return `
              <tr>
                <td class="check-cell"><button type="button" class="shift-check ${done}" data-shift-toggle="${shiftNo}" aria-label="Byte ${shiftNo} genomfört" aria-pressed="${!!r.done}">${r.done?'✓':''}</button></td>
                <td>${shiftNo}</td>
                <td>${esc(r.time_left)}</td>
                <td class="shift-players">${names || "—"}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    if(pool?.active===false){for(const control of wrap.querySelectorAll("button"))control.disabled=true;setText("shiftMsg","Poolspelet är avslutat. Återöppna det i kalendern för att ändra.");}
    const repairButton = byId("repairOutdatedShifts");
    if (repairButton) repairButton.addEventListener("click", async () => {
      if(rows.some(r=>r.done)){setText("appError","Matchen har genomförda byten. Schemat är låst.");return;}
      if (!window.confirm(`Återskapa endast Match ${matchNo}, Lag ${lagNo}? Andra matcher påverkas inte.`)) return;
      repairButton.disabled = true;
      try {
        const latestPool = await DB.getPool(poolId);
        const config = await DB.getPoolTeamMatchConfig(poolId, lagNo, matchNo) ||
          (String(matchNo) !== "1" ? await DB.getPoolTeamMatchConfig(poolId, lagNo, 1) : null);
        const lineup = config?.id ? await DB.getLineup(config.id) : [];
        if (!lineup.some(r => r.person_type === "player")) throw new Error("Ingen laguppställning hittades. Inget har ändrats.");
        const result = await regenerateShiftSchemaFor(poolId, lagNo, matchNo);
        if (!result.length) throw new Error("Kunde inte skapa bytesschemat.");
        setText("appError", "");
        await renderShiftSchema();
      } catch (err) {
        setText("appError", err?.message || String(err));
        repairButton.disabled = false;
      }
    });
  }

  async function getCoachNamesForLag(poolId, lagNo, matchNo = "1") {
    const rows = await DB.listPoolTeamMatchConfigs(poolId);
    const coaches = await getCoachesCached();
    const coachMap = {};
    coaches.forEach((c) => { coachMap[String(c.id)] = c.full_name; });

    const firstRow =
      rows.find((r) => String(r.lag_no) === String(lagNo) && String(r.match_no) === String(matchNo)) ||
      rows.find((r) => String(r.lag_no) === String(lagNo));

    if(typeof DB.getCoachSelection==='function'){
      const selection=await DB.getCoachSelection(poolId,lagNo,matchNo);
      if(selection.saved)return selection.coach_ids.map(id=>coachMap[String(id)]||'').filter(Boolean).join(', ')||'—';
    }
    if(!firstRow?.id)return "—";
    const lineup = await DB.getLineup(firstRow.id);
    const names = lineup
      .filter((x) => x.person_type === "coach")
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((x) => shortName(coachMap[String(x.person_id)] || ""))
      .filter(Boolean);

    return names.length ? names.join(", ") : "—";
  }

  async function initLagPage() {
    const box = byId("teamButtons");
    if (!box) return;

    const poolId = sessionStorage.getItem("nsk2_pool_id");
    if (!poolId) {
      box.innerHTML = '<div class="small">Välj först ett poolspel från startsidan.</div>';
      return;
    }

    try {
      const pool = await DB.getPool(poolId);
      const teams = safeInt(pool?.teams || "2", 2);

      box.innerHTML = "";

      for (let lagNo = 1; lagNo <= teams; lagNo++) {
        const coachNames = await getCoachNamesForLag(poolId, lagNo);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "team-btn lag-overview-btn";
        btn.dataset.activeLag = String(lagNo);
        btn.dataset.activePool = String(poolId);
        btn.innerHTML = `
          <div class="lag-overview-title">Lag ${lagNo}</div>
          <div class="lag-overview-coaches">Tränare: ${esc(coachNames)}</div>
        `;
        box.appendChild(btn);
      }

      setText("activeTeam", `${pool.place || "Poolspel"} • ${pool.pool_date || ""}`);
    } catch (err) {
      setText("appError", err?.message || String(err));
    }
  }

  // Matchvy: hämta data en gång. Knapptryckningar ritar sedan om lokalt.
  let matchvyCache = null;
  let matchvySaving = false;
  let matchvyRefreshing = false;

  function paintCoachMatchView() {
    const data = matchvyCache;
    if (!data || !data.rows.length) {
      byId('nextShiftMeta').hidden=true;byId('nextShiftPanel').hidden=true;
      byId('nextShiftBtn').hidden=true;byId('matchFinishedPanel').hidden=true;
      setText("shiftLabel", "Inget schema");
      setText("currentPlayers", "—");
      setText("nextPlayers", "—");
      setText("currentShiftMeta", "Pågående byte: —");
      setText("nextShiftMeta", "Nästa byte: —");
      setHtml("matchInfo", "");
      return;
    }

    const { rows, playerMap, row, lagNo, matchNo } = data;
    matchCurrentShiftIndex = Math.max(0, Math.min(matchCurrentShiftIndex, rows.length - 1));
    const current = rows[matchCurrentShiftIndex];
    const next = rows[matchCurrentShiftIndex + 1] || null;
    const totalShifts = rows.length;
    const finished=rows.every(shift=>shift.done);
    const last=!next;
    byId('nextShiftMeta').hidden=last||finished;
    byId('nextShiftPanel').hidden=last||finished;
    byId('nextShiftBtn').hidden=finished;
    byId('nextShiftBtn').textContent=last?'Avsluta match':'Nästa byte';
    byId('matchFinishedPanel').hidden=!finished;
    setText('matchFinishedTitle',`Match ${matchNo} avslutad · Lag ${lagNo}`);
    const nextMatch=data.configs.filter(c=>Number(c.lag_no)===Number(lagNo)&&Number(c.match_no)>Number(matchNo)).sort((a,b)=>a.match_no-b.match_no)[0];
    byId('prepareNextMatch').hidden=!nextMatch;
    setText('matchFinishedNext',nextMatch?`Nästa: Match ${nextMatch.match_no} · ${nextMatch.opponent||'Motståndare ej angiven'} · ${nextMatch.start_time||'Tid ej angiven'}`:'Ingen senare match finns planerad för valt lag. Kontrollera samtliga matcher och övriga egna lag innan hela poolspelet avslutas.');
    if(nextMatch)byId('prepareNextMatch').onclick=()=>{sessionStorage.setItem('nsk2_match_no',String(nextMatch.match_no));sessionStorage.setItem(`nsk2_team_match_${data.poolId}_${lagNo}`,String(nextMatch.match_no));(window.NSKNavigate||((url)=>{(window.location||location).href=url;}))('../bytesschema/');};


    setText("shiftLabel", `Lag ${lagNo} • Match ${matchNo}`);
    setText("currentShiftMeta", `${finished?'Match avslutad':last?'Sista bytet':'Pågående byte'}: ${matchCurrentShiftIndex + 1} av ${totalShifts} • Klockslag ${current?.time_left || "—"}`);
    setText("nextShiftMeta", `Nästa byte: ${next ? (matchCurrentShiftIndex + 2) : "—"} av ${totalShifts} • Klockslag ${next?.time_left || "—"}`);
    setHtml("matchInfo", `
      <div class="matchvy-info-row">Tränare: <strong>${esc(data.coachNames||"—")}</strong></div>
      <div class="matchvy-info-row">Motståndare: <strong>${esc(row?.opponent || "—")}</strong></div>
      <div class="matchvy-info-row">Plan: <strong>${esc(row?.plan || "Plan 1")}</strong></div>
      <div class="matchvy-info-row">Start: <strong>${esc(row?.start_time || "—")}</strong></div>
    `);
    const names = (shift) => (Array.isArray(shift?.players_json) ? shift.players_json : [])
      .map((id) => shortName(playerMap[String(id)] || "—"))
      .join("<br>") || "—";
    setHtml("currentPlayers", names(current));
    setHtml("nextPlayers", names(next));
  }

  async function renderCoachMatchView(poolId, lagNo, matchNo) {
    const [rows, players, rowCurrent, configs, coachNames] = await Promise.all([
      DB.listShiftSchema(poolId, lagNo, matchNo),
      getPlayersCached(),
      DB.getPoolTeamMatchConfig(poolId, lagNo, matchNo),
      DB.listPoolMatchPlan?DB.listPoolMatchPlan(poolId):DB.listPoolTeamMatchConfigs(poolId),getCoachNamesForLag(poolId,lagNo,matchNo)
    ]);
    const row = rowCurrent;
    const playerMap = {};
    players.forEach((p) => { playerMap[String(p.id)] = p.full_name; });
    matchvyCache = { rows, playerMap, row, poolId, lagNo, matchNo, configs, coachNames };
    paintCoachMatchView();
  }

  async function initMatchvyPage() {
    const currentEl = byId("currentPlayers");
    const nextEl = byId("nextPlayers");
    if (!currentEl || !nextEl) return;

    const poolId = sessionStorage.getItem("nsk2_pool_id");
    const lagNo = sessionStorage.getItem("nsk2_lag_nr") || "1";
    const matchNo = sessionStorage.getItem("nsk2_match_no") || "1";
    if (!poolId) {
      setText("appError", "Välj först ett poolspel.");
      return;
    }

    sessionStorage.setItem(`nsk2_team_match_${poolId}_${lagNo}`,matchNo);
    matchCurrentShiftIndex = Math.max(0, safeInt(sessionStorage.getItem(matchShiftKey(poolId, lagNo, matchNo)), 0));
    await renderCoachMatchView(poolId, lagNo, matchNo);
    // Vid start: välj första ej genomförda bytet från databasen.
    const firstPending = matchvyCache.rows.findIndex(r => !r.done);
    matchCurrentShiftIndex = firstPending === -1 ? Math.max(0, matchvyCache.rows.length - 1) : firstPending;
    rememberMatchShift();
    paintCoachMatchView();
    if (!window.__nskMatchSyncBound) {
      window.__nskMatchSyncBound = true;
      const refreshMatch = async () => {
        if (document.hidden || window.NSKShellActive===false || matchvySaving || matchvyRefreshing || !matchvyCache) return;
        matchvyRefreshing = true;
        try {
          const [fresh, currentRow] = await Promise.all([
            DB.listShiftSchema(poolId, lagNo, matchNo),
            DB.getPoolTeamMatchConfig(poolId, lagNo, matchNo)
          ]);
          if (!matchvyCache || matchvySaving || matchvyCache.poolId !== poolId ||
              matchvyCache.lagNo !== lagNo || matchvyCache.matchNo !== matchNo) return;
          matchvyCache.rows = fresh;
          if (currentRow) matchvyCache.row = currentRow;
          const pending = fresh.findIndex(r => !r.done);
          matchCurrentShiftIndex = pending === -1 ? Math.max(0, fresh.length - 1) : pending;
          rememberMatchShift();
          paintCoachMatchView();
        } catch (err) { console.warn("Kunde inte synkronisera Matchvy", err); }
        finally { matchvyRefreshing = false; }
      };
      window.setInterval(refreshMatch, 5000);
      window.addEventListener("focus", refreshMatch);
      document.addEventListener("visibilitychange", refreshMatch);
    }
    byId('finishWholePool').onclick=async()=>{
      const button=byId('finishWholePool');button.disabled=true;
      try{
        const configs=await (DB.listPoolMatchPlan?DB.listPoolMatchPlan(poolId):DB.listPoolTeamMatchConfigs(poolId));
        const states=await Promise.all(configs.map(async c=>({config:c,rows:await DB.listShiftSchema(poolId,c.lag_no,c.match_no)})));
        const unfinished=states.filter(s=>!s.rows.length||s.rows.some(row=>!row.done));
        const warning=unfinished.length?'Kvar att avsluta: '+unfinished.map(s=>`Lag ${s.config.lag_no}, match ${s.config.match_no}`).join('; ')+'. ':'';
        if(!confirm(warning+'Avsluta hela poolspelet för alla egna lag? Uppställningar och byten sparas.'))return;
        await DB.updatePoolActive(poolId,false);(window.NSKNavigate||((url)=>{(window.location||location).href=url;}))('../startsida/');
      }catch(error){setText('appError',error.message||'Poolspelet kunde inte avslutas.');}
      finally{button.disabled=false;}
    };
    const prevBtn = byId("prevShiftBtn");
    const nextBtn = byId("nextShiftBtn");

    if (prevBtn && !prevBtn.dataset.boundMatchvy) {
      prevBtn.dataset.boundMatchvy = "1";
      prevBtn.addEventListener("click", async () => {
        if (matchvySaving || !matchvyCache?.rows.length || matchCurrentShiftIndex === 0) return;
        const oldIndex = matchCurrentShiftIndex;
        const previousIndex = oldIndex - 1;
        matchvySaving = true;
        prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        setText("appError", "");
        try {
          // Föregående byte innebär att detta byte inte längre är genomfört.
          await DB.setShiftDone(poolId, lagNo, matchNo, matchvyCache.rows[previousIndex].shift_no, false);
          matchvyCache.rows[previousIndex].done = false;
          matchCurrentShiftIndex = previousIndex;
          rememberMatchShift();
          paintCoachMatchView();
        } catch (err) {
          setText("appError", `Kunde inte ångra bytet: ${err?.message || String(err)}`);
        } finally {
          matchvySaving = false;
          prevBtn.disabled = false;
          if (nextBtn) nextBtn.disabled = false;
        }
      });
    }

    if (nextBtn && !nextBtn.dataset.boundMatchvy) {
      nextBtn.dataset.boundMatchvy = "1";
      nextBtn.addEventListener("click", async () => {
        if (matchvySaving || !matchvyCache?.rows.length) return;
        if (matchCurrentShiftIndex >= matchvyCache.rows.length - 1) {
          if(!confirm(`Avsluta match ${matchNo} för Lag ${lagNo}?`))return;
          matchvySaving=true;nextBtn.disabled=true;
          try{await DB.setShiftDone(poolId,lagNo,matchNo,matchvyCache.rows.at(-1).shift_no,true);matchvyCache.rows.at(-1).done=true;paintCoachMatchView();}
          catch(error){setText('appError',error.message||'Matchen kunde inte avslutas.');}
          finally{matchvySaving=false;nextBtn.disabled=false;}
          return;
        }

        const previousIndex = matchCurrentShiftIndex;
        const currentShiftNo = matchvyCache.rows[previousIndex].shift_no;
        matchvySaving = true;
        nextBtn.disabled = true;
        if (prevBtn) prevBtn.disabled = true;
        matchCurrentShiftIndex = previousIndex + 1;
        rememberMatchShift();
        paintCoachMatchView(); // Visa nästa byte direkt, före nätverksanropet.
        setText("appError", "");
        try {
          await DB.setShiftDone(poolId, lagNo, matchNo, currentShiftNo, true);
          matchvyCache.rows[previousIndex].done = true;
        } catch (err) {
          matchCurrentShiftIndex = previousIndex; // Återställ om sparningen misslyckas.
          rememberMatchShift();
          paintCoachMatchView();
          setText("appError", `Kunde inte spara bytet: ${err?.message || String(err)}`);
        } finally {
          matchvySaving = false;
          nextBtn.disabled = false;
          if (prevBtn) prevBtn.disabled = false;
        }
      });
    }
  }

  async function importPlayersAndCoachesFromJsonObject(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Ogiltig backupfil.");
    }

    const players = Array.isArray(data.players) ? data.players : [];
    const coaches = Array.isArray(data.coaches) ? data.coaches : [];

    const existingPlayers = typeof DB?.listPlayers === "function" ? await getPlayersCached() : [];
    const existingCoaches = typeof DB?.listCoaches === "function" ? await getCoachesCached() : [];

    const existingPlayerNames = new Set(
      existingPlayers.map((p) => String(p.full_name || "").trim().toLowerCase()).filter(Boolean)
    );
    const existingCoachNames = new Set(
      existingCoaches.map((c) => String(c.full_name || "").trim().toLowerCase()).filter(Boolean)
    );

    let addedPlayers = 0;
    let addedCoaches = 0;
    let skippedPlayers = 0;
    let skippedCoaches = 0;

    for (const name of players) {
      const safeName = String(name || "").trim();
      const key = safeName.toLowerCase();
      if (!safeName) continue;

      if (existingPlayerNames.has(key)) {
        skippedPlayers++;
        continue;
      }

      if (typeof DB?.addPlayer !== "function") throw new Error("DB.addPlayer saknas.");
      await DB.addPlayer(safeName);
      existingPlayerNames.add(key);
      addedPlayers++;
    }

    for (const name of coaches) {
      const safeName = String(name || "").trim();
      const key = safeName.toLowerCase();
      if (!safeName) continue;

      if (existingCoachNames.has(key)) {
        skippedCoaches++;
        continue;
      }

      if (typeof DB?.addCoach !== "function") throw new Error("DB.addCoach saknas.");
      await DB.addCoach(safeName);
      existingCoachNames.add(key);
      addedCoaches++;
    }

    clearRosterCache();
    if (typeof DB?.listPlayers === "function") await renderPlayers();
    if (typeof DB?.listCoaches === "function") await renderCoaches();

    setText(
      "truppenMsg",
      `Import klar. Spelare: +${addedPlayers} (${skippedPlayers} fanns redan). Tränare: +${addedCoaches} (${skippedCoaches} fanns redan).`
    );
  }

  async function handleImportBackupFile(file) {
    if (!file) return;

    try {
      setText("truppenMsg", "Importerar backup...");
      const text = await file.text();
      const data = JSON.parse(text);
      await importPlayersAndCoachesFromJsonObject(data);
    } catch (err) {
      setText("truppenMsg", err?.message || String(err));
      setText("appError", err?.message || String(err));
    }
  }

  function updatePlayerLabel(id,name,type='player') {
    document.querySelectorAll('[data-roster-name]').forEach(label=>{if(label.dataset.rosterName===type+':'+id)label.textContent=name;});
  }
  function rowHtml(item, type) {
    return `<details class="person-row roster-player-details" data-view-key="${type}:${item.id}"><summary><button type="button" class="person-card-open" data-roster-name="${type}:${item.id}" data-roster-team="${item.team_id}" aria-haspopup="dialog">${esc(item.full_name)}</button><span class="roster-player-chevron" aria-hidden="true">⌄</span></summary><div class="person-main"><input class="inline-name-input" aria-label="Redigera namn: ${esc(item.full_name)}" value="${esc(item.full_name)}" data-inline-${type}="${item.id}"></div><div class="row-actions"><button class="row-btn nsk-action" type="button" data-edit-${type}="${item.id}">Redigera</button><button class="row-btn danger nsk-action nsk-action--delete" type="button" data-delete-${type}="${item.id}">Ta bort</button></div></details>`;
  }

  async function renderPlayers() {
    const list = byId("playersList");
    if (!list) return;
    const players = await getPlayersCached();
    const html=players.length?players.map(p=>rowHtml(p,'player')).join(''):'<div class="muted-note">Inga spelare ännu.</div>';
    if(window.NSKViewCache)NSKViewCache.patch(list,html);else list.innerHTML=html;
  }

  async function renderCoaches() {
    const list = byId("coachesList");
    if (!list) return;
    const coaches = await getCoachesCached();
    const html=coaches.length?coaches.map(c=>rowHtml(c,'coach')).join(''):'<div class="muted-note">Inga tränare ännu.</div>';
    if(window.NSKViewCache)NSKViewCache.patch(list,html);else list.innerHTML=html;
  }

  function queueInlinePlayerSave(id, value) {
    clearTimeout(saveTimers[`p_${id}`]);
    saveTimers[`p_${id}`] = setTimeout(async () => {
      try {
        await DB.updatePlayer(id, String(value || "").trim());
        clearRosterCache();updatePlayerLabel(id,String(value||" ").trim());setText("truppenMsg", "Namnet är sparat.");
      } catch(error) {setText("truppenMsg", error?.message || "Kunde inte spara namnet.");}
    }, 600);
  }

  function queueInlineCoachSave(id, value) {
    clearTimeout(saveTimers[`c_${id}`]);
    saveTimers[`c_${id}`] = setTimeout(async () => {
      await DB.updateCoach(id, String(value || "").trim());
      clearRosterCache();updatePlayerLabel(id,String(value||" ").trim(),"coach");
    }, 600);
  }

  async function flushInlinePlayerSave(id, value) {
    clearTimeout(saveTimers[`p_${id}`]);
    await DB.updatePlayer(id, String(value || "").trim());
    clearRosterCache();updatePlayerLabel(id,String(value||" ").trim());setText("truppenMsg", "Namnet är sparat.");
  }

  async function flushInlineCoachSave(id, value) {
    clearTimeout(saveTimers[`c_${id}`]);
    await DB.updateCoach(id, String(value || "").trim());
    clearRosterCache();updatePlayerLabel(id,String(value||" ").trim(),"coach");
  }

  async function addPlayer() {
    const input = byId("playerInput");
    const name = input?.value?.trim();
    if (!name) return;
    await DB.addPlayer(name);
    input.value = "";
    clearRosterCache();
    await renderPlayers();
  }

  async function addCoach() {
    const input = byId("coachInput");
    const name = input?.value?.trim();
    if (!name) return;
    await DB.addCoach(name);
    input.value = "";
    clearRosterCache();
    await renderCoaches();
  }

  async function deletePlayer(id) {
    if (!window.confirm("Ta bort spelaren från truppen? Detta kan inte ångras.")) return;
    clearTimeout(saveTimers[`p_${id}`]);
    await DB.deletePlayer(id);
    clearRosterCache();
    await renderPlayers();
  }

  async function deleteCoach(id) {
    if (!window.confirm("Ta bort tränaren från truppen? Detta kan inte ångras.")) return;
    clearTimeout(saveTimers[`c_${id}`]);
    await DB.deleteCoach(id);
    clearRosterCache();
    await renderCoaches();
  }

  async function initTruppenPage() {
    if (!byId("playersList") && !byId("coachesList")) return;

    byId("addPlayerBtn")?.addEventListener("click", addPlayer);
    byId("addCoachBtn")?.addEventListener("click", addCoach);

    const importBtn = byId("importBackupBtn");
    const importInput = byId("importBackupFile");

    if (importBtn && importInput && !importBtn.dataset.bound) {
      importBtn.dataset.bound = "1";
      importBtn.addEventListener("click", () => importInput.click());
      importInput.addEventListener("change", async (e) => {
        const file = e.target?.files?.[0];
        await handleImportBackupFile(file);
        importInput.value = "";
      });
    }

    if(window.NSKViewCache){
      const view=await NSKViewCache.open('roster');
      const paint=async data=>{rosterCache.players=data.players;rosterCache.coaches=data.coaches;await Promise.all([renderPlayers(),renderCoaches()]);};
      if(view.data)await paint(view.data);
      try{
        const [players,coaches]=await Promise.all([DB.listPlayers(),DB.listCoaches()]);
        if(view.current()){const data={players,coaches};view.save(data);if(JSON.stringify(view.data)!==JSON.stringify(data))await paint(data);}
      }catch(error){if(view.current()){
        if(NSKViewCache.denied(error)){NSKViewCache.clear();clearRosterCache();byId('playersList')?.replaceChildren();byId('coachesList')?.replaceChildren();}
        setText('truppenMsg',view.data&&!NSKViewCache.denied(error)?'Visar senast hämtade trupp. Kunde inte uppdatera.':error.message);
      }}
    }else await Promise.all([renderPlayers(), renderCoaches()]);

    if (!truppenRealtime && typeof DB?.subscribeTruppen === "function") {
      truppenRealtime = await DB.subscribeTruppen(async (type) => {
        clearRosterCache();
        if (type === "players") await renderPlayers();
        if (type === "coaches") await renderCoaches();
      });
    }
  }

  async function initGoalieStatsPage() {
    const list = byId("goalieStatsList");
    if (!list) return;

    try {
      const stats = typeof DB?.listGoalieStats === "function" ? await DB.listGoalieStats() : [];
      const grouped = {};

      stats.forEach((row) => {
        const name = String(row.goalie_name || "").trim();
        const matchId = String(row.match_id || "").trim();
        if (!name || !matchId) return;
        if (!grouped[name]) grouped[name] = new Set();
        grouped[name].add(matchId);
      });

      const rows = Object.entries(grouped)
        .map(([name, set]) => ({ name, count: set.size }))
        .sort((a, b) => b.count - a.count);

      list.innerHTML = rows.length ? rows.map((r) => `
        <div class="listrow">
          <strong>${esc(r.name)}</strong> — ${r.count} matcher
        </div>
      `).join("") : '<div class="listrow">Inga matcher med vald målvakt ännu.</div>';
    } catch (err) {
      setText("appError", err?.message || String(err));
    }
  }

  return { init };
})();

window.addEventListener("DOMContentLoaded", () => {
  registerNskServiceWorker();
  showNskVersion();
  checkAppVersion();
  setInterval(checkAppVersion, NSK_UPDATE_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden&&window.NSKShellActive!==false) checkAppVersion();
  });
  window.NSK2App.init().catch((err) => {
    const el = document.getElementById("appError");
    if (el) el.textContent = err?.message || String(err);
    console.error(err);
  });
});
