(function () {
  var currentViewer = null;
  var lastRenderedProfile = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_USER_LEADER) || {};
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function resolvedApiUrl() {
    var c = cfg();
    var local = String(c.apiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local) return local;
    return String(c.apiUrl || "").trim();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function siteName() {
    try {
      var t = String(document.title || "").trim();
      if (t.indexOf("|") > -1) return t.split("|")[0].trim();
      return t || "Community";
    } catch (e) {
      return "Community";
    }
  }

  function parseProfileId() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var fromQuery = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
      if (/^\d{17,20}$/.test(fromQuery)) return fromQuery;
      var m = String(window.location.pathname || "").match(/^\/users?\/(\d{17,20})\/?$/);
      if (m) return m[1];
    } catch (e) {}
    return "";
  }

  function profilePublicUrl(userId) {
    var id = String(userId || "").trim();
    return id ? "/users/" + encodeURIComponent(id) : "/user";
  }

  function profileCustomizeUrl(userId) {
    var id = String(userId || "").trim();
    return id ? "/user/" + encodeURIComponent(id) + "/personalizza" : "/user/personalizza";
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

  function formatHoursIt(sec) {
    var s = Number(sec);
    if (!Number.isFinite(s) || s < 0) return "0,0h";
    return String((s / 3600).toFixed(1)).replace(".", ",") + "h";
  }

  function formatPct(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "0%";
    return String(Math.max(0, Math.min(100, Math.round(x)))) + "%";
  }

  function formatMult(n) {
    var x = Number(n);
    if (!Number.isFinite(x) || x <= 0) x = 1;
    return "x" + String(x.toFixed(1));
  }

  function hexToRgbList(hex) {
    var raw = String(hex || "").trim();
    var body = raw.charAt(0) === "#" ? raw.slice(1) : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(body)) return "";
    return (
      parseInt(body.slice(0, 2), 16) +
      ", " +
      parseInt(body.slice(2, 4), 16) +
      ", " +
      parseInt(body.slice(4, 6), 16)
    );
  }

  function rankCardStyleVars(theme, resolvedWallpaper) {
    var src = theme && typeof theme === "object" ? theme : {};
    var primary = src.primaryTextColor || "#ffcb05";
    var value = src.valueColor || "#f2f2f2";
    var label = src.labelColor || "#a8acb8";
    var out = [];
    if (src.panelColor) out.push("--vc-rank-panel:" + esc(src.panelColor));
    out.push("--vc-rank-primary:" + esc(primary));
    out.push("--vc-rank-secondary:" + esc(label));
    if (src.multiplierColor) out.push("--vc-rank-multiplier:" + esc(src.multiplierColor));
    out.push("--vc-rank-value:" + esc(value));
    out.push("--vc-rank-label:" + esc(label));
    out.push("--vc-rank-progress-start:" + esc(primary));
    out.push("--vc-rank-progress-end:" + esc(primary));
    out.push("--vc-rank-ring:" + esc(primary));
    out.push("--vc-rank-rankbox:" + esc(value));
    if (src.overlayOpacity != null) out.push("--vc-rank-opacity:" + esc(String(src.overlayOpacity)));
    if (src.panelColor) {
      var rgb = hexToRgbList(src.panelColor);
      if (rgb) out.push("--vc-rank-panel-rgb:" + esc(rgb));
    }
    if (resolvedWallpaper) out.push("--vc-rank-wallpaper:url(&quot;" + esc(resolvedWallpaper) + "&quot;)");
    return out.length ? ' style="' + out.join(";") + '"' : "";
  }

  function formatDateIt(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (!isFinite(d.getTime())) return "-";
    try {
      return new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(d);
    } catch (e) {
      return d.toLocaleDateString("it-IT");
    }
  }

  function defaultEmbedAvatarUrl(userId) {
    var idx = 0;
    if (/^\d{17,20}$/.test(String(userId || ""))) {
      try {
        idx = Number((BigInt(String(userId)) >> 22n) % 6n);
      } catch (e) {
        idx = 0;
      }
    }
    return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
  }

  function hideLeaderOnlySections() {
    var nodes = document.querySelectorAll("[data-vc-leader-only]");
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].hidden = true;
      nodes[i].style.display = "none";
    }
    document.body.classList.add("vc-user-profile-page");
  }

  function buildApiUrl(board, userId) {
    var base = resolvedApiUrl();
    if (!base) return "";
    return (
      base.split("?")[0] +
      (base.indexOf("?") >= 0 ? "&" : "?") +
      "board=" +
      encodeURIComponent(board) +
      "&userId=" +
      encodeURIComponent(userId) +
      "&perPage=1&_vcprofile=" +
      encodeURIComponent(String(Date.now()))
    );
  }

  function fetchBoard(board, userId) {
    var url = buildApiUrl(board, userId);
    if (!url) return Promise.resolve({ ok: false, board: board, rows: [] });
    return fetch(url, { credentials: "omit", cache: "no-store" })
      .then(function (r) {
        return r.json().then(function (body) {
          return { httpOk: r.ok, body: body };
        });
      })
      .then(function (out) {
        var b = out && out.body ? out.body : {};
        return {
          ok: Boolean(out && out.httpOk && b && b.ok === true),
          board: board,
          notFound: Boolean(b && b.notFound),
          rows: Array.isArray(b && b.rows) ? b.rows : [],
          profile: b && b.profile ? b.profile : null,
        };
      })
      .catch(function () {
        return { ok: false, board: board, rows: [] };
      });
  }

  function renderLoading(root) {
    root.innerHTML =
      '<section class="vc-user-profile-shell">' +
      '<div class="vc-user-profile-loader">' +
      '<span class="vc-user-profile-loader__spin" aria-hidden="true"></span>' +
      '<p class="vc-user-profile-loader__title">Caricamento profilo</p>' +
      '<p class="vc-user-profile-loader__sub">Sto recuperando le statistiche dell\'utente...</p>' +
      "</div></section>";
  }

  function renderError(root) {
    root.innerHTML =
      '<section class="vc-user-profile-shell">' +
      '<div class="vc-user-profile-empty">' +
      '<div class="vc-user-profile-empty__emoji" aria-hidden="true">!</div>' +
      '<h1 class="vc-user-profile-empty__title">Profilo non disponibile</h1>' +
      '<p class="vc-user-profile-empty__text">Non sono riuscito a caricare i dati del profilo in questo momento.</p>' +
      '<a class="vc-user-profile-empty__cta" href="/user">Torna alla Community</a>' +
      "</div></section>";
  }

  function renderEmpty(root, userId) {
    document.title = "Profilo " + userId + " | " + siteName();
    root.innerHTML =
      '<section class="vc-user-profile-shell vc-user-profile-shell--notfound">' +
      '<div class="vc-user-profile-notfound">' +
      '<div class="vc-user-profile-notfound__emoji" aria-hidden="true">&#128532;</div>' +
      '<h1 class="vc-user-profile-notfound__title">Utente non trovato</h1>' +
      '<a class="vc-user-profile-notfound__cta" href="/user">Torna alla Community</a>' +
      "</div></section>";
  }

  function renderProfile(root, userId, payload) {
    var level = payload.level || {};
    var weekly = payload.weekly || {};
    var messages = payload.messages || {};
    var voice = payload.voice || {};
    var profile = payload.profile || {};
    var displayName = String(profile.displayName || level.displayName || level.username || "Utente").trim() || "Utente";
    var profileUsername = String(profile.username || level.username || displayName || "Utente").trim() || "Utente";
    var avatar = String(profile.avatarUrl || level.avatarUrl || "").trim();
    var progressPct = formatPct(level.progressPercent || 0);
    var rankText = level.rank ? "#" + formatIntIt(level.rank) : "-";
    var weeklyRankText = weekly.rank ? "#" + formatIntIt(weekly.rank) : "-";
    var viewerOwns = Boolean(currentViewer && String(currentViewer.id || "") === String(userId));
    var roles = Array.isArray(profile.roles) ? profile.roles : [];
    var customProfile = profile.customProfile || null;
    var customRole = customProfile && customProfile.role ? customProfile.role : null;
    var customVoice = customProfile && customProfile.voice ? customProfile.voice : null;
    var rankCardTheme = profile.rankCard || {};
    var multiplier = Number(weekly.expMultiplier || 1);
    var multiplierSources = Array.isArray(profile.weeklyMultiplierSources) ? profile.weeklyMultiplierSources : [];

    var rolesHtml = roles.length
      ? roles
          .map(function (role) {
            var style = role.color ? ' style="--vc-role-chip:' + esc(role.color) + '"' : "";
            return '<span class="vc-user-profile-role"' + style + ">" + esc(role.name) + "</span>";
          })
          .join("")
      : '<span class="vc-user-profile-role vc-user-profile-role--muted">Nessun ruolo mostrabile</span>';

    var multiplierItemsHtml = multiplierSources.length
      ? multiplierSources
          .map(function (source) {
            var style = source.color ? ' style="--vc-multi-accent:' + esc(source.color) + '"' : "";
            return (
              '<div class="vc-user-profile-multisource"' +
              style +
              ">" +
              '<span class="vc-user-profile-multisource__label">' +
              esc(source.label || "Bonus") +
              "</span>" +
              '<span class="vc-user-profile-multisource__value">' +
              esc(formatMult(source.multiplier || 1)) +
              "</span>" +
              "</div>"
            );
          })
          .join("")
      : '<div class="vc-user-profile-multisource"><span class="vc-user-profile-multisource__label">Base</span><span class="vc-user-profile-multisource__value">x1.0</span></div>';

    var customEconomyHtml =
      customRole || customVoice
        ? '<section class="vc-user-profile-block vc-user-profile-block--custom">' +
          '<div class="vc-user-profile-sectioneyebrow"><i class="fa fa-diamond" aria-hidden="true"></i> Ruoli & Economy</div>' +
          (customRole
            ? '<details class="vc-user-profile-accordion vc-user-profile-accordion--role"' +
              (viewerOwns ? " open" : "") +
              ">" +
              '<summary class="vc-user-profile-accordion__summary">' +
              '<span class="vc-user-profile-accordion__icon"><i class="fa fa-crown" aria-hidden="true"></i></span>' +
              '<span class="vc-user-profile-accordion__copy">' +
              '<span class="vc-user-profile-accordion__title">Ruolo Personalizzato</span>' +
              '<span class="vc-user-profile-accordion__sub">' +
              esc(customRole.name || "Ruolo personalizzato") +
              "</span>" +
              "</span>" +
              '<span class="vc-user-profile-accordion__badge">' +
              esc(formatIntIt(customRole.memberCount || 0)) +
              "</span>" +
              '<i class="fa fa-angle-down vc-user-profile-accordion__chev" aria-hidden="true"></i>' +
              "</summary>" +
              '<div class="vc-user-profile-accordion__body">' +
              '<article class="vc-user-profile-customcard">' +
              '<div class="vc-user-profile-customcard__main">' +
              '<span class="vc-user-profile-customcard__dot"' +
              (customRole.color ? ' style="--vc-custom-dot:' + esc(customRole.color) + '"' : "") +
              "></span>" +
              '<div class="vc-user-profile-customcard__copy">' +
              '<strong class="vc-user-profile-customcard__title">' +
              esc(customRole.name || "Ruolo personalizzato") +
              "</strong>" +
              '<span class="vc-user-profile-customcard__meta">Creato ' +
              esc(formatDateIt(customRole.createdAt)) +
              "</span>" +
              "</div>" +
              "</div>" +
              '<span class="vc-user-profile-customcard__aside">' +
              esc(formatIntIt(customRole.memberCount || 0)) +
              " membri</span>" +
              "</article>" +
              "</div>" +
              "</details>"
            : "") +
          (customVoice
            ? '<details class="vc-user-profile-accordion vc-user-profile-accordion--voice"' +
              (viewerOwns ? " open" : "") +
              ">" +
              '<summary class="vc-user-profile-accordion__summary">' +
              '<span class="vc-user-profile-accordion__icon"><i class="fa fa-microphone" aria-hidden="true"></i></span>' +
              '<span class="vc-user-profile-accordion__copy">' +
              '<span class="vc-user-profile-accordion__title">Canale Vocale Privato</span>' +
              '<span class="vc-user-profile-accordion__sub">' +
              esc((customVoice.emoji ? customVoice.emoji + " " : "") + (customVoice.name || "Canale vocale privato")) +
              "</span>" +
              "</span>" +
              '<span class="vc-user-profile-accordion__badge">' +
              esc(formatIntIt(customVoice.memberCount || 0)) +
              "</span>" +
              '<i class="fa fa-angle-down vc-user-profile-accordion__chev" aria-hidden="true"></i>' +
              "</summary>" +
              '<div class="vc-user-profile-accordion__body">' +
              '<article class="vc-user-profile-customcard vc-user-profile-customcard--voice">' +
              '<div class="vc-user-profile-customcard__main">' +
              '<span class="vc-user-profile-customcard__dot vc-user-profile-customcard__dot--voice"></span>' +
              '<div class="vc-user-profile-customcard__copy">' +
              '<strong class="vc-user-profile-customcard__title">' +
              esc(customVoice.name || "Canale vocale privato") +
              "</strong>" +
              '<span class="vc-user-profile-customcard__meta">Creato ' +
              esc(formatDateIt(customVoice.createdAt)) +
              "</span>" +
              "</div>" +
              "</div>" +
              '<span class="vc-user-profile-customcard__aside">' +
              esc(formatIntIt(customVoice.memberCount || 0)) +
              " utenti</span>" +
              "</article>" +
              '<div class="vc-user-profile-customgrid">' +
              '<div class="vc-user-profile-customgrid__row"><span class="vc-user-profile-customgrid__label">Channel ID</span><strong class="vc-user-profile-customgrid__value">' +
              esc(customVoice.id || "-") +
              "</strong></div>" +
              '<div class="vc-user-profile-customgrid__row"><span class="vc-user-profile-customgrid__label">Condiviso con</span><strong class="vc-user-profile-customgrid__value">' +
              esc(formatIntIt(customVoice.memberCount || 0)) +
              " utenti</strong></div>" +
              '<div class="vc-user-profile-customgrid__row"><span class="vc-user-profile-customgrid__label">Creato</span><strong class="vc-user-profile-customgrid__value">' +
              esc(formatDateIt(customVoice.createdAt)) +
              "</strong></div>" +
              "</div>" +
              "</div>" +
              "</details>"
            : "") +
          "</section>"
        : "";

    document.title = "Profilo " + userId + " | " + siteName();
    root.innerHTML =
      '<section class="vc-user-profile-shell">' +
      '<div class="vc-user-profile-backrow">' +
      '<a class="vc-user-profile-backbtn" href="/user"><i class="fa fa-long-arrow-left" aria-hidden="true"></i> Community</a>' +
      "</div>" +
      '<section class="vc-user-profile-hero">' +
      '<div class="vc-user-profile-hero__head">' +
      '<div class="vc-user-profile-avatarwrap">' +
      '<span class="vc-user-profile-avatarclip">' +
      (avatar
        ? '<img class="vc-user-profile-avatar" src="' +
          esc(avatar) +
          '" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' +
          esc(defaultEmbedAvatarUrl(userId)) +
          '\'" />'
        : '<span class="vc-user-profile-avatar vc-user-profile-avatar--fallback"><i class="fa fa-user"></i></span>') +
      "</span>" +
      "</div>" +
      '<div class="vc-user-profile-hero__copy">' +
      '<h1 class="vc-user-profile-name">' +
      esc(profileUsername) +
      "</h1>" +
      '<p class="vc-user-profile-id">ID: ' +
      esc(userId) +
      "</p>" +
      "</div>" +
      (viewerOwns
        ? '<a class="vc-user-profile-customize" href="' +
          esc(profileCustomizeUrl(userId)) +
          '"><i class="fa fa-paint-brush" aria-hidden="true"></i> Personalizza</a>'
        : "") +
      "</div>" +
      '<div class="vc-user-profile-stats">' +
      '<article class="vc-user-profile-stat vc-user-profile-stat--level"><span class="vc-user-profile-stat__label">Livello</span><span class="vc-user-profile-stat__value">' +
      esc(String(level.level != null ? level.level : 0)) +
      "</span></article>" +
      '<article class="vc-user-profile-stat vc-user-profile-stat--exp"><span class="vc-user-profile-stat__label">EXP totale</span><span class="vc-user-profile-stat__value">' +
      esc(formatIntIt(level.exp || 0)) +
      "</span></article>" +
      '<article class="vc-user-profile-stat vc-user-profile-stat--rank"><span class="vc-user-profile-stat__label">Rank</span><span class="vc-user-profile-stat__value">' +
      esc(rankText) +
      "</span></article>" +
      '<article class="vc-user-profile-stat vc-user-profile-stat--weekly"><span class="vc-user-profile-stat__label">EXP weekly</span><span class="vc-user-profile-stat__value">' +
      esc(formatIntIt(weekly.weeklyExp || 0)) +
      "</span></article>" +
      "</div>" +
      "</section>" +
      (viewerOwns
        ? '<details class="vc-user-profile-block vc-user-profile-block--messages vc-user-profile-disclosure">' +
          '<summary class="vc-user-profile-disclosure__summary"><span class="vc-user-profile-block__title">Statistiche messaggi</span><span class="vc-user-profile-block__sub">' +
          esc(formatIntIt(messages.messagesTotal || 0)) +
          ' messaggi totali</span><i class="fa fa-angle-down vc-user-profile-disclosure__chev" aria-hidden="true"></i></summary>' +
          '<div class="vc-user-profile-grid3">' +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Totali</span><span class="vc-user-profile-mini__value">' +
          esc(formatIntIt(messages.messagesTotal || 0)) +
          "</span></div>" +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Settimanali</span><span class="vc-user-profile-mini__value">' +
          esc(formatIntIt(messages.messagesWeekly || 0)) +
          "</span></div>" +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Giornaliere</span><span class="vc-user-profile-mini__value">' +
          esc(formatIntIt(messages.messagesDaily || 0)) +
          "</span></div>" +
          "</div></details>"
        : "") +
      (viewerOwns
        ? '<details class="vc-user-profile-block vc-user-profile-block--voice vc-user-profile-disclosure">' +
          '<summary class="vc-user-profile-disclosure__summary"><span class="vc-user-profile-block__title">Statistiche voice chat</span><span class="vc-user-profile-block__sub">' +
          esc(formatHoursIt(voice.voiceTotalSeconds || 0)) +
          ' totali</span><i class="fa fa-angle-down vc-user-profile-disclosure__chev" aria-hidden="true"></i></summary>' +
          '<div class="vc-user-profile-grid3">' +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Ore totali</span><span class="vc-user-profile-mini__value">' +
          esc(formatHoursIt(voice.voiceTotalSeconds || 0)) +
          "</span></div>" +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Ore settimanali</span><span class="vc-user-profile-mini__value">' +
          esc(formatHoursIt(voice.voiceWeeklySeconds || 0)) +
          "</span></div>" +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Ore giornaliere</span><span class="vc-user-profile-mini__value">' +
          esc(formatHoursIt(voice.voiceDailySeconds || 0)) +
          "</span></div>" +
          "</div></details>"
        : "") +
      '<section class="vc-user-profile-block vc-user-profile-block--rankcard">' +
      '<div class="vc-user-profile-block__head">' +
      '<span class="vc-user-profile-block__title">Rank card <code class="vc-user-profile-inlinecmd">+rank</code></span>' +
      (viewerOwns
        ? '<a class="vc-user-profile-customize" href="' +
          esc(profileCustomizeUrl(userId)) +
          '"><i class="fa fa-sliders" aria-hidden="true"></i> Personalizza</a>'
        : "") +
      "</div>" +
      '<div class="vc-user-rankcard"' + rankCardStyleVars(rankCardTheme, profile.rankCardResolvedWallpaper) + ">" +
      '<div class="vc-user-rankcard__main">' +
      '<div class="vc-user-rankcard__avatarwrap">' +
      '<span class="vc-user-rankcard__avatarclip">' +
      (avatar
        ? '<img class="vc-user-rankcard__avatar" src="' +
          esc(avatar) +
          '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' +
          esc(defaultEmbedAvatarUrl(userId)) +
          '\'" />'
        : '<span class="vc-user-rankcard__avatar vc-user-rankcard__avatar--fallback"><i class="fa fa-user"></i></span>') +
      "</span>" +
      "</div>" +
      '<div class="vc-user-rankcard__copy">' +
      '<div class="vc-user-rankcard__name">' +
      esc(profileUsername) +
      ' <span class="vc-user-rankcard__level">- Lv. ' +
      esc(String(level.level != null ? level.level : 0)) +
      "</span></div>" +
      '<div class="vc-user-rankcard__progress"><span class="vc-user-rankcard__progressfill" style="width:' +
      esc(progressPct) +
      '"></span><span class="vc-user-rankcard__progresstext">' +
      esc(formatIntIt(level.exp || 0)) +
      " EXP</span></div>" +
      '<div class="vc-user-rankcard__meta">' +
      '<span class="vc-user-rankcard__pill">Weekly rank ' +
      esc(weeklyRankText) +
      "</span>" +
      '<span class="vc-user-rankcard__pill">Weekly XP ' +
      esc(formatIntIt(weekly.weeklyExp || 0)) +
      "</span>" +
      '<span class="vc-user-rankcard__pill">Moltiplicatore ' +
      esc(formatMult(multiplier)) +
      "</span>" +
      "</div></div>" +
      '<div class="vc-user-rankcard__rankbox">' +
      esc(rankText) +
      "<small>RANK</small></div>" +
      "</div>" +
      '<div class="vc-user-profile-multiplier__body vc-user-profile-multiplier__body--inline">' +
      multiplierItemsHtml +
      "</div>" +
      "</div></section>" +
      customEconomyHtml +
      '<section class="vc-user-profile-block vc-user-profile-block--roles">' +
      '<div class="vc-user-profile-block__head"><span class="vc-user-profile-block__title">Ruoli</span><span class="vc-user-profile-block__sub">' +
      esc(String(roles.length)) +
      " presenti</span></div>" +
      '<div class="vc-user-profile-roles">' +
      rolesHtml +
      "</div></section>" +
      "</section>";
  }

  function main() {
    var userId = parseProfileId();
    if (!userId) return;
    var root = byId("vc-user-profile-view");
    if (!root) return;
    currentViewer = (typeof window !== "undefined" && window.__VC_DISCORD_PROFILE) || currentViewer;
    hideLeaderOnlySections();
    root.hidden = false;
    renderLoading(root);

    Promise.all([
      fetchBoard("level", userId),
      fetchBoard("weekly", userId),
      fetchBoard("messages", userId),
      fetchBoard("voice", userId),
    ]).then(function (results) {
      var level = results[0] && results[0].rows && results[0].rows[0] ? results[0].rows[0] : null;
      var weekly = results[1] && results[1].rows && results[1].rows[0] ? results[1].rows[0] : null;
      var messages = results[2] && results[2].rows && results[2].rows[0] ? results[2].rows[0] : null;
      var voice = results[3] && results[3].rows && results[3].rows[0] ? results[3].rows[0] : null;
      var profile = {};
      var anyFailure = false;
      var hasAny = false;
      var i;

      for (i = 0; i < results.length; i += 1) {
        if (results[i] && results[i].profile) {
          var nextProfile = results[i].profile || {};
          profile = Object.assign({}, profile, nextProfile);
          if (Array.isArray(nextProfile.roles) && nextProfile.roles.length) {
            profile.roles = nextProfile.roles.slice();
          }
          if (Array.isArray(nextProfile.weeklyMultiplierSources) && nextProfile.weeklyMultiplierSources.length) {
            profile.weeklyMultiplierSources = nextProfile.weeklyMultiplierSources.slice();
          }
          if (nextProfile.customProfile) {
            profile.customProfile = nextProfile.customProfile;
          }
        }
        if (results[i] && !results[i].ok && !results[i].notFound) anyFailure = true;
      }

      hasAny =
        Boolean(level || weekly || messages || voice) &&
        ((level && Number(level.exp) > 0) ||
          (weekly && Number(weekly.weeklyExp) > 0) ||
          (messages && Number(messages.messagesTotal) > 0) ||
          (voice && Number(voice.voiceTotalSeconds) > 0) ||
          Boolean(profile.customProfile));

      if (!hasAny) {
        if (anyFailure) {
          renderError(root);
          return;
        }
        renderEmpty(root, userId);
        return;
      }

      lastRenderedProfile = {
        root: root,
        userId: userId,
        payload: {
          profile: profile || {},
          level: level || {},
          weekly: weekly || {},
          messages: messages || {},
          voice: voice || {},
        },
      };

      renderProfile(root, userId, lastRenderedProfile.payload);
    });
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    currentViewer = ev && ev.detail ? ev.detail.user || null : null;
    if (lastRenderedProfile && lastRenderedProfile.root) {
      renderProfile(lastRenderedProfile.root, lastRenderedProfile.userId, lastRenderedProfile.payload);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }

  window.VCUserProfilePage = {
    isProfileMode: function () {
      return Boolean(parseProfileId());
    },
    profilePublicUrl: profilePublicUrl,
  };
})();
