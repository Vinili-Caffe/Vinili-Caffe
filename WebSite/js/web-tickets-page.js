(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var cfg = (typeof window !== "undefined" && window.__VC_WEB_TICKETS) || {};
  var isStaffMode = false;
  var CATEGORY_DESCRIPTIONS_FALLBACK = {
    supporto:
      "Segnalazioni, problemi/bug, informazioni o qualunque richiesta che non rientra nelle altre categorie.",
    partnership: "Usalo per fare partnership con noi.",
    high: "Donazioni, sponsor a pagamento o per parlare con un amministratore.",
    perks: "Verifica selfie o riscatto ruoli Supporter / Follower.",
  };

  var state = {
    tickets: [],
    selectedId: "",
    openTicketSeq: 0,
    urlListenersWired: false,
    detail: null,
    messages: [],
    viewerId: "",
    viewerName: "",
    viewerAvatarUrl: "",
    avatarByUserId: {},
    categories: [],
    filter: "all",
    categoryFilter: "",
    listPage: 1,
    listPageSize: 20,
    listTotal: 0,
    listTotalPages: 1,
    viewMode: "user",
    listQuietTimer: null,
    listQuietGen: 0,
    presenceTimer: null,
    presenceLastSent: "",
    presenceResumeTimer: null,
    typingRoom: null,
    staffAccess: false,
    staffCategories: [],
    composeOpen: false,
    draftCategory: "supporto",
    draftSubject: "",
    draftContent: "",
    draftImages: [],
    composerImages: [],
    composerText: "",
    replyTo: null,
    rateDraftTicket: 0,
    rateDraftStaffer: 0,
    busy: false,
    ws: null,
    wsReconnectTimer: null,
    pollTimer: null,
    seenMessageIds: {},
    deletedMessageIds: {},
    guildEmojis: [],
    guildEmojisLoaded: false,
    guildId: "",
    staffRoles: {},
    mentionNames: {},
    mentionMenu: { open: false, q: "", items: [], index: 0, elId: "", mode: "user", filter: "all" },
    mentionTimer: null,
    commandMenu: { open: false, q: "", items: [], index: 0, prefix: "+", elId: "" },
    commandTimer: null,
    linkCache: {},
    pendingLinkUrls: {},
    pendingChannelIds: {},
    pendingUserIds: {},
    pendingRoleIds: {},
    userResolveAttempted: {},
    roleResolveAttempted: {},
    resolveTimer: null,
    resolveInflight: false,
    commandCatalog: [],
    slashCatalog: [],
    commandCatalogLoaded: false,
    commandCatalogTicketId: "",
    commandCatalogLoading: null,
    commandCatalogLoadTicketId: "",
    partnershipFlowOpen: false,
    commandCatalogTicketId: "",
    commandPrefix: "+",
    commandCatalogLoading: null,
    commandCatalogLoadTicketId: "",
    composerSuggestTimer: null,
    guildEmojisLoading: false,
    emojiPickerToken: 0,
    emojiPickerOpening: false,
    statusToastTimer: null,
    bootWired: false,
    tokenWaitTimer: null,
    authBootTimer: null,
    listLoadGen: 0,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getToken() {
    try {
      var t = localStorage.getItem(ACCESS_TOKEN_KEY);
      var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
      if (!t) return "";
      if (exp && Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function authHeaders(json) {
    var h = { Authorization: "Bearer " + getToken() };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  function isUsableApiUrl(u) {
    var s = String(u || "").trim();
    if (!s || s === "#" || s === "/") return false;
    if (s.indexOf("{{") >= 0) return false;
    return true;
  }

  function apiBase() {
    var remote = String(cfg.apiUrl || "").trim();
    var local = String(cfg.apiUrlLocal || "").trim();
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      if (isUsableApiUrl(local)) return local;
      if (isUsableApiUrl(remote)) return remote;
      return "/webhooks/site-web-tickets";
    }
    if (isUsableApiUrl(remote)) return remote;
    return "/webhooks/site-web-tickets";
  }

  function isCoarseMobile() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      if (Number(navigator.maxTouchPoints || 0) > 0) return true;
    } catch (eMob) {}
    return false;
  }

  function ticketPollIntervalMs() {
    // Con WS aperto resta un backup più lento; senza WS poll più aggressivo.
    var wsOpen = state.ws && state.ws.readyState === 1;
    if (isCoarseMobile()) return wsOpen ? 14000 : 9000;
    return wsOpen ? 10000 : 4500;
  }

  function ticketPresenceIntervalMs() {
    return isCoarseMobile() ? 45000 : 20000;
  }

  function toastHostEl() {
    var host = byId("vc-wt-toast-host");
    if (host) return host;
    host = document.createElement("div");
    host.id = "vc-wt-toast-host";
    host.className = "vc-dash-save-toast-host vc-wt-toast-host";
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-atomic", "true");
    document.body.appendChild(host);
    return host;
  }

  function hideStatusToast() {
    if (state.statusToastTimer) {
      clearTimeout(state.statusToastTimer);
      state.statusToastTimer = null;
    }
    var host = byId("vc-wt-toast-host");
    if (!host) return;
    host.innerHTML = "";
  }

  function isPendingStatus(msg) {
    var s = String(msg || "").trim();
    return /[…]$|\.\.\.$/.test(s);
  }

  function setStatus(msg, isError) {
    var el = byId("vc-wt-status");
    if (el) {
      el.textContent = "";
      el.hidden = true;
    }
    /* ticketActionFail1: message API a volte è oggetto (system msg) — non toastarlo */
    var text = "";
    if (typeof msg === "string") text = msg.trim();
    else if (msg && typeof msg === "object" && typeof msg.content === "string") text = "";
    else if (msg != null) text = String(msg).trim();
    if (text === "[object Object]") text = "";
    if (window.VcSiteToast) {
      if (!text) window.VcSiteToast.hide();
      else window.VcSiteToast.show(text, Boolean(isError));
      return;
    }
    if (!text) {
      hideStatusToast();
      return;
    }
    var host = toastHostEl();
    if (state.statusToastTimer) {
      clearTimeout(state.statusToastTimer);
      state.statusToastTimer = null;
    }
    host.innerHTML = "";
    var pending = !isError && isPendingStatus(text);
    var toast = document.createElement("div");
    toast.className =
      "vc-dash-save-toast" + (isError ? " is-error" : "") + (pending ? " is-pending" : "");
    toast.setAttribute("role", "status");
    var ico = document.createElement("span");
    ico.className = "vc-dash-save-toast__icon";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = isError
      ? '<i class="fa fa-times" aria-hidden="true"></i>'
      : pending
        ? '<span class="vc-ui-spinner vc-ui-spinner--on-dark" aria-hidden="true"></span>'
        : '<i class="fa fa-check" aria-hidden="true"></i>';
    var p = document.createElement("p");
    p.className = "vc-dash-save-toast__text";
    p.textContent = text;
    toast.appendChild(ico);
    toast.appendChild(p);
    host.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    if (pending) return;
    state.statusToastTimer = setTimeout(
      function () {
        toast.classList.add("is-leaving");
        toast.classList.remove("is-visible");
        setTimeout(function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 200);
        state.statusToastTimer = null;
      },
      isError ? 2800 : 1600,
    );
  }

  function hideGate() {
    var g = byId("vc-wt-gate");
    if (!g) return;
    g.setAttribute("hidden", "");
    g.classList.add("vc-reviews-gate--dismissed");
    document.body.classList.remove("vc-wt-gate-open");
  }

  function showGate() {
    var g = byId("vc-wt-gate");
    if (!g) return;
    g.removeAttribute("hidden");
    g.classList.remove("vc-reviews-gate--dismissed");
    document.body.classList.add("vc-wt-gate-open");
  }

  function formatTime(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }

  function formatBubbleTime(iso) {
    if (!iso) return { label: "", title: "", datetime: "" };
    try {
      var d = new Date(iso);
      var now = new Date();
      var sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      var clock = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
      var title = d.toLocaleString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      var label = sameDay
        ? clock
        : d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) + " " + clock;
      return { label: label, title: title, datetime: d.toISOString() };
    } catch (e) {
      return { label: "", title: "", datetime: "" };
    }
  }

  function statusLabel(t) {
    if (!t) return "";
    if (t.status === "closed") return "Chiuso";
    if (t.status === "claimed" || t.claimedBy) return "In carico";
    return "Aperto";
  }

  function statusClass(t) {
    if (!t) return "";
    if (t.status === "closed") return "is-closed";
    if (t.status === "claimed" || t.claimedBy) return "is-claimed";
    return "is-open";
  }

  function avatarHtml(url, name, cls) {
    var src = String(url || "").trim();
    var letter = String(name || "?").trim().charAt(0).toUpperCase() || "?";
    if (src) {
      return (
        '<img class="' +
        esc(cls || "vc-wt-avatar") +
        '" src="' +
        esc(src) +
        '" alt="" width="36" height="36" loading="lazy" decoding="async" data-vc-avatar-fallback="1" />'
      );
    }
    return '<span class="' + esc(cls || "vc-wt-avatar") + ' vc-wt-avatar--fallback" aria-hidden="true">' + esc(letter) + "</span>";
  }

  var VINILI_BOT_AVATAR_URL =
    "https://cdn.discordapp.com/avatars/1329118940110127204/a_2f3825915a41d0f9bcbf9f2675e6d6f0.gif?size=128";
  var VINILI_BOT_USER_ID = "1329118940110127204";

  function resolveMessageAvatarUrl(m) {
    var url = String((m && m.authorAvatarUrl) || "").trim();
    if (url) return url;
    var kind = String((m && m.authorKind) || "");
    var name = String((m && m.authorName) || "");
    var id = String((m && m.authorId) || "");
    if (kind === "bot" || id === "bot_import" || id === VINILI_BOT_USER_ID || /^vinili/i.test(name)) {
      return VINILI_BOT_AVATAR_URL;
    }
            return "";
  }

  function rememberUserAvatar(userId, avatarUrl, userName) {
    var id = String(userId || "").trim();
    var url = String(avatarUrl || "").trim();
    if (!url) return;
    if (!state.avatarByUserId) state.avatarByUserId = {};
    if (!state.avatarByUserName) state.avatarByUserName = {};
    if (id) state.avatarByUserId[id] = url;
    var nm = String(userName || "").trim().toLowerCase();
    if (nm) state.avatarByUserName[nm] = url;
    if (id.indexOf("discord:") === 0) {
      var slug = id.slice(8).toLowerCase();
      if (slug) state.avatarByUserName[slug] = url;
    }
  }

  function isUselessMessageContent(content) {
    var s = String(content || "").trim();
    if (!s) return true;
    if (/nessun contenuto/i.test(s)) return true;
    if (/^…altre \d+ messaggi/i.test(s)) return true;
    return false;
  }

  function resolveHashTicketId() {
    var h = String(location.hash || "").replace(/^#/, "").trim();
    if (h && h.indexOf("access_token=") < 0 && /^[a-f0-9]{24}$/i.test(h)) return h;
    try {
      var q = String(new URLSearchParams(location.search || "").get("ticketId") || "").trim();
      if (/^[a-f0-9]{24}$/i.test(q)) return q;
    } catch (eQ) {}
    return "";
  }

  /* ticketClickScrollStay1: click ticket/hash non deve riportare la pagina in alto */
  /* notifTicketScrollStay1: openTicket + hash + focus senza jump pagina */
  /* ticketModalScrollStay2: dopo confirm modal non saltare in alto */
  function pageScrollY() {
    try {
      if (typeof window.__vcGetPinnedPageScrollY === "function") {
        var pinned = Number(window.__vcGetPinnedPageScrollY()) || 0;
        if (pinned > 0) return pinned;
      }
    } catch (ePin) {}
    try {
      return (
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        (document.body && document.body.scrollTop) ||
        0
      );
    } catch (eY) {
      return 0;
    }
  }

  function capturePageScrollY() {
    var y = pageScrollY();
    try {
      if (typeof window.__vcGetPinnedPageScrollY === "function") {
        var pinned = Number(window.__vcGetPinnedPageScrollY()) || 0;
        if (pinned > y) y = pinned;
      }
    } catch (eCap) {}
    return Math.max(0, Number(y) || 0);
  }

  function restorePageScroll(y) {
    /* ticketDialogScrollFight1: mai scrollare mentre dialog/sheet tiene il pin (salta su/giù col modal) */
    try {
      var root = document.documentElement;
      if (root && root.classList.contains("vc-dialog-open")) return;
      if (root && root.classList.contains("vc-dash-confirm-open")) return;
      if (typeof window.__vcIsPageScrollFrozen === "function" && window.__vcIsPageScrollFrozen()) return;
      if (document.querySelector(".vc-dialog.is-open, #vc-site-dialog.is-open:not([hidden])")) return;
    } catch (eFreeze) {}
    var n = Math.max(0, Number(y) || 0);
    try {
      window.scrollTo(0, n);
      if (document.documentElement) document.documentElement.scrollTop = n;
      if (document.body) document.body.scrollTop = n;
    } catch (eScr) {}
  }
  try {
    window.__vcWtRestorePageScroll = restorePageScroll;
  } catch (eExp) {}

  function withPageScrollPreserved(fn) {
    var y = pageScrollY();
    var list = byId("vc-wt-list");
    var listY = list ? Number(list.scrollTop) || 0 : 0;
    var out;
    try {
      out = typeof fn === "function" ? fn() : undefined;
    } finally {
      restorePageScroll(y);
      try {
        var listNow = byId("vc-wt-list");
        if (listNow) listNow.scrollTop = listY;
      } catch (eList) {}
      try {
        requestAnimationFrame(function () {
          restorePageScroll(y);
          var list2 = byId("vc-wt-list");
          if (list2) list2.scrollTop = listY;
        });
      } catch (eRaf) {
        restorePageScroll(y);
      }
    }
    return out;
  }

  function setHashTicket(id) {
    withPageScrollPreserved(function () {
      try {
        if (!id) {
          history.replaceState(null, "", location.pathname + location.search);
          return;
        }
        history.replaceState(null, "", location.pathname + location.search + "#" + id);
      } catch (e) {}
    });
  }

  function hasStaffViewQuery() {
    try {
      return new URLSearchParams(location.search || "").get("view") === "staff";
    } catch (e) {
      return false;
    }
  }

    function redirectAwayFromStaffView() {
    try {
      if (!hasStaffViewQuery() && state.viewMode !== "staff") return;
      state.viewMode = "user";
      syncStaffMode();
      var hash = "";
      try {
        hash = String(location.hash || "").trim();
      } catch (eHash) {}
      var path = String(location.pathname || "/tickets/").replace(/\/?$/, "/") || "/tickets/";
      if (path.indexOf("/tickets") < 0) path = "/tickets/";
      history.replaceState(null, "", path + hash);
    } catch (e) {
      try {
        location.replace("/tickets/");
      } catch (e2) {}
    }
  }

  function hasStaffInboxAccess() {
    return Boolean(
      state.staffAccess ||
        (state.staffCategories && state.staffCategories.length),
    );
  }

  function denyStaffViewIfUnauthorized() {
    if (!wantsStaffInbox() && !hasStaffViewQuery()) return false;
    if (hasStaffInboxAccess()) return false;
    redirectAwayFromStaffView();
    return true;
  }

  function syncStaffMode() {
    isStaffMode = state.viewMode === "staff" && hasStaffInboxAccess();
  }

  function wantsStaffInbox() {
    return state.viewMode === "staff";
  }

  function listQuery() {
    var q = [];
        if (isStaffMode || wantsStaffInbox()) {
      q.push("scope=staff");
      if (state.filter) q.push("status=" + encodeURIComponent(state.filter));
      if (state.categoryFilter) q.push("category=" + encodeURIComponent(state.categoryFilter));
    } else if (state.filter === "closed") {
      q.push("status=closed");
    } else if (state.filter === "open") {
      q.push("status=open");
    } else {
      q.push("status=all");
    }
    var page = Math.max(1, Number(state.listPage) || 1);
    var limit = Math.max(5, Math.min(50, Number(state.listPageSize) || 20));
    q.push("page=" + encodeURIComponent(String(page)));
    q.push("limit=" + encodeURIComponent(String(limit)));
    return q.length ? "?" + q.join("&") : "";
  }

  function fetchJson(url, opts) {
    opts = opts || {};
    var timeoutMs = Number(opts.timeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = 18000;
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    if (ctrl) {
      timer = setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eAbort) {}
      }, timeoutMs);
    }
    var req = Object.assign({}, opts);
    delete req.timeoutMs;
    if (ctrl) req.signal = ctrl.signal;
    return fetch(url, req)
      .then(function (res) {
        return res
          .json()
          .then(function (data) {
            return { res: res, data: data };
          })
          .catch(function () {
            return { res: res, data: null };
          });
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function draftsApi() {
    return typeof window !== "undefined" ? window.VcFormDrafts : null;
  }

  function ticketComposerDraftKey(id) {
    return "web_ticket_msg:" + String(id || "").trim();
  }

  function flushComposerTextFromDom() {
    var ta = byId("vc-wt-composer-text");
    if (ta) state.composerText = serializeRichInput(ta);
  }

  function saveTicketComposerDraft() {
    var D = draftsApi();
    if (!D) return;
    var id = String(state.selectedId || "").trim();
    if (!id) {
      D.clear("web_ticket_ui");
      return;
    }
    var text = String(state.composerText || "");
    if (!text.trim()) D.clear(ticketComposerDraftKey(id));
    else D.save(ticketComposerDraftKey(id), text);
    D.save("web_ticket_ui", { selectedId: id });
  }

  function loadTicketComposerDraft(id) {
    var D = draftsApi();
    if (!D || !id) return "";
    var v = D.load(ticketComposerDraftKey(id));
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && v.text != null) return String(v.text || "");
    return "";
  }

  function clearTicketComposerDraft(id) {
    var D = draftsApi();
    if (!D) return;
    D.clear(ticketComposerDraftKey(id || state.selectedId));
  }

    function clearTicketSelection(opts) {
    opts = opts || {};
    if (state.selectedId) {
      flushComposerTextFromDom();
      var keepId = String(state.selectedId);
      var keepText = String(state.composerText || "");
      state.selectedId = "";
      var D = draftsApi();
      if (D) {
        if (keepText.trim()) D.save(ticketComposerDraftKey(keepId), keepText);
        D.clear("web_ticket_ui");
      }
    } else {
      var D2 = draftsApi();
      if (D2) D2.clear("web_ticket_ui");
    }
    state.detail = null;
    state.messages = [];
    state.seenMessageIds = {};
    state.deletedMessageIds = {};
    state.composeOpen = false;
    state.composerText = "";
    state.composerImages = [];
    state.replyTo = null;
    if (opts.keepHash !== true) setHashTicket("");
    sendTicketPresence({ force: true });
  }

  function restoreTicketUiSelection() {
    if (state.selectedId) return;
    var hashId = resolveHashTicketId();
    if (hashId) {
      state.selectedId = hashId;
      return;
    }
    var D = draftsApi();
    var ui = D && D.load("web_ticket_ui");
    if (!ui || !ui.selectedId) return;
    var id = String(ui.selectedId);
        if (state.tickets.some(function (t) { return t.id === id; })) {
      state.selectedId = id;
    } else if (D) {
      D.clear("web_ticket_ui");
    }
  }

  function showTicketsLoadingShell(message) {
    var app = byId("vc-wt-app");
    if (!app) return;
    app.hidden = false;
    app.innerHTML =
      '<div class="vc-wt-chrome">' +
      scopeSwitcherHtml() +
      '<div class="vc-wt-filter-menu vc-wt-filter-menu--loading" aria-hidden="true"></div>' +
      '<div class="vc-wt-layout"><aside class="vc-wt-sidebar">' +
      '<div class="vc-wt-sidebar__top"><h2>' +
      (wantsStaffInbox() ? "Staff" : "Personali") +
      "</h2></div>" +
      '<div class="vc-wt-empty vc-wt-empty--loading"><span class="vc-ui-spinner vc-ui-spinner--on-dark" aria-hidden="true"></span>' +
      "<p>" +
      esc(message || "Caricamento ticket…") +
      "</p></div></aside>" +
      '<section class="vc-wt-main"><div class="vc-wt-chat vc-wt-chat--empty">' +
      '<div class="vc-wt-chat-empty"><span class="vc-wt-chat-empty__icon" aria-hidden="true"><i class="fa fa-comments-o"></i></span>' +
      "<strong>Caricamento…</strong></div></div></section></div></div>";
  }

  function ticketActivityMs(t) {
    var raw = (t && (t.lastMessageAt || t.updatedAt || t.createdAt)) || "";
    var ms = Date.parse(String(raw));
    return Number.isFinite(ms) ? ms : 0;
  }

  function ticketNumberValue(t) {
    var n = Number(t && t.ticketNumber);
    return Number.isFinite(n) ? n : 0;
  }

  function sortTicketsInPlace(list) {
    if (!Array.isArray(list)) return [];
    list.sort(function (a, b) {
      var da = ticketActivityMs(a);
      var db = ticketActivityMs(b);
      if (db !== da) return db - da;
      return ticketNumberValue(b) - ticketNumberValue(a);
    });
    return list;
  }

  function applyListPayload(data) {
    if (!data || !data.ok) return false;
    state.tickets = sortTicketsInPlace(data.tickets || []);
    var pageSize = Math.max(5, Math.min(50, Number(data.pageSize) || Number(state.listPageSize) || 20));
    var total = Math.max(0, Number(data.total));
    if (!Number.isFinite(total)) total = state.tickets.length;
    var totalPages = Math.max(1, Number(data.totalPages) || Math.ceil(total / pageSize) || 1);
    var page = Math.max(1, Number(data.page) || Number(state.listPage) || 1);
    if (page > totalPages) page = totalPages;
    state.listPageSize = pageSize;
    state.listTotal = total;
    state.listTotalPages = totalPages;
    state.listPage = page;
    if (data.viewerId) state.viewerId = data.viewerId || state.viewerId;
    if (data.viewerName != null) state.viewerName = data.viewerName || "";
    if (data.viewerAvatarUrl != null) state.viewerAvatarUrl = data.viewerAvatarUrl || "";
    if (data.categories) state.categories = data.categories;
    state.staffAccess = Boolean(data.staffAccess || data.isStaff);
    if (Array.isArray(data.staffCategories) && data.staffCategories.length) {
      state.staffCategories = data.staffCategories;
    } else if (state.staffAccess) {
            if (!state.staffCategories.length) {
        state.staffCategories = ["supporto"];
      }
    } else if (Array.isArray(data.staffCategories)) {
      state.staffCategories = [];
    }
    if (data.guildId) state.guildId = String(data.guildId);
    syncStaffMode();
        if (denyStaffViewIfUnauthorized()) {
          }
    return true;
  }

  function loadList(opts) {
    opts = opts || {};
    if (!getToken()) {
      if (!isStaffMode && !wantsStaffInbox()) showGate();
      if (!opts.silentNoToken) setStatus("Sessione Discord assente.", true);
      return Promise.resolve(false);
    }
    if (!isStaffMode) hideGate();
    var loadGen = (state.listLoadGen = (Number(state.listLoadGen) || 0) + 1);
    var soft = opts.soft === true && Array.isArray(state.tickets) && state.tickets.length > 0;
    var attempt = Math.max(0, Number(opts.attempt) || 0);
    if (!soft) showTicketsLoadingShell("Caricamento ticket…");
    return fetchJson(apiBase() + listQuery(), {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
      timeoutMs: isCoarseMobile() ? 28000 : 24000,
    })
      .then(function (out) {
        if (loadGen !== state.listLoadGen) return false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          var authFail = out.res.status === 401 || out.res.status === 403;
          if (authFail) {
            if (!wantsStaffInbox()) showGate();
          }
          var transient =
            !authFail &&
            (out.res.status === 0 ||
              out.res.status === 408 ||
              out.res.status === 429 ||
              out.res.status === 502 ||
              out.res.status === 503 ||
              out.res.status === 504 ||
              String((out.data && out.data.error) || "") === "member_unavailable" ||
              String((out.data && out.data.error) || "") === "discord_unreachable" ||
              String((out.data && out.data.error) || "") === "guild_unavailable");
          /* ticketsListHang1: first-stamp Discord member resolve often 503 — retry more before emptying UI */
          if (!soft && attempt < (transient ? 3 : 1) && !authFail) {
            return new Promise(function (resolve) {
              window.setTimeout(resolve, isCoarseMobile() ? 700 + attempt * 400 : 350 + attempt * 250);
            }).then(function () {
              if (loadGen !== state.listLoadGen) return false;
              return loadList({ soft: false, attempt: attempt + 1 });
            });
          }
          if (!soft && attempt < 2 && authFail && getToken()) {
            return new Promise(function (resolve) {
              window.setTimeout(resolve, isCoarseMobile() ? 900 : 450);
            }).then(function () {
              if (loadGen !== state.listLoadGen) return false;
              return loadList({ soft: false, attempt: attempt + 1 });
            });
          }
          setStatus((out.data && out.data.message) || "Impossibile caricare i ticket.", true);
          if (!soft) {
            state.tickets = [];
            renderShell();
          }
          return false;
        }
        applyListPayload(out.data);
        setStatus("");
        var app = byId("vc-wt-app");
        if (app) app.hidden = false;
        restoreTicketUiSelection();
        queueMissingAvatarsFromMessages([]);
        var hashId = resolveHashTicketId();
        if (hashId && !state.selectedId) state.selectedId = hashId;
        if (
          state.selectedId &&
          !state.tickets.some(function (t) {
            return t.id === state.selectedId;
          })
        ) {
          // Keep deeplink selection even if the ticket is not on the first list page.
          if (hashId && hashId === state.selectedId) {
            /* keep */
          } else if (hashId !== state.selectedId) {
            clearTicketSelection({ keepHash: true });
          }
        }
        renderShell();
        if (state.selectedId) return openTicket(state.selectedId, true).then(function () {
          return true;
        });
        return true;
      })
      .catch(function (err) {
        if (loadGen !== state.listLoadGen) return false;
        var aborted = err && (err.name === "AbortError" || err.code === 20);
        if (!soft && attempt < 2) {
          return new Promise(function (resolve) {
            window.setTimeout(resolve, isCoarseMobile() ? 800 + attempt * 400 : 400 + attempt * 250);
          }).then(function () {
            if (loadGen !== state.listLoadGen) return false;
            return loadList({ soft: false, attempt: attempt + 1 });
          });
        }
        /* notifApiErr1: abort/superseded → no error toast */
        if (aborted) {
          state.tickets = state.tickets || [];
          if (!soft) renderShell();
          return false;
        }
        setStatus("Errore di rete.", true);
        state.tickets = state.tickets || [];
        if (!soft) renderShell();
        return false;
      });
  }

  function markOpenTicketNotificationsRead(ticketId) {
    var id = String(ticketId || "").trim();
    if (!id) return;
    function run() {
      try {
        if (typeof window.__vcMarkTicketNotificationsRead === "function") {
          window.__vcMarkTicketNotificationsRead(id);
          return true;
        }
      } catch (e) {}
      return false;
    }
    if (run()) return;
    window.setTimeout(run, 400);
  }

  function openTicket(id, quiet, opts) {
    opts = opts || {};
    var attempt = Math.max(0, Number(opts.attempt) || 0);
    id = String(id || "").trim();
    if (!id) return Promise.resolve();
    /* notifTicketScrollStay1: aprire ticket non deve riportare la pagina in alto */
    var yHold = pageScrollY();
    if (!getToken()) {
      if (attempt >= 10) return Promise.resolve();
      return new Promise(function (resolve) {
        window.setTimeout(resolve, attempt < 3 ? 200 : 400);
      }).then(function () {
        return openTicket(id, quiet, { attempt: attempt + 1 });
      });
    }
    if (state.selectedId === id && state.detail && state.messages && state.messages.length) {
      refreshListActiveState();
      restorePageScroll(yHold);
      return Promise.resolve();
    }
    if (state.selectedId && state.selectedId !== id) {
      flushComposerTextFromDom();
      saveTicketComposerDraft();
      stopTicketTypingRoom();
    }
    state.selectedId = id;
    state.composerText = loadTicketComposerDraft(id);
    state.composerImages = [];
    state.replyTo = null;
    state.rateDraftTicket = 0;
    state.rateDraftStaffer = 0;
    setHashTicket(id);
    saveTicketComposerDraft();
    markOpenTicketNotificationsRead(id);
    refreshListActiveState();
    restorePageScroll(yHold);
    var seq = (state.openTicketSeq = (Number(state.openTicketSeq) || 0) + 1);
    if (!quiet && attempt === 0) setStatus("Apertura chat…", false);
    return fetchJson(apiBase() + "/" + encodeURIComponent(id), {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
      timeoutMs: attempt === 0 ? 18000 : 22000,
    })
      .then(function (out) {
        if (seq !== state.openTicketSeq || state.selectedId !== id) return;
        if (!out.res.ok || !out.data || !out.data.ok) {
          var status = Number((out.res && out.res.status) || 0);
          var errCode = String((out.data && out.data.error) || "");
          var retryable =
            !out.data ||
            status === 0 ||
            status === 401 ||
            status === 408 ||
            status === 429 ||
            status >= 500 ||
            errCode === "missing_token" ||
            errCode === "invalid_token" ||
            errCode === "unauthorized";
          if (retryable && attempt < 5) {
            return new Promise(function (resolve) {
              window.setTimeout(resolve, 350 * (attempt + 1));
            }).then(function () {
              return openTicket(id, quiet, { attempt: attempt + 1 });
            });
          }
          if (!quiet || attempt > 0) {
            setStatus((out.data && out.data.message) || "Ticket non disponibile.", true);
          }
          restorePageScroll(yHold);
          return;
        }
        state.detail = out.data.ticket;
        state.messages = out.data.messages || [];
        state.staffRoles =
          out.data.staffRoles && typeof out.data.staffRoles === "object" ? out.data.staffRoles : {};
        if (out.data.guildId) state.guildId = String(out.data.guildId);
        state.seenMessageIds = {};
        state.deletedMessageIds = {};
        state.messages.forEach(function (m) {
          if (m && m.id) state.seenMessageIds[m.id] = true;
          if (m && m.authorId && m.authorRoleName) {
            rememberStaffRole(m.authorId, m.authorRoleId, m.authorRoleName, m.authorRoleKey);
          }
          if (m && m.authorId && m.authorAvatarUrl) {
            rememberUserAvatar(m.authorId, m.authorAvatarUrl, m.authorName);
          }
        });
        Object.keys(state.staffRoles || {}).forEach(function (uid) {
          var role = state.staffRoles[uid];
          if (role) rememberStaffRole(uid, role.id, role.name, role.key);
        });
        state.composeOpen = false;
        setStatus("");
        withPageScrollPreserved(function () {
          refreshChatPane();
        });
        restorePageScroll(yHold);
        applyPendingReplyAfterOpen();
        settleRateDockSoon();
        sendTicketPresence({ force: true });
        requestAnimationFrame(function () {
          restorePageScroll(yHold);
          scrollChatBottom(true);
          hydrateContentRefs(state.messages);
          queueMissingAvatarsFromMessages(state.messages);
        });
        window.setTimeout(function () {
          restorePageScroll(yHold);
        }, 80);
        if (state.detail && state.detail.userId) {
          queueContentResolve({ userIds: [String(state.detail.userId)] });
        }
        if (state.detail && state.detail.claimedBy) {
          var claimId = String(state.detail.claimedBy);
          if (!isInvisibleOrEmptyPersonName(state.detail.claimedByName)) {
            rememberMentionName("user", claimId, state.detail.claimedByName);
          }
          queueContentResolve({ userIds: [claimId] });
        }
        if (state.detail && state.detail.closedBy) {
          var closeId = String(state.detail.closedBy);
          if (!isInvisibleOrEmptyPersonName(state.detail.closedByName)) {
            rememberMentionName("user", closeId, state.detail.closedByName);
          }
          queueContentResolve({ userIds: [closeId] });
        }
        if (state.detail && state.detail.permissions && state.detail.permissions.canUseCommands) {
          void ensureCommandCatalog();
        } else if (isStaffMode && state.staffCategories.length) {
          void ensureCommandCatalog();
        }
      })
      .catch(function (err) {
        if (seq !== state.openTicketSeq || state.selectedId !== id) return;
        var aborted = err && (err.name === "AbortError" || err.code === 20);
        if (attempt < 5) {
          return new Promise(function (resolve) {
            window.setTimeout(resolve, 400 * (attempt + 1));
          }).then(function () {
            return openTicket(id, quiet, { attempt: attempt + 1 });
          });
        }
        /* notifApiErr1: abort dopo retry → silenzioso se quiet (open da notifica) */
        if (aborted || quiet) {
          restorePageScroll(yHold);
          return;
        }
        setStatus("Errore di rete.", true);
        restorePageScroll(yHold);
      });
  }

  function scrollChatBottom(force) {
    var log = byId("vc-wt-chat-log");
    if (!log) return;
    var nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
    if (force || nearBottom) {
      requestAnimationFrame(function () {
        log.scrollTop = log.scrollHeight;
      });
    }
  }

  function appendMessage(msg, ticket) {
    if (!msg || !msg.id) return;
    if (state.deletedMessageIds[msg.id]) return;
    if (state.seenMessageIds[msg.id]) return;
    if (!msg.pending) {
      try {
        var content = String(msg.content || "").trim();
        var authorId = String(msg.authorId || "").trim();
        if (content) {
          var pendingHit = (state.messages || []).find(function (m) {
            if (!m || !m.pending) return false;
            if (authorId && String(m.authorId || "") && String(m.authorId || "") !== authorId) {
              return false;
            }
            return String(m.content || "").trim() === content;
          });
          if (pendingHit && pendingHit.id) removePendingMessage(pendingHit.id);
        }
        var created = Date.parse(String(msg.createdAt || "")) || Date.now();
        if (content && authorId) {
          var nearDup = (state.messages || []).some(function (m) {
            if (!m || m.pending || String(m.id) === String(msg.id)) return false;
            if (String(m.authorId || "") !== authorId) return false;
            if (String(m.content || "").trim() !== content) return false;
            var t = Date.parse(String(m.createdAt || "")) || 0;
            return Math.abs(created - t) < 15000;
          });
          if (nearDup) return;
        }
      } catch (ePend) {}
    }
    state.seenMessageIds[msg.id] = true;
    state.messages.push(msg);
    if (msg.authorId && msg.authorRoleName) {
      rememberStaffRole(msg.authorId, msg.authorRoleId, msg.authorRoleName, msg.authorRoleKey);
    }
    if (ticket) state.detail = mergeTicketDetail(ticket);
    var log = byId("vc-wt-chat-log");
    if (log) {
      log.insertAdjacentHTML("beforeend", messageHtml(msg));
      var node = log.querySelector('[data-msg-id="' + msg.id + '"]');
      if (node) {
        wireMessageReactions(node);
        wireMessageTools(node);
      }
      scrollChatBottom(false);
    } else {
      renderShell();
    }
    if (ticket) refreshTicketInList(ticket);
    if (msg && msg.content) hydrateContentRefs([msg]);
  }

  function mergeTicketDetail(ticket, opts) {
    opts = opts || {};
    if (!ticket) return ticket;
    var prev = state.detail || {};
    if (prev.id && ticket.id && prev.id !== ticket.id) return ticket;

    var perms = null;
    if (opts.trustPermissions && ticket.permissions) {
      perms = Object.assign({}, ticket.permissions);
    } else if (prev.permissions) {
            perms = Object.assign({}, prev.permissions);
    } else if (ticket.permissions) {
      perms = Object.assign({}, ticket.permissions);
    }

    if (perms) {
      var closed = String(ticket.status || "") === "closed";
      var claimer = String(ticket.claimedBy || "").trim();
      var viewer = String(state.viewerId || "");
      var isOwner = String(ticket.userId || "") === viewer;
      var alreadyRated = Boolean(ticket.ratingAt) || ticket.ratingStafferScore != null;
      var rateableId =
        String(ticket.rateableStafferId || ticket.ratedStafferId || ticket.claimedBy || "").trim() ||
        "";
      var closeRequested = Boolean(ticket.closeRequestedAt);
      var isStaffViewer = Boolean(perms.isStaffViewer) && !isOwner;
      var isHighStaff = perms.isHighStaff === true || perms.canSwitchCategory === true;
      var bypassWrite = perms.canBypassClaimWrite === true;
      if (perms.canBypassClaimWrite == null) {
        bypassWrite = Boolean(isHighStaff);
      }
      var bypassManage = Boolean(isHighStaff || bypassWrite);
      var staffPanel = Boolean(!closed && isStaffViewer);

      perms.canRespondCloseRequest = Boolean(!closed && isOwner && closeRequested);
      perms.canRate = Boolean(closed && isOwner && !alreadyRated && rateableId);

      if (isOwner) {
        perms.canClaim = false;
        perms.canUnclaim = false;
        perms.canClose = false;
        perms.canAddUsers = false;
        perms.canRemoveUsers = false;
        perms.canSwitchCategory = false;
        perms.canRename = false;
        perms.canCloseRequest = false;
        perms.canTransfer = false;
        perms.canUseCommands = false;
        perms.canReply = Boolean(!closed);
        perms.isStaffViewer = false;
        perms.canBypassClaimWrite = false;
      } else if (isStaffViewer) {
        perms.canClaim = Boolean(staffPanel && !claimer);
        perms.canUnclaim = Boolean(staffPanel && claimer && claimer === viewer);
        perms.canClose = Boolean(staffPanel && (bypassManage || !claimer || claimer === viewer));
        perms.canTransfer = Boolean(staffPanel && claimer && (bypassManage || claimer === viewer));
        perms.canCloseRequest = Boolean(staffPanel && (bypassManage || (claimer && claimer === viewer)));
        perms.canAddUsers = Boolean(staffPanel);
        perms.canRemoveUsers = Boolean(staffPanel);
        perms.canSwitchCategory = Boolean(staffPanel && isHighStaff);
        perms.canRename = Boolean(staffPanel && isHighStaff);
        perms.canReply = Boolean(staffPanel && ((claimer && claimer === viewer) || bypassWrite));
        perms.canUseCommands = Boolean(perms.canReply && String(ticket.category || "") === "partnership");
        perms.isStaffViewer = true;
        perms.isHighStaff = Boolean(isHighStaff);
        perms.canBypassClaimWrite = Boolean(bypassWrite);
      } else {
        perms.canClaim = false;
        perms.canUnclaim = false;
        perms.canReply = Boolean(!closed && (perms.isAddedViewer || perms.canReply));
      }
    }

    return Object.assign({}, ticket, perms ? { permissions: perms } : {});
  }

  function effectivePermissions() {
    var perms = (state.detail && state.detail.permissions) || {};
    if (typeof perms.canUseCommands === "boolean") return perms;
    if (!state.detail) return perms;
    if (isStaffMode && state.staffCategories.length) {
      var cat = String(state.detail.category || "").trim();
            if (cat === "partnership" && state.staffCategories.indexOf(cat) >= 0) {
        return Object.assign({}, perms, { canUseCommands: perms.canReply !== false });
      }
    }
    return perms;
  }

  function readComposerContext(el) {
    if (!el) return null;
    var raw = "";
    if (isRichInput(el)) {
      raw = textBeforeCaret(el).replace(/\u00a0/g, " ");
      if (!raw.trim()) raw = serializeRichInput(el).replace(/\u00a0/g, " ");
    } else {
      var start = typeof el.selectionStart === "number" ? el.selectionStart : String(el.value || "").length;
      raw = String(el.value || "").slice(0, start);
    }
    var line = activeInputLine(raw);
    /* Channel solo con # singolo (non ## heading / markdown). */
    var channel = line.match(/(^|[^#])#([^\s#]*)$/);
    if (channel) {
      return { kind: "channel", q: channel[2] || "", line: line };
    }
    var mention = line.match(/@([^\s@]*)$/);
    if (mention) {
      return { kind: "mention", q: mention[1] || "", line: line };
    }
    var perms = effectivePermissions();
    var cmd = line.match(/^([+!/])([^\s]*)$/);
    if (cmd && perms.canUseCommands) {
      return { kind: "command", q: cmd[2] || "", prefix: cmd[1], line: line };
    }
    return null;
  }

  function scheduleComposerSuggest(el, immediate) {
    if (!el) return;
    if (state.composerSuggestTimer) {
      clearTimeout(state.composerSuggestTimer);
      state.composerSuggestTimer = null;
    }
    if (immediate) {
      onRichInputMaybeMention(el);
      return;
    }
    state.composerSuggestTimer = setTimeout(function () {
      state.composerSuggestTimer = null;
      onRichInputMaybeMention(el);
    }, 60);
  }

  function viewerIsOnTicket(ticket) {
    var vid = String(state.viewerId || "").trim();
    if (!vid || !ticket) return false;
    if (String(ticket.userId || "") === vid) return true;
    var added = Array.isArray(ticket.addedUsers) ? ticket.addedUsers : [];
    for (var i = 0; i < added.length; i++) {
      if (String((added[i] && added[i].id) || "") === vid) return true;
    }
    return false;
  }

    function ticketMatchesCurrentList(ticket) {
    if (!ticket || !ticket.id) return false;
    var status = String(ticket.status || "");
    var isOpenish = status === "open" || status === "claimed";
    var isClosed = status === "closed";
    var claimer = String(ticket.claimedBy || "").trim();
    var cat = String(ticket.category || "").trim();
    var filter = String(state.filter || "all");

    if (isStaffMode) {
      if (state.categoryFilter && cat !== String(state.categoryFilter)) return false;
      if (
        state.staffCategories &&
        state.staffCategories.length &&
        state.staffCategories.indexOf(cat) < 0
      ) {
        return false;
      }
      if (filter === "closed") return isClosed;
      if (filter === "open") return isOpenish;
      if (filter === "unclaimed") return status === "open" && !claimer;
      if (filter === "mine") return isOpenish && claimer === String(state.viewerId || "");
      return true;
    }

    if (!viewerIsOnTicket(ticket)) return false;
    if (filter === "closed") return isClosed;
    if (filter === "open") return isOpenish;
    return true;
  }

  function refreshTicketInList(ticket) {
    if (!ticket || !ticket.id) return;
    ticket = mergeTicketDetail(ticket);
    var matches = ticketMatchesCurrentList(ticket);
    var found = false;
    if (!matches) {
      state.tickets = state.tickets.filter(function (t) {
        if (t.id === ticket.id) {
          found = true;
          return false;
        }
        return true;
      });
      if (found) refreshListPane();
      if (state.detail && state.detail.id === ticket.id) {
        state.detail = ticket;
        refreshChatChrome();
      }
      return;
    }
    state.tickets = state.tickets.map(function (t) {
      if (t.id === ticket.id) {
        found = true;
        return ticket;
      }
      return t;
    });
    if (!found) {
            scheduleLoadListQuiet();
      if (state.detail && state.detail.id === ticket.id) {
        state.detail = ticket;
        refreshChatChrome();
      }
      return;
    }
    sortTicketsInPlace(state.tickets);
    refreshListPane();
    if (state.detail && state.detail.id === ticket.id) {
      state.detail = ticket;
      refreshChatChrome();
    }
  }

  function ticketListIconHtml() {
    return (
      '<span class="vc-wt-item__avatar vc-wt-item__avatar--icon" aria-hidden="true">' +
      '<i class="fa fa-ticket"></i></span>'
    );
  }

  function ticketDisplayName(t) {
    var name = String((t && (t.displayName || t.authorName)) || "").trim();
    if (name && name !== "Utente Discord") return name.replace(/#\d+$/, "");
    var raw = String((t && (t.channelName || t.subject)) || "").trim();
    if (raw) {
      var sep = raw.lastIndexOf("᲼");
      if (sep >= 0) raw = raw.slice(sep + 1).trim();
      raw = raw.replace(/^(supporto|partnership|highstaff|high|perks)[\s—–\-]+/i, "").trim();
      raw = raw.replace(/[\s—–\-]+/g, " ").replace(/\s+/g, " ").trim();
      if (raw) return raw;
    }
    if (t && t.ticketNumber) return "Ticket " + t.ticketNumber;
    return "Ticket";
  }

  function ticketListHtml() {
    if (!state.tickets.length) {
      return '<div class="vc-wt-empty"><p>Nessun ticket qui.</p></div>';
    }
    return state.tickets
      .map(function (t) {
        var active = t.id === state.selectedId ? " is-active" : "";
        return (
          '<button type="button" class="vc-wt-item' +
          active +
          " " +
          statusClass(t) +
          '" data-ticket-id="' +
          esc(t.id) +
          '">' +
          ticketListIconHtml() +
          '<span class="vc-wt-item__body">' +
          '<span class="vc-wt-item__top"><span class="vc-wt-item__num">#' +
          esc(t.ticketNumber) +
          '</span><span class="vc-wt-item__badge">' +
          esc(statusLabel(t)) +
          "</span></span>" +
          '<span class="vc-wt-item__subject">' +
          esc(ticketDisplayName(t)) +
          "</span>" +
          '<span class="vc-wt-item__preview">' +
          formatMessageContent(ticketListPreviewText(t), {
            still: true,
            singleLine: true,
            plainPreview: true,
            ticket: t,
          }) +
          "</span>" +
          '<span class="vc-wt-item__meta">' +
          esc(formatTime(t.lastMessageAt || t.createdAt)) +
          "</span></span></button>"
        );
      })
      .join("");
  }

  function ticketListPagerHtml() {
    var total = Math.max(0, Number(state.listTotal) || 0);
    var totalPages = Math.max(1, Number(state.listTotalPages) || 1);
    var page = Math.max(1, Math.min(totalPages, Number(state.listPage) || 1));
    if (total <= 0 || totalPages <= 1) {
      if (total <= 0) return "";
      return (
        '<div class="vc-wt-pager" aria-label="Paginazione ticket">' +
        '<span class="vc-wt-pager__meta">' +
        esc(String(total)) +
        (total === 1 ? " ticket" : " ticket") +
        "</span></div>"
      );
    }
    var prevDisabled = page <= 1 ? " disabled" : "";
    var nextDisabled = page >= totalPages ? " disabled" : "";
    var mp = window.__vcMiniPager;
    if (mp && typeof mp.html === "function") {
      return mp.html(page, totalPages, { aria: "Paginazione ticket" }).replace(
        'class="vc-mini-pager"',
        'class="vc-wt-pager vc-mini-pager"'
      );
    }
    return (
      '<div class="vc-wt-pager" aria-label="Paginazione ticket">' +
      '<button type="button" class="vc-wt-pager__btn" data-list-page="' +
      (page - 1) +
      '"' +
      prevDisabled +
      ' aria-label="Pagina precedente"><i class="fa fa-chevron-left" aria-hidden="true"></i></button>' +
      '<span class="vc-wt-pager__meta">' +
      esc(String(page)) +
      " / " +
      esc(String(totalPages)) +
      "</span>" +
      '<button type="button" class="vc-wt-pager__btn" data-list-page="' +
      (page + 1) +
      '"' +
      nextDisabled +
      ' aria-label="Pagina successiva"><i class="fa fa-chevron-right" aria-hidden="true"></i></button>' +
      "</div>"
    );
  }

  function goToListPage(page) {
    var totalPages = Math.max(1, Number(state.listTotalPages) || 1);
    var next = Math.max(1, Math.min(totalPages, Math.floor(Number(page) || 1)));
    if (next === Number(state.listPage)) return;
    state.listPage = next;
    loadList({ soft: true });
  }

  function scopeSwitcherHtml() {
    if (!hasStaffInboxAccess()) return "";
    var userOn = state.viewMode !== "staff";
    return (
      '<div class="vc-wt-scope-dock">' +
      '<div class="vc-wt-scope-bar vc-notif-scope-bar" role="tablist" aria-label="Vista ticket">' +
      '<button type="button" role="tab" class="vc-notif-scope-bar__btn' +
      (userOn ? " is-active" : "") +
      '" data-view-mode="user" aria-selected="' +
      (userOn ? "true" : "false") +
      '"><i class="fa fa-user" aria-hidden="true"></i><span>Personali</span></button>' +
      '<button type="button" role="tab" class="vc-notif-scope-bar__btn' +
      (!userOn ? " is-active" : "") +
      '" data-view-mode="staff" aria-selected="' +
      (!userOn ? "true" : "false") +
      '"><i class="fa fa-inbox" aria-hidden="true"></i><span>Staff</span></button>' +
      "</div></div>"
    );
  }

  function filtersHtml() {
    var filters = isStaffMode
      ? [
          { id: "all", label: "Tutti" },
          { id: "open", label: "Aperti" },
          { id: "unclaimed", label: "Liberi" },
          { id: "mine", label: "Miei" },
          { id: "closed", label: "Chiusi" },
        ]
      : [
          { id: "all", label: "Tutti" },
          { id: "open", label: "Aperti" },
          { id: "closed", label: "Chiusi" },
        ];
    var catLabels = { supporto: "Supporto", partnership: "Partnership", high: "High Staff", perks: "Perks" };
    var statusRow =
      '<div class="vc-wt-filter-group">' +
      '<span class="vc-wt-filter-group__label">Stato</span>' +
      '<div class="vc-wt-filter-group__seg" role="group" aria-label="Filtro stato">' +
      filters
        .map(function (f) {
          return (
            '<button type="button" class="vc-wt-chip' +
            (state.filter === f.id ? " is-active" : "") +
            '" data-filter="' +
            esc(f.id) +
            '">' +
            esc(f.label) +
            "</button>"
          );
        })
        .join("") +
      "</div></div>";
    var catRow = "";
    if (isStaffMode && state.staffCategories.length) {
      catRow =
        '<div class="vc-wt-filter-group">' +
        '<span class="vc-wt-filter-group__label">Categorie</span>' +
        '<div class="vc-wt-filter-group__seg" role="group" aria-label="Filtro categorie">' +
        '<button type="button" class="vc-wt-chip' +
        (state.categoryFilter ? "" : " is-active") +
        '" data-cat-filter="">Tutte</button>' +
        state.staffCategories
          .map(function (id) {
            return (
              '<button type="button" class="vc-wt-chip' +
              (state.categoryFilter === id ? " is-active" : "") +
              '" data-cat-filter="' +
              esc(id) +
              '">' +
              esc(catLabels[id] || id) +
              "</button>"
            );
          })
          .join("") +
        "</div></div>";
    }
    var cta = "";
    if (!isStaffMode) {
      cta =
        '<div class="vc-wt-filter-menu__toolbar">' +
        '<button type="button" class="vc-wt-new-btn vc-wt-new-btn--cta" data-act="compose" title="Nuovo ticket">' +
        '<i class="fa fa-plus" aria-hidden="true"></i><span>Nuovo ticket</span></button>' +
        "</div>";
    }
    return (
      '<div class="vc-wt-filter-menu" aria-label="Filtri ticket">' +
      '<div class="vc-wt-filter-menu__main">' +
      '<div class="vc-wt-filter-menu__rows">' +
      statusRow +
      catRow +
      "</div>" +
      cta +
      "</div></div>"
    );
  }

  function rememberStaffRole(userId, roleId, roleName, roleKey) {
    var id = String(userId || "").trim();
    var name = String(roleName || "").trim();
    if (!id || !name) return;
    if (!state.staffRoles) state.staffRoles = {};
    state.staffRoles[id] = {
      id: String(roleId || "").trim() || null,
      name: name,
      key: String(roleKey || "").trim() || null,
    };
  }

  function resolveStaffRoleName(userId) {
    var id = String(userId || "").trim();
    if (!id || !state.staffRoles) return "";
    var role = state.staffRoles[id];
    return role && role.name ? String(role.name) : "";
  }

  function resolveStaffRoleKey(userId) {
    var id = String(userId || "").trim();
    if (!id || !state.staffRoles) return "";
    var role = state.staffRoles[id];
    return role && role.key ? String(role.key) : "";
  }

  function authorRoleBadgeHtml(m, kind) {
    if (kind === "bot") {
      return '<span class="vc-wt-msg__role vc-wt-msg__role--bot">Bot</span>';
    }
    var name = String((m && m.authorRoleName) || "").trim();
    var key = String((m && m.authorRoleKey) || "").trim();
        if (kind === "user" || isTicketCustomerMessage(m)) {
      if (!name) {
        name = resolveStaffRoleName(m.authorId);
        if (!key) key = resolveStaffRoleKey(m.authorId);
      }
      if (!name || /^staff$/i.test(name)) return "";
      var cCls = "vc-wt-msg__role";
      if (key) cCls += " vc-wt-msg__role--" + key;
      else if (/^member$/i.test(name)) cCls += " vc-wt-msg__role--member";
      return '<span class="' + cCls + '" title="Ruolo">' + esc(name) + "</span>";
    }
    if (!name) {
      name = resolveStaffRoleName(m.authorId);
      if (!key) key = resolveStaffRoleKey(m.authorId);
    }
        if (!name || /^staff$/i.test(name)) return "";
    var cls = "vc-wt-msg__role";
    if (key) cls += " vc-wt-msg__role--" + key;
    else if (kind === "staff") cls += " vc-wt-msg__role--staff";
    var title = kind === "staff" ? "Ruolo staff" : "Ruolo";
    return (
      '<span class="' +
      cls +
      '" title="' +
      esc(title) +
      '">' +
      esc(name) +
      "</span>"
    );
  }

  function guildDiscordChannelUrl(channelId) {
    var gid = String(state.guildId || cfg.guildId || "").trim();
    var cid = String(channelId || "").trim();
    if (cid === "1442569095068254219") return "/tickets/";
    if (!gid || !cid) return "";
    return "https://discord.com/channels/" + encodeURIComponent(gid) + "/" + encodeURIComponent(cid);
  }

  function userProfileUrl(userId) {
    var id = String(userId || "").trim();
    if (!id) return "";
    return "/user/?id=" + encodeURIComponent(id);
  }

  function rememberMentionName(type, id, name) {
    if (!id || !name) return;
    if (!state.mentionNames) state.mentionNames = {};
    var cleaned = String(name);
    if (String(type) === "channel" && window.VcEmojiRender && window.VcEmojiRender.sanitizeDiscordChannelName) {
      cleaned = window.VcEmojiRender.sanitizeDiscordChannelName(cleaned) || cleaned;
    }
    state.mentionNames[String(type) + ":" + String(id)] = cleaned;
  }

  function resolveMentionName(type, id) {
    var key = String(type) + ":" + String(id);
    if (state.mentionNames && state.mentionNames[key]) return state.mentionNames[key];
    if (type === "user") {
      if (state.detail && String(state.detail.userId) === String(id) && state.detail.authorName) {
        return state.detail.authorName;
      }
      if (state.detail && String(state.detail.claimedBy) === String(id)) {
        var cn = state.detail.claimedByName;
        if (!isInvisibleOrEmptyPersonName(cn)) return String(cn).trim();
      }
      if (state.detail && String(state.detail.closedBy) === String(id)) {
        var cln = state.detail.closedByName;
        if (!isInvisibleOrEmptyPersonName(cln)) return String(cln).trim();
      }
      var added = (state.detail && state.detail.addedUsers) || [];
      for (var a = 0; a < added.length; a += 1) {
        var au = added[a];
        if (!au) continue;
        if (String(au.id || au.userId || "") === String(id) && !isInvisibleOrEmptyPersonName(au.name || au.username)) {
          return String(au.name || au.username).trim();
        }
      }
      for (var i = 0; i < (state.messages || []).length; i += 1) {
        var m = state.messages[i];
        if (m && String(m.authorId) === String(id) && m.authorName && !isInvisibleOrEmptyPersonName(m.authorName)) {
          return String(m.authorName).trim();
        }
      }
      return "utente";
    }
    if (type === "channel") return "canale";
    return "ruolo";
  }

  function normalizeContentUrl(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    if (/^\/\//.test(u)) return "https:" + u;
    return u;
  }

  function parseDiscordContentUrl(raw) {
    var s = normalizeContentUrl(raw);
    var m = s.match(/discord(?:app)?\.com\/channels\/(\d{5,32})\/(\d{5,32})(?:\/(\d{5,32}))?/i);
    if (!m) return null;
    return { guildId: m[1], channelId: m[2], messageId: m[3] || "" };
  }

  function isLikelyImageUrl(url) {
    var u = normalizeContentUrl(url);
    if (!/^https?:\/\//i.test(u)) return false;
    if (/\.(gif|png|jpe?g|webp)(\?|$)/i.test(u)) return true;
    return /cdn\.discordapp\.com\/attachments|media\.discordapp\.net\/attachments|media\.tenor\.com|tenor\.com\/.*\.gif|giphy\.com\/media/i.test(u);
  }

  function shortUrlLabel(url) {
    var u = normalizeContentUrl(url);
    if (u.length <= 56) return u;
    return u.slice(0, 24) + "…" + u.slice(-22);
  }

  function formatAutolinkUrl(url) {
    url = normalizeContentUrl(url);
    var cached = state.linkCache[url];
    if (cached && cached.kind === "image") {
      return (
        '<a class="vc-wt-msg__img-inline" href="' +
        esc(url) +
        '" target="_blank" rel="noopener noreferrer"><img src="' +
        esc(url) +
        '" alt="" loading="lazy" decoding="async" /></a>'
      );
    }
    if (cached && cached.kind === "message") return renderDiscordMessageEmbed(cached);
    if (cached && cached.kind === "channel") {
      return (
        '<a class="vc-wt-discord-link vc-wt-discord-link--channel" href="' +
        esc(url) +
        '" target="_blank" rel="noopener noreferrer">#' +
        esc(cached.channelName || "canale") +
        "</a>"
      );
    }
    if (isLikelyImageUrl(url)) {
      return (
        '<a class="vc-wt-msg__img-inline" href="' +
        esc(url) +
        '" target="_blank" rel="noopener noreferrer"><img src="' +
        esc(url) +
        '" alt="" loading="lazy" decoding="async" /></a>'
      );
    }
    if (!cached && parseDiscordContentUrl(url)) queueContentResolve({ urls: [url] });
    return (
      '<a class="vc-wt-link" href="' +
      esc(url) +
      '" target="_blank" rel="noopener noreferrer">' +
      esc(shortUrlLabel(url)) +
      "</a>"
    );
  }

    function cleanImportedTranscriptPreview(raw) {
    var s = String(raw || "");
    s = s.replace(/\\n/gi, " ");
    s = s.replace(/\[Embed\s+\d+\]/gi, " ");
    s = s.replace(/\[Embed\s+(?:image|thumb)\]\s*\S+/gi, " ");
    s = s.replace(/\[Attachment\]\s*\S+/gi, " ");
    s = s.replace(/\[Sticker\][^\n]*/gi, " ");
    s = s.replace(/\b(?:Title|Titolo|Description|Descrizione|Author|Autore|Footer|Fields?|Campo)\s*:\s*/gi, " ");
    s = s.replace(/<(a?):([a-zA-Z0-9_]+):(\d{5,32})>/g, " ");
    s = s.replace(/<@!?&?#?\d{5,32}>/g, " ");
    s = s.replace(/<\s*(\d{15,22})\s*>/g, " ");
    s = s.replace(/\*Nessun contenuto messaggio\*/gi, " ");
    s = s.replace(/:\w+:/g, " ");
    s = s.replace(/https?:\/\/\S+/gi, " ");
    s = s.replace(/\s*[·•|]\s*/g, " · ");
    s = s.replace(/(?:\s*·\s*)+/g, " · ");
    s = s.replace(/^\s*·\s*|\s*·\s*$/g, "");
    return s.replace(/\s+/g, " ").trim();
  }

  function ticketPreviewPersonName(t) {
    if (!t) return "";
    var candidates = [
      t.authorName,
      t.claimedByName,
      t.closedByName,
      t.lastAuthorName,
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var n = String(candidates[i] || "")
        .replace(/^@+/, "")
        .trim();
      if (!n) continue;
      if (isInvisibleOrEmptyPersonName(n)) continue;
      if (/^utente$/i.test(n)) continue;
      return n;
    }
    return "";
  }

  function ticketListPreviewText(t) {
    var raw = String((t && t.lastMessagePreview) || "").trim();
    raw = cleanImportedTranscriptPreview(raw);
    var person = ticketPreviewPersonName(t);
    if (person) {
      raw = raw.replace(/@utente\b/gi, "@" + person);
    } else {
      raw = raw.replace(/\s*@utente\b/gi, "");
    }
        raw = raw.replace(/\s*@(?:ruolo|canale)\b/gi, "");
    raw = raw.replace(/\s*#canale\b/gi, "");
    raw = raw.replace(/\s+/g, " ").trim();
    if (!raw || isUselessMessageContent(raw)) {
      return String((t && (t.categoryLabel || t.subject)) || "Ticket").trim();
    }
    return raw.length > 120 ? raw.slice(0, 119) + "…" : raw;
  }

    var UNICODE_EMOJI_SHORTCODES = {
    white_small_square: "▫",
    black_small_square: "▪",
    white_medium_small_square: "◽",
    black_medium_small_square: "◾",
    white_medium_square: "⬜",
    black_medium_square: "⬛",
    white_large_square: "⬜",
    black_large_square: "⬛",
    small_orange_diamond: "🔸",
    small_blue_diamond: "🔹",
    large_orange_diamond: "🔶",
    large_blue_diamond: "🔷",
    arrow_forward: "▶",
    arrow_backward: "◀",
    arrow_up: "⬆",
    arrow_down: "⬇",
    arrow_right: "➡",
    arrow_left: "⬅",
    heavy_check_mark: "✅",
    x: "❌",
    warning: "⚠",
    informational: "ℹ",
    star: "⭐",
    sparkles: "✨",
    tada: "🎉",
    wave: "👋",
    thumbsup: "👍",
    thumbsdown: "👎",
    eyes: "👀",
    lock: "🔒",
    unlock: "🔓",
    pencil: "✏",
    memo: "📝",
    clipboard: "📋",
    speech_balloon: "💬",
    bump: "🔨",
  };

  var KNOWN_EMOJI_FALLBACKS = {
    vc_ticket: { id: "1482535175283019888", name: "VC_Ticket", animated: false },
    vcticket: { id: "1482535175283019888", name: "VC_Ticket", animated: false },
    vc_claim: { id: "1478517202016669887", name: "VC_claim", animated: false },
    vcclaim: { id: "1478517202016669887", name: "VC_claim", animated: false },
    vc_close: { id: "1478517239136256020", name: "VC_close", animated: false },
    vcclose: { id: "1478517239136256020", name: "VC_close", animated: false },
    vc_open: { id: "1478517277279129712", name: "VC_open", animated: false },
    vcopen: { id: "1478517277279129712", name: "VC_open", animated: false },
    vc_file: { id: "1478515880722698300", name: "VC_file", animated: false },
    vcfile: { id: "1478515880722698300", name: "VC_file", animated: false },
    vc_alert: { id: "1482706673176150077", name: "VC_Alert", animated: true },
    vcalert: { id: "1482706673176150077", name: "VC_Alert", animated: true },
    vc_attention: { id: "1482534443632558151", name: "VC_Attention", animated: false },
    vcattention: { id: "1482534443632558151", name: "VC_Attention", animated: false },
    vc_arrow: { id: "1482706699365257397", name: "VC_Arrow", animated: true },
    vcarrow: { id: "1482706699365257397", name: "VC_Arrow", animated: true },
    vc_cross: { id: "1482532424570376253", name: "VC_Cross", animated: true },
    vccross: { id: "1482532424570376253", name: "VC_Cross", animated: true },
    vc_verified: { id: "1482532479637127188", name: "VC_Verified", animated: true },
    vcverified: { id: "1482532479637127188", name: "VC_Verified", animated: true },
    thankyou: { id: "1329504268369002507", name: "ThankYou", animated: true },
    vc_thankyou: { id: "1330186319673950401", name: "VC_ThankYou", animated: true },
    vcthankyou: { id: "1330186319673950401", name: "VC_ThankYou", animated: true },
    loading: { id: "1443934440614264924", name: "loading", animated: true },
    reportmessage: { id: "1443670575376765130", name: "reportmessage", animated: false },
  };

  function resolveClaimFallbackUserId() {
    return String((state.detail && state.detail.claimedBy) || "").trim();
  }

  function resolveCloseFallbackUserId() {
    return String(
      (state.detail && (state.detail.closedBy || state.detail.claimedBy)) || "",
    ).trim();
  }

  function isInvisibleOrEmptyPersonName(name) {
    return !String(name || "")
      .replace(/[\u200B-\u200D\uFEFF\u3164\u115F\u1160\u2800\u00A0\u180E\u2060\u318D\uFFA0\u10FC\u{1CBC}\u17B4\u17B5]/gu, "")
      .replace(/^@+/, "")
      .trim();
  }

    function resolveClaimFallbackName(hint) {
    var fromTicket = state.detail && state.detail.claimedByName;
    if (!isInvisibleOrEmptyPersonName(fromTicket)) return String(fromTicket).trim();
    var uid = resolveClaimFallbackUserId();
    if (uid) {
      var cached = state.mentionNames && state.mentionNames["user:" + uid];
      if (!isInvisibleOrEmptyPersonName(cached)) return String(cached).trim();
      for (var i = 0; i < (state.messages || []).length; i += 1) {
        var m = state.messages[i];
        if (m && String(m.authorId) === String(uid) && !isInvisibleOrEmptyPersonName(m.authorName)) {
          return String(m.authorName).trim();
        }
      }
      if (!(state.userResolveAttempted && state.userResolveAttempted[uid])) {
        queueContentResolve({ userIds: [uid] });
      }
    }
    if (!isInvisibleOrEmptyPersonName(hint)) {
      return String(hint || "")
        .replace(/^@+/, "")
        .trim();
    }
    return "";
  }

    function resolveCloseFallbackName(hint) {
    var fromClosed = state.detail && state.detail.closedByName;
    if (!isInvisibleOrEmptyPersonName(fromClosed)) return String(fromClosed).trim();
    var uid = resolveCloseFallbackUserId();
    if (uid) {
      var resolved = resolveMentionName("user", uid);
      if (resolved && resolved !== "utente") return resolved;
      if (!(state.userResolveAttempted && state.userResolveAttempted[uid])) {
        queueContentResolve({ userIds: [uid] });
      }
    }
    var claimName = resolveClaimFallbackName(hint);
    if (!isInvisibleOrEmptyPersonName(claimName) && claimName !== "utente") return claimName;
    if (!isInvisibleOrEmptyPersonName(hint) && String(hint).trim().toLowerCase() !== "utente") {
      return String(hint || "")
        .replace(/^@+/, "")
        .trim();
    }
    return "";
  }

  function lookupGuildEmojiByName(name) {
    var n = String(name || "").trim().toLowerCase();
    if (!n) return null;
    var compact = n.replace(/_/g, "");
    var fallback = KNOWN_EMOJI_FALLBACKS[n] || KNOWN_EMOJI_FALLBACKS[compact] || null;
    var list = state.guildEmojis || [];
    var fuzzy = null;
    for (var i = 0; i < list.length; i += 1) {
      var em = list[i];
      if (!em || !em.id) continue;
      var en = String(em.name || "").toLowerCase();
      if (en === n) return em;
      if (!fuzzy && en.replace(/_/g, "") === compact) fuzzy = em;
    }
    if (fuzzy) return fuzzy;
    return fallback;
  }

  function guildEmojiImgHtml(emoji, still, size) {
    if (!emoji || !emoji.id) return "";
    var wantAnimated = Boolean(emoji.animated) && !still;
    var sz = size || (still ? 20 : 32);
    var url = customEmojiUrl(emoji.id, wantAnimated, sz);
    var label = ":" + String(emoji.name || "emoji") + ":";
    return (
      '<img class="vc-wt-inline-emoji' +
      (still ? " vc-wt-inline-emoji--sm" : "") +
      (wantAnimated ? " vc-wt-inline-emoji--animated" : "") +
      '" src="' +
      esc(url) +
      '" data-vc-emoji-id="' +
      esc(emoji.id) +
      '" data-vc-emoji-animated="' +
      (wantAnimated ? "1" : "0") +
      '" alt="' +
      esc(label) +
      '" title="' +
      esc(label) +
      '" loading="lazy" decoding="async" />'
    );
  }

    function replaceEmojiShortcodes(raw, stashFn, still, size) {
    return String(raw || "").replace(/:([a-zA-Z0-9_]{2,32}):/g, function (all, name) {
      var em = lookupGuildEmojiByName(name);
      if (em) {
        var html = guildEmojiImgHtml(em, still, size);
        return html && stashFn ? stashFn(html) : html || all;
      }
      var uni = UNICODE_EMOJI_SHORTCODES[String(name || "").toLowerCase()];
      if (uni) {
        return stashFn
          ? stashFn('<span class="vc-wt-unicode-emoji" aria-label="' + esc(all) + '">' + uni + "</span>")
          : uni;
      }
      return all;
    });
  }

    function withProtectedEmojiShortcodes(raw, fn) {
    var toks = [];
    var s = String(raw || "").replace(/:([a-zA-Z0-9_]{2,32}):/g, function (all) {
      var key = "\uE030SC" + toks.length + "\uE031";
      toks.push(all);
      return key;
    });
    s = fn(s);
    return String(s || "").replace(/\uE030SC(\d+)\uE031/g, function (_m, idx) {
      return toks[Number(idx)] || "";
    });
  }

  function stripDiscordMarkdown(raw) {
    return withProtectedEmojiShortcodes(raw, function (input) {
      var s = String(input || "");
      s = s.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
      s = s.replace(/```[\s\S]*?```/g, function (block) {
        return block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
      });
      s = s.replace(/^[ \t]{0,3}(#{1,3}|-#)[ \t]+/gm, "");
      s = s.replace(/^[ \t]{0,3}>[ \t]?/gm, "");
      s = s.replace(/\[([^\]]+)\]\(\s*<?https?:\/\/[^)\s>]+>?\s*\)/gi, "$1");
      s = s.replace(/``([^`\n]*)``/g, "$1");
      s = s.replace(/`([^`\n]*)`/g, "$1");
      s = s.replace(/`+/g, "");
      s = s.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
      s = s.replace(/\*\*(.+?)\*\*/g, "$1");
      s = s.replace(/__(.+?)__/g, "$1");
      s = s.replace(/~~(.+?)~~/g, "$1");
      s = s.replace(/\|\|(.+?)\|\|/g, "$1");
      s = s.replace(/(^|[^\*])\*(?!\*)([^*\n]+?)\*(?!\*)/g, "$1$2");
      s = s.replace(/(^|[^_])_(?!_)([^_\n]+?)_(?!_)/g, "$1$2");
      s = s.replace(/[*#]+/g, " ");
      return s.replace(/\s+/g, " ").trim();
    });
  }

  function escapeRegExp(s) {
    return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function collectKnownPlainMentionLabels() {
    var set = {};
    function add(n) {
      var s = String(n || "").trim();
      if (s.length < 2 || s.length > 64) return;
      if (/^sistema$/i.test(s)) return;
      set[s] = true;
      var base = s.split("#")[0].trim();
      if (base && base.length >= 2) set[base] = true;
    }
    if (state.detail) {
      add(state.detail.authorName);
      add(state.detail.claimedByName);
    }
    (state.messages || []).forEach(function (m) {
      if (!m || String(m.authorKind || "") === "system") return;
      add(m.authorName);
    });
    return Object.keys(set).sort(function (a, b) {
      return b.length - a.length;
    });
  }

  function plainUserMentionHtml(label, uid) {
    var name = String(label || "")
      .replace(/^@/, "")
      .replace(/[\u200B-\u200D\uFEFF\u3164\u115F\u1160\u2800\u00A0\u180E\u2060\u318D\uFFA0\u{1CBC}]/gu, "")
      .trim();
    var id = String(uid || "").trim() || resolveClaimFallbackUserId();
    if (isInvisibleOrEmptyPersonName(name)) {
      name = resolveClaimFallbackName("");
    }
    if (isInvisibleOrEmptyPersonName(name) && id) {
      name = resolveMentionName("user", id);
      if (name === "utente") name = "";
    }
    if (isInvisibleOrEmptyPersonName(name)) name = "utente";
    if (id) {
      var href = userProfileUrl(id);
      var roleName = resolveStaffRoleName(id);
      var userLabel = "@" + name;
      if (roleName && name !== "utente") userLabel += " · " + roleName;
      if (href) {
        return (
          '<a class="vc-wt-msg-mention vc-wt-msg-mention--user' +
          (roleName ? " is-staff" : "") +
          '" href="' +
          esc(href) +
          '" data-mention-user="' +
          esc(id) +
          '"' +
          (roleName ? ' title="' + esc(roleName) + '"' : ' title="Apri profilo"') +
          ">" +
          esc(userLabel) +
          "</a>"
        );
      }
    }
    return '<span class="vc-wt-msg-mention vc-wt-msg-mention--user" title="Menzione">@' + esc(name) + "</span>";
  }

    function replacePlainTranscriptMentions(raw, stashFn) {
    var s = String(raw || "");
    if (!s || (s.indexOf("@") < 0 && s.indexOf("#") < 0)) return s;

    s = s.replace(/@user-(\d{5,32})/g, function (_m, uid) {
      if (!(state.userResolveAttempted && state.userResolveAttempted[uid])) {
        queueContentResolve({ userIds: [uid] });
      }
      return stashFn(plainUserMentionHtml(resolveMentionName("user", uid), uid));
    });
    s = s.replace(/@role-(\d{5,32})/g, function (_m, rid) {
      if (!(state.roleResolveAttempted && state.roleResolveAttempted[rid])) {
        queueContentResolve({ roleIds: [rid] });
      }
      return stashFn(
        '<span class="vc-wt-msg-mention vc-wt-msg-mention--role" data-mention-role="' +
          esc(rid) +
          '">@' +
          esc(resolveMentionName("role", rid)) +
          "</span>",
      );
    });
    s = s.replace(/#channel-(\d{5,32})/g, function (_m, cid) {
      if (!(state.channelResolveAttempted && state.channelResolveAttempted[cid])) {
        queueContentResolve({ channelIds: [cid] });
      }
      var href = guildDiscordChannelUrl(cid);
      var label = resolveMentionName("channel", cid);
      return stashFn(
        (href
          ? '<a class="vc-wt-msg-mention vc-wt-msg-mention--channel" href="' +
            esc(href) +
            '" target="_blank" rel="noopener noreferrer">'
          : '<span class="vc-wt-msg-mention vc-wt-msg-mention--channel">') +
          "#" +
          esc(label) +
          (href ? "</a>" : "</span>"),
      );
    });
    s = s.replace(/@(everyone|here)\b/gi, function (_m, kind) {
      return stashFn(
        '<span class="vc-wt-msg-mention vc-wt-msg-mention--role">@' + esc(String(kind).toLowerCase()) + "</span>",
      );
    });

        s = s.replace(
      /(^|[^\w/<])@([\u200B-\u200D\uFEFF\u3164\u115F\u1160\u2800\u00A0\u180E\u2060\u318D\uFFA0\u10FC\u{1CBC}\u17B4\u17B5]+)(?=$|\s|[.,!?;:)\]\}])/gu,
      function (_m, pre) {
        return pre + stashFn(plainUserMentionHtml(resolveClaimFallbackName(""), resolveClaimFallbackUserId()));
      },
    );

        s = s.replace(
      /(preso in carico da|claimato da|assegnato a|taken over by|claimed by)\s+@([^\n<]*)/gi,
      function (_m, lead, rest) {
        return (
          lead +
          " " +
          stashFn(plainUserMentionHtml(resolveClaimFallbackName(rest), resolveClaimFallbackUserId()))
        );
      },
    );

        s = s.replace(
      /@([^\n@<]{0,64}?)\s*(ha confermato|ha richiesto la chiusura|ha accettato la chiusura|confirmed|has confirmed)\b/gi,
      function (_m, who, verb) {
        var hint = String(who || "")
          .replace(/^@+/, "")
          .trim();
        if (hint && hint.toLowerCase() !== "utente" && !isInvisibleOrEmptyPersonName(hint)) {
                    return (
            stashFn(plainUserMentionHtml(hint, resolveCloseFallbackUserId())) + " " + verb
          );
        }
        return (
          stashFn(plainUserMentionHtml(resolveCloseFallbackName(hint), resolveCloseFallbackUserId())) +
          " " +
          verb
        );
      },
    );

    var known = collectKnownPlainMentionLabels();
    for (var i = 0; i < known.length; i += 1) {
      var label = known[i];
      if (!label || /@/.test(label)) continue;
      var re = new RegExp("(^|[^\\w/])@" + escapeRegExp(label) + "(?![\\w#])", "gi");
      s = s.replace(re, function (_m, pre) {
        return pre + stashFn(plainUserMentionHtml(label, ""));
      });
    }

        s = s.replace(
      /(^|[^\w/<])@!?\s*((?!everyone\b|here\b)[\p{L}\p{N}_.=-]{1,40}(?:\s+(?:di|del|della|de|da)\s+[\p{L}\p{N}_.=-]{1,40})?)(?=$|[^\w#@.-])/gu,
      function (_m, pre, name) {
        if (/^https?:/i.test(name)) return _m;
        return pre + stashFn(plainUserMentionHtml(name, ""));
      },
    );

    return s;
  }

  function formatDiscordInline(raw, opts) {
    opts = opts || {};
    var tokens = [];
    function stash(html) {
      var key = "\uE000WT" + tokens.length + "\uE001";
      tokens.push(html);
      return key;
    }
    function restore(s) {
      return String(s || "").replace(/\uE000WT(\d+)\uE001/g, function (_m, idx) {
        return tokens[Number(idx)] || "";
      });
    }
    var s = String(raw || "").replace(/[\u200B\u200C\u200D\uFEFF]/g, "");

        s = s.replace(/<(a?):([a-zA-Z0-9_]+):(\d{5,32})>/g, function (_all, anim, name, eid) {
      var em = { id: eid, name: name, animated: anim === "a" };
      var html = guildEmojiImgHtml(em, false, 32);
      return html ? stash(html) : stash(":" + name + ":");
    });
    s = s.replace(/<@!?(\d{5,32})>/g, function (_all, uid) {
      if (!(state.userResolveAttempted && state.userResolveAttempted[uid])) {
        queueContentResolve({ userIds: [uid] });
      }
      return stash(plainUserMentionHtml(resolveMentionName("user", uid), uid));
    });
    s = s.replace(/<@&(\d{5,32})>/g, function (_all, rid) {
      if (!(state.roleResolveAttempted && state.roleResolveAttempted[rid])) {
        queueContentResolve({ roleIds: [rid] });
      }
      return stash(
        '<span class="vc-wt-msg-mention vc-wt-msg-mention--role">@' +
          esc(resolveMentionName("role", rid)) +
          "</span>",
      );
    });
    s = s.replace(/<#(\d{5,32})>/g, function (_all, cid) {
      if (!(state.channelResolveAttempted && state.channelResolveAttempted[cid])) {
        queueContentResolve({ channelIds: [cid] });
      }
      var href = guildDiscordChannelUrl(cid);
      return stash(
        (href
          ? '<a class="vc-wt-msg-mention vc-wt-msg-mention--channel" href="' +
            esc(href) +
            '" target="_blank" rel="noopener noreferrer">'
          : '<span class="vc-wt-msg-mention vc-wt-msg-mention--channel">') +
          "#" +
          esc(resolveMentionName("channel", cid)) +
          (href ? "</a>" : "</span>"),
      );
    });

        s = s.replace(/``([^`\n]+)``/g, function (_m, code) {
      return stash('<code class="vc-wt-md-code">' + esc(code) + "</code>");
    });
    s = s.replace(/`([^`\n]+)`/g, function (_m, code) {
      return stash('<code class="vc-wt-md-code">' + esc(code) + "</code>");
    });

        if (!opts.noSpoiler) {
      s = s.replace(/\|\|([\s\S]+?)\|\|/g, function (_m, inner) {
        var innerHtml = formatDiscordInline(inner, { noSpoiler: true });
        return stash(
          '<span class="vc-wt-md-spoiler" data-wt-spoiler="1" role="button" tabindex="0" title="Clicca per rivelare" aria-label="Spoiler">' +
            innerHtml +
            "</span>",
        );
      });
    }

        s = s.replace(/\[([^\]]+)\]\(\s*<?((?:https?:)?\/\/[^)\s>]+)>?\s*\)/gi, function (_m, label, url) {
      var href = normalizeContentUrl(url);
      return stash(
        '<a class="vc-wt-link" href="' +
          esc(href) +
          '" target="_blank" rel="noopener noreferrer">' +
          restore(formatDiscordInline(label, { noSpoiler: true })) +
          "</a>",
      );
    });

        s = s.replace(/(?:https?:)?\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|static\.klipy\.com|[a-z0-9.-]+\.[a-z]{2,})[^\s<>"']*/gi, function (url) {
      return stash(formatAutolinkUrl(url));
    });
    s = s.replace(/https?:\/\/[^\s<>"']+/gi, function (url) {
      return stash(formatAutolinkUrl(url));
    });

    s = s.replace(/`+/g, "");
    s = replaceEmojiShortcodes(s, stash, false, 32);
    s = replacePlainTranscriptMentions(s, stash);

        s = s.replace(/<t:(\d{9,12})(?::([tTdDfFR]))?>/g, function (_m, unix, style) {
      return stash(formatDiscordTimestamp(unix, style));
    });

        var scHold = [];
    s = s.replace(/:([a-zA-Z0-9_]{2,32}):/g, function (all) {
      var key = "\uE030SC" + scHold.length + "\uE031";
      scHold.push(all);
      return key;
    });

    s = esc(s);

        s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    s = s.replace(/\*\*__(.+?)__\*\*/g, "<strong><u>$1</u></strong>");
    s = s.replace(/__\*\*(.+?)\*\*__/g, "<strong><u>$1</u></strong>");
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__(.+?)__/g, "<u>$1</u>");
    s = s.replace(/~~(.+?)~~/g, "<s>$1</s>");
        s = s.replace(/\|\|(.+?)\|\|/g, function (_m, inner) {
      return (
        '<span class="vc-wt-md-spoiler" data-wt-spoiler="1" role="button" tabindex="0" title="Clicca per rivelare">' +
        inner +
        "</span>"
      );
    });
    s = s.replace(/(^|[^\*])\*(?!\*)([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_])_(?!_)([^_\n]+?)_(?!_)/g, "$1<em>$2</em>");
    s = s.replace(/\*\*/g, "");
    s = s.replace(/__/g, "");
    s = s.replace(/\uE030SC(\d+)\uE031/g, function (_m, idx) {
      return esc(scHold[Number(idx)] || "");
    });
    return restore(s);
  }

  function formatDiscordTimestamp(unix, style) {
    var sec = Number(unix);
    if (!Number.isFinite(sec) || sec <= 0) return esc("<t:" + unix + (style ? ":" + style : "") + ">");
    var d = new Date(sec * 1000);
    if (Number.isNaN(d.getTime())) return esc(String(unix));
    var st = String(style || "f");
    try {
      var label = "";
      if (st === "R") {
        var diff = d.getTime() - Date.now();
        var abs = Math.abs(diff);
        var mins = Math.round(abs / 60000);
        var hours = Math.round(abs / 3600000);
        var days = Math.round(abs / 86400000);
        if (mins < 1) label = diff >= 0 ? "tra poco" : "poco fa";
        else if (mins < 60) label = diff >= 0 ? "tra " + mins + " min" : mins + " min fa";
        else if (hours < 48) label = diff >= 0 ? "tra " + hours + " ore" : hours + " ore fa";
        else label = diff >= 0 ? "tra " + days + " giorni" : days + " giorni fa";
      } else if (st === "t") {
        label = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
      } else if (st === "T") {
        label = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      } else if (st === "d") {
        label = d.toLocaleDateString("it-IT");
      } else if (st === "D") {
        label = d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
      } else if (st === "F") {
        label = d.toLocaleString("it-IT", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } else {
        label = d.toLocaleString("it-IT", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return (
        '<time class="vc-wt-md-timestamp" datetime="' +
        esc(d.toISOString()) +
        '" title="' +
        esc(d.toLocaleString("it-IT")) +
        '">' +
        esc(label) +
        "</time>"
      );
    } catch (e) {
      return esc(d.toLocaleString("it-IT"));
    }
  }

    function mdMark(chars) {
    return '<span class="vc-wt-md-mark">' + esc(chars) + "</span>";
  }

  function formatDiscordInlineKeepMarks(raw) {
    var tokens = [];
    function stash(html) {
      var key = "\uE000WT" + tokens.length + "\uE001";
      tokens.push(html);
      return key;
    }
    function restore(s) {
      return String(s || "").replace(/\uE000WT(\d+)\uE001/g, function (_m, idx) {
        return tokens[Number(idx)] || "";
      });
    }
    var s = String(raw || "").replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
    s = s.replace(/\[([^\]]+)\]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/gi, function (_m, label, url) {
      return stash(
        '<a class="vc-wt-link vc-wt-link--composer" href="' +
          esc(url) +
          '" tabindex="-1">' +
          mdMark("[") +
          restore(formatDiscordInlineKeepMarks(label)) +
          mdMark("](") +
          '<span class="vc-wt-md-mark vc-wt-md-mark--url">' +
          esc(url) +
          "</span>" +
          mdMark(")") +
          "</a>",
      );
    });
    s = s.replace(/``([^`\n]+)``/g, function (_m, code) {
      return stash(mdMark("``") + '<code class="vc-wt-md-code">' + esc(code) + "</code>" + mdMark("``"));
    });
    s = s.replace(/`([^`\n]+)`/g, function (_m, code) {
      return stash(mdMark("`") + '<span class="vc-wt-md-inline">' + esc(code) + "</span>" + mdMark("`"));
    });
    s = s.replace(/https?:\/\/[^\s<>"']+/gi, function (url) {
      return stash(
        '<a class="vc-wt-link vc-wt-link--composer" href="' +
          esc(url) +
          '" tabindex="-1">' +
          esc(url) +
          "</a>",
      );
    });
    s = esc(s);
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, function (_m, inner) {
      return "<strong><em>" + mdMark("***") + inner + mdMark("***") + "</em></strong>";
    });
    s = s.replace(/\*\*__(.+?)__\*\*/g, function (_m, inner) {
      return "<strong><u>" + mdMark("**__") + inner + mdMark("__**") + "</u></strong>";
    });
    s = s.replace(/__\*\*(.+?)\*\*__/g, function (_m, inner) {
      return "<strong><u>" + mdMark("__**") + inner + mdMark("**__") + "</u></strong>";
    });
    s = s.replace(/\*\*(.+?)\*\*/g, function (_m, inner) {
      return "<strong>" + mdMark("**") + inner + mdMark("**") + "</strong>";
    });
    s = s.replace(/__(.+?)__/g, function (_m, inner) {
      return "<u>" + mdMark("__") + inner + mdMark("__") + "</u>";
    });
    s = s.replace(/~~(.+?)~~/g, function (_m, inner) {
      return "<s>" + mdMark("~~") + inner + mdMark("~~") + "</s>";
    });
    s = s.replace(/\|\|(.+?)\|\|/g, function (_m, inner) {
      return '<span class="vc-wt-md-spoiler is-open">' + mdMark("||") + inner + mdMark("||") + "</span>";
    });
    s = s.replace(/(^|[^\*])\*(?!\*)([^*\n]+?)\*(?!\*)/g, function (_m, pre, inner) {
      return pre + "<em>" + mdMark("*") + inner + mdMark("*") + "</em>";
    });
    s = s.replace(/(^|[^_])_(?!_)([^_\n]+?)_(?!_)/g, function (_m, pre, inner) {
      return pre + "<em>" + mdMark("_") + inner + mdMark("_") + "</em>";
    });
    return restore(s);
  }

  function formatComposerLineKeepMarks(line) {
    var raw = String(line || "");
    if (/^[ \t]{0,3}###\s+/.test(raw)) {
      return (
        '<div class="vc-wt-md-h3">' +
        mdMark(raw.match(/^[ \t]{0,3}###\s+/)[0]) +
        formatDiscordInlineKeepMarks(raw.replace(/^[ \t]{0,3}###\s+/, "")) +
        "</div>"
      );
    }
    if (/^[ \t]{0,3}##\s+/.test(raw)) {
      return (
        '<div class="vc-wt-md-h2">' +
        mdMark(raw.match(/^[ \t]{0,3}##\s+/)[0]) +
        formatDiscordInlineKeepMarks(raw.replace(/^[ \t]{0,3}##\s+/, "")) +
        "</div>"
      );
    }
    if (/^[ \t]{0,3}#\s+/.test(raw)) {
      return (
        '<div class="vc-wt-md-h1">' +
        mdMark(raw.match(/^[ \t]{0,3}#\s+/)[0]) +
        formatDiscordInlineKeepMarks(raw.replace(/^[ \t]{0,3}#\s+/, "")) +
        "</div>"
      );
    }
    if (/^[ \t]{0,3}-#\s+/.test(raw)) {
      return (
        '<div class="vc-wt-md-sub">' +
        mdMark(raw.match(/^[ \t]{0,3}-#\s+/)[0]) +
        formatDiscordInlineKeepMarks(raw.replace(/^[ \t]{0,3}-#\s+/, "")) +
        "</div>"
      );
    }
    if (/^[ \t]{0,3}>\s?/.test(raw)) {
      var quotedKeep = raw.replace(/^[ \t]{0,3}>\s?/, "");
      var quotePrefix = mdMark(raw.match(/^[ \t]{0,3}>\s?/)[0]);
      var quoteBody = "";
      if (/^[ \t]{0,3}###\s+/.test(quotedKeep)) {
        quoteBody =
          '<div class="vc-wt-md-h3">' +
          mdMark(quotedKeep.match(/^[ \t]{0,3}###\s+/)[0]) +
          formatDiscordInlineKeepMarks(quotedKeep.replace(/^[ \t]{0,3}###\s+/, "")) +
          "</div>";
      } else if (/^[ \t]{0,3}##\s+/.test(quotedKeep)) {
        quoteBody =
          '<div class="vc-wt-md-h2">' +
          mdMark(quotedKeep.match(/^[ \t]{0,3}##\s+/)[0]) +
          formatDiscordInlineKeepMarks(quotedKeep.replace(/^[ \t]{0,3}##\s+/, "")) +
          "</div>";
      } else if (/^[ \t]{0,3}#\s+/.test(quotedKeep)) {
        quoteBody =
          '<div class="vc-wt-md-h1">' +
          mdMark(quotedKeep.match(/^[ \t]{0,3}#\s+/)[0]) +
          formatDiscordInlineKeepMarks(quotedKeep.replace(/^[ \t]{0,3}#\s+/, "")) +
          "</div>";
      } else if (/^[ \t]{0,3}-#\s+/.test(quotedKeep)) {
        quoteBody =
          '<div class="vc-wt-md-sub">' +
          mdMark(quotedKeep.match(/^[ \t]{0,3}-#\s+/)[0]) +
          formatDiscordInlineKeepMarks(quotedKeep.replace(/^[ \t]{0,3}-#\s+/, "")) +
          "</div>";
      } else {
        quoteBody = formatDiscordInlineKeepMarks(quotedKeep);
      }
      return '<blockquote class="vc-wt-md-quote">' + quotePrefix + quoteBody + "</blockquote>";
    }
    return formatDiscordInlineKeepMarks(raw) || "<br>";
  }

  function buildComposerLiveHtml(text) {
    var s = String(text || "");
    if (!s) return "";
    var re = /<(a?):([a-zA-Z0-9_]+):(\d{5,32})>|<@!?(\d{5,32})>|<@&(\d{5,32})>|<#(\d{5,32})>/g;
    var parts = [];
    var last = 0;
    var m;
    function pushText(chunk) {
      if (!chunk) return;
      var lines = chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      for (var i = 0; i < lines.length; i += 1) {
        if (i) parts.push("<br>");
        parts.push(formatComposerLineKeepMarks(lines[i]));
      }
    }
    while ((m = re.exec(s))) {
      pushText(s.slice(last, m.index));
      if (m[4]) {
        parts.push(
          '<span class="vc-wt-md-gap vc-wt-mention vc-wt-mention--user" aria-hidden="true">@' +
            esc(resolveMentionName("user", m[4])) +
            "</span>",
        );
      } else if (m[5]) {
        if (resolveMentionName("role", m[5]) === "ruolo") {
          queueContentResolve({ roleIds: [m[5]] });
        }
        parts.push(
          '<span class="vc-wt-md-gap vc-wt-mention vc-wt-mention--role" aria-hidden="true">@' +
            esc(resolveMentionName("role", m[5])) +
            "</span>",
        );
      } else if (m[6]) {
        parts.push(
          '<span class="vc-wt-md-gap vc-wt-mention vc-wt-mention--channel" aria-hidden="true">#' +
            esc(resolveMentionName("channel", m[6])) +
            "</span>",
        );
      } else {
        parts.push(
          '<img class="vc-wt-md-gap vc-wt-inline-emoji vc-wt-composer__emoji-token" src="' +
            esc(customEmojiUrl(m[3], m[1] === "a", 32)) +
            '" alt="" aria-hidden="true" />',
        );
      }
      last = m.index + m[0].length;
    }
    pushText(s.slice(last));
    return parts.join("");
  }

  function syncComposerLivePreview(el) {
    if (!el) return;
    var host = el.parentElement;
    var live = host && host.classList.contains("vc-wt-composer__editor") ? host.querySelector(".vc-wt-composer__md-live") : null;
    if (!live) return;
    var text = serializeRichInput(el);
    live.innerHTML = buildComposerLiveHtml(text);
    syncComposerAutosize(el);
    live.scrollTop = el.scrollTop;
    live.scrollLeft = el.scrollLeft;
    el.classList.toggle("has-md-live", Boolean(String(text || "").trim() || richInputHasVisualTokens(el)));
  }

  /* composerAutoGrow1: altezza tipo Discord (sale col testo, poi scroll). */
  function syncComposerAutosize(el) {
    if (!el || !isRichInput(el)) return;
    var host = el.parentElement;
    var live = host && host.classList.contains("vc-wt-composer__editor") ? host.querySelector(".vc-wt-composer__md-live") : null;
    var minH = 44;
    var maxH = Math.max(140, Math.min(Math.floor((window.innerHeight || 800) * 0.42), 360));
    el.style.height = "auto";
    if (live) {
      live.style.height = "auto";
      live.style.bottom = "auto";
    }
    void el.offsetHeight;
    var contentH = Math.max(el.scrollHeight || 0, live ? live.scrollHeight || 0 : 0, minH);
    var next = Math.min(Math.max(contentH, minH), maxH);
    el.style.height = next + "px";
    el.style.maxHeight = maxH + "px";
    el.style.overflowY = contentH > maxH ? "auto" : "hidden";
    if (live) {
      live.style.height = next + "px";
      live.style.maxHeight = maxH + "px";
      live.style.overflowY = contentH > maxH ? "auto" : "hidden";
    }
    if (host && host.classList.contains("vc-wt-composer__editor")) {
      host.style.minHeight = next + "px";
    }
  }

  function scheduleComposerLivePreview(el) {
    if (!el) return;
    if (el._vcMdLiveRaf) cancelAnimationFrame(el._vcMdLiveRaf);
    el._vcMdLiveRaf = requestAnimationFrame(function () {
      el._vcMdLiveRaf = 0;
      syncComposerLivePreview(el);
    });
  }

  function formatPlainTextChunk(text, opts) {
    var s = String(text || "");
    if (!s) return "";
    var singleLine = opts && opts.singleLine;
    if (singleLine) {
      return formatDiscordInline(s.replace(/\s+/g, " "));
    }
    s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var segments = splitPlainTranscriptEmbeds(s);
    var out = [];
    for (var si = 0; si < segments.length; si += 1) {
      var seg = segments[si];
      if (seg.type === "embed") {
        out.push(renderPlainTranscriptEmbed(seg.embed));
        continue;
      }
      out.push(formatPlainTextLines(seg.text));
    }
    return out.join("");
  }

  function splitPlainTranscriptEmbeds(text) {
    var lines = String(text || "").split("\n");
    var out = [];
    var buf = [];
    var embed = null;

    function flushBuf() {
      if (!buf.length) return;
      out.push({ type: "text", text: buf.join("\n") });
      buf = [];
    }
    function flushEmbed() {
      if (!embed) return;
      out.push({ type: "embed", embed: embed });
      embed = null;
    }

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      if (/^\[Embed\s+\d+\]\s*$/i.test(line.trim())) {
        flushBuf();
        flushEmbed();
        embed = { title: "", description: "", fields: [], imageUrl: "", thumbUrl: "" };
        continue;
      }
      if (embed) {
        var tit = line.match(/^(?:Titolo|Title):\s*(.*)$/i);
        if (tit) {
          embed.title = tit[1];
          continue;
        }
        var des = line.match(/^(?:Descrizione|Description):\s*(.*)$/i);
        if (des) {
          embed.description = des[1];
          continue;
        }
        var img = line.match(/^\[Embed image\]\s*(\S+)/i);
        if (img) {
          embed.imageUrl = img[1];
          continue;
        }
        var th = line.match(/^\[Embed thumb\]\s*(\S+)/i);
        if (th) {
          embed.thumbUrl = th[1];
          continue;
        }
        if (!String(line || "").trim()) continue;
        var field = line.match(/^([^:\n]{1,80}):\s*(.*)$/);
        if (
          field &&
          !/^(Titolo|Title|Descrizione|Description)$/i.test(field[1]) &&
          field[1].indexOf("http") !== 0
        ) {
          embed.fields.push({ name: field[1], value: field[2] });
          continue;
        }
        if (embed.description) embed.description += "\n" + line;
        else embed.description = line;
        continue;
      }
      buf.push(line);
    }
    flushEmbed();
    flushBuf();
    return out;
  }

  function renderPlainTranscriptEmbed(embed) {
    if (!embed) return "";
    var title = String(embed.title || "").trim();
    var desc = String(embed.description || "").trim();
    var fields = Array.isArray(embed.fields) ? embed.fields : [];
    var imageUrl = String(embed.imageUrl || embed.thumbUrl || "").trim();
    if (!title && !desc && !fields.length && !imageUrl) return "";
    var fieldsHtml = fields
      .map(function (f) {
        return (
          '<div class="vc-wt-discord-embed__field"><span class="vc-wt-discord-embed__field-name">' +
          formatDiscordInline(f.name || "") +
          '</span><span class="vc-wt-discord-embed__field-value">' +
          formatDiscordInline(f.value || "") +
          "</span></div>"
        );
      })
      .join("");
    return (
      '<div class="vc-wt-discord-embed">' +
      (title ? '<div class="vc-wt-discord-embed__title">' + formatDiscordInline(title) + "</div>" : "") +
      (desc
        ? '<div class="vc-wt-discord-embed__desc">' +
          desc
            .split("\n")
            .map(function (line) {
              return formatDiscordInline(line);
            })
            .join("<br>") +
          "</div>"
        : "") +
      (fieldsHtml ? '<div class="vc-wt-discord-embed__fields">' + fieldsHtml + "</div>" : "") +
      (imageUrl
        ? '<img class="vc-wt-discord-embed__img" src="' +
          esc(imageUrl) +
          '" alt="" loading="lazy" decoding="async" />'
        : "") +
      "</div>"
    );
  }

  function formatPlainTextLines(text) {
    var s = String(text || "");
    if (!s) return "";
    var lines = s.split("\n");
    var parts = [];
    var inCode = false;
    var codeBuf = [];
    function flushCode() {
      if (!inCode && !codeBuf.length) return;
      parts.push('<pre class="vc-wt-md-pre"><code>' + esc(codeBuf.join("\n")) + "</code></pre>");
      codeBuf = [];
      inCode = false;
    }
    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      if (/^```/.test(line.trim())) {
        if (inCode) flushCode();
        else {
          inCode = true;
          codeBuf = [];
        }
        continue;
      }
      if (inCode) {
        codeBuf.push(line);
        continue;
      }
      if (/^[ \t]{0,3}###\s+/.test(line)) {
        parts.push('<div class="vc-wt-md-h3">' + formatDiscordInline(line.replace(/^[ \t]{0,3}###\s+/, "")) + "</div>");
        continue;
      }
      if (/^[ \t]{0,3}##\s+/.test(line)) {
        parts.push('<div class="vc-wt-md-h2">' + formatDiscordInline(line.replace(/^[ \t]{0,3}##\s+/, "")) + "</div>");
        continue;
      }
      if (/^[ \t]{0,3}#\s+/.test(line)) {
        parts.push('<div class="vc-wt-md-h1">' + formatDiscordInline(line.replace(/^[ \t]{0,3}#\s+/, "")) + "</div>");
        continue;
      }
      if (/^[ \t]{0,3}-#\s+/.test(line)) {
        parts.push('<div class="vc-wt-md-sub">' + formatDiscordInline(line.replace(/^[ \t]{0,3}-#\s+/, "")) + "</div>");
        continue;
      }
    if (/^[ \t]{0,3}>\s?/.test(line)) {
      var quoted = line.replace(/^[ \t]{0,3}>\s?/, "");
      var quoteInner = "";
      if (/^[ \t]{0,3}###\s+/.test(quoted)) {
        quoteInner = '<div class="vc-wt-md-h3">' + formatDiscordInline(quoted.replace(/^[ \t]{0,3}###\s+/, "")) + "</div>";
      } else if (/^[ \t]{0,3}##\s+/.test(quoted)) {
        quoteInner = '<div class="vc-wt-md-h2">' + formatDiscordInline(quoted.replace(/^[ \t]{0,3}##\s+/, "")) + "</div>";
      } else if (/^[ \t]{0,3}#\s+/.test(quoted)) {
        quoteInner = '<div class="vc-wt-md-h1">' + formatDiscordInline(quoted.replace(/^[ \t]{0,3}#\s+/, "")) + "</div>";
      } else if (/^[ \t]{0,3}-#\s+/.test(quoted)) {
        quoteInner = '<div class="vc-wt-md-sub">' + formatDiscordInline(quoted.replace(/^[ \t]{0,3}-#\s+/, "")) + "</div>";
      } else {
        quoteInner = formatDiscordInline(quoted);
      }
      parts.push('<blockquote class="vc-wt-md-quote">' + quoteInner + "</blockquote>");
      continue;
    }
      parts.push(formatDiscordInline(line));
      if (i < lines.length - 1) parts.push("<br>");
    }
    flushCode();
    return parts.join("");
  }

  function renderDiscordMessageEmbed(item) {
    if (!item) return "";
    var body = item.content ? esc(item.content) : "<em>Messaggio Discord</em>";
    var img = item.imageUrl
      ? '<img class="vc-wt-msg-embed__img" src="' + esc(item.imageUrl) + '" alt="" loading="lazy" decoding="async" />'
      : "";
    return (
      '<a class="vc-wt-msg-embed" href="' +
      esc(item.url || "#") +
      '" target="_blank" rel="noopener noreferrer">' +
      '<span class="vc-wt-msg-embed__head">#' +
      esc(item.channelName || "canale") +
      " · " +
      esc(item.authorName || "Utente") +
      "</span>" +
      '<span class="vc-wt-msg-embed__body">' +
      body +
      "</span>" +
      img +
      "</a>"
    );
  }

  function collectContentRefsFromText(text) {
    var channelIds = [];
    var userIds = [];
    var roleIds = [];
    var urls = [];
    var s = String(text || "");
    s.replace(/<#(\d{5,32})>/g, function (_all, id) {
      if (channelIds.indexOf(id) < 0) channelIds.push(id);
      return "";
    });
    s.replace(/<@!?(\d{5,32})>/g, function (_all, id) {
      if (userIds.indexOf(id) < 0) userIds.push(id);
      return "";
    });
    s.replace(/<@&(\d{5,32})>/g, function (_all, id) {
      if (roleIds.indexOf(id) < 0) roleIds.push(id);
      return "";
    });
    var urlRe = /https?:\/\/[^\s<>"']+/gi;
    var m;
    while ((m = urlRe.exec(s))) {
      var u = String(m[0] || "");
      if (urls.indexOf(u) < 0) urls.push(u);
    }
    return { channelIds: channelIds, userIds: userIds, roleIds: roleIds, urls: urls };
  }

  function collectContentRefs(messages) {
    var channelIds = [];
    var userIds = [];
    var roleIds = [];
    var urls = [];
    (messages || []).forEach(function (msg) {
      var refs = collectContentRefsFromText(msg && msg.content);
      refs.channelIds.forEach(function (id) {
        if (channelIds.indexOf(id) < 0) channelIds.push(id);
      });
      refs.userIds.forEach(function (id) {
        if (userIds.indexOf(id) < 0) userIds.push(id);
      });
      (refs.roleIds || []).forEach(function (id) {
        if (roleIds.indexOf(id) < 0) roleIds.push(id);
      });
      refs.urls.forEach(function (u) {
        if (urls.indexOf(u) < 0) urls.push(u);
      });
      if (msg && msg.authorId && msg.authorName) {
        rememberMentionName("user", msg.authorId, msg.authorName);
      }
      if (msg && msg.authorRoleId && msg.authorRoleName) {
        rememberMentionName("role", msg.authorRoleId, msg.authorRoleName);
      }
    });
    return { channelIds: channelIds, userIds: userIds, roleIds: roleIds, urls: urls };
  }

  function queueContentResolve(partial) {
    partial = partial || {};
    if (!state.pendingChannelIds) state.pendingChannelIds = {};
    if (!state.pendingUserIds) state.pendingUserIds = {};
    if (!state.pendingRoleIds) state.pendingRoleIds = {};
    if (!state.pendingLinkUrls) state.pendingLinkUrls = {};
    (partial.channelIds || []).forEach(function (id) {
      if (state.channelResolveAttempted && state.channelResolveAttempted[id]) return;
      var knownCh = resolveMentionName("channel", id);
      if (knownCh && knownCh !== "canale") return;
      if (!state.pendingChannelIds[id]) state.pendingChannelIds[id] = true;
    });
    (partial.userIds || []).forEach(function (id) {
      if (state.userResolveAttempted && state.userResolveAttempted[id]) return;
      var known = resolveMentionName("user", id);
      if (known && known !== "utente") return;
      if (!state.pendingUserIds[id]) state.pendingUserIds[id] = true;
    });
    (partial.roleIds || []).forEach(function (id) {
      if (state.roleResolveAttempted && state.roleResolveAttempted[id]) return;
      var knownRole = resolveMentionName("role", id);
      if (knownRole && knownRole !== "ruolo") return;
      if (!state.pendingRoleIds[id]) state.pendingRoleIds[id] = true;
    });
    (partial.urls || []).forEach(function (url) {
      if (!state.pendingLinkUrls[url] && !state.linkCache[url]) state.pendingLinkUrls[url] = true;
    });
    if (state.resolveTimer) clearTimeout(state.resolveTimer);
    state.resolveTimer = setTimeout(flushContentResolve, 180);
  }

  function flushContentResolve() {
    state.resolveTimer = null;
    var channelIds = Object.keys(state.pendingChannelIds || {}).slice(0, 48);
    var userIds = Object.keys(state.pendingUserIds || {}).slice(0, 48);
    var roleIds = Object.keys(state.pendingRoleIds || {}).slice(0, 48);
    var urls = Object.keys(state.pendingLinkUrls || {}).slice(0, 24);
    if (!channelIds.length && !userIds.length && !roleIds.length && !urls.length) return;
    if (state.resolveInflight) {
      state.resolveTimer = setTimeout(flushContentResolve, 220);
      return;
    }
    channelIds.forEach(function (id) {
      delete state.pendingChannelIds[id];
      if (!state.channelResolveAttempted) state.channelResolveAttempted = {};
      state.channelResolveAttempted[id] = true;
    });
    userIds.forEach(function (id) {
      delete state.pendingUserIds[id];
      if (!state.userResolveAttempted) state.userResolveAttempted = {};
      state.userResolveAttempted[id] = true;
    });
    roleIds.forEach(function (id) {
      delete state.pendingRoleIds[id];
      if (!state.roleResolveAttempted) state.roleResolveAttempted = {};
      state.roleResolveAttempted[id] = true;
    });
    urls.forEach(function (u) {
      delete state.pendingLinkUrls[u];
    });
    state.resolveInflight = true;
    fetchJson(apiBase() + "/resolve", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ channelIds: channelIds, userIds: userIds, roleIds: roleIds, urls: urls }),
    })
      .then(function (out) {
        state.resolveInflight = false;
        if (!out.res.ok || !out.data || !out.data.ok) return;
        var namesChanged = false;
        var linksChanged = false;
        var channels = out.data.channels || {};
        Object.keys(channels).forEach(function (id) {
          var row = channels[id];
          if (row && row.name) {
            var prev = resolveMentionName("channel", id);
            rememberMentionName("channel", id, row.name);
            if (prev !== String(row.name)) namesChanged = true;
          }
        });
        var users = out.data.users || {};
        var avatarsChanged = false;
        Object.keys(users).forEach(function (id) {
          var row = users[id];
          if (row && row.name) {
            var prevU = resolveMentionName("user", id);
            rememberMentionName("user", id, row.name);
            if (prevU !== String(row.name)) namesChanged = true;
            if (
              state.detail &&
              String(state.detail.claimedBy) === String(id) &&
              isInvisibleOrEmptyPersonName(state.detail.claimedByName)
            ) {
              state.detail.claimedByName = String(row.name);
              namesChanged = true;
            }
            if (
              state.detail &&
              String(state.detail.closedBy) === String(id) &&
              isInvisibleOrEmptyPersonName(state.detail.closedByName)
            ) {
              state.detail.closedByName = String(row.name);
              namesChanged = true;
            }
          }
          if (row && row.avatarUrl) {
            var prevAv = state.avatarByUserId && state.avatarByUserId[id];
            rememberUserAvatar(id, row.avatarUrl, row.name);
            if (prevAv !== String(row.avatarUrl)) avatarsChanged = true;
                                    (state.tickets || []).forEach(function (t) {
              if (t && String(t.userId) === String(id) && !t.authorAvatarUrl) {
                t.authorAvatarUrl = String(row.avatarUrl);
              }
            });
            if (state.detail && String(state.detail.userId) === String(id) && !state.detail.authorAvatarUrl) {
              state.detail.authorAvatarUrl = String(row.avatarUrl);
            }
          }
        });
        var roles = out.data.roles || {};
        Object.keys(roles).forEach(function (id) {
          var roleRow = roles[id];
          if (roleRow && roleRow.name) {
            var prevR = resolveMentionName("role", id);
            rememberMentionName("role", id, roleRow.name);
            if (prevR !== String(roleRow.name)) namesChanged = true;
          }
        });
        var links = out.data.links || {};
        Object.keys(links).forEach(function (url) {
          var prevL = state.linkCache[url];
          state.linkCache[url] = links[url];
          if (JSON.stringify(prevL || null) !== JSON.stringify(links[url] || null)) linksChanged = true;
        });
                if (linksChanged || avatarsChanged) {
          refreshListPane();
          refreshChatLogMarkup();
        } else if (namesChanged) refreshMentionTokenLabels();
      })
      .catch(function () {
        state.resolveInflight = false;
      });
  }

  function queueMissingAvatarsFromMessages(messages) {
    var ids = [];
            void messages;
    (state.tickets || []).forEach(function (t) {
      var id = String((t && t.userId) || "").trim();
      if (!/^\d{5,32}$/.test(id)) return;
      if (String((t && t.authorAvatarUrl) || "").trim()) return;
      if (state.avatarByUserId && state.avatarByUserId[id]) return;
      ids.push(id);
    });
    if (state.detail) {
      var openerId = String(state.detail.userId || "").trim();
      if (/^\d{5,32}$/.test(openerId) && !String(state.detail.authorAvatarUrl || "").trim()) {
        ids.push(openerId);
      }
    }
    if (ids.length) queueContentResolve({ userIds: ids });
  }

  function refreshMentionTokenLabels() {
    var nodes = document.querySelectorAll(
      ".vc-wt-mention[data-mention-type], .vc-wt-msg-mention[data-mention-user], .vc-wt-msg-mention[data-mention-channel], .vc-wt-msg-mention[data-mention-role]",
    );
    Array.prototype.forEach.call(nodes, function (el) {
      var type = el.getAttribute("data-mention-type");
      var id = el.getAttribute("data-mention-id");
      if (!type || !id) {
        if (el.getAttribute("data-mention-user")) {
          type = "user";
          id = el.getAttribute("data-mention-user");
        } else if (el.getAttribute("data-mention-channel")) {
          type = "channel";
          id = el.getAttribute("data-mention-channel");
        } else if (el.getAttribute("data-mention-role")) {
          type = "role";
          id = el.getAttribute("data-mention-role");
        }
      }
      if (type === "role" && id) {
        var roleName = resolveMentionName("role", id);
        if (roleName && roleName !== "ruolo") el.textContent = "@" + roleName;
        return;
      }
      if (type === "user" && id) {
        var userName = resolveMentionName("user", id);
        if (userName && userName !== "utente") {
          var staff = resolveStaffRoleName(id);
          el.textContent = staff ? "@" + userName + " · " + staff : "@" + userName;
        }
        return;
      }
      if (type === "channel" && id) {
        var channelName = resolveMentionName("channel", id);
        if (channelName && channelName !== "canale") el.textContent = "#" + channelName;
      }
    });
  }

  function refreshChatLogMarkup() {
    var log = byId("vc-wt-chat-log");
    if (!log) return;
    log.innerHTML = (state.messages || []).map(messageHtml).join("");
    wireMessageReactions(log);
    wireMessageTools(log);
    wireEmojiImgFallback(log);
    scrollChatBottom(false);
  }

  function hydrateContentRefs(messages) {
    var refs = collectContentRefs(messages);
    if (refs.channelIds.length || refs.userIds.length || refs.roleIds.length || refs.urls.length) {
      queueContentResolve(refs);
    }
  }

  function formatMessageContent(content, opts) {
    opts = opts || {};
    var still = opts.still === true;
    var singleLine = opts.singleLine === true;
    var plainPreview = opts.plainPreview === true;
    var previewTicket = opts.ticket || null;
    var s = String(content || "");
    if (!s) return "";
    s = s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
    if (plainPreview) {
      s = cleanImportedTranscriptPreview(s);
      s = stripDiscordMarkdown(s);
      var person = ticketPreviewPersonName(previewTicket);
      if (person) s = s.replace(/@utente\b/gi, "@" + person);
      else s = s.replace(/\s*@utente\b/gi, "");
      s = s.replace(/\s*@(?:ruolo|canale)\b/gi, "");
      s = s.replace(/\s*#canale\b/gi, "");
      s = s.replace(/\s+/g, " ").trim();
            return esc(s);
    }
    var tokens = [];
    function stash(html) {
      var key = "\uE010EM" + tokens.length + "\uE011";
      tokens.push(html);
      return key;
    }
    s = s.replace(/<(a?):([a-zA-Z0-9_]+):(\d{5,32})>|<@!?(\d{5,32})>|<@&(\d{5,32})>|<#(\d{5,32})>/g, function (all, anim, name, eid, uid, rid, cid) {
      if (uid) {
        var userHref = userProfileUrl(uid);
        var roleName = resolveStaffRoleName(uid);
        var displayName = resolveMentionName("user", uid);
        if (displayName === "utente" && previewTicket) {
          var fromTicket = ticketPreviewPersonName(previewTicket);
          if (
            fromTicket &&
            (String(previewTicket.userId || "") === String(uid) ||
              String(previewTicket.claimedBy || "") === String(uid) ||
              String(previewTicket.closedBy || "") === String(uid))
          ) {
            displayName = fromTicket;
          }
        }
        if (displayName === "utente" && !(state.userResolveAttempted && state.userResolveAttempted[uid])) {
          queueContentResolve({ userIds: [uid] });
        }
        var userLabel = "@" + displayName;
                if (roleName && displayName !== "utente") userLabel += " · " + roleName;
        return stash(
          (userHref
            ? '<a class="vc-wt-msg-mention vc-wt-msg-mention--user' +
              (roleName ? " is-staff" : "") +
              '" href="' +
              esc(userHref) +
              '" data-mention-user="' +
              esc(uid) +
              '"' +
              (roleName ? ' title="' + esc(roleName) + '"' : ' title="Apri profilo"') +
              ">"
            : '<span class="vc-wt-msg-mention vc-wt-msg-mention--user' +
              (roleName ? " is-staff" : "") +
              '" title="ID ' +
              esc(uid) +
              '">') +
            esc(userLabel) +
            (userHref ? "</a>" : "</span>"),
        );
      }
      if (rid) {
        var roleLabel = resolveMentionName("role", rid);
        if (roleLabel === "ruolo" && !(state.roleResolveAttempted && state.roleResolveAttempted[rid])) {
          queueContentResolve({ roleIds: [rid] });
        }
        return stash(
          '<span class="vc-wt-msg-mention vc-wt-msg-mention--role" data-mention-role="' +
            esc(rid) +
            '" data-mention-type="role" data-mention-id="' +
            esc(rid) +
            '" title="ID ' +
            esc(rid) +
            '">@' +
            esc(roleLabel) +
            "</span>",
        );
      }
      if (cid) {
        if (
          resolveMentionName("channel", cid) === "canale" &&
          !(state.channelResolveAttempted && state.channelResolveAttempted[cid])
        ) {
          queueContentResolve({ channelIds: [cid] });
        }
        var channelHref = guildDiscordChannelUrl(cid);
        return stash(
          (channelHref
            ? '<a class="vc-wt-msg-mention vc-wt-msg-mention--channel" href="' +
              esc(channelHref) +
              '" target="_blank" rel="noopener noreferrer" data-mention-channel="' +
              esc(cid) +
              '" data-mention-type="channel" data-mention-id="' +
              esc(cid) +
              '" title="Apri ticket sul sito">'
            : '<span class="vc-wt-msg-mention vc-wt-msg-mention--channel" data-mention-channel="' +
              esc(cid) +
              '" data-mention-type="channel" data-mention-id="' +
              esc(cid) +
              '" title="ID ' +
              esc(cid) +
              '">') +
            "#" +
            esc(resolveMentionName("channel", cid)) +
            (channelHref ? "</a>" : "</span>"),
        );
      }
      var isAnimated = anim === "a";
      var wantAnimated = isAnimated && !still;
      var size = still ? 32 : 48;
      var url =
        window.VcEmojiPicker && typeof window.VcEmojiPicker.customUrl === "function"
          ? window.VcEmojiPicker.customUrl(eid, wantAnimated, size)
          : wantAnimated
            ? "https://cdn.discordapp.com/emojis/" + eid + ".webp?size=" + size + "&animated=true"
            : "https://cdn.discordapp.com/emojis/" + eid + ".webp?size=" + size;
      return stash(
        '<img class="vc-wt-inline-emoji' +
          (still ? " vc-wt-inline-emoji--sm" : "") +
          (wantAnimated ? " vc-wt-inline-emoji--animated" : "") +
          '" src="' +
          esc(url) +
          '" data-vc-emoji-id="' +
          esc(eid) +
          '" data-vc-emoji-animated="' +
          (wantAnimated ? "1" : "0") +
          '" alt=":' +
          esc(name) +
          ':" title=":' +
          esc(name) +
          ':" loading="lazy" decoding="async" />',
      );
    });
    s = replaceEmojiShortcodes(s, stash, still, still ? 20 : 32);
    s = replacePlainTranscriptMentions(s, stash);
    var html = formatPlainTextChunk(s, { singleLine: singleLine });
    return html.replace(/\uE010EM(\d+)\uE011/g, function (_m, idx) {
      return tokens[Number(idx)] || "";
    });
  }

  function wireEmojiImgFallback(scope) {
    var root = scope || document;
    root.querySelectorAll("img.vc-wt-inline-emoji, img.vc-wt-reaction__emoji").forEach(function (img) {
      if (img._vcEmojiFb) return;
      img._vcEmojiFb = true;
      img.addEventListener("error", function () {
        var id = String(img.getAttribute("data-vc-emoji-id") || "").trim();
        var animated = img.getAttribute("data-vc-emoji-animated") === "1";
        var step = Number(img.dataset.vcEmojiFallback || "0") || 0;
        var sizeMatch = String(img.getAttribute("src") || "").match(/[?&]size=(\d+)/);
        var size = sizeMatch ? sizeMatch[1] : "48";
        if (!id) {
          img.classList.add("is-broken");
          return;
        }
                var next = "";
        if (step < 1 && animated) {
          next = "https://cdn.discordapp.com/emojis/" + id + ".webp?size=" + size;
        } else if (step < 2) {
          next = "https://cdn.discordapp.com/emojis/" + id + ".png?size=" + size;
        } else if (step < 3) {
          next = "https://cdn.discordapp.com/emojis/" + id + ".gif?size=" + size;
        } else {
          img.classList.add("is-broken");
          return;
        }
        img.dataset.vcEmojiFallback = String(step + 1);
        img.src = next;
      });
    });
  }

  function reactionMe(r) {
    if (!r) return false;
    if (typeof r.me === "boolean") return r.me;
    var ids = Array.isArray(r.userIds) ? r.userIds : [];
    return ids.indexOf(String(state.viewerId || "")) >= 0;
  }

  function resolveReactionName(userId) {
    var id = String(userId || "");
    if (!id) return "Utente";
    if (id === String(state.viewerId || "")) return "Tu";
    var t = state.detail;
    if (t && String(t.userId) === id && t.authorName) return String(t.authorName);
    if (t && String(t.claimedBy) === id && t.claimedByName) return String(t.claimedByName);
    for (var i = 0; i < (state.messages || []).length; i += 1) {
      var m = state.messages[i];
      if (m && String(m.authorId) === id && m.authorName) return String(m.authorName);
    }
    return "";
  }

  function reactionUsersLabel(r) {
    var users = Array.isArray(r && r.users) ? r.users.slice() : [];
    if (!users.length && r && Array.isArray(r.userIds)) {
      users = r.userIds.map(function (id) {
        return { id: id, name: "" };
      });
    }
    var names = users
      .map(function (u) {
        var n = String((u && u.name) || "").trim();
        if (!n || n === "Utente") n = resolveReactionName(u && u.id) || n || "Utente";
        if (String(u && u.id) === String(state.viewerId || "")) n = "Tu";
        return n;
      })
      .filter(Boolean);
    if (!names.length) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + " e " + names[1];
    if (names.length <= 4) return names.slice(0, -1).join(", ") + " e " + names[names.length - 1];
    return names.slice(0, 3).join(", ") + " e altri " + (names.length - 3);
  }

  function reactionChipHtml(r) {
    if (!r || !r.count) return "";
    var label = "";
    var emojiId = r.emojiId ? String(r.emojiId) : "";
    var reactionUrl = "";
    if (emojiId) {
      var animated = Boolean(r.animated);
      reactionUrl =
        window.VcEmojiPicker && typeof window.VcEmojiPicker.customUrl === "function"
          ? window.VcEmojiPicker.customUrl(emojiId, animated, 32)
          : animated
            ? "https://cdn.discordapp.com/emojis/" + emojiId + ".webp?size=32&animated=true"
            : "https://cdn.discordapp.com/emojis/" + emojiId + ".webp?size=32";
      label =
        '<img class="vc-wt-reaction__emoji" src="' +
        esc(reactionUrl) +
        '" data-vc-emoji-id="' +
        esc(emojiId) +
        '" data-vc-emoji-animated="' +
        (animated ? "1" : "0") +
        '" alt=":' +
        esc(r.name || "emoji") +
        ':" loading="lazy" decoding="async" />';
    } else {
      label = '<span class="vc-wt-reaction__emoji">' + esc(r.emoji || "") + "</span>";
    }
    var who = reactionUsersLabel(r);
    var emojiLabel = r.name ? ":" + r.name + ":" : r.emoji || "emoji";
    var tip = who ? who + " · " + emojiLabel : emojiLabel;
    var whoInline =
      who && Number(r.count) === 1
        ? '<span class="vc-wt-reaction__who">' + esc(who) + "</span>"
        : "";
    return (
      '<button type="button" class="vc-wt-reaction' +
      (reactionMe(r) ? " is-mine" : "") +
      '" data-react-emoji="' +
      esc(r.emoji || "") +
      '" data-react-tip="' +
      esc(tip) +
      '" title="' +
      esc(tip) +
      '" aria-label="' +
      esc(tip) +
      '">' +
      label +
      '<span class="vc-wt-reaction__count">' +
      esc(String(r.count)) +
      "</span>" +
      whoInline +
      "</button>"
    );
  }

  function reactionsBarHtml(m, closed) {
    if (!m || String(m.authorKind || "") === "system") return "";
    var chips = (m.reactions || []).map(reactionChipHtml).join("");
    var addBtn = closed
      ? ""
      : '<button type="button" class="vc-wt-reaction vc-wt-reaction--add" data-react-add="' +
        esc(m.id) +
        '" title="Aggiungi reazione" aria-label="Aggiungi reazione"><i class="fa fa-smile-o" aria-hidden="true"></i></button>';
    if (!chips && !addBtn) return "";
    return '<div class="vc-wt-msg__reactions" data-msg-reactions="' + esc(m.id) + '">' + chips + addBtn + "</div>";
  }

  function normalizePersonName(s) {
    return String(s || "")
      .split("#")[0]
      .trim()
      .toLowerCase()
      .replace(/[<>]/g, "")
      .replace(/^_+|_+$/g, "");
  }

  function foldLeetName(s) {
    return normalizePersonName(s)
      .replace(/4/g, "a")
      .replace(/3/g, "e")
      .replace(/1/g, "i")
      .replace(/0/g, "o")
      .replace(/5/g, "s")
      .replace(/7/g, "t")
      .replace(/\$/g, "s")
      .replace(/@/g, "a");
  }

  function namesLooselyEqual(a, b) {
    var na = normalizePersonName(a);
    var nb = normalizePersonName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    var fa = foldLeetName(na);
    var fb = foldLeetName(nb);
    if (fa && fb && fa === fb) return true;
    if (fa.length >= 4 && fb.length >= 4 && (fa.indexOf(fb) >= 0 || fb.indexOf(fa) >= 0)) return true;
    return false;
  }

  function isFakeUrlAuthorMessage(m) {
    var name = String((m && m.authorName) || "").trim();
    var id = String((m && m.authorId) || "").trim();
    return /^(https?|ftp)$/i.test(name) || /^discord:(https?|ftp)$/i.test(id);
  }

  function displayMessageAuthorName(m) {
    if (isFakeUrlAuthorMessage(m) && state.detail && state.detail.authorName) {
      return String(state.detail.authorName);
    }
    return String((m && m.authorName) || "Utente");
  }

  function isTicketAddedUserMessage(m) {
    if (!m || !state.detail) return false;
    var kind = String(m.authorKind || "");
    if (kind === "system" || kind === "bot") return false;
    var authorId = String(m.authorId || "").trim();
    var added = Array.isArray(state.detail.addedUsers) ? state.detail.addedUsers : [];
    for (var i = 0; i < added.length; i += 1) {
      var u = added[i];
      if (!u) continue;
      if (authorId && String(u.id || "") === authorId) return true;
      if (namesLooselyEqual(u.name, m.authorName)) return true;
      if (authorId.indexOf("discord:") === 0 && namesLooselyEqual(u.name, authorId.slice(8))) return true;
    }
    return false;
  }

    function isTicketOpenerMessage(m) {
    if (!m || !state.detail) return false;
    var kind = String(m.authorKind || "");
    if (kind === "system" || kind === "bot") return false;
        if (isFakeUrlAuthorMessage(m)) return true;
    var openerId = String(state.detail.userId || "").trim();
    var authorId = String(m.authorId || "").trim();
    if (openerId && authorId && openerId === authorId) return true;
    if (namesLooselyEqual(state.detail.authorName, m.authorName)) return true;
    if (authorId.indexOf("discord:") === 0) {
      var slug = authorId.slice(8);
      if (namesLooselyEqual(state.detail.authorName, slug)) return true;
    }
    return false;
  }

    function hasStaffRoleSignals(m) {
    if (!m) return false;
    if (String(m.authorKind || "") === "staff") return true;
    var key = String((m && m.authorRoleKey) || "").trim().toLowerCase();
    var staffKeys = {
      founder: 1,
      manager: 1,
      admin: 1,
      director: 1,
      "high-staff": 1,
      "senior-mod": 1,
      mod: 1,
      helper: 1,
      "partner-manager": 1,
      "community-manager": 1,
      staff: 1,
    };
    if (key && staffKeys[key]) return true;
    var id = String((m && m.authorId) || "").trim();
    var role = state.staffRoles && state.staffRoles[id];
    if (role && role.key && staffKeys[String(role.key).toLowerCase()]) return true;
    var name = String((m && m.authorRoleName) || (role && role.name) || "").trim();
    if (
      /partner\s*manager|high\s*staff|director|senior\s*mod|\bmoderator\b|^mod\b|helper|founder|^manager$|^admin$/i.test(
        name,
      )
    ) {
      return true;
    }
    return false;
  }

    function isTicketCustomerMessage(m) {
    if (!m) return false;
    if (isFakeUrlAuthorMessage(m)) return true;
    return isTicketOpenerMessage(m) || isTicketAddedUserMessage(m);
  }

    function isResolvedStaffAuthor(m) {
    if (!m) return false;
    if (isTicketOpenerMessage(m) || isTicketAddedUserMessage(m)) return false;
    return hasStaffRoleSignals(m);
  }

    function effectiveAuthorKind(m) {
    var kind = String((m && m.authorKind) || "user");
    if (kind === "system" || kind === "bot") return kind;
    if (isFakeUrlAuthorMessage(m)) return "user";
        if (isTicketOpenerMessage(m)) return "user";
    if (isTicketAddedUserMessage(m)) return "user";
    if (kind === "staff" || hasStaffRoleSignals(m)) return "staff";
    return kind === "user" ? "user" : kind;
  }

    function isOwnMessage(m) {
    if (!m) return false;
    var rawKind = String((m && m.authorKind) || "");
    if (rawKind === "system" || rawKind === "bot") return false;
    var authorId = String(m.authorId || "").trim();
    var viewerId = String(state.viewerId || "").trim();
    if (authorId && viewerId && authorId === viewerId) return true;
    var viewerName = state.viewerName;
    if (namesLooselyEqual(viewerName, m.authorName)) return true;
    if (authorId.indexOf("discord:") === 0) {
      var slug = authorId.slice(8);
      if (namesLooselyEqual(viewerName, slug)) return true;
    }
    return false;
  }

    function isMessageRightAligned(m) {
    if (!m) return false;
    var kind = effectiveAuthorKind(m);
    if (kind === "system" || kind === "bot") return false;
        if (isStaffMode && isTicketOpenerMessage(m)) return false;
    if (isStaffMode && isTicketAddedUserMessage(m) && !isTicketOpenerMessage(m)) return false;
        if (isOwnMessage(m)) return true;
    if (isStaffMode && (kind === "staff" || hasStaffRoleSignals(m))) return true;
    if (isStaffMode && isTicketCustomerMessage(m)) return false;
    if (isStaffMode && kind === "staff") return true;
    if (
      !isStaffMode &&
      kind === "user" &&
      state.detail &&
      String(state.detail.userId || "") === String(state.viewerId || "") &&
      isTicketOpenerMessage(m)
    ) {
      return true;
    }
    return false;
  }

  function replySnippetFromMessage(m) {
    if (!m || !m.id) return null;
    if (m.pending) return null;
    if (String(m.authorKind || "") === "system") return null;
    return {
      id: String(m.id),
      authorId: String(m.authorId || ""),
      authorName: displayMessageAuthorName(m),
      content: String(m.content || "").replace(/\s+/g, " ").trim().slice(0, 140),
      hasMedia: Array.isArray(m.imageUrls) && m.imageUrls.length > 0,
      deleted: false,
    };
  }

  function resolveReplySnippet(m) {
    if (!m) return null;
    if (m.replyTo && m.replyTo.id) {
      if (m.replyTo.deleted) return m.replyTo;
      if (m.replyTo.authorName || m.replyTo.content || m.replyTo.hasMedia) return m.replyTo;
      var local = (state.messages || []).find(function (x) {
        return x && String(x.id) === String(m.replyTo.id);
      });
      return local ? replySnippetFromMessage(local) || m.replyTo : m.replyTo;
    }
    return null;
  }

  function replyPreviewText(reply) {
    if (!reply) return "";
    if (reply.deleted) return "Messaggio originale eliminato";
    var text = String(reply.content || "").replace(/\s+/g, " ").trim();
    if (text) return text;
    if (reply.hasMedia) return "Allegato";
    return "Messaggio";
  }

  function replyPreviewHtml(m) {
    var reply = resolveReplySnippet(m);
    if (!reply || !reply.id) return "";
    var name = reply.deleted ? "Messaggio originale" : String(reply.authorName || "Utente");
    return (
      '<button type="button" class="vc-wt-msg__quote" data-jump-msg="' +
      esc(reply.id) +
      '" title="Vai al messaggio originale">' +
      "<strong>" +
      esc(name) +
      "</strong>" +
      "<span>" +
      esc(replyPreviewText(reply)) +
      "</span></button>"
    );
  }

  function jumpToMessage(id) {
    var targetId = String(id || "").trim();
    if (!targetId) return;
    var log = byId("vc-wt-chat-log");
    var node = log && log.querySelector('[data-msg-id="' + targetId + '"]');
    if (!node) return;
    try {
      var logRect = log.getBoundingClientRect();
      var nodeRect = node.getBoundingClientRect();
      var nextTop =
        Number(log.scrollTop || 0) +
        (nodeRect.top - logRect.top) -
        Math.max(0, (log.clientHeight - nodeRect.height) / 2);
      log.scrollTop = Math.max(0, nextTop);
    } catch (eJump) {
      try {
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch (e2) {}
    }
    node.classList.remove("vc-wt-msg--flash");
    void node.offsetWidth;
    node.classList.add("vc-wt-msg--flash");
    window.setTimeout(function () {
      node.classList.remove("vc-wt-msg--flash");
    }, 1400);
  }

  function startReplyToMessage(id) {
    var msg = (state.messages || []).find(function (m) {
      return m && String(m.id) === String(id || "");
    });
    var snippet = replySnippetFromMessage(msg);
    if (!snippet) return;
    if (composerLockedReason()) return;
    state.replyTo = snippet;
    syncComposerReplyBar();
    focusComposerSoon();
  }

  function clearReplyTarget() {
    state.replyTo = null;
    syncComposerReplyBar();
  }

  var pendingReplyToId = "";

  function consumeReplyToFromUrl() {
    try {
      var params = new URLSearchParams(location.search || "");
      var rid = String(params.get("vcReplyTo") || "").trim();
      if (!/^[a-f0-9]{24}$/i.test(rid)) return "";
      params.delete("vcReplyTo");
      var q = params.toString();
      var next = location.pathname + (q ? "?" + q : "") + location.hash;
      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState({}, "", next);
      }
      return rid;
    } catch (e) {
      return "";
    }
  }

  function applyPendingReplyAfterOpen() {
    var rid = pendingReplyToId || consumeReplyToFromUrl();
    pendingReplyToId = "";
    if (!rid) return;
    window.setTimeout(function () {
      startReplyToMessage(rid);
    }, 80);
  }

  function composerReplyBarHtml() {
    var reply = state.replyTo;
    if (!reply || !reply.id) {
      return '<div id="vc-wt-composer-reply" class="vc-wt-composer__reply" hidden></div>';
    }
    return (
      '<div id="vc-wt-composer-reply" class="vc-wt-composer__reply">' +
      '<i class="fa fa-reply" aria-hidden="true"></i>' +
      '<div class="vc-wt-composer__reply-main">' +
      "<strong>Rispondi a " +
      esc(String(reply.authorName || "Utente")) +
      "</strong>" +
      "<span>" +
      esc(replyPreviewText(reply)) +
      "</span></div>" +
      '<button type="button" class="vc-wt-composer__reply-close" data-reply-cancel title="Annulla risposta" aria-label="Annulla risposta">&times;</button></div>'
    );
  }

  function syncComposerReplyBar() {
    var form = byId("vc-wt-composer");
    if (!form) return;
    var bar = byId("vc-wt-composer-reply");
    if (!bar) {
      form.insertAdjacentHTML("afterbegin", composerReplyBarHtml());
      bar = byId("vc-wt-composer-reply");
    } else {
      var tmp = document.createElement("div");
      tmp.innerHTML = composerReplyBarHtml();
      var next = tmp.firstElementChild;
      if (next) bar.replaceWith(next);
    }
    form.classList.toggle("is-replying", Boolean(state.replyTo && state.replyTo.id));
  }

  function messageHtml(m) {
    var kind = effectiveAuthorKind(m);
    if (isUselessMessageContent(m && m.content) && !(m.imageUrls && m.imageUrls.length)) {
      return "";
    }
    var mine = isOwnMessage(m);
    var pending = Boolean(m.pending);
    var alignRight = isMessageRightAligned(m);
    var closed = state.detail && state.detail.status === "closed";
    var canEdit = mine && !closed && !pending;
    var canDelete = !closed && !pending && kind !== "system" && (mine || isStaffMode);
    var canReply = !pending && kind !== "system" && composerLockedReason() === "";
    var cls =
      "vc-wt-msg vc-wt-msg--" +
      kind +
      (alignRight ? " is-mine" : "") +
      (pending ? " vc-wt-msg--pending" : "") +
      (resolveReplySnippet(m) ? " has-reply" : "");
    if (kind === "system") {
      return (
        '<div class="' +
        cls +
        '" data-msg-id="' +
        esc(m.id) +
        '"><p class="vc-wt-msg__system">' +
        esc(m.content) +
        "</p></div>"
      );
    }
    var imgs = (m.imageUrls || [])
      .map(function (u) {
        var url = String(u || "");
        if (isVideoMediaUrl(url)) {
          return (
            '<a class="vc-wt-msg__img vc-wt-msg__img--video" href="' +
            esc(url) +
            '" target="_blank" rel="noopener noreferrer">' +
            '<video src="' +
            esc(url) +
            '" controls playsinline preload="metadata"></video></a>'
          );
        }
        return (
          '<a class="vc-wt-msg__img" href="' +
          esc(url) +
          '" target="_blank" rel="noopener noreferrer"><img src="' +
          esc(url) +
          '" alt="" loading="lazy" decoding="async" /></a>'
        );
      })
      .join("");
    var canCopy = Boolean(String(m.content || "").trim());
    var tools = "";
    if (canCopy || canEdit || canDelete || canReply) {
      tools =
        '<div class="vc-wt-msg__tools">' +
        (canReply
          ? '<button type="button" class="vc-wt-msg__tool" data-msg-reply="' +
            esc(m.id) +
            '" title="Rispondi" aria-label="Rispondi"><i class="fa fa-reply" aria-hidden="true"></i></button>'
          : "") +
        (canCopy
          ? '<button type="button" class="vc-wt-msg__tool" data-msg-copy="' +
            esc(m.id) +
            '" title="Copia testo" aria-label="Copia testo"><i class="fa fa-clipboard" aria-hidden="true"></i></button>'
          : "") +
        (canEdit
          ? '<button type="button" class="vc-wt-msg__tool" data-msg-edit="' +
            esc(m.id) +
            '" title="Modifica" aria-label="Modifica"><i class="fa fa-pencil" aria-hidden="true"></i></button>'
          : "") +
        (canDelete
          ? '<button type="button" class="vc-wt-msg__tool vc-wt-msg__tool--danger" data-msg-del="' +
            esc(m.id) +
            '" title="Elimina" aria-label="Elimina"><i class="fa fa-trash-o" aria-hidden="true"></i></button>'
          : "") +
        "</div>";
    }
    var when = pending
      ? { label: "Invio…", title: "", datetime: "" }
      : formatBubbleTime(m.createdAt);
    return (
      '<div class="' +
      cls +
      '" data-msg-id="' +
      esc(m.id) +
      '">' +
      avatarHtml(resolveMessageAvatarUrl(m), displayMessageAuthorName(m), "vc-wt-msg__avatar") +
      '<div class="vc-wt-msg__main">' +
      '<div class="vc-wt-msg__stack">' +
      '<div class="vc-wt-msg__bubble">' +
      replyPreviewHtml(m) +
      '<div class="vc-wt-msg__meta"><strong>' +
      esc(displayMessageAuthorName(m)) +
      "</strong>" +
      (kind === "bot" || kind === "staff" || kind === "user"
        ? authorRoleBadgeHtml(m, kind)
        : "") +
      (kind === "staff" ? staffAvgStarsHtml(m.authorAvgRating) : "") +
      "<time" +
      (when.datetime ? ' datetime="' + esc(when.datetime) + '"' : "") +
      (when.title ? ' title="' + esc(when.title) + '"' : "") +
      ">" +
      esc(when.label) +
      "</time>" +
      (m.editedAt ? '<span class="vc-wt-msg__edited">(modificato)</span>' : "") +
      "</div>" +
      (m.content ? '<div class="vc-wt-msg__text">' + formatMessageContent(m.content) + "</div>" : "") +
      (imgs ? '<div class="vc-wt-msg__gallery">' + imgs + "</div>" : "") +
      (pending ? "" : reactionsBarHtml(m, closed)) +
      "</div>" +
      tools +
      "</div></div></div>"
    );
  }

  function staffAvgStarsHtml(avg) {
    var n = Number(avg);
    if (!isFinite(n) || n <= 0) return "";
    var rounded = Math.max(1, Math.min(5, Math.round(n)));
    var label = (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
    var stars = "";
    for (var i = 1; i <= 5; i += 1) {
      stars +=
        '<i class="fa ' +
        (i <= rounded ? "fa-star" : "fa-star-o") +
        '" aria-hidden="true"></i>';
    }
    return (
      '<span class="vc-wt-msg__rating" title="Media valutazioni ticket: ' +
      esc(label) +
      '/5">' +
      stars +
      '<em>' +
      esc(label) +
      "</em></span>"
    );
  }

  function ticketPanelButtonsHtml(t) {
    if (!t || t.status === "closed") return "";
    var perms = (t.permissions && typeof t.permissions === "object" ? t.permissions : {}) || {};
    var btns = "";
    if (perms.canAddUsers) {
      btns += '<button type="button" class="vc-wt-action vc-wt-action--ok" data-act="add-user">Aggiungi utenti</button>';
    }
    if (perms.canRemoveUsers) {
      btns +=
        '<button type="button" class="vc-wt-action vc-wt-action--danger" data-act="remove-user">Rimuovi utenti</button>';
    }
    if (perms.canSwitchCategory) {
      btns += '<button type="button" class="vc-wt-action" data-act="switch-cat">Cambia categoria</button>';
    }
    if (perms.canRename) {
      btns += '<button type="button" class="vc-wt-action" data-act="rename">Rinomina</button>';
    }
    if (perms.canCloseRequest) {
      btns +=
        '<button type="button" class="vc-wt-action vc-wt-action--ghost" data-act="close-request">Richiedi chiusura</button>';
    }
    if (perms.canTransfer) {
      btns += '<button type="button" class="vc-wt-action" data-act="transfer">Trasferisci</button>';
    }
    return btns;
  }

  function chatHeadHtml(t) {
    if (!t) return "";
    var perms = (t.permissions && typeof t.permissions === "object" ? t.permissions : {}) || {};
    var actions = ticketPanelButtonsHtml(t);
    if (t.status !== "closed") {
      if (perms.canClaim) {
        actions += '<button type="button" class="vc-wt-action" data-act="claim">Claim</button>';
      } else if (perms.canUnclaim) {
        actions += '<button type="button" class="vc-wt-action vc-wt-action--ghost" data-act="unclaim">Rilascia</button>';
      }
      if (perms.canClose) {
        actions += '<button type="button" class="vc-wt-action vc-wt-action--danger" data-act="close">Chiudi</button>';
      }
    }
    return (
      '<div id="vc-wt-chat-top">' +
      '<header id="vc-wt-chat-head" class="vc-wt-chat__head">' +
      '<div class="vc-wt-chat__title">' +
      "<h2>" +
      esc(ticketDisplayName(t)) +
      "</h2>" +
      '<p><span class="vc-wt-pill ' +
      statusClass(t) +
      '">' +
      esc(statusLabel(t)) +
      "</span> #" +
      esc(t.ticketNumber) +
      " · " +
      esc(t.categoryLabel || "") +
      (t.claimedByName ? " · " + esc(t.claimedByName) : "") +
      "</p></div>" +
      '<div class="vc-wt-chat__actions">' +
      actions +
      "</div></header>" +
      ticketPanelExtrasHtml(t) +
      "</div>"
    );
  }

  function ticketPanelExtrasHtml(t) {
    if (!t || t.status === "closed") return "";
    var perms = (t.permissions && typeof t.permissions === "object" ? t.permissions : {}) || {};
    var banner = "";
    if (t.closeRequestedAt) {
      var who = t.closeRequestedByName || "Lo staff";
      var reasonBit = t.closeRequestReason ? " · " + esc(t.closeRequestReason) : "";
      var isOwnerViewer = String(t.userId || "") === String(state.viewerId || "");
      var canRespond = Boolean(perms.canRespondCloseRequest) || (isOwnerViewer && t.status !== "closed");
      if (canRespond) {
        banner =
          '<div class="vc-wt-panel__banner">' +
          "<p><strong>Richiesta di chiusura</strong> da " +
          esc(who) +
          reasonBit +
          "</p>" +
          '<div class="vc-wt-panel__banner-act">' +
          '<button type="button" class="vc-wt-action" data-act="close-accept">Accetta e chiudi</button>' +
          '<button type="button" class="vc-wt-action vc-wt-action--ghost" data-act="close-reject">Rifiuta</button>' +
          "</div></div>";
      } else {
        banner =
          '<div class="vc-wt-panel__banner vc-wt-panel__banner--info"><p>Richiesta di chiusura in attesa' +
          reasonBit +
          ".</p></div>";
      }
    }
    var guests = "";
    var added = Array.isArray(t.addedUsers) ? t.addedUsers : [];
    if (added.length && (perms.isStaffViewer || perms.canAddUsers || perms.canRemoveUsers)) {
      guests =
        '<p class="vc-wt-panel__guests">Utenti aggiunti: ' +
        added
          .map(function (u) {
            return esc(u.name || u.id);
          })
          .join(", ") +
        "</p>";
    }
    if (!banner && !guests) return "";
    return '<div id="vc-wt-ticket-panel" class="vc-wt-panel">' + guests + banner + "</div>";
  }

  function composerLockedReason() {
    var t = state.detail;
    if (!t) return "";
    if (t.status === "closed") return "closed";
    var perms = t.permissions || {};
    if (perms.canReply !== false) return "";
    if (String(t.claimedBy || "").trim()) return "claimed";
    if (perms.isStaffViewer) return "unclaimed";
    return "claimed";
  }

  function composerHtml() {
    var lock = composerLockedReason();
    if (lock === "closed") {
      return (
        '<div class="vc-wt-composer vc-wt-composer--closed">' +
        "<p>Ticket chiuso. Puoi aprirne uno nuovo dalla lista.</p>" +
        "</div>"
      );
    }
    if (lock === "unclaimed") {
      return (
        '<div class="vc-wt-composer vc-wt-composer--closed">' +
        "<p>Clicca <strong>Claim</strong> per scrivere in questo ticket.</p>" +
        "</div>"
      );
    }
    if (lock === "claimed") {
      var name = String((state.detail && state.detail.claimedByName) || "").trim() || "uno staff";
      return (
        '<div class="vc-wt-composer vc-wt-composer--closed">' +
        "<p>Ticket in carico a " +
        esc(name) +
        ". Puoi leggere, ma non scrivere.</p>" +
        "</div>"
      );
    }
    return (
      '<form id="vc-wt-composer" class="vc-wt-composer' +
      (state.replyTo && state.replyTo.id ? " is-replying" : "") +
      '" autocomplete="off">' +
      composerReplyBarHtml() +
      '<div id="vc-wt-composer-previews" class="vc-wt-composer__previews" hidden></div>' +
      '<div class="vc-wt-composer__row">' +
      '<label class="vc-wt-composer__attach" title="Allega immagine, GIF o video">' +
      '<i class="fa fa-picture-o" aria-hidden="true"></i>' +
      '<input type="file" id="vc-wt-composer-file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple hidden />' +
      "</label>" +
      '<button type="button" class="vc-wt-composer__emoji" id="vc-wt-composer-emoji" title="Emoji" aria-label="Emoji"><i class="fa fa-smile-o" aria-hidden="true"></i></button>' +
      '<div class="vc-wt-composer__editor">' +
      '<div class="vc-wt-composer__md-live" aria-hidden="true"></div>' +
      '<div id="vc-wt-composer-text" class="vc-wt-composer__input" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="' +
      esc(
        (state.detail && state.detail.permissions && state.detail.permissions.canUseCommands
          ? "Scrivi un messaggio… (@ utenti, # canali, +desc / /partnership)"
          : "Scrivi un messaggio… (@ utenti, # canali)") ,
      ) +
      '" spellcheck="true"></div></div>' +
      '<button type="submit" class="vc-wt-composer__send" aria-label="Invia"><i class="fa fa-paper-plane" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div id="vc-wt-typing" class="vc-chat-typing" hidden aria-live="polite"></div>' +
      "</form>"
    );
  }

  function ratingDockHtml(t, opts) {
    opts = opts || {};
    var panel = ratingPanelHtml(t);
    if (!panel) return "";
    return (
      '<div class="vc-wt-rate-dock' +
      (opts.settled ? " is-settled" : "") +
      '" id="vc-wt-rate-dock">' +
      panel +
      "</div>"
    );
  }

  function settleRateDockSoon() {
    var dock = byId("vc-wt-rate-dock");
    if (!dock || dock.classList.contains("is-settled")) return;
    window.setTimeout(function () {
      var el = byId("vc-wt-rate-dock");
      if (el) el.classList.add("is-settled");
    }, 560);
  }

  function ratingStarsInputHtml(kind, value) {
    var out = '<div class="vc-wt-rate__stars" data-rate-kind="' + esc(kind) + '" role="radiogroup">';
    for (var i = 1; i <= 5; i += 1) {
      var on = i <= value;
      out +=
        '<button type="button" class="vc-wt-rate__star' +
        (on ? " is-on" : "") +
        '" data-rate-set="' +
        esc(kind) +
        '" data-rate-value="' +
        esc(String(i)) +
        '" aria-label="' +
        esc(String(i) + " stelle") +
        '"><i class="fa ' +
        (on ? "fa-star" : "fa-star-o") +
        '" aria-hidden="true"></i></button>';
    }
    return out + "</div>";
  }

  function ratingStarsStaticHtml(value) {
    var n = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    var out = '<span class="vc-wt-rate__static">';
    for (var i = 1; i <= 5; i += 1) {
      out +=
        '<i class="fa ' +
        (i <= n ? "fa-star" : "fa-star-o") +
        '" aria-hidden="true"></i>';
    }
    return out + "</span>";
  }

  function resolveRateableFromTicket(t) {
    if (!t) return null;
    var owner = String(t.userId || "").trim();
    var id = String(t.rateableStafferId || "").trim();
    var name = String(t.rateableStafferName || "").trim();
    if (id) return { id: id, name: name || "Staff" };
    id = String(t.ratedStafferId || "").trim();
    name = String(t.ratedStafferName || "").trim();
    if (id) return { id: id, name: name || "Staff" };
    id = String(t.claimedBy || "").trim();
    if (id && id !== owner) {
      return { id: id, name: String(t.claimedByName || "").trim() || "Staff" };
    }
    id = String(t.closedBy || "").trim();
    if (id && id !== owner) {
      return { id: id, name: String(t.closedByName || "").trim() || "Staff" };
    }
    return null;
  }

  function ratingPanelHtml(t) {
    if (!t) return "";
    var perms = (t.permissions && typeof t.permissions === "object" ? t.permissions : {}) || {};
    var rateable = resolveRateableFromTicket(t);
    var staffName =
      String(
        (rateable && rateable.name) ||
          t.rateableStafferName ||
          t.ratedStafferName ||
          t.claimedByName ||
          t.closedByName ||
          "lo staff",
      ).trim() || "lo staff";
    var already =
      t.ratingAt ||
      (t.ratingStafferScore != null && Number(t.ratingStafferScore) > 0) ||
      (t.ratingTicketScore != null && Number(t.ratingTicketScore) > 0);

    if (already) {
      return (
        '<div class="vc-wt-rate vc-wt-rate--done" role="status">' +
        '<div class="vc-wt-rate__glow" aria-hidden="true"></div>' +
        '<div class="vc-wt-rate__head">' +
        '<span class="vc-wt-rate__badge" aria-hidden="true"><i class="fa fa-check"></i></span>' +
        "<div><strong>Grazie per la valutazione</strong>" +
        "<p>Hai lasciato un feedback su questo ticket e su " +
        esc(staffName) +
        ".</p></div></div>" +
        '<div class="vc-wt-rate__summary">' +
        "<div><span>Ticket</span>" +
        ratingStarsStaticHtml(t.ratingTicketScore) +
        "</div>" +
        "<div><span>" +
        esc(staffName) +
        "</span>" +
        ratingStarsStaticHtml(t.ratingStafferScore) +
        "</div></div></div>"
      );
    }

    var closed = String(t.status || "") === "closed";
    var isOwner = String(t.userId || "") === String(state.viewerId || "");
    var canRate = Boolean(perms.canRate) || Boolean(closed && isOwner && rateable);
    if (!canRate || !rateable) return "";

    var ticketVal = Math.max(0, Math.min(5, Math.round(Number(state.rateDraftTicket) || 0)));
    var stafferVal = Math.max(0, Math.min(5, Math.round(Number(state.rateDraftStaffer) || 0)));
    return (
      '<div class="vc-wt-rate" id="vc-wt-rate-panel">' +
      '<div class="vc-wt-rate__glow" aria-hidden="true"></div>' +
      '<div class="vc-wt-rate__head">' +
      '<span class="vc-wt-rate__badge" aria-hidden="true"><i class="fa fa-star"></i></span>' +
      "<div><strong>Valuta questo ticket</strong>" +
      "<p>Il tuo feedback aiuta lo staff a migliorare. Valuta l’esperienza e " +
      esc(staffName) +
      ".</p></div></div>" +
      '<div class="vc-wt-rate__rows">' +
      '<div class="vc-wt-rate__row"><span>Esperienza ticket</span>' +
      ratingStarsInputHtml("ticket", ticketVal) +
      "</div>" +
      '<div class="vc-wt-rate__row"><span>' +
      esc(staffName) +
      "</span>" +
      ratingStarsInputHtml("staffer", stafferVal) +
      "</div></div>" +
      '<button type="button" class="vc-wt-rate__submit" data-act="rate-ticket"' +
      (ticketVal && stafferVal ? "" : " disabled") +
      ">Invia valutazione</button>" +
      "</div>"
    );
  }

  function composePanelHtml() {
    var cats = (state.categories || []).length
      ? state.categories
      : [
          { id: "supporto", label: "Supporto", description: CATEGORY_DESCRIPTIONS_FALLBACK.supporto },
          { id: "partnership", label: "Partnership", description: CATEGORY_DESCRIPTIONS_FALLBACK.partnership },
          { id: "high", label: "High Staff", description: CATEGORY_DESCRIPTIONS_FALLBACK.high },
          { id: "perks", label: "Perks", description: CATEGORY_DESCRIPTIONS_FALLBACK.perks },
        ];
    var icons = {
      supporto: "fa-life-ring",
      partnership: "fa-handshake-o",
      high: "fa-star",
      perks: "fa-diamond",
    };
    var shortDesc = {
      supporto: "Segnalazioni, bug e richieste generali",
      partnership: "Proposte di collaborazione",
      high: "Donazioni, sponsor o admin",
      perks: "Selfie e ruoli supporter",
    };
    return (
      '<div class="vc-wt-compose-panel vc-wt-compose-panel--instant">' +
      '<div class="vc-wt-compose-panel__head"><h2>Apri un ticket</h2>' +
      '<button type="button" class="vc-wt-action vc-wt-action--ghost" data-act="cancel-compose">Annulla</button></div>' +
      '<p class="vc-wt-compose-panel__lead">Scegli una categoria: si apre subito.</p>' +
      '<div class="vc-wt-open-grid">' +
      cats
        .map(function (c) {
          var ico = icons[c.id] || "fa-ticket";
          var desc = shortDesc[c.id] || c.description || "";
          return (
            '<button type="button" class="vc-wt-open-card" data-open-cat="' +
            esc(c.id) +
            '" title="' +
            esc(c.description || c.label || "") +
            '">' +
            '<span class="vc-wt-open-card__ico" aria-hidden="true"><i class="fa ' +
            ico +
            '"></i></span>' +
            '<span class="vc-wt-open-card__copy"><strong>' +
            esc(c.label) +
            "</strong>" +
            (desc ? "<small>" + esc(desc) + "</small>" : "") +
            "</span></button>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }

  function chatPaneHtml() {
    if (state.composeOpen && !isStaffMode) return composePanelHtml();
    if (!state.detail) {
      return (
        '<div class="vc-wt-chat vc-wt-chat--empty">' +
        '<div class="vc-wt-chat-empty">' +
        '<span class="vc-wt-chat-empty__icon" aria-hidden="true"><i class="fa fa-comments-o"></i></span>' +
        "<strong>" +
        (isStaffMode ? "Seleziona un ticket" : "Nessuna chat aperta") +
        "</strong>" +
        "<p>" +
        (isStaffMode
          ? "Apri una conversazione dalla lista per rispondere in tempo reale."
          : "Scegli un ticket a sinistra, oppure usa + per aprirne uno nuovo.") +
        "</p>" +
        (!isStaffMode
          ? '<button type="button" class="vc-reviews-submit" data-act="compose">Apri un ticket</button>'
          : "") +
        "</div></div>"
      );
    }
    var closed = state.detail.status === "closed";
    return (
      '<div class="vc-wt-chat' +
      (closed ? " vc-wt-chat--closed" : "") +
      '">' +
      chatHeadHtml(state.detail) +
      '<div class="vc-wt-chat__stage">' +
      '<div id="vc-wt-chat-log" class="vc-wt-chat__log">' +
      state.messages.map(messageHtml).join("") +
      "</div>" +
      "</div>" +
      (closed ? ratingDockHtml(state.detail, { settled: true }) : "") +
      composerHtml() +
      "</div>"
    );
  }

  function closeAllCatDd() {
    document.querySelectorAll("[data-cat-dd]").forEach(function (dd) {
      dd.classList.remove("is-open");
      var menu = dd.querySelector("[data-cat-dd-menu]");
      var btn = dd.querySelector("[data-cat-dd-toggle]");
      if (menu) menu.hidden = true;
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  function dismissFloatingUi() {
    closeAllCatDd();
    hideMentionMenu();
    hideCommandMenu();
    hideReactionTipPortal();
    if (window.VcEmojiPicker && typeof window.VcEmojiPicker.close === "function") {
      state.emojiPickerToken += 1;
      state.emojiPickerOpening = false;
      window.VcEmojiPicker.close();
    }
  }

  function looksLikeStaffCommand(text) {
    return /^[+!/]/.test(String(text || "").trim());
  }

  function refreshListActiveState() {
    document.querySelectorAll(".vc-wt-item[data-ticket-id]").forEach(function (btn) {
      var tid = btn.getAttribute("data-ticket-id");
      btn.classList.toggle("is-active", tid === state.selectedId);
    });
  }

  function wireChatPaneOnly() {
    wireChatActions();
    wireComposer();
    wireRatingPanel();
    var chat = document.querySelector(".vc-wt-chat");
    if (chat) {
      wireMessageReactions(chat);
      wireMessageTools(chat);
    }
  }

  function refreshChatPane() {
    withPageScrollPreserved(function () {
      dismissFloatingUi();
      hideStatusToast();
      var main = document.querySelector(".vc-wt-main");
      if (!main) {
        renderShell();
        return;
      }
      main.classList.toggle("vc-wt-main--active", Boolean(state.selectedId));
      main.innerHTML = chatPaneHtml();
      wireChatPaneOnly();
      refreshListActiveState();
    });
  }

  function renderShell() {
    withPageScrollPreserved(function () {
      dismissFloatingUi();
      hideStatusToast();
      var app = byId("vc-wt-app");
      if (!app) return;
      app.hidden = false;
      app.innerHTML =
        '<div class="vc-wt-chrome">' +
        scopeSwitcherHtml() +
        filtersHtml() +
        '<div class="vc-wt-layout">' +
        '<aside class="vc-wt-sidebar">' +
        '<div class="vc-wt-sidebar__top">' +
        "<h2>" +
        (isStaffMode ? "Staff" : "Personali") +
        "</h2>" +
        "</div>" +
        '<div id="vc-wt-list" class="vc-wt-list">' +
        ticketListHtml() +
        "</div>" +
        '<div id="vc-wt-pager-wrap">' +
        ticketListPagerHtml() +
        "</div></aside>" +
        '<section class="vc-wt-main' +
        (state.selectedId ? " vc-wt-main--active" : "") +
        '">' +
        chatPaneHtml() +
        "</section></div></div>";
      wireAll();
    });
  }

  var COMPOSER_MEDIA_MAX = 3;
  var COMPOSER_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
  var COMPOSER_MEDIA_TYPES = {
    "image/png": true,
    "image/jpeg": true,
    "image/jpg": true,
    "image/webp": true,
    "image/gif": true,
    "video/mp4": true,
    "video/webm": true,
    "video/quicktime": true,
  };

  function isAllowedComposerMedia(file) {
    if (!file) return false;
    var t = String(file.type || "").toLowerCase();
    if (COMPOSER_MEDIA_TYPES[t]) return true;
        var name = String(file.name || "").toLowerCase();
    return /\.(png|jpe?g|webp|gif|mp4|webm|mov)$/.test(name);
  }

  function isVideoMediaUrl(src) {
    var s = String(src || "");
    if (/^data:video\//i.test(s)) return true;
    return /\.(mp4|webm|mov)(?:\?|#|$)/i.test(s);
  }

  function readFilesAsDataUrls(fileList, maxCount) {
    var files = Array.prototype.slice.call(fileList || [], 0, maxCount || COMPOSER_MEDIA_MAX);
    var skipped = 0;
    return Promise.all(
      files.map(function (file) {
        return new Promise(function (resolve) {
          if (!isAllowedComposerMedia(file)) {
            skipped += 1;
            return resolve(null);
          }
          if (file.size > COMPOSER_MEDIA_MAX_BYTES) {
            skipped += 1;
            return resolve(null);
          }
          var reader = new FileReader();
          reader.onload = function () {
            resolve(String(reader.result || ""));
          };
          reader.onerror = function () {
            resolve(null);
          };
          reader.readAsDataURL(file);
        });
      }),
    ).then(function (arr) {
      return { urls: arr.filter(Boolean), skipped: skipped };
    });
  }

  function addComposerMediaFiles(fileList) {
    var room = Math.max(0, COMPOSER_MEDIA_MAX - (state.composerImages || []).length);
    if (room <= 0) {
      setStatus("Puoi allegare al massimo " + COMPOSER_MEDIA_MAX + " file.", true);
      return Promise.resolve();
    }
    var incoming = Array.prototype.slice.call(fileList || []);
    if (!incoming.length) return Promise.resolve();
    return readFilesAsDataUrls(incoming, room).then(function (result) {
      var urls = (result && result.urls) || [];
      if (!urls.length) {
        setStatus(
          result && result.skipped
            ? "File non valido (immagini/GIF/video, max 8 MB)."
            : "Nessun media da allegare.",
          true,
        );
        return;
      }
      state.composerImages = (state.composerImages || []).concat(urls).slice(0, COMPOSER_MEDIA_MAX);
      renderPreviews("vc-wt-composer-previews", state.composerImages);
      if (result.skipped) {
        setStatus("Alcuni file sono stati saltati (tipo o dimensione).", true);
      } else {
        setStatus("");
      }
    });
  }

  function renderPreviews(elId, images) {
    var el = byId(elId);
    if (!el) return;
    if (!images.length) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = images
      .map(function (src, i) {
        var media = isVideoMediaUrl(src)
          ? '<video src="' + esc(src) + '" muted playsinline preload="metadata"></video>'
          : '<img src="' + esc(src) + '" alt="" />';
        return (
          '<span class="vc-wt-preview' +
          (isVideoMediaUrl(src) ? " vc-wt-preview--video" : "") +
          '">' +
          media +
          '<button type="button" data-rm-img="' +
          i +
          '" aria-label="Rimuovi">&times;</button></span>'
        );
      })
      .join("");
  }

  function wireListClicks() {
    var list = byId("vc-wt-list");
    if (!list) return;
    list.querySelectorAll("[data-ticket-id]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        var y = pageScrollY();
        var listY = Number(list.scrollTop) || 0;
        openTicket(btn.getAttribute("data-ticket-id"));
        restorePageScroll(y);
        try {
          list.scrollTop = listY;
        } catch (eListClick) {}
        requestAnimationFrame(function () {
          restorePageScroll(y);
          try {
            var list2 = byId("vc-wt-list");
            if (list2) list2.scrollTop = listY;
          } catch (eList2) {}
        });
      });
    });
  }

  function wireListPager() {
    var wrap = byId("vc-wt-pager-wrap");
    if (!wrap) return;
    var mp = window.__vcMiniPager;
    var mini = wrap.querySelector(".vc-mini-pager");
    if (mp && mini && typeof mp.bind === "function") {
      mp.bind(mini, {
        go: function (page) {
          goToListPage(page);
        },
      });
      return;
    }
    wrap.querySelectorAll("[data-list-page]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        goToListPage(btn.getAttribute("data-list-page"));
      });
    });
  }

  function refreshListPane() {
    var list = byId("vc-wt-list");
    if (list) {
      list.innerHTML = ticketListHtml();
      wireListClicks();
      wireEmojiImgFallback(list);
    }
    var pager = byId("vc-wt-pager-wrap");
    if (pager) {
      pager.innerHTML = ticketListPagerHtml();
      wireListPager();
    }
  }

  function wireChatActions() {
    /* ticketActionFail1 */
    document.querySelectorAll("[data-act]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function (ev) {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
        var act = btn.getAttribute("data-act");
        var y = capturePageScrollY();
        var opensOverlay =
          act === "close" ||
          act === "close-request" ||
          act === "add-user" ||
          act === "remove-user" ||
          act === "switch-cat" ||
          act === "rename" ||
          act === "transfer" ||
          act === "rate-ticket";
        var run = function () {
        if (act === "compose") {
          state.composeOpen = true;
          clearTicketSelection();
          state.composeOpen = true;
          renderShell();
          return;
        }
        if (act === "cancel-compose") {
          state.composeOpen = false;
          renderShell();
          return;
        }
        if (act === "claim") return postAction("/claim", null, y);
        if (act === "unclaim") return postAction("/unclaim", null, y);
        if (act === "rate-ticket") return submitTicketRating();
        if (act === "close") {
          var closePerms = (state.detail && state.detail.permissions) || {};
          if (closePerms.canClose && isStaffMode && String(state.detail.userId) !== String(state.viewerId)) {
            askCloseReason().then(function (reason) {
              /* ticketModalScrollStay2: ripristina Y salvato prima del modal */
              restorePageScroll(y);
              if (reason === null) return;
              return postAction("/close", { reason: reason }, y);
            });
            return;
          }
          askCloseConfirm().then(function (ok) {
            restorePageScroll(y);
            if (ok) return postAction("/close", null, y);
          });
          return;
        }
        if (act === "add-user") {
          pickTicketUser({
            title: "Aggiungi utente",
            message: "Cerca e scegli chi aggiungere a questo ticket.",
          }).then(function (userId) {
            restorePageScroll(y);
            if (userId) postAction("/members", { userId: userId }, y);
          });
          return;
        }
        if (act === "remove-user") {
          pickAddedUser().then(function (userId) {
            restorePageScroll(y);
            if (userId) postAction("/members/remove", { userId: userId }, y);
          });
          return;
        }
        if (act === "switch-cat") {
          pickTicketCategory().then(function (category) {
            restorePageScroll(y);
            if (category) postAction("/category", { category: category }, y);
          });
          return;
        }
        if (act === "rename") {
          askRenameSubject().then(function (subject) {
            restorePageScroll(y);
            if (subject) postAction("/rename", { subject: subject }, y);
          });
          return;
        }
        if (act === "close-request") {
          askCloseRequestReason().then(function (reason) {
            restorePageScroll(y);
            if (reason === null) return;
            return postAction("/close-request", { reason: reason }, y);
          });
          return;
        }
        if (act === "transfer") {
          pickTicketUser({
            title: "Trasferisci claim",
            message: "Scegli uno staffer che può gestire questa categoria.",
            claimEligible: true,
          }).then(function (userId) {
            restorePageScroll(y);
            if (userId) postAction("/transfer", { userId: userId }, y);
          });
          return;
        }
        if (act === "close-accept") return postAction("/close-request/accept", null, y);
        if (act === "close-reject") return postAction("/close-request/reject", null, y);
        };
        /* ticketDialogScrollFight1: overlay/dialog → no restore immediato (combatte col pin) */
        if (opensOverlay) {
          run();
        } else {
          withPageScrollPreserved(run);
          restorePageScroll(y);
        }
      });
    });
  }

  function askCloseConfirm() {
    return (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.confirm !== "function") return false;
      return D.confirm({
        title: "Chiudi ticket",
        message: "Vuoi chiudere questo ticket?",
        confirmLabel: "Chiudi",
        cancelLabel: "Annulla",
        danger: true,
        icon: "fa-times-circle",
      });
    });
  }

  function askCloseReason() {
    return (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.prompt !== "function") return null;
      return D.prompt({
        title: "Chiudi ticket",
        message: "Puoi lasciare un motivo opzionale per l’utente.",
        label: "Motivo chiusura (opzionale)",
        placeholder: "Es. risolto, spam, fuori tema…",
        confirmLabel: "Chiudi ticket",
        cancelLabel: "Annulla",
        danger: true,
        icon: "fa-times-circle",
        maxLength: 500,
      }).then(function (value) {
        if (value === null) return null;
        return String(value || "").trim();
      });
    });
  }

  function askRenameSubject() {
    var current =
      (state.detail && (state.detail.renameTail || state.detail.authorName)) || "";
    return (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.prompt !== "function") return null;
      return D.prompt({
        title: "Rinomina ticket",
        message: "Come su Discord: resta la categoria, cambia solo lo username.",
        label: "Username",
        placeholder: current || "username",
        defaultValue: current,
        confirmLabel: "Rinomina",
        cancelLabel: "Annulla",
        icon: "fa-pencil",
        maxLength: 32,
      }).then(function (value) {
        if (value === null) return null;
        var s = String(value || "").trim();
        return s || null;
      });
    });
  }

  function askCloseRequestReason() {
    return (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.prompt !== "function") return null;
      return D.prompt({
        title: "Richiedi chiusura",
        message: "L’utente potrà accettare o rifiutare. Il motivo è opzionale.",
        label: "Motivo (opzionale)",
        placeholder: "Es. richiesta risolta…",
        confirmLabel: "Invia richiesta",
        cancelLabel: "Annulla",
        icon: "fa-times-circle",
        maxLength: 1800,
      }).then(function (value) {
        if (value === null) return null;
        return String(value || "").trim();
      });
    });
  }

  function askPartnershipDescription(defaultValue) {
    return (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.prompt !== "function") return null;
      return D.prompt({
        title: "Invia partnership",
        message: "Come sul modulo Discord: incolla la descrizione del server con un invite valido.",
        label: "Descrizione del server",
        placeholder: "Inserisci qui la descrizione… (discord.gg/…)",
        defaultValue: defaultValue || "",
        confirmLabel: "Pubblica partnership",
        cancelLabel: "Annulla",
        icon: "fa-handshake-o",
        multiline: true,
        maxLength: 1800,
      }).then(function (value) {
        if (value === null) return null;
        var s = String(value || "").trim();
        return s || null;
      });
    });
  }

  function parsePartnershipComposerInput(text) {
    var raw = String(text || "").trim();
    var body = raw.replace(/^\/+partnership\b/i, "").trim();
    var managerId = "";
    var description = body;
    var mention = body.match(/^<@!?(\d{15,22})>([\s\S]*)$/);
    if (mention) {
      managerId = mention[1];
      description = String(mention[2] || "").trim();
      return { managerId: managerId, description: description };
    }
    var bare = body.match(/^(\d{15,22})(?:\s+([\s\S]*))?$/);
    if (bare) {
      managerId = bare[1];
      description = String(bare[2] || "").trim();
    }
    return { managerId: managerId, description: description };
  }

  function needsPartnershipForm(text) {
    var raw = String(text || "").trim();
    if (!/^\/partnership\b/i.test(raw)) return false;
    var parsed = parsePartnershipComposerInput(raw);
        return !String(parsed.description || "").trim();
  }

  function invalidateCommandCatalog() {
    state.commandCatalogLoaded = false;
    state.commandCatalogTicketId = "";
    state.commandCatalogLoading = null;
    state.commandCatalogLoadTicketId = "";
  }

  function runPartnershipCommandFlow(seedText) {
    if (state.partnershipFlowOpen) return Promise.resolve(null);
    // Non restare bloccati da un busy stale dopo un comando precedente.
    state.busy = false;
    state.partnershipFlowOpen = true;
    var parsed = parsePartnershipComposerInput(seedText || "/partnership");
    var managerPromise = parsed.managerId
      ? Promise.resolve(parsed.managerId)
      : pickTicketUser({
          title: "Manager partnership",
          message: "Come su Discord: scegli l’utente manager della partnership.",
        });
    return managerPromise
      .then(function (managerId) {
        if (!managerId) {
          setStatus("Partnership annullata.", true);
          return null;
        }
        return askPartnershipDescription(parsed.description || "").then(function (description) {
          if (!description) {
            setStatus("Partnership annullata.", true);
            return null;
          }
          runTicketCommand("/partnership <@" + managerId + ">\n" + description);
          return true;
        });
      })
      .catch(function () {
        setStatus("Partnership annullata.", true);
        return null;
      })
      .then(function (result) {
        state.partnershipFlowOpen = false;
        return result;
      });
  }

  function pickTicketCategory() {
    var current = String((state.detail && state.detail.category) || "");
    var cats = [
      { id: "supporto", label: "Supporto" },
      { id: "partnership", label: "Partnership" },
      { id: "high", label: "High Staff" },
      { id: "perks", label: "Perks" },
    ].filter(function (c) {
      return c.id !== current;
    });
    return (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.choose !== "function") return null;
      return D.choose({
        title: "Cambia categoria",
        message: "Scegli la nuova categoria del ticket.",
        icon: "fa-exchange",
        cancelLabel: "Annulla",
        choices: cats.map(function (c) {
          return { id: c.id, label: c.label };
        }),
      });
    });
  }

  function pickAddedUser() {
    var added = (state.detail && Array.isArray(state.detail.addedUsers) && state.detail.addedUsers) || [];
    if (!added.length) {
      return (typeof window.__vcEnsureDialog === "function"
        ? window.__vcEnsureDialog()
        : Promise.resolve(window.VcDialog)
      ).then(function (D) {
        if (D && typeof D.alert === "function") {
          return D.alert({
            title: "Rimuovi utenti",
            message: "Non ci sono utenti extra in questo ticket. Prima aggiungine uno.",
            icon: "fa-user-times",
          }).then(function () {
            return null;
          });
        }
        setStatus("Nessun utente extra da rimuovere.", true);
        return null;
      });
    }
    return (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.choose !== "function") return null;
      return D.choose({
        title: "Rimuovi utente",
        message: "Chi vuoi togliere da questo ticket?",
        icon: "fa-user-times",
        cancelLabel: "Annulla",
        choices: added.map(function (u) {
          return { id: String(u.id), label: String(u.name || u.id), danger: true };
        }),
      });
    });
  }

  function ensureUserPickOverlay() {
    var el = byId("vc-wt-user-pick");
    if (el) return el;
    el = document.createElement("div");
    el.id = "vc-wt-user-pick";
    el.className = "vc-wt-user-pick";
    el.hidden = true;
    el.innerHTML =
      '<button type="button" class="vc-wt-user-pick__backdrop" data-user-pick="cancel" aria-label="Chiudi"></button>' +
      '<div class="vc-wt-user-pick__panel" role="dialog" aria-modal="true" aria-labelledby="vc-wt-user-pick-title">' +
      '  <h3 id="vc-wt-user-pick-title">Scegli un utente</h3>' +
      '  <p class="vc-wt-user-pick__msg" id="vc-wt-user-pick-msg"></p>' +
      '  <input type="search" id="vc-wt-user-pick-q" class="vc-wt-user-pick__input" placeholder="Cerca nome o ID…" autocomplete="off" />' +
      '  <div id="vc-wt-user-pick-list" class="vc-wt-user-pick__list"></div>' +
      '  <button type="button" class="vc-wt-action vc-wt-action--ghost" data-user-pick="cancel">Annulla</button>' +
      "</div>";
    document.body.appendChild(el);
    return el;
  }

  function pickTicketUser(opts) {
    opts = opts || {};
    var overlay = ensureUserPickOverlay();
    var title = byId("vc-wt-user-pick-title");
    var msg = byId("vc-wt-user-pick-msg");
    var input = byId("vc-wt-user-pick-q");
    var list = byId("vc-wt-user-pick-list");
    if (title) title.textContent = opts.title || "Scegli un utente";
    if (msg) msg.textContent = opts.message || "";
    if (input) input.value = "";
    if (list) list.innerHTML = "<p class=\"vc-wt-user-pick__empty\">Scrivi per cercare…</p>";
    overlay.hidden = false;
    if (input) {
      setTimeout(function () {
        try {
          input.focus({ preventScroll: true });
        } catch (eFs) {
          try {
            input.focus();
          } catch (eFs2) {}
        }
      }, 30);
    }
    var timer = null;
    var settled = false;
    return new Promise(function (resolve) {
      function finish(value) {
        if (settled) return;
        settled = true;
        overlay.hidden = true;
        overlay.onclick = null;
        if (input) input.oninput = null;
        if (timer) clearTimeout(timer);
        resolve(value || null);
      }
      function renderRows(users) {
        if (!list) return;
        if (!users.length) {
          list.innerHTML = "<p class=\"vc-wt-user-pick__empty\">Nessun risultato.</p>";
          return;
        }
        list.innerHTML = users
          .map(function (u) {
            return (
              '<button type="button" class="vc-wt-user-pick__row" data-user-id="' +
              esc(u.id) +
              '">' +
              avatarHtml(u.avatarUrl, u.name, "vc-wt-user-pick__av") +
              "<span><strong>" +
              esc(u.name || "Utente") +
              "</strong><small>" +
              esc(u.username || u.id) +
              "</small></span></button>"
            );
          })
          .join("");
      }
      function search(q) {
        var url =
          apiBase() +
          "/mentions?kind=users&q=" +
          encodeURIComponent(q || "") +
          "&ticketId=" +
          encodeURIComponent(state.selectedId || "");
        if (opts.claimEligible) url += "&claimEligible=1";
        fetchJson(url, { method: "GET", headers: authHeaders(), cache: "no-store" })
          .then(function (out) {
            if (settled) return;
            var users = (out.data && Array.isArray(out.data.users) && out.data.users) || [];
            renderRows(users);
          })
          .catch(function () {
            if (!settled && list) list.innerHTML = "<p class=\"vc-wt-user-pick__empty\">Errore di ricerca.</p>";
          });
      }
      overlay.onclick = function (ev) {
        var cancel = ev.target && ev.target.closest && ev.target.closest("[data-user-pick='cancel']");
        if (cancel) {
          finish(null);
          return;
        }
        var row = ev.target && ev.target.closest && ev.target.closest("[data-user-id]");
        if (row) finish(row.getAttribute("data-user-id"));
      };
      if (input) {
        input.oninput = function () {
          if (timer) clearTimeout(timer);
          timer = setTimeout(function () {
            search(String(input.value || "").trim());
          }, 180);
        };
      }
      search("");
    });
  }

  function ensureGuildEmojis() {
    if (state.guildEmojisLoaded) return Promise.resolve(state.guildEmojis);
    if (state.guildEmojisLoading) {
      return new Promise(function (resolve) {
        var n = 0;
        var t = setInterval(function () {
          n += 1;
          if (state.guildEmojisLoaded || n > 40) {
            clearInterval(t);
            resolve(state.guildEmojis);
          }
        }, 100);
      });
    }
    state.guildEmojisLoading = true;
    return fetchJson(apiBase() + "/emojis", { headers: authHeaders(false) })
      .then(function (out) {
        state.guildEmojisLoading = false;
        state.guildEmojisLoaded = true;
        state.guildEmojis =
          out.data && out.data.ok && Array.isArray(out.data.emojis) ? out.data.emojis : [];
        if (out.data && out.data.guildId) state.guildId = String(out.data.guildId);
        refreshEmojiDependentUi();
        return state.guildEmojis;
      })
      .catch(function () {
        state.guildEmojisLoading = false;
        state.guildEmojisLoaded = true;
        state.guildEmojis = [];
        return state.guildEmojis;
      });
  }

  function refreshEmojiDependentUi() {
    refreshListPane();
    if (state.messages && state.messages.length && byId("vc-wt-chat-log")) {
      refreshChatLogMarkup();
    }
  }

  function isRichInput(el) {
    return Boolean(el && el.isContentEditable);
  }

  function customEmojiUrl(id, animated, size) {
    var sz = size || 32;
    if (window.VcEmojiPicker && typeof window.VcEmojiPicker.customUrl === "function") {
      return window.VcEmojiPicker.customUrl(id, Boolean(animated), sz);
    }
    if (animated) {
      return "https://cdn.discordapp.com/emojis/" + id + ".webp?size=" + sz + "&animated=true";
    }
    return "https://cdn.discordapp.com/emojis/" + id + ".webp?size=" + sz;
  }

  function makeEmojiTokenEl(markup, name, id, animated) {
    var img = document.createElement("img");
    img.className = "vc-wt-inline-emoji vc-wt-composer__emoji-token";
    img.src = customEmojiUrl(id, animated, 32);
    img.alt = ":" + (name || "emoji") + ":";
    img.title = ":" + (name || "emoji") + ":";
    img.draggable = false;
    img.setAttribute("data-emoji-markup", String(markup || ""));
    img.setAttribute("data-vc-emoji-id", String(id || ""));
    img.setAttribute("data-vc-emoji-animated", animated ? "1" : "0");
    return img;
  }

  function makeMentionTokenEl(item) {
    var span = document.createElement("span");
    var type =
      item && item.type === "channel" ? "channel" : item && item.type === "role" ? "role" : "user";
    span.className = "vc-wt-mention vc-wt-mention--" + type;
    span.contentEditable = "false";
    span.setAttribute("data-mention-markup", String((item && item.markup) || ""));
    span.setAttribute("data-mention-type", type);
    span.setAttribute("data-mention-id", String((item && item.id) || ""));
    var label =
      type === "channel"
        ? "#" + String((item && item.name) || "canale")
        : "@" + String((item && item.name) || (type === "role" ? "ruolo" : "utente"));
    if (type === "user" && item && item.roleName) {
      label += " · " + String(item.roleName);
      span.classList.add("is-staff");
      rememberStaffRole(item.id, item.roleId, item.roleName, item.roleKey);
    }
    span.textContent = label;
    rememberMentionName(type, item && item.id, item && item.name);
    return span;
  }

  function serializeRichInput(el) {
    if (!el) return "";
    if (!isRichInput(el)) return String(el.value || "");
    var out = "";
    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        out += String(node.nodeValue || "");
        return;
      }
      if (node.nodeType !== 1) return;
      var mention = node.getAttribute && node.getAttribute("data-mention-markup");
      if (mention) {
        out += mention;
        return;
      }
      var markup = node.getAttribute && node.getAttribute("data-emoji-markup");
      if (markup) {
        out += markup;
        return;
      }
      var tag = String(node.tagName || "").toUpperCase();
      if (tag === "BR") {
        out += "\n";
        return;
      }
      var kids = node.childNodes;
      for (var i = 0; i < kids.length; i += 1) walk(kids[i]);
      if ((tag === "DIV" || tag === "P") && node !== el) out += "\n";
    }
    walk(el);
    return out.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "").slice(0, 2000);
  }

  function fillRichInput(el, text) {
    if (!el) return;
    if (!isRichInput(el)) {
      el.value = String(text || "");
      return;
    }
    el.innerHTML = "";
    var s = String(text || "");
    if (!s) {
      el.classList.add("is-empty");
      scheduleComposerLivePreview(el);
      return;
    }
    var re = /<(a?):([a-zA-Z0-9_]+):(\d{5,32})>|<@!?(\d{5,32})>|<@&(\d{5,32})>|<#(\d{5,32})>/g;
    var last = 0;
    var m;
    var frag = document.createDocumentFragment();
    while ((m = re.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      if (m[4]) {
        frag.appendChild(
          makeMentionTokenEl({
            type: "user",
            id: m[4],
            name: resolveMentionName("user", m[4]),
            markup: "<@" + m[4] + ">",
          }),
        );
      } else if (m[5]) {
        if (resolveMentionName("role", m[5]) === "ruolo") {
          queueContentResolve({ roleIds: [m[5]] });
        }
        frag.appendChild(
          makeMentionTokenEl({
            type: "role",
            id: m[5],
            name: resolveMentionName("role", m[5]),
            markup: "<@&" + m[5] + ">",
          }),
        );
      } else if (m[6]) {
        frag.appendChild(
          makeMentionTokenEl({
            type: "channel",
            id: m[6],
            name: resolveMentionName("channel", m[6]),
            markup: "<#" + m[6] + ">",
          }),
        );
      } else {
        frag.appendChild(makeEmojiTokenEl(m[0], m[2], m[3], m[1] === "a"));
      }
      last = m.index + m[0].length;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    el.appendChild(frag);
    el.classList.toggle("is-empty", !serializeRichInput(el));
    wireEmojiImgFallback(el);
    scheduleComposerLivePreview(el);
  }

  function richInputHasVisualTokens(el) {
    return Boolean(el && el.querySelector && el.querySelector("img, .vc-wt-mention"));
  }

  function syncRichInputEmptyState(el) {
    if (!el || !isRichInput(el)) return;
    var text = serializeRichInput(el);
    var empty = !String(text || "").trim() && !richInputHasVisualTokens(el);
    if (empty) {
      if (el.childNodes.length) el.innerHTML = "";
      el.classList.add("is-empty");
      if (document.activeElement === el) placeCaretInRichInput(el);
    } else {
      el.classList.remove("is-empty");
    }
  }

  function placeCaretInRichInput(el) {
    if (!el) return;
    try {
      try {
        el.focus({ preventScroll: true });
      } catch (eF) {
        el.focus();
      }
      var range = document.createRange();
      range.setStart(el, 0);
      range.collapse(true);
      var sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  function placeCaretAtEnd(el) {
    if (!el) return;
    try {
      try {
        el.focus({ preventScroll: true });
      } catch (eF) {
        el.focus();
      }
      var range = document.createRange();
      if (!el.childNodes.length) {
        range.setStart(el, 0);
        range.collapse(true);
      } else {
        range.selectNodeContents(el);
        range.collapse(false);
      }
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  function insertAtCursor(el, text, pick) {
    if (!el) return;
    var insert = String(text || "");
    if (!isRichInput(el)) {
      var value = String(el.value || "");
      var start = typeof el.selectionStart === "number" ? el.selectionStart : value.length;
      var end = typeof el.selectionEnd === "number" ? el.selectionEnd : value.length;
      var next = value.slice(0, start) + insert + value.slice(end);
      if (next.length > 2000) next = next.slice(0, 2000);
      el.value = next;
      var caret = Math.min(2000, start + insert.length);
      try {
        el.focus();
        el.setSelectionRange(caret, caret);
      } catch (e2) {}
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    el.focus();
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) placeCaretAtEnd(el);
    sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== el) {
      placeCaretAtEnd(el);
      sel = window.getSelection();
      range = sel.getRangeAt(0);
    }
    range.deleteContents();

    var node = null;
    if (pick && pick.type === "custom" && pick.markup) {
      var cm = String(pick.markup).match(/^<(a?):([a-zA-Z0-9_]+):(\d{5,32})>$/);
      if (cm) {
        node = makeEmojiTokenEl(pick.markup, cm[2] || pick.name, cm[3] || pick.id, cm[1] === "a" || pick.animated);
      }
    }
    if (!node && insert) {
      var custom = insert.match(/^<(a?):([a-zA-Z0-9_]+):(\d{5,32})>$/);
      if (custom) {
        node = makeEmojiTokenEl(insert, custom[2], custom[3], custom[1] === "a");
      } else {
        node = document.createTextNode(insert);
      }
    }
    if (!node) return;

    var piece =
      (node.getAttribute && node.getAttribute("data-emoji-markup")) ||
      String(node.nodeValue || "");
    if (serializeRichInput(el).length + String(piece).length > 2000) return;

    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    el.classList.remove("is-empty");
    if (node.tagName === "IMG") wireEmojiImgFallback(el);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function textBeforeCaret(el) {
    if (!el || !isRichInput(el)) return "";
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return serializeRichInput(el);
    try {
      var endRange = sel.getRangeAt(0);
      var range = document.createRange();
      range.selectNodeContents(el);
      range.setEnd(endRange.endContainer, endRange.endOffset);
      var frag = range.cloneContents();
      var tmp = document.createElement("div");
      tmp.appendChild(frag);
      return serializeRichInput(tmp);
    } catch (e) {
      return serializeRichInput(el);
    }
  }

  function textAfterCaret(el) {
    if (!el || !isRichInput(el)) return "";
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return "";
    try {
      var range = sel.getRangeAt(0).cloneRange();
      range.selectNodeContents(el);
      range.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
      return String(range.toString() || "");
    } catch (e2) {
      return "";
    }
  }

  function ensureMentionMenu() {
    var menu = byId("vc-wt-mention-menu");
    if (menu && menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
    if (menu) return menu;
    menu = document.createElement("div");
    menu.id = "vc-wt-mention-menu";
    menu.className = "vc-wt-mention-menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Menzioni");
    document.body.appendChild(menu);
    return menu;
  }

  function ensureCommandMenu() {
    var menu = byId("vc-wt-command-menu");
    if (menu && menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
    if (menu) return menu;
    menu = document.createElement("div");
    menu.id = "vc-wt-command-menu";
    menu.className = "vc-wt-command-menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Comandi staff");
    document.body.appendChild(menu);
    return menu;
  }

  function botCommandPrefix() {
    return String(state.commandPrefix || "+");
  }

  function composerMenuAnchor(el) {
    if (!el) return null;
    if (el.closest) {
      var row = el.closest(".vc-wt-composer__row");
      if (row) return row;
      var form = el.closest(".vc-wt-composer");
      if (form) return form;
    }
    return el;
  }

  function floatingMenuViewport() {
    try {
      var vv = window.visualViewport;
      if (vv && typeof vv.height === "number" && vv.height > 0) {
        return {
          top: Number(vv.offsetTop) || 0,
          left: Number(vv.offsetLeft) || 0,
          width: Number(vv.width) || window.innerWidth || 0,
          height: Number(vv.height) || window.innerHeight || 0,
        };
      }
    } catch (eVv) {}
    return {
      top: 0,
      left: 0,
      width: window.innerWidth || 0,
      height: window.innerHeight || 0,
    };
  }

  function floatingMenuLayoutHeight() {
    try {
      var docH = document.documentElement && document.documentElement.clientHeight;
      if (docH && docH > 0) return docH;
    } catch (eDoc) {}
    return window.innerHeight || 0;
  }

  /* ticketMentionPos2: room solo sul lato scelto; sopra = bottom-anchor (no clamp/flicker) */
  function positionFloatingMenu(menu, el, maxHeight) {
    if (!menu || !el || menu.hidden) return;
    var inputRect = el.getBoundingClientRect();
    var widthAnchor = composerMenuAnchor(el) || el;
    var widthRect = widthAnchor.getBoundingClientRect();
    var vp = floatingMenuViewport();
    var layoutH = floatingMenuLayoutHeight();
    var gap = 8;
    var visibleTop = vp.top + gap;
    var visibleBottom = vp.top + vp.height - gap;
    var spaceAbove = Math.max(0, inputRect.top - visibleTop);
    var spaceBelow = Math.max(0, visibleBottom - inputRect.bottom);
    var wantMax = maxHeight || 280;
    var keyboardOpen = layoutH > 0 && vp.height > 0 && vp.height < layoutH * 0.85;
    var preferAbove =
      keyboardOpen || spaceAbove >= Math.min(120, wantMax) || spaceAbove >= spaceBelow;
    if (preferAbove && spaceAbove < 72 && spaceBelow > spaceAbove + 24) {
      preferAbove = false;
    }
    var room = Math.max(0, (preferAbove ? spaceAbove : spaceBelow) - gap);
    var maxH = Math.min(wantMax, Math.max(72, room || 72));
    var left = Math.max(vp.left + gap, Math.min(widthRect.left, vp.left + vp.width - 280));
    var width = Math.min(
      360,
      Math.max(220, Math.min(widthRect.width || inputRect.width || 240, vp.width - gap * 2)),
    );
    menu.style.position = "fixed";
    menu.style.zIndex = "200000";
    menu.style.left = Math.round(left) + "px";
    menu.style.width = Math.round(width) + "px";
    menu.style.maxHeight = Math.round(maxH) + "px";
    menu.style.visibility = "visible";
    menu.style.opacity = "1";
    var placeKey;
    if (preferAbove) {
      var bottom = Math.max(gap, layoutH - inputRect.top + gap);
      menu.style.top = "auto";
      menu.style.bottom = Math.round(bottom) + "px";
      placeKey = "b:" + Math.round(bottom) + ":" + Math.round(maxH) + ":" + Math.round(left);
    } else {
      var top = inputRect.bottom + gap;
      if (top + Math.min(96, maxH) > visibleBottom) {
        top = Math.max(visibleTop, visibleBottom - maxH);
      }
      menu.style.bottom = "auto";
      menu.style.top = Math.round(top) + "px";
      placeKey = "t:" + Math.round(top) + ":" + Math.round(maxH) + ":" + Math.round(left);
    }
    if (menu.getAttribute("data-vc-float-place") === placeKey) return;
    menu.setAttribute("data-vc-float-place", placeKey);
  }

  var floatMenuSyncTimer = 0;
  function syncFloatingMenus() {
    if (floatMenuSyncTimer) return;
    floatMenuSyncTimer = window.setTimeout(function () {
      floatMenuSyncTimer = 0;
      if (state.commandMenu.open) {
        positionCommandMenu(byId(state.commandMenu.elId || "vc-wt-composer-text"));
      }
      if (state.mentionMenu.open) {
        positionMentionMenu(byId(state.mentionMenu.elId || "vc-wt-composer-text"));
      }
    }, 48);
  }

  function positionMentionMenu(el) {
    var maxH = (state.mentionMenu.mode || "") === "channel" ? 360 : 260;
    positionFloatingMenu(byId("vc-wt-mention-menu"), el, maxH);
  }

  function hideMentionMenu() {
    state.mentionMenu = { open: false, q: "", items: [], index: 0, elId: "", mode: "user", filter: "all" };
    var menu = byId("vc-wt-mention-menu");
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = "";
      try {
        menu.removeAttribute("data-vc-float-place");
        menu.style.top = "";
        menu.style.bottom = "";
      } catch (eHideMm) {}
    }
  }

  function renderMentionMenu() {
    var menu = ensureMentionMenu();
    var mode = state.mentionMenu.mode || "user";
    var filter = state.mentionMenu.filter || "all";
    var showFilters = mode !== "channel" && effectivePermissions().isStaffViewer;
    var filtersHtml = showFilters
      ? '<div class="vc-wt-mention-menu__filters" role="tablist">' +
        [
          { id: "all", label: "Tutti" },
          { id: "users", label: "Utenti" },
          { id: "roles", label: "Ruoli" },
        ]
          .map(function (f) {
            return (
              '<button type="button" class="vc-wt-mention-menu__filter' +
              (filter === f.id ? " is-on" : "") +
              '" data-mention-filter="' +
              f.id +
              '" role="tab" aria-selected="' +
              (filter === f.id ? "true" : "false") +
              '">' +
              f.label +
              "</button>"
            );
          })
          .join("") +
        "</div>"
      : "";
    if (state.mentionMenu.loading) {
      menu.hidden = false;
      menu.innerHTML =
        filtersHtml +
        '<p class="vc-wt-mention-menu__hint">' +
        (mode === "channel" ? "Caricamento canali…" : "Caricamento menzioni…") +
        "</p>";
      wireMentionMenuFilters(menu);
      positionMentionMenu(byId(state.mentionMenu.elId || "vc-wt-composer-text"));
      return;
    }
    var items = state.mentionMenu.items || [];
    if (!state.mentionMenu.open) {
      menu.hidden = true;
      menu.innerHTML = "";
      return;
    }
    if (!items.length) {
      menu.hidden = false;
      menu.innerHTML =
        filtersHtml +
        '<p class="vc-wt-mention-menu__hint">' +
        (mode === "channel" ? "Nessun canale trovato" : "Nessuna menzione trovata") +
        "</p>";
      wireMentionMenuFilters(menu);
      positionMentionMenu(byId(state.mentionMenu.elId || "vc-wt-composer-text"));
      return;
    }
    menu.hidden = false;
    menu.innerHTML =
      filtersHtml +
      items
        .map(function (it, idx) {
          var type = String(it.type || "user");
          var icon = String(it.channelIcon || "");
          var cls =
            "vc-wt-mention-menu__item" +
            (idx === state.mentionMenu.index ? " is-active" : "") +
            (type === "role" ? " is-role" : type === "channel" ? " is-channel is-channel--" + (icon || "text") : " is-user");
          var avMark = "#";
          if (type === "role") avMark = "R";
          else if (type === "channel") {
            if (icon === "voice" || icon === "stage") avMark = "♫";
            else if (icon === "thread") avMark = "⎘";
            else if (icon === "forum" || icon === "media") avMark = "☰";
            else if (icon === "news") avMark = "!";
            else avMark = "#";
          } else avMark = "@";
          var av =
            type === "user" && it.avatarUrl
              ? '<img class="vc-wt-mention-menu__av" src="' + esc(it.avatarUrl) + '" alt="" />'
              : '<span class="vc-wt-mention-menu__av vc-wt-mention-menu__av--fallback">' +
                avMark +
                "</span>";
          var prefix = type === "channel" ? "#" : "@";
          var sub = "Utente";
          if (type === "role") sub = "Ruolo";
          else if (type === "channel") {
            sub = it.channelKind || "Canale";
            if (it.parentName) sub += " · " + it.parentName;
          } else if (it.roleName) {
            sub = String(it.roleName);
            if (it.username) sub += " · @" + it.username;
          } else if (it.username) sub = it.username;
          return (
            '<button type="button" class="' +
            cls +
            '" data-mention-idx="' +
            idx +
            '">' +
            av +
            '<span class="vc-wt-mention-menu__meta"><strong>' +
            prefix +
            esc(it.name) +
            "</strong><small>" +
            esc(sub) +
            "</small></span></button>"
          );
        })
        .join("");
    wireMentionMenuFilters(menu);
    menu.querySelectorAll("[data-mention-idx]").forEach(function (btn) {
      if (btn._vcMentionPickWired) return;
      btn._vcMentionPickWired = true;
      function pick(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        var i = Number(btn.getAttribute("data-mention-idx"));
        var item = (state.mentionMenu.items || [])[i];
        applyMentionPick(item);
      }
      btn.addEventListener("mousedown", pick);
      btn.addEventListener("click", pick);
    });
    positionMentionMenu(byId(state.mentionMenu.elId || "vc-wt-composer-text"));
  }

  function wireMentionMenuFilters(menu) {
    if (!menu) return;
    menu.querySelectorAll("[data-mention-filter]").forEach(function (btn) {
      if (btn._vcMentionFilterWired) return;
      btn._vcMentionFilterWired = true;
      btn.addEventListener("mousedown", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var next = String(btn.getAttribute("data-mention-filter") || "all");
        if (next === String(state.mentionMenu.filter || "all")) return;
        state.mentionMenu.filter = next;
        fetchMentions(state.mentionMenu.q || "", state.mentionMenu.elId, state.mentionMenu.mode || "user");
      });
    });
  }

  function escapeRegExp(s) {
    return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function applyMentionPick(item) {
    if (!item) return;
    var el = byId(state.mentionMenu.elId || "vc-wt-composer-text");
    if (!el) return;
    var type = String(item.type || "user");
    var id = String(item.id || "").trim();
    if (!id) return;
    var markup = String(item.markup || "").trim();
    if (!markup) {
      if (type === "channel") markup = "<#" + id + ">";
      else if (type === "role") markup = "<@&" + id + ">";
      else markup = "<@" + id + ">";
    }
    item.markup = markup;
    rememberMentionName(type, id, item.name);
    if (type === "user" && item.roleName) rememberStaffRole(id, item.roleId, item.roleName, item.roleKey);

    var trigger = type === "channel" ? "#" : "@";
    var q = String(state.mentionMenu.q != null ? state.mentionMenu.q : "");
    var full = serializeRichInput(el).replace(/\u00a0/g, " ");
    var replaced = false;
    var trailing = new RegExp(escapeRegExp(trigger) + escapeRegExp(q) + "\\s*$");
    if (trailing.test(full)) {
      full = full.replace(trailing, markup + " ");
      replaced = true;
    } else {
      var lines = full.split("\n");
      var last = lines[lines.length - 1] || "";
      var m =
        type === "channel"
          ? last.match(/^(.*)#([^\s#]*)$/)
          : last.match(/^(.*)@([^\s@]*)$/);
      if (m) {
        lines[lines.length - 1] = m[1] + markup + " ";
        full = lines.join("\n");
        replaced = true;
      }
    }
    if (!replaced) {
      full = (full ? full.replace(/\s*$/, "") + " " : "") + markup + " ";
    }

    fillRichInput(el, full);
    placeCaretAtEnd(el);
    try {
      el.focus({ preventScroll: true });
    } catch (eFocus) {
      try {
        el.focus();
      } catch (eFocus2) {}
    }
    el.classList.remove("is-empty");
    if (el.id === "vc-wt-composer-text") {
      state.composerText = serializeRichInput(el);
      saveTicketComposerDraft();
    }
    scheduleComposerLivePreview(el);
    hideMentionMenu();
  }

  function fetchMentions(q, elId, mode) {
    mode = mode || "user";
    var filter = mode === "channel" ? "all" : String(state.mentionMenu.filter || "all");
    var sameOpen =
      state.mentionMenu &&
      state.mentionMenu.open &&
      String(state.mentionMenu.q || "") === String(q || "") &&
      String(state.mentionMenu.mode || "") === mode &&
      String(state.mentionMenu.filter || "all") === filter;
    var keepIndex = sameOpen ? Math.max(0, Number(state.mentionMenu.index) || 0) : 0;
    state.mentionMenu = {
      open: true,
      q: q || "",
      items: sameOpen ? state.mentionMenu.items || [] : [],
      index: keepIndex,
      elId: elId || "vc-wt-composer-text",
      loading: !sameOpen || !(state.mentionMenu.items && state.mentionMenu.items.length),
      mode: mode,
      filter: filter,
    };
    renderMentionMenu();
    var url =
      apiBase() +
      "/mentions?q=" +
      encodeURIComponent(q || "") +
      (mode === "channel" ? "&kind=channels" : "") +
      (mode !== "channel" && filter !== "all" ? "&filter=" + encodeURIComponent(filter) : "") +
      (state.selectedId ? "&ticketId=" + encodeURIComponent(state.selectedId) : "");
    return fetchJson(url, { method: "GET", headers: authHeaders(), cache: "no-store" }).then(function (out) {
      if (!out.res.ok || !out.data || !out.data.ok) {
        state.mentionMenu = {
          open: true,
          q: q || "",
          items: [],
          index: 0,
          elId: elId || "vc-wt-composer-text",
          loading: false,
          mode: mode,
          filter: filter,
        };
        renderMentionMenu();
        return;
      }
      var items = [];
      if (mode === "channel") {
        items = Array.isArray(out.data.channels) ? out.data.channels : [];
        items.forEach(function (c) {
          rememberMentionName("channel", c.id, c.name);
        });
      } else {
        var users = Array.isArray(out.data.users) ? out.data.users : [];
        var roles = [];
        if (effectivePermissions().isStaffViewer) {
          roles = Array.isArray(out.data.roles) ? out.data.roles : [];
        }
        users.forEach(function (u) {
          rememberMentionName("user", u.id, u.name);
          if (u.roleName) rememberStaffRole(u.id, u.roleId, u.roleName, u.roleKey);
        });
        roles.forEach(function (r) {
          rememberMentionName("role", r.id, r.name);
        });
        items = users.concat(roles).slice(0, 24);
      }
      var list = mode === "channel" ? items.slice(0, 80) : items.slice(0, 24);
      var idx = keepIndex;
      if (idx >= list.length) idx = Math.max(0, list.length - 1);
      state.mentionMenu = {
        open: true,
        q: q || "",
        items: list,
        index: idx,
        elId: elId || "vc-wt-composer-text",
        loading: false,
        mode: mode,
        filter: filter,
      };
      renderMentionMenu();
    }).catch(function () {
      state.mentionMenu = {
        open: true,
        q: q || "",
        items: [],
        index: 0,
        elId: elId || "vc-wt-composer-text",
        loading: false,
        mode: mode,
        filter: filter,
      };
      renderMentionMenu();
    });
  }

  function hideCommandMenu() {
    state.commandMenu = { open: false, q: "", items: [], index: 0, prefix: "+", elId: "" };
    var menu = byId("vc-wt-command-menu");
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = "";
      try {
        menu.removeAttribute("data-vc-float-place");
        menu.style.top = "";
        menu.style.bottom = "";
      } catch (eHideCm) {}
    }
  }

  function positionCommandMenu(el) {
    positionFloatingMenu(byId("vc-wt-command-menu"), el, 320);
  }

  function ensureCommandCatalog() {
    var ticketId = String(state.selectedId || (state.detail && state.detail.id) || "").trim();
    if (!ticketId) {
      state.commandCatalog = [];
      state.slashCatalog = [];
      state.commandCatalogLoaded = false;
      state.commandCatalogTicketId = "";
      return Promise.resolve(state.commandCatalog);
    }
    if (state.commandCatalogLoaded && state.commandCatalogTicketId === ticketId) {
      return Promise.resolve(state.commandCatalog);
    }
    if (state.commandCatalogLoading && state.commandCatalogLoadTicketId === ticketId) {
      return state.commandCatalogLoading;
    }
    state.commandCatalogLoadTicketId = ticketId;
    state.commandCatalogLoading = fetchJson(
      apiBase() + "/commands?ticketId=" + encodeURIComponent(ticketId),
      {
        method: "GET",
        headers: authHeaders(),
        cache: "no-store",
      }
    )
      .then(function (out) {
        state.commandCatalogLoading = null;
        var stillSame =
          String(state.selectedId || (state.detail && state.detail.id) || "") === ticketId;
        if (!stillSame) return state.commandCatalog;
        if (!out.res.ok || !out.data || !out.data.ok) {
          state.commandCatalog = [];
          state.slashCatalog = [];
          state.commandCatalogLoaded = false;
          state.commandCatalogTicketId = "";
          return state.commandCatalog;
        }
        state.commandPrefix = String(out.data.prefix || "+") || "+";
        state.commandCatalog = Array.isArray(out.data.commands) ? out.data.commands : [];
        state.slashCatalog = Array.isArray(out.data.slashCommands) ? out.data.slashCommands : [];
        state.commandCatalogLoaded = true;
        state.commandCatalogTicketId = ticketId;
        return state.commandCatalog;
      })
      .catch(function () {
        state.commandCatalogLoading = null;
        if (String(state.selectedId || (state.detail && state.detail.id) || "") !== ticketId) {
          return state.commandCatalog;
        }
        state.commandCatalog = [];
        state.slashCatalog = [];
        state.commandCatalogLoaded = false;
        state.commandCatalogTicketId = "";
        return state.commandCatalog;
      });
    return state.commandCatalogLoading;
  }

  function filterCommandCatalog(q, prefixChar) {
    var needle = String(q || "").toLowerCase();
    var isSlash = String(prefixChar || "") === "/";
    var list = isSlash ? state.slashCatalog || [] : state.commandCatalog || [];
    var prefix = isSlash ? "/" : botCommandPrefix() || "+";
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      var c = list[i];
      var name = String(c.name || "").toLowerCase();
      var aliases = Array.isArray(c.aliases) ? c.aliases : [];
      var invoke = String(c.invoke || name).toLowerCase();
      if (needle) {
        var aliasHit = "";
        for (var a = 0; a < aliases.length; a += 1) {
          if (String(aliases[a]).indexOf(needle) === 0) {
            aliasHit = String(aliases[a]);
            break;
          }
        }
        if (
          invoke.indexOf(needle) !== 0 &&
          name.indexOf(needle) !== 0 &&
          !aliasHit &&
          invoke.indexOf(needle) < 0 &&
          name.indexOf(needle) < 0
        ) {
          var any = false;
          for (var b = 0; b < aliases.length; b += 1) {
            if (String(aliases[b]).indexOf(needle) >= 0) {
              any = true;
              aliasHit = String(aliases[b]);
              break;
            }
          }
          if (!any) continue;
        }
        if (invoke.indexOf(needle) !== 0 && name.indexOf(needle) !== 0 && aliasHit) invoke = aliasHit;
      }
      out.push({
        name: name,
        invoke: invoke,
        description: c.description || "",
        usage: c.usage || prefix + invoke,
        category: c.category || "",
        prefix: prefix,
        kind: isSlash ? "slash" : "prefix",
      });
    }
    return out.slice(0, 12);
  }

  function renderCommandMenu() {
    var menu = ensureCommandMenu();
    if (state.commandMenu.loading) {
      menu.hidden = false;
      menu.innerHTML = '<p class="vc-wt-command-menu__hint">Caricamento comandi…</p>';
      positionCommandMenu(byId(state.commandMenu.elId || "vc-wt-composer-text"));
      return;
    }
    var items = state.commandMenu.items || [];
    if (!state.commandMenu.open) {
      menu.hidden = true;
      menu.innerHTML = "";
      return;
    }
    if (!items.length) {
      menu.hidden = false;
      menu.innerHTML = '<p class="vc-wt-command-menu__hint">Nessun comando trovato</p>';
      positionCommandMenu(byId(state.commandMenu.elId || "vc-wt-composer-text"));
      return;
    }
    menu.hidden = false;
    menu.innerHTML =
      '<p class="vc-wt-command-menu__hint">' +
      (String(state.commandMenu.trigger || "") === "/" ? "Slash command" : "Comandi prefix") +
      "</p>" +
      items
        .map(function (it, idx) {
          var cls = "vc-wt-command-menu__item" + (idx === state.commandMenu.index ? " is-active" : "");
          var label = esc(it.prefix + it.invoke);
          var cmdLabel = it.prefix + it.invoke;
          var descText = it.description || "";
          if (!descText && it.usage && it.usage !== cmdLabel) descText = it.usage;
          var desc = esc(descText);
          return (
            '<button type="button" class="' +
            cls +
            '" data-cmd-idx="' +
            idx +
            '">' +
            '<span class="vc-wt-command-menu__ico" aria-hidden="true">' +
            esc(it.prefix) +
            "</span>" +
            '<span class="vc-wt-command-menu__meta"><strong>' +
            label +
            "</strong>" +
            (desc ? "<small>" + desc + "</small>" : "") +
            "</span></button>"
          );
        })
        .join("");
    menu.querySelectorAll("[data-cmd-idx]").forEach(function (btn) {
      if (btn._vcCmdPickWired) return;
      btn._vcCmdPickWired = true;
      function pick(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        var i = Number(btn.getAttribute("data-cmd-idx"));
        var item = (state.commandMenu.items || [])[i];
        applyCommandPick(item);
      }
      btn.addEventListener("mousedown", pick);
      btn.addEventListener("click", pick);
    });
    positionCommandMenu(byId(state.commandMenu.elId || "vc-wt-composer-text"));
  }

  function applyCommandPick(item) {
    if (!item || !item.invoke) return;
    var invokeLower = String(item.invoke || "").trim().toLowerCase();
    if (item.kind === "slash" && (invokeLower === "partnership" || String(item.name || "").toLowerCase() === "partnership")) {
      hideCommandMenu();
      var elClear = byId(state.commandMenu.elId || "vc-wt-composer-text");
      if (elClear) {
        fillRichInput(elClear, "");
        state.composerText = "";
        saveTicketComposerDraft();
      }
      // Sempre riapribile: non dipendere da busy di un comando precedente.
      state.busy = false;
      runPartnershipCommandFlow("/partnership");
      return;
    }
    var el = byId(state.commandMenu.elId || "vc-wt-composer-text");
    if (!el) return;
    var prefix = String(item.prefix || state.commandMenu.trigger || botCommandPrefix() || "+").charAt(0) || "+";
    var invoke = String(item.invoke || "").trim();
    if (!invoke) return;
    var cmdText = prefix + invoke + " ";
    var full = serializeRichInput(el).replace(/\u00a0/g, " ");
    var lines = full.split("\n");
    var last = lines[lines.length - 1] || "";
    var m = last.match(/^([+!/])([^\s]*)$/);
    if (m) {
      lines[lines.length - 1] = prefix + invoke + " ";
      full = lines.join("\n");
    } else {
      var q = String(state.commandMenu.q != null ? state.commandMenu.q : "");
      var trailing = new RegExp(
        "(?:^|\\n)([+!/])" + escapeRegExp(q) + "\\s*$",
      );
      if (trailing.test(full)) {
        full = full.replace(/(?:^|\n)([+!/])[^\s]*\s*$/, function (all) {
          var nl = all.charAt(0) === "\n" ? "\n" : "";
          return nl + prefix + invoke + " ";
        });
      } else {
        full = (full ? full.replace(/\s*$/, "") + "\n" : "") + cmdText;
      }
    }
    fillRichInput(el, full);
    placeCaretAtEnd(el);
    try {
      el.focus({ preventScroll: true });
    } catch (eFocus) {
      try {
        el.focus();
      } catch (eFocus2) {}
    }
    el.classList.remove("is-empty");
    state.composerText = serializeRichInput(el);
    saveTicketComposerDraft();
    scheduleComposerLivePreview(el);
    hideCommandMenu();
  }

  function showCommandMenu(q, triggerChar, elId) {
    var trigger = String(triggerChar || botCommandPrefix() || "+").charAt(0) || "+";
    var prefix = trigger === "/" ? "/" : botCommandPrefix() || "+";
    var sameOpen =
      state.commandMenu &&
      state.commandMenu.open &&
      String(state.commandMenu.q || "") === String(q || "") &&
      String(state.commandMenu.trigger || "") === trigger;
    var keepIndex = sameOpen ? Math.max(0, Number(state.commandMenu.index) || 0) : 0;
    state.commandMenu = {
      open: true,
      q: q || "",
      items: sameOpen ? state.commandMenu.items || [] : [],
      index: keepIndex,
      prefix: prefix,
      trigger: trigger,
      elId: elId || "vc-wt-composer-text",
      loading: !sameOpen || !(state.commandMenu.items && state.commandMenu.items.length),
    };
    renderCommandMenu();
    ensureCommandCatalog().then(function () {
      var items = filterCommandCatalog(q, trigger);
      var idx = keepIndex;
      if (idx >= items.length) idx = Math.max(0, items.length - 1);
      state.commandMenu = {
        open: true,
        q: q || "",
        items: items,
        index: idx,
        prefix: prefix,
        trigger: trigger,
        elId: elId || "vc-wt-composer-text",
        loading: false,
      };
      renderCommandMenu();
    });
  }

  function activeInputLine(before) {
    var lines = String(before || "").split("\n");
    return lines[lines.length - 1] || "";
  }

  function onRichInputMaybeMention(el) {
    if (!el) return;
    if (!isRichInput(el) && el.tagName !== "TEXTAREA" && el.tagName !== "INPUT") return;
    var ctx = readComposerContext(el);
    if (!ctx) {
      hideMentionMenu();
      hideCommandMenu();
      syncRichInputEmptyState(el);
      return;
    }
    if (ctx.kind === "mention") {
      hideCommandMenu();
      if (state.mentionTimer) clearTimeout(state.mentionTimer);
      var userDelay = ctx.q ? 120 : 0;
      state.mentionTimer = setTimeout(function () {
        state.mentionTimer = null;
        fetchMentions(ctx.q, el.id, "user");
      }, userDelay);
      return;
    }
    if (ctx.kind === "channel") {
      hideCommandMenu();
      if (state.mentionTimer) clearTimeout(state.mentionTimer);
      var chDelay = ctx.q ? 120 : 0;
      state.mentionTimer = setTimeout(function () {
        state.mentionTimer = null;
        fetchMentions(ctx.q, el.id, "channel");
      }, chDelay);
      return;
    }
    if (ctx.kind === "command") {
      hideMentionMenu();
      if (state.commandTimer) clearTimeout(state.commandTimer);
      state.commandTimer = setTimeout(function () {
        state.commandTimer = null;
        showCommandMenu(ctx.q, ctx.prefix, el.id);
      }, 0);
      return;
    }
  }

  function openEmojiPicker(anchor, onPick, preferCustom) {
    if (!window.VcEmojiPicker) {
      setStatus("Picker emoji non disponibile.", true);
      return;
    }
    if (typeof window.VcEmojiPicker.isOpen === "function" && window.VcEmojiPicker.isOpen()) {
      state.emojiPickerToken += 1;
      state.emojiPickerOpening = false;
      window.VcEmojiPicker.close();
      return;
    }
    if (state.emojiPickerOpening) {
      state.emojiPickerToken += 1;
      state.emojiPickerOpening = false;
      window.VcEmojiPicker.close();
      return;
    }
    var token = (state.emojiPickerToken += 1);
    state.emojiPickerOpening = true;
    ensureGuildEmojis().then(function (emojis) {
      state.emojiPickerOpening = false;
      if (token !== state.emojiPickerToken) return;
      if (typeof window.VcEmojiPicker.isOpen === "function" && window.VcEmojiPicker.isOpen()) return;
      if (typeof window.VcEmojiPicker.toggle === "function") {
        window.VcEmojiPicker.toggle({
          anchor: anchor,
          guildEmojis: emojis,
          preferCustom: preferCustom === true && emojis && emojis.length > 0,
          onPick: onPick,
        });
        return;
      }
      window.VcEmojiPicker.open({
        anchor: anchor,
        guildEmojis: emojis,
        preferCustom: preferCustom === true && emojis && emojis.length > 0,
        onPick: onPick,
      });
    });
  }

  function patchMessageInState(msg) {
    if (!msg || !msg.id) return;
    var found = false;
    state.messages = state.messages.map(function (m) {
      if (m.id === msg.id) {
        found = true;
        return msg;
      }
      return m;
    });
    if (!found) return;
    var node = document.querySelector('[data-msg-id="' + msg.id + '"]');
    if (node) {
      var tmp = document.createElement("div");
      tmp.innerHTML = messageHtml(msg);
      var next = tmp.firstElementChild;
      if (next) {
        node.replaceWith(next);
        wireMessageReactions(next);
        wireMessageTools(next);
      }
    }
  }

  function toggleReaction(messageId, emojiMarkup) {
    if (!state.selectedId || !messageId || !emojiMarkup || state.busy) return;
    fetchJson(
      apiBase() +
        "/" +
        encodeURIComponent(state.selectedId) +
        "/messages/" +
        encodeURIComponent(messageId) +
        "/reactions",
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ emoji: emojiMarkup }),
      },
    )
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          setStatus((out.data && out.data.message) || "Reazione fallita.", true);
          return;
        }
        if (out.data.message) patchMessageInState(out.data.message);
        if (out.data.ticket) refreshTicketInList(out.data.ticket);
      })
      .catch(function () {
        setStatus("Errore di rete.", true);
      });
  }

  function hideReactionTipPortal() {
    var tip = document.getElementById("vc-wt-reaction-tip-portal");
    if (tip) tip.remove();
  }

  function showReactionTipPortal(btn) {
    hideReactionTipPortal();
    if (!btn) return;
    var text = btn.getAttribute("data-react-tip") || btn.getAttribute("aria-label") || "";
    if (!text) return;
    var tip = document.createElement("div");
    tip.id = "vc-wt-reaction-tip-portal";
    tip.className = "vc-wt-reaction-tip-portal";
    tip.textContent = text;
    document.body.appendChild(tip);
    var rect = btn.getBoundingClientRect();
    var pad = 8;
    var tw = tip.offsetWidth || 120;
    var th = tip.offsetHeight || 28;
    var left = Math.min(Math.max(pad, rect.left + rect.width / 2 - tw / 2), window.innerWidth - tw - pad);
    var top = rect.top - th - 8;
    if (top < pad) top = rect.bottom + 8;
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  }

  function wireMessageReactions(scope) {
    var root = scope || document;
    var closed = state.detail && state.detail.status === "closed";
    root.querySelectorAll("[data-react-emoji]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function () {
        if (closed) return;
        var msgEl = btn.closest("[data-msg-id]");
        var mid = msgEl && msgEl.getAttribute("data-msg-id");
        var emoji = btn.getAttribute("data-react-emoji");
        if (mid && emoji) toggleReaction(mid, emoji);
      });
      btn.addEventListener("mouseenter", function () {
        showReactionTipPortal(btn);
      });
      btn.addEventListener("mouseleave", hideReactionTipPortal);
      btn.addEventListener("focus", function () {
        showReactionTipPortal(btn);
      });
      btn.addEventListener("blur", hideReactionTipPortal);
    });
    root.querySelectorAll("[data-react-add]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function () {
        if (closed) return;
        var mid = btn.getAttribute("data-react-add");
        openEmojiPicker(btn, function (pick) {
          if (!pick || !pick.markup || !mid) return;
          toggleReaction(mid, pick.markup);
        }, true);
      });
    });
    root.querySelectorAll("[data-wt-spoiler]").forEach(function (el) {
      if (el._vcWired) return;
      el._vcWired = true;
      function reveal(ev) {
        if (el.classList.contains("is-open")) {
                    if (ev && ev.target && ev.target.closest && ev.target.closest("a")) return;
                    if (ev) {
            ev.preventDefault();
            ev.stopPropagation();
          }
          el.classList.remove("is-open");
          return;
        }
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        el.classList.add("is-open");
      }
      el.addEventListener("click", reveal);
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          reveal(ev);
        }
      });
    });
    wireMessageTools(root);
    wireEmojiImgFallback(root);
  }

  function removeMessageFromUi(messageId) {
    if (!messageId) return;
    state.deletedMessageIds[messageId] = true;
    state.messages = state.messages.filter(function (m) {
      return m && m.id !== messageId;
    });
        state.seenMessageIds[messageId] = true;
    var node = document.querySelector('[data-msg-id="' + messageId + '"]');
    if (node) node.remove();
  }

  function startEditMessage(messageId) {
    var msg = null;
    for (var i = 0; i < state.messages.length; i += 1) {
      if (state.messages[i] && state.messages[i].id === messageId) {
        msg = state.messages[i];
        break;
      }
    }
    if (!msg) return;
    var node = document.querySelector('[data-msg-id="' + messageId + '"]');
    if (!node) return;
    var bubble = node.querySelector(".vc-wt-msg__bubble");
    if (!bubble || bubble.querySelector(".vc-wt-msg__edit")) return;
    var textEl = bubble.querySelector(".vc-wt-msg__text");
    if (textEl) textEl.hidden = true;
    var form = document.createElement("form");
    form.className = "vc-wt-msg__edit";
    form.innerHTML =
      '<textarea class="vc-wt-msg__edit-input" rows="3" maxlength="2000"></textarea>' +
      '<div class="vc-wt-msg__edit-actions">' +
      '<button type="button" class="vc-wt-action vc-wt-action--ghost" data-edit-cancel>Annulla</button>' +
      '<button type="submit" class="vc-wt-action">Salva</button>' +
      "</div>";
    var ta = form.querySelector("textarea");
    ta.value = String(msg.content || "");
    var insertAfter = textEl || bubble.querySelector(".vc-wt-msg__meta");
    if (insertAfter && insertAfter.nextSibling) bubble.insertBefore(form, insertAfter.nextSibling);
    else bubble.appendChild(form);
    ta.focus();
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      saveEditMessage(messageId, ta.value);
    });
    form.querySelector("[data-edit-cancel]").addEventListener("click", function () {
      form.remove();
      if (textEl) textEl.hidden = false;
    });
  }

  function saveEditMessage(messageId, content) {
    if (!state.selectedId || !messageId || state.busy) return;
    var text = String(content || "").trim();
    var existing = null;
    for (var i = 0; i < state.messages.length; i += 1) {
      if (state.messages[i] && state.messages[i].id === messageId) {
        existing = state.messages[i];
        break;
      }
    }
    var imageCount = existing && Array.isArray(existing.imageUrls) ? existing.imageUrls.length : 0;
        if (!text && !imageCount) {
      deleteMessage(messageId, { fromEmptyEdit: true });
      return;
    }
    state.busy = true;
    fetchJson(
      apiBase() +
        "/" +
        encodeURIComponent(state.selectedId) +
        "/messages/" +
        encodeURIComponent(messageId),
      {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ content: text }),
      },
    )
      .then(function (out) {
        state.busy = false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          setStatus((out.data && out.data.message) || "Modifica fallita.", true);
          return;
        }
        if (out.data.deleted && out.data.messageId) {
          removeMessageFromUi(out.data.messageId);
          if (out.data.ticket) refreshTicketInList(out.data.ticket);
          return;
        }
        if (out.data.message) patchMessageInState(out.data.message);
        if (out.data.ticket) refreshTicketInList(out.data.ticket);
      })
      .catch(function () {
        state.busy = false;
        setStatus("Errore di rete.", true);
      });
  }

  function deleteMessage(messageId, opts) {
    if (!state.selectedId || !messageId || state.busy) return;
    opts = opts || {};
    var scrollY = capturePageScrollY();
    var run = function () {
            removeMessageFromUi(messageId);
      state.busy = true;
      fetchJson(
        apiBase() +
          "/" +
          encodeURIComponent(state.selectedId) +
          "/messages/" +
          encodeURIComponent(messageId),
        {
          method: "DELETE",
          headers: authHeaders(true),
        },
      )
        .then(function (out) {
          state.busy = false;
                    var alreadyGone =
            out.res &&
            out.res.status === 404 &&
            out.data &&
            (out.data.error === "not_found" || /non trovato/i.test(String(out.data.message || "")));
          if ((!out.res.ok || !out.data || !out.data.ok) && !alreadyGone) {
            setStatus((out.data && out.data.message) || "Eliminazione fallita.", true);
            return;
          }
          removeMessageFromUi(messageId);
          if (out.data && out.data.ticket) refreshTicketInList(out.data.ticket);
          setStatus("");
        })
        .catch(function () {
          state.busy = false;
          setStatus("Errore di rete.", true);
        })
        .finally(function () {
          restorePageScroll(scrollY);
        });
    };
    var confirmTitle = opts.fromEmptyEdit ? "Elimina messaggio" : "Elimina messaggio";
    var confirmMsg = opts.fromEmptyEdit
      ? "Hai lasciato il messaggio vuoto. Vuoi eliminarlo?"
      : "Vuoi eliminare questo messaggio? L’azione non si può annullare.";
    (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.confirm !== "function") return;
      return D.confirm({
        title: confirmTitle,
        message: confirmMsg,
        confirmLabel: "Elimina",
        cancelLabel: "Annulla",
        danger: true,
        icon: "fa-trash-o",
      }).then(function (ok) {
        restorePageScroll(scrollY);
        if (ok) run();
      });
    });
  }

  function copyMessageText(messageId) {
    var id = String(messageId || "");
    var msg = (state.messages || []).filter(function (m) {
      return m && m.id === id;
    })[0];
    var text = msg ? String(msg.content || "").trim() : "";
    if (!text) {
      setStatus("Questo messaggio non ha testo da copiare.", true);
      return;
    }
    function done() {
      setStatus("Testo copiato.");
    }
    function fail() {
      setStatus("Impossibile copiare il testo.", true);
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text).then(done).catch(fail);
      return;
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand("copy")) done();
      else fail();
    } catch (e) {
      fail();
    }
    document.body.removeChild(ta);
  }

  function wireMessageTools(scope) {
    var root = scope || document;
    root.querySelectorAll("[data-msg-copy]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        copyMessageText(btn.getAttribute("data-msg-copy"));
      });
    });
    root.querySelectorAll("[data-msg-edit]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        startEditMessage(btn.getAttribute("data-msg-edit"));
      });
    });
    root.querySelectorAll("[data-msg-del]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        deleteMessage(btn.getAttribute("data-msg-del"));
      });
    });
    root.querySelectorAll("[data-msg-reply]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        startReplyToMessage(btn.getAttribute("data-msg-reply"));
      });
    });
    root.querySelectorAll("[data-jump-msg]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        jumpToMessage(btn.getAttribute("data-jump-msg"));
      });
    });
  }

  function patchComposerHtml() {
    var chat = document.querySelector(".vc-wt-chat");
    if (!chat || !state.detail) return;
    var lock = composerLockedReason();
    chat.classList.toggle("vc-wt-chat--closed", lock === "closed");
    var existing = chat.querySelector(".vc-wt-composer, form.vc-wt-composer");
    if (!lock && existing && existing.id === "vc-wt-composer") {
      syncComposerReplyBar();
      wireComposer();
      return;
    }
    if (existing) {
      var tmp = document.createElement("div");
      tmp.innerHTML = composerHtml();
      var next = tmp.firstElementChild;
      if (next) {
        dismissFloatingUi();
        existing.replaceWith(next);
      }
    }
    if (lock === "closed") {
      var oldDock = byId("vc-wt-rate-dock");
      if (oldDock) oldDock.remove();
      patchRateDock({ settled: true });
      wireChatActions();
      wireRatingPanel();
      return;
    }
    if (lock === "claimed" || lock === "unclaimed") {
      wireChatActions();
      return;
    }
    var oldDockOpen = byId("vc-wt-rate-dock");
    if (oldDockOpen) oldDockOpen.remove();
    wireComposer();
  }

  function patchRateDock(opts) {
    opts = opts || {};
    var chat = document.querySelector(".vc-wt-chat");
    if (!chat || !state.detail) return;
    var existing = byId("vc-wt-rate-dock");
    var html = ratingDockHtml(state.detail, { settled: Boolean(opts.settled || existing) });
    if (!html) {
      if (existing) existing.remove();
      return;
    }
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    var next = tmp.firstElementChild;
    if (!next) return;
    if (existing) {
      existing.replaceWith(next);
    } else {
      var composer = chat.querySelector(".vc-wt-composer, form.vc-wt-composer");
      if (composer) chat.insertBefore(next, composer);
      else chat.appendChild(next);
    }
    wireChatActions();
    wireRatingPanel();
  }

  function wireRatingPanel() {
    document.querySelectorAll("[data-rate-set]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-rate-set");
        var value = Math.max(1, Math.min(5, Math.round(Number(btn.getAttribute("data-rate-value") || 0) || 0)));
        if (kind === "ticket") state.rateDraftTicket = value;
        else if (kind === "staffer") state.rateDraftStaffer = value;
        patchRateDock({ settled: true });
      });
    });
  }

  function submitTicketRating() {
    if (!state.selectedId || state.busy) return;
    var ticketRating = Math.max(1, Math.min(5, Math.round(Number(state.rateDraftTicket) || 0)));
    var stafferRating = Math.max(1, Math.min(5, Math.round(Number(state.rateDraftStaffer) || 0)));
    if (!ticketRating || !stafferRating) {
      setStatus("Scegli un voto da 1 a 5 per il ticket e per lo staffer.", true);
      return;
    }
    state.busy = true;
    setStatus("Invio valutazione…", false);
    fetchJson(apiBase() + "/" + encodeURIComponent(state.selectedId) + "/rate", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ ticketRating: ticketRating, stafferRating: stafferRating }),
    })
      .then(function (out) {
        state.busy = false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          setStatus((out.data && out.data.message) || "Valutazione non inviata.", true);
          return;
        }
        state.rateDraftTicket = 0;
        state.rateDraftStaffer = 0;
        if (out.data.ticket) {
          state.detail = out.data.ticket;
          refreshTicketInList(out.data.ticket);
        }
        var avg = out.data.staffer && out.data.staffer.avgRating;
        var stafferId = out.data.staffer && out.data.staffer.id;
        if (stafferId && avg != null) {
          state.messages = (state.messages || []).map(function (m) {
            if (String(m.authorId) === String(stafferId) && String(m.authorKind) === "staff") {
              return Object.assign({}, m, { authorAvgRating: avg });
            }
            return m;
          });
          renderShell();
        } else {
          patchComposerHtml();
        }
        setStatus("Grazie! Valutazione salvata.", false);
      })
      .catch(function () {
        state.busy = false;
        setStatus("Errore di rete.", true);
      });
  }

  function postAction(suffix, body, preservedScrollY) {
    if (!state.selectedId) {
      setStatus("Apri un ticket prima.", true);
      return;
    }
    if (state.busy) {
      setStatus("Operazione già in corso…", false);
      return;
    }
    if (!getToken()) {
      setStatus("Sessione Discord assente. Ricarica o accedi di nuovo.", true);
      return;
    }
    var scrollY = Math.max(0, Number(preservedScrollY) || 0);
    if (!scrollY) scrollY = capturePageScrollY();
    state.busy = true;
    setChatActionsBusy(true);
    fetchJson(apiBase() + "/" + encodeURIComponent(state.selectedId) + suffix, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(body || {}),
      timeoutMs: 18000,
    })
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          var apiMsg = out.data && typeof out.data.message === "string" ? out.data.message : "";
          var code = String((out.data && out.data.error) || "");
          var status = Number((out.res && out.res.status) || 0);
          var fallback =
            status === 401 || code === "unauthorized" || code === "missing_token" || code === "invalid_token"
              ? "Sessione Discord scaduta. Ricarica o accedi di nuovo."
              : status === 403 || code === "forbidden"
                ? "Non hai i permessi per questa azione."
                : status >= 500 || code === "internal"
                  ? "Errore server. Riprova tra poco."
                  : "Operazione fallita.";
          setStatus(apiMsg || fallback, true);
          return;
        }
        withPageScrollPreserved(function () {
          if (out.data.ticket) {
            state.detail = mergeTicketDetail(out.data.ticket, { trustPermissions: true });
            refreshTicketInList(state.detail);
            refreshChatChrome();
          }
          if (out.data.message && typeof out.data.message === "object") {
            appendMessage(out.data.message, out.data.ticket);
          }
          patchComposerHtml();
          scrollChatBottom(true);
        });
        if (suffix === "/claim") setStatus("Ticket claimato.", false);
        else if (suffix === "/unclaim") setStatus("Ticket rilasciato.", false);
        else if (suffix === "/close" || suffix.indexOf("/close-request") === 0) setStatus("Operazione completata.", false);
      })
      .catch(function (err) {
        var aborted = err && (err.name === "AbortError" || err.code === 20);
        setStatus(aborted ? "Timeout: riprova." : "Errore di rete.", true);
      })
      .finally(function () {
        state.busy = false;
        setChatActionsBusy(false);
        restorePageScroll(scrollY);
        try {
          requestAnimationFrame(function () {
            restorePageScroll(scrollY);
          });
        } catch (eRaf) {}
        try {
          if (typeof window.__vcHoldPageScroll === "function") window.__vcHoldPageScroll(220);
        } catch (eHold) {}
      });
  }

  function setChatActionsBusy(on) {
    try {
      document.querySelectorAll(".vc-wt-action[data-act]").forEach(function (btn) {
        if (on) btn.setAttribute("aria-busy", "true");
        else btn.removeAttribute("aria-busy");
        btn.disabled = Boolean(on);
      });
    } catch (eBusyUi) {}
  }

  function refreshChatChrome() {
    if (!state.detail) return;
    var top = byId("vc-wt-chat-top");
    if (!top) return;
    var wrap = document.createElement("div");
    wrap.innerHTML = chatHeadHtml(state.detail);
    var next = wrap.firstElementChild;
    if (next) top.replaceWith(next);
    wireChatActions();
    patchComposerHtml();
  }

  function wireComposer() {
    var form = byId("vc-wt-composer");
    if (!form || form._vcWired) return;
    form._vcWired = true;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      sendMessage();
    });
    form.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-reply-cancel]")) {
        ev.preventDefault();
        clearReplyTarget();
      }
    });
    var ta = byId("vc-wt-composer-text");
    if (ta && !ta._vcWired) {
      ta._vcWired = true;
      fillRichInput(ta, state.composerText || "");
      syncComposerAutosize(ta);
      ta.addEventListener("input", function () {
        syncRichInputEmptyState(ta);
        state.composerText = serializeRichInput(ta);
        saveTicketComposerDraft();
        scheduleComposerLivePreview(ta);
        scheduleComposerSuggest(ta, false);
        syncComposerAutosize(ta);
        pulseTicketTyping(Boolean(String(state.composerText || "").trim()));
      });
      ta.addEventListener("scroll", function () {
        syncComposerLivePreview(ta);
      }, { passive: true });
      window.addEventListener("resize", function () {
        syncComposerAutosize(ta);
      });
      ta.addEventListener("keyup", function (ev) {
        var key = String(ev.key || "");
        if (
          key === "ArrowDown" ||
          key === "ArrowUp" ||
          key === "ArrowLeft" ||
          key === "ArrowRight" ||
          key === "Enter" ||
          key === "Tab" ||
          key === "Escape"
        ) {
          return;
        }
        scheduleComposerLivePreview(ta);
        scheduleComposerSuggest(ta, false);
      });
      ta.addEventListener("beforeinput", function () {
        scheduleComposerLivePreview(ta);
        scheduleComposerSuggest(ta, false);
      });
      ta.addEventListener("click", function () {
        scheduleComposerSuggest(ta, true);
      });
      ta.addEventListener("focus", function () {
        if (effectivePermissions().canUseCommands) void ensureCommandCatalog();
      });
      ta.addEventListener("keydown", function (ev) {
        if (state.commandMenu.open && state.commandMenu.items.length) {
          if (ev.key === "ArrowDown") {
            ev.preventDefault();
            ev.stopPropagation();
            state.commandMenu.index = (state.commandMenu.index + 1) % state.commandMenu.items.length;
            renderCommandMenu();
            return;
          }
          if (ev.key === "ArrowUp") {
            ev.preventDefault();
            ev.stopPropagation();
            state.commandMenu.index =
              (state.commandMenu.index - 1 + state.commandMenu.items.length) % state.commandMenu.items.length;
            renderCommandMenu();
            return;
          }
          if (ev.key === "Enter" || ev.key === "Tab") {
            ev.preventDefault();
            applyCommandPick(state.commandMenu.items[state.commandMenu.index]);
            return;
          }
          if (ev.key === "Escape") {
            ev.preventDefault();
            hideCommandMenu();
            return;
          }
        }
        if (state.mentionMenu.open) {
          if (ev.key === "ArrowDown" && state.mentionMenu.items.length) {
            ev.preventDefault();
            ev.stopPropagation();
            state.mentionMenu.index = (state.mentionMenu.index + 1) % state.mentionMenu.items.length;
            renderMentionMenu();
            return;
          }
          if (ev.key === "ArrowUp" && state.mentionMenu.items.length) {
            ev.preventDefault();
            ev.stopPropagation();
            state.mentionMenu.index =
              (state.mentionMenu.index - 1 + state.mentionMenu.items.length) % state.mentionMenu.items.length;
            renderMentionMenu();
            return;
          }
          if ((ev.key === "Enter" || ev.key === "Tab") && state.mentionMenu.items.length) {
            ev.preventDefault();
            applyMentionPick(state.mentionMenu.items[state.mentionMenu.index]);
            return;
          }
          if (ev.key === "Escape") {
            ev.preventDefault();
            hideMentionMenu();
            return;
          }
        }
        if (ev.key === "Escape" && state.replyTo) {
          ev.preventDefault();
          clearReplyTarget();
          return;
        }
        if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && (ev.key === "@" || ev.key === "#" || ev.key === "+" || ev.key === "!" || ev.key === "/")) {
          setTimeout(function () {
            scheduleComposerSuggest(ta, true);
          }, 0);
        }
        if (ev.key === "Backspace" || ev.key === "Delete") {
          setTimeout(function () {
            syncRichInputEmptyState(ta);
            scheduleComposerSuggest(ta, true);
          }, 0);
        }
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          sendMessage();
        }
      });
      ta.addEventListener("paste", function (ev) {
        var cd = ev.clipboardData || window.clipboardData || null;
        var files = [];
        if (cd && cd.items && cd.items.length) {
          for (var i = 0; i < cd.items.length; i += 1) {
            var it = cd.items[i];
            if (!it || it.kind !== "file") continue;
            var f = it.getAsFile && it.getAsFile();
            if (f) files.push(f);
          }
        }
        if (!files.length && cd && cd.files && cd.files.length) {
          files = Array.prototype.slice.call(cd.files);
        }
        if (files.length) {
          ev.preventDefault();
          void addComposerMediaFiles(files);
          return;
        }
        var clip = (cd && cd.getData && cd.getData("text")) || "";
        if (!clip) return;
        ev.preventDefault();
        if (/<(a?):([a-zA-Z0-9_]+):(\d{5,32})>/.test(clip)) {
          var parts = clip.split(/(<(?:a?):[a-zA-Z0-9_]+:\d{5,32}>)/g);
          parts.forEach(function (part) {
            if (!part) return;
            insertAtCursor(ta, part);
          });
        } else {
          insertAtCursor(ta, clip.slice(0, 2000));
        }
        state.composerText = serializeRichInput(ta);
        scheduleComposerLivePreview(ta);
        scheduleComposerSuggest(ta, true);
      });
    }
    var emojiBtn = byId("vc-wt-composer-emoji");
    if (emojiBtn && !emojiBtn._vcWired) {
      emojiBtn._vcWired = true;
      emojiBtn.addEventListener("click", function () {
        openEmojiPicker(emojiBtn, function (pick) {
          if (!pick || !pick.markup) return;
          insertAtCursor(byId("vc-wt-composer-text"), pick.markup, pick);
          state.composerText = serializeRichInput(byId("vc-wt-composer-text"));
          scheduleComposerLivePreview(byId("vc-wt-composer-text"));
        });
      });
    }
    var file = byId("vc-wt-composer-file");
    if (file && !file._vcWired) {
      file._vcWired = true;
      file.addEventListener("change", function () {
        void addComposerMediaFiles(file.files).then(function () {
          file.value = "";
        });
      });
    }
    if (form && !form._vcDropWired) {
      form._vcDropWired = true;
      form.addEventListener("dragover", function (ev) {
        if (!ev.dataTransfer) return;
        var types = ev.dataTransfer.types;
        var hasFiles = false;
        if (types) {
          for (var ti = 0; ti < types.length; ti += 1) {
            if (String(types[ti]).toLowerCase() === "files") {
              hasFiles = true;
              break;
            }
          }
        }
        if (!hasFiles) return;
        ev.preventDefault();
        form.classList.add("is-drop-target");
      });
      form.addEventListener("dragleave", function (ev) {
        if (ev.relatedTarget && form.contains(ev.relatedTarget)) return;
        form.classList.remove("is-drop-target");
      });
      form.addEventListener("drop", function (ev) {
        form.classList.remove("is-drop-target");
        var files = ev.dataTransfer && ev.dataTransfer.files ? ev.dataTransfer.files : null;
        if (!files || !files.length) return;
        ev.preventDefault();
        void addComposerMediaFiles(files);
      });
    }
    var prev = byId("vc-wt-composer-previews");
    if (prev && !prev._vcWired) {
      prev._vcWired = true;
      renderPreviews("vc-wt-composer-previews", state.composerImages || []);
      prev.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-rm-img]");
        if (!btn) return;
        var i = Number(btn.getAttribute("data-rm-img"));
        state.composerImages.splice(i, 1);
        renderPreviews("vc-wt-composer-previews", state.composerImages);
      });
    }
  }

  function wireOpenCatCards() {
    document.querySelectorAll("[data-open-cat]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function () {
        if (state.busy) return;
        createTicket(btn.getAttribute("data-open-cat") || "supporto");
      });
    });
  }

  function runTicketCommand(input) {
    if (!state.selectedId || !input) return;
    if (state.busy) {
      setStatus("Aspetta: c’è già un comando in corso…", true);
      return;
    }
    if (needsPartnershipForm(input)) {
      runPartnershipCommandFlow(input);
      return;
    }
    state.busy = true;
    setStatus("Esecuzione comando…", false);
    fetchJson(apiBase() + "/" + encodeURIComponent(state.selectedId) + "/command", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ input: input }),
    })
      .then(function (out) {
        if (out.data && out.data.needPartnershipForm) {
          state.busy = false;
          runPartnershipCommandFlow(input);
          return;
        }
        if (!out.res.ok || !out.data || !out.data.ok) {
          var errMsg = (out.data && out.data.message) || "Comando fallito.";
          setStatus(errMsg, true);
          appendMessage(
            {
              id: "local-cmd-err-" + Date.now(),
              authorKind: "system",
              authorName: "Sistema",
              authorAvatarUrl: "",
              content: errMsg,
              imageUrls: [],
              reactions: [],
              createdAt: new Date().toISOString(),
            },
            state.detail,
          );
          scrollChatBottom(true);
          return;
        }
        if (Array.isArray(out.data.deletedMessageIds)) {
          out.data.deletedMessageIds.forEach(function (id) {
            removeMessageFromUi(id);
          });
        }
        if (out.data.message) appendMessage(out.data.message, out.data.ticket);
        else if (out.data.ticket) refreshTicketInList(out.data.ticket);
        resetComposerUi();
        invalidateCommandCatalog();
        setStatus("Comando eseguito.", false);
        scrollChatBottom(true);
        focusComposerSoon();
      })
      .catch(function () {
        setStatus("Errore di rete.", true);
      })
      .then(function () {
        state.busy = false;
      });
  }

  function focusComposerSoon() {
    function run() {
      var ta = byId("vc-wt-composer-text");
      if (!ta) return;
      var y = pageScrollY();
      try {
        ta.focus({ preventScroll: true });
      } catch (e1) {
        try {
          ta.focus({ preventScroll: true });
        } catch (e2) {
          try {
            ta.focus();
          } catch (e3) {}
        }
      }
      restorePageScroll(y);
    }
    run();
    setTimeout(run, 0);
    setTimeout(run, 50);
  }

  function resetComposerUi() {
    state.composerText = "";
    state.composerImages = [];
    state.replyTo = null;
    clearTicketComposerDraft(state.selectedId);
    fillRichInput(byId("vc-wt-composer-text"), "");
    renderPreviews("vc-wt-composer-previews", []);
    hideCommandMenu();
    hideMentionMenu();
    syncComposerReplyBar();
    stopTicketTypingRoom();
  }

  function restoreComposerIfEmpty(text, images) {
    var want = String(text || "").trim();
    if (want) {
      try {
        var already = (state.messages || []).some(function (m) {
          if (!m || m.pending) return false;
          return String(m.content || "").trim() === want;
        });
        if (already) return;
      } catch (eAlready) {}
    }
    var ta = byId("vc-wt-composer-text");
    var current = serializeRichInput(ta).trim();
    if (current || (state.composerImages && state.composerImages.length)) return;
    state.composerText = String(text || "");
    state.composerImages = Array.isArray(images) ? images.slice() : [];
    fillRichInput(ta, state.composerText);
    renderPreviews("vc-wt-composer-previews", state.composerImages);
    if (state.composerText.trim()) saveTicketComposerDraft();
  }

  function removePendingMessage(pendingId) {
    var id = String(pendingId || "");
    if (!id) return;
    state.messages = (state.messages || []).filter(function (m) {
      return String((m && m.id) || "") !== id;
    });
    delete state.seenMessageIds[id];
    var log = byId("vc-wt-chat-log");
    if (!log) return;
    var node = log.querySelector('[data-msg-id="' + id + '"]');
    if (node) node.remove();
  }

  function sendMessage() {
    if (!state.selectedId) return;
    var perms = effectivePermissions();
    if (perms.canReply === false) {
      var lock = composerLockedReason();
      setStatus(
        lock === "unclaimed"
          ? "Devi claimare il ticket prima di scrivere."
          : "Ticket in carico a un altro staff. Non puoi scrivere.",
        true,
      );
      return;
    }
    var text = serializeRichInput(byId("vc-wt-composer-text")).trim();
    var images = (state.composerImages || []).slice();
    if (!text && !images.length) return;
    var replyTo = state.replyTo && state.replyTo.id ? Object.assign({}, state.replyTo) : null;
    if (text && looksLikeStaffCommand(text) && perms.canUseCommands && !images.length) {
      resetComposerUi();
      focusComposerSoon();
      if (needsPartnershipForm(text)) {
        runPartnershipCommandFlow(text);
        return;
      }
      runTicketCommand(text);
      return;
    }
    var pendingId = "pending-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    var pending = {
      id: pendingId,
      pending: true,
      content: text,
      imageUrls: images,
      authorId: state.viewerId || "",
      authorName: state.viewerName || "Tu",
      authorAvatarUrl: state.viewerAvatarUrl || "",
      authorKind: isStaffMode && perms.isStaffViewer ? "staff" : "user",
      createdAt: new Date().toISOString(),
      replyTo: replyTo || undefined,
    };
    resetComposerUi();
    appendMessage(pending);
    scrollChatBottom(true);
    focusComposerSoon();
    fetchJson(apiBase() + "/" + encodeURIComponent(state.selectedId) + "/messages", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        content: text,
        images: images,
        replyToId: replyTo ? replyTo.id : undefined,
      }),
    })
      .then(function (out) {
        removePendingMessage(pendingId);
        if (!out.res.ok || !out.data || !out.data.ok) {
          restoreComposerIfEmpty(text, images);
          if (replyTo) {
            state.replyTo = replyTo;
            syncComposerReplyBar();
          }
          setStatus((out.data && out.data.message) || "Invio fallito.", true);
          focusComposerSoon();
          return;
        }
        if (out.data.claimMessage) appendMessage(out.data.claimMessage, out.data.ticket);
        if (out.data.message) appendMessage(out.data.message, out.data.ticket);
        else if (!out.data.claimMessage && out.data.ticket) refreshTicketInList(out.data.ticket);
        scrollChatBottom(true);
        focusComposerSoon();
      })
      .catch(function () {
        removePendingMessage(pendingId);
        restoreComposerIfEmpty(text, images);
        if (replyTo) {
          state.replyTo = replyTo;
          syncComposerReplyBar();
        }
        setStatus("Errore di rete.", true);
        focusComposerSoon();
      });
  }

  function createTicket(categoryId) {
    if (state.busy) return;
    state.draftCategory = categoryId || state.draftCategory || "supporto";
    state.busy = true;
    setStatus("Apertura ticket…", false);
    fetchJson(apiBase(), {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        category: state.draftCategory,
      }),
    })
      .then(function (out) {
        state.busy = false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          setStatus((out.data && out.data.message) || "Creazione fallita.", true);
          return;
        }
        state.composeOpen = false;
        state.draftSubject = "";
        state.draftContent = "";
        state.draftImages = [];
        state.detail = out.data.ticket;
        state.messages = out.data.messages || [];
        state.selectedId = out.data.ticket && out.data.ticket.id;
        state.seenMessageIds = {};
        state.deletedMessageIds = {};
        state.messages.forEach(function (m) {
          if (m && m.id) state.seenMessageIds[m.id] = true;
        });
        setHashTicket(state.selectedId);
        state.listPage = 1;
        return loadList().then(function () {
          renderShell();
          scrollChatBottom(true);
          setStatus("Ticket aperto.", false);
        });
      })
      .catch(function () {
        state.busy = false;
        setStatus("Errore di rete.", true);
      });
  }

  function wireAll() {
    document.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter = btn.getAttribute("data-filter") || "all";
        state.listPage = 1;
        clearTicketSelection();
        renderShell();
        loadList({ soft: true });
      });
    });
    document.querySelectorAll("[data-cat-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.categoryFilter = btn.getAttribute("data-cat-filter") || "";
        state.listPage = 1;
        clearTicketSelection();
        renderShell();
        loadList({ soft: true });
      });
    });
    document.querySelectorAll("[data-cat-dd-toggle]").forEach(function (el) {
      el.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var dd = el.closest("[data-cat-dd]");
        var menu = dd && dd.querySelector("[data-cat-dd-menu]");
        if (!menu) return;
        var willOpen = menu.hidden;
        closeAllCatDd();
        if (willOpen) {
          menu.hidden = false;
          dd.classList.add("is-open");
          el.setAttribute("aria-expanded", "true");
        }
      });
    });
    if (!state.catDdDocWired) {
      state.catDdDocWired = true;
      document.addEventListener("mousedown", function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest("[data-cat-dd]")) return;
        closeAllCatDd();
      });
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") closeAllCatDd();
      });
    }
    if (!state.floatMenuDocWired) {
      state.floatMenuDocWired = true;
      document.addEventListener(
        "mousedown",
        function (ev) {
          var t = ev.target;
          if (t && t.closest && (t.closest("[data-cat-dd]") || t.closest("#vc-wt-mention-menu") || t.closest("#vc-wt-command-menu") || t.closest("#vc-wt-composer-text"))) {
            return;
          }
          hideMentionMenu();
          hideCommandMenu();
        },
        true,
      );
    }
    if (!state.floatMenuScrollWired) {
      state.floatMenuScrollWired = true;
      function onFloatMenuViewportChange(ev) {
        if (!(state.mentionMenu.open || state.commandMenu.open)) return;
        try {
          var t = ev && ev.target;
          if (
            t &&
            t.closest &&
            (t.closest("#vc-wt-mention-menu") ||
              t.closest("#vc-wt-command-menu") ||
              t.closest("#vc-wt-composer-text") ||
              t.closest(".vc-wt-chat-log") ||
              t.closest(".vc-wt-list"))
          ) {
            return;
          }
        } catch (eSkip) {}
        syncFloatingMenus();
      }
      window.addEventListener("resize", syncFloatingMenus, { passive: true });
      window.addEventListener("scroll", onFloatMenuViewportChange, { passive: true, capture: true });
      try {
        if (window.visualViewport) {
          window.visualViewport.addEventListener("resize", syncFloatingMenus, { passive: true });
          window.visualViewport.addEventListener("scroll", syncFloatingMenus, { passive: true });
        }
      } catch (eVvWire) {}
    }
    document.querySelectorAll("[data-view-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = btn.getAttribute("data-view-mode") === "staff" ? "staff" : "user";
        if (next === "staff" && !hasStaffInboxAccess()) {
          redirectAwayFromStaffView();
          return;
        }
        state.viewMode = next;
        state.listPage = 1;
                if (next === "user" && state.filter !== "closed" && state.filter !== "open" && state.filter !== "all") {
          state.filter = "all";
        }
        if (next === "user") {
                    try {
            if (hasStaffViewQuery()) {
              var hash = String(location.hash || "").trim();
              var path = String(location.pathname || "/tickets/").replace(/\/?$/, "/") || "/tickets/";
              history.replaceState(null, "", path + hash);
            }
          } catch (eUrl) {}
        } else {
          try {
            if (!hasStaffViewQuery()) {
              var u = new URL(location.href);
              u.searchParams.set("view", "staff");
              history.replaceState(null, "", u.pathname + u.search + u.hash);
            }
          } catch (eStaffUrl) {}
        }
        syncStaffMode();
        clearTicketSelection();
        renderShell();
        loadList();
        sendTicketPresence({ force: true });
      });
    });
    wireListClicks();
    wireListPager();
    wireChatActions();
    wireComposer();
    wireOpenCatCards();
    wireRatingPanel();
    wireMessageReactions(document);
    wireMessageTools(document);
    void ensureGuildEmojis();
  }

  function wsUrl() {
    var api = apiBase();
    if (!api || typeof URL === "undefined") return "";
    try {
      var u = new URL(api, location.origin);
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

  function disconnectWs() {
    if (state.wsReconnectTimer) {
      clearTimeout(state.wsReconnectTimer);
      state.wsReconnectTimer = null;
    }
    try {
      if (state.ws) {
        state.ws.onclose = null;
        state.ws.close();
      }
    } catch (e) {}
    state.ws = null;
  }

  function tryRequestTicketWindowAttention(msg) {
    if (!msg || msg.pending) return;
    if (isOwnMessage(msg)) return;
    if (String(msg.authorKind || "") === "system") return;
    if (typeof window.vcRequestWindowAttention !== "function") return;
    var name = String(msg.authorName || "Ticket").replace(/\s+/g, " ").trim() || "Ticket";
    var body = String(msg.content || "").replace(/\s+/g, " ").trim();
    window.vcRequestWindowAttention({
      title: body ? name + ": " + body.slice(0, 40) : name,
    });
  }

  function connectWs() {
    if (typeof WebSocket === "undefined") return;
    var url = wsUrl();
    if (!url) return;
    disconnectWs();
    try {
      var ws = new WebSocket(url);
      state.ws = ws;
      state.lastWsEventAt = 0;
      ws.onopen = function () {
        state.lastWsEventAt = Date.now();
        // Non spegnere del tutto il poll: se il WS resta “aperto” ma muto, i messaggi non arrivano.
        startPoll();
        if (state.selectedId) void refreshDetailQuiet();
      };
      ws.onmessage = function (ev) {
        try {
          state.lastWsEventAt = Date.now();
          var data = JSON.parse(String(ev.data || "{}"));
          var type = String(data.type || "");
          if (type === "realtime_hello" || type === "suggestions_hello") return;
          if (type === "web_ticket_message") {
            if (data.ticketId && data.ticketId === state.selectedId && data.message) {
              appendMessage(data.message, data.ticket);
            } else if (data.ticket) {
              refreshTicketInList(data.ticket);
            } else {
              void scheduleLoadListQuiet();
            }
            tryRequestTicketWindowAttention(data.message);
            return;
          }
          if (type === "web_ticket_reaction") {
            if (data.ticketId && data.ticketId === state.selectedId && data.message) {
              patchMessageInState(data.message);
            }
            if (data.ticket) refreshTicketInList(data.ticket);
            return;
          }
          if (type === "web_ticket_message_updated") {
            if (data.ticketId && data.ticketId === state.selectedId && data.message) {
              patchMessageInState(data.message);
            }
            if (data.ticket) refreshTicketInList(data.ticket);
            return;
          }
          if (type === "web_ticket_message_deleted") {
            if (data.ticketId && data.ticketId === state.selectedId && data.messageId) {
              removeMessageFromUi(data.messageId);
            }
            if (data.ticket) refreshTicketInList(data.ticket);
            return;
          }
          if (type === "web_ticket_updated" || type === "web_ticket_created") {
            if (data.ticket && data.ticket.id === state.selectedId) {
              state.detail = mergeTicketDetail(data.ticket);
              refreshTicketInList(data.ticket);
              refreshChatChrome();
            } else if (data.ticket) {
              refreshTicketInList(data.ticket);
            } else {
              void scheduleLoadListQuiet();
            }
            return;
          }
          if (type === "web_tickets_list_changed") {
            void scheduleLoadListQuiet();
            if (state.selectedId) void refreshDetailQuiet();
            return;
          }
          if (type === "web_ticket_typing") {
            if (data.ticketId && data.ticketId === state.selectedId) {
              if (data.stop) {
                var roomStop = ensureTicketTypingRoom();
                if (roomStop) roomStop.clearUser(data.userId);
              } else {
                noteTicketTyping(data.userId, data.userName);
              }
            }
            return;
          }
                  } catch (e3) {}
      };
      ws.onclose = function () {
        state.ws = null;
        startPoll();
        state.wsReconnectTimer = setTimeout(function () {
          state.wsReconnectTimer = null;
          connectWs();
        }, 4000);
      };
      ws.onerror = function () {
        try {
          ws.close();
        } catch (e4) {}
      };
    } catch (e5) {
      state.ws = null;
      startPoll();
    }
  }

  function stopPoll() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function startPoll() {
    stopPoll();
    state.pollTimer = setInterval(function () {
      if (document.visibilityState === "hidden") return;
      if (window.VcApiCache && typeof window.VcApiCache.isWebhookBlocked === "function") {
        if (window.VcApiCache.isWebhookBlocked()) return;
      }
      // WS zombie: connesso ma senza eventi da troppo → forza sync chat aperta.
      var wsOpen = state.ws && state.ws.readyState === 1;
      if (wsOpen && state.selectedId && state.lastWsEventAt) {
        var silentFor = Date.now() - Number(state.lastWsEventAt || 0);
        if (silentFor > 45000) {
          try {
            state.ws.close();
          } catch (eZ) {}
        }
      }
      void loadListQuiet();
      if (state.selectedId) void refreshDetailQuiet();
    }, ticketPollIntervalMs());
  }

  function loadListQuiet() {
    if (!getToken()) return Promise.resolve();
    var quietGen = (state.listQuietGen = (Number(state.listQuietGen) || 0) + 1);
    return fetchJson(apiBase() + listQuery(), {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
      timeoutMs: 18000,
    })
      .then(function (out) {
        if (quietGen !== state.listQuietGen) return;
        if (!out.res.ok || !out.data || !out.data.ok) return;
        applyListPayload(out.data);
        refreshListPane();
      })
      .catch(function () {});
  }

  function scheduleLoadListQuiet() {
    if (state.listQuietTimer) clearTimeout(state.listQuietTimer);
    state.listQuietTimer = setTimeout(function () {
      state.listQuietTimer = null;
      void loadListQuiet();
    }, 250);
  }

  function ensureTicketTypingRoom() {
    if (state.typingRoom) {
      state.typingRoom.selfId = String(state.viewerId || "").trim();
      return state.typingRoom;
    }
    if (!window.VcChatTyping || !window.VcChatTyping.TypingRoom) return null;
    state.typingRoom = new window.VcChatTyping.TypingRoom({
      selfId: String(state.viewerId || "").trim(),
      minInterval: 2000,
      onChange: function () {
        var el = byId("vc-wt-typing");
        if (state.typingRoom) state.typingRoom.renderInto(el);
      },
      sendFn: function (opts) {
        var tid = String(state.selectedId || "").trim();
        if (!tid || !getToken()) return;
        void fetchJson(apiBase() + "/" + encodeURIComponent(tid) + "/typing", {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify(opts && opts.stop ? { stop: true } : {}),
          timeoutMs: 6000,
        }).catch(function () {});
      },
    });
    return state.typingRoom;
  }

  function pulseTicketTyping(hasText) {
    var room = ensureTicketTypingRoom();
    if (room) room.pulse(Boolean(hasText));
  }

  function noteTicketTyping(userId, userName) {
    var room = ensureTicketTypingRoom();
    if (room) room.note(userId, userName);
  }

  function stopTicketTypingRoom() {
    if (state.typingRoom) {
      try {
        state.typingRoom.pulse(false);
      } catch (e0) {}
      state.typingRoom.reset();
    }
  }

  function sendTicketPresence(opts) {
    opts = opts || {};
    if (!getToken()) return;
    var clear = opts.clear === true;
    var ticketId = clear ? "" : String(state.selectedId || "").trim();
    var inbox = !clear && state.viewMode === "staff";
    var key = clear ? "clear" : "id:" + ticketId + "|inbox:" + (inbox ? "1" : "0");
    if (!opts.force && key === state.presenceLastSent && !clear) return;
    state.presenceLastSent = key;
    try {
      var focused = false;
      try {
        focused =
          document.visibilityState === "visible" &&
          (typeof document.hasFocus !== "function" || document.hasFocus());
      } catch (eFocus) {
        focused = document.visibilityState === "visible";
      }
      window.__VC_WATCHING_TICKET = {
        id: focused && !clear ? String(ticketId || "") : "",
      };
      if (typeof window.__vcPingSwClientFocus === "function") {
        window.__vcPingSwClientFocus();
      }
    } catch (eWatch) {}
    var body = clear
      ? { clear: true }
      : { ticketId: ticketId || null, inbox: Boolean(inbox), view: inbox ? "staff" : "user" };
    void fetchJson(apiBase() + "/presence", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(body),
      timeoutMs: 8000,
    }).catch(function () {});
  }

  function startTicketPresence() {
    stopTicketPresence(false);
    sendTicketPresence({ force: true });
    state.presenceTimer = setInterval(function () {
      if (document.visibilityState === "hidden") return;
      sendTicketPresence({ force: true });
    }, ticketPresenceIntervalMs());
  }

  function stopTicketPresence(clearRemote) {
    if (state.presenceTimer) {
      clearInterval(state.presenceTimer);
      state.presenceTimer = null;
    }
    if (clearRemote) {
      state.presenceLastSent = "";
      sendTicketPresence({ clear: true, force: true });
    }
  }

  function refreshDetailQuiet() {
    if (!state.selectedId || !getToken()) return Promise.resolve();
    return fetchJson(apiBase() + "/" + encodeURIComponent(state.selectedId), {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    }).then(function (out) {
      if (!out.res.ok || !out.data || !out.data.ok) return;
      state.detail = mergeTicketDetail(out.data.ticket, { trustPermissions: true });
      var incoming = out.data.messages || [];
      var byIdMap = {};
      state.messages.forEach(function (m) {
        if (m && m.id) byIdMap[m.id] = m;
      });
      var added = 0;
      incoming.forEach(function (m) {
        if (!m || !m.id) return;
        if (state.deletedMessageIds[m.id]) return;
        if (!state.seenMessageIds[m.id]) {
          state.seenMessageIds[m.id] = true;
          state.messages.push(m);
          added += 1;
          var log = byId("vc-wt-chat-log");
          if (log) {
            log.insertAdjacentHTML("beforeend", messageHtml(m));
            var node = log.querySelector('[data-msg-id="' + m.id + '"]');
            if (node) {
              wireMessageReactions(node);
              wireMessageTools(node);
            }
          }
          return;
        }
        var prev = byIdMap[m.id];
        var prevJson = JSON.stringify((prev && prev.reactions) || []);
        var nextJson = JSON.stringify(m.reactions || []);
        if (prevJson !== nextJson) patchMessageInState(m);
      });
      if (added > 0) {
        scrollChatBottom(false);
        hydrateContentRefs(incoming);
      }
      refreshTicketInList(out.data.ticket);
      refreshChatChrome();
    }).catch(function () {});
  }

  function wireGate() {
    var gateBtn = byId("vc-wt-gate-login-cta");
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

  function applyTicketsUrlState(opts) {
    opts = opts || {};
    var fromUrl = consumeReplyToFromUrl();
    if (fromUrl) pendingReplyToId = fromUrl;
    var forceStaff = false;
    try {
      var params = new URLSearchParams(location.search || "");
      if (params.get("view") === "staff") forceStaff = true;
    } catch (eView) {}
    if (forceStaff && state.viewMode !== "staff") {
      state.viewMode = "staff";
      syncStaffMode();
    }
    var hashId = resolveHashTicketId();
    if (!hashId) return Promise.resolve();
    if (!opts.force && state.selectedId === hashId && state.detail && state.detail.id === hashId) {
      return Promise.resolve();
    }
    state.selectedId = hashId;
    if (forceStaff && hasStaffInboxAccess()) {
      state.viewMode = "staff";
      syncStaffMode();
      return loadListQuiet().then(function () {
        return openTicket(hashId, true);
      });
    }
    return openTicket(hashId, true);
  }

  function wireTicketsUrlListeners() {
    if (state.urlListenersWired) return;
    state.urlListenersWired = true;
    window.addEventListener("hashchange", function () {
      void applyTicketsUrlState({ force: true });
    });
    window.addEventListener("popstate", function () {
      void applyTicketsUrlState({ force: true });
    });
    window.addEventListener("vc:web-tickets-open", function (ev) {
      var id = ev && ev.detail && ev.detail.id ? String(ev.detail.id) : "";
      var staff = ev && ev.detail && ev.detail.staff === true;
      if (staff) {
        state.viewMode = "staff";
        syncStaffMode();
      }
      if (id) {
        state.selectedId = id;
        setHashTicket(id);
        void (staff
          ? loadListQuiet().then(function () {
              return openTicket(id, true);
            })
          : openTicket(id, true));
      } else {
        void applyTicketsUrlState({ force: true });
      }
    });
  }

  function scheduleTokenWaitBoot() {
    if (state.tokenWaitTimer) return;
    var tries = 0;
    function tick() {
      state.tokenWaitTimer = null;
      tries += 1;
      if (getToken()) {
        boot();
        return;
      }
      if (tries >= 24) return;
      state.tokenWaitTimer = window.setTimeout(tick, tries < 6 ? 250 : 500);
    }
    state.tokenWaitTimer = window.setTimeout(tick, 200);
  }

  function teardownTicketsAfterLogout() {
    try {
      state.viewMode = "user";
      state.staffAccess = false;
      isStaffMode = false;
      stopTicketPresence(true);
      disconnectWs();
      stopPoll();
      state.tickets = [];
      state.selectedId = "";
      state.detail = null;
      state.messages = [];
      try {
        var u = new URL(location.href);
        if (u.searchParams.get("view") === "staff") {
          u.searchParams.delete("view");
          history.replaceState(null, "", u.pathname + u.search + u.hash);
        }
      } catch (eUrl) {}
      syncStaffMode();
      showGate();
      setStatus("");
    } catch (eTd) {
      try {
        showGate();
      } catch (eGate) {}
    }
  }

  function onDiscordAuthReady() {
    if (state.tokenWaitTimer) {
      clearTimeout(state.tokenWaitTimer);
      state.tokenWaitTimer = null;
    }
    if (state.authBootTimer) clearTimeout(state.authBootTimer);
    state.authBootTimer = window.setTimeout(function () {
      state.authBootTimer = null;
      if (!getToken()) {
        teardownTicketsAfterLogout();
        return;
      }
      boot();
    }, 80);
  }

  function boot() {
    if (state.bootWired) {
      if (!getToken()) {
        teardownTicketsAfterLogout();
        scheduleTokenWaitBoot();
        return;
      }
      hideGate();
      var rebootReply = consumeReplyToFromUrl();
      if (rebootReply) pendingReplyToId = rebootReply;
      // Soft refresh on late auth events so deeplink openTicket isn't wiped mid-flight.
      var softReboot = Array.isArray(state.tickets) && state.tickets.length > 0;
      loadList({ soft: softReboot }).then(function () {
        connectWs();
        startPoll();
        startTicketPresence();
      });
      return;
    }
    state.bootWired = true;
    wireGate();
    wireTicketsUrlListeners();
    /* ticketsBootAuth1: always wire auth listeners BEFORE token gate — previously
       early return skipped them, so first phone stamp never loaded after login. */
    window.addEventListener("vc-discord-profile", onDiscordAuthReady);
    window.addEventListener("vc:discord-auth", onDiscordAuthReady);
    window.addEventListener("vc:auth-logout", function () {
      teardownTicketsAfterLogout();
    });
    window.addEventListener("storage", function (ev) {
      try {
        if (!ev || ev.key !== ACCESS_TOKEN_KEY) return;
        onDiscordAuthReady();
      } catch (eSt) {}
    });
    window.addEventListener("beforeunload", function () {
      flushComposerTextFromDom();
      saveTicketComposerDraft();
      stopTicketPresence(true);
      disconnectWs();
      stopPoll();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        if (state.presenceResumeTimer) {
          clearTimeout(state.presenceResumeTimer);
          state.presenceResumeTimer = null;
        }
        stopTicketPresence(true);
        return;
      }
      if (state.presenceResumeTimer) clearTimeout(state.presenceResumeTimer);
      state.presenceResumeTimer = setTimeout(function () {
        state.presenceResumeTimer = null;
        startTicketPresence();
        // ticketChatSync1: al ritorno sul tab risincronizza chat + WS.
        void loadListQuiet();
        if (state.selectedId) void refreshDetailQuiet();
        if (!state.ws || state.ws.readyState > 1) connectWs();
        else startPoll();
      }, isCoarseMobile() ? 900 : 350);
    });
    try {
      var params = new URLSearchParams(location.search || "");
      if (params.get("view") === "staff") {
        state.viewMode = "staff";
        syncStaffMode();
      }
    } catch (eView) {}
    if (!getToken()) {
      teardownTicketsAfterLogout();
      scheduleTokenWaitBoot();
      return;
    }
    hideGate();
    showTicketsLoadingShell("Caricamento ticket…");
    var bootReply = consumeReplyToFromUrl();
    if (bootReply) pendingReplyToId = bootReply;
    loadList().then(function () {
      connectWs();
      startPoll();
      startTicketPresence();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* cursorTrailOff1: scia rimossa */
})();
