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

    function isPhoneTouchUi() {
    if (isStandalonePwa()) return true;
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
    } catch (e0) {}
    try {
      if (
        window.matchMedia &&
        window.matchMedia("(hover: none)").matches &&
        Number(navigator.maxTouchPoints || 0) > 0
      ) {
        return true;
      }
    } catch (e1) {}
    return Number(navigator.maxTouchPoints || 0) > 0;
  }

  function skipHeavyPolishFx() {
    try {
      /* cpuPagesIdle1: no tilt/heavy polish su pagine soft */
      if (document.documentElement.classList.contains("vc-site-cpu-soft")) return true;
      if (document.documentElement.classList.contains("vc-pwa-cpu-nuke")) return true;
    } catch (eSoft) {}
    return isPhoneTouchUi();
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
        "header, footer, .vc-nav-shell, .vc-snav-panel, .vc-notif-panel, dialog, .vc-site-atmos, .vc-home-cine, .vc-ul-loading, .vc-reviews-gate, .vc-rank-customize-loading, .vc-user-profile-loader, .vc-session-verify-overlay, #vc-user-profile-view, .vc-rank-customize-page, .vc-user-profile-tabs"
      )
    );
  }

  function pickRiseNodes() {
    var root = document.querySelector("main") || document.querySelector(".vc-page");
    if (!root) return [];
        if (document.body && document.body.classList.contains("vc-notifications-page")) {
      return [];
    }
    var found = root.querySelectorAll(
      ":scope > section, :scope > article, :scope > div, #vc-page-content > section, #vc-page-content > article, #vc-page-content > div, #vc-page-content section, #vc-page-content article, .vc-page-cine-body > section, .vc-page-cine-body > article, .vc-page-cine-card, .vc-home-deck, .vc-home-deck__cell, .vc-home-feature, .vc-home-highlights, .vc-home-highlight-card, .vc-home-linkpanel, .vc-home-storycard, #stats .vc-stat-strip, .vc-glass, .vc-support-page-hero, .vc-notify-hero, .vc-notify-stat, .vc-support-donate-role, .vc-support-donate-roles, .vc-support-hero-pillar-row, .vc-faq-item, .vc-faq-group, .vc-reviews-section, .vc-reviews-card:not(.vc-reviews-stage__card), .vc-reviews-formcard, .vc-staff-block, .vc-staff-hub-card, .vc-staff-hero, .vc-hw-window, .vc-hw-notice, .vc-hw-hero, .vc-hw-choice, .vc-unban-before-card, .vc-unmute-before-card, .vc-candidature-card, .vc-legal-card, .vc-sponsor-card, .vc-sponsor-embed, .vc-wiki-cmd-shell, .vc-cmd-grp, .vc-perks-card, .vc-user-profile-hero, .vc-user-profile-block, .vc-wt-board, .vc-auth-required-card, .vc-ul-card, .vc-role-card, .vc-regole-hero-card"
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
          el.classList.contains("vc-staff-hero") ||
          el.classList.contains("vc-legal-hero"))
      ) {
        continue;
      }
      if (el.closest && el.closest(".vc-page-cine-hero, .vc-support-page-hero, .vc-notify-hero, .vc-staff-hero, .vc-legal-hero")) {
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
      /* scrollPaintHoles1: wide band — avoid opacity:0 holes while scrolling */
      return r.bottom > -80 && r.top < fold * 1.35;
    } catch (e) {
      return true;
    }
  }

  function decorateFxCard(el) {
    if (!el || skipChrome(el)) return;
        if (el.classList && el.classList.contains("vc-notify-row")) return;
        /* reviewsStageSpread2: carousel stage cards must stay absolute — no fx/panel/rise */
        if (el.classList && el.classList.contains("vc-reviews-stage__card")) return;
        if (el.closest && el.closest(".vc-reviews-stage")) return;
        /* cineHeroCtaFit1: CTA hero non sono card — border-white+rounded finivano in scanGlassPanels */
        if (el.tagName === "A" && el.classList && (el.classList.contains("vc-header-pill") || el.classList.contains("vc-home-cine-cta"))) return;
        /* legalHeroNoCard1: titolo policy senza card esterna */
        if (el.classList && el.classList.contains("vc-legal-hero")) return;
        if (el.closest && el.closest(".vc-legal-hero")) return;
        /* glowCorners: wiki shell has its own chrome — don't add fx/home-panel (square ID shells) */
        if (el.classList && el.classList.contains("vc-wiki-cmd-shell")) return;
        if (el.id === "wiki-comandi-panel") return;
        if (el.classList && el.classList.contains("vc-fx-card") && el.querySelector(":scope > .vc-fx-sheen")) {
      return;
    }
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
        el.classList.contains("vc-support-donate-role");
      /* wikiCmdAccFrames2: .vc-cmd-grp resta accordion, non home-panel */
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
    var skipSheen =
      (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) ||
      (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite());
    if (el.classList.contains("vc-fx-card")) {
      if (!skipSheen && !el.querySelector(":scope > .vc-fx-sheen")) {
        var extra = document.createElement("span");
        extra.className = "vc-fx-sheen";
        extra.setAttribute("aria-hidden", "true");
        el.insertBefore(extra, el.firstChild);
      }
      return;
    }
    el.classList.add("vc-fx-card");
    if (skipSheen) return;
    var sheen = document.createElement("span");
    sheen.className = "vc-fx-sheen";
    sheen.setAttribute("aria-hidden", "true");
    el.insertBefore(sheen, el.firstChild);
  }

  function pickFxCardNodes() {
    var root = document.querySelector("main") || document.querySelector(".vc-page");
    if (!root) return [];
    var found = root.querySelectorAll(
      ".vc-page-cine-card, .vc-home-deck__cell, .vc-home-highlight-card, .vc-home-linkpanel, .vc-home-storycard, #stats .vc-stat-cell, .vc-notify-stat, .vc-role-card, .vc-ul-card, .vc-legal-card, .vc-faq-group, .vc-reviews-card:not(.vc-reviews-stage__card), .vc-reviews-formcard, .vc-staff-block, .vc-staff-hub-card, .vc-sponsor-card, .vc-sponsor-embed, .vc-wiki-cmd-shell, .vc-perks-card, .vc-candidature-card, .vc-unban-before-card, .vc-unmute-before-card, .vc-auth-required-card, .vc-regole-card, .vc-support-donate-role, .vc-vote-live-card, .vc-vote-live-statbox, .vc-user-profile-block"
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
    if (el.classList.contains("vc-reviews-stage__card") || (el.closest && el.closest(".vc-reviews-stage"))) return;
    el.classList.add("vc-home-rise");
    if (typeof delayMs === "number") {
      el.style.setProperty("--vc-rise-delay", Math.max(0, delayMs) + "ms");
    }
    /* scrollPaintHoles1: never leave a card invisible if IO misses */
    window.setTimeout(function () {
      try {
        if (el && el.classList && el.classList.contains("vc-home-rise") && !el.classList.contains("is-in")) {
          el.classList.add("is-in");
        }
      } catch (eRiseFail) {}
    }, 1600);
  }

  function isAccordionFx(el) {
    if (!el) return false;
    if (
      el.id === "vc-regole-tabs" ||
      el.id === "vc-regole-list" ||
      el.id === "vc-staff-guide-tabs" ||
      el.id === "vc-staff-guide-list"
    ) {
      return true;
    }
    if (
      el.classList &&
      (el.classList.contains("vc-regole-tab") ||
        el.classList.contains("vc-regole-card") ||
        el.classList.contains("vc-regole-acc-ready"))
    ) {
      return true;
    }
    if (
      el.closest &&
      (el.closest("#vc-regole-list") ||
        el.closest("#vc-staff-guide-list") ||
        el.closest("#vc-regole-tabs") ||
        el.closest("#vc-staff-guide-tabs"))
    ) {
      return true;
    }
    return false;
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
      /* cineHeroCtaFit1: pill CTA outline matchano border-white+rounded — skip */
      if (el.tagName === "A" && el.classList && (el.classList.contains("vc-header-pill") || el.classList.contains("vc-home-cine-cta"))) continue;
      if (el.closest && el.closest(".vc-page-cine-hero, .vc-support-page-hero, .vc-home-cine-hero, .vc-ul-toolbar, .vc-ul-board-tabs, .vc-wt-board, dialog, header, footer")) {
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
      markRise(el, 0);
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
        /* cineHeroCtaFit1: strip panel classes from hero CTA pills */
        "a.vc-header-pill.vc-home-panel",
        "a.vc-header-pill.vc-fx-card",
        "a.vc-home-cine-cta.vc-home-panel",
        "a.vc-home-cine-cta.vc-fx-card",
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
        ".vc-legal-hero.vc-home-panel",
        ".vc-legal-hero.vc-fx-card",
        "section.vc-legal-hero.vc-home-panel",
        "section.vc-legal-hero.vc-fx-card",
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

  var riseBusy = false;
  var risePassDone = false;
  var riseMoTimer = 0;
  var riseMoPaused = false;

  function initRise() {
    if (excluded()) return;
    if (riseBusy) return;
    riseBusy = true;
    riseMoPaused = true;
    try {
            if (!risePassDone) {
        try {
          undressLayoutWrappers();
        } catch (eUndress) {}
        risePassDone = true;
      }
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
        if (el.classList && el.classList.contains("vc-reviews-stage__card")) return;
        if (el.closest && el.closest(".vc-reviews-stage")) return;
        if (isAccordionFx(el)) {
          if (typeof window.__vcRevealRegoleAccordion === "function") {
            window.__vcRevealRegoleAccordion(el);
          }
          return;
        }
        if (el.getAttribute("data-vc-body-cascade") === "1") return;
        seen.push(el);
        if (isPhoneTouchUi()) {
          el.classList.add("is-in");
          el.classList.remove("vc-home-rise");
          try {
            el.style.removeProperty("--vc-rise-delay");
          } catch (eSnapDelay) {}
          return;
        }
        decorateFxCard(el);
        markRise(el, delayMs);
        if (inView(el)) el.classList.add("is-in");
      }
      for (var i = 0; i < nodes.length; i++) {
        touch(nodes[i], 0);
      }
      var fx = pickFxCardNodes();
      for (var f = 0; f < fx.length; f++) {
        touch(fx[f], 0);
      }
      var glass = scanGlassPanels();
      for (var g = 0; g < glass.length; g++) {
        touch(glass[g], 0);
      }
      markTextRise();

      var riseNodes = document.querySelectorAll(".vc-home-rise");
      if (!riseNodes.length) {
        window.setTimeout(function () {
          forceRevealStaleRises(false);
        }, 900);
        return;
      }
      if (typeof IntersectionObserver === "undefined") {
        for (var r0 = 0; r0 < riseNodes.length; r0++) riseNodes[r0].classList.add("is-in");
        return;
      }

      function reveal(el) {
        if (!el || el.classList.contains("is-in")) return;
        if (el.getAttribute("data-vc-body-cascade") === "1") return;
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
        { root: null, rootMargin: "180px 0px 280px 0px", threshold: 0.01 }
      );
      for (var n = 0; n < riseNodes.length; n++) {
        if (riseNodes[n].getAttribute("data-vc-body-cascade") === "1") continue;
        if (riseNodes[n].dataset.vcRiseIo === "1") continue;
        riseNodes[n].dataset.vcRiseIo = "1";
        if (
          riseNodes[n].classList.contains("vc-regole-card") ||
          riseNodes[n].classList.contains("vc-faq-item") ||
          riseNodes[n].classList.contains("vc-faq-group") ||
          riseNodes[n].closest("#vc-regole-list")
        ) {
          reveal(riseNodes[n]);
          continue;
        }
        io.observe(riseNodes[n]);
      }

      window.setTimeout(function () {
        forceRevealStaleRises(false);
      }, 900);
      window.setTimeout(function () {
        forceRevealStaleRises(true);
      }, 12000);
    } finally {
      riseBusy = false;
            window.setTimeout(function () {
        riseMoPaused = false;
      }, 50);
    }
  }

  function forceRevealStaleRises(forceAll) {
    try {
      var nodes = document.querySelectorAll(".vc-home-rise:not(.is-in)");
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].getAttribute("data-vc-body-cascade") === "1" && !window.__vcPageBodyCascadeDone) continue;
        if (!forceAll && !inView(nodes[i])) continue;
        nodes[i].classList.add("is-in");
      }
    } catch (eForce) {}
  }

  function recoverBlackScreen() {
    try {
      var root = document.documentElement;
      root.classList.add("vc-page-cine-ready");
      root.classList.remove("vc-page-cine-boot");
      root.classList.add("vc-home-motion-ready");
      root.classList.remove("vc-cine-idle");
    } catch (eReady) {}
    forceRevealStaleRises(true);
        try {
            var body = document.body;
      if (body && isStandalonePwa()) {
        body.style.setProperty("background-color", "#100c09");
      }
    } catch (eBg) {}
  }

  function loadHomeCine() {
    try {
      if (window.__vcHomeCine) return;
      if (document.querySelector('script[src*="vc-home-cine"]')) return;
    } catch (e0) {}
    var s = document.createElement("script");
    s.src = "/js/vc-home-cine.js?v=20260929cpuIdleHard1";
    s.defer = true;
    (document.body || document.documentElement).appendChild(s);
  }

  function watchDynamicRise() {
    var roots = document.querySelectorAll(
      "#vc-page-content, #vc-ul-grid, #vc-roles-grid, #vc-regole-list, #vc-regole-tabs, #vc-staff-guide-list, #vc-staff-guide-tabs, #wiki-comandi-panel"
    );
    if (!roots.length || typeof MutationObserver === "undefined") return;
    for (var r = 0; r < roots.length; r++) {
      (function (root) {
        var obs = new MutationObserver(function (mutations) {
          if (riseMoPaused || riseBusy) return;
          var isAccRoot =
            root.id === "vc-regole-list" ||
            root.id === "vc-regole-tabs" ||
            root.id === "vc-staff-guide-list" ||
            root.id === "vc-staff-guide-tabs";
          if (isAccRoot) {
            if (typeof window.__vcRevealRegoleAccordion === "function") {
              window.__vcRevealRegoleAccordion(root);
            }
            return;
          }
          var meaningful = false;
          for (var m = 0; m < mutations.length; m++) {
            var mut = mutations[m];
            var nodes = [];
            if (mut.addedNodes && mut.addedNodes.length) {
              for (var a = 0; a < mut.addedNodes.length; a++) nodes.push(mut.addedNodes[a]);
            }
            if (mut.removedNodes && mut.removedNodes.length) {
              for (var rm = 0; rm < mut.removedNodes.length; rm++) nodes.push(mut.removedNodes[rm]);
            }
            for (var n = 0; n < nodes.length; n++) {
              var node = nodes[n];
              if (!node || node.nodeType !== 1) continue;
              var cls = node.classList;
              if (cls && (cls.contains("vc-fx-sheen") || cls.contains("vc-site-atmos"))) continue;
              meaningful = true;
              break;
            }
            if (meaningful) break;
          }
          if (!meaningful) return;
          clearTimeout(riseMoTimer);
          riseMoTimer = window.setTimeout(initRise, 720);
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
    if (!skipHeavyPolishFx()) {
      watchDynamicRise();
    }
    window.setTimeout(function () {
      forceRevealStaleRises(false);
    }, 280);
    window.setTimeout(function () {
      forceRevealStaleRises(false);
    }, 900);
    window.setTimeout(function () {
      forceRevealStaleRises(true);
    }, 8000);
    try {
      var scrollBusyTimer = null;
      var ensureScrollPaintCss = function () {
        if (document.getElementById("vc-scroll-paint-css")) return;
        var s = document.createElement("style");
        s.id = "vc-scroll-paint-css";
        /* glowStayScroll1: non toccare bordo/glow card in scroll — solo sheen off */
        s.textContent =
          "html.vc-scroll-busy .vc-fx-sheen{opacity:0!important;visibility:hidden!important;}";
        document.head.appendChild(s);
      };
      var onScrollPaint = function () {
        try {
          ensureScrollPaintCss();
          document.documentElement.classList.add("vc-scroll-busy");
        } catch (eBusy) {}
        forceRevealStaleRises(false);
        if (scrollBusyTimer) window.clearTimeout(scrollBusyTimer);
        /* glowStayScroll1: busy più corto — non serve più tenere solid border */
        scrollBusyTimer = window.setTimeout(function () {
          try {
            document.documentElement.classList.remove("vc-scroll-busy");
          } catch (eBusyOff) {}
        }, 180);
      };
      window.addEventListener("scroll", onScrollPaint, { passive: true, capture: true });
      window.addEventListener("wheel", onScrollPaint, { passive: true, capture: true });
      window.addEventListener("touchmove", onScrollPaint, { passive: true, capture: true });
      try {
        window.addEventListener("scrollend", function () {
          if (scrollBusyTimer) window.clearTimeout(scrollBusyTimer);
          scrollBusyTimer = window.setTimeout(function () {
            try {
              document.documentElement.classList.remove("vc-scroll-busy");
            } catch (eEnd) {}
          }, 80);
        }, { passive: true });
      } catch (eScrollEnd) {}
    } catch (eScroll) {}
    try {
      window.addEventListener("pageshow", function () {
        recoverBlackScreen();
      });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") recoverBlackScreen();
      });
    } catch (eRec) {}
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
    if (skipHeavyPolishFx()) return;
    try {
      if (typeof window.__vcInitPanelTilt === "function") window.__vcInitPanelTilt();
    } catch (eTilt) {}
  }

  document.addEventListener("vc:page-cine-ready", onDynamicContentReady);
  document.addEventListener("vc:page-content-ready", onDynamicContentReady);
  document.addEventListener("vc:roles-ready", onDynamicContentReady);
  document.addEventListener("vc:ul-ready", onDynamicContentReady);
  document.addEventListener("vc:regole-acc-ready", onDynamicContentReady);
})();
