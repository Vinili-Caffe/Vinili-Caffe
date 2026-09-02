(function () {
  "use strict";
    var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var state = {
    payload: null,
    replyOpenId: null,
    editModalOpen: false,
    deepLinkAppliedId: "",
    reviewsWs: null,
    reviewsWsReconnectTimer: null,
    renderFingerprint: "",
    langFilter: "it",
    draftLang: "it",
    reviewsPager: {
      page: 1,
      perPage: 9,
      totalPages: 1,
      userControlled: false,
    },
    draft: {
      server: { rating: 5, content: "" },
    },
  };

  function pageKind() {
    try {
      var k = String((cfg().kind || "server")).trim().toLowerCase();
      return k === "bot" ? "bot" : "server";
    } catch (e) {
      return "server";
    }
  }

  function isBotReviewsPage() {
    return pageKind() === "bot";
  }

  function viewerOwnReview(viewer) {
    if (!viewer) return null;
    if (isBotReviewsPage()) return viewer.botReview || null;
    return viewer.serverReview || null;
  }

  function currentSiteLang() {
    try {
      if (window.VcI18n && typeof window.VcI18n.getLang === "function") {
        var lang = String(window.VcI18n.getLang() || "it").toLowerCase();
        return lang.indexOf("en") === 0 ? "en" : "it";
      }
    } catch (e) {}
    return "it";
  }

  function normalizeLang(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (raw === "en" || raw.indexOf("en-") === 0) return "en";
    if (raw === "all") return "all";
    return "it";
  }

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

  function hideReviewsGate() {
    var g = byId("vc-reviews-gate");
    if (!g) return;
    g.setAttribute("hidden", "");
    g.classList.add("vc-reviews-gate--dismissed");
    g.setAttribute("aria-hidden", "true");
  }

  function showReviewsLoginGate() {
    var g = byId("vc-reviews-gate");
    if (!g) return;
    g.removeAttribute("hidden");
    g.classList.remove("vc-reviews-gate--dismissed");
    g.setAttribute("aria-hidden", "false");
  }

  function wireGateLoginCta() {
    var gateBtn = byId("vc-reviews-gate-login-cta");
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

  function closeEditModalDom() {
    state.editModalOpen = false;
    var root = byId("vc-reviews-edit-modal");
    if (root) {
      root.innerHTML = "";
      root.className = "vc-reviews-modal";
      root.hidden = true;
    }
    try {
      document.documentElement.classList.remove("vc-reviews-modal-open");
    } catch (e) {}
  }

  function clearReviewsContent() {
    disconnectReviewsWebSocket();
    state.payload = null;
    state.replyOpenId = null;
    state.editModalOpen = false;
    state.reviewsPager.page = 1;
    state.reviewsPager.totalPages = 1;
    state.reviewsPager.userControlled = false;
    var serverWrap = byId("vc-reviews-server-list");
    if (serverWrap) serverWrap.innerHTML = "";
    var pager = byId("vc-reviews-pager");
    if (pager) {
      pager.innerHTML = "";
      pager.hidden = true;
    }
    closeEditModalDom();
  }

  function shouldUnlockReviewsPage() {
    return Boolean(getDiscordUserSync());
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_SITE_REVIEWS) || {};
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function getToken() {
    var token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return "";
    var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
    if (exp && Date.now() >= exp) return "";
    return token;
  }

  function apiUrl() {
    var conf = cfg();
    var host = String(window.location.hostname || "").toLowerCase();
    var local = String(conf.apiUrlLocal || "").trim();
    var remote = String(conf.apiUrl || "").trim();
    var base = (host === "localhost" || host === "127.0.0.1") && local ? local : remote || local;
    if (!base) return "";
    var kind = pageKind();
    try {
      var u = new URL(base, window.location.origin);
      u.searchParams.set("kind", kind);
      return u.href;
    } catch (e) {
      return base + (base.indexOf("?") >= 0 ? "&" : "?") + "kind=" + encodeURIComponent(kind);
    }
  }

  function reviewActionUrl(reviewId, suffix) {
    var id = String(reviewId || "").trim();
    var extra = String(suffix || "").trim().replace(/^\/+/, "");
    var base = apiUrl();
    if (!base || !id) return base || "";
    try {
      var u = new URL(base, window.location.origin);
      u.pathname = String(u.pathname || "").replace(/\/$/, "") + "/" + encodeURIComponent(id) + (extra ? "/" + extra : "");
      return u.href;
    } catch (e) {
      var parts = String(base).split("?");
      var path = String(parts[0] || "").replace(/\/$/, "") + "/" + encodeURIComponent(id) + (extra ? "/" + extra : "");
      return path + (parts[1] ? "?" + parts[1] : "");
    }
  }

  function reviewsRealtimeWsUrl() {
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

  function disconnectReviewsWebSocket() {
    if (state.reviewsWsReconnectTimer) {
      clearTimeout(state.reviewsWsReconnectTimer);
      state.reviewsWsReconnectTimer = null;
    }
    try {
      if (state.reviewsWs) {
        state.reviewsWs.onclose = null;
        state.reviewsWs.close();
      }
    } catch (e2) {}
    state.reviewsWs = null;
  }

  function scheduleReviewsWsReconnect() {
    if (state.reviewsWsReconnectTimer) return;
    state.reviewsWsReconnectTimer = setTimeout(function () {
      state.reviewsWsReconnectTimer = null;
      connectReviewsWebSocket();
    }, 8000);
  }

  function isTypingInReviewField() {
    var a = document.activeElement;
    if (!a || !a.id) return false;
    return String(a.id).indexOf("vc-reviews-reply-") === 0;
  }

  function reviewsPayloadFingerprint(body) {
    try {
      return JSON.stringify({
        reviews: (body && body.reviews) || null,
        viewer: (body && body.viewer) || null,
        staffers: (body && body.staffers) || null,
        langFilter: state.langFilter,
        page: state.reviewsPager.page,
      });
    } catch (e) {
      return "";
    }
  }

  function refreshReviewsPayloadQuiet() {
    if (state.editModalOpen || isTypingInReviewField()) return Promise.resolve();
    if (!byId("vc-reviews-server-list")) return Promise.resolve();
    return fetch(apiUrl(), {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    })
      .then(parseJsonResponse)
      .then(function (body) {
        if (!body || body.ok !== true) return;
        setStatus("", false);
        var fp = reviewsPayloadFingerprint(body);
        if (fp && fp === state.renderFingerprint && !state.replyOpenId) {
          state.payload = body;
          return;
        }
        state.payload = body;
        syncDraftFromPayload();
        render();
      })
      .catch(function () {});
  }

  function connectReviewsWebSocket() {
    if (typeof WebSocket === "undefined") return;
    var url = reviewsRealtimeWsUrl();
    if (!url) return;
    if (state.reviewsWsReconnectTimer) {
      clearTimeout(state.reviewsWsReconnectTimer);
      state.reviewsWsReconnectTimer = null;
    }
    try {
      if (state.reviewsWs) {
        state.reviewsWs.onclose = null;
        state.reviewsWs.close();
      }
    } catch (e3) {}
    state.reviewsWs = null;
    try {
      var ws = new WebSocket(url);
      state.reviewsWs = ws;
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || "{}"));
          if (data.type === "reviews_changed") {
            void refreshReviewsPayloadQuiet();
          }
        } catch (e4) {}
      };
      ws.onclose = function () {
        state.reviewsWs = null;
        scheduleReviewsWsReconnect();
      };
      ws.onerror = function () {
        try {
          ws.close();
        } catch (e5) {}
      };
    } catch (e6) {
      state.reviewsWs = null;
    }
  }

  function starsMarkup(value) {
    var safe = Math.max(1, Math.min(5, Math.round(Number(value) || 0)));
    var out = "";
    for (var i = 1; i <= 5; i += 1) {
      out += '<i class="fa ' + (i <= safe ? "fa-star" : "fa-star-o") + '" aria-hidden="true"></i>';
    }
    return out;
  }

  function formatDateIt(value) {
    var date = value ? new Date(value) : null;
    if (!date || !Number.isFinite(date.getTime())) return "";
    try {
      return date.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return date.toISOString().slice(0, 10);
    }
  }

  var statusTimer = null;
  var fetchPayloadInFlight = null;
  var STATUS_AUTO_MS = 6000;

  function clearStatusTimer() {
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
  }

  function setStatus(text, isError, opts) {
    var node = byId("vc-reviews-status");
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

  function reviewCardMarkup(review) {
    var viewer = state.payload && state.payload.viewer;
    var tokenOk = Boolean(getToken());
    var canReply = Boolean(viewer && viewer.canReplyAsServer);
    var likeCount = Math.max(0, Math.round(Number(review.likeCount || 0)));
    var liked = Boolean(review.likedByViewer);
    var sr = review.serverReply && review.serverReply.content ? review.serverReply : null;
    var rid = esc(review.id);
    var viewerId = viewer && viewer.id ? String(viewer.id) : "";
    var reviewUserId = String(review.userId || "");
    var isOwn = Boolean(tokenOk && viewerId && reviewUserId && reviewUserId === viewerId);
    var out =
      '<article class="vc-reviews-card" id="vc-review-' +
      rid +
      '" data-review-id="' +
      rid +
      '">' +
      '<div class="vc-reviews-card__head">' +
      '<div class="vc-reviews-card__author">' +
      (review.authorAvatarUrl
        ? '<img class="vc-reviews-card__avatar" src="' +
          esc(review.authorAvatarUrl) +
          '" alt="" width="40" height="40" loading="eager" decoding="async" fetchpriority="high" referrerpolicy="no-referrer" data-vc-avatar="1"' +
          (review.userId ? ' data-user-id="' + esc(review.userId) + '"' : "") +
          " />"
        : '<span class="vc-reviews-card__avatar vc-reviews-card__avatar--fallback"><i class="fa fa-user"></i></span>') +
      '<div><strong>' +
      esc(review.authorName || "Utente") +
      "</strong>" +
      '<span>' +
      esc(formatDateIt(review.createdAt || review.updatedAt)) +
      "</span></div></div>" +
      '<div class="vc-reviews-card__head-meta">' +
      '<span class="vc-reviews-card__stars">' +
      starsMarkup(review.rating) +
      "</span>" +
      (isOwn
        ? '<div class="vc-reviews-card__own-actions">' +
          '<button type="button" class="vc-reviews-card__icon-btn" data-review-edit-open aria-label="' +
          esc(t("reviews.editBtn", "Modifica la tua recensione")) +
          '"><i class="fa fa-pencil" aria-hidden="true"></i></button>' +
          '<button type="button" class="vc-reviews-card__icon-btn vc-reviews-card__icon-btn--danger" data-review-delete="' +
          rid +
          '" aria-label="' +
          esc(t("reviews.deleteBtn", "Elimina la tua recensione")) +
          '"><i class="fa fa-trash-o" aria-hidden="true"></i></button>' +
          "</div>"
        : "") +
      "</div></div>" +
      '<p class="vc-reviews-card__text">' +
      esc(review.content) +
      "</p>";
    if (sr) {
      out +=
        '<div class="vc-reviews-card__reply">' +
        '<span class="vc-reviews-card__reply-label">' +
        esc(t("reviews.serverReply", "Risposta del server")) +
        "</span>" +
        '<p class="vc-reviews-card__reply-text">' +
        esc(sr.content) +
        "</p>" +
        (sr.updatedAt
          ? '<span class="vc-reviews-card__reply-meta">' + esc(formatDateIt(sr.updatedAt)) + "</span>"
          : "") +
        "</div>";
    }
    out +=
      '<div class="vc-reviews-card__foot">' +
      '<button type="button" class="vc-reviews-like' +
      (liked ? " is-liked" : "") +
      '" data-review-like="' +
      rid +
      '"' +
      (tokenOk ? "" : ' disabled title="' + esc(t("reviews.likeAria", "Accedi con Discord per mettere like")) + '"') +
      '><i class="fa ' +
      (liked ? "fa-heart" : "fa-heart-o") +
      '" aria-hidden="true"></i><span class="vc-reviews-like__n">' +
      esc(String(likeCount)) +
      "</span></button>";
    if (canReply) {
      out +=
        '<button type="button" class="vc-reviews-reply-toggle" data-review-reply-toggle="' +
        rid +
        '"><i class="fa fa-reply" aria-hidden="true"></i> ' +
        esc(t("reviews.reply", "Rispondi")) +
        "</button>";
    }
    out += "</div>";
    if (state.replyOpenId === review.id && canReply) {
      out +=
        '<div class="vc-reviews-reply-form">' +
        '<label class="vc-reviews-reply-form__label" for="vc-reviews-reply-' +
        rid +
        '">Messaggio ufficiale (visibile a tutti)</label>' +
        '<textarea id="vc-reviews-reply-' +
        rid +
        '" class="vc-reviews-textarea vc-reviews-reply-form__ta" rows="3" placeholder="Rispondi a nome del server...">' +
        esc(sr ? sr.content : "") +
        "</textarea>" +
        '<div class="vc-reviews-reply-form__actions"><button type="button" class="vc-reviews-submit" data-review-reply-submit="' +
        rid +
        '">' +
        esc(t("reviews.replyPublish", "Pubblica risposta")) +
        "</button></div></div>";
    }
    out += "</article>";
    return out;
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

  function reviewCreatedTs(review) {
    if (!review || typeof review !== "object") return 0;
    var created =
      dateValueMs(review.createdAt) ||
      dateValueMs(review.created_at) ||
      dateValueMs(review.creationDate) ||
      dateValueMs(review.submittedAt) ||
      dateValueMs(review.createdTimestamp);
    if (created > 0) return created;
    return mongoObjectIdToTimeMs(review.id);
  }

  function sortedReviewsNewestFirst(reviews) {
    var list = Array.isArray(reviews) ? reviews.slice() : [];
    list.sort(function (a, b) {
      var dt = reviewCreatedTs(b) - reviewCreatedTs(a);
      if (dt !== 0) return dt;
      return String(b && b.id ? b.id : "").localeCompare(String(a && a.id ? a.id : ""));
    });
    return list;
  }

  function extractDeepLinkReviewId() {
    try {
      var h = String(window.location.hash || "").trim();
      if (!h || h.indexOf("#vc-review-") !== 0) return "";
      var raw = h.slice("#vc-review-".length).trim();
      return /^[a-f0-9]{24}$/i.test(raw) ? raw : "";
    } catch (e) {
      return "";
    }
  }

  function ensurePageIncludesDeepLink(sortedReviews) {
    if (state.reviewsPager.userControlled) return;
    var reviewId = extractDeepLinkReviewId();
    if (!reviewId) return;
    var idx = -1;
    for (var i = 0; i < sortedReviews.length; i += 1) {
      if (String(sortedReviews[i] && sortedReviews[i].id || "") === reviewId) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    var perPage = Math.max(1, Number(state.reviewsPager.perPage || 8));
    state.reviewsPager.page = Math.floor(idx / perPage) + 1;
  }

  function getPagedReviews(sortedReviews) {
    var perPage = Math.max(1, Number(state.reviewsPager.perPage || 8));
    var total = sortedReviews.length;
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    var currentPage = Math.max(1, Math.min(totalPages, Number(state.reviewsPager.page || 1)));
    state.reviewsPager.page = currentPage;
    state.reviewsPager.totalPages = totalPages;
    var start = (currentPage - 1) * perPage;
    var end = start + perPage;
    return sortedReviews.slice(start, end);
  }

  function renderReviewsPager(totalItems) {
    var pager = byId("vc-reviews-pager");
    if (!pager) return;
    var perPage = Math.max(1, Number(state.reviewsPager.perPage || 8));
    var total = Math.max(0, Number(totalItems || 0));
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    var page = Math.max(1, Math.min(totalPages, Number(state.reviewsPager.page || 1)));
    state.reviewsPager.page = page;
    state.reviewsPager.totalPages = totalPages;
    if (!total || total <= perPage) {
      pager.innerHTML = "";
      pager.hidden = true;
      return;
    }
    var start = (page - 1) * perPage + 1;
    var end = Math.min(total, page * perPage);
    pager.hidden = false;
    pager.innerHTML =
      '<div class="vc-reviews-pager__bar" role="navigation" aria-label="Paginazione recensioni">' +
      '<button type="button" class="vc-reviews-pager__btn vc-reviews-submit vc-suggestions-btn-muted" data-reviews-page-prev' +
      (page <= 1 ? " disabled" : "") +
      ">Precedente</button>" +
      '<span class="vc-reviews-pager__meta vc-reviews-pager__meta--stats" aria-live="polite">' +
      esc(String(start)) +
      "–" +
      esc(String(end)) +
      " di " +
      esc(String(total)) +
      " · " +
      esc(String(page)) +
      "/" +
      esc(String(totalPages)) +
      "</span>" +
      '<button type="button" class="vc-reviews-pager__btn vc-reviews-submit vc-suggestions-btn-muted" data-reviews-page-next' +
      (page >= totalPages ? " disabled" : "") +
      ">Successiva</button>" +
      "</div>";
  }

  function renderReviewsPagerUserStyle(totalItems) {
    var pager = byId("vc-reviews-pager");
    if (!pager) return;
    var perPage = Math.max(1, Number(state.reviewsPager.perPage || 8));
    var total = Math.max(0, Number(totalItems || 0));
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    var page = Math.max(1, Math.min(totalPages, Number(state.reviewsPager.page || 1)));
    state.reviewsPager.page = page;
    state.reviewsPager.totalPages = totalPages;
    if (!total || total <= perPage) {
      pager.innerHTML = "";
      pager.hidden = true;
      return;
    }
    pager.hidden = false;
    var mp = window.__vcMiniPager;
    if (mp && typeof mp.fill === "function") {
      mp.fill(pager, page, totalPages, { aria: "Paginazione recensioni" }, {
        go: function (nextPage) {
          var cap = Math.max(1, Number(state.reviewsPager.totalPages) || 1);
          var next = Math.max(1, Math.min(cap, Number(nextPage) || 1));
          if (next === Number(state.reviewsPager.page || 1)) return;
          state.reviewsPager.userControlled = true;
          state.reviewsPager.page = next;
          render();
          var list = byId("vc-reviews-server-list");
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
      '<button type="button" class="vc-reviews-pager__btn vc-notify-home-btn" data-reviews-page-prev' +
      (page <= 1 ? " disabled" : "") +
      ">Precedente</button>" +
      '<span class="vc-reviews-pager__meta vc-reviews-pager__meta--stats vc-notify-filter-btn vc-notify-filter-btn--on" aria-live="polite">' +
      "Pagina " +
      esc(String(page)) +
      " di " +
      esc(String(totalPages)) +
      "</span>" +
      '<button type="button" class="vc-reviews-pager__btn vc-notify-home-btn" data-reviews-page-next' +
      (page >= totalPages ? " disabled" : "") +
      ">Successiva</button>";
  }

  function emptyMarkup(icon, title, text) {
    return (
      '<article class="vc-reviews-empty">' +
      '<span class="vc-reviews-empty__icon"><i class="fa ' + esc(icon) + '" aria-hidden="true"></i></span>' +
      "<strong>" + esc(title) + "</strong>" +
      "<p>" + esc(text) + "</p>" +
      "</article>"
    );
  }

  function ratingInputMarkup(kind, rating) {
    var out = '<div class="vc-reviews-rating" data-review-rating="' + esc(kind) + '">';
    for (var i = 1; i <= 5; i += 1) {
      out +=
        '<button type="button" class="vc-reviews-rating__btn' +
        (i <= rating ? " is-active" : "") +
        '" data-review-set-rating="' +
        esc(kind) +
        '" data-rating-value="' +
        esc(String(i)) +
        '">' +
        '<i class="fa ' +
        (i <= rating ? "fa-star" : "fa-star-o") +
        '" aria-hidden="true"></i><span>' +
        esc(String(i)) +
        "</span></button>";
    }
    return out + "</div>";
  }

  function syncDraftFromPayload() {
    var viewer = state.payload && state.payload.viewer;
    var own = viewerOwnReview(viewer);
    if (own) {
      state.draft.server.rating = Math.max(1, Math.min(5, Math.round(Number(own.rating) || 5)));
      state.draft.server.content = String(own.content || "");
      state.draftLang = normalizeLang(own.contentLang || currentSiteLang());
    } else {
      state.draftLang = currentSiteLang();
    }
  }

  function ensureReviewModalRoot() {
    var root = byId("vc-reviews-edit-modal");
    if (!root) {
      root = document.createElement("div");
      root.id = "vc-reviews-edit-modal";
      document.body.appendChild(root);
    }
    return root;
  }

  function reviewFormModalInnerMarkup(isUpdate) {
    var title = isUpdate
      ? t("reviews.editTitle", "Modifica la tua recensione")
      : t("reviews.writeTitle", "Scrivi una recensione");
    var submitLabel = isUpdate
      ? t("reviews.update", "Aggiorna recensione")
      : t("reviews.submit", "Invia recensione");
    var placeholder = isBotReviewsPage()
      ? t("botReviews.placeholder", "Cosa ti piace di Vinili: musica, partnership, strumenti…")
      : t("reviews.placeholder", "Scrivi cosa ti piace del server, dell'ambiente o delle attività...");
    return (
      '<div class="vc-reviews-modal__backdrop" data-review-modal-dismiss tabindex="-1"></div>' +
      '<div class="vc-reviews-modal__panel" role="dialog" aria-modal="true" aria-labelledby="vc-reviews-modal-title">' +
      '<div class="vc-reviews-modal__toolbar">' +
      '<h2 id="vc-reviews-modal-title" class="vc-reviews-modal__title">' +
      esc(title) +
      "</h2>" +
      '<button type="button" class="vc-reviews-modal__close" data-review-modal-dismiss aria-label="Chiudi"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-reviews-modal__body">' +
      '<div class="vc-reviews-field"><label>Valutazione</label>' +
      ratingInputMarkup("server", state.draft.server.rating) +
      "</div>" +
      '<div class="vc-reviews-field"><label for="vc-review-modal-content">Recensione</label><textarea id="vc-review-modal-content" class="vc-reviews-textarea" rows="5" placeholder="' +
      esc(placeholder) +
      '">' +
      esc(state.draft.server.content) +
      "</textarea></div>" +
      '<div class="vc-reviews-formcard__actions">' +
      '<button type="button" class="vc-reviews-submit" data-review-submit="server">' +
      esc(submitLabel) +
      "</button>" +
      "</div></div></div>"
    );
  }

  function syncReviewFormModal() {
    var root = ensureReviewModalRoot();
    if (!state.editModalOpen) {
      root.innerHTML = "";
      root.className = "vc-reviews-modal";
      root.hidden = true;
      try {
        document.documentElement.classList.remove("vc-reviews-modal-open");
      } catch (e0) {}
      return;
    }
    var viewer = state.payload && state.payload.viewer;
    var serverExisting = viewerOwnReview(viewer);
    root.hidden = false;
    root.innerHTML = reviewFormModalInnerMarkup(Boolean(serverExisting));
    root.className = "vc-reviews-modal vc-reviews-modal--open";
    try {
      document.documentElement.classList.add("vc-reviews-modal-open");
    } catch (e1) {}
  }

  function openReviewFormModal() {
    var token = getToken();
    var viewer = state.payload && state.payload.viewer;
    if (!token || !viewer || !viewer.id) {
      setStatus(t("reviews.loginToWrite", "Devi effettuare il login con Discord per scrivere una recensione."), true);
      var lb = byId("discord-login-btn");
      if (lb) {
        try {
          lb.focus();
        } catch (e2) {}
      }
      return;
    }
    var serverExisting = viewerOwnReview(viewer);
    if (serverExisting) {
      syncDraftFromPayload();
    } else {
      state.draft.server.rating = 5;
      state.draft.server.content = "";
      state.draftLang = currentSiteLang();
      if (window.VcFormDrafts) {
        var saved = window.VcFormDrafts.load("reviews:" + pageKind());
        if (saved && typeof saved === "object") {
          if (typeof saved.content === "string") state.draft.server.content = saved.content;
          if (saved.rating != null) state.draft.server.rating = Math.max(1, Math.min(5, Math.round(Number(saved.rating) || 5)));
        }
      }
    }
    state.editModalOpen = true;
    render();
    var ta = byId("vc-review-modal-content");
    if (ta) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          try {
            ta.focus();
          } catch (e3) {}
        });
      });
    }
  }

  function syncReviewHeadButton() {
    var btn = byId("vc-reviews-open-form-btn");
    if (!btn) return;
    var viewer = state.payload && state.payload.viewer;
    var tokenOk = Boolean(getToken());
    var isLogged = Boolean(viewer && viewer.id);
    var serverExisting = viewerOwnReview(viewer);
    btn.hidden = false;
    if (!isLogged || !tokenOk) {
      btn.textContent = t("reviews.write", "Scrivi recensione");
      btn.setAttribute("aria-label", t("reviews.writeAriaLogin", "Accedi con Discord per scrivere una recensione"));
    } else if (serverExisting) {
      btn.textContent = t("reviews.edit", "Modifica recensione");
      btn.setAttribute("aria-label", t("reviews.editBtn", "Modifica la tua recensione"));
    } else {
      btn.textContent = t("reviews.write", "Scrivi recensione");
      btn.setAttribute("aria-label", t("reviews.writeAriaNew", "Scrivi una nuova recensione"));
    }
    btn.onclick = function () {
      openReviewFormModal();
    };
  }

  function applyReviewDeepLink() {
    try {
      var h = String(window.location.hash || "").trim();
      if (!h || h.indexOf("#vc-review-") !== 0) return;
      var raw = h.slice("#vc-review-".length).trim();
      if (!raw || !/^[a-f0-9]{24}$/i.test(raw)) return;
      if (state.deepLinkAppliedId === raw) return;
      var el = document.getElementById("vc-review-" + raw);
      if (!el) return;
      state.deepLinkAppliedId = raw;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("vc-deep-link-flash");
      window.setTimeout(function () {
        try {
          el.classList.remove("vc-deep-link-flash");
        } catch (e0) {}
      }, 2200);
      try {
        if (window.history && typeof window.history.replaceState === "function") {
          window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
        }
      } catch (e2) {}
    } catch (e1) {}
  }

  function syncLangFilterFromSite() {
    if (!isBotReviewsPage()) return;
    var next = currentSiteLang();
    if (normalizeLang(state.langFilter) === next) return;
    state.langFilter = next;
    state.draftLang = next;
    state.reviewsPager.page = 1;
    state.reviewsPager.userControlled = false;
  }

  function render() {
    var payload = state.payload || { reviews: { server: [], staff: [], bot: [] }, staffers: [], viewer: null };
    var serverWrap = byId("vc-reviews-server-list");
    if (!serverWrap) return;

    if (isBotReviewsPage()) {
      state.langFilter = currentSiteLang();
    }

    var listKey = isBotReviewsPage() ? "bot" : "server";
    var allReviews = Array.isArray(payload.reviews && payload.reviews[listKey]) ? payload.reviews[listKey] : [];
    if (isBotReviewsPage()) {
      var want = normalizeLang(state.langFilter || currentSiteLang());
      allReviews = allReviews.filter(function (row) {
        return normalizeLang(row && row.contentLang) === want;
      });
    }
    var orderedReviews = sortedReviewsNewestFirst(allReviews);
    ensurePageIncludesDeepLink(orderedReviews);
    var pageReviews = getPagedReviews(orderedReviews);
    serverWrap.innerHTML = orderedReviews.length
      ? pageReviews.map(function (review) { return reviewCardMarkup(review); }).join("")
      : emptyMarkup(
          "fa-commenting-o",
          t("reviews.empty", "Ancora nessuna recensione"),
          isBotReviewsPage()
            ? t("botReviews.emptyHint", "Scrivi la prima recensione su Vinili.")
            : t("reviews.emptyHint", "Sarai tu a inaugurare questa sezione."),
        );
    state.renderFingerprint = reviewsPayloadFingerprint(state.payload || payload);
    renderReviewsPagerUserStyle(orderedReviews.length);
    syncReviewFormModal();
    syncReviewHeadButton();
    bind();
    window.requestAnimationFrame(function () {
      applyReviewDeepLink();
    });
  }

  var reviewsPagerClickBound = false;

  function bindReviewsPagerOnce() {
    if (reviewsPagerClickBound) return;
    var pager = byId("vc-reviews-pager");
    if (!pager) return;
    reviewsPagerClickBound = true;
    pager.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-reviews-page-prev],[data-reviews-page-next]") : null;
      if (!btn || btn.disabled) return;
      state.reviewsPager.userControlled = true;
      if (btn.hasAttribute("data-reviews-page-prev")) {
        state.reviewsPager.page = Math.max(1, Number(state.reviewsPager.page || 1) - 1);
      } else {
        state.reviewsPager.page = Math.min(
          Math.max(1, Number(state.reviewsPager.totalPages || 1)),
          Number(state.reviewsPager.page || 1) + 1,
        );
      }
      render();
      var list = byId("vc-reviews-server-list");
      if (list && typeof list.scrollIntoView === "function") {
        window.requestAnimationFrame(function () {
          try {
            list.scrollIntoView({ behavior: "smooth", block: "start" });
          } catch (eScroll) {}
        });
      }
    });
  }

  var _delegationBound = false;
  function bind() {
    var taModal = byId("vc-review-modal-content");
    if (taModal && !taModal._vcBound) {
      taModal._vcBound = true;
      taModal.addEventListener("input", function () {
        state.draft.server.content = taModal.value;
        if (window.VcFormDrafts) {
          window.VcFormDrafts.save("reviews:" + pageKind(), {
            content: String(taModal.value || ""),
            rating: Number(state.draft.server.rating) || 5,
          });
        }
      });
    }
    if (_delegationBound) return;
    _delegationBound = true;
    document.addEventListener("click", function (ev) {
      var el = ev.target;
      if (!el || typeof el.closest !== "function") return;
      var dismiss = el.closest("[data-review-modal-dismiss]");
      if (dismiss) { state.editModalOpen = false; render(); return; }
      var editOpen = el.closest("[data-review-edit-open]");
      if (editOpen) {
        syncDraftFromPayload(); state.editModalOpen = true; render();
        var ta = byId("vc-review-modal-content");
        if (ta) { window.requestAnimationFrame(function () { window.requestAnimationFrame(function () { try { ta.focus(); } catch (e) {} }); }); }
        return;
      }
      var rating = el.closest("[data-review-set-rating]");
      if (rating) {
        var value = Math.max(1, Math.min(5, Math.round(Number(rating.getAttribute("data-rating-value") || 0) || 0)));
        state.draft.server.rating = value; render(); return;
      }
      var submit = el.closest("[data-review-submit]");
      if (submit) { submitReview(); return; }
      var del = el.closest("[data-review-delete]");
      if (del) {
        var delId = String(del.getAttribute("data-review-delete") || "").trim();
        if (delId) deleteReview(delId);
        return;
      }
      var like = el.closest("[data-review-like]");
      if (like) {
        if (like.disabled) return;
        var likeId = String(like.getAttribute("data-review-like") || "").trim();
        if (likeId) toggleReviewLike(likeId, like);
        return;
      }
      var replyToggle = el.closest("[data-review-reply-toggle]");
      if (replyToggle) {
        var rtId = String(replyToggle.getAttribute("data-review-reply-toggle") || "").trim();
        if (rtId) { state.replyOpenId = state.replyOpenId === rtId ? null : rtId; render(); }
        return;
      }
      var replySub = el.closest("[data-review-reply-submit]");
      if (replySub) {
        var rsId = String(replySub.getAttribute("data-review-reply-submit") || "").trim();
        if (rsId) submitServerReply(rsId, replySub);
        return;
      }
    });
  }

  function authHeaders() {
    var token = getToken();
    return token ? { Authorization: "Bearer " + token } : {};
  }

  function parseJsonResponse(response) {
    return response.text().then(function (text) {
      var raw = String(text || "").trim();
      if (!raw) {
        throw new Error(
          t("reviews.apiUnavailable", "Servizio temporaneamente non disponibile. Riprova tra poco.")
        );
      }
      try {
        return JSON.parse(raw);
      } catch (e) {
        throw new Error(
          t("reviews.apiUnavailable", "Servizio temporaneamente non disponibile. Riprova tra poco.")
        );
      }
    });
  }

  function reviewsCacheKey() {
    var url = apiUrl();
    if (window.VcApiCache && typeof window.VcApiCache.keyFor === "function") {
      return window.VcApiCache.keyFor(url, {
        scope: "reviews",
        auth: getToken(),
        v: "authorNick2",
      });
    }
    return "reviewsAuthorNick1:" + pageKind();
  }

  function fetchPayload() {
    if (fetchPayloadInFlight) return fetchPayloadInFlight;

    setStatus("", false);
    var url = apiUrl();
    var cacheKey = reviewsCacheKey();
    var loadError = t("reviews.loadError", "Impossibile caricare le recensioni.");

    function applyBody(body) {
      if (!body || body.ok !== true) throw new Error((body && body.message) || loadError);
      state.payload = body;
      syncDraftFromPayload();
      render();
      setStatus("", false);
      var wsr = state.reviewsWs ? state.reviewsWs.readyState : 3;
      if (wsr !== 0 && wsr !== 1) {
        connectReviewsWebSocket();
      }
    }

    function finishFetch(promise) {
      fetchPayloadInFlight = promise.finally(function () {
        if (fetchPayloadInFlight === promise) fetchPayloadInFlight = null;
      });
      return fetchPayloadInFlight;
    }

    if (window.VcApiCache) {
      return finishFetch(
        window.VcApiCache.fetchWithCache(cacheKey, url, {
          ttlMs: 60000,
          staleMs: 120000,
          persistMs: 15 * 60 * 1000,
          timeoutMs: 24000,
          fetchInit: { method: "GET", headers: authHeaders(), cache: "no-store" },
          onStale: function (cached) {
            if (cached && cached.body && cached.body.ok === true) {
              try {
                applyBody(cached.body);
              } catch (eSt) {}
            }
          },
        })
          .then(function (out) {
            if (!out || !out.body || out.body.ok !== true) {
              if (state.payload) return state.payload;
              throw new Error(loadError);
            }
            applyBody(out.body);
            return out.body;
          })
          .catch(function (err) {
            if (state.payload) {
              setStatus("", false);
              return state.payload;
            }
            setStatus(err && err.message ? err.message : loadError, true);
          }),
      );
    }

    return finishFetch(
      fetch(url, {
        method: "GET",
        headers: authHeaders(),
        cache: "no-store",
      })
        .then(parseJsonResponse)
        .then(function (body) {
          applyBody(body);
          return body;
        })
        .catch(function (err) {
          if (state.payload) {
            setStatus("", false);
            return state.payload;
          }
          setStatus(err && err.message ? err.message : loadError, true);
        }),
    );
  }

  function submitReview() {
    var token = getToken();
    if (!token) {
      setStatus(t("reviews.loginToSubmit", "Devi effettuare il login con Discord per inviare una recensione."), true);
      return;
    }
    var payload = {
      kind: pageKind(),
      rating: state.draft.server.rating,
      content: state.draft.server.content,
    };
    payload.contentLang = currentSiteLang();
    if (isBotReviewsPage()) {
      state.draftLang = payload.contentLang;
    }
    setStatus(t("reviews.submitting", "Invio recensione in corso..."), false);
    fetch(apiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(payload),
    })
      .then(parseJsonResponse)
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || t("reviews.saveError", "Errore durante il salvataggio."));
        }
        state.editModalOpen = false;
        if (window.VcFormDrafts) window.VcFormDrafts.clear("reviews:" + pageKind());
        if (window.VcApiCache) window.VcApiCache.invalidate(reviewsCacheKey());
        setStatus(body.message || t("reviews.saved", "Recensione salvata."), false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : t("reviews.saveError", "Errore durante il salvataggio."), true);
      });
  }

  function toggleReviewLike(reviewId, buttonEl) {
    var token = getToken();
    if (!token) {
      setStatus(t("reviews.loginToLike", "Accedi con Discord per mettere like."), true);
      return;
    }
    if (buttonEl) buttonEl.disabled = true;
    setStatus("", false);
    fetch(reviewActionUrl(reviewId, "like"), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
    })
      .then(parseJsonResponse)
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || t("reviews.likeError", "Errore like."));
        }
        setStatus(body.message || "Ok.", false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : t("reviews.likeError", "Errore like."), true);
      })
      .then(function () {
        if (buttonEl) buttonEl.disabled = false;
      });
  }

  function submitServerReply(reviewId, buttonEl) {
    var token = getToken();
    if (!token) {
      setStatus("Sessione Discord richiesta.", true);
      return;
    }
    var ta = byId("vc-reviews-reply-" + reviewId);
    var content = ta ? String(ta.value || "").trim() : "";
    if (content.length < 8) {
      setStatus("La risposta deve avere almeno 8 caratteri.", true);
      return;
    }
    if (buttonEl) buttonEl.disabled = true;
    setStatus("Pubblicazione risposta...", false);
    fetch(reviewActionUrl(reviewId, "server-reply"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ content: content }),
    })
      .then(parseJsonResponse)
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || t("reviews.replyError", "Errore risposta."));
        }
        state.replyOpenId = null;
        setStatus(body.message || "Risposta pubblicata.", false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : t("reviews.replyError", "Errore risposta."), true);
      })
      .then(function () {
        if (buttonEl) buttonEl.disabled = false;
      });
  }

  function deleteReview(reviewId) {
    var token = getToken();
    if (!token) {
      setStatus(t("reviews.loginToDelete", "Devi effettuare il login con Discord per eliminare una recensione."), true);
      return;
    }
    var run = function () {
      state.editModalOpen = false;
      setStatus(t("reviews.deleting", "Eliminazione recensione in corso..."), false);
      fetch(reviewActionUrl(reviewId), {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + token,
        },
      })
        .then(parseJsonResponse)
        .then(function (body) {
          if (!body || body.ok !== true) {
            throw new Error((body && body.message) || t("reviews.deleteError", "Errore durante l'eliminazione."));
          }
          setStatus(body.message || t("reviews.deleted", "Recensione eliminata."), false);
          return fetchPayload();
        })
        .catch(function (err) {
          setStatus(err && err.message ? err.message : t("reviews.deleteError", "Errore durante l'eliminazione."), true);
        });
    };
    var confirmP = window.VcDialog
      ? window.VcDialog.confirm({
          title: t("reviews.confirmDeleteTitle", "Eliminare la recensione?"),
          message: t("reviews.confirmDelete", "Vuoi davvero eliminare la tua recensione?"),
          confirmLabel: t("reviews.delete", "Elimina"),
          cancelLabel: t("reviews.cancel", "Annulla"),
          danger: true,
          icon: "fa-trash-o",
        })
      : Promise.resolve(window.confirm(t("reviews.confirmDelete", "Vuoi davvero eliminare la tua recensione?")));
    confirmP.then(function (ok) {
      if (ok) run();
    });
  }

  function main() {
    wireGateLoginCta();
    bindReviewsPagerOnce();
    if (isBotReviewsPage()) {
      state.langFilter = currentSiteLang();
      state.draftLang = currentSiteLang();
    }
    if (shouldUnlockReviewsPage() || getToken()) {
      hideReviewsGate();
      fetchPayload();
      return;
    }
    showReviewsLoginGate();
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var u = ev && ev.detail ? ev.detail.user : null;
    if (u) {
      hideReviewsGate();
      fetchPayload();
      return;
    }
    clearReviewsContent();
    showReviewsLoginGate();
  });

  document.addEventListener("vc:langchange", function () {
    if (!isBotReviewsPage()) return;
    syncLangFilterFromSite();
    if (state.payload) render();
  });

  document.addEventListener("keydown", function (ev) {
    if (!state.editModalOpen) return;
    if (ev.key !== "Escape") return;
    state.editModalOpen = false;
    render();
  });

  window.addEventListener("beforeunload", disconnectReviewsWebSocket);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && state.payload) {
      void refreshReviewsPayloadQuiet();
    }
  });

  window.addEventListener("hashchange", function () {
    if (byId("vc-reviews-server-list")) {
      state.reviewsPager.userControlled = false;
      window.requestAnimationFrame(function () {
        if (state.payload) render();
        applyReviewDeepLink();
      });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();