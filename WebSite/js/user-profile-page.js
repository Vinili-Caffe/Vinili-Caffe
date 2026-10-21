(function () {
  var currentViewer = null;
  var lastRenderedProfile = null;
  var profileRankObjectUrl = "";
  var profileRankRenderToken = 0;
  var liveProfilePollTimer = null;
  var LIVE_PROFILE_POLL_MS = 45000; /* violPass5: era 15s — poll meno frequente */
  var liveProfilePollBusy = false;
  var PROFILE_CACHE_TTL_MS = 90000;
  var PROFILE_CACHE_LOCAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var PROFILE_CACHE_LOCAL_PREFIX = "vc:profilecache-local:v3:";
  var PROFILE_FETCH_TIMEOUT_MS = 20000;
  var PROFILE_FETCH_MAX_RETRIES = 2;
  var PROFILE_RANK_PREVIEW_CACHE_TTL_MS = 15 * 60 * 1000;
  var PROFILE_RANK_PREVIEW_CACHE_PREFIX = "vc:profile-rank-preview:";
  /* rankCardSpeed1: GIF ~800KB non entravano in sessionStorage (limite 380KB) → Cache API */
  var PROFILE_RANK_BLOB_CACHE = "vc-profile-rank-preview-v1";
  var PROFILE_RANK_SESSION_MAX_BYTES = 1400000;
  var profileMemoryCache = new Map();
  var lastProfileRenderSignature = "";
  var lastRankPreviewUserId = "";
  var lastRankPreviewLoadedAt = 0;
  var RANK_PREVIEW_RELOAD_MIN_MS = 5 * 60 * 1000;
  /* rankFastPaint1: img.src stabile (no ?=) per paint immediato; fetch solo cache locale */
  var rankPreviewInFlightByUid = Object.create(null);
  var rankPreviewBlockedUntil = 0;
  var profileBootGaveUp = false;
  var profilePendingWatchdogTimer = null;
  var profilePendingWatchdogAttempts = 0;
  var profileMainInFlight = false;
  var profileBootSettled = false;
    var lockedCommunityUserId = "";
  var communityPaintSeq = 0;
  /* profileHangFix2: deadline hard sul gate Community — evita freeze “pagina non risponde” */
  /* profileRefreshGate1: su F5/reload hold molto più corto (il gate non serve al cold boot) */
  var communitySwitchHoldSince = 0;
  /* bootBarScrollFast1: hold community più corto (era 12s / 2.5s) */
  var COMMUNITY_SWITCH_HOLD_MAX_MS = 3500;
  var COMMUNITY_SWITCH_HOLD_RELOAD_MS = 1200;

  function isProfileReloadNavigation() {
    try {
      var nav =
        window.performance && typeof window.performance.getEntriesByType === "function"
          ? window.performance.getEntriesByType("navigation")[0]
          : null;
      if (nav && nav.type === "reload") return true;
    } catch (eNav) {}
    try {
      if (window.performance && window.performance.navigation && window.performance.navigation.type === 1) {
        return true;
      }
    } catch (eNav2) {}
    return false;
  }

  function communitySwitchHoldLimitMs() {
    return isProfileReloadNavigation() ? COMMUNITY_SWITCH_HOLD_RELOAD_MS : COMMUNITY_SWITCH_HOLD_MAX_MS;
  }

  function armProfilePendingWatchdog() {
    if (profilePendingWatchdogTimer) return;
    /* profileHangFix2: cap re-arm più stretto (prima 40×4s ≈ 160s) */
    if (profilePendingWatchdogAttempts > 8) {
      try {
        document.documentElement.classList.remove(
          "vc-user-profile-pending",
          "vc-user-profile-comm-switch",
          "vc-loading-scroll-lock",
          "vc-loader-blocking-live",
        );
        communitySwitchHoldSince = 0;
        clearProfileLoading();
        unlockProfileChrome();
      } catch (eCap) {}
      return;
    }
    profilePendingWatchdogTimer = window.setTimeout(function () {
      profilePendingWatchdogTimer = null;
      try {
        if (!document.documentElement.classList.contains("vc-user-profile-pending")) return;
        // staffCommSwitch2: non dismissare pending/loader se lo switch Community è ancora senza shell.
        if (shouldHoldCommunitySwitchLoader(byId("vc-user-profile-view"))) {
          profilePendingWatchdogAttempts += 1;
          armProfilePendingWatchdog();
          return;
        }
        if (profileInitialLoadDone || profileBootSettled) {
          /* staffSwitchIdLock1: non togliere pending/loader se tab=staff e pane ancora vuoto */
          try {
            var holdStaff =
              parseWantsStaffTab() &&
              document.documentElement.classList.contains("vc-user-profile-staff-tab-pending");
            var staffRoot = byId("vc-user-profile-view");
            var staffReady = Boolean(
              staffRoot &&
                staffRoot.querySelector(
                  ".vc-user-profile-staff-pane .vc-user-profile-hero, .vc-user-profile-staff-pane .vc-staff-profile-panel, .vc-staff-prof-miss",
                ),
            );
            /* staffRefreshUnstick1: su F5 non tenere pending oltre 1 re-arm (~4s) */
            var staffHoldCap = isProfileReloadNavigation() ? 1 : 4;
            if (holdStaff && !staffReady && profilePendingWatchdogAttempts < staffHoldCap) {
              profilePendingWatchdogAttempts += 1;
              armProfilePendingWatchdog();
              return;
            }
            if (holdStaff && !staffReady) {
              try {
                document.documentElement.classList.remove(
                  "vc-user-profile-staff-tab-pending",
                  "vc-staff-boot-block",
                );
              } catch (eStaffOff) {}
            }
          } catch (eHold) {}
          clearProfilePending();
          clearProfileLoading();
          return;
        }
        if (tryInstantProfileFromCache()) return;
        profilePendingWatchdogAttempts += 1;
        if (profilePendingWatchdogAttempts > (isCoarseMobileProfile() ? 10 : 5)) {
          profileBootGaveUp = true;
          try {
            window.__VC_PROFILE_GAVE_UP = true;
          } catch (eGave) {}
          var stuckRoot = byId("vc-user-profile-view");
          if (stuckRoot) {
            renderError(stuckRoot, "Il caricamento del profilo non risponde. Premi Riprova.");
          } else {
            clearProfilePending();
            clearProfileLoading();
          }
          return;
        }
        if (!parseProfileId()) {
          clearProfilePending();
          return;
        }
        if (profileMainInFlight) {
          /* iosWinProfilePush1: incrementa tentativi anche in-flight (prima loop infinito) */
          profilePendingWatchdogAttempts += 1;
          if (profilePendingWatchdogAttempts > (isCoarseMobileProfile() ? 6 : 4)) {
            profileMainInFlight = false;
            profileBootGaveUp = true;
            try {
              window.__VC_PROFILE_GAVE_UP = true;
            } catch (eGave2) {}
            clearProfilePending();
            clearProfileLoading();
            unlockProfileChrome();
            var stuckRoot2 = byId("vc-user-profile-view");
            if (stuckRoot2) {
              renderError(stuckRoot2, "Il caricamento del profilo non risponde. Premi Riprova.");
            }
            return;
          }
          armProfilePendingWatchdog();
          return;
        }
        main({ force: false });
        armProfilePendingWatchdog();
      } catch (eWatch) {
        clearProfilePending();
      }
    }, isCoarseMobileProfile() ? 5500 : 4000);
  }

  function isCoarseMobileProfile() {
    try {
      if (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) return true;
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
    } catch (eMob) {}
    return false;
  }

  function profileFetchTimeoutMs() {
    /* phoneApiGlobalFix1: mobile più paziente sul first-stamp Discord */
    return isCoarseMobileProfile() ? 30000 : PROFILE_FETCH_TIMEOUT_MS;
  }

  function setProfilePageTitle(pageLabel) {
    try {
      if (window.VcPageTitle && typeof window.VcPageTitle.set === "function") {
        window.VcPageTitle.set(pageLabel);
        return;
      }
    } catch (eTitle) {}
    var sep =
      (window.VcPageTitle && window.VcPageTitle.SEP) || " \u01C0 ";
    document.title = siteName() + sep + String(pageLabel || "Profilo");
  }

  function isStandalonePwa() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e1) {}
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (e2) {}
    try {
      if (navigator.standalone) return true;
    } catch (e3) {}
    return false;
  }

  /* phoneApiGlobalFix1: failsafe SEMPRE ≥ budget fetch reale (prima cap 18s < fetch 32s). */
  var PROFILE_BOOT_FAILSAFE_MS = Math.max(
    Math.max(profileFetchTimeoutMs() + 8000, 32000) * (PROFILE_FETCH_MAX_RETRIES > 0 ? 2 : 1) +
      (isStandalonePwa() ? 10000 : 8000),
    isCoarseMobileProfile() ? 52000 : 40000,
  );

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_USER_LEADER) || {};
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function isUsableApiUrl(raw) {
    var api = String(raw || "").trim();
    if (!api || api === "#" || api.indexOf("{{") >= 0) return false;
    return true;
  }

  function resolvedApiUrl() {
    var c = cfg();
    var local = String(c.apiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && isUsableApiUrl(local)) return local;
    var api = String(c.apiUrl || "").trim();
    if (!isUsableApiUrl(api)) return "/webhooks/site-users";
    try {
      if (typeof window !== "undefined") {
        var u = new URL(api, window.location.origin);
        var currentHost = String(window.location.hostname || "").replace(/^www\./i, "").toLowerCase();
        var apiHost = String(u.hostname || "").replace(/^www\./i, "").toLowerCase();
        if (currentHost && apiHost && currentHost === apiHost) {
          return window.location.origin + u.pathname + u.search;
        }
      }
    } catch (e) {}
    return api;
  }

  function readSessionCache(key, now) {
    try {
      var raw =
        window.VcStorage && typeof window.VcStorage.get === "function"
          ? window.VcStorage.get(key, { scope: "ss" })
          : sessionStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Number.isFinite(parsed.expireAt) || parsed.expireAt <= now) {
        if (window.VcStorage) window.VcStorage.remove(key, { scope: "ss", immediate: true });
        else sessionStorage.removeItem(key);
        return null;
      }
      return parsed.value;
    } catch (e) {
      return null;
    }
  }

  function writeSessionCache(key, value, ttlMs, now) {
    var ssJson = JSON.stringify({
      expireAt: now + Math.max(1, Number(ttlMs) || PROFILE_CACHE_TTL_MS),
      value: value,
    });
    try {
      if (window.VcStorage && typeof window.VcStorage.set === "function") {
        window.VcStorage.set(key, ssJson, { scope: "ss", immediate: true, broadcast: false });
      } else {
        sessionStorage.setItem(key, ssJson);
      }
    } catch (e) {}
    /* pushIdb1: durable grande → IndexedDB (niente blob in LS) */
    try {
      var lk = PROFILE_CACHE_LOCAL_PREFIX + key;
      if (window.VcIdb && typeof window.VcIdb.set === "function") {
        window.VcIdb.set(lk, value, PROFILE_CACHE_LOCAL_TTL_MS);
      }
      if (window.VcStorage && typeof window.VcStorage.remove === "function") {
        window.VcStorage.remove(lk, { scope: "ls", immediate: true, broadcast: false });
      } else {
        try {
          localStorage.removeItem(lk);
        } catch (eRm) {}
      }
    } catch (eIdb) {}
  }

  function readLocalProfileCache(key, now) {
    try {
      var lk = PROFILE_CACHE_LOCAL_PREFIX + key;
      if (window.VcIdb && typeof window.VcIdb.getSync === "function") {
        var syncV = window.VcIdb.getSync(lk);
        if (syncV != null) return syncV;
      }
      /* legacy LS (pre-idb) */
      var raw =
        window.VcStorage && typeof window.VcStorage.get === "function"
          ? window.VcStorage.get(lk, { scope: "ls" })
          : localStorage.getItem(lk);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Number.isFinite(parsed.expireAt) && parsed.expireAt > now) {
          return parsed.value;
        }
        if (window.VcStorage) window.VcStorage.remove(lk, { scope: "ls", immediate: true });
        else localStorage.removeItem(lk);
      }
      if (window.VcIdb && typeof window.VcIdb.get === "function") {
        window.VcIdb.get(lk).then(function (v) {
          if (v == null) return;
          try {
            profileMemoryCache.set(key, {
              expireAt: now + PROFILE_CACHE_TTL_MS,
              value: v,
            });
          } catch (eMem) {}
        });
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function clearProfileSessionCaches() {
    try {
      profileMemoryCache.clear();
    } catch (eMem) {}
    try {
      if (window.VcApiCache && typeof window.VcApiCache.invalidatePrefix === "function") {
        window.VcApiCache.invalidatePrefix("profile:");
      }
    } catch (eApi) {}
    try {
      var keys = [];
      for (var i = 0; i < sessionStorage.length; i += 1) {
        var k = sessionStorage.key(i);
        if (k && (k.indexOf("vc:profilecache:") === 0 || k.indexOf(PROFILE_RANK_PREVIEW_CACHE_PREFIX) === 0)) {
          keys.push(k);
        }
      }
      for (var j = 0; j < keys.length; j += 1) {
        sessionStorage.removeItem(keys[j]);
      }
    } catch (eSess) {}
  }

  function cachedJsonFetch(url, ttlMs, opts) {
    var ttl = Math.max(1, Number(ttlMs) || PROFILE_CACHE_TTL_MS);
    var bypass = Boolean(opts && opts.bypassCache);
    var fetchTimeoutMs = Math.max(profileFetchTimeoutMs() + 8000, 32000);
    if (window.VcApiCache && typeof window.VcApiCache.fetchHttpOk === "function") {
      var cacheKey = window.VcApiCache.keyFor(String(url || ""), { scope: "profile" });
      if (bypass) window.VcApiCache.invalidate(cacheKey);
      return window.VcApiCache
        .fetchHttpOk(String(url || ""), {
          scope: "profile",
          ttlMs: ttl,
          staleMs: Math.max(ttl * 8, 10 * 60 * 1000),
          persistMs: 30 * 60 * 1000,
          useCache: !bypass,
          timeoutMs: fetchTimeoutMs,
          fetchInit: { credentials: "omit", cache: "no-store" },
        })
        .then(function (row) {
          return { httpOk: Boolean(row && row.httpOk), body: row && row.body ? row.body : null };
        })
        .catch(function () {
          return { httpOk: false, body: null };
        });
    }
    var fetchOpts = { credentials: "omit", cache: "no-store" };
    return fetch(url, fetchOpts)
      .then(function (r) {
        return r.json().then(
          function (body) {
            return { httpOk: r.ok, body: body };
          },
          function () {
            return { httpOk: false, body: null };
          },
        );
      })
      .catch(function () {
        return { httpOk: false, body: null };
      });
  }

  function resolvedPublicRankPreviewUrl(userId) {
    var base = resolvedApiUrl();
    var id = String(userId || "").trim();
    if (!base || !/^\d{17,20}$/.test(id)) return "";
    var root = base.split("?")[0];
    var endpoint = root.replace(/\/site-users\/?$/i, "/site-rank-card-public");
        return endpoint + "?userId=" + encodeURIComponent(id);
  }

  function payloadLooksLikeUser(payload, userId) {
    var want = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(want)) return false;
    if (!payload || typeof payload !== "object") return false;
    var profile = payload.profile || {};
    var level = payload.level || {};
    var candidates = [
      profile.userId,
      profile.id,
      profile.discordId,
      level.userId,
      level.id,
      payload.userId,
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var got = String(candidates[i] || "").trim();
      if (/^\d{17,20}$/.test(got)) return got === want;
    }
    // profileSwitchFix1: senza id esplicito non indovinare (evita riuso dati viewer/altro utente).
    return false;
  }

  // staffCommSwitch2: bind fetch target into payload so lock checks survive lean/cached rows.
  function withExplicitUserId(payload, userId) {
    var want = String(userId || "").trim();
    var base = payload && typeof payload === "object" ? payload : {};
    if (!/^\d{17,20}$/.test(want)) return base;
    var profile = base.profile && typeof base.profile === "object" ? Object.assign({}, base.profile) : {};
    var level = base.level && typeof base.level === "object" ? base.level : {};
    var found = "";
    var candidates = [
      profile.userId,
      profile.id,
      profile.discordId,
      level.userId,
      level.id,
      base.userId,
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var got = String(candidates[i] || "").trim();
      if (/^\d{17,20}$/.test(got)) {
        found = got;
        break;
      }
    }
    if (found && found !== want) return base;
    if (!/^\d{17,20}$/.test(String(profile.userId || "").trim())) profile.userId = want;
    return Object.assign({}, base, { userId: want, profile: profile });
  }

  function communitySwitchGateActive() {
    try {
      return document.documentElement.classList.contains("vc-user-profile-comm-switch");
    } catch (eGate) {
      return false;
    }
  }

  function markCommunitySwitchHold() {
    if (!communitySwitchHoldSince) communitySwitchHoldSince = Date.now();
  }

  function clearCommunitySwitchHoldClock() {
    communitySwitchHoldSince = 0;
  }

  function communitySwitchHoldTimedOut() {
    if (!communitySwitchHoldSince) return false;
    return Date.now() - communitySwitchHoldSince >= communitySwitchHoldLimitMs();
  }

  function dismissStuckProfileSpinners() {
    try {
      clearProfileLoading();
    } catch (eClr) {}
    try {
      var root = byId("vc-user-profile-view");
      if (!root) return;
      var nodes = root.querySelectorAll(
        ":scope > .vc-user-profile-loader, :scope > [data-vc-profile-boot], .vc-user-profile-loader__spin",
      );
      for (var i = 0; i < nodes.length; i += 1) {
        var n = nodes[i];
        if (n.closest && n.closest("[data-vc-profile-staff-pane]")) continue;
        if (n.getAttribute && n.getAttribute("data-vc-staff-loading")) continue;
        try {
          n.remove();
        } catch (eRm) {}
      }
    } catch (eSpin) {}
  }

  function finishCommunitySwitchPaint(userId) {
    var id = String(userId || "").trim();
    clearCommunitySwitchHoldClock();
    /* staffReloadPaint1: su ?tab=staff non spezzare pending/body staff (prima → pane vuoto + footer). */
    var staffIntent = false;
    try {
      staffIntent =
        parseWantsStaffTab() ||
        Boolean(document.documentElement.classList.contains("vc-user-profile-staff-tab-pending")) ||
        Boolean(document.body && document.body.classList.contains("vc-user-profile-staff-tab"));
    } catch (eIntent) {
      staffIntent = false;
    }
    try {
      document.documentElement.classList.remove("vc-user-profile-comm-switch");
      if (!staffIntent) {
        document.documentElement.classList.remove(
          "vc-user-profile-staff-tab-pending",
          "vc-staff-boot-block",
        );
        if (document.body) {
          document.body.classList.remove("vc-user-profile-staff-tab", "vc-staff-profile-home");
        }
      }
    } catch (eCls) {}
    dismissStuckProfileSpinners();
    if (staffIntent) {
      /* Staff reload: sblocca chrome ma lascia pending + sync al tab staff. */
      try {
        unlockProfileChrome();
      } catch (eUn) {}
      try {
        if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.sync === "function") {
          window.VCUserProfileStaffTab.sync(id, byId("vc-user-profile-view"));
        }
      } catch (eSync) {}
      return;
    }
    try {
      var root = byId("vc-user-profile-view");
      var shell = root && root.querySelector(":scope > .vc-user-profile-shell");
      if (shell) {
        shell.hidden = false;
        shell.removeAttribute("data-vc-community-stale");
        shell.setAttribute("aria-hidden", "false");
        shell.style.removeProperty("display");
        shell.style.removeProperty("visibility");
        if (/^\d{17,20}$/.test(id)) shell.setAttribute("data-vc-community-user", id);
      }
    } catch (eShell) {}
    unlockProfileChrome();
    clearProfilePending();
  }

  function shouldHoldCommunitySwitchLoader(root, userId) {
    if (!communitySwitchGateActive()) {
      clearCommunitySwitchHoldClock();
      return false;
    }
    markCommunitySwitchHold();
    /* profileHangFix2 / profileRefreshGate1: dopo hold max sblocca sempre — meglio contenuto parziale che freeze */
    if (communitySwitchHoldTimedOut()) return false;
    var id = String(userId || lockedCommunityUserId || parseProfileId() || "").trim();
    if (!/^\d{17,20}$/.test(id)) return true;
    var view = root || byId("vc-user-profile-view");
    /* profileHangFix1: empty/error già pitturati → non tenere il loader in loop */
    try {
      if (
        view &&
        view.querySelector(
          ":scope > .vc-user-profile-shell .vc-user-profile-empty, :scope > .vc-user-profile-shell .vc-user-profile-notfound, :scope > .vc-user-profile-shell--notfound",
        )
      ) {
        return false;
      }
    } catch (eEmpty) {}
    /* profileHangFix2: se c’è già hero/shell, non tenere il gate solo per id text mismatch */
    try {
      if (view && profileViewLooksReady(view)) return false;
    } catch (eReady) {}
    return !communityShellLooksReadyFor(view, id);
  }

  // profileDataLock1: URL id + lock devono coincidere; mai dipingere un altro utente.
  function canonicalProfileTargetId() {
    var urlId = parseProfileId();
    if (/^\d{17,20}$/.test(urlId)) return urlId;
    if (/^\d{17,20}$/.test(lockedCommunityUserId)) return lockedCommunityUserId;
    return "";
  }

  function isAllowedProfileTarget(userId) {
    var want = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(want)) return false;
    var urlId = parseProfileId();
    if (/^\d{17,20}$/.test(urlId) && urlId !== want) return false;
    if (lockedCommunityUserId && lockedCommunityUserId !== want) return false;
    return true;
  }

  function lockProfileTarget(userId) {
    var id = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(id)) return "";
    lockedCommunityUserId = id;
    return id;
  }

  function invalidateProfilePaintState(reason) {
    try {
      lastProfileRenderSignature = "";
      lastRenderedProfile = null;
      profileRankRenderToken += 1;
      lastRankPreviewUserId = "";
      lastRankPreviewLoadedAt = 0;
      profileInitialLoadDone = false;
      profileBootSettled = false;
    } catch (eInv) {}
    try {
      window.__VC_PROFILE_PREFETCH_RESULT = null;
      if (
        window.__VC_PROFILE_PREFETCH &&
        lockedCommunityUserId &&
        String(window.__VC_PROFILE_PREFETCH.userId || "") !== lockedCommunityUserId
      ) {
        window.__VC_PROFILE_PREFETCH = null;
      }
    } catch (ePref) {}
    try {
      var root = byId("vc-user-profile-view");
      var shell = root && root.querySelector(":scope > .vc-user-profile-shell");
      if (shell) {
        shell.setAttribute("data-vc-community-stale", "1");
        shell.setAttribute("data-vc-community-user", "");
      }
    } catch (eShell) {}
    return reason || "";
  }

  function profileShellAndRankAligned(root, userId) {
    var want = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(want)) return false;
    if (!communityShellLooksReadyFor(root, want)) return false;
    try {
      var img = root && root.querySelector ? root.querySelector("#vc-user-rankcard-image") : byId("vc-user-rankcard-image");
      if (!img) return true;
      var marked = String(img.getAttribute("data-vc-rank-for") || "").trim();
      if (!marked) return true;
      return marked === want;
    } catch (eAlign) {
      return false;
    }
  }

  function profileRenderSignature(userId, payload, viewerId) {
    var p = payload || {};
    var level = p.level || {};
    var weekly = p.weekly || {};
    var messages = p.messages || {};
    var voice = p.voice || {};
    var profile = p.profile || {};
    var custom = profile.customProfile || {};
    var role = custom.role || null;
    var secondary = custom.secondaryRole || null;
    var cvoice = custom.voice || null;
    return [
      String(userId || ""),
      String(viewerId || ""),
      String(level.level || 0),
      String(level.exp || 0),
      String(level.rank || ""),
      String(weekly.weeklyExp || 0),
      String(weekly.weeklyRank || ""),
      String(messages.messagesTotal || 0),
      String(messages.messagesWeekly || 0),
      String(messages.messagesDaily || 0),
      String(voice.voiceTotalSeconds || 0),
      String(voice.voiceWeeklySeconds || 0),
      String(voice.voiceDailySeconds || 0),
      role ? String(role.id || "") + ":" + String(role.name || "") + ":" + String(role.color || "") + ":" + String(role.memberCount || 0) : "",
      secondary ? String(secondary.id || "") + ":" + String(secondary.name || "") + ":" + String(secondary.memberCount || 0) : "",
      cvoice ? String(cvoice.id || "") + ":" + String(cvoice.name || "") + ":" + String(cvoice.memberCount || 0) : "",
      String((profile.displayName || profile.username || "")),
      profile.birthday
        ? String(profile.birthday.day || "") +
          "/" +
          String(profile.birthday.month || "") +
          ":" +
          String(profile.birthday.shortLabel || profile.birthday.label || "")
        : "",
      String(profile.avatarUrl || ""),
      String(profile.expMultiplierResolved || weekly.expMultiplier || ""),
      Array.isArray(profile.weeklyMultiplierSources)
        ? profile.weeklyMultiplierSources
            .map(function (s) {
              return String((s && s.key) || "") + ":" + String((s && s.multiplier) || "") + ":" + String((s && s.active) || "");
            })
            .join(",")
        : "",
    ].join("|");
  }

  function profileRankPreviewCacheKey(userId) {
    return PROFILE_RANK_PREVIEW_CACHE_PREFIX + String(userId || "").trim();
  }

  function loadCachedProfileRankPreview(userId) {
    var key = profileRankPreviewCacheKey(userId);
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return "";
      var parsed = JSON.parse(raw);
      var now = Date.now();
      if (
        !parsed ||
        typeof parsed.dataUrl !== "string" ||
        !parsed.dataUrl ||
        !Number.isFinite(parsed.updatedAt) ||
        now - parsed.updatedAt > PROFILE_RANK_PREVIEW_CACHE_TTL_MS
      ) {
        sessionStorage.removeItem(key);
        return "";
      }
      return parsed.dataUrl;
    } catch (e) {
      return "";
    }
  }

  function saveCachedProfileRankPreview(userId, dataUrl) {
    var key = profileRankPreviewCacheKey(userId);
    try {
      if (!dataUrl || typeof dataUrl !== "string") return;
      sessionStorage.setItem(
        key,
        JSON.stringify({
          updatedAt: Date.now(),
          dataUrl: dataUrl,
        }),
      );
    } catch (e) {}
  }

  function saveRankPreviewBlobCache(url, blob) {
    if (!url || !blob || !blob.size) return;
    try {
      if (!window.caches || typeof caches.open !== "function") return;
      caches
        .open(PROFILE_RANK_BLOB_CACHE)
        .then(function (cache) {
          return cache.put(
            url,
            new Response(blob.slice(0), {
              headers: {
                "Content-Type": blob.type || "image/png",
                "Cache-Control": "max-age=900",
                "X-VC-Rank-Saved": String(Date.now()),
              },
            }),
          );
        })
        .catch(function () {});
    } catch (eCachePut) {}
  }

  function loadRankPreviewBlobCache(url) {
    if (!url) return Promise.resolve(null);
    try {
      if (!window.caches || typeof caches.open !== "function") {
        return Promise.resolve(null);
      }
      return caches
        .open(PROFILE_RANK_BLOB_CACHE)
        .then(function (cache) {
          return cache.match(url);
        })
        .then(function (res) {
          if (!res || !res.ok) return null;
          var saved = 0;
          try {
            saved = Number(res.headers.get("X-VC-Rank-Saved") || 0) || 0;
          } catch (eHdr) {
            saved = 0;
          }
          if (saved && Date.now() - saved > PROFILE_RANK_PREVIEW_CACHE_TTL_MS) {
            try {
              caches.open(PROFILE_RANK_BLOB_CACHE).then(function (cache) {
                cache.delete(url);
              });
            } catch (eDel) {}
            return null;
          }
          return res.blob();
        })
        .then(function (blob) {
          if (!blob || !blob.size) return null;
          return blob;
        })
        .catch(function () {
          return null;
        });
    } catch (eCacheGet) {
      return Promise.resolve(null);
    }
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      try {
        var reader = new FileReader();
        reader.onload = function () {
          resolve(typeof reader.result === "string" ? reader.result : "");
        };
        reader.onerror = function () {
          reject(new Error("blob_to_data_url_failed"));
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        reject(e);
      }
    });
  }

  function fetchProfileRankPreviewBlob(userId, url, force) {
    var uid = String(userId || "").trim();
    if (!uid || !url) return Promise.resolve(null);
    if (rankPreviewInFlightByUid[uid]) return rankPreviewInFlightByUid[uid];
    var p = fetch(url, {
      cache: force ? "no-store" : "force-cache",
      credentials: "omit",
    })
      .then(function (r) {
        if (r && r.status === 429) {
          var soft = false;
          try {
            soft = String(r.headers && r.headers.get("X-VC-Soft429") || "") === "1";
          } catch (eSoft) {}
          if (!soft) {
            rankPreviewBlockedUntil = Date.now() + 45000;
            try {
              if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
                window.VcApiCache.noteWebhook429(30, url);
              }
            } catch (e429) {}
          }
          throw new Error("http_429");
        }
        if (!r.ok) throw new Error("http_" + r.status);
        return r.blob();
      })
      .then(function (blob) {
        if (!blob || !blob.size) return null;
        saveRankPreviewBlobCache(url, blob);
        if (blob.size < PROFILE_RANK_SESSION_MAX_BYTES) {
          blobToDataUrl(blob)
            .then(function (dataUrl) {
              if (dataUrl) saveCachedProfileRankPreview(uid, dataUrl);
            })
            .catch(function () {});
        }
        return blob;
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        delete rankPreviewInFlightByUid[uid];
      });
    rankPreviewInFlightByUid[uid] = p;
    return p;
  }

  function prefetchProfileRankCard(userId) {
    var uid = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(uid)) return;
    if (loadCachedProfileRankPreview(uid)) return;
    var url = resolvedPublicRankPreviewUrl(uid);
    if (!url) return;
    if (Date.now() < rankPreviewBlockedUntil) return;
    try {
      if (window.VcApiCache && typeof window.VcApiCache.isWebhookBlocked === "function") {
        if (window.VcApiCache.isWebhookBlocked(url)) return;
      }
    } catch (eBlk) {}
    if (rankPreviewInFlightByUid[uid]) return;
    loadRankPreviewBlobCache(url).then(function (cachedBlob) {
      if (cachedBlob) return;
      fetchProfileRankPreviewBlob(uid, url, false);
    });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

    function escForSingleQuotedCssUrl(s) {
    return String(s == null ? "" : s)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
  }

  function isUnexpandedPlaceholder(s) {
    return /^\{\{[A-Z0-9_]+\}\}$/.test(String(s || "").trim());
  }

  function siteName() {
    try {
      var metaSite = document.querySelector('meta[name="author"]');
      if (metaSite) {
        var mv = String(metaSite.getAttribute("content") || "").trim();
        if (mv && !isUnexpandedPlaceholder(mv)) return mv;
      }
      var brand = document.querySelector('header a[aria-label*="homepage"]');
      if (brand) {
        var bn = String(brand.textContent || "").replace(/\s+/g, " ").trim();
        if (bn && !isUnexpandedPlaceholder(bn)) return bn;
      }
    } catch (e) {}
    return "Vinili & Caffè";
  }

  function parseProfileId() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var fromQuery = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
      if (/^\d{17,20}$/.test(fromQuery)) return fromQuery;
      var m = String(window.location.pathname || "").match(/^\/users?\/(\d{17,20})\/?$/);
      if (m) return m[1];
    } catch (e) {}
    return "";
  }

  function profilePublicUrl(userId) {
    var id = String(userId || "").trim();
        return id ? "/user/?id=" + encodeURIComponent(id) : "/user";
  }

  function profileCustomizeUrl(userId) {
    var id = String(userId || "").trim();
    return id ? "/personalizza/?id=" + encodeURIComponent(id) + "&target=rank" : "/personalizza/?target=rank";
  }

  function profilePersonalizzaHubUrl(userId) {
    var id = String(userId || "").trim();
    return id ? "/personalizza/?id=" + encodeURIComponent(id) : "/personalizza/";
  }

  function customProfileEditorUrl(target) {
    var t = String(target || "primary").trim().toLowerCase();
    if (t !== "primary" && t !== "secondary" && t !== "voice") t = "primary";
    var q = new URLSearchParams();
    var uid = parseProfileId();
    if (!uid) {
      try {
        if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) {
          uid = String(window.__VC_DISCORD_PROFILE.id || "").trim();
        }
      } catch (eProf) {}
    }
    if (/^\d{17,20}$/.test(uid)) q.set("id", uid);
    q.set("target", t);
    return "/personalizza/?" + q.toString();
  }

  function getDiscordToken() {
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (!t || !exp || Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function customProfileApiUrl() {
    var c = (typeof window !== "undefined" && window.__VC_CUSTOM_PROFILE) || {};
    var local = String(c.apiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local) return local;
    return String(c.apiUrl || "/webhooks/site-custom-profile").trim() || "/webhooks/site-custom-profile";
  }

  function createCustomCardHtml(target, title, meta) {
    return (
      '<div class="vc-user-profile-createcard" data-vc-cpf-create="' +
      esc(target) +
      '">' +
      '<div class="vc-user-profile-createcard__copy">' +
      '<strong class="vc-user-profile-createcard__title">' +
      esc(title) +
      "</strong>" +
      '<span class="vc-user-profile-createcard__meta">' +
      esc(meta) +
      "</span>" +
      "</div>" +
      '<button type="button" class="vc-user-profile-createcard__btn" data-vc-cpf-create-btn="' +
      esc(target) +
      '">Crea</button>' +
      "</div>"
    );
  }

  function notifyUser(msg, isError) {
    var text = String(msg || "").trim();
    if (!text) return;
    try {
      if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
        window.VcSiteToast.show(text, Boolean(isError), { ms: isError ? 3600 : 2200 });
        return;
      }
    } catch (eToast) {}
    try {
      if (window.VcDialog && typeof window.VcDialog.alert === "function") {
        void window.VcDialog.alert({ title: isError ? "Errore" : "Avviso", message: text });
        return;
      }
    } catch (eDlg) {}
    if (typeof window.__vcEnsureDialog === "function") {
      void window.__vcEnsureDialog().then(function (D) {
        if (D && typeof D.alert === "function") {
          return D.alert({ title: isError ? "Errore" : "Avviso", message: text });
        }
      });
    }
  }

  async function createCustomFromProfile(target) {
    var token = getDiscordToken();
    if (!token) {
      notifyUser("Effettua il login Discord per creare ruolo o vocale.", true);
      return;
    }
    var t = String(target || "").trim().toLowerCase();
    if (t !== "primary" && t !== "secondary" && t !== "voice") return;
    var btn = document.querySelector('[data-vc-cpf-create-btn="' + t + '"]');
    if (btn) btn.disabled = true;
    try {
      var res = await fetch(customProfileApiUrl(), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        credentials: "omit",
        body: JSON.stringify({ target: t, action: "create" }),
      });
      var data = await res.json().catch(function () {
        return null;
      });
      if (!data || data.ok !== true) {
        notifyUser((data && data.message) || "Creazione non riuscita.", true);
        if (btn) btn.disabled = false;
        return;
      }
      window.location.href = customProfileEditorUrl(t);
    } catch (e) {
      notifyUser("Errore di rete. Riprova.", true);
      if (btn) btn.disabled = false;
    }
  }

  function wireProfileCustomCreate(root) {
    if (!root || root._vcCpfCreateWired) return;
    root._vcCpfCreateWired = true;
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-vc-cpf-create-btn]") : null;
      if (!btn) return;
      ev.preventDefault();
      createCustomFromProfile(btn.getAttribute("data-vc-cpf-create-btn"));
    });
  }

  function formatIntIt(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try {
      return Math.round(x).toLocaleString("it-IT");
    } catch (e) {
      return String(Math.round(x));
    }
  }

  function formatHoursIt(sec) {
    var s = Number(sec);
    if (!Number.isFinite(s) || s < 0) return "0,0h";
    return String((s / 3600).toFixed(1)).replace(".", ",") + "h";
  }

  function formatPct(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "0%";
    return String(Math.max(0, Math.min(100, Math.round(x)))) + "%";
  }

  function formatMult(n) {
    var x = Number(n);
    if (!Number.isFinite(x) || x <= 0) x = 1;
    return "x" + String(x.toFixed(1));
  }

    function rankCardStatIcon(type) {
    var svg = "";
    if (type === "trophy") {
      svg =
        '<svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">' +
        '<path d="M8 6h16l-2 10c-1.2 3-4.1 5-6 5s-4.8-2-6-5L8 6Z" fill="currentColor"></path>' +
        '<path d="M6 8c-2.9.4-4.8 2-4.8 4.7 0 3.4 2.8 5.8 6.7 5.8M26 8c2.9.4 4.8 2 4.8 4.7 0 3.4-2.8 5.8-6.7 5.8" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"></path>' +
        '<rect x="14" y="20" width="4" height="6" rx="1" fill="currentColor"></rect>' +
        '<rect x="8" y="26" width="16" height="3.6" rx="1.6" fill="currentColor"></rect>' +
        "</svg>";
    } else if (type === "bolt") {
      svg =
        '<svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">' +
        '<path d="M19 1 8 16h7l-3 15 12-17h-7l2-13Z" fill="currentColor"></path>' +
        "</svg>";
    } else {
      svg =
        '<svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">' +
        '<path d="m16 2 3.8 8 8.7 1-6.5 5.7 1.8 8.5L16 21l-7.8 5.2 1.8-8.5L3.5 11l8.7-1L16 2Z" fill="currentColor"></path>' +
        "</svg>";
    }
    return (
      '<span class="vc-rank-editor-preview__icon vc-rank-editor-preview__icon--' +
      esc(type) +
      '">' +
      svg +
      "</span>"
    );
  }

  function hexToRgbList(hex) {
    var raw = String(hex || "").trim();
    var body = raw.charAt(0) === "#" ? raw.slice(1) : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(body)) return "";
    return (
      parseInt(body.slice(0, 2), 16) +
      ", " +
      parseInt(body.slice(2, 4), 16) +
      ", " +
      parseInt(body.slice(4, 6), 16)
    );
  }

  function resolvedRankBoxDisplayColor(src) {
    var rb = String(src.rankBoxBorderColor || "").trim();
    if (rb && rb.charAt(0) !== "#") rb = "#" + rb;
    var value = String(src.valueColor || "#f2f2f2").trim();
    if (value && value.charAt(0) !== "#") value = "#" + value;
    if (rb.toLowerCase() === "#ffcb05") return value;
    if (/^#[0-9a-fA-F]{6}$/.test(rb)) return rb;
    return value;
  }

  function rankCardStyleVars(theme, resolvedWallpaper) {
    var src = theme && typeof theme === "object" ? theme : {};
    var panel = String(src.panelColor || "#202225").trim();
    var primary = String(src.primaryTextColor || "#ffcb05").trim();
    var label = String(src.labelColor || "#a8acb8").trim();
    var secondary = String(src.secondaryTextColor || label || "#a8acb8").trim();
    var value = String(src.valueColor || "#f2f2f2").trim();
    var mult = String(src.multiplierColor || "#ffb400").trim();
    var pStart = String(src.progressStartColor || primary || "#ffcb05").trim();
    var pEnd = String(src.progressEndColor || primary || "#ffcb05").trim();
    var ring = String(src.ringColor || primary || "#ffcb05").trim();
    var rankBox = resolvedRankBoxDisplayColor(src);
    var opacity = src.overlayOpacity != null && src.overlayOpacity !== "" ? Number(src.overlayOpacity) : 0.8;
    if (!isFinite(opacity)) opacity = 0.8;
    opacity = Math.max(0, Math.min(1, opacity));
    var rgb = hexToRgbList(panel);
    var out = [
      "--vc-rank-panel:" + esc(panel),
      "--vc-rank-panel-rgb:" + esc(rgb || "32, 34, 37"),
      "--vc-rank-primary:" + esc(primary),
      "--vc-rank-secondary:" + esc(secondary),
      "--vc-rank-multiplier:" + esc(mult),
      "--vc-rank-value:" + esc(value),
      "--vc-rank-label:" + esc(label),
      "--vc-rank-progress-start:" + esc(pStart),
      "--vc-rank-progress-end:" + esc(pEnd),
      "--vc-rank-ring:" + esc(ring),
      "--vc-rank-rankbox:" + esc(rankBox),
      "--vc-rank-opacity:" + esc(String(opacity)),
    ];
    if (resolvedWallpaper) {
      out.push("--vc-rank-wallpaper:url('" + escForSingleQuotedCssUrl(resolvedWallpaper) + "')");
    }
    return ' style="' + out.join(";") + '"';
  }

  function formatDateIt(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (!isFinite(d.getTime())) return "-";
    try {
      return new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(d);
    } catch (e) {
      return d.toLocaleDateString("it-IT");
    }
  }

  function defaultEmbedAvatarUrl() {
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        return window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eFb) {}
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function profileAvatarSrc(url, avatarHash, userId, size) {
    var raw = String(url || "").trim();
    var hash = String(avatarHash || "").trim();
    var uid = String(userId || "").trim();
    var n = Number(size) || 256;
    var isGuild = /\/guilds\/\d+\/users\//i.test(raw);
    var resolved = "";
    try {
      if (window.VcDiscordIdentity && typeof window.VcDiscordIdentity.pickAvatarUrl === "function" && !raw) {
        resolved = window.VcDiscordIdentity.pickAvatarUrl(
          { avatarUrl: raw, avatar: hash, userId: uid, memberAvatar: isGuild ? hash : "" },
          n,
        );
      }
      if (!resolved && window.VcDiscordAvatar && typeof window.VcDiscordAvatar.resolveUrl === "function") {
        resolved = window.VcDiscordAvatar.resolveUrl(raw, n, isGuild ? "" : hash, uid) || "";
      }
    } catch (eAv) {}
    if (!resolved && raw) resolved = raw;
    if (!resolved && hash && uid && !isGuild) {
      // avatarAnimRestore1: GIF se hash a_ (anche telefono).
      var ext = hash.indexOf("a_") === 0 ? "gif" : "png";
      resolved = "https://cdn.discordapp.com/avatars/" + uid + "/" + hash + "." + ext + "?size=" + n;
    }
    if (!resolved) resolved = uid ? defaultEmbedAvatarUrl(uid) : "";
    return resolved;
  }

  function menuListAvatarSrc(url, userId, size) {
    var n = Number(size) || 64;
    var resolved = profileAvatarSrc(url, "", userId, n);
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.preferStaticUrl === "function") {
        resolved = window.VcDiscordAvatar.preferStaticUrl(resolved, n) || resolved;
      }
    } catch (eStatic) {}
    return resolved;
  }

  function scanProfileAvatars(root) {
    try {
      if (!window.VcDiscordAvatar || typeof window.VcDiscordAvatar.scan !== "function") return;
      window.VcDiscordAvatar.scan(root || byId("vc-user-profile-view") || document);
    } catch (eScan) {}
  }

  function enhanceProfileEmojis(root) {
    try {
      var scope = root || byId("vc-user-profile-view") || document;
      if (window.VcEmojiColor && typeof window.VcEmojiColor.schedule === "function") {
        window.VcEmojiColor.schedule(scope);
      } else if (window.VcEmojiColor && typeof window.VcEmojiColor.wrap === "function") {
        window.VcEmojiColor.wrap(scope);
      }
      if (window.VcEmojiRender && typeof window.VcEmojiRender.enhance === "function") {
        window.VcEmojiRender.enhance(scope);
      }
    } catch (eEmoji) {}
  }

  function hideLeaderOnlySections() {
    var nodes = document.querySelectorAll("[data-vc-leader-only]");
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].hidden = true;
      nodes[i].style.setProperty("display", "none", "important");
    }
    document.documentElement.classList.add("vc-user-profile-route");
    document.documentElement.classList.remove("vc-page-cine-boot");
    document.documentElement.classList.add("vc-page-cine-ready");
    document.body.classList.add("vc-user-profile-page", "vc-user-profile-route");
    document.body.classList.remove("vc-page-cine-layout");
    try {
      delete document.body.dataset.vcPageCineLayout;
    } catch (eData) {}
    var cineHeroes = document.querySelectorAll(".vc-page-cine-hero, .vc-home-cine-hero");
    for (var h = 0; h < cineHeroes.length; h += 1) {
      cineHeroes[h].classList.remove("vc-page-cine-hero", "vc-home-cine-hero");
      cineHeroes[h].style.setProperty("display", "none", "important");
      cineHeroes[h].style.setProperty("min-height", "0", "important");
    }
    var leftover = document.getElementById("vc-page-content");
    if (leftover && leftover.querySelector("[data-vc-leader-only]")) {
      leftover.hidden = true;
      leftover.style.setProperty("display", "none", "important");
    }
    var pager = byId("vc-ul-pager");
    if (pager) {
      pager.hidden = true;
      pager.style.setProperty("display", "none", "important");
    }
  }

  function buildApiUrl(board, userId) {
    var base = resolvedApiUrl();
    if (!base) return "";
    return (
      base.split("?")[0] +
      (base.indexOf("?") >= 0 ? "&" : "?") +
      "board=" +
      encodeURIComponent(board) +
      "&userId=" +
      encodeURIComponent(userId) +
      "&perPage=1"
    );
  }

  function fetchBoard(board, userId) {
    var url = buildApiUrl(board, userId);
    if (!url) return Promise.resolve({ ok: false, board: board, rows: [] });
    return cachedJsonFetch(url, PROFILE_CACHE_TTL_MS)
      .then(function (out) {
        var b = out && out.body ? out.body : {};
        return {
          ok: Boolean(out && out.httpOk && b && b.ok === true),
          board: board,
          notFound: Boolean(b && b.notFound),
          rows: Array.isArray(b && b.rows) ? b.rows : [],
          profile: b && b.profile ? b.profile : null,
        };
      })
      .catch(function () {
        return { ok: false, board: board, rows: [] };
      });
  }

  function fetchProfileBundle(userId, opts) {
    var url = buildApiUrl("profile", userId);
    if (!url) {
      return Promise.resolve({
        ok: false,
        notFound: false,
        profile: null,
        level: null,
        weekly: null,
        messages: null,
        voice: null,
      });
    }

    function mapBody(out) {
      var b = out && out.body ? out.body : {};
      var rows = b && b.rows && typeof b.rows === "object" ? b.rows : {};
      return {
        ok: Boolean(out && out.httpOk && b && b.ok === true),
        notFound: Boolean(b && b.notFound),
        userId: String(userId || ""),
        profile: b && b.profile ? b.profile : null,
        level: rows.level || null,
        weekly: rows.weekly || null,
        messages: rows.messages || null,
        voice: rows.voice || null,
      };
    }

    function emptyResult(timedOut) {
      return {
        ok: false,
        notFound: false,
        timedOut: Boolean(timedOut),
        profile: null,
        level: null,
        weekly: null,
        messages: null,
        voice: null,
      };
    }

    function directFetch() {
      return cachedJsonFetch(url, PROFILE_CACHE_TTL_MS, opts)
        .then(mapBody)
        .catch(function () {
          return emptyResult(false);
        });
    }

    function firstUsableProfileResult(promises) {
      return new Promise(function (resolve) {
        var pending = promises.length;
        var best = null;
        if (!pending) {
          resolve(emptyResult(false));
          return;
        }
        promises.forEach(function (promiseLike) {
          Promise.resolve(promiseLike)
            .then(function (result) {
              if (result && result.ok) {
                resolve(result);
                return;
              }
              if (result && !best) best = result;
              pending -= 1;
              if (pending <= 0) resolve(best || emptyResult(false));
            })
            .catch(function () {
              pending -= 1;
              if (pending <= 0) resolve(best || emptyResult(false));
            });
        });
      });
    }

    var sources = [directFetch()];
    try {
      // profileDataLock1: prefetch result must match requested userId (never reuse peer/viewer).
      var readyPrefetch = window.__VC_PROFILE_PREFETCH_RESULT;
      var readyPrefetchUser = "";
      try {
        readyPrefetchUser = String(
          (readyPrefetch && readyPrefetch.userId) ||
            (window.__VC_PROFILE_PREFETCH && window.__VC_PROFILE_PREFETCH.userId) ||
            "",
        ).trim();
      } catch (ePrefUid) {
        readyPrefetchUser = "";
      }
      if (
        readyPrefetch &&
        readyPrefetch.httpOk &&
        readyPrefetch.body &&
        readyPrefetch.body.ok &&
        readyPrefetchUser === String(userId) &&
        payloadLooksLikeUser(
          {
            profile: readyPrefetch.body.profile || {},
            level: (readyPrefetch.body.rows && readyPrefetch.body.rows.level) || {},
            userId: readyPrefetchUser,
          },
          userId,
        )
      ) {
        sources.unshift(Promise.resolve(mapBody(readyPrefetch)));
      } else if (readyPrefetch && readyPrefetchUser && readyPrefetchUser !== String(userId)) {
        window.__VC_PROFILE_PREFETCH_RESULT = null;
      }
    } catch (eReadyPref) {}
    try {
      var prefetch = window.__VC_PROFILE_PREFETCH;
      if (
        prefetch &&
        String(prefetch.userId || "") === String(userId) &&
        prefetch.promise &&
        typeof prefetch.promise.then === "function"
      ) {
        window.__VC_PROFILE_PREFETCH = null;
        sources.unshift(
          prefetch.promise
            .then(function (out) {
              if (!out || String((out && out.userId) || prefetch.userId || "") !== String(userId)) {
                return emptyResult(false);
              }
              return mapBody(out);
            })
            .catch(function () {
              return emptyResult(false);
            }),
        );
      }
    } catch (ePref) {}

    var fetchPromise = firstUsableProfileResult(sources);
    var timeoutMs = Math.max(profileFetchTimeoutMs() + 8000, 32000);
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve(emptyResult(true));
      }, timeoutMs);
      fetchPromise
        .then(function (result) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        })
        .catch(function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(emptyResult(true));
        });
    });
  }

  function clearProfilePending() {
    /* profileNoCommunityFlash1: prima di togliere pending, nascondi forever
       intro Classifica/Community (altrimenti flash al posto del loader). */
    try {
      if (parseProfileId() || document.documentElement.classList.contains("vc-user-profile-route")) {
        hideLeaderOnlySections();
      }
    } catch (eHideLead) {}
    try {
      document.documentElement.classList.remove("vc-user-profile-pending");
      document.documentElement.classList.remove("vc-loading-scroll-lock");
    } catch (e) {}
    try {
      var html = document.documentElement;
      var body = document.body;
      if (html) {
        html.style.removeProperty("overflow");
        html.style.removeProperty("overflow-x");
        html.style.removeProperty("overflow-y");
        html.style.removeProperty("height");
        html.style.removeProperty("max-height");
        html.style.removeProperty("touch-action");
      }
      if (body) {
        body.style.removeProperty("position");
        body.style.removeProperty("inset");
        body.style.removeProperty("top");
        body.style.removeProperty("right");
        body.style.removeProperty("bottom");
        body.style.removeProperty("left");
        body.style.removeProperty("width");
        body.style.removeProperty("overflow");
        body.style.removeProperty("overflow-x");
        body.style.removeProperty("overflow-y");
        body.style.removeProperty("height");
        body.style.removeProperty("max-height");
        body.style.removeProperty("touch-action");
      }
    } catch (eStyle) {}
    // switcherReload1: pending alzato → switcher nascosto; al clear ripristina.
    try {
      if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.renderSwitcher === "function") {
        var pid = parseProfileId();
        if (pid) window.VCUserProfileStaffTab.renderSwitcher(byId("vc-user-profile-view"), pid);
      }
    } catch (eSw) {}
  }

  function unlockProfileChrome() {
    /* profileUnlockNoYank2 + profileNoCommunityFlash1: scrollTo(0) SOLO al primo settle.
       Ri-chiamate non yankano; pending/loader restano finché shell profilo ready.
       bootMidAvatar1: __vcProfileForceTop (peer switch) → sempre top + wake avatar. */
    var forceTop = false;
    try {
      forceTop = window.__vcProfileForceTop === 1;
      if (forceTop) window.__vcProfileForceTop = 0;
    } catch (eFt) {
      forceTop = false;
    }
    var liveY = 0;
    try {
      liveY = Math.max(
        0,
        Math.round(
          Number(window.pageYOffset) ||
            Number((document.documentElement && document.documentElement.scrollTop) || 0) ||
            Number((document.body && document.body.scrollTop) || 0) ||
            Number(window.__vcCachedScrollY) ||
            0,
        ),
      );
    } catch (eY) {
      liveY = 0;
    }
    var alreadyReady = window.__vcProfileContentReady === 1;
    var chromeArmed =
      window.__vcChromeScrollArmed === true ||
      document.documentElement.classList.contains("vc-chrome-scroll-armed") ||
      document.documentElement.classList.contains("vc-page-cine-ready");
    try {
      /* profileSipContent1: contentReady solo con shell DOM (sipario non si alza a vuoto) */
      if (profileViewLooksReady(byId("vc-user-profile-view"))) {
        window.__vcProfileContentReady = 1;
      }
      /* non yankare / discard se già aperti o utente ha scrollato — salvo forceTop peer */
      if (forceTop || (!alreadyReady && liveY < 24)) {
        window.__vcDiscardScrollRestore = 1;
        window.__vcDiscardNextUnpinScrollY = true;
        window.__vcCachedScrollY = 0;
        window.__vcWantUnlockY = 0;
        try {
          window.__vcUserScrolledAway = 0;
        } catch (eAwayClr) {}
        if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        liveY = 0;
      } else if (liveY >= 24) {
        try {
          window.__vcDiscardScrollRestore = 0;
          window.__vcDiscardNextUnpinScrollY = false;
          window.__vcCachedScrollY = liveY;
        } catch (eKeepY) {}
      }
    } catch (ePin) {}
    try {
      if (typeof window.__vcProfileSiparioTryLift === "function") {
        var lifted = window.__vcProfileSiparioTryLift(false);
        if (!lifted) {
          if (!window.__vcProfileGateOpenHooked) {
            window.__vcProfileGateOpenHooked = 1;
            document.addEventListener(
              "vc:profile-gate-open",
              function onGate() {
                try {
                  clearProfilePending();
                } catch (eClr) {}
              },
              { once: true },
            );
          }
        } else {
          clearProfilePending();
        }
      } else {
        clearProfilePending();
      }
    } catch (eSip) {
      clearProfilePending();
    }
    try {
      document.documentElement.classList.remove("vc-page-cine-boot");
      document.documentElement.classList.add("vc-page-cine-ready", "vc-user-profile-route");
    } catch (eReady) {}
    try {
      if (document.body) {
        document.body.classList.add("vc-user-profile-page", "vc-user-profile-route");
      }
    } catch (eBody) {}
    /* profileUnlockNoYank2 + profileNoCommunityFlash1: soft-lock via subito,
       ma pending/loader restano finché c’è shell profilo (no flash Community). */
    try {
      hideLeaderOnlySections();
    } catch (eHide2) {}
    if (chromeArmed || alreadyReady) {
      try {
        document.documentElement.classList.remove(
          "vc-loading-scroll-lock",
          "vc-loader-blocking-live",
          "vc-scroll-soft-lock",
          "vc-interaction-hold",
          "vc-chrome-bar-loading",
        );
        var viewReadyNow = false;
        try {
          viewReadyNow =
            profileInitialLoadDone ||
            profileBootSettled ||
            profileViewLooksReady(byId("vc-user-profile-view"));
        } catch (eVr) {
          viewReadyNow = Boolean(alreadyReady && profileInitialLoadDone);
        }
        if (viewReadyNow) {
          clearProfilePending();
          clearProfileLoading();
        }
      } catch (eClr2) {}
    }
  }

  function profileViewLooksReady(root) {
    if (!root || root.hidden) return false;
    var shell = root.querySelector(":scope > .vc-user-profile-shell");
    if (
      shell &&
      shell.querySelector(
        ".vc-user-profile-hero, .vc-user-profile-notfound, .vc-user-profile-empty",
      )
    ) {
      return true;
    }
    var staffPane = root.querySelector(".vc-user-profile-staff-pane");
    if (
      staffPane &&
      !staffPane.hidden &&
      staffPane.querySelector(".vc-user-profile-hero, .vc-staff-profile-panel, .vc-user-profile-shell")
    ) {
      return true;
    }
    return false;
  }

    function communityShellLooksReadyFor(root, userId) {
    if (!root) return false;
    var want = String(userId || "").trim();
    var shell = root.querySelector(":scope > .vc-user-profile-shell");
    if (!shell) return false;
    if (shell.getAttribute("data-vc-community-stale") === "1") return false;
    var shellUser = String(shell.getAttribute("data-vc-community-user") || "").trim();
    if (want && shellUser !== want) return false;
    if (!shell.querySelector(".vc-user-profile-hero, .vc-user-profile-notfound, .vc-user-profile-empty")) {
      return false;
    }
    if (!want) return true;
    try {
      var idEl = shell.querySelector(".vc-user-profile-id");
      if (!idEl) return false;
      var txt = String(idEl.textContent || "");
      // staffCommSwitch2: indexOf("") è sempre 0 — richiedi id reale.
      return /^\d{17,20}$/.test(want) && txt.indexOf(want) !== -1;
    } catch (eId) {
      return false;
    }
  }

  function profileViewLooksBroken(root) {
    if (!root) return true;
    if (root.hidden) return true;
    if (profileViewLooksReady(root)) return false;
        var shell = root.querySelector(":scope > .vc-user-profile-shell");
    var hasOnlyBoot = Boolean(root.querySelector("[data-vc-profile-boot]")) && !shell;
    if (hasOnlyBoot) return true;
    if (!root.innerHTML || !String(root.innerHTML).trim()) return true;
    try {
      var body = document.body;
      var staffClass = body && body.classList.contains("vc-user-profile-staff-tab");
      var pendingStaff = document.documentElement.classList.contains("vc-user-profile-staff-tab-pending");
      if ((staffClass || pendingStaff) && shell && !root.querySelector(".vc-user-profile-staff-pane .vc-user-profile-hero, .vc-user-profile-staff-pane .vc-staff-profile-panel")) {
        return true;
      }
    } catch (eBroken) {}
    return !shell && !root.querySelector(".vc-user-profile-staff-pane");
  }

  function clearProfileLoading() {
    var overlay = byId("vc-user-profile-loading");
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute("hidden", "");
      overlay.remove();
    }
    try {
      var boots = document.querySelectorAll("[data-vc-profile-boot]");
      for (var i = 0; i < boots.length; i += 1) {
                if (boots[i].closest && boots[i].closest("[data-vc-profile-staff-pane]")) continue;
        if (boots[i].getAttribute && boots[i].getAttribute("data-vc-staff-loading")) continue;
        if (boots[i].id === "vc-user-profile-loading") continue;
        boots[i].remove();
      }
    } catch (eBoot) {}
    /* profileToastKill1: togli Caricamento… orfano post-sipario */
    try {
      if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") window.VcSiteToast.hide();
      var th = byId("vc-site-toast-host");
      if (th && th.querySelector("[data-vc-boot-load-toast],.is-pending")) th.innerHTML = "";
    } catch (eToast) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      if (typeof window.__vcSyncLoaderBlockingLiveClass === "function") {
        window.__vcSyncLoaderBlockingLiveClass();
      }
    } catch (eLock) {}
  }

  function ensureProfileLoadGate() {
    try {
      document.documentElement.classList.add("vc-user-profile-route");
      document.documentElement.classList.remove("vc-page-cine-boot");
      /* profileRelockKill1: se chrome già sbloccato, spinner OK ma niente pending
         (pending → overflow:hidden / secondo lock dopo la barra). */
      var chromeOpen =
        window.__vcChromeLoadDone === true ||
        document.documentElement.classList.contains("vc-page-cine-ready") ||
        document.documentElement.classList.contains("vc-cine-curtain-off") ||
        document.documentElement.classList.contains("vc-chrome-scroll-armed");
      if (chromeOpen) {
        document.documentElement.classList.remove(
          "vc-user-profile-pending",
          "vc-loading-scroll-lock",
          "vc-loader-blocking-live",
        );
      } else {
        document.documentElement.classList.add("vc-user-profile-pending");
      }
      hideLeaderOnlySections();
    } catch (eGate) {}
  }

  function renderInlineLoading(root, opts) {
    if (!root) return;
    opts = opts || {};
    var force = Boolean(opts.force);
    root.hidden = false;
    /* profileUnlockNoYank2: dopo primo unlock/chrome → niente secondo overlay full-page
       (freeze + rotellina). Solo se force switch community/staff.
       Early-return PRIMA di ensureProfileLoadGate (evita pending flash). */
    try {
      var chromeOpenEarly =
        window.__vcProfileContentReady === 1 ||
        window.__vcChromeLoadDone === true ||
        document.documentElement.classList.contains("vc-chrome-scroll-armed") ||
        document.documentElement.classList.contains("vc-page-cine-ready") ||
        document.documentElement.classList.contains("vc-cine-curtain-off");
      if (chromeOpenEarly && profileViewLooksReady(root) && !force) {
        clearProfilePending();
        return;
      }
      if (
        chromeOpenEarly &&
        window.__vcProfileContentReady === 1 &&
        !force &&
        !communitySwitchGateActive()
      ) {
        clearProfilePending();
        return;
      }
    } catch (eNo2nd) {}
    if (!force) {
      var bodyOverlay = byId("vc-user-profile-loading");
      if (bodyOverlay && !(bodyOverlay.hidden || bodyOverlay.hasAttribute("hidden"))) {
        return;
      }
    }
    ensureProfileLoadGate();
    var overlay = byId("vc-user-profile-loading");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "vc-user-profile-loading";
      document.body.appendChild(overlay);
    }
    overlay.className = "vc-user-profile-loader vc-user-profile-boot";
    overlay.setAttribute("data-vc-profile-boot", "1");
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.setAttribute("aria-label", "Caricamento…");
    overlay.hidden = false;
    overlay.removeAttribute("hidden");
    overlay.innerHTML =
      '<span class="vc-user-profile-loader__spin" aria-hidden="true"></span>' +
      '<p class="vc-user-profile-loader__title">Caricamento…</p>' +
      '<p class="vc-user-profile-loader__sub">Un momento…</p>';
    /* profileToastKill1: dopo curtain, MAI wipe shell/hero/notfound già paintati
       (force+retry lasciava solo footer + toast Caricamento) */
    var curtainOff = false;
    try {
      curtainOff = document.documentElement.classList.contains("vc-cine-curtain-off");
    } catch (eCurt) {}
    var hasPaintedShell = false;
    try {
      hasPaintedShell = Boolean(
        root.querySelector(
          ":scope > .vc-user-profile-shell, .vc-user-profile-hero, .vc-user-profile-notfound, .vc-user-profile-empty, .vc-staff-profile-panel, .vc-staff-prof-miss",
        ),
      );
    } catch (ePainted) {}
    if (curtainOff && hasPaintedShell) {
      try {
        clearProfilePending();
        if (overlay && overlay.parentNode) {
          overlay.hidden = true;
          overlay.setAttribute("hidden", "");
          overlay.remove();
        }
      } catch (eNoWipe) {}
      return;
    }
    var mayWipe = !hasPaintedShell && (force || !curtainOff);
    if (mayWipe) {
      if (opts.preserveStaffPane) {
        try {
          var shells = root.querySelectorAll(":scope > .vc-user-profile-shell");
          for (var si = 0; si < shells.length; si += 1) shells[si].remove();
        } catch (eShells) {}
      } else {
        root.innerHTML = "";
      }
    }
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      if (typeof window.__vcSyncLoaderBlockingLiveClass === "function") {
        window.__vcSyncLoaderBlockingLiveClass();
      }
    } catch (eLock) {}
    /* profileRelockKill2: spinner sì, soft-lock/hold no se chrome già aperto */
    try {
      var chromeOpenSpin =
        window.__vcChromeLoadDone === true ||
        document.documentElement.classList.contains("vc-chrome-scroll-armed") ||
        document.documentElement.classList.contains("vc-cine-curtain-off");
      if (chromeOpenSpin) {
        document.documentElement.classList.remove(
          "vc-user-profile-pending",
          "vc-loading-scroll-lock",
          "vc-loader-blocking-live",
          "vc-scroll-soft-lock",
          "vc-interaction-hold",
        );
        var htmlSpin = document.documentElement;
        var bodySpin = document.body;
        htmlSpin.style.removeProperty("overflow");
        htmlSpin.style.removeProperty("overscroll-behavior");
        htmlSpin.style.removeProperty("touch-action");
        if (bodySpin) {
          bodySpin.style.removeProperty("overflow");
          bodySpin.style.removeProperty("overscroll-behavior");
          bodySpin.style.removeProperty("touch-action");
          bodySpin.style.removeProperty("position");
          bodySpin.style.removeProperty("top");
          bodySpin.style.removeProperty("left");
          bodySpin.style.removeProperty("right");
          bodySpin.style.removeProperty("width");
        }
        if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
      }
    } catch (eSpinUnlock) {}
  }

  function parseWantsStaffTab() {
    try {
      var tab = String(new URLSearchParams(window.location.search || "").get("tab") || "")
        .trim()
        .toLowerCase();
      if (tab === "staff") return true;
      if (tab === "community") return false;
    } catch (e) {}
    // profileTabDefaultCommunity1: solo URL ?tab=staff (no sticky storage / class).
    return false;
  }

  function renderLoading(root, opts) {
        clearProfileLoading();
    renderInlineLoading(root, opts);
  }

  function renderError(root, message) {
    clearProfileLoading();
    profileBootSettled = true;
    unlockProfileChrome();
    root.hidden = false;
    root.innerHTML =
      '<section class="vc-user-profile-shell">' +
      '<div class="vc-user-profile-empty">' +
      '<div class="vc-user-profile-empty__emoji" aria-hidden="true">!</div>' +
      '<h1 class="vc-user-profile-empty__title">Profilo non disponibile</h1>' +
      '<p class="vc-user-profile-empty__text">' +
      esc(message || "Non sono riuscito a caricare i dati del profilo in questo momento.") +
      "</p>" +
      '<div class="vc-user-profile-empty__actions">' +
      '<button type="button" class="vc-user-profile-empty__cta" id="vc-user-profile-retry">Riprova</button>' +
      '<a class="vc-user-profile-empty__cta vc-user-profile-empty__cta--ghost" href="/classifiche/">Torna alla Community</a>' +
      "</div></div></section>";
    clearProfilePending();
    var retryBtn = byId("vc-user-profile-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        profileBootGaveUp = false;
        window.__VC_PROFILE_GAVE_UP = false;
        profileInitialLoadDone = false;
        clearProfileSessionCaches();
        main({ force: true });
      });
    }
  }

  function renderEmpty(root, userId) {
    clearProfileLoading();
    profileBootSettled = true;
    unlockProfileChrome();
    if (window.VcPageTitle) window.VcPageTitle.set("Profilo");
    else setProfilePageTitle("Profilo");
    root.hidden = false;
    root.innerHTML =
      '<section class="vc-user-profile-shell vc-user-profile-shell--notfound">' +
      '<div class="vc-user-profile-notfound">' +
      '<div class="vc-user-profile-notfound__emoji" aria-hidden="true">&#128532;</div>' +
      '<h1 class="vc-user-profile-notfound__title">Utente non trovato</h1>' +
      '<a class="vc-user-profile-notfound__cta" href="/classifiche/">Torna alla Community</a>' +
      "</div></section>";
    clearProfilePending();
  }

  function includesAnyRole(roleText, terms) {
    for (var i = 0; i < terms.length; i += 1) {
      if (roleText.indexOf(terms[i]) !== -1) return true;
    }
    return false;
  }

  function normalizeRoleName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/<a?:[^:]+:\d+>/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasRoleId(roles, id) {
    var want = String(id || "");
    if (!want || !Array.isArray(roles)) return false;
    for (var i = 0; i < roles.length; i += 1) {
      if (String((roles[i] && roles[i].id) || "") === want) return true;
    }
    return false;
  }

  function hasNormalizedRole(roleNames, matcher) {
    for (var i = 0; i < roleNames.length; i += 1) {
      if (matcher(roleNames[i])) return true;
    }
    return false;
  }

  function leaderboardBadgeLabel(rank) {
    var n = Number(rank || 0);
    if (n === 1) return "Primo in classifica";
    if (n === 2) return "Secondo in classifica";
    if (n === 3) return "Terzo in classifica";
    return "#" + formatIntIt(n) + " in classifica";
  }

  function leaderboardBadgeClass(rank) {
    var n = Number(rank || 0);
    if (n === 1) return "rank1";
    if (n === 2) return "rank2";
    if (n === 3) return "rank3";
    return "rank";
  }

  function profileBadgeMarkup(kind, icon, label) {
    return (
      '<span class="vc-user-profile-badge vc-user-profile-badge--' +
      esc(kind) +
      '">' +
      '<span class="vc-user-profile-badge__icon"><i class="fa ' +
      esc(icon) +
      '" aria-hidden="true"></i></span>' +
      '<span class="vc-user-profile-badge__label">' +
      esc(label) +
      "</span></span>"
    );
  }

  /* discordNameEmoji1: ǀ (U+01C0); FE32/| venivano mostrati come "-" su Win */
  var CUSTOM_VOC_SEP = "\u01C0";
  var CUSTOM_VOC_SEPARATORS = [
    CUSTOM_VOC_SEP,
    "\uFE32",
    "\u2758",
    "︲",
    "|",
    "│",
    "｜",
    "⠂",
    "•",
    "·",
    "—",
    "–",
    "-",
  ];

  function parseCustomVocName(rawName) {
    var name = String(rawName || "").trim();
    if (!name) return { emoji: "", baseName: "privata" };
    var i;
    for (i = 0; i < CUSTOM_VOC_SEPARATORS.length; i += 1) {
      var separator = CUSTOM_VOC_SEPARATORS[i];
      if (name.indexOf(separator) === -1) continue;
      var parts = name.split(separator);
      var left = String(parts.shift() || "")
        .replace(/^\u0F04/u, "")
        .replace(/^༄/u, "")
        .trim();
      var right = parts.join(separator).trim();
      if (separator === "-" && left.length > 8) continue;
      return { emoji: left, baseName: right || "privata" };
    }
    return {
      emoji: "",
      baseName: name.replace(/^\u0F04/u, "").replace(/^༄/u, "").trim() || "privata",
    };
  }

  function isUsableProfileDisplayName(name) {
    var s = String(name || "")
      .replace(/^\u0F04/u, "")
      .replace(/^༄/u, "")
      .trim();
    if (!s || s.length < 2) return false;
    if (/^[\u0F00-\u0FFF\uFE00-\uFEFF\u200D\s]+$/u.test(s)) return false;
    return true;
  }

  function resolveProfileDisplayName(profile, level) {
    var profileObj = profile || {};
    var levelObj = level || {};
    var raw = String(
      profileObj.displayName || profileObj.username || levelObj.username || "",
    ).trim();
    if (!isUsableProfileDisplayName(raw)) {
      raw = String(profileObj.username || levelObj.username || "Utente").trim() || "Utente";
    }
    return raw;
  }

  function formatCustomVoiceTitleHtml(voice, fallbackName) {
    if (!voice) return esc(String(fallbackName || "Canale vocale privato"));
    var parsed = parseCustomVocName(voice.name);
    var emoji = String(voice.emoji || parsed.emoji || "").trim();
    var baseName = String(parsed.baseName || voice.name || fallbackName || "Canale vocale privato").trim();
    /* se il nome grezzo è ancora "emojiSEP nome", non duplicare emoji nel testo */
    if (emoji && baseName.indexOf(emoji) === 0) {
      baseName = baseName.slice(emoji.length).replace(/^[\s\uFE32\u01C0\u2758|│｜\-–—]+/, "").trim() || baseName;
    }
    if (!emoji) {
      return (
        '<span class="vc-user-profile-voice-title vc-discord-entity" data-vc-emoji-skip="1">' +
        esc(baseName) +
        "</span>"
      );
    }
    return (
      '<span class="vc-user-profile-voice-title vc-discord-entity" data-vc-emoji-skip="1">' +
      '<span class="vc-user-profile-voice-title__emoji">' +
      esc(emoji) +
      "</span>" +
      '<span class="vc-user-profile-voice-title__sep" aria-hidden="true">' +
      CUSTOM_VOC_SEP +
      "</span>" +
      '<span class="vc-user-profile-voice-title__name">' +
      esc(baseName) +
      "</span></span>"
    );
  }

  function discordRoleIconImgHtml(iconUrl, iconAnimated, className, px) {
    var url = String(iconUrl || "").trim();
    if (!/^https?:\/\//i.test(url)) return "";
    var size = Math.max(12, Number(px) || 16);
    var anim =
      iconAnimated === true ||
      /[?&]animated=true\b/i.test(url) ||
      /\/a_[a-f0-9]+\.(webp|gif|png)/i.test(url);
    /* discordRoleLook2: role-icons sempre webp; animated se a_* */
    if (/cdn\.discordapp\.com\/role-icons\//i.test(url)) {
      url = url.replace(/\.(png|jpe?g|gif)(\?|$)/i, ".webp$2");
    } else if (anim && /\.png(\?|$)/i.test(url)) {
      url = url.replace(/\.png(\?|$)/i, ".webp$1");
    }
    if (anim && !/[?&]animated=/i.test(url)) {
      url += (url.indexOf("?") >= 0 ? "&" : "?") + "animated=true";
    }
    return (
      '<img class="' +
      esc(className || "vc-user-profile-role__icon") +
      (anim ? " is-animated" : "") +
      '" src="' +
      esc(url) +
      '" alt="" width="' +
      size +
      '" height="' +
      size +
      '" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" />'
    );
  }

  /* roleContrast1: ruoli Discord quasi neri → testo leggibile su dark UI */
  function readableDiscordRoleColor(input) {
    var raw = String(input || "").trim();
    if (!raw || raw === "transparent") return raw;
    var r;
    var g;
    var b;
    var m = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length === 8) h = h.slice(0, 6);
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    } else {
      var m2 = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (!m2) return raw;
      r = Number(m2[1]);
      g = Number(m2[2]);
      b = Number(m2[3]);
    }
    function lin(c) {
      c = c / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    function hex(rr, gg, bb) {
      return (
        "#" +
        [rr, gg, bb]
          .map(function (x) {
            return ("0" + Math.max(0, Math.min(255, x)).toString(16)).slice(-2);
          })
          .join("")
      );
    }
    var L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    if (L >= 0.36) return hex(r, g, b);
    var mix = 0;
    var outR = r;
    var outG = g;
    var outB = b;
    while (L < 0.52 && mix < 0.95) {
      mix += 0.05;
      outR = Math.round(r + (255 - r) * mix);
      outG = Math.round(g + (255 - g) * mix);
      outB = Math.round(b + (255 - b) * mix);
      L = 0.2126 * lin(outR) + 0.7152 * lin(outG) + 0.0722 * lin(outB);
    }
    return hex(outR, outG, outB);
  }

  function formatDiscordRoleChipHtml(role) {
    if (!role) return "";
    var color = String(role.color || "").trim();
    var textColor = color ? readableDiscordRoleColor(color) : "";
    var chipInk = textColor || "#dbdee1";
    /* roleContrast1d: ink solido inline (no clip:text look-core) */
    var style =
      " style=\"font-family:'gg sans',Inter,system-ui,sans-serif!important;font-weight:500!important;" +
      (color ? "--vc-role-chip:" + esc(color) + ";" : "") +
      (textColor ? "--vc-role-chip-text:" + esc(textColor) + ";" : "") +
      "color:" +
      esc(chipInk) +
      "!important;-webkit-text-fill-color:" +
      esc(chipInk) +
      "!important;" +
      '"';
    var iconUrl = String(role.iconUrl || "").trim();
    var emoji = String(role.emoji || "").trim();
    var iconHtml = discordRoleIconImgHtml(iconUrl, role.iconAnimated, "vc-user-profile-role__icon", 16);
    if (!iconHtml && emoji) {
      iconHtml = '<span class="vc-user-profile-role__emoji" aria-hidden="true">' + esc(emoji) + "</span>";
    }
    if (!iconHtml) {
      /* Discord: pallino colore se niente icona/emoji */
      iconHtml = '<span class="vc-user-profile-role__dot" aria-hidden="true"></span>';
    }
    return (
      '<span class="vc-user-profile-role vc-discord-entity" data-vc-emoji-skip="1"' +
      style +
      ">" +
      iconHtml +
      '<span class="vc-user-profile-role__name">' +
      esc(role.name || "Ruolo") +
      "</span></span>"
    );
  }

  var PROFILE_BDAY_MONTHS_IT = [
    "",
    "Gennaio",
    "Febbraio",
    "Marzo",
    "Aprile",
    "Maggio",
    "Giugno",
    "Luglio",
    "Agosto",
    "Settembre",
    "Ottobre",
    "Novembre",
    "Dicembre",
  ];
  var birthdayCalendarPopEl = null;
  var birthdayCalendarFetchToken = 0;

  function buildBirthdaysCalendarUrl(month, year) {
    var base = resolvedApiUrl();
    if (!base) return "";
    var root = base.split("?")[0];
    return (
      root +
      (base.indexOf("?") >= 0 ? "&" : "?") +
      "board=birthdays&month=" +
      encodeURIComponent(String(month)) +
      "&year=" +
      encodeURIComponent(String(year))
    );
  }

  function closeBirthdayCalendar() {
    if (birthdayCalendarPopEl && birthdayCalendarPopEl.parentNode) {
      birthdayCalendarPopEl.parentNode.removeChild(birthdayCalendarPopEl);
    }
    birthdayCalendarPopEl = null;
    try {
      document.documentElement.classList.remove("vc-user-profile-bday-open");
      document.body.classList.remove("vc-user-profile-bday-open");
    } catch (eClose) {}
  }

  function formatBirthdayBadgeLabel(birthday) {
    if (!birthday || !birthday.day || !birthday.month) return "";
    var day = Number(birthday.day) || 0;
    var month = Number(birthday.month) || 0;
    if (!day || !month) return "";
    var monthName = String(PROFILE_BDAY_MONTHS_IT[month] || "").trim();
    if (!monthName) return String(birthday.label || birthday.shortLabel || "").trim();
    var out = day + " " + monthName;
    var showYear = birthday.showAge !== false;
    var year = Number(birthday.birthYear);
    if (showYear && Number.isFinite(year) && year >= 1900) out += " " + year;
    return out;
  }

  function buildBirthdayBadgeHtml(birthday) {
    if (!birthday || !birthday.day || !birthday.month) return "";
    var label = formatBirthdayBadgeLabel(birthday);
    if (!label) return "";
    var todayClass = birthday.isToday ? " vc-user-profile-bday-badge--today" : "";
    var title = label;
    if (birthday.isToday) title = "Oggi è il compleanno — " + title;
    return (
      '<button type="button" class="vc-user-profile-bday-badge' +
      todayClass +
      '" data-vc-bday-badge aria-haspopup="dialog" aria-expanded="false" aria-label="Compleanno: ' +
      esc(title) +
      ' — apri calendario">' +
      '<span class="vc-user-profile-bday-badge__icon" aria-hidden="true"><i class="fa fa-birthday-cake"></i></span>' +
      '<span class="vc-user-profile-bday-badge__label">' +
      esc(label) +
      "</span></button>"
    );
  }

  function daysInCalendarMonth(month, year) {
    return new Date(year, month, 0).getDate();
  }

  function calendarLeadingBlanks(month, year) {
    var dow = new Date(year, month - 1, 1).getDay();
    return dow === 0 ? 6 : dow - 1;
  }

  function groupBirthdaysByDay(entries) {
    var map = {};
    (entries || []).forEach(function (entry) {
      var day = Number(entry && entry.day);
      if (!day) return;
      if (!map[day]) map[day] = [];
      map[day].push(entry);
    });
    return map;
  }

  function shiftCalendarMonth(month, year, delta) {
    var m = Number(month) + Number(delta);
    var y = Number(year);
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    return { month: m, year: y };
  }

  function formatBirthdayEntryMeta(entry, calendarYear) {
    var meta = String((entry && entry.label) || "").trim();
    if (!meta && entry && entry.day) {
      var monthIdx = Number(entry.month) || 0;
      meta = String(entry.day) + " " + String(PROFILE_BDAY_MONTHS_IT[monthIdx] || "").toLowerCase();
    }
    var showAge = !entry || entry.showAge !== false;
    var birthYear = Number(entry && entry.birthYear);
    var viewYear = Number(calendarYear);
    if (showAge && Number.isFinite(birthYear) && birthYear >= 1900 && Number.isFinite(viewYear)) {
      var turning = viewYear - birthYear;
      if (turning >= 0 && turning <= 120) {
        meta += " · compie " + turning + " anni";
      }
    }
    return meta;
  }

  function renderBirthdayCalendarHtml(data, highlightUserId) {
    var month = Number(data && data.month) || 1;
    var year = Number(data && data.year) || new Date().getFullYear();
    var monthLabel = String((data && data.monthLabel) || PROFILE_BDAY_MONTHS_IT[month] || month);
    var entries = Array.isArray(data && data.entries) ? data.entries : [];
    var byDay = groupBirthdaysByDay(entries);
    var totalDays = daysInCalendarMonth(month, year);
    var lead = calendarLeadingBlanks(month, year);
    var todayDay = Number(data && data.todayDay) || -1;
    var weekdays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
    var head = weekdays
      .map(function (w) {
        return '<span class="vc-user-profile-bday-pop__wd">' + esc(w) + "</span>";
      })
      .join("");
    var cells = "";
    var i;
    for (i = 0; i < lead; i += 1) {
      cells += '<span class="vc-user-profile-bday-pop__cell is-empty" aria-hidden="true"></span>';
    }
    for (i = 1; i <= totalDays; i += 1) {
      var dayEntries = byDay[i] || [];
      var isToday = i === todayDay;
      var hasMine = highlightUserId
        ? dayEntries.some(function (e) {
            return String(e.userId || "") === String(highlightUserId);
          })
        : false;
      var cellClass = "vc-user-profile-bday-pop__cell";
      if (isToday) cellClass += " is-today";
      if (dayEntries.length) cellClass += " has-birthdays";
      if (hasMine) cellClass += " is-profile-day";
      var listHtml = dayEntries
        .slice(0, 3)
        .map(function (entry) {
          var name = String(entry.displayName || entry.userId || "Utente").trim();
          var href = String(entry.profileUrl || "/user/?id=" + encodeURIComponent(entry.userId || ""));
          return (
            '<a class="vc-user-profile-bday-pop__person" href="' +
            esc(href) +
            '" title="' +
            esc(entry.label || name) +
            '">' +
            esc(name) +
            "</a>"
          );
        })
        .join("");
      if (dayEntries.length > 3) {
        listHtml +=
          '<span class="vc-user-profile-bday-pop__more">+' +
          esc(String(dayEntries.length - 3)) +
          "</span>";
      }
      cells +=
        '<div class="' +
        cellClass +
        '"><span class="vc-user-profile-bday-pop__daynum">' +
        esc(String(i)) +
        "</span>" +
        (listHtml ? '<div class="vc-user-profile-bday-pop__people">' + listHtml + "</div>" : "") +
        "</div>";
    }
    var listSection;
    if (entries.length) {
      listSection =
        '<div class="vc-user-profile-bday-pop__list"><p class="vc-user-profile-bday-pop__list-title">Compleanni in ' +
        esc(monthLabel) +
        "</p>" +
        entries
          .map(function (entry) {
            var name = String(entry.displayName || entry.userId || "Utente").trim();
            var href = String(entry.profileUrl || "/user/?id=" + encodeURIComponent(entry.userId || ""));
            var meta = formatBirthdayEntryMeta(entry, year);
            var mine =
              highlightUserId && String(entry.userId || "") === String(highlightUserId)
                ? " is-profile-user"
                : "";
            return (
              '<a class="vc-user-profile-bday-pop__row' +
              mine +
              '" href="' +
              esc(href) +
              '"><span class="vc-user-profile-bday-pop__row-name">' +
              esc(name) +
              '</span><span class="vc-user-profile-bday-pop__row-meta">' +
              esc(meta) +
              "</span></a>"
            );
          })
          .join("") +
        "</div>";
    } else {
      listSection =
        '<p class="vc-user-profile-bday-pop__empty">Nessun compleanno registrato per questo mese.</p>';
    }
    return (
      '<div class="vc-user-profile-bday-pop" role="dialog" aria-modal="true" aria-label="Calendario compleanni ' +
      esc(monthLabel) +
      " " +
      esc(String(year)) +
      '" data-vc-bday-month="' +
      esc(String(month)) +
      '" data-vc-bday-year="' +
      esc(String(year)) +
      '">' +
      '<div class="vc-user-profile-bday-pop__panel">' +
      '<div class="vc-user-profile-bday-pop__head">' +
      '<div class="vc-user-profile-bday-pop__head-main">' +
      '<button type="button" class="vc-user-profile-bday-pop__nav" data-vc-bday-prev aria-label="Mese precedente"><i class="fa fa-chevron-left" aria-hidden="true"></i></button>' +
      '<div class="vc-user-profile-bday-pop__title"><i class="fa fa-birthday-cake" aria-hidden="true"></i><span>' +
      esc(monthLabel) +
      " " +
      esc(String(year)) +
      "</span></div>" +
      '<button type="button" class="vc-user-profile-bday-pop__nav" data-vc-bday-next aria-label="Mese successivo"><i class="fa fa-chevron-right" aria-hidden="true"></i></button>' +
      "</div>" +
      '<button type="button" class="vc-user-profile-bday-pop__close" data-vc-bday-close aria-label="Chiudi"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-user-profile-bday-pop__body">' +
      '<div class="vc-user-profile-bday-pop__grid" aria-label="Calendario mensile">' +
      head +
      cells +
      "</div>" +
      listSection +
      "</div></div></div>"
    );
  }

  function setBirthdayCalendarLoading(isLoading) {
    if (!birthdayCalendarPopEl) return;
    var panel = birthdayCalendarPopEl.querySelector(".vc-user-profile-bday-pop__panel");
    if (!panel) return;
    panel.classList.toggle("vc-user-profile-bday-pop__panel--loading-month", Boolean(isLoading));
    panel.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  function loadBirthdayCalendarMonth(month, year, profileUserId) {
    if (!birthdayCalendarPopEl) return;
    var url = buildBirthdaysCalendarUrl(month, year);
    if (!url) return;
    var token = ++birthdayCalendarFetchToken;
    birthdayCalendarPopEl.__vcBdayMonth = month;
    birthdayCalendarPopEl.__vcBdayYear = year;
    birthdayCalendarPopEl.__vcBdayProfileUserId = profileUserId;
    setBirthdayCalendarLoading(true);
    cachedJsonFetch(url, 60000)
      .then(function (out) {
        if (token !== birthdayCalendarFetchToken || !birthdayCalendarPopEl) return;
        var body = out && out.body ? out.body : {};
        if (!out || !out.httpOk || !body || body.ok !== true) {
          setBirthdayCalendarLoading(false);
          if (
            birthdayCalendarPopEl &&
            birthdayCalendarPopEl.querySelector(".vc-user-profile-bday-pop__panel--loading")
          ) {
            closeBirthdayCalendar();
          }
          return;
        }
        birthdayCalendarPopEl.innerHTML = renderBirthdayCalendarHtml(body, profileUserId);
        wireBirthdayCalendarPop(profileUserId);
        setBirthdayCalendarLoading(false);
      })
      .catch(function () {
        if (token !== birthdayCalendarFetchToken) return;
        setBirthdayCalendarLoading(false);
        if (
          birthdayCalendarPopEl &&
          birthdayCalendarPopEl.querySelector(".vc-user-profile-bday-pop__panel--loading")
        ) {
          closeBirthdayCalendar();
        }
      });
  }

  function wireBirthdayCalendarPop(profileUserId) {
    if (!birthdayCalendarPopEl) return;
    var closeBtn = birthdayCalendarPopEl.querySelector("[data-vc-bday-close]");
    if (closeBtn && !closeBtn.__vcBdayCloseWired) {
      closeBtn.__vcBdayCloseWired = true;
      closeBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        closeBirthdayCalendar();
      });
    }
    var prevBtn = birthdayCalendarPopEl.querySelector("[data-vc-bday-prev]");
    var nextBtn = birthdayCalendarPopEl.querySelector("[data-vc-bday-next]");
    if (prevBtn && !prevBtn.__vcBdayNavWired) {
      prevBtn.__vcBdayNavWired = true;
      prevBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var m = Number(birthdayCalendarPopEl.__vcBdayMonth) || 1;
        var y = Number(birthdayCalendarPopEl.__vcBdayYear) || new Date().getFullYear();
        var shifted = shiftCalendarMonth(m, y, -1);
        loadBirthdayCalendarMonth(shifted.month, shifted.year, profileUserId);
      });
    }
    if (nextBtn && !nextBtn.__vcBdayNavWired) {
      nextBtn.__vcBdayNavWired = true;
      nextBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var m = Number(birthdayCalendarPopEl.__vcBdayMonth) || 1;
        var y = Number(birthdayCalendarPopEl.__vcBdayYear) || new Date().getFullYear();
        var shifted = shiftCalendarMonth(m, y, 1);
        loadBirthdayCalendarMonth(shifted.month, shifted.year, profileUserId);
      });
    }
    if (!wireBirthdayCalendarPop._keydownWired) {
      wireBirthdayCalendarPop._keydownWired = true;
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") closeBirthdayCalendar();
      });
    }
  }

  function wireBirthdayCalendarHost() {
    if (!birthdayCalendarPopEl || birthdayCalendarPopEl.__vcBackdropWired) return;
    birthdayCalendarPopEl.__vcBackdropWired = true;
    birthdayCalendarPopEl.addEventListener("click", function (ev) {
      if (ev.target && ev.target.classList && ev.target.classList.contains("vc-user-profile-bday-pop")) {
        closeBirthdayCalendar();
      }
    });
  }

  function openBirthdayCalendar(anchor, profileUserId) {
    if (!anchor) return;
    closeBirthdayCalendar();
    var now = new Date();
    var month = now.getMonth() + 1;
    var year = now.getFullYear();
    anchor.setAttribute("aria-expanded", "true");
    birthdayCalendarPopEl = document.createElement("div");
    birthdayCalendarPopEl.className = "vc-user-profile-bday-pophost";
    birthdayCalendarPopEl.__vcBdayAnchor = anchor;
    birthdayCalendarPopEl.__vcBdayMonth = month;
    birthdayCalendarPopEl.__vcBdayYear = year;
    birthdayCalendarPopEl.__vcBdayProfileUserId = profileUserId;
    birthdayCalendarPopEl.innerHTML =
      '<div class="vc-user-profile-bday-pop" role="dialog" aria-busy="true" aria-label="Calendario compleanni"><div class="vc-user-profile-bday-pop__panel vc-user-profile-bday-pop__panel--loading"><span>Caricamento calendario…</span></div></div>';
    document.body.appendChild(birthdayCalendarPopEl);
    document.documentElement.classList.add("vc-user-profile-bday-open");
    try {
      document.body.classList.add("vc-user-profile-bday-open");
    } catch (eBodyLock) {}
    wireBirthdayCalendarHost();
    loadBirthdayCalendarMonth(month, year, profileUserId);
  }

  function wireBirthdayBadge(root, profileUserId) {
    if (!root) return;
    var btn = root.querySelector("[data-vc-bday-badge]");
    if (!btn || btn.__vcBdayWired) return;
    btn.__vcBdayWired = true;
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (birthdayCalendarPopEl) {
        closeBirthdayCalendar();
        btn.setAttribute("aria-expanded", "false");
        return;
      }
      openBirthdayCalendar(btn, profileUserId);
    });
  }

  var PROFILE_ROLE_IDS = {
    founder: "1442568886988963923",
    manager: "1521562607339704442",
    staffDelMese: "1544831233404575835",
    staffDelSettimana: "1550462300291604551",
    director: "1502322782602530977",
    highStaff: "1544831228690046976",
    staff: "1442568910070349985",
    partnerManager: "1544831242510270464",
    donator: "1544830864565735515",
    vip: "1544830866616754257",
    vipPlus: "1544830868575625276",
    serverBooster: "1329497467481493607",
    doubleBooster: "1544830850552823849",
    topWeeklyText: "1544830834849087630",
    topWeeklyVoc: "1544830836686200992",
    mvp: "1544830832227782699",
    memberOfTheMonth: "1544830838443741194",
  };

  function buildProfileBadges(rank, roles, birthday) {
    var out = [];
    var seen = {};
    var names = Array.isArray(roles)
      ? roles
          .map(function (role) {
            return String((role && role.name) || "").toLowerCase();
          })
          .join(" | ")
      : "";

    function add(kind, icon, label) {
      if (seen[kind]) return;
      seen[kind] = true;
      out.push(profileBadgeMarkup(kind, icon, label));
    }

    if (Number(rank || 0) > 0) {
      add(leaderboardBadgeClass(rank), "fa-trophy", leaderboardBadgeLabel(rank));
    }

    var roleNames = Array.isArray(roles)
      ? roles
          .map(function (role) {
            return normalizeRoleName(role && role.name);
          })
          .filter(Boolean)
      : [];

    var hasFounder =
      hasRoleId(roles, PROFILE_ROLE_IDS.founder) ||
      includesAnyRole(names, ["founder", "fondatore"]);
    var hasManager =
      hasRoleId(roles, PROFILE_ROLE_IDS.manager) ||
        hasNormalizedRole(roleNames, function (name) {
          return name === "manager";
      });
    var hasStaffDelMese =
      hasRoleId(roles, PROFILE_ROLE_IDS.staffDelMese) ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("staffer del mese") !== -1 || name.indexOf("staff del mese") !== -1;
      });
    var hasStaffDelSettimana =
      hasRoleId(roles, PROFILE_ROLE_IDS.staffDelSettimana) ||
      hasNormalizedRole(roleNames, function (name) {
        return (
          name.indexOf("staffer della settimana") !== -1 ||
          name.indexOf("staff della settimana") !== -1 ||
          name.indexOf("staffer della sett") !== -1
        );
      });
    var hasDirector =
      hasRoleId(roles, PROFILE_ROLE_IDS.director) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "director";
      });
    var hasHighStaff =
      hasRoleId(roles, PROFILE_ROLE_IDS.highStaff) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "high staff" || name.indexOf("high staff") !== -1;
      });
    var hasStaffRole =
      hasRoleId(roles, PROFILE_ROLE_IDS.staff) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "staff";
      });
    var hasPartnerManager =
      hasRoleId(roles, PROFILE_ROLE_IDS.partnerManager) ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("partner manager") !== -1;
      });
    var hasMemberOfTheMonth =
      hasRoleId(roles, PROFILE_ROLE_IDS.memberOfTheMonth) ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("member of the month") !== -1 || name.indexOf("membro del mese") !== -1;
      });
    var hasTopWeeklyText =
      hasRoleId(roles, PROFILE_ROLE_IDS.topWeeklyText) ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("top weekly text") !== -1;
      });
    var hasTopWeeklyVoc =
      hasRoleId(roles, PROFILE_ROLE_IDS.topWeeklyVoc) ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("top weekly voc") !== -1;
      });
    var hasMvp =
      hasRoleId(roles, PROFILE_ROLE_IDS.mvp) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "mvp";
      });
    var hasVipPlus =
      hasRoleId(roles, PROFILE_ROLE_IDS.vipPlus) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "vip+" || name === "vip plus";
      });
    var hasVip =
      !hasVipPlus &&
      (hasRoleId(roles, PROFILE_ROLE_IDS.vip) ||
        hasNormalizedRole(roleNames, function (name) {
          return name === "vip";
        }));
    var hasDoubleBooster =
      hasRoleId(roles, PROFILE_ROLE_IDS.doubleBooster) ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("double booster") !== -1;
      });
    var hasServerBooster =
      hasRoleId(roles, PROFILE_ROLE_IDS.serverBooster) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "server booster" || name.indexOf("server booster") !== -1;
      });
    var hasDonator =
      hasRoleId(roles, PROFILE_ROLE_IDS.donator) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "donator" || name === "donatore";
      });

    if (hasFounder) add("founder", "fa-star-o", "Founder");
    if (hasManager) add("manager", "fa-briefcase", "Manager");
    if (hasStaffDelMese) add("sdm", "fa-trophy", "Staff del Mese");
    if (hasStaffDelSettimana) add("sdw", "fa-star", "Staffer della Settimana");
    if (hasDirector) add("director", "fa-shield", "Director");
    if (hasHighStaff) add("highstaff", "fa-shield", "High Staff");
    if (
      hasStaffRole ||
      (!hasDirector &&
      !hasHighStaff &&
        includesAnyRole(names, ["admin", "mod", "moderator", "helper", "community manager"]))
    ) {
      add("staff", "fa-shield", "Staff");
    }
    if (hasPartnerManager) add("pm", "fa-handshake-o", "Partner Manager");
    if (hasMemberOfTheMonth) add("motm", "fa-calendar", "Member of The Month");
    if (hasTopWeeklyText) add("topweeklytext", "fa-comments-o", "Top Weekly Text");
    if (hasTopWeeklyVoc) add("topweeklyvoc", "fa-microphone", "Top Weekly Voc");
    if (hasMvp) add("mvp", "fa-star", "MVP");
    if (hasVipPlus) add("vipplus", "fa-diamond", "VIP+");
    if (hasVip) add("vip", "fa-diamond", "VIP");
    if (hasDoubleBooster) add("doublebooster", "fa-rocket", "Double Booster");
    if (hasServerBooster) add("booster", "fa-rocket", "Booster");
    if (hasDonator) add("donator", "fa-heart", "Donator");
    if (birthday && birthday.isToday) add("birthday", "fa-birthday-cake", "Compleanno");

    return out.length ? '<div class="vc-user-profile-badges">' + out.join("") + "</div>" : "";
  }

  function formatMultiplierX(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) n = 1;
    return "×" + n.toFixed(1);
  }

  /* multiUi1: × in basso stile moltiplicatore (mark + numero) */
  function formatMultiplierXHtml(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) n = 1;
    var t = n.toFixed(1);
    return (
      '<span class="vc-multi-x" title="×' +
      esc(t) +
      '"><span class="vc-multi-x__mark" aria-hidden="true">×</span><span class="vc-multi-x__num">' +
      esc(t) +
      "</span></span>"
    );
  }

  function cleanMultiplierLabel(label, type) {
    var s = String(label == null ? "" : label).trim();
    if (String(type || "") === "role") {
      s = s.replace(/^[\s\u00a0]*(?:༄|✦|✧|★|☆|◆|◇|•|·|❖|✵)+[\s\u00a0]*/g, "").trim();
    }
    return s || "Fonte";
  }

  function buildMultiplierSourcesHtml(sources, totalMultiplier) {
    var raw = Array.isArray(sources) ? sources.slice() : [];
    var list = [];
    var baseMult = 1;
    for (var i = 0; i < raw.length; i += 1) {
      var row = raw[i] || {};
      var type = String(row.type || "").toLowerCase();
      if (type === "global" || type === "server" || type === "event") {
        var g = Number(row.multiplier);
        if (Number.isFinite(g) && g > baseMult) baseMult = g;
        continue;
      }
      if (type === "base") {
        var b = Number(row.multiplier);
        if (Number.isFinite(b) && b > 0) baseMult = Math.max(baseMult, b);
        continue;
      }
      list.push(row);
    }
    list.unshift({
      key: "base",
      label: "Base",
      type: "base",
      multiplier: baseMult > 0 ? baseMult : 1,
      active: true,
    });
    var boltIcon =
      '<span class="vc-user-profile-multiplier__icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="15" height="15" focusable="false">' +
      '<path fill="currentColor" d="M13.05 2.2 5.1 13.55c-.32.45 0 1.1.55 1.1h5.2l-1.05 7.05c-.12.78.88 1.18 1.35.52l7.95-11.35c.32-.45 0-1.1-.55-1.1h-5.05l1-6.95c.12-.78-.88-1.18-1.45-.57Z"/>' +
      "</svg></span>";
    var rows = list
      .map(function (src) {
        var type = String((src && src.type) || "");
        var label = cleanMultiplierLabel((src && src.label) || "Fonte", type);
        var mult = Number(src && src.multiplier);
        if (!Number.isFinite(mult) || mult <= 0) mult = 1;
        var color = String((src && src.color) || "").trim();
        var isRole = type === "role";
        var isActive = Boolean(src && (src.active || src.applied));
        var accent = color || (isRole ? "#e8c49c" : "#c4b09a");
        var labelHtml = isRole
          ? '<span class="vc-user-profile-multisource__role" title="' +
            esc(label) +
            '"><span class="vc-user-profile-multisource__role-dot" aria-hidden="true"></span><span class="vc-user-profile-multisource__role-name">' +
            esc(label) +
            "</span></span>"
          : '<span class="vc-user-profile-multisource__base"><span class="vc-user-profile-multisource__dot" aria-hidden="true"></span><span class="vc-user-profile-multisource__base-name">' +
            esc(label) +
            "</span></span>";
        return (
          '<div class="vc-user-profile-multisource' +
          (isActive && isRole ? " is-active" : "") +
          (isRole ? " is-role" : "") +
          (type === "base" ? " is-base" : "") +
          (!isActive && isRole ? " is-idle" : "") +
          '" style="--vc-multi-accent:' +
          esc(accent) +
          '">' +
          '<span class="vc-user-profile-multisource__label">' +
          labelHtml +
          "</span>" +
          '<span class="vc-user-profile-multisource__value">' +
          formatMultiplierXHtml(mult) +
          "</span></div>"
        );
      })
      .join("");
    return (
      '<details class="vc-user-profile-multiplier">' +
      '<summary class="vc-user-profile-multiplier__summary">' +
      '<span class="vc-user-profile-multiplier__left">' +
      boltIcon +
      " Moltiplicatore EXP</span>" +
      '<span class="vc-user-profile-multiplier__right"><strong class="vc-user-profile-multiplier__total">' +
      formatMultiplierXHtml(totalMultiplier) +
      '</strong><i class="fa fa-angle-down vc-user-profile-multiplier__chev" aria-hidden="true"></i></span>' +
      "</summary>" +
      '<div class="vc-user-profile-multiplier__body">' +
      rows +
      "</div></details>"
    );
  }

  function renderProfile(root, userId, payload, opts) {
    opts = opts || {};
    clearProfileLoading();
    root.hidden = false;
    var wantsStaffTab = false;
    try {
      wantsStaffTab = parseWantsStaffTab();
    } catch (eTab) {
      wantsStaffTab = false;
    }
        // staffTabOrganico1: communityOnly = paint shell sotto lock staff; NON azzerare intent Staff
        // (prima: `if (communityOnly) wantsStaffTab = false` → refresh tornava a Community).
            var savedStaffPane = null;
    try {
      var existingPane = root.querySelector("[data-vc-profile-staff-pane]");
      // profileSwitchFix1 / staffPeerFix2 / staffTabOrganico1: preserve staff pane on staff tab + peer switch
      // even when data-vc-staff-user is empty/stale (community re-paint must not drop it).
      if (existingPane && (wantsStaffTab || opts.communityOnly || opts.preserveStaffPane)) {
        savedStaffPane = existingPane.parentNode.removeChild(existingPane);
      }
    } catch (eSave) {
      savedStaffPane = null;
    }
        if (!wantsStaffTab) {
      try {
        if (document.body) {
          document.body.classList.remove("vc-user-profile-staff-tab", "vc-staff-profile-home");
        }
        document.documentElement.classList.remove("vc-user-profile-staff-tab-pending");
      } catch (eTabClear) {}
    }
    var level = payload.level || {};
    var weekly = payload.weekly || {};
    var messages = payload.messages || {};
    var voice = payload.voice || {};
    var profile = payload.profile || {};
    var profileNick = resolveProfileDisplayName(profile, level);
    var profileHandle = String(profile.username || level.username || "").trim();
    var knownOutOfGuild = payload.inGuild === false || profile.inGuild === false;
    var avatar = profileAvatarSrc(
      String(profile.avatarUrl || level.avatarUrl || "").trim(),
      String(profile.avatar || level.avatar || "").trim(),
      userId,
      256,
    );
    /* levelBarWidthFix1: formatPct già include "%"; non concatenare un altro % (width:76%% → fill a 0) */
    var progressPct = Math.max(0, Math.min(100, Math.round(Number(level.progressPercent) || 0)));
    var rankText = level.rank ? "#" + formatIntIt(level.rank) : "-";
    var weeklyRankText = weekly.rank ? "#" + formatIntIt(weekly.rank) : "-";
    var currentLevelExp = Number(level.currentLevelExp || 0);
    var nextLevelExp = Number(level.nextLevelExp || 0);
    var currentXp = Math.max(0, Number(level.exp || 0) - currentLevelExp);
    var targetXp = Math.max(1, nextLevelExp - currentLevelExp);
    var viewerOwns = Boolean(currentViewer && String(currentViewer.id || "") === String(userId));
    var roles = Array.isArray(profile.roles) ? profile.roles : [];
    var customProfile = profile.customProfile || null;
    var customRole = customProfile && customProfile.role ? customProfile.role : null;
    var customSecondaryRole = customProfile && customProfile.secondaryRole ? customProfile.secondaryRole : null;
    var customVoice = customProfile && customProfile.voice ? customProfile.voice : null;
        var avatarRingStyle = ' style="--vc-rank-ring:#e8c49c"';
    var multiplier = Number(
      (weekly && weekly.expMultiplier != null && weekly.expMultiplier !== "" ? weekly.expMultiplier : null) ||
        profile.expMultiplierResolved ||
        1,
    );
    if (!Number.isFinite(multiplier) || multiplier <= 0) multiplier = 1;
    var multiplierSources = Array.isArray(profile.weeklyMultiplierSources)
      ? profile.weeklyMultiplierSources
      : [];
    var multiplierHtml = buildMultiplierSourcesHtml(multiplierSources, multiplier);
    var badgesHtml = buildProfileBadges(level.rank, roles, profile.birthday || null);
    var birthdayBadgeHtml = buildBirthdayBadgeHtml(profile.birthday || null);
    var customRoleCount = (customRole ? 1 : 0) + (customSecondaryRole ? 1 : 0);
    var customRoleIconHtml = customRole
      ? discordRoleIconImgHtml(customRole.iconUrl, customRole.iconAnimated, "vc-user-profile-customicon__img", 40) ||
        (customRole.emoji
          ? '<span class="vc-user-profile-customicon__emoji">' + esc(customRole.emoji) + "</span>"
          : '<i class="fa fa-star" aria-hidden="true"></i>')
      : "";
    var customVoiceName = customVoice ? String(customVoice.name || "Canale vocale privato").trim() : "";

    function sharedMembersMarkup(members, count, label) {
      var list = Array.isArray(members) ? members : [];
      var total = Math.max(0, Number(count || list.length || 0));
      var head =
        '<details class="vc-user-profile-shared vc-user-profile-shared--foot">' +
        '<summary class="vc-user-profile-shared__summary">' +
        '<span class="vc-user-profile-shared__label"><i class="fa fa-users" aria-hidden="true"></i> ' +
        esc(label || "Condiviso con") +
        "</span>" +
        '<span class="vc-user-profile-shared__count">' +
        esc(formatIntIt(total)) +
        "</span>" +
        '<i class="fa fa-angle-down vc-user-profile-shared__chev" aria-hidden="true"></i>' +
        "</summary>";
      if (!list.length) {
        return head + '<div class="vc-user-profile-shared__empty">Nessun utente mostrabile.</div></details>';
      }
      return (
        head +
        '<div class="vc-user-profile-shared__list">' +
        list
          .map(function (member) {
            var name = String(member.displayName || member.username || "Utente").trim() || "Utente";
            var username = String(member.username || "").trim();
            var href = profilePublicUrl(member.id);
            var uid = String(member.id || "").trim();
            var avatarUrl = menuListAvatarSrc(String(member.avatarUrl || "").trim(), uid, 64);
            var sharedHash = "";
            try {
              if (avatarUrl && !/\/guilds\//i.test(avatarUrl)) {
                var hmSh = avatarUrl.match(/\/avatars\/\d+\/((?:a_)?[a-f0-9]+)/i);
                if (hmSh) sharedHash = String(hmSh[1] || "").trim();
              }
            } catch (eSh) {}
            return (
              '<a class="vc-user-profile-shared__user" href="' +
              esc(href) +
              '">' +
              (avatarUrl
                ? '<img class="vc-user-profile-shared__avatar" src="' +
                  esc(avatarUrl) +
                  '" alt="" width="40" height="40" loading="eager" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1" data-vc-avatar-static="1" data-user-id="' +
                  esc(uid) +
                  '"' +
                  (sharedHash ? ' data-avatar-hash="' + esc(sharedHash) + '"' : "") +
                  " />"
                : '<span class="vc-user-profile-shared__avatar vc-user-profile-shared__avatar--fallback"><i class="fa fa-user" aria-hidden="true"></i></span>') +
              '<span class="vc-user-profile-shared__name">' +
              esc(name) +
              "</span>" +
              (username && username !== name ? '<span class="vc-user-profile-shared__tag">@' + esc(username) + "</span>" : "") +
              "</a>"
            );
          })
          .join("") +
        "</div>" +
        (total > list.length
          ? '<p class="vc-user-profile-shared__more">+' + esc(formatIntIt(total - list.length)) + " altri utenti</p>"
          : "") +
        "</details>"
      );
    }

    function voiceStatsHtml(voice) {
      if (!voice) return "";
      var vid = String(voice.id || "").trim();
      var count = Math.max(0, Number(voice.memberCount || 0));
      var created = voice.createdAt ? formatDateIt(voice.createdAt) : "—";
      var name = String(voice.name || customVoiceName || "Canale vocale privato").trim() || "Canale vocale privato";
      var voiceTitleHtml = formatCustomVoiceTitleHtml(voice, name);
      var cardOpen = viewerOwns
        ? '<a class="vc-user-profile-customcard vc-user-profile-customcard--link" href="' +
          esc(customProfileEditorUrl("voice")) +
          '" title="Vocale privata">'
        : '<article class="vc-user-profile-customcard">';
      var cardClose = viewerOwns ? "</a>" : "</article>";
      return (
        '<div class="vc-user-profile-customstack">' +
        cardOpen +
        '<div class="vc-user-profile-customcard__main">' +
        '<span class="vc-user-profile-customcard__dot vc-user-profile-customcard__dot--voice">' +
        '<i class="fa fa-microphone" aria-hidden="true"></i>' +
        "</span>" +
        '<div class="vc-user-profile-customcard__copy">' +
        '<strong class="vc-user-profile-customcard__title">' +
        voiceTitleHtml +
        "</strong>" +
        '<span class="vc-user-profile-customcard__meta vc-user-profile-customcard__meta--id">ID ' +
        esc(vid || "—") +
        "</span>" +
        "</div>" +
        "</div>" +
        '<span class="vc-user-profile-customcard__date"><i class="fa fa-calendar-o" aria-hidden="true"></i>Creato<br><strong>' +
        esc(created) +
        "</strong></span>" +
        cardClose +
        sharedMembersMarkup(voice.sharedMembers, count, "Utenti con accesso") +
        "</div>"
      );
    }

    var rolesHtml = roles.length
      ? roles.map(formatDiscordRoleChipHtml).join("")
      : '<span class="vc-user-profile-role vc-user-profile-role--muted">Nessun ruolo mostrabile</span>';

    var customRolesSubParts = [];
    if (customRole && customSecondaryRole) customRolesSubParts.push("Ruolo principale + secondario");
    else if (customRole) customRolesSubParts.push("Ruolo principale");
    else if (customSecondaryRole) customRolesSubParts.push("Ruolo secondario");
    else if (viewerOwns) customRolesSubParts.push("Crea i tuoi custom");
    if (customVoice) customRolesSubParts.push("vocale privata");
    else if (viewerOwns && (customRole || customSecondaryRole)) customRolesSubParts.push("vocale");
    var customRolesSub = customRolesSubParts.length ? customRolesSubParts.join(" · ") : "Nessun custom";

    var halloweenCandy = profile.halloweenCandy && typeof profile.halloweenCandy === "object" ? profile.halloweenCandy : null;
    var halloweenCandyHtml = "";
    var HALLOWEEN_CANDY_NAMES = [
      "Zucchero d'osso",
      "Morso di zucca",
      "Caramella fantasma",
      "Goccia di pozione",
      "Teschio acidulo",
      "Ragno candito",
      "Occhio di gelatina",
      "Pipistrello zuccherino",
      "Strega acidula",
      "Scheletro croccante",
      "Luna di miele nera",
      "Vampiro al lampone",
      "Zanna di liquirizia",
      "Calderone speziato",
      "Ragnatela soffice",
      "Gatto nero fondente",
      "Lanterna di zucchero",
      "Presagio al cacao",
      "Nebbia alla menta",
      "Corvo croccante",
      "Tomba al caramello",
      "Stella stregata",
      "Bara candita",
      "Miele stregato",
      "Uva del grimorio",
      "Menta di mezzanotte",
      "Ululato al miele",
      "Burro d'osso",
      "Ciliegia della cripta",
      "Cialda del will-o'-wisp",
      "Gomma del ghoul",
      "Vortice magico",
      "Miele infestato",
      "Marshmallow mummia",
      "Lollipop pozione",
      "Zucchero d'ombra",
      "Bacca della banshee",
      "Uva della tomba",
      "Perla di zucca",
    ];
    var profileHasHighStaff =
      hasRoleId(roles, PROFILE_ROLE_IDS.highStaff) ||
      hasRoleId(roles, PROFILE_ROLE_IDS.founder) ||
      hasRoleId(roles, PROFILE_ROLE_IDS.manager) ||
      hasRoleId(roles, PROFILE_ROLE_IDS.director) ||
      hasNormalizedRole(
        Array.isArray(roles)
          ? roles
              .map(function (role) {
                return normalizeRoleName(role && role.name);
              })
              .filter(Boolean)
          : [],
        function (name) {
          return (
            name === "high staff" ||
            name.indexOf("high staff") !== -1 ||
            name === "founder" ||
            name === "fondatore" ||
            name === "manager" ||
            name === "admin" ||
            name === "director"
          );
        },
      );
    /* Preview griglia per High Staff anche prima dell'evento / senza caramelle */
    if (
      (!halloweenCandy || !halloweenCandy.visible || !Array.isArray(halloweenCandy.items) || !halloweenCandy.items.length) &&
      profileHasHighStaff
    ) {
      var previewItems = [];
      var baseCandy = "https://www.viniliecaffe.it/images/caramelle_del_porco_dio/";
      var candyAssetV = "20261012silBright2";
      for (var ci = 1; ci <= HALLOWEEN_CANDY_NAMES.length; ci += 1) {
        previewItems.push({
          id: String(ci),
          name: HALLOWEEN_CANDY_NAMES[ci - 1],
          imageUrl: baseCandy + ci + ".png",
          thumbUrl: baseCandy + "thumbs/" + ci + ".webp?v=" + candyAssetV,
          silhouetteUrl: baseCandy + "sil2/" + ci + ".webp?v=" + candyAssetV,
          owned: false,
        });
      }
      halloweenCandy = {
        visible: true,
        preview: true,
        ownedCount: 0,
        total: HALLOWEEN_CANDY_NAMES.length,
        items: previewItems,
      };
    }
    if (halloweenCandy && halloweenCandy.visible && Array.isArray(halloweenCandy.items) && halloweenCandy.items.length) {
      var candyOwned = Number(halloweenCandy.ownedCount || 0) || 0;
      var candyTotal = Number(halloweenCandy.total || halloweenCandy.items.length) || halloweenCandy.items.length;
      var candyAssetV = "20261012silBright2";
      if (!window.__vcCandyBlurNameCache) window.__vcCandyBlurNameCache = {};
      /* candyNameBlurIos1: Safari/iOS ignora ctx.filter=blur → testo nitido sul telefono.
         Fallback: blur a campionamento (draw multiplo) + mai testo chiaro nel DOM. */
      function candyCanvasFilterBlurOk(ctx) {
        try {
          if (!ctx || typeof ctx.filter !== "string") return false;
          var prev = ctx.filter;
          ctx.filter = "blur(2px)";
          var ok = String(ctx.filter || "").indexOf("blur") !== -1;
          ctx.filter = prev || "none";
          return ok;
        } catch (eFilt) {
          return false;
        }
      }
      function candySoftBlurDraw(ctx, src, radiusPx) {
        var r = Math.max(2, Math.min(8, Math.round(Number(radiusPx) || 5)));
        if (candyCanvasFilterBlurOk(ctx)) {
          ctx.filter = "blur(" + r + "px)";
          ctx.drawImage(src, 0, 0);
          ctx.filter = "none";
          return;
        }
        ctx.clearRect(0, 0, src.width, src.height);
        var step = Math.max(1, Math.floor(r / 2));
        var hits = 0;
        for (var y = -r; y <= r; y += step) {
          for (var x = -r; x <= r; x += step) {
            if (x * x + y * y > r * r) continue;
            hits += 1;
          }
        }
        if (hits < 1) hits = 1;
        ctx.globalAlpha = Math.min(0.22, 1.15 / hits);
        for (var yy = -r; yy <= r; yy += step) {
          for (var xx = -r; xx <= r; xx += step) {
            if (xx * xx + yy * yy > r * r) continue;
            ctx.drawImage(src, xx, yy);
          }
        }
        ctx.globalAlpha = 0.42;
        ctx.drawImage(src, 0, 0);
        ctx.globalAlpha = 1;
      }
      function candyBlurredNameDataUrl(name) {
        var key = String(name || "");
        if (window.__vcCandyBlurNameCache[key]) return window.__vcCandyBlurNameCache[key];
        try {
          var W = 180;
          var H = 56;
          var dpr = 2;
          var off = document.createElement("canvas");
          off.width = W * dpr;
          off.height = H * dpr;
          var octx = off.getContext("2d");
          if (!octx) return "";
          octx.scale(dpr, dpr);
          octx.clearRect(0, 0, W, H);
          octx.font = '700 16px "Segoe UI", system-ui, sans-serif';
          octx.fillStyle = "rgba(255,248,235,0.98)";
          octx.textAlign = "center";
          octx.textBaseline = "top";
          var words = key.split(/\s+/).filter(Boolean);
          var lines = [];
          var line = "";
          for (var wi = 0; wi < words.length; wi += 1) {
            var test = line ? line + " " + words[wi] : words[wi];
            if (octx.measureText(test).width > W - 12 && line) {
              lines.push(line);
              line = words[wi];
            } else {
              line = test;
            }
          }
          if (line) lines.push(line);
          if (!lines.length) lines = [key];
          if (lines.length > 3) {
            lines = lines.slice(0, 3);
            lines[2] = lines[2].replace(/.{0,2}$/, "…");
          }
          var lh = 18;
          var startY = Math.max(2, (H - lines.length * lh) / 2);
          for (var li = 0; li < lines.length; li += 1) {
            octx.fillText(lines[li], W / 2, startY + li * lh);
          }
          var out = document.createElement("canvas");
          out.width = off.width;
          out.height = off.height;
          var ctx = out.getContext("2d");
          if (!ctx) return "";
          candySoftBlurDraw(ctx, off, 5 * dpr);
          var url = out.toDataURL("image/png");
          window.__vcCandyBlurNameCache[key] = url;
          return url;
        } catch (eCandyBlur) {
          return "";
        }
      }
      var candyCells = halloweenCandy.items
        .map(function (item) {
          var owned = Boolean(item && item.owned);
          var idNum = Math.floor(Number(item && item.id)) || 0;
          var name = String((item && item.name) || "").trim();
          if (!name || /^caramella\s+\d+$/i.test(name)) {
            name = (idNum >= 1 && idNum <= HALLOWEEN_CANDY_NAMES.length && HALLOWEEN_CANDY_NAMES[idNum - 1]) || name || "Caramella";
          }
          var thumb = String((item && item.thumbUrl) || "").trim();
          var sil = String((item && item.silhouetteUrl) || "").trim();
          var full = String((item && item.imageUrl) || "").trim();
          if (!sil || /\/sil\/\d+\.webp/i.test(sil) || sil.indexOf("/sil/") !== -1) {
            sil =
              idNum >= 1
                ? "https://www.viniliecaffe.it/images/caramelle_del_porco_dio/sil2/" + idNum + ".webp?v=" + candyAssetV
                : sil;
          } else if (sil.indexOf("sil2/") !== -1 && sil.indexOf("v=") === -1) {
            sil += (sil.indexOf("?") >= 0 ? "&" : "?") + "v=" + candyAssetV;
          }
          if (!thumb && idNum >= 1) {
            thumb =
              "https://www.viniliecaffe.it/images/caramelle_del_porco_dio/thumbs/" + idNum + ".webp?v=" + candyAssetV;
          }
          var img = owned ? thumb || full : sil;
          var label = owned ? name : "Non sbloccata";
          var nameHtml;
          if (owned) {
            nameHtml = '<span class="vc-user-profile-candy__name">' + esc(name) + "</span>";
          } else {
            var blurUrl = candyBlurredNameDataUrl(name);
            /* candyNameBlurIos1: mai testo chiaro in fallback (CSS blur fallisce su iOS) */
            nameHtml = blurUrl
              ? '<span class="vc-user-profile-candy__name vc-user-profile-candy__name--locked" aria-hidden="true">' +
                '<img class="vc-user-profile-candy__nameimg" src="' +
                blurUrl +
                '" alt="" width="180" height="56" draggable="false" />' +
                "</span>"
              : '<span class="vc-user-profile-candy__name vc-user-profile-candy__name--locked vc-user-profile-candy__name--locked-ph" aria-hidden="true">••••••••</span>';
          }
          return (
            '<li class="vc-user-profile-candy' +
            (owned ? " vc-user-profile-candy--owned" : " vc-user-profile-candy--missing") +
            '" title="' +
            esc(label) +
            '">' +
            '<span class="vc-user-profile-candy__frame">' +
            (img
              ? '<img class="vc-user-profile-candy__img" src="' +
                esc(img) +
                '" alt="' +
                esc(owned ? name : "Caramella bloccata") +
                '" width="96" height="96" loading="lazy" decoding="async" />'
              : '<span class="vc-user-profile-candy__ph" aria-hidden="true"></span>') +
            "</span>" +
            nameHtml +
            "</li>"
          );
        })
        .join("");
      var candyPct = candyTotal > 0 ? Math.max(0, Math.min(100, Math.round((candyOwned / candyTotal) * 100))) : 0;
      var candySub =
        candyOwned >= candyTotal && candyTotal > 0
          ? "Collezione completa"
          : candyOwned === 1
            ? "1 caramella sbloccata"
            : esc(String(candyOwned)) + " caramelle sbloccate";
      if (halloweenCandy.preview && candyOwned < 1) candySub = "Anteprima High Staff";
      else if (halloweenCandy.preview) candySub += " · anteprima High Staff";
      halloweenCandyHtml =
        '<section class="vc-user-profile-block vc-user-profile-block--candy">' +
        '<div class="vc-user-profile-candypanel">' +
        '<div class="vc-user-profile-candypanel__head">' +
        '<span class="vc-user-profile-candypanel__icon" aria-hidden="true">' +
        '<img src="https://cdn.discordapp.com/emojis/1558964785113206824.webp?size=64&amp;quality=lossless" alt="" width="28" height="28" decoding="async" />' +
        "</span>" +
        '<span class="vc-user-profile-candypanel__copy">' +
        '<span class="vc-user-profile-candypanel__title">Caramelle Halloween</span>' +
        '<span class="vc-user-profile-candypanel__sub">' +
        candySub +
        "</span>" +
        "</span>" +
        '<span class="vc-user-profile-candypanel__badge">' +
        esc(String(candyOwned)) +
        "/" +
        esc(String(candyTotal)) +
        "</span>" +
        "</div>" +
        '<div class="vc-user-profile-candypanel__meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
        esc(String(candyPct)) +
        '" aria-label="Progresso collezione caramelle">' +
        '<span class="vc-user-profile-candypanel__meterfill" style="width:' +
        esc(String(candyPct)) +
        '%"></span>' +
        "</div>" +
        '<ul class="vc-user-profile-candygrid" aria-label="Collezione caramelle Halloween">' +
        candyCells +
        "</ul>" +
        "</div>" +
        "</section>";
    }

    var customBadgeCount = customRoleCount + (customVoice ? 1 : 0);
    var customEconomyHtml =
      customRole || customSecondaryRole || customVoice || viewerOwns
        ? '<section class="vc-user-profile-block vc-user-profile-block--custom">' +
          '<div class="vc-user-profile-sectioneyebrow"><i class="fa fa-diamond" aria-hidden="true"></i> Ruoli & Vocale Custom</div>' +
          // profileSharePanelBack1: riquadro + badge come prima; stack interni restano una card.
          '<div class="vc-user-profile-custompanel">' +
          '<div class="vc-user-profile-custompanel__head">' +
          '<span class="vc-user-profile-custompanel__icon"><i class="fa fa-star" aria-hidden="true"></i></span>' +
          '<span class="vc-user-profile-custompanel__copy">' +
          '<span class="vc-user-profile-custompanel__title">Personalizzazioni</span>' +
          '<span class="vc-user-profile-custompanel__sub">' +
          esc(customRolesSub) +
          "</span>" +
          "</span>" +
          '<span class="vc-user-profile-custompanel__badge">' +
          esc(formatIntIt(customBadgeCount)) +
          "</span>" +
          "</div>" +
          '<div class="vc-user-profile-custompanel__body">' +
          (customRole
            ? '<div class="vc-user-profile-customstack">' +
              (viewerOwns
                ? '<a class="vc-user-profile-customcard vc-user-profile-customcard--link" href="' +
                  esc(customProfileEditorUrl("primary")) +
                  '" title="Ruolo principale">'
                : '<article class="vc-user-profile-customcard">') +
              '<div class="vc-user-profile-customcard__main">' +
              '<span class="vc-user-profile-customcard__dot vc-user-profile-customcard__dot--role"' +
              (customRole.color ? ' style="--vc-custom-dot:' + esc(customRole.color) + '"' : "") +
              ">" +
              customRoleIconHtml +
              "</span>" +
              '<div class="vc-user-profile-customcard__copy">' +
              '<strong class="vc-user-profile-customcard__title">' +
              /* icona già nel dot: nome pulito come Discord (no emoji duplicata) */
              esc(customRole.name || "Ruolo personalizzato") +
              "</strong>" +
              '<span class="vc-user-profile-customcard__meta">Ruolo Principale</span>' +
              "</div>" +
              "</div>" +
              '<span class="vc-user-profile-customcard__date"><i class="fa fa-calendar-o" aria-hidden="true"></i>Creato<br><strong>' +
              esc(formatDateIt(customRole.createdAt)) +
              "</strong></span>" +
              (viewerOwns ? "</a>" : "</article>") +
              sharedMembersMarkup(customRole.sharedMembers, customRole.memberCount, "Primario condiviso con") +
              "</div>"
            : viewerOwns
              ? createCustomCardHtml("primary", "Ruolo principale", "Crea direttamente dal profilo")
              : "") +
          (customSecondaryRole
            ? '<div class="vc-user-profile-customstack">' +
              (viewerOwns
                ? '<a class="vc-user-profile-customcard vc-user-profile-customcard--secondary vc-user-profile-customcard--link" href="' +
                  esc(customProfileEditorUrl("secondary")) +
                  '" title="Ruolo secondario">'
                : '<article class="vc-user-profile-customcard vc-user-profile-customcard--secondary">') +
              '<div class="vc-user-profile-customcard__main">' +
              '<span class="vc-user-profile-customcard__dot vc-user-profile-customcard__dot--voice">' +
              (discordRoleIconImgHtml(
                customSecondaryRole.iconUrl,
                customSecondaryRole.iconAnimated,
                "vc-user-profile-customicon__img",
                40,
              ) ||
                (customSecondaryRole.emoji
                  ? '<span class="vc-user-profile-customicon__emoji">' + esc(customSecondaryRole.emoji) + "</span>"
                  : '<i class="fa fa-star" aria-hidden="true"></i>')) +
              "</span>" +
              '<div class="vc-user-profile-customcard__copy">' +
              '<strong class="vc-user-profile-customcard__title">' +
              esc(customSecondaryRole.name || "Ruolo personalizzato secondario") +
              "</strong>" +
              '<span class="vc-user-profile-customcard__meta">Ruolo Secondario</span>' +
              "</div>" +
              "</div>" +
              '<span class="vc-user-profile-customcard__date"><i class="fa fa-calendar-o" aria-hidden="true"></i>Creato<br><strong>' +
              esc(formatDateIt(customSecondaryRole.createdAt)) +
              "</strong></span>" +
              (viewerOwns ? "</a>" : "</article>") +
              sharedMembersMarkup(
                customSecondaryRole.sharedMembers,
                customSecondaryRole.memberCount,
                "Secondario condiviso con",
              ) +
              "</div>"
            : viewerOwns && customRole
              ? createCustomCardHtml("secondary", "Ruolo secondario", "Serve VIP+ / Double Booster / Lv 120")
              : "") +
          (customVoice
            ? voiceStatsHtml(customVoice)
            : viewerOwns
              ? createCustomCardHtml("voice", "Vocale privata", "Gestisci nome, emoji e accesso")
              : "") +
          "</div>" +
          "</div>" +
          "</section>"
        : "";

    if (window.VcPageTitle) window.VcPageTitle.set("Profilo");
    else setProfilePageTitle("Profilo");
    root.innerHTML =
      '<section class="vc-user-profile-shell" data-vc-community-user="' +
      esc(userId) +
      '">' +
      '<section class="vc-user-profile-hero">' +
      '<div class="vc-user-profile-hero__head">' +
      '<div class="vc-user-profile-avatarwrap"' +
      avatarRingStyle +
      ">" +
      '<span class="vc-user-profile-avatarclip">' +
      (avatar
        ? '<img class="vc-user-profile-avatar" src="' +
          esc(avatar) +
          '" alt="" width="256" height="256" loading="eager" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1" data-user-id="' +
          esc(userId) +
          '"' +
          (String(profile.avatar || level.avatar || "").trim()
            ? ' data-avatar-hash="' + esc(String(profile.avatar || level.avatar || "").trim()) + '"'
            : "") +
          ( /\/guilds\/\d+\/users\//i.test(String(avatar)) ? ' data-vc-guild-avatar="1"' : "") +
          " />"
        : '<span class="vc-user-profile-avatar vc-user-profile-avatar--fallback"><i class="fa fa-user"></i></span>') +
      "</span>" +
      "</div>" +
      '<div class="vc-user-profile-hero__copy">' +
      '<h1 class="vc-user-profile-name">' +
      '<span class="vc-user-profile-name__text">' +
      esc(profileNick) +
      "</span>" +
      birthdayBadgeHtml +
      "</h1>" +
      (profileHandle
        ? '<p class="vc-user-profile-handle">@' + esc(profileHandle) + "</p>"
        : "") +
      '<p class="vc-user-profile-id">ID: ' +
      esc(userId) +
      "</p>" +
      (knownOutOfGuild
        ? '<p class="vc-user-profile-outguild mt-1 text-sm text-slate-300/80">Non è nel server Discord</p>'
        : "") +
      "</div>" +
      (viewerOwns
        ? '<a class="vc-user-profile-customize vc-user-profile-customize--pill" href="' +
          esc(profilePersonalizzaHubUrl(userId)) +
          '" title="Personalizza profilo"><i class="fa fa-paint-brush" aria-hidden="true"></i><span>Personalizza</span></a>'
        : "") +
      "</div>" +
      '<div class="vc-user-profile-levelbar" aria-label="Progresso livello">' +
      '<div class="vc-user-profile-levelbar__meta">' +
      "<span>Livello " +
      esc(String(level.level != null ? level.level : 0)) +
      "</span>" +
      "<span>" +
      esc(formatIntIt(currentXp)) +
      " / " +
      esc(formatIntIt(targetXp)) +
      " EXP</span>" +
      "</div>" +
      '<div class="vc-user-profile-levelbar__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      esc(String(progressPct)) +
      '"><span class="vc-user-profile-levelbar__fill" style="width:' +
      esc(String(progressPct)) +
      '%"></span></div>' +
      "</div>" +
      badgesHtml +
      '<div class="vc-user-profile-stats">' +
      '<article class="vc-user-profile-stat vc-user-profile-stat--level"><span class="vc-user-profile-stat__label">Livello</span><span class="vc-user-profile-stat__value">' +
      esc(String(level.level != null ? level.level : 0)) +
      "</span></article>" +
      '<article class="vc-user-profile-stat vc-user-profile-stat--exp"><span class="vc-user-profile-stat__label">EXP totale</span><span class="vc-user-profile-stat__value">' +
      esc(formatIntIt(level.exp || 0)) +
      "</span></article>" +
      '<article class="vc-user-profile-stat vc-user-profile-stat--rank"><span class="vc-user-profile-stat__label">Rank</span><span class="vc-user-profile-stat__value">' +
      esc(rankText) +
      "</span></article>" +
      '<article class="vc-user-profile-stat vc-user-profile-stat--weekly"><span class="vc-user-profile-stat__label">EXP weekly</span><span class="vc-user-profile-stat__value">' +
      esc(formatIntIt(weekly.weeklyExp || 0)) +
      "</span></article>" +
      "</div>" +
      "</section>" +
      // profilePeerParity1: messaggi/voice uguali per tutti (solo le CTA restano al proprietario).
      '<details class="vc-user-profile-block vc-user-profile-block--messages vc-user-profile-disclosure">' +
      '<summary class="vc-user-profile-disclosure__summary"><span class="vc-user-profile-block__title">Statistiche messaggi</span><span class="vc-user-profile-block__sub">' +
      esc(formatIntIt(messages.messagesTotal || 0)) +
      ' messaggi totali</span><i class="fa fa-angle-down vc-user-profile-disclosure__chev" aria-hidden="true"></i></summary>' +
      '<div class="vc-user-profile-grid3">' +
      '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Totali</span><span class="vc-user-profile-mini__value">' +
      esc(formatIntIt(messages.messagesTotal || 0)) +
      "</span></div>" +
      '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Settimanali</span><span class="vc-user-profile-mini__value">' +
      esc(formatIntIt(messages.messagesWeekly || 0)) +
      "</span></div>" +
      '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Giornaliere</span><span class="vc-user-profile-mini__value">' +
      esc(formatIntIt(messages.messagesDaily || 0)) +
      "</span></div>" +
      "</div></details>" +
      '<details class="vc-user-profile-block vc-user-profile-block--voice vc-user-profile-disclosure">' +
      '<summary class="vc-user-profile-disclosure__summary"><span class="vc-user-profile-block__title">Statistiche voice chat</span><span class="vc-user-profile-block__sub">' +
      esc(formatHoursIt(voice.voiceTotalSeconds || 0)) +
      ' totali</span><i class="fa fa-angle-down vc-user-profile-disclosure__chev" aria-hidden="true"></i></summary>' +
      '<div class="vc-user-profile-grid3">' +
      '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Ore totali</span><span class="vc-user-profile-mini__value">' +
      esc(formatHoursIt(voice.voiceTotalSeconds || 0)) +
      "</span></div>" +
      '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Ore settimanali</span><span class="vc-user-profile-mini__value">' +
      esc(formatHoursIt(voice.voiceWeeklySeconds || 0)) +
      "</span></div>" +
      '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Ore giornaliere</span><span class="vc-user-profile-mini__value">' +
      esc(formatHoursIt(voice.voiceDailySeconds || 0)) +
      "</span></div>" +
      "</div></details>" +
      '<section class="vc-user-profile-block vc-user-profile-block--rankcard">' +
      '<div class="vc-user-profile-block__head">' +
      '<span class="vc-user-profile-block__title">Rank card <code class="vc-user-profile-inlinecmd">+rank</code></span>' +
      (viewerOwns
        ? '<a class="vc-user-profile-customize" href="' +
          esc(profileCustomizeUrl(userId)) +
          '" aria-label="Personalizza rank card" title="Personalizza"><i class="fa fa-paint-brush" aria-hidden="true"></i></a>'
        : "") +
      "</div>" +
      '<div id="vc-user-rankcard-wrap" class="vc-user-rankcard-preview vc-rank-editor-preview__imagewrap">' +
      '<div class="vc-rankcard-ph" aria-hidden="true">' +
      '<div class="vc-rankcard-ph__hero">' +
      '<span class="vc-rankcard-ph__avatar"></span>' +
      '<span class="vc-rankcard-ph__copy"><span></span><span></span></span>' +
      '<span class="vc-rankcard-ph__rank"></span>' +
      "</div>" +
      '<div class="vc-rankcard-ph__stats"><span></span><span></span><span></span></div>' +
      "</div>" +
      '<img id="vc-user-rankcard-image" class="vc-rank-editor-preview__image" alt="" decoding="async" hidden />' +
      '<p id="vc-user-rankcard-image-status" class="vc-rank-editor-preview__imagestatus" hidden></p>' +
      "</div>" +
      multiplierHtml +
      "</section>" +
      halloweenCandyHtml +
      customEconomyHtml +
      '<section class="vc-user-profile-block vc-user-profile-block--roles">' +
      '<div class="vc-user-profile-block__head"><span class="vc-user-profile-block__title">Ruoli</span><span class="vc-user-profile-block__sub">' +
      esc(String(roles.length)) +
      " presenti</span></div>" +
      '<div class="vc-user-profile-roles">' +
      rolesHtml +
      "</div></section>" +
      "</section>";
    if (savedStaffPane) {
      try {
        root.appendChild(savedStaffPane);
      } catch (eRe) {}
    }
    profileBootSettled = true;
    unlockProfileChrome();
    clearProfilePending();
    if (viewerOwns) wireProfileCustomCreate(root);
    wireBirthdayBadge(root, userId);
    if (opts.skipStaffSync) {
      try {
        // staffTabOrganico1: sotto lock community mentre URL/storage dicono Staff,
        // non chiamare paintCommunityChrome (resettava activeTab → Community al refresh).
        if (
          wantsStaffTab ||
          parseWantsStaffTab() ||
          (document.body && document.body.classList.contains("vc-user-profile-staff-tab"))
        ) {
          /* keep staff tab chrome */
        } else if (
          window.VCUserProfileStaffTab &&
          typeof window.VCUserProfileStaffTab.paintCommunityChrome === "function"
        ) {
          window.VCUserProfileStaffTab.paintCommunityChrome(root, userId);
        }
      } catch (eChrome) {}
      scanProfileAvatars(root);
      enhanceProfileEmojis(root);
      return;
    }
    try {
      if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.sync === "function") {
        window.VCUserProfileStaffTab.sync(userId, root);
      }
    } catch (eStaffTab) {}
    scanProfileAvatars(root);
    try {
      if (typeof window.VcWakeDeferredMedia === "function") window.VcWakeDeferredMedia(root);
      if (window.VcAvatarFallback && typeof window.VcAvatarFallback.scan === "function") {
        window.VcAvatarFallback.scan(root);
      }
    } catch (eWakeProf) {}
    enhanceProfileEmojis(root);
  }

  function syncProfileStaffTab(userId, root) {
    try {
      if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.sync === "function") {
        window.VCUserProfileStaffTab.sync(userId, root);
      }
    } catch (eStaffTab) {}
  }

  function releaseProfileRankObjectUrl() {
    if (!profileRankObjectUrl) return;
    try {
      window.URL.revokeObjectURL(profileRankObjectUrl);
    } catch (e) {}
    profileRankObjectUrl = "";
  }

  function communityShellUserId(root) {
    try {
      if (!root) root = byId("vc-user-profile-view");
      if (!root) return "";
      var shell = root.querySelector(":scope > .vc-user-profile-shell");
      return shell ? String(shell.getAttribute("data-vc-community-user") || "").trim() : "";
    } catch (e) {
      return "";
    }
  }

  function setRankCardPreviewReady(img, ready) {
    var wrap = img && img.closest ? img.closest(".vc-rank-editor-preview__imagewrap") : null;
    if (wrap) wrap.classList.toggle("is-ready", Boolean(ready));
    if (img) {
      if (ready) img.removeAttribute("hidden");
      else img.setAttribute("hidden", "");
    }
  }

  function rankCardImgMatchesUser(img, userId) {
    if (!img) return false;
    var marked = String(img.getAttribute("data-vc-rank-for") || "").trim();
    return Boolean(marked && marked === String(userId || "").trim());
  }

  function loadProfileRankCardPreview(userId, options) {
    options = options || {};
    var force = Boolean(options.force);
    var img = byId("vc-user-rankcard-image");
    var status = byId("vc-user-rankcard-image-status");
    if (!img || !status) return;
    var uid = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(uid)) return;
    // profileDataLock1: rank card must follow URL/lock AND community shell — never mix users.
    if (!isAllowedProfileTarget(uid)) return;
    var shellUid = communityShellUserId();
    if (shellUid && shellUid !== uid) return;
    try {
      var idEl = document.querySelector(
        "#vc-user-profile-view > .vc-user-profile-shell .vc-user-profile-id",
      );
      if (idEl && String(idEl.textContent || "").indexOf(uid) === -1) return;
    } catch (eHeroRank) {}
    var now = Date.now();
    var markedFor = String(img.getAttribute("data-vc-rank-for") || "").trim();
    if (uid && markedFor && markedFor !== uid) {
      force = true;
      try {
        img.removeAttribute("src");
      } catch (eClrSrc) {}
      setRankCardPreviewReady(img, false);
      lastRankPreviewUserId = "";
      lastRankPreviewLoadedAt = 0;
    }
    var wrapReady = Boolean(img.closest && img.closest(".vc-rank-editor-preview__imagewrap.is-ready"));
    var hasSrc = Boolean(img.getAttribute("src"));
    if (
      !force &&
      uid &&
      lastRankPreviewUserId === uid &&
      rankCardImgMatchesUser(img, uid) &&
      hasSrc &&
      wrapReady &&
      now - lastRankPreviewLoadedAt < RANK_PREVIEW_RELOAD_MIN_MS
    ) {
      return;
    }
    var url = resolvedPublicRankPreviewUrl(userId);
    if (!url) {
      status.hidden = false;
      status.textContent = "Anteprima non disponibile.";
      status.className = "vc-rank-editor-preview__imagestatus is-error";
      return;
    }
    try {
      img.setAttribute("data-vc-rank-for", uid);
    } catch (eMark) {}
    var myToken = ++profileRankRenderToken;
    function showImage(src, fromCache) {
      if (myToken !== profileRankRenderToken) return;
      if (String(img.getAttribute("data-vc-rank-for") || "") !== uid) return;
      img.onload = function () {
        if (myToken !== profileRankRenderToken) return;
        if (String(img.getAttribute("data-vc-rank-for") || "") !== uid) return;
        img.classList.remove("is-rendering");
        setRankCardPreviewReady(img, true);
        lastRankPreviewUserId = uid;
        lastRankPreviewLoadedAt = Date.now();
        status.hidden = true;
        status.textContent = "";
        status.className = "vc-rank-editor-preview__imagestatus";
      };
      img.onerror = function () {
        if (myToken !== profileRankRenderToken) return;
        if (String(img.getAttribute("data-vc-rank-for") || "") !== uid) return;
        img.classList.remove("is-rendering");
        if (fromCache && hasSrc) {
          setRankCardPreviewReady(img, true);
          status.hidden = true;
          return;
        }
        setRankCardPreviewReady(img, false);
        status.hidden = false;
        status.textContent = "Anteprima non disponibile al momento.";
        status.className = "vc-rank-editor-preview__imagestatus is-error";
      };
      img.alt = "Rank card";
      if (img.getAttribute("src") === src) {
        img.classList.remove("is-rendering");
        setRankCardPreviewReady(img, true);
        lastRankPreviewUserId = uid;
        lastRankPreviewLoadedAt = Date.now();
        status.hidden = true;
        return;
      }
      img.src = src;
    }
    /* rankCardSpeed1: session → Cache API → fetch condiviso (anche GIF grandi). */
    var cachedDataUrl = loadCachedProfileRankPreview(userId);
    if (cachedDataUrl) {
      releaseProfileRankObjectUrl();
      showImage(cachedDataUrl, true);
      if (!force) return;
    } else if (!hasSrc || force) {
      setRankCardPreviewReady(img, false);
      status.hidden = true;
      status.textContent = "";
      status.className = "vc-rank-editor-preview__imagestatus";
      img.classList.add("is-rendering");
    }

    function paintBlob(blob, fromCache) {
      if (myToken !== profileRankRenderToken) return;
      if (String(img.getAttribute("data-vc-rank-for") || "") !== uid) return;
      if (!blob || !blob.size) return;
      releaseProfileRankObjectUrl();
      try {
        profileRankObjectUrl = window.URL.createObjectURL(blob);
        showImage(profileRankObjectUrl, fromCache);
      } catch (eObj) {
        if (!cachedDataUrl) showImage(url, false);
      }
    }

    function runNetworkFetch() {
      if (Date.now() < rankPreviewBlockedUntil) return;
      try {
        if (window.VcApiCache && typeof window.VcApiCache.isWebhookBlocked === "function") {
          if (window.VcApiCache.isWebhookBlocked(url)) return;
        }
      } catch (eBlk) {}
      fetchProfileRankPreviewBlob(uid, url, force).then(function (blob) {
        if (blob) {
          paintBlob(blob, false);
          return;
        }
        if (!cachedDataUrl && myToken === profileRankRenderToken) {
          try {
            showImage(url, false);
          } catch (eFb) {}
        }
      });
    }

    if (!force) {
      loadRankPreviewBlobCache(url).then(function (cachedBlob) {
        if (myToken !== profileRankRenderToken) return;
        if (cachedBlob) {
          paintBlob(cachedBlob, true);
          return;
        }
        runNetworkFetch();
      });
      return;
    }
    runNetworkFetch();
  }

  var profileInitialLoadDone = false;

  function patchSilentProfileStats(root, payload) {
    if (!root || !payload) return;
    var level = payload.level || {};
    var weekly = payload.weekly || {};
    var messages = payload.messages || {};
    function setVal(sel, text) {
      var el = root.querySelector(sel);
      if (!el) return;
      var next = String(text == null ? "" : text);
      if (el.textContent !== next) el.textContent = next;
    }
    setVal(".vc-user-profile-stat--level .vc-user-profile-stat__value", formatIntIt(level.level || 0));
    setVal(".vc-user-profile-stat--exp .vc-user-profile-stat__value", formatIntIt(level.exp || 0));
    setVal(
      ".vc-user-profile-stat--rank .vc-user-profile-stat__value",
      level.rank != null && level.rank !== "" ? String(level.rank) : "—",
    );
    setVal(".vc-user-profile-stat--weekly .vc-user-profile-stat__value", formatIntIt(weekly.weeklyExp || 0));
    setVal(
      ".vc-user-profile-stat--messages .vc-user-profile-stat__value",
      formatIntIt(messages.messagesTotal || 0),
    );
  }

  function applyProfileResult(root, userId, result, silent) {
    var level = result && result.level ? result.level : null;
    var weekly = result && result.weekly ? result.weekly : null;
    var messages = result && result.messages ? result.messages : null;
    var voice = result && result.voice ? result.voice : null;
    var profile = (result && result.profile ? result.profile : {}) || {};
    var uid = String(userId || "").trim();

    // profileDataLock1: reject stale peer/viewer paints against URL/lock.
    if (!isAllowedProfileTarget(uid)) {
      return false;
    }

    if (result && result.notFound) {
      try {
        document.documentElement.classList.remove("vc-user-profile-comm-switch");
      } catch (eNfGate) {}
      if (silent) {
        /* leaveProfileLive1: silent poll after leave → drop ghost community+staff */
        try {
          if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.onMemberLeft === "function") {
            window.VCUserProfileStaffTab.onMemberLeft(uid);
          }
        } catch (eLeft) {}
        renderEmpty(root, uid);
        return true;
      }
      renderEmpty(root, uid);
      /* profileHangFix1: notFound è terminale — non tenere pending/comm-switch */
      return true;
    }

    if (!result || !result.ok) {
      if (silent) return false;
      if (profileInitialLoadDone) return false;
      if (
        root &&
        profileViewLooksReady(root) &&
        String(communityShellUserId(root) || "") === uid
      ) {
        return false;
      }
      if (lastRenderedProfile && String(lastRenderedProfile.userId || "") === uid) {
        return false;
      }
      renderError(
        root,
        result && result.timedOut
          ? "Il server impiega troppo tempo a rispondere. Riprova tra qualche secondo."
          : undefined,
      );
      return false;
    }

    var paintPayload = withExplicitUserId(
      {
        profile: profile || {},
        level: level || {},
        weekly: weekly || {},
        messages: messages || {},
        voice: voice || {},
        userId: uid,
      },
      uid,
    );
    if (!payloadLooksLikeUser(paintPayload, uid)) {
      // profileDataLock1: payload di un altro utente (prefetch/cache race) — scarta.
      // staffCommSwitch2: durante switch non lasciare bg vuoto — tieni il loader.
      return false;
    }

    var hasStats =
      (level && Number(level.exp) > 0) ||
      (weekly && Number(weekly.weeklyExp) > 0) ||
      (messages && Number(messages.messagesTotal) > 0) ||
      (voice && Number(voice.voiceTotalSeconds) > 0);
    var hasProfileShell =
      Boolean(paintPayload.profile && paintPayload.profile.customProfile) ||
      Boolean(String((paintPayload.profile && paintPayload.profile.displayName) || (paintPayload.profile && paintPayload.profile.username) || "").trim()) ||
      (Array.isArray(paintPayload.profile && paintPayload.profile.roles) && paintPayload.profile.roles.length > 0);
    var hasAny = Boolean(level || weekly || messages || voice) && (hasStats || hasProfileShell);

    if (!hasAny && hasProfileShell) {
      hasAny = true;
    }

    if (!hasAny) {
      if (silent) return false;
      renderEmpty(root, uid);
      return false;
    }

    var onStaffTab = Boolean(
      document.body && document.body.classList.contains("vc-user-profile-staff-tab"),
    );
    var wantsStaffTabNow = false;
    try {
      wantsStaffTabNow = parseWantsStaffTab();
    } catch (eWantStaff) {
      wantsStaffTabNow = false;
    }
    // Tab staff: non toccare lastRenderedProfile/DOM community (evita flash del proprio profilo
    // quando si torna su Community). peerStaffNavFix1: anche ?tab=staff (lista peer).
    if ((onStaffTab || wantsStaffTabNow) && silent) {
      profileInitialLoadDone = true;
      profileBootSettled = true;
      return true;
    }

    lastRenderedProfile = {
      root: root,
      userId: uid,
      payload: {
        profile: paintPayload.profile || {},
        level: paintPayload.level || {},
        weekly: paintPayload.weekly || {},
        messages: paintPayload.messages || {},
        voice: paintPayload.voice || {},
      },
    };

    var viewerId = currentViewer && currentViewer.id ? String(currentViewer.id) : "";
    var nextSig = profileRenderSignature(uid, lastRenderedProfile.payload, viewerId);
    var rankImg = root.querySelector("#vc-user-rankcard-image");
    var rankMismatch = Boolean(rankImg && !rankCardImgMatchesUser(rankImg, uid));
    var shellUserNow = communityShellUserId(root);
    var shellOk = shellUserNow === uid;

    var sameDom =
      silent && shellOk && nextSig === lastProfileRenderSignature && Boolean(rankImg);
    if (sameDom) {
      profileInitialLoadDone = true;
      profileBootSettled = true;
      if (rankMismatch || !rankImg.getAttribute("src")) {
        window.setTimeout(function () {
          try {
            loadProfileRankCardPreview(uid, { force: false });
          } catch (eRk) {}
        }, 0);
      }
      return true;
    }
    /* violPass5: silent poll con DOM già ok → solo aggiorna signature, no full renderProfile */
    if (silent && shellOk && Boolean(rankImg) && !rankMismatch) {
      lastProfileRenderSignature = nextSig;
      profileInitialLoadDone = true;
      profileBootSettled = true;
      try {
        patchSilentProfileStats(root, lastRenderedProfile.payload);
      } catch (ePatch) {}
      return true;
    }
    lastProfileRenderSignature = nextSig;
    try {
      var staffBusy =
        parseWantsStaffTab() &&
        !root.querySelector(
          ".vc-user-profile-staff-pane .vc-user-profile-hero, .vc-user-profile-staff-pane .vc-staff-profile-panel",
        );
      /* staffReloadPaint1 / staffSwitchIdLock1: tab=staff senza pane montato —
         NON settare bootSettled (altrimenti watchdog toglie loader → blank). */
      if (staffBusy) {
        try {
          document.documentElement.classList.add("vc-user-profile-staff-tab-pending");
        } catch (ePend) {}
        /* profileHangFix1: sblocca gate community anche se poi montiamo staff */
        try {
          finishCommunitySwitchPaint(uid);
        } catch (eStaffGate) {
          try {
            document.documentElement.classList.remove("vc-user-profile-comm-switch");
          } catch (eStaffGate2) {}
        }
        try {
          if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.sync === "function") {
            window.VCUserProfileStaffTab.sync(uid, root);
          }
        } catch (eStaffDefer) {}
        return true;
      }
      var staffIntent =
        parseWantsStaffTab() ||
        Boolean(document.body && document.body.classList.contains("vc-user-profile-staff-tab"));
      // switcherReload1: lockedCommunityUserId è il lock profilo generico — NON saltare sync
      // su ogni paint community (prima azzerava lo switcher al reload di staff/PM).
      renderProfile(root, uid, lastRenderedProfile.payload, {
        skipStaffSync: Boolean(lockedCommunityUserId) && staffIntent,
        communityOnly: Boolean(lockedCommunityUserId) && staffIntent,
        preserveStaffPane: Boolean(lockedCommunityUserId) && staffIntent,
      });
      profileInitialLoadDone = true;
      profileBootSettled = true;
      loadProfileRankCardPreview(uid, { force: false });
      try {
        finishCommunitySwitchPaint(uid);
      } catch (eGate) {
        try {
          document.documentElement.classList.remove("vc-user-profile-comm-switch");
        } catch (eGate2) {}
      }
      return true;
    } catch (eRender) {
      if (!silent) {
        try {
          renderError(root);
        } catch (eErr) {
          clearProfilePending();
        }
      }
      return false;
    }
  }

  function readCachedProfileBundle(userId) {
    var url = buildApiUrl("profile", userId);
    if (!url) return null;
    var key = "vc:profilecache:" + String(url || "");
    var now = Date.now();
    var mem = profileMemoryCache.get(key);
    if (mem && Number.isFinite(mem.expireAt) && mem.expireAt > now && mem.value) {
      return mem.value;
    }
    var sess = readSessionCache(key, now);
    if (sess) {
      profileMemoryCache.set(key, { expireAt: now + PROFILE_CACHE_TTL_MS, value: sess });
      return sess;
    }
    var local = readLocalProfileCache(key, now);
    if (!local) return null;
    profileMemoryCache.set(key, { expireAt: now + PROFILE_CACHE_TTL_MS, value: local });
    return local;
  }

  function tryInstantProfileFromCache() {
    var userId = parseProfileId();
    if (!userId || profileInitialLoadDone) return false;
    lockProfileTarget(userId);
    var root = byId("vc-user-profile-view");
    if (!root) return false;
    if (communityShellLooksReadyFor(root, userId) && profileShellAndRankAligned(root, userId)) {
      profileInitialLoadDone = true;
      profileBootSettled = true;
      clearProfilePending();
      clearProfileLoading();
      unlockProfileChrome();
      root.hidden = false;
      return true;
    }
    var cachedOut = readCachedProfileBundle(userId);
    var cachedBody = cachedOut && cachedOut.body ? cachedOut.body : null;
    if (!(cachedOut && cachedOut.httpOk && cachedBody && cachedBody.ok && !cachedBody.notFound)) return false;
    var cachedPayload = withExplicitUserId(
      {
        profile: cachedBody.profile || null,
        level: cachedBody.rows && cachedBody.rows.level ? cachedBody.rows.level : null,
        weekly: cachedBody.rows && cachedBody.rows.weekly ? cachedBody.rows.weekly : null,
        messages: cachedBody.rows && cachedBody.rows.messages ? cachedBody.rows.messages : null,
        voice: cachedBody.rows && cachedBody.rows.voice ? cachedBody.rows.voice : null,
        userId: userId,
      },
      userId,
    );
    if (!payloadLooksLikeUser(cachedPayload, userId)) return false;
    return applyProfileResult(
      root,
      userId,
      {
        ok: true,
        notFound: false,
        userId: userId,
        profile: cachedPayload.profile,
        level: cachedPayload.level,
        weekly: cachedPayload.weekly,
        messages: cachedPayload.messages,
        voice: cachedPayload.voice,
      },
      false,
    );
  }

  var profileMemberEnrichTimer = null;
  function scheduleProfileMemberEnrich(userId) {
    var id = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(id)) return;
    try {
      if (profileMemberEnrichTimer) window.clearTimeout(profileMemberEnrichTimer);
    } catch (eClr) {}
    profileMemberEnrichTimer = window.setTimeout(function () {
      profileMemberEnrichTimer = null;
      loadProfile({ silent: true, bypassCache: true, userId: id });
    }, 700);
  }

  function loadProfile(options) {
    options = options || {};
    var silent = Boolean(options.silent);
    var force = Boolean(options.force);
    var bypassCache = Boolean(options.bypassCache);
    var preserveStaffPane = Boolean(options.preserveStaffPane);
    var allowRetry = options.retry !== false;
    var retryCount = Math.max(0, Number(options.retryCount) || 0);
    if ((profileBootGaveUp || window.__VC_PROFILE_GAVE_UP) && !silent && !force) {
            profileBootGaveUp = false;
      try {
        window.__VC_PROFILE_GAVE_UP = false;
      } catch (eGave) {}
      options = Object.assign({}, options, { force: true });
      force = true;
    }
    var overrideId = String(options.userId || "").trim();
    var userId = /^\d{17,20}$/.test(overrideId) ? overrideId : parseProfileId();
    if (!userId) {
      if (!silent) clearProfilePending();
      return Promise.resolve();
    }
    // profileDataLock1: ogni fetch si ancora al target corrente (URL/lock).
    if (!isAllowedProfileTarget(userId)) {
      var canon = canonicalProfileTargetId();
      if (!canon) {
        if (!silent) clearProfilePending();
        return Promise.resolve();
      }
      userId = canon;
    }
    lockProfileTarget(userId);
    var root = byId("vc-user-profile-view");
    if (!root) {
      if (!silent) clearProfilePending();
      return Promise.resolve();
    }

    /* rankCardSpeed1: prefetch GIF in parallelo al JSON profilo */
    try {
      prefetchProfileRankCard(userId);
    } catch (ePrefetchRank) {}

    if (!silent) {
      root.hidden = false;
      try {
        hideLeaderOnlySections();
      } catch (eHideEarly) {}
    }

    if (!silent && force) {
      clearProfileSessionCaches();
    }

    if (!silent) {
      currentViewer = (typeof window !== "undefined" && window.__VC_DISCORD_PROFILE) || currentViewer;
      try {
        hideLeaderOnlySections();
      } catch (eHide) {}
      var keepVisible = profileViewLooksReady(root);
      if (lockedCommunityUserId) {
        keepVisible = communityShellLooksReadyFor(root, lockedCommunityUserId);
      }
      if (!force && retryCount === 0) {
        var cachedOut = readCachedProfileBundle(userId);
        var cachedBody = cachedOut && cachedOut.body ? cachedOut.body : null;
        if (cachedOut && cachedOut.httpOk && cachedBody && cachedBody.ok && !cachedBody.notFound) {
          var cachedPayload = withExplicitUserId(
            {
              profile: cachedBody.profile || null,
              level: cachedBody.rows && cachedBody.rows.level ? cachedBody.rows.level : null,
              weekly: cachedBody.rows && cachedBody.rows.weekly ? cachedBody.rows.weekly : null,
              messages: cachedBody.rows && cachedBody.rows.messages ? cachedBody.rows.messages : null,
              voice: cachedBody.rows && cachedBody.rows.voice ? cachedBody.rows.voice : null,
              userId: userId,
            },
            userId,
          );
          // profileDataLock1: mai stampare cache di un altro utente.
          if (payloadLooksLikeUser(cachedPayload, userId)) {
            applyProfileResult(
              root,
              userId,
              {
                ok: true,
                notFound: false,
                userId: userId,
                profile: cachedPayload.profile,
                level: cachedPayload.level,
                weekly: cachedPayload.weekly,
                messages: cachedPayload.messages,
                voice: cachedPayload.voice,
              },
              false,
            );
          }
        } else if (!profileInitialLoadDone && !keepVisible) {
          renderLoading(root, {
            force: Boolean(preserveStaffPane || communitySwitchGateActive()),
            preserveStaffPane: Boolean(preserveStaffPane || communitySwitchGateActive()),
          });
        }
      } else if (!profileInitialLoadDone && !keepVisible) {
                // staffCommSwitch2: non wipe-are il pane staff durante switch Community.
        renderLoading(root, {
          force: true,
          preserveStaffPane: Boolean(preserveStaffPane || communitySwitchGateActive()),
        });
      }
    }

    return fetchProfileBundle(userId, bypassCache ? { bypassCache: true } : null)
      .then(function (result) {
        if (
          !silent &&
          allowRetry &&
          retryCount < PROFILE_FETCH_MAX_RETRIES &&
          result &&
          !result.ok &&
          !result.notFound
        ) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 400 + retryCount * 500);
          }).then(function () {
            return loadProfile({
              silent: false,
              retry: false,
              retryCount: retryCount + 1,
              force: true,
              userId: userId,
            });
          });
        }
        /* violPass5: apply silent fuori dal turn sync (cache hit = .then sync = Violation) */
        if (silent) {
          return new Promise(function (resolve) {
            window.setTimeout(function () {
              var ok = false;
              try {
                ok = applyProfileResult(root, userId, result, true);
              } catch (eSil) {
                ok = false;
              }
              resolve(ok);
            }, 0);
          });
        }
        var applied = applyProfileResult(root, userId, result, silent);
        if (applied && !silent && !bypassCache) {
          scheduleProfileMemberEnrich(userId);
        }
        return applied;
      })
      .catch(function () {
        if (silent) return false;
        if (profileInitialLoadDone) return false;
        if (allowRetry && retryCount < PROFILE_FETCH_MAX_RETRIES) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 400 + retryCount * 500);
          }).then(function () {
            return loadProfile({
              silent: false,
              retry: false,
              retryCount: retryCount + 1,
              force: true,
              userId: userId,
            });
          });
        }
        renderError(root);
        return false;
      })
      .finally(function () {
        if (silent || !parseProfileId()) return;
        var root = byId("vc-user-profile-view");
        // staffCommSwitch2: mai spegnere loader/pending se lo shell community target non c'è ancora.
        /* profileHangFix1: se empty/notfound già in DOM, non rimettere il loader */
        var terminalEmpty = false;
        try {
          terminalEmpty = Boolean(
            root &&
              root.querySelector(
                ":scope > .vc-user-profile-shell .vc-user-profile-empty, :scope > .vc-user-profile-shell .vc-user-profile-notfound, :scope > .vc-user-profile-shell--notfound, :scope > .vc-user-profile-shell .vc-user-profile-hero",
              ),
          );
        } catch (eTerm) {}
        if (terminalEmpty) {
          try {
            document.documentElement.classList.remove("vc-user-profile-comm-switch");
          } catch (eGateOff) {}
          clearProfilePending();
          clearProfileLoading();
          return;
        }
        if (shouldHoldCommunitySwitchLoader(root, userId)) {
          try {
            /* profileEmptyFix1: se c'è già shell/notfound non riarmare wipe+loader */
            var holdHasShell = Boolean(
              root &&
                root.querySelector(
                  ":scope > .vc-user-profile-shell .vc-user-profile-hero, :scope > .vc-user-profile-shell .vc-user-profile-notfound, :scope > .vc-user-profile-shell .vc-user-profile-empty",
                ),
            );
            if (holdHasShell) {
              document.documentElement.classList.remove("vc-user-profile-comm-switch");
              clearProfilePending();
              clearProfileLoading();
              return;
            }
            if (!byId("vc-user-profile-loading") || (byId("vc-user-profile-loading") && byId("vc-user-profile-loading").hidden)) {
              renderLoading(root, { force: true, preserveStaffPane: true });
            }
          } catch (eHold) {}
          return;
        }
        /* profileHangFix2: se eravamo in hold e ora timeout/ready → chiudi gate */
        try {
          if (communitySwitchGateActive()) {
            finishCommunitySwitchPaint(userId);
          }
        } catch (eFin) {
          try {
            document.documentElement.classList.remove("vc-user-profile-comm-switch");
            clearCommunitySwitchHoldClock();
          } catch (eGateOff2) {}
        }
        if (profileInitialLoadDone || profileBootSettled) {
          clearProfilePending();
          clearProfileLoading();
        } else if (root && profileViewLooksReady(root)) {
          profileInitialLoadDone = true;
          profileBootSettled = true;
          clearProfilePending();
          clearProfileLoading();
        }
                try {
          if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
        } catch (eLock) {}
      });
  }

  function dismissCommunityBootOverlay() {
    try {
      var ul = byId("vc-ul-loading");
      if (ul) ul.hidden = true;
      document.documentElement.classList.remove("vc-user-leader-pending");
      document.documentElement.classList.remove("vc-page-cine-boot");
    } catch (eDismiss) {}
  }

  function main(options) {
    var force = Boolean(options && options.force);
    if (profileMainInFlight && !force) {
      return Promise.resolve();
    }
    if (force) {
      profileMainInFlight = false;
      profilePendingWatchdogAttempts = 0;
    }
    profileMainInFlight = true;
    var bootId = parseProfileId();
    if (bootId) {
      lockProfileTarget(bootId);
      dismissCommunityBootOverlay();
    }
    armProfilePendingWatchdog();
    try {
      if (!(options && options.force) && tryInstantProfileFromCache()) {
        return loadProfile({ silent: true, userId: bootId || undefined }).finally(function () {
          profileMainInFlight = false;
        });
      }
      return loadProfile(options || {}).finally(function () {
        profileMainInFlight = false;
      });
    } catch (eMain) {
      profileMainInFlight = false;
      try {
        var root = byId("vc-user-profile-view");
        if (root) renderError(root);
        else {
          clearProfilePending();
          clearProfileLoading();
        }
      } catch (eErr) {
        clearProfilePending();
      }
      return Promise.resolve();
    }
  }

  function refreshProfileSilently() {
    if (!profileInitialLoadDone || !lastRenderedProfile) return;
    loadProfile({ silent: true });
  }

  function stopLiveProfilePolling() {
    if (liveProfilePollTimer) {
      clearInterval(liveProfilePollTimer);
      liveProfilePollTimer = null;
    }
  }

  function startLiveProfilePolling() {
    stopLiveProfilePolling();
    liveProfilePollTimer = setInterval(function () {
      /* violPass5: interval torna subito — lavoro fuori dal handler (era ~2490ms Violation) */
      if (liveProfilePollBusy || profileMainInFlight) return;
      if (document.visibilityState !== "visible") return;
      if (!parseProfileId()) return;
      liveProfilePollBusy = true;
      window.setTimeout(function () {
        try {
          Promise.resolve(loadProfile({ silent: true })).finally(function () {
            liveProfilePollBusy = false;
          });
        } catch (ePoll) {
          liveProfilePollBusy = false;
        }
      }, 0);
    }, LIVE_PROFILE_POLL_MS);
  }

  function repairProfileAfterBack() {
    var userId = parseProfileId();
    if (!userId) return;
    var root = byId("vc-user-profile-view");
    if (!root) return;

    profileBootGaveUp = false;
    try {
      window.__VC_PROFILE_GAVE_UP = false;
    } catch (eGave) {}

    lockProfileTarget(userId);
    unlockProfileChrome();
    root.hidden = false;
    try {
      hideLeaderOnlySections();
    } catch (eHide) {}
    try {
      if (typeof window.__vcRepairNotifDropdownPortal === "function") {
        window.__vcRepairNotifDropdownPortal();
      } else if (typeof window.__vcEnsureNotifDropdownInHeader === "function") {
        window.__vcEnsureNotifDropdownInHeader(true);
      }
    } catch (eNotif) {}

    try {
      if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.repairAfterBack === "function") {
        window.VCUserProfileStaffTab.repairAfterBack(root, userId);
      }
    } catch (eStaff) {}

    var cachedOk =
      lastRenderedProfile &&
      String(lastRenderedProfile.userId) === String(userId) &&
      lastRenderedProfile.payload &&
      payloadLooksLikeUser(lastRenderedProfile.payload, userId);
    // profileDataLock1: shell di un altro utente = broken (anche se "sembra ready").
    var wrongUserShell = Boolean(
      root.querySelector(":scope > .vc-user-profile-shell") &&
        !communityShellLooksReadyFor(root, userId),
    );
    var broken = profileViewLooksBroken(root) || wrongUserShell || !profileShellAndRankAligned(root, userId);

    if (cachedOk && broken) {
      try {
        lastRenderedProfile.root = root;
        renderProfile(root, userId, lastRenderedProfile.payload);
        profileInitialLoadDone = true;
        loadProfileRankCardPreview(userId, { force: false });
      } catch (eRepaint) {
        profileInitialLoadDone = false;
      }
      loadProfile({ silent: true, userId: userId });
      return;
    }

    if (!broken && profileViewLooksReady(root) && communityShellLooksReadyFor(root, userId)) {
      profileInitialLoadDone = true;
      if (cachedOk) lastRenderedProfile.root = root;
      try {
        syncProfileStaffTab(userId, root);
      } catch (eSync) {}
      loadProfile({ silent: true, userId: userId });
      return;
    }

    if (wrongUserShell || !cachedOk) {
      invalidateProfilePaintState("repair-mismatch");
      lockProfileTarget(userId);
    }

        profileInitialLoadDone = false;
    main({ force: true });
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var prevViewerId = currentViewer && currentViewer.id ? String(currentViewer.id) : "";
    currentViewer = ev && ev.detail ? ev.detail.user || null : null;
    var nextViewerId = currentViewer && currentViewer.id ? String(currentViewer.id) : "";
    if (!lastRenderedProfile || !lastRenderedProfile.root) return;
        if (prevViewerId === nextViewerId) return;
    var targetId = canonicalProfileTargetId();
    // profileDataLock1: mai ripitturare shell/rank di un utente diverso dall'URL.
    if (
      targetId &&
      String(lastRenderedProfile.userId || "") !== targetId
    ) {
      return;
    }
    if (!payloadLooksLikeUser(lastRenderedProfile.payload, lastRenderedProfile.userId)) {
      return;
    }
    var sig = profileRenderSignature(lastRenderedProfile.userId, lastRenderedProfile.payload, nextViewerId);
    if (sig === lastProfileRenderSignature && lastRenderedProfile.root.querySelector("#vc-user-rankcard-image")) {
      return;
    }
    lastProfileRenderSignature = sig;
    var root = lastRenderedProfile.root;
    var uid = lastRenderedProfile.userId;
    var payload = lastRenderedProfile.payload;
    /* staffPtPrefetchFix1: non bloccare il main thread sul handler sync (reflow ~1s) */
    window.setTimeout(function () {
      try {
        if (!lastRenderedProfile || lastRenderedProfile.root !== root) return;
        if (String(lastRenderedProfile.userId || "") !== String(uid || "")) return;
        renderProfile(root, uid, payload);
        syncProfileStaffTab(uid, root);
        loadProfileRankCardPreview(uid, { force: false });
      } catch (eProfDefer) {}
    }, 0);
  });

    try {
    window.setTimeout(function () {
      try {
        if (!document.documentElement.classList.contains("vc-user-profile-pending")) return;
        /* staffSwitchIdLock1: non clear se staff ancora pending vuoto */
        if (profileInitialLoadDone) {
          var holdStaffFs =
            parseWantsStaffTab() &&
            (document.documentElement.classList.contains("vc-user-profile-staff-tab-pending") ||
              document.documentElement.classList.contains("vc-staff-boot-block"));
          var staffReadyFs = Boolean(
            document.querySelector(
              ".vc-user-profile-staff-pane .vc-user-profile-hero, .vc-user-profile-staff-pane .vc-staff-profile-panel, .vc-staff-prof-miss",
            ),
          );
          /* staffRefreshUnstick1: su reload sblocca anche se staff ancora vuoto */
          if (holdStaffFs && !staffReadyFs && !isProfileReloadNavigation()) return;
          if (holdStaffFs) {
            try {
              document.documentElement.classList.remove(
                "vc-user-profile-staff-tab-pending",
                "vc-staff-boot-block",
              );
            } catch (eStaffFs) {}
          }
          clearProfilePending();
          clearProfileLoading();
          return;
        }
        profileBootGaveUp = true;
        window.__VC_PROFILE_GAVE_UP = true;
        var root = byId("vc-user-profile-view");
        if (root) {
          renderError(root, "Il caricamento si è bloccato (cache app). Premi Riprova o svuota i dati del sito su Brave.");
        } else {
          clearProfilePending();
          clearProfileLoading();
        }
      } catch (eFs) {
        clearProfilePending();
      }
    }, PROFILE_BOOT_FAILSAFE_MS);
  } catch (eFsTimer) {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }

  startLiveProfilePolling();

  /* leaveProfileLive1: WS/bots → drop open profile immediately */
  window.addEventListener("vc:member-left", function (ev) {
    try {
      var leftId = String((ev && ev.detail && ev.detail.userId) || "").trim();
      var cur = String(parseProfileId() || "").trim();
      if (!leftId || !cur || leftId !== cur) return;
      var root = byId("vc-user-profile-view");
      if (!root) return;
      try {
        if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.onMemberLeft === "function") {
          window.VCUserProfileStaffTab.onMemberLeft(leftId);
        }
      } catch (eStaff) {}
      clearProfileSessionCaches();
      lastRenderedProfile = null;
      renderEmpty(root, leftId);
    } catch (eLeft) {}
  });

  window.addEventListener("pageshow", function (ev) {
    if (!parseProfileId()) return;
        if (ev && ev.persisted) {
      repairProfileAfterBack();
      return;
    }
        window.setTimeout(function () {
      if (!parseProfileId()) return;
      var r = byId("vc-user-profile-view");
      if (!r) return;
      var pending = false;
      var staleStaff = false;
      var stuckGate = false;
      try {
        pending = document.documentElement.classList.contains("vc-user-profile-pending");
        stuckGate = document.documentElement.classList.contains("vc-user-profile-comm-switch");
        staleStaff =
          (document.body && document.body.classList.contains("vc-user-profile-staff-tab")) ||
          document.documentElement.classList.contains("vc-user-profile-staff-tab-pending");
      } catch (eCls) {}
      if (pending && !profileInitialLoadDone) {
        main({ force: false });
        return;
      }
      /* profileRefreshGate1: pending già “fatto” ma gate ancora su → sblocca, non early-return forever */
      if (pending && profileInitialLoadDone) {
        try {
          if (stuckGate) finishCommunitySwitchPaint(parseProfileId());
          else {
            clearProfilePending();
            clearProfileLoading();
            unlockProfileChrome();
          }
        } catch (eUnstick) {
          try {
            document.documentElement.classList.remove(
              "vc-user-profile-pending",
              "vc-user-profile-comm-switch",
            );
            unlockProfileChrome();
          } catch (eUnstick2) {}
        }
        return;
      }
      if (pending) return;
      if (staleStaff && profileViewLooksBroken(r)) {
        repairProfileAfterBack();
        return;
      }
      if (profileInitialLoadDone && profileViewLooksBroken(r)) {
        repairProfileAfterBack();
      }
    }, 100);
  });

  /* profileRefreshGate1 / staffRefreshUnstick1: F5 — sblocca pending + staff-tab-pending */
  try {
    if (isProfileReloadNavigation() && parseProfileId()) {
      window.setTimeout(function () {
        try {
          if (!parseProfileId()) return;
          var stillPending = document.documentElement.classList.contains("vc-user-profile-pending");
          var stillGate = document.documentElement.classList.contains("vc-user-profile-comm-switch");
          var stillStaff =
            document.documentElement.classList.contains("vc-user-profile-staff-tab-pending") ||
            document.documentElement.classList.contains("vc-staff-boot-block");
          if (!stillPending && !stillGate && !stillStaff) return;
          var root = byId("vc-user-profile-view");
          var staffReady = Boolean(
            root &&
              root.querySelector(
                ".vc-user-profile-staff-pane .vc-user-profile-hero, .vc-user-profile-staff-pane .vc-staff-profile-panel, .vc-staff-prof-miss",
              ),
          );
          if (root && (profileViewLooksReady(root) || staffReady)) {
            try {
              finishCommunitySwitchPaint(parseProfileId());
            } catch (eFin) {}
            try {
              document.documentElement.classList.remove(
                "vc-user-profile-staff-tab-pending",
                "vc-staff-boot-block",
              );
            } catch (eStaffOk) {}
            clearProfilePending();
            clearProfileLoading();
            unlockProfileChrome();
            return;
          }
          document.documentElement.classList.remove(
            "vc-user-profile-comm-switch",
            "vc-user-profile-pending",
            "vc-user-profile-staff-tab-pending",
            "vc-staff-boot-block",
            "vc-loading-scroll-lock",
          );
          clearCommunitySwitchHoldClock();
          unlockProfileChrome();
          clearProfileLoading();
          if (parseWantsStaffTab() && root) {
            try {
              if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.sync === "function") {
                window.VCUserProfileStaffTab.sync(parseProfileId(), root);
              }
            } catch (eSyncFs) {}
          }
          if (root && profileViewLooksBroken(root) && !staffReady) repairProfileAfterBack();
        } catch (eReloadFs) {}
      }, 3500);
    }
  } catch (eReloadArm) {}

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (!parseProfileId()) return;
    try {
      var root = byId("vc-user-profile-view");
      if (root && profileViewLooksBroken(root)) repairProfileAfterBack();
    } catch (eVis) {}
  });

  window.addEventListener("beforeunload", stopLiveProfilePolling);

  window.addEventListener("vc:profile-id-changed", function (ev) {
    var id = ev && ev.detail && ev.detail.userId ? String(ev.detail.userId) : "";
    if (!/^\d{17,20}$/.test(id)) return;
    if (!parseProfileId()) return;
    // profileDataLock1 + bootMidAvatar1: cambio peer → top + wipe stato precedente.
    try {
      window.__vcProfileForceTop = 1;
      window.__vcDiscardScrollRestore = 1;
      window.__vcDiscardNextUnpinScrollY = true;
      window.__vcCachedScrollY = 0;
      window.__vcUserScrolledAway = 0;
      if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
    } catch (eTopId) {}
    lockProfileTarget(id);
    if (
      !lastRenderedProfile ||
      String(lastRenderedProfile.userId || "") !== id ||
      !payloadLooksLikeUser(lastRenderedProfile.payload || {}, id)
    ) {
      invalidateProfilePaintState("id-changed");
      lockProfileTarget(id);
    }
    loadProfile({ silent: true, force: true, userId: id, preserveStaffPane: true });
  });

  window.addEventListener("popstate", function () {
    if (!parseProfileId()) return;
    var id = parseProfileId();
    lockProfileTarget(id);
    if (
      window.VCUserProfileStaffTab &&
      typeof window.VCUserProfileStaffTab.sync === "function"
    ) {
      var root = byId("vc-user-profile-view");
      window.VCUserProfileStaffTab.sync(id, root);
    }
    if (
      !lastRenderedProfile ||
      String(lastRenderedProfile.userId || "") !== id ||
      !communityShellLooksReadyFor(byId("vc-user-profile-view"), id)
    ) {
      invalidateProfilePaintState("popstate");
      lockProfileTarget(id);
    }
    loadProfile({ silent: true, force: true, userId: id, preserveStaffPane: true });
  });

  window.VCUserProfilePage = {
    isProfileMode: function () {
      return Boolean(parseProfileId());
    },
    profilePublicUrl: profilePublicUrl,
    repairAfterBack: repairProfileAfterBack,
        ensureCommunityFor: function (userId, root, opts) {
      var id = String(userId || "").trim();
      if (!/^\d{17,20}$/.test(id)) return false;
      if (!root) root = byId("vc-user-profile-view");
      if (!root) return false;
      opts = opts || {};
      var wipe = Boolean(opts.wipe);
      /* profileRefreshGate1: gate chrome solo se richiesto (tab-switch), non su cold ensure */
      var useSwitchGate = opts.switchGate !== undefined ? Boolean(opts.switchGate) : wipe;

      lockedCommunityUserId = id;
      communityPaintSeq += 1;
      var paintSeq = communityPaintSeq;

      var shell = root.querySelector(":scope > .vc-user-profile-shell");
      var shellUser = shell ? String(shell.getAttribute("data-vc-community-user") || "").trim() : "";
      var shellStale = Boolean(shell && shell.getAttribute("data-vc-community-stale") === "1");
      var heroIdOk = false;
      try {
        var idEl = shell && shell.querySelector(".vc-user-profile-id");
        heroIdOk = Boolean(
          idEl && /^\d{17,20}$/.test(id) && String(idEl.textContent || "").indexOf(id) !== -1,
        );
      } catch (eHero) {
        heroIdOk = false;
      }
      var rankImg = byId("vc-user-rankcard-image");
      var rankFor = rankImg ? String(rankImg.getAttribute("data-vc-rank-for") || "").trim() : "";
      var rankMismatch = Boolean(rankFor && rankFor !== id);
      var shellReallyOk = Boolean(shell && shellUser === id && !shellStale && heroIdOk);

      // profileDataLock1: shell ok ma rank di un altro utente → forza reload rank (mai lasciare mix).
      if (shellReallyOk && !wipe && rankMismatch) {
        try {
          lastRankPreviewUserId = "";
          lastRankPreviewLoadedAt = 0;
          profileRankRenderToken += 1;
          if (rankImg) {
            rankImg.removeAttribute("src");
            rankImg.removeAttribute("data-vc-rank-for");
            setRankCardPreviewReady(rankImg, false);
          }
        } catch (eRankWipe) {}
        loadProfileRankCardPreview(id, { force: true });
      }

      if (shellReallyOk && !wipe) {
        try {
          finishCommunitySwitchPaint(id);
        } catch (eClsOk) {
          try {
            document.documentElement.classList.remove("vc-user-profile-comm-switch");
          } catch (eGateOk) {}
        }
        try {
          shell.hidden = false;
          shell.removeAttribute("data-vc-community-stale");
          shell.setAttribute("aria-hidden", "false");
          shell.style.removeProperty("display");
          shell.style.removeProperty("visibility");
        } catch (eShow) {}
        loadProfileRankCardPreview(id, { force: true });
        return true;
      }

      function paintFromPayload(payload) {
        if (paintSeq !== communityPaintSeq) return false;
        if (lockedCommunityUserId && lockedCommunityUserId !== id) return false;
        if (parseProfileId() && parseProfileId() !== id) return false;
        var bound = withExplicitUserId(payload, id);
        if (!payloadLooksLikeUser(bound, id)) return false;
        lastProfileRenderSignature = "";
        lastRenderedProfile = { root: root, userId: id, payload: bound };
                profileRankRenderToken += 1;
        lastRankPreviewUserId = "";
        lastRankPreviewLoadedAt = 0;
        profileInitialLoadDone = true;
        profileBootSettled = true;
        renderProfile(root, id, bound, { skipStaffSync: true, communityOnly: true });
        loadProfileRankCardPreview(id, { force: false });
        try {
          finishCommunitySwitchPaint(id);
        } catch (eGate) {
          try {
            document.documentElement.classList.remove("vc-user-profile-comm-switch");
          } catch (eGate2) {}
        }
        return true;
      }

      // Con wipe (es. staff→community) non riusare lastRenderedProfile in memoria:
      // può essere sporco / del viewer. Preferisci cache per-id o fetch.
      if (
        !wipe &&
        lastRenderedProfile &&
        String(lastRenderedProfile.userId || "") === id &&
        lastRenderedProfile.payload &&
        payloadLooksLikeUser(withExplicitUserId(lastRenderedProfile.payload, id), id)
      ) {
        try {
          if (paintFromPayload(lastRenderedProfile.payload)) return true;
        } catch (ePaint) {}
      }

      try {
        var cachedOut = readCachedProfileBundle(id);
        var cachedBody = cachedOut && cachedOut.body ? cachedOut.body : null;
        if (cachedOut && cachedOut.httpOk && cachedBody && cachedBody.ok && !cachedBody.notFound) {
          var payload = withExplicitUserId(
            {
              profile: cachedBody.profile || {},
              level: cachedBody.rows && cachedBody.rows.level ? cachedBody.rows.level : {},
              weekly: cachedBody.rows && cachedBody.rows.weekly ? cachedBody.rows.weekly : {},
              messages: cachedBody.rows && cachedBody.rows.messages ? cachedBody.rows.messages : {},
              voice: cachedBody.rows && cachedBody.rows.voice ? cachedBody.rows.voice : {},
              userId: id,
            },
            id,
          );
          // profileSwitchFix1 / profileDataLock1: mai forzare userId su cache ambigua/sbagliata.
          // staffCommSwitch2: withExplicitUserId ancora solo se profile/level erano del fetch id.
          if (payloadLooksLikeUser(payload, id) && paintFromPayload(payload)) return true;
        }
      } catch (eCache) {}

            try {
        lastProfileRenderSignature = "";
        lastRenderedProfile = null;
        profileRankRenderToken += 1;
        lastRankPreviewUserId = "";
        lastRankPreviewLoadedAt = 0;
        profileInitialLoadDone = false;
        // staffCommSwitch2: reset boot settled altrimenti finally/watchdog spengono il loader a vuoto.
        profileBootSettled = false;
        try {
          window.__VC_PROFILE_PREFETCH_RESULT = null;
        } catch (eClrPref) {}
        try {
          if (useSwitchGate) {
            document.documentElement.classList.add("vc-user-profile-comm-switch");
            markCommunitySwitchHold();
          } else {
            document.documentElement.classList.remove("vc-user-profile-comm-switch");
            clearCommunitySwitchHoldClock();
          }
        } catch (eGateOn) {}
        // communityStaffSwitchFlash1: loader senza distruggere il pane staff
        renderLoading(root, { force: true, preserveStaffPane: true });
        armProfilePendingWatchdog();
      } catch (eLoad) {}

            try {
        document.documentElement.classList.remove("vc-user-profile-staff-tab-pending");
        if (document.body) {
          document.body.classList.remove("vc-user-profile-staff-tab", "vc-staff-profile-home");
        }
      } catch (eCls) {}

      loadProfile({ silent: false, force: true, userId: id, preserveStaffPane: true });
      return false;
    },
    lockCommunityUser: function (userId) {
      lockedCommunityUserId = String(userId || "").trim();
    },
    unlockCommunityUser: function () {
      lockedCommunityUserId = "";
    },
    // profileDataLock1: esposto per assert/test
    profileDomAligned: function (userId) {
      return profileShellAndRankAligned(byId("vc-user-profile-view"), userId || parseProfileId());
    },
    // staffCommSwitch2
    finishCommunitySwitch: finishCommunitySwitchPaint,
  };
})();
/* rankFastPaint1 */
/* violPass5 */

