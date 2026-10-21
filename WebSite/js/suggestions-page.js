(function () {
  /* suggestionsKindPhoto1 + … + notifSheetFastOpen1 + notifSheetReadyOpen1
     (deep-link: scroll card → sheet con riga; no loading shell eterna) */
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

  function readBoardFromUrl() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      if (String(q.get("board") || "").trim().toLowerCase() === "staff") return "staff";
    } catch (e) {}
    return "community";
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
    pendingDeepLinkId: "",
    renderFingerprint: "",
    openSuggestionId: "",
    board: readBoardFromUrl(),
    filterTag: "",
    filterKind: "",
    filterStatus: "",
    sort: readStoredSort(),
    fetchGen: 0,
    staffBoardAllowed: false,
    discussionBoostTimer: null,
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
    /* gateKill1: soft page — mai overlay fullscreen; login solo sui CTA */
    hideGate();
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
    stopDiscussionLiveBoost();
    state.payload = null;
    state.editModalOpen = false;
    state.editSuggestionId = null;
    state.pendingReply = null;
    state.editingComment = null;
    state.openSuggestionId = "";
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
      if (typeof window.__vcReleaseModalScrollLock === "function") {
        window.__vcReleaseModalScrollLock({
          htmlClass: "vc-reviews-modal-open",
          datasetKey: "vcReviewsScrollY",
        });
      } else {
        document.documentElement.classList.remove("vc-reviews-modal-open");
        var y = Number(document.documentElement.dataset.vcReviewsScrollY || "0") || 0;
        delete document.documentElement.dataset.vcReviewsScrollY;
        if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
        window.scrollTo(0, y);
        if (typeof window.__vcHoldPageScroll === "function") window.__vcHoldPageScroll(280, y);
      }
    } catch (eUnpin) {}
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
    if (!body || state.editModalOpen) return false;
    if (!payloadMatchesActiveBoard(body)) return false;
    var fp = payloadFingerprint(body);
    if (!fp || !state.renderFingerprint) return false;
    return fp === state.renderFingerprint;
  }

  /* feedbackDiscussLive1 + feedbackSheetStay1: keep draft/focus/scroll while live sync rewrites the sheet. */
  function captureDiscussionUiState() {
    var sid = String(state.openSuggestionId || "").trim();
    var snap = {
      sid: sid,
      compose: "",
      composeSel: null,
      composeFocused: false,
      editId: "",
      edit: "",
      editSel: null,
      editFocused: false,
      staffReason: "",
      staffReasonSel: null,
      staffReasonFocused: false,
      bodyScroll: 0,
      threadScroll: 0,
      pageY: 0,
    };
    try {
      snap.pageY =
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        (document.body && document.body.scrollTop) ||
        0;
    } catch (eY) {
      snap.pageY = 0;
    }
    if (!sid) return snap;
    var ta = byId("vc-sug-comment-" + sid);
    if (ta) {
      snap.compose = String(ta.value || "");
      try {
        snap.composeSel = { start: ta.selectionStart, end: ta.selectionEnd };
      } catch (eSel) {
        snap.composeSel = null;
      }
      snap.composeFocused = document.activeElement === ta;
    }
    if (state.editingComment && state.editingComment.commentId) {
      snap.editId = String(state.editingComment.commentId || "").trim();
      var eta = snap.editId ? byId("vc-sug-comment-edit-" + snap.editId) : null;
      if (eta) {
        snap.edit = String(eta.value || "");
        try {
          snap.editSel = { start: eta.selectionStart, end: eta.selectionEnd };
        } catch (eSel2) {
          snap.editSel = null;
        }
        snap.editFocused = document.activeElement === eta;
      }
    }
    var reason = byId("vc-sug-staff-reason-" + sid);
    if (reason) {
      snap.staffReason = String(reason.value || "");
      try {
        snap.staffReasonSel = { start: reason.selectionStart, end: reason.selectionEnd };
      } catch (eSel3) {
        snap.staffReasonSel = null;
      }
      snap.staffReasonFocused = document.activeElement === reason;
    }
    var body = byId("vc-feedback-sheet-body");
    if (body) snap.bodyScroll = Number(body.scrollTop) || 0;
    var thread = body ? body.querySelector(".vc-suggestions-thread, .vc-reviews-card__reply") : null;
    if (thread) snap.threadScroll = Number(thread.scrollTop) || 0;
    return snap;
  }

  function restoreDiscussionUiState(snap) {
    if (!snap || !snap.sid) return;
    if (String(state.openSuggestionId || "").trim() !== snap.sid) return;
    var ta = byId("vc-sug-comment-" + snap.sid);
    if (ta) {
      ta.value = snap.compose != null ? String(snap.compose) : "";
      if (snap.composeSel) {
        try {
          ta.setSelectionRange(snap.composeSel.start, snap.composeSel.end);
        } catch (eR1) {}
      }
      if (snap.composeFocused) {
        try {
          ta.focus({ preventScroll: true });
        } catch (eF1) {
          try {
            ta.focus();
          } catch (eF2) {}
        }
      }
    }
    if (snap.editId) {
      var eta = byId("vc-sug-comment-edit-" + snap.editId);
      if (eta) {
        eta.value = snap.edit != null ? String(snap.edit) : "";
        if (snap.editSel) {
          try {
            eta.setSelectionRange(snap.editSel.start, snap.editSel.end);
          } catch (eR2) {}
        }
        if (snap.editFocused) {
          try {
            eta.focus({ preventScroll: true });
          } catch (eF3) {
            try {
              eta.focus();
            } catch (eF4) {}
          }
        }
      }
    }
    var reason = byId("vc-sug-staff-reason-" + snap.sid);
    if (reason) {
      reason.value = snap.staffReason != null ? String(snap.staffReason) : "";
      if (snap.staffReasonSel) {
        try {
          reason.setSelectionRange(snap.staffReasonSel.start, snap.staffReasonSel.end);
        } catch (eR3) {}
      }
      if (snap.staffReasonFocused) {
        try {
          reason.focus({ preventScroll: true });
        } catch (eF5) {
          try {
            reason.focus();
          } catch (eF6) {}
        }
      }
    }
    var body = byId("vc-feedback-sheet-body");
    if (body && snap.bodyScroll) body.scrollTop = snap.bodyScroll;
    var thread = body ? body.querySelector(".vc-suggestions-thread, .vc-reviews-card__reply") : null;
    if (thread && snap.threadScroll) thread.scrollTop = snap.threadScroll;
    if (snap.pageY > 24) {
      try {
        if (typeof window.__vcHoldPageScroll === "function") window.__vcHoldPageScroll(180, snap.pageY);
        else if (typeof window.scrollTo === "function") window.scrollTo(0, snap.pageY);
      } catch (eHold) {}
    }
  }

  function softSyncFeedbackSheetMeta() {
    var sid = String(state.openSuggestionId || "").trim();
    if (!sid) return;
    var row = findSuggestionById(sid);
    if (!row) return;
    var title = byId("vc-feedback-sheet-title");
    if (title) title.textContent = kindLabel(row.kind) + " · " + statusLabel(row.status);
    var decision = byId("vc-feedback-sheet-decision");
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
  }

  function refreshPayloadQuiet() {
    if (state.editModalOpen) return Promise.resolve();
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
        /* feedbackSheetStay1: while typing, keep payload fresh but never wipe inputs */
        if (isTypingInSuggestionField()) {
          state.payload = body;
          softSyncFeedbackSheetMeta();
          return;
        }
        var snap = captureDiscussionUiState();
        state.payload = body;
        render();
        restoreDiscussionUiState(snap);
      })
      .catch(function () {});
  }

  function stopDiscussionLiveBoost() {
    if (state.discussionBoostTimer) {
      clearInterval(state.discussionBoostTimer);
      state.discussionBoostTimer = null;
    }
  }

  function startDiscussionLiveBoost() {
    stopDiscussionLiveBoost();
    if (!state.openSuggestionId) return;
    /* fbHangSoft1: missing sheet = no 3.5s poll thrash (Feedback non trovato) */
    try {
      if (
        state.payload &&
        payloadMatchesActiveBoard(state.payload) &&
        !findSuggestionById(state.openSuggestionId)
      ) {
        return;
      }
    } catch (eMissBoost) {}
    state.discussionBoostTimer = setInterval(function () {
      if (!state.openSuggestionId) {
        stopDiscussionLiveBoost();
        return;
      }
      if (document.visibilityState === "hidden") return;
      try {
        if (
          state.payload &&
          payloadMatchesActiveBoard(state.payload) &&
          !findSuggestionById(state.openSuggestionId)
        ) {
          stopDiscussionLiveBoost();
          return;
        }
      } catch (eMissTick) {}
      void refreshPayloadQuiet();
    }, 3500);
  }

  function startLiveSuggestionsPoll() {
    stopLiveSuggestionsPoll();
    /* Keep poll when a discussion is open even if WS is connected (mobile flap / missed frames). */
    if (state.suggestionsWs && state.suggestionsWs.readyState === 1 && !state.openSuggestionId) return;
    state.livePollTimer = setInterval(function () {
      if (document.visibilityState === "hidden") return;
      void refreshPayloadQuiet();
    /* pageTune1: open-detail floor 9s (prima fino a 4s = troppo caldo) */
    }, state.openSuggestionId ? Math.max(9000, livePollIntervalMs()) : livePollIntervalMs());
  }

  function suggestionsWsUrl() {
    var explicit = String(cfg().wsUrl || "").trim();
    if (explicit) return explicit;
    var api = apiUrl();
    if (!api || typeof URL === "undefined") return "";
    try {
      /* feedbackDiscussLive1 / notifWsRelUrl1: relative /webhooks/... broke new URL() → no live WS */
      var base =
        typeof window !== "undefined" && window.location && window.location.origin
          ? String(window.location.origin)
          : "https://www.viniliecaffe.it";
      var u = new URL(api, base);
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
        /* Keep poll while a discussion sheet is open. */
        if (!state.openSuggestionId) stopLiveSuggestionsPoll();
        else startLiveSuggestionsPoll();
      };
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || "{}"));
          if (
            data.type === "suggestions_changed" ||
            data.type === "suggestions_hello" ||
            data.type === "realtime_hello"
          ) {
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

  /* discordMdUnify1: stesso parser Discord di boards/tickets-lite */
  function formatFeedbackHtml(text, opts) {
    opts = opts || {};
    var keepNewlines = opts.keepNewlines !== false;
    try {
      if (window.VcDiscordMd && typeof window.VcDiscordMd.format === "function") {
        return window.VcDiscordMd.format(text, {
          inline: keepNewlines === false ? true : false,
          classPrefix: "vc-discord-md",
          emojiClass: "vc-emoji vc-discord-emoji vc-feedback-emoji",
        });
      }
    } catch (eMd) {}
    var s = String(text == null ? "" : text);
    s = s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
    if (keepNewlines) s = s.replace(/\r\n|\r|\n/g, "<br>");
    return s;
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
    /* phoneApiSoft429Kill1: mai apiUrlLocal fuori da localhost */
    else base = remote || "/webhooks/site-suggestions";
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
    var voteLocked = !pending;
    var needsLogin = pending && !tokenOk;
    var voteTitle = !pending
      ? t("sugg.voteClosed", "Votazione chiusa")
      : needsLogin
        ? t("sugg.voteTitle", "Accedi con Discord per votare")
        : "";
    var voteExtras = voteLocked
      ? ' disabled title="' + esc(voteTitle) + '"'
      : needsLogin
        ? ' data-vc-login-vote="1" title="' + esc(voteTitle) + '"'
        : "";
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
              '<div class="vc-feedback-comment__text vc-feedback-prose vc-discord-md">' +
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
        /* feedbackDiscussBox1: textarea multi-riga, non input monolinea */
        '<textarea id="vc-sug-comment-' +
        esc(rawSid) +
        '" class="vc-sug-comment-compose__input" rows="3" maxlength="1200" enterkeyhint="enter" placeholder="Scrivi un commento..."></textarea>' +
        '<div class="vc-sug-comment-compose__actions">' +
        '<span class="vc-sug-comment-compose__hint">Invio = a capo · Ctrl/Cmd+Invio = pubblica</span>' +
        '<button type="button" class="vc-sug-comment-compose__btn" data-suggestion-comment-submit="' +
        esc(rawSid) +
        '">Pubblica</button>' +
        "</div></div>";
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
      '<div class="vc-feedback-sheet__decision-text vc-feedback-prose vc-discord-md">' +
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
      esc(formatDateIt(suggestionPostedDate(s))) +
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
      '<div class="vc-feedback-sheet__text vc-feedback-prose vc-discord-md">' +
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
      esc(formatDateIt(suggestionPostedDate(s))) +
      "</span></div></div>" +
      '<div class="vc-feedback-card__side">' +
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
      "</div>" +
      ownActions +
      "</div></div>" +
      '<div class="vc-feedback-card__preview vc-feedback-prose vc-discord-md">' +
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
    /* feedbackSheetStay1: do NOT arm ghost-close guard here — it ate the next card open click */
    var sheet = byId("vc-feedback-sheet");
    state.openSuggestionId = "";
    stopDiscussionLiveBoost();
    /* Resume normal poll cadence (or stop if WS is healthy). */
    startLiveSuggestionsPoll();
    try {
      if (typeof window.__vcReleaseModalScrollLock === "function") {
        window.__vcReleaseModalScrollLock({ htmlClass: "vc-feedback-sheet-open" });
      } else {
        document.documentElement.classList.remove("vc-feedback-sheet-open");
        if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
      }
    } catch (eUn) {}
    if (!sheet) return;
    sheet.classList.remove("is-in");
    sheet.hidden = true;
    sheet.setAttribute("hidden", "");
  }

  function feedbackSheetLoadingMarkup() {
    return (
      '<div class="vc-feedback-sheet__loading" role="status" aria-live="polite" aria-busy="true">' +
      '<span class="vc-feedback-sheet__loading-spin" aria-hidden="true"></span>' +
      "<strong>" +
      esc(t("sugg.sheetLoading", "Apertura discussione…")) +
      "</strong>" +
      "<p>" +
      esc(t("sugg.sheetLoadingHint", "Carico i dettagli del feedback.")) +
      "</p></div>"
    );
  }

  function openFeedbackSheet(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    /* notifSheetFastOpen1: apri shell subito anche senza row in payload */
    state.openSuggestionId = sid;
    var sheet = ensureFeedbackSheet();
    syncFeedbackSheet();
    /* feedbackDup1: bind once here (render also binds after sync; never bind inside sync) */
    bind();
    bindFeedbackSheetActionsOnce();
    sheet.hidden = false;
    sheet.removeAttribute("hidden");
    try {
      if (typeof window.__vcArmModalScrollLock === "function") {
        window.__vcArmModalScrollLock({ htmlClass: "vc-feedback-sheet-open" });
      } else {
        document.documentElement.classList.add("vc-feedback-sheet-open");
        if (typeof window.__vcPinPageScroll === "function") {
          window.__vcPinPageScroll({ soft: true, forcePhoneLock: true });
        }
      }
    } catch (ePin) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSync) {}
    window.requestAnimationFrame(function () {
      sheet.classList.add("is-in");
      try {
        if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      } catch (eSync2) {}
    });
    startDiscussionLiveBoost();
    startLiveSuggestionsPoll();
    /* feedbackSheetStay1: defer quiet refresh so first paint isn't wiped by race */
    window.setTimeout(function () {
      if (String(state.openSuggestionId || "") !== sid) return;
      if (isTypingInSuggestionField()) return;
      void refreshPayloadQuiet();
    }, 420);
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
      if (kicker) {
        kicker.innerHTML =
          '<i class="fa fa-comments-o" aria-hidden="true"></i> ' +
          esc(state.board === "staff" ? "Staff" : "Community");
      }
      if (decision) {
        decision.innerHTML = "";
        decision.hidden = true;
        decision.setAttribute("hidden", "");
      }
      if (foot) foot.innerHTML = "";
      /* notifSheetReadyOpen1: se lista già caricata → errore, non loading eterno */
      if (state.payload && payloadMatchesActiveBoard(state.payload)) {
        if (title) title.textContent = t("sugg.sheetMissingTitle", "Feedback non trovato");
        body.innerHTML =
          '<div class="vc-feedback-sheet__loading" role="status">' +
          "<p>" +
          esc(t("sugg.sheetMissingHint", "Questo feedback non è più disponibile o non hai accesso.")) +
          "</p></div>";
        return;
      }
      if (title) title.textContent = t("sugg.sheetLoadingTitle", "Discussione");
      body.innerHTML = feedbackSheetLoadingMarkup();
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

  /* feedbackDateOrder1: card date = createdAt (same key as “Più recenti”), not updatedAt from comments/staff. */
  function suggestionPostedDate(suggestion) {
    if (!suggestion || typeof suggestion !== "object") return "";
    return suggestion.createdAt || suggestion.created_at || suggestion.submittedAt || "";
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

  function resolveDeepLinkSuggestionId() {
    var fromHash = extractDeepLinkSuggestionId();
    if (fromHash) return fromHash;
    var pending = String(state.pendingDeepLinkId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(pending)) return pending;
    var open = String(state.openSuggestionId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(open)) return open;
    return "";
  }

  function scrollSuggestionCardIntoView(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    try {
      var card = document.getElementById("vc-suggestion-" + sid);
      if (!card || typeof card.scrollIntoView !== "function") return;
      card.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    } catch (eScr) {}
  }

  function stripSuggestionDeepLinkHash() {
    try {
      if (!String(window.location.hash || "").trim()) return;
      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      }
    } catch (eStrip) {}
  }

  function ensurePageIncludesDeepLink(sortedSuggestions) {
    if (state.suggestionsPager.userControlled) return;
    /* notifSheetReadyOpen1: anche dopo strip hash (pending/open id) */
    var suggestionId = resolveDeepLinkSuggestionId();
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
      /* feedbackPagerOrganico1: stessa pill numerata di ruoli/classifiche (no classic) */
      mp.fill(pager, page, totalPages, { aria: "Paginazione feedback" }, {
        go: function (nextPage) {
          var cap = Math.max(1, Number(state.suggestionsPager.totalPages) || 1);
          var next = Math.max(1, Math.min(cap, Number(nextPage) || 1));
          if (next === Number(state.suggestionsPager.page || 1)) return;
          state.suggestionsPager.userControlled = true;
          state.suggestionsPager.page = next;
          render();
          /* scrollStayAll1: no scrollIntoView — resta all'altezza corrente */
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
            '" alt="Allegato" width="96" height="96" style="width:96px;height:96px;object-fit:cover;border-radius:.75rem;border:1px solid rgba(255,255,255,.12)" loading="lazy" decoding="async" /></a>'
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
    window.VcFormDrafts.save(
      "suggestions:new",
      {
        content: content,
        kind: state.draftKind === "bug" ? "bug" : "suggestion",
        tag: normalizeTopicTag(state.draftTag) || "",
      },
      { notify: true },
    );
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
      var wasOpen =
        !root.hidden ||
        root.classList.contains("vc-reviews-modal--open") ||
        document.documentElement.classList.contains("vc-reviews-modal-open");
      root.innerHTML = "";
      root.className = "vc-reviews-modal";
      root.hidden = true;
      /* fbHangSoft1: release scroll lock solo se il modal era davvero aperto
         (ogni render() lo richiamava → unpin/hold storm) */
      if (!wasOpen) return;
      try {
        if (typeof window.__vcReleaseModalScrollLock === "function") {
          window.__vcReleaseModalScrollLock({
            htmlClass: "vc-reviews-modal-open",
            datasetKey: "vcReviewsScrollY",
          });
        } else {
          document.documentElement.classList.remove("vc-reviews-modal-open");
          var yClose = Number(document.documentElement.dataset.vcReviewsScrollY || "0") || 0;
          delete document.documentElement.dataset.vcReviewsScrollY;
          if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
          window.scrollTo(0, yClose);
          if (typeof window.__vcHoldPageScroll === "function") window.__vcHoldPageScroll(280, yClose);
        }
      } catch (eUnpin) {}
      return;
    }
    root.hidden = false;
    root.innerHTML = modalInnerMarkup();
    root.className = "vc-reviews-modal vc-reviews-modal--open";
    try {
      if (typeof window.__vcArmModalScrollLock === "function") {
        window.__vcArmModalScrollLock({
          htmlClass: "vc-reviews-modal-open",
          datasetKey: "vcReviewsScrollY",
        });
      } else {
        var y =
          window.scrollY ||
          (document.documentElement && document.documentElement.scrollTop) ||
          0;
        document.documentElement.dataset.vcReviewsScrollY = String(y);
        if (typeof window.__vcResetPinnedPageScrollY === "function") {
          window.__vcResetPinnedPageScrollY(y);
        }
        document.documentElement.classList.add("vc-reviews-modal-open");
        if (typeof window.__vcPinPageScroll === "function") {
          window.__vcPinPageScroll({ soft: true, forcePhoneLock: true });
        }
        if (typeof window.__vcHoldPageScroll === "function") {
          window.__vcHoldPageScroll(280, y);
        }
      }
    } catch (ePin) {}
    if (!state.editSuggestionId && state.draftImages.length) {
      renderImagePreview();
    }
  }

  function openFormModal() {
    var token = getToken();
    var viewer = state.payload && state.payload.viewer;
    if (!token || !viewer || !viewer.id) {
      if (window.VcLoginRequired && typeof window.VcLoginRequired.require === "function") {
        window.VcLoginRequired.require({
          title: t("sugg.new", "Nuovo feedback"),
          sub: t("sugg.gateSub", "Feedback"),
          body: t(
            "sugg.loginToSuggest",
            "Accedi con Discord per pubblicare un feedback.",
          ),
        });
        return;
      }
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
      var raw = resolveDeepLinkSuggestionId();
      if (!raw) return;
      if (state.deepLinkAppliedId === raw && String(state.openSuggestionId || "") === raw) {
        stripSuggestionDeepLinkHash();
        return;
      }
      /* notifSheetReadyOpen1: aspetta la riga in payload → scroll → sheet pieno */
      state.pendingDeepLinkId = raw;
      if (!state.payload) return;
      var row = findSuggestionById(raw);
      if (!row) {
        /* lista caricata ma id assente → sheet con errore, non loading infinito */
        state.deepLinkAppliedId = raw;
        openFeedbackSheet(raw);
        stripSuggestionDeepLinkHash();
        return;
      }
      state.deepLinkAppliedId = raw;
      state.pendingDeepLinkId = "";
      scrollSuggestionCardIntoView(raw);
      window.setTimeout(function () {
        openFeedbackSheet(raw);
        stripSuggestionDeepLinkHash();
      }, 180);
    } catch (e1) {}
  }

  /* notifSheetReadyOpen1 + feedbackLayout1: soft-open campanella — board community di default;
     timeout se fetch hang → sheet errore (no loading eterno) */
  window.__vcFeedbackOpenDeepLink = function (opts) {
    opts = opts || {};
    var id = String(opts.id || "").trim();
    if (!/^[a-f0-9]{24}$/i.test(id)) return false;
    var wantBoard = opts.board === "staff" ? "staff" : "community";
    try {
      if (wantBoard === "staff" && !canAccessStaffBoard()) wantBoard = "community";
    } catch (eStaff) {
      wantBoard = "community";
    }
    state.pendingDeepLinkId = id;
    state.deepLinkAppliedId = "";
    function finishDeepLink() {
      try {
        applySuggestionDeepLink();
      } catch (eApp) {}
    }
    function armDeepLinkWatchdog() {
      window.setTimeout(function () {
        try {
          if (String(state.pendingDeepLinkId || "") !== id) return;
          if (String(state.openSuggestionId || "") === id && findSuggestionById(id)) return;
          /* ancora pending dopo 8s → apri sheet (missing/loading resolve in sync) */
          openFeedbackSheet(id);
          state.deepLinkAppliedId = id;
          state.pendingDeepLinkId = "";
          stripSuggestionDeepLinkHash();
        } catch (eWd) {}
      }, 8000);
    }
    if (wantBoard !== normalizeBoardId(state.board)) {
      state.board = wantBoard;
      state.suggestionsPager.page = 1;
      state.suggestionsPager.userControlled = false;
      state.renderFingerprint = "";
      state.payload = null;
      state.fetchGen = Number(state.fetchGen || 0) + 1;
      stopLiveSuggestionsPoll();
      try {
        var uBoard = new URL(window.location.href);
        if (wantBoard === "staff") uBoard.searchParams.set("board", "staff");
        else uBoard.searchParams.delete("board");
        uBoard.hash = "vc-suggestion-" + id;
        history.replaceState(null, "", uBoard.pathname + uBoard.search + uBoard.hash);
      } catch (eUrl) {}
      try {
        syncFeedbackScopeBar();
        ensureFeedbackScopeBar();
      } catch (eBar) {}
      showListSkeleton(true);
      armDeepLinkWatchdog();
      void fetchPayload({ force: true }).then(finishDeepLink).catch(finishDeepLink);
      return true;
    }
    if (findSuggestionById(id)) {
      applySuggestionDeepLink();
      void refreshPayloadQuiet();
      return true;
    }
    armDeepLinkWatchdog();
    void fetchPayload({ force: false }).then(finishDeepLink).catch(finishDeepLink);
    return true;
  };

  function render() {
    var wrap = byId("vc-suggestions-list");
    if (!wrap) return;
    var yKeep = 0;
    try {
      yKeep =
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        0;
    } catch (eY0) {}
    function restoreY() {
      /* scrollStayAll1: re-render lista non deve yo-yo l'altezza */
      try {
        if (yKeep < 24) return;
        var cur =
          window.pageYOffset ||
          (document.documentElement && document.documentElement.scrollTop) ||
          0;
        if (Math.abs(cur - yKeep) < 2) return;
        if (typeof window.__vcHoldPageScroll === "function") window.__vcHoldPageScroll(200, yKeep);
        else if (typeof window.scrollTo === "function") window.scrollTo(0, yKeep);
      } catch (eRest) {}
    }
    /* feedbackTabSwitch2: never paint previous board over skeleton / loading */
    if (!state.payload) {
      if (wrap.getAttribute("aria-busy") === "true") return;
      wrap.innerHTML = emptyMarkup(false);
      renderSuggestionsPager(0);
      ensureFeedbackScopeBar();
      ensureFeedbackFiltersBar();
      syncHeadButton();
      restoreY();
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
    bindFeedbackSheetActionsOnce();
    bindFeedbackListOpenOnce();
    scanFeedbackAvatars(wrap);
    window.requestAnimationFrame(function () {
      applySuggestionDeepLink();
      scanFeedbackAvatars(wrap);
      restoreY();
    });
    restoreY();
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
      try {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
      } catch (ePrev) {}
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
      /* scrollStayAll1: no scrollIntoView su freccette pager */
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
        if (btn.getAttribute("data-vc-login-vote") === "1" || !getToken()) {
          if (window.VcLoginRequired && typeof window.VcLoginRequired.require === "function") {
            window.VcLoginRequired.require({
              title: t("sugg.new", "Nuovo feedback"),
              sub: t("sugg.gateSub", "Feedback"),
              body: t("sugg.voteTitle", "Accedi con Discord per votare"),
            });
          }
          return;
        }
        if (btn.disabled) return;
        var id = String(btn.getAttribute("data-suggestion-vote") || "").trim();
        var dir = String(btn.getAttribute("data-vote-dir") || "").trim();
        if (!id || (dir !== "up" && dir !== "down")) return;
        submitSuggestionVote(id, dir, btn);
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-submit]")).forEach(function (btn) {
      function publishComment() {
        /* feedbackDup1: single-flight — ignore stacked listeners / double click */
        if (state.commentInFlight || btn.disabled) return;
        if (!getToken()) {
          if (window.VcLoginRequired && typeof window.VcLoginRequired.require === "function") {
            window.VcLoginRequired.require({
              title: t("sugg.new", "Nuovo feedback"),
              sub: t("sugg.gateSub", "Feedback"),
              body: t("sugg.loginToSuggest", "Accedi con Discord per pubblicare un feedback."),
            });
          }
          return;
        }
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
            applySuggestionLiveUpdate(body.suggestion);
          })
          .catch(function (err) {
            setStatus(err && err.message ? err.message : t("sugg.error", "Errore."), true);
          })
          .then(function () {
            state.commentInFlight = false;
            btn.disabled = false;
          });
      }
      btn.addEventListener("click", publishComment);
      var sid = String(btn.getAttribute("data-suggestion-comment-submit") || "").trim();
      var taBind = sid ? byId("vc-sug-comment-" + sid) : null;
      if (taBind && !taBind.dataset.vcEnterSendBound) {
        taBind.dataset.vcEnterSendBound = "1";
        taBind.addEventListener("keydown", function (ev) {
          if (ev.key !== "Enter") return;
          if (!(ev.ctrlKey || ev.metaKey)) return;
          try {
            ev.preventDefault();
          } catch (ePrev) {}
          publishComment();
        });
      }
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
          /* voteStaleFix1 + feedbackDiscussLive1 */
          applySuggestionLiveUpdate(body.suggestion);
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
            applySuggestionLiveUpdate(body.suggestion);
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
              applySuggestionLiveUpdate(body.suggestion);
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
        /* feedbackSheetStay1: delegated once via bindFeedbackSheetActionsOnce — skip stack */
        if (btn.closest && btn.closest("#vc-feedback-sheet")) return;
        btn.addEventListener("click", function () {
          staffDecisionSet(
            String(btn.getAttribute("data-suggestion-decision-id") || "").trim(),
            String(btn.getAttribute("data-suggestion-decision-status") || "").trim(),
            btn,
          );
        });
      });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-staff-delete]")).forEach(function (btn) {
      if (btn.closest && btn.closest("#vc-feedback-sheet")) return;
      btn.addEventListener("click", function () {
        staffDeleteSuggestion(String(btn.getAttribute("data-suggestion-staff-delete") || "").trim(), btn);
      });
    });
  }

  var feedbackSheetActionsBound = false;

  function bindFeedbackSheetActionsOnce() {
    if (feedbackSheetActionsBound) return;
    var sheet = byId("vc-feedback-sheet");
    if (!sheet) return;
    feedbackSheetActionsBound = true;
    sheet.addEventListener("click", function (ev) {
      var tEl = ev.target;
      if (!tEl || !tEl.closest) return;
      var dec = tEl.closest("[data-suggestion-decision-id][data-suggestion-decision-status]");
      if (dec && sheet.contains(dec)) {
        ev.preventDefault();
        staffDecisionSet(
          String(dec.getAttribute("data-suggestion-decision-id") || "").trim(),
          String(dec.getAttribute("data-suggestion-decision-status") || "").trim(),
          dec,
        );
        return;
      }
      var del = tEl.closest("[data-suggestion-staff-delete]");
      if (del && sheet.contains(del)) {
        ev.preventDefault();
        staffDeleteSuggestion(String(del.getAttribute("data-suggestion-staff-delete") || "").trim(), del);
      }
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
          closeFeedbackSheet();
          invalidateSuggestionsListCache();
          return fetchPayload({ force: true });
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

  function patchSuggestionVoteInPayload(suggestion) {
    if (!suggestion || !suggestion.id || !state.payload || !Array.isArray(state.payload.suggestions)) return false;
    var sid = String(suggestion.id);
    var list = state.payload.suggestions;
    for (var i = 0; i < list.length; i += 1) {
      if (String((list[i] && list[i].id) || "") === sid) {
        list[i] = Object.assign({}, list[i], suggestion);
        return true;
      }
    }
    return false;
  }

  /* feedbackDiscussLive1: apply POST/PATCH suggestion without full list skeleton flash. */
  function applySuggestionLiveUpdate(suggestion) {
    invalidateSuggestionsListCache();
    var snap = captureDiscussionUiState();
    if (suggestion && patchSuggestionVoteInPayload(suggestion)) {
      /* voteLikeStale1: bump gen so in-flight quiet/WS GETs cannot revert the vote */
      state.fetchGen = Number(state.fetchGen || 0) + 1;
      state.renderFingerprint = payloadFingerprint(state.payload);
      render();
      restoreDiscussionUiState(snap);
      void refreshPayloadQuiet();
      return true;
    }
    void fetchPayload({ force: true });
    return false;
  }

  function invalidateSuggestionsListCache() {
    try {
      if (!window.VcApiCache) return;
      var url = apiUrl();
      window.VcApiCache.invalidate(
        window.VcApiCache.keyFor(url, {
          scope: "suggestions:" + normalizeBoardId(state.board),
          auth: getToken(),
          v: "feedbackLoadBoot1",
        }),
      );
      if (typeof window.VcApiCache.clearWebhookBlock === "function") {
        window.VcApiCache.clearWebhookBlock(url);
      }
    } catch (eInv) {}
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
        /* voteLikeStale1: aggiorna subito dal POST; bump gen evita quiet/WS stale */
        invalidateSuggestionsListCache();
        if (body.suggestion && patchSuggestionVoteInPayload(body.suggestion)) {
          state.fetchGen = Number(state.fetchGen || 0) + 1;
          state.renderFingerprint = payloadFingerprint(state.payload);
          render();
          void refreshPayloadQuiet();
          return;
        }
        return fetchPayload({ force: true });
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
        if (body.suggestion) applySuggestionLiveUpdate(body.suggestion);
        else return fetchPayload({ force: true });
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
    var copy =
      status === "accepted"
        ? {
            title: "Accetta suggerimento",
            message: "Accettare questo suggerimento?",
            confirmLabel: "Accetta",
            danger: false,
            icon: "fa-check-circle",
          }
        : status === "rejected"
          ? {
              title: "Rifiuta suggerimento",
              message: "Rifiutare questo suggerimento?",
              confirmLabel: "Rifiuta",
              danger: true,
              icon: "fa-times-circle",
            }
          : {
              title: "Rimetti in valutazione",
              message: "Riportare questo suggerimento in valutazione?",
              confirmLabel: "Conferma",
              danger: false,
              icon: "fa-undo",
            };
    var confirmP = (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.confirm !== "function") return true;
      return D.confirm(copy);
    });
    return confirmP.then(function (ok) {
      if (!ok) return;
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
          /* feedbackSheetStay1: live-apply decision so title/status update immediately */
          if (body.suggestion) {
            applySuggestionLiveUpdate(body.suggestion);
          } else {
            invalidateSuggestionsListCache();
            void fetchPayload({ force: true });
          }
        })
        .catch(function (err) {
          setStatus((err && err.message) || "Errore durante l'operazione.", true);
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
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

  function fetchPayload(opts) {
    var force = Boolean(opts && opts.force);
    var gen = (state.fetchGen = Number(state.fetchGen || 0) + 1);
    var boardAtFetch = normalizeBoardId(state.board);
    setStatus("", false);
    /* Keep list empty until this board's payload applies (no cross-board flash). */
    if (!state.payload || !payloadMatchesActiveBoard(state.payload)) {
      state.payload = null;
    }
    if (!force || !state.payload) showListSkeleton(true);
    var url = apiUrl();
    if (force && window.VcApiCache) {
      try {
        window.VcApiCache.invalidate(
          window.VcApiCache.keyFor(url, {
            scope: "suggestions:" + boardAtFetch,
            auth: getToken(),
            v: "feedbackLoadBoot1",
          }),
        );
        if (typeof window.VcApiCache.clearWebhookBlock === "function") {
          window.VcApiCache.clearWebhookBlock(url);
        }
      } catch (eInv) {}
    }
    function loadErrorMessage(body) {
      if (body && body.message) return String(body.message);
      var code = body && body.error ? String(body.error) : "";
      if (code === "timeout") return t("sugg.errorTimeout", "Timeout: riprova tra poco.");
      if (code === "network_error") return t("sugg.errorNetwork", "Connessione instabile: riprova.");
      if (code === "invalid_json" || code === "empty_body") {
        return t("sugg.errorServer", "Risposta non valida dal server. Riprova.");
      }
      if (code === "rate_limited_client" || code === "rate_limited") {
        return t("sugg.errorRate", "Troppe richieste: attendi un momento.");
      }
      if (code === "guild_unavailable") return t("sugg.errorGuild", "Server Discord non disponibile.");
      return t("sugg.errorLoad", "Impossibile caricare i suggerimenti.");
    }
    /* feedbackLoadFail1: clear skeleton + staff 403 → community (no stuck cards). */
    function clearListAfterFetchFail() {
      var wrap = byId("vc-suggestions-list");
      if (!wrap) return;
      if (window.VcListSkeleton && typeof window.VcListSkeleton.paintFail === "function") {
        window.VcListSkeleton.paintFail(wrap, {
          title: t("sugg.errorLoad", "Impossibile caricare i suggerimenti."),
          text: t("sugg.errorLoadHint", "Ricarica la pagina o riprova tra poco."),
        });
      } else {
        wrap.removeAttribute("aria-busy");
        wrap.innerHTML =
          '<article class="vc-reviews-empty">' +
          '<span class="vc-reviews-empty__icon"><i class="fa fa-exclamation-circle" aria-hidden="true"></i></span>' +
          "<strong>" +
          esc(t("sugg.errorLoad", "Impossibile caricare i suggerimenti.")) +
          "</strong>" +
          "<p>" +
          esc(t("sugg.errorLoadHint", "Ricarica la pagina o riprova tra poco.")) +
          "</p>" +
          "</article>";
      }
      var pager = byId("vc-suggestions-pager");
      if (pager) {
        pager.innerHTML = "";
        pager.hidden = true;
      }
    }
    function applyBody(body) {
      if (gen !== state.fetchGen) return;
      if (normalizeBoardId(state.board) !== boardAtFetch) return;
      if (!body || body.ok !== true) {
        if (
          boardAtFetch === "staff" &&
          body &&
          (body.error === "forbidden" || Number(body.status) === 403)
        ) {
          state.staffBoardAllowed = false;
          state.board = "community";
          state.payload = null;
          state.renderFingerprint = "";
          syncFeedbackScopeBar();
          ensureFeedbackScopeBar();
          setStatus(loadErrorMessage(body), true);
          window.setTimeout(function () {
            if (normalizeBoardId(state.board) !== "community") return;
            void fetchPayload();
          }, 80);
          return;
        }
        throw new Error(loadErrorMessage(body));
      }
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
    /* feedbackNotifColdOpen1: soft timeout/rete/429 → backoff multiplo; deep-link/push tiene skeleton più a lungo. */
    function isSoftLoadErr(err, body) {
      var code = "";
      if (body && body.error) code = String(body.error);
      else if (err && err.code) code = String(err.code);
      if (
        code === "timeout" ||
        code === "network_error" ||
        code === "invalid_json" ||
        code === "empty_body" ||
        code === "rate_limited" ||
        code === "rate_limited_client" ||
        code === "guild_unavailable"
      ) {
        return true;
      }
      if (err && err.soft) return true;
      var msg = err && err.message ? String(err.message) : "";
      if (/timeout|connessione|instabile|troppe richieste|risposta non valida|network|rate.?limit/i.test(msg)) {
        return true;
      }
      if (!state.payload && /impossibile caricare|could not load/i.test(msg)) return true;
      return false;
    }
    function coldOpenBoost() {
      try {
        if (resolveDeepLinkSuggestionId()) return true;
        var q = new URLSearchParams(window.location.search || "");
        if (String(q.get("board") || "").trim().toLowerCase() === "staff") return true;
        if (q.get("vcNotif") || String(q.get("from") || "") === "notif") return true;
      } catch (eCold) {}
      return false;
    }
    function failOrRetry(err, attempt) {
      if (gen !== state.fetchGen) return;
      if (normalizeBoardId(state.board) !== boardAtFetch) return;
      var soft = isSoftLoadErr(err, err && err.body ? err.body : null);
      var delays = coldOpenBoost() ? [600, 1400, 2800] : [450, 1100, 2200];
      if (soft && attempt < delays.length) {
        showListSkeleton(true);
        return window.setTimeout(function () {
          if (gen !== state.fetchGen) return;
          if (normalizeBoardId(state.board) !== boardAtFetch) return;
          doFetch(attempt + 1);
        }, delays[attempt]);
      }
      clearListAfterFetchFail();
      setStatus(err && err.message ? err.message : t("sugg.errorLoad", "Impossibile caricare i suggerimenti."), true);
    }
    function doFetch(attempt) {
      attempt = Math.max(0, Math.floor(Number(attempt) || 0));
      var retried = attempt > 0;
      if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
        var token = getToken();
        return window.VcApiCache
          .fetchWithCache(
            window.VcApiCache.keyFor(url, {
              scope: "suggestions:" + boardAtFetch,
              auth: token,
              v: "feedbackLoadBoot1",
            }),
            url,
            {
              ttlMs: 25000,
              staleMs: 120000,
              persistMs: 10 * 60 * 1000,
              timeoutMs: coldOpenBoost() ? 28000 : 20000,
              forceNetwork: Boolean(retried) || force,
              useCache: !(retried || force),
              fetchInit: {
                method: "GET",
                headers: authHeaders(),
                cache: retried || force ? "no-store" : "default",
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
            var body = payload && payload.body ? payload.body : null;
            try {
              applyBody(body);
            } catch (errApply) {
              if (body && body.ok !== true) {
                errApply.soft = isSoftLoadErr(errApply, body);
                errApply.code = body && body.error ? String(body.error) : "";
                errApply.body = body;
              }
              throw errApply;
            }
          })
          .catch(function (err) {
            failOrRetry(err, attempt);
          });
      }
      return fetch(url, {
        method: "GET",
        headers: authHeaders(),
        cache: retried ? "no-store" : "default",
      })
        .then(parseSuggestionsApiJson)
        .then(function (body) {
          try {
            applyBody(body);
          } catch (errApply) {
            if (body && body.ok !== true) {
              errApply.soft = isSoftLoadErr(errApply, body);
              errApply.code = body && body.error ? String(body.error) : "";
              errApply.body = body;
            }
            throw errApply;
          }
        })
        .catch(function (err) {
          failOrRetry(err, attempt);
        });
    }
    return doFetch(0);
  }

  function submitNewSuggestion() {
    if (state.submitInFlight) return;
    var token = getToken();
    if (!token) {
      if (window.VcLoginRequired && typeof window.VcLoginRequired.require === "function") {
        window.VcLoginRequired.require({
          title: t("sugg.new", "Nuovo feedback"),
          sub: t("sugg.gateSub", "Feedback"),
          body: t("sugg.loginToSuggest", "Accedi con Discord per pubblicare un feedback."),
        });
        return;
      }
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
    /* notifSheetFastOpen1: da notifica → sheet shell prima del fetch lista */
    try {
      var bootDeep = extractDeepLinkSuggestionId();
      if (bootDeep) {
        /* notifSheetReadyOpen1: non aprire sheet vuoto al boot — aspetta fetch+card */
        state.pendingDeepLinkId = bootDeep;
      }
    } catch (eDeepBoot) {}
    if (shouldUnlockPage()) {
      hideGate();
      bootFetchSuggestions();
      return;
    }
    /* loginRequiredModal1: niente gate fullscreen — login sui CTA */
    hideGate();
    if (!getToken()) {
      bootFetchSuggestions();
      return;
    }
    hideGate();
    bootFetchSuggestions();
  }

  function bootFetchSuggestions() {
    var preferCache = Boolean(
      extractDeepLinkSuggestionId() || String(state.openSuggestionId || "").trim(),
    );
    try {
      if (window.VcApiCache) {
        var u = apiUrl();
        if (typeof window.VcApiCache.clearWebhookBlock === "function") {
          window.VcApiCache.clearWebhookBlock(u);
        }
        if (typeof window.VcApiCache.clearWebhookBlocks === "function") {
          window.VcApiCache.clearWebhookBlocks();
        }
        /* notifSheetFastOpen1: deep-link tiene cache calda (onStale → sheet pieno subito) */
        if (
          !preferCache &&
          typeof window.VcApiCache.invalidate === "function"
        ) {
          window.VcApiCache.invalidate(
            window.VcApiCache.keyFor(u, {
              scope: "suggestions:" + normalizeBoardId(state.board),
              auth: getToken(),
              v: "feedbackLoadBoot1",
            }),
          );
        }
      }
    } catch (eBoot) {}
    void fetchPayload({ force: !preferCache });
  }

  function clearListAfterFetchFailPublic() {
    var wrap = byId("vc-suggestions-list");
    if (!wrap) return;
    if (window.VcListSkeleton && typeof window.VcListSkeleton.paintFail === "function") {
      window.VcListSkeleton.paintFail(wrap, {
        title: t("sugg.loginToRead", "Accedi per il feedback"),
        text: t("sugg.loginToReadHint", "Collega Discord per leggere e scrivere feedback."),
      });
    } else {
      wrap.removeAttribute("aria-busy");
      wrap.innerHTML = "";
    }
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
    if (getToken()) return;
    hideGate();
    if (!state.payload) fetchPayload();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (!byId("vc-suggestions-list")) return;
    if (state.payload) {
      void refreshPayloadQuiet();
      return;
    }
    if (!getToken() && !shouldUnlockPage()) return;
    void fetchPayload({ force: true });
  });

  window.addEventListener("pageshow", function (ev) {
    if (!ev || !ev.persisted) return;
    if (!byId("vc-suggestions-list")) return;
    if (state.payload) {
      void refreshPayloadQuiet();
      return;
    }
    if (!getToken() && !shouldUnlockPage()) return;
    void fetchPayload({ force: true });
  });

  window.addEventListener("vc:site-api-refetch", function () {
    if (!byId("vc-suggestions-list")) return;
    void fetchPayload();
  });

  window.addEventListener("beforeunload", function () {
    stopDiscussionLiveBoost();
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