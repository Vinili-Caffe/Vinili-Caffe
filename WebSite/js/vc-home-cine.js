/* Atmosphere: vinile + luce + polvere. Home e pagine pubbliche (vc-site-polish). */
(function () {
  if (window.__vcHomeCine) return;
  window.__vcHomeCine = true;

  function homeHasAnchor() {
    return String(location.hash || "").replace(/^#/, "").length > 0;
  }

  function pageScrollY() {
    try {
      return (
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        (document.body && document.body.scrollTop) ||
        0
      );
    } catch (eY) {
      return 0;
    }
  }

  function forceScrollTop() {
    try {
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch (eForce) {}
  }

  function snapScrollTopIfPristine() {
    if (homeHasAnchor()) return;
    if (pageScrollY() > 8) return;
    forceScrollTop();
  }

  function resetHomeScroll(ev) {
    if (ev && ev.persisted) return;
    snapScrollTopIfPristine();
  }

  function isPolishPage() {
    return document.documentElement.classList.contains("vc-site-polish");
  }

  function isLiteFxPage() {
    var body = document.body;
    if (!body) return false;
    return body.classList.contains("vc-users-page") || body.classList.contains("vc-roles-page");
  }

  function tiltSelectors() {
    var body = document.body;
    if (!body) return "";
    if (body.classList.contains("vc-body--home")) {
      return "#stats .vc-stat-strip, .vc-home-deck, .vc-home-feature, .vc-home-index";
    }
    if (!isPolishPage()) return "";
    return [
      "#vc-page-content .vc-wiki-cmd-shell",
      "#vc-page-content .vc-faq-group",
      "#vc-page-content .vc-reviews-formcard",
      "#vc-page-content .vc-reviews-card",
      "#vc-page-content .vc-perks-card",
      "#vc-page-content .vc-legal-card",
      "#vc-page-content .vc-sponsor-embed",
      "#vc-page-content .vc-sponsor-card",
      "#vc-page-content .vc-staff-block",
      "#vc-page-content .vc-staff-hub-card",
      "#vc-page-content .vc-candidature-card",
      "#vc-page-content .vc-unban-before-card",
      "#vc-page-content .vc-unmute-before-card",
      "#vc-page-content .vc-auth-required-card",
      "#vc-page-content .vc-support-donate-role",
      "#vc-page-content .vc-vote-live-card",
      "#vc-page-content .vc-regole-card",
      "#vc-page-content .vc-home-panel",
    ].join(", ");
  }

  function useLiteCanvas() {
    try {
      if (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite()) return true;
      if (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) {
        /* mid: still lite canvas on heavy pages / PWA */
        if (isLiteFxPage() || isStandalonePwa()) return true;
      }
    } catch (ePerf) {}
    return isLiteFxPage() || isStandalonePwa();
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

  function prefersReduced() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function isAuditBot() {
    try {
      if (navigator.webdriver) return true;
      var ua = String(navigator.userAgent || "");
      return /Chrome-Lighthouse|Lighthouse|PTST|Google Page Speed/i.test(ua);
    } catch (e) {
      return false;
    }
  }

  function isCoarse() {
    try {
      return window.matchMedia("(pointer: coarse)").matches;
    } catch (e) {
      return Number(navigator.maxTouchPoints || 0) > 0;
    }
  }

  function ensureCursorTrailScript() {
    try {
      if (window.__VC_CURSOR_TRAIL_INIT) return;
      if (document.documentElement.classList.contains("vc-cursor-trail-off")) return;
      try {
        if (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite()) return;
      } catch (eLite) {}
      if (document.querySelector('script[src*="vc-cursor-trail.js"]')) return;
      var s = document.createElement("script");
      s.src = "/js/vc-cursor-trail.js?v=20260825cursorFx1";
      s.defer = true;
      (document.head || document.documentElement).appendChild(s);
    } catch (eTrail) {}
  }

  function ensureSpotlightLayer(stage) {
    if (!stage) return null;
    var spot = stage.querySelector(".vc-home-cine__spotlight");
    if (!spot) {
      spot = document.createElement("div");
      spot.className = "vc-home-cine__spotlight";
      spot.setAttribute("aria-hidden", "true");
      var veil = stage.querySelector(".vc-home-cine__veil");
      if (veil) stage.insertBefore(spot, veil);
      else stage.appendChild(spot);
    }
    return spot;
  }

  function ensureStage() {
    var existing = document.querySelector(".vc-home-cine");
    if (existing) {
      ensureSpotlightLayer(existing);
      return existing;
    }
    var stage = document.createElement("div");
    stage.className = "vc-home-cine";
    stage.setAttribute("aria-hidden", "true");
    stage.innerHTML =
      '<canvas class="vc-home-cine__canvas"></canvas>' +
      '<div class="vc-home-cine__spotlight"></div>' +
      '<div class="vc-home-cine__veil"></div>' +
      '<div class="vc-home-cine__grain"></div>';
    document.body.insertBefore(stage, document.body.firstChild);
    return stage;
  }

  function headerOffset() {
    var bar = document.querySelector(".vc-header-bar") || document.querySelector("header");
    var h = bar ? bar.getBoundingClientRect().height : 72;
    return Math.round(Math.max(64, h + 18));
  }

  function pageScrollTarget() {
    return (
      document.getElementById("vc-page-content") ||
      document.getElementById("stats") ||
      document.getElementById("scopri") ||
      document.getElementById("highlights")
    );
  }

  function scrollToPageContent(ev) {
    var target = pageScrollTarget();
    if (!target) return;
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    var top = target.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0) - headerOffset();
    if (top < 0) top = 0;
    window.scrollTo({
      top: top,
      behavior: prefersReduced() || isCoarse() ? "auto" : "smooth",
    });
  }

  function isStaffRoute() {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    return p === "/staff" || p.indexOf("/staff/") === 0;
  }

  function isEventoPage() {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/evento" || p.indexOf("/evento/") === 0) return true;
    return Boolean(document.body && document.body.classList.contains("vc-hw-page"));
  }

  function isStaffProfileHome() {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/staff") return true;
    return Boolean(document.body && document.body.classList.contains("vc-staff-profile-home"));
  }

  /** Inbox: canvas cine sì, layout hero full-viewport no (mobile first-load). */
  function isStaffInboxPage() {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/staff/inbox") return true;
    return Boolean(
      (document.body && document.body.classList.contains("vc-staff-inbox-page")) ||
        (document.documentElement && document.documentElement.classList.contains("vc-staff-inbox-route")),
    );
  }

  function isStaffCinePage() {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    // /staff (profilo) vuole solo lo sfondo cine, non la card hero centrale.
    if (p === "/staff" || isStaffProfileHome()) return false;
    // Inbox: stessa logica (layout compatto sotto header; niente 100svh).
    if (isStaffInboxPage()) return false;
    if (
      p === "/staff/guida" ||
      p === "/staff/pause" ||
      p === "/staff/gestione" ||
      p === "/staff/organico" ||
      p === "/staff/punti-tolti"
    ) {
      return true;
    }
    return Boolean(
      (document.body &&
        (document.body.classList.contains("vc-staff-cine-page") ||
          document.body.classList.contains("vc-staff-manage-page") ||
          document.body.classList.contains("vc-staff-organico-page") ||
          document.body.classList.contains("vc-staff-guide-page"))) ||
        (document.documentElement && document.documentElement.classList.contains("vc-staff-cine-route")),
    );
  }

  /** @deprecated alias — use isStaffCinePage */
  function isStaffInboxCinePage() {
    return isStaffCinePage();
  }

  function skipScrollCuePage() {
    if (isEventoPage()) return true;
    if (isStaffInboxPage()) return true;
    if (isStaffRoute() && !isStaffCinePage()) return true;
    var body = document.body;
    if (!body) return false;
    // Profilo staff: cine sì, cue “scorri” no (come /user/profilo).
    if (isStaffProfileHome() || body.classList.contains("vc-staff-profile-home")) return true;
    if (body.classList.contains("vc-user-profile-route") || body.classList.contains("vc-user-profile-page")) {
      return true;
    }
    if (body.classList.contains("vc-roles-page")) return false;
    if (
      body.classList.contains("vc-users-page") &&
      body.classList.contains("vc-page-cine-layout") &&
      !body.classList.contains("vc-user-profile-route")
    ) {
      return false;
    }
    if (body.classList.contains("vc-users-page") && !body.classList.contains("vc-user-profile-route")) {
      return true;
    }
    return false;
  }

  function pageLoadingOverlay() {
    var ids = ["vc-roles-loading", "vc-ul-loading"];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el || el.hidden || el.getAttribute("hidden") != null) continue;
      try {
        var cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
      } catch (eCs) {}
      return el;
    }
    return null;
  }

  function cueGeometryReady(hero) {
    if (pageLoadingOverlay()) return false;
    var main = (hero && hero.closest && hero.closest("main")) || document.querySelector("main");
    if (main) {
      try {
        var mcs = window.getComputedStyle(main);
        if (mcs.display === "none" || mcs.visibility === "hidden") return false;
      } catch (eMain) {}
    }
    if (!hero) return true;
    var r = hero.getBoundingClientRect();
    return r.width >= 8 && r.height >= 8;
  }

  function refreshScrollCue(cue, hero, target) {
    if (!cue) return;
    if (skipScrollCuePage()) {
      cue.classList.add("is-away");
      cue.hidden = true;
      return;
    }
    cue.hidden = false;
    if (!cueGeometryReady(hero)) {
      cue.classList.remove("is-away");
      cue.setAttribute("aria-hidden", "false");
      return;
    }
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var hide = y > 72;
    cue.classList.toggle("is-away", hide);
    cue.setAttribute("aria-hidden", hide ? "true" : "false");
  }

  function bindCueLayoutWatch(cue, hero, target) {
    if (!cue || cue.dataset.vcCueWatch === "1") return;
    cue.dataset.vcCueWatch = "1";
    function poke() {
      requestAnimationFrame(function () {
        refreshScrollCue(cue, hero, target);
      });
    }
    var overlay = pageLoadingOverlay() || document.getElementById("vc-roles-loading") || document.getElementById("vc-ul-loading");
    if (overlay && typeof MutationObserver !== "undefined") {
      var mo = new MutationObserver(poke);
      mo.observe(overlay, { attributes: true, attributeFilter: ["hidden", "class", "style"] });
    }
    window.addEventListener("pageshow", poke);
    document.addEventListener("vc:roles-ready", poke);
    document.addEventListener("vc:page-content-ready", poke);
  }

  function ensureScrollCueFor(hero, container) {
    if (!hero) return;
    if (skipScrollCuePage()) {
      var stale =
        document.body.querySelector(":scope > .vc-home-scrollcue") ||
        (hero && hero.querySelector(":scope > .vc-home-scrollcue"));
      if (stale) stale.remove();
      return;
    }
    var orphaned = document.body.querySelector(":scope > .vc-home-scrollcue");
    if (orphaned) orphaned.remove();
    container = container || hero.closest("main") || document.querySelector("main");
    var target = document.getElementById("vc-page-content");
    if (!target && container) {
      var sib = hero.nextElementSibling;
      while (sib) {
        if (!sib.hidden && sib.getAttribute("hidden") == null && sib.id !== "vc-page-intro") {
          target = sib;
          break;
        }
        sib = sib.nextElementSibling;
      }
    }
    if (!target) target = pageScrollTarget();
    if (!target) return;
    if (!target.id) target.id = "vc-page-content";
    var cue = hero.querySelector(":scope > .vc-home-scrollcue");
    if (!cue) {
      cue = document.createElement("a");
      cue.className = "vc-home-scrollcue";
      cue.setAttribute("aria-label", "Scorri per continuare a leggere");
      cue.innerHTML =
        '<span class="vc-home-scrollcue__label">Scorri per continuare</span>' +
        '<span class="vc-home-scrollcue__chev" aria-hidden="true"><span></span><span></span></span>';
      hero.appendChild(cue);
    } else if (cue.parentElement !== hero) {
      hero.appendChild(cue);
    }
    cue.classList.remove("vc-home-scrollcue--dock");
    cue.setAttribute("href", "#" + target.id);
    if (cue.dataset.vcScrollCue !== "1") {
      cue.dataset.vcScrollCue = "1";
      cue.addEventListener("click", scrollToPageContent);
    }
    startCueBounce(cue);
    function onScroll() {
      refreshScrollCue(cue, hero, target);
    }
    bindCueLayoutWatch(cue, hero, target);
    if (cue.dataset.vcScrollCueScroll !== "1") {
      cue.dataset.vcScrollCueScroll = "1";
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      onScroll();
    } else {
      onScroll();
    }
  }

  function ensureScrollCue() {
    ensureScrollCueFor(document.getElementById("intro"));
  }

  function excludedPolishPath() {
    if (isStaffRoute() && !isStaffCinePage()) return true;
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/") return true;
    if (p === "/seratafilm" || p.indexOf("/seratafilm/") === 0) return true;
    if (p === "/dashboard" || p.indexOf("/dashboard/") === 0) return true;
    return false;
  }

  function isUserProfileRoute() {
    var p = String(location.pathname || "").replace(/\/+$/, "");
    if (/^\/users?\/\d{17,20}$/.test(p)) return true;
    try {
      var q = new URLSearchParams(location.search || "");
      var id = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
      if (/^\d{17,20}$/.test(id)) return true;
    } catch (e) {}
    return Boolean(document.documentElement && document.documentElement.classList.contains("vc-user-profile-pending"));
  }

  function shouldSkipPageCineHeroLayout() {
    // Evento Hogwarts: solo sfondo cine, layout pagine invariato.
    if (isEventoPage()) return true;
    // Staff tools: layout operativo — eccezione pagine cine (profilo/inbox/guida/pause/gestione).
    if (isStaffRoute() && !isStaffCinePage()) return true;
    if (isUserProfileRoute()) return true;
    var p = String(location.pathname || "").replace(/\/+$/, "");
    if (/^\/user\/(personalizza|customize|custom)(\/|$)/.test(p)) return true;
    return false;
  }

  function isUsersCommunityPage() {
    return !shouldSkipPageCineHeroLayout() && Boolean(document.body && document.body.classList.contains("vc-users-page"));
  }

  function isCommunityLeaderReady() {
    var root = document.documentElement;
    if (!root) return true;
    if (root.classList.contains("vc-user-leader-pending")) return false;
    if (root.classList.contains("vc-user-profile-pending")) return false;
    var loader = document.getElementById("vc-ul-loading");
    if (loader && !loader.hidden) return false;
    return true;
  }

  function whenCommunityLeaderReady(fn) {
    if (typeof fn !== "function") return;
    if (!isUsersCommunityPage()) {
      fn();
      return;
    }
    if (isCommunityLeaderReady()) {
      fn();
      return;
    }
    var done = false;
    function run() {
      if (done || !isCommunityLeaderReady()) return;
      done = true;
      try {
        obs.disconnect();
      } catch (eObs) {}
      try {
        if (loaderObs) loaderObs.disconnect();
      } catch (eLoaderObs) {}
      fn();
    }
    var obs = new MutationObserver(run);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    var loader = document.getElementById("vc-ul-loading");
    var loaderObs = null;
    if (loader) {
      loaderObs = new MutationObserver(run);
      loaderObs.observe(loader, { attributes: true, attributeFilter: ["hidden"] });
    }
    run();
  }

  function markPageCineReady(immediate) {
    // Staff cine: aspetta il primo paint del canvas per evitare flash UI su stage vuoto.
    // immediate=true → reveal forzato (failsafe / no-canvas), senza fingere vc-home-cine-live.
    if (
      !immediate &&
      isStaffCinePage() &&
      document.documentElement &&
      !document.documentElement.classList.contains("vc-home-cine-live")
    ) {
      if (!window.__vcStaffCineReadyFailsafe) {
        window.__vcStaffCineReadyFailsafe = window.setTimeout(function () {
          // Prima del reveal: ripeti layout (access gate / race al primo load).
          try {
            bootStaffCineLayout(true);
          } catch (eFsLayout) {}
          // Non aggiungere vc-home-cine-live qui: body trasparente su canvas non disegnato
          // fa sparire l'atmosfera (bug "cine che va e viene").
          markPageCineReady(true);
        }, 1400);
      }
      return;
    }
    if (window.__vcStaffCineReadyFailsafe) {
      window.clearTimeout(window.__vcStaffCineReadyFailsafe);
      window.__vcStaffCineReadyFailsafe = 0;
    }
    function apply() {
      var root = document.documentElement;
      if (!root) return;
      root.classList.add("vc-page-cine-ready");
      root.classList.remove("vc-page-cine-boot");
      try {
        document.dispatchEvent(new Event("vc:page-cine-ready"));
      } catch (eReadyEvt) {}
    }
    if (immediate) {
      apply();
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(apply);
    });
  }

  function resetStaffPageCineLayout() {
    if (!isStaffRoute()) return;
    var body = document.body;
    if (body) {
      body.classList.remove("vc-page-cine-layout");
      try {
        delete body.dataset.vcPageCineLayout;
      } catch (eData) {}
    }
    var cues = document.querySelectorAll(".vc-home-scrollcue");
    for (var c = 0; c < cues.length; c++) {
      try {
        cues[c].remove();
      } catch (eCue) {}
    }
    var heroes = document.querySelectorAll(".vc-staff-hero, .vc-page-cine-hero, .vc-support-page-hero");
    for (var i = 0; i < heroes.length; i++) {
      heroes[i].classList.remove("vc-page-cine-hero", "vc-home-cine-hero", "is-collapsed", "vc-hero-scroll-clip");
      try {
        heroes[i].style.removeProperty("min-height");
        heroes[i].style.removeProperty("height");
        heroes[i].style.removeProperty("justify-content");
      } catch (eHeroStyle) {}
    }
    var mains = document.querySelectorAll("main.vc-page-cine-main");
    for (var m = 0; m < mains.length; m++) {
      mains[m].classList.remove("vc-page-cine-main");
    }
    // Staff cine pages keep the vinyl canvas; accesso-richiesto / redirect drop it.
    // Profilo staff also keeps the canvas (flat layout, no hero card).
    if (!isStaffCinePage() && !isStaffProfileHome()) {
      var stage = document.querySelector(".vc-home-cine");
      if (stage) {
        try {
          stage.remove();
        } catch (eStage) {}
      }
    }
    markPageCineReady(true);
  }

  function resetUsersPageCineLayout() {
    if (!shouldSkipPageCineHeroLayout()) return;
    var body = document.body;
    var root = document.documentElement;
    if (body) {
      body.classList.remove("vc-page-cine-layout");
      try {
        delete body.dataset.vcPageCineLayout;
      } catch (eData) {}
    }
    if (root) {
      var stillPending =
        root.classList.contains("vc-rank-customize-pending") ||
        root.classList.contains("vc-custom-profile-pending") ||
        root.classList.contains("vc-user-profile-pending");
      if (!stillPending) {
        root.classList.add("vc-page-cine-ready");
        root.classList.remove("vc-page-cine-boot");
      }
    }
    var heroes = document.querySelectorAll(".vc-page-cine-hero");
    for (var i = 0; i < heroes.length; i++) {
      heroes[i].classList.remove("vc-page-cine-hero", "vc-home-cine-hero");
    }
    var mains = document.querySelectorAll("main.vc-page-cine-main");
    for (var m = 0; m < mains.length; m++) {
      mains[m].classList.remove("vc-page-cine-main");
    }
  }

  function isVisibleEl(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hidden || el.hasAttribute("hidden")) return false;
    if (el.closest && el.closest("[hidden]")) return false;
    if (el.dataset && el.dataset.vcPageHero === "off") return false;
    return true;
  }

  function isHeroEl(el) {
    if (!el || !el.classList) return false;
    if (el.classList.contains("vc-user-profile-hero")) return false;
    return (
      el.classList.contains("vc-support-page-hero") ||
      el.classList.contains("vc-notify-hero") ||
      el.classList.contains("vc-staff-hero") ||
      el.classList.contains("vc-vote-page-hero")
    );
  }

  function findPageHero(container) {
    if (!container || container.dataset.vcPageHero === "off") return null;
    if (shouldSkipPageCineHeroLayout()) return null;
    var roots = [container];
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      var kids = root.children;
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (!isVisibleEl(el)) continue;
        if (isHeroEl(el)) return el;
        if (el.tagName === "DIV" || el.tagName === "SECTION") {
          for (var j = 0; j < el.children.length; j++) {
            var child = el.children[j];
            if (isVisibleEl(child) && isHeroEl(child)) return child;
          }
        }
      }
    }
    return null;
  }

  function restructurePageMain(container, hero) {
    var contentWrap = document.getElementById("vc-page-content");
    if (!contentWrap) {
      contentWrap = document.createElement("div");
      contentWrap.id = "vc-page-content";
      contentWrap.className = "vc-page-cine-body mx-auto max-w-6xl px-4 pb-24";
    }

    if (container && container.tagName === "MAIN") {
      container.classList.remove("pt-28", "sm:pt-32", "pt-24", "sm:pt-28", "mx-auto", "max-w-6xl", "px-4");
      container.classList.add("vc-page-cine-main");
    }

    var parent = hero.parentElement;
    if (container && parent !== container) {
      container.insertBefore(hero, parent);
      if (parent.isConnected) {
        while (parent.firstChild) contentWrap.appendChild(parent.firstChild);
        try {
          parent.remove();
        } catch (eRemove) {}
      }
    }

    var sib = hero.nextElementSibling;
    while (sib) {
      var next = sib.nextElementSibling;
      if (sib !== contentWrap && sib.id !== "vc-page-content") {
        contentWrap.appendChild(sib);
      }
      sib = next;
    }

    if (contentWrap.childNodes.length && contentWrap.parentElement !== container) {
      container.appendChild(contentWrap);
    }

    return contentWrap;
  }

  function findHeroPanel(hero) {
    if (!hero) return null;
    return (
      hero.querySelector(":scope > .vc-page-cine-hero-panel") ||
      hero.querySelector(":scope > .grid") ||
      hero.querySelector(":scope > .vc-vote-page-hero__inner") ||
      hero.querySelector(":scope > .vc-sponsor-hero-layout")
    );
  }

  function findHeroCopyRoot(panel) {
    if (!panel) return null;
    return (
      panel.querySelector(".vc-page-cine-hero-copy") ||
      panel.querySelector(".vc-sponsor-hero-copy") ||
      panel.querySelector(".max-w-3xl") ||
      panel.firstElementChild
    );
  }

  function flushSponsorAsideToContent(contentWrap) {
    if (!contentWrap || !document.body || !document.body.classList.contains("vc-sponsor-page")) return;
    var deferred = document.getElementById("vc-sponsor-aside-deferred");
    if (!deferred || !deferred.childNodes.length) return;
    var section = document.createElement("section");
    section.className = "vc-sponsor-intro-below";
    section.setAttribute("aria-label", "Introduzione e requisiti sponsor");
    deferred.removeAttribute("id");
    deferred.hidden = false;
    deferred.removeAttribute("hidden");
    section.appendChild(deferred);
    if (contentWrap.firstChild) contentWrap.insertBefore(section, contentWrap.firstChild);
    else contentWrap.appendChild(section);
  }

  function extractHeroAside(hero) {
    if (!hero || hero.dataset.vcAsideMoved === "1") return null;
    var panel = findHeroPanel(hero);
    if (!panel) return null;

    var asideWrap = document.createElement("div");
    asideWrap.className = "vc-page-cine-aside-inline";

    if (panel.classList.contains("vc-sponsor-hero-layout")) {
      var asideCol = panel.querySelector(".vc-sponsor-hero-aside");
      if (!asideCol || !asideCol.childNodes.length) return null;
      if (document.body && document.body.classList.contains("vc-sponsor-page")) {
        asideWrap.id = "vc-sponsor-aside-deferred";
        while (asideCol.firstChild) asideWrap.appendChild(asideCol.firstChild);
        asideCol.remove();
        hero.dataset.vcAsideMoved = "1";
        asideWrap.hidden = true;
        asideWrap.setAttribute("hidden", "");
        (document.body || document.documentElement).appendChild(asideWrap);
        return null;
      }
      while (asideCol.firstChild) asideWrap.appendChild(asideCol.firstChild);
      asideCol.remove();
    } else if (panel.classList.contains("vc-vote-page-hero__inner")) {
      return null;
    } else if (panel.children.length >= 2) {
      while (panel.children.length > 1) {
        asideWrap.appendChild(panel.children[1]);
      }
    } else {
      return null;
    }

    if (!asideWrap.childNodes.length) return null;

    hero.dataset.vcAsideMoved = "1";

    var mainCol = findHeroCopyRoot(panel);
    if (mainCol) {
      mainCol.classList.add("vc-page-cine-hero-copy", "mx-auto", "text-center");
      var btnRow = mainCol.querySelector("[class*='flex-wrap']");
      if (btnRow) btnRow.classList.add("justify-center");
    }
    panel.classList.remove("vc-page-cine-card--wide");
    return asideWrap;
  }

  function relocateHeroAside(hero) {
    return extractHeroAside(hero);
  }

  function buildHomeHeroInterior(hero) {
    if (!hero) return;
    // Already transformed (baked HTML or prior boot) — never nest/rebuild.
    if (hasRealCineInterior(hero)) {
      hero.dataset.vcHomeHeroBuilt = "1";
      return;
    }
    if (hero.dataset.vcHomeHeroBuilt === "1") return;

    var cue = hero.querySelector(":scope > .vc-home-scrollcue");
    var panel = findHeroPanel(hero);
    var copyRoot = null;

    if (panel) {
      if (panel.classList.contains("vc-vote-page-hero__inner")) {
        copyRoot = panel;
      } else {
        copyRoot = findHeroCopyRoot(panel);
      }
    } else {
      copyRoot = document.createElement("div");
      copyRoot.className = "vc-page-cine-hero-copy mx-auto max-w-3xl text-center";
      while (hero.firstChild) {
        var ch = hero.firstChild;
        if (ch.nodeType === 1 && ch.classList.contains("vc-home-scrollcue")) break;
        copyRoot.appendChild(ch);
      }
      if (!copyRoot.childNodes.length) return;
    }

    if (!copyRoot) return;

    var asideInline =
      panel && panel.classList.contains("vc-vote-page-hero__inner")
        ? null
        : extractHeroAside(hero);

    var icons = copyRoot.querySelectorAll(".vc-support-page-hero__icon");
    for (var i = 0; i < icons.length; i++) icons[i].remove();

    if (panel && panel.classList.contains("vc-vote-page-hero__inner")) {
      copyRoot.classList.add("vc-page-cine-hero-copy", "vc-page-cine-hero-copy--vote", "mx-auto", "w-full", "text-center");
    } else {
      copyRoot.classList.add("vc-page-cine-hero-copy", "mx-auto", "w-full", "text-center");
    }
    // Evita che max-w-3xl / text-left del markup originale lasciano la card “a sinistra”.
    try {
      copyRoot.classList.remove("max-w-3xl", "max-w-2xl", "max-w-xl", "text-left", "sm:text-left", "lg:text-left");
      copyRoot.classList.add("text-center", "mx-auto", "w-full");
    } catch (eCopyCls) {}
    var btnRow = copyRoot.querySelector("[class*='flex-wrap']");
    if (btnRow) btnRow.classList.add("justify-center");

    var inner = document.createElement("div");
    inner.className =
      "relative z-10 mx-auto w-full px-4 pb-0 pt-2 text-center vc-page-cine-hero__inner";

    var head = document.createElement("div");
    head.className = "vc-hero-head vc-glass mx-auto text-center";

    head.appendChild(copyRoot);

    if (asideInline && asideInline.childNodes.length) {
      head.classList.add("vc-hero-head--has-aside");
      head.appendChild(asideInline);
    }

    inner.appendChild(head);

    hero.innerHTML = "";
    hero.appendChild(inner);
    if (cue) hero.appendChild(cue);

    hero.dataset.vcHomeHeroBuilt = "1";
  }

  function polishHeroChrome(hero) {
    if (!hero) return;

    // Never stamp vc-hero-head on the raw 2-col `.grid` — that fakes a "ready" cine layout
    // without the full-viewport interior (gestione stayed flat + board on first screen).
    var head =
      hero.querySelector(":scope > .vc-page-cine-hero__inner .vc-hero-head") ||
      hero.querySelector(":scope > .vc-support-intro-shell .vc-hero-head") ||
      hero.querySelector(":scope > .vc-vote-page-hero__inner.vc-hero-head") ||
      hero.querySelector(":scope > .vc-vote-page-hero__inner");
    if (head && !head.classList.contains("vc-hero-head")) {
      head.classList.add("vc-hero-head", "vc-glass");
    }

    var copy = hero.querySelector(".vc-page-cine-hero-copy") || hero;
    var kickers = copy.querySelectorAll(
      ":scope > p.text-xs.font-semibold.uppercase, :scope > p[class*='uppercase'][class*='tracking-']"
    );
    if (!kickers.length) {
      var firstKicker = copy.querySelector("p.text-xs.font-semibold.uppercase, p[class*='uppercase'][class*='tracking-']");
      if (firstKicker && !firstKicker.closest(".vc-page-cine-aside-inline")) kickers = [firstKicker];
    }
    for (var k = 0; k < kickers.length; k++) {
      if (!kickers[k].classList.contains("vc-hero-kicker")) {
        kickers[k].classList.add("vc-hero-kicker");
      }
    }

    var titles = copy.querySelectorAll("h1");
    for (var t = 0; t < titles.length; t++) {
      if (!titles[t].classList.contains("vc-brand-glow")) {
        titles[t].classList.add("vc-brand-glow");
      }
    }

    var leads = copy.querySelectorAll("h1 + p, :scope > p");
    for (var l = 0; l < leads.length; l++) {
      if (
        leads[l].classList.contains("vc-hero-kicker") ||
        leads[l].classList.contains("vc-hero-about")
      ) {
        continue;
      }
      leads[l].classList.add("vc-hero-about");
    }
    var welcomeIds = ["unban-welcome", "unmute-welcome"];
    for (var w = 0; w < welcomeIds.length; w++) {
      var welcome = document.getElementById(welcomeIds[w]);
      if (welcome) welcome.classList.add("vc-hero-about");
    }

    var primary = hero.querySelector(
      "a[class*='from-[#d4'], a[class*='from-'], a.vc-home-cine-cta, a.bg-gradient-to-r"
    );
    if (primary) {
      primary.classList.add("vc-header-pill", "vc-home-cine-cta");
    }

    var pills = hero.querySelectorAll(
      "a.rounded-2xl, a.vc-header-pill, a.border-white\\/10, a[class*='border-white']"
    );
    for (var p = 0; p < pills.length; p++) {
      if (pills[p].classList.contains("vc-vote-platform-card")) continue;
      if (pills[p].closest(".vc-vote-page-hero-platforms")) continue;
      if (!pills[p].classList.contains("vc-home-cine-cta")) {
        pills[p].classList.add("vc-header-pill");
      }
    }
  }

  function initPageHeroRise(hero) {
    if (!hero || prefersReduced()) return;
    hero.classList.remove("vc-home-rise");
    hero.classList.add("is-in");

    if (hero.dataset.vcHeroRise === "1") return;
    hero.dataset.vcHeroRise = "1";

    var head = hero.querySelector(".vc-hero-head") || hero.querySelector(".vc-support-intro-shell");
    if (head) {
      /* Scroll FX owns opacity/transform — rise class would lag every frame. */
      head.classList.remove("vc-home-rise");
      head.classList.add("is-in");
    }

    var bits = hero.querySelectorAll(
      ".vc-hero-kicker, .vc-brand-glow, .vc-hero-about, .vc-hero-head a.vc-header-pill, .vc-page-cine-aside-inline > [class*='rounded-'], .vc-page-cine-aside-inline .grid > [class*='rounded-']"
    );
    var riseBits = [];
    for (var h = 0; h < bits.length; h++) {
      if (!isVisibleEl(bits[h])) continue;
      markRise(bits[h], 80 + riseBits.length * 90);
      riseBits.push(bits[h]);
    }

    var revealed = false;
    function revealHeroBits() {
      if (revealed) return;
      revealed = true;
      for (var i = 0; i < riseBits.length; i++) {
        (function (idx, el) {
          window.setTimeout(function () {
            el.classList.add("is-in");
          }, idx * 90);
        })(i, riseBits[i]);
      }
    }

    if (typeof IntersectionObserver === "undefined") {
      revealHeroBits();
      return;
    }

    var watch = head || hero;
    var heroIo = new IntersectionObserver(
      function (entries) {
        for (var e = 0; e < entries.length; e++) {
          if (!entries[e].isIntersecting) continue;
          watch.classList.add("is-in");
          revealHeroBits();
          heroIo.unobserve(watch);
          break;
        }
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    heroIo.observe(watch);

    try {
      var r = hero.getBoundingClientRect();
      var fold = window.innerHeight || 800;
      if (r.top < fold * 0.85 && r.bottom > 40) revealHeroBits();
    } catch (eHeroIn) {}
  }

  function initPageHeroLayout(opts) {
    opts = opts || {};
    if (excludedPolishPath()) {
      markPageCineReady(true);
      return;
    }
    if (shouldSkipPageCineHeroLayout()) {
      resetUsersPageCineLayout();
      return;
    }
    var body = document.body;
    if (!body || body.classList.contains("vc-body--home")) {
      markPageCineReady(true);
      return;
    }
    if (!isPolishPage()) {
      markPageCineReady(true);
      return;
    }

    var container = opts.container || document.querySelector("main");
    if (!container) {
      markPageCineReady(true);
      return;
    }

    var hero = opts.hero || document.querySelector(".vc-page-cine-hero") || findPageHero(container);
    if (!hero) {
      markPageCineReady(true);
      return;
    }
    if (container && !container.contains(hero)) {
      container = document.querySelector("main") || container;
    }

    if (body.dataset.vcPageCineLayout === "1") {
      var laidHero = document.querySelector(".vc-page-cine-hero") || hero;
      var interiorOk = hasRealCineInterior(laidHero || hero);
      // Never strip a real interior — that caused gestione cine→flat flash.
      if (interiorOk) {
        ensureStaffCineClasses(laidHero || hero);
        if (opts.force) {
          restructurePageMain(container, laidHero || hero);
          container.classList.add("vc-page-cine-main");
        }
        polishHeroChrome(laidHero || hero);
        flushSponsorAsideToContent(document.getElementById("vc-page-content"));
        ensureScrollCueFor(laidHero || hero, container);
        initPageHeroRise(laidHero || hero);
        markPageCineReady();
        if (opts.force) snapScrollTopIfPristine();
        return;
      }
      if (!opts.force || !laidHero || laidHero === hero) {
        if (opts.force) {
          restructurePageMain(container, laidHero || hero);
          container.classList.add("vc-page-cine-main");
          body.classList.add("vc-page-cine-layout");
          body.dataset.vcPageCineLayout = "1";
          if (laidHero || hero) {
            (laidHero || hero).classList.add("vc-page-cine-hero", "vc-home-cine-hero");
          }
        }
        buildHomeHeroInterior(laidHero || hero);
        polishHeroChrome(laidHero || hero);
        flushSponsorAsideToContent(document.getElementById("vc-page-content"));
        ensureScrollCueFor(laidHero || hero, container);
        initPageHeroRise(laidHero || hero);
        markPageCineReady();
        if (opts.force) snapScrollTopIfPristine();
        return;
      }
    }

    if (opts.force) {
      var oldHero = document.querySelector(".vc-page-cine-hero");
      if (oldHero && oldHero !== hero) {
        oldHero.classList.remove("vc-page-cine-hero", "vc-home-cine-hero");
        var oldCue = oldHero.querySelector(".vc-home-scrollcue");
        if (oldCue) oldCue.remove();
      }
    }

    var contentWrap = null;
    if (!opts.skipRestructure) {
      contentWrap = restructurePageMain(container, hero);
    } else {
      contentWrap = document.getElementById("vc-page-content");
    }
    buildHomeHeroInterior(hero);
    hero.classList.add("vc-page-cine-hero", "vc-home-cine-hero");
    if (!hero.id) hero.id = "vc-page-intro";
    hero.classList.remove("mb-8", "sm:mb-10", "mb-10", "sm:mb-12", "mt-8");
    container.classList.add("vc-page-cine-main");

    body.classList.add("vc-page-cine-layout");
    body.dataset.vcPageCineLayout = "1";

    polishHeroChrome(hero);
    flushSponsorAsideToContent(contentWrap);
    ensureScrollCueFor(hero, container);
    initPageHeroRise(hero);
    markPageCineReady();
    snapScrollTopIfPristine();
    requestAnimationFrame(function () {
      ensureScrollCueFor(hero, container);
      bindInnerHeroScrollFx();
      snapScrollTopIfPristine();
    });
  }

  function ensureCommunityPageCineLayout() {
    if (!isUsersCommunityPage()) {
      initPageHeroLayout({ force: true });
      return;
    }
    // Applica subito il layout cine (card centrata + scroll), senza aspettare il loader:
    // prima il main riceveva padding-top e la card finiva troppo in basso.
    initPageHeroLayout({ force: true });
    bindInnerHeroScrollFx();
    snapScrollTopIfPristine();
    whenCommunityLeaderReady(function () {
      initPageHeroLayout({ force: true });
      bindInnerHeroScrollFx();
      snapScrollTopIfPristine();
      requestAnimationFrame(function () {
        initPageHeroLayout({ force: true });
      });
    });
  }

  window.__vcPageHeroLayout = initPageHeroLayout;
  window.__vcEnsureCommunityPageCineLayout = ensureCommunityPageCineLayout;

  function startCueBounce(cue) {
    if (!cue) return;
  }

  function markRise(el, delayMs) {
    if (!el || el.classList.contains("vc-home-rise")) return;
    el.classList.add("vc-home-rise");
    if (typeof delayMs === "number") {
      el.style.setProperty("--vc-rise-delay", Math.max(0, delayMs) + "ms");
    }
  }

  function initHomeFx() {
    var reduced = prefersReduced();
    var coarse = isCoarse();

    try {
      document.documentElement.classList.add("vc-home-motion-ready");
    } catch (eMotion) {}

    var heroBits = document.querySelectorAll(
      "#intro .vc-hero-kicker, #intro .vc-brand-glow, #intro .vc-hero-about, #intro .vc-hero-head a.vc-header-pill"
    );
    for (var h = 0; h < heroBits.length; h++) {
      markRise(heroBits[h], 40 + h * 40);
      heroBits[h].classList.add("is-in");
    }

    var panels = document.querySelectorAll(
      "#stats .vc-stat-strip, .vc-home-deck, .vc-home-feature, .vc-home-index"
    );
    for (var p = 0; p < panels.length; p++) {
      markRise(panels[p], 40);
    }

    var cells = document.querySelectorAll(".vc-home-deck__cell");
    for (var c = 0; c < cells.length; c++) {
      markRise(cells[c], 50 + c * 40);
    }

    var pills = document.querySelectorAll(".vc-home-feature__pills a");
    for (var i = 0; i < pills.length; i++) {
      markRise(pills[i], 40 + i * 24);
    }

    var cols = document.querySelectorAll(".vc-home-index__col");
    for (var k = 0; k < cols.length; k++) {
      markRise(cols[k], 40 + k * 32);
    }

    var riseNodes = document.querySelectorAll(".vc-home-rise:not(.is-in)");

    function reveal(el) {
      if (!el || el.classList.contains("is-in")) return;
      el.classList.add("is-in");
    }

    if (!riseNodes.length) {
      /* all already visible */
    } else if (typeof IntersectionObserver === "undefined") {
      for (var r = 0; r < riseNodes.length; r++) reveal(riseNodes[r]);
    } else {
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
      for (var n = 0; n < riseNodes.length; n++) io.observe(riseNodes[n]);
    }

    // Extra FX: do NOT gate on prefers-reduced-motion.
    // On Windows/Brave that media query is often wrongly true and killed the whole homepage feel.
    // Skip heavy pointer FX on coarse touch or lite perf tier (slow device/network).
    var skipHeavyFx =
      coarse || (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite());
    if (!skipHeavyFx) {
      initPanelTilt();
      initHomeExtraFx();
    } else {
      try {
        document.body.classList.add("vc-home-fx");
      } catch (e) {}
    }
  }

  function initPanelTilt() {
    var sel = tiltSelectors();
    if (!sel) return;
    var shells = document.querySelectorAll(sel);
    for (var s = 0; s < shells.length; s++) {
      (function (shell) {
        if (!shell || shell.dataset.vcTilt === "1") return;
        if (shell.closest && shell.closest(".vc-page-cine-hero, .vc-wt-board, dialog, header, footer")) return;
        var h = shell.offsetHeight || 0;
        if (h > 640) return;
        shell.dataset.vcTilt = "1";
        var raf = 0;
        var cx = 0;
        var cy = 0;
        var tx = 0;
        var ty = 0;
        function tick() {
          raf = 0;
          cx += (tx - cx) * 0.12;
          cy += (ty - cy) * 0.12;
          shell.style.transform =
            "perspective(900px) rotateX(" +
            (-cy * 1.6).toFixed(3) +
            "deg) rotateY(" +
            (cx * 1.8).toFixed(3) +
            "deg) translateY(-2px)";
          if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) {
            raf = requestAnimationFrame(tick);
          }
        }
        shell.addEventListener(
          "pointermove",
          function (ev) {
            var rect = shell.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            tx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            ty = ((ev.clientY - rect.top) / rect.height) * 2 - 1;
            shell.classList.add("is-tilting");
            if (!raf) raf = requestAnimationFrame(tick);
          },
          { passive: true }
        );
        shell.addEventListener("pointerleave", function () {
          tx = 0;
          ty = 0;
          shell.classList.remove("is-tilting");
          if (!raf) raf = requestAnimationFrame(tick);
          window.setTimeout(function () {
            if (!shell.classList.contains("is-tilting")) {
              shell.style.transform = "";
            }
          }, 280);
        });
      })(shells[s]);
    }
  }

  try {
    window.__vcInitPanelTilt = initPanelTilt;
  } catch (eExposeTilt) {}

  function initCursorSpotlight() {
    var stage = document.querySelector(".vc-home-cine");
    if (!stage) return;
    ensureSpotlightLayer(stage);
    stage.classList.add("vc-home-cine--spot");

    var spotRaf = 0;
    var sx = 0.5;
    var sy = 0.35;
    var stx = 0.5;
    var sty = 0.35;
    function spotTick() {
      spotRaf = 0;
      sx += (stx - sx) * 0.08;
      sy += (sty - sy) * 0.08;
      stage.style.setProperty("--vc-spot-x", (sx * 100).toFixed(2) + "%");
      stage.style.setProperty("--vc-spot-y", (sy * 100).toFixed(2) + "%");
      if (Math.abs(stx - sx) > 0.001 || Math.abs(sty - sy) > 0.001) {
        spotRaf = requestAnimationFrame(spotTick);
      }
    }
    window.addEventListener(
      "pointermove",
      function (ev) {
        var w = Math.max(1, window.innerWidth || 1);
        var h = Math.max(1, window.innerHeight || 1);
        stx = ev.clientX / w;
        sty = ev.clientY / h;
        if (!spotRaf) spotRaf = requestAnimationFrame(spotTick);
      },
      { passive: true }
    );
  }

  function initPolishHeroFx() {
    var titles = document.querySelectorAll(
      "main .vc-page-cine-hero h1, main .vc-support-page-hero h1, main .vc-notify-hero h1, main .vc-user-profile-hero h1, main .vc-users-title"
    );
    for (var i = 0; i < titles.length; i++) {
      (function (title) {
        var t0 = performance.now();
        function pulse(now) {
          if (!title.isConnected) return;
          var p = (Math.sin(((now - t0) / 1000) * 1.15) + 1) / 2;
          var blur = 24 + p * 20;
          var alpha = 0.1 + p * 0.14;
          title.style.textShadow =
            "0 2px 18px rgba(0,0,0,0.45), 0 0 " +
            blur.toFixed(0) +
            "px rgba(232,201,168," +
            alpha.toFixed(3) +
            ")";
          requestAnimationFrame(pulse);
        }
        requestAnimationFrame(pulse);
      })(titles[i]);
    }

    var ctas = document.querySelectorAll(".vc-page-cine-hero .vc-hero-head a.vc-header-pill");
    for (var c = 0; c < ctas.length; c++) {
      (function (btn) {
        if (btn.dataset.vcHomeMag === "1") return;
        btn.dataset.vcHomeMag = "1";
        btn.classList.add("vc-home-mag");
        btn.addEventListener(
          "pointermove",
          function (ev) {
            var rect = btn.getBoundingClientRect();
            var dx = (ev.clientX - (rect.left + rect.width / 2)) / Math.max(1, rect.width);
            var dy = (ev.clientY - (rect.top + rect.height / 2)) / Math.max(1, rect.height);
            btn.style.transform =
              "translate(" + (dx * 10).toFixed(2) + "px," + (dy * 8).toFixed(2) + "px) scale(1.03)";
          },
          { passive: true }
        );
        btn.addEventListener("pointerleave", function () {
          btn.style.transform = "";
        });
      })(ctas[c]);
    }
  }

  function bindInnerHeroScrollFx() {
    var body = document.body;
    if (!body || body.classList.contains("vc-body--home")) return;
    if (!isPolishPage() || shouldSkipPageCineHeroLayout()) return;

    var coarse = isCoarse();

    var section =
      document.querySelector("main .vc-page-cine-hero") ||
      document.querySelector("main .vc-support-page-hero") ||
      document.querySelector("main .vc-notify-hero") ||
      document.querySelector("main .vc-vote-page-hero") ||
      document.querySelector("main .vc-staff-hero");
    if (!section) return;

    var card =
      section.querySelector(".vc-hero-head") ||
      section.querySelector(".vc-support-intro-shell") ||
      section.querySelector(".vc-page-cine-hero__inner");
    if (!card) return;

    if (section.dataset.vcInnerHeroFxBound === "1") {
      if (section._vcInnerHeroFxTick) section._vcInnerHeroFxTick();
      return;
    }
    section.dataset.vcInnerHeroFxBound = "1";
    section.classList.add("vc-hero-scroll-clip");

    var cue = section.querySelector(".vc-home-scrollcue");
    var raf = 0;
    function tick() {
      raf = 0;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;

      if (y <= 2) {
        section.classList.remove("is-collapsed");
        card.style.removeProperty("transition");
        card.style.removeProperty("transform");
        card.style.removeProperty("opacity");
        if (cue) {
          cue.style.removeProperty("transition");
          cue.style.removeProperty("opacity");
          cue.style.removeProperty("pointer-events");
        }
        return;
      }

      // Never toggle layout collapse (min-height 100svh -> 0): it changes document
      // height at the scroll threshold and makes the scrollbar oscillate forever.
      section.classList.remove("is-collapsed");

      if (!prefersReduced()) {
        var shift = coarse ? Math.min(24, y * 0.1) : Math.min(48, y * 0.18);
        var opacity = Math.max(coarse ? 0.55 : 0.35, 1 - y / (coarse ? 680 : 520));
        card.style.transition = "none";
        card.style.transform = "translate3d(0," + shift.toFixed(1) + "px,0)";
        card.style.opacity = String(opacity);
      }

      if (cue && !prefersReduced()) {
        var cueOpacity = Math.max(0, 1 - y / 220);
        cue.style.transition = "none";
        cue.style.opacity = String(cueOpacity);
        if (cueOpacity <= 0.04) cue.style.pointerEvents = "none";
        else cue.style.removeProperty("pointer-events");
      }
    }

    section._vcInnerHeroFxTick = tick;
    window.addEventListener(
      "scroll",
      function () {
        if (!raf) raf = requestAnimationFrame(tick);
      },
      { passive: true }
    );
    window.addEventListener(
      "resize",
      function () {
        if (!raf) raf = requestAnimationFrame(tick);
      },
      { passive: true }
    );
    tick();
  }

  function initHomeExtraFx() {
    var body = document.body;
    if (!body) return;

    // Magnetic hero CTAs.
    var ctas = document.querySelectorAll("#intro .vc-hero-head a.vc-header-pill");
    for (var i = 0; i < ctas.length; i++) {
      (function (btn) {
        btn.classList.add("vc-home-mag");
        btn.addEventListener(
          "pointermove",
          function (ev) {
            var rect = btn.getBoundingClientRect();
            var dx = (ev.clientX - (rect.left + rect.width / 2)) / Math.max(1, rect.width);
            var dy = (ev.clientY - (rect.top + rect.height / 2)) / Math.max(1, rect.height);
            btn.style.transform =
              "translate(" + (dx * 10).toFixed(2) + "px," + (dy * 8).toFixed(2) + "px) scale(1.03)";
          },
          { passive: true }
        );
        btn.addEventListener("pointerleave", function () {
          btn.style.transform = "";
        });
      })(ctas[i]);
    }

    // Soft scroll parallax on hero copy.
    var hero = document.querySelector("#intro .vc-support-intro-shell") || document.querySelector("#intro .vc-hero-head");
    if (hero) {
      var pRaf = 0;
      function parallax() {
        pRaf = 0;
        var y = window.pageYOffset || document.documentElement.scrollTop || 0;
        var shift = Math.min(48, y * 0.18);
        hero.style.transition = "none";
        hero.style.transform = "translate3d(0," + shift.toFixed(1) + "px,0)";
        hero.style.opacity = String(Math.max(0.35, 1 - y / 520));
      }
      window.addEventListener(
        "scroll",
        function () {
          if (!pRaf) pRaf = requestAnimationFrame(parallax);
        },
        { passive: true }
      );
      parallax();
    }

    // Ripple flash on primary Discord CTA click.
    var primary = document.querySelector("#intro a.vc-home-cine-cta");
    if (primary) {
      primary.classList.add("vc-home-pulse-cta");
      primary.addEventListener("pointerdown", function (ev) {
        var rect = primary.getBoundingClientRect();
        var x = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 100;
        var y = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * 100;
        primary.style.setProperty("--vc-ripple-x", x.toFixed(1) + "%");
        primary.style.setProperty("--vc-ripple-y", y.toFixed(1) + "%");
        primary.classList.remove("is-rippling");
        void primary.offsetWidth;
        primary.classList.add("is-rippling");
      });
    }

    // Brand glow stays CSS-only (no per-frame rAF).
  }

  function hasRealCineInterior(hero) {
    if (!hero || !hero.querySelector) return false;
    try {
      return Boolean(
        hero.querySelector(".vc-page-cine-hero__inner .vc-hero-head") ||
          hero.querySelector(":scope > .vc-page-cine-hero__inner > .vc-hero-head"),
      );
    } catch (eReal) {
      return Boolean(hero.querySelector(".vc-page-cine-hero__inner .vc-hero-head"));
    }
  }

  function ensureStaffCineClasses(hero) {
    var body = document.body;
    if (body) {
      body.classList.add("vc-page-cine-layout");
      body.dataset.vcPageCineLayout = "1";
    }
    var main = document.querySelector("main");
    if (main) main.classList.add("vc-page-cine-main");
    if (hero) {
      hero.classList.add("vc-page-cine-hero", "vc-home-cine-hero");
      hero.dataset.vcHomeHeroBuilt = "1";
      if (!hero.id) hero.id = "vc-page-intro";
      hero.classList.remove("mb-8", "sm:mb-10", "mb-10", "sm:mb-12", "mt-8");
    }
  }

  function staffCineLayoutReady() {
    var body = document.body;
    if (!body || !body.classList.contains("vc-page-cine-layout")) return false;
    var hero = document.querySelector(".vc-page-cine-hero");
    if (!hero) return false;
    if (!hasRealCineInterior(hero)) return false;
    var main = document.querySelector("main");
    if (!main || !main.classList.contains("vc-page-cine-main")) return false;
    // Flat leftover: board still sitting next to the hero inside <main>.
    var board =
      document.querySelector(".vc-staff-manage-board, .vc-staff-pause-board, #vc-staff-organico-board, #vc-staff-inbox") ||
      null;
    if (
      board &&
      hero.parentElement &&
      board.parentElement === hero.parentElement &&
      hero.parentElement.tagName === "MAIN"
    ) {
      return false;
    }
    return true;
  }

  function clearStaffCineLayoutStale() {
    // CRITICAL: never tear down a real baked/built cine interior (gestione flash→flat bug).
    var existing = document.querySelector(".vc-support-page-hero, .vc-page-cine-hero");
    if (existing && hasRealCineInterior(existing)) {
      ensureStaffCineClasses(existing);
      return;
    }
    if (staffCineLayoutReady()) return;
    var body = document.body;
    if (body) {
      try {
        delete body.dataset.vcPageCineLayout;
      } catch (eData) {}
      body.classList.remove("vc-page-cine-layout");
    }
    var heroes = document.querySelectorAll(".vc-support-page-hero, .vc-page-cine-hero, .vc-staff-hero");
    for (var i = 0; i < heroes.length; i++) {
      if (hasRealCineInterior(heroes[i])) {
        ensureStaffCineClasses(heroes[i]);
        continue;
      }
      try {
        delete heroes[i].dataset.vcHomeHeroBuilt;
        delete heroes[i].dataset.vcAsideMoved;
        delete heroes[i].dataset.vcHeroRise;
        delete heroes[i].dataset.vcInnerHeroFxBound;
      } catch (eHero) {}
      heroes[i].classList.remove("vc-page-cine-hero", "vc-home-cine-hero", "is-collapsed", "vc-hero-scroll-clip");
      var fakeHeads = heroes[i].querySelectorAll(".grid.vc-hero-head");
      for (var f = 0; f < fakeHeads.length; f++) {
        fakeHeads[f].classList.remove("vc-hero-head", "vc-glass");
      }
    }
    var mains = document.querySelectorAll("main.vc-page-cine-main");
    for (var m = 0; m < mains.length; m++) {
      mains[m].classList.remove("vc-page-cine-main");
    }
  }

  function bootStaffCineLayout(forceRebuild) {
    if (!isStaffCinePage()) return;
    var heroNow =
      document.querySelector(".vc-page-cine-hero") ||
      document.querySelector(".vc-support-page-hero");
    // Baked gestione/organico: keep interior forever — only reinforce classes + cue.
    if (heroNow && hasRealCineInterior(heroNow)) {
      ensureStaffCineClasses(heroNow);
      ensureScrollCueFor(heroNow);
      snapScrollTopIfPristine();
      try {
        document.documentElement.classList.add("vc-home-motion-ready");
      } catch (eStaffMotion0) {}
      markPageCineReady();
      return;
    }
    if (staffCineLayoutReady() && !forceRebuild) return;
    if (!staffCineLayoutReady()) clearStaffCineLayoutStale();
    initPageHeroLayout({ force: true });
    bindInnerHeroScrollFx();
    snapScrollTopIfPristine();
    try {
      document.documentElement.classList.add("vc-home-motion-ready");
    } catch (eStaffMotion) {}
    if (!document.body.classList.contains("vc-vote-page")) {
      initPolishHeroFx();
      if (!isCoarse() && !(window.VcPerf && window.VcPerf.isLite && window.VcPerf.isLite())) initPanelTilt();
    }
    if (!staffCineLayoutReady()) {
      window.setTimeout(function () {
        if (!isStaffCinePage()) return;
        var h2 =
          document.querySelector(".vc-page-cine-hero") ||
          document.querySelector(".vc-support-page-hero");
        if (h2 && hasRealCineInterior(h2)) {
          ensureStaffCineClasses(h2);
          ensureScrollCueFor(h2);
          return;
        }
        if (staffCineLayoutReady()) return;
        clearStaffCineLayoutStale();
        initPageHeroLayout({ force: true });
        ensureScrollCueFor(document.querySelector(".vc-page-cine-hero"));
        snapScrollTopIfPristine();
      }, 120);
    } else {
      ensureScrollCueFor(document.querySelector(".vc-page-cine-hero"));
    }
  }

  function watchStaffCineLayout() {
    if (!isStaffCinePage()) return;
    if (window.__vcStaffCineWatchBound) return;
    window.__vcStaffCineWatchBound = true;
    var tries = 0;
    function retry() {
      if (!isStaffCinePage()) return;
      tries += 1;
      if (!staffCineLayoutReady()) bootStaffCineLayout(true);
      if (!staffCineLayoutReady() && tries < 40) {
        window.setTimeout(retry, 150);
      }
    }
    function afterAccess() {
      bootStaffCineLayout(true);
      window.setTimeout(function () {
        bootStaffCineLayout(true);
      }, 60);
      window.setTimeout(function () {
        if (!staffCineLayoutReady()) bootStaffCineLayout(true);
      }, 320);
    }
    window.addEventListener("vc:staff-access-ok", afterAccess);
    window.addEventListener("vc:access-ok", afterAccess);
    window.addEventListener("pageshow", function (ev) {
      if (ev && ev.persisted) bootStaffCineLayout(true);
    });
    try {
      var root = document.documentElement;
      if (root && !root.classList.contains("vc-staff-app-revealed")) {
        var obs = new MutationObserver(function () {
          if (!root.classList.contains("vc-staff-app-revealed")) return;
          try {
            obs.disconnect();
          } catch (eObs) {}
          afterAccess();
        });
        obs.observe(root, { attributes: true, attributeFilter: ["class"] });
      } else if (root && root.classList.contains("vc-staff-app-revealed")) {
        afterAccess();
      }
    } catch (eWatch) {}
    retry();
  }

  try {
    window.__vcBootStaffCineLayout = bootStaffCineLayout;
  } catch (eBootExport) {}

  function boot() {
    if (isStaffRoute() && !isStaffCinePage() && !isStaffProfileHome()) {
      resetStaffPageCineLayout();
      return;
    }
    var body = document.body;
    var home = Boolean(body && body.classList.contains("vc-body--home"));
    var polish = isPolishPage();
    if (!home && !polish) return;

    if (home) {
      try {
        if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      } catch (eHomeScroll) {}
      resetHomeScroll();
      window.addEventListener("pageshow", resetHomeScroll);
      var intro = document.getElementById("intro");
      if (intro && intro.className.indexOf("vc-home-cine-hero") < 0) {
        intro.className += " vc-home-cine-hero";
      }
      var firstCta = document.querySelector("#intro .vc-hero-head a.vc-header-pill");
      if (firstCta && firstCta.className.indexOf("vc-home-cine-cta") < 0) {
        firstCta.className += " vc-home-cine-cta";
      }
      ensureScrollCue();
      initHomeFx();
    } else if (polish) {
      var vote = Boolean(body && body.classList.contains("vc-vote-page"));
      if (isStaffCinePage()) {
        bootStaffCineLayout();
        watchStaffCineLayout();
      } else if (isStaffProfileHome() || isEventoPage()) {
        // Profilo staff / evento: sfondo cine senza card hero centrale.
        if (isStaffProfileHome()) resetStaffPageCineLayout();
        else resetUsersPageCineLayout();
      } else if (shouldSkipPageCineHeroLayout()) {
        resetUsersPageCineLayout();
      } else if (isUsersCommunityPage()) {
        whenCommunityLeaderReady(function () {
          initPageHeroLayout({ force: true });
          bindInnerHeroScrollFx();
          snapScrollTopIfPristine();
        });
      } else {
        initPageHeroLayout({ force: true });
        bindInnerHeroScrollFx();
        snapScrollTopIfPristine();
      }
      try {
        document.documentElement.classList.add("vc-home-motion-ready");
      } catch (eInnerMotion) {}
      if ((!shouldSkipPageCineHeroLayout() || isStaffCinePage()) && !vote && !isStaffProfileHome() && !isEventoPage()) {
        initPolishHeroFx();
        if (!isCoarse() && !(window.VcPerf && window.VcPerf.isLite && window.VcPerf.isLite())) initPanelTilt();
      }
    }

    if (isAuditBot()) {
      try {
        document.documentElement.classList.add("vc-home-cine-live");
      } catch (eAuditLive) {}
      markPageCineReady(true);
      return;
    }

    var lite = useLiteCanvas();
    var stage = ensureStage();
    ensureCursorTrailScript();
    var votePage = Boolean(body && body.classList.contains("vc-vote-page"));
    var skipPointerFx = Boolean(
      isCoarse() ||
        (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite()),
    );
    if (!votePage && !skipPointerFx) {
      initCursorSpotlight();
    }
    var canvas = stage.querySelector(".vc-home-cine__canvas");
    if (!canvas || !canvas.getContext) {
      try {
        document.documentElement.classList.add("vc-home-cine-live");
      } catch (eNoCanvas) {}
      markPageCineReady(true);
      return;
    }
    var ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      try {
        document.documentElement.classList.add("vc-home-cine-live");
      } catch (eNoCtx) {}
      markPageCineReady(true);
      return;
    }

    var reduced = prefersReduced();
    var coarse = isCoarse();
    var dpr = 1;
    var w = 0;
    var h = 0;
    var raf = 0;
    var running = false;
    var t0 = performance.now();
    var mx = 0.72;
    var my = 0.28;
    var tx = 0.72;
    var ty = 0.28;
    var dust = [];

    function spawnDust(n) {
      dust = [];
      for (var i = 0; i < n; i++) {
        dust.push({
          x: Math.random(),
          y: Math.random(),
          z: 0.35 + Math.random() * 0.65,
          s: 0.4 + Math.random() * 1.4,
          v: 0.012 + Math.random() * 0.028,
          drift: (Math.random() - 0.5) * 0.018,
        });
      }
    }

    function resize() {
      var nextW = Math.max(1, window.innerWidth || 1);
      var nextH = Math.max(1, window.innerHeight || 1);
      var dprCap = lite ? 1.15 : 1.6;
      try {
        if (window.VcPerf && window.VcPerf.tier() === "mid") dprCap = Math.min(dprCap, 1.35);
        if (window.VcPerf && window.VcPerf.isLite()) dprCap = 1.1;
      } catch (eDpr) {}
      dpr = Math.min(dprCap, window.devicePixelRatio || 1);
      w = nextW;
      h = nextH;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var dustN = lite ? (coarse ? 10 : 18) : coarse ? 22 : 40;
      try {
        if (window.VcPerf && window.VcPerf.isLite()) dustN = coarse ? 8 : 12;
        else if (window.VcPerf && window.VcPerf.tier() === "mid") dustN = Math.min(dustN, coarse ? 16 : 28);
      } catch (eDust) {}
      spawnDust(dustN);
    }

    function drawVinyl(cx, cy, r, rot, alpha) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = alpha;
      ctx.rotate(rot);

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      var disc = ctx.createRadialGradient(-r * 0.22, -r * 0.28, r * 0.08, 0, 0, r);
      disc.addColorStop(0, "#3a281e");
      disc.addColorStop(0.22, "#1a120e");
      disc.addColorStop(0.62, "#0d0907");
      disc.addColorStop(1, "#050403");
      ctx.fillStyle = disc;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(212,168,136,0.22)";
      ctx.lineWidth = Math.max(1, r * 0.012);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.97, 0, Math.PI * 2);
      ctx.clip();
      var step = Math.max(2.4, r * 0.014);
      for (var i = r * 0.22; i < r * 0.96; i += step) {
        ctx.beginPath();
        ctx.arc(0, 0, i, 0, Math.PI * 2);
        ctx.strokeStyle = i % (step * 2) < step ? "rgba(255,244,232,0.045)" : "rgba(0,0,0,0.28)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      ctx.rotate(-rot * 0.35);
      ctx.beginPath();
      ctx.ellipse(-r * 0.16, -r * 0.26, r * 0.46, r * 0.16, -0.55, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,244,232,0.07)";
      ctx.fill();

      var labelR = r * 0.19;
      ctx.beginPath();
      ctx.arc(0, 0, labelR, 0, Math.PI * 2);
      var label = ctx.createLinearGradient(-labelR, -labelR, labelR, labelR);
      label.addColorStop(0, "#f3e2d0");
      label.addColorStop(0.45, "#d4a888");
      label.addColorStop(1, "#6f4e37");
      ctx.fillStyle = label;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, labelR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(80,48,28,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, r * 0.028, 0, Math.PI * 2);
      ctx.fillStyle = "#070504";
      ctx.fill();
      ctx.restore();
    }

    var paintedOnce = false;

    function afterFirstPaint() {
      if (paintedOnce) return;
      paintedOnce = true;
      try {
        document.documentElement.classList.add("vc-home-cine-live");
      } catch (eLiveClass) {}
      if (polish && typeof window.__vcSitePolishRise === "function") {
        try {
          window.__vcSitePolishRise();
        } catch (eRise) {}
      }
      markPageCineReady(true);
    }

    function frame(now) {
      raf = 0;
      if (!running) return;
      var t = (now - t0) / 1000;
      mx += (tx - mx) * 0.045;
      my += (ty - my) * 0.045;

      ctx.fillStyle = "#100c09";
      ctx.fillRect(0, 0, w, h);

      var lx = w * (0.42 + (mx - 0.5) * 0.18);
      var ly = h * (0.08 + (my - 0.5) * 0.08);
      var light = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * 0.78);
      light.addColorStop(0, "rgba(232,201,168,0.22)");
      light.addColorStop(0.28, "rgba(176,129,96,0.1)");
      light.addColorStop(0.62, "rgba(80,48,28,0.05)");
      light.addColorStop(1, "rgba(8,6,5,0)");
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, w, h);

      var mobile = w < 720;
      var cx = mobile ? w * 0.5 : w * (0.78 + (mx - 0.5) * 0.04);
      var cy = mobile ? h * 0.56 : h * (0.54 + (my - 0.5) * 0.03);
      var r = mobile ? Math.min(w * 0.84, h * 0.44) : Math.min(w, h) * 0.46;
      var alpha = mobile ? (lite ? 0.66 : 0.7) : lite ? 0.62 : 0.68;
      drawVinyl(cx, cy, r, t * 0.18, alpha);

      var cupX = mobile ? w * 0.18 : w * 0.18;
      var cupY = mobile ? h * 0.78 : h * 0.78;
      var steam = ctx.createRadialGradient(cupX, cupY, 10, cupX, cupY - h * 0.18, h * 0.28);
      steam.addColorStop(0, "rgba(234,212,187," + (mobile ? "0.07" : "0.14") + ")");
      steam.addColorStop(1, "rgba(234,212,187,0)");
      ctx.fillStyle = steam;
      ctx.fillRect(0, 0, w, h);

      for (var i = 0; i < dust.length; i++) {
        var p = dust[i];
        p.y -= p.v * p.z * 0.16;
        p.x += p.drift * p.z * 0.08;
        if (p.y < -0.04) {
          p.y = 1.04;
          p.x = Math.random();
        }
        if (p.x < -0.04) p.x = 1.04;
        if (p.x > 1.04) p.x = -0.04;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.s * p.z, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(243,226,208," + (0.12 + p.z * 0.28) + ")";
        ctx.fill();
      }

      var floor = ctx.createLinearGradient(0, h * (mobile ? 0.72 : 0.55), 0, h);
      floor.addColorStop(0, "rgba(8,6,5,0)");
      floor.addColorStop(1, "rgba(8,6,5," + (mobile ? "0.28" : "0.38") + ")");
      ctx.fillStyle = floor;
      ctx.fillRect(0, 0, w, h);

      afterFirstPaint();
      if (!raf) raf = window.requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      t0 = performance.now();
      // Do not add vc-home-cine-live until afterFirstPaint — otherwise CSS vinyl
      // disappears before the canvas draws (common flash on slower phones).
      if (!raf) raf = window.requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    resize();
    start();

    window.addEventListener("resize", function () {
      resize();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else start();
    });
    if (!coarse) {
      window.addEventListener(
        "pointermove",
        function (ev) {
          tx = ev.clientX / Math.max(1, w);
          ty = ev.clientY / Math.max(1, h);
        },
        { passive: true },
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
