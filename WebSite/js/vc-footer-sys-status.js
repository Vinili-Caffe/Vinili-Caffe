/* footerSysPillAlways1 — badge stato sistemi a fianco del © (Kuma heartbeat) */
/* sitePerfAll1: refresh off in settle / tab hidden */
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  var VER = "footerSysLook7";
  if (window.__vcFooterSysStatusWired === VER) return;
  window.__vcFooterSysStatusWired = VER;

  var SLUG = "vinili";
  var KUMA_HB = "/status-kuma/api/status-page/heartbeat/" + SLUG;
  var HREF = "/status/";
  var REFRESH_MS = 60000;
  var timer = null;
  var inFlight = false;
  var observer = null;
  var retryIv = null;

  function t(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (eT) {}
    return fallback;
  }

  function labels(mode) {
    if (mode === "is-ok") {
      return {
        text: t("footer.sysStatus.ok", "Sistemi OK"),
        aria: t("footer.sysStatus.okAria", "Stato sistemi: tutti operativi. Apri la pagina status."),
      };
    }
    if (mode === "is-partial") {
      return {
        text: t("footer.sysStatus.partial", "Degrado parziale"),
        aria: t("footer.sysStatus.partialAria", "Stato sistemi: degrado parziale. Apri la pagina status."),
      };
    }
    if (mode === "is-bad") {
      return {
        text: t("footer.sysStatus.bad", "Servizi offline"),
        aria: t("footer.sysStatus.badAria", "Stato sistemi: alcuni servizi non rispondono. Apri la pagina status."),
      };
    }
    return {
      text: t("footer.sysStatus.wait", "Controllo…"),
      aria: t("footer.sysStatus.waitAria", "Controllo stato sistemi in corso."),
    };
  }

  function findCopyHost() {
    var footers = document.querySelectorAll("footer.vc-premium-footer, footer");
    for (var fi = 0; fi < footers.length; fi += 1) {
      var footer = footers[fi];
      var legal =
        footer.querySelector(".vc-premium-footer__legal") ||
        footer.querySelector("[class*='footer__legal']");
      if (legal) {
        var link =
          legal.querySelector("a.vc-footer-copy-link") ||
          legal.querySelector('a[href*="copyright"]') ||
          legal.querySelector('a[data-i18n="footer.copy"]');
        if (link) {
          var p = link.closest("p");
          if (p) return p;
          return link.parentElement || legal;
        }
        var p0 = legal.querySelector("p");
        if (p0) return p0;
        return legal;
      }
      /* gate/slim footer: paragrafo © senza legal premium */
      var paras = footer.querySelectorAll("p");
      for (var pi = 0; pi < paras.length; pi += 1) {
        var txt = String(paras[pi].textContent || "");
        if (txt.indexOf("©") !== -1 || /Vinili/i.test(txt)) return paras[pi];
      }
    }
    return null;
  }

  function ensureBadge() {
    var host = findCopyHost();
    if (!host) return null;

    var live = document.querySelector("footer .vc-footer-sys-status, .vc-footer-sys-status");
    if (live && host.contains(live)) return live;
    /* pill orfano fuori host (footer re-render) → riusa o ricrea nel host giusto */
    if (live && live.parentNode && !host.contains(live)) {
      try {
        live.parentNode.removeChild(live);
      } catch (eRm) {}
      live = null;
    }

    try {
      host.classList.add("vc-footer-copy-row");
    } catch (eCls) {}

    var a = document.createElement("a");
    a.className = "vc-footer-sys-status is-wait";
    a.href = HREF;
    a.setAttribute("data-vc-footer-sys-status", VER);
    a.setAttribute("data-vc-emoji-skip", "1");
    a.innerHTML =
      '<span class="vc-footer-sys-status__dot" aria-hidden="true"></span>' +
      '<span class="vc-footer-sys-status__label"></span>' +
      '<span class="vc-footer-sys-status__chev" aria-hidden="true"></span>';
    host.appendChild(a);
    paint(a, "is-wait");
    return a;
  }

  function paint(el, mode) {
    if (!el) return;
    var L = labels(mode);
    el.className = "vc-footer-sys-status " + mode;
    el.setAttribute("aria-label", L.aria);
    el.title = L.text;
    var lab = el.querySelector(".vc-footer-sys-status__label");
    if (lab) {
      lab.textContent = L.text;
      /* footerSysPillAlways1: se label vuota (race i18n) forza fallback */
      if (!String(lab.textContent || "").trim()) lab.textContent = L.text || "Controllo…";
    }
  }

  function modeFromHeartbeat(json) {
    var list = (json && json.heartbeatList) || {};
    var ids = Object.keys(list);
    if (!ids.length) return "is-wait";
    var up = 0;
    var down = 0;
    var shown = 0;
    for (var i = 0; i < ids.length; i += 1) {
      var arr = list[ids[i]];
      if (!Array.isArray(arr) || !arr.length) continue;
      var last = arr[arr.length - 1] || {};
      var st = Number(last.status);
      shown += 1;
      if (st === 1) up += 1;
      else if (st === 0) down += 1;
    }
    if (!(shown > 0)) return "is-wait";
    if (down === 0 && up === shown) return "is-ok";
    if (up > 0 && down > 0) return "is-partial";
    if (down === 0 && up > 0) return "is-partial";
    if (down > 0 && up === 0) return "is-bad";
    return "is-wait";
  }

  function refresh() {
    if (inFlight) return;
    var el = ensureBadge();
    if (!el) return;
    inFlight = true;
    fetch(KUMA_HB, { cache: "no-store", credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("hb " + r.status);
        return r.json();
      })
      .then(function (json) {
        paint(el, modeFromHeartbeat(json || {}));
      })
      .catch(function () {
        return fetch("/webhooks/health", { cache: "no-store", credentials: "omit" })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j || {} };
            });
          })
          .then(function (res) {
            if (res && res.ok && res.j && (res.j.ok === true || res.j.status === "ok")) {
              paint(el, "is-ok");
            } else if (res && res.ok) {
              paint(el, "is-partial");
            } else {
              paint(el, "is-wait");
            }
          })
          .catch(function () {
            paint(el, "is-wait");
          });
      })
      .finally(function () {
        inFlight = false;
      });
  }

  function armObserver() {
    if (observer || typeof MutationObserver !== "function") return;
    try {
      observer = new MutationObserver(function () {
        try {
          if (!document.querySelector("footer .vc-footer-sys-status")) {
            ensureBadge();
          }
        } catch (eMo) {}
      });
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
      });
    } catch (eObs) {}
  }

  function boot() {
    var el = ensureBadge();
    if (el) refresh();
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      try {
        if (document.hidden) return;
        if (document.documentElement.classList.contains("vc-cpu-settle")) return;
        if (document.documentElement.classList.contains("vc-page-hidden")) return;
      } catch (eHid) {}
      refresh();
    }, REFRESH_MS);
    armObserver();
    try {
      document.addEventListener(
        "visibilitychange",
        function () {
          try {
            if (document.hidden) return;
            if (document.documentElement.classList.contains("vc-cpu-settle")) return;
            refresh();
          } catch (eVis) {}
        },
        false,
      );
    } catch (eVisArm) {}
  }

  function onI18n() {
    var el = ensureBadge();
    if (!el) return;
    var mode = "is-wait";
    if (el.classList.contains("is-ok")) mode = "is-ok";
    else if (el.classList.contains("is-partial")) mode = "is-partial";
    else if (el.classList.contains("is-bad")) mode = "is-bad";
    paint(el, mode);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  /* footerSysPillAlways1: retry finché il footer legal esiste (cine/chrome tardivi) */
  var tries = 0;
  retryIv = setInterval(function () {
    tries += 1;
    try {
      if (ensureBadge()) {
        refresh();
        if (tries >= 8) {
          clearInterval(retryIv);
          retryIv = null;
        }
      } else if (tries >= 40) {
        clearInterval(retryIv);
        retryIv = null;
      }
    } catch (eRetry) {}
  }, 400);

  try {
    document.addEventListener("vc:i18n", onI18n);
    document.addEventListener("vc:chrome-ready", function () {
      ensureBadge();
      refresh();
    });
    document.addEventListener("vc:chrome-visual-ready", function () {
      ensureBadge();
    });
  } catch (eEv) {}
})();
