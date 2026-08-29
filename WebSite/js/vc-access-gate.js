/**
 * Gate accesso centralizzato (tutto il sito).
 * Policy per path → login / staff / highStaff / …
 * Redirect: referrer same-origin → fallback hub/home (mai restare sulla pagina vietata).
 *
 * Override pagina: window.__VC_ACCESS = { require, loginUrl, denyRedirect }
 * Oppure __VC_STAFF_ACCESS.require (compat staff).
 */
(function () {
  if (window.__VC_ACCESS_GATE_LOADED) return;
  window.__VC_ACCESS_GATE_LOADED = true;

  var STAFF_CACHE_KEY = "vc_staff_access_ok_v2";
  var STAFF_CACHE_LOCAL_KEY = "vc_staff_access_ok_v2_local";
  var STAFF_CACHE_TTL_MS = 300000;
  var STAFF_CACHE_STALE_MS = 900000;
  var STAFF_CACHE_LOCAL_STALE_MS = 86400000;
  var DASH_CACHE_KEY = "vc_dash_access_ok_v1";
  var DASH_CACHE_TTL_MS = 120000;
  var FETCH_TIMEOUT_MS = 12000;
  var FAILSAFE_MS = 35000;
  var SERATAFILM_FETCH_TIMEOUT_MS = 8000;
  var SERATAFILM_FAILSAFE_MS = 14000;
  var STAFF_VERIFY_ATTEMPTS = 3;
  var STAFF_TOKEN_WAIT_MS = 6000;

  function resolveAccessTimeouts(isSeratafilm) {
    var fetchTimeoutMs = isSeratafilm ? SERATAFILM_FETCH_TIMEOUT_MS : FETCH_TIMEOUT_MS;
    var failsafeMs = isSeratafilm ? SERATAFILM_FAILSAFE_MS : FAILSAFE_MS;
    try {
      if (window.VcPerf && typeof window.VcPerf.fetchTimeouts === "function") {
        var t = window.VcPerf.fetchTimeouts({
          fetchTimeoutMs: fetchTimeoutMs,
          failsafeMs: failsafeMs,
        });
        return {
          fetchTimeoutMs: t.fetchTimeoutMs,
          failsafeMs: t.failsafeMs,
        };
      }
      var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      var et = String((conn && conn.effectiveType) || "").toLowerCase();
      if (et === "slow-2g" || et === "2g") {
        fetchTimeoutMs = Math.max(fetchTimeoutMs, 24000);
        failsafeMs = Math.max(failsafeMs, 48000);
      } else if (et === "3g") {
        fetchTimeoutMs = Math.max(fetchTimeoutMs, 18000);
        failsafeMs = Math.max(failsafeMs, 42000);
      }
    } catch (eConn) {}
    return { fetchTimeoutMs: fetchTimeoutMs, failsafeMs: failsafeMs };
  }

  /**
   * Ordine: prima match vince. require: public | login | staff | highStaff | candidatureReview | pm | pmOrHighStaff | pmManage
   * mode: hard (default redirect) | soft (non interviene; pagina gestisce overlay)
   */
  var ROUTE_POLICY = [
    { re: /\/accesso-richiesto(?:\/|$)/i, require: "public" },
    { re: /^\/dashboard\/transcript(?:\/|$)/i, require: "public" },
    { re: /^\/dashboard\/profilo(?:\/|$)/i, require: "public" },
    { re: /^\/staff\/gestione(?:\/|$)/i, require: "staff", loginUrl: "/staff/accesso-richiesto/", denyFallback: "/" },
    { re: /^\/staff\/punti-tolti(?:\/|$)/i, require: "pmOrHighStaff", loginUrl: "/staff/accesso-richiesto/", denyFallback: "/user/" },
    { re: /^\/staff\/?$/i, require: "public" },
    { re: /^\/staff(?:\/|$)/i, require: "staff", loginUrl: "/staff/accesso-richiesto/", denyFallback: "/" },
    { re: /^\/dashboard(?:\/|$)/i, require: "highStaff", denyFallback: "/" },
    { re: /^\/seratafilm(?:\/|$)/i, require: "highStaff", loginUrl: "/seratafilm/accesso-richiesto/", denyFallback: "/" },
    { re: /^\/candidature(?:\/|$)/i, require: "login", loginUrl: "/candidature/accesso-richiesto/", denyFallback: "/" },
    { re: /^\/appelli(?:\/|$)/i, require: "login", loginUrl: "/appelli/accesso-richiesto/", denyFallback: "/" },
    { re: /^\/(?:unban|unmute)(?:\/|$)/i, require: "login", loginUrl: "/appelli/accesso-richiesto/", denyFallback: "/" },
    { re: /^\/user\/(?:personalizza|customize|custom)(?:\/|$)/i, require: "login", denyFallback: "/" },
    { re: /^\/notifications(?:\/|$)/i, require: "login", denyFallback: "/" },
    { re: /^\/dati(?:\/|$)/i, require: "login", denyFallback: "/" },
    { re: /^\/tickets(?:\/|$)/i, require: "login", mode: "soft" },
    { re: /^\/recensioni(?:\/|$)/i, require: "login", mode: "soft" },
    { re: /^\/suggerimenti(?:\/|$)/i, require: "login", mode: "soft" },
  ];

  function cfg() {
    var a = (window.__VC_ACCESS && typeof window.__VC_ACCESS === "object" && window.__VC_ACCESS) || {};
    var s = (window.__VC_STAFF_ACCESS && typeof window.__VC_STAFF_ACCESS === "object" && window.__VC_STAFF_ACCESS) || {};
    return {
      require: String(a.require || s.require || "").trim(),
      loginUrl: String(a.loginUrl || "").trim(),
      denyRedirect: String(a.denyRedirect || s.denyRedirect || "").trim(),
      mode: String(a.mode || "").trim(),
    };
  }

  function pathName() {
    try {
      return String(window.location.pathname || "/");
    } catch (e) {
      return "/";
    }
  }

  function matchPolicy() {
    var path = pathName();
    var page = cfg();
    for (var i = 0; i < ROUTE_POLICY.length; i++) {
      var row = ROUTE_POLICY[i];
      if (!row.re.test(path)) continue;
      return {
        require: page.require || row.require || "public",
        loginUrl: page.loginUrl || row.loginUrl || "",
        denyFallback: row.denyFallback || "/",
        mode: page.mode || row.mode || "hard",
      };
    }
    if (page.require) {
      return {
        require: page.require,
        loginUrl: page.loginUrl || "",
        denyFallback: "/",
        mode: page.mode || "hard",
      };
    }
    return { require: "public", loginUrl: "", denyFallback: "/", mode: "hard" };
  }

  function homeUrl() {
    try {
      var u = String((window.__VC_AUTH && window.__VC_AUTH.homeUrl) || "/").trim();
      return u || "/";
    } catch (e) {
      return "/";
    }
  }

  function isLocalOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function cfgUrl(obj, key, keyLocal, fallback) {
    var c = obj || {};
    var local = String(c[keyLocal] || "").trim();
    if (isLocalOrigin() && local && !/\{\{/.test(local)) return local;
    var full = String(c[key] || "").trim();
    if (!full || /\{\{/.test(full)) return fallback;
    try {
      if (/^https?:\/\//i.test(full)) {
        var apiU = new URL(full);
        var pageU = new URL(window.location.href);
        if (apiU.host !== pageU.host && apiU.protocol === pageU.protocol) {
          return apiU.pathname + (apiU.search || "");
        }
      }
    } catch (e) {}
    return full;
  }

  function staffAccessApi() {
    return cfgUrl(window.__VC_STAFF_ACCESS, "apiUrl", "apiUrlLocal", "/webhooks/site-staff-access");
  }

  function dashboardAccessApi() {
    var base = cfgUrl(window.__VC_SITE_DASHBOARD, "apiUrl", "apiUrlLocal", "/webhooks/site-dashboard");
    return String(base || "").replace(/\/+$/, "") + "/access";
  }

  function getToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        var t0 = window.__vcDiscordGetAccessToken();
        if (t0) return t0;
      }
    } catch (e0) {}
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      if (!t) return "";
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function tokenFp(token) {
    var exp = "";
    try {
      exp = String(localStorage.getItem("vc_discord_expires_at") || "");
    } catch (e) {}
    return exp + "|" + String(token || "").slice(0, 32);
  }

  function navigateTo(target) {
    hideStaffLoading();
    var dest = String(target || "").trim() || homeUrl();
    try {
      window.location.replace(dest);
      return;
    } catch (e0) {}
    try {
      window.location.href = dest;
    } catch (e1) {}
  }

  function denyRedirectUrl(policy) {
    var custom = String((policy && policy.denyFallback) || cfg().denyRedirect || "").trim();
    if (custom === "home") return homeUrl();
    try {
      var ref = String(document.referrer || "");
      if (ref) {
        var u = new URL(ref);
        if (u.origin === window.location.origin) {
          var path = String(u.pathname || "");
          var here = pathName();
          if (path && path !== here && path.indexOf("/accesso-richiesto") === -1 && path.indexOf("//") === -1) {
            return path + (u.search || "");
          }
        }
      }
    } catch (e) {}
    if (custom && custom.charAt(0) === "/" && custom.indexOf("//") === -1) return custom;
    return homeUrl();
  }

  function loginRedirectUrl(policy) {
    var login = String((policy && policy.loginUrl) || "").trim();
    if (!login) return denyRedirectUrl(policy);
    try {
      var u = new URL(login, window.location.origin);
      var from = pathName();
      if (!from.endsWith("/")) from += "/";
      from += String(window.location.search || "");
      if (/^\/(?:staff|candidature|appelli|seratafilm)/i.test(from)) {
        u.searchParams.set("from", from);
      }
      return u.pathname + u.search;
    } catch (e) {
      return login;
    }
  }

  function normalizePerms(data) {
    var d = data && typeof data === "object" ? data : {};
    var p = d.permissions && typeof d.permissions === "object" ? d.permissions : {};
    var isHs = Boolean(d.isHighStaff || d.canManage || p.highStaff || p.canManage);
    var isPm = Boolean(d.isPm || p.isPm);
    var isPmGestore = Boolean(d.isPmGestore || p.isPmGestore);
    var canManagePm = Boolean(d.canManagePm || p.canManagePm || isHs || isPmGestore);
    var canViewPmPointsRemoved = Boolean(
      d.canViewPmPointsRemoved || p.canViewPmPointsRemoved || isHs || isPm || isPmGestore || canManagePm,
    );
    return {
      ok: Boolean(d.ok || d.allowed === true || isHs || isPm || d.candidatureReview || p.candidatureReview),
      isHighStaff: isHs,
      canManage: isHs,
      isPm: isPm,
      isPmGestore: isPmGestore,
      canManagePm: canManagePm,
      canViewPmPointsRemoved: canViewPmPointsRemoved,
      canReviewPmPointsRemoved: Boolean(
        d.canReviewPmPointsRemoved || p.canReviewPmPointsRemoved || isHs || isPmGestore,
      ),
      candidatureReview: Boolean(d.candidatureReview || p.candidatureReview),
      appelliReview: Boolean(
        d.appelliReview ||
          p.appelliReview ||
          isHs ||
          d.director ||
          p.director,
      ),
      director: Boolean(d.director || p.director),
      /** Solo flag esplicito — NON confondere con ok (altrimenti ogni staff passa highStaff). */
      allowed: Boolean(d.allowed === true),
    };
  }

  function hasCapability(perms, require) {
    var need = String(require || "public").trim().toLowerCase();
    if (!need || need === "public") return true;
    if (need === "login") return Boolean(getToken());
    if (!perms || !perms.ok) return false;
    if (need === "staff" || need === "any") return true;
    if (need === "highstaff" || need === "high" || need === "canmanage") {
      return Boolean(perms.isHighStaff || perms.canManage);
    }
    if (need === "candidaturereview" || need === "candidature") return Boolean(perms.candidatureReview);
    if (need === "pm") return Boolean(perms.isPm);
    if (need === "pmorhighstaff" || need === "pm_or_high") {
      return Boolean(perms.isPm || perms.isHighStaff || perms.canManage || perms.canViewPmPointsRemoved);
    }
    if (need === "pmmanage" || need === "pm_manage" || need === "managepm") {
      return Boolean(perms.canManagePm || perms.isHighStaff || perms.canManage || perms.isPmGestore);
    }
    return true;
  }

  function parseCacheBlob(raw, token) {
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      if (!data || data.fp !== tokenFp(token)) return null;
      return data;
    } catch (eParse) {
      return null;
    }
  }

  function readJsonCache(key, token) {
    if (!token) return null;
    try {
      var data = parseCacheBlob(sessionStorage.getItem(key), token);
      if (data && Number(data.exp || 0) > Date.now()) return data;
      if (key === STAFF_CACHE_KEY) {
        data = parseCacheBlob(localStorage.getItem(STAFF_CACHE_LOCAL_KEY), token);
        if (data && Number(data.exp || 0) > Date.now()) return data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function readJsonCacheStale(key, token, maxAgeMs) {
    if (!token) return null;
    try {
      var maxStale = Math.max(STAFF_CACHE_TTL_MS, Number(maxAgeMs) || STAFF_CACHE_STALE_MS);
      function readStaleFrom(raw, limitMs) {
        var data = parseCacheBlob(raw, token);
        if (!data) return null;
        var savedAt = Number(data.savedAt || 0);
        if (!savedAt && Number(data.exp || 0) > 0) {
          savedAt = Number(data.exp) - STAFF_CACHE_TTL_MS;
        }
        if (!savedAt) return null;
        if (Date.now() - savedAt > limitMs) return null;
        return data;
      }
      var fromSession = readStaleFrom(sessionStorage.getItem(key), maxStale);
      if (fromSession) return fromSession;
      if (key === STAFF_CACHE_KEY) {
        var localLimit = Math.max(maxStale, STAFF_CACHE_LOCAL_STALE_MS);
        return readStaleFrom(localStorage.getItem(STAFF_CACHE_LOCAL_KEY), localLimit);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function writeJsonCache(key, token, payload, ttl) {
    try {
      var now = Date.now();
      var entry = Object.assign({}, payload, {
        fp: tokenFp(token),
        savedAt: now,
        exp: now + (ttl || STAFF_CACHE_TTL_MS),
      });
      var json = JSON.stringify(entry);
      sessionStorage.setItem(key, json);
      if (key === STAFF_CACHE_KEY) {
        var localEntry = Object.assign({}, entry, {
          exp: now + STAFF_CACHE_LOCAL_STALE_MS,
        });
        localStorage.setItem(STAFF_CACHE_LOCAL_KEY, JSON.stringify(localEntry));
      }
    } catch (e) {}
  }

  function isExplicitStaffDenied(out) {
    var st = Number(out && out.res && out.res.status) || 0;
    if (st === 403) return true;
    var err = String((out && out.data && out.data.error) || "").toLowerCase();
    return err === "forbidden";
  }

  function isTransientAccessFailure(out) {
    if (!out || !out.res) return true;
    var st = Number(out.res.status) || 0;
    // 404: upstream restart / proxy momentaneo; non trattarlo come deny permanente.
    if (st === 0 || st === 404 || st === 408 || st === 429 || st >= 500) return true;
    if (!out.data || typeof out.data !== "object") return true;
    var err = String(out.data.error || "").toLowerCase();
    if (
      err === "internal" ||
      err === "upstream" ||
      err === "timeout" ||
      err === "discord_unreachable" ||
      err === "guild_unavailable" ||
      err === "member_fetch_failed" ||
      err === "member_unavailable" ||
      err === "misconfigured" ||
      err === "network"
    ) {
      return true;
    }
    // Body vuoto / non-JSON (es. challenge CDN) con HTTP 200: ritenta, non deny.
    if (st === 200 && out.data.ok !== true && out.data.allowed !== true && !err && !out.data.message) {
      return true;
    }
    if (st === 200 && !out.data.ok && (err === "internal" || err === "upstream" || err === "timeout")) return true;
    return false;
  }

  function setStaffLoadingHint(text) {
    var hint = document.querySelector("#vc-staff-loading .vc-staff-loading__hint");
    if (hint) hint.textContent = String(text || "Verifica in corso");
  }

  function verifyStaffAccess(api, token, attempt, timeoutMs) {
    var n = Math.max(1, Number(attempt) || 1);
    if (n > 1) {
      setStaffLoadingHint("Verifica in corso\u2026 tentativo " + n + " di " + STAFF_VERIFY_ATTEMPTS);
    }
    return fetchJson(api, token, timeoutMs || FETCH_TIMEOUT_MS).catch(function () {
      return { res: { ok: false, status: 0 }, data: { ok: false, error: "network" } };
    });
  }

  function verifyStaffAccessWithRetries(api, token, timeoutMs) {
    var attempt = 0;
    var authFails = 0;
    function step() {
      attempt += 1;
      return verifyStaffAccess(api, token, attempt, timeoutMs).then(function (out) {
        if (out.res && out.res.ok && out.data && (out.data.ok || out.data.allowed === true)) return out;
        if (isExplicitStaffDenied(out)) return out;
        // 401 Discord intermittente: ritenta prima di invalidare la sessione.
        if (out.res && out.res.status === 401) {
          authFails += 1;
          if (authFails < 3 && attempt < STAFF_VERIFY_ATTEMPTS) {
            return new Promise(function (resolve) {
              window.setTimeout(resolve, 350 + attempt * 250);
            }).then(step);
          }
          return out;
        }
        if (attempt < STAFF_VERIFY_ATTEMPTS && isTransientAccessFailure(out)) {
          return new Promise(function (resolve) {
            window.setTimeout(resolve, 400 + attempt * 300);
          }).then(step);
        }
        return out;
      });
    }
    return step();
  }

  function staffDeniedMessage(out, fallback) {
    if (out && out.data && out.data.message) return String(out.data.message);
    return String(fallback || "Non puoi accedere a questa sezione.");
  }

  function hideStaffLoading() {
    var el = document.getElementById("vc-staff-loading");
    if (!el) return;
    el.setAttribute("hidden", "");
    el.classList.add("vc-staff-loading--hidden");
  }

  function showStaffLoading() {
    var el = document.getElementById("vc-staff-loading");
    if (!el) return;
    el.removeAttribute("hidden");
    el.classList.remove("vc-staff-loading--hidden");
  }

  function unrevealStaff() {
    try {
      document.documentElement.classList.remove("vc-staff-app-revealed");
      document.documentElement.classList.add("vc-staff-access-pending");
      document.documentElement.classList.remove("vc-staff-denied-open");
      document.body.classList.remove("vc-staff-app-revealed");
    } catch (e) {}
    showStaffLoading();
    window.__VC_STAFF_ACCESS_EVENT_SENT = false;
  }

  function unlockStaffPageScroll() {
    try {
      var root = document.documentElement;
      var body = document.body;
      if (root) {
        root.style.removeProperty("overflow");
        root.style.removeProperty("overflow-x");
        root.style.removeProperty("overflow-y");
        root.style.removeProperty("height");
        root.style.removeProperty("max-height");
        root.style.removeProperty("touch-action");
        root.style.removeProperty("overscroll-behavior");
      }
      if (body) {
        body.style.removeProperty("position");
        body.style.removeProperty("inset");
        body.style.removeProperty("top");
        body.style.removeProperty("right");
        body.style.removeProperty("bottom");
        body.style.removeProperty("left");
        body.style.removeProperty("width");
        body.style.removeProperty("height");
        body.style.removeProperty("max-height");
        body.style.removeProperty("overflow");
        body.style.removeProperty("overflow-x");
        body.style.removeProperty("overflow-y");
        body.style.removeProperty("touch-action");
      }
      void (body && body.offsetHeight);
      window.scrollTo(0, Math.max(0, window.pageYOffset || 0));
      if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eUnlock) {}
  }

  function revealStaff(perms) {
    hideStaffLoading();
    try {
      document.documentElement.classList.remove("vc-staff-access-pending");
      document.documentElement.classList.remove("vc-staff-denied-open");
      document.documentElement.classList.add("vc-staff-app-revealed");
      document.body.classList.add("vc-staff-app-revealed");
    } catch (e) {}
    unlockStaffPageScroll();
    window.setTimeout(unlockStaffPageScroll, 0);
    window.setTimeout(unlockStaffPageScroll, 120);
    var denied = document.getElementById("vc-staff-denied");
    if (denied) {
      denied.setAttribute("hidden", "");
      denied.classList.remove("vc-staff-denied--visible");
    }
    try {
      window.__VC_STAFF_PERMS = normalizePerms(perms || { ok: true });
    } catch (eP) {}
    function dispatchStaffAccessOk() {
      try {
        window.dispatchEvent(new CustomEvent("vc:staff-access-ok", { detail: window.__VC_STAFF_PERMS }));
      } catch (eEv) {}
    }
    if (window.__VC_STAFF_ACCESS_EVENT_SENT) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", dispatchStaffAccessOk, { once: true });
      } else {
        window.setTimeout(dispatchStaffAccessOk, 0);
      }
      try {
        if (typeof window.__vcMobileNavRebuild === "function") window.__vcMobileNavRebuild();
      } catch (eNavLate) {}
      return;
    }
    window.__VC_STAFF_ACCESS_EVENT_SENT = true;
    dispatchStaffAccessOk();
    try {
      if (typeof window.__vcMobileNavRebuild === "function") window.__vcMobileNavRebuild();
    } catch (eNav) {}
  }

  function showStaffDenied(message) {
    hideStaffLoading();
    try {
      document.documentElement.classList.remove("vc-staff-access-pending");
      document.documentElement.classList.remove("vc-staff-app-revealed");
      document.documentElement.classList.add("vc-staff-denied-open");
      document.body.classList.remove("vc-staff-app-revealed");
    } catch (eDeny) {}
    window.__VC_STAFF_ACCESS_EVENT_SENT = false;
    var panel = document.getElementById("vc-staff-denied");
    var msg = document.getElementById("vc-staff-denied-msg");
    if (msg) {
      msg.textContent = String(
        message || "Non puoi accedere a questa sezione.",
      );
    }
    if (panel) {
      panel.removeAttribute("hidden");
      panel.classList.add("vc-staff-denied--visible");
    } else {
      navigateTo(homeUrl());
    }
  }

  function fetchJson(url, token, timeoutMs) {
    var ms = Math.max(2500, Math.min(28000, Number(timeoutMs) || FETCH_TIMEOUT_MS));
    var headers = {};
    if (token) headers.Authorization = "Bearer " + token;
    if (typeof AbortController === "undefined") {
      return fetch(url, { method: "GET", headers: headers, mode: "cors", credentials: "omit", cache: "no-store" }).then(
        function (res) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              return { res: res, data: data };
            });
        },
      );
    }
    var ctrl = new AbortController();
    var id = setTimeout(function () {
      try {
        ctrl.abort();
      } catch (e) {}
    }, ms);
    return fetch(url, {
      method: "GET",
      headers: headers,
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: ctrl.signal,
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
      .finally(function () {
        clearTimeout(id);
      });
  }

  function needsStaffApi(require) {
    var r = String(require || "").toLowerCase();
    return (
      r === "staff" ||
      r === "highstaff" ||
      r === "high" ||
      r === "canmanage" ||
      r === "pm" ||
      r === "pmorhighstaff" ||
      r === "candidaturereview" ||
      r === "candidature"
    );
  }

  function needsDashboardApi(require, path) {
    return String(require || "").toLowerCase() === "highstaff" && /^\/dashboard(?:\/|$)/i.test(path);
  }

  function revealSeratafilm() {
    try {
      document.documentElement.classList.remove("vc-dash-access-pending");
      document.documentElement.classList.add("vc-dash-access-ready");
      document.documentElement.classList.add("vc-seratafilm-loading-done");
    } catch (eCls) {}
    try {
      if (document.body) document.body.classList.add("vc-seratafilm-app-revealed");
    } catch (eBody) {}
    try {
      var loading = document.getElementById("vc-seratafilm-loading");
      if (loading) {
        loading.hidden = true;
        loading.setAttribute("hidden", "");
        loading.setAttribute("aria-hidden", "true");
      }
      var app = document.getElementById("vc-seratafilm-app");
      if (app) {
        app.style.display = "";
        app.removeAttribute("aria-hidden");
      }
      var denied = document.getElementById("vc-seratafilm-denied");
      if (denied) {
        denied.hidden = true;
        denied.setAttribute("hidden", "");
      }
    } catch (eDom) {}
    try {
      if (typeof window.__vcSeratafilmInit === "function" && !window.__vcSeratafilmInitDone) {
        window.__vcSeratafilmInitDone = true;
        window.__vcSeratafilmInit();
      }
    } catch (eInit) {}
  }

  function isSeratafilmPath(path) {
    return /^\/seratafilm(?:\/|$)/i.test(path || pathName());
  }

  function applySeratafilmFilmUrl(raw) {
    var u = String(raw || "").trim();
    if (!u) return;
    try {
      window.__VC_SERATAFILM_FILM_URL = new URL(u, window.location.origin).href;
    } catch (eFilm) {
      window.__VC_SERATAFILM_FILM_URL = u;
    }
  }

  function admit(policy, perms) {
    if (hasCapability(perms, policy.require)) {
      if (/^\/staff(?:\/|$)/i.test(pathName())) revealStaff(perms);
      if (/^\/dashboard(?:\/|$)/i.test(pathName())) {
        window.__VC_DASHBOARD_ACCESS_OK = true;
        try {
          document.documentElement.classList.remove("vc-dash-access-pending");
          document.documentElement.classList.add("vc-dash-access-ready");
          window.dispatchEvent(new CustomEvent("vc-dashboard-access", { detail: { allowed: true } }));
        } catch (e) {}
      }
      if (isSeratafilmPath()) {
        revealSeratafilm();
      }
      window.__VC_ACCESS_OK = true;
      window.__VC_ACCESS_PERMS = perms;
      try {
        window.dispatchEvent(new CustomEvent("vc:access-ok", { detail: { policy: policy, perms: perms } }));
      } catch (e2) {}
      return true;
    }
    navigateTo(denyRedirectUrl(policy));
    return false;
  }

  function runGate() {
    try {
      if (String(location.hash || "").indexOf("access_token=") !== -1) return;
    } catch (eH) {}

    var policy = matchPolicy();
    var need = String(policy.require || "public").toLowerCase();
    if (need === "public") return;
    if (policy.mode === "soft") return;

    var token = getToken();
    var path = pathName();
    var isStaffArea = /^\/staff(?:\/|$)/i.test(path);

    if (need === "login") {
      if (token) {
        window.__VC_ACCESS_OK = true;
        return;
      }
      // Mobile Safari / PWA: il token può arrivare qualche tick dopo il boot del gate.
      var loginTries = 0;
      function retryLoginGate() {
        loginTries += 1;
        var t2 = getToken();
        if (t2) {
          window.__VC_ACCESS_OK = true;
          return;
        }
        if (loginTries < 10) {
          window.setTimeout(retryLoginGate, 120);
          return;
        }
        navigateTo(loginRedirectUrl(policy));
      }
      window.setTimeout(retryLoginGate, 0);
      return;
    }

    if (!token) {
      // Token OAuth a volte arriva un attimo dopo il boot del gate (PWA / cold start).
      if (isStaffArea || need === "highstaff" || need === "pm" || need === "pmorhighstaff" || need === "pmmanage") {
        unrevealStaff();
        var tokenTries = 0;
        var tokenWaitStarted = Date.now();
        function retryStaffTokenGate() {
          tokenTries += 1;
          var t2 = getToken();
          if (t2) {
            runGate();
            return;
          }
          if (Date.now() - tokenWaitStarted < STAFF_TOKEN_WAIT_MS) {
            window.setTimeout(retryStaffTokenGate, 120);
            return;
          }
          if (policy.loginUrl) navigateTo(loginRedirectUrl(policy));
          else navigateTo(denyRedirectUrl(policy));
        }
        window.setTimeout(retryStaffTokenGate, 0);
        return;
      }
      if (policy.loginUrl) navigateTo(loginRedirectUrl(policy));
      else navigateTo(denyRedirectUrl(policy));
      return;
    }

    var revealedFromStale = false;
    var isSeratafilm = isSeratafilmPath(path);

    // Cache hit → reveal subito, senza ri-armare overlay o fetch.
    // Seratafilm: ammetti dalla cache ma NON uscire — serve ancora filmStreamUrl dal webhook dedicato.
    if (needsStaffApi(need) && !needsDashboardApi(need, path)) {
      var cached = readJsonCache(STAFF_CACHE_KEY, token);
      if (cached && cached.ok) {
        admit(policy, normalizePerms(cached));
        if (!isSeratafilm) return;
        revealedFromStale = true;
      } else {
        var staleStaff = readJsonCacheStale(STAFF_CACHE_KEY, token, STAFF_CACHE_STALE_MS);
        if (staleStaff && staleStaff.ok && (isStaffArea || isSeratafilm)) {
          admit(policy, normalizePerms(staleStaff));
          revealedFromStale = true;
        }
      }
    }
    if (needsDashboardApi(need, path)) {
      var cachedDash = readJsonCache(DASH_CACHE_KEY, token);
      if (cachedDash && cachedDash.ok && cachedDash.allowed) {
        admit(policy, normalizePerms(cachedDash));
        return;
      }
    }

    if (isStaffArea && !revealedFromStale) {
      unrevealStaff();
    } else if (/^\/dashboard(?:\/|$)/i.test(path) || isSeratafilm) {
      if (!revealedFromStale) {
        try {
          document.documentElement.classList.add("vc-dash-access-pending");
          document.documentElement.classList.remove("vc-dash-access-ready");
        } catch (eD) {}
      }
    }

    var api = needsDashboardApi(need, path) ? dashboardAccessApi() : staffAccessApi();
    // Seratafilm: preferisci endpoint dedicato se configurato, altrimenti staff-access.
    if (isSeratafilm) {
      api = staffAccessApi();
      var cSer = window.__VC_SERATAFILM_ACCESS;
      if (cSer && (cSer.apiUrl || cSer.apiUrlLocal)) {
        api = cfgUrl(cSer, "apiUrl", "apiUrlLocal", api);
      }
      // Bake/deploy errati a volte lasciano /webhooks/seratafilm-access (404).
      api = String(api || "").replace(
        /\/webhooks\/seratafilm-access\/?$/i,
        "/webhooks/site-seratafilm-access",
      );
      if (!api) api = "/webhooks/site-seratafilm-access";
    }

    if (!api) {
      if (isStaffArea) showStaffDenied("API di accesso non configurata.");
      else navigateTo(denyRedirectUrl(policy));
      return;
    }

    var accessTimeouts = resolveAccessTimeouts(isSeratafilm);
    var fetchTimeoutMs = accessTimeouts.fetchTimeoutMs;
    var failsafeMs = accessTimeouts.failsafeMs;

    var settled = false;
    var failsafeStage = 0;
    var failsafeTimer = null;

    function scheduleFailsafe(delayMs) {
      if (failsafeTimer) clearTimeout(failsafeTimer);
      failsafeTimer = setTimeout(onFailsafe, delayMs);
    }

    function onFailsafe() {
      if (settled) return;
      failsafeStage += 1;
      if (failsafeStage === 1) {
        setStaffLoadingHint("Verifica lenta, ancora in corso\u2026");
        scheduleFailsafe(Math.max(12000, Math.floor(failsafeMs * 0.65)));
        return;
      }
      if (isStaffArea) {
        if (!revealedFromStale) showStaffDenied("Verifica accesso in timeout. Riprova.");
      } else if (isSeratafilm && revealedFromStale) {
        return;
      } else {
        navigateTo(denyRedirectUrl(policy));
      }
    }

    scheduleFailsafe(failsafeMs);

    function handleAccessVerifyResult(out) {
      if (!out) {
        if (isStaffArea) {
          if (revealedFromStale) return;
          showStaffDenied("Connessione instabile. Tocca Riprova sotto.");
          return;
        }
        if (isSeratafilm && revealedFromStale) return;
        navigateTo(denyRedirectUrl(policy));
        return;
      }
      if (out.res && out.res.status === 401) {
        var authErr = String((out.data && out.data.error) || "").toLowerCase();
        // Solo invalid_token confermato → logout. Altri 401: chiedi Riprova senza bruciare la sessione.
        if (authErr === "invalid_token" || authErr === "missing_token") {
          try {
            sessionStorage.removeItem(STAFF_CACHE_KEY);
            sessionStorage.removeItem(DASH_CACHE_KEY);
            sessionStorage.setItem("vc_staff_oauth_invalid", "1");
          } catch (eC) {}
          if (typeof window.__vcDiscordClearToken === "function") {
            window.__vcDiscordClearToken();
          }
          if (isStaffArea && !/\/accesso-richiesto\/?$/i.test(path)) {
            showStaffDenied("Sessione scaduta. Accedi di nuovo.");
            return;
          }
          navigateTo(policy.loginUrl ? loginRedirectUrl(policy) : denyRedirectUrl(policy));
          return;
        }
        if (isStaffArea) {
          if (revealedFromStale) return;
          showStaffDenied("Verifica Discord temporanea fallita. Tocca Riprova.");
          return;
        }
        navigateTo(denyRedirectUrl(policy));
        return;
      }
      if (out.res && out.res.ok && out.data && (out.data.ok || out.data.allowed === true)) {
        var permsOk = normalizePerms(out.data);
        // Seratafilm API storica: { ok:true } senza flag highStaff → tratta come high staff.
        if (isSeratafilm && permsOk.ok && !permsOk.isHighStaff && !permsOk.canManage) {
          permsOk.isHighStaff = true;
          permsOk.canManage = true;
          permsOk.allowed = true;
        }
        if (isSeratafilm && out.data && out.data.filmStreamUrl) {
          applySeratafilmFilmUrl(out.data.filmStreamUrl);
        }
        if (needsDashboardApi(need, path)) {
          writeJsonCache(DASH_CACHE_KEY, token, { ok: true, allowed: true, isHighStaff: true }, DASH_CACHE_TTL_MS);
        } else {
          writeJsonCache(
            STAFF_CACHE_KEY,
            token,
            {
              ok: true,
              isHighStaff: permsOk.isHighStaff,
              canManage: permsOk.canManage,
              isPm: permsOk.isPm,
              isPmGestore: permsOk.isPmGestore,
              canManagePm: permsOk.canManagePm,
              canViewPmPointsRemoved: permsOk.canViewPmPointsRemoved,
              canReviewPmPointsRemoved: permsOk.canReviewPmPointsRemoved,
              candidatureReview: permsOk.candidatureReview,
            },
            STAFF_CACHE_TTL_MS,
          );
        }
        admit(policy, permsOk);
        return;
      }
      if (isStaffArea) {
        if (isExplicitStaffDenied(out)) {
          try {
            sessionStorage.removeItem(STAFF_CACHE_KEY);
          } catch (eDenyCache) {}
          showStaffDenied(staffDeniedMessage(out, "Non puoi accedere a questa sezione."));
          return;
        }
        if (revealedFromStale) return;
        if (isTransientAccessFailure(out)) {
          showStaffDenied("Il server impiega troppo. Riprova tra poco.");
          return;
        }
        // Fallback: non forzare logout su errori ambigui.
        showStaffDenied(staffDeniedMessage(out, "Verifica non riuscita. Tocca Riprova."));
        return;
      }
      if (isSeratafilm && revealedFromStale) return;
      navigateTo(denyRedirectUrl(policy));
    }

    function mapPrefetch(raw) {
      if (!raw || raw.error) {
        return { res: { ok: false, status: 0 }, data: { ok: false, error: "network" } };
      }
      if (raw.res && raw.data) return raw;
      return { res: { ok: false, status: 0 }, data: { ok: false, error: "network" } };
    }

    var verifyPromise;
    if (isSeratafilm && window.__vcSeratafilmAccessPrefetch) {
      verifyPromise = Promise.resolve(window.__vcSeratafilmAccessPrefetch)
        .then(mapPrefetch)
        .catch(function () {
          return fetchJson(api, token, fetchTimeoutMs).catch(function () {
            return { res: { ok: false, status: 0 }, data: { ok: false, error: "network" } };
          });
        });
    } else if (isStaffArea && needsStaffApi(need) && !needsDashboardApi(need, path)) {
      if (window.__vcStaffAccessPrefetch) {
        verifyPromise = Promise.resolve(window.__vcStaffAccessPrefetch)
          .then(mapPrefetch)
          .catch(function () {
            return verifyStaffAccessWithRetries(api, token, fetchTimeoutMs);
          });
      } else {
        verifyPromise = verifyStaffAccessWithRetries(api, token, fetchTimeoutMs);
      }
    } else {
      verifyPromise = fetchJson(api, token, fetchTimeoutMs).catch(function () {
        return { res: { ok: false, status: 0 }, data: { ok: false, error: "network" } };
      });
    }

    verifyPromise
      .then(function (out) {
        if (settled) return;
        settled = true;
        if (failsafeTimer) clearTimeout(failsafeTimer);
        handleAccessVerifyResult(out);
      })
      .catch(function () {
        if (settled) return;
        settled = true;
        if (failsafeTimer) clearTimeout(failsafeTimer);
        handleAccessVerifyResult(null);
      });
  }

  function bindStaffDeniedRetry() {
    var btn = document.getElementById("vc-staff-denied-retry");
    if (!btn || btn.__vcAccessBound) return;
    btn.__vcAccessBound = true;
    if (!btn.getAttribute("data-vc-retry-label")) {
      btn.setAttribute("data-vc-retry-label", "1");
      btn.textContent = "Riprova";
    }
    btn.addEventListener("click", function () {
      try {
        sessionStorage.removeItem(STAFF_CACHE_KEY);
        sessionStorage.removeItem(DASH_CACHE_KEY);
        sessionStorage.removeItem("vc_staff_oauth_invalid");
      } catch (e) {}
      var denied = document.getElementById("vc-staff-denied");
      if (denied) {
        denied.setAttribute("hidden", "");
        denied.classList.remove("vc-staff-denied--visible");
      }
      // Prima riprova con la sessione attuale (non forzare logout).
      if (getToken()) {
        unrevealStaff();
        setStaffLoadingHint("Nuovo tentativo di verifica\u2026");
        runGate();
        return;
      }
      if (typeof window.__vcDiscordClearToken === "function") {
        window.__vcDiscordClearToken();
      }
      if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
        window.__vcDiscordStartOAuthRedirect(btn);
        return;
      }
      runGate();
    });
  }

  window.__VC_ACCESS_GATE = {
    matchPolicy: matchPolicy,
    hasCapability: hasCapability,
    run: runGate,
    denyRedirectUrl: function () {
      return denyRedirectUrl(matchPolicy());
    },
  };

  function boot() {
    runGate();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindStaffDeniedRetry, { once: true });
    } else {
      bindStaffDeniedRetry();
    }
  }

  boot();
})();
