(function () {
  "use strict";
  /* Footer Staff = Guida + Compiti (Confessionale → Community) */
  /* pmOpsNavHide1: Compiti solo se canCompiti === true */
  /* Niente "Area staff" sulla navbar dashboard */
  /* boardsNoStaffNav1: niente sezione Staff sulla navbar bacheca */
  /* boardsSchedaMissCine1: niente Staff nav/footer bacheca anche con /en/… */
  /* confessionaleCommNav2: Confessionale mai nel menu Staff */

  function pathWithoutLangPrefix(pathname) {
    var raw = String(pathname || "/").toLowerCase();
    if (!raw || raw.charAt(0) !== "/") raw = "/" + raw;
    try {
      if (window.VcI18n && typeof window.VcI18n.stripLangPrefix === "function") {
        return String(window.VcI18n.stripLangPrefix(raw) || raw);
      }
    } catch (eStrip) {}
    return raw.replace(
      /^\/(en|it|es|fr|de|pt|pl|nl|ro|cs|sk|hu|bg|el|tr|ru|uk|ar|ja|ko|zh|hi|sv|da|fi|no|nb|nn|hr|sr|sl|lt|lv|et|id|ms|th|vi|he|fa|bn|ta|te|ml|kn|mr|gu|pa|sw|af|ca|eu|gl|is|ga|cy|sq|mk|bs|az|ka|hy|kk|uz|mn|ne|si|km|lo|my|am|yo|zu|xh|ig|ha)(?=\/|$)/i,
      "",
    ) || "/";
  }

  function sitePathname() {
    var p = pathWithoutLangPrefix(location.pathname || "/");
    p = String(p || "/").replace(/\/+$/, "") || "/";
    if (p.charAt(0) !== "/") p = "/" + p;
    return p;
  }

  function perms() {
    return (window.__VC_STAFF_PERMS && typeof window.__VC_STAFF_PERMS === "object" && window.__VC_STAFF_PERMS) || {};
  }

  function canShowCompitiNav() {
    var p = perms();
    /* pmOpsNavHide1: niente Compiti finché i perms non dicono sì (solo-PM / race cache) */
    if (Object.prototype.hasOwnProperty.call(p, "canCompiti")) return Boolean(p.canCompiti);
    if (p.permissions && Object.prototype.hasOwnProperty.call(p.permissions, "canCompiti")) {
      return Boolean(p.permissions.canCompiti);
    }
    if (Object.prototype.hasOwnProperty.call(p, "canConfessionale")) return Boolean(p.canConfessionale);
    if (p.permissions && Object.prototype.hasOwnProperty.call(p.permissions, "canConfessionale")) {
      return Boolean(p.permissions.canConfessionale);
    }
    return false;
  }

  /* staffConfDropKill3 / confessionaleCommNav3: Confessionale MAI nel menu Staff */
  function canShowConfessionaleNav() {
    return false;
  }

  function readStaffMenuStickyLocal() {
    try {
      if (window.__VC_STAFF_MENU_ALLOWED === true) return true;
      return sessionStorage.getItem("vc_staff_menu_allowed") === "1";
    } catch (eR) {
      return false;
    }
  }

  function isStaffNavContext() {
    if (!document.body) return false;
    /* authLogoutFix1: senza sessione non montare/ripristinare chrome staff */
    try {
      var t = String(localStorage.getItem("vc_discord_access_token") || "").trim();
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (!t || (exp && Date.now() >= exp)) return false;
    } catch (eTok) {
      return false;
    }
    if (document.body.classList.contains("vc-staff-area")) return true;
    /* footerStaffFirstStamp1: sticky subito (come navbar staffStickyFast1) */
    if (window.__VC_STAFF_MENU_ALLOWED === true) return true;
    if (readStaffMenuStickyLocal()) {
      try {
        window.__VC_STAFF_MENU_ALLOWED = true;
      } catch (eFl) {}
      return true;
    }
    return false;
  }

    function isDashboardSiteNav() {
    try {
      var p = sitePathname();
      if (p === "/dashboard" || p.indexOf("/dashboard/") === 0) return true;
      if (document.body && document.body.classList.contains("vc-dashboard-page")) return true;
    } catch (eDash) {}
    return false;
  }

  /* boardsNoStaffNav1 + boardsSchedaMissCine1 */
  function isBoardsSiteNav() {
    try {
      var p = sitePathname();
      if (p === "/bacheca" || p.indexOf("/bacheca/") === 0) return true;
      if (p === "/boards" || p.indexOf("/boards/") === 0) return true;
      if (document.body) {
        if (document.body.classList.contains("vc-boards-page")) return true;
        if (document.body.getAttribute("data-vc-boards-page")) return true;
      }
      if (document.documentElement && document.documentElement.classList.contains("vc-boards-header-nav")) {
        return true;
      }
      var snav = document.querySelector("nav.vc-header-snav.vc-header-snav--boards");
      if (snav) return true;
    } catch (eBoards) {}
    return false;
  }

  function isSpecializedSiteNav(snav) {
    try {
      var p = sitePathname();
      var raw = String(location.pathname || "/").toLowerCase();
      if (p === "/evento" || p.indexOf("/evento/") === 0 || raw.indexOf("/evento/") === 0 || raw === "/evento/") {
        return true;
      }
      /* Area staff non va nella navbar dashboard */
      if (isDashboardSiteNav()) return true;
      /* boardsNoStaffNav1: né su bacheca */
      if (isBoardsSiteNav()) return true;
      if (document.body) {
        if (document.body.classList.contains("vc-hw-page")) return true;
        if (document.body.classList.contains("vc-hw-points-page")) return true;
        if (document.body.classList.contains("vc-hw-hub-page")) return true;
      }
      if (!snav) return false;
      if (snav.querySelector && snav.querySelector(".vc-snav-item--event")) return true;
      var label = String(snav.getAttribute("aria-label") || "").toLowerCase();
      if (label.indexOf("evento") >= 0 || label.indexOf("hogwarts") >= 0) return true;
    } catch (eSpec) {}
    return false;
  }

  function isEventDedicatedNavPage() {
    try {
      var raw = String(location.pathname || "/").toLowerCase();
      var p = raw.replace(/\/+$/, "") || "/";
      if (p === "/evento" || p.indexOf("/evento/") === 0 || raw.indexOf("/evento/") === 0) return true;
      if (document.body && document.body.classList.contains("vc-hw-page")) return true;
    } catch (eEv) {}
    return isSpecializedSiteNav(document.querySelector("nav.vc-header-snav"));
  }

  function stripStaffMenuFromSnav(snav) {
    if (!snav) return;
    try {
      var nodes = snav.querySelectorAll(
        "[data-vc-staff-tools-nav], .vc-snav-details--staff, a.vc-snav-item[href*='/staff/'], a.vc-snav-row[href*='/staff/']",
      );
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    } catch (eStripStaff) {}
  }

  function readCachedDiscordUserId() {
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (!t || (exp && Date.now() >= exp)) return "";
      var fp = exp + "|" + String(t).slice(0, 32);
      var raw = sessionStorage.getItem("vc_discord_me_cache_v1");
      if (!raw) return "";
      var o = JSON.parse(raw);
      if (!o || o.v !== 1 || !o.user || String(o.fp || "") !== fp) return "";
      if (Date.now() - Number(o.at || 0) > 180000) return "";
      var uid = String(o.user.id || "").trim();
      return /^\d{17,20}$/.test(uid) ? uid : "";
    } catch (eCache) {
      return "";
    }
  }

  function profileStaffHref() {
    try {
      var p = window.__VC_DISCORD_PROFILE;
      var id = p && p.id ? String(p.id) : "";
      if (!/^\d{17,20}$/.test(id)) id = readCachedDiscordUserId();
      /* profileTabDefaultCommunity1: da menu staff apri Community (Staff resta switch manuale) */
      if (/^\d{17,20}$/.test(id)) return "/user/?id=" + encodeURIComponent(id);
    } catch (e) {}
    /* profileHrefNoLeaderboard1: senza id non aprire la classifica */
    return "#";
  }

  function pathName() {
    try {
      return String(location.pathname || "/").replace(/\/+$/, "") || "/";
    } catch (e) {
      return "/";
    }
  }

  function isActive(href) {
    var p = pathName();
    var h = String(href || "").replace(/\/+$/, "") || "/";
    if (h === "/staff") return p === "/staff";
    if (h === "/seratafilm") return p === "/seratafilm" || p.indexOf("/seratafilm/") === 0;
    if (h === "/staff/confessionale" || h === "/confessionale") {
      return (
        p === "/staff/confessionale" ||
        p.indexOf("/staff/confessionale/") === 0 ||
        p === "/confessionale" ||
        p.indexOf("/confessionale/") === 0
      );
    }
    return p === h || p.indexOf(h + "/") === 0;
  }

  function i18nT(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return String(v);
      }
    } catch (eT) {}
    return fallback;
  }

  function applyStaffI18n(root) {
    try {
      if (window.VcI18n && typeof window.VcI18n.apply === "function") {
        window.VcI18n.apply(root || document);
      }
    } catch (eApply) {}
  }

  function row(href, icon, label, show, i18nKey) {
    if (show === false) return "";
    var active = isActive(href);
    var lab = i18nKey ? i18nT(i18nKey, label) : label;
    return (
      '<a class="vc-snav-row' +
      (active ? " vc-snav-row--active" : "") +
      '" href="' +
      href +
      '"' +
      (active ? ' aria-current="page"' : "") +
      '><span class="vc-snav-row-ico" aria-hidden="true"><i class="fa fa-' +
      icon +
      '"></i></span><span' +
      (i18nKey ? ' data-i18n="' + i18nKey + '"' : "") +
      ">" +
      lab +
      "</span></a>"
    );
  }

  function ensureSiteBrand(header) {
    var brand =
      header.querySelector(".vc-header-bar > div:first-child a.vc-header-logo-link + a") ||
      header.querySelector('.vc-header-bar > div:first-child a.vc-header-site-name:not(.vc-snav-item):not(.vc-snav-row)') ||
      header.querySelector('a[href="/staff/"], a[href="/staff"]') ||
      header.querySelector(".vc-staff-nav-wide a.min-w-0.truncate");
    if (!brand) return;
        var home = "/";
    brand.setAttribute("href", home);
    brand.classList.add("vc-header-site-name");
    if (!/vinili/i.test(brand.textContent || "")) {
      brand.innerHTML = '<span class="text-emerald-300">Vinili &amp; Caffè</span>';
    }
    brand.setAttribute("aria-label", "Vai alla homepage");
  }

  function isStaffGuideNavHref(href) {
    return String(href || "")
      .toLowerCase()
      .indexOf("/staff/guida") >= 0;
  }

  function isStaffGuideNavLabel(label) {
    var t = String(label || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return t === "guida" || t === "guida staff" || t === "staff guide";
  }

  function isConfessionaleNavLabel(label) {
    var t = String(label || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return (
      t === "confessionale" ||
      t === "il confessionale" ||
      t === "confessional" ||
      t === "confessionnal" ||
      t === "confesionario" ||
      t === "confessional" ||
      t.indexOf("confessionale") >= 0 ||
      t.indexOf("confessional") >= 0
    );
  }

  function stripConfessionaleFromStaffMenus(root) {
    try {
      var scope = root || document;
      var menus = scope.querySelectorAll(
        "[data-vc-staff-tools-nav], .vc-snav-details--staff, [data-vc-footer-staff], .vc-mobile-nav-section--staff, .vc-mobile-nav-section--staff-guide, [data-vc-staff-section]",
      );
      for (var m = 0; m < menus.length; m += 1) {
        var menu = menus[m];
        var links = menu.querySelectorAll(
          'a[href*="/confessionale"], a[href*="/staff/confessionale"], a[data-vc-mobile-staff-confessionale], a[data-i18n="staff.confessionale"], [data-i18n="staff.confessionale"]',
        );
        for (var i = 0; i < links.length; i += 1) {
          var node = links[i];
          var a = node && node.closest ? node.closest("a") : node;
          if (a && a.parentNode) a.parentNode.removeChild(a);
        }
        var allA = menu.querySelectorAll("a");
        for (var k = 0; k < allA.length; k += 1) {
          var rowA = allA[k];
          var lab = String(rowA.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
          var i18n = "";
          try {
            var sp = rowA.querySelector("[data-i18n]");
            i18n = sp ? String(sp.getAttribute("data-i18n") || "") : "";
          } catch (eI) {}
          if (
            i18n === "staff.confessionale" ||
            i18n === "nav.confessionale" ||
            isConfessionaleNavLabel(lab) ||
            isConfessionaleNavHref(rowA.getAttribute("href"))
          ) {
            if (rowA.parentNode) rowA.parentNode.removeChild(rowA);
          }
        }
      }
      /* confessionaleCommNav3: anche details snav col titolo Staff senza class marker */
      var details = scope.querySelectorAll
        ? scope.querySelectorAll("nav.vc-header-snav details.vc-snav-details, details.vc-snav-details")
        : [];
      for (var d = 0; d < details.length; d += 1) {
        var det = details[d];
        var sum = det.querySelector(".vc-snav-summary span, .vc-snav-summary");
        var st = sum ? String(sum.textContent || "").replace(/\s+/g, " ").trim().toLowerCase() : "";
        if (st.indexOf("community") >= 0) continue;
        if (
          !(
            (det.classList && det.classList.contains("vc-snav-details--staff")) ||
            det.hasAttribute("data-vc-staff-tools-nav") ||
            st === "staff" ||
            st.indexOf("staff") >= 0 ||
            st === "area staff" ||
            st.indexOf("strumenti staff") >= 0
          )
        ) {
          continue;
        }
        var confRows = det.querySelectorAll(
          'a[href*="/confessionale"], a[href*="/staff/confessionale"], a[data-i18n="staff.confessionale"]',
        );
        for (var cr = 0; cr < confRows.length; cr += 1) {
          if (confRows[cr] && confRows[cr].parentNode) confRows[cr].parentNode.removeChild(confRows[cr]);
        }
      }
    } catch (eStripConf) {}
  }

  function watchStaffConfessionaleStrip() {
    try {
      if (window.__vcStaffConfStripWatch) return;
      window.__vcStaffConfStripWatch = true;
      var kill = function () {
        try {
          stripConfessionaleFromStaffMenus(document);
        } catch (eK) {}
      };
      kill();
      window.setTimeout(kill, 0);
      window.setTimeout(kill, 200);
      window.setTimeout(kill, 800);
      window.setTimeout(kill, 2000);
      /* cpuIdleHard1: niente setInterval 1.5s + MO forever (picchi CPU in PWA) */
      if (typeof MutationObserver === "function") {
        var mo = new MutationObserver(function () {
          kill();
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
        window.setTimeout(function () {
          try {
            mo.disconnect();
          } catch (eDisc) {}
        }, 4000);
      }
    } catch (eWatch) {}
  }

  function isCompitiNavHref(href) {
    var h = String(href || "").toLowerCase();
    return h.indexOf("/staff/compiti") >= 0;
  }

  function isCompitiNavLabel(label) {
    var t = String(label || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return t === "compiti" || t === "compiti staff" || t === "compiti settimanali";
  }

  function isAllowedStaffMenuLink(href, label) {
    if (isCompitiNavHref(href) || isCompitiNavLabel(label)) return canShowCompitiNav();
    if (isConfessionaleNavHref(href) || isConfessionaleNavLabel(label)) return canShowConfessionaleNav();
    return (
      isStaffGuideNavHref(href) ||
      isStaffGuideNavLabel(label)
    );
  }

    function enforceStaffMenuGuidaOnly(root) {
    try {
      var scope = root || document;
      var menus = scope.querySelectorAll(
        "[data-vc-staff-tools-nav], .vc-snav-details--staff",
      );
      for (var m = 0; m < menus.length; m++) {
        var menu = menus[m];
        if (
          menu.closest &&
          menu.closest(".vc-user-profile, #vc-user-profile-view, .vc-staff-pm-pt-btn")
        ) {
          continue;
        }
        var panel = menu.querySelector(".vc-snav-panel") || menu;
        var links = panel.querySelectorAll("a.vc-snav-row, a.vc-snav-item, a");
        var keptGuide = false;
        var keptCompiti = false;
        for (var i = 0; i < links.length; i++) {
          var a = links[i];
          var href = String(a.getAttribute("href") || "");
          var lab = "";
          try {
            var spans = a.querySelectorAll("span");
            for (var s = 0; s < spans.length; s++) {
              if (spans[s].classList.contains("vc-snav-row-ico")) continue;
              lab = String(spans[s].textContent || "").trim();
              if (lab) break;
            }
          } catch (eLab) {}
          if (!lab) lab = String(a.textContent || "").trim();
          if (isStaffGuideNavHref(href) || isStaffGuideNavLabel(lab)) {
            if (keptGuide) {
              if (a.parentNode) a.parentNode.removeChild(a);
            } else {
              keptGuide = true;
            }
            continue;
          }
          if (isConfessionaleNavHref(href) || isConfessionaleNavLabel(lab)) {
            if (a.parentNode) a.parentNode.removeChild(a);
            continue;
          }
          if (isCompitiNavHref(href) || isCompitiNavLabel(lab)) {
            if (!canShowCompitiNav()) {
              if (a.parentNode) a.parentNode.removeChild(a);
            } else if (keptCompiti) {
              if (a.parentNode) a.parentNode.removeChild(a);
            } else {
              keptCompiti = true;
              try {
                a.setAttribute("href", "/staff/compiti/");
              } catch (eHref2) {}
            }
            continue;
          }
          if (a.parentNode) a.parentNode.removeChild(a);
        }
        if (!keptGuide && panel) {
          panel.insertAdjacentHTML(
            "afterbegin",
            row("/staff/guida/", "book", "Guida", true, "staff.guide"),
          );
          keptGuide = true;
        }
        if (!keptCompiti && panel && canShowCompitiNav()) {
          panel.insertAdjacentHTML(
            "beforeend",
            row("/staff/compiti/", "check-square-o", "Compiti", true, "staff.compiti"),
          );
        }
      }
      stripConfessionaleFromStaffMenus(scope);
    } catch (eEnforce) {}
  }

  function staffFooterToolLinks() {
    var links = [{ href: "/staff/guida/", label: "Guida", key: "staff.guide" }];
    if (canShowCompitiNav()) {
      links.push({ href: "/staff/compiti/", label: "Compiti", key: "staff.compiti" });
    }
    return links;
  }

  function ensureStaffFooterColCss() {
    try {
      if (document.getElementById("vc-staff-footer-col-css")) return;
      var s = document.createElement("style");
      s.id = "vc-staff-footer-col-css";
      s.textContent =
        "@media (min-width:768px){" +
        "footer.vc-premium-footer .vc-premium-footer__navcols--with-staff," +
        "html body.vc-body>footer.vc-premium-footer .vc-premium-footer__navcols--with-staff," +
        "html body.vc-body>footer.vc-premium-footer .vc-premium-footer__navcols:has([data-vc-footer-staff='1']){" +
        "grid-template-columns:repeat(5,minmax(0,1fr))!important;" +
        "width:100%!important;max-width:100%!important;min-width:0!important}" +
        "}" +
        "@media (min-width:1024px){" +
        "html body.vc-body>footer.vc-premium-footer .vc-premium-footer__grid:has(.vc-premium-footer__navcols--with-staff)," +
        "html body.vc-body>footer.vc-premium-footer .vc-premium-footer__grid:has([data-vc-footer-staff='1']){" +
        "grid-template-columns:minmax(12rem,1fr) minmax(0,1.4fr)!important;min-width:0!important}" +
        "}";
      document.head.appendChild(s);
    } catch (eCss) {}
  }

  function removeStaffFooterColumns() {
    try {
      var nodes = document.querySelectorAll('[data-vc-footer-staff="1"]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
      var cols = document.querySelectorAll(".vc-premium-footer__navcols--with-staff");
      for (var j = 0; j < cols.length; j++) {
        cols[j].classList.remove("vc-premium-footer__navcols--with-staff");
      }
    } catch (eRm) {}
  }

  function injectStaffFooterColumns() {
    try {
      /* boardsSchedaMissCine1 / boardsFooterOnly1: mai colonna Staff sul footer bacheca */
      if (!isStaffNavContext() || isBoardsSiteNav()) {
        removeStaffFooterColumns();
        return;
      }
      ensureStaffFooterColCss();
      var footers = document.querySelectorAll("footer.vc-premium-footer");
      if (!footers || !footers.length) return;
      var links = staffFooterToolLinks();
      var lis = "";
      for (var i = 0; i < links.length; i++) {
        var item = links[i];
        var lab = item.key ? i18nT(item.key, item.label) : item.label;
        lis +=
          '<li><a href="' +
          String(item.href) +
          '"><span' +
          (item.key ? ' data-i18n="' + item.key + '"' : "") +
          ">" +
          String(lab) +
          "</span></a></li>";
      }
      var colHtml =
        '<nav class="vc-premium-footer__col" data-vc-footer-staff="1" aria-label="Staff">' +
        '<h2 class="vc-premium-footer__heading" data-i18n="nav.staff">Staff</h2>' +
        "<ul>" +
        lis +
        "</ul></nav>";
      for (var f = 0; f < footers.length; f++) {
        var footer = footers[f];
        if (!footer) continue;
        var navcols = footer.querySelector(".vc-premium-footer__navcols");
        if (!navcols) continue;
        navcols.classList.add("vc-premium-footer__navcols--with-staff");
        var existing = footer.querySelector('[data-vc-footer-staff="1"]');
        if (existing) {
          var wrap = document.createElement("div");
          wrap.innerHTML = colHtml;
          var nextCol = wrap.firstElementChild;
          if (nextCol && existing.parentNode) existing.parentNode.replaceChild(nextCol, existing);
        } else {
          navcols.insertAdjacentHTML("beforeend", colHtml);
        }
        applyStaffI18n(footer.querySelector('[data-vc-footer-staff="1"]') || footer);
      }
    } catch (eFoot) {}
  }

  function stripLegacyStaffNavRows(root) {
    try {
      var scope = root || document;
      var links = scope.querySelectorAll(
        'a.vc-snav-row[href*="/staff/inbox"], a.vc-snav-row[href*="/staff/pause"], a.vc-snav-row[href*="/staff/punti-tolti"], a.vc-snav-row[href*="/staff/organico"], a.vc-snav-row[href*="/staff/gestione"], a.vc-snav-item[href*="/staff/gestione"], a[href*="/staff/inbox"], a[href*="/staff/pause"], a[href*="/staff/punti-tolti"], a[href*="/staff/organico"], a[href*="/staff/gestione"], a[href*="notifications/?view=staff"]',
      );
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        if (a.closest && a.closest('[data-vc-footer-staff="1"], footer.vc-premium-footer')) continue;
                var inStaffMenu = a.closest
          ? a.closest(
              "[data-vc-staff-tools-nav], .vc-snav-details--staff, .vc-header-snav, #vc-mobile-nav-drawer, .vc-mobile-nav-drawer, header",
            )
          : null;
        if (!inStaffMenu) continue;
        if (a.closest && a.closest(".vc-staff-pm-pt-btn, .vc-staff-pm-pt-link, .vc-user-profile, #vc-user-profile-view")) {
          continue;
        }
                if (isStaffGuideNavHref(a.getAttribute("href"))) continue;
        if (a.parentNode) a.parentNode.removeChild(a);
      }
            var rows = scope.querySelectorAll(
        "[data-vc-staff-tools-nav] a.vc-snav-row, .vc-snav-details--staff a.vc-snav-row, .vc-header-snav a.vc-snav-item, #vc-mobile-nav-drawer a.vc-mobile-nav-tile",
      );
      for (var j = 0; j < rows.length; j++) {
        var el = rows[j];
        var lab = String(el.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        var href = String(el.getAttribute("href") || "").toLowerCase();
        if (isStaffGuideNavHref(href) || isStaffGuideNavLabel(lab)) continue;
        if (
          lab === "gestione" ||
          lab === "gestione staff" ||
          lab === "organico" ||
          lab === "organico staff" ||
          lab === "pause" ||
          lab === "calendario pause" ||
          lab === "inbox" ||
          lab === "inbox staff" ||
          lab === "punti tolti" ||
          href.indexOf("/staff/gestione") >= 0 ||
          href.indexOf("/staff/organico") >= 0 ||
          href.indexOf("/staff/pause") >= 0 ||
          href.indexOf("/staff/inbox") >= 0 ||
          href.indexOf("/staff/punti-tolti") >= 0
        ) {
          if (el.parentNode) el.parentNode.removeChild(el);
        }
      }
            var details = scope.querySelectorAll("header details.vc-snav-details, .vc-header-snav details.vc-snav-details");
      for (var d = 0; d < details.length; d++) {
        var det = details[d];
        var sum = det.querySelector(".vc-snav-summary span, .vc-snav-summary");
        var title = sum ? String(sum.textContent || "").replace(/\s+/g, " ").trim().toLowerCase() : "";
        if (title === "gestione" || title === "gestione staff") {
          if (det.parentNode) det.parentNode.removeChild(det);
          continue;
        }
      }
      enforceStaffMenuGuidaOnly(scope);
    } catch (eStrip) {}
  }

  function findStaffHeader() {
    try {
      var h =
        document.querySelector("body > .vc-staff-app > header") ||
        document.querySelector("body > header") ||
        document.querySelector(".vc-staff-app header");
      if (h) return h;
      var shell = document.querySelector("header .vc-nav-shell");
      if (shell && shell.closest) return shell.closest("header");
      return document.querySelector("header");
    } catch (eH) {
      return document.querySelector("header");
    }
  }

  function staffNavAlreadyPainted(header) {
    try {
      var root = header || document;
      return Boolean(root.querySelector("[data-vc-staff-tools-nav], .vc-snav-details--staff"));
    } catch (eP) {
      return false;
    }
  }

  /* navStaffFirstStamp1: categoria Staff in navbar al primo stamp (come footer) */
  function paintStaffNavEarly() {
    try {
      if (!isStaffNavContext() || isBoardsSiteNav() || isEventDedicatedNavPage()) return false;
      var header = findStaffHeader();
      if (!header) return false;
      var shell = header.querySelector(".vc-nav-shell");
      if (!shell) return false;
      injectStaffMenu(header);
      return staffNavAlreadyPainted(header);
    } catch (eEarlyNav) {
      return false;
    }
  }

  function injectStaffMenu(header) {
    if (!header) return false;
    var shell = header.querySelector(".vc-nav-shell");
    if (!shell) return false;

    var bar = shell.querySelector(".vc-header-bar") || shell;
    var snav = bar.querySelector("nav.vc-header-snav");
            if (isSpecializedSiteNav(snav) || isEventDedicatedNavPage()) {
      stripStaffMenuFromSnav(snav);
      var stray = header.querySelectorAll("[data-vc-staff-tools-nav], .vc-snav-details--staff");
      for (var s = 0; s < stray.length; s++) {
        var node = stray[s];
        if (node && node.parentNode) node.parentNode.removeChild(node);
      }
      stripLegacyStaffNavRows(header);
      watchEventNavStaffStrip(header);
      return false;
    }

    var p = perms();
    var staffOk = Boolean(p.ok) || window.__VC_STAFF_MENU_ALLOWED === true;
            var html =
      '<details class="vc-snav-details vc-snav-details--staff" data-vc-staff-tools-nav>' +
      '<summary class="vc-snav-summary"><i class="fa fa-shield" aria-hidden="true"></i><span data-i18n="nav.staff">Staff</span><i class="fa fa-chevron-down vc-snav-chev text-[0.65rem] opacity-80" aria-hidden="true"></i></summary>' +
      '<div class="vc-snav-panel">' +
      row("/staff/guida/", "book", "Guida", true, "staff.guide") +
      (canShowCompitiNav()
        ? row("/staff/compiti/", "check-square-o", "Compiti", true, "staff.compiti")
        : "") +
      "</div></details>";

    var existing = header.querySelector("[data-vc-staff-tools-nav]");
    if (existing) {
      var wrap = document.createElement("div");
      wrap.innerHTML = html;
      var next = wrap.firstElementChild;
      if (next && existing.parentNode) existing.parentNode.replaceChild(next, existing);
      stripLegacyStaffNavRows(header);
      stripConfessionaleFromStaffMenus(header);
      return true;
    }

    if (snav) {
      snav.insertAdjacentHTML("beforeend", html);
      stripLegacyStaffNavRows(header);
      stripConfessionaleFromStaffMenus(header);
      return true;
    }

        var brandWrap = bar.querySelector(".flex.min-w-0") || bar.firstElementChild;
    var nav = document.createElement("nav");
    nav.className =
      "vc-header-snav vc-glass flex max-w-full flex-wrap items-center justify-center gap-0.5 px-1.5 py-1 sm:gap-1 sm:px-2";
    nav.setAttribute("aria-label", "Staff");
    nav.innerHTML = html;
    if (brandWrap && brandWrap.parentNode) {
      brandWrap.parentNode.insertBefore(nav, brandWrap.nextSibling);
    } else {
      bar.appendChild(nav);
    }
    stripLegacyStaffNavRows(header);
    stripConfessionaleFromStaffMenus(header);
    return true;
  }

  function watchEventNavStaffStrip(header) {
    try {
      if (!header || header.getAttribute("data-vc-evento-staff-strip") === "1") return;
      if (!isEventDedicatedNavPage() && !isSpecializedSiteNav(header.querySelector("nav.vc-header-snav"))) return;
      header.setAttribute("data-vc-evento-staff-strip", "1");
      var kill = function () {
        var nodes = header.querySelectorAll("[data-vc-staff-tools-nav], .vc-snav-details--staff");
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }
        stripStaffMenuFromSnav(header.querySelector("nav.vc-header-snav"));
      };
      kill();
      var mo = new MutationObserver(function () {
        kill();
      });
      mo.observe(header, { childList: true, subtree: true });
      window.setTimeout(kill, 0);
      window.setTimeout(kill, 250);
      window.setTimeout(kill, 1000);
      window.setTimeout(kill, 3000);
    } catch (eWatch) {}
  }

  function ensureNotifSlot(header) {
    var actions = header.querySelector("#header-quick-actions");
    if (!actions) return;
    if (actions.querySelector("#vc-notif-dropdown")) {
      normalizeHeaderQuickActionsOrder(actions);
      return;
    }
    var toggle = actions.querySelector("#vc-mobile-nav-toggle");
    var loginBtn = actions.querySelector("#discord-login-btn, [data-vc-discord-login]");
    var html =
      '<details class="vc-notif-dropdown" id="vc-notif-dropdown">' +
      '<summary class="vc-icon-btn vc-notif-summary relative inline-flex" aria-label="Notifiche"><i class="fa fa-bell-o" aria-hidden="true"></i><span class="vc-notif-badge" id="vc-notif-badge" hidden aria-live="polite">0</span></summary>' +
      '<div class="vc-notif-panel" role="region" aria-label="Elenco notifiche">' +
      '<div class="vc-notif-panel-head"><div class="vc-notif-panel-head-start"><span class="vc-notif-panel-head-ico" aria-hidden="true"><i class="fa fa-bell-o"></i></span><div class="vc-notif-panel-head-text"><span class="vc-notif-panel-title">Notifiche</span><span class="vc-notif-panel-sub" id="vc-notif-unread-sub">0 non lette</span></div></div>' +
      '<div class="vc-notif-panel-head-actions"><button type="button" class="vc-notif-action" id="vc-notif-clear-all" title="Elimina tutte" aria-label="Elimina tutte"><i class="fa fa-trash-o" aria-hidden="true"></i></button></div></div>' +
      '<div class="vc-notif-panel-body"><div class="vc-notif-empty-wrap" id="vc-notif-empty-wrap"><div class="vc-notif-empty"><div class="vc-notif-empty-ico" aria-hidden="true"><i class="fa fa-bell-o"></i></div><p class="vc-notif-empty-title">Nessuna notifica</p><p class="vc-notif-empty-sub">Sei tutto aggiornato!</p></div></div><div class="vc-notif-list-wrap" id="vc-notif-list-wrap"><ul class="vc-notif-list" id="vc-notif-list" role="list"></ul></div></div>' +
      '<div class="vc-notif-panel-foot" id="vc-notif-panel-foot"><a href="/notifications/" class="vc-notif-see-all" id="vc-notif-see-all">Vedi tutte le notifiche <i class="fa fa-chevron-right" aria-hidden="true"></i></a></div></div></details>';
    var anchor = toggle || loginBtn;
    if (anchor) anchor.insertAdjacentHTML("beforebegin", html);
    else actions.insertAdjacentHTML("afterbegin", html);
    normalizeHeaderQuickActionsOrder(actions);
  }

  function normalizeHeaderQuickActionsOrder(actions) {
    if (!actions) {
      actions = document.getElementById("header-quick-actions");
    }
    if (!actions) return;
    if (typeof window.__vcNormalizeHeaderQuickActionsOrder === "function") {
      window.__vcNormalizeHeaderQuickActionsOrder(actions);
      return;
    }
    var promo = actions.querySelector("#vc-header-promo-btn, .vc-header-promo-btn");
    var notif = actions.querySelector("#vc-notif-dropdown");
    var toggle = actions.querySelector("#vc-mobile-nav-toggle");
    var loginBtn = actions.querySelector("#discord-login-btn, [data-vc-discord-login]");
    var loginState = actions.querySelector("#discord-login-state");
    var cursor = actions.firstElementChild;
    function place(el) {
      if (!el || el.parentElement !== actions) return;
      actions.insertBefore(el, cursor);
      cursor = el.nextElementSibling;
    }
    place(promo);
    place(notif);
    place(toggle);
    place(loginBtn);
    place(loginState);
  }

  function ensureHeaderPromo() {
    try {
      if (!window.__VC_HEADER_PROMO) {
        window.__VC_HEADER_PROMO = {
          eventUrl: "/evento",
          candidatureUrl: "/candidature",
          event: {
            enabled: true,
            previewMode: false,
            startDate: "2026-06-01T12:00:00",
            sortingStartDate: "2026-06-01T12:00:00",
            endDate: "2026-09-01T12:00:00",
            timezone: "Europe/Rome",
          },
        };
      }
    } catch (eCfg) {}

    var actions = document.getElementById("header-quick-actions");
    if (!actions) return;

    function resolvePromoMode(cfg) {
      try {
        var event = cfg && cfg.event;
        if (!event || event.enabled === false || event.previewMode === true) return "candidature";
        var start = Number(event.startMs);
        var end = Number(event.endMs);
        if (!Number.isFinite(start)) {
          var sd = String(event.sortingStartDate || event.startDate || "").trim();
          start = new Date(sd.indexOf("T") >= 0 ? sd : sd + "T00:00:00").getTime();
        }
        if (!Number.isFinite(end)) {
          var ed = String(event.endDate || "").trim();
          end = new Date(ed.indexOf("T") >= 0 ? ed : ed + "T23:59:59.999").getTime();
        }
        var now = Date.now();
        if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) return "event";
      } catch (eMode) {}
      return "candidature";
    }

    var cfg = window.__VC_HEADER_PROMO || {};
    var mode = resolvePromoMode(cfg);
    var isEvent = mode === "event";
    var btn = document.getElementById("vc-header-promo-btn");
    var needPaint =
      !btn ||
      (isEvent && !btn.classList.contains("vc-header-promo-btn--event")) ||
      (!isEvent && !btn.classList.contains("vc-header-promo-btn--candidature"));
    if (needPaint) {
      if (!btn) {
        btn = document.createElement("a");
        btn.id = "vc-header-promo-btn";
        var notif = actions.querySelector("#vc-notif-dropdown");
        if (notif) actions.insertBefore(btn, notif);
        else actions.insertAdjacentElement("afterbegin", btn);
      }
      btn.className = "vc-header-promo-btn " + (isEvent ? "vc-header-promo-btn--event" : "vc-header-promo-btn--candidature");
      btn.href = isEvent ? cfg.eventUrl || "/evento" : cfg.candidatureUrl || "/candidature";
      btn.hidden = false;
      btn.removeAttribute("aria-hidden");
      btn.innerHTML =
        '<span class="vc-header-promo-btn__dot" aria-hidden="true"></span>' +
        '<span class="vc-header-promo-btn__clip"><span class="vc-header-promo-btn__track">' +
        '<span class="vc-header-promo-btn__unit"><span class="vc-header-promo-btn__label" data-i18n="' +
        (isEvent ? "header.promo.eventLabel" : "header.promo.appsLabel") +
        '">' +
        (isEvent ? "Evento" : "Candidature") +
        '</span><span class="vc-header-promo-btn__badge" data-i18n="' +
        (isEvent ? "header.promo.eventBadgeShort" : "header.promo.appsBadge") +
        '">' +
        (isEvent ? "ATTIVO" : "APERTE") +
        "</span></span></span></span>";
      try {
        if (window.VcI18n && typeof window.VcI18n.t === "function") {
          var lab = btn.querySelector(".vc-header-promo-btn__label");
          var bad = btn.querySelector(".vc-header-promo-btn__badge");
          if (lab) {
            lab.textContent = isEvent
              ? window.VcI18n.t("header.promo.eventLabel") || lab.textContent
              : window.VcI18n.t("header.promo.appsLabel") || lab.textContent;
          }
          if (bad) {
            bad.textContent = isEvent
              ? window.VcI18n.t("header.promo.eventBadgeShort") || bad.textContent
              : window.VcI18n.t("header.promo.appsBadge") || bad.textContent;
          }
          btn.setAttribute(
            "aria-label",
            isEvent
              ? window.VcI18n.t("header.promo.eventAria") || "Evento Hogwarts attivo – vai al calendario"
              : window.VcI18n.t("header.promo.appsAria") || "Candidature staff aperte",
          );
          btn.setAttribute(
            "data-i18n-attr",
            isEvent ? "aria-label:header.promo.eventAria" : "aria-label:header.promo.appsAria",
          );
        }
      } catch (eI18n) {}
    }

    normalizeHeaderQuickActionsOrder(actions);

    if (!document.querySelector('script[src*="vc-header-promo.js"]')) {
      var s = document.createElement("script");
      s.src = "/js/vc-header-promo.js?v=20260926candPillGuest1";
      s.async = false;
      (document.head || document.body || document.documentElement).appendChild(s);
    } else {
      try {
        window.dispatchEvent(new CustomEvent("vc:langchange"));
      } catch (eBoot) {}
    }
  }

  function ensureStaffDrawerShell() {
    var drawer = document.getElementById("vc-mobile-nav-drawer");
    if (drawer && drawer.querySelector(".vc-mobile-nav-drawer__panel")) {
      try {
        if (document.body && drawer.parentElement !== document.body) document.body.appendChild(drawer);
      } catch (eMove) {}
      return drawer;
    }
    try {
      if (typeof window.__vcMobileNavRebuild === "function") window.__vcMobileNavRebuild();
    } catch (eRebuild) {}
    drawer = document.getElementById("vc-mobile-nav-drawer");
    if (drawer && drawer.querySelector(".vc-mobile-nav-drawer__panel")) {
      try {
        if (document.body && drawer.parentElement !== document.body) document.body.appendChild(drawer);
      } catch (eMove2) {}
      return drawer;
    }
    drawer = document.createElement("div");
    drawer.id = "vc-mobile-nav-drawer";
    drawer.className = "vc-mobile-nav-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Menu di navigazione");
    drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML =
      '<div class="vc-mobile-nav-drawer__backdrop" tabindex="-1"></div>' +
      '<div class="vc-mobile-nav-drawer__panel">' +
      '<div class="vc-mobile-nav-drawer__top">' +
      '<div class="vc-mobile-nav-drawer__brand" id="vc-mobile-nav-drawer-brand"></div>' +
      '<div class="vc-mobile-nav-drawer__top-actions">' +
      '<button type="button" class="vc-mobile-nav-drawer__close vc-icon-btn" id="vc-mobile-nav-close" aria-label="Chiudi menu"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div></div>" +
      '<div class="vc-mobile-nav-drawer__scroll" id="vc-mobile-nav-drawer-grid"></div>' +
      '<div class="vc-mobile-nav-drawer__footer" id="vc-mobile-nav-drawer-footer"></div>' +
      "</div>";
    try {
      (document.body || document.documentElement).appendChild(drawer);
    } catch (eAppend) {}
    return drawer;
  }

  function fillStaffDrawerFromNav() {
    var gridRoot = document.getElementById("vc-mobile-nav-drawer-grid");
    if (!gridRoot) return false;

    function addSection(title, items) {
      if (!items || !items.length) return;
      var titleUp = String(title || "MENU").toUpperCase();
      var pinned =
        (titleUp === "PRINCIPALE" || titleUp === "SITO" || titleUp === "MAIN") &&
        titleUp !== "STAFF" &&
        titleUp.indexOf("STAFF") !== 0;
      var sec = document.createElement(pinned ? "section" : "details");
      sec.className = "vc-mobile-nav-section" + (pinned ? " vc-mobile-nav-section--pinned" : "");
      if (titleUp === "STAFF" || titleUp.indexOf("STAFF") === 0) {
        sec.classList.add("vc-mobile-nav-section--staff-guide");
        sec.setAttribute("data-vc-staff-section", "1");
      }
      if (!pinned) sec.setAttribute("open", "");
      var h = document.createElement(pinned ? "h3" : "summary");
      h.className = "vc-mobile-nav-section-title";
      var txt = document.createElement("span");
      txt.className = "vc-mobile-nav-section-title__txt";
      txt.textContent = titleUp;
      h.appendChild(txt);
      if (!pinned) {
        var chev = document.createElement("i");
        chev.className = "fa fa-chevron-down vc-mobile-nav-section-chev";
        chev.setAttribute("aria-hidden", "true");
        h.appendChild(chev);
        h.addEventListener("click", function (ev) {
          try {
            if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
          } catch (ePrev) {}
          try {
            sec.open = !sec.open;
          } catch (eOpen) {}
        });
      }
      var g = document.createElement("div");
      g.className = "vc-mobile-nav-grid";
      for (var i = 0; i < items.length; i += 1) {
        var it = items[i];
        if (!it || !it.href) continue;
        var a = document.createElement("a");
        a.className = "vc-mobile-nav-tile";
        a.href = it.href;
        a.innerHTML =
          '<span class="vc-mobile-nav-tile-ico" aria-hidden="true"><i class="fa ' +
          (it.icon || "fa-circle-o") +
          '"></i></span><span class="vc-mobile-nav-tile-label"' +
          (it.i18nKey ? ' data-i18n="' + it.i18nKey + '"' : "") +
          ">" +
          String(it.label || it.href) +
          "</span>";
        if (it.active || isActive(it.href)) {
          a.classList.add("is-active");
          a.setAttribute("aria-current", "page");
        }
        a.addEventListener("click", function () {
          setStaffDrawerOpen(false);
        });
        g.appendChild(a);
      }
      if (!g.children.length) return;
      sec.appendChild(h);
      sec.appendChild(g);
      gridRoot.appendChild(sec);
    }

    function iconFromEl(el) {
      var fi = el && el.querySelector ? el.querySelector("i.fa") : null;
      if (!fi) return "fa-circle-o";
      var cls = String(fi.className || "").split(/\s+/);
      for (var c = 0; c < cls.length; c += 1) {
        if (cls[c].indexOf("fa-") === 0 && cls[c] !== "fa") return cls[c];
      }
      return "fa-circle-o";
    }

    gridRoot.innerHTML = "";
    var nav = document.querySelector("header nav.vc-header-snav, nav.vc-header-snav");
    var filled = 0;
    if (nav) {
      var kids = nav.children;
      var i = 0;
      while (i < kids.length) {
        var el = kids[i];
        if (!el || el.tagName === "SPAN") {
          i += 1;
          continue;
        }
        if (el.tagName === "A" && el.classList.contains("vc-snav-item")) {
          var mainItems = [];
          while (i < kids.length) {
            var el2 = kids[i];
            if (!el2 || el2.tagName === "SPAN") {
              i += 1;
              continue;
            }
            if (!(el2.tagName === "A" && el2.classList.contains("vc-snav-item"))) break;
            var href2 = el2.getAttribute("href");
            if (href2) {
              var labEl = el2.querySelector("span");
              var labMain = labEl ? String(labEl.textContent || "").trim() : String(el2.textContent || "").trim();
              var labMainNorm = labMain.replace(/\s+/g, " ").trim().toLowerCase();
              /* hamFootOnly1: Bacheca/Dashboard fuori da PRINCIPALE (solo footer) */
              if (
                String(href2).toLowerCase().indexOf("/staff/gestione") >= 0 ||
                String(href2).toLowerCase().indexOf("/bacheca") >= 0 ||
                String(href2).toLowerCase().indexOf("/boards") >= 0 ||
                String(href2).toLowerCase().indexOf("/dashboard") >= 0 ||
                labMainNorm === "gestione" ||
                labMainNorm === "gestione staff" ||
                labMainNorm === "area staff" ||
                labMainNorm === "staff area" ||
                labMainNorm === "bacheca" ||
                labMainNorm === "boards" ||
                labMainNorm === "dashboard"
              ) {
                i += 1;
                continue;
              }
              mainItems.push({
                href: href2,
                label: labMain,
                icon: iconFromEl(el2),
                active:
                  el2.classList.contains("is-active") ||
                  el2.classList.contains("vc-snav-item--active") ||
                  el2.getAttribute("aria-current") === "page" ||
                  isActive(href2),
              });
            }
            i += 1;
          }
          addSection("Principale", mainItems);
          filled += mainItems.length;
          continue;
        }
        if (el.tagName === "DETAILS" && el.classList.contains("vc-snav-details")) {
          var sum = el.querySelector(".vc-snav-summary span, .vc-snav-summary");
          var title = sum ? String(sum.textContent || "").trim() : "Menu";
                    var titleNorm = title.replace(/\s+/g, " ").trim().toLowerCase();
          var isStaffBlock =
            /^area\s*staff$/.test(titleNorm) ||
            titleNorm === "staff area" ||
            titleNorm === "staff" ||
            titleNorm === "gestione" ||
            titleNorm === "gestione staff" ||
            (el.classList && el.classList.contains("vc-snav-details--staff")) ||
            el.hasAttribute("data-vc-staff-tools-nav");
          if (isStaffBlock) {
            var guideItems = [];
            var guideRows = el.querySelectorAll(".vc-snav-panel .vc-snav-row");
            for (var gr = 0; gr < guideRows.length; gr += 1) {
              var grow = guideRows[gr];
              var ghref = grow.getAttribute("href");
              if (!ghref) continue;
              if (String(ghref).toLowerCase().indexOf("/staff/gestione") >= 0) continue;
              var glabEl = grow.querySelector("span:not(.vc-snav-row-ico)");
              var glab = glabEl ? String(glabEl.textContent || "").trim() : String(grow.textContent || "").trim();
              var glabNorm = glab.replace(/\s+/g, " ").trim().toLowerCase();
              if (glabNorm === "gestione" || glabNorm === "gestione staff" || glabNorm === "area staff") continue;
              if (
                String(ghref).toLowerCase().indexOf("/staff/guida") >= 0 ||
                glabNorm === "guida" ||
                glabNorm === "guida staff" ||
                String(ghref).toLowerCase().indexOf("/staff/compiti") >= 0 ||
                glabNorm === "compiti" ||
                glabNorm === "compiti staff" ||
                glabNorm === "compiti settimanali"
              ) {
                var isConfItem =
                  String(ghref).toLowerCase().indexOf("/confessionale") >= 0 ||
                  glabNorm === "confessionale" ||
                  glabNorm === "il confessionale" ||
                  isConfessionaleNavLabel(glabNorm);
                if (isConfItem) continue;
                var isCompitiItem =
                  String(ghref).toLowerCase().indexOf("/staff/compiti") >= 0 ||
                  glabNorm === "compiti" ||
                  glabNorm === "compiti staff" ||
                  glabNorm === "compiti settimanali";
                if (isCompitiItem && !canShowCompitiNav()) continue;
                var itemLabel = glab || i18nT("staff.guide", "Guida");
                var itemKey = "staff.guide";
                if (isCompitiItem) {
                  itemLabel = glab || i18nT("staff.compiti", "Compiti");
                  itemKey = "staff.compiti";
                }
                guideItems.push({
                  href: ghref,
                  label: itemLabel,
                  i18nKey: itemKey,
                  icon: iconFromEl(grow),
                  active:
                    grow.classList.contains("is-active") ||
                    grow.classList.contains("vc-snav-row--active") ||
                    grow.getAttribute("aria-current") === "page" ||
                    isActive(ghref),
                });
              }
            }
            if (!guideItems.length) {
              guideItems.push({
                href: "/staff/guida/",
                label: i18nT("staff.guide", "Guida"),
                i18nKey: "staff.guide",
                icon: "fa-book",
                active: isActive("/staff/guida/"),
              });
            }
            var hasCompiti = false;
            for (var ci = 0; ci < guideItems.length; ci += 1) {
              var giHref = String(guideItems[ci].href || "").toLowerCase();
              if (giHref.indexOf("/staff/compiti") >= 0) hasCompiti = true;
            }
            if (!hasCompiti && canShowCompitiNav()) {
              guideItems.push({
                href: "/staff/compiti/",
                label: i18nT("staff.compiti", "Compiti"),
                i18nKey: "staff.compiti",
                icon: "fa-check-square-o",
                active: isActive("/staff/compiti/"),
              });
            }
            addSection("Staff", guideItems);
            filled += guideItems.length;
            i += 1;
            continue;
          }
          var rows = el.querySelectorAll(".vc-snav-panel .vc-snav-row");
          var detailItems = [];
          var seenTicket = false;
          for (var r = 0; r < rows.length; r += 1) {
            var row = rows[r];
            var href = row.getAttribute("href");
            if (!href) continue;
            var lab = row.querySelector("span:not(.vc-snav-row-ico)");
            var labTxt = lab ? String(lab.textContent || "").trim() : String(row.textContent || "").trim();
            var labNorm = labTxt.replace(/\s+/g, " ").trim().toLowerCase();
            if (labNorm === "gestione" || labNorm === "gestione staff" || labNorm === "area staff") continue;
            var isTicket =
              labNorm === "tickets" ||
              Boolean(row.querySelector(".fa-ticket")) ||
              String(href).toLowerCase().indexOf("/tickets") >= 0;
            if (isTicket) {
              if (seenTicket) continue;
              seenTicket = true;
            }
            detailItems.push({
              href: href,
              label: labTxt,
              icon: iconFromEl(row),
              active:
                row.classList.contains("is-active") ||
                row.classList.contains("vc-snav-row--active") ||
                row.getAttribute("aria-current") === "page" ||
                isActive(href),
            });
          }
          addSection(title, detailItems);
          filled += detailItems.length;
        }
        i += 1;
      }
    }

    try {
      stripConfessionaleFromStaffMenus(gridRoot);
      stripConfessionaleFromStaffMenus(document);
    } catch (eStripHam) {}

    if (filled < 1) {
      addSection("Principale", [
        { href: "/", label: "Home", icon: "fa-home" },
        { href: "/wiki/", label: "Wiki", icon: "fa-map-o" },
        { href: "/sponsor/", label: "Sponsor", icon: "fa-handshake-o" },
      ]);
      filled = 1;
    }

    try {
      /* boardsNoStaffNav1: niente sezione Staff nel drawer su bacheca/dashboard/evento */
      if (!isEventDedicatedNavPage() && !isSpecializedSiteNav(null)) {
        var staffOk =
          window.__VC_STAFF_MENU_ALLOWED === true ||
          Boolean(perms().ok) ||
          Boolean(document.querySelector("[data-vc-staff-tools-nav], .vc-snav-details--staff"));
        var hasGuide = Boolean(gridRoot.querySelector('a[href*="/staff/guida"]'));
        var hasCompiti = Boolean(gridRoot.querySelector('a[href*="/staff/compiti"]'));
        if (!hasGuide && staffOk) {
          var staffTiles = [
            {
              href: "/staff/guida/",
              label: i18nT("staff.guide", "Guida"),
              i18nKey: "staff.guide",
              icon: "fa-book",
              active: isActive("/staff/guida/"),
            },
          ];
          if (canShowCompitiNav()) {
            staffTiles.push({
              href: "/staff/compiti/",
              label: i18nT("staff.compiti", "Compiti"),
              i18nKey: "staff.compiti",
              icon: "fa-check-square-o",
              active: isActive("/staff/compiti/"),
            });
          }
          addSection("Staff", staffTiles);
        } else if (hasGuide && !hasCompiti && canShowCompitiNav()) {
          var guideLink = gridRoot.querySelector('a[href*="/staff/guida"]');
          var guideGrid = guideLink && guideLink.closest ? guideLink.closest(".vc-mobile-nav-grid") : null;
          if (guideGrid) {
            if (!hasCompiti && canShowCompitiNav()) {
              var compitiA = document.createElement("a");
              compitiA.className = "vc-mobile-nav-tile";
              compitiA.href = "/staff/compiti/";
              compitiA.innerHTML =
                '<span class="vc-mobile-nav-tile-ico" aria-hidden="true"><i class="fa fa-check-square-o"></i></span>' +
                '<span class="vc-mobile-nav-tile-label" data-i18n="staff.compiti">' +
                i18nT("staff.compiti", "Compiti") +
                "</span>";
              if (isActive("/staff/compiti/")) {
                compitiA.classList.add("is-active");
                compitiA.setAttribute("aria-current", "page");
              }
              compitiA.addEventListener("click", function () {
                setStaffDrawerOpen(false);
              });
              guideGrid.appendChild(compitiA);
            }
          }
        }
      }
    } catch (eGuide) {}

    try {
      var brand = document.getElementById("vc-mobile-nav-drawer-brand");
      if (brand && !brand.childNodes.length) {
        var brandCol = document.querySelector(".vc-header-bar > div:first-child");
        var logo = brandCol && brandCol.querySelector("a.vc-header-logo-link");
        var name = brandCol && brandCol.querySelector("a.vc-header-logo-link + a");
        if (logo) brand.appendChild(logo.cloneNode(true));
        if (name) brand.appendChild(name.cloneNode(true));
      }
    } catch (eBrand) {}

    return filled > 0 || gridRoot.children.length > 0;
  }

  function staffAvatarUrl(u) {
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

  function staffAccountDisplayName(profile) {
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

  function readCachedProfileForStaffNav() {
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

  function syncStaffDrawerFooter() {
    try {
      if (typeof window.__vcMobileNavSyncFooter === "function") {
        window.__vcMobileNavSyncFooter();
        var footCheck = document.getElementById("vc-mobile-nav-drawer-footer");
        if (footCheck && footCheck.children.length) return;
      }
    } catch (eSync) {}

    var foot = document.getElementById("vc-mobile-nav-drawer-footer");
    if (!foot) return;
    foot.innerHTML = "";

    var profile = null;
    try {
      profile = window.__VC_DISCORD_PROFILE || readCachedProfileForStaffNav();
    } catch (eP) {}
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

    if (hasToken && !profile) {
      foot.innerHTML =
        '<div class="vc-mobile-nav-footer__account" aria-busy="true">' +
        '<div class="vc-mobile-nav-footer__who">' +
        '<div class="vc-mobile-nav-footer__account-start"><span class="vc-mobile-nav-footer__avatar vc-mobile-nav-footer__avatar--fb" aria-hidden="true"><span class="vc-ui-spinner"></span></span></div>' +
        '<div class="vc-mobile-nav-footer__meta">' +
        '<span class="vc-mobile-nav-footer__name">Verifica sessione…</span>' +
        '<span class="vc-mobile-nav-footer__hint">Account Discord</span>' +
        "</div></div></div>";
      return;
    }

    if (profile && (hasToken || profile.id)) {
      var wrap = document.createElement("div");
      wrap.className = "vc-mobile-nav-footer__account";
      var who = document.createElement("div");
      who.className = "vc-mobile-nav-footer__who";
      var left = document.createElement("div");
      left.className = "vc-mobile-nav-footer__account-start";
      var imgUrl = staffAvatarUrl(profile);
      if (imgUrl) {
        var im = document.createElement("img");
        im.className = "vc-mobile-nav-footer__avatar";
        im.src = imgUrl;
        im.alt = "";
        im.width = 40;
        im.height = 40;
        left.appendChild(im);
      } else {
        left.innerHTML =
          '<span class="vc-mobile-nav-footer__avatar vc-mobile-nav-footer__avatar--fb" aria-hidden="true"><i class="fa fa-user"></i></span>';
      }
      var meta = document.createElement("div");
      meta.className = "vc-mobile-nav-footer__meta";
      var nm = document.createElement("span");
      nm.className = "vc-mobile-nav-footer__name";
      nm.textContent = staffAccountDisplayName(profile);
      meta.appendChild(nm);
      var hint = document.createElement("span");
      hint.className = "vc-mobile-nav-footer__hint";
      hint.textContent = "Account Discord";
      meta.appendChild(hint);
      who.appendChild(left);
      who.appendChild(meta);
      var actions = document.createElement("div");
      actions.className = "vc-mobile-nav-footer__actions is-trio";
      var prof = document.createElement("a");
      prof.className =
        "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--profile vc-mobile-nav-footer__action--icon";
      var uid = String(profile.id || "").trim();
      if (!/^\d{17,22}$/.test(uid)) {
        try {
          uid = String(readCachedDiscordUserId() || "").trim();
        } catch (eUid) {}
      }
      prof.href = /^\d{17,22}$/.test(uid) ? "/user/?id=" + encodeURIComponent(uid) : "#";
      prof.setAttribute("aria-label", "Profilo");
      prof.title = "Profilo";
      prof.innerHTML = '<i class="fa fa-user" aria-hidden="true"></i>';
      prof.addEventListener("click", function (ev) {
        if (!/^\d{17,22}$/.test(uid)) {
          try {
            uid = String(
              (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) ||
                readCachedDiscordUserId() ||
                "",
            ).trim();
          } catch (eRe) {}
          if (/^\d{17,22}$/.test(uid)) {
            if (ev && ev.preventDefault) ev.preventDefault();
            prof.href = "/user/?id=" + encodeURIComponent(uid);
            try {
              window.location.assign(prof.href);
            } catch (eGo) {
              window.location.href = prof.href;
            }
          }
        }
        setStaffDrawerOpen(false);
      });
      var bach = document.createElement("a");
      bach.className =
        "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--bacheca vc-mobile-nav-footer__action--icon";
      bach.setAttribute("aria-label", "Bacheca");
      bach.title = "Bacheca";
      bach.setAttribute("data-vc-mobile-bacheca", "1");
      var dash = document.createElement("a");
      dash.className =
        "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--dashboard vc-mobile-nav-footer__action--icon";
      dash.setAttribute("aria-label", "Dashboard");
      dash.title = "Dashboard";
      dash.setAttribute("data-vc-mobile-dashboard", "1");
      /* hamFootSoon1: come PC — founder unlock, altrimenti blur + soon */
      var founderOk = false;
      try {
        if (window.__VC_VIEW_AS_ALLOWED === true) founderOk = true;
        var sp = window.__VC_STAFF_PERMS || {};
        if (sp && (sp.isFounder === true || sp.viewAsAllowed === true)) founderOk = true;
        if (sessionStorage.getItem("vc_view_as_allowed") === "1") founderOk = true;
      } catch (eFounder) {}
      if (founderOk) {
        bach.href = "/bacheca/";
        dash.href = "/dashboard/";
        bach.innerHTML = '<i class="fa fa-th-large" aria-hidden="true"></i>';
        dash.innerHTML = '<i class="fa fa-tachometer" aria-hidden="true"></i>';
        bach.addEventListener("click", function () {
          setStaffDrawerOpen(false);
        });
        dash.addEventListener("click", function () {
          setStaffDrawerOpen(false);
        });
      } else {
        bach.classList.add("is-soon");
        dash.classList.add("is-soon");
        bach.setAttribute("aria-disabled", "true");
        dash.setAttribute("aria-disabled", "true");
        bach.innerHTML =
          '<span class="vc-mobile-nav-footer__soon-inner" aria-hidden="true"><i class="fa fa-th-large" aria-hidden="true"></i></span>' +
          '<span class="vc-mobile-nav-footer__soon-badge">soon</span>';
        dash.innerHTML =
          '<span class="vc-mobile-nav-footer__soon-inner" aria-hidden="true"><i class="fa fa-tachometer" aria-hidden="true"></i></span>' +
          '<span class="vc-mobile-nav-footer__soon-badge">soon</span>';
        bach.addEventListener("click", function (ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
        });
        dash.addEventListener("click", function (ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
        });
      }
      var lo = document.createElement("button");
      lo.type = "button";
      /* hamFootOnly1: Esci a barra full-width sotto il trio */
      lo.className =
        "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--logout vc-mobile-nav-footer__action--logout-bar";
      lo.setAttribute("aria-label", "Esci");
      lo.title = "Esci";
      lo.innerHTML = '<i class="fa fa-sign-out" aria-hidden="true"></i><span>Esci</span>';
      lo.addEventListener("click", function () {
        var logoutBtn = document.getElementById("discord-logout-btn");
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
        setStaffDrawerOpen(false);
      });
      /* hamFootSwapDashBach1: Profilo · Dashboard · Bacheca */
      actions.appendChild(prof);
      actions.appendChild(dash);
      actions.appendChild(bach);
      var toolbar = document.createElement("div");
      toolbar.className = "vc-mobile-nav-footer__toolbar";
      toolbar.appendChild(actions);
      toolbar.appendChild(lo);
      wrap.appendChild(who);
      wrap.appendChild(toolbar);
      foot.appendChild(wrap);
      try {
        /* hamEsciFull1 */
        lo.classList.add("vc-mobile-nav-footer__action--logout-bar");
        lo.classList.remove("vc-mobile-nav-footer__action--icon");
        if (lo.closest && lo.closest(".vc-mobile-nav-footer__actions")) {
          toolbar.appendChild(lo);
        }
      } catch (eEsci) {}
      return;
    }

    var login = document.createElement("button");
    login.type = "button";
    login.className = "vc-mobile-nav-footer__login";
    login.textContent = "Accedi con Discord";
    login.addEventListener("click", function () {
      var loginBtn = document.getElementById("discord-login-btn");
      if (loginBtn) loginBtn.click();
      setStaffDrawerOpen(false);
    });
    foot.appendChild(login);
  }

  function setStaffDrawerOpen(open) {
    var btn = document.getElementById("vc-mobile-nav-toggle");
    var drawer = ensureStaffDrawerShell();
    if (!drawer) return false;
    var panel = drawer.querySelector(".vc-mobile-nav-drawer__panel");
    if (open) {
      fillStaffDrawerFromNav();
      try {
        if (typeof window.__vcMobileNavRebuild === "function") window.__vcMobileNavRebuild();
      } catch (eRebuild) {}
            var grid = document.getElementById("vc-mobile-nav-drawer-grid");
      if (!grid || !grid.children.length) fillStaffDrawerFromNav();
      try {
        stripConfessionaleFromStaffMenus(grid || document);
        stripConfessionaleFromStaffMenus(document);
      } catch (eStripOpen) {}
      try {
        grid = document.getElementById("vc-mobile-nav-drawer-grid");
        if (
          grid &&
          grid.querySelector('a[href*="/staff/guida"]')
        ) {
          var guideLink = grid.querySelector('a[href*="/staff/guida"]');
          var guideGrid = guideLink && guideLink.closest ? guideLink.closest(".vc-mobile-nav-grid") : null;
          if (guideGrid) {
            if (!grid.querySelector('a[href*="/staff/compiti"]') && canShowCompitiNav()) {
              var compitiA = document.createElement("a");
              compitiA.className = "vc-mobile-nav-tile";
              compitiA.href = "/staff/compiti/";
              compitiA.innerHTML =
                '<span class="vc-mobile-nav-tile-ico" aria-hidden="true"><i class="fa fa-check-square-o"></i></span>' +
                '<span class="vc-mobile-nav-tile-label" data-i18n="staff.compiti">' +
                i18nT("staff.compiti", "Compiti") +
                "</span>";
              if (isActive("/staff/compiti/")) {
                compitiA.classList.add("is-active");
                compitiA.setAttribute("aria-current", "page");
              }
              compitiA.addEventListener("click", function () {
                setStaffDrawerOpen(false);
              });
              guideGrid.appendChild(compitiA);
            }
          }
        }
      } catch (eConfFix) {}
      syncStaffDrawerFooter();

      drawer.classList.add("vc-mobile-nav-drawer--open");
      drawer.setAttribute("aria-hidden", "false");
      drawer.style.setProperty("display", "block", "important");
      drawer.style.setProperty("visibility", "visible", "important");
      drawer.style.setProperty("opacity", "1", "important");
      drawer.style.setProperty("pointer-events", "auto", "important");
      if (panel) {
        panel.style.setProperty("transform", "translateX(0)", "important");
        panel.style.setProperty("visibility", "visible", "important");
        panel.style.setProperty("opacity", "1", "important");
      }
      try {
        document.documentElement.classList.add("vc-mobile-nav-open");
      } catch (eOpen) {}
      if (btn) btn.setAttribute("aria-expanded", "true");
    } else {
      drawer.classList.remove("vc-mobile-nav-drawer--open");
      drawer.setAttribute("aria-hidden", "true");
      drawer.style.removeProperty("display");
      drawer.style.removeProperty("visibility");
      drawer.style.removeProperty("opacity");
      drawer.style.removeProperty("pointer-events");
      if (panel) {
        panel.style.removeProperty("transform");
        panel.style.removeProperty("visibility");
        panel.style.removeProperty("opacity");
      }
      try {
        document.documentElement.classList.remove("vc-mobile-nav-open");
      } catch (eClose) {}
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
    return true;
  }

  function wireStaffHamburger() {
    var btn = document.getElementById("vc-mobile-nav-toggle");
    if (!btn) return;
    if (btn.getAttribute("data-vc-staff-ham-wired") === "3") return;
    btn.setAttribute("data-vc-staff-ham-wired", "3");
        window.__vcStaffHamburgerOwnsToggle = true;
    var lastToggleAt = 0;

    function onStaffHam(ev) {
      if (!ev) return;
      var now = Date.now();
      if (now - lastToggleAt < 350) {
        if (ev.preventDefault) ev.preventDefault();
        if (ev.stopPropagation) ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        return;
      }
      lastToggleAt = now;
      try {
        ev.__vcMobileNavHandled = true;
      } catch (eFlag) {}
      if (ev.preventDefault) ev.preventDefault();
      if (ev.stopPropagation) ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();

      var drawer = ensureStaffDrawerShell();
      if (!drawer) return;
      var willOpen = !drawer.classList.contains("vc-mobile-nav-drawer--open");
      setStaffDrawerOpen(willOpen);
    }

    btn.addEventListener("click", onStaffHam, true);
    btn.addEventListener(
      "touchend",
      function (ev) {
        onStaffHam(ev);
      },
      { capture: true, passive: false },
    );

    function bindDrawerChrome() {
      var live = document.getElementById("vc-mobile-nav-drawer");
      if (!live) return;
      var backdrop = live.querySelector(".vc-mobile-nav-drawer__backdrop");
      if (backdrop && backdrop.getAttribute("data-vc-staff-ham-backdrop") !== "1") {
        backdrop.setAttribute("data-vc-staff-ham-backdrop", "1");
        backdrop.addEventListener(
          "click",
          function () {
            setStaffDrawerOpen(false);
          },
          true,
        );
      }
      var closeBtn = document.getElementById("vc-mobile-nav-close");
      if (closeBtn && closeBtn.getAttribute("data-vc-staff-ham-close") !== "1") {
        closeBtn.setAttribute("data-vc-staff-ham-close", "1");
        closeBtn.addEventListener(
          "click",
          function (ev) {
            if (ev && ev.preventDefault) ev.preventDefault();
            setStaffDrawerOpen(false);
          },
          true,
        );
      }
    }
    bindDrawerChrome();
    window.setTimeout(bindDrawerChrome, 200);
        try {
      ensureStaffDrawerShell();
      fillStaffDrawerFromNav();
      syncStaffDrawerFooter();
    } catch (ePrefill) {}
    if (!window.__vcStaffHamFooterBound) {
      window.__vcStaffHamFooterBound = true;
      window.addEventListener("vc-discord-profile", function () {
        try {
          syncStaffDrawerFooter();
        } catch (eProf) {}
      });
      window.addEventListener("vc-server-identity", function () {
        try {
          syncStaffDrawerFooter();
        } catch (eSid) {}
      });
    }
  }

  function upgrade() {
    if (!isStaffNavContext()) {
      /* footerStaffFirstStamp1: non smontare footer su race sticky→API */
      if (!readStaffMenuStickyLocal()) removeStaffFooterColumns();
      return;
    }
    /* footerStaffFirstStamp1 + navStaffFirstStamp1: footer + navbar subito */
    try {
      injectStaffFooterColumns();
    } catch (eFoot0) {}
    try {
      paintStaffNavEarly();
    } catch (eNav0) {}
    /* violPass2: upgrade a slice — idle non deve superare ~50ms */
    function slice1() {
      var header = findStaffHeader();
      if (!header) return;
      try {
        ensureSiteBrand(header);
        injectStaffMenu(header);
        stripLegacyStaffNavRows(header);
        stripLegacyStaffNavRows(document);
      } catch (e1) {}
    }
    function slice2() {
      var header = findStaffHeader();
      if (!header) return;
      try {
        enforceStaffMenuGuidaOnly(header);
        enforceStaffMenuGuidaOnly(document);
        stripConfessionaleFromStaffMenus(header);
        stripConfessionaleFromStaffMenus(document);
        watchStaffConfessionaleStrip();
        if (isEventDedicatedNavPage()) watchEventNavStaffStrip(header);
        if (isBoardsSiteNav()) watchEventNavStaffStrip(header);
        ensureNotifSlot(header);
        ensureHeaderPromo();
      } catch (e2) {}
    }
    function slice3() {
      try {
        ensureStaffDrawerShell();
        wireStaffHamburger();
        injectStaffFooterColumns();
        paintStaffNavEarly();
        if (isBoardsSiteNav()) {
          removeStaffFooterColumns();
          stripStaffMenuFromSnav(document.querySelector("nav.vc-header-snav"));
        }
        applyStaffI18n(document);
        document.body.classList.add("vc-staff-site-nav");
      } catch (e3) {}
    }
    /* violKillCue2: gap più larghi tra slice (era Violation setTimeout 50–126ms) */
    function defer(fn, ms, critical) {
      window.setTimeout(function () {
        if (!critical) {
          try {
            if (document.hidden || document.visibilityState === "hidden") return;
          } catch (eHid) {}
        }
        try {
          fn();
        } catch (eF) {}
      }, ms || 48);
    }
    defer(function () {
      try {
        var header = findStaffHeader();
        if (!header) return;
        ensureSiteBrand(header);
      } catch (e1a) {}
    }, 48);
    /* navStaffFirstStamp1: inject menu anche se tab hidden (senza skip) */
    defer(function () {
      try {
        paintStaffNavEarly();
        var header = findStaffHeader();
        if (!header) return;
        injectStaffMenu(header);
      } catch (e1b) {}
    }, 80, true);
    defer(function () {
      try {
        var header = findStaffHeader();
        if (!header) return;
        stripLegacyStaffNavRows(header);
        stripLegacyStaffNavRows(document);
      } catch (e1c) {}
    }, 280);
    defer(slice2, 480);
    defer(slice3, 900);
    defer(function () {
      try {
        window.dispatchEvent(new CustomEvent("vc:staff-notif-ready"));
      } catch (eNotif) {}
    }, 1200);
    defer(function () {
      try {
        if (typeof window.__vcMobileNavRebuild === "function") window.__vcMobileNavRebuild();
      } catch (eRebuild) {}
    }, 1600);
    defer(function () {
      try {
        if (window.VcNavBadges && typeof window.VcNavBadges.schedule === "function") {
          window.VcNavBadges.schedule();
        } else if (window.VcNavBadges && typeof window.VcNavBadges.apply === "function") {
          window.VcNavBadges.apply(document);
        }
      } catch (eBadge) {}
    }, 2000);
  }

  function boot() {
    upgrade();
  }

  function teardownStaffSiteNav() {
    try {
      window.__VC_STAFF_MENU_ALLOWED = false;
    } catch (e0) {}
    try {
      document.body && document.body.classList.remove("vc-staff-site-nav");
    } catch (e1) {}
    removeStaffFooterColumns();
    try {
      var header = document.querySelector("body > .vc-staff-app > header, body > header, .vc-staff-app header");
      if (header) {
        stripStaffMenuFromSnav(header.querySelector("nav.vc-header-snav"));
        stripLegacyStaffNavRows(header);
        var stray = header.querySelectorAll("[data-vc-staff-tools-nav], .vc-snav-details--staff");
        for (var i = 0; i < stray.length; i++) {
          if (stray[i] && stray[i].parentNode) stray[i].parentNode.removeChild(stray[i]);
        }
      }
      stripStaffMenuFromSnav(document.querySelector("nav.vc-header-snav"));
      stripLegacyStaffNavRows(document);
    } catch (e2) {}
    try {
      var drawer = document.getElementById("vc-mobile-nav-drawer");
      if (drawer) {
        var staffTiles = drawer.querySelectorAll(
          "[data-vc-mobile-staff], a[href*='/staff/'], a[href*='/staff'], .vc-mobile-nav-section[data-vc-staff-section]",
        );
        for (var t = 0; t < staffTiles.length; t++) {
          var el = staffTiles[t];
          if (!el || !el.parentNode) continue;
          /* keep public tiles; only remove dedicated staff section wrappers */
          if (
            el.getAttribute("data-vc-mobile-staff") != null ||
            el.getAttribute("data-vc-staff-section") != null ||
            (el.classList && el.classList.contains("vc-mobile-nav-section") && el.querySelector("a[href*='/staff/guida']"))
          ) {
            el.parentNode.removeChild(el);
          }
        }
      }
    } catch (e3) {}
    try {
      var promo = document.getElementById("vc-header-promo-btn");
      if (promo) promo.classList.remove("vc-header-promo-btn--staff-hidden");
    } catch (e4) {}
    try {
      if (typeof window.__vcMobileNavRebuild === "function") window.__vcMobileNavRebuild();
    } catch (e5) {}
  }

  /* authLogoutRoleGate1: footer mobile usa completeLogout */
  window.__vcTeardownStaffSiteNav = teardownStaffSiteNav;

  function scheduleStaffNavBoot() {
    function tick(doBoot) {
      if (!isStaffNavContext()) return false;
      try {
        injectStaffFooterColumns();
      } catch (eEarly) {}
      try {
        paintStaffNavEarly();
      } catch (eEarlyNav) {}
      if (doBoot) {
        try {
          boot();
        } catch (eB) {}
      }
      return staffNavAlreadyPainted();
    }
    if (tick(true)) return;
    var tries = 0;
    var timer = window.setInterval(function () {
      tries += 1;
      var painted = false;
      try {
        painted = tick(tries === 1 || tries === 3 || tries === 8 || tries === 20);
      } catch (eTry) {}
      if (painted || tries > 50) window.clearInterval(timer);
    }, 80);
  }

  window.addEventListener("vc:staff-access-ok", function () {
    try {
      injectStaffFooterColumns();
    } catch (eOkFoot) {}
    try {
      paintStaffNavEarly();
    } catch (eOkNav) {}
    boot();
  });
  window.addEventListener("vc:langchange", function () {
    try {
      if (!isStaffNavContext()) return;
      injectStaffFooterColumns();
      paintStaffNavEarly();
      applyStaffI18n(document);
    } catch (eLang) {}
  });
  window.addEventListener("vc:auth-logout", function () {
    teardownStaffSiteNav();
  });
  window.addEventListener("vc-discord-profile", function (ev) {
    var user = ev && ev.detail ? ev.detail.user : null;
    if (!user) {
      teardownStaffSiteNav();
      return;
    }
    if (!window.__VC_STAFF_MENU_ALLOWED && !readStaffMenuStickyLocal()) return;
    /* handlerPerf2 + violKill1 + violPass2: profile boot deferred; upgrade è a slice */
    try {
      injectStaffFooterColumns();
    } catch (eProfFoot) {}
    try {
      paintStaffNavEarly();
    } catch (eProfNav) {}
    var run = function () {
      try {
        boot();
      } catch (eBoot) {}
    };
    window.setTimeout(run, 32);
  });
  /* footerStaffFirstStamp1 + navStaffFirstStamp1: sticky → paint footer+navbar subito */
  try {
    if (readStaffMenuStickyLocal()) {
      try {
        window.__VC_STAFF_MENU_ALLOWED = true;
      } catch (eProm) {}
      var paintBoth = function () {
        try {
          injectStaffFooterColumns();
        } catch (eF) {}
        try {
          paintStaffNavEarly();
        } catch (eN) {}
      };
      if (document.body) {
        paintBoth();
      } else {
        document.addEventListener("DOMContentLoaded", paintBoth);
      }
    }
  } catch (eBootFoot) {}
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleStaffNavBoot);
  } else {
    scheduleStaffNavBoot();
  }
})();
/* violKill1 */
/* violKillCue2 */
/* extOnlyFix1 */
/* violPass2 */
/* violPass4 */
/* violPass5 */
/* violPass10 */
/* violPass12 */
/* footerStaffFirstStamp1 */
/* navStaffFirstStamp1 */
