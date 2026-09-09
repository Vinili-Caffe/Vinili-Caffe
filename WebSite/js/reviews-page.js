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
    filterStars: 0, /* reviewsFilters1: 0 = tutte, 1–5 */
    sortBy: "newest", /* newest | oldest | rating_desc | rating_asc */
    reviewsPager: {
      page: 1,
      perPage: 9,
      totalPages: 1,
      userControlled: false,
    },
    carouselIndex: 0,
    carouselBound: false,
    carouselTouchX: null,
    stageKey: "",
    stageSlideTimer: null,
    stageForceMotion: false,
    draft: {
      server: { rating: 5, content: "" },
    },
  };

  var REVIEW_SORT_OPTIONS = [
    { id: "newest", label: "Più recenti" },
    { id: "oldest", label: "Meno recenti" },
    { id: "rating_desc", label: "Più stelle" },
    { id: "rating_asc", label: "Meno stelle" },
  ];

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

  function coffeeAvatarFallbackUrl() {
    /* reviewsAvatarSilhouette1: site silhouette — never Discord embed / broken img flash */
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        return window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eCoffee) {}
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="vcRvAv" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#vcRvAv)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function isDiscordDefaultAvatarUrl(url) {
    return /cdn\.discordapp\.com\/embed\/avatars\//i.test(String(url || ""));
  }

  function isCoffeeAvatarUrl(url) {
    var u = String(url || "").trim();
    return !u || /^data:image\/svg\+xml/i.test(u);
  }

  function normalizeReviewAvatarCdn(url, size, userId) {
    var src = String(url || "").trim();
    var uid = String(userId || "").trim();
    if (isDiscordDefaultAvatarUrl(src) || isCoffeeAvatarUrl(src)) return "";
    var hash = "";
    var guildId = "";
    try {
      var guildMatch = src.match(/\/guilds\/(\d+)\/users\/(\d+)\/avatars\/((?:a_)?[a-f0-9]+)/i);
      if (guildMatch) {
        guildId = String(guildMatch[1] || "").trim();
        uid = uid || String(guildMatch[2] || "").trim();
        hash = String(guildMatch[3] || "").trim();
      } else {
        var userMatch = src.match(/\/avatars\/(\d+)\/((?:a_)?[a-f0-9]+)/i);
        if (userMatch) {
          uid = uid || String(userMatch[1] || "").trim();
          hash = String(userMatch[2] || "").trim();
        }
      }
    } catch (eParse) {}
    var sz = Math.max(16, Number(size) || 40);
    var rebuilt = "";
    try {
      if (window.VcDiscordAvatar) {
        if (guildId && uid && hash && typeof window.VcDiscordAvatar.buildGuildFromParts === "function") {
          rebuilt = window.VcDiscordAvatar.buildGuildFromParts(guildId, uid, hash, sz) || "";
        } else if (uid && hash && typeof window.VcDiscordAvatar.buildFromParts === "function") {
          rebuilt = window.VcDiscordAvatar.buildFromParts(uid, hash, sz) || "";
        }
        if (rebuilt && typeof window.VcDiscordAvatar.preferStaticUrl === "function") {
          rebuilt = window.VcDiscordAvatar.preferStaticUrl(rebuilt, sz) || rebuilt;
        }
      }
    } catch (eBuild) {}
    if (!rebuilt && uid && hash) {
      rebuilt = "https://cdn.discordapp.com/avatars/" + uid + "/" + hash + ".png?size=" + sz;
    }
    if (!rebuilt && src && /^https:\/\/cdn\.discordapp\.com\/(?:avatars|guilds)\//i.test(src) && !isDiscordDefaultAvatarUrl(src)) {
      rebuilt = src.replace(/\.(gif|webp|jpe?g)(\?|#|$)/i, ".png$2");
    }
    if (!rebuilt || isDiscordDefaultAvatarUrl(rebuilt)) return "";
    return rebuilt;
  }

  function reviewAvatarHtml(url, userId) {
    var coffee = coffeeAvatarFallbackUrl();
    var cdn = normalizeReviewAvatarCdn(url, 40, userId);
    var uid = String(userId || "").trim();
    /* Always paint silhouette first; hydrate CDN only after successful preload (no broken flash). */
    return (
      '<img class="vc-reviews-card__avatar vc-avatar vc-avatar--ready vc-avatar-fallback-img" src="' +
      esc(coffee) +
      '" alt="" width="40" height="40" loading="eager" decoding="async" fetchpriority="high" referrerpolicy="no-referrer" data-vc-avatar="1" data-vc-avatar-static="1" data-vc-avatar-fallback="1" data-vc-reviews-avatar="1"' +
      (uid ? ' data-user-id="' + esc(uid) + '"' : "") +
      (cdn ? ' data-vc-avatar-cdn-url="' + esc(cdn) + '"' : "") +
      " />"
    );
  }

  function paintReviewCoffeeAvatar(img) {
    if (!img || img.tagName !== "IMG") return;
    var coffee = coffeeAvatarFallbackUrl();
    try {
      img.removeAttribute("srcset");
      img.removeAttribute("data-vc-avatar-cdn-url");
      if (String(img.getAttribute("src") || "") !== coffee) {
        img.src = coffee;
        img.setAttribute("src", coffee);
      }
      img.classList.add("vc-avatar", "vc-avatar--ready", "vc-avatar-fallback-img");
      img.classList.remove("vc-avatar--pending");
      img.setAttribute("data-vc-avatar-fallback", "1");
      img.dataset.vcAvatarOk = "1";
      img.dataset.vcAvatarFallbackFinal = "1";
    } catch (ePaint) {}
  }

  function hydrateReviewAvatar(img) {
    if (!img || img.tagName !== "IMG") return;
    if (img.getAttribute("data-vc-reviews-avatar") !== "1") return;
    if (img.dataset.vcReviewsAvatarHydrated === "1") return;
    var cdn = String(img.getAttribute("data-vc-avatar-cdn-url") || "").trim();
    if (!cdn || isDiscordDefaultAvatarUrl(cdn) || isCoffeeAvatarUrl(cdn)) {
      img.dataset.vcReviewsAvatarHydrated = "1";
      paintReviewCoffeeAvatar(img);
      return;
    }
    img.dataset.vcReviewsAvatarHydrated = "1";
    var probe = new Image();
    probe.decoding = "async";
    probe.onload = function () {
      try {
        if (!img.isConnected) return;
        img.removeAttribute("data-vc-avatar-fallback");
        img.src = cdn;
        img.setAttribute("src", cdn);
        img.classList.add("vc-avatar", "vc-avatar--ready");
        img.classList.remove("vc-avatar--pending", "vc-avatar-fallback-img");
        img.dataset.vcAvatarOk = "1";
        delete img.dataset.vcAvatarFallbackFinal;
      } catch (eOk) {}
    };
    probe.onerror = function () {
      paintReviewCoffeeAvatar(img);
    };
    try {
      probe.referrerPolicy = "no-referrer";
    } catch (eRef) {}
    probe.src = cdn;
  }

  function scanReviewAvatars(root) {
    var base = root && root.querySelectorAll ? root : document;
    try {
      var imgs = base.querySelectorAll
        ? base.querySelectorAll("img[data-vc-reviews-avatar], .vc-reviews-card__avatar[data-vc-avatar]")
        : [];
      for (var i = 0; i < imgs.length; i += 1) {
        var img = imgs[i];
        var cur = String(img.getAttribute("src") || img.src || "").trim();
        if (isDiscordDefaultAvatarUrl(cur)) paintReviewCoffeeAvatar(img);
        hydrateReviewAvatar(img);
      }
    } catch (eScan) {}
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
      reviewAvatarHtml(review.authorAvatarUrl, review.userId) +
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

  function reviewRatingValue(review) {
    return Math.max(0, Math.min(5, Math.round(Number(review && review.rating) || 0)));
  }

  function normalizeReviewSort(value) {
    var s = String(value || "").trim().toLowerCase();
    if (s === "oldest" || s === "rating_desc" || s === "rating_asc") return s;
    return "newest";
  }

  function sortedReviewsNewestFirst(reviews) {
    return sortReviewsList(reviews, "newest");
  }

  function sortReviewsList(reviews, sortBy) {
    var mode = normalizeReviewSort(sortBy || state.sortBy);
    var list = Array.isArray(reviews) ? reviews.slice() : [];
    list.sort(function (a, b) {
      if (mode === "oldest") {
        var dto = reviewCreatedTs(a) - reviewCreatedTs(b);
        if (dto !== 0) return dto;
      } else if (mode === "rating_desc") {
        var rd = reviewRatingValue(b) - reviewRatingValue(a);
        if (rd !== 0) return rd;
        var dtn = reviewCreatedTs(b) - reviewCreatedTs(a);
        if (dtn !== 0) return dtn;
      } else if (mode === "rating_asc") {
        var ra = reviewRatingValue(a) - reviewRatingValue(b);
        if (ra !== 0) return ra;
        var dta = reviewCreatedTs(b) - reviewCreatedTs(a);
        if (dta !== 0) return dta;
      } else {
        var dt = reviewCreatedTs(b) - reviewCreatedTs(a);
        if (dt !== 0) return dt;
      }
      return String(b && b.id ? b.id : "").localeCompare(String(a && a.id ? a.id : ""));
    });
    return list;
  }

  function hasActiveReviewsFilters() {
    return Number(state.filterStars || 0) >= 1 || normalizeReviewSort(state.sortBy) !== "newest";
  }

  function ensureReviewsFiltersBar() {
    var host = byId("vc-reviews-sections-row");
    var section = host && host.querySelector ? host.querySelector(".vc-reviews-section--split") : null;
    var stage = byId("vc-reviews-stage");
    var bar = byId("vc-reviews-filters");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "vc-reviews-filters";
      bar.className = "vc-feedback-filters vc-reviews-filters";
      bar.setAttribute("aria-label", "Filtri recensioni");
      if (section && stage && stage.parentNode === section) {
        section.insertBefore(bar, stage);
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
        var clearBtn = tEl.closest("[data-reviews-filter-clear]");
        if (clearBtn && bar.contains(clearBtn)) {
          state.filterStars = 0;
          state.sortBy = "newest";
          state.carouselIndex = 0;
          state.reviewsPager.page = 1;
          state.reviewsPager.userControlled = false;
          state.stageKey = "";
          syncReviewsFiltersBar();
          render();
          return;
        }
        var chip = tEl.closest("[data-reviews-filter]");
        if (!chip || !bar.contains(chip) || chip.disabled) return;
        var dim = String(chip.getAttribute("data-reviews-filter") || "");
        var val = String(chip.getAttribute("data-reviews-filter-value") || "");
        if (dim === "stars") {
          var stars = Math.max(1, Math.min(5, Math.round(Number(val) || 0)));
          state.filterStars = state.filterStars === stars ? 0 : stars;
        } else if (dim === "sort") {
          var nextSort = normalizeReviewSort(val);
          state.sortBy = state.sortBy === nextSort ? "newest" : nextSort;
        } else {
          return;
        }
        state.carouselIndex = 0;
        state.reviewsPager.page = 1;
        state.reviewsPager.userControlled = false;
        state.stageKey = "";
        syncReviewsFiltersBar();
        render();
      });
    }
    syncReviewsFiltersBar();
  }

  function syncReviewsFiltersBar() {
    /* reviewsCtaAlign1: __main + __rows + toolbar CTA (mirror feedbackSort1) */
    var bar = byId("vc-reviews-filters");
    if (!bar) return;
    var starChips = "";
    for (var s = 1; s <= 5; s += 1) {
      var onStar = Number(state.filterStars || 0) === s;
      starChips +=
        '<button type="button" class="vc-feedback-filter-chip' +
        (onStar ? " is-active" : "") +
        '" data-reviews-filter="stars" data-reviews-filter-value="' +
        s +
        '" aria-pressed="' +
        (onStar ? "true" : "false") +
        '"><i class="fa fa-star" aria-hidden="true"></i> ' +
        s +
        "</button>";
    }
    var sortChips = REVIEW_SORT_OPTIONS.map(function (row) {
      var on = normalizeReviewSort(state.sortBy) === row.id;
      return (
        '<button type="button" class="vc-feedback-filter-chip' +
        (on ? " is-active" : "") +
        '" data-reviews-filter="sort" data-reviews-filter-value="' +
        esc(row.id) +
        '" aria-pressed="' +
        (on ? "true" : "false") +
        '">' +
        esc(row.label) +
        "</button>"
      );
    }).join("");
    /* azzeraFix1: dedicated clear row under filter chips (no margin-left:auto float) */
    var clearRow = hasActiveReviewsFilters()
      ? '<div class="vc-feedback-filters__row vc-feedback-filters__row--clear">' +
        '<span class="vc-feedback-filters__label" aria-hidden="true"></span>' +
        '<div class="vc-feedback-filters__chips">' +
        '<button type="button" class="vc-feedback-filter-clear" data-reviews-filter-clear="1">' +
        '<i class="fa fa-times" aria-hidden="true"></i> Azzera</button>' +
        "</div></div>"
      : "";
    var viewer = state.payload && state.payload.viewer;
    var tokenOk = Boolean(getToken());
    var isLogged = Boolean(viewer && viewer.id);
    var serverExisting = viewerOwnReview(viewer);
    var ctaLabel =
      isLogged && tokenOk && serverExisting
        ? t("reviews.edit", "Modifica recensione")
        : t("reviews.write", "Scrivi recensione");
    /* reviewsCtaAlign1: same __main + __rows + __toolbar as feedbackSort1 */
    bar.innerHTML =
      '<div class="vc-feedback-filters__main">' +
      '<div class="vc-feedback-filters__rows">' +
      '<div class="vc-feedback-filters__row">' +
      '<span class="vc-feedback-filters__label">Stelle</span>' +
      '<div class="vc-feedback-filters__chips" role="group" aria-label="Stelle">' +
      starChips +
      "</div></div>" +
      '<div class="vc-feedback-filters__row">' +
      '<span class="vc-feedback-filters__label">Ordine</span>' +
      '<div class="vc-feedback-filters__chips" role="group" aria-label="Ordine">' +
      sortChips +
      "</div></div>" +
      clearRow +
      "</div>" +
      '<div class="vc-feedback-filters__toolbar">' +
      '<button type="button" id="vc-reviews-open-form-btn" class="vc-reviews-head-cta vc-feedback-filters__cta">' +
      '<i class="fa fa-pencil" aria-hidden="true"></i><span>' +
      esc(ctaLabel) +
      "</span></button>" +
      "</div>" +
      "</div>";
    syncReviewHeadButton();
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
    state.carouselIndex = idx;
    state.reviewsPager.userControlled = true;
  }

  function wrapCarouselIndex(i, n) {
    var len = Math.max(0, Number(n) || 0);
    if (len <= 0) return 0;
    return ((Number(i) || 0) % len + len) % len;
  }

  function currentOrderedReviews() {
    var payload = state.payload || { reviews: { server: [], staff: [], bot: [] } };
    var listKey = isBotReviewsPage() ? "bot" : "server";
    var allReviews = Array.isArray(payload.reviews && payload.reviews[listKey]) ? payload.reviews[listKey] : [];
    if (isBotReviewsPage()) {
      var want = normalizeLang(state.langFilter || currentSiteLang());
      allReviews = allReviews.filter(function (row) {
        return normalizeLang(row && row.contentLang) === want;
      });
    }
    var stars = Math.max(0, Math.min(5, Math.round(Number(state.filterStars) || 0)));
    if (stars >= 1) {
      allReviews = allReviews.filter(function (row) {
        return reviewRatingValue(row) === stars;
      });
    }
    return sortReviewsList(allReviews, state.sortBy);
  }

  function pulseStageMotion() {
    var stage = byId("vc-reviews-stage");
    if (!stage) return;
    state.stageForceMotion = true;
    stage.classList.add("is-sliding");
    if (state.stageSlideTimer) {
      clearTimeout(state.stageSlideTimer);
      state.stageSlideTimer = null;
    }
    state.stageSlideTimer = setTimeout(function () {
      state.stageSlideTimer = null;
      state.stageForceMotion = false;
      var s = byId("vc-reviews-stage");
      if (s) s.classList.remove("is-sliding");
    }, 520);
  }

  function stepCarousel(dir) {
    var ordered = currentOrderedReviews();
    if (ordered.length <= 1) return;
    state.carouselIndex = wrapCarouselIndex(state.carouselIndex + (dir < 0 ? -1 : 1), ordered.length);
    state.reviewsPager.userControlled = true;
    pulseStageMotion();
    render();
  }

  function goCarouselIndex(nextIdx) {
    var ordered = currentOrderedReviews();
    if (!ordered.length) return;
    state.carouselIndex = wrapCarouselIndex(nextIdx, ordered.length);
    state.reviewsPager.userControlled = true;
    pulseStageMotion();
    render();
  }

  function stageSlotsKey(slots, idx, n) {
    return (
      String(n) +
      "@" +
      String(idx) +
      "|" +
      slots
        .map(function (slot) {
          var r = slot.review || {};
          return (
            String(slot.offset) +
            ":" +
            String(r.id || "") +
            ":" +
            String(r.rating || "") +
            ":" +
            String((r.content || "").length) +
            ":" +
            String((r.serverReply && r.serverReply.content) || "").length +
            ":" +
            String(Array.isArray(r.likes) ? r.likes.length : r.likeCount || 0) +
            ":" +
            (state.replyOpenId === r.id ? "1" : "0")
          );
        })
        .join("|")
    );
  }

  function syncStageTrackHeight(root) {
    if (!root) return;
    var center = root.querySelector(".vc-reviews-stage__card.is-center");
    if (!center || root.classList.contains("is-solo") || root.classList.contains("is-empty")) {
      root.style.removeProperty("min-height");
      return;
    }
    var h = Math.ceil(center.getBoundingClientRect().height + 44);
    if (h > 120) root.style.minHeight = h + "px";
  }

  function reviewCardMarkupForStage(review, posClass, offset) {
    var html = reviewCardMarkup(review);
    return html.replace(
      'class="vc-reviews-card"',
      'class="vc-reviews-card vc-reviews-stage__card ' +
        esc(posClass) +
        '" data-stage-offset="' +
        esc(String(offset)) +
        '" tabindex="' +
        (offset === 0 ? "0" : "-1") +
        '"',
    );
  }

  function renderStageDots(n, idx) {
    var dots = byId("vc-reviews-stage-dots");
    if (!dots) return;
    if (n <= 1) {
      dots.hidden = true;
      dots.innerHTML = "";
      return;
    }
    dots.hidden = false;
    var html = "";
    for (var i = 0; i < n; i += 1) {
      html +=
        '<button type="button" class="vc-reviews-stage__dot' +
        (i === idx ? " is-active" : "") +
        '" data-reviews-stage-dot="' +
        i +
        '" role="tab" aria-selected="' +
        (i === idx ? "true" : "false") +
        '" aria-label="Recensione ' +
        (i + 1) +
        " di " +
        n +
        '"></button>';
    }
    dots.innerHTML = html;
  }

  function renderReviewsStage(orderedReviews) {
    var root = byId("vc-reviews-server-list");
    var stage = byId("vc-reviews-stage");
    if (!root) return;
    var n = orderedReviews.length;
    var prevBtn = document.querySelector("[data-reviews-stage-prev]");
    var nextBtn = document.querySelector("[data-reviews-stage-next]");
    if (!n) {
      state.stageKey = "";
      root.className = "vc-reviews-stage__track is-empty";
      root.style.removeProperty("min-height");
      if (stage) stage.classList.add("is-empty");
      root.setAttribute("aria-live", "off");
      root.innerHTML = emptyMarkup(
        "fa-commenting-o",
        Number(state.filterStars || 0) >= 1
          ? t("reviews.emptyFiltered", "Nessuna recensione con queste stelle")
          : t("reviews.empty", "Ancora nessuna recensione"),
        Number(state.filterStars || 0) >= 1
          ? t("reviews.emptyFilteredHint", "Prova un altro filtro stelle o azzera i filtri.")
          : isBotReviewsPage()
            ? t("botReviews.emptyHint", "Scrivi la prima recensione su Vinili.")
            : t("reviews.emptyHint", "Sarai tu a inaugurare questa sezione."),
      );
      renderStageDots(0, 0);
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }
    if (stage) stage.classList.remove("is-empty");
    var idx = wrapCarouselIndex(state.carouselIndex, n);
    state.carouselIndex = idx;
    var slots = [];
    if (n === 1) {
      slots.push({ offset: 0, review: orderedReviews[0] });
    } else if (n === 2) {
      slots.push({ offset: -1, review: orderedReviews[wrapCarouselIndex(idx - 1, n)] });
      slots.push({ offset: 0, review: orderedReviews[idx] });
    } else {
      slots.push({ offset: -1, review: orderedReviews[wrapCarouselIndex(idx - 1, n)] });
      slots.push({ offset: 0, review: orderedReviews[idx] });
      slots.push({ offset: 1, review: orderedReviews[wrapCarouselIndex(idx + 1, n)] });
    }
    var key = stageSlotsKey(slots, idx, n);
    var mode = n === 1 ? " is-solo" : n === 2 ? " is-duo" : " is-trio";
    if (key === state.stageKey && root.querySelector(".vc-reviews-stage__card")) {
      root.className = "vc-reviews-stage__track" + mode;
      scanReviewAvatars(root);
      renderStageDots(n, idx);
      if (prevBtn) prevBtn.disabled = n <= 1;
      if (nextBtn) nextBtn.disabled = n <= 1;
      if (stage) {
        stage.setAttribute("data-count", String(n));
        stage.setAttribute("data-index", String(idx + 1));
      }
      window.requestAnimationFrame(function () {
        syncStageTrackHeight(root);
      });
      return;
    }
    state.stageKey = key;
    root.className = "vc-reviews-stage__track" + mode;
    root.setAttribute("aria-live", "off");
    root.innerHTML = slots
      .map(function (slot) {
        var pos = slot.offset === 0 ? "is-center" : slot.offset < 0 ? "is-left" : "is-right";
        return reviewCardMarkupForStage(slot.review, pos, slot.offset);
      })
      .join("");
    /* reviewsStageSpread2: no home-rise/fx on stage cards — fights absolute transforms */
    function stripStageFx(rootEl) {
      try {
        var staged = (rootEl || root).querySelectorAll(".vc-reviews-stage__card");
        for (var si = 0; si < staged.length; si += 1) {
          staged[si].classList.remove("vc-home-rise", "is-in", "vc-fx-card", "vc-home-panel");
        }
      } catch (eStrip) {}
    }
    stripStageFx(root);
    scanReviewAvatars(root);
    window.requestAnimationFrame(function () {
      stripStageFx(root);
      window.setTimeout(function () {
        stripStageFx(root);
      }, 120);
      window.setTimeout(function () {
        stripStageFx(root);
      }, 400);
    });
    renderStageDots(n, idx);
    if (prevBtn) prevBtn.disabled = n <= 1;
    if (nextBtn) nextBtn.disabled = n <= 1;
    if (stage) {
      stage.setAttribute("data-count", String(n));
      stage.setAttribute("data-index", String(idx + 1));
      if (state.stageForceMotion) stage.classList.add("is-sliding");
      else stage.classList.remove("is-sliding");
    }
    window.requestAnimationFrame(function () {
      syncStageTrackHeight(root);
    });
  }

  function bindReviewsStageOnce() {
    if (state.carouselBound) return;
    state.carouselBound = true;
    document.addEventListener("click", function (ev) {
      var el = ev.target;
      if (!el || typeof el.closest !== "function") return;
      if (el.closest("[data-reviews-stage-prev]")) {
        ev.preventDefault();
        stepCarousel(-1);
        return;
      }
      if (el.closest("[data-reviews-stage-next]")) {
        ev.preventDefault();
        stepCarousel(1);
        return;
      }
      var dot = el.closest("[data-reviews-stage-dot]");
      if (dot) {
        ev.preventDefault();
        goCarouselIndex(Number(dot.getAttribute("data-reviews-stage-dot")));
        return;
      }
      var side = el.closest(".vc-reviews-stage__card.is-left, .vc-reviews-stage__card.is-right");
      if (side && !el.closest("button, a, textarea, input, label")) {
        var off = Number(side.getAttribute("data-stage-offset"));
        if (off < 0) stepCarousel(-1);
        else if (off > 0) stepCarousel(1);
      }
    });
    document.addEventListener("keydown", function (ev) {
      if (!document.body || !document.body.classList.contains("vc-reviews-page")) return;
      var stage = byId("vc-reviews-stage");
      if (!stage || stage.classList.contains("is-empty")) return;
      var t = ev.target;
      var tag = t && t.tagName ? String(t.tagName).toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
      if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        stepCarousel(-1);
      } else if (ev.key === "ArrowRight") {
        ev.preventDefault();
        stepCarousel(1);
      }
    });
    var track = byId("vc-reviews-server-list");
    if (track) {
      track.addEventListener(
        "touchstart",
        function (ev) {
          var touch = ev.changedTouches && ev.changedTouches[0];
          state.carouselTouchX = touch ? touch.clientX : null;
        },
        { passive: true },
      );
      track.addEventListener(
        "touchend",
        function (ev) {
          var startX = state.carouselTouchX;
          state.carouselTouchX = null;
          if (startX == null) return;
          var touch = ev.changedTouches && ev.changedTouches[0];
          if (!touch) return;
          var dx = touch.clientX - startX;
          if (Math.abs(dx) < 48) return;
          if (dx > 0) stepCarousel(-1);
          else stepCarousel(1);
        },
        { passive: true },
      );
    }
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

  function setReviewHeadCtaLabel(btn, label, iconClass) {
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
    } else if (ico && iconClass) {
      ico.className = iconClass;
    }
    span.textContent = label;
  }

  function syncReviewHeadButton() {
    var btn = byId("vc-reviews-open-form-btn");
    if (!btn) return;
    var viewer = state.payload && state.payload.viewer;
    var tokenOk = Boolean(getToken());
    var isLogged = Boolean(viewer && viewer.id);
    var serverExisting = viewerOwnReview(viewer);
    btn.hidden = false;
    btn.classList.add("vc-feedback-filters__cta");
    if (!isLogged || !tokenOk) {
      setReviewHeadCtaLabel(btn, t("reviews.write", "Scrivi recensione"), "fa fa-pencil");
      btn.setAttribute("aria-label", t("reviews.writeAriaLogin", "Accedi con Discord per scrivere una recensione"));
    } else if (serverExisting) {
      setReviewHeadCtaLabel(btn, t("reviews.edit", "Modifica recensione"), "fa fa-pencil");
      btn.setAttribute("aria-label", t("reviews.editBtn", "Modifica la tua recensione"));
    } else {
      setReviewHeadCtaLabel(btn, t("reviews.write", "Scrivi recensione"), "fa fa-pencil");
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

    ensureReviewsFiltersBar(); /* reviewsFilters1 */
    var orderedReviews = currentOrderedReviews();
    ensurePageIncludesDeepLink(orderedReviews);
    renderReviewsStage(orderedReviews);
    /* reviewsStage3: carousel replaces pager */
    var pager = byId("vc-reviews-pager");
    if (pager) {
      pager.hidden = true;
      pager.innerHTML = "";
    }
    state.renderFingerprint = reviewsPayloadFingerprint(state.payload || payload);
    syncReviewFormModal();
    syncReviewHeadButton();
    bind();
    bindReviewsStageOnce();
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
      var ct = "";
      try {
        ct = String((response.headers && response.headers.get("content-type")) || "").toLowerCase();
      } catch (eCt) {
        ct = "";
      }
      var looksJson = ct.indexOf("json") !== -1 || (raw.charAt(0) === "{" || raw.charAt(0) === "[");
      if (!raw || !looksJson) {
        throw new Error(
          t("reviews.apiUnavailable", "Servizio temporaneamente non disponibile. Riprova tra poco."),
        );
      }
      try {
        return JSON.parse(raw);
      } catch (e) {
        throw new Error(
          t("reviews.apiUnavailable", "Servizio temporaneamente non disponibile. Riprova tra poco."),
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
        v: "cinePolish1",
      });
    }
    return "reviewsCinePolish1:" + pageKind();
  }

  function showReviewsSkeleton() {
    var track = byId("vc-reviews-server-list");
    if (!track || state.payload) return;
    track.innerHTML =
      '<article class="vc-reviews-card vc-list-skel" aria-hidden="true">' +
      '<div class="vc-list-skel__row"><span class="vc-list-skel__avatar"></span><span class="vc-list-skel__lines"><i></i><i></i></span></div>' +
      '<span class="vc-list-skel__block"></span></article>';
    track.setAttribute("aria-busy", "true");
  }

  function fetchPayload() {
    if (fetchPayloadInFlight) return fetchPayloadInFlight;

    setStatus("", false);
    showReviewsSkeleton();
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
          fetchInit: { method: "GET", headers: authHeaders(), cache: "default" },
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
        cache: "default",
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
    var confirmP = (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.confirm !== "function") return false;
      return D.confirm({
          title: t("reviews.confirmDeleteTitle", "Eliminare la recensione?"),
          message: t("reviews.confirmDelete", "Vuoi davvero eliminare la tua recensione?"),
          confirmLabel: t("reviews.delete", "Elimina"),
          cancelLabel: t("reviews.cancel", "Annulla"),
          danger: true,
          icon: "fa-trash-o",
        });
    });
    confirmP.then(function (ok) {
      if (ok) run();
    });
  }

  function main() {
    wireGateLoginCta();
    bindReviewsPagerOnce();
    ensureReviewsFiltersBar(); /* reviewsFilters1: toolbar before data */
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
      if (state.payload) {
        void refreshReviewsPayloadQuiet();
      } else {
        fetchPayload();
      }
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

  window.addEventListener("vc:site-api-refetch", function () {
    if (!byId("vc-reviews-server-list") && !byId("vc-reviews-bot-list")) return;
    void fetchPayload();
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