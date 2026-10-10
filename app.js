async function checkAppVersion() {
  try {
    const pathParts = location.pathname.split("/").filter(Boolean);
    const isSubPage = pathParts.length > 1;
    const base = isSubPage ? "../" : "./";

    const res = await fetch(base + "deploy.json?ts=" + Date.now(), {
      cache: "no-store"
    });

    if (!res.ok) return;

    const data = await res.json();

    if (!data?.version || !window.NSK_VERSION) return;

    if (String(data.version) !== String(window.NSK_VERSION)) {
      console.warn("Ny version upptäckt:", data.version, "lokal:", window.NSK_VERSION);

      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
        }
      }

      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      location.reload();
    }
  } catch (err) {
    console.warn("Version check failed", err);
  }
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
    await checkAppVersion();

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
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;

      try {
        if (t.dataset.editPool) {
          sessionStorage.setItem("nsk2_edit_pool_id", t.dataset.editPool);
          window.location.href = "../skapapoolspel/";
          return;
        }

        if (t.dataset.deletePool) {
          const ok = window.confirm("Ta bort poolspelet?");
          if (!ok) return;
          await DB.deletePool(t.dataset.deletePool);
          window.location.reload();
          return;
        }

        if (t.dataset.poolId && t.dataset.lagNo) {
          sessionStorage.setItem("nsk2_pool_id", t.dataset.poolId || "");
          sessionStorage.setItem("nsk2_lag_nr", t.dataset.lagNo || "1");
          window.location.href = "../laguppstallning/";
          return;
        }

        if (t.dataset.poolShifts && t.dataset.lagNo) {
          sessionStorage.setItem("nsk2_pool_id", t.dataset.poolShifts || "");
          sessionStorage.setItem("nsk2_lag_nr", t.dataset.lagNo || "1");
          window.location.href = "../bytesschema/";
          return;
        }

        if (t.dataset.startPoolId) {
          sessionStorage.setItem("nsk2_pool_id", t.dataset.startPoolId || "");
          sessionStorage.setItem("nsk2_match_no", "1");
          window.location.href = "../lag/";
          return;
        }

        if (t.dataset.activeLag && t.dataset.activePool) {
          sessionStorage.setItem("nsk2_pool_id", t.dataset.activePool || "");
          sessionStorage.setItem("nsk2_lag_nr", t.dataset.activeLag || "1");
          sessionStorage.setItem("nsk2_match_no", "1");
          window.location.href = "../matchvy/";
          return;
        }

        if (t.dataset.shiftMatchCard) {
          const sel = byId("shiftMatch");
          if (sel) sel.value = String(t.dataset.shiftMatchCard);
          setActiveShiftMatchButton(String(t.dataset.shiftMatchCard));
          await renderShiftSchema();
          return;
        }

        if (t.dataset.lagTeam) {
          sessionStorage.setItem("nsk2_lag_nr", String(t.dataset.lagTeam));
          setActiveLagButton(String(t.dataset.lagTeam));
          await fillLaguppstallningFormFromSelection();
          return;
        }

        if (t.dataset.matchNo) {
          const sel = byId("lineupMatch");
          if (sel) sel.value = String(t.dataset.matchNo);
          setActiveMatchButton(String(t.dataset.matchNo));
          await fillLaguppstallningFormFromSelection();
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

  async function initStartsidaPage() {
    const box = byId("savedPoolsList");
    if (!box) return;

    try {
      const pools = await DB.listPools();

      if (!pools.length) {
        box.innerHTML = '<div class="listrow">Inga sparade poolspel ännu.</div>';
        return;
      }

      box.innerHTML = pools.map((p) => {
        const teams = safeInt(p.teams || "2", 2);

        const lagButtons = Array.from({ length: teams }, (_, i) => {
          const lagNo = i + 1;
          return `
            <button class="team-btn" type="button" data-pool-id="${p.id}" data-lag-no="${lagNo}">
              Lag ${lagNo}
            </button>
          `;
        }).join("");

        const shiftButtons = Array.from({ length: teams }, (_, i) => {
          const lagNo = i + 1;
          return `
            <button class="team-btn" type="button" data-pool-shifts="${p.id}" data-lag-no="${lagNo}">
              Lag ${lagNo}
            </button>
          `;
        }).join("");

        return `
          <article class="pool-item">
            <div class="pool-top">
              <div>
                <div class="pool-title">${esc(p.place || "Ort")} • ${esc(p.pool_date || "Datum")}</div>
                <div class="pool-meta">${esc(p.title || "Poolspel")}</div>
              </div>
              <div class="status-badge">${esc(p.status || "Aktiv")}</div>
            </div>

            <div class="row-actions pool-actions">
              <button class="row-btn" type="button" data-edit-pool="${p.id}">Redigera</button>
              <button class="row-btn danger" type="button" data-delete-pool="${p.id}">Ta bort</button>
            </div>

            <div class="pool-lineup-block">
              <div class="pool-lineup-title">Laguppställning</div>
              <div class="team-buttons">${lagButtons}</div>
            </div>

            <div class="pool-lineup-block">
              <div class="pool-lineup-title">Bytesschema</div>
              <div class="team-buttons">${shiftButtons}</div>
            </div>

            <div class="pool-lineup-block">
              <div class="pool-lineup-title">Matchstart för detta poolspel</div>
              <button class="start-pool-btn" type="button" data-start-pool-id="${p.id}">
                Påbörja poolspel • ${esc(p.place || "Ort")} ${esc(p.pool_date || "")}
              </button>
            </div>
          </article>
        `;
      }).join("");
    } catch (err) {
      setText("appError", err?.message || String(err));
    }
  }

  async function initSkapaPoolspelPage() {
    const saveBtn = byId("savePool");
    const teamsSel = byId("teams");
    if (!saveBtn || !teamsSel) return;

    const editId = sessionStorage.getItem("nsk2_edit_pool_id");

    if (!editId) {
      if (byId("poolPlace")) byId("poolPlace").value = "";
      if (byId("poolDate")) byId("poolDate").value = "";
    }

    if (editId) {
      try {
        const pool = await DB.getPool(editId);
        if (byId("poolPlace")) byId("poolPlace").value = pool.place || "";
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
        sessionStorage.removeItem("nsk2_pool_id");
        sessionStorage.setItem("nsk2_lag_nr", String(i));
        sessionStorage.setItem("nsk2_lineup_from_create", "1");
        window.location.href = "../laguppstallning/";
      });
      box.appendChild(btn);
    }
  }

  async function savePool() {
    try {
      const payload = {
        title: "Poolspel",
        place: byId("poolPlace")?.value?.trim() || "",
        pool_date: byId("poolDate")?.value || null,
        status: "Aktiv",
        teams: safeInt(byId("teams")?.value || "2", 2),
        matches: safeInt(byId("matches")?.value || "4", 4),
        players_on_field: safeInt(byId("players")?.value || "3", 3),
        periods: safeInt(byId("periods")?.value || "1", 1),
        period_time: safeInt(byId("periodTime")?.value || "15", 15),
        sub_time: safeInt(byId("subTime")?.value || "90", 90)
      };

      const editId = sessionStorage.getItem("nsk2_edit_pool_id");
      if (editId) {
        await DB.updatePool(editId, payload);
        sessionStorage.removeItem("nsk2_edit_pool_id");
        sessionStorage.setItem("nsk2_pool_id", editId);
      } else {
        const pool = await DB.addPool(payload);
        sessionStorage.setItem("nsk2_pool_id", pool.id);
      }

      setText("poolMsg", "Poolspel sparat");
      window.location.href = "../startsida/";
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

      const players = typeof DB?.getPlayersOnField === "function"
        ? await DB.getPlayersOnField(poolId, lagNo, currentMatchNo)
        : (typeof DB?.listPlayers === "function" ? await getPlayersCached() : []);

      const usedSameMatchSet = poolId ? await getUsedPlayersInSameMatch(poolId, lagNo, currentMatchNo) : new Set();

      let matchRow = poolId && typeof DB?.getPoolTeamMatchConfig === "function"
        ? await DB.getPoolTeamMatchConfig(poolId, lagNo, currentMatchNo)
        : null;

      if (!matchRow && poolId && String(currentMatchNo) !== "1" && typeof DB?.getPoolTeamMatchConfig === "function") {
        matchRow = await DB.getPoolTeamMatchConfig(poolId, lagNo, 1);
      }

      let lineup = [];
      if (matchRow?.id && typeof DB?.getLineup === "function") {
        lineup = await DB.getLineup(matchRow.id);
      }

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
            <button type="button" class="row-btn" data-random-goalie="1">Slumpa</button>
          </div>
        </div>
      `;

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
        }
      }

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

  function queueAutoSaveLineup() {
    clearTimeout(window.__nskLineupSaveTimer);
    window.__nskLineupSaveTimer = setTimeout(async () => {
      try {
        await saveLaguppstallningMatchConfig(true);
      } catch (err) {
        setText("appError", err?.message || String(err));
      }
    }, 180);
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
    coachSelect.disabled = !enabled;

    if (!enabled) {
      Array.from(coachSelect.options).forEach((opt) => {
        opt.selected = false;
      });
    }
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
        opt.hidden = isTaken;
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
        opt.hidden = isTaken;
        opt.disabled = isTaken;
      });
    }
  }

  function attachLineupHandlers() {
    const goalie = byId("lineupGoalie");
    if (goalie && !goalie.dataset.bound) {
      goalie.dataset.bound = "1";
      goalie.addEventListener("change", async () => {
        syncGoalieAgainstPlayers();
        syncSelectedPlayersAcrossLineup();
        updateCoachEnabledState();
        await applyAutoCoachFromCurrentSelection();
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
          await applyAutoCoachFromCurrentSelection();
          queueAutoSaveLineup();
        });
      }
    }

    const coachSelect = byId("lineupCoach");
    if (coachSelect && !coachSelect.dataset.bound) {
      coachSelect.dataset.bound = "1";
      coachSelect.addEventListener("change", () => queueAutoSaveLineup());
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
    await applyAutoCoachFromCurrentSelection();
    queueAutoSaveLineup();
    setText("lineupMsg", `Målvakt slumpad: ${chosen.full_name}`);
  }

  async function fillLaguppstallningFormFromSelection() {
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

      const sourceRow = rowCurrent || row1;

      await renderCoachOptions();
      await renderLineupSelectors();

      if (byId("lineupStartTime")) byId("lineupStartTime").value = rowCurrent?.start_time || "";
      if (byId("lineupOpponent")) byId("lineupOpponent").value = rowCurrent?.opponent || "";
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
      }

      if ((!lineup || !lineup.length) && row1?.id && typeof DB?.getLineup === "function") {
        lineup = await DB.getLineup(row1.id);
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
        }

        for (let i = 1; i <= 25; i++) {
          const el = byId(`lineupPlayer${i}`);
          if (el) el.value = "";
        }
      }

      syncGoalieAgainstPlayers();
      syncSelectedPlayersAcrossLineup();
      await applyAutoCoachFromCurrentSelection();
      updateCoachEnabledState();

      if (!rowCurrent && String(matchNo) !== "1") {
        queueAutoSaveLineup();
      }
    } catch (err) {
      setText("appError", err?.message || String(err));
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

    const playerIds = lineup
      .filter((x) => x.person_type === "player")
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((x) => String(x.person_id));

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

  async function saveLaguppstallningMatchConfig(silent = false) {
    const poolId = sessionStorage.getItem("nsk2_pool_id") || "";
    const lagNo = sessionStorage.getItem("nsk2_lag_nr") || "1";
    const matchNo = byId("lineupMatch")?.value || "1";

    if (!poolId) {
      if (!silent) setText("appError", "Saknar valt poolspel.");
      return;
    }

    const goalie = cleanUUID(byId("lineupGoalie")?.value);
    const playerCount = safeInt(byId("lineupPlayerCount")?.value || "3", 3);
    const selectedPlayers = [];

    for (let i = 1; i <= playerCount; i++) {
      const rawVal = byId(`lineupPlayer${i}`)?.value || "";
      const val = cleanUUID(rawVal);
      if (!val) continue;

      if (goalie && val === goalie) {
        if (!silent) setText("lineupMsg", "Målvakt kan inte vara samma som spelare.");
        return;
      }

      if (selectedPlayers.includes(val)) {
        if (!silent) setText("lineupMsg", "En spelare kan bara väljas en gång.");
        return;
      }

      selectedPlayers.push(val);
    }

    if (!goalie) {
      if (!silent) setText("lineupMsg", "Välj målvakt först.");
      return;
    }

    if (selectedPlayers.length !== playerCount) {
      if (!silent) setText("lineupMsg", "Välj exakt rätt antal spelare.");
      return;
    }

    const poolConflict = await validateUniquePlayersPerMatch(poolId, lagNo, matchNo, goalie, selectedPlayers);
    if (poolConflict) {
      if (!silent) setText("lineupMsg", poolConflict);
      return;
    }

    try {
      await applyAutoCoachFromCurrentSelection();

      const coachSelect = byId("lineupCoach");
      const coachIds = coachSelect
        ? Array.from(coachSelect.selectedOptions).map((o) => o.value).filter(Boolean)
        : [];

      if (typeof DB?.savePoolTeamMatchConfig !== "function") {
        throw new Error("DB.savePoolTeamMatchConfig saknas.");
      }

      const matchRow = await DB.savePoolTeamMatchConfig({
        pool_id: poolId,
        lag_no: safeInt(lagNo, 1),
        match_no: safeInt(matchNo, 1),
        start_time: byId("lineupStartTime")?.value || null,
        opponent: byId("lineupOpponent")?.value?.trim() || "",
        plan: byId("lineupPlan")?.value || "Plan 1",
        player_count: playerCount,
        goalie_player_id: goalie,
        players_on_field: cleanUUIDList([goalie, ...selectedPlayers])
      });

      if (typeof DB?.saveLineup === "function") {
        await DB.saveLineup(matchRow.id, selectedPlayers, coachIds);
      }

      await regenerateShiftSchemaFor(poolId, lagNo, matchNo);

      const onBytesschemaPage = !!byId("shiftTableWrap");
      const activeShiftMatch = byId("shiftMatch")?.value || "";
      if (onBytesschemaPage && String(activeShiftMatch) === String(matchNo)) {
        await renderShiftSchema();
      }

      if (!silent) setText("lineupMsg", "Laguppställning sparad.");
    } catch (err) {
      setText("appError", err?.message || String(err));
    }
  }

  async function initLaguppstallningPage() {
    const teamButtonsBox = byId("laguppstallningTeamButtons");
    const matchSelect = byId("lineupMatch");
    const lineupBox = byId("lineupSelectors");
    const coachSelect = byId("lineupCoach");

    if (!teamButtonsBox || !matchSelect || !lineupBox || !coachSelect) return;

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
      }

      await Promise.all([
        typeof DB?.listPlayers === "function" ? getPlayersCached() : Promise.resolve([]),
        typeof DB?.listCoaches === "function" ? getCoachesCached() : Promise.resolve([]),
        typeof DB?.listPlayerCoachMap === "function" ? getPlayerCoachMapCached() : Promise.resolve([])
      ]);

      renderLaguppstallningTeamButtons(teams);
      renderLaguppstallningMatchOptions(matches);
      renderMatchButtons(matches);
      renderPlayerCountOptions(playersOnField);
      await renderCoachOptions();
      await renderLineupSelectors();

      const savedLag = sessionStorage.getItem("nsk2_lag_nr") || "1";
      setActiveLagButton(savedLag);
      const currentMatch = byId("lineupMatch")?.value || "1";
      setActiveMatchButton(currentMatch);

      updateVisiblePlayers();
      attachLineupHandlers();
      updateCoachEnabledState();
      await fillLaguppstallningFormFromSelection();

      if (!matchSelect.dataset.bound) {
        matchSelect.dataset.bound = "1";
        matchSelect.addEventListener("change", async () => {
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

  async function toggleShiftDone(shiftNo) {
    const poolId = sessionStorage.getItem("nsk2_pool_id");
    const lagNo = sessionStorage.getItem("nsk2_lag_nr") || "1";
    const matchNo = byId("shiftMatch")?.value || "1";

    const el = document.querySelector(`[data-shift-toggle="${shiftNo}"]`);
    if (!el || !poolId) return;

    const nextDone = !el.classList.contains("done");
    el.classList.toggle("done", nextDone);

    try {
      await DB.setShiftDone(poolId, lagNo, matchNo, shiftNo, nextDone);
    } catch (err) {
      el.classList.toggle("done", !nextDone);
      setText("appError", err?.message || String(err));
    }
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

      const lagNo = sessionStorage.getItem("nsk2_lag_nr") || "1";
      setActiveShiftTeamButton(lagNo);
      setActiveShiftMatchButton(matchSelect.value || "1");

      if (!matchSelect.dataset.bound) {
        matchSelect.dataset.bound = "1";
        matchSelect.addEventListener("change", async () => {
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
    const poolId = sessionStorage.getItem("nsk2_pool_id");
    const lagNo = sessionStorage.getItem("nsk2_lag_nr") || "1";
    const matchNo = byId("shiftMatch")?.value || "1";
    if (!poolId) return;

    const pool = await DB.getPool(poolId);
    let row = await DB.getPoolTeamMatchConfig(poolId, lagNo, matchNo);
    if (!row && String(matchNo) !== "1") row = await DB.getPoolTeamMatchConfig(poolId, lagNo, 1);

    const players = await getPlayersCached();
    const coaches = await getCoachesCached();
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

    let coachNames = "—";
    if (row?.id) {
      const lineup = await DB.getLineup(row.id);
      const ids = lineup
        .filter((x) => x.person_type === "coach")
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((x) => shortName(coachMap[String(x.person_id)] || "—"))
        .filter(Boolean);
      if (ids.length) coachNames = ids.join(", ");
    }
    setText("shiftCoachNames", coachNames);

    setActiveShiftTeamButton(lagNo);
    setActiveShiftMatchButton(matchNo);

    const rows = await DB.listShiftSchema(poolId, lagNo, matchNo);
    const wrap = byId("shiftTableWrap");
    if (!wrap) return;

    if (!rows.length) {
      wrap.innerHTML = '<div class="small">Inget bytesschema ännu. Spara laguppställning först.</div>';
      return;
    }

    wrap.innerHTML = `
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
            const shiftNo = i + 1;
            const names = (Array.isArray(r.players_json) ? r.players_json : [])
              .map((id) => shortName(playerMap[String(id)] || "—"))
              .join("<br>");
            const done = r.done ? "done" : "";
            return `
              <tr>
                <td class="check-cell"><span class="shift-check ${done}" data-shift-toggle="${shiftNo}"></span></td>
                <td>${shiftNo}</td>
                <td>${esc(r.time_left)}</td>
                <td class="shift-players">${names || "—"}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  async function getCoachNamesForLag(poolId, lagNo) {
    const rows = await DB.listPoolTeamMatchConfigs(poolId);
    const coaches = await getCoachesCached();
    const coachMap = {};
    coaches.forEach((c) => { coachMap[String(c.id)] = c.full_name; });

    const firstRow =
      rows.find((r) => String(r.lag_no) === String(lagNo) && String(r.match_no) === "1") ||
      rows.find((r) => String(r.lag_no) === String(lagNo));

    if (!firstRow?.id) return "—";

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

  async function renderCoachMatchView(poolId, lagNo, matchNo) {
    const rows = await DB.listShiftSchema(poolId, lagNo, matchNo);
    const players = await getPlayersCached();
    const playerMap = {};
    players.forEach((p) => { playerMap[String(p.id)] = p.full_name; });

    if (!rows.length) {
      setText("shiftLabel", "Inget schema");
      setText("currentPlayers", "—");
      setText("nextPlayers", "—");
      setText("currentShiftMeta", "Pågående byte: —");
      setText("nextShiftMeta", "Nästa byte: —");
      setHtml("matchInfo", "");
      return;
    }

    if (matchCurrentShiftIndex < 0) matchCurrentShiftIndex = 0;
    if (matchCurrentShiftIndex > rows.length - 1) matchCurrentShiftIndex = rows.length - 1;

    const current = rows[matchCurrentShiftIndex] || null;
    const next = rows[matchCurrentShiftIndex + 1] || null;

    const row =
      await DB.getPoolTeamMatchConfig(poolId, lagNo, matchNo) ||
      await DB.getPoolTeamMatchConfig(poolId, lagNo, 1);

    const currentClock = current?.time_left || "—";
    const nextClock = next?.time_left || "—";
    const totalShifts = rows.length;

    setText("shiftLabel", `Lag ${lagNo} • Match ${matchNo}`);
    setText("currentShiftMeta", `Pågående byte: ${matchCurrentShiftIndex + 1} av ${totalShifts} • Klockslag ${currentClock}`);
    setText("nextShiftMeta", `Nästa byte: ${next ? (matchCurrentShiftIndex + 2) : "—"} av ${totalShifts} • Klockslag ${nextClock}`);

    setHtml("matchInfo", `
      <div class="matchvy-info-row">Motståndare: <strong>${esc(row?.opponent || "—")}</strong></div>
      <div class="matchvy-info-row">Plan: <strong>${esc(row?.plan || "Plan 1")}</strong></div>
      <div class="matchvy-info-row">Start: <strong>${esc(row?.start_time || "—")}</strong></div>
    `);

    const currentNames = (Array.isArray(current?.players_json) ? current.players_json : [])
      .map((id) => shortName(playerMap[String(id)] || "—"))
      .join("<br>");

    const nextNames = (Array.isArray(next?.players_json) ? next.players_json : [])
      .map((id) => shortName(playerMap[String(id)] || "—"))
      .join("<br>");

    setHtml("currentPlayers", currentNames || "—");
    setHtml("nextPlayers", nextNames || "—");
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

    matchCurrentShiftIndex = 0;
    await renderCoachMatchView(poolId, lagNo, matchNo);

    const prevBtn = byId("prevShiftBtn");
    const nextBtn = byId("nextShiftBtn");

    if (prevBtn && !prevBtn.dataset.boundMatchvy) {
      prevBtn.dataset.boundMatchvy = "1";
      prevBtn.addEventListener("click", async () => {
        matchCurrentShiftIndex = Math.max(0, matchCurrentShiftIndex - 1);
        await renderCoachMatchView(poolId, lagNo, matchNo);
      });
    }

    if (nextBtn && !nextBtn.dataset.boundMatchvy) {
      nextBtn.dataset.boundMatchvy = "1";
      nextBtn.addEventListener("click", async () => {
        const rows = await DB.listShiftSchema(poolId, lagNo, matchNo);
        if (!rows.length) return;
        const currentShiftNo = matchCurrentShiftIndex + 1;
        await DB.setShiftDone(poolId, lagNo, matchNo, currentShiftNo, true);
        matchCurrentShiftIndex = Math.min(rows.length - 1, matchCurrentShiftIndex + 1);
        await renderCoachMatchView(poolId, lagNo, matchNo);
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

  function rowHtml(item, type) {
    return `
      <div class="person-row">
        <div class="person-main">
          <input class="inline-name-input" value="${esc(item.full_name)}" data-inline-${type}="${item.id}">
        </div>
        <div class="row-actions">
          <button class="row-btn danger" type="button" data-delete-${type}="${item.id}">Ta bort</button>
        </div>
      </div>
    `;
  }

  async function renderPlayers() {
    const list = byId("playersList");
    if (!list) return;
    const players = await getPlayersCached();
    list.innerHTML = players.length
      ? players.map((p) => rowHtml(p, "player")).join("")
      : '<div class="muted-note">Inga spelare ännu.</div>';
  }

  async function renderCoaches() {
    const list = byId("coachesList");
    if (!list) return;
    const coaches = await getCoachesCached();
    list.innerHTML = coaches.length
      ? coaches.map((c) => rowHtml(c, "coach")).join("")
      : '<div class="muted-note">Inga tränare ännu.</div>';
  }

  function queueInlinePlayerSave(id, value) {
    clearTimeout(saveTimers[`p_${id}`]);
    saveTimers[`p_${id}`] = setTimeout(async () => {
      await DB.updatePlayer(id, String(value || "").trim());
      clearRosterCache();
    }, 600);
  }

  function queueInlineCoachSave(id, value) {
    clearTimeout(saveTimers[`c_${id}`]);
    saveTimers[`c_${id}`] = setTimeout(async () => {
      await DB.updateCoach(id, String(value || "").trim());
      clearRosterCache();
    }, 600);
  }

  async function flushInlinePlayerSave(id, value) {
    clearTimeout(saveTimers[`p_${id}`]);
    await DB.updatePlayer(id, String(value || "").trim());
    clearRosterCache();
  }

  async function flushInlineCoachSave(id, value) {
    clearTimeout(saveTimers[`c_${id}`]);
    await DB.updateCoach(id, String(value || "").trim());
    clearRosterCache();
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
    await DB.deletePlayer(id);
    clearRosterCache();
    await renderPlayers();
  }

  async function deleteCoach(id) {
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

    await renderPlayers();
    await renderCoaches();

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
        const name = row.goalie_name || "Okänd";
        if (!grouped[name]) grouped[name] = new Set();
        grouped[name].add(row.match_id);
      });

      const rows = Object.entries(grouped)
        .map(([name, set]) => ({ name, count: set.size }))
        .sort((a, b) => b.count - a.count);

      list.innerHTML = rows.map((r) => `
        <div class="listrow">
          <strong>${esc(r.name)}</strong> — ${r.count} matcher
        </div>
      `).join("");
    } catch (err) {
      setText("appError", err?.message || String(err));
    }
  }

  return { init };
})();

window.addEventListener("DOMContentLoaded", () => {
  window.NSK2App.init().catch((err) => {
    const el = document.getElementById("appError");
    if (el) el.textContent = err?.message || String(err);
    console.error(err);
  });
});