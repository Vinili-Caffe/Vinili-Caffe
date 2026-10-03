/**
 * subjectLiveChat1 — FAB chat appelli/candidature (basso destra) + badge unread.
 * Deep-link ?chat= apre il pannello; senza param mostra FAB se c'è almeno una chat invitata.
 */
(function (global) {
  "use strict";

  var ASSET_V = "20260929smartNotifLife1";
  var PAGE_QUEUE = detectPageQueue();
  var state = {
    loaded: false,
    open: false,
    chats: [],
    activeKey: "",
    unreadByKey: Object.create(null),
    unreadTotal: 0,
    overlay: null,
    fab: null,
    pollTimer: null,
  };

  function detectPageQueue() {
    try {
      var p = String(location.pathname || "").toLowerCase();
      if (p.indexOf("/candidature") === 0) return "candidature";
      if (p.indexOf("/appelli") === 0) return "appelli";
    } catch (e) {}
    return "appelli";
  }

  function qsChat() {
    try {
      return String(new URLSearchParams(location.search).get("chat") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function loadCss(href) {
    return new Promise(function (resolve) {
      if (document.querySelector('link[data-vc-wfc-css="' + href + '"]')) {
        resolve();
        return;
      }
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-vc-wfc-css", href);
      link.onload = function () {
        resolve();
      };
      link.onerror = function () {
        resolve();
      };
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-vc-wfc-src="' + src + '"]')) {
        if (global.VcWorkflowChat) {
          resolve();
          return;
        }
        waitForGlobal("VcWorkflowChat", 4000).then(function (hit) {
          if (hit) resolve();
          else reject(new Error("load_timeout:" + src));
        });
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.setAttribute("data-vc-wfc-src", src);
      s.onload = function () {
        waitForGlobal("VcWorkflowChat", 4000).then(function (hit) {
          if (hit) resolve();
          else reject(new Error("load_timeout:" + src));
        });
      };
      s.onerror = function () {
        reject(new Error("load_failed:" + src));
      };
      document.head.appendChild(s);
    });
  }

  function waitForGlobal(name, maxMs) {
    return new Promise(function (resolve) {
      var started = Date.now();
      (function poll() {
        if (global[name]) {
          resolve(global[name]);
          return;
        }
        if (Date.now() - started >= maxMs) {
          resolve(null);
          return;
        }
        setTimeout(poll, 40);
      })();
    });
  }

  function getToken() {
    try {
      if (typeof global.__vcDiscordGetAccessToken === "function") {
        var shared = String(global.__vcDiscordGetAccessToken() || "").trim();
        if (shared) return shared;
      }
      var t = localStorage.getItem("vc_discord_access_token");
      if (!t) return "";
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function cfgValueOrEmpty(v) {
    var s = String(v == null ? "" : v).trim();
    return s && !/\{\{/.test(s) ? s : "";
  }

  function isLocalOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function resolveApiUrl(cfgObj, fallbackPath) {
    var T = global.VCStaffTools;
    if (T && typeof T.resolveApiUrl === "function") {
      return T.resolveApiUrl(cfgObj, fallbackPath);
    }
    var c = cfgObj || {};
    var local = cfgValueOrEmpty(c.apiUrlLocal);
    var base = isLocalOrigin() && local ? local : cfgValueOrEmpty(c.apiUrl) || fallbackPath;
    try {
      if (/^https?:\/\//i.test(base)) {
        var apiU = new URL(base);
        var pageU = new URL(window.location.href);
        if (apiU.host !== pageU.host && apiU.protocol === pageU.protocol) {
          base = apiU.pathname + (apiU.search || "");
        }
      }
    } catch (eN) {}
    return base;
  }

  function esc(s) {
    var T = global.VCStaffTools;
    if (T && typeof T.esc === "function") return T.esc(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function avatarHtml(url, id, opts) {
    var T = global.VCStaffTools;
    if (T && typeof T.avatarImgHtml === "function") {
      return T.avatarImgHtml(url, id, opts);
    }
    opts = opts || {};
    var cls = String(opts.className || "vc-wfc-avatar").trim() || "vc-wfc-avatar";
    var w = Number(opts.width) || 32;
    var h = Number(opts.height) || 32;
    var uid = String(id || "").trim();
    var fb = "";
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        fb = window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eFb) {}
    if (!fb) {
      var svgInline =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
      fb = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgInline);
    }
    var src = String(url || "").trim();
    if (!src || /cdn\.discordapp\.com\/embed\/avatars\//i.test(src)) src = fb;
    var onerr = "this.onerror=null;this.src='" + fb.replace(/'/g, "%27") + "';";
    return (
      '<img class="' +
      esc(cls) +
      '" src="' +
      esc(src) +
      '" alt="" width="' +
      esc(w) +
      '" height="' +
      esc(h) +
      '" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1"' +
      (uid ? ' data-user-id="' + esc(uid) + '"' : "") +
      ' onerror="' +
      onerr +
      '" />'
    );
  }

  function fetchJson(url, options) {
    var T = global.VCStaffTools;
    if (T && typeof T.fetchJson === "function") {
      return T.fetchJson(url, options);
    }
    options = options || {};
    var token = getToken();
    var headers = Object.assign({}, options.headers || {});
    if (token) headers.Authorization = "Bearer " + token;
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    var timeoutMs = Number(options.timeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = 20000;
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    var fetchOpts = {
      method: options.method || "GET",
      headers: headers,
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      body: options.body,
    };
    if (ctrl) fetchOpts.signal = ctrl.signal;
    if (ctrl) {
      timer = setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eAb) {}
      }, timeoutMs);
    }
    return fetch(url, fetchOpts)
      .then(function (res) {
        if (timer) clearTimeout(timer);
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { res: res, data: data || {} };
          });
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        return {
          res: { ok: false, status: 0 },
          data: { ok: false, error: "network", message: "Errore di rete." },
        };
      });
  }

  function subjectTools() {
    return {
      resolveApiUrl: resolveApiUrl,
      getToken: getToken,
      esc: esc,
      avatarHtml: avatarHtml,
      fetchJson: fetchJson,
      byId: byId,
    };
  }

  function workflowsApiBase() {
    return resolveApiUrl(global.__VC_USER_WORKFLOWS || {}, "/webhooks/site-user-workflows");
  }

  function notificationsApiBase() {
    return resolveApiUrl(global.__VC_SITE_NOTIFICATIONS || {}, "/webhooks/site-notifications");
  }

  function whenReady(fn) {
    var started = Date.now();
    (function poll() {
      if (getToken() || global.__VC_DISCORD_PROFILE) {
        fn();
        return;
      }
      if (Date.now() - started > 12000) {
        fn();
        return;
      }
      setTimeout(poll, 150);
    })();
  }

  function ensureFab() {
    if (state.fab && state.fab.parentNode) return state.fab;
    var fab = document.createElement("div");
    fab.id = "vc-wfc-live-fab";
    fab.className = "vc-wfc-live-fab";
    fab.hidden = true;
    fab.innerHTML =
      '<button type="button" class="vc-wfc-live-fab__btn" aria-expanded="false" aria-controls="vc-wfc-live-dock" aria-label="Chat con lo staff">' +
      '<i class="fa fa-comments" aria-hidden="true"></i>' +
      '<span class="vc-wfc-live-fab__badge" id="vc-wfc-live-fab-badge" hidden>0</span>' +
      "</button>";
    document.body.appendChild(fab);
    fab.querySelector(".vc-wfc-live-fab__btn").addEventListener("click", function () {
      if (state.open) collapseDock();
      else expandDock(state.activeKey || (state.chats[0] && state.chats[0].dedupeKey) || "");
    });
    state.fab = fab;
    return fab;
  }

  function setFabVisible(on) {
    var fab = ensureFab();
    fab.hidden = !on;
    if (!on) fab.classList.remove("is-open");
  }

  function syncFabBadge() {
    var badge = document.getElementById("vc-wfc-live-fab-badge");
    if (!badge) return;
    var n = Number(state.unreadTotal) || 0;
    if (n <= 0) {
      badge.hidden = true;
      badge.textContent = "0";
      return;
    }
    badge.hidden = false;
    badge.textContent = n > 99 ? "99+" : String(n);
  }

  function chatLabel(item) {
    var title = String((item && item.title) || "").trim();
    if (title) return title;
    var q = String((item && item.queue) || PAGE_QUEUE).toLowerCase();
    return q === "candidature" ? "Candidatura" : "Appello";
  }

  function ensureDock() {
    if (state.overlay && state.overlay.parentNode) return state.overlay;
    var dock = document.createElement("div");
    dock.id = "vc-wfc-live-dock";
    dock.className = "vc-wfc-live-dock";
    dock.hidden = true;
    dock.setAttribute("role", "dialog");
    dock.setAttribute("aria-label", "Chat con lo staff");
    dock.innerHTML =
      '<div class="vc-wfc-live-dock__panel">' +
      '<div class="vc-wfc-live-dock__top">' +
      '<div class="vc-wfc-live-dock__title"><strong>Chat staff</strong>' +
      '<span class="vc-wfc-live-dock__hint" id="vc-wfc-live-dock-hint"></span></div>' +
      '<button type="button" class="vc-wfc-live-dock__close" aria-label="Chiudi">&times;</button></div>' +
      '<div class="vc-wfc-live-dock__tabs" id="vc-wfc-live-dock-tabs" hidden></div>' +
      '<div id="vc-wfc-subject-mount" class="vc-wfc-live-dock__mount"></div></div>';
    document.body.appendChild(dock);
    dock.querySelector(".vc-wfc-live-dock__close").addEventListener("click", collapseDock);
    state.overlay = dock;
    return dock;
  }

  function renderTabs() {
    var host = document.getElementById("vc-wfc-live-dock-tabs");
    if (!host) return;
    if (state.chats.length <= 1) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    host.hidden = false;
    host.innerHTML = state.chats
      .map(function (c) {
        var key = String(c.dedupeKey || "");
        var unread = Number(state.unreadByKey[key] || 0);
        var active = key === state.activeKey;
        return (
          '<button type="button" class="vc-wfc-live-dock__tab' +
          (active ? " is-active" : "") +
          '" data-vc-live-chat="' +
          esc(key) +
          '">' +
          '<span>' +
          esc(chatLabel(c)) +
          "</span>" +
          (unread > 0
            ? '<span class="vc-wfc-live-dock__tab-badge">' + esc(unread > 99 ? "99+" : String(unread)) + "</span>"
            : "") +
          "</button>"
        );
      })
      .join("");
    host.querySelectorAll("[data-vc-live-chat]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = String(btn.getAttribute("data-vc-live-chat") || "").trim();
        if (key) expandDock(key);
      });
    });
  }

  function setUrlChat(key) {
    try {
      var u = new URL(location.href);
      if (key) u.searchParams.set("chat", key);
      else u.searchParams.delete("chat");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (e1) {}
  }

  function collapseDock() {
    state.open = false;
    if (global.VcWorkflowChat) {
      try {
        global.VcWorkflowChat.teardown();
      } catch (e0) {}
    }
    if (state.overlay) {
      state.overlay.hidden = true;
      state.overlay.classList.remove("is-open");
    }
    if (state.fab) {
      state.fab.classList.remove("is-open");
      var btn = state.fab.querySelector(".vc-wfc-live-fab__btn");
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
    setUrlChat("");
  }

  function showMountError(msg) {
    var mountFail = document.getElementById("vc-wfc-subject-mount");
    if (mountFail) mountFail.innerHTML = '<p class="vc-wfc-error">' + esc(msg) + "</p>";
  }

  function bootChat(dedupeKey) {
    if (!global.VcWorkflowChat) {
      showMountError("Chat non disponibile.");
      return;
    }
    if (!getToken()) {
      showMountError("Accedi con Discord per aprire la chat.");
      return;
    }
    var mount = document.getElementById("vc-wfc-subject-mount");
    if (!mount) return;
    var hint = document.getElementById("vc-wfc-live-dock-hint");
    var itemMeta = state.chats.filter(function (c) {
      return String(c.dedupeKey) === String(dedupeKey);
    })[0];
    if (hint) hint.textContent = chatLabel(itemMeta) || "Discussione";

    var T = subjectTools();
    try {
      global.VcWorkflowChat.teardown();
    } catch (eT) {}
    global.VcWorkflowChat.init({
      apiBase: function () {
        return T.resolveApiUrl(
          global.__VC_USER_WORKFLOW_CHAT || global.__VC_STAFF_WORKFLOW_CHAT,
          "/webhooks/site-user-workflow-chat",
        );
      },
      getProfileId: function () {
        return String((global.__VC_DISCORD_PROFILE && global.__VC_DISCORD_PROFILE.id) || "");
      },
      dedupeKeyForItem: function (item) {
        return String((item && (item.dedupeKey || item.key)) || dedupeKey || "");
      },
      esc: T.esc,
      avatarHtml: T.avatarHtml,
      fetchJson: T.fetchJson,
      byId: T.byId,
      getToken: T.getToken,
      sendBtnClass: "vc-wfc-send-btn",
      panelTitle: "Discussione",
      panelHint: "Messaggi con lo staff",
      userKindLabel: "Tu",
      closedMessage: "Chat in sola lettura.",
    });

    var item = { status: "pending", dedupeKey: dedupeKey, queue: PAGE_QUEUE };
    mount.innerHTML = global.VcWorkflowChat.renderPanel(item, "");
    global.VcWorkflowChat.boot(item, "");
    markChatRead(dedupeKey);
  }

  function expandDock(dedupeKey) {
    var key = String(dedupeKey || "").trim();
    if (!key && state.chats[0]) key = String(state.chats[0].dedupeKey || "");
    if (!key) return;
    ensureAssets().then(function () {
      var dock = ensureDock();
      ensureFab();
      state.open = true;
      state.activeKey = key;
      dock.hidden = false;
      dock.classList.add("is-open");
      if (state.fab) {
        state.fab.classList.add("is-open");
        var btn = state.fab.querySelector(".vc-wfc-live-fab__btn");
        if (btn) btn.setAttribute("aria-expanded", "true");
      }
      setUrlChat(key);
      renderTabs();
      var mount = document.getElementById("vc-wfc-subject-mount");
      if (mount) mount.innerHTML = '<p class="vc-wfc-empty">Caricamento chat…</p>';
      whenReady(function () {
        bootChat(key);
      });
    });
  }

  function mergeChat(item) {
    var key = String((item && item.dedupeKey) || "").trim();
    if (!key) return;
    var found = false;
    for (var i = 0; i < state.chats.length; i += 1) {
      if (String(state.chats[i].dedupeKey) === key) {
        state.chats[i] = Object.assign({}, state.chats[i], item);
        found = true;
        break;
      }
    }
    if (!found) state.chats.push(item);
  }

  function fetchInvitedChats() {
    if (!getToken()) return Promise.resolve([]);
    var base = workflowsApiBase();
    var url =
      base +
      (base.indexOf("?") >= 0 ? "&" : "?") +
      "subjectChats=1&queue=" +
      encodeURIComponent(PAGE_QUEUE);
    return fetchJson(url, { method: "GET", timeoutMs: 15000 }).then(function (out) {
      var items = out && out.data && Array.isArray(out.data.items) ? out.data.items : [];
      return items.filter(function (row) {
        return String(row.queue || PAGE_QUEUE).toLowerCase() === PAGE_QUEUE;
      });
    });
  }

  function fetchUnreadFromNotifs() {
    if (!getToken()) return Promise.resolve({ total: 0, byKey: {} });
    var base = notificationsApiBase();
    return fetchJson(base, { method: "GET", timeoutMs: 12000 }).then(function (out) {
      var rows = [];
      var body = (out && out.data) || {};
      if (Array.isArray(body.items)) rows = body.items;
      else if (Array.isArray(body.notifications)) rows = body.notifications;
      else if (Array.isArray(body.rows)) rows = body.rows;
      var byKey = Object.create(null);
      var total = 0;
      var needle = PAGE_QUEUE === "candidature" ? "/candidature/" : "/appelli/";
      for (var i = 0; i < rows.length; i += 1) {
        var row = rows[i] || {};
        if (row.read === true || row.unread === false) continue;
        var openUrl = String(row.openUrl || row.url || row.href || "").trim();
        if (openUrl.indexOf(needle) < 0 || openUrl.indexOf("chat=") < 0) continue;
        var m = openUrl.match(/[?&]chat=([^&#]+)/);
        if (!m) continue;
        var key = "";
        try {
          key = decodeURIComponent(m[1]);
        } catch (eDec) {
          key = m[1];
        }
        if (!key) continue;
        byKey[key] = (byKey[key] || 0) + 1;
        total += 1;
        mergeChat({
          dedupeKey: key,
          queue: PAGE_QUEUE,
          title: String(row.title || row.body || "").trim() || undefined,
        });
      }
      return { total: total, byKey: byKey };
    });
  }

  function markChatRead(dedupeKey) {
    var key = String(dedupeKey || "").trim();
    if (!key) return;
    if (state.unreadByKey[key]) {
      state.unreadTotal = Math.max(0, (Number(state.unreadTotal) || 0) - Number(state.unreadByKey[key] || 0));
      delete state.unreadByKey[key];
      syncFabBadge();
      renderTabs();
    }
    // Best-effort: mark matching notifs read via existing API if available
    try {
      var base = notificationsApiBase();
      var readUrl = base.replace(/\/?$/, "") + "/read";
      fetchJson(readUrl, {
        method: "POST",
        body: JSON.stringify({ openUrlContains: "chat=" + key }),
        timeoutMs: 8000,
      }).catch(function () {});
    } catch (eRead) {}
  }

  function refreshSessions(opts) {
    opts = opts || {};
    return Promise.all([fetchInvitedChats().catch(function () {
      return [];
    }), fetchUnreadFromNotifs().catch(function () {
      return { total: 0, byKey: {} };
    })]).then(function (pair) {
      var invited = pair[0] || [];
      var unread = pair[1] || { total: 0, byKey: {} };
      invited.forEach(mergeChat);
      var urlKey = qsChat();
      if (urlKey) mergeChat({ dedupeKey: urlKey, queue: PAGE_QUEUE });
      state.unreadByKey = unread.byKey || Object.create(null);
      state.unreadTotal = Number(unread.total) || 0;
      var has = state.chats.length > 0;
      setFabVisible(has);
      syncFabBadge();
      if (has && (opts.autoOpen || urlKey)) {
        expandDock(urlKey || state.chats[0].dedupeKey);
      } else if (state.open) {
        renderTabs();
      }
      return has;
    });
  }

  function ensureAssets() {
    return Promise.resolve()
      .then(function () {
        return loadCss("/css/vc-workflow-chat.css?v=" + ASSET_V);
      })
      .then(function () {
        var chain = Promise.resolve();
        if (!global.VcEmojiPicker) {
          chain = chain.then(function () {
            return loadScript("/js/vc-emoji-picker.js?v=" + ASSET_V).catch(function () {});
          });
        }
        if (!global.VcChatTyping) {
          chain = chain.then(function () {
            return loadScript("/js/vc-chat-typing.js?v=" + ASSET_V).catch(function () {});
          });
        }
        if (!global.VcWorkflowChat) {
          chain = chain.then(function () {
            return loadScript("/js/vc-workflow-chat.js?v=" + ASSET_V);
          });
        }
        return chain;
      })
      .then(function () {
        return waitForGlobal("VcWorkflowChat", 5000);
      })
      .then(function (Wfc) {
        if (!Wfc) throw new Error("wfc_missing");
      });
  }

  function onRealtimeHint(ev) {
    try {
      var detail = (ev && ev.detail) || {};
      var type = String(detail.type || detail.event || "").toLowerCase();
      if (
        type.indexOf("workflow_chat") >= 0 ||
        type.indexOf("notification") >= 0 ||
        type.indexOf("site_notif") >= 0
      ) {
        refreshSessions({ autoOpen: false });
      }
    } catch (eEv) {}
  }

  function start() {
    if (state.loaded) return;
    state.loaded = true;
    ensureFab();
    setFabVisible(false);
    whenReady(function () {
      refreshSessions({ autoOpen: Boolean(qsChat()) });
      if (state.pollTimer) clearInterval(state.pollTimer);
      state.pollTimer = setInterval(function () {
        if (document.hidden) return;
        refreshSessions({ autoOpen: false });
      }, 45000);
    });
    try {
      window.addEventListener("vc:site-realtime", onRealtimeHint);
      window.addEventListener("vc:notifications-updated", onRealtimeHint);
    } catch (eL) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window);
