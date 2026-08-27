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

  function hrefForTab(tab) {
    var q = new URLSearchParams();
    var uid = userIdFromSearch(window.location.search || "");
    if (uid) q.set("id", uid);
    if (tab && tab !== "rank") q.set("target", tab);
    else q.set("target", "rank");
    var s = q.toString();
    return "/user/personalizza/" + (s ? "?" + s : "");
  }

  function ensureHubState() {
    var tab = parseTabFromSearch(window.location.search || "");
    var isRank = tab === "rank";
    var isCustom = Boolean(CUSTOM_TABS[tab]);
    var isExtras = Boolean(EXTRAS_TABS[tab]);
    window.__VC_PERS_HUB = {
      enabled: true,
      tab: tab,
      isRank: isRank,
      isCustom: isCustom,
      isExtras: isExtras,
      hrefForTab: hrefForTab,
    };
    try {
      document.documentElement.setAttribute("data-vc-pers-tab", tab);
      document.documentElement.classList.toggle("vc-pers-tab-rank", isRank);
      document.documentElement.classList.toggle("vc-pers-tab-custom", isCustom || isExtras);
      if (isRank) document.documentElement.classList.remove("vc-custom-profile-pending");
      else document.documentElement.classList.remove("vc-rank-customize-pending");
    } catch (e) {}
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
      setLoaderCopy(rankLoading, "Caricamento Personalizza", "Sto preparando rank card, ruoli e vocale...");
      /* Do not force-show rank loader: boot may already have finished. */
    } else {
      if (rankPage) rankPage.hidden = true;
      if (customPage) customPage.hidden = false;
      hardHideEl(rankLoading);
      allById("vc-rank-customize-loading").forEach(hardHideEl);
      setLoaderCopy(customLoading, "Caricamento Personalizza", "Sto preparando ruoli e vocale...");
    }
  }

  function syncTabUi(hub) {
    var nav = byId("vc-pers-hub-tabs");
    if (!nav) return;
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
    ensure: ensureHubState,
    sync: boot,
    getToken: getDiscordAccessToken,
    whenSessionReady: whenDiscordSessionReady,
    TABS: TABS,
  };

  ensureHubState();
  /* Hide inactive loaders ASAP so :has(...:not([hidden])) cannot lock scroll. */
  try {
    boot();
  } catch (eBootNow) {}
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  }
})();
