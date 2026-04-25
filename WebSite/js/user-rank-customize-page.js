(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var currentUser = null;
  var loaded = null;
  var draft = null;
  var activeTab = "colors";
  var activeAccordion = "opacity";
  var saveToastTimer = null;
  var saveInFlight = false;

  var COLOR_FIELDS = [
    { key: "panelColor", title: "Sfondo", subtitle: "Colore dei box semi-trasparenti", icon: "fa-tint" },
    { key: "primaryTextColor", title: "Testo Principale", subtitle: "Username, progress bar e stats", icon: "fa-text-width" },
    { key: "multiplierColor", title: "Moltiplicatore", subtitle: "Testo moltiplicatore XP", icon: "fa-bolt" },
    { key: "valueColor", title: "Valori", subtitle: "Server rank e weekly rank", icon: "fa-bar-chart" },
    { key: "labelColor", title: "Etichette", subtitle: 'Label come "LEVEL", "EXP", ecc...', icon: "fa-tag" },
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
    var t = localStorage.getItem(ACCESS_TOKEN_KEY);
    var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
    if (!t || !exp || Date.now() >= exp) return "";
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

  function resolvedRankApiUrl() {
    var c = cfg();
    var local = String(c.rankApiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local) return local;
    return String(c.rankApiUrl || "").trim();
  }

  function hideRankCustomizeLoading() {
    var loading = byId("vc-rank-customize-loading");
    if (loading) loading.hidden = true;
  }

  function showRankFatalError(message) {
    hideRankCustomizeLoading();
    var app = byId("vc-rank-customize-app");
    if (!app) return;
    var home = "/";
    try {
      if (window.__VC_AUTH && window.__VC_AUTH.homeUrl) home = String(window.__VC_AUTH.homeUrl).replace(/\/+$/, "") || "/";
    } catch (eHome) {}
    app.hidden = false;
    app.innerHTML =
      '<div class="vc-rank-customize-fatal">' +
      '<div class="vc-rank-editor-topbar"><a class="vc-user-profile-backbtn" href="' +
      esc(home) +
      '"><i class="fa fa-chevron-left" aria-hidden="true"></i> Home</a></div>' +
      '<section class="vc-rank-editor-hero">' +
      '<div class="vc-rank-editor-hero__icon"><i class="fa fa-exclamation-triangle" aria-hidden="true"></i></div>' +
      "<div><h1>Impossibile caricare</h1><p>" +
      esc(String(message || "Errore sconosciuto.")) +
      "</p></div></section></div>";
  }

  function profileUrl(userId) {
    return "/users/" + encodeURIComponent(String(userId || "").trim());
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
    return Math.max(0, Math.min(100, Math.round((n * 100) / 5) * 5));
  }

  function fromPct(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = 80;
    return Math.max(0, Math.min(1, n / 100));
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
    return next;
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

  /** Stessa logica colore rank box di `rankCanvas.js` (legacy #FFCB05 → value). */
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
    var stats = data.stats || {};
    var username = String(data.username || "utente").trim() || "utente";
    var avatar = String(data.avatarUrl || "").trim();
    var progressPct = String(Math.max(0, Math.min(100, Math.round(Number(stats.progressPercent || 0))))) + "%";
    var weeklyRankText = stats.weeklyRank ? "#" + formatIntIt(stats.weeklyRank) : "#1";
    var rankText = stats.allTimeRank ? "#" + formatIntIt(stats.allTimeRank) : "#1";
    var currentLevelExp = Number(stats.currentLevelExp || 0);
    var nextLevelExp = Number(stats.nextLevelExp || 100);
    var currentXp = Math.max(0, Number(stats.totalExp || 0) - currentLevelExp);
    var targetXp = Math.max(1, nextLevelExp - currentLevelExp);
    return (
      '<div class="vc-rank-editor-preview__card" style="' +
      rankStyle(theme) +
      '">' +
      '<div class="vc-rank-editor-preview__hero">' +
      '<div class="vc-rank-editor-preview__avatarwrap">' +
      (avatar
        ? '<img class="vc-rank-editor-preview__avatar" src="' + esc(avatar) + '" alt="" loading="eager" decoding="async" />'
        : '<span class="vc-rank-editor-preview__avatar vc-rank-editor-preview__avatar--fallback"><i class="fa fa-user"></i></span>') +
      "</div>" +
      '<div class="vc-rank-editor-preview__copy">' +
      '<div class="vc-rank-editor-preview__topline">' +
      '<span class="vc-rank-editor-preview__name">' + esc(username) + "</span>" +
      '<span class="vc-rank-editor-preview__dot">-</span>' +
      '<span class="vc-rank-editor-preview__level">Lv. ' + esc(String(stats.level || 0)) + "</span>" +
      '<span class="vc-rank-editor-preview__mult">' + esc(formatMult(stats.multiplier || 1)) + "</span>" +
      "</div>" +
      '<div class="vc-rank-editor-preview__bar"><span class="vc-rank-editor-preview__fill" style="width:' +
      esc(progressPct) +
      '"></span><span class="vc-rank-editor-preview__bartext">' +
      esc(formatIntIt(currentXp)) +
      " / " +
      esc(formatIntIt(targetXp)) +
      " XP</span></div>" +
      "</div>" +
      '<div class="vc-rank-editor-preview__rankbox"><strong>' + esc(rankText) + "</strong><small>RANK</small></div>" +
      "</div>" +
      '<div class="vc-rank-editor-preview__stats">' +
      '<div class="vc-rank-editor-preview__stat vc-rank-editor-preview__stat--trophy">' + previewStatIcon("trophy") + '<span>WEEKLY RANK</span><strong>' + esc(weeklyRankText) + "</strong></div>" +
      '<div class="vc-rank-editor-preview__stat vc-rank-editor-preview__stat--bolt">' + previewStatIcon("bolt") + '<span>WEEKLY XP</span><strong>' + esc(formatIntIt(stats.weeklyExp || 0)) + "</strong></div>" +
      '<div class="vc-rank-editor-preview__stat vc-rank-editor-preview__stat--star">' + previewStatIcon("star") + '<span>MULTIPLIER</span><strong>' + esc(formatMult(stats.multiplier || 1)) + "</strong></div>" +
      "</div></div>"
    );
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
        '<input type="file" id="vc-rank-wallpaper-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden />' +
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

  function render() {
    var app = byId("vc-rank-customize-app");
    if (!app || !loaded || !draft) return;
    var backHref = profileUrl(loaded.userId);
    var colorCards = COLOR_FIELDS.map(function (field) {
      var value = normalizeHexDisplay(draft[field.key], field.key === "primaryTextColor" ? "#FFCB05" : "#202225");
      var pickerValue = value.toLowerCase();
      var isOpen = activeAccordion === field.key;
      return (
        '<details class="vc-rank-editor-card" data-rank-accordion="' + esc(field.key) + '"' + (isOpen ? " open" : "") + ">" +
        '<summary class="vc-rank-editor-card__summary" data-rank-accordion-trigger="' + esc(field.key) + '">' +
        '<span class="vc-rank-editor-card__icon"><i class="fa ' + esc(field.icon) + '" aria-hidden="true"></i></span>' +
        '<span class="vc-rank-editor-card__copy"><strong>' + esc(field.title) + "</strong><span>" + esc(field.subtitle) + "</span></span>" +
        '<span class="vc-rank-editor-card__swatch" style="background:' + esc(value) + '"></span>' +
        '<i class="fa fa-angle-down vc-rank-editor-card__chev" aria-hidden="true"></i>' +
        "</summary>" +
        '<div class="vc-rank-editor-card__body">' +
        '<div class="vc-rank-editor-colorrow">' +
        '<input class="vc-rank-editor-colorrow__picker" type="color" value="' + esc(pickerValue) + '" data-rank-field="' + esc(field.key) + '" />' +
        '<input class="vc-rank-editor-colorrow__hex" type="text" value="' + esc(value) + '" maxlength="7" data-rank-hex="' + esc(field.key) + '" />' +
        '<button type="button" class="vc-rank-editor-updatebtn" data-rank-apply="' + esc(field.key) + '"><i class="fa fa-eye" aria-hidden="true"></i> Aggiorna Anteprima</button>' +
        "</div>" +
        "</div>" +
        "</details>"
      );
    }).join("");

    app.innerHTML =
      '<div class="vc-rank-editor-topbar"><a class="vc-user-profile-backbtn" href="' + esc(backHref) + '"><i class="fa fa-chevron-left" aria-hidden="true"></i> Torna al Profilo</a></div>' +
      '<section class="vc-rank-editor-hero">' +
      '<div class="vc-rank-editor-hero__icon"><i class="fa fa-magic" aria-hidden="true"></i></div>' +
      '<div><h1>Personalizza Rank Card</h1><p>Crea la tua scheda livello unica per Discord</p></div>' +
      "</section>" +
      '<div class="vc-rank-editor-tabs">' +
      '<button type="button" class="vc-rank-editor-tab ' + (activeTab === "colors" ? "is-active" : "") + '" data-rank-tab="colors"><i class="fa fa-tint" aria-hidden="true"></i> Colori</button>' +
      '<button type="button" class="vc-rank-editor-tab ' + (activeTab === "wallpaper" ? "is-active" : "") + '" data-rank-tab="wallpaper"><i class="fa fa-picture-o" aria-hidden="true"></i> Wallpaper</button>' +
      "</div>" +
      '<div class="vc-rank-editor-layout">' +
      '<div class="vc-rank-editor-panel">' +
      (activeTab === "colors"
        ? '<details class="vc-rank-editor-card" data-rank-accordion="opacity"' + (activeAccordion === "opacity" ? " open" : "") + ">" +
          '<summary class="vc-rank-editor-card__summary" data-rank-accordion-trigger="opacity">' +
          '<span class="vc-rank-editor-card__icon"><i class="fa fa-sliders" aria-hidden="true"></i></span>' +
          '<span class="vc-rank-editor-card__copy"><strong>Opacità sfondo</strong><span>Trasparenza dei box contenitori</span></span>' +
          '<span class="vc-rank-editor-card__badge">' + esc(String(toPct(draft.overlayOpacity))) + "%</span>" +
          '<i class="fa fa-angle-down vc-rank-editor-card__chev" aria-hidden="true"></i>' +
          "</summary>" +
          '<div class="vc-rank-editor-card__body">' +
          '<div class="vc-rank-editor-sliderrow">' +
          '<input id="vc-rank-opacity-range" type="range" min="0" max="100" step="5" value="' + esc(String(toPct(draft.overlayOpacity))) + '" />' +
          '<span id="vc-rank-opacity-label">' + esc(String(toPct(draft.overlayOpacity))) + "%</span>" +
          "</div></div></details>" +
          colorCards
        : '<section class="vc-rank-editor-wallgrid">' + wallpaperGalleryMarkup() + "</section>" + wallpaperCustomMarkup()) +
      '<div class="vc-rank-editor-actions"><button type="button" class="vc-rank-editor-save" id="vc-rank-save"><i class="fa fa-floppy-o" aria-hidden="true"></i> Salva Modifiche</button><button type="button" class="vc-rank-editor-reset" id="vc-rank-reset"><i class="fa fa-undo" aria-hidden="true"></i> Reset</button></div>' +
      '<p class="vc-rank-editor-status" id="vc-rank-status"></p>' +
      "</div>" +
      '<aside class="vc-rank-editor-side">' +
      '<div class="vc-rank-editor-previewcard"><div class="vc-rank-editor-previewcard__head"><span class="vc-rank-editor-previewcard__icon"><i class="fa fa-eye" aria-hidden="true"></i></span><div><strong>Anteprima Live</strong></div></div>' +
      previewMarkup(loaded, draft) +
      '<div class="vc-rank-editor-previewnote"><strong>Aggiornamento</strong><span>L\'opacità si aggiorna in tempo reale. Per i colori, usa "Aggiorna Anteprima". Per salvare clicca su "Salva Modifiche".</span></div>' +
      '<div class="vc-rank-editor-previewbadge">Preview identica a <code>+rank</code> su Discord</div>' +
      "</div></aside></div>";

    app.hidden = false;
    bindUi();
  }

  function setStatus(text, isError) {
    var el = byId("vc-rank-status");
    if (!el) return;
    el.textContent = text || "";
    el.className = "vc-rank-editor-status" + (isError ? " is-error" : "") + (text ? " is-visible" : "");
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

  function applyField(field) {
    var hexInput = document.querySelector('[data-rank-hex="' + field + '"]');
    var picker = document.querySelector('[data-rank-field="' + field + '"]');
    var value = String((hexInput && hexInput.value) || (picker && picker.value) || "").trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(value)) {
      setStatus("Inserisci un colore hex valido.", true);
      return;
    }
    draft[field] = normalizeHexDisplay(value, draft[field]);
    render();
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
      if (gifUrl.length > 900000) {
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
    /* JPEG: node-canvas lato bot decodifica in modo affidabile; WebP in data URL spesso falliva → +rank senza sfondo. */
    var out = canvas.toDataURL("image/jpeg", 0.86);
    if (out.length > 850000) {
      out = canvas.toDataURL("image/jpeg", 0.78);
    }
    if (out.length > 850000) {
      out = canvas.toDataURL("image/jpeg", 0.7);
    }
    if (out.length > 850000) {
      throw new Error("file_too_large");
    }
    return out;
  }

  function bindUi() {
    Array.prototype.slice.call(document.querySelectorAll("[data-rank-accordion-trigger]")).forEach(function (summary) {
      summary.addEventListener("click", function (ev) {
        ev.preventDefault();
        var key = String(summary.getAttribute("data-rank-accordion-trigger") || "");
        activeAccordion = activeAccordion === key ? "" : key;
        render();
      });
    });

    var range = byId("vc-rank-opacity-range");
    if (range) {
      range.addEventListener("input", function () {
        draft.overlayOpacity = fromPct(range.value);
        var label = byId("vc-rank-opacity-label");
        if (label) label.textContent = String(range.value) + "%";
        var badge = document.querySelector(".vc-rank-editor-card__badge");
        if (badge) badge.textContent = String(range.value) + "%";
        var preview = document.querySelector(".vc-rank-editor-preview__card");
        if (preview) preview.style.setProperty("--vc-rank-opacity", String(draft.overlayOpacity));
      });
    }

    Array.prototype.slice.call(document.querySelectorAll("[data-rank-field]")).forEach(function (input) {
      input.addEventListener("input", function () {
        var target = document.querySelector('[data-rank-hex="' + input.getAttribute("data-rank-field") + '"]');
        if (target) target.value = normalizeHexDisplay(input.value, target.value);
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-rank-apply]")).forEach(function (button) {
      button.addEventListener("click", function () {
        applyField(button.getAttribute("data-rank-apply"));
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-rank-tab]")).forEach(function (button) {
      button.addEventListener("click", function () {
        activeTab = button.getAttribute("data-rank-tab");
        activeAccordion = activeTab === "wallpaper" ? "" : "opacity";
        render();
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-rank-wallpaper]")).forEach(function (button) {
      button.addEventListener("click", function () {
        draft.wallpaperKey = String(button.getAttribute("data-rank-wallpaper") || "default");
        draft.wallpaperUrl = "";
        render();
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
          render();
          setStatus("Wallpaper pronto. Salva le modifiche per applicarlo.", false);
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
        render();
      });
    }

    var saveBtn = byId("vc-rank-save");
    if (saveBtn) {
      saveBtn.addEventListener("click", saveTheme);
    }

    var resetBtn = byId("vc-rank-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", resetTheme);
    }
  }

  function fetchRankData() {
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
    return fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    })
      .then(function (r) {
        return r.text().then(function (text) {
          var parsed = null;
          if (text) {
            try {
              parsed = JSON.parse(text);
            } catch (eParse) {
              return {
                ok: false,
                message: "Risposta API non valida (HTTP " + r.status + ").",
              };
            }
          }
          if (!r.ok) {
            var msg =
              (parsed && (parsed.message || parsed.error)) ||
              "Errore HTTP " + r.status + " durante il caricamento.";
            return { ok: false, message: String(msg) };
          }
          return parsed || { ok: false, message: "Risposta vuota dall'API." };
        });
      })
      .catch(function () {
        return { ok: false, message: "Errore di rete o connessione rifiutata durante il caricamento." };
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
    fetch(resolvedRankApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ mode: "save", theme: draft }),
    })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (!body || body.ok !== true) {
          setStatus((body && body.message) || "Non sono riuscito a salvare la rank card.", true);
          return;
        }
        draft = normalizeTheme(Object.assign({}, draft, body.theme || {}));
        setStatus("", false);
        showSaveSuccessToast();
        render();
      })
      .catch(function () {
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

  function resetTheme() {
    var token = getToken();
    if (!token) {
      setStatus("Sessione Discord scaduta. Effettua di nuovo il login.", true);
      return;
    }
    if (!window.confirm("Vuoi davvero ripristinare i colori predefiniti?")) {
      return;
    }
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
  }

  function main() {
    var targetUserId = parseTargetUserId();
    currentUser = (typeof window !== "undefined" && window.__VC_DISCORD_PROFILE) || null;
    if (enforceTargetOwnership(targetUserId, currentUser)) return;
    fetchRankData()
      .then(function (body) {
        hideRankCustomizeLoading();
        if (!body || body.ok !== true) {
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
          loaded = body;
          draft = normalizeTheme(body.theme || {});
          if (!draft.wallpaperKey) draft.wallpaperKey = "default";
          render();
        } catch (eRender) {
          showRankFatalError("Errore durante il rendering dell'editor.");
        }
      })
      .catch(function () {
        hideRankCustomizeLoading();
        showRankFatalError("Errore imprevisto durante il caricamento.");
      });
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    currentUser = ev && ev.detail ? ev.detail.user || null : null;
    enforceTargetOwnership(parseTargetUserId(), currentUser);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();