(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_AT_KEY = "vc_discord_expires_at";

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(html, kind) {
    var box = byId("vc-verify-status");
    if (!box) return;
    var tone = "border-white/10 bg-black/20 text-slate-200";
    if (kind === "ok") tone = "border-emerald-300/30 bg-emerald-900/20 text-emerald-100";
    if (kind === "err") tone = "border-rose-300/30 bg-rose-900/20 text-rose-100";
    box.className = "mt-5 rounded-xl border p-4 text-sm " + tone;
    box.innerHTML = html;
  }

  function getToken() {
    try {
      var token = String(localStorage.getItem(ACCESS_TOKEN_KEY) || "").trim();
      var exp = Number(localStorage.getItem(EXPIRES_AT_KEY) || "0");
      if (!token || !exp || Date.now() >= exp) return "";
      return token;
    } catch (e) {
      return "";
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(EXPIRES_AT_KEY);
    } catch (e) {}
  }

  function resolveGuildIdFromQuery() {
    try {
      var p = new URLSearchParams(window.location.search || "");
      var gid = String(p.get("guildId") || p.get("guild") || "").trim();
      if (/^\d{17,22}$/.test(gid)) return gid;
    } catch (e) {}
    return "";
  }

  function resolveApiUrl() {
    var cfg = window.__VC_SITE_VERIFY || {};
    var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    if (isLocal && cfg.apiUrlLocal) return String(cfg.apiUrlLocal);
    return String(cfg.apiUrl || "/webhooks/site-verify/complete");
  }

  function buildOAuthUrl() {
    var c = window.__VC_AUTH || {};
    var clientId = String(c.clientId || "").trim();
    var redirect = String(c.redirectUri || "").trim() || window.location.origin + window.location.pathname;
    if (!clientId) return "";
    var q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: "token",
      scope: "identify",
      state: window.location.pathname + window.location.search,
    });
    return "https://discord.com/oauth2/authorize?" + q.toString();
  }

  async function completeVerify() {
    var loginBtn = byId("vc-verify-login-btn");
    var token = getToken();
    if (!token) {
      if (loginBtn) loginBtn.hidden = false;
      setStatus('<i class="fa fa-lock"></i> Devi fare login con Discord per completare la verifica.', "err");
      return;
    }

    var apiUrl = resolveApiUrl();
    var guildId = resolveGuildIdFromQuery();
    setStatus('<i class="fa fa-refresh fa-spin"></i> Verifica in corso, attendi un attimo...', "");
    try {
      var res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ guildId: guildId || null }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data || data.ok !== true) {
        var msg = String((data && data.message) || "Verifica non riuscita.");
        if (res.status === 401) {
          clearToken();
          if (loginBtn) loginBtn.hidden = false;
        }
        setStatus('<i class="fa fa-exclamation-triangle"></i> ' + msg, "err");
        return;
      }
      if (loginBtn) loginBtn.hidden = true;
      setStatus('<i class="fa fa-check-circle"></i> ' + String(data.message || "Verifica completata con successo."), "ok");
    } catch (e) {
      setStatus('<i class="fa fa-exclamation-triangle"></i> Errore di rete durante la verifica.', "err");
    }
  }

  function bindLoginButton() {
    var btn = byId("vc-verify-login-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
        window.__vcDiscordStartOAuthRedirect(btn);
        return;
      }
      var url = buildOAuthUrl();
      if (!url) {
        setStatus('<i class="fa fa-exclamation-triangle"></i> OAuth Discord non configurato.', "err");
        return;
      }
      try {
        window.location.assign(url);
      } catch (e) {
        window.location.href = url;
      }
    });
  }

  function main() {
    bindLoginButton();
    completeVerify();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();