/**
 * vc-view-state1: al reload ripristina scroll, hash, tab e selezione UI.
 * Solo su reload (F5 / Ctrl+R / PTR), non sulla navigazione tra pagine.
 */
(function vcViewState() {
  if (window.__vcViewState) return;
  window.__vcViewState = 1;

  var KEY = "vc_view_state_v1";
  var SCROLL_KEY = "vc_ptr_scroll_v1";
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
      return sp === cur;
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

  /* boardsScrollSaveGuard1: non sovrascrivere Y salvata con 0 (restore / handoff reload) */
  function effectiveSaveY(y) {
    y = Math.max(0, Math.round(Number(y) || 0));
    if (y >= 2) return y;
    try {
      var ty = Math.max(
        0,
        Math.round(Number(window.__vcPtrRestoreTargetY || 0) || 0),
        Math.round(Number(window.__vcPtrRestoreY || 0) || 0),
        Math.round(Number(window.__vcViewStateRestoreY || 0) || 0),
      );
      if (ty >= 2) return ty;
      var raw =
        sessionStorage.getItem("vc_scroll_restore_anchor_v1") ||
        sessionStorage.getItem(KEY) ||
        sessionStorage.getItem(SCROLL_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && pathMatches(d.p) && Number(d.y) >= 2) {
          var age = Date.now() - (Number(d.t) || 0);
          if (restorePending() || (age >= 0 && age < 4000)) {
            return Math.round(Number(d.y) || 0);
          }
        }
      }
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
    return picks;
  }

  function snapshot() {
    return {
      p: pagePath(),
      y: Math.max(0, Math.round(pageScrollY())),
      hash: String(window.location.hash || ""),
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
        prev.hash = String(window.location.hash || "");
        sessionStorage.setItem(KEY, JSON.stringify(prev));
      } else {
        sessionStorage.setItem(
          KEY,
          JSON.stringify({ p: p, y: y, hash: String(window.location.hash || ""), t: t, tabs: [], details: [], scrollers: [], picks: {} })
        );
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
        hash: String(window.location.hash || ""),
        t: t,
        tabs: collectTabs(),
        details: collectDetails(),
        scrollers: scrollers,
        picks: collectPicks(),
      };
      sessionStorage.setItem(KEY, JSON.stringify(next));
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ p: p, y: y, t: t }));
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
        hash: String(window.location.hash || ""),
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
            sessionStorage.setItem(KEY, JSON.stringify(base));
          } catch (eW) {}
          saving = false;
        };
        try {
          if (typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(finish, { timeout: 2500 });
            return;
          }
        } catch (eIdle) {}
        window.setTimeout(finish, 0);
      }, 0);
    }, 0);
  }

  function readState() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !pathMatches(data.p)) return null;
      var at = Number(data.t) || 0;
      if (at && Date.now() - at > TTL_MS) {
        sessionStorage.removeItem(KEY);
        return null;
      }
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
    if (picks.ticket) {
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
    if (picks.mobileNav) {
      try {
        var openNow =
          document.documentElement.classList.contains("vc-mobile-nav-open") ||
          (document.getElementById("vc-mobile-nav-drawer") &&
            document.getElementById("vc-mobile-nav-drawer").classList.contains("vc-mobile-nav-drawer--open"));
        if (!openNow) {
          var tog =
            document.getElementById("vc-mobile-nav-toggle") ||
            document.querySelector(".vc-mobile-nav-toggle");
          if (tog) tog.click();
        }
      } catch (eNav) {}
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
  }

  function pageReadyForScrollRestore() {
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-loader-blocking-live")) return false;
      if (root.classList.contains("vc-loading-scroll-lock")) return false;
      if (root.classList.contains("vc-interaction-hold")) return false;
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
      if (document.documentElement.classList.contains("vc-ptr-scroll-restore-pending")) return;
      if (window.__vcPtrRestoreDone) return;
      if (!force && !pageReadyForScrollRestore()) return;
    } catch (eDefer) {
      return;
    }
    try {
      window.scrollTo(0, y);
      if (document.documentElement) document.documentElement.scrollTop = y;
      if (document.body) document.body.scrollTop = y;
    } catch (e1) {}
  }

  function restoreUiOnly(data) {
    if (!data) return;
    if (data.hash && String(window.location.hash || "") !== data.hash) {
      try {
        if (history.replaceState) {
          var h = String(data.hash || "");
          if (h && h.charAt(0) !== "#") h = "#" + h;
          history.replaceState(
            null,
            "",
            String(window.location.pathname || "") +
              String(window.location.search || "") +
              h,
          );
        } else {
          window.location.hash = data.hash;
        }
      } catch (eH) {}
    }
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
    function restoreUiChunked() {
      /* violPass8: click/open/scrollers a fette — evita Forced reflow unico */
      window.setTimeout(function () {
        try {
          restoreTabs(data.tabs);
        } catch (eT) {}
        window.setTimeout(function () {
          try {
            restoreDetails(data.details);
            restorePicks(data.picks);
          } catch (eD) {}
          window.setTimeout(function () {
            try {
              restoreScrollers(data.scrollers);
            } catch (eS) {}
          }, 0);
        }, 0);
      }, 0);
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
          document.documentElement.setAttribute("data-vc-ptr-restore-y", String(yKeep));
        }
      } catch (eKeepY) {}
      /* scrollReloadNoBounce3: niente applyScroll ripetuto — un solo finalize quando ready */
      if (finalized || window.__vcPtrRestoreDone) return;
      if (!pageReadyForScrollRestore()) return;
      finalized = true;
      try {
        if (typeof window.__vcPtrFinalizeScroll === "function") window.__vcPtrFinalizeScroll();
      } catch (e) {}
    }
    var delays = [0, 500, 1200, 2400, 4000, 7000];
    for (var i = 0; i < delays.length; i++) window.setTimeout(run, delays[i]);
    window.addEventListener("load", run, { passive: true });
    document.addEventListener("vc:page-cine-ready", run, { passive: true });
    document.addEventListener("vc:cine-curtain-off", run, { passive: true });
    document.addEventListener("vc:access-ok", run, { passive: true });
    document.addEventListener("vc:boards-content-ready", run, { passive: true });
    document.addEventListener("DOMContentLoaded", run, { passive: true });
  }

  /* save continuously + on leave */
  var saveTimer = 0;
  var uiSaveTimer = 0;
  var fullSaveTimer = 0;
  /* violPass9: cache Y da scroll — visibilitychange non legge layout (Forced reflow) */
  var cachedScrollY = 0;
  try {
    cachedScrollY = Math.max(0, Math.round(pageScrollY()));
  } catch (eCy0) {}
  function saveSoon() {
    /* violPass10: scroll → solo Y; UI menus solo su click/toggle (no saveUi ogni scroll) */
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      saveTimer = 0;
      try {
        saveLight();
      } catch (eSoon) {}
    }, 320);
    if (!fullSaveTimer) {
      fullSaveTimer = window.setTimeout(function () {
        fullSaveTimer = 0;
        var kick = function () {
          try {
            save();
          } catch (eFull) {}
        };
        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(kick, { timeout: 8000 });
        } else {
          window.setTimeout(kick, 0);
        }
      }, 8000);
    }
  }

  function saveUiSoon() {
    if (uiSaveTimer) window.clearTimeout(uiSaveTimer);
    uiSaveTimer = window.setTimeout(function () {
      uiSaveTimer = 0;
      try {
        saveUi();
      } catch (eUiSoon) {}
    }, 480);
  }

  window.addEventListener("scroll", saveSoon, { passive: true });
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
    /* violPass10: leave = UI sync (menus) — sync ok su unload */
    try {
      saveUi();
    } catch (ePh) {}
  });
  window.addEventListener("beforeunload", function () {
    try {
      saveUi();
    } catch (eBu) {}
  });
  window.addEventListener(
    "scroll",
    function () {
      try {
        cachedScrollY = Math.max(0, Math.round(pageScrollY()));
      } catch (eCy) {}
    },
    { passive: true },
  );
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      /* violPass10: SOLO Y cached — saveUi qui faceva Violation ~500ms+ */
      try {
        var yVis = effectiveSaveY(cachedScrollY);
        if (yVis < 2) return;
        sessionStorage.setItem(
          SCROLL_KEY,
          JSON.stringify({ p: pagePath(), y: yVis, t: Date.now() })
        );
      } catch (eVis) {}
    }
  });
  /* handlerPerf2 marker */
  /* violPass3 */
  /* violPass4 */
  /* violPass5 */
  /* violPass7 */
  /* violPass8 */
  /* violPass9 */
  /* violPass10 */
  /* violPass11 */

  /* restore only on reload */
  if (isReloadNav()) {
    var data = readState();
    if (data) {
      window.__vcViewStateData = data;
      scheduleRestore(data);
    }
  }

  window.__vcViewStateApi = {
    save: save,
    saveUi: saveUi,
    restore: function () {
      scheduleRestore(readState());
    },
  };
})();
/* scrollReloadNoBounce3 */
/* viewStateMenus1 */
/* viewStateMenus2 */
/* violPass10 */
/* violPass11 */
