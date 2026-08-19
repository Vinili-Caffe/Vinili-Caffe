/* Public inner pages: glass nav + light atmosphere + card rise. Skips home / tools. */
(function () {
  if (window.__vcSitePolish) return;
  window.__vcSitePolish = true;

  function pathName() {
    return String(location.pathname || "/").replace(/\/+$/, "") || "/";
  }

  function excludedPath() {
    var p = pathName();
    if (p === "/") return true;
    if (p === "/seratafilm" || p.indexOf("/seratafilm/") === 0) return true;
    if (p === "/dashboard" || p.indexOf("/dashboard/") === 0) return true;
    if (p === "/evento" || p.indexOf("/evento/") === 0) return true;
    return false;
  }

  function excluded() {
    var b = document.body;
    if (!b || !b.classList.contains("vc-body")) return true;
    if (b.classList.contains("vc-body--home")) return true;
    if (b.classList.contains("vc-dashboard-page")) return true;
    if (b.classList.contains("vc-seratafilm-page")) return true;
    if (b.classList.contains("vc-hw-page")) return true;
    return excludedPath();
  }

  function isStandalonePwa() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e) {}
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (e2) {}
    return Boolean(navigator.standalone);
  }

  function isVotePage() {
    var b = document.body;
    if (b && b.classList.contains("vc-vote-page")) return true;
    var p = pathName();
    return p === "/vote";
  }

  function skipHeavyFx() {
    return false;
  }

  function skipChrome(el) {
    if (!el || !el.closest) return true;
    return Boolean(
      el.closest(
        "header, footer, .vc-nav-shell, .vc-snav-panel, .vc-notif-panel, dialog, .vc-site-atmos, .vc-home-cine, .vc-ul-loading, .vc-reviews-gate, .vc-rank-customize-loading, .vc-user-profile-loader, .vc-session-verify-overlay, #vc-user-profile-view, .vc-rank-customize-page"
      )
    );
  }

  function pickRiseNodes() {
    var root = document.querySelector("main") || document.querySelector(".vc-page");
    if (!root) return [];
    var found = root.querySelectorAll(
      ":scope > section, :scope > article, :scope > div, #vc-page-content > section, #vc-page-content > article, #vc-page-content > div, #vc-page-content section, #vc-page-content article, .vc-page-cine-body > section, .vc-page-cine-body > article, .vc-page-cine-card, .vc-home-deck, .vc-home-deck__cell, .vc-home-feature, .vc-home-highlights, .vc-home-highlight-card, .vc-home-linkpanel, .vc-home-storycard, #stats .vc-stat-strip, .vc-glass, .vc-support-page-hero, .vc-notify-hero, .vc-notify-stat, .vc-notify-row, .vc-support-donate-role, .vc-support-donate-roles, .vc-support-hero-pillar-row, .vc-faq-item, .vc-faq-group, .vc-reviews-section, .vc-reviews-card, .vc-reviews-formcard, .vc-staff-block, .vc-staff-hub-card, .vc-staff-hero, .vc-hw-window, .vc-hw-notice, .vc-hw-hero, .vc-hw-choice, .vc-unban-before-card, .vc-unmute-before-card, .vc-candidature-card, .vc-legal-card, .vc-sponsor-card, .vc-sponsor-embed, .vc-wiki-cmd-shell, .vc-cmd-grp, .vc-perks-card, .vc-user-profile-hero, .vc-user-profile-block, .vc-wt-board, .vc-auth-required-card, .vc-ul-card, .vc-role-card, .vc-regole-hero-card"
    );
    var list = [];
    for (var i = 0; i < found.length; i++) {
      var el = found[i];
      if (skipChrome(el)) continue;
      if (el.classList && el.classList.contains("vc-nav-shell")) continue;
      if (
        el.classList &&
        (el.classList.contains("vc-page-cine-hero") ||
          el.classList.contains("vc-support-page-hero") ||
          el.classList.contains("vc-notify-hero") ||
          el.classList.contains("vc-staff-hero"))
      ) {
        continue;
      }
      if (el.closest && el.closest(".vc-page-cine-hero, .vc-support-page-hero, .vc-notify-hero, .vc-staff-hero")) {
        continue;
      }
      if (el.hidden || el.hasAttribute("hidden")) continue;
      if (el.closest && el.closest("[hidden]")) continue;
      var h = el.offsetHeight || 0;
      if (h > 0 && h < 48) continue;
      if (el.classList && el.classList.contains("vc-vote-page-hero")) continue;
      list.push(el);
    }
    var outer = list.filter(function (el) {
      for (var j = 0; j < list.length; j++) {
        if (list[j] !== el && list[j].contains(el)) return false;
      }
      return true;
    });
    if (outer.length > 40) outer = outer.slice(0, 40);
    return outer;
  }

  function inView(el) {
    try {
      var r = el.getBoundingClientRect();
      var fold = window.innerHeight || 800;
      return r.top < fold * 0.92 && r.bottom > 36;
    } catch (e) {
      return true;
    }
  }

  function decorateFxCard(el) {
    if (!el || skipChrome(el)) return;
    if (el.closest && el.closest(".vc-page-cine-hero, .vc-wt-board, dialog")) return;
    if (
      el.id === "vc-page-content" ||
      el.id === "wiki-comandi-panel" ||
      el.id === "vc-regole-list" ||
      el.id === "vc-roles-grid" ||
      el.id === "vc-ul-grid" ||
      (el.classList &&
        (el.classList.contains("vc-page-cine-body") ||
          el.classList.contains("vc-page-cine-aside") ||
          el.classList.contains("vc-page-cine-aside-inline") ||
          el.classList.contains("vc-reviews-section") ||
          el.classList.contains("vc-reviews-sections-row") ||
          el.classList.contains("vc-perks-showcase")))
    ) {
      return;
    }
    if (el.querySelector && el.querySelector(".vc-reviews-card, .vc-role-card, .vc-ul-card, .vc-perks-card, .vc-faq-group, .vc-wiki-cmd-shell")) {
      var isSelfCard =
        el.classList.contains("vc-reviews-card") ||
        el.classList.contains("vc-role-card") ||
        el.classList.contains("vc-ul-card") ||
        el.classList.contains("vc-perks-card") ||
        el.classList.contains("vc-faq-group") ||
        el.classList.contains("vc-wiki-cmd-shell");
      if (!isSelfCard) return;
    }
    if (
      el.classList &&
      (el.classList.contains("vc-ul-toolbar") || el.classList.contains("vc-ul-board-tabs"))
    ) {
      return;
    }
    if (el.querySelector && el.querySelector(".vc-ul-board-tabs, .vc-ul-toolbar")) {
      return;
    }
    el.classList.add("vc-home-panel");
    if (el.classList.contains("vc-fx-card")) {
      if (!el.querySelector(":scope > .vc-fx-sheen")) {
        var extra = document.createElement("span");
        extra.className = "vc-fx-sheen";
        extra.setAttribute("aria-hidden", "true");
        el.insertBefore(extra, el.firstChild);
      }
      return;
    }
    el.classList.add("vc-fx-card");
    var sheen = document.createElement("span");
    sheen.className = "vc-fx-sheen";
    sheen.setAttribute("aria-hidden", "true");
    el.insertBefore(sheen, el.firstChild);
  }

  function pickFxCardNodes() {
    var root = document.querySelector("main") || document.querySelector(".vc-page");
    if (!root) return [];
    var found = root.querySelectorAll(
      ".vc-page-cine-card, .vc-home-deck__cell, .vc-home-highlight-card, .vc-home-linkpanel, .vc-home-storycard, #stats .vc-stat-cell, .vc-notify-stat, .vc-notify-row, .vc-role-card, .vc-ul-card, .vc-legal-card, .vc-faq-group, .vc-reviews-card, .vc-reviews-formcard, .vc-staff-block, .vc-staff-hub-card, .vc-sponsor-card, .vc-sponsor-embed, .vc-wiki-cmd-shell, .vc-perks-card, .vc-candidature-card, .vc-unban-before-card, .vc-unmute-before-card, .vc-auth-required-card, .vc-regole-card, .vc-support-donate-role, .vc-vote-live-card, .vc-vote-live-statbox, .vc-user-profile-block, .vc-cmd-grp"
    );
    var list = [];
    for (var i = 0; i < found.length; i++) {
      var el = found[i];
      if (skipChrome(el)) continue;
      if (el.hidden || el.hasAttribute("hidden")) continue;
      if (el.closest && el.closest("[hidden], .vc-wt-board, .vc-wt-sidebar, dialog, .vc-page-cine-hero")) continue;
      list.push(el);
    }
    if (list.length > 80) list = list.slice(0, 80);
    return list;
  }

  function markRise(el, delayMs) {
    if (!el || el.classList.contains("vc-home-rise")) return;
    el.classList.add("vc-home-rise");
    if (typeof delayMs === "number") {
      el.style.setProperty("--vc-rise-delay", Math.max(0, delayMs) + "ms");
    }
  }

  function ensureAtmos() {
    if (document.querySelector(".vc-site-atmos")) return;
    var stage = document.createElement("div");
    stage.className = "vc-site-atmos";
    stage.setAttribute("aria-hidden", "true");
    stage.innerHTML = '<div class="vc-site-atmos__veil"></div><div class="vc-site-atmos__grain"></div>';
    document.body.insertBefore(stage, document.body.firstChild);
  }

  function scanGlassPanels() {
    var root = document.getElementById("vc-page-content") || document.querySelector("main");
    if (!root) return [];
    var found = root.querySelectorAll(
      ".vc-page-cine-card, [class*='backdrop-blur'][class*='rounded-'], [class*='border-white'][class*='rounded-'], article[class*='rounded-'], section[class*='rounded-']"
    );
    var list = [];
    for (var i = 0; i < found.length; i++) {
      var el = found[i];
      if (skipChrome(el)) continue;
      if (el.closest && el.closest(".vc-page-cine-hero, .vc-ul-toolbar, .vc-ul-board-tabs, .vc-wt-board, dialog, header, footer")) {
        continue;
      }
      if (el.hidden || el.hasAttribute("hidden")) continue;
      var h = el.offsetHeight || 0;
      if (h > 0 && h < 52) continue;
      list.push(el);
    }
    return list;
  }

  function markTextRise() {
    var root = document.getElementById("vc-page-content") || document.querySelector("main");
    if (!root) return;
    var heads = root.querySelectorAll("h2, h3, .vc-section-kicker, .vc-home-deck__kicker");
    var n = 0;
    for (var i = 0; i < heads.length; i++) {
      var el = heads[i];
      if (skipChrome(el)) continue;
      if (el.closest && el.closest(".vc-page-cine-hero, .vc-ul-card, .vc-role-card, .vc-user-profile-block")) continue;
      markRise(el, 32 + n * 28);
      if (inView(el)) el.classList.add("is-in");
      n += 1;
      if (n >= 20) break;
    }
  }

  function initRise() {
    var nodes = pickRiseNodes();
    var seen = [];
    function seenHas(el) {
      for (var s = 0; s < seen.length; s++) if (seen[s] === el) return true;
      return false;
    }
    function touch(el, delayMs) {
      if (!el || seenHas(el)) return;
      seen.push(el);
      decorateFxCard(el);
      markRise(el, delayMs);
      if (inView(el)) el.classList.add("is-in");
    }
    for (var i = 0; i < nodes.length; i++) {
      touch(nodes[i], 16 + Math.min(i, 8) * 24);
    }
    var fx = pickFxCardNodes();
    for (var f = 0; f < fx.length; f++) {
      touch(fx[f], 16 + Math.min(f, 8) * 24);
    }
    var glass = scanGlassPanels();
    for (var g = 0; g < glass.length; g++) {
      touch(glass[g], 20 + Math.min(g, 8) * 22);
    }
    markTextRise();

    var riseNodes = document.querySelectorAll(".vc-home-rise");
    if (!riseNodes.length || typeof IntersectionObserver === "undefined") return;

    function reveal(el) {
      if (!el || el.classList.contains("is-in")) return;
      el.classList.add("is-in");
    }

    var io = new IntersectionObserver(
      function (entries) {
        for (var e = 0; e < entries.length; e++) {
          if (!entries[e].isIntersecting) continue;
          reveal(entries[e].target);
          io.unobserve(entries[e].target);
        }
      },
      { root: null, rootMargin: "0px 0px -6% 0px", threshold: 0.08 }
    );
    for (var n = 0; n < riseNodes.length; n++) {
      if (riseNodes[n].dataset.vcRiseIo === "1") continue;
      riseNodes[n].dataset.vcRiseIo = "1";
      io.observe(riseNodes[n]);
    }
  }

  function loadHomeCine() {
    try {
      if (window.__vcHomeCine) return;
      if (document.querySelector('script[src*="vc-home-cine"]')) return;
    } catch (e0) {}
    var s = document.createElement("script");
    s.src = "/js/vc-home-cine.js?v=20260819communityScroll";
    s.defer = true;
    (document.body || document.documentElement).appendChild(s);
  }

  function watchDynamicRise() {
    var roots = document.querySelectorAll("#vc-page-content, #vc-ul-grid, #vc-roles-grid, #vc-regole-list, #wiki-comandi-panel");
    if (!roots.length || typeof MutationObserver === "undefined") return;
    var pending = 0;
    for (var r = 0; r < roots.length; r++) {
      (function (root) {
        var obs = new MutationObserver(function () {
          clearTimeout(pending);
          pending = window.setTimeout(initRise, 90);
        });
        obs.observe(root, { childList: true, subtree: true });
      })(roots[r]);
    }
  }

  try {
    window.__vcSitePolishRise = initRise;
  } catch (eExpose) {}

  function boot() {
    if (excluded()) return;
    try {
      document.documentElement.classList.add("vc-site-polish");
      if (document.body) document.body.classList.add("vc-site-polish");
    } catch (eClass) {}
    if (isStandalonePwa()) {
      try {
        document.documentElement.classList.add("vc-site-polish--pwa");
      } catch (ePwaClass) {}
    }
    try {
      document.documentElement.classList.add("vc-home-motion-ready");
    } catch (eMotion) {}
    ensureAtmos();
    loadHomeCine();
    initRise();
    watchDynamicRise();
  }

  try {
    window.__vcSitePolishRise = initRise;
  } catch (eExpose) {}

  try {
    if (!excludedPath()) document.documentElement.classList.add("vc-site-polish");
  } catch (eEarly) {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  function onDynamicContentReady() {
    if (excluded()) return;
    initRise();
    try {
      if (typeof window.__vcInitPanelTilt === "function") window.__vcInitPanelTilt();
    } catch (eTilt) {}
  }

  document.addEventListener("vc:page-cine-ready", onDynamicContentReady);
  document.addEventListener("vc:page-content-ready", onDynamicContentReady);
  document.addEventListener("vc:roles-ready", onDynamicContentReady);
  document.addEventListener("vc:ul-ready", onDynamicContentReady);
})();
