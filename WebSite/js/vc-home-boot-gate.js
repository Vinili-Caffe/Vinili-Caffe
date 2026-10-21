(function () {
      var root = document.documentElement;
      var done = false;
      var holdScrollGuardsOn = false;
      function onHoldScrollBlock(e) {
        try {
          /* bootHardTopBar1: lock duro + pin Y=0 (no jump footer durante refresh) */
          var locked =
            root.classList.contains("vc-interaction-hold") ||
            root.classList.contains("vc-loading-scroll-lock") ||
            root.classList.contains("vc-loader-blocking-live") ||
            root.classList.contains("vc-chrome-bar-loading") ||
            !root.classList.contains("vc-chrome-scroll-armed");
          if (!locked) return;
          if (e && e.type !== "scroll" && e.cancelable) e.preventDefault();
          try {
            window.scrollTo(0, 0);
            if (root.scrollTop) root.scrollTop = 0;
            if (document.body) document.body.scrollTop = 0;
          } catch (eZero) {}
        } catch (eBlk) {}
      }
      function armHoldScrollGuards() {
        if (holdScrollGuardsOn) return;
        holdScrollGuardsOn = true;
        try {
          document.addEventListener("wheel", onHoldScrollBlock, { capture: true, passive: false });
          document.addEventListener("touchmove", onHoldScrollBlock, { capture: true, passive: false });
          window.addEventListener("scroll", onHoldScrollBlock, { capture: true, passive: true });
        } catch (eArm) {}
      }
      function disarmHoldScrollGuards() {
        if (!holdScrollGuardsOn) return;
        holdScrollGuardsOn = false;
        try {
          document.removeEventListener("wheel", onHoldScrollBlock, true);
          document.removeEventListener("touchmove", onHoldScrollBlock, true);
          window.removeEventListener("scroll", onHoldScrollBlock, true);
        } catch (eDis) {}
      }
      try {
        window.__vcCineBootStartedAt = window.__vcCineBootStartedAt || Date.now();
        /* bootNoFooterJump2: home F5 mai restore Y (view-state → footer) */
        window.__vcDiscardScrollRestore = 1;
        window.__vcDiscardNextUnpinScrollY = true;
        try {
          window.__vcViewStateRestoreY = 0;
          window.__vcPtrRestoreY = 0;
          window.__vcPtrRestoreTargetY = 0;
        } catch (eZy0) {}
        root.classList.add("vc-interaction-hold", "vc-loading-scroll-lock", "vc-chrome-bar-loading");
        armHoldScrollGuards();
      } catch (eHold0) {}
      /* progGlowUnify1: stub barra home = sand-glow unica */
      try {
        (function ensureHomeProgressStub() {
          if (document.getElementById("vc-boot-progress-stub-css")) return;
          var css = document.createElement("style");
          css.id = "vc-boot-progress-stub-css";
          css.setAttribute("data-vc", "progGlowUnify1");
          css.textContent =
            "html.vc-site-polish.vc-loading-scroll-lock,html.vc-site-polish.vc-chrome-bar-loading," +
            "html.vc-site-polish.vc-loading-scroll-lock body,html.vc-site-polish.vc-chrome-bar-loading body{" +
            "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
            "overscroll-behavior:none!important;touch-action:none!important;max-height:100dvh!important}" +
            "#vc-site-progress{position:fixed!important;top:0!important;left:0!important;right:0!important;" +
            "width:auto!important;height:3px!important;z-index:2147483500!important;pointer-events:none!important;" +
            "background:transparent!important;opacity:1!important;visibility:visible!important;" +
            "overflow:hidden!important;filter:none!important;backdrop-filter:none!important;box-shadow:none!important}" +
            "#vc-site-progress.is-loading{opacity:1!important;visibility:visible!important;display:block!important}" +
            "#vc-site-progress__bar{display:block!important;height:100%!important;width:100%!important;" +
            "transform-origin:left center!important;background:#d4a888!important;" +
            "background-image:linear-gradient(90deg,#8f6b3f,#c49a72,#e8c9a8,#fffaf3,#e8c9a8,#d4a888,#b88968)!important;" +
            "box-shadow:none!important;" +
            "filter:none!important;will-change:auto!important}" +
            "@media (max-width:1199.98px),(pointer:coarse){" +
            "#vc-site-progress__bar{background-image:linear-gradient(90deg,#9a7349,#d4a888,#b88968)!important;" +
            "box-shadow:none!important;filter:none!important;will-change:auto!important}}";
          (document.head || root).appendChild(css);
          function mountHomeStub() {
            var wrap = document.getElementById("vc-site-progress");
            if (!wrap) {
              wrap = document.createElement("div");
              wrap.id = "vc-site-progress";
              wrap.setAttribute("aria-hidden", "true");
              var bar0 = document.createElement("div");
              bar0.id = "vc-site-progress__bar";
              wrap.appendChild(bar0);
              (document.body || root).appendChild(wrap);
            }
            wrap.classList.add("is-loading");
            var barEl = document.getElementById("vc-site-progress__bar");
            if (barEl) {
              try {
                barEl.style.setProperty("transform", "scaleX(0.18)", "important");
              } catch (eTr) {
                barEl.style.transform = "scaleX(0.18)";
              }
            }
            if (!window.__vcChromeUiBooted) {
              var t0 = performance.now();
              /* jsWakeKill2: stop a 5s / curtain — 50ms forever = wake storm */
              var pulse = window.setInterval(function () {
                try {
                  var ageMs = performance.now() - t0;
                  if (
                    window.__vcChromeUiBooted ||
                    ageMs > 5200 ||
                    (document.documentElement &&
                      document.documentElement.classList.contains("vc-cine-curtain-off"))
                  ) {
                    window.clearInterval(pulse);
                    return;
                  }
                  var age = Math.min(1, ageMs / 2600);
                  var pct = 0.14 + age * 0.75;
                  var b = document.getElementById("vc-site-progress__bar");
                  if (b) b.style.setProperty("transform", "scaleX(" + pct.toFixed(4) + ")", "important");
                } catch (ePulse) {}
              }, 50);
            }
          }
          if (document.body) mountHomeStub();
          else document.addEventListener("DOMContentLoaded", mountHomeStub, { once: true });
        })();
      } catch (eHomeStub) {}
      /* siparioLoadPage1: toast stub SOLO post curtain (sipario = loader fullscreen) */
      try {
        (function ensureHomeBootToastStub() {
          if (window.__vcHomeBootToastStub) return;
          window.__vcHomeBootToastStub = 1;
          function mountToast() {
            try {
              try {
                if (!document.documentElement.classList.contains("vc-cine-curtain-off")) {
                  try {
                    if (typeof window.__vcKillBootToastOnSipario === "function") {
                      window.__vcKillBootToastOnSipario();
                    }
                  } catch (eKillH) {}
                  return;
                }
                var hostKeep = document.getElementById("vc-site-toast-host");
                if (window.__vcBootLoadToastLatched) return;
                if (hostKeep && hostKeep.querySelector(".vc-dash-save-toast[data-vc-boot-load-toast]")) {
                  return;
                }
              } catch (eKeepT) {}
              if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
                window.VcSiteToast.show("Caricamento…", false, { pending: true, bootLoad: true });
                try {
                  var stubCssDone = document.getElementById("vc-home-boot-toast-stub-css");
                  if (stubCssDone && stubCssDone.parentNode) stubCssDone.parentNode.removeChild(stubCssDone);
                } catch (eStubRm) {}
                return;
              }
              var host = document.getElementById("vc-site-toast-host");
              if (!host) {
                host = document.createElement("div");
                host.id = "vc-site-toast-host";
                host.className = "vc-dash-save-toast-host vc-site-toast-host";
                host.setAttribute("aria-live", "polite");
                host.setAttribute("aria-atomic", "true");
                host.setAttribute("data-vc-toast-align", "1");
                host.setAttribute("data-vc", "homeBootFix2");
                (document.body || root).appendChild(host);
              }
              host.style.setProperty("position", "fixed", "important");
              host.style.setProperty("left", "50%", "important");
              host.style.setProperty("right", "auto", "important");
              host.style.setProperty("top", "auto", "important");
              host.style.setProperty(
                "bottom",
                "calc(1.15rem + env(safe-area-inset-bottom, 0px))",
                "important",
              );
              host.style.setProperty("transform", "translateX(-50%)", "important");
              host.style.setProperty("z-index", "2147483640", "important");
              host.style.setProperty("width", "min(92vw, 22rem)", "important");
              host.style.setProperty("pointer-events", "none", "important");
              if (!host.querySelector(".vc-dash-save-toast[data-vc-boot-load-toast]")) {
                host.innerHTML =
                  '<div class="vc-dash-save-toast is-pending is-visible" role="status" data-vc-boot-load-toast="1">' +
                  '<span class="vc-dash-save-toast__icon" aria-hidden="true">' +
                  '<span class="vc-ui-spinner vc-ui-spinner--on-dark" aria-hidden="true"></span></span>' +
                  '<p class="vc-dash-save-toast__text">Caricamento…</p></div>';
              }
              /* homeToastMatch1: stesso look delle altre pagine (card verde + gif spokes) */
              if (!document.getElementById("vc-home-boot-toast-stub-css")) {
                var tcss = document.createElement("style");
                tcss.id = "vc-home-boot-toast-stub-css";
                tcss.setAttribute("data-vc", "homeToastMatch1");
                tcss.textContent =
                  "#vc-site-toast-host{position:fixed!important;left:50%!important;right:auto!important;" +
                  "top:auto!important;bottom:calc(1.15rem + env(safe-area-inset-bottom,0px))!important;" +
                  "transform:translateX(-50%)!important;z-index:2147483640!important;" +
                  "width:min(92vw,22rem)!important;max-width:min(92vw,22rem)!important;" +
                  "margin:0!important;padding:0!important;pointer-events:none!important;box-sizing:border-box!important}" +
                  "#vc-site-toast-host .vc-dash-save-toast{pointer-events:none;display:flex;align-items:center;gap:.65rem;" +
                  "padding:.7rem .95rem;border-radius:.95rem;border:1px solid rgba(236,205,176,.45);" +
                  "background:linear-gradient(145deg,#17130f,#100c09);" +
                  "box-shadow:0 12px 36px rgba(0,0,0,.45);opacity:1;transform:none;visibility:visible;" +
                  "box-sizing:border-box}" +
                  "#vc-site-toast-host .vc-dash-save-toast__icon," +
                  "#vc-site-toast-host .vc-dash-save-toast.is-pending .vc-dash-save-toast__icon{" +
                  "flex-shrink:0;display:grid;place-items:center;width:1.85rem;height:1.85rem;" +
                  "border-radius:.5rem;background:linear-gradient(180deg,#eccdb0,#6f4e37);color:#fff;font-size:.85rem}" +
                  "#vc-site-toast-host .vc-dash-save-toast__icon .vc-ui-spinner{" +
                  "width:.95rem!important;height:.95rem!important;min-width:.95rem!important;min-height:.95rem!important;" +
                  "display:inline-block!important;border:0!important;border-radius:0!important;" +
                  "box-shadow:none!important;color:transparent!important;background-color:transparent!important;" +
                  "background:transparent url(/images/vc-loading.gif?v=20260920vcLoadingSpokes1) center/contain no-repeat!important;" +
                  "animation:none!important;-webkit-animation:none!important}" +
                  "#vc-site-toast-host .vc-dash-save-toast__text{margin:0;color:rgba(255,247,236,.94);" +
                  "font-size:.88rem;font-weight:700;line-height:1.25}";
                (document.head || root).appendChild(tcss);
              }
            } catch (eMountT) {}
          }
          if (document.body) mountToast();
          else document.addEventListener("DOMContentLoaded", mountToast, { once: true });
          window.setTimeout(mountToast, 120);
          window.setTimeout(mountToast, 400);
          window.setTimeout(mountToast, 900);
          /* bootToastNoFlash1: hide solo via auth-inject linger — stub non compete */
          var hideTries = 0;
          var hidePoll = window.setInterval(function () {
            hideTries += 1;
            try {
              if (window.__vcBootLoadToastArmed || window.__vcBootLoadToastLatched) {
                window.clearInterval(hidePoll);
                return;
              }
              var r = document.documentElement;
              /* homeScrollLock1: toast solo dopo LoadDone reale (no hide su lock strip precoce) */
              var done =
                window.__vcChromeLoadDone === true &&
                r.classList.contains("vc-cine-curtain-off") &&
                (r.classList.contains("vc-chrome-scroll-armed") || window.__vcChromeScrollArmed === true);
              if (!done && hideTries < 100) return;
              if (window.__vcBootLoadToastHold) {
                if (hideTries < 120) return;
              }
              window.clearInterval(hidePoll);
              if (window.__vcBootLoadToastArmed || window.__vcBootLoadToastLatched) return;
              if (window.VcSiteToast && typeof window.VcSiteToast.hideLoadLinger === "function") {
                window.VcSiteToast.hideLoadLinger(900);
                return;
              }
              window.setTimeout(function () {
                try {
                  if (window.__vcBootLoadToastHold || window.__vcBootLoadToastArmed) return;
                  var h = document.getElementById("vc-site-toast-host");
                  if (h && h.querySelector("[data-vc-boot-load-toast]")) h.innerHTML = "";
                } catch (eClr) {}
              }, 900);
            } catch (eHide) {
              if (hideTries > 100) window.clearInterval(hidePoll);
            }
          }, 180);
        })();
      } catch (eHomeToast) {}
      function releaseHoldAndShow() {
        /* toastSyncAll2: CSS ready â‰  sipario — curtain-off solo dopo chrome done (no 2° load home) */
        try {
          root.classList.remove(
            "vc-interaction-hold",
            "vc-loader-blocking-live",
            "vc-scroll-reload-top-lock",
          );
          root.classList.add("vc-loading-scroll-lock", "vc-chrome-bar-loading");
        } catch (eHold1) {}
        root.classList.add(
          "vc-home-styles-ready",
          "vc-core-styles-ready",
          "vc-soft-fx-ready",
          "vc-page-cine-ready",
        );
        function chromeAllowsHomeCurtain() {
          try {
            if (window.__vcChromeLoadDone === true) return true;
            var t0 = Number(window.__vcCineBootStartedAt || window.__vcHomeBootAt || 0) || 0;
            var age = t0 ? Date.now() - t0 : 0;
            return age >= 6500;
          } catch (eAllow) {
            return false;
          }
        }
        function liftHomeCurtain() {
          try {
            if (root.classList.contains("vc-cine-curtain-off")) return true;
            if (!chromeAllowsHomeCurtain()) return false;
            root.classList.add("vc-cine-curtain-off");
            if (window.__vcChromeLoadDone === true) {
              root.classList.remove("vc-loading-scroll-lock", "vc-chrome-bar-loading");
              root.classList.add("vc-chrome-scroll-armed");
              window.__vcBootScrollGuardsKilled = 1;
              try {
                disarmHoldScrollGuards();
              } catch (eDis2) {}
              try {
                if (typeof window.__vcForceScrollUnlock === "function") window.__vcForceScrollUnlock();
              } catch (eFu) {}
            } else {
              root.classList.add("vc-loading-scroll-lock", "vc-chrome-bar-loading");
            }
            return true;
          } catch (eLift) {
            return false;
          }
        }
        if (!liftHomeCurtain()) {
          var homeCurtainN = 0;
          (function pollHomeCurtain() {
            homeCurtainN += 1;
            try {
              if (liftHomeCurtain() || homeCurtainN > 200) return;
            } catch (ePoll) {}
            window.setTimeout(pollHomeCurtain, 40);
          })();
        }
        window.setTimeout(function () {
          try {
            if (window.__vcBootRevealLanded) return;
            window.__vcBootRevealLanded = true;
            /* bootHardTopBar1: al reveal home sempre TOP (no view-state → footer) */
            window.__vcDiscardNextUnpinScrollY = true;
            try {
              window.__vcViewStateRestoreY = 0;
              window.__vcPtrRestoreY = 0;
            } catch (eZy) {}
            try {
              if (typeof window.__vcResetPinnedPageScrollY === "function") window.__vcResetPinnedPageScrollY(0);
              if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
            } catch (eUn) {}
            try {
              window.scrollTo(0, 0);
              if (document.documentElement) document.documentElement.scrollTop = 0;
              if (document.body) document.body.scrollTop = 0;
              window.requestAnimationFrame(function () {
                try {
                  window.scrollTo(0, 0);
                } catch (eRaf) {}
              });
              window.setTimeout(function () {
                try {
                  window.scrollTo(0, 0);
                } catch (eT1) {}
              }, 120);
              window.setTimeout(function () {
                try {
                  window.scrollTo(0, 0);
                } catch (eT2) {}
              }, 380);
            } catch (eTop) {}
          } catch (eUnp) {}
        }, 0);
      }
      /* homeScrollLock1: failsafe SOLO se chrome-ui non parte (~5.2s) — mai unlock anticipato a 2.8s */
      window.setTimeout(function () {
        try {
          if (window.__vcChromeLoadDone === true) return;
          if (window.__vcChromeUiBooted) return;
          root.classList.remove("vc-loading-scroll-lock", "vc-chrome-bar-loading", "vc-interaction-hold");
          root.classList.add("vc-chrome-scroll-armed");
          window.__vcChromeLoadDone = true;
          window.__vcChromeScrollArmed = true;
          window.__vcBootScrollGuardsKilled = 1;
          disarmHoldScrollGuards();
          var prog = document.getElementById("vc-site-progress");
          if (prog) prog.classList.remove("is-loading");
        } catch (eFsBar) {}
      }, 5200);
      function chromeSettleReady() {
        try {
          if (document.readyState === "loading") return false;
        } catch (eRs) {}
        /* bootFastSipario1: i18n non blocca reveal (applica dopo) */
        return true;
      }
      function scheduleRelease() {
        var n = 0;
        var started = Date.now();
        function tick() {
          n += 1;
          if (chromeSettleReady() || n > 20 || Date.now() - started > 1200) {
            try {
              window.requestAnimationFrame(function () {
                releaseHoldAndShow();
              });
            } catch (eRaf) {
              releaseHoldAndShow();
            }
            return;
          }
          window.setTimeout(tick, 24);
        }
        tick();
      }
      function markReady() {
        if (done) return;
        /* cssLikeFeedback3: critical = soft+look+page-home (no landing-core dual-stack) */
        try {
          var need = [
            document.getElementById("vc-soft-fx-css") || document.querySelector('link[href*="vc-soft-fx"]'),
            document.getElementById("vc-look-core-css") || document.querySelector('link[href*="vc-look-core"]'),
            document.getElementById("vc-page-home-css") || document.querySelector('link[href*="vc-page-home"]'),
          ];
          for (var ni = 0; ni < need.length; ni += 1) {
            if (need[ni] && !sheetReady(need[ni])) {
              window.setTimeout(function () {
                try {
                  markReady();
                } catch (eDeferN) {}
              }, 24);
              return;
            }
          }
        } catch (eLookGate) {}
        done = true;
        /* interactHold1: CSS ready → ancora hold finché i18n/chrome settled */
        try {
          root.classList.add(
            "vc-home-styles-ready",
            "vc-core-styles-ready",
            "vc-look-core-ready",
            "vc-soft-fx-ready",
            "vc-interaction-hold"
          );
        } catch (eMk) {}
        scheduleRelease();
      }
      function sheetReady(link) {
        if (!link) return false;
        try {
          if (link.getAttribute("data-vc-sheet-loaded") === "1") return true;
          if (link.sheet && ((link.sheet.cssRules && link.sheet.cssRules.length) || (link.sheet.rules && link.sheet.rules.length))) {
            return true;
          }
        } catch (eSheet) {
          /* cineNoFlash8: mai ready su sheet blocked (era FOUC precoce) */
          return link.getAttribute("data-vc-sheet-loaded") === "1";
        }
        return false;
      }
      var pending = 0;
      var links = document.querySelectorAll('link[rel="stylesheet"]');
      var i;
      for (i = 0; i < links.length; i += 1) {
        var href = String(links[i].getAttribute("href") || links[i].href || "");
        /* cssLikeFeedback3: critical wait = soft/look/page-home only */
        if (
          href.indexOf("vc-page-home") === -1 &&
          href.indexOf("vc-soft-fx") === -1 &&
          href.indexOf("vc-look-core") === -1
        )
          continue;
        if (sheetReady(links[i])) continue;
        pending += 1;
        (function (link) {
          function onDone() {
            try {
              link.setAttribute("data-vc-sheet-loaded", "1");
            } catch (eMk) {}
            link.removeEventListener("load", onDone);
            link.removeEventListener("error", onDone);
            pending -= 1;
            if (pending <= 0) markReady();
          }
          link.addEventListener("load", onDone);
          link.addEventListener("error", onDone);
        })(links[i]);
      }
      if (pending <= 0) {
        window.setTimeout(markReady, 0);
      }
      var failMs = 2200;
      try {
        if (
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
          Number(navigator.maxTouchPoints || 0) > 0
        ) {
          failMs = 3200;
        }
      } catch (eMs) {}
      window.setTimeout(function () {
        if (pending > 0) return;
        markReady();
      }, failMs);
      /* ultimate failsafe if a stylesheet hangs */
      window.setTimeout(markReady, 6000);
    })();
