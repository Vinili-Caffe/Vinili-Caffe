(function () {
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
    if (typeof BigInt === "undefined") return "";
    try {
      var bi = BigInt(String(u.id));
      var idx = Number((bi >> 22n) % 6n);
      return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
    } catch (e4) {
      return "";
    }
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

  function syncDrawerFooter() {
    var foot = document.getElementById("vc-mobile-nav-drawer-footer");
    if (!foot) return;
    foot.innerHTML = "";
    var profile = window.__VC_DISCORD_PROFILE;
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
    if (pendingShell || (hasToken && !profile)) {
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
      var name =
        String(profile.global_name || profile.username || "Utente").trim() || "Utente";
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
        else if (typeof window.__vcDiscordClearToken === "function") {
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
      if (gridRoot.querySelector('a[href*="/staff/guida"]')) return;
    } catch (eDup) {}
    var rows = sourceDetails
      ? sourceDetails.querySelectorAll(".vc-snav-panel .vc-snav-row, a.vc-snav-row")
      : [];
    var guideRow = null;
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
      if (isStaffGuideHref(href) || isStaffGuideLabel(lab)) {
        guideRow = row;
        break;
      }
    }
    var tile = null;
    if (guideRow) tile = createTileFromRow(guideRow);
    if (!tile && isStaffNavAllowed()) {
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
      tile = a;
    }
    if (!tile) return;
    var sec = document.createElement("section");
    sec.className = "vc-mobile-nav-section vc-mobile-nav-section--staff-guide";
    var h = document.createElement("h3");
    h.className = "vc-mobile-nav-section-title";
    h.textContent = "STAFF";
    var g = document.createElement("div");
    g.className = "vc-mobile-nav-grid";
    g.appendChild(tile);
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
    if (!a || !source) return;
    if (
      source.classList.contains("is-active") ||
      source.classList.contains("vc-snav-item--active") ||
      source.classList.contains("vc-snav-row--active") ||
      source.getAttribute("aria-current") === "page"
    ) {
      a.classList.add("is-active");
      a.setAttribute("aria-current", "page");
    }
  }

  function createTileFromRow(row) {
    if (navItemHidden(row)) return null;
    var href = row.getAttribute("href");
    if (!href) return null;
    if (isStaffOnlyNavHref(href)) return null;
    var target = row.getAttribute("target");
    var rel = row.getAttribute("rel");
    var dvl = row.getAttribute("data-vc-loading");
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = href;
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
    lab.textContent = labelText;
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
    var href = item.getAttribute("href");
    if (!href) return null;
    if (isStaffOnlyNavHref(href)) return null;
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = href;
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
    lab.textContent = labelText;
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
    try {
      if (window.__VC_MOBILE_NAV_CANONICAL && window.__VC_MOBILE_NAV_CANONICAL.shouldUse()) {
        window.__VC_MOBILE_NAV_CANONICAL.build(gridRoot);
        appendStaffGuideSection(
          gridRoot,
          document.querySelector("[data-vc-staff-tools-nav], .vc-snav-details--staff"),
        );
        return;
      }
    } catch (eCanon) {}
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
    intoEl.appendChild(clone);
    try {
      if (typeof window.__vcSyncHeaderSiteNameMarquee === "function") {
        window.__vcSyncHeaderSiteNameMarquee(intoEl);
      }
    } catch (eMarquee) {}
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
      window.addEventListener("vc-dashboard-access", function () {
        rebuildGrid();
        removeHeaderDashboardBtn();
      });
      window.addEventListener("vc-auth-session-boot", function () {
        rebuildGrid();
        removeHeaderDashboardBtn();
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