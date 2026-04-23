(function () {
  var PER_PAGE = 12;

  function isProfileMode() {
    try {
      return Boolean(window.VCUserProfilePage && window.VCUserProfilePage.isProfileMode());
    } catch (e) {
      return false;
    }
  }

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

  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function numericFromKind(value, kind) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (kind === "hours") return n / 3600;
    return n;
  }

  function formatAnimatedValue(value, kind) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (kind === "hours") return String(n.toFixed(1)).replace(".", ",") + "h";
    if (kind === "percent") return String(Math.round(n)) + "%";
    if (kind === "plain") return String(Math.round(n));
    return formatIntIt(n);
  }

  function animateValueNode(node, rawValue, kind, durationMs) {
    if (!node) return;
    var to = numericFromKind(rawValue, kind);
    if (prefersReducedMotion()) {
      node.textContent = formatAnimatedValue(to, kind);
      node.setAttribute("data-anim-current", String(to));
      return;
    }
    var from = Number(node.getAttribute("data-anim-current"));
    if (!Number.isFinite(from)) from = 0;
    if (node._vcAnimRaf) {
      cancelAnimationFrame(node._vcAnimRaf);
      node._vcAnimRaf = null;
    }
    if (Math.abs(from - to) < 0.001) {
      node.textContent = formatAnimatedValue(to, kind);
      node.setAttribute("data-anim-current", String(to));
      return;
    }
    var start = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - start) / durationMs);
      var eased = easeOutQuart(t);
      var current = from + (to - from) * eased;
      node.textContent = formatAnimatedValue(current, kind);
      if (t < 1) {
        node._vcAnimRaf = requestAnimationFrame(frame);
      } else {
        node.textContent = formatAnimatedValue(to, kind);
        node.setAttribute("data-anim-current", String(to));
        node._vcAnimRaf = null;
      }
    }
    node._vcAnimRaf = requestAnimationFrame(frame);
  }

  function animateNumberTargets(root) {
    if (!root || !root.querySelectorAll) return;
    var nodes = root.querySelectorAll("[data-vc-count-value], [data-anim-value]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var valueAttr = node.getAttribute("data-vc-count-value");
      var kindAttr = node.getAttribute("data-vc-count-kind");
      animateValueNode(
        node,
        Number(valueAttr != null ? valueAttr : node.getAttribute("data-anim-value")),
        String(kindAttr != null ? kindAttr : node.getAttribute("data-anim-kind") || "int"),
        900,
      );
    }
  }

  function readDisplayedAnimatedValue(node, kind) {
    if (!node) return 0;
    var text = String(node.textContent || "").trim();
    if (!text || text === "â€”") return 0;
    if (kind === "hours") {
      var hours = parseFloat(text.replace(",", ".").replace(/[^\d.,-]/g, ""));
      return Number.isFinite(hours) ? hours * 3600 : 0;
    }
    var n = parseFloat(text.replace(/\./g, "").replace(",", ".").replace(/[^\d.,-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function animateTopStats() {
    var mem = byId("vc-ul-stat-members");
    var midVal = byId("vc-ul-stat-mid-value");
    var countApi = typeof window !== "undefined" ? window.VCCountUp : null;
    if (countApi && typeof countApi.refresh === "function") {
      if (mem && mem.parentNode) countApi.refresh(mem.parentNode);
      if (midVal && midVal.parentNode) countApi.refresh(midVal.parentNode);
      return;
    }
    if (mem) {
      animateValueNode(mem, readDisplayedAnimatedValue(mem, "int"), "int", 1100);
    }
    if (midVal) {
      var kind = "plain";
      if (state.board === "weekly" || state.board === "messages") kind = "int";
      else if (state.board === "voice") kind = "hours";
      animateValueNode(midVal, readDisplayedAnimatedValue(midVal, kind), kind, 1000);
    }
  }

  function formatMult(m) {
    var x = Number(m);
    if (!Number.isFinite(x) || x <= 0) return "x1";
    if (Math.abs(x - Math.round(x)) < 0.02) return "x" + String(Math.round(x));
    return "x" + String(x.toFixed(1)).replace(".", ",");
  }

  function boardMetricValue(row, board) {
    if (!row || typeof row !== "object") return 0;
    if (board === "level") return Number(row.exp) || 0;
    if (board === "weekly") return Number(row.weeklyExp) || 0;
    if (board === "messages") return Number(row.messagesTotal) || 0;
    if (board === "voice") return Number(row.voiceTotalSeconds) || 0;
    return 0;
  }

  function sortRowsForBoard(rows, board) {
    var list = Array.isArray(rows) ? rows.slice() : [];
    list.sort(function (a, b) {
      var diff = boardMetricValue(b, board) - boardMetricValue(a, board);
      if (diff !== 0) return diff;
      return (Number(a && a.rank) || 0) - (Number(b && b.rank) || 0);
    });
    return list.map(function (row, idx) {
      var copy = Object.assign({}, row);
      copy.rank = idx + 1;
      return copy;
    });
  }

  function rankClass(rank) {
    var r = Number(rank) || 0;
    if (r <= 0) return "vc-ul-rank vc-ul-rank--n";
    if (r === 1) return "vc-ul-rank vc-ul-rank--1";
    if (r === 2) return "vc-ul-rank vc-ul-rank--2";
    if (r === 3) return "vc-ul-rank vc-ul-rank--3";
    return "vc-ul-rank vc-ul-rank--n";
  }

  function rankInner(rank) {
    if (rank <= 0) return '<span class="vc-ul-rank-num">—</span>';
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

  function profileHref(userId) {
    var id = String(userId || "").trim();
    if (!id) return "/user";
    try {
      if (window.VCUserProfilePage && typeof window.VCUserProfilePage.profilePublicUrl === "function") {
        return window.VCUserProfilePage.profilePublicUrl(id);
      }
    } catch (e) {}
    return "/users/" + encodeURIComponent(id);
  }

  var state = { page: 1, totalPages: 1, loading: false, board: "level", searchUserId: "", filtersOpen: false };

  function setLoading(on, label) {
    state.loading = Boolean(on);
    var overlay = byId("vc-ul-loading");
    var title = overlay ? overlay.querySelector(".vc-ul-loading-title") : null;
    var sub = overlay ? overlay.querySelector(".vc-ul-loading-sub") : null;
    var grid = byId("vc-ul-grid");
    if (overlay) overlay.hidden = !state.loading;
    if (title) title.textContent = label || "Caricamento classifica";
    if (sub) sub.textContent = state.loading ? "Sto aggiornando i dati della community…" : "";
    if (grid) grid.setAttribute("aria-busy", state.loading ? "true" : "false");
  }

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
    var rankAria = rank > 0 ? "Posizione " + String(rank) : "Non in classifica";
    var idShort = String(row.userId || "").slice(0, 10);
    var avSrc = esc(avatarUrl(row));
    var avFb = defaultEmbedAvatarUrl(row);
    return (
      '<div class="vc-ul-card-head">' +
      '<a class="vc-ul-card-user" href="' + esc(profileHref(row.userId)) + '">' +
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
      '" aria-label="' +
      esc(rankAria) +
      '">' +
      rankInner(rank) +
      "</span>" +
      "</div>" +
      '<p class="vc-ul-card-id">ID: ' +
      esc(idShort) +
      "…</p>" +
      "</div>" +
      "</a>" +
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
      '<span class="vc-ul-statbox-val" data-vc-countup="true" data-vc-count-kind="plain" data-vc-count-value="' +
      esc(String(Number(row.level) || 0)) +
      '">' +
      esc(String(row.level != null ? row.level : "0")) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">EXP</span>' +
      '<span class="vc-ul-statbox-val" data-vc-countup="true" data-vc-count-kind="int" data-vc-count-value="' +
      esc(String(Number(row.exp) || 0)) +
      '">' +
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
      '<span class="vc-ul-foot-val" data-vc-countup="true" data-vc-count-kind="percent" data-vc-count-value="' +
      esc(String(pct)) +
      '">' +
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
      '<span class="vc-ul-statbox-val" data-vc-countup="true" data-vc-count-kind="plain" data-vc-count-value="' +
      esc(String(Number(row.level) || 0)) +
      '">' +
      esc(String(row.level != null ? row.level : "0")) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">EXP</span>' +
      '<span class="vc-ul-statbox-val" data-vc-countup="true" data-vc-count-kind="int" data-vc-count-value="' +
      esc(String(Number(row.exp) || 0)) +
      '">' +
      esc(formatIntIt(row.exp)) +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="vc-ul-stat-wide">' +
      '<div class="vc-ul-stat-wide-row">' +
      '<span class="vc-ul-stat-wide-label">EXP settimanale</span>' +
      '<span class="vc-ul-stat-wide-val" data-vc-countup="true" data-vc-count-kind="int" data-vc-count-value="' +
      esc(String(Number(row.weeklyExp) || 0)) +
      '">' +
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
      '<span class="vc-ul-foot-val" data-vc-countup="true" data-vc-count-kind="plain" data-vc-count-value="' +
      esc(String(Number(row.expMultiplier) || 1)) +
      '">' +
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
      '<span class="vc-ul-statbox-val" data-vc-countup="true" data-vc-count-kind="int" data-vc-count-value="' +
      esc(String(Number(row.messagesTotal) || 0)) +
      '">' +
      esc(formatIntIt(row.messagesTotal)) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">Msg settimanali</span>' +
      '<span class="vc-ul-statbox-val" data-vc-countup="true" data-vc-count-kind="int" data-vc-count-value="' +
      esc(String(Number(row.messagesWeekly) || 0)) +
      '">' +
      esc(formatIntIt(row.messagesWeekly)) +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="vc-ul-stat-wide">' +
      '<div class="vc-ul-stat-wide-row">' +
      '<span class="vc-ul-stat-wide-label">Messaggi giornalieri</span>' +
      '<span class="vc-ul-stat-wide-val" data-vc-countup="true" data-vc-count-kind="int" data-vc-count-value="' +
      esc(String(Number(row.messagesDaily) || 0)) +
      '">' +
      esc(formatIntIt(row.messagesDaily)) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-progress vc-ul-progress--inset" title="Messaggi totali rispetto al massimo in questa pagina" aria-hidden="true"><span class="vc-ul-progress-fill vc-ul-progress-fill--msg" style="width:' +
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
      '<span class="vc-ul-statbox-val" data-vc-countup="true" data-vc-count-kind="hours" data-vc-count-value="' +
      esc(String(Number(row.voiceTotalSeconds) || 0)) +
      '">' +
      esc(formatHoursIt(row.voiceTotalSeconds)) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">Ore settimanali</span>' +
      '<span class="vc-ul-statbox-val" data-vc-countup="true" data-vc-count-kind="hours" data-vc-count-value="' +
      esc(String(Number(row.voiceWeeklySeconds) || 0)) +
      '">' +
      esc(formatHoursIt(row.voiceWeeklySeconds)) +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="vc-ul-stat-wide">' +
      '<div class="vc-ul-stat-wide-row">' +
      '<span class="vc-ul-stat-wide-label">Ore giornaliere</span>' +
      '<span class="vc-ul-stat-wide-val" data-vc-countup="true" data-vc-count-kind="hours" data-vc-count-value="' +
      esc(String(Number(row.voiceDailySeconds) || 0)) +
      '">' +
      esc(formatHoursIt(row.voiceDailySeconds)) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-progress vc-ul-progress--inset" title="Ore vocali totali rispetto al massimo in questa pagina" aria-hidden="true"><span class="vc-ul-progress-fill vc-ul-progress-fill--voice" style="width:' +
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
    if (state.searchUserId || state.totalPages <= 1) {
      nav.hidden = true;
      nav.style.display = "none";
      return;
    }
    var tp = Math.max(1, state.totalPages);
    nav.hidden = false;
    nav.style.display = "flex";
    prev.disabled = state.page <= 1;
    next.disabled = state.page >= tp;
    lab.textContent = "Pagina " + state.page + " di " + tp;
  }

  function applyStats(data) {
    var st = data && data.stats ? data.stats : {};
    var board = String((data && data.board) || state.board || "level");
    var rows = sortRowsForBoard((data && data.rows) || [], board);
    var topRow = rows.length ? rows[0] : null;
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
        midLabel.textContent = "Ore vocali più alte";
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
    if (midLabel && midVal && topRow) {
      if (board === "level") {
        midVal.textContent = formatIntIt(topRow.level);
      } else if (board === "weekly") {
        midVal.textContent = formatIntIt(topRow.weeklyExp);
      } else if (board === "messages") {
        midVal.textContent = formatIntIt(topRow.messagesTotal);
      } else if (board === "voice") {
        midVal.textContent = formatHoursIt(topRow.voiceTotalSeconds);
      }
    }
    if (tn && topRow) {
      tn.textContent = String(topRow.username || topRow.displayName || "").trim() || "—";
    }
    if (sub) {
      var blurb = "";
      blurb = "";
      sub.textContent = blurb;
    }
  }

  function applyAnimatedStats(data) {
    var st = data && data.stats ? data.stats : {};
    var board = String((data && data.board) || state.board || "level");
    var rows = sortRowsForBoard((data && data.rows) || [], board);
    var topRow = rows.length ? rows[0] : null;
    var mem = byId("vc-ul-stat-members");
    var midLabel = byId("vc-ul-stat-mid-label");
    var midVal = byId("vc-ul-stat-mid-value");
    var tn = byId("vc-ul-stat-topname");
    var sub = byId("vc-user-leader-sub");
    var countApi = typeof window !== "undefined" ? window.VCCountUp : null;
    var membersValue =
      st.membersApprox != null && Number.isFinite(Number(st.membersApprox))
        ? Number(st.membersApprox)
        : null;

    if (mem) {
      if (membersValue == null) mem.textContent = "—";
      else if (countApi && typeof countApi.set === "function") countApi.set(mem, membersValue, "int");
      else mem.textContent = formatIntIt(membersValue);
    }

    if (midLabel && midVal) {
      var topMetricValue = null;
      var topMetricKind = "int";
      if (board === "level") {
        midLabel.textContent = "Livello più alto";
        topMetricValue = topRow ? Number(topRow.level) || 0 : (st.topLevel != null ? Number(st.topLevel) || 0 : null);
      } else if (board === "weekly") {
        midLabel.textContent = "EXP settimanale più alto";
        topMetricValue = topRow ? Number(topRow.weeklyExp) || 0 : (st.topWeeklyExp != null ? Number(st.topWeeklyExp) || 0 : null);
      } else if (board === "messages") {
        midLabel.textContent = "Messaggi più alti";
        topMetricValue = topRow ? Number(topRow.messagesTotal) || 0 : (st.topMessagesTotal != null ? Number(st.topMessagesTotal) || 0 : null);
      } else if (board === "voice") {
        midLabel.textContent = "Ore vocali più alte";
        topMetricKind = "hours";
        topMetricValue = topRow ? Number(topRow.voiceTotalSeconds) || 0 : (st.topVoiceSeconds != null ? Number(st.topVoiceSeconds) || 0 : null);
      } else {
        midLabel.textContent = "—";
        midVal.textContent = "—";
      }

      if (topMetricValue == null) {
        midVal.textContent = "—";
      } else if (countApi && typeof countApi.set === "function") {
        countApi.set(midVal, topMetricValue, topMetricKind);
      } else if (topMetricKind === "hours") {
        midVal.textContent = formatHoursIt(topMetricValue);
      } else {
        midVal.textContent = formatIntIt(topMetricValue);
      }
    }

    if (tn && topRow) {
      tn.textContent = String(topRow.username || topRow.displayName || "").trim() || "—";
    } else if (tn) {
      tn.textContent = String(st.topPlayerUsername || st.topDisplayName || "—").trim() || "—";
    }

    if (sub) sub.textContent = "";
  }

  function render(data) {
    var grid = byId("vc-ul-grid");
    var empty = byId("vc-ul-empty");
    if (!grid || !empty) return;
    var rows = sortRowsForBoard((data && data.rows) || [], String((data && data.board) || state.board || "level"));
    var board = String((data && data.board) || state.board || "level");
    if (!rows.length) {
      grid.innerHTML = "";
      empty.hidden = false;
      var ico = byId("vc-ul-empty-ico");
      var titleEl = byId("vc-ul-empty-title");
      var msgEl = byId("vc-ul-empty-msg");
      var searchMiss = Boolean(state.searchUserId);
      var loadErr = data && data.loadError === true;
      if (titleEl && msgEl) {
        if (searchMiss && !loadErr) {
          if (ico) {
            ico.className = "fa fa-search vc-ul-empty-ico";
          }
          titleEl.textContent = "Nessun utente trovato";
          msgEl.textContent = "Prova a modificare i filtri di ricerca";
        } else {
          if (ico) {
            ico.className = "fa fa-users vc-ul-empty-ico";
          }
          titleEl.textContent = "Nessun dato classifica disponibile.";
          msgEl.textContent = "";
        }
      }
      state.totalPages = searchMiss ? 1 : Math.max(1, Number(data && data.totalPages) || 1);
      updatePager();
      return;
    }
    empty.hidden = true;
    grid.innerHTML = rows.map(function (r) {
      return renderCard(r, board);
    }).join("");
    animateNumberTargets(grid);
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
      var sid = encodeURIComponent(state.searchUserId);
      url += "&userId=" + sid;
      url += "&id=" + sid;
      url += "&searchUserId=" + sid;
      /* CDN/proxy che ignorano la query o cache GET: varia l’URL e disabilita cache browser */
      url += "&_vcq=" + encodeURIComponent(String(Date.now()));
    }
    setLoading(true, state.page === 1 ? "Caricamento classifica" : "Aggiornamento classifica");
    setState("Caricamento…", false);
    fetch(url, { credentials: "omit", cache: "no-store" })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, body: j };
        });
      })
      .then(function (out) {
        setLoading(false);
        if (!out.ok || !out.body || out.body.ok !== true) {
          var msg =
            (out.body && (out.body.message || out.body.error)) ||
            ("HTTP " + String(out.status || "") + " — dati non disponibili.");
          setState(String(msg), true);
          render({ rows: [], total: 0, totalPages: 1, board: state.board, loadError: true });
          syncSearchUi();
          return;
        }
        setState("", false);
        var body = out.body;
        if (state.searchUserId && body && Array.isArray(body.rows)) {
          var want = String(state.searchUserId);
          var orig = body.rows;
          var filtered = orig.filter(function (r) {
            return String(r.userId || "") === want;
          });
          if (filtered.length !== orig.length) {
            body = Object.assign({}, body, {
              rows: filtered,
              total: filtered.length,
              totalPages: 1,
              page: 1,
              search: true,
              notFound: filtered.length === 0,
            });
          }
        }
        if (state.searchUserId && body) {
          body = Object.assign({}, body, { totalPages: 1, page: 1 });
          state.page = 1;
        }
        if (body.board) state.board = String(body.board);
        applyAnimatedStats(body);
        animateTopStats();
        render(body);
        syncSearchUi();
      })
      .catch(function () {
        setLoading(false);
        setState(
          "Impossibile contattare l’API classifica (rete, proxy verso il bot, risposta non JSON o CORS). Verifica GET /webhooks/site-users e che l’HTTP del bot sia attivo (WEBSITE_PUBLIC_HTTP se lo disabiliti esplicitamente).",
          true,
        );
        render({ rows: [], total: 0, totalPages: 1, board: state.board, loadError: true });
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
        var sidInp = byId("vc-ul-search-id");
        if (sidInp && state.searchUserId) sidInp.value = state.searchUserId;
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
      btn.classList.toggle("vc-ul-filter-tab--open", open);
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
    if (isProfileMode()) return;
    initPager();
    initBoardTabs();
    initFilters();
    setFiltersOpen(false);
    setLoading(true, "Caricamento classifica");
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
