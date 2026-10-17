(function () {
  /* viewAsGateDeny1 + viewAsAccessFreeze1 */
  if (window.__VC_ACCESS_GATE_LOADED) return;
  window.__VC_ACCESS_GATE_LOADED = true;
  /* viewAsAccessFreeze1: Logout View As non manda a loginUrl / non lascia pending */

  var STAFF_CACHE_KEY = "vc_staff_access_ok_v3";
  var STAFF_CACHE_LOCAL_KEY = "vc_staff_access_ok_v3_local";
  var STAFF_CACHE_TTL_MS = 300000;
  var STAFF_CACHE_STALE_MS = 900000;
  var STAFF_CACHE_LOCAL_STALE_MS = 86400000;
  var DASH_CACHE_KEY = "vc_dash_access_ok_v1";
  var DASH_CACHE_TTL_MS = 120000;
  var FETCH_TIMEOUT_MS = 14000;
  var FAILSAFE_MS = 22000;
  var SERATAFILM_FETCH_TIMEOUT_MS = 10000;
  var SERATAFILM_FAILSAFE_MS = 16000;
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
        fetchTimeoutMs = Math.max(fetchTimeoutMs, 18000);
        failsafeMs = Math.max(failsafeMs, 20000);
      } else if (et === "3g") {
        fetchTimeoutMs = Math.max(fetchTimeoutMs, 15000);
        failsafeMs = Math.max(failsafeMs, 16000);
      }
    } catch (eConn) {}
    return { fetchTimeoutMs: fetchTimeoutMs, failsafeMs: failsafeMs };
  }

    var ROUTE_POLICY = [
    { re: /\/accesso-richiesto(?:\/|$)/i, require: "public" },
    { re: /^\/dashboard\/transcript(?:\/|$)/i, require: "public" },
    { re: /^\/dashboard\/profilo(?:\/|$)/i, require: "public" },
    { re: /^\/staff\/gestione(?:\/|$)/i, require: "staff", loginUrl: "/staff/accesso-richiesto/", denyFallback: "/" },
    /* boardsLoginGate1 + boardsSoftGateFix2: soft come tickets — mai hard staff/accesso */
    { re: /^\/(?:bacheca|boards)\/(?:invia|submit|le-mie|manage)(?:\/|$)/i, require: "login", mode: "soft", denyFallback: "/" },
    /* boardsRevHsOnly1: moderazione bacheca solo High Staff (soft in-page) */
    { re: /^\/(?:bacheca|boards)\/mod(?:\/|$)/i, require: "highStaff", mode: "soft", denyFallback: "/" },
    { re: /^\/(?:bacheca|boards)(?:\/|$)/i, require: "login", mode: "soft", denyFallback: "/" },
    { re: /^\/staff\/punti-tolti(?:\/|$)/i, require: "pmOrHighStaff", loginUrl: "/staff/accesso-richiesto/", denyFallback: "/user/" },
    /* pmOpsNavHide1: deny → guida, mai /staff/ (redirecta al profilo) */
    { re: /^\/staff\/confessionale(?:\/|$)/i, require: "login", mode: "soft" },
    { re: /^\/staff\/compiti(?:\/|$)/i, require: "opsStaff", loginUrl: "/staff/accesso-richiesto/", denyFallback: "/staff/guida/" },
        { re: /^\/staff\/?$/i, require: "public" },
    { re: /^\/staff(?:\/|$)/i, require: "staff", loginUrl: "/staff/accesso-richiesto/", denyFallback: "/" },
    { re: /^\/confessionale(?:\/|$)/i, require: "login", mode: "soft" },
    { re: /^\/dashboard(?:\/|$)/i, require: "highStaff", denyFallback: "/" },
    { re: /^\/seratafilm(?:\/|$)/i, require: "highStaff", loginUrl: "/seratafilm/accesso-richiesto/", denyFallback: "/" },
    /* puzzleHs8: prova jigsaw solo High Staff */
    { re: /^\/puzzle(?:\/|$)/i, require: "highStaff", loginUrl: "/staff/accesso-richiesto/", denyFallback: "/" },
    { re: /^\/candidature(?:\/|$)/i, require: "login", mode: "soft" },
    { re: /^\/appelli(?:\/|$)/i, require: "login", mode: "soft" },
    { re: /^\/(?:unban|unmute)(?:\/|$)/i, require: "login", mode: "soft" },
    { re: /^\/user\/(?:personalizza|customize|custom)(?:\/|$)/i, require: "login", mode: "soft", denyFallback: "/" },
    /* personalizzaRankFix1d: soft — resta sulla pagina con CTA login (niente bounce a /) */
    { re: /^\/personalizza(?:\/|$)/i, require: "login", mode: "soft", denyFallback: "/" },
    { re: /^\/notifications(?:\/|$)/i, require: "login", denyFallback: "/" },
    /* datiSoftGate1: resta su /dati/ con card login (come tickets), no kick a home */
    { re: /^\/dati(?:\/|$)/i, require: "login", mode: "soft" },
    { re: /^\/tickets(?:\/|$)/i, require: "login", mode: "soft" },
    { re: /^\/recensioni(?:\/|$)/i, require: "login", mode: "soft" },
    { re: /^\/(?:feedback|suggerimenti)(?:\/|$)/i, require: "login", mode: "soft" },
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

  var LANG_PREFIX_RE =
    /^\/(it|en|es|fr|de|pt|ru|zh|ja|ko|ar|nl|pl|tr|hi|id|uk|vi|ro|sv)(?=\/|$)/i;

  function pathName() {
    try {
      var p = String(window.location.pathname || "/");
      /* boardsSoftGateFix2: /en/bacheca/ deve matchare le route soft, non cadere su staff hard */
      var m = p.match(LANG_PREFIX_RE);
      if (m) {
        p = p.slice(m[0].length) || "/";
        if (p.charAt(0) !== "/") p = "/" + p;
      }
      return p;
    } catch (e) {
      return "/";
    }
  }

  function normPath(p) {
    var s = String(p || "/");
    if (s.length > 1 && s.charAt(s.length - 1) === "/") s = s.slice(0, -1);
    return s || "/";
  }

  function matchPolicy() {
    var path = pathName();
    var page = cfg();
    for (var i = 0; i < ROUTE_POLICY.length; i++) {
      var row = ROUTE_POLICY[i];
      if (!row.re.test(path)) continue;
      var rowMode = String(row.mode || "").trim().toLowerCase();
      /* soft rows: policy del row vince sempre (no override __VC_ACCESS/STAFF → staff hard) */
      if (rowMode === "soft") {
        return {
          require: row.require || "public",
          loginUrl: row.loginUrl || "",
          denyFallback: row.denyFallback || "/",
          mode: "soft",
        };
      }
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
    clearAccessPending();
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

  function clearAccessPending() {
    try {
      var root = document.documentElement;
      root.classList.remove("vc-staff-access-pending");
      root.classList.remove("vc-dash-access-pending");
      root.classList.remove("vc-loading-scroll-lock");
    } catch (e0) {}
    hideStaffLoading();
    try {
      var sfLoad = document.getElementById("vc-seratafilm-loading");
      if (sfLoad) {
        sfLoad.hidden = true;
        sfLoad.setAttribute("hidden", "");
      }
      var dashLoad = document.getElementById("vc-dash-loading");
      if (dashLoad) {
        dashLoad.hidden = true;
        dashLoad.setAttribute("hidden", "");
      }
    } catch (e1) {}
    unlockStaffPageScroll();
  }

  function denyRedirectUrl(policy) {
    var custom = String((policy && policy.denyFallback) || cfg().denyRedirect || "").trim();
    if (custom === "home") return homeUrl();
    /* View As: mai usare referrer (loop tra pagine hard-gated). */
    if (!viewAsModeClient()) {
      try {
        var ref = String(document.referrer || "");
        if (ref) {
          var u = new URL(ref);
          if (u.origin === window.location.origin) {
            var path = String(u.pathname || "");
            var here = pathName();
            if (
              path &&
              normPath(path) !== normPath(here) &&
              path.indexOf("/accesso-richiesto") === -1 &&
              path.indexOf("//") === -1
            ) {
              return path + (u.search || "");
            }
          }
        }
      } catch (e) {}
    }
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
    /* inboxNoDirector1: punti tolti = PM + HS — non Director */
    var isDirector = Boolean(d.director || p.director);
    var canViewPmPointsRemoved = Boolean(
      d.canViewPmPointsRemoved || p.canViewPmPointsRemoved || isHs || ((!isDirector) && (isPm || isPmGestore || canManagePm)),
    );
    if (isDirector && !isHs && !(d.canViewPmPointsRemoved || p.canViewPmPointsRemoved)) {
      canViewPmPointsRemoved = false;
    }
    var hasResoFlag =
      Object.prototype.hasOwnProperty.call(d, "canViewResoconti") ||
      Object.prototype.hasOwnProperty.call(p, "canViewResoconti");
    var canViewResoconti = hasResoFlag
      ? Boolean(d.canViewResoconti || p.canViewResoconti)
      : Boolean(isHs || ((!isDirector) && isPmGestore));
    if (isDirector && !isHs && !(d.canViewResoconti || p.canViewResoconti)) {
      canViewResoconti = false;
    }
    var hasOpsFlag =
      Object.prototype.hasOwnProperty.call(d, "canCompiti") ||
      Object.prototype.hasOwnProperty.call(d, "canConfessionale") ||
      Object.prototype.hasOwnProperty.call(p, "canCompiti") ||
      Object.prototype.hasOwnProperty.call(p, "canConfessionale");
    /* pmOpsNavHide1: senza flag espliciti, solo HS/Director — mai default-true per staff generico/PM */
    var canOpsStaff = hasOpsFlag
      ? Boolean(d.canCompiti || d.canConfessionale || p.canCompiti || p.canConfessionale)
      : Boolean(isHs || d.director || p.director);
    return {
      ok: Boolean(d.ok || d.allowed === true || isHs || isPm || d.candidatureReview || p.candidatureReview),
      isHighStaff: isHs,
      canManage: isHs,
      isPm: isPm,
      isPmGestore: isPmGestore,
      canManagePm: canManagePm,
      canCompiti: canOpsStaff,
      canConfessionale: canOpsStaff,
      canViewResoconti: canViewResoconti,
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
            allowed: Boolean(d.allowed === true),
      viewAs: d.viewAs ? String(d.viewAs) : "",
      viewAsActive: Boolean(d.viewAsActive),
      viewAsAllowed: Boolean(d.viewAsAllowed || d.isFounder || p.viewAsAllowed),
      isFounder: Boolean(d.isFounder || p.isFounder),
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
    if (
      need === "opsstaff" ||
      need === "ops" ||
      need === "compiti" ||
      need === "confessionale" ||
      need === "cancompiti" ||
      need === "canconfessionale"
    ) {
      return Boolean(perms.canCompiti || perms.canConfessionale);
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
        var st = Number(out.res && out.res.status) || 0;
        /* staffAccess429Calm1: primo 429 → stop (niente 2°/3° hit nello stesso burst) */
        if (st === 429) return out;
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
            window.setTimeout(resolve, 700 + attempt * 450);
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
      var root = document.documentElement;
      root.classList.remove("vc-staff-access-pending");
      root.classList.remove("vc-staff-denied-open");
      /* compitiScrollUnlock1: come /puzzle/ — togli hold/lock o restano rotellina + no scroll */
      root.classList.remove(
        "vc-loading-scroll-lock",
        "vc-loader-blocking-live",
        "vc-interaction-hold"
      );
      root.classList.add("vc-staff-app-revealed", "vc-page-cine-ready", "vc-cine-curtain-off");
      document.body.classList.add("vc-staff-app-revealed");
      try {
        document.body.style.pointerEvents = "auto";
      } catch (ePe) {}
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
    clearAccessPending();
    hideStaffLoading();
    try {
      document.documentElement.classList.remove("vc-staff-access-pending");
      document.documentElement.classList.remove("vc-staff-app-revealed");
      document.documentElement.classList.remove("vc-dash-access-pending");
      document.documentElement.classList.add("vc-staff-denied-open");
      document.documentElement.classList.add("vc-dash-access-ready");
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
      try {
        window.dispatchEvent(
          new CustomEvent("vc:staff-access-ok", {
            detail: window.__VC_STAFF_PERMS || { ok: false, viewAsActive: Boolean(viewAsModeClient()) },
          }),
        );
      } catch (eOk) {}
      return;
    }
    /* Nessun pannello deny (dashboard/seratafilm). */
    if (viewAsModeClient()) {
      /* Dashboard deny in anteprima → homepage */
      try {
        if (/^\/dashboard(?:\/|$)/i.test(pathName())) {
          navigateTo(homeUrl());
          return;
        }
      } catch (eDashHome) {
        navigateTo(homeUrl());
        return;
      }
      try {
        document.documentElement.classList.add("vc-dash-access-ready");
        document.documentElement.classList.add("vc-seratafilm-loading-done");
        window.dispatchEvent(
          new CustomEvent("vc:staff-access-ok", {
            detail: { ok: false, viewAs: viewAsModeClient(), viewAsActive: true, viewAsAllowed: true },
          }),
        );
      } catch (eVa) {}
      try {
        if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
          window.VcSiteToast.show(String(message || "Preview: non hai accesso a questa pagina."), true);
        }
      } catch (eT) {}
      return;
    }
    navigateTo(homeUrl());
  }

  function viewAsDenyMessage(policy) {
    var m = viewAsModeClient() || "ruolo";
    var label = m.charAt(0).toUpperCase() + m.slice(1);
    var need = String((policy && policy.require) || "").toLowerCase();
    if (need === "highstaff" || need === "high" || need === "canmanage") {
      return "Preview (" + label + "): serve High Staff per questa pagina.";
    }
    if (need === "pmorhighstaff" || need === "pm_or_high" || need === "pmmanage") {
      return "Preview (" + label + "): non hai accesso a questa pagina.";
    }
    if (
      need === "opsstaff" ||
      need === "ops" ||
      need === "compiti" ||
      need === "confessionale" ||
      need === "cancompiti" ||
      need === "canconfessionale"
    ) {
      return "Preview (" + label + "): pagina riservata allo staff operativo.";
    }
    return "Preview (" + label + "): non hai accesso a questa pagina.";
  }

  function denyAccess(policy, message) {
    if (viewAsModeClient()) {
      /* dashboard: sempre homepage, anche in anteprima */
      try {
        if (/^\/dashboard(?:\/|$)/i.test(pathName())) {
          navigateTo(homeUrl());
          return;
        }
      } catch (eDenyDash) {
        navigateTo(homeUrl());
        return;
      }
      showStaffDenied(message || viewAsDenyMessage(policy));
      return;
    }
    /* Su dashboard con token: retry invece di kick immediato a / */
    try {
      if (/^\/dashboard(?:\/|$)/i.test(pathName()) && getToken()) {
        var n = Number(window.__vcDashDenyRetry || 0);
        if (n < 3) {
          window.__vcDashDenyRetry = n + 1;
          try {
            document.documentElement.classList.add("vc-dash-access-pending");
            document.documentElement.classList.remove("vc-dash-access-ready");
          } catch (ePend) {}
          window.setTimeout(function () {
            runGate();
          }, 700 + n * 500);
          return;
        }
      }
    } catch (eRetry) {}
    navigateTo(denyRedirectUrl(policy));
  }

  function fetchJson(url, token, timeoutMs) {
    var ms = Math.max(2500, Math.min(28000, Number(timeoutMs) || FETCH_TIMEOUT_MS));
    var headers = {};
    if (token) headers.Authorization = "Bearer " + token;
    try {
      if (window.VcViewAs && typeof window.VcViewAs.applyHeader === "function") {
        var patched = window.VcViewAs.applyHeader({ headers: headers });
        headers = patched.headers || headers;
        if (headers && typeof headers.forEach === "function") {
          var plain = {};
          headers.forEach(function (v, k) {
            plain[k] = v;
          });
          headers = plain;
        }
      } else if (sessionStorage.getItem("vc_view_as")) {
        headers["X-VC-View-As"] = String(sessionStorage.getItem("vc_view_as") || "");
      }
    } catch (eVa) {}
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

  function isPuzzlePath(path) {
    return /^\/puzzle(?:\/|$)/i.test(path || pathName());
  }

  function admit(policy, perms) {
    if (hasCapability(perms, policy.require)) {
      try {
        window.__vcDashDenyRetry = 0;
      } catch (eClr) {}
      /* puzzleHs8: /puzzle/ revealStaff + togli sipario cine (senza aspettare puzzle-page.js) */
      if (/^\/staff(?:\/|$)/i.test(pathName()) || isPuzzlePath()) {
        revealStaff(perms);
        if (isPuzzlePath()) {
          try {
            var root = document.documentElement;
            root.classList.add("vc-page-cine-ready", "vc-cine-curtain-off", "vc-staff-app-revealed");
            root.classList.remove(
              "vc-page-cine-boot",
              "vc-staff-access-pending",
              "vc-loader-blocking-live",
              "vc-loading-scroll-lock",
              "vc-interaction-hold"
            );
            if (document.body) {
              document.body.classList.add("vc-staff-app-revealed");
              document.body.style.pointerEvents = "auto";
            }
            var loadEl = document.getElementById("vc-staff-loading");
            if (loadEl) {
              loadEl.hidden = true;
              loadEl.setAttribute("hidden", "");
              loadEl.classList.add("vc-staff-loading--hidden");
              loadEl.style.display = "none";
            }
            var curtain = document.getElementById("vc-cine-boot-curtain");
            if (curtain) {
              curtain.hidden = true;
              curtain.style.display = "none";
              curtain.style.pointerEvents = "none";
            }
            if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
            if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
          } catch (ePzReveal) {}
        }
      }
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
    denyAccess(policy);
    return false;
  }

  function viewAsModeClient() {
    try {
      return String(sessionStorage.getItem("vc_view_as") || "")
        .trim()
        .toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function viewAsBlocksStaffArea() {
    var m = viewAsModeClient();
    return m === "logout" || m === "member";
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

    if (viewAsBlocksStaffArea() && (isStaffArea || need === "staff" || need === "highstaff" || need === "pmorhighstaff")) {
      /* Non chiamare unrevealStaff: lascia pending/loading e freezza. */
      showStaffDenied(
        viewAsModeClient() === "logout"
          ? "Preview Logout: area staff nascosta. Usa la barra ANTEPRIMA per tornare a Reale."
          : "Preview Membro: area staff nascosta. Usa la barra ANTEPRIMA per tornare a Reale.",
      );
      return;
    }

    if (need === "login") {
      if (token && viewAsModeClient() !== "logout") {
        window.__VC_ACCESS_OK = true;
        return;
      }
      if (viewAsModeClient() === "logout") {
        /* Resta sulla pagina soft/login: niente freeze redirect. */
        clearAccessPending();
        return;
      }
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
      if (viewAsModeClient() === "logout" || viewAsModeClient() === "member") {
        showStaffDenied(
          viewAsModeClient() === "logout"
            ? "Preview Logout: area staff nascosta. Usa la barra ANTEPRIMA per tornare a Reale."
            : "Preview Membro: area staff nascosta. Usa la barra ANTEPRIMA per tornare a Reale.",
        );
        return;
      }
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
    var skipStaffCache = Boolean(viewAsModeClient());

            if (needsStaffApi(need) && !needsDashboardApi(need, path) && !skipStaffCache) {
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
    if (needsDashboardApi(need, path) && !skipStaffCache) {
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
        if (isSeratafilm) {
      api = staffAccessApi();
      var cSer = window.__VC_SERATAFILM_ACCESS;
      if (cSer && (cSer.apiUrl || cSer.apiUrlLocal)) {
        api = cfgUrl(cSer, "apiUrl", "apiUrlLocal", api);
      }
            api = String(api || "").replace(
        /\/webhooks\/seratafilm-access\/?$/i,
        "/webhooks/site-seratafilm-access",
      );
      if (!api) api = "/webhooks/site-seratafilm-access";
    }

    if (!api) {
      if (isStaffArea) showStaffDenied("API di accesso non configurata.");
      else denyAccess(policy, "API di accesso non configurata.");
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
      /* apiFalseErr1: non mostrare deny mentre i retry sono ancora vivi */
      if (failsafeStage <= 2) {
        setStaffLoadingHint("Verifica lenta, ancora in corso\u2026");
        scheduleFailsafe(Math.max(16000, Math.floor(failsafeMs * 0.85)));
        return;
      }
      if (failsafeStage === 3) {
        setStaffLoadingHint("Ancora in verifica\u2026 se resta fermo tocca Riprova.");
        scheduleFailsafe(Math.max(18000, failsafeMs));
        return;
      }
      if (isStaffArea) {
        if (!revealedFromStale) showStaffDenied("Verifica accesso in timeout. Riprova.");
      } else if (isSeratafilm && revealedFromStale) {
        return;
      } else {
        denyAccess(policy, "Verifica accesso in timeout. Riprova.");
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
        denyAccess(policy, "Connessione instabile. Riprova.");
        return;
      }
      if (out.res && out.res.status === 401) {
        var authErr = String((out.data && out.data.error) || "").toLowerCase();
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
          /* Dashboard → login, non home grezza */
          if (/^\/dashboard(?:\/|$)/i.test(path)) {
            navigateTo(policy.loginUrl ? loginRedirectUrl(policy) : homeUrl());
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
        /* Errore temporaneo Discord → retry gate, non kick home */
        if (/^\/dashboard(?:\/|$)/i.test(path) && getToken()) {
          denyAccess(policy, "Verifica Discord temporanea fallita.");
          return;
        }
        denyAccess(policy, "Verifica Discord temporanea fallita.");
        return;
      }
      if (out.res && out.res.ok && out.data && (out.data.ok || out.data.allowed === true)) {
        var permsOk = normalizePerms(out.data);
                if (isSeratafilm && permsOk.ok && !permsOk.isHighStaff && !permsOk.canManage && !viewAsModeClient()) {
          permsOk.isHighStaff = true;
          permsOk.canManage = true;
          permsOk.allowed = true;
        }
        if (isSeratafilm && out.data && out.data.filmStreamUrl) {
          applySeratafilmFilmUrl(out.data.filmStreamUrl);
        }
        if (needsDashboardApi(need, path)) {
          if (!viewAsModeClient()) {
            writeJsonCache(DASH_CACHE_KEY, token, { ok: true, allowed: true, isHighStaff: true }, DASH_CACHE_TTL_MS);
          }
        } else if (!out.data.viewAsActive && !viewAsModeClient()) {
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
              canCompiti: permsOk.canCompiti,
              canConfessionale: permsOk.canConfessionale,
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
          var stFail = Number(out && out.res && out.res.status) || 0;
          /* staffAccess429Calm1: 429 → prova cache lunga, un solo retry lento, niente storm */
          if (stFail === 429) {
            try {
              if (typeof window.__vcNoteWebhook429Global === "function") {
                window.__vcNoteWebhook429Global(16000);
              }
            } catch (e429n) {}
            var stale429 = readJsonCacheStale(STAFF_CACHE_KEY, token, STAFF_CACHE_LOCAL_STALE_MS);
            if (stale429 && stale429.ok) {
              admit(policy, normalizePerms(stale429));
              return;
            }
            var slow429 = Number(window.__vcAccessTransientSlow || 0);
            if (slow429 < 1) {
              window.__vcAccessTransientSlow = slow429 + 1;
              setStaffLoadingHint("Troppe richieste, riprovo tra poco\u2026");
              showStaffLoading();
              window.setTimeout(function () {
                verifyStaffAccess(api, token, 1, Math.max(fetchTimeoutMs, 16000)).then(handleAccessVerifyResult);
              }, 4500);
              return;
            }
            showStaffDenied("Troppe richieste. Aspetta qualche secondo e tocca Riprova.");
            return;
          }
          /* accessGateQueueFix1: niente modal al primo paint se coda/429 soft */
          var slowN = Number(window.__vcAccessTransientSlow || 0);
          if (slowN < 2) {
            window.__vcAccessTransientSlow = slowN + 1;
            setStaffLoadingHint("Server lento, nuovo tentativo\u2026");
            showStaffLoading();
            window.setTimeout(function () {
              verifyStaffAccessWithRetries(api, token, Math.max(fetchTimeoutMs, 16000)).then(handleAccessVerifyResult);
            }, 1800 + slowN * 1200);
            return;
          }
          showStaffDenied("Il server impiega troppo. Riprova tra poco.");
          return;
        }
        showStaffDenied(staffDeniedMessage(out, "Verifica non riuscita. Tocca Riprova."));
        return;
      }
      if (isSeratafilm && revealedFromStale) return;
      denyAccess(policy, staffDeniedMessage(out, "Non puoi accedere a questa sezione."));
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

  /* authLogoutRoleGate1: se resti su path hard-gated dopo logout → loginUrl/deny */
  function redirectAfterLogoutIfGated() {
    try {
      var policy = matchPolicy();
      var need = String(policy.require || "public").toLowerCase();
      if (need === "public") return;
      if (String(policy.mode || "hard").toLowerCase() === "soft") return;
      if (getToken()) return;
      if (policy.loginUrl) navigateTo(loginRedirectUrl(policy));
      else navigateTo(denyRedirectUrl(policy));
    } catch (eOut) {}
  }

  window.addEventListener("vc:auth-logout", function () {
    redirectAfterLogoutIfGated();
  });

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
