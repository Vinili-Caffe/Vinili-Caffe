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

  function navigateToTab(tab) {
    var next = String(tab || "rank").trim().toLowerCase();
    if (!next) next = "rank";
    var dest = hrefForTab(next);
    try {
      var cur = window.location.pathname + window.location.search;
      var nxt = new URL(dest, window.location.origin).pathname + new URL(dest, window.location.origin).search;
      if (cur === nxt) {
        var hub = ensureHubState();
        syncPanels(hub);
        syncTabUi(hub);
        syncDocumentTitle(hub);
        return;
      }
    } catch (eSame) {}
    window.location.assign(dest);
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
      setLoaderCopy(rankLoading, "Caricamento Personalizza", "Sto preparando rank card, ruoli e impostazioni profilo…");
          } else {
      if (rankPage) rankPage.hidden = true;
      if (customPage) customPage.hidden = false;
      hardHideEl(rankLoading);
      allById("vc-rank-customize-loading").forEach(hardHideEl);
      setLoaderCopy(customLoading, "Caricamento Personalizza", "Sto preparando rank card, ruoli e impostazioni profilo…");
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
      else document.title = "Vinili & Caffè | " + label;
    } catch (e) {}
  }

  function boot() {
    var hub = ensureHubState();
    syncPanels(hub);
    syncTabUi(hub);
    syncDocumentTitle(hub);
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
  });
  window.addEventListener("vc-discord-profile", function () {
    try {
      maybeRedirectOwnPersonalizza();
    } catch (eProf) {}
  });
  window.addEventListener("vc:auth-logout", function () {
    try {
      window.location.replace("/");
    } catch (eOut) {
      window.location.href = "/";
    }
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  }
})();
