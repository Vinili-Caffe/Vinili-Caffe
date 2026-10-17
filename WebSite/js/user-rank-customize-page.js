(function () {
  var MAX_CUSTOM_WALLPAPER_DATAURL_LENGTH = 8000000;
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var currentUser = null;
  var loaded = null;
  var draft = null;
  var activeTab = "colors";
  var activeAccordion = "opacity";
  var saveToastTimer = null;
  var saveInFlight = false;
  var previewRenderToken = 0;
  var previewObjectUrl = "";
  var previewRefreshTimer = null;
  var previewRenderInFlight = false;
  var previewRefreshQueued = false;
  var previewLastSignature = "";
  var previewBakedOpacity = 0.8;
  var opacityDragging = false;
  var liveCustomizePollTimer = null;
  var LIVE_CUSTOMIZE_POLL_MS = 90000;
  var PREVIEW_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  /* rankFontRaceFix1: invalida cache preview avvelenata dalla race font lato server */
  var PREVIEW_CACHE_KEY = "vc_rank_customize_preview_cache_v6";
  var THEME_CACHE_KEY = "vc_rank_customize_payload_v1";
  var THEME_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var RANK_TAB_STORAGE_KEY = "vc_rank_customize_active_tab";

  function normalizeRankTab(value) {
    var t = String(value || "").trim().toLowerCase();
    if (t === "wallpaper" || t === "wall" || t === "sfondo") return "wallpaper";
    if (t === "colors" || t === "colori" || t === "color") return "colors";
    return "";
  }

  function readStoredRankTab() {
    try {
      return normalizeRankTab(sessionStorage.getItem(RANK_TAB_STORAGE_KEY) || "");
    } catch (e) {
      return "";
    }
  }

  function writeStoredRankTab(tab) {
    try {
      sessionStorage.setItem(RANK_TAB_STORAGE_KEY, normalizeRankTab(tab) || "colors");
    } catch (e) {}
  }

  function syncRankTabToUrl(tab) {
    if (!isPersHubRankTab()) return;
    var next = normalizeRankTab(tab) || "colors";
    activeTab = next;
    writeStoredRankTab(next);
    try {
      var url = new URL(window.location.href);
      var q = url.searchParams;
      var hubTarget = String(q.get("target") || "").trim().toLowerCase();
      if (hubTarget && hubTarget !== "rank" && hubTarget !== "wallpaper" && hubTarget !== "colors" && hubTarget !== "colori") {
        return;
      }
      if (!q.get("target") || q.get("target") === "wallpaper" || q.get("target") === "colors" || q.get("target") === "colori") {
        q.set("target", "rank");
      }
      if (next === "wallpaper") q.set("rankTab", "wallpaper");
      else q.delete("rankTab");
            if (String(q.get("tab") || "").toLowerCase() === "wallpaper" || String(q.get("tab") || "").toLowerCase() === "colors" || String(q.get("tab") || "").toLowerCase() === "colori") {
        q.delete("tab");
      }
      var qs = q.toString();
      var nextUrl = url.pathname + (qs ? "?" + qs : "") + (url.hash || "");
      if (nextUrl !== window.location.pathname + window.location.search + window.location.hash) {
        window.history.replaceState({}, "", nextUrl);
      }
    } catch (e) {}
  }

  function restoreRankTabFromUrl() {
    var fromUrl = "";
    try {
      var q = new URLSearchParams(window.location.search || "");
      fromUrl = normalizeRankTab(q.get("rankTab") || q.get("tab") || "");
    } catch (e) {}
    var fromStore = readStoredRankTab();
    var next = fromUrl || fromStore || "colors";
    activeTab = next;
    writeStoredRankTab(next);
    return next;
  }

  function setLocalOpacityDragPreview(enabled) {
    var overlay = byId("vc-rank-editor-preview-live-overlay");
    var img = byId("vc-rank-editor-preview-image");
    if (!overlay || !draft) return;
    if (!enabled) {
      overlay.style.opacity = "0";
      overlay.style.background = "transparent";
      overlay.style.mixBlendMode = "normal";
      if (img) img.style.filter = "";
      return;
    }
    var t = effectiveRankTheme(draft || {});
    var panel = String(t.panelColor || "#202225").trim();
    var alpha = Number(t.overlayOpacity);
    if (!Number.isFinite(alpha)) alpha = 0.8;
    alpha = Math.max(0, Math.min(1, alpha));
    var baked = Number(previewBakedOpacity);
    if (!Number.isFinite(baked)) baked = 0.8;
    baked = Math.max(0, Math.min(1, baked));
    var delta = alpha - baked;
    /* rankOpacitySmooth1: anteprima locale rispetto alla PNG baked (niente spam server in drag) */
    if (Math.abs(delta) < 0.004) {
      overlay.style.opacity = "0";
      overlay.style.background = "transparent";
      overlay.style.mixBlendMode = "normal";
      if (img) img.style.filter = "";
      return;
    }
    if (delta >= 0) {
      overlay.style.background = panel;
      overlay.style.mixBlendMode = "normal";
      overlay.style.opacity = String(Math.min(0.95, delta * 1.05));
      if (img) img.style.filter = "";
    } else {
      /* opacità ↓: schiarisci in modo leggibile anche sotto al 5–10% baked */
      var drop = Math.abs(delta);
      var towardClear = baked > 0.001 ? Math.min(1, drop / baked) : 1;
      var strength = Math.max(drop * 1.35, towardClear * 0.55);
      overlay.style.background = "rgba(248, 244, 236, 0.22)";
      overlay.style.mixBlendMode = "soft-light";
      overlay.style.opacity = String(Math.min(0.98, 0.12 + strength * 0.9));
      if (img) {
        var lift = Math.min(0.72, 0.08 + strength * 0.7);
        img.style.filter =
          "brightness(" +
          String(1 + lift) +
          ") contrast(" +
          String(1 - lift * 0.42) +
          ") saturate(" +
          String(Math.max(0.55, 1 - lift * 0.35)) +
          ")";
      }
    }
  }

  function beginOpacityDrag() {
    opacityDragging = true;
    if (previewRefreshTimer) {
      window.clearTimeout(previewRefreshTimer);
      previewRefreshTimer = null;
    }
    previewRefreshQueued = false;
    /* invalida render in volo così non azzera l'overlay locale a metà drag */
    previewRenderToken += 1;
    previewRenderInFlight = false;
  }

  function finishOpacityDrag() {
    if (!draft) return;
    var range = byId("vc-rank-opacity-range");
    if (range) draft.overlayOpacity = fromPct(range.value);
    setLocalOpacityDragPreview(true);
    opacityDragging = false;
    schedulePreviewRefresh(140);
  }

  var COLOR_FIELDS = [
    { key: "panelColor", title: "Sfondo", subtitle: "Colore dei box della rank card", icon: "fa-tint" },
    { key: "primaryTextColor", title: "Testo Principale", subtitle: "Username, progress bar e stats", icon: "fa-text-width" },
    { key: "multiplierColor", title: "Moltiplicatore", subtitle: "Testo moltiplicatore XP", icon: "fa-bolt" },
    { key: "valueColor", title: "Valori", subtitle: "Server rank e weekly rank", icon: "fa-bar-chart" },
    { key: "labelColor", title: "Etichette", subtitle: 'Label come "LEVEL", "EXP", ecc...', icon: "fa-tag" },
  ];

  /* rankFontHex1: fallback se API non manda fonts */
  var FALLBACK_RANK_FONTS = [
    { key: "arial", label: "Arial" },
    { key: "sans", label: "Noto Sans" },
    { key: "serif", label: "Georgia" },
    { key: "mono", label: "Mono" },
    { key: "display", label: "Fraktur" },
    { key: "mplus", label: "M PLUS Rounded" },
    { key: "dela", label: "Dela Gothic One" },
    { key: "dot", label: "DotGothic16" },
    { key: "pop", label: "Hachi Maru Pop" },
    { key: "rampart", label: "Rampart One" },
    { key: "reggae", label: "Reggae One" },
    { key: "rocknroll", label: "RocknRoll One" },
    { key: "yuji", label: "Yuji Syuku" },
    { key: "yusei", label: "Yusei Magic" },
    { key: "jiyu", label: "Jiyu no Tsubasa" },
    { key: "shippori", label: "Shippori Mincho" },
    { key: "bruno", label: "Bruno Ace SC" },
    { key: "castoro", label: "Castoro Titling" },
    { key: "poltawski", label: "Poltawski Nowy" },
    { key: "vina", label: "Vina Sans" },
    { key: "exo2", label: "Exo 2" },
    { key: "inconsolata", label: "Inconsolata" },
    { key: "script", label: "Dancing Script" },
    { key: "verdana", label: "Verdana" },
    { key: "tahoma", label: "Tahoma" },
    { key: "helvetica", label: "Helvetica" },
    { key: "times", label: "Times" },
    { key: "impact", label: "Impact" },
    { key: "comic", label: "Comic" },
  ];

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_RANK_CUSTOMIZE) || {};
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escForSingleQuotedCssUrl(s) {
    return String(s == null ? "" : s)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
  }

  function getToken() {
    try {
      var hub = window.__VC_PERS_HUB_API;
      if (hub && typeof hub.getToken === "function") return hub.getToken();
    } catch (eHub) {}
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        return String(window.__vcDiscordGetAccessToken() || "").trim();
      }
    } catch (eDc) {}
    var t = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!t) return "";
    var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
    if (exp && Date.now() >= exp) return "";
    return t;
  }

  function parseTargetUserId() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var fromQuery = String(q.get("id") || q.get("userId") || "").trim();
      if (/^\d{17,20}$/.test(fromQuery)) return fromQuery;
      var rawPath = String(window.location.pathname || "").replace(/\/index\.html?$/i, "");
      var match = rawPath.match(/^\/user\/(\d{17,20})\/personalizza\/?$/);
      if (match) return match[1];
      match = rawPath.match(/^\/users\/(\d{17,20})\/customize\/?$/);
      if (match) return match[1];
    } catch (e) {}
    return "";
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function sanitizeApiUrl(url) {
    var u = String(url || "").trim();
    if (!u || u === "#" || u.indexOf("{{") >= 0) return "";
    return u;
  }

  function canonicalSiteOrigin() {
    try {
      var host = String(window.location.hostname || "").toLowerCase();
      if (host === "viniliecaffe.it" || host === "www.viniliecaffe.it") {
        return "https://www.viniliecaffe.it";
      }
      return String(window.location.origin || "").replace(/\/+$/, "") || "https://www.viniliecaffe.it";
    } catch (eOrigin) {
      return "https://www.viniliecaffe.it";
    }
  }

  function absoluteApiUrl(pathOrUrl) {
    var raw = sanitizeApiUrl(pathOrUrl);
    if (!raw) return "";
    try {
      if (/^https?:\/\//i.test(raw)) return raw;
      return new URL(raw, canonicalSiteOrigin() + "/").href;
    } catch (eAbs) {
      return raw;
    }
  }

  function resolvedRankApiUrl() {
    var c = cfg();
    var local = sanitizeApiUrl(c.rankApiUrlLocal);
    if (isLocalFrontendOrigin() && local) return absoluteApiUrl(local);
    var remote = sanitizeApiUrl(c.rankApiUrl);
    if (remote) return absoluteApiUrl(remote);
    return absoluteApiUrl("/webhooks/site-rank-card");
  }

  function looksLikeHtmlResponse(text) {
    var sample = String(text || "").trim().slice(0, 512).toLowerCase();
    if (!sample) return false;
    return (
      /^\s*</.test(sample) ||
      /<!doctype/i.test(sample) ||
      /<html[\s>]/i.test(sample) ||
      /<head[\s>]/i.test(sample) ||
      /<body[\s>]/i.test(sample)
    );
  }

  function parseJsonResponseText(text) {
    var raw = String(text || "");
    if (!raw) return null;
    raw = raw.replace(/^\uFEFF/, "").trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (eJson) {}
    var start = raw.indexOf("{");
    var end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (eSlice) {}
    }
    return null;
  }

  function resolvedRankPreviewApiUrl() {
    var base = resolvedRankApiUrl();
    if (!base) return "";
    return base.replace(/\/site-rank-card\/?$/i, "/site-rank-card-preview");
  }

  function clearRankCustomizePending() {
    try {
      document.documentElement.classList.remove("vc-rank-customize-pending");
      document.documentElement.classList.remove("vc-custom-profile-pending");
      document.documentElement.classList.remove("vc-loading-scroll-lock");
      document.documentElement.classList.remove("vc-page-cine-boot");
      document.documentElement.classList.add("vc-page-cine-ready");
      /* personalizzaRankFix1e: vc-perf early CSS hides main until curtain-off */
      document.documentElement.classList.add("vc-cine-curtain-off");
      document.documentElement.classList.add("vc-styles-ready");
      document.documentElement.classList.add("vc-core-styles-ready");
      document.documentElement.classList.add("vc-soft-fx-ready");
    } catch (e) {}
    try {
      var html = document.documentElement;
      var body = document.body;
      if (html) {
        html.style.removeProperty("overflow");
        html.style.removeProperty("overflow-x");
        html.style.removeProperty("overflow-y");
        html.style.removeProperty("height");
        html.style.removeProperty("max-height");
        html.style.removeProperty("touch-action");
      }
      if (body) {
        /* persCineLayout2: tieni cine layout su /personalizza (hero baked) */
        var keepCine = false;
        try {
          keepCine =
            body.getAttribute("data-vc-cine-baked") === "1" ||
            Boolean(document.querySelector(".vc-page-cine-hero, #vc-page-intro"));
        } catch (eKeep) {}
        if (keepCine) {
          body.classList.add("vc-page-cine-layout");
          try {
            body.dataset.vcPageCineLayout = "1";
          } catch (eDsKeep) {}
          try {
            var mainKeep =
              document.getElementById("vc-personalizza-root") || document.querySelector("main");
            if (mainKeep) mainKeep.classList.add("vc-page-cine-main");
          } catch (eMainKeep) {}
        } else {
          body.classList.remove("vc-page-cine-layout");
          try {
            delete body.dataset.vcPageCineLayout;
          } catch (eDs) {}
        }
        body.style.removeProperty("position");
        body.style.removeProperty("inset");
        body.style.removeProperty("top");
        body.style.removeProperty("right");
        body.style.removeProperty("bottom");
        body.style.removeProperty("left");
        body.style.removeProperty("width");
        body.style.removeProperty("overflow");
        body.style.removeProperty("overflow-x");
        body.style.removeProperty("overflow-y");
        body.style.removeProperty("height");
        body.style.removeProperty("max-height");
        body.style.removeProperty("touch-action");
      }
    } catch (eStyle) {}
    try {
      var kill = document.querySelectorAll(
        '[id="vc-rank-customize-loading"], [id="vc-custom-profile-loading"]'
      );
      for (var ki = 0; ki < kill.length; ki++) {
        kill[ki].hidden = true;
        kill[ki].setAttribute("hidden", "");
        kill[ki].style.setProperty("display", "none", "important");
        if (kill[ki].parentNode) kill[ki].parentNode.removeChild(kill[ki]);
      }
    } catch (eKill) {}
  }

  function hideRankCustomizeLoading() {
    var nodes = [];
    try {
      nodes = Array.prototype.slice.call(document.querySelectorAll('[id="vc-rank-customize-loading"]'));
    } catch (eQ) {
    var loading = byId("vc-rank-customize-loading");
      if (loading) nodes = [loading];
    }
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].hidden = true;
      nodes[i].setAttribute("aria-hidden", "true");
      nodes[i].setAttribute("hidden", "");
      try {
        nodes[i].style.setProperty("display", "none", "important");
      } catch (eSt) {}
    }
    clearRankCustomizePending();
  }

  function persGateMarkup(opts) {
    opts = opts || {};
    var login = opts.login === true;
    var kicker = opts.kicker || "Personalizza";
    var title = opts.title || (login ? "Accedi per continuare" : "Impossibile caricare");
    var body = opts.body || "";
    var perks = login
      ? '<ul class="vc-pers-gate__perks" aria-label="Cosa puoi personalizzare">' +
        '<li><i class="fa fa-id-card-o" aria-hidden="true"></i><span>Rank card</span></li>' +
        '<li><i class="fa fa-star" aria-hidden="true"></i><span>Ruoli</span></li>' +
        '<li><i class="fa fa-sliders" aria-hidden="true"></i><span>Privacy &amp; altro</span></li>' +
        "</ul>"
      : "";
    var actions = login
      ? '<button type="button" class="vc-pers-gate__cta" data-vc-discord-login>' +
        '<img class="vc-discord-login-emoji" src="/images/discord.gif?v=20260908loginGif1" width="20" height="20" alt="" decoding="async" aria-hidden="true" />' +
        "<span>Accedi con Discord</span></button>" +
        '<a class="vc-pers-gate__secondary" href="/"><i class="fa fa-chevron-left" aria-hidden="true"></i><span>Torna alla Home</span></a>'
      : '<button type="button" class="vc-pers-gate__cta vc-pers-gate__cta--ghost" data-vc-pers-reload="1">' +
        '<i class="fa fa-refresh" aria-hidden="true"></i><span>Ricarica la pagina</span></button>';
    return (
      '<div class="vc-pers-gate' +
      (login ? " is-login" : " is-error") +
      '" data-vc-pers-gate="persGateUi1">' +
      '<section class="vc-pers-gate__card">' +
      '<div class="vc-pers-gate__badge" aria-hidden="true"><i class="fa ' +
      (login ? "fa-lock" : "fa-exclamation-triangle") +
      '"></i></div>' +
      '<p class="vc-pers-gate__kicker">' +
      esc(kicker) +
      "</p>" +
      '<h1 class="vc-pers-gate__title">' +
      esc(title) +
      "</h1>" +
      '<p class="vc-pers-gate__lead">' +
      esc(body) +
      "</p>" +
      perks +
      '<div class="vc-pers-gate__actions">' +
      actions +
      "</div></section></div>"
    );
  }

  function showRankFatalError(message) {
    var app = byId("vc-rank-customize-app");
    if (!app) {
      hideRankCustomizeLoading();
      return;
    }
    app.hidden = false;
    var msg = String(message || "Errore sconosciuto.");
    var needsLogin = /login|accedi|discord/i.test(msg);
    app.innerHTML =
      '<div class="vc-rank-customize-fatal">' +
      persGateMarkup({
        login: needsLogin,
        kicker: "Rank card",
        title: needsLogin ? "Accedi per continuare" : "Impossibile caricare",
        body: needsLogin
          ? "Collega Discord per personalizzare colori, opacità e wallpaper della rank card."
          : msg,
      }) +
      "</div>";
    var reloadBtn = app.querySelector("[data-vc-pers-reload]");
    if (reloadBtn) {
      reloadBtn.addEventListener("click", function () {
        try {
          window.location.reload();
        } catch (eRel) {}
      });
    }
    Array.prototype.slice
      .call(app.querySelectorAll(".vc-pers-gate__cta[data-vc-discord-login]"))
      .forEach(function (btn) {
        if (btn.__vcPersGateOauth) return;
        btn.__vcPersGateOauth = true;
        btn.addEventListener("click", function (ev) {
          try {
            if (ev && ev.preventDefault) ev.preventDefault();
          } catch (e0) {}
          if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
            window.__vcDiscordStartOAuthRedirect(btn);
            return;
          }
          if (typeof window.__vcDiscordStartOAuth === "function") {
            window.__vcDiscordStartOAuth(btn);
            return;
          }
          var hdr = byId("discord-login-btn");
          if (hdr) hdr.click();
        });
      });
    hideRankCustomizeLoading();
  }

  function profileUrl(userId) {
    var id = String(userId || "").trim();
    return /^\d{17,20}$/.test(id) ? "/user/?id=" + encodeURIComponent(id) : "/user";
  }

  function redirectToProfile(userId) {
    var id = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(id)) return false;
    hideRankCustomizeLoading();
    try {
      window.location.replace(profileUrl(id));
    } catch (e) {
      window.location.href = profileUrl(id);
    }
    return true;
  }

  function enforceTargetOwnership(targetUserId, user) {
    var target = String(targetUserId || "").trim();
    var viewer = String((user && user.id) || "").trim();
    if (!/^\d{17,20}$/.test(target) || !/^\d{17,20}$/.test(viewer)) return false;
    if (target === viewer) return false;
    return redirectToProfile(target);
  }

  function formatIntIt(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try {
      return Math.round(x).toLocaleString("it-IT");
    } catch (e) {
      return String(Math.round(x));
    }
  }

  function formatMult(n) {
    var x = Number(n);
    if (!Number.isFinite(x) || x <= 0) x = 1;
    return "x" + String(x.toFixed(1));
  }

  function toPct(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = 0.8;
    return Math.max(0, Math.min(100, Math.round(n * 100)));
  }

  function fromPct(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = 80;
    n = Math.max(0, Math.min(100, Math.round(n)));
    return n / 100;
  }

  function hexToRgbList(hex) {
    var raw = String(hex || "").trim();
    var body = raw.charAt(0) === "#" ? raw.slice(1) : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(body)) return "32, 34, 37";
    return (
      parseInt(body.slice(0, 2), 16) +
      ", " +
      parseInt(body.slice(2, 4), 16) +
      ", " +
      parseInt(body.slice(4, 6), 16)
    );
  }

  function normalizeHexDisplay(value, fallback) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) raw = String(fallback == null ? "" : fallback).trim();
    if (raw && raw.charAt(0) !== "#") raw = "#" + raw;
    if (!/^#[0-9a-fA-F]{6}$/.test(raw)) {
      var alt = String(fallback == null ? "" : fallback).trim();
      if (alt && alt.charAt(0) !== "#") alt = "#" + alt;
      raw = /^#[0-9a-fA-F]{6}$/.test(alt) ? alt : "#202225";
    }
    return raw.toUpperCase();
  }

  function normalizeTheme(theme) {
    var src = theme && typeof theme === "object" ? theme : {};
    var next = Object.assign({}, src);
    COLOR_FIELDS.forEach(function (field) {
      var fallback = field.key === "primaryTextColor" ? "#FFCB05" : "#202225";
      next[field.key] = normalizeHexDisplay(next[field.key], fallback);
    });
    next.fontKey = sanitizeFontKey(next.fontKey);
    return next;
  }

  function rankFonts() {
    return Array.isArray(loaded && loaded.fonts) && loaded.fonts.length
      ? loaded.fonts
      : FALLBACK_RANK_FONTS;
  }

  function sanitizeFontKey(value) {
    var raw = String(value == null ? "" : value).trim().toLowerCase();
    if (!raw) return "arial";
    var list = rankFonts();
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i].key || "").toLowerCase() === raw) return raw;
    }
    return "arial";
  }

  function wallpapers() {
    return Array.isArray(loaded && loaded.wallpapers) ? loaded.wallpapers : [];
  }

  function wallpaperByKey(key) {
    var list = wallpapers();
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i].key || "") === String(key || "")) return list[i];
    }
    return null;
  }

  function resolvedWallpaper(theme) {
    var src = theme && typeof theme === "object" ? theme : {};
    if (src.wallpaperUrl) return String(src.wallpaperUrl).trim();
    var preset = wallpaperByKey(src.wallpaperKey || "default");
    return preset && preset.previewUrl ? String(preset.previewUrl).trim() : "";
  }

  function wallpaperPermissions() {
    return (loaded && loaded.permissions) || {};
  }

  function effectiveRankTheme(theme) {
    var defaults = (loaded && loaded.defaults) || {};
    var t = theme && typeof theme === "object" ? theme : {};
    return Object.assign({}, defaults, t);
  }

    function resolvedRankBoxDisplayColor(t) {
    var rb = String(t.rankBoxBorderColor || "").trim();
    if (rb && rb.charAt(0) !== "#") rb = "#" + rb;
    var value = String(t.valueColor || "#f2f2f2").trim();
    if (value && value.charAt(0) !== "#") value = "#" + value;
    if (rb.toLowerCase() === "#ffcb05") return value;
    if (/^#[0-9a-fA-F]{6}$/.test(rb)) return rb;
    return value;
  }

  function rankStyle(theme) {
    var t = effectiveRankTheme(theme);
    var panel = String(t.panelColor || "#202225").trim();
    var primary = String(t.primaryTextColor || "#ffcb05").trim();
    var label = String(t.labelColor || "#a8acb8").trim();
    var secondary = String(t.secondaryTextColor || label || "#a8acb8").trim();
    var value = String(t.valueColor || "#f2f2f2").trim();
    var mult = String(t.multiplierColor || "#ffb400").trim();
    var pStart = String(t.progressStartColor || primary || "#ffcb05").trim();
    var pEnd = String(t.progressEndColor || primary || "#ffcb05").trim();
    var ring = String(t.ringColor || primary || "#ffcb05").trim();
    var rankBox = resolvedRankBoxDisplayColor(t);
    var opacity = t.overlayOpacity != null && t.overlayOpacity !== "" ? Number(t.overlayOpacity) : 0.8;
    if (!isFinite(opacity)) opacity = 0.8;
    opacity = Math.max(0, Math.min(1, opacity));
    var wp = resolvedWallpaper(t);
    return [
      "--vc-rank-panel:" + esc(panel),
      "--vc-rank-panel-rgb:" + esc(hexToRgbList(panel)),
      "--vc-rank-primary:" + esc(primary),
      "--vc-rank-secondary:" + esc(secondary),
      "--vc-rank-multiplier:" + esc(mult),
      "--vc-rank-value:" + esc(value),
      "--vc-rank-label:" + esc(label),
      "--vc-rank-progress-start:" + esc(pStart),
      "--vc-rank-progress-end:" + esc(pEnd),
      "--vc-rank-ring:" + esc(ring),
      "--vc-rank-rankbox:" + esc(rankBox),
      "--vc-rank-opacity:" + esc(String(opacity)),
      "--vc-rank-wallpaper:" + (wp ? "url('" + escForSingleQuotedCssUrl(wp) + "')" : "none"),
    ].join(";");
  }

  function previewStatIcon(type) {
    var svg = "";
    if (type === "trophy") {
      svg =
        '<svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">' +
        '<path d="M8 6h16l-2 10c-1.2 3-4.1 5-6 5s-4.8-2-6-5L8 6Z" fill="currentColor"></path>' +
        '<path d="M6 8c-2.9.4-4.8 2-4.8 4.7 0 3.4 2.8 5.8 6.7 5.8M26 8c2.9.4 4.8 2 4.8 4.7 0 3.4-2.8 5.8-6.7 5.8" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"></path>' +
        '<rect x="14" y="20" width="4" height="6" rx="1" fill="currentColor"></rect>' +
        '<rect x="8" y="26" width="16" height="3.6" rx="1.6" fill="currentColor"></rect>' +
        "</svg>";
    } else if (type === "bolt") {
      svg =
        '<svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">' +
        '<path d="M19 1 8 16h7l-3 15 12-17h-7l2-13Z" fill="currentColor"></path>' +
        "</svg>";
    } else {
      svg =
        '<svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">' +
        '<path d="m16 2 3.8 8 8.7 1-6.5 5.7 1.8 8.5L16 21l-7.8 5.2 1.8-8.5L3.5 11l8.7-1L16 2Z" fill="currentColor"></path>' +
        "</svg>";
    }
    return '<span class="vc-rank-editor-preview__icon vc-rank-editor-preview__icon--' + esc(type) + '">' + svg + "</span>";
  }

  function previewMarkup(data, theme) {
    var signature = previewSignatureForTheme(theme);
    var matchingCache = loadCachedPreview(signature, true);
    var initialPreviewSrc = "";
    if (matchingCache) initialPreviewSrc = matchingCache;
    else if (previewObjectUrl && previewLastSignature && previewLastSignature === signature) {
      initialPreviewSrc = previewObjectUrl;
    }
    /* personalizzaRankFix1 + rankFontRaceFix1: mai riusare blob/cache di un altro tema */
    return (
      '<div class="vc-rank-editor-preview__imagewrap' + (initialPreviewSrc ? " is-ready" : "") + '">' +
      '<div class="vc-rankcard-ph" aria-hidden="true">' +
      '<div class="vc-rankcard-ph__hero">' +
      '<span class="vc-rankcard-ph__avatar"></span>' +
      '<span class="vc-rankcard-ph__copy"><span></span><span></span></span>' +
      '<span class="vc-rankcard-ph__rank"></span>' +
      "</div>" +
      '<div class="vc-rankcard-ph__stats"><span></span><span></span><span></span></div>' +
      "</div>" +
      '<span id="vc-rank-editor-preview-live-overlay" class="vc-rank-editor-preview__liveoverlay" aria-hidden="true"></span>' +
      '<img id="vc-rank-editor-preview-image" class="vc-rank-editor-preview__image" alt="" loading="eager" decoding="async"' +
      (initialPreviewSrc ? ' src="' + esc(initialPreviewSrc) + '"' : " hidden") +
      " />" +
      '<p id="vc-rank-editor-preview-image-status" class="vc-rank-editor-preview__imagestatus" hidden></p>' +
      "</div>"
    );
  }

  function revokePreviewObjectUrl() {
    if (!previewObjectUrl) return;
    try {
      window.URL.revokeObjectURL(previewObjectUrl);
    } catch (e) {}
    previewObjectUrl = "";
  }

  function hashShort(str) {
    var s = String(str || "");
    var h = 2166136261;
    var step = Math.max(1, Math.floor(s.length / 256));
    for (var i = 0; i < s.length; i += step) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    if (s.length > 2) {
      h ^= s.charCodeAt(s.length - 1);
      h = Math.imul(h, 16777619);
      h ^= s.charCodeAt(Math.floor(s.length / 2));
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function previewSignatureForTheme(theme) {
    var normalized = normalizeTheme(effectiveRankTheme(theme || {}));
    var wp = String(normalized.wallpaperUrl || "");
    /* rankTabSwitchFix1: mai data-URL interi; rankFontRaceFix1: ordine stabile + fontKey esplicito */
    return JSON.stringify({
      fontKey: sanitizeFontKey(normalized.fontKey),
      overlayOpacity: normalized.overlayOpacity,
      wallpaperKey: String(normalized.wallpaperKey || "default"),
      wallpaperUrl: wp ? "custom:len=" + wp.length + ":h=" + hashShort(wp) : "",
      panelColor: normalized.panelColor,
      primaryTextColor: normalized.primaryTextColor,
      secondaryTextColor: normalized.secondaryTextColor,
      multiplierColor: normalized.multiplierColor,
      valueColor: normalized.valueColor,
      labelColor: normalized.labelColor,
      progressStartColor: normalized.progressStartColor,
      progressEndColor: normalized.progressEndColor,
      ringColor: normalized.ringColor,
      rankBoxBorderColor: normalized.rankBoxBorderColor,
    });
  }

  function loadCachedPreview(signature, allowExpired) {
    try {
      var raw = "";
      try {
        raw = sessionStorage.getItem(PREVIEW_CACHE_KEY) || "";
      } catch (eSession) {}
      if (!raw) {
        try {
          raw = localStorage.getItem(PREVIEW_CACHE_KEY) || "";
        } catch (eLocal) {}
      }
      if (!raw) return "";
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return "";
      if (String(parsed.signature || "") !== String(signature || "")) return "";
      var ts = Number(parsed.ts || 0);
      if (!Number.isFinite(ts)) return "";
      if (!allowExpired && Date.now() - ts > PREVIEW_CACHE_TTL_MS) return "";
      var dataUrl = String(parsed.dataUrl || "");
      if (!dataUrl || dataUrl.indexOf("data:image/") !== 0) return "";
      return dataUrl;
    } catch (e) {
      return "";
    }
  }

  function loadLatestCachedPreview(allowExpired) {
    try {
      var raw = "";
      try {
        raw = sessionStorage.getItem(PREVIEW_CACHE_KEY) || "";
      } catch (eSession) {}
      if (!raw) {
        try {
          raw = localStorage.getItem(PREVIEW_CACHE_KEY) || "";
        } catch (eLocal) {}
      }
      if (!raw) return "";
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return "";
      var ts = Number(parsed.ts || 0);
      if (!Number.isFinite(ts)) return "";
      if (!allowExpired && Date.now() - ts > PREVIEW_CACHE_TTL_MS) return "";
      var dataUrl = String(parsed.dataUrl || "");
      if (!dataUrl || dataUrl.indexOf("data:image/") !== 0) return "";
      return dataUrl;
    } catch (e) {
      return "";
    }
  }

  function saveCachedPreview(signature, dataUrl) {
    try {
      var safeSignature = String(signature || "");
      var safeDataUrl = String(dataUrl || "");
      if (!safeSignature || !safeDataUrl || safeDataUrl.indexOf("data:image/") !== 0) return;
      var serialized = JSON.stringify({
        ts: Date.now(),
        signature: safeSignature,
        dataUrl: safeDataUrl,
      });
      try {
        sessionStorage.setItem(PREVIEW_CACHE_KEY, serialized);
      } catch (eSession) {}
      try {
        localStorage.setItem(PREVIEW_CACHE_KEY, serialized);
      } catch (eLocal) {}
    } catch (e) {}
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      try {
        var reader = new FileReader();
        reader.onload = function () {
          resolve(String(reader.result || ""));
        };
        reader.onerror = function () {
          reject(new Error("preview_dataurl_failed"));
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        reject(e);
      }
    });
  }

  function markCustomizePreviewReady(img, ready) {
    var wrap = img && img.closest ? img.closest(".vc-rank-editor-preview__imagewrap") : null;
    if (wrap) wrap.classList.toggle("is-ready", Boolean(ready));
    if (img) {
      if (ready) {
        img.removeAttribute("hidden");
        img.alt = "Anteprima rank card";
      } else if (!img.getAttribute("src")) {
        img.setAttribute("hidden", "");
      }
    }
  }

  function setCustomizePreviewStatus(status, text, isError) {
    if (!status) return;
    status.textContent = text || "";
    status.className = "vc-rank-editor-preview__imagestatus" + (isError ? " is-error" : "");
    status.hidden = !text;
  }

  function applyCustomizePreviewSrc(img, src) {
    if (!img || !src) return;
    img.onload = function () {
      img.classList.remove("is-rendering");
      markCustomizePreviewReady(img, true);
    };
    img.src = src;
    img.removeAttribute("hidden");
  }

  function syncPreviewBakedOpacityFromDraft() {
    var alpha = draft && draft.overlayOpacity != null ? Number(draft.overlayOpacity) : 0.8;
    if (!Number.isFinite(alpha)) alpha = 0.8;
    previewBakedOpacity = Math.max(0, Math.min(1, alpha));
  }

  function refreshServerPreview() {
    if (previewRenderInFlight) {
      previewRefreshQueued = true;
      return;
    }
    previewRenderInFlight = true;
    previewRefreshQueued = false;
    var token = getToken();
    var url = resolvedRankPreviewApiUrl();
    var img = byId("vc-rank-editor-preview-image");
    var status = byId("vc-rank-editor-preview-image-status");
    if (!img || !status) {
      previewRenderInFlight = false;
      return;
    }
    var matchingCachedAtBoot = loadCachedPreview(previewSignatureForTheme(draft || {}), true);
    if (matchingCachedAtBoot && !img.getAttribute("src")) {
      applyCustomizePreviewSrc(img, matchingCachedAtBoot);
      img.classList.remove("is-rendering");
      setCustomizePreviewStatus(status, "", false);
      syncPreviewBakedOpacityFromDraft();
      setLocalOpacityDragPreview(false);
    }
    if (!token || !url || !draft) {
      if (!img.getAttribute("src")) setCustomizePreviewStatus(status, "Anteprima non disponibile.", true);
      else setCustomizePreviewStatus(status, "", false);
      previewRenderInFlight = false;
      return;
    }
    var signature = previewSignatureForTheme(draft);
    if (signature === previewLastSignature && img.getAttribute("src")) {
      setCustomizePreviewStatus(status, "", false);
      markCustomizePreviewReady(img, true);
      syncPreviewBakedOpacityFromDraft();
      setLocalOpacityDragPreview(false);
      previewRenderInFlight = false;
      return;
    }
    var cachedDataUrl = loadCachedPreview(signature, true);
    if (cachedDataUrl && (!img.getAttribute("src") || img.classList.contains("is-rendering"))) {
      applyCustomizePreviewSrc(img, cachedDataUrl);
      img.classList.remove("is-rendering");
      setCustomizePreviewStatus(status, "", false);
      syncPreviewBakedOpacityFromDraft();
      setLocalOpacityDragPreview(false);
    }
    if (cachedDataUrl) {
      applyCustomizePreviewSrc(img, cachedDataUrl);
      img.classList.remove("is-rendering");
      setCustomizePreviewStatus(status, "", false);
      previewLastSignature = signature;
      previewRenderInFlight = false;
      syncPreviewBakedOpacityFromDraft();
      setLocalOpacityDragPreview(false);
      return;
    }
    var myToken = ++previewRenderToken;
    setCustomizePreviewStatus(status, "", false);
    var hadSrc = Boolean(img.getAttribute("src"));
    if (!hadSrc) markCustomizePreviewReady(img, false);
        if (!hadSrc) img.classList.add("is-rendering");
    fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ theme: draft }),
    }, 35000)
      .then(function (r) {
        if (!r.ok) throw new Error("preview_http_" + r.status);
        return r.blob();
      })
      .then(function (blob) {
        if (myToken !== previewRenderToken) return;
        if (!blob || !blob.size) throw new Error("preview_empty");
        return blobToDataUrl(blob).then(function (dataUrl) {
          var nextObjectUrl = window.URL.createObjectURL(blob);
          return new Promise(function (resolve, reject) {
            var probe = new Image();
            probe.onload = function () {
              resolve({
                objectUrl: nextObjectUrl,
                dataUrl: String(dataUrl || ""),
              });
            };
            probe.onerror = function () { reject(new Error("preview_decode_failed")); };
            probe.src = nextObjectUrl;
          });
        });
      })
      .then(function (nextPreview) {
        if (!nextPreview || !nextPreview.objectUrl) return;
        var nextObjectUrl = nextPreview.objectUrl;
        var nextDataUrl = String(nextPreview.dataUrl || "");
        if (myToken !== previewRenderToken) {
          try {
            window.URL.revokeObjectURL(nextObjectUrl);
          } catch (eRevoke) {}
          return;
        }
        var prevObjectUrl = previewObjectUrl;
        previewObjectUrl = nextObjectUrl;
                if (img.getAttribute("src") !== nextObjectUrl) {
        img.src = previewObjectUrl;
        }
        img.classList.remove("is-rendering");
        markCustomizePreviewReady(img, true);
        setCustomizePreviewStatus(status, "", false);
        previewLastSignature = signature;
        if (nextDataUrl) saveCachedPreview(signature, nextDataUrl);
        if (prevObjectUrl && prevObjectUrl !== nextObjectUrl) {
          try {
            window.URL.revokeObjectURL(prevObjectUrl);
          } catch (ePrev) {}
        }
        syncPreviewBakedOpacityFromDraft();
        if (!opacityDragging) setLocalOpacityDragPreview(false);
      })
      .catch(function (err) {
        if (myToken !== previewRenderToken) return;
        img.classList.remove("is-rendering");
        if (img.getAttribute("src")) {
          markCustomizePreviewReady(img, true);
          setCustomizePreviewStatus(status, "", false);
        } else {
          markCustomizePreviewReady(img, false);
          setCustomizePreviewStatus(status, "Anteprima non disponibile al momento.", true);
        }
        if (!opacityDragging) setLocalOpacityDragPreview(false);
      })
      .finally(function () {
        previewRenderInFlight = false;
        if (previewRefreshQueued && !opacityDragging) {
          previewRefreshQueued = false;
          refreshServerPreview();
        }
      });
  }

  function schedulePreviewRefresh(delayMs) {
    var ms = Number(delayMs);
    if (!Number.isFinite(ms) || ms < 0) ms = 200;
    if (previewRefreshTimer) {
      window.clearTimeout(previewRefreshTimer);
      previewRefreshTimer = null;
    }
    previewRefreshTimer = window.setTimeout(function () {
      previewRefreshTimer = null;
      refreshServerPreview();
    }, ms);
  }

  function wallpaperGalleryMarkup() {
    return wallpapers()
      .map(function (item) {
        var key = String(item && item.key ? item.key : "");
        var selected = !draft.wallpaperUrl && String(draft.wallpaperKey || "default") === key;
        return (
          '<button type="button" class="vc-rank-editor-wallcard' + (selected ? " is-selected" : "") + '" data-rank-wallpaper="' + esc(key) + '">' +
          '<span class="vc-rank-editor-wallcard__preview"' +
          (item.previewUrl ? ' style="background-image:url(\'' + escForSingleQuotedCssUrl(item.previewUrl) + '\')"' : "") +
          ">" +
          (selected ? '<span class="vc-rank-editor-wallcard__check"><i class="fa fa-check" aria-hidden="true"></i></span>' : "") +
          "</span>" +
          '<span class="vc-rank-editor-wallcard__label">' + esc(item.label || key) + "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function wallpaperCustomMarkup() {
    var permissions = wallpaperPermissions();
    var canUseCustomWallpaper = permissions.canUseCustomWallpaper === true;
    var activeWallpaperRoles = Array.isArray(permissions.activeWallpaperRoles) ? permissions.activeWallpaperRoles : [];
    var requiredWallpaperRoles = Array.isArray(permissions.wallpaperCustomRoles) ? permissions.wallpaperCustomRoles : [];
    if (canUseCustomWallpaper) {
      return (
        '<details class="vc-rank-editor-card" data-rank-accordion="custom-wallpaper"' + (activeAccordion === "custom-wallpaper" ? " open" : "") + ">" +
        '<summary class="vc-rank-editor-card__summary" data-rank-accordion-trigger="custom-wallpaper">' +
        '<span class="vc-rank-editor-card__icon"><i class="fa fa-picture-o" aria-hidden="true"></i></span>' +
        '<span class="vc-rank-editor-card__copy"><strong>Wallpaper personalizzato</strong><span>Disponibile per ' + esc(activeWallpaperRoles.join(" • ") || requiredWallpaperRoles.join(" • ")) + "</span></span>" +
        '<span class="vc-rank-editor-card__swatch vc-rank-editor-card__swatch--wall"></span>' +
        '<i class="fa fa-angle-down vc-rank-editor-card__chev" aria-hidden="true"></i>' +
        "</summary>" +
        '<div class="vc-rank-editor-card__body">' +
        '<div class="vc-rank-editor-uploadrow">' +
        '<label class="vc-rank-editor-uploadbtn" for="vc-rank-wallpaper-file"><i class="fa fa-upload" aria-hidden="true"></i> Scegli allegato</label>' +
        '<input type="file" id="vc-rank-wallpaper-file" name="vc-rank-wallpaper-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden />' +
        '<button type="button" class="vc-rank-editor-reset" id="vc-rank-clear-wallpaper"><i class="fa fa-trash-o" aria-hidden="true"></i> Rimuovi</button>' +
        "</div>" +
        '<p class="vc-rank-editor-uploadhint">PNG, JPG, WEBP o GIF (GIF senza ricompressione). L&apos;immagine viene ottimizzata quando possibile.</p>' +
        '<p class="vc-rank-editor-uploadname" id="vc-rank-wallpaper-name">' + esc(draft.wallpaperUrl ? "Wallpaper caricato" : "Nessun allegato selezionato") + "</p>" +
        "</div></details>"
      );
    }
    return (
      '<div class="vc-rank-editor-lockcard">' +
      '<div class="vc-rank-editor-lockcard__head"><span class="vc-rank-editor-lockcard__icon"><i class="fa fa-lock" aria-hidden="true"></i></span><div><strong>Wallpaper personalizzato</strong><span>Sbloccato solo per Double Booster e VIP+</span></div></div>' +
      '<div class="vc-rank-editor-lockcard__chips">' +
      requiredWallpaperRoles.map(function (role) { return '<span class="vc-rank-editor-lockchip">' + esc(role) + "</span>"; }).join("") +
      "</div></div>"
    );
  }

  function buildFontRowMarkup() {
    var current = sanitizeFontKey(draft && draft.fontKey);
    var options = rankFonts()
      .map(function (font) {
        var key = String(font.key || "");
        var label = String(font.label || key);
        return (
          '<option value="' +
          esc(key) +
          '"' +
          (key === current ? " selected" : "") +
          ">" +
          esc(label) +
          "</option>"
        );
      })
      .join("");
    return (
      '<div class="vc-rank-fontrow" data-vc-rank-font="rankFontHex1">' +
      '<span class="vc-rank-fontrow__icon" aria-hidden="true"><i class="fa fa-font"></i></span>' +
      '<span class="vc-rank-fontrow__copy">' +
      "<strong>Font testi</strong>" +
      "<em>Applica a tutte le scritte della rank card</em>" +
      "</span>" +
      '<select id="vc-rank-font-select" name="vc-rank-font-select" class="vc-rank-fontrow__select" data-rank-font aria-label="Font testi rank card">' +
      options +
      "</select></div>"
    );
  }

  function buildColorCardsMarkup() {
    /* vcColorPick1: picker custom bacheca al posto di type=color */
    /* rankHexBesideSwatch1: un solo swatch (picker) + hex accanto, titolo a destra */
    var CP = window.VcColorPicker;
    return (
      '<div class="vc-rank-fieldgrid">' +
      COLOR_FIELDS.map(function (field) {
        var value = normalizeHexDisplay(draft[field.key], field.key === "primaryTextColor" ? "#FFCB05" : "#202225");
        var pickerHtml =
          CP && typeof CP.markup === "function"
            ? CP.markup({
                id: "vc-rank-cp-" + field.key,
                value: value,
                defaultHex: value,
                ariaLabel: field.title,
                showHexInput: false,
                showReset: false,
                allowEmpty: false,
                className: "vc-cp--swatch-only",
                wrapAttrs: 'data-rank-cp="' + esc(field.key) + '"',
              })
            : '<input class="vc-rank-editor-colorrow__picker" id="vc-rank-color-' +
              esc(field.key) +
              '" name="vc-rank-color-' +
              esc(field.key) +
              '" type="color" value="' +
              esc(value.toLowerCase()) +
              '" data-rank-field="' +
              esc(field.key) +
              '" aria-label="' +
              esc(field.title) +
              '" />';
        return (
          '<div class="vc-rank-fieldrow" data-rank-fieldrow="' +
          esc(field.key) +
          '" data-vc-rank-hex="rankHexBesideSwatch1">' +
          '<div class="vc-rank-fieldrow__color">' +
          '<div class="vc-rank-fieldrow__inputs">' +
          pickerHtml +
          "</div>" +
          '<input class="vc-rank-editor-colorrow__hex vc-rank-fieldrow__hex" id="vc-rank-hex-' +
          esc(field.key) +
          '" name="vc-rank-hex-' +
          esc(field.key) +
          '" type="text" value="' +
          esc(value) +
          '" maxlength="7" data-rank-hex="' +
          esc(field.key) +
          '" aria-label="Hex ' +
          esc(field.title) +
          '" autocomplete="off" />' +
          "</div>" +
          '<div class="vc-rank-fieldrow__copy">' +
          "<strong>" +
          esc(field.title) +
          "</strong>" +
          "<span>" +
          esc(field.subtitle) +
          "</span></div></div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function buildPanelBody() {
    if (activeTab === "colors") {
      return (
        '<div class="vc-rank-opacity-row">' +
        '<span class="vc-rank-opacity-row__icon" aria-hidden="true"><i class="fa fa-sliders"></i></span>' +
        '<span class="vc-rank-opacity-row__copy">' +
        "<strong>Opacità sfondo</strong>" +
        "<em>Opacità dei box della rank card</em>" +
        "</span>" +
        '<input id="vc-rank-opacity-range" name="vc-rank-opacity-range" class="vc-rank-opacity-row__range" type="range" min="0" max="100" step="1" value="' +
        esc(String(toPct(draft.overlayOpacity))) +
        '" aria-label="Opacità sfondo" />' +
        '<span class="vc-rank-opacity-row__pct" id="vc-rank-opacity-label">' +
        esc(String(toPct(draft.overlayOpacity))) +
        "%</span>" +
        "</div>" +
        buildFontRowMarkup() +
        buildColorCardsMarkup()
      );
    }
    /* rankPresetShell1: preset in container dedicato */
    var list = wallpapers();
    var count = list.length;
    return (
      '<div class="vc-rank-wall-block" data-vc-rank-wall="rankPresetShell1">' +
      '<section class="vc-rank-preset-shell" aria-labelledby="vc-rank-presets-title">' +
      '<header class="vc-rank-preset-shell__head">' +
      '<span class="vc-rank-preset-shell__icon" aria-hidden="true"><i class="fa fa-picture-o"></i></span>' +
      '<div class="vc-rank-preset-shell__copy">' +
      '<strong id="vc-rank-presets-title">Preset</strong>' +
      "<span>Scegli uno sfondo pronto all&apos;uso per la rank card</span>" +
      "</div>" +
      '<span class="vc-rank-preset-shell__count" aria-label="' +
      esc(String(count)) +
      ' preset">' +
      esc(String(count)) +
      "</span>" +
      "</header>" +
      '<div class="vc-rank-preset-shell__body">' +
      (count
        ? '<div class="vc-rank-editor-wallgrid">' + wallpaperGalleryMarkup() + "</div>"
        : '<p class="vc-rank-preset-shell__empty">Nessun preset disponibile al momento.</p>') +
      "</div>" +
      "</section>" +
      '<section class="vc-rank-preset-shell vc-rank-preset-shell--custom" aria-label="Wallpaper personalizzato">' +
      wallpaperCustomMarkup() +
      "</section>" +
      "</div>"
    );
  }

  function syncSubtabButtons() {
    Array.prototype.slice
      .call(document.querySelectorAll("#vc-rank-customize-app [data-rank-tab]"))
      .forEach(function (button) {
        var id = String(button.getAttribute("data-rank-tab") || "");
        button.classList.toggle("is-active", id === activeTab);
      });
  }

  function renderPanel(opts) {
    opts = opts || {};
    var panel = document.querySelector("#vc-rank-customize-app .vc-rank-controls__panel");
    if (!panel || !loaded || !draft) {
      render({ forcePreviewRefresh: Boolean(opts.forcePreviewRefresh) });
      return;
    }
    panel.innerHTML = buildPanelBody();
    syncSubtabButtons();
    bindPanelUi();
    if (opts.forcePreviewRefresh) refreshServerPreview();
  }

  function scrollRankTabsIntoView() {
    try {
      var hub = window.__VC_PERS_HUB_API;
      if (hub && typeof hub.scheduleScrollToTabs === "function") {
        hub.scheduleScrollToTabs();
        return;
      }
      if (hub && typeof hub.scrollToTabs === "function") {
        hub.scrollToTabs();
        return;
      }
    } catch (eHub) {}
    try {
      var el =
        document.querySelector("#vc-rank-customize-app .vc-rank-subtabs") ||
        document.getElementById("vc-pers-hub-tabs");
      if (!el) return;
      var y =
        el.getBoundingClientRect().top +
        (window.pageYOffset || document.documentElement.scrollTop || 0) -
        72;
      window.scrollTo({ top: Math.max(0, Math.round(y)), left: 0, behavior: "auto" });
    } catch (e) {}
  }

  function switchRankEditorTab(tab) {
    var next = normalizeRankTab(tab) || "colors";
    if (next === activeTab) {
      syncSubtabButtons();
      scrollRankTabsIntoView();
      return;
    }
    syncRankTabToUrl(next);
    if (next === "wallpaper") {
      activeAccordion = draft && draft.wallpaperUrl ? "custom-wallpaper" : "";
    } else {
      activeAccordion = activeAccordion && activeAccordion !== "custom-wallpaper" ? activeAccordion : "panelColor";
    }
    /* rankTabSwitchFix1: aggiorna solo il pannello — non distruggere preview / draft */
    renderPanel({ forcePreviewRefresh: false });
    /* persTabScroll2: resta sull’altezza switcher, non in cima */
    scrollRankTabsIntoView();
  }

  function render(opts) {
    opts = opts || {};
    var app = byId("vc-rank-customize-app");
    if (!app || !loaded || !draft) return;
    var backHref = profileUrl(
      (loaded && loaded.userId) ||
        parseTargetUserId() ||
        (currentUser && currentUser.id) ||
        ""
    );

    var preservedPreview = app.querySelector(".vc-rank-editor-preview__imagewrap");
    if (preservedPreview) preservedPreview.remove();

    var hubOn = Boolean(window.__VC_PERS_HUB && window.__VC_PERS_HUB.enabled);
    var panelBody = buildPanelBody();

    app.innerHTML =
      '<div class="vc-cpf vc-rank-as-cpf" data-vc-rank-layout="persRankStack1">' +
      '<div class="vc-rank-topbar">' +
      (hubOn
        ? ""
        : '<a class="vc-cpf-back" href="' +
          esc(backHref) +
          '"><i class="fa fa-chevron-left" aria-hidden="true"></i><span>Profilo</span></a>' +
          '<h1 class="vc-rank-topbar__title">Rank card</h1>') +
      '<nav class="vc-rank-subtabs" aria-label="Sezioni rank card">' +
      '<button type="button" class="vc-rank-subtabs__item' +
      (activeTab === "colors" ? " is-active" : "") +
      '" data-rank-tab="colors"><i class="fa fa-tint" aria-hidden="true"></i><span>Colori</span></button>' +
      '<button type="button" class="vc-rank-subtabs__item' +
      (activeTab === "wallpaper" ? " is-active" : "") +
      '" data-rank-tab="wallpaper"><i class="fa fa-picture-o" aria-hidden="true"></i><span>Wallpaper</span></button>' +
      "</nav>" +
      '<div class="vc-cpf-actions vc-rank-editor-actions">' +
      '<button type="button" class="vc-cpf-btn vc-cpf-btn--primary vc-rank-editor-save" id="vc-rank-save"><i class="fa fa-floppy-o" aria-hidden="true"></i> Salva</button>' +
      '<button type="button" class="vc-cpf-btn vc-rank-editor-reset" id="vc-rank-reset"><i class="fa fa-undo" aria-hidden="true"></i> Reset</button>' +
      "</div></div>" +
      '<section class="vc-rank-hero" aria-label="Anteprima">' +
      '<div class="vc-rank-preview__frame">' +
      '<div id="vc-rank-preview-mount"></div>' +
      "</div></section>" +
      '<div class="vc-rank-controls__panel">' +
      panelBody +
      "</div>" +
      '<p class="vc-rank-editor-status" id="vc-rank-status"></p></div>';

    var mount = byId("vc-rank-preview-mount");
    if (preservedPreview && mount) {
      mount.replaceWith(preservedPreview);
    } else if (mount) {
      mount.insertAdjacentHTML("beforebegin", previewMarkup(loaded, draft));
      mount.remove();
    }

    app.hidden = false;
    bindUi();
    hideRankCustomizeLoading();
    if (opts.forcePreviewRefresh !== false) refreshServerPreview();
  }

  var statusTimer = null;
  var STATUS_AUTO_MS = 6000;

  function clearStatusTimer() {
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
  }

  function setStatus(text, isError, opts) {
    var el = byId("vc-rank-status");
    if (el) {
      el.textContent = "";
      el.className = "vc-rank-editor-status";
    }
    clearStatusTimer();
    var msg = String(text || "").trim();
    if (window.VcSiteToast) {
      if (!msg) {
        window.VcSiteToast.hide();
        return;
      }
      window.VcSiteToast.show(msg, Boolean(isError), {
        sticky: Boolean(opts && opts.sticky),
        pending: Boolean(opts && opts.sticky) || undefined,
      });
      return;
    }
    if (!el) return;
    el.textContent = msg;
    el.className = "vc-rank-editor-status" + (isError ? " is-error" : "") + (msg ? " is-visible" : "");
    if (msg && !(opts && opts.sticky)) {
      statusTimer = setTimeout(function () {
        statusTimer = null;
        setStatus("");
      }, STATUS_AUTO_MS);
    }
  }

  function toastHostEl() {
    var host = byId("vc-rank-save-toast-host");
    if (host) return host;
    var page = document.getElementById("vc-rank-customize-page");
    if (!page) return null;
    host = document.createElement("div");
    host.id = "vc-rank-save-toast-host";
    host.className = "vc-rank-save-toast-host";
    host.setAttribute("aria-live", "polite");
    page.insertBefore(host, page.firstChild);
    return host;
  }

  function hideSaveToast() {
    var host = byId("vc-rank-save-toast-host");
    if (!host) return;
    var toast = host.querySelector(".vc-rank-save-toast");
    if (!toast) {
      host.innerHTML = "";
      return;
    }
    toast.classList.remove("is-visible");
    toast.classList.add("is-leaving");
    window.setTimeout(function () {
      host.innerHTML = "";
    }, 300);
  }

  function showSaveSuccessToast() {
        if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
      window.VcSiteToast.show(
        "Salvato! Le impostazioni sono attive. Usa +rank su Discord per vederle.",
        false,
        { ms: 3200 },
      );
      return;
    }
    var host = toastHostEl();
    if (!host) return;
    if (saveToastTimer) {
      window.clearTimeout(saveToastTimer);
      saveToastTimer = null;
    }
    host.innerHTML =
      '<div class="vc-rank-save-toast" role="status">' +
      '<span class="vc-rank-save-toast__icon" aria-hidden="true"><i class="fa fa-check"></i></span>' +
      '<div class="vc-rank-save-toast__body">' +
      '<strong class="vc-rank-save-toast__title">Salvato con successo!</strong>' +
      '<p class="vc-rank-save-toast__text">Le tue impostazioni sono state salvate. Usa <kbd class="vc-rank-save-toast__kbd">+rank</kbd> su Discord per vederle in azione.</p>' +
      "</div></div>";
    window.requestAnimationFrame(function () {
      var t = host.querySelector(".vc-rank-save-toast");
      if (t) t.classList.add("is-visible");
    });
    saveToastTimer = window.setTimeout(function () {
      saveToastTimer = null;
      hideSaveToast();
    }, 4200);
  }

  /* rankColorLive1: anteprima subito, niente bottone Applica / re-render pannello */
  function applyFieldLive(field, rawValue, opts) {
    opts = opts || {};
    if (!draft || !field) return false;
    var value = String(rawValue == null ? "" : rawValue).trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(value)) return false;
    var next = normalizeHexDisplay(value, draft[field]);
    var prev = normalizeHexDisplay(draft[field], next);
    draft[field] = next;
    if (field === "primaryTextColor") {
      draft.progressStartColor = next;
      draft.progressEndColor = next;
      draft.ringColor = next;
    }
    if (field === "labelColor") {
      draft.secondaryTextColor = next;
    }
    if (prev.toLowerCase() === next.toLowerCase() && !opts.force) return true;
    previewLastSignature = "";
    schedulePreviewRefresh(opts.delay != null ? opts.delay : 120);
    return true;
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("read_failed")); };
      reader.readAsDataURL(file);
    });
  }

  function loadImageElement(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("image_load_failed")); };
      img.src = src;
    });
  }

  async function optimizeWallpaperFile(file) {
    var mime = String((file && file.type) || "").toLowerCase();
    if (mime === "image/gif") {
      var gifUrl = await readFileAsDataUrl(file);
      if (gifUrl.length > MAX_CUSTOM_WALLPAPER_DATAURL_LENGTH) {
        throw new Error("file_too_large");
      }
      return gifUrl;
    }
    var dataUrl = await readFileAsDataUrl(file);
    var img = await loadImageElement(dataUrl);
    var maxWidth = 1600;
    var scale = img.width > maxWidth ? maxWidth / img.width : 1;
    var width = Math.max(1, Math.round(img.width * scale));
    var height = Math.max(1, Math.round(img.height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
        var out = canvas.toDataURL("image/jpeg", 0.86);
    if (out.length > MAX_CUSTOM_WALLPAPER_DATAURL_LENGTH) {
      out = canvas.toDataURL("image/jpeg", 0.78);
    }
    if (out.length > MAX_CUSTOM_WALLPAPER_DATAURL_LENGTH) {
      out = canvas.toDataURL("image/jpeg", 0.7);
    }
    if (out.length > MAX_CUSTOM_WALLPAPER_DATAURL_LENGTH) {
      throw new Error("file_too_large");
    }
    return out;
  }

  function bindPanelUi() {
    Array.prototype.slice.call(document.querySelectorAll("#vc-rank-customize-app [data-rank-accordion-trigger]")).forEach(function (summary) {
      summary.addEventListener("click", function (ev) {
        ev.preventDefault();
        var key = String(summary.getAttribute("data-rank-accordion-trigger") || "");
        activeAccordion = activeAccordion === key ? "" : key;
        renderPanel({ forcePreviewRefresh: false });
      });
    });

    var range = byId("vc-rank-opacity-range");
    if (range) {
      range.addEventListener("pointerdown", beginOpacityDrag);
      range.addEventListener("touchstart", beginOpacityDrag, { passive: true });
      range.addEventListener("input", function () {
        if (!opacityDragging) beginOpacityDrag();
        draft.overlayOpacity = fromPct(range.value);
        var label = byId("vc-rank-opacity-label");
        if (label) label.textContent = String(toPct(draft.overlayOpacity)) + "%";
        var badge = document.querySelector(".vc-rank-editor-card__badge");
        if (badge) badge.textContent = String(toPct(draft.overlayOpacity)) + "%";
        /* solo overlay locale — niente PNG server a ogni tick (lag) */
        setLocalOpacityDragPreview(true);
      });
      range.addEventListener("change", finishOpacityDrag);
      range.addEventListener("pointerup", finishOpacityDrag);
      range.addEventListener("pointercancel", finishOpacityDrag);
      range.addEventListener("touchend", finishOpacityDrag, { passive: true });
    }

    Array.prototype.slice.call(document.querySelectorAll("#vc-rank-customize-app [data-rank-field]")).forEach(function (input) {
      input.addEventListener("input", function () {
        var key = String(input.getAttribute("data-rank-field") || "");
        var target = document.querySelector('#vc-rank-customize-app [data-rank-hex="' + key + '"]');
        var shown = normalizeHexDisplay(input.value, (target && target.value) || input.value);
        if (target) target.value = shown;
        applyFieldLive(key, shown, { delay: 100 });
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("#vc-rank-customize-app [data-rank-hex]")).forEach(function (input) {
      input.addEventListener("input", function () {
        var key = String(input.getAttribute("data-rank-hex") || "");
        applyFieldLive(key, input.value, { delay: 160 });
      });
      input.addEventListener("change", function () {
        var key = String(input.getAttribute("data-rank-hex") || "");
        var shown = normalizeHexDisplay(input.value, draft[key]);
        if (/^#?[0-9a-fA-F]{6}$/.test(String(input.value || "").trim())) {
          input.value = shown;
          applyFieldLive(key, shown, { delay: 40, force: true });
        }
      });
    });

    /* vcColorPick1 + rankColorLive1: picker → draft + preview subito */
    Array.prototype.slice.call(document.querySelectorAll("#vc-rank-customize-app [data-rank-cp]")).forEach(function (wrap) {
      var key = String(wrap.getAttribute("data-rank-cp") || "");
      if (!key || !window.VcColorPicker || typeof window.VcColorPicker.bind !== "function") return;
      var hexInput = document.querySelector('#vc-rank-customize-app [data-rank-hex="' + key + '"]');
      window.VcColorPicker.bind(wrap, {
        hexInput: hexInput || null,
        onChange: function (v) {
          var shown = normalizeHexDisplay(v, (hexInput && hexInput.value) || "#202225");
          if (hexInput) hexInput.value = shown;
          applyFieldLive(key, shown, { delay: 100 });
        },
      });
    });

    var fontSelect = byId("vc-rank-font-select");
    if (fontSelect) {
      fontSelect.addEventListener("change", function () {
        if (!draft) return;
        draft.fontKey = sanitizeFontKey(fontSelect.value);
        fontSelect.value = draft.fontKey;
        previewLastSignature = "";
        schedulePreviewRefresh(80);
      });
    }

    Array.prototype.slice.call(document.querySelectorAll("#vc-rank-customize-app [data-rank-wallpaper]")).forEach(function (button) {
      button.addEventListener("click", function () {
        var key = String(button.getAttribute("data-rank-wallpaper") || "default");
        var hadCustom = Boolean(draft && draft.wallpaperUrl);
        draft.wallpaperKey = key;
        draft.wallpaperUrl = "";
        previewLastSignature = "";
        activeAccordion = "";
        renderPanel({ forcePreviewRefresh: true });
        if (hadCustom) setStatus("Preset applicato: il wallpaper custom è stato sostituito (Salva per confermare).", false);
      });
    });

    var wallpaperFile = byId("vc-rank-wallpaper-file");
    if (wallpaperFile) {
      wallpaperFile.addEventListener("change", async function () {
        var file = wallpaperFile.files && wallpaperFile.files[0];
        if (!file) return;
        setStatus("Ottimizzo il wallpaper...", false);
        try {
          draft.wallpaperKey = "default";
          draft.wallpaperUrl = await optimizeWallpaperFile(file);
          previewLastSignature = "";
          activeAccordion = "custom-wallpaper";
          renderPanel({ forcePreviewRefresh: true });
          setStatus("Wallpaper custom pronto. Premi Salva per applicarlo.", false);
        } catch (err) {
          setStatus(
            err && err.message === "file_too_large"
              ? "L'immagine resta troppo pesante anche dopo l'ottimizzazione."
              : "Non sono riuscito a leggere l'allegato selezionato.",
            true,
          );
        } finally {
          wallpaperFile.value = "";
        }
      });
    }

    var clearWallpaperBtn = byId("vc-rank-clear-wallpaper");
    if (clearWallpaperBtn) {
      clearWallpaperBtn.addEventListener("click", function () {
        draft.wallpaperUrl = "";
        previewLastSignature = "";
        renderPanel({ forcePreviewRefresh: true });
      });
    }
  }

  function bindUi() {
    var app = byId("vc-rank-customize-app");
    bindPanelUi();
    if (!app || app._vcRankChromeBound) return;
    app._vcRankChromeBound = true;

    app.addEventListener("click", function (ev) {
      var tabBtn = ev.target && ev.target.closest ? ev.target.closest("[data-rank-tab]") : null;
      if (tabBtn && app.contains(tabBtn)) {
        ev.preventDefault();
        switchRankEditorTab(tabBtn.getAttribute("data-rank-tab"));
        return;
      }
      if (ev.target && ev.target.closest && ev.target.closest("#vc-rank-save")) {
        ev.preventDefault();
        saveTheme();
        return;
      }
      if (ev.target && ev.target.closest && ev.target.closest("#vc-rank-reset")) {
        ev.preventDefault();
        resetTheme();
      }
    });

    var backBtn = document.querySelector(".vc-rank-editor-topbar .vc-user-profile-backbtn");
    if (backBtn && backBtn.dataset.vcBackBound !== "1") {
      backBtn.dataset.vcBackBound = "1";
      backBtn.addEventListener("click", function (ev) {
        var id = String((loaded && loaded.userId) || parseTargetUserId() || "").trim();
        if (!/^\d{17,20}$/.test(id)) return;
        ev.preventDefault();
        redirectToProfile(id);
      });
    }
  }

  function saveRankPayloadCache(body) {
    if (!body || body.ok !== true) return;
    try {
      localStorage.setItem(
        THEME_CACHE_KEY,
        JSON.stringify({
          at: Date.now(),
          userId: String(body.userId || ""),
          username: body.username || "",
          displayName: body.displayName || "",
          avatarUrl: body.avatarUrl || "",
          theme: body.theme || {},
          defaults: body.defaults || null,
          wallpapers: body.wallpapers || null,
          fonts: body.fonts || null,
          permissions: body.permissions || null,
          stats: body.stats || null,
        })
      );
    } catch (e) {}
  }

  function loadRankPayloadCache(preferredUserId) {
    try {
      var raw = localStorage.getItem(THEME_CACHE_KEY) || "";
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      var at = Number(parsed.at || 0);
      if (!Number.isFinite(at) || Date.now() - at > THEME_CACHE_TTL_MS) return null;
      var uid = String(parsed.userId || "");
      var want = String(preferredUserId || "").trim();
      if (want && uid && want !== uid) return null;
      return {
        ok: true,
        userId: uid,
        username: parsed.username || "",
        displayName: parsed.displayName || "",
        avatarUrl: parsed.avatarUrl || "",
        theme: parsed.theme || {},
        defaults: parsed.defaults || undefined,
        wallpapers: Array.isArray(parsed.wallpapers) ? parsed.wallpapers : undefined,
        fonts: Array.isArray(parsed.fonts) ? parsed.fonts : undefined,
        permissions: parsed.permissions || undefined,
        stats: parsed.stats || undefined,
        _fromCache: true,
      };
    } catch (e) {
      return null;
    }
  }

  function mergeRankPayloadWithLocalTheme(body) {
    if (!body || body.ok !== true || !body.theme || typeof body.theme !== "object") return body;
    if (body.theme.wallpaperUrl || !body.theme.wallpaperUrlOmitted) return body;
    try {
      var cached = loadRankPayloadCache(String(body.userId || ""));
      var cachedUrl =
        cached && cached.theme && cached.theme.wallpaperUrl ? String(cached.theme.wallpaperUrl).trim() : "";
      if (cachedUrl) body.theme.wallpaperUrl = cachedUrl;
    } catch (eMerge) {}
    return body;
  }

  function finishRankPayloadFromHttp(status, httpOk, parsed) {
    if (!parsed) {
      return {
        ok: false,
        message: "Risposta vuota dall'API.",
        retryable: true,
      };
    }
    if (status === 429) {
      if (parsed.ok === true) return mergeRankPayloadWithLocalTheme(parsed);
      return {
        ok: false,
        message: "Troppe richieste. Riprova tra poco.",
        retryable: false,
      };
    }
    if (!httpOk) {
      var msg =
        (parsed && (parsed.message || parsed.error)) ||
        "Errore HTTP " + status + " durante il caricamento.";
      return {
        ok: false,
        message: String(msg),
        retryable: status === 401 || status === 408 || status >= 500,
      };
    }
    return mergeRankPayloadWithLocalTheme(parsed || { ok: false, message: "Risposta vuota dall'API." });
  }

  function fetchRankDataOnce() {
    var url = resolvedRankApiUrl();
    if (!url) {
      return Promise.resolve({
        ok: false,
        message: "Configurazione API rank card mancante. Contatta gli amministratori.",
      });
    }
    var token = getToken();
    if (!token) {
      return Promise.resolve({
        ok: false,
        message: "Devi effettuare il login con Discord per personalizzare la rank card.",
      });
    }
    if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
      var cacheKey = window.VcApiCache.keyFor(url, { scope: "rankPers", auth: token, v: "429fix4" });
      return window.VcApiCache.fetchWithCache(cacheKey, url, {
        ttlMs: 90000,
        staleMs: 600000,
        persistMs: 30 * 60 * 1000,
        timeoutMs: 22000,
        fetchInit: {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
          credentials: "omit",
          cache: "no-store",
          redirect: "follow",
        },
      })
        .then(function (payload) {
          if (payload && payload.blocked) {
            try {
              var uid = parseTargetUserId() || (currentUser && currentUser.id) || "";
              var cached = loadRankPayloadCache(uid);
              if (cached && cached.theme) return mergeRankPayloadWithLocalTheme(cached);
            } catch (eBlk) {}
            return {
              ok: false,
              message: "Troppe richieste. Riprova tra poco.",
              retryable: false,
            };
          }
          return finishRankPayloadFromHttp(
            Number((payload && payload.status) || 0),
            Boolean(payload && payload.ok),
            payload && payload.body,
          );
        })
        .catch(function (err) {
          if (err && err.message === "timeout") {
            return {
              ok: false,
              message: "Timeout API rank card: il server sta impiegando troppo tempo a rispondere.",
              retryable: true,
            };
          }
          return {
            ok: false,
            message: "Errore di rete o connessione rifiutata durante il caricamento.",
            retryable: true,
          };
        });
    }
    return fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
      },
      20000
    )
      .then(function (r) {
        return r.text().then(function (text) {
          var parsed = parseJsonResponseText(text);
          if (!parsed) {
            if (!String(text || "").trim()) {
              return {
                ok: false,
                message: "Risposta vuota dall'API.",
                retryable: true,
              };
            }
            var ctype = "";
            try {
              ctype = String(r.headers && r.headers.get ? r.headers.get("content-type") || "" : "").toLowerCase();
            } catch (eCt) {}
            if (looksLikeHtmlResponse(text) || ctype.indexOf("text/html") >= 0) {
              return {
                ok: false,
                message: "Risposta API non valida: configurazione endpoint errata.",
                retryable: true,
              };
            }
            return {
              ok: false,
              message:
                "Risposta API non valida (HTTP " +
                r.status +
                (ctype ? ", " + ctype.split(";")[0] : "") +
                ").",
              retryable: true,
            };
          }
          if (!r.ok) {
            return finishRankPayloadFromHttp(r.status, false, parsed);
          }
          return finishRankPayloadFromHttp(r.status, true, parsed);
        });
      })
      .catch(function (err) {
        if (err && err.message === "timeout") {
          return {
            ok: false,
            message: "Timeout API rank card: il server sta impiegando troppo tempo a rispondere.",
            retryable: true,
          };
        }
        return {
          ok: false,
          message: "Errore di rete o connessione rifiutata durante il caricamento.",
          retryable: true,
        };
      });
  }

  function fetchRankData(attempt) {
    attempt = Number(attempt) || 0;
    return fetchRankDataOnce().then(function (body) {
      if (body && body.ok === true) return body;
      if (attempt < 2 && isRetryableRankLoadError(body)) {
        return new Promise(function (resolve) {
          setTimeout(resolve, 450 + attempt * 550);
        }).then(function () {
          return fetchRankData(attempt + 1);
        });
      }
      if (body && body.retryable) delete body.retryable;
      return body;
    });
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var ms = Number(timeoutMs);
    if (!Number.isFinite(ms) || ms <= 0) ms = 15000;
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = window.setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error("timeout"));
      }, ms);
      fetch(url, options)
        .then(function (res) {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          resolve(res);
        })
        .catch(function (err) {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          reject(err);
        });
    });
  }

  function saveTheme() {
    var token = getToken();
    if (!token) {
      setStatus("Sessione Discord scaduta. Effettua di nuovo il login.", true);
      return;
    }
    if (saveInFlight) return;
    saveInFlight = true;
    var saveBtn = byId("vc-rank-save");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.setAttribute("aria-busy", "true");
      saveBtn.classList.add("is-saving");
    }
    setStatus("Salvataggio in corso...", false);
    fetchWithTimeout(
      resolvedRankApiUrl(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ mode: "save", theme: draft }),
      },
      30000
    )
      .then(function (r) {
        return r
          .text()
          .then(function (txt) {
            var body = null;
            try {
              body = txt ? JSON.parse(txt) : null;
            } catch (eJson) {
              body = null;
            }
            if (!r.ok) {
              var err = new Error("http_error");
              err.status = Number(r.status || 0);
              err.body = body;
              throw err;
            }
            return body;
          });
      })
      .then(function (body) {
        if (!body || body.ok !== true) {
          setStatus((body && body.message) || "Non sono riuscito a salvare la rank card.", true);
          return;
        }
        draft = normalizeTheme(Object.assign({}, draft, body.theme || {}));
        if (loaded) {
          loaded = Object.assign({}, loaded, { theme: draft, ok: true });
          saveRankPayloadCache(loaded);
        }
        setStatus("", false);
        showSaveSuccessToast();
        previewLastSignature = "";
        render({ forcePreviewRefresh: true });
      })
      .catch(function (err) {
        var status = Number(err && err.status);
        if (status === 413) {
          setStatus("File troppo grande per il salvataggio. Usa una GIF più leggera.", true);
          return;
        }
        if (status > 0) {
          setStatus(
            (err && err.body && err.body.message) || ("Errore server durante il salvataggio (HTTP " + status + ")."),
            true
          );
          return;
        }
        if (err && err.message === "timeout") {
          setStatus("Salvataggio scaduto: server troppo lento. Riprova tra poco.", true);
          return;
        }
        setStatus("Errore di rete durante il salvataggio.", true);
      })
      .finally(function () {
        saveInFlight = false;
        var btn = byId("vc-rank-save");
        if (btn) {
          btn.disabled = false;
          btn.removeAttribute("aria-busy");
          btn.classList.remove("is-saving");
        }
      });
  }

  function isDraftDirtyAgainstLoadedTheme() {
    if (!loaded || !draft) return false;
    try {
      var left = JSON.stringify(normalizeTheme(loaded.theme || {}));
      var right = JSON.stringify(normalizeTheme(draft || {}));
      return left !== right;
    } catch (e) {
      return false;
    }
  }

  function stopLiveCustomizePolling() {
    if (liveCustomizePollTimer) {
      clearInterval(liveCustomizePollTimer);
      liveCustomizePollTimer = null;
    }
  }

  function startLiveCustomizePolling() {
    stopLiveCustomizePolling();
    liveCustomizePollTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      if (saveInFlight || previewRenderInFlight || isDraftDirtyAgainstLoadedTheme()) return;
      fetchRankData()
        .then(function (body) {
          if (!body || body.ok !== true) return;
          if (!loaded) return;
          var nextTheme = normalizeTheme(body.theme || {});
          if (!nextTheme.wallpaperKey) nextTheme.wallpaperKey = "default";
          var prevSig = previewSignatureForTheme(normalizeTheme(loaded.theme || {}));
          var nextSig = previewSignatureForTheme(nextTheme);
          loaded = body;
          if (prevSig === nextSig) return;
          draft = nextTheme;
          render();
        })
        .catch(function () {});
    }, LIVE_CUSTOMIZE_POLL_MS);
  }

  function resetTheme() {
    var token = getToken();
    if (!token) {
      setStatus("Sessione Discord scaduta. Effettua di nuovo il login.", true);
      return;
    }
    var run = function () {
      setStatus("Reset in corso...", false);
      fetch(resolvedRankApiUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ mode: "reset" }),
      })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          if (!body || body.ok !== true) {
            setStatus((body && body.message) || "Non sono riuscito a resettare la rank card.", true);
            return;
          }
          draft = normalizeTheme(body.theme || {});
          setStatus(body.message || "Rank card resettata.", false);
          render();
        })
        .catch(function () {
          setStatus("Errore di rete durante il reset.", true);
        });
    };
    var confirmP = (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.confirm !== "function") return false;
      return D.confirm({
          title: "Ripristinare i colori?",
          message: "Vuoi davvero ripristinare i colori predefiniti?",
          confirmLabel: "Ripristina",
          cancelLabel: "Annulla",
          danger: true,
          icon: "fa-undo",
        });
    });
    confirmP.then(function (ok) {
      if (ok) run();
    });
  }

  function isPersHubRankTab() {
    var hub = typeof window !== "undefined" ? window.__VC_PERS_HUB : null;
    if (!hub || !hub.enabled) return true;
    return Boolean(hub.isRank);
  }

  function isRetryableRankLoadError(body) {
    if (!body || body.ok === true) return false;
    if (body.retryable === true) return true;
    var msg = String((body && body.message) || "").toLowerCase();
    return (
      msg.indexOf("timeout") >= 0 ||
      msg.indexOf("rete") >= 0 ||
      msg.indexOf("connessione") >= 0 ||
      msg.indexOf("impiegando troppo") >= 0 ||
      msg.indexOf("risposta api non valida") >= 0 ||
      msg.indexOf("risposta vuota") >= 0 ||
      msg.indexOf("endpoint errata") >= 0 ||
      msg.indexOf("sessione discord") >= 0
    );
  }

  function main(attempt) {
    attempt = Number(attempt) || 0;
    if (!isPersHubRankTab()) {
      try {
        var skips = document.querySelectorAll('[id="vc-rank-customize-loading"]');
        for (var si = 0; si < skips.length; si++) {
          skips[si].hidden = true;
          skips[si].setAttribute("hidden", "");
          skips[si].style.setProperty("display", "none", "important");
        }
      } catch (eSkip) {
        var loadingSkip = byId("vc-rank-customize-loading");
        if (loadingSkip) loadingSkip.hidden = true;
      }
      return;
    }
    try {
      restoreRankTabFromUrl();
    } catch (eTab) {}
    var targetUserId = parseTargetUserId();
    currentUser = (typeof window !== "undefined" && window.__VC_DISCORD_PROFILE) || null;
    if (enforceTargetOwnership(targetUserId, currentUser)) return;

        if (!loaded && attempt === 0) {
      try {
        if (!getToken()) {
          showRankFatalError("Devi effettuare il login con Discord per personalizzare la rank card.");
          return;
        }
        var cached = loadRankPayloadCache(
          targetUserId || (currentUser && currentUser.id) || ""
        );
        if (cached && cached.theme) {
          loaded = cached;
          draft = normalizeTheme(cached.theme || {});
          if (!draft.wallpaperKey) draft.wallpaperKey = "default";
          render();
        } else if (getToken()) {
          loaded = {
            ok: true,
            userId: String(targetUserId || (currentUser && currentUser.id) || ""),
            username: (currentUser && (currentUser.username || currentUser.global_name)) || "",
            displayName:
              (currentUser && (currentUser.global_name || currentUser.username)) || "Tu",
            avatarUrl: "",
            theme: {},
            wallpapers: [],
            permissions: { canUseCustomWallpaper: false, wallpaperCustomRoles: [], activeWallpaperRoles: [] },
            stats: {},
            _skeleton: true,
          };
          draft = normalizeTheme({});
          if (!draft.wallpaperKey) draft.wallpaperKey = "default";
          render();
        }
      } catch (eCache) {}
    }

    fetchRankData()
      .then(function (body) {
        if ((!body || body.ok !== true) && isRetryableRankLoadError(body) && attempt < 1) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 500);
          }).then(function () {
            main(attempt + 1);
          });
        }
        if (!body || body.ok !== true) {
          if (loaded && draft) {
                        hideRankCustomizeLoading();
            setStatus((body && body.message) || "Aggiornamento non riuscito: mostro l'ultima versione salvata.", true);
            return;
          }
          showRankFatalError(
            (body && body.message) || "Impossibile caricare la personalizzazione rank card."
          );
          return;
        }
        if (targetUserId && String(targetUserId) !== String(body.userId || "")) {
          redirectToProfile(targetUserId);
          return;
        }
        try {
          saveRankPayloadCache(body);
          loaded = body;
          draft = normalizeTheme(body.theme || {});
          if (!draft.wallpaperKey) draft.wallpaperKey = "default";
          render();
        } catch (eRender) {
          showRankFatalError("Errore durante il rendering dell'editor.");
        }
      })
      .catch(function () {
        if (attempt < 1) {
          setTimeout(function () {
            main(attempt + 1);
          }, 500);
          return;
        }
        if (loaded && draft) return;
        showRankFatalError("Errore imprevisto durante il caricamento.");
      });
  }

  function scheduleMain() {
    try {
      var hub = window.__VC_PERS_HUB_API;
      if (hub && typeof hub.whenSessionReady === "function") {
        hub.whenSessionReady(
          function () {
            main(0);
          },
          { maxMs: 2500 }
        );
        return;
      }
    } catch (eSch) {}
    main(0);
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    currentUser = ev && ev.detail ? ev.detail.user || null : null;
    if (!isPersHubRankTab()) return;
    enforceTargetOwnership(parseTargetUserId(), currentUser);
  });

  function forceLoginGateAfterLogout() {
    try {
      localStorage.removeItem(THEME_CACHE_KEY);
      localStorage.removeItem(PREVIEW_CACHE_KEY);
      sessionStorage.removeItem(PREVIEW_CACHE_KEY);
      localStorage.removeItem("vc_rank_customize_preview_cache_v5");
      sessionStorage.removeItem("vc_rank_customize_preview_cache_v5");
    } catch (eClr) {}
    loaded = null;
    draft = null;
    currentUser = null;
    try {
      stopLiveCustomizePolling();
    } catch (eStop) {}
    showRankFatalError("Devi effettuare il login con Discord per personalizzare la rank card.");
  }
  try {
    window.__vcRankForceLoginGate = forceLoginGateAfterLogout;
  } catch (eExp) {}
  window.addEventListener("vc:auth-logout", function () {
    forceLoginGateAfterLogout();
  });
  window.addEventListener("pageshow", function () {
    try {
      if (!getToken()) forceLoginGateAfterLogout();
    } catch (ePs) {}
  });
  function pingHubScroll() {
    try {
      var hub = window.__VC_PERS_HUB_API;
      if (hub && typeof hub.afterPanelScrollToTabs === "function") hub.afterPanelScrollToTabs();
      else if (hub && typeof hub.scheduleScrollToTabs === "function") hub.scheduleScrollToTabs();
    } catch (ePing) {}
  }

  /* persTabScroll2: hub soft-nav → boot/render rank senza reload */
  document.addEventListener("vc:pers-hub-navigate", function () {
    try {
      if (!isPersHubRankTab()) {
        try {
          stopLiveCustomizePolling();
        } catch (eStop) {}
        return;
      }
      if (!loaded) {
        scheduleMain();
        pingHubScroll();
        return;
      }
      try {
        restoreRankTabFromUrl();
      } catch (eTab) {}
      try {
        /* rankFontRaceFix1: al rientro tab forza refresh preview (no early-return stale) */
        previewLastSignature = "";
        render({ forcePreviewRefresh: true });
      } catch (eRen) {
        try {
          main(0);
        } catch (eMain) {}
      }
      try {
        startLiveCustomizePolling();
      } catch (ePoll) {}
      pingHubScroll();
    } catch (eNav) {}
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleMain);
  } else {
    scheduleMain();
  }

  if (isPersHubRankTab()) {
  startLiveCustomizePolling();
  window.addEventListener("beforeunload", stopLiveCustomizePolling);
  }
})();