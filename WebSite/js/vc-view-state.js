/**
 * vc-view-state1: ripristina scroll, hash, tab e UI aperta.
 * Su reload (F5 / PTR) + PWA reopen + back/forward (bfNavRestore1).
 * Mappa per-path in sessionStorage: ogni pagina tiene il proprio snapshot.
 * loadRestoreAfterBar1: scroll Y solo dopo unlock barra di caricamento.
 */
(function vcViewState() {
  if (window.__vcViewState) return;
  window.__vcViewState = 1;
  window.__VC_VIEW_STATE_VER = "20261015homeBootFix2";

  var KEY = "vc_view_state_v1";
  var MAP_KEY = "vc_view_state_map_v1";
  var MAP_MAX = 28;
  var SCROLL_KEY = "vc_ptr_scroll_v1";
  var LS_KEY = "vc_pwa_view_state_v1";
  var LS_PENDING_KEY = "vc_pwa_ui_pending_v1";
  var TTL_MS = 45 * 60 * 1000;
  var saving = false;

  function pagePath() {
    /* boardsScrollPath1: su /bacheca ignore query volatile (step/guildId/kind) */
    var path = String(window.location.pathname || "") || "/";
    if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
    if (/^\/bacheca(\/|$)/i.test(path)) return path || "/";
    var p = path + String(window.location.search || "");
    if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
    return p || "/";
  }

  function pathMatches(saved) {
    var cur = pagePath();
    if (!saved) return false;
    if (saved === cur) return true;
    try {
      var sp = String(saved).split("?")[0];
      if (sp.length > 1 && sp.charAt(sp.length - 1) === "/") sp = sp.slice(0, -1);
      var cp = String(cur).split("?")[0];
      if (cp.length > 1 && cp.charAt(cp.length - 1) === "/") cp = cp.slice(0, -1);
      return sp === cp;
    } catch (ePm) {
      return false;
    }
  }

  function restorePending() {
    try {
      if (window.__vcPtrRestoreDone) return false;
      if (Number(window.__vcPtrRestoreTargetY || window.__vcPtrRestoreY || window.__vcViewStateRestoreY || 0) >= 2) {
        return true;
      }
      var root = document.documentElement;
      if (root.classList.contains("vc-scroll-reload-top-lock")) return true;
      if (root.classList.contains("vc-ptr-scroll-restore-pending")) return true;
    } catch (eRp) {}
    return false;
  }

  /* boardsScrollSaveGuard1 + refreshScrollRestore1:
     non sovrascrivere Y salvata con 0/near-0 durante restore / boot (anche y=2 clobbava). */
  function effectiveSaveY(y) {
    y = Math.max(0, Math.round(Number(y) || 0));
    try {
      var ty = Math.max(
        0,
        Math.round(Number(window.__vcPtrRestoreTargetY || 0) || 0),
        Math.round(Number(window.__vcPtrRestoreY || 0) || 0),
        Math.round(Number(window.__vcViewStateRestoreY || 0) || 0),
      );
      var savedY = 0;
      var savedAge = 1e15;
      var raw =
        sessionStorage.getItem("vc_scroll_restore_anchor_v1") ||
        sessionStorage.getItem(KEY) ||
        sessionStorage.getItem(SCROLL_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && pathMatches(d.p) && Number(d.y) >= 2) {
          savedY = Math.round(Number(d.y) || 0);
          savedAge = Date.now() - (Number(d.t) || 0);
        }
      }
      var protect =
        restorePending() ||
        (ty >= 2 && !window.__vcPtrRestoreDone) ||
        (savedY >= 2 && savedAge >= 0 && savedAge < 12000);
      var keep = Math.max(ty, savedY);
      if (protect && keep >= 2) {
        /* live Y molto più basso del target = leak boot, non gesto utente */
        if (y < 48 || y < keep - 80) return keep;
      }
      if (y >= 2) return y;
      if (keep >= 2 && (restorePending() || (savedAge >= 0 && savedAge < 12000))) return keep;
    } catch (eEy) {}
    return y;
  }

  function isReloadNav() {
    try {
      var list = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (list && list[0] && list[0].type) return list[0].type === "reload";
    } catch (e0) {}
    try {
      if (performance.navigation && performance.navigation.type === 1) return true;
    } catch (e1) {}
    try {
      if (sessionStorage.getItem("vc_ptr_reload_v1") === "1") return true;
    } catch (e2) {}
    return false;
  }

  function isBackForwardNav() {
    try {
      var list = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (list && list[0] && list[0].type) return list[0].type === "back_forward";
    } catch (e0) {}
    try {
      if (performance.navigation && performance.navigation.type === 2) return true;
    } catch (e1) {}
    return false;
  }

  function writeMapEntry(data) {
    if (!data || !data.p) return;
    try {
      var map = {};
      try {
        map = JSON.parse(sessionStorage.getItem(MAP_KEY) || "{}") || {};
      } catch (eParse) {
        map = {};
      }
      if (!map || typeof map !== "object") map = {};
      map[data.p] = data;
      var keys = Object.keys(map);
      if (keys.length > MAP_MAX) {
        keys.sort(function (a, b) {
          return (Number(map[a] && map[a].t) || 0) - (Number(map[b] && map[b].t) || 0);
        });
        for (var i = 0; i < keys.length - MAP_MAX; i++) {
          try {
            delete map[keys[i]];
          } catch (eDel) {}
        }
      }
      sessionStorage.setItem(MAP_KEY, JSON.stringify(map));
    } catch (eMap) {}
  }

  function readMapEntry(wantPath) {
    try {
      var map = JSON.parse(sessionStorage.getItem(MAP_KEY) || "{}") || {};
      if (!map || typeof map !== "object") return null;
      var cur = wantPath || pagePath();
      var data = map[cur] || null;
      if (!data) {
        var keys = Object.keys(map);
        for (var i = 0; i < keys.length; i++) {
          if (pathMatches(keys[i])) {
            data = map[keys[i]];
            break;
          }
        }
      }
      if (!data) return null;
      var at = Number(data.t) || 0;
      if (at && Date.now() - at > TTL_MS) return null;
      return data;
    } catch (eRead) {
      return null;
    }
  }

  function persistState(data) {
    if (!data) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(data));
    } catch (eKey) {}
    writeMapEntry(data);
    persistPwaLocal(data);
  }

  function wasPwaShell() {
    try {
      if (
        window.matchMedia &&
        (window.matchMedia("(display-mode: standalone)").matches ||
          window.matchMedia("(display-mode: fullscreen)").matches ||
          window.matchMedia("(display-mode: minimal-ui)").matches ||
          window.matchMedia("(display-mode: window-controls-overlay)").matches)
      ) {
        return true;
      }
    } catch (eMq) {}
    try {
      if (navigator.standalone) return true;
    } catch (eNs) {}
    try {
      return localStorage.getItem("vc-pwa-shell") === "1";
    } catch (eLs) {
      return false;
    }
  }

  function vsLsGet(key) {
    try {
      if (window.VcStorage && typeof window.VcStorage.get === "function") {
        return window.VcStorage.get(key, { scope: "ls" });
      }
    } catch (eVs) {}
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function vsLsSet(key, value) {
    try {
      if (window.VcStorage && typeof window.VcStorage.set === "function") {
        window.VcStorage.set(key, value, { scope: "ls", immediate: true });
        return;
      }
    } catch (eVs) {}
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }
  function vsLsRemove(key) {
    try {
      if (window.VcStorage && typeof window.VcStorage.remove === "function") {
        window.VcStorage.remove(key, { scope: "ls", immediate: true });
        return;
      }
    } catch (eVs) {}
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  function persistPwaLocal(data) {
    if (!data || !wasPwaShell()) return;
    try {
      var pendRaw = vsLsGet(LS_PENDING_KEY);
      if (pendRaw) {
        var pend = JSON.parse(pendRaw);
        /* Non sovrascrivere lo snapshot della pagina in pending (es. home cold-start → resume). */
        if (pend && pend.p && !pathMatches(pend.p)) return;
      }
    } catch (ePend) {}
    try {
      vsLsSet(LS_KEY, JSON.stringify(data));
    } catch (eLs) {}
  }

  function shouldRestorePwaUi() {
    if (!wasPwaShell()) return false;
    try {
      if (sessionStorage.getItem("vc_pwa_ui_restore_v1") === "1") return true;
    } catch (eFlag) {}
    try {
      var raw = vsLsGet(LS_PENDING_KEY);
      if (!raw) return false;
      var pend = JSON.parse(raw);
      return Boolean(pend && pathMatches(pend.p));
    } catch (ePend) {
      return false;
    }
  }

  function clearPwaUiPending() {
    try {
      vsLsRemove(LS_PENDING_KEY);
    } catch (e0) {}
    try {
      sessionStorage.removeItem("vc_pwa_ui_restore_v1");
    } catch (e1) {}
  }

  function pageScrollY() {
    return (
      window.pageYOffset ||
      (document.documentElement && document.documentElement.scrollTop) ||
      (document.body && document.body.scrollTop) ||
      0
    );
  }

  function collectScrollers() {
    /* violPass11: NIENTE scrollTop sync (Forced reflow ~80ms+).
       Solo cache aggiornata dal listener scroll (layout già caldo). */
    var out = [];
    try {
      var keys = Object.keys(scrollerYCache);
      for (var i = 0; i < keys.length && out.length < 12; i++) {
        var row = scrollerYCache[keys[i]];
        if (!row || !row.k) continue;
        if (Number(row.y) < 2) continue;
        out.push({ k: row.k, id: row.id || "", y: Math.round(Number(row.y) || 0) });
      }
    } catch (eCache) {}
    return out;
  }

  var SCROLLER_SEL =
    "[data-vc-scroll], .vc-wt-list, .vc-wt-thread, .vc-notif-panel__body, .vc-snav-panel, .vc-mobile-nav-drawer, .vc-staff-organico-board, .vc-cmd-list, .vc-wiki-cmd-shell";
  var scrollerYCache = Object.create(null);

  function scrollerKeyFor(el) {
    if (!el) return "";
    var id = el.id || "";
    var key =
      id ||
      el.getAttribute("data-vc-scroll") ||
      String(el.className || "")
        .toString()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join(".");
    return key || "";
  }

  function rememberScrollerFromEvent(el) {
    if (!el || el === document || el === document.documentElement || el === document.body) return;
    try {
      if (typeof el.matches === "function" && !el.matches(SCROLLER_SEL)) return;
    } catch (eM) {
      return;
    }
    var y = 0;
    try {
      y = el.scrollTop || 0;
    } catch (eY) {
      y = 0;
    }
    var key = scrollerKeyFor(el);
    if (!key) return;
    if (y < 2) {
      try {
        delete scrollerYCache[key];
      } catch (eDel) {}
      return;
    }
    scrollerYCache[key] = { k: key, id: el.id || "", y: Math.round(y) };
  }

  /* violPass11: capture scroll → cache Y; save() non forza layout */
  try {
    document.addEventListener(
      "scroll",
      function (ev) {
        try {
          rememberScrollerFromEvent(ev && ev.target);
        } catch (eScr) {}
      },
      { passive: true, capture: true }
    );
  } catch (eBindScr) {}

  function collectTabs() {
    var out = [];
    var seen = {};
    function push(el) {
      if (!el || !el.getAttribute) return;
      var spec = {
        id: el.id || "",
        kind: el.getAttribute("data-kind") || "",
        board: el.getAttribute("data-board") || "",
        bot: el.getAttribute("data-bot") || "",
        filter: el.getAttribute("data-filter") || el.getAttribute("data-status") || "",
        scope: el.getAttribute("data-scope") || el.getAttribute("data-mode") || "",
        role: el.getAttribute("role") || "",
        cls: "",
      };
      var cn = String(el.className || "");
      if (cn.indexOf("vc-cmd-tab") !== -1) spec.cls = "vc-cmd-tab";
      if (cn.indexOf("vc-confessionale-tab") !== -1) spec.cls = "vc-confessionale-tab";
      if (cn.indexOf("vc-notif-scope-bar__btn") !== -1) spec.cls = "vc-notif-scope-bar__btn";
      if (cn.indexOf("vc-staff-pt-seg__btn") !== -1) spec.cls = "vc-staff-pt-seg__btn";
      var sig = [spec.id, spec.kind, spec.board, spec.bot, spec.filter, spec.scope, spec.cls].join("|");
      if (seen[sig]) return;
      seen[sig] = 1;
      out.push(spec);
    }

    var lists = document.querySelectorAll('[role="tablist"]');
    for (var i = 0; i < lists.length; i++) {
      var active =
        lists[i].querySelector('[role="tab"][aria-selected="true"]') ||
        lists[i].querySelector('[role="tab"][aria-current="true"]') ||
        lists[i].querySelector('[role="tab"].is-active') ||
        lists[i].querySelector('[role="tab"].vc-cmd-tab--on') ||
        lists[i].querySelector('[role="tab"].vc-confessionale-tab--on');
      push(active);
    }

    var extras = document.querySelectorAll(
      ".vc-staff-pt-seg__btn.is-active[data-kind], .vc-wt-filter-group__seg .is-active, .vc-notif-scope-bar__btn.is-active, .vc-notify-filter-btn[aria-current='true'], .vc-cmd-tab--on, .vc-confessionale-tab--on"
    );
    for (var j = 0; j < extras.length; j++) push(extras[j]);
    return out.slice(0, 20);
  }

  function normalizeDetailHref(href) {
    try {
      var u = new URL(String(href || ""), window.location.origin);
      var p = String(u.pathname || "/").replace(/\/+$/, "") || "/";
      return p;
    } catch (e) {
      return String(href || "")
        .split("?")[0]
        .split("#")[0]
        .replace(/\/+$/, "") || "";
    }
  }

  /* viewStateMenus1: snav/details senza id → chiave stabile (i18n / primo href) */
  /* viewStateMenus2: no contaminazione drawer mobile → snav header */
  function detailSpecFromEl(el) {
    if (!el || !el.getAttribute) return null;
    if (el.id) return { id: el.id };
    var acc = el.getAttribute("data-acc") || el.getAttribute("data-vc-acc") || "";
    if (acc) return { acc: acc };
    var i18n = "";
    var href = "";
    var cls = "";
    try {
      var span = el.querySelector("summary [data-i18n], summary[data-i18n]");
      if (span) i18n = String(span.getAttribute("data-i18n") || "").trim();
    } catch (eI18) {}
    try {
      var a =
        el.querySelector(".vc-snav-panel a[href], a.vc-snav-row[href], .vc-snav-row[href], a[href]");
      if (a) href = normalizeDetailHref(a.getAttribute("href") || "");
    } catch (eHref) {}
    try {
      if (el.classList) {
        if (el.classList.contains("vc-snav-details")) cls = "vc-snav-details";
        else if (el.classList.contains("vc-notif-dropdown")) cls = "vc-notif-dropdown";
        else if (el.classList.contains("vc-mobile-nav-section")) cls = "vc-mobile-nav-section";
      }
    } catch (eCls) {}
    if (!i18n && !href && !cls) return null;
    return { cls: cls, i18n: i18n, href: href };
  }

  function collectDetails() {
    var out = [];
    var seen = {};
    function pushSpec(spec) {
      if (!spec) return;
      var sig = [spec.id || "", spec.acc || "", spec.cls || "", spec.i18n || "", spec.href || ""].join("|");
      if (!sig.replace(/\|/g, "") || seen[sig]) return;
      seen[sig] = 1;
      out.push(spec);
    }
    var mobileNavOpen = false;
    try {
      mobileNavOpen =
        document.documentElement.classList.contains("vc-mobile-nav-open") ||
        (document.getElementById("vc-mobile-nav-drawer") &&
          document.getElementById("vc-mobile-nav-drawer").classList.contains("vc-mobile-nav-drawer--open"));
    } catch (eNav) {}
    var nodes = document.querySelectorAll("details[open]");
    for (var i = 0; i < nodes.length && out.length < 20; i++) {
      var node = nodes[i];
      /* viewStateMenus1: sezioni drawer mobile non contaminano snav header (stessi href) */
      try {
        if (node.classList && node.classList.contains("vc-mobile-nav-section") && !mobileNavOpen) {
          continue;
        }
        if (
          !mobileNavOpen &&
          node.closest &&
          node.closest("#vc-mobile-nav-drawer, .vc-mobile-nav-drawer")
        ) {
          continue;
        }
      } catch (eSkip) {}
      pushSpec(detailSpecFromEl(node));
    }
    var opens = document.querySelectorAll(".vc-cmd-acc.is-open, .vc-faq-group.is-open, [data-vc-acc].is-open");
    for (var k = 0; k < opens.length && out.length < 30; k++) {
      var a = opens[k];
      if (a.id) pushSpec({ id: a.id, open: 1 });
      else if (a.getAttribute("data-vc-acc")) pushSpec({ acc: a.getAttribute("data-vc-acc"), open: 1 });
      else if (a.getAttribute("data-acc")) pushSpec({ acc: a.getAttribute("data-acc"), open: 1 });
    }
    return out;
  }

  function collectPicks() {
    var picks = {};
    var ticket = document.querySelector(".vc-wt-item.is-active, .vc-wt-list .is-active[data-id], [data-ticket-id].is-active");
    if (ticket) {
      picks.ticket =
        ticket.getAttribute("data-id") ||
        ticket.getAttribute("data-ticket-id") ||
        ticket.id ||
        "";
    }
    var pager = document.querySelector(".vc-mini-pager[data-pager-page], .vc-staff-inbox-pagination[data-pager-page]");
    if (pager) picks.page = pager.getAttribute("data-pager-page") || "";
    try {
      if (
        document.documentElement.classList.contains("vc-mobile-nav-open") ||
        (document.getElementById("vc-mobile-nav-drawer") &&
          document.getElementById("vc-mobile-nav-drawer").classList.contains("vc-mobile-nav-drawer--open"))
      ) {
        picks.mobileNav = 1;
      }
    } catch (eNav) {}
    try {
      var lang = document.getElementById("vc-lang-dropdown");
      if (
        lang &&
        (lang.classList.contains("is-open") ||
          lang.classList.contains("vc-lang-dropdown--open") ||
          lang.getAttribute("aria-expanded") === "true")
      ) {
        picks.langOpen = 1;
      }
    } catch (eLang) {}
    try {
      var root = document.documentElement;
      var dd = document.getElementById("vc-notif-dropdown");
      if (
        (dd && dd.open) ||
        (root &&
          (root.classList.contains("vc-notif-sheet-open") ||
            root.classList.contains("vc-notif-drawer-open") ||
            root.classList.contains("vc-notif-dropdown-open")))
      ) {
        picks.notifOpen = 1;
      }
    } catch (eNotif) {}
    try {
      var stats =
        document.getElementById("stats") ||
        document.querySelector(".vc-home-live-stats, .vc-stat-strip, [data-vc-live-stats]");
      if (stats && stats.classList.contains("is-roster-open")) {
        if (stats.classList.contains("is-staff-open")) picks.roster = "staff";
        else if (stats.classList.contains("is-boost-open")) picks.roster = "boost";
        else if (stats.classList.contains("is-members-open")) picks.roster = "members";
        else if (stats.classList.contains("is-hours-open")) picks.roster = "hours";
        else {
          var body = document.getElementById("vc-home-staff-roster");
          var rk = body && body.getAttribute("data-roster-kind");
          if (rk) picks.roster = String(rk);
        }
      }
    } catch (eRoster) {}
    return picks;
  }

  /* oauthHashKill1: mai salvare/ripristinare #access_token / #error OAuth (rompeva login Discord) */
  function isOauthCallbackHash(raw) {
    var h = String(raw || "").replace(/^#/, "");
    if (!h) return false;
    return (
      h.indexOf("access_token=") !== -1 ||
      h.indexOf("error=") !== -1 ||
      h.indexOf("error_description=") !== -1
    );
  }
  function safeHashForPersist() {
    var h = String(window.location.hash || "");
    return isOauthCallbackHash(h) ? "" : h;
  }

  function snapshot() {
    var yNow = Math.max(0, Math.round(pageScrollY()));
    var maxNow = 0;
    try {
      maxNow = Math.max(0, Math.round(pageMaxScrollY()));
    } catch (eMx) {}
    try {
      window.__vcPtrRestoreMaxY = maxNow;
    } catch (eMx2) {}
    return {
      p: pagePath(),
      y: yNow,
      max: maxNow,
      hash: safeHashForPersist(),
      t: Date.now(),
      tabs: collectTabs(),
      details: collectDetails(),
      scrollers: collectScrollers(),
      picks: collectPicks(),
    };
  }

  function saveLight() {
    /* handlerPerf1: visibilitychange non deve fare querySelectorAll massivo sync */
    try {
      var y = effectiveSaveY(cachedScrollY || pageScrollY());
      if (y < 2 && restorePending()) return;
      var p = pagePath();
      var t = Date.now();
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ p: p, y: y, t: t }));
      var prev = null;
      try {
        prev = JSON.parse(sessionStorage.getItem(KEY) || "null");
      } catch (ePrev) {
        prev = null;
      }
      if (prev && pathMatches(prev.p)) {
        prev.p = p;
        prev.y = y;
        prev.t = t;
        prev.hash = safeHashForPersist();
        persistState(prev);
      } else {
        var light = {
          p: p,
          y: y,
          hash: safeHashForPersist(),
          t: t,
          tabs: [],
          details: [],
          scrollers: [],
          picks: {},
        };
        persistState(light);
      }
    } catch (eLight) {}
  }

  /* viewStateMenus1: tabs/details/picks sync (niente scrollers → niente Forced reflow) */
  function saveUi() {
    try {
      var y = effectiveSaveY(cachedScrollY || pageScrollY());
      if (y < 2 && restorePending()) return;
      var p = pagePath();
      var t = Date.now();
      var prev = null;
      try {
        prev = JSON.parse(sessionStorage.getItem(KEY) || "null");
      } catch (ePrev) {
        prev = null;
      }
      var scrollers = [];
      if (prev && pathMatches(prev.p) && Array.isArray(prev.scrollers)) scrollers = prev.scrollers;
      var next = {
        p: p,
        y: y,
        hash: safeHashForPersist(),
        t: t,
        tabs: collectTabs(),
        details: collectDetails(),
        scrollers: scrollers,
        picks: collectPicks(),
      };
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ p: p, y: y, t: t }));
      persistState(next);
    } catch (eUi) {}
  }

  function save() {
    /* violPass8: snapshot a fette (macrotask)
       violPass11: scrollers da cache (no scrollTop) + idle per JSON write */
    if (saving) return;
    var y0 = effectiveSaveY(cachedScrollY || pageScrollY());
    if (y0 < 2 && restorePending()) return;
    saving = true;
    var base = null;
    try {
      base = {
        p: pagePath(),
        y: y0,
        hash: safeHashForPersist(),
        t: Date.now(),
        tabs: [],
        details: [],
        scrollers: [],
        picks: {},
      };
      sessionStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({ p: base.p, y: base.y, t: base.t })
      );
    } catch (eBase) {
      saving = false;
      return;
    }
    window.setTimeout(function () {
      try {
        base.tabs = collectTabs();
        base.picks = collectPicks();
      } catch (eTabs) {}
      window.setTimeout(function () {
        try {
          base.details = collectDetails();
        } catch (eDet) {}
        var finish = function () {
          try {
            base.scrollers = collectScrollers();
            if (!base.scrollers.length) {
              try {
                var prev = JSON.parse(sessionStorage.getItem(KEY) || "null");
                if (prev && prev.p === base.p && Array.isArray(prev.scrollers) && prev.scrollers.length) {
                  base.scrollers = prev.scrollers;
                }
              } catch (ePrev) {}
            }
          } catch (eScr) {}
          try {
            persistState(base);
          } catch (eW) {}
          saving = false;
        };
        /* violKillIdle1/2 + violKillReflow1 + violKillVis1 + violKillCue2 + violKillAll1 */
        window.setTimeout(finish, 0);
      }, 0);
    }, 0);
  }

  function readState(opts) {
    opts = opts || {};
    var allowPwaLs = opts.allowPwaLs !== false;
    try {
      var raw = sessionStorage.getItem(KEY);
      var data = null;
      if (raw) {
        data = JSON.parse(raw);
        if (!data || !pathMatches(data.p)) data = null;
        else {
          var at = Number(data.t) || 0;
          if (at && Date.now() - at > TTL_MS) {
            sessionStorage.removeItem(KEY);
            data = null;
          }
        }
      }
      /* bfNavRestore1: KEY è “ultima pagina” — per back/forward usa mappa per-path */
      try {
        var mapped = readMapEntry(pagePath());
        if (mapped && pathMatches(mapped.p)) {
          if (!data || !pathMatches(data.p) || Number(mapped.t || 0) >= Number(data.t || 0)) {
            data = mapped;
          }
        }
      } catch (eMapR) {}
      if ((!data || Number(data.y || 0) < 2) && allowPwaLs && wasPwaShell()) {
        try {
          var lsRaw = vsLsGet(LS_KEY);
          if (lsRaw) {
            var lsData = JSON.parse(lsRaw);
            if (lsData && pathMatches(lsData.p)) {
              if (!data || Number(lsData.y || 0) >= Number(data.y || 0)) data = lsData;
              try {
                sessionStorage.setItem(KEY, JSON.stringify(data));
              } catch (eHydrate) {}
            }
          }
        } catch (eLs) {}
      }
      if (!data) return null;
      try {
        var anchorRaw = sessionStorage.getItem("vc_scroll_restore_anchor_v1");
        if (anchorRaw) {
          var anchor = JSON.parse(anchorRaw);
          if (
            anchor &&
            pathMatches(anchor.p) &&
            Number(anchor.y) >= 2 &&
            Number(anchor.y) > Number(data.y || 0)
          ) {
            data.y = Math.round(Number(anchor.y) || 0);
          }
        }
      } catch (eAn) {}
      return data;
    } catch (e) {
      return null;
    }
  }

  function findTab(spec) {
    if (!spec) return null;
    if (spec.id) {
      var byId = document.getElementById(spec.id);
      if (byId) return byId;
    }
    var sel = [];
    if (spec.kind) sel.push('[data-kind="' + spec.kind.replace(/"/g, "") + '"]');
    if (spec.board) sel.push('[data-board="' + spec.board.replace(/"/g, "") + '"]');
    if (spec.bot) sel.push('[data-bot="' + spec.bot.replace(/"/g, "") + '"]');
    if (spec.filter) {
      sel.push('[data-filter="' + spec.filter.replace(/"/g, "") + '"]');
      sel.push('[data-status="' + spec.filter.replace(/"/g, "") + '"]');
    }
    if (spec.scope) {
      sel.push('[data-scope="' + spec.scope.replace(/"/g, "") + '"]');
      sel.push('[data-mode="' + spec.scope.replace(/"/g, "") + '"]');
    }
    for (var i = 0; i < sel.length; i++) {
      var el = document.querySelector(sel[i]);
      if (el) return el;
    }
    if (spec.cls) {
      var list = document.querySelectorAll("." + spec.cls);
      for (var j = 0; j < list.length; j++) {
        if (list[j].classList.contains("is-active") || list[j].getAttribute("aria-selected") === "true")
          continue;
      }
    }
    return null;
  }

  function restoreTabs(tabs) {
    if (!tabs || !tabs.length) return;
    for (var i = 0; i < tabs.length; i++) {
      var el = findTab(tabs[i]);
      if (!el) continue;
      var selected = el.getAttribute("aria-selected") === "true" || el.classList.contains("is-active");
      if (selected) continue;
      try {
        /* violKillFinal1: soft restore — el.click() = Forced reflow / Violation 100–300ms */
        if (window.__vcBootLightUntil && Date.now() < window.__vcBootLightUntil) {
          try {
            el.setAttribute("aria-selected", "true");
          } catch (eA) {}
          try {
            el.classList.add("is-active", "is-selected");
          } catch (eC) {}
          continue;
        }
        el.click();
      } catch (eClick) {}
    }
  }

  function findDetailEl(d) {
    if (!d) return null;
    var el = null;
    if (d.id) el = document.getElementById(d.id);
    if (!el && d.acc) {
      el =
        document.querySelector('[data-acc="' + String(d.acc).replace(/"/g, "") + '"]') ||
        document.querySelector('[data-vc-acc="' + String(d.acc).replace(/"/g, "") + '"]');
    }
    if (!el && d.i18n) {
      try {
        var i18 = String(d.i18n).replace(/"/g, "");
        var spans = document.querySelectorAll(
          'details summary [data-i18n="' + i18 + '"], details summary[data-i18n="' + i18 + '"]'
        );
        for (var si = 0; si < spans.length; si++) {
          var cand = spans[si].closest("details");
          if (!cand) continue;
          /* prefer header snav over drawer when cls says snav */
          if (d.cls === "vc-snav-details") {
            try {
              if (cand.closest("#vc-mobile-nav-drawer, .vc-mobile-nav-drawer")) continue;
            } catch (eDr) {}
            if (!cand.classList || !cand.classList.contains("vc-snav-details")) continue;
          }
          if (d.cls === "vc-mobile-nav-section") {
            if (!cand.classList || !cand.classList.contains("vc-mobile-nav-section")) continue;
          }
          el = cand;
          break;
        }
      } catch (eI18) {}
    }
    if (!el && d.href) {
      var want = normalizeDetailHref(d.href);
      var scopeSel = "details";
      if (d.cls === "vc-snav-details") scopeSel = "details.vc-snav-details";
      else if (d.cls === "vc-mobile-nav-section") scopeSel = "details.vc-mobile-nav-section";
      else if (d.cls === "vc-notif-dropdown") scopeSel = "details.vc-notif-dropdown";
      try {
        var links = document.querySelectorAll(
          scopeSel + " .vc-snav-panel a[href], " + scopeSel + " a.vc-snav-row[href], " + scopeSel + " a[href]"
        );
        for (var li = 0; li < links.length; li++) {
          if (normalizeDetailHref(links[li].getAttribute("href") || "") !== want) continue;
          var det = links[li].closest("details");
          if (!det) continue;
          if (d.cls === "vc-snav-details") {
            try {
              if (det.closest("#vc-mobile-nav-drawer, .vc-mobile-nav-drawer")) continue;
            } catch (eDr2) {}
          }
          el = det;
          break;
        }
      } catch (eHref) {}
    }
    return el;
  }

  function restoreDetails(details) {
    if (!details || !details.length) return;
    for (var i = 0; i < details.length; i++) {
      var d = details[i];
      var el = findDetailEl(d);
      if (!el) continue;
      /* reloadRestoreMenus1: ripristina anche snav header (homeNavKill1 li skippava → menù mai aperti al F5) */
      if (el.tagName === "DETAILS") el.open = true;
      else el.classList.add("is-open");
    }
  }

  function restoreScrollers(scrollers) {
    if (!scrollers || !scrollers.length) return;
    for (var i = 0; i < scrollers.length; i++) {
      var s = scrollers[i];
      var el = null;
      if (s.id) el = document.getElementById(s.id);
      if (!el && s.k) {
        try {
          el = document.querySelector('[data-vc-scroll="' + s.k + '"]');
        } catch (e0) {}
        if (!el && s.k.indexOf(".") !== -1) {
          try {
            el = document.querySelector("." + s.k.split(".").join("."));
          } catch (e1) {}
        }
      }
      if (el) {
        try {
          el.scrollTop = Math.max(0, Number(s.y) || 0);
        } catch (e2) {}
      }
    }
  }

  function restorePicks(picks) {
    if (!picks) return;
    /* violKillFinal1: durante boot niente .click() (Forced reflow) */
    var bootSoft = Boolean(window.__vcBootLightUntil && Date.now() < window.__vcBootLightUntil);
    if (picks.ticket && !bootSoft) {
      var t =
        document.querySelector('[data-id="' + picks.ticket + '"]') ||
        document.querySelector('[data-ticket-id="' + picks.ticket + '"]') ||
        document.getElementById(picks.ticket);
      if (t) {
        try {
          t.click();
        } catch (eT) {}
      }
    }
    /* reloadRestoreMenus1: ripristina hamburger se era aperto al refresh */
    if (picks.mobileNav) {
      try {
        var rootM = document.documentElement;
        var drawer = document.getElementById("vc-mobile-nav-drawer");
        var alreadyOpen =
          (rootM && rootM.classList.contains("vc-mobile-nav-open")) ||
          (drawer && drawer.classList.contains("vc-mobile-nav-drawer--open"));
        if (!alreadyOpen) {
          if (typeof window.__vcOpenMobileNav === "function") {
            window.__vcOpenMobileNav();
          } else {
            var tog = document.getElementById("vc-mobile-nav-toggle");
            if (tog) tog.click();
            else {
              if (rootM) rootM.classList.add("vc-mobile-nav-open");
              if (drawer) {
                drawer.classList.add("vc-mobile-nav-drawer--open");
                drawer.setAttribute("aria-hidden", "false");
              }
            }
          }
        }
      } catch (eNavOpen) {}
    }
    if (picks.langOpen) {
      try {
        if (window.VcI18n && typeof window.VcI18n.openLangMenu === "function") {
          window.VcI18n.openLangMenu();
        } else {
          var lang = document.getElementById("vc-lang-dropdown");
          if (lang) {
            lang.classList.add("is-open");
            lang.setAttribute("aria-expanded", "true");
          }
        }
      } catch (eLang) {}
    }
    if (picks.notifOpen) {
      try {
        var rootN = document.documentElement;
        var ddN = document.getElementById("vc-notif-dropdown");
        var already =
          (ddN && ddN.open) ||
          (rootN &&
            (rootN.classList.contains("vc-notif-sheet-open") ||
              rootN.classList.contains("vc-notif-drawer-open") ||
              rootN.classList.contains("vc-notif-dropdown-open")));
        if (!already) {
          if (typeof window.openNotifDropdownProgrammatic === "function") {
            window.openNotifDropdownProgrammatic();
          } else if (ddN) {
            ddN.open = true;
            var sum = ddN.querySelector("summary.vc-notif-summary, summary");
            if (sum) sum.click();
          }
        }
      } catch (eNotifR) {}
    }
    if (picks.roster) {
      try {
        var kind = String(picks.roster || "");
        var openCell =
          document.querySelector(".vc-stat-cell--" + kind + "-open") ||
          document.querySelector(".vc-stat-cell--" + kind + "[aria-expanded='true']");
        if (!openCell) {
          var liveKey = kind === "boost" ? "boosts" : kind;
          var num = document.querySelector('[data-live-stat="' + liveKey + '"]');
          var cell = (num && num.closest(".vc-stat-cell")) || document.querySelector(".vc-stat-cell--" + kind);
          if (cell && cell.getAttribute("aria-expanded") !== "true") {
            cell.click();
          }
        }
      } catch (eRosterR) {}
    }
  }

  function chromeVisualBusy() {
    try {
      /* scrollAfterBar2: restore Y SOLO con flag esplicito post-barra (mai prima) */
      if (window.__vcChromeVisualReady !== 1) return true;
      var root = document.documentElement;
      if (root.classList.contains("vc-chrome-bar-loading")) return true;
      var wrap = document.getElementById("vc-site-progress");
      if (wrap && wrap.classList.contains("is-loading")) return true;
      if (window.__vcChromeLoadDone === false) return true;
      if (!window.__vcChromeForceUnlockAt && !window.__vcChromeLoadDone) return true;
    } catch (eBusy) {}
    return false;
  }

  function pageReadyForScrollRestore() {
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-loader-blocking-live")) return false;
      if (root.classList.contains("vc-loading-scroll-lock")) return false;
      if (root.classList.contains("vc-interaction-hold")) return false;
      if (root.classList.contains("vc-chrome-bar-loading")) return false;
      if (chromeVisualBusy()) return false;
      if (root.classList.contains("vc-session-verify-pending")) return false;
      if (root.classList.contains("vc-user-leader-pending")) return false;
      if (root.classList.contains("vc-user-profile-pending")) return false;
      if (root.classList.contains("vc-rank-customize-pending")) return false;
      if (
        root.classList.contains("vc-page-cine-boot") &&
        !root.classList.contains("vc-page-cine-ready")
      ) {
        return false;
      }
      if (
        root.classList.contains("vc-page-cine-boot") &&
        !root.classList.contains("vc-cine-curtain-off")
      ) {
        return false;
      }
      /* boardsScrollPath1: aspetta render async lista/wizard prima del finalize */
      try {
        if (
          document.body &&
          document.body.classList.contains("vc-boards-page") &&
          !window.__vcBoardsContentReady
        ) {
          return false;
        }
      } catch (eBd) {}
      if (root.classList.contains("vc-page-cine-ready")) return true;
      if (document.readyState === "complete") return true;
      return document.readyState === "interactive" && !root.classList.contains("vc-page-cine-boot");
    } catch (eReady) {
      return document.readyState === "complete";
    }
  }

  var maxScrollCache = 0;
  function measureRealMaxScrollY() {
    try {
      var doc = document.documentElement;
      var body = document.body;
      var h = Math.max(
        (doc && doc.scrollHeight) || 0,
        (body && body.scrollHeight) || 0,
      );
      var vh = window.innerHeight || (doc && doc.clientHeight) || 0;
      var real = Math.max(0, h - vh);
      if (real > 0) maxScrollCache = real;
      return real;
    } catch (eM) {
      return maxScrollCache || 0;
    }
  }
  function pageMaxScrollY() {
    /* bootNoFooter2: MAI usare max salvato (visita precedente) come altezza attuale —
       altrimenti scrollTo(y) su doc corto clampa in fondo al footer. */
    return measureRealMaxScrollY();
  }

  function applyScroll(y, force) {
    y = Math.max(0, Math.round(Number(y) || 0));
    if (y < 2) return;
    try {
      window.__vcPtrRestoreY = y;
      window.__vcViewStateRestoreY = y;
      document.documentElement.setAttribute("data-vc-ptr-restore-y", String(y));
    } catch (e0) {}
    /* scrollReloadKillYoYo2: durante pin non scrollTo (combatte top:-Y → yo-yo) */
    try {
      var rootA = document.documentElement;
      /* scrollAfterBar2: anche force aspetta la barra (niente Y mid-load) */
      if (chromeVisualBusy()) return;
      /* bootNoFooter2: sipario ancora su → resta in alto, zero restore mid/footer */
      if (
        rootA.classList.contains("vc-page-cine-boot") &&
        !rootA.classList.contains("vc-page-cine-ready") &&
        !rootA.classList.contains("vc-cine-curtain-off")
      ) {
        return;
      }
      if (!force) {
        if (rootA.classList.contains("vc-ptr-scroll-restore-pending")) return;
        if (window.__vcPtrRestoreDone) return;
        if (!pageReadyForScrollRestore()) return;
      } else {
        try {
          rootA.classList.remove("vc-scroll-reload-top-lock");
          rootA.classList.remove("vc-ptr-scroll-restore-pending");
        } catch (eUnlock) {}
      }
    } catch (eDefer) {
      if (!force) return;
    }
    /* homeBootTop1 + bootNoFooter2: misura REALE — mai scroll oltre max (clampa → footer) */
    try {
      var maxNow = measureRealMaxScrollY();
      if (maxNow < 64 && y > 64) return;
      if (maxNow < y - 24) return;
    } catch (eShort) {}
    try {
      window.scrollTo(0, y);
      if (document.documentElement) document.documentElement.scrollTop = y;
      if (document.body) document.body.scrollTop = y;
    } catch (e1) {}
  }

  function restoreUiOnly(data) {
    if (!data) return;
    try {
      var curHash = String(window.location.hash || "");
      /* oauthHashKill1: se siamo sul ritorno Discord, NON toccare l'hash */
      if (isOauthCallbackHash(curHash)) {
        restoreTabs(data.tabs);
        restoreDetails(data.details);
        restorePicks(data.picks);
        restoreScrollers(data.scrollers);
        return;
      }
      var wantHash = String(data.hash || "");
      if (isOauthCallbackHash(wantHash)) wantHash = "";
      if (wantHash && curHash !== wantHash) {
        if (history.replaceState) {
          var h = wantHash;
          if (h && h.charAt(0) !== "#") h = "#" + h;
          history.replaceState(
            null,
            "",
            String(window.location.pathname || "") +
              String(window.location.search || "") +
              h,
          );
        } else {
          window.location.hash = wantHash;
        }
      }
    } catch (eH) {}
    restoreTabs(data.tabs);
    restoreDetails(data.details);
    restorePicks(data.picks);
    restoreScrollers(data.scrollers);
  }

  function restoreAll(data) {
    if (!data) return;
    restoreUiOnly(data);
    applyScroll(data.y);
  }

  function scheduleRestore(data) {
    if (!data) return;
    var doneUi = false;
    var finalized = false;
    /* scrollBarTrack2: restore Y con setTimeout — __vcLight (gap 320ms) = attesa eterna */
    function light(fn, ms) {
      return window.setTimeout(fn, Math.max(0, Number(ms) || 0));
    }
    function restoreYNow(force) {
      var wantY = Math.max(0, Math.round(Number(data.y) || 0));
      if (wantY < 2) return false;
      /* homeBootFix2: home mai restore (evita salto footer a fine boot) */
      try {
        var hp = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
        if (
          hp === "/" ||
          (document.body && document.body.classList.contains("vc-body--home"))
        ) {
          window.__vcDiscardScrollRestore = 1;
          return true;
        }
      } catch (eHomeRy) {}
      /* refreshScrollRestore1: discard solo se boot ha scartato (nav nuova), non su F5 */
      try {
        if (window.__vcDiscardScrollRestore === 1) return true;
      } catch (eDisc) {}
      /* scrollYoYoKill1: MAI unlock/scroll prima della barra — altrimenti Y mid-load → forceTop → Y */
      if (window.__vcChromeVisualReady !== 1) return false;
      if (!force && chromeVisualBusy()) return false;
      try {
        if (window.__vcPtrRestoreDone) {
          var curDone = Math.max(
            0,
            Math.round(
              window.pageYOffset ||
                (document.documentElement && document.documentElement.scrollTop) ||
                0,
            ),
          );
          if (curDone >= wantY - 48) return true;
        }
        /* scrollBarTrack3: togli lock FIXED prima di misurare — altrimenti maxY≈0 e restore fallisce per secondi */
        try {
          window.__vcTopPinActive = 0;
          document.documentElement.classList.remove("vc-scroll-reload-top-lock", "vc-ptr-scroll-restore-pending");
          var topCss = document.getElementById("vc-scroll-reload-top-lock-css");
          if (topCss && topCss.parentNode) topCss.parentNode.removeChild(topCss);
        } catch (eUnlock) {}
        var maxY = measureRealMaxScrollY();
        /* scrollBarTrack3c + refreshNoFooterJump1: aspetta altezza reale.
           Math.min(want,max) su doc corto = fondo → resta in footer. */
        if (maxY < 64) return false;
        if (maxY < wantY - 24) return false;
        /* bootNoJumpFooter1: pending in zona footer → scarta (F5/session flash) */
        if (maxY >= 120 && wantY >= Math.max(80, maxY - 96)) {
          try {
            window.__vcDiscardScrollRestore = 1;
            window.__vcPtrRestoreTargetY = 0;
            window.__vcPtrRestoreY = 0;
            window.__vcViewStateRestoreY = 0;
            window.__vcPtrRestoreDone = 1;
            window.scrollTo(0, 0);
            if (document.documentElement) document.documentElement.scrollTop = 0;
            if (document.body) document.body.scrollTop = 0;
            window.__vcCachedScrollY = 0;
          } catch (eBotDiscard) {}
          return true;
        }
        var yGo = wantY;
        try {
          window.scrollTo({ top: yGo, left: 0, behavior: "instant" });
        } catch (eInst2) {
          window.scrollTo(0, yGo);
        }
        if (document.documentElement) document.documentElement.scrollTop = yGo;
        if (document.body) document.body.scrollTop = yGo;
        var got = Math.max(
          0,
          Math.round(
            window.pageYOffset ||
              (document.documentElement && document.documentElement.scrollTop) ||
              (document.body && document.body.scrollTop) ||
              0,
          ),
        );
        window.__vcCachedScrollY = got > 0 ? got : yGo;
        cachedScrollY = window.__vcCachedScrollY;
        if (got < yGo - 48) {
          /* scroll ancora non applicato — riprova al poll */
          return false;
        }
        window.__vcPtrRestoreDone = 1;
        try {
          document.dispatchEvent(new CustomEvent("vc:scroll-restored", { detail: { y: got } }));
        } catch (eEv) {}
        return true;
      } catch (eRy) {
        return false;
      }
    }
    function armRestoreHeightPoll() {
      if (window.__vcRestoreHeightPoll) return;
      window.__vcRestoreHeightPoll = 1;
      var n = 0;
      /* refreshScrollRestore1: poll più lungo — pagine lente (boards/wiki/profilo) crescono dopo unlock */
      var iv = window.setInterval(function () {
        n += 1;
        try {
          if (window.__vcPtrRestoreDone || n > 120) {
            window.clearInterval(iv);
            window.__vcRestoreHeightPoll = 0;
            return;
          }
          if (restoreYNow(true)) {
            window.clearInterval(iv);
            window.__vcRestoreHeightPoll = 0;
          }
        } catch (ePoll) {}
      }, 50);
    }
    function restoreUiChunked() {
      /* violKillFinal1: 1 pezzo per turno via __vcLight — no click/reflow storm */
      var tabs = Array.isArray(data.tabs) ? data.tabs.slice() : [];
      var details = Array.isArray(data.details) ? data.details.slice() : [];
      function nextTab() {
        if (!tabs.length) {
          light(nextDetail, 160);
          return;
        }
        var one = tabs.shift();
        light(function () {
          try {
            restoreTabs([one]);
          } catch (eT) {}
          nextTab();
        }, 160);
      }
      function nextDetail() {
        if (!details.length) {
          light(function () {
            try {
              restorePicks(data.picks);
            } catch (eD2) {}
            light(function () {
              try {
                restoreScrollers(data.scrollers);
              } catch (eS) {}
            }, 160);
          }, 160);
          return;
        }
        var dOne = details.shift();
        light(function () {
          try {
            restoreDetails([dOne]);
          } catch (eD1) {}
          nextDetail();
        }, 160);
      }
      light(nextTab, 200);
    }
    function run() {
      if (!doneUi) {
        doneUi = true;
        restoreUiChunked();
      }
      try {
        var yKeep = Math.max(0, Math.round(Number(data.y) || 0));
        if (yKeep >= 2) {
          window.__vcPtrRestoreY = yKeep;
          window.__vcViewStateRestoreY = yKeep;
          window.__vcPtrRestoreTargetY = yKeep;
          try {
            var mxKeep = Math.max(0, Math.round(Number(data.max) || 0));
            if (mxKeep >= 2) {
              window.__vcPtrRestoreMaxY = mxKeep;
              maxScrollCache = Math.max(maxScrollCache, mxKeep);
            }
          } catch (eMxK) {}
          document.documentElement.setAttribute("data-vc-ptr-restore-y", String(yKeep));
        }
      } catch (eKeepY) {}
      var wantY = Math.max(0, Math.round(Number(data.y) || 0));
      if (!finalized && !window.__vcPtrRestoreDone) {
        if (!pageReadyForScrollRestore()) return;
        finalized = true;
        /* scrollBarTrack3b: Y subito + poll altezza (no attesa 600ms) */
        if (wantY >= 2) {
          if (!restoreYNow(true)) {
            armRestoreHeightPoll();
            light(function () {
              restoreYNow(true);
            }, 16);
            light(function () {
              restoreYNow(true);
            }, 80);
            light(function () {
              restoreYNow(true);
            }, 200);
          }
        }
        light(function () {
          try {
            if (typeof window.__vcPtrFinalizeScroll === "function") window.__vcPtrFinalizeScroll();
          } catch (e) {}
        }, 80);
        return;
      }
      if (
        wantY >= 2 &&
        Math.max(0, Math.round(Number(cachedScrollY) || 0)) < wantY - 48 &&
        pageReadyForScrollRestore()
      ) {
        light(function () {
          restoreYNow(true);
        }, 120);
      }
    }
    /* UI chunked può restare soft; Y parte al visual-ready */
    var delays = [80, 400, 1200];
    for (var i = 0; i < delays.length; i++) light(run, delays[i]);
    function softRun() {
      run();
    }
    function onVisualReady() {
      /* scrollBarTrack3b: primo paint post-barra = restore Y sync + poll se doc corto */
      try {
        if (!restoreYNow(true)) armRestoreHeightPoll();
      } catch (eVisY) {}
      softRun();
    }
    window.addEventListener("load", softRun, { passive: true });
    document.addEventListener("vc:page-cine-ready", softRun, { passive: true });
    document.addEventListener("vc:chrome-visual-ready", onVisualReady, { passive: true });
    document.addEventListener("vc:cine-curtain-off", softRun, { passive: true });
    document.addEventListener("vc:access-ok", softRun, { passive: true });
    document.addEventListener("vc:boards-content-ready", softRun, { passive: true });
    if (window.__vcChromeVisualReady === 1) {
      light(onVisualReady, 0);
    }
  }

  /* save continuously + on leave */
  var saveTimer = 0;
  var uiSaveTimer = 0;
  var fullSaveTimer = 0;
  /* violPass9: cache Y da scroll — visibilitychange non legge layout (Forced reflow) */
  var cachedScrollY = 0;
  try {
    cachedScrollY = Math.max(0, Math.round(window.pageYOffset || 0));
  } catch (eCy0) {}
  function saveSoon() {
    /* violPass10 + violKill3: scroll → solo Y cached; saveLight idle/debounce lungo */
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      saveTimer = 0;
      if (typeof window.__vcLight === "function") {
        window.__vcLight(function () {
          try {
            saveLight();
          } catch (eSoon) {}
        }, 160);
        return;
      }
      try {
        saveLight();
      } catch (eSoon2) {}
    }, 1200);
    if (!fullSaveTimer) {
      fullSaveTimer = window.setTimeout(function () {
        fullSaveTimer = 0;
        if (typeof window.__vcLight === "function") {
          window.__vcLight(function () {
            try {
              save();
            } catch (eFull2) {}
          }, 200);
          return;
        }
        try {
          save();
        } catch (eFull3) {}
      }, 16000);
    }
  }

  function saveUiSoon() {
    if (uiSaveTimer) window.clearTimeout(uiSaveTimer);
    uiSaveTimer = window.setTimeout(function () {
      uiSaveTimer = 0;
      if (typeof window.__vcLight === "function") {
        window.__vcLight(function () {
          try {
            saveUi();
          } catch (eUiSoon) {}
        }, 160);
        return;
      }
      try {
        saveUi();
      } catch (eUiSoon2) {}
    }, 1200);
  }

  /* violKillAll1: scroll = zero sync (pageYOffset qui = Forced reflow / Violation 170ms+) */
  /* violKillFinal1: restore seriale __vcLight — no DCL/scrollHeight */
  var scrollSaveArmed = false;
  window.addEventListener(
    "scroll",
    function () {
      if (scrollSaveArmed) return;
      scrollSaveArmed = true;
      window.setTimeout(function () {
        scrollSaveArmed = false;
        try {
          cachedScrollY = Math.max(0, Math.round(Number(window.__vcCachedScrollY) || 0));
          if (!(cachedScrollY >= 0)) cachedScrollY = 0;
          if (cachedScrollY < 2) {
            cachedScrollY = Math.max(0, Math.round(window.pageYOffset || document.documentElement.scrollTop || 0));
          }
          window.__vcCachedScrollY = cachedScrollY;
        } catch (eCy) {}
        saveSoon();
      }, 1500);
    },
    { passive: true },
  );
  window.addEventListener("hashchange", saveSoon, { passive: true });
  document.addEventListener(
    "click",
    function () {
      saveSoon();
      saveUiSoon();
    },
    true,
  );
  document.addEventListener(
    "change",
    function () {
      saveSoon();
      saveUiSoon();
    },
    true,
  );
  document.addEventListener(
    "toggle",
    function () {
      saveUiSoon();
    },
    true,
  );
  window.addEventListener("pagehide", function () {
    /* violPass10 + refreshScrollRestore1: Y sync subito (debounce non basta su F5 rapido) */
    try {
      saveLight();
    } catch (ePhY) {}
    try {
      saveUi();
    } catch (ePh) {}
  });
  window.addEventListener("beforeunload", function () {
    try {
      saveLight();
    } catch (eBuY) {}
    try {
      saveUi();
    } catch (eBu) {}
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "hidden") return;
    /* violKill6: zero DOM — solo Y già cached in sessionStorage */
    try {
      var yVis = Math.max(0, Math.round(Number(cachedScrollY) || 0));
      if (yVis < 2) return;
      sessionStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({ p: pagePath(), y: yVis, t: Date.now() })
      );
    } catch (eVis) {}
  });
  /* violKill6 */
  /* violPass3 */
  /* violPass4 */
  /* violPass5 */
  /* violPass7 */
  /* violPass8 */
  /* violPass9 */
  /* violPass10 */
  /* violPass11 */

  /* restore on reload, PWA reopen, oppure back/forward (bfNavRestore1) */
  if (isReloadNav() || shouldRestorePwaUi() || isBackForwardNav()) {
    var data = readState({ allowPwaLs: true });
    if (data) {
      window.__vcViewStateData = data;
      scheduleRestore(data);
    }
    clearPwaUiPending();
  }

  window.__vcViewStateApi = {
    save: save,
    saveUi: saveUi,
    restore: function () {
      scheduleRestore(readState({ allowPwaLs: true }));
    },
  };
})();
/* scrollReloadNoBounce3 */
/* viewStateMenus1 */
/* viewStateMenus2 */
/* violPass10 */
/* violPass11 */
/* pwaResumeUi1 */
/* bfNavRestore1 */
/* refreshScrollRestore1 */
/* reloadRestoreMenus1: niente boot-close aggressivo sui menù dopo restore */
/* violKill5 */
/* loadScrollBarGap1 */
/* reloadRestoreMenus1 */
