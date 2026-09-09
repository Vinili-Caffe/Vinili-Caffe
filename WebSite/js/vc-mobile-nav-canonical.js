(function () {
  "use strict";

  var VER = "20260907recensioniNav1";

  function t(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v != null && String(v) !== "" && String(v) !== key) return String(v);
      }
    } catch (e) {}
    return fallback;
  }

  function normPath(raw) {
    try {
      var u = new URL(String(raw || ""), window.location.origin);
      return String(u.pathname || "/")
        .replace(/\/index\.html$/i, "")
        .replace(/\/+$/, "") || "/";
    } catch (e) {
      return String(raw || "")
        .replace(/^https?:\/\/[^/]+/i, "")
        .replace(/\/index\.html$/i, "")
        .replace(/\/+$/, "") || "/";
    }
  }

  function currentPath() {
    return normPath(window.location.pathname || "/");
  }

  /** Profilo utente (non leaderboard Users): /user/?id=… o /user/ID/ */
  function profileDetailUserId() {
    try {
      var here = currentPath();
      var m = String(here || "").match(/^\/users?\/(\d{17,22})$/);
      if (m) return m[1];
      if (here === "/user" || here === "/users") {
        var q = new URLSearchParams(window.location.search || "");
        var id = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
        if (/^\d{17,22}$/.test(id)) return id;
      }
    } catch (e) {}
    return "";
  }

  function isUserProfileDetailPage() {
    return Boolean(profileDetailUserId());
  }

  function hrefMatches(href) {
    var target = normPath(href);
    var here = currentPath();
    if (!target) return false;
    // Home tile only — never treat "/" as a prefix match for other pages.
    if (target === "/") return here === "/";
    /* mobileNavProfileActive1: sul profilo non evidenziare Users. */
    if (target === "/user" || target === "/users") {
      if (isUserProfileDetailPage()) return false;
      return here === "/user" || here === "/users";
    }
    if (target === here) return true;
    if (target === "/personalizza" && here.indexOf("/personalizza") === 0) return true;
    if (target === "/appelli" && here.indexOf("/appelli") === 0) return true;
    if (target === "/candidature" && here.indexOf("/candidature") === 0) return true;
    return false;
  }

  function isPublicSitePage() {
    try {
      if (document.body && document.body.classList.contains("vc-dashboard-page")) return false;
      if (document.body && document.body.classList.contains("vc-hw-page")) return false;
      if (document.body && document.body.classList.contains("vc-staff-page")) return false;
      var path = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
      if (path === "/dashboard" || path.indexOf("/dashboard/") === 0) return false;
      if (path === "/staff" || path.indexOf("/staff/") === 0) return false;
      if (path === "/evento" || path.indexOf("/evento/") === 0) return false;
    } catch (e) {}
    return true;
  }

  function sections() {
    return [
      {
        title: "PRINCIPALE",
        tiles: [
          { href: "/wiki/", icon: "fa-map-o", label: t("nav.wiki", "Wiki") },
          { href: "/sponsor/", icon: "fa-handshake-o", label: t("nav.sponsor", "Sponsor") },
        ],
      },
      {
        title: String(t("nav.support", "Supporta")).toUpperCase(),
        tiles: [
          { href: "/vote/", icon: "fa-thumbs-o-up", label: t("nav.voteServer", "Vota il server"), loading: "vote" },
          { href: "/recensioni/", icon: "fa-star-o", label: t("nav.reviews", "Recensioni") },
          { href: "/donazioni/", icon: "fa-heart-o", label: t("nav.donations", "Donazioni") },
          { href: "/perks/", icon: "fa-diamond", label: t("nav.perks", "Perks") },
        ],
      },
      {
        title: String(t("nav.community", "Community")).toUpperCase(),
        tiles: [
          { href: "/user/", icon: "fa-users", label: t("nav.users", "Users") },
          { href: "/ruoli/", icon: "fa-shield", label: t("nav.roles", "Ruoli") },
          { href: "/regole/", icon: "fa-file-text-o", label: t("nav.rules", "Regole") },
          { href: "/faq/", icon: "fa-question-circle", label: t("nav.faq", "FAQ") },
        ],
      },
      {
        title: String(t("nav.requests", "Richieste")).toUpperCase(),
        tiles: [
          { href: "/appelli/", icon: "fa-balance-scale", label: t("nav.appeals", "Appelli") },
          { href: "/candidature/", icon: "fa-file-text-o", label: t("nav.applications", "Candidature") },
          { href: "/feedback/", icon: "fa-commenting-o", label: t("nav.suggestions", "Feedback") },
          { href: "/tickets/", icon: "fa-ticket", label: t("nav.tickets", "Tickets") },
        ],
      },
    ];
  }

  function onTileClick(ev, a) {
    try {
      if (window.__vcMobileNavClose) window.__vcMobileNavClose({ skipFocusRestore: true });
    } catch (eClose) {}
    var hrefAttr = String(a.getAttribute("href") || "").trim();
    if (!hrefAttr || hrefAttr.charAt(0) === "#") return;
    if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)) return;
    if (ev && typeof ev.button === "number" && ev.button !== 0) return;
    if (String(a.getAttribute("target") || "").toLowerCase() === "_blank") return;
    try {
      if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    } catch (ePrev) {}
    try {
      window.location.assign(a.href || hrefAttr);
    } catch (eGo) {
      window.location.href = hrefAttr;
    }
  }

  function createTile(spec) {
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    var href = String((spec && spec.href) || "").trim() || "#";
    a.setAttribute("href", href);
    a.href = href;
    if (spec.loading) a.setAttribute("data-vc-loading", spec.loading);
    if (hrefMatches(href)) {
      a.classList.add("is-active");
      a.setAttribute("aria-current", "page");
    }
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = '<i class="fa ' + spec.icon + '"></i>';
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    lab.textContent = spec.label;
    a.appendChild(ico);
    a.appendChild(lab);
    a.addEventListener("click", function (ev) {
      onTileClick(ev, a);
    });
    return a;
  }

  function appendSection(gridRoot, title, tiles) {
    if (!gridRoot || !tiles || !tiles.length) return;
    var sec = document.createElement("section");
    sec.className = "vc-mobile-nav-section";
    var h = document.createElement("h3");
    h.className = "vc-mobile-nav-section-title";
    h.textContent = title;
    var g = document.createElement("div");
    g.className = "vc-mobile-nav-grid";
    var i;
    for (i = 0; i < tiles.length; i += 1) {
      if (tiles[i]) g.appendChild(tiles[i]);
    }
    if (!g.children.length) return;
    sec.appendChild(h);
    sec.appendChild(g);
    gridRoot.appendChild(sec);
  }

  function build(gridRoot) {
    if (!gridRoot) return false;
    gridRoot.innerHTML = "";
    var secs = sections();
    var s;
    for (s = 0; s < secs.length; s += 1) {
      var sec = secs[s];
      var tiles = [];
      var tIdx;
      for (tIdx = 0; tIdx < sec.tiles.length; tIdx += 1) {
        tiles.push(createTile(sec.tiles[tIdx]));
      }
      appendSection(gridRoot, sec.title, tiles);
    }
    return true;
  }

  window.__VC_MOBILE_NAV_CANONICAL = {
    ver: VER,
    build: build,
    hrefMatches: hrefMatches,
    normPath: normPath,
    shouldUse: isPublicSitePage,
    isPublicSitePage: isPublicSitePage,
  };
})();
