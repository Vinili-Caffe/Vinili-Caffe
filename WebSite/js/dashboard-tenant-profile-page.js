(function () {
  "use strict";

  var OBJECTIVES_PER_PAGE = 3;
  var DEV_GUILDS_PER_PAGE = 15;
  var DEV_CREDITS_PER_PAGE = 15;
  var DEV_POLL_MS = 8000;

  var state = {
    data: null,
    tab: "home",
    objPage: 1,
    busy: false,
    botban: {
      loaded: false,
      loading: false,
      busy: false,
      filter: "all",
      kind: "user",
      draftId: "",
      draftNote: "",
      entries: [],
      users: 0,
      servers: 0,
    },
    dev: {
      loaded: false,
      loading: false,
      busy: false,
      busyGuildId: "",
      busyAction: "",
      panel: "guilds",
      q: "",
      page: 1,
      overview: null,
      guilds: [],
      events: [],
      pollTimer: null,
      eventsFingerprint: "",
      creditsUserId: "",
      creditsDelta: "10",
      creditsNote: "",
      creditsBusy: false,
      creditsList: [],
      creditsTotal: 0,
      creditsPage: 1,
      creditsPages: 1,
      creditsFrom: 0,
      creditsTo: 0,
      creditsListLoading: false,
      creditsListLoaded: false,
    },
  };

  function isBotDev() {
    return Boolean(state.data && state.data.isBotDev);
  }

  function syncDevNavVisibility() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-tprof-dev-only]"), function (btn) {
      btn.hidden = !isBotDev();
    });
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function i18n(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function apiBase() {
    var isLocal = false;
    try {
      isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    } catch (e0) {}
    var d = window.__VC_SITE_DASHBOARD || {};
    var raw = String(isLocal && d.apiUrlLocal ? d.apiUrlLocal : d.apiUrl || "").trim();
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function getToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        return String(window.__vcDiscordGetAccessToken() || "").trim();
      }
    } catch (e) {}
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (e2) {
      return "";
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function emojiHtml(emoji, size) {
    var s = size || 22;
    if (!emoji) return "";
    if (emoji.kind === "custom" && emoji.url) {
      return (
        '<img class="vc-tprof-emoji" src="' +
        esc(emoji.url) +
        '" alt="" width="' +
        s +
        '" height="' +
        s +
        '" loading="lazy" decoding="async" />'
      );
    }
    return '<span class="vc-tprof-emoji-text" style="font-size:' + s + 'px">' + esc(emoji.text || "") + "</span>";
  }

  var statusTimer = null;
  var STATUS_AUTO_MS = 6000;

  function clearStatusTimer() {
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
  }

  function setStatus(msg, isError, opts) {
    var el = byId("vc-dash-profile-status");
    if (!el) return;
    clearStatusTimer();
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-error", "is-ok");
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle("is-error", Boolean(isError));
    el.classList.toggle("is-ok", Boolean(opts && opts.ok) && !isError);
    try {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e0) {}
    if (!(opts && opts.sticky)) {
      statusTimer = setTimeout(function () {
        statusTimer = null;
        setStatus("");
      }, Number(opts && opts.ms) || STATUS_AUTO_MS);
    }
  }

  function notifyDevResult(ok, title, message) {
    setStatus(message, !ok, { ok: ok, ms: 10000 });
    if (window.VcDialog && typeof window.VcDialog.alert === "function") {
      return window.VcDialog.alert({
        title: title,
        message: message,
        okLabel: i18n("dashProf.dev.ok", "OK"),
        danger: !ok,
        icon: ok ? "fa-check-circle" : "fa-exclamation-triangle",
      });
    }
    return Promise.resolve();
  }

  async function api(method, path, body) {
    var token = getToken();
    if (!token) throw new Error("missing_token");
    var opts = {
      method: method || "GET",
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    };
    if (body != null) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    var res;
    try {
      res = await fetch(apiBase() + path, opts);
    } catch (netErr) {
      var net = new Error("network_error");
      net.cause = netErr;
      throw net;
    }
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !data.ok) {
      var msg = data.message || data.error || "";
      if (!msg) {
        if (res.status === 401) msg = "Sessione scaduta: effettua di nuovo il login.";
        else if (res.status === 403) msg = "Accesso negato.";
        else if (res.status === 502 || res.status === 503 || res.status === 504) {
          msg = "API non disponibile (HTTP " + res.status + "). Riprova tra poco.";
        } else msg = "request_failed" + (res.status ? " (" + res.status + ")" : "");
      }
      var err = new Error(msg);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  function paginate(items, page, perPage) {
    var list = Array.isArray(items) ? items : [];
    var totalPages = Math.max(1, Math.ceil(list.length / perPage));
    var safe = Math.min(Math.max(1, page || 1), totalPages);
    var start = (safe - 1) * perPage;
    return { page: safe, totalPages: totalPages, slice: list.slice(start, start + perPage), total: list.length };
  }

  function renderPager(page, totalPages, attr) {
    if (totalPages <= 1) return "";
    return (
      '<div class="vc-tprof-pager">' +
      '<button type="button" class="vc-tprof-pager__btn" data-' +
      attr +
      '="' +
      Math.max(1, page - 1) +
      '"' +
      (page <= 1 ? " disabled" : "") +
      ' aria-label="Precedente"><i class="fa fa-chevron-left" aria-hidden="true"></i></button>' +
      '<span class="vc-tprof-pager__label">' +
      esc(page + " / " + totalPages) +
      "</span>" +
      '<button type="button" class="vc-tprof-pager__btn" data-' +
      attr +
      '="' +
      Math.min(totalPages, page + 1) +
      '"' +
      (page >= totalPages ? " disabled" : "") +
      ' aria-label="Successiva"><i class="fa fa-chevron-right" aria-hidden="true"></i></button>' +
      "</div>"
    );
  }

  function renderHome(data) {
    var u = data.user || {};
    var scores = data.scores || {};
    var selected = (data.badges || []).filter(function (b) {
      return b.selected;
    });
    var badgesHtml = selected.length
      ? selected
          .map(function (b) {
            return emojiHtml(b.emoji, 22);
          })
          .join("")
      : '<span class="vc-tprof-stat__empty">—</span>';

    var avatar = u.avatarUrl
      ? '<div class="vc-tprof-thumb-wrap">' +
        '<img class="vc-tprof-thumb" src="' +
        esc(u.avatarUrl) +
        '" alt="" width="72" height="72" loading="eager" decoding="async" onerror="this.remove();this.parentNode.classList.add(\'is-fallback\')" />' +
        '<span class="vc-tprof-thumb vc-tprof-thumb--fb" aria-hidden="true"><i class="fa fa-user"></i></span>' +
        "</div>"
      : '<span class="vc-tprof-thumb vc-tprof-thumb--fb" aria-hidden="true"><i class="fa fa-user"></i></span>';

    function stat(label, valueHtml) {
      return (
        '<div class="vc-tprof-stat"><span class="vc-tprof-stat__label">' +
        esc(label) +
        '</span><strong class="vc-tprof-stat__value">' +
        valueHtml +
        "</strong></div>"
      );
    }

    return (
      '<article class="vc-tprof-panel">' +
      '<div class="vc-tprof-panel__accent" aria-hidden="true"></div>' +
      '<div class="vc-tprof-panel__body">' +
      '<div class="vc-tprof-identity">' +
      avatar +
      '<div class="vc-tprof-identity__text">' +
      '<p class="vc-tprof-identity__name">@' +
      esc(u.username || "utente") +
      "</p>" +
      '<p class="vc-tprof-identity__id"><span data-i18n-skip>ID</span> <code>' +
      esc(u.id || "") +
      "</code></p>" +
      "</div></div>" +
      '<div class="vc-tprof-stats">' +
      stat(i18n("dashProf.statAlerts", "Alert"), esc(data.alerts || 0)) +
      stat(i18n("dashProf.statAwards", "Awards"), esc((data.awardsPercent || 0) + "%")) +
      '<div class="vc-tprof-stat"><span class="vc-tprof-stat__label">' +
      esc(i18n("dashProf.statBadges", "Badge")) +
      '</span><strong class="vc-tprof-stat__value vc-tprof-stat__value--badges">' +
      badgesHtml +
      "</strong></div>" +
      stat(i18n("dashProf.statTotal", "Totali"), esc(scores.total || 0)) +
      stat(i18n("dashProf.statToday", "Oggi"), esc(scores.daily || 0)) +
      stat(i18n("dashProf.statWeek", "Settimana"), esc(scores.weekly || 0)) +
      "</div></div></article>"
    );
  }

  function renderObjectives(data) {
    var rows = data.objectives || [];
    if (!rows.length) {
      return (
        '<article class="vc-tprof-panel"><div class="vc-tprof-panel__accent" aria-hidden="true"></div><div class="vc-tprof-panel__body"><p class="vc-tprof-empty">' +
        esc(i18n("dashProf.objectivesEmpty", "Nessun obiettivo disponibile.")) +
        "</p></div></article>"
      );
    }
    var pageData = paginate(rows, state.objPage, OBJECTIVES_PER_PAGE);
    state.objPage = pageData.page;
    var done = rows.filter(function (r) {
      return r.done;
    }).length;
    return (
      '<article class="vc-tprof-panel">' +
      '<div class="vc-tprof-panel__accent" aria-hidden="true"></div>' +
      '<div class="vc-tprof-panel__body">' +
      '<header class="vc-tprof-section-head">' +
      "<div><h2>" +
      esc(i18n("dashProf.tabObjectives", "Obiettivi")) +
      "</h2><p>" +
      esc(done + " / " + rows.length + " completati") +
      "</p></div>" +
      renderPager(pageData.page, pageData.totalPages, "tprof-obj-page") +
      "</header>" +
      '<div class="vc-tprof-obj-list">' +
      pageData.slice
        .map(function (row) {
          var pct = row.target ? Math.min(100, Math.round((row.current / row.target) * 100)) : row.done ? 100 : 0;
          return (
            '<div class="vc-tprof-obj' +
            (row.done ? " is-done" : "") +
            '">' +
            '<div class="vc-tprof-obj__ico">' +
            emojiHtml(row.emoji, 28) +
            "</div>" +
            '<div class="vc-tprof-obj__main"><strong>' +
            esc(row.title) +
            "</strong><p>" +
            esc(row.desc) +
            '</p><div class="vc-tprof-obj__bar" aria-hidden="true"><span style="width:' +
            pct +
            '%"></span></div><span class="vc-tprof-obj__meta">' +
            esc(row.current + " / " + row.target) +
            (row.done ? " · fatto" : "") +
            "</span></div></div>"
          );
        })
        .join("") +
      "</div></div></article>"
    );
  }

  function renderBadges(data) {
    var selected = (data.prefs && data.prefs.selectedBadges) || [];
    var slots = [0, 1]
      .map(function (slot) {
        var id = selected[slot];
        var badge = id
          ? (data.badges || []).find(function (b) {
              return b.id === id;
            })
          : null;
        if (!badge) {
          return '<span class="vc-tprof-slot is-empty" aria-hidden="true">—</span>';
        }
        return (
          '<button type="button" class="vc-tprof-slot" data-tprof-remove-slot="' +
          slot +
          '" title="' +
          esc(i18n("dashProf.removeBadge", "Rimuovi badge")) +
          '">' +
          emojiHtml(badge.emoji, 26) +
          "</button>"
        );
      })
      .join("");

    var unlocked = (data.badges || []).filter(function (b) {
      return b.unlocked;
    });
    var locked = (data.badges || []).filter(function (b) {
      return !b.unlocked;
    });

    function badgeBtn(b) {
      return (
        '<button type="button" class="vc-tprof-badge' +
        (b.unlocked ? "" : " is-locked") +
        (b.selected ? " is-selected" : "") +
        '" data-tprof-toggle-badge="' +
        esc(b.id) +
        '" ' +
        (b.unlocked ? "" : "disabled ") +
        'title="' +
        esc(b.title || b.id) +
        '">' +
        emojiHtml(b.emoji, 28) +
        "</button>"
      );
    }

    return (
      '<article class="vc-tprof-panel">' +
      '<div class="vc-tprof-panel__accent" aria-hidden="true"></div>' +
      '<div class="vc-tprof-panel__body">' +
      '<header class="vc-tprof-section-head"><div><h2>' +
      esc(i18n("dashProf.tabBadges", "Badge")) +
      "</h2><p>" +
      esc(i18n("dashProf.badgesHint", "Fino a 2 badge da mostrare nel profilo.")) +
      "</p></div></header>" +
      '<div class="vc-tprof-slots">' +
      slots +
      "</div>" +
      (unlocked.length
        ? '<p class="vc-tprof-sub">Sbloccati</p><div class="vc-tprof-badge-grid">' +
          unlocked.map(badgeBtn).join("") +
          "</div>"
        : "") +
      (locked.length
        ? '<p class="vc-tprof-sub">Bloccati</p><div class="vc-tprof-badge-grid">' +
          locked.map(badgeBtn).join("") +
          "</div>"
        : "") +
      "</div></article>"
    );
  }

  function langFlagIso(code) {
    var map = {
      it: "it",
      en: "gb",
      es: "es",
      fr: "fr",
      de: "de",
      pt: "br",
      ru: "ru",
      zh: "cn",
      ja: "jp",
      ko: "kr",
      ar: "sa",
      nl: "nl",
      pl: "pl",
      tr: "tr",
      hi: "in",
      id: "id",
      uk: "ua",
      vi: "vn",
      ro: "ro",
      sv: "se",
    };
    var key = String(code || "")
      .trim()
      .toLowerCase();
    return map[key] || key.slice(0, 2);
  }

  function formatBotbanDate(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }

  function filteredBotbanEntries() {
    var rows = Array.isArray(state.botban.entries) ? state.botban.entries : [];
    if (state.botban.filter === "users") {
      return rows.filter(function (r) {
        return r.type === "user";
      });
    }
    if (state.botban.filter === "servers") {
      return rows.filter(function (r) {
        return r.type === "guild";
      });
    }
    return rows;
  }

  function applyBotbanPayload(data) {
    state.botban.entries = Array.isArray(data && data.entries) ? data.entries : [];
    state.botban.users = Number(data && data.users) || 0;
    state.botban.servers = Number(data && data.servers) || 0;
    state.botban.loaded = true;
  }

  async function loadBotban(opts) {
    opts = opts || {};
    if (state.botban.loading) return;
    state.botban.loading = true;
    if (!opts.silent && state.tab === "blacklist") render();
    try {
      var data = await api("GET", "/botban?kind=all");
      applyBotbanPayload(data);
      if (!opts.silent) setStatus("");
    } catch (e) {
      if (!opts.silent) {
        setStatus(e.message || i18n("dashProf.bl.errLoad", "Impossibile caricare la blacklist."), true);
      }
    } finally {
      state.botban.loading = false;
      if (state.tab === "blacklist") render();
    }
  }

  function syncBotbanDraftFromDom() {
    var idEl = byId("tprof-bl-id");
    var noteEl = byId("tprof-bl-note");
    if (idEl) state.botban.draftId = String(idEl.value || "");
    if (noteEl) state.botban.draftNote = String(noteEl.value || "");
  }

  async function addBotban() {
    if (state.botban.busy) return;
    syncBotbanDraftFromDom();
    var kind = state.botban.kind === "guild" ? "guild" : "user";
    var id = String(state.botban.draftId || "").trim();
    var note = String(state.botban.draftNote || "").trim();
    if (!id) {
      setStatus(i18n("dashProf.bl.needId", "Inserisci un ID Discord valido."), true);
      return;
    }
    state.botban.busy = true;
    render();
    try {
      var data = await api("POST", "/botban", {
        kind: kind,
        id: id,
        note: note,
        leave: kind === "guild",
      });
      applyBotbanPayload(data);
      state.botban.draftId = "";
      state.botban.draftNote = "";
      setStatus(
        kind === "guild"
          ? i18n("dashProf.bl.addedGuild", "Server aggiunto alla blacklist (il bot esce se presente).")
          : i18n("dashProf.bl.addedUser", "Utente aggiunto alla blacklist."),
        false,
      );
    } catch (e) {
      setStatus(e.message || i18n("dashProf.bl.errSave", "Operazione blacklist non riuscita."), true);
    } finally {
      state.botban.busy = false;
      if (state.tab === "blacklist") render();
    }
  }

  async function removeBotban(kind, id) {
    if (state.botban.busy || !kind || !id) return;
    state.botban.busy = true;
    render();
    try {
      var data = await api("DELETE", "/botban/" + encodeURIComponent(kind) + "/" + encodeURIComponent(id));
      applyBotbanPayload(data);
      setStatus(i18n("dashProf.bl.removed", "Voce rimossa dalla blacklist."), false);
    } catch (e) {
      setStatus(e.message || i18n("dashProf.bl.errSave", "Operazione blacklist non riuscita."), true);
    } finally {
      state.botban.busy = false;
      if (state.tab === "blacklist") render();
    }
  }

  function formatDevDate(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return "";
      return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e0) {
      return "";
    }
  }

  function eventTypeLabel(type) {
    var t = String(type || "").trim().toLowerCase();
    var key = "dashProf.dev.evt." + t;
    var fallback = {
      join: "Aggiunto",
      leave: "Rimosso",
      kick: "Kick",
      botban_leave: "BL + uscita",
      reset: "Reset",
      manual_leave: "Uscita manuale",
    };
    return i18n(key, fallback[t] || t || "?");
  }

  function fingerprintDevSnapshot(overview, guilds, events) {
    var ov = overview || {};
    var g0 = Array.isArray(guilds) && guilds[0] ? guilds[0] : null;
    var e0 = Array.isArray(events) && events[0] ? events[0] : null;
    return [
      String(ov.guildCount != null ? ov.guildCount : ""),
      String(ov.registryCount != null ? ov.registryCount : ""),
      String(ov.blacklistUsers != null ? ov.blacklistUsers : ""),
      String(ov.blacklistGuilds != null ? ov.blacklistGuilds : ""),
      String(Array.isArray(guilds) ? guilds.length : 0),
      String((g0 && (g0.id || g0.guildId)) || ""),
      String(Array.isArray(events) ? events.length : 0),
      String((e0 && (e0.id || e0.at || e0.createdAt || e0.type)) || ""),
      String((e0 && (e0.guildId || e0.guildName || "")) || ""),
    ].join("|");
  }

  function stopDevPoll() {
    if (state.dev.pollTimer) {
      clearInterval(state.dev.pollTimer);
      state.dev.pollTimer = null;
    }
  }

  function startDevPoll() {
    stopDevPoll();
    if (!isBotDev()) return;
    state.dev.pollTimer = setInterval(function () {
      if (state.tab !== "dev") {
        stopDevPoll();
        return;
      }
      if (typeof document !== "undefined" && document.hidden) return;
      if (state.dev.loading || state.dev.busy) return;
      loadDev({ silent: true, poll: true });
    }, DEV_POLL_MS);
  }

  async function loadDev(opts) {
    opts = opts || {};
    if (!isBotDev()) return;
    if (state.dev.loading) return;
    state.dev.loading = true;
    if (!opts.silent && state.tab === "dev") render();
    var shouldRender = false;
    try {
      var results = await Promise.all([
        api("GET", "/dev/overview"),
        api("GET", "/dev/guilds?limit=500"),
        api("GET", "/dev/events?limit=80"),
      ]);
      var nextOverview = results[0] || null;
      var nextGuilds = Array.isArray(results[1] && results[1].guilds) ? results[1].guilds : [];
      var nextEvents = Array.isArray(results[2] && results[2].events) ? results[2].events : [];
      var nextFp = fingerprintDevSnapshot(nextOverview, nextGuilds, nextEvents);
      var changed = nextFp !== state.dev.eventsFingerprint;
      state.dev.overview = nextOverview;
      state.dev.guilds = nextGuilds;
      state.dev.events = nextEvents;
      state.dev.eventsFingerprint = nextFp;
      if (!opts.silent) state.dev.page = 1;
      state.dev.loaded = true;
      shouldRender = state.tab === "dev" && (!opts.silent || changed || !opts.poll);
    } catch (e) {
      if (!opts.silent) {
        setStatus(e.message || i18n("dashProf.dev.errLoad", "Impossibile caricare il pannello Dev."), true);
        shouldRender = state.tab === "dev";
      }
    } finally {
      state.dev.loading = false;
      if (shouldRender) render();
    }
  }

  function filteredDevGuilds() {
    var rows = Array.isArray(state.dev.guilds) ? state.dev.guilds : [];
    var q = String(state.dev.q || "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(function (g) {
      var hay =
        String(g.name || "") +
        " " +
        String(g.id || "") +
        " " +
        String(g.ownerId || "");
      return hay.toLowerCase().indexOf(q) !== -1;
    });
  }

  function pagedDevGuilds() {
    var rows = filteredDevGuilds();
    var pages = Math.max(1, Math.ceil(rows.length / DEV_GUILDS_PER_PAGE) || 1);
    var page = Math.min(Math.max(1, Math.floor(Number(state.dev.page) || 1)), pages);
    state.dev.page = page;
    var start = (page - 1) * DEV_GUILDS_PER_PAGE;
    return {
      rows: rows.slice(start, start + DEV_GUILDS_PER_PAGE),
      total: rows.length,
      page: page,
      pages: pages,
      from: rows.length ? start + 1 : 0,
      to: Math.min(start + DEV_GUILDS_PER_PAGE, rows.length),
    };
  }

  var devSearchTimer = null;

  function scheduleDevSearchFilter(raw) {
    state.dev.q = String(raw || "");
    state.dev.page = 1;
    if (devSearchTimer) clearTimeout(devSearchTimer);
    devSearchTimer = setTimeout(function () {
      devSearchTimer = null;
      if (state.tab !== "dev") return;
      var active = document.activeElement;
      var keepFocus = active && active.getAttribute && active.getAttribute("data-tprof-dev-q") != null;
      var selStart = keepFocus && typeof active.selectionStart === "number" ? active.selectionStart : null;
      var selEnd = keepFocus && typeof active.selectionEnd === "number" ? active.selectionEnd : null;
      render();
      if (!keepFocus) return;
      var next = document.querySelector("[data-tprof-dev-q]");
      if (!next) return;
      next.focus();
      if (selStart != null && typeof next.setSelectionRange === "function") {
        try {
          next.setSelectionRange(selStart, selEnd == null ? selStart : selEnd);
        } catch (e0) {}
      }
    }, 120);
  }

  async function confirmDevAction(action) {
    if (action === "revokePremium") {
      if (window.VcDialog && typeof window.VcDialog.choose === "function") {
        return window.VcDialog.choose({
          title: i18n("dashProf.dev.confirmRevokePremiumTitle", "Revocare Premium?"),
          message: i18n(
            "dashProf.dev.confirmRevokePremium",
            "Revoca Premium su questo server (look default, snapshot salvato). Vuoi anche riaccreditare i crediti dell’ultima attivazione, o solo revocare?",
          ),
          cancelLabel: i18n("dashProf.dev.cancel", "Annulla"),
          icon: "fa-diamond",
          choices: [
            {
              id: "revoke",
              label: i18n("dashProf.dev.revokeOnly", "Solo revoca"),
              danger: true,
            },
            {
              id: "revoke_refund",
              label: i18n("dashProf.dev.revokeRefund", "Revoca + riaccredita crediti"),
              danger: true,
            },
          ],
        });
      }
      var legacy = window.confirm(
        i18n(
          "dashProf.dev.confirmRevokePremiumLegacy",
          "Revocare Premium? OK = solo revoca. Per riaccreditare i crediti usa il pannello Crediti.",
        ),
      );
      return legacy ? "revoke" : null;
    }
    var meta = {
      leave: {
        title: i18n("dashProf.dev.confirmLeaveTitle", "Uscire dal server?"),
        message: i18n("dashProf.dev.confirmLeave", "Il bot uscirà da questo server. Continuare?"),
        confirmLabel: i18n("dashProf.dev.leave", "Esci"),
        danger: false,
        icon: "fa-sign-out",
      },
      botban: {
        title: i18n("dashProf.dev.confirmBotbanTitle", "Blacklist server?"),
        message: i18n(
          "dashProf.dev.confirmBotban",
          "Blacklist del server + uscita del bot. Continuare?",
        ),
        confirmLabel: i18n("dashProf.dev.botban", "BL server"),
        danger: true,
        icon: "fa-ban",
      },
      ownerBan: {
        title: i18n("dashProf.dev.confirmOwnerBanTitle", "Blacklist owner?"),
        message: i18n(
          "dashProf.dev.confirmOwnerBan",
          "Blacklist dell’owner di questo server. Continuare?",
        ),
        confirmLabel: i18n("dashProf.dev.ownerBan", "BL owner"),
        danger: true,
        icon: "fa-user-times",
      },
      reset: {
        title: i18n("dashProf.dev.confirmResetTitle", "Reset dati server?"),
        message: i18n(
          "dashProf.dev.confirmReset",
          "Reset dei dati tenant di questo server. Il bot resta nel server. Irreversibile. Continuare?",
        ),
        confirmLabel: i18n("dashProf.dev.reset", "Reset dati"),
        danger: true,
        icon: "fa-exclamation-triangle",
      },
    };
    var cfg = meta[action];
    if (!cfg) return true;
    if (window.VcDialog && typeof window.VcDialog.confirm === "function") {
      return window.VcDialog.confirm({
        title: cfg.title,
        message: cfg.message,
        confirmLabel: cfg.confirmLabel,
        cancelLabel: i18n("dashProf.dev.cancel", "Annulla"),
        danger: cfg.danger,
        icon: cfg.icon,
      });
    }
    return window.confirm(cfg.message);
  }

  function syncDevCreditsDraftFromDom() {
    var userEl = document.querySelector("[data-tprof-dev-credits-user]");
    var deltaEl = document.querySelector("[data-tprof-dev-credits-delta]");
    var noteEl = document.querySelector("[data-tprof-dev-credits-note]");
    if (userEl) state.dev.creditsUserId = String(userEl.value || "").trim();
    if (deltaEl) state.dev.creditsDelta = String(deltaEl.value || "").trim();
    if (noteEl) state.dev.creditsNote = String(noteEl.value || "").trim();
  }

  async function loadDevCreditsList(opts) {
    opts = opts || {};
    if (!isBotDev()) return;
    if (state.dev.creditsListLoading) return;
    state.dev.creditsListLoading = true;
    if (!opts.silent && state.tab === "dev" && state.dev.panel === "credits") render();
    try {
      var page = Math.max(1, Math.floor(Number(state.dev.creditsPage) || 1));
      var out = await api(
        "GET",
        "/dev/credits?page=" +
          encodeURIComponent(String(page)) +
          "&limit=" +
          encodeURIComponent(String(DEV_CREDITS_PER_PAGE)),
      );
      state.dev.creditsList = Array.isArray(out.users) ? out.users : [];
      state.dev.creditsTotal = Number(out.total) || 0;
      state.dev.creditsPage = Number(out.page) || page;
      state.dev.creditsPages = Number(out.pages) || 1;
      state.dev.creditsFrom = Number(out.from) || 0;
      state.dev.creditsTo = Number(out.to) || 0;
      state.dev.creditsListLoaded = true;
      if (state.tab === "dev" && state.dev.panel === "credits" && (!opts.silent || !opts.poll)) render();
    } catch (e) {
      if (!opts.silent) {
        setStatus(e.message || i18n("dashProf.dev.creditsErr", "Operazione crediti non riuscita."), true);
        if (state.tab === "dev" && state.dev.panel === "credits") render();
      }
    } finally {
      state.dev.creditsListLoading = false;
    }
  }

  async function applyDevCredits() {
    if (state.dev.creditsBusy) return;
    syncDevCreditsDraftFromDom();
    var userId = String(state.dev.creditsUserId || "").trim();
    var delta = Math.floor(Number(state.dev.creditsDelta));
    if (!/^\d{16,22}$/.test(userId)) {
      setStatus(i18n("dashProf.dev.creditsBadUser", "Inserisci un ID utente Discord valido."), true);
      return;
    }
    if (!Number.isFinite(delta) || delta === 0) {
      setStatus(i18n("dashProf.dev.creditsBadDelta", "Inserisci un delta diverso da zero."), true);
      return;
    }
    state.dev.creditsBusy = true;
    setStatus("");
    render();
    try {
      await api("POST", "/dev/credits", {
        userId: userId,
        delta: delta,
        note: String(state.dev.creditsNote || "").trim() || undefined,
      });
      await loadDevCreditsList({ silent: true });
      try {
        if (window.VcDashCredits && typeof window.VcDashCredits.refresh === "function") {
          await window.VcDashCredits.refresh();
        } else {
          window.dispatchEvent(new CustomEvent("vc:credits-changed"));
        }
      } catch (eChip) {}
      if (state.tab === "dev" && state.dev.panel === "credits") render();
    } catch (e) {
      setStatus(e.message || i18n("dashProf.dev.creditsErr", "Operazione crediti non riuscita."), true);
    } finally {
      state.dev.creditsBusy = false;
      if (state.tab === "dev") render();
    }
  }

  async function runDevAction(action, guildId) {
    if (!isBotDev() || state.dev.busy || !guildId) return;
    var confirmed = await confirmDevAction(action);
    if (!confirmed) return;

    var paths = {
      leave: "/dev/leave",
      botban: "/dev/guild-botban",
      ownerBan: "/dev/owner-botban",
      reset: "/dev/reset-guild",
      revokePremium: "/dev/revoke-premium",
    };
    var path = paths[action];
    if (!path) return;

    var guildRow =
      (Array.isArray(state.dev.guilds) ? state.dev.guilds : []).find(function (g) {
        return String(g.id || "") === String(guildId);
      }) || null;
    var guildName = guildRow && guildRow.name ? String(guildRow.name) : String(guildId);

    var body = { guildId: guildId };
    if (action === "botban") body.leave = true;
    if (action === "revokePremium") {
      body.refundCredits = confirmed === "revoke_refund";
    }

    state.dev.busy = true;
    state.dev.busyGuildId = String(guildId);
    state.dev.busyAction = action;
    setStatus(i18n("dashProf.dev.working", "Operazione in corso…"), false, { sticky: true });
    if (state.tab === "dev") render();
    try {
      var data = await api("POST", path, body);
      var removesFromList = action === "leave" || action === "botban";
      if (removesFromList) {
        state.dev.guilds = (Array.isArray(state.dev.guilds) ? state.dev.guilds : []).filter(function (g) {
          return String(g.id || "") !== String(guildId);
        });
        if (state.dev.overview && typeof state.dev.overview === "object") {
          var nextCount = Math.max(0, (Number(state.dev.overview.guildCount) || 0) - 1);
          state.dev.overview.guildCount = nextCount;
          if (action === "botban") {
            state.dev.overview.blacklistGuilds = (Number(state.dev.overview.blacklistGuilds) || 0) + 1;
          }
        }
      }
      if (action === "ownerBan" && state.dev.overview) {
        state.dev.overview.blacklistUsers = (Number(state.dev.overview.blacklistUsers) || 0) + 1;
      }
      if (action === "revokePremium" && guildRow) {
        guildRow.premiumActive = false;
      }

      var doneTitle = i18n("dashProf.dev.doneTitle", "Operazione completata");
      var doneMsg =
        (data && data.message) ||
        i18n("dashProf.dev.done", "Operazione completata su {name}.").replace("{name}", guildName);
      await notifyDevResult(true, doneTitle, doneMsg);
      await loadDev({ silent: true });
      if (action === "revokePremium" && body.refundCredits) {
        await loadDevCreditsList({ silent: true }).catch(function () {});
      }
    } catch (e) {
      await notifyDevResult(
        false,
        i18n("dashProf.dev.errTitle", "Operazione non riuscita"),
        e.message || i18n("dashProf.dev.errAction", "Operazione Dev non riuscita."),
      );
    } finally {
      state.dev.busy = false;
      state.dev.busyGuildId = "";
      state.dev.busyAction = "";
      if (state.tab === "dev") render();
    }
  }

  function renderDev() {
    var ov = state.dev.overview || {};
    var loading = state.dev.loading && !state.dev.loaded;
    var panel =
      state.dev.panel === "events" ? "events" : state.dev.panel === "credits" ? "credits" : "guilds";
    var busy = state.dev.busy || state.dev.creditsBusy;

    function panelBtn(id, label, icon) {
      return (
        '<button type="button" class="vc-tprof-bl-seg__btn' +
        (panel === id ? " is-active" : "") +
        '" data-tprof-dev-panel="' +
        id +
        '"><i class="fa ' +
        icon +
        '" aria-hidden="true"></i><span>' +
        esc(label) +
        "</span></button>"
      );
    }

    var statsHtml =
      '<div class="vc-tprof-dev-stats" role="group">' +
      [
        [i18n("dashProf.dev.statGuilds", "Server bot"), ov.guildCount],
        [i18n("dashProf.dev.statRegistry", "Registry"), ov.registryCount],
        [i18n("dashProf.dev.statBlUsers", "BL utenti"), ov.blacklistUsers],
        [i18n("dashProf.dev.statBlGuilds", "BL server"), ov.blacklistGuilds],
      ]
        .map(function (row) {
          return (
            '<div class="vc-tprof-dev-stat"><span>' +
            esc(row[0]) +
            "</span><strong>" +
            esc(String(row[1] == null ? "—" : row[1])) +
            "</strong></div>"
          );
        })
        .join("") +
      "</div>";

    var bodyHtml = "";
    if (loading) {
      bodyHtml =
        '<p class="vc-dash-bl__empty">' + esc(i18n("dashProf.dev.loading", "Caricamento pannello Dev…")) + "</p>";
    } else if (panel === "events") {
      var events = Array.isArray(state.dev.events) ? state.dev.events : [];
      if (!events.length) {
        bodyHtml =
          '<p class="vc-dash-bl__empty">' +
          esc(i18n("dashProf.dev.emptyEvents", "Nessun evento ancora. Join e leave verranno registrati da ora.")) +
          "</p>";
      } else {
        bodyHtml =
          '<div class="vc-tprof-dev-events">' +
          events
            .map(function (ev) {
              var name = String(ev.guildName || "").trim() || String(ev.guildId || "");
              var when = formatDevDate(ev.at);
              var meta = [];
              meta.push('<code class="vc-dash-bl__id">' + esc(String(ev.guildId || "")) + "</code>");
              if (when) meta.push(esc(when));
              if (ev.ownerId) {
                meta.push(esc(i18n("dashProf.dev.owner", "Owner")) + " <code>" + esc(String(ev.ownerId)) + "</code>");
              }
              if (ev.actorId) meta.push("dev <code>" + esc(String(ev.actorId)) + "</code>");
              return (
                '<article class="vc-tprof-dev-event">' +
                '<span class="vc-tprof-dev-event__type vc-tprof-dev-event__type--' +
                esc(String(ev.type || "leave")) +
                '">' +
                esc(eventTypeLabel(ev.type)) +
                "</span>" +
                '<div class="vc-tprof-dev-event__body"><strong>' +
                esc(name) +
                '</strong><p class="vc-dash-bl__meta">' +
                meta.join(" · ") +
                "</p>" +
                (ev.note ? '<p class="vc-dash-bl__note">' + esc(String(ev.note)) + "</p>" : "") +
                "</div></article>"
              );
            })
            .join("") +
          "</div>";
      }
    } else if (panel === "credits") {
      var creditsBusy = Boolean(state.dev.creditsBusy);
      var listLoading = state.dev.creditsListLoading && !state.dev.creditsListLoaded;
      var holders = Array.isArray(state.dev.creditsList) ? state.dev.creditsList : [];
      bodyHtml =
        '<form class="vc-tprof-dev-credits" data-tprof-dev-credits-form>' +
        '<label class="vc-tprof-bl-field"><span>' +
        esc(i18n("dashProf.dev.creditsUser", "ID utente Discord")) +
        '</span><input type="text" data-tprof-dev-credits-user inputmode="numeric" autocomplete="off" spellcheck="false" value="' +
        esc(state.dev.creditsUserId || "") +
        '" placeholder="123456789012345678"' +
        (busy ? " disabled" : "") +
        " /></label>" +
        '<label class="vc-tprof-bl-field"><span>' +
        esc(i18n("dashProf.dev.creditsDelta", "Delta crediti (+/−)")) +
        '</span><input type="text" data-tprof-dev-credits-delta inputmode="numeric" autocomplete="off" spellcheck="false" value="' +
        esc(state.dev.creditsDelta || "10") +
        '" placeholder="+10 / −5"' +
        (busy ? " disabled" : "") +
        " /></label>" +
        '<label class="vc-tprof-bl-field"><span>' +
        esc(i18n("dashProf.dev.creditsNote", "Nota (opzionale)")) +
        '</span><input type="text" data-tprof-dev-credits-note maxlength="300" value="' +
        esc(state.dev.creditsNote || "") +
        '" placeholder="' +
        esc(i18n("dashProf.dev.creditsNotePh", "Es. PayPal ticket #…")) +
        '"' +
        (busy ? " disabled" : "") +
        " /></label>" +
        '<div class="vc-tprof-dev-credits__actions">' +
        '<button type="submit" class="vc-dashboard-btn vc-dashboard-btn--primary" data-tprof-dev-credits-apply' +
        (busy ? " disabled" : "") +
        "><i class=\"fa fa-money\" aria-hidden=\"true\"></i> " +
        esc(i18n("dashProf.dev.creditsApply", "Applica")) +
        "</button>" +
        "</div></form>" +
        '<div class="vc-tprof-dev-credits-list">' +
        '<div class="vc-tprof-dev-list-head">' +
        "<p class=\"vc-tprof-dev-sort-hint\">" +
        esc(i18n("dashProf.dev.creditsListTitle", "Utenti con crediti")) +
        "</p>" +
        (state.dev.creditsTotal
          ? '<p class="vc-tprof-dev-count">' +
            esc(
              i18n("dashProf.dev.pageMeta", "{from}–{to} di {total}")
                .replace("{from}", String(state.dev.creditsFrom || 0))
                .replace("{to}", String(state.dev.creditsTo || 0))
                .replace("{total}", String(state.dev.creditsTotal || 0)),
            ) +
            "</p>"
          : "") +
        "</div>";
      if (listLoading) {
        bodyHtml +=
          '<p class="vc-dash-bl__empty">' +
          esc(i18n("dashProf.dev.creditsListLoading", "Caricamento saldi…")) +
          "</p>";
      } else if (!holders.length) {
        bodyHtml +=
          '<p class="vc-dash-bl__empty">' +
          esc(i18n("dashProf.dev.creditsEmpty", "Nessun utente con crediti.")) +
          "</p>";
      } else {
        bodyHtml +=
          '<div class="vc-dash-bl__list">' +
          holders
            .map(function (row) {
              var id = String(row.userId || "");
              var name =
                String(row.displayName || "").trim() ||
                String(row.username || "").trim() ||
                id;
              var avatar = String(row.avatarUrl || "").trim();
              var iconHtml = avatar
                ? '<img class="vc-dash-bl__icon" src="' +
                  esc(avatar) +
                  '" alt="" width="40" height="40" loading="lazy" />'
                : '<span class="vc-dash-bl__icon vc-dash-bl__icon--fallback" aria-hidden="true"><i class="fa fa-user"></i></span>';
              var selected = String(state.dev.creditsUserId || "") === id;
              var meta = ['<code class="vc-dash-bl__id">' + esc(id) + "</code>"];
              if (row.updatedAt) {
                var when = formatDevDate(row.updatedAt);
                if (when) meta.push(esc(when));
              }
              return (
                '<button type="button" class="vc-dash-bl__row vc-tprof-dev-credits-row' +
                (selected ? " is-selected" : "") +
                '" data-tprof-dev-credits-pick="' +
                esc(id) +
                '"' +
                (creditsBusy ? " disabled" : "") +
                ">" +
                '<div class="vc-dash-bl__main">' +
                iconHtml +
                '<div class="vc-dash-bl__text"><strong>' +
                esc(name) +
                '</strong><p class="vc-dash-bl__meta">' +
                meta.join(" · ") +
                "</p></div></div>" +
                '<span class="vc-tprof-dev-credits-bal">' +
                esc(String(Number(row.credits) || 0)) +
                " " +
                esc(i18n("dashProf.dev.creditsUnit", "crediti")) +
                "</span></button>"
              );
            })
            .join("") +
          "</div>" +
          renderPager(state.dev.creditsPage, state.dev.creditsPages, "tprof-dev-credits-page");
      }
      bodyHtml += "</div>";
    } else {
      var pageData = pagedDevGuilds();
      var guilds = pageData.rows;
      bodyHtml =
        '<div class="vc-tprof-dev-search">' +
        '<label class="vc-tprof-bl-field"><span>' +
        esc(i18n("dashProf.dev.search", "Cerca server")) +
        '</span><input type="search" data-tprof-dev-q autocomplete="off" spellcheck="false" value="' +
        esc(state.dev.q || "") +
        '" placeholder="' +
        esc(i18n("dashProf.dev.searchPh", "Nome o ID…")) +
        '"' +
        (busy ? " disabled" : "") +
        " /></label></div>";
      if (!pageData.total) {
        bodyHtml +=
          '<p class="vc-dash-bl__empty">' + esc(i18n("dashProf.dev.emptyGuilds", "Nessun server trovato.")) + "</p>";
      } else {
        bodyHtml +=
          '<div class="vc-tprof-dev-list-head">' +
          '<p class="vc-tprof-dev-sort-hint">' +
          esc(i18n("dashProf.dev.sortJoin", "Ordinati per data di join (più recenti prima)")) +
          "</p>" +
          '<p class="vc-tprof-dev-count">' +
          esc(
            i18n("dashProf.dev.pageMeta", "{from}–{to} di {total}")
              .replace("{from}", String(pageData.from))
              .replace("{to}", String(pageData.to))
              .replace("{total}", String(pageData.total)),
          ) +
          "</p></div>" +
          '<div class="vc-dash-bl__list">' +
          guilds
            .map(function (g) {
              var id = String(g.id || "");
              var name = String(g.name || "").trim() || id;
              var icon = String(g.iconUrl || "").trim();
              var iconHtml = icon
                ? '<img class="vc-dash-bl__icon" src="' +
                  esc(icon) +
                  '" alt="" width="40" height="40" loading="lazy" />'
                : '<span class="vc-dash-bl__icon vc-dash-bl__icon--fallback" aria-hidden="true"><i class="fa fa-server"></i></span>';
              var meta = ['<code class="vc-dash-bl__id">' + esc(id) + "</code>"];
              if (g.joinedAt) {
                meta.push(
                  esc(i18n("dashProf.dev.joined", "Join")) +
                    " " +
                    esc(formatDevDate(g.joinedAt) || String(g.joinedAt)),
                );
              }
              if (g.memberCount) {
                meta.push(
                  esc(
                    i18n("dashProf.dev.members", "{n} membri").replace("{n}", String(g.memberCount)),
                  ),
                );
              }
              if (g.ownerId) {
                meta.push(esc(i18n("dashProf.dev.owner", "Owner")) + " <code>" + esc(String(g.ownerId)) + "</code>");
              }
              if (g.protected) meta.push(esc(i18n("dashProf.dev.protected", "Protetto")));
              if (g.premiumActive) meta.push(esc(i18n("dashProf.dev.premium", "Premium")));
              var rowBusy = busy && String(state.dev.busyGuildId || "") === id;
              if (rowBusy) meta.push(esc(i18n("dashProf.dev.working", "Operazione in corso…")));
              var disabled = busy || g.protected ? " disabled" : "";
              function actBtn(action, label, danger) {
                var thisBusy = rowBusy && state.dev.busyAction === action;
                return (
                  '<button type="button" class="vc-dashboard-btn vc-tprof-dev-act' +
                  (danger ? " vc-tprof-dev-act--danger" : "") +
                  (thisBusy ? " is-busy" : "") +
                  '" data-tprof-dev-act="' +
                  action +
                  '" data-tprof-dev-gid="' +
                  esc(id) +
                  '"' +
                  disabled +
                  ">" +
                  (thisBusy
                    ? '<span class="vc-ui-spinner vc-ui-spinner--sm" aria-hidden="true"></span> '
                    : "") +
                  esc(label) +
                  "</button>"
                );
              }
              var acts =
                actBtn("leave", i18n("dashProf.dev.leave", "Esci"), false) +
                actBtn("botban", i18n("dashProf.dev.botban", "BL server"), true) +
                actBtn("ownerBan", i18n("dashProf.dev.ownerBan", "BL owner"), true) +
                actBtn("reset", i18n("dashProf.dev.reset", "Reset dati"), true);
              if (g.premiumActive) {
                acts += actBtn(
                  "revokePremium",
                  i18n("dashProf.dev.revokePremium", "Revoca Premium"),
                  true,
                );
              }
              return (
                '<article class="vc-dash-bl__row vc-tprof-dev-guild' +
                (rowBusy ? " is-busy" : "") +
                '">' +
                '<div class="vc-dash-bl__main">' +
                iconHtml +
                '<div class="vc-dash-bl__text"><strong>' +
                esc(name) +
                '</strong><p class="vc-dash-bl__meta">' +
                meta.join(" · ") +
                "</p></div></div>" +
                '<div class="vc-tprof-dev-acts">' +
                acts +
                "</div></article>"
              );
            })
            .join("") +
          "</div>" +
          renderPager(pageData.page, pageData.pages, "tprof-dev-page");
      }
    }

    return (
      '<article class="vc-tprof-panel">' +
      '<div class="vc-tprof-panel__accent" aria-hidden="true"></div>' +
      '<div class="vc-tprof-panel__body">' +
      '<header class="vc-tprof-section-head"><div><h2>' +
      esc(i18n("dashProf.tabDev", "Dev")) +
      "</h2><p>" +
      esc(i18n("dashProf.dev.lead", "Pannello developer: server del bot, log join/leave e azioni operative.")) +
      (ov.botTag ? " · <code>" + esc(String(ov.botTag)) + "</code>" : "") +
      "</p></div>" +
      '<button type="button" class="vc-dashboard-btn vc-dash-bl__refresh" data-tprof-dev-refresh' +
      (state.dev.loading || busy ? " disabled" : "") +
      '><i class="fa fa-refresh" aria-hidden="true"></i><span>' +
      esc(i18n("dashProf.dev.refresh", "Aggiorna")) +
      "</span></button></header>" +
      statsHtml +
      '<div class="vc-tprof-bl-toolbar"><div class="vc-tprof-bl-seg" role="group">' +
      panelBtn("guilds", i18n("dashProf.dev.panelGuilds", "Server"), "fa-server") +
      panelBtn("events", i18n("dashProf.dev.panelEvents", "Log"), "fa-history") +
      panelBtn("credits", i18n("dashProf.dev.panelCredits", "Crediti"), "fa-money") +
      "</div></div>" +
      '<div class="vc-dash-bl__body">' +
      bodyHtml +
      "</div></div></article>"
    );
  }

  function renderBlacklist() {
    var rows = filteredBotbanEntries();
    var filter = state.botban.filter || "all";
    var kind = state.botban.kind === "guild" ? "guild" : "user";
    var loading = state.botban.loading && !state.botban.loaded;
    var countLabel = i18n("dashProf.bl.countAll", "{u} utenti · {s} server")
      .replace("{u}", String(state.botban.users || 0))
      .replace("{s}", String(state.botban.servers || 0));

    function filterBtn(id, label, icon) {
      return (
        '<button type="button" class="vc-tprof-bl-seg__btn' +
        (filter === id ? " is-active" : "") +
        '" data-tprof-bl-filter="' +
        id +
        '"><i class="fa ' +
        icon +
        '" aria-hidden="true"></i><span>' +
        esc(label) +
        "</span></button>"
      );
    }

    function kindBtn(id, label, icon) {
      return (
        '<button type="button" class="vc-tprof-bl-kind__btn' +
        (kind === id ? " is-active" : "") +
        '" data-tprof-bl-kind="' +
        id +
        '"' +
        (state.botban.busy ? " disabled" : "") +
        '><i class="fa ' +
        icon +
        '" aria-hidden="true"></i><span>' +
        esc(label) +
        "</span></button>"
      );
    }

    var listHtml = "";
    if (loading) {
      listHtml =
        '<p class="vc-dash-bl__empty">' + esc(i18n("dashProf.bl.loading", "Caricamento blacklist…")) + "</p>";
    } else if (!rows.length) {
      listHtml =
        '<p class="vc-dash-bl__empty" id="tprof-bl-empty">' +
        esc(i18n("dashProf.bl.empty", "Nessuna voce in blacklist.")) +
        "</p>";
    } else {
      listHtml =
        '<div class="vc-dash-bl__list" id="tprof-bl-list">' +
        rows
          .map(function (row) {
            var isGuild = row.type === "guild";
            var name =
              row.name ||
              (isGuild
                ? i18n("dashProf.bl.unknownServer", "Server sconosciuto")
                : i18n("dashProf.bl.unknownUser", "Utente sconosciuto"));
            var id = String(row.id || "");
            var note = String(row.note || "").trim();
            var when = formatBotbanDate(row.addedAt);
            var icon = String(row.iconUrl || "").trim();
            var iconHtml = icon
              ? '<img class="vc-dash-bl__icon" src="' +
                esc(icon) +
                '" alt="" width="40" height="40" loading="lazy" />'
              : '<span class="vc-dash-bl__icon vc-dash-bl__icon--fallback" aria-hidden="true"><i class="fa fa-' +
                (isGuild ? "server" : "user") +
                '"></i></span>';
            var metaParts = [];
            metaParts.push('<code class="vc-dash-bl__id">' + esc(id) + "</code>");
            if (when) metaParts.push(esc(when));
            if (isGuild && row.botPresent === false) {
              metaParts.push(esc(i18n("dashProf.bl.botAbsent", "Bot assente")));
            }
            return (
              '<article class="vc-dash-bl__row" data-bl-id="' +
              esc(id) +
              '">' +
              '<div class="vc-dash-bl__main">' +
              iconHtml +
              '<div class="vc-dash-bl__text">' +
              "<strong>" +
              esc(name) +
              '</strong><p class="vc-dash-bl__meta">' +
              metaParts.join(" · ") +
              "</p>" +
              (note ? '<p class="vc-dash-bl__note">' + esc(note) + "</p>" : "") +
              "</div></div>" +
              '<button type="button" class="vc-dashboard-btn vc-dash-bl__remove" data-tprof-bl-remove="' +
              esc(isGuild ? "guild" : "user") +
              '" data-tprof-bl-id="' +
              esc(id) +
              '"' +
              (state.botban.busy ? " disabled" : "") +
              ">" +
              esc(i18n("dashProf.bl.remove", "Rimuovi")) +
              "</button></article>"
            );
          })
          .join("") +
        "</div>";
    }

    return (
      '<article class="vc-tprof-panel">' +
      '<div class="vc-tprof-panel__accent" aria-hidden="true"></div>' +
      '<div class="vc-tprof-panel__body">' +
      '<header class="vc-tprof-section-head"><div><h2>' +
      esc(i18n("dashProf.tabBlacklist", "Blacklist")) +
      "</h2><p>" +
      esc(
        i18n(
          "dashProf.bl.lead",
          "Blocca utenti o server dall’uso del bot. Gestione diretta dal sito, già sincronizzata col bot.",
        ),
      ) +
      "</p></div>" +
      '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--ghost vc-dash-bl__refresh" data-tprof-bl-refresh' +
      (state.botban.loading || state.botban.busy ? " disabled" : "") +
      '><i class="fa fa-refresh" aria-hidden="true"></i> ' +
      esc(i18n("dashProf.bl.refresh", "Aggiorna")) +
      "</button></header>" +
      '<div class="vc-tprof-bl-toolbar">' +
      '<div class="vc-tprof-bl-seg" role="group" aria-label="' +
      esc(i18n("dashProf.bl.filters", "Filtri")) +
      '">' +
      filterBtn("all", i18n("dashProf.bl.filterAll", "Tutti"), "fa-list") +
      filterBtn("users", i18n("dashProf.bl.filterUsers", "Utenti"), "fa-user") +
      filterBtn("servers", i18n("dashProf.bl.filterServers", "Server"), "fa-server") +
      "</div>" +
      '<p class="vc-tprof-bl-count" id="tprof-bl-count">' +
      esc(countLabel) +
      "</p></div>" +
      '<div class="vc-tprof-bl-compose">' +
      '<div class="vc-tprof-bl-compose__top">' +
      '<span class="vc-tprof-bl-compose__label">' +
      esc(i18n("dashProf.bl.kind", "Tipo")) +
      "</span>" +
      '<div class="vc-tprof-bl-kind" role="group" aria-label="' +
      esc(i18n("dashProf.bl.kind", "Tipo")) +
      '">' +
      kindBtn("user", i18n("dashProf.bl.kindUser", "Utente"), "fa-user") +
      kindBtn("guild", i18n("dashProf.bl.kindGuild", "Server"), "fa-server") +
      "</div></div>" +
      '<div class="vc-tprof-bl-compose__grid">' +
      '<label class="vc-tprof-bl-field vc-tprof-bl-field--id"><span>' +
      esc(i18n("dashProf.bl.id", "ID Discord")) +
      '</span><input id="tprof-bl-id" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="123456789012345678" value="' +
      esc(state.botban.draftId || "") +
      '"' +
      (state.botban.busy ? " disabled" : "") +
      " /></label>" +
      '<label class="vc-tprof-bl-field vc-tprof-bl-field--note"><span>' +
      esc(i18n("dashProf.bl.note", "Nota (opzionale)")) +
      '</span><input id="tprof-bl-note" type="text" maxlength="500" autocomplete="off" placeholder="' +
      esc(i18n("dashProf.bl.notePh", "Motivo")) +
      '" value="' +
      esc(state.botban.draftNote || "") +
      '"' +
      (state.botban.busy ? " disabled" : "") +
      " /></label>" +
      '<div class="vc-tprof-bl-compose__actions">' +
      '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--primary vc-tprof-bl-add" id="tprof-bl-add-btn" data-tprof-bl-add' +
      (state.botban.busy ? " disabled" : "") +
      '><i class="fa fa-plus" aria-hidden="true"></i><span>' +
      esc(i18n("dashProf.bl.add", "Aggiungi")) +
      "</span></button></div></div>" +
      (kind === "guild"
        ? '<p class="vc-tprof-bl-compose__hint">' +
          esc(
            i18n(
              "dashProf.bl.guildHint",
              "Se il bot è nel server, uscirà automaticamente dopo l’aggiunta.",
            ),
          ) +
          "</p>"
        : "") +
      "</div>" +
      '<div class="vc-dash-bl__body">' +
      listHtml +
      "</div></div></article>"
    );
  }

  function renderSettings(data) {
    var prefs = data.prefs || {};
    var langs = data.languages || [];
    return (
      '<article class="vc-tprof-panel">' +
      '<div class="vc-tprof-panel__accent" aria-hidden="true"></div>' +
      '<div class="vc-tprof-panel__body">' +
      '<header class="vc-tprof-section-head"><div><h2>' +
      esc(i18n("dashProf.tabSettings", "Impostazioni")) +
      "</h2><p>" +
      esc(i18n("dashProf.settingsLead", "Preferenze del tuo profilo.")) +
      "</p></div></header>" +
      '<div class="vc-tprof-setting">' +
      "<div><strong>" +
      esc(i18n("dashProf.pingsTitle", "Nascondi avvisi team")) +
      "</strong><p>" +
      esc(i18n("dashProf.pingsHint", "Non ricevere gli avvisi automatici rivolti al team partnership.")) +
      "</p></div>" +
      '<label class="vc-dash-switch"><input type="checkbox" data-tprof-toggle="suppressManagerPing" ' +
      (prefs.suppressManagerPing ? "checked " : "") +
      '/><span class="vc-dash-switch__track" aria-hidden="true"><span class="vc-dash-switch__thumb"></span></span></label>' +
      "</div>" +
      '<div class="vc-tprof-setting">' +
      "<div><strong>" +
      esc(i18n("dashProf.privacyTitle", "Risposte temporanee")) +
      "</strong><p>" +
      esc(i18n("dashProf.privacyHint", "I messaggi privati delle partnership spariscono dopo poco.")) +
      "</p></div>" +
      '<label class="vc-dash-switch"><input type="checkbox" data-tprof-toggle="ephemeralCommands" ' +
      (prefs.ephemeralCommands ? "checked " : "") +
      '/><span class="vc-dash-switch__track" aria-hidden="true"><span class="vc-dash-switch__thumb"></span></span></label>' +
      "</div>" +
      '<div class="vc-tprof-lang">' +
      "<strong>" +
      esc(i18n("dashProf.languageTitle", "Lingua profilo")) +
      "</strong>" +
      "<p>" +
      esc(i18n("dashProf.languageHint", "Lingua usata nei pannelli del tuo profilo.")) +
      "</p>" +
      '<div class="vc-tprof-lang__grid" role="group" aria-label="' +
      esc(i18n("dashProf.languageTitle", "Lingua profilo")) +
      '">' +
      langs
        .map(function (lang) {
          var code = String(lang.code || "");
          var label = String(lang.label || code);
          var iso = langFlagIso(code);
          return (
            '<button type="button" class="vc-tprof-lang__btn' +
            (prefs.language === code ? " is-active" : "") +
            '" data-tprof-lang="' +
            esc(code) +
            '" title="' +
            esc(label) +
            '" aria-label="' +
            esc(label) +
            '" aria-pressed="' +
            (prefs.language === code ? "true" : "false") +
            '"><img class="vc-tprof-lang__flag" src="https://flagcdn.com/w80/' +
            esc(iso) +
            '.png" width="28" height="21" alt="" loading="lazy" decoding="async" /></button>'
          );
        })
        .join("") +
      "</div></div></div></article>"
    );
  }

  function tabFromHash() {
    try {
      var h = String(window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
      if (h === "objectives" || h === "obiettivi") return "objectives";
      if (h === "badges" || h === "badge") return "badges";
      if (h === "blacklist" || h === "botban") return "blacklist";
      if (h === "dev" || h === "developer") return "dev";
      if (h === "settings" || h === "impostazioni") return "settings";
      if (h === "home") return "home";
    } catch (e0) {}
    return "";
  }

  function syncHashFromTab(tab, replace) {
    var next = "";
    if (tab === "objectives") next = "#objectives";
    else if (tab === "badges") next = "#badges";
    else if (tab === "blacklist") next = "#blacklist";
    else if (tab === "dev") next = "#dev";
    else if (tab === "settings") next = "#settings";
    try {
      var cur = String(window.location.hash || "");
      if (cur === next) return;
      if (!next) {
        if (!cur) return;
        if (replace && window.history && window.history.replaceState) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        } else {
          window.location.hash = "";
        }
        return;
      }
      if (replace && window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search + next);
      } else {
        window.location.hash = next.slice(1);
      }
    } catch (e1) {}
  }

  function markSidebar() {
    try {
      if (typeof window.__vcMarkProfileSidebar === "function") window.__vcMarkProfileSidebar();
    } catch (e0) {}
  }

  function selectTab(tab, opts) {
    var next = String(tab || "home");
    if (
      next !== "home" &&
      next !== "objectives" &&
      next !== "badges" &&
      next !== "blacklist" &&
      next !== "dev" &&
      next !== "settings"
    ) {
      next = "home";
    }
    if (next === "dev" && !isBotDev()) next = "home";
    state.tab = next;
    if (next === "objectives") state.objPage = 1;
    if (!(opts && opts.skipHash)) syncHashFromTab(next, Boolean(opts && opts.replaceHash));
    markSidebar();
    render();
    if (next === "dev") {
      if (!state.dev.loaded) loadDev();
      else loadDev({ silent: true });
      if (state.dev.panel === "credits") loadDevCreditsList({ silent: state.dev.creditsListLoaded });
      startDevPoll();
    } else {
      stopDevPoll();
    }
  }

  function render() {
    var app = byId("vc-dash-profile-app");
    var panels = byId("vc-dash-profile-panels");
    if (!app || !panels || !state.data) return;
    app.hidden = false;
    syncDevNavVisibility();
    if (state.tab === "dev" && !isBotDev()) state.tab = "home";
    Array.prototype.forEach.call(document.querySelectorAll("[data-tprof-tab]"), function (btn) {
      var on = btn.getAttribute("data-tprof-tab") === state.tab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    var html = "";
    if (state.tab === "home") html = renderHome(state.data);
    else if (state.tab === "objectives") html = renderObjectives(state.data);
    else if (state.tab === "badges") html = renderBadges(state.data);
    else if (state.tab === "blacklist") html = renderBlacklist();
    else if (state.tab === "dev") html = renderDev();
    else html = renderSettings(state.data);
    panels.innerHTML = html;
  }

  async function load() {
    setStatus(i18n("dashProf.loading", "Caricamento profilo…"), false, { sticky: true });
    try {
      state.data = await api("GET", "/profile");
      setStatus("");
      var fromHash = tabFromHash();
      if (fromHash) state.tab = fromHash;
      if (state.tab === "dev" && !isBotDev()) state.tab = "home";
      render();
      markSidebar();
      if (state.tab === "blacklist") loadBotban();
      if (state.tab === "dev") {
        loadDev();
        startDevPoll();
      } else {
        stopDevPoll();
      }
    } catch (e) {
      setStatus(e.message || i18n("dashProf.loadError", "Impossibile caricare il profilo."), true);
    }
  }

  async function patch(body) {
    if (state.busy) return;
    state.busy = true;
    try {
      state.data = await api("PATCH", "/profile", body);
      setStatus("");
      render();
    } catch (e) {
      setStatus(e.message || i18n("dashProf.saveError", "Salvataggio non riuscito."), true);
      render();
    } finally {
      state.busy = false;
    }
  }

  function wire() {
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var side = t.closest("[data-tprof-sidebar]");
      if (side) {
        var sideTab = side.getAttribute("data-tprof-sidebar") || "home";
        if (sideTab === "home") {
          try {
            var href = side.getAttribute("href") || "";
            var u = new URL(href, window.location.origin);
            var here = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
            var there = String(u.pathname || "").replace(/\/+$/, "") || "/";
            if (here === there) {
              ev.preventDefault();
              selectTab("home");
              return;
            }
          } catch (eSide) {}
        }
      }
      var tab = t.closest("[data-tprof-tab]");
      if (tab) {
        selectTab(tab.getAttribute("data-tprof-tab") || "home");
        if (state.tab === "blacklist" && !state.botban.loaded) loadBotban();
        else if (state.tab === "blacklist") loadBotban({ silent: true });
        return;
      }
      var devPanel = t.closest("[data-tprof-dev-panel]");
      if (devPanel) {
        var nextPanel = String(devPanel.getAttribute("data-tprof-dev-panel") || "guilds");
        state.dev.panel = nextPanel === "events" ? "events" : nextPanel === "credits" ? "credits" : "guilds";
        render();
        if (state.dev.panel === "credits" && !state.dev.creditsListLoaded) loadDevCreditsList();
        return;
      }
      if (t.closest("[data-tprof-dev-refresh]")) {
        if (state.dev.panel === "credits") loadDevCreditsList();
        else loadDev();
        return;
      }
      var creditsPick = t.closest("[data-tprof-dev-credits-pick]");
      if (creditsPick) {
        syncDevCreditsDraftFromDom();
        state.dev.creditsUserId = String(creditsPick.getAttribute("data-tprof-dev-credits-pick") || "").trim();
        render();
        return;
      }
      var creditsPage = t.closest("[data-tprof-dev-credits-page]");
      if (creditsPage) {
        state.dev.creditsPage = Number(creditsPage.getAttribute("data-tprof-dev-credits-page")) || 1;
        loadDevCreditsList();
        return;
      }
      var devPage = t.closest("[data-tprof-dev-page]");
      if (devPage) {
        state.dev.page = Number(devPage.getAttribute("data-tprof-dev-page")) || 1;
        render();
        return;
      }
      var devAct = t.closest("[data-tprof-dev-act]");
      if (devAct) {
        runDevAction(devAct.getAttribute("data-tprof-dev-act"), devAct.getAttribute("data-tprof-dev-gid"));
        return;
      }
      var blFilter = t.closest("[data-tprof-bl-filter]");
      if (blFilter) {
        syncBotbanDraftFromDom();
        state.botban.filter = blFilter.getAttribute("data-tprof-bl-filter") || "all";
        render();
        return;
      }
      var blKind = t.closest("[data-tprof-bl-kind]");
      if (blKind) {
        syncBotbanDraftFromDom();
        state.botban.kind = blKind.getAttribute("data-tprof-bl-kind") === "guild" ? "guild" : "user";
        render();
        return;
      }
      if (t.closest("[data-tprof-bl-refresh]")) {
        loadBotban();
        return;
      }
      if (t.closest("[data-tprof-bl-add]")) {
        addBotban();
        return;
      }
      var blRemove = t.closest("[data-tprof-bl-remove]");
      if (blRemove) {
        removeBotban(blRemove.getAttribute("data-tprof-bl-remove"), blRemove.getAttribute("data-tprof-bl-id"));
        return;
      }
      var objPage = t.closest("[data-tprof-obj-page]");
      if (objPage) {
        state.objPage = Number(objPage.getAttribute("data-tprof-obj-page")) || 1;
        render();
        return;
      }
      var badge = t.closest("[data-tprof-toggle-badge]");
      if (badge) {
        patch({ toggleBadgeId: badge.getAttribute("data-tprof-toggle-badge") });
        return;
      }
      var slot = t.closest("[data-tprof-remove-slot]");
      if (slot) {
        patch({ removeBadgeSlot: Number(slot.getAttribute("data-tprof-remove-slot")) || 0 });
        return;
      }
      var lang = t.closest("[data-tprof-lang]");
      if (lang) {
        patch({ language: lang.getAttribute("data-tprof-lang") });
      }
    });

    document.addEventListener("change", function (ev) {
      var t = ev.target;
      if (!t || !t.matches) return;
      if (!t.matches("[data-tprof-toggle]")) return;
      var key = t.getAttribute("data-tprof-toggle");
      if (key === "suppressManagerPing") patch({ toggleSuppressManagerPing: true });
      else if (key === "ephemeralCommands") patch({ toggleEphemeralCommands: true });
    });

    document.addEventListener("input", function (ev) {
      var t = ev.target;
      if (!t || !t.matches || !t.matches("[data-tprof-dev-q]")) return;
      scheduleDevSearchFilter(t.value);
    });

    document.addEventListener("keydown", function (ev) {
      var t = ev.target;
      if (!t || !t.matches || !t.matches("[data-tprof-dev-q]")) return;
      if (ev.key !== "Enter") return;
      ev.preventDefault();
    });

    document.addEventListener("submit", function (ev) {
      var form = ev.target && ev.target.closest && ev.target.closest("[data-tprof-dev-credits-form]");
      if (!form) return;
      ev.preventDefault();
      applyDevCredits();
    });

    document.addEventListener("visibilitychange", function () {
      if (typeof document === "undefined") return;
      if (document.hidden) return;
      if (state.tab !== "dev" || !isBotDev()) return;
      if (state.dev.loading || state.dev.busy) return;
      loadDev({ silent: true, poll: true });
    });
  }

  function boot() {
    wire();
    window.addEventListener("hashchange", function () {
      var fromHash = tabFromHash();
      if (!fromHash) {
        markSidebar();
        return;
      }
      if (fromHash !== state.tab) selectTab(fromHash, { skipHash: true });
      else markSidebar();
    });
    var bootTab = tabFromHash();
    if (bootTab) state.tab = bootTab;
    if (getToken()) {
      load();
      return;
    }
    setStatus(i18n("dashProf.needLogin", "Accedi con Discord per vedere il profilo."), true, { sticky: true });
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var u = ev && ev.detail ? ev.detail.user : null;
    if (u) load();
    else setStatus(i18n("dashProf.needLogin", "Accedi con Discord per vedere il profilo."), true, { sticky: true });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
