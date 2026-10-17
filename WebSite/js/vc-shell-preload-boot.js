/**
 * breatheFast1 / shellCache1: preload sfondo still + prefetch CSS shell in idle.
 * Marker: 20261011allPagesConsole1
 */
(function () {
  if (window.__vcShellPreloadBoot) return;
  window.__vcShellPreloadBoot = 1;

  var BG_V = "20260929cpuIdleHard1";
  var SOFT_FX_V = "20261010wmUlSingleBar2b";
  var POLISH_V = "20261009cueMarginBar1";
  var STILL_DESKTOP = "/images/sfondo-still.webp?v=" + BG_V;
  var STILL_MOBILE = "/images/sfondo-mobile-still.webp?v=" + BG_V;

  function hasLink(rel, href) {
    try {
      var links = document.querySelectorAll('link[rel="' + rel + '"]');
      for (var i = 0; i < links.length; i++) {
        if (String(links[i].href || "").indexOf(href.split("?")[0]) !== -1) return true;
      }
    } catch (e) {}
    return false;
  }

  function addLink(rel, as, href, opts) {
    if (!href || hasLink(rel, href)) return;
    try {
      var l = document.createElement("link");
      l.rel = rel;
      if (as) l.as = as;
      l.href = href;
      if (opts && opts.fetchpriority) l.setAttribute("fetchpriority", opts.fetchpriority);
      if (opts && opts.type) l.type = opts.type;
      (document.head || document.documentElement).appendChild(l);
    } catch (eAdd) {}
  }

  function isMobile() {
    try {
      if (window.matchMedia && window.matchMedia("(max-width:639.98px)").matches) return true;
      if (window.matchMedia && window.matchMedia("(pointer:coarse)").matches) return true;
    } catch (eM) {}
    return false;
  }

  var still = isMobile() ? STILL_MOBILE : STILL_DESKTOP;
  addLink("preload", "image", still, { fetchpriority: "high", type: "image/webp" });

  var shellCss = [
    "/css/vc-landing-core.css?v=20261005scrollCueInstantHide1",
    "/css/vc-landing-ext.css?v=20261004schedaBootCue1",
    "/css/vc-soft-fx." + SOFT_FX_V + ".css?v=" + SOFT_FX_V,
    "/css/vc-chrome-polish." + POLISH_V + ".css?v=" + POLISH_V
  ];

  function idlePrefetch() {
    for (var i = 0; i < shellCss.length; i++) {
      addLink("prefetch", null, shellCss[i]);
    }
    try {
      var img = new Image();
      img.decoding = "async";
      img.src = still;
    } catch (eImg) {}
  }

  /* violKillIdle1: setTimeout — rIC({timeout}) → Violation idle */
  try {
    window.setTimeout(idlePrefetch, 280);
  } catch (eIdle) {
    window.setTimeout(idlePrefetch, 280);
  }
})();
