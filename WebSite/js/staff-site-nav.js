/**
 * Navbar staff = navbar sito (Vinili & Caffè) + menu Area staff
 * (Guida; Inbox in /notifications/?view=staff;
 * Organico / Punti tolti dal profilo. Su mobile/tablet Area staff è nascosto.)
 * Organico → dal profilo staff card Carriera;
 * Punti tolti PM e Pause/Serata Film solo dal profilo staff).
 * Attiva su body.vc-staff-area o quando l'utente è staff (dropdown globale).
 */
(function () {
  "use strict";

  function perms() {
    return (window.__VC_STAFF_PERMS && typeof window.__VC_STAFF_PERMS === "object" && window.__VC_STAFF_PERMS) || {};
  }

  function isStaffNavContext() {
    if (!document.body) return false;
    if (document.body.classList.contains("vc-staff-area")) return true;
    return window.__VC_STAFF_MENU_ALLOWED === true;
  }

  /** Navbar dedicate (Hogwarts /evento): non iniettare Area staff nel centro. */
  function isSpecializedSiteNav(snav) {
    try {
      var raw = String(location.pathname || "/").toLowerCase();
      var p = raw.replace(/\/+$/, "") || "/";
      if (p === "/evento" || p.indexOf("/evento/") === 0 || raw.indexOf("/evento/") === 0 || raw === "/evento/") {
        return true;
      }
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
      if (/^\d{17,20}$/.test(id)) return "/user/?id=" + encodeURIComponent(id) + "&tab=staff";
    } catch (e) {}
    return "/user/?tab=staff";
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
    return p === h || p.indexOf(h + "/") === 0;
  }

  function row(href, icon, label, show) {
    if (show === false) return "";
    var active = isActive(href);
    return (
      '<a class="vc-snav-row' +
      (active ? " vc-snav-row--active" : "") +
      '" href="' +
      href +
      '"' +
      (active ? ' aria-current="page"' : "") +
      '><span class="vc-snav-row-ico" aria-hidden="true"><i class="fa fa-' +
      icon +
      '"></i></span><span>' +
      label +
      "</span></a>"
    );
  }

  function ensureSiteBrand(header) {
    var brand =
      header.querySelector("a.vc-header-site-name") ||
      header.querySelector('a[href="/staff/"], a[href="/staff"]') ||
      header.querySelector(".vc-staff-nav-wide a.min-w-0.truncate");
    if (!brand) return;
    var home = "/";
    try {
      if (window.__VC_AUTH && window.__VC_AUTH.homeUrl) home = String(window.__VC_AUTH.homeUrl);
    } catch (e) {}
    brand.setAttribute("href", home);
    brand.classList.add("vc-header-site-name");
    if (!/vinili/i.test(brand.textContent || "")) {
      brand.innerHTML = '<span class="text-emerald-300">Vinili &amp; Caffè</span>';
    }
    brand.setAttribute("aria-label", "Vai alla homepage");
  }

  function stripLegacyStaffNavRows(root) {
    try {
      var scope = root || document;
      var links = scope.querySelectorAll(
        'a.vc-snav-row[href*="/staff/inbox"], a.vc-snav-row[href*="/staff/punti-tolti"], a.vc-snav-row[href*="/staff/organico"], a.vc-snav-row[href*="/staff/gestione"], a.vc-snav-item[href*="/staff/gestione"], a[href*="/staff/inbox"], a[href*="/staff/punti-tolti"], a[href*="/staff/organico"], a[href*="/staff/gestione"]',
      );
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        // Solo navbar / drawer Area staff — non i link nel profilo staff.
        var inStaffMenu = a.closest
          ? a.closest(
              "[data-vc-staff-tools-nav], .vc-snav-details--staff, .vc-header-snav, #vc-mobile-nav-drawer, .vc-mobile-nav-drawer, header",
            )
          : null;
        if (!inStaffMenu) continue;
        if (a.closest && a.closest(".vc-staff-pm-pt-btn, .vc-staff-pm-pt-link, .vc-user-profile, #vc-user-profile-view")) {
          continue;
        }
        if (a.parentNode) a.parentNode.removeChild(a);
      }
      // Rimuovi anche summary/link etichettati Gestione nei menu staff.
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
        if (lab === "gestione" || lab === "gestione staff" || href.indexOf("/staff/gestione") >= 0) {
          if (el.parentNode) el.parentNode.removeChild(el);
        }
      }
      // Details vuoti o intestati «Gestione» (vecchie navbar).
      var details = scope.querySelectorAll("header details.vc-snav-details, .vc-header-snav details.vc-snav-details");
      for (var d = 0; d < details.length; d++) {
        var det = details[d];
        var sum = det.querySelector(".vc-snav-summary span, .vc-snav-summary");
        var title = sum ? String(sum.textContent || "").replace(/\s+/g, " ").trim().toLowerCase() : "";
        var panelRows = det.querySelectorAll(".vc-snav-panel a.vc-snav-row, a.vc-snav-row");
        if (title === "gestione" || title === "gestione staff") {
          if (det.parentNode) det.parentNode.removeChild(det);
          continue;
        }
        if (
          (det.classList.contains("vc-snav-details--staff") || det.hasAttribute("data-vc-staff-tools-nav")) &&
          panelRows.length === 0
        ) {
          // keep staff block even if empty — inject will refill Guida
        }
      }
    } catch (eStrip) {}
  }

  function injectStaffMenu(header) {
    var shell = header.querySelector(".vc-nav-shell");
    if (!shell) return;

    var bar = shell.querySelector(".vc-header-bar") || shell;
    var snav = bar.querySelector("nav.vc-header-snav");
    // Su /evento (e hub Hogwarts) la snav centrale è dedicata: non mischiare Area staff.
    // Check path/body PRIMA di qualsiasi insert (anche se snav ancora assente).
    if (isSpecializedSiteNav(snav) || isEventDedicatedNavPage()) {
      stripStaffMenuFromSnav(snav);
      var stray = header.querySelectorAll("[data-vc-staff-tools-nav], .vc-snav-details--staff");
      for (var s = 0; s < stray.length; s++) {
        var node = stray[s];
        if (node && node.parentNode) node.parentNode.removeChild(node);
      }
      stripLegacyStaffNavRows(header);
      watchEventNavStaffStrip(header);
      return;
    }

    var p = perms();
    var staffOk = Boolean(p.ok) || window.__VC_STAFF_MENU_ALLOWED === true;
    // Link base sempre visibili per chi ha Area staff (anche se payload perms ancora in arrivo).
    // Inbox → /notifications/?view=staff ; Organico / Punti tolti PM → solo dal profilo staff.
    var html =
      '<details class="vc-snav-details vc-snav-details--staff" data-vc-staff-tools-nav>' +
      '<summary class="vc-snav-summary"><span>Area staff</span><i class="fa fa-chevron-down vc-snav-chev text-[0.65rem] opacity-80" aria-hidden="true"></i></summary>' +
      '<div class="vc-snav-panel">' +
      row("/staff/guida/", "book", "Guida", true) +
      "</div></details>";

    var existing = header.querySelector("[data-vc-staff-tools-nav]");
    if (existing) {
      var wrap = document.createElement("div");
      wrap.innerHTML = html;
      var next = wrap.firstElementChild;
      if (next && existing.parentNode) existing.parentNode.replaceChild(next, existing);
      stripLegacyStaffNavRows(header);
      return;
    }

    if (snav) {
      snav.insertAdjacentHTML("beforeend", html);
      stripLegacyStaffNavRows(header);
      return;
    }

    // Slim staff header: add a compact snav next to brand.
    var brandWrap = bar.querySelector(".flex.min-w-0") || bar.firstElementChild;
    var nav = document.createElement("nav");
    nav.className =
      "vc-header-snav vc-glass flex max-w-full flex-wrap items-center justify-center gap-0.5 px-1.5 py-1 sm:gap-1 sm:px-2";
    nav.setAttribute("aria-label", "Area staff");
    nav.innerHTML = html;
    if (brandWrap && brandWrap.parentNode) {
      brandWrap.parentNode.insertBefore(nav, brandWrap.nextSibling);
    } else {
      bar.appendChild(nav);
    }
    stripLegacyStaffNavRows(header);
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
        '<span class="vc-header-promo-btn__unit"><span class="vc-header-promo-btn__label">' +
        (isEvent ? "Evento" : "Candidature") +
        '</span><span class="vc-header-promo-btn__badge">' +
        (isEvent ? "ATTIVO" : "APERTE") +
        "</span></span></span></span>";
    }

    normalizeHeaderQuickActionsOrder(actions);

    if (!document.querySelector('script[src*="vc-header-promo.js"]')) {
      var s = document.createElement("script");
      s.src = "/js/vc-header-promo.js?v=20260827staffPromoFix1";
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
      var sec = document.createElement("section");
      sec.className = "vc-mobile-nav-section";
      var h = document.createElement("h3");
      h.className = "vc-mobile-nav-section-title";
      h.textContent = String(title || "MENU").toUpperCase();
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
          '"></i></span><span class="vc-mobile-nav-tile-label">' +
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
              if (
                String(href2).toLowerCase().indexOf("/staff/gestione") >= 0 ||
                labMainNorm === "gestione" ||
                labMainNorm === "gestione staff" ||
                labMainNorm === "area staff" ||
                labMainNorm === "staff area"
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
          // Area staff / Gestione: niente sezione hamburger, ma promuovi Guida.
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
                glabNorm === "guida staff"
              ) {
                guideItems.push({
                  href: ghref,
                  label: glab || "Guida",
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
                label: "Guida",
                icon: "fa-book",
                active: isActive("/staff/guida/"),
              });
            }
            addSection("Staff", guideItems);
            filled += guideItems.length;
            i += 1;
            continue;
          }
          var rows = el.querySelectorAll(".vc-snav-panel .vc-snav-row");
          var detailItems = [];
          for (var r = 0; r < rows.length; r += 1) {
            var row = rows[r];
            var href = row.getAttribute("href");
            if (!href) continue;
            if (String(href).toLowerCase().indexOf("/staff/gestione") >= 0) continue;
            var lab = row.querySelector("span:not(.vc-snav-row-ico)");
            var labTxt = lab ? String(lab.textContent || "").trim() : String(row.textContent || "").trim();
            var labNorm = labTxt.replace(/\s+/g, " ").trim().toLowerCase();
            if (labNorm === "gestione" || labNorm === "gestione staff" || labNorm === "area staff") continue;
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

    if (filled < 1) {
      addSection("Principale", [
        { href: "/", label: "Home", icon: "fa-home" },
        { href: "/wiki/", label: "Wiki", icon: "fa-map-o" },
        { href: "/sponsor/", label: "Sponsor", icon: "fa-handshake-o" },
      ]);
      filled = 1;
    }

    try {
      if (!isEventDedicatedNavPage() && !gridRoot.querySelector('a[href*="/staff/guida"]')) {
        var staffOk =
          window.__VC_STAFF_MENU_ALLOWED === true ||
          Boolean(perms().ok) ||
          Boolean(document.querySelector("[data-vc-staff-tools-nav], .vc-snav-details--staff"));
        if (staffOk) {
          addSection("Staff", [
            {
              href: "/staff/guida/",
              label: "Guida",
              icon: "fa-book",
              active: isActive("/staff/guida/"),
            },
          ]);
        }
      }
    } catch (eGuide) {}

    try {
      var brand = document.getElementById("vc-mobile-nav-drawer-brand");
      if (brand && !brand.childNodes.length) {
        var logo = document.querySelector("header a.vc-header-logo-link");
        var name = document.querySelector("header a.vc-header-site-name");
        if (logo) brand.appendChild(logo.cloneNode(true));
        if (name) brand.appendChild(name.cloneNode(true));
      }
    } catch (eBrand) {}

    return filled > 0 || gridRoot.children.length > 0;
  }

  function staffAvatarUrl(u) {
    if (!u || !u.id) return "";
    if (u.avatar) {
      var ext = String(u.avatar).indexOf("a_") === 0 ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + "." + ext + "?size=64";
    }
    try {
      if (typeof BigInt === "undefined") return "";
      var bi = BigInt(String(u.id));
      var idx = Number((bi >> 22n) % 6n);
      return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
    } catch (eAv) {
      return "";
    }
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
      profile = window.__VC_DISCORD_PROFILE || null;
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
      nm.textContent =
        String(profile.global_name || profile.username || "Utente").trim() || "Utente";
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
      var uid = String(profile.id || "").trim();
      prof.href = /^\d{17,22}$/.test(uid) ? "/user/?id=" + encodeURIComponent(uid) : "/user";
      prof.innerHTML = '<i class="fa fa-user" aria-hidden="true"></i> Profilo';
      prof.addEventListener("click", function () {
        setStaffDrawerOpen(false);
      });
      var lo = document.createElement("button");
      lo.type = "button";
      lo.className = "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--logout";
      lo.innerHTML = '<i class="fa fa-sign-out" aria-hidden="true"></i> Esci';
      lo.addEventListener("click", function () {
        var logoutBtn = document.getElementById("discord-logout-btn");
        if (logoutBtn) logoutBtn.click();
        else if (typeof window.__vcDiscordClearToken === "function") {
          try {
            window.__vcDiscordClearToken();
          } catch (eClear) {}
          try {
            window.location.reload();
          } catch (eRel) {}
        }
        setStaffDrawerOpen(false);
      });
      actions.appendChild(prof);
      actions.appendChild(lo);
      wrap.appendChild(who);
      wrap.appendChild(actions);
      foot.appendChild(wrap);
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
      // Rebuild può svuotare/riempire: se resta vuoto, fallback locale.
      var grid = document.getElementById("vc-mobile-nav-drawer-grid");
      if (!grid || !grid.children.length) fillStaffDrawerFromNav();
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
    // Staff owns the hamburger: block other capture listeners (open→close race).
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
    // Prefill so first open is never blank.
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
    }
  }

  function upgrade() {
    if (!isStaffNavContext()) return;
    var header = document.querySelector("body > .vc-staff-app > header, body > header, .vc-staff-app header");
    if (!header) return;
    ensureSiteBrand(header);
    injectStaffMenu(header);
    stripLegacyStaffNavRows(header);
    stripLegacyStaffNavRows(document);
    if (isEventDedicatedNavPage()) {
      watchEventNavStaffStrip(header);
    }
    ensureNotifSlot(header);
    ensureHeaderPromo();
    try {
      document.body.classList.add("vc-staff-site-nav");
    } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent("vc:staff-notif-ready"));
    } catch (eNotif) {}
    try {
      if (typeof window.__vcMobileNavRebuild === "function") window.__vcMobileNavRebuild();
    } catch (eRebuild) {}
    ensureStaffDrawerShell();
    wireStaffHamburger();
  }

  function boot() {
    upgrade();
  }

  function scheduleStaffNavBoot() {
    function run() {
      if (!isStaffNavContext()) return false;
      boot();
      return true;
    }
    if (run()) return;
    // Prefetch/access possono arrivare prima del body o dello script: ritenta.
    var tries = 0;
    var timer = window.setInterval(function () {
      tries += 1;
      if (run() || tries > 40) window.clearInterval(timer);
    }, 100);
  }

  window.addEventListener("vc:staff-access-ok", function () {
    boot();
  });
  window.addEventListener("vc-discord-profile", function () {
    if (window.__VC_STAFF_MENU_ALLOWED) boot();
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleStaffNavBoot);
  } else {
    scheduleStaffNavBoot();
  }
})();
