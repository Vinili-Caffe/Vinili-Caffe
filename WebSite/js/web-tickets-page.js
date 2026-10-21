(function () {
  /* ticketsLagHard1: scroll chat contain; no full shell su load-older; MO debounce; less scroll fight */
  /* ticketActBridge1: postAction via composer chunk (no ReferenceError + clear aria-busy) */
  /* perfRoiPack2: window messaggi lunghi (ultimi N + load older) — no look change */
  /* lazyEverywhere1: composer+emoji-picker solo su focus/interact (no warm a boot) */
  /* ticketsCpu45_1: #4 reactions fingerprint (no JSON.stringify); #5 md-live solo tab focus; #6 WS skip */
  /* ticketsMsgRailCpu1: msg tools delegation; rail no gap dx; CPU idle poll #1–#3 */
  /* ticketsRailComposer1: sidebar = card/pager (no gap dx); composer #/@/+/bottoni; placeholder CSS */
  /* ticketsUiFix1: no toast rete falso; no remount skel su retry; card lista più larghe; no scrollbar chat vuota */
  /* ticketMsgEmojiFix1: emoji/mentions/markdown in link embeds + reply + composer */
  /* pickerFloatFix1: @/#/+ menu fixed al viewport su scroll/mobile */
  /* siteApiW8: ETag/304 on quiet list/detail polls */
  /* ticketPhoneFirst1: phone first-paint staff chrome + lista (ruoli/filter/cine) */
  /* ticket429Flash1: no 429 storm + no force soft-fx (flash flat) */
  /* composerMdCaret1: no auto-<a> su markdown link (caret bug) */
  /* composerMdPlain1: overlay no fake @/# mention chips; heading size = caret */
  /* composerMentionShow1: menzioni <@id> di nuovo visibili (chip), no md-gap hidden */
  /* ticketsComposerLag1: meno Forced reflow in basso (autosize + md-live throttle) */
  /* ticketsPerfPack1: md-live off mobile/lunghi; autosize grow senza height:0; presence/poll WS */
  /* ticketsChatLag2: typing debounce draft; md-live solo con markup; no remount chat su resolve nomi */
  /* ticketPushGate1: push obbligatorie prima di aprire un ticket (no silent ignore) */
  /* chatOpenBottom1: pin ultimo msg all'open — no race con auto load-older a scrollTop=0 */
  /* ticketSkelNoYoYo1: no remount skeleton 2–3× se lista/empty già pronti (auth/retry/empty) */
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";

  /* ticketsMsgRailCpu1: pin CSS last-wins (rail piena + tools cliccabili + placeholder abs) */
  try {
    if (!window.__vcTicketsMsgRailCpu1Pin) {
      window.__vcTicketsMsgRailCpu1Pin = 1;
      try {
        var oldCpuPin = document.getElementById("vc-tickets-msg-rail-cpu1");
        if (oldCpuPin && oldCpuPin.parentNode) oldCpuPin.parentNode.removeChild(oldCpuPin);
      } catch (eRmCpu) {}
      var uiPin = document.createElement("style");
      uiPin.id = "vc-tickets-msg-rail-cpu1";
      uiPin.setAttribute("data-vc", "ticketsLagHard1");
      uiPin.textContent =
        /* ticketsLagHard1: pin last vs soft-fx remount — chat scroll isolato + cine morto */
        "html body.vc-body.vc-web-tickets-page .vc-home-cine," +
        "html.vc-site-polish body.vc-body.vc-web-tickets-page .vc-home-cine{" +
        "pointer-events:none!important;filter:none!important;will-change:auto!important}" +
        "html body.vc-body.vc-web-tickets-page .vc-home-cine__canvas," +
        "html body.vc-body.vc-web-tickets-page .vc-home-cine__grain," +
        "html body.vc-body.vc-web-tickets-page .vc-home-cine__spotlight{" +
        "display:none!important;visibility:hidden!important;pointer-events:none!important}" +
        "html.vc-site-polish body.vc-body.vc-web-tickets-page .vc-wt-chat__log," +
        "html.vc-site-polish body.vc-body.vc-web-tickets-page #vc-wt-chat-log," +
        "html body.vc-body.vc-web-tickets-page .vc-wt-chat__log," +
        "html body.vc-body.vc-web-tickets-page #vc-wt-chat-log{" +
        "overflow-x:hidden!important;overflow-y:scroll!important;" +
        "overscroll-behavior:contain!important;-webkit-overflow-scrolling:touch!important}" +
        "html body.vc-body.vc-web-tickets-page .vc-wt-item," +
        "html.vc-site-polish body.vc-body.vc-web-tickets-page .vc-wt-item{" +
        "content-visibility:auto;contain-intrinsic-size:auto 76px}" +
        "@media (min-width:901px){" +
        "body.vc-web-tickets-page .vc-wt-layout," +
        "html.vc-site-polish body.vc-web-tickets-page .vc-wt-layout," +
        "html.vc-site-polish body.vc-body.vc-web-tickets-page#top .vc-wt-layout{" +
        "grid-template-columns:minmax(260px,22rem) minmax(0,1fr)!important;column-gap:0!important;gap:0!important}" +
        "}" +
        "body.vc-web-tickets-page .vc-wt-sidebar," +
        "html.vc-site-polish body.vc-web-tickets-page .vc-wt-sidebar," +
        "html.vc-site-polish body.vc-body.vc-web-tickets-page#top .vc-wt-sidebar{" +
        "padding-right:0!important;margin-right:0!important}" +
        "body.vc-web-tickets-page .vc-wt-list," +
        "html.vc-site-polish body.vc-web-tickets-page .vc-wt-list," +
        "html.vc-site-polish body.vc-body.vc-web-tickets-page#top .vc-wt-list," +
        "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body.vc-web-tickets-page#top .vc-wt-list{" +
        "align-items:stretch!important;width:100%!important;box-sizing:border-box!important;" +
        "padding:0 0 0.55rem 0.4rem!important;padding-right:0!important}" +
        "body.vc-web-tickets-page .vc-wt-item," +
        "html.vc-site-polish body.vc-web-tickets-page .vc-wt-item," +
        "html.vc-site-polish body.vc-body.vc-web-tickets-page#top .vc-wt-item," +
        "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body.vc-web-tickets-page#top .vc-wt-item{" +
        "width:100%!important;max-width:none!important;box-sizing:border-box!important;" +
        "align-self:stretch!important;min-width:0!important;margin-inline:0!important;" +
        "border-top-right-radius:0.85rem!important;border-bottom-right-radius:0.85rem!important}" +
        "body.vc-web-tickets-page #vc-wt-pager-wrap," +
        "html.vc-site-polish body.vc-web-tickets-page #vc-wt-pager-wrap{" +
        "width:100%!important;max-width:100%!important;box-sizing:border-box!important;" +
        "justify-content:center!important;padding-right:0.35rem!important}" +
        "body.vc-web-tickets-page .vc-wt-pager," +
        "html.vc-site-polish body.vc-web-tickets-page .vc-wt-pager{" +
        "max-width:100%!important;box-sizing:border-box!important}" +
        /* msg tools: sempre cliccabili su hover/stack (no pointer-events race) */
        "body.vc-web-tickets-page .vc-wt-msg__tools{" +
        "opacity:0;pointer-events:none;transform:translateY(4px)}" +
        "body.vc-web-tickets-page .vc-wt-msg:hover .vc-wt-msg__tools," +
        "body.vc-web-tickets-page .vc-wt-msg:focus-within .vc-wt-msg__tools," +
        "body.vc-web-tickets-page .vc-wt-msg__stack:hover .vc-wt-msg__tools," +
        "body.vc-web-tickets-page .vc-wt-msg__tools:hover," +
        "body.vc-web-tickets-page .vc-wt-msg__tools:focus-within{" +
        "opacity:1!important;pointer-events:auto!important;transform:none!important}" +
        "@media (hover:none){body.vc-web-tickets-page .vc-wt-msg__tools{" +
        "opacity:1!important;pointer-events:auto!important;transform:none!important}}" +
        /* placeholder: absolute fuori dal flusso editing (sitewide contenteditable) */
        ".vc-wt-composer__input," +
        ".vc-profile-extras .vc-px-composer__input{position:relative!important}" +
        ".vc-wt-composer__input:empty:before," +
        ".vc-wt-composer__input.is-empty:before," +
        ".vc-profile-extras .vc-px-composer__input.is-empty:before{" +
        "content:attr(data-placeholder)!important;position:absolute!important;" +
        "left:0.85rem!important;right:0.85rem!important;top:0.7rem!important;" +
        "margin:0!important;pointer-events:none!important;user-select:none!important;" +
        "-webkit-user-select:none!important;z-index:0!important}" +
        "body.vc-web-tickets-page .vc-wt-chat__log," +
        "body.vc-web-tickets-page #vc-wt-chat-log," +
        "body.vc-web-tickets-page .vc-wt-chat--closed .vc-wt-chat__log," +
        "html.vc-site-polish body.vc-web-tickets-page .vc-wt-chat__log," +
        "html.vc-site-polish body.vc-web-tickets-page #vc-wt-chat-log{" +
        "scrollbar-width:none!important}" +
        "body.vc-web-tickets-page .vc-wt-chat__log::-webkit-scrollbar," +
        "body.vc-web-tickets-page #vc-wt-chat-log::-webkit-scrollbar," +
        "body.vc-web-tickets-page .vc-wt-chat--closed .vc-wt-chat__log::-webkit-scrollbar," +
        "html.vc-site-polish body.vc-web-tickets-page .vc-wt-chat__log::-webkit-scrollbar," +
        "html.vc-site-polish body.vc-web-tickets-page #vc-wt-chat-log::-webkit-scrollbar{" +
        "width:0!important;height:0!important;display:none!important;visibility:hidden!important;" +
        "background:transparent!important}";
      (document.head || document.documentElement).appendChild(uiPin);
      try {
        ["vc-tickets-ui-fix1", "vc-tickets-rail-composer1"].forEach(function (id) {
          var oldPin = document.getElementById(id);
          if (oldPin && oldPin.parentNode) oldPin.parentNode.removeChild(oldPin);
        });
      } catch (eOldPin) {}
    }
  } catch (eUiPin) {}
  /* ticketsLagHard1: spegni layer cine (pointer/layout thrash) sulla pagina tickets */
  try {
    if (!window.__vcTicketsCineKill1) {
      window.__vcTicketsCineKill1 = 1;
      var cineKill = function () {
        try {
          var stage = document.querySelector(".vc-home-cine");
          if (!stage) return;
          stage.setAttribute("aria-hidden", "true");
          stage.style.setProperty("pointer-events", "none", "important");
          stage.style.setProperty("will-change", "auto", "important");
          var dead = stage.querySelectorAll(".vc-home-cine__canvas, .vc-home-cine__grain, .vc-home-cine__spotlight");
          for (var di = 0; di < dead.length; di += 1) {
            dead[di].style.setProperty("display", "none", "important");
            dead[di].style.setProperty("pointer-events", "none", "important");
          }
        } catch (eCk) {}
      };
      cineKill();
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", cineKill, { once: true });
      }
      window.setTimeout(cineKill, 0);
      window.setTimeout(cineKill, 800);
    }
  } catch (eCineKill) {}
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

  function i18nFallback(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var out = window.VcI18n.t(key);
        if (out && out !== key) return out;
      }
    } catch (e0) {}
    return fallback;
  }

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
    /* ticketScopeClick2: scelta esplicita Personali/Staff — non farla override da ?view=staff */
    viewPinnedByUser: "",
    staffAccessResolved: false,
    viewModeDelegated: false,
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
    listEtags: {},
    detailEtags: {},
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
    listHardPromise: null,
    listHardKey: "",
    listHardStartedAt: 0,
    listBusyWatchTimer: null,
    listQuietTimer: null,
    /* ticketSwitchFast1: cache lista per scope (Personali/Staff) — switch istantaneo */
    scopeCache: { user: null, staff: null },
    scopePrefetchTimer: null,
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
      /* ticketNotifGate1: rispetta view-as logout; altrimenti raw LS (bypassa mask rotta) */
      var va = "";
      try {
        va = String(sessionStorage.getItem("vc_view_as") || "")
          .trim()
          .toLowerCase();
      } catch (eVa) {}
      if (va === "logout") return "";
      var t = "";
      var expRaw = "0";
      if (typeof window.__vcDiscordRawLocalStorageGetItem === "function") {
        t = String(window.__vcDiscordRawLocalStorageGetItem(ACCESS_TOKEN_KEY) || "").trim();
        expRaw = String(window.__vcDiscordRawLocalStorageGetItem(ACCESS_EXPIRES_KEY) || "0");
      } else {
        t = String(localStorage.getItem(ACCESS_TOKEN_KEY) || "").trim();
        expRaw = String(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
      }
      if (!t) return "";
      var exp = Number(expRaw || "0");
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
    // ticketsCpuHard2 + ticketsPerfPack1 + ticketsMsgRailCpu1 #1: idle lista = poll molto più lento
    var wsOpen = state.ws && state.ws.readyState === 1;
    var fresh = wsOpen && wsFreshForQuietPoll();
    var idleList = !state.selectedId;
    if (idleList) {
      if (isCoarseMobile()) return fresh ? 120000 : wsOpen ? 90000 : 60000;
      return fresh ? 90000 : wsOpen ? 60000 : 45000;
    }
    if (isCoarseMobile()) return fresh ? 55000 : wsOpen ? 32000 : 16000;
    return fresh ? 45000 : wsOpen ? 22000 : 11000;
  }

  function ticketPresenceIntervalMs() {
    /* ticketsPerfPack1: heartbeat raro; eventi focus/visibility fanno il lavoro */
    return isCoarseMobile() ? 120000 : 90000;
  }

  function wsFreshForQuietPoll() {
    try {
      if (!state.ws || state.ws.readyState !== 1) return false;
      var last = Number(state.lastWsEventAt || 0);
      if (!last) return true;
      return Date.now() - last < 45000;
    } catch (e0) {
      return false;
    }
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

  /* ticketPhoneBtnFix1: normalizza message API (string | system object) per toast */
  function apiErrorText(msg, fallback) {
    if (typeof msg === "string") {
      var s = msg.trim();
      if (s && s !== "[object Object]") return s;
      return String(fallback || "").trim();
    }
    if (msg && typeof msg === "object") {
      /* system/message payload: non è un errore testuale */
      if (typeof msg.content === "string" || msg.id || msg.authorKind) return String(fallback || "").trim();
      if (typeof msg.message === "string" && msg.message.trim()) return msg.message.trim();
      return String(fallback || "").trim();
    }
    if (msg == null) return String(fallback || "").trim();
    var raw = String(msg).trim();
    if (!raw || raw === "[object Object]") return String(fallback || "").trim();
    return raw;
  }

  /* ticketClaimHard1: 2xx + ok:true oppure ticket = successo (message system object non è errore) */
  function apiActionFailed(out) {
    if (!out || !out.res) return true;
    var status = Number(out.res.status || 0);
    var data = out.data;
    if (status >= 200 && status < 300) {
      if (data && data.ok === true) return false;
      if (data && data.ticket && data.ok !== false) return false;
    }
    return !out.res.ok || !data || data.ok !== true;
  }

  function setStatus(msg, isError) {
    var el = byId("vc-wt-status");
    if (el) {
      el.textContent = "";
      el.hidden = true;
    }
    /* ticketActionFail1 + ticketPhoneBtnFix1: message API a volte è oggetto (system msg) */
    var text = apiErrorText(msg, "");
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
    /* ticketPhoneCine2: dopo login ripristina cine layout */
    try {
      document.documentElement.classList.add("vc-site-photo-bg", "vc-cine-static-bg", "vc-home-cine-live");
      if (!document.body.classList.contains("vc-page-cine-layout")) {
        document.body.classList.add("vc-page-cine-layout");
      }
      var hero = document.querySelector(".vc-support-page-hero, .vc-wt-page-hero, .vc-page-cine-hero");
      if (hero) {
        hero.classList.add("vc-page-cine-hero", "vc-home-cine-hero");
      }
      document.dispatchEvent(new CustomEvent("vc:cine-refresh"));
    } catch (eCine) {}
    ensureTicketsPageVisible();
  }

  function showGate() {
    /* marquee404Fix1: showGate NON deve più chiamare hideGate
       (loginRequiredModal1 aveva spezzato Accedi → solo dismiss overlay) */
    var g = byId("vc-wt-gate");
    if (g) {
      try {
        g.removeAttribute("hidden");
        g.classList.remove("vc-reviews-gate--dismissed");
      } catch (eShow) {}
      try {
        document.body.classList.add("vc-wt-gate-open");
      } catch (eOpen) {}
    }
    try {
      clearTicketsBusyState();
    } catch (eBusy) {}
    try {
      wireGate();
    } catch (eWire) {}
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

  /* ticketsCpuHard3: GIF avatar/emoji Discord = decode continuo (~30% CPU tab) */
  function stillDiscordMediaUrl(url, size) {
    var raw = String(url || "").trim();
    if (!raw) return "";
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.preferStaticUrl === "function") {
        var still = window.VcDiscordAvatar.preferStaticUrl(raw, size || 0);
        if (still) raw = still;
      } else {
        raw = raw.replace(/\.(gif|webp)(\?|#|$)/i, ".png$2");
      }
    } catch (eStill) {
      raw = raw.replace(/\.gif(\?|#|$)/i, ".png$1");
    }
    raw = raw.replace(/([?&])animated=true(&|$)/gi, function (_m, sep, trail) {
      return trail === "&" ? sep : "";
    });
    raw = raw.replace(/[?&]$/, "");
    return raw;
  }

  /* ticketsMsgRailCpu1 / #3: freeze GIF nel host (prima era solo nel chunk → ReferenceError + MO morto) */
  function freezeTicketsAnimatedMedia(root) {
    try {
      var imgs;
      if (root && root.tagName === "IMG") {
        imgs = [root];
      } else {
        var scope = root && root.querySelectorAll ? root : document;
        imgs = scope.querySelectorAll("img");
      }
      for (var i = 0; i < imgs.length; i += 1) {
        var img = imgs[i];
        if (!img || img.getAttribute("data-vc-tickets-still") === "1") continue;
        var src = String(img.getAttribute("src") || img.currentSrc || "").trim();
        if (!src) continue;
        if (!/cdn\.discordapp\.com|media\.discordapp\.net/i.test(src)) continue;
        if (!/\.gif(?:$|[?#])/i.test(src) && !/[?&]animated=true/i.test(src)) {
          img.setAttribute("data-vc-tickets-still", "1");
          continue;
        }
        var next = stillDiscordMediaUrl(src, 0);
        if (next && next !== src) {
          img.setAttribute("data-vc-avatar-static", "1");
          img.setAttribute("src", next);
          try {
            img.src = next;
          } catch (eSrc) {}
        }
        img.setAttribute("data-vc-tickets-still", "1");
      }
    } catch (eFreeze) {}
  }

  function wakeTicketAvatars(root) {
    try {
      if (window.VcWakeDeferredMedia && typeof window.VcWakeDeferredMedia === "function") {
        window.VcWakeDeferredMedia(root || document);
      }
    } catch (eWake) {}
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.scan === "function") {
        window.VcDiscordAvatar.scan(root || document);
      }
    } catch (eScan) {}
    try {
      if (window.VcAvatarFallback && typeof window.VcAvatarFallback.scan === "function") {
        window.VcAvatarFallback.scan(root || document);
      }
    } catch (eFb) {}
  }

  /* ticketAvPalette1 + ticketsUiPack1: eager + fallback lettera (no silhouette coffee) */
  function avatarHtml(url, name, cls, userId) {
    var src = stillDiscordMediaUrl(String(url || "").trim(), 64);
    var letter = String(name || "?").trim().charAt(0).toUpperCase() || "?";
    var safeLetter = esc(letter).replace(/"/g, "");
    var uid = String(userId || "").trim();
    var uidAttr = /^\d{16,22}$/.test(uid) ? ' data-user-id="' + esc(uid) + '"' : "";
    if (!src && /^\d{16,22}$/.test(uid)) {
      try {
        if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.defaultEmbedAvatarUrl === "function") {
          src = window.VcDiscordAvatar.defaultEmbedAvatarUrl(uid, 64) || "";
        }
      } catch (eDef) {}
      if (!src) {
        var idx = 0;
        try {
          idx = Number((BigInt(uid) >> 22n) % 6n);
        } catch (eIdx) {
          idx = Number(uid.slice(-2)) % 6;
        }
        src = "https://cdn.discordapp.com/embed/avatars/" + idx + ".png?size=64";
      }
    }
    if (src) {
      var onErr =
        "this.onerror=null;var p=this.parentNode;if(!p)return;var s=document.createElement('span');" +
        "s.className='" +
        esc(cls || "vc-wt-avatar") +
        " vc-wt-avatar--fallback';s.setAttribute('aria-hidden','true');s.textContent='" +
        safeLetter +
        "';p.replaceChild(s,this);";
      return (
        '<img class="' +
        esc(cls || "vc-wt-avatar") +
        ' vc-avatar vc-avatar--ready" src="' +
        esc(src) +
        '" alt="" width="36" height="36" loading="eager" decoding="async" fetchpriority="high" data-vc-avatar="1" data-vc-avatar-static="1"' +
        uidAttr +
        ' onerror="' +
        onErr +
        '" />'
      );
    }
    return '<span class="' + esc(cls || "vc-wt-avatar") + ' vc-wt-avatar--fallback" aria-hidden="true">' + esc(letter) + "</span>";
  }

  var VINILI_BOT_AVATAR_URL =
    "https://cdn.discordapp.com/avatars/1329118940110127204/a_2f3825915a41d0f9bcbf9f2675e6d6f0.png?size=128";
  var VINILI_BOT_USER_ID = "1329118940110127204";

  function resolveMessageAvatarUrl(m) {
    var url = stillDiscordMediaUrl(String((m && m.authorAvatarUrl) || "").trim(), 64);
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
    var url = stillDiscordMediaUrl(String(avatarUrl || "").trim(), 64);
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

  function pageScrollLockedByChrome() {
    /* ticketLoadYoYo1: mid-load chrome pinna a 0 — non restaurare Y (yoyo 0↔Y) */
    try {
      var root = document.documentElement;
      if (!root) return false;
      if (root.classList.contains("vc-loading-scroll-lock")) return true;
      if (root.classList.contains("vc-chrome-bar-loading")) return true;
      if (root.classList.contains("vc-scroll-reload-top-lock")) return true;
      if (root.classList.contains("vc-loader-blocking-live")) return true;
      if (window.__vcTopPinActive === 1) return true;
      if (
        window.__vcScrollUnlockOnce !== 1 &&
        window.__vcChromeLoadDone !== true &&
        (root.classList.contains("vc-chrome-scroll-armed") ||
          root.classList.contains("vc-interaction-hold"))
      ) {
        return true;
      }
    } catch (eLock) {}
    return false;
  }

  function restorePageScroll(y) {
    /* ticketDialogScrollFight1: mai scrollare mentre dialog/sheet tiene il pin (salta su/giù col modal) */
    try {
      var root = document.documentElement;
      if (root && root.classList.contains("vc-dialog-open")) return;
      if (root && root.classList.contains("vc-dash-confirm-open")) return;
      if (typeof window.__vcIsPageScrollFrozen === "function" && window.__vcIsPageScrollFrozen()) return;
      if (document.querySelector(".vc-dialog.is-open, #vc-site-dialog.is-open:not([hidden])")) return;
      if (pageScrollLockedByChrome()) return;
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
    var locked = pageScrollLockedByChrome();
    var out;
    try {
      out = typeof fn === "function" ? fn() : undefined;
    } finally {
      /* ticketsLagHard1 / ticketLoadYoYo1: no restore mid chrome-lock */
      if (locked || pageScrollLockedByChrome()) {
        try {
          var listKeep = byId("vc-wt-list");
          if (listKeep && Math.abs((Number(listKeep.scrollTop) || 0) - listY) > 1) {
            listKeep.scrollTop = listY;
          }
        } catch (eListL) {}
        return out;
      }
      /* ticketsLagHard1: un solo restore sync; rAF solo se Y è scesa (meno scroll fight/jank) */
      var yNow = pageScrollY();
      if (Math.abs(yNow - y) > 1) restorePageScroll(y);
      try {
        var listNow = byId("vc-wt-list");
        if (listNow && Math.abs((Number(listNow.scrollTop) || 0) - listY) > 1) {
          listNow.scrollTop = listY;
        }
      } catch (eList) {}
      try {
        if (Math.abs(pageScrollY() - y) > 1) {
          requestAnimationFrame(function () {
            if (Math.abs(pageScrollY() - y) > 1) restorePageScroll(y);
            var list2 = byId("vc-wt-list");
            if (list2 && Math.abs((Number(list2.scrollTop) || 0) - listY) > 1) {
              list2.scrollTop = listY;
            }
          });
        }
      } catch (eRaf) {
        if (Math.abs(pageScrollY() - y) > 1) restorePageScroll(y);
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

  /* ticketViewPersist1: salva ?view=staff|user + hash ticket al reload */
  function writeTicketsViewUrl(viewMode) {
    try {
      var u = new URL(location.href);
      var mode = viewMode === "staff" ? "staff" : "user";
      if (mode === "staff") u.searchParams.set("view", "staff");
      else u.searchParams.delete("view");
      var next = u.pathname + u.search + u.hash;
      if (next !== location.pathname + location.search + location.hash) {
        history.replaceState(null, "", next);
      }
    } catch (eUrl) {}
  }

  function readTicketsViewFromUrl() {
    try {
      return new URLSearchParams(location.search || "").get("view") === "staff" ? "staff" : "user";
    } catch (e) {
      return "user";
    }
  }

    function redirectAwayFromStaffView() {
    /* ticketViewSwitch3: non lasciare lista staff sotto chrome Personali */
    try {
      if (!hasStaffViewQuery() && state.viewMode !== "staff") return;
      state.viewMode = "user";
      state.viewPinnedByUser = "user";
      syncStaffMode();
      invalidateTicketsListInflight();
      state.tickets = [];
      /* ticketListEmptyPager1: no pager fantasma con lista vuota */
      state.listTotal = 0;
      state.listTotalPages = 1;
      state.listPage = 1;
      state.detail = null;
      state.messages = [];
      clearTicketSelection();
      clearTicketsBusyState();
      var hash = "";
      try {
        hash = String(location.hash || "").trim();
      } catch (eHash) {}
      var path = String(location.pathname || "/tickets/").replace(/\/?$/, "/") || "/tickets/";
      if (path.indexOf("/tickets") < 0) path = "/tickets/";
      history.replaceState(null, "", path + hash);
      writeTicketsViewUrl("user");
      syncTicketsChrome();
      showTicketsLoadingShell("Caricamento ticket…", { force: true, watchdogMs: 12000 });
      void loadList({ forceShell: true }).then(function () {
        clearTicketsBusyState();
        syncTicketsChrome();
      });
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
    /* ticketListEmptyPager1: aspetta il primo payload lista (evita bounce prematuro al refresh) */
    if (!state.staffAccessResolved) return false;
    if (!wantsStaffInbox() && !hasStaffViewQuery()) return false;
    if (hasStaffInboxAccess()) return false;
    /* ticketNotifStaffOpen1 + ticketPhoneFirst1: ruoli Discord lenti su telefono → più retry */
    var hasDeeplink = false;
    try {
      hasDeeplink = Boolean(resolveHashTicketId()) || hasStaffViewQuery();
    } catch (eDl) {
      hasDeeplink = hasStaffViewQuery();
    }
    var maxDeny = isCoarseMobile() ? 3 : 1;
    var denyN = Number(state._staffDenyRetries) || 0;
    if (denyN < maxDeny && (hasDeeplink || wantsStaffInbox())) {
      state._staffDenyRetries = denyN + 1;
      state.staffAccessResolved = false;
      window.setTimeout(function () {
        if (hasStaffInboxAccess()) return;
        void loadList({ soft: false, forceShell: true, skipOpen: false });
      }, isCoarseMobile() ? 900 + denyN * 350 : 500);
      return false;
    }
    redirectAwayFromStaffView();
    return true;
  }

  function ensureTicketsPageVisible() {
    /* ticket429Flash1: NON forzare soft-fx/curtain — rivelava layout flat pre-gradient.
       Solo hold/lock; cine-boot alza il sipario quando i gradienti sono pronti. */
    try {
      var root = document.documentElement;
      root.classList.remove("vc-interaction-hold", "vc-loading-scroll-lock", "vc-session-verify-pending");
      document.body.classList.remove("vc-loading-scroll-lock", "vc-wt-gate-open");
      if (root.classList.contains("vc-soft-fx-ready") || root.classList.contains("vc-soft-fx-off")) {
        root.classList.add("vc-page-cine-ready");
      }
    } catch (eVis) {}
  }

  function ticketsRateLimitedNow() {
    return Date.now() < (Number(state._tickets429Until) || 0);
  }

  function markTicketsRateLimited(retryAfterMs) {
    var wait = Math.max(4000, Math.min(20000, Number(retryAfterMs) || (isCoarseMobile() ? 9000 : 6000)));
    var until = Date.now() + wait;
    if (until > (Number(state._tickets429Until) || 0)) state._tickets429Until = until;
  }

  function probeStaffAccessAfterPersonalList() {
    /* ticketPhoneFirst1 + ticket429Flash1: 1 probe soft, stop su 429 (no storm) */
    if (!getToken() || wantsStaffInbox() || hasStaffInboxAccess()) return;
    if (state._staffProbeBusy || ticketsRateLimitedNow()) return;
    state._staffProbeBusy = true;
    function finish() {
      state._staffProbeBusy = false;
    }
    window.setTimeout(function () {
      if (!getToken() || wantsStaffInbox() || hasStaffInboxAccess() || ticketsRateLimitedNow()) {
        finish();
        return;
      }
      var url = apiBase() + "?scope=staff&status=all&page=1&limit=5";
      fetchJson(url, {
        method: "GET",
        headers: authHeaders(),
        cache: "no-store",
        timeoutMs: isCoarseMobile() ? 12000 : 8000,
      })
        .then(function (out) {
          if (!getToken() || wantsStaffInbox() || hasStaffInboxAccess()) {
            finish();
            return;
          }
          if (out && out.res && out.res.status === 429) {
            markTicketsRateLimited(out.data && out.data.retryAfterMs);
            finish();
            return;
          }
          if (!out || !out.res || !out.res.ok || !out.data || !out.data.ok) {
            finish();
            return;
          }
          if (out.data.viewerId) state.viewerId = out.data.viewerId || state.viewerId;
          var got =
            Boolean(out.data.staffAccess || out.data.isStaff) ||
            (Array.isArray(out.data.staffCategories) && out.data.staffCategories.length > 0);
          if (got) {
            state.staffAccess = true;
            if (Array.isArray(out.data.staffCategories) && out.data.staffCategories.length) {
              state.staffCategories = out.data.staffCategories;
            } else if (!state.staffCategories.length) {
              state.staffCategories = ["supporto"];
            }
            state.staffAccessResolved = true;
            syncStaffMode();
            try {
              syncTicketsChrome();
              wireViewModeSwitcher();
            } catch (eChrome) {}
            schedulePrefetchOppositeScope();
          }
          finish();
        })
        .catch(function () {
          finish();
        });
    }, isCoarseMobile() ? 1200 : 600);
  }

  function scheduleMobileEmptyListRetry() {
    /* ticketPhoneFirst1 + ticket429Flash1: 1 reload solo se non siamo in 429 */
    if (!isCoarseMobile() || !getToken() || wantsStaffInbox()) return;
    if (state.tickets && state.tickets.length) return;
    if (state._mobileEmptyRetry || ticketsRateLimitedNow()) return;
    state._mobileEmptyRetry = true;
    window.setTimeout(function () {
      if (!getToken() || wantsStaffInbox() || ticketsRateLimitedNow()) return;
      if (Array.isArray(state.tickets) && state.tickets.length) return;
      /* ticketSkelNoYoYo1: empty phone retry senza remount skel */
      void loadList({ soft: true, forceShell: false, skipOpen: true });
    }, 2200);
  }

  function syncStaffMode() {
    isStaffMode = state.viewMode === "staff" && hasStaffInboxAccess();
  }

  function wantsStaffInbox() {
    return state.viewMode === "staff";
  }

  function listQuery() {
    var q = [];
    /* ticketViewSwitch3: scope solo da viewMode (mai isStaffMode stale) */
    if (wantsStaffInbox()) {
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
    delete req.ifNoneMatch;
    if (ctrl) req.signal = ctrl.signal;
    var headers = Object.assign({}, opts.headers || {});
    if (opts.ifNoneMatch) headers["If-None-Match"] = String(opts.ifNoneMatch);
    req.headers = headers;
    return fetch(url, req)
      .then(function (res) {
        var etag = "";
        try {
          etag = String((res.headers && res.headers.get("ETag")) || "").trim();
        } catch (eEt) {
          etag = "";
        }
        if (res.status === 304) {
          return {
            res: res,
            data: null,
            etag: etag || String(opts.ifNoneMatch || ""),
            notModified: true,
          };
        }
        return res
          .json()
          .then(function (data) {
            return { res: res, data: data, etag: etag, notModified: false };
          })
          .catch(function () {
            return { res: res, data: null, etag: etag, notModified: false };
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
      D.save("web_ticket_ui", { selectedId: "", viewMode: state.viewMode === "staff" ? "staff" : "user" });
      return;
    }
    var text = String(state.composerText || "");
    if (!text.trim()) D.clear(ticketComposerDraftKey(id));
    else D.save(ticketComposerDraftKey(id), text);
    /* ticketNoAutoOpen1: non persistare selectedId (no reopen all'ingresso pagina) */
    D.save("web_ticket_ui", {
      selectedId: "",
      viewMode: state.viewMode === "staff" ? "staff" : "user",
    });
  }

  var _composerDraftTimer = 0;
  var _chatScrollOlderT = 0; /* loadSyncPack1: debounce auto load-older on scroll near top */
  var _chatPinBottomUntil = 0; /* chatOpenBottom1: blocca auto load-older durante pin open */
  var _chatPinBottomObs = null;
  var _chatPinBottomTimers = [];
  function scheduleSaveTicketComposerDraft() {
    /* ticketsChatLag2: localStorage sync a ogni key = jank; debounce */
    if (_composerDraftTimer) clearTimeout(_composerDraftTimer);
    _composerDraftTimer = setTimeout(function () {
      _composerDraftTimer = 0;
      try {
        saveTicketComposerDraft();
      } catch (eDraft) {}
    }, 420);
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
        D.save("web_ticket_ui", {
          selectedId: "",
          viewMode: state.viewMode === "staff" ? "staff" : "user",
        });
      }
    } else {
      var D2 = draftsApi();
      if (D2) {
        D2.save("web_ticket_ui", {
          selectedId: "",
          viewMode: state.viewMode === "staff" ? "staff" : "user",
        });
      }
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
    persistOpenTicketId("");
    sendTicketPresence({ force: true });
  }

  function restoreTicketUiSelection() {
    /* ticketUiPack2: al refresh riapri il ticket da #hash / ?ticketId= (non azzerare più l’hash) */
    if (state.selectedId) return;
    var fromQuery = "";
    try {
      fromQuery = String(new URLSearchParams(location.search || "").get("ticketId") || "").trim();
    } catch (eQ) {
      fromQuery = "";
    }
    if (/^[a-f0-9]{24}$/i.test(fromQuery)) {
      state.selectedId = fromQuery;
      return;
    }
    var fromHash = "";
    try {
      fromHash = resolveHashTicketId();
    } catch (eH) {
      fromHash = "";
    }
    if (fromHash) {
      state.selectedId = fromHash;
      return;
    }
    /* backup solo su reload vero (non al click menu → /tickets/) */
    var isReload = false;
    try {
      var nav =
        performance.getEntriesByType && performance.getEntriesByType("navigation")
          ? performance.getEntriesByType("navigation")[0]
          : null;
      if (nav && nav.type === "reload") isReload = true;
      else if (performance.navigation && performance.navigation.type === 1) isReload = true;
    } catch (eNav) {}
    if (!isReload) return;
    try {
      var raw = sessionStorage.getItem("vc_wt_open_ticket_v1") || "";
      if (/^[a-f0-9]{24}$/i.test(raw)) state.selectedId = raw;
    } catch (eSs) {}
  }

  function persistOpenTicketId(id) {
    id = String(id || "").trim();
    try {
      if (/^[a-f0-9]{24}$/i.test(id)) sessionStorage.setItem("vc_wt_open_ticket_v1", id);
      else sessionStorage.removeItem("vc_wt_open_ticket_v1");
    } catch (eP) {}
  }

  function ticketsListSkelHtml(count) {
    /* ticketSkelWFix1: w non definito nello scope — usa window */
    if (window.VcListSkeleton && typeof window.VcListSkeleton.rowsHtml === "function") {
      return window.VcListSkeleton.rowsHtml(count || 5, "div");
    }
    var n = Math.max(1, Math.min(8, Number(count) || 5));
    var out = [];
    for (var i = 0; i < n; i += 1) {
      out.push(
        '<div class="vc-list-skel vc-list-skel--row vc-wt-skel-row" aria-hidden="true">' +
          '<span class="vc-list-skel__avatar"></span>' +
          '<span class="vc-list-skel__lines"><i></i><i></i></span></div>',
      );
    }
    return out.join("");
  }

  function ticketsDomHasSkeleton() {
    try {
      var app = byId("vc-wt-app");
      return Boolean(app && app.querySelector(".vc-wt-skel-row, .vc-wt-skel-chat, .vc-wt-list.is-loading"));
    } catch (eSk) {
      return false;
    }
  }

  function ticketsDomLooksReady() {
    /* ticketSkelNoYoYo1: chrome già paintato (item/empty) senza skeleton.
       Non usare solo listEverPainted: su switch scope serve poter rimontare se DOM è skel. */
    try {
      var app = byId("vc-wt-app");
      if (!app || app.hidden) return false;
      if (ticketsDomHasSkeleton()) return false;
      return Boolean(
        app.querySelector(
          ".vc-wt-item[data-ticket-id], .vc-wt-empty, .vc-wt-chat:not(.vc-wt-skel-chat)",
        ),
      );
    } catch (eReady) {
      return false;
    }
  }

  function markTicketsListPainted() {
    try {
      state.listEverPainted = true;
    } catch (eMk) {}
  }

  function paintTicketsListResult(softPrefer) {
    /* Preferisci refresh pane se lo shell c’è già — evita flash full remount */
    try {
      var list = byId("vc-wt-list");
      var app = byId("vc-wt-app");
      var canSoft =
        softPrefer &&
        list &&
        app &&
        !ticketsDomHasSkeleton() &&
        app.querySelector(".vc-wt-layout");
      if (canSoft) {
        refreshListPane();
        markTicketsListPainted();
        try {
          syncTicketsChrome();
        } catch (eChrome) {}
        return;
      }
    } catch (eSoft) {}
    renderShell();
    markTicketsListPainted();
  }

  function clearTicketsBusyState() {
    clearTicketsBusyWatchdog();
    try {
      var app = byId("vc-wt-app");
      if (app) {
        app.removeAttribute("aria-busy");
        app.classList.remove("is-loading", "is-refreshing");
      }
      var list = byId("vc-wt-list");
      if (list) {
        list.classList.remove("is-loading", "is-refreshing");
        list.removeAttribute("aria-busy");
        list.removeAttribute("data-inbox-loading");
      }
      document.querySelectorAll(".vc-wt-filter-menu--loading").forEach(function (el) {
        el.classList.remove("vc-wt-filter-menu--loading");
      });
    } catch (eClr) {}
    try {
      document.documentElement.classList.remove(
        "vc-interaction-hold",
        "vc-loading-scroll-lock",
        "vc-notif-staff-loading",
      );
      document.body.classList.remove("vc-loading-scroll-lock");
    } catch (eHold) {}
    /* ticketListStuckFix1: toast pending (rotellina) non deve restare appeso */
    try {
      if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") window.VcSiteToast.hide();
    } catch (eToast) {}
    try {
      hideStatusToast();
    } catch (eToast2) {}
  }

  function clearTicketsBusyWatchdog() {
    if (state.listBusyWatchTimer) {
      try {
        clearTimeout(state.listBusyWatchTimer);
      } catch (eClr) {}
      state.listBusyWatchTimer = null;
    }
  }

  function isTicketsListHardLoading() {
    try {
      var app = byId("vc-wt-app");
      return Boolean(app && app.getAttribute("aria-busy") === "true");
    } catch (eBusy) {
      return false;
    }
  }

  function invalidateTicketsListInflight(opts) {
    /* ticketViewSwitch2: invalida hard+quiet in volo (anti flash lista sbagliata / spinner stuck) */
    opts = opts || {};
    state.listLoadGen = (Number(state.listLoadGen) || 0) + 1;
    state.listQuietGen = (Number(state.listQuietGen) || 0) + 1;
    state.listHardPromise = null;
    state.listHardKey = "";
    state.listHardStartedAt = 0;
    if (state.listQuietTimer) {
      try {
        clearTimeout(state.listQuietTimer);
      } catch (eQt) {}
      state.listQuietTimer = null;
    }
    /* ticketSwitchFast1: keepEtags su switch scope — 304/quiet più veloci */
    if (!opts.keepEtags) {
      try {
        state.listEtags = {};
      } catch (eEt) {}
    }
  }

  function scopeCacheBucket(mode) {
    return mode === "staff" ? "staff" : "user";
  }

  function snapshotScopeCache(mode) {
    try {
      if (!state.scopeCache) state.scopeCache = { user: null, staff: null };
      var key = scopeCacheBucket(mode != null ? mode : state.viewMode);
      state.scopeCache[key] = {
        at: Date.now(),
        tickets: Array.isArray(state.tickets) ? state.tickets.slice() : [],
        listPage: Number(state.listPage) || 1,
        listTotal: Number(state.listTotal) || 0,
        listTotalPages: Number(state.listTotalPages) || 1,
        listPageSize: Number(state.listPageSize) || 20,
        filter: state.filter || "all",
        categoryFilter: state.categoryFilter || "",
      };
    } catch (eSnap) {}
  }

  function restoreScopeCache(mode) {
    try {
      if (!state.scopeCache) return false;
      var key = scopeCacheBucket(mode);
      var snap = state.scopeCache[key];
      if (!snap || !Array.isArray(snap.tickets)) return false;
      var age = Date.now() - Number(snap.at || 0);
      if (!Number.isFinite(age) || age < 0 || age > 90000) return false;
      state.tickets = snap.tickets.slice();
      state.listPage = Number(snap.listPage) || 1;
      state.listTotal = Number(snap.listTotal) || state.tickets.length;
      state.listTotalPages = Number(snap.listTotalPages) || 1;
      state.listPageSize = Number(snap.listPageSize) || 20;
      return true;
    } catch (eRest) {
      return false;
    }
  }

  function schedulePrefetchOppositeScope() {
    if (!hasStaffInboxAccess() || !getToken()) return;
    if (state.scopePrefetchTimer) {
      try {
        clearTimeout(state.scopePrefetchTimer);
      } catch (eClr) {}
      state.scopePrefetchTimer = null;
    }
    state.scopePrefetchTimer = window.setTimeout(function () {
      state.scopePrefetchTimer = null;
      void prefetchOppositeScopeList();
    }, 450);
  }

  function prefetchOppositeScopeList() {
    /* ticketSwitchFast1: precarica l'altra vista in background */
    if (!getToken() || !hasStaffInboxAccess()) return Promise.resolve();
    if (isTicketsListHardLoading() || state.listHardPromise) return Promise.resolve();
    var opposite = state.viewMode === "staff" ? "user" : "staff";
    try {
      var existing = state.scopeCache && state.scopeCache[opposite];
      if (existing && Date.now() - Number(existing.at || 0) < 40000) return Promise.resolve();
    } catch (eAge) {}
    var limit = Math.max(5, Math.min(50, Number(state.listPageSize) || 20));
    var parts = opposite === "staff" ? ["scope=staff", "status=all"] : ["status=all"];
    parts.push("page=1");
    parts.push("limit=" + encodeURIComponent(String(limit)));
    var url = apiBase() + "?" + parts.join("&");
    var viewWhenStarted = state.viewMode === "staff" ? "staff" : "user";
    return fetchJson(url, {
      method: "GET",
      headers: authHeaders(),
      cache: "default",
      timeoutMs: 14000,
    })
      .then(function (out) {
        if (!out || !out.res || !out.res.ok || !out.data || !out.data.ok) return;
        /* se l'utente è già passato sull'altra vista, non sovrascrivere la cache fresca da loadList */
        if ((state.viewMode === "staff" ? "staff" : "user") !== viewWhenStarted) return;
        var incoming = Array.isArray(out.data.tickets) ? out.data.tickets.slice() : [];
        if (opposite === "user") {
          var vidPref = String(state.viewerId || "").trim();
          if (vidPref) {
            incoming = incoming.filter(function (t) {
              return viewerIsOnTicket(t);
            });
          }
        }
        if (!state.scopeCache) state.scopeCache = { user: null, staff: null };
        state.scopeCache[opposite] = {
          at: Date.now(),
          tickets: sortTicketsInPlace(incoming),
          listPage: Math.max(1, Number(out.data.page) || 1),
          listTotal: Math.max(0, Number(out.data.total) || incoming.length),
          listTotalPages: Math.max(1, Number(out.data.totalPages) || 1),
          listPageSize: Math.max(5, Math.min(50, Number(out.data.pageSize) || limit)),
          filter: "all",
          categoryFilter: "",
        };
        if (out.etag && state.listEtags) {
          try {
            var q = "?" + parts.join("&");
            state.listEtags[q] = out.etag;
          } catch (eEt) {}
        }
      })
      .catch(function () {});
  }

  function armTicketsBusyWatchdog(timeoutMs) {
    /* ticketSkelStuck1 + ticketStaffSwitch1 + ticketSkelOrphan2: sblocca UI se lo skeleton resta appeso */
    /* ticketsSlowToastFix1: watchdog >= fetch timeout — prima a 10s abortiva GET ancora vivi → toast falso */
    clearTicketsBusyWatchdog();
    var ms = Math.max(20000, Math.min(32000, Number(timeoutMs) || 24000));
    state.listBusyWatchTimer = window.setTimeout(function () {
      state.listBusyWatchTimer = null;
      var app = byId("vc-wt-app");
      if (!app) return;
      var stillBusy =
        app.getAttribute("aria-busy") === "true" ||
        Boolean(app.querySelector(".vc-wt-skel-row, .vc-wt-skel-chat, .vc-wt-list.is-loading, .vc-wt-filter-menu--loading"));
      if (!stillBusy) return;
      var started = Number(state.listHardStartedAt) || 0;
      var age = started ? Date.now() - started : 0;
      var inflight = Boolean(state.listHardPromise) && age > 0 && age < 28000;
      if (inflight) {
        /* GET ancora in corso: non invalidare listLoadGen / no toast errore */
        armTicketsBusyWatchdog(10000);
        return;
      }
      state.listLoadGen = (Number(state.listLoadGen) || 0) + 1;
      state.listHardPromise = null;
      state.listHardKey = "";
      state.listHardStartedAt = 0;
      state.tickets = Array.isArray(state.tickets) ? state.tickets : [];
      clearTicketsBusyState();
      var hasList = Array.isArray(state.tickets) && state.tickets.length > 0;
      /* ticketsSlowToastFix1: retry soft (no banner rosso) se lista già vuota al primo hang reale */
      if (!hasList) setStatus("Caricamento ticket in corso…", false);
      try {
        renderShell();
      } catch (ePaint) {}
      window.setTimeout(function () {
        if (!getToken()) return;
        void loadList({
          soft: hasList,
          forceShell: !hasList,
          skipOpen: !state.selectedId,
        });
      }, 400);
    }, ms);
  }

  function showTicketsLoadingShell(message, opts) {
    opts = opts || {};
    var app = byId("vc-wt-app");
    if (!app) return;
    app.hidden = false;
    /* ticketSkelNoYoYo1: UI già pronta → mai wipe a skeleton (auth/retry/empty) */
    if (ticketsDomLooksReady() && (Array.isArray(state.tickets) || state.listEverPainted)) {
      try {
        var listKeep = byId("vc-wt-list");
        if (listKeep) {
          listKeep.classList.add("is-refreshing");
          listKeep.removeAttribute("data-inbox-loading");
        }
      } catch (eKeepSk) {}
      armTicketsBusyWatchdog(opts.watchdogMs);
      syncTicketsChrome();
      wireViewModeSwitcher();
      wireFilterDelegation();
      return;
    }
    /* ticketViewPersist1 + ticketSkelNoYoYo1: skel già su → riusa (anche senza aria-busy) */
    if (!opts.force && app.querySelector(".vc-wt-skel-row, .vc-wt-skel-chat")) {
      app.setAttribute("aria-busy", "true");
      armTicketsBusyWatchdog(opts.watchdogMs);
      syncTicketsChrome();
      wireViewModeSwitcher();
      wireFilterDelegation();
      return;
    }
    /* force chiesto ma contenuto vivo → soft refresh, no remount */
    if (opts.force && ticketsDomLooksReady()) {
      try {
        var listSoft = byId("vc-wt-list");
        if (listSoft) listSoft.classList.add("is-refreshing");
      } catch (eSoftF) {}
      armTicketsBusyWatchdog(opts.watchdogMs);
      syncTicketsChrome();
      wireViewModeSwitcher();
      wireFilterDelegation();
      return;
    }
    app.setAttribute("aria-busy", "true");
    /* ticketListChrome1: niente titolo Staff/Personali in sidebar */
    app.innerHTML =
      '<div class="vc-wt-chrome vc-wt-chrome--skel">' +
      scopeSwitcherHtml() +
      filtersHtml() +
      '<div class="vc-wt-layout"><aside id="vc-wt-sidebar" class="vc-wt-sidebar">' +
      '<div id="vc-wt-list" class="vc-wt-list is-loading" aria-busy="true" aria-label="' +
      esc(message || "Caricamento ticket…") +
      '">' +
      ticketsListSkelHtml(5) +
      "</div></aside>" +
      '<section class="vc-wt-main"><div class="vc-wt-chat vc-wt-chat--empty vc-wt-skel-chat" aria-hidden="true">' +
      '<div class="vc-wt-skel-chat__block"></div>' +
      '<div class="vc-wt-skel-chat__lines"><i></i><i></i><i></i></div>' +
      "</div></section></div></div>";
    try {
      var list = byId("vc-wt-list");
      if (list) {
        list.setAttribute("aria-busy", "true");
        list.classList.add("is-loading");
      }
    } catch (eW) {}
    wireViewModeSwitcher();
    wireFilterDelegation();
    /* loginRequiredModal2: CTA Nuovo ticket presente già nello skel */
    try {
      wireChatActions();
    } catch (eWireSkel) {}
    armTicketsBusyWatchdog(opts.watchdogMs || (opts.force ? 12000 : 16000));
  }

  function syncTicketsChrome() {
    var app = byId("vc-wt-app");
    if (!app) return;
    var scopeHtml = scopeSwitcherHtml();
    var dock = app.querySelector(".vc-wt-scope-dock");
    if (!scopeHtml) {
      if (dock) dock.remove();
    } else if (dock) {
      dock.outerHTML = scopeHtml;
    } else {
      var chrome = app.querySelector(".vc-wt-chrome");
      if (chrome) chrome.insertAdjacentHTML("afterbegin", scopeHtml);
    }
    var filters = filtersHtml();
    var filterMenu = app.querySelector(".vc-wt-filter-menu");
    if (filterMenu) {
      filterMenu.outerHTML = filters;
    } else {
      var chrome2 = app.querySelector(".vc-wt-chrome");
      var layout = app.querySelector(".vc-wt-layout");
      if (chrome2 && layout) layout.insertAdjacentHTML("beforebegin", filters);
      else if (chrome2) chrome2.insertAdjacentHTML("beforeend", filters);
    }
    try {
      var top = app.querySelector(".vc-wt-sidebar__top");
      if (top) top.remove();
    } catch (eH2) {}
    /* ticketStaffSwitch1: bottone attivo deve riflettere viewMode anche se lo shell non è remountato */
    try {
      app.querySelectorAll("[data-view-mode]").forEach(function (btn) {
        var on = btn.getAttribute("data-view-mode") === (state.viewMode === "staff" ? "staff" : "user");
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
    } catch (eBtn) {}
    /* ticketCatFilter1: chip stato/categoria sempre allineati a state (anche se outerHTML non remounta) */
    try {
      var curFilter = String(state.filter || "all");
      var curCat = String(state.categoryFilter || "");
      app.querySelectorAll("[data-filter]").forEach(function (btn) {
        var id = String(btn.getAttribute("data-filter") || "all");
        var on = id === curFilter;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      app.querySelectorAll("[data-cat-filter]").forEach(function (btn) {
        var id = String(btn.getAttribute("data-cat-filter") || "");
        var on = id === curCat;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    } catch (eChip) {}
    /* loginRequiredModal2: outerHTML filtri ricrea Nuovo ticket → rewire CTA */
    try {
      wireChatActions();
    } catch (eWire) {}
  }

  function syncScopeSwitcherChrome() {
    syncTicketsChrome();
  }

  function focusTicketsBoardTop() {
    /* ticketPhoneTabList1: dopo switch Personali/Staff/filtri resta sulla lista, non sul pane vuoto */
    try {
      if (!isCoarseMobile()) return;
      var el = byId("vc-wt-app") || document.querySelector(".vc-wt-chrome");
      if (!el) return;
      var y = pageScrollY();
      var rect = el.getBoundingClientRect();
      var topGap = 72;
      if (rect.top >= topGap && rect.top < (window.innerHeight || 0) * 0.55) return;
      var absTop = y + rect.top - topGap;
      restorePageScroll(Math.max(0, Math.round(absTop)));
    } catch (eFocus) {}
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

  /* ticketListDedupe2: import Discord + mirror web = stessa chat due volte.
     Match user+cat ±60s se previewCore uguale OPPURE subjectCore uguale. */
  function ticketPreviewCore(t) {
    var prev = String((t && t.lastMessagePreview) || "")
      .toLowerCase()
      .replace(/\[embed[^\]]*\]/gi, " ")
      .replace(/\b(?:titolo|title|descrizione|description|footer|fields?)\s*:/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/[*_#`•·:]+/g, " ")
      .replace(/@\S+/g, "@")
      .replace(/nessun contenuto[^\s]*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return prev.slice(0, 28);
  }

  function ticketSubjectCore(t) {
    return String((t && (t.subject || t.channelName || "")) || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 36);
  }

  function ticketEventCore(t) {
    var p = String((t && t.lastMessagePreview) || "").toLowerCase();
    if (/__chiusura__|chiusura/.test(p) && /confermato|verr\u00e0 chiuso|verra chiuso/.test(p)) {
      return "ev:close_confirm";
    }
    if (/ticket claimato|__ticket claimato__/.test(p)) return "ev:claim";
    return "";
  }

  function ticketsAreImportDup(a, b) {
    if (!a || !b) return false;
    if (String(a.userId || "") !== String(b.userId || "")) return false;
    if (String(a.category || "").toLowerCase() !== String(b.category || "").toLowerCase()) return false;
    if (Math.abs(ticketActivityMs(a) - ticketActivityMs(b)) > 60000) return false;
    var ea = ticketEventCore(a);
    var eb = ticketEventCore(b);
    if (ea && eb && ea === eb) return true;
    var pa = ticketPreviewCore(a);
    var pb = ticketPreviewCore(b);
    if (pa && pb && pa === pb) return true;
    var sa = ticketSubjectCore(a);
    var sb = ticketSubjectCore(b);
    return Boolean(sa && sb && sa === sb);
  }

  function ticketDedupeScore(t) {
    var msgs = Math.max(0, Number(t && t.messageCount) || 0);
    var prev = ticketPreviewCore(t);
    var prevScore = prev && !/nessun contenuto/i.test(prev) ? 1 : 0;
    var num = ticketNumberValue(t);
    var at = ticketActivityMs(t);
    return msgs * 1e12 + prevScore * 1e10 + num * 1e6 + at;
  }

  function dedupeTicketsList(list) {
    if (!Array.isArray(list) || list.length < 2) return Array.isArray(list) ? list : [];
    var kept = [];
    for (var i = 0; i < list.length; i += 1) {
      var t = list[i];
      if (!t) continue;
      var hit = -1;
      for (var j = 0; j < kept.length; j += 1) {
        if (!ticketsAreImportDup(kept[j], t)) continue;
        hit = j;
        break;
      }
      if (hit < 0) {
        kept.push(t);
        continue;
      }
      if (ticketDedupeScore(t) > ticketDedupeScore(kept[hit])) kept[hit] = t;
    }
    return kept;
  }

  function applyListPayload(data) {
    if (!data || !data.ok) return false;
    if (data.viewerId) state.viewerId = data.viewerId || state.viewerId;
    if (data.viewerName != null) state.viewerName = data.viewerName || "";
    if (data.viewerAvatarUrl != null) state.viewerAvatarUrl = data.viewerAvatarUrl || "";
    if (data.categories) state.categories = data.categories;
    /* ticketPhoneFirst1: upgrade staffAccess, mai downgrade da payload Personali
       (ruoli soft assenti → isStaff false cancellava tab Staff dopo il primo paint). */
    var upgradeStaff =
      Boolean(data.staffAccess || data.isStaff) ||
      (Array.isArray(data.staffCategories) && data.staffCategories.length > 0);
    if (upgradeStaff) {
      state.staffAccess = true;
      if (Array.isArray(data.staffCategories) && data.staffCategories.length) {
        state.staffCategories = data.staffCategories;
      } else if (!state.staffCategories.length) {
        state.staffCategories = ["supporto"];
      }
    } else if (wantsStaffInbox()) {
      state.staffAccess = false;
      if (Array.isArray(data.staffCategories)) state.staffCategories = data.staffCategories;
      else state.staffCategories = [];
    } else if (Array.isArray(data.staffCategories) && data.staffCategories.length) {
      state.staffCategories = data.staffCategories;
      state.staffAccess = true;
    }
    if (data.guildId) state.guildId = String(data.guildId);
    syncStaffMode();
    var incoming = Array.isArray(data.tickets) ? data.tickets.slice() : [];
    /* ticketViewSwitch3 + ticketPhoneFirst1: in Personali scarta inbox staff solo se viewerId noto.
       Senza viewerId il filter azzerava tutta la lista al primo paint. */
    if (!wantsStaffInbox()) {
      var vidReady = String(state.viewerId || "").trim();
      if (vidReady) {
        incoming = incoming.filter(function (t) {
          return viewerIsOnTicket(t);
        });
      }
    }
    var rawIncomingCount = incoming.length;
    incoming = dedupeTicketsList(incoming);
    state.tickets = sortTicketsInPlace(incoming);
    var pageSize = Math.max(5, Math.min(50, Number(data.pageSize) || Number(state.listPageSize) || 20));
    var total = Math.max(0, Number(data.total));
    if (!Number.isFinite(total)) total = state.tickets.length;
    if (
      (!wantsStaffInbox() && incoming.length < (Array.isArray(data.tickets) ? data.tickets.length : 0)) ||
      incoming.length < rawIncomingCount
    ) {
      total = state.tickets.length;
    }
    var totalPages = Math.max(1, Number(data.totalPages) || Math.ceil(total / pageSize) || 1);
    var page = Math.max(1, Number(data.page) || Number(state.listPage) || 1);
    if (page > totalPages) page = totalPages;
    /* ticketListEmptyPager1: payload inconsistente (0 ticket ma total alto) → allinea + retry */
    if (!state.tickets.length && total > 0 && page <= 1) {
      total = 0;
      totalPages = 1;
      page = 1;
      if (!state._emptyListRetry) {
        state._emptyListRetry = true;
        window.setTimeout(function () {
          state._emptyListRetry = false;
          if (!Array.isArray(state.tickets) || state.tickets.length) return;
          /* ticketSkelNoYoYo1: retry soft — no secondo skeleton */
          void loadList({ soft: true, forceShell: false, skipOpen: true });
        }, 450);
      }
    }
    state.listPageSize = pageSize;
    state.listTotal = total;
    state.listTotalPages = totalPages;
    state.listPage = page;
    state.staffAccessResolved = true;
    /* ticketNotifStaffOpen1 + ticketSkelOrphan2: ruoli lenti → ritenta SENZA clear busy
       (clearTicketsBusyState spegneva watchdog e lasciava skeleton orfano forever). */
    if (
      wantsStaffInbox() &&
      !hasStaffInboxAccess() &&
      String(data.error || "") === "staff_roles_unavailable" &&
      !state._staffRolesRetry
    ) {
      state._staffRolesRetry = true;
      state.staffAccessResolved = false;
      window.setTimeout(function () {
        state._staffRolesRetry = false;
        if (!wantsStaffInbox() || hasStaffInboxAccess()) return;
        /* ticketSkelNoYoYo1: ruoli lenti → soft retry, skel resta se già su */
        void loadList({
          soft: ticketsDomLooksReady() || ticketsDomHasSkeleton(),
          forceShell: false,
          skipOpen: false,
        });
      }, isCoarseMobile() ? 1100 : 650);
      snapshotScopeCache();
      ensureTicketsPageVisible();
      try {
        armTicketsBusyWatchdog(isCoarseMobile() ? 26000 : 22000);
      } catch (eArm) {}
      return true;
    }
    if (denyStaffViewIfUnauthorized()) {
      clearTicketsBusyState();
    }
    snapshotScopeCache();
    ensureTicketsPageVisible();
    if (!wantsStaffInbox() && !hasStaffInboxAccess()) {
      probeStaffAccessAfterPersonalList();
    }
    scheduleMobileEmptyListRetry();
    return true;
  }

  function loadList(opts) {
    opts = opts || {};
    if (!getToken()) {
      /* marquee404Fix1: senza token tieni gate login (non dismiss silenzioso) */
      showGate();
      if (!opts.silentNoToken && !state.tokenWaitTimer) {
        /* no toast spam on boot */
      }
      clearTicketsBusyState();
      return Promise.resolve(false);
    }
    /* ticketScopeClick1: anche in vista Staff togli il gate (prima restava sopra e mangiava i click) */
    hideGate();
    var haveTickets = Array.isArray(state.tickets) && state.tickets.length > 0;
    var uiReady = ticketsDomLooksReady();
    /* ticketSkelNoYoYo1: soft se lista/empty già pronti; skel dedupe in showTicketsLoadingShell */
    var soft =
      opts.soft === true && (haveTickets || uiReady || state.listEverPainted);
    var attempt = Math.max(0, Number(opts.attempt) || 0);
    var isRetry = opts._retry === true && Number(opts._loadGen) > 0;
    var forceShell = opts.forceShell === true && !uiReady;
    var viewSnap = state.viewMode === "staff" ? "staff" : "user";
    var reqKey = apiBase() + listQuery();
    /* ticketSwitchFreeze2: dedupe solo se stesso key E promise viva; forceShell sempre fresh */
    if (
      !soft &&
      !isRetry &&
      !forceShell &&
      state.listHardPromise &&
      state.listHardKey === reqKey
    ) {
      return state.listHardPromise;
    }
    var loadGen = isRetry
      ? Number(opts._loadGen)
      : (state.listLoadGen = (Number(state.listLoadGen) || 0) + 1);
    if (!soft) {
      state.listHardStartedAt = Date.now();
      var loadMsg = wantsStaffInbox() ? "Caricamento inbox staff…" : "Caricamento ticket…";
      /* ticketsSlowToastFix1: watchdog dopo il timeout fetch (mobile 22s / desk 18s) */
      var wdMs = isCoarseMobile() ? 26000 : 22000;
      /* ticketsUiFix1 + ticketSkelNoYoYo1: no remount skel su retry / UI già pronta */
      if (isRetry || haveTickets || uiReady) {
        if (!haveTickets && !uiReady) {
          showTicketsLoadingShell(loadMsg, { force: false, watchdogMs: wdMs });
        } else {
          try {
            var listBusy = byId("vc-wt-list");
            if (listBusy) {
              listBusy.classList.add("is-refreshing");
              listBusy.removeAttribute("data-inbox-loading");
            }
          } catch (eRef) {}
          armTicketsBusyWatchdog(wdMs);
        }
      } else {
        showTicketsLoadingShell(loadMsg, {
          force: forceShell && !haveTickets && !uiReady,
          watchdogMs: wdMs,
        });
      }
    }
    var p = fetchJson(reqKey, {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
      timeoutMs: isCoarseMobile() ? 22000 : 18000,
    })
      .then(function (out) {
        if (loadGen !== state.listLoadGen) return false;
        if ((state.viewMode === "staff" ? "staff" : "user") !== viewSnap) return false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          var authFail = out.res.status === 401 || out.res.status === 403;
          if (authFail) {
            if (!wantsStaffInbox()) showGate();
          }
          var errCode = String((out.data && out.data.error) || "");
          var is429 = out.res.status === 429 || errCode === "rate_limited";
          if (is429) {
            markTicketsRateLimited(out.data && out.data.retryAfterMs);
          }
          var transient =
            !authFail &&
            !is429 &&
            (out.res.status === 0 ||
              out.res.status === 408 ||
              out.res.status === 502 ||
              out.res.status === 503 ||
              out.res.status === 504 ||
              !out.data ||
              errCode === "member_unavailable" ||
              errCode === "discord_unreachable" ||
              errCode === "guild_unavailable" ||
              errCode === "staff_roles_unavailable");
          /* ticket429Flash1: su 429 backoff lungo (no storm); altri transient ritentano */
          if (is429 && attempt < 2 && !authFail) {
            return new Promise(function (resolve) {
              window.setTimeout(
                resolve,
                Math.max(4500, (Number(state._tickets429Until) || Date.now()) - Date.now()),
              );
            }).then(function () {
              if (loadGen !== state.listLoadGen) return false;
              if ((state.viewMode === "staff" ? "staff" : "user") !== viewSnap) return false;
              return loadList({
                soft: soft && Array.isArray(state.tickets) && state.tickets.length > 0,
                attempt: attempt + 1,
                _retry: true,
                _loadGen: loadGen,
                forceShell: false,
                skipOpen: opts.skipOpen,
              });
            });
          }
          /* ticketsListHang1 + ticketFilterOpenPhone1: anche soft (filtri) deve ritentare su 503/timeout telefono */
          if (attempt < (transient ? 4 : 1) && !authFail) {
            return new Promise(function (resolve) {
              window.setTimeout(resolve, isCoarseMobile() ? 700 + attempt * 400 : 350 + attempt * 250);
            }).then(function () {
              if (loadGen !== state.listLoadGen) return false;
              if ((state.viewMode === "staff" ? "staff" : "user") !== viewSnap) return false;
              return loadList({
                soft: soft && attempt < 2,
                attempt: attempt + 1,
                _retry: true,
                _loadGen: loadGen,
                /* ticketsUiFix1: retry mai forceShell (niente skel loop) */
                forceShell: false,
                skipOpen: opts.skipOpen,
              });
            });
          }
          if (!soft && attempt < 2 && authFail && getToken()) {
            return new Promise(function (resolve) {
              window.setTimeout(resolve, isCoarseMobile() ? 900 : 450);
            }).then(function () {
              if (loadGen !== state.listLoadGen) return false;
              if ((state.viewMode === "staff" ? "staff" : "user") !== viewSnap) return false;
              return loadList({
                soft: Array.isArray(state.tickets) && state.tickets.length > 0,
                attempt: attempt + 1,
                _retry: true,
                _loadGen: loadGen,
                forceShell: false,
              });
            });
          }
          clearTicketsBusyState();
          setStatus(
            is429
              ? "Troppe richieste, riprovo tra poco…"
              : (out.data && out.data.message) || "Impossibile caricare i ticket.",
            true,
          );
          /* ticket429Flash1: su 429 non azzerare lista già dipinta */
          if (!soft && !(is429 && Array.isArray(state.tickets) && state.tickets.length)) {
            state.tickets = [];
            state.listTotal = 0;
            state.listTotalPages = 1;
            state.listPage = 1;
            renderShell();
          } else if (!soft) {
            renderShell();
          }
          return false;
        }
        clearTicketsBusyState();
        applyListPayload(out.data);
        /* ticketNotifStaffOpen1: ok:true ma staff_roles_unavailable → ritenta (no toast) */
        if (
          wantsStaffInbox() &&
          !hasStaffInboxAccess() &&
          String((out.data && out.data.error) || "") === "staff_roles_unavailable" &&
          attempt < 3
        ) {
          return new Promise(function (resolve) {
            window.setTimeout(resolve, isCoarseMobile() ? 900 + attempt * 400 : 500 + attempt * 250);
          }).then(function () {
            if (loadGen !== state.listLoadGen) return false;
            if ((state.viewMode === "staff" ? "staff" : "user") !== viewSnap) return false;
            return loadList({
              soft: Array.isArray(state.tickets) && state.tickets.length > 0,
              attempt: attempt + 1,
              _retry: true,
              _loadGen: loadGen,
              forceShell: false,
              skipOpen: opts.skipOpen,
            });
          });
        }
        setStatus("");
        var app = byId("vc-wt-app");
        if (app) app.hidden = false;
        /* ticketSwitchFast1: su switch scope non riaprire ticket (costa detail GET) */
        if (!opts.skipOpen) {
          restoreTicketUiSelection();
          queueMissingAvatarsFromMessages([]);
          /* ticketNoAutoOpen1: hash solo se già scelto da ?ticketId= sopra */
          if (
            state.selectedId &&
            !state.tickets.some(function (t) {
              return t.id === state.selectedId;
            })
          ) {
            /* deeplink ticket fuori dalla pagina corrente: tieni id, openTicket gestirà */
          }
        } else {
          queueMissingAvatarsFromMessages([]);
        }
        paintTicketsListResult(soft || state.listEverPainted);
        schedulePrefetchOppositeScope();
        if (!opts.skipOpen && state.selectedId) {
          return openTicket(state.selectedId, true).then(function () {
            return true;
          });
        }
        return true;
      })
      .catch(function (err) {
        if (loadGen !== state.listLoadGen) return false;
        if ((state.viewMode === "staff" ? "staff" : "user") !== viewSnap) return false;
        var aborted = err && (err.name === "AbortError" || err.code === 20);
        if (!soft && attempt < 2) {
          return new Promise(function (resolve) {
            window.setTimeout(resolve, isCoarseMobile() ? 800 + attempt * 400 : 400 + attempt * 250);
          }).then(function () {
            if (loadGen !== state.listLoadGen) return false;
            if ((state.viewMode === "staff" ? "staff" : "user") !== viewSnap) return false;
            return loadList({
              soft: Array.isArray(state.tickets) && state.tickets.length > 0,
              attempt: attempt + 1,
              _retry: true,
              _loadGen: loadGen,
              forceShell: false,
            });
          });
        }
        clearTicketsBusyState();
        /* notifApiErr1: abort/superseded → no error toast */
        if (aborted) {
          state.tickets = state.tickets || [];
          if (!soft && !(Array.isArray(state.tickets) && state.tickets.length)) renderShell();
          return false;
        }
        /* ticketsUiFix1: se la lista è già dipinta, niente toast “Errore di rete” falso */
        if (Array.isArray(state.tickets) && state.tickets.length) {
          try {
            refreshListPane();
          } catch (eKeep) {
            try {
              renderShell();
            } catch (eKeep2) {}
          }
          return false;
        }
        setStatus("Errore di rete.", true);
        state.tickets = state.tickets || [];
        if (!soft) renderShell();
        return false;
      })
      .finally(function () {
        /* ticketSwitchFreeze2: superseduta → non toccare UI (il load nuovo la possiede) */
        if (loadGen !== state.listLoadGen) return;
        if ((state.viewMode === "staff" ? "staff" : "user") !== viewSnap) return;
        if (isTicketsListHardLoading()) clearTicketsBusyState();
        try {
          var appFin = byId("vc-wt-app");
          /* ticketSkelOrphan2: se resta skel senza busy, paint subito (no hang forever) */
          if (
            appFin &&
            appFin.querySelector(".vc-wt-skel-row, .vc-wt-skel-chat")
          ) {
            clearTicketsBusyState();
            renderShell();
            syncTicketsChrome();
          }
        } catch (eFin) {}
      });

    if (!soft && !isRetry) {
      /* ticketSwitchFreeze2: salva p (non p.finally) altrimenti promise zombie eterna */
      state.listHardKey = reqKey;
      state.listHardPromise = p;
      p.finally(function () {
        if (state.listHardPromise === p) {
          state.listHardPromise = null;
          state.listHardKey = "";
          state.listHardStartedAt = 0;
        }
      });
      return p;
    }
    return p;
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

  function paintOpenTicketPending(id) {
    id = String(id || "").trim();
    if (!id) return;
    var fromList = null;
    try {
      fromList = (state.tickets || []).find(function (t) {
        return String((t && t.id) || "") === id;
      });
    } catch (eFind) {
      fromList = null;
    }
    var base = fromList && typeof fromList === "object" ? Object.assign({}, fromList) : { id: id };
    base.id = id;
    base._openPending = true;
    if (!base.subject) base.subject = "…";
    if (!base.status) base.status = "open";
    if (!base.permissions || typeof base.permissions !== "object") base.permissions = {};
    state.detail = mergeTicketDetail(base, { trustPermissions: true });
    state.messages = [];
    state.seenMessageIds = {};
    withPageScrollPreserved(function () {
      refreshChatPane();
    });
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
      scrollChatBottom(true);
      return Promise.resolve();
    }
    if (state.selectedId && state.selectedId !== id) {
      flushComposerTextFromDom();
      saveTicketComposerDraft();
      stopTicketTypingRoom();
    }
    state.selectedId = id;
    state._msgWinStart = undefined; /* perfRoiPack2: reset window su switch ticket */
    state.composerText = loadTicketComposerDraft(id);
    state.composerImages = [];
    state.replyTo = null;
    state.rateDraftTicket = 0;
    state.rateDraftStaffer = 0;
    /* ticketsLagHard1: preload composer chunk all'apertura (type/claim senza cold load) */
    try {
      ensureWtComposerChunk().catch(function () {});
    } catch (eWarm) {}
    setHashTicket(id);
    persistOpenTicketId(id);
    saveTicketComposerDraft();
    /* ticketPhoneOpenWait1: su telefono defer mark-read (POST notif) così non arma 429
       mentre stiamo ancora aprendo il dettaglio ticket. */
    if (isCoarseMobile()) {
      window.setTimeout(function () {
        if (state.selectedId === id) markOpenTicketNotificationsRead(id);
      }, 900);
    } else {
      markOpenTicketNotificationsRead(id);
    }
    refreshListActiveState();
    restorePageScroll(yHold);
    var seq = (state.openTicketSeq = (Number(state.openTicketSeq) || 0) + 1);
    /* ticketSwitchToastRace2: niente "Apertura…" / "non disponibile" a metà retry —
       lo switch lista faceva toast 403 (ruoli lenti) e poi apriva dopo pochi secondi. */
    if (!quiet && attempt === 0) {
      try {
        hideStatusToast();
      } catch (eHideOpen) {}
    }
    /* ticketDetailFast1: paint immediato da lista (header + loading) — niente schermo morto */
    if (attempt === 0) {
      try {
        paintOpenTicketPending(id);
      } catch (ePaint) {}
    }
    /* ticketDetailFast1: cool-down max 2s (ticket senza nginx limit) */
    if (ticketsRateLimitedNow() && attempt < 10) {
      var coolWait = Math.max(
        400,
        Math.min(2000, (Number(state._tickets429Until) || Date.now()) - Date.now() + 40),
      );
      return new Promise(function (resolve) {
        window.setTimeout(resolve, coolWait);
      }).then(function () {
        if (seq !== state.openTicketSeq || state.selectedId !== id) return;
        return openTicket(id, quiet, { attempt: attempt + 1 });
      });
    }
    return fetchJson(apiBase() + "/" + encodeURIComponent(id), {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
      timeoutMs: isCoarseMobile() ? (attempt === 0 ? 14000 : 18000) : attempt === 0 ? 18000 : 22000,
    })
      .then(function (out) {
        if (seq !== state.openTicketSeq || state.selectedId !== id) return;
        if (!out.res.ok || !out.data || !out.data.ok) {
          var status = Number((out.res && out.res.status) || 0);
          var errCode = String((out.data && out.data.error) || "");
          var rolesLag =
            status === 403 ||
            errCode === "forbidden" ||
            errCode === "forbidden_category" ||
            errCode === "staff_roles_unavailable";
          var is429 = status === 429 || errCode === "rate_limited" || errCode === "rate_limited_client";
          if (is429) {
            markTicketsRateLimited(out.data && out.data.retryAfterMs);
          }
          var retryable =
            !out.data ||
            status === 0 ||
            status === 401 ||
            status === 408 ||
            is429 ||
            status >= 500 ||
            rolesLag ||
            (status === 404 && attempt < 3) ||
            errCode === "missing_token" ||
            errCode === "invalid_token" ||
            errCode === "unauthorized";
          var maxAttempts = isCoarseMobile()
            ? rolesLag || wantsStaffInbox() || is429
              ? 9
              : 7
            : rolesLag || wantsStaffInbox()
              ? 6
              : 5;
          if (retryable && attempt < maxAttempts) {
            var waitMs = is429
              ? Math.max(
                  isCoarseMobile() ? 2200 : 1800,
                  Math.min(6000, (Number(state._tickets429Until) || Date.now()) - Date.now() + 40),
                )
              : rolesLag
                ? (isCoarseMobile() ? 550 : 450) * (attempt + 1)
                : (isCoarseMobile() ? 400 : 350) * (attempt + 1);
            return new Promise(function (resolve) {
              window.setTimeout(resolve, waitMs);
            }).then(function () {
              return openTicket(id, quiet, { attempt: attempt + 1 });
            });
          }
          /* toast solo a fine retry (click lista + notifica) */
          setStatus(
            (out.data && out.data.message) ||
              (is429
                ? "Troppe richieste, riprovo tra poco…"
                : quiet
                  ? "Ticket non ancora pronto. Riprova tra un attimo."
                  : "Ticket non disponibile."),
            true,
          );
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
        } else {
          state.commandCatalog = [];
          state.slashCatalog = [];
          state.commandCatalogLoaded = false;
          state.commandCatalogTicketId = "";
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
        /* ticketsUiFix1: no toast rete se chat già caricata per questo ticket */
        if (
          state.selectedId === id &&
          Array.isArray(state.messages) &&
          state.messages.length
        ) {
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
    if (!(force || nearBottom)) return;
    function pin() {
      var el = byId("vc-wt-chat-log");
      if (!el) return;
      /* ticketLoadYoYo1: solo scrollTop del log — mai scrollIntoView (muove la pagina = yoyo) */
      var pageY = pageScrollY();
      try {
        el.scrollTop = el.scrollHeight + 64;
      } catch (eScr1) {}
      try {
        el.scrollTop = el.scrollHeight;
      } catch (eScr3) {}
      if (!pageScrollLockedByChrome() && Math.abs(pageScrollY() - pageY) > 1) {
        restorePageScroll(pageY);
      }
    }
    /* chatOpenBottom1: pin duro + ResizeObserver (layout/img dopo paint) */
    pin();
    requestAnimationFrame(function () {
      pin();
      requestAnimationFrame(pin);
    });
    if (force) {
      _chatPinBottomUntil = Date.now() + 1800;
      if (_chatScrollOlderT) {
        try {
          window.clearTimeout(_chatScrollOlderT);
        } catch (eClr) {}
        _chatScrollOlderT = 0;
      }
      _chatPinBottomTimers.forEach(function (t) {
        try {
          window.clearTimeout(t);
        } catch (eT) {}
      });
      _chatPinBottomTimers = [];
      [0, 16, 50, 120, 220, 400, 700, 1100, 1600].forEach(function (ms) {
        _chatPinBottomTimers.push(window.setTimeout(pin, ms));
      });
      try {
        if (_chatPinBottomObs) {
          _chatPinBottomObs.disconnect();
          _chatPinBottomObs = null;
        }
      } catch (eObs0) {}
      try {
        if (typeof ResizeObserver === "function") {
          var roLeft = 12;
          _chatPinBottomObs = new ResizeObserver(function () {
            pin();
            roLeft -= 1;
            if (roLeft <= 0 || Date.now() > _chatPinBottomUntil) {
              try {
                _chatPinBottomObs.disconnect();
              } catch (eObs1) {}
              _chatPinBottomObs = null;
            }
          });
          _chatPinBottomObs.observe(log);
          window.setTimeout(function () {
            try {
              if (_chatPinBottomObs) _chatPinBottomObs.disconnect();
            } catch (eObs2) {}
            _chatPinBottomObs = null;
          }, 1900);
        }
      } catch (eObs) {}
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
    if (ticket) {
      var prevCat = state.detail ? String(state.detail.category || "") : "";
      var prevClaim = state.detail ? String(state.detail.claimedBy || "") : "";
      var prevLabel = state.detail ? String(state.detail.categoryLabel || "") : "";
      state.detail = mergeTicketDetail(ticket, { trustPermissions: true });
      var nextCat = String((state.detail && state.detail.category) || "");
      var nextClaim = String((state.detail && state.detail.claimedBy) || "");
      var nextLabel = String((state.detail && state.detail.categoryLabel) || "");
      /* ticketHeadUi1: system msg / WS con ticket → aggiorna header (cat/claim) */
      if (prevCat !== nextCat || prevClaim !== nextClaim || prevLabel !== nextLabel) {
        try {
          state._chatChromeSig = "";
          refreshChatChrome();
        } catch (eChromeMsg) {}
      }
    }
    var log = byId("vc-wt-chat-log");
    if (log) {
      log.insertAdjacentHTML("beforeend", messageHtml(msg));
      var node = log.querySelector('[data-msg-id="' + msg.id + '"]');
      if (node) {
        wireMessageReactions(node);
        wireMessageTools(node);
        freezeTicketsAnimatedMedia(node);
      }
      scrollChatBottom(false);
    } else {
      renderShell();
    }
    if (ticket) refreshTicketInList(ticket);
    if (msg && msg.content) hydrateContentRefs([msg]);
    if (msg && !msg.pending && !isOwnMessage(msg) && effectiveAuthorKind(msg) !== "system") {
      markSelectedTicketRead([msg.id]);
    }
  }

  function mergeTicketDetail(ticket, opts) {
    opts = opts || {};
    if (!ticket) return ticket;
    var prev = state.detail || {};
    if (prev.id && ticket.id && String(prev.id) !== String(ticket.id)) return ticket;

    /* ticketHeadUi1: ticket WS/API spesso parziale — non perdere category/claim/subject */
    var base =
      prev.id && ticket.id && String(prev.id) === String(ticket.id)
        ? Object.assign({}, prev, ticket)
        : Object.assign({}, ticket);

    var perms = null;
    if (opts.trustPermissions && ticket.permissions) {
      perms = Object.assign({}, ticket.permissions);
    } else if (base.permissions) {
      perms = Object.assign({}, base.permissions);
    } else if (prev.permissions) {
      perms = Object.assign({}, prev.permissions);
    }

    if (perms) {
      var closed = String(base.status || "") === "closed";
      var claimer = String(base.claimedBy || "").trim();
      var viewer = String(state.viewerId || "");
      var isOwner = String(base.userId || "") === viewer;
      var alreadyRated = Boolean(base.ratingAt) || base.ratingStafferScore != null;
      var rateableId =
        String(base.rateableStafferId || base.ratedStafferId || base.claimedBy || "").trim() ||
        "";
      var closeRequested = Boolean(base.closeRequestedAt);
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
        perms.canUseCommands = Boolean(perms.canReply && String(base.category || "") === "partnership");
        perms.isStaffViewer = true;
        perms.isHighStaff = Boolean(isHighStaff);
        perms.canBypassClaimWrite = Boolean(bypassWrite);
      } else {
        perms.canClaim = false;
        perms.canUnclaim = false;
        perms.canReply = Boolean(!closed && (perms.isAddedViewer || perms.canReply));
      }
    }

    return Object.assign({}, base, perms ? { permissions: perms } : {});
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

  /* ticketsRailComposer1: helper spostati dal chunk (lazy) — evitano ReferenceError */
  function isRichInput(el) {
    return Boolean(el && el.isContentEditable);
  }
  function activeInputLine(before) {
    var lines = String(before || "").split("\n");
    return lines[lines.length - 1] || "";
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
    } catch (eTbc) {
      return serializeRichInput(el);
    }
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
    /* ticketMentionTrigger1: non matchare @/# dentro markup già inserito (<@id>, <#id>, emoji) */
    var stripped = String(raw || "")
      .replace(/<(a?):([a-zA-Z0-9_]{1,32}):(\d{5,32})>/g, "\uFFFC")
      .replace(/<@!?\d{5,32}>/g, "\uFFFC")
      .replace(/<@&\d{5,32}>/g, "\uFFFC")
      .replace(/<#\d{5,32}>/g, "\uFFFC");
    var line = activeInputLine(stripped);
    /* Channel solo con # singolo (non ## heading / markdown). */
    var channel = line.match(/(^|[^\uFFFC#])#([^\s#\uFFFC]*)$/);
    if (channel) {
      return { kind: "channel", q: channel[2] || "", line: line };
    }
    var mention = line.match(/(^|[^\uFFFC])@([^\s@\uFFFC]*)$/);
    if (mention) {
      return { kind: "mention", q: mention[2] || "", line: line };
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
    function runSuggest() {
      try {
        var api = wtComposerApiSafe();
        if (api && typeof api.onRichInputMaybeMention === "function") {
          api.onRichInputMaybeMention(el);
          return;
        }
      } catch (eSug) {}
    }
    if (state.composerSuggestTimer) {
      clearTimeout(state.composerSuggestTimer);
      state.composerSuggestTimer = null;
    }
    if (immediate) {
      runSuggest();
      return;
    }
    state.composerSuggestTimer = setTimeout(function () {
      state.composerSuggestTimer = null;
      runSuggest();
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

    if (wantsStaffInbox()) {
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
        var previewTxt = ticketListPreviewText(t);
        var aria =
          "#" +
          String(t.ticketNumber || "") +
          " " +
          statusLabel(t) +
          ". " +
          ticketDisplayName(t) +
          ". " +
          previewTxt +
          ". " +
          formatTime(t.lastMessageAt || t.createdAt);
        return (
          '<button type="button" class="vc-wt-item' +
          active +
          " " +
          statusClass(t) +
          '" data-ticket-id="' +
          esc(t.id) +
          '" aria-label="' +
          esc(aria) +
          '">' +
          ticketListIconHtml() +
          '<span class="vc-wt-item__body" aria-hidden="true">' +
          '<span class="vc-wt-item__top"><span class="vc-wt-item__num">#' +
          esc(t.ticketNumber) +
          '</span><span class="vc-wt-item__badge">' +
          esc(statusLabel(t)) +
          "</span></span>" +
          '<span class="vc-wt-item__subject">' +
          esc(ticketDisplayName(t)) +
          "</span>" +
          '<span class="vc-wt-item__preview">' +
          formatMessageContent(previewTxt, {
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
    /* ticketListEmptyPager1: lista vuota → niente pager (anche se totalPages stale) */
    if (!Array.isArray(state.tickets) || !state.tickets.length) return "";
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
      return mp.html(page, totalPages, { aria: "Paginazione ticket", windowSize: 3 }).replace(
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
    /* ticketNotifStaffTab2: tab Staff anche su deeplink/push prima che staffAccess arrivi
       (prima: hasStaffInboxAccess false → niente tab + skeleton “cieco”). */
    if (!hasStaffInboxAccess() && !wantsStaffInbox() && !hasStaffViewQuery()) return "";
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
    /* ticketViewPersist1: filtri da vista scelta (non solo isStaffMode post-API) */
    var staffUi = wantsStaffInbox();
    var filters = staffUi
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
    if (staffUi && state.staffCategories.length) {
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
    if (!wantsStaffInbox()) {
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
    /* ticketStaffOpenTag1: anche opener/customer staff → tag da staffRoles (non solo claimer) */
    if (!name) {
      name = resolveStaffRoleName(m && m.authorId);
      if (!key) key = resolveStaffRoleKey(m && m.authorId);
    }
    if (kind === "user" || isTicketCustomerMessage(m)) {
      if (!name || /^staff$/i.test(name)) return "";
      var cCls = "vc-wt-msg__role";
      if (key) cCls += " vc-wt-msg__role--" + key;
      else if (/^member$/i.test(name)) cCls += " vc-wt-msg__role--member";
      else if (hasStaffRoleSignals(m) || resolveStaffRoleName(m && m.authorId)) {
        cCls += " vc-wt-msg__role--staff";
      }
      return '<span class="' + cCls + '" title="Ruolo">' + esc(name) + "</span>";
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
        '" alt="" width="320" height="180" loading="lazy" decoding="async" /></a>'
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
        '" alt="" width="320" height="180" loading="lazy" decoding="async" /></a>'
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
    /* ticketPreviewBleed1: mai footer/copyright sito nella preview lista */
    raw = raw.replace(/\u00a9?\s*20\d{2}\s*Vinili\s*&\s*Caff[eè][^\n]*/gi, " ");
    raw = raw.replace(/Tutti i diritti riservati\.?/gi, " ");
    raw = raw.replace(/All rights reserved\.?/gi, " ");
    raw = raw.replace(/\s+/g, " ").trim();
    if (!raw || isUselessMessageContent(raw)) {
      return String((t && (t.categoryLabel || t.subject)) || "Ticket").trim();
    }
    return raw.length > 120 ? raw.slice(0, 119) + "…" : raw;
  }

    
  /* optPass4: emoji maps lazy via __VC_WT_EMOJI */
  var UNICODE_EMOJI_SHORTCODES = (window.__VC_WT_EMOJI && window.__VC_WT_EMOJI.UNICODE_EMOJI_SHORTCODES) || null;
  var KNOWN_EMOJI_FALLBACKS = (window.__VC_WT_EMOJI && window.__VC_WT_EMOJI.KNOWN_EMOJI_FALLBACKS) || null;
  function ensureTicketsEmojiMaps() {
    if (UNICODE_EMOJI_SHORTCODES && KNOWN_EMOJI_FALLBACKS) return Promise.resolve();
    if (window.__VC_WT_EMOJI) {
      UNICODE_EMOJI_SHORTCODES = window.__VC_WT_EMOJI.UNICODE_EMOJI_SHORTCODES;
      KNOWN_EMOJI_FALLBACKS = window.__VC_WT_EMOJI.KNOWN_EMOJI_FALLBACKS;
      return Promise.resolve();
    }
    if (window.__VC_WT_EMOJI_LOADING) return window.__VC_WT_EMOJI_LOADING;
    window.__VC_WT_EMOJI_LOADING = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "/js/web-tickets-page-chat.20261009optPass4.js?v=20261009optPass4";
      s.onload = function () {
        try {
          UNICODE_EMOJI_SHORTCODES = window.__VC_WT_EMOJI.UNICODE_EMOJI_SHORTCODES;
          KNOWN_EMOJI_FALLBACKS = window.__VC_WT_EMOJI.KNOWN_EMOJI_FALLBACKS;
        } catch (e0) {}
        resolve();
      };
      s.onerror = function () { window.__VC_WT_EMOJI_LOADING = null; reject(new Error("wt_emoji")); };
      (document.head || document.documentElement).appendChild(s);
    });
    return window.__VC_WT_EMOJI_LOADING;
  }


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
      '" width="' +
      sz +
      '" height="' +
      sz +
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

  function decodeDiscordEntities(raw) {
    return String(raw == null ? "" : raw)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function normalizeDiscordMarkup(raw) {
    return decodeDiscordEntities(raw)
      .replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060]/g, "")
      .replace(/[\uFF1C\uFE64]/g, "<")
      .replace(/[\uFF1E\uFE65]/g, ">")
      .replace(/[\uFF1A]/g, ":");
  }

  var DISCORD_CUSTOM_TOKEN_RE =
    /<(a?):([a-zA-Z0-9_]{1,32}):(\d{5,32})>|<@!?(\d{5,32})>|<@&(\d{5,32})>|<#(\d{5,32})>/g;

  function stashDiscordCustomTokens(raw, stashFn, opts) {
    opts = opts || {};
    var still = !!opts.still;
    var size = opts.size || 32;
    var asSpans = !!opts.asSpans;
    return String(raw || "").replace(DISCORD_CUSTOM_TOKEN_RE, function (_all, anim, name, eid, uid, rid, cid) {
      if (uid) {
        if (!(state.userResolveAttempted && state.userResolveAttempted[uid])) {
          queueContentResolve({ userIds: [uid] });
        }
        return stashFn(plainUserMentionHtml(resolveMentionName("user", uid), uid));
      }
      if (rid) {
        if (!(state.roleResolveAttempted && state.roleResolveAttempted[rid])) {
          queueContentResolve({ roleIds: [rid] });
        }
        return stashFn(
          '<span class="vc-wt-msg-mention vc-wt-msg-mention--role" data-mention-role="' +
            esc(rid) +
            '" data-mention-type="role" data-mention-id="' +
            esc(rid) +
            '">@' +
            esc(resolveMentionName("role", rid)) +
            "</span>",
        );
      }
      if (cid) {
        if (!(state.channelResolveAttempted && state.channelResolveAttempted[cid])) {
          queueContentResolve({ channelIds: [cid] });
        }
        var href = asSpans ? "" : guildDiscordChannelUrl(cid);
        return stashFn(
          (href
            ? '<a class="vc-wt-msg-mention vc-wt-msg-mention--channel" href="' +
              esc(href) +
              '" target="_blank" rel="noopener noreferrer" data-mention-channel="' +
              esc(cid) +
              '" data-mention-type="channel" data-mention-id="' +
              esc(cid) +
              '">'
            : '<span class="vc-wt-msg-mention vc-wt-msg-mention--channel" data-mention-channel="' +
              esc(cid) +
              '" data-mention-type="channel" data-mention-id="' +
              esc(cid) +
              '">') +
            "#" +
            esc(resolveMentionName("channel", cid)) +
            (href ? "</a>" : "</span>"),
        );
      }
      var em = { id: eid, name: name, animated: anim === "a" };
      var html = guildEmojiImgHtml(em, still, size);
      return stashFn(html || ":" + name + ":");
    });
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
    var s = normalizeDiscordMarkup(raw);
    s = stashDiscordCustomTokens(s, stash, {
      still: !!opts.still,
      size: opts.size || 32,
      asSpans: !!opts.asSpans,
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
    var s = normalizeDiscordMarkup(raw);
    s = stashDiscordCustomTokens(s, stash, { still: true, size: 22, asSpans: true });
    s = replaceEmojiShortcodes(s, stash, true, 22);
    /* composerMdPlain1: niente replacePlainTranscriptMentions qui —
       l'overlay trasformava @nome/#… in chip menzione mentre il testo reale
       restava plain → cursore sfalsato e "tag" fantasma. Solo markup Discord reale. */
    s = s.replace(/\[([^\]]+)\]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/gi, function (_m, label, url) {
      /* composerMdCaret1: span non <a> — overlay only; niente focus/navigazione sul live */
      return stash(
        '<span class="vc-wt-link vc-wt-link--composer" data-href="' +
          esc(url) +
          '">' +
          mdMark("[") +
          restore(formatDiscordInlineKeepMarks(label)) +
          mdMark("](") +
          '<span class="vc-wt-md-mark vc-wt-md-mark--url">' +
          esc(url) +
          "</span>" +
          mdMark(")") +
          "</span>",
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
        '<span class="vc-wt-link vc-wt-link--composer" data-href="' +
          esc(url) +
          '">' +
          esc(url) +
          "</span>",
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
    /* composerMdCaret2: span non div — i div heading creavano line-box extra vs caret */
    if (/^[ \t]{0,3}###\s+/.test(raw)) {
      return (
        '<span class="vc-wt-md-h3">' +
        mdMark(raw.match(/^[ \t]{0,3}###\s+/)[0]) +
        formatDiscordInlineKeepMarks(raw.replace(/^[ \t]{0,3}###\s+/, "")) +
        "</span>"
      );
    }
    if (/^[ \t]{0,3}##\s+/.test(raw)) {
      return (
        '<span class="vc-wt-md-h2">' +
        mdMark(raw.match(/^[ \t]{0,3}##\s+/)[0]) +
        formatDiscordInlineKeepMarks(raw.replace(/^[ \t]{0,3}##\s+/, "")) +
        "</span>"
      );
    }
    if (/^[ \t]{0,3}#\s+/.test(raw)) {
      return (
        '<span class="vc-wt-md-h1">' +
        mdMark(raw.match(/^[ \t]{0,3}#\s+/)[0]) +
        formatDiscordInlineKeepMarks(raw.replace(/^[ \t]{0,3}#\s+/, "")) +
        "</span>"
      );
    }
    if (/^[ \t]{0,3}-#\s+/.test(raw)) {
      return (
        '<span class="vc-wt-md-sub">' +
        mdMark(raw.match(/^[ \t]{0,3}-#\s+/)[0]) +
        formatDiscordInlineKeepMarks(raw.replace(/^[ \t]{0,3}-#\s+/, "")) +
        "</span>"
      );
    }
    if (/^[ \t]{0,3}>\s?/.test(raw)) {
      var quotedKeep = raw.replace(/^[ \t]{0,3}>\s?/, "");
      var quotePrefix = mdMark(raw.match(/^[ \t]{0,3}>\s?/)[0]);
      var quoteBody = "";
      if (/^[ \t]{0,3}###\s+/.test(quotedKeep)) {
        quoteBody =
          '<span class="vc-wt-md-h3">' +
          mdMark(quotedKeep.match(/^[ \t]{0,3}###\s+/)[0]) +
          formatDiscordInlineKeepMarks(quotedKeep.replace(/^[ \t]{0,3}###\s+/, "")) +
          "</span>";
      } else if (/^[ \t]{0,3}##\s+/.test(quotedKeep)) {
        quoteBody =
          '<span class="vc-wt-md-h2">' +
          mdMark(quotedKeep.match(/^[ \t]{0,3}##\s+/)[0]) +
          formatDiscordInlineKeepMarks(quotedKeep.replace(/^[ \t]{0,3}##\s+/, "")) +
          "</span>";
      } else if (/^[ \t]{0,3}#\s+/.test(quotedKeep)) {
        quoteBody =
          '<span class="vc-wt-md-h1">' +
          mdMark(quotedKeep.match(/^[ \t]{0,3}#\s+/)[0]) +
          formatDiscordInlineKeepMarks(quotedKeep.replace(/^[ \t]{0,3}#\s+/, "")) +
          "</span>";
      } else if (/^[ \t]{0,3}-#\s+/.test(quotedKeep)) {
        quoteBody =
          '<span class="vc-wt-md-sub">' +
          mdMark(quotedKeep.match(/^[ \t]{0,3}-#\s+/)[0]) +
          formatDiscordInlineKeepMarks(quotedKeep.replace(/^[ \t]{0,3}-#\s+/, "")) +
          "</span>";
      } else {
        quoteBody = formatDiscordInlineKeepMarks(quotedKeep);
      }
      return '<span class="vc-wt-md-quote">' + quotePrefix + quoteBody + "</span>";
    }
    /* composerMdCaret2: riga vuota = "" (il <br> tra righe lo mette pushText).
       Prima: || "<br>" → doppio break → cursore sopra il testo. */
    return formatDiscordInlineKeepMarks(raw) || "";
  }

  function buildComposerLiveHtml(text) {
    var s = String(text || "");
    if (!s) return "";
    var re = /<(a?):([a-zA-Z0-9_]{1,32}):(\d{5,32})>|<@!?(\d{5,32})>|<@&(\d{5,32})>|<#(\d{5,32})>/g;
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
        /* composerMentionShow1: ghost = larghezza markup <@id>; label = chip @nome */
        if (!(state.userResolveAttempted && state.userResolveAttempted[m[4]])) {
          queueContentResolve({ userIds: [m[4]] });
        }
        parts.push(
          '<span class="vc-wt-composer-mention vc-wt-composer-mention--user" aria-hidden="true">' +
            '<span class="vc-wt-composer-mention__ghost">' +
            esc(m[0]) +
            "</span>" +
            '<span class="vc-wt-composer-mention__label vc-wt-mention vc-wt-mention--user">@' +
            esc(resolveMentionName("user", m[4])) +
            "</span></span>",
        );
      } else if (m[5]) {
        if (resolveMentionName("role", m[5]) === "ruolo") {
          queueContentResolve({ roleIds: [m[5]] });
        }
        parts.push(
          '<span class="vc-wt-composer-mention vc-wt-composer-mention--role" aria-hidden="true">' +
            '<span class="vc-wt-composer-mention__ghost">' +
            esc(m[0]) +
            "</span>" +
            '<span class="vc-wt-composer-mention__label vc-wt-mention vc-wt-mention--role">@' +
            esc(resolveMentionName("role", m[5])) +
            "</span></span>",
        );
      } else if (m[6]) {
        if (!(state.channelResolveAttempted && state.channelResolveAttempted[m[6]])) {
          queueContentResolve({ channelIds: [m[6]] });
        }
        parts.push(
          '<span class="vc-wt-composer-mention vc-wt-composer-mention--channel" aria-hidden="true">' +
            '<span class="vc-wt-composer-mention__ghost">' +
            esc(m[0]) +
            "</span>" +
            '<span class="vc-wt-composer-mention__label vc-wt-mention vc-wt-mention--channel">#' +
            esc(resolveMentionName("channel", m[6])) +
            "</span></span>",
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

  function composerNeedsMdLive(text) {
    var s = String(text || "");
    if (!s) return false;
    /* ticketsChatLag2: overlay solo se c'è markup reale (plain typing = 0 innerHTML) */
    return /[*_~`|>]|<(?:@!?|@&|#|a?:[A-Za-z0-9_]+:\d+)/.test(s);
  }

  function composerMdLiveTooHeavy(text) {
    var s = String(text || "");
    if (!s) return false;
    /* ticketsCpu45_1 #5: niente md-live se tab nascosta / finestra non focused */
    try {
      if (document.visibilityState === "hidden") return true;
      if (typeof document.hasFocus === "function" && !document.hasFocus()) return true;
    } catch (eFocus) {}
    /* ticketsPerfPack1: mobile o testi lunghi → niente overlay md (CPU/reflow) */
    if (isCoarseMobile()) return true;
    if (!composerNeedsMdLive(s)) return true;
    if (s.length > 220) return true;
    var nl = 0;
    for (var i = 0; i < s.length; i += 1) {
      if (s.charCodeAt(i) === 10) {
        nl += 1;
        if (nl > 8) return true;
      }
    }
    return false;
  }

  /* ticketRichTok1: helper locale — composer chunk lazy non espone richInputHasVisualTokens */
  function richInputHasVisualTokens(el) {
    try {
      if (typeof window.__vcRichInputHasVisualTokens === "function") {
        return window.__vcRichInputHasVisualTokens(el);
      }
    } catch (eTok) {}
    return Boolean(el && el.querySelector && el.querySelector("img, .vc-wt-mention"));
  }

  function syncComposerLivePreview(el, opts) {
    if (!el) return;
    var host = el.parentElement;
    var live = host && host.classList.contains("vc-wt-composer__editor") ? host.querySelector(".vc-wt-composer__md-live") : null;
    if (!live) return;
    var text = serializeRichInput(el);
    if (composerMdLiveTooHeavy(text)) {
      if (el._vcMdLiveHtml !== "") {
        el._vcMdLiveHtml = "";
        live.innerHTML = "";
      }
      el.classList.remove("has-md-live");
      syncComposerAutosize(el, opts);
      return;
    }
    var html = buildComposerLiveHtml(text);
    /* ticketsComposerLag1: skip DOM se markdown invariato */
    if (el._vcMdLiveHtml !== html) {
      el._vcMdLiveHtml = html;
      live.innerHTML = html;
    }
    syncComposerAutosize(el, opts);
    if (live.scrollTop !== el.scrollTop) live.scrollTop = el.scrollTop;
    if (live.scrollLeft !== el.scrollLeft) live.scrollLeft = el.scrollLeft;
    el.classList.toggle("has-md-live", Boolean(String(text || "").trim() || richInputHasVisualTokens(el)));
  }

  /* composerAutoGrow1: altezza tipo Discord (sale col testo, poi scroll). */
  function syncComposerAutosize(el, opts) {
    if (!el || !isRichInput(el)) return;
    var host = el.parentElement;
    var live = host && host.classList.contains("vc-wt-composer__editor") ? host.querySelector(".vc-wt-composer__md-live") : null;
    var minH = 44;
    var maxH = Math.max(140, Math.min(Math.floor((window.innerHeight || 800) * 0.42), 360));
    var force = opts && opts.force;
    var shrink = force || (opts && opts.shrink) || el._vcAutoGrowShrink;
    var now = Date.now();
    /* ticketsComposerLag1: max ~20Hz mentre digiti (prima: reflow a ogni key) */
    if (!force && el._vcAutoGrowAt && now - el._vcAutoGrowAt < 50) {
      el._vcAutoGrowPending = 1;
      if (shrink) el._vcAutoGrowShrink = 1;
      return;
    }
    el._vcAutoGrowAt = now;
    el._vcAutoGrowPending = 0;
    el._vcAutoGrowShrink = 0;
    var prevH = Number(el._vcAutoGrowH) || 0;
    /* ticketsPerfPack1: height:0 solo su shrink/force — grow usa scrollHeight corrente */
    if (shrink || !prevH) {
      el.style.height = "0px";
      if (live) {
        live.style.height = "0px";
        live.style.bottom = "auto";
      }
    } else {
      el.style.overflowY = "hidden";
      if (live) live.style.overflowY = "hidden";
    }
    var contentH = Math.max(el.scrollHeight || 0, live ? live.scrollHeight || 0 : 0, minH);
    var next = Math.min(Math.max(contentH, minH), maxH);
    /* skip style writes se altezza stabile (±1px) */
    if (!force && prevH && Math.abs(prevH - next) < 1.5) {
      el.style.height = prevH + "px";
      if (live) live.style.height = prevH + "px";
      return;
    }
    el._vcAutoGrowH = next;
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
      if (el._vcAutoGrowPending) {
        if (el._vcAutoGrowTimer) clearTimeout(el._vcAutoGrowTimer);
        el._vcAutoGrowTimer = setTimeout(function () {
          el._vcAutoGrowTimer = 0;
          syncComposerAutosize(el, { force: true });
        }, 48);
      }
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
          formatMessageContent(f.name || "", { still: true, singleLine: true }) +
          '</span><span class="vc-wt-discord-embed__field-value">' +
          formatMessageContent(f.value || "", { still: true }) +
          "</span></div>"
        );
      })
      .join("");
    return (
      '<div class="vc-wt-discord-embed">' +
      (title
        ? '<div class="vc-wt-discord-embed__title">' +
          formatMessageContent(title, { still: true, singleLine: true }) +
          "</div>"
        : "") +
      (desc
        ? '<div class="vc-wt-discord-embed__desc">' + formatMessageContent(desc, { still: true }) + "</div>"
        : "") +
      (fieldsHtml ? '<div class="vc-wt-discord-embed__fields">' + fieldsHtml + "</div>" : "") +
      (imageUrl
        ? '<img class="vc-wt-discord-embed__img" src="' +
          esc(imageUrl) +
          '" alt="" width="320" height="180" loading="lazy" decoding="async" />'
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
    var body = item.content
      ? formatMessageContent(item.content, { still: true })
      : "<em>Messaggio Discord</em>";
    var img = item.imageUrl
      ? '<img class="vc-wt-msg-embed__img" src="' + esc(item.imageUrl) + '" alt="" width="320" height="180" loading="lazy" decoding="async" />'
      : "";
    var channelId = String(item.channelId || "").trim();
    if (channelId && /^\d{5,32}$/.test(channelId)) {
      if (item.channelName) rememberMentionName("channel", channelId, item.channelName);
      if (
        resolveMentionName("channel", channelId) === "canale" &&
        !(state.channelResolveAttempted && state.channelResolveAttempted[channelId])
      ) {
        queueContentResolve({ channelIds: [channelId] });
      }
    }
    var channelLabel = channelId
      ? resolveMentionName("channel", channelId)
      : String(item.channelName || "canale").replace(/^#/, "");
    if (channelLabel === "canale" && item.channelName) {
      channelLabel = String(item.channelName).replace(/^#/, "");
    }
    var headChannel = channelId
      ? '<span class="vc-wt-msg-mention vc-wt-msg-mention--channel" data-mention-channel="' +
        esc(channelId) +
        '" data-mention-type="channel" data-mention-id="' +
        esc(channelId) +
        '">#' +
        esc(channelLabel) +
        "</span>"
      : "#" + esc(channelLabel);
    var href = String(item.url || "").trim();
    return (
      '<div class="vc-wt-msg-embed" role="link" tabindex="0" data-open-url="' +
      esc(href || "#") +
      '"' +
      (href ? ' title="Apri su Discord"' : "") +
      ">" +
      '<span class="vc-wt-msg-embed__head">' +
      headChannel +
      " · " +
      esc(item.authorName || "Utente") +
      "</span>" +
      '<span class="vc-wt-msg-embed__body">' +
      body +
      "</span>" +
      img +
      "</div>"
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
                if (linksChanged) {
          /* embed/link preview: serve rebuild */
          refreshChatLogMarkup();
        } else if (namesChanged) {
          /* ticketsChatLag2: patch label in-place — no remount chat lunga */
          refreshMentionTokenLabels();
        }
        if (avatarsChanged && !linksChanged) {
          try {
            wakeTicketAvatars(byId("vc-wt-chat-log"));
          } catch (eAv) {}
        }
        if (linksChanged || avatarsChanged || namesChanged) {
          refreshListPane();
        }
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
    freezeTicketsAnimatedMedia(log);
    wakeTicketAvatars(log);
    scrollChatBottom(false);
  }

  function hydrateContentRefs(messages) {
    var refs = collectContentRefs(messages);
    if (refs.channelIds.length || refs.userIds.length || refs.roleIds.length || refs.urls.length) {
      queueContentResolve(refs);
    }
  }

  function formatMessageContent(content, opts) {
    if (!UNICODE_EMOJI_SHORTCODES || !KNOWN_EMOJI_FALLBACKS) {
      try { ensureTicketsEmojiMaps(); } catch (eE) {}
      if (window.__VC_WT_EMOJI) {
        UNICODE_EMOJI_SHORTCODES = window.__VC_WT_EMOJI.UNICODE_EMOJI_SHORTCODES;
        KNOWN_EMOJI_FALLBACKS = window.__VC_WT_EMOJI.KNOWN_EMOJI_FALLBACKS;
      }
      if (!UNICODE_EMOJI_SHORTCODES) UNICODE_EMOJI_SHORTCODES = {};
      if (!KNOWN_EMOJI_FALLBACKS) KNOWN_EMOJI_FALLBACKS = {};
    }

    opts = opts || {};
    var still = opts.still === true;
    var singleLine = opts.singleLine === true;
    var plainPreview = opts.plainPreview === true;
    var previewTicket = opts.ticket || null;
    var s = String(content || "");
    if (!s) return "";
    s = normalizeDiscordMarkup(s);
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
    s = s.replace(/<(a?):([a-zA-Z0-9_]{1,32}):(\d{5,32})>|<@!?(\d{5,32})>|<@&(\d{5,32})>|<#(\d{5,32})>/g, function (all, anim, name, eid, uid, rid, cid) {
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
      /* ticketsCpuHard3: mai emoji animate in chat (CPU continuo) */
      var wantAnimated = false;
      void isAnimated;
      /* ticketMsgEmojiFlat1: size CDN allineato a inline 1.15em (48 sembrava “cerchio grosso”) */
      var size = still ? 24 : 32;
      var url =
        window.VcEmojiPicker && typeof window.VcEmojiPicker.customUrl === "function"
          ? window.VcEmojiPicker.customUrl(eid, wantAnimated, size)
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
          ':" width="' +
          size +
          '" height="' +
          size +
          '" loading="lazy" decoding="async" />',
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

  /* ticketsCpu45_1 #4: confronto reactions senza JSON.stringify (quiet poll thread lunghi) */
  function reactionsFingerprint(reactions) {
    if (!reactions || !reactions.length) return "";
    var parts = [];
    for (var i = 0; i < reactions.length; i += 1) {
      var r = reactions[i];
      if (!r) continue;
      var emojiKey = r.emojiId
        ? "id:" + String(r.emojiId)
        : "n:" + String(r.emoji || r.name || "");
      var count = r.count != null ? Number(r.count) || 0 : Array.isArray(r.userIds) ? r.userIds.length : 0;
      parts.push(emojiKey + ":" + count + ":" + (reactionMe(r) ? "1" : "0"));
    }
    return parts.join("|");
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
        '" data-vc-avatar="0" data-vc-emoji-id="' +
        esc(emojiId) +
        '" data-vc-emoji-animated="' +
        (animated ? "1" : "0") +
        '" alt=":' +
        esc(r.name || "emoji") +
        ':" width="16" height="16" loading="lazy" decoding="async" />';
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

  function formatReplySnippetHtml(reply, opts) {
    opts = opts || {};
    if (!reply) return "";
    if (reply.deleted) return esc("Messaggio originale eliminato");
    var text = String(reply.content || "").replace(/\s+/g, " ").trim();
    if (!text) {
      if (reply.hasMedia) return esc("Allegato");
      return esc("Messaggio");
    }
    return formatMessageContent(text, {
      still: true,
      singleLine: opts.singleLine !== false,
    });
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
      formatReplySnippetHtml(reply) +
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
      /* ticketLoadYoYo1: no scrollIntoView fallback (page jump) */
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
      formatReplySnippetHtml(reply) +
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
          '" alt="" width="320" height="180" loading="lazy" decoding="async" /></a>'
        );
      })
      .join("");
    var canCopy = Boolean(String(m.content || "").trim());
    var tools = "";
    if (canCopy || canEdit || canDelete || canReply) {
      /* ticketUiPack2: azioni messaggio → menu a tendina (come Azioni header) */
      var opts =
        (canReply
          ? '<button type="button" class="vc-wt-msg-menu__opt" role="menuitem" data-msg-reply="' +
            esc(m.id) +
            '"><i class="fa fa-reply" aria-hidden="true"></i><span>Rispondi</span></button>'
          : "") +
        (canCopy
          ? '<button type="button" class="vc-wt-msg-menu__opt" role="menuitem" data-msg-copy="' +
            esc(m.id) +
            '"><i class="fa fa-clipboard" aria-hidden="true"></i><span>Copia testo</span></button>'
          : "") +
        (canEdit
          ? '<button type="button" class="vc-wt-msg-menu__opt" role="menuitem" data-msg-edit="' +
            esc(m.id) +
            '"><i class="fa fa-pencil" aria-hidden="true"></i><span>Modifica</span></button>'
          : "") +
        (canDelete
          ? '<button type="button" class="vc-wt-msg-menu__opt vc-wt-msg-menu__opt--danger" role="menuitem" data-msg-del="' +
            esc(m.id) +
            '"><i class="fa fa-trash-o" aria-hidden="true"></i><span>Elimina</span></button>'
          : "");
      tools =
        '<div class="vc-wt-msg__tools vc-wt-msg-menu" data-wt-msg-menu>' +
        '<button type="button" class="vc-wt-msg-menu__btn" data-wt-msg-menu-toggle aria-expanded="false" aria-haspopup="menu" title="Azioni messaggio" aria-label="Azioni messaggio">' +
        '<i class="fa fa-ellipsis-v" aria-hidden="true"></i></button>' +
        '<div class="vc-wt-msg-menu__panel" role="menu" hidden>' +
        opts +
        "</div></div>";
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
      avatarHtml(resolveMessageAvatarUrl(m), displayMessageAuthorName(m), "vc-wt-msg__avatar", m.authorId) +
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
      receiptTicksHtml(m, mine, pending) +
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

  function receiptTicksHtml(m, mine, pending) {
    if (!mine || pending) return "";
    var kind = effectiveAuthorKind(m);
    if (kind === "system" || kind === "bot") return "";
    var read =
      m.read === true ||
      String(m.receiptStatus || "").toLowerCase() === "read" ||
      (Array.isArray(m.readBy) &&
        m.readBy.some(function (r) {
          return String((r && r.userId) || "") && String(r.userId) !== String(m.authorId || "");
        }));
    var label = read ? "Letto" : "Inviato";
    return (
      '<span class="vc-msg-ticks' +
      (read ? " is-read" : " is-sent") +
      '" title="' +
      label +
      '" aria-label="' +
      label +
      '">' +
      '<svg class="vc-msg-ticks__svg" viewBox="0 0 16 11" width="16" height="11" aria-hidden="true" focusable="false">' +
      (read
        ? '<path d="M11.1 1.1 5.6 7.2 3.1 4.8l-1.2 1.2 3.7 3.7 6.7-7.4z"/><path d="M14.4 1.1 8.9 7.2 7.6 5.9l-1.1 1.2 2.4 2.4 6.7-7.4z"/>'
        : '<path d="M13.2 1.1 6.5 8.5 2.8 4.9 1.6 6.1 6.5 11l8-8.7z"/>') +
      "</svg></span>"
    );
  }

  function applyReceiptsToOwnMessages(messageIds, readerId) {
    var ids = Array.isArray(messageIds) ? messageIds : [];
    if (!ids.length) return;
    var idSet = {};
    for (var i = 0; i < ids.length; i += 1) idSet[String(ids[i])] = 1;
    var reader = String(readerId || "").trim();
    var changed = false;
    state.messages = state.messages.map(function (m) {
      if (!m || !idSet[String(m.id || "")]) return m;
      if (!isOwnMessage(m)) return m;
      if (m.read === true || String(m.receiptStatus || "") === "read") return m;
      changed = true;
      var next = Object.assign({}, m, { read: true, receiptStatus: "read" });
      if (reader) {
        var rb = Array.isArray(m.readBy) ? m.readBy.slice() : [];
        if (
          !rb.some(function (r) {
            return String((r && r.userId) || "") === reader;
          })
        ) {
          rb.push({ userId: reader, at: new Date().toISOString() });
        }
        next.readBy = rb;
      }
      return next;
    });
    if (!changed) return;
    for (var j = 0; j < ids.length; j += 1) {
      var mid = String(ids[j] || "");
      var msg = state.messages.find(function (x) {
        return String((x && x.id) || "") === mid;
      });
      if (!msg || !isOwnMessage(msg)) continue;
      var node = document.querySelector('.vc-wt-msg[data-msg-id="' + mid + '"] .vc-msg-ticks');
      if (node) {
        node.classList.remove("is-sent");
        node.classList.add("is-read");
        node.setAttribute("title", "Letto");
        node.setAttribute("aria-label", "Letto");
        node.innerHTML =
          '<svg class="vc-msg-ticks__svg" viewBox="0 0 16 11" width="16" height="11" aria-hidden="true" focusable="false">' +
          '<path d="M11.1 1.1 5.6 7.2 3.1 4.8l-1.2 1.2 3.7 3.7 6.7-7.4z"/><path d="M14.4 1.1 8.9 7.2 7.6 5.9l-1.1 1.2 2.4 2.4 6.7-7.4z"/>' +
          "</svg>";
      } else {
        patchMessageInState(msg);
      }
    }
  }

  function markSelectedTicketRead(messageIds) {
    if (!state.selectedId || !getToken()) return;
    var body = {};
    if (Array.isArray(messageIds) && messageIds.length) body.messageIds = messageIds.slice(0, 80);
    fetchJson(apiBase() + "/" + encodeURIComponent(state.selectedId) + "/read", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(body),
      timeoutMs: 12000,
    }).catch(function () {});
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

  /* chatHeadTool1: chip soft + icone; gruppi manage/core (no pill ghost densità) */
  function wtActionBtn(act, label, cls, icon) {
    return (
      '<button type="button" class="vc-wt-action' +
      (cls ? " " + cls : "") +
      '" data-act="' +
      esc(act) +
      '"' +
      (label ? ' title="' + esc(label) + '"' : "") +
      ">" +
      (icon ? '<i class="fa ' + icon + '" aria-hidden="true"></i>' : "") +
      "<span>" +
      esc(label) +
      "</span></button>"
    );
  }

  /* ticketHeadMenu1: voce menu azioni (stesso data-act del wireChatActions) */
  function wtHeadMenuOpt(act, label, tone, icon) {
    return (
      '<button type="button" class="vc-wt-head-menu__opt' +
      (tone ? " vc-wt-head-menu__opt--" + tone : "") +
      '" role="menuitem" data-act="' +
      esc(act) +
      '">' +
      (icon ? '<i class="fa ' + icon + '" aria-hidden="true"></i>' : "") +
      "<span>" +
      esc(label) +
      "</span></button>"
    );
  }

  function ticketPanelButtonsHtml(t) {
    /* ticketHeadMenu1: opzioni menu (non bottoni flat) */
    if (!t || t.status === "closed") return "";
    var perms = (t.permissions && typeof t.permissions === "object" ? t.permissions : {}) || {};
    var manage = "";
    if (perms.canAddUsers) {
      manage += wtHeadMenuOpt("add-user", "Aggiungi utente", "ok", "fa-user-plus");
    }
    if (perms.canRemoveUsers) {
      manage += wtHeadMenuOpt("remove-user", "Rimuovi utente", "danger", "fa-user-times");
    }
    if (perms.canSwitchCategory) {
      manage += wtHeadMenuOpt("switch-cat", "Cambia categoria", "", "fa-exchange");
    }
    if (perms.canRename) {
      manage += wtHeadMenuOpt("rename", "Rinomina", "", "fa-pencil");
    }
    if (perms.canCloseRequest) {
      manage += wtHeadMenuOpt("close-request", "Richiedi chiusura", "", "fa-hand-paper-o");
    }
    if (perms.canTransfer) {
      manage += wtHeadMenuOpt("transfer", "Trasferisci", "", "fa-share");
    }
    return manage;
  }

  /* ticketHeadUi1: chrome header sul host (prima solo nel chunk → ReferenceError / header stale) */
  function refreshChatChrome() {
    if (!state.detail) return;
    var top = byId("vc-wt-chat-top");
    if (!top) return;
    try {
      var wrap = document.createElement("div");
      wrap.innerHTML = chatHeadHtml(state.detail);
      var next = wrap.firstElementChild;
      if (next) top.replaceWith(next);
    } catch (eHead) {
      return;
    }
    try {
      wireChatActions();
    } catch (eWire) {}
    try {
      var api = window.__vcWtComposerApi;
      if (api && typeof api.patchComposerHtml === "function") api.patchComposerHtml();
    } catch (ePatch) {}
    try {
      var t = state.detail || {};
      state._chatChromeSig = [
        t.id || "",
        t.status || "",
        t.claimedBy || t.assigneeId || "",
        t.category || "",
        t.categoryLabel || "",
        t.closeRequestedAt || "",
        t.updatedAt || t.updated_at || "",
        (t.subject || t.title || "").slice(0, 80),
      ].join("|");
    } catch (eSig) {}
  }

  function chatHeadHtml(t) {
    if (!t) return "";
    var perms = (t.permissions && typeof t.permissions === "object" ? t.permissions : {}) || {};
    var opts = ticketPanelButtonsHtml(t);
    if (t.status !== "closed") {
      if (perms.canClaim) {
        opts += wtHeadMenuOpt("claim", "Claim", "primary", "fa-hand-rock-o");
      } else if (perms.canUnclaim) {
        opts += wtHeadMenuOpt("unclaim", "Rilascia", "", "fa-unlock");
      }
      if (perms.canClose) {
        opts += wtHeadMenuOpt("close", "Chiudi ticket", "danger", "fa-times");
      }
    }
    var actionsHtml = opts
      ? '<div class="vc-wt-chat__actions">' +
        '<div class="vc-wt-head-menu" data-wt-head-menu>' +
        '<button type="button" class="vc-wt-head-menu__btn" data-wt-head-menu-toggle aria-expanded="false" aria-haspopup="menu">' +
        '<i class="fa fa-cog" aria-hidden="true"></i>' +
        "<span>Azioni</span>" +
        '<i class="fa fa-caret-down vc-wt-head-menu__caret" aria-hidden="true"></i>' +
        "</button>" +
        '<div class="vc-wt-head-menu__panel" role="menu" hidden>' +
        opts +
        "</div></div></div>"
      : '<div class="vc-wt-chat__actions"></div>';
    /* ticketHeadMenu1: chip soft (id / categoria / claim) — niente riga grezza con · */
    var chips = [];
    if (t.ticketNumber != null && t.ticketNumber !== "") {
      chips.push(
        '<span class="vc-wt-chat__chip vc-wt-chat__chip--id" title="Numero ticket">' +
          '<i class="fa fa-ticket" aria-hidden="true"></i>' +
          "<span>#" +
          esc(t.ticketNumber) +
          "</span></span>",
      );
    }
    var cat = String(t.categoryLabel || "").trim();
    if (cat) {
      chips.push(
        '<span class="vc-wt-chat__chip vc-wt-chat__chip--cat" title="Categoria">' +
          '<i class="fa fa-folder-o" aria-hidden="true"></i>' +
          "<span>" +
          esc(cat) +
          "</span></span>",
      );
    }
    if (t.status === "closed") {
      chips.push(
        '<span class="vc-wt-chat__chip vc-wt-chat__chip--state" title="Stato">' +
          '<i class="fa fa-lock" aria-hidden="true"></i>' +
          "<span>Chiuso</span></span>",
      );
    } else if (t.claimedByName) {
      var claimRole = resolveStaffRoleName(t.claimedBy);
      chips.push(
        '<span class="vc-wt-chat__chip vc-wt-chat__chip--claim" title="In carico a">' +
          '<i class="fa fa-hand-rock-o" aria-hidden="true"></i>' +
          "<span>" +
          esc(t.claimedByName) +
          (claimRole && !/^staff$/i.test(claimRole) ? " · " + esc(claimRole) : "") +
          "</span></span>",
      );
    } else if (t.userId && resolveStaffRoleName(t.userId)) {
      /* ticketStaffOpenTag1: opener staff senza claim → chip ruolo */
      var openRole = resolveStaffRoleName(t.userId);
      if (openRole && !/^staff$/i.test(openRole)) {
        chips.push(
          '<span class="vc-wt-chat__chip vc-wt-chat__chip--claim" title="Ruolo opener">' +
            '<i class="fa fa-id-badge" aria-hidden="true"></i>' +
            "<span>" +
            esc(openRole) +
            "</span></span>",
        );
      }
    }
    var metaHtml = chips.length
      ? '<div class="vc-wt-chat__meta" role="list">' + chips.join("") + "</div>"
      : "";
    return (
      '<div id="vc-wt-chat-top" class="vc-wt-chat__top">' +
      '<header id="vc-wt-chat-head" class="vc-wt-chat__head">' +
      '<div class="vc-wt-chat__title">' +
      "<h2>" +
      esc(ticketDisplayName(t)) +
      "</h2>" +
      metaHtml +
      "</div>" +
      actionsHtml +
      "</header>" +
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
      '<div id="vc-wt-composer-text" class="vc-wt-composer__input" contenteditable="true" role="textbox" aria-multiline="true" enterkeyhint="send" data-placeholder="' +
      esc(
        (state.detail && state.detail.permissions && state.detail.permissions.canUseCommands
          ? "Scrivi un messaggio… (@ utenti, # canali, +desc / /partnership)"
          : "Scrivi un messaggio… (@ utenti, # canali)") ,
      ) +
      '" spellcheck="false" autocomplete="off"></div></div>' +
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
    if (state.composeOpen && !isStaffMode) {
      return composePanelHtml();
    }
    if (!state.detail) {
      var openBtn = "";
      if (!isStaffMode) {
        openBtn =
          '<button type="button" class="vc-reviews-submit" data-act="compose">Apri un ticket</button>';
      }
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
        openBtn +
        "</div></div>"
      );
    }
    var closed = state.detail.status === "closed";
    var pendingOpen = Boolean(state.detail._openPending) && !(state.messages && state.messages.length);
    var logHtml;
    if (pendingOpen) {
      logHtml =
        '<div class="vc-wt-chat-loading" aria-busy="true" aria-live="polite">' +
        '<span class="vc-wt-chat-loading__spin" aria-hidden="true"></span>' +
        "<p>Caricamento messaggi…</p></div>";
    } else {
      /* perfRoiPack2: window ultimi N messaggi (DOM bound); load older espande */
      /* loadSyncPack1: marker */
      var MSG_WIN = 80;
      var allMsgs = state.messages || [];
      var winStart =
        Number.isFinite(state._msgWinStart) && state._msgWinStart >= 0
          ? Math.min(state._msgWinStart, Math.max(0, allMsgs.length - 1))
          : Math.max(0, allMsgs.length - MSG_WIN);
      /* loadSyncPack1: trim older end if window grew beyond MSG_WIN*2 */
      var maxWin = MSG_WIN * 2;
      if (allMsgs.length - winStart > maxWin) {
        winStart = allMsgs.length - maxWin;
      }
      state._msgWinStart = winStart;
      var slice = allMsgs.slice(winStart);
      var older =
        winStart > 0
          ? '<div class="vc-wt-chat-load-older">' +
            '<button type="button" class="vc-wt-chat-load-older__btn" data-act="load-older-msgs">' +
            "Carica messaggi precedenti (" +
            String(winStart) +
            ")</button></div>"
          : "";
      logHtml = older + slice.map(messageHtml).join("");
    }
    return (
      '<div class="vc-wt-chat' +
      (closed ? " vc-wt-chat--closed" : "") +
      (pendingOpen ? " vc-wt-chat--pending" : "") +
      '">' +
      chatHeadHtml(state.detail) +
      '<div class="vc-wt-chat__stage">' +
      '<div id="vc-wt-chat-log" class="vc-wt-chat__log">' +
      logHtml +
      "</div>" +
      (closed ? ratingDockHtml(state.detail, { settled: true }) : "") +
      "</div>" +
      (pendingOpen ? "" : composerHtml()) +
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

  /* ticketsConsoleFix1: composer lazy — stub safe prima del chunk (no ReferenceError) */
  function wtComposerApiSafe() {
    try {
      return (
        (window.__VC_WT_COMPOSER_HOST && window.__VC_WT_COMPOSER_HOST._api) ||
        window.__vcWtComposerApi ||
        null
      );
    } catch (eApi) {
      return null;
    }
  }
  function hideMentionMenu() {
    var api = wtComposerApiSafe();
    if (api && typeof api.hideMentionMenu === "function") {
      api.hideMentionMenu();
      return;
    }
    try {
      if (state.mentionMenu) {
        state.mentionMenu.open = false;
        state.mentionMenu.items = [];
        state.mentionMenu.index = 0;
        state.mentionMenu.q = "";
      }
      var menu = byId("vc-wt-mention-menu");
      if (menu) {
        menu.hidden = true;
        menu.innerHTML = "";
      }
    } catch (eMm) {}
  }
  function hideCommandMenu() {
    var api = wtComposerApiSafe();
    if (api && typeof api.hideCommandMenu === "function") {
      api.hideCommandMenu();
      return;
    }
    try {
      if (state.commandMenu) {
        state.commandMenu.open = false;
        state.commandMenu.items = [];
        state.commandMenu.index = 0;
        state.commandMenu.q = "";
      }
      var menu = byId("vc-wt-command-menu");
      if (menu) {
        menu.hidden = true;
        menu.innerHTML = "";
      }
    } catch (eCm) {}
  }
  function hideReactionTipPortal() {
    var api = wtComposerApiSafe();
    if (api && typeof api.hideReactionTipPortal === "function") {
      api.hideReactionTipPortal();
      return;
    }
    try {
      var tip = byId("vc-wt-reaction-tip");
      if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
    } catch (eRt) {}
  }
  function serializeRichInput(el) {
    var api = wtComposerApiSafe();
    if (api && typeof api.serializeRichInput === "function") return api.serializeRichInput(el);
    if (!el) return "";
    try {
      if (el.isContentEditable || (el.getAttribute && el.getAttribute("contenteditable"))) {
        return String(el.innerText || el.textContent || "").replace(/\u00a0/g, " ");
      }
    } catch (eSer) {}
    return String(el.value || "");
  }
  function fillRichInput(el, text) {
    var api = wtComposerApiSafe();
    if (api && typeof api.fillRichInput === "function") {
      api.fillRichInput(el, text);
      return;
    }
    if (!el) return;
    var s = String(text || "");
    try {
      if (el.isContentEditable || (el.getAttribute && el.getAttribute("contenteditable"))) {
        el.textContent = s;
        try {
          el.classList.toggle("is-empty", !s);
        } catch (eCls) {}
        return;
      }
    } catch (eFill) {}
    try {
      el.value = s;
    } catch (eVal) {}
  }
  function applyMentionPick(item) {
    var api = wtComposerApiSafe();
    if (api && typeof api.applyMentionPick === "function") api.applyMentionPick(item);
  }
  function applyCommandPick(item) {
    var api = wtComposerApiSafe();
    if (api && typeof api.applyCommandPick === "function") api.applyCommandPick(item);
  }
  function renderMentionMenu() {
    var api = wtComposerApiSafe();
    if (api && typeof api.renderMentionMenu === "function") api.renderMentionMenu();
  }
  function renderCommandMenu() {
    var api = wtComposerApiSafe();
    if (api && typeof api.renderCommandMenu === "function") api.renderCommandMenu();
  }
  function syncFloatingMenus() {
    var api = wtComposerApiSafe();
    if (api && typeof api.syncFloatingMenus === "function") api.syncFloatingMenus();
  }

  function dismissFloatingUi() {
    closeAllCatDd();
    try {
      closeTicketHeadMenus();
    } catch (eHm) {}
    try {
      closeTicketMsgMenus();
    } catch (eMm) {}
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
      main.classList.toggle("vc-wt-main--active", Boolean(state.selectedId || state.composeOpen));
      main.innerHTML = chatPaneHtml();
      wireChatPaneOnly();
      refreshListActiveState();
      if (state.selectedId) scrollChatBottom(true);
    });
  }

  function renderShell() {
    withPageScrollPreserved(function () {
      dismissFloatingUi();
      hideStatusToast();
      clearTicketsBusyState();
      ensureTicketsPageVisible();
      var app = byId("vc-wt-app");
      if (!app) return;
      app.hidden = false;
      app.innerHTML =
        '<div class="vc-wt-chrome">' +
        scopeSwitcherHtml() +
        filtersHtml() +
        '<div class="vc-wt-layout">' +
        '<aside id="vc-wt-sidebar" class="vc-wt-sidebar">' +
        '<div id="vc-wt-list" class="vc-wt-list">' +
        ticketListHtml() +
        "</div>" +
        '<div id="vc-wt-pager-wrap">' +
        ticketListPagerHtml() +
        "</div></aside>" +
        '<section class="vc-wt-main' +
        (state.selectedId || state.composeOpen ? " vc-wt-main--active" : "") +
        '">' +
        chatPaneHtml() +
        "</section></div></div>";
      wireAll();
      /* ticketsUiPack1: sticky filtri dopo paint (MO da solo poteva arrivare prima) */
      try {
        document.dispatchEvent(new CustomEvent("vc:tickets-ready"));
      } catch (eReady) {}
      try {
        if (window.VcStickyChrome && typeof window.VcStickyChrome.scan === "function") {
          window.VcStickyChrome.scan();
        }
      } catch (eScan) {}
      window.setTimeout(function () {
        try {
          if (window.VcStickyChrome && typeof window.VcStickyChrome.scan === "function") {
            window.VcStickyChrome.scan();
          }
        } catch (eScan2) {}
      }, 120);
      if (state.selectedId) scrollChatBottom(true);
      markTicketsListPainted();
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
    /* ticketFilterOpenPhone1: delegation (remount lista/filtri non perde i click su telefono) */
    /* ticketHeadUi1: arma subito (anche al primo boot prima di renderShell) */
    /* ticketUiPack2: pointerup + closest .vc-wt-item (click intermittenti su figli/overlay) */
    if (state.listClickDelegated) return;
    state.listClickDelegated = true;
    function onListPick(ev) {
      if (typeof ev.button === "number" && ev.button !== 0) return;
      var t = ev.target;
      if (!t || !t.closest) return;
      var btn = t.closest(".vc-wt-item[data-ticket-id]");
      if (!btn) return;
      var list = byId("vc-wt-list") || document.querySelector(".vc-wt-list");
      if (!list || !list.contains(btn)) return;
      var id = String(btn.getAttribute("data-ticket-id") || "").trim();
      if (!id) return;
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (eStop) {}
      try {
        document.documentElement.classList.remove("vc-header-account-open");
      } catch (eAcc) {}
      var y = pageScrollY();
      var listY = Number(list.scrollTop) || 0;
      var now = Date.now();
      if (
        state._listPickId === id &&
        now - (Number(state._listPickAt) || 0) < 280
      ) {
        return;
      }
      state._listPickId = id;
      state._listPickAt = now;
      /* ticketUiPack2: se stesso id ma chat ancora pending/vuota → forza reopen */
      if (
        state.selectedId === id &&
        state.detail &&
        !(state.detail._openPending) &&
        state.messages &&
        state.messages.length
      ) {
        refreshListActiveState();
        restorePageScroll(y);
        return;
      }
      openTicket(id, true);
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
    }
    document.addEventListener("click", onListPick, true);
  }
  try {
    wireListClicks();
  } catch (eWireListEarly) {}

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
    /* ticketFilterPaint1: durante hard load aggiorna solo se non c'è skeleton (altrimenti lascia skel) */
    if (isTicketsListHardLoading()) {
      var listBusy = byId("vc-wt-list");
      if (listBusy && (listBusy.classList.contains("is-loading") || listBusy.querySelector(".vc-wt-skel-row"))) {
        return;
      }
    }
    var list = byId("vc-wt-list");
    if (list) {
      list.innerHTML = ticketListHtml();
      list.classList.remove("is-loading");
      try {
        list.removeAttribute("aria-busy");
      } catch (eA) {}
      wireListClicks();
      wireEmojiImgFallback(list);
    }
    var pager = byId("vc-wt-pager-wrap");
    if (pager) {
      pager.innerHTML = ticketListPagerHtml();
      wireListPager();
    }
  }

  function clearChatActionsBusyLocal() {
    try {
      document
        .querySelectorAll(".vc-wt-action[data-act], .vc-wt-head-menu__opt[data-act]")
        .forEach(function (b) {
          try {
            b.removeAttribute("aria-busy");
            b.disabled = false;
          } catch (eClr) {}
        });
    } catch (eAll) {}
  }

  function closeTicketHeadMenus(except) {
    try {
      document.querySelectorAll("[data-wt-head-menu].is-open").forEach(function (menu) {
        if (except && menu === except) return;
        menu.classList.remove("is-open");
        var btn = menu.querySelector("[data-wt-head-menu-toggle]");
        var panel = menu.querySelector(".vc-wt-head-menu__panel");
        if (btn) btn.setAttribute("aria-expanded", "false");
        if (panel) panel.hidden = true;
      });
    } catch (eClose) {}
  }

  function closeTicketMsgMenus(except) {
    try {
      document.querySelectorAll("[data-wt-msg-menu].is-open").forEach(function (menu) {
        if (except && menu === except) return;
        menu.classList.remove("is-open");
        var btn = menu.querySelector("[data-wt-msg-menu-toggle]");
        var panel = menu.querySelector(".vc-wt-msg-menu__panel");
        if (btn) btn.setAttribute("aria-expanded", "false");
        if (panel) panel.hidden = true;
      });
    } catch (eClose) {}
  }

  function wireTicketHeadMenu() {
    /* ticketHeadMenu1 + ticketUiPack2: tendina Azioni header + messaggi */
    if (window.__vcWtHeadMenuWired) return;
    window.__vcWtHeadMenuWired = 1;
    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var msgToggle = t.closest("[data-wt-msg-menu-toggle]");
        if (msgToggle) {
          var msgMenu = msgToggle.closest("[data-wt-msg-menu]");
          if (!msgMenu) return;
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch (eStopM) {}
          var msgOpen = !msgMenu.classList.contains("is-open");
          closeTicketMsgMenus(msgOpen ? msgMenu : null);
          closeTicketHeadMenus();
          var msgPanel = msgMenu.querySelector(".vc-wt-msg-menu__panel");
          if (msgOpen) {
            msgMenu.classList.add("is-open");
            msgToggle.setAttribute("aria-expanded", "true");
            if (msgPanel) msgPanel.hidden = false;
          } else {
            msgMenu.classList.remove("is-open");
            msgToggle.setAttribute("aria-expanded", "false");
            if (msgPanel) msgPanel.hidden = true;
          }
          return;
        }
        if (t.closest(".vc-wt-msg-menu__opt")) {
          closeTicketMsgMenus();
          return;
        }
        var toggle = t.closest("[data-wt-head-menu-toggle]");
        if (toggle) {
          var menu = toggle.closest("[data-wt-head-menu]");
          if (!menu) return;
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch (eStop) {}
          var open = !menu.classList.contains("is-open");
          closeTicketHeadMenus(open ? menu : null);
          closeTicketMsgMenus();
          var panel = menu.querySelector(".vc-wt-head-menu__panel");
          if (open) {
            menu.classList.add("is-open");
            toggle.setAttribute("aria-expanded", "true");
            if (panel) panel.hidden = false;
          } else {
            menu.classList.remove("is-open");
            toggle.setAttribute("aria-expanded", "false");
            if (panel) panel.hidden = true;
          }
          return;
        }
        if (t.closest(".vc-wt-head-menu__opt[data-act]")) {
          closeTicketHeadMenus();
          return;
        }
        if (!t.closest("[data-wt-head-menu]")) closeTicketHeadMenus();
        if (!t.closest("[data-wt-msg-menu]")) closeTicketMsgMenus();
      },
      true,
    );
  }
  try {
    wireTicketHeadMenu();
  } catch (eHeadMenu) {}

  /* ticketActBridge1: postAction/rate vivono nel chunk composer — bridge + clear busy se manca */
  function postAction(suffix, body, preservedScrollY) {
    return ensureWtComposerChunk()
      .then(function () {
        var api = wtComposerApi();
        if (api && typeof api.postAction === "function") {
          return api.postAction(suffix, body, preservedScrollY);
        }
        clearChatActionsBusyLocal();
        state.busy = false;
        setStatus("Modulo azioni non pronto. Ricarica la pagina.", true);
      })
      .catch(function () {
        clearChatActionsBusyLocal();
        state.busy = false;
        setStatus("Modulo azioni non pronto. Ricarica la pagina.", true);
      });
  }
  function submitTicketRating() {
    return ensureWtComposerChunk()
      .then(function () {
        var api = wtComposerApi();
        if (api && typeof api.submitTicketRating === "function") {
          return api.submitTicketRating();
        }
        clearChatActionsBusyLocal();
        state.busy = false;
        setStatus("Modulo valutazione non pronto. Ricarica la pagina.", true);
      })
      .catch(function () {
        clearChatActionsBusyLocal();
        state.busy = false;
        setStatus("Modulo valutazione non pronto. Ricarica la pagina.", true);
      });
  }

  function wireChatActions() {
    /* ticketActionFail1 + ticketPhoneBtnFix1 + ticketActBridge1 */
    document.querySelectorAll("[data-act]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      /* ticketPhoneBtnFix1: su touch lock immediato anti double-tap — SOLO azioni immediate
         (overlay/dialog: pointerdown busy lasciava rotella forever se cancel/errore) */
      btn.addEventListener(
        "pointerdown",
        function () {
          var act = btn.getAttribute("data-act");
          if (!act || act === "compose" || act === "cancel-compose" || act === "load-older-msgs") return;
          if (state.busy) return;
          var opensOverlay =
            act === "close" ||
            act === "close-request" ||
            act === "add-user" ||
            act === "remove-user" ||
            act === "switch-cat" ||
            act === "rename" ||
            act === "transfer" ||
            act === "rate-ticket";
          if (opensOverlay) return;
          try {
            btn.setAttribute("aria-busy", "true");
          } catch (eBusy) {}
        },
        { passive: true },
      );
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
        /* ticketActBridge1: overlay → togli busy subito (dialog/cancel non passa da postAction.finally) */
        if (opensOverlay) clearChatActionsBusyLocal();
        var run = function () {
        if (act === "compose") {
          clearChatActionsBusyLocal();
          if (!getToken()) {
            if (window.VcLoginRequired && typeof window.VcLoginRequired.require === "function") {
              window.VcLoginRequired.require({
                title: "Nuovo ticket",
                sub: "Tickets",
                body: "Accedi con Discord per aprire un ticket.",
              });
            }
            return;
          }
          var openCompose = function () {
            state.composeOpen = true;
            clearTicketSelection();
            state.composeOpen = true;
            renderShell();
          };
          /* ticketPushGate1: staff skip; utenti devono attivare push */
          if (isStaffMode) {
            openCompose();
            return;
          }
          if (
            window.VcTicketsPushGate &&
            typeof window.VcTicketsPushGate.ensureReady === "function"
          ) {
            window.VcTicketsPushGate.ensureReady().then(function (ok) {
              if (ok) openCompose();
            });
            return;
          }
          openCompose();
          return;
        }
        if (act === "cancel-compose") {
          clearChatActionsBusyLocal();
          state.composeOpen = false;
          renderShell();
          return;
        }
        /* perfRoiPack2: espandi window messaggi (load older) */
        if (act === "load-older-msgs") {
          clearChatActionsBusyLocal();
          try {
            var logEl = byId("vc-wt-chat-log");
            var prevH = logEl ? Number(logEl.scrollHeight) || 0 : 0;
            var prevTop = logEl ? Number(logEl.scrollTop) || 0 : 0;
            var curStart = Number.isFinite(state._msgWinStart) ? state._msgWinStart : 0;
            state._msgWinStart = Math.max(0, curStart - 80);
            renderShell();
            window.requestAnimationFrame(function () {
              try {
                var log2 = byId("vc-wt-chat-log");
                if (!log2) return;
                var nextH = Number(log2.scrollHeight) || 0;
                log2.scrollTop = Math.max(0, prevTop + (nextH - prevH));
              } catch (eScr) {}
            });
          } catch (eOlder) {}
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
              if (reason === null) {
                clearChatActionsBusyLocal();
                return;
              }
              return postAction("/close", { reason: reason }, y);
            });
            return;
          }
          askCloseConfirm().then(function (ok) {
            restorePageScroll(y);
            if (ok) return postAction("/close", null, y);
            clearChatActionsBusyLocal();
          });
          return;
        }
        if (act === "add-user") {
          pickTicketUser({
            title: "Aggiungi utente",
            message: "Cerca e scegli chi aggiungere a questo ticket.",
            guildSearch: true,
          }).then(function (userId) {
            restorePageScroll(y);
            if (userId) postAction("/members", { userId: userId }, y);
            else clearChatActionsBusyLocal();
          });
          return;
        }
        if (act === "remove-user") {
          pickAddedUser().then(function (userId) {
            restorePageScroll(y);
            if (userId) postAction("/members/remove", { userId: userId }, y);
            else clearChatActionsBusyLocal();
          });
          return;
        }
        if (act === "switch-cat") {
          pickTicketCategory().then(function (category) {
            restorePageScroll(y);
            if (category) postAction("/category", { category: category }, y);
            else clearChatActionsBusyLocal();
          });
          return;
        }
        if (act === "rename") {
          askRenameSubject().then(function (subject) {
            restorePageScroll(y);
            if (subject) postAction("/rename", { subject: subject }, y);
            else clearChatActionsBusyLocal();
          });
          return;
        }
        if (act === "close-request") {
          askCloseRequestReason().then(function (reason) {
            restorePageScroll(y);
            if (reason === null) {
              clearChatActionsBusyLocal();
              return;
            }
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
            else clearChatActionsBusyLocal();
          });
          return;
        }
        if (act === "close-accept") return postAction("/close-request/accept", null, y);
        if (act === "close-reject") return postAction("/close-request/reject", null, y);
        clearChatActionsBusyLocal();
        };
        /* ticketDialogScrollFight1: overlay/dialog → no restore immediato (combatte col pin) */
        try {
          if (opensOverlay) {
            run();
          } else {
            withPageScrollPreserved(run);
            restorePageScroll(y);
          }
        } catch (eRun) {
          clearChatActionsBusyLocal();
          state.busy = false;
          setStatus("Azione non riuscita. Riprova.", true);
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
        maxLength: 4000,
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
          guildSearch: true,
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
              avatarHtml(u.avatarUrl, u.name, "vc-wt-user-pick__av", u.id) +
              "<span><strong>" +
              esc(u.name || "Utente") +
              "</strong><small>" +
              esc(u.username || u.id) +
              "</small></span></button>"
            );
          })
          .join("");
        wakeTicketAvatars(list);
        window.requestAnimationFrame(function () {
          wakeTicketAvatars(list);
        });
      }
      function search(q) {
        var url =
          apiBase() +
          "/mentions?kind=users&q=" +
          encodeURIComponent(q || "") +
          "&ticketId=" +
          encodeURIComponent(state.selectedId || "");
        if (opts.claimEligible) url += "&claimEligible=1";
        /* ticketAddUserSearch1: cerca in guild, non solo partecipanti ticket */
        if (opts.guildSearch) url += "&guildSearch=1";
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

  /* ticketsComposerLazy1: composer/interact → web-tickets-page-composer.js */
  function ensureWtComposerHost() {
    if (window.__VC_WT_COMPOSER_HOST && window.__VC_WT_COMPOSER_HOST.__vcReady) {
      return window.__VC_WT_COMPOSER_HOST;
    }
    var host = {
      __vcReady: 1,
      state: state,
      addComposerMediaFiles: addComposerMediaFiles,
      apiActionFailed: apiActionFailed,
      apiBase: apiBase,
      apiErrorText: apiErrorText,
      appendMessage: appendMessage,
      authHeaders: authHeaders,
      avatarHtml: avatarHtml,
      byId: byId,
      capturePageScrollY: capturePageScrollY,
      chatHeadHtml: chatHeadHtml,
      refreshChatChrome: refreshChatChrome,
      clearReplyTarget: clearReplyTarget,
      composerHtml: composerHtml,
      composerLockedReason: composerLockedReason,
      dismissFloatingUi: dismissFloatingUi,
      effectivePermissions: effectivePermissions,
      esc: esc,
      fetchJson: fetchJson,
      getToken: getToken,
      jumpToMessage: jumpToMessage,
      mergeTicketDetail: mergeTicketDetail,
      messageHtml: messageHtml,
      pulseTicketTyping: pulseTicketTyping,
      queueContentResolve: queueContentResolve,
      ratingDockHtml: ratingDockHtml,
      readComposerContext: readComposerContext,
      refreshChatLogMarkup: refreshChatLogMarkup,
      refreshChatPane: refreshChatPane,
      refreshListPane: refreshListPane,
      refreshTicketInList: refreshTicketInList,
      rememberMentionName: rememberMentionName,
      rememberStaffRole: rememberStaffRole,
      renderPreviews: renderPreviews,
      renderShell: renderShell,
      resolveMentionName: resolveMentionName,
      restorePageScroll: restorePageScroll,
      runPartnershipCommandFlow: runPartnershipCommandFlow,
      saveTicketComposerDraft: saveTicketComposerDraft,
      scheduleComposerLivePreview: scheduleComposerLivePreview,
      scheduleComposerSuggest: scheduleComposerSuggest,
      scheduleSaveTicketComposerDraft: scheduleSaveTicketComposerDraft,
      scrollChatBottom: scrollChatBottom,
      sendMessage: sendMessage,
      setStatus: setStatus,
      startReplyToMessage: startReplyToMessage,
      stillDiscordMediaUrl: stillDiscordMediaUrl,
      freezeTicketsAnimatedMedia: freezeTicketsAnimatedMedia,
      syncComposerAutosize: syncComposerAutosize,
      syncComposerReplyBar: syncComposerReplyBar,
      wakeTicketAvatars: wakeTicketAvatars,
      wireChatActions: wireChatActions,
      wireEmojiImgFallback: wireEmojiImgFallback,
      withPageScrollPreserved: withPageScrollPreserved,
      ensureTicketsEmojiMaps: ensureTicketsEmojiMaps,
      _api: null,
      install: function (api) {
        host._api = api || null;
        try { window.__vcWtComposerApi = api; } catch (eA) {}
      },
    };
    window.__VC_WT_COMPOSER_HOST = host;
    return host;
  }
  function ensureEmojiPickerScript() {
    if (window.VcEmojiPicker) return Promise.resolve(window.VcEmojiPicker);
    if (window.__vcEmojiPickerLoading) return window.__vcEmojiPickerLoading;
    window.__vcEnsureEmojiPickerScript = ensureEmojiPickerScript;
    window.__vcEmojiPickerLoading = new Promise(function (resolve, reject) {
      var ver = "20261009emojiAnchorPos1";
      try {
        var m = window.__VC_ASSET_VERS;
        if (m && m.EMOJI_PICKER_VER) ver = String(m.EMOJI_PICKER_VER);
      } catch (eV) {}
      var existing = document.querySelector('script[src*="vc-emoji-picker"]');
      if (existing) {
        var tries = 0;
        var poll = setInterval(function () {
          tries += 1;
          if (window.VcEmojiPicker) {
            clearInterval(poll);
            window.__vcEmojiPickerLoading = null;
            resolve(window.VcEmojiPicker);
            return;
          }
          if (tries >= 80) {
            clearInterval(poll);
            window.__vcEmojiPickerLoading = null;
            reject(new Error("emoji-picker"));
          }
        }, 50);
        return;
      }
      var s = document.createElement("script");
      s.src = "/js/vc-emoji-picker.js?v=" + ver;
      s.async = true;
      s.onload = function () {
        window.__vcEmojiPickerLoading = null;
        resolve(window.VcEmojiPicker || null);
      };
      s.onerror = function () {
        window.__vcEmojiPickerLoading = null;
        reject(new Error("emoji-picker"));
      };
      (document.body || document.documentElement).appendChild(s);
    });
    return window.__vcEmojiPickerLoading;
  }

  function ensureWtComposerChunk() {
    if (
      window.__VC_WT_COMPOSER_CHUNK === "20261020ticketStaffOpenTag1" ||
      window.__VC_WT_COMPOSER_CHUNK === "20261020ticketUiPack2" ||
      window.__VC_WT_COMPOSER_CHUNK === "20261020ticketHeadMenu1" ||
      window.__VC_WT_COMPOSER_CHUNK === "20261020ticketHeadUi1" ||
      window.__VC_WT_COMPOSER_CHUNK === "20261020ticketNetFalseToast1" ||
      window.__VC_WT_COMPOSER_CHUNK === "20261019ticketActBridge1"
    ) {
      return Promise.resolve(window.__vcWtComposerApi || null);
    }
    if (window.__vcWtComposerApi) {
      return Promise.resolve(window.__vcWtComposerApi);
    }
    if (window.__vcWtComposerLoading) return window.__vcWtComposerLoading;
    ensureWtComposerHost();
    window.__vcWtComposerLoading = new Promise(function (resolve, reject) {
      var ver = "20261020ticketStaffOpenTag1";
      try {
        var m = window.__VC_ASSET_VERS;
        if (m && m.WT_COMPOSER_VER) ver = String(m.WT_COMPOSER_VER);
      } catch (eV) {}
      var tried = {};
      function loadOne(v, fallbacks) {
        if (tried[v]) {
          if (fallbacks && fallbacks.length) return loadOne(fallbacks[0], fallbacks.slice(1));
          window.__vcWtComposerLoading = null;
          try {
            console.warn("[vc] wt-composer chunk failed");
          } catch (eW) {}
          reject(new Error("wt-composer"));
          return;
        }
        tried[v] = 1;
        var s = document.createElement("script");
        s.src = "/js/web-tickets-page-composer." + v + ".js?v=" + v;
        s.async = true;
        s.onload = function () {
          window.__vcWtComposerLoading = null;
          resolve(window.__vcWtComposerApi || null);
        };
        s.onerror = function () {
          try {
            if (s.parentNode) s.parentNode.removeChild(s);
          } catch (eRm) {}
          var next = fallbacks && fallbacks.length ? fallbacks.slice() : [];
          if (next.length) loadOne(next[0], next.slice(1));
          else {
            window.__vcWtComposerLoading = null;
            try {
              console.warn("[vc] wt-composer chunk failed");
            } catch (eW2) {}
            reject(new Error("wt-composer"));
          }
        };
        (document.body || document.documentElement).appendChild(s);
      }
      loadOne(ver, [
        "20261020ticketUiPack2",
        "20261020ticketHeadMenu1",
        "20261020ticketHeadUi1",
      ]);
    });
    return window.__vcWtComposerLoading;
  }

  function armComposerLazyOnInteract() {
    if (window.__vcWtComposerArm) return;
    window.__vcWtComposerArm = 1;
    function wake() {
      try {
        ensureWtComposerChunk().catch(function () {});
      } catch (eC) {}
      try {
        ensureEmojiPickerScript().catch(function () {});
      } catch (eP) {}
    }
    document.addEventListener(
      "pointerdown",
      function (ev) {
        try {
          var t = ev.target;
          if (!t || !t.closest) return;
          if (
            t.closest(
              "#vc-wt-composer, .vc-wt-composer, [data-react-add], [data-msg-edit], [data-vc-emoji-open], .vc-wt-composer__emoji",
            )
          ) {
            wake();
          }
        } catch (ePd) {}
      },
      true,
    );
    document.addEventListener(
      "focusin",
      function (ev) {
        try {
          var t = ev.target;
          if (!t || !t.closest) return;
          if (t.closest("#vc-wt-composer, .vc-wt-composer")) wake();
        } catch (eFi) {}
      },
      true,
    );
  }
  function wtComposerApi() {
    return (
      (window.__VC_WT_COMPOSER_HOST && window.__VC_WT_COMPOSER_HOST._api) ||
      window.__vcWtComposerApi ||
      null
    );
  }
  function ensureGuildEmojis() {
    return ensureWtComposerChunk().then(function () {
      var api = wtComposerApi();
      if (api && typeof api.ensureGuildEmojis === "function") return api.ensureGuildEmojis();
      return [];
    });
  }
  function refreshEmojiDependentUi() {
    var api = wtComposerApi();
    if (api && typeof api.refreshEmojiDependentUi === "function") return api.refreshEmojiDependentUi();
    return ensureWtComposerChunk().then(function () {
      var a2 = wtComposerApi();
      if (a2 && a2.refreshEmojiDependentUi) a2.refreshEmojiDependentUi();
    });
  }
  function openEmojiPicker(anchor, onPick, preferCustom) {
    return ensureEmojiPickerScript()
      .catch(function () {
        return null;
      })
      .then(function () {
        return ensureWtComposerChunk();
      })
      .then(function () {
        var api = wtComposerApi();
        if (api && typeof api.openEmojiPicker === "function") {
          return api.openEmojiPicker(anchor, onPick, preferCustom);
        }
      });
  }
  function wireMessageReactions(scope) {
    return ensureWtComposerChunk()
      .then(function () {
        var api = wtComposerApi();
        if (api && typeof api.wireMessageReactions === "function") api.wireMessageReactions(scope);
      })
      .catch(function () {});
  }
  function wireMessageTools(scope) {
    armMsgToolsDelegation();
    return ensureWtComposerChunk()
      .then(function () {
        var api = wtComposerApi();
        if (api && typeof api.wireMessageTools === "function") api.wireMessageTools(scope);
      })
      .catch(function () {});
  }

  /* ticketsMsgRailCpu1: delegation sync (reply/jump) + chunk per edit/del/react — no dipendenza da wire async */
  function armMsgToolsDelegation() {
    if (window.__vcWtMsgToolsDelegated) return;
    window.__vcWtMsgToolsDelegated = 1;
    document.addEventListener(
      "click",
      function (ev) {
        try {
          var t = ev.target;
          if (!t || !t.closest) return;
          if (!t.closest("#vc-wt-app, .vc-wt-chat, #vc-wt-chat-log")) return;
          /* ticketsChatSpoiler1: toggle spoiler sync (non aspetta chunk composer) */
          var spoiler = t.closest("[data-wt-spoiler], .vc-wt-md-spoiler");
          if (spoiler && spoiler.closest("#vc-wt-chat-log, .vc-wt-chat__log")) {
            if (t.closest("a") && spoiler.classList.contains("is-open")) return;
            ev.preventDefault();
            ev.stopPropagation();
            spoiler.classList.toggle("is-open");
            return;
          }
          var reply = t.closest("[data-msg-reply]");
          if (reply) {
            ev.preventDefault();
            ev.stopPropagation();
            startReplyToMessage(reply.getAttribute("data-msg-reply"));
            return;
          }
          var jump = t.closest("[data-jump-msg]");
          if (jump) {
            ev.preventDefault();
            ev.stopPropagation();
            jumpToMessage(jump.getAttribute("data-jump-msg"));
            return;
          }
          var copy = t.closest("[data-msg-copy]");
          var edit = t.closest("[data-msg-edit]");
          var del = t.closest("[data-msg-del]");
          var react = t.closest("[data-react-emoji]");
          var reactAdd = t.closest("[data-react-add]");
          if (!(copy || edit || del || react || reactAdd)) return;
          ev.preventDefault();
          ev.stopPropagation();
          ensureWtComposerChunk()
            .then(function () {
              var api = wtComposerApi();
              if (!api) return;
              if (copy && typeof api.copyMessageText === "function") {
                api.copyMessageText(copy.getAttribute("data-msg-copy"));
                return;
              }
              if (edit && typeof api.startEditMessage === "function") {
                api.startEditMessage(edit.getAttribute("data-msg-edit"));
                return;
              }
              if (del && typeof api.deleteMessage === "function") {
                api.deleteMessage(del.getAttribute("data-msg-del"));
                return;
              }
              if (react && typeof api.toggleReaction === "function") {
                var msgEl = react.closest("[data-msg-id]");
                var mid = msgEl && msgEl.getAttribute("data-msg-id");
                var emoji = react.getAttribute("data-react-emoji");
                if (mid && emoji) api.toggleReaction(mid, emoji);
                return;
              }
              if (reactAdd && typeof api.openEmojiPicker === "function") {
                var midAdd = reactAdd.getAttribute("data-react-add");
                api.openEmojiPicker(
                  reactAdd,
                  function (pick) {
                    if (!pick || !pick.markup || !midAdd) return;
                    if (typeof api.toggleReaction === "function") api.toggleReaction(midAdd, pick.markup);
                  },
                  true,
                );
              }
            })
            .catch(function () {});
        } catch (eDel) {}
      },
      true,
    );
  }
  function wireComposer() {
    return ensureWtComposerChunk().then(function () {
      var api = wtComposerApi();
      if (api && typeof api.wireComposer === "function") api.wireComposer();
    });
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
          var errMsg = apiErrorText(out.data && out.data.message, "Comando fallito.");
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
          setStatus(apiErrorText(out.data && out.data.message, "Invio fallito."), true);
          focusComposerSoon();
          return;
        }
        if (out.data.claimMessage) appendMessage(out.data.claimMessage, out.data.ticket);
        if (out.data.message) appendMessage(out.data.message, out.data.ticket);
        else if (!out.data.claimMessage && out.data.ticket) refreshTicketInList(out.data.ticket);
        try {
          if (state.detailEtags && state.selectedId) delete state.detailEtags[state.selectedId];
          state.listEtags = {};
        } catch (eEt) {}
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
    var runCreate = function () {
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
            /* ticketPushApi1: API rifiuta senza push → riapri tutorial */
            if (out.data && out.data.error === "push_required") {
              setStatus(apiErrorText(out.data.message, "Attiva le notifiche push per aprire un ticket."), true);
              if (
                window.VcTicketsPushGate &&
                typeof window.VcTicketsPushGate.ensureReady === "function"
              ) {
                window.VcTicketsPushGate.ensureReady().then(function (ok) {
                  if (ok) createTicket(categoryId);
                });
              }
              return;
            }
            setStatus(apiErrorText(out.data && out.data.message, "Creazione fallita."), true);
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
    };
    if (isStaffMode) {
      runCreate();
      return;
    }
    if (
      window.VcTicketsPushGate &&
      typeof window.VcTicketsPushGate.ensureReady === "function"
    ) {
      window.VcTicketsPushGate.ensureReady().then(function (ok) {
        if (ok) runCreate();
      });
      return;
    }
    runCreate();
  }

  function wireAll() {
    /* ticketFilterReload1: filtri via delegation (niente rebind multiplo su remount) */
    wireFilterDelegation();
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
      /* ticketMentionTab1: Tab/Enter anche se focus non è sul composer */
      document.addEventListener(
        "keydown",
        function (ev) {
          function activeIdx(menuId, attr, fallback) {
            var menu = byId(menuId);
            var active = menu && menu.querySelector(".is-active[" + attr + "]");
            if (active) {
              var i = Number(active.getAttribute(attr));
              if (Number.isFinite(i) && i >= 0) return i;
            }
            return Math.max(0, Number(fallback) || 0);
          }
          if (state.commandMenu.open && state.commandMenu.items.length) {
            if (ev.key === "Tab" || ev.key === "Enter") {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              state.commandMenu.index = activeIdx(
                "vc-wt-command-menu",
                "data-cmd-idx",
                state.commandMenu.index,
              );
              applyCommandPick(state.commandMenu.items[state.commandMenu.index]);
              return;
            }
            if (ev.key === "ArrowDown") {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              state.commandMenu.index = (state.commandMenu.index + 1) % state.commandMenu.items.length;
              renderCommandMenu();
              return;
            }
            if (ev.key === "ArrowUp") {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              state.commandMenu.index =
                (state.commandMenu.index - 1 + state.commandMenu.items.length) %
                state.commandMenu.items.length;
              renderCommandMenu();
              return;
            }
            if (ev.key === "Escape") {
              ev.preventDefault();
              hideCommandMenu();
              return;
            }
          }
          if (state.mentionMenu.open && state.mentionMenu.items.length) {
            if (ev.key === "Tab" || ev.key === "Enter") {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              state.mentionMenu.index = activeIdx(
                "vc-wt-mention-menu",
                "data-mention-idx",
                state.mentionMenu.index,
              );
              applyMentionPick(state.mentionMenu.items[state.mentionMenu.index]);
              return;
            }
            if (ev.key === "ArrowDown") {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              state.mentionMenu.index = (state.mentionMenu.index + 1) % state.mentionMenu.items.length;
              renderMentionMenu();
              return;
            }
            if (ev.key === "ArrowUp") {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              state.mentionMenu.index =
                (state.mentionMenu.index - 1 + state.mentionMenu.items.length) %
                state.mentionMenu.items.length;
              renderMentionMenu();
              return;
            }
            if (ev.key === "Escape") {
              ev.preventDefault();
              hideMentionMenu();
            }
          } else if (state.mentionMenu.open && ev.key === "Tab") {
            ev.preventDefault();
            ev.stopImmediatePropagation();
          }
        },
        true,
      );
    }
    if (!state.floatMenuScrollWired) {
      state.floatMenuScrollWired = true;
      /* pickerFloatFix1: riposiziona su scroll pagina; skip solo scroll interno al menu */
      function onFloatMenuViewportChange(ev) {
        if (!(state.mentionMenu.open || state.commandMenu.open)) return;
        try {
          var t = ev && ev.target;
          if (
            t &&
            t !== window &&
            t !== document &&
            t !== document.documentElement &&
            t !== document.body &&
            t.closest &&
            (t.closest("#vc-wt-mention-menu") || t.closest("#vc-wt-command-menu"))
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
    wireViewModeSwitcher();
    wireFilterDelegation();
    wireListClicks();
    wireListPager();
    wireChatActions();
    wireComposer();
    wireOpenCatCards();
    wireRatingPanel();
    wireMessageReactions(document);
    wireMessageTools(document);
    void ensureGuildEmojis();
    /* loadSyncPack1: auto load-older when chat log scrolled near top */
    (function () {
      var logEl = byId("vc-wt-chat-log");
      if (!logEl) return;
      logEl.addEventListener("scroll", function onChatLogScroll() {
        /* chatOpenBottom1: durante pin open scrollTop parte da 0 → non espandere window */
        if (Date.now() < _chatPinBottomUntil) return;
        if (Number(logEl.scrollTop) >= 80) return;
        var curStart = Number.isFinite(state._msgWinStart) ? state._msgWinStart : 0;
        if (curStart <= 0) return;
        if (_chatScrollOlderT) return;
        _chatScrollOlderT = window.setTimeout(function () {
          _chatScrollOlderT = 0;
          if (Date.now() < _chatPinBottomUntil) return;
          var logNow = byId("vc-wt-chat-log");
          if (!logNow) return;
          if (Number(logNow.scrollTop) >= 80) return;
          var prevH = Number(logNow.scrollHeight) || 0;
          var prevTop = Number(logNow.scrollTop) || 0;
          var cs = Number.isFinite(state._msgWinStart) ? state._msgWinStart : 0;
          if (cs <= 0) return;
          state._msgWinStart = Math.max(0, cs - 80);
          /* ticketsLagHard1: solo chat pane — renderShell rimontava lista+filtri a ogni load-older */
          refreshChatPane();
          window.requestAnimationFrame(function () {
            try {
              var log2 = byId("vc-wt-chat-log");
              if (!log2) return;
              var nextH = Number(log2.scrollHeight) || 0;
              log2.scrollTop = Math.max(0, prevTop + (nextH - prevH));
            } catch (eScr) {}
          });
        }, 320);
      }, { passive: true });
    })();
  }

  function onFilterChipClick(btn) {
    /* ticketFilterReload1 + ticketCatFilter1 + ticketFilterPaint1 */
    var nextFilter = btn.getAttribute("data-filter");
    var nextCat = btn.getAttribute("data-cat-filter");
    var changed = false;
    if (nextFilter != null) {
      var f = String(nextFilter || "all");
      if (f !== String(state.filter || "all")) {
        state.filter = f;
        changed = true;
      }
    }
    if (btn.hasAttribute("data-cat-filter")) {
      var c = String(nextCat || "");
      if (c !== String(state.categoryFilter || "")) {
        state.categoryFilter = c;
        changed = true;
      }
    }
    if (!changed) {
      /* click ripetuto → riallinea chip; non killare un load già in volo */
      syncTicketsChrome();
      if (!isTicketsListHardLoading()) clearTicketsBusyState();
      return;
    }
    state.listPage = 1;
    clearTicketSelection();
    /* ticketFilterPaint1: paint ottimistico subito, MAI wipe tickets=[] (lasciava lista vuota se fetch scartata) */
    var optimistic = (Array.isArray(state.tickets) ? state.tickets : []).filter(function (t) {
      return ticketMatchesCurrentList(t);
    });
    state.tickets = optimistic;
    try {
      refreshListPane();
    } catch (eOpt) {}
    invalidateTicketsListInflight();
    syncTicketsChrome();
    focusTicketsBoardTop();
    var needShell = optimistic.length === 0;
    void loadList({ soft: !needShell, forceShell: needShell, skipOpen: true }).then(function (ok) {
      clearTicketsBusyState();
      try {
        if (ok) {
          var listEl = byId("vc-wt-list");
          if (!listEl || listEl.querySelector(".vc-wt-skel-row") || listEl.classList.contains("is-loading")) {
            renderShell();
          } else {
            refreshListPane();
          }
        } else if (!Array.isArray(state.tickets) || !state.tickets.length) {
          /* fetch fallita e lista vuota → riprova hard una volta */
          void loadList({ soft: false, forceShell: true, skipOpen: true }).then(function () {
            clearTicketsBusyState();
            syncTicketsChrome();
            try {
              renderShell();
            } catch (eRe) {}
          });
          return;
        }
      } catch (ePaint) {
        try {
          renderShell();
        } catch (ePaint2) {}
      }
      syncTicketsChrome();
      focusTicketsBoardTop();
    });
  }

  function wireFilterDelegation() {
    if (state.filterDelegated) return;
    state.filterDelegated = true;
    document.addEventListener(
      "click",
      function (ev) {
        var btn =
          ev.target && ev.target.closest
            ? ev.target.closest("[data-filter], [data-cat-filter]")
            : null;
        if (!btn) return;
        var app = byId("vc-wt-app");
        if (!app || !app.contains(btn)) return;
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (eStop) {}
        onFilterChipClick(btn);
      },
      true,
    );
  }

  function onViewModeClick(btn) {
    var next = btn.getAttribute("data-view-mode") === "staff" ? "staff" : "user";
    /* ticketStaffProbe1: senza staffAccess ancora noto → prova load staff, non bounce immediato */
    if (next === "staff" && !hasStaffInboxAccess()) {
      snapshotScopeCache(state.viewMode === "staff" ? "staff" : "user");
      state.viewMode = "staff";
      state.viewPinnedByUser = "staff";
      state.listPage = 1;
      state.filter = "all";
      state.categoryFilter = "";
      state.openTicketSeq = (Number(state.openTicketSeq) || 0) + 1;
      invalidateTicketsListInflight({ keepEtags: true });
      writeTicketsViewUrl("staff");
      syncStaffMode();
      clearTicketSelection();
      state.detail = null;
      state.messages = [];
      state.tickets = [];
      state.listTotal = 0;
      state.listTotalPages = 1;
      state.listPage = 1;
      syncTicketsChrome();
      focusTicketsBoardTop();
      void loadList({ soft: false, forceShell: true, skipOpen: true }).then(function () {
        clearTicketsBusyState();
        if (!hasStaffInboxAccess()) {
          redirectAwayFromStaffView();
          return;
        }
        syncTicketsChrome();
      });
      sendTicketPresence({ force: true });
      return;
    }
    var cur = state.viewMode === "staff" ? "staff" : "user";
    /* ticketListStuckFix1: tab già attiva → quiet refresh (no hard reload loop / spinner stuck) */
    if (next === cur) {
      clearTicketsBusyState();
      syncTicketsChrome();
      if (Array.isArray(state.tickets) && state.tickets.length) {
        void scheduleLoadListQuiet();
      } else {
        void loadList({ soft: false, forceShell: true, skipOpen: true });
      }
      return;
    }
    /* ticketSwitchFast1: salva scope corrente, paint cache se fresca, refresh soft in bg */
    snapshotScopeCache(cur);
    state.viewMode = next;
    state.viewPinnedByUser = next;
    state.listPage = 1;
    state.filter = "all";
    state.categoryFilter = "";
    state.openTicketSeq = (Number(state.openTicketSeq) || 0) + 1;
    invalidateTicketsListInflight({ keepEtags: true });
    writeTicketsViewUrl(next);
    syncStaffMode();
    clearTicketSelection();
    state.detail = null;
    state.messages = [];
    var hadCache = restoreScopeCache(next);
    if (!hadCache) {
      state.tickets = [];
      state.listTotal = 0;
      state.listTotalPages = 1;
      state.listPage = 1;
    }
    syncTicketsChrome();
    focusTicketsBoardTop();
    if (hadCache) {
      clearTicketsBusyState();
      try {
        renderShell();
      } catch (ePaint) {}
      void loadList({ soft: true, skipOpen: true }).then(function () {
        clearTicketsBusyState();
        syncTicketsChrome();
      });
      sendTicketPresence({ force: true });
      return;
    }
    void loadList({ soft: false, forceShell: true, skipOpen: true }).then(function () {
      clearTicketsBusyState();
      syncTicketsChrome();
      focusTicketsBoardTop();
      try {
        var appDone = byId("vc-wt-app");
        if (appDone && (appDone.querySelector(".vc-wt-skel-row") || appDone.getAttribute("aria-busy") === "true")) {
          renderShell();
        }
      } catch (eDone) {}
    });
    sendTicketPresence({ force: true });
  }

  function wireViewModeSwitcher() {
    /* ticketScopeClick2: un solo listener in capture — sopravvive ai remount skel/shell */
    if (state.viewModeDelegated) return;
    state.viewModeDelegated = true;
    document.addEventListener(
      "click",
      function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-view-mode]") : null;
        if (!btn) return;
        var app = byId("vc-wt-app");
        if (!app || !app.contains(btn)) return;
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (eStop) {}
        onViewModeClick(btn);
      },
      true,
    );
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

  /* consoleStormKill3 + consoleErrFix1 */
  function connectWs() {
    if (typeof WebSocket === "undefined") return;
    var url = wsUrl();
    if (!url) return;
    try {
      if (document.visibilityState === "hidden") {
        startPoll();
        return;
      }
    } catch (eVis) {}
    /* consoleStormKill3: non martellare WS durante cool-down 429 */
    try {
      if (typeof window.__vcWebhookGlobalBlockedUntil === "function") {
        var until = Number(window.__vcWebhookGlobalBlockedUntil() || 0);
        if (Date.now() < until) {
          var wait = Math.min(60000, Math.max(4000, until - Date.now() + 800));
          if (!state.wsReconnectTimer) {
            state.wsReconnectTimer = setTimeout(function () {
              state.wsReconnectTimer = null;
              connectWs();
            }, wait);
          }
          startPoll();
          return;
        }
      }
    } catch (eBlk) {}
    /* consoleErrFix1: se già aperto/connecting non riaprire (evita Failed WS in console) */
    try {
      if (state.ws && (state.ws.readyState === 0 || state.ws.readyState === 1)) return;
    } catch (eRs) {}
    disconnectWs();
    try {
      var ws = new WebSocket(url);
      state.ws = ws;
      state.lastWsEventAt = 0;
      state._wsFailStreak = 0;
      ws.onopen = function () {
        state.lastWsEventAt = Date.now();
        state._wsFailStreak = 0;
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
          if (type === "web_ticket_receipts") {
            if (data.ticketId && data.ticketId === state.selectedId) {
              applyReceiptsToOwnMessages(data.messageIds, data.readerId);
            }
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
        var streak = Number(state._wsFailStreak || 0) + 1;
        state._wsFailStreak = streak;
        var delay = Math.min(60000, 4000 * Math.pow(2, Math.min(4, streak - 1)));
        try {
          if (typeof window.__vcWebhookGlobalBlockedUntil === "function") {
            var until2 = Number(window.__vcWebhookGlobalBlockedUntil() || 0);
            if (Date.now() < until2) delay = Math.max(delay, until2 - Date.now() + 1000);
          }
        } catch (eD) {}
        if (!state.wsReconnectTimer) {
          state.wsReconnectTimer = setTimeout(function () {
            state.wsReconnectTimer = null;
            connectWs();
          }, delay);
        }
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
      clearTimeout(state.pollTimer);
      try {
        clearInterval(state.pollTimer);
      } catch (eClr) {}
      state.pollTimer = null;
    }
  }

  function runPollTick() {
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
    /* ticketsPerfPack1: con WS fresco alterna list/detail — niente doppio GET ogni tick */
    var fresh = wsFreshForQuietPoll();
    var tick = (state.pollTick = (Number(state.pollTick) || 0) + 1);
    if (!fresh) {
      void loadListQuiet();
      if (state.selectedId) void refreshDetailQuiet();
      return;
    }
    if (tick % 2 === 1) {
      void loadListQuiet();
    } else if (state.selectedId) {
      void refreshDetailQuiet();
    } else {
      void loadListQuiet();
    }
  }

  function startPoll() {
    /* ticketsMsgRailCpu1 #2: setTimeout chain — ricalcola intervallo a ogni tick */
    stopPoll();
    function scheduleNext() {
      state.pollTimer = setTimeout(function () {
        state.pollTimer = null;
        try {
          runPollTick();
        } catch (eTick) {}
        scheduleNext();
      }, ticketPollIntervalMs());
    }
    scheduleNext();
  }

  function scheduleLoadListQuiet() {
    /* ticketFilterReload1: era chiamato ma non definito → crash silenzioso su WS/refresh */
    if (state.listQuietTimer) clearTimeout(state.listQuietTimer);
    state.listQuietTimer = setTimeout(function () {
      state.listQuietTimer = null;
      void loadListQuiet();
    }, 250);
  }

  function loadListQuiet() {
    if (!getToken()) return Promise.resolve();
    /* ticketSwitchFreeze2: quiet solo se nessun hard load vivo (promise o aria-busy) */
    if (isTicketsListHardLoading() || state.listHardPromise) {
      var started = Number(state.listHardStartedAt || 0);
      var zombie = started && Date.now() - started > 12000;
      if (zombie || (!isTicketsListHardLoading() && !started)) {
        /* promise zombie (settled ma non nullata) o busy >12s → unlock */
        state.listHardPromise = null;
        state.listHardKey = "";
        state.listHardStartedAt = 0;
        clearTicketsBusyState();
      } else {
        return Promise.resolve();
      }
    }
    var quietGen = (state.listQuietGen = (Number(state.listQuietGen) || 0) + 1);
    var viewSnap = state.viewMode === "staff" ? "staff" : "user";
    var q = listQuery();
    var url = apiBase() + q;
    if (!state.listEtags) state.listEtags = {};
    return fetchJson(url, {
      method: "GET",
      headers: authHeaders(),
      cache: "default",
      ifNoneMatch: state.listEtags[q] || "",
      timeoutMs: 18000,
    })
      .then(function (out) {
        if (quietGen !== state.listQuietGen) return;
        if ((state.viewMode === "staff" ? "staff" : "user") !== viewSnap) return;
        if (isTicketsListHardLoading() || state.listHardPromise) return;
        if (out.etag) state.listEtags[q] = out.etag;
        if (out.notModified || (out.res && out.res.status === 304)) return;
        if (!out.res.ok || !out.data || !out.data.ok) return;
        applyListPayload(out.data);
        refreshListPane();
      })
      .catch(function (err) {
        try {
          console.warn("[vc-tickets] listQuiet failed", err);
        } catch (eW) {}
      });
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
    /* ticket429Flash1: non martellare presence durante backoff 429 */
    if (ticketsRateLimitedNow() && opts.clear !== true) return;
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
      } else if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        /* ticketsPageSilencePush1: ping SW anche senza vc-landing.js */
        try {
          navigator.serviceWorker.controller.postMessage({
            type: "vc:client-focus",
            focused: focused,
            ticketId: focused && !clear ? String(ticketId || "") : "",
            onTicketsPage: focused === true,
            token: getToken(),
          });
        } catch (ePing) {}
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
    })
      .then(function (out) {
        if (out && out.res && out.res.status === 429) {
          markTicketsRateLimited(out.data && out.data.retryAfterMs);
        }
      })
      .catch(function () {});
  }

  function startTicketPresence() {
    stopTicketPresence(false);
    /* ticket429Flash1 + ticketsPerfPack1: beat iniziale; heartbeat senza force (dedupe key) */
    window.setTimeout(function () {
      if (!getToken()) return;
      sendTicketPresence({ force: true });
    }, isCoarseMobile() ? 1800 : 600);
    state.presenceTimer = setInterval(function () {
      if (document.visibilityState === "hidden") return;
      if (ticketsRateLimitedNow()) return;
      sendTicketPresence({});
    }, ticketPresenceIntervalMs());
    if (!state.presenceFocusWired) {
      state.presenceFocusWired = true;
      window.addEventListener("focus", function () {
        if (document.visibilityState === "hidden") return;
        if (!getToken()) return;
        sendTicketPresence({ force: true });
      });
      window.addEventListener("blur", function () {
        if (!getToken()) return;
        sendTicketPresence({ force: true });
      });
    }
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
    var id = String(state.selectedId || "");
    if (!state.detailEtags) state.detailEtags = {};
    return fetchJson(apiBase() + "/" + encodeURIComponent(id), {
      method: "GET",
      headers: authHeaders(),
      cache: "default",
      ifNoneMatch: state.detailEtags[id] || "",
    })
      .then(function (out) {
        if (out.etag) state.detailEtags[id] = out.etag;
        if (out.notModified || (out.res && out.res.status === 304)) return;
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
          /* ticketsCpu45_1 #4: fingerprint leggero al posto di JSON.stringify×2 per msg */
          if (reactionsFingerprint(prev && prev.reactions) !== reactionsFingerprint(m.reactions)) {
            patchMessageInState(m);
          }
        });
        if (added > 0) {
          scrollChatBottom(false);
          hydrateContentRefs(incoming);
        }
        refreshTicketInList(out.data.ticket);
        /* ticketsCpuHard2: non ricostruire chrome/composer a ogni quiet poll */
        try {
          var prevSig = String(state._chatChromeSig || "");
          var t = out.data.ticket || state.detail || {};
          var nextSig = [
            t.id || "",
            t.status || "",
            t.claimedBy || t.assigneeId || "",
            t.category || "",
            t.categoryLabel || "",
            t.closeRequestedAt || "",
            t.updatedAt || t.updated_at || "",
            (t.subject || t.title || "").slice(0, 80),
          ].join("|");
          if (nextSig !== prevSig) {
            state._chatChromeSig = nextSig;
            refreshChatChrome();
          }
        } catch (eChrome) {
          refreshChatChrome();
        }
      })
      .catch(function () {});
  }

  function wireGate() {
    var gateBtn = byId("vc-wt-gate-login-cta");
    var headerBtn = byId("discord-login-btn");
    if (!gateBtn) return;
    try {
      gateBtn.setAttribute("data-vc-discord-login", "");
    } catch (eAttr) {}
    if (gateBtn.getAttribute("data-vc-wt-gate-bound") === "1") return;
    try {
      gateBtn.setAttribute("data-vc-wt-gate-bound", "1");
    } catch (eBound) {}
    gateBtn.addEventListener("click", function (ev) {
      try {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      } catch (ePrev) {}
      /* marquee404Fix1: preferisci OAuth diretto; fallback header Accedi */
      if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
        window.__vcDiscordStartOAuthRedirect(gateBtn);
        return;
      }
      if (typeof window.__vcDiscordStartOAuth === "function") {
        try {
          window.__vcDiscordStartOAuth(gateBtn);
          return;
        } catch (eOa) {}
      }
      if (headerBtn) {
        try {
          headerBtn.click();
        } catch (eHdr) {}
      }
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
    /* ticketScopeClick2: se l'utente ha scelto Personali, non ripristinare Staff da URL. */
    if (forceStaff && state.viewPinnedByUser === "user") {
      forceStaff = false;
      try {
        var hashKeep = String(location.hash || "").trim();
        var pathKeep = String(location.pathname || "/tickets/").replace(/\/?$/, "/") || "/tickets/";
        history.replaceState(null, "", pathKeep + hashKeep);
      } catch (eClr) {}
    }
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
    if (forceStaff) {
      return openStaffTicketFromNotif(hashId);
    }
    return openTicket(hashId, true);
  }

  function openStaffTicketFromNotif(id) {
    id = String(id || "").trim();
    var wasStaff = state.viewMode === "staff";
    var sameDeeplink =
      !id ||
      state.selectedId === id ||
      (function () {
        try {
          return resolveHashTicketId() === id;
        } catch (eSame) {
          return false;
        }
      })();
    state.viewMode = "staff";
    state.viewPinnedByUser = "staff";
    state.filter = "all";
    state.categoryFilter = "";
    state.listPage = 1;
    /* ticketNotifStaffTab2: se boot sta già caricando la stessa inbox staff, non invalidare
       (invalidate + secondo loadList lasciava skeleton orfano / tab Staff assente). */
    var alreadyStaffLoad =
      wasStaff && state.listHardPromise && isTicketsListHardLoading() && sameDeeplink;
    if (id) state.selectedId = id;
    try {
      var u = new URL(location.href);
      u.searchParams.set("view", "staff");
      if (id && /^[a-f0-9]{24}$/i.test(id)) {
        u.searchParams.set("ticketId", id);
      }
      var next =
        u.pathname + u.search + (id && /^[a-f0-9]{24}$/i.test(id) ? "#" + id : u.hash || "");
      if (next !== location.pathname + location.search + location.hash) {
        history.replaceState(null, "", next);
      }
    } catch (eUrl) {
      writeTicketsViewUrl("staff");
      if (id) setHashTicket(id);
    }
    syncStaffMode();
    syncTicketsChrome();
    if (alreadyStaffLoad) {
      return state.listHardPromise.then(function () {
        clearTicketsBusyState();
        syncTicketsChrome();
        if (id) return openTicket(id, true);
        return null;
      });
    }
    state.openTicketSeq = (Number(state.openTicketSeq) || 0) + 1;
    invalidateTicketsListInflight({ keepEtags: true });
    /* già in staff con lista viva → open diretto + quiet refresh */
    if (hasStaffInboxAccess() && Array.isArray(state.tickets) && state.tickets.length) {
      var openP = id ? openTicket(id, true) : Promise.resolve();
      void loadListQuiet();
      return openP;
    }
    state.detail = null;
    state.messages = [];
    if (!hasStaffInboxAccess()) {
      state.tickets = [];
      state.listTotal = 0;
      state.listTotalPages = 1;
    }
    return loadList({ soft: false, forceShell: true, skipOpen: !id }).then(function () {
      clearTicketsBusyState();
      syncTicketsChrome();
      if (id && hasStaffInboxAccess()) return openTicket(id, true);
      if (id) return openTicket(id, true);
      return null;
    });
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
      /* ticketNotifStaffOpen1: da notifica staff → hard switch (loadListQuiet lasciava Personali + toast) */
      if (staff) {
        void openStaffTicketFromNotif(id);
        return;
      }
      if (id) {
        state.selectedId = id;
        setHashTicket(id);
        void openTicket(id, true);
      } else {
        void applyTicketsUrlState({ force: true });
      }
    });
  }

  function scheduleTokenWaitBoot() {
    if (state.tokenWaitTimer) return;
    var tries = 0;
    var maxTries = isCoarseMobile() ? 40 : 24;
    function tick() {
      state.tokenWaitTimer = null;
      tries += 1;
      if (getToken()) {
        boot();
        return;
      }
      /* ticketNotifGate1 + ticketPhoneFirst1: Accedi solo dopo attesa auth (phone più lento) */
      if (tries >= maxTries) {
        teardownTicketsAfterLogout();
        return;
      }
      state.tokenWaitTimer = window.setTimeout(tick, tries < 8 ? 250 : 500);
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

  function prefetchTicketsEmojiIdle() {
    try {
      var run = function () { ensureTicketsEmojiMaps().catch(function () {}); };
      if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 4000 });
      else setTimeout(run, 1200);
    } catch (ePf) {}
  }
  function boot() {
    prefetchTicketsEmojiIdle();
    /* lazyEverywhere1: composer/picker solo su interact — no warm a boot */
    try {
      armComposerLazyOnInteract();
    } catch (eCompArm) {}

    try {
      armMsgToolsDelegation();
      var stillRoot = byId("vc-wt-app") || document;
      freezeTicketsAnimatedMedia(stillRoot);
      if (!window.__vcTicketsStillMo && typeof MutationObserver === "function") {
        var stillMoT = 0;
        var stillMoPending = null;
        window.__vcTicketsStillMo = new MutationObserver(function (muts) {
          /* ticketsLagHard1: debounce freeze GIF — subtree MO a ogni msg = main-thread jank */
          stillMoPending = muts;
          if (stillMoT) return;
          stillMoT = window.setTimeout(function () {
            stillMoT = 0;
            var batch = stillMoPending || [];
            stillMoPending = null;
            var roots = [];
            for (var i = 0; i < batch.length; i += 1) {
              var nodes = batch[i].addedNodes;
              for (var j = 0; j < nodes.length; j += 1) {
                var n = nodes[j];
                if (!n || n.nodeType !== 1) continue;
                if (n.tagName === "IMG" || (n.querySelector && n.querySelector("img"))) {
                  roots.push(n.tagName === "IMG" ? n.parentNode || stillRoot : n);
                }
              }
            }
            for (var r = 0; r < roots.length; r += 1) {
              try {
                freezeTicketsAnimatedMedia(roots[r]);
              } catch (eFr) {}
            }
          }, 180);
        });
        /* ticketsMsgRailCpu1 #3: observer solo su #vc-wt-app (no storm documentElement) */
        var moRoot = byId("vc-wt-app") || document.documentElement;
        window.__vcTicketsStillMo.observe(moRoot, { childList: true, subtree: true });
      }
    } catch (eStillBoot) {}
    if (state.bootWired) {
      if (!getToken()) {
        /* ticketNotifGate1: niente Accedi immediato su late auth miss */
        scheduleTokenWaitBoot();
        return;
      }
      hideGate();
      var rebootReply = consumeReplyToFromUrl();
      if (rebootReply) pendingReplyToId = rebootReply;
      // Soft refresh on late auth events so deeplink openTicket isn't wiped mid-flight.
      var softReboot =
        (Array.isArray(state.tickets) && state.tickets.length > 0) ||
        ticketsDomLooksReady() ||
        state.listEverPainted ||
        ticketsDomHasSkeleton();
      /* ticketSwitchFreeze2 + ticketSkelNoYoYo1: late auth → soft/reuse, mai force skel */
      var listP =
        !softReboot && state.listHardPromise && isTicketsListHardLoading()
          ? state.listHardPromise
          : loadList({ soft: softReboot, forceShell: false });
      try {
        ensureGuildEmojis();
      } catch (eEm2) {}
      listP.then(function () {
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
        /* ticketsCpu45_1 #5: spegni overlay md mentre la tab è nascosta */
        try {
          var edHide = document.querySelector(".vc-wt-composer__editor [contenteditable], .vc-wt-composer__input");
          if (edHide) syncComposerLivePreview(edHide, { force: true });
        } catch (eMdHide) {}
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
        try {
          var edShow = document.querySelector(".vc-wt-composer__editor [contenteditable], .vc-wt-composer__input");
          if (edShow) scheduleComposerLivePreview(edShow);
        } catch (eMdShow) {}
      }, isCoarseMobile() ? 900 : 350);
    });
    /* ticketsCpu45_1 #5: blur finestra → stop md-live; focus → riprendi */
    window.addEventListener("blur", function () {
      try {
        var edBlur = document.querySelector(".vc-wt-composer__editor [contenteditable], .vc-wt-composer__input");
        if (edBlur) syncComposerLivePreview(edBlur, { force: true });
      } catch (eBlur) {}
    });
    window.addEventListener("focus", function () {
      try {
        var edFocus = document.querySelector(".vc-wt-composer__editor [contenteditable], .vc-wt-composer__input");
        if (edFocus) scheduleComposerLivePreview(edFocus);
      } catch (eFocus) {}
    });
    try {
      /* ticketStaffRemember2: Staff SOLO se ?view=staff (eri lì + refresh).
         /tickets/ pulito o link menu → sempre Personali (niente default Staff da draft). */
      var urlView = readTicketsViewFromUrl();
      if (urlView === "staff") {
        state.viewMode = "staff";
        state.viewPinnedByUser = "staff";
      } else {
        state.viewMode = "user";
        state.viewPinnedByUser = "";
        writeTicketsViewUrl("user");
      }
      /* ticketNotifStaffTab2: pin deeplink ticketId subito (prima del load) */
      try {
        var bootTid = resolveHashTicketId();
        if (bootTid) state.selectedId = bootTid;
      } catch (eBootTid) {}
      syncStaffMode();
    } catch (eView) {
      state.viewMode = "user";
      syncStaffMode();
    }
    if (!getToken()) {
      /* ticketNotifGate1: aspetta token prima di Accedi (notif → /tickets flash) */
      try {
        showTicketsLoadingShell("Verifica sessione…");
      } catch (eWaitSkel) {}
      scheduleTokenWaitBoot();
      return;
    }
    hideGate();
    showTicketsLoadingShell("Caricamento ticket…");
    ensureTicketsPageVisible();
    try {
      wireListClicks();
    } catch (eListBoot) {}
    /* ticketHeadUi1: preload composer subito → claim/input meno lag al primo click */
    try {
      ensureWtComposerChunk().catch(function () {});
    } catch (eCompBoot) {}
    var bootReply = consumeReplyToFromUrl();
    if (bootReply) pendingReplyToId = bootReply;
    /* siteApiW5: list + emoji catalog in parallel; WS/presence after list */
    var listP = loadList();
    try {
      ensureGuildEmojis();
    } catch (eEm) {}
    listP.then(function () {
      ensureTicketsPageVisible();
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
  /* ticketsSlowToastFix1 */
})();
