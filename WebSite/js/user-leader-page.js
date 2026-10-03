(function () {
  var PER_PAGE = 9; /* ulNineAlways1: fisso 9 (no VcPerf lite→6) */
  /* ulNineLoadUnlock1: API lite max9 + silent success spegne loader */

  function isProfileMode() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var id = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
      if (/^\d{17,20}$/.test(id)) return true;
      var m = String(window.location.pathname || "").match(/^\/users?\/(\d{17,20})\/?$/);
      if (m) return true;
      if (document.documentElement.classList.contains("vc-user-profile-route")) return true;
    } catch (eUrl) {}
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
    if (isLocalFrontendOrigin() && local && local !== "#" && local.indexOf("{{") < 0) return local;
    var api = String(c.apiUrl || "").trim();
    if (!api || api === "#" || api.indexOf("{{") >= 0) return "/webhooks/site-users";
    try {
      if (typeof window !== "undefined") {
        var u = new URL(api, window.location.origin);
        var currentHost = String(window.location.hostname || "").replace(/^www\./i, "").toLowerCase();
        var apiHost = String(u.hostname || "").replace(/^www\./i, "").toLowerCase();
        if (currentHost && apiHost && currentHost === apiHost) {
          return window.location.origin + u.pathname + u.search;
        }
      }
    } catch (e) {}
    return api;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function avatarUrl(row) {
    try {
      if (window.VcDiscordIdentity && typeof window.VcDiscordIdentity.pickAvatarUrl === "function") {
        var picked = window.VcDiscordIdentity.pickAvatarUrl(row, 128);
        if (picked) return picked;
      }
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.pickAvatarUrl === "function") {
        var pickedAv = window.VcDiscordAvatar.pickAvatarUrl(row, 128);
        if (pickedAv) return pickedAv;
      }
    } catch (ePick) {}
    var fromApi = String(row.avatarUrl || "").trim();
    if (/^https?:\/\//i.test(fromApi)) {
      try {
        var isGuild = /\/guilds\/\d+\/users\//i.test(fromApi);
        if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.resolveUrl === "function") {
          return window.VcDiscordAvatar.resolveUrl(
            fromApi,
            128,
            isGuild ? row.memberAvatar || "" : row.avatar,
            row.userId,
          );
        }
        if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.preferAnimatedUrl === "function") {
          return window.VcDiscordAvatar.preferAnimatedUrl(fromApi, 128);
        }
      } catch (eAnim) {}
      return fromApi;
    }
    var id = String(row.userId || "").trim();
    var av = String(row.avatar || "").trim();
    if (id && av) {
      try {
        if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.buildFromParts === "function") {
          var built = window.VcDiscordAvatar.buildFromParts(id, av, 128);
          if (built) return built;
        }
      } catch (eBuild) {}
      var ext = /^a_/i.test(av) ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + id + "/" + av + "." + ext + "?size=128";
    }
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        return window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eFb) {}
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
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
    if (kind === "mult") return formatMult(n);
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
    if (!text || text === "—") return 0;
    if (kind === "hours") {
      var hours = parseFloat(text.replace(",", ".").replace(/[^\d.,-]/g, ""));
      return Number.isFinite(hours) ? hours * 3600 : 0;
    }
    if (kind === "mult") {
      var mt = text.replace(/^x/i, "").replace(",", ".").trim();
      var mx = parseFloat(mt.replace(/[^\d.-]/g, ""));
      return Number.isFinite(mx) ? mx : 0;
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
      if (state.board === "weekly" || state.board === "messages" || state.board === "minigames") kind = "int";
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
    if (board === "minigames") return Number(row.minigameTotalExp) || 0;
    return 0;
  }

  function sortRowsForBoard(rows, board) {
    var list = Array.isArray(rows) ? rows.slice() : [];
    list.sort(function (a, b) {
      var diff = boardMetricValue(b, board) - boardMetricValue(a, board);
      if (diff !== 0) return diff;
      return (Number(a && a.rank) || 0) - (Number(b && b.rank) || 0);
    });
    var page = Math.max(1, Number(state.page) || 1);
    var offset = (page - 1) * PER_PAGE;
    return list.map(function (row, idx) {
      var copy = Object.assign({}, row);
      var apiRank = Number(row && row.rank) || 0;
            if (state.searchUserId && apiRank > 0) {
        copy.rank = apiRank;
      } else {
        copy.rank = offset + idx + 1;
      }
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
    var r = Number(rank) || 0;
    if (r <= 0) return '<span class="vc-ul-rank-num">—</span>';
    /* ulPodioMedal1: stesse emoji podio di /vote/ (oro/argento/bronzo), non stella unica */
    if (r >= 1 && r <= 3) {
      return (
        '<img class="vc-ul-rank-medal" src="/images/vc-podio-' +
        String(r) +
        '.png" alt="" width="40" height="40" decoding="async" draggable="false" data-vc-emoji="VC_Podio' +
        String(r) +
        '" />'
      );
    }
    return '<span class="vc-ul-rank-num">#' + esc(String(r)) + "</span>";
  }

  function defaultEmbedAvatarUrl() {
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        return window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eFb) {}
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function profileHref(userId) {
    var id = String(userId || "").trim();
    if (!id) return "/user";
    try {
      if (window.VCUserProfilePage && typeof window.VCUserProfilePage.profilePublicUrl === "function") {
        return window.VCUserProfilePage.profilePublicUrl(id);
      }
    } catch (e) {}
    return "/user/?id=" + encodeURIComponent(id);
  }

  function prefetchProfileWarm(userId) {
    var id = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(id)) return;
    try {
      if (window.__VC_PROFILE_WARM_IDS && window.__VC_PROFILE_WARM_IDS[id]) return;
      if (!window.__VC_PROFILE_WARM_IDS) window.__VC_PROFILE_WARM_IDS = {};
      window.__VC_PROFILE_WARM_IDS[id] = 1;
    } catch (eMark) {}
    try {
      var apiBase = "";
      try {
        apiBase = String((window.__VC_USER_LEADER && window.__VC_USER_LEADER.apiUrl) || "").trim();
      } catch (eApi) {}
      if (!apiBase || apiBase === "#" || /\{\{/.test(apiBase)) apiBase = "/webhooks/site-users";
      var prefetchUrl =
        apiBase +
        (apiBase.indexOf("?") >= 0 ? "&" : "?") +
        "board=profile&userId=" +
        encodeURIComponent(id) +
        "&perPage=1";
      if (window.VcApiCache && typeof window.VcApiCache.prefetchIdle === "function") {
        window.VcApiCache.prefetchIdle(window.VcApiCache.keyFor(prefetchUrl, { scope: "profile" }), prefetchUrl, {
          ttlMs: 90000,
          staleMs: 600000,
          persistMs: 30 * 60 * 1000,
          timeoutMs: 12000,
        });
        return;
      }
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = window.setTimeout(function () {
        try {
          if (ctrl) ctrl.abort();
        } catch (eAb) {}
      }, 12000);
      fetch(prefetchUrl, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        signal: ctrl ? ctrl.signal : undefined,
        headers: { Accept: "application/json" },
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (body) {
              var payload = { httpOk: Boolean(res && res.ok), body: body || {} };
              try {
                if (payload.httpOk && payload.body && payload.body.ok) {
                  var rec = JSON.stringify({ expireAt: Date.now() + 90000, value: payload });
                  sessionStorage.setItem("vc:profilecache:" + prefetchUrl, rec);
                }
              } catch (eStore) {}
              return payload;
            });
        })
        .catch(function () {
          return null;
        })
        .finally(function () {
          try {
            window.clearTimeout(timer);
          } catch (eT) {}
        });
    } catch (ePref) {}
  }

  var state = { page: 1, totalPages: 1, loading: false, board: "level", searchUserId: "", filtersOpen: false, renderFingerprint: "" };
  var liveUsersPollTimer = null;
  var LIVE_USERS_POLL_MS = 45000;
  var USERS_CACHE_TTL_MS = 60000;
  var USERS_STALE_TTL_MS = 10 * 60 * 1000;
  var USERS_FETCH_TIMEOUT_MS = 10000;
  var usersMemoryCache = new Map();
  var pendingScrollToCards = false;
  var pendingKeepScrollY = 0;
  var leaderPrefetchConsumed = false;

  function fetchWithTimeout(url, options, timeoutMs) {
    var ms = Math.max(1000, Number(timeoutMs) || USERS_FETCH_TIMEOUT_MS);
    var opts = options || {};
    if (typeof AbortController === "undefined") {
      return fetch(url, opts);
    }
    var ctrl = new AbortController();
    var timer = setTimeout(function () {
      try {
        ctrl.abort();
      } catch (e) {}
    }, ms);
    var merged = Object.assign({}, opts, { signal: ctrl.signal });
    return fetch(url, merged).finally(function () {
      clearTimeout(timer);
    });
  }

  function usersCacheKey(url) {
    return "vc:userscache:" + String(url || "");
  }

  function readUsersSessionCache(key, now, allowStale) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.value) {
        sessionStorage.removeItem(key);
        return null;
      }
      var exp = Number(parsed.expireAt);
      if (!Number.isFinite(exp)) {
        sessionStorage.removeItem(key);
        return null;
      }
      if (exp > now) return { value: parsed.value, stale: false };
      var staleUntil = Number(parsed.staleUntil);
      if (!Number.isFinite(staleUntil)) staleUntil = exp + USERS_STALE_TTL_MS;
      if (allowStale && staleUntil > now) return { value: parsed.value, stale: true };
      sessionStorage.removeItem(key);
      return null;
    } catch (e) {
      return null;
    }
  }

  function writeUsersSessionCache(key, value, ttlMs, now) {
    try {
      var ttl = Math.max(1, Number(ttlMs) || USERS_CACHE_TTL_MS);
      sessionStorage.setItem(
        key,
        JSON.stringify({
          expireAt: now + ttl,
          staleUntil: now + ttl + USERS_STALE_TTL_MS,
          value: value,
        }),
      );
    } catch (e) {}
  }

  function takeLeaderPrefetch(url) {
    try {
      if (leaderPrefetchConsumed) return null;
      var pref = window.__VC_LEADER_PREFETCH;
      if (!pref || !pref.promise) return null;
      var want = String(url || "");
      var got = String(pref.url || "");
            function boardOf(u) {
        try {
          return new URL(u, window.location.origin).searchParams.get("board") || "level";
        } catch (e) {
          return "level";
        }
      }
      function pageOf(u) {
        try {
          return new URL(u, window.location.origin).searchParams.get("page") || "1";
        } catch (e) {
          return "1";
        }
      }
      if (boardOf(want) !== boardOf(got) || pageOf(want) !== pageOf(got)) return null;
      leaderPrefetchConsumed = true;
      try {
        window.__VC_LEADER_PREFETCH = null;
      } catch (eClear) {}
      return Promise.resolve(pref.promise).then(function (out) {
        if (out && typeof out.ok === "boolean") return out;
        if (window.__VC_LEADER_PREFETCH_RESULT) return window.__VC_LEADER_PREFETCH_RESULT;
        return out || { ok: false, status: 0, body: {} };
      });
    } catch (ePref) {
      return null;
    }
  }

  function cachedUsersFetch(url, opts) {
    var useCache = Boolean(opts && opts.useCache);
    var ttl = Math.max(1, Number((opts && opts.ttlMs) || USERS_CACHE_TTL_MS));
    var allowStale = Boolean(opts && opts.allowStale);
    var onStale = opts && typeof opts.onStale === "function" ? opts.onStale : null;

    function networkWithRetry() {
      var headers = { Accept: "application/json" };
      try {
        if (window.VcPerf && typeof window.VcPerf.apiHeaders === "function") {
          headers = window.VcPerf.apiHeaders(headers);
        }
      } catch (eH) {}
      return fetchWithTimeout(
        url,
        { credentials: "omit", cache: "no-store", headers: headers },
        USERS_FETCH_TIMEOUT_MS,
      ).then(function (r) {
        if (r && r.status === 429) {
          try {
            if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
              window.VcApiCache.noteWebhook429(Number(r.headers.get("Retry-After") || "0"), url);
            }
          } catch (e429) {}
        }
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, body: j };
        });
      }).catch(function (err) {
        var timedOut =
          err &&
          (err.name === "AbortError" ||
            String(err.message || "")
              .toLowerCase()
              .indexOf("abort") >= 0);
        if (!timedOut) throw err;
        try {
          var overlay = document.getElementById("vc-ul-loading");
          var sub = overlay ? overlay.querySelector(".vc-ul-loading-sub") : null;
          if (sub) sub.textContent = "Ancora un momento, sto preparando la pagina…";
        } catch (eSub) {}
        return fetchWithTimeout(
          url,
          { credentials: "omit", cache: "no-store", headers: headers },
          USERS_FETCH_TIMEOUT_MS,
        ).then(function (r) {
          if (r && r.status === 429) {
            try {
              if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
                window.VcApiCache.noteWebhook429(Number(r.headers.get("Retry-After") || "0"), url);
              }
            } catch (e429b) {}
          }
          return r.json().then(function (j) {
            return { ok: r.ok, status: r.status, body: j };
          });
        });
      });
    }

    function toPayload(raw) {
      if (!raw) return { ok: false, status: 0, body: {} };
      if (raw.body && typeof raw.ok === "boolean") return raw;
      return { ok: Boolean(raw.ok), status: Number(raw.status) || 0, body: raw.body || {} };
    }

    var prefP = takeLeaderPrefetch(url);
    if (prefP) {
      return prefP.then(function (payload) {
        return toPayload(payload);
      });
    }

    if (!useCache) {
      return networkWithRetry();
    }

    if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
      var cacheKey = window.VcApiCache.keyFor(String(url || ""), { scope: "users" });
      return window.VcApiCache
        .fetchWithCache(cacheKey, url, {
          ttlMs: ttl,
          staleMs: USERS_STALE_TTL_MS,
          persistMs: 15 * 60 * 1000,
          timeoutMs: USERS_FETCH_TIMEOUT_MS,
          useCache: true,
          fetchInit: {
            credentials: "omit",
            cache: "no-store",
            headers: (function () {
              var headers = { Accept: "application/json" };
              try {
                if (window.VcPerf && typeof window.VcPerf.apiHeaders === "function") {
                  headers = window.VcPerf.apiHeaders(headers);
                }
              } catch (eH2) {}
              return headers;
            })(),
          },
          onStale: allowStale ? onStale : null,
        })
        .then(function (raw) {
          return toPayload(raw);
        })
        .catch(function () {
          return networkWithRetry();
        });
    }

    return networkWithRetry();
  }

  function clearLeaderPending(opts) {
    var shouldScroll = !(opts && opts.scroll === false);
    var root = document.documentElement;

    function hideLoader() {
      try {
        var overlay = byId("vc-ul-loading");
        if (overlay) {
          overlay.hidden = true;
          overlay.setAttribute("hidden", "");
          overlay.removeAttribute("data-vc-loader-blocking");
          overlay.style.setProperty("display", "none", "important");
          overlay.style.setProperty("pointer-events", "none", "important");
        }
      } catch (eOv) {}
    }

    function unlockScrollStyles() {
      try {
        var html = document.documentElement;
        var body = document.body;
        if (html) {
          html.style.removeProperty("overflow");
          html.style.removeProperty("overflow-x");
          html.style.removeProperty("overflow-y");
          html.style.removeProperty("height");
          html.style.removeProperty("max-height");
          html.style.removeProperty("touch-action");
        }
        if (body) {
          body.style.removeProperty("position");
          body.style.removeProperty("inset");
          body.style.removeProperty("top");
          body.style.removeProperty("right");
          body.style.removeProperty("bottom");
          body.style.removeProperty("left");
          body.style.removeProperty("width");
          body.style.removeProperty("overflow");
          body.style.removeProperty("overflow-x");
          body.style.removeProperty("overflow-y");
          body.style.removeProperty("height");
          body.style.removeProperty("max-height");
          body.style.removeProperty("touch-action");
        }
      } catch (eStyle) {}
    }

    function scrollAfterReveal() {
      if (isProfileMode()) return;
      var yKeep = 0;
      try {
        yKeep =
          window.pageYOffset ||
          (document.documentElement && document.documentElement.scrollTop) ||
          0;
        if (opts && opts.keepY != null && Number.isFinite(Number(opts.keepY))) {
          yKeep = Math.max(yKeep, Number(opts.keepY) || 0);
        }
      } catch (eKeep) {}
      function refreshCommunityLayout() {
        try {
          if (typeof window.__vcEnsureCommunityPageCineLayout === "function") {
            window.__vcEnsureCommunityPageCineLayout();
            return;
          }
          if (typeof window.__vcPageHeroLayout === "function") {
            window.__vcPageHeroLayout({ force: true });
          }
        } catch (eLayout) {}
      }
      function headerOffsetPx() {
        try {
          var bar = document.querySelector(".vc-header-bar") || document.querySelector("header");
          var h = bar ? bar.getBoundingClientRect().height : 72;
          return Math.round(Math.max(64, h + 12));
        } catch (eOff) {
          return 88;
        }
      }
      function scrollToLeaderCards(behavior) {
        var anchor =
          byId("vc-ul-toolbar") ||
          byId("vc-ul-board-tabs") ||
          byId("vc-ul-grid") ||
          document.getElementById("vc-page-content");
        if (!anchor) return;
        try {
          var y =
            anchor.getBoundingClientRect().top +
            (window.pageYOffset || document.documentElement.scrollTop || 0) -
            headerOffsetPx();
          if (y < 0) y = 0;
          window.scrollTo({ top: y, behavior: behavior || "auto" });
        } catch (eScroll) {
          try {
            anchor.scrollIntoView({ block: "start", behavior: behavior || "auto" });
          } catch (e2) {}
        }
      }
      function restoreKeptY() {
        /* scrollStayAll1: tab switch / pager — resta all'altezza, anche se il DOM collassa */
        if (yKeep < 24) return;
        try {
          if (typeof window.__vcHoldPageScroll === "function") window.__vcHoldPageScroll(320, yKeep);
          else if (typeof window.scrollTo === "function") window.scrollTo(0, yKeep);
        } catch (eRest) {}
      }
      refreshCommunityLayout();
      window.setTimeout(refreshCommunityLayout, 0);
      window.setTimeout(refreshCommunityLayout, 150);
      window.setTimeout(refreshCommunityLayout, 600);
      if (!shouldScroll) {
        restoreKeptY();
        window.setTimeout(restoreKeptY, 0);
        window.setTimeout(restoreKeptY, 120);
        window.setTimeout(restoreKeptY, 320);
        return;
      }
      window.setTimeout(function () {
        refreshCommunityLayout();
        scrollToLeaderCards("auto");
      }, 120);
      window.requestAnimationFrame(function () {
        if (shouldScroll) scrollToLeaderCards("auto");
      });
    }

    function finishReveal() {
      try {
        root.classList.remove("vc-user-leader-pending", "vc-user-leader-route", "vc-loading-scroll-lock");
        if (!root.classList.contains("vc-page-cine-ready")) {
          root.classList.add("vc-page-cine-ready", "vc-core-styles-ready", "vc-styles-ready", "vc-home-styles-ready");
          root.classList.remove("vc-page-cine-boot");
          try {
            document.dispatchEvent(new Event("vc:page-cine-ready"));
          } catch (eEvt) {}
        }
      } catch (ePending) {}
      hideLoader();
      unlockScrollStyles();
      try {
        if (typeof window.__vcLoadHomeCineDeferred === "function") window.__vcLoadHomeCineDeferred();
      } catch (eHc) {}
      scrollAfterReveal();
    }

    function waitLayoutThenReveal(attempt) {
      attempt = attempt || 0;
      var body = document.body;
      var layoutReady =
        Boolean(body && (body.classList.contains("vc-page-cine-layout") || body.dataset.vcPageCineLayout === "1"));
      if (layoutReady || root.classList.contains("vc-page-cine-ready") || attempt >= 80) {
        finishReveal();
        return;
      }
      window.requestAnimationFrame(function () {
        waitLayoutThenReveal(attempt + 1);
      });
    }

    function applyLayout() {
      try {
        root.classList.add("vc-page-cine-boot");
        root.classList.remove("vc-user-leader-pending");
      } catch (eGate) {}
      try {
        if (typeof window.__vcEnsureCommunityPageCineLayout === "function") {
          window.__vcEnsureCommunityPageCineLayout();
          waitLayoutThenReveal(0);
          return;
        }
      } catch (eLay) {}
      try {
        if (typeof window.__vcLoadHomeCineDeferred === "function") window.__vcLoadHomeCineDeferred();
      } catch (eLoad) {}
      var waits = 0;
      (function poll() {
        if (typeof window.__vcEnsureCommunityPageCineLayout === "function") {
          try {
            window.__vcEnsureCommunityPageCineLayout();
          } catch (ePollLay) {}
          waitLayoutThenReveal(0);
          return;
        }
        if (++waits > 120) {
          finishReveal();
          return;
        }
        window.setTimeout(poll, 50);
      })();
    }

    applyLayout();
  }

    function syncLeaderLoaderBlocking(overlay, loading) {
    if (!overlay) return;
    // Always use the canonical full-screen boot overlay (same as initial /user/
    // classifica load). Without data-vc-loader-blocking, CSS falls back to the
    // old teal card loader — visible when switching boards after boot clears
    // vc-user-leader-pending / vc-user-leader-route.
    if (loading) overlay.setAttribute("data-vc-loader-blocking", "1");
    else overlay.removeAttribute("data-vc-loader-blocking");
    try {
      if (typeof window.__vcSyncLoaderBlockingLiveClass === "function") window.__vcSyncLoaderBlockingLiveClass();
    } catch (eLive) {}
  }

  function setLoading(on, label) {
    state.loading = Boolean(on);
    var overlay = byId("vc-ul-loading");
    var title = overlay ? overlay.querySelector(".vc-ul-loading-title") : null;
    var sub = overlay ? overlay.querySelector(".vc-ul-loading-sub") : null;
    var grid = byId("vc-ul-grid");
    if (overlay) {
      if (state.loading) {
        try {
          if (typeof window.__vcPinPageScroll === "function") {
            window.__vcPinPageScroll({ soft: true });
          }
        } catch (ePinLd) {}
        overlay.hidden = false;
        overlay.removeAttribute("hidden");
        syncLeaderLoaderBlocking(overlay, true);
        overlay.style.removeProperty("display");
        overlay.style.removeProperty("opacity");
        overlay.style.removeProperty("pointer-events");
      }
    }
    if (title) title.textContent = label || "Caricamento…";
    if (sub) sub.textContent = state.loading ? "Un momento…" : "";
    if (grid) grid.setAttribute("aria-busy", state.loading ? "true" : "false");
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSync) {}
    if (!state.loading) {
      var doScroll = pendingScrollToCards;
      pendingScrollToCards = false;
      var keepY = pendingKeepScrollY;
      pendingKeepScrollY = 0;
      clearLeaderPending({ scroll: doScroll, keepY: keepY });
    }
  }

  function setState(msg, isErr) {
    var text = String(msg || "").trim();
    var el = byId("vc-user-leader-state");
    // leaderToast429Fix1 + toastOnlyAlerts1: tutti gli avvisi → toast (mai banner).
    if (el) {
      el.textContent = "";
      el.hidden = true;
      el.className = "vc-user-leader-state";
    }
    if (!text) {
      try {
        if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") window.VcSiteToast.hide();
      } catch (eHide) {}
      return;
    }
    function paintToast() {
      try {
        if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
          window.VcSiteToast.show(text, Boolean(isErr), {
            ms: isErr ? (/troppe richieste/i.test(text) ? 4200 : 3200) : 1800,
            pending: !isErr && /[…]$|\.\.\.$|caricamento/i.test(text),
          });
          return true;
        }
      } catch (eToast) {}
      return false;
    }
    if (paintToast()) return;
    window.setTimeout(function () {
      if (paintToast()) return;
      if (!el) return;
      el.textContent = text;
      el.className = "vc-user-leader-state" + (isErr ? " vc-user-leader-state--err" : "");
      el.hidden = false;
    }, 80);
  }

  function isRateLimitedPayload(out) {
    if (!out) return false;
    if (Number(out.status) === 429) return true;
    var err = String((out.body && (out.body.error || out.body.code || out.body.message)) || "")
      .toLowerCase()
      .trim();
    return (
      err.indexOf("rate_limit") >= 0 ||
      err === "rate_limited" ||
      err === "rate_limited_client" ||
      err.indexOf("too many") >= 0
    );
  }

  function formatLeaderLoadError(out) {
    if (isRateLimitedPayload(out)) return "Troppe richieste. Riprova tra poco.";
    var bodyMsg = out && out.body && (out.body.message || out.body.error);
    if (bodyMsg && !/^HTTP\s*\d+/i.test(String(bodyMsg)) && String(bodyMsg).toLowerCase() !== "rate_limited") {
      return String(bodyMsg);
    }
    var st = Number(out && out.status) || 0;
    if (st > 0) return "HTTP " + String(st) + " — dati non disponibili.";
    return "Dati non disponibili. Riprova tra poco.";
  }

  var leader429RetryTimer = null;
  var leader429RetryAttempt = 0;
  function clearLeader429Retry() {
    if (leader429RetryTimer) {
      try {
        window.clearTimeout(leader429RetryTimer);
      } catch (eClr) {}
      leader429RetryTimer = null;
    }
  }
  function scheduleLeader429Retry() {
    if (leader429RetryTimer) return;
    leader429RetryAttempt += 1;
    if (leader429RetryAttempt > 8) {
      leader429RetryAttempt = 0;
      try {
        var gridEl = byId("vc-ul-grid");
        if (!(gridEl && gridEl.querySelector(".vc-ul-card"))) {
          setLoading(false);
          setState("Troppe richieste. Riprova tra poco.", true);
        } else if (state.loading) {
          setLoading(false);
        }
      } catch (eGiveUp) {}
      return;
    }
    var wait = 1200;
    try {
      if (window.VcApiCache && typeof window.VcApiCache.webhookBlockRemainingMs === "function") {
        wait = Math.max(900, Math.min(14000, Number(window.VcApiCache.webhookBlockRemainingMs(resolvedApiUrl()) || 0) + 180));
      } else {
        wait = Math.min(12000, 1000 * leader429RetryAttempt);
      }
    } catch (eW) {
      wait = Math.min(12000, 1000 * leader429RetryAttempt);
    }
    leader429RetryTimer = window.setTimeout(function onLeader429Tick() {
      leader429RetryTimer = null;
      if (document.visibilityState !== "visible") {
        /* ulLoadUnlock1: non droppare il retry — riprogramma finché il tab non è visibile */
        leader429RetryTimer = window.setTimeout(onLeader429Tick, 2000);
        return;
      }
      /* userLoadRetry1: non bloccare se state.loading (era il bug “a volte non carica”) */
      load({ silent: true, rateRetry: true });
    }, wait);
  }

  function cardHead(row) {
    var rawName = String(row.displayName || row.username || "").trim();
    var name = rawName || "Utente";
    var rank = Number(row.rank) || 0;
    var rankAria = rank > 0 ? "Posizione " + String(rank) : "Non in classifica";
    var userId = String(row.userId || "").trim();
    var avHash = String(row.avatar || "").trim();
    var avSrc = esc(avatarUrl(row));
    var avFb = defaultEmbedAvatarUrl(row);
    return (
      '<div class="vc-ul-card-head">' +
      '<a class="vc-ul-card-user" href="' + esc(profileHref(row.userId)) + '">' +
      '<img class="vc-ul-avatar" src="' +
      avSrc +
      '" alt="" width="48" height="48" loading="lazy" decoding="async" referrerpolicy="no-referrer"' +
      (userId ? ' data-user-id="' + esc(userId) + '"' : "") +
      (avHash ? ' data-avatar-hash="' + esc(avHash) + '"' : "") +
      ' onerror="this.onerror=null;this.src=\'' +
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
      esc(userId) +
      "</p>" +
      "</div>" +
      "</a>" +
      "</div>"
    );
  }

  function renderCardLevel(row) {
    var pct = Math.max(0, Math.min(100, Number(row.progressPercent) || 0));
    return (
      '<article class="vc-ul-card">' +
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
      '<article class="vc-ul-card vc-ul-card--weekly">' +
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
      '<span class="vc-ul-foot-val" data-vc-countup="true" data-vc-count-kind="mult" data-vc-count-value="' +
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
      '<article class="vc-ul-card vc-ul-card--messages">' +
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
      '<article class="vc-ul-card vc-ul-card--voice">' +
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

  function renderCardMinigames(row) {
    var wPct = Math.max(0, Math.min(100, Number(row.minigameBarPct) || 0));
    return (
      '<article class="vc-ul-card vc-ul-card--minigames">' +
      cardHead(row) +
      '<div class="vc-ul-card-stats">' +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">Punti totali</span>' +
      '<span class="vc-ul-statbox-val" data-vc-countup="true" data-vc-count-kind="int" data-vc-count-value="' +
      esc(String(Number(row.minigameTotalExp) || 0)) +
      '">' +
      esc(formatIntIt(row.minigameTotalExp)) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-statbox">' +
      '<span class="vc-ul-statbox-label">Punti settimanali</span>' +
      '<span class="vc-ul-statbox-val" data-vc-countup="true" data-vc-count-kind="int" data-vc-count-value="' +
      esc(String(Number(row.minigameWeeklyExp) || 0)) +
      '">' +
      esc(formatIntIt(row.minigameWeeklyExp)) +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="vc-ul-stat-wide">' +
      '<div class="vc-ul-stat-wide-row">' +
      '<span class="vc-ul-stat-wide-label">Streak (attuale / best)</span>' +
      '<span class="vc-ul-stat-wide-val">' +
      esc(formatIntIt(row.currentStreak)) +
      " / " +
      esc(formatIntIt(row.bestStreak)) +
      "</span>" +
      "</div>" +
      '<div class="vc-ul-progress vc-ul-progress--inset" title="Punti minigame totali rispetto al massimo in questa pagina" aria-hidden="true"><span class="vc-ul-progress-fill vc-ul-progress-fill--msg" style="width:' +
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
    if (board === "minigames") return renderCardMinigames(row);
    return renderCardLevel(row);
  }

  function rowsLookIncomplete(rows) {
    if (!Array.isArray(rows) || !rows.length) return false;
    for (var i = 0; i < rows.length; i += 1) {
      var r = rows[i];
      var uid = String(r.userId || "").trim();
      if (!uid) continue;
      var dn = String(r.displayName || "").trim();
      if (!dn || dn === uid) return true;
      if (String(r.username || "").trim() === uid) return true;
    }
    return false;
  }

  function scanLeaderAvatars(grid) {
    try {
      if (!window.VcDiscordAvatar) return;
      if (grid && typeof window.VcDiscordAvatar.scan === "function") window.VcDiscordAvatar.scan(grid);
      if (typeof window.VcDiscordAvatar.scan === "function") {
        var hdr = document.querySelector("header");
        if (hdr) window.VcDiscordAvatar.scan(hdr);
      }
    } catch (eAv) {}
  }

  function updatePager() {
    var nav = byId("vc-ul-pager");
    var mp = window.__vcMiniPager;
    if (!nav) return;
    if (state.searchUserId || state.totalPages <= 1) {
      nav.hidden = true;
      nav.style.display = "none";
      nav.__vcPagerRetry = 0;
      return;
    }
    var tp = Math.max(1, state.totalPages);
    nav.hidden = false;
    nav.removeAttribute("hidden");
    nav.style.display = "flex";
    if (mp && typeof mp.fill === "function") {
      nav.__vcPagerRetry = 0;
      /* publicPagerTickets1: stessa pill numerata dei ticket (no classic <1>) */
      mp.fill(nav, state.page, tp, { aria: "Paginazione classifica" }, {
        go: function (page) {
          var cap = Math.max(1, Number(state.totalPages) || 1);
          var next = Math.max(1, Math.min(cap, Number(page) || 1));
          if (next === state.page) return;
          state.page = next;
          load({ scroll: false });
        },
      });
      return;
    }
    var tries = Number(nav.__vcPagerRetry || 0);
    if (tries < 30) {
      nav.__vcPagerRetry = tries + 1;
      window.setTimeout(updatePager, 48);
      return;
    }
    var prev = byId("vc-ul-prev");
    var next = byId("vc-ul-next");
    var lab = byId("vc-ul-page-label");
    if (prev) prev.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= tp;
    if (lab) lab.textContent = "Pagina " + state.page + " di " + tp;
  }

  function boardLeadBlurb(board) {
    /* classificaSub1: descrizione hero fissa (non cambia per tab) */
    var key = "user.sub";
    var fallback = "Scopri i membri più attivi della community.";
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var tr = window.VcI18n.t(key);
        if (tr && tr !== key) return tr;
      }
    } catch (eI18n) {}
    return fallback;
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
      } else if (board === "minigames") {
        midLabel.textContent = "Punti minigame più alti";
        midVal.textContent = st.topMinigameTotal != null ? formatIntIt(st.topMinigameTotal) : "—";
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
      } else if (board === "minigames") {
        midVal.textContent = formatIntIt(topRow.minigameTotalExp);
      }
    }
    if (tn && topRow) {
      tn.textContent = String(topRow.displayName || topRow.username || "").trim() || "—";
    }
    if (sub) sub.textContent = boardLeadBlurb(board);
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
      } else if (board === "minigames") {
        midLabel.textContent = "Punti minigame più alti";
        topMetricValue = topRow ? Number(topRow.minigameTotalExp) || 0 : (st.topMinigameTotal != null ? Number(st.topMinigameTotal) || 0 : null);
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
      tn.textContent = String(topRow.displayName || topRow.username || "").trim() || "—";
    } else if (tn) {
      tn.textContent = String(st.topPlayerUsername || "—").trim() || "—";
    }

    if (sub) sub.textContent = boardLeadBlurb(board);
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
      var rateLimited = data && data.rateLimited === true;
      if (titleEl && msgEl) {
        if (searchMiss && !loadErr) {
          if (ico) {
            ico.className = "fa fa-search vc-ul-empty-ico";
          }
          titleEl.textContent = "Nessun utente trovato";
          msgEl.textContent = "Prova a modificare i filtri di ricerca";
        } else if (rateLimited) {
          if (ico) {
            ico.className = "fa fa-clock-o vc-ul-empty-ico";
          }
          titleEl.textContent = "Troppe richieste";
          msgEl.textContent = "Aspetta qualche secondo e riprova: sto già aggiornando in automatico.";
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
    try {
      if (typeof window.__vcSitePolishRise === "function") window.__vcSitePolishRise();
      if (typeof window.__vcInitPanelTilt === "function") window.__vcInitPanelTilt();
      scanLeaderAvatars(grid);
      document.dispatchEvent(new Event("vc:ul-ready"));
    } catch (ePolishFx) {}
    state.totalPages = Math.max(1, Number(data.totalPages) || 1);
    updatePager();
  }

  function syncSearchUi() {
    var fbtn = byId("vc-ul-open-filters");
    if (fbtn) fbtn.classList.toggle("vc-ul-filter-tab--has-search", Boolean(state.searchUserId));
  }

  function load(opts) {
    var silent = Boolean(opts && opts.silent);
    var base = resolvedApiUrl();
    if (!base) {
      if (!silent) setLoading(false);
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
            url += "&_vcq=" + encodeURIComponent(String(Date.now()));
    }
    if (opts && opts.scroll) pendingScrollToCards = true;
    else {
      /* scrollStayAll1: memorizza Y prima che il loader collassi l'altezza */
      try {
        pendingKeepScrollY = Math.max(
          0,
          window.pageYOffset ||
            (document.documentElement && document.documentElement.scrollTop) ||
            0
        );
      } catch (eKeepY) {
        pendingKeepScrollY = 0;
      }
    }
    /* userLoadRetry1: paintedStale PRIMA del warm — non resettare dopo (hoisting bug) */
    var paintedStale = false;
    if (!silent && !state.searchUserId) {
      var warmKey = usersCacheKey(url);
      var warmHit = readUsersSessionCache(warmKey, Date.now(), true);
      if (warmHit && warmHit.value && warmHit.value.body && warmHit.value.body.ok === true) {
        applyPayload(warmHit.value, false);
        var warmRows = warmHit.value.body.rows;
        if (Array.isArray(warmRows) && warmRows.length) {
          paintedStale = true;
          setLoading(false);
        }
      }
    }
    if (!silent && !paintedStale) {
      setLoading(true, "Caricamento…");
      setState("Caricamento…", false);
    }
    function applyPayload(out, fromSilent) {
      if (!out || !out.ok || !out.body || out.body.ok !== true) {
        if (fromSilent && paintedStale) return;
        var rateLimited = isRateLimitedPayload(out);
        var alreadyClientBlocked =
          Boolean(out && out.blocked) ||
          String((out.body && out.body.error) || "").toLowerCase() === "rate_limited_client";
        if (rateLimited && !alreadyClientBlocked) {
          try {
            if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
              window.VcApiCache.noteWebhook429(0, url);
            }
          } catch (eNote) {}
        }
        var msg = formatLeaderLoadError(out);
        var gridEl = byId("vc-ul-grid");
        var hasCards = Boolean(gridEl && gridEl.querySelector(".vc-ul-card"));
        /* phoneUser429Fix1: niente empty “Troppe richieste” — resta in caricamento e ritenta */
        if (rateLimited && !hasCards && !paintedStale) {
          if (!fromSilent) {
            setLoading(true, "Caricamento…");
            setState("Caricamento…", false);
          } else {
            setLoading(true, "Caricamento…");
          }
          scheduleLeader429Retry();
          return;
        }
        if (!fromSilent || !paintedStale) {
          if (!(rateLimited && hasCards)) setState(msg, true);
        }
        if (paintedStale) {
          if (rateLimited) scheduleLeader429Retry();
          return;
        }
        if (hasCards) {
          if (rateLimited) scheduleLeader429Retry();
          return;
        }
        render({
          rows: [],
          total: 0,
          totalPages: 1,
          board: state.board,
          loadError: true,
          rateLimited: rateLimited && leader429RetryAttempt >= 8,
        });
        syncSearchUi();
        if (rateLimited) scheduleLeader429Retry();
        return;
      }
      leader429RetryAttempt = 0;
      clearLeader429Retry();
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
      var fp = "";
      try {
        fp = JSON.stringify({
          board: body.board,
          page: body.page,
          total: body.total,
          rows: body.rows,
        });
      } catch (e) {
        fp = "";
      }
      var incomplete = rowsLookIncomplete(body.rows);
      if (fromSilent && fp && fp === state.renderFingerprint && !incomplete) {
        /* ulLoadUnlock1: silent 429→ok deve spegnere il loader anche se fingerprint uguale */
        if (state.loading) setLoading(false);
        syncSearchUi();
        return;
      }
      state.renderFingerprint = fp;
      render(body);
      syncSearchUi();
      /* ulLoadUnlock1: silent retry ok non passa da finally(!silent) — sblocca qui */
      if (state.loading) setLoading(false);
      if (incomplete) {
        state.identityRetryCount = Number(state.identityRetryCount || 0) + 1;
        if (state.identityRetryCount <= 3) {
          window.setTimeout(function () {
            state.renderFingerprint = "";
            load({ silent: true });
          }, incomplete && paintedStale ? 120 : 380);
        }
      } else {
        state.identityRetryCount = 0;
      }
    }
    cachedUsersFetch(url, {
      useCache: !state.searchUserId,
      ttlMs: USERS_CACHE_TTL_MS,
      allowStale: !state.searchUserId && !silent,
      onStale: function (stalePayload) {
        if (!stalePayload || !stalePayload.body || stalePayload.body.ok !== true) return;
        paintedStale = true;
        applyPayload(stalePayload, false);
        if (!silent) {
          var staleRows = stalePayload.body.rows;
          if (Array.isArray(staleRows) && staleRows.length) setLoading(false);
        }
      },
    })
      .then(function (out) {
        applyPayload(out, silent || paintedStale);
      })
      .catch(function (err) {
        if (paintedStale) return;
        var timedOut =
          err &&
          (err.name === "AbortError" ||
            String(err.message || "")
              .toLowerCase()
              .indexOf("abort") >= 0);
        setState(
          timedOut
            ? "La classifica impiega troppo tempo a rispondere. Riprova tra qualche secondo."
            : "Impossibile contattare l’API classifica (rete, proxy verso il bot, risposta non JSON o CORS). Verifica GET /webhooks/site-users e che l’HTTP del bot sia attivo (WEBSITE_PUBLIC_HTTP se lo disabiliti esplicitamente).",
          true,
        );
        render({ rows: [], total: 0, totalPages: 1, board: state.board, loadError: true });
        syncSearchUi();
      })
      .finally(function () {
        var gridNow = byId("vc-ul-grid");
        var hasNow = Boolean(gridNow && gridNow.querySelector(".vc-ul-card"));
        if (!silent) {
          /* userLoadRetry1: se in coda un retry 429 e non ci sono card, tieni il loader */
          if (leader429RetryTimer && !hasNow && !paintedStale) {
            setLoading(true, "Caricamento…");
            return;
          }
          setLoading(false);
          return;
        }
        /* ulLoadUnlock1: silent con card (o senza retry) non lascia il gate forever */
        if (hasNow && state.loading) setLoading(false);
        else if (!leader429RetryTimer && state.loading && !hasNow && !paintedStale) {
          setLoading(false);
        }
        if (pendingScrollToCards) {
          pendingScrollToCards = false;
          clearLeaderPending({ scroll: true });
        }
      });
  }

  function stopLiveUsersPolling() {
    if (liveUsersPollTimer) {
      clearInterval(liveUsersPollTimer);
      liveUsersPollTimer = null;
    }
  }

  function startLiveUsersPolling() {
    stopLiveUsersPolling();
    liveUsersPollTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      if (state.loading || state.filtersOpen) return;
      load({ silent: true });
    }, LIVE_USERS_POLL_MS);
  }

  function initPager() {
    updatePager();
    document.addEventListener("vc:ul-ready", updatePager);
    window.addEventListener("load", updatePager, { once: true });
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
        load({ scroll: false });
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
        load({ scroll: false });
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
      load({ silent: true, scroll: false });
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

  function initProfileWarmPrefetch() {
    var root = document;
    function fromLink(a) {
      if (!a || !a.getAttribute) return "";
      var href = String(a.getAttribute("href") || "");
      var m = href.match(/[?&]id=(\d{17,20})/);
      if (m) return m[1];
      m = href.match(/\/users\/(\d{17,20})(?:\/|$)/);
      return m ? m[1] : "";
    }
    root.addEventListener(
      "pointerdown",
      function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest("a.vc-ul-card-user, a[href*='/user/?id='], a[href*='/users/']") : null;
        var id = fromLink(a);
        if (id) prefetchProfileWarm(id);
      },
      true,
    );
    root.addEventListener(
      "mouseover",
      function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest("a.vc-ul-card-user") : null;
        var id = fromLink(a);
        if (id) prefetchProfileWarm(id);
      },
      true,
    );
  }

  function main() {
    if (isProfileMode()) {
      setLoading(false);
      return;
    }
    initPager();
    initBoardTabs();
    initFilters();
    initProfileWarmPrefetch();
    setFiltersOpen(false);
    setLoading(true, "Caricamento…");
    load();
    startLiveUsersPolling();
    /* ulLoadUnlock1: watchdog duro — a 14s spegne sempre loader/429 loop */
    setTimeout(function () {
      try {
        var grid = byId("vc-ul-grid");
        var hasRows = Boolean(grid && grid.querySelector(".vc-ul-card"));
        if (state.loading && !hasRows) {
          setState("La classifica impiega troppo tempo a rispondere. Riprova tra qualche secondo.", true);
        }
        if (state.loading || document.documentElement.classList.contains("vc-user-leader-pending")) {
          clearLeader429Retry();
          leader429RetryAttempt = 0;
          setLoading(false);
        }
      } catch (eFs) {}
    }, 14000);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (state.filtersOpen) return;
    /* userLoadRetry1: anche se loading, se non ci sono card riprova (sblocca 429 stall) */
    var gridVis = byId("vc-ul-grid");
    var hasVis = Boolean(gridVis && gridVis.querySelector(".vc-ul-card"));
    if (state.loading && hasVis) return;
    load({ silent: hasVis });
  });

  window.addEventListener("vc:site-api-refetch", function () {
    if (isProfileMode()) return;
    if (!byId("vc-ul-grid")) return;
    load({ silent: false });
  });

  window.addEventListener("beforeunload", stopLiveUsersPolling);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();