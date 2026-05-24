(function () {
  "use strict";

  function navCfg() {
    return window.__VC_HOGWARTS_EVENT_NAV && typeof window.__VC_HOGWARTS_EVENT_NAV === "object"
      ? window.__VC_HOGWARTS_EVENT_NAV
      : null;
  }

  function calendarCfg() {
    return window.__VC_HOGWARTS_EVENT_CALENDAR && typeof window.__VC_HOGWARTS_EVENT_CALENDAR === "object"
      ? window.__VC_HOGWARTS_EVENT_CALENDAR
      : null;
  }

  function previewMode() {
    var nav = navCfg();
    if (nav && nav.previewMode === true) return true;
    var cal = calendarCfg();
    return Boolean(cal && cal.previewMode);
  }

  function isLocalOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function accessApiUrl() {
    var nav = navCfg() || {};
    var local = String(nav.accessApiUrlLocal || "").trim();
    var direct = String(nav.accessApiUrl || "").trim();
    if (isLocalOrigin() && local) return local;
    return direct || "/webhooks/site-hogwarts-sorting/access";
  }

  function getToken() {
    try {
      var t = String(localStorage.getItem("vc_discord_access_token") || "").trim();
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (!t || !exp || Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function unlockPage() {
    try {
      window.__VC_HOGWARTS_STAFF_PREVIEW = true;
      document.body.classList.remove("vc-hw-preview-locked");
      document.dispatchEvent(new CustomEvent("vc-hogwarts-staff-preview-unlock"));
    } catch (e) {}
  }

  function showPreviewGate(message, showLogin) {
    document.body.classList.add("vc-hw-preview-locked");
    var gate = document.getElementById("vc-hw-preview-gate");
    if (!gate) {
      gate = document.createElement("section");
      gate.id = "vc-hw-preview-gate";
      gate.className = "vc-hw-notice vc-hw-preview-gate";
      gate.setAttribute("role", "alert");
      gate.innerHTML =
        '<i class="fa fa-info-circle" aria-hidden="true"></i>' +
        '<div class="vc-hw-gate-body">' +
        '<p id="vc-hw-preview-gate-msg"></p>' +
        '<button type="button" id="vc-hw-preview-gate-login" class="vc-hw-btn vc-hw-btn--primary mt-4 w-full sm:w-auto" data-vc-discord-login hidden>Accedi con Discord</button>' +
        "</div>";
      var main = document.querySelector("main");
      if (main && main.parentNode) main.parentNode.insertBefore(gate, main);
      else document.body.appendChild(gate);
    }
    var msg = document.getElementById("vc-hw-preview-gate-msg");
    var login = document.getElementById("vc-hw-preview-gate-login");
    if (msg) msg.textContent = String(message || "Anteprima riservata all'High Staff del server.");
    if (login) {
      if (showLogin) {
        login.hidden = false;
        login.removeAttribute("hidden");
      } else {
        login.hidden = true;
        login.setAttribute("hidden", "");
      }
    }
    gate.hidden = false;
    gate.removeAttribute("hidden");
  }

  function hidePreviewGate() {
    var gate = document.getElementById("vc-hw-preview-gate");
    if (gate) {
      gate.hidden = true;
      gate.setAttribute("hidden", "");
    }
  }

  function verifyAccess() {
    if (window.__VC_HOGWARTS_STAFF_PREVIEW) {
      unlockPage();
      hidePreviewGate();
      return Promise.resolve(true);
    }
    var token = getToken();
    if (!token) {
      showPreviewGate("Anteprima staff: accedi con Discord (account High Staff) per visualizzare l'evento.", true);
      return Promise.resolve(false);
    }
    var url = accessApiUrl();
    if (!url || /\{\{/.test(url)) {
      showPreviewGate("Anteprima non disponibile: configurazione accesso mancante.", false);
      return Promise.resolve(false);
    }
    return fetch(url, { headers: { Authorization: "Bearer " + token }, credentials: "same-origin" })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (body) {
          if (res.ok && body && body.ok) {
            unlockPage();
            hidePreviewGate();
            return true;
          }
          if (res.status === 401) {
            showPreviewGate("Anteprima staff: accedi con Discord (account High Staff) per visualizzare l'evento.", true);
            return false;
          }
          showPreviewGate((body && body.message) || "In anteprima l'evento Hogwarts è riservato all'High Staff del server.", false);
          return false;
        });
      })
      .catch(function () {
        showPreviewGate("Impossibile verificare l'accesso anteprima. Riprova tra poco.", false);
        return false;
      });
  }

  function boot() {
    if (!previewMode()) return;
    document.body.classList.add("vc-hw-preview-locked");
    verifyAccess();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("vc-discord-profile", function () {
    if (previewMode()) verifyAccess();
  });
  document.addEventListener("vc-hogwarts-staff-preview-unlock", function () {
    unlockPage();
    hidePreviewGate();
  });
})();