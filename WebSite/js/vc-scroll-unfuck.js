/* scrollPortFix5 — inline !important su html/body: unico modo di battere soft-fx + quirk. */
(function () {
    var VER = "20261006violKill5";
  if (window.__vcScrollPortFix === VER) return;
  window.__vcScrollPortFix = VER;
  window.__vcScrollUnfuck = VER;

  function injectCss() {
    var id = "vc-scroll-port-fix-css";
    var st = document.getElementById(id);
    if (!st) {
      st = document.createElement("style");
      st.id = id;
    }
    try {
      document.documentElement.appendChild(st);
    } catch (eMv) {
      try {
        (document.head || document.documentElement).appendChild(st);
      } catch (e2) {}
    }
    st.setAttribute("data-vc", VER);
    st.textContent =
      "html,html.vc-site-polish,html.vc-page-cine-ready,html.vc-cine-curtain-off," +
      "html.vc-chrome-scroll-armed,html.vc-soft-fx-ready{" +
      "overflow-x:hidden!important;overflow-y:scroll!important;" +
      "touch-action:pan-y!important;height:auto!important;max-height:none!important;" +
      "scrollbar-width:none!important;scrollbar-gutter:auto!important;-ms-overflow-style:none!important}" +
      "html body,html.vc-site-polish body,body.vc-body,html body.vc-body," +
      "html.vc-site-polish.vc-cine-curtain-off body," +
      "html.vc-site-polish.vc-cine-curtain-off.vc-page-cine-ready.vc-loader-blocking-live body," +
      "html.vc-site-polish.vc-page-cine-ready:not(.vc-chrome-scroll-armed) body," +
      "html.vc-site-polish:has(#vc-site-progress.is-loading) body," +
      "body.overflow-x-hidden{" +
      "overflow:visible!important;overflow-x:visible!important;overflow-y:visible!important;" +
      "touch-action:pan-y!important;height:auto!important;max-height:none!important;" +
      "position:static!important;top:auto!important}" +
      "html::-webkit-scrollbar,body::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;background:transparent!important}" +
      "html::-webkit-scrollbar-thumb,html::-webkit-scrollbar-track{display:none!important;background:transparent!important}";
  }

  function forceInline() {
    try {
      var root = document.documentElement;
      var body = document.body;
      if (root) {
        root.style.setProperty("overflow-x", "hidden", "important");
        root.style.setProperty("overflow-y", "scroll", "important");
        root.style.setProperty("height", "auto", "important");
        root.style.setProperty("max-height", "none", "important");
        root.style.setProperty("touch-action", "pan-y", "important");
      }
      if (body) {
        /* MAI overflow-x:hidden sul body (quirk → overflow-y computato auto) */
        body.style.setProperty("overflow", "visible", "important");
        body.style.setProperty("overflow-x", "visible", "important");
        body.style.setProperty("overflow-y", "visible", "important");
        body.style.setProperty("height", "auto", "important");
        body.style.setProperty("max-height", "none", "important");
        body.style.setProperty("position", "static", "important");
        body.style.setProperty("top", "auto", "important");
        body.style.setProperty("touch-action", "pan-y", "important");
      }
    } catch (eIn) {}
  }

  function stripLocks() {
    var root = document.documentElement;
    if (!root) return;
    root.classList.remove(
      "vc-scroll-reload-top-lock",
      "vc-loading-scroll-lock",
      "vc-loader-blocking-live",
      "vc-scroll-soft-lock",
      "vc-ui-scroll-lock",
      "vc-interaction-hold",
      "vc-ptr-scroll-restore-pending",
      "vc-chrome-bar-loading",
    );
    try {
      window.__vcBootScrollGuardsKilled = 1;
      window.__vcPtrRestoreDone = 1;
      window.__vcChromeLoadDone = 1;
      window.__vcChromeScrollArmed = 1;
      root.classList.add("vc-chrome-scroll-armed", "vc-page-cine-ready", "vc-cine-curtain-off");
    } catch (e1) {}
    try {
      var topCss = document.getElementById("vc-scroll-reload-top-lock-css");
      if (topCss && topCss.parentNode) topCss.parentNode.removeChild(topCss);
    } catch (e2) {}
    try {
      var prog = document.getElementById("vc-site-progress");
      if (prog) prog.classList.remove("is-loading");
    } catch (eProg) {}
    try {
      if (typeof window.__vcForceUnlockChromeScroll === "function") {
        window.__vcForceUnlockChromeScroll("scrollPortFix5");
      }
    } catch (eCh) {}
  }

  function armWheelShield() {
    if (window.__vcWheelShieldArmed) return;
    window.__vcWheelShieldArmed = 1;
    var orig = Event.prototype.preventDefault;
    Event.prototype.preventDefault = function () {
      try {
        var t = this && this.type;
        if (t === "wheel" || t === "mousewheel" || t === "touchmove") {
          /* violKill5: dopo unlock, block preventDefault SENZA closest() (era Violation 200-400ms) */
          if (window.__vcBootScrollGuardsKilled) {
            var el = this.target;
            if (el) {
              var n = el.nodeName;
              if (n === "TEXTAREA" || n === "SELECT" || (el.isContentEditable)) {
                return orig.apply(this, arguments);
              }
              /* data flag only — no querySelector/closest */
              if (el.getAttribute && el.getAttribute("data-vc-allow-wheel-lock") === "1") {
                return orig.apply(this, arguments);
              }
              var p = el.parentElement;
              var hops = 0;
              while (p && hops < 6) {
                if (p.getAttribute && p.getAttribute("data-vc-allow-wheel-lock") === "1") {
                  return orig.apply(this, arguments);
                }
                var cn = p.className;
                if (typeof cn === "string" && (
                  cn.indexOf("vc-notif-panel") !== -1 ||
                  cn.indexOf("vc-mobile-nav-drawer") !== -1 ||
                  cn.indexOf("vc-dialog") !== -1 ||
                  cn.indexOf("vc-staff-inbox-sheet") !== -1 ||
                  cn.indexOf("vc-wt-chat__log") !== -1
                )) {
                  return orig.apply(this, arguments);
                }
                p = p.parentElement;
                hops++;
              }
            }
            return;
          }
        }
      } catch (eBlk) {}
      return orig.apply(this, arguments);
    };
  }

  function pinSoftHref() {
    try {
      var soft = document.getElementById("vc-soft-fx-css");
      if (!soft) return;
      var want = "/css/vc-soft-fx.20261006scrollPortFix5.css?v=20261006scrollPortFix5";
      var cur = String(soft.getAttribute("href") || "");
      if (cur.indexOf("scrollPortFix5") === -1 && cur.indexOf("violKill5") === -1) {
        soft.setAttribute("href", want);
        window.__vcSoftFxHrefLocked = true;
      }
    } catch (eSoft) {}
  }

  function kick() {
    stripLocks();
    injectCss();
    forceInline();
    pinSoftHref();
    armWheelShield();
  }

  injectCss();
  forceInline();
  stripLocks();
  window.__vcForceScrollUnlock = kick;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", kick, { once: true });
  }
  window.addEventListener("load", kick, { once: true });
  document.addEventListener("vc:page-cine-ready", kick, { passive: true });
  document.addEventListener("vc:cine-curtain-off", kick, { passive: true });
  window.setTimeout(kick, 0);
  window.setTimeout(kick, 300);
  window.setTimeout(kick, 900);
  window.setTimeout(kick, 1800);
  window.setTimeout(kick, 3200);
})();
