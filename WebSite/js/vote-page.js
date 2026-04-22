(function () {
  var currentUser = null;
  var allRows = [];
  var loadedExtra = 0;
  var EXTRA_STEP = 10;

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_VOTE) || {};
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

  function formatIntIt(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try {
      return Math.round(x).toLocaleString("it-IT");
    } catch (e) {
      return String(Math.round(x));
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

  function profileHref(userId) {
    var id = String(userId || "").trim();
    return id ? "/users/" + encodeURIComponent(id) : "/user";
  }

  function buildApiUrl() {
    var base = resolvedApiUrl();
    if (!base) return "";
    var url = base;
    var userId = String(currentUser && currentUser.id ? currentUser.id : "").trim();
    if (userId) {
      url += (url.indexOf("?") >= 0 ? "&" : "?") + "userId=" + encodeURIComponent(userId);
    }
    return url;
  }

  function renderStats(stats, personal) {
    var totalVotes = Number(stats && stats.totalVotes) || 0;
    var goal = Math.max(1, Number(stats && stats.goal) || 10000);
    var personalVotes = Number(personal && personal.votes) || 0;
    var pct = Math.max(0, Math.min(100, (totalVotes / goal) * 100));

    byId("vc-vote-total").textContent = formatIntIt(totalVotes);
    byId("vc-vote-personal").textContent = formatIntIt(personalVotes);
    byId("vc-vote-progress-fill").style.width = pct.toFixed(2) + "%";
    byId("vc-vote-progress-label").textContent =
      formatIntIt(totalVotes) + " / " + formatIntIt(goal) + " (" + pct.toFixed(1) + "%)";
  }

  function topRowHtml(row) {
    var avatar = String(row.avatarUrl || "").trim() || defaultEmbedAvatarUrl(row.userId);
    return (
      '<a class="vc-vote-list-row" href="' +
      esc(profileHref(row.userId)) +
      '">' +
      '<span class="vc-vote-list-rank">#' +
      esc(String(row.rank || 0)) +
      "</span>" +
      '<img class="vc-vote-list-avatar" src="' +
      esc(avatar) +
      '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' +
      esc(defaultEmbedAvatarUrl(row.userId)) +
      '\'" />' +
      '<span class="vc-vote-list-name">' +
      esc(row.displayName || row.username || "Utente") +
      "</span>" +
      '<span class="vc-vote-list-score">' +
      esc(formatIntIt(row.votes || 0)) +
      "</span>" +
      "</a>"
    );
  }

  function podiumRowHtml(row, order) {
    var avatar = String(row.avatarUrl || "").trim() || defaultEmbedAvatarUrl(row.userId);
    return (
      '<a class="vc-vote-podium-row vc-vote-podium-row--' +
      esc(String(order)) +
      '" href="' +
      esc(profileHref(row.userId)) +
      '">' +
      '<span class="vc-vote-podium-rank">#' +
      esc(String(row.rank || order)) +
      "</span>" +
      '<img class="vc-vote-podium-avatar" src="' +
      esc(avatar) +
      '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' +
      esc(defaultEmbedAvatarUrl(row.userId)) +
      '\'" />' +
      '<span class="vc-vote-podium-name">' +
      esc(row.displayName || row.username || "Utente") +
      "</span>" +
      '<span class="vc-vote-podium-score">' +
      esc(formatIntIt(row.votes || 0)) +
      '<small>voti</small></span>' +
      "</a>"
    );
  }

  function renderTop(rows) {
    allRows = Array.isArray(rows) ? rows.slice() : [];
    loadedExtra = 0;

    var top3 = allRows.slice(0, 3);
    var remaining = allRows.slice(3);
    byId("vc-vote-top-chip").textContent = "Top " + String(allRows.length || 0) + (remaining.length ? " (+" + remaining.length + ")" : "");
    byId("vc-vote-top3").innerHTML = top3
      .map(function (row, idx) {
        return podiumRowHtml(row, idx + 1);
      })
      .join("");
    renderMore();
  }

  function renderMore() {
    var remaining = allRows.slice(3);
    var visible = remaining.slice(0, loadedExtra);
    var moreWrap = byId("vc-vote-more");
    var actions = byId("vc-vote-more-actions");
    var pager = byId("vc-vote-pager");
    var badge = byId("vc-vote-more-badge");
    var loadBtn = byId("vc-vote-load-more");
    var minimizeBtn = byId("vc-vote-minimize");
    var pagerFill = byId("vc-vote-pager-fill");
    var pagerLabel = byId("vc-vote-pager-label");

    moreWrap.hidden = visible.length === 0;
    moreWrap.innerHTML = visible.map(topRowHtml).join("");
    actions.hidden = remaining.length === 0;
    pager.hidden = remaining.length === 0 || visible.length === 0;

    if (remaining.length > 0) {
      var left = Math.max(0, remaining.length - loadedExtra);
      badge.textContent = "+" + String(Math.min(EXTRA_STEP, left || EXTRA_STEP));
      loadBtn.hidden = loadedExtra >= remaining.length;
      minimizeBtn.hidden = loadedExtra === 0;
      pagerFill.style.width = (remaining.length ? (visible.length / remaining.length) * 100 : 0).toFixed(2) + "%";
      pagerLabel.textContent = String(visible.length) + " / " + String(remaining.length);
    }
  }

  function initButtons() {
    var loadBtn = byId("vc-vote-load-more");
    var minimizeBtn = byId("vc-vote-minimize");
    if (loadBtn) {
      loadBtn.addEventListener("click", function () {
        var remaining = Math.max(0, allRows.length - 3);
        loadedExtra = Math.min(remaining, loadedExtra + EXTRA_STEP);
        renderMore();
      });
    }
    if (minimizeBtn) {
      minimizeBtn.addEventListener("click", function () {
        loadedExtra = 0;
        renderMore();
      });
    }
  }

  function fetchVotes() {
    var url = buildApiUrl();
    if (!url) return;
    fetch(url, { credentials: "omit", cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (body) {
        if (!body || body.ok !== true) return;
        renderStats(body.stats || {}, body.personal || {});
        renderTop(Array.isArray(body.rows) ? body.rows : []);
      })
      .catch(function () {});
  }

  function main() {
    if (!byId("vc-vote-live-shell")) return;
    currentUser = (typeof window !== "undefined" && window.__VC_DISCORD_PROFILE) || null;
    initButtons();
    fetchVotes();
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    currentUser = ev && ev.detail ? ev.detail.user || null : null;
    fetchVotes();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
