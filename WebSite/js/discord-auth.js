(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_AT_KEY = "vc_discord_expires_at";

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_AUTH) || {};
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function parseHashToken() {
    var h = window.location.hash || "";
    if (!h || h.indexOf("access_token=") === -1) return null;
    var p = new URLSearchParams(h.slice(1));
    var t = p.get("access_token");
    var sec = Number(p.get("expires_in") || "0");
    if (!t) return null;
    var exp = Date.now() + Math.max(60, sec) * 1000;
    localStorage.setItem(ACCESS_TOKEN_KEY, t);
    localStorage.setItem(EXPIRES_AT_KEY, String(exp));
    if (history && history.replaceState) {
      history.replaceState({}, document.title, window.location.pathname + window.location.search);
    }
    return t;
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
    return "https://discord.com/oauth2/authorize?" + q.toString();
  }

  function avatarUrl(u) {
    if (!u || !u.id || !u.avatar) return "";
    var ext = String(u.avatar).indexOf("a_") === 0 ? "gif" : "png";
    return "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + "." + ext + "?size=64";
  }

  function renderLoggedOut() {
    var loginBtn = byId("discord-login-btn");
    var state = byId("discord-login-state");
    if (loginBtn) loginBtn.hidden = false;
    if (state) {
      state.hidden = true;
      state.innerHTML = "";
    }
  }

  function renderLoggedIn(user) {
    var loginBtn = byId("discord-login-btn");
    var state = byId("discord-login-state");
    if (!state) return;
    if (loginBtn) loginBtn.hidden = true;
    var name = user.global_name || user.username || "Utente";
    var img = avatarUrl(user);
    state.innerHTML =
      '<div class="discord-user-chip">' +
      (img ? '<img src="' + img + '" alt="Avatar">' : "") +
      "<span>" +
      name +
      "</span></div>" +
      '<button type="button" class="discord-logout-btn" id="discord-logout-btn">Logout</button>';
    state.hidden = false;
    var out = byId("discord-logout-btn");
    if (out) {
      out.addEventListener("click", function () {
        clearToken();
        renderLoggedOut();
      });
    }
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
    parseHashToken();
    var loginBtn = byId("discord-login-btn");
    var url = authUrl();
    if (loginBtn) {
      loginBtn.addEventListener("click", function () {
        if (!url) {
          alert("Configura discordOauth.clientId in site.config.json");
          return;
        }
        window.location.href = url;
      });
    }
    var t = getToken();
    if (!t) {
      renderLoggedOut();
      return;
    }
    fetchMe(t)
      .then(renderLoggedIn)
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