(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_AT_KEY = "vc_discord_expires_at";
  var PENDING_LOGIN_NOTIF_KEY = "vc_pending_login_notification_v1";
  var OAUTH_LOGIN_COUNT_KEY = "vc_discord_oauth_login_count_v1";
  var OAUTH_FRESH_AFTER_BOUNCE_KEY = "vc_oauth_fresh_after_bounce_v1";
  /** Backup percorso ritorno se `state` non torna nel fragment OAuth. */
  var OAUTH_PENDING_RETURN_KEY = "vc_oauth_pending_return_v1";

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_AUTH) || {};
  }

  var SESSION_OVERLAY_ID = "vc-session-verify-overlay";

  function byId(id) {
    return document.getElementById(id);
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
    var sec = Number(p.get("expires_in") || "0");
    var returnPath = normalizeReturnPath(p.get("state"));
    if (!returnPath && t) {
      try {
        returnPath = normalizeReturnPath(sessionStorage.getItem(OAUTH_PENDING_RETURN_KEY));
      } catch (eS) {}
    }
    if (!t) return { token: "", freshLogin: false, returnPath: "" };
    try {
      sessionStorage.removeItem(OAUTH_PENDING_RETURN_KEY);
    } catch (eR) {}
    var exp = Date.now() + Math.max(60, sec) * 1000;
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

  function clearToken() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
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
    q.set("state", currentPathPlusQuery() || "/");
    return "https://discord.com/oauth2/authorize?" + q.toString();
  }

  function avatarUrl(u) {
    if (!u || !u.id || !u.avatar) return "";
    var ext = String(u.avatar).indexOf("a_") === 0 ? "gif" : "png";
    return "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + "." + ext + "?size=64";
  }

  function profileHref(userId) {
    var id = String(userId || "").trim();
    return id ? "/users/" + encodeURIComponent(id) : "/user";
  }

  function startLoginTransition(loginBtn, url) {
    if (!url) {
      alert("Configura discordOauth.clientId in site.config.json");
      return;
    }
    try {
      sessionStorage.setItem(OAUTH_PENDING_RETURN_KEY, currentPathPlusQuery() || "/");
    } catch (e0) {}
    if (loginBtn) {
      loginBtn.classList.add("discord-login-btn--loading");
      loginBtn.setAttribute("aria-busy", "true");
      loginBtn.innerHTML =
        '<span class="discord-login-btn__spin" aria-hidden="true"></span>' +
        "<span>Accesso in corso...</span>";
    }
    try {
      if (typeof window.vcShowPageTransition === "function") {
        window.vcShowPageTransition("login");
      }
    } catch (e) {}
    function go() {
      try {
        window.location.href = url;
      } catch (e2) {
        try {
          window.location.assign(url);
        } catch (e3) {}
      }
    }
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        window.setTimeout(go, 140);
      });
    });
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
    var displayName = String((user && (user.global_name || user.username)) || "utente").trim() || "utente";
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
    var loginBtn = byId("discord-login-btn");
    var state = byId("discord-login-state");
    if (loginBtn) loginBtn.hidden = false;
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
    var loginBtn = byId("discord-login-btn");
    var state = byId("discord-login-state");
    if (!state) return;
    if (loginBtn) loginBtn.hidden = true;
    var name = String(user.username || user.global_name || "Utente").trim() || "Utente";
    var img = avatarUrl(user);
    var label = escAttr(name);
    var href = escAttr(profileHref(user && user.id));
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
      '<a class="discord-account-popover__item" role="menuitem" href="' +
      href +
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
    emitProfile(user);
  }

  function fetchMe(token) {
    return fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: "Bearer " + token },
    }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }

  function main() {
    var parsed = parseHashToken();
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
    var loginBtn = byId("discord-login-btn");
    if (loginBtn) {
      loginBtn.addEventListener("click", function () {
        startLoginTransition(loginBtn, authUrl());
      });
    }
    var t = getToken();
    if (!t) {
      try {
        document.documentElement.classList.remove("vc-session-verify-pending");
      } catch (e2) {}
      renderLoggedOut();
      return;
    }
    showSessionVerifyOverlay();
    fetchMe(t)
      .then(function (user) {
        renderLoggedIn(user);
        if (freshLogin) queueLoginWelcomeNotification(user);
      })
      .catch(function () {
        clearToken();
        renderLoggedOut();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();