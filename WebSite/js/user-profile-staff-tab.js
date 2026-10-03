(function (global) {
  "use strict";

  var ASSET_VER = "20261001staffListPopOpaque1";
  var STAFF_ROSTER_CACHE_KEY = "vc_staff_roster_v2";
  var STAFF_ROSTER_CACHE_TTL_MS = 10 * 60 * 1000;
  // staffTabOrganico1: persist Staff vs Community across reload / community re-paint.
  var STAFF_TAB_STORAGE_KEY = "vc_user_profile_tab_v1";
  var sfPostBusy = false;
  var PROBE_TIMEOUT_MS = 32000;
  /* staffRefreshUnstick1: su F5 failsafe corto — 28s lasciava freeze sulla loader staff */
  var STAFF_PENDING_FAILSAFE_MS = 8000;
  var STAFF_PENDING_FAILSAFE_RELOAD_MS = 3500;
  var STAFF_FAILSAFE_MAX_REARMS = 1;
  var STAFF_FETCH_RETRIES = 5;
  var STAFF_RETRY_GAP_MS = 1100;
  var STAFF_SESSION_CACHE_KEY = "vc_staff_prof_cache_v2";
  var STAFF_SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
  var STAFF_SESSION_CACHE_MAX = 24;
  /* depexStaffWipe1: after full depex, hide Staff tab for this user until a real staff payload returns. */
  var EX_STAFF_SESSION_KEY = "vc_ex_staff_v1";
  var EX_STAFF_TTL_MS = 6 * 60 * 60 * 1000;
  var staffPendingFailsafeTimer = null;
  var staffFailsafeRearms = 0;
  var staffActionReloadTimer = null;
  var state = {
    targetUserId: "",
    staffAvailable: false,
    activeTab: "community",
    staffLoaded: false,
    staffLoading: false,
    staffProbePending: false,
    staffLoadSeq: 0,
    communityHtml: "",
    probeDone: false,
    probeInFlight: null,
    rosterIds: null,
    rosterPeople: null,
    rosterInFlight: null,
  };

  function byId(id) {
    return global.document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getToken() {
    try {
      var t = global.localStorage.getItem("vc_discord_access_token");
      if (!t) return "";
      var exp = Number(global.localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function readCachedDiscordUserId() {
    try {
      var t = getToken();
      if (!t) return "";
      var exp = Number(global.localStorage.getItem("vc_discord_expires_at") || "0");
      var fp = exp + "|" + String(t).slice(0, 32);
      var raw = global.sessionStorage.getItem("vc_discord_me_cache_v1");
      if (!raw) return "";
      var o = JSON.parse(raw);
      if (!o || o.v !== 1 || !o.user || String(o.fp || "") !== fp) return "";
      if (Date.now() - Number(o.at || 0) > 180000) return "";
      var uid = String(o.user.id || "").trim();
      return /^\d{17,20}$/.test(uid) ? uid : "";
    } catch (eCache) {
      return "";
    }
  }

  function resolveViewerUserId() {
    try {
      var fromProf =
        global.__VC_DISCORD_PROFILE && global.__VC_DISCORD_PROFILE.id
          ? String(global.__VC_DISCORD_PROFILE.id)
          : "";
      if (/^\d{17,20}$/.test(fromProf)) return fromProf;
    } catch (eProf) {}
    return readCachedDiscordUserId();
  }

  function clearStaffTabPending() {
    try {
      global.document.documentElement.classList.remove("vc-user-profile-staff-tab-pending");
    } catch (eClear) {}
    if (staffPendingFailsafeTimer) {
      global.clearTimeout(staffPendingFailsafeTimer);
      staffPendingFailsafeTimer = null;
    }
    staffFailsafeRearms = 0;
  }

  function setStaffBootBlock(on) {
    try {
      global.document.documentElement.classList.toggle("vc-staff-boot-block", Boolean(on));
    } catch (eBoot) {}
  }

  function clearStaffBootChrome() {
    clearStaffTabPending();
    setStaffBootBlock(false);
  }

  function staffPaneHasTerminalError(root) {
    try {
      var pane = root && root.querySelector("[data-vc-profile-staff-pane]");
      return Boolean(pane && pane.querySelector(".vc-staff-prof-miss, .vc-user-profile-staff-empty"));
    } catch (eMiss) {
      return false;
    }
  }

  function isExStaffApiOut(out) {
    var data = (out && out.data) || {};
    var status = out && out.res ? Number(out.res.status || 0) : 0;
    var err = String((data && data.error) || "").trim();
    if (err === "not_staff_profile" || err === "not_in_guild") return true;
    if ((status === 403 || status === 404) && (err === "not_staff" || err === "forbidden" || err === "not_in_guild")) return true;
    if (data && data.ok && data.prospect) return true;
    return false;
  }

  function readExStaffMap() {
    try {
      var raw = global.sessionStorage.getItem(EX_STAFF_SESSION_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && typeof o === "object" ? o : {};
    } catch (e) {
      return {};
    }
  }

  function writeExStaffMap(map) {
    try {
      global.sessionStorage.setItem(EX_STAFF_SESSION_KEY, JSON.stringify(map || {}));
    } catch (e) {}
  }

  function markExStaff(userId) {
    var uid = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(uid)) return;
    var map = readExStaffMap();
    map[uid] = Date.now();
    writeExStaffMap(map);
  }

  function clearExStaffMark(userId) {
    var uid = String(userId || "").trim();
    if (!uid) return;
    var map = readExStaffMap();
    if (!map[uid]) return;
    delete map[uid];
    writeExStaffMap(map);
  }

  function isMarkedExStaff(userId) {
    var uid = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(uid)) return false;
    var map = readExStaffMap();
    var at = Number(map[uid] || 0);
    if (!at) return false;
    if (Date.now() - at > EX_STAFF_TTL_MS) {
      delete map[uid];
      writeExStaffMap(map);
      return false;
    }
    return true;
  }

  function wipeStaffPaneDom(root) {
    if (!root) return;
    try {
      var pane = root.querySelector("[data-vc-profile-staff-pane]");
      if (!pane) return;
      pane.innerHTML = "";
      pane.hidden = true;
      pane.removeAttribute("data-vc-staff-user");
    } catch (eWipe) {}
    try {
      if (global.VCStaffProfileRender && typeof global.VCStaffProfileRender.unmountStaffPeerDock === "function") {
        global.VCStaffProfileRender.unmountStaffPeerDock();
      }
    } catch (eDock) {}
  }

  function redirectExStaffToCommunity(root, userId) {
    var tid = String(userId || state.targetUserId || parseProfileIdFromUrl() || "").trim();
    state.staffLoading = false;
    state.staffLoaded = false;
    state.staffAvailable = false;
    state.probeDone = true;
    state.staffProbePending = false;
    state.cachedStaffPayload = null;
    try {
      clearSessionStaffCache(tid);
    } catch (eCache) {}
    try {
      markExStaff(tid);
    } catch (eMark) {}
    clearStaffBootChrome();
    clearStaffTabPending();
    state.activeTab = "community";
    persistActiveTab("community");
    try {
      if (/^\d{17,20}$/.test(tid)) {
        global.history.replaceState(null, "", profileUrl(tid, "community"));
      }
    } catch (eH) {}
    if (!root) return;
    try {
      wipeStaffPaneDom(root);
    } catch (eWipe2) {}
    try {
      renderSwitcher(root, tid);
    } catch (eSw) {}
    try {
      showCommunity(root, tid);
    } catch (eComm) {}
  }

  function paintStaffLoadFailure(root, userId, message, opts) {
    opts = opts || {};
    state.staffLoading = false;
    clearStaffBootChrome();
    try {
      global.document.documentElement.classList.remove("vc-user-profile-pending");
    } catch (ePend) {}
    if (!root || state.activeTab !== "staff") return;
    if (String(state.targetUserId || "") !== String(userId || "")) return;
    // staffKeepWarm1: never wipe a profile that already painted successfully
    // (soft-refresh / community detach race used to replace it with “non visualizzabile”).
    if (!opts.forceWipe && staffPanelMounted(root)) {
      state.staffLoaded = true;
      clearStaffTabPending();
      setStaffBootBlock(false);
      return;
    }
    state.staffLoaded = false;
    var pane = ensureStaffPane(root);
    pane.hidden = false;
    pane.innerHTML = staffPaneHtml(
      false,
      message || "Impossibile mostrare il profilo staff. Riprova.",
    );
    bindStaffBootActions(root, userId);
    try {
      var boots = root.querySelectorAll("[data-vc-profile-boot]");
      for (var bi = 0; bi < boots.length; bi += 1) boots[bi].remove();
    } catch (eBootRm) {}
  }

  function isStaffReloadNavigation() {
    try {
      var nav =
        global.performance && typeof global.performance.getEntriesByType === "function"
          ? global.performance.getEntriesByType("navigation")[0]
          : null;
      if (nav && nav.type === "reload") return true;
    } catch (eNav) {}
    try {
      if (global.performance && global.performance.navigation && global.performance.navigation.type === 1) {
        return true;
      }
    } catch (eNav2) {}
    return false;
  }

  function staffPendingFailsafeMs() {
    return isStaffReloadNavigation() ? STAFF_PENDING_FAILSAFE_RELOAD_MS : STAFF_PENDING_FAILSAFE_MS;
  }

  function armStaffPendingFailsafe(root, userId) {
    if (staffPendingFailsafeTimer) global.clearTimeout(staffPendingFailsafeTimer);
    var armedFor = String(userId || state.targetUserId || "").trim();
    var armedSeq = Number(state.staffLoadSeq || 0);
    var maxRearms = isStaffReloadNavigation() ? 0 : STAFF_FAILSAFE_MAX_REARMS;
    staffPendingFailsafeTimer = global.setTimeout(function () {
      staffPendingFailsafeTimer = null;
      try {
        if (String(state.targetUserId || "") !== armedFor) return;
        if (Number(state.staffLoadSeq || 0) !== armedSeq) return;
        var htmlEl = global.document && global.document.documentElement;
        if (!htmlEl || !htmlEl.classList.contains("vc-user-profile-staff-tab-pending")) {
          if (!(root && state.activeTab === "staff" && !staffPanelMounted(root))) return;
        }
        if (root && staffPanelMounted(root)) {
          clearStaffTabPending();
          setStaffBootBlock(false);
          return;
        }
        if (staffPaneHasTerminalError(root)) {
          clearStaffBootChrome();
          return;
        }
        // Still fetching: at most one rearm — then force-clear overlay (staffSwitchStuck1).
        // staffRefreshUnstick1: su reload zero rearm.
        if (state.staffLoading && staffFailsafeRearms < maxRearms) {
          staffFailsafeRearms += 1;
          armStaffPendingFailsafe(root, armedFor);
          return;
        }
        state.probeDone = true;
        state.staffProbePending = false;
        state.staffLoading = false;
        if (state.activeTab === "staff" && !targetIsRealStaff()) {
          redirectExStaffToCommunity(root, armedFor);
          return;
        }
        /* staffRefreshUnstick1: meglio pane parziale / retry UI che freeze infinito */
        clearStaffBootChrome();
        try {
          if (root && !staffPanelMounted(root) && !staffPaneHasTerminalError(root)) {
            paintStaffLoadFailure(
              root,
              armedFor,
              "Caricamento troppo lento. Riprova o torna a Community.",
            );
          }
        } catch (ePaint) {
          paintStaffLoadFailure(
            root,
            armedFor,
            "Caricamento troppo lento. Riprova o torna a Community.",
          );
        }
      } catch (eFs) {
        clearStaffBootChrome();
      }
    }, staffPendingFailsafeMs());
  }

  function isCurrentStaffLoad(userId, loadSeq) {
    return (
      String(state.targetUserId || "") === String(userId || "") &&
      state.activeTab === "staff" &&
      Number(state.staffLoadSeq || 0) === Number(loadSeq || 0)
    );
  }

  function parseProfileIdFromUrl() {
    try {
      var q = new URLSearchParams(global.location.search || "");
      var fromQuery = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
      if (/^\d{17,20}$/.test(fromQuery)) return fromQuery;
      var m = String(global.location.pathname || "").match(/^\/users?\/(\d{17,20})\/?$/);
      if (m) return m[1];
    } catch (e) {}
    return "";
  }

  function readCachedViewerStaff() {
    try {
      var raw =
        global.sessionStorage.getItem("vc_staff_access_ok_v2") ||
        global.localStorage.getItem("vc_staff_access_ok_v2_local");
      if (!raw) return false;
      var data = JSON.parse(raw);
      return Boolean(data && data.ok === true && Number(data.exp || 0) > Date.now());
    } catch (e) {
      return false;
    }
  }

  function readCachedMenuStaffAllowed() {
    try {
      var token = getToken();
      if (!token) return false;
      var raw = global.sessionStorage.getItem("vc_menu_staff_v1");
      if (!raw) return false;
      var data = JSON.parse(raw);
      var exp = String(global.localStorage.getItem("vc_discord_expires_at") || "");
      var fp = exp + "|" + String(token).slice(0, 32);
      if (String(data.fp || "") !== fp) return false;
      if (Date.now() - Number(data.at || 0) > 300000) return false;
      return Boolean(data.allowed);
    } catch (e) {
      return false;
    }
  }

  function viewerIsStaff() {
    if (global.__VC_STAFF_MENU_ALLOWED === true) return true;
    if (global.__VC_STAFF_PERMS && global.__VC_STAFF_PERMS.ok === true) return true;
    if (readCachedViewerStaff()) return true;
    if (readCachedMenuStaffAllowed()) return true;
    return false;
  }

  function viewerIsHighStaff() {
    var p = global.__VC_STAFF_PERMS || {};
    return Boolean(p.isHighStaff || p.canManage || p.highStaff);
  }

  function isViewingSelf(userId) {
    var viewer = resolveViewerUserId();
    var target = String(userId || state.targetUserId || parseProfileIdFromUrl() || "").trim();
    return Boolean(viewer && target && viewer === target);
  }

    function targetIsRealStaff() {
    var p = state.cachedStaffPayload;
    if (p && p.ok && p.prospect) return false;
    if (p && p.ok && !p.prospect) return true;
        if (state.staffAvailable && !state.staffProbePending) return true;
    return false;
  }

  function targetSessionLooksStaff(userId) {
    try {
      var cached = readSessionStaffCache(userId);
      return Boolean(cached && cached.ok && !cached.prospect);
    } catch (eCache) {
      return false;
    }
  }

  function viewerMaySeeStaffTab(userId) {
    if (!getToken()) return false;
    var target = String(userId || state.targetUserId || parseProfileIdFromUrl() || "").trim();
    if (isMarkedExStaff(target)) return false;
    if (isViewingSelf(target)) {
      if (viewerIsStaff()) return true;
      if (targetIsRealStaff()) return true;
      if (state.staffAvailable || state.staffLoaded) return true;
      if (targetSessionLooksStaff(target)) return true;
      if (readCachedViewerStaff() || readCachedMenuStaffAllowed()) return true;
      return false;
    }
    if (!viewerIsStaff()) return false;
    if (targetIsRealStaff()) return true;
    if (targetSessionLooksStaff(target)) return true;
    // Solo se il probe ha confermato staff reale (non prospect / non 404).
    if (
      String(state.targetUserId || "") === target &&
      state.staffAvailable &&
      !state.staffProbePending &&
      !(state.cachedStaffPayload && state.cachedStaffPayload.prospect)
    ) {
      return true;
    }
    return false;
  }

  function viewerMayProspectPex(userId) {
    if (!viewerIsHighStaff()) return false;
    if (isViewingSelf(userId)) return false;
    var p = state.cachedStaffPayload;
    if (p && p.ok && p.prospect && p.canProspectPex !== false) return true;
    return false;
  }

  function profileApiBase() {
    var c = global.__VC_STAFF_PROFILE || {};
    var local = String(c.apiUrlLocal || "").trim();
    var base = String(c.apiUrl || "/webhooks/site-staff-profile").trim();
    try {
      var h = String(global.location.hostname || "").toLowerCase();
      var isLocal = h === "localhost" || h === "127.0.0.1" || h === "[::1]";
      if (isLocal && local && local !== "#" && !/\{\{/.test(local)) base = local;
    } catch (eL) {}
    if (!base || base === "#" || /\{\{/.test(base)) base = "/webhooks/site-staff-profile";
    try {
      if (/^https?:\/\//i.test(base)) {
        var apiU = new URL(base);
        var pageU = new URL(global.location.href);
        if (apiU.host !== pageU.host && apiU.protocol === pageU.protocol) {
          base = apiU.pathname + (apiU.search || "");
        }
      }
    } catch (eN) {}
    return base;
  }

  function profileApiUrl(userId, opts) {
    var base = profileApiBase();
    var id = String(userId || "").trim();
    if (!id) return base;
    var sep = base.indexOf("?") >= 0 ? "&" : "?";
    var url = base + sep + "userId=" + encodeURIComponent(id);
    if (opts && opts.fresh) url += "&fresh=1";
    return url;
  }

  function readStoredActiveTab() {
    try {
      var raw = global.sessionStorage.getItem(STAFF_TAB_STORAGE_KEY);
      if (!raw) raw = global.localStorage.getItem(STAFF_TAB_STORAGE_KEY);
      var tab = String(raw || "").trim().toLowerCase();
      return tab === "staff" ? "staff" : tab === "community" ? "community" : "";
    } catch (e) {
      return "";
    }
  }

  function persistActiveTab(tab) {
    var t = String(tab || "").trim().toLowerCase() === "staff" ? "staff" : "community";
    try {
      if (t === "staff") global.sessionStorage.setItem(STAFF_TAB_STORAGE_KEY, t);
      else global.sessionStorage.removeItem(STAFF_TAB_STORAGE_KEY);
    } catch (eS) {}
    try {
      /* non sticky su localStorage: aprendo un profilo non deve ripescare Staff */
      global.localStorage.removeItem(STAFF_TAB_STORAGE_KEY);
    } catch (eL) {}
  }

  function parseActiveTabFromUrl() {
    try {
      var q = new URLSearchParams(global.location.search || "");
      var tab = String(q.get("tab") || "").trim().toLowerCase();
      if (tab === "staff") return "staff";
      if (tab === "community") return "community";
    } catch (e) {}
    // profileTabDefaultCommunity1: senza ?tab=staff → Community (apri da staff / reload azione).
    // Il refresh su Staff resta ok perché switchTab/ensureTabInUrl tengono ?tab=staff in URL.
    return "community";
  }

  function profileUrl(userId, tab) {
    var id = String(userId || "").trim();
    var t = String(tab || "community").trim().toLowerCase();
    var url = id ? "/user/?id=" + encodeURIComponent(id) : "/user/";
    if (t === "staff") url += (url.indexOf("?") >= 0 ? "&" : "?") + "tab=staff";
    return url;
  }

  function ensureTabInUrl(userId, tab) {
    var tid = String(userId || state.targetUserId || "").trim();
    var t = String(tab || state.activeTab || "community").trim().toLowerCase();
    if (t !== "staff") t = "community";
    persistActiveTab(t);
    try {
      var want = profileUrl(tid, t);
      var cur = String(global.location.pathname || "") + String(global.location.search || "");
      if (cur !== want) global.history.replaceState(null, "", want);
    } catch (eHist) {}
  }

  function organicoApiUrl(opts) {
    var c = global.__VC_STAFF_ORGANICO || {};
    var local = String(c.apiUrlLocal || "").trim();
    var base = String(c.apiUrl || "/webhooks/site-staff-organico").trim();
    try {
      var h = String(global.location.hostname || "").toLowerCase();
      if ((h === "localhost" || h === "127.0.0.1") && local && !/\{\{/.test(local)) base = local;
    } catch (e) {}
    if (/\{\{/.test(base)) base = "/webhooks/site-staff-organico";
        if (opts && opts.rosterOnly) {
      base += (base.indexOf("?") >= 0 ? "&" : "?") + "rosterOnly=1";
    }
    return base;
  }

  function readRosterCache() {
    try {
      var raw = global.sessionStorage.getItem(STAFF_ROSTER_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.ids) || !parsed.ids.length) return null;
      if (Date.now() - Number(parsed.ts || 0) > STAFF_ROSTER_CACHE_TTL_MS) return null;
      var ids = parsed.ids.map(String).filter(function (id) {
        return /^\d{17,20}$/.test(id);
      });
      if (!ids.length) return null;
      if (Array.isArray(parsed.people) && parsed.people.length) {
        state.rosterPeople = parsed.people
          .map(function (p) {
            if (!p) return null;
            var id = String(p.userId || "").trim();
            if (!/^\d{17,20}$/.test(id)) return null;
            return {
              userId: id,
              displayName: String(p.displayName || id).trim() || id,
              avatarUrl: String(p.avatarUrl || "").trim(),
              roleLabel: String(p.roleLabel || "").trim(),
              onPause: Boolean(p.onPause),
              isNew: Boolean(p.isNew),
              isStaffDelMese: Boolean(p.isStaffDelMese),
              isStaffDelSettimana: Boolean(p.isStaffDelSettimana),
            };
          })
          .filter(Boolean);
      }
      return ids;
    } catch (e) {
      return null;
    }
  }

  function writeRosterCache(ids, people) {
    try {
      global.sessionStorage.setItem(
        STAFF_ROSTER_CACHE_KEY,
        JSON.stringify({ ts: Date.now(), ids: ids || [], people: people || [] }),
      );
    } catch (eW) {}
  }

  function flattenRosterIds(sections) {
    return flattenRosterPeople(sections).map(function (p) {
      return p.userId;
    });
  }

  function flattenRosterPeople(sections) {
    var out = [];
    var seen = {};
    (sections || []).forEach(function (sec) {
      var roleLabel = String((sec && (sec.roleLabel || sec.title || sec.label)) || "").trim();
      (sec.members || []).forEach(function (m) {
        var id = String((m && m.userId) || "").trim();
        if (!/^\d{17,20}$/.test(id) || seen[id]) return;
        seen[id] = true;
        out.push({
          userId: id,
          displayName: String((m && (m.displayName || m.username)) || id).trim() || id,
          avatarUrl: String((m && m.avatarUrl) || "").trim(),
          roleLabel: String((m && m.displayRoleLabel) || roleLabel || "").trim(),
          onPause: Boolean(m && m.onPause),
          isNew: Boolean(m && m.isNew),
          isStaffDelMese: Boolean(m && m.isStaffDelMese),
          isStaffDelSettimana: Boolean(m && m.isStaffDelSettimana),
        });
      });
    });
    return out;
  }

  function ensureStaffRoster() {
    if (state.rosterIds && state.rosterIds.length) return Promise.resolve(state.rosterIds);
    var cached = readRosterCache();
    if (cached && cached.length) {
      state.rosterIds = cached;
      return Promise.resolve(cached);
    }
    if (state.rosterInFlight) return state.rosterInFlight;
    var token = getToken();
    if (!token) return Promise.resolve([]);
    state.rosterInFlight = fetch(organicoApiUrl({ rosterOnly: true }), {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (out) {
        state.rosterInFlight = null;
        var sections =
          out && out.res && out.res.ok && out.data && out.data.ok ? out.data.sections : [];
        var people = flattenRosterPeople(sections);
        var ids = people.map(function (p) {
          return p.userId;
        });
        state.rosterPeople = people;
        state.rosterIds = ids;
        if (ids.length) writeRosterCache(ids, people);
        return ids;
      })
      .catch(function () {
        state.rosterInFlight = null;
        return state.rosterIds || [];
      });
    return state.rosterInFlight;
  }

  function ensureStaffPeople() {
    return ensureStaffRoster().then(function () {
      if (state.rosterPeople && state.rosterPeople.length) return state.rosterPeople;
            state.rosterIds = null;
      state.rosterInFlight = null;
      try {
        global.sessionStorage.removeItem(STAFF_ROSTER_CACHE_KEY);
      } catch (eRm) {}
      return ensureStaffRoster().then(function () {
        return state.rosterPeople || [];
      });
    });
  }

  function neighborsFor(userId, ids) {
    var list = ids || [];
    var uid = String(userId || "").trim();
    if (list.length < 2) return { prev: "", next: "" };
    var idx = list.indexOf(uid);
    if (idx < 0) return { prev: list[list.length - 1] || "", next: list[0] || "" };
    return {
      prev: list[(idx - 1 + list.length) % list.length] || "",
      next: list[(idx + 1) % list.length] || "",
    };
  }

  function navigateStaffPeer(userId) {
    var id = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(id)) return;
    var url = profileUrl(id, "staff");
    try {
      global.history.pushState({ vcStaffPeer: id }, "", url);
    } catch (eHist) {
      try {
        global.location.assign(url);
      } catch (eGo) {
        global.location.href = url;
      }
      return;
    }
    var root = byId("vc-user-profile-view");
    // profileSwitchFix1 / profileDataLock1: peer change invalidates community shell for previous user.
    try {
      if (global.VCUserProfilePage && typeof global.VCUserProfilePage.lockCommunityUser === "function") {
        global.VCUserProfilePage.lockCommunityUser(id);
      }
    } catch (eLockPeer) {}
    try {
      var staleShell = root && root.querySelector(":scope > .vc-user-profile-shell");
      if (staleShell) {
        staleShell.setAttribute("data-vc-community-stale", "1");
        staleShell.setAttribute("data-vc-community-user", "");
        try {
          var staleRank = global.document.getElementById("vc-user-rankcard-image");
          if (staleRank) {
            staleRank.removeAttribute("src");
            staleRank.removeAttribute("data-vc-rank-for");
          }
        } catch (eRankPeer) {}
      }
    } catch (eStale) {}
    try {
      state.staffLoaded = false;
      // staffPeerFix2: keep mem payload if it already matches the peer (prefetch hit).
      if (!payloadMatchesUser(state.cachedStaffPayload, id)) {
        state.cachedStaffPayload = null;
      }
      var pane = root && root.querySelector("[data-vc-profile-staff-pane]");
      if (pane) pane.setAttribute("data-vc-staff-user", "");
    } catch (ePane) {}
    sync(id, root);
    try {
      global.dispatchEvent(new CustomEvent("vc:profile-id-changed", { detail: { userId: id } }));
    } catch (eEv) {}
  }

  function setBodyTabClass(tab) {
    try {
      var body = global.document.body;
      if (!body) return;
      body.classList.toggle("vc-user-profile-staff-tab", tab === "staff");
      body.classList.toggle("vc-staff-profile-home", tab === "staff");
    } catch (e) {}
  }

  function ensureSwitcher(root) {
    if (!root) return null;
    var bar = root.querySelector("[data-vc-profile-tabs]");
    if (bar) return bar;
    bar = global.document.createElement("nav");
    bar.className = "vc-user-profile-tabs";
    bar.setAttribute("data-vc-profile-tabs", "1");
    bar.setAttribute("aria-label", "Sezione profilo");
    bar.hidden = true;
    var shell = root.querySelector(".vc-user-profile-shell");
    if (shell) shell.insertAdjacentElement("beforebegin", bar);
    else root.insertAdjacentElement("afterbegin", bar);
    return bar;
  }

  function renderSwitcher(root, userId) {
    var bar = ensureSwitcher(root);
    if (!bar) return;
    var pending =
      global.document.documentElement.classList.contains("vc-user-profile-pending") ||
      Boolean(root && root.querySelector(":scope > .vc-user-profile-loader, :scope > [data-vc-profile-boot]"));
    var mayShow = viewerMaySeeStaffTab(userId);
    var mayPex = viewerMayProspectPex(userId);
    // switcherReload1: durante pending/probe non distruggere lo switcher già montato
    // (reload profilo staff/PM: race paintCommunityChrome vs probe/staff-access).
    var waitEligibility =
      Boolean(getToken()) &&
      !mayShow &&
      !mayPex &&
      !isMarkedExStaff(userId) &&
      (state.staffProbePending ||
        (!state.probeDone && (viewerIsStaff() || isViewingSelf(userId))) ||
        targetSessionLooksStaff(userId));
    if (pending || waitEligibility) {
      bar.hidden = true;
      if (isMarkedExStaff(userId) || (!mayShow && !mayPex && state.probeDone)) {
        bar.innerHTML = "";
      }
      syncStaffListDockForTab(userId);
      return;
    }
    if (!mayShow && !mayPex) {
      bar.hidden = true;
      bar.innerHTML = "";
      syncStaffListDockForTab(userId);
      return;
    }
        if (!mayShow && mayPex) {
      bar.hidden = false;
      bar.innerHTML =
        '<div class="vc-user-profile-tabs__inner vc-user-profile-tabs__inner--pex" role="group" aria-label="Pex utente">' +
        '<button type="button" class="vc-user-profile-tabs__btn vc-user-profile-tabs__btn--pex" data-vc-profile-pex="1">' +
        '<i class="fa fa-arrow-up" aria-hidden="true"></i><span>Pex</span></button></div>';
      var pexBtn = bar.querySelector("[data-vc-profile-pex]");
      if (pexBtn) {
        pexBtn.addEventListener("click", function (ev) {
          ev.preventDefault();
          openProspectPexFromCommunity(root, userId);
        });
      }
      syncStaffListDockForTab(userId);
      return;
    }
    bar.hidden = false;
    var commActive = state.activeTab !== "staff";
    var staffActive = state.activeTab === "staff";
    bar.innerHTML =
      '<div class="vc-user-profile-tabs__inner" role="tablist">' +
      '<a class="vc-user-profile-tabs__btn' +
      (commActive ? " is-active" : "") +
      '" role="tab" aria-selected="' +
      (commActive ? "true" : "false") +
      '" href="' +
      esc(profileUrl(userId, "community")) +
      '" data-vc-profile-tab="community"><i class="fa fa-users" aria-hidden="true"></i><span>Community</span></a>' +
      '<a class="vc-user-profile-tabs__btn' +
      (staffActive ? " is-active" : "") +
      '" role="tab" aria-selected="' +
      (staffActive ? "true" : "false") +
      '" href="' +
      esc(profileUrl(userId, "staff")) +
      '" data-vc-profile-tab="staff"><i class="fa fa-shield" aria-hidden="true"></i><span>Staff</span></a>' +
      "</div>";
    bar.querySelectorAll("[data-vc-profile-tab]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        var tab = btn.getAttribute("data-vc-profile-tab") || "community";
        if (tab === state.activeTab) {
          ev.preventDefault();
          return;
        }
        ev.preventDefault();
        switchTab(root, userId, tab);
      });
    });
    syncStaffListDockForTab(userId);
  }

  function syncStaffListDockForTab(userId) {
    if (!global.VCStaffProfileRender || typeof global.VCStaffProfileRender.syncStaffListDock !== "function") {
      return;
    }
    var root = byId("vc-user-profile-view");
    var tokenOk = Boolean(getToken());
    var onStaff = state.activeTab === "staff";
    // staffTabOrganico1 / organicoPhone1: non richiedere !staffLoading; non unmount
    // se lo staff è già stampato (su telefono community re-paint smontava il dock).
    var panelOk = staffPanelMounted(root);
    var ready =
      onStaff &&
      (panelOk || state.staffLoaded) &&
      (viewerMaySeeStaffTab(userId) ||
        (tokenOk && (state.staffLoaded || Boolean(state.cachedStaffPayload))));
    if (!ready && onStaff && state.staffLoaded) {
      ready = tokenOk || viewerMaySeeStaffTab(userId);
    }
    global.VCStaffProfileRender.syncStaffListDock({
      visible: ready,
      currentUserId: userId,
      getStaffList: function () {
        return ensureStaffPeople();
      },
      onPeerNavigate: function (peerId) {
        navigateStaffPeer(peerId);
      },
    });
    if (ready) {
      try {
        setBodyTabClass("staff");
      } catch (eBody) {}
      ensureStaffPeople()
        .then(function (people) {
          if (!people || !people.length) return;
          if (state.activeTab !== "staff") return;
          if (String(state.targetUserId || "") !== String(userId || "")) return;
          try {
            var neighbors = neighborsFor(userId, state.rosterIds || []);
            if (global.VCStaffProfileRender && typeof global.VCStaffProfileRender.mountStaffPeerDock === "function") {
              global.VCStaffProfileRender.mountStaffPeerDock(neighbors, {
                onPeerNavigate: function (peerId) {
                  navigateStaffPeer(peerId);
                },
              });
            }
            if (global.VCStaffProfileRender && typeof global.VCStaffProfileRender.fillStaffListPop === "function") {
              global.VCStaffProfileRender.fillStaffListPop(people, userId);
            }
          } catch (eDockLate) {}
        })
        .catch(function () {});
    }
  }

  var organicoRemountTimer = 0;
  function scheduleOrganicoRemount(userId) {
    var uid = String(userId || state.targetUserId || "").trim();
    if (!/^\d{17,20}$/.test(uid)) return;
    if (organicoRemountTimer) {
      try {
        global.clearTimeout(organicoRemountTimer);
      } catch (eClr) {}
      organicoRemountTimer = 0;
    }
    var delays = [0, 80, 220, 600];
    var i = 0;
    function tick() {
      if (state.activeTab !== "staff") return;
      if (String(state.targetUserId || "") !== uid) return;
      try {
        clearStaffBootChrome();
      } catch (eBoot) {}
      try {
        setBodyTabClass("staff");
      } catch (eBody2) {}
      try {
        syncStaffListDockForTab(uid);
      } catch (eSync) {}
      try {
        remountStaffPeerDock(byId("vc-user-profile-view"), uid);
      } catch (ePeer) {}
      i += 1;
      if (i < delays.length) {
        organicoRemountTimer = global.setTimeout(tick, Math.max(0, delays[i] - delays[i - 1]));
      }
    }
    tick();
  }

  function openProspectPexFromCommunity(root, userId) {
    var payload = state.cachedStaffPayload;
    if (!payload || !payload.ok || !payload.prospect) {
      fetchStaffProfile(userId, PROBE_TIMEOUT_MS).then(function (out) {
        var data = (out && out.data) || {};
        if (!(out && out.res && out.res.ok && data.ok && data.prospect)) return;
        state.cachedStaffPayload = data;
        writeSessionStaffCache(userId, data);
        openProspectPexFromCommunity(root, userId);
      });
      return;
    }
    var Modal = global.VCStaffManageModal;
    var ensure =
      Modal && typeof Modal.ensureScripts === "function" ? Modal.ensureScripts() : Promise.resolve();
    ensure
      .then(function () {
        return waitForStaffRender(5000);
      })
      .then(function (ready) {
        if (!ready || !global.VCStaffProfileRender) return;
        if (typeof global.VCStaffProfileRender.runProspectPexFlow === "function") {
          global.VCStaffProfileRender.runProspectPexFlow(payload, {
            onReload: function () {
              loadStaffTab(root, userId, { force: true }).then(function () {
                renderSwitcher(root, userId);
                if (targetIsRealStaff()) {
                  if (staffPanelMounted(root)) switchTab(root, userId, "staff");
                  else switchTab(root, userId, "community");
                }
              });
            },
          });
          return;
        }
                state.activeTab = "staff";
        try {
          global.history.replaceState(null, "", profileUrl(userId, "staff"));
        } catch (eH) {}
        showStaff(root, userId);
        renderSwitcher(root, userId);
      });
  }

  function classicProfileBootHtml(opts) {
    opts = opts || {};
    var staff = Boolean(opts.staff);
    // staffLoadMatch2: staff = fullscreen come gli altri gate (no --inline card).
    return (
      '<div class="vc-user-profile-loader vc-user-profile-boot' +
      (staff ? "" : " vc-user-profile-boot--inline") +
      '" data-vc-profile-boot' +
      (staff ? ' data-vc-staff-loading="1"' : "") +
      ' role="status" aria-live="polite" aria-label="' +
      (staff ? "Caricamento profilo staff" : "Caricamento profilo") +
      '">' +
      '<span class="vc-user-profile-loader__spin" aria-hidden="true"></span>' +
      '<p class="vc-user-profile-loader__title">' +
      (staff ? "Caricamento profilo staff" : "Caricamento profilo") +
      "</p>" +
      '<p class="vc-user-profile-loader__sub">' +
      (staff ? "Sto aprendo la scheda… un attimo." : "Sto recuperando le statistiche dell'utente...") +
      "</p>" +
      "</div>"
    );
  }

  function pageAlreadyHasProfileLoader(root) {
    if (root && root.querySelector("[data-vc-profile-boot]")) return true;
    try {
      if (global.document.documentElement.classList.contains("vc-user-profile-pending")) return true;
      if (global.document.getElementById("vc-user-profile-loading")) return true;
    } catch (e) {}
    return false;
  }

  function communityShellPainted(root) {
    if (!root) return false;
    return Boolean(
      root.querySelector(
        ":scope > .vc-user-profile-shell .vc-user-profile-hero, :scope > .vc-user-profile-shell .vc-user-profile-empty",
      ),
    );
  }

    function shouldShowStaffPaneLoader(root) {
    return communityShellPainted(root) && !pageAlreadyHasProfileLoader(root);
  }

  function staffPaneHtml(loading, errorMsg) {
    if (loading) {
      return classicProfileBootHtml({ staff: true });
    }
    if (errorMsg) {
      return (
        '<div class="vc-user-profile-empty vc-user-profile-staff-empty vc-staff-prof-miss" role="alert">' +
        '<div class="vc-staff-prof-miss__mark" aria-hidden="true">' +
        '<span class="vc-staff-prof-miss__glyph">!</span>' +
        "</div>" +
        '<h2 class="vc-staff-prof-miss__title">Profilo staff non disponibile</h2>' +
        '<p class="vc-staff-prof-miss__text">' +
        esc(errorMsg) +
        "</p>" +
        '<div class="vc-staff-boot-actions">' +
        '<button type="button" class="vc-staff-prof-miss__cta" data-vc-staff-escape="retry">Riprova</button>' +
        '<button type="button" class="vc-staff-prof-miss__cta vc-staff-prof-miss__cta--ghost" data-vc-staff-escape="community">Community</button>' +
        "</div></div>"
      );
    }
    return '<div id="vc-user-profile-staff-panel" class="vc-staff-profile" hidden></div>';
  }

  function bindStaffBootActions(root, userId) {
    if (!root || root.getAttribute("data-vc-staff-boot-bound") === "1") return;
    root.setAttribute("data-vc-staff-boot-bound", "1");
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-vc-staff-escape]") : null;
      if (!btn || !root.contains(btn)) return;
      ev.preventDefault();
      var act = btn.getAttribute("data-vc-staff-escape") || "";
      var tid = String(state.targetUserId || parseProfileIdFromUrl() || userId || "").trim();
      if (act === "community") {
        clearStaffTabPending();
        switchTab(root, tid, "community");
        return;
      }
      if (act === "retry") {
        clearStaffTabPending();
        // Always fresh on manual Riprova so API drops poisoned member caches.
        loadStaffTab(root, tid, { force: true, forceLoader: true, quiet: false, purgeCache: true, fresh: true });
      }
    });
  }

  function ensureStaffPane(root) {
    var pane = root.querySelector("[data-vc-profile-staff-pane]");
    if (pane) return pane;
    pane = global.document.createElement("div");
    pane.className = "vc-user-profile-staff-pane";
    pane.setAttribute("data-vc-profile-staff-pane", "1");
    pane.hidden = true;
    root.appendChild(pane);
    return pane;
  }

  function tagStaffPaneUser(root, userId) {
    try {
      var pane = ensureStaffPane(root);
      if (pane && userId) pane.setAttribute("data-vc-staff-user", String(userId));
    } catch (eTag) {}
  }

  function readSessionStaffBag() {
    try {
      var raw = global.sessionStorage.getItem(STAFF_SESSION_CACHE_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      if (!o || typeof o !== "object") return {};
      // Migrate legacy single-entry cache.
      if (o.userId && o.data) {
        var legacy = {};
        legacy[String(o.userId)] = { at: Number(o.at || 0) || Date.now(), data: o.data };
        return legacy;
      }
      return o.entries && typeof o.entries === "object" ? o.entries : o;
    } catch (e) {
      return {};
    }
  }

  function writeSessionStaffBag(entries) {
    try {
      global.sessionStorage.setItem(
        STAFF_SESSION_CACHE_KEY,
        JSON.stringify({ v: 2, entries: entries || {} }),
      );
    } catch (e) {}
  }

  function readSessionStaffCache(userId) {
    try {
      var uid = String(userId || "").trim();
      if (!uid) return null;
      if (isMarkedExStaff(uid)) return null;
      var entries = readSessionStaffBag();
      var hit = entries[uid];
      if (!hit || !hit.data || !hit.data.ok) return null;
      if (Date.now() - Number(hit.at || 0) > STAFF_SESSION_CACHE_TTL_MS) {
        delete entries[uid];
        writeSessionStaffBag(entries);
        return null;
      }
      /* staffSwitchIdLock1: scarta cache con identity vuota/sbagliata */
      if (!payloadMatchesUser(hit.data, uid)) {
        delete entries[uid];
        writeSessionStaffBag(entries);
        return null;
      }
      return hit.data;
    } catch (e) {
      return null;
    }
  }

  function writeSessionStaffCache(userId, data) {
    try {
      if (!data || !data.ok || data.prospect) return;
      var uid = String(userId || "").trim();
      if (!uid) return;
      /* staffSwitchIdLock1: non cacheare body senza identity / mismatch */
      if (!payloadMatchesUser(data, uid)) return;
      clearExStaffMark(uid);
      var entries = readSessionStaffBag();
      entries[uid] = { at: Date.now(), data: data };
      var keys = Object.keys(entries);
      if (keys.length > STAFF_SESSION_CACHE_MAX) {
        keys
          .sort(function (a, b) {
            return Number((entries[a] && entries[a].at) || 0) - Number((entries[b] && entries[b].at) || 0);
          })
          .slice(0, keys.length - STAFF_SESSION_CACHE_MAX)
          .forEach(function (k) {
            delete entries[k];
          });
      }
      writeSessionStaffBag(entries);
    } catch (e) {}
  }

  function clearSessionStaffCache(userId) {
    try {
      if (!userId) {
        global.sessionStorage.removeItem(STAFF_SESSION_CACHE_KEY);
        try {
          global.sessionStorage.removeItem("vc_staff_prof_cache_v1");
        } catch (eOld) {}
        return;
      }
      var uid = String(userId || "").trim();
      var entries = readSessionStaffBag();
      if (entries[uid]) {
        delete entries[uid];
        writeSessionStaffBag(entries);
      }
    } catch (e) {
      try {
        global.sessionStorage.removeItem(STAFF_SESSION_CACHE_KEY);
      } catch (e2) {}
    }
  }

  function prefetchStaffPeerProfiles(userId) {
    try {
      var roster = state.rosterIds || readRosterCache() || [];
      var n = neighborsFor(userId, roster);
      [n.prev, n.next].forEach(function (peerId) {
        var pid = String(peerId || "").trim();
        if (!/^\d{17,20}$/.test(pid) || pid === String(userId || "")) return;
        if (readSessionStaffCache(pid)) return;
        fetchStaffProfile(pid, PROBE_TIMEOUT_MS, 1, { fresh: false }).then(function (out) {
          var data = (out && out.data) || {};
          if (out && out.res && out.res.ok && data.ok && payloadMatchesUser(data, pid)) {
            writeSessionStaffCache(pid, data);
          }
        });
      });
    } catch (ePref) {}
  }

  function isTransientStaffFail(out) {
    var status = out && out.res ? Number(out.res.status || 0) : 0;
    var err = String(((out && out.data) || {}).error || "").trim();
    if (
      err === "member_unavailable" ||
      err === "guild_unavailable" ||
      err === "timeout" ||
      err === "aborted"
    ) {
      return true;
    }
    return status === 0 || status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
  }

  function withClientTimeout(promise, timeoutMs) {
    var ms = Math.max(2500, Number(timeoutMs) || PROBE_TIMEOUT_MS);
    return new Promise(function (resolve) {
      var done = false;
      var timer = global.setTimeout(function () {
        if (done) return;
        done = true;
        resolve({
          res: { ok: false, status: 408 },
          data: { ok: false, error: "timeout", message: "Timeout profilo staff." },
        });
      }, ms);
      Promise.resolve(promise)
        .then(function (out) {
          if (done) return;
          done = true;
          global.clearTimeout(timer);
          resolve(out || { res: { ok: false, status: 0 }, data: {} });
        })
        .catch(function () {
          if (done) return;
          done = true;
          global.clearTimeout(timer);
          resolve({
            res: { ok: false, status: 0 },
            data: { ok: false, error: "network", message: "Errore di rete." },
          });
        });
    });
  }

  function fetchStaffProfileOnce(userId, timeoutMs, opts) {
    var token = getToken();
    if (!token) {
      return Promise.resolve({ res: { status: 401, ok: false }, data: { ok: false, message: "Accedi per continuare." } });
    }
    try {
      var readyPref = global.__VC_STAFF_PROFILE_PREFETCH_RESULT;
      if (
        readyPref &&
        String(readyPref.userId || "") === String(userId || "") &&
        readyPref.out &&
        readyPref.out.res &&
        readyPref.out.data &&
        !(opts && opts.fresh)
      ) {
        global.__VC_STAFF_PROFILE_PREFETCH_RESULT = null;
        return Promise.resolve(readyPref.out);
      }
    } catch (eReady) {}
    var pref = global.__VC_STAFF_PROFILE_PREFETCH;
        if (
      pref &&
      String(pref.userId || "") === String(userId || "") &&
      pref.promise &&
      !(opts && opts.fresh) &&
      !(opts && opts._skipPrefetch)
    ) {
      var p = pref.promise;
      try {
        global.__VC_STAFF_PROFILE_PREFETCH = null;
      } catch (eClearPref) {}
      // staffFirstStamp1: never treat a failed/hung early prefetch as the final answer.
      return withClientTimeout(p, timeoutMs).then(function (out) {
        var data = (out && out.data) || {};
        var ok = Boolean(out && out.res && out.res.ok && data.ok);
        if (ok) return out;
        return fetchStaffProfileOnce(userId, timeoutMs, Object.assign({}, opts || {}, { fresh: false, _skipPrefetch: true }));
      });
    }
    if (opts && opts._skipPrefetch) {
      // fall through to network
    }
    var url = profileApiUrl(userId, opts);
    var ms = Math.max(2500, Number(timeoutMs) || PROBE_TIMEOUT_MS);
    var T = global.VCStaffTools;
    if (T && T.fetchJson) {
      return T.fetchJson(url, { method: "GET", timeoutMs: ms });
    }
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    var req = fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { res: res, data: data };
        });
    });
    if (ctrl) {
      timer = global.setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eAbort) {}
      }, ms);
    }
    return req
      .catch(function (err) {
        var aborted = err && (err.name === "AbortError" || /abort/i.test(String(err && err.message || "")));
        return {
          res: { ok: false, status: aborted ? 408 : 0 },
          data: { ok: false, message: aborted ? "Timeout profilo staff." : "Errore di rete." },
        };
      })
      .then(function (out) {
        if (timer) global.clearTimeout(timer);
        return out;
      });
  }

  function fetchStaffProfile(userId, timeoutMs, retriesLeft, opts) {
    var left = retriesLeft == null ? STAFF_FETCH_RETRIES : Number(retriesLeft);
    if (!(left >= 0)) left = 0;
    return fetchStaffProfileOnce(userId, timeoutMs, opts).then(function (out) {
      var data = (out && out.data) || {};
      var ok = Boolean(out && out.res && out.res.ok && data.ok);
      if (ok || left <= 0 || !isTransientStaffFail(out)) return out;
      return new Promise(function (resolve) {
        global.setTimeout(function () {
          resolve(fetchStaffProfile(userId, timeoutMs, left - 1, opts));
        }, STAFF_RETRY_GAP_MS);
      });
    });
  }

  function consumeProbeResponse(out) {
    state.staffProbePending = false;
    var data = (out && out.data) || {};
    var status = out && out.res ? Number(out.res.status || 0) : 0;
    var ok = Boolean(out && out.res && out.res.ok && data.ok);
    if (ok && data.prospect) {
      state.staffAvailable = false;
      state.probeDone = true;
      state.cachedStaffPayload = null;
      return false;
    }
    if (ok) {
      state.staffAvailable = true;
      state.cachedStaffPayload = data;
      state.probeDone = true;
      try {
        var pid = String(
          (data.identity && (data.identity.userId || data.identity.id)) ||
            data.targetUserId ||
            state.targetUserId ||
            "",
        ).trim();
        if (/^\d{17,20}$/.test(pid)) clearExStaffMark(pid);
      } catch (eClr) {}
      return true;
    }
    state.staffAvailable = false;
    if (isExStaffApiOut(out) || status === 403 || status === 401 || status === 404) {
      state.probeDone = true;
      state.cachedStaffPayload = null;
    } else {
      state.probeDone = false;
    }
    return false;
  }

  function probeStaffProfile(userId, opts) {
    opts = opts || {};
    var token = getToken();
    if (!token) {
      state.staffAvailable = false;
      state.probeDone = true;
      state.staffProbePending = false;
      return Promise.resolve(false);
    }
    if (state.probeInFlight && state.targetUserId === String(userId || "") && !opts.force) {
      return state.probeInFlight;
    }
    state.staffProbePending = true;
        state.probeInFlight = fetchStaffProfile(userId, PROBE_TIMEOUT_MS)
      .then(function (out) {
        consumeProbeResponse(out);
        return state.staffAvailable;
      })
      .catch(function (err) {
        try {
          console.warn("[vc-staff] probe failed", err);
        } catch (eW) {}
        state.staffProbePending = false;
        state.probeDone = false;
        return false;
      })
      .then(function (ok) {
        state.probeInFlight = null;
        return ok;
      });
    return state.probeInFlight;
  }

  function applyTabVisibility(root) {
    if (!root) return;
    var isStaff = state.activeTab === "staff";
    if (!isStaff) clearStaffTabPending();
        var shell = root.querySelector(":scope > .vc-user-profile-shell");
    var pane = ensureStaffPane(root);
    if (shell) {
      var tid = String(state.targetUserId || "").trim();
      var shellUser = String(shell.getAttribute("data-vc-community-user") || "").trim();
      var shellStale = String(shell.getAttribute("data-vc-community-stale") || "") === "1";
      var shellMismatch =
        !isStaff &&
        /^\d{17,20}$/.test(tid) &&
        (shellStale || (shellUser && shellUser !== tid) || !shellUser);
      if (shellMismatch) {
        try {
          shell.setAttribute("data-vc-community-stale", "1");
          shell.hidden = true;
          shell.setAttribute("aria-hidden", "true");
          shell.style.setProperty("display", "none", "important");
          shell.style.setProperty("visibility", "hidden", "important");
        } catch (eHideBad) {}
      } else {
        shell.hidden = isStaff;
        shell.setAttribute("aria-hidden", isStaff ? "true" : "false");
        if (!isStaff) {
          try {
            shell.style.removeProperty("display");
            shell.style.removeProperty("visibility");
          } catch (eStyle) {}
        }
      }
    }
    pane.hidden = !isStaff;
    pane.setAttribute("aria-hidden", isStaff ? "false" : "true");
    setBodyTabClass(isStaff ? "staff" : "community");
  }

  function waitForStaffRender(maxMs, opts) {
    opts = opts || {};
    var needShop = Boolean(opts.needShop);
    maxMs = Math.max(400, Number(maxMs) || 4000);
    return new Promise(function (resolve) {
      function ready() {
        if (!global.VCStaffProfileRender) return false;
        if (needShop && !global.VCStaffPmShop) return false;
        return true;
      }
      if (ready()) {
        resolve(true);
        return;
      }
      ensureStaffAssets();
      var started = Date.now();
      (function tick() {
        if (ready()) {
          resolve(true);
          return;
        }
        if (Date.now() - started >= maxMs) {
          resolve(Boolean(global.VCStaffProfileRender));
          return;
        }
        global.setTimeout(tick, 40);
      })();
    });
  }

  function maybeAutoOpenManage(root, userId, payload) {
    var want = false;
    try {
      want = String(new URLSearchParams(global.location.search || "").get("manage") || "").trim() === "1";
    } catch (eQ) {}
    if (!want) return;
    try {
      var u = new URL(global.location.href);
      u.searchParams.delete("manage");
      global.history.replaceState({}, "", u.pathname + u.search);
    } catch (eUrl) {}
    var Modal = global.VCStaffManageModal;
    if (!Modal || typeof Modal.open !== "function") return;
    var name = (payload.identity && payload.identity.displayName) || "Staff";
    var ensure = typeof Modal.ensureScripts === "function" ? Modal.ensureScripts() : Promise.resolve();
    ensure.then(function () {
      if (!Modal.viewerCanManageProfile || !Modal.viewerCanManageProfile(payload)) return;
      return Modal.open(userId, {
        displayName: name,
        onUpdated: function (info) {
          if (info && info.leftStaff) {
            redirectExStaffToCommunity(root, userId);
            return;
          }
          if (info && (info.hardRefresh || info.joinedLadder)) {
            hardRefreshStaffProfile(root, userId, info || null);
            return;
          }
          scheduleStaffActionReload(root, userId, info || null);
        },
      });
    });
  }

  function payloadMatchesUser(payload, userId) {
    var uid = String(userId || "").trim();
    if (!payload || !payload.ok || !uid) return false;
    var pid = String(
      (payload.identity && (payload.identity.userId || payload.identity.id)) ||
        payload.targetUserId ||
        "",
    ).trim();
    /* staffSwitchIdLock1: identity vuota ≠ match (prima accettava qualsiasi body) */
    return pid === uid;
  }

  /* staffActionReload3 / depexToast1: dopo manage/pex/depex — fresh reload; mai restoreSnap post-depex. */
  function partnerStatsSig(payload) {
    try {
      var p = (payload && payload.partner) || {};
      return [p.points, p.redeemSpend, p.partnerCount, p.pointsEarned].join("|");
    } catch (e) {
      return "";
    }
  }

  function profileVisualSig(payload) {
    try {
      var r = (payload && payload.role) || {};
      var badges = Array.isArray(r.badges)
        ? r.badges
            .map(function (b) {
              return String((b && (b.label || b.kind || b.roleId)) || "").trim();
            })
            .join(",")
        : "";
      return [
        payload && payload.prospect ? "1" : "0",
        payload && payload.ok ? "1" : "0",
        String(r.label || ""),
        String(r.roleId || ""),
        r.isPm ? "1" : "0",
        badges,
        partnerStatsSig(payload),
      ].join("|");
    } catch (e2) {
      return "";
    }
  }

  function scheduleStaffActionReload(root, userId, reloadOpts) {
    var uid = String(userId || state.targetUserId || "").trim();
    if (!root || !/^\d{17,20}$/.test(uid)) return;
    reloadOpts = reloadOpts || {};
    if (reloadOpts.leftStaff) {
      redirectExStaffToCommunity(root, uid);
      return;
    }
    if (reloadOpts.hardRefresh || reloadOpts.joinedLadder) {
      hardRefreshStaffProfile(root, uid, reloadOpts);
      return;
    }
    if (staffActionReloadTimer) {
      try {
        global.clearTimeout(staffActionReloadTimer);
      } catch (eClr) {
        try {
          console.warn("[vc-staff] clearReloadTimer", eClr);
        } catch (eW) {}
      }
    }
    try {
      clearSessionStaffCache(uid);
      state.cachedStaffPayload = null;
    } catch (ePurge) {}
    staffActionReloadTimer = global.setTimeout(function () {
      staffActionReloadTimer = null;
      if (String(state.targetUserId || "") !== uid || state.activeTab !== "staff") return;
      loadStaffTab(root, uid, {
        force: true,
        quiet: true,
        forceLoader: false,
        purgeCache: true,
        fresh: true,
        _actionReload: true,
      }).then(function () {
        if (String(state.targetUserId || "") !== uid) return;
        /* depexToast1: se già redirect a community (ex-staff), stop. */
        if (state.activeTab !== "staff") return;
        if (staffPanelMounted(root)) return;
        /* Non ripristinare lo snap pre-azione: dopo depex ridava Senior/Staff fantasma. */
        return loadStaffTab(root, uid, {
          force: true,
          quiet: true,
          forceLoader: false,
          purgeCache: true,
          fresh: true,
          _actionReload: true,
          _actionRetry: true,
        }).then(function () {
          if (String(state.targetUserId || "") !== uid || state.activeTab !== "staff") return;
          if (staffPanelMounted(root)) return;
          if (!staffPaneHasTerminalError(root)) {
            paintStaffLoadFailure(
              root,
              uid,
              "Profilo staff ricevuto ma non visualizzabile. Riprova.",
            );
          }
        });
      });
    }, 280);
  }

  /* pexPmHelperClose1: dopo pex PM→Helper chiudi sheet + remount completo staff (come depex). */
  function hardRefreshStaffProfile(root, userId, info) {
    var tid = String(userId || state.targetUserId || "").trim();
    if (!root || !/^\d{17,20}$/.test(tid)) return;
    try {
      clearExStaffMark(tid);
    } catch (eMark) {}
    try {
      clearSessionStaffCache(tid);
    } catch (eCache) {}
    state.cachedStaffPayload = null;
    state.staffLoaded = false;
    state.staffLoading = false;
    state.staffAvailable = true;
    state.probeDone = true;
    state.staffProbePending = false;
    state.activeTab = "staff";
    persistActiveTab("staff");
    try {
      if (/^\d{17,20}$/.test(tid)) {
        global.history.replaceState(null, "", profileUrl(tid, "staff"));
      }
    } catch (eH) {}
    try {
      wipeStaffPaneDom(root);
    } catch (eWipe) {}
    try {
      renderSwitcher(root, tid);
    } catch (eSw) {}
    applyTabVisibility(root);
    loadStaffTab(root, tid, {
      force: true,
      quiet: false,
      forceLoader: true,
      purgeCache: true,
      fresh: true,
      _actionReload: true,
      _hardCareerRefresh: true,
    });
  }

  function renderStaffPanel(root, userId, payload, paintOpts) {
    paintOpts = paintOpts || {};
        return waitForStaffRender(2200, { needShop: false }).then(function (ready) {
      if (String(state.targetUserId || "") !== String(userId || "") || state.activeTab !== "staff") {
        return;
      }
      var cachedRoster = state.rosterIds || readRosterCache() || [];
      var pane = ensureStaffPane(root);
      var panel = pane.querySelector("#vc-user-profile-staff-panel") || byId("vc-user-profile-staff-panel");
      if (!panel) {
        pane.innerHTML = staffPaneHtml(false, "");
        panel = pane.querySelector("#vc-user-profile-staff-panel");
      }
      if (!ready || !panel || !global.VCStaffProfileRender) {
        if (String(state.targetUserId || "") !== String(userId || "")) return;
        pane.innerHTML = staffPaneHtml(
          false,
          "Impossibile caricare il renderer profilo staff. Ricarica la pagina.",
        );
        return;
      }
      function paintWithRoster(rosterIds) {
        if (String(state.targetUserId || "") !== String(userId || "") || state.activeTab !== "staff") {
          // staffPeerFix2: stale load — not a paint failure (do not show “non visualizzabile”).
          return null;
        }
        var neighbors = neighborsFor(userId, rosterIds || []);
        try {
          tagStaffPaneUser(root, userId);
          // Re-resolve panel in case community render detached the previous node.
          panel =
            ensureStaffPane(root).querySelector("#vc-user-profile-staff-panel") ||
            byId("vc-user-profile-staff-panel") ||
            panel;
          if (!panel) {
            ensureStaffPane(root).innerHTML = staffPaneHtml(false, "");
            panel = ensureStaffPane(root).querySelector("#vc-user-profile-staff-panel");
          }
          if (!panel) return false;
          // staffActionReload1 / staffSwitchIdLock1: stamp identity only if empty AND no conflicting target.
          try {
            if (!payload.identity || typeof payload.identity !== "object") payload.identity = {};
            var existingPid = String(payload.identity.userId || payload.identity.id || "").trim();
            var existingTid = String(payload.targetUserId || "").trim();
            if (existingPid && existingPid !== String(userId)) return false;
            if (existingTid && existingTid !== String(userId)) return false;
            if (!payload.identity.userId) payload.identity.userId = String(userId);
            if (!payload.targetUserId) payload.targetUserId = String(userId);
          } catch (eStamp) {}
          var paintedOk = global.VCStaffProfileRender.renderInto(panel, payload, {
            neighbors: neighbors,
            expectedUserId: userId,
          });
          if (!paintedOk) {
            // Recreate host once — stale/detached node after action reload.
            try {
              ensureStaffPane(root).innerHTML = staffPaneHtml(false, "");
              panel = ensureStaffPane(root).querySelector("#vc-user-profile-staff-panel");
              if (panel) {
                paintedOk = global.VCStaffProfileRender.renderInto(panel, payload, {
                  neighbors: neighbors,
                  expectedUserId: userId,
                });
              }
            } catch (eRetry) {
              paintedOk = false;
            }
          }
          if (!paintedOk) return false;
          panel.hidden = false;
          global.VCStaffProfileRender.bindInteractions(panel, payload, {
            neighbors: neighbors,
            onReload: function (reloadOpts) {
              scheduleStaffActionReload(root, userId, reloadOpts || null);
            },
            onPeerNavigate: function (peerId) {
              navigateStaffPeer(peerId);
            },
            getStaffList: function () {
              return ensureStaffPeople();
            },
            setStatus: function () {},
            onSerataFilm: function (willAttend, panelRoot) {
              postSerataFilm(willAttend, panelRoot, function (ok) {
                if (ok) loadStaffTab(root, userId, { force: true, quiet: true, purgeCache: true, fresh: true });
              });
            },
          });
        } catch (ePaint) {
          try {
            console.error("[vc-staff-profile] render failed", ePaint);
          } catch (eLog) {}
          if (String(state.targetUserId || "") !== String(userId || "")) return null;
          paintStaffLoadFailure(root, userId, "Errore nel rendering del profilo staff. Ricarica la pagina.");
          return false;
        }
        return true;
      }

      try {
        var painted = paintWithRoster(cachedRoster);
        if (painted === null) return;
        if (!painted) {
          // staffKeepWarm1: soft refresh must not blank an already-good panel.
          if (paintOpts.softKeep && staffPanelMounted(root)) {
            state.staffLoaded = true;
            clearStaffTabPending();
            setStaffBootBlock(false);
            return;
          }
          // staffSwitchStuck1 / staffPeerFix2: empty HTML / id mismatch — clear overlay.
          paintStaffLoadFailure(
            root,
            userId,
            "Profilo staff ricevuto ma non visualizzabile. Riprova.",
            { forceWipe: !paintOpts.softKeep },
          );
          return;
        }
        if (!staffPanelMounted(root)) {
          if (paintOpts.softKeep) {
            /* staffReloadPaint1: softKeep senza pannello → non clear pending (prima → solo footer). */
            paintStaffLoadFailure(
              root,
              userId,
              "Profilo staff ricevuto ma non visualizzabile. Riprova.",
              { forceWipe: true },
            );
            return;
          }
          paintStaffLoadFailure(
            root,
            userId,
            "Profilo staff ricevuto ma non visualizzabile. Riprova.",
          );
          return;
        }
        maybeAutoOpenManage(root, userId, payload);
        state.staffLoaded = true;
        try {
          var deadBoots = root.querySelectorAll("[data-vc-profile-boot]");
          for (var di = 0; di < deadBoots.length; di += 1) deadBoots[di].remove();
        } catch (eDead) {}
        clearStaffTabPending();
        setStaffBootBlock(false);
        try {
          global.document.documentElement.classList.remove("vc-user-profile-pending");
        } catch (ePend) {}
        try {
          renderSwitcher(root, userId);
        } catch (eSw) {}
        // staffTabOrganico1: patch organico quando roster arriva (anche se ids-only in cache).
        ensureStaffPeople()
          .then(function (people) {
            if (String(state.targetUserId || "") !== String(userId || "")) return;
            if (!staffPanelMounted(root)) return;
            if (state.activeTab !== "staff") return;
            try {
              var neighbors = neighborsFor(userId, state.rosterIds || []);
              payload.__vcStaffNeighbors = neighbors;
              if (state.cachedStaffPayload) state.cachedStaffPayload.__vcStaffNeighbors = neighbors;
              if (global.VCStaffProfileRender && typeof global.VCStaffProfileRender.mountStaffPeerDock === "function") {
                global.VCStaffProfileRender.mountStaffPeerDock(neighbors, {
                  onPeerNavigate: function (peerId) {
                    navigateStaffPeer(peerId);
                  },
                });
              }
              if (
                people &&
                people.length &&
                global.VCStaffProfileRender &&
                typeof global.VCStaffProfileRender.fillStaffListPop === "function"
              ) {
                global.VCStaffProfileRender.fillStaffListPop(people, userId);
              }
              syncStaffListDockForTab(userId);
            } catch (eDock) {}
          })
          .catch(function () {});
        /* organicoPhone1: su telefono il dock veniva nascosto dal boot CSS / race community */
        scheduleOrganicoRemount(userId);
      } catch (eRender) {
        try {
          console.error("[vc-staff-profile] render failed", eRender);
        } catch (eLog2) {}
        paintStaffLoadFailure(root, userId, "Errore nel rendering del profilo staff. Ricarica la pagina.");
      }
    });
  }

  function serataApiUrl() {
    var c = global.__VC_STAFF_SERATAFILM || {};
    var local = String(c.apiUrlLocal || "").trim();
    var base = String(c.apiUrl || "/webhooks/site-staff-seratafilm").trim();
    try {
      var h = String(global.location.hostname || "").toLowerCase();
      if ((h === "localhost" || h === "127.0.0.1") && local && !/\{\{/.test(local)) base = local;
    } catch (e) {}
    if (/\{\{/.test(base)) base = "/webhooks/site-staff-seratafilm";
    return base;
  }

  function applySerataFilmUi(root, willAttend) {
    if (!root) return;
    var bar = root.querySelector(".vc-staff-sf-under, .vc-staff-sf-mini, .vc-staff-sf-bar");
    if (!bar) return;
    var present = Boolean(willAttend);
    bar.classList.toggle("is-present", present);
    bar.classList.toggle("is-absent", !present);
    var status = bar.querySelector(
      ".vc-staff-sf-under__status, .vc-staff-sf-mini__status, .vc-staff-sf-bar__status",
    );
    if (status) status.textContent = present ? "Presente" : "Assente";
    bar.querySelectorAll("[data-sf]").forEach(function (btn) {
      var isPresentBtn = btn.getAttribute("data-sf") === "present";
      btn.classList.toggle("is-active", present ? isPresentBtn : !isPresentBtn);
      btn.setAttribute("aria-pressed", present === isPresentBtn ? "true" : "false");
    });
  }

  function setSerataFilmBusy(root, busy) {
    if (!root) return;
    root.querySelectorAll("[data-sf]").forEach(function (btn) {
      btn.disabled = Boolean(busy);
    });
  }

  function patchCachedSerata(willAttend) {
    try {
      if (state.cachedStaffPayload && state.cachedStaffPayload.serataFilm) {
        state.cachedStaffPayload.serataFilm.willAttend = Boolean(willAttend);
      }
    } catch (e) {}
  }

  function postSerataFilm(willAttend, rootEl, onDone) {
    var root = rootEl;
    var token = getToken();
    if (!token) {
      if (typeof onDone === "function") onDone(false);
      return;
    }
    if (sfPostBusy) return;
    var active = root && root.querySelector("[data-sf].is-active");
    var already =
      active &&
      ((willAttend && active.getAttribute("data-sf") === "present") ||
        (!willAttend && active.getAttribute("data-sf") === "absent"));
    if (already) return;

    var prevAttend = !(active && active.getAttribute("data-sf") === "absent");
    sfPostBusy = true;
    setSerataFilmBusy(root, true);
    applySerataFilmUi(root, willAttend);

    fetch(serataApiUrl(), {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify({ willAttend: Boolean(willAttend) }),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { res: res, data: data };
          });
      })
      .then(function (out) {
        var data = (out && out.data) || {};
        var ok = Boolean(out && out.res && out.res.ok && data.ok);
        sfPostBusy = false;
        setSerataFilmBusy(root, false);
        if (!ok) {
          applySerataFilmUi(root, prevAttend);
          if (typeof onDone === "function") onDone(false);
          return;
        }
        var nextAttend = typeof data.willAttend === "boolean" ? data.willAttend : willAttend;
        applySerataFilmUi(root, nextAttend);
        patchCachedSerata(nextAttend);
        if (typeof onDone === "function") onDone(true, nextAttend);
      })
      .catch(function () {
        sfPostBusy = false;
        setSerataFilmBusy(root, false);
        applySerataFilmUi(root, prevAttend);
        if (typeof onDone === "function") onDone(false);
      });
  }

  function loadStaffTab(root, userId, opts) {
    opts = opts || {};
    var pane = ensureStaffPane(root);
    pane.hidden = false;
    bindStaffBootActions(root, userId);
    var loadSeq = Number(state.staffLoadSeq || 0) + 1;
    state.staffLoadSeq = loadSeq;
    staffFailsafeRearms = 0;
    var purgeCache =
      opts.purgeCache === false
        ? false
        : Boolean(opts.purgeCache || (opts.force && opts.fresh === true));
        var quiet = Boolean(opts.forceLoader)
      ? false
      : Boolean(opts.quiet) || !shouldShowStaffPaneLoader(root);
    try {
      if (global.VCStaffProfileRender && typeof global.VCStaffProfileRender.unmountStaffPeerDock === "function") {
        global.VCStaffProfileRender.unmountStaffPeerDock();
      }
    } catch (eUnDock) {}
    setStaffBootBlock(true);
    try {
      global.document.documentElement.classList.add("vc-user-profile-staff-tab-pending");
    } catch (ePendOn) {}

    // staffPeerFix2: keep warm mem/session for this user; only purge on explicit Riprova/fresh.
    var memKeep =
      state.cachedStaffPayload &&
      state.cachedStaffPayload.ok &&
      payloadMatchesUser(state.cachedStaffPayload, userId)
        ? state.cachedStaffPayload
        : null;
    if (purgeCache) {
      clearSessionStaffCache(userId);
      state.cachedStaffPayload = null;
      memKeep = null;
    } else if (!memKeep) {
      state.cachedStaffPayload = null;
    }

    var sessionHit = purgeCache ? null : readSessionStaffCache(userId) || memKeep;
    if (sessionHit && !sessionHit.prospect) {
      try {
        var r0 = sessionHit.role || {};
        var b0 = Array.isArray(r0.badges) ? r0.badges : [];
        var okRole =
          (String(r0.label || "").trim() && String(r0.label || "").trim() !== "—") ||
          Boolean(r0.roleId) ||
          b0.length > 0 ||
          Boolean(r0.isPm) ||
          Boolean(sessionHit.partner);
        if (!okRole) sessionHit = null;
      } catch (eHit) {
        sessionHit = null;
      }
    } else if (sessionHit && sessionHit.prospect) {
      sessionHit = null;
    }

    // Warm paint: skip full-screen loader when we already have a usable cache.
    if (sessionHit && !opts.forceLoader) quiet = true;

    if (!quiet) {
      if (!pane.querySelector("[data-vc-staff-loading]") && !pane.querySelector("[data-vc-profile-boot]")) {
        pane.innerHTML = staffPaneHtml(true, "");
      }
    } else if (
      !staffPanelMounted(root) &&
      !pane.querySelector("#vc-user-profile-staff-panel") &&
      !pane.querySelector("[data-vc-staff-loading], :scope > [data-vc-profile-boot]")
    ) {
      pane.innerHTML = '<div id="vc-user-profile-staff-panel" class="vc-staff-profile" hidden></div>';
    }
    state.staffLoading = true;
    state.staffLoaded = false;
    armStaffPendingFailsafe(root, userId);

    if (sessionHit) {
      state.cachedStaffPayload = sessionHit;
            return renderStaffPanel(root, userId, sessionHit).then(function () {
        if (!isCurrentStaffLoad(userId, loadSeq)) return;
        state.staffLoading = false;
        setStaffBootBlock(false);
        try {
          syncStaffListDockForTab(userId);
        } catch (eDockDone) {}
        function afterWarmPaint() {
          if (!isCurrentStaffLoad(userId, loadSeq)) return null;
          function runSoftRefresh() {
            if (!isCurrentStaffLoad(userId, loadSeq)) return null;
            prefetchStaffPeerProfiles(userId);
            var paintedSig = profileVisualSig(sessionHit);
            return fetchStaffProfile(userId, PROBE_TIMEOUT_MS, 1, { fresh: true }).then(function (out) {
              if (!isCurrentStaffLoad(userId, loadSeq)) return;
              var data = (out && out.data) || {};
              var ok = Boolean(out && out.res && out.res.ok && data.ok);
              if (isExStaffApiOut(out)) {
                redirectExStaffToCommunity(root, userId);
                return;
              }
              // staffKeepWarm1: failed/skewed fresh fetch must not blank the warm UI.
              if (!ok || !payloadMatchesUser(data, userId)) return;
              state.cachedStaffPayload = data;
              writeSessionStaffCache(userId, data);
              var changed = profileVisualSig(data) !== paintedSig;
              if (!staffPanelMounted(root) || changed || opts._actionReload) {
                return renderStaffPanel(root, userId, data, { softKeep: true });
              }
            });
          }
          // staffKeepWarm1: warm paint OK even if panel briefly detached — keep it, soft-refresh quietly.
          if (staffPanelMounted(root)) {
            state.staffLoaded = true;
            clearStaffTabPending();
            return runSoftRefresh();
          }
          if (state.activeTab === "staff" && !staffPaneHasTerminalError(root)) {
            // One quiet remount attempt; never replace a race with “non visualizzabile”.
            return renderStaffPanel(root, userId, sessionHit, { softKeep: true }).then(function () {
              if (!isCurrentStaffLoad(userId, loadSeq)) return;
              if (staffPanelMounted(root)) {
                state.staffLoaded = true;
                clearStaffTabPending();
                setStaffBootBlock(false);
                return runSoftRefresh();
              }
              /* staffSwitchIdLock1: warm fail → failure UI, non clear a vuoto */
              paintStaffLoadFailure(
                root,
                userId,
                "Profilo staff non visualizzabile. Riprova.",
                { forceWipe: true },
              );
            });
          }
          /* staffSwitchIdLock1: no silent clearStaffBootChrome su pane vuoto */
          if (!staffPanelMounted(root) && state.activeTab === "staff") {
            paintStaffLoadFailure(
              root,
              userId,
              "Profilo staff non visualizzabile. Riprova.",
              { forceWipe: true },
            );
          }
          return null;
        }
        // Yield so community renderProfile can re-attach the saved staff pane first.
        return new Promise(function (resolve) {
          global.setTimeout(function () {
            resolve(afterWarmPaint());
          }, 60);
        });
      });
    }

    var req = fetchStaffProfile(userId, PROBE_TIMEOUT_MS, null, {
      fresh: Boolean(purgeCache || opts.fresh),
    });
    // Kick roster in parallel with profile fetch (staffPeerFix2).
    try {
      ensureStaffRoster();
    } catch (eRostEarly) {}
    return req
      .then(function (out) {
        if (!isCurrentStaffLoad(userId, loadSeq)) return;
        var data = (out && out.data) || {};
        var ok = Boolean(out && out.res && out.res.ok && data.ok);
        if (!ok) {
          var status = out && out.res ? Number(out.res.status || 0) : 0;
          var errCode = String((data && data.error) || "").trim();
          if (isExStaffApiOut(out)) {
            redirectExStaffToCommunity(root, userId);
            return;
          }
          if (
            !opts._autoRetried &&
            (status === 503 || errCode === "member_unavailable" || status === 408 || status === 0) &&
            isTransientStaffFail(out)
          ) {
            if (!quiet) {
              pane.innerHTML = staffPaneHtml(true, "");
            }
            return new Promise(function (resolve) {
              global.setTimeout(function () {
                if (!isCurrentStaffLoad(userId, loadSeq)) {
                  resolve();
                  return;
                }
                resolve(
                  loadStaffTab(root, userId, {
                    // Soft retry: keep caches warm; force only hurts Discord member resolve.
                    force: false,
                    quiet: quiet,
                    forceLoader: !quiet,
                    _autoRetried: true,
                  }),
                );
              }, 1100);
            });
          }
          // Transient fail after retries: keep loader + silent soft retry instead of hard error.
          if (isTransientStaffFail(out) && !opts._hardFail) {
            if (!quiet) pane.innerHTML = staffPaneHtml(true, "");
            return new Promise(function (resolve) {
              global.setTimeout(function () {
                if (!isCurrentStaffLoad(userId, loadSeq)) {
                  resolve();
                  return;
                }
                resolve(
                  loadStaffTab(root, userId, {
                    force: true,
                    quiet: true,
                    purgeCache: false,
                    _autoRetried: true,
                    _hardFail: true,
                  }),
                );
              }, 1600);
            });
          }
          // Last transient miss: keep loader + one more delayed fresh attempt instead of hard error.
          if (isTransientStaffFail(out) && opts._hardFail && !opts._lastFresh) {
            if (!quiet) pane.innerHTML = staffPaneHtml(true, "");
            return new Promise(function (resolve) {
              global.setTimeout(function () {
                if (!isCurrentStaffLoad(userId, loadSeq)) {
                  resolve();
                  return;
                }
                resolve(
                  loadStaffTab(root, userId, {
                    force: true,
                    quiet: false,
                    forceLoader: true,
                    purgeCache: true,
                    fresh: true,
                    _autoRetried: true,
                    _hardFail: true,
                    _lastFresh: true,
                  }),
                );
              }, 2200);
            });
          }
          state.staffLoading = false;
          clearStaffBootChrome();
          pane.innerHTML = staffPaneHtml(
            false,
            data.message || "Impossibile caricare il profilo staff.",
          );
          return;
        }
        if (!payloadMatchesUser(data, userId)) {
          state.staffLoading = false;
          paintStaffLoadFailure(
            root,
            userId,
            "Profilo staff ricevuto ma non visualizzabile. Riprova.",
          );
          return;
        }
        state.cachedStaffPayload = data;
        writeSessionStaffCache(userId, data);
        prefetchStaffPeerProfiles(userId);
        if (!pane.querySelector("#vc-user-profile-staff-panel")) {
          pane.innerHTML = staffPaneHtml(false, "");
        }
        return renderStaffPanel(root, userId, data).then(function () {
          if (!isCurrentStaffLoad(userId, loadSeq)) return;
          state.staffLoading = false;
          setStaffBootBlock(false);
          try {
            syncStaffListDockForTab(userId);
          } catch (eDockDone2) {}
          // staffSwitchStuck1: if paint left us without a mounted panel, force-clear overlay.
          if (!staffPanelMounted(root) && state.activeTab === "staff") {
            if (!staffPaneHasTerminalError(root)) {
              paintStaffLoadFailure(
                root,
                userId,
                "Profilo staff ricevuto ma non visualizzabile. Riprova.",
              );
            } else {
              clearStaffBootChrome();
            }
          }
        });
      })
      .catch(function () {
        if (!isCurrentStaffLoad(userId, loadSeq)) return;
        state.staffLoading = false;
        clearStaffBootChrome();
        pane.innerHTML = staffPaneHtml(false, "Errore di rete nel caricamento profilo staff.");
      });
  }

  function remountStaffPeerDock(root, userId) {
    if (!root || state.activeTab !== "staff") return;
    if (state.staffLoading && !state.staffLoaded) return;
    /* peerArrowsKeep1: se il pannello è montato, togli pending/boot che nascondono le frecce */
    if (staffPanelMounted(root) || state.staffLoaded) {
      try {
        clearStaffBootChrome();
      } catch (eClr) {}
    } else {
      try {
        if (
          global.document.documentElement.classList.contains("vc-user-profile-staff-tab-pending") ||
          global.document.documentElement.classList.contains("vc-staff-boot-block")
        ) {
          return;
        }
      } catch (ePend) {}
    }
    if (!staffPanelMounted(root) && !state.staffLoaded) return;
    var id = String(userId || state.targetUserId || "").trim();
    if (!/^\d{17,20}$/.test(id)) return;
    try {
      var roster = state.rosterIds || readRosterCache() || [];
      var neighbors =
        (state.cachedStaffPayload && state.cachedStaffPayload.__vcStaffNeighbors) ||
        neighborsFor(id, roster);
      if (!neighbors || (!neighbors.prev && !neighbors.next)) return;
      if (global.VCStaffProfileRender && typeof global.VCStaffProfileRender.mountStaffPeerDock === "function") {
        global.VCStaffProfileRender.mountStaffPeerDock(neighbors, {
          onPeerNavigate: function (peerId) {
            navigateStaffPeer(peerId);
          },
        });
      }
    } catch (eDock) {}
  }

  function syncPeerDockEarly(userId) {
    // Mai durante boot: le frecce devono restare nascoste finché il pannello staff è pronto.
    return;
  }

  function paintCommunityChrome(root, userId) {
    if (!root) root = byId("vc-user-profile-view");
    if (!root) return;
    var id = String(userId || state.targetUserId || "").trim();
    // staffTabOrganico1: community re-paint sotto lock non deve ributtare su Community
    // se URL/storage dicono Staff (bug refresh → Community).
    var wantsStaff = false;
    try {
      wantsStaff =
        state.activeTab === "staff" ||
        parseActiveTabFromUrl() === "staff" ||
        readStoredActiveTab() === "staff";
    } catch (eWant) {
      wantsStaff = state.activeTab === "staff";
    }
    if (wantsStaff) {
      if (/^\d{17,20}$/.test(id)) state.targetUserId = id;
      try {
        setBodyTabClass("staff");
      } catch (eBodyStaff) {}
      try {
        renderSwitcher(root, id);
      } catch (eSwStaff) {}
      applyTabVisibility(root);
      /* staffReloadPaint1: se il pane è vuoto dopo community paint, (ri)lancia load staff. */
      try {
        if (!staffPanelMounted(root) && /^\d{17,20}$/.test(id)) {
          showStaff(root, id);
        }
      } catch (eShowStaff) {}
      return;
    }
    state.activeTab = "community";
    persistActiveTab("community");
    if (/^\d{17,20}$/.test(id)) state.targetUserId = id;
    clearStaffTabPending();
    try {
      if (document.body) {
        document.body.classList.remove("vc-user-profile-staff-tab", "vc-staff-profile-home");
      }
    } catch (eBody) {}
    var shellOk = false;
    try {
      var shell = root.querySelector(":scope > .vc-user-profile-shell");
      var shellUser = shell ? String(shell.getAttribute("data-vc-community-user") || "").trim() : "";
      var idEl = shell && shell.querySelector(".vc-user-profile-id");
      var heroOk = Boolean(
        idEl && /^\d{17,20}$/.test(id) && String(idEl.textContent || "").indexOf(id) !== -1,
      );
      shellOk =
        Boolean(shell) &&
        /^\d{17,20}$/.test(id) &&
        shellUser === id &&
        heroOk &&
        String(shell.getAttribute("data-vc-community-stale") || "") !== "1";
    } catch (eOk) {
      shellOk = false;
    }
    if (shellOk) {
      try {
        document.documentElement.classList.remove(
          "vc-user-profile-comm-switch",
          "vc-user-profile-staff-tab-pending",
          "vc-staff-boot-block",
        );
      } catch (eGate) {}
    }
    if (/^\d{17,20}$/.test(id)) {
      try {
        renderSwitcher(root, id);
      } catch (eSw) {}
    }
    applyTabVisibility(root);
    if (/^\d{17,20}$/.test(id)) {
      try {
        renderSwitcher(root, id);
      } catch (eSw2) {}
    }
  }

  function showCommunity(root, userId) {
    state.activeTab = "community";
    var tid = String(userId || state.targetUserId || "").trim();
    if (/^\d{17,20}$/.test(tid)) state.targetUserId = tid;
    persistActiveTab("community");
    ensureTabInUrl(tid, "community");
    if (!root) root = byId("vc-user-profile-view");

    try {
      if (global.VCStaffProfileRender && typeof global.VCStaffProfileRender.unmountStaffPeerDock === "function") {
        global.VCStaffProfileRender.unmountStaffPeerDock();
      }
    } catch (eDock) {}
    try {
      if (global.VCStaffProfileRender && typeof global.VCStaffProfileRender.syncStaffListDock === "function") {
        global.VCStaffProfileRender.syncStaffListDock({ visible: false });
      }
    } catch (eList) {}
    try {
      global.document.documentElement.classList.remove(
        "vc-staff-list-dock-on",
        "vc-staff-peer-dock-on",
        "vc-user-profile-staff-tab-pending",
      );
    } catch (eCls) {}
    setStaffBootBlock(false);

    if (!/^\d{17,20}$/.test(tid)) {
      clearStaffTabPending();
      try {
        if (document.body) {
          document.body.classList.remove("vc-user-profile-staff-tab", "vc-staff-profile-home");
        }
        document.documentElement.classList.remove("vc-user-profile-comm-switch");
      } catch (eBody) {}
      applyTabVisibility(root);
      return;
    }

    try {
      if (global.VCUserProfilePage && typeof global.VCUserProfilePage.lockCommunityUser === "function") {
        global.VCUserProfilePage.lockCommunityUser(tid);
      }
    } catch (eLock) {}

    var fromStaff = false;
    try {
      fromStaff = Boolean(
        document.body && document.body.classList.contains("vc-user-profile-staff-tab"),
      );
    } catch (eFs) {}

    var shell = root ? root.querySelector(":scope > .vc-user-profile-shell") : null;
    var shellUser = shell ? String(shell.getAttribute("data-vc-community-user") || "").trim() : "";
    var heroOk = false;
    try {
      var idEl = shell && shell.querySelector(".vc-user-profile-id");
      heroOk = Boolean(idEl && String(idEl.textContent || "").indexOf(tid) !== -1);
    } catch (eHero) {
      heroOk = false;
    }
    var mismatch = !shell || shellUser !== tid || !heroOk || shell.getAttribute("data-vc-community-stale") === "1";
    /* profileRefreshGate1: cold boot/refresh senza shell ≠ switch staff→community.
       Il gate comm-switch blocca chrome/header: usarlo solo su tab-switch reale o shell sbagliata. */
    var hadWrongShell = Boolean(shell && mismatch);
    var needSwitchGate = Boolean(fromStaff || hadWrongShell);

        var keepStaffSwitch =
      Boolean(state.staffAvailable || state.staffLoaded || state.cachedStaffPayload) &&
      !(state.cachedStaffPayload && state.cachedStaffPayload.prospect);
    if (keepStaffSwitch) {
      state.staffAvailable = true;
      state.probeDone = true;
      if (!state.cachedStaffPayload || !state.cachedStaffPayload.ok) {
        state.cachedStaffPayload = { ok: true, prospect: false };
      }
    }

        // profileSwitchFix1: da staff→community sempre wipe shell (anche se attrs sembrano ok).
    // staffCommSwitch2: wipe + ensure devono sempre ripitturare; gate timeout forza recovery.
    // profileRefreshGate1: refresh/cold (no shell, !fromStaff) → niente gate, solo ensure.
    if (needSwitchGate) {
      try {
        document.documentElement.classList.add("vc-user-profile-comm-switch");
      } catch (eSwCls) {}
      if (shell) {
        try {
          shell.setAttribute("data-vc-community-stale", "1");
          shell.setAttribute("data-vc-community-user", "");
          shell.hidden = true;
          shell.setAttribute("aria-hidden", "true");
          shell.style.setProperty("display", "none", "important");
          shell.remove();
        } catch (eKillShell) {
          try {
            shell.remove();
          } catch (eRm2) {}
        }
      }
    }

    try {
      if (
        global.VCUserProfilePage &&
        typeof global.VCUserProfilePage.ensureCommunityFor === "function"
      ) {
        global.VCUserProfilePage.ensureCommunityFor(tid, root, {
          wipe: Boolean(needSwitchGate),
          switchGate: Boolean(needSwitchGate),
        });
      }
    } catch (eComm) {}

        clearStaffTabPending();
    try {
      if (document.body) {
        document.body.classList.remove("vc-user-profile-staff-tab", "vc-staff-profile-home");
      }
    } catch (eBody2) {}

    if (!staffPanelMounted(root)) state.staffLoaded = false;
    try {
      renderSwitcher(root, tid);
    } catch (eSw) {}
    applyTabVisibility(root);
    try {
      renderSwitcher(root, tid);
    } catch (eSw2) {}

        function clearCommSwitchIfReady() {
      try {
        var shellNow = root.querySelector(":scope > .vc-user-profile-shell");
        var shellUserNow = shellNow
          ? String(shellNow.getAttribute("data-vc-community-user") || "").trim()
          : "";
        var idTxt = String(
          ((shellNow && shellNow.querySelector(".vc-user-profile-id")) || {}).textContent || "",
        );
        var okNow =
          shellNow &&
          shellUserNow === tid &&
          String(shellNow.getAttribute("data-vc-community-stale") || "") !== "1" &&
          /^\d{17,20}$/.test(tid) &&
          idTxt.indexOf(tid) !== -1;
        if (okNow) {
          document.documentElement.classList.remove(
            "vc-user-profile-comm-switch",
            "vc-user-profile-staff-tab-pending",
            "vc-staff-boot-block",
          );
          try {
            shellNow.hidden = false;
            shellNow.setAttribute("aria-hidden", "false");
            shellNow.style.removeProperty("display");
            shellNow.style.removeProperty("visibility");
          } catch (eShowOk) {}
          return true;
        }
      } catch (eGate) {}
      return false;
    }
    if (needSwitchGate && !clearCommSwitchIfReady()) {
      var gateTries = 0;
      var gateTimer = global.setInterval(function () {
        gateTries += 1;
        if (clearCommSwitchIfReady()) {
          try {
            global.clearInterval(gateTimer);
          } catch (eClrT) {}
          return;
        }
        // staffCommSwitch2: dopo ~2.5s riprova ensure; dopo ~5s sblocca con errore (mai bg vuoto).
        // profileRefreshGate1: su reload sblocca prima (~2s).
        var isReloadNav = false;
        try {
          var nav = global.performance && global.performance.getEntriesByType
            ? global.performance.getEntriesByType("navigation")[0]
            : null;
          isReloadNav = Boolean(nav && nav.type === "reload");
        } catch (eNav) {}
        var retryAt = isReloadNav ? 12 : 25;
        var unlockAt = isReloadNav ? 20 : 50;
        if (gateTries === retryAt) {
          try {
            if (
              global.VCUserProfilePage &&
              typeof global.VCUserProfilePage.ensureCommunityFor === "function"
            ) {
              global.VCUserProfilePage.ensureCommunityFor(tid, root, {
                wipe: true,
                switchGate: true,
              });
            }
          } catch (eRetry) {}
        }
        if (gateTries > unlockAt) {
          try {
            global.clearInterval(gateTimer);
          } catch (eClrT2) {}
          try {
            document.documentElement.classList.remove(
              "vc-user-profile-comm-switch",
              "vc-user-profile-staff-tab-pending",
              "vc-staff-boot-block",
            );
          } catch (eGateOff) {}
          try {
            if (
              global.VCUserProfilePage &&
              typeof global.VCUserProfilePage.repairAfterBack === "function"
            ) {
              global.VCUserProfilePage.repairAfterBack();
            }
          } catch (eRepair) {}
        }
      }, 100);
    } else if (!needSwitchGate) {
      try {
        document.documentElement.classList.remove(
          "vc-user-profile-comm-switch",
          "vc-staff-boot-block",
        );
      } catch (eColdGate) {}
    }
  }

  function staffPanelMounted(root) {
    if (!root) return false;
    var panel = root.querySelector("#vc-user-profile-staff-panel");
    if (!panel) return false;
        return Boolean(
      panel.querySelector(".vc-user-profile-shell, .vc-user-profile-hero, .vc-staff-profile-panel"),
    );
  }

  function showStaff(root, userId) {
    state.activeTab = "staff";
    var tid = String(userId || state.targetUserId || "").trim();
    if (/^\d{17,20}$/.test(tid)) state.targetUserId = tid;
    /* depexStaffWipe1: dopo depex completo non ripristinare il pannello fantasma. */
    if (isMarkedExStaff(tid)) {
      redirectExStaffToCommunity(root, tid);
      return;
    }
    ensureTabInUrl(tid, "staff");
    try {
      if (global.VCUserProfilePage && typeof global.VCUserProfilePage.lockCommunityUser === "function") {
        if (/^\d{17,20}$/.test(tid)) global.VCUserProfilePage.lockCommunityUser(tid);
      }
    } catch (eLockStaff) {}
    applyTabVisibility(root);
    var pane = ensureStaffPane(root);
    var mounted = staffPanelMounted(root);
    var paneUser = "";
    try {
      paneUser = String(pane.getAttribute("data-vc-staff-user") || "").trim();
    } catch (ePaneU) {
      paneUser = "";
    }
    var wrongUser = Boolean(paneUser && paneUser !== tid);
    if (!mounted || wrongUser) state.staffLoaded = false;
    /* staffSwitchIdLock1: terminal error su pane sbagliato / nuovo target → wipe + reload
       (prima returnava e lo switch tab/peer restava bloccato). */
    if (staffPaneHasTerminalError(root) && !mounted) {
      if (!wrongUser && !state._forceStaffRetry) {
        pane.hidden = false;
        clearStaffBootChrome();
        return;
      }
      try {
        pane.innerHTML = "";
      } catch (eWipeMiss) {}
      state.staffLoaded = false;
      state.staffLoading = false;
    }
    // profileSwitchFix1: never remount peer-dock alone on an empty/wrong pane.
    if (!state.staffLoaded || !mounted || wrongUser) {
      if (state.staffLoading && (!mounted || wrongUser)) state.staffLoading = false;
      if (!state.staffLoading) {
        // staffPeerFix2 / staffSwitchIdLock1: force loader unless strict warm cache hit.
        var warmHit = readSessionStaffCache(tid);
        loadStaffTab(root, tid, {
          force: Boolean(wrongUser),
          purgeCache: Boolean(wrongUser),
          forceLoader: Boolean(!mounted && !warmHit),
        });
      } else {
        pane.hidden = false;
        if (!pane.querySelector("[data-vc-staff-loading], #vc-user-profile-staff-panel .vc-user-profile-hero")) {
          pane.innerHTML = staffPaneHtml(true, "");
        }
      }
    } else {
      remountStaffPeerDock(root, tid);
      try {
        syncStaffListDockForTab(tid);
      } catch (eList) {}
    }
  }

  function switchTab(root, userId, tab) {
    var tid = String(userId || state.targetUserId || parseProfileIdFromUrl() || "").trim();
    if (!/^\d{17,20}$/.test(tid)) tid = String(userId || "").trim();
    state.activeTab = tab === "staff" ? "staff" : "community";
    if (/^\d{17,20}$/.test(tid)) state.targetUserId = tid;
    persistActiveTab(state.activeTab);
    renderSwitcher(root, tid);
    try {
      var url = profileUrl(tid, state.activeTab);
      global.history.replaceState(null, "", url);
    } catch (eHist) {}
    if (state.activeTab === "staff") showStaff(root, tid);
    else showCommunity(root, tid);
  }

  function maybeRedirectOwnStaffTab() {
    try {
      var q = new URLSearchParams(global.location.search || "");
      var tab = String(q.get("tab") || "").trim().toLowerCase();
      if (tab !== "staff") return;
      var id = String(q.get("id") || q.get("userId") || "").trim();
      if (/^\d{17,20}$/.test(id)) return;
      var viewer = resolveViewerUserId();
      if (/^\d{17,20}$/.test(viewer)) {
        global.location.replace(profileUrl(viewer, "staff"));
      }
    } catch (e) {}
  }

  function finishSync(root, userId) {
        if (state.cachedStaffPayload && state.cachedStaffPayload.ok && state.cachedStaffPayload.prospect) {
      redirectExStaffToCommunity(root, userId);
      return;
    }
    renderSwitcher(root, userId);
    if (state.staffAvailable && state.activeTab === "staff" && targetIsRealStaff()) {
      showStaff(root, userId);
    } else if (state.activeTab === "staff" && (state.staffProbePending || !state.probeDone)) {
      applyTabVisibility(root);
      ensureStaffPane(root).hidden = false;
      if (!state.staffLoaded || !staffPanelMounted(root)) {
        if (shouldShowStaffPaneLoader(root)) {
          ensureStaffPane(root).innerHTML = staffPaneHtml(true, "");
        }
      }
    } else {
      if (state.activeTab === "staff" && state.probeDone && !targetIsRealStaff()) {
        redirectExStaffToCommunity(root, userId);
        return;
      }
      if (state.activeTab !== "staff") showCommunity(root, userId);
      renderSwitcher(root, userId);
    }
        if (state.activeTab !== "staff" || staffPanelMounted(root) || (state.probeDone && !targetIsRealStaff())) {
      clearStaffTabPending();
    } else {
      armStaffPendingFailsafe(root, userId);
    }
  }

  function sync(userId, root) {
    if (!userId) return;
    if (!root) root = byId("vc-user-profile-view");
    if (!root) return;
    bindStaffBootActions(root, userId);
    var prevTarget = state.targetUserId;
    state.targetUserId = String(userId);
    state.activeTab = parseActiveTabFromUrl();
    if (state.activeTab === "staff") {
      persistActiveTab("staff");
      ensureTabInUrl(userId, "staff");
    }
    maybeRedirectOwnStaffTab();
        var peerSwitch = Boolean(prevTarget && prevTarget !== state.targetUserId);

    // Ex-staff / no auth: never leave ?tab=staff hanging on a blank staff pane.
    if (state.activeTab === "staff" && !getToken()) {
      redirectExStaffToCommunity(root, userId);
      return;
    }

    if (peerSwitch) {
      state.probeDone = false;
      state.staffAvailable = false;
      state.staffLoaded = false;
      state.staffLoading = false;
      state.staffProbePending = false;
      state.probeInFlight = null;
      // staffPeerFix2: do not drop warm mem for the new peer (prefetch / session).
      if (!payloadMatchesUser(state.cachedStaffPayload, state.targetUserId)) {
        state.cachedStaffPayload = null;
      }
      try {
        if (global.VCStaffProfileRender && typeof global.VCStaffProfileRender.unmountStaffPeerDock === "function") {
          global.VCStaffProfileRender.unmountStaffPeerDock();
        }
      } catch (eDockRm) {}
      try {
        var oldPane = root.querySelector("[data-vc-profile-staff-pane]");
        if (oldPane) {
          oldPane.removeAttribute("data-vc-staff-user");
          var oldPanel = oldPane.querySelector("#vc-user-profile-staff-panel");
          if (oldPanel && !payloadMatchesUser(state.cachedStaffPayload, state.targetUserId)) {
            oldPanel.innerHTML = "";
          }
        }
      } catch (ePaneClr) {}
            try {
        var staleShell = root.querySelector(":scope > .vc-user-profile-shell");
        if (staleShell) {
          var staleFor = String(staleShell.getAttribute("data-vc-community-user") || "").trim();
          if (staleFor && staleFor !== state.targetUserId) {
            staleShell.setAttribute("data-vc-community-stale", "1");
                        staleShell.setAttribute("data-vc-community-user", "");
          }
        }
      } catch (eStale) {}
    }

        if (!staffPanelMounted(root)) {
      state.staffLoaded = false;
    }

        if (!state.cachedStaffPayload || !state.cachedStaffPayload.ok) {
      try {
        var warm = readSessionStaffCache(userId);
        if (warm && warm.ok && !warm.prospect) {
          state.cachedStaffPayload = warm;
          state.staffAvailable = true;
          state.probeDone = true;
        }
      } catch (eWarm) {}
    }

            try {
      renderSwitcher(root, userId);
    } catch (eSwEarly) {}

    if (state.activeTab === "staff" && getToken()) {
                  var coldBoot = !communityShellPainted(root) && !staffPanelMounted(root);
      if (coldBoot || peerSwitch) {
        try {
          global.document.documentElement.classList.add("vc-user-profile-staff-tab-pending");
        } catch (eP) {}
      } else {
        clearStaffTabPending();
                renderSwitcher(root, userId);
      }
      try {
        if (global.VCStaffProfileRender) {
                    if (peerSwitch && typeof global.VCStaffProfileRender.unmountStaffPeerDock === "function") {
            global.VCStaffProfileRender.unmountStaffPeerDock();
          }
        }
      } catch (eDockHide) {}
      armStaffPendingFailsafe(root, userId);
      applyTabVisibility(root);
            try {
        ensureStaffRoster();
      } catch (eRost) {}
      try {
        syncPeerDockEarly(userId);
      } catch (eDockPeerEarly) {}
      try {
        syncStaffListDockForTab(userId);
      } catch (eDockEarly) {}
            if (!pageAlreadyHasProfileLoader(root) && !communityShellPainted(root) && !staffPanelMounted(root)) {
        root.innerHTML = classicProfileBootHtml({ staff: true });
                renderSwitcher(root, userId);
      } else if (peerSwitch && !staffPanelMounted(root)) {
        /* staffSwitchIdLock1: loader visibile salvo warm cache STRICT match (mai host vuoto hidden). */
        var warmNow = readSessionStaffCache(userId);
        try {
          if (warmNow && warmNow.ok && !warmNow.prospect && payloadMatchesUser(warmNow, userId)) {
            ensureStaffPane(root).innerHTML = staffPaneHtml(true, "");
          } else {
            ensureStaffPane(root).innerHTML = staffPaneHtml(true, "");
          }
        } catch (ePeerBoot) {}
        renderSwitcher(root, userId);
      }
      ensureStaffPane(root).hidden = false;
      // staffPeerFix2: peer switch uses warm session/mem cache (no force purge); soft refresh after paint.
      // Never finishSync early on empty paint — failsafe still clears stuck loaders.
      var warmPeer = peerSwitch ? readSessionStaffCache(userId) : null;
      if (peerSwitch || (!state.staffLoaded && !state.staffLoading)) {
        loadStaffTab(root, userId, {
          quiet: !peerSwitch && !coldBoot,
          forceLoader: Boolean((peerSwitch || coldBoot) && !warmPeer && !state.cachedStaffPayload),
          force: false,
          purgeCache: false,
        }).then(function () {
          if (String(state.targetUserId || "") !== String(userId || "")) return;
          var mountedNow = staffPanelMounted(root);
          if (mountedNow || state.staffLoaded) {
            state.staffAvailable = true;
            state.probeDone = true;
            state.staffProbePending = false;
            try {
              var boots = root.querySelectorAll("[data-vc-profile-boot]");
              for (var bi = 0; bi < boots.length; bi += 1) boots[bi].remove();
            } catch (eBoot) {}
            finishSync(root, userId);
            return;
          }
          // Payload ok but paint failed: do NOT finishSync→showStaff (infinite loader loop).
          if (state.cachedStaffPayload && state.cachedStaffPayload.ok) {
            if (state.cachedStaffPayload.prospect) {
              redirectExStaffToCommunity(root, userId);
              return;
            }
            if (!staffPaneHasTerminalError(root)) {
              paintStaffLoadFailure(
                root,
                userId,
                "Profilo staff ricevuto ma non visualizzabile. Riprova.",
              );
            } else {
              clearStaffBootChrome();
            }
            state.staffAvailable = true;
            state.probeDone = true;
            state.staffProbePending = false;
            try {
              renderSwitcher(root, userId);
            } catch (eSwFail) {}
            return;
          }
          if (peerSwitch && state.activeTab === "staff" && !mountedNow) {
            if (state.staffLoading) return;
            if (staffPaneHasTerminalError(root)) return;
            if (state.probeDone && !state.staffAvailable) {
              redirectExStaffToCommunity(root, userId);
              return;
            }
            paintStaffLoadFailure(
              root,
              userId,
              "Impossibile caricare il profilo staff. Riprova.",
            );
          }
        });
        if (peerSwitch) return;
      }
    }

    if (state.probeDone && state.targetUserId === String(userId) && state.staffAvailable) {
      finishSync(root, userId);
      return;
    }
    if (state.probeDone && state.targetUserId === String(userId) && !state.staffAvailable && !viewerIsStaff()) {
      finishSync(root, userId);
      return;
    }

        if (state.activeTab === "staff" && state.staffLoading) {
      return;
    }

    probeStaffProfile(userId).then(function () {
      finishSync(root, userId);
    });
  }

  function teardownStaffTabAfterLogout() {
    var userId = parseProfileIdFromUrl() || state.targetUserId || "";
    var root = byId("vc-user-profile-view");
    state.activeTab = "community";
    persistActiveTab("community");
    state.staffAvailable = false;
    state.staffLoaded = false;
    state.staffLoading = false;
    state.staffProbePending = false;
    state.probeDone = false;
    state.probeInFlight = null;
    state.cachedStaffPayload = null;
    clearStaffTabPending();
    try {
      if (global.VCStaffProfileRender && typeof global.VCStaffProfileRender.unmountStaffPeerDock === "function") {
        global.VCStaffProfileRender.unmountStaffPeerDock();
      }
    } catch (eDock) {}
    try {
      if (document.body) {
        document.body.classList.remove("vc-user-profile-staff-tab", "vc-staff-profile-home");
      }
      document.documentElement.classList.remove(
        "vc-user-profile-staff-tab-pending",
        "vc-user-profile-comm-switch",
      );
    } catch (eCls) {}
    if (root && /^\d{17,20}$/.test(String(userId))) {
      try {
        global.history.replaceState(null, "", profileUrl(userId, "community"));
      } catch (eHist) {}
      try {
        showCommunity(root, userId);
      } catch (eComm) {}
      try {
        renderSwitcher(root, userId);
      } catch (eSw) {}
    } else if (root) {
      try {
        renderSwitcher(root, userId);
      } catch (eSw2) {}
    }
  }

  function onAuthReady() {
    var userId = parseProfileIdFromUrl() || state.targetUserId;
    if (!userId) return;
    var root = byId("vc-user-profile-view");
    /* authLogoutTabs1: senza sessione smonta tab Staff, non finishSync sul pane staff */
    if (!getToken()) {
      teardownStaffTabAfterLogout();
      return;
    }
    if (root) {
      try {
        renderSwitcher(root, userId);
      } catch (eSwAuth) {}
    }
    if (state.probeDone && state.staffAvailable && state.targetUserId === userId) {
      if (root) finishSync(root, userId);
      return;
    }
    // switcherReload1: probe early senza staff-menu → non restare bloccati su probeDone=false staff.
    if (!state.staffAvailable) {
      state.probeDone = false;
    } else if (viewerIsStaff() && root) {
      try {
        renderSwitcher(root, userId);
      } catch (eSwStaff) {}
    }
    sync(userId, root);
  }

  function watchLateStaffMenu() {
    // Prefetch in user/index.html setta __VC_STAFF_MENU_ALLOWED senza dispatch event.
    if (viewerIsStaff()) {
      onAuthReady();
      return;
    }
    var tries = 0;
    var timer = global.setInterval(function () {
      tries += 1;
      if (viewerIsStaff()) {
        global.clearInterval(timer);
        onAuthReady();
        return;
      }
      if (tries > 50) global.clearInterval(timer);
    }, 100);
  }

  function profileViewBootOnly(root) {
    if (!root) return true;
    if (root.querySelector(".vc-user-profile-shell, .vc-user-profile-notfound, .vc-user-profile-empty")) return false;
    return Boolean(root.querySelector("[data-vc-profile-boot]"));
  }

  function scheduleEarlySync() {
    var userId = parseProfileIdFromUrl();
    if (!userId) return;
    state.targetUserId = userId;
    state.activeTab = parseActiveTabFromUrl();
    ensureStaffAssets();
    function run() {
      var root = byId("vc-user-profile-view");
      if (!root) return false;
      var wantsStaff = state.activeTab === "staff" || parseActiveTabFromUrl() === "staff";
            if (wantsStaff) {
        if (!getToken()) {
          // No session: never keep ?tab=staff (blank/infinite). Drop to community.
          redirectExStaffToCommunity(root, userId);
          if (profileViewBootOnly(root)) return false;
          return true;
        }
        state.activeTab = "staff";
        sync(userId, root);
        return true;
      }
      if (profileViewBootOnly(root)) return false;
      sync(userId, root);
      return true;
    }
    if (run()) return;
    global.document.addEventListener("DOMContentLoaded", function () {
      if (run()) return;
      var tries = 0;
      var timer = global.setInterval(function () {
        tries += 1;
        if (run() || tries > 80) global.clearInterval(timer);
      }, 40);
    });
  }

  function ensureStaffAssets() {
    if (global.__vcStaffProfAssetsRequested) return;
    global.__vcStaffProfAssetsRequested = true;
    var head = global.document.head || global.document.getElementsByTagName("head")[0];
    if (!head) return;
    if (!global.document.querySelector('link[data-vc-staff-prof-css="1"]')) {
      var link = global.document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/css/staff-pause.css?v=" + ASSET_VER;
      link.setAttribute("data-vc-staff-prof-css", "1");
      head.appendChild(link);
    } else {
      try {
        global.document.querySelector('link[data-vc-staff-prof-css="1"]').href =
          "/css/staff-pause.css?v=" + ASSET_VER;
      } catch (eHref) {}
    }
    function alreadyHasScript(srcBase, attr) {
      if (global.document.querySelector("script[" + attr + '="1"]')) return true;
      if (global.document.querySelector("script[" + attr + "]")) return true;
      var scripts = global.document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i += 1) {
        var src = String(scripts[i].src || "");
        if (src.indexOf(srcBase) >= 0) {
          try {
            scripts[i].setAttribute(attr, "1");
          } catch (eAttr) {}
          return true;
        }
      }
      return false;
    }
    function loadScript(src, attr, srcBase) {
      if (alreadyHasScript(srcBase || src.split("?")[0], attr)) return;
      var s = global.document.createElement("script");
      s.src = src;
      s.async = false;
      s.setAttribute(attr, "1");
      head.appendChild(s);
    }
    loadScript(
      "/js/staff-profile-render.js?v=" + ASSET_VER,
      "data-vc-staff-prof-render",
      "/js/staff-profile-render.js",
    );
    function loadSecondary() {
      loadScript(
        "/js/staff-manage-modal.js?v=" + ASSET_VER,
        "data-vc-staff-manage-modal",
        "/js/staff-manage-modal.js",
      );
      loadScript(
        "/js/staff-pm-shop-ui.js?v=" + ASSET_VER,
        "data-vc-staff-pm-shop",
        "/js/staff-pm-shop-ui.js",
      );
    }
    if (typeof global.requestAnimationFrame === "function") {
      global.requestAnimationFrame(function () {
        global.setTimeout(loadSecondary, 0);
      });
    } else {
      global.setTimeout(loadSecondary, 0);
    }
  }

  function boot() {
    ensureStaffAssets();
    try {
      global.document.documentElement.classList.remove("vc-staff-stat-sheet-open");
    } catch (eSheet) {}
    maybeRedirectTabOnlyStaff();
    scheduleEarlySync();
    global.addEventListener("vc-discord-profile", onAuthReady);
    global.addEventListener("vc:staff-access-ok", onAuthReady);
    global.addEventListener("vc:auth-logout", function () {
      teardownStaffTabAfterLogout();
    });
    try {
      watchLateStaffMenu();
    } catch (eWatch) {}
  }

  function maybeRedirectTabOnlyStaff() {
    try {
      var q = new URLSearchParams(global.location.search || "");
      if (String(q.get("tab") || "").trim().toLowerCase() !== "staff") return;
      if (/^\d{17,20}$/.test(String(q.get("id") || q.get("userId") || "").trim())) return;
      function go() {
        var viewer = resolveViewerUserId();
        if (/^\d{17,20}$/.test(viewer)) {
          global.location.replace(profileUrl(viewer, "staff"));
          return true;
        }
        return false;
      }
      if (go()) return;
      global.addEventListener("vc-discord-profile", function () {
        go();
      });
    } catch (eRed) {}
  }

  function repairAfterBack(root, userId) {
    if (!root) root = byId("vc-user-profile-view");
    if (!root) return;
    var id = String(userId || parseProfileIdFromUrl() || state.targetUserId || "").trim();
    if (!id) return;
    state.targetUserId = id;
    state.activeTab = parseActiveTabFromUrl();
        if (state.activeTab !== "staff") {
      try {
        global.document.documentElement.classList.remove("vc-user-profile-staff-tab-pending");
      } catch (ePend) {}
      showCommunity(root, id);
      renderSwitcher(root, id);
      return;
    }
    if (!staffPanelMounted(root)) {
      state.staffLoaded = false;
      state.staffLoading = false;
    }
    finishSync(root, id);
  }

  function onMemberLeft(userId) {
    var tid = String(userId || state.targetUserId || "").trim();
    if (!/^\d{17,20}$/.test(tid)) return;
    try {
      markExStaff(tid);
    } catch (eMark) {}
    state.staffAvailable = false;
    state.cachedStaffPayload = null;
    state.probeDone = true;
    try {
      clearSessionStaffCache(tid);
    } catch (eClr) {}
    var root = byId("vc-user-profile-view");
    if (root) redirectExStaffToCommunity(root, tid);
  }

  global.VCUserProfileStaffTab = {
    sync: sync,
    switchTab: switchTab,
    probeStaffProfile: probeStaffProfile,
    profileUrl: profileUrl,
    repairAfterBack: repairAfterBack,
    paintCommunityChrome: paintCommunityChrome,
    onMemberLeft: onMemberLeft,
    renderSwitcher: function (root, userId) {
      renderSwitcher(root || byId("vc-user-profile-view"), userId || state.targetUserId || parseProfileIdFromUrl());
    },
  };

  boot();
})(typeof window !== "undefined" ? window : globalThis);
