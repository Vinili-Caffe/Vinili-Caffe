(function () {
  if (window.__vcHomeCine) return;
  window.__vcHomeCine = true;

  /* gifNeverWebp1: SEMPRE GIF animata. Mai still.webp (anche con prefers-reduced-motion). */
  var SITE_PHOTO_BG =
    typeof window.__VC_SITE_PHOTO_BG === "boolean" ? window.__VC_SITE_PHOTO_BG : true;
  window.__VC_SITE_PHOTO_BG = SITE_PHOTO_BG;
  var PHOTO_BG_VER = "20260906gifNeverWebp1";
  var SITE_PHOTO_BG_DESKTOP = "/images/sfondo.gif?v=" + PHOTO_BG_VER;
  var SITE_PHOTO_BG_MOBILE = "/images/sfondo-mobile.gif?v=" + PHOTO_BG_VER;
  var gifIdleFrozen = false;
  var gifIdleTimer = 0;
  var lastPhotoInputAt = 0;

  function isCoarsePointer() {
    try {
      if (window.matchMedia && window.matchMedia("(max-width:639.98px)").matches) return true;
      if (window.matchMedia && window.matchMedia("(pointer:coarse)").matches) return true;
    } catch (e) {}
    return false;
  }

  function sitePhotoBgAnimSrc() {
    return isCoarsePointer() ? SITE_PHOTO_BG_MOBILE : SITE_PHOTO_BG_DESKTOP;
  }

  function prefersReducedMotion() {
    // Ignored for site photo bg: user wants animated GIF always.
    return false;
  }

  function gifShouldBePaused() {
    return Boolean(document.hidden);
  }

  function ensureSitePhotoLayer(stage) {
    if (!SITE_PHOTO_BG || !stage) return;
    var photo = stage.querySelector(".vc-home-cine__photo");
    if (!photo) {
      photo = document.createElement("img");
      photo.className = "vc-home-cine__photo";
      photo.alt = "";
      photo.setAttribute("aria-hidden", "true");
      photo.decoding = "async";
      photo.loading = "eager";
      photo.draggable = false;
      photo.fetchPriority = "low";
      stage.insertBefore(photo, stage.firstChild);
    }
    syncOneGifPhoto(photo);
    try {
      photo.style.removeProperty("display");
      photo.style.removeProperty("visibility");
    } catch (eShow) {}
  }

  function isForbiddenStillSrc(src) {
    var s = String(src || "").toLowerCase();
    return (
      s.indexOf("sfondo-still") !== -1 ||
      s.indexOf("sfondo-mobile-still") !== -1 ||
      s.indexOf("site-bg-libreria") !== -1 ||
      /\.webp(\?|$)/.test(s) ||
      /\.jpe?g(\?|$)/.test(s) ||
      /\.png(\?|$)/.test(s)
    );
  }

  function syncOneGifPhoto(photo) {
    if (!photo) return;
    var anim = sitePhotoBgAnimSrc();
    var hardHide = Boolean(document.hidden);
    if (hardHide) {
      try {
        photo.style.setProperty("display", "none", "important");
        photo.removeAttribute("src");
        photo.dataset.vcGifKick = "";
      } catch (ePause) {}
      return;
    }
    try {
      var prev = photo.getAttribute("src") || "";
      var mustFix = !prev || isForbiddenStillSrc(prev) || prev.indexOf(".gif") === -1;
      if (mustFix || prev !== anim) {
        photo.setAttribute("src", anim);
        photo.dataset.vcGifKick = "1";
      } else if (photo.dataset.vcGifKick !== "1") {
        // One kick after boot / tab restore so Chromium restarts GIF decode.
        photo.removeAttribute("src");
        photo.setAttribute("src", anim);
        photo.dataset.vcGifKick = "1";
      }
      photo.style.removeProperty("display");
      photo.style.removeProperty("visibility");
      photo.style.removeProperty("opacity");
    } catch (eResume) {}
  }

  function syncGifDecodeForVisibility() {
    try {
      var hardHide = Boolean(document.hidden);
      document.documentElement.classList.toggle("vc-page-hidden", hardHide);
      document.documentElement.classList.toggle("vc-gif-paused", hardHide);
      document.documentElement.classList.remove("vc-photo-idle");
    } catch (eHide) {}
    var photos = document.querySelectorAll(".vc-home-cine__photo");
    for (var i = 0; i < photos.length; i += 1) syncOneGifPhoto(photos[i]);
  }

  function schedulePhotoIdleFreeze() {
    // Disabilitato: idle freeze spegneva l'animazione e sembrava "sfondo statico".
  }

  function notePhotoBgInput() {
    if (!SITE_PHOTO_BG) return;
    lastPhotoInputAt = Date.now();
    if (gifIdleFrozen) {
      gifIdleFrozen = false;
      syncGifDecodeForVisibility();
    }
  }

  function onGifScrollPause() {
    if (!SITE_PHOTO_BG) return;
    if (prefersReducedMotion() || document.hidden) return;
    notePhotoBgInput();
  }

  function ensureSitePhotoBg() {
    if (!SITE_PHOTO_BG) return;
    try {
      var root = document.documentElement;
      root.classList.add("vc-site-photo-bg", "vc-cine-static-bg", "vc-home-cine-live", "vc-home-motion-ready");
      if (!document.getElementById("vc-site-photo-bg-link")) {
        var link = document.createElement("link");
        link.id = "vc-site-photo-bg-link";
        link.rel = "stylesheet";
        link.href = "/css/vc-site-photo-bg.css?v=" + PHOTO_BG_VER;
        (document.head || root).appendChild(link);
      }
      var stages = document.querySelectorAll(".vc-home-cine");
      for (var si = 0; si < stages.length; si += 1) {
        ensureSitePhotoLayer(stages[si]);
      }
      var canvasNodes = document.querySelectorAll(".vc-home-cine__canvas");
      for (var ci = 0; ci < canvasNodes.length; ci += 1) {
        try {
          canvasNodes[ci].style.setProperty("display", "none", "important");
          canvasNodes[ci].style.setProperty("visibility", "hidden", "important");
          canvasNodes[ci].style.setProperty("opacity", "0", "important");
        } catch (eHideC) {}
      }
      syncGifDecodeForVisibility();
    } catch (ePhoto) {}
  }
  ensureSitePhotoBg();
  if (!window.__vcPhotoGifAlwaysWired) {
    window.__vcPhotoGifAlwaysWired = true;
    document.addEventListener("visibilitychange", function () {
      syncGifDecodeForVisibility();
      if (!document.hidden) notePhotoBgInput();
    });
    window.addEventListener("pageshow", function () {
      syncGifDecodeForVisibility();
      notePhotoBgInput();
    });
    window.addEventListener("scroll", onGifScrollPause, { passive: true, capture: true });
    ["pointerdown", "touchstart", "keydown", "wheel"].forEach(function (evt) {
      window.addEventListener(
        evt,
        function () {
          notePhotoBgInput();
        },
        { passive: true, capture: true },
      );
    });
    try {
      if (window.matchMedia) {
        var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (mq && mq.addEventListener) mq.addEventListener("change", syncGifDecodeForVisibility);
        else if (mq && mq.addListener) mq.addListener(syncGifDecodeForVisibility);
      }
    } catch (eMq) {}
    syncGifDecodeForVisibility();
    notePhotoBgInput();
    // gifNeverWebp1: se qualcosa rimette still/webp, ripristina GIF entro pochi secondi.
    if (!window.__vcGifNeverWebpWatch) {
      window.__vcGifNeverWebpWatch = window.setInterval(function () {
        if (document.hidden) return;
        var photos = document.querySelectorAll(".vc-home-cine__photo");
        for (var wi = 0; wi < photos.length; wi += 1) {
          var src = photos[wi].getAttribute("src") || "";
          if (!src || isForbiddenStillSrc(src) || src.indexOf("sfondo") === -1 || src.indexOf(".gif") === -1) {
            photos[wi].dataset.vcGifKick = "";
            syncOneGifPhoto(photos[wi]);
          }
        }
      }, 4000);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureSitePhotoBg);
  } else {
    ensureSitePhotoBg();
  }

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
    var lite =
      "vc-users-page vc-roles-page vc-reviews-page vc-vote-page vc-faq-page vc-wiki-page vc-suggestions-page vc-tickets-page vc-web-tickets-page vc-notifications-page vc-regole-page vc-donazioni-page vc-sponsor-page vc-perks-page vc-candidature-page vc-appelli-page vc-legal-page vc-dati-page vc-cookie-page vc-privacy-page vc-terms-page vc-copyright-page";
    var parts = lite.split(" ");
    for (var i = 0; i < parts.length; i += 1) {
      if (body.classList.contains(parts[i])) return true;
    }
    return false;
  }

  function useStaticCineBackground() {
    if (SITE_PHOTO_BG || window.__VC_SITE_PHOTO_BG) return true;
        if (prefersReduced() || isAuditBot()) return true;
    try {
      if (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite()) return true;
    } catch (eStat) {}
    if (isStandalonePwa() || isCoarse()) return true;
    if (isLiteFxPage() && !(document.body && document.body.classList.contains("vc-body--home"))) {
      try {
        if (window.VcPerf && typeof window.VcPerf.tier === "function" && window.VcPerf.tier() !== "full") {
          return true;
        }
      } catch (eLitePage) {}
    }
    return false;
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
      if (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) {
        return true;
      }
      if (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite()) return true;
    } catch (ePerf) {}
        if (isCoarse() || isStandalonePwa()) return true;
    return isLiteFxPage();
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

  function gpuQuietPaused() {
    try {
      var root = document.documentElement;
      return (
        document.hidden ||
        root.classList.contains("vc-cine-idle") ||
        root.classList.contains("vc-page-hidden")
      );
    } catch (eGpuQ) {
      return false;
    }
  }

  function wireGpuQuietPageHidden() {
    if (window.__vcGpuQuietHidden) return;
    window.__vcGpuQuietHidden = true;
    function syncPageHidden() {
      try {
        document.documentElement.classList.toggle("vc-page-hidden", document.hidden);
      } catch (eHide) {}
    }
    document.addEventListener("visibilitychange", syncPageHidden);
    syncPageHidden();
  }

  function retireLiveCanvasToStatic() {
    if (window.__vcCanvasRetiredStatic) return;
    window.__vcCanvasRetiredStatic = true;
    try {
      var root = document.documentElement;
      root.classList.add("vc-cine-static-bg");
      root.classList.remove("vc-home-cine-live");
    } catch (eRetire) {}
  }

  function reviveLiveCanvasFromStatic() {
    if (!window.__vcCanvasRetiredStatic) return;
    window.__vcCanvasRetiredStatic = false;
    try {
      var root = document.documentElement;
      root.classList.remove("vc-cine-static-bg");
      root.classList.add("vc-home-cine-live");
    } catch (eRevive) {}
  }

  function isCoarse() {
    try {
      if (window.matchMedia("(max-width: 639.98px)").matches) return true;
      if (window.matchMedia("(pointer: coarse)").matches) return true;
      if (
        window.matchMedia("(hover: none)").matches &&
        Number(navigator.maxTouchPoints || 0) > 0
      ) {
        return true;
      }
    } catch (e) {}
    try {
      return Number(navigator.maxTouchPoints || 0) > 0;
    } catch (e2) {
      return false;
    }
  }

    function shouldSnappyBodyFx() {
    if (isCoarse() || isStandalonePwa()) return true;
    try {
      if (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) {
        return true;
      }
    } catch (eSnappy) {}
    return false;
  }

  function primeMobileCineClasses() {
    try {
      var root = document.documentElement;
      var body = document.body;
      if (
        root &&
        (root.classList.contains("vc-site-polish") ||
          (body && (body.classList.contains("vc-body--home") || body.classList.contains("vc-page-cine-layout"))))
      ) {
        root.classList.add("vc-home-motion-ready");
      }
      if (!isCoarse() || !root) return;
      root.classList.add("vc-cine-static-bg", "vc-home-cine-live");
    } catch (ePrime) {}
  }

  function ensureCursorTrailScript() {
    /* cursorTrailOff1: scia rimossa — no-op */
  }

  function uiChromeBusy() {
    try {
      var r = document.documentElement;
      var b = document.body;
      if (!r || !r.classList) return false;
      if (
        r.classList.contains("vc-mobile-nav-open") ||
        r.classList.contains("vc-staff-stat-sheet-open") ||
        r.classList.contains("vc-staff-manage-sheet-open") ||
        r.classList.contains("vc-staff-reso-sheet-open") ||
        r.classList.contains("vc-staff-datepicker-open") ||
        r.classList.contains("vc-dialog-open") ||
        r.classList.contains("vc-dash-confirm-open") ||
        r.classList.contains("vc-notif-sheet-open") ||
        r.classList.contains("vc-notif-drawer-open") ||
        r.classList.contains("vc-reviews-modal-open") ||
        r.classList.contains("vc-feedback-sheet-open") ||
        r.classList.contains("vc-dash-cmds-modal-open")
      ) {
        return true;
      }
      if (
        b &&
        b.classList &&
        (b.classList.contains("vc-role-modal-open") ||
          b.classList.contains("vc-dash-cmds-modal-open") ||
          b.classList.contains("vc-dash-partnership-sheet-open") ||
          b.classList.contains("vc-wt-gate-open"))
      ) {
        return true;
      }
      return false;
    } catch (eBusy) {
      return false;
    }
  }

  window.__vcUiChromeBusy = uiChromeBusy;

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
      ensureSitePhotoLayer(existing);
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
    ensureSitePhotoLayer(stage);
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

    function isStaffInboxPage() {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/staff/inbox") return true;
    return Boolean(
      (document.body && document.body.classList.contains("vc-staff-inbox-page")) ||
        (document.documentElement && document.documentElement.classList.contains("vc-staff-inbox-route")),
    );
  }

    function isStaffVinylPage() {
    if (!isStaffRoute()) return false;
    if (isStaffProfileHome()) return true;
    if (isStaffInboxPage()) return true;
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (
      p === "/staff/guida" ||
      p === "/staff/pause" ||
      p === "/staff/gestione" ||
      p === "/staff/organico" ||
      p === "/staff/punti-tolti" ||
      p === "/staff/ticket"
    ) {
      return true;
    }
    return Boolean(
      document.body &&
        (document.body.classList.contains("vc-staff-cine-page") ||
          document.body.classList.contains("vc-staff-manage-page") ||
          document.body.classList.contains("vc-staff-organico-page") ||
          document.body.classList.contains("vc-staff-guide-page") ||
          document.body.classList.contains("vc-staff-pause-page") ||
          document.body.classList.contains("vc-staff-punti-tolti-page")),
    );
  }

    function isStaffCinePage() {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
        if (p === "/notifications" || (document.body && document.body.classList.contains("vc-notifications-page"))) {
      return false;
    }
    if (p === "/staff" || isStaffProfileHome()) return false;
    if (
      p === "/staff/guida" ||
      p === "/staff/pause" ||
      p === "/staff/gestione" ||
      p === "/staff/organico" ||
      p === "/staff/punti-tolti" ||
      p === "/staff/inbox" ||
      p === "/staff/ticket"
    ) {
      return true;
    }
    return Boolean(
      (document.body &&
        (document.body.classList.contains("vc-staff-cine-page") ||
          document.body.classList.contains("vc-staff-inbox-page") ||
          document.body.classList.contains("vc-staff-manage-page") ||
          document.body.classList.contains("vc-staff-organico-page") ||
          document.body.classList.contains("vc-staff-guide-page") ||
          document.body.classList.contains("vc-staff-pause-page") ||
          document.body.classList.contains("vc-staff-punti-tolti-page"))) ||
        (document.documentElement &&
          (document.documentElement.classList.contains("vc-staff-cine-route") ||
            document.documentElement.classList.contains("vc-staff-inbox-route"))),
    );
  }

    function isStaffInboxCinePage() {
    return isStaffCinePage();
  }

  function skipScrollCuePage() {
    if (isEventoPage()) return true;
        if (isStaffCinePage()) return false;
    if (isStaffRoute() && !isStaffCinePage()) return true;
    var body = document.body;
    if (!body) return false;
        if (body.classList.contains("vc-notifications-page")) return true;
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

  function scrollCueShouldHide(hero) {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (y > 6) return true;
    if (!hero) return false;
    try {
      var r = hero.getBoundingClientRect();
      if (r.top < -8) return true;
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (vh > 0 && r.bottom < vh * 0.9) return true;
    } catch (eHeroHide) {}
    return false;
  }

  function applyScrollCueVisibility(cue, hero) {
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
    var hide = scrollCueShouldHide(hero);
    cue.classList.toggle("is-away", hide);
    cue.setAttribute("aria-hidden", hide ? "true" : "false");
    if (hide) {
      try {
        cue.style.removeProperty("opacity");
        cue.style.removeProperty("pointer-events");
        cue.style.removeProperty("transition");
      } catch (eCueClr) {}
    }
  }

  function refreshScrollCue(cue, hero, target) {
    applyScrollCueVisibility(cue, hero);
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

  function pinScrollCueLayout(cue, hero) {
    if (!cue || !hero) return;
    try {
      var heroPos = window.getComputedStyle(hero).position;
      if (!heroPos || heroPos === "static") {
        hero.style.setProperty("position", "relative", "important");
      }
      cue.style.setProperty("position", "absolute", "important");
      cue.style.setProperty("top", "auto", "important");
      cue.style.setProperty("left", "0", "important");
      cue.style.setProperty("right", "0", "important");
      cue.style.setProperty(
        "bottom",
        "env(safe-area-inset-bottom, 0px)",
        "important"
      );
      cue.style.setProperty("margin-top", "0", "important");
      cue.style.setProperty("margin-bottom", "0", "important");
      cue.style.setProperty("margin-left", "auto", "important");
      cue.style.setProperty("margin-right", "auto", "important");
      cue.style.setProperty("width", "max-content", "important");
      cue.style.setProperty("max-width", "calc(100% - 2rem)", "important");
      cue.style.setProperty("transform", "none", "important");
    } catch (ePinCue) {}
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
    pinScrollCueLayout(cue, hero);
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
      window.addEventListener("wheel", onScroll, { passive: true });
      window.addEventListener("touchmove", onScroll, { passive: true });
      onScroll();
    } else {
      onScroll();
    }
  }

  function ensureScrollCue() {
    ensureScrollCueFor(document.getElementById("intro"));
  }

  function isSeratafilmRoute() {
    try {
      if (document.body && document.body.classList.contains("vc-seratafilm-page")) return true;
    } catch (eB) {}
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    return p === "/seratafilm" || p.indexOf("/seratafilm/") === 0;
  }

  function excludedPolishPath() {
    if (isStaffRoute() && !isStaffCinePage()) return true;
    if (isSeratafilmRoute()) return true;
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/") return true;
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
        if (isSeratafilmRoute()) return true;
        if (isEventoPage()) return true;
        var body = document.body;
    if (body && body.classList.contains("vc-notifications-page")) return true;
    var path = String(location.pathname || "").replace(/\/+$/, "") || "/";
    if (path === "/notifications") return true;
        if (isStaffRoute() && !isStaffCinePage()) return true;
    if (isUserProfileRoute()) return true;
    var p = String(location.pathname || "").replace(/\/+$/, "");
    if (/^\/personalizza(\/|$)/.test(p)) return true;
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
        window.setTimeout(function () {
      if (done) return;
      done = true;
      try {
        obs.disconnect();
      } catch (eObsT) {}
      try {
        if (loaderObs) loaderObs.disconnect();
      } catch (eLoaderObsT) {}
      fn();
    }, 4500);
  }

  function markPageCineReady(immediate) {
            if (
      !immediate &&
      isStaffCinePage() &&
      document.documentElement &&
      !document.documentElement.classList.contains("vc-home-cine-live")
    ) {
      if (!window.__vcStaffCineReadyFailsafe) {
        window.__vcStaffCineReadyFailsafe = window.setTimeout(function () {
                    try {
            bootStaffCineLayout(true);
          } catch (eFsLayout) {}
                              markPageCineReady(true);
        }, 320);
      }
      return;
    }
    if (window.__vcStaffCineReadyFailsafe) {
      window.clearTimeout(window.__vcStaffCineReadyFailsafe);
      window.__vcStaffCineReadyFailsafe = 0;
    }

    function polishLayoutPending() {
      try {
        if (!isPolishPage()) return false;
        var body = document.body;
        if (!body || body.classList.contains("vc-body--home")) return false;
        if (shouldSkipPageCineHeroLayout()) return false;
        if (isStaffProfileHome() || isEventoPage() || isSeratafilmRoute()) return false;
        if (excludedPolishPath()) return false;
        if (isStaffCinePage()) return false;
        return !body.classList.contains("vc-page-cine-layout");
      } catch (ePend) {
        return false;
      }
    }

    function apply() {
      var root = document.documentElement;
      if (!root) return;
      if (polishLayoutPending()) {
        try {
          initPageHeroLayout({ force: true });
        } catch (eLayReady) {}
        if (polishLayoutPending()) {
          if (!window.__vcCineLayoutReadyRetry) {
            window.__vcCineLayoutReadyRetry = 0;
          }
          if (window.__vcCineLayoutReadyRetry < 40) {
            window.__vcCineLayoutReadyRetry += 1;
            window.setTimeout(function () {
              markPageCineReady(true);
            }, 50);
            return;
          }
        }
      }
      try {
        window.__vcCineLayoutReadyRetry = 0;
      } catch (eClr) {}
      root.classList.add("vc-page-cine-ready");
      root.classList.remove("vc-page-cine-boot");
      try {
        initPageBodyCascade();
      } catch (eCascade) {}
      try {
        if (document.body && !document.body.classList.contains("vc-body--home")) {
          bindInnerHeroScrollFx();
        }
      } catch (eHeroFx) {}
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
        if (!isStaffCinePage() && !isStaffVinylPage()) {
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
        var alreadyReady = root.classList.contains("vc-page-cine-ready");
        root.classList.add("vc-page-cine-ready");
        root.classList.remove("vc-page-cine-boot");
                        if (!alreadyReady) {
          try {
            document.dispatchEvent(new Event("vc:page-cine-ready"));
          } catch (eReadyEvt) {}
        }
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
        if (el.classList.contains("vc-notify-hero") && document.body && document.body.classList.contains("vc-notifications-page")) {
      return false;
    }
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
      if (
        sib !== contentWrap &&
        sib.id !== "vc-page-content" &&
        sib.id !== "vc-notif-scope-dock" &&
        !(sib.classList && sib.classList.contains("vc-notif-scope-dock"))
      ) {
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
    /* sponsorAsideBelow1: tip/requisiti SOTTO la card SOLO su sponsor */
    try {
      if (!document.body || !document.body.classList.contains("vc-sponsor-page")) return;
      var target = contentWrap || document.getElementById("vc-page-content");
      if (!target) return;
      var deferred = document.getElementById("vc-sponsor-aside-deferred");
      if (deferred) {
        deferred.removeAttribute("id");
        deferred.hidden = false;
        deferred.removeAttribute("hidden");
        deferred.className = "vc-page-cine-aside-below";
        if (deferred.parentNode !== target) {
          target.insertBefore(deferred, target.firstChild);
        }
      }
      var below = document.querySelector(".vc-sponsor-intro-below");
      if (below) {
        var wrap = below.querySelector(".vc-page-cine-aside-inline, .vc-page-cine-aside-below") || below.firstElementChild;
        if (wrap) {
          if (!wrap.classList.contains("vc-page-cine-aside-below") && !wrap.classList.contains("vc-page-cine-aside-inline")) {
            var box = document.createElement("div");
            box.className = "vc-page-cine-aside-below";
            while (below.firstChild) box.appendChild(below.firstChild);
            wrap = box;
          } else {
            wrap.classList.remove("vc-page-cine-aside-inline");
            wrap.classList.add("vc-page-cine-aside-below");
            if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
          }
          target.insertBefore(wrap, target.firstChild);
        }
        if (below.parentNode) below.parentNode.removeChild(below);
      }
      var head = document.querySelector(".vc-page-cine-hero .vc-hero-head");
      if (head) {
        var nested = head.querySelectorAll(".vc-page-cine-aside-inline, .vc-sponsor-embed");
        for (var i = 0; i < nested.length; i += 1) {
          var n = nested[i];
          if (n.classList.contains("vc-sponsor-embed") && !n.closest(".vc-page-cine-aside-below")) {
            var shell = document.createElement("div");
            shell.className = "vc-page-cine-aside-below";
            shell.appendChild(n);
            target.insertBefore(shell, target.firstChild);
          } else if (n.classList.contains("vc-page-cine-aside-inline")) {
            n.classList.remove("vc-page-cine-aside-inline");
            n.classList.add("vc-page-cine-aside-below");
            target.insertBefore(n, target.firstChild);
          }
        }
        head.classList.remove("vc-hero-head--has-aside");
      }
    } catch (eSp) {}
  }

  function flushWikiAsideToContent(contentWrap) {
    /* tip wiki/faq/… DENTRO la hero card; recupera anche leftovers classati aside-below */
    try {
      if (
        document.body &&
        (document.body.classList.contains("vc-roles-page") ||
          document.body.classList.contains("vc-candidature-page"))
      ) {
        return;
      }
      var head =
        document.querySelector(".vc-page-cine-hero .vc-hero-head") ||
        document.querySelector(".vc-hero-head");
      if (!head) return;
      if (document.body && document.body.classList.contains("vc-sponsor-page")) return;
      var deferred = document.getElementById("vc-wiki-aside-deferred");
      if (deferred) {
        deferred.removeAttribute("id");
        deferred.hidden = false;
        deferred.removeAttribute("hidden");
        deferred.className = "vc-page-cine-aside-inline";
        head.appendChild(deferred);
        head.classList.add("vc-hero-head--has-aside");
      }
      var belowNodes = document.querySelectorAll(
        ".vc-wiki-tips-below, #vc-page-content > .vc-page-cine-aside-below, .vc-page-cine-aside-below"
      );
      for (var b = 0; b < belowNodes.length; b += 1) {
        var below = belowNodes[b];
        if (!below || !below.isConnected) continue;
        if (below.closest && below.closest(".vc-sponsor-page")) continue;
        var wrap =
          below.querySelector(".vc-page-cine-aside-inline, .vc-page-cine-aside-below, .vc-wiki-tips-grid") ||
          (below.classList.contains("vc-page-cine-aside-below") ? below : below.firstElementChild);
        if (!wrap) continue;
        if (wrap === below) {
          wrap.classList.remove("vc-page-cine-aside-below");
          wrap.classList.add("vc-page-cine-aside-inline");
          head.appendChild(wrap);
          head.classList.add("vc-hero-head--has-aside");
          continue;
        }
        if (!wrap.classList.contains("vc-page-cine-aside-inline")) {
          var box = document.createElement("div");
          box.className = "vc-page-cine-aside-inline";
          while (below.firstChild) box.appendChild(below.firstChild);
          wrap = box;
        } else if (wrap.parentNode) {
          wrap.parentNode.removeChild(wrap);
        }
        wrap.classList.remove("vc-page-cine-aside-below");
        wrap.classList.add("vc-page-cine-aside-inline");
        head.appendChild(wrap);
        head.classList.add("vc-hero-head--has-aside");
        if (below.parentNode) below.parentNode.removeChild(below);
      }
    } catch (eWiki) {}
  }

  function parkPhoneHeavyAsideBelow() {
    /* phoneHeroScroll1: su telefono tip pesanti fuori hero (ruoli/candidature) */
    try {
      var isPhone = false;
      try {
        isPhone = window.matchMedia && window.matchMedia("(max-width: 639.98px)").matches;
      } catch (eMq) {
        isPhone = (window.innerWidth || 0) < 640;
      }
      var body = document.body;
      if (!body) return;

      if (body.classList.contains("vc-candidature-page")) {
        var belowHost = document.querySelector(".vc-candidature-pair-below");
        var pairInHero = document.querySelector(
          ".vc-page-cine-hero .vc-candidature-hero-pair, .vc-hero-head .vc-candidature-hero-pair, .vc-page-cine-aside-inline .vc-candidature-hero-pair"
        );
        var pairInBelow = belowHost && belowHost.querySelector(".vc-candidature-hero-pair");
        if (isPhone) {
          if (belowHost) {
            belowHost.hidden = false;
            belowHost.removeAttribute("hidden");
          }
          if (pairInHero && belowHost && !pairInBelow) {
            belowHost.appendChild(pairInHero);
          }
        } else if (pairInBelow) {
          var head =
            document.querySelector(".vc-page-cine-hero .vc-hero-head") ||
            document.querySelector(".vc-page-cine-hero .vc-page-cine-aside-inline") ||
            document.querySelector(".vc-page-cine-hero");
          if (head) {
            if (!head.classList.contains("vc-page-cine-aside-inline") && head.classList.contains("vc-hero-head")) {
              var inline = head.querySelector(".vc-page-cine-aside-inline");
              if (!inline) {
                inline = document.createElement("div");
                inline.className = "vc-page-cine-aside-inline";
                head.appendChild(inline);
                head.classList.add("vc-hero-head--has-aside");
              }
              inline.appendChild(pairInBelow);
            } else {
              head.appendChild(pairInBelow);
            }
          }
          if (belowHost) {
            belowHost.hidden = true;
            belowHost.setAttribute("hidden", "");
          }
        }
      }
    } catch (ePark) {}
  }

  function shouldDeferHeroAside(hero) {
    /* tip/aside restano DENTRO la hero card; fuori solo sponsor (flushSponsor). */
    return false;
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
        if (hasRealCineInterior(hero)) {
      hero.dataset.vcHomeHeroBuilt = "1";
      return;
    }
    if (hero.dataset.vcHomeHeroBuilt === "1") return;

    var cue = hero.querySelector(":scope > .vc-home-scrollcue");
    var scopeDock = hero.querySelector(":scope > #vc-notif-scope-dock, :scope > .vc-notif-scope-dock");
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
        if (ch.nodeType === 1 && (ch.id === "vc-notif-scope-dock" || ch.classList.contains("vc-notif-scope-dock"))) {
          break;
        }
        copyRoot.appendChild(ch);
      }
      if (!copyRoot.childNodes.length) return;
    }

    if (!copyRoot) return;

    var asideInline =
      panel && panel.classList.contains("vc-vote-page-hero__inner")
        ? null
        : extractHeroAside(hero);

    /* cineIconsBack1: tieni l'icona hero (libro/lampadina/stella) — non rimuoverla */

    if (panel && panel.classList.contains("vc-vote-page-hero__inner")) {
      copyRoot.classList.add("vc-page-cine-hero-copy", "vc-page-cine-hero-copy--vote", "mx-auto", "w-full", "text-center");
    } else {
      copyRoot.classList.add("vc-page-cine-hero-copy", "mx-auto", "w-full", "text-center");
    }
        try {
      copyRoot.classList.remove("max-w-3xl", "max-w-2xl", "max-w-xl", "text-left", "sm:text-left", "lg:text-left");
      copyRoot.classList.add("text-center", "mx-auto", "w-full");
    } catch (eCopyCls) {}
    var btnRow = copyRoot.querySelector("[class*='flex-wrap']");
    if (btnRow) btnRow.classList.add("justify-center");

    /* sponsorAsideBelow1: tip Requisiti/Visibilità sotto la card; refund resta DENTRO la hero */
    var deferredAside = null;
    try {
      if (document.body && document.body.classList.contains("vc-sponsor-page")) {
        deferredAside = document.createElement("div");
        deferredAside.id = "vc-sponsor-aside-deferred";
        deferredAside.className = "vc-page-cine-aside-below";
        deferredAside.hidden = true;
        if (asideInline && asideInline.childNodes.length) {
          while (asideInline.firstChild) deferredAside.appendChild(asideInline.firstChild);
          asideInline = null;
        }
      }
    } catch (eDef) {}

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
    if (deferredAside && deferredAside.childNodes.length) {
      try {
        hero.insertAdjacentElement("afterend", deferredAside);
      } catch (eIns) {
        try {
          document.body.appendChild(deferredAside);
        } catch (eBody) {}
      }
    }
    if (scopeDock) hero.appendChild(scopeDock);
    if (cue) hero.appendChild(cue);

    hero.dataset.vcHomeHeroBuilt = "1";
  }

  function resolveDefaultHeroIconSpec() {
    /* cardHeroIcon1: fallback FA se markup perso / JS cine stale ha rimosso l'icona */
    var body = document.body;
    var cls = (body && body.className) || "";
    if (/\bvc-reviews-page\b|\bvc-bot-reviews-page\b/.test(cls)) {
      return { fa: "fa-star-o", extra: "vc-reviews-hero-star" };
    }
    if (/\bvc-suggestions-page\b/.test(cls)) {
      return { fa: "fa-lightbulb-o", extra: "vc-suggestions-hero-bulb vc-reviews-hero-star" };
    }
    if (/\bvc-sponsor-page\b/.test(cls)) {
      return { fa: "fa-handshake-o", extra: "vc-sponsor-hero-handshake" };
    }
    if (/\bvc-wiki-page\b/.test(cls)) {
      return { fa: "fa-book", extra: "vc-wiki-hero-book" };
    }
    if (/\bvc-faq-page\b|\bvc-regole-page\b/.test(cls)) {
      return { fa: "fa-question-circle", extra: "vc-regole-hero-book" };
    }
    if (/\bvc-donazioni-page\b/.test(cls)) {
      return { fa: "fa-heart", extra: "vc-donazioni-hero-heart" };
    }
    if (/\bvc-perks-page\b/.test(cls)) {
      return { fa: "fa-rocket", extra: "vc-perks-hero-rocket" };
    }
    if (/\bvc-vote-page\b/.test(cls)) {
      return { fa: "fa-check-square-o", extra: "" };
    }
    if (/\bvc-roles-page\b/.test(cls)) {
      return { fa: "fa-id-badge", extra: "" };
    }
    if (/\bvc-tickets-page\b|\bvc-web-tickets-page\b/.test(cls)) {
      return { fa: "fa-ticket", extra: "vc-tickets-hero-ticket" };
    }
    if (/\bvc-candidature-page\b/.test(cls)) {
      return { fa: "fa-briefcase", extra: "" };
    }
    if (/\bvc-appelli-page\b/.test(cls)) {
      return { fa: "fa-unlock", extra: "vc-unban-hero-unlock" };
    }
    if (/\bvc-staff-guide-page\b/.test(cls)) {
      return { fa: "fa-book", extra: "vc-staff-hero-icon" };
    }
    if (/\bvc-staff-pause-page\b/.test(cls)) {
      return { fa: "fa-calendar", extra: "vc-staff-hero-icon" };
    }
    if (/\bvc-staff-organico-page\b/.test(cls)) {
      return { fa: "fa-users", extra: "vc-staff-hero-icon" };
    }
    /* homeHero1: homepage card icon = FA coffee (brand) */
    if (/\bvc-body--home\b/.test(cls)) {
      return { fa: "fa-coffee", extra: "" };
    }
    return { fa: "fa-coffee", extra: "" };
  }

  function ensureStaffHeroIconTop(hero) {
    /* cineHeroBadge1 + cardHeroIcon1: icona sempre prima di kicker/titolo nella copy */
    try {
      if (!hero || !hero.querySelector) return;
      var copy =
        hero.querySelector(".vc-page-cine-hero-copy") ||
        hero.querySelector(".vc-sponsor-hero-copy") ||
        hero.querySelector(".vc-hero-head .max-w-3xl") ||
        hero.querySelector(".max-w-3xl") ||
        hero.querySelector(".vc-hero-head");
      if (!copy) return;
      var icon =
        copy.querySelector(":scope > .vc-support-page-hero__icon") ||
        hero.querySelector(".vc-support-page-hero__icon");
      if (!icon) {
        var spec = resolveDefaultHeroIconSpec();
        icon = document.createElement("div");
        icon.className =
          "vc-support-page-hero__icon vc-support-page-hero__icon--start mb-5" +
          (spec.extra ? " " + spec.extra : "");
        icon.setAttribute("aria-hidden", "true");
        var ii = document.createElement("i");
        ii.className = "fa " + spec.fa;
        icon.appendChild(ii);
      }
      if (icon.parentElement !== copy) {
        copy.insertBefore(icon, copy.firstChild);
      } else if (copy.firstElementChild !== icon) {
        copy.insertBefore(icon, copy.firstChild);
      }
      icon.classList.add("vc-staff-hero-icon");
      icon.removeAttribute("hidden");
      icon.style.removeProperty("display");
      icon.style.removeProperty("visibility");
      icon.style.removeProperty("opacity");
    } catch (eIconTop) {}
  }

  function polishHeroChrome(hero) {
    if (!hero) return;

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

    /* cineHeroBadge1: icona sempre sopra kicker su tutte le pagine cine */
    ensureStaffHeroIconTop(hero);
  }

  function initPageHeroRise(hero) {
    if (!hero || prefersReduced()) return;
    try {
      if (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) {
        hero.classList.remove("vc-home-rise");
        hero.classList.add("is-in");
        var fastBits = hero.querySelectorAll(".vc-home-rise");
        for (var fb = 0; fb < fastBits.length; fb++) fastBits[fb].classList.add("is-in");
        return;
      }
    } catch (eFastRise) {}
    hero.classList.remove("vc-home-rise");
    hero.classList.add("is-in");

    if (hero.dataset.vcHeroRise === "1") return;
    hero.dataset.vcHeroRise = "1";

    var head = hero.querySelector(".vc-hero-head") || hero.querySelector(".vc-support-intro-shell");
    if (head) {
            head.classList.remove("vc-home-rise");
      head.classList.add("is-in");
    }

    var bits = hero.querySelectorAll(
      ".vc-hero-kicker, .vc-brand-glow, .vc-hero-about, .vc-hero-head a.vc-header-pill, .vc-page-cine-aside-inline > [class*='rounded-'], .vc-page-cine-aside-inline .grid > [class*='rounded-']"
    );
    var riseBits = [];
    for (var h = 0; h < bits.length; h++) {
      if (!isVisibleEl(bits[h])) continue;
      markRise(bits[h], 0);
      riseBits.push(bits[h]);
    }

    var revealed = false;
    function revealHeroBits() {
      if (revealed) return;
      revealed = true;
      for (var i = 0; i < riseBits.length; i++) {
        riseBits[i].classList.add("is-in");
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
            if (interiorOk) {
        ensureStaffCineClasses(laidHero || hero);
        if (opts.force) {
          restructurePageMain(container, laidHero || hero);
          container.classList.add("vc-page-cine-main");
        }
        polishHeroChrome(laidHero || hero);
        flushSponsorAsideToContent(document.getElementById("vc-page-content"));
        flushWikiAsideToContent(document.getElementById("vc-page-content"));
        parkPhoneHeavyAsideBelow();
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
        flushWikiAsideToContent(document.getElementById("vc-page-content"));
        parkPhoneHeavyAsideBelow();
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
    flushWikiAsideToContent(contentWrap);
    parkPhoneHeavyAsideBelow();
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

  function pickHomeBodyCascadeNodes() {
    var selectors = [
      "#stats .vc-stat-strip",
      ".vc-home-deck",
      ".vc-home-feature",
      ".vc-home-index",
    ];
    var list = [];
    for (var s = 0; s < selectors.length; s++) {
      var nodes = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < nodes.length && list.length < 24; i++) {
        var el = nodes[i];
        if (el.hidden || el.hasAttribute("hidden")) continue;
        if ((el.offsetHeight || 0) > 0 && (el.offsetHeight || 0) < 48) continue;
        list.push(el);
      }
    }
    return list.slice(0, 24);
  }

  function pickBodyCascadeNodes() {
    var body = document.body;
    if (body && body.classList.contains("vc-body--home")) {
      return pickHomeBodyCascadeNodes();
    }
    var root = document.getElementById("vc-page-content") || document.querySelector(".vc-page-cine-body");
    if (!root) return [];
    var direct = root.querySelectorAll(":scope > section, :scope > article, :scope > div");
    var list = [];
    for (var i = 0; i < direct.length; i++) {
      var el = direct[i];
      if (el.hidden || el.hasAttribute("hidden")) continue;
      if (el.id === "vc-regole-tabs" || el.id === "vc-staff-guide-tabs" || el.id === "vc-regole-list" || el.id === "vc-staff-guide-list") {
        continue;
      }
      if ((el.offsetHeight || 0) > 0 && (el.offsetHeight || 0) < 48) continue;
      var innerCards = el.querySelectorAll(
        ":scope > .vc-faq-group, :scope > .vc-faq-item, :scope > .vc-regole-card, :scope > .vc-role-card, :scope > .vc-reviews-card, :scope > .vc-reviews-formcard, :scope > .vc-page-cine-card, :scope > .vc-perks-card, :scope > .vc-legal-card, :scope > .vc-staff-block, :scope > section, :scope > article"
      );
      if (innerCards.length >= 2) {
        for (var j = 0; j < innerCards.length && list.length < 24; j++) {
          var inner = innerCards[j];
          if (inner.closest && (inner.closest("#vc-regole-list") || inner.closest("#vc-staff-guide-list"))) continue;
          if (inner.hidden || inner.hasAttribute("hidden")) continue;
          if ((inner.offsetHeight || 0) > 0 && (inner.offsetHeight || 0) < 48) continue;
          list.push(inner);
        }
      } else {
        list.push(el);
      }
    }
    return list.slice(0, 24);
  }

  function bodyCascadeShouldTrigger() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (y > 40) return true;
    var body = document.body;
    if (body && body.classList.contains("vc-body--home")) {
      var intro = document.getElementById("intro");
      if (intro) {
        try {
          var ir = intro.getBoundingClientRect();
          var ivh = window.innerHeight || 800;
          if (ir.bottom < ivh * 0.88) return true;
        } catch (eIntro) {}
      }
      var stats = document.getElementById("stats");
      if (stats) {
        try {
          var sr = stats.getBoundingClientRect();
          var svh = window.innerHeight || 800;
          return sr.top < svh * 0.94 && sr.bottom > 24;
        } catch (eStats) {}
      }
      return false;
    }
    var hero = document.querySelector(".vc-page-cine-hero, .vc-support-page-hero, .vc-notify-hero, .vc-staff-hero");
    if (hero) {
      try {
        var hr = hero.getBoundingClientRect();
        var vh = window.innerHeight || 800;
        if (hr.bottom < vh * 0.88) return true;
      } catch (eH) {}
    }
    var content = document.getElementById("vc-page-content") || document.querySelector(".vc-page-cine-body");
    if (!content) return false;
    try {
      var r = content.getBoundingClientRect();
      var vh2 = window.innerHeight || 800;
      return r.top < vh2 * 0.94 && r.bottom > 24;
    } catch (eR) {
      return false;
    }
  }

  function playPageBodyCascade() {
    var state = window.__vcPageBodyCascade;
    if (!state || state.played) return;
    if (!state.items || !state.items.length) return;
    state.played = true;
    window.__vcPageBodyCascadeDone = true;
    var snappy = shouldSnappyBodyFx();
    for (var i = 0; i < state.items.length; i++) {
      if (snappy) {
        try {
          state.items[i].el.classList.add("is-in");
        } catch (eInSnap) {}
        continue;
      }
      (function (item) {
        var timer = window.setTimeout(function () {
          try {
            item.el.classList.add("is-in");
          } catch (eIn) {}
        }, item.delay);
        state.timers.push(timer);
      })(state.items[i]);
    }
  }

  function initPageBodyCascade() {
    var body = document.body;
    if (!body) return;
    var isHome = body.classList.contains("vc-body--home");
    if (!isHome && !body.classList.contains("vc-page-cine-layout") && !document.getElementById("vc-page-content")) {
      return;
    }

    try {
      document.documentElement.classList.add("vc-home-motion-ready");
    } catch (eMotion) {}

    var nodes = pickBodyCascadeNodes();
    if (!nodes.length) return;

    if (!window.__vcPageBodyCascade) {
      window.__vcPageBodyCascade = { played: false, items: [], timers: [] };
      window.addEventListener(
        "scroll",
        function () {
          if (window.__vcPageBodyCascade.played) return;
          if (!bodyCascadeShouldTrigger()) return;
          playPageBodyCascade();
        },
        { passive: true }
      );
      document.addEventListener(
        "click",
        function (ev) {
          if (window.__vcPageBodyCascade.played) return;
          var t = ev.target;
          if (t && t.closest && t.closest(".vc-home-scrollcue")) {
            window.setTimeout(playPageBodyCascade, 140);
          }
        },
        { passive: true, capture: true }
      );
    }

    var state = window.__vcPageBodyCascade;
    if (state.played && state.items.length) return;

    for (var t = 0; t < state.timers.length; t++) {
      window.clearTimeout(state.timers[t]);
    }
    state.timers = [];
    state.items = [];
    if (state.played) {
      state.played = false;
      window.__vcPageBodyCascadeDone = false;
    }

    for (var n = 0; n < nodes.length; n++) {
      var el = nodes[n];
      el.setAttribute("data-vc-body-cascade", "1");
      var snappy = shouldSnappyBodyFx();
      var delay = snappy ? 0 : 70 + n * 85;
      if (snappy) {
        el.classList.remove("vc-home-rise");
        try {
          el.style.removeProperty("--vc-rise-delay");
        } catch (eDelayClr) {}
        el.classList.add("is-in");
      } else {
        markRise(el, delay);
        el.classList.remove("is-in");
      }
      state.items.push({ el: el, delay: delay });
    }

    if (bodyCascadeShouldTrigger()) {
      window.requestAnimationFrame(function () {
        playPageBodyCascade();
      });
    }
  }

  try {
    window.__vcInitPageBodyCascade = initPageBodyCascade;
  } catch (eExposeCascade) {}

  function initHomeFx() {
    var coarse = isCoarse();
        var instant = false;

    try {
      document.documentElement.classList.add("vc-home-motion-ready");
    } catch (eMotion) {}

    var heroBits = document.querySelectorAll(
      "#intro .vc-hero-kicker, #intro .vc-brand-glow, #intro .vc-hero-about, #intro .vc-hero-head a.vc-header-pill"
    );
    for (var h = 0; h < heroBits.length; h++) {
      markRise(heroBits[h], instant ? 0 : 50 + h * 70);
      if (instant) {
        heroBits[h].classList.add("is-in");
      } else {
        (function (el, delay) {
          window.requestAnimationFrame(function () {
            window.setTimeout(function () {
              try {
                el.classList.add("is-in");
              } catch (eIn) {}
            }, delay);
          });
        })(heroBits[h], 50 + h * 70);
      }
    }

    var panels = document.querySelectorAll(
      "#stats .vc-stat-strip, .vc-home-deck, .vc-home-feature, .vc-home-index"
    );
    for (var p = 0; p < panels.length; p++) {
      markRise(panels[p], instant ? 0 : 120 + p * 90);
      if (instant) panels[p].classList.add("is-in");
    }

    var cells = document.querySelectorAll(".vc-home-deck__cell");
    for (var c = 0; c < cells.length; c++) {
      markRise(cells[c], instant ? 0 : 160 + c * 45);
      if (instant) cells[c].classList.add("is-in");
    }

    var pills = document.querySelectorAll(".vc-home-feature__pills a");
    for (var i = 0; i < pills.length; i++) {
      markRise(pills[i], instant ? 0 : 180 + i * 35);
      if (instant) pills[i].classList.add("is-in");
    }

    var cols = document.querySelectorAll(".vc-home-index__col");
    for (var k = 0; k < cols.length; k++) {
      markRise(cols[k], instant ? 0 : 200 + k * 55);
      if (instant) cols[k].classList.add("is-in");
    }

    try {
      initPageBodyCascade();
    } catch (eHomeCascade) {}

    var riseNodes = document.querySelectorAll(".vc-home-rise:not(.is-in)");

    function reveal(el) {
      if (!el || el.classList.contains("is-in")) return;
      if (el.getAttribute("data-vc-body-cascade") === "1") return;
      el.classList.add("is-in");
    }

    var snappyRise = shouldSnappyBodyFx();
    if (!riseNodes.length) {
          } else if (snappyRise || typeof IntersectionObserver === "undefined") {
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
        { root: null, rootMargin: "48px 0px", threshold: 0.06 }
      );
      for (var n = 0; n < riseNodes.length; n++) {
        if (riseNodes[n].getAttribute("data-vc-body-cascade") === "1") continue;
        io.observe(riseNodes[n]);
      }
    }

            function riseInView(el) {
      try {
        var r = el.getBoundingClientRect();
        var vh = window.innerHeight || document.documentElement.clientHeight || 0;
        return r.top < vh * 0.9 && r.bottom > 24;
      } catch (eV) {
        return true;
      }
    }
    window.setTimeout(function () {
      try {
        var stale = document.querySelectorAll(".vc-home-rise:not(.is-in)");
        for (var s = 0; s < stale.length; s++) {
          if (stale[s].getAttribute("data-vc-body-cascade") === "1" && !window.__vcPageBodyCascadeDone) continue;
          if (!shouldSnappyBodyFx() && !riseInView(stale[s])) continue;
          stale[s].classList.add("is-in");
        }
      } catch (eStale) {}
    }, shouldSnappyBodyFx() ? 0 : 900);
    window.setTimeout(function () {
      try {
        var stale2 = document.querySelectorAll(".vc-home-rise:not(.is-in)");
        for (var s2 = 0; s2 < stale2.length; s2++) {
          if (stale2[s2].getAttribute("data-vc-body-cascade") === "1" && !window.__vcPageBodyCascadeDone) continue;
          stale2[s2].classList.add("is-in");
        }
      } catch (eStale2) {}
    }, 12000);

                var skipHeavyFx =
      coarse ||
      isStandalonePwa() ||
      (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) ||
      (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite());
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
          if (gpuQuietPaused()) {
            shell.style.transform = "";
            return;
          }
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
            if (gpuQuietPaused()) return;
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
      if (gpuQuietPaused()) return;
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
        if (gpuQuietPaused()) return;
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
        var skipMag = prefersReduced() || isCoarse();
    try {
      if (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) {
        skipMag = true;
      }
    } catch (eMagSkip) {}
    if (skipMag) return;

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

        if (
      coarse ||
      (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) ||
      (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite())
    ) {
      function cueOnlyTick() {
        if (cue) applyScrollCueVisibility(cue, section);
      }
      section._vcInnerHeroFxTick = cueOnlyTick;
      window.addEventListener("scroll", cueOnlyTick, { passive: true });
      window.addEventListener("resize", cueOnlyTick, { passive: true });
      cueOnlyTick();
      return;
    }

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
          applyScrollCueVisibility(cue, section);
        }
        return;
      }

                  section.classList.remove("is-collapsed");

                  var shift = coarse ? Math.min(24, y * 0.1) : Math.min(48, y * 0.18);
      var opacity = Math.max(coarse ? 0.55 : 0.35, 1 - y / (coarse ? 680 : 520));
      card.style.transition = "none";
      card.style.transform = "translate3d(0," + shift.toFixed(1) + "px,0)";
      card.style.opacity = String(opacity);

      if (cue) applyScrollCueVisibility(cue, section);
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
      ensureStaffHeroIconTop(hero);
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
      if (
        !isCoarse() &&
        !(window.VcPerf && window.VcPerf.isMidOrLite && window.VcPerf.isMidOrLite()) &&
        !(window.VcPerf && window.VcPerf.isLite && window.VcPerf.isLite())
      )
        initPanelTilt();
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
    bootStaffCineLayout(true);
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

    function flattenStaffPublicHero() {
    return;
  }

  function boot() {
    wireGpuQuietPageHidden();
    primeMobileCineClasses();
    var body = document.body;
        if (isSeratafilmRoute()) {
      try {
        markPageCineReady(true);
      } catch (eSf) {}
      return;
    }
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
      /* homeHero1: ensure coffee icon in homepage card */
      try {
        ensureStaffHeroIconTop(intro);
      } catch (eHomeIcon) {}
      var firstCta = document.querySelector("#intro .vc-hero-head a.vc-header-pill");
      if (firstCta && firstCta.className.indexOf("vc-home-cine-cta") < 0) {
        firstCta.className += " vc-home-cine-cta";
      }
      ensureScrollCue();
      initHomeFx();
    } else if (polish) {
      var vote = Boolean(body && body.classList.contains("vc-vote-page"));
      try {
        if (isStaffCinePage()) {
                    bootStaffCineLayout();
          watchStaffCineLayout();
        } else if (isStaffProfileHome()) {
          resetStaffPageCineLayout();
        } else if (isEventoPage()) {
          resetUsersPageCineLayout();
        } else if (shouldSkipPageCineHeroLayout()) {
          resetUsersPageCineLayout();
        } else if (isUsersCommunityPage()) {
          ensureCommunityPageCineLayout();
        } else {
          initPageHeroLayout({ force: true });
          bindInnerHeroScrollFx();
          snapScrollTopIfPristine();
        }
      } catch (eHeroLayout) {
                try {
          markPageCineReady(true);
        } catch (eReady) {}
      }
      try {
        document.documentElement.classList.add("vc-home-motion-ready");
      } catch (eInnerMotion) {}
      if (
        (!shouldSkipPageCineHeroLayout() || isStaffCinePage()) &&
        !vote &&
        !isStaffProfileHome() &&
        !isEventoPage()
      ) {
        try {
          if (!useStaticCineBackground()) {
            initPolishHeroFx();
            if (
              !isCoarse() &&
              !(window.VcPerf && window.VcPerf.isMidOrLite && window.VcPerf.isMidOrLite()) &&
              !(window.VcPerf && window.VcPerf.isLite && window.VcPerf.isLite())
            )
              initPointerTilt();
          }
        } catch (eFx) {}
      }
    }

    if (isAuditBot()) {
            try {
        document.documentElement.classList.add("vc-home-motion-ready");
      } catch (eAuditLive) {}
      try {
        var stageA = ensureStage();
        var canvasA = stageA && stageA.querySelector(".vc-home-cine__canvas");
        if (canvasA && canvasA.getContext) {
          var ctxA = canvasA.getContext("2d", { alpha: false });
          if (ctxA) {
            var wA = Math.max(1, window.innerWidth || 1);
            var hA = Math.max(1, window.innerHeight || 1);
            canvasA.width = wA;
            canvasA.height = hA;
            canvasA.style.width = wA + "px";
            canvasA.style.height = hA + "px";
            ctxA.setTransform(1, 0, 0, 1, 0, 0);
            ctxA.fillStyle = "#100c09";
            ctxA.fillRect(0, 0, wA, hA);
          }
        }
        document.documentElement.classList.add("vc-home-cine-live");
      } catch (eAuditPaint) {}
      markPageCineReady(true);
      return;
    }

    ensureCursorTrailScript();

    if (useStaticCineBackground()) {
      try {
        document.documentElement.classList.add("vc-cine-static-bg", "vc-home-cine-live", "vc-home-motion-ready");
      } catch (eStaticBg) {}
      try {
        ensureStage();
      } catch (eStagePhoto) {}
      // cineNoFlash2: non rivelare il layout piatto — markPageCineReady attende vc-page-cine-layout.
      markPageCineReady(true);
      return;
    }

    var lite = useLiteCanvas();
    var stage = ensureStage();
    var votePage = Boolean(body && body.classList.contains("vc-vote-page"));
    var skipPointerFx = Boolean(
      isCoarse() ||
        isStandalonePwa() ||
        (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) ||
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
    try {
      canvas.style.backgroundColor = "#100c09";
            ctx.fillStyle = "#100c09";
      ctx.fillRect(0, 0, Math.max(1, canvas.width || 1), Math.max(1, canvas.height || 1));
    } catch (eCanvasBg) {}

    var reduced = prefersReduced();
    var coarse = isCoarse();
    var dpr = 1;
    var w = 0;
    var h = 0;
    var raf = 0;
    var running = false;
    var t0 = performance.now();
        var mx = coarse ? 0.5 : 0.72;
    var my = coarse ? 0.56 : 0.28;
    var tx = coarse ? 0.5 : 0.72;
    var ty = coarse ? 0.56 : 0.28;
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
      var dprCap = lite ? 1.05 : 1.35;
      try {
        if (window.VcPerf && window.VcPerf.isLite()) dprCap = 1;
        else if (coarse) dprCap = Math.min(dprCap, 1.1);
      } catch (eDpr) {}
      dpr = Math.min(dprCap, window.devicePixelRatio || 1);
      var nextCw = Math.round(nextW * dpr);
      var nextCh = Math.round(nextH * dpr);
            if (w === nextW && h === nextH && canvas.width === nextCw && canvas.height === nextCh) {
        return false;
      }
      w = nextW;
      h = nextH;
      canvas.width = nextCw;
      canvas.height = nextCh;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var dustN = lite ? (coarse ? 4 : 8) : coarse ? 8 : 18;
      try {
        if (window.VcPerf && window.VcPerf.isLite()) dustN = Math.min(dustN, 2);
      } catch (eDust) {}
      spawnDust(dustN);
      return true;
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
      var step = Math.max(lite || coarse ? 4.2 : 2.4, r * (lite || coarse ? 0.028 : 0.014));
      if (!Number.isFinite(step) || step < 2) step = 2;
      var grooves = 0;
      for (var i = r * 0.22; i < r * 0.96 && grooves < 64; i += step) {
        grooves += 1;
        ctx.beginPath();
        ctx.arc(0, 0, i, 0, Math.PI * 2);
        ctx.strokeStyle = grooves % 2 === 0 ? "rgba(255,244,232,0.045)" : "rgba(0,0,0,0.28)";
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
        var targetFps = lite ? 12 : 22;
    try {
      if (window.VcPerf && window.VcPerf.isLite()) targetFps = 10;
      if (coarse) targetFps = Math.min(targetFps, 10);
            if (home && !coarse) targetFps = Math.min(targetFps, 14);
    } catch (eFps) {}
    var minFrameMs = 1000 / targetFps;
    var lastFrameAt = 0;
        var lastInputAt = 0;
    var IDLE_FREEZE_MS = coarse ? 700 : lite ? 1800 : home ? 900 : 2800;
    var PHONE_AUTO_IDLE_MS = 900;
    var HOME_AUTO_IDLE_MS = 700;
    var resumeTimer = 0;
    var vinylCache = null;
    var vinylCacheR = 0;
    var vinylCacheSize = 0;
    var idleFrozen = false;
    var cineMoQuietUntil = 0;

    function markCineIdleState() {
      try {
        document.documentElement.classList.add("vc-cine-idle");
      } catch (eIdleMark) {}
      if (paintedOnce) retireLiveCanvasToStatic();
    }

    function afterFirstPaint() {
      if (paintedOnce) return;
      paintedOnce = true;
            lastInputAt = performance.now();
      try {
        document.documentElement.classList.add("vc-home-cine-live");
      } catch (eLiveClass) {}
            if (polish && !document.body.classList.contains("vc-body--home") && typeof window.__vcSitePolishRise === "function") {
        try {
          window.__vcSitePolishRise();
        } catch (eRise) {}
      }
      markPageCineReady(true);
    }

    function ensureVinylCache(r) {
      var need = Math.ceil(r * 2 + 8);
      if (vinylCache && Math.abs(vinylCacheR - r) < 1.5 && vinylCacheSize >= need) return;
      vinylCacheR = r;
      vinylCacheSize = need;
      vinylCache = document.createElement("canvas");
      vinylCache.width = need;
      vinylCache.height = need;
      var vctx = vinylCache.getContext("2d");
      if (!vctx) {
        vinylCache = null;
        return;
      }
      var prev = ctx;
            try {
        ctx = vctx;
        drawVinyl(need / 2, need / 2, r, 0, 1);
      } finally {
        ctx = prev;
      }
    }

    function drawVinylCached(cx, cy, r, rot, alpha) {
      ensureVinylCache(r);
      if (!vinylCache) {
        drawVinyl(cx, cy, r, rot, alpha);
        return;
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.drawImage(vinylCache, -vinylCache.width / 2, -vinylCache.height / 2);
      ctx.restore();
    }

    function noteCineInput() {
      lastInputAt = performance.now();
                  if (home && !coarse && paintedOnce) {
        return;
      }
            if (coarse) {
        if (!paintedOnce) {
          if (!running) start();
          return;
        }
        idleFrozen = true;
        try {
          document.documentElement.classList.add("vc-cine-idle");
        } catch (eIdlePhone) {}
        stop();
        if (resumeTimer) {
          try {
            window.clearTimeout(resumeTimer);
          } catch (eClr) {}
          resumeTimer = 0;
        }
        resumeTimer = window.setTimeout(function () {
          resumeTimer = 0;
          if (!pageWantsCine()) return;
          if (performance.now() - lastInputAt < IDLE_FREEZE_MS - 30) return;
          idleFrozen = false;
          try {
            document.documentElement.classList.remove("vc-cine-idle");
          } catch (eIdleOffP) {}
          start();
        }, IDLE_FREEZE_MS);
        return;
      }
      if (idleFrozen) {
        idleFrozen = false;
        try {
          document.documentElement.classList.remove("vc-cine-idle");
        } catch (eIdleOff) {}
        start();
      }
    }

    function pageWantsCine() {
      if (document.hidden) return false;
            var skipFocusGate = coarse || isStandalonePwa();
      if (paintedOnce && !skipFocusGate) {
        try {
          if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
        } catch (eFocus) {}
      }
      if (uiChromeBusy()) return false;
      return true;
    }

    function paintFrame(now, freezeAfter) {
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

      var mobile = coarse || w < 900;
            var cx = mobile ? w * 0.5 : w * (0.78 + (mx - 0.5) * 0.04);
      var cy = mobile ? h * 0.52 : h * (0.54 + (my - 0.5) * 0.03);
      var r = mobile ? Math.min(w * 0.84, h * 0.44) : Math.min(w, h) * 0.46;
      var alpha = mobile ? (lite ? 0.66 : 0.72) : lite ? 0.62 : 0.68;
      drawVinylCached(cx, cy, r, t * 0.18, alpha);

      var cupX = mobile ? w * 0.18 : w * 0.18;
      var cupY = mobile ? h * 0.78 : h * 0.78;
      var steam = ctx.createRadialGradient(cupX, cupY, 10, cupX, cupY - h * 0.18, h * 0.28);
      steam.addColorStop(0, "rgba(234,212,187," + (mobile ? "0.07" : "0.14") + ")");
      steam.addColorStop(1, "rgba(234,212,187,0)");
      ctx.fillStyle = steam;
      ctx.fillRect(0, 0, w, h);

      for (var i = 0; i < dust.length; i++) {
        var p = dust[i];
        if (!freezeAfter) {
          p.y -= p.v * p.z * 0.16;
          p.x += p.drift * p.z * 0.08;
          if (p.y < -0.04) {
            p.y = 1.04;
            p.x = Math.random();
          }
          if (p.x < -0.04) p.x = 1.04;
          if (p.x > 1.04) p.x = -0.04;
        }
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
    }

    function frame(now) {
      raf = 0;
      if (!running) return;
      if (!pageWantsCine()) {
        stop();
        return;
      }
      if (paintedOnce && lastInputAt && now - lastInputAt >= IDLE_FREEZE_MS) {
        paintFrame(now, true);
        idleFrozen = true;
        cineMoQuietUntil = performance.now() + 120;
        markCineIdleState();
        stop();
        return;
      }
            if (coarse && paintedOnce && now - t0 >= PHONE_AUTO_IDLE_MS) {
        paintFrame(now, true);
        idleFrozen = true;
        cineMoQuietUntil = performance.now() + 120;
        markCineIdleState();
        stop();
        return;
      }
            if (home && !coarse && paintedOnce && now - t0 >= HOME_AUTO_IDLE_MS) {
        paintFrame(now, true);
        idleFrozen = true;
        cineMoQuietUntil = performance.now() + 400;
        markCineIdleState();
        stop();
        return;
      }
      if (lastFrameAt && now - lastFrameAt < minFrameMs) {
        raf = window.requestAnimationFrame(frame);
        return;
      }
      lastFrameAt = now;
      paintFrame(now, false);
      if (!raf) raf = window.requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      if (!pageWantsCine()) return;
      if (idleFrozen && performance.now() - lastInputAt >= IDLE_FREEZE_MS) return;
      running = true;
      lastFrameAt = 0;
      if (!paintedOnce) t0 = performance.now();
                  if (!raf) raf = window.requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function syncRunState() {
      if (performance.now() < cineMoQuietUntil) return;
      if (!pageWantsCine()) {
        if (!paintedOnce) {
                    start();
          return;
        }
        stop();
        return;
      }
      if (!paintedOnce || !lastInputAt) {
        start();
        return;
      }
      if (coarse) {
                if (performance.now() - lastInputAt >= IDLE_FREEZE_MS) {
          idleFrozen = false;
          try {
            document.documentElement.classList.remove("vc-cine-idle");
          } catch (eIdleClrP) {}
          start();
        } else {
          stop();
        }
        return;
      }
                  if (performance.now() - lastInputAt < IDLE_FREEZE_MS) {
        idleFrozen = false;
        try {
          document.documentElement.classList.remove("vc-cine-idle");
        } catch (eIdleClr) {}
        start();
      }
    }

    resize();
    try {
      ctx.fillStyle = "#100c09";
      ctx.fillRect(0, 0, Math.max(1, w), Math.max(1, h));
    } catch (eBootFill) {}
        try {
      paintFrame(performance.now(), true);
    } catch (eFirstPaint) {}
    start();

    window.addEventListener("resize", function () {
      vinylCache = null;
      vinylCacheR = 0;
      noteCineInput();
      var changed = resize();
      if (paintedOnce && changed) {
        try {
          paintFrame(performance.now(), true);
        } catch (eResizePaint) {}
      }
    });
    document.addEventListener("visibilitychange", syncRunState);
    window.addEventListener("blur", syncRunState);
    window.addEventListener("focus", function () {
      noteCineInput();
      syncRunState();
    });
    window.addEventListener(
      "pointerdown",
      function () {
        noteCineInput();
      },
      { passive: true },
    );
    window.addEventListener(
      "keydown",
      function () {
        noteCineInput();
      },
      { passive: true },
    );
    window.addEventListener(
      "scroll",
      function () {
        noteCineInput();
      },
      { passive: true },
    );
    if (!coarse) {
      window.addEventListener(
        "pointermove",
        function (ev) {
          noteCineInput();
          tx = ev.clientX / Math.max(1, w);
          ty = ev.clientY / Math.max(1, h);
        },
        { passive: true },
      );
    }
    try {
            if (!home && typeof MutationObserver !== "undefined") {
        var chromeObs = new MutationObserver(function () {
          if (performance.now() < cineMoQuietUntil) return;
          syncRunState();
        });
        chromeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      }
    } catch (eObs) {}

    var lastRecoverHomeCineAt = 0;
    var recoverHomeCineBusy = false;
    var wasPageHidden = false;
    function recoverHomeCineSurface(force) {
      if (recoverHomeCineBusy) return;
      var now = performance.now();
      var must = Boolean(force) || wasPageHidden || coarse || isStandalonePwa();
      if (!must && now - lastRecoverHomeCineAt < 3500) return;
      if (must && now - lastRecoverHomeCineAt < 280) return;
      lastRecoverHomeCineAt = now;
      recoverHomeCineBusy = true;
      wasPageHidden = false;
      reviveLiveCanvasFromStatic();
      try {
        document.documentElement.classList.add("vc-page-cine-ready");
        document.documentElement.classList.add("vc-home-motion-ready");
        document.documentElement.classList.remove("vc-page-cine-boot");
        document.documentElement.classList.remove("vc-cine-idle");
      } catch (eR) {}
      try {
        var stale = document.querySelectorAll(".vc-home-rise:not(.is-in)");
        var vh = window.innerHeight || 800;
        var max = Math.min(stale.length, 80);
        for (var i = 0; i < max; i++) {
          try {
            if (stale[i].getAttribute("data-vc-body-cascade") === "1" && !window.__vcPageBodyCascadeDone) continue;
            var rr = stale[i].getBoundingClientRect();
            if (force || (rr.top < vh * 0.92 && rr.bottom > 16)) stale[i].classList.add("is-in");
          } catch (eOne) {
            stale[i].classList.add("is-in");
          }
        }
      } catch (eS) {}
      try {
        if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
      } catch (eU) {}
      try {
                idleFrozen = false;
        vinylCache = null;
        vinylCacheR = 0;
        resize();
        paintFrame(performance.now(), true);
        paintedOnce = true;
        if (!document.hidden) start();
      } catch (ePaint) {}
      recoverHomeCineBusy = false;
    }
    window.addEventListener("pageshow", function (ev) {
      recoverHomeCineSurface(Boolean(ev && ev.persisted) || isStandalonePwa());
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        wasPageHidden = true;
        return;
      }
      if (document.visibilityState === "visible") {
        recoverHomeCineSurface(true);
      }
    });
    window.addEventListener("focus", function () {
      if (coarse || isStandalonePwa()) recoverHomeCineSurface(true);
    });
    if (home) {
      try {
        var homeStylesRepaintDone = false;
        function repaintAfterHomeGate() {
          if (homeStylesRepaintDone) return;
          if (!document.documentElement.classList.contains("vc-home-styles-ready")) return;
          homeStylesRepaintDone = true;
          window.setTimeout(function () {
            recoverHomeCineSurface(true);
          }, 0);
        }
        var homeStylesObs = new MutationObserver(repaintAfterHomeGate);
        homeStylesObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        repaintAfterHomeGate();
      } catch (eHomeGate) {}
      function canvasMaxRedSample() {
        try {
          if (!canvas || !ctx || canvas.width < 2) return 0;
          var cw = canvas.width;
          var ch = canvas.height;
          var pts = [
            [0.78, 0.54],
            [0.72, 0.28],
            [0.38, 0.18],
          ];
          var maxR = 0;
          var pi;
          for (pi = 0; pi < pts.length; pi += 1) {
            var px = Math.floor(cw * pts[pi][0]);
            var py = Math.floor(ch * pts[pi][1]);
            var d = ctx.getImageData(px, py, 1, 1).data;
            if (d[0] > maxR) maxR = d[0];
          }
          return maxR;
        } catch (eSample) {
          return 255;
        }
      }
      function ensureHomeCineVisible() {
        if (!home || useStaticCineBackground()) return;
        if (!paintedOnce) return;
        if (canvasMaxRedSample() > 40) return;
        try {
          recoverHomeCineSurface(true);
        } catch (eRecVis) {}
        window.setTimeout(function () {
          if (canvasMaxRedSample() > 40) return;
          retireLiveCanvasToStatic();
        }, 450);
      }
      window.setTimeout(ensureHomeCineVisible, 2400);
      window.setTimeout(ensureHomeCineVisible, 5200);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  try {
    var parkPhoneTimer = 0;
    window.addEventListener(
      "resize",
      function () {
        window.clearTimeout(parkPhoneTimer);
        parkPhoneTimer = window.setTimeout(parkPhoneHeavyAsideBelow, 120);
      },
      { passive: true }
    );
  } catch (eParkResize) {}

  /* welcomePronouns1: hero kicker Benvenuto/Benvenuta from Discord pronoun roles */
  (function bootWelcomePronounBadge() {
    var DEFAULT_KEY = "home.welcome";
    var DEFAULT_IT = "Benvenut* su";
    var inflight = 0;
    var lastUid = "";

    function welcomeEl() {
      return document.querySelector(".vc-hero-kicker[data-i18n^=\"home.welcome\"]");
    }

    function getToken() {
      try {
        if (typeof window.__vcDiscordGetAccessToken === "function") {
          return String(window.__vcDiscordGetAccessToken() || "").trim();
        }
      } catch (e0) {}
      try {
        return String(localStorage.getItem("vc_discord_access_token") || "").trim();
      } catch (e1) {
        return "";
      }
    }

    function isItalian() {
      try {
        if (window.VcI18n && typeof window.VcI18n.getLang === "function") {
          return String(window.VcI18n.getLang() || "it").toLowerCase().indexOf("it") === 0;
        }
      } catch (e) {}
      return true;
    }

    function setBadge(i18nKey, fallbackText) {
      var el = welcomeEl();
      if (!el) return;
      var key = String(i18nKey || DEFAULT_KEY).trim() || DEFAULT_KEY;
      el.setAttribute("data-i18n", key);
      var text = fallbackText || DEFAULT_IT;
      try {
        if (window.VcI18n && typeof window.VcI18n.t === "function") {
          var translated = window.VcI18n.t(key);
          if (translated) text = translated;
        }
      } catch (eT) {}
      if (!isItalian() && key !== DEFAULT_KEY) {
        try {
          if (window.VcI18n && typeof window.VcI18n.t === "function") {
            text = window.VcI18n.t(DEFAULT_KEY) || text;
          }
          el.setAttribute("data-i18n", DEFAULT_KEY);
        } catch (eEn) {}
      }
      el.textContent = text;
      el.setAttribute("data-vc-welcome-pronoun", key);
    }

    function resetBadge() {
      lastUid = "";
      setBadge(DEFAULT_KEY, DEFAULT_IT);
    }

    function applyFromApi(data) {
      if (!data || !data.ok) {
        resetBadge();
        return;
      }
      var key = String(data.i18nKey || DEFAULT_KEY).trim() || DEFAULT_KEY;
      var text = String(data.badge || DEFAULT_IT).trim() || DEFAULT_IT;
      setBadge(key, text);
    }

    function fetchWelcomePronouns(uid) {
      var token = getToken();
      if (!token) {
        resetBadge();
        return;
      }
      var seq = ++inflight;
      var ac = typeof AbortController !== "undefined" ? new AbortController() : null;
      var tid = setTimeout(function () {
        try {
          if (ac) ac.abort();
        } catch (eAb) {}
      }, 6000);
      fetch("/webhooks/site-welcome-pronouns", {
        method: "GET",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
        },
        credentials: "omit",
        signal: ac ? ac.signal : undefined,
      })
        .then(function (r) {
          return r.json().catch(function () {
            return null;
          });
        })
        .then(function (data) {
          if (seq !== inflight) return;
          if (uid && lastUid && uid !== lastUid) return;
          applyFromApi(data);
        })
        .catch(function () {
          if (seq !== inflight) return;
        })
        .finally(function () {
          try {
            clearTimeout(tid);
          } catch (eCl) {}
        });
    }

    function onProfile(user) {
      var uid = String((user && user.id) || "").trim();
      if (!uid) {
        resetBadge();
        return;
      }
      lastUid = uid;
      fetchWelcomePronouns(uid);
    }

    function bootFromExisting() {
      try {
        if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) {
          onProfile(window.__VC_DISCORD_PROFILE);
          return;
        }
      } catch (e0) {}
      if (!getToken()) resetBadge();
    }

    window.addEventListener("vc-discord-profile", function (ev) {
      try {
        onProfile(ev && ev.detail && ev.detail.user);
      } catch (e) {
        resetBadge();
      }
    });
    window.addEventListener("vc:auth-logout", function () {
      resetBadge();
    });
    document.addEventListener("vc:langchange", function () {
      if (lastUid && getToken()) fetchWelcomePronouns(lastUid);
      else resetBadge();
    });

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootFromExisting);
    } else {
      bootFromExisting();
    }
    window.setTimeout(bootFromExisting, 800);
  })();
})();
/* homeHero1 */
