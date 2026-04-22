(function () {
  var currentViewer = null;

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
      '<section class="vc-user-profile-shell">' +
      '<div class="vc-user-profile-empty">' +
      '<div class="vc-user-profile-empty__emoji" aria-hidden="true">Ciao</div>' +
      '<h1 class="vc-user-profile-empty__title">Il profilo non e ancora disponibile.</h1>' +
      '<p class="vc-user-profile-empty__text">Questo utente non ha ancora statistiche visibili. Basta iniziare a scrivere o passare in vocale nel server per creare il profilo.</p>' +
      '<p class="vc-user-profile-empty__hint">Appena ci sara almeno una statistica, qui compariranno livello, messaggi, voice e rank card.</p>' +
      '<a class="vc-user-profile-empty__cta" href="/user">Torna alla Community</a>' +
      "</div></section>";
  }

  function renderProfile(root, userId, payload) {
    var level = payload.level || {};
    var weekly = payload.weekly || {};
    var messages = payload.messages || {};
    var voice = payload.voice || {};
    var profile = payload.profile || {};
    var displayName = String(profile.displayName || level.displayName || level.username || "Utente").trim() || "Utente";
    var avatar = String(profile.avatarUrl || level.avatarUrl || "").trim();
    var progressPct = formatPct(level.progressPercent || 0);
    var rankText = level.rank ? "#" + formatIntIt(level.rank) : "-";
    var viewerOwns = Boolean(currentViewer && String(currentViewer.id || "") === String(userId));
    var roles = Array.isArray(profile.roles) ? profile.roles : [];
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

    document.title = "Profilo " + userId + " | " + siteName();
    root.innerHTML =
      '<section class="vc-user-profile-shell">' +
      '<div class="vc-user-profile-backrow">' +
      '<a class="vc-user-profile-backbtn" href="/user"><i class="fa fa-long-arrow-left" aria-hidden="true"></i> Community</a>' +
      "</div>" +
      '<section class="vc-user-profile-hero">' +
      '<div class="vc-user-profile-hero__head">' +
      '<div class="vc-user-profile-avatarwrap">' +
      (avatar
        ? '<img class="vc-user-profile-avatar" src="' + esc(avatar) + '" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' + esc(defaultEmbedAvatarUrl(userId)) + '\'" />'
        : '<span class="vc-user-profile-avatar vc-user-profile-avatar--fallback"><i class="fa fa-user"></i></span>') +
      "</div>" +
      '<div class="vc-user-profile-hero__copy">' +
      '<h1 class="vc-user-profile-name">' + esc(displayName) + "</h1>" +
      '<p class="vc-user-profile-id">ID: ' + esc(userId) + "</p>" +
      "</div>" +
      (viewerOwns
        ? '<a class="vc-user-profile-customize" href="/ruoli"><i class="fa fa-paint-brush" aria-hidden="true"></i> Personalizza</a>'
        : "") +
      "</div>" +
      '<div class="vc-user-profile-stats">' +
      '<article class="vc-user-profile-stat vc-user-profile-stat--level"><span class="vc-user-profile-stat__label">Livello</span><span class="vc-user-profile-stat__value">' + esc(String(level.level != null ? level.level : 0)) + "</span></article>" +
      '<article class="vc-user-profile-stat vc-user-profile-stat--exp"><span class="vc-user-profile-stat__label">EXP totale</span><span class="vc-user-profile-stat__value">' + esc(formatIntIt(level.exp || 0)) + "</span></article>" +
      '<article class="vc-user-profile-stat vc-user-profile-stat--rank"><span class="vc-user-profile-stat__label">Rank</span><span class="vc-user-profile-stat__value">' + esc(rankText) + "</span></article>" +
      '<article class="vc-user-profile-stat vc-user-profile-stat--weekly"><span class="vc-user-profile-stat__label">EXP weekly</span><span class="vc-user-profile-stat__value">' + esc(formatIntIt(weekly.weeklyExp || 0)) + "</span></article>" +
      "</div>" +
      "</section>" +
      '<section class="vc-user-profile-block vc-user-profile-block--messages">' +
      '<div class="vc-user-profile-block__head"><span class="vc-user-profile-block__title">Statistiche messaggi</span><span class="vc-user-profile-block__sub">' + esc(formatIntIt(messages.messagesTotal || 0)) + " messaggi totali</span></div>" +
      '<div class="vc-user-profile-grid3">' +
      '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Totali</span><span class="vc-user-profile-mini__value">' + esc(formatIntIt(messages.messagesTotal || 0)) + "</span></div>" +
      '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Settimanali</span><span class="vc-user-profile-mini__value">' + esc(formatIntIt(messages.messagesWeekly || 0)) + "</span></div>" +
      '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Giornaliere</span><span class="vc-user-profile-mini__value">' + esc(formatIntIt(messages.messagesDaily || 0)) + "</span></div>" +
      "</div></section>" +
      '<section class="vc-user-profile-block vc-user-profile-block--voice">' +
      '<div class="vc-user-profile-block__head"><span class="vc-user-profile-block__title">Statistiche voice chat</span><span class="vc-user-profile-block__sub">' + esc(formatHoursIt(voice.voiceTotalSeconds || 0)) + " totali</span></div>" +
      '<div class="vc-user-profile-grid3">' +
      '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Ore totali</span><span class="vc-user-profile-mini__value">' + esc(formatHoursIt(voice.voiceTotalSeconds || 0)) + "</span></div>" +
      '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Ore settimanali</span><span class="vc-user-profile-mini__value">' + esc(formatHoursIt(voice.voiceWeeklySeconds || 0)) + "</span></div>" +
      '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Ore giornaliere</span><span class="vc-user-profile-mini__value">' + esc(formatHoursIt(voice.voiceDailySeconds || 0)) + "</span></div>" +
      "</div></section>" +
      '<section class="vc-user-profile-block vc-user-profile-block--rankcard">' +
      '<div class="vc-user-profile-block__head"><span class="vc-user-profile-block__title">Rank card</span><span class="vc-user-profile-block__sub">Anteprima e moltiplicatore</span></div>' +
      '<div class="vc-user-rankcard">' +
      '<div class="vc-user-rankcard__main">' +
      '<div class="vc-user-rankcard__avatarwrap">' +
      (avatar
        ? '<img class="vc-user-rankcard__avatar" src="' + esc(avatar) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' + esc(defaultEmbedAvatarUrl(userId)) + '\'" />'
        : '<span class="vc-user-rankcard__avatar vc-user-rankcard__avatar--fallback"><i class="fa fa-user"></i></span>') +
      "</div>" +
      '<div class="vc-user-rankcard__copy">' +
      '<div class="vc-user-rankcard__name">' + esc(displayName) + ' <span class="vc-user-rankcard__level">- Lv. ' + esc(String(level.level != null ? level.level : 0)) + "</span></div>" +
      '<div class="vc-user-rankcard__progress"><span class="vc-user-rankcard__progressfill" style="width:' + esc(progressPct) + '"></span><span class="vc-user-rankcard__progresstext">' + esc(formatIntIt(level.exp || 0)) + " EXP</span></div>" +
      '<div class="vc-user-rankcard__meta">' +
      '<span class="vc-user-rankcard__pill">Weekly rank ' + esc(weekly.rank ? "#" + formatIntIt(weekly.rank) : "-") + "</span>" +
      '<span class="vc-user-rankcard__pill">Weekly XP ' + esc(formatIntIt(weekly.weeklyExp || 0)) + "</span>" +
      '<span class="vc-user-rankcard__pill">Moltiplicatore ' + esc(formatMult(multiplier)) + "</span>" +
      "</div></div>" +
      '<div class="vc-user-rankcard__rankbox">' + esc(rankText) + "<small>RANK</small></div>" +
      "</div></div></section>" +
      '<section class="vc-user-profile-block vc-user-profile-block--multiplier">' +
      '<details class="vc-user-profile-multiplier" open>' +
      '<summary class="vc-user-profile-multiplier__summary">' +
      '<span class="vc-user-profile-multiplier__head">' +
      '<span class="vc-user-profile-multiplier__title">Moltiplicatore EXP</span>' +
      '<span class="vc-user-profile-multiplier__sub">Da dove viene il bonus attivo</span>' +
      "</span>" +
      '<span class="vc-user-profile-multiplier__total">' + esc(formatMult(multiplier)) + "</span>" +
      "</summary>" +
      '<div class="vc-user-profile-multiplier__body">' + multiplierItemsHtml + "</div>" +
      "</details>" +
      "</section>" +
      '<section class="vc-user-profile-block vc-user-profile-block--roles">' +
      '<div class="vc-user-profile-block__head"><span class="vc-user-profile-block__title">Ruoli</span><span class="vc-user-profile-block__sub">' + esc(String(roles.length)) + " presenti</span></div>" +
      '<div class="vc-user-profile-roles">' + rolesHtml + "</div></section>" +
      "</section>";
  }

  function main() {
    var userId = parseProfileId();
    if (!userId) return;
    var root = byId("vc-user-profile-view");
    if (!root) return;
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
      var profile = null;
      var anyFailure = false;
      var hasAny = false;
      var i;

      for (i = 0; i < results.length; i += 1) {
        if (results[i] && results[i].profile && !profile) profile = results[i].profile;
        if (results[i] && !results[i].ok && !results[i].notFound) anyFailure = true;
      }

      hasAny =
        Boolean(level || weekly || messages || voice) &&
        ((level && Number(level.exp) > 0) ||
          (weekly && Number(weekly.weeklyExp) > 0) ||
          (messages && Number(messages.messagesTotal) > 0) ||
          (voice && Number(voice.voiceTotalSeconds) > 0));

      if (!hasAny) {
        if (anyFailure) {
          renderError(root);
          return;
        }
        renderEmpty(root, userId);
        return;
      }

      renderProfile(root, userId, {
        profile: profile || {},
        level: level || {},
        weekly: weekly || {},
        messages: messages || {},
        voice: voice || {},
      });
    });
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    currentViewer = ev && ev.detail ? ev.detail.user || null : null;
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
