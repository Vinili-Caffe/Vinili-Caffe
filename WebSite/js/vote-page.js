(function () {
  "use strict";
    var currentUser = null;
  var allRows = [];
  var loadedExtra = 0;
  var EXTRA_STEP = 10;
  var livePollTimer = null;
  var isTouch =
    typeof window !== "undefined" &&
    (("ontouchstart" in window) ||
      (navigator && Number(navigator.maxTouchPoints || 0) > 0));
  var LIVE_POLL_MS = isTouch ? 90000 : 45000;
  var hasLoadedOk = false;
  var lastErrorToastAt = 0;
  var lastFetchAt = 0;
  var fetchInFlight = false;
  var ERROR_TOAST_GAP_MS = isTouch ? 90000 : 12000;
  var firstLoadRetryDone = false;
  var pendingErrorToastTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function t(key, vars) {
    if (window.VcI18n && typeof window.VcI18n.t === "function") {
      var out = window.VcI18n.t(key, vars);
      if (out && out !== key) return out;
    }
    var fallbacks = {
      "vote.topN": "Top {n}",
      "vote.loadMore": "Carica altri {n}",
      "vote.votesSuffix": "voti",
      "vote.notAvailable": "Non disponibile",
      "vote.statsUnavailable": "Statistiche voti temporaneamente non disponibili.",
      "vote.loadError": "Non riesco a caricare i voti in questo momento.",
      "vote.userFallback": "Utente",
      "vote.minimize": "Minimizza",
    };
    var fb = fallbacks[key];
    if (!fb) return key;
    vars = vars || {};
    return String(fb).replace(/\{(\w+)\}/g, function (_m, k) {
      return vars[k] != null ? String(vars[k]) : "";
    });
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
    if (isLocalFrontendOrigin() && local && local !== "#") return local;
    var remote = String(c.apiUrl || "").trim();
    /* voteApiBakeFix1: leftover bake used "#" for unknown {{VOTE_API_URL}} */
    if (!remote || remote === "#" || remote === "about:blank") {
      return "/webhooks/site-vote";
    }
    return remote;
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

  function siteAvatarFallback() {
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        return window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eFb) {}
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function voteAvatarImg(row, className, size) {
    var sz = Math.max(32, Number(size) || 48);
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.imgHtml === "function") {
        return window.VcDiscordAvatar.imgHtml({
          url: row && row.avatarUrl,
          userId: row && row.userId,
          size: sz,
          className: className,
          loading: "lazy",
        });
      }
    } catch (eHub) {}
    var src = String((row && row.avatarUrl) || "").trim();
    if (!src || /cdn\.discordapp\.com\/embed\/avatars\//i.test(src)) src = siteAvatarFallback();
    var fb = siteAvatarFallback().replace(/'/g, "%27");
    return (
      '<img class="' +
      esc(className) +
      ' vc-avatar vc-avatar--pending" src="' +
      esc(src) +
      '" alt="" width="' +
      sz +
      '" height="' +
      sz +
      '" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1" data-user-id="' +
      esc(String((row && row.userId) || "")) +
      '" onerror="this.onerror=null;this.src=\'' +
      fb +
      '\'" />'
    );
  }

  function profileHref(userId) {
    var id = String(userId || "").trim();
    return id ? "/user/?id=" + encodeURIComponent(id) : "/user";
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

  function setText(id, text) {
    var el = byId(id);
    if (el) el.textContent = text;
  }

  function showVoteToast(message, isError) {
    var msg = String(message || "").trim();
    if (!msg) return;
    var now = Date.now();
    if (isError && now - lastErrorToastAt < ERROR_TOAST_GAP_MS) return;
    if (isError) lastErrorToastAt = now;
    var opts = { ms: isError ? 3600 : 1600 };
    try {
      if (typeof window.__vcShowSiteToast === "function") {
        window.__vcShowSiteToast(msg, Boolean(isError), opts);
        return;
      }
    } catch (eExpo) {}
    try {
      if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
        window.VcSiteToast.show(msg, Boolean(isError), opts);
        return;
      }
    } catch (eToast) {}
    try {
      if (window.VcDashToast && typeof window.VcDashToast.show === "function") {
        window.VcDashToast.show(msg, Boolean(isError), opts);
        return;
      }
    } catch (eDash) {}
    /* Inline fallback (vote page may lack vc-site-toast.js) */
    try {
      var host = document.getElementById("vc-site-toast-host");
      if (!host) {
        host = document.createElement("div");
        host.id = "vc-site-toast-host";
        host.className = "vc-dash-save-toast-host vc-site-toast-host";
        host.setAttribute("aria-live", "polite");
        host.setAttribute("aria-atomic", "true");
        document.body.appendChild(host);
      }
      host.innerHTML = "";
      var toast = document.createElement("div");
      toast.className = "vc-dash-save-toast" + (isError ? " is-error" : "");
      toast.setAttribute("role", "status");
      var ico = document.createElement("span");
      ico.className = "vc-dash-save-toast__icon";
      ico.setAttribute("aria-hidden", "true");
      ico.innerHTML = isError
        ? '<i class="fa fa-times" aria-hidden="true"></i>'
        : '<i class="fa fa-check" aria-hidden="true"></i>';
      var p = document.createElement("p");
      p.className = "vc-dash-save-toast__text";
      p.textContent = msg;
      toast.appendChild(ico);
      toast.appendChild(p);
      host.appendChild(toast);
      requestAnimationFrame(function () {
        toast.classList.add("is-visible");
      });
      window.setTimeout(function () {
        toast.classList.add("is-leaving");
        toast.classList.remove("is-visible");
        window.setTimeout(function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 200);
      }, opts.ms);
    } catch (eInline) {}
  }

  function renderStats(stats, personal) {
    var totalVotes = Number(stats && stats.totalVotes) || 0;
    var goal = Math.max(1, Number(stats && stats.goal) || 10000);
    var personalVotes = Number(personal && personal.votes) || 0;
    var pct = Math.max(0, Math.min(100, (totalVotes / goal) * 100));

    setText("vc-vote-total", formatIntIt(totalVotes));
    setText("vc-vote-personal", formatIntIt(personalVotes));
    var fill = byId("vc-vote-progress-fill");
    if (fill) fill.style.width = pct.toFixed(2) + "%";
    setText(
      "vc-vote-progress-label",
      formatIntIt(totalVotes) + " / " + formatIntIt(goal) + " (" + pct.toFixed(1) + "%)",
    );
  }

  function topRowHtml(row) {
    return (
      '<a class="vc-vote-list-row" href="' +
      esc(profileHref(row.userId)) +
      '">' +
      '<span class="vc-vote-list-rank">#' +
      esc(String(row.rank || 0)) +
      "</span>" +
      voteAvatarImg(row, "vc-vote-list-avatar", 40) +
      '<span class="vc-vote-list-name">' +
      esc(row.displayName || row.username || t("vote.userFallback")) +
      "</span>" +
      '<span class="vc-vote-list-score">' +
      esc(formatIntIt(row.votes || 0)) +
      "</span>" +
      "</a>"
    );
  }

  function podiumRowHtml(row, order) {
    return (
      '<a class="vc-vote-podium-row vc-vote-podium-row--' +
      esc(String(order)) +
      '" href="' +
      esc(profileHref(row.userId)) +
      '">' +
      '<span class="vc-vote-podium-rank">#' +
      esc(String(row.rank || order)) +
      "</span>" +
      voteAvatarImg(row, "vc-vote-podium-avatar", 56) +
      '<span class="vc-vote-podium-name">' +
      esc(row.displayName || row.username || t("vote.userFallback")) +
      "</span>" +
      '<span class="vc-vote-podium-score">' +
      esc(formatIntIt(row.votes || 0)) +
      "<small>" +
      esc(t("vote.votesSuffix")) +
      "</small></span>" +
      "</a>"
    );
  }

  function renderTop(rows) {
    allRows = Array.isArray(rows) ? rows.slice() : [];
    loadedExtra = 0;

    var top3 = allRows.slice(0, 3);
    setText("vc-vote-top-chip", t("vote.topN", { n: allRows.length || 0 }));
    var top3El = byId("vc-vote-top3");
    if (top3El) {
      top3El.innerHTML = top3
        .map(function (row, idx) {
          return podiumRowHtml(row, idx + 1);
        })
        .join("");
    }
    renderMore();
  }

  function clearPendingVoteErrorToast() {
    if (pendingErrorToastTimer) {
      window.clearTimeout(pendingErrorToastTimer);
      pendingErrorToastTimer = null;
    }
  }

  /* voteLoadToast3: niente toast sul primo fail se arriva un retry/poll ok subito dopo */
  function renderVoteError(message, opts) {
    opts = opts || {};
    var msg = message || t("vote.loadError");
    var soft = opts.soft === true || hasLoadedOk || allRows.length > 0;
    if (soft) {
      clearPendingVoteErrorToast();
      return;
    }
    /* Prima del retry / secondo tentativo: silenzioso (evita flash toast → dati ok). */
    if (!hasLoadedOk && !firstLoadRetryDone) {
      return;
    }
    clearPendingVoteErrorToast();
    pendingErrorToastTimer = window.setTimeout(function () {
      pendingErrorToastTimer = null;
      if (hasLoadedOk || allRows.length > 0) return;
      showVoteToast(msg, true);
    }, 900);
    var top3 = byId("vc-vote-top3");
    var chip = byId("vc-vote-top-chip");
    if (chip) chip.textContent = t("vote.notAvailable");
    if (top3 && !String(top3.innerHTML || "").trim()) {
      top3.innerHTML =
        '<div class="vc-vote-empty-state" aria-hidden="true">' +
        '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>' +
        "<span>" +
        esc(t("vote.statsUnavailable")) +
        "</span></div>";
    }
  }

  function renderMore() {
    var remaining = allRows.slice(3);
    var visible = remaining.slice(0, loadedExtra);
    var moreWrap = byId("vc-vote-more");
    var actions = byId("vc-vote-more-actions");
    var pager = byId("vc-vote-pager");
    var loadBtn = byId("vc-vote-load-more");
    var minimizeBtn = byId("vc-vote-minimize");
    var pagerFill = byId("vc-vote-pager-fill");
    var pagerLabel = byId("vc-vote-pager-label");
    if (!moreWrap || !actions || !pager) return;

    moreWrap.hidden = visible.length === 0;
    moreWrap.innerHTML = visible.map(topRowHtml).join("");
    var noExtraRows = remaining.length === 0;
    actions.hidden = noExtraRows;
    pager.hidden = noExtraRows || visible.length === 0;

    if (remaining.length > 0) {
      var left = Math.max(0, remaining.length - loadedExtra);
      var nextChunk = Math.min(EXTRA_STEP, left);
      var allExtraLoaded = left === 0;
      if (loadBtn) {
        loadBtn.hidden = allExtraLoaded;
        loadBtn.disabled = allExtraLoaded;
        loadBtn.setAttribute("aria-hidden", allExtraLoaded ? "true" : "false");
      }
      if (minimizeBtn) {
        minimizeBtn.hidden = loadedExtra === 0;
        minimizeBtn.setAttribute("aria-hidden", loadedExtra === 0 ? "true" : "false");
      }
      if (!allExtraLoaded) {
        loadBtn.innerHTML =
          '<i class="fa fa-angle-down" aria-hidden="true"></i> <span id="vc-vote-load-more-text">' +
          esc(t("vote.loadMore", { n: nextChunk })) +
          '</span> <span class="vc-vote-more-badge" id="vc-vote-more-badge">+' +
          String(nextChunk) +
          "</span>";
      }
      pagerFill.style.width = (remaining.length ? (visible.length / remaining.length) * 100 : 0).toFixed(2) + "%";
      pagerLabel.textContent = String(visible.length) + " / " + String(remaining.length);
    } else if (loadBtn && minimizeBtn && pagerFill && pagerLabel) {
      loadBtn.hidden = true;
      minimizeBtn.hidden = true;
      pagerFill.style.width = "0%";
      pagerLabel.textContent = "0 / 0";
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

  function fetchVotes(opts) {
    opts = opts || {};
    var force = opts.force === true;
    var now = Date.now();
    if (!force && fetchInFlight) return;
    if (!force && lastFetchAt && now - lastFetchAt < (isTouch ? 18000 : 8000)) return;

    var url = buildApiUrl();
    if (!url) {
      renderVoteError(t("vote.loadError"), { soft: hasLoadedOk });
      return;
    }
    var cacheKey = "vote:" + String((currentUser && currentUser.id) || "anon");
    lastFetchAt = now;
    fetchInFlight = true;

    function applyOut(out) {
      var body = out && out.body;
      var softFail =
        Boolean(out && (out.blocked || out.status === 429)) || hasLoadedOk || allRows.length > 0;
      /* Client cool-down / 429: keep board, never toast */
      if (out && (out.blocked || out.status === 429)) {
        if (body && body.ok === true) {
          try {
            clearPendingVoteErrorToast();
            renderStats(body.stats || {}, body.personal || {});
            renderTop(Array.isArray(body.rows) ? body.rows : []);
            hasLoadedOk = true;
          } catch (eSoft) {}
        }
        return;
      }
      if (!out || !out.ok) {
        renderVoteError(t("vote.loadError"), { soft: softFail });
        return;
      }
      if (!body || body.ok !== true) {
        if (!hasLoadedOk) renderVoteError(t("vote.loadError"), { soft: softFail });
        return;
      }
      try {
        clearPendingVoteErrorToast();
        renderStats(body.stats || {}, body.personal || {});
        renderTop(Array.isArray(body.rows) ? body.rows : []);
        hasLoadedOk = true;
      } catch (eRender) {
        renderVoteError(t("vote.loadError"), { soft: hasLoadedOk });
      }
    }

    function done() {
      fetchInFlight = false;
    }

    if (window.VcApiCache) {
      window.VcApiCache.fetchWithCache(cacheKey, url, {
        ttlMs: isTouch ? 90000 : 45000,
        staleMs: isTouch ? 1200000 : 300000,
        persistMs: isTouch ? 1800000 : 0,
        /* voteMobileFast1: shorter client wait — API is cache-only now */
        timeoutMs: isTouch ? 18000 : 12000,
        fetchInit: { credentials: "omit", cache: "no-store" },
        onStale: function (cached) {
          if (cached) applyOut(cached);
        },
      })
        .then(function (out) {
          var okBody = out && out.ok && out.body && out.body.ok === true;
          /* Primo fail: ritenta in silenzio; toast solo se fallisce anche il 2°. */
          if (force && !hasLoadedOk && !firstLoadRetryDone && !okBody) {
            firstLoadRetryDone = true;
            window.setTimeout(function () {
              fetchVotes({ force: true });
            }, isTouch ? 600 : 350);
            return;
          }
          applyOut(out);
        })
        .catch(function () {
          if (force && !hasLoadedOk && !firstLoadRetryDone) {
            firstLoadRetryDone = true;
            window.setTimeout(function () {
              fetchVotes({ force: true });
            }, isTouch ? 600 : 350);
            return;
          }
          renderVoteError(t("vote.loadError"), { soft: hasLoadedOk || allRows.length > 0 });
        })
        .then(done, done);
      return;
    }

    fetch(url, { credentials: "omit", cache: "no-store" })
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, status: r.status, body: body };
        });
      })
      .then(function (out) {
        var okBody = out && out.ok && out.body && out.body.ok === true;
        if (force && !hasLoadedOk && !firstLoadRetryDone && !okBody) {
          firstLoadRetryDone = true;
          window.setTimeout(function () {
            fetchVotes({ force: true });
          }, isTouch ? 600 : 350);
          return;
        }
        applyOut(out);
      })
      .catch(function () {
        if (force && !hasLoadedOk && !firstLoadRetryDone) {
          firstLoadRetryDone = true;
          window.setTimeout(function () {
            fetchVotes({ force: true });
          }, isTouch ? 600 : 350);
          return;
        }
        renderVoteError(t("vote.loadError"), { soft: hasLoadedOk || allRows.length > 0 });
      })
      .then(done, done);
  }

  function stopLiveVotesPolling() {
    if (livePollTimer) {
      clearInterval(livePollTimer);
      livePollTimer = null;
    }
  }

  function startLiveVotesPolling() {
    stopLiveVotesPolling();
    livePollTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      fetchVotes({ force: false });
    }, LIVE_POLL_MS);
  }

  function markVoteResume() {
    try {
      localStorage.setItem("vc-pwa-resume", JSON.stringify({ p: "/vote/", t: Date.now() }));
    } catch (e) {}
  }

  function isExternalVotePlatformHref(href) {
    try {
      var host = String(new URL(String(href || ""), window.location.href).hostname || "").toLowerCase();
      return host.indexOf("top.gg") !== -1 || host.indexOf("discadia.com") !== -1;
    } catch (e) {
      return false;
    }
  }

  function initVoteResume() {
    var wrap = byId("vote-platforms");
    if (wrap) {
      wrap.addEventListener("click", function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
        if (!a) return;
        if (!isExternalVotePlatformHref(a.getAttribute("href") || "")) return;
        markVoteResume();
      });
    }
  }

  function initVoteReveal() {
    var nodes = document.querySelectorAll(".vc-vote-reveal");
    if (!nodes || !nodes.length) return;
    if (typeof window === "undefined" || typeof window.IntersectionObserver !== "function") {
      for (var i = 0; i < nodes.length; i += 1) nodes[i].classList.add("is-inview");
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i += 1) {
          var entry = entries[i];
          if (entry.isIntersecting && entry.intersectionRatio >= 0.12) {
            entry.target.classList.add("is-inview");
          } else if (!entry.isIntersecting) {
            entry.target.classList.remove("is-inview");
          }
        }
      },
      {
        root: null,
        rootMargin: "0px 0px -6% 0px",
        threshold: [0, 0.12, 0.22, 0.4, 0.7],
      }
    );
    for (var n = 0; n < nodes.length; n += 1) observer.observe(nodes[n]);
  }

  function main() {
    if (!byId("vc-vote-live-shell")) return;
    currentUser = (typeof window !== "undefined" && window.__VC_DISCORD_PROFILE) || null;
    initVoteReveal();
    initButtons();
    initVoteResume();
    fetchVotes({ force: true });
    startLiveVotesPolling();
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    currentUser = ev && ev.detail ? ev.detail.user || null : null;
    fetchVotes({ force: true });
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") fetchVotes({ force: false });
  });

  window.addEventListener("vc:site-api-refetch", function () {
    if (!byId("vc-vote-live-shell")) return;
    fetchVotes({ force: true });
  });

  window.addEventListener("beforeunload", stopLiveVotesPolling);

  document.addEventListener("vc:langchange", function () {
    if (!byId("vc-vote-live-shell")) return;
    var keepExtra = loadedExtra;
    renderTop(allRows);
    loadedExtra = keepExtra;
    renderMore();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();