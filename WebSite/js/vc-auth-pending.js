(function () {
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

  function isBlockingSessionVerifyPage() {
    try {
      try {
        if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return false;
      } catch (ePwa) {}
      try {
        if (navigator.standalone) return false;
      } catch (eIos) {}
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

  if (!isBlockingSessionVerifyPage()) return;

  function hasLikelyDiscordSession() {
    try {
      var h = window.location.hash || "";
      if (h.indexOf("access_token=") !== -1) return true;
    } catch (eH) {}
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      if (!t) return false;
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      // Allinea a getToken(): senza expires_at la sessione resta valida.
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
        "html.vc-session-verify-pending .vc-reviews-gate," +
        "html.vc-session-verify-pending .vc-auth-required-card{" +
        "visibility:hidden!important;pointer-events:none!important;}" +
        "html.vc-session-verify-pending #discord-login-btn," +
        "html.vc-session-verify-pending button[data-vc-discord-login]{" +
        "visibility:hidden!important;}";
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
    // Sempre rimuovere overlay dopo timeout: discord-auth toglie la classe pending
    // prima di finire @me, quindi non basarsi solo su quella classe.
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
    }, 1800);
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

  if (hasLikelyDiscordSession()) {
    armSessionPendingUi();
  }
})();
