(function () {
  "use strict";
  /* console429Kill1: CF 1015 → soft429 senza rete (niente Failed to load 429) + CSP/extension noise */
  /* consoleErrFix1: presence/chrome-prefs soft429 in cool-down (no rete → no Failed to load 429) */
  /* notif429Everywhere1: push/subscribe + GET notifs in cool-down → soft429 (no Failed to load) */

  function ensureTrustedTypesPolicy() {
    try {
      if (!window.trustedTypes) return null;
      if (window.trustedTypes.defaultPolicy) return window.trustedTypes.defaultPolicy;
      return window.trustedTypes.createPolicy("default", {
        createHTML: function (s) {
          return String(s);
        },
        createScript: function (s) {
          return String(s);
        },
        createScriptURL: function (s) {
          return String(s);
        },
      });
    } catch (ePolicy) {
      return null;
    }
  }

  ensureTrustedTypesPolicy();

  window.__vcTrustedScriptURL = function (url) {
    var u = String(url || "");
    try {
      var policy = ensureTrustedTypesPolicy() || (window.trustedTypes && window.trustedTypes.defaultPolicy);
      if (policy && typeof policy.createScriptURL === "function") return policy.createScriptURL(u);
    } catch (eUrl) {}
    return u;
  };

  /* ---- webhook fetch gate (CF 1015) ---- */
  (function installWebhookFetchGate() {
    if (window.__vcWebhookFetchInstalled) return;
    if (typeof window.fetch !== "function") return;
    window.__vcWebhookFetchInstalled = true;

    var origFetch = window.fetch.bind(window);
    var queue = [];
    var active = 0;
    var lastStart = 0;
    /* phoneApiSoft429Kill1: su telefono la coda stretta + abort = pagine vuote */
    var touchLike = false;
    try {
      touchLike =
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        Number(navigator.maxTouchPoints || 0) > 0;
    } catch (eTouch) {
      touchLike = false;
    }
    var GAP_MS = touchLike ? 90 : 320;
    var MAX_PARALLEL = touchLike ? 5 : 2;
    var globalBlockUntil = 0;
    var getFlights = Object.create(null);

    function noteGlobal429(ms) {
      /* console429Kill1: CF 1015 è IP-wide — cool-down lungo, stop hammering */
      var wait = Math.max(8000, Math.min(90000, Number(ms) || 25000));
      globalBlockUntil = Math.max(globalBlockUntil, Date.now() + wait);
    }
    window.__vcNoteWebhook429Global = noteGlobal429;
    window.__vcWebhookGlobalBlockedUntil = function () {
      return globalBlockUntil;
    };
    /* phoneApiSoft429Kill1: pageshow soft — sblocca freeze residuo se non CF recente */
    window.__vcClearWebhookGlobalBlock = function () {
      globalBlockUntil = 0;
    };

    function delay(ms) {
      return new Promise(function (resolve) {
        window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
      });
    }

    function looksLikeCloudflare429(res) {
      try {
        if (!res || Number(res.status) !== 429) return false;
        if (res.headers && res.headers.get("cf-ray")) return true;
        var ct = String((res.headers && res.headers.get("content-type")) || "").toLowerCase();
        if (ct.indexOf("text/html") >= 0) return true;
      } catch (eCf) {}
      return false;
    }

    function readRetryAfterMs(res, fallbackSec) {
      var fb = Number(fallbackSec);
      if (!Number.isFinite(fb) || fb < 1) fb = 8;
      var ra = fb;
      try {
        ra = Number(res && res.headers && res.headers.get("Retry-After"));
      } catch (eRa) {
        ra = fb;
      }
      if (!Number.isFinite(ra) || ra <= 0) ra = fb;
      if (looksLikeCloudflare429(res)) return Math.max(ra, 45) * 1000;
      return Math.min(60, ra) * 1000;
    }

    function waitOutGlobalBlock(maxMs) {
      var left = globalBlockUntil - Date.now();
      if (left <= 0) return Promise.resolve();
      return delay(Math.min(Number(maxMs) || 12000, left + 60));
    }

    function armFrom429(res) {
      try {
        if (res && res.headers && res.headers.get("X-VC-Soft429")) return;
      } catch (eSoft) {}
      /* consoleStormKill3: CF 1015 = cool-down lungo; app 429 = corto ma BLOCCA lo storm
         (prima i ticket bypassavano la coda e riempivano la console di Failed to load 429). */
      if (looksLikeCloudflare429(res)) {
        noteGlobal429(readRetryAfterMs(res, 45));
        return;
      }
      noteGlobal429(readRetryAfterMs(res, 14));
    }

    function isWebhookUrl(url) {
      try {
        var base = location && location.origin ? location.origin : "https://localhost";
        return String(new URL(String(url || ""), base).pathname || "").indexOf("/webhooks/") === 0;
      } catch (e) {
        return /\/webhooks\//i.test(String(url || ""));
      }
    }

    /* ticketManageSoft429Fix1: claim/close/unclaim non devono finire in soft429 locale */
    function isTicketsWebhook(url) {
      try {
        var base = location && location.origin ? location.origin : "https://localhost";
        return (
          String(new URL(String(url || ""), base).pathname || "").indexOf("/webhooks/site-web-tickets") === 0
        );
      } catch (eT) {
        return /\/webhooks\/site-web-tickets/i.test(String(url || ""));
      }
    }

    /* consoleErrFix1: heartbeat non critico — mai martellare rete in cool-down */
    function isTicketHeartbeatWebhook(url) {
      try {
        var base = location && location.origin ? location.origin : "https://localhost";
        var path = String(new URL(String(url || ""), base).pathname || "");
        if (path === "/webhooks/site-web-tickets/presence") return true;
        if (/\/webhooks\/site-web-tickets\/[^/]+\/typing\/?$/.test(path)) return true;
        return false;
      } catch (eH) {
        return /\/webhooks\/site-web-tickets\/(?:presence|[^/]+\/typing)/i.test(String(url || ""));
      }
    }

    function isChromePrefsWebhook(url) {
      try {
        var base = location && location.origin ? location.origin : "https://localhost";
        return String(new URL(String(url || ""), base).pathname || "") === "/webhooks/site-chrome-prefs";
      } catch (eC) {
        return /\/webhooks\/site-chrome-prefs(?:\?|$)/i.test(String(url || ""));
      }
    }

    /* console429Everywhere1: boot hot endpoints — soft429 in cool-down, zero Failed to load */
    function isBootQuietWebhook(url) {
      try {
        var base = location && location.origin ? location.origin : "https://localhost";
        var path = String(new URL(String(url || ""), base).pathname || "");
        return (
          path === "/webhooks/site-chrome-prefs" ||
          path === "/webhooks/site-discord-me" ||
          path === "/webhooks/site-staff-access" ||
          path.indexOf("/webhooks/site-staff-access/") === 0
        );
      } catch (eB) {
        return /\/webhooks\/site-(chrome-prefs|discord-me|staff-access)(?:\/|\?|$)/i.test(String(url || ""));
      }
    }

    /* notif429Everywhere1: push sub/unsub non critico — soft429 in cool-down (no Failed to load) */
    function isNotifPushWebhook(url) {
      try {
        var base = location && location.origin ? location.origin : "https://localhost";
        var path = String(new URL(String(url || ""), base).pathname || "");
        return (
          path.indexOf("/webhooks/site-notifications/push/subscribe") === 0 ||
          path.indexOf("/webhooks/site-notifications/push/unsubscribe") === 0
        );
      } catch (eP) {
        return /\/webhooks\/site-notifications\/push\/(?:un)?subscribe/i.test(String(url || ""));
      }
    }

    /* discussSendCt1: chat discussione (candidature/appelli/inbox) — primo invio non soft429 */
    function isWorkflowChatWebhook(url) {
      try {
        var base = location && location.origin ? location.origin : "https://localhost";
        var path = String(new URL(String(url || ""), base).pathname || "");
        return (
          path.indexOf("/webhooks/site-user-workflow-chat") === 0 ||
          path.indexOf("/webhooks/site-staff-workflow-chat") === 0 ||
          path.indexOf("/webhooks/site-confessionale") === 0
        );
      } catch (eW) {
        return /\/webhooks\/site-(?:user|staff)-workflow-chat|\/webhooks\/site-confessionale/i.test(
          String(url || ""),
        );
      }
    }

    /* reviewsSoft429Fix1 + phoneApiSoft429Kill1: board + pagine API bot in priorità */
    function isBoardReadWebhook(url) {
      try {
        var base = location && location.origin ? location.origin : "https://localhost";
        var path = String(new URL(String(url || ""), base).pathname || "");
        return (
          path.indexOf("/webhooks/site-reviews") === 0 ||
          path.indexOf("/webhooks/site-suggestions") === 0 ||
          path.indexOf("/webhooks/site-bot-feedback") === 0 ||
          path.indexOf("/webhooks/site-feedback") === 0 ||
          path.indexOf("/webhooks/site-vote") === 0 ||
          path.indexOf("/webhooks/site-roles") === 0 ||
          path.indexOf("/webhooks/site-users") === 0 ||
          path.indexOf("/webhooks/site-wiki-help") === 0 ||
          path.indexOf("/webhooks/site-profile-extras") === 0 ||
          path.indexOf("/webhooks/site-custom-profile") === 0 ||
          path.indexOf("/webhooks/site-staff-compiti") === 0 ||
          path.indexOf("/webhooks/site-staff-organico") === 0 ||
          path.indexOf("/webhooks/site-staff-pause") === 0 ||
          path.indexOf("/webhooks/site-staff-profile") === 0 ||
          path.indexOf("/webhooks/site-candidature") === 0
        );
      } catch (eB) {
        return /\/webhooks\/site-(reviews|suggestions|bot-feedback|feedback|vote|roles|users|wiki-help|profile-extras|custom-profile|staff-compiti|staff-organico|staff-pause|staff-profile|candidature)/i.test(
          String(url || ""),
        );
      }
    }

    /* notifSheetSync1: sync badge/pending tra device non deve finire in soft429 */
    function isSiteNotificationsWebhook(url) {
      try {
        var base = location && location.origin ? location.origin : "https://localhost";
        return (
          String(new URL(String(url || ""), base).pathname || "").indexOf("/webhooks/site-notifications") === 0
        );
      } catch (eN) {
        return /\/webhooks\/site-notifications/i.test(String(url || ""));
      }
    }

    /* accessGateQueueFix1 + welcomePronouns9 + rankFastPaint1 + ticketManageSoft429Fix1 + reviewsSoft429Fix1 + discussSendCt1 + console429Everywhere1 */
    function isAccessPriorityWebhook(url) {
      try {
        var base = location && location.origin ? location.origin : "https://localhost";
        var path = String(new URL(String(url || ""), base).pathname || "");
        return (
          path.indexOf("/webhooks/site-staff-access") === 0 ||
          path === "/webhooks/site-discord-me" ||
          path === "/webhooks/site-chrome-prefs" ||
          path.indexOf("/webhooks/site-dashboard") === 0 ||
          path.indexOf("/webhooks/site-seratafilm") === 0 ||
          path.indexOf("/webhooks/site-welcome-pronouns") === 0 ||
          path.indexOf("/webhooks/site-rank-card-public") === 0 ||
          isTicketsWebhook(url) ||
          isWorkflowChatWebhook(url) ||
          isBoardReadWebhook(url) ||
          isSiteNotificationsWebhook(url)
        );
      } catch (eP) {
        return (
          isTicketsWebhook(url) ||
          isWorkflowChatWebhook(url) ||
          isBoardReadWebhook(url) ||
          isSiteNotificationsWebhook(url) ||
          /\/webhooks\/site-(staff-access|discord-me|chrome-prefs|dashboard|seratafilm|welcome-pronouns|rank-card-public)/i.test(
            String(url || ""),
          )
        );
      }
    }

    function authKey(init) {
      try {
        var h = (init && init.headers) || {};
        if (typeof Headers !== "undefined" && h instanceof Headers) {
          return String(h.get("Authorization") || h.get("authorization") || "");
        }
        return String(h.Authorization || h.authorization || "");
      } catch (eA) {
        return "";
      }
    }

    function soft429() {
      try {
        return new Response(JSON.stringify({ ok: false, error: "rate_limited", soft: true }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "20",
            "X-VC-Soft429": "1",
          },
        });
      } catch (eR) {
        return Promise.reject(new Error("rate_limited"));
      }
    }

    function runPriority(input, init) {
      var url = "";
      try {
        url = typeof input === "string" ? input : input && input.url ? String(input.url) : String(input || "");
      } catch (eU) {
        url = String(input || "");
      }
      /* rankFastPaint1: PNG pubblica esente — non aspettare cool-down CF della coda JSON */
      var rankPublic = false;
      var tickets = false;
      var boardRead = false;
      var workflowChat = false;
      try {
        var base = location && location.origin ? location.origin : "https://localhost";
        var prioPath = String(new URL(String(url || ""), base).pathname || "");
        rankPublic = prioPath.indexOf("/webhooks/site-rank-card-public") === 0;
        tickets = prioPath.indexOf("/webhooks/site-web-tickets") === 0;
        boardRead =
          prioPath.indexOf("/webhooks/site-reviews") === 0 ||
          prioPath.indexOf("/webhooks/site-suggestions") === 0 ||
          prioPath.indexOf("/webhooks/site-bot-feedback") === 0 ||
          prioPath.indexOf("/webhooks/site-feedback") === 0 ||
          prioPath.indexOf("/webhooks/site-vote") === 0 ||
          prioPath.indexOf("/webhooks/site-roles") === 0 ||
          prioPath.indexOf("/webhooks/site-users") === 0 ||
          prioPath.indexOf("/webhooks/site-wiki-help") === 0 ||
          prioPath.indexOf("/webhooks/site-profile-extras") === 0 ||
          prioPath.indexOf("/webhooks/site-custom-profile") === 0 ||
          prioPath.indexOf("/webhooks/site-staff-compiti") === 0 ||
          prioPath.indexOf("/webhooks/site-staff-organico") === 0 ||
          prioPath.indexOf("/webhooks/site-staff-pause") === 0 ||
          prioPath.indexOf("/webhooks/site-staff-profile") === 0 ||
          prioPath.indexOf("/webhooks/site-candidature") === 0;
        workflowChat =
          prioPath.indexOf("/webhooks/site-user-workflow-chat") === 0 ||
          prioPath.indexOf("/webhooks/site-staff-workflow-chat") === 0 ||
          prioPath.indexOf("/webhooks/site-confessionale") === 0;
      } catch (eRp) {
        rankPublic = /\/webhooks\/site-rank-card-public/i.test(String(url || ""));
        tickets = /\/webhooks\/site-web-tickets/i.test(String(url || ""));
        boardRead =
          /\/webhooks\/site-(reviews|suggestions|bot-feedback|feedback|vote|roles|users|wiki-help|profile-extras|custom-profile|staff-compiti|staff-organico|staff-pause|staff-profile|candidature)/i.test(
            String(url || ""),
          );
        workflowChat = /\/webhooks\/site-(?:user|staff)-workflow-chat|\/webhooks\/site-confessionale/i.test(
          String(url || ""),
        );
      }
      if (rankPublic) {
        return Promise.resolve(origFetch(input, init)).then(function (res) {
          if (res && res.status === 429) armFrom429(res);
          return res;
        });
      }
      var notifs = false;
      try {
        notifs = isSiteNotificationsWebhook(url);
      } catch (eNf) {
        notifs = /\/webhooks\/site-notifications/i.test(String(url || ""));
      }
      /* consoleStormKill3: board GET durante cool-down → soft429.
         ticketPhoneOpenWait1: ticket GET/POST aspetta cool-down (come notifs) — soft429 immediato
         faceva "Ticket non ancora pronto" + "Troppe richieste" aprendo da notifica in-app su telefono.
         notifSheetSync1: site-notifications GET aspetta (badge cross-device); push sub → soft429.
         notif429Everywhere1: se cool-down ancora attivo dopo wait → soft429 (no Failed to load).
         consoleErrFix1: presence/typing heartbeat → soft429 (niente Failed to load 429 in console).
         console429Everywhere1: boot quiet (me/access/prefs) → soft429 anche su touch. */
      if (tickets || boardRead || workflowChat || notifs || isBootQuietWebhook(url)) {
        var prioMethod = "GET";
        try {
          prioMethod = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
        } catch (ePm) {}
        if (Date.now() < globalBlockUntil) {
          if (isBootQuietWebhook(url) || isTicketHeartbeatWebhook(url) || isNotifPushWebhook(url)) {
            return Promise.resolve(soft429());
          }
          /* ticket + notif GET: wait; altri GET (board) restano soft429.
             ticketDetailFast1: ticket aspetta max ~2.5s (endpoint senza limit_req) —
             wait 22s faceva “ci mette un sacco” al click su telefono. */
          if (prioMethod === "GET" && !notifs && !tickets) return Promise.resolve(soft429());
          return waitOutGlobalBlock(tickets ? 2500 : notifs ? 18000 : 12000).then(function () {
            if (
              Date.now() < globalBlockUntil &&
              (isBootQuietWebhook(url) || isTicketHeartbeatWebhook(url) || isNotifPushWebhook(url))
            ) {
              return soft429();
            }
            /* notif429Everywhere1: GET notifs ancora in cool-down → soft429, non rete */
            if (Date.now() < globalBlockUntil && notifs) return soft429();
            return Promise.resolve(origFetch(input, init)).then(function (res) {
              if (res && res.status === 429) armFrom429(res);
              return res;
            });
          });
        }
        return Promise.resolve(origFetch(input, init)).then(function (res) {
          if (res && res.status === 429) armFrom429(res);
          return res;
        });
      }
      /* phoneApiSoft429Kill1: su touch aspetta e riprova rete, non soft429 immediato */
      if (Date.now() < globalBlockUntil) {
        if (isBootQuietWebhook(url)) return Promise.resolve(soft429());
        var waitCap = touchLike ? 16000 : 8000;
        return waitOutGlobalBlock(waitCap).then(function () {
          if (Date.now() < globalBlockUntil && !touchLike) return soft429();
          if (Date.now() < globalBlockUntil && isBootQuietWebhook(url)) return soft429();
          return Promise.resolve(origFetch(input, init)).then(function (res) {
            if (res && res.status === 429) armFrom429(res);
            return res;
          });
        });
      }
      return Promise.resolve(origFetch(input, init)).then(function (res) {
        if (res && res.status === 429) armFrom429(res);
        return res;
      });
    }

    function pump() {
      if (active >= MAX_PARALLEL || !queue.length) return;
      var wait = Math.max(0, GAP_MS - (Date.now() - lastStart));
      if (wait > 0) {
        window.setTimeout(pump, wait);
        return;
      }
      var job = queue.shift();
      if (!job) return;
      if (Date.now() < globalBlockUntil) {
        var jobMethod = "GET";
        var jobUrl = "";
        try {
          jobMethod = String((job.init && job.init.method) || (job.input && job.input.method) || "GET").toUpperCase();
        } catch (eJm) {}
        try {
          jobUrl =
            typeof job.input === "string"
              ? job.input
              : job.input && job.input.url
                ? String(job.input.url)
                : String(job.input || "");
        } catch (eJu) {
          jobUrl = "";
        }
        /* console429Everywhere1: boot quiet in coda → soft429 (anche touch) */
        if (isBootQuietWebhook(jobUrl) || isTicketHeartbeatWebhook(jobUrl)) {
          try {
            job.resolve(soft429());
          } catch (eSoftBoot) {
            job.reject(eSoftBoot);
          }
          pump();
          return;
        }
        /* discussSendCt1: POST in coda durante cool-down → aspetta, non soft429 al primo invio */
        if (jobMethod !== "GET") {
          queue.unshift(job);
          window.setTimeout(pump, Math.min(1200, Math.max(80, globalBlockUntil - Date.now() + 40)));
          return;
        }
        /* phoneApiSoft429Kill1: touch GET → aspetta e prova rete, non soft429 */
        if (touchLike) {
          queue.unshift(job);
          window.setTimeout(pump, Math.min(900, Math.max(80, globalBlockUntil - Date.now() + 40)));
          return;
        }
        try {
          job.resolve(soft429());
        } catch (eSoft) {
          job.reject(eSoft);
        }
        pump();
        return;
      }
      active += 1;
      lastStart = Date.now();
      Promise.resolve(origFetch(job.input, job.init))
        .then(function (res) {
          if (res && res.status === 429) armFrom429(res);
          return res;
        })
        .then(job.resolve, job.reject)
        .finally(function () {
          active -= 1;
          pump();
        });
    }

    function normalizeWebhookFlightUrl(raw) {
      try {
        var base = location && location.origin ? location.origin : "https://localhost";
        var u = new URL(String(raw || ""), base);
        u.searchParams.delete("_");
        u.searchParams.delete("fresh");
        u.searchParams.delete("cb");
        u.searchParams.delete("ts");
        return u.pathname + (u.search || "");
      } catch (eN) {
        return String(raw || "").replace(/([?&])_=\d+/g, "$1").replace(/[?&]$/, "");
      }
    }

    window.fetch = function (input, init) {
      var url = "";
      try {
        url = typeof input === "string" ? input : input && input.url ? String(input.url) : String(input || "");
      } catch (eU) {
        url = String(input || "");
      }
      if (!isWebhookUrl(url)) return origFetch(input, init);

      var method = "GET";
      try {
        method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      } catch (eM) {}

      /* priority access + phoneApiSoft429Kill1: GET touch bypass coda (timeout = rete reale) */
      if (isAccessPriorityWebhook(url) || (touchLike && method === "GET")) return runPriority(input, init);

      /* console429Kill1: durante block → soft429 locale sui GET.
         discussSendCt1: i POST (invio messaggio/commento) aspettano e riprovano, non falliscono al primo click.
         consoleErrFix1 / console429Everywhere1: chrome-prefs / discord-me / staff-access → soft429 (no rete). */
      if (Date.now() < globalBlockUntil) {
        if (isBootQuietWebhook(url) || isChromePrefsWebhook(url) || isTicketHeartbeatWebhook(url)) {
          return Promise.resolve(soft429());
        }
        if (method !== "GET") {
          return waitOutGlobalBlock(12000).then(function () {
            if (Date.now() < globalBlockUntil && (isChromePrefsWebhook(url) || isTicketHeartbeatWebhook(url))) {
              return soft429();
            }
            return Promise.resolve(origFetch(input, init)).then(function (res) {
              if (res && res.status === 429) armFrom429(res);
              return res;
            });
          });
        }
        if (touchLike) {
          return waitOutGlobalBlock(16000).then(function () {
            return Promise.resolve(origFetch(input, init)).then(function (res) {
              if (res && res.status === 429) armFrom429(res);
              return res;
            });
          });
        }
        return Promise.resolve(soft429());
      }

      if (method === "GET") {
        /* rankStormKill1: strip ?_= / fresh così force-reload non rompe singleflight */
        var gkey = method + "|" + normalizeWebhookFlightUrl(url) + "|" + authKey(init).slice(0, 24);
        if (getFlights[gkey]) return getFlights[gkey];
        var gp = new Promise(function (resolve, reject) {
          queue.push({ input: input, init: init, resolve: resolve, reject: reject });
          pump();
        });
        getFlights[gkey] = gp.finally(function () {
          delete getFlights[gkey];
        });
        return getFlights[gkey];
      }

      return new Promise(function (resolve, reject) {
        queue.push({ input: input, init: init, resolve: resolve, reject: reject });
        pump();
      });
    };

    try {
      window.addEventListener("pageshow", function () {
        try {
          if (touchLike && typeof window.__vcClearWebhookGlobalBlock === "function") {
            window.__vcClearWebhookGlobalBlock();
          }
        } catch (ePs) {}
      });
    } catch (ePsBind) {}
  })();

  if (window.__vcExtensionNoiseFilterInstalled) return;
  window.__vcExtensionNoiseFilterInstalled = true;

  function msgOf(reason, depth) {
    try {
      if (depth == null) depth = 0;
      if (reason && typeof reason === "object") {
        var parts = [];
        if (reason.message != null) parts.push(String(reason.message));
        if (reason.stack != null) parts.push(String(reason.stack));
        if (reason.name != null) parts.push(String(reason.name));
        if (depth < 2 && reason.reason != null) parts.push(msgOf(reason.reason, depth + 1));
        if (depth < 2 && reason.error != null) parts.push(msgOf(reason.error, depth + 1));
        if (parts.length) return parts.join(" ");
      }
      return String(reason || "");
    } catch (e) {
      return "";
    }
  }


  /* removeChildKill1: soft-wrap — evita throw tipico delle ext MAIN-world */
  try {
    if (!window.__vcRmChildSoft) {
      window.__vcRmChildSoft = 1;
      var _rcProto = Node.prototype;
      var _rcOrig = _rcProto.removeChild;
      _rcProto.removeChild = function (c) {
        try {
          if (c && c.parentNode !== this) return c;
          return _rcOrig.call(this, c);
        } catch (eRc) {
          var mm = String((eRc && eRc.message) || eRc || "");
          if (/not a child|NotFoundError|removeChild/i.test(mm)) return c;
          throw eRc;
        }
      };
    }
  } catch (eSoft) {}
  /* extConsoleKill1 + extNoiseKill2: AdBlock / shopping / cookie / bfcache */
  /* extNoiseExternal1: match content.js / injectScriptAdjust.js anche senza path */
  var EXT_FILE_RE =
    /\b(?:content(?:_script)?|globals-front|adblock-picreplacement|cookieCrumbler|injectscript(?:adjust)?|background)\.js\b|chrome-extension:\/\/|moz-extension:\/\//i;

  function isExtensionNoise(reason) {
    var msg = msgOf(reason);
    if (EXT_FILE_RE.test(msg)) return true;
    return (
      /^\s*external\s*$/i.test(msg) ||
      /requires ['"]?TrustedScript['"]? assignment/i.test(msg) ||
      /trustedscript/i.test(msg) ||
      /injectscript\.js/i.test(msg) ||
      /message channel closed before a response was received/i.test(msg) ||
      /message channel closed/i.test(msg) ||
      /channel closed before a response was received/i.test(msg) ||
      /closed before a response was received/i.test(msg) ||
      /could not establish connection\.?\s*receiving end does not exist/i.test(msg) ||
      /receiving end does not exist/i.test(msg) ||
      /extension context invalidated/i.test(msg) ||
      /the message port closed before a response was received/i.test(msg) ||
      /message port closed/i.test(msg) ||
      /listener indicated an asynchronous response/i.test(msg) ||
      /a listener indicated an asynchronous response by returning true/i.test(msg) ||
      (/by returning true/i.test(msg) && /message channel closed/i.test(msg)) ||
      /listener.*returning true.*(?:message )?channel closed/i.test(msg) ||
      /asynchronous response by returning true/i.test(msg) ||
      /* consoleAsyncListenerKill1/3: Chrome stampa "Uncaught (in promise) Error: A listener…" su user/:1 */
      /uncaught \(in promise\).*listener indicated an asynchronous response/i.test(msg) ||
      /uncaught \(in promise\).*message channel closed/i.test(msg) ||
      /uncaught \(in promise\).*by returning true/i.test(msg) ||
      /* consoleAsyncListenerKill2: stessa frase anche senza prefisso Uncaught / Error: */
      /returning true,\s*but the message channel closed/i.test(msg) ||
      (/uncaught \(in promise\)/i.test(msg) && /message channel closed|listener indicated|\bexternal\b|returning true/i.test(msg)) ||
      /unchecked runtime\.lasterror/i.test(msg) ||
      /wrappedSendMessageCallback/i.test(msg) ||
      /cookieCrumbler\.js/i.test(msg) ||
      /adblock-picreplacement\.js/i.test(msg) ||
      /globals-front\.js/i.test(msg) ||
      /chrome-extension:\/\//i.test(msg) ||
      /moz-extension:\/\//i.test(msg) ||
      /page keeping the extension port/i.test(msg) ||
      /moved into back\/forward cache/i.test(msg) ||
      /back\/forward cache/i.test(msg) ||
      /error in event handler/i.test(msg) ||
      (/cannot read properties of undefined/i.test(msg) && /useCache/i.test(msg)) ||
      (/reading ['"]?useCache['"]?/i.test(msg)) ||
      (/cannot read properties of undefined/i.test(msg) && /postMessage/i.test(msg)) ||
      /* extOnly1 + violPass5: Violation SOLO fingerprint estensione */
      (/\[violation\]/i.test(msg) &&
        /(content(?:_script)?\.js|chrome-extension:|moz-extension:|globals-front|injectscript|cookieCrumbler|adblock|adblock-picreplacement)/i.test(
          msg,
        )) ||
      (/'setInterval' handler took/i.test(msg) &&
        /(content(?:_script)?\.js|chrome-extension:|moz-extension:|globals-front|adblock)/i.test(msg)) ||
      (/'setTimeout' handler took/i.test(msg) &&
        /(content(?:_script)?\.js|chrome-extension:|moz-extension:|globals-front|adblock)/i.test(msg)) ||
      (/'requestIdleCallback' handler took/i.test(msg) &&
        /(content(?:_script)?\.js|chrome-extension:|moz-extension:|globals-front|adblock)/i.test(msg)) ||
      (/'requestAnimationFrame' handler took/i.test(msg) &&
        /(content(?:_script)?\.js|chrome-extension:|moz-extension:|globals-front|adblock)/i.test(msg)) ||
      (/forced reflow while executing javascript took/i.test(msg) &&
        /(content(?:_script)?\.js|chrome-extension:|moz-extension:|globals-front|adblock)/i.test(msg)) ||
      /* consoleExtRemoveChild1 + removeChildKill1: removeChild NotFoundError — bare, no fingerprint */
      /failed to execute ['"]?removechild['"]?/i.test(msg) ||
      (/notfounderror/i.test(msg) && /node to be removed is not a child|removechild/i.test(msg)) ||
      /the node to be removed is not a child of this node/i.test(msg) ||
      (/font-size:\s*0;\s*color:\s*transparent/i.test(msg) && /NaN/i.test(msg)) ||
      /challenges\.cloudflare\.com/i.test(msg) ||
      /signal is aborted without reason/i.test(msg) ||
      (/aborterror/i.test(msg) && /force_release|external|forceRelease/i.test(msg)) ||
      /injectscriptadjust\.js/i.test(msg)
    );
  }

  function isCspReportOnlyNoise(text) {
    var s = String(text || "");
    /* extCspNoiseKill1 + consoleNoiseKill2: CSP report-only tipiche delle estensioni */
    if (/\[?violation\]?/i.test(s) && /content(?:_script)?\.js|chrome-extension:|moz-extension:|main\.js/i.test(s))
      return true;
    /* extOnly1: NON nascondere Forced reflow / handler took nostri */
    if (
      !/content security policy|csp report|violates the following content security policy|creating a worker from|loading the script|connecting to/i.test(
        s,
      )
    )
      return false;
    return (
      /report-only/i.test(s) ||
      /connect-src ['"]?none['"]?/i.test(s) ||
      /script-src ['"]?unsafe-inline['"]?(?:\s+['"]?unsafe-eval['"]?)?/i.test(s) ||
      /violates the following content security policy/i.test(s) ||
      /loading the script/i.test(s) ||
      /connecting to/i.test(s) ||
      /creating a worker from/i.test(s) ||
      /note that ['"]?script-src-elem['"]? was not explicitly set/i.test(s) ||
      /note that ['"]?worker-src['"]? was not explicitly set/i.test(s)
    );
  }

  function stripInjectedCspReportOnlyMeta() {
    try {
      var nodes = document.querySelectorAll(
        'meta[http-equiv="Content-Security-Policy-Report-Only" i], meta[http-equiv="Content-Security-Policy" i]',
      );
      for (var i = 0; i < nodes.length; i += 1) {
        var m = nodes[i];
        var c = String(m.getAttribute("content") || "");
        if (
          /connect-src\s+['"]?none['"]?/i.test(c) ||
          /^script-src\s+['"]?unsafe-inline['"]?\s+['"]?unsafe-eval['"]?\s*$/i.test(c.trim()) ||
          (/script-src\s+['"]?unsafe-inline['"]?/i.test(c) &&
            /unsafe-eval/i.test(c) &&
            !/https?:|blob:|'self'/i.test(c))
        ) {
          try {
            m.parentNode && m.parentNode.removeChild(m);
          } catch (eRm) {}
        }
      }
    } catch (eStrip) {}
  }
  stripInjectedCspReportOnlyMeta();
  try {
    if (!window.__vcCspMetaStripObs && window.MutationObserver && document.documentElement) {
      window.__vcCspMetaStripObs = new MutationObserver(function () {
        stripInjectedCspReportOnlyMeta();
      });
      window.__vcCspMetaStripObs.observe(document.documentElement, { childList: true, subtree: true });
      /* consoleNoiseKill2: estensioni re-iniettano CSP a lungo — strip per 90s */
      window.setTimeout(function () {
        try {
          window.__vcCspMetaStripObs && window.__vcCspMetaStripObs.disconnect();
        } catch (eDisc) {}
      }, 90000);
      window.setInterval(function () {
        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(stripInjectedCspReportOnlyMeta, { timeout: 800 });
        } else {
          stripInjectedCspReportOnlyMeta();
        }
      }, 5000);
    }
  } catch (eObs) {}

  function isYoutubeBlockedNoise(args) {
    try {
      var s = "";
      for (var i = 0; i < args.length; i += 1) {
        if (args[i] != null) s += " " + String(args[i]);
      }
      if (!/ERR_BLOCKED_BY_CLIENT|ERR_BLOCKED_BY_ORB/i.test(s)) return false;
      return /youtube|googlevideo|ytimg|gstatic|iframe_api/i.test(s);
    } catch (e) {
      return false;
    }
  }

  function isTurnstileFormatNoise(args) {
    try {
      var first = String(args[0] || "");
      if (/font-size:\s*0;\s*color:\s*transparent/i.test(first)) return true;
      if (/%c%d/i.test(first) && (args[1] !== args[1] || args[1] == null)) return true;
    } catch (e) {}
    return false;
  }

  window.addEventListener(
    "error",
    function (ev) {
      var src = "";
      var msg = "";
      try {
        src = String(ev.filename || (ev.target && ev.target.src) || "");
      } catch (e0) {}
      try {
        msg = String(ev.message || (ev.error && ev.error.message) || "");
      } catch (eM) {}
      var stack = "";
      try {
        stack = String((ev.error && ev.error.stack) || "");
      } catch (eS) {}
      var blob = msg + " " + src + " " + stack;
      if (
        !isExtensionNoise(ev.message) &&
        !isExtensionNoise(src) &&
        !isExtensionNoise(ev.error) &&
        !isExtensionNoise(blob) &&
        !EXT_FILE_RE.test(src) &&
        !EXT_FILE_RE.test(stack) &&
        !/failed to execute ['"]?removechild['"]?/i.test(blob) &&
        !(/notfounderror/i.test(blob) && /node to be removed is not a child/i.test(blob))
      )
        return;
      try {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      } catch (e1) {}
    },
    true,
  );

  window.addEventListener(
    "securitypolicyviolation",
    function (ev) {
      var text = "";
      try {
        text = [ev.blockedURI, ev.violatedDirective, ev.originalPolicy, ev.sourceFile, ev.disposition].join(" ");
      } catch (e2) {}
      if (!isExtensionNoise(text) && !isCspReportOnlyNoise(text) && String(ev.disposition || "") !== "report") return;
      try {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      } catch (e3) {}
      /* extCspNoiseKill1: stop bubbling verso altri logger */
      return false;
    },
    true,
  );

  window.addEventListener(
    "unhandledrejection",
    function (ev) {
      var blob = "";
      try {
        blob = [ev && ev.reason, ev && ev.message, ev && ev.type].map(msgOf).join(" ");
      } catch (eBlob) {}
      if (!isExtensionNoise(ev.reason) && !isExtensionNoise(msgOf(ev.reason)) && !isExtensionNoise(blob)) return;
      try {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (ev.stopPropagation) ev.stopPropagation();
      } catch (e0) {}
      return false;
    },
    true,
  );

  window.onunhandledrejection = function (ev) {
    if (!isExtensionNoise(ev && ev.reason) && !isExtensionNoise(msgOf(ev && ev.reason))) return;
    try {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    } catch (e4) {}
    return false;
  };

  /* consoleAsyncListenerKill1: tieni il nostro handler anche se altri script sovrascrivono */
  try {
    var _rej = window.onunhandledrejection;
    Object.defineProperty(window, "onunhandledrejection", {
      configurable: true,
      enumerable: true,
      get: function () {
        return _rej;
      },
      set: function (fn) {
        _rej = function (ev) {
          if (isExtensionNoise(ev && ev.reason) || isExtensionNoise(msgOf(ev && ev.reason))) {
            try {
              ev.preventDefault();
              ev.stopImmediatePropagation();
            } catch (eKeep) {}
            return false;
          }
          if (typeof fn === "function") return fn.apply(this, arguments);
        };
      },
    });
    window.onunhandledrejection = _rej;
  } catch (eDef) {}

  ["error", "warn", "log", "info", "debug"].forEach(function (level) {
    var orig = console[level];
    if (typeof orig !== "function") return;
    function filtered() {
      if (isYoutubeBlockedNoise(arguments)) return;
      if (isTurnstileFormatNoise(arguments)) return;
      var all = "";
      for (var i = 0; i < arguments.length; i += 1) all += " " + msgOf(arguments[i]);
      if (
        isExtensionNoise(all) ||
        isCspReportOnlyNoise(all) ||
        /creating a worker from .* violates the following content security policy/i.test(all) ||
        /\[violation\].*content(?:_script)?\.js/i.test(all) ||
        (/failed to load resource/i.test(all) &&
          (/status of 429|\b429\b/i.test(all) ||
            /\/webhooks\/site-|vapid-public-key|site-rank-card|cdn\.discordapp\.com\/(?:avatars|guilds)|media\.discordapp\.net/i.test(
              all,
            ))) ||
        /loading the script .* violates the following content security policy/i.test(all) ||
        /connecting to .* violates the following content security policy/i.test(all) ||
        /violates the following content security policy directive/i.test(all) ||
        /allow attribute will take precedence over ['"]?allowfullscreen['"]?/i.test(all) ||
        /websocket connection to .* failed/i.test(all) ||
        /websocket is closed before the connection is established/i.test(all) ||
        /cannot navigate to url/i.test(all) ||
        /failed to execute ['"]?postmessage['"]? on ['"]?domwindow['"]?/i.test(all) ||
        (/target origin provided/i.test(all) && /youtube(-nocookie)?\.com/i.test(all)) ||
        (/notfounderror/i.test(all) && /node to be removed is not a child|removechild/i.test(all)) ||
        /failed to execute ['"]?removechild['"]?/i.test(all) ||
        /the node to be removed is not a child of this node/i.test(all)
      )
        return;
      return orig.apply(console, arguments);
    }
    /* extNoiseLockConsole1: lock console.* — le estensioni non devono ripristinare l'originale */
    try {
      Object.defineProperty(console, level, {
        configurable: true,
        enumerable: true,
        get: function () {
          return filtered;
        },
        set: function (fn) {
          if (typeof fn !== "function") return;
          orig = function () {
            var a = "";
            for (var i = 0; i < arguments.length; i += 1) a += " " + msgOf(arguments[i]);
            if (isExtensionNoise(a) || isCspReportOnlyNoise(a)) return;
            return fn.apply(console, arguments);
          };
        },
      });
    } catch (eLock) {
      console[level] = filtered;
    }
  });

  /* extNoiseLockConsole1 / violPass7: ri-assert rejection filter più a lungo (async listener su user/) */
  try {
    var reassertUntil = Date.now() + 90000;
    var reassertId = window.setInterval(function () {
      if (Date.now() > reassertUntil) {
        window.clearInterval(reassertId);
        return;
      }
      try {
        window.addEventListener(
          "unhandledrejection",
          function (ev) {
            var blob = "";
            try {
              blob = [ev && ev.reason, ev && ev.message, ev && ev.type].map(msgOf).join(" ");
            } catch (eB) {}
            if (!isExtensionNoise(ev.reason) && !isExtensionNoise(msgOf(ev.reason)) && !isExtensionNoise(blob)) return;
            try {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              if (ev.stopPropagation) ev.stopPropagation();
            } catch (eR) {}
            return false;
          },
          true,
        );
        window.onunhandledrejection = function (ev) {
          if (!isExtensionNoise(ev && ev.reason) && !isExtensionNoise(msgOf(ev && ev.reason))) return;
          try {
            ev.preventDefault();
            ev.stopImmediatePropagation();
          } catch (e4) {}
          return false;
        };
      } catch (eAdd) {}
    }, 800);
  } catch (eKeepAlive) {}
})();

/* extConsoleKill1 */
/* welcomePronouns9 */
/* console429Kill1 */
/* rankFastPaint1 */
/* consoleAllPages1 */
/* extNoiseKill2 */
/* consoleStormKill3 */
/* notifSheetSync1 */
/* consoleErrFix1 */
/* extCspNoiseKill1 */
/* console429Everywhere1 */
/* notif429Everywhere1 */
/* consoleExtRemoveChild1 */
/* consoleViolationKill1 */
/* consoleNoiseKill2 */
/* consoleAsyncListenerKill1 */
/* consoleAsyncListenerKill2 */
/* extNoiseUseCache1 */
/* extNoiseLockConsole1 */
/* violPass9 */
/* extNoiseHide18 */
/* violKill1 */
/* extOnly1 */
/* extOnlyFix1 */
/* asyncListenerKill3 */
/* violPass5 */
/* violPass7 */


/* removeChildKill1 */
/* violPass8 */
/* violPass9 */
