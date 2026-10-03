/**
 * ptr-scroll-restore-boot: target Y + top lock solo su reload (scrollReloadNoYank1).
 * notifHashYoYo1: con hash deeplink (click notifica) NON forzare top — altrimenti yo-yo su/giù.
 * violPass12: un solo scrollTo — niente scrollTop×2 + rAF (Forced reflow storm).
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

  function isDeepLinkHash() {
    var h = String(location.hash || "").replace(/^#/, "");
    if (!h || h.indexOf("access_token=") === 0) return false;
    return true;
  }

  function markDeepLinkNav() {
    try {
      window.__vcHashDeepLinkNav = 1;
      document.documentElement.setAttribute("data-vc-hash-deeplink", "1");
    } catch (eM) {}
  }

  function forceTopNow() {
    /* violPass12: SOLO scrollTo — scrollTop/rAF forzavano reflow a raffica */
    try {
      window.scrollTo(0, 0);
    } catch (eTop) {}
  }

  if (!isReloadNav()) {
    /* notifHashYoYo1: navigazione da notifica con #target → non azzerare */
    if (isDeepLinkHash()) markDeepLinkNav();
    else forceTopNow();
    return;
  }

  try {
    if (!(window.__vcPtrRestoreTargetY || window.__vcPtrRestoreY)) {
      var raw =
        sessionStorage.getItem("vc_view_state_v1") || sessionStorage.getItem("vc_ptr_scroll_v1");
      if (raw) {
        var data = JSON.parse(raw);
        if (data && pathMatches(data.p)) {
          var y = Math.max(0, Math.round(Number(data.y) || 0));
          var at = Number(data.t) || 0;
          if (!(at && Date.now() - at > 45 * 60 * 1000) && y >= 2) {
            window.__vcPtrRestoreY = y;
            window.__vcPtrRestoreTargetY = y;
            document.documentElement.setAttribute("data-vc-ptr-restore-y", String(y));
            try {
              sessionStorage.setItem(
                "vc_scroll_restore_anchor_v1",
                JSON.stringify({ p: pagePath(), y: y, t: Date.now() }),
              );
            } catch (eAnchor) {}
          }
        }
      }
    }
  } catch (e1) {}

  try {
    document.documentElement.classList.add("vc-scroll-reload-top-lock");
  } catch (eCls) {}
  if (!document.getElementById("vc-scroll-reload-top-lock-css")) {
    var css = document.createElement("style");
    css.id = "vc-scroll-reload-top-lock-css";
    css.setAttribute("data-vc", "violPass12");
    css.textContent =
      "html.vc-scroll-reload-top-lock,html.vc-scroll-reload-top-lock body{" +
      "overflow:hidden!important;overscroll-behavior:none!important;" +
      "touch-action:none!important;height:100%!important;max-height:100dvh!important}" +
      "html.vc-scroll-reload-top-lock body{position:relative!important;top:0!important;" +
      "left:0!important;right:0!important;margin:0!important}";
    (document.head || document.documentElement).appendChild(css);
  }
  forceTopNow();
  /* violPass12: macrotask leggero invece di rAF (era Violation rAF ~129ms) */
  window.setTimeout(forceTopNow, 0);
})();
/* notifHashYoYo1 */
/* violPass12 */
