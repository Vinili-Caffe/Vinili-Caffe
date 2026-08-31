(function () {
  /* phoneRootUnlock1: last-wins CSS — batte inline cine-boot / roles / pending su telefono. */
  try {
    var ID = "vc-phone-root-unlock-css";
    var css =
      "@media (pointer:coarse),(max-width:920px){" +
      "html,html body,html.vc-page-cine-boot,html.vc-page-cine-boot body," +
      "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready)," +
      "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body," +
      "html.vc-user-leader-pending,html.vc-user-leader-pending body," +
      "html.vc-user-profile-pending,html.vc-user-profile-pending body," +
      "html.vc-loading-scroll-lock,html.vc-loading-scroll-lock body," +
      "html.vc-rank-customize-pending,html.vc-rank-customize-pending body," +
      "html.vc-custom-profile-pending,html.vc-custom-profile-pending body," +
      "html.vc-session-verify-pending,html.vc-session-verify-pending body," +
      "html.vc-staff-access-pending,html.vc-staff-access-pending body," +
      "html.vc-notif-sheet-open,html.vc-notif-sheet-open body," +
      "html.vc-dialog-open,html.vc-dialog-open body," +
      "html.vc-mobile-nav-open,html.vc-mobile-nav-open body," +
      "html:has(.vc-ul-loading:not([hidden])),html:has(.vc-ul-loading:not([hidden])) body," +
      "html:has(#vc-roles-loading:not([hidden])),html:has(#vc-roles-loading:not([hidden])) body{" +
      "touch-action:manipulation!important}" +
      "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready)," +
      "html.vc-page-cine-boot:not(.vc-page-cine-ready){" +
      "overflow:auto!important;overflow-y:auto!important;overscroll-behavior:auto!important}" +
      "html body,html.vc-user-leader-pending body,html.vc-user-profile-pending body," +
      "html.vc-rank-customize-pending body,html.vc-custom-profile-pending body," +
      "html.vc-loading-scroll-lock body,html:has(.vc-ul-loading:not([hidden])) body," +
      "html:has(#vc-roles-loading:not([hidden])) body{" +
      "position:static!important;inset:auto!important;width:auto!important;top:auto!important;left:auto!important;right:auto!important}" +
      "#vc-ul-loading[hidden],.vc-ul-loading[hidden],#vc-roles-loading[hidden]," +
      "#vc-shared-boot-overlay[hidden]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}" +
      "}";
    function inject() {
      var el = document.getElementById(ID);
      if (!el) {
        el = document.createElement("style");
        el.id = ID;
        el.setAttribute("data-vc", "phoneRootUnlock1");
      }
      el.textContent = css;
      var host = document.head || document.documentElement;
      if (el.parentNode !== host) host.appendChild(el);
      else host.appendChild(el); /* move to end = last wins */
    }
    inject();
    window.__vcPhoneRootUnlockInject = inject;
  } catch (eRootUnlock) {}
})();

(function () {
  /* Load adaptive perf helper as early as possible (sync) for CSS tiers. */
  try {
    if (!window.VcPerf || !window.VcPerf.__ready) {
      var cur = document.currentScript;
      var ver = "20260830phoneHalfLoadFix1";
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

  // MAI nascondere main/footer / body. Il freeze telefono era: HTML inline desktop
  // (opacity:0 + anti-fouc visibility:hidden) finché JS non arriva → pagina morta.
  var BOOT_CSS_SAFE =
    "html,body{background:#100c09!important;color-scheme:dark}" +
    "html.vc-site-polish.vc-page-cine-boot,html.vc-site-polish.vc-page-cine-boot body{background:#100c09!important}" +
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready){overflow:auto!important;overscroll-behavior:auto!important}" +
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main," +
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer," +
    "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header{" +
    "opacity:1!important;visibility:visible!important;pointer-events:auto!important}" +
    "html.vc-site-polish:not(.vc-styles-ready) body{visibility:visible!important;opacity:1!important}";

  var BOOT_CSS_DESKTOP = BOOT_CSS_SAFE;
  var BOOT_CSS_MOBILE = BOOT_CSS_SAFE;

  if (!document.getElementById("vc-anti-fouc-css")) {
    var anti = document.createElement("style");
    anti.id = "vc-anti-fouc-css";
    anti.textContent = "html,body{background:#100c09!important;color-scheme:dark}";
    (document.head || root).appendChild(anti);
  } else {
    try {
      var antiEl = document.getElementById("vc-anti-fouc-css");
      if (antiEl) {
        // phoneBootReveal1: spezza visibility:hidden sul body (freeze totale altre pagine).
        antiEl.textContent = "html,body{background:#100c09!important;color-scheme:dark}";
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
  bootStyle.textContent = BOOT_CSS_SAFE;
  // Immediate reveal — non aspettare rAF/layout.
  try {
    root.classList.add("vc-styles-ready");
  } catch (eReadyNow) {}

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
    // Reveal subito anche in pending: il loader overlay basta, non nascondere la pagina.
    try {
      finishBoot();
    } catch (eFinPend) {}
    var pendingObs = new MutationObserver(function () {
      if (!root.classList.contains("vc-user-leader-pending")) {
        pendingObs.disconnect();
        try {
          root.classList.add("vc-page-cine-ready");
          root.classList.remove("vc-page-cine-boot");
          finishBoot();
        } catch (eReady) {
          finishBoot();
        }
      }
    });
    pendingObs.observe(root, { attributes: true, attributeFilter: ["class"] });
    waitForCoreStyles(function () {});
    return;
  }

  // phoneBootReveal1: failsafe reveal immediato su ogni pagina cine.
  try {
    window.setTimeout(finishBoot, 0);
    window.setTimeout(finishBoot, 60);
    window.setTimeout(finishBoot, 400);
  } catch (eFailsafe) {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      waitForCoreStyles(afterStyles);
    });
  } else {
    waitForCoreStyles(afterStyles);
  }
})();
