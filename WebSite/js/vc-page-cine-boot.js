(function () {
  window.__VC_PAGE_CINE_BOOT_RAN = true;
  var root = document.documentElement;
  if (!root || !root.classList.contains("vc-site-polish")) return;

  if (!document.getElementById("vc-anti-fouc-css")) {
    var anti = document.createElement("style");
    anti.id = "vc-anti-fouc-css";
    anti.textContent = "html,body{background:#100c09}";
    (document.head || root).appendChild(anti);
  }

  var path = String(location.pathname || "/").replace(/\/+$/, "") || "/";
  var profileQuery = false;
  try {
    var q = new URLSearchParams(location.search || "");
    profileQuery = /^\d{17,20}$/.test(String(q.get("id") || q.get("userId") || q.get("uid") || "").trim());
  } catch (eQ) {}

  var skipLayoutBoot =
    path === "/" ||
    path.indexOf("/dashboard") === 0 ||
    path.indexOf("/seratafilm") === 0 ||
    path.indexOf("/evento") === 0 ||
    /^\/users?\/\d{17,20}$/.test(path) ||
    /^\/user\/(personalizza|customize|custom)(\/|$)/.test(path) ||
    profileQuery ||
    root.classList.contains("vc-user-profile-pending");

  function markStylesReady() {
    root.classList.add("vc-styles-ready");
  }

  function markReady() {
    root.classList.add("vc-page-cine-ready");
    try {
      document.dispatchEvent(new Event("vc:page-cine-ready"));
    } catch (eReadyEvt) {}
  }

  function finishBoot() {
    markStylesReady();
    markReady();
  }

  function stylesheetPending(link) {
    if (!link) return false;
    try {
      if (link.sheet) {
        if (link.sheet.cssRules && link.sheet.cssRules.length) return false;
        if (link.sheet.rules && link.sheet.rules.length) return false;
      }
    } catch (eSheet) {
      return true;
    }
    return true;
  }

  function waitForCoreStyles(done) {
    var doneCalled = false;
    function finish() {
      if (doneCalled) return;
      doneCalled = true;
      done();
    }
    var needles = ["vc-landing.css", "tw-build.css"];
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    var pending = 0;
    var i;
    for (i = 0; i < links.length; i += 1) {
      var href = String(links[i].getAttribute("href") || links[i].href || "");
      var hit = false;
      var n;
      for (n = 0; n < needles.length; n += 1) {
        if (href.indexOf(needles[n]) !== -1) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
      if (!stylesheetPending(links[i])) continue;
      pending += 1;
      (function (link) {
        function onDone() {
          link.removeEventListener("load", onDone);
          link.removeEventListener("error", onDone);
          pending -= 1;
          if (pending <= 0) finish();
        }
        link.addEventListener("load", onDone);
        link.addEventListener("error", onDone);
      })(links[i]);
    }
    if (pending <= 0) {
      finish();
      return;
    }
    window.setTimeout(finish, 1200);
  }

  try {
    window.__vcWaitForCoreStyles = waitForCoreStyles;
    window.__vcMarkStylesReady = markStylesReady;
  } catch (eExport) {}

  function runLayout() {
    // Users/leaderboard: layout dopo che la griglia è pronta.
    if (typeof window.__vcEnsureCommunityPageCineLayout === "function") {
      window.__vcEnsureCommunityPageCineLayout();
    }
    // Sempre: hero full-viewport + content wrap (FAQ/wiki/regole/…).
    // Prima ensureCommunity tornava true senza layout → pagine “strette” senza spazi/effetti home.
    if (typeof window.__vcPageHeroLayout === "function") {
      window.__vcPageHeroLayout({ force: true });
      return true;
    }
    return false;
  }

  function waitForLayoutThenFinish() {
    if (runLayout()) {
      finishBoot();
      return;
    }
    var tries = 0;
    var timer = window.setInterval(function () {
      tries += 1;
      if (runLayout()) {
        window.clearInterval(timer);
        finishBoot();
        return;
      }
      if (tries > 50) {
        window.clearInterval(timer);
        finishBoot();
      }
    }, 40);
  }

  function afterStyles() {
    if (skipLayoutBoot) {
      finishBoot();
      return;
    }
    waitForLayoutThenFinish();
  }

  if (root.classList.contains("vc-user-leader-pending")) {
    var pendingObs = new MutationObserver(function () {
      if (!root.classList.contains("vc-user-leader-pending")) {
        pendingObs.disconnect();
        root.classList.add("vc-page-cine-boot");
        waitForCoreStyles(afterStyles);
      }
    });
    pendingObs.observe(root, { attributes: true, attributeFilter: ["class"] });
    waitForCoreStyles(function () {});
    return;
  }

  if (!skipLayoutBoot) {
    root.classList.add("vc-page-cine-boot");
    if (!document.getElementById("vc-page-cine-boot-css")) {
      // Solo sfondo: niente overlay nero / visibility:hidden (su mobile
      // aspettare vc-landing.css ~1MB lasciava la pagina nera per secondi).
      var css = "html.vc-site-polish.vc-page-cine-boot,html.vc-site-polish.vc-page-cine-boot body{background:#100c09!important}";
      var style = document.createElement("style");
      style.id = "vc-page-cine-boot-css";
      style.textContent = css;
      (document.head || root).appendChild(style);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      waitForCoreStyles(afterStyles);
    });
  } else {
    waitForCoreStyles(afterStyles);
  }
})();
