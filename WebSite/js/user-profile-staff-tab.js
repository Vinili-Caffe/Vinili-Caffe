/**
 * Tab Staff su /user/?id= — visibile solo a viewer staff/high staff se il target ha profilo staff.
 */
(function (global) {
  "use strict";

  var ASSET_VER = "20260829peerNoFlash1";
  var STAFF_ROSTER_CACHE_KEY = "vc_staff_roster_ids_v1";
  var STAFF_ROSTER_CACHE_TTL_MS = 10 * 60 * 1000;
  var sfPostBusy = false;
  var PROBE_TIMEOUT_MS = 6000;
  var STAFF_PENDING_FAILSAFE_MS = 16000;
  var STAFF_FETCH_RETRIES = 2;
  var STAFF_RETRY_GAP_MS = 500;
  var STAFF_SESSION_CACHE_KEY = "vc_staff_prof_cache_v1";
  var STAFF_SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
  var staffPendingFailsafeTimer = null;
  var state = {
    targetUserId: "",
    staffAvailable: false,
    activeTab: "community",
    staffLoaded: false,
    staffLoading: false,
    staffProbePending: false,
    communityHtml: "",
    probeDone: false,
    probeInFlight: null,
    rosterIds: null,
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
  }

  function armStaffPendingFailsafe(root, userId) {
    if (staffPendingFailsafeTimer) global.clearTimeout(staffPendingFailsafeTimer);
    staffPendingFailsafeTimer = global.setTimeout(function () {
      staffPendingFailsafeTimer = null;
      try {
        var htmlEl = global.document && global.document.documentElement;
        if (!htmlEl || !htmlEl.classList.contains("vc-user-profile-staff-tab-pending")) {
          // Pending già tolto: se siamo ancora sullo spinner staff, sblocca comunque.
          if (!(root && state.activeTab === "staff" && !staffPanelMounted(root))) return;
        }
        if (root && staffPanelMounted(root)) {
          clearStaffTabPending();
          return;
        }
        state.probeDone = true;
        state.staffProbePending = false;
        state.staffLoading = false;
        clearStaffTabPending();
        if (state.activeTab === "staff" && root) {
          var pane = ensureStaffPane(root);
          pane.innerHTML = staffPaneHtml(
            false,
            "Caricamento troppo lento. Riprova o torna a Community.",
          );
          bindStaffBootActions(root, userId);
        }
      } catch (eFs) {
        clearStaffTabPending();
      }
    }, STAFF_PENDING_FAILSAFE_MS);
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

  /**
   * Switch Community|Staff solo se il target è staff VERAMENTE (non prospect).
   * High Staff promuove i non-staff con il CTA Pex dedicato, senza switcher.
   */
  function targetIsRealStaff() {
    var p = state.cachedStaffPayload;
    if (p && p.ok && p.prospect) return false;
    if (p && p.ok && !p.prospect) return true;
    // Dopo paint community il pane staff sparisce: resta staffAvailable dalla sessione peer.
    if (state.staffAvailable && !state.staffProbePending) return true;
    return false;
  }

  function viewerMaySeeStaffTab(userId) {
    if (!getToken()) return false;
    var target = String(userId || state.targetUserId || parseProfileIdFromUrl() || "").trim();
    if (isViewingSelf(target)) return viewerIsStaff();
    if (!viewerIsStaff()) return false;
    // Altri profili: switcher solo a staff reale (mai per prospect).
    if (targetIsRealStaff()) return true;
    // Peer raggiunto dalle frecce staff: tieni lo switcher anche se il payload è stato svuotato.
    if (
      String(state.targetUserId || "") === target &&
      (state.staffLoaded || state.staffAvailable || state.probeDone)
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

  function profileApiUrl(userId) {
    var base = profileApiBase();
    var id = String(userId || "").trim();
    if (!id) return base;
    var sep = base.indexOf("?") >= 0 ? "&" : "?";
    return base + sep + "userId=" + encodeURIComponent(id);
  }

  function parseActiveTabFromUrl() {
    try {
      var q = new URLSearchParams(global.location.search || "");
      var tab = String(q.get("tab") || "").trim().toLowerCase();
      return tab === "staff" ? "staff" : "community";
    } catch (e) {
      return "community";
    }
  }

  function profileUrl(userId, tab) {
    var id = String(userId || "").trim();
    var t = String(tab || "community").trim().toLowerCase();
    var url = id ? "/user/?id=" + encodeURIComponent(id) : "/user/";
    if (t === "staff") url += (url.indexOf("?") >= 0 ? "&" : "?") + "tab=staff";
    return url;
  }

  function organicoApiUrl() {
    var c = global.__VC_STAFF_ORGANICO || {};
    var local = String(c.apiUrlLocal || "").trim();
    var base = String(c.apiUrl || "/webhooks/site-staff-organico").trim();
    try {
      var h = String(global.location.hostname || "").toLowerCase();
      if ((h === "localhost" || h === "127.0.0.1") && local && !/\{\{/.test(local)) base = local;
    } catch (e) {}
    if (/\{\{/.test(base)) base = "/webhooks/site-staff-organico";
    return base;
  }

  function readRosterCache() {
    try {
      var raw = global.sessionStorage.getItem(STAFF_ROSTER_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.ids) || !parsed.ids.length) return null;
      if (Date.now() - Number(parsed.ts || 0) > STAFF_ROSTER_CACHE_TTL_MS) return null;
      return parsed.ids.map(String).filter(function (id) {
        return /^\d{17,20}$/.test(id);
      });
    } catch (e) {
      return null;
    }
  }

  function writeRosterCache(ids) {
    try {
      global.sessionStorage.setItem(
        STAFF_ROSTER_CACHE_KEY,
        JSON.stringify({ ts: Date.now(), ids: ids || [] }),
      );
    } catch (eW) {}
  }

  function flattenRosterIds(sections) {
    var out = [];
    var seen = {};
    (sections || []).forEach(function (sec) {
      (sec.members || []).forEach(function (m) {
        var id = String((m && m.userId) || "").trim();
        if (!/^\d{17,20}$/.test(id) || seen[id]) return;
        seen[id] = true;
        out.push(id);
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
    state.rosterInFlight = fetch(organicoApiUrl(), {
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
        var ids =
          out && out.res && out.res.ok && out.data && out.data.ok
            ? flattenRosterIds(out.data.sections)
            : [];
        state.rosterIds = ids;
        if (ids.length) writeRosterCache(ids);
        return ids;
      })
      .catch(function () {
        state.rosterInFlight = null;
        return state.rosterIds || [];
      });
    return state.rosterInFlight;
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
    var mayShow = viewerMaySeeStaffTab(userId);
    var mayPex = viewerMayProspectPex(userId);
    if (!mayShow && !mayPex) {
      bar.hidden = true;
      bar.innerHTML = "";
      return;
    }
    // Prospect: niente switch Community|Staff — solo CTA Pex per High Staff.
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
                if (targetIsRealStaff()) switchTab(root, userId, "staff");
              });
            },
          });
          return;
        }
        // Fallback: apri UI prospect nel pane staff (senza switcher duale).
        state.activeTab = "staff";
        try {
          global.history.replaceState(null, "", profileUrl(userId, "staff"));
        } catch (eH) {}
        showStaff(root, userId);
        renderSwitcher(root, userId);
      });
  }

  function classicProfileBootHtml() {
    return (
      '<div class="vc-user-profile-loader vc-user-profile-boot vc-user-profile-boot--inline" data-vc-profile-boot role="status" aria-live="polite" aria-label="Caricamento profilo">' +
      '<span class="vc-user-profile-loader__spin" aria-hidden="true"></span>' +
      '<p class="vc-user-profile-loader__title">Caricamento profilo</p>' +
      '<p class="vc-user-profile-loader__sub">Sto recuperando le statistiche dell\'utente...</p>' +
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

  /** Secondo spinner solo se stai passando Community → Staff a profilo già aperto. */
  function shouldShowStaffPaneLoader(root) {
    return communityShellPainted(root) && !pageAlreadyHasProfileLoader(root);
  }

  function staffPaneHtml(loading, errorMsg) {
    if (loading) {
      return (
        '<div class="vc-user-profile-loader vc-user-profile-boot vc-user-profile-boot--inline vc-staff-prof-boot" data-vc-staff-loading="1" role="status" aria-live="polite" aria-label="Caricamento profilo">' +
        '<span class="vc-staff-prof-boot__ring" aria-hidden="true"></span>' +
        '<p class="vc-staff-prof-boot__title">Caricamento profilo staff</p>' +
        '<p class="vc-staff-prof-boot__sub">Sto aprendo la scheda… un attimo.</p>' +
        "</div>"
      );
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
      if (act === "community") {
        clearStaffTabPending();
        switchTab(root, userId || state.targetUserId, "community");
        return;
      }
      if (act === "retry") {
        clearStaffTabPending();
        loadStaffTab(root, userId || state.targetUserId, { force: true });
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

  function readSessionStaffCache(userId) {
    try {
      var raw = global.sessionStorage.getItem(STAFF_SESSION_CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || String(o.userId || "") !== String(userId || "")) return null;
      if (Date.now() - Number(o.at || 0) > STAFF_SESSION_CACHE_TTL_MS) return null;
      if (!o.data || !o.data.ok) return null;
      return o.data;
    } catch (e) {
      return null;
    }
  }

  function writeSessionStaffCache(userId, data) {
    try {
      if (!data || !data.ok) return;
      global.sessionStorage.setItem(
        STAFF_SESSION_CACHE_KEY,
        JSON.stringify({ userId: String(userId || ""), at: Date.now(), data: data }),
      );
    } catch (e) {}
  }

  function isTransientStaffFail(out) {
    var status = out && out.res ? Number(out.res.status || 0) : 0;
    return status === 0 || status === 408 || status === 502 || status === 503 || status === 504;
  }

  function fetchStaffProfileOnce(userId, timeoutMs) {
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
        readyPref.out.data
      ) {
        global.__VC_STAFF_PROFILE_PREFETCH_RESULT = null;
        return Promise.resolve(readyPref.out);
      }
    } catch (eReady) {}
    var pref = global.__VC_STAFF_PROFILE_PREFETCH;
    // Cold boot: riusa la prefetch una sola volta (se fallisce non restiamo bloccati sul 503).
    if (pref && String(pref.userId || "") === String(userId || "") && pref.promise) {
      var p = pref.promise;
      try {
        global.__VC_STAFF_PROFILE_PREFETCH = null;
      } catch (eClearPref) {}
      return Promise.resolve(p).then(function (out) {
        return out || { res: { ok: false, status: 0 }, data: {} };
      });
    }
    var url = profileApiUrl(userId);
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

  function fetchStaffProfile(userId, timeoutMs, retriesLeft) {
    var left = retriesLeft == null ? STAFF_FETCH_RETRIES : Number(retriesLeft);
    if (!(left >= 0)) left = 0;
    return fetchStaffProfileOnce(userId, timeoutMs).then(function (out) {
      var data = (out && out.data) || {};
      var ok = Boolean(out && out.res && out.res.ok && data.ok);
      if (ok || left <= 0 || !isTransientStaffFail(out)) return out;
      return new Promise(function (resolve) {
        global.setTimeout(function () {
          resolve(fetchStaffProfile(userId, timeoutMs, left - 1));
        }, STAFF_RETRY_GAP_MS);
      });
    });
  }

  function consumeProbeResponse(out) {
    state.staffProbePending = false;
    var data = (out && out.data) || {};
    var status = out && out.res ? Number(out.res.status || 0) : 0;
    var ok = Boolean(out && out.res && out.res.ok && data.ok);
    if (ok) {
      state.staffAvailable = true;
      state.cachedStaffPayload = data;
      state.probeDone = true;
      return true;
    }
    state.staffAvailable = false;
    // 403 = davvero non staff profile; altri errori = riprova dopo.
    // Prospect pex (HS): API può rispondere 200 con prospect:true — già covered by ok.
    if (status === 403 || status === 401) {
      state.probeDone = true;
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
    // Un solo fetch (prefetch HTML incluso); niente doppia richiesta.
    state.probeInFlight = fetchStaffProfile(userId, PROBE_TIMEOUT_MS)
      .then(function (out) {
        consumeProbeResponse(out);
        return state.staffAvailable;
      })
      .catch(function () {
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
    // Solo la shell community (figlio diretto): quella nello staff pane è un altro nodo.
    var shell = root.querySelector(":scope > .vc-user-profile-shell");
    var pane = ensureStaffPane(root);
    if (shell) {
      shell.hidden = isStaff;
      shell.setAttribute("aria-hidden", isStaff ? "true" : "false");
      if (!isStaff) {
        try {
          shell.style.removeProperty("display");
          shell.style.removeProperty("visibility");
        } catch (eStyle) {}
      }
    }
    pane.hidden = !isStaff;
    pane.setAttribute("aria-hidden", isStaff ? "false" : "true");
    setBodyTabClass(isStaff ? "staff" : "community");
  }

  function waitForStaffRender(maxMs) {
    maxMs = Math.max(400, Number(maxMs) || 4000);
    return new Promise(function (resolve) {
      if (global.VCStaffProfileRender) {
        resolve(true);
        return;
      }
      ensureStaffAssets();
      var started = Date.now();
      (function tick() {
        if (global.VCStaffProfileRender) {
          resolve(true);
          return;
        }
        if (Date.now() - started >= maxMs) {
          resolve(false);
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
        onUpdated: function () {
          loadStaffTab(root, userId, { force: true });
        },
      });
    });
  }

  function renderStaffPanel(root, userId, payload) {
    return waitForStaffRender().then(function (ready) {
      var cachedRoster = state.rosterIds || readRosterCache() || [];
      var pane = ensureStaffPane(root);
      var panel = pane.querySelector("#vc-user-profile-staff-panel") || byId("vc-user-profile-staff-panel");
      if (!panel) {
        pane.innerHTML = staffPaneHtml(false, "");
        panel = pane.querySelector("#vc-user-profile-staff-panel");
      }
      if (!ready || !panel || !global.VCStaffProfileRender) {
        pane.innerHTML = staffPaneHtml(
          false,
          "Impossibile caricare il renderer profilo staff. Ricarica la pagina.",
        );
        return;
      }
      function paintWithRoster(rosterIds) {
        var neighbors = neighborsFor(userId, rosterIds || []);
        try {
          tagStaffPaneUser(root, userId);
          global.VCStaffProfileRender.renderInto(panel, payload, {
            neighbors: neighbors,
            expectedUserId: userId,
          });
          panel.hidden = false;
          global.VCStaffProfileRender.bindInteractions(panel, payload, {
            neighbors: neighbors,
            onReload: function () {
              loadStaffTab(root, userId, { force: true });
            },
            onPeerNavigate: function (peerId) {
              navigateStaffPeer(peerId);
            },
            setStatus: function () {},
            onSerataFilm: function (willAttend, panelRoot) {
              postSerataFilm(willAttend, panelRoot, function (ok) {
                if (ok) loadStaffTab(root, userId, { force: true, quiet: true });
              });
            },
          });
        } catch (ePaint) {
          try {
            console.error("[vc-staff-profile] render failed", ePaint);
          } catch (eLog) {}
          pane.innerHTML = staffPaneHtml(
            false,
            "Errore nel rendering del profilo staff. Ricarica la pagina.",
          );
          clearStaffTabPending();
          return false;
        }
        return true;
      }

      try {
        var painted = paintWithRoster(cachedRoster);
        if (!painted) return;
        maybeAutoOpenManage(root, userId, payload);
        state.staffLoaded = true;
        clearStaffTabPending();
        try {
          var deadBoots = root.querySelectorAll("[data-vc-profile-boot]");
          for (var di = 0; di < deadBoots.length; di += 1) deadBoots[di].remove();
        } catch (eDead) {}
        try {
          global.document.documentElement.classList.remove("vc-user-profile-pending");
        } catch (ePend) {}
        // Roster organico in background: freccia peer senza bloccare first paint.
        ensureStaffRoster().then(function (ids) {
          if (!ids || !ids.length) return;
          if (String(state.targetUserId || "") !== String(userId || "")) return;
          if (!staffPanelMounted(root)) return;
          if (state.activeTab !== "staff") return;
          try {
            var neighbors = neighborsFor(userId, ids);
            payload.__vcStaffNeighbors = neighbors;
            if (state.cachedStaffPayload) state.cachedStaffPayload.__vcStaffNeighbors = neighbors;
            if (global.VCStaffProfileRender && typeof global.VCStaffProfileRender.mountStaffPeerDock === "function") {
              global.VCStaffProfileRender.mountStaffPeerDock(neighbors, {
                onPeerNavigate: function (peerId) {
                  navigateStaffPeer(peerId);
                },
              });
            }
          } catch (eDock) {}
        });
      } catch (eRender) {
        try {
          console.error("[vc-staff-profile] render failed", eRender);
        } catch (eLog2) {}
        pane.innerHTML = staffPaneHtml(
          false,
          "Errore nel rendering del profilo staff. Ricarica la pagina.",
        );
        clearStaffTabPending();
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
    var bar = root.querySelector(".vc-staff-sf-bar");
    if (!bar) return;
    var present = Boolean(willAttend);
    bar.classList.toggle("is-present", present);
    bar.classList.toggle("is-absent", !present);
    var status = bar.querySelector(".vc-staff-sf-bar__status");
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
    var quiet = Boolean(opts.quiet) || !shouldShowStaffPaneLoader(root);
    if (!quiet) pane.innerHTML = staffPaneHtml(true, "");
    else if (!staffPanelMounted(root) && !pane.querySelector("#vc-user-profile-staff-panel")) {
      pane.innerHTML = '<div id="vc-user-profile-staff-panel" class="vc-staff-profile" hidden></div>';
    }
    state.staffLoading = true;
    state.staffLoaded = false;

    var sessionHit = !opts.force ? readSessionStaffCache(userId) : null;
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
    }
    if (sessionHit) {
      state.cachedStaffPayload = sessionHit;
      // Paint istantaneo dal cache sessione (come F5 caldo), poi refresh quiet.
      return renderStaffPanel(root, userId, sessionHit).then(function () {
        state.staffLoading = false;
        return fetchStaffProfile(userId, PROBE_TIMEOUT_MS).then(function (out) {
          var data = (out && out.data) || {};
          var ok = Boolean(out && out.res && out.res.ok && data.ok);
          if (!ok) return;
          state.cachedStaffPayload = data;
          writeSessionStaffCache(userId, data);
          return renderStaffPanel(root, userId, data);
        });
      });
    }

    var useCached = !opts.force && state.cachedStaffPayload && state.cachedStaffPayload.ok;
    var req = useCached
      ? Promise.resolve({ res: { ok: true, status: 200 }, data: state.cachedStaffPayload })
      : fetchStaffProfile(userId, PROBE_TIMEOUT_MS);
    return req
      .then(function (out) {
        state.staffLoading = false;
        var data = (out && out.data) || {};
        var ok = Boolean(out && out.res && out.res.ok && data.ok);
        if (!ok) {
          clearStaffTabPending();
          pane.innerHTML = staffPaneHtml(
            false,
            data.message || "Impossibile caricare il profilo staff.",
          );
          return;
        }
        state.cachedStaffPayload = data;
        writeSessionStaffCache(userId, data);
        if (!pane.querySelector("#vc-user-profile-staff-panel")) {
          pane.innerHTML = staffPaneHtml(false, "");
        }
        return renderStaffPanel(root, userId, data);
      })
      .catch(function () {
        state.staffLoading = false;
        clearStaffTabPending();
        pane.innerHTML = staffPaneHtml(false, "Errore di rete nel caricamento profilo staff.");
      });
  }

  function remountStaffPeerDock(root, userId) {
    if (!root || state.activeTab !== "staff") return;
    var id = String(userId || state.targetUserId || "").trim();
    if (!/^\d{17,20}$/.test(id)) return;
    if (!staffPanelMounted(root)) return;
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

  function paintCommunityChrome(root, userId) {
    if (!root) root = byId("vc-user-profile-view");
    if (!root) return;
    var id = String(userId || state.targetUserId || "").trim();
    state.activeTab = "community";
    if (/^\d{17,20}$/.test(id)) state.targetUserId = id;
    clearStaffTabPending();
    try {
      if (document.body) {
        document.body.classList.remove("vc-user-profile-staff-tab", "vc-staff-profile-home");
      }
      document.documentElement.classList.remove("vc-user-profile-comm-switch");
    } catch (eBody) {}
    // renderProfile fa root.innerHTML=… e distrugge i tab: rimontali sempre.
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

  function showCommunity(root) {
    state.activeTab = "community";
    var tid = String(state.targetUserId || "").trim();
    if (!root) root = byId("vc-user-profile-view");

    try {
      if (global.VCStaffProfileRender && typeof global.VCStaffProfileRender.unmountStaffPeerDock === "function") {
        global.VCStaffProfileRender.unmountStaffPeerDock();
      }
    } catch (eDock) {}

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
    var mismatch = !shell || shellUser !== tid || !heroOk;

    // Prima del wipe: ricorda che questo target aveva lo staff (per lo switcher).
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

    // Critico: NON togliere staff-tab prima del wipe, altrimenti flash dei dati del peer precedente.
    if (mismatch || fromStaff) {
      try {
        document.documentElement.classList.add("vc-user-profile-comm-switch");
      } catch (eSwCls) {}
    }

    try {
      if (
        global.VCUserProfilePage &&
        typeof global.VCUserProfilePage.ensureCommunityFor === "function"
      ) {
        global.VCUserProfilePage.ensureCommunityFor(tid, root, {
          wipe: Boolean(mismatch || fromStaff),
        });
      }
    } catch (eComm) {}

    // Ora sì: svela community (già loading o dati giusti).
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

    // Togli il gate switch quando la shell è del target (o al prossimo paint).
    try {
      var shellNow = root.querySelector(":scope > .vc-user-profile-shell");
      var okNow =
        shellNow &&
        String(shellNow.getAttribute("data-vc-community-user") || "") === tid &&
        String((shellNow.querySelector(".vc-user-profile-id") || {}).textContent || "").indexOf(tid) !==
          -1;
      if (okNow) document.documentElement.classList.remove("vc-user-profile-comm-switch");
      else {
        // Loader ancora su: togli il gate dopo un tick così non resta bloccato.
        global.setTimeout(function () {
          try {
            document.documentElement.classList.remove("vc-user-profile-comm-switch");
          } catch (eClr) {}
        }, 50);
      }
    } catch (eGate) {
      try {
        document.documentElement.classList.remove("vc-user-profile-comm-switch");
      } catch (eClr2) {}
    }
  }

  function staffPanelMounted(root) {
    if (!root) return false;
    var panel = root.querySelector("#vc-user-profile-staff-panel");
    if (!panel) return false;
    // Rendered staff content (not empty placeholder / solo loader).
    return Boolean(
      panel.querySelector(".vc-user-profile-shell, .vc-user-profile-hero, .vc-staff-profile-panel"),
    );
  }

  function showStaff(root, userId) {
    state.activeTab = "staff";
    try {
      if (global.VCUserProfilePage && typeof global.VCUserProfilePage.unlockCommunityUser === "function") {
        // Durante staff tab i fetch silent non devono ridipingere community.
        // Lock resta sul target solo in community; qui sblocchiamo e usiamo onStaffTab guard.
        global.VCUserProfilePage.unlockCommunityUser();
      }
    } catch (eUnlock) {}
    applyTabVisibility(root);
    var mounted = staffPanelMounted(root);
    if (!mounted) {
      state.staffLoaded = false;
    }
    if (!state.staffLoaded) {
      // Se un fetch precedente è rimasto appeso, sblocca e riprova.
      if (state.staffLoading && !mounted) state.staffLoading = false;
      if (!state.staffLoading) loadStaffTab(root, userId);
      else {
        var pane = ensureStaffPane(root);
        pane.hidden = false;
        if (!pane.querySelector("[data-vc-staff-loading], #vc-user-profile-staff-panel .vc-user-profile-hero")) {
          pane.innerHTML = staffPaneHtml(true, "");
        }
      }
    } else {
      // Tab community aveva smontato le frecce peer: rimontale.
      remountStaffPeerDock(root, userId);
    }
  }

  function switchTab(root, userId, tab) {
    state.activeTab = tab === "staff" ? "staff" : "community";
    renderSwitcher(root, userId);
    try {
      var url = profileUrl(userId, state.activeTab);
      global.history.replaceState(null, "", url);
    } catch (eHist) {}
    if (state.activeTab === "staff") showStaff(root, userId);
    else showCommunity(root);
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
    // Prospect: niente switcher Staff — resta su Community (CTA Pex per High Staff).
    if (state.cachedStaffPayload && state.cachedStaffPayload.ok && state.cachedStaffPayload.prospect) {
      if (state.activeTab === "staff") {
        state.activeTab = "community";
        try {
          global.history.replaceState(null, "", profileUrl(userId, "community"));
        } catch (eH) {}
      }
      showCommunity(root);
      renderSwitcher(root, userId);
      clearStaffTabPending();
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
        state.activeTab = "community";
      }
      if (state.activeTab !== "staff") showCommunity(root);
      renderSwitcher(root, userId);
    }
    // Togli pending solo quando il contenuto staff è in pagina (o non serve).
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
    maybeRedirectOwnStaffTab();

    if (prevTarget && prevTarget !== state.targetUserId) {
      state.probeDone = false;
      state.staffAvailable = false;
      state.staffLoaded = false;
      state.staffLoading = false;
      state.staffProbePending = false;
      state.probeInFlight = null;
      state.cachedStaffPayload = null;
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
          if (oldPanel) oldPanel.innerHTML = "";
        }
      } catch (ePaneClr) {}
      // Community shell del peer precedente/viewer: non fidarsi al tab Community.
      try {
        var staleShell = root.querySelector(":scope > .vc-user-profile-shell");
        if (staleShell) {
          var staleFor = String(staleShell.getAttribute("data-vc-community-user") || "").trim();
          if (staleFor && staleFor !== state.targetUserId) {
            staleShell.setAttribute("data-vc-community-stale", "1");
            // Forza mismatch: al tab Community non fidarsi di questi dati.
            staleShell.setAttribute("data-vc-community-user", "");
          }
        }
      } catch (eStale) {}
    }

    // Dopo renderProfile (innerHTML) il DOM staff sparisce: non fidarsi di staffLoaded.
    if (!staffPanelMounted(root)) {
      state.staffLoaded = false;
    }

    // Switcher immediato se viewer staff (non aspettare l'API).
    if (viewerMaySeeStaffTab()) renderSwitcher(root, userId);

    if (state.activeTab === "staff" && getToken()) {
      try {
        global.document.documentElement.classList.add("vc-user-profile-staff-tab-pending");
      } catch (eP) {}
      armStaffPendingFailsafe(root, userId);
      applyTabVisibility(root);
      // Un solo boot di pagina: niente secondo "Caricamento profilo" nel pane.
      if (!pageAlreadyHasProfileLoader(root) && !communityShellPainted(root) && !staffPanelMounted(root)) {
        root.innerHTML = classicProfileBootHtml();
      }
      ensureStaffPane(root).hidden = false;
      if (!state.staffLoaded && !state.staffLoading) {
        loadStaffTab(root, userId, { quiet: true }).then(function () {
          if (state.cachedStaffPayload && state.cachedStaffPayload.ok) {
            state.staffAvailable = true;
            state.probeDone = true;
            state.staffProbePending = false;
            try {
              var boots = root.querySelectorAll("[data-vc-profile-boot]");
              for (var bi = 0; bi < boots.length; bi += 1) boots[bi].remove();
            } catch (eBoot) {}
            finishSync(root, userId);
          }
        });
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

    // Se stiamo già caricando il tab staff, non rifare un secondo fetch di probe.
    if (state.activeTab === "staff" && state.staffLoading) {
      return;
    }

    probeStaffProfile(userId).then(function () {
      finishSync(root, userId);
    });
  }

  function onAuthReady() {
    var userId = parseProfileIdFromUrl() || state.targetUserId;
    var root = byId("vc-user-profile-view");
    if (!userId) {
      try {
        var fromProf =
          global.__VC_DISCORD_PROFILE && global.__VC_DISCORD_PROFILE.id
            ? String(global.__VC_DISCORD_PROFILE.id)
            : "";
        if (/^\d{17,20}$/.test(fromProf) && /\/user\/?$/i.test(String(global.location.pathname || ""))) {
          userId = fromProf;
        }
      } catch (eId) {}
    }
    if (!userId) return;
    if (state.probeDone && state.staffAvailable && state.targetUserId === userId) {
      if (root) finishSync(root, userId);
      return;
    }
    if (!getToken()) return;
    if (!state.staffAvailable) {
      state.probeDone = false;
    }
    sync(userId, root);
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
      // Tab Staff: NON aspettare il profilo community (era la causa della lentezza).
      if (wantsStaff) {
        if (!getToken()) return false;
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
    function loadScript(src, attr) {
      if (global.document.querySelector("script[" + attr + "]")) return;
      var s = global.document.createElement("script");
      s.src = src;
      // Ordine immediato: niente defer (altrimenti resta dietro vc-landing.js).
      s.async = false;
      s.setAttribute(attr, "1");
      head.appendChild(s);
    }
    loadScript("/js/staff-manage-modal.js?v=" + ASSET_VER, "data-vc-staff-manage-modal");
    loadScript("/js/staff-profile-render.js?v=" + ASSET_VER, "data-vc-staff-prof-render");
    loadScript("/js/staff-pm-shop-ui.js?v=" + ASSET_VER, "data-vc-staff-pm-shop");
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
    // Dopo bfcache / re-render, la shell community può restare nascosta da classi stale.
    if (state.activeTab !== "staff") {
      try {
        global.document.documentElement.classList.remove("vc-user-profile-staff-tab-pending");
      } catch (ePend) {}
      showCommunity(root);
      renderSwitcher(root, id);
      return;
    }
    if (!staffPanelMounted(root)) {
      state.staffLoaded = false;
      state.staffLoading = false;
    }
    finishSync(root, id);
  }

  global.VCUserProfileStaffTab = {
    sync: sync,
    switchTab: switchTab,
    probeStaffProfile: probeStaffProfile,
    profileUrl: profileUrl,
    repairAfterBack: repairAfterBack,
    paintCommunityChrome: paintCommunityChrome,
  };

  boot();
})(typeof window !== "undefined" ? window : globalThis);
