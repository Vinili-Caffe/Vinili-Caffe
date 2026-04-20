(function () {
  var PER_PAGE = 12;

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

  function avatarUrl(row) {
    var fromApi = String(row.avatarUrl || "").trim();
    if (/^https?:\/\//i.test(fromApi)) return fromApi;
    var id = String(row.userId || "").trim();
    var av = String(row.avatar || "").trim();
    if (id && av) {
      var ext = av.indexOf("a_") === 0 ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + id + "/" + av + "." + ext + "?size=128";
    }
    var disc = parseInt(String(row.discriminator || "0"), 10);
    if (!Number.isFinite(disc)) disc = 0;
    var idx;
    if (disc !== 0) {
      idx = disc % 5;
    } else if (id && /^\d{5,22}$/.test(id)) {
      try {
        idx = Number((BigInt(id) >> 22n) % 6n);
      } catch (e) {
        idx = 0;
      }
    } else {
      idx = 0;
    }
    return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
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
    if (!Number.isFinite(s) || s < 0) return "0h";
    var h = s / 3600;
    return String(h.toFixed(1)).replace(".", ",") + "h";
  }

  function formatMult(m) {
    var x = Number(m);
    if (!Number.isFinite(x) || x <= 0) return "x1";
    if (Math.abs(x - Math.round(x)) < 0.02) return "x" + String(Math.round(x));
    return "x" + String(x.toFixed(1)).replace(".", ",");
  }

  function rankClass(rank) {
    if (rank === 1) return "vc-ul-rank vc-ul-rank--1";
    if (rank === 2) return "vc-ul-rank vc-ul-rank--2";
    if (rank === 3) return "vc-ul-rank vc-ul-rank--3";
    return "vc-ul-rank vc-ul-rank--n";
  }

  function rankInner(rank) {
    if (rank <= 3) return '<i class="fa fa-star" aria-hidden="true"></i>';
    return '<span class="vc-ul-rank-num">#' + esc(String(rank)) + "</span>";
  }

  function defaultEmbedAvatarUrl(row) {
    var id = String(row.userId || "").trim();
    var disc = parseInt(String(row.discriminator || "0"), 10);
    var idx;
    if (!Number.isFinite(disc)) disc = 0;
    if (disc !== 0) {
      idx = disc % 5;
    } else if (id && /^\d{5,22}$/.test(id)) {
      try {
        idx = Number((BigInt(id) >> 22n) % 6n);
      } catch (e) {
        idx = 0;
      }
    } else {
      idx = 0;
    }
    return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
  }

  var state = { page: 1, totalPages: 1, loading: false, board: "level", searchUserId: "", filtersOpen: false };

  function setState(msg, isErr) {
    var el = byId("vc-user-leader-state");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "vc-user-leader-state" + (isErr ? " vc-user-leader-state--err" : "");
    el.hidden = !msg;
  }

  function cardHead(row) {
    var rawName = String(row.username || "").trim();
    var name = rawName || "Utente";
    var rank = Number(row.rank) || 0;
    var idShort = String(row.userId || "").slice(0, 10);
    var avSrc = esc(avatarUrl(row));
    var avFb = defaultEmbedAvatarUrl(row);
    return (
      '<div class="vc-ul-card-head">' +
      '<div class="vc-ul-card-user">' +
      '<img class="vc-ul-avatar" src="' +
      avSrc +
      '" alt="" width="48" height="48" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' +
      avFb +
      '\'" />' +
      '<div class="vc-ul-card-names">' +
      '<div class="vc-ul-card-title-row">' +
      '<span class="vc-ul-card-name">' +
      esc(name) +
      "</span>" +
      '<span class="' +
      rankClass(rank) +
      '" aria-label="Posizione ' +
      esc(String(rank)) +
      '">' +
      rankInner(rank) +
      "</span>" +
      "</div>" +
      '<p class="vc-ul-card-id">ID: ' +
      esc(idShort) +
      "…</p>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderCardLevel(row) {
    var pct = Math.max(0, Math.min(100, Number(row.progressPercent) || 0));
    return (
      '<article class="vc-ul-card" role="listitem">' +
      cardHead(row) +
      '<div class="vc-ul-card-stats">' +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">Livello</span>' +
      '<span class="vc-ul-statbox-val">' +
      esc(String(row.level != null ? row.level : "0")) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">EXP</span>' +
      '<span class="vc-ul-statbox-val">' +
      esc(formatIntIt(row.exp)) +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="vc-ul-progress" aria-hidden="true"><span class="vc-ul-progress-fill" style="width:' +
      esc(String(pct)) +
      '%"></span></div>' +
      '<div class="vc-ul-card-foot">' +
      '<span class="vc-ul-foot-ico" aria-hidden="true"><i class="fa fa-bolt"></i></span>' +
      '<span class="vc-ul-foot-label">Progresso livello</span>' +
      '<span class="vc-ul-foot-val">' +
      esc(String(pct)) +
      "%</span>" +
      "</div>" +
      "</article>"
    );
  }

  function renderCardWeekly(row) {
    var pct = Math.max(0, Math.min(100, Number(row.progressPercent) || 0));
    var wPct = Math.max(0, Math.min(100, Number(row.weeklyBarPct) || 0));
    var mult = formatMult(row.expMultiplier != null ? row.expMultiplier : 1);
    return (
      '<article class="vc-ul-card vc-ul-card--weekly" role="listitem">' +
      cardHead(row) +
      '<div class="vc-ul-card-stats">' +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">Livello</span>' +
      '<span class="vc-ul-statbox-val">' +
      esc(String(row.level != null ? row.level : "0")) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">EXP</span>' +
      '<span class="vc-ul-statbox-val">' +
      esc(formatIntIt(row.exp)) +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="vc-ul-stat-wide">' +
      '<div class="vc-ul-stat-wide-row">' +
      '<span class="vc-ul-stat-wide-label">EXP settimanale</span>' +
      '<span class="vc-ul-stat-wide-val">' +
      esc(formatIntIt(row.weeklyExp)) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-progress vc-ul-progress--inset" aria-hidden="true"><span class="vc-ul-progress-fill" style="width:' +
      esc(String(wPct)) +
      '%"></span></div>' +
      "</div>" +
      '<div class="vc-ul-progress" aria-hidden="true"><span class="vc-ul-progress-fill vc-ul-progress-fill--muted" style="width:' +
      esc(String(pct)) +
      '%"></span></div>' +
      '<div class="vc-ul-card-foot">' +
      '<span class="vc-ul-foot-ico" aria-hidden="true"><i class="fa fa-bolt"></i></span>' +
      '<span class="vc-ul-foot-label">Moltiplicatore</span>' +
      '<span class="vc-ul-foot-val">' +
      esc(mult) +
      "</span>" +
      "</div>" +
      "</article>"
    );
  }

  function renderCardMessages(row) {
    var wPct = Math.max(0, Math.min(100, Number(row.messagesWeeklyBarPct) || 0));
    return (
      '<article class="vc-ul-card vc-ul-card--messages" role="listitem">' +
      cardHead(row) +
      '<div class="vc-ul-card-stats">' +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">Messaggi</span>' +
      '<span class="vc-ul-statbox-val">' +
      esc(formatIntIt(row.messagesTotal)) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">Msg settimanali</span>' +
      '<span class="vc-ul-statbox-val">' +
      esc(formatIntIt(row.messagesWeekly)) +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="vc-ul-stat-wide">' +
      '<div class="vc-ul-stat-wide-row">' +
      '<span class="vc-ul-stat-wide-label">Messaggi giornalieri</span>' +
      '<span class="vc-ul-stat-wide-val">' +
      esc(formatIntIt(row.messagesDaily)) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-progress vc-ul-progress--inset" aria-hidden="true"><span class="vc-ul-progress-fill vc-ul-progress-fill--msg" style="width:' +
      esc(String(wPct)) +
      '%"></span></div>' +
      "</div>" +
      "</article>"
    );
  }

  function renderCardVoice(row) {
    var wPct = Math.max(0, Math.min(100, Number(row.voiceWeeklyBarPct) || 0));
    return (
      '<article class="vc-ul-card vc-ul-card--voice" role="listitem">' +
      cardHead(row) +
      '<div class="vc-ul-card-stats">' +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">Ore totali</span>' +
      '<span class="vc-ul-statbox-val">' +
      esc(formatHoursIt(row.voiceTotalSeconds)) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">Ore settimanali</span>' +
      '<span class="vc-ul-statbox-val">' +
      esc(formatHoursIt(row.voiceWeeklySeconds)) +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="vc-ul-stat-wide">' +
      '<div class="vc-ul-stat-wide-row">' +
      '<span class="vc-ul-stat-wide-label">Ore giornaliere</span>' +
      '<span class="vc-ul-stat-wide-val">' +
      esc(formatHoursIt(row.voiceDailySeconds)) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-progress vc-ul-progress--inset" aria-hidden="true"><span class="vc-ul-progress-fill vc-ul-progress-fill--voice" style="width:' +
      esc(String(wPct)) +
      '%"></span></div>' +
      "</div>" +
      "</article>"
    );
  }

  function renderCard(row, board) {
    if (board === "weekly") return renderCardWeekly(row);
    if (board === "messages") return renderCardMessages(row);
    if (board === "voice") return renderCardVoice(row);
    return renderCardLevel(row);
  }

  function updatePager() {
    var nav = byId("vc-ul-pager");
    var prev = byId("vc-ul-prev");
    var next = byId("vc-ul-next");
    var lab = byId("vc-ul-page-label");
    if (!nav || !prev || !next || !lab) return;
    if (state.searchUserId) {
      nav.hidden = true;
      return;
    }
    var tp = Math.max(1, state.totalPages);
    nav.hidden = tp <= 1;
    prev.disabled = state.page <= 1;
    next.disabled = state.page >= tp;
    lab.textContent = "Pagina " + state.page + " di " + tp;
  }

  function applyStats(data) {
    var st = data && data.stats ? data.stats : {};
    var board = String((data && data.board) || state.board || "level");
    var mem = byId("vc-ul-stat-members");
    var midLabel = byId("vc-ul-stat-mid-label");
    var midVal = byId("vc-ul-stat-mid-value");
    var tn = byId("vc-ul-stat-topname");
    var sub = byId("vc-user-leader-sub");
    if (mem) {
      mem.textContent =
        st.membersApprox != null && Number.isFinite(Number(st.membersApprox))
          ? formatIntIt(st.membersApprox)
          : "—";
    }
    if (midLabel && midVal) {
      if (board === "level") {
        midLabel.textContent = "Livello più alto";
        midVal.textContent = st.topLevel != null ? formatIntIt(st.topLevel) : "—";
      } else if (board === "weekly") {
        midLabel.textContent = "EXP settimanale più alto";
        midVal.textContent = st.topWeeklyExp != null ? formatIntIt(st.topWeeklyExp) : "—";
      } else if (board === "messages") {
        midLabel.textContent = "Messaggi più alti";
        midVal.textContent = st.topMessagesTotal != null ? formatIntIt(st.topMessagesTotal) : "—";
      } else if (board === "voice") {
        midLabel.textContent = "Ore più alte";
        midVal.textContent = st.topVoiceSeconds != null ? formatHoursIt(st.topVoiceSeconds) : "—";
      } else {
        midLabel.textContent = "—";
        midVal.textContent = "—";
      }
    }
    if (tn) {
      var topUser = String(st.topPlayerUsername || st.topDisplayName || "—").trim() || "—";
      tn.textContent = topUser;
    }
    if (sub) {
      var blurb = "";
      if (board === "level") blurb = "Classifica per EXP totale e livello.";
      else if (board === "weekly") blurb = "Classifica per EXP guadagnata nella settimana corrente.";
      else if (board === "messages") blurb = "Classifica per messaggi contati dal bot sul server.";
      else if (board === "voice") blurb = "Classifica per tempo in canali vocali.";
      else blurb = "";
      sub.textContent = blurb;
    }
  }

  function render(data) {
    var grid = byId("vc-ul-grid");
    var empty = byId("vc-ul-empty");
    if (!grid || !empty) return;
    var rows = (data && data.rows) || [];
    var board = String((data && data.board) || state.board || "level");
    if (!rows.length) {
      grid.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    grid.innerHTML = rows.map(function (r) {
      return renderCard(r, board);
    }).join("");
    state.totalPages = Math.max(1, Number(data.totalPages) || 1);
    updatePager();
  }

  function syncSearchUi() {
    var fbtn = byId("vc-ul-open-filters");
    if (fbtn) fbtn.classList.toggle("vc-ul-filter-tab--has-search", Boolean(state.searchUserId));
  }

  function load() {
    var base = resolvedApiUrl();
    if (!base) {
      setState("Manca l’URL API classifica: in site.config.json imposta usersLeaderboardApiUrl (stesso host dei webhook del bot).", true);
      return;
    }
    var url =
      base.split("?")[0] +
      (base.indexOf("?") >= 0 ? "&" : "?") +
      "page=" +
      encodeURIComponent(String(state.page)) +
      "&perPage=" +
      encodeURIComponent(String(PER_PAGE)) +
      "&board=" +
      encodeURIComponent(String(state.board || "level"));
    if (state.searchUserId) {
      url += "&userId=" + encodeURIComponent(state.searchUserId);
      /* CDN/proxy che ignorano la query o cache GET: varia l’URL e disabilita cache browser */
      url += "&_vcq=" + encodeURIComponent(String(Date.now()));
    }
    state.loading = true;
    setState("Caricamento…", false);
    fetch(url, { credentials: "omit", cache: "no-store" })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, body: j };
        });
      })
      .then(function (out) {
        state.loading = false;
        if (!out.ok || !out.body || out.body.ok !== true) {
          var msg =
            (out.body && (out.body.message || out.body.error)) ||
            ("HTTP " + String(out.status || "") + " — dati non disponibili.");
          setState(String(msg), true);
          render({ rows: [], total: 0, totalPages: 1, board: state.board });
          updatePager();
          syncSearchUi();
          return;
        }
        setState("", false);
        if (out.body.board) state.board = String(out.body.board);
        applyStats(out.body);
        render(out.body);
        syncSearchUi();
      })
      .catch(function () {
        state.loading = false;
        setState(
          "Impossibile contattare l’API classifica (rete, proxy verso il bot, risposta non JSON o CORS). Verifica GET /webhooks/site-users e che l’HTTP del bot sia attivo (WEBSITE_PUBLIC_HTTP se lo disabiliti esplicitamente).",
          true,
        );
        render({ rows: [], total: 0, totalPages: 1, board: state.board });
        updatePager();
        syncSearchUi();
      });
  }

  function initPager() {
    var prev = byId("vc-ul-prev");
    var next = byId("vc-ul-next");
    if (prev) {
      prev.addEventListener("click", function () {
        if (state.page > 1) {
          state.page -= 1;
          load();
        }
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        if (state.page < state.totalPages) {
          state.page += 1;
          load();
        }
      });
    }
  }

  function initBoardTabs() {
    var wrap = byId("vc-ul-board-tabs");
    if (!wrap) return;
    var tabs = wrap.querySelectorAll("[data-board]");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", function () {
        var b = this.getAttribute("data-board");
        if (!b || b === state.board) return;
        state.board = b;
        state.page = 1;
        for (var j = 0; j < tabs.length; j++) {
          tabs[j].classList.remove("vc-notify-filter-btn--on");
          tabs[j].removeAttribute("aria-current");
        }
        this.classList.add("vc-notify-filter-btn--on");
        this.setAttribute("aria-current", "true");
        load();
      });
    }
  }

  function setFiltersOpen(open) {
    state.filtersOpen = open;
    var panel = byId("vc-ul-filters-wrap");
    var btn = byId("vc-ul-open-filters");
    if (panel) panel.hidden = !open;
    if (btn) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.classList.toggle("vc-notify-filter-btn--on", open);
    }
  }

  function initFilters() {
    var btn = byId("vc-ul-open-filters");
    var form = byId("vc-ul-filters-form");
    var inp = byId("vc-ul-search-id");
    var go = byId("vc-ul-search-go");
    if (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        setFiltersOpen(!state.filtersOpen);
      });
    }
    function doSearch() {
      var raw = inp ? String(inp.value || "").trim() : "";
      if (!raw) {
        setState("", false);
        state.searchUserId = "";
        if (inp) inp.value = "";
        state.page = 1;
        setFiltersOpen(false);
        load();
        syncSearchUi();
        return;
      }
      var digits = raw.replace(/\D/g, "");
      if (!/^\d{17,20}$/.test(digits)) {
        setState("Inserisci un ID valido (17–20 cifre) oppure lascia vuoto per la classifica intera.", true);
        return;
      }
      setState("", false);
      state.searchUserId = digits;
      state.page = 1;
      if (inp) inp.value = digits;
      setFiltersOpen(false);
      load();
      syncSearchUi();
    }
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        doSearch();
      });
    }
    if (go) {
      go.addEventListener("click", function (e) {
        e.preventDefault();
        doSearch();
      });
    }
  }

  function main() {
    initPager();
    initBoardTabs();
    initFilters();
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();