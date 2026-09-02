(function () {
  try {
    var root = document.documentElement;
    if (!root) return;

    var mobileNavCritical =
      "@media (max-width:1199.98px){" +
      "html body .vc-header-bar,html body .vc-header-bar.grid{" +
      "display:flex!important;flex-wrap:nowrap!important;align-items:center!important;" +
      "justify-content:space-between!important;grid-template-columns:none!important;" +
      "grid-template-areas:none!important;row-gap:0!important;column-gap:.5rem!important}" +
      "html body .vc-header-snav,html body nav.vc-header-snav," +
      "html body .vc-header-bar>nav.vc-header-snav,html body .vc-header-bar>.vc-header-snav{" +
      "display:none!important}" +
      "html body #header-quick-actions,html body.vc-body #header-quick-actions{" +
      "display:flex!important;flex-wrap:nowrap!important;align-items:center!important;" +
      "gap:.4rem!important;margin-left:auto!important;flex-shrink:0!important}" +
      "html body #header-quick-actions #discord-login-btn," +
      "html body #header-quick-actions #discord-login-state," +
      "html body #header-quick-actions #discord-login-state:not([hidden]){display:none!important}" +
      "html body #vc-mobile-nav-toggle,html body #header-quick-actions #vc-mobile-nav-toggle{" +
      "display:inline-flex!important;align-items:center;justify-content:center}" +
      "}";
    if (!document.getElementById("vc-mobile-nav-critical-css")) {
      var mobileNavEl = document.createElement("style");
      mobileNavEl.id = "vc-mobile-nav-critical-css";
      mobileNavEl.textContent = mobileNavCritical;
      (document.head || root).appendChild(mobileNavEl);
    }

    function isPhonePwa() {
      try {
        if (window.matchMedia && window.matchMedia("(max-width: 639.98px)").matches) return true;
        if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
        if (window.matchMedia && window.matchMedia("(hover: none)").matches && Number(navigator.maxTouchPoints || 0) > 0) {
          return true;
        }
        if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
        if (navigator.standalone) return true;
      } catch (e) {}
      return false;
    }

    function isDesktopNav() {
      try {
        if (isPhonePwa()) return false;
        if (window.matchMedia && window.matchMedia("(min-width: 1200px)").matches) return true;
        if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) return true;
      } catch (eDesk) {}
      return false;
    }

    var phone = isPhonePwa();
    var desktop = isDesktopNav();
    try {
      root.classList.add("vc-home-motion-ready");
    } catch (eMotionBoot) {}
    if (phone) {
      try {
        root.classList.add("vc-cine-static-bg", "vc-home-cine-live", "vc-home-motion-ready");
      } catch (ePhoneBg) {}
    }

    var navGuard =
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>main," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>footer{" +
      "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      (phone || desktop
        ? ""
        : "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>header{" +
          "opacity:0!important;visibility:hidden!important;pointer-events:none!important}") +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) #vc-mobile-nav-drawer," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) .vc-mobile-nav-drawer{" +
      "display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}" +
      (phone || desktop
        ? ""
        : "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body header nav.vc-header-snav," +
          "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body header #header-quick-actions{" +
          "display:none!important}");
    if (!document.getElementById("vc-nav-boot-guard-css")) {
      var guardEl = document.createElement("style");
      guardEl.id = "vc-nav-boot-guard-css";
      guardEl.textContent = navGuard;
      (document.head || document.documentElement).appendChild(guardEl);
    }

    if (phone && !document.getElementById("vc-phone-nav-fast-css")) {
      var phoneNav = document.createElement("style");
      phoneNav.id = "vc-phone-nav-fast-css";
      phoneNav.textContent =
        "@media (max-width:639.98px),(pointer:coarse){" +
        "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header{" +
        "opacity:1!important;visibility:visible!important;pointer-events:auto!important}" +
        "html.vc-site-polish.vc-cine-static-bg .vc-home-cine::before{" +
        "opacity:1!important;visibility:visible!important}" +
        "html.vc-site-polish.vc-cine-static-bg .vc-home-cine__veil{opacity:.88!important}" +
        "html body .vc-header-snav,html body nav.vc-header-snav{display:none!important}" +
        "html body .vc-header-bar,html body .vc-header-bar.grid{" +
        "display:flex!important;flex-wrap:nowrap!important;align-items:center!important;" +
        "justify-content:space-between!important;grid-template-columns:none!important}" +
        "}";
      (document.head || root).appendChild(phoneNav);
    }

    if (desktop && !document.getElementById("vc-desktop-nav-fast-css")) {
      var desktopNav = document.createElement("style");
      desktopNav.id = "vc-desktop-nav-fast-css";
      desktopNav.textContent =
        "@media (min-width:1200px),(hover:hover) and (pointer:fine){" +
        "html.vc-core-styles-ready.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header," +
        "html.vc-core-styles-ready.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main," +
        "html.vc-core-styles-ready.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer{" +
        "opacity:1!important;visibility:visible!important;pointer-events:auto!important}" +
        "html.vc-core-styles-ready body.vc-body header nav.vc-header-snav," +
        "html.vc-core-styles-ready body.vc-body header #header-quick-actions{" +
        "display:flex!important;visibility:visible!important}" +
        "}";
      (document.head || root).appendChild(desktopNav);
    }

    function isVcBundleStylesheet(href) {
      return (
        href.indexOf("vc-landing.css") !== -1 ||
        href.indexOf("vc-landing-core.css") !== -1 ||
        href.indexOf("vc-landing-ext.css") !== -1 ||
        href.indexOf("tw-build.css") !== -1
      );
    }

    function isCoreRevealStylesheet(href) {
      return href.indexOf("vc-landing-core.css") !== -1 || href.indexOf("tw-build.css") !== -1;
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
          if (!isCoreRevealStylesheet(href)) continue;
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
      if (desktop && root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) {
        try {
          markStylesReadyOnly();
          revealExcluded();
        } catch (eDeskReveal) {}
      }
    }

    function waitCoreStyles(n) {
      n = n || 0;
      if (coreStylesReady()) {
        markCoreStylesReady();
        return;
      }
      var maxPass = phone ? 16 : desktop ? 24 : 80;
      var delayMs = phone ? 25 : desktop ? 20 : 50;
      if (n < maxPass) {
        window.setTimeout(function () {
          waitCoreStyles(n + 1);
        }, delayMs);
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
        root.classList.add("vc-page-cine-ready", "vc-styles-ready", "vc-core-styles-ready", "vc-home-motion-ready", "vc-home-styles-ready");
        root.classList.remove("vc-page-cine-boot");
      } catch (eRev) {}
    }

    function ensureHomeCineScript() {
      try {
        if (typeof window.__vcPageHeroLayout === "function") return;
        if (document.querySelector('script[src*="vc-home-cine"]')) return;
        var s = document.createElement("script");
        s.src = "/js/vc-home-cine.js?v=20260901mobileRevealFix1";
        s.async = false;
        (document.head || root).appendChild(s);
      } catch (eHc) {}
    }

    function armRevealFailsafe(ms) {
      window.setTimeout(function () {
        if (!root.classList.contains("vc-page-cine-boot") || root.classList.contains("vc-page-cine-ready")) return;
        revealExcluded();
        try {
          if (typeof window.__vcPageHeroLayout === "function") {
            window.__vcPageHeroLayout({ force: true });
          }
        } catch (eLay) {}
      }, Math.max(desktop ? 900 : 1200, Number(ms) || 4000));
    }

    function waitForStylesheets(done) {
      var pending = 0;
      var finished = false;
      function finish(force) {
        if (finished) return;
        if (!force && pending > 0) return;
        finished = true;
        done();
      }
      var links = document.querySelectorAll('link[rel="stylesheet"]');
      for (var i = 0; i < links.length; i += 1) {
        var href = String(links[i].getAttribute("href") || links[i].href || "");
        if (desktop) {
          if (!isCoreRevealStylesheet(href)) continue;
        } else if (!isVcBundleStylesheet(href)) {
          continue;
        }
        if (sheetHasRules(links[i])) continue;
        pending += 1;
        (function (link) {
          function onLoad() {
            link.removeEventListener("load", onLoad);
            link.removeEventListener("error", onLoad);
            pending -= 1;
            if (pending <= 0) finish(false);
          }
          link.addEventListener("load", onLoad);
          link.addEventListener("error", onLoad);
        })(links[i]);
      }
      if (pending <= 0) finish(false);
      window.setTimeout(function () {
        finish(true);
      }, desktop ? 900 : phone ? 3200 : 5200);
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
      if (desktop && n >= 8) {
        revealExcluded();
        return;
      }
      if (n >= 100) {
        try {
          if (typeof window.__vcEnsureCommunityPageCineLayout === "function") {
            window.__vcEnsureCommunityPageCineLayout();
          } else if (typeof window.__vcPageHeroLayout === "function") {
            window.__vcPageHeroLayout({ force: true });
          }
        } catch (eFs) {}
        revealExcluded();
        return;
      }
      window.setTimeout(function () {
        waitForLayoutAndReveal(n + 1);
      }, 50);
    }

    function bootPolishPage() {
      if (root.classList.contains("vc-user-leader-pending") || root.classList.contains("vc-user-leader-route")) {
        return;
      }
      ensureHomeCineScript();
      armRevealFailsafe(desktop ? 1600 : phone ? 3200 : 6500);
      if (desktop && coreStylesReady()) {
        markStylesReadyOnly();
        revealExcluded();
        window.setTimeout(function () {
          tryApplyLayout();
        }, 0);
        return;
      }
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

    var vinylHide =
      "html.vc-site-polish:not(.vc-cine-static-bg) .vc-home-cine::before{" +
      "opacity:0!important;visibility:hidden!important;animation:none!important}";
    if (!document.getElementById("vc-vinyl-hide-boot-css")) {
      var vinylEl = document.createElement("style");
      vinylEl.id = "vc-vinyl-hide-boot-css";
      vinylEl.textContent = vinylHide;
      (document.head || root).appendChild(vinylEl);
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

    if (root.classList.contains("vc-user-leader-pending") || root.classList.contains("vc-user-leader-route")) {
      var obs = new MutationObserver(function () {
        if (!root.classList.contains("vc-user-leader-pending")) {
          obs.disconnect();
          if (root.classList.contains("vc-page-cine-ready")) {
            markStylesReadyOnly();
            return;
          }
          root.classList.add("vc-page-cine-boot");
          bootPolishPage();
        }
      });
      obs.observe(root, { attributes: true, attributeFilter: ["class"] });
      waitForStylesheets(function () {
        markStylesReadyOnly();
      });
      return;
    }

    if (pathExcluded()) {
      revealExcluded();
      return;
    }

    if (!root.classList.contains("vc-page-cine-boot")) {
      root.classList.add("vc-page-cine-boot");
      ensureHomeCineScript();
      armRevealFailsafe(desktop ? 1600 : phone ? 3200 : 6500);
      if (!document.getElementById("vc-page-cine-boot-css")) {
        var inline = document.createElement("style");
        inline.id = "vc-page-cine-boot-css";
        inline.textContent =
          "html.vc-site-polish.vc-page-cine-boot,html.vc-site-polish.vc-page-cine-boot body{background:#100c09!important}" +
          "html.vc-site-polish:not(.vc-cine-static-bg) .vc-home-cine::before{opacity:0!important;visibility:hidden!important;animation:none!important}";
        (document.head || root).appendChild(inline);
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        if (root.classList.contains("vc-user-leader-pending") || root.classList.contains("vc-user-leader-route")) return;
        bootPolishPage();
      });
    } else {
      if (!root.classList.contains("vc-user-leader-pending") && !root.classList.contains("vc-user-leader-route")) {
        bootPolishPage();
      }
    }

    window.setTimeout(function () {
      if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) {
        if (typeof window.__vcPageHeroLayout === "function") {
          try {
            window.__vcPageHeroLayout({ force: true });
          } catch (eLate) {}
        }
        revealExcluded();
      }
    }, desktop ? 1800 : phone ? 4500 : 6000);
  } catch (e) {}
})();
