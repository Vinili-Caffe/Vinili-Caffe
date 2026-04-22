(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var currentUser = null;
  var loaded = null;
  var draft = null;
  var activeTab = "colors";

  var COLOR_FIELDS = [
    { key: "panelColor", title: "Sfondo", subtitle: "Colore dei box semi-trasparenti", icon: "fa-tint" },
    { key: "primaryTextColor", title: "Testo Principale", subtitle: "Username, stats e progress bar", icon: "fa-text-width" },
    { key: "multiplierColor", title: "Moltiplicatore", subtitle: "Testo moltiplicatore XP", icon: "fa-bolt" },
    { key: "valueColor", title: "Valori", subtitle: "Server rank e weekly rank", icon: "fa-bar-chart" },
    { key: "labelColor", title: "Etichette", subtitle: "Label come LEVEL, XP, ecc.", icon: "fa-tag" },
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
    if (!Number.isFinite(n)) n = 0.82;
    return Math.max(8, Math.min(100, Math.round(n * 100)));
  }

  function fromPct(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = 82;
    return Math.max(0.08, Math.min(1, n / 100));
  }

  function rankStyle(theme) {
    var t = theme || {};
    return [
      "--vc-rank-panel:" + esc(t.panelColor),
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
      "--vc-rank-wallpaper:" + (t.wallpaperUrl ? 'url(&quot;' + esc(t.wallpaperUrl) + '&quot;)' : "none"),
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
      '<span class="vc-rank-editor-preview__dot">·</span>' +
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

  function render() {
    var app = byId("vc-rank-customize-app");
    if (!app || !loaded || !draft) return;
    var backHref = profileUrl(loaded.userId);
    var colorCards = COLOR_FIELDS.map(function (field, index) {
      var value = draft[field.key];
      return (
        '<details class="vc-rank-editor-card" ' + (index < 2 ? "open" : "") + ">" +
        '<summary class="vc-rank-editor-card__summary">' +
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
      '<details class="vc-rank-editor-card" open>' +
      '<summary class="vc-rank-editor-card__summary">' +
      '<span class="vc-rank-editor-card__icon"><i class="fa fa-sliders" aria-hidden="true"></i></span>' +
      '<span class="vc-rank-editor-card__copy"><strong>Opacità Sfondo</strong><span>Trasparenza dei box contenitori</span></span>' +
      '<span class="vc-rank-editor-card__badge">' + esc(String(toPct(draft.overlayOpacity))) + "%</span>" +
      '<i class="fa fa-angle-down vc-rank-editor-card__chev" aria-hidden="true"></i>' +
      "</summary>" +
      '<div class="vc-rank-editor-card__body">' +
      '<div class="vc-rank-editor-sliderrow">' +
      '<input id="vc-rank-opacity-range" type="range" min="8" max="100" value="' + esc(String(toPct(draft.overlayOpacity))) + '" />' +
      '<span id="vc-rank-opacity-label">' + esc(String(toPct(draft.overlayOpacity))) + "%</span>" +
      "</div></div></details>" +
      (activeTab === "colors"
        ? colorCards
        : '<details class="vc-rank-editor-card" open>' +
          '<summary class="vc-rank-editor-card__summary">' +
          '<span class="vc-rank-editor-card__icon"><i class="fa fa-picture-o" aria-hidden="true"></i></span>' +
          '<span class="vc-rank-editor-card__copy"><strong>Wallpaper</strong><span>Sfondo immagine della rank card</span></span>' +
          '<span class="vc-rank-editor-card__swatch vc-rank-editor-card__swatch--wall"></span>' +
          '<i class="fa fa-angle-down vc-rank-editor-card__chev" aria-hidden="true"></i>' +
          "</summary>" +
          '<div class="vc-rank-editor-card__body">' +
          '<div class="vc-rank-editor-colorrow">' +
          '<input class="vc-rank-editor-colorrow__hex vc-rank-editor-colorrow__hex--wide" type="text" id="vc-rank-wallpaper-url" value="' + esc(draft.wallpaperUrl || "") + '" placeholder="https://..." />' +
          '<button type="button" class="vc-rank-editor-updatebtn" id="vc-rank-apply-wallpaper"><i class="fa fa-eye" aria-hidden="true"></i> Aggiorna Anteprima</button>' +
          "</div></div></details>") +
      '<div class="vc-rank-editor-actions"><button type="button" class="vc-rank-editor-save" id="vc-rank-save"><i class="fa fa-floppy-o" aria-hidden="true"></i> Salva Modifiche</button><button type="button" class="vc-rank-editor-reset" id="vc-rank-reset"><i class="fa fa-undo" aria-hidden="true"></i> Reset</button></div>' +
      '<p class="vc-rank-editor-status" id="vc-rank-status"></p>' +
      "</div>" +
      '<aside class="vc-rank-editor-side">' +
      '<div class="vc-rank-editor-previewcard"><div class="vc-rank-editor-previewcard__head"><span class="vc-rank-editor-previewcard__icon"><i class="fa fa-eye" aria-hidden="true"></i></span><div><strong>Anteprima Live</strong></div></div>' +
      previewMarkup(loaded, draft) +
      '<div class="vc-rank-editor-previewnote"><strong>Aggiornamento</strong><span>L\'opacità si aggiorna in tempo reale. Per colori e wallpaper clicca "Aggiorna Anteprima".</span></div>' +
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

  function bindUi() {
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
        render();
      });
    });

    var wallpaperBtn = byId("vc-rank-apply-wallpaper");
    if (wallpaperBtn) {
      wallpaperBtn.addEventListener("click", function () {
        var input = byId("vc-rank-wallpaper-url");
        draft.wallpaperUrl = String(input && input.value ? input.value : "").trim();
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
