(function () {
  /* mobileNavProfileCache1: first-paint profile from me-cache + prefer landing syncFooter */
    if (window.__vcLandingMobileNavActive) return;

  var DRAWER_ID = "vc-mobile-nav-drawer";
  var TOGGLE_ID = "vc-mobile-nav-toggle";
  var BODY_OPEN_CLASS = "vc-mobile-nav-open";
  var mq = null;
  var drawer = null;
  var toggle = null;
  var backdrop = null;
  var focusPrev = null;
  var onEscapeDrawer = null;

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
    window.requestAnimationFrame(function () {
      try {
        rebuildGrid();
        syncDrawerFooter();
      } catch (eRebuild) {}
    });
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
    return readCachedDiscordUserId();
  }

  function mobileProfileHref(userId) {
    var id = resolveMobileAccountUserId(userId);
    return id ? "/user/?id=" + encodeURIComponent(id) : "/user";
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
        '<span class="vc-mobile-nav-footer__name">Verifica sessione…</span>' +
        '<span class="vc-mobile-nav-footer__hint">Account Discord</span>' +
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
      hint.textContent = "Account Discord";
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
      actions.appendChild(prof);
      if (isDashboardNavAllowed()) {
        var dash = document.createElement("a");
        dash.className =
          "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--dashboard vc-mobile-nav-footer__action--icon";
        dash.href = resolveDashboardHref();
        dash.setAttribute("aria-label", i18nLabel("auth.dashboard", "Dashboard"));
        dash.title = i18nLabel("auth.dashboard", "Dashboard");
        dash.setAttribute("data-vc-mobile-dashboard", "1");
        if (document.body && document.body.classList.contains("vc-dashboard-page")) {
          dash.classList.add("is-active");
          dash.setAttribute("aria-current", "page");
        }
        dash.innerHTML = '<i class="fa fa-server" aria-hidden="true"></i>';
        dash.addEventListener("click", function () {
          closeDrawer();
        });
        actions.appendChild(dash);
        actions.classList.add("is-trio");
      }
      var lo = document.createElement("button");
      lo.type = "button";
      lo.className = "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--logout vc-mobile-nav-footer__action--icon";
      lo.setAttribute("aria-label", i18nLabel("auth.logout", "Esci"));
      lo.title = i18nLabel("auth.logout", "Esci");
      lo.innerHTML = '<i class="fa fa-sign-out" aria-hidden="true"></i>';
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
      actions.appendChild(lo);
      wrap.appendChild(who);
      wrap.appendChild(actions);
      foot.appendChild(wrap);
      return;
    }
    if (!hasToken) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "vc-mobile-nav-footer__login";
      b.textContent = "Accedi con Discord";
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

  function appendStaffGuideSection(gridRoot, sourceDetails) {
    if (!gridRoot) return;
    if (isEventDedicatedNavPage()) return;
    try {
      if (
        gridRoot.querySelector('a[href*="/staff/guida"]') &&
        gridRoot.querySelector('a[href*="/confessionale"]')
      ) {
        return;
      }
    } catch (eDup) {}
    var rows = sourceDetails
      ? sourceDetails.querySelectorAll(".vc-snav-panel .vc-snav-row, a.vc-snav-row")
      : [];
    var guideRow = null;
    var confRow = null;
    var r;
    for (r = 0; r < rows.length; r += 1) {
      var row = rows[r];
      var href = row.getAttribute("href") || "";
      var lab = "";
      try {
        var spans = row.querySelectorAll("span");
        var sj;
        for (sj = 0; sj < spans.length; sj += 1) {
          if (spans[sj].classList.contains("vc-snav-row-ico")) continue;
          lab = String(spans[sj].textContent || "").trim();
          if (lab) break;
        }
      } catch (eLab) {}
      if (!lab) lab = String(row.textContent || "").trim();
      if (isStaffOnlyNavHref(href) || isStaffOnlyNavLabel(lab)) continue;
      var labNorm = lab.replace(/\s+/g, " ").trim().toLowerCase();
      if (!guideRow && (isStaffGuideHref(href) || isStaffGuideLabel(lab))) {
        guideRow = row;
        continue;
      }
      if (
        !confRow &&
        (String(href).toLowerCase().indexOf("/confessionale") >= 0 ||
          labNorm === "confessionale" ||
          labNorm === "il confessionale")
      ) {
        confRow = row;
      }
    }
    var tiles = [];
    if (guideRow) {
      var guideTile = createTileFromRow(guideRow);
      if (guideTile) tiles.push(guideTile);
    } else if (isStaffNavAllowed() && !gridRoot.querySelector('a[href*="/staff/guida"]')) {
      var a = document.createElement("a");
      a.className = "vc-mobile-nav-tile";
      a.href = "/staff/guida/";
      a.setAttribute("data-vc-mobile-staff-guide", "1");
      a.innerHTML =
        '<span class="vc-mobile-nav-tile-ico" aria-hidden="true"><i class="fa fa-book"></i></span>' +
        '<span class="vc-mobile-nav-tile-label">Guida</span>';
      a.addEventListener("click", function () {
        closeDrawer();
      });
      tiles.push(a);
    }
    if (confRow) {
      var confTile = createTileFromRow(confRow);
      if (confTile) tiles.push(confTile);
    } else if (isStaffNavAllowed() && !gridRoot.querySelector('a[href*="/confessionale"]')) {
      var c = document.createElement("a");
      c.className = "vc-mobile-nav-tile";
      c.href = "/staff/confessionale/";
      c.setAttribute("data-vc-mobile-staff-confessionale", "1");
      c.innerHTML =
        '<span class="vc-mobile-nav-tile-ico" aria-hidden="true"><i class="fa fa-comments"></i></span>' +
        '<span class="vc-mobile-nav-tile-label">Confessionale</span>';
      c.addEventListener("click", function () {
        closeDrawer();
      });
      tiles.push(c);
    }
    if (!tiles.length) return;
    var existingSec = gridRoot.querySelector(".vc-mobile-nav-section--staff-guide");
    if (existingSec) {
      var existingGrid = existingSec.querySelector(".vc-mobile-nav-grid") || existingSec;
      for (var ti = 0; ti < tiles.length; ti += 1) {
        var hrefT = String(tiles[ti].getAttribute("href") || "").toLowerCase();
        if (hrefT.indexOf("/staff/guida") >= 0 && existingSec.querySelector('a[href*="/staff/guida"]')) {
          continue;
        }
        if (hrefT.indexOf("/confessionale") >= 0 && existingSec.querySelector('a[href*="/confessionale"]')) {
          continue;
        }
        existingGrid.appendChild(tiles[ti]);
      }
      return;
    }
    var sec = document.createElement("section");
    sec.className = "vc-mobile-nav-section vc-mobile-nav-section--staff-guide";
    var h = document.createElement("h3");
    h.className = "vc-mobile-nav-section-title";
    h.textContent = "STAFF";
    var g = document.createElement("div");
    g.className = "vc-mobile-nav-grid";
    for (var i = 0; i < tiles.length; i += 1) g.appendChild(tiles[i]);
    sec.appendChild(h);
    sec.appendChild(g);
    gridRoot.appendChild(sec);
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

  function isDashboardNavAllowed() {
    if (window.__VC_DASHBOARD_MENU_BLACKLISTED === true) return false;
    if (window.__VC_DASHBOARD_ACCESS_OK === true) return true;
    if (window.__VC_DASHBOARD_MENU_ALLOWED === true) return true;
    if (window.__VC_DASHBOARD_MENU_ALLOWED === false && window.__VC_DASHBOARD_MENU_CHECKED === true) return false;
    var link = document.getElementById("discord-dashboard-link");
    if (link && !navItemHidden(link) && !link.classList.contains("is-blacklisted")) return true;
    if (hasLikelyDiscordSession()) return true;
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
    lab.textContent = i18nLabel("auth.staffArea", "Area Staff");
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

  function appendMobileNavSection(gridRoot, title, tiles) {
    if (!gridRoot || !tiles || !tiles.length) return;
    var sec = document.createElement("section");
    sec.className = "vc-mobile-nav-section";
    var h = document.createElement("h3");
    h.className = "vc-mobile-nav-section-title";
    h.textContent = title;
    var g = document.createElement("div");
    g.className = "vc-mobile-nav-grid";
    var t;
    for (t = 0; t < tiles.length; t += 1) {
      if (tiles[t]) g.appendChild(tiles[t]);
    }
    if (!g.children.length) return;
    sec.appendChild(h);
    sec.appendChild(g);
    gridRoot.appendChild(sec);
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
          rowLab = String(spans[sj].textContent || "").trim();
          if (rowLab) break;
        }
      } catch (eLab) {}
      if (isStaffOnlyNavHref(rowHref) || isStaffOnlyNavLabel(rowLab)) continue;
      var tile = safeCreateTileFromRow(rowEl);
      if (tile) out.push(tile);
    }
    return out;
  }

  function rebuildGrid() {
    var gridRoot = document.getElementById("vc-mobile-nav-drawer-grid");
    if (!gridRoot) return;
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
      } catch (eStaff) {}
      return;
    }
    var nav = document.querySelector("nav.vc-header-snav");
    if (!nav) return;
    gridRoot.innerHTML = "";

    var topTiles = collectTopNavTiles(nav);
    if (topTiles.length) appendMobileNavSection(gridRoot, groupSectionTitle(nav, 0), topTiles);

    var details = nav.querySelectorAll(":scope > details.vc-snav-details");
    var d;
    for (d = 0; d < details.length; d += 1) {
      var el = details[d];
      var sum = el.querySelector(".vc-snav-summary");
      var titleTxt = "MENU";
      if (sum) {
        var sp = sum.querySelector("span");
        titleTxt = sectionLabel(sp ? sp.textContent : sum.textContent);
      }
      if (isStaffDetailsEl(el) || isStaffOnlyNavSection(titleTxt)) {
        appendStaffGuideSection(gridRoot, el);
        continue;
      }
      var sectionTiles = collectDetailsNavTiles(el);
      appendMobileNavSection(gridRoot, titleTxt, sectionTiles);
    }

    appendStaffGuideSection(gridRoot, document.querySelector("[data-vc-staff-tools-nav], .vc-snav-details--staff"));
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
      '<button type="button" class="vc-mobile-nav-drawer__close vc-icon-btn" id="vc-mobile-nav-close" aria-label="Chiudi menu"><i class="fa fa-times" aria-hidden="true"></i></button>' +
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
      el.setAttribute("aria-label", "Menu di navigazione");
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
      toggle.setAttribute("aria-label", "Apri menu di navigazione");
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
      toggle.setAttribute("aria-label", "Apri menu di navigazione");
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
        syncDrawerFooter();
        rebuildGrid();
        removeHeaderDashboardBtn();
      });
      window.addEventListener("vc-server-identity", function () {
        syncDrawerFooter();
      });
      window.addEventListener("vc-dashboard-access", function () {
        rebuildGrid();
        removeHeaderDashboardBtn();
      });
      window.addEventListener("vc-auth-session-boot", function () {
        rebuildGrid();
        removeHeaderDashboardBtn();
        syncDrawerFooter();
      });
      document.addEventListener("vc-hogwarts-staff-preview-unlock", function () {
        if (drawer && drawer.classList.contains("vc-mobile-nav-drawer--open")) rebuildGrid();
      });
    }
  }

  function refreshMobileNav() {
    ensure();
    rebuildGrid();
    removeHeaderDashboardBtn();
    syncDrawerFooter();
    try {
      if (window.VcI18n && typeof window.VcI18n.ensureLangSwitcher === "function") {
        window.VcI18n.ensureLangSwitcher();
      }
    } catch (eLang) {}
  }

  function init() {
    bindGlobalToggle();
    ensure();
    var m = getMq();
    if (m.addEventListener) m.addEventListener("change", onMqChange);
    else if (m.addListener) m.addListener(onMqChange);
    removeHeaderDashboardBtn();
    syncDrawerFooter();
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