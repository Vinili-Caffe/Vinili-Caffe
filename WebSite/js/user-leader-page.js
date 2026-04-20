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
    var id = String(row.userId || "").trim();
    var av = String(row.avatar || "").trim();
    if (id && av) {
      var ext = av.indexOf("a_") === 0 ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + id + "/" + av + "." + ext + "?size=128";
    }
    var disc = parseInt(String(row.discriminator || "0"), 10);
    if (!Number.isFinite(disc)) disc = 0;
    return "https://cdn.discordapp.com/embed/avatars/" + (disc % 5) + ".png";
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

  var state = { page: 1, totalPages: 1, loading: false };

  function setState(msg, isErr) {
    var el = byId("vc-user-leader-state");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "vc-user-leader-state" + (isErr ? " vc-user-leader-state--err" : "");
    el.hidden = !msg;
  }

  function renderCard(row) {
    var name = String(row.displayName || row.username || "Utente").trim() || "Utente";
    var rank = Number(row.rank) || 0;
    var pct = Math.max(0, Math.min(100, Number(row.progressPercent) || 0));
    var idShort = String(row.userId || "").slice(0, 10);
    return (
      '<article class="vc-ul-card" role="listitem">' +
      '<div class="vc-ul-card-head">' +
      '<div class="vc-ul-card-user">' +
      '<img class="vc-ul-avatar" src="' +
      esc(avatarUrl(row)) +
      '" alt="" width="48" height="48" loading="lazy" decoding="async" />' +
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
      "</div>" +
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

  function updatePager() {
    var nav = byId("vc-ul-pager");
    var prev = byId("vc-ul-prev");
    var next = byId("vc-ul-next");
    var lab = byId("vc-ul-page-label");
    if (!nav || !prev || !next || !lab) return;
    var tp = Math.max(1, state.totalPages);
    nav.hidden = tp <= 1;
    prev.disabled = state.page <= 1;
    next.disabled = state.page >= tp;
    lab.textContent = "Pagina " + state.page + " di " + tp;
  }

  function applyStats(data) {
    var st = data && data.stats ? data.stats : {};
    var mem = byId("vc-ul-stat-members");
    var tl = byId("vc-ul-stat-toplvl");
    var tn = byId("vc-ul-stat-topname");
    var sub = byId("vc-user-leader-sub");
    if (mem) {
      mem.textContent =
        st.membersApprox != null && Number.isFinite(Number(st.membersApprox))
          ? formatIntIt(st.membersApprox)
          : "—";
    }
    if (tl) tl.textContent = st.topLevel != null ? formatIntIt(st.topLevel) : "—";
    if (tn) tn.textContent = String(st.topDisplayName || "—").trim() || "—";
    if (sub) {
      var ranked = data && data.total != null ? formatIntIt(data.total) : "0";
      var line = ranked + " utenti in classifica per EXP totale";
      if (st.membersApprox != null && Number.isFinite(Number(st.membersApprox))) {
        line = formatIntIt(st.membersApprox) + " membri · " + line;
      }
      sub.textContent = line;
    }
  }

  function render(data) {
    var grid = byId("vc-ul-grid");
    var empty = byId("vc-ul-empty");
    if (!grid || !empty) return;
    var rows = (data && data.rows) || [];
    if (!rows.length) {
      grid.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    grid.innerHTML = rows.map(renderCard).join("");
    state.totalPages = Math.max(1, Number(data.totalPages) || 1);
    updatePager();
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
      encodeURIComponent(String(PER_PAGE));
    state.loading = true;
    setState("Caricamento…", false);
    fetch(url, { credentials: "omit" })
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
          render({ rows: [], total: 0, totalPages: 1 });
          updatePager();
          return;
        }
        setState("", false);
        applyStats(out.body);
        render(out.body);
      })
      .catch(function () {
        state.loading = false;
        setState(
          "Impossibile contattare l’API classifica (rete, proxy verso il bot, risposta non JSON o CORS). Verifica GET /webhooks/site-users e che l’HTTP del bot sia attivo (WEBSITE_PUBLIC_HTTP se lo disabiliti esplicitamente).",
          true,
        );
        render({ rows: [], total: 0, totalPages: 1 });
        updatePager();
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

  function main() {
    initPager();
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();