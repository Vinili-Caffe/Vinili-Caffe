(function () {
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

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_AUTH) || {};
  }

  var SESSION_OVERLAY_ID = "vc-session-verify-overlay";

  function byId(id) {
    return document.getElementById(id);
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

  function isBlockingSessionVerifyPage() {
    try {
      return Boolean(window.__VC_REQUIRE_BLOCKING_SESSION_VERIFY);
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
      try {
        document.documentElement.classList.remove("vc-session-verify-pending");
      } catch (e0) {}
      return;
    }
    var el = ensureSessionVerifyOverlay();
    try {
      document.documentElement.classList.remove("vc-session-verify-pending");
    } catch (e) {}
    el.classList.remove("vc-session-verify-overlay--hidden");
    el.setAttribute("aria-busy", "true");
  }

  function hideSessionVerifyOverlay() {
    try {
      document.documentElement.classList.remove("vc-session-verify-pending");
    } catch (e0) {}
    var el = byId(SESSION_OVERLAY_ID);
    if (!el) return;
    el.classList.add("vc-session-verify-overlay--hidden");
    el.setAttribute("aria-busy", "false");
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
      var expected = "";
      try {
        expected = String(sessionStorage.getItem(OAUTH_STATE_NONCE_KEY) || "").trim();
        sessionStorage.removeItem(OAUTH_STATE_NONCE_KEY);
      } catch (e0) {}
      out.validNonce = Boolean(expected) && Boolean(n) && n === expected;
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
    if (!stateParsed.validNonce) return { token: "", freshLogin: false, returnPath: "", stateMismatch: true };
    try {
      sessionStorage.removeItem(OAUTH_PENDING_RETURN_KEY);
    } catch (eR) {}
    var exp = Date.now() + SITE_SESSION_TTL_MS;
    localStorage.setItem(ACCESS_TOKEN_KEY, t);
    localStorage.setItem(EXPIRES_AT_KEY, String(exp));
    if (history && history.replaceState) {
      history.replaceState({}, document.title, window.location.pathname + window.location.search);
    }
    return { token: t, freshLogin: true, returnPath: returnPath };
  }

  function getToken() {
    var t = localStorage.getItem(ACCESS_TOKEN_KEY);
    var exp = Number(localStorage.getItem(EXPIRES_AT_KEY) || "0");
    if (!t || !exp || Date.now() >= exp) return "";
    return t;
  }

  try {
    window.__vcDiscordGetAccessToken = getToken;
  } catch (eGt) {}

  function clearToken() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    try {
      sessionStorage.removeItem(ME_CACHE_KEY);
    } catch (eCt) {}
  }

  function authUrl() {
    var c = cfg();
    var clientId = String(c.clientId || "").trim();
    if (!clientId) return "";
    var redirect = String(c.redirectUri || "").trim() || window.location.origin + window.location.pathname;
    var q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: "token",
      scope: "identify",
    });
    q.set("state", buildOAuthState(currentPathPlusQuery() || "/"));
    return "https://discord.com/oauth2/authorize?" + q.toString();
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
    if (isLocal) return "http://127.0.0.1:3042/webhooks/site-rank-card";
    return "/webhooks/site-rank-card";
  }

  async function fetchServerAvatarUrl(accessToken) {
    if (window.__VC_DISABLE_RANK_CARD_FETCH === true) return "";
    var token = String(accessToken || "").trim();
    if (!token) return "";
    try {
      var res = await fetch(resolveRankCardApiUrl(), {
        headers: { Authorization: "Bearer " + token },
      });
      if (!res.ok) return "";
      var data = await res.json().catch(function () {
        return {};
      });
      var u = String(data && data.avatarUrl || "").trim();
      return /^https?:\/\//i.test(u) ? u : "";
    } catch (e) {
      return "";
    }
  }

  function profileHref(userId) {
    var id = String(userId || "").trim();
    return id ? "/users/" + encodeURIComponent(id) : "/user";
  }

  function isProfileContextPath() {
    try {
      var p = String(window.location.pathname || "").toLowerCase().replace(/\/+$/, "") || "/";
      if (p === "/user" || p === "/user/customize" || p === "/user/personalizza") return true;
      return /^\/users\/\d{17,22}$/.test(p);
    } catch (e) {
      return false;
    }
  }

  /**
   * Navigazione OAuth nello stesso "tick" del gesto utente (tap).
   * Ritardi o click sintetici su elementi display:none (es. drawer mobile → header nascosto)
   * spezzano la user activation su Safari/iOS e il redirect a Discord non parte.
   */
  function startDiscordOAuthFromUserGesture(visualBtn, url) {
    var u = url || authUrl();
    if (!u) {
      alert("Configura discordOauth.clientId in site.config.json");
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
    var payload =
      countBefore >= 1
        ? {
          title: "Login effettuato con successo!",
          body: "Bentornato " + displayName + "! Sei ora connesso a " + site + ".",
          kind: "success",
          at: Date.now(),
          openUrl: home,
          userId: String((user && user.id) || ""),
        }
        : {
          title: "Benvenuto",
          body:
            "Ciao " +
            displayName +
            "! Benvenuto su " +
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

  function postOAuthAccessoRedirectPath() {
    try {
      var p = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
      if (p.endsWith("/unban/accesso-richiesto")) return "/unban/";
      if (p.endsWith("/candidature/accesso-richiesto")) return "/candidature/";
    } catch (e) {}
    return "";
  }

  function renderLoggedIn(user) {
    hideSessionVerifyOverlay();
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
    var isProfileCurrent = isProfileContextPath();
    var avatarVisual = img
      ? '<img class="discord-avatar-img" src="' +
        img +
        '" alt="" width="38" height="38" decoding="async" aria-label="' +
        label +
        '">'
      : '<span class="discord-avatar-img discord-avatar-img--fallback" aria-label="' +
        label +
        '"><i class="fa fa-user" aria-hidden="true"></i></span>';
    var avatarBlock =
      '<div class="discord-account-menu">' +
      '<button type="button" class="discord-profile-link" aria-label="Menu account di ' +
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
      '<a class="discord-account-popover__item' +
      (isProfileCurrent ? " is-current" : "") +
      '" role="menuitem" href="' +
      href +
      '"' +
      (isProfileCurrent ? ' aria-current="page"' : "") +
      '"><i class="fa fa-user-o" aria-hidden="true"></i><span>Vai al profilo</span></a>' +
      '<button type="button" class="discord-account-popover__item discord-account-popover__item--danger" role="menuitem" id="discord-logout-btn"><i class="fa fa-sign-out" aria-hidden="true"></i><span>Logout</span></button>' +
      "</div></div>";
    state.innerHTML =
      '<div class="discord-login-row">' +
      avatarBlock +
      "</div>";
    state.hidden = false;
    var out = byId("discord-logout-btn");
    if (out) {
      out.addEventListener("click", function () {
        clearToken();
        renderLoggedOut();
      });
    }
    var token = getToken();
    fetchServerAvatarUrl(token).then(function (serverAvatar) {
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
    });
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
    var ms = Math.max(3000, Number(timeoutMs) || 12000);
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
    showSessionVerifyOverlay();
    fetchMe(t)
      .then(function (user) {
        writeCachedDiscordMe(t, user);
        renderLoggedIn(user);
        if (freshLogin) queueLoginWelcomeNotification(user);
      })
      .catch(function () {
        clearToken();
        renderLoggedOut();
      });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    try {
      if (getToken()) return;
      if (window.__VC_DISCORD_PROFILE) renderLoggedOut();
    } catch (eVis) {}
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();