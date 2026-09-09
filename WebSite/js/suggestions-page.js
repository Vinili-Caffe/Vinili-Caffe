(function () {
  /* suggestionsKindPhoto1 + feedbackSheet1 + feedback2 + feedback3 + feedbackTags1 + feedbackAvatar1 + feedbackAvatar2 + feedbackUx1 + suggestionsFirstLoadRetry1 + feedbackFmt1 + toastZ1 + feedbackDup1 + feedbackSort1 + feedbackFmt2 + feedbackTabSwitch2 */
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var SORT_STORAGE_KEY = "vc_feedback_sort";
  var TOPIC_TAGS = [
    { id: "server", it: "Server", en: "Server" },
    { id: "staff", it: "Staff", en: "Staff" },
    { id: "sito", it: "Sito", en: "Site" },
    { id: "bots", it: "Bots", en: "Bots" },
    { id: "eventi", it: "Eventi", en: "Events" },
    { id: "altro", it: "Altro", en: "Other" },
  ];
  var SORT_OPTIONS = [
    { id: "newest", it: "Più recenti", en: "Newest" },
    { id: "oldest", it: "Più vecchi", en: "Oldest" },
    { id: "votes", it: "Più votati", en: "Most voted" },
  ];

  function readStoredSort() {
    try {
      var raw = String(sessionStorage.getItem(SORT_STORAGE_KEY) || "").trim();
      if (raw === "oldest" || raw === "votes" || raw === "newest") return raw;
    } catch (e) {}
    return "newest";
  }

  function writeStoredSort(sort) {
    try {
      sessionStorage.setItem(SORT_STORAGE_KEY, sort);
    } catch (e) {}
  }

  var state = {
    payload: null,
    editModalOpen: false,
    editSuggestionId: null,
    draftContent: "",
    draftKind: "suggestion",
    draftTag: "",
    draftImages: [],
    pendingReply: null,
    editingComment: null,
    submitInFlight: false,
    commentInFlight: false,
    livePollTimer: null,
    suggestionsWs: null,
    wsReconnectTimer: null,
    suggestionsPager: {
      page: 1,
      perPage: 9,
      totalPages: 1,
      userControlled: false,
    },
    deepLinkAppliedId: "",
    renderFingerprint: "",
    openSuggestionId: "",
    board: "community",
    filterTag: "",
    filterKind: "",
    filterStatus: "",
    sort: readStoredSort(),
    fetchGen: 0,
    staffBoardAllowed: false,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function t(key, fallback) {
    try {
      if (window.VcI18n) {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function getDiscordUserSync() {
    var u = typeof window !== "undefined" ? window.__VC_DISCORD_PROFILE : null;
    if (!u || typeof u !== "object") return null;
    if (u.id || u.username) return u;
    return null;
  }

  function hideGate() {
    var g = byId("vc-suggestions-gate");
    if (!g) return;
    g.setAttribute("hidden", "");
    g.classList.add("vc-reviews-gate--dismissed");
    g.setAttribute("aria-hidden", "true");
  }

  function showGate() {
    var g = byId("vc-suggestions-gate");
    if (!g) return;
    g.removeAttribute("hidden");
    g.classList.remove("vc-reviews-gate--dismissed");
    g.setAttribute("aria-hidden", "false");
  }

  function wireGateLoginCta() {
    var gateBtn = byId("vc-suggestions-gate-login-cta");
    var headerBtn = byId("discord-login-btn");
    if (!gateBtn) return;
    gateBtn.addEventListener("click", function () {
      if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
        window.__vcDiscordStartOAuthRedirect(gateBtn);
        return;
      }
      if (headerBtn) headerBtn.click();
    });
  }

  function stopLiveSuggestionsPoll() {
    if (state.livePollTimer) {
      clearInterval(state.livePollTimer);
      state.livePollTimer = null;
    }
  }

  function clearContent() {
    disconnectSuggestionsWebSocket();
    stopLiveSuggestionsPoll();
    state.payload = null;
    state.editModalOpen = false;
    state.editSuggestionId = null;
    state.pendingReply = null;
    state.editingComment = null;
    state.suggestionsPager.page = 1;
    state.suggestionsPager.totalPages = 1;
    state.suggestionsPager.userControlled = false;
    state.deepLinkAppliedId = "";
    state.renderFingerprint = "";
    var wrap = byId("vc-suggestions-list");
    if (wrap) wrap.innerHTML = "";
    var pager = byId("vc-suggestions-pager");
    if (pager) {
      pager.innerHTML = "";
      pager.hidden = true;
    }
    closeModalDom();
  }

  function closeModalDom() {
    state.editModalOpen = false;
    state.editSuggestionId = null;
    var root = byId("vc-suggestions-edit-modal");
    if (root) {
      root.innerHTML = "";
      root.className = "vc-reviews-modal";
      root.hidden = true;
    }
    try {
      document.documentElement.classList.remove("vc-reviews-modal-open");
    } catch (e) {}
  }

  function shouldUnlockPage() {
    return Boolean(getDiscordUserSync());
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_SITE_SUGGESTIONS) || {};
  }

  function maxImages() {
    var n = Number(cfg().maxImages);
    return Number.isFinite(n) && n >= 1 && n <= 8 ? Math.floor(n) : 4;
  }

  function kindLabel(kind) {
    return String(kind) === "bug" ? "Problema" : "Idea";
  }

  function normalizeTopicTag(value) {
    var raw = String(value || "")
      .trim()
      .toLowerCase();
    for (var i = 0; i < TOPIC_TAGS.length; i += 1) {
      if (TOPIC_TAGS[i].id === raw) return raw;
    }
    return "";
  }

  function topicTagOf(s) {
    if (!s || typeof s !== "object") return "altro";
    var n = normalizeTopicTag(s.tag != null ? s.tag : s.topic);
    return n || "altro";
  }

  function topicTagLabel(tag) {
    var id = normalizeTopicTag(tag) || "altro";
    for (var i = 0; i < TOPIC_TAGS.length; i += 1) {
      if (TOPIC_TAGS[i].id === id) {
        return t("sugg.tag." + id, TOPIC_TAGS[i].it);
      }
    }
    return t("sugg.tag.altro", "Altro");
  }

  function topicTagBadgeMarkup(s) {
    var tag = topicTagOf(s);
    var label = topicTagLabel(tag);
    return (
      '<span class="vc-feedback-topic-badge vc-feedback-topic-badge--' +
      esc(tag) +
      '" title="' +
      esc(label) +
      '" aria-label="' +
      esc(label) +
      '">' +
      esc(label) +
      "</span>"
    );
  }

  function livePollIntervalMs() {
    var n = Number(cfg().livePollMs);
    if (Number.isFinite(n) && n >= 3000 && n <= 120000) return Math.floor(n);
    return 6000;
  }

  function isTypingInSuggestionField() {
    var a = document.activeElement;
    if (!a || !a.id) return false;
    var id = String(a.id);
    if (id.indexOf("vc-sug-comment-") === 0) return true;
    if (id.indexOf("vc-sug-comment-edit-") === 0) return true;
    if (id.indexOf("vc-sug-staff-reason-") === 0) return true;
    return false;
  }

  function normalizeBoardId(value) {
    return value === "staff" ? "staff" : "community";
  }

  function payloadBoardOf(body) {
    if (!body || typeof body !== "object") return "";
    if (body.board === "staff" || body.board === "community") return body.board;
    return "";
  }

  function payloadMatchesActiveBoard(body) {
    var pb = payloadBoardOf(body);
    if (!pb) return true;
    return pb === normalizeBoardId(state.board);
  }

  function payloadFingerprint(body) {
    try {
      return JSON.stringify({
        board: normalizeBoardId(state.board),
        suggestions: (body && body.suggestions) || [],
        viewer: (body && body.viewer) || null,
      });
    } catch (e) {
      return "";
    }
  }

  function shouldSkipDomRender(body) {
    if (!body || state.editModalOpen || state.editingComment || state.pendingReply) return false;
    if (!payloadMatchesActiveBoard(body)) return false;
    if (state.openSuggestionId && isTypingInSuggestionField()) return true;
    var fp = payloadFingerprint(body);
    if (!fp || !state.renderFingerprint) return false;
    return fp === state.renderFingerprint;
  }

  function refreshPayloadQuiet() {
    if (state.editModalOpen || state.editingComment || isTypingInSuggestionField()) return Promise.resolve();
    if (!byId("vc-suggestions-list")) return Promise.resolve();
    /* feedbackTabSwitch2: ignore quiet responses after board switch / newer fetch */
    var gen = Number(state.fetchGen || 0);
    var boardAtFetch = normalizeBoardId(state.board);
    return fetch(apiUrl(), {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    })
      .then(parseSuggestionsApiJson)
      .then(function (body) {
        if (gen !== state.fetchGen) return;
        if (normalizeBoardId(state.board) !== boardAtFetch) return;
        if (!body || body.ok !== true) return;
        if (!payloadMatchesActiveBoard(body)) return;
        if (shouldSkipDomRender(body)) {
          state.payload = body;
          return;
        }
        state.payload = body;
        render();
      })
      .catch(function () {});
  }

  function startLiveSuggestionsPoll() {
    stopLiveSuggestionsPoll();
    if (state.suggestionsWs && state.suggestionsWs.readyState === 1) return;
    state.livePollTimer = setInterval(function () {
      if (document.visibilityState === "hidden") return;
      void refreshPayloadQuiet();
    }, livePollIntervalMs());
  }

  function suggestionsWsUrl() {
    var explicit = String(cfg().wsUrl || "").trim();
    if (explicit) return explicit;
    var api = apiUrl();
    if (!api || typeof URL === "undefined") return "";
    try {
      var u = new URL(api);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      var path = String(u.pathname || "").replace(/\/$/, "");
      var dir = path.replace(/\/[^/]+$/, "");
      u.pathname = (dir || "") + "/site-realtime-ws";
      u.search = "";
      u.hash = "";
      return u.href;
    } catch (e) {
      return "";
    }
  }

  function disconnectSuggestionsWebSocket() {
    if (state.wsReconnectTimer) {
      clearTimeout(state.wsReconnectTimer);
      state.wsReconnectTimer = null;
    }
    try {
      if (state.suggestionsWs) {
        state.suggestionsWs.onclose = null;
        state.suggestionsWs.close();
      }
    } catch (e2) {}
    state.suggestionsWs = null;
  }

  function scheduleSuggestionsWsReconnect() {
    if (state.wsReconnectTimer) return;
    state.wsReconnectTimer = setTimeout(function () {
      state.wsReconnectTimer = null;
      connectSuggestionsWebSocket();
    }, 8000);
  }

  function connectSuggestionsWebSocket() {
    if (typeof WebSocket === "undefined") return;
    var url = suggestionsWsUrl();
    if (!url) return;
    disconnectSuggestionsWebSocket();
    try {
      var ws = new WebSocket(url);
      state.suggestionsWs = ws;
      ws.onopen = function () {
        stopLiveSuggestionsPoll();
      };
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || "{}"));
          if (data.type === "suggestions_changed" || data.type === "suggestions_hello") {
            void refreshPayloadQuiet();
          }
        } catch (e3) {}
      };
      ws.onclose = function () {
        state.suggestionsWs = null;
        startLiveSuggestionsPoll();
        scheduleSuggestionsWsReconnect();
      };
      ws.onerror = function () {
        try {
          ws.close();
        } catch (e4) {}
      };
    } catch (e5) {
      state.suggestionsWs = null;
    }
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  /* feedbackFmt2: safe rich text; strip md delimiters (incl. ``double`` code fences). */
  function formatFeedbackHtml(text, opts) {
    opts = opts || {};
    var keepNewlines = opts.keepNewlines !== false;
    var tokens = [];
    function stash(html) {
      var key = "\uE000FB" + tokens.length + "\uE001";
      tokens.push(html);
      return key;
    }
    var s = String(text == null ? "" : text);
    s = s.replace(/<(a?):([\w~-]+):(\d+)>/g, function (_m, animated, name, id) {
      var src =
        "https://cdn.discordapp.com/emojis/" +
        esc(id) +
        ".webp?size=64" +
        (animated === "a" ? "&animated=true" : "&quality=lossless");
      return stash(
        '<img class="vc-emoji vc-discord-emoji vc-feedback-emoji" src="' +
          src +
          '" alt=":' +
          esc(name) +
          ':" title=":' +
          esc(name) +
          ':" width="20" height="20" loading="lazy" decoding="async" />',
      );
    });
    /* Code first (stash): Discord ``double`` / ```triple``` fences; avoid leftover ticks. */
    s = s.replace(/```([^`\n]+)```/g, function (_m, code) {
      return stash('<code class="vc-feedback-prose__code">' + esc(code) + "</code>");
    });
    s = s.replace(/``([^`\n]+)``/g, function (_m, code) {
      return stash('<code class="vc-feedback-prose__code">' + esc(code) + "</code>");
    });
    s = s.replace(/`([^`\n]+)`/g, function (_m, code) {
      return stash('<code class="vc-feedback-prose__code">' + esc(code) + "</code>");
    });
    s = s.replace(/`+/g, "");
    s = s.replace(/https?:\/\/[^\s<>"']+/gi, function (url) {
      var clean = String(url || "").replace(/[),.;:!?]+$/g, "");
      var trail = String(url || "").slice(clean.length);
      if (!clean) return esc(url);
      return (
        stash(
          '<a class="vc-feedback-prose__link" href="' +
            esc(clean) +
            '" target="_blank" rel="noopener noreferrer">' +
            esc(clean) +
            "</a>",
        ) + trail
      );
    });
    var html = esc(s);
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__(.+?)__/g, "<u>$1</u>");
    html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");
    html = html.replace(/\|\|(.+?)\|\|/g, "$1");
    html = html.replace(/(^|[^\w*])\*(.+?)\*(?!\*)/g, "$1<em>$2</em>");
    html = html.replace(/(^|[^\w_])_(.+?)_(?!_)/g, "$1<em>$2</em>");
    if (keepNewlines) html = html.replace(/\r\n|\r|\n/g, "<br>");
    for (var i = 0; i < tokens.length; i += 1) {
      html = html.split("\uE000FB" + i + "\uE001").join(tokens[i]);
    }
    return html;
  }

  function getToken() {
    var token = localStorage.getItem(ACCESS_TOKEN_KEY);
    var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
    if (!token || !exp || Date.now() >= exp) return "";
    return token;
  }

  function apiUrl(pathSuffix) {
    var conf = cfg();
    var host = String(window.location.hostname || "").toLowerCase();
    var local = String(conf.apiUrlLocal || "").trim();
    var remote = String(conf.apiUrl || "").trim();
    if (remote === "#" || remote === "about:blank") remote = "";
    if (local === "#" || local === "about:blank") local = "";
    /* suggestionsApiBakeFix1: leftover bake used "#" for {{SUGGESTIONS_API_URL}} */
    /* toastZ1: board query MUST follow path (/id/comments?board=staff), never ?board=staff/id/... */
    var base = "";
    if ((host === "localhost" || host === "127.0.0.1") && local) base = local;
    else base = remote || local || "/webhooks/site-suggestions";
    base = String(base || "").replace(/\/$/, "");
    var path = pathSuffix == null ? "" : String(pathSuffix);
    if (path && path.charAt(0) !== "/") path = "/" + path;
    var url = base + path;
    if (state.board === "staff") {
      url += (url.indexOf("?") >= 0 ? "&" : "?") + "board=staff";
    }
    return url;
  }

  function coffeeAvatarFallbackUrl() {
    // feedbackAvatar2: always site silhouette SVG — never Discord embed or blurple defaults.
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="vcCoffeeAv" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#vcCoffeeAv)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function isDiscordDefaultAvatarUrl(url) {
    return /cdn\.discordapp\.com\/embed\/avatars\//i.test(String(url || ""));
  }

  function isCoffeeAvatarUrl(url) {
    var u = String(url || "").trim();
    return !u || /^data:image\/svg\+xml/i.test(u);
  }

  function parseDiscordAvatarParts(url, userId) {
    var src = String(url || "").trim();
    var uid = String(userId || "").trim();
    var hash = "";
    var guild = false;
    try {
      var guildMatch = src.match(/\/guilds\/(\d+)\/users\/(\d+)\/avatars\/((?:a_)?[a-f0-9]+)/i);
      if (guildMatch) {
        guild = true;
        uid = uid || String(guildMatch[2] || "").trim();
        hash = String(guildMatch[3] || "").trim();
        return { userId: uid, avatarHash: hash, guildId: String(guildMatch[1] || "").trim(), guild: true };
      }
      var userMatch = src.match(/\/avatars\/(\d+)\/((?:a_)?[a-f0-9]+)/i);
      if (userMatch) {
        uid = uid || String(userMatch[1] || "").trim();
        hash = String(userMatch[2] || "").trim();
      }
    } catch (eParse) {}
    return { userId: uid, avatarHash: hash, guildId: "", guild: guild };
  }

  /* feedbackAvatar2: rebuild CDN from id+hash; never embed/blurple; static PNG preferred. */
  function normalizeFeedbackAvatarTarget(url, size, userId, avatarHash) {
    var src = String(url || "").trim();
    var hashHint = String(avatarHash || "").trim();
    var uid = String(userId || "").trim();
    if (isDiscordDefaultAvatarUrl(src) || isCoffeeAvatarUrl(src)) src = "";
    var parts = parseDiscordAvatarParts(src, uid);
    if (parts.userId) uid = parts.userId;
    if (!parts.avatarHash && hashHint) parts.avatarHash = hashHint;
    var sz = Math.max(16, Number(size) || 40);
    var rebuilt = "";
    try {
      if (window.VcDiscordAvatar) {
        if (parts.guild && parts.guildId && parts.userId && parts.avatarHash && typeof window.VcDiscordAvatar.buildGuildFromParts === "function") {
          rebuilt = window.VcDiscordAvatar.buildGuildFromParts(parts.guildId, parts.userId, parts.avatarHash, sz) || "";
        } else if (uid && parts.avatarHash && typeof window.VcDiscordAvatar.buildFromParts === "function") {
          rebuilt = window.VcDiscordAvatar.buildFromParts(uid, parts.avatarHash, sz) || "";
        }
      }
    } catch (eBuild) {}
    if (!rebuilt && uid && parts.avatarHash) {
      rebuilt =
        "https://cdn.discordapp.com/avatars/" +
        uid +
        "/" +
        parts.avatarHash +
        ".png?size=" +
        sz;
    }
    if (rebuilt) src = rebuilt;
    try {
      if (src && window.VcDiscordAvatar && typeof window.VcDiscordAvatar.preferStaticUrl === "function") {
        src = window.VcDiscordAvatar.preferStaticUrl(src, sz) || src;
      } else if (src) {
        src = src.replace(/\.(gif|webp|jpe?g)(\?|#|$)/i, ".png$2");
      }
    } catch (eStatic) {}
    if (!src || isDiscordDefaultAvatarUrl(src) || isCoffeeAvatarUrl(src)) return "";
    if (!/^https:\/\/cdn\.discordapp\.com\/(?:avatars|guilds)\//i.test(src)) return "";
    return src;
  }

  /* feedbackAvatar2: Discord CDN as src immediately (reviews pattern). Coffee only if missing/broken — never embed. */
  function suggestionAvatarHtml(url, className, size, userId, avatarHash) {
    var sz = Math.max(16, Number(size) || 40);
    var cls = String(className || "vc-avatar").trim() || "vc-avatar";
    if (!/\bvc-avatar\b/.test(cls)) cls += " vc-avatar";
    cls = cls.replace(/\bvc-avatar--pending\b/g, " ").replace(/\s+/g, " ").trim();
    if (!/\bvc-avatar--ready\b/.test(cls)) cls += " vc-avatar--ready";
    var coffee = coffeeAvatarFallbackUrl();
    var uid = String(userId || "").trim();
    var parts = parseDiscordAvatarParts(url, uid);
    if (!parts.avatarHash && avatarHash) parts.avatarHash = String(avatarHash || "").trim();
    if (parts.userId) uid = parts.userId;
    var target = normalizeFeedbackAvatarTarget(url, sz, uid, parts.avatarHash);
    var src = target || coffee;
    return (
      '<img class="' +
      esc(cls) +
      '" src="' +
      esc(src) +
      '"' +
      ' alt="" width="' +
      sz +
      '" height="' +
      sz +
      '" loading="eager" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1" data-vc-feedback-avatar="1" data-vc-avatar-static="1"' +
      (uid ? ' data-user-id="' + esc(uid) + '"' : "") +
      (parts.avatarHash && !parts.guild ? ' data-avatar-hash="' + esc(parts.avatarHash) + '"' : "") +
      (target ? ' data-vc-avatar-cdn="1"' : ' data-vc-avatar-fallback="1"') +
      " />"
    );
  }

  function paintCoffeeAvatar(img) {
    if (!img || img.tagName !== "IMG") return;
    var coffee = coffeeAvatarFallbackUrl();
    try {
      img.removeAttribute("srcset");
      img.removeAttribute("data-vc-avatar-cdn");
      if (String(img.getAttribute("src") || "") !== coffee) {
        img.src = coffee;
        img.setAttribute("src", coffee);
      }
      img.classList.add("vc-avatar", "vc-avatar--ready", "vc-avatar-fallback-img");
      img.classList.remove("vc-avatar--pending");
      img.setAttribute("data-vc-avatar-fallback", "1");
      img.dataset.vcAvatarOk = "1";
      img.dataset.vcAvatarFallbackFinal = "1";
      img.dataset.vcAvatarHydrated = "1";
      delete img.dataset.vcAvatarHydrating;
    } catch (ePaint) {}
  }

  function bindFeedbackAvatarError(img) {
    if (!img || img.tagName !== "IMG") return;
    if (img.getAttribute("data-vc-feedback-avatar") !== "1") return;
    if (img.dataset.vcFeedbackAvatarBound === "1") return;
    img.dataset.vcFeedbackAvatarBound = "1";
    img.addEventListener(
      "error",
      function () {
        if (isDiscordDefaultAvatarUrl(img.getAttribute("src") || img.src || "")) {
          paintCoffeeAvatar(img);
          return;
        }
        if (isCoffeeAvatarUrl(img.getAttribute("src") || "")) return;
        paintCoffeeAvatar(img);
      },
      { once: false },
    );
    // Already failed / embed painted before bind.
    var cur = String(img.getAttribute("src") || img.src || "").trim();
    if (isDiscordDefaultAvatarUrl(cur)) paintCoffeeAvatar(img);
    else if (img.complete && img.naturalWidth === 0 && cur && !isCoffeeAvatarUrl(cur)) paintCoffeeAvatar(img);
  }

  function scanFeedbackAvatars(root) {
    var base = root && root.querySelectorAll ? root : document;
    try {
      var imgs = base.querySelectorAll
        ? base.querySelectorAll(
            "img[data-vc-feedback-avatar], .vc-feedback-card img[data-vc-avatar], .vc-feedback-sheet img[data-vc-avatar]",
          )
        : [];
      for (var i = 0; i < imgs.length; i += 1) {
        var img = imgs[i];
        if (isDiscordDefaultAvatarUrl(img.getAttribute("src") || img.src || "")) paintCoffeeAvatar(img);
        bindFeedbackAvatarError(img);
        if (img.complete && img.naturalWidth > 0 && !isDiscordDefaultAvatarUrl(img.getAttribute("src") || "")) {
          img.classList.add("vc-avatar", "vc-avatar--ready");
          img.classList.remove("vc-avatar--pending");
          img.dataset.vcAvatarOk = "1";
        }
      }
    } catch (eHyd) {}
  }

  function canAccessStaffBoard() {
    var viewer = state.payload && state.payload.viewer;
    if (viewer && typeof viewer.canAccessStaffBoard === "boolean") {
      state.staffBoardAllowed = Boolean(viewer.canAccessStaffBoard);
      return state.staffBoardAllowed;
    }
    return Boolean(state.staffBoardAllowed);
  }

  function switchFeedbackBoard(next) {
    var board = next === "staff" ? "staff" : "community";
    if (board === state.board) return;
    if (board === "staff" && !canAccessStaffBoard()) return;
    /* feedbackTabSwitch2: wipe old board before paint; invalidate in-flight quiet/fetch */
    state.board = board;
    state.suggestionsPager.page = 1;
    state.suggestionsPager.userControlled = false;
    state.openSuggestionId = "";
    state.renderFingerprint = "";
    state.payload = null;
    state.fetchGen = Number(state.fetchGen || 0) + 1;
    stopLiveSuggestionsPoll();
    closeFeedbackSheet();
    syncFeedbackScopeBar();
    showListSkeleton(true);
    void fetchPayload();
  }

  function ensureFeedbackScopeBar() {
    var host = byId("vc-suggestions-sections-row");
    var section = host && host.querySelector ? host.querySelector(".vc-reviews-section--split") : null;
    var list = byId("vc-suggestions-list");
    var dock = byId("vc-feedback-scope-dock");
    if (!canAccessStaffBoard()) {
      if (dock) dock.hidden = true;
      if (state.board === "staff") {
        state.board = "community";
        state.payload = null;
        state.renderFingerprint = "";
        state.fetchGen = Number(state.fetchGen || 0) + 1;
        stopLiveSuggestionsPoll();
        showListSkeleton(true);
        void fetchPayload();
      }
      return;
    }
    if (!dock) {
      dock = document.createElement("div");
      dock.id = "vc-feedback-scope-dock";
      dock.className = "vc-feedback-scope-dock";
      dock.innerHTML =
        '<div class="vc-notif-scope-bar vc-feedback-scope-bar" role="tablist" aria-label="Ambito feedback">' +
        '<button type="button" role="tab" class="vc-notif-scope-bar__btn" data-feedback-board="community" aria-selected="true">' +
        '<i class="fa fa-users" aria-hidden="true"></i><span>Community</span></button>' +
        '<button type="button" role="tab" class="vc-notif-scope-bar__btn" data-feedback-board="staff" aria-selected="false">' +
        '<i class="fa fa-shield" aria-hidden="true"></i><span>Staff</span></button>' +
        "</div>";
      if (section && list && list.parentNode === section) {
        section.insertBefore(dock, list);
      } else if (section) {
        section.insertBefore(dock, section.firstChild);
      } else if (host) {
        host.insertBefore(dock, host.firstChild);
      } else {
        document.body.appendChild(dock);
      }
      dock.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-feedback-board]") : null;
        if (!btn || !dock.contains(btn)) return;
        switchFeedbackBoard(btn.getAttribute("data-feedback-board"));
      });
    }
    dock.hidden = false;
    syncFeedbackScopeBar();
  }

  function hasActiveFeedbackFilters() {
    return Boolean(state.filterTag || state.filterKind || state.filterStatus);
  }

  function suggestionMatchesFilters(s) {
    if (!s) return false;
    if (state.filterKind) {
      var kind = String(s.kind) === "bug" ? "bug" : "suggestion";
      if (kind !== state.filterKind) return false;
    }
    if (state.filterStatus) {
      if (String(s.status || "pending") !== state.filterStatus) return false;
    }
    if (state.filterTag) {
      if (topicTagOf(s) !== state.filterTag) return false;
    }
    return true;
  }

  function ensureFeedbackFiltersBar() {
    var host = byId("vc-suggestions-sections-row");
    var section = host && host.querySelector ? host.querySelector(".vc-reviews-section--split") : null;
    var scope = byId("vc-feedback-scope-dock");
    var list = byId("vc-suggestions-list");
    var bar = byId("vc-feedback-filters");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "vc-feedback-filters";
      bar.className = "vc-feedback-filters";
      bar.setAttribute("aria-label", "Filtri feedback");
      if (scope && scope.parentNode) {
        scope.parentNode.insertBefore(bar, scope.nextSibling);
      } else if (section && list && list.parentNode === section) {
        section.insertBefore(bar, list);
      } else if (section) {
        section.insertBefore(bar, section.firstChild);
      } else if (host) {
        host.insertBefore(bar, host.firstChild);
      } else {
        document.body.appendChild(bar);
      }
      bar.addEventListener("click", function (ev) {
        var tEl = ev.target;
        if (!tEl || !tEl.closest) return;
        var clearBtn = tEl.closest("[data-feedback-filter-clear]");
        if (clearBtn && bar.contains(clearBtn)) {
          state.filterTag = "";
          state.filterKind = "";
          state.filterStatus = "";
          state.suggestionsPager.page = 1;
          state.suggestionsPager.userControlled = false;
          syncFeedbackFiltersBar();
          render();
          return;
        }
        var sortChip = tEl.closest("[data-feedback-sort]");
        if (sortChip && bar.contains(sortChip)) {
          var nextSort = String(sortChip.getAttribute("data-feedback-sort") || "").trim();
          if (nextSort !== "newest" && nextSort !== "oldest" && nextSort !== "votes") return;
          if (state.sort === nextSort) return;
          state.sort = nextSort;
          writeStoredSort(nextSort);
          state.suggestionsPager.page = 1;
          state.suggestionsPager.userControlled = false;
          syncFeedbackFiltersBar();
          render();
          return;
        }
        var chip = tEl.closest("[data-feedback-filter]");
        if (!chip || !bar.contains(chip) || chip.disabled) return;
        var dim = String(chip.getAttribute("data-feedback-filter") || "");
        var val = String(chip.getAttribute("data-feedback-filter-value") || "");
        if (dim === "tag") {
          state.filterTag = state.filterTag === val ? "" : normalizeTopicTag(val);
          if (state.filterKind === "bug" && state.filterTag === "eventi") state.filterTag = "";
        } else if (dim === "kind") {
          state.filterKind = state.filterKind === val ? "" : val === "bug" ? "bug" : val === "suggestion" ? "suggestion" : "";
          if (state.filterKind === "bug" && state.filterTag === "eventi") state.filterTag = "";
        } else if (dim === "status") {
          state.filterStatus =
            state.filterStatus === val ? "" : val === "accepted" || val === "rejected" || val === "pending" ? val : "";
        } else {
          return;
        }
        state.suggestionsPager.page = 1;
        state.suggestionsPager.userControlled = false;
        syncFeedbackFiltersBar();
        render();
      });
    }
    syncFeedbackFiltersBar();
  }

  function syncFeedbackFiltersBar() {
    var bar = byId("vc-feedback-filters");
    if (!bar) return;
    var hideEventi = state.filterKind === "bug";
    var tagChips = TOPIC_TAGS.map(function (row) {
      var disabled = hideEventi && row.id === "eventi";
      var on = !disabled && state.filterTag === row.id;
      return (
        '<button type="button" class="vc-feedback-filter-chip' +
        (on ? " is-active" : "") +
        '"' +
        (disabled ? ' disabled aria-disabled="true"' : "") +
        ' data-feedback-filter="tag" data-feedback-filter-value="' +
        esc(row.id) +
        '">' +
        esc(t("sugg.tag." + row.id, row.it)) +
        "</button>"
      );
    }).join("");
    var kindChips =
      '<button type="button" class="vc-feedback-filter-chip' +
      (state.filterKind === "suggestion" ? " is-active" : "") +
      '" data-feedback-filter="kind" data-feedback-filter-value="suggestion"><i class="fa fa-lightbulb-o" aria-hidden="true"></i> Idea</button>' +
      '<button type="button" class="vc-feedback-filter-chip' +
      (state.filterKind === "bug" ? " is-active" : "") +
      '" data-feedback-filter="kind" data-feedback-filter-value="bug"><i class="fa fa-bug" aria-hidden="true"></i> Problema</button>';
    var statusChips =
      '<button type="button" class="vc-feedback-filter-chip' +
      (state.filterStatus === "pending" ? " is-active" : "") +
      '" data-feedback-filter="status" data-feedback-filter-value="pending">In valutazione</button>' +
      '<button type="button" class="vc-feedback-filter-chip' +
      (state.filterStatus === "accepted" ? " is-active" : "") +
      '" data-feedback-filter="status" data-feedback-filter-value="accepted">Accettato</button>' +
      '<button type="button" class="vc-feedback-filter-chip' +
      (state.filterStatus === "rejected" ? " is-active" : "") +
      '" data-feedback-filter="status" data-feedback-filter-value="rejected">Rifiutato</button>';
    /* azzeraFix1: dedicated clear row under filter chips (no margin-left:auto float) */
    var clearRow = hasActiveFeedbackFilters()
      ? '<div class="vc-feedback-filters__row vc-feedback-filters__row--clear">' +
        '<span class="vc-feedback-filters__label" aria-hidden="true"></span>' +
        '<div class="vc-feedback-filters__chips">' +
        '<button type="button" class="vc-feedback-filter-clear" data-feedback-filter-clear="1">' +
        '<i class="fa fa-times" aria-hidden="true"></i> Azzera</button>' +
        "</div></div>"
      : "";
    var sortChips = SORT_OPTIONS.map(function (row) {
      var on = state.sort === row.id;
      return (
        '<button type="button" class="vc-feedback-filter-chip' +
        (on ? " is-active" : "") +
        '" data-feedback-sort="' +
        esc(row.id) +
        '" aria-pressed="' +
        (on ? "true" : "false") +
        '">' +
        esc(t("sugg.sort." + row.id, row.it)) +
        "</button>"
      );
    }).join("");
    var ctaLabel = t("sugg.new", "Nuovo feedback"); /* feedbackSort1 */
    bar.innerHTML =
      '<div class="vc-feedback-filters__main">' +
      '<div class="vc-feedback-filters__rows">' +
      '<div class="vc-feedback-filters__row">' +
      '<span class="vc-feedback-filters__label">Tipo</span>' +
      '<div class="vc-feedback-filters__chips" role="group" aria-label="Tipo">' +
      kindChips +
      "</div></div>" +
      '<div class="vc-feedback-filters__row">' +
      '<span class="vc-feedback-filters__label">Stato</span>' +
      '<div class="vc-feedback-filters__chips" role="group" aria-label="Stato">' +
      statusChips +
      "</div></div>" +
      '<div class="vc-feedback-filters__row">' +
      '<span class="vc-feedback-filters__label">Tag</span>' +
      '<div class="vc-feedback-filters__chips" role="group" aria-label="Tag">' +
      tagChips +
      "</div></div>" +
      '<div class="vc-feedback-filters__row">' +
      '<span class="vc-feedback-filters__label">Ordine</span>' +
      '<div class="vc-feedback-filters__chips" role="group" aria-label="Ordine">' +
      sortChips +
      "</div></div>" +
      clearRow +
      "</div>" +
      '<div class="vc-feedback-filters__toolbar">' +
      '<button type="button" id="vc-suggestions-open-form-btn" class="vc-reviews-head-cta vc-feedback-filters__cta">' +
      '<i class="fa fa-commenting-o" aria-hidden="true"></i><span>' +
      esc(ctaLabel) +
      "</span></button>" +
      "</div></div>";
    syncHeadButton();
  }

  function syncFeedbackScopeBar() {
    var dock = byId("vc-feedback-scope-dock");
    if (!dock) return;
    Array.prototype.slice.call(dock.querySelectorAll("[data-feedback-board]")).forEach(function (btn) {
      var on = btn.getAttribute("data-feedback-board") === state.board;
      btn.classList.toggle("is-active", on);
      btn.classList.toggle("vc-notify-filter-btn--on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

    function parseSuggestionsApiJson(response) {
    return response.text().then(function (text) {
      var s = String(text || "").trim();
      if (!s) {
        throw new Error("Risposta vuota dall'API suggerimenti.");
      }
      if (s.charCodeAt(0) === 65279) {
        s = s.slice(1).trim();
      }
      if (s.charAt(0) === "<") {
        throw new Error(
          "Il server ha risposto con una pagina HTML invece che con JSON: spesso sito in manutenzione, bot offline o URL `suggestionsApiUrl` che non punta a `/webhooks/site-suggestions`. Controlla `site.config.json` e che il bot sia avviato con gli HTTP webhook attivi.",
        );
      }
      try {
        return JSON.parse(s);
      } catch (e) {
        throw new Error("Risposta non JSON dall'API suggerimenti.");
      }
    });
  }

  function formatDateIt(value) {
    var date = value ? new Date(value) : null;
    if (!date || !Number.isFinite(date.getTime())) return "";
    try {
      return date.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch (e) {
      return date.toISOString().slice(0, 10);
    }
  }

  function statusLabel(st) {
    var s = String(st || "pending");
    if (s === "accepted") return "Accettato";
    if (s === "rejected") return "Rifiutato";
    return "In valutazione";
  }

  function orderedSuggestionComments(s) {
    /* feedbackDup1: dedupe by comment id so a double-POST or stale merge never paints twins */
    var raw = Array.isArray(s.comments) ? s.comments : [];
    var seen = Object.create(null);
    var flat = [];
    for (var i = 0; i < raw.length; i += 1) {
      var row = raw[i];
      var cid = String((row && row.id) || "").trim();
      if (cid) {
        if (seen[cid]) continue;
        seen[cid] = true;
      }
      flat.push(row);
    }
    function ts(x) {
      return new Date(x.createdAt || 0).getTime();
    }
    function sortArr(arr) {
      return arr.slice().sort(function (a, b) {
        return ts(a) - ts(b);
      });
    }
    var roots = sortArr(
      flat.filter(function (c) {
        return !c.parentCommentId;
      }),
    );
    var out = [];
    roots.forEach(function (r) {
      out.push(r);
      sortArr(
        flat.filter(function (c) {
          return String(c.parentCommentId || "") === String(r.id);
        }),
      ).forEach(function (ch) {
        out.push(ch);
      });
    });
    return out;
  }

  var statusTimer = null;
  var STATUS_AUTO_MS = 6000;

  function clearStatusTimer() {
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
  }

  function setStatus(text, isError, opts) {
    var node = byId("vc-suggestions-status");
    if (node) {
      node.hidden = true;
      node.textContent = "";
      node.className = "vc-reviews-status";
    }
    clearStatusTimer();
    var msg = String(text || "").trim();
    if (window.VcSiteToast) {
      if (!msg) {
        window.VcSiteToast.hide();
        return;
      }
      window.VcSiteToast.show(msg, Boolean(isError), {
        pending: Boolean(opts && opts.sticky) || undefined,
        sticky: Boolean(opts && opts.sticky) || undefined,
      });
      return;
    }
    if (!node) return;
    if (!msg) return;
    node.hidden = false;
    node.textContent = msg;
    node.className = "vc-reviews-status" + (isError ? " is-error" : "");
    if (!(opts && opts.sticky)) {
      statusTimer = setTimeout(function () {
        statusTimer = null;
        setStatus("");
      }, STATUS_AUTO_MS);
    }
  }

  function kindIcon(kind) {
    return String(kind) === "bug" ? "fa-bug" : "fa-lightbulb-o";
  }

  function statusIcon(st) {
    var s = String(st || "pending");
    if (s === "accepted") return "fa-check";
    if (s === "rejected") return "fa-times";
    return "fa-clock-o";
  }

  function previewText(content, maxLen) {
    /* feedbackFmt1: keep line breaks so card previews stay readable */
    var raw = String(content || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    var lim = maxLen || 140;
    if (raw.length <= lim) return raw;
    return raw.slice(0, lim - 1).replace(/\s+$/g, "") + "…";
  }

  function suggestionVoteMarkup(s, opts) {
    opts = opts || {};
    var pending = String(s.status || "") === "pending";
    var tokenOk = Boolean(getToken());
    var rawSid = String(s.id || "").trim();
    var upc = Math.max(0, Math.round(Number(s.upvoteCount || 0)));
    var dwc = Math.max(0, Math.round(Number(s.downvoteCount || 0)));
    var upOn = Boolean(s.upvotedByViewer);
    var downOn = Boolean(s.downvotedByViewer);
    var voteLocked = !pending || !tokenOk;
    var voteTitle = !pending
      ? t("sugg.voteClosed", "Votazione chiusa")
      : !tokenOk
        ? t("sugg.voteTitle", "Accedi con Discord per votare")
        : "";
    var voteExtras = voteLocked ? ' disabled title="' + esc(voteTitle) + '"' : "";
    return (
      '<div class="vc-reviews-card__foot' +
      (opts.compact ? " vc-feedback-card__votes" : "") +
      '">' +
      '<button type="button" class="vc-reviews-like' +
      (upOn ? " is-liked" : "") +
      '" data-suggestion-vote="' +
      esc(rawSid) +
      '" data-vote-dir="up"' +
      voteExtras +
      '><i class="fa ' +
      (upOn ? "fa-thumbs-up" : "fa-thumbs-o-up") +
      '" aria-hidden="true"></i><span class="vc-reviews-like__n">' +
      esc(String(upc)) +
      '</span></button>' +
      '<button type="button" class="vc-reviews-like vc-suggestions-vote--down' +
      (downOn ? " is-down" : "") +
      '" data-suggestion-vote="' +
      esc(rawSid) +
      '" data-vote-dir="down"' +
      voteExtras +
      '><i class="fa ' +
      (downOn ? "fa-thumbs-down" : "fa-thumbs-o-down") +
      '" aria-hidden="true"></i><span class="vc-reviews-like__n">' +
      esc(String(dwc)) +
      "</span></button></div>"
    );
  }

  function suggestionThreadMarkup(s) {
    var viewer = state.payload && state.payload.viewer;
    var tokenOk = Boolean(getToken());
    var canMod = Boolean(viewer && viewer.canModerateSuggestions);
    var pending = String(s.status || "") === "pending";
    var rawSid = String(s.id || "").trim();
    var viewerId = viewer && viewer.id ? String(viewer.id) : "";

    var pr = state.pendingReply;
    var prLine = "";
    if (pending && tokenOk && pr && pr.suggestionId === rawSid) {
      prLine =
        '<p class="mt-2 text-xs text-teal-200/90">Risposta a <strong>' +
        esc(pr.parentName || "commento") +
        '</strong> · <button type="button" class="text-teal-100 underline" data-suggestion-reply-cancel="' +
        esc(rawSid) +
        '">Annulla</button></p>';
    }

    var ordered = orderedSuggestionComments(s);
    var threadHtml =
      '<div class="vc-reviews-card__reply vc-suggestions-thread mt-4 space-y-3">' +
      '<span class="vc-reviews-card__reply-label">Discussione</span>';
    if (!ordered.length) {
      threadHtml += '<p class="text-sm text-slate-400">Nessun commento ancora.</p>';
    } else {
      threadHtml += ordered
        .map(function (c) {
          var cid = String(c.id || "").trim();
          var isOwnComment = Boolean(viewerId && String(c.userId || "") === viewerId);
          var isEditing =
            state.editingComment &&
            state.editingComment.suggestionId === rawSid &&
            state.editingComment.commentId === cid;
          var cup = Math.max(0, Math.round(Number(c.upvoteCount || 0)));
          var cdn = Math.max(0, Math.round(Number(c.downvoteCount || 0)));
          var cupOn = Boolean(c.upvotedByViewer);
          var cdnOn = Boolean(c.downvotedByViewer);
          var cvoteLock = !pending || !tokenOk || isOwnComment;
          var cvTitle = !pending
            ? "Discussione chiusa"
            : !tokenOk
              ? "Accedi per votare"
              : isOwnComment
                ? "Non sul tuo commento"
                : "";
          var cvEx = cvoteLock ? ' disabled title="' + esc(cvTitle) + '"' : "";

          var actions = "";
          if (pending && tokenOk && !c.parentCommentId) {
            actions +=
              '<button type="button" class="mt-2 text-xs text-teal-200 underline" data-suggestion-reply-start="' +
              esc(rawSid) +
              '" data-suggestion-reply-parent="' +
              esc(cid) +
              '" data-suggestion-reply-name="' +
              esc(c.authorName || "Utente") +
              '">Rispondi</button>';
          }
          if (pending && tokenOk && isOwnComment) {
            actions +=
              (actions ? " " : "") +
              '<button type="button" class="mt-2 text-xs text-slate-300 underline" data-suggestion-comment-edit-start="' +
              esc(rawSid) +
              '" data-suggestion-comment-edit-id="' +
              esc(cid) +
              '">Modifica</button>' +
              ' <button type="button" class="mt-2 text-xs text-red-300 underline" data-suggestion-comment-delete="' +
              esc(rawSid) +
              '" data-suggestion-comment-delete-id="' +
              esc(cid) +
              '">Elimina</button>';
          } else if (pending && canMod && !isOwnComment) {
            actions +=
              (actions ? " " : "") +
              '<button type="button" class="mt-2 text-xs text-amber-200 underline" data-suggestion-comment-delete="' +
              esc(rawSid) +
              '" data-suggestion-comment-delete-id="' +
              esc(cid) +
              '">Elimina</button>';
          }

          var innerBody = "";
          if (isEditing) {
            innerBody =
              '<textarea id="vc-sug-comment-edit-' +
              esc(cid) +
              '" class="vc-reviews-textarea mt-2" rows="2">' +
              esc(c.content) +
              "</textarea>" +
              '<div class="mt-2 flex flex-wrap gap-2">' +
              '<button type="button" class="vc-reviews-submit" data-suggestion-comment-edit-save="' +
              esc(rawSid) +
              '" data-suggestion-comment-edit-save-id="' +
              esc(cid) +
              '">Salva</button>' +
              '<button type="button" class="vc-reviews-submit vc-suggestions-btn-muted" data-suggestion-comment-edit-cancel="' +
              esc(rawSid) +
              '">Annulla</button>' +
              "</div>";
          } else {
            innerBody =
              '<div class="vc-feedback-comment__text vc-feedback-prose">' +
              formatFeedbackHtml(c.content) +
              "</div>";
          }

          var replyCls = c.parentCommentId
            ? " vc-suggestions-comment-card--reply vc-sug-comment--reply ml-5 border-l border-white/15 pl-4"
            : "";

          return (
            '<div class="vc-suggestions-comment-card rounded-xl border border-white/8 bg-white/[0.03] p-3' +
            replyCls +
            '">' +
            '<div class="flex flex-wrap items-center gap-2 text-sm">' +
            (c.authorAvatarUrl || c.authorAvatarHash
              ? suggestionAvatarHtml(c.authorAvatarUrl, "h-7 w-7 rounded-full object-cover vc-avatar", 28, c.userId, c.authorAvatarHash)
              : suggestionAvatarHtml("", "h-7 w-7 rounded-full object-cover vc-avatar", 28, c.userId)) +
            "<strong>" +
            esc(c.authorName || "Utente") +
            "</strong>" +
            '<span class="text-xs text-slate-500">' +
            esc(formatDateIt(c.updatedAt || c.createdAt)) +
            "</span>" +
            '<span class="flex flex-1 flex-wrap items-center justify-end gap-2">' +
            '<button type="button" class="vc-reviews-like text-xs' +
            (cupOn ? " is-liked" : "") +
            '" data-suggestion-comment-vote-up="' +
            esc(rawSid) +
            '" data-suggestion-comment-vote-id="' +
            esc(cid) +
            '"' +
            cvEx +
            '><i class="fa ' +
            (cupOn ? "fa-thumbs-up" : "fa-thumbs-o-up") +
            '" aria-hidden="true"></i><span class="vc-reviews-like__n">' +
            esc(String(cup)) +
            '</span></button>' +
            '<button type="button" class="vc-reviews-like vc-suggestions-vote--down text-xs' +
            (cdnOn ? " is-down" : "") +
            '" data-suggestion-comment-vote-down="' +
            esc(rawSid) +
            '" data-suggestion-comment-vote-id="' +
            esc(cid) +
            '"' +
            cvEx +
            '><i class="fa ' +
            (cdnOn ? "fa-thumbs-down" : "fa-thumbs-o-down") +
            '" aria-hidden="true"></i><span class="vc-reviews-like__n">' +
            esc(String(cdn)) +
            "</span></button></span></div>" +
            innerBody +
            actions +
            "</div>"
          );
        })
        .join("");
    }
    if (pending && tokenOk) {
      threadHtml +=
        prLine +
        '<div class="vc-sug-comment-compose">' +
        '<input id="vc-sug-comment-' +
        esc(rawSid) +
        '" class="vc-sug-comment-compose__input" type="text" maxlength="1200" placeholder="Scrivi un commento..." />' +
        '<button type="button" class="vc-sug-comment-compose__btn" data-suggestion-comment-submit="' +
        esc(rawSid) +
        '">Pubblica</button>' +
        "</div>";
    } else if (pending && !tokenOk) {
      threadHtml +=
        '<p class="text-sm text-slate-500">' +
        esc(t("sugg.comment", "Accedi con Discord per commentare.")) +
        "</p>";
    }
    threadHtml += "</div>";
    return threadHtml;
  }

  function suggestionDecisionBannerMarkup(s) {
    var pending = String(s.status || "") === "pending";
    var reason = String(s.staffReason || "").trim();
    if (pending || !reason) return "";
    var status = String(s.status || "");
    var tone =
      status === "accepted" ? "is-accepted" : status === "rejected" ? "is-rejected" : "is-neutral";
    return (
      '<aside class="vc-feedback-sheet__decision ' +
      tone +
      '" role="status" aria-label="Decisione staff">' +
      '<div class="vc-feedback-sheet__decision-top">' +
      '<span class="vc-feedback-sheet__decision-kicker">Decisione staff</span>' +
      '<span class="vc-feedback-sheet__decision-status">' +
      esc(statusLabel(status)) +
      "</span></div>" +
      '<div class="vc-feedback-sheet__decision-text vc-feedback-prose">' +
      formatFeedbackHtml(reason) +
      "</div>" +
      (s.decidedAt
        ? '<time class="vc-feedback-sheet__decision-meta" datetime="' +
          esc(String(s.decidedAt)) +
          '">' +
          esc(formatDateIt(s.decidedAt)) +
          "</time>"
        : "") +
      "</aside>"
    );
  }

  function suggestionStaffActionsMarkup(s) {
    var viewer = state.payload && state.payload.viewer;
    var canMod = Boolean(viewer && viewer.canModerateSuggestions);
    if (!canMod) return "";
    var rawSid = String(s.id || "").trim();
    var reasonPrefill = String(s.staffReason || "");
    return (
      '<div class="vc-feedback-sheet__staff" role="group" aria-label="Azioni High Staff">' +
      '<label class="vc-feedback-sheet__staff-label" for="vc-sug-staff-reason-' +
      esc(rawSid) +
      '">Motivo decisione</label>' +
      '<input id="vc-sug-staff-reason-' +
      esc(rawSid) +
      '" class="vc-sug-mod__reason" type="text" maxlength="1000" placeholder="Motivo (minimo 3 caratteri)" value="' +
      esc(reasonPrefill) +
      '" />' +
      '<div class="vc-staff-inbox-actions vc-staff-inbox-actions--forge vc-feedback-forge">' +
      '<div class="vc-staff-rank-forge__rail">' +
      '<button type="button" class="vc-staff-rank-forge__card is-up" data-suggestion-decision-id="' +
      esc(rawSid) +
      '" data-suggestion-decision-status="accepted">' +
      '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-check"></i></span>' +
      '<span class="vc-staff-rank-forge__name">Accetta</span>' +
      '<span class="vc-staff-rank-forge__hint">Approva questo feedback</span></button>' +
      '<button type="button" class="vc-staff-rank-forge__card is-down" data-suggestion-decision-id="' +
      esc(rawSid) +
      '" data-suggestion-decision-status="rejected">' +
      '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-times"></i></span>' +
      '<span class="vc-staff-rank-forge__name">Rifiuta</span>' +
      '<span class="vc-staff-rank-forge__hint">Chiudi senza accettare</span></button>' +
      '<button type="button" class="vc-staff-rank-forge__card is-amber" data-suggestion-decision-id="' +
      esc(rawSid) +
      '" data-suggestion-decision-status="pending">' +
      '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-hourglass-half"></i></span>' +
      '<span class="vc-staff-rank-forge__name">Valuta</span>' +
      '<span class="vc-staff-rank-forge__hint">Rimetti in valutazione</span></button>' +
      '<button type="button" class="vc-staff-rank-forge__card is-danger" data-suggestion-staff-delete="' +
      esc(rawSid) +
      '" title="Elimina definitivamente">' +
      '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-trash-o"></i></span>' +
      '<span class="vc-staff-rank-forge__name">Elimina</span>' +
      '<span class="vc-staff-rank-forge__hint">Cancella in modo definitivo</span></button>' +
      "</div></div></div>"
    );
  }

  function suggestionDetailBodyMarkup(s) {
    return (
      '<div class="vc-feedback-sheet__author">' +
      suggestionAvatarHtml(s.authorAvatarUrl, "vc-feedback-sheet__avatar vc-avatar", 44, s.userId, s.authorAvatarHash) +
      "<div><strong>" +
      esc(s.authorName || "Utente") +
      "</strong><span>" +
      esc(formatDateIt(s.updatedAt || s.createdAt)) +
      "</span></div>" +
      '<span class="vc-feedback-ico-badge vc-feedback-ico-badge--' +
      (String(s.kind) === "bug" ? "bug" : "idea") +
      '" title="' +
      esc(kindLabel(s.kind)) +
      '" aria-label="' +
      esc(kindLabel(s.kind)) +
      '"><i class="fa ' +
      kindIcon(s.kind) +
      '" aria-hidden="true"></i></span>' +
      topicTagBadgeMarkup(s) +
      '<span class="vc-feedback-ico-badge vc-feedback-ico-badge--status-' +
      esc(String(s.status || "pending")) +
      '" title="' +
      esc(statusLabel(s.status)) +
      '" aria-label="' +
      esc(statusLabel(s.status)) +
      '"><i class="fa ' +
      statusIcon(s.status) +
      '" aria-hidden="true"></i></span></div>' +
      '<div class="vc-feedback-sheet__text vc-feedback-prose">' +
      formatFeedbackHtml(s.content) +
      "</div>" +
      suggestionImagesMarkup(s) +
      suggestionVoteMarkup(s) +
      suggestionThreadMarkup(s)
    );
  }

  function suggestionCardMarkup(s) {
    var viewer = state.payload && state.payload.viewer;
    var tokenOk = Boolean(getToken());
    var pending = String(s.status || "") === "pending";
    var rawSid = String(s.id || "").trim();
    var viewerId = viewer && viewer.id ? String(viewer.id) : "";
    var isOwnSuggestion = Boolean(viewerId && String(s.userId || "") === viewerId);
    var comments = Math.max(
      0,
      Math.round(Number(s.commentCount != null ? s.commentCount : Array.isArray(s.comments) ? s.comments.length : 0)),
    );
    var upc = Math.max(0, Math.round(Number(s.upvoteCount || 0)));
    var dwc = Math.max(0, Math.round(Number(s.downvoteCount || 0)));

    var ownActions = "";
    if (pending && tokenOk && isOwnSuggestion) {
      ownActions =
        '<div class="vc-reviews-card__own-actions" data-suggestion-stop="1">' +
        '<button type="button" class="vc-reviews-card__icon-btn" data-suggestion-author-edit="' +
        esc(rawSid) +
        '" aria-label="Modifica feedback"><i class="fa fa-pencil" aria-hidden="true"></i></button>' +
        '<button type="button" class="vc-reviews-card__icon-btn vc-reviews-card__icon-btn--danger" data-suggestion-author-delete="' +
        esc(rawSid) +
        '" aria-label="Elimina feedback"><i class="fa fa-trash-o" aria-hidden="true"></i></button>' +
        "</div>";
    }

    return (
      '<article class="vc-reviews-card vc-feedback-card" id="vc-suggestion-' +
      esc(rawSid) +
      '" data-suggestion-id="' +
      esc(rawSid) +
      '" data-suggestion-open="' +
      esc(rawSid) +
      '" role="button" tabindex="0" aria-label="' +
      esc(t("sugg.openDiscussion", "Apri discussione")) +
      '">' +
      '<div class="vc-feedback-card__top">' +
      '<div class="vc-reviews-card__author">' +
      suggestionAvatarHtml(s.authorAvatarUrl, "vc-reviews-card__avatar vc-avatar", 40, s.userId, s.authorAvatarHash) +
      "<div><strong>" +
      esc(s.authorName || "Utente") +
      "</strong><span>" +
      esc(formatDateIt(s.updatedAt || s.createdAt)) +
      "</span></div></div>" +
      '<div class="vc-feedback-card__badges">' +
      '<span class="vc-feedback-ico-badge vc-feedback-ico-badge--' +
      (String(s.kind) === "bug" ? "bug" : "idea") +
      '" title="' +
      esc(kindLabel(s.kind)) +
      '" aria-label="' +
      esc(kindLabel(s.kind)) +
      '"><i class="fa ' +
      kindIcon(s.kind) +
      '" aria-hidden="true"></i></span>' +
      topicTagBadgeMarkup(s) +
      '<span class="vc-feedback-ico-badge vc-feedback-ico-badge--status-' +
      esc(String(s.status || "pending")) +
      '" title="' +
      esc(statusLabel(s.status)) +
      '" aria-label="' +
      esc(statusLabel(s.status)) +
      '"><i class="fa ' +
      statusIcon(s.status) +
      '" aria-hidden="true"></i></span>' +
      ownActions +
      "</div></div>" +
      '<div class="vc-feedback-card__preview vc-feedback-prose">' +
      formatFeedbackHtml(previewText(s.content, 160)) +
      "</div>" +
      '<div class="vc-feedback-card__meta">' +
      '<span title="Commenti"><i class="fa fa-comments-o" aria-hidden="true"></i> ' +
      esc(String(comments)) +
      "</span>" +
      '<span title="Voti"><i class="fa fa-thumbs-o-up" aria-hidden="true"></i> ' +
      esc(String(upc)) +
      ' · <i class="fa fa-thumbs-o-down" aria-hidden="true"></i> ' +
      esc(String(dwc)) +
      "</span>" +
      '<span class="vc-feedback-card__open-hint">' +
      esc(t("sugg.openDiscussion", "Apri discussione")) +
      ' <i class="fa fa-chevron-right" aria-hidden="true"></i></span>' +
      "</div></article>"
    );
  }

  function findSuggestionById(id) {
    var list = (state.payload && state.payload.suggestions) || [];
    var sid = String(id || "").trim();
    for (var i = 0; i < list.length; i += 1) {
      if (String((list[i] && list[i].id) || "") === sid) return list[i];
    }
    return null;
  }

  function ensureFeedbackSheet() {
    var sheet = byId("vc-feedback-sheet");
    if (sheet && sheet.getAttribute("data-fb-bound") === "feedbackFmt2") return sheet;
    if (sheet) {
      try {
        sheet.remove();
      } catch (eRm) {}
    }
    sheet = document.createElement("div");
    sheet.id = "vc-feedback-sheet";
    sheet.className = "vc-feedback-sheet vc-staff-inbox-sheet";
    sheet.setAttribute("data-fb-bound", "feedbackFmt2");
    sheet.hidden = true;
    sheet.innerHTML =
      '<button type="button" class="vc-feedback-sheet__backdrop" data-feedback-close="1" aria-label="Chiudi"></button>' +
      '<div class="vc-feedback-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="vc-feedback-sheet-title">' +
      '<header class="vc-feedback-sheet__head">' +
      '<div class="vc-feedback-sheet__head-copy">' +
      '<span class="vc-feedback-sheet__kicker"><i class="fa fa-comments-o" aria-hidden="true"></i> Discussione</span>' +
      '<h2 id="vc-feedback-sheet-title" class="vc-feedback-sheet__title">Feedback</h2></div>' +
      '<button type="button" class="vc-feedback-sheet__close" data-feedback-close="1" aria-label="Chiudi">\u2715</button>' +
      "</header>" +
      '<div class="vc-feedback-sheet__decision-slot" id="vc-feedback-sheet-decision" hidden></div>' +
      '<div class="vc-feedback-sheet__body" id="vc-feedback-sheet-body"></div>' +
      '<footer class="vc-feedback-sheet__foot" id="vc-feedback-sheet-foot"></footer>' +
      "</div>";
    document.body.appendChild(sheet);
    sheet.addEventListener("click", function (ev) {
      var tEl = ev.target;
      if (!tEl || !tEl.closest) return;
      var closer = tEl.closest("[data-feedback-close]");
      if (closer && sheet.contains(closer)) {
        ev.preventDefault();
        closeFeedbackSheet();
      }
    });
    document.addEventListener("keydown", function fbEsc(ev) {
      if (ev.key !== "Escape") return;
      if (!sheet || sheet.hidden || !sheet.classList.contains("is-in")) return;
      ev.preventDefault();
      closeFeedbackSheet();
    });
    return sheet;
  }

  function closeFeedbackSheet() {
    var sheet = byId("vc-feedback-sheet");
    state.openSuggestionId = "";
    try {
      document.documentElement.classList.remove("vc-feedback-sheet-open");
    } catch (e0) {}
    if (!sheet) return;
    sheet.classList.remove("is-in");
    sheet.hidden = true;
    sheet.setAttribute("hidden", "");
  }

  function openFeedbackSheet(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    state.openSuggestionId = sid;
    var sheet = ensureFeedbackSheet();
    syncFeedbackSheet();
    /* feedbackDup1: bind once here (render also binds after sync; never bind inside sync) */
    bind();
    sheet.hidden = false;
    sheet.removeAttribute("hidden");
    try {
      document.documentElement.classList.add("vc-feedback-sheet-open");
    } catch (e1) {}
    window.requestAnimationFrame(function () {
      sheet.classList.add("is-in");
    });
  }

  function syncFeedbackSheet() {
    var sid = String(state.openSuggestionId || "").trim();
    var body = byId("vc-feedback-sheet-body");
    var foot = byId("vc-feedback-sheet-foot");
    var decision = byId("vc-feedback-sheet-decision");
    var title = byId("vc-feedback-sheet-title");
    var kicker = document.querySelector("#vc-feedback-sheet .vc-feedback-sheet__kicker");
    if (!sid || !body) return;
    var row = findSuggestionById(sid);
    if (!row) {
      closeFeedbackSheet();
      return;
    }
    if (kicker) {
      kicker.innerHTML =
        '<i class="fa fa-comments-o" aria-hidden="true"></i> ' +
        esc(state.board === "staff" ? "Staff" : "Community");
    }
    if (title) title.textContent = kindLabel(row.kind) + " · " + statusLabel(row.status);
    var decisionHtml = suggestionDecisionBannerMarkup(row);
    if (decision) {
      if (decisionHtml) {
        decision.innerHTML = decisionHtml;
        decision.hidden = false;
        decision.removeAttribute("hidden");
      } else {
        decision.innerHTML = "";
        decision.hidden = true;
        decision.setAttribute("hidden", "");
      }
    }
    body.innerHTML = suggestionDetailBodyMarkup(row);
    if (foot) foot.innerHTML = suggestionStaffActionsMarkup(row);
    /* feedbackDup1: listeners attached by openFeedbackSheet/render only (not here) */
    scanFeedbackAvatars(body);
    if (foot) scanFeedbackAvatars(foot);
  }

  function emptyMarkup(filteredOut) {
    var filtered = Boolean(filteredOut);
    return (
      '<article class="vc-reviews-empty">' +
      '<span class="vc-reviews-empty__icon"><i class="fa fa-commenting-o" aria-hidden="true"></i></span>' +
      "<strong>" +
      esc(
        filtered
          ? t("sugg.emptyFiltered", "Nessun feedback con questi filtri")
          : state.board === "staff"
            ? t("sugg.emptyStaff", "Nessun feedback staff")
            : t("sugg.empty", "Nessun feedback"),
      ) +
      "</strong>" +
      "<p>" +
      esc(
        filtered
          ? t("sugg.emptyFilteredHint", "Prova ad azzerare i filtri o a cambiarne qualcuno.")
          : state.board === "staff"
            ? t("sugg.emptyHintStaff", "Sii il primo a condividere un'idea o un problema con lo staff.")
            : t("sugg.emptyHint", "Sii il primo a proporre un'idea o segnalare un problema."),
      ) +
      "</p>" +
      "</article>"
    );
  }

  function mongoObjectIdToTimeMs(id) {
    var s = String(id || "").trim();
    if (!/^[a-f0-9]{24}$/i.test(s)) return 0;
    return parseInt(s.slice(0, 8), 16) * 1000;
  }

  function dateValueMs(value) {
    if (value == null || value === "") return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value > 100000000000 ? value : value * 1000;
    var ms = new Date(value).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }

  function suggestionCreatedTs(suggestion) {
    if (!suggestion || typeof suggestion !== "object") return 0;
    var created =
      dateValueMs(suggestion.createdAt) ||
      dateValueMs(suggestion.created_at) ||
      dateValueMs(suggestion.submittedAt);
    if (created > 0) return created;
    return mongoObjectIdToTimeMs(suggestion.id);
  }

  function suggestionVoteScore(suggestion) {
    if (!suggestion || typeof suggestion !== "object") return 0;
    var up = Math.max(0, Math.round(Number(suggestion.upvoteCount || 0)));
    var down = Math.max(0, Math.round(Number(suggestion.downvoteCount || 0)));
    return up - down;
  }

  function sortedSuggestions(suggestions) {
    var list = Array.isArray(suggestions) ? suggestions.slice() : [];
    var mode = state.sort === "oldest" || state.sort === "votes" ? state.sort : "newest";
    list.sort(function (a, b) {
      if (mode === "votes") {
        var scoreDiff = suggestionVoteScore(b) - suggestionVoteScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        var upDiff =
          Math.max(0, Math.round(Number((b && b.upvoteCount) || 0))) -
          Math.max(0, Math.round(Number((a && a.upvoteCount) || 0)));
        if (upDiff !== 0) return upDiff;
      }
      var dt =
        mode === "oldest"
          ? suggestionCreatedTs(a) - suggestionCreatedTs(b)
          : suggestionCreatedTs(b) - suggestionCreatedTs(a);
      if (dt !== 0) return dt;
      return String(b && b.id ? b.id : "").localeCompare(String(a && a.id ? a.id : ""));
    });
    return list;
  }

  function extractDeepLinkSuggestionId() {
    try {
      var h = String(window.location.hash || "").trim();
      if (!h || h.indexOf("#vc-suggestion-") !== 0) return "";
      var raw = h.slice("#vc-suggestion-".length).trim();
      return /^[a-f0-9]{24}$/i.test(raw) ? raw : "";
    } catch (e) {
      return "";
    }
  }

  function ensurePageIncludesDeepLink(sortedSuggestions) {
    if (state.suggestionsPager.userControlled) return;
    var suggestionId = extractDeepLinkSuggestionId();
    if (!suggestionId) return;
    var idx = -1;
    for (var i = 0; i < sortedSuggestions.length; i += 1) {
      if (String(sortedSuggestions[i] && sortedSuggestions[i].id || "") === suggestionId) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    var perPage = Math.max(1, Number(state.suggestionsPager.perPage || 9));
    state.suggestionsPager.page = Math.floor(idx / perPage) + 1;
  }

  function getPagedSuggestions(sortedSuggestions) {
    var perPage = Math.max(1, Number(state.suggestionsPager.perPage || 9));
    var total = sortedSuggestions.length;
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    var currentPage = Math.max(1, Math.min(totalPages, Number(state.suggestionsPager.page || 1)));
    state.suggestionsPager.page = currentPage;
    state.suggestionsPager.totalPages = totalPages;
    var start = (currentPage - 1) * perPage;
    return sortedSuggestions.slice(start, start + perPage);
  }

  function renderSuggestionsPager(totalItems) {
    var pager = byId("vc-suggestions-pager");
    if (!pager) return;
    var perPage = Math.max(1, Number(state.suggestionsPager.perPage || 9));
    var total = Math.max(0, Number(totalItems || 0));
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    var page = Math.max(1, Math.min(totalPages, Number(state.suggestionsPager.page || 1)));
    state.suggestionsPager.page = page;
    state.suggestionsPager.totalPages = totalPages;
    if (!total || total <= perPage) {
      pager.innerHTML = "";
      pager.hidden = true;
      return;
    }
    pager.hidden = false;
    var mp = window.__vcMiniPager;
    if (mp && typeof mp.fill === "function") {
      mp.fill(pager, page, totalPages, { aria: "Paginazione suggerimenti" }, {
        go: function (nextPage) {
          var cap = Math.max(1, Number(state.suggestionsPager.totalPages) || 1);
          var next = Math.max(1, Math.min(cap, Number(nextPage) || 1));
          if (next === Number(state.suggestionsPager.page || 1)) return;
          state.suggestionsPager.userControlled = true;
          state.suggestionsPager.page = next;
          render();
          var list = byId("vc-suggestions-list");
          if (list && typeof list.scrollIntoView === "function") {
            window.requestAnimationFrame(function () {
              try {
                list.scrollIntoView({ behavior: "smooth", block: "start" });
              } catch (eScroll) {}
            });
          }
        },
      });
      return;
    }
    pager.innerHTML =
      '<button type="button" class="vc-reviews-pager__btn vc-notify-home-btn" data-suggestions-page-prev' +
      (page <= 1 ? " disabled" : "") +
      ">Precedente</button>" +
      '<span class="vc-reviews-pager__meta vc-reviews-pager__meta--stats vc-notify-filter-btn vc-notify-filter-btn--on" aria-live="polite">' +
      "Pagina " +
      esc(String(page)) +
      " di " +
      esc(String(totalPages)) +
      "</span>" +
      '<button type="button" class="vc-reviews-pager__btn vc-notify-home-btn" data-suggestions-page-next' +
      (page >= totalPages ? " disabled" : "") +
      ">Successiva</button>";
  }

  function ensureModalRoot() {
    var root = byId("vc-suggestions-edit-modal");
    if (!root) {
      root = document.createElement("div");
      root.id = "vc-suggestions-edit-modal";
      document.body.appendChild(root);
    }
    return root;
  }

  function suggestionImagesMarkup(s) {
    var images = Array.isArray(s && s.imageUrls) ? s.imageUrls : [];
    if (!images.length) return "";
    return (
      '<div class="vc-bot-feedback-images" style="display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0">' +
      images
        .map(function (url) {
          return (
            '<a href="' +
            esc(url) +
            '" target="_blank" rel="noopener noreferrer"><img src="' +
            esc(url) +
            '" alt="Allegato" style="width:96px;height:96px;object-fit:cover;border-radius:.75rem;border:1px solid rgba(255,255,255,.12)" loading="lazy" decoding="async" /></a>'
          );
        })
        .join("") +
      "</div>"
    );
  }

  function persistSuggestionDraft() {
    if (!window.VcFormDrafts || state.editSuggestionId) return;
    var ta = byId("vc-suggestion-modal-content");
    var content = ta ? String(ta.value || "") : String(state.draftContent || "");
    if (!content.trim() && !state.draftTag) {
      window.VcFormDrafts.clear("suggestions:new");
      return;
    }
    window.VcFormDrafts.save("suggestions:new", {
      content: content,
      kind: state.draftKind === "bug" ? "bug" : "suggestion",
      tag: normalizeTopicTag(state.draftTag) || "",
    });
  }

  function topicTagPickerMarkup() {
    var isBug = state.draftKind === "bug";
    var chips = TOPIC_TAGS.map(function (row) {
      var disabled = isBug && row.id === "eventi";
      var active = state.draftTag === row.id && !disabled;
      return (
        '<button type="button" class="vc-feedback-tag-chip' +
        (active ? " is-active" : "") +
        '"' +
        (disabled ? " disabled aria-disabled=\"true\"" : "") +
        ' data-suggestion-tag="' +
        esc(row.id) +
        '">' +
        esc(t("sugg.tag." + row.id, row.it)) +
        "</button>"
      );
    }).join("");
    return (
      '<div class="vc-reviews-field">' +
      '<span class="vc-bot-feedback-label" id="vc-suggestion-tag-label">' +
      esc(t("sugg.tagLabel", "Argomento")) +
      ' <span class="vc-bot-feedback-label__opt">' +
      esc(t("sugg.tagRequired", "(obbligatorio)")) +
      "</span></span>" +
      '<div class="vc-feedback-tag-chips" role="group" aria-labelledby="vc-suggestion-tag-label">' +
      chips +
      "</div></div>"
    );
  }

  function renderImagePreview() {
    var hint = byId("vc-suggestion-images-hint");
    var preview = byId("vc-suggestion-images-preview");
    if (preview) {
      preview.innerHTML = "";
      state.draftImages.forEach(function (dataUrl, idx) {
        var fig = document.createElement("figure");
        fig.className = "vc-bot-feedback-preview__item";
        var img = document.createElement("img");
        img.src = dataUrl;
        img.alt = "Anteprima " + (idx + 1);
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "vc-bot-feedback-preview__remove";
        rm.setAttribute("data-suggestion-remove-image", String(idx));
        rm.setAttribute("aria-label", "Rimuovi foto " + (idx + 1));
        rm.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
        fig.appendChild(img);
        fig.appendChild(rm);
        preview.appendChild(fig);
      });
    }
    if (hint) {
      hint.textContent = state.draftImages.length
        ? state.draftImages.length + " / " + maxImages() + " foto"
        : "Nessuna foto selezionata";
    }
  }

  function readSelectedImages(fileList) {
    var room = Math.max(0, maxImages() - state.draftImages.length);
    var files = Array.prototype.slice
      .call(fileList || [])
      .filter(function (f) {
        return f && String(f.type || "").indexOf("image/") === 0;
      })
      .slice(0, room);
    var hint = byId("vc-suggestion-images-hint");
    if (!files.length) {
      if (hint && !state.draftImages.length) hint.textContent = "Nessuna foto selezionata";
      else if (hint && room <= 0) hint.textContent = "Hai già raggiunto il massimo di " + maxImages() + " foto";
      return;
    }
    if (hint) hint.textContent = "Caricamento anteprime…";
    var pending = files.length;
    files.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || "");
        if (dataUrl.indexOf("data:image/") === 0 && state.draftImages.length < maxImages()) {
          state.draftImages.push(dataUrl);
        }
        pending -= 1;
        if (pending <= 0) renderImagePreview();
      };
      reader.onerror = function () {
        pending -= 1;
        if (pending <= 0) renderImagePreview();
      };
      reader.readAsDataURL(file);
    });
  }

  function modalInnerMarkup() {
    var isEdit = Boolean(state.editSuggestionId);
    var title = isEdit ? t("sugg.editTitle", "Modifica feedback") : t("sugg.new", "Nuovo feedback");
    var btnLabel = isEdit ? t("sugg.saveEdits", "Salva modifiche") : t("sugg.submit", "Invia feedback");
    var kindBlock =
      '<div class="vc-reviews-field">' +
      '<span class="vc-bot-feedback-label" id="vc-suggestion-kind-label">Tipo</span>' +
      '<div class="vc-dash-seg vc-bot-feedback-kind" role="group" aria-labelledby="vc-suggestion-kind-label">' +
      '<button type="button" class="vc-dash-seg__btn' +
      (state.draftKind === "suggestion" ? " is-active" : "") +
      '" data-suggestion-kind="suggestion">' +
      '<i class="fa fa-lightbulb-o" aria-hidden="true"></i> Idea</button>' +
      '<button type="button" class="vc-dash-seg__btn' +
      (state.draftKind === "bug" ? " is-active" : "") +
      '" data-suggestion-kind="bug">' +
      '<i class="fa fa-bug" aria-hidden="true"></i> Problema</button>' +
      "</div></div>";
    var imagesBlock = isEdit
      ? ""
      : '<div class="vc-reviews-field">' +
        '<span class="vc-bot-feedback-label" id="vc-suggestion-images-label">Foto <span class="vc-bot-feedback-label__opt">(opzionale, max ' +
        maxImages() +
        ")</span></span>" +
        '<div class="vc-bot-feedback-upload">' +
        '<input type="file" id="vc-suggestion-images" class="vc-bot-feedback-upload__input" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden />' +
        '<label class="vc-bot-feedback-upload__btn" for="vc-suggestion-images">' +
        '<i class="fa fa-camera" aria-hidden="true"></i> Aggiungi foto</label>' +
        '<p class="vc-bot-feedback-upload__hint">PNG, JPG, WEBP o GIF</p>' +
        "</div>" +
        '<p id="vc-suggestion-images-hint" class="vc-bot-feedback-upload__status">Nessuna foto selezionata</p>' +
        '<div id="vc-suggestion-images-preview" class="vc-bot-feedback-preview" aria-live="polite"></div>' +
        "</div>";
    return (
      '<div class="vc-reviews-modal__backdrop" data-suggestion-modal-dismiss tabindex="-1"></div>' +
      '<div class="vc-reviews-modal__panel" role="dialog" aria-modal="true" aria-labelledby="vc-suggestions-modal-title">' +
      '<div class="vc-reviews-modal__toolbar">' +
      '<h2 id="vc-suggestions-modal-title" class="vc-reviews-modal__title">' +
      esc(title) +
      "</h2>" +
      '<button type="button" class="vc-reviews-modal__close" data-suggestion-modal-dismiss aria-label="Chiudi"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-reviews-modal__body">' +
      kindBlock +
      topicTagPickerMarkup() +
      '<div class="vc-reviews-field"><label for="vc-suggestion-modal-content">Testo (minimo 12 caratteri)</label>' +
      '<textarea id="vc-suggestion-modal-content" class="vc-reviews-textarea" rows="6" placeholder="Descrivi l’idea o il problema in modo chiaro...">' +
      esc(state.draftContent) +
      "</textarea></div>" +
      imagesBlock +
      '<div class="vc-reviews-formcard__actions">' +
      '<button type="button" class="vc-reviews-submit" data-suggestion-submit>' +
      esc(btnLabel) +
      "</button>" +
      "</div></div></div>"
    );
  }

  function syncModal() {
    var root = ensureModalRoot();
    if (!state.editModalOpen) {
      state.draftImages = [];
      root.innerHTML = "";
      root.className = "vc-reviews-modal";
      root.hidden = true;
      try {
        document.documentElement.classList.remove("vc-reviews-modal-open");
      } catch (e0) {}
      return;
    }
    root.hidden = false;
    root.innerHTML = modalInnerMarkup();
    root.className = "vc-reviews-modal vc-reviews-modal--open";
    try {
      document.documentElement.classList.add("vc-reviews-modal-open");
    } catch (e1) {}
    if (!state.editSuggestionId && state.draftImages.length) {
      renderImagePreview();
    }
  }

  function openFormModal() {
    var token = getToken();
    var viewer = state.payload && state.payload.viewer;
    if (!token || !viewer || !viewer.id) {
      setStatus(t("sugg.loginToSuggest", "Devi effettuare il login con Discord per pubblicare un feedback."), true);
      return;
    }
    state.editSuggestionId = null;
    state.draftContent = "";
    state.draftKind = "suggestion";
    state.draftTag = "";
    state.draftImages = [];
    if (window.VcFormDrafts) {
      var saved = window.VcFormDrafts.load("suggestions:new");
      if (saved && typeof saved === "object") {
        if (saved.kind === "bug") state.draftKind = "bug";
        if (typeof saved.content === "string") state.draftContent = saved.content;
        var savedTag = normalizeTopicTag(saved.tag);
        if (savedTag && !(state.draftKind === "bug" && savedTag === "eventi")) state.draftTag = savedTag;
      } else if (typeof saved === "string" && saved.trim()) {
        state.draftContent = saved;
      }
    }
    state.editModalOpen = true;
    render();
    var ta = byId("vc-suggestion-modal-content");
    if (ta) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          try {
            ta.focus();
          } catch (e2) {}
        });
      });
    }
  }

  function setHeadCtaLabel(btn, label, iconClass) {
    if (!btn) return;
    var ico = btn.querySelector("i.fa");
    var span = btn.querySelector("span");
    if (!span) {
      span = document.createElement("span");
      btn.appendChild(span);
    }
    if (!ico && iconClass) {
      ico = document.createElement("i");
      ico.className = iconClass;
      ico.setAttribute("aria-hidden", "true");
      btn.insertBefore(ico, span);
    }
    span.textContent = label;
  }

  function syncHeadButton() {
    var btn = byId("vc-suggestions-open-form-btn");
    if (!btn) return;
    var viewer = state.payload && state.payload.viewer;
    var tokenOk = Boolean(getToken());
    var isLogged = Boolean(viewer && viewer.id);
    btn.hidden = false;
    btn.removeAttribute("hidden");
    setHeadCtaLabel(btn, t("sugg.new", "Nuovo feedback"), "fa fa-commenting-o");
    if (!isLogged || !tokenOk) {
      btn.setAttribute("aria-label", t("sugg.loginToSuggestAria", "Accedi con Discord per pubblicare un feedback"));
    } else {
      btn.setAttribute("aria-label", t("sugg.openFormAria", "Apri modulo nuovo feedback"));
    }
    btn.onclick = function () {
      openFormModal();
    };
  }

  function applySuggestionDeepLink() {
    try {
      var h = String(window.location.hash || "").trim();
      if (!h || h.indexOf("#vc-suggestion-") !== 0) return;
      var raw = h.slice("#vc-suggestion-".length).trim();
      if (!raw || !/^[a-f0-9]{24}$/i.test(raw)) return;
      if (state.deepLinkAppliedId === raw) return;
      if (!findSuggestionById(raw)) return;
      state.deepLinkAppliedId = raw;
      openFeedbackSheet(raw);
      try {
        if (window.history && typeof window.history.replaceState === "function") {
          window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
        }
      } catch (e2) {}
    } catch (e1) {}
  }

  function render() {
    var wrap = byId("vc-suggestions-list");
    if (!wrap) return;
    /* feedbackTabSwitch2: never paint previous board over skeleton / loading */
    if (!state.payload) {
      if (wrap.getAttribute("aria-busy") === "true") return;
      wrap.innerHTML = emptyMarkup(false);
      renderSuggestionsPager(0);
      ensureFeedbackScopeBar();
      ensureFeedbackFiltersBar();
      syncHeadButton();
      return;
    }
    if (!payloadMatchesActiveBoard(state.payload)) return;
    var list = state.payload.suggestions || [];
    var seen = Object.create(null);
    var unique = [];
    for (var i = 0; i < list.length; i += 1) {
      var row = list[i];
      var sid = String((row && row.id) || "").trim();
      if (!sid || seen[sid]) continue;
      seen[sid] = true;
      unique.push(row);
    }
    var orderedAll = sortedSuggestions(unique);
    var ordered = orderedAll.filter(suggestionMatchesFilters);
    ensurePageIncludesDeepLink(ordered);
    var pageItems = getPagedSuggestions(ordered);
    wrap.innerHTML = ordered.length
      ? pageItems.map(function (s) { return suggestionCardMarkup(s); }).join("")
      : emptyMarkup(orderedAll.length > 0 && hasActiveFeedbackFilters());
    wrap.removeAttribute("aria-busy");
    state.renderFingerprint = payloadFingerprint(state.payload);
    renderSuggestionsPager(ordered.length);
    syncModal();
    ensureFeedbackScopeBar();
    ensureFeedbackFiltersBar();
    syncHeadButton();
    if (state.openSuggestionId) syncFeedbackSheet();
    bind();
    bindFeedbackListOpenOnce();
    scanFeedbackAvatars(wrap);
    window.requestAnimationFrame(function () {
      applySuggestionDeepLink();
      scanFeedbackAvatars(wrap);
    });
  }

  var feedbackListOpenBound = false;

  function bindFeedbackListOpenOnce() {
    if (feedbackListOpenBound) return;
    var wrap = byId("vc-suggestions-list");
    if (!wrap) return;
    feedbackListOpenBound = true;
    wrap.addEventListener("click", function (ev) {
      var tEl = ev.target;
      if (!tEl || !tEl.closest) return;
      if (tEl.closest("[data-suggestion-stop], button, a, input, textarea, label")) return;
      var card = tEl.closest("[data-suggestion-open]");
      if (!card || !wrap.contains(card)) return;
      var id = String(card.getAttribute("data-suggestion-open") || "").trim();
      if (!id) return;
      openFeedbackSheet(id);
    });
    wrap.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      var tEl = ev.target;
      if (!tEl || !tEl.closest) return;
      var card = tEl.closest("[data-suggestion-open]");
      if (!card || card !== tEl) return;
      ev.preventDefault();
      var id = String(card.getAttribute("data-suggestion-open") || "").trim();
      if (id) openFeedbackSheet(id);
    });
  }

  var suggestionsPagerClickBound = false;

  function bindSuggestionsPagerOnce() {
    if (suggestionsPagerClickBound) return;
    var pager = byId("vc-suggestions-pager");
    if (!pager) return;
    suggestionsPagerClickBound = true;
    pager.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-suggestions-page-prev],[data-suggestions-page-next]") : null;
      if (!btn || btn.disabled) return;
      state.suggestionsPager.userControlled = true;
      if (btn.hasAttribute("data-suggestions-page-prev")) {
        state.suggestionsPager.page = Math.max(1, Number(state.suggestionsPager.page || 1) - 1);
      } else {
        state.suggestionsPager.page = Math.min(
          Math.max(1, Number(state.suggestionsPager.totalPages || 1)),
          Number(state.suggestionsPager.page || 1) + 1,
        );
      }
      render();
      var list = byId("vc-suggestions-list");
      if (list && typeof list.scrollIntoView === "function") {
        window.requestAnimationFrame(function () {
          try {
            list.scrollIntoView({ behavior: "smooth", block: "start" });
          } catch (eScroll) {}
        });
      }
    });
  }

  function bind() {
    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-modal-dismiss]")).forEach(function (el) {
      el.addEventListener("click", function () {
        state.editModalOpen = false;
        state.editSuggestionId = null;
        state.draftImages = [];
        render();
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-kind]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-suggestion-kind") === "bug" ? "bug" : "suggestion";
        state.draftKind = kind;
        if (kind === "bug" && state.draftTag === "eventi") state.draftTag = "";
        Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-kind]")).forEach(function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-suggestion-kind") === kind);
        });
        Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-tag]")).forEach(function (b) {
          var tag = String(b.getAttribute("data-suggestion-tag") || "");
          var disabled = kind === "bug" && tag === "eventi";
          b.disabled = disabled;
          if (disabled) b.setAttribute("aria-disabled", "true");
          else b.removeAttribute("aria-disabled");
          b.classList.toggle("is-active", !disabled && state.draftTag === tag);
        });
        persistSuggestionDraft();
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-tag]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var tag = normalizeTopicTag(btn.getAttribute("data-suggestion-tag"));
        if (!tag) return;
        if (state.draftKind === "bug" && tag === "eventi") return;
        state.draftTag = tag;
        Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-tag]")).forEach(function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-suggestion-tag") === tag);
        });
        persistSuggestionDraft();
      });
    });

    var fileInput = byId("vc-suggestion-images");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        readSelectedImages(fileInput.files);
        try {
          fileInput.value = "";
        } catch (eFile) {}
      });
    }
    var preview = byId("vc-suggestion-images-preview");
    if (preview) {
      preview.addEventListener("click", function (ev) {
        var tEl = ev.target;
        var rm = tEl && tEl.closest ? tEl.closest("[data-suggestion-remove-image]") : null;
        if (!rm) return;
        var idx = Number(rm.getAttribute("data-suggestion-remove-image"));
        if (!isFinite(idx) || idx < 0 || idx >= state.draftImages.length) return;
        state.draftImages.splice(idx, 1);
        renderImagePreview();
      });
    }

    var taModal = byId("vc-suggestion-modal-content");
    if (taModal) {
      taModal.addEventListener("input", function () {
        state.draftContent = taModal.value;
        persistSuggestionDraft();
      });
    }

    var submitBtn = document.querySelector("[data-suggestion-submit]");
    if (submitBtn) {
      submitBtn.addEventListener("click", function () {
        submitNewSuggestion();
      });
    }

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-vote]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var id = String(btn.getAttribute("data-suggestion-vote") || "").trim();
        var dir = String(btn.getAttribute("data-vote-dir") || "").trim();
        if (!id || (dir !== "up" && dir !== "down")) return;
        submitSuggestionVote(id, dir, btn);
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-submit]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        /* feedbackDup1: single-flight — ignore stacked listeners / double click */
        if (state.commentInFlight || btn.disabled) return;
        var id = String(btn.getAttribute("data-suggestion-comment-submit") || "").trim();
        if (!id) return;
        var ta = byId("vc-sug-comment-" + id);
        var text = ta ? String(ta.value || "").trim() : "";
        if (text.length < 2) {
          setStatus("Il commento è troppo breve.", true);
          return;
        }
        var pr = state.pendingReply;
        var body = { content: text };
        if (pr && pr.suggestionId === id && pr.parentCommentId) {
          body.parentCommentId = pr.parentCommentId;
        }
        state.commentInFlight = true;
        btn.disabled = true;
        setStatus("Pubblicazione commento...", false);
        fetch(apiUrl("/" + encodeURIComponent(id) + "/comments"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken(),
          },
          body: JSON.stringify(body),
        })
          .then(parseSuggestionsApiJson)
          .then(function (body) {
            if (!body || body.ok !== true) {
              throw new Error((body && body.message) || t("sugg.errorComment", "Errore commento."));
            }
            if (ta) ta.value = "";
            state.pendingReply = null;
            setStatus(body.message || "Commento pubblicato.", false);
            return fetchPayload();
          })
          .catch(function (err) {
            setStatus(err && err.message ? err.message : t("sugg.error", "Errore."), true);
          })
          .then(function () {
            state.commentInFlight = false;
            btn.disabled = false;
          });
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-reply-start]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sid = String(btn.getAttribute("data-suggestion-reply-start") || "").trim();
        var pid = String(btn.getAttribute("data-suggestion-reply-parent") || "").trim();
        var nm = String(btn.getAttribute("data-suggestion-reply-name") || "").trim() || "Utente";
        if (!sid || !pid) return;
        state.pendingReply = { suggestionId: sid, parentCommentId: pid, parentName: nm };
        render();
        var ta = byId("vc-sug-comment-" + sid);
        if (ta) {
          try {
            ta.focus();
          } catch (e0) {}
        }
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-reply-cancel]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.pendingReply = null;
        render();
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-author-edit]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sid = String(btn.getAttribute("data-suggestion-author-edit") || "").trim();
        if (!sid) return;
        var list = (state.payload && state.payload.suggestions) || [];
        var row = list.find(function (x) {
          return String(x.id) === sid;
        });
        if (!row) return;
        state.editModalOpen = true;
        state.editSuggestionId = sid;
        state.draftContent = String(row.content || "");
        state.draftKind = String(row.kind) === "bug" ? "bug" : "suggestion";
        state.draftTag = topicTagOf(row);
        if (state.draftKind === "bug" && state.draftTag === "eventi") state.draftTag = "altro";
        state.draftImages = [];
        render();
        var ta = byId("vc-suggestion-modal-content");
        if (ta) {
          window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
              try {
                ta.focus();
              } catch (e1) {}
            });
          });
        }
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-author-delete]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = String(btn.getAttribute("data-suggestion-author-delete") || "").trim();
        if (!id || !getToken()) return;
        var run = function () {
          btn.disabled = true;
          setStatus("Eliminazione in corso...", false);
          fetch(apiUrl("/" + encodeURIComponent(id)), {
            method: "DELETE",
            headers: { Authorization: "Bearer " + getToken() },
          })
            .then(parseSuggestionsApiJson)
            .then(function (body) {
              if (!body || body.ok !== true) {
                throw new Error((body && body.message) || t("sugg.errorDelete", "Eliminazione non riuscita."));
              }
              setStatus(body.message || "Eliminato.", false);
              return fetchPayload();
            })
            .catch(function (err) {
              setStatus(err && err.message ? err.message : t("sugg.error", "Errore."), true);
            })
            .then(function () {
              btn.disabled = false;
            });
        };
        var confirmP = (typeof window.__vcEnsureDialog === "function"
          ? window.__vcEnsureDialog()
          : Promise.resolve(window.VcDialog)
        ).then(function (D) {
          if (!D || typeof D.confirm !== "function") return false;
          return D.confirm({
              title: "Eliminare il suggerimento?",
              message: "Eliminare il tuo suggerimento? Non potrai ripristinarlo.",
              confirmLabel: "Elimina",
              cancelLabel: "Annulla",
              danger: true,
              icon: "fa-trash-o",
            });
        });
        confirmP.then(function (ok) {
          if (ok) run();
        });
      });
    });

    function submitCommentVote(suggestionId, commentId, direction, buttonEl) {
      var token = getToken();
      if (!token) {
        setStatus(t("sugg.vote", "Accedi con Discord per votare."), true);
        return;
      }
      if (buttonEl) buttonEl.disabled = true;
      setStatus("", false);
      fetch(
        apiUrl(
          "/" +
            encodeURIComponent(suggestionId) +
            "/comments/" +
            encodeURIComponent(commentId) +
            "/vote",
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ direction: direction }),
        },
      )
        .then(parseSuggestionsApiJson)
        .then(function (body) {
          if (!body || body.ok !== true) {
            throw new Error((body && body.message) || "Voto non registrato.");
          }
          return fetchPayload();
        })
        .catch(function (err) {
          setStatus(err && err.message ? err.message : t("sugg.errorVote", "Errore voto."), true);
        })
        .then(function () {
          if (buttonEl) buttonEl.disabled = false;
        });
    }

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-vote-up]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var sid = String(btn.getAttribute("data-suggestion-comment-vote-up") || "").trim();
        var cid = String(btn.getAttribute("data-suggestion-comment-vote-id") || "").trim();
        if (!sid || !cid) return;
        submitCommentVote(sid, cid, "up", btn);
      });
    });
    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-vote-down]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var sid = String(btn.getAttribute("data-suggestion-comment-vote-down") || "").trim();
        var cid = String(btn.getAttribute("data-suggestion-comment-vote-id") || "").trim();
        if (!sid || !cid) return;
        submitCommentVote(sid, cid, "down", btn);
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-edit-start]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sid = String(btn.getAttribute("data-suggestion-comment-edit-start") || "").trim();
        var cid = String(btn.getAttribute("data-suggestion-comment-edit-id") || "").trim();
        if (!sid || !cid) return;
        state.editingComment = { suggestionId: sid, commentId: cid };
        render();
        var ta = byId("vc-sug-comment-edit-" + cid);
        if (ta) {
          try {
            ta.focus();
          } catch (e2) {}
        }
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-edit-cancel]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.editingComment = null;
        render();
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-edit-save]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sid = String(btn.getAttribute("data-suggestion-comment-edit-save") || "").trim();
        var cid = String(btn.getAttribute("data-suggestion-comment-edit-save-id") || "").trim();
        if (!sid || !cid || !getToken()) return;
        var ta = byId("vc-sug-comment-edit-" + cid);
        var text = ta ? String(ta.value || "").trim() : "";
        if (text.length < 2) {
          setStatus("Il commento è troppo breve.", true);
          return;
        }
        btn.disabled = true;
        setStatus("Salvataggio commento...", false);
        fetch(apiUrl("/" + encodeURIComponent(sid) + "/comments/" + encodeURIComponent(cid)), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken(),
          },
          body: JSON.stringify({ content: text }),
        })
          .then(parseSuggestionsApiJson)
          .then(function (body) {
            if (!body || body.ok !== true) {
              throw new Error((body && body.message) || "Salvataggio non riuscito.");
            }
            state.editingComment = null;
            setStatus(body.message || "Commento aggiornato.", false);
            return fetchPayload();
          })
          .catch(function (err) {
            setStatus(err && err.message ? err.message : t("sugg.error", "Errore."), true);
          })
          .then(function () {
            btn.disabled = false;
          });
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-delete]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sid = String(btn.getAttribute("data-suggestion-comment-delete") || "").trim();
        var cid = String(btn.getAttribute("data-suggestion-comment-delete-id") || "").trim();
        if (!sid || !cid || !getToken()) return;
        var run = function () {
          btn.disabled = true;
          setStatus("Eliminazione commento...", false);
          fetch(apiUrl("/" + encodeURIComponent(sid) + "/comments/" + encodeURIComponent(cid)), {
            method: "DELETE",
            headers: { Authorization: "Bearer " + getToken() },
          })
            .then(parseSuggestionsApiJson)
            .then(function (body) {
              if (!body || body.ok !== true) {
                throw new Error((body && body.message) || t("sugg.errorDelete", "Eliminazione non riuscita."));
              }
              state.editingComment = null;
              setStatus(body.message || "Commento eliminato.", false);
              return fetchPayload();
            })
            .catch(function (err) {
              setStatus(err && err.message ? err.message : t("sugg.error", "Errore."), true);
            })
            .then(function () {
              btn.disabled = false;
            });
        };
        var confirmP = (typeof window.__vcEnsureDialog === "function"
          ? window.__vcEnsureDialog()
          : Promise.resolve(window.VcDialog)
        ).then(function (D) {
          if (!D || typeof D.confirm !== "function") return false;
          return D.confirm({
              title: "Eliminare il commento?",
              message: "Eliminare questo commento?",
              confirmLabel: "Elimina",
              cancelLabel: "Annulla",
              danger: true,
              icon: "fa-trash-o",
            });
        });
        confirmP.then(function (ok) {
          if (ok) run();
        });
      });
    });

    Array.prototype.slice
      .call(document.querySelectorAll("[data-suggestion-decision-id][data-suggestion-decision-status]"))
      .forEach(function (btn) {
        btn.addEventListener("click", function () {
          staffDecisionSet(
            String(btn.getAttribute("data-suggestion-decision-id") || "").trim(),
            String(btn.getAttribute("data-suggestion-decision-status") || "").trim(),
            btn,
          );
        });
      });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-staff-delete]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        staffDeleteSuggestion(String(btn.getAttribute("data-suggestion-staff-delete") || "").trim(), btn);
      });
    });
  }

  function staffDeleteSuggestion(id, btn) {
    if (!id || !getToken()) return;
    var run = function () {
      if (btn) btn.disabled = true;
      setStatus("Eliminazione in corso...", false);
      fetch(apiUrl("/" + encodeURIComponent(id) + "/delete"), {
        method: "POST",
        headers: { Authorization: "Bearer " + getToken() },
      })
        .then(parseSuggestionsApiJson)
        .then(function (body) {
          if (!body || body.ok !== true) {
            throw new Error((body && body.message) || "Eliminazione non riuscita.");
          }
          setStatus(body.message || "Eliminato.", false);
          return fetchPayload();
        })
        .catch(function (err) {
          setStatus(err && err.message ? err.message : "Errore.", true);
        })
        .then(function () {
          if (btn) btn.disabled = false;
        });
    };
    var confirmP = (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.confirm !== "function") return false;
      return D.confirm({
          title: "Eliminare il suggerimento?",
          message: "Eliminare permanentemente questo suggerimento dal sito? L'operazione non è annullabile.",
          confirmLabel: "Elimina",
          cancelLabel: "Annulla",
          danger: true,
          icon: "fa-trash-o",
        });
    });
    confirmP.then(function (ok) {
      if (ok) run();
    });
  }

  function submitSuggestionVote(suggestionId, direction, buttonEl) {
    var token = getToken();
    if (!token) {
      setStatus(t("sugg.vote", "Accedi con Discord per votare."), true);
      return;
    }
    if (buttonEl) buttonEl.disabled = true;
    setStatus("", false);
    fetch(apiUrl("/" + encodeURIComponent(suggestionId) + "/vote"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ direction: direction }),
    })
      .then(parseSuggestionsApiJson)
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || "Voto non registrato.");
        }
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : t("sugg.errorVote", "Errore voto."), true);
      })
      .then(function () {
        if (buttonEl) buttonEl.disabled = false;
      });
  }

  function staffDecision(id, kind, btn) {
    if (!id || !getToken()) return;
    var ta = byId("vc-sug-staff-reason-" + id);
    var reason = ta ? String(ta.value || "").trim() : "";
    if (reason.length < 3) {
      setStatus("Inserisci un motivo di almeno 3 caratteri.", true);
      return;
    }
    if (btn) btn.disabled = true;
    setStatus(kind === "accept" ? "Accettazione in corso..." : "Rifiuto in corso...", false);
    var path = kind === "accept" ? "accept" : "reject";
    fetch(apiUrl("/" + encodeURIComponent(id) + "/" + path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getToken(),
      },
      body: JSON.stringify({ reason: reason }),
    })
      .then(parseSuggestionsApiJson)
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || "Operazione non riuscita.");
        }
        setStatus(body.message || "Ok.", false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Errore.", true);
      })
      .then(function () {
        if (btn) btn.disabled = false;
      });
  }

  function staffDecisionSet(id, status, btn) {
    id = String(id || "").trim();
    status = String(status || "").trim().toLowerCase();
    if (!id) return;
    if (status !== "accepted" && status !== "rejected" && status !== "pending") status = "pending";
    var ta = byId("vc-sug-staff-reason-" + id);
    var reason = ta ? String(ta.value || "").trim() : "";
    if ((status === "accepted" || status === "rejected") && reason.length < 3) {
      setStatus("Inserisci un motivo di almeno 3 caratteri.", true);
      return;
    }
    var label =
      status === "accepted"
        ? "Salvataggio (Accetta)..."
        : status === "rejected"
          ? "Salvataggio (Rifiuta)..."
          : "Riapertura in valutazione...";
    setStatus(label, false);
    if (btn) btn.disabled = true;
    return fetch(apiUrl("/" + encodeURIComponent(id) + "/decision"), {
      method: "PATCH",
      headers: Object.assign({}, authHeaders(), { "Content-Type": "application/json" }),
      body: JSON.stringify({ status: status, reason: reason }),
    })
      .then(parseSuggestionsApiJson)
      .then(function (body) {
        if (!body || body.ok !== true) throw new Error((body && body.message) || "Operazione fallita.");
        setStatus(body.message || "Aggiornato.", false);
        void refreshPayloadQuiet();
      })
      .catch(function (err) {
        setStatus((err && err.message) || "Errore durante l'operazione.", true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function authHeaders() {
    var token = getToken();
    return token ? { Authorization: "Bearer " + token } : {};
  }

  function listSkeletonMarkup(n) {
    var count = Math.max(3, Math.min(6, Number(n) || 4));
    var cards = [];
    for (var i = 0; i < count; i += 1) {
      cards.push(
        '<article class="vc-reviews-card vc-feedback-card vc-list-skel" aria-hidden="true">' +
          '<div class="vc-list-skel__row"><span class="vc-list-skel__avatar"></span><span class="vc-list-skel__lines"><i></i><i></i></span></div>' +
          '<span class="vc-list-skel__block"></span><span class="vc-list-skel__meta"></span></article>',
      );
    }
    return cards.join("");
  }

  function showListSkeleton(force) {
    var wrap = byId("vc-suggestions-list");
    if (!wrap) return;
    if (!force && state.payload) return;
    wrap.innerHTML = listSkeletonMarkup(4);
    wrap.setAttribute("aria-busy", "true");
    var pager = byId("vc-suggestions-pager");
    if (pager) {
      pager.innerHTML = "";
      pager.hidden = true;
    }
  }

  function fetchPayload() {
    var gen = (state.fetchGen = Number(state.fetchGen || 0) + 1);
    var boardAtFetch = normalizeBoardId(state.board);
    setStatus("", false);
    /* Keep list empty until this board's payload applies (no cross-board flash). */
    if (!state.payload || !payloadMatchesActiveBoard(state.payload)) {
      state.payload = null;
    }
    showListSkeleton(true);
    var url = apiUrl();
    function applyBody(body) {
      if (gen !== state.fetchGen) return;
      if (normalizeBoardId(state.board) !== boardAtFetch) return;
      if (!body || body.ok !== true) throw new Error((body && body.message) || t("sugg.errorLoad", "Impossibile caricare i suggerimenti."));
      if (!payloadMatchesActiveBoard(body)) return;
      state.payload = body;
      if (body.viewer && typeof body.viewer.canAccessStaffBoard === "boolean") {
        state.staffBoardAllowed = Boolean(body.viewer.canAccessStaffBoard);
      }
      var wrap = byId("vc-suggestions-list");
      if (wrap) wrap.removeAttribute("aria-busy");
      render();
      startLiveSuggestionsPoll();
      var wsRs = state.suggestionsWs ? state.suggestionsWs.readyState : 3;
      if (wsRs !== 0 && wsRs !== 1) {
        connectSuggestionsWebSocket();
      }
    }
    /* suggestionsFirstLoadRetry1: cold-start / first stamp can flake — one silent retry. */
    function failOrRetry(err, retried) {
      if (gen !== state.fetchGen) return;
      if (normalizeBoardId(state.board) !== boardAtFetch) return;
      if (!retried) {
        return window.setTimeout(function () {
          if (gen !== state.fetchGen) return;
          if (normalizeBoardId(state.board) !== boardAtFetch) return;
          doFetch(true);
        }, 450);
      }
      setStatus(err && err.message ? err.message : t("sugg.errorLoad", "Impossibile caricare i suggerimenti."), true);
    }
    function doFetch(retried) {
      if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
        var token = getToken();
        return window.VcApiCache
          .fetchWithCache(
            window.VcApiCache.keyFor(url, {
              scope: "suggestions:" + boardAtFetch,
              auth: token,
              v: "feedbackTabSwitch2",
            }),
            url,
            {
              ttlMs: 25000,
              staleMs: 120000,
              persistMs: 10 * 60 * 1000,
              timeoutMs: 20000,
              forceNetwork: Boolean(retried),
              useCache: !retried,
              fetchInit: {
                method: "GET",
                headers: authHeaders(),
                cache: retried ? "no-store" : "default",
              },
              onStale: function (cached) {
                if (gen !== state.fetchGen) return;
                if (normalizeBoardId(state.board) !== boardAtFetch) return;
                if (cached && cached.body && cached.body.ok === true) {
                  try {
                    applyBody(cached.body);
                  } catch (eSt) {}
                }
              },
            },
          )
          .then(function (payload) {
            applyBody(payload && payload.body ? payload.body : null);
          })
          .catch(function (err) {
            failOrRetry(err, retried);
          });
      }
      return fetch(url, {
        method: "GET",
        headers: authHeaders(),
        cache: retried ? "no-store" : "default",
      })
        .then(parseSuggestionsApiJson)
        .then(applyBody)
        .catch(function (err) {
          failOrRetry(err, retried);
        });
    }
    return doFetch(false);
  }

  function submitNewSuggestion() {
    if (state.submitInFlight) return;
    var token = getToken();
    if (!token) {
      setStatus(t("sugg.loginToSuggest", "Devi effettuare il login con Discord per pubblicare un feedback."), true);
      return;
    }
    var ta = byId("vc-suggestion-modal-content");
    var content = ta ? String(ta.value || "").trim() : String(state.draftContent || "").trim();
    if (content.length < 12) {
      setStatus("Scrivi almeno 12 caratteri.", true);
      return;
    }
    var editId = state.editSuggestionId ? String(state.editSuggestionId).trim() : "";
    var kind = state.draftKind === "bug" ? "bug" : "suggestion";
    var tag = normalizeTopicTag(state.draftTag);
    if (!tag) {
      setStatus(t("sugg.tagMissing", "Scegli un argomento prima di inviare."), true);
      return;
    }
    if (kind === "bug" && tag === "eventi") {
      setStatus(t("sugg.tagEventiIdeaOnly", "Il tag Eventi è disponibile solo per le idee."), true);
      return;
    }
    setStatus(editId ? t("sugg.saving", "Salvataggio in corso...") : t("sugg.submitting", "Invio in corso..."), false);
    var url = editId ? apiUrl("/" + encodeURIComponent(editId)) : apiUrl();
    var method = editId ? "PATCH" : "POST";
    var payload = {
      content: content,
      kind: kind,
      tag: tag,
      topic: tag,
      board: state.board === "staff" ? "staff" : "community",
    };
    if (!editId) payload.images = state.draftImages.slice(0, maxImages());
    var submitBtn = document.querySelector("[data-suggestion-submit]");
    state.submitInFlight = true;
    if (submitBtn) submitBtn.disabled = true;
    fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(payload),
    })
      .then(parseSuggestionsApiJson)
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || "Salvataggio non riuscito.");
        }
        state.editModalOpen = false;
        state.editSuggestionId = null;
        state.draftContent = "";
        state.draftKind = "suggestion";
        state.draftTag = "";
        state.draftImages = [];
        if (window.VcFormDrafts) window.VcFormDrafts.clear("suggestions:new");
        setStatus(body.message || (editId ? t("sugg.updated", "Suggerimento aggiornato.") : t("sugg.published", "Suggerimento pubblicato.")), false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : t("sugg.errorSave", "Errore durante l'invio."), true);
      })
      .finally(function () {
        state.submitInFlight = false;
        if (submitBtn) submitBtn.disabled = false;
      });
  }

  function main() {
    wireGateLoginCta();
    bindSuggestionsPagerOnce();
    if (window.VcFormDrafts) {
      var saved = window.VcFormDrafts.load("suggestions:new");
      if (saved && typeof saved === "object") {
        if (saved.kind === "bug") state.draftKind = "bug";
        if (typeof saved.content === "string") state.draftContent = saved.content;
        var bootTag = normalizeTopicTag(saved.tag);
        if (bootTag && !(state.draftKind === "bug" && bootTag === "eventi")) state.draftTag = bootTag;
      } else if (typeof saved === "string" && saved.trim()) {
        state.draftContent = saved;
      }
    }
    if (shouldUnlockPage()) {
      hideGate();
      fetchPayload();
      return;
    }
    if (!getToken()) {
      showGate();
      return;
    }
    hideGate();
    fetchPayload();
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var u = ev && ev.detail ? ev.detail.user : null;
    if (u) {
      hideGate();
      if (state.payload) {
        void refreshPayloadQuiet();
      } else {
        fetchPayload();
      }
      return;
    }
    clearContent();
    showGate();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && state.payload) {
      void refreshPayloadQuiet();
    }
  });

  window.addEventListener("vc:site-api-refetch", function () {
    if (!byId("vc-suggestions-list")) return;
    void fetchPayload();
  });

  window.addEventListener("beforeunload", function () {
    stopLiveSuggestionsPoll();
    disconnectSuggestionsWebSocket();
  });

  document.addEventListener("keydown", function (ev) {
    if (!state.editModalOpen) return;
    if (ev.key !== "Escape") return;
    state.editModalOpen = false;
    state.editSuggestionId = null;
    render();
  });

  window.addEventListener("hashchange", function () {
    if (!byId("vc-suggestions-list")) return;
    state.deepLinkAppliedId = "";
    state.suggestionsPager.userControlled = false;
    if (state.payload) render();
    else {
      window.requestAnimationFrame(function () {
        applySuggestionDeepLink();
      });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();