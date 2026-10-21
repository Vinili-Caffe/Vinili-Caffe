/*! lazyEverywhere1: post-curtain scripts + defer-css; skip lightbox fuori allowlist */
/*! lightboxClean1: post-curtain lazy; skip lightbox fuori dalle route che lo usano */
/*! sitePerfAll1: dopo promote → lazy media pass (img/iframe/video) */
/*! homeBootFast1: home → promote CSS defer SOLO post-sipario (no early unstick) */
/*! assetBloatKill1: skip promote se stem già caricato (inject/HTML) */
/*! assetPageFilter1: skip promote JS/CSS off-path (come apiPageFilter) */
/*! siteOptAll1: + landing-notif/locales/pages-extra gates */
/*! legalDefer1: legal family waits curtain before promoteDeferCss (like home) */
/*! ticketsCritical1: tickets waits curtain before promote page-tickets */
/*! pageCriticalAll1: never early-promote page-* / critical megabundles */
/*! pageDeferRepinFix1: on curtain promote page-* sync (no idle delay) */
(function () {
  var VER = "20261021pageDeferRepinFix1";
  if (window.__vcPostCurtainLazy === VER) return;
  window.__vcPostCurtainLazy = VER;
  var LAZY = "post-curtain";
  var loaded = Object.create(null);

  function canonStem(name) {
    var f = String(name || "").split("/").pop().replace(/\?.*$/, "");
    return f.replace(/\.\d{8}[A-Za-z0-9_-]+(?=\.(?:css|js)$)/i, "");
  }

  function stemAlreadyLoaded(src) {
    var want = canonStem(src);
    if (!want) return false;
    try {
      if (loaded[want]) return true;
      var nodes = document.querySelectorAll("script[src]");
      for (var i = 0; i < nodes.length; i++) {
        var s = String(nodes[i].getAttribute("src") || "");
        if (s && canonStem(s) === want) return true;
      }
    } catch (e) {}
    return false;
  }

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

  /* siteOptAll1 / assetPageFilter1: allowlist per stem — no promote pezzi fuori route */
  function pathAllowsAsset(src) {
    var s = String(src || "");
    if (!s) return false;
    /* landing-notif: solo inject (tap/idle), mai promote da HTML lazy */
    if (/vc-landing-notif/i.test(s)) return false;
    if (/vc-i18n-locales/i.test(s)) return false;
    if (/vc-i18n-pages-extra/i.test(s)) {
      return /^\/(perks|wiki|sponsor|status|seratafilm|bacheca|donazioni|recensioni)(\/|$)/i.test(
        normPath(),
      );
    }
    if (/image-lightbox/i.test(s)) return pathNeedsLightbox(s);
    if (/vc-dialog(\.|$|\?)/i.test(s)) {
      return /^\/(candidature|feedback|tickets|appelli|seratafilm|confessionale|bacheca|dashboard|staff|user|classifiche|notifications)(\/|$)/i.test(
        normPath(),
      );
    }
    if (/vc-form-drafts(\.|$|\?)/i.test(s)) {
      return /^\/(candidature|feedback|tickets|appelli|seratafilm|confessionale|bacheca|dashboard)(\/|$)/i.test(
        normPath(),
      );
    }
    if (/vc-chat-typing(\.|$|\?)/i.test(s)) {
      return /^\/(tickets|confessionale|bacheca|notifications)(\/|$)/i.test(normPath());
    }
    if (/vc-tickets-push-gate(\.|$|\?)/i.test(s)) {
      return /^\/tickets(\/|$)/i.test(normPath());
    }
    if (/vc-mini-pager(\.|$|\?)/i.test(s)) {
      return /^\/(tickets|bacheca|staff\/compiti|dashboard)(\/|$)/i.test(normPath());
    }
    if (/vc-type-sfx(\.|$|\?)/i.test(s)) {
      return /^\/(candidature|confessionale|feedback|tickets|appelli|seratafilm|bacheca|dashboard|personalizza|staff\/compiti)(?=\/|$)/i.test(
        normPath(),
      );
    }
    if (/vc-kick-pip|vc-twitch-pip|live-stats|vc-home-boot-gate|vc-home-sw-cache-guard|vc-live-config/i.test(s)) {
      return normPath() === "/";
    }
    if (/vc-landing(\.|$|\?)/i.test(s) && !/vc-landing-notif/i.test(s)) {
      var p = normPath();
      if (p === "/") return true;
      return /^\/(user|classifiche|vote|tickets|perks|personalizza|confessionale|notifications|bacheca|seratafilm|puzzle|donazioni)(\/|$)/i.test(
        p,
      );
    }
    return true;
  }

  function inject(src, attrs) {
    try {
      if (!src || loaded[src]) return;
      if (!pathAllowsAsset(src)) return;
      /* assetBloatKill1: bare+stamped / inject già fatto → no 2ª GET */
      if (stemAlreadyLoaded(src)) {
        loaded[canonStem(src)] = 1;
        loaded[src] = 1;
        return;
      }
      loaded[src] = 1;
      loaded[canonStem(src)] = 1;
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

  function isPageMegabundleHref(href) {
    return /vc-page-|seratafilm-page|vc-(home|tickets|legal|cine-public|bacheca|staff|dashboard|misc|profile)-critical/i.test(
      String(href || ""),
    );
  }

  function promoteDeferCss(opts) {
    try {
      var secondaryOnly = !!(opts && opts.secondaryOnly);
      var links = document.querySelectorAll('link[data-vc-defer-css="' + LAZY + '"][rel="stylesheet"]');
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        try {
          if (link.media === "all") continue;
          if (secondaryOnly && isPageMegabundleHref(link.href || link.getAttribute("href"))) {
            continue;
          }
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
        if (!pathAllowsAsset(src)) {
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

  function isHomePath() {
    try {
      var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
      return p === "/" || p === "/index.html";
    } catch (eH) {
      return false;
    }
  }

  function isLegalPath() {
    try {
      var p = String(location.pathname || "/")
        .replace(/\/index\.html$/i, "")
        .replace(/\/+$/, "") || "/";
      return /\/(privacy|terms|cookie|copyright|dati|regole)(\/|$)/i.test(p);
    } catch (eL) {
      return false;
    }
  }

  /* pageCriticalAll1: early promote solo CSS secondari — mai page-* megabundle */
  try {
    promoteDeferCss({ secondaryOnly: true });
    window.setTimeout(function () {
      promoteDeferCss({ secondaryOnly: true });
    }, 0);
    window.setTimeout(function () {
      promoteDeferCss({ secondaryOnly: true });
    }, 200);
  } catch (eEarlyCss) {}
  function arm() {
    if (window.__vcPostCurtainLazyArmed) return;
    window.__vcPostCurtainLazyArmed = 1;
    function go() {
      if (window.__vcPostCurtainLazyDone) return;
      window.__vcPostCurtainLazyDone = 1;
      /* pageDeferRepinFix1: promote page-* subito al curtain (idle lasciava look nudo) */
      try {
        promoteDeferCss();
      } catch (eSync) {}
      try {
        if (window.requestIdleCallback) {
          window.requestIdleCallback(function () { promoteAll(); }, { timeout: 400 });
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
      document.addEventListener("vc:cine-curtain-off", go, { once: true });
      document.addEventListener("vc:page-cine-ready", go, { once: true });
      /* pageCriticalAll1: soft-fx-ready non promuove page-* (resta secondaryOnly early) */
      document.addEventListener(
        "vc:soft-fx-ready",
        function () {
          try {
            promoteDeferCss({ secondaryOnly: true });
          } catch (eSoft) {}
        },
        { once: true },
      );
    } catch (eLis) {}
    /* failsafe — full promote (incl. page-*) */
    window.setTimeout(go, isHomePath() || isLegalPath() ? 2800 : 2200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arm, { once: true });
  } else {
    arm();
  }
})();
