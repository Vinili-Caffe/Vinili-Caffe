(function () {
  (function ensureSiteHelperScripts() {
    try {
      function appendScript(path) {
        var file = String(path || "").split("/").pop().replace(/\?.*$/, "");
        if (!file) return;
        if (document.querySelector('script[src*="' + file + '"]')) return;
        var s = document.createElement("script");
        var existing = document.querySelector('script[src*="discord-auth.js"]');
        var ver = existing && existing.getAttribute("src") && existing.getAttribute("src").match(/[?&]v=([^&]+)/);
        s.src = path + (ver && ver[1] ? "?v=" + ver[1] : "?t=" + Date.now());
        s.defer = true;
        (document.head || document.documentElement).appendChild(s);
      }
      if (!window.__VC_CURSOR_TRAIL_INIT) appendScript("/js/vc-cursor-trail.js");
      if (!window.VcFormDrafts) appendScript("/js/vc-form-drafts.js");
    } catch (eHelper) {}
  })();

  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_AT_KEY = "vc_discord_expires_at";
  var PENDING_LOGIN_NOTIF_KEY = "vc_pending_login_notification_v1";
  var OAUTH_LOGIN_COUNT_KEY = "vc_discord_oauth_login_count_v1";
  var OAUTH_FRESH_AFTER_BOUNCE_KEY = "vc_oauth_fresh_after_bounce_v1";
  var OAUTH_STATE_NONCE_KEY = "vc_oauth_state_nonce_v1";
  var SITE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  /** Backup percorso ritorno se `state` non torna nel fragment OAuth. */
  var OAUTH_PENDING_RETURN_KEY = "vc_oauth_pending_return_v1";
  /** Profilo `@me` in sessione: evita round-trip Discord a ogni navigazione. */
  var ME_CACHE_KEY = "vc_discord_me_cache_v1";
  var OAUTH_SCOPES_KEY = "vc_discord_oauth_scopes_v1";

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_AUTH) || {};
  }

  function i18n(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  var SESSION_OVERLAY_ID = "vc-session-verify-overlay";
  /** Hard stop: @me / site-verify appesi non devono bloccare la pagina. */
  var SESSION_VERIFY_HARD_MS = 1200;
  var sessionVerifyWatchdog = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function clearSessionVerifyWatchdog() {
    if (!sessionVerifyWatchdog) return;
    try {
      clearTimeout(sessionVerifyWatchdog);
    } catch (eW) {}
    sessionVerifyWatchdog = null;
  }

  function resetScrollAfterSessionOverlay() {
    try {
      var h = String(location.hash || "").replace(/^#/, "");
      if (h && h.indexOf("access_token=") !== 0) return;
      var y =
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        (document.body && document.body.scrollTop) ||
        0;
      if (y > 8) return;
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch (eScr) {}
  }

  function forceUnlockSessionVerifyUi() {
    clearSessionVerifyWatchdog();
    try {
      document.documentElement.classList.remove("vc-session-verify-pending");
    } catch (e0) {}
    try {
      var el = byId(SESSION_OVERLAY_ID);
      if (el) {
        el.classList.add("vc-session-verify-overlay--hidden");
        el.setAttribute("aria-busy", "false");
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    } catch (e1) {}
    resetScrollAfterSessionOverlay();
    if (window.__VC_DISCORD_PROFILE) return;
    try {
      var state = byId("discord-login-state");
      if (state && state.querySelector(".vc-auth-pending-shell")) {
        state.hidden = true;
        state.innerHTML = "";
      }
      var loginBtns = queryDiscordLoginButtons();
      for (var i = 0; i < loginBtns.length; i += 1) {
        loginBtns[i].hidden = false;
      }
    } catch (e2) {}
  }

  function armSessionVerifyWatchdog() {
    clearSessionVerifyWatchdog();
    sessionVerifyWatchdog = setTimeout(function () {
      sessionVerifyWatchdog = null;
      forceUnlockSessionVerifyUi();
    }, SESSION_VERIFY_HARD_MS);
  }

  /** Chiude campanella notifiche (e classi overlay) se aperta. */
  function closeVcNotifDropdown() {
    try {
      var n = document.getElementById("vc-notif-dropdown");
      if (n && n.open) n.open = false;
      document.documentElement.classList.remove(
        "vc-notif-dropdown-open",
        "vc-notif-sheet-open",
        "vc-notif-overlay-active",
      );
    } catch (eN) {}
  }

  /** Chiude menu account header (hover/focus class + blur). */
  function closeVcAccountMenu() {
    try {
      document.documentElement.classList.remove("vc-header-account-open");
      var menu = document.querySelector(".discord-account-menu");
      if (!menu) return;
      var active = document.activeElement;
      if (active && menu.contains(active) && typeof active.blur === "function") active.blur();
    } catch (eA) {}
  }

  function closeVcHeaderSnavDetails() {
    try {
      var list = document.querySelectorAll("header details.vc-snav-details[open], .vc-header-bar details.vc-snav-details[open]");
      for (var i = 0; i < list.length; i += 1) list[i].open = false;
    } catch (eS) {}
  }

  /**
   * Un solo pannello header alla volta (notifiche ↔ account) su tutte le pagine.
   * Deve vivere in discord-auth perché il menu account nasce dopo il login.
   * Notifiche: click-to-pin — non chiudere solo perché il cursore passa sull’avatar.
   */
  var headerMenusMutexWired = false;
  function ensureHeaderMenusMutex() {
    if (headerMenusMutexWired) return;
    headerMenusMutexWired = true;

    function notifDropdownIsOpen() {
      try {
        var n = document.getElementById("vc-notif-dropdown");
        return Boolean(n && n.open);
      } catch (e) {
        return false;
      }
    }

    document.addEventListener(
      "toggle",
      function (ev) {
        var t = ev.target;
        if (!t || t.id !== "vc-notif-dropdown") return;
        if (t.open) {
          closeVcAccountMenu();
          closeVcHeaderSnavDetails();
          try {
            document.documentElement.classList.add("vc-notif-dropdown-open");
          } catch (e1) {}
        } else {
          try {
            document.documentElement.classList.remove("vc-notif-dropdown-open");
          } catch (e2) {}
        }
      },
      true,
    );

    document.addEventListener(
      "pointerover",
      function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var menu = t.closest(".discord-account-menu");
        if (!menu) return;
        var related = ev.relatedTarget;
        if (related && menu.contains(related)) return;
        // Se le notifiche sono aperte (click), restano aperte finché non si clicca fuori / sull’account.
        if (notifDropdownIsOpen()) return;
        closeVcHeaderSnavDetails();
        try {
          document.documentElement.classList.add("vc-header-account-open");
        } catch (e3) {}
      },
      true,
    );

    document.addEventListener(
      "pointerout",
      function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var menu = t.closest(".discord-account-menu");
        if (!menu) return;
        var related = ev.relatedTarget;
        if (related && menu.contains(related)) return;
        try {
          document.documentElement.classList.remove("vc-header-account-open");
        } catch (e4) {}
      },
      true,
    );

    document.addEventListener(
      "focusin",
      function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (!t.closest(".discord-account-menu")) return;
        if (notifDropdownIsOpen()) return;
        closeVcHeaderSnavDetails();
        try {
          document.documentElement.classList.add("vc-header-account-open");
        } catch (e5) {}
      },
      true,
    );

    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var profile = t.closest(".discord-profile-link, .discord-account-menu");
        if (!profile || !profile.closest || !profile.closest(".discord-account-menu")) return;
        // Click esplicito sull’account: chiudi notifiche e apri il menu account.
        if (!notifDropdownIsOpen()) return;
        closeVcNotifDropdown();
        try {
          document.documentElement.classList.add("vc-header-account-open");
        } catch (e6) {}
      },
      true,
    );
  }

  /** Header + CTA “Accedi con Discord”: più pulsanti sulla stessa pagina (es. accesso-richiesto). */
  var DISCORD_LOGIN_BTN_SELECTOR = "#discord-login-btn, button[data-vc-discord-login]";

  function queryDiscordLoginButtons() {
    try {
      return document.querySelectorAll(DISCORD_LOGIN_BTN_SELECTOR);
    } catch (e) {
      return [];
    }
  }

  function restoreDiscordLoginButtonVisual(btn) {
    if (!btn) return;
    try {
      btn.classList.remove("discord-login-btn--loading");
      btn.removeAttribute("aria-busy");
      var def = btn.getAttribute("data-vc-login-default-html");
      if (def != null) btn.innerHTML = def;
    } catch (e) {}
  }

  function sessionPath() {
    return String(location.pathname || "").replace(/\/+$/, "") || "/";
  }

  function isStandalonePwa() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e) {}
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (e2) {}
    return Boolean(navigator.standalone);
  }

  function isBlockingSessionVerifyPage() {
    try {
      if (isStandalonePwa()) return false;
      if (!window.__VC_REQUIRE_BLOCKING_SESSION_VERIFY) return false;
      var p = sessionPath();
      if (p.indexOf("/dashboard") === 0) return true;
      if (p.indexOf("/staff") === 0) return true;
      if (p === "/tickets" || p.indexOf("/tickets/") === 0) return true;
      if (p.indexOf("/accesso-richiesto") !== -1) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function ensureSessionVerifyOverlay() {
    var el = byId(SESSION_OVERLAY_ID);
    if (el) return el;
    el = document.createElement("div");
    el.id = SESSION_OVERLAY_ID;
    el.className = "vc-session-verify-overlay";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-busy", "true");
    el.innerHTML =
      '<div class="vc-session-verify-inner">' +
      '<span class="vc-session-verify-spinner" aria-hidden="true"></span>' +
      '<p class="vc-session-verify-text">Verifica sessione in corso...</p>' +
      "</div>";
    document.body.appendChild(el);
    return el;
  }

  function showSessionVerifyOverlay() {
    if (!isBlockingSessionVerifyPage()) {
      forceUnlockSessionVerifyUi();
      return;
    }
    var el = ensureSessionVerifyOverlay();
    try {
      document.documentElement.classList.remove("vc-session-verify-pending");
    } catch (e) {}
    el.classList.remove("vc-session-verify-overlay--hidden");
    el.setAttribute("aria-busy", "true");
    armSessionVerifyWatchdog();
  }

  function hideSessionVerifyOverlay() {
    clearSessionVerifyWatchdog();
    try {
      document.documentElement.classList.remove("vc-session-verify-pending");
    } catch (e0) {}
    var el = byId(SESSION_OVERLAY_ID);
    if (!el) {
      resetScrollAfterSessionOverlay();
      return;
    }
    el.classList.add("vc-session-verify-overlay--hidden");
    el.setAttribute("aria-busy", "false");
    try {
      if (el.parentNode) el.parentNode.removeChild(el);
    } catch (eRm) {}
    resetScrollAfterSessionOverlay();
  }

  function escAttr(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function normalizeReturnPath(stateRaw) {
    var s = String(stateRaw == null ? "" : stateRaw).trim();
    if (!s) return "";
    try {
      s = decodeURIComponent(s);
    } catch (e) {
      return "";
    }
    if (s.indexOf("://") !== -1) return "";
    if (!s.startsWith("/")) return "";
    if (s.startsWith("//")) return "";
    if (s.indexOf("\0") !== -1) return "";
    return s;
  }

  function randomHex(bytes) {
    var b = Math.max(8, Number(bytes) || 16);
    var arr = new Uint8Array(b);
    try {
      if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        window.crypto.getRandomValues(arr);
      } else {
        throw new Error("no_crypto");
      }
    } catch (e) {
      for (var i = 0; i < b; i += 1) arr[i] = Math.floor(Math.random() * 256);
    }
    var out = "";
    for (var j = 0; j < arr.length; j += 1) {
      out += arr[j].toString(16).padStart(2, "0");
    }
    return out;
  }

  function buildOAuthState(path) {
    var returnPath = normalizeReturnPath(path) || "/";
    var nonce = randomHex(16);
    var payload = JSON.stringify({ r: returnPath, n: nonce, t: Date.now() });
    try {
      sessionStorage.setItem(OAUTH_STATE_NONCE_KEY, nonce);
    } catch (e) {}
    try {
      return encodeURIComponent(payload);
    } catch (e2) {
      return encodeURIComponent(JSON.stringify({ r: returnPath }));
    }
  }

  function parseOAuthState(stateRaw) {
    var out = { returnPath: "", validNonce: false };
    var s = String(stateRaw == null ? "" : stateRaw).trim();
    if (!s) return out;
    try {
      var decoded = decodeURIComponent(s);
      var obj = JSON.parse(decoded);
      var rp = normalizeReturnPath(obj && obj.r);
      if (rp) out.returnPath = rp;
      var n = String(obj && obj.n || "").trim();
      var ts = Number(obj && obj.t || 0);
      var expected = "";
      try {
        expected = String(sessionStorage.getItem(OAUTH_STATE_NONCE_KEY) || "").trim();
        sessionStorage.removeItem(OAUTH_STATE_NONCE_KEY);
      } catch (e0) {}
      out.validNonce = Boolean(expected) && Boolean(n) && n === expected;
      if (!out.validNonce && !expected && out.returnPath && Number.isFinite(ts) && Math.abs(Date.now() - ts) <= 30 * 60 * 1000) {
        out.validNonce = true;
      }
      return out;
    } catch (e) {
      out.returnPath = normalizeReturnPath(s);
      return out;
    }
  }

  function currentPathPlusQuery() {
    try {
      var path = String(window.location.pathname || "");
      if (!path) path = "/";
      var q = String(window.location.search || "");
      return path + q;
    } catch (e2) {
      return "/";
    }
  }

  function parseHashToken() {
    var h = window.location.hash || "";
    if (!h || h.indexOf("access_token=") === -1) {
      return { token: "", freshLogin: false, returnPath: "" };
    }
    var p = new URLSearchParams(h.slice(1));
    var t = p.get("access_token");
    var stateParsed = parseOAuthState(p.get("state"));
    var returnPath = stateParsed.returnPath;
    if (!returnPath && t) {
      try {
        returnPath = normalizeReturnPath(sessionStorage.getItem(OAUTH_PENDING_RETURN_KEY));
      } catch (eS) {}
    }
    if (!t) return { token: "", freshLogin: false, returnPath: "" };
    if (!stateParsed.validNonce) {
      var pendingReturn = "";
      try {
        pendingReturn = normalizeReturnPath(sessionStorage.getItem(OAUTH_PENDING_RETURN_KEY));
      } catch (ePr) {}
      if (pendingReturn) {
        if (!returnPath) returnPath = pendingReturn;
        stateParsed.validNonce = true;
      }
    }
    if (!stateParsed.validNonce) return { token: "", freshLogin: false, returnPath: "", stateMismatch: true };
    try {
      sessionStorage.removeItem(OAUTH_PENDING_RETURN_KEY);
    } catch (eR) {}
    var expiresInSec = Number(p.get("expires_in") || "0");
    var exp =
      expiresInSec > 0
        ? Date.now() + Math.min(SITE_SESSION_TTL_MS, Math.max(60_000, expiresInSec * 1000))
        : Date.now() + SITE_SESSION_TTL_MS;
    localStorage.setItem(ACCESS_TOKEN_KEY, t);
    localStorage.setItem(EXPIRES_AT_KEY, String(exp));
    syncTokenToServiceWorker(t);
    try {
      var scopeRaw = String(p.get("scope") || "").trim();
      if (scopeRaw) localStorage.setItem(OAUTH_SCOPES_KEY, scopeRaw);
    } catch (eSc) {}
    if (history && history.replaceState) {
      history.replaceState({}, document.title, window.location.pathname + window.location.search);
    }
    return { token: t, freshLogin: true, returnPath: returnPath };
  }

  function getToken() {
    var t = localStorage.getItem(ACCESS_TOKEN_KEY);
    var exp = Number(localStorage.getItem(EXPIRES_AT_KEY) || "0");
    if (!t) return "";
    // Sessioni legacy senza expires_at: non forzare logout.
    if (exp && Date.now() >= exp) return "";
    return t;
  }

  function clearToken() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    try {
      localStorage.removeItem(OAUTH_SCOPES_KEY);
      sessionStorage.removeItem(ME_CACHE_KEY);
      sessionStorage.removeItem("vc_menu_staff_v1");
      sessionStorage.removeItem("vc_menu_dash_v1");
      sessionStorage.removeItem("vc_server_avatar_v1");
    } catch (eCt) {}
    syncTokenToServiceWorker("");
  }

  try {
    window.__vcDiscordGetAccessToken = getToken;
    window.__vcDiscordClearToken = clearToken;
    window.__vcDiscordTokenHasScope = tokenHasOAuthScope;
    window.__vcDiscordGetStoredScopes = getStoredOAuthScopes;
    window.__vcDiscordHasCommandPermissionsScope = hasCommandPermissionsScope;
    window.__vcDiscordReauthorizeForCommandPermissions = reauthorizeForCommandPermissions;
  } catch (eGt) {}

  function syncTokenToServiceWorker(token) {
    try {
      if (!("serviceWorker" in navigator)) return;
      var payload = { type: "vc:sw-auth", token: String(token || "") };
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(payload);
        return;
      }
      navigator.serviceWorker.ready
        .then(function () {
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage(payload);
          }
        })
        .catch(function () {});
    } catch (eSw) {}
  }
  try {
    syncTokenToServiceWorker(getToken());
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        syncTokenToServiceWorker(getToken());
      });
    }
  } catch (eBootSw) {}

  function resolveOAuthScopes() {
    var c = cfg();
    var fromCfg = String(c.scopes || c.oauthScopes || "").trim();
    if (fromCfg) return fromCfg;
    return "identify";
  }

  function getStoredOAuthScopes() {
    try {
      return String(localStorage.getItem(OAUTH_SCOPES_KEY) || "").trim();
    } catch (e) {
      return "";
    }
  }

  function tokenHasOAuthScope(scopeName) {
    var need = String(scopeName || "").trim().toLowerCase();
    if (!need) return true;
    var stored = getStoredOAuthScopes().toLowerCase();
    if (!stored) return need === "identify";
    return stored.split(/\s+/).indexOf(need) !== -1;
  }

  function resolveOAuthRedirectUri() {
    var c = cfg();
    var fromCfg = String(c.redirectUri || "").trim();
    if (fromCfg) return fromCfg;
    var home = String(c.homeUrl || "").trim();
    if (/^https?:\/\//i.test(home)) return home.endsWith("/") ? home : home + "/";
    try {
      return new URL("/", window.location.origin).href;
    } catch (e) {
      return window.location.origin + "/";
    }
  }

  function authUrl(options) {
    var opts = options && typeof options === "object" ? options : {};
    var c = cfg();
    var clientId = String(c.clientId || "").trim();
    if (!clientId) return "";
    var redirect = resolveOAuthRedirectUri();
    var q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: "token",
      scope: String(opts.scopes || resolveOAuthScopes()).trim() || "identify",
    });
    q.set("state", buildOAuthState(currentPathPlusQuery() || "/"));
    // Senza prompt=consent Discord spesso riusa l’auth vecchia e non aggiunge i nuovi scope.
    if (opts.prompt) q.set("prompt", String(opts.prompt));
    return "https://discord.com/oauth2/authorize?" + q.toString();
  }

  var CMD_PERMS_SCOPE = "applications.commands.permissions.update";

  function hasCommandPermissionsScope() {
    return tokenHasOAuthScope(CMD_PERMS_SCOPE);
  }

  /** Logout + OAuth con consent obbligatorio (serve per sync permessi slash). */
  function reauthorizeForCommandPermissions(visualBtn) {
    clearToken();
    startDiscordOAuthFromUserGesture(
      visualBtn || null,
      authUrl({
        prompt: "consent",
        scopes: "identify guilds " + CMD_PERMS_SCOPE,
      }),
    );
  }

  function avatarUrl(u) {
    if (!u || !u.id || !u.avatar) return "";
    var ext = String(u.avatar).indexOf("a_") === 0 ? "gif" : "png";
    return "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + "." + ext + "?size=64";
  }

  function resolveRankCardApiUrl() {
    var cfgRank = (typeof window !== "undefined" && window.__VC_SITE_RANK_CARD) || {};
    var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    var raw = String((isLocal && cfgRank.apiUrlLocal) ? cfgRank.apiUrlLocal : (cfgRank.apiUrl || "")).trim();
    if (raw) return raw;
    return "/webhooks/site-rank-card";
  }

  function menuTokenFp(token) {
    return String(token || "").slice(0, 24);
  }

  function readMenuCache(key, token, maxAgeMs) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.fp !== menuTokenFp(token)) return null;
      if (Date.now() - Number(data.at || 0) > (maxAgeMs || 300000)) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function writeMenuCache(key, token, payload) {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify(Object.assign({}, payload, { fp: menuTokenFp(token), at: Date.now() })),
      );
    } catch (e) {}
  }

  function readGateStaffAllowed(token) {
    try {
      var raw = sessionStorage.getItem("vc_staff_access_ok_v2") || localStorage.getItem("vc_staff_access_ok_v2_local");
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.ok !== true) return null;
      if (Number(data.exp || 0) <= Date.now()) return null;
      return true;
    } catch (e) {
      return null;
    }
  }

  function readGateDashAllowed(token) {
    try {
      var raw = sessionStorage.getItem("vc_dash_access_ok_v1");
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !(data.ok === true || data.allowed === true)) return null;
      if (Number(data.exp || 0) <= Date.now()) return null;
      return { allowed: true, blacklisted: Boolean(data.blacklisted) };
    } catch (e) {
      return null;
    }
  }

  async function fetchServerAvatarUrl(accessToken) {
    if (window.__VC_DISABLE_RANK_CARD_FETCH === true) return "";
    var token = String(accessToken || "").trim();
    if (!token) return "";
    var cached = readMenuCache("vc_server_avatar_v1", token, 600000);
    if (cached && cached.url) return String(cached.url || "");
    try {
      var res = await fetch(resolveRankCardApiUrl() + (resolveRankCardApiUrl().indexOf("?") >= 0 ? "&" : "?") + "avatarOnly=1", {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      if (!res.ok) return "";
      var data = await res.json().catch(function () {
        return {};
      });
      var u = String(data && data.avatarUrl || "").trim();
      if (!/^https?:\/\//i.test(u)) return "";
      writeMenuCache("vc_server_avatar_v1", token, { url: u });
      return u;
    } catch (e) {
      return "";
    }
  }

  async function fetchDashboardMenuAccess(token) {
    var t = String(token || "").trim();
    if (!t) return { allowed: false, blacklisted: false };
    var cached = readMenuCache("vc_menu_dash_v1", t, 180000);
    if (cached) {
      return { allowed: Boolean(cached.allowed), blacklisted: Boolean(cached.blacklisted) };
    }
    var fromGate = readGateDashAllowed(t);
    if (fromGate) {
      writeMenuCache("vc_menu_dash_v1", t, fromGate);
      return fromGate;
    }
    try {
      var res = await fetch(dashboardApiBase() + "/access", {
        headers: { Authorization: "Bearer " + t },
        cache: "no-store",
      });
      if (!res.ok) return { allowed: false, blacklisted: false };
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data || data.ok !== true) return { allowed: false, blacklisted: false };
      var out = {
        allowed: Boolean(data.allowed),
        blacklisted: Boolean(data.blacklisted),
      };
      writeMenuCache("vc_menu_dash_v1", t, out);
      return out;
    } catch (e) {
      return { allowed: false, blacklisted: false };
    }
  }

  async function fetchStaffMenuAccess(token) {
    var t = String(token || "").trim();
    if (!t) return false;
    var cached = readMenuCache("vc_menu_staff_v1", t, 300000);
    if (cached) return Boolean(cached.allowed);
    if (readGateStaffAllowed(t) === true) {
      writeMenuCache("vc_menu_staff_v1", t, { allowed: true });
      return true;
    }
    try {
      var res = await fetch(staffApiBase(), {
        headers: { Authorization: "Bearer " + t },
        cache: "no-store",
      });
      if (!res.ok) return false;
      var data = await res.json().catch(function () {
        return {};
      });
      var allowed = Boolean(data && data.ok === true);
      writeMenuCache("vc_menu_staff_v1", t, { allowed: allowed });
      return allowed;
    } catch (e) {
      return false;
    }
  }

  function resolveAccountUserId(userId) {
    var id = String(userId || "").trim();
    if (/^\d{17,22}$/.test(id)) return id;
    try {
      var profile = window.__VC_DISCORD_PROFILE;
      var fromProfile = String(profile && profile.id || "").trim();
      if (/^\d{17,22}$/.test(fromProfile)) return fromProfile;
    } catch (eP) {}
    return "";
  }

  function profileHref(userId) {
    var id = resolveAccountUserId(userId);
    return id ? "/user/?id=" + encodeURIComponent(id) : "/user";
  }

  function isOwnProfileCurrent(userId) {
    var id = resolveAccountUserId(userId);
    if (!id) return false;
    try {
      var path = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
      if (path === "/user/personalizza" || path === "/user/customize" || path === "/user/custom") return false;
      var q = new URLSearchParams(window.location.search || "");
      var qid = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
      if (qid === id && (path === "/user" || path === "/users")) return true;
      var m = String(window.location.pathname || "").match(/^\/users?\/(\d{17,22})(?:\/|$)/i);
      if (m && String(m[1]) === id) return true;
    } catch (e) {}
    return false;
  }

  function dashboardPageHref() {
    var raw = String(cfg().dashboardUrl || "/dashboard/").trim() || "/dashboard/";
    if (!raw.endsWith("/")) raw += "/";
    return raw;
  }

  function staffPageHref() {
    return "/staff/";
  }

  function staffApiBase() {
    var isLocal = false;
    try {
      isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    } catch (e) {}
    var staffCfg = {};
    try {
      staffCfg = window.__VC_STAFF_ACCESS || {};
    } catch (e2) {}
    var raw = String(
      isLocal && staffCfg.apiUrlLocal ? staffCfg.apiUrlLocal : staffCfg.apiUrl || "",
    ).trim();
    return raw.replace(/\/+$/, "") || "/webhooks/site-staff-access";
  }

  function dashboardApiBase() {
    var c = cfg();
    var isLocal = false;
    try {
      isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    } catch (e) {}
    var siteDash = {};
    try {
      siteDash = window.__VC_SITE_DASHBOARD || {};
    } catch (e2) {}
    var raw = String(
      isLocal && (c.dashboardApiUrlLocal || siteDash.apiUrlLocal)
        ? c.dashboardApiUrlLocal || siteDash.apiUrlLocal
        : c.dashboardApiUrl || siteDash.apiUrl || "",
    ).trim();
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function isStaffContextPath() {
    try {
      var p = String(window.location.pathname || "").toLowerCase().replace(/\/+$/, "") || "/";
      return p === "/staff" || p.indexOf("/staff/") === 0;
    } catch (e) {
      return false;
    }
  }

  function isStaffAreaContextPath() {
    try {
      var p = String(window.location.pathname || "").toLowerCase().replace(/\/+$/, "") || "/";
      if (p === "/staff/profilo" || p.indexOf("/staff/profilo/") === 0) return false;
      if (p === "/staff/accesso-richiesto" || p.indexOf("/staff/accesso-richiesto/") === 0) return false;
      return p === "/staff" || p.indexOf("/staff/") === 0;
    } catch (e) {
      return false;
    }
  }

  function isDashboardContextPath() {
    try {
      var p = String(window.location.pathname || "").toLowerCase().replace(/\/+$/, "") || "/";
      if (p === "/dashboard/profilo" || p.indexOf("/dashboard/profilo/") === 0) return false;
      if (p === "/dashboard/transcript" || p.indexOf("/dashboard/transcript/") === 0) return false;
      return p === "/dashboard" || p.indexOf("/dashboard/") === 0;
    } catch (e) {
      return false;
    }
  }

  function isProfileContextPath() {
    try {
      var p = String(window.location.pathname || "").toLowerCase().replace(/\/+$/, "") || "/";
      if (p === "/staff/profilo" || p.indexOf("/staff/profilo/") === 0) return true;
      if (p === "/dashboard/profilo" || p.indexOf("/dashboard/profilo/") === 0) return true;
      if (p === "/dashboard/transcript" || p.indexOf("/dashboard/transcript/") === 0) return true;
      if (p === "/user" || p === "/user/customize" || p === "/user/personalizza" || p === "/user/custom") return true;
      return /^\/users\/\d{17,22}$/.test(p);
    } catch (e) {
      return false;
    }
  }

  function revealDashboardMenuItem(access) {
    var allowed = Boolean(access && access.allowed);
    var blacklisted = Boolean(access && access.blacklisted);
    window.__VC_DASHBOARD_MENU_ALLOWED = allowed;
    window.__VC_DASHBOARD_MENU_BLACKLISTED = blacklisted;
    var link = byId("discord-dashboard-link");
    if (link) {
      var labelEl = link.querySelector("span");
      if (blacklisted) {
        link.removeAttribute("hidden");
        link.classList.add("is-blacklisted");
        link.setAttribute("aria-disabled", "true");
        link.setAttribute("tabindex", "-1");
        link.removeAttribute("href");
        link.removeAttribute("aria-current");
        link.classList.remove("is-current");
        if (labelEl) labelEl.textContent = i18n("auth.dashboardBlacklisted", "Blacklistato");
        if (!link.__vcBlacklistBound) {
          link.__vcBlacklistBound = true;
          link.addEventListener("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
          });
        }
      } else if (allowed) {
        link.classList.remove("is-blacklisted");
        link.removeAttribute("aria-disabled");
        link.removeAttribute("tabindex");
        link.setAttribute("href", dashboardPageHref());
        if (labelEl) labelEl.textContent = i18n("auth.dashboard", "Dashboard");
        link.removeAttribute("hidden");
      } else {
        link.classList.remove("is-blacklisted");
        link.removeAttribute("aria-disabled");
        link.removeAttribute("tabindex");
        if (labelEl) labelEl.textContent = i18n("auth.dashboard", "Dashboard");
        link.setAttribute("hidden", "");
      }
    }
    try {
      if (typeof window.__vcMobileNavRebuild === "function") {
        window.__vcMobileNavRebuild();
      }
    } catch (eRebuild) {}
  }

  function revealStaffMenuItem(allowed) {
    window.__VC_STAFF_MENU_ALLOWED = Boolean(allowed);
    var link = byId("discord-staff-link");
    if (link) {
      if (allowed) {
        link.setAttribute("href", staffPageHref());
        link.removeAttribute("hidden");
      } else {
        link.setAttribute("hidden", "");
      }
    }
    try {
      if (typeof window.__vcMobileNavRebuild === "function") {
        window.__vcMobileNavRebuild();
      }
    } catch (eRebuild2) {}
  }

  /**
   * Navigazione OAuth nello stesso "tick" del gesto utente (tap).
   * Ritardi o click sintetici su elementi display:none (es. drawer mobile → header nascosto)
   * spezzano la user activation su Safari/iOS e il redirect a Discord non parte.
   */
  function startDiscordOAuthFromUserGesture(visualBtn, url) {
    var u = url || authUrl();
    if (!u) {
      if (window.VcDialog && typeof window.VcDialog.alert === "function") {
        void window.VcDialog.alert({
          title: "Configurazione mancante",
          message: "Configura discordOauth.clientId in site.config.json",
          danger: true,
          icon: "fa-exclamation-triangle",
        });
      } else {
        alert("Configura discordOauth.clientId in site.config.json");
      }
      return;
    }
    try {
      sessionStorage.setItem(OAUTH_PENDING_RETURN_KEY, currentPathPlusQuery() || "/");
    } catch (e0) {}
    if (visualBtn) {
      if (visualBtn.getAttribute("data-vc-login-default-html") == null) {
        visualBtn.setAttribute("data-vc-login-default-html", visualBtn.innerHTML);
      }
      visualBtn.classList.add("discord-login-btn--loading");
      visualBtn.setAttribute("aria-busy", "true");
      visualBtn.innerHTML =
        '<span class="discord-login-btn__spin" aria-hidden="true"></span>' +
        "<span>Accesso in corso...</span>";
    }
    try {
      if (typeof window.vcShowPageTransition === "function") {
        window.vcShowPageTransition("login");
      }
    } catch (e) {}
    var navigated = false;
    try {
      window.location.assign(u);
      navigated = true;
    } catch (e2) {
      try {
        window.location.href = u;
        navigated = true;
      } catch (e3) {}
    }
    if (!navigated && visualBtn) {
      restoreDiscordLoginButtonVisual(visualBtn);
    }
  }

  function startLoginTransition(loginBtn, url) {
    startDiscordOAuthFromUserGesture(loginBtn, url);
  }

  function emitProfile(user) {
    try {
      window.__VC_DISCORD_PROFILE = user || null;
      window.dispatchEvent(new CustomEvent("vc-discord-profile", { detail: { user: user || null } }));
    } catch (e) {}
    try {
      if (typeof window.__vcMobileNavRebuild === "function") {
        window.__vcMobileNavRebuild();
      }
    } catch (eRebuild) {}
  }

  function readOAuthLoginCount() {
    try {
      var n = parseInt(localStorage.getItem(OAUTH_LOGIN_COUNT_KEY) || "0", 10);
      return isFinite(n) && n >= 0 ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function bumpOAuthLoginCount() {
    var next = readOAuthLoginCount() + 1;
    try {
      localStorage.setItem(OAUTH_LOGIN_COUNT_KEY, String(next));
    } catch (e) {}
    return next;
  }

  function siteDisplayName() {
    try {
      var c = cfg();
      var n = String((c && c.siteName) || "").trim();
      if (n) return n;
    } catch (e) {}
    try {
      var t = String(document.title || "").trim();
      if (!t) return "il sito";
      var pipe = t.indexOf("|");
      if (pipe > 0) return t.slice(0, pipe).trim();
      var dash = t.indexOf(" - ");
      if (dash > 0) return t.slice(0, dash).trim();
      return t;
    } catch (e2) {
      return "il sito";
    }
  }

  function resolveHomeUrl() {
    try {
      var c = cfg();
      var u = String((c && c.homeUrl) || "").trim();
      if (u) {
        if (u.charAt(0) === "/" && u.indexOf("//") === -1) {
          try {
            return new URL(u, window.location.origin).href;
          } catch (e0) {
            return u;
          }
        }
        return u;
      }
    } catch (e) {}
    try {
      return new URL("/", window.location.origin).href;
    } catch (e2) {
      return "/";
    }
  }

  function queueLoginWelcomeNotification(user) {
    var countBefore = readOAuthLoginCount();
    var displayName = String((user && user.username) || "utente").trim() || "utente";
    var site = siteDisplayName();
    var home = resolveHomeUrl();
    var notifId = countBefore >= 1 ? "sys:login_return" : "sys:login_welcome";
    var payload =
      countBefore >= 1
        ? {
          id: notifId,
          title: i18n("notif.loginOk", "Login effettuato con successo!"),
          body: "Bentornato " + displayName + "! Sei ora connesso a " + site + ".",
          kind: "success",
          at: Date.now(),
          openUrl: home,
          userId: String((user && user.id) || ""),
        }
        : {
          id: notifId,
          title: "Benvenut*",
          body:
            "Ciao " +
            displayName +
            "! Benvenut* su " +
            site +
            ": il login con Discord è andato a buon fine. Da qui puoi esplorare il sito e le funzioni riservate agli utenti collegati.",
          kind: "success",
          at: Date.now(),
          openUrl: home,
          userId: String((user && user.id) || ""),
        };
    bumpOAuthLoginCount();
    if (window.vcNotify && typeof window.vcNotify.add === "function") {
      window.vcNotify.add(payload);
      return;
    }
    try {
      localStorage.setItem(PENDING_LOGIN_NOTIF_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function renderLoggedOut() {
    try {
      document.documentElement.classList.remove("vc-session-verify-pending");
    } catch (e) {}
    hideSessionVerifyOverlay();
    var loginBtns = queryDiscordLoginButtons();
    for (var li = 0; li < loginBtns.length; li += 1) {
      loginBtns[li].hidden = false;
    }
    var state = byId("discord-login-state");
    if (state) {
      state.hidden = true;
      state.innerHTML = "";
    }
    emitProfile(null);
  }

  /** Token presente ma @me ancora in corso: nasconde Login subito (niente flash “logged out”). */
  function renderAuthPendingShell() {
    var loginBtns = queryDiscordLoginButtons();
    for (var li = 0; li < loginBtns.length; li += 1) {
      loginBtns[li].hidden = true;
    }
    var state = byId("discord-login-state");
    if (!state) return;
    state.hidden = false;
    if (state.querySelector(".discord-login-row:not(.vc-auth-pending-shell)")) return;
    state.innerHTML =
      '<div class="discord-login-row vc-auth-pending-shell" aria-busy="true" title="' +
      escAttr(i18n("auth.sessionChecking", "Verifica sessione…")) +
      '">' +
      '<span class="discord-avatar-clip">' +
      '<span class="discord-avatar-img discord-avatar-img--fallback" aria-hidden="true">' +
      '<span class="vc-ui-spinner" aria-hidden="true"></span>' +
      "</span></span></div>";
  }

  function postOAuthAccessoRedirectPath() {
    try {
      var p = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
      if (p.endsWith("/appelli/accesso-richiesto") || p.endsWith("/unban/accesso-richiesto")) {
        try {
          var fromUnban = String(new URLSearchParams(window.location.search || "").get("from") || "").trim();
          if (fromUnban) {
            fromUnban = fromUnban.replace(/^\/unban(\/|\?|$)/i, "/appelli$1");
          }
          if (
            fromUnban &&
            fromUnban.charAt(0) === "/" &&
            /^\/appelli(\/|$|\?)/i.test(fromUnban) &&
            fromUnban.indexOf("//") === -1 &&
            fromUnban.indexOf("/accesso-richiesto") === -1
          ) {
            return fromUnban;
          }
        } catch (eFromUnban) {}
        return "/appelli/";
      }
      if (p.endsWith("/candidature/accesso-richiesto")) return "/candidature/";
      if (p.endsWith("/seratafilm/accesso-richiesto")) {
        try {
          var from = String(new URLSearchParams(window.location.search || "").get("from") || "").trim();
          if (from && from.charAt(0) === "/" && /^\/seratafilm(\/|$)/i.test(from) && from.indexOf("//") === -1) {
            return from;
          }
        } catch (eFrom) {}
        return "/seratafilm/";
      }
      if (p.endsWith("/staff/accesso-richiesto")) {
        try {
          if (sessionStorage.getItem("vc_staff_oauth_invalid") === "1") return "";
          var qsStaff = new URLSearchParams(window.location.search || "");
          if (qsStaff.get("reason") === "denied" || qsStaff.get("stay") === "1") return "";
        } catch (eGuardStaff) {}
        try {
          var fromStaff = String(new URLSearchParams(window.location.search || "").get("from") || "").trim();
          if (
            fromStaff &&
            fromStaff.charAt(0) === "/" &&
            /^\/staff(\/|$|\?)/i.test(fromStaff) &&
            fromStaff.indexOf("//") === -1 &&
            fromStaff.indexOf("/accesso-richiesto") === -1
          ) {
            return fromStaff;
          }
        } catch (eFromStaff) {}
        return "/staff/";
      }
    } catch (e) {}
    return "";
  }

  function renderLoggedIn(user) {
    hideSessionVerifyOverlay();
    try {
      if (sessionStorage.getItem("vc_staff_oauth_invalid") === "1") {
        clearToken();
        sessionStorage.removeItem("vc_staff_oauth_invalid");
        renderLoggedOut();
        return;
      }
    } catch (eInv) {}
    var jump = postOAuthAccessoRedirectPath();
    if (jump) {
      try {
        window.location.replace(jump);
      } catch (e2) {
        window.location.href = jump;
      }
      return;
    }
    var loginBtns = queryDiscordLoginButtons();
    var state = byId("discord-login-state");
    if (!state) return;
    for (var lj = 0; lj < loginBtns.length; lj += 1) {
      loginBtns[lj].hidden = true;
    }
    var name = String(user.username || "Utente").trim() || "Utente";
    var img = avatarUrl(user);
    var label = escAttr(name);
    var href = escAttr(profileHref(user && user.id));
    var dashHref = escAttr(dashboardPageHref());
    var staffHref = escAttr(staffPageHref());
    var isProfileCurrent = isOwnProfileCurrent(user && user.id);
    var isDashCurrent = isDashboardContextPath();
    var isStaffAreaCurrent = isStaffAreaContextPath();
    var avatarVisual = img
      ? '<img class="discord-avatar-img" src="' +
        img +
        '" alt="" width="38" height="38" decoding="async" aria-label="' +
        label +
        '">'
      : '<span class="discord-avatar-img discord-avatar-img--fallback" aria-label="' +
        label +
        '"><i class="fa fa-user" aria-hidden="true"></i></span>';
    var accountMenuBlock =
      '<div class="discord-account-menu">' +
      '<button type="button" class="discord-profile-link" aria-label="' +
      escAttr(i18n("auth.accountMenu", "Menu account")) +
      " " +
      label +
      '" aria-haspopup="true">' +
      '<span class="discord-avatar-clip">' +
      avatarVisual +
      "</span>" +
      "</button>" +
      '<div class="discord-account-popover" role="menu">' +
      '<div class="discord-account-popover__head"><span class="discord-account-popover__avatar">' +
      avatarVisual +
      '</span><span class="discord-account-popover__name">' +
      label +
      "</span></div>" +
      '<div class="discord-account-popover__nav" role="none">' +
      '<a id="discord-profile-menu-link" class="discord-account-popover__item' +
      (isProfileCurrent ? " is-current" : "") +
      '" role="menuitem" href="' +
      href +
      '"' +
      (isProfileCurrent ? ' aria-current="page"' : "") +
      '"><i class="fa fa-user-o" aria-hidden="true"></i><span>' +
      escAttr(i18n("auth.profile", "Vai al profilo")) +
      "</span></a>" +
      '<a id="discord-dashboard-link" class="discord-account-popover__item' +
      (isDashCurrent ? " is-current" : "") +
      '" role="menuitem" href="' +
      dashHref +
      '"' +
      (isDashCurrent ? ' aria-current="page"' : "") +
      ' hidden><i class="fa fa-server" aria-hidden="true"></i><span>' +
      escAttr(i18n("auth.dashboard", "Dashboard")) +
      "</span></a>" +
      '<a id="discord-staff-link" class="discord-account-popover__item' +
      (isStaffAreaCurrent ? " is-current" : "") +
      '" role="menuitem" href="' +
      staffHref +
      '"' +
      (isStaffAreaCurrent ? ' aria-current="page"' : "") +
      ' hidden><i class="fa fa-shield" aria-hidden="true"></i><span>' +
      escAttr(i18n("auth.staffArea", "Area Staff")) +
      "</span></a>" +
      '<button type="button" class="discord-account-popover__item discord-account-popover__item--danger" role="menuitem" id="discord-logout-btn"><i class="fa fa-sign-out" aria-hidden="true"></i><span>' +
      escAttr(i18n("auth.logout", "Logout")) +
      "</span></button>" +
      "</div>" +
      "</div>" +
      "</div>";
    state.innerHTML =
      '<div class="discord-login-row discord-login-row--profile">' +
      accountMenuBlock +
      "</div>";
    state.hidden = false;
    ensureHeaderMenusMutex();
    var out = byId("discord-logout-btn");
    if (out) {
      out.addEventListener("click", function () {
        clearToken();
        renderLoggedOut();
      });
    }
    var token = getToken();
    fetchDashboardMenuAccess(token).then(function (allowed) {
      revealDashboardMenuItem(allowed);
    });
    fetchStaffMenuAccess(token).then(function (allowed) {
      revealStaffMenuItem(allowed);
    });
    var applyServerAvatar = function (serverAvatar) {
      if (!serverAvatar) return;
      try {
        var clips = state.querySelectorAll(".discord-avatar-clip, .discord-account-popover__avatar");
        for (var i = 0; i < clips.length; i += 1) {
          var el = clips[i];
          if (!el) continue;
          var currentImg = el.querySelector("img.discord-avatar-img");
          if (currentImg) {
            currentImg.src = serverAvatar;
            continue;
          }
          el.innerHTML =
            '<img class="discord-avatar-img" src="' +
            serverAvatar +
            '" alt="" width="38" height="38" decoding="async" aria-label="' +
            label +
            '">';
        }
      } catch (e) {}
    };
    var runAvatar = function () {
      fetchServerAvatarUrl(token).then(applyServerAvatar);
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(runAvatar, { timeout: 2500 });
    } else {
      window.setTimeout(runAvatar, 400);
    }
    emitProfile(user);
  }

  function discordSessionFingerprint(token) {
    var exp = "";
    try {
      exp = String(localStorage.getItem(EXPIRES_AT_KEY) || "");
    } catch (eFp) {}
    return exp + "|" + String(token || "").slice(0, 32);
  }

  function readCachedDiscordMe(token) {
    var fp = discordSessionFingerprint(token);
    if (!String(token || "").trim() || fp.length < 3) return null;
    try {
      var raw = sessionStorage.getItem(ME_CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || o.v !== 1 || !o.user || String(o.fp || "") !== fp) return null;
      var age = Date.now() - Number(o.at || 0);
      if (!isFinite(age) || age < 0 || age > 180000) return null;
      return o.user;
    } catch (eR) {
      return null;
    }
  }

  function writeCachedDiscordMe(token, user) {
    var fp = discordSessionFingerprint(token);
    try {
      sessionStorage.setItem(
        ME_CACHE_KEY,
        JSON.stringify({ v: 1, fp: fp, at: Date.now(), user: user }),
      );
    } catch (eW) {}
  }

  function fetchMe(token, timeoutMs) {
    var ms = Math.max(2500, Number(timeoutMs) || 8000);
    var ac = new AbortController();
    var tid = setTimeout(function () {
      try {
        ac.abort();
      } catch (eAb) {}
    }, ms);
    return fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: "Bearer " + String(token || "") },
      signal: ac.signal,
    })
      .then(function (r) {
        try {
          clearTimeout(tid);
        } catch (eCl) {}
        if (!r.ok) {
          var err = new Error(String(r.status));
          err.status = r.status;
          throw err;
        }
        return r.json();
      })
      .catch(function (e) {
        try {
          clearTimeout(tid);
        } catch (eCl2) {}
        if (e && e.name === "AbortError") {
          var te = new Error("timeout");
          te.name = "AbortError";
          throw te;
        }
        throw e;
      });
  }

  var SITE_VERIFY_DONE_PREFIX = "vc_site_verify_done_v1_";

  function readSiteVerifyGuildFromQuery() {
    try {
      var p = new URLSearchParams(window.location.search || "");
      var gid = String(p.get("siteVerifyGuild") || p.get("guildId") || "").trim();
      if (/^\d{17,22}$/.test(gid)) return gid;
    } catch (e) {}
    return "";
  }

  function clearSiteVerifyGuildQuery() {
    try {
      var u = new URL(window.location.href);
      u.searchParams.delete("siteVerifyGuild");
      u.searchParams.delete("guildId");
      history.replaceState({}, document.title, u.pathname + (u.search || "") + u.hash);
    } catch (e) {}
  }

  function maybeCompleteSiteVerify(token) {
    var gid = readSiteVerifyGuildFromQuery();
    if (!gid || !token) return Promise.resolve(null);
    var doneKey = SITE_VERIFY_DONE_PREFIX + gid;
    try {
      if (sessionStorage.getItem(doneKey) === "1") {
        clearSiteVerifyGuildQuery();
        return Promise.resolve(null);
      }
    } catch (e0) {}
    var ac = new AbortController();
    var tid = setTimeout(function () {
      try {
        ac.abort();
      } catch (eAb) {}
    }, 3500);
    return fetch("/webhooks/site-verify/complete", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ guildId: gid }),
      cache: "no-store",
      signal: ac.signal,
    })
      .then(function (res) {
        try {
          clearTimeout(tid);
        } catch (eCl) {}
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || !data || data.ok !== true) return null;
          try {
            sessionStorage.setItem(doneKey, "1");
          } catch (e1) {}
          clearSiteVerifyGuildQuery();
          if (window.vcNotify && typeof window.vcNotify.add === "function") {
            window.vcNotify.add({
              id: "sys:site_verify_" + gid,
              title: data.alreadyVerified ? "Già verificato" : "Verifica completata",
              body: String(data.message || "Verifica completata con successo."),
              kind: "success",
              at: Date.now(),
            });
          }
          return data;
        });
      })
      .catch(function () {
        try {
          clearTimeout(tid);
        } catch (eCl2) {}
        return null;
      });
  }

  function main() {
    var parsed = parseHashToken();
    if (parsed && parsed.stateMismatch) {
      try {
        clearToken();
      } catch (eSm) {}
      try {
        history.replaceState({}, document.title, window.location.pathname + window.location.search);
      } catch (eSm2) {}
    }
    var here = currentPathPlusQuery();
    var bounce =
      Boolean(parsed && parsed.token && parsed.returnPath) && parsed.returnPath !== here;
    if (bounce) {
      try {
        if (parsed.freshLogin) {
          sessionStorage.setItem(OAUTH_FRESH_AFTER_BOUNCE_KEY, "1");
        }
      } catch (e0) {}
      try {
        window.location.replace(window.location.origin + parsed.returnPath);
      } catch (e1) {
        window.location.href = window.location.origin + parsed.returnPath;
      }
      return;
    }
    var freshFromBounce = false;
    try {
      if (sessionStorage.getItem(OAUTH_FRESH_AFTER_BOUNCE_KEY) === "1") {
        freshFromBounce = true;
        sessionStorage.removeItem(OAUTH_FRESH_AFTER_BOUNCE_KEY);
      }
    } catch (e2) {}
    var freshLogin = Boolean(parsed && parsed.freshLogin) || freshFromBounce;
    var loginBtns = queryDiscordLoginButtons();
    for (var lk = 0; lk < loginBtns.length; lk += 1) {
      (function (btn) {
        btn.addEventListener("click", function () {
          startDiscordOAuthFromUserGesture(btn, authUrl());
        });
      })(loginBtns[lk]);
    }
    window.addEventListener(
      "pageshow",
      function (ev) {
        if (!isBlockingSessionVerifyPage()) forceUnlockSessionVerifyUi();
        if (!ev.persisted) return;
        try {
          var nodes = queryDiscordLoginButtons();
          for (var pr = 0; pr < nodes.length; pr += 1) {
            restoreDiscordLoginButtonVisual(nodes[pr]);
          }
        } catch (ePs) {}
      },
      false,
    );
    try {
      window.__vcDiscordStartOAuthRedirect = function (visualBtn) {
        startDiscordOAuthFromUserGesture(visualBtn || null, "");
      };
    } catch (eExp) {}
    var t = getToken();
    if (!t) {
      try {
        document.documentElement.classList.remove("vc-session-verify-pending");
      } catch (e2) {}
      renderLoggedOut();
      return;
    }
    var cached = readCachedDiscordMe(t);
    if (cached) {
      hideSessionVerifyOverlay();
      renderLoggedIn(cached);
      fetchMe(t)
        .then(function (user) {
          return maybeCompleteSiteVerify(t).then(function () {
            return user;
          });
        })
        .then(function (user) {
          writeCachedDiscordMe(t, user);
          if (freshLogin) queueLoginWelcomeNotification(user);
          try {
            var curId = String((window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) || "");
            if (!curId || curId !== String(user.id || "")) {
              renderLoggedIn(user);
            } else {
              emitProfile(user);
            }
          } catch (eBg) {
            renderLoggedIn(user);
          }
        })
        .catch(function (err) {
          var st = err && err.status;
          if (st === 401) {
            clearToken();
            renderLoggedOut();
          }
        });
      return;
    }
    // Cold open (es. link DM voti): niente cache sessionStorage → @me async.
    // Mostra subito shell account così non sembra logout fino al refresh.
    renderAuthPendingShell();
    showSessionVerifyOverlay();
    fetchMe(t)
      .then(function (user) {
        // Sblocca subito la UI: site-verify non deve tenere lo spinner a tutto schermo.
        hideSessionVerifyOverlay();
        writeCachedDiscordMe(t, user);
        renderLoggedIn(user);
        if (freshLogin) queueLoginWelcomeNotification(user);
        return maybeCompleteSiteVerify(t).then(function () {
          return user;
        });
      })
      .catch(function (err) {
        var st = err && err.status;
        if (st === 401) {
          clearToken();
          renderLoggedOut();
          return;
        }
        // Timeout/rete: NON cancellare il token (prima sembrava logout finché non ricaricavi).
        forceUnlockSessionVerifyUi();
        renderAuthPendingShell();
        setTimeout(function () {
          if (!getToken() || window.__VC_DISCORD_PROFILE) return;
          fetchMe(t, 5000)
            .then(function (user) {
              writeCachedDiscordMe(t, user);
              renderLoggedIn(user);
            })
            .catch(function (err2) {
              if (err2 && err2.status === 401) {
                clearToken();
                renderLoggedOut();
                return;
              }
              forceUnlockSessionVerifyUi();
            });
        }, 400);
      });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    try {
      if (getToken()) return;
      if (window.__VC_DISCORD_PROFILE) renderLoggedOut();
    } catch (eVis) {}
  });


  document.addEventListener("vc:langchange", function () {
    try {
      var profile = window.__VC_DISCORD_PROFILE;
      if (profile && profile.id) renderLoggedIn(profile);
    } catch (eLang) {}
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      ensureHeaderMenusMutex();
      main();
    });
  } else {
    ensureHeaderMenusMutex();
    main();
  }

  // Gate accesso centralizzato (tutto il sito): no-op sulle pagine pubbliche.
  (function bootVcAccessGate() {
    try {
      if (window.__VC_ACCESS_GATE_LOADED || window.__VC_ACCESS_GATE_BOOT) return;
      window.__VC_ACCESS_GATE_BOOT = true;
      var s = document.createElement("script");
      s.src = "/js/vc-access-gate.js?v=20260826localCache1";
      (document.head || document.documentElement).appendChild(s);
    } catch (eBoot) {}
  })();
})();
