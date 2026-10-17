/* stickyChrome2b + ticketsStickyKill1 + wikiBotStickyKill1 + switcherStickyKill2
   + scrollLoadYoYoKill3 — sticky SOLO legal TOC; no arm durante sipario
   + scrollLoadYoYoKill4 — stesso gate, stamp allineato
   + profileSwitcherStickyKill1 — Community|Staff profilo non segue scroll
   + legalTocKill1: niente #vc-sticky-toc sulle policy (switcher sezioni non richiesto) */
(function (global) {
  "use strict";
  if (global.__vcStickyChromeReady === "legalTocKill1") return;
  global.__vcStickyChromeReady = "legalTocKill1";

  /* switcherStickyKill2 + profileSwitcherStickyKill1: niente sticky su tab/scope switcher */
  var BAR_SEL = ["#vc-sticky-toc", ".vc-sticky-bar"].join(",");
  var SWITCHER_KILL_SEL = [
    "#vc-regole-tabs",
    ".vc-regole-tabs",
    "#vc-staff-guide-tabs",
    "#vc-ul-board-tabs",
    ".vc-ul-board-tabs",
    ".vc-notify-filter-bar",
    ".vc-notif-scope-bar",
    ".vc-feedback-scope-bar",
    ".vc-candidature-tabs",
    ".vc-wiki-bot-switch",
    ".vc-wiki-bot-switch__seg",
    ".vc-wiki-cmd-shell .vc-cmd-tabs",
    ".vc-role-seg-switch",
    ".vc-role-seg-switch__seg",
    ".vc-appelli-mode",
    ".vc-cpf-dock",
    ".vc-pers-hub__tabs",
    ".vc-wt-scope-bar",
    ".vc-wt-scope-dock",
    ".vc-wt-filter-menu",
    ".vc-feedback-scope-dock",
    ".vc-reviews-scope-dock",
    "#vc-notif-scope-dock",
    ".vc-user-profile-tabs",
    "[data-vc-profile-tabs]",
    ".vc-user-profile-switcher",
    ".vc-staff-pt-seg",
  ].join(",");

  function qs(sel, root) {
    try { return (root || document).querySelector(sel); } catch (e) { return null; }
  }
  function qsa(sel, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; }
  }

  function pinStickyCssLast() {
    try {
      var link =
        document.getElementById("vc-sticky-chrome-css") ||
        document.querySelector('link[href*="vc-sticky-chrome"]');
      if (!link) return;
      link.id = "vc-sticky-chrome-css";
      var mount = document.head || document.documentElement;
      if (link.parentNode !== mount || mount.lastElementChild !== link) {
        mount.appendChild(link);
      }
    } catch (eP) {}
  }

  function measureStickyTop() {
    try {
      var header = qs("body.vc-body > header") || qs("header.fixed") || qs("header");
      var h = 0;
      if (header) h = Math.max(0, Math.ceil(header.getBoundingClientRect().bottom));
      if (!h) h = Math.round((window.innerWidth < 900 ? 4.1 : 4.35) * 16);
      document.documentElement.style.setProperty("--vc-sticky-top", h + 8 + "px");
    } catch (eM) {}
  }

  function forceSticky(el) {
    if (!el) return;
    try {
      /* batte look-core position:relative !important */
      el.style.setProperty("position", "sticky", "important");
      el.style.setProperty("top", "var(--vc-sticky-top)", "important");
      el.style.setProperty("z-index", "var(--vc-sticky-z, 42)", "important");
      el.classList.add("vc-sticky-armed");
    } catch (eF) {}
  }

  function skipBar(el) {
    if (!el) return true;
    try {
      /* sticky solo legal TOC */
      if (el.id === "vc-sticky-toc") return false;
      if (el.classList.contains("vc-regole-tabs--sub")) return true;
      /* switcherStickyKill2 + profileSwitcherStickyKill1: qualsiasi switcher/tab NON sticky */
      if (
        el.classList.contains("vc-wiki-bot-switch") ||
        el.classList.contains("vc-cmd-tabs") ||
        el.classList.contains("vc-regole-tabs") ||
        el.classList.contains("vc-ul-board-tabs") ||
        el.classList.contains("vc-notify-filter-bar") ||
        el.classList.contains("vc-notif-scope-bar") ||
        el.classList.contains("vc-feedback-scope-bar") ||
        el.classList.contains("vc-candidature-tabs") ||
        el.classList.contains("vc-role-seg-switch") ||
        el.classList.contains("vc-appelli-mode") ||
        el.classList.contains("vc-cpf-dock") ||
        el.classList.contains("vc-pers-hub__tabs") ||
        el.classList.contains("vc-wt-filter-menu") ||
        el.classList.contains("vc-wt-scope-dock") ||
        el.classList.contains("vc-sticky-stack") ||
        el.classList.contains("vc-wt-scope-bar") ||
        el.classList.contains("vc-user-profile-tabs") ||
        el.classList.contains("vc-user-profile-switcher") ||
        el.classList.contains("vc-staff-pt-seg") ||
        el.hasAttribute("data-vc-profile-tabs")
      ) {
        return true;
      }
      if (el.id === "vc-regole-tabs" || el.id === "vc-staff-guide-tabs" || el.id === "vc-ul-board-tabs" || el.id === "vc-notif-scope-dock") {
        return true;
      }
      if (
        el.closest &&
        el.closest(
          ".vc-wiki-bot-switch, .vc-wiki-cmd-shell .vc-cmd-tabs, #vc-wt-app, .vc-wt-chrome, .vc-sticky-stack, .vc-role-seg-switch, .vc-feedback-scope-dock, .vc-reviews-scope-dock, #vc-notif-scope-dock, .vc-cpf-dock, .vc-pers-hub__tabs, .vc-user-profile-tabs, [data-vc-profile-tabs], .vc-user-profile-switcher, .vc-staff-pt-seg",
        )
      ) {
        return true;
      }
    } catch (eS) {}
    return false;
  }

  function unwrapSwitcherSticky() {
    try {
      qsa(SWITCHER_KILL_SEL).forEach(function (el) {
        try {
          el.classList.remove("vc-sticky-armed", "is-stuck");
          el.style.removeProperty("position");
          el.style.removeProperty("top");
          el.style.removeProperty("z-index");
          el.style.removeProperty("background");
          el.style.removeProperty("background-color");
          el.style.removeProperty("background-image");
          el.style.removeProperty("box-shadow");
          el.style.removeProperty("border-bottom");
          el.style.removeProperty("backdrop-filter");
          el.style.removeProperty("-webkit-backdrop-filter");
          if (el._vcStickyIo) {
            try {
              el._vcStickyIo.disconnect();
            } catch (eD) {}
            el._vcStickyIo = null;
          }
          el._vcStickyStuck = 0;
        } catch (eClr) {}
      });
      qsa(".vc-sticky-sentinel").forEach(function (s) {
        try {
          var bar = s.nextElementSibling;
          if ((!bar || skipBar(bar) || bar.id !== "vc-sticky-toc") && bar && bar.id !== "vc-sticky-toc") {
            if (s.parentNode) s.parentNode.removeChild(s);
          } else if (!bar && s.parentNode) {
            s.parentNode.removeChild(s);
          }
        } catch (eR) {}
      });
    } catch (eW) {}
  }

  function unwrapWikiBotSwitch() {
    unwrapSwitcherSticky();
  }

  function armStuck(el) {
    if (!el || skipBar(el)) return;
    forceSticky(el);
    if (el._vcStickyStuck) return;
    el._vcStickyStuck = 1;
    var sent = document.createElement("span");
    sent.className = "vc-sticky-sentinel";
    sent.setAttribute("aria-hidden", "true");
    sent.style.cssText =
      "display:block;width:1px;height:1px;margin:0;padding:0;overflow:hidden;pointer-events:none;";
    try { el.parentNode.insertBefore(sent, el); } catch (eIns) { return; }
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(
      function (entries) {
        var e0 = entries && entries[0];
        if (!e0) return;
        el.classList.toggle("is-stuck", !e0.isIntersecting);
        forceSticky(el);
      },
      { root: null, threshold: 0, rootMargin: "-1px 0px 0px 0px" }
    );
    io.observe(sent);
    el._vcStickyIo = io;
  }

  function unwrapTicketsChrome() {
    try {
      var app = qs("#vc-wt-app");
      if (!app) return;
      var chrome = qs(".vc-wt-chrome", app) || app;
      qsa(".vc-sticky-stack", app).forEach(function (stack) {
        try {
          while (stack.firstChild) {
            chrome.insertBefore(stack.firstChild, stack);
          }
          if (stack.parentNode) stack.parentNode.removeChild(stack);
        } catch (eU) {}
      });
      qsa(".vc-wt-scope-dock, .vc-wt-filter-menu, .vc-wt-scope-bar", app).forEach(function (el) {
        try {
          el.classList.remove("vc-sticky-armed", "is-stuck");
          el.style.removeProperty("position");
          el.style.removeProperty("top");
          el.style.removeProperty("z-index");
          el.style.removeProperty("background");
          el.style.removeProperty("background-color");
          el.style.removeProperty("box-shadow");
          el.style.removeProperty("border-bottom");
        } catch (eClr) {}
      });
    } catch (eW) {}
  }

  function wrapTicketsChrome() {
    /* ticketsStickyKill1: non wrappare — unwrap se residuo sticky */
    unwrapTicketsChrome();
  }

  function forceTicketsSidebar() {
    if (window.matchMedia && !window.matchMedia("(min-width: 901px)").matches) return;
    qsa("#vc-wt-sidebar, .vc-wt-sidebar").forEach(function (el) {
      try {
        el.style.setProperty("position", "sticky", "important");
        el.style.setProperty("top", "var(--vc-sticky-top)", "important");
        el.style.setProperty("align-self", "start", "important");
        el.style.setProperty("max-height", "calc(100dvh - var(--vc-sticky-top) - 1rem)", "important");
        el.style.setProperty("overflow", "auto", "important");
      } catch (eS) {}
    });
  }

  function killLegalToc() {
    try {
      qsa("#vc-sticky-toc").forEach(function (el) {
        try {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        } catch (eRm) {}
      });
    } catch (eK) {}
  }

  function buildLegalToc() {
    /* legalTocKill1: non creare più lo switcher sezioni policy */
    killLegalToc();
  }

  function scan() {
    pinStickyCssLast();
    measureStickyTop();
    wrapTicketsChrome();
    unwrapWikiBotSwitch();
    /* scrollLoadYoYoKill3: niente arm sticky / layout thrash durante sipario-load */
    try {
      if (
        !window.__vcChromeVisualReady &&
        document.documentElement &&
        !document.documentElement.classList.contains("vc-cine-curtain-off")
      ) {
        unwrapSwitcherSticky();
        return;
      }
    } catch (eBoot) {}
    buildLegalToc();
    forceTicketsSidebar();
    qsa(BAR_SEL).forEach(armStuck);
    unwrapWikiBotSwitch();
    qsa(".vc-sticky-armed").forEach(function (el) {
      if (!skipBar(el)) forceSticky(el);
    });
  }

  var tMeasure = 0;
  function onResize() {
    if (tMeasure) clearTimeout(tMeasure);
    tMeasure = setTimeout(function () {
      tMeasure = 0;
      measureStickyTop();
      forceTicketsSidebar();
      qsa(".vc-sticky-armed").forEach(function (el) {
        if (!skipBar(el)) forceSticky(el);
        else unwrapSwitcherSticky();
      });
    }, 80);
  }

  function boot() {
    scan();
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    document.addEventListener("vc:page-cine-ready", scan, { passive: true });
    document.addEventListener("vc:tickets-ready", scan, { passive: true });
    try {
      /* consoleClean1: debounce MO — evita violation setInterval/rAF da storm DOM */
      var moT = 0;
      var mo = new MutationObserver(function () {
        /* inputLagKill1: skip mentre digiti — unwrap/querySelector storm lagga input */
        try {
          if (window.__vcTypingHot) return;
        } catch (eHot) {}
        if (moT) return;
        moT = window.setTimeout(function () {
          moT = 0;
          try {
            if (window.__vcTypingHot) return;
          } catch (eHot2) {}
          if (qs("#vc-wt-app")) unwrapTicketsChrome();
          unwrapWikiBotSwitch();
          if (qs(".vc-legal-stack") && !qs("#vc-sticky-toc")) {
            buildLegalToc();
          }
          forceTicketsSidebar();
          qsa(BAR_SEL).forEach(armStuck);
          unwrapWikiBotSwitch();
        }, 120);
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (eMo) {}
    window.setTimeout(scan, 200);
    window.setTimeout(scan, 800);
    window.setTimeout(scan, 1800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  global.VcStickyChrome = { scan: scan, measure: measureStickyTop, ver: "legalTocKill1" };
})(typeof window !== "undefined" ? window : this);
