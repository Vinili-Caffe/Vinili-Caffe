(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function currentHashTab() {
    return "";
  }

  function markActiveSidebar() {
    var nav = byId("vc-profile-sidebar");
    var mobileNav = document.querySelector(".vc-profile-mobile-acc");
    var path = "";
    try {
      path = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
    } catch (e0) {
      path = "/";
    }
    var hashTab = currentHashTab();
    var links = [];
    if (nav) links = links.concat(Array.prototype.slice.call(nav.querySelectorAll("a.vc-dashboard-sidebar__link[href]")));
    if (mobileNav) links = links.concat(Array.prototype.slice.call(mobileNav.querySelectorAll("a.vc-profile-mobile-acc__link[href]")));
    var best = null;
    var bestLen = -1;
    var bestHash = null;

    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      a.classList.remove("is-active");
      a.removeAttribute("aria-current");
      var href = "";
      var linkHash = "";
      try {
        var u = new URL(a.getAttribute("href") || "", window.location.origin);
        href = u.pathname.replace(/\/+$/, "") || "/";
        linkHash = String(u.hash || "").replace(/^#/, "").trim().toLowerCase();
      } catch (e1) {
        continue;
      }
      var sidebarTab = String(a.getAttribute("data-tprof-sidebar") || "").trim().toLowerCase();
      if (hashTab && (sidebarTab === hashTab || linkHash === hashTab) && (path === href || path.indexOf(href) === 0)) {
        bestHash = a;
        continue;
      }
      if (linkHash) continue;
      if (path === href || (href !== "/" && path.indexOf(href) === 0)) {
        if (href.length > bestLen) {
          best = a;
          bestLen = href.length;
        }
      }
    }

    // Mark all matching links in both desktop sidebar and mobile strip.
    var activeHref = "";
    var active = bestHash || best;
    if (active) {
      try {
        activeHref = new URL(active.getAttribute("href") || "", window.location.origin).pathname.replace(/\/+$/, "") || "/";
      } catch (e2) {
        activeHref = "";
      }
    }
    for (var j = 0; j < links.length; j++) {
      var link = links[j];
      var linkPath = "";
      try {
        linkPath = new URL(link.getAttribute("href") || "", window.location.origin).pathname.replace(/\/+$/, "") || "/";
      } catch (e3) {
        continue;
      }
      if (activeHref && linkPath === activeHref) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }
    }
  }

  function bindCollapseAfterNav() {
    var root = byId("vc-profile-sidebar");
    if (!root || root.dataset.collapseBound === "1") return;
    root.dataset.collapseBound = "1";
    root.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a.vc-dashboard-sidebar__link") : null;
      if (!a || !root.contains(a)) return;
      root.classList.add("is-force-collapsed");
    });
    root.addEventListener("pointerleave", function () {
      root.classList.remove("is-force-collapsed");
    });
  }

  function boot() {
    markActiveSidebar();
    bindCollapseAfterNav();
    window.addEventListener("hashchange", markActiveSidebar);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.__vcMarkProfileSidebar = markActiveSidebar;
})();
