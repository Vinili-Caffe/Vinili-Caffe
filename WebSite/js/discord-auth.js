(function () {
    try {
    var t = localStorage.getItem("vc_discord_access_token");
    if (t) {
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (!exp || Date.now() < exp) {
        document.documentElement.classList.add("vc-auth-session-pending");
      }
    }
  } catch (eBootCls) {}

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
    var OAUTH_PENDING_RETURN_KEY = "vc_oauth_pending_return_v1";
    var ME_CACHE_KEY = "vc_discord_me_cache_v1";
  var ME_LOCAL_CACHE_KEY = "vc_discord_me_cache_local_v1";
  var ME_SESSION_TTL_MS = 180000;
  var ME_LOCAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var UID_CACHE_KEY = "vc_discord_uid_v1";
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
    var SESSION_VERIFY_HARD_MS = (function () {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return 350;
      if (document.documentElement.classList.contains("vc-perf-lite")) return 350;
    } catch (eMs) {}
    return 500;
  })();
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
    var token = getToken();
    if (token) {
      try {
        var cachedUser = readCachedDiscordMe(token);
        if (cachedUser) {
          renderLoggedIn(cachedUser);
          return;
        }
        renderAuthPendingShell();
      } catch (eTok) {
        renderAuthPendingShell();
      }
      return;
    }
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
                if (notifDropdownIsOpen()) return;
        closeVcHeaderSnavDetails();
        try {
          document.documentElement.classList.add("vc-header-account-open");
        } catch (e3) {}
        kickAccountMenuPopoverAvatar();
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
        kickAccountMenuPopoverAvatar();
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
                if (!notifDropdownIsOpen()) return;
        closeVcNotifDropdown();
        try {
          document.documentElement.classList.add("vc-header-account-open");
        } catch (e6) {}
        kickAccountMenuPopoverAvatar();
      },
      true,
    );
  }

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
      try {
        if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return false;
      } catch (eCoarse) {}
      if (Number(navigator.maxTouchPoints || 0) > 0 && window.innerWidth && window.innerWidth <= 920) return false;
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
        if (exp && Date.now() >= exp) return "";
    return t;
  }

  function clearToken() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    try {
      localStorage.removeItem(OAUTH_SCOPES_KEY);
      sessionStorage.removeItem(ME_CACHE_KEY);
      localStorage.removeItem(ME_LOCAL_CACHE_KEY);
      sessionStorage.removeItem("vc_menu_staff_v1");
      localStorage.removeItem("vc_menu_staff_local_v1");
      sessionStorage.removeItem("vc_menu_dash_v1");
      localStorage.removeItem("vc_menu_dash_local_v1");
      sessionStorage.removeItem("vc_server_avatar_v1");
      sessionStorage.removeItem("vc_staff_access_ok_v2");
      localStorage.removeItem("vc_staff_access_ok_v2_local");
      try {
        window.__VC_STAFF_MENU_ALLOWED = false;
        window.__VC_STAFF_PERMS = null;
      } catch (eClrStaff) {}
      if (window.VcApiCache && typeof window.VcApiCache.invalidatePrefix === "function") {
        ["profile:", "chrome:", "avatar:", "feedback:", "suggestions:", "staff:"].forEach(function (prefix) {
          window.VcApiCache.invalidatePrefix(prefix);
        });
      }
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
        if (opts.prompt) q.set("prompt", String(opts.prompt));
    return "https://discord.com/oauth2/authorize?" + q.toString();
  }

  var CMD_PERMS_SCOPE = "applications.commands.permissions.update";

  function hasCommandPermissionsScope() {
    return tokenHasOAuthScope(CMD_PERMS_SCOPE);
  }

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
    if (!u || !u.id) return "";
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.buildFromUser === "function") {
        var built = window.VcDiscordAvatar.buildFromUser(u, 64);
        if (built) {
          try {
            if (
              window.matchMedia &&
              window.matchMedia("(pointer: coarse)").matches &&
              window.VcDiscordAvatar.preferStaticUrl
            ) {
              return window.VcDiscordAvatar.preferStaticUrl(built, 64) || built;
            }
          } catch (eMob) {}
          return built;
        }
      }
    } catch (eBuild) {}
    if (!u.avatar) return "";
    var ext = String(u.avatar).indexOf("a_") === 0 ? "gif" : "png";
    return "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + "." + ext + "?size=64";
  }

  function normalizeMenuAvatarSrc(url, user) {
    var raw = String(url || "").trim();
    if (!raw) return avatarUrl(user);
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.resolveUrl === "function") {
        return (
          window.VcDiscordAvatar.resolveUrl(raw, 64, user && user.avatar, user && user.id) || raw
        );
      }
    } catch (eNorm) {}
    return raw;
  }

  function buildMenuAvatarVisual(user, label, size) {
    var px = Math.max(16, Math.floor(Number(size) || 38));
    var img = avatarUrl(user);
    var labelEsc = escAttr(label);
    var hash = user && user.avatar ? escAttr(String(user.avatar)) : "";
    if (!img) {
      return (
        '<span class="discord-avatar-img discord-avatar-img--fallback" aria-label="' +
        labelEsc +
        '"><i class="fa fa-user" aria-hidden="true"></i></span>'
      );
    }
    return (
      '<img class="discord-avatar-img" data-vc-avatar="1"' +
      (hash ? ' data-avatar-hash="' + hash + '"' : "") +
      ' src="' +
      escAttr(img) +
      '" alt="" width="' +
      px +
      '" height="' +
      px +
      '" decoding="async" aria-label="' +
      labelEsc +
      '">'
    );
  }

  function applyAnimatedAvatarToImg(img, user) {
    if (!img || img.tagName !== "IMG") return;
    try {
      var hash = String((user && user.avatar) || img.getAttribute("data-avatar-hash") || "").trim();
      if (hash && !img.getAttribute("data-avatar-hash")) img.setAttribute("data-avatar-hash", hash);
      var next = normalizeMenuAvatarSrc(img.getAttribute("src") || img.src, user);
      if (next && next !== img.src) img.src = next;
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.applyToImage === "function") {
        window.VcDiscordAvatar.applyToImage(img, { force: true });
      }
    } catch (eApply) {}
  }

  function refreshAccountMenuAvatars(user, opts) {
    var onlyPopover = opts && opts.onlyPopover;
    var selector = onlyPopover
      ? ".discord-account-popover__avatar img.discord-avatar-img"
      : ".discord-account-menu img.discord-avatar-img";
    var imgs;
    try {
      imgs = document.querySelectorAll(selector);
    } catch (eSel) {
      return;
    }
    for (var i = 0; i < imgs.length; i += 1) {
      applyAnimatedAvatarToImg(imgs[i], user);
      if (
        onlyPopover &&
        window.VcDiscordAvatar &&
        typeof window.VcDiscordAvatar.restartAnimation === "function"
      ) {
        window.VcDiscordAvatar.restartAnimation(imgs[i]);
      }
    }
  }

  function kickAccountMenuPopoverAvatar() {
    var menu = document.querySelector(".discord-account-menu");
    var user = null;
    try {
      user = window.__VC_ACCOUNT_MENU_USER || null;
    } catch (eUser) {}
    refreshAccountMenuAvatars(user, { onlyPopover: true });
    if (!menu) return;
    window.requestAnimationFrame(function () {
      refreshAccountMenuAvatars(user, { onlyPopover: true });
    });
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
    if (key === "vc_menu_dash_v1") {
      try {
        localStorage.setItem(
          "vc_menu_dash_local_v1",
          JSON.stringify(Object.assign({}, payload, { fp: menuTokenFp(token), at: Date.now() })),
        );
      } catch (eLocal) {}
    }
        if (key === "vc_menu_staff_v1") {
      try {
        localStorage.setItem(
          "vc_menu_staff_local_v1",
          JSON.stringify(Object.assign({}, payload, { fp: menuTokenFp(token), at: Date.now() })),
        );
      } catch (eStaffLocal) {}
    }
  }

  function readMenuCacheWithLocal(key, localKey, token, sessionTtlMs, localTtlMs) {
    var fromSession = readMenuCache(key, token, sessionTtlMs);
    if (fromSession) return fromSession;
    try {
      var raw = localStorage.getItem(localKey);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.fp !== menuTokenFp(token)) return null;
      if (Date.now() - Number(data.at || 0) > (localTtlMs || 604800000)) return null;
      return data;
    } catch (eLocal) {
      return null;
    }
  }

  function readGateStaffAllowed(token) {
    try {
      var t = String(token || "").trim();
      if (!t) return null;
      var raw = sessionStorage.getItem("vc_staff_access_ok_v2") || localStorage.getItem("vc_staff_access_ok_v2_local");
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.ok !== true) return null;
      var fp = String(data.fp || "");
      if (fp && fp !== menuTokenFp(t) && fp !== discordSessionFingerprint(t)) return null;
      if (Number(data.exp || 0) <= Date.now()) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function writeGateStaffAllowed(token, perms) {
    try {
      var t = String(token || "").trim();
      if (!t) return;
      var now = Date.now();
      var entry = Object.assign({}, perms && typeof perms === "object" ? perms : {}, {
        ok: true,
        allowed: true,
        fp: discordSessionFingerprint(t) || menuTokenFp(t),
        savedAt: now,
        exp: now + 600000,
      });
      sessionStorage.setItem("vc_staff_access_ok_v2", JSON.stringify(entry));
      localStorage.setItem(
        "vc_staff_access_ok_v2_local",
        JSON.stringify(Object.assign({}, entry, { exp: now + 86400000 })),
      );
    } catch (eGateW) {}
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
    var apiUrl =
      resolveRankCardApiUrl() + (resolveRankCardApiUrl().indexOf("?") >= 0 ? "&" : "?") + "avatarOnly=1";
    try {
      var data = {};
      if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
        var cacheKey = window.VcApiCache.keyFor(apiUrl, { scope: "avatar", auth: token });
        var payload = await window.VcApiCache.fetchWithCache(cacheKey, apiUrl, {
          ttlMs: 600000,
          staleMs: 3600000,
          persistMs: 24 * 60 * 60 * 1000,
          fetchInit: {
            headers: { Authorization: "Bearer " + token },
            cache: "no-store",
          },
        });
        data = (payload && payload.body) || {};
      } else {
        var res = await fetch(apiUrl, {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
        });
        if (!res.ok) return "";
        data = await res.json().catch(function () {
          return {};
        });
      }
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
    if (!t) return { allowed: false, blacklisted: false, unchecked: true };
    var cached = readMenuCacheWithLocal("vc_menu_dash_v1", "vc_menu_dash_local_v1", t, 180000, 604800000);
    if (cached) {
      return { allowed: Boolean(cached.allowed), blacklisted: Boolean(cached.blacklisted), unchecked: false };
    }
    var fromGate = readGateDashAllowed(t);
    if (fromGate) {
      writeMenuCache("vc_menu_dash_v1", t, fromGate);
      return Object.assign({ unchecked: false }, fromGate);
    }
    try {
      var res = await fetch(dashboardApiBase() + "/access", {
        headers: { Authorization: "Bearer " + t },
        cache: "no-store",
      });
      if (!res.ok) return { allowed: false, blacklisted: false, unchecked: true };
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data || data.ok !== true) return { allowed: false, blacklisted: false, unchecked: true };
      var out = {
        allowed: Boolean(data.allowed),
        blacklisted: Boolean(data.blacklisted),
        unchecked: false,
      };
      writeMenuCache("vc_menu_dash_v1", t, out);
      return out;
    } catch (e) {
      return { allowed: false, blacklisted: false, unchecked: true };
    }
  }

  async function fetchStaffMenuAccess(token) {
    var t = String(token || "").trim();
    if (!t) return false;

    function applyAllowed(payload, writeCache) {
      if (payload && typeof payload === "object") {
        try {
          window.__VC_STAFF_PERMS = payload;
        } catch (ePerm) {}
      }
      try {
        window.__VC_STAFF_MENU_ALLOWED = true;
      } catch (eAllow) {}
      ensureStaffSiteNavScript();
      if (writeCache) {
        writeMenuCache("vc_menu_staff_v1", t, {
          allowed: true,
          payload: payload && payload.ok ? payload : null,
        });
        writeGateStaffAllowed(t, payload && payload.ok ? payload : null);
      }
      try {
        if (payload && payload.ok) {
          window.dispatchEvent(new CustomEvent("vc:staff-access-ok", { detail: { perms: payload } }));
        } else {
          window.dispatchEvent(new CustomEvent("vc:staff-access-ok", { detail: { perms: window.__VC_STAFF_PERMS || {} } }));
        }
      } catch (eEv) {}
    }

    function refreshPermsInBackground() {
      var refreshNow = Date.now();
      if (window.__vcStaffPermsBlockedUntil && refreshNow < window.__vcStaffPermsBlockedUntil) return;
      if (
        window.__vcStaffPermsRefreshAt &&
        refreshNow - window.__vcStaffPermsRefreshAt < 60000 &&
        window.__vcStaffPermsRefreshing
      ) {
        return;
      }
      if (window.__vcStaffPermsRefreshing) return;
      window.__vcStaffPermsRefreshing = true;
      window.__vcStaffPermsRefreshAt = refreshNow;
      var apiUrl = staffApiBase();
      var headers = { Authorization: "Bearer " + t };

      function finishStaffRefresh() {
        window.__vcStaffPermsRefreshing = false;
      }

      function handleStaffPayload(data, fromNetwork) {
        if (data && data.ok === true) {
          applyAllowed(data, true);
          return;
        }
        if (data && data.ok === false) {
          try {
            window.__VC_STAFF_MENU_ALLOWED = false;
            writeMenuCache("vc_menu_staff_v1", t, { allowed: false, payload: null });
            sessionStorage.removeItem("vc_staff_access_ok_v2");
            localStorage.removeItem("vc_staff_access_ok_v2_local");
          } catch (eDeny) {}
        }
      }

      function onStaffHttp(res, body) {
        if (res && res.status === 429) {
          window.__vcStaffPermsBlockedUntil = Date.now() + 90000;
          try {
            if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
              window.VcApiCache.noteWebhook429(0);
            }
          } catch (e429) {}
          return null;
        }
        if (res && res.ok && body && body.ok) return body;
        if (res && (res.status === 401 || res.status === 403)) {
          try {
            window.__VC_STAFF_MENU_ALLOWED = false;
            writeMenuCache("vc_menu_staff_v1", t, { allowed: false, payload: null });
            sessionStorage.removeItem("vc_staff_access_ok_v2");
            localStorage.removeItem("vc_staff_access_ok_v2_local");
          } catch (eDeny2) {}
        }
        return null;
      }

      if (window.VcApiCache && typeof window.VcApiCache.fetchStaffJson === "function") {
        window.VcApiCache
          .fetchStaffJson(apiUrl, { headers: headers, ttlMs: 45000, staleMs: 600000 })
          .then(function (out) {
            finishStaffRefresh();
            if (out && out.res && out.res.status === 429) {
              window.__vcStaffPermsBlockedUntil = Date.now() + 90000;
              return;
            }
            handleStaffPayload(out && out.data ? out.data : null, true);
          })
          .catch(function () {
            finishStaffRefresh();
          });
        return;
      }

      var pref = window.__VC_STAFF_ACCESS_PREFETCH;
      var req =
        pref && typeof pref.then === "function"
          ? Promise.resolve(pref)
          : fetch(apiUrl, {
              headers: headers,
              cache: "no-store",
            }).then(function (res) {
              return res
                .json()
                .catch(function () {
                  return {};
                })
                .then(function (body) {
                  return onStaffHttp(res, body);
                });
            });
      Promise.resolve(req)
        .then(function (data) {
          finishStaffRefresh();
          if (data && data.ok === true) {
            applyAllowed(data, true);
            return;
          }
          if (data && data.ok === false) {
            handleStaffPayload(data, true);
            return;
          }
          if (pref && data == null) return;
        })
        .catch(function () {
          finishStaffRefresh();
        });
    }

        var cached = readMenuCacheWithLocal("vc_menu_staff_v1", "vc_menu_staff_local_v1", t, 600000, 86400000);
    if (cached && cached.allowed) {
      applyAllowed(cached.payload || null, false);
      refreshPermsInBackground();
      return true;
    }
    var gateBlob = readGateStaffAllowed(t);
    if (gateBlob || window.__VC_STAFF_MENU_ALLOWED === true) {
      applyAllowed(
        (gateBlob && typeof gateBlob === "object" ? gateBlob : null) || window.__VC_STAFF_PERMS || null,
        false,
      );
      refreshPermsInBackground();
      return true;
    }

        var pref = window.__VC_STAFF_ACCESS_PREFETCH;
    if (pref && typeof pref.then === "function") {
      try {
        var preData = await Promise.resolve(pref);
        if (preData && preData.ok === true) {
          applyAllowed(preData, true);
          return true;
        }
      } catch (ePref) {}
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
      if (allowed) applyAllowed(data, true);
      else writeMenuCache("vc_menu_staff_v1", t, { allowed: false, payload: null });
      return allowed;
    } catch (e) {
      return false;
    }
  }

  function ensureStaffSiteNavScript() {
    try {
      if (document.querySelector('script[data-vc-staff-site-nav="1"]')) {
        window.__vcStaffSiteNavRequested = true;
        if (window.__VC_STAFF_MENU_ALLOWED && !window.__vcStaffNavWarmEvented) {
          window.__vcStaffNavWarmEvented = true;
          try {
            window.dispatchEvent(
              new CustomEvent("vc:staff-access-ok", { detail: { perms: window.__VC_STAFF_PERMS || {} } }),
            );
          } catch (eBoot) {}
        }
        return;
      }
    } catch (eQ) {}
    if (window.__vcStaffSiteNavRequested) return;
    window.__vcStaffSiteNavRequested = true;
    try {
      var s = document.createElement("script");
      s.src = "/js/staff-site-nav.js?v=20260830staffGuidaOnly1";
            s.async = false;
      s.setAttribute("data-vc-staff-site-nav", "1");
      (document.head || document.documentElement).appendChild(s);
    } catch (eNav) {}
  }

    function warmDashboardNavEarly() {
    try {
      var t = getToken();
      if (!t) return false;
      if (window.__VC_DASHBOARD_MENU_BLACKLISTED === true) return false;
      if (window.__VC_DASHBOARD_MENU_ALLOWED === true || window.__VC_DASHBOARD_ACCESS_OK === true) return true;
      var cached = readMenuCacheWithLocal("vc_menu_dash_v1", "vc_menu_dash_local_v1", t, 180000, 604800000);
      var gate = readGateDashAllowed(t);
      var access = null;
      if (cached) {
        access = { allowed: Boolean(cached.allowed), blacklisted: Boolean(cached.blacklisted) };
      } else if (gate) {
        access = gate;
      }
      if (!access) return false;
      revealDashboardMenuItem(access);
      return Boolean(access.allowed);
    } catch (eWarmDash) {
      return false;
    }
  }

    function warmStaffNavEarly() {
    try {
      var t = getToken();
      if (!t) return false;
      var cached = readMenuCacheWithLocal("vc_menu_staff_v1", "vc_menu_staff_local_v1", t, 600000, 86400000);
      var gate = readGateStaffAllowed(t);
      var already = window.__VC_STAFF_MENU_ALLOWED === true;
      if (!(cached && cached.allowed) && !gate && !already) return false;
      var payload =
        (cached && cached.payload) ||
        (gate && typeof gate === "object" ? gate : null) ||
        window.__VC_STAFF_PERMS ||
        null;
      if (payload) {
        try {
          window.__VC_STAFF_PERMS = payload;
        } catch (eP) {}
      }
      window.__VC_STAFF_MENU_ALLOWED = true;
      ensureStaffSiteNavScript();
      try {
        window.dispatchEvent(new CustomEvent("vc:staff-access-ok", { detail: { perms: payload || {} } }));
      } catch (eEv) {}
      return true;
    } catch (eWarm) {
      return false;
    }
  }

  function readCachedDiscordUid(token) {
    var fp = discordSessionFingerprint(token);
    if (!String(token || "").trim() || fp.length < 3) return "";
    try {
      var raw = localStorage.getItem(UID_CACHE_KEY);
      if (!raw) return "";
      var o = JSON.parse(raw);
      if (!o || o.v !== 1 || String(o.fp || "") !== fp) return "";
      var uid = String(o.uid || "").trim();
      return /^\d{17,22}$/.test(uid) ? uid : "";
    } catch (eUid) {
      return "";
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
    try {
      var cached = readCachedDiscordMe(getToken());
      var fromCache = String(cached && cached.id || "").trim();
      if (/^\d{17,22}$/.test(fromCache)) return fromCache;
    } catch (eCache) {}
    try {
      var fromUid = readCachedDiscordUid(getToken());
      if (/^\d{17,22}$/.test(fromUid)) return fromUid;
    } catch (eUid) {}
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
      if (path === "/personalizza" || path === "/user/personalizza" || path === "/user/customize" || path === "/user/custom") return false;
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

  function staffPageHref(userId) {
    var id = resolveAccountUserId(userId);
    return id ? "/user/?id=" + encodeURIComponent(id) + "&tab=staff" : "/user/?tab=staff";
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
      if (p === "/user" || p === "/personalizza" || p === "/user/customize" || p === "/user/personalizza" || p === "/user/custom") return true;
      return /^\/users\/\d{17,22}$/.test(p);
    } catch (e) {
      return false;
    }
  }

  function revealDashboardMenuItem(access) {
    var allowed = Boolean(access && access.allowed);
    var blacklisted = Boolean(access && access.blacklisted);
    var unchecked = Boolean(access && access.unchecked);
    if (!unchecked) {
      window.__VC_DASHBOARD_MENU_ALLOWED = allowed;
      window.__VC_DASHBOARD_MENU_BLACKLISTED = blacklisted;
      window.__VC_DASHBOARD_MENU_CHECKED = true;
    }
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
      window.dispatchEvent(
        new CustomEvent("vc-dashboard-access", { detail: { allowed: allowed, blacklisted: blacklisted } }),
      );
    } catch (eEv) {}
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
      try {
        if (link.parentNode) link.parentNode.removeChild(link);
      } catch (eRm) {
        link.setAttribute("hidden", "");
      }
    }
    try {
      var nav = document.querySelector(".discord-account-popover__nav");
      if (nav) {
        var stale = nav.querySelectorAll(
          '#discord-staff-link, a[href="/staff/"], a[href="/staff"], a[href*="tab=staff"]',
        );
        for (var i = 0; i < stale.length; i += 1) {
          var a = stale[i];
          var label = String((a.textContent || "")).replace(/\s+/g, " ").trim().toLowerCase();
          if (
            a.id === "discord-staff-link" ||
            label.indexOf("area staff") >= 0 ||
            label === "staff"
          ) {
            try {
              a.parentNode && a.parentNode.removeChild(a);
            } catch (e2) {}
          }
        }
      }
    } catch (eClean) {}
    if (allowed) ensureStaffSiteNavScript();
    try {
      if (typeof window.__vcMobileNavRebuild === "function") {
        window.__vcMobileNavRebuild();
      }
    } catch (eRebuild2) {}
  }

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

  function syncProfileMenuHref(user) {
    try {
      var link = byId("discord-profile-menu-link");
      if (!link) return;
      var href = profileHref(user && user.id);
      if (href) link.setAttribute("href", href);
    } catch (eHref) {}
  }

  function emitProfile(user) {
    try {
      window.__VC_DISCORD_PROFILE = user || null;
      window.dispatchEvent(new CustomEvent("vc-discord-profile", { detail: { user: user || null } }));
    } catch (e) {}
    syncProfileMenuHref(user);
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
      document.documentElement.classList.remove("vc-auth-session-pending");
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

    function renderAuthPendingShell() {
    try {
      document.documentElement.classList.add("vc-auth-session-pending");
    } catch (eCls) {}
    var loginBtns = queryDiscordLoginButtons();
    for (var li = 0; li < loginBtns.length; li += 1) {
      loginBtns[li].hidden = true;
    }
    var state = byId("discord-login-state");
    if (!state) return;
    state.hidden = false;
    if (
      state.querySelector(".discord-login-row:not(.vc-auth-pending-shell):not(.vc-auth-early-shell)") ||
      state.querySelector(".vc-auth-early-shell img.discord-avatar-img")
    ) {
      return;
    }
    var token = getToken();
    if (token) {
      try {
        var cachedUser = readCachedDiscordMe(token);
        if (cachedUser) {
          renderLoggedIn(cachedUser);
          return;
        }
      } catch (eCache) {}
    }
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
      document.documentElement.classList.add("vc-auth-session-pending");
    } catch (eCls) {}
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
    var label = escAttr(name);
    try {
      window.__VC_ACCOUNT_MENU_USER = user;
    } catch (eStoreUser) {}
    var href = escAttr(profileHref(user && user.id));
    var dashHref = escAttr(dashboardPageHref());
    var isProfileCurrent = isOwnProfileCurrent(user && user.id);
    var isDashCurrent = isDashboardContextPath();
    var avatarVisual = buildMenuAvatarVisual(user, name, 38);
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
        try {
      revealStaffMenuItem(window.__VC_STAFF_MENU_ALLOWED === true);
    } catch (eStrip) {}
    ensureHeaderMenusMutex();
    var out = byId("discord-logout-btn");
    if (out) {
      out.addEventListener("click", function () {
        clearToken();
        renderLoggedOut();
      });
    }
    var token = getToken();
    warmStaffNavEarly();
    warmDashboardNavEarly();
    fetchDashboardMenuAccess(token).then(function (allowed) {
      revealDashboardMenuItem(allowed);
    });
    fetchStaffMenuAccess(token).then(function (allowed) {
      revealStaffMenuItem(allowed);
    });
    var applyServerAvatar = function (serverAvatar) {
      if (!serverAvatar) return;
      var nextAvatar = normalizeMenuAvatarSrc(serverAvatar, user);
      var fallbackAvatar = normalizeMenuAvatarSrc(avatarUrl(user), user);
      if (!nextAvatar) return;
      var hash = user && user.avatar ? escAttr(String(user.avatar)) : "";
      try {
        var clips = state.querySelectorAll(".discord-avatar-clip, .discord-account-popover__avatar");
        for (var i = 0; i < clips.length; i += 1) {
          var el = clips[i];
          if (!el) continue;
          var currentImg = el.querySelector("img.discord-avatar-img");
          if (currentImg) {
            var prevSrc = String(currentImg.currentSrc || currentImg.src || "").trim();
            if (prevSrc && prevSrc === nextAvatar) {
              applyAnimatedAvatarToImg(currentImg, user);
              continue;
            }
            if (hash) currentImg.setAttribute("data-avatar-hash", hash);
            currentImg.setAttribute("data-vc-avatar", "1");
            currentImg.onerror = function onServerAvatarErr() {
              this.onerror = null;
              if (fallbackAvatar && this.src !== fallbackAvatar) this.src = fallbackAvatar;
            };
            currentImg.src = nextAvatar;
            applyAnimatedAvatarToImg(currentImg, user);
            continue;
          }
          el.innerHTML = buildMenuAvatarVisual(user, name, 38);
          try {
            var freshImg = el.querySelector("img.discord-avatar-img");
            if (freshImg) {
              freshImg.onerror = function onServerAvatarErrFresh() {
                this.onerror = null;
                if (fallbackAvatar && this.src !== fallbackAvatar) this.src = fallbackAvatar;
              };
              freshImg.src = nextAvatar;
              applyAnimatedAvatarToImg(freshImg, user);
            }
          } catch (eFresh) {}
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
    try {
      document.documentElement.classList.remove("vc-auth-session-pending");
    } catch (eClsDone) {}
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
    var now = Date.now();
    try {
      var raw = sessionStorage.getItem(ME_CACHE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        var age = now - Number(o.at || 0);
        if (o && o.v === 1 && o.user && String(o.fp || "") === fp && isFinite(age) && age >= 0 && age <= ME_SESSION_TTL_MS) {
          return o.user;
        }
      }
    } catch (eR) {}
    try {
      var rawLocal = localStorage.getItem(ME_LOCAL_CACHE_KEY);
      if (rawLocal) {
        var ol = JSON.parse(rawLocal);
        var ageL = now - Number(ol.at || 0);
        if (ol && ol.v === 1 && ol.user && String(ol.fp || "") === fp && isFinite(ageL) && ageL >= 0 && ageL <= ME_LOCAL_TTL_MS) {
          return ol.user;
        }
      }
    } catch (eRl) {}
    return null;
  }

  function writeCachedDiscordMe(token, user) {
    var fp = discordSessionFingerprint(token);
    var payload = { v: 1, fp: fp, at: Date.now(), user: user };
    try {
      sessionStorage.setItem(ME_CACHE_KEY, JSON.stringify(payload));
    } catch (eW) {}
    try {
      localStorage.setItem(ME_LOCAL_CACHE_KEY, JSON.stringify(payload));
    } catch (eWl) {}
    try {
      var uid = String(user && user.id || "").trim();
      if (/^\d{17,22}$/.test(uid)) {
        localStorage.setItem(
          UID_CACHE_KEY,
          JSON.stringify({ v: 1, fp: fp, at: Date.now(), uid: uid }),
        );
      }
    } catch (eUid) {}
  }

  function fetchMe(token, timeoutMs) {
    var fallback = 8000;
    try {
      if (
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        Number(navigator.maxTouchPoints || 0) > 0
      ) {
        fallback = 16000;
      }
    } catch (eFb) {}
    var ms = Math.max(2500, Number(timeoutMs) || fallback);
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
    warmStaffNavEarly();
    warmDashboardNavEarly();
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
            renderAuthPendingShell();
    showSessionVerifyOverlay();
    fetchMe(t)
      .then(function (user) {
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
        try {
      warmStaffNavEarly();
      warmDashboardNavEarly();
    } catch (eWarm0) {}
    document.addEventListener("DOMContentLoaded", function () {
      ensureHeaderMenusMutex();
      main();
    });
  } else {
    try {
      warmStaffNavEarly();
      warmDashboardNavEarly();
    } catch (eWarm1) {}
    ensureHeaderMenusMutex();
    main();
  }

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
