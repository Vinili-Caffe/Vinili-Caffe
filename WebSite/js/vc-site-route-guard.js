(function () {
  "use strict";
  var cfg = window.__VC_SITE_ROUTES;
  if (!cfg || typeof cfg !== "object") return;

  
  var DEFAULT_ALIASES = {
    "/richieste": "/staff/pause/",
    "/richieste/stato": "/staff/pause/",
    "/staff/ticket": "/tickets/?view=staff",
    "/staff/tickets": "/tickets/?view=staff",
    "/staff/directory": "/staff/organico/",
    "/staff/valutazioni": "/user/?tab=staff",
    "/staff/profilo": "/user/?tab=staff",
    "/staff/pm": "/staff/organico/",
    "/staff/moderazione": "/staff/organico/",
    "/user/personalizza": "/personalizza/",
    "/user/customize": "/personalizza/?target=rank",
    "/user/custom": "/personalizza/?target=primary",

  function normPath(pathname) {
    var p = String(pathname || "/").split("?")[0].split("#")[0];
    p = p.replace(/\/index\.html$/i, "");
    p = p.replace(/\/+$/, "");
    return p || "/";
  }

  function isAssetPath(p) {
    return /\.(css|js|mjs|json|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp4|webm|txt|xml|map|html)$/i.test(p);
  }

  function mergeAliases() {
    var out = {};
    var k;
    for (k in DEFAULT_ALIASES) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_ALIASES, k)) out[normPath(k)] = DEFAULT_ALIASES[k];
    }
    var extra = cfg.aliases;
    if (extra && typeof extra === "object") {
      for (k in extra) {
        if (!Object.prototype.hasOwnProperty.call(extra, k)) continue;
        var dest = String(extra[k] || "").trim();
        if (!dest) continue;
        out[normPath(k)] = dest;
      }
    }
    return out;
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

  function go(url) {
    var target = String(url || "/").trim() || "/";
    try {
      window.location.replace(target);
    } catch (e) {
      window.location.href = target;
    }
  }

  function nearestAllowedParent(p) {
    if (p === "/" || !p) return "";
    var parts = p.split("/").filter(Boolean);
    while (parts.length > 1) {
      parts.pop();
      var cand = "/" + parts.join("/");
      if (pathAllowed(cand) && !pathHidden(cand)) {
        return cand === "/" ? "/" : cand + "/";
      }
    }
    if (parts.length === 1) {
      var rootSection = "/" + parts[0];
      if (pathAllowed(rootSection) && !pathHidden(rootSection)) {
        return rootSection + "/";
      }
    }
    return "";
  }

  var path = normPath(window.location.pathname);
  if (isAssetPath(path)) return;
  if (path === normPath(cfg.home)) return;

  var aliases = mergeAliases();
  if (aliases[path]) {
    var dest = aliases[path];
    if (path === "/staff/gestione") {
      try {
        var uid = String(new URLSearchParams(window.location.search || "").get("userId") || "").trim();
        if (/^\d{17,20}$/.test(uid)) {
          dest = "/user/?id=" + encodeURIComponent(uid) + "&tab=staff&manage=1";
        }
      } catch (eGest) {}
    }
    go(dest);
    return;
  }

  if (pathHidden(path) || !pathAllowed(path)) {
    var parent = nearestAllowedParent(path);
    go(parent || cfg.home || "/");
  }
})();
