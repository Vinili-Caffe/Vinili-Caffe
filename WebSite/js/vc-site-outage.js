/*! 20261014siteOutage1 — banner amichevole su 502/503/504 (riavvio API) */
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  var VER = "20261014siteOutage1";
  if (window.__vcSiteOutage === VER) return;
  window.__vcSiteOutage = VER;

  var HIT_NEED = 2;
  var WINDOW_MS = 20000;
  var HIDE_AFTER_OK_MS = 4000;
  var AUTO_HEALTH_MS = 20000;
  var hits = [];
  var visible = false;
  var healthTimer = 0;
  var hideTimer = 0;
  var lastShowAt = 0;

  function isTransient(status) {
    var s = Number(status) || 0;
    return s === 502 || s === 503 || s === 504 || s === 0;
  }

  function prune(now) {
    hits = hits.filter(function (t) {
      return now - t < WINDOW_MS;
    });
  }

  function ensureUi() {
    var el = document.getElementById("vc-site-outage");
    if (el) return el;
    el = document.createElement("div");
    el.id = "vc-site-outage";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.hidden = true;
    el.innerHTML =
      '<div class="vc-site-outage__card">' +
      '<strong class="vc-site-outage__title">Servizi in aggiornamento</strong>' +
      '<p class="vc-site-outage__body">Stiamo riavviando una parte del sito. Riprova tra un minuto.</p>' +
      '<div class="vc-site-outage__actions">' +
      '<button type="button" class="vc-site-outage__btn" data-vc-outage-retry>Riprova</button>' +
      '<a class="vc-site-outage__link" href="/status/">Stato</a>' +
      '<button type="button" class="vc-site-outage__x" data-vc-outage-dismiss aria-label="Chiudi">×</button>' +
      "</div></div>";
    (document.body || document.documentElement).appendChild(el);
    el.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-vc-outage-dismiss]")) {
        hide(true);
        return;
      }
      if (t.closest("[data-vc-outage-retry]")) {
        checkHealth(true);
      }
    });
    return el;
  }

  function ensureCss() {
    if (document.getElementById("vc-site-outage-css")) return;
    var s = document.createElement("style");
    s.id = "vc-site-outage-css";
    s.textContent =
      "#vc-site-outage{position:fixed;left:50%;bottom:max(1rem,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483600;width:min(26rem,calc(100vw - 1.5rem));pointer-events:none}" +
      "#vc-site-outage[hidden]{display:none!important}" +
      "#vc-site-outage .vc-site-outage__card{pointer-events:auto;background:rgba(20,15,12,.94);color:#f7efe6;border:1px solid rgba(255,247,236,.16);border-radius:1rem;padding:.9rem 1rem;box-shadow:0 16px 40px rgba(0,0,0,.45);backdrop-filter:blur(8px)}" +
      "#vc-site-outage .vc-site-outage__title{display:block;font:700 .95rem/1.3 system-ui,sans-serif;margin:0 0 .25rem}" +
      "#vc-site-outage .vc-site-outage__body{margin:0 0 .7rem;font:400 .86rem/1.4 system-ui,sans-serif;color:rgba(247,239,230,.78)}" +
      "#vc-site-outage .vc-site-outage__actions{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap}" +
      "#vc-site-outage .vc-site-outage__btn{appearance:none;border:0;border-radius:.7rem;padding:.45rem .8rem;font:650 .82rem system-ui,sans-serif;background:linear-gradient(180deg,#e8c9a8,#c49a72);color:#1a120e;cursor:pointer}" +
      "#vc-site-outage .vc-site-outage__link{color:#e8c9a8;font:650 .82rem system-ui,sans-serif;text-decoration:none}" +
      "#vc-site-outage .vc-site-outage__x{margin-left:auto;appearance:none;border:0;background:transparent;color:rgba(247,239,230,.7);font-size:1.2rem;line-height:1;cursor:pointer;padding:.15rem .35rem}";
    (document.head || document.documentElement).appendChild(s);
  }

  function show(reason) {
    ensureCss();
    var el = ensureUi();
    visible = true;
    lastShowAt = Date.now();
    el.hidden = false;
    el.removeAttribute("hidden");
    el.setAttribute("data-reason", String(reason || "outage"));
    armHealthPoll();
  }

  function hide(forced) {
    visible = false;
    hits = [];
    var el = document.getElementById("vc-site-outage");
    if (el) {
      el.hidden = true;
      el.setAttribute("hidden", "");
    }
    if (healthTimer) {
      window.clearInterval(healthTimer);
      healthTimer = 0;
    }
    if (forced) lastShowAt = Date.now();
  }

  function armHealthPoll() {
    if (healthTimer) return;
    healthTimer = window.setInterval(function () {
      checkHealth(false);
    }, AUTO_HEALTH_MS);
  }

  function checkHealth(manual) {
    var url = "/webhooks/health";
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var to = window.setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (eA) {}
    }, 6000);
    var init = { credentials: "omit", cache: "no-store" };
    if (ctrl) init.signal = ctrl.signal;
    Promise.resolve(window.fetch(url, init))
      .then(function (res) {
        window.clearTimeout(to);
        if (res && res.ok) {
          if (hideTimer) window.clearTimeout(hideTimer);
          hideTimer = window.setTimeout(function () {
            hide(false);
          }, manual ? 200 : HIDE_AFTER_OK_MS);
          return;
        }
        if (manual) show("health_bad");
      })
      .catch(function () {
        window.clearTimeout(to);
        if (manual) show("health_fail");
      });
  }

  function note(status, meta) {
    try {
      if (document.documentElement.classList.contains("vc-maintenance-pending")) return;
    } catch (eM) {}
    var st = Number(status);
    if (!isTransient(st) && st !== 0) return;
    /* ignora soft429 sintetici */
    try {
      if (meta && meta.soft429) return;
    } catch (eS) {}
    var now = Date.now();
    /* anti-flicker: dopo dismiss manuale aspetta un po' */
    if (!visible && now - lastShowAt < 8000 && lastShowAt > 0 && hits.length === 0) {
      /* allow counting again after dismiss window */
    }
    prune(now);
    hits.push(now);
    if (hits.length >= HIT_NEED || (st === 503 && hits.length >= 1)) {
      show(st || "net");
    }
  }

  window.__vcNoteSiteOutage = note;
  window.__vcShowSiteOutage = show;
  window.__vcHideSiteOutage = hide;

  /* wire dopo fetch gate se già installato */
  try {
    document.addEventListener(
      "vc:webhook-outage",
      function (ev) {
        var d = (ev && ev.detail) || {};
        note(d.status, d);
      },
      false,
    );
  } catch (eEv) {}
})();
