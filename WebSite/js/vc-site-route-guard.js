(function () {
  "use strict";
  var cfg = window.__VC_SITE_ROUTES;
  if (!cfg || typeof cfg !== "object") return;

  function normPath(pathname) {
    var p = String(pathname || "/").split("?")[0].split("#")[0];
    p = p.replace(/\/index\.html$/i, "");
    p = p.replace(/\/+$/, "");
    return p || "/";
  }

  function isAssetPath(p) {
    return /\.(css|js|mjs|json|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp4|webm|txt|xml|map|html)$/i.test(p);
  }

  function pathAllowed(p) {
    var paths = cfg.paths;
    if (!Array.isArray(paths)) return false;
    for (var i = 0; i < paths.length; i++) {
      var allowed = normPath(paths[i]);
      if (allowed === p) return true;
    }
    var patterns = cfg.patterns;
    if (!Array.isArray(patterns)) return false;
    for (var j = 0; j < patterns.length; j++) {
      var item = patterns[j];
      if (!item || !item.s) continue;
      try {
        if (new RegExp(item.s, item.f || "").test(p)) return true;
      } catch (e) {}
    }
    return false;
  }

  function pathHidden(p) {
    var hidden = cfg.hidden;
    if (!Array.isArray(hidden)) return false;
    for (var i = 0; i < hidden.length; i++) {
      if (normPath(hidden[i]) === p) return true;
    }
    return false;
  }

  function redirectHome() {
    var home = String(cfg.home || "/").trim() || "/";
    try {
      window.location.replace(home);
    } catch (e) {
      window.location.href = home;
    }
  }

  var path = normPath(window.location.pathname);
  if (isAssetPath(path)) return;
  if (path === normPath(cfg.home)) return;
  if (pathHidden(path) || !pathAllowed(path)) redirectHome();
})();