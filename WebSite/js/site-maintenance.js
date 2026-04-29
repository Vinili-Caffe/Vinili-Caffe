(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_AT_KEY = "vc_discord_expires_at";
  var ROOT_CLASS = "vc-maintenance-pending";
  var BYPASS_CLASS = "vc-maintenance-bypass";
  var PAGE_CLASS = "vc-maintenance-page";
  var STYLE_ID = "vc-maintenance-style";
  /** Stesso nome di `discord-auth.js` per il ritorno OAuth se il fragment perde lo `state`. */
  var OAUTH_PENDING_RETURN_KEY = "vc_oauth_pending_return_v1";

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_MAINTENANCE) || {};
  }

  function enabled() {
    return cfg().enabled === true;
  }

  function normalizeLegalPath(pathname) {
    var path = String(pathname || "/").replace(/\/+$/, "") || "/";
    path = path.replace(/\/index\.html$/i, "");
    return path || "/";
  }

  function isPublicLegalPage() {
    try {
      var path = normalizeLegalPath(window.location.pathname);
      return path === "/cookie" || path === "/privacy" || path === "/terms";
    } catch (e) {
      return false;
    }
  }

  function isVerifyPage() {
    try {
      var path = normalizeLegalPath(window.location.pathname);
      return path === "/verify";
    } catch (e) {
      return false;
    }
  }

  function allowedIds() {
    var ids = cfg().allowedUserIds;
    if (!Array.isArray(ids)) return [];
    return ids.map(function (id) { return String(id || "").trim(); }).filter(Boolean);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getToken() {
    try {
      var token = localStorage.getItem(ACCESS_TOKEN_KEY);
      var expiresAt = Number(localStorage.getItem(EXPIRES_AT_KEY) || "0");
      if (!token || !expiresAt || Date.now() >= expiresAt) return "";
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

  function normalizeReturnPath() {
    try {
      var path = String(window.location.pathname || "/") || "/";
      var query = String(window.location.search || "");
      return path + query;
    } catch (e) {
      return "/";
    }
  }

  function authUrl() {
    var c = cfg();
    var clientId = String(c.clientId || "").trim();
    if (!clientId) return "";
    var redirectUri = String(c.redirectUri || "").trim() || window.location.origin + "/";
    var q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "token",
      scope: "identify",
      state: normalizeReturnPath(),
    });
    return "https://discord.com/oauth2/authorize?" + q.toString();
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    var hidePage =
      "body > :not(#vc-maintenance-root):not(#vc-necessity-banner){visibility:hidden!important;pointer-events:none!important;user-select:none!important;}";
    style.textContent = [
      "html." + ROOT_CLASS + "{overflow:hidden!important;}",
      "html." + ROOT_CLASS + " " + hidePage,
      "html." + PAGE_CLASS + ":not(." + BYPASS_CLASS + ") " + hidePage,
      "html." +
        ROOT_CLASS +
        ",html." +
        ROOT_CLASS +
        " body,html." +
        PAGE_CLASS +
        ":not(." +
        BYPASS_CLASS +
        "),html." +
        PAGE_CLASS +
        ":not(." +
        BYPASS_CLASS +
        ") body{min-height:100%;background:#070403!important;color:#f8fafc!important;}",
      "#vc-maintenance-root{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 18% 16%,rgba(212,168,136,.18),transparent 36%),radial-gradient(circle at 84% 24%,rgba(52,211,153,.12),transparent 34%),radial-gradient(circle at 72% 78%,rgba(125,211,252,.1),transparent 40%),linear-gradient(135deg,#070403,#140f0c 48%,#0f172a);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
      ".vc-maintenance-card{width:min(620px,100%);border:1px solid rgba(212,168,136,.24);border-radius:28px;background:linear-gradient(160deg,rgba(20,15,12,.88),rgba(15,23,42,.74));box-shadow:0 28px 90px rgba(0,0,0,.52),inset 0 1px 0 rgba(255,255,255,.08);padding:34px;text-align:left;backdrop-filter:blur(18px);}",
      ".vc-maintenance-kicker{display:inline-flex;align-items:center;gap:8px;margin-bottom:18px;padding:8px 12px;border-radius:999px;background:rgba(212,168,136,.14);color:#f0d4bb;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;}",
      ".vc-maintenance-title{margin:0;color:#fff7ed;font-size:clamp(34px,6vw,58px);line-height:.98;font-weight:900;letter-spacing:-.04em;}",
      ".vc-maintenance-text{margin:18px 0 0;color:rgba(226,232,240,.82);font-size:18px;line-height:1.7;}",
      ".vc-maintenance-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px;}",
      ".vc-maintenance-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:14px;border:1px solid rgba(212,168,136,.26);background:rgba(255,255,255,.06);color:#f8fafc;text-decoration:none;font-weight:800;font:inherit;cursor:pointer;transition:filter .18s ease,border-color .18s ease;}",
      ".vc-maintenance-btn:hover{filter:brightness(1.06);border-color:rgba(167,243,208,.46);}",
      ".vc-maintenance-btn--primary{background:linear-gradient(135deg,#34d399,#10b981);color:#052e24;border-color:rgba(52,211,153,.72);box-shadow:0 16px 36px rgba(16,185,129,.24);}",
      ".vc-maintenance-foot{margin-top:18px;color:rgba(203,213,225,.84);font-size:13px;}",
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function renderMaintenance(reason) {
    installStyle();
    document.documentElement.classList.add(PAGE_CLASS);
    document.documentElement.classList.remove(ROOT_CLASS);
    var root = document.getElementById("vc-maintenance-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "vc-maintenance-root";
      root.setAttribute("role", "main");
      root.setAttribute("aria-live", "polite");
      (document.body || document.documentElement).appendChild(root);
    }
    var c = cfg();
    var login = authUrl();
    root.innerHTML =
      '<section class="vc-maintenance-card">' +
      '<span class="vc-maintenance-kicker">Vinili & Caffè</span>' +
      '<h1 class="vc-maintenance-title">' + esc(c.title || "Sito in manutenzione") + "</h1>" +
      '<p class="vc-maintenance-text">' + esc(c.message || "Stiamo sistemando alcune parti del sito. Torna tra poco!") + "</p>" +
      '<div class="vc-maintenance-actions">' +
      (login
        ? '<button type="button" class="vc-maintenance-btn vc-maintenance-btn--primary" id="vc-maintenance-discord-btn">Accedi con Discord</button>'
        : "") +
      '<a class="vc-maintenance-btn" href="https://discord.gg/viniliecaffe" target="_blank" rel="noopener noreferrer">Entra su Discord</a>' +
      "</div>" +
      '<p class="vc-maintenance-foot">Accesso consentito solo agli account autorizzati durante i lavori.' +
      (reason ? " Stato: " + esc(reason) + "." : "") +
      "</p>" +
      "</section>";
    if (login) {
      var oBtn = root.querySelector("#vc-maintenance-discord-btn");
      if (oBtn) {
        oBtn.addEventListener("click", function () {
          try {
            sessionStorage.setItem(OAUTH_PENDING_RETURN_KEY, normalizeReturnPath());
          } catch (e1) {}
          try {
            window.location.assign(login);
          } catch (e2) {
            try {
              window.location.href = login;
            } catch (e3) {}
          }
        });
      }
    }
  }

  function allowSite() {
    document.documentElement.classList.remove(ROOT_CLASS, PAGE_CLASS);
    document.documentElement.classList.add(BYPASS_CLASS);
    try {
      document.documentElement.style.overflow = "";
      document.documentElement.style.height = "";
    } catch (e0) {}
    var root = document.getElementById("vc-maintenance-root");
    if (root && root.parentNode) root.parentNode.removeChild(root);
  }

  function parseHashToken() {
    try {
      var h = String(window.location.hash || "");
      if (h.indexOf("access_token=") === -1) return;
      var p = new URLSearchParams(h.slice(1));
      var token = p.get("access_token");
      var sec = Number(p.get("expires_in") || "0");
      if (!token) return;
      localStorage.setItem(ACCESS_TOKEN_KEY, token);
      localStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + Math.max(60, sec) * 1000));
      if (history && history.replaceState) {
        history.replaceState({}, document.title, window.location.pathname + window.location.search);
      }
    } catch (e) {}
  }

  async function verify() {
    if (isVerifyPage()) return allowSite();
    if (isPublicLegalPage()) return allowSite();
    if (!enabled()) return allowSite();
    installStyle();
    document.documentElement.classList.add(ROOT_CLASS);
    parseHashToken();

    var token = getToken();
    if (!token) {
      renderMaintenance("login richiesto");
      return;
    }

    try {
      var res = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: "Bearer " + token },
      });
      if (!res.ok) {
        clearToken();
        renderMaintenance("sessione scaduta");
        return;
      }
      var me = await res.json();
      if (allowedIds().indexOf(String(me && me.id || "")) !== -1) {
        allowSite();
        return;
      }
      renderMaintenance("account non autorizzato");
    } catch (e) {
      renderMaintenance("verifica non disponibile");
    }
  }

  verify();
})();