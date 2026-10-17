(function () {
  var VER = "20260930notifSheetFastOpen1";
  var MAX = 1500;
  /* confessionaleClickFreeze1: BGM unlock non blocca più il primo click UI */
  var INTRO_SEEN_KEY = "vc_confessionale_intro_seen_v1";
  var CURTAIN_OPEN_MS = 1600;
  /* Anti ghost-click: arm breve — click/tap affidabile anche su telefono. */
  var SMOKE_ARM_MS = 180;
  var SMOKE_FORCE_ARM_MS = 1400;
  var INTRO_WATCHDOG_MS = 6500;
  var apiCfg = window.__VC_CONFESSIONALE || {};
  var canModerate = false;
  var canAccessStaffBoard = false;
  var writeModalOpen = false;
  var loadedOnce = false;
  var listLoadInFlight = false;
  var listFingerprint = "";
  var stateItems = [];
  var openSheetId = "";
  var board = readBoardFromUrl();
  var fetchGen = 0;
  var confWs = null;
  var confWsReconnectTimer = null;
  var livePollTimer = null;
  var refreshQuietTimer = null;
  var refreshQuietInFlight = false;
  var curtainDone = false;
  var smokeArmed = false;
  var smokeArmTimer = null;
  var curtainOpenTimer = null;
  var scrollLockBound = false;
  var smokeForceArmTimer = null;
  var introWatchdogTimer = null;
  var smokeContinueBound = false;
  /* confListLikeFeedback1: griglia + pager come /feedback/ */
  var confPager = { page: 1, perPage: 9, totalPages: 1, userControlled: false };
  var pagerBound = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function token() {
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function apiUrl() {
    var base = String(apiCfg.apiUrl || "/webhooks/site-confessionale").trim();
    if (!base || /\{\{/.test(base)) base = "/webhooks/site-confessionale";
    try {
      if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
        var loc = String(apiCfg.apiUrlLocal || "").trim();
        if (loc && !/\{\{/.test(loc)) return loc;
      }
    } catch (eL) {}
    return base;
  }

  function toast(msg, kind) {
    var text = String(msg || "").trim();
    if (!text) return;
    var isError = kind === "error";
    var opts = kind === "info" ? { ms: 1600 } : isError ? { ms: 3200 } : { ms: 2000 };
    try {
      if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
        window.VcSiteToast.show(text, isError, opts);
        return;
      }
    } catch (e) {}
    try {
      if (window.VcDashToast && typeof window.VcDashToast.show === "function") {
        window.VcDashToast.show(text, isError, opts);
        return;
      }
    } catch (e2) {}
  }

  function clearInlineFeedback() {
    var fb = byId("vc-conf-feedback");
    if (!fb) return;
    fb.textContent = "";
    fb.classList.remove("is-error");
    fb.hidden = true;
  }

  function readBoardFromUrl() {
    try {
      if (String(new URLSearchParams(location.search || "").get("board") || "").trim().toLowerCase() === "staff") {
        return "staff";
      }
    } catch (eB) {}
    return "community";
  }

  function normalizeBoardId(value) {
    return String(value || "").trim().toLowerCase() === "staff" ? "staff" : "community";
  }

  function isReadTabActive() {
    return true;
  }

  function apiGetUrl() {
    var base = apiUrl();
    if (normalizeBoardId(board) === "staff") {
      return base + (base.indexOf("?") >= 0 ? "&" : "?") + "board=staff";
    }
    return base;
  }

  function syncBoardInUrl() {
    try {
      var u = new URL(location.href);
      if (normalizeBoardId(board) === "staff") u.searchParams.set("board", "staff");
      else u.searchParams.delete("board");
      var next = u.pathname + u.search + u.hash;
      var cur = location.pathname + location.search + location.hash;
      if (next !== cur) history.replaceState(null, "", next);
    } catch (eU) {}
  }

  function isTypingInCommentField() {
    var a = document.activeElement;
    if (!a || !a.id) return false;
    return String(a.id).indexOf("vc-conf-c-") === 0 || String(a.id) === "vc-conf-text";
  }

  function captureCommentDrafts() {
    var map = {};
    var root = byId("vc-conf-list");
    if (!root) return map;
    var nodes = root.querySelectorAll("textarea[id^='vc-conf-c-']");
    for (var i = 0; i < nodes.length; i += 1) {
      var el = nodes[i];
      var id = String(el.id || "");
      var val = String(el.value || "");
      if (id && val) map[id] = val;
    }
    return map;
  }

  function restoreCommentDrafts(map) {
    if (!map) return;
    for (var id in map) {
      if (!Object.prototype.hasOwnProperty.call(map, id)) continue;
      var el = byId(id);
      if (el) el.value = map[id];
    }
  }

  function itemsFingerprint(items) {
    try {
      return JSON.stringify(
        (Array.isArray(items) ? items : []).map(function (it) {
          return {
            id: it && it.id,
            comments: it && it.commentCount,
            body: it && it.content,
            mine: it && it.isMine,
            status: it && it.status,
            reason: it && it.staffReason,
          };
        }),
      );
    } catch (e) {
      return String(Date.now());
    }
  }

  function findItemById(id) {
    var sid = String(id || "").trim();
    for (var i = 0; i < stateItems.length; i += 1) {
      if (String((stateItems[i] && stateItems[i].id) || "") === sid) return stateItems[i];
    }
    return null;
  }

  function previewText(text, maxLen) {
    var s = String(text || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    var max = Math.max(40, Number(maxLen) || 160);
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  function statusMeta(status) {
    var s = String(status || "active").toLowerCase();
    if (s === "resolved") {
      return { key: "accepted", label: "Risolto", icon: "fa-check" };
    }
    if (s === "soft_deleted") {
      return { key: "rejected", label: "Eliminato", icon: "fa-trash-o" };
    }
    return { key: "pending", label: "Aperto", icon: "fa-circle-o" };
  }

  function realtimeWsUrl() {
    var explicit = String(apiCfg.wsUrl || "").trim();
    if (explicit && !/\{\{/.test(explicit)) return explicit;
    var api = apiUrl();
    if (!api || typeof URL === "undefined") return "";
    try {
      var u = new URL(api, window.location.origin);
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

  function stopLivePoll() {
    if (!livePollTimer) return;
    clearInterval(livePollTimer);
    livePollTimer = null;
  }

  function startLivePoll() {
    stopLivePoll();
    if (confWs && confWs.readyState === 1) return;
    livePollTimer = setInterval(function () {
      if (document.visibilityState === "hidden") return;
      if (!isReadTabActive()) return;
      void refreshListQuiet();
    }, 20000);
  }

  function disconnectConfWs() {
    if (confWsReconnectTimer) {
      clearTimeout(confWsReconnectTimer);
      confWsReconnectTimer = null;
    }
    try {
      if (confWs) {
        confWs.onclose = null;
        confWs.close();
      }
    } catch (e2) {}
    confWs = null;
  }

  function scheduleConfWsReconnect() {
    if (confWsReconnectTimer) return;
    confWsReconnectTimer = setTimeout(function () {
      confWsReconnectTimer = null;
      connectConfWs();
    }, 8000);
  }

  function connectConfWs() {
    if (typeof WebSocket === "undefined") {
      startLivePoll();
      return;
    }
    var url = realtimeWsUrl();
    if (!url) {
      startLivePoll();
      return;
    }
    disconnectConfWs();
    try {
      var ws = new WebSocket(url);
      confWs = ws;
      ws.onopen = function () {
        stopLivePoll();
      };
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || "{}"));
          /* confessionaleFreezeFix1: ignore realtime_hello (connect noise) — only real changes */
          if (data.type === "confessionale_changed") {
            void refreshListQuiet();
          }
        } catch (e3) {}
      };
      ws.onclose = function () {
        confWs = null;
        startLivePoll();
        scheduleConfWsReconnect();
      };
      ws.onerror = function () {
        try {
          ws.close();
        } catch (e4) {}
      };
    } catch (e5) {
      confWs = null;
      startLivePoll();
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWhen(iso) {
    try {
      var d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return "";
      return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }

  function fetchJson(method, path, body, attempt) {
    var tryN = Number(attempt) || 0;
    var t = token();
    var opts = {
      method: method || "GET",
      headers: {
        Authorization: "Bearer " + t,
        Accept: "application/json",
      },
      mode: "cors",
      credentials: "omit",
      /* pageTune1: GET usa cache HTTP + ETag server (prima no-store sempre) */
      cache: String(method || "GET").toUpperCase() === "GET" ? "default" : "no-store",
    };
    if (body != null) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    if (ctrl) {
      opts.signal = ctrl.signal;
      timer = setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eA) {}
      }, 20000);
    }
    return fetch(path, opts)
      .then(function (res) {
      return res
          .text()
          .then(function (raw) {
            var data = {};
            try {
              data = raw && String(raw).trim() ? JSON.parse(raw) : {};
            } catch (eJ) {
              data = {};
            }
            var empty = !String(raw || "").trim();
            var shouldRetry =
              tryN < 2 &&
              (empty ||
                res.status === 0 ||
                res.status === 429 ||
                res.status >= 500 ||
                (res.ok && data && data.ok == null && !Object.keys(data).length));
            if (shouldRetry) {
              return new Promise(function (resolve) {
                setTimeout(resolve, 400 + tryN * 450);
              }).then(function () {
                return fetchJson(method, path, body, tryN + 1);
              });
            }
          return { res: res, data: data || {} };
        });
      })
      .catch(function (err) {
        if (tryN < 2) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 450 + tryN * 500);
          }).then(function () {
            return fetchJson(method, path, body, tryN + 1);
          });
        }
        throw err;
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
    });
  }

  function switchConfBoard(next) {
    var target = normalizeBoardId(next);
    if (target === normalizeBoardId(board)) return;
    if (target === "staff" && !canAccessStaffBoard) return;
    board = target;
    loadedOnce = false;
    listFingerprint = "";
    confPager.page = 1;
    confPager.userControlled = false;
    fetchGen = Number(fetchGen || 0) + 1;
    syncBoardInUrl();
    syncConfScopeBar();
    showListSkeleton(true);
    void loadList(true);
  }

  function syncConfScopeBar() {
    var dock = byId("vc-conf-scope-dock");
    if (!dock) return;
    Array.prototype.slice.call(dock.querySelectorAll("[data-conf-board]")).forEach(function (btn) {
      var on = btn.getAttribute("data-conf-board") === normalizeBoardId(board);
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function ensureConfScopeDock() {
    var host = byId("vc-conf-sections-row");
    var section = host && host.querySelector ? host.querySelector(".vc-reviews-section--split") : null;
    var filters = byId("vc-conf-filters");
    var list = byId("vc-conf-list");
    var dock = byId("vc-conf-scope-dock");
    if (normalizeBoardId(board) === "staff" && !canAccessStaffBoard) {
      switchConfBoard("community");
    }
    if (!dock) {
      dock = document.createElement("div");
      dock.id = "vc-conf-scope-dock";
      dock.className = "vc-feedback-scope-dock vc-conf-scope-dock";
      dock.innerHTML =
        '<div class="vc-notif-scope-bar vc-feedback-scope-bar" role="tablist" aria-label="Ambito confessionale">' +
        '<button type="button" role="tab" class="vc-notif-scope-bar__btn is-active" data-conf-board="community" aria-selected="true">' +
        '<i class="fa fa-users" aria-hidden="true"></i><span>Community</span></button>' +
        '<button type="button" role="tab" class="vc-notif-scope-bar__btn" data-conf-board="staff" aria-selected="false">' +
        '<i class="fa fa-shield" aria-hidden="true"></i><span>Staff</span></button>' +
        "</div>";
      if (section && filters && filters.parentNode === section) section.insertBefore(dock, filters);
      else if (section && list && list.parentNode === section) section.insertBefore(dock, list);
      else if (section) section.insertBefore(dock, section.firstChild);
      else if (host) host.insertBefore(dock, host.firstChild);
      dock.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-conf-board]") : null;
        if (btn && dock.contains(btn)) switchConfBoard(btn.getAttribute("data-conf-board"));
      });
    }
    dock.hidden = false;
    var scopeBarEl = dock.querySelector(".vc-feedback-scope-bar");
    if (scopeBarEl) scopeBarEl.hidden = !canAccessStaffBoard;
    syncConfScopeBar();
    ensureConfFiltersBar();
  }

  function ensureConfFiltersBar() {
    var host = byId("vc-conf-sections-row");
    var section = host && host.querySelector ? host.querySelector(".vc-reviews-section--split") : null;
    var list = byId("vc-conf-list");
    var bar = byId("vc-conf-filters");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "vc-conf-filters";
      bar.className = "vc-feedback-filters vc-reviews-filters vc-conf-filters";
      bar.setAttribute("aria-label", "Azioni confessionale");
      if (section && list && list.parentNode === section) section.insertBefore(bar, list);
      else if (section) section.insertBefore(bar, section.firstChild);
      else if (host) host.insertBefore(bar, host.firstChild);
      bar.addEventListener("click", function (ev) {
        var cta = ev.target && ev.target.closest ? ev.target.closest("#vc-conf-open-write-btn") : null;
        if (cta && bar.contains(cta)) openWriteModal();
      });
    }
    bar.hidden = false;
    bar.innerHTML =
      '<div class="vc-feedback-filters__main">' +
      '<div class="vc-feedback-filters__rows">' +
      '<div class="vc-feedback-filters__row">' +
      '<span class="vc-feedback-filters__label">Confessionale</span>' +
      '<div class="vc-feedback-filters__chips"><span class="vc-feedback-filters__hint">Messaggi anonimi della community</span></div>' +
      "</div></div>" +
      '<div class="vc-feedback-filters__toolbar">' +
      '<button type="button" id="vc-conf-open-write-btn" class="vc-reviews-head-cta vc-feedback-filters__cta">' +
      '<i class="fa fa-pencil" aria-hidden="true"></i><span>Nuova confessione</span></button>' +
      "</div></div>";
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

  function showListSkeleton(on) {
    var root = byId("vc-conf-list");
    if (!root || !on) return;
    root.className = "vc-reviews-grid vc-reviews-palette";
    root.innerHTML = listSkeletonMarkup(4);
    root.setAttribute("aria-busy", "true");
    var pager = byId("vc-conf-pager");
    if (pager) {
      pager.innerHTML = "";
      pager.hidden = true;
    }
  }

  function ensureWriteModalRoot() {
    var root = byId("vc-conf-write-modal");
    if (root) return root;
    root = document.createElement("div");
    root.id = "vc-conf-write-modal";
    root.className = "vc-reviews-modal";
    root.hidden = true;
    document.body.appendChild(root);
    return root;
  }

  function closeWriteModal() {
    writeModalOpen = false;
    syncWriteModal();
  }

  function writeModalMarkup() {
    return (
      '<div class="vc-reviews-modal__backdrop" data-conf-modal-dismiss tabindex="-1"></div>' +
      '<div class="vc-reviews-modal__panel" role="dialog" aria-modal="true" aria-labelledby="vc-conf-modal-title">' +
      '<div class="vc-reviews-modal__toolbar">' +
      '<h2 id="vc-conf-modal-title" class="vc-reviews-modal__title">Nuova confessione</h2>' +
      '<button type="button" class="vc-reviews-modal__close" data-conf-modal-dismiss aria-label="Chiudi"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-reviews-modal__body">' +
      '<p class="vc-confessionale-note">Scrivi liberamente: stress, dubbi o problemi. Il testo resta anonimo per chi legge.</p>' +
      '<form id="vc-conf-form" class="vc-confessionale-form" novalidate>' +
      '<label class="sr-only" for="vc-conf-text">Messaggio anonimo</label>' +
      '<textarea id="vc-conf-text" class="vc-confessionale-textarea" maxlength="1500" rows="7" placeholder="Qui puoi sfogarti o segnalare qualcosa…" required></textarea>' +
      '<div class="vc-confessionale-meta">' +
      '<span class="vc-confessionale-counter"><span id="vc-conf-count">0</span>/1500</span>' +
      '<button type="submit" id="vc-conf-submit" class="vc-confessionale-submit"><span>Invia in anonimo</span><i class="fa fa-paper-plane" aria-hidden="true"></i></button>' +
      "</div>" +
      '<p id="vc-conf-feedback" class="vc-confessionale-feedback" role="status" aria-live="polite" hidden></p>' +
      "</form></div></div>"
    );
  }

  function syncWriteModal() {
    var root = ensureWriteModalRoot();
    if (!writeModalOpen) {
      root.innerHTML = "";
      root.className = "vc-reviews-modal";
      root.hidden = true;
      try {
        if (typeof window.__vcReleaseModalScrollLock === "function") {
          window.__vcReleaseModalScrollLock({
            htmlClass: "vc-reviews-modal-open",
            datasetKey: "vcReviewsScrollY",
          });
        } else {
          document.documentElement.classList.remove("vc-reviews-modal-open");
          if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
        }
      } catch (e0) {}
      return;
    }
    root.hidden = false;
    root.innerHTML = writeModalMarkup();
    root.className = "vc-reviews-modal vc-reviews-modal--open";
    try {
      if (typeof window.__vcArmModalScrollLock === "function") {
        window.__vcArmModalScrollLock({
          htmlClass: "vc-reviews-modal-open",
          datasetKey: "vcReviewsScrollY",
        });
      } else {
        document.documentElement.classList.add("vc-reviews-modal-open");
        if (typeof window.__vcPinPageScroll === "function") {
          window.__vcPinPageScroll({ soft: true, forcePhoneLock: true });
        }
      }
    } catch (e1) {}
    var form = byId("vc-conf-form");
    var ta = byId("vc-conf-text");
    if (form) form.addEventListener("submit", submitMessage);
    if (ta) {
      ta.addEventListener("input", syncCounter);
      syncCounter();
      window.setTimeout(function () {
        try {
          ta.focus({ preventScroll: true });
        } catch (eF) {
          try {
            ta.focus();
          } catch (eF2) {}
        }
      }, 60);
    }
    root.querySelectorAll("[data-conf-modal-dismiss]").forEach(function (el) {
      el.addEventListener("click", closeWriteModal);
    });
  }

  function openWriteModal() {
    if (!token()) {
      try {
        if (window.VcLoginRequired && typeof window.VcLoginRequired.require === "function") {
          window.VcLoginRequired.require({
            title: "Nuova confessione",
            sub: "Confessionale",
            body: "Accedi con Discord per inviare un messaggio anonimo.",
          });
          return;
        }
      } catch (eL) {}
      toast("Accedi con Discord per scrivere.", "error");
      return;
    }
    writeModalOpen = true;
    syncWriteModal();
  }

  function anonToggleHtml(id, checked) {
    var anon = Boolean(checked);
    var sid = escapeHtml(id);
    return (
      '<div class="vc-role-seg-switch vc-confessionale-anon-switch" role="group" aria-label="Visibilità commento">' +
      '<div class="vc-role-seg-switch__seg vc-confessionale-anon-switch__seg" role="tablist" aria-label="Con nome o anonimo">' +
      '<button type="button" class="vc-role-seg-switch__btn vc-confessionale-anon-switch__btn' +
      (!anon ? " is-active vc-confessionale-anon-switch__btn--on" : "") +
      '" data-conf-anon-mode="named" data-conf-anon-for="' +
      sid +
      '" role="tab" aria-selected="' +
      (!anon ? "true" : "false") +
      '" title="Con nome">' +
      '<i class="fa fa-user" aria-hidden="true"></i><span class="sr-only">Con nome</span></button>' +
      '<button type="button" class="vc-role-seg-switch__btn vc-confessionale-anon-switch__btn' +
      (anon ? " is-active vc-confessionale-anon-switch__btn--on" : "") +
      '" data-conf-anon-mode="anon" data-conf-anon-for="' +
      sid +
      '" role="tab" aria-selected="' +
      (anon ? "true" : "false") +
      '" title="Anonimo">' +
      '<i class="fa fa-user-secret" aria-hidden="true"></i><span class="sr-only">Anonimo</span></button>' +
      "</div>" +
      '<input type="checkbox" id="vc-conf-anon-' +
      sid +
      '" class="vc-confessionale-anon-switch__input"' +
      (anon ? " checked" : "") +
      ' tabindex="-1" aria-hidden="true" />' +
      "</div>"
    );
  }

  function setAnonMode(id, mode) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var anon = String(mode || "") === "anon";
    var input = byId("vc-conf-anon-" + sid);
    if (input) input.checked = anon;
    var root = input && input.closest ? input.closest(".vc-confessionale-anon-switch") : null;
    if (!root) {
      root = document.querySelector('.vc-confessionale-anon-switch [data-conf-anon-for="' + sid + '"]');
      if (root) root = root.closest(".vc-confessionale-anon-switch");
    }
    if (!root) return;
    var btns = root.querySelectorAll("[data-conf-anon-mode]");
    for (var i = 0; i < btns.length; i += 1) {
      var btn = btns[i];
      var on = String(btn.getAttribute("data-conf-anon-mode") || "") === (anon ? "anon" : "named");
      btn.classList.toggle("is-active", on);
      btn.classList.toggle("vc-confessionale-anon-switch__btn--on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function commentsThreadHtml(it) {
    var comments = Array.isArray(it.comments) ? it.comments : [];
    var html = '<div class="vc-reviews-card__reply vc-suggestions-thread mt-4 space-y-3">';
    html += '<span class="vc-reviews-card__reply-label">Discussione</span>';
    if (!comments.length) {
      html += '<p class="vc-confessionale-discuss__empty">Nessun commento ancora.</p>';
    } else {
      for (var c = 0; c < comments.length; c += 1) {
        var cm = comments[c] || {};
        var anon = Boolean(cm.anonymous) || String(cm.authorName || "").trim().toLowerCase() === "anonimo";
        html +=
          '<div class="vc-suggestions-comment-card vc-confessionale-comment' +
          (anon ? " is-anonymous" : "") +
          '">' +
          (!anon && cm.authorAvatarUrl
            ? '<img class="vc-confessionale-comment__avatar" src="' +
              escapeHtml(cm.authorAvatarUrl) +
              '" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1" />'
            : '<span class="vc-confessionale-comment__avatar vc-confessionale-comment__avatar--anon" aria-hidden="true"><i class="fa fa-user-secret"></i></span>') +
          '<div class="vc-confessionale-comment__body">' +
          "<strong>" +
          escapeHtml(anon ? "Anonimo" : cm.authorName || "Staff") +
          "</strong>" +
          (cm.createdAt
            ? '<span class="vc-confessionale-comment__when">' + escapeHtml(formatWhen(cm.createdAt)) + "</span>"
            : "") +
          '<p style="white-space:pre-wrap;margin:.25rem 0 0">' +
          escapeHtml(cm.content || "") +
          "</p></div></div>";
      }
    }
    html += "</div>";
    return html;
  }

  function staffActionsHtml(it) {
    if (!canModerate || it.isMine) return "";
      var id = String(it.id || "");
    var st = String(it.status || "active");
    var reason = String(it.staffReason || "");
    var html =
      '<div class="vc-feedback-sheet__staff" role="group" aria-label="Azioni High Staff">' +
      '<label class="vc-feedback-sheet__staff-label" for="vc-conf-staff-reason-' +
      escapeHtml(id) +
      '">Motivo (opzionale)</label>' +
      '<input id="vc-conf-staff-reason-' +
      escapeHtml(id) +
      '" class="vc-sug-mod__reason" type="text" maxlength="1000" placeholder="Motivo decisione" value="' +
      escapeHtml(reason) +
      '" />' +
      '<div class="vc-staff-inbox-actions vc-staff-inbox-actions--forge vc-feedback-forge">' +
      '<div class="vc-staff-rank-forge__rail">';
    if (st !== "resolved") {
      html +=
        '<button type="button" class="vc-staff-rank-forge__card is-up" data-conf-resolve="' +
        escapeHtml(id) +
        '">' +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-check"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Risolto</span>' +
        '<span class="vc-staff-rank-forge__hint">Segna come gestito</span></button>';
    }
    if (st !== "active") {
      html +=
        '<button type="button" class="vc-staff-rank-forge__card is-amber" data-conf-reopen="' +
            escapeHtml(id) +
        '">' +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-undo"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Riapri</span>' +
        '<span class="vc-staff-rank-forge__hint">Torna ad aperta</span></button>';
    }
    if (st !== "soft_deleted") {
      html +=
        '<button type="button" class="vc-staff-rank-forge__card is-danger" data-conf-del="' +
        escapeHtml(id) +
        '">' +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-trash-o"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Elimina</span>' +
        '<span class="vc-staff-rank-forge__hint">Nasconde ma resta in elenco</span></button>';
    }
    html += "</div></div></div>";
    return html;
  }

  function decisionBannerHtml(it) {
    var st = String(it.status || "active");
    if (st === "active") return "";
    var meta = statusMeta(st);
    var reason = String(it.staffReason || "").trim();
    return (
      '<aside class="vc-feedback-sheet__decision is-' +
      (st === "resolved" ? "accepted" : "rejected") +
      '">' +
      '<div class="vc-feedback-sheet__decision-top">' +
      '<span class="vc-feedback-sheet__decision-kicker">Stato</span>' +
      '<span class="vc-feedback-sheet__decision-status"><i class="fa ' +
      meta.icon +
      '" aria-hidden="true"></i> ' +
      escapeHtml(meta.label) +
      "</span></div>" +
      (reason
        ? '<p class="vc-feedback-sheet__decision-text">' + escapeHtml(reason) + "</p>"
          : "") +
      (it.decidedAt
        ? '<p class="vc-feedback-sheet__decision-meta">' + escapeHtml(formatWhen(it.decidedAt)) + "</p>"
        : "") +
      "</aside>"
    );
  }

  function ensureConfSheet() {
    var sheet = byId("vc-confessionale-sheet");
    if (sheet && sheet.getAttribute("data-conf-bound") === "1") return sheet;
    if (sheet) {
      try {
        sheet.remove();
      } catch (eRm) {}
    }
    sheet = document.createElement("div");
    sheet.id = "vc-confessionale-sheet";
    sheet.className = "vc-feedback-sheet vc-staff-inbox-sheet vc-confessionale-sheet";
    sheet.setAttribute("data-conf-bound", "1");
    sheet.hidden = true;
    sheet.innerHTML =
      '<button type="button" class="vc-feedback-sheet__backdrop" data-conf-sheet-close="1" aria-label="Chiudi"></button>' +
      '<div class="vc-feedback-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="vc-confessionale-sheet-title">' +
      '<header class="vc-feedback-sheet__head">' +
      '<div class="vc-feedback-sheet__head-copy">' +
      '<span class="vc-feedback-sheet__kicker"><i class="fa fa-user-secret" aria-hidden="true"></i> Confessione</span>' +
      '<h2 id="vc-confessionale-sheet-title" class="vc-feedback-sheet__title">Discussione</h2></div>' +
      '<button type="button" class="vc-feedback-sheet__close" data-conf-sheet-close="1" aria-label="Chiudi">\u2715</button>' +
      "</header>" +
      '<div class="vc-feedback-sheet__decision-slot" id="vc-confessionale-sheet-decision" hidden></div>' +
      '<div class="vc-feedback-sheet__body" id="vc-confessionale-sheet-body"></div>' +
      '<footer class="vc-feedback-sheet__foot" id="vc-confessionale-sheet-foot"></footer>' +
      "</div>";
    document.body.appendChild(sheet);
    sheet.addEventListener("click", function (ev) {
      var tEl = ev.target;
      if (!tEl || !tEl.closest) return;
      if (tEl.closest("[data-conf-sheet-close]")) {
        ev.preventDefault();
        closeConfSheet();
        return;
      }
      var resolveBtn = tEl.closest("[data-conf-resolve]");
      if (resolveBtn) {
        ev.preventDefault();
        resolveItem(String(resolveBtn.getAttribute("data-conf-resolve") || ""));
        return;
      }
      var reopenBtn = tEl.closest("[data-conf-reopen]");
      if (reopenBtn) {
        ev.preventDefault();
        reopenItem(String(reopenBtn.getAttribute("data-conf-reopen") || ""));
        return;
      }
      var delBtn = tEl.closest("[data-conf-del]");
      if (delBtn) {
        ev.preventDefault();
        deleteItem(String(delBtn.getAttribute("data-conf-del") || ""));
        return;
      }
      var anonBtn = tEl.closest("[data-conf-anon-mode]");
      if (anonBtn) {
        ev.preventDefault();
        setAnonMode(
          String(anonBtn.getAttribute("data-conf-anon-for") || ""),
          String(anonBtn.getAttribute("data-conf-anon-mode") || ""),
        );
        return;
      }
      var cBtn = tEl.closest("[data-conf-comment]");
      if (cBtn) {
        ev.preventDefault();
        submitComment(String(cBtn.getAttribute("data-conf-comment") || ""));
      }
    });
    document.addEventListener("keydown", function confEsc(ev) {
      if (ev.key !== "Escape") return;
      if (!sheet || sheet.hidden || !sheet.classList.contains("is-in")) return;
      ev.preventDefault();
      closeConfSheet();
    });
    return sheet;
  }

  function isDiscussionOpen(it) {
    return String((it && it.status) || "active").toLowerCase() === "active";
  }

  function commentComposeHtml(it) {
    var id = String((it && it.id) || "");
    if (!isDiscussionOpen(it)) {
      var meta = statusMeta(it && it.status);
      return (
        '<p class="vc-confessionale-discuss__closed" role="status">' +
        '<i class="fa ' +
        escapeHtml(meta.icon) +
        '" aria-hidden="true"></i> Discussione chiusa (' +
        escapeHtml(meta.label) +
        "). Non si possono aggiungere commenti.</p>"
      );
    }
    return (
      '<div class="vc-confessionale-comment-form vc-sug-comment-compose">' +
      '<label class="sr-only" for="vc-conf-c-' +
      escapeHtml(id) +
      '">Commento</label>' +
      '<textarea id="vc-conf-c-' +
      escapeHtml(id) +
      '" class="vc-reviews-textarea vc-confessionale-comment-input vc-sug-comment-compose__input" rows="2" maxlength="1200" enterkeyhint="send" placeholder="Scrivi un commento alla discussione&hellip;"></textarea>' +
      '<div class="vc-confessionale-comment-actions">' +
      anonToggleHtml(id, true) +
      '<button type="button" class="vc-reviews-submit vc-confessionale-comment-btn vc-sug-comment-compose__btn" data-conf-comment="' +
      escapeHtml(id) +
      '">Invia commento</button></div></div>'
    );
  }

  function closeConfSheet() {
    var sheet = byId("vc-confessionale-sheet");
    openSheetId = "";
    try {
      if (typeof window.__vcReleaseModalScrollLock === "function") {
        window.__vcReleaseModalScrollLock({ htmlClass: "vc-feedback-sheet-open" });
      } else {
        document.documentElement.classList.remove("vc-feedback-sheet-open");
        if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
      }
    } catch (eUn) {}
    try {
      var hash = String(location.hash || "");
      if (/vc-conf-card-[a-f0-9]{24}/i.test(hash)) {
        history.replaceState(null, "", location.pathname + location.search);
      }
    } catch (eHash) {}
    if (!sheet) return;
    sheet.classList.remove("is-in");
    sheet.hidden = true;
    sheet.setAttribute("hidden", "");
    var body = byId("vc-confessionale-sheet-body");
    var foot = byId("vc-confessionale-sheet-foot");
    var decision = byId("vc-confessionale-sheet-decision");
    if (body) body.innerHTML = "";
    if (foot) foot.innerHTML = "";
    if (decision) {
      decision.hidden = true;
      decision.innerHTML = "";
    }
  }

  function paintConfSheetLoading(id) {
    var sheet = ensureConfSheet();
    openSheetId = String(id || "").trim();
    var title = byId("vc-confessionale-sheet-title");
    var decision = byId("vc-confessionale-sheet-decision");
    var body = byId("vc-confessionale-sheet-body");
    var foot = byId("vc-confessionale-sheet-foot");
    if (title) title.textContent = "Discussione";
    if (decision) {
      decision.hidden = true;
      decision.innerHTML = "";
    }
    if (body) {
      body.innerHTML =
        '<div class="vc-feedback-sheet__loading" role="status" aria-live="polite" aria-busy="true">' +
        '<span class="vc-feedback-sheet__loading-spin" aria-hidden="true"></span>' +
        "<strong>Apertura discussione…</strong>" +
        "<p>Carico i dettagli della confessione.</p></div>";
    }
    if (foot) foot.innerHTML = "";
    return sheet;
  }

  function paintConfSheet(it) {
    var sheet = ensureConfSheet();
    var id = String(it.id || "");
    openSheetId = id;
    var title = byId("vc-confessionale-sheet-title");
    var decision = byId("vc-confessionale-sheet-decision");
    var body = byId("vc-confessionale-sheet-body");
    var foot = byId("vc-confessionale-sheet-foot");
    if (title) title.textContent = "Confessione";
    var banner = decisionBannerHtml(it);
    if (decision) {
      if (banner) {
        decision.hidden = false;
        decision.innerHTML = banner;
      } else {
        decision.hidden = true;
        decision.innerHTML = "";
      }
    }
    if (body) {
      body.innerHTML =
        '<div class="vc-feedback-sheet__author">' +
        '<span class="vc-feedback-sheet__avatar vc-confessionale-card__avatar" aria-hidden="true"><i class="fa fa-user-secret"></i></span>' +
        "<div><strong>Confessione</strong><span>" +
        escapeHtml(formatWhen(it.createdAt) || "") +
        "</span></div>" +
        '<span class="vc-feedback-ico-badge vc-feedback-ico-badge--status-' +
        escapeHtml(statusMeta(it.status).key) +
        '" title="' +
        escapeHtml(statusMeta(it.status).label) +
        '"><i class="fa ' +
        statusMeta(it.status).icon +
        '" aria-hidden="true"></i></span></div>' +
        '<div class="vc-feedback-prose" style="white-space:pre-wrap;margin-top:.85rem">' +
        escapeHtml(it.content || "") +
        "</div>" +
        commentsThreadHtml(it) +
        commentComposeHtml(it);
    }
    if (foot) foot.innerHTML = staffActionsHtml(it);
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.scan === "function") {
        window.VcDiscordAvatar.scan(sheet);
      }
    } catch (eScan) {}
  }

  function openConfSheet(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var it = findItemById(sid);
    if (it) paintConfSheet(it);
    else paintConfSheetLoading(sid);
    var sheet = byId("vc-confessionale-sheet");
    if (!sheet) return;
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
    window.requestAnimationFrame(function () {
      sheet.classList.add("is-in");
    });
  }

  function emptyMarkup(icon, title, text) {
    return (
      '<article class="vc-reviews-empty">' +
      '<span class="vc-reviews-empty__icon"><i class="fa ' +
      escapeHtml(icon) +
      '" aria-hidden="true"></i></span>' +
      "<strong>" +
      escapeHtml(title) +
      "</strong>" +
      "<p>" +
      escapeHtml(text) +
      "</p></article>"
    );
  }

  function escapePager(s) {
    return escapeHtml(String(s == null ? "" : s));
  }

  var pendingConfDeepLinkId = "";

  function resolveConfDeepLinkId() {
    try {
      var hash = String(location.hash || "");
      var m = hash.match(/vc-conf-card-([a-f0-9]{24})/i);
      if (m) return String(m[1] || "");
    } catch (eH) {}
    var pending = String(pendingConfDeepLinkId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(pending)) return pending;
    var open = String(openSheetId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(open)) return open;
    return "";
  }

  function scrollConfCardIntoView(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    try {
      var card = document.getElementById("vc-conf-card-" + sid);
      if (!card || typeof card.scrollIntoView !== "function") return;
      card.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    } catch (eScr) {}
  }

  function ensurePageIncludesDeepLink(items) {
    if (confPager.userControlled) return;
    var wantRaw = resolveConfDeepLinkId();
    if (!wantRaw) return;
    var want = String(wantRaw || "").toLowerCase();
    var idx = -1;
    for (var i = 0; i < items.length; i += 1) {
      if (String((items[i] && items[i].id) || "").toLowerCase() === want) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    var perPage = Math.max(1, Number(confPager.perPage || 9));
    confPager.page = Math.floor(idx / perPage) + 1;
  }

  function getPagedItems(items) {
    var perPage = Math.max(1, Number(confPager.perPage || 9));
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    var currentPage = Math.max(1, Math.min(totalPages, Number(confPager.page || 1)));
    confPager.page = currentPage;
    confPager.totalPages = totalPages;
    var start = (currentPage - 1) * perPage;
    return items.slice(start, start + perPage);
  }

  function renderConfPager(totalItems) {
    var pager = byId("vc-conf-pager");
    if (!pager) return;
    var perPage = Math.max(1, Number(confPager.perPage || 9));
    var total = Math.max(0, Number(totalItems || 0));
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    var page = Math.max(1, Math.min(totalPages, Number(confPager.page || 1)));
    confPager.page = page;
    confPager.totalPages = totalPages;
    if (!total || total <= perPage) {
      pager.innerHTML = "";
      pager.hidden = true;
      return;
    }
    pager.hidden = false;
    var mp = window.__vcMiniPager;
    if (mp && typeof mp.fill === "function") {
      mp.fill(pager, page, totalPages, { aria: "Paginazione confessioni", classic: true }, {
        go: function (nextPage) {
          var cap = Math.max(1, Number(confPager.totalPages) || 1);
          var next = Math.max(1, Math.min(cap, Number(nextPage) || 1));
          if (next === Number(confPager.page || 1)) return;
          confPager.userControlled = true;
          confPager.page = next;
          renderList(stateItems, { preserveDrafts: true });
          /* scrollStayAll1: no scrollIntoView */
        },
      });
      return;
    }
    pager.innerHTML =
      '<button type="button" class="vc-reviews-pager__btn vc-notify-home-btn" data-conf-page-prev' +
      (page <= 1 ? " disabled" : "") +
      ">Precedente</button>" +
      '<span class="vc-reviews-pager__meta vc-reviews-pager__meta--stats vc-notify-filter-btn vc-notify-filter-btn--on" aria-live="polite">' +
      "Pagina " +
      escapePager(page) +
      " di " +
      escapePager(totalPages) +
      "</span>" +
      '<button type="button" class="vc-reviews-pager__btn vc-notify-home-btn" data-conf-page-next' +
      (page >= totalPages ? " disabled" : "") +
      ">Successiva</button>";
  }

  function cardHtml(it) {
    var id = String(it.id || "");
    var when = formatWhen(it.createdAt);
    var comments = Number(it.commentCount) || (Array.isArray(it.comments) ? it.comments.length : 0);
    var meta = statusMeta(it.status);
    return (
      '<article class="vc-reviews-card vc-feedback-card vc-confessionale-card" id="vc-conf-card-' +
      escapeHtml(id) +
      '" data-id="' +
      escapeHtml(id) +
      '" data-conf-open="' +
      escapeHtml(id) +
      '" role="button" tabindex="0" aria-label="Apri discussione">' +
      '<div class="vc-feedback-card__top">' +
      '<div class="vc-reviews-card__author">' +
      '<span class="vc-reviews-card__avatar vc-confessionale-card__avatar" aria-hidden="true"><i class="fa fa-user-secret"></i></span>' +
      "<div><strong>Confessione</strong><span>" +
      escapeHtml(when || "ora sconosciuta") +
      "</span></div></div>" +
      '<div class="vc-feedback-card__badges">' +
      '<span class="vc-feedback-ico-badge vc-feedback-ico-badge--status-' +
      escapeHtml(meta.key) +
      '" title="' +
      escapeHtml(meta.label) +
      '" aria-label="' +
      escapeHtml(meta.label) +
      '"><i class="fa ' +
      meta.icon +
      '" aria-hidden="true"></i></span></div></div>' +
      '<div class="vc-feedback-card__preview vc-feedback-prose">' +
      escapeHtml(previewText(it.content, 160)) +
      "</div>" +
      '<div class="vc-feedback-card__meta">' +
      '<span title="Commenti"><i class="fa fa-comments-o" aria-hidden="true"></i> ' +
      escapeHtml(String(comments)) +
      "</span>" +
      '<span class="vc-feedback-card__open-hint">Apri discussione <i class="fa fa-chevron-right" aria-hidden="true"></i></span>' +
      "</div></article>"
    );
  }

  function renderList(items, opts) {
    var root = byId("vc-conf-list");
    if (!root) return;
    root.removeAttribute("aria-busy");
    if (window.VcListSkeleton && typeof window.VcListSkeleton.clearBusy === "function") {
      window.VcListSkeleton.clearBusy(root);
    }
    var list = Array.isArray(items) ? items : [];
    stateItems = list.slice();
    root.className = "vc-reviews-grid vc-reviews-palette";
    if (!list.length) {
      root.innerHTML = emptyMarkup(
        "fa-comments-o",
        "Nessun messaggio",
        "Sii il primo a scrivere nel confessionale.",
      );
      listFingerprint = itemsFingerprint([]);
      renderConfPager(0);
      /* notifSheetFastOpen1: lista vuota non chiude sheet in loading da deep-link */
      if (openSheetId) {
        var emptySheet = byId("vc-confessionale-sheet");
        if (emptySheet && !emptySheet.hidden && findItemById(openSheetId)) {
          /* keep */
        } else if (emptySheet && !emptySheet.hidden) {
          paintConfSheetLoading(openSheetId);
        } else {
          closeConfSheet();
        }
      }
      return;
    }
    ensurePageIncludesDeepLink(list);
    var pageItems = getPagedItems(list);
    root.innerHTML = pageItems.map(function (it) { return cardHtml(it); }).join("");
    renderConfPager(list.length);
    listFingerprint = itemsFingerprint(list);
    if (openSheetId) {
      var sheetEl = byId("vc-confessionale-sheet");
      var stillOpen = Boolean(sheetEl && !sheetEl.hidden);
      var cur = findItemById(openSheetId);
      if (stillOpen && cur) paintConfSheet(cur);
      else if (stillOpen && !cur) paintConfSheetLoading(openSheetId);
      else if (!stillOpen) openSheetId = "";
    } else if (pendingConfDeepLinkId) {
      try {
        applyConfessionDeepLink();
      } catch (ePend) {}
    }
  }

  function applyListPayload(data, opts) {
    canModerate = Boolean(data && data.canModerate);
    if (data && Object.prototype.hasOwnProperty.call(data, "canAccessStaffBoard")) {
      canAccessStaffBoard = Boolean(data.canAccessStaffBoard);
    } else if (data && data.viewer && Object.prototype.hasOwnProperty.call(data.viewer, "canAccessStaffBoard")) {
      canAccessStaffBoard = Boolean(data.viewer.canAccessStaffBoard);
    }
    loadedOnce = true;
    ensureConfScopeDock();
    renderList((data && data.items) || [], opts || {});
  }

  function loadList(force) {
    if (loadedOnce && !force) return Promise.resolve();
    if (listLoadInFlight && !force) return Promise.resolve();
    if (!isReadTabActive()) return Promise.resolve();
    var root = byId("vc-conf-list");
    if (root && !loadedOnce) {
      showListSkeleton(true);
    }
    listLoadInFlight = true;
    var boardAtFetch = normalizeBoardId(board);
    var genAtFetch = Number(fetchGen || 0);
    return fetchJson("GET", apiGetUrl())
      .then(function (out) {
        if (normalizeBoardId(board) !== boardAtFetch || Number(fetchGen || 0) !== genAtFetch) return;
        if (!out.res.ok || !out.data.ok) {
          if (out.res.status === 403 && boardAtFetch === "staff") {
            switchConfBoard("community");
            return;
          }
          if (root && !loadedOnce) {
            root.removeAttribute("aria-busy");
            root.className = "vc-reviews-grid vc-reviews-palette";
            root.innerHTML = emptyMarkup(
              "fa-exclamation-triangle",
              (out.data && out.data.message) || "Impossibile caricare i messaggi.",
              "Riprova tra poco.",
            );
            renderConfPager(0);
          }
          /* Evita storm di retry su switch ripetuti dopo errore. */
          loadedOnce = true;
          return;
        }
        applyListPayload(out.data, { preserveDrafts: Boolean(loadedOnce) });
        applyConfessionDeepLink();
      })
      .catch(function () {
        if (root && !loadedOnce) {
          root.removeAttribute("aria-busy");
          root.className = "vc-reviews-grid vc-reviews-palette";
          root.innerHTML = emptyMarkup("fa-wifi", "Errore di rete.", "Controlla la connessione e riprova.");
          renderConfPager(0);
        }
        loadedOnce = true;
      })
      .finally(function () {
        listLoadInFlight = false;
        try {
          hardenPageInteractive();
        } catch (eH2) {}
      });
  }

  function applyConfessionDeepLink() {
    var id = resolveConfDeepLinkId();
    if (!id) return;
    pendingConfDeepLinkId = id;
    if (!loadedOnce || !stateItems || !stateItems.length) {
      /* aspetta lista — openConfSheet dopo paint in renderList */
      return;
    }
    if (!findItemById(id)) {
      openConfSheet(id);
      pendingConfDeepLinkId = "";
      return;
    }
    scrollConfCardIntoView(id);
    window.setTimeout(function () {
      openConfSheet(id);
      pendingConfDeepLinkId = "";
    }, 180);
  }

  /* notifSheetReadyOpen1: soft-open da notifica già su /confessionale */
  window.__vcConfessionaleOpenDeepLink = function (opts) {
    opts = opts || {};
    var id = String(opts.id || "").trim();
    if (!/^[a-f0-9]{24}$/i.test(id)) return false;
    var wantBoard = opts.board === "staff" ? "staff" : "community";
    if (wantBoard === "staff" && loadedOnce && !canAccessStaffBoard) return false;
    pendingConfDeepLinkId = id;
    if (wantBoard !== normalizeBoardId(board)) {
      board = wantBoard;
      loadedOnce = false;
      listFingerprint = "";
      confPager.page = 1;
      confPager.userControlled = false;
      fetchGen = Number(fetchGen || 0) + 1;
      try {
        syncBoardInUrl();
        syncConfScopeBar();
      } catch (eBar) {}
      showListSkeleton(true);
      try {
        history.replaceState(null, "", location.pathname + location.search + "#vc-conf-card-" + id);
      } catch (eH) {}
      void loadList(true).then(function () {
        try {
          applyConfessionDeepLink();
        } catch (eApp) {}
      });
      return true;
    }
    if (findItemById(id)) {
      applyConfessionDeepLink();
      void refreshListQuiet(true);
      return true;
    }
    void loadList(true).then(function () {
      try {
        applyConfessionDeepLink();
      } catch (eApp2) {}
    });
    return true;
  };

  function refreshListQuiet(force) {
    if (!force && !isReadTabActive()) return Promise.resolve();
    if (!force && listLoadInFlight) return Promise.resolve();
    if (!force && isTypingInCommentField()) return Promise.resolve();
    if (refreshQuietInFlight && !force) return Promise.resolve();
    if (refreshQuietTimer) {
      clearTimeout(refreshQuietTimer);
      refreshQuietTimer = null;
    }
    return new Promise(function (resolve) {
      var run = function () {
        refreshQuietTimer = null;
        refreshQuietInFlight = true;
        var boardAtFetch = normalizeBoardId(board);
        fetchJson("GET", apiGetUrl())
          .then(function (out) {
            if (normalizeBoardId(board) !== boardAtFetch) return;
            if (!out.res.ok || !out.data.ok) return;
            var nextFp = itemsFingerprint(out.data.items);
            if (nextFp && nextFp === listFingerprint) {
        canModerate = Boolean(out.data.canModerate);
        loadedOnce = true;
              return;
            }
            applyListPayload(out.data, { preserveDrafts: true });
          })
          .catch(function () {})
          .finally(function () {
            refreshQuietInFlight = false;
            resolve();
          });
      };
      if (force) run();
      else refreshQuietTimer = setTimeout(run, 350);
    });
  }

  function staffReasonFor(id) {
    var el = byId("vc-conf-staff-reason-" + id);
    return el ? String(el.value || "").trim() : "";
  }

  function submitComment(id) {
    if (!id) return;
    var it = findItemById(id);
    if (it && !isDiscussionOpen(it)) {
      toast("Discussione chiusa: non si possono aggiungere commenti.", "error");
      return;
    }
    var ta = byId("vc-conf-c-" + id);
    var anonEl = byId("vc-conf-anon-" + id);
    var content = ta ? String(ta.value || "").trim() : "";
    if (content.length < 2) {
      toast("Scrivi almeno 2 caratteri", "error");
      return;
    }
    var anonymous = Boolean(anonEl && anonEl.checked);
    var path = apiUrl().replace(/\/+$/, "") + "/" + encodeURIComponent(id) + "/comments";
    fetchJson("POST", path, { content: content, anonymous: anonymous })
      .then(function (out) {
        if (!out.res.ok || !out.data.ok) {
          toast(out.data.message || "Commento non inviato", "error");
          return;
        }
        toast(out.data.message || "Commento pubblicato", "success");
        if (ta) ta.value = "";
        void refreshListQuiet(true);
      })
      .catch(function () {
        toast("Errore di rete", "error");
      });
  }

  function confirmConfAction(opts) {
    opts = opts || {};
    var confirmP = (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.confirm !== "function") return true;
      return D.confirm(opts);
    });
    return confirmP.then(function (ok) {
      return ok === true;
    });
  }

  function resolveItem(id) {
    if (!id || !canModerate) return;
    var it = findItemById(id);
    if (it && it.isMine) {
      toast("Non puoi moderare la tua stessa confessione.", "error");
      return;
    }
    confirmConfAction({
      title: "Segna come risolta",
      message: "Segnare questa discussione come risolta?",
      confirmLabel: "Risolto",
      cancelLabel: "Annulla",
      icon: "fa-check-circle",
    }).then(function (ok) {
      if (!ok) return;
      var path = apiUrl().replace(/\/+$/, "") + "/" + encodeURIComponent(id) + "/resolve";
      fetchJson("POST", path, { reason: staffReasonFor(id) })
        .then(function (out) {
          if (!out.res.ok || !out.data.ok) {
            toast(out.data.message || "Operazione non riuscita", "error");
            return;
          }
          toast(out.data.message || "Segnata come risolta", "success");
          void refreshListQuiet(true);
        })
        .catch(function () {
          toast("Errore di rete", "error");
        });
    });
  }

  function reopenItem(id) {
    if (!id || !canModerate) return;
    confirmConfAction({
      title: "Riapri discussione",
      message: "Riaprire questa discussione?",
      confirmLabel: "Riapri",
      cancelLabel: "Annulla",
      icon: "fa-undo",
    }).then(function (ok) {
      if (!ok) return;
      var path = apiUrl().replace(/\/+$/, "") + "/" + encodeURIComponent(id) + "/reopen";
      fetchJson("POST", path, {})
        .then(function (out) {
          if (!out.res.ok || !out.data.ok) {
            toast(out.data.message || "Operazione non riuscita", "error");
            return;
          }
          toast(out.data.message || "Riaperta", "success");
          void refreshListQuiet(true);
        })
        .catch(function () {
          toast("Errore di rete", "error");
        });
    });
  }

  function deleteItem(id) {
    if (!id || !canModerate) return;
    var it = findItemById(id);
    if (it && it.isMine) {
      toast("Non puoi eliminare la tua stessa confessione.", "error");
      return;
    }
    confirmConfAction({
      title: "Elimina discussione",
      message: "Eliminare permanentemente questa discussione? L\u2019operazione non \u00e8 annullabile.",
      confirmLabel: "Elimina",
      cancelLabel: "Annulla",
      danger: true,
      icon: "fa-trash-o",
    }).then(function (ok) {
      if (!ok) return;
      var path = apiUrl().replace(/\/+$/, "") + "/" + encodeURIComponent(id) + "/delete";
      fetchJson("POST", path, { reason: staffReasonFor(id) })
        .then(function (out) {
          if (!out.res.ok || !out.data.ok) {
            toast(out.data.message || "Eliminazione non riuscita", "error");
            return;
          }
          toast(out.data.message || "Eliminata", "success");
          closeConfSheet();
          void refreshListQuiet(true);
        })
        .catch(function () {
          toast("Errore di rete", "error");
        });
    });
  }

  function submitMessage(e) {
    if (e && e.preventDefault) e.preventDefault();
    clearInlineFeedback();
    var ta = byId("vc-conf-text");
    var btn = byId("vc-conf-submit");
    var content = ta ? String(ta.value || "").trim() : "";
    if (content.length < 8) {
      toast("Scrivi almeno 8 caratteri.", "error");
      return;
    }
    if (btn) btn.disabled = true;
    toast("Invio in corso…", "info");
    fetchJson("POST", apiUrl(), { content: content, board: normalizeBoardId(board) })
      .then(function (out) {
        if (!out.res.ok || !out.data.ok) {
          toast(out.data.message || "Invio non riuscito.", "error");
          return;
        }
        if (ta) ta.value = "";
        syncCounter();
        closeWriteModal();
        toast(out.data.message || "Messaggio inviato in anonimo.", "success");
        void refreshListQuiet(true);
      })
      .catch(function () {
        toast("Errore di rete.", "error");
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function syncCounter() {
    var ta = byId("vc-conf-text");
    var c = byId("vc-conf-count");
    if (!c) return;
    var n = ta ? String(ta.value || "").length : 0;
    c.textContent = String(Math.min(n, MAX));
  }

  function hideCurtainEl() {
    var el = byId("vc-confessionale-curtain");
    if (!el) return;
    el.classList.add("is-done");
    el.hidden = true;
    el.setAttribute("hidden", "");
    el.setAttribute("aria-hidden", "true");
    try {
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("pointer-events", "none", "important");
    } catch (eH) {}
  }

  function hideSmokeEl() {
    var smoke = byId("vc-confessionale-smoke");
    if (!smoke) return;
    smoke.classList.remove("is-visible");
    smoke.classList.add("is-done");
    smoke.hidden = true;
    smoke.setAttribute("aria-hidden", "true");
  }

  function clearSmokeArmTimer() {
    if (smokeArmTimer) {
      window.clearTimeout(smokeArmTimer);
      smokeArmTimer = null;
    }
    if (smokeForceArmTimer) {
      window.clearTimeout(smokeForceArmTimer);
      smokeForceArmTimer = null;
    }
  }

  function clearCurtainOpenTimer() {
    if (curtainOpenTimer) {
      window.clearTimeout(curtainOpenTimer);
      curtainOpenTimer = null;
    }
  }

  function clearIntroWatchdog() {
    if (introWatchdogTimer) {
      window.clearTimeout(introWatchdogTimer);
      introWatchdogTimer = null;
    }
  }

  function armSmokeNow() {
    var smoke = byId("vc-confessionale-smoke");
    smokeArmed = true;
    if (smoke) {
      smoke.classList.remove("is-armed-pending");
      smoke.classList.add("is-armed");
    }
  }

  function persistIntroSeen() {
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch (eL) {}
    try {
      sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch (eS) {}
  }

  function introAlreadyDone() {
    try {
      var sp = new URLSearchParams(location.search || "");
      if (sp.get("skipIntro") === "1" || sp.get("skip") === "1") return true;
      if (sp.get("forceIntro") === "1") return false;
    } catch (eQ) {}
    try {
      if (localStorage.getItem(INTRO_SEEN_KEY) === "1") return true;
    } catch (eL) {}
    try {
      if (sessionStorage.getItem(INTRO_SEEN_KEY) === "1") return true;
    } catch (eS) {}
    try {
      if (document.documentElement.classList.contains("vc-confessionale-curtain-done")) return true;
    } catch (eC) {}
    return false;
  }

  function hardenPageInteractive() {
    /* confessionaleIntroOnce1: niente overlay/lock residui che frezzano click dopo l’entrata */
    unlockIntroScroll();
    hideCurtainEl();
    hideSmokeEl();
    try {
      document.documentElement.classList.remove("vc-confessionale-intro-active");
      document.documentElement.classList.add("vc-confessionale-curtain-done");
      if (document.body) document.body.classList.add("vc-confessionale-curtain-done");
    } catch (eCls) {}
    try {
      var curtain = byId("vc-confessionale-curtain");
      var smoke = byId("vc-confessionale-smoke");
      [curtain, smoke].forEach(function (el) {
        if (!el) return;
        el.hidden = true;
        el.setAttribute("hidden", "");
        el.setAttribute("aria-hidden", "true");
        el.classList.add("is-done");
        el.classList.remove("is-open", "is-visible", "is-armed", "is-armed-pending");
        el.style.setProperty("pointer-events", "none", "important");
        el.style.setProperty("display", "none", "important");
      });
    } catch (eStyle) {}
    try {
      document.documentElement.style.removeProperty("overflow");
      document.documentElement.style.removeProperty("touch-action");
      if (document.body) {
        document.body.style.removeProperty("overflow");
        document.body.style.removeProperty("touch-action");
      }
    } catch (eInline) {}
  }

  function markSequenceDone() {
    if (curtainDone) {
      hardenPageInteractive();
      return;
    }
    curtainDone = true;
    smokeArmed = false;
    clearSmokeArmTimer();
    clearCurtainOpenTimer();
    clearIntroWatchdog();
    persistIntroSeen();
    hardenPageInteractive();
    kickBgmFromGesture();
    try {
      window.dispatchEvent(new CustomEvent("vc:confessionale-curtain-done"));
    } catch (e3) {}
  }

  function scheduleIntroWatchdog() {
    clearIntroWatchdog();
    if (curtainDone || introAlreadyDone()) return;
    introWatchdogTimer = window.setTimeout(function () {
      introWatchdogTimer = null;
      if (curtainDone) return;
      markSequenceDone();
    }, INTRO_WATCHDOG_MS);
  }

  function onIntroScrollBlock(ev) {
    try {
      if (!document.documentElement.classList.contains("vc-confessionale-intro-active")) return;
      if (document.documentElement.classList.contains("vc-confessionale-curtain-done")) return;
      ev.preventDefault();
    } catch (eBlock) {}
  }

  function lockIntroScroll() {
    try {
      document.documentElement.classList.add("vc-confessionale-intro-active");
      document.documentElement.classList.remove("vc-confessionale-curtain-done");
      document.documentElement.style.overflow = "hidden";
      if (document.body) {
        document.body.style.overflow = "hidden";
        document.body.style.touchAction = "none";
      }
    } catch (eL) {}
    if (scrollLockBound) return;
    scrollLockBound = true;
    try {
      window.addEventListener("wheel", onIntroScrollBlock, { passive: false, capture: true });
      window.addEventListener("touchmove", onIntroScrollBlock, { passive: false, capture: true });
    } catch (eBind) {}
  }

  function unlockIntroScroll() {
    try {
      document.documentElement.style.overflow = "";
      if (document.body) {
        document.body.style.overflow = "";
        document.body.style.touchAction = "";
      }
    } catch (eU) {}
    if (!scrollLockBound) return;
    scrollLockBound = false;
    try {
      window.removeEventListener("wheel", onIntroScrollBlock, true);
      window.removeEventListener("touchmove", onIntroScrollBlock, true);
    } catch (eUn) {}
  }

  function kickBgmFromGesture() {
    /* confessionaleClickFreeze1: un solo kick deferito — non bloccare il click UI */
    window.setTimeout(function () {
      try {
        if (typeof window.__vcConfessionaleBgmForcePlay === "function") {
          window.__vcConfessionaleBgmForcePlay();
          return;
        }
      } catch (eForce) {}
      try {
        if (typeof window.__vcConfessionaleBgmUnlock === "function") {
          window.__vcConfessionaleBgmUnlock();
        }
      } catch (eKick) {}
    }, 0);
  }

  function ensureSmokeEmoji() {
    var face = document.querySelector("#vc-confessionale-smoke img.vc-confessionale-smoke__face, #vc-confessionale-smoke [data-vc-smoke-emoji]");
    if (!face || face.tagName !== "IMG") return;
    var src = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/1f92b.png";
    face.addEventListener(
      "error",
      function () {
        try {
          if (face.dataset.vcSmokeEmojiRetry === "1") return;
          face.dataset.vcSmokeEmojiRetry = "1";
          face.src = "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f92b.png";
        } catch (eR) {}
      },
      { once: true },
    );
    if (!String(face.getAttribute("src") || "").trim()) {
      face.src = src;
    }
  }

  function primeIntroOverlay() {
    if (introAlreadyDone()) {
      markSequenceDone();
      return false;
    }
    lockIntroScroll();
    scheduleIntroWatchdog();
    var el = byId("vc-confessionale-curtain");
    if (el) {
      el.hidden = false;
      el.removeAttribute("hidden");
      el.setAttribute("aria-hidden", "false");
      el.style.removeProperty("pointer-events");
      el.style.removeProperty("display");
      el.classList.remove("is-done", "is-open");
      try {
        if (el.parentNode !== document.body) document.body.appendChild(el);
      } catch (eMove) {}
    }
    var smoke = byId("vc-confessionale-smoke");
    if (smoke) {
      try {
        if (smoke.parentNode !== document.body) document.body.appendChild(smoke);
      } catch (eMove2) {}
      smoke.style.removeProperty("pointer-events");
      smoke.style.removeProperty("display");
    }
    return true;
  }

  function showSmokeBeat() {
    clearCurtainOpenTimer();
    hideCurtainEl();
    var smoke = byId("vc-confessionale-smoke");
    if (!smoke) {
      markSequenceDone();
      return;
    }
    ensureSmokeEmoji();
    smokeArmed = false;
    clearSmokeArmTimer();
    smoke.hidden = false;
    smoke.removeAttribute("hidden");
    smoke.setAttribute("aria-hidden", "false");
    smoke.classList.remove("is-done");
    /* Backdrop opaco subito: niente flash della pagina sotto. */
    smoke.classList.add("is-visible", "is-armed-pending");
    smokeArmTimer = window.setTimeout(function () {
      smokeArmTimer = null;
      armSmokeNow();
    }, SMOKE_ARM_MS);
    smokeForceArmTimer = window.setTimeout(function () {
      smokeForceArmTimer = null;
      if (!curtainDone) armSmokeNow();
    }, SMOKE_FORCE_ARM_MS);
  }

  function openCurtain() {
    if (curtainDone || introAlreadyDone()) {
      markSequenceDone();
      return;
    }
    if (!primeIntroOverlay()) return;
    var el = byId("vc-confessionale-curtain");
    if (!el) {
      markSequenceDone();
      return;
    }

    void el.offsetWidth;
    requestAnimationFrame(function () {
      el.classList.add("is-open");
    });
    clearCurtainOpenTimer();
    curtainOpenTimer = window.setTimeout(function () {
      curtainOpenTimer = null;
      if (curtainDone) return;
      showSmokeBeat();
    }, CURTAIN_OPEN_MS);
  }

  function bootCurtainWhenReady() {
    if (introAlreadyDone()) {
      markSequenceDone();
      return;
    }
    primeIntroOverlay();
    openCurtain();
  }

  function bind() {
    ensureSmokeEmoji();
    board = readBoardFromUrl();
    syncBoardInUrl();
    ensureConfScopeDock();
    var list = byId("vc-conf-list");
    var smokeContinue = byId("vc-confessionale-smoke-continue");
    var smokeRoot = byId("vc-confessionale-smoke");

    if (list) {
      list.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var openBtn = t.closest("[data-conf-open]");
        if (openBtn) {
          openConfSheet(String(openBtn.getAttribute("data-conf-open") || ""));
        }
      });
      list.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        var t = ev.target;
        if (!t || !t.closest) return;
        var openBtn = t.closest("[data-conf-open]");
        if (!openBtn) return;
        ev.preventDefault();
        openConfSheet(String(openBtn.getAttribute("data-conf-open") || ""));
      });
    }
    if (!pagerBound) {
      pagerBound = true;
      var pager = byId("vc-conf-pager");
      if (pager) {
        pager.addEventListener("click", function (ev) {
          var el = ev.target;
          if (!el || !el.closest) return;
          if (el.closest("[data-conf-page-prev]")) {
            var prev = Math.max(1, Number(confPager.page || 1) - 1);
            if (prev === Number(confPager.page || 1)) return;
            confPager.userControlled = true;
            confPager.page = prev;
            renderList(stateItems, { preserveDrafts: true });
            return;
          }
          if (el.closest("[data-conf-page-next]")) {
            var cap = Math.max(1, Number(confPager.totalPages) || 1);
            var next = Math.min(cap, Number(confPager.page || 1) + 1);
            if (next === Number(confPager.page || 1)) return;
            confPager.userControlled = true;
            confPager.page = next;
            renderList(stateItems, { preserveDrafts: true });
          }
        });
      }
    }
    var curtainRoot = byId("vc-confessionale-curtain");
    var curtainSkip = byId("vc-confessionale-curtain-skip");
    if (curtainRoot) {
      curtainRoot.addEventListener(
        "pointerdown",
        function () {
          kickBgmFromGesture();
        },
        true,
      );
      /* confessionaleIntroUnstick1: tap sulla tendina avanza (apri → smoke → entra) */
      curtainRoot.addEventListener(
        "click",
        function (ev) {
          if (curtainDone) return;
          kickBgmFromGesture();
          if (!curtainRoot.classList.contains("is-open")) {
            openCurtain();
            return;
          }
          showSmokeBeat();
        },
        true,
      );
    }
    if (curtainSkip) {
      curtainSkip.addEventListener("click", function (ev) {
        if (ev) {
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch (eSk) {}
        }
        kickBgmFromGesture();
        markSequenceDone();
      });
    }
    if (smokeRoot) {
      smokeRoot.addEventListener(
        "pointerdown",
        function () {
          kickBgmFromGesture();
        },
        true,
      );
    }
    function onSmokeContinue(ev) {
      if (ev) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e0) {}
      }
      kickBgmFromGesture();
      if (!smokeArmed) {
        armSmokeNow();
        return;
      }
      markSequenceDone();
    }
    if (!smokeContinueBound) {
      smokeContinueBound = true;
      if (smokeContinue) {
        smokeContinue.addEventListener("click", onSmokeContinue);
        smokeContinue.addEventListener("pointerup", onSmokeContinue);
        smokeContinue.addEventListener("keydown", function (ev) {
          var key = ev && (ev.key || ev.code);
          if (key === "Enter" || key === " " || key === "Spacebar") onSmokeContinue(ev);
        });
      }
      /* confessionaleIntroOnce1: con smoke armato, tap ovunque sullo smoke = entra (click più affidabile) */
      if (smokeRoot) {
        smokeRoot.addEventListener("pointerup", function (ev) {
          if (!smokeArmed || curtainDone) return;
          onSmokeContinue(ev);
        });
        smokeRoot.addEventListener("click", function (ev) {
          if (curtainDone) return;
          if (!smokeArmed) {
            if (ev) {
              try {
                ev.preventDefault();
                ev.stopPropagation();
              } catch (eIgn) {}
            }
            kickBgmFromGesture();
            armSmokeNow();
            return;
          }
          onSmokeContinue(ev);
        });
      }
    }

    if (!introAlreadyDone()) {
      lockIntroScroll();
      scheduleIntroWatchdog();
    } else {
      markSequenceDone();
    }
    bootCurtainWhenReady();
    clearInlineFeedback();
    connectConfWs();
    loadList(false);
    try {
      if (/vc-conf-card-/i.test(String(location.hash || ""))) applyConfessionDeepLink();
    } catch (eBoot) {}
  }

  if (!introAlreadyDone()) {
    lockIntroScroll();
    primeIntroOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  window.addEventListener("beforeunload", disconnectConfWs);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && isReadTabActive()) {
      void refreshListQuiet();
    }
  });
  window.addEventListener("vc:site-api-refetch", function () {
    if (!byId("vc-conf-list")) return;
    void refreshListQuiet();
  });

  window.__vcConfessionaleVer = VER;
  window.__vcConfessionaleForceIntroDone = markSequenceDone;
})();
