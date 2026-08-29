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
    if (p === "/staff" || p.indexOf("/staff/") === 0) return true;
    return false;
  }

  function excluded() {
    var b = document.body;
    if (!b || !b.classList.contains("vc-body")) return true;
    if (b.classList.contains("vc-body--home")) return true;
    if (b.classList.contains("vc-dashboard-page")) return true;
    if (b.classList.contains("vc-seratafilm-page")) return true;
    if (b.classList.contains("vc-hw-page")) return true;
    if (b.classList.contains("vc-staff-area")) return true;
    if (document.documentElement && document.documentElement.classList.contains("vc-staff-route")) return true;
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
    // /notifications: layout flat come profilo — niente card wrapper sui pane.
    if (document.body && document.body.classList.contains("vc-notifications-page")) {
      return [];
    }
    var found = root.querySelectorAll(
      ":scope > section, :scope > article, :scope > div, #vc-page-content > section, #vc-page-content > article, #vc-page-content > div, #vc-page-content section, #vc-page-content article, .vc-page-cine-body > section, .vc-page-cine-body > article, .vc-page-cine-card, .vc-home-deck, .vc-home-deck__cell, .vc-home-feature, .vc-home-highlights, .vc-home-highlight-card, .vc-home-linkpanel, .vc-home-storycard, #stats .vc-stat-strip, .vc-glass, .vc-support-page-hero, .vc-notify-hero, .vc-notify-stat, .vc-support-donate-role, .vc-support-donate-roles, .vc-support-hero-pillar-row, .vc-faq-item, .vc-faq-group, .vc-reviews-section, .vc-reviews-card, .vc-reviews-formcard, .vc-staff-block, .vc-staff-hub-card, .vc-staff-hero, .vc-hw-window, .vc-hw-notice, .vc-hw-hero, .vc-hw-choice, .vc-unban-before-card, .vc-unmute-before-card, .vc-candidature-card, .vc-legal-card, .vc-sponsor-card, .vc-sponsor-embed, .vc-wiki-cmd-shell, .vc-cmd-grp, .vc-perks-card, .vc-user-profile-hero, .vc-user-profile-block, .vc-wt-board, .vc-auth-required-card, .vc-ul-card, .vc-role-card, .vc-regole-hero-card"
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
      return r.top < fold * 0.98 && r.bottom > 12;
    } catch (e) {
      return true;
    }
  }

  function decorateFxCard(el) {
    if (!el || skipChrome(el)) return;
    /* Notify rows over cine canvas: home-panel transparent chrome = continuous flash on Chromium. */
    if (el.classList && el.classList.contains("vc-notify-row")) return;
    if (el.closest && el.closest(".vc-page-cine-hero, .vc-wt-board, dialog")) return;
    if (
      el.id === "vc-page-content" ||
      el.id === "wiki-comandi-panel" ||
      el.id === "vc-regole-list" ||
      el.id === "vc-roles-grid" ||
      el.id === "vc-ul-grid" ||
      (el.classList &&
        (el.classList.contains("vc-stat-strip") ||
          el.classList.contains("vc-page-cine-body") ||
          el.classList.contains("vc-page-cine-aside") ||
          el.classList.contains("vc-page-cine-aside-inline") ||
          el.classList.contains("vc-reviews-section") ||
          el.classList.contains("vc-reviews-sections-row") ||
          el.classList.contains("vc-perks-showcase") ||
          el.classList.contains("vc-vote-live-stats") ||
          el.classList.contains("vc-card-grid-wrap") ||
          el.classList.contains("vc-roles-grid") ||
          el.classList.contains("vc-ul-grid") ||
          el.classList.contains("vc-reviews-grid")))
    ) {
      return;
    }
    if (
      el.querySelector &&
      el.querySelector(
        "#vc-roles-grid, #vc-ul-grid, .vc-roles-grid, .vc-ul-grid, .vc-reviews-grid, #vc-regole-list, #wiki-comandi-panel, .vc-card-grid-wrap, .vc-reviews-card, .vc-role-card, .vc-ul-card, .vc-perks-card, .vc-faq-group, .vc-wiki-cmd-shell, .vc-notify-stat, .vc-vote-live-statbox, .vc-notify-row, .vc-roles-search, .vc-ul-toolbar, .vc-ul-board-tabs, .vc-legal-card, .vc-staff-block, .vc-sponsor-embed, .vc-candidature-card, .vc-regole-card, .vc-support-donate-role, .vc-cmd-grp",
      )
    ) {
      var isSelfCard =
        el.classList.contains("vc-reviews-card") ||
        el.classList.contains("vc-role-card") ||
        el.classList.contains("vc-ul-card") ||
        el.classList.contains("vc-perks-card") ||
        el.classList.contains("vc-faq-group") ||
        el.classList.contains("vc-wiki-cmd-shell") ||
        el.classList.contains("vc-notify-stat") ||
        el.classList.contains("vc-vote-live-statbox") ||
        el.classList.contains("vc-notify-row") ||
        el.classList.contains("vc-legal-card") ||
        el.classList.contains("vc-staff-block") ||
        el.classList.contains("vc-sponsor-embed") ||
        el.classList.contains("vc-candidature-card") ||
        el.classList.contains("vc-regole-card") ||
        el.classList.contains("vc-support-donate-role") ||
        el.classList.contains("vc-cmd-grp");
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
      ".vc-page-cine-card, .vc-home-deck__cell, .vc-home-highlight-card, .vc-home-linkpanel, .vc-home-storycard, #stats .vc-stat-cell, .vc-notify-stat, .vc-role-card, .vc-ul-card, .vc-legal-card, .vc-faq-group, .vc-reviews-card, .vc-reviews-formcard, .vc-staff-block, .vc-staff-hub-card, .vc-sponsor-card, .vc-sponsor-embed, .vc-wiki-cmd-shell, .vc-perks-card, .vc-candidature-card, .vc-unban-before-card, .vc-unmute-before-card, .vc-auth-required-card, .vc-regole-card, .vc-support-donate-role, .vc-vote-live-card, .vc-vote-live-statbox, .vc-user-profile-block, .vc-cmd-grp"
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

  function undressEl(el) {
    if (!el || !el.classList) return;
    el.classList.remove("vc-home-panel", "vc-fx-card", "is-tilting", "vc-home-rise", "is-in");
    try {
      el.style.removeProperty("--vc-rise-delay");
    } catch (eDelay) {}
    try {
      var sheens = el.querySelectorAll(":scope > .vc-fx-sheen");
      for (var s = 0; s < sheens.length; s++) sheens[s].remove();
    } catch (eSheen) {}
  }

  function undressLayoutWrappers() {
    var nodes = document.querySelectorAll(
      [
        ".vc-stat-strip",
        ".vc-card-grid-wrap",
        ".vc-vote-live-stats",
        "#vc-roles-grid",
        "#vc-ul-grid",
        ".vc-roles-grid",
        ".vc-ul-grid",
        ".vc-reviews-grid",
        "#vc-regole-list",
        "#wiki-comandi-panel",
        "#vc-notif-pane-personal",
        "#vc-notif-pane-staff",
        "#vc-notif-scope-dock",
        "#vc-staff-inbox",
        ".vc-notif-staff-inbox",
        ".vc-notif-page-head",
        "body.vc-notifications-page main > div",
        "body.vc-notifications-page main > section",
        "body.vc-notifications-page #vc-page-content > div",
        "body.vc-notifications-page #vc-page-content > section",
        ".vc-home-panel:has(#vc-roles-grid)",
        ".vc-fx-card:has(#vc-roles-grid)",
        ".vc-home-panel:has(#vc-ul-grid)",
        ".vc-fx-card:has(#vc-ul-grid)",
        ".vc-home-panel:has(.vc-roles-grid)",
        ".vc-fx-card:has(.vc-roles-grid)",
        ".vc-home-panel:has(.vc-ul-grid)",
        ".vc-fx-card:has(.vc-ul-grid)",
        ".vc-home-panel:has(.vc-role-card)",
        ".vc-fx-card:has(.vc-role-card)",
        ".vc-home-panel:has(.vc-ul-card)",
        ".vc-fx-card:has(.vc-ul-card)",
        ".vc-home-panel:has(.vc-reviews-card)",
        ".vc-fx-card:has(.vc-reviews-card)",
        ".vc-home-panel:has(.vc-reviews-grid)",
        ".vc-fx-card:has(.vc-reviews-grid)",
        ".vc-home-panel:has(.vc-notify-stat)",
        ".vc-fx-card:has(.vc-notify-stat)",
        ".vc-home-panel:has(.vc-notify-row)",
        ".vc-fx-card:has(.vc-notify-row)",
        ".vc-home-panel:has(.vc-staff-inbox)",
        ".vc-fx-card:has(.vc-staff-inbox)",
        ".vc-home-panel:has(.vc-notif-staff-inbox)",
        ".vc-fx-card:has(.vc-notif-staff-inbox)",
        ".vc-home-panel:has(.vc-roles-search)",
        ".vc-fx-card:has(.vc-roles-search)",
        ".vc-home-panel:has(.vc-faq-group)",
        ".vc-fx-card:has(.vc-faq-group)",
        ".vc-home-panel:has(.vc-perks-card)",
        ".vc-fx-card:has(.vc-perks-card)",
        ".vc-home-panel:has(.vc-wiki-cmd-shell)",
        ".vc-fx-card:has(.vc-wiki-cmd-shell)",
        ".vc-home-panel:has(.vc-legal-card)",
        ".vc-fx-card:has(.vc-legal-card)",
        ".vc-home-panel:has(.vc-staff-block)",
        ".vc-fx-card:has(.vc-staff-block)",
        ".vc-home-panel:has(#vc-regole-list)",
        ".vc-fx-card:has(#vc-regole-list)",
        ".vc-home-panel:has(#wiki-comandi-panel)",
        ".vc-fx-card:has(#wiki-comandi-panel)",
        "section:has(> .vc-notify-stat)",
        "div:has(> .vc-notify-stat)",
        "section:has(> .vc-roles-search)",
        "div:has(> .vc-roles-search)",
      ].join(", "),
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      // Mai togliere la cornice alle card stesse.
      if (
        el.classList &&
        (el.classList.contains("vc-role-card") ||
          el.classList.contains("vc-ul-card") ||
          el.classList.contains("vc-reviews-card") ||
          el.classList.contains("vc-notify-stat") ||
          el.classList.contains("vc-notify-row") ||
          el.classList.contains("vc-perks-card") ||
          el.classList.contains("vc-faq-group") ||
          el.classList.contains("vc-wiki-cmd-shell") ||
          el.classList.contains("vc-legal-card") ||
          el.classList.contains("vc-staff-block") ||
          el.classList.contains("vc-sponsor-embed") ||
          el.classList.contains("vc-regole-card") ||
          el.classList.contains("vc-candidature-card") ||
          el.classList.contains("vc-support-donate-role"))
      ) {
        continue;
      }
      undressEl(el);
    }
  }

  function initRise() {
    undressLayoutWrappers();
    try {
      var staleNotify = document.querySelectorAll(".vc-notify-row.vc-home-panel, .vc-notify-row.vc-fx-card, .vc-notify-row.vc-home-rise");
      for (var sn = 0; sn < staleNotify.length; sn++) undressEl(staleNotify[sn]);
    } catch (eNotifyUndress) {}
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
      { root: null, rootMargin: "0px 0px -2% 0px", threshold: 0.02 }
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
    s.src = "/js/vc-home-cine.js?v=20260829cinePerf2";
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
