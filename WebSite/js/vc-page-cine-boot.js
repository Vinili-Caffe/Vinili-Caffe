/* cineLayoutGateFix1 + phoneNavFlashFix2 */
(function () {
  try {
    var navGuard =
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>header," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>main," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>footer{" +
      "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) #vc-mobile-nav-drawer," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) .vc-mobile-nav-drawer{" +
      "display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}" +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body header nav.vc-header-snav," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body header #header-quick-actions{" +
      "display:none!important}";
    if (!document.getElementById("vc-nav-boot-guard-css")) {
      var guardEl = document.createElement("style");
      guardEl.id = "vc-nav-boot-guard-css";
      guardEl.textContent = navGuard;
      (document.head || document.documentElement).appendChild(guardEl);
    }

    var root = document.documentElement;
    if (!root) return;

    function isPhonePwa() {
      try {
        if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
        if (window.matchMedia && window.matchMedia("(hover: none)").matches && Number(navigator.maxTouchPoints || 0) > 0) {
          return true;
        }
        if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
        if (navigator.standalone) return true;
      } catch (e) {}
      return false;
    }

    function sheetHasRules(link) {
      if (!link || !link.sheet) return false;
      try {
        var n =
          (link.sheet.cssRules && link.sheet.cssRules.length) || (link.sheet.rules && link.sheet.rules.length) || 0;
        return n > 0;
      } catch (e2) {
        return true;
      }
    }

    function coreStylesReady() {
      try {
        var links = document.querySelectorAll('link[rel="stylesheet"]');
        var need = 0;
        var ready = 0;
        for (var i = 0; i < links.length; i += 1) {
          var href = String(links[i].getAttribute("href") || links[i].href || "");
          if (href.indexOf("vc-landing.css") === -1 && href.indexOf("tw-build.css") === -1) continue;
          need += 1;
          if (sheetHasRules(links[i])) ready += 1;
        }
        return need > 0 && ready >= need;
      } catch (e3) {
        return false;
      }
    }

    function markCoreStylesReady() {
      try {
        root.classList.add("vc-core-styles-ready");
      } catch (e5) {}
    }

    function waitCoreStyles(n) {
      n = n || 0;
      if (coreStylesReady()) {
        markCoreStylesReady();
        return;
      }
      if (n < 160) {
        window.setTimeout(function () {
          waitCoreStyles(n + 1);
        }, 50);
        return;
      }
      markCoreStylesReady();
    }

    waitCoreStyles(0);

    function markStylesReadyOnly() {
      try {
        root.classList.add("vc-styles-ready");
        markCoreStylesReady();
      } catch (eSt) {}
    }

    function revealExcluded() {
      try {
        root.classList.add("vc-page-cine-ready", "vc-styles-ready", "vc-core-styles-ready", "vc-home-motion-ready");
        root.classList.remove("vc-page-cine-boot");
      } catch (eRev) {}
    }

    function waitForStylesheets(done) {
      var pending = 0;
      var finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        done();
      }
      var targets = ["vc-landing.css", "tw-build.css"];
      var links = document.querySelectorAll('link[rel="stylesheet"]');
      for (var i = 0; i < links.length; i += 1) {
        var href = String(links[i].getAttribute("href") || links[i].href || "");
        var watch = false;
        for (var t = 0; t < targets.length; t += 1) {
          if (href.indexOf(targets[t]) !== -1) {
            watch = true;
            break;
          }
        }
        if (!watch) continue;
        if (sheetHasRules(links[i])) continue;
        pending += 1;
        (function (link) {
          function onLoad() {
            link.removeEventListener("load", onLoad);
            link.removeEventListener("error", onLoad);
            pending -= 1;
            if (pending <= 0) finish();
          }
          link.addEventListener("load", onLoad);
          link.addEventListener("error", onLoad);
        })(links[i]);
      }
      if (pending <= 0) finish();
      window.setTimeout(finish, 1200);
    }

    function tryApplyLayout() {
      if (typeof window.__vcPageHeroLayout !== "function") return false;
      try {
        window.__vcPageHeroLayout({ force: true });
      } catch (eLay) {}
      return root.classList.contains("vc-page-cine-ready") || document.body.classList.contains("vc-page-cine-layout");
    }

    function waitForLayoutAndReveal(n) {
      n = n || 0;
      if (tryApplyLayout()) return;
      if (root.classList.contains("vc-page-cine-ready")) return;
      if (n >= 240) {
        try {
          if (typeof window.__vcEnsureCommunityPageCineLayout === "function") {
            window.__vcEnsureCommunityPageCineLayout();
          } else if (typeof window.__vcPageHeroLayout === "function") {
            window.__vcPageHeroLayout({ force: true });
          }
        } catch (eFs) {}
        if (!root.classList.contains("vc-page-cine-ready")) revealExcluded();
        return;
      }
      window.setTimeout(function () {
        waitForLayoutAndReveal(n + 1);
      }, 50);
    }

    function bootPolishPage() {
      waitForStylesheets(function () {
        markStylesReadyOnly();
        waitForLayoutAndReveal(0);
      });
    }

    function pathExcluded() {
      var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
      var profileId = false;
      try {
        var q = new URLSearchParams(location.search || "");
        var id = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
        profileId = /^\d{17,20}$/.test(id);
      } catch (eQ) {}
      return (
        p === "/" ||
        p.indexOf("/dashboard") === 0 ||
        p.indexOf("/seratafilm") === 0 ||
        p.indexOf("/evento") === 0 ||
        /^\/users?\/\d{17,20}$/.test(p) ||
        /^\/user\/(personalizza|customize|custom)(\/|$)/.test(p) ||
        profileId ||
        root.classList.contains("vc-user-profile-pending")
      );
    }

    if (!root.classList.contains("vc-site-polish")) return;

    var bootCss = document.getElementById("vc-page-cine-boot-css");
    if (bootCss) {
      bootCss.textContent =
        "html.vc-site-polish.vc-page-cine-boot,html.vc-site-polish.vc-page-cine-boot body{background:#100c09!important;color-scheme:dark}" +
        "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready){overflow:auto!important;overscroll-behavior:auto!important}" +
        "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main," +
        "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer," +
        "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header{" +
        "opacity:0!important;visibility:hidden!important;pointer-events:none!important}";
    }
    var anti = document.getElementById("vc-anti-fouc-css");
    if (anti) anti.textContent = "html,body{background:#100c09!important;color-scheme:dark}";

    window.__VC_PAGE_CINE_BOOT_RAN = true;
    if (!document.getElementById("vc-anti-fouc-css")) {
      var s = document.createElement("style");
      s.id = "vc-anti-fouc-css";
      s.textContent = "html,body{background:#100c09}";
      (document.head || root).appendChild(s);
    }

    window.__vcWaitForCoreStyles = waitForStylesheets;
    window.__vcMarkStylesReady = markStylesReadyOnly;

    if (root.classList.contains("vc-user-leader-pending")) {
      var obs = new MutationObserver(function () {
        if (!root.classList.contains("vc-user-leader-pending")) {
          obs.disconnect();
          root.classList.add("vc-page-cine-boot");
          bootPolishPage();
        }
      });
      obs.observe(root, { attributes: true, attributeFilter: ["class"] });
      waitForStylesheets(function () {});
      return;
    }

    if (pathExcluded()) {
      revealExcluded();
      return;
    }

    if (!root.classList.contains("vc-page-cine-boot")) {
      root.classList.add("vc-page-cine-boot");
      if (!document.getElementById("vc-page-cine-boot-css")) {
        var inline = document.createElement("style");
        inline.id = "vc-page-cine-boot-css";
        inline.textContent =
          "html.vc-site-polish.vc-page-cine-boot,html.vc-site-polish.vc-page-cine-boot body{background:#100c09!important}";
        (document.head || root).appendChild(inline);
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootPolishPage);
    } else {
      bootPolishPage();
    }

    window.setTimeout(function () {
      if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) {
        if (typeof window.__vcPageHeroLayout === "function") {
          try {
            window.__vcPageHeroLayout({ force: true });
          } catch (eLate) {}
        }
        if (!root.classList.contains("vc-page-cine-ready")) revealExcluded();
      }
    }, 12000);
  } catch (e) {}
})();
