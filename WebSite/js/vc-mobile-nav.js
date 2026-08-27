(function () {
  // Su homepage e molte pagine vc-landing.js già gestisce il menu mobile.
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
    rebuildGrid();
    syncDrawerFooter();
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

  function resolveMobileAccountUserId(userId) {
    var id = String(userId || "").trim();
    if (/^\d{17,22}$/.test(id)) return id;
    try {
      var profile = window.__VC_DISCORD_PROFILE;
      var fromProfile = String(profile && profile.id || "").trim();
      if (/^\d{17,22}$/.test(fromProfile)) return fromProfile;
    } catch (eP) {}
    return "";
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
      prof.className = "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--profile";
      prof.href = mobileProfileHref(profile.id);
      prof.innerHTML = '<i class="fa fa-user" aria-hidden="true"></i> Profilo';
      var lo = document.createElement("button");
      lo.type = "button";
      lo.className = "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--logout";
      lo.innerHTML = '<i class="fa fa-sign-out" aria-hidden="true"></i> Esci';
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
      actions.appendChild(prof);
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

  function isDashboardNavAllowed() {
    if (window.__VC_DASHBOARD_MENU_BLACKLISTED === true) return false;
    if (window.__VC_DASHBOARD_ACCESS_OK === true) return true;
    if (window.__VC_DASHBOARD_MENU_ALLOWED === true) return true;
    var link = document.getElementById("discord-dashboard-link");
    return Boolean(link && !navItemHidden(link) && !link.classList.contains("is-blacklisted"));
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
    try {
      var p = String(window.location.pathname || "").toLowerCase();
      if (p === "/staff" || p === "/staff/" || p.indexOf("/staff/") === 0) return false;
    } catch (e) {}
    return isStaffNavAllowed();
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
    lab.textContent = innerSpan ? String(innerSpan.textContent || "").trim() : String(item.textContent || "").trim();
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

  function rebuildGrid() {
    var gridRoot = document.getElementById("vc-mobile-nav-drawer-grid");
    var nav = document.querySelector("nav.vc-header-snav");
    if (!gridRoot || !nav) return;
    gridRoot.innerHTML = "";
    var kids = nav.children;
    var groupIndex = 0;
    var i = 0;
    while (i < kids.length) {
      var el = kids[i];
      if (!el || el.tagName === "SPAN") {
        i += 1;
        continue;
      }
      if (el.tagName === "A" && el.classList.contains("vc-snav-item")) {
        var sec = document.createElement("section");
        sec.className = "vc-mobile-nav-section";
        var h = document.createElement("h3");
        h.className = "vc-mobile-nav-section-title";
        h.textContent = groupSectionTitle(nav, groupIndex);
        groupIndex += 1;
        var g = document.createElement("div");
        g.className = "vc-mobile-nav-grid";
        while (i < kids.length) {
          var el2 = kids[i];
          if (!el2 || el2.tagName === "SPAN") {
            i += 1;
            continue;
          }
          if (!(el2.tagName === "A" && el2.classList.contains("vc-snav-item"))) break;
          var t = createTileFromItem(el2);
          if (t) g.appendChild(t);
          i += 1;
        }
        if (!g.children.length) continue;
        sec.appendChild(h);
        sec.appendChild(g);
        gridRoot.appendChild(sec);
        continue;
      }
      if (el.tagName === "DETAILS" && el.classList.contains("vc-snav-details")) {
        var sum = el.querySelector(".vc-snav-summary");
        var titleTxt = "MENU";
        if (sum) {
          var sp = sum.querySelector("span");
          titleTxt = sectionLabel(sp ? sp.textContent : sum.textContent);
        }
        var sec2 = document.createElement("section");
        sec2.className = "vc-mobile-nav-section";
        var h2 = document.createElement("h3");
        h2.className = "vc-mobile-nav-section-title";
        h2.textContent = titleTxt;
        var g2 = document.createElement("div");
        g2.className = "vc-mobile-nav-grid";
        var rows = el.querySelectorAll(".vc-snav-panel .vc-snav-row");
        var r;
        for (r = 0; r < rows.length; r += 1) {
          var tile = createTileFromRow(rows[r]);
          if (tile) g2.appendChild(tile);
        }
        if (!g2.children.length) {
          i += 1;
          continue;
        }
        sec2.appendChild(h2);
        sec2.appendChild(g2);
        gridRoot.appendChild(sec2);
      }
      i += 1;
    }
    var dashTile = createDashboardTile();
    var staffTile = createStaffTile();
    if (dashTile || staffTile) {
      var secAreas = document.createElement("section");
      secAreas.className = "vc-mobile-nav-section vc-mobile-nav-section--account-areas";
      var pair = document.createElement("div");
      pair.className = "vc-mobile-nav-pair";
      if (dashTile && staffTile) pair.classList.add("is-split");
      function makeAreaCol(titleKey, titleFallback, tile) {
        var col = document.createElement("div");
        col.className = "vc-mobile-nav-pair__col";
        var h = document.createElement("h3");
        h.className = "vc-mobile-nav-section-title";
        h.textContent = i18nLabel(titleKey, titleFallback).toUpperCase();
        col.appendChild(h);
        col.appendChild(tile);
        return col;
      }
      if (dashTile) pair.appendChild(makeAreaCol("footer.dashboard", "Dashboard", dashTile));
      if (staffTile) pair.appendChild(makeAreaCol("auth.staffArea", "Area Staff", staffTile));
      secAreas.appendChild(pair);
      gridRoot.appendChild(secAreas);
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