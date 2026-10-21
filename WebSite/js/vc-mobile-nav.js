(function () {
  /* hamFootSoon1: footer trio + Bacheca/Dashboard soon come PC */
  /* hamEsciFull1: Esci hamburger sempre full-width sotto il trio */
  /* bachecaHamGuestHide1: (superseded) */
  /* hamBachecaDashTiles1: (superseded by hamFootOnly1) */
  /* boardsHamNav1: su /bacheca phone → snav nascosta, Esplora/Pubblica/Le mie in hamburger */
  /* boardsHamPages1: hamburger bacheca = SOLO pagine boards (come PC), non categoria vuota */
  "use strict";
  /* mobileNavProfileCache1: first-paint profile from me-cache + prefer landing syncFooter */
  /* staffCompitiNavEverywhere1: always ensure Compiti tile next to Guida/Confessionale */
  /* staffNavFix1: always run — landing no longer exclusive-owns the hamburger */
  /* hamburgerOpenAll1: categorie aperte di default + persist chiusura in localStorage */
  /* cpuIdleCut1: prewarm solo mobile, dopo visual-ready, idle vero (no timeout 2.5s in boot) */
  /* consoleFixAll1: coalesce auth events → un solo rebuild (no 13–17s Violation storm) */
  window.__vcMobileNavStandalone = true;
  try {
    window.__vcLandingMobileNavActive = false;
  } catch (eClr) {}

  var DRAWER_ID = "vc-mobile-nav-drawer";
  var TOGGLE_ID = "vc-mobile-nav-toggle";
  var BODY_OPEN_CLASS = "vc-mobile-nav-open";
  var mq = null;
  var drawer = null;
  /* uiOpenCold1: skip rebuildGrid al click se già prewarmed */
  var gridDirty = true;
  var toggle = null;
  var backdrop = null;
  var focusPrev = null;
  var onEscapeDrawer = null;
  var authRebuildTimer = 0;
  function scheduleAuthRebuild(opts) {
    opts = opts || {};
    gridDirty = true;
    if (authRebuildTimer) return;
    authRebuildTimer = window.setTimeout(function () {
      authRebuildTimer = 0;
      function run() {
        try {
          if (opts.ensure) ensure();
          rebuildGrid();
          gridDirty = false;
          if (opts.removeDash !== false) removeHeaderDashboardBtn();
          if (opts.footer) syncDrawerFooter();
        } catch (eRun) {}
      }
      try {
        if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
        else run();
      } catch (eRaf) {
        run();
      }
    }, 48);
  }

  function getMq() {
    if (!mq) {
      mq = window.matchMedia("(max-width: 1199.98px)");
    }
    return mq;
  }

  function isMobile() {
    try {
      return getMq().matches;
    } catch (e) {
      return (window.innerWidth || 999) <= 1200;
    }
  }

  function closeNotifDropdown() {
    var d = document.getElementById("vc-notif-dropdown");
    if (d) d.removeAttribute("open");
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("vc-mobile-nav-drawer--open");
    drawer.setAttribute("aria-hidden", "true");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    try {
      document.documentElement.classList.remove(BODY_OPEN_CLASS);
    } catch (e0) {}
    /* navMobileShadowClose1: unlock scroll non deve lasciare alone scrolled sulla pill */
    try {
      var y =
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        0;
      var shell = document.querySelector("header .vc-nav-shell");
      if (shell && y <= 12) {
        shell.classList.remove("vc-nav-shell--scrolled");
        document.documentElement.classList.remove("vc-nav-shell-scrolled");
      }
    } catch (eNavScr) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSyncClose) {}
    if (onEscapeDrawer) {
      document.removeEventListener("keydown", onEscapeDrawer);
      onEscapeDrawer = null;
    }
    if (focusPrev && typeof focusPrev.focus === "function") {
      try {
        focusPrev.focus();
      } catch (e1) {}
    }
    focusPrev = null;
  }

  function openDrawer() {
    if (!drawer) return;
    mountDrawer(drawer);
    closeNotifDropdown();
        drawer.classList.add("vc-mobile-nav-drawer--open");
    drawer.setAttribute("aria-hidden", "false");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
    focusPrev = document.activeElement;
    try {
      document.documentElement.classList.add(BODY_OPEN_CLASS);
    } catch (e2) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSyncOpen) {}
    /* uiOpenCold1: rebuild solo se dirty (prewarm idle); open = class + focus */
    if (gridDirty) {
      window.requestAnimationFrame(function () {
        try {
          rebuildGrid();
          syncDrawerFooter();
          gridDirty = false;
        } catch (eRebuild) {}
      });
    }
    onEscapeDrawer = function (ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeDrawer();
      }
    };
    document.addEventListener("keydown", onEscapeDrawer);
    var closeBtn = document.getElementById("vc-mobile-nav-close");
    if (closeBtn) {
      window.requestAnimationFrame(function () {
        try {
          closeBtn.focus();
        } catch (e3) {}
      });
    }
  }

  function mobileAvatarUrl(u) {
    try {
      var server = window.__VC_SERVER_IDENTITY;
      if (server && server.avatarUrl && (!u || !u.id || String(server.userId || "") === String(u.id || "") || !server.userId)) {
        var serverUrl = String(server.avatarUrl || "").trim();
        if (/^https?:\/\//i.test(serverUrl)) {
          if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.resolveUrl === "function") {
            return window.VcDiscordAvatar.resolveUrl(serverUrl, 64, server.memberAvatar || "", u && u.id) || serverUrl;
          }
          return serverUrl;
        }
      }
    } catch (eServer) {}
    if (!u || !u.id) return "";
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.buildFromUser === "function") {
        var built = window.VcDiscordAvatar.buildFromUser(u, 64);
        if (built) return built;
      }
    } catch (eBuilt) {}
    if (u.avatar) {
      var ext = String(u.avatar).indexOf("a_") === 0 ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + "." + ext + "?size=64";
    }
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        return window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eFb) {}
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function mobileAccountDisplayName(profile) {
    try {
      var server = window.__VC_SERVER_IDENTITY;
      if (server && String(server.displayName || "").trim()) {
        if (!profile || !profile.id || String(server.userId || "") === String(profile.id || "") || !server.userId) {
          return String(server.displayName).trim();
        }
      }
    } catch (eN) {}
    try {
      if (window.VcDiscordIdentity && typeof window.VcDiscordIdentity.pickDisplayName === "function") {
        return window.VcDiscordIdentity.pickDisplayName(profile, "Utente");
      }
    } catch (eP) {}
    return String((profile && (profile.global_name || profile.username)) || "Utente").trim() || "Utente";
  }

  function readCachedDiscordUserId() {
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (!t || (exp && Date.now() >= exp)) return "";
      var fp = exp + "|" + String(t).slice(0, 32);
      var raw = sessionStorage.getItem("vc_discord_me_cache_v1");
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.v === 1 && o.user && String(o.fp || "") === fp) {
          var uid = String(o.user.id || "").trim();
          if (/^\d{17,22}$/.test(uid)) return uid;
        }
      }
      var uidRaw = localStorage.getItem("vc_discord_uid_v1");
      if (uidRaw) {
        var uo = JSON.parse(uidRaw);
        if (uo && String(uo.fp || "") === fp && /^\d{17,22}$/.test(String(uo.uid || ""))) return String(uo.uid);
      }
    } catch (eCache) {}
    return "";
  }

  function resolveMobileAccountUserId(userId) {
    var id = String(userId || "").trim();
    if (/^\d{17,22}$/.test(id)) return id;
    try {
      var profile = window.__VC_DISCORD_PROFILE;
      var fromProfile = String(profile && profile.id || "").trim();
      if (/^\d{17,22}$/.test(fromProfile)) return fromProfile;
    } catch (eP) {}
    try {
      var menuUser = window.__VC_ACCOUNT_MENU_USER;
      var fromMenu = String(menuUser && menuUser.id || "").trim();
      if (/^\d{17,22}$/.test(fromMenu)) return fromMenu;
    } catch (eMenu) {}
    return readCachedDiscordUserId();
  }

  function mobileProfileHref(userId) {
    var id = resolveMobileAccountUserId(userId);
    /* profileHrefNoLeaderboard1: mai classifica /user senza id */
    return id ? "/user/?id=" + encodeURIComponent(id) : "#";
  }

  function mobileProfileDetailUserId() {
    try {
      var path = String(window.location.pathname || "/")
        .replace(/\/index\.html$/i, "")
        .replace(/\/+$/, "") || "/";
      var m = path.match(/^\/users?\/(\d{17,22})$/i);
      if (m) return m[1];
      if (path === "/user" || path === "/users") {
        var q = new URLSearchParams(window.location.search || "");
        var id = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
        if (/^\d{17,22}$/.test(id)) return id;
      }
    } catch (e) {}
    return "";
  }

  function isMobileOwnProfileCurrent(userId) {
    var id = resolveMobileAccountUserId(userId);
    var viewing = mobileProfileDetailUserId();
    return Boolean(id && viewing && id === viewing);
  }

  function readCachedProfileForMobile() {
    try {
      var token = String(localStorage.getItem("vc_discord_access_token") || "").trim();
      if (!token) return null;
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return null;
      var fp = String(exp) + "|" + token.slice(0, 32);
      var now = Date.now();
      var keys = [
        ["sessionStorage", "vc_discord_me_cache_v1", 180000],
        ["localStorage", "vc_discord_me_cache_local_v1", 7 * 24 * 60 * 60 * 1000],
      ];
      for (var i = 0; i < keys.length; i += 1) {
        var store = keys[i][0] === "sessionStorage" ? sessionStorage : localStorage;
        var raw = store.getItem(keys[i][1]);
        if (!raw) continue;
        var o = JSON.parse(raw);
        var age = now - Number((o && o.at) || 0);
        if (
          o &&
          o.v === 1 &&
          o.user &&
          String(o.fp || "") === fp &&
          isFinite(age) &&
          age >= 0 &&
          age <= keys[i][2]
        ) {
          return o.user;
        }
      }
    } catch (eCache) {}
    return null;
  }

  function isBachecaNavHref(href) {
    try {
      var p = String(href || "")
        .replace(/^https?:\/\/[^/]+/i, "")
        .replace(/[?#].*$/, "")
        .replace(/\/index\.html$/i, "")
        .replace(/\/+$/, "") || "/";
      return (
        p === "/bacheca" ||
        p.indexOf("/bacheca/") === 0 ||
        p === "/boards" ||
        p.indexOf("/boards/") === 0
      );
    } catch (e) {
      return false;
    }
  }

  function isBachecaNavLabel(label) {
    var t = String(label || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return t === "bacheca" || t === "boards" || t === "board";
  }

  /* hamFootOnly1: togli Bacheca (+ Dashboard) dalla griglia PRINCIPALE */
  function stripBachecaTilesFromGrid(gridRoot) {
    if (!gridRoot) return;
    try {
      var nodes = gridRoot.querySelectorAll(
        'a[data-vc-mobile-bacheca], a[data-vc-mobile-dashboard], a[href="/bacheca/"], a[href="/bacheca"], a[href*="/bacheca/"], a[href="/boards/"], a[href="/boards"], a[href*="/dashboard"]'
      );
      var i;
      for (i = 0; i < nodes.length; i += 1) {
        var a = nodes[i];
        if (!a || !a.classList || !a.classList.contains("vc-mobile-nav-tile")) continue;
        /* boardsHamPages1: non cancellare Esplora/Pubblica/Le mie */
        if (a.getAttribute("data-vc-mobile-boards-nav")) continue;
        if (a.closest && a.closest("[data-vc-mobile-boards-section]")) continue;
        /* non toccare footer */
        if (a.closest && a.closest(".vc-mobile-nav-footer")) continue;
        try {
          a.parentNode && a.parentNode.removeChild(a);
        } catch (eRm) {}
      }
    } catch (eStrip) {}
  }

  function stripDashboardTilesFromGrid(gridRoot) {
    stripBachecaTilesFromGrid(gridRoot);
  }

  function findMobileNavSectionByTitle(gridRoot, want) {
    if (!gridRoot || !want) return null;
    var wantNorm = String(want)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    var secs = gridRoot.querySelectorAll(".vc-mobile-nav-section, details.vc-mobile-nav-section");
    var i;
    for (i = 0; i < secs.length; i += 1) {
      var sec = secs[i];
      var titleEl = sec.querySelector(".vc-mobile-nav-section-title, summary, h3");
      var title = String((titleEl && titleEl.textContent) || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (title === wantNorm || title.indexOf(wantNorm) === 0) return sec;
    }
    return null;
  }

  function sectionGridEl(sec) {
    if (!sec) return null;
    return sec.querySelector(".vc-mobile-nav-grid") || sec;
  }

  function createBachecaTile() {
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = "/bacheca/";
    a.setAttribute("data-vc-mobile-bacheca", "1");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = '<i class="fa fa-th-large"></i>';
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    lab.textContent = i18nLabel("nav.bacheca", "Bacheca");
    a.appendChild(ico);
    a.appendChild(lab);
    a.addEventListener("click", function () {
      closeDrawer();
    });
    return a;
  }

  function ensureMobileBachecaTile(gridRoot) {
    /* hamFootOnly1: niente tile Bacheca in PRINCIPALE — solo footer */
    return;
  }

  function createBoardsMobileTile(item) {
    if (!item || !item.href) return null;
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = item.href;
    a.setAttribute("data-vc-mobile-boards-nav", item.id || "1");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = '<i class="fa ' + String(item.icon || "fa-circle") + '"></i>';
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    lab.textContent = i18nLabel(item.labelKey, item.label);
    if (item.labelKey) lab.setAttribute("data-i18n", item.labelKey);
    a.appendChild(ico);
    a.appendChild(lab);
    try {
      var here = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
      var target = String(item.href || "").replace(/\/+$/, "") || "/";
      if (target !== "/" && (here === target || here.indexOf(target + "/") === 0)) {
        a.classList.add("is-active");
        a.setAttribute("aria-current", "page");
      }
    } catch (eAct) {}
    a.addEventListener("click", function () {
      closeDrawer();
    });
    return a;
  }

  function collectBoardsMobileTiles() {
    /* boardsHamPages1: stesse voci della snav PC (Esplora/Pubblica/Le mie) */
    var tiles = [];
    var i;
    try {
      var snav =
        document.querySelector("nav.vc-header-snav.vc-header-snav--boards") ||
        document.querySelector("nav.vc-header-snav");
      if (snav && snav.classList.contains("vc-header-snav--boards")) {
        var links = snav.querySelectorAll(":scope > a.vc-snav-item[href]");
        for (i = 0; i < links.length; i += 1) {
          var row = links[i];
          var href = String(row.getAttribute("href") || "");
          if (!href) continue;
          var id = String(row.getAttribute("data-vc-boards-nav") || "").trim();
          if (!id) {
            var h = href.toLowerCase();
            if (h.indexOf("/bacheca/invia") >= 0) id = "submit";
            else if (h.indexOf("/bacheca/le-mie") >= 0) id = "manage";
            else id = "browse";
          }
          var lab = "";
          try {
            var sp = row.querySelector("span:not(.vc-nav-feat-badge)");
            lab = String((sp && sp.textContent) || row.textContent || "")
              .replace(/\s+/g, " ")
              .trim();
          } catch (eLab) {}
          var ico = "fa-circle";
          try {
            var ic = row.querySelector("i.fa");
            if (ic && ic.className) {
              var m = String(ic.className).match(/\bfa-[a-z0-9-]+\b/i);
              if (m) ico = m[0];
            }
          } catch (eIco) {}
          var tile = createBoardsMobileTile({
            href: href,
            id: id,
            label: lab || id,
            labelKey: "",
            icon: ico,
          });
          if (tile) tiles.push(tile);
        }
      }
    } catch (eSnav) {}
    if (tiles.length) return tiles;
    var fallback = [
      {
        href: "/bacheca/",
        id: "browse",
        label: "Esplora",
        labelKey: "boards.navExplore",
        icon: "fa-compass",
      },
      {
        href: "/bacheca/invia/",
        id: "submit",
        label: "Pubblica",
        labelKey: "boards.navPublish",
        icon: "fa-plus",
      },
      {
        href: "/bacheca/le-mie/",
        id: "manage",
        label: "Le mie",
        labelKey: "boards.navMine",
        icon: "fa-folder-o",
      },
    ];
    for (i = 0; i < fallback.length; i += 1) {
      var t = createBoardsMobileTile(fallback[i]);
      if (t) tiles.push(t);
    }
    return tiles;
  }

  function ensureBoardsMobileSection(gridRoot) {
    /* boardsHamPages1: griglia flat Esplora/Pubblica/Le mie (come snav PC) */
    if (!gridRoot || !isBoardsNoStaffNavPage()) return;
    try {
      var old = gridRoot.querySelector("[data-vc-mobile-boards-section]");
      if (old && old.parentNode) old.parentNode.removeChild(old);
    } catch (eOld) {}
    var tiles = collectBoardsMobileTiles();
    if (!tiles.length) return;
    var beforeCount = gridRoot.children.length;
    /* PRINCIPALE = pinned → pagine sempre visibili, non accordion vuoto */
    appendMobileNavSection(gridRoot, "PRINCIPALE", tiles, 0);
    var added = gridRoot.children[gridRoot.children.length - 1];
    if (added && gridRoot.children.length > beforeCount) {
      try {
        added.setAttribute("data-vc-mobile-boards-section", "1");
      } catch (eMark) {}
      try {
        if (gridRoot.firstChild && added !== gridRoot.firstChild) {
          gridRoot.insertBefore(added, gridRoot.firstChild);
        }
      } catch (ePre) {}
    }
  }

  function rebuildBoardsOnlyGrid(gridRoot) {
    if (!gridRoot) return false;
    if (!isBoardsNoStaffNavPage()) return false;
    try {
      gridRoot.innerHTML = "";
    } catch (eClr) {}
    ensureBoardsMobileSection(gridRoot);
    finalizeMobileActiveTiles(gridRoot);
    try {
      if (window.VcNavBadges && typeof window.VcNavBadges.schedule === "function") {
        window.VcNavBadges.schedule();
      } else if (window.VcNavBadges && typeof window.VcNavBadges.apply === "function") {
        window.VcNavBadges.apply(document);
      }
    } catch (eBadge) {}
    return true;
  }

  function ensureMobileDashboardTile(gridRoot) {
    /* hamFootOnly1: niente tile Dashboard in PRINCIPALE — solo footer */
    return;
  }

  function isBachecaPathCurrent() {
    try {
      return isBachecaNavHref(window.location.pathname || "/");
    } catch (e) {
      return false;
    }
  }

  function applyFooterActionsLayout(actions) {
    if (!actions) return;
    actions.classList.add("is-trio");
    actions.classList.remove("is-quad");
  }

  /* hamEsciFull1: Esci sempre barra sotto il trio, mai cella griglia */
  function ensureFooterLogoutBarLayout(root) {
    try {
      var scope = root || document.getElementById("vc-mobile-nav-drawer-footer") || document;
      var lo =
        scope.querySelector &&
        scope.querySelector(
          ".vc-mobile-nav-footer__action--logout-bar, .vc-mobile-nav-footer__action--logout"
        );
      if (!lo) return;
      try {
        lo.classList.add(
          "vc-mobile-nav-footer__action",
          "vc-mobile-nav-footer__action--logout",
          "vc-mobile-nav-footer__action--logout-bar"
        );
        lo.classList.remove("vc-mobile-nav-footer__action--icon");
      } catch (eCls) {}
      var actions = lo.closest && lo.closest(".vc-mobile-nav-footer__actions");
      if (!actions) return;
      var account = actions.closest(".vc-mobile-nav-footer__account") || actions.parentElement;
      if (!account) return;
      var toolbar = account.querySelector(":scope > .vc-mobile-nav-footer__toolbar");
      if (!toolbar) {
        toolbar = document.createElement("div");
        toolbar.className = "vc-mobile-nav-footer__toolbar";
        if (actions.parentNode === account) {
          account.insertBefore(toolbar, actions);
          toolbar.appendChild(actions);
        } else {
          account.appendChild(toolbar);
          toolbar.appendChild(actions);
        }
      } else if (actions.parentNode !== toolbar) {
        toolbar.insertBefore(actions, toolbar.firstChild);
      }
      toolbar.appendChild(lo);
      applyFooterActionsLayout(actions);
    } catch (eEns) {}
  }

  function isDashboardNavAllowed() {
    /* profileSoonDashBacheca1 / hamFootSoon1: solo founder */
    try {
      if (window.__VC_VIEW_AS_ALLOWED === true) return true;
      var p = window.__VC_STAFF_PERMS || {};
      if (p && (p.isFounder === true || p.viewAsAllowed === true)) return true;
      if (sessionStorage.getItem("vc_view_as_allowed") === "1") return true;
    } catch (e) {}
    return false;
  }

  function isBachecaNavAllowed() {
    /* hamFootSoon1: stessa gate della Dashboard / menu PC */
    return isDashboardNavAllowed();
  }

  function footerSoonBadgeHtml() {
    return (
      '<span class="vc-mobile-nav-footer__soon-badge" data-i18n="dash.comingSoon">' +
      i18nLabel("dash.comingSoon", "soon") +
      "</span>"
    );
  }

  function applyFooterSoonState(el, allowed, iconHtml) {
    if (!el) return;
    if (allowed) {
      el.classList.remove("is-soon");
      el.removeAttribute("aria-disabled");
      el.innerHTML = iconHtml;
      return;
    }
    el.classList.add("is-soon");
    el.setAttribute("aria-disabled", "true");
    el.removeAttribute("href");
    el.removeAttribute("aria-current");
    el.classList.remove("is-active");
    el.innerHTML =
      '<span class="vc-mobile-nav-footer__soon-inner" aria-hidden="true">' +
      iconHtml +
      "</span>" +
      footerSoonBadgeHtml();
  }

  function appendDashboardFooterAction(actions) {
    if (!actions) return null;
    var allowed = isDashboardNavAllowed();
    var dash = document.createElement("a");
    dash.className =
      "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--dashboard vc-mobile-nav-footer__action--icon";
    dash.setAttribute("aria-label", i18nLabel("auth.dashboard", "Dashboard"));
    dash.title = i18nLabel("auth.dashboard", "Dashboard");
    dash.setAttribute("data-vc-mobile-dashboard", "1");
    if (allowed) {
      dash.href = resolveDashboardHref();
      if (document.body && document.body.classList.contains("vc-dashboard-page")) {
        dash.classList.add("is-active");
        dash.setAttribute("aria-current", "page");
      }
    }
    applyFooterSoonState(dash, allowed, '<i class="fa fa-server" aria-hidden="true"></i>');
    dash.addEventListener("click", function (ev) {
      if (!isDashboardNavAllowed()) {
        try {
          if (ev && ev.preventDefault) ev.preventDefault();
          if (ev && ev.stopPropagation) ev.stopPropagation();
        } catch (ePrev) {}
        return;
      }
      closeDrawer();
    });
    actions.appendChild(dash);
    return dash;
  }

  function appendBachecaFooterAction(actions) {
    if (!actions) return null;
    var allowed = isBachecaNavAllowed();
    var bach = document.createElement("a");
    bach.className =
      "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--bacheca vc-mobile-nav-footer__action--icon";
    bach.setAttribute("aria-label", i18nLabel("nav.bacheca", "Bacheca"));
    bach.title = i18nLabel("nav.bacheca", "Bacheca");
    bach.setAttribute("data-vc-mobile-bacheca", "1");
    if (allowed) {
      bach.href = "/bacheca/";
      if (isBachecaPathCurrent()) {
        bach.classList.add("is-active");
        bach.setAttribute("aria-current", "page");
      }
    }
    applyFooterSoonState(bach, allowed, '<i class="fa fa-th-large" aria-hidden="true"></i>');
    bach.addEventListener("click", function (ev) {
      if (!isBachecaNavAllowed()) {
        try {
          if (ev && ev.preventDefault) ev.preventDefault();
          if (ev && ev.stopPropagation) ev.stopPropagation();
        } catch (ePrev) {}
        return;
      }
      closeDrawer();
    });
    actions.appendChild(bach);
    return bach;
  }

  function createFooterLogoutButton(logoutBtn) {
    var lo = document.createElement("button");
    lo.type = "button";
    /* hamFootTrioLogout1: logout a barra sotto il trio icone */
    lo.className =
      "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--logout vc-mobile-nav-footer__action--logout-bar";
    lo.setAttribute("aria-label", i18nLabel("auth.logout", "Esci"));
    lo.title = i18nLabel("auth.logout", "Esci");
    lo.innerHTML =
      '<i class="fa fa-sign-out" aria-hidden="true"></i><span data-i18n="auth.logout">' +
      i18nLabel("auth.logout", "Esci") +
      "</span>";
    lo.addEventListener("click", function () {
      if (logoutBtn) logoutBtn.click();
      else if (typeof window.__vcDiscordCompleteLogout === "function") {
        try {
          window.__vcDiscordCompleteLogout({ reason: "user" });
        } catch (eOut) {}
      } else if (typeof window.__vcDiscordClearToken === "function") {
        try {
          window.__vcDiscordClearToken();
        } catch (eClear) {}
        try {
          window.location.reload();
        } catch (eRel) {}
      }
      closeDrawer();
    });
    return lo;
  }

  function syncDrawerFooter() {
    try {
      var shared = window.__vcMobileNavSyncFooter;
      if (typeof shared === "function" && shared !== syncDrawerFooter) {
        return shared();
      }
    } catch (eShared) {}
    var foot = document.getElementById("vc-mobile-nav-drawer-footer");
    if (!foot) return;
    foot.innerHTML = "";
    var profile = window.__VC_DISCORD_PROFILE || readCachedProfileForMobile();
    var logoutBtn = document.getElementById("discord-logout-btn");
    var loginBtn = document.getElementById("discord-login-btn");
    var loginState = document.getElementById("discord-login-state");
    var hasToken = false;
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        hasToken = Boolean(window.__vcDiscordGetAccessToken());
      }
      if (!hasToken) {
        var t = localStorage.getItem("vc_discord_access_token");
        var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
        hasToken = Boolean(t) && (!exp || exp > Date.now());
      }
    } catch (eTok) {}
    var pendingShell = loginState && loginState.querySelector(".vc-auth-pending-shell");
    var earlyAvatar = loginState && loginState.querySelector(".vc-auth-early-shell img.discord-avatar-img");
    if ((pendingShell && !earlyAvatar) || (hasToken && !profile)) {
      var pending = document.createElement("div");
      pending.className = "vc-mobile-nav-footer__account";
      pending.setAttribute("aria-busy", "true");
      pending.innerHTML =
        '<div class="vc-mobile-nav-footer__who">' +
        '<div class="vc-mobile-nav-footer__account-start"><span class="vc-mobile-nav-footer__avatar vc-mobile-nav-footer__avatar--fb" aria-hidden="true"><span class="vc-ui-spinner"></span></span></div>' +
        '<div class="vc-mobile-nav-footer__meta">' +
        '<span class="vc-mobile-nav-footer__name" data-i18n="auth.verifyingSession">Verifica sessione…</span>' +
        '<span class="vc-mobile-nav-footer__hint" data-i18n="auth.discordAccount">Account Discord</span>' +
        "</div></div>";
      foot.appendChild(pending);
      return;
    }
    if (profile && (hasToken || logoutBtn || profile.id)) {
      var wrap = document.createElement("div");
      wrap.className = "vc-mobile-nav-footer__account";
      var imgUrl = mobileAvatarUrl(profile);
      var name = mobileAccountDisplayName(profile);
      var who = document.createElement("div");
      who.className = "vc-mobile-nav-footer__who";
      var left = document.createElement("div");
      left.className = "vc-mobile-nav-footer__account-start";
      if (imgUrl) {
        var im = document.createElement("img");
        im.className = "vc-mobile-nav-footer__avatar";
        im.src = imgUrl;
        im.alt = "";
        im.width = 40;
        im.height = 40;
        im.decoding = "async";
        left.appendChild(im);
      } else {
        var fb = document.createElement("span");
        fb.className = "vc-mobile-nav-footer__avatar vc-mobile-nav-footer__avatar--fb";
        fb.setAttribute("aria-hidden", "true");
        fb.innerHTML = '<i class="fa fa-user"></i>';
        left.appendChild(fb);
      }
      var meta = document.createElement("div");
      meta.className = "vc-mobile-nav-footer__meta";
      var nm = document.createElement("span");
      nm.className = "vc-mobile-nav-footer__name";
      nm.textContent = name;
      meta.appendChild(nm);
      var hint = document.createElement("span");
      hint.className = "vc-mobile-nav-footer__hint";
      hint.setAttribute("data-i18n", "auth.discordAccount");
      hint.textContent = i18nLabel("auth.discordAccount", "Account Discord");
      meta.appendChild(hint);
      who.appendChild(left);
      who.appendChild(meta);
      var actions = document.createElement("div");
      actions.className = "vc-mobile-nav-footer__actions";
      var prof = document.createElement("a");
      prof.className = "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--profile vc-mobile-nav-footer__action--icon";
      prof.href = mobileProfileHref(profile.id);
      prof.setAttribute("aria-label", i18nLabel("auth.profile", "Profilo"));
      prof.title = i18nLabel("auth.profile", "Profilo");
      if (isMobileOwnProfileCurrent(profile.id)) {
        prof.classList.add("is-active");
        prof.setAttribute("aria-current", "page");
      }
      prof.innerHTML = '<i class="fa fa-user" aria-hidden="true"></i>';
      prof.addEventListener("click", function (ev) {
        try {
          var idNow = resolveMobileAccountUserId(profile && profile.id);
          if (idNow) {
            var want = "/user/?id=" + encodeURIComponent(idNow);
            prof.href = want;
            var cur = String(prof.getAttribute("href") || "");
            if (cur.indexOf("id=" + idNow) === -1) {
              if (ev && ev.preventDefault) ev.preventDefault();
              try {
                window.location.assign(want);
              } catch (eGo) {
                window.location.href = want;
              }
            }
          }
        } catch (eHrefNow) {}
        closeDrawer();
      });
      actions.appendChild(prof);
      /* hamFootSwapDashBach1: Profilo · Dashboard · Bacheca, logout sotto */
      appendDashboardFooterAction(actions);
      appendBachecaFooterAction(actions);
      applyFooterActionsLayout(actions);
      var toolbar = document.createElement("div");
      toolbar.className = "vc-mobile-nav-footer__toolbar";
      toolbar.appendChild(actions);
      toolbar.appendChild(createFooterLogoutButton(logoutBtn));
      wrap.appendChild(who);
      wrap.appendChild(toolbar);
      foot.appendChild(wrap);
      ensureFooterLogoutBarLayout(foot);
      return;
    }
    if (!hasToken) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "vc-mobile-nav-footer__login";
      b.setAttribute("data-i18n", "auth.loginDiscord");
      b.textContent = i18nLabel("auth.loginDiscord", "Accedi con Discord");
      b.addEventListener("click", function () {
        if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
          window.__vcDiscordStartOAuthRedirect(b);
          closeDrawer();
          return;
        }
        if (loginBtn) loginBtn.click();
      });
      foot.appendChild(b);
    }
  }

  function sectionLabel(text) {
    return String(text || "")
      .trim()
      .toUpperCase();
  }

  function isStaffOnlyNavSection(title) {
    var t = String(title || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return (
      /^area\s*staff$/.test(t) ||
      t === "staff area" ||
      t === "staff" ||
      t === "gestione" ||
      t === "gestione staff"
    );
  }

  function isStaffDetailsEl(el) {
    if (!el) return false;
    try {
      if (el.classList && el.classList.contains("vc-snav-details--staff")) return true;
      if (el.hasAttribute && el.hasAttribute("data-vc-staff-tools-nav")) return true;
    } catch (eAttr) {}
    var sum = el.querySelector ? el.querySelector(".vc-snav-summary span, .vc-snav-summary") : null;
    var title = sum ? String(sum.textContent || "") : "";
    return isStaffOnlyNavSection(title);
  }

  function isStaffGuideHref(href) {
    var h = String(href || "").toLowerCase();
    return h.indexOf("/staff/guida") >= 0;
  }

  function isStaffGuideLabel(label) {
    var t = String(label || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return t === "guida" || t === "guida staff" || t === "staff guide";
  }

    function isEventDedicatedNavPage() {
    try {
      var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
      if (p === "/evento" || p.indexOf("/evento/") === 0) return true;
      if (document.body && document.body.classList.contains("vc-hw-page")) return true;
      var snav = document.querySelector("nav.vc-header-snav");
      if (snav && snav.querySelector && snav.querySelector(".vc-snav-item--event")) return true;
      var label = snav ? String(snav.getAttribute("aria-label") || "").toLowerCase() : "";
      if (label.indexOf("evento") >= 0 || label.indexOf("hogwarts") >= 0) return true;
    } catch (eEv) {}
    return false;
  }

  /* boardsNoStaffNav1 + boardsSchedaMissCine1: niente Staff su /bacheca anche con /en/… */
  function isBoardsNoStaffNavPage() {
    try {
      var raw = String(location.pathname || "/").toLowerCase();
      var p = raw;
      try {
        if (window.VcI18n && typeof window.VcI18n.stripLangPrefix === "function") {
          p = String(window.VcI18n.stripLangPrefix(raw) || raw);
        } else {
          p = raw.replace(
            /^\/(en|it|es|fr|de|pt|pl|nl|ro|cs|sk|hu|bg|el|tr|ru|uk|ar|ja|ko|zh|hi|sv|da|fi|no|nb|nn|hr|sr|sl|lt|lv|et|id|ms|th|vi|he|fa)(?=\/|$)/i,
            "",
          ) || "/";
        }
      } catch (eLang) {}
      p = String(p || "/").replace(/\/+$/, "") || "/";
      if (p.charAt(0) !== "/") p = "/" + p;
      if (p === "/bacheca" || p.indexOf("/bacheca/") === 0) return true;
      if (p === "/boards" || p.indexOf("/boards/") === 0) return true;
      if (document.body) {
        if (document.body.classList.contains("vc-boards-page")) return true;
        if (document.body.getAttribute("data-vc-boards-page")) return true;
      }
      if (document.querySelector("nav.vc-header-snav.vc-header-snav--boards")) return true;
    } catch (eBoards) {}
    return false;
  }

  function ensureMobileConfessionaleTile(gridRoot) {
    /* confessionaleCommNav3: Confessionale SOLO in Community — strip staff aggressivo */
    if (!gridRoot) return;
    try {
      var staffTiles = gridRoot.querySelectorAll(
        'a[data-vc-mobile-staff-confessionale], .vc-mobile-nav-section--staff-guide a[href*="/confessionale"], .vc-mobile-nav-section--staff a[href*="/confessionale"], [data-vc-staff-section] a[href*="/confessionale"]'
      );
      for (var i = 0; i < staffTiles.length; i += 1) {
        var t = staffTiles[i];
        if (t && t.parentNode) t.parentNode.removeChild(t);
      }
      var secsAll = gridRoot.querySelectorAll(".vc-mobile-nav-section, details");
      for (var s0 = 0; s0 < secsAll.length; s0 += 1) {
        var sec0 = secsAll[s0];
        var title0 = String(
          (sec0.querySelector("summary, .vc-mobile-nav-section-title") || {}).textContent || ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        var markedStaff =
          (sec0.classList &&
            (sec0.classList.contains("vc-mobile-nav-section--staff-guide") ||
              sec0.classList.contains("vc-mobile-nav-section--staff"))) ||
          sec0.hasAttribute("data-vc-staff-section");
        var titledStaff =
          title0 === "staff" ||
          title0.indexOf("staff") >= 0 ||
          title0.indexOf("strumenti staff") >= 0 ||
          title0 === "gestione";
        if (title0.indexOf("community") >= 0) continue;
        if (!markedStaff && !titledStaff) continue;
        var confStaff = sec0.querySelectorAll(
          'a[href*="/confessionale"], a[href*="/staff/confessionale"], a[data-i18n="staff.confessionale"], a[data-i18n="nav.confessionale"]'
        );
        for (var c0 = 0; c0 < confStaff.length; c0 += 1) {
          if (confStaff[c0] && confStaff[c0].parentNode) confStaff[c0].parentNode.removeChild(confStaff[c0]);
        }
      }
      /* assicurati che Community abbia Confessionale */
      var communitySec = null;
      for (var s1 = 0; s1 < secsAll.length; s1 += 1) {
        var sec1 = secsAll[s1];
        var title1 = String(
          (sec1.querySelector("summary, .vc-mobile-nav-section-title") || {}).textContent || ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (title1.indexOf("community") >= 0) {
          communitySec = sec1;
          break;
        }
      }
      if (communitySec && !communitySec.querySelector('a[href*="/confessionale"]')) {
        var gComm =
          communitySec.querySelector(".vc-mobile-nav-grid") || communitySec;
        var aConf = document.createElement("a");
        aConf.className = "vc-mobile-nav-tile";
        aConf.href = "/confessionale/";
        aConf.innerHTML =
          '<span class="vc-mobile-nav-tile-ico" aria-hidden="true"><i class="fa fa-comments"></i></span>' +
          '<span class="vc-mobile-nav-tile-label" data-i18n="nav.confessionale">Confessionale</span>';
        aConf.addEventListener("click", function () {
          closeDrawer();
        });
        gComm.appendChild(aConf);
      }
      /* confessionaleCommNav2b: togli Compiti finiti per errore in Community */
      var secs = gridRoot.querySelectorAll(".vc-mobile-nav-section, details");
      for (var s = 0; s < secs.length; s += 1) {
        var sec = secs[s];
        var title = String(
          (sec.querySelector("summary, .vc-mobile-nav-section-title") || {}).textContent || ""
        ).toLowerCase();
        if (title.indexOf("community") < 0) continue;
        var bad = sec.querySelectorAll('a[href*="/staff/compiti"], a[data-vc-mobile-staff-compiti]');
        for (var b = 0; b < bad.length; b += 1) {
          if (bad[b] && bad[b].parentNode) bad[b].parentNode.removeChild(bad[b]);
        }
      }
    } catch (eRm) {}
  }

  function ensureMobileCompitiTile(gridRoot) {
    /* staffInProfileOnly2: Compiti solo nel profilo, non nel drawer */
    if (!gridRoot) return;
    try {
      var dead = gridRoot.querySelectorAll(
        'a[href*="/staff/compiti"], a[data-vc-mobile-staff-compiti]',
      );
      for (var di = 0; di < dead.length; di += 1) {
        if (dead[di] && dead[di].parentNode) dead[di].parentNode.removeChild(dead[di]);
      }
    } catch (eDead) {}
  }

  function appendStaffGuideSection(gridRoot, sourceDetails) {
    if (!gridRoot) return;
    /* staffInProfileOnly2: mai sezione Staff nel drawer — strumenti solo nel profilo */
    try {
      var kill = gridRoot.querySelectorAll(
        ".vc-mobile-nav-section--staff-guide, .vc-mobile-nav-section--staff, [data-vc-staff-section], a[data-vc-mobile-staff], a[data-vc-mobile-staff-compiti], a[data-vc-mobile-staff-guide], a[href*='/staff/guida'], a[href*='/staff/compiti']",
      );
      for (var ki = 0; ki < kill.length; ki += 1) {
        if (kill[ki] && kill[ki].parentNode) kill[ki].parentNode.removeChild(kill[ki]);
      }
    } catch (eKill) {}
    try {
      ensureMobileConfessionaleTile(gridRoot);
    } catch (eConf) {}
  }

  function isStaffOnlyNavHref(href) {
    var h = String(href || "").toLowerCase();
    return h.indexOf("/staff/gestione") >= 0;
  }

  function isStaffOnlyNavLabel(label) {
    var t = String(label || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return t === "gestione" || t === "gestione staff" || t === "area staff" || t === "staff area";
  }

  /* recensioniNav1: never keep legacy Suggerimenti label or /suggerimenti/# href. */
  function normalizePublicNavHref(href) {
    var h = String(href || "").trim();
    var low = h.toLowerCase();
    if (
      low.indexOf("/suggerimenti") >= 0 ||
      low === "#" ||
      low.indexOf("richieste_suggerimenti") >= 0
    ) {
      return "/feedback/";
    }
    return h;
  }

  function normalizePublicNavLabel(href, label) {
    var h = String(href || "").toLowerCase();
    var lab = String(label || "").replace(/\s+/g, " ").trim();
    if (
      h.indexOf("/feedback") >= 0 ||
      h.indexOf("/suggerimenti") >= 0 ||
      h.indexOf("richieste_suggerimenti") >= 0
    ) {
      return i18nLabel("nav.suggestions", "Feedback");
    }
    if (/^suggerimenti$/i.test(lab)) return i18nLabel("nav.suggestions", "Feedback");
    return lab;
  }

  function navItemHidden(el) {
    return !el || el.hidden || el.hasAttribute("hidden");
  }

  function i18nLabel(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function resolveDashboardHref() {
    var link = document.getElementById("discord-dashboard-link");
    if (link) {
      var h = String(link.getAttribute("href") || "").trim();
      if (h) return h;
    }
    try {
      var d = window.__VC_SITE_DASHBOARD || {};
      if (d.pageUrl) return String(d.pageUrl);
    } catch (e0) {}
    return "/dashboard/";
  }

  function hasLikelyDiscordSession() {
    try {
      if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) return true;
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        if (String(window.__vcDiscordGetAccessToken() || "").trim()) return true;
      }
      if (document.documentElement.classList.contains("vc-auth-session-pending")) return true;
      var t = localStorage.getItem("vc_discord_access_token");
      if (!t) return false;
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      return !exp || Date.now() < exp;
    } catch (eSess) {}
    return false;
  }

  function shouldInjectDashboardTile() {
    try {
      if (document.body && document.body.classList.contains("vc-dashboard-page")) return false;
    } catch (e) {}
    return isDashboardNavAllowed();
  }

  function createDashboardTile() {
    if (!shouldInjectDashboardTile()) return null;
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = resolveDashboardHref();
    a.setAttribute("data-vc-mobile-dashboard", "1");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = '<i class="fa fa-server"></i>';
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    lab.textContent = i18nLabel("auth.dashboard", "Dashboard");
    a.appendChild(ico);
    a.appendChild(lab);
    a.addEventListener("click", function () {
      closeDrawer();
    });
    return a;
  }

  function removeHeaderDashboardBtn() {
    var existing = document.getElementById("vc-mobile-dashboard-btn");
    if (existing) existing.remove();
  }

  function resolveStaffHref() {
    var link = document.getElementById("discord-staff-link");
    if (link) {
      var h = String(link.getAttribute("href") || "").trim();
      if (h) return h;
    }
    return "/staff/";
  }

  function isStaffNavAllowed() {
    if (window.__VC_STAFF_MENU_ALLOWED === true) return true;
    var link = document.getElementById("discord-staff-link");
    return Boolean(link && !navItemHidden(link));
  }

  function shouldInjectStaffTile() {
    return false;
  }

  function createStaffTile() {
    if (!shouldInjectStaffTile()) return null;
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = resolveStaffHref();
    a.setAttribute("data-vc-mobile-staff", "1");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = '<i class="fa fa-shield"></i>';
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    lab.textContent = i18nLabel("auth.staffArea", "Staff");
    a.appendChild(ico);
    a.appendChild(lab);
    a.addEventListener("click", function () {
      closeDrawer();
    });
    return a;
  }

  function markTileActive(a, source) {
    if (!a) return;
    var href = "";
    try {
      href = a.getAttribute("href") || (source && source.getAttribute && source.getAttribute("href")) || "";
    } catch (eHref) {}
    var match = false;
    try {
      if (
        window.__VC_MOBILE_NAV_CANONICAL &&
        typeof window.__VC_MOBILE_NAV_CANONICAL.hrefMatches === "function"
      ) {
        match = window.__VC_MOBILE_NAV_CANONICAL.hrefMatches(href);
      } else {
        var here = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
        var target = href;
        try {
          target = String(new URL(href, window.location.href).pathname || "/").replace(/\/+$/, "") || "/";
        } catch (eU) {}
        if (target === "/") match = here === "/";
        else match = target === here;
      }
    } catch (eMatch) {}
    if (match) {
      a.classList.add("is-active");
      a.setAttribute("aria-current", "page");
    } else {
      a.classList.remove("is-active");
      try {
        a.removeAttribute("aria-current");
      } catch (eRm) {}
    }
  }

  function createTileFromRow(row) {
    if (navItemHidden(row)) return null;
    var href = normalizePublicNavHref(row.getAttribute("href"));
    if (!href) return null;
    if (isStaffOnlyNavHref(href)) return null;
    var target = row.getAttribute("target");
    var rel = row.getAttribute("rel");
    var dvl = row.getAttribute("data-vc-loading");
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = href;
    a.setAttribute("href", href);
    if (target) a.setAttribute("target", target);
    if (rel) a.setAttribute("rel", rel);
    if (dvl) a.setAttribute("data-vc-loading", dvl);
    var icoWrap = row.querySelector(".vc-snav-row-ico");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    if (icoWrap) ico.innerHTML = icoWrap.innerHTML;
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    var spans = row.querySelectorAll("span");
    var labelText = "";
    var j;
    for (j = 0; j < spans.length; j += 1) {
      if (spans[j].classList.contains("vc-snav-row-ico")) continue;
      if (spans[j].classList.contains("vc-nav-feat-badge")) continue;
      labelText = spans[j].textContent || "";
      if (labelText) break;
    }
    if (!labelText) labelText = String(row.textContent || "").trim();
    if (isStaffOnlyNavLabel(labelText)) return null;
    lab.textContent = normalizePublicNavLabel(href, labelText);
    a.appendChild(ico);
    a.appendChild(lab);
    markTileActive(a, row);
    a.addEventListener("click", function () {
      closeDrawer();
    });
    return a;
  }

  function createTileFromItem(item) {
    if (navItemHidden(item)) return null;
    var href = normalizePublicNavHref(item.getAttribute("href"));
    if (!href) return null;
    if (isStaffOnlyNavHref(href)) return null;
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = href;
    a.setAttribute("href", href);
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    var fi = item.querySelector("i.fa");
    if (fi) ico.innerHTML = fi.outerHTML;
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    var innerSpan = item.querySelector("span");
    var labelText = innerSpan ? String(innerSpan.textContent || "").trim() : String(item.textContent || "").trim();
    if (isStaffOnlyNavLabel(labelText)) return null;
    lab.textContent = normalizePublicNavLabel(href, labelText);
    a.appendChild(ico);
    a.appendChild(lab);
    markTileActive(a, item);
    a.addEventListener("click", function () {
      closeDrawer();
    });
    return a;
  }

  function groupSectionTitle(nav, groupIndex) {
    var aria = nav && nav.getAttribute("aria-label");
    if (aria && /evento/i.test(String(aria))) {
      return groupIndex === 0 ? "SITO" : sectionLabel(aria);
    }
    return "PRINCIPALE";
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

  function sectionHasActiveTile(tiles) {
    var i;
    for (i = 0; i < (tiles || []).length; i += 1) {
      var tile = tiles[i];
      if (!tile) continue;
      if (tile.classList.contains("is-active") || tile.getAttribute("aria-current") === "page") return true;
      var href = tile.getAttribute("href") || "";
      try {
        if (
          window.__VC_MOBILE_NAV_CANONICAL &&
          typeof window.__VC_MOBILE_NAV_CANONICAL.hrefMatches === "function" &&
          window.__VC_MOBILE_NAV_CANONICAL.hrefMatches(href)
        ) {
          return true;
        }
      } catch (eM) {}
    }
    return false;
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

  function appendMobileNavSection(gridRoot, title, tiles, index) {
    if (!gridRoot || !tiles || !tiles.length) return;
    var pinned = isPinnedSectionTitle(title);
    var sec = document.createElement(pinned ? "section" : "details");
    sec.className = "vc-mobile-nav-section" + (pinned ? " vc-mobile-nav-section--pinned" : "");
    if (!pinned && sectionShouldOpen(title, tiles, typeof index === "number" ? index : 0)) {
      sec.setAttribute("open", "");
    }
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
    }
    var g = document.createElement("div");
    g.className = "vc-mobile-nav-grid";
    var t;
    for (t = 0; t < tiles.length; t += 1) {
      if (tiles[t]) g.appendChild(tiles[t]);
    }
    if (!g.children.length) return;
    sec.appendChild(h);
    sec.appendChild(g);
    if (!pinned) {
      bindSectionToggle(sec, title);
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
    gridRoot.appendChild(sec);
  }

  function finalizeMobileActiveTiles(gridRoot) {
    if (!gridRoot) return;
    try {
      if (
        window.__VC_MOBILE_NAV_CANONICAL &&
        typeof window.__VC_MOBILE_NAV_CANONICAL.finalizeActiveTiles === "function"
      ) {
        window.__VC_MOBILE_NAV_CANONICAL.finalizeActiveTiles(gridRoot);
        return;
      }
    } catch (eFin) {}
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
      var here = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
      var target = href;
      try {
        target = String(new URL(href, window.location.href).pathname || "/").replace(/\/+$/, "") || "/";
      } catch (eU) {}
      var match = target === "/" ? here === "/" : target === here;
      if (!match) continue;
      if (target.length > bestLen) {
        best = a;
        bestLen = target.length;
      }
    }
    if (best) {
      best.classList.add("is-active");
      best.setAttribute("aria-current", "page");
    }
  }

  function safeCreateTileFromRow(row) {
    try {
      return createTileFromRow(row);
    } catch (eRow) {
      try {
        if (!row) return null;
        var href = row.getAttribute("href");
        if (!href) return null;
        var a = document.createElement("a");
        a.className = "vc-mobile-nav-tile";
        a.href = href;
        var lab = document.createElement("span");
        lab.className = "vc-mobile-nav-tile-label";
        lab.textContent = String(row.textContent || "").replace(/\s+/g, " ").trim();
        a.appendChild(lab);
        a.addEventListener("click", function () {
          closeDrawer();
        });
        return a;
      } catch (eFallback) {
        return null;
      }
    }
  }

  function collectTopNavTiles(nav) {
    var out = [];
    var items = nav.querySelectorAll(":scope > a.vc-snav-item");
    var i;
    for (i = 0; i < items.length; i += 1) {
      /* hamFootOnly1: skip Bacheca/Dashboard — solo footer */
      try {
        var hrefTop = String(items[i].getAttribute("href") || "").toLowerCase();
        if (
          hrefTop.indexOf("/bacheca") >= 0 ||
          hrefTop.indexOf("/boards") >= 0 ||
          hrefTop.indexOf("/dashboard") >= 0
        ) {
          continue;
        }
      } catch (eSkip) {}
      var tile = createTileFromItem(items[i]);
      if (tile) out.push(tile);
    }
    return out;
  }

  function collectDetailsNavTiles(detailsEl) {
    var out = [];
    if (!detailsEl) return out;
    var rows = detailsEl.querySelectorAll(".vc-snav-panel .vc-snav-row");
    var r;
    for (r = 0; r < rows.length; r += 1) {
      var rowEl = rows[r];
      var rowHref = rowEl ? rowEl.getAttribute("href") : "";
      var rowLab = "";
      try {
        var spans = rowEl.querySelectorAll("span");
        var sj;
        for (sj = 0; sj < spans.length; sj += 1) {
          if (spans[sj].classList.contains("vc-snav-row-ico")) continue;
          if (spans[sj].classList.contains("vc-nav-feat-badge")) continue;
          rowLab = String(spans[sj].textContent || "").trim();
          if (rowLab) break;
        }
      } catch (eLab) {}
      if (isStaffOnlyNavHref(rowHref) || isStaffOnlyNavLabel(rowLab)) continue;
      /* hamFootOnly1: skip Bacheca/Dashboard dalla griglia */
      try {
        var h = String(rowHref || "").toLowerCase();
        var ln = String(rowLab || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (
          h.indexOf("/bacheca") >= 0 ||
          h.indexOf("/boards") >= 0 ||
          h.indexOf("/dashboard") >= 0 ||
          ln === "bacheca" ||
          ln === "boards" ||
          ln === "dashboard"
        ) {
          continue;
        }
      } catch (eSkip2) {}
      var tile = safeCreateTileFromRow(rowEl);
      if (tile) out.push(tile);
    }
    return out;
  }

  function rebuildGrid() {
    var gridRoot = document.getElementById("vc-mobile-nav-drawer-grid");
    if (!gridRoot) return;
    /* boardsHamPages1: su /bacheca niente menu sito — solo Esplora/Pubblica/Le mie */
    if (rebuildBoardsOnlyGrid(gridRoot)) return;
    var usedCanonical = false;
    try {
      if (window.__VC_MOBILE_NAV_CANONICAL && window.__VC_MOBILE_NAV_CANONICAL.shouldUse()) {
        window.__VC_MOBILE_NAV_CANONICAL.build(gridRoot);
        usedCanonical = true;
      }
    } catch (eCanon) {}
    if (usedCanonical) {
      try {
        appendStaffGuideSection(
          gridRoot,
          document.querySelector("[data-vc-staff-tools-nav], .vc-snav-details--staff"),
        );
        ensureMobileConfessionaleTile(gridRoot);
        ensureMobileCompitiTile(gridRoot);
        ensureMobileBachecaTile(gridRoot);
        ensureMobileDashboardTile(gridRoot);
      } catch (eStaff) {}
      stripBachecaTilesFromGrid(gridRoot);
      finalizeMobileActiveTiles(gridRoot);
      try {
        if (window.VcNavBadges && typeof window.VcNavBadges.schedule === "function") {
          window.VcNavBadges.schedule();
        } else if (window.VcNavBadges && typeof window.VcNavBadges.apply === "function") {
          window.VcNavBadges.apply(document);
        }
      } catch (eBadge) {}
      return;
    }
    var nav = document.querySelector("nav.vc-header-snav");
    if (!nav) return;
    gridRoot.innerHTML = "";

    var sectionIndex = 0;
    var topTiles = collectTopNavTiles(nav);
    if (topTiles.length) {
      appendMobileNavSection(gridRoot, groupSectionTitle(nav, 0), topTiles, sectionIndex);
      sectionIndex += 1;
    }

    var details = nav.querySelectorAll(":scope > details.vc-snav-details");
    var d;
    for (d = 0; d < details.length; d += 1) {
      var el = details[d];
      var sum = el.querySelector(".vc-snav-summary");
      var titleTxt = "MENU";
      if (sum) {
        var sp = sum.querySelector("span:not(.vc-nav-feat-badge)");
        titleTxt = sectionLabel(sp ? sp.textContent : sum.textContent);
      }
      if (isStaffDetailsEl(el) || isStaffOnlyNavSection(titleTxt)) {
        appendStaffGuideSection(gridRoot, el);
        continue;
      }
      var sectionTiles = collectDetailsNavTiles(el);
      appendMobileNavSection(gridRoot, titleTxt, sectionTiles, sectionIndex);
      sectionIndex += 1;
    }

    appendStaffGuideSection(gridRoot, document.querySelector("[data-vc-staff-tools-nav], .vc-snav-details--staff"));
    ensureMobileConfessionaleTile(gridRoot);
    ensureMobileCompitiTile(gridRoot);
    ensureMobileBachecaTile(gridRoot);
    ensureMobileDashboardTile(gridRoot);
    stripBachecaTilesFromGrid(gridRoot);
    finalizeMobileActiveTiles(gridRoot);
    try {
        if (window.VcNavBadges && typeof window.VcNavBadges.schedule === "function") {
          window.VcNavBadges.schedule();
        } else if (window.VcNavBadges && typeof window.VcNavBadges.apply === "function") {
          window.VcNavBadges.apply(document);
        }
    } catch (eBadge2) {}
  }

  function stripDrawerBrandMarquee(root) {
    if (!root || !root.querySelectorAll) return;
    var links = root.querySelectorAll("a.vc-header-site-name");
    var i;
    for (i = 0; i < links.length; i += 1) {
      var nameEl = links[i];
      nameEl.classList.remove("is-marquee");
      try {
        nameEl.style.removeProperty("--vc-marquee-distance");
        nameEl.style.removeProperty("--vc-marquee-duration");
      } catch (eStyle) {}
      nameEl.removeAttribute("data-vc-marquee-dist");
      nameEl.removeAttribute("data-vc-marquee-cw");
      nameEl.removeAttribute("data-vc-marquee-text");
      var clones = nameEl.querySelectorAll(".vc-header-site-name__text.is-clone");
      var c;
      for (c = clones.length - 1; c >= 0; c -= 1) {
        if (clones[c].parentNode) clones[c].parentNode.removeChild(clones[c]);
      }
      var track = nameEl.querySelector(".vc-header-site-name__track");
      if (track) {
        track.style.transform = "";
        track.style.animation = "";
        var texts = track.querySelectorAll(".vc-header-site-name__text");
        if (texts[0]) texts[0].style.paddingInlineEnd = "";
      }
    }
  }

  function cloneBrand(intoEl) {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar || !intoEl) return;
    var brandSource = bar.children[0];
    intoEl.innerHTML = "";
    if (!brandSource) return;
    var clone = brandSource.cloneNode(true);
    var walks = clone.querySelectorAll("[id]");
    var w;
    for (w = 0; w < walks.length; w += 1) {
      walks[w].removeAttribute("id");
    }
    stripDrawerBrandMarquee(clone);
    intoEl.appendChild(clone);
    stripDrawerBrandMarquee(intoEl);
  }

  function onMqChange() {
    if (!isMobile()) closeDrawer();
  }

  var lastToggleAt = 0;
  var lastToggleTouchAt = 0;

  function isToggleEventTarget(ev) {
    var t = ev && ev.target;
    if (!t) return false;
    if (t.nodeType === 3) t = t.parentElement;
    return Boolean(t && t.closest && t.closest("#" + TOGGLE_ID));
  }

  function recoverDrawerIfMissing() {
    if (drawer) return drawer;
    try {
      var quick = document.getElementById("header-quick-actions");
      var existingToggle = document.getElementById(TOGGLE_ID);
      if (existingToggle) toggle = existingToggle;
      if (quick && toggle) {
        drawer = document.getElementById(DRAWER_ID) || document.createElement("div");
        drawer.id = DRAWER_ID;
        mountDrawer(drawer);
        backdrop = drawer.querySelector(".vc-mobile-nav-drawer__backdrop");
        if (backdrop && backdrop.getAttribute("data-vc-mobile-nav-bound") !== "1") {
          backdrop.setAttribute("data-vc-mobile-nav-bound", "1");
          backdrop.addEventListener("click", closeDrawer);
        }
        var closeBtn = document.getElementById("vc-mobile-nav-close");
        if (closeBtn && closeBtn.getAttribute("data-vc-mobile-nav-bound") !== "1") {
          closeBtn.setAttribute("data-vc-mobile-nav-bound", "1");
          closeBtn.addEventListener("click", closeDrawer);
        }
      }
    } catch (eRec) {}
    return drawer;
  }

  function shouldIgnoreDuplicateToggleEvent(ev) {
    if (!ev) return false;
    if (ev.type === "click" && Date.now() - lastToggleTouchAt < 450) return true;
    if (ev.type === "pointerup" && ev.pointerType === "mouse") return true;
    return false;
  }

  function toggleMenuFromEvent(ev) {
    if (shouldIgnoreDuplicateToggleEvent(ev)) {
      if (ev.preventDefault) ev.preventDefault();
      if (ev.stopPropagation) ev.stopPropagation();
      return false;
    }
    try {
      ensure();
    } catch (eEns) {}
    if (!drawer) recoverDrawerIfMissing();
    if (!drawer) {
      if (ev && ev.preventDefault) ev.preventDefault();
      if (ev && ev.stopPropagation) ev.stopPropagation();
      window.requestAnimationFrame(function () {
        try {
          ensure();
        } catch (eRetry) {}
        if (!drawer) recoverDrawerIfMissing();
        if (!drawer) return;
        if (drawer.classList.contains("vc-mobile-nav-drawer--open")) closeDrawer();
        else openDrawer();
      });
      return false;
    }
    var now = Date.now();
    if (now - lastToggleAt < 280) {
      if (ev.preventDefault) ev.preventDefault();
      if (ev.stopPropagation) ev.stopPropagation();
      return false;
    }
    if (ev && ev.preventDefault) ev.preventDefault();
    if (ev && ev.stopPropagation) ev.stopPropagation();
    if (drawer.classList.contains("vc-mobile-nav-drawer--open")) closeDrawer();
    else openDrawer();
    lastToggleAt = now;
    if (ev && (ev.type === "touchend" || ev.type === "pointerup")) lastToggleTouchAt = now;
    if (ev && typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
    return true;
  }

  function bindToggleDirect(btn) {
    if (!btn || btn.getAttribute("data-vc-mobile-nav-bound") === "1") return;
    btn.setAttribute("data-vc-mobile-nav-bound", "1");
    btn.addEventListener(
      "click",
      function (ev) {
        if (!isToggleEventTarget(ev)) return;
        toggleMenuFromEvent(ev);
      },
      true,
    );
    btn.addEventListener(
      "touchend",
      function (ev) {
        if (!isToggleEventTarget(ev)) return;
        toggleMenuFromEvent(ev);
      },
      { capture: true, passive: false },
    );
  }

  function onDelegatedToggle(ev) {
    if (!isToggleEventTarget(ev)) return;
    if (ev.type === "pointerup") {
      if (typeof ev.button === "number" && ev.button !== 0) return;
      if (ev.pointerType === "mouse") return;
    }
    toggleMenuFromEvent(ev);
  }

  function bindGlobalToggle() {
    if (window.__vcMobileNavDelegated) return;
    window.__vcMobileNavDelegated = true;
    document.addEventListener("click", onDelegatedToggle, true);
    document.addEventListener("pointerup", onDelegatedToggle, true);
    document.addEventListener(
      "touchend",
      function (ev) {
        onDelegatedToggle(ev);
      },
      true,
    );
  }

  function drawerMarkup() {
    return (
      '<div class="vc-mobile-nav-drawer__backdrop" tabindex="-1"></div>' +
      '<div class="vc-mobile-nav-drawer__panel">' +
      '<div class="vc-mobile-nav-drawer__top">' +
      '<div class="vc-mobile-nav-drawer__brand" id="vc-mobile-nav-drawer-brand"></div>' +
      '<div class="vc-mobile-nav-drawer__top-actions">' +
      '<button type="button" class="vc-mobile-nav-drawer__close vc-icon-btn" id="vc-mobile-nav-close" aria-label="' +
      i18nLabel("nav.closeMenu", "Chiudi menu") +
      '" data-i18n-attr="aria-label:nav.closeMenu"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div></div>" +
      '<div class="vc-mobile-nav-drawer__scroll" id="vc-mobile-nav-drawer-grid"></div>' +
      '<div class="vc-mobile-nav-drawer__footer" id="vc-mobile-nav-drawer-footer"></div>' +
      "</div>"
    );
  }

  function mountDrawer(el) {
    if (!el) return;
    if (!el.querySelector(".vc-mobile-nav-drawer__panel")) {
      el.className = "vc-mobile-nav-drawer";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-label", i18nLabel("nav.menuAria", "Menu di navigazione"));
      el.setAttribute("data-i18n-attr", "aria-label:nav.menuAria");
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = drawerMarkup();
    }
    try {
      if (document.body && el.parentElement !== document.body) document.body.appendChild(el);
    } catch (eMove) {}
  }

  function ensure() {
    bindGlobalToggle();
    var existingToggle = document.getElementById(TOGGLE_ID);
    var existingDrawer = document.getElementById(DRAWER_ID);
    if (existingToggle) toggle = existingToggle;
    if (existingDrawer) drawer = existingDrawer;
    if (existingToggle && existingDrawer && toggle && drawer) {
      mountDrawer(drawer);
      backdrop = drawer.querySelector(".vc-mobile-nav-drawer__backdrop");
      bindToggleDirect(toggle);
      return;
    }

    var quick = document.getElementById("header-quick-actions");
    var bar = document.querySelector(".vc-header-bar");
    if (!quick || !bar) return;

    if (existingToggle) {
      toggle = existingToggle;
    } else {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.id = TOGGLE_ID;
      toggle.className = "vc-mobile-nav-toggle vc-icon-btn";
      toggle.setAttribute("aria-label", i18nLabel("nav.openMenu", "Apri menu di navigazione"));
      toggle.setAttribute("data-i18n-attr", "aria-label:nav.openMenu");
      toggle.setAttribute("aria-controls", DRAWER_ID);
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML =
        '<span class="vc-mobile-nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
      var notif = document.getElementById("vc-notif-dropdown");
      if (notif && notif.parentElement === quick) {
        if (notif.nextSibling) quick.insertBefore(toggle, notif.nextSibling);
        else quick.appendChild(toggle);
      } else {
        quick.appendChild(toggle);
      }
    }
    toggle.setAttribute("aria-controls", DRAWER_ID);
    if (!toggle.getAttribute("aria-label")) {
      toggle.setAttribute("aria-label", i18nLabel("nav.openMenu", "Apri menu di navigazione"));
      toggle.setAttribute("data-i18n-attr", "aria-label:nav.openMenu");
    }
    if (!toggle.innerHTML || !String(toggle.innerHTML).trim()) {
      toggle.innerHTML =
        '<span class="vc-mobile-nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
    }

    if (existingDrawer) {
      drawer = existingDrawer;
    } else {
      drawer = document.createElement("div");
      drawer.id = DRAWER_ID;
    }
    mountDrawer(drawer);
    backdrop = drawer.querySelector(".vc-mobile-nav-drawer__backdrop");
    try {
      cloneBrand(document.getElementById("vc-mobile-nav-drawer-brand"));
      rebuildGrid();
      gridDirty = false;
    } catch (eBuild) {}
    var closeBtn = document.getElementById("vc-mobile-nav-close");
    if (closeBtn && closeBtn.getAttribute("data-vc-mobile-nav-bound") !== "1") {
      closeBtn.setAttribute("data-vc-mobile-nav-bound", "1");
      closeBtn.addEventListener("click", closeDrawer);
    }
    if (backdrop && backdrop.getAttribute("data-vc-mobile-nav-bound") !== "1") {
      backdrop.setAttribute("data-vc-mobile-nav-bound", "1");
      backdrop.addEventListener("click", closeDrawer);
    }
    bindToggleDirect(toggle);
    if (window.__vcMobileNavListenersBound !== true) {
      window.__vcMobileNavListenersBound = true;
      window.addEventListener("vc-discord-profile", function () {
        scheduleAuthRebuild({ footer: true });
      });
      window.addEventListener("vc-server-identity", function () {
        syncDrawerFooter();
      });
      window.addEventListener("vc-dashboard-access", function () {
        scheduleAuthRebuild({});
      });
      window.addEventListener("vc-auth-session-boot", function () {
        scheduleAuthRebuild({ footer: true });
      });
      window.addEventListener("vc:staff-access-ok", function () {
        scheduleAuthRebuild({ ensure: true, footer: true });
      });
      document.addEventListener("vc-hogwarts-staff-preview-unlock", function () {
        if (drawer && drawer.classList.contains("vc-mobile-nav-drawer--open")) {
          scheduleAuthRebuild({ removeDash: false });
        } else {
          gridDirty = true;
        }
      });
    }
  }

  function refreshMobileNav() {
    ensure();
    rebuildGrid();
    gridDirty = false;
    removeHeaderDashboardBtn();
    syncDrawerFooter();
    try {
      if (window.VcI18n && typeof window.VcI18n.ensureLangSwitcher === "function") {
        window.VcI18n.ensureLangSwitcher();
      }
    } catch (eLang) {}
    /* langSwitchFix2: rebuild copies IT labels — re-translate drawer */
    try {
      if (window.VcI18n && typeof window.VcI18n.apply === "function") {
        var drawer = document.getElementById("vc-mobile-nav-drawer");
        if (drawer) window.VcI18n.apply(drawer);
        window.VcI18n.apply(document);
      }
    } catch (eApply) {}
  }

  function init() {
    bindGlobalToggle();
    ensure();
    var m = getMq();
    if (m.addEventListener) m.addEventListener("change", onMqChange);
    else if (m.addListener) m.addListener(onMqChange);
    removeHeaderDashboardBtn();
    syncDrawerFooter();
    /* cpuIdleCut1: prewarm SOLO se mobile; dopo boot; idle senza timeout aggressivo
       (timeout:2500 forzava rebuild mid-boot → idleCallback 800ms+ / CPU spike) */
    function bootBusy() {
      try {
        var r = document.documentElement;
        return !!(
          r.classList.contains("vc-interaction-hold") ||
          r.classList.contains("vc-chrome-bar-loading") ||
          r.classList.contains("vc-loading-scroll-lock") ||
          r.classList.contains("vc-page-cine-boot")
        );
      } catch (eB) {
        return false;
      }
    }
    function prewarmGrid(deadline) {
      try {
        if (!drawer || !gridDirty) return;
        if (!isMobile()) return;
        if (document.hidden) return;
        if (bootBusy()) {
          window.setTimeout(schedulePrewarm, 700);
          return;
        }
        if (
          deadline &&
          typeof deadline.timeRemaining === "function" &&
          deadline.timeRemaining() < 16 &&
          !deadline.didTimeout
        ) {
          schedulePrewarm();
          return;
        }
        rebuildGrid();
        syncDrawerFooter();
        gridDirty = false;
      } catch (ePw) {}
    }
    function schedulePrewarm() {
      try {
        if (!isMobile() || !gridDirty) return;
        if (typeof window.requestIdleCallback === "function") {
          /* timeout alto: preferisci idle vero; al primo open hamburger rebuild in rAF resta */
          window.requestIdleCallback(prewarmGrid, { timeout: 12000 });
        } else {
          window.setTimeout(function () {
            prewarmGrid(null);
          }, 1800);
        }
      } catch (eSch) {
        try {
          window.setTimeout(function () {
            prewarmGrid(null);
          }, 1800);
        } catch (eT) {}
      }
    }
    try {
      if (window.__vcChromeVisualReady === 1 || document.documentElement.classList.contains("vc-cine-curtain-off")) {
        window.setTimeout(schedulePrewarm, 500);
      } else {
        document.addEventListener(
          "vc:chrome-visual-ready",
          function () {
            window.setTimeout(schedulePrewarm, 500);
          },
          { once: true, passive: true },
        );
        window.setTimeout(schedulePrewarm, 4500);
      }
    } catch (eIdle) {
      window.setTimeout(schedulePrewarm, 4500);
    }
  }

  window.__vcMobileNavRebuild = refreshMobileNav;
  try {
    window.__vcMobileNavToggle = toggleMenuFromEvent;
  } catch (eExportToggle) {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
/* staffNavFix1 */
