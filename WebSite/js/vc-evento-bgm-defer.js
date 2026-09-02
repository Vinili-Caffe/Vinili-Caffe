(function () {
    var VER = "20260831eventoBgmFix1";
  var loaded = false;

  function prefix() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = String(scripts[i].getAttribute("src") || scripts[i].src || "");
      var idx = src.indexOf("vc-evento-bgm-defer.js");
      if (idx === -1) continue;
      var base = src.slice(0, idx);
      if (base.endsWith("js/")) return base;
      if (base.endsWith("/")) return base + "js/";
      return base + "/js/";
    }
    return "/js/";
  }

  function loadScript(src, next) {
    var s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.onload = function () {
      if (next) next();
    };
    s.onerror = function () {
      if (next) next();
    };
    (document.head || document.documentElement).appendChild(s);
  }

  function bootBgm() {
    if (loaded) return;
    loaded = true;
    var p = prefix();
    loadScript(p + "vc-chrome-sync.js?v=" + VER, function () {
      loadScript(p + "vc-youtube-iframe-api.js?v=" + VER, function () {
        loadScript(p + "hogwarts-bgm-youtube.js?v=" + VER, function () {
          loadScript(p + "hogwarts-theme-bg.js?v=" + VER, function () {
            try {
              if (window.__vcHogwartsYoutubeSetupIfConfigured) {
                window.__vcHogwartsYoutubeSetupIfConfigured();
              }
            } catch (eSetup) {}
          });
        });
      });
    });
  }

  function schedule() {
    try {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(bootBgm, { timeout: 4500 });
        return;
      }
    } catch (eIdle) {}
    window.setTimeout(bootBgm, 1500);
  }

  document.addEventListener("pointerdown", bootBgm, { once: true, passive: true });
  document.addEventListener("keydown", bootBgm, { once: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }
})();
