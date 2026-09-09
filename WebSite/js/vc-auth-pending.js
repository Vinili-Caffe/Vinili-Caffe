(function () {
    var TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_KEY = "vc_discord_expires_at";
  var ME_SESSION_KEY = "vc_discord_me_cache_v1";
  var ME_LOCAL_KEY = "vc_discord_me_cache_local_v1";
  var ME_SESSION_TTL_MS = 180000;
  var ME_LOCAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function injectRankCustomizeFixes() {
    try {
      var path = String(window.location.pathname || "");
      if (!/^\/user\/(personalizza|customize)\/?$/i.test(path)) return;
      if (document.getElementById("vc-rank-customize-layout-fixes")) return;
      var css =
        ".vc-rank-editor-colorrow{display:grid!important;grid-template-columns:minmax(5.5rem,6.2rem) minmax(6.75rem,8rem) auto!important;align-items:center!important;justify-content:start!important;gap:.45rem!important;}" +
        ".vc-rank-editor-colorrow__hex{width:100%!important;min-width:6.75rem!important;max-width:8rem!important;height:3rem!important;box-sizing:border-box!important;text-align:center!important;font-weight:800!important;letter-spacing:.04em!important;color:#f8fafc!important;opacity:1!important;}" +
        ".vc-rank-editor-updatebtn{width:auto!important;min-width:0!important;white-space:nowrap!important;justify-self:start!important;}" +
        ".vc-rank-editor-previewcard{overflow:hidden!important;}" +
        ".vc-rank-editor-preview__card{width:100%!important;max-width:43rem!important;margin-inline:auto!important;box-sizing:border-box!important;overflow:hidden!important;}" +
        ".vc-rank-editor-preview__hero{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto!important;align-items:center!important;gap:clamp(1rem,2vw,2rem)!important;}" +
        ".vc-rank-editor-preview__copy,.vc-rank-editor-preview__topline{min-width:0!important;}" +
        ".vc-rank-editor-preview__topline{flex-wrap:wrap!important;row-gap:.35rem!important;}" +
        ".vc-rank-editor-preview__bar{width:100%!important;min-width:0!important;}" +
        ".vc-rank-editor-preview__stats{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:1rem!important;}" +
        ".vc-rank-editor-preview__stat{min-width:0!important;}" +
        "@media(max-width:860px){.vc-rank-editor-colorrow{grid-template-columns:minmax(5.5rem,6.2rem) minmax(6.75rem,8rem)!important;justify-content:start!important;gap:.45rem!important}.vc-rank-editor-updatebtn{grid-column:1/-1!important;justify-self:stretch!important}.vc-rank-editor-preview__hero{grid-template-columns:1fr!important;justify-items:center!important;text-align:center!important}.vc-rank-editor-preview__rankbox{justify-self:center!important}.vc-rank-editor-preview__stats{grid-template-columns:1fr!important}}";
      var style = document.createElement("style");
      style.id = "vc-rank-customize-layout-fixes";
      style.textContent = css;
      document.head.appendChild(style);
    } catch (e) {}
  }

  injectRankCustomizeFixes();

  function sessionFingerprint(token) {
    var exp = "";
    try {
      exp = String(localStorage.getItem(EXPIRES_KEY) || "");
    } catch (eFp) {}
    return exp + "|" + String(token || "").slice(0, 32);
  }

  function readCachedMe(token) {
    var fp = sessionFingerprint(token);
    if (!String(token || "").trim() || fp.length < 3) return null;
    var now = Date.now();
    try {
      var raw = sessionStorage.getItem(ME_SESSION_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        var age = now - Number(o && o.at || 0);
        if (o && o.v === 1 && o.user && String(o.fp || "") === fp && isFinite(age) && age >= 0 && age <= ME_SESSION_TTL_MS) {
          return o.user;
        }
      }
    } catch (eS) {}
    try {
      var rawLocal = localStorage.getItem(ME_LOCAL_KEY);
      if (rawLocal) {
        var ol = JSON.parse(rawLocal);
        var ageL = now - Number(ol && ol.at || 0);
        if (ol && ol.v === 1 && ol.user && String(ol.fp || "") === fp && isFinite(ageL) && ageL >= 0 && ageL <= ME_LOCAL_TTL_MS) {
          return ol.user;
        }
      }
    } catch (eL) {}
    return null;
  }

  function avatarUrl(user) {
    if (!user) return "";
    if (user.avatar) {
      var ext = "png";
      try {
        if (!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) {
          ext = String(user.avatar).indexOf("a_") === 0 ? "gif" : "png";
        }
      } catch (eMob) {
        ext = String(user.avatar).indexOf("a_") === 0 ? "gif" : "png";
      }
      return (
        "https://cdn.discordapp.com/avatars/" +
        encodeURIComponent(String(user.id || "")) +
        "/" +
        encodeURIComponent(String(user.avatar)) +
        "." +
        ext +
        "?size=128"
      );
    }
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        return window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eFb) {}
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function escAttr(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function hideLoginButtons() {
    var nodes = document.querySelectorAll("#discord-login-btn, button[data-vc-discord-login]");
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].hidden = true;
      try {
        nodes[i].setAttribute("hidden", "");
        nodes[i].classList.add("vc-discord-login-btn--gone");
        nodes[i].setAttribute("aria-hidden", "true");
        nodes[i].style.setProperty("display", "none", "important");
      } catch (eHide) {}
    }
  }

  function injectEarlyAuthCss() {
    try {
      if (document.getElementById("vc-auth-session-early-css")) return;
      var style = document.createElement("style");
      style.id = "vc-auth-session-early-css";
      style.textContent =
        "html.vc-auth-session-pending #discord-login-btn," +
        "html.vc-auth-session-pending button[data-vc-discord-login]{" +
        "visibility:hidden!important;pointer-events:none!important;}" +
        "html.vc-auth-session-pending #discord-login-state," +
        "html.vc-auth-session-pending .header-login-state{" +
        "display:flex!important;visibility:visible!important;}" +
        "html.vc-auth-session-pending #discord-login-state[hidden]," +
        "html.vc-auth-session-pending .header-login-state[hidden]{" +
        "display:flex!important;visibility:visible!important;}" +
        "#header-quick-actions{min-width:2.75rem;min-height:2.375rem;}";
      document.head.appendChild(style);
    } catch (eCss) {}
  }

  function pendingShellHtml() {
    var coffee = avatarUrl(null);
    return (
      '<div class="discord-login-row vc-auth-pending-shell" aria-busy="true" title="Verifica sessione…">' +
      '<span class="discord-avatar-clip">' +
      '<img class="discord-avatar-img vc-avatar vc-avatar--ready vc-avatar-fallback-img" data-vc-avatar="1" data-vc-avatar-fallback="1" src="' +
      escAttr(coffee) +
      '" alt="" width="38" height="38" decoding="async" aria-hidden="true" />' +
      "</span></div>"
    );
  }

  function profileShellHtml(user) {
    var name = String((user && (user.global_name || user.username)) || "Utente").trim() || "Utente";
    try {
      if (window.VcDiscordIdentity && typeof window.VcDiscordIdentity.pickDisplayName === "function") {
        name = window.VcDiscordIdentity.pickDisplayName(user, "Utente");
      }
    } catch (eDn) {}
    try {
      var server = window.__VC_SERVER_IDENTITY;
      if (server && String(server.displayName || "").trim()) {
        if (!user || !user.id || String(server.userId || "") === String(user.id || "") || !server.userId) {
          name = String(server.displayName).trim();
        }
      }
    } catch (eServerName) {}
    var img = "";
    try {
      var serverAv = window.__VC_SERVER_IDENTITY;
      if (serverAv && serverAv.avatarUrl && (!user || !user.id || String(serverAv.userId || "") === String(user.id || "") || !serverAv.userId)) {
        img = String(serverAv.avatarUrl || "").trim();
      }
    } catch (eServerAv) {}
    if (!img) img = avatarUrl(user);
    var label = escAttr(name);
    var avatarVisual = "";
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.imgHtml === "function") {
        avatarVisual = window.VcDiscordAvatar.imgHtml({
          url: img,
          userId: user && user.id,
          avatarHash: user && user.avatar,
          size: 38,
          className: "discord-avatar-img vc-avatar",
          loading: "eager",
          fetchPriority: "high",
          alt: "",
        }).replace(' alt=""', ' alt="" aria-label="' + label + '"');
      }
    } catch (eHub) {}
    if (!avatarVisual) {
      var coffee = avatarUrl(null);
      avatarVisual =
        '<img class="discord-avatar-img vc-avatar vc-avatar--ready vc-avatar-fallback-img" data-vc-avatar="1" data-vc-avatar-fallback="1" src="' +
        escAttr(coffee) +
        '" alt="" width="38" height="38" decoding="async" aria-label="' +
        label +
        '" />';
    }
    return (
      '<div class="discord-login-row discord-login-row--profile vc-auth-early-shell" aria-busy="true">' +
      '<div class="discord-account-menu">' +
      '<button type="button" class="discord-profile-link" aria-label="Menu account ' +
      label +
      '" aria-haspopup="true">' +
      '<span class="discord-avatar-clip">' +
      avatarVisual +
      "</span></button></div></div>"
    );
  }

  function applyEarlyAuthShell(user) {
    hideLoginButtons();
    var state = document.getElementById("discord-login-state");
    if (!state) {
      state = document.querySelector(".header-login-state");
    }
    if (!state) return;
    if (state.querySelector(".discord-login-row:not(.vc-auth-pending-shell):not(.vc-auth-early-shell)")) return;
    state.hidden = false;
    try {
      state.removeAttribute("hidden");
    } catch (eUnhide) {}
    state.innerHTML = user ? profileShellHtml(user) : pendingShellHtml();
    try {
      window.__VC_DISCORD_PROFILE = user || window.__VC_DISCORD_PROFILE || null;
    } catch (eProf) {}
    if (user && user.id) {
      try {
        window.dispatchEvent(
          new CustomEvent("vc-discord-profile", { detail: { user: user, early: true } }),
        );
      } catch (eProfEv) {}
    }
    try {
      if (typeof window.__vcMobileNavSyncFooter === "function") {
        window.__vcMobileNavSyncFooter();
      }
    } catch (eFoot) {}
  }

  function warmDashboardMenuFromCache(token) {
    try {
      if (window.__VC_DASHBOARD_MENU_CHECKED === true) return;
      var fp = String(token || "").slice(0, 24);
      var now = Date.now();
      var access = null;
      try {
        var raw = sessionStorage.getItem("vc_menu_dash_v1");
        if (raw) {
          var data = JSON.parse(raw);
          if (data && data.fp === fp && now - Number(data.at || 0) <= 180000) access = data;
        }
      } catch (eS) {}
      if (!access) {
        try {
          var rawLocal = localStorage.getItem("vc_menu_dash_local_v1");
          if (rawLocal) {
            var dl = JSON.parse(rawLocal);
            if (dl && dl.fp === fp && now - Number(dl.at || 0) <= 604800000) access = dl;
          }
        } catch (eL) {}
      }
      if (!access) {
        try {
          var gateRaw = sessionStorage.getItem("vc_dash_access_ok_v1");
          if (gateRaw) {
            var gate = JSON.parse(gateRaw);
            if (gate && (gate.ok === true || gate.allowed === true) && Number(gate.exp || 0) > now) {
              access = { allowed: true, blacklisted: Boolean(gate.blacklisted) };
            }
          }
        } catch (eG) {}
      }
      if (!access) return;
      window.__VC_DASHBOARD_MENU_ALLOWED = Boolean(access.allowed);
      window.__VC_DASHBOARD_MENU_BLACKLISTED = Boolean(access.blacklisted);
      window.__VC_DASHBOARD_MENU_CHECKED = true;
      if (access.allowed) window.__VC_DASHBOARD_ACCESS_OK = true;
      try {
        window.dispatchEvent(
          new CustomEvent("vc-dashboard-access", {
            detail: { allowed: Boolean(access.allowed), blacklisted: Boolean(access.blacklisted) },
          }),
        );
      } catch (eEv) {}
    } catch (eWarm) {}
  }

  function bootEarlyAuthHeader() {
    /* mobileNavProfileCache1: apply cached profile before session-boot so drawer can paint */
    injectEarlyAuthCss();
    var token = "";
    try {
      token = String(localStorage.getItem(TOKEN_KEY) || "").trim();
    } catch (eT) {}
    if (!token) return;
    try {
      var exp = Number(localStorage.getItem(EXPIRES_KEY) || "0");
      if (exp && Date.now() >= exp) return;
    } catch (eExp) {}
    try {
      var h = window.location.hash || "";
      if (h.indexOf("access_token=") !== -1) return;
    } catch (eH) {}
    document.documentElement.classList.add("vc-auth-session-pending");
    warmDashboardMenuFromCache(token);
    var cached = readCachedMe(token);
    function apply() {
      applyEarlyAuthShell(cached);
      try {
        window.dispatchEvent(new CustomEvent("vc-auth-session-boot"));
      } catch (eBootEv) {}
    }
    if (document.body) apply();
    else document.addEventListener("DOMContentLoaded", apply);
  }

  function isCoarseMobile() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
    } catch (e) {}
    return Number(navigator.maxTouchPoints || 0) > 0;
  }

  function isBlockingSessionVerifyPage() {
    try {
      try {
        if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return false;
      } catch (ePwa) {}
      try {
        if (navigator.standalone) return false;
      } catch (eIos) {}
            if (isCoarseMobile()) return false;
      if (!window.__VC_REQUIRE_BLOCKING_SESSION_VERIFY) return false;
      var p = String(location.pathname || "").replace(/\/+$/, "") || "/";
      if (p.indexOf("/dashboard") === 0) return true;
      if (p.indexOf("/staff") === 0) return true;
      if (p === "/tickets" || p.indexOf("/tickets/") === 0) return true;
      if (p.indexOf("/accesso-richiesto") !== -1) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function hasLikelyDiscordSession() {
    try {
      var h = window.location.hash || "";
      if (h.indexOf("access_token=") !== -1) return true;
    } catch (eH) {}
    try {
      var t = localStorage.getItem(TOKEN_KEY);
      if (!t) return false;
      var exp = Number(localStorage.getItem(EXPIRES_KEY) || "0");
      if (exp && Date.now() >= exp) return false;
      return true;
    } catch (eT) {
      return false;
    }
  }

  function injectDiscordApiPreconnect() {
    try {
      if (document.getElementById("vc-discord-api-preconnect")) return;
      var link = document.createElement("link");
      link.id = "vc-discord-api-preconnect";
      link.rel = "preconnect";
      link.href = "https://discord.com";
      document.head.appendChild(link);
    } catch (ePc) {}
  }

  function injectEarlySessionOverlayCss() {
    try {
      if (document.getElementById("vc-session-verify-early-css")) return;
      var style = document.createElement("style");
      style.id = "vc-session-verify-early-css";
      style.textContent =
        "html.vc-session-verify-pending,html.vc-session-verify-pending body{" +
        "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
        "overscroll-behavior:none!important;}" +
        "html.vc-session-verify-pending .vc-reviews-gate," +
        "html.vc-session-verify-pending .vc-auth-required-card{" +
        "visibility:hidden!important;pointer-events:none!important;}" +
        "html.vc-session-verify-pending #discord-login-btn," +
        "html.vc-session-verify-pending button[data-vc-discord-login]{" +
        "visibility:hidden!important;}" +
        "@media (pointer:coarse),(max-width:920px){" +
        "html.vc-session-verify-pending,html.vc-session-verify-pending body{" +
        "overflow:auto!important;touch-action:manipulation!important;position:static!important;height:auto!important;max-height:none!important}" +
        ".vc-session-verify-overlay{display:none!important;pointer-events:none!important}" +
        "}";
      document.head.appendChild(style);
    } catch (eCss) {}
  }

  function mountEarlySessionOverlay() {
    try {
      if (document.getElementById("vc-session-verify-overlay")) return;
      if (!document.body) return;
      var el = document.createElement("div");
      el.id = "vc-session-verify-overlay";
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
    } catch (eOv) {}
  }

  function dismissAuthGates() {
    try {
      var gates = document.querySelectorAll(".vc-reviews-gate");
      for (var i = 0; i < gates.length; i += 1) {
        gates[i].setAttribute("hidden", "");
        gates[i].classList.add("vc-reviews-gate--dismissed");
      }
    } catch (eG) {}
  }

  function clearSessionPendingUi() {
    try {
      document.documentElement.classList.remove("vc-session-verify-pending");
    } catch (eCls) {}
    try {
      var el = document.getElementById("vc-session-verify-overlay");
      if (el) {
        el.classList.add("vc-session-verify-overlay--hidden");
        el.setAttribute("aria-busy", "false");
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    } catch (eEl) {}
  }

  function armSessionPendingFailsafe() {
    setTimeout(function () {
      try {
        if (window.__VC_DISCORD_PROFILE) {
          clearSessionPendingUi();
          return;
        }
        var el = document.getElementById("vc-session-verify-overlay");
        var pending = false;
        try {
          pending = document.documentElement.classList.contains("vc-session-verify-pending");
        } catch (eP) {}
        if (!pending && !el) return;
        clearSessionPendingUi();
      } catch (eFs) {
        clearSessionPendingUi();
      }
    }, 280);
  }

  function armSessionPendingUi() {
    injectDiscordApiPreconnect();
    injectEarlySessionOverlayCss();
    document.documentElement.classList.add("vc-session-verify-pending");
    armSessionPendingFailsafe();
    function onReady() {
      mountEarlySessionOverlay();
      dismissAuthGates();
    }
    if (document.body) onReady();
    else document.addEventListener("DOMContentLoaded", onReady);
  }

  bootEarlyAuthHeader();

  if (isBlockingSessionVerifyPage() && hasLikelyDiscordSession()) {
    armSessionPendingUi();
  }
})();
