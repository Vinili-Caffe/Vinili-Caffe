(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var currentUser = null;
  var loaded = null;
  var draft = null;
  var activeTab = "colors";
  var activeAccordion = "opacity";

  var COLOR_FIELDS = [
    { key: "panelColor", title: "Sfondo", subtitle: "Colore dei box semi-trasparenti", icon: "fa-tint" },
    { key: "primaryTextColor", title: "Testo Principale", subtitle: "Username, stats e progress bar", icon: "fa-text-width" },
    { key: "multiplierColor", title: "Moltiplicatore", subtitle: "Testo moltiplicatore XP", icon: "fa-bolt" },
    { key: "valueColor", title: "Valori", subtitle: "Server rank e weekly rank", icon: "fa-bar-chart" },
    { key: "labelColor", title: "Etichette", subtitle: 'Label come "LEVEL", "XP", ecc.', icon: "fa-tag" },
    { key: "progressStartColor", title: "Progress Start", subtitle: "Inizio barra XP", icon: "fa-long-arrow-right" },
    { key: "progressEndColor", title: "Progress End", subtitle: "Fine barra XP", icon: "fa-long-arrow-right" },
    { key: "ringColor", title: "Avatar Ring", subtitle: "Glow e bordo avatar", icon: "fa-circle-o" },
    { key: "rankBoxBorderColor", title: "Rank Box", subtitle: "Bordo e valore box rank", icon: "fa-square-o" },
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
      var match = String(window.location.pathname || "").match(/^\/user\/(\d{17,20})\/personalizza\/?$/);
      if (match) return match[1];
      match = String(window.location.pathname || "").match(/^\/users\/(\d{17,20})\/customize\/?$/);
      if (match) return match[1];
    } catch (e) {}
    return "";
  }

  function resolvedRankApiUrl() {
    var c = cfg();
    return String(c.rankApiUrl || "").trim();
  }

  function profileUrl(userId) {
    return "/user/" + encodeURIComponent(String(userId || "").trim());
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

  function rankStyle(theme) {
    var t = theme || {};
    return [
      "--vc-rank-panel:" + esc(t.panelColor),
      "--vc-rank-panel-rgb:" + esc(hexToRgbList(t.panelColor)),
      "--vc-rank-primary:" + esc(t.primaryTextColor),
      "--vc-rank-secondary:" + esc(t.secondaryTextColor),
      "--vc-rank-multiplier:" + esc(t.multiplierColor),
      "--vc-rank-value:" + esc(t.valueColor),
      "--vc-rank-label:" + esc(t.labelColor),
      "--vc-rank-progress-start:" + esc(t.progressStartColor),
      "--vc-rank-progress-end:" + esc(t.progressEndColor),
      "--vc-rank-ring:" + esc(t.ringColor),
      "--vc-rank-rankbox:" + esc(t.rankBoxBorderColor),
      "--vc-rank-opacity:" + esc(String(t.overlayOpacity)),
      "--vc-rank-wallpaper:" + (resolvedWallpaper(t) ? 'url(&quot;' + esc(resolvedWallpaper(t)) + '&quot;)' : "none"),
    ].join(";");
  }

  function previewMarkup(data, theme) {
    var stats = data.stats || {};
    var username = String(data.username || "utente").trim() || "utente";
    var avatar = String(data.avatarUrl || "").trim();
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
      '<div class="vc-rank-editor-preview__main">' +
      '<div class="vc-rank-editor-preview__topline">' +
      '<span class="vc-rank-editor-preview__name">' + esc(username) + "</span>" +
      '<span class="vc-rank-editor-preview__dot">&middot;</span>' +
      '<span class="vc-rank-editor-preview__level">Lv. ' + esc(String(stats.level || 0)) + "</span>" +
      '<span class="vc-rank-editor-preview__mult">' + esc("x" + Number(stats.multiplier || 1).toFixed(1)) + "</span>" +
      "</div>" +
      '<div class="vc-rank-editor-preview__bar"><span class="vc-rank-editor-preview__fill" style="width:' +
      esc(String(Math.max(0, Math.min(100, Number(stats.progressPercent || 0)))) + "%") +
      '"></span><span class="vc-rank-editor-preview__bartext">' +
      esc(String(Math.max(0, Math.floor(Number(stats.currentLevelExp || 0)))) + " / " + String(Math.max(0, Math.floor(Number(stats.nextLevelExp || 0)))) + " XP") +
      "</span></div>" +
      "</div>" +
      '<div class="vc-rank-editor-preview__rankbox"><strong>' +
      esc(stats.allTimeRank ? "#" + String(stats.allTimeRank) : "-") +
      "</strong><small>RANK</small></div>" +
      "</div>" +
      '<div class="vc-rank-editor-preview__stats">' +
      '<div class="vc-rank-editor-preview__stat"><span>WEEKLY RANK</span><strong>' + esc(stats.weeklyRank ? "#" + String(stats.weeklyRank) : "-") + "</strong></div>" +
      '<div class="vc-rank-editor-preview__stat"><span>WEEKLY XP</span><strong>' + esc(String(Math.max(0, Math.floor(Number(stats.weeklyExp || 0))))) + "</strong></div>" +
      '<div class="vc-rank-editor-preview__stat"><span>MULTIPLIER</span><strong>' + esc("x" + Number(stats.multiplier || 1).toFixed(1)) + "</strong></div>" +
      "</div>" +
      "</div>"
    );
  }

  function wallpaperGalleryMarkup() {
    return wallpapers()
      .map(function (item) {
        var key = String(item && item.key ? item.key : "");
        var selected = !draft.wallpaperUrl && String(draft.wallpaperKey || "default") === key;
        return (
          '<button type="button" class="vc-rank-editor-wallcard' + (selected ? " is-selected" : "") + '" data-rank-wallpaper="' + esc(key) + '">' +
          '<span class="vc-rank-editor-wallcard__preview"' + (item.previewUrl ? ' style="background-image:url(&quot;' + esc(item.previewUrl) + '&quot;)"' : "") + ">" +
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
        '<input type="file" id="vc-rank-wallpaper-file" accept="image/png,image/jpeg,image/webp" hidden />' +
        '<button type="button" class="vc-rank-editor-reset" id="vc-rank-clear-wallpaper"><i class="fa fa-trash-o" aria-hidden="true"></i> Rimuovi</button>' +
        "</div>" +
        '<p class="vc-rank-editor-uploadhint">PNG, JPG o WEBP. L&apos;immagine viene ottimizzata automaticamente.</p>' +
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
      var value = draft[field.key];
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
        '<input class="vc-rank-editor-colorrow__picker" type="color" value="' + esc(value) + '" data-rank-field="' + esc(field.key) + '" />' +
        '<input class="vc-rank-editor-colorrow__hex" type="text" value="' + esc(value) + '" maxlength="7" data-rank-hex="' + esc(field.key) + '" />' +
        '<button type="button" class="vc-rank-editor-updatebtn" data-rank-apply="' + esc(field.key) + '"><i class="fa fa-eye" aria-hidden="true"></i> Aggiorna Anteprima</button>' +
        "</div>" +
        "</div>" +
        "</details>"
      );
    }).join("");

    app.innerHTML =
      '<div class="vc-rank-editor-topbar"><a class="vc-user-profile-backbtn" href="' + esc(backHref) + '"><i class="fa fa-long-arrow-left" aria-hidden="true"></i> Torna al Profilo</a></div>' +
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
      '<details class="vc-rank-editor-card" data-rank-accordion="opacity"' + (activeAccordion === "opacity" ? " open" : "") + ">" +
      '<summary class="vc-rank-editor-card__summary" data-rank-accordion-trigger="opacity">' +
      '<span class="vc-rank-editor-card__icon"><i class="fa fa-sliders" aria-hidden="true"></i></span>' +
      '<span class="vc-rank-editor-card__copy"><strong>Opacita card</strong><span>Trasparenza dei pannelli della rank card</span></span>' +
      '<span class="vc-rank-editor-card__badge">' + esc(String(toPct(draft.overlayOpacity))) + "%</span>" +
      '<i class="fa fa-angle-down vc-rank-editor-card__chev" aria-hidden="true"></i>' +
      "</summary>" +
      '<div class="vc-rank-editor-card__body">' +
      '<div class="vc-rank-editor-sliderrow">' +
      '<input id="vc-rank-opacity-range" type="range" min="0" max="100" step="5" value="' + esc(String(toPct(draft.overlayOpacity))) + '" />' +
      '<span id="vc-rank-opacity-label">' + esc(String(toPct(draft.overlayOpacity))) + "%</span>" +
      "</div></div></details>" +
      (activeTab === "colors"
        ? colorCards
        : '<section class="vc-rank-editor-wallgrid">' + wallpaperGalleryMarkup() + "</section>" + wallpaperCustomMarkup()) +
      '<div class="vc-rank-editor-actions"><button type="button" class="vc-rank-editor-save" id="vc-rank-save"><i class="fa fa-floppy-o" aria-hidden="true"></i> Salva Modifiche</button><button type="button" class="vc-rank-editor-reset" id="vc-rank-reset"><i class="fa fa-undo" aria-hidden="true"></i> Reset</button></div>' +
      '<p class="vc-rank-editor-status" id="vc-rank-status"></p>' +
      "</div>" +
      '<aside class="vc-rank-editor-side">' +
      '<div class="vc-rank-editor-previewcard"><div class="vc-rank-editor-previewcard__head"><span class="vc-rank-editor-previewcard__icon"><i class="fa fa-eye" aria-hidden="true"></i></span><div><strong>Anteprima Live</strong></div></div>' +
      previewMarkup(loaded, draft) +
      '<div class="vc-rank-editor-previewnote"><strong>Aggiornamento</strong><span>L\'opacita si aggiorna in tempo reale. Per colori e wallpaper clicca "Aggiorna Anteprima".</span></div>' +
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

  function applyField(field) {
    var hexInput = document.querySelector('[data-rank-hex="' + field + '"]');
    var picker = document.querySelector('[data-rank-field="' + field + '"]');
    var value = String((hexInput && hexInput.value) || (picker && picker.value) || "").trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(value)) {
      setStatus("Inserisci un colore hex valido.", true);
      return;
    }
    if (value.charAt(0) !== "#") value = "#" + value;
    draft[field] = value.toUpperCase();
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
    var out = canvas.toDataURL("image/webp", 0.86);
    if (out.length > 850000) {
      out = canvas.toDataURL("image/jpeg", 0.82);
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
        if (target) target.value = input.value.toUpperCase();
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
        activeAccordion = activeTab === "wallpaper" ? "custom-wallpaper" : "opacity";
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
    var token = getToken();
    if (!token) {
      setStatus("Devi effettuare il login con Discord per personalizzare la rank card.", true);
      return Promise.resolve(null);
    }
    return fetch(resolvedRankApiUrl(), {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    }).then(function (r) { return r.json(); });
  }

  function saveTheme() {
    var token = getToken();
    if (!token) {
      setStatus("Sessione Discord scaduta. Effettua di nuovo il login.", true);
      return;
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
        draft = Object.assign({}, draft, body.theme || {});
        setStatus(body.message || "Rank card salvata.", false);
        render();
      })
      .catch(function () {
        setStatus("Errore di rete durante il salvataggio.", true);
      });
  }

  function resetTheme() {
    var token = getToken();
    if (!token) {
      setStatus("Sessione Discord scaduta. Effettua di nuovo il login.", true);
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
        draft = Object.assign({}, body.theme || {});
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
    fetchRankData().then(function (body) {
      var loading = byId("vc-rank-customize-loading");
      if (loading) loading.hidden = true;
      if (!body || body.ok !== true) {
        setStatus((body && body.message) || "Impossibile caricare la personalizzazione rank card.", true);
        return;
      }
      if (targetUserId && String(targetUserId) !== String(body.userId || "")) {
        setStatus("Puoi personalizzare solo la tua rank card.", true);
        return;
      }
      loaded = body;
      draft = Object.assign({}, body.theme || {});
      if (!draft.wallpaperKey) draft.wallpaperKey = "default";
      render();
    });
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    currentUser = ev && ev.detail ? ev.detail.user || null : null;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
