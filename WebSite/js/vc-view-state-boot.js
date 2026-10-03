/**
 * vc-view-state-boot: su reload salva target Y + lock TOP immediato
 * (niente pin top:-Y; evita flash 1 frame della zona precedente).
 * Marker: scrollReloadNoYank1 + violPass2
 */
(function () {
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch (e0) {}

  function pagePath() {
    /* boardsScrollPath1: su /bacheca ignore query volatile */
    var path = String(window.location.pathname || "") || "/";
    if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
    if (/^\/bacheca(\/|$)/i.test(path)) return path || "/";
    var p = path + String(window.location.search || "");
    if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
    return p || "/";
  }

  function pathMatches(saved) {
    var cur = pagePath();
    if (!saved) return false;
    if (saved === cur) return true;
    try {
      var sp = String(saved).split("?")[0];
      if (sp.length > 1 && sp.charAt(sp.length - 1) === "/") sp = sp.slice(0, -1);
      return sp === cur;
    } catch (ePm) {
      return false;
    }
  }

  function isReloadNav() {
    try {
      var list = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (list && list[0] && list[0].type) return list[0].type === "reload";
    } catch (e0) {}
    try {
      if (performance.navigation && performance.navigation.type === 1) return true;
    } catch (e1) {}
    try {
      if (sessionStorage.getItem("vc_ptr_reload_v1") === "1") return true;
    } catch (e2) {}
    return false;
  }

  /* violPass2: un solo scrollTo — niente scrollTop×2 + rAF (Forced reflow / rAF Violation) */
  function forceTopNow() {
    try {
      if (typeof window.scrollTo === "function") {
        try {
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        } catch (eInst) {
          window.scrollTo(0, 0);
        }
      }
    } catch (eTop) {}
  }

  /* Sempre spegni restore nativo ASAP — ma NON con hash deeplink (notif → altezza pagina) */
  function isDeepLinkHash() {
    var h = String(location.hash || "").replace(/^#/, "");
    if (!h || h.indexOf("access_token=") === 0) return false;
    return true;
  }
  if (isDeepLinkHash()) {
    try {
      window.__vcHashDeepLinkNav = 1;
      document.documentElement.setAttribute("data-vc-hash-deeplink", "1");
    } catch (eDl) {}
  } else {
    forceTopNow();
  }

  if (!isReloadNav()) return;

  var y = 0;
  try {
    var raw = sessionStorage.getItem("vc_view_state_v1") || sessionStorage.getItem("vc_ptr_scroll_v1");
    if (raw) {
      var data = JSON.parse(raw);
      if (data && pathMatches(data.p)) {
        y = Math.max(0, Math.round(Number(data.y) || 0));
        var at = Number(data.t) || 0;
        if (at && Date.now() - at > 45 * 60 * 1000) y = 0;
      }
    }
  } catch (e1) {}

  if (y >= 2) {
    window.__vcPtrRestoreY = y;
    window.__vcViewStateRestoreY = y;
    window.__vcPtrRestoreTargetY = y;
    try {
      document.documentElement.setAttribute("data-vc-ptr-restore-y", String(y));
      /* boardsScrollSaveGuard1: ancora dedicata, i save a Y=0 non la toccano */
      sessionStorage.setItem(
        "vc_scroll_restore_anchor_v1",
        JSON.stringify({ p: pagePath(), y: y, t: Date.now() }),
      );
    } catch (eAttr) {}
  }

  /* Lock overflow in cima — copre il frame in cui il browser aveva già scrollato a Y */
  try {
    document.documentElement.classList.add("vc-scroll-reload-top-lock");
  } catch (eCls) {}
  if (!document.getElementById("vc-scroll-reload-top-lock-css")) {
    var css = document.createElement("style");
    css.id = "vc-scroll-reload-top-lock-css";
    css.setAttribute("data-vc", "violPass2");
    css.textContent =
      "html.vc-scroll-reload-top-lock,html.vc-scroll-reload-top-lock body{" +
      "overflow:hidden!important;overscroll-behavior:none!important;" +
      "touch-action:none!important;height:100%!important;max-height:100dvh!important}" +
      "html.vc-scroll-reload-top-lock body{position:relative!important;top:0!important;" +
      "left:0!important;right:0!important;margin:0!important}";
    (document.head || document.documentElement).appendChild(css);
  }
  forceTopNow();
  /* violPass2: niente rAF — setTimeout leggero dopo paint */
  window.setTimeout(forceTopNow, 0);
  window.setTimeout(forceTopNow, 48);
})();

/* scrollCueFade1: opacity legata allo scroll (prima del cine defer) */
(function () {
  if (window.__vcScrollCueAwayBoot) return;
  window.__vcScrollCueAwayBoot = 1;
  var CLS = "vc-scrollcue-away";
  var FADE = 140;
  function y() {
    try {
      var se = document.scrollingElement;
      if (se && typeof se.scrollTop === "number" && se.scrollTop > 0) return se.scrollTop;
    } catch (e0) {}
    return (
      window.pageYOffset ||
      (document.documentElement && document.documentElement.scrollTop) ||
      (document.body && document.body.scrollTop) ||
      0
    );
  }
  function opFor(yy) {
    if (yy <= 1) return 1;
    if (yy >= FADE) return 0;
    return Math.max(0, 1 - yy / FADE);
  }
  function hardHideCue(c) {
    if (!c) return;
    try {
      c.classList.add("is-away");
      c.classList.remove("is-fading");
      c.hidden = true;
      c.setAttribute("aria-hidden", "true");
      c.style.setProperty("display", "none", "important");
      c.style.setProperty("opacity", "0", "important");
      c.style.setProperty("visibility", "hidden", "important");
      c.style.setProperty("pointer-events", "none", "important");
      c.style.setProperty("transition", "none", "important");
    } catch (eH) {}
  }
  function pinCues() {
    var body = document.body;
    if (!body) return;
    var cues = document.querySelectorAll(".vc-home-scrollcue");
    for (var i = 0; i < cues.length; i++) {
      var c = cues[i];
      try {
        if (c.parentNode !== body) body.appendChild(c);
        c.classList.add("vc-home-scrollcue--vp");
        c.style.setProperty("position", "fixed", "important");
        c.style.setProperty("top", "auto", "important");
        c.style.setProperty("left", "0", "important");
        c.style.setProperty("right", "0", "important");
        c.style.setProperty("bottom", "calc(0.4rem + env(safe-area-inset-bottom, 0px))", "important");
        c.style.setProperty("transform", "none", "important");
        c.dataset.vcCuePinned = "1";
      } catch (eP) {}
    }
  }
  function sync() {
    pinCues();
    var cues = document.querySelectorAll(".vc-home-scrollcue");
    var op = opFor(y());
    try {
      if (op <= 0.02) document.documentElement.classList.add(CLS);
      else document.documentElement.classList.remove(CLS);
    } catch (eC) {}
    for (var i = 0; i < cues.length; i++) {
      var c = cues[i];
      if (op <= 0.02) {
        hardHideCue(c);
        continue;
      }
      try {
        c.classList.remove("is-away");
        if (op < 0.999) c.classList.add("is-fading");
        else c.classList.remove("is-fading");
        c.hidden = false;
        c.style.setProperty("display", "flex", "important");
        c.style.setProperty("opacity", String(op), "important");
        c.style.setProperty("visibility", "visible", "important");
        c.style.setProperty("pointer-events", op < 0.55 ? "none" : "auto", "important");
        c.style.setProperty("transition", "none", "important");
        c.style.setProperty("position", "fixed", "important");
        c.style.setProperty("transform", "none", "important");
      } catch (eFade) {}
    }
  }
  if (!document.getElementById("vc-scrollcue-away-boot-css")) {
    try {
      var css = document.createElement("style");
      css.id = "vc-scrollcue-away-boot-css";
      css.setAttribute("data-vc", "scrollCueFade1");
      css.textContent =
        "html.vc-scrollcue-away .vc-home-scrollcue," +
        "html.vc-scrollcue-away .vc-home-scrollcue.is-away," +
        "html.vc-scrollcue-away body .vc-home-cine-hero > .vc-home-scrollcue," +
        "html.vc-scrollcue-away body .vc-page-cine-hero > .vc-home-scrollcue{" +
        "display:none!important;opacity:0!important;visibility:hidden!important;" +
        "pointer-events:none!important;transition:none!important;animation:none!important;" +
        "transform:none!important}" +
        ".vc-home-scrollcue.is-fading{pointer-events:none!important}";
      (document.head || document.documentElement).appendChild(css);
    } catch (eCss) {}
  }
  window.addEventListener("scroll", sync, { passive: true, capture: true });
  document.addEventListener("scroll", sync, { passive: true, capture: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      pinCues();
      sync();
    });
  } else {
    pinCues();
    sync();
  }
  window.setTimeout(function () {
    pinCues();
    sync();
  }, 0);
})();
/* violPass2 */
/* notifHashYoYo1 */
/* violPass8 */
/* violPass9 */
/* violPass10 */
/* violPass11 */
/* scrollCueNoFollow1 */
/* scrollCueFade1 */
/* scrollCueBoardsKeep1 */
