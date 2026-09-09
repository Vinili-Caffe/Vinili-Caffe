/* homeNavBgFix1 + phoneNavCore2 + gpuLoadFix1 + cineFxUnify1 + cineExtWaitFix1 + mobileRevealFix1 + cineNoFlash1 + photoBg1 + cineNoFlash2 */
(function () {
  try {
    var root = document.documentElement;
    if (!root) return;

    /* photoBg1 trial: disable canvas cine, use static photo bg (set false to restore). */
    var SITE_PHOTO_BG =
      typeof window.__VC_SITE_PHOTO_BG === "boolean" ? window.__VC_SITE_PHOTO_BG : true;
    window.__VC_SITE_PHOTO_BG = SITE_PHOTO_BG;
    if (SITE_PHOTO_BG) {
      try {
        root.classList.add("vc-site-photo-bg", "vc-cine-static-bg", "vc-home-cine-live", "vc-home-motion-ready");
        if (!document.getElementById("vc-site-photo-bg-link")) {
          var photoLink = document.createElement("link");
          photoLink.id = "vc-site-photo-bg-link";
          photoLink.rel = "stylesheet";
          photoLink.href = "/css/vc-site-photo-bg.css?v=20260906gifNeverWebp1";
          (document.head || root).appendChild(photoLink);
        }
      } catch (ePhotoBoot) {}
    }

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

    // Gate duro: niente flash layout piatto (CSS senza cine) finché non c'è vc-page-cine-ready.
    var cineGate =
      "html.vc-site-polish:not(.vc-page-cine-ready) body.vc-body>main," +
      "html.vc-site-polish:not(.vc-page-cine-ready) body.vc-body>footer," +
      "html.vc-site-polish:not(.vc-page-cine-ready) body.vc-body>header{" +
      "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main," +
      "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer," +
      "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header{" +
      "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      /* Safety: se qualcosa rivela troppo presto, hero card non deve apparire "pre-cine". */ +
      "html.vc-page-cine-boot .vc-support-page-hero," +
      "html.vc-page-cine-boot .vc-wiki-hero-card," +
      "html.vc-page-cine-boot .vc-regole-hero-card," +
      "html.vc-page-cine-boot .vc-notify-hero{" +
      "border:none!important;background:transparent!important;box-shadow:none!important;" +
      "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}";
    if (!document.getElementById("vc-cine-noflash-gate-css")) {
      var gateEl = document.createElement("style");
      gateEl.id = "vc-cine-noflash-gate-css";
      gateEl.textContent = cineGate;
      (document.head || root).appendChild(gateEl);
    } else {
      try {
        var existingGate = document.getElementById("vc-cine-noflash-gate-css");
        if (existingGate && existingGate.textContent.indexOf("vc-wiki-hero-card") < 0) {
          existingGate.textContent +=
            "html.vc-page-cine-boot .vc-support-page-hero,html.vc-page-cine-boot .vc-wiki-hero-card," +
            "html.vc-page-cine-boot .vc-regole-hero-card,html.vc-page-cine-boot .vc-notify-hero{" +
            "border:none!important;background:transparent!important;box-shadow:none!important;" +
            "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}";
        }
      } catch (eGateUp) {}
    }

    var navGuard =
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>main," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>footer," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>header{" +
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

    // Telefono: sfondo cine static ok, main/footer restano dietro al gate.
    if (phone && !document.getElementById("vc-phone-nav-fast-css")) {
      var phoneNav = document.createElement("style");
      phoneNav.id = "vc-phone-nav-fast-css";
      phoneNav.textContent =
        "@media (max-width:639.98px),(pointer:coarse){" +
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

    // Rimuovi eventuale CSS early-reveal desktop già iniettato da cache/vecchio boot.
    try {
      var oldDesk = document.getElementById("vc-desktop-nav-fast-css");
      if (oldDesk && oldDesk.parentNode) oldDesk.parentNode.removeChild(oldDesk);
    } catch (eOldDesk) {}

    function isVcBundleStylesheet(href) {
      return (
        href.indexOf("vc-landing.css") !== -1 ||
        href.indexOf("vc-landing-core.css") !== -1 ||
        href.indexOf("vc-landing-ext.css") !== -1 ||
        href.indexOf("tw-build.css") !== -1
      );
    }

    function isCoreRevealStylesheet(href) {
      return (
        href.indexOf("vc-landing-core.css") !== -1 ||
        href.indexOf("vc-landing-ext.css") !== -1 ||
        href.indexOf("tw-build.css") !== -1 ||
        href.indexOf("vc-site-photo-bg.css") !== -1
      );
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
      // cineNoFlash1: NON rivelare la pagina solo perché il CSS core è pronto.
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
        root.classList.add(
          "vc-page-cine-ready",
          "vc-styles-ready",
          "vc-core-styles-ready",
          "vc-home-motion-ready",
          "vc-home-styles-ready",
        );
        root.classList.remove("vc-page-cine-boot");
      } catch (eRev) {}
    }

    function hasCineLayout() {
      try {
        return Boolean(document.body && document.body.classList.contains("vc-page-cine-layout"));
      } catch (eLay) {
        return false;
      }
    }

    function ensureHomeCineScript() {
      try {
        if (typeof window.__vcPageHeroLayout === "function") return;
        if (document.querySelector('script[src*="vc-home-cine"]')) return;
        var s = document.createElement("script");
        s.src = "/js/vc-home-cine.js?v=20260906sponsorRefundInHero1";
        s.async = false;
        (document.head || root).appendChild(s);
      } catch (eHc) {}
    }

    function armRevealFailsafe(ms) {
      window.setTimeout(function () {
        if (!root.classList.contains("vc-page-cine-boot") || root.classList.contains("vc-page-cine-ready")) return;
        try {
          if (typeof window.__vcPageHeroLayout === "function") {
            window.__vcPageHeroLayout({ force: true });
          }
        } catch (eLay) {}
        // cineNoFlash2: non rivelare il layout piatto.
        if (hasCineLayout() || root.classList.contains("vc-page-cine-ready")) {
          revealExcluded();
        }
      }, Math.max(desktop ? 2200 : 3200, Number(ms) || 5000));
    }

    function promoteDeferredStylesheets() {
      try {
        var links = document.querySelectorAll('link[rel="stylesheet"][media="print"]');
        for (var i = 0; i < links.length; i += 1) {
          var href = String(links[i].getAttribute("href") || links[i].href || "");
          if (!isVcBundleStylesheet(href) && href.indexOf("vc-site-photo-bg.css") === -1) continue;
          try {
            links[i].media = "all";
            links[i].setAttribute("media", "all");
          } catch (eMedia) {}
        }
      } catch (ePromo) {}
    }

    function waitForStylesheets(done) {
      promoteDeferredStylesheets();
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
        // cineNoFlash2: aspetta core + ext + photo-bg anche su desktop.
        if (!isCoreRevealStylesheet(href)) continue;
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
      }, desktop ? 1600 : phone ? 3200 : 5200);
    }

    function tryApplyLayout() {
      if (typeof window.__vcPageHeroLayout !== "function") return false;
      try {
        window.__vcPageHeroLayout({ force: true });
      } catch (eLay) {}
      return root.classList.contains("vc-page-cine-ready") || hasCineLayout();
    }

    function waitForLayoutAndReveal(n) {
      n = n || 0;
      if (tryApplyLayout()) {
        revealExcluded();
        return;
      }
      if (root.classList.contains("vc-page-cine-ready")) return;
      if (n >= 120) {
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
      armRevealFailsafe(desktop ? 2800 : phone ? 4000 : 6500);
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
    window.__VC_PAGE_CINE_BOOT_VER = "cineNoFlash1";
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
      armRevealFailsafe(desktop ? 2800 : phone ? 4000 : 6500);
      if (!document.getElementById("vc-page-cine-boot-css")) {
        var inline = document.createElement("style");
        inline.id = "vc-page-cine-boot-css";
        inline.textContent =
          "html.vc-site-polish.vc-page-cine-boot,html.vc-site-polish.vc-page-cine-boot body{background:#100c09!important}" +
          cineGate +
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
        // cineNoFlash2: ultimo failsafe — forza layout, poi rivela solo se cine o timeout estremo.
        if (hasCineLayout()) {
          revealExcluded();
        } else {
          try {
            if (typeof window.__vcPageHeroLayout === "function") {
              window.__vcPageHeroLayout({ force: true });
            }
          } catch (eLate2) {}
          if (hasCineLayout()) revealExcluded();
          else revealExcluded(); // better visible late than stuck forever
        }
      }
    }, desktop ? 4200 : phone ? 6500 : 8000);
  } catch (e) {}
})();
