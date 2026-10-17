/*! lazyEverywhere1: post-curtain scripts + defer-css; skip lightbox fuori allowlist */
/*! lightboxClean1: post-curtain lazy; skip lightbox fuori dalle route che lo usano */
/*! sitePerfAll1: dopo promote → lazy media pass (img/iframe/video) */
(function () {
  var VER = "20261016sitePerfAll1";
  if (window.__vcPostCurtainLazy === VER) return;
  window.__vcPostCurtainLazy = VER;
  var LAZY = "post-curtain";
  var loaded = Object.create(null);

  function normPath() {
    try {
      var path = String(location.pathname || "/")
        .replace(/\/index\.html$/i, "")
        .replace(/\/+$/, "");
      if (!path) path = "/";
      path = path.replace(/^\/(en|it)(?=\/|$)/i, "") || "/";
      return path;
    } catch (e) {
      return "/";
    }
  }

  function pathNeedsLightbox(src) {
    if (!/image-lightbox/i.test(String(src || ""))) return true;
    return /^\/(confessionale|bacheca|feedback|recensioni|staff|user|classifiche|tickets)(\/|$)/i.test(
      normPath(),
    );
  }

  function inject(src, attrs) {
    try {
      if (!src || loaded[src]) return;
      if (!pathNeedsLightbox(src)) return;
      loaded[src] = 1;
      if (document.querySelector('script[src="' + src.replace(/"/g, "") + '"]')) return;
      var s = document.createElement("script");
      s.src = src;
      s.defer = true;
      if (attrs) {
        Object.keys(attrs).forEach(function (k) {
          s.setAttribute(k, attrs[k]);
        });
      }
      (document.body || document.documentElement).appendChild(s);
    } catch (e) {}
  }

  function promoteDeferCss() {
    try {
      var links = document.querySelectorAll('link[data-vc-defer-css="' + LAZY + '"][rel="stylesheet"]');
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        try {
          if (link.media === "all") continue;
          link.media = "all";
          link.removeAttribute("data-vc-defer-css");
        } catch (eL) {}
      }
    } catch (eCss) {}
  }

  function promoteAll() {
    try {
      promoteDeferCss();
    } catch (eCss2) {}
    try {
      var nodes = document.querySelectorAll('script[type="text/plain"][data-vc-lazy="' + LAZY + '"]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var src = el.getAttribute("data-src") || el.getAttribute("data-vc-src") || "";
        if (!src) continue;
        if (!pathNeedsLightbox(src)) {
          try {
            el.parentNode && el.parentNode.removeChild(el);
          } catch (eSkip) {}
          continue;
        }
        inject(src, { "data-vc-lazy-promoted": LAZY });
        try {
          el.parentNode && el.parentNode.removeChild(el);
        } catch (eRm) {}
      }
    } catch (eAll) {}
    try {
      document.dispatchEvent(new CustomEvent("vc:post-curtain-lazy", { detail: { ver: window.__vcPostCurtainLazy } }));
    } catch (eEv) {}
  }

  function ready() {
    try {
      var r = document.documentElement;
      return (
        r.classList.contains("vc-cine-curtain-off") ||
        r.classList.contains("vc-page-cine-ready") ||
        r.classList.contains("vc-styles-ready")
      );
    } catch (e) {
      return true;
    }
  }

  function arm() {
    if (window.__vcPostCurtainLazyArmed) return;
    window.__vcPostCurtainLazyArmed = 1;
    function go() {
      if (window.__vcPostCurtainLazyDone) return;
      window.__vcPostCurtainLazyDone = 1;
      try {
        if (window.requestIdleCallback) {
          window.requestIdleCallback(function () { promoteAll(); }, { timeout: 900 });
        } else {
          window.setTimeout(promoteAll, 0);
        }
      } catch (eGo) {
        promoteAll();
      }
    }
    if (ready()) {
      window.setTimeout(go, 50);
      return;
    }
    try {
      document.addEventListener("vc:page-cine-ready", go, { once: true });
      document.addEventListener("vc:soft-fx-ready", go, { once: true });
    } catch (eLis) {}
    window.setTimeout(go, 2200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arm, { once: true });
  } else {
    arm();
  }
})();
