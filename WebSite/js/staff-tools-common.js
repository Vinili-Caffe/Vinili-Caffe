(function (global) {
  function isLocalOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function cfgValueOrEmpty(v) {
    var s = String(v == null ? "" : v).trim();
    return s && s !== "#" && !/\{\{/.test(s) ? s : "";
  }

  function isCoarseMobile() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    } catch (e) {
      return false;
    }
  }

  /** Timeout fetch adattivo (mobile / rete lenta): evita falsi timeout a 20s. */
  function resolveFetchTimeoutMs(preferred) {
    var base = Math.max(8000, Number(preferred) || 45000);
    try {
      if (global.VcPerf && typeof global.VcPerf.fetchTimeouts === "function") {
        return global.VcPerf.fetchTimeouts({ fetchTimeoutMs: base }).fetchTimeoutMs;
      }
    } catch (ePerf) {}
    try {
      var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      var et = String((conn && conn.effectiveType) || "").toLowerCase();
      if (et === "slow-2g" || et === "2g") return Math.max(base, 55000);
      if (et === "3g") return Math.max(base, 45000);
    } catch (eConn) {}
    if (isCoarseMobile()) return Math.max(base, 45000);
    return Math.max(base, 30000);
  }

  function resolveApiUrl(cfgObj, fallbackPath) {
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

  function getToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        var shared = String(window.__vcDiscordGetAccessToken() || "").trim();
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

  function whenDiscordSessionReady(fn, maxWaitMs) {
    if (typeof fn !== "function") return;
    var wait = Number(maxWaitMs);
    if (!Number.isFinite(wait) || wait <= 0) wait = 2000;
    var started = Date.now();
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      fn();
    }
    if (getToken() || window.__VC_DISCORD_PROFILE) {
      finish();
      return;
    }
    window.addEventListener("vc-discord-profile", finish, { once: true });
    (function poll() {
      if (done) return;
      if (getToken() || window.__VC_DISCORD_PROFILE) {
        finish();
        return;
      }
      if (Date.now() - started >= wait) {
        finish();
        return;
      }
      window.setTimeout(poll, 120);
    })();
  }

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

  function setStatus(elId, text, isError) {
    var el = byId(elId);
    if (el) {
      el.textContent = "";
      el.hidden = true;
      el.classList.remove("is-error");
    }
    var msg = String(text || "").trim();
    if (!msg) {
      hideStaffToast();
      return;
    }
    showStaffToast(msg, Boolean(isError));
  }

  var staffToastTimer = null;

  function staffToastHostEl() {
    if (global.VcSiteToast && typeof global.VcSiteToast.host === "function") {
      try {
        return global.VcSiteToast.host();
      } catch (eH) {}
    }
    var host = byId("vc-staff-toast-host") || byId("vc-site-toast-host") || byId("vc-dash-save-toast-host");
    if (host) return host;
    host = document.createElement("div");
    host.id = "vc-staff-toast-host";
    host.className = "vc-dash-save-toast-host vc-staff-toast-host";
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-atomic", "true");
    document.body.appendChild(host);
    return host;
  }

  function hideStaffToast() {
    if (global.VcSiteToast && typeof global.VcSiteToast.hide === "function") {
      global.VcSiteToast.hide();
      return;
    }
    if (staffToastTimer) {
      clearTimeout(staffToastTimer);
      staffToastTimer = null;
    }
    var host = byId("vc-staff-toast-host") || byId("vc-site-toast-host");
    if (host) host.innerHTML = "";
  }

  function staffToastLooksPending(text) {
    var s = String(text || "").trim();
    return /[…]$|\.\.\.$/.test(s);
  }

  function showStaffToast(msg, isError, opts) {
    // /notifications: nessun toast staff (Personali o Staff).
    try {
      if (document.body && document.body.classList.contains("vc-notifications-page")) {
        hideStaffToast();
        return;
      }
    } catch (eScopeToast) {}
    if (global.VcSiteToast && typeof global.VcSiteToast.show === "function") {
      global.VcSiteToast.show(msg, isError, opts);
      return;
    }
    var text = String(msg || "").trim();
    if (!text) {
      hideStaffToast();
      return;
    }
    var host = staffToastHostEl();
    hideStaffToast();
    var pending = Boolean(opts && opts.pending) || (!isError && staffToastLooksPending(text));
    var toast = document.createElement("div");
    toast.className =
      "vc-dash-save-toast" +
      (isError ? " is-error" : "") +
      (pending ? " is-pending" : "");
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
    staffToastTimer = setTimeout(
      function () {
        toast.classList.add("is-leaving");
        toast.classList.remove("is-visible");
        setTimeout(function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 200);
        staffToastTimer = null;
      },
      isError ? 3200 : 1400,
    );
  }

  function onAccessReady(fn) {
    if (typeof fn !== "function") return;
    var done = false;
    function run() {
      if (done) return;
      done = true;
      fn();
    }
    if (
      window.__VC_ACCESS_OK ||
      document.documentElement.classList.contains("vc-staff-app-revealed")
    ) {
      run();
      return;
    }
    window.addEventListener("vc:staff-access-ok", run, { once: true });
    window.addEventListener("vc:access-ok", run, { once: true });
    var earlyMs = isCoarseMobile() ? 1800 : 900;
    setTimeout(function () {
      if (
        window.__VC_ACCESS_OK ||
        document.documentElement.classList.contains("vc-staff-app-revealed")
      ) {
        run();
      }
    }, earlyMs);
    setTimeout(run, isCoarseMobile() ? 28000 : 22000);
  }

  function isStaffCinePage() {
    try {
      if (document.body && document.body.classList.contains("vc-notifications-page")) return false;
    } catch (eNotif) {}
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/staff") return true;
    if (
      p === "/staff/inbox" ||
      p === "/staff/guida" ||
      p === "/staff/pause" ||
      p === "/staff/gestione" ||
      p === "/staff/organico" ||
      p === "/staff/punti-tolti"
    ) {
      return true;
    }
    var root = document.documentElement;
    if (
      root &&
      (root.classList.contains("vc-staff-cine-route") || root.classList.contains("vc-staff-inbox-route"))
    ) {
      return true;
    }
    var body = document.body;
    if (
      body &&
      (body.classList.contains("vc-staff-inbox-page") ||
        body.classList.contains("vc-staff-cine-page") ||
        body.classList.contains("vc-staff-manage-page") ||
        body.classList.contains("vc-staff-organico-page") ||
        body.classList.contains("vc-staff-guide-page") ||
        body.classList.contains("vc-staff-profile-home"))
    ) {
      return true;
    }
    return Boolean(
      root && root.classList.contains("vc-site-polish") && root.classList.contains("vc-staff-route"),
    );
  }

  function sanitizeStaffChrome() {
    if (!document.body || !document.body.classList.contains("vc-staff-area")) return;
    // Pagine cine (inbox/guida/pause/gestione/profilo): non toccare atmosfera.
    if (isStaffCinePage()) return;
    try {
      document.documentElement.classList.remove("vc-site-polish", "vc-page-cine-boot");
      document.body.classList.remove("vc-site-polish", "vc-page-cine-layout");
      try {
        delete document.body.dataset.vcPageCineLayout;
      } catch (eData) {}
    } catch (eCls) {}
    try {
      var atmos = document.querySelectorAll(".vc-site-atmos, .vc-home-cine, .vc-home-scrollcue");
      for (var a = 0; a < atmos.length; a++) {
        if (atmos[a].parentNode) atmos[a].parentNode.removeChild(atmos[a]);
      }
    } catch (eAt) {}
    try {
      var nav = document.querySelector("body.vc-staff-area header .vc-nav-shell");
      if (nav) nav.classList.remove("vc-glass", "vc-nav-shell--scrolled", "vc-home-panel", "vc-fx-card");
    } catch (eNav) {}
    try {
      var panels = document.querySelectorAll(
        ".vc-staff-panel, .vc-staff-dash, .vc-staff-tools-workspace, main.vc-staff-shell",
      );
      for (var i = 0; i < panels.length; i++) {
        var el = panels[i];
        el.classList.remove("vc-home-panel", "vc-fx-card", "vc-home-rise", "is-in", "is-tilting", "vc-page-cine-card");
        try {
          var sheens = el.querySelectorAll(":scope > .vc-fx-sheen");
          for (var s = 0; s < sheens.length; s++) sheens[s].remove();
        } catch (eSh) {}
      }
    } catch (ePan) {}
  }

  function registerPtrRefresh(fn) {
    if (typeof fn !== "function") return;
    // Soft PTR è opt-in: di default il pull fa sempre location.reload().
    // Se una pagina vuole soft, setta __vcPtrPreferSoft = true e registra qui.
    var wrapped = function () {
      return Promise.resolve()
        .then(function () {
          return fn();
        })
        .then(function (out) {
          return out;
        });
    };
    window.__vcStaffPageRefresh = wrapped;
    window.__vcPtrSoftRefresh = wrapped;
  }

  function ensureStaffCineLayout() {
    if (!isStaffCinePage()) return;
    try {
      if (typeof window.__vcBootStaffCineLayout === "function") {
        window.__vcBootStaffCineLayout(true);
        return;
      }
    } catch (eBoot) {}
    try {
      if (typeof window.__vcPageHeroLayout === "function") {
        window.__vcPageHeroLayout({ force: true });
      }
    } catch (eLayout) {}
  }

  function bootPage(initFn) {
    sanitizeStaffChrome();
    function runWhenReady() {
      sanitizeStaffChrome();
      onAccessReady(function () {
        // Access gate rivela main dopo il primo boot cine → layout a volte resta “piatto”
        // finché non ricarichi. Forza di nuovo qui (gestione/pause/organico/…).
        ensureStaffCineLayout();
        window.setTimeout(ensureStaffCineLayout, 80);
        window.setTimeout(ensureStaffCineLayout, 280);
        if (typeof initFn === "function") initFn();
        window.setTimeout(ensureStaffCineLayout, 600);
      });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runWhenReady, { once: true });
    } else {
      runWhenReady();
    }
    window.setTimeout(sanitizeStaffChrome, 400);
    window.setTimeout(sanitizeStaffChrome, 1800);
    window.setTimeout(ensureStaffCineLayout, 500);
    window.setTimeout(ensureStaffCineLayout, 1600);
  }

  var PANEL_SKELETON =
    '<div class="vc-staff-panel-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>';

  function showPanelLoading(elId) {
    var el = byId(elId);
    if (!el) return;
    el.hidden = false;
    el.classList.add("vc-staff-panel", "is-loading");
    if (el.querySelector(".vc-staff-panel-skeleton")) return;
    if (el.children.length > 0) {
      var skWrap = document.createElement("div");
      skWrap.className = "vc-staff-panel-skeleton";
      skWrap.setAttribute("aria-hidden", "true");
      skWrap.innerHTML = "<span></span><span></span><span></span>";
      el.appendChild(skWrap);
      return;
    }
    if (!el.textContent.trim()) {
      el.innerHTML = PANEL_SKELETON;
    }
  }

  function clearPanelLoading(elId) {
    var el = byId(elId);
    if (!el) return;
    el.classList.remove("is-loading");
    var sk = el.querySelector(".vc-staff-panel-skeleton");
    if (sk) sk.remove();
  }

  function fetchJson(url, options) {
    var opts = options || {};
    var method = String(opts.method || "GET").toUpperCase();
    if (
      method === "GET" &&
      opts.cache !== false &&
      global.VcApiCache &&
      typeof global.VcApiCache.fetchStaffJson === "function"
    ) {
      var headers = Object.assign({ Authorization: "Bearer " + getToken() }, opts.headers || {});
      return global.VcApiCache.fetchStaffJson(url, {
        headers: headers,
        timeoutMs: resolveFetchTimeoutMs(opts.timeoutMs),
        ttlMs: opts.ttlMs,
        staleMs: opts.staleMs,
        persistMs: opts.persistMs,
        cacheScope: opts.cacheScope || "staff",
        cache: opts.cache,
        onStale: opts.onStale,
      });
    }
    var headers = Object.assign({ Authorization: "Bearer " + getToken() }, opts.headers || {});
    var timeoutMs = resolveFetchTimeoutMs(opts.timeoutMs);
    var fetchOpts = {
      method: opts.method || "GET",
      headers: headers,
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      body: opts.body,
    };
    var timer = null;
    var settled = false;
    var timedOutByUs = false;
    var externalAbort = false;
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (ctrl) fetchOpts.signal = ctrl.signal;
    if (ctrl && opts.signal) {
      try {
        if (typeof opts.signal.aborted !== "undefined" && opts.signal.aborted) {
          externalAbort = true;
          ctrl.abort();
        } else if (typeof opts.signal.addEventListener === "function") {
          opts.signal.addEventListener(
            "abort",
            function () {
              externalAbort = true;
              try {
                ctrl.abort();
              } catch (eLink) {}
            },
            { once: true },
          );
        }
      } catch (eSig) {}
    }
    function timeoutPayload() {
      return {
        res: { ok: false, status: 408 },
        data: { ok: false, error: "timeout", message: "Timeout: il server impiega troppo tempo. Riprova." },
      };
    }
    function abortedPayload() {
      return {
        res: { ok: false, status: 0 },
        data: { ok: false, error: "aborted", message: "" },
      };
    }
    function clearTimers() {
      if (timer) window.clearTimeout(timer);
      timer = null;
    }
    if (ctrl) {
      timer = window.setTimeout(function () {
        timedOutByUs = true;
        try {
          ctrl.abort();
        } catch (eAb) {}
      }, timeoutMs);
    }
    var fetchPromise = fetch(url, fetchOpts)
      .then(function (res) {
        if (settled) return externalAbort && !timedOutByUs ? abortedPayload() : timeoutPayload();
        settled = true;
        clearTimers();
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { res: res, data: data };
          });
      })
      .catch(function (err) {
        if (settled) return externalAbort && !timedOutByUs ? abortedPayload() : timeoutPayload();
        settled = true;
        clearTimers();
        var isAbort =
          err &&
          (err.name === "AbortError" || String(err.message || "").toLowerCase().indexOf("abort") >= 0);
        if (isAbort) {
          // Abort esterno (nuovo load / cambio tab): non mascherarlo da timeout.
          if (externalAbort && !timedOutByUs) return abortedPayload();
          return timeoutPayload();
        }
        throw err;
      });
    return Promise.race([
      fetchPromise,
      new Promise(function (resolve) {
        window.setTimeout(function () {
          if (settled) return;
          settled = true;
          timedOutByUs = true;
          clearTimers();
          try {
            if (ctrl) ctrl.abort();
          } catch (eRace) {}
          resolve(timeoutPayload());
        }, timeoutMs + 1500);
      }),
    ]);
  }

  function formatAge(iso) {
    if (!iso) return "\u2014";
    var t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "\u2014";
    var mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (mins < 60) return mins + "m";
    var hours = Math.floor(mins / 60);
    if (hours < 48) return hours + "h";
    return Math.floor(hours / 24) + "g";
  }

  /** Discord default avatar index (new: id >> 22 % 6). */
  function defaultAvatarUrl(userId) {
    var id = String(userId || "").trim();
    var idx = 0;
    if (/^\d{5,24}$/.test(id)) {
      try {
        idx = Number((BigInt(id) >> 22n) % 6n);
      } catch (e) {
        var n = 0;
        for (var i = 0; i < id.length; i += 1) n = (n + id.charCodeAt(i)) % 6;
        idx = n;
      }
    }
    return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
  }

  function isSnowflakeLabel(value) {
    return /^\d{16,22}$/.test(String(value || "").trim());
  }

  /** Never show a raw Discord ID as a human label. */
  function userLabel(displayName, userId, fallback) {
    var name = String(displayName || "").trim();
    var uid = String(userId || "").trim();
    if (name && name !== uid && !isSnowflakeLabel(name)) return name;
    return String(fallback || "Utente");
  }

  /**
   * Avatar <img> with data-user-id + onerror \u2192 Discord default \u2192 never broken icon.
   */
  function avatarImgHtml(avatarUrl, userId, attrs) {
    var a = attrs || {};
    var w = a.width != null ? a.width : 40;
    var h = a.height != null ? a.height : 40;
    var cls = a.className ? String(a.className) : "vc-staff-avatar";
    var uid = String(userId || "").trim();
    var loading = a.loading != null ? String(a.loading) : "lazy";
    var fetchPriority = a.fetchPriority ? String(a.fetchPriority) : "";
    var src = String(avatarUrl || "").trim() || defaultAvatarUrl(uid);
    var fb = defaultAvatarUrl(uid);
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
      '" loading="' +
      esc(loading) +
      '" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1"' +
      (fetchPriority ? ' fetchpriority="' + esc(fetchPriority) + '"' : "") +
      (uid ? ' data-user-id="' + esc(uid) + '"' : "") +
      ' onerror="' +
      onerr +
      '" />'
    );
  }

  /**
   * Dialog personalizzati (VcDialog). Fallback nativo solo se lo script non è caricato.
   *   T.confirm({ title, message, confirmLabel, cancelLabel, danger, icon }) → Promise<boolean>
   *   T.prompt({ title, message, label, placeholder, defaultValue, ... }) → Promise<string|null>
   *   T.alert({ title, message, okLabel, danger, icon }) → Promise<void>
   */
  function normalizeDialogOpts(opts, fallbackMessage) {
    if (typeof opts === "string") return { message: opts };
    var o = opts && typeof opts === "object" ? opts : {};
    if (!o.message && fallbackMessage) o = Object.assign({ message: fallbackMessage }, o);
    return o;
  }

  function confirmDialog(opts) {
    var o = normalizeDialogOpts(opts, "Confermi?");
    if (global.VcDialog && typeof global.VcDialog.confirm === "function") {
      return global.VcDialog.confirm(o);
    }
    return Promise.resolve(window.confirm(String(o.message || o.title || "Confermi?")));
  }

  function promptDialog(opts) {
    var o = normalizeDialogOpts(opts, "");
    if (global.VcDialog && typeof global.VcDialog.prompt === "function") {
      return global.VcDialog.prompt(o);
    }
    var raw = window.prompt(
      String(o.message || o.label || o.title || "Inserisci"),
      o.defaultValue != null ? String(o.defaultValue) : o.value != null ? String(o.value) : "",
    );
    return Promise.resolve(raw == null ? null : String(raw));
  }

  function alertDialog(opts) {
    var o = normalizeDialogOpts(opts, "");
    if (global.VcDialog && typeof global.VcDialog.alert === "function") {
      return global.VcDialog.alert(o);
    }
    window.alert(String(o.message || o.title || ""));
    return Promise.resolve();
  }

  global.VCStaffTools = {
    resolveApiUrl: resolveApiUrl,
    getToken: getToken,
    whenDiscordSessionReady: whenDiscordSessionReady,
    byId: byId,
    esc: esc,
    setStatus: setStatus,
    showStaffToast: showStaffToast,
    hideStaffToast: hideStaffToast,
    fetchJson: fetchJson,
    resolveFetchTimeoutMs: resolveFetchTimeoutMs,
    isCoarseMobile: isCoarseMobile,
    formatAge: formatAge,
    defaultAvatarUrl: defaultAvatarUrl,
    userLabel: userLabel,
    isSnowflakeLabel: isSnowflakeLabel,
    avatarImgHtml: avatarImgHtml,
    onAccessReady: onAccessReady,
    bootPage: bootPage,
    registerPtrRefresh: registerPtrRefresh,
    showPanelLoading: showPanelLoading,
    clearPanelLoading: clearPanelLoading,
    confirm: confirmDialog,
    prompt: promptDialog,
    alert: alertDialog,
  };
})(window);
