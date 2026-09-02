(function (global) {
  "use strict";

  function qsChat() {
    try {
      return String(new URLSearchParams(location.search).get("chat") || "").trim();
    } catch (e) {
      return "";
    }
  }

  var dedupeKey = qsChat();
  if (!dedupeKey) return;

  var ASSET_V = "20260825subjChat5";
  var loaded = false;
  var overlay = null;

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
    var idx = 0;
    if (/^\d{17,20}$/.test(uid)) {
      try {
        idx = Number((BigInt(uid) >> 22n) % 6n);
      } catch (eIdx) {
        idx = 0;
      }
    }
    var fb = "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
    var src = String(url || "").trim() || fb;
    var svg =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(%23g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>',
      );
    var onerr =
      "this.onerror=function(){this.onerror=null;this.src='" +
      svg.replace(/'/g, "%27") +
      "';};this.src='" +
      fb.replace(/'/g, "\\'") +
      "';";
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

  function closeOverlay() {
    if (global.VcWorkflowChat) {
      try {
        global.VcWorkflowChat.teardown();
      } catch (e0) {}
    }
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    try {
      var u = new URL(location.href);
      u.searchParams.delete("chat");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (e1) {}
  }

  function openOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "vc-wfc-subject-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Chat pratica");
    overlay.innerHTML =
      '<div class="vc-wfc-subject-overlay__panel">' +
      '<div class="vc-wfc-subject-overlay__top"><strong>Chat con lo staff</strong>' +
      '<button type="button" class="vc-wfc-subject-overlay__close" aria-label="Chiudi">&times;</button></div>' +
      '<div id="vc-wfc-subject-mount"></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (ev) {
      if (ev.target === overlay) closeOverlay();
    });
    var closeBtn = overlay.querySelector(".vc-wfc-subject-overlay__close");
    if (closeBtn) closeBtn.addEventListener("click", closeOverlay);
  }

  function showMountError(msg) {
    var mountFail = document.getElementById("vc-wfc-subject-mount");
    if (mountFail) mountFail.innerHTML = '<p class="vc-wfc-error">' + esc(msg) + "</p>";
  }

  function bootChat() {
    if (!global.VcWorkflowChat) {
      showMountError("Chat non disponibile.");
      return;
    }
    if (!getToken()) {
      showMountError("Accedi con Discord per aprire la chat.");
      return;
    }
    openOverlay();
    var mount = document.getElementById("vc-wfc-subject-mount");
    if (!mount) return;

    var T = subjectTools();
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

    var item = { status: "pending", dedupeKey: dedupeKey };
    mount.innerHTML = global.VcWorkflowChat.renderPanel(item, "");
    global.VcWorkflowChat.boot(item, "");
  }

  function start() {
    if (loaded) return;
    loaded = true;
    openOverlay();
    var mount = document.getElementById("vc-wfc-subject-mount");
    if (mount) mount.innerHTML = '<p class="vc-wfc-empty">Caricamento chat…</p>';

    Promise.resolve()
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
        whenReady(bootChat);
      })
      .catch(function () {
        showMountError("Impossibile caricare la chat.");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window);
