(function () {
  var T = window.VCStaffTools;
  if (!T) return;

  var TABS = [
    { id: "pause", label: "Pause", queue: "pause", requiresHighStaff: true },
    { id: "candidature", label: "Candidature", queue: "candidature", requiresCandidatureReview: true },
    { id: "appelli", label: "Appelli", queue: "appelli", requiresAppelliReview: true },
    { id: "resoconti", label: "Resoconti", queue: "resoconti" },
  ];

  var QUEUE_FILTERS = {
    pause: [
      { id: "", label: "Tutte le pause" },
      { id: "staff", label: "Staff" },
      { id: "pm", label: "Partner Manager" },
    ],
    candidature: [
      { id: "", label: "Tutte" },
      { id: "helper", label: "Helper" },
      { id: "partnermanager", label: "Partner Manager" },
    ],
    appelli: [
      { id: "", label: "Tutti" },
      { id: "unban", label: "Unban" },
      { id: "unmute", label: "Unmute" },
    ],
    resoconti: [
      { id: "", label: "Tutti" },
      { id: "staff", label: "Staff" },
      { id: "pm", label: "Partner Manager" },
    ],
  };

  var PAGE_SIZE = 10;
  var loadSeq = 0;
  var detailSeq = 0;
  var loadAbortCtrl = null;
  var loadWatchdogTimer = null;
  var initStarted = false;
  var loadInFlightNonQuiet = false;
  var initialQueueLoaded = false;
  var lastQueueLoadFailed = false;
  var initialLoadPromise = null;
  var loadQueueCoalesce = null;
  var pendingListRetryTimer = null;
  var pendingListRetryCount = 0;
  var PENDING_LIST_RETRY_MAX = 5;
  /** Seq del boot in corso: niente abort da retry interni (mobile primo avvio). */
  var bootLoadSeq = 0;
  var mobileAppealFixAttempts = 0;
  var MOBILE_APPEAL_FIX_MAX = 4;
  var appealFixWaitCount = 0;
  var skeletonWatchdogTimer = null;
  var SKELETON_WATCHDOG_MS = 8500;
  /** Tab già caricate vuote nonostante summary>0 (evita loop / badge fantasma). */
  var emptyLoadedTabs = Object.create(null);
  var SUMMARY_CACHE_KEY = "vc_inbox_summary_v1";
  var SUMMARY_CACHE_LOCAL_KEY = "vc_inbox_summary_local_v1";
  var SUMMARY_CACHE_TTL_MS = 90000;
  var SUMMARY_CACHE_LOCAL_TTL_MS = 300000;
  var inboxBooting = false;

  function inboxLoadBusy() {
    return Boolean(loadInFlightNonQuiet);
  }

  function clearSkeletonWatchdog() {
    if (skeletonWatchdogTimer) {
      clearTimeout(skeletonWatchdogTimer);
      skeletonWatchdogTimer = null;
    }
  }

  function forceReleaseStuckInboxLoad() {
    loadInFlightNonQuiet = false;
    bootLoadSeq = 0;
    loadQueueCoalesce = null;
    clearLoadWatchdog();
    clearSkeletonWatchdog();
    try {
      if (loadAbortCtrl) loadAbortCtrl.abort();
    } catch (eAbort) {}
    loadAbortCtrl = null;
  }

  function forceAppealSyncLoad(reason) {
    if (!isStaffScopeActive()) return;
    if (state.items && state.items.length) return;
    delete emptyLoadedTabs.appelli;
    pendingListRetryCount = 0;
    if (state.tab !== "appelli" || state.scope !== "pending") {
      if (canAccessTab("appelli") && appealPendingInSummary()) {
        state.tab = "appelli";
        state.scope = "pending";
        state.page = 1;
        renderTabs();
        syncUrlState();
      }
    }
    forceReleaseStuckInboxLoad();
    return loadQueue({
      soft: Boolean(state.items.length),
      sync: true,
      _userIntent: true,
      _internal: true,
      _mobileAppealFix: true,
      _skeletonWatchdog: Boolean(reason),
      _noSkeleton: true,
    }).catch(function () {
      finishQueueLoad(loadSeq, { force: true });
    });
  }

  function armSkeletonWatchdog() {
    clearSkeletonWatchdog();
    if (!(T.isCoarseMobile && T.isCoarseMobile())) return;
    if (!isStaffScopeActive()) return;
    if (state.tab !== "appelli" || state.scope !== "pending") return;
    if (!appealPendingInSummary()) return;
    skeletonWatchdogTimer = window.setTimeout(function () {
      skeletonWatchdogTimer = null;
      if (state.items && state.items.length) return;
      if (!listEmptyDespitePending()) return;
      forceAppealSyncLoad(true);
    }, SKELETON_WATCHDOG_MS);
  }

  function endNonQuietQueueLoad(seq, opts) {
    opts = opts || {};
    if (seq !== loadSeq) return;
    loadInFlightNonQuiet = false;
    finishQueueLoad(seq, opts);
  }

  var STATUS_LABELS = {
    pending: "In attesa",
    accepted: "Accettata",
    rejected: "Rifiutata",
    closed: "Chiusa",
    cancelled: "Annullata",
  };

  var state = {
    tab: "pause",
    scope: "pending",
    summary: null,
    permissions: null,
    items: [],
    detail: null,
    detailLoading: false,
    detailError: "",
    selectedKey: "",
    filter: "",
    week: "",
    weeks: [],
    page: 1,
    pagination: null,
    busy: false,
    inboxWs: null,
    inboxWsReconnectTimer: null,
    inboxRefreshTimer: null,
    inboxSoftRefreshTimer: null,
    localDecisions: {},
  };

  function readPermissions() {
    var p = state.permissions && typeof state.permissions === "object" ? state.permissions : null;
    if (p) return p;
    var g = window.__VC_STAFF_PERMS && typeof window.__VC_STAFF_PERMS === "object" ? window.__VC_STAFF_PERMS : null;
    return g || {};
  }

  function canAccessTab(tabId) {
    var tab = TABS.find(function (t) {
      return t.id === tabId;
    });
    if (!tab) return false;
    var perms = readPermissions();
    if (tab.requiresHighStaff && !(perms.isHighStaff || perms.canManage || perms.highStaff)) return false;
    if (tab.requiresCandidatureReview && !perms.candidatureReview) return false;
    if (
      tab.requiresAppelliReview &&
      !(
        perms.appelliReview ||
        perms.isHighStaff ||
        perms.canManage ||
        perms.highStaff ||
        perms.director
      )
    ) {
      return false;
    }
    return true;
  }

  function firstAccessibleTab() {
    for (var i = 0; i < TABS.length; i += 1) {
      if (canAccessTab(TABS[i].id)) return TABS[i].id;
    }
    return "resoconti";
  }

  function permissionsReady() {
    if (state.permissions && typeof state.permissions === "object") return true;
    var g = window.__VC_STAFF_PERMS && typeof window.__VC_STAFF_PERMS === "object" ? window.__VC_STAFF_PERMS : null;
    return Boolean(g && g.ok);
  }

  function ensureAccessibleTab() {
    if (!permissionsReady()) return;
    if (canAccessTab(state.tab)) return;
    state.tab = firstAccessibleTab();
    state.filter = "";
    state.week = "";
    state.weeks = [];
    state.page = 1;
    syncUrlState();
  }

  /** Al primo load: se la tab corrente è vuota, apri la prima con richieste in attesa. */
  function pickBestTabFromSummary(opts) {
    opts = opts || {};
    if (!permissionsReady()) return;
    if (!state.summary || typeof state.summary !== "object") return;
    ensureAccessibleTab();
    var skipEmpty = Boolean(opts.skipEmpty);
    function tabHasPending(id) {
      if (!canAccessTab(id)) return false;
      if (skipEmpty && emptyLoadedTabs[id]) return false;
      return Number(state.summary[id] || 0) > 0;
    }
    if (tabHasPending(state.tab)) return;
    for (var i = 0; i < TABS.length; i += 1) {
      var t = TABS[i];
      if (!tabHasPending(t.id)) continue;
      state.tab = t.id;
      state.filter = "";
      state.week = "";
      state.weeks = [];
      state.page = 1;
      syncUrlState();
      return;
    }
  }

  function listEmptyDespitePending() {
    if (state.items && state.items.length) return false;
    if (state.scope !== "pending") return false;
    if (!state.summary || typeof state.summary !== "object") return false;
    // Solo la tab corrente: se un'altra coda ha badge pending non bloccare
    // "Caricamento appelli…" all'infinito mentre quella tab è già vuota ok.
    return Number(state.summary[state.tab] || 0) > 0 && !emptyLoadedTabs[state.tab];
  }

  function markTabConfirmedEmpty(tabId) {
    var id = String(tabId || state.tab || "").trim();
    if (!id) return;
    emptyLoadedTabs[id] = true;
    if (state.summary && typeof state.summary === "object" && Number(state.summary[id] || 0) > 0) {
      state.summary[id] = 0;
      try {
        sessionStorage.setItem(
          SUMMARY_CACHE_KEY,
          JSON.stringify({ summary: state.summary, permissions: state.permissions, at: Date.now() }),
        );
      } catch (eCache) {}
      renderTabs();
    }
  }

  function appealPendingInSummary() {
    return Boolean(state.summary && Number(state.summary.appelli || 0) > 0);
  }

  function isStaleEmptyAppealPrefetch(out, requestedTab, requestedScope) {
    if (String(requestedTab || "") !== "appelli") return false;
    if (String(requestedScope || "pending") !== "pending") return false;
    if (!out || !out.data || !out.data.ok) return false;
    if (out._staleEmpty) return true;
    var items = out.data.items || [];
    if (items.length) return false;
    var sum = out.data.summary || state.summary;
    return Number((sum && sum.appelli) || 0) > 0;
  }

  function needsMobileAppealReload() {
    if (!(T.isCoarseMobile && T.isCoarseMobile())) return false;
    if (!isStaffScopeActive()) return false;
    if (state.tab !== "appelli" || state.scope !== "pending") return false;
    if (state.items && state.items.length) return false;
    if (!appealPendingInSummary()) return false;
    if (mobileAppealFixAttempts >= MOBILE_APPEAL_FIX_MAX) return false;
    return true;
  }

  function armMobileAppealBootFix(delayMs) {
    if (!needsMobileAppealReload()) return;
    window.setTimeout(function () {
      if (!needsMobileAppealReload()) return;
      if (inboxLoadBusy()) {
        appealFixWaitCount += 1;
        if (appealFixWaitCount > 20) {
          appealFixWaitCount = 0;
          forceAppealSyncLoad(true);
          return;
        }
        armMobileAppealBootFix(450);
        return;
      }
      appealFixWaitCount = 0;
      mobileAppealFixAttempts += 1;
      delete emptyLoadedTabs.appelli;
      pendingListRetryCount = 0;
      loadQueue({
        soft: Boolean(state.items.length),
        sync: true,
        _userIntent: true,
        _internal: true,
        _mobileAppealFix: true,
        _noSkeleton: true,
      }).catch(function () {});
    }, Math.max(300, Number(delayMs) || 900));
  }

  function scheduleMobileAppealBootGuarantee() {
    if (!(T.isCoarseMobile && T.isCoarseMobile())) return;
    if (!isStaffScopeActive()) return;
    [500, 1600, 3200].forEach(function (ms) {
      window.setTimeout(function () {
        if (!isStaffScopeActive()) return;
        if (state.items && state.items.length) return;
        if (!appealPendingInSummary()) return;
        if (state.tab !== "appelli" || state.scope !== "pending") {
          pickBestTabFromSummary();
          renderTabs();
        }
        armMobileAppealBootFix(0);
      }, ms);
    });
  }

  function waitForAppealPrefetch(maxMs) {
    return new Promise(function (resolve) {
      try {
        var pf = window.__VC_INBOX_QUEUE_PREFETCH;
        if (!pf || !pf.promise || String(pf.tab || "") !== "appelli") {
          resolve(false);
          return;
        }
        var cap = Math.max(1200, Number(maxMs) || 12000);
        var done = false;
        function finish(ok) {
          if (done) return;
          done = true;
          resolve(Boolean(ok));
        }
        var timer = window.setTimeout(function () {
          finish(false);
        }, cap);
        Promise.resolve(pf.promise)
          .then(function () {
            window.clearTimeout(timer);
            finish(true);
          })
          .catch(function () {
            window.clearTimeout(timer);
            finish(false);
          });
      } catch (eWait) {
        resolve(false);
      }
    });
  }

  function shouldAwaitAppealPrefetchBeforeBoot() {
    if (!(T.isCoarseMobile && T.isCoarseMobile())) return false;
    if (!appealPendingInSummary()) return false;
    try {
      var pf = window.__VC_INBOX_QUEUE_PREFETCH;
      return Boolean(pf && pf.promise && String(pf.tab || "") === "appelli");
    } catch (ePf) {
      return false;
    }
  }

  function runBootQueueLoad() {
    function afterBootQueue() {
      if (needsMobileAppealReload()) armMobileAppealBootFix(400);
      scheduleMobileAppealBootGuarantee();
    }
    armSkeletonWatchdog();
    return loadQueue({ soft: false, _boot: true, sync: true }).then(afterBootQueue);
  }

  function consumeQueuePrefetch(requestedTab, requestedScope, requestedPage) {
    // Primo boot mobile: riusa il warm prefetch da Personali (dopo ok resta disabilitato).
    if (T.isCoarseMobile && T.isCoarseMobile() && initialQueueLoaded) return null;
    try {
      var pf = window.__VC_INBOX_QUEUE_PREFETCH;
      if (!pf || !pf.promise) return null;
      if (String(pf.tab || "") !== String(requestedTab || "")) return null;
      if (String(pf.scope || "pending") !== String(requestedScope || "pending")) return null;
      if (Number(requestedPage || 1) !== Number(pf.page || 1)) return null;
      if (Date.now() - Number(pf.at || 0) > 120000) return null;
      return Promise.resolve(pf.promise).then(function (out) {
        if (!out || !out.res) return null;
        if (isStaleEmptyAppealPrefetch(out, requestedTab, requestedScope)) return null;
        window.__VC_INBOX_QUEUE_PREFETCH = null;
        return out;
      });
    } catch (ePf) {
      return null;
    }
  }

  function reconcileStalePendingSummary() {
    if (!state.summary || typeof state.summary !== "object") return;
    var touched = false;
    TABS.forEach(function (t) {
      if (!canAccessTab(t.id)) return;
      if (Number(state.summary[t.id] || 0) > 0) {
        state.summary[t.id] = 0;
        emptyLoadedTabs[t.id] = true;
        touched = true;
      }
    });
    if (touched) {
      try {
        sessionStorage.setItem(
          SUMMARY_CACHE_KEY,
          JSON.stringify({ summary: state.summary, permissions: state.permissions, at: Date.now() }),
        );
      } catch (eCache) {}
      renderTabs();
    }
  }

  function schedulePendingListRetry() {
    if (pendingListRetryTimer || !isStaffScopeActive()) return;
    if (inboxLoadBusy()) return;
    // Primo avvio mobile: lascia finire il boot (PTR funziona perché parte dopo).
    if (!initialQueueLoaded || bootLoadSeq) return;
    if (pendingListRetryCount >= PENDING_LIST_RETRY_MAX) {
      reconcileStalePendingSummary();
      finishQueueLoad(loadSeq, { force: true });
      return;
    }
    pendingListRetryTimer = window.setTimeout(function () {
      pendingListRetryTimer = null;
      if (!listEmptyDespitePending() || inboxLoadBusy()) return;
      pendingListRetryCount += 1;
      loadQueue({ soft: true, _internal: true, sync: true, _emptyRetry: true }).catch(function () {});
    }, 650);
  }

  function waitForDiscordToken() {
    if (T.getToken()) return Promise.resolve(true);
    var mobile = T.isCoarseMobile && T.isCoarseMobile();
    var cap = mobile ? 3200 : 1400;
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        window.removeEventListener("vc-discord-profile", onProfile);
        resolve(Boolean(T.getToken()));
      }
      function onProfile() {
        finish();
      }
      window.addEventListener("vc-discord-profile", onProfile);
      (function poll() {
        if (done) return;
        if (T.getToken()) {
          finish();
          return;
        }
        cap -= 120;
        if (cap <= 0) {
          finish();
          return;
        }
        window.setTimeout(poll, 120);
      })();
    });
  }

  function finalizeVisibleQueueLoad(seq, quiet) {
    if (!quiet && seq === loadSeq) {
      if (inboxBooting) hideInboxBootScreen();
      endNonQuietQueueLoad(seq);
    }
  }

  function isInboxEmbed() {
    try {
      if (window.__VC_STAFF_INBOX_EMBED) return true;
      if (document.body && document.body.classList.contains("vc-notifications-page")) return true;
    } catch (eEmb) {}
    return false;
  }

  function isStaffScopeActive() {
    if (!isInboxEmbed()) return true;
    try {
      // Solo il body class (settato dallo switcher) conta: non usare ?tab= / ?view=
      // altrimenti un deep-link o URL sporco fa partire la coda su Personali → toast.
      if (document.body && document.body.classList.contains("vc-notif-scope-staff")) return true;
    } catch (eScope) {}
    return false;
  }

  function inboxTabQueryKey() {
    return isInboxEmbed() ? "inbox" : "tab";
  }

  function readUrlState() {
    try {
      var params = new URLSearchParams(location.search);
      state.tab = currentTab();
      state.scope = currentScope();
      state.filter = String(params.get("filter") || "").trim().toLowerCase();
      state.week = String(params.get("week") || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(state.week)) state.week = "";
      state.page = Math.max(1, Number(params.get("page") || "1") || 1);
    } catch (eUrl) {
      state.tab = currentTab();
      state.scope = currentScope();
    }
    ensureAccessibleTab();
  }

  function syncUrlState() {
    try {
      // Embed su Personali: non toccare l'URL (niente view=staff / inbox=…).
      if (isInboxEmbed() && !isStaffScopeActive()) return;
      var u = new URL(location.href);
      var tabKey = inboxTabQueryKey();
      u.searchParams.set(tabKey, state.tab);
      u.searchParams.set("scope", state.scope);
      if (state.filter) u.searchParams.set("filter", state.filter);
      else u.searchParams.delete("filter");
      if (state.tab === "resoconti" && state.week) u.searchParams.set("week", state.week);
      else u.searchParams.delete("week");
      if (state.page > 1) u.searchParams.set("page", String(state.page));
      else u.searchParams.delete("page");
      if (isInboxEmbed()) {
        u.searchParams.set("view", "staff");
        // Never overwrite notifications switcher with inbox category on ?tab=
        var legacyTab = String(u.searchParams.get("tab") || "").trim().toLowerCase();
        if (
          legacyTab === "staff" ||
          legacyTab === "personal" ||
          TABS.some(function (t) {
            return t.id === legacyTab;
          })
        ) {
          u.searchParams.delete("tab");
        }
      }
      history.replaceState({}, "", u.pathname + u.search);
    } catch (eSync) {}
  }

  function apiBase() {
    return T.resolveApiUrl(window.__VC_STAFF_WORKFLOWS, "/webhooks/site-staff-workflows");
  }

  function inboxRealtimeWsUrl() {
    var api = apiBase();
    if (!api || typeof URL === "undefined") return "";
    try {
      var abs = /^https?:\/\//i.test(api) ? api : new URL(api, window.location.href).href;
      var u = new URL(abs);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      var path = String(u.pathname || "").replace(/\/$/, "");
      var dir = path.replace(/\/[^/]+$/, "");
      u.pathname = (dir || "") + "/site-realtime-ws";
      u.search = "";
      u.hash = "";
      return u.href;
    } catch (eWs) {
      return "";
    }
  }

  function disconnectInboxWebSocket() {
    if (state.inboxWsReconnectTimer) {
      clearTimeout(state.inboxWsReconnectTimer);
      state.inboxWsReconnectTimer = null;
    }
    try {
      if (state.inboxWs) {
        state.inboxWs.onclose = null;
        state.inboxWs.close();
      }
    } catch (eClose) {}
    state.inboxWs = null;
  }

  function scheduleInboxWsReconnect() {
    if (state.inboxWsReconnectTimer) return;
    state.inboxWsReconnectTimer = setTimeout(function () {
      state.inboxWsReconnectTimer = null;
      connectInboxWebSocket();
    }, 8000);
  }

  function connectInboxWebSocket() {
    if (typeof WebSocket === "undefined") return;
    var url = inboxRealtimeWsUrl();
    if (!url) return;
    disconnectInboxWebSocket();
    try {
      var ws = new WebSocket(url);
      state.inboxWs = ws;
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || ""));
          if (!data) return;
          if (data.type === "staff_workflow_changed" || data.type === "staff_pauses_changed") {
            scheduleInboxRefreshFromRealtime();
          }
        } catch (eMsg) {}
      };
      ws.onclose = function () {
        state.inboxWs = null;
        scheduleInboxWsReconnect();
      };
      ws.onerror = function () {
        try {
          ws.close();
        } catch (eErr) {}
      };
    } catch (eConn) {
      scheduleInboxWsReconnect();
    }
  }

  function applySelectedItemFromList() {
    if (!state.selectedKey) return;
    var idx = state.items.findIndex(function (it) {
      return itemKey(it) === state.selectedKey;
    });
    if (idx < 0) {
      syncDetailWithList();
      return;
    }
    var row = state.items[idx];
    var prev = state.detail || {};
    state.detail = Object.assign({}, prev, row, {
      dedupeKey: row.dedupeKey || prev.dedupeKey || "",
      messageId: row.messageId || prev.messageId || "",
      channelId: row.channelId || prev.channelId || "",
      body: row.body || prev.body || "",
      content: row.content || prev.content || "",
      fields: Array.isArray(prev.fields) && prev.fields.length ? prev.fields : row.fields,
    });
    renderList();
    renderDetail();
    if (String(row.status || "").toLowerCase() !== "pending") {
      teardownChat();
    }
  }

  function selectedItemStillInList() {
    if (!state.selectedKey) return false;
    return state.items.some(function (it) {
      return itemKey(it) === state.selectedKey;
    });
  }

  function syncDetailWithList() {
    if (!state.detail && !state.selectedKey && !state.detailLoading) {
      renderDetail();
      return;
    }
    if (selectedItemStillInList()) {
      applySelectedItemFromList();
      return;
    }
    if (state.detail || state.selectedKey || state.detailLoading) {
      clearDetailState();
    }
  }

  function scheduleInboxRefreshFromRealtime(opts) {
    opts = opts || {};
    // Su mobile WS/PTR partono spesso durante il primo load: non cancellarlo.
    if (!initialQueueLoaded || loadInFlightNonQuiet) return;
    if (state.inboxRefreshTimer) clearTimeout(state.inboxRefreshTimer);
    state.inboxRefreshTimer = setTimeout(function () {
      state.inboxRefreshTimer = null;
      if (loadInFlightNonQuiet) return;
      loadQueue({ quiet: true, sync: Boolean(opts.sync) }).then(function () {
        loadSummary().catch(function () {});
        syncDetailWithList();
      });
    }, opts.immediate ? 120 : 650);
  }

  function scheduleInboxSoftRefresh() {
    if (state.inboxSoftRefreshTimer) clearTimeout(state.inboxSoftRefreshTimer);
    state.inboxSoftRefreshTimer = setTimeout(function () {
      state.inboxSoftRefreshTimer = null;
      loadQueue({ quiet: true }).catch(function () {});
      loadSummary().catch(function () {});
    }, 1800);
  }

  function rememberLocalDecision(patch) {
    if (!patch) return;
    var mid = String(patch.messageId || "").trim();
    if (!mid) return;
    if (!state.localDecisions) state.localDecisions = {};
    state.localDecisions[mid] = { at: Date.now(), patch: patch };
  }

  function mergeIncomingWorkflowItems(incoming) {
    var local = state.localDecisions || {};
    return (incoming || []).map(function (it) {
      var mid = String(it.messageId || itemKey(it) || "").trim();
      var memo = mid ? local[mid] : null;
      if (!memo) return it;
      if (Date.now() - memo.at > 180000) {
        delete local[mid];
        return it;
      }
      var serverPending = String(it.status || "").toLowerCase() === "pending";
      var localDecided = String(memo.patch.status || "").toLowerCase() !== "pending";
      if (serverPending && localDecided) {
        return Object.assign({}, it, memo.patch, {
          body: memo.patch.body || memo.patch.content || it.body || "",
          content: memo.patch.content || memo.patch.body || it.content || "",
          preview: memo.patch.preview || it.preview || "",
        });
      }
      if (!serverPending) delete local[mid];
      return it;
    });
  }

  function itemWithLocalDecision(item) {
    if (!item) return item;
    var mid = String(item.messageId || itemKey(item) || "").trim();
    if (!mid || !state.localDecisions) return item;
    var memo = state.localDecisions[mid];
    if (!memo) return item;
    if (Date.now() - memo.at > 180000) {
      delete state.localDecisions[mid];
      return item;
    }
    var serverPending = String(item.status || "").toLowerCase() === "pending";
    var localDecided = String(memo.patch.status || "").toLowerCase() !== "pending";
    if (serverPending && localDecided) {
      return Object.assign({}, item, memo.patch, {
        body: memo.patch.body || memo.patch.content || item.body || "",
        content: memo.patch.content || memo.patch.body || item.content || "",
        preview: memo.patch.preview || item.preview || "",
      });
    }
    if (!serverPending) delete state.localDecisions[mid];
    return item;
  }

  function bumpSummaryAfterAction(body) {
    if (!state.summary || !body) return;
    if (state.scope !== "pending") return;
    var tab = String(body.queue || state.tab || "").toLowerCase();
    if (tab && state.summary[tab] > 0) {
      state.summary[tab] = Math.max(0, Number(state.summary[tab] || 0) - 1);
      renderTabs();
    }
  }

  function optimisticWorkflowPatch(body, out) {
    if (out && out.data && out.data.item) return out.data.item;
    if (!body) return null;
    var tab = String(body.queue || state.tab || "").toLowerCase();
    if (tab === "resoconti") {
      var effectiveKey = resocontoEffectiveActionKey(body);
      var label = resocontoActionCodeLabel(effectiveKey);
      if (!label && isStaleWorkflowAction(out)) label = "";
      return {
        messageId: body.messageId || "",
        status: isStaleWorkflowAction(out) ? "accepted" : "accepted",
        statusLabel: label || "Accettata",
        actionKey: effectiveKey,
        canAct: false,
      };
    }
    var nextStatus = body.action === "reject" ? "rejected" : "accepted";
    var patch = { status: nextStatus, canAct: false };
    if (tab === "pause") {
      patch.id = body.pauseId || "";
      patch.userId = body.userId || "";
    } else {
      patch.messageId = body.messageId || "";
      patch.userId = body.userId || "";
    }
    return patch;
  }

  function applyActionResult(out, body) {
    var patch = optimisticWorkflowPatch(body, out);
    if (patch) {
      if (state.detail && String(patch.messageId || "") === String(state.detail.messageId || state.selectedKey || "")) {
        patch.body = patch.body || patch.content || state.detail.body || state.detail.content || "";
        patch.content = patch.content || patch.body || state.detail.content || state.detail.body || "";
      }
      rememberLocalDecision(patch);
      mergeWorkflowItemIntoList(patch);
    }
    if (
      state.scope === "pending" &&
      patch &&
      String(patch.status || "").toLowerCase() !== "pending"
    ) {
      state.items = state.items.filter(function (it) {
        return itemKey(it) !== state.selectedKey;
      });
      closeDetail();
    } else if (state.selectedKey && patch) {
      applySelectedItemFromList();
    } else {
      syncDetailWithList();
    }
    bumpSummaryAfterAction(body);
    T.hideStaffToast();
    inboxNotify(
      (out && out.data && out.data.message) ||
        (isStaleWorkflowAction(out) ? "Voce già gestita." : "Fatto."),
      false,
    );
    teardownChat();
    scheduleInboxSoftRefresh();
  }

  function resocontoCardAction(item) {
    item = itemWithLocalDecision(item);
    if (!item) return "";
    var st = String(item.status || "pending").toLowerCase();
    if (st === "pending" || st === "cancelled") {
      return (
        resocontoActionCodeLabel(item.actionKey) ||
        extractResocontoAzione(item.body || item.content || item.preview || "")
      );
    }
    var decided =
      resocontoActionCodeLabel(item.actionKey) ||
      extractResocontoDecisionFromBody(item.body || item.content || item.preview || "");
    if (decided) return decided;
    var label = statusLabel(item);
    if (!/^(accettata|rifiutata|chiusa|in attesa)$/i.test(label)) return label;
    return extractResocontoAzione(item.body || item.content || item.preview || "");
  }

  function mergeWorkflowItemIntoList(itemPatch) {
    if (!itemPatch) return;
    var idx = -1;
    if (state.tab === "pause") {
      var uid = String(itemPatch.userId || "").trim();
      var pid = String(itemPatch.id || itemPatch.pauseId || "").trim();
      if (!uid || !pid) return;
      idx = state.items.findIndex(function (it) {
        return String(it.userId || "") === uid && String(it.id || "") === pid;
      });
    } else {
      var mid = String(itemPatch.messageId || "").trim();
      if (!mid) return;
      idx = state.items.findIndex(function (it) {
        return String(it.messageId || itemKey(it) || "") === mid;
      });
    }
    if (idx < 0) {
      var patchMid = String(itemPatch.messageId || "").trim();
      if (patchMid && state.selectedKey && patchMid === state.selectedKey) {
        state.detail = Object.assign({}, state.detail || {}, itemPatch);
        renderDetail();
      }
      return;
    }
    var prev = state.items[idx] || {};
    state.items[idx] = Object.assign({}, prev, itemPatch, {
      messageId: itemPatch.messageId || prev.messageId || "",
      body: itemPatch.body || itemPatch.content || prev.body || "",
      content: itemPatch.content || itemPatch.body || prev.content || "",
      preview: itemPatch.preview || prev.preview || "",
      statusLabel: itemPatch.statusLabel || prev.statusLabel || "",
      actionKey: itemPatch.actionKey != null ? itemPatch.actionKey : prev.actionKey,
      canAct: itemPatch.canAct != null ? itemPatch.canAct : prev.canAct,
    });
    if (state.selectedKey && itemKey(state.items[idx]) === state.selectedKey) {
      state.detail = Object.assign({}, state.detail || {}, state.items[idx]);
    }
    renderList();
    renderDetail();
    if (String(state.items[idx].status || "").toLowerCase() !== "pending") {
      teardownChat();
    }
  }

  function applyWorkflowActionResponse(out, body) {
    var patch = out && out.data && out.data.item ? out.data.item : null;
    if (patch) {
      rememberLocalDecision(patch);
      mergeWorkflowItemIntoList(patch);
      return true;
    }
    if (!body || state.tab !== "resoconti") return false;
    var mid = String(body.messageId || "").trim();
    if (!mid) return false;
    mergeWorkflowItemIntoList({
      messageId: mid,
      status: isStaleWorkflowAction(out) ? "accepted" : "pending",
      canAct: false,
    });
    return false;
  }

  function isStaleWorkflowAction(out) {
    if (!out || !out.data) return false;
    var err = String(out.data.error || "").trim();
    if (err === "already_handled") return true;
    if (Number(out.res && out.res.status) === 409) return true;
    return /già stato gestito|già registrat/i.test(String(out.data.message || ""));
  }

  function chatApiBase() {
    return T.resolveApiUrl(window.__VC_STAFF_WORKFLOW_CHAT, "/webhooks/site-staff-workflow-chat");
  }

  function workflowDedupeKey(item, tab) {
    if (!item) return "";
    if (item.dedupeKey) return String(item.dedupeKey);
    var q = String(tab || state.tab || "").trim().toLowerCase();
    if (q === "pause") {
      var uid = String(item.userId || "").trim();
      var pid = String(item.id || item.pauseId || "").trim();
      return uid && pid ? "pause:" + uid + ":" + pid : "";
    }
    var mid = String(item.messageId || item.recordId || item.id || "").trim();
    if (!mid || !q) return "";
    return q + ":" + mid;
  }

  function initWorkflowChat() {
    if (!window.VcWorkflowChat) return;
    window.VcWorkflowChat.init({
      apiBase: chatApiBase,
      getProfileId: function () {
        return String((window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) || "");
      },
      dedupeKeyForItem: workflowDedupeKey,
      formatMessageHtml: formatDiscordHtml,
      esc: T.esc,
      avatarHtml: T.avatarImgHtml,
      fetchJson: T.fetchJson,
      byId: T.byId,
      getToken: T.getToken,
      sendBtnClass: "vc-staff-inbox-btn vc-staff-inbox-btn--ok",
      closedMessage: "Chat in sola lettura: la pratica non è più in attesa.",
      notify: function (msg, isError) {
        inboxNotify(msg, isError);
      },
    });
  }

  function teardownChat() {
    if (window.VcWorkflowChat) window.VcWorkflowChat.teardown();
  }

  function renderChatPanel(item) {
    initWorkflowChat();
    return window.VcWorkflowChat ? window.VcWorkflowChat.renderPanel(item, state.tab) : "";
  }

  function refreshChatDom() {
    initWorkflowChat();
    if (window.VcWorkflowChat) window.VcWorkflowChat.refreshDom();
  }

  function bootChatForDetail(item) {
    initWorkflowChat();
    if (window.VcWorkflowChat) window.VcWorkflowChat.boot(item, state.tab);
  }

  initWorkflowChat();

  function inboxNotify(msg, isError, opts) {
    // Embed /notifications: mai toast di coda (anche su Staff) — solo stato inline.
    if (isInboxEmbed()) {
      try {
        T.hideStaffToast();
      } catch (eHide) {}
      try {
        if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") {
          window.VcSiteToast.hide();
        }
      } catch (eSite) {}
      return;
    }
    if (!msg) {
      T.hideStaffToast();
      return;
    }
    T.showStaffToast(msg, Boolean(isError), opts || null);
  }

  function currentTab() {
    try {
      var params = new URLSearchParams(location.search);
      var key = inboxTabQueryKey();
      var q = String(params.get(key) || "").trim();
      // Ignore notifications switcher values if they leaked into the inbox key.
      if (q === "staff" || q === "personal") q = "";
      if (
        TABS.some(function (t) {
          return t.id === q;
        })
      ) {
        return q;
      }
      // Embed legacy: never treat notifications ?tab=staff as an inbox category.
      if (!isInboxEmbed()) {
        var legacy = String(params.get("tab") || "").trim();
        if (
          TABS.some(function (t) {
            return t.id === legacy;
          })
        ) {
          return legacy;
        }
      }
    } catch (e) {}
    return firstAccessibleTab();
  }

  function currentScope() {
    try {
      var q = String(new URLSearchParams(location.search).get("scope") || "").trim().toLowerCase();
      if (q === "pending" || q === "all") return q;
    } catch (e2) {}
    return state.scope;
  }

  function setTab(tab) {
    state.tab = tab;
    teardownChat();
    state.detail = null;
    state.selectedKey = "";
    state.detailLoading = false;
    state.detailError = "";
    state.page = 1;
    state.filter = "";
    state.week = "";
    state.weeks = [];
    state.items = [];
    state.pagination = null;
    syncUrlState();
    showInboxLoading("skeleton");
    loadQueue();
  }

  function setScope(scope) {
    state.scope = scope === "pending" ? "pending" : "all";
    state.detail = null;
    state.selectedKey = "";
    state.detailLoading = false;
    state.detailError = "";
    state.page = 1;
    syncUrlState();
    renderDetail();
    loadQueue({ soft: true });
  }

  function setFilter(filterId) {
    state.filter = String(filterId || "").trim().toLowerCase();
    state.detail = null;
    state.selectedKey = "";
    state.detailLoading = false;
    state.page = 1;
    syncUrlState();
    renderDetail();
    loadQueue({ soft: true });
  }

  function setWeek(weekKey) {
    state.week = String(weekKey || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(state.week)) state.week = "";
    state.detail = null;
    state.selectedKey = "";
    state.detailLoading = false;
    state.page = 1;
    syncUrlState();
    renderDetail();
    loadQueue({ soft: true });
  }

  function setPage(page) {
    state.page = Math.max(1, Number(page) || 1);
    state.detail = null;
    state.selectedKey = "";
    state.detailLoading = false;
    syncUrlState();
    renderDetail();
    loadQueue({ soft: true });
  }

  function statusLabel(item) {
    item = itemWithLocalDecision(item);
    var itemStatus = String((item && item.status) || "pending").toLowerCase();
    if (item && item.statusLabel) {
      var stored = String(item.statusLabel).trim();
      // Pause: non mostrare "Richiesta" se la pratica è già gestita.
      if (state.tab === "pause" && itemStatus !== "pending" && /^richiesta$/i.test(stored)) {
        stored = "";
      }
      if (stored) {
        if (
          state.tab !== "resoconti" ||
          itemStatus === "pending" ||
          itemStatus === "cancelled" ||
          !/^(accettata|rifiutata|chiusa)$/i.test(stored)
        ) {
          return stored;
        }
      }
    }
    if (state.tab === "resoconti" && item) {
      var st = String((item && item.status) || "pending").toLowerCase();
      if (st === "rejected") return "Azione negata";
      if (st !== "pending" && st !== "cancelled") {
        var fromKey = resocontoActionCodeLabel(item.actionKey);
        if (fromKey) return fromKey;
        var fromBody = extractResocontoDecisionFromBody(item.body || item.content || item.preview || "");
        if (fromBody) return fromBody;
      }
    }
    var key = String((item && item.status) || "pending").toLowerCase();
    if (state.tab === "pause" && key === "pending") return "Richiesta";
    return STATUS_LABELS[key] || key;
  }

  function statusClass(item) {
    var key = String((item && item.status) || "pending").toLowerCase();
    if (key === "accepted") return "is-accepted";
    if (key === "rejected") return "is-rejected";
    if (key === "pending") return "is-pending";
    return "is-closed";
  }

  function itemKey(item) {
    if (state.tab === "pause") return String(item.userId || "") + ":" + String(item.id || "");
    return String(item.messageId || item.recordId || item.id || "");
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return String(iso);
    }
  }

  function queueFilterGroupLabel() {
    if (state.tab === "appelli") return "Tipo";
    if (state.tab === "candidature") return "Tipo";
    return "Ruolo";
  }

  function renderQueueFilters() {
    var root = T.byId("vc-staff-inbox-filters");
    if (!root) return;
    var options = QUEUE_FILTERS[state.tab] || [];
    if (!options.length) {
      root.innerHTML = "";
      root.hidden = true;
      return;
    }
    root.hidden = false;
    var embed = isInboxEmbed();
    var segClass = embed
      ? "vc-staff-inbox-filter-group__seg vc-notify-filter-bar"
      : "vc-staff-inbox-filter-group__seg";
    root.innerHTML =
      '<span class="vc-staff-inbox-filter-group__label">' +
      T.esc(queueFilterGroupLabel()) +
      "</span>" +
      '<div class="' +
      segClass +
      '" role="group">' +
      options
        .map(function (opt) {
          var active = String(state.filter || "") === String(opt.id || "");
          var btnClass = embed
            ? "vc-notify-filter-btn" + (active ? " vc-notify-filter-btn--on is-active" : "")
            : "vc-staff-inbox-filter-btn" + (active ? " is-active" : "");
          return (
            '<button type="button" class="' +
            btnClass +
            '" data-filter="' +
            T.esc(opt.id || "") +
            '">' +
            T.esc(opt.label) +
            "</button>"
          );
        })
        .join("") +
      "</div>";
    root.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setFilter(btn.getAttribute("data-filter") || "");
        renderQueueFilters();
      });
    });
  }

  function renderWeekNav() {
    var root = T.byId("vc-staff-inbox-week");
    if (!root) return;
    if (state.tab !== "resoconti") {
      root.hidden = true;
      root.innerHTML = "";
      return;
    }
    var weeks = Array.isArray(state.weeks) ? state.weeks : [];
    if (!weeks.length) {
      root.hidden = true;
      root.innerHTML = "";
      return;
    }
    var idx = weeks.findIndex(function (w) {
      return String(w.weekKey) === String(state.week);
    });
    if (idx < 0) idx = 0;
    var current = weeks[idx] || weeks[0];
    var label = (current && current.label) || state.week || "Settimana";
    var count = current && current.count != null ? " · " + current.count : "";
    root.hidden = false;
    root.innerHTML =
      '<button type="button" class="vc-staff-inbox-week-btn" data-week-nav="prev"' +
      (idx >= weeks.length - 1 ? " disabled" : "") +
      ' aria-label="Settimana precedente">\u2039</button>' +
      '<div class="vc-staff-inbox-week__label" title="' +
      T.esc(current && current.weekKey ? current.weekKey : "") +
      '"><span>Settimana</span><strong>' +
      T.esc(label) +
      "</strong>" +
      (count ? '<em>' + T.esc(String(current.count)) + " resoconti</em>" : "") +
      "</div>" +
      '<button type="button" class="vc-staff-inbox-week-btn" data-week-nav="next"' +
      (idx <= 0 ? " disabled" : "") +
      ' aria-label="Settimana successiva">\u203A</button>';
    root.querySelectorAll("[data-week-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var dir = btn.getAttribute("data-week-nav");
        var nextIdx = dir === "prev" ? idx + 1 : idx - 1;
        if (nextIdx < 0 || nextIdx >= weeks.length) return;
        setWeek(weeks[nextIdx].weekKey);
        renderWeekNav();
      });
    });
  }

  function currentPageSize() {
    var p = state.pagination;
    return Math.max(1, Number((p && p.pageSize) || PAGE_SIZE) || PAGE_SIZE);
  }

  function buildPaginationHtml() {
    var p = state.pagination;
    if (!p) return "";
    var pageSize = currentPageSize();
    var page = Math.max(1, Number(p.page) || state.page || 1);
    var totalPages = Math.max(1, Number(p.totalPages) || 1);
    var total = Math.max(0, Number(p.total) || 0);
    if (!total && !(state.items && state.items.length)) return "";
    var from = total ? (page - 1) * pageSize + 1 : 0;
    var to = Math.min(total, page * pageSize);
    var navDisabled = totalPages <= 1;
    return (
      '<div class="vc-staff-inbox-pagination__info">' +
      T.esc(total ? from + "\u2013" + to + " di " + total : "0 risultati") +
      "</div>" +
      '<div class="vc-staff-inbox-pagination__nav">' +
      '<button type="button" class="vc-staff-inbox-page-btn" data-page="prev"' +
      (navDisabled || page <= 1 ? " disabled" : "") +
      ">\u2190 Prec</button>" +
      '<span class="vc-staff-inbox-pagination__label">Pagina ' +
      page +
      " / " +
      totalPages +
      "</span>" +
      '<button type="button" class="vc-staff-inbox-page-btn" data-page="next"' +
      (navDisabled || page >= totalPages ? " disabled" : "") +
      ">Succ \u2192</button>" +
      "</div>"
    );
  }

  function wirePaginationRoot(root, page) {
    if (!root) return;
    root.querySelectorAll("[data-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var dir = btn.getAttribute("data-page");
        if (dir === "prev") setPage(page - 1);
        else if (dir === "next") setPage(page + 1);
        var list = T.byId("vc-staff-inbox-list");
        if (list && list.scrollIntoView) list.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function renderPagination() {
    var html = buildPaginationHtml();
    var show = Boolean(html);
    var page = Math.max(1, Number((state.pagination && state.pagination.page) || state.page) || 1);
    ["vc-staff-inbox-pagination"].forEach(function (id) {
      var root = T.byId(id);
      if (!root) return;
      if (!show) {
        root.hidden = true;
        root.innerHTML = "";
        return;
      }
      root.hidden = false;
      root.innerHTML = html;
      wirePaginationRoot(root, page);
    });
  }

  function filterBtnClass(active) {
    if (isInboxEmbed()) {
      return (
        "vc-notify-filter-btn" +
        (active ? " vc-notify-filter-btn--on is-active" : "")
      );
    }
    return "vc-staff-inbox-scope-btn" + (active ? " is-active" : "");
  }

  function renderScopeToggle() {
    var root = T.byId("vc-staff-inbox-scope");
    if (!root) return;
    var embed = isInboxEmbed();
    var segClass = embed
      ? "vc-staff-inbox-filter-group__seg vc-notify-filter-bar"
      : "vc-staff-inbox-filter-group__seg";
    var pendingCls = embed
      ? filterBtnClass(state.scope === "pending")
      : "vc-staff-inbox-scope-btn" + (state.scope === "pending" ? " is-active" : "");
    var allCls = embed
      ? filterBtnClass(state.scope === "all")
      : "vc-staff-inbox-scope-btn" + (state.scope === "all" ? " is-active" : "");
    root.innerHTML =
      '<span class="vc-staff-inbox-filter-group__label">Stato</span>' +
      '<div class="' +
      segClass +
      '" role="group">' +
      '<button type="button" class="' +
      pendingCls +
      '" data-scope="pending">In attesa</button>' +
      '<button type="button" class="' +
      allCls +
      '" data-scope="all">Anche chiuse</button>' +
      "</div>";
    root.querySelectorAll("[data-scope]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setScope(btn.getAttribute("data-scope"));
        renderScopeToggle();
        renderQueueFilters();
      });
    });
  }

  function renderTabs() {
    var root = T.byId("vc-staff-inbox-tabs");
    if (!root) return;
    var embed = isInboxEmbed();
    if (embed) {
      root.className =
        "vc-notify-filter-bar inline-flex flex-wrap items-center gap-2 rounded-xl p-1.5 vc-staff-inbox-tabs-bar";
    } else {
      root.className = "vc-staff-tools-tabs";
    }
    root.innerHTML = TABS.filter(function (t) {
      return canAccessTab(t.id);
    })
      .map(function (t) {
      var count = state.summary && state.summary[t.id] != null ? Number(state.summary[t.id]) : 0;
      var active = state.tab === t.id;
      var btnClass = embed
        ? "vc-notify-filter-btn" + (active ? " vc-notify-filter-btn--on is-active" : "")
        : "vc-staff-tools-tab" + (active ? " is-active" : "");
      return (
        '<button type="button" class="' +
        btnClass +
        '" data-tab="' +
        T.esc(t.id) +
        '">' +
        T.esc(t.label) +
        (count ? ' <span class="vc-staff-inbox-tab__count">' + count + "</span>" : "") +
        "</button>"
      );
    }).join("");
    root.querySelectorAll("[data-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTab(btn.getAttribute("data-tab"));
        renderTabs();
        renderQueueFilters();
      });
    });
  }

  function cleanDiscordText(text, opts) {
    var keepNewlines = Boolean(opts && opts.keepNewlines);
    var keepCustomEmoji = Boolean(opts && opts.keepCustomEmoji);
    var s = String(text || "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, "")
      // Tieni ZWJ (\u200D): serve alle emoji unicode composite.
      .replace(/[\u200B\u200C\uFEFF]/g, "");
    var emojiTokens = [];
    if (keepCustomEmoji) {
      s = s.replace(/<(a?):([\w~-]+:\d+)>/g, function (m) {
        var i = emojiTokens.length;
        emojiTokens.push(m);
        return "{{VCEMOJI" + i + "}}";
      });
    } else {
      s = s.replace(/<a?:[\w~-]+:\d+>/g, "");
    }
    s = s
      .replace(/<(?:@(?:!|&)?|#)\d+>/g, "")
      .replace(/\[([^\]]+)\]\(\s*<?https?:\/\/[^)\s>]+>?\s*\)/gi, "$1")
      .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/\|\|(.+?)\|\|/g, "$1")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/[*_`~|]+/g, "");
    if (keepCustomEmoji && emojiTokens.length) {
      for (var ei = 0; ei < emojiTokens.length; ei++) {
        s = s.split("{{VCEMOJI" + ei + "}}").join(emojiTokens[ei]);
      }
    }
    if (keepNewlines) {
      return s
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
    }
    return s.replace(/\s+/g, " ").trim();
  }

  /** Evita che split su ":" spezzi `<:nome:id>` / `<a:nome:id>`. */
  function protectDiscordEmojis(text) {
    var tokens = [];
    var out = String(text || "").replace(/<(a?):([\w~-]+):(\d+)>/g, function (m) {
      var i = tokens.length;
      tokens.push(m);
      return "{{VCEMOJI" + i + "}}";
    });
    return { text: out, tokens: tokens };
  }

  function restoreDiscordEmojis(text, tokens) {
    var s = String(text || "");
    if (!tokens || !tokens.length) return s;
    for (var i = 0; i < tokens.length; i++) {
      s = s.split("{{VCEMOJI" + i + "}}").join(tokens[i]);
    }
    return s;
  }

  function formatDiscordHtml(text, opts) {
    var keepNewlines = Boolean(opts && opts.keepNewlines);
    var tokens = [];
    var withPlaceholders = String(text || "").replace(/<(a?):([\w~-]+):(\d+)>/g, function (_m, animated, name, id) {
      var i = tokens.length;
      var src =
        "https://cdn.discordapp.com/emojis/" +
        T.esc(id) +
        ".webp?size=64" +
        (animated === "a" ? "&animated=true" : "&quality=lossless");
      tokens.push(
        '<img class="vc-emoji vc-discord-emoji" src="' +
          src +
          '" alt=":' +
          T.esc(name) +
          ':" title=":' +
          T.esc(name) +
          ':" width="20" height="20" loading="lazy" decoding="async" />',
      );
      return "{{E" + i + "}}";
    });
    var cleaned = cleanDiscordText(withPlaceholders, {
      keepNewlines: keepNewlines,
      keepCustomEmoji: true,
    });
    var html = T.esc(cleaned);
    if (keepNewlines) html = html.replace(/\n/g, "<br>");
    tokens.forEach(function (img, i) {
      html = html.split("{{E" + i + "}}").join(img);
    });
    return html;
  }

  function looksLikeCandidaturaTitle(text) {
    return /^candidatura\b/i.test(String(text || "").trim());
  }

  function formatWorkflowType(type) {
    var t = String(type || "").trim().toLowerCase();
    if (t === "partnermanager") return "Partner Manager";
    if (t === "helper") return "Helper";
    return String(type || "").trim();
  }

  function isRoleSlug(text, type) {
    var v = cleanDiscordText(text).toLowerCase();
    if (!v) return true;
    if (type && v === String(type).trim().toLowerCase()) return true;
    return v === "helper" || v === "partnermanager" || v === "partner manager";
  }

  function isGenericAppealLabel(text) {
    return /^richiesta\s+(unban|unmute)\b/i.test(cleanDiscordText(text || ""));
  }

  function itemTitle(item) {
    var name = cleanDiscordText(item.displayName || "");
    var type = String(item.type || "").trim();
    if (
      name &&
      !isRoleSlug(name, type) &&
      !/^\d{16,20}$/.test(name) &&
      !looksLikeCandidaturaTitle(name) &&
      !isGenericAppealLabel(name)
    ) {
      return name;
    }
    var title = cleanDiscordText(item.title || "");
    if (title && looksLikeCandidaturaTitle(title)) {
      var num = (title.match(/#\s*(\d+)/) || [])[1];
      var role = formatWorkflowType(type) || title.replace(/^candidatura\s+/i, "").replace(/\(#[^)]+\)/g, "").trim();
      return (role ? "Candidatura " + role : "Candidatura") + (num ? " #" + num : "");
    }
    if (title && !isRoleSlug(title, type) && !looksLikeCandidaturaTitle(title) && !isGenericAppealLabel(title)) {
      // Appelli: titolo generico → preferisci il nome utente se c'è.
      if (state.tab === "appelli" && /richiesta\s+(unban|unmute)/i.test(title) && name && !/^\d{16,20}$/.test(name)) {
        return name;
      }
      return title;
    }
    if (state.tab === "appelli") {
      if (name && !/^\d{16,20}$/.test(name) && !isGenericAppealLabel(name)) return name;
      return item.kind === "unban" ? "Richiesta unban" : item.kind === "unmute" ? "Richiesta unmute" : "Appello";
    }
    if (state.tab === "candidature") return "Candidatura " + (formatWorkflowType(type) || "").trim();
    return formatWorkflowType(type) || name || "Voce";
  }

  /** Appelli/candidature: nome + snowflake ID (mai solo "—"). */
  function resolveSubjectUserValue(item, rawValue) {
    var name = cleanDiscordText(item && item.displayName ? item.displayName : "");
    var uid = String((item && item.userId) || "").trim();
    var raw = cleanDiscordText(rawValue || "")
      .replace(/[<>]/g, "")
      .replace(/\(\s*`?\d{16,20}`?\s*\)/g, " ")
      .replace(/\b\d{16,20}\b/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (
      name &&
      (/^\d{16,20}$/.test(name) ||
        isRoleSlug(name, item && item.type) ||
        looksLikeCandidaturaTitle(name) ||
        isGenericAppealLabel(name))
    ) {
      name = "";
    }
    if (
      !name &&
      raw &&
      !/^\d{16,20}$/.test(raw) &&
      !isRoleSlug(raw, item && item.type) &&
      !looksLikeCandidaturaTitle(raw) &&
      !isGenericAppealLabel(raw)
    ) {
      name = raw;
    }
    if (name && uid && name !== uid) return name + "\n" + uid;
    if (uid) return uid;
    if (name) return name;
    return "\u2014";
  }

  function resolveAppealUserValue(item, rawValue) {
    return resolveSubjectUserValue(item, rawValue);
  }

  function cleanAppealListPreview(text) {
    return cleanDiscordText(text || "", { keepCustomEmoji: true, keepNewlines: true })
      .replace(/^Utente\s*:?\s*/im, "")
      .replace(/\(\s*\d{16,20}\s*\)/g, "")
      .replace(/\b\d{16,20}\b/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function truncatePreview(text, maxLen) {
    var emojiSafe = protectDiscordEmojis(text);
    var s = cleanDiscordText(emojiSafe.text, { keepCustomEmoji: true });
    if (!s) return "";
    if (s.length <= maxLen) return restoreDiscordEmojis(s, emojiSafe.tokens);
    s = s.slice(0, Math.max(0, maxLen - 1)).trim();
    s = s.replace(/\{\{VCEMOJI\d+$/, "").replace(/\{\{VCEMOJI\d+\}$/, function (tok) {
      // keep full token only if complete
      return tok;
    });
    // Non lasciare placeholder emoji spezzati in coda.
    s = s.replace(/\{\{VCEMOJI\d*$/, "").trim();
    return restoreDiscordEmojis(s, emojiSafe.tokens) + "\u2026";
  }

  function typeBadge(item) {
    if (state.tab !== "candidature" || !item.type) return "";
    return (
      '<span class="vc-staff-inbox-type-badge">' + T.esc(formatWorkflowType(item.type)) + "</span>"
    );
  }

  function parseNumberedSections(text) {
    var raw = cleanDiscordText(text, { keepNewlines: true, keepCustomEmoji: true });
    if (!raw) return [];

    // Normalizza: "1\. " (escape Discord) e spezza anche testo appiattito su una riga.
    var normalized = raw
      .replace(/(\d{1,2})\\\./g, "$1.")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Inserisci a capo prima di ogni "N. " / "N) " che non è già a inizio riga.
    normalized = normalized.replace(/([^\n])\s+(?=(\d{1,2})[.)]\s+)/g, "$1\n");

    var chunks = normalized
      .split(/\n(?=\d{1,2}[.)]\s+)/)
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean);

    if (chunks.length <= 1 && !/^\d{1,2}[.)]\s/.test(normalized)) return [];

    var out = chunks
      .map(function (chunk) {
        var match = chunk.match(/^(\d{1,2})[.)]\s*([\s\S]+)$/);
        if (!match) return null;
        var num = match[1];
        var rest = String(match[2] || "").trim();
        if (!rest) return { name: "Domanda " + num, value: "\u2014" };

        // Prima riga = domanda, resto = risposta (formato candidature Discord).
        var nl = rest.search(/\n/);
        if (nl > 0) {
          var qLine = rest.slice(0, nl).trim();
          var aBlock = rest.slice(nl + 1).trim();
          if (qLine && aBlock) {
            return { name: num + ". " + qLine, value: aBlock };
          }
        }

        // Solo blocco monoriga: domanda con "?" + risposta sulla stessa riga.
        var withQuestion = rest.match(/^([\s\S]{1,280}?\?)\s+([\s\S]+)$/);
        if (withQuestion && String(withQuestion[2] || "").trim()) {
          return {
            name: num + ". " + withQuestion[1].trim(),
            value: withQuestion[2].trim(),
          };
        }

        var idLine = rest.match(/^(ID(?:\s+Discord)?)\s+(.+)$/i);
        if (idLine) {
          return { name: num + ". " + idLine[1], value: idLine[2].trim() || "\u2014" };
        }

        var ageLine = rest.match(/^(Et[aà])\s+(.+)$/i);
        if (ageLine) {
          return { name: num + ". " + ageLine[1], value: ageLine[2].trim() || "\u2014" };
        }

        // Fallback: intera riga come risposta se la domanda non è separabile.
        return { name: "Domanda " + num, value: rest };
      })
      .filter(Boolean);

    return out.length >= 2 ? out : out;
  }

  /** Se il testo è ancora "piatto", spezza visualmente i blocchi N. prima del render prose. */
  function breakNumberedProse(text) {
    return String(text || "")
      .replace(/(\d{1,2})\\\./g, "$1.")
      .replace(/([^\n])\s+(?=(\d{1,2})[.)]\s+)/g, "$1\n\n");
  }

  /** Appelli unban/unmute: etichette fisse (anche se il testo è stato "appiattito"). */
  function parseAppealSections(text) {
    var raw = cleanDiscordText(text, { keepNewlines: true, keepCustomEmoji: true });
    if (!raw) return [];

    var withBreaks = raw
      .replace(/\s+(Come mai sei stato (?:bannato|mutato)\s*\?)/gi, "\n$1")
      .replace(/\s+(Le tue scuse allo staff e alla community)/gi, "\n$1")
      .replace(/\s+(Informazioni aggiuntive(?:\s*\(opzionale\))?)/gi, "\n$1")
      .replace(/\r\n/g, "\n")
      .trim();

    var labels = [
      { re: /^Utente\s*:/i, title: "Utente" },
      { re: /^Come mai sei stato bannato\s*\?/i, title: "Come mai sei stato bannato?" },
      { re: /^Come mai sei stato mutato\s*\?/i, title: "Come mai sei stato mutato?" },
      { re: /^Le tue scuse allo staff e alla community/i, title: "Le tue scuse allo staff e alla community" },
      { re: /^Informazioni aggiuntive(?:\s*\(opzionale\))?/i, title: "Informazioni aggiuntive" },
    ];

    var flat = withBreaks.replace(/\n+/g, "\n").trim();
    var lines = flat.split("\n").map(function (l) {
      return l.trim();
    }).filter(Boolean);
    if (lines.length >= 2) {
      var blocks = [];
      var current = null;
      lines.forEach(function (line) {
        var matched = null;
        for (var i = 0; i < labels.length; i += 1) {
          if (labels[i].re.test(line)) {
            matched = labels[i];
            break;
          }
        }
        if (matched) {
          if (current) blocks.push(current);
          var rest = line.replace(matched.re, "").trim();
          current = { name: matched.title, value: rest };
        } else if (current) {
          current.value = (current.value ? current.value + "\n" : "") + line;
        }
      });
      if (current) blocks.push(current);
      if (blocks.length >= 2) {
        return blocks.map(function (b) {
          return { name: b.name, value: String(b.value || "").trim() || "\u2014" };
        });
      }
    }

    // Flattened fallback: slice by label positions
    var compact = withBreaks.replace(/\s+/g, " ").trim();
    var hits = [];
    labels.forEach(function (lab) {
      var m = compact.match(lab.re);
      if (!m) return;
      var idx = compact.search(lab.re);
      if (idx < 0) return;
      hits.push({ index: idx, end: idx + m[0].length, title: lab.title });
    });
    hits.sort(function (a, b) {
      return a.index - b.index;
    });
    if (hits.length < 2) return [];
    return hits.map(function (hit, i) {
      var value = compact.slice(hit.end, i + 1 < hits.length ? hits[i + 1].index : compact.length).trim();
      return { name: hit.title, value: value || "\u2014" };
    });
  }

  var RESOCONTO_ACTION_CODES = {
    vp: "Val +",
    vn: "Val -",
    nl: "Nulla",
    px: "Pex",
    dp: "Depex",
    rc: "Richiamo",
    batch: "Azioni multiple",
  };

  function resocontoProposedLabel(item) {
    if (!item) return "";
    var fromKey = resocontoActionCodeLabel(item.actionKey);
    if (fromKey) return fromKey;
    return extractResocontoAzione(item.body || item.content || item.preview || "");
  }

  function resocontoNeedsReasonForAction(item, actionKey) {
    var kind = String(item && item.kind || "").toLowerCase();
    var key = String(actionKey || item && item.actionKey || "")
      .trim()
      .toLowerCase();
    if (kind === "p") return false;
    if (key === "nl" || key === "rc" || key === "batch") return false;
    if (key === "px" || key === "dp" || key === "vp" || key === "vn") return true;
    var label = resocontoActionCodeLabel(key) || resocontoProposedLabel(item);
    if (/^nulla$/i.test(label) || /^richiamo$/i.test(label)) return false;
    if (/^pex$|^depex$|^val \+|^val -$/i.test(label)) return true;
    return false;
  }

  function resocontoReasonPlaceholder(item, actionKey) {
    var key = String(actionKey || item && item.actionKey || "")
      .trim()
      .toLowerCase();
    if (key === "px") return "Motivo del pex";
    if (key === "dp") return "Motivo del depex";
    if (key === "vp") return "Motivo valutazione positiva";
    if (key === "vn") return "Motivo valutazione negativa";
    return "Motivo";
  }

  function promptResocontoReason(actionKey, item) {
    var key = String(actionKey || "").trim().toLowerCase();
    var label = resocontoActionCodeLabel(key) || key || "Azione";
    var placeholder = resocontoReasonPlaceholder(item, key);
    var T = window.VCStaffTools;
    var runner =
      T && typeof T.prompt === "function"
        ? T.prompt.bind(T)
        : window.VcDialog && typeof window.VcDialog.prompt === "function"
          ? window.VcDialog.prompt.bind(window.VcDialog)
          : null;
    if (runner) {
      return runner({
        title: "Motivo · " + label,
        message: "Inserisci la motivazione per applicare " + label + ".",
        label: "Motivazione",
        placeholder: placeholder,
        confirmLabel: "Applica " + label,
        cancelLabel: "Annulla",
        multiline: true,
        maxLength: 500,
      }).then(function (val) {
        if (val == null) return null;
        return String(val || "").trim();
      });
    }
    var fallback = window.prompt("Motivazione per " + label + ":", "");
    if (fallback == null) return null;
    return Promise.resolve(String(fallback || "").trim());
  }

  function resocontoEffectiveActionKey(body) {
    return String((body && body.overrideActionKey) || (body && body.actionKey) || "")
      .trim()
      .toLowerCase();
  }

  function ensureResocontoReason(body, item) {
    var effectiveKey = resocontoEffectiveActionKey(body);
    if (!resocontoNeedsReasonForAction(item, effectiveKey)) {
      return Promise.resolve(body.reason || "");
    }
    return promptResocontoReason(effectiveKey, item).then(function (reason) {
      if (reason == null) return null;
      if (!String(reason || "").trim()) {
        inboxNotify("Inserisci una motivazione.", true);
        return null;
      }
      body.reason = String(reason).trim();
      return body.reason;
    });
  }

  function resocontoActionCodeLabel(actionKey) {
    var k = String(actionKey || "").trim().toLowerCase();
    return RESOCONTO_ACTION_CODES[k] || "";
  }

  function extractResocontoDecisionFromBody(text) {
    var raw = String(text || "");
    if (/azione negata da/i.test(raw)) return "Azione negata";
    var m = raw.match(/azione confermata da[\s\S]*?:([\s\S]*?)(?:\n\n|$)/i);
    var outcome = m ? String(m[1] || "").trim().toLowerCase() : "";
    if (/pex applicato/.test(outcome)) return "Pex";
    if (/depex pm applicato|depex applicato/.test(outcome)) return "Depex";
    if (/valutazione positiva/.test(outcome)) return "Val +";
    if (/valutazione negativa/.test(outcome)) return "Val −";
    if (/richiamo/.test(outcome)) return "Richiamo";
    if (/nessuna azione/.test(outcome)) return "Nulla";
    if (/valutazioni gi[aà] registrate|azioni multiple/.test(outcome)) return "Azioni multiple";
    return "";
  }

  function extractResocontoAzione(text) {
    var raw = String(text || "");
    var m =
      raw.match(/\*\*Azione:\*\*\s*__([\s\S]*?)__/i) ||
      raw.match(/Azione:\s*__([^_\n]+)__/i) ||
      raw.match(/\*\*Azione:\*\*\s*([^\n]+)/i) ||
      raw.match(/Azione:\s*([^\n]+)/i);
    if (!m) return "";
    return cleanDiscordText(m[1] || "", { keepCustomEmoji: true });
  }

  /**
   * Anteprima lista resoconti: stats (Messaggi/Ore/Partner), non solo Azione.
   * I PM sono corti → "Azione:" c'è sempre nel preview e nascondeva Partner.
   * Gli staff lunghi spesso tagliano prima di Azione → già si vedevano le stats.
   */
  /** Estrae emoji Discord in testa a una stringa. */
  function splitLeadingDiscordEmojis(text) {
    var s = String(text || "");
    var m = s.match(/^(?:<a?:[\w~-]+:\d+>\s*)+/);
    if (!m) return { emojis: "", rest: s.trim() };
    return { emojis: m[0].replace(/\s+/g, " ").trim(), rest: s.slice(m[0].length).trim() };
  }

  /**
   * Resoconti: emoji affianco al valore (come in lista), non a capo sotto.
   * Su campi multilinea (Costanza) restano nel titolo.
   */
  function placeResocontoFieldEmojis(field) {
    if (!field) return field;
    var split = splitLeadingDiscordEmojis(field.name || "");
    var value = String(field.value || "")
      .replace(/\n+(?=<a?:[\w~-]+:\d+>)/g, " ")
      .replace(/(<a?:[\w~-]+:\d+>)\n+/g, "$1 ")
      .trim();
    var valueLead = splitLeadingDiscordEmojis(value);
    if (valueLead.emojis) {
      value = (valueLead.rest + " " + valueLead.emojis).replace(/\s+/g, " ").trim();
    }
    if (!split.emojis) {
      return { name: String(field.name || "").trim(), value: value || "\u2014" };
    }
    if (/\n/.test(value)) {
      return {
        name: (split.emojis + " " + split.rest).replace(/\s+/g, " ").trim(),
        value: value || "\u2014",
      };
    }
    return {
      name: split.rest || String(field.name || "").trim(),
      value: ((value || "") + " " + split.emojis).replace(/\s+/g, " ").trim() || "\u2014",
    };
  }

  function extractResocontoListPreview(text) {
    var sections = parseResocontoSections(text);
    if (!sections.length) return "";
    var stats = [];
    var azioneLine = "";
    sections.forEach(function (s) {
      var placed = placeResocontoFieldEmojis(s);
      var name = cleanDiscordText(placed.name || "", { keepCustomEmoji: true });
      var value = cleanDiscordText(placed.value || "", { keepCustomEmoji: true });
      if (!name && !value) return;
      var key = name
        .replace(/\{\{VCEMOJI\d+\}\}/g, "")
        .replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, "")
        .replace(/:[a-zA-Z0-9_]+:/g, "")
        .trim()
        .toLowerCase();
      if (/^azione$/.test(key)) {
        azioneLine = name + ": " + value;
        return;
      }
      if (
        /messaggi in una settimana|ore in una settimana|sanzioni|scambio limiti|^partner$/.test(key)
      ) {
        stats.push(name + ": " + value);
      }
    });
    if (stats.length) return stats.join(" · ");
    return azioneLine || "";
  }

  /** Resoconti staff/PM: righe etichettate Discord (Staffer, Ruolo, Azione, …). */
  function normalizeResocontoBody(text) {
    var s = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u2028|\u2029/g, "\n")
      .trim();
    if (!s) return "";
    // Testo appiattito su una riga → spezza prima di ogni label nota.
    var labels = [
      "Staffer",
      "Partner Manager",
      "Ruolo",
      "Partner",
      "Messaggi in una settimana",
      "Ore in una settimana",
      "Sanzioni in una settimana",
      "Sanzioni",
      "Costanza",
      "Azione",
      "Scambio limiti",
    ];
    labels.forEach(function (label) {
      var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var re = new RegExp(
        "\\s+(?=(?:(?:<a?:[\\w~-]+:\\d+>|:[\\w~-]+:)\\s*)*" + escaped + "\\s*:)",
        "gi",
      );
      s = s.replace(re, "\n");
    });
    s = s.replace(/\s+(?=giorni attivi\b)/gi, "\n");
    return s.trim();
  }

  function resocontoFieldLabelKey(name) {
    return cleanDiscordText(name || "", { keepCustomEmoji: true })
      .replace(/<a?:[\w~-]+:\d+>/g, "")
      .replace(/:[a-zA-Z0-9_]+:/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /** Campi ridondanti: già nel titolo / meta (Staffer, Ruolo, Partner Manager). */
  function isResocontoIdentityField(name) {
    var key = resocontoFieldLabelKey(name);
    return key === "staffer" || key === "ruolo" || key === "partner manager";
  }

  function filterResocontoDetailFields(fields) {
    if (!Array.isArray(fields)) return [];
    return fields.filter(function (field) {
      if (!field) return false;
      if (isResocontoIdentityField(field.name)) return false;
      var value = cleanDiscordText(field.value || "", { keepCustomEmoji: true, keepNewlines: true });
      // Scarta solo placeholder vuoti.
      if (!value || value === "\u2014" || value === "-" || value === "—") {
        var key = resocontoFieldLabelKey(field.name);
        if (/^(esito revisione)$/i.test(key)) return true;
        return Boolean(cleanDiscordText(field.name || ""));
      }
      return true;
    });
  }

  function parseResocontoSections(text) {
    var raw = normalizeResocontoBody(text);
    if (!raw) return [];
    if (!/(Staffer|Partner Manager|Ruolo|Messaggi in una settimana|Azione:|Partner:)/i.test(raw)) return [];

    var lines = raw.split("\n");
    var blocks = [];
    var current = null;
    var inCode = false;
    var codeLines = [];

    function flush() {
      if (!current) return;
      if (codeLines.length) {
        current.value = (current.value ? current.value + "\n" : "") + codeLines.join("\n");
        codeLines = [];
      }
      var val = String(current.value || "").trim();
      if (current.name || val) {
        blocks.push({ name: current.name || "Dettaglio", value: val || "\u2014" });
      }
      current = null;
    }

    function parseResocontoLabelLine(line) {
      var emojiSafe = protectDiscordEmojis(line);
      var cleaned = cleanDiscordText(emojiSafe.text, { keepCustomEmoji: true, keepNewlines: false });
      if (!cleaned) return null;

      if (/azione confermata da/i.test(cleaned)) {
        return {
          name: "Esito revisione",
          value: restoreDiscordEmojis(
            cleaned.replace(/^[\s\S]*?azione confermata da\s*/i, "Confermata da ").trim(),
            emojiSafe.tokens,
          ),
        };
      }
      if (/azione negata da/i.test(cleaned)) {
        return {
          name: "Esito revisione",
          value: restoreDiscordEmojis(
            cleaned.replace(/^[\s\S]*?azione negata da\s*/i, "Negata da ").trim(),
            emojiSafe.tokens,
          ),
        };
      }

      // Preferisci l'ultimo "Label:" dopo eventuali emoji protette.
      var colon = cleaned.match(/^(.*):\s*(.*)$/);
      if (!colon) return null;
      var label = String(colon[1] || "").trim();
      var value = String(colon[2] || "").trim();
      // Evita label troppo lunghe / non-etichetta (corpo libero).
      if (!label || label.length > 96) return null;
      if (/[{}]{2}VCEMOJI\d+[{}]{2}\s*$/.test(label) && !/\S/.test(label.replace(/\{\{VCEMOJI\d+\}\}/g, ""))) {
        // Solo emoji senza testo label → non è una riga etichetta.
        return null;
      }
      return {
        name: restoreDiscordEmojis(label, emojiSafe.tokens),
        value: restoreDiscordEmojis(value, emojiSafe.tokens),
      };
    }

    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (trimmed === "```") {
        inCode = !inCode;
        return;
      }
      if (inCode) {
        codeLines.push(line);
        return;
      }
      if (!trimmed) return;

      if (/^messaggi per giorno$/i.test(cleanDiscordText(trimmed))) {
        if (current) current.value = (current.value ? current.value + "\n" : "") + "messaggi per giorno";
        return;
      }

      var hit = parseResocontoLabelLine(line);
      if (hit) {
        flush();
        current = { name: hit.name, value: hit.value };
        return;
      }

      if (/\u2192/.test(trimmed) && /messaggi|ore/i.test(trimmed)) {
        flush();
        current = { name: "Scambio limiti", value: cleanDiscordText(trimmed, { keepCustomEmoji: true }) };
        flush();
        return;
      }

      if (current) {
        current.value = (current.value ? current.value + "\n" : "") + trimmed;
      }
    });
    flush();

    return blocks.filter(function (b) {
      return cleanDiscordText(b.name || "") || cleanDiscordText(b.value || "", { keepCustomEmoji: true });
    });
  }

  function fieldsLookUseful(fields) {
    if (!Array.isArray(fields) || !fields.length) return false;
    if (fields.length === 1) {
      var only = fields[0] || {};
      var name = cleanDiscordText(only.name || "");
      var value = cleanDiscordText(only.value || "");
      if (!value || value === "\u2014" || value === "-") return false;
      if (/^\d+\.\s/.test(name) && /\d+\.\s/.test(name.slice(3))) return false;
    }
    return fields.some(function (f) {
      return cleanDiscordText((f && f.name) || "") || cleanDiscordText((f && f.value) || "");
    });
  }

  function cardMeta(item, opts) {
    var roleOnly = Boolean(opts && opts.roleOnly);
    var meta = [];
    if (item.start && item.end) meta.push(item.start + " \u2192 " + item.end);
    if (item.ruoloRichiesto) meta.push(item.ruoloRichiesto);
    if (item.kind && state.tab === "appelli") meta.push(item.kind === "unban" ? "Unban" : "Unmute");
    if ((state.tab === "appelli" || state.tab === "candidature") && item.userId && !roleOnly) {
      meta.push(String(item.userId));
    }
    if (state.tab === "resoconti") {
      if (item.kind === "p") meta.push("Partner Manager");
      else if (item.kind === "s") meta.push("Staff");
      if (!roleOnly) {
        if (item.weekLabel) meta.push(item.weekLabel);
        var shortAction = resocontoCardAction(item);
        if (shortAction) meta.push(shortAction);
      }
      return meta.join(" \u00B7 ") || "";
    }
    if (!roleOnly && item.createdAt) meta.push(formatDate(item.createdAt));
    return meta.join(" \u00B7 ") || "";
  }

  function actionButtons(item, tab) {
    if (!item.canAct) return "";
    if (tab === "pause") {
      return (
        '<div class="vc-staff-inbox-actions">' +
        '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--ok" data-act="accept" data-user-id="' +
        T.esc(item.userId) +
        '" data-id="' +
        T.esc(item.id) +
        '">Accetta</button>' +
        '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--no" data-act="reject" data-user-id="' +
        T.esc(item.userId) +
        '" data-id="' +
        T.esc(item.id) +
        '">Rifiuta</button></div>'
      );
    }
    if (tab === "candidature") {
      return (
        '<div class="vc-staff-inbox-actions">' +
        '<label class="vc-staff-inbox-reason"><span>Motivo accettazione</span><input type="text" data-reason-for="' +
        T.esc(item.messageId) +
        '" placeholder="Motivo accettazione\u2026" /></label>' +
        '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--ok" data-act="accept" data-message-id="' +
        T.esc(item.messageId) +
        '" data-type="' +
        T.esc(item.type) +
        '" data-user-id="' +
        T.esc(item.userId) +
        '">Accetta</button>' +
        '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--no" data-act="reject" data-message-id="' +
        T.esc(item.messageId) +
        '" data-type="' +
        T.esc(item.type) +
        '" data-user-id="' +
        T.esc(item.userId) +
        '">Rifiuta</button></div>'
      );
    }
    if (tab === "appelli") {
      return (
        '<div class="vc-staff-inbox-actions">' +
        '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--ok" data-act="accept" data-message-id="' +
        T.esc(item.messageId) +
        '" data-kind="' +
        T.esc(item.kind) +
        '" data-user-id="' +
        T.esc(item.userId) +
        '">Accetta</button>' +
        '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--no" data-act="reject" data-message-id="' +
        T.esc(item.messageId) +
        '" data-kind="' +
        T.esc(item.kind) +
        '" data-user-id="' +
        T.esc(item.userId) +
        '">Rifiuta</button></div>'
      );
    }
    if (tab === "resoconti") {
      var mid = T.esc(item.messageId || "");
      var uid = T.esc(item.userId || "");
      var kind = T.esc(item.kind || "");
      var roleId = T.esc(item.roleId || "");
      var actionKey = T.esc(item.actionKey || "");
      var channelId = T.esc(item.channelId || "");
      var proposed = resocontoProposedLabel(item) || (String(item.kind || "") === "p" ? "Nulla" : "Piano automatico");
      var applyLabel = proposed === "Piano automatico" ? "Conferma piano" : "Conferma: " + proposed;
      var altsRaw =
        String(item.kind || "") === "p"
          ? [
              { key: "dp", label: "Depex" },
              { key: "rc", label: "Richiamo" },
              { key: "nl", label: "Nulla" },
            ]
          : [
              { key: "px", label: "Pex" },
              { key: "dp", label: "Depex" },
              { key: "vp", label: "Val +" },
              { key: "vn", label: "Val -" },
              { key: "nl", label: "Nulla" },
            ];
      var alts = altsRaw.filter(function (alt) {
        if (alt.key === "nl" && /^nulla$/i.test(proposed)) return false;
        if (String(alt.key || "") === String(item.actionKey || "").trim().toLowerCase()) return false;
        if (alt.label === proposed) return false;
        return true;
      });
      return (
        '<div class="vc-staff-inbox-actions vc-staff-inbox-actions--resoconti">' +
        '<p class="vc-staff-inbox-actions__hint">' +
        T.esc("Conferma la proposta del resoconto oppure scegli un\u2019altra azione.") +
        "</p>" +
        '<div class="vc-staff-inbox-actions__primary vc-staff-inbox-actions__primary--solo">' +
        '<div class="vc-staff-inbox-actions__decide">' +
        '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--ok vc-staff-inbox-btn--confirm" data-act="accept" data-message-id="' +
        mid +
        '" data-user-id="' +
        uid +
        '" data-kind="' +
        kind +
        '" data-role-id="' +
        roleId +
        '" data-action-key="' +
        actionKey +
        '" data-channel-id="' +
        channelId +
        '">' +
        T.esc(applyLabel) +
        "</button>" +
        "</div></div>" +
        (alts.length
          ? '<div class="vc-staff-inbox-alt" aria-label="Azione alternativa">' +
            '<span class="vc-staff-inbox-alt__label">Altra azione</span>' +
            '<div class="vc-staff-inbox-alt__pills">' +
            alts
              .map(function (alt) {
                return (
                  '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--alt" data-act="accept" data-override-key="' +
                  T.esc(alt.key) +
                  '" data-message-id="' +
                  mid +
                  '" data-user-id="' +
                  uid +
                  '" data-kind="' +
                  kind +
                  '" data-role-id="' +
                  roleId +
                  '" data-action-key="' +
                  actionKey +
                  '" data-channel-id="' +
                  channelId +
                  '">' +
                  T.esc(alt.label) +
                  "</button>"
                );
              })
              .join("") +
            "</div></div>"
          : "") +
        "</div>"
      );
    }
    return "";
  }

  function buildResocontoActionBody(btn, item, root) {
    var body = { queue: state.tab, action: btn.getAttribute("data-act") || "accept" };
    body.messageId = btn.getAttribute("data-message-id") || (item && item.messageId) || "";
    body.userId = btn.getAttribute("data-user-id") || (item && item.userId) || "";
    body.kind = btn.getAttribute("data-kind") || (item && item.kind) || "";
    body.roleId = btn.getAttribute("data-role-id") || (item && item.roleId) || "";
    body.actionKey = btn.getAttribute("data-action-key") || (item && item.actionKey) || "";
    body.channelId = btn.getAttribute("data-channel-id") || (item && item.channelId) || "";
    var override = btn.getAttribute("data-override-key") || "";
    if (override) body.overrideActionKey = override;
    body.reason = "";
    return body;
  }

  function runResocontoAction(btn, itemOverride) {
    if (state.busy) return;
    var item =
      itemOverride ||
      state.detail ||
      state.items.find(function (it) {
        return itemKey(it) === state.selectedKey;
      }) ||
      null;
    var body = buildResocontoActionBody(btn, item, null);
    ensureResocontoReason(body, item).then(function (reasonOk) {
      if (reasonOk == null) return;
      postAction(body);
    });
  }

  function bindActionButtons(root, itemOverride) {
    if (!root) return;
    root.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (state.busy) return;
        var act = btn.getAttribute("data-act");
        if (state.tab === "resoconti") {
          runResocontoAction(btn, itemOverride);
          return;
        }
        var item = itemOverride || null;
        var body = { queue: state.tab, action: act };
        if (state.tab === "pause") {
          body.userId = btn.getAttribute("data-user-id") || (item && item.userId);
          body.pauseId = btn.getAttribute("data-id") || (item && item.id);
        } else {
          body.messageId = btn.getAttribute("data-message-id") || (item && item.messageId);
          body.userId = btn.getAttribute("data-user-id") || (item && item.userId);
          if (state.tab === "candidature") {
            body.type = btn.getAttribute("data-type") || (item && item.type);
            if (act === "accept") {
              var inp = root.querySelector(
                '[data-reason-for="' + (body.messageId || "") + '"]',
              );
              body.reason = inp ? String(inp.value || "").trim() : "";
            }
          }
          if (state.tab === "appelli") body.kind = btn.getAttribute("data-kind") || (item && item.kind);
        }
        postAction(body);
      });
    });
  }

  function notifyBadgeClass(item) {
    var key = String((item && item.status) || "pending").toLowerCase();
    if (key === "accepted") return "is-ok";
    if (key === "rejected") return "is-no";
    if (key === "pending") return "is-pending";
    return "";
  }

  function renderList() {
    var root = T.byId("vc-staff-inbox-list");
    if (!root) return;
    if (!state.items.length) {
      if (listEmptyDespitePending()) {
        if (inboxLoadBusy()) {
          root.hidden = false;
          root.classList.add("is-loading");
          root.classList.remove("is-refreshing");
          root.innerHTML = inboxLoadingSkeletonHtml();
          schedulePendingListRetry();
          return;
        }
        // Load terminato ma badge pending: niente skeleton infinito su mobile.
        schedulePendingListRetry();
        if (pendingListRetryCount >= PENDING_LIST_RETRY_MAX) {
          markTabConfirmedEmpty(state.tab);
        } else {
          root.hidden = false;
          root.classList.remove("is-loading", "is-refreshing");
          root.innerHTML = inboxEmptyBoxHtml(
            "Lista in aggiornamento. " +
              '<button type="button" class="vc-staff-inbox-reload-btn" id="vc-staff-inbox-reload-pending">Ricarica</button>',
            "fa-refresh",
          );
          var reloadBtn = T.byId("vc-staff-inbox-reload-pending");
          if (reloadBtn) {
            reloadBtn.addEventListener("click", function () {
              pendingListRetryCount = 0;
              delete emptyLoadedTabs[state.tab];
              loadQueue({ soft: false, sync: true, _userIntent: true }).catch(function () {});
            });
          }
          return;
        }
      }
      root.hidden = false;
      root.classList.remove("is-loading", "is-refreshing");
      root.innerHTML = inboxEmptyBoxHtml(T.esc(inboxEmptyMessage()), "fa-inbox");
      if (state.detail || state.selectedKey || state.detailLoading) clearDetailState();
      return;
    }
    var embed = isInboxEmbed();
    root.innerHTML =
      '<ul class="vc-staff-inbox-items' +
      (embed ? " space-y-3" : "") +
      '">' +
      state.items
        .map(function (item) {
          var title = itemTitle(item);
          var previewSource =
            state.tab === "resoconti"
              ? extractResocontoListPreview(item.body || item.content || item.preview || "") ||
                item.preview ||
                ""
              : state.tab === "appelli"
                ? cleanAppealListPreview(item.preview || item.body || "")
                : item.motivazione || item.preview || "";
          var preview = truncatePreview(previewSource, state.tab === "resoconti" ? 180 : 130);
          var key = itemKey(item);
          var selected = state.selectedKey && state.selectedKey === key;
          var meta = cardMeta(item);
          if (embed) {
            var typeBit = typeBadge(item);
            return (
              '<li class="vc-notify-row vc-notify-row--link vc-staff-inbox-item' +
              (selected ? " is-selected" : "") +
              '" data-item-key="' +
              T.esc(key) +
              '" tabindex="0" role="button">' +
              '<span class="vc-notify-row-icon">' +
              T.avatarImgHtml(item.avatarUrl, item.userId, { width: 44, height: 44 }) +
              "</span>" +
              '<div class="vc-notify-row-main">' +
              '<p class="vc-notify-row-title">' +
              T.esc(title) +
              (typeBit ? " " + typeBit : "") +
              "</p>" +
              (preview
                ? '<p class="vc-notify-row-desc">' + formatDiscordHtml(preview) + "</p>"
                : "") +
              (meta ? '<p class="vc-notify-row-meta">' + T.esc(meta) + "</p>" : "") +
              "</div>" +
              '<span class="vc-notify-row-badge ' +
              notifyBadgeClass(item) +
              '">' +
              T.esc(statusLabel(item)) +
              "</span></li>"
            );
          }
          return (
            '<li class="vc-staff-inbox-item vc-staff-inbox-item--card' +
            (selected ? " is-selected" : "") +
            '" data-item-key="' +
            T.esc(key) +
            '" tabindex="0" role="button">' +
            '<span class="vc-staff-avatar-wrap">' +
            T.avatarImgHtml(item.avatarUrl, item.userId, { width: 44, height: 44 }) +
            "</span>" +
            '<div class="vc-staff-inbox-item__body">' +
            '<div class="vc-staff-inbox-item__head">' +
            '<div class="vc-staff-inbox-item__titles">' +
            typeBadge(item) +
            '<h3 class="vc-staff-inbox-item__title">' +
            T.esc(title) +
            "</h3></div>" +
            '<span class="vc-staff-inbox-status ' +
            statusClass(item) +
            '">' +
            T.esc(statusLabel(item)) +
            "</span></div>" +
            (meta ? '<p class="vc-staff-inbox-item__meta">' + T.esc(meta) + "</p>" : "") +
            (preview
              ? '<p class="vc-staff-inbox-item__preview">' +
                formatDiscordHtml(preview) +
                "</p>"
              : "") +
            "</div></li>"
          );
        })
        .join("") +
      "</ul>";

    root.querySelectorAll(".vc-staff-inbox-item").forEach(function (card) {
      function openCard() {
        var key = card.getAttribute("data-item-key");
        var item = state.items.find(function (it) {
          return itemKey(it) === key;
        });
        if (!item) return;
        // Secondo click sulla stessa card: chiudi il pannello dettaglio.
        if (state.selectedKey && state.selectedKey === key && (state.detail || state.detailLoading)) {
          closeDetail();
          return;
        }
        openDetail(item);
      }
      card.addEventListener("click", openCard);
      card.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          openCard();
        }
      });
    });
  }

  function clearDetailState() {
    detailSeq += 1;
    teardownChat();
    state.detail = null;
    state.detailLoading = false;
    state.detailError = "";
    state.selectedKey = "";
    renderDetail();
  }

  function closeDetail() {
    clearDetailState();
    repairInboxAfterBack();
    renderList();
  }

  function repairInboxAfterBack() {
    var layout = T.byId("vc-staff-inbox");
    if (layout) {
      layout.classList.remove("has-detail");
      layout.hidden = false;
    }
    var listPanel = layout && layout.querySelector ? layout.querySelector(".vc-staff-inbox-list-panel") : null;
    if (listPanel) {
      listPanel.hidden = false;
      listPanel.removeAttribute("hidden");
    }
    var list = T.byId("vc-staff-inbox-list");
    if (list) {
      list.hidden = false;
      list.removeAttribute("hidden");
      clearInboxLoading();
    }
    try {
      window.scrollTo(0, 0);
    } catch (eScroll) {}
    if (
      listEmptyDespitePending() &&
      isStaffScopeActive() &&
      !inboxLoadBusy() &&
      !initialLoadPromise
    ) {
      loadQueue({ soft: Boolean(state.items.length), _internal: true, sync: true }).catch(function () {});
    }
  }

  /** Ripara campi spezzati su `:` interno emoji: name=`<:Foo` value=`123> resto`. */
  function repairBrokenEmojiField(field) {
    if (!field) return field;
    var name = String(field.name || "");
    var value = String(field.value || "");
    var left = name.match(/^(.*)<(a?):([\w~-]+)$/);
    var right = value.match(/^(\d{16,22})>([\s\S]*)$/);
    if (!left || !right) return field;
    var emoji = "<" + left[2] + ":" + left[3] + ":" + right[1] + ">";
    var rest = String(right[2] || "").replace(/^\s*/, "");
    // Se dopo l'emoji c'è ancora "Label: valore", riparti da lì.
    var relabel = rest.match(/^(.{1,96}?):\s*([\s\S]*)$/);
    if (relabel) {
      return {
        name: (left[1] + emoji + " " + relabel[1]).replace(/\s+/g, " ").trim(),
        value: String(relabel[2] || "").trim() || "\u2014",
      };
    }
    return {
      name: (left[1] + emoji).trim(),
      value: rest || "\u2014",
    };
  }

  function renderDetailFields(item) {
    var fields = Array.isArray(item.fields) ? item.fields : [];
    var sourceBody = item.body || item.content || item.preview || "";
    if (state.tab === "appelli") {
      var appealParsed = parseAppealSections(sourceBody);
      if (appealParsed.length) fields = appealParsed;
      else if (!fieldsLookUseful(fields)) fields = parseNumberedSections(sourceBody);
      fields = (fields || []).map(function (field) {
        if (!field) return field;
        var fname = String(field.name || "").trim();
        if (/utente/i.test(fname)) {
          return { name: "Utente", value: resolveSubjectUserValue(item, field.value) };
        }
        // Rimuovi ID snowflake orfani lasciati dallo strip menzioni in tutto il corpo appeal.
        var cleanedVal = String(field.value || "")
          .replace(/\(\s*`?\d{16,20}`?\s*\)/g, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        return { name: field.name, value: cleanedVal || field.value };
      });
      var hasUtente = (fields || []).some(function (f) {
        return f && /utente/i.test(String(f.name || ""));
      });
      if (!hasUtente) {
        fields = [{ name: "Utente", value: resolveSubjectUserValue(item, "") }].concat(fields || []);
      }
    } else if (state.tab === "candidature") {
      if (!fieldsLookUseful(fields)) {
        var parsed = parseNumberedSections(sourceBody);
        if (parsed.length) fields = parsed;
      }
      var hasCandUser = (fields || []).some(function (f) {
        return f && /^(utente|user(\s*id)?)$/i.test(String(f.name || "").trim());
      });
      if (!hasCandUser) {
        fields = [{ name: "Utente", value: resolveSubjectUserValue(item, "") }].concat(fields || []);
      } else {
        fields = (fields || []).map(function (field) {
          if (!field) return field;
          if (/^(utente|user(\s*id)?)$/i.test(String(field.name || "").trim())) {
            return { name: "Utente", value: resolveSubjectUserValue(item, field.value) };
          }
          return field;
        });
      }
    } else if (state.tab === "resoconti") {
      var resocontoParsed = parseResocontoSections(sourceBody);
      if (resocontoParsed.length) fields = resocontoParsed;
      fields = filterResocontoDetailFields(fields);
    } else if (!fieldsLookUseful(fields) && sourceBody) {
      fields = parseNumberedSections(sourceBody);
    }
    if (!fieldsLookUseful(fields)) {
      var fallbackBody = breakNumberedProse(item.body || item.content || item.preview || sourceBody || "");
      if (!cleanDiscordText(fallbackBody, { keepNewlines: true, keepCustomEmoji: true })) return "";
      return (
        '<div class="vc-staff-inbox-detail__body vc-staff-inbox-detail__prose">' +
        formatDiscordHtml(fallbackBody, { keepNewlines: true }) +
        "</div>"
      );
    }
    return (
      '<div class="vc-staff-inbox-detail__fields">' +
      fields
        .map(function (field) {
          field = repairBrokenEmojiField(field);
          if (state.tab === "resoconti") field = placeResocontoFieldEmojis(field);
          var q = field.name || "";
          var a = field.value || "";
          var keepNl = /\n/.test(a);
          return (
            '<div class="vc-staff-inbox-detail__field vc-staff-inbox-detail__qa"><h4>' +
            formatDiscordHtml(q || "Domanda") +
            '</h4><div class="vc-staff-inbox-detail__answer">' +
            formatDiscordHtml(a || "\u2014", { keepNewlines: keepNl }) +
            "</div></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderDecisionMeta(item) {
    if (!item || item.status === "pending" || item.canAct) return "";
    var by = item.decidedByName || item.decidedBy;
    if (!by) return "";
    var status = String(item.status || "").toLowerCase();
    var heading =
      status === "rejected"
        ? "Rifiutata da"
        : status === "accepted"
          ? "Accettata da"
          : status === "cancelled"
            ? "Annullata da"
            : "Gestita da";
    var when = item.decidedAt ? formatDate(item.decidedAt) : "";
    return (
      '<div class="vc-staff-inbox-detail__field vc-staff-inbox-detail__qa vc-staff-inbox-detail__field--decision"><h4>' +
      T.esc(heading) +
      "</h4><p>" +
      T.esc(by) +
      (when ? " · " + T.esc(when) : "") +
      "</p></div>"
    );
  }

  function renderTimingMeta(item) {
    if (!item || !item.timing) return "";
    return (
      '<div class="vc-staff-inbox-detail__field vc-staff-inbox-detail__qa"><h4>Tempistiche</h4><p>' +
      formatDiscordHtml(item.timing) +
      "</p></div>"
    );
  }

  function renderDetail() {
    var panel = T.byId("vc-staff-inbox-detail");
    var layout = T.byId("vc-staff-inbox");
    if (!panel) return;
    if (layout) {
      layout.classList.toggle("has-detail", Boolean(state.detail || state.detailLoading));
    }
    if (!state.detail && !state.detailLoading) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    panel.hidden = false;
    if (state.detailLoading) {
      panel.innerHTML = '<div class="vc-staff-inbox-detail__loading">Caricamento dettaglio\u2026</div>';
      return;
    }
    var item = state.detail;
    if (!item) return;
    var title = itemTitle(item);
    var detailErrorHtml = state.detailError
      ? '<div class="vc-staff-inbox-detail__error" role="alert">' + T.esc(state.detailError) + "</div>"
      : "";
    panel.innerHTML =
      '<div class="vc-staff-inbox-detail__inner">' +
      '<div class="vc-staff-inbox-detail__top">' +
      '<button type="button" class="vc-staff-inbox-detail__back" id="vc-staff-inbox-detail-back">\u2190 Lista</button>' +
      '<span class="vc-staff-inbox-status ' +
      statusClass(item) +
      '">' +
      T.esc(statusLabel(item)) +
      "</span></div>" +
      detailErrorHtml +
      '<div class="vc-staff-inbox-detail__hero">' +
      '<span class="vc-staff-avatar-wrap vc-staff-avatar-wrap--lg">' +
      T.avatarImgHtml(item.avatarUrl, item.userId, { width: 56, height: 56 }) +
      "</span>" +
      "<div>" +
      typeBadge(item) +
      "<h2>" +
      T.esc(title) +
      "</h2><p class=\"vc-staff-inbox-item__meta\">" +
      T.esc(cardMeta(item, { roleOnly: state.tab === "resoconti" })) +
      "</p></div></div>" +
      renderDetailFields(item) +
      (item.motivazione && !item.body
        ? '<div class="vc-staff-inbox-detail__field vc-staff-inbox-detail__qa"><h4>Motivazione</h4><p>' +
          formatDiscordHtml(item.motivazione) +
          "</p></div>"
        : "") +
      renderTimingMeta(item) +
      renderDecisionMeta(item) +
      renderChatPanel(item) +
      actionButtons(item, state.tab) +
      "</div>";

    var back = T.byId("vc-staff-inbox-detail-back");
    if (back) {
      back.addEventListener("click", function () {
        closeDetail();
      });
    }
    bindActionButtons(panel, item);
    bootChatForDetail(item);
  }

  function openDetail(listItem) {
    var seq = (detailSeq += 1);
    var key = itemKey(listItem);
    var hasLocalBody = Boolean(
      (listItem && (listItem.body || listItem.content || listItem.motivazione || listItem.preview)) ||
        (listItem && Array.isArray(listItem.fields) && listItem.fields.length),
    );
    // Mostra subito i dati già in lista: niente schermo nero "Caricamento…".
    state.detailLoading = !hasLocalBody;
    state.detailError = "";
    state.detail = listItem;
    state.selectedKey = key;
    renderList();
    renderDetail();
    var detailId =
      state.tab === "pause"
        ? listItem.id
        : listItem.messageId || listItem.recordId || listItem.id;
    var url =
      apiBase() +
      (apiBase().indexOf("?") >= 0 ? "&" : "?") +
      "queue=" +
      encodeURIComponent(state.tab) +
      "&itemId=" +
      encodeURIComponent(detailId || "");
    if (state.tab === "pause") {
      url += "&userId=" + encodeURIComponent(listItem.userId || "");
    }
    T.fetchJson(url, { timeoutMs: T.resolveFetchTimeoutMs ? T.resolveFetchTimeoutMs(25000) : 25000 })
      .then(function (out) {
        if (seq !== detailSeq || state.selectedKey !== key) return;
        state.detailLoading = false;
        if (!out.res.ok || !out.data || !out.data.ok || !out.data.item) {
          // Se avevamo già dati locali, tieni il dettaglio e mostra solo un warning soft.
          if (hasLocalBody) {
            state.detailError = "";
            state.detail = listItem;
            renderDetail();
            return;
          }
          state.detailError =
            (out.data && out.data.message) || "Impossibile caricare il dettaglio.";
          state.detail = listItem;
          T.hideStaffToast();
          renderDetail();
          return;
        }
        state.detailError = "";
        state.detail = Object.assign({}, listItem, out.data.item, {
          dedupeKey: out.data.item.dedupeKey || listItem.dedupeKey || "",
          messageId: out.data.item.messageId || listItem.messageId || "",
          channelId: out.data.item.channelId || listItem.channelId || "",
        });
        // Propaga avatar/nome dal dettaglio alla card lista (stesso utente).
        var detailItem = out.data.item;
        var listIdx = state.items.findIndex(function (it) {
          return itemKey(it) === key;
        });
        if (listIdx >= 0 && detailItem) {
          var prev = state.items[listIdx] || {};
          state.items[listIdx] = Object.assign({}, prev, {
            avatarUrl: detailItem.avatarUrl || prev.avatarUrl || "",
            displayName: detailItem.displayName || prev.displayName || "",
            status: detailItem.status || prev.status,
            statusLabel: detailItem.statusLabel || prev.statusLabel,
            canAct: detailItem.canAct != null ? detailItem.canAct : prev.canAct,
            body: detailItem.body || prev.body || "",
            content: detailItem.content || prev.content || "",
            fields: Array.isArray(detailItem.fields) && detailItem.fields.length ? detailItem.fields : prev.fields,
            ruoloRichiesto: detailItem.ruoloRichiesto || prev.ruoloRichiesto || "",
            timing: detailItem.timing || prev.timing || null,
            decidedBy: detailItem.decidedBy || prev.decidedBy || null,
            decidedByName: detailItem.decidedByName || prev.decidedByName || null,
            decidedAt: detailItem.decidedAt || prev.decidedAt || null,
          });
          renderList();
        }
        renderDetail();
      })
      .catch(function () {
        if (seq !== detailSeq || state.selectedKey !== key) return;
        state.detailLoading = false;
        state.detail = listItem;
        if (!hasLocalBody) {
          state.detailError = "Errore di rete sul dettaglio.";
          T.hideStaffToast();
        }
        renderDetail();
      });
  }

  function postAction(body) {
    state.busy = true;
    T.showStaffToast("Elaborazione\u2026", false, { pending: true });
    T.fetchJson(apiBase(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (out) {
        state.busy = false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          if (isStaleWorkflowAction(out)) {
            applyActionResult(out, body);
            return;
          }
          if (out.data && out.data.needsReason && state.tab === "resoconti") {
            T.hideStaffToast();
            var retryItem =
              state.detail ||
              state.items.find(function (it) {
                return String(it.messageId || "") === String(body.messageId || "");
              }) ||
              null;
            ensureResocontoReason(body, retryItem).then(function (reasonOk) {
              if (reasonOk == null) return;
              postAction(body);
            });
            return;
          }
          T.hideStaffToast();
          inboxNotify((out.data && out.data.message) || "Operazione non riuscita.", true);
          return;
        }
        applyActionResult(out, body);
      })
      .catch(function () {
        state.busy = false;
        inboxNotify("Errore di rete.", true);
      });
  }

  function seedPermissionsFromGate() {
    if (state.permissions) return;
    var g = window.__VC_STAFF_PERMS && typeof window.__VC_STAFF_PERMS === "object" ? window.__VC_STAFF_PERMS : null;
    if (!g || !g.ok) return;
    state.permissions = {
      isHighStaff: Boolean(g.isHighStaff || g.canManage || g.highStaff),
      canManage: Boolean(g.canManage || g.isHighStaff),
      isPm: Boolean(g.isPm),
      candidatureReview: Boolean(g.candidatureReview),
      appelliReview: Boolean(g.appelliReview || g.isHighStaff || g.canManage || g.director),
      director: Boolean(g.director),
    };
    ensureAccessibleTab();
    renderTabs();
  }

  function ensureInboxBootEl() {
    return null;
  }

  function inboxBootLoadingHtml() {
    return (
      '<div class="vc-staff-inbox-loading" role="status" aria-live="polite">' +
      '<div class="vc-staff-inbox-loading__head">' +
      '<span class="vc-staff-inbox-loading__spinner" aria-hidden="true"></span>' +
      "<p>Caricamento inbox\u2026</p>" +
      "</div></div>"
    );
  }

  function showInboxBootScreen() {
    var panel = T.byId("vc-staff-inbox");
    if (!panel) return;
    inboxBooting = true;
    panel.classList.add("is-booting");
    panel.hidden = false;
    var list = T.byId("vc-staff-inbox-list");
    if (!list) return;
    state.items = [];
    state.pagination = null;
    list.hidden = false;
    list.classList.remove("is-refreshing");
    list.classList.add("is-loading");
    list.innerHTML = inboxBootLoadingHtml();
  }

  function hideInboxBootScreen() {
    inboxBooting = false;
    var panel = T.byId("vc-staff-inbox");
    if (panel) panel.classList.remove("is-booting");
    var boot = T.byId("vc-staff-inbox-boot");
    if (boot) boot.remove();
  }

  function prepareBootTab() {
    emptyLoadedTabs = Object.create(null);
    pickBestTabFromSummary();
    var anyPending = false;
    for (var i = 0; i < TABS.length; i += 1) {
      var tid = TABS[i].id;
      if (!canAccessTab(tid)) continue;
      if (Number(state.summary && state.summary[tid] || 0) > 0) {
        anyPending = true;
        break;
      }
    }
    if (anyPending) state.scope = "pending";
    renderTabs();
    renderScopeToggle();
    renderQueueFilters();
    syncUrlState();
  }

  function applySummaryPayload(data) {
    if (!data || !data.summary || typeof data.summary !== "object") return false;
    state.summary = data.summary;
    if (data.permissions) {
      var p = data.permissions;
      state.permissions = {
        isHighStaff: Boolean(p.highStaff || p.isHighStaff),
        canManage: Boolean(p.highStaff || p.canManage),
        isPm: Boolean(p.isPm),
        candidatureReview: Boolean(p.candidatureReview),
        appelliReview: Boolean(p.appelliReview),
        director: Boolean(p.director),
      };
    }
    try {
      var cachePayload = {
        summary: state.summary,
        permissions: data.permissions || null,
        at: Date.now(),
      };
      sessionStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(cachePayload));
      localStorage.setItem(SUMMARY_CACHE_LOCAL_KEY, JSON.stringify(cachePayload));
    } catch (eCache) {}
    ensureAccessibleTab();
    renderTabs();
    return true;
  }

  function readCachedSummaryPayload() {
    try {
      var pref = window.__VC_INBOX_SUMMARY_PREFETCH;
      if (pref && pref.summary) return pref;
      var now = Date.now();
      try {
        var raw = sessionStorage.getItem(SUMMARY_CACHE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.summary && now - Number(parsed.at || 0) <= SUMMARY_CACHE_TTL_MS) return parsed;
        }
      } catch (eS) {}
      try {
        var rawLocal = localStorage.getItem(SUMMARY_CACHE_LOCAL_KEY);
        if (rawLocal) {
          var parsedLocal = JSON.parse(rawLocal);
          if (parsedLocal && parsedLocal.summary && now - Number(parsedLocal.at || 0) <= SUMMARY_CACHE_LOCAL_TTL_MS) {
            return parsedLocal;
          }
        }
      } catch (eL) {}
      return null;
    } catch (eRead) {
      return null;
    }
  }

  function applyInstantSummary() {
    var cached = readCachedSummaryPayload();
    if (!cached) return false;
    return applySummaryPayload(cached);
  }

  function waitForPermissionsFast() {
    seedPermissionsFromGate();
    if (permissionsReady()) return Promise.resolve();
    var cap = T.isCoarseMobile && T.isCoarseMobile() ? 120 : 80;
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        window.removeEventListener("vc:staff-access-ok", finish);
        seedPermissionsFromGate();
        resolve();
      }
      window.addEventListener("vc:staff-access-ok", finish);
      window.setTimeout(finish, cap);
    });
  }

  function loadInitialData() {
    if (initialLoadPromise) return initialLoadPromise;
    showInboxBootScreen();
    initialLoadPromise = waitForPermissionsFast()
      .then(function () {
        seedPermissionsFromGate();
        ensureAccessibleTab();
        applyInstantSummary();
        prepareBootTab();
        return runBootQueueLoad();
      })
      .finally(function () {
        window.setTimeout(function () {
          initialLoadPromise = null;
        }, 0);
      });
    return initialLoadPromise;
  }
  function loadSummary() {
    return T.fetchJson(apiBase() + (apiBase().indexOf("?") >= 0 ? "&" : "?") + "queue=summary", {
      timeoutMs: T.resolveFetchTimeoutMs ? T.resolveFetchTimeoutMs(12000) : 12000,
    })
      .then(function (out) {
        if (out.data && out.data.ok) applySummaryPayload(out.data);
      })
      .catch(function () {});
  }

  function tabLabel(tabId) {
    var found = TABS.find(function (t) {
      return t.id === tabId;
    });
    return found ? found.label : "elenco";
  }

  var lastVisibleRefreshAt = 0;

  function inboxLoadingSkeletonHtml() {
    return (
      '<div class="vc-staff-inbox-loading" role="status" aria-live="polite">' +
      '<div class="vc-staff-inbox-loading__head">' +
      '<span class="vc-staff-inbox-loading__spinner" aria-hidden="true"></span>' +
      "<p>Caricamento " +
      T.esc(tabLabel(state.tab).toLowerCase()) +
      "\u2026</p>" +
      "</div></div>"
    );
  }

  function inboxEmptyBoxHtml(messageHtml, iconClass) {
    var ic = String(iconClass || "fa-inbox").trim() || "fa-inbox";
    return (
      '<div class="vc-notify-empty vc-staff-inbox-empty" role="status">' +
      '<i class="fa ' +
      T.esc(ic) +
      '" aria-hidden="true"></i>' +
      "<p>" +
      messageHtml +
      "</p></div>"
    );
  }

  function inboxEmptyMessage() {
    if (state.scope === "pending") {
      return "Nessuna richiesta in attesa con i filtri selezionati.";
    }
    return "Nessuna richiesta trovata con i filtri selezionati.";
  }

  function clearInboxLoading() {
    var list = T.byId("vc-staff-inbox-list");
    if (!list) return;
    list.classList.remove("is-loading", "is-refreshing");
  }

  function showInboxLoading(mode) {
    var list = T.byId("vc-staff-inbox-list");
    if (!list) return;

    if (mode === "off") {
      clearInboxLoading();
      return;
    }

    if (inboxBooting) return;

    if (mode === "soft" && state.items.length) {
      list.classList.add("is-refreshing");
      list.classList.remove("is-loading");
      return;
    }

    state.items = [];
    state.pagination = null;
    state.detail = null;
    state.selectedKey = "";
    state.detailLoading = false;
    state.detailError = "";

    var layout = T.byId("vc-staff-inbox");
    var detail = T.byId("vc-staff-inbox-detail");
    var pagination = T.byId("vc-staff-inbox-pagination");

    if (layout) {
      layout.classList.remove("has-detail");
      layout.hidden = false;
    }
    if (detail) {
      detail.hidden = true;
      detail.innerHTML = "";
    }
    if (pagination) {
      pagination.hidden = true;
      pagination.innerHTML = "";
    }

    list.hidden = false;
    list.classList.remove("is-refreshing");
    list.classList.add("is-loading");
    list.innerHTML = inboxLoadingSkeletonHtml();
  }

  function clearLoadWatchdog() {
    if (loadWatchdogTimer) {
      clearTimeout(loadWatchdogTimer);
      loadWatchdogTimer = null;
    }
  }

  function chainQueueLoad(seq, nextOpts) {
    // Handoff silenzioso: non chiamare renderList/finishQueueLoad tra un fetch e l'altro,
    // altrimenti summary cache + lista vuota = skeleton infinito al primo avvio (mobile).
    if (!nextOpts.quiet && seq === loadSeq) {
      loadInFlightNonQuiet = false;
      clearLoadWatchdog();
    }
    return loadQueue(nextOpts);
  }

  function armLoadWatchdog(seq) {
    clearLoadWatchdog();
    var capMs =
      state.tab === "appelli" && T.isCoarseMobile && T.isCoarseMobile()
        ? 14000
        : T.isCoarseMobile && T.isCoarseMobile()
          ? 22000
          : 28000;
    loadWatchdogTimer = setTimeout(function () {
      loadWatchdogTimer = null;
      if (seq !== loadSeq) return;
      var list = T.byId("vc-staff-inbox-list");
      if (!list || !list.querySelector(".vc-staff-inbox-loading")) return;
      loadInFlightNonQuiet = false;
      lastQueueLoadFailed = true;
      if (state.tab === "appelli" && !initialQueueLoaded) {
        loadQueue({ soft: false, _internal: true, sync: true, _boot: true, _userIntent: true }).catch(function () {
          finishQueueLoad(loadSeq, {
            force: true,
            message: "Caricamento appelli troppo lento. Tocca Ricarica o cambia filtro.",
          });
        });
        return;
      }
      finishQueueLoad(seq, {
        force: true,
        message: "Caricamento troppo lento. Tocca Ricarica o cambia filtro.",
      });
    }, capMs);
  }

  function finishQueueLoad(seq, opts) {
    opts = opts || {};
    if (inboxBooting && (initialQueueLoaded || opts.force)) hideInboxBootScreen();
    if (!opts.force && seq !== loadSeq) return;
    if (seq === loadSeq) clearLoadWatchdog();
    clearSkeletonWatchdog();
    var list = T.byId("vc-staff-inbox-list");
    if (!list) return;
    clearInboxLoading();
    var sk = list.querySelector(".vc-staff-inbox-loading");
    if (sk) sk.remove();
    try {
      renderList();
    } catch (eRender) {
      list.innerHTML = inboxEmptyBoxHtml(
        T.esc(opts.message || "Errore visualizzazione elenco. Ricarica la pagina."),
        "fa-exclamation-circle",
      );
    }
    if (opts.message) inboxNotify(opts.message, true);
  }

  function safeRenderList() {
    try {
      renderList();
    } catch (eRender) {
      var list = T.byId("vc-staff-inbox-list");
      if (list) {
        list.innerHTML = inboxEmptyBoxHtml(
          "Errore visualizzazione elenco. Ricarica la pagina.",
          "fa-exclamation-circle",
        );
      }
      inboxNotify("Errore visualizzazione elenco.", true);
    }
  }

  function loadQueue(opts) {
    opts = opts || {};
    var quiet = Boolean(opts.quiet);
    var soft = Boolean(opts.soft);
    // Embed: niente fetch/toast mentre sei su Personali.
    if (isInboxEmbed() && !isStaffScopeActive()) {
      T.hideStaffToast();
      return Promise.resolve();
    }
    // Refresh silenziosi non devono abortire il primo caricamento visibile (tipico su cellulare).
    if (quiet && loadInFlightNonQuiet) {
      return Promise.resolve();
    }
    // Solo boot esterni concorrenti (init + access-ok) condividono la stessa promise.
    // Le riprese interne (_waitedPerms / token / cambio tab / retry) NON devono
    // riagganciarsi a sé stesse → deadlock tipico al primo load su telefono.
    if (
      !quiet &&
      loadInFlightNonQuiet &&
      loadQueueCoalesce &&
      !opts._internal &&
      !opts._retried &&
      !opts._retryCount &&
      !opts._waitedPerms &&
      !opts._waitedToken
    ) {
      return loadQueueCoalesce;
    }
    var seq = (loadSeq += 1);
    // Solo i boot esterni concorrenti riusano la promise in corso.
    // Retry interni (_waitedPerms, cambio tab, empty-retry) devono proseguire, altrimenti deadlock.
    var keepPriorLoad =
      !opts._internal &&
      !opts._retried &&
      !opts._retryCount &&
      !opts._waitedPerms &&
      !opts._waitedToken &&
      !opts._emptyRetry &&
      !opts._appealRetry &&
      !opts.sync &&
      !opts._switchedEmptyTab &&
      !opts._boot &&
      !opts._switchedBootTab &&
      loadInFlightNonQuiet &&
      !quiet &&
      !initialQueueLoaded &&
      loadAbortCtrl;
    if (loadAbortCtrl && !keepPriorLoad) {
      if (bootLoadSeq && bootLoadSeq !== seq && !opts._userIntent && loadQueueCoalesce) {
        return loadQueueCoalesce;
      }
      if (
        !initialQueueLoaded &&
        loadInFlightNonQuiet &&
        opts._internal &&
        !opts._userIntent &&
        !opts._emptyRetry &&
        !opts._appealRetry &&
        !opts.sync &&
        !opts._boot &&
        loadQueueCoalesce
      ) {
        return loadQueueCoalesce;
      }
      try {
        loadAbortCtrl.abort();
      } catch (eAbort) {}
    }
    if (keepPriorLoad && loadQueueCoalesce) {
      return loadQueueCoalesce;
    }
    loadAbortCtrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (!quiet && opts._boot) bootLoadSeq = seq;
    if (!quiet) {
      loadInFlightNonQuiet = true;
      armLoadWatchdog(seq);
    }
    // Do not re-read tab/filter from URL here: setters already updated state + URL.
    // Re-reading can race and briefly restore the previous queue.
    renderTabs();
    renderScopeToggle();
    renderQueueFilters();
    renderWeekNav();
    if (!quiet && !opts._noSkeleton && !inboxBooting) {
      showInboxLoading(soft || state.items.length ? "soft" : "skeleton");
      if (state.tab === "appelli" && state.scope === "pending" && appealPendingInSummary()) {
        armSkeletonWatchdog();
      }
      T.hideStaffToast();
    } else if (!quiet) {
      T.hideStaffToast();
    }

    var requestedTab = state.tab;
    var requestedScope = state.scope;
    var requestedFilter = state.filter;
    var requestedWeek = state.week;
    var requestedPage = state.page;

    var run = Promise.resolve()
      .then(function () {
        if (!canAccessTab(requestedTab)) {
          if (!permissionsReady() && !opts._waitedPerms) {
            seedPermissionsFromGate();
            return loadQueue(
              Object.assign({}, opts, {
                _waitedPerms: true,
                _internal: true,
                quiet: quiet,
                soft: soft,
              }),
            );
          }
          ensureAccessibleTab();
          if (state.tab !== requestedTab) {
            return loadQueue(
              Object.assign({}, opts, { _internal: true, quiet: quiet, soft: soft }),
            );
          }
          if (!quiet) endNonQuietQueueLoad(seq);
          if (!quiet) {
            lastQueueLoadFailed = true;
            inboxNotify("Non hai i permessi per aprire questa categoria.", true);
            state.items = [];
            state.pagination = null;
            renderList();
            renderPagination();
            renderWeekNav();
          }
          return;
        }

        if (!T.getToken()) {
          if (!opts._waitedToken) {
            return waitForDiscordToken().then(function (hasToken) {
              if (!hasToken) {
                if (!quiet) endNonQuietQueueLoad(seq);
                if (!quiet) {
                  lastQueueLoadFailed = true;
                  inboxNotify("Accedi per continuare.", true);
                }
                return;
              }
              return loadQueue(
                Object.assign({}, opts, {
                  _waitedToken: true,
                  _internal: true,
                  quiet: quiet,
                  soft: soft,
                }),
              );
            });
          }
          if (!quiet) endNonQuietQueueLoad(seq);
          if (!quiet) {
            lastQueueLoadFailed = true;
            inboxNotify("Accedi per continuare.", true);
          }
          return;
        }

        var url =
          apiBase() +
          (apiBase().indexOf("?") >= 0 ? "&" : "?") +
          "queue=" +
          encodeURIComponent(requestedTab) +
          "&scope=" +
          encodeURIComponent(requestedScope) +
          "&page=" +
          encodeURIComponent(String(requestedPage)) +
          "&pageSize=" +
          encodeURIComponent(String(PAGE_SIZE));
        if (requestedFilter) url += "&filter=" + encodeURIComponent(requestedFilter);
        if (requestedTab === "resoconti" && requestedWeek) {
          url += "&week=" + encodeURIComponent(requestedWeek);
        }
        if (opts.sync || (requestedTab === "appelli" && requestedScope === "pending")) {
          url += "&sync=1";
        }

        var prefetched = consumeQueuePrefetch(requestedTab, requestedScope, requestedPage);
        var fetchOpts = {
          timeoutMs:
            requestedTab === "appelli" && T.isCoarseMobile && T.isCoarseMobile()
              ? T.resolveFetchTimeoutMs
                ? T.resolveFetchTimeoutMs(22000)
                : 22000
              : T.resolveFetchTimeoutMs
                ? T.resolveFetchTimeoutMs(45000)
                : 45000,
          signal: loadAbortCtrl ? loadAbortCtrl.signal : null,
        };
        var fetchPromise = prefetched
          ? prefetched.then(function (out) {
              if (out && out.res) return out;
              return T.fetchJson(url, fetchOpts);
            })
          : T.fetchJson(url, fetchOpts);

        return fetchPromise.then(function (out) {
          if (seq !== loadSeq) return;
          var errCode = out && out.data ? String(out.data.error || "").toLowerCase() : "";
          if (errCode === "aborted") {
            if (!quiet && !opts._retried) {
              return loadQueue(
                Object.assign({}, opts, {
                  _retried: true,
                  _internal: true,
                  soft: soft || state.items.length > 0,
                }),
              );
            }
            if (!quiet) endNonQuietQueueLoad(seq);
            return;
          }
          var tabChanged =
            state.tab !== requestedTab ||
            state.scope !== requestedScope ||
            state.filter !== requestedFilter ||
            state.week !== requestedWeek ||
            state.page !== requestedPage;
          if (tabChanged) {
            if (!quiet) {
              return chainQueueLoad(seq, { quiet: false, soft: true, _internal: true });
            }
            return;
          }
          if (!out.res.ok || !out.data || !out.data.ok) {
            var timedOut = errCode === "timeout";
            var unauthorized =
              Number(out.res && out.res.status) === 401 ||
              errCode === "missing_token" ||
              errCode === "invalid_token";
            var retryCount = Number(opts._retryCount || 0) + (opts._retried ? 1 : 0);
            if (!opts._retryCount && opts._retried) retryCount = 1;
            if ((timedOut || unauthorized || !out.res.ok) && retryCount < 3 && !quiet) {
              return new Promise(function (resolve) {
                window.setTimeout(resolve, 400 * (retryCount + 1));
              }).then(function () {
                return loadQueue(
                  Object.assign({}, opts, {
                    _retried: true,
                    _internal: true,
                    _retryCount: retryCount + 1,
                    quiet: quiet,
                    soft: soft || state.items.length > 0,
                  }),
                );
              });
            }
            if (!quiet) endNonQuietQueueLoad(seq);
            if (!quiet) {
              lastQueueLoadFailed = true;
              var loadMsg =
                (out.data && out.data.message) ||
                (Number(out.res && out.res.status) >= 500
                  ? "Servizio inbox temporaneamente non disponibile. Riprova tra qualche secondo."
                  : unauthorized
                    ? "Sessione scaduta. Ricarica la pagina e accedi di nuovo."
                    : "Impossibile caricare la coda.");
              inboxNotify(loadMsg, true);
              if (!soft && !state.items.length) {
                state.items = [];
                state.pagination = null;
                state.weeks = [];
                safeRenderList();
                renderPagination();
                renderWeekNav();
                syncDetailWithList();
              }
            }
            return;
          }
          lastQueueLoadFailed = false;
          initialQueueLoaded = true;
          pendingListRetryCount = 0;
          clearSkeletonWatchdog();
          appealFixWaitCount = 0;
          if (out.data.summary) applySummaryPayload(out.data);
          // Imposta items PRIMA di togliere lo skeleton: altrimenti flash/empty sticky su mobile.
          state.items = mergeIncomingWorkflowItems(out.data.items || []);
          state.pagination = out.data.pagination || null;
          if (state.pagination && state.pagination.page) state.page = state.pagination.page;
          if (requestedTab === "resoconti") {
            state.weeks = Array.isArray(out.data.weeks) ? out.data.weeks : [];
            if (out.data.week) state.week = String(out.data.week);
            syncUrlState();
          } else {
            state.weeks = [];
            state.week = "";
          }
          if (requestedScope === "pending" && state.summary && state.page <= 1 && state.items.length > 0) {
            delete emptyLoadedTabs[requestedTab];
            renderTabs();
          }
          if (!quiet) T.hideStaffToast();
          renderPagination();
          renderWeekNav();
          syncDetailWithList();
          var panel = T.byId("vc-staff-inbox");
          if (panel) panel.hidden = false;
          if (!state.summary && out.data.summary) applySummaryPayload(out.data);
          if (opts._boot && out.data.summary) {
            var bootPrevTab = state.tab;
            pickBestTabFromSummary();
            renderTabs();
            if (state.tab !== bootPrevTab && !opts._switchedBootTab && !quiet) {
              syncUrlState();
              return chainQueueLoad(seq, {
                soft: true,
                _internal: true,
                _boot: true,
                _switchedBootTab: true,
              });
            }
          }
          var summaryCount =
            state.summary && state.summary[requestedTab] != null
              ? Number(state.summary[requestedTab]) || 0
              : 0;
          if (
            !quiet &&
            requestedScope === "pending" &&
            !state.items.length &&
            summaryCount > 0 &&
            !opts._emptyRetry &&
            !opts.sync
          ) {
            return chainQueueLoad(
              seq,
              Object.assign({}, opts, {
                _emptyRetry: true,
                _internal: true,
                sync: true,
                soft: true,
              }),
            );
          }
          if (
            !quiet &&
            requestedTab === "appelli" &&
            requestedScope === "pending" &&
            !state.items.length &&
            summaryCount > 0 &&
            Number(opts._appealRetry || 0) < 6
          ) {
            var appealTry = Number(opts._appealRetry || 0) + 1;
            return new Promise(function (resolve) {
              window.setTimeout(resolve, 400 + appealTry * 600);
            }).then(function () {
              return chainQueueLoad(
                seq,
                Object.assign({}, opts, {
                  _appealRetry: appealTry,
                  _internal: true,
                  sync: true,
                  soft: true,
                }),
              );
            });
          }
          if (
            !quiet &&
            requestedScope === "pending" &&
            !state.items.length &&
            summaryCount > 0 &&
            (opts._emptyRetry || opts.sync) &&
            !opts._switchedEmptyTab &&
            !(
              requestedTab === "appelli" &&
              (opts._boot || opts._mobileAppealFix || (T.isCoarseMobile && T.isCoarseMobile()))
            )
          ) {
            emptyLoadedTabs[requestedTab] = true;
            markTabConfirmedEmpty(requestedTab);
            var prevTab = state.tab;
            pickBestTabFromSummary({ skipEmpty: true });
            renderTabs();
            if (state.tab !== prevTab) {
              return chainQueueLoad(seq, {
                soft: true,
                _internal: true,
                _switchedEmptyTab: true,
              });
            }
          }
          finalizeVisibleQueueLoad(seq, quiet);
          if (!quiet && opts._boot && needsMobileAppealReload()) {
            armMobileAppealBootFix(600);
            scheduleMobileAppealBootGuarantee();
          }
        });
      })
      .catch(function (err) {
        if (seq !== loadSeq) return;
        var aborted =
          err &&
          (err.name === "AbortError" || String(err.message || "").toLowerCase().indexOf("abort") >= 0);
        if (aborted) {
          var abortRetry = Number(opts._abortRetry || 0);
          var abortCap = opts._boot && !initialQueueLoaded ? 3 : 1;
          if (!quiet && abortRetry < abortCap) {
            return loadQueue(
              Object.assign({}, opts, {
                _retried: true,
                _abortRetry: abortRetry + 1,
                _internal: true,
                soft: soft || state.items.length > 0,
              }),
            );
          }
          if (!quiet) endNonQuietQueueLoad(seq);
          return;
        }
        var retryCount = Number(opts._retryCount || 0);
        if (!quiet && retryCount < 3) {
          loadInFlightNonQuiet = true;
          armLoadWatchdog(seq);
          return new Promise(function (resolve) {
            window.setTimeout(resolve, 450 * (retryCount + 1));
          }).then(function () {
            return loadQueue(
              Object.assign({}, opts, {
                _retried: true,
                _internal: true,
                _retryCount: retryCount + 1,
                soft: soft || state.items.length > 0,
              }),
            );
          });
        }
        endNonQuietQueueLoad(seq);
        if (!quiet) {
          lastQueueLoadFailed = true;
          inboxNotify("Errore di rete. Controlla la connessione e riprova.", true);
          if (!state.items.length) {
            state.items = [];
            state.pagination = null;
            safeRenderList();
            renderPagination();
            renderWeekNav();
            syncDetailWithList();
          }
        }
      })
      .finally(function () {
        if (!quiet && seq === loadSeq) {
          if (bootLoadSeq === seq) bootLoadSeq = 0;
          loadQueueCoalesce = null;
        } else if (!quiet && seq !== loadSeq) {
          window.setTimeout(function () {
            if (loadSeq !== seq && !loadQueueCoalesce) {
              loadInFlightNonQuiet = false;
            }
          }, 0);
        }
      });

    if (!quiet) loadQueueCoalesce = run;
    return run;
  }

  function init() {
    if (initStarted) {
      if (isInboxEmbed() && isStaffScopeActive() && (lastQueueLoadFailed || !initialQueueLoaded)) {
        loadInitialData().catch(function () {});
      }
      return;
    }
    if (isInboxEmbed() && !isStaffScopeActive()) {
      // Aspetta il tab Staff: evita toast “coda” su Personali.
      return;
    }
    initStarted = true;
    readUrlState();
    seedPermissionsFromGate();
    ensureAccessibleTab();
    renderTabs();
    renderScopeToggle();
    renderQueueFilters();
    if (!T.getToken()) {
      showInboxBootScreen();
      initStarted = false;
      var tokenWait = T.isCoarseMobile && T.isCoarseMobile() ? 1200 : 800;
      window.setTimeout(function () {
        if (isStaffScopeActive()) T.whenDiscordSessionReady(init, tokenWait);
      }, 200);
      return;
    }
    renderScopeToggle();
    renderQueueFilters();
    showInboxBootScreen();
    loadInitialData()
      .then(function () {
        connectInboxWebSocket();
        scheduleMobileAppealBootGuarantee();
        // Solo se il primo load è fallito davvero: niente retry su lista vuota ok.
        if (lastQueueLoadFailed) {
          window.setTimeout(function () {
            if (!isStaffScopeActive() || initialQueueLoaded) return;
            loadQueue({ soft: Boolean(state.items.length), _internal: true }).catch(function () {});
          }, 900);
        }
      })
      .catch(function () {
        hideInboxBootScreen();
        finishQueueLoad(loadSeq, { force: true });
        loadInFlightNonQuiet = false;
        lastQueueLoadFailed = true;
        inboxNotify("Impossibile caricare l'inbox.", true);
        connectInboxWebSocket();
      });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      if (Date.now() - lastVisibleRefreshAt < 15000) return;
      lastVisibleRefreshAt = Date.now();
      scheduleInboxRefreshFromRealtime();
    });
  }

  function ensureInboxCineLayout() {
    try {
      if (window.__VC_STAFF_INBOX_EMBED) return;
      if (document.body && document.body.classList.contains("vc-notifications-page")) return;
    } catch (eEmbed) {}
    if (typeof window.__vcPageHeroLayout === "function") {
      window.__vcPageHeroLayout({ force: true });
    }
  }

  function onStaffAccessReady() {
    if (isInboxEmbed() && !isStaffScopeActive()) {
      T.hideStaffToast();
      return;
    }
    ensureInboxCineLayout();
    seedPermissionsFromGate();
    ensureAccessibleTab();
    renderTabs();
    if (!initStarted) {
      T.whenDiscordSessionReady(init, 800);
      return;
    }
    if (initialLoadPromise || loadInFlightNonQuiet) {
      return;
    }
    if (lastQueueLoadFailed) {
      loadInitialData().catch(function () {});
    }
  }

  try {
    window.VCStaffInboxEmbed = {
      boot: function () {
        T.hideStaffToast();
        if (isInboxEmbed() && !isStaffScopeActive()) return;
        if (initStarted) {
          if (lastQueueLoadFailed || !initialQueueLoaded) {
            if (!initialLoadPromise) loadInitialData().catch(function () {});
            return;
          }
          if (needsMobileAppealReload()) {
            armMobileAppealBootFix(500);
          }
          // Coda già ok: ripingere (bfcache / switch tab).
          safeRenderList();
          return;
        }
        T.whenDiscordSessionReady(init, T.isCoarseMobile && T.isCoarseMobile() ? 1400 : 600);
      },
    };
  } catch (eExport) {}

  T.bootPage(function () {
    ensureInboxCineLayout();
    window.addEventListener("pageshow", function (ev) {
      if (isInboxEmbed() && !isStaffScopeActive()) return;
      seedPermissionsFromGate();
      repairInboxAfterBack();
      if ((!initialQueueLoaded || lastQueueLoadFailed) && !inboxLoadBusy()) {
        loadQueue({ soft: Boolean(state.items.length), _internal: true }).catch(function () {});
      } else {
        safeRenderList();
      }
    });
    window.addEventListener("vc-discord-profile", function () {
      if (!isStaffScopeActive()) return;
      if (!initStarted) {
        T.whenDiscordSessionReady(init, T.isCoarseMobile && T.isCoarseMobile() ? 1200 : 800);
        return;
      }
      if ((!initialQueueLoaded || lastQueueLoadFailed) && !inboxLoadBusy() && !initialLoadPromise) {
        loadInitialData().catch(function () {});
        return;
      }
      if (state.items.length || !listEmptyDespitePending()) return;
      if (inboxLoadBusy()) return;
      loadQueue({ soft: true, _internal: true, sync: true, _emptyRetry: true }).catch(function () {});
    });
    window.addEventListener("vc:staff-access-ok", onStaffAccessReady);
    window.addEventListener("vc:inbox-summary-ready", function (ev) {
      try {
        var d = ev && ev.detail;
        if (!d || !d.summary || !isStaffScopeActive()) return;
        applySummaryPayload(d);
        if (inboxBooting) prepareBootTab();
      } catch (eSumEv) {}
    });
    window.addEventListener("vc:notif-scope", function (ev) {
      var next = ev && ev.detail ? ev.detail.scope : "";
      if (next === "personal") {
        T.hideStaffToast();
        return;
      }
      if (next === "staff" && !initStarted) {
        T.whenDiscordSessionReady(init, T.isCoarseMobile && T.isCoarseMobile() ? 1400 : 600);
      } else if (next === "staff" && (lastQueueLoadFailed || !initialQueueLoaded)) {
        if (!initialLoadPromise) {
          emptyLoadedTabs = Object.create(null);
          mobileAppealFixAttempts = 0;
          loadInitialData().catch(function () {});
        }
      } else if (next === "staff") {
        safeRenderList();
      }
    });
    T.registerPtrRefresh(function () {
      if (!isStaffScopeActive()) return Promise.resolve();
      if (loadInFlightNonQuiet) return Promise.resolve();
      return loadQueue({
        soft: Boolean(state.items.length),
        _internal: true,
        sync: state.tab === "appelli" || state.scope === "pending",
      }).then(function () {
        return loadSummary().catch(function () {});
      });
    });
    if (isStaffScopeActive()) {
      T.whenDiscordSessionReady(init, 800);
    }
  });
})();
