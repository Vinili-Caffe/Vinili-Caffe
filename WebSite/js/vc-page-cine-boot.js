(function () {
  /* Load adaptive perf helper as early as possible (sync) for CSS tiers. */
  try {
    if (!window.VcPerf || !window.VcPerf.__ready) {
      var cur = document.currentScript;
      var ver = "20260830ptrFirstTap1";
      var url = "/js/vc-perf.js?v=" + ver;
      try {
        if (cur && cur.src) {
          url = String(cur.src).replace(/vc-page-cine-boot\.js[^?]*/i, "vc-perf.js");
          if (/vc-page-cine-boot/i.test(url)) url = "/js/vc-perf.js?v=" + ver;
          else if (url.indexOf("?") < 0) url += "?v=" + ver;
          else url = url.replace(/([?&]v=)[^&"']*/i, "$1" + ver);
        }
      } catch (eUrl) {}
      document.write('<script src="' + url.replace(/"/g, "") + '"><\/script>');
    } else if (typeof window.VcPerf.apply === "function") {
      window.VcPerf.apply();
    }
  } catch (ePerf) {}

  window.__VC_PAGE_CINE_BOOT_RAN = true;
  var root = document.documentElement;
  if (!root || !root.classList.contains("vc-site-polish")) return;

  function isMobileFastBoot() {
    try {
      if (root.classList.contains("vc-perf-lite")) return true;
      if (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite()) return true;
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      if (
        window.matchMedia &&
        window.matchMedia("(hover: none)").matches &&
        Number(navigator.maxTouchPoints || 0) > 0
      ) {
        return true;
      }
      var w = Number(window.innerWidth || (window.screen && screen.width) || 0);
      if (w > 0 && w <= 920 && Number(navigator.maxTouchPoints || 0) > 0) return true;
    } catch (eFast) {}
    return false;
  }

  var mobileFast = true; // snappyMotion1: mai nascondere main/footer (desktop incluso)

  // Desktop: overlay finché layout pronto. Mobile: solo sfondo scuro, NESSUN hide di main
  // (è la causa della “schermata bianca/vuota” per secondi a ogni apertura/redirect).
  var BOOT_CSS_DESKTOP =
    "html.vc-site-polish.vc-page-cine-boot,html.vc-site-polish.vc-page-cine-boot body{background:#100c09!important;color-scheme:dark}" +
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready){overflow:hidden!important;overscroll-behavior:none!important}" +
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready)::before{content:\"\";position:fixed;inset:0;z-index:2147483000;" +
    "background-color:#100c09;background-image:radial-gradient(ellipse 92% 74% at 50% 38%,rgba(232,196,156,.14) 0%,rgba(28,20,14,.94) 52%,#0a0706 100%);pointer-events:none}" +
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main," +
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer{opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header{position:relative;z-index:2147483001;visibility:visible!important;opacity:1!important}";

  var BOOT_CSS_MOBILE =
    "html,body{background:#100c09!important;color-scheme:dark}" +
    "html.vc-site-polish.vc-page-cine-boot,html.vc-site-polish.vc-page-cine-boot body{background:#100c09!important}" +
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main," +
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer," +
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header{" +
    "opacity:1!important;visibility:visible!important;pointer-events:auto!important}";

  if (!document.getElementById("vc-anti-fouc-css")) {
    var anti = document.createElement("style");
    anti.id = "vc-anti-fouc-css";
    anti.textContent = "html,body{background:#100c09;color-scheme:dark}";
    (document.head || root).appendChild(anti);
  } else {
    try {
      var antiEl = document.getElementById("vc-anti-fouc-css");
      if (antiEl && antiEl.textContent.indexOf("color-scheme") < 0) {
        antiEl.textContent = "html,body{background:#100c09;color-scheme:dark}";
      }
    } catch (eAnti) {}
  }

  root.classList.add("vc-page-cine-boot");
  var bootStyle = document.getElementById("vc-page-cine-boot-css");
  if (!bootStyle) {
    bootStyle = document.createElement("style");
    bootStyle.id = "vc-page-cine-boot-css";
    (document.head || root).insertBefore(bootStyle, (document.head || root).firstChild);
  }
  bootStyle.textContent = mobileFast ? BOOT_CSS_MOBILE : BOOT_CSS_DESKTOP;

  var path = String(location.pathname || "/").replace(/\/+$/, "") || "/";
  var waitStaffCinePaint =
    !mobileFast &&
    (root.classList.contains("vc-staff-cine-route") || path === "/staff") &&
    !root.classList.contains("vc-staff-inbox-route") &&
    path !== "/staff/inbox";

  var finished = false;

  function markStylesReady() {
    root.classList.add("vc-styles-ready");
  }

  function markReady() {
    root.classList.add("vc-page-cine-ready");
    root.classList.remove("vc-page-cine-boot");
    try {
      document.dispatchEvent(new Event("vc:page-cine-ready"));
    } catch (eReadyEvt) {}
  }

  function finishBoot() {
    if (finished) return;
    finished = true;
    markStylesReady();
    markReady();
  }

  function staffLayoutLooksReady() {
    try {
      var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
      if (
        p === "/staff" ||
        (document.body && document.body.classList.contains("vc-staff-profile-home"))
      ) {
        return true;
      }
      return Boolean(
        document.body &&
          document.body.classList.contains("vc-page-cine-layout") &&
          document.querySelector(
            ".vc-page-cine-hero .vc-page-cine-hero__inner .vc-hero-head, .vc-page-cine-hero > .vc-page-cine-hero__inner > .vc-hero-head",
          ),
      );
    } catch (eReady) {
      return false;
    }
  }

  function forceStaffCineLayout() {
    try {
      if (typeof window.__vcBootStaffCineLayout === "function") {
        window.__vcBootStaffCineLayout(true);
        return;
      }
    } catch (eBoot) {}
    try {
      if (typeof window.__vcPageHeroLayout === "function") {
        window.__vcPageHeroLayout({ force: true });
      }
    } catch (eLayout) {}
  }

  function waitForStaffCineThenFinish() {
    markStylesReady();
    forceStaffCineLayout();
    if (
      root.classList.contains("vc-home-cine-live") ||
      (root.classList.contains("vc-page-cine-ready") && staffLayoutLooksReady())
    ) {
      finishBoot();
      return;
    }
    var done = false;
    var tries = 0;
    function complete() {
      if (done) return;
      done = true;
      try {
        obs.disconnect();
      } catch (eObs) {}
      document.removeEventListener("vc:page-cine-ready", onReadyEvt);
      forceStaffCineLayout();
      finishBoot();
    }
    function onReadyEvt() {
      forceStaffCineLayout();
      if (staffLayoutLooksReady() || root.classList.contains("vc-home-cine-live") || tries > 8) {
        complete();
      }
    }
    document.addEventListener("vc:page-cine-ready", onReadyEvt);
    var obs = new MutationObserver(function () {
      if (root.classList.contains("vc-home-cine-live") || staffLayoutLooksReady()) {
        complete();
      }
    });
    try {
      obs.observe(root, { attributes: true, attributeFilter: ["class"] });
      if (document.body) obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    } catch (eObserve) {}
    function tick() {
      if (done) return;
      tries += 1;
      forceStaffCineLayout();
      if (root.classList.contains("vc-home-cine-live") || staffLayoutLooksReady()) {
        complete();
        return;
      }
      if (tries < 24) {
        window.setTimeout(tick, 50);
        return;
      }
      complete();
    }
    window.setTimeout(tick, 16);
    window.setTimeout(complete, 280);
  }

  function stylesheetPending(link) {
    if (!link) return false;
    try {
      if (link.sheet) {
        if (link.sheet.cssRules && link.sheet.cssRules.length) return false;
        if (link.sheet.rules && link.sheet.rules.length) return false;
      }
    } catch (eSheet) {
      return true;
    }
    return true;
  }

  function waitForCoreStyles(done) {
    var doneCalled = false;
    function finish() {
      if (doneCalled) return;
      doneCalled = true;
      done();
    }
    if (mobileFast) {
      // Telefono: non bloccare il paint in attesa di CSS pesanti.
      window.setTimeout(finish, 0);
      window.setTimeout(finish, 180);
      return;
    }
    var needles = ["vc-landing.css", "tw-build.css"];
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    var pending = 0;
    var i;
    for (i = 0; i < links.length; i += 1) {
      var href = String(links[i].getAttribute("href") || links[i].href || "");
      var hit = false;
      var n;
      for (n = 0; n < needles.length; n += 1) {
        if (href.indexOf(needles[n]) !== -1) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
      if (!stylesheetPending(links[i])) continue;
      pending += 1;
      (function (link) {
        function onDone() {
          link.removeEventListener("load", onDone);
          link.removeEventListener("error", onDone);
          pending -= 1;
          if (pending <= 0) finish();
        }
        link.addEventListener("load", onDone);
        link.addEventListener("error", onDone);
      })(links[i]);
    }
    if (pending <= 0) {
      finish();
      return;
    }
    window.setTimeout(finish, 160);
  }

  try {
    window.__vcWaitForCoreStyles = waitForCoreStyles;
    window.__vcMarkStylesReady = markStylesReady;
  } catch (eExport) {}

  function runLayout() {
    if (typeof window.__vcEnsureCommunityPageCineLayout === "function") {
      window.__vcEnsureCommunityPageCineLayout();
    }
    if (typeof window.__vcPageHeroLayout === "function") {
      window.__vcPageHeroLayout({ force: true });
      return true;
    }
    return false;
  }

  function layoutLooksApplied() {
    try {
      if (!document.body) return false;
      if (document.body.classList.contains("vc-page-cine-layout")) return true;
      if (
        root.classList.contains("vc-user-profile-route") ||
        root.classList.contains("vc-user-profile-pending") ||
        document.body.classList.contains("vc-hw-page") ||
        document.body.classList.contains("vc-seratafilm-page") ||
        document.body.classList.contains("vc-user-profile-page")
      ) {
        return true;
      }
    } catch (eL) {}
    return false;
  }

  function waitForLayoutThenFinish() {
    markStylesReady();
    if (root.classList.contains("vc-page-cine-ready")) {
      finishBoot();
      return;
    }
    if (mobileFast) {
      try {
        runLayout();
      } catch (eLay) {}
      // Reveal immediato: layout può continuare dopo.
      requestAnimationFrame(function () {
        finishBoot();
        try {
          runLayout();
        } catch (eLay2) {}
      });
      window.setTimeout(finishBoot, 120);
      return;
    }
    if (runLayout() && layoutLooksApplied()) {
      requestAnimationFrame(function () {
        requestAnimationFrame(finishBoot);
      });
      return;
    }

    document.addEventListener(
      "vc:page-cine-ready",
      function onReady() {
        try {
          runLayout();
        } catch (eR) {}
        finishBoot();
      },
      { once: true },
    );

    var tries = 0;
    var timer = window.setInterval(function () {
      tries += 1;
      var ok = runLayout();
      if ((ok && layoutLooksApplied()) || root.classList.contains("vc-page-cine-ready")) {
        window.clearInterval(timer);
        requestAnimationFrame(function () {
          requestAnimationFrame(finishBoot);
        });
        return;
      }
      if (tries > 24) {
        window.clearInterval(timer);
        finishBoot();
      }
    }, 40);

    window.setTimeout(finishBoot, 220);
  }

  function afterStyles() {
    if (waitStaffCinePaint) {
      waitForStaffCineThenFinish();
      return;
    }
    waitForLayoutThenFinish();
  }

  if (root.classList.contains("vc-user-leader-pending")) {
    var pendingObs = new MutationObserver(function () {
      if (!root.classList.contains("vc-user-leader-pending")) {
        pendingObs.disconnect();
        root.classList.add("vc-page-cine-boot");
        waitForCoreStyles(afterStyles);
      }
    });
    pendingObs.observe(root, { attributes: true, attributeFilter: ["class"] });
    waitForCoreStyles(function () {});
    return;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      waitForCoreStyles(afterStyles);
    });
  } else {
    waitForCoreStyles(afterStyles);
  }
})();
