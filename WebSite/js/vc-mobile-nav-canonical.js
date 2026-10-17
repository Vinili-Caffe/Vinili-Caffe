(function () {
  "use strict";

  var VER = "20261001hamFootOnly1";

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
        .replace(/[?#].*$/, "")
        .replace(/\/index\.html$/i, "")
        .replace(/\/+$/, "") || "/";
    }
  }

  function currentPath() {
    return normPath(window.location.pathname || "/");
  }

  /** Profilo utente (non leaderboard Classifiche): /user/?id=… o /user/ID/ */
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
    if (!target || target === "#") return false;
    // Home tile only — never treat "/" as a prefix match for other pages.
    if (target === "/") return here === "/";
    /* classificheRename1: sul profilo non evidenziare Classifiche. */
    if (target === "/classifiche" || target === "/user" || target === "/users") {
      if (isUserProfileDetailPage()) return false;
      return here === "/classifiche" || here === "/user" || here === "/users";
    }
    if (target === here) return true;
    /* Prefissi solo su sezioni note con sottopagine (match esatto del segmento base). */
    if (target === "/personalizza" && (here === "/personalizza" || here.indexOf("/personalizza/") === 0)) return true;
    if (target === "/appelli" && (here === "/appelli" || here.indexOf("/appelli/") === 0)) return true;
    if (target === "/candidature" && (here === "/candidature" || here.indexOf("/candidature/") === 0)) return true;
    /* hamBachecaDashTiles1: Bacheca hub + sottopagine */
    if (target === "/bacheca" && (here === "/bacheca" || here.indexOf("/bacheca/") === 0)) return true;
    if (target === "/boards" && (here === "/boards" || here.indexOf("/boards/") === 0 || here === "/bacheca" || here.indexOf("/bacheca/") === 0)) return true;
    if (target === "/dashboard" && (here === "/dashboard" || here.indexOf("/dashboard/") === 0)) return true;
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
          /* hamFootOnly1: Bacheca solo nel trio footer, non in PRINCIPALE */
        ],
      },
      {
        title: String(t("nav.support", "Supporta")).toUpperCase(),
        tiles: [
          { href: "/vote/", icon: "fa-thumbs-o-up", label: t("nav.voteServer", "Vota il server"), loading: "vote" },
          { href: "/recensioni/", icon: "fa-star-o", label: t("nav.reviews", "Recensioni") },
          { href: "/donazioni/", icon: "fa-gift", label: t("nav.donations", "Donazioni") },
          { href: "/perks/", icon: "fa-diamond", label: t("nav.perks", "Perks") },
        ],
      },
      {
        title: String(t("nav.community", "Community")).toUpperCase(),
        tiles: [
          { href: "/classifiche/", icon: "fa-trophy", label: t("nav.users", "Classifiche") },
          { href: "/ruoli/", icon: "fa-shield", label: t("nav.roles", "Ruoli") },
          { href: "/regole/", icon: "fa-file-text-o", label: t("nav.rules", "Regole") },
          { href: "/faq/", icon: "fa-question-circle", label: t("nav.faq", "FAQ") },
          { href: "/confessionale/", icon: "fa-comments", label: t("nav.confessionale", "Confessionale") },
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

  function sectionStorageKey(title) {
    return "vc.mobileNav.sec.v2." + String(title || "")
      .toUpperCase()
      .replace(/\s+/g, "_");
  }

  function isPinnedSectionTitle(title) {
    var t = String(title || "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    if (t === "STAFF" || t.indexOf("STAFF") === 0) return false;
    return t === "PRINCIPALE" || t === "SITO" || t === "MAIN";
  }

  function sectionShouldOpen(title, tiles, index) {
    if (isPinnedSectionTitle(title)) return true;
    try {
      var stored = localStorage.getItem(sectionStorageKey(title));
      if (stored === "0") return false;
      if (stored === "1") return true;
    } catch (eStore) {}
    /* hamburgerOpenAll2: tutte le categorie aperte di default */
    return true;
  }

  function bindSectionToggle(details, title) {
    if (!details || isPinnedSectionTitle(title)) return;
    details.addEventListener("toggle", function () {
      try {
        localStorage.setItem(sectionStorageKey(title), details.open ? "1" : "0");
      } catch (eT) {}
    });
  }

  function appendSection(gridRoot, title, tiles, index) {
    if (!gridRoot || !tiles || !tiles.length) return;
    var pinned = isPinnedSectionTitle(title);
    var sec = document.createElement(pinned ? "section" : "details");
    sec.className = "vc-mobile-nav-section" + (pinned ? " vc-mobile-nav-section--pinned" : "");
    if (!pinned && sectionShouldOpen(title, tiles, index || 0)) sec.setAttribute("open", "");
    var h = document.createElement(pinned ? "h3" : "summary");
    h.className = "vc-mobile-nav-section-title";
    var txt = document.createElement("span");
    txt.className = "vc-mobile-nav-section-title__txt";
    txt.textContent = title;
    h.appendChild(txt);
    if (!pinned) {
      var chev = document.createElement("i");
      chev.className = "fa fa-chevron-down vc-mobile-nav-section-chev";
      chev.setAttribute("aria-hidden", "true");
      h.appendChild(chev);
      h.addEventListener("click", function (ev) {
        try {
          if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
          if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
        } catch (ePrev) {}
        try {
          sec.open = !sec.open;
        } catch (eOpen) {}
      });
    }
    var g = document.createElement("div");
    g.className = "vc-mobile-nav-grid";
    var i;
    for (i = 0; i < tiles.length; i += 1) {
      if (tiles[i]) g.appendChild(tiles[i]);
    }
    if (!g.children.length) return;
    sec.appendChild(h);
    sec.appendChild(g);
    if (!pinned) bindSectionToggle(sec, title);
    gridRoot.appendChild(sec);
  }

  function finalizeActiveTiles(gridRoot) {
    if (!gridRoot) return;
    var tiles = gridRoot.querySelectorAll("a.vc-mobile-nav-tile");
    var best = null;
    var bestLen = -1;
    var i;
    for (i = 0; i < tiles.length; i += 1) {
      var a = tiles[i];
      a.classList.remove("is-active");
      try {
        a.removeAttribute("aria-current");
      } catch (eRm) {}
      var href = a.getAttribute("href") || "";
      if (!hrefMatches(href)) continue;
      var len = normPath(href).length;
      if (len > bestLen) {
        best = a;
        bestLen = len;
      }
    }
    if (best) {
      best.classList.add("is-active");
      best.setAttribute("aria-current", "page");
    }
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
      appendSection(gridRoot, sec.title, tiles, s);
    }
    finalizeActiveTiles(gridRoot);
    return true;
  }

  window.__VC_MOBILE_NAV_CANONICAL = {
    ver: VER,
    build: build,
    hrefMatches: hrefMatches,
    normPath: normPath,
    finalizeActiveTiles: finalizeActiveTiles,
    shouldUse: isPublicSitePage,
    isPublicSitePage: isPublicSitePage,
  };
})();
