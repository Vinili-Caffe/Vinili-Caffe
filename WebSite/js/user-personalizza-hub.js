(function () {
  var TABS = [
    { id: "rank", icon: "fa-id-card-o", label: "Rank card" },
    { id: "primary", icon: "fa-star", label: "Principale" },
    { id: "secondary", icon: "fa-star-o", label: "Secondario" },
    { id: "voice", icon: "fa-microphone", label: "Vocale" },
    { id: "roles", icon: "fa-tags", label: "Ruoli" },
    { id: "birthday", icon: "fa-birthday-cake", label: "Compleanno" },
    { id: "privacy", icon: "fa-lock", label: "Privacy" },
    { id: "reactions", icon: "fa-smile-o", label: "Reactions" },
    { id: "response", icon: "fa-commenting-o", label: "Response" },
  ];
  var CUSTOM_TABS = { primary: true, secondary: true, voice: true };
  var EXTRAS_TABS = {
    birthday: true,
    privacy: true,
    roles: true,
    reactions: true,
    response: true,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function allById(id) {
    try {
      return Array.prototype.slice.call(document.querySelectorAll('[id="' + id + '"]'));
    } catch (e) {
      var one = byId(id);
      return one ? [one] : [];
    }
  }

  function hardHideEl(el) {
    if (!el) return;
    try {
      el.hidden = true;
      el.setAttribute("hidden", "");
      el.setAttribute("aria-hidden", "true");
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("visibility", "hidden", "important");
      el.style.setProperty("pointer-events", "none", "important");
      el.style.setProperty("opacity", "0", "important");
    } catch (e) {}
  }

  function dedupeLoaders(id) {
    var nodes = allById(id);
    if (nodes.length <= 1) return nodes[0] || null;
    var keep = nodes[0];
    for (var i = 1; i < nodes.length; i++) {
      try {
        if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
      } catch (e) {}
    }
    return keep;
  }

  function setLoaderCopy(el, title, sub) {
    if (!el) return;
    try {
      var t = el.querySelector(".vc-user-profile-loader__title");
      var s = el.querySelector(".vc-user-profile-loader__sub");
      if (t && title) t.textContent = title;
      if (s && sub) s.textContent = sub;
      if (title) el.setAttribute("aria-label", title);
    } catch (e) {}
  }

  function parseTabFromSearch(search) {
    try {
      var q = new URLSearchParams(search || "");
      var t = String(q.get("target") || q.get("slot") || q.get("tab") || "")
        .trim()
        .toLowerCase();
      if (t === "vocale") return "voice";
      if (t === "primary" || t === "secondary" || t === "voice") return t;
      if (t === "ruoli" || t === "rolepanel" || t === "colors" || t === "colori") return "roles";
      if (t === "mention" || t === "mention_reaction") return "reactions";
      if (t === "mention_response") return "response";
      if (EXTRAS_TABS[t]) return t;
      if (t === "rank" || t === "wallpaper") return "rank";
    } catch (e) {}
    return "rank";
  }

  function userIdFromSearch(search) {
    try {
      var q = new URLSearchParams(search || "");
      var id = String(q.get("id") || q.get("userId") || "").trim();
      if (/^\d{17,20}$/.test(id)) return id;
    } catch (e) {}
    return "";
  }

  function readCachedOwnUserId() {
    try {
      var t = String(localStorage.getItem("vc_discord_access_token") || "").trim();
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (!t || (exp && Date.now() >= exp)) return "";
      var fp = exp + "|" + t.slice(0, 32);
      var raw = sessionStorage.getItem("vc_discord_me_cache_v1");
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.v === 1 && o.user && String(o.fp || "") === fp) {
          var uid = String(o.user.id || "").trim();
          if (/^\d{17,20}$/.test(uid)) return uid;
        }
      }
      var uidRaw = localStorage.getItem("vc_discord_uid_v1");
      if (uidRaw) {
        var uo = JSON.parse(uidRaw);
        if (uo && String(uo.fp || "") === fp && /^\d{17,20}$/.test(String(uo.uid || ""))) {
          return String(uo.uid);
        }
      }
    } catch (e) {}
    return "";
  }

  function resolveOwnUserId() {
    var fromUrl = userIdFromSearch(window.location.search || "");
    if (fromUrl) return fromUrl;
    try {
      if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) {
        var live = String(window.__VC_DISCORD_PROFILE.id || "").trim();
        if (/^\d{17,20}$/.test(live)) return live;
      }
    } catch (eLive) {}
    return readCachedOwnUserId();
  }

  var PERSONALIZZA_BASE = "/personalizza/";

  function isPersonalizzaHubPath() {
    try {
      var path = String(window.location.pathname || "")
        .replace(/\/index\.html?$/i, "")
        .replace(/\/+$/, "") || "/";
      return (
        path === "/personalizza" ||
        path === "/user/personalizza" ||
        path === "/user/customize" ||
        path === "/user/custom"
      );
    } catch (e) {
      return false;
    }
  }

  function maybeRedirectOwnPersonalizza() {
    if (!isPersonalizzaHubPath()) return false;
    try {
      var path = String(window.location.pathname || "")
        .replace(/\/index\.html?$/i, "")
        .replace(/\/+$/, "") || "/";
      if (path === "/user/personalizza" || path === "/user/customize" || path === "/user/custom") {
        var legacyQ = new URLSearchParams(window.location.search || "");
        window.location.replace(PERSONALIZZA_BASE + (legacyQ.toString() ? "?" + legacyQ.toString() : ""));
        return true;
      }
      var q = new URLSearchParams(window.location.search || "");
      if (userIdFromSearch(q.toString())) return false;
      var uid = resolveOwnUserId();
      if (!/^\d{17,20}$/.test(uid)) return false;
      q.set("id", uid);
      if (!q.has("target")) q.set("target", parseTabFromSearch(q.toString()));
      window.location.replace(PERSONALIZZA_BASE + "?" + q.toString());
      return true;
    } catch (e) {}
    return false;
  }

  function hrefForTab(tab) {
    var q = new URLSearchParams();
    var uid = resolveOwnUserId();
    if (uid) q.set("id", uid);
    var next = String(tab || "rank").trim().toLowerCase();
    if (!next || next === "rank") q.set("target", "rank");
    else q.set("target", next);
    var s = q.toString();
    return PERSONALIZZA_BASE + (s ? "?" + s : "");
  }

  function profileBackHref() {
    var uid = resolveOwnUserId();
    return uid ? "/user/?id=" + encodeURIComponent(uid) : "/user/";
  }

  function syncHubBackLink() {
    var a = byId("vc-pers-hub-back");
    if (!a) return;
    a.setAttribute("href", profileBackHref());
  }

  function applyHubTabClasses(tab) {
    var isRank = tab === "rank";
    var isCustom = Boolean(CUSTOM_TABS[tab]);
    var isExtras = Boolean(EXTRAS_TABS[tab]);
    try {
      var html = document.documentElement;
      html.classList.remove("vc-pers-tab-rank", "vc-pers-tab-custom");
      html.classList.add(isRank ? "vc-pers-tab-rank" : "vc-pers-tab-custom");
      html.setAttribute("data-vc-pers-tab", tab);
      if (isRank) html.classList.remove("vc-custom-profile-pending");
      else html.classList.remove("vc-rank-customize-pending");
    } catch (eCls) {}
    return { isRank: isRank, isCustom: isCustom, isExtras: isExtras };
  }

  /* persTabScroll2: pin unico allo switcher — niente cascade timeout (yoyo) */
  var _tabScrollLockGen = 0;
  var _tabScrollRaf = 0;
  var _tabScrollTimer = 0;

  function headerOffsetPx() {
    try {
      var bar =
        document.querySelector(".vc-header-bar") ||
        document.querySelector("body.vc-body > header:not(.vc-pers-hub)") ||
        document.querySelector("body.vc-body > header");
      if (!bar) return 72;
      var r = bar.getBoundingClientRect();
      var h = Math.round(r.height) + 8;
      return Math.max(56, Math.min(110, h));
    } catch (e) {
      return 72;
    }
  }

  function pageScrollY() {
    try {
      return (
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        (document.body && document.body.scrollTop) ||
        0
      );
    } catch (e) {
      return 0;
    }
  }

  function tabsAnchorEl() {
    return byId("vc-pers-hub-tabs") || byId("vc-pers-hub");
  }

  function tabsTargetY() {
    var el = tabsAnchorEl();
    if (!el) return 0;
    try {
      var docTop =
        el.getBoundingClientRect().top + pageScrollY();
      return Math.max(0, Math.round(docTop - headerOffsetPx()));
    } catch (e) {
      return 0;
    }
  }

  function ensureScrollRoomForTabs(targetY, forceMinPad) {
    try {
      var doc = document.documentElement;
      var vh = window.innerHeight || 0;
      var root = byId("vc-page-content") || byId("vc-personalizza-root") || document.body;
      if (!root) return;
      var pad = byId("vc-pers-tab-scroll-pad");
      if (!pad) {
        pad = document.createElement("div");
        pad.id = "vc-pers-tab-scroll-pad";
        pad.setAttribute("aria-hidden", "true");
        pad.style.cssText =
          "width:100%;pointer-events:none;flex:none;margin:0;padding:0;border:0;";
        root.appendChild(pad);
      }
      var cur = parseInt(pad.style.height || "0", 10) || 0;
      /* altezza “vera” senza pad (maxYRaw può essere negativo se content < viewport) */
      var contentH = Math.max(0, (doc.scrollHeight || 0) - cur);
      var maxYRaw = contentH - vh;
      var y = Math.max(0, Math.round(targetY || 0));
      /* serve: contentH + pad - vh >= y  →  pad >= y - maxYRaw */
      var need = Math.max(0, Math.ceil(y - maxYRaw + 64));
      if (forceMinPad) {
        pad.style.height = Math.max(cur, need, Math.round(vh * 0.4)) + "px";
        return;
      }
      pad.style.height = need + "px";
    } catch (ePad) {}
  }

  function hardenCineAgainstTop(y) {
    try {
      var yy = Math.max(2, Math.round(y || 0));
      window.__vcPtrRestoreTargetY = yy;
      window.__vcPtrRestoreY = yy;
      window.__vcPtrRestoreDone = 1;
      window.__vcPersTabScrollLockUntil = Date.now() + 2200;
    } catch (eFlag) {}
  }

  function hardSetScrollY(y) {
    var yy = Math.max(0, Math.round(y || 0));
    try {
      window.scrollTo(0, yy);
    } catch (e1) {}
    try {
      if (document.documentElement) document.documentElement.scrollTop = yy;
    } catch (e2) {}
    try {
      if (document.body) document.body.scrollTop = yy;
    } catch (e3) {}
  }

  function scrollToHubTabs(opts) {
    opts = opts || {};
    var el = tabsAnchorEl();
    if (!el) return false;
    try {
      var y = tabsTargetY();
      ensureScrollRoomForTabs(y, Boolean(opts.lockPad));
      y = tabsTargetY();
      ensureScrollRoomForTabs(y, Boolean(opts.lockPad));
      hardenCineAgainstTop(y);
      if (opts.smooth) {
        window.scrollTo({ top: y, left: 0, behavior: "smooth" });
      } else {
        hardSetScrollY(y);
      }
      return true;
    } catch (eScroll) {
      try {
        el.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  function clearTabScrollTimers() {
    try {
      if (_tabScrollRaf) {
        window.cancelAnimationFrame(_tabScrollRaf);
        _tabScrollRaf = 0;
      }
    } catch (eR) {}
    try {
      if (_tabScrollTimer) {
        window.clearTimeout(_tabScrollTimer);
        _tabScrollTimer = 0;
      }
    } catch (eT) {}
  }

  function armUserScrollCancel(gen) {
    function cancel() {
      if (gen !== _tabScrollLockGen) return;
      _tabScrollLockGen += 1;
      clearTabScrollTimers();
      try {
        window.__vcPersTabScrollLockUntil = 0;
      } catch (e) {}
    }
    try {
      window.addEventListener("wheel", cancel, { passive: true, once: true });
      window.addEventListener("touchstart", cancel, { passive: true, once: true });
      window.addEventListener(
        "keydown",
        function onKey(ev) {
          if (gen !== _tabScrollLockGen) {
            window.removeEventListener("keydown", onKey, true);
            return;
          }
          var k = ev && ev.key;
          if (
            k === "ArrowUp" ||
            k === "ArrowDown" ||
            k === "PageUp" ||
            k === "PageDown" ||
            k === "Home" ||
            k === "End" ||
            k === " "
          ) {
            window.removeEventListener("keydown", onKey, true);
            cancel();
          }
        },
        true,
      );
    } catch (eArm) {}
  }

  function beginTabScrollLock(ms) {
    var hold = Number(ms);
    if (!Number.isFinite(hold) || hold < 200) hold = 1600;
    _tabScrollLockGen += 1;
    var gen = _tabScrollLockGen;
    clearTabScrollTimers();
    armUserScrollCancel(gen);
    var endAt = Date.now() + hold;
    var stable = 0;
    function tick() {
      if (gen !== _tabScrollLockGen) return;
      scrollToHubTabs({ smooth: false, lockPad: true });
      var el = tabsAnchorEl();
      var top = el ? el.getBoundingClientRect().top : 0;
      var want = headerOffsetPx();
      if (Math.abs(top - want) <= 3) stable += 1;
      else stable = 0;
      if (stable >= 8 || Date.now() >= endAt) {
        /* tieni pad calcolato (lockPad) — non azzerare o il next tab corto clamp-a */
        scrollToHubTabs({ smooth: false, lockPad: true });
        try {
          window.__vcPersTabScrollLockUntil = 0;
        } catch (eEnd) {}
        return;
      }
      _tabScrollRaf = window.requestAnimationFrame(tick);
    }
    scrollToHubTabs({ smooth: false, lockPad: true });
    _tabScrollRaf = window.requestAnimationFrame(function () {
      if (gen !== _tabScrollLockGen) return;
      scrollToHubTabs({ smooth: false, lockPad: true });
      _tabScrollRaf = window.requestAnimationFrame(tick);
    });
    _tabScrollTimer = window.setTimeout(function () {
      if (gen !== _tabScrollLockGen) return;
      scrollToHubTabs({ smooth: false, lockPad: true });
      try {
        window.__vcPersTabScrollLockUntil = 0;
      } catch (eTo) {}
    }, hold + 40);
  }

  function scheduleScrollToHubTabs() {
    beginTabScrollLock(1800);
  }

  function afterPanelScrollToTabs() {
    /* estende/riaggancia il pin — non riavvia 8 timeout */
    try {
      var until = Number(window.__vcPersTabScrollLockUntil || 0) || 0;
      var left = until - Date.now();
      if (left > 200) {
        scrollToHubTabs({ smooth: false, lockPad: true });
        return;
      }
      beginTabScrollLock(1200);
    } catch (e) {
      beginTabScrollLock(1200);
    }
  }

  function emitHubNavigate(hub) {
    try {
      document.dispatchEvent(
        new CustomEvent("vc:pers-hub-navigate", {
          detail: { tab: hub && hub.tab ? hub.tab : parseTabFromSearch(window.location.search || "") },
        }),
      );
    } catch (eEv) {}
  }

  function tabFamily(tab) {
    var t = String(tab || "rank").trim().toLowerCase();
    if (CUSTOM_TABS[t]) return "custom";
    if (EXTRAS_TABS[t]) return "extras";
    return "rank";
  }

  function bundleReadyForTab(tab) {
    var fam = tabFamily(tab);
    try {
      if (fam === "extras") return Boolean(window.__VC_PROFILE_EXTRAS_API);
      if (fam === "custom") return typeof window.__vcCpfForceLoginGate === "function";
      return typeof window.__vcRankForceLoginGate === "function";
    } catch (e) {
      return false;
    }
  }

  function canSoftNavigate(next) {
    try {
      if (!isPersonalizzaHubPath()) return false;
      var cur = parseTabFromSearch(window.location.search || "");
      if (tabFamily(cur) === tabFamily(next)) return true;
      return bundleReadyForTab(next);
    } catch (e) {
      return false;
    }
  }

  function applyHubRoute(opts) {
    opts = opts || {};
    var wantScroll = opts.scroll !== false;
    var preY = 0;
    if (wantScroll) {
      try {
        preY = tabsTargetY();
        /* pad PRIMA del sync: evita clamp browser quando il pannello nuovo è corto */
        ensureScrollRoomForTabs(preY, true);
        hardenCineAgainstTop(preY);
        hardSetScrollY(preY);
      } catch (ePre) {}
    }
    var hub = ensureHubState();
    syncPanels(hub);
    syncTabUi(hub);
    syncDocumentTitle(hub);
    if (wantScroll) {
      try {
        ensureScrollRoomForTabs(tabsTargetY() || preY, true);
        hardSetScrollY(tabsTargetY() || preY);
      } catch (ePost) {}
    }
    emitHubNavigate(hub);
    if (wantScroll) beginTabScrollLock(1800);
    return hub;
  }

  function hardNavigateToTab(dest) {
    try {
      sessionStorage.setItem("vc_pers_scroll_tabs", "1");
    } catch (eFlag) {}
    window.location.assign(dest);
  }

  function navigateToTab(tab) {
    var next = String(tab || "rank").trim().toLowerCase();
    if (!next) next = "rank";
    var dest = hrefForTab(next);
    try {
      var cur = window.location.pathname + window.location.search;
      var nxtUrl = new URL(dest, window.location.origin);
      var nxt = nxtUrl.pathname + nxtUrl.search;
      if (cur === nxt) {
        applyHubRoute({ scroll: true });
        return;
      }
      /* soft solo se lo script della famiglia tab è già in pagina */
      if (canSoftNavigate(next)) {
        try {
          window.history.pushState({ vcPersTab: 1, tab: next }, "", nxt);
        } catch (ePush) {
          hardNavigateToTab(dest);
          return;
        }
        applyHubRoute({ scroll: true });
        return;
      }
    } catch (eSame) {}
    hardNavigateToTab(dest);
  }

  function consumeHardNavScrollFlag() {
    try {
      if (sessionStorage.getItem("vc_pers_scroll_tabs") !== "1") return;
      sessionStorage.removeItem("vc_pers_scroll_tabs");
      beginTabScrollLock(2200);
      document.addEventListener(
        "vc:soft-fx-ready",
        function () {
          beginTabScrollLock(1600);
        },
        { once: true },
      );
      document.addEventListener(
        "vc:page-cine-ready",
        function () {
          beginTabScrollLock(1600);
        },
        { once: true },
      );
    } catch (eFlag) {}
  }

  function ensureHubState() {
    var tab = parseTabFromSearch(window.location.search || "");
    var flags = applyHubTabClasses(tab);
    window.__VC_PERS_HUB = {
      enabled: true,
      tab: tab,
      isRank: flags.isRank,
      isCustom: flags.isCustom,
      isExtras: flags.isExtras,
      hrefForTab: hrefForTab,
    };
    return window.__VC_PERS_HUB;
  }

  function syncPanels(hub) {
    var rankPage = byId("vc-rank-customize-page");
    var customPage = byId("vc-custom-profile-page");
    var customLoading = dedupeLoaders("vc-custom-profile-loading");
    var rankLoading = dedupeLoaders("vc-rank-customize-loading");

    if (hub.isRank) {
      if (rankPage) rankPage.hidden = false;
      if (customPage) customPage.hidden = true;
      hardHideEl(customLoading);
      allById("vc-custom-profile-loading").forEach(hardHideEl);
      setLoaderCopy(rankLoading, "Caricamento…", "Un momento…");
          } else {
      if (rankPage) rankPage.hidden = true;
      if (customPage) customPage.hidden = false;
      hardHideEl(rankLoading);
      allById("vc-rank-customize-loading").forEach(hardHideEl);
      setLoaderCopy(customLoading, "Caricamento…", "Un momento…");
    }
  }

  function syncTabUi(hub) {
    var nav = byId("vc-pers-hub-tabs");
    if (!nav) return;
    if (!nav._vcPersTabNavWired) {
      nav._vcPersTabNavWired = true;
      nav.addEventListener("click", function (ev) {
        var link = ev.target && ev.target.closest ? ev.target.closest("[data-pers-tab]") : null;
        if (!link || !nav.contains(link)) return;
        ev.preventDefault();
        navigateToTab(link.getAttribute("data-pers-tab"));
      });
    }
    var links = nav.querySelectorAll("[data-pers-tab]");
    for (var i = 0; i < links.length; i++) {
      var el = links[i];
      var id = String(el.getAttribute("data-pers-tab") || "");
      var active = id === hub.tab;
      el.classList.toggle("is-active", active);
      if (active) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
      el.setAttribute("href", hrefForTab(id));
    }
    try {
      document.documentElement.setAttribute("data-vc-pers-ui", "persHubBackInTabs1");
      document.documentElement.classList.add("vc-pers-hub-on");
    } catch (eUi) {}
    syncHubBackLink();
  }

  function syncDocumentTitle(hub) {
    var label = "Personalizza";
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].id === hub.tab) {
        label = TABS[i].label;
        break;
      }
    }
    try {
      if (window.VcPageTitle) window.VcPageTitle.set(label);
      else document.title = "Vinili & Caffè \u01C0 " + label;
    } catch (e) {}
  }

  function boot() {
    var hub = ensureHubState();
    syncPanels(hub);
    syncTabUi(hub);
    syncDocumentTitle(hub);
    syncHubBackLink();
  }

  function getDiscordAccessToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        return String(window.__vcDiscordGetAccessToken() || "").trim();
      }
    } catch (eUse) {}
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      if (!t) return "";
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return "";
      return String(t).trim();
    } catch (eLs) {
      return "";
    }
  }

  function whenDiscordSessionReady(fn, options) {
    if (typeof fn !== "function") return;
    options = options || {};
    var maxMs = Number(options.maxMs);
    if (!Number.isFinite(maxMs) || maxMs <= 0) maxMs = 350;
    var started = Date.now();
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      fn();
    }
    if (getDiscordAccessToken() || window.__VC_DISCORD_PROFILE) {
      finish();
      return;
    }
    window.addEventListener("vc-discord-profile", finish, { once: true });
    (function poll() {
      if (done) return;
      if (getDiscordAccessToken() || window.__VC_DISCORD_PROFILE) {
        finish();
        return;
      }
      if (Date.now() - started >= maxMs) {
        finish();
        return;
      }
      setTimeout(poll, 120);
    })();
  }

  window.__VC_PERS_HUB_API = {
    parseTab: parseTabFromSearch,
    hrefForTab: hrefForTab,
    navigateToTab: navigateToTab,
    scrollToTabs: scrollToHubTabs,
    scheduleScrollToTabs: scheduleScrollToHubTabs,
    afterPanelScrollToTabs: afterPanelScrollToTabs,
    ensure: ensureHubState,
    sync: boot,
    getToken: getDiscordAccessToken,
    whenSessionReady: whenDiscordSessionReady,
    resolveOwnUserId: resolveOwnUserId,
    maybeRedirectOwnPersonalizza: maybeRedirectOwnPersonalizza,
    TABS: TABS,
  };

  if (maybeRedirectOwnPersonalizza()) return;

  ensureHubState();
    try {
    boot();
  } catch (eBootNow) {}
  try {
    consumeHardNavScrollFlag();
  } catch (eScrollBoot) {}
  try {
    window.addEventListener("popstate", function () {
      if (!isPersonalizzaHubPath()) return;
      applyHubRoute({ scroll: true });
    });
  } catch (ePop) {}
  function forceLoginGateAfterLogout() {
    /* logoutGate1: soft page — niente bounce a /, ma i pannelli devono mostrare CTA login */
    try {
      if (getDiscordAccessToken()) return;
    } catch (eTok) {}
    try {
      window.__VC_DISCORD_PROFILE = null;
    } catch (eProf) {}
    try {
      if (typeof window.__vcRankForceLoginGate === "function") {
        window.__vcRankForceLoginGate();
      }
    } catch (eRank) {}
    try {
      if (typeof window.__vcCpfForceLoginGate === "function") {
        window.__vcCpfForceLoginGate();
      }
    } catch (eCpf) {}
    try {
      boot();
    } catch (eBoot) {}
  }

  window.addEventListener("pageshow", function (ev) {
    try {
      boot();
    } catch (eShow) {}
    if (ev && ev.persisted) {
      try {
        var hubNow = ensureHubState();
        syncPanels(hubNow);
        syncTabUi(hubNow);
        syncDocumentTitle(hubNow);
      } catch (eBf) {}
    }
    try {
      if (!getDiscordAccessToken()) forceLoginGateAfterLogout();
    } catch (eLoShow) {}
  });
  window.addEventListener("vc-discord-profile", function () {
    try {
      maybeRedirectOwnPersonalizza();
    } catch (eProf) {}
  });
  /* logoutGate1: resta su /personalizza ma forza gate login (no editor fantasma) */
  window.addEventListener("vc:auth-logout", function () {
    forceLoginGateAfterLogout();
  });
  try {
    window.__vcPersForceLoginGate = forceLoginGateAfterLogout;
  } catch (eExp) {}
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  }
})();
