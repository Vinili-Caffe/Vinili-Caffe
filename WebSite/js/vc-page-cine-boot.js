(function () {
  var root = document.documentElement;
  if (!root || !root.classList.contains("vc-site-polish")) return;

  var path = String(location.pathname || "/").replace(/\/+$/, "") || "/";
  var profileQuery = false;
  try {
    var q = new URLSearchParams(location.search || "");
    profileQuery = /^\d{17,20}$/.test(String(q.get("id") || q.get("userId") || q.get("uid") || "").trim());
  } catch (eQ) {}
  var skip =
    path === "/" ||
    path.indexOf("/dashboard") === 0 ||
    path.indexOf("/seratafilm") === 0 ||
    path.indexOf("/evento") === 0 ||
    /^\/users?\/\d{17,20}$/.test(path) ||
    /^\/user\/(personalizza|customize)(\/|$)/.test(path) ||
    profileQuery ||
    root.classList.contains("vc-user-profile-pending");

  function markReady() {
    root.classList.add("vc-page-cine-ready");
  }

  if (skip) {
    markReady();
    return;
  }

  if (root.classList.contains("vc-user-leader-pending")) {
    var pendingObs = new MutationObserver(function () {
      if (!root.classList.contains("vc-user-leader-pending")) {
        pendingObs.disconnect();
        waitForLayout();
      }
    });
    pendingObs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return;
  }

  root.classList.add("vc-page-cine-boot");

  if (!document.getElementById("vc-page-cine-boot-css")) {
    var css =
      "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready),html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body{background:#100c09!important;overflow:hidden!important;overscroll-behavior:none!important}" +
      "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready)::before{" +
      "content:\"\";position:fixed;inset:0;z-index:2147483000;background:#100c09;pointer-events:none}" +
      "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main," +
      "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer{" +
      "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      "html.vc-site-polish.vc-page-cine-boot .vc-home-cine{position:fixed;inset:0;z-index:0;pointer-events:none;background:#100c09}";
    var style = document.createElement("style");
    style.id = "vc-page-cine-boot-css";
    style.textContent = css;
    (document.head || root).appendChild(style);
  }

  function runLayout() {
    if (typeof window.__vcPageHeroLayout === "function") {
      window.__vcPageHeroLayout();
      return true;
    }
    return false;
  }

  function waitForLayout() {
    if (runLayout()) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (runLayout()) {
        clearInterval(timer);
        return;
      }
      if (tries > 50) {
        clearInterval(timer);
        markReady();
      }
    }, 40);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForLayout);
  } else {
    waitForLayout();
  }
})();
