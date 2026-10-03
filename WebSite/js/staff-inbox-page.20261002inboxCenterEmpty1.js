(function () {
  var T = window.VCStaffTools;
  if (!T) return;

  var TABS = [
    /* pauseOutInbox1: Pause → card giorni sul profilo staff (non più inbox) */
    { id: "candidature", label: "Candidature", queue: "candidature", requiresCandidatureReview: true },
    { id: "appelli", label: "Appelli", queue: "appelli", requiresAppelliReview: true },
    /* resoProfile1: Resoconti → card sul profilo staff */
    /* partnerPtChrono1: Punti tolti → card Partner sul profilo staff */
  ];

  var QUEUE_FILTERS = {
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
  /* inboxClickOpen2: timestamp ultimo open sheet (anti ghost-close) */
  var inboxSheetOpenedAt = 0;
  var loadAbortCtrl = null;
  var loadWatchdogTimer = null;
  var initStarted = false;
  var loadInFlightNonQuiet = false;
  var inboxRealtimeRefreshPending = false;
  var inboxPollTimer = null;
  var initialQueueLoaded = false;
  var pendingFocusItemId = "";
  var pendingFocusConsumed = false;
  var lastQueueLoadFailed = false;
  var initialLoadPromise = null;
  var loadQueueCoalesce = null;
  var pendingListRetryTimer = null;
  var pendingListRetryCount = 0;
  var PENDING_LIST_RETRY_MAX = 5;
    var bootLoadSeq = 0;
  var mobileAppealFixAttempts = 0;
  var MOBILE_APPEAL_FIX_MAX = 4;
  var appealFixWaitCount = 0;
  var skeletonWatchdogTimer = null;
  var SKELETON_WATCHDOG_MS = 4500;
  var PREFETCH_CONSUME_MAX_MS = 2200;
    var emptyLoadedTabs = Object.create(null);
  var SUMMARY_CACHE_KEY = "vc_inbox_summary_v1";
  var SUMMARY_CACHE_LOCAL_KEY = "vc_inbox_summary_local_v1";
  var SUMMARY_CACHE_TTL_MS = 90000;
  var SUMMARY_CACHE_LOCAL_TTL_MS = 300000;
  var inboxBooting = false;
  var lastInboxListPaintSig = "";

  function inboxListPaintSig() {
    try {
      return (
        String(state.tab || "") +
        "|" +
        String(state.scope || "") +
        "|" +
        String(state.filter || "") +
        "|" +
        String(state.selectedKey || "") +
        "|" +
        (state.items || [])
          .map(function (it) {
            return [
              itemKey(it),
              String((it && it.status) || ""),
              String((it && it.displayName) || ""),
              String((it && it.avatarUrl) || ""),
              String((it && it.updatedAt) || (it && it.createdAt) || ""),
            ].join(":");
          })
          .join(",")
      );
    } catch (eSig) {
      return String(Date.now());
    }
  }

  function inboxLoadBusy() {
    return Boolean(loadInFlightNonQuiet);
  }

  function clearSkeletonWatchdog() {
    if (skeletonWatchdogTimer) {
      clearTimeout(skeletonWatchdogTimer);
      skeletonWatchdogTimer = null;
    }
  }

  /* inboxRefreshUnlock1: sblocca tocchi/cine senza abortire il fetch in corso */
  function unlockInboxPageChrome() {
    try {
      var root = document.documentElement;
      /* ready flags: altrimenti html:not(.vc-soft-fx-ready) lascia main pe:none */
      root.classList.add(
        "vc-page-cine-ready",
        "vc-cine-curtain-off",
        "vc-soft-fx-ready",
        "vc-core-styles-ready",
        "vc-home-styles-ready",
      );
      root.classList.remove(
        "vc-page-cine-boot",
        "vc-notif-staff-loading",
        "vc-notif-early-staff",
        "vc-interaction-hold",
        "vc-loading-scroll-lock",
        "vc-scroll-soft-lock",
        "vc-loader-blocking-live",
      );
      window.__VC_NOTIF_EARLY_STAFF = false;
      window.__VC_INBOX_FS_GATE_HOLD = false;
      root.style.removeProperty("touch-action");
      if (document.body) {
        document.body.style.removeProperty("touch-action");
        document.body.style.setProperty("pointer-events", "auto", "important");
      }
      try {
        var mainEl = document.querySelector("body.vc-notifications-page > main");
        if (mainEl) mainEl.style.setProperty("pointer-events", "auto", "important");
      } catch (eMainPe) {}
      root.style.setProperty("cursor", "auto", "important");
      if (document.body) document.body.style.setProperty("cursor", "auto", "important");
      window.setTimeout(function () {
        try {
          root.style.removeProperty("cursor");
          if (document.body) document.body.style.removeProperty("cursor");
        } catch (eClrCur) {}
      }, 50);
    } catch (eUnlock) {}
    try {
      if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
    } catch (eUnpin) {}
    try {
      if (typeof window.__vcReleaseInteractionHold === "function") window.__vcReleaseInteractionHold();
    } catch (eRel) {}
  }

  function forceReleaseStuckInboxLoad(opts) {
    opts = opts || {};
    var abortFetch = opts.abort !== false;
    var restart = Boolean(opts.restart);
    if (abortFetch) {
    loadInFlightNonQuiet = false;
    bootLoadSeq = 0;
    loadQueueCoalesce = null;
    clearLoadWatchdog();
    clearSkeletonWatchdog();
    clearSoftRefreshFailsafe();
    try {
      if (loadAbortCtrl) {
        /* rateLimitCalm1: abort silenzioso — niente Uncaught AbortError in console */
        try {
          if (typeof loadAbortCtrl.abort === "function") loadAbortCtrl.abort("force_release");
        } catch (eAbortInner) {
          try {
            loadAbortCtrl.abort();
          } catch (eAbort2) {}
        }
      }
    } catch (eAbort) {}
    loadAbortCtrl = null;
    }
    /* Always lift FS gate — mobile watchdogs used to leave GATE_HOLD forever after staffBooted. */
    try {
      if (abortFetch || state.items.length) initialQueueLoaded = true;
      inboxBooting = false;
      hideInboxFsLoading(true);
      hideInboxBootScreen(true);
    } catch (eGate) {}
    try {
      clearInboxLoading();
    } catch (eClr) {}
    try {
      var list = T.byId("vc-staff-inbox-list");
      if (list) {
        list.classList.remove("is-loading", "is-refreshing");
        list.setAttribute("aria-busy", "false");
        list.removeAttribute("data-inbox-loading");
      }
      var panel = T.byId("vc-staff-inbox");
      if (panel) panel.classList.remove("is-booting");
    } catch (eList) {}
    unlockInboxPageChrome();
    if (restart && isStaffScopeActive()) {
      try {
        emptyLoadedTabs = Object.create(null);
        lastInboxListPaintSig = "";
        loadQueue({
          soft: false,
          sync: true,
          cache: false,
          _userIntent: true,
          _internal: true,
          _refreshUnlock: true,
        }).catch(function () {});
      } catch (eRestart) {}
    }
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
            if (!isStaffScopeActive()) return;
    if (state.tab !== "appelli" || state.scope !== "pending") return;
    if (!appealPendingInSummary()) return;
    var waitMs =
      T.isCoarseMobile && T.isCoarseMobile() ? SKELETON_WATCHDOG_MS : Math.max(5500, SKELETON_WATCHDOG_MS);
    skeletonWatchdogTimer = window.setTimeout(function () {
      skeletonWatchdogTimer = null;
      if (state.items && state.items.length) return;
      if (!listEmptyDespitePending() && !inboxLoadBusy()) return;
      forceAppealSyncLoad(true);
    }, waitMs);
  }

  function endNonQuietQueueLoad(seq, opts) {
    opts = opts || {};
    if (seq !== loadSeq) return;
    loadInFlightNonQuiet = false;
    finishQueueLoad(seq, opts);
        if (inboxRealtimeRefreshPending) {
      inboxRealtimeRefreshPending = false;
      scheduleInboxRefreshFromRealtime({ immediate: true });
    }
  }

  var STATUS_LABELS = {
    pending: "In attesa",
    accepted: "Accettata",
    rejected: "Rifiutata",
    closed: "Chiusa",
    cancelled: "Annullata",
  };

  var state = {
    tab: "candidature",
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
    if (tab.requiresPmOrHighStaff) {
      /* inboxNoDirector1: punti tolti = PM + HS — non Director */
      if (perms.canViewPmPointsRemoved === true) return true;
      if (perms.canViewPmPointsRemoved === false) return false;
      if (perms.director && !(perms.isHighStaff || perms.canManage || perms.highStaff)) return false;
      return Boolean(
        perms.isPm ||
          perms.pm ||
          perms.isPmGestore ||
          perms.isHighStaff ||
          perms.canManage ||
          perms.highStaff,
      );
    }
    if (tab.requiresResocontiReview) {
      /* inboxNoDirector1: resoconti = HS / gestore / reviewer — non Director */
      if (perms.canViewResoconti === true || perms.resocontiReview === true) return true;
      if (perms.canViewResoconti === false) return false;
      if (perms.director && !(perms.isHighStaff || perms.canManage || perms.highStaff)) return false;
      return Boolean(
        perms.isHighStaff ||
          perms.canManage ||
          perms.highStaff ||
          perms.isPmGestore,
      );
    }
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
    return "candidature";
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

  function urlHasExplicitInboxTab() {
    try {
      var params = new URLSearchParams(location.search);
      var key = inboxTabQueryKey();
      var q = String(params.get(key) || "").trim().toLowerCase();
      if (q === "staff" || q === "personal") q = "";
      if (
        TABS.some(function (t) {
          return t.id === q;
        })
      ) {
        return true;
      }
      if (isInboxEmbed()) {
        var legacy = String(params.get("tab") || "").trim().toLowerCase();
        return TABS.some(function (t) {
          return t.id === legacy;
        });
      }
    } catch (eExplicit) {}
    return false;
  }

  function readPendingFocusFromUrl() {
    try {
      var params = new URLSearchParams(location.search);
      var raw = String(params.get("item") || "").trim();
      if (raw && !pendingFocusConsumed) pendingFocusItemId = raw;
    } catch (eFocus) {}
  }

  function itemMatchesFocusId(item, focusId) {
    if (!item || !focusId) return false;
    var fid = String(focusId);
    var mid = String(item.messageId || "").trim();
    var rid = String(item.recordId || "").trim();
    var iid = String(item.id || "").trim();
    var dk = String(item.dedupeKey || "").trim();
    if (mid && mid === fid) return true;
    if (rid && rid === fid) return true;
    if (iid && iid === fid) return true;
    if (dk && (dk === fid || dk.indexOf(":" + fid) >= 0)) return true;
    /* notifSheetOpenFix1: item=resoconti:new:MSGID → match MSGID */
    var last = "";
    try {
      var parts = fid.split(":").filter(Boolean);
      last = parts.length ? String(parts[parts.length - 1] || "").trim() : "";
    } catch (eLast) {}
    if (last) {
      if (mid && mid === last) return true;
      if (rid && rid === last) return true;
      if (iid && iid === last) return true;
    }
    if (mid && fid.indexOf(mid) >= 0) return true;
    if (rid && fid.indexOf(rid) >= 0) return true;
    return false;
  }

  function clearPendingFocusFromUrl() {
    try {
      var u = new URL(location.href);
      if (!u.searchParams.has("item")) return;
      u.searchParams.delete("item");
      history.replaceState({}, "", u.pathname + u.search);
    } catch (eClrFocus) {}
  }

  var pendingFocusRetryTimer = 0;
  var pendingFocusRetryUntil = 0;

  function schedulePendingFocusRetry() {
    if (!pendingFocusItemId || pendingFocusConsumed) return;
    if (!pendingFocusRetryUntil) pendingFocusRetryUntil = Date.now() + 14000;
    if (Date.now() > pendingFocusRetryUntil) return;
    window.clearTimeout(pendingFocusRetryTimer);
    pendingFocusRetryTimer = window.setTimeout(function () {
      pendingFocusRetryTimer = 0;
      try {
        if (tryOpenPendingFocusItem()) return;
      } catch (eTry) {}
      schedulePendingFocusRetry();
    }, 450);
  }

  function tryOpenPendingFocusItem() {
    if (!pendingFocusItemId || pendingFocusConsumed) return false;
    if (!state.items.length) {
      schedulePendingFocusRetry();
      return false;
    }
    var focusId = pendingFocusItemId;
    var item = state.items.find(function (it) {
      return itemMatchesFocusId(it, focusId);
    });
    if (!item) {
      schedulePendingFocusRetry();
      return false;
    }
    pendingFocusConsumed = true;
    pendingFocusItemId = "";
    pendingFocusRetryUntil = 0;
    window.clearTimeout(pendingFocusRetryTimer);
    clearPendingFocusFromUrl();
    openDetail(item);
    return true;
  }

    function pickBestTabFromSummary(opts) {
    opts = opts || {};
    if (!permissionsReady()) return;
    if (!state.summary || typeof state.summary !== "object") return;
    ensureAccessibleTab();
    if (opts.respectUrl && urlHasExplicitInboxTab()) return;
    if (pendingFocusItemId && urlHasExplicitInboxTab()) return;
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
    if (state.page > 1) return false;
    if (!state.summary || typeof state.summary !== "object") return false;
    return Number(state.summary[state.tab] || 0) > 0 && !emptyLoadedTabs[state.tab];
  }

  function markTabConfirmedEmpty(tabId) {
    /* inboxPendingBadgeSync1: azzera badge anche a boot — prima il guard
       inboxBooting/!initialQueueLoaded lasciava emptyLoadedTabs=true e summary=1. */
    var id = String(tabId || state.tab || "").trim();
    if (!id || id === "punti-tolti") return;
    emptyLoadedTabs[id] = true;
    if (!state.summary || typeof state.summary !== "object") return;
    if (Number(state.summary[id] || 0) <= 0) {
      try {
        renderTabs();
      } catch (eRt0) {}
      return;
    }
    state.summary[id] = 0;
    persistSummaryCache();
    try {
      renderTabs();
    } catch (eRt) {}
  }

  function persistSummaryCache() {
    if (!state.summary || typeof state.summary !== "object") return;
    try {
      var cachePayload = {
        summary: state.summary,
        permissions: state.permissions || null,
        at: Date.now(),
      };
      sessionStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(cachePayload));
      localStorage.setItem(SUMMARY_CACHE_LOCAL_KEY, JSON.stringify(cachePayload));
    } catch (eCache) {}
  }

  /* inboxPendingBadgeSync1: badge tab = total pending della coda (lista pagina 1, senza filtro tipo). */
  function syncTabBadgeFromLoadedQueue(tabId, scope, filter, items, pagination, page) {
    if (String(scope || "") !== "pending") return false;
    if (String(filter || "").trim()) return false;
    var id = String(tabId || "").trim();
    if (!id || id === "punti-tolti") return false;
    if (!state.summary || typeof state.summary !== "object") state.summary = {};
    var pageNum = Number(page || 1) || 1;
    var total = null;
    if (pagination && pagination.total != null && Number.isFinite(Number(pagination.total))) {
      total = Math.max(0, Math.floor(Number(pagination.total)));
    } else if (pageNum <= 1) {
      total = Array.isArray(items) ? items.length : 0;
    } else {
      return false;
    }
    var prev = Number(state.summary[id] || 0);
    if (prev === total) {
      if (total === 0) emptyLoadedTabs[id] = true;
      else delete emptyLoadedTabs[id];
      return false;
    }
    state.summary[id] = total;
    if (total === 0) emptyLoadedTabs[id] = true;
    else delete emptyLoadedTabs[id];
    persistSummaryCache();
    try {
      renderTabs();
    } catch (eRt2) {}
    return true;
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
    // Hard boot: soft+quiet follow-up used to wipe a good first stamp with an empty payload.
    return loadQueue({ soft: false, _boot: true, _userIntent: true }).then(function () {
      afterBootQueue();
      window.setTimeout(function () {
        if (!isStaffScopeActive()) return;
        if (!state.items.length && Number((state.summary && state.summary[state.tab]) || 0) > 0) {
          loadQueue({
            soft: false,
            sync: true,
            _internal: true,
            _emptyRetry: true,
            _userIntent: true,
          }).catch(function () {});
          return;
        }
        if (!state.items.length) return;
        /* inboxCenterEmpty1: boot hard già ok — niente secondo refresh silenzioso */
      }, 180);
    });
  }

  function consumeQueuePrefetch(requestedTab, requestedScope, requestedPage) {
        if (T.isCoarseMobile && T.isCoarseMobile() && initialQueueLoaded) return null;
    try {
      var pf = window.__VC_INBOX_QUEUE_PREFETCH;
      if (!pf || !pf.promise) return null;
      if (String(pf.tab || "") !== String(requestedTab || "")) return null;
      if (String(pf.scope || "pending") !== String(requestedScope || "pending")) return null;
      if (Number(requestedPage || 1) !== Number(pf.page || 1)) return null;
      if (Date.now() - Number(pf.at || 0) > 120000) return null;
      var settled = Promise.resolve(pf.promise).then(function (out) {
        if (!out || !out.res) return null;
        if (isStaleEmptyAppealPrefetch(out, requestedTab, requestedScope)) return null;
        try {
          window.__VC_INBOX_QUEUE_PREFETCH = null;
        } catch (eClr) {}
        return out;
      });
            var timedOut = new Promise(function (resolve) {
        window.setTimeout(function () {
          resolve(null);
        }, PREFETCH_CONSUME_MAX_MS);
      });
      return Promise.race([settled, timedOut]).then(function (out) {
        if (!out) {
          try {
            window.__VC_INBOX_QUEUE_PREFETCH = null;
          } catch (eDrop) {}
        }
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
      persistSummaryCache();
      renderTabs();
    }
  }

  function schedulePendingListRetry() {
    if (pendingListRetryTimer || !isStaffScopeActive()) return;
    if (inboxLoadBusy()) return;
    // Allow retry even late in boot when badge says items exist but list is empty.
    if (bootLoadSeq && seqMatchesBootStillLoading()) return;
    if (pendingListRetryCount >= PENDING_LIST_RETRY_MAX) {
      reconcileStalePendingSummary();
      finishQueueLoad(loadSeq, { force: true });
      return;
    }
    pendingListRetryTimer = window.setTimeout(function () {
      pendingListRetryTimer = null;
      if (!listEmptyDespitePending() || inboxLoadBusy()) return;
      pendingListRetryCount += 1;
      loadQueue({
        soft: false,
        _internal: true,
        sync: true,
        _emptyRetry: true,
        _userIntent: true,
      }).catch(function () {});
    }, 450);
  }

  function seqMatchesBootStillLoading() {
    return Boolean(bootLoadSeq && loadInFlightNonQuiet && bootLoadSeq === loadSeq);
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
      initialQueueLoaded = true;
      try {
        renderTabs();
        renderScopeToggle();
        renderQueueFilters();
        renderWeekNav();
      } catch (eChrome) {}
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
      readPendingFocusFromUrl();
      if (pendingFocusItemId && state.scope !== "all") state.scope = "pending";
    } catch (eUrl) {
      state.tab = currentTab();
      state.scope = currentScope();
      readPendingFocusFromUrl();
    }
    ensureAccessibleTab();
  }

  function syncUrlState() {
    try {
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
    var delay = 8000;
    try {
      if (typeof window.__vcWebhookGlobalBlockedUntil === "function") {
        var until = Number(window.__vcWebhookGlobalBlockedUntil() || 0);
        if (Date.now() < until) delay = Math.max(delay, until - Date.now() + 1500);
      }
    } catch (eDel) {}
    state.inboxWsReconnectTimer = setTimeout(function () {
      state.inboxWsReconnectTimer = null;
      connectInboxWebSocket();
    }, delay);
  }

  function connectInboxWebSocket() {
    if (typeof WebSocket === "undefined") return;
    var url = inboxRealtimeWsUrl();
    if (!url) return;
    /* consoleStormKill3: pausa WS se rate-limit attivo */
    try {
      if (typeof window.__vcWebhookGlobalBlockedUntil === "function") {
        var until = Number(window.__vcWebhookGlobalBlockedUntil() || 0);
        if (Date.now() < until) {
          scheduleInboxWsReconnect();
          return;
        }
      }
    } catch (eBlk) {}
    disconnectInboxWebSocket();
    try {
      var ws = new WebSocket(url);
      state.inboxWs = ws;
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || ""));
          if (!data) return;
          if (data.type === "staff_workflow_changed" || data.type === "staff_pauses_changed") {
            invalidateWorkflowCache();
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
    var prevDecidedName = String(prev.decidedByName || "").trim();
    var prevStatus = String(prev.status || "").trim().toLowerCase();
    var nextStatus = String((row && row.status) || "").trim().toLowerCase();
    var statusChanged = Boolean(prevStatus && nextStatus && prevStatus !== nextStatus);
    state.detail = Object.assign({}, prev, row, {
      dedupeKey: row.dedupeKey || prev.dedupeKey || "",
      messageId: row.messageId || prev.messageId || "",
      channelId: row.channelId || prev.channelId || "",
      body: row.body || prev.body || "",
      content: row.content || prev.content || "",
      fields: Array.isArray(prev.fields) && prev.fields.length ? prev.fields : row.fields,
      decidedBy: preferNonEmptyText(row.decidedBy, prev.decidedBy) || null,
      decidedByName: preferNonEmptyText(row.decidedByName, prev.decidedByName) || null,
      decidedAt: row.decidedAt || prev.decidedAt || null,
    });
    renderList();
    var nextDecidedName = String((state.detail && state.detail.decidedByName) || "").trim();
    /* inboxSheetFlashFix1: soft poll must not remount open sheet (mobile flash loop). */
    if (!shouldRemountDetailForSoftSync(row, { statusChanged: statusChanged })) {
      patchSheetStatusInDom(state.detail);
      if (nextDecidedName && nextDecidedName !== prevDecidedName) {
        if (!patchDecisionMetaInDom(state.detail)) {
          /* keep sheet; meta patch failed is non-fatal on soft sync */
          patchDecisionMetaInDom(state.detail);
        }
      } else {
        patchDecisionMetaInDom(state.detail);
      }
      return;
    }
    renderDetail();
  }

  function isWorkflowSheetOpen() {
    try {
      var sheet = document.getElementById("vc-staff-reso-sheet");
      if (!sheet || sheet.hidden || sheet.hasAttribute("hidden")) return false;
      return sheet.classList.contains("is-in");
    } catch (eOpen) {
      return false;
    }
  }

  function shouldRemountDetailForSoftSync(row, opts) {
    opts = opts || {};
    if (!state.selectedKey || !state.detail) return true;
    if (!row) return true;
    // Status flip (pending→done) needs one remount so actions/foot update.
    if (opts.statusChanged) return true;
    // Sheet already open for this item: patch only — full remount flashes on mobile.
    if (usesWorkflowSheet() && isWorkflowSheetOpen()) return false;
    try {
      if (document.getElementById("vc-wfc-root") && window.VcWorkflowChat) {
        return false;
      }
    } catch (eRoot) {}
    return true;
  }

  function patchSheetStatusInDom(item) {
    if (!item) return false;
    var el = document.querySelector(
      "#vc-staff-reso-sheet .vc-staff-reso-hero__status, #vc-staff-reso-sheet .vc-staff-inbox-status",
    );
    if (!el) return false;
    var cls = "vc-staff-inbox-status vc-staff-reso-hero__status " + statusClass(item);
    el.className = cls;
    el.textContent = statusLabel(item);
    return true;
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
      /* inboxClickOpen2: non chiudere lo sheet se un refresh ha perso temporaneamente la riga */
      try {
        if (isWorkflowSheetOpen() && Date.now() - inboxSheetOpenedAt < 12000) return;
      } catch (eKeep) {}
      clearDetailState();
    }
  }

  function scheduleInboxRefreshFromRealtime(opts) {
    opts = opts || {};
        if (!initialQueueLoaded || loadInFlightNonQuiet) {
      inboxRealtimeRefreshPending = true;
      return;
    }
    if (state.inboxRefreshTimer) clearTimeout(state.inboxRefreshTimer);
    state.inboxRefreshTimer = setTimeout(function () {
      state.inboxRefreshTimer = null;
      if (loadInFlightNonQuiet) {
        inboxRealtimeRefreshPending = true;
        return;
      }
      inboxRealtimeRefreshPending = false;
      /* inboxLiveDecisionFix1: bypass GET cache on live decision refresh */
      loadQueue({ quiet: true, sync: Boolean(opts.sync), _realtime: true, cache: false }).then(function () {
        loadSummary({ cache: false }).catch(function () {});
        syncDetailWithList();
      });
    }, opts.immediate ? 80 : 320);
  }

  function scheduleInboxSoftRefresh() {
    if (state.inboxSoftRefreshTimer) clearTimeout(state.inboxSoftRefreshTimer);
    state.inboxSoftRefreshTimer = setTimeout(function () {
      state.inboxSoftRefreshTimer = null;
      loadQueue({ quiet: true, _realtime: true, cache: false }).catch(function () {});
      loadSummary({ cache: false }).catch(function () {});
    }, 450);
  }

  function invalidateWorkflowCache() {
    try {
      if (window.VcApiCache && typeof window.VcApiCache.invalidateContains === "function") {
        window.VcApiCache.invalidateContains("site-staff-workflows");
      }
    } catch (eInv) {}
  }

  function ensureInboxPoll() {
    if (inboxPollTimer) return;
    inboxPollTimer = window.setInterval(function () {
      try {
        if (document.hidden) return;
        if (isInboxEmbed() && !isStaffScopeActive()) return;
        if (!initialQueueLoaded || loadInFlightNonQuiet) return;
        scheduleInboxRefreshFromRealtime({ immediate: true });
      } catch (ePoll) {}
    }, 8000);
  }

  function decisionStoreKey(patchOrItem) {
    if (!patchOrItem) return "";
    var mid = String(patchOrItem.messageId || "").trim();
    if (mid) return "msg:" + mid;
    var uid = String(patchOrItem.userId || "").trim();
    var pid = String(patchOrItem.id || patchOrItem.pauseId || "").trim();
    if (uid && pid) return "pause:" + uid + ":" + pid;
    var k = String(itemKey(patchOrItem) || "").trim();
    return k ? "k:" + k : "";
  }

  function rememberLocalDecision(patch) {
    if (!patch) return;
    var key = decisionStoreKey(patch);
    if (!key) return;
    if (!state.localDecisions) state.localDecisions = {};
    state.localDecisions[key] = { at: Date.now(), patch: patch };
  }

  function mergeIncomingWorkflowItems(incoming) {
    var local = state.localDecisions || {};
    var out = [];
    (incoming || []).forEach(function (it) {
      if (!it) return;
      var key = decisionStoreKey(it);
      var memo = key ? local[key] : null;
      if (memo && Date.now() - memo.at > 180000) {
        delete local[key];
        memo = null;
      }
      var serverStatus = String(it.status || "").toLowerCase() || "pending";
      if (memo) {
        var localStatus = String(memo.patch.status || "").toLowerCase() || "pending";
        var localDecided = localStatus !== "pending";
        if (serverStatus === "pending" && localDecided) {
                    if (state.scope === "pending") return;
          out.push(
            Object.assign({}, it, memo.patch, {
              body: memo.patch.body || memo.patch.content || it.body || "",
              content: memo.patch.content || memo.patch.body || it.content || "",
              preview: memo.patch.preview || it.preview || "",
            }),
          );
          return;
        }
        if (serverStatus !== "pending") delete local[key];
      }
      if (state.scope === "pending" && serverStatus !== "pending") return;
      out.push(it);
    });
    return out;
  }

  function itemWithLocalDecision(item) {
    if (!item) return item;
    var key = decisionStoreKey(item);
    if (!key || !state.localDecisions) return item;
    var memo = state.localDecisions[key];
    if (!memo) return item;
    if (Date.now() - memo.at > 180000) {
      delete state.localDecisions[key];
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
    if (!serverPending) delete state.localDecisions[key];
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
    var actedKey = state.selectedKey || "";
    var patch = optimisticWorkflowPatch(body, out);
    if (patch) {
      if (state.detail && String(patch.messageId || "") === String(state.detail.messageId || actedKey || "")) {
        patch.body = patch.body || patch.content || state.detail.body || state.detail.content || "";
        patch.content = patch.content || patch.body || state.detail.content || state.detail.body || "";
      }
      rememberLocalDecision(patch);
      mergeWorkflowItemIntoList(patch);
    }
    if (
      patch &&
      String(patch.status || "").toLowerCase() !== "pending"
    ) {
      if (state.scope === "pending" && actedKey) {
      state.items = state.items.filter(function (it) {
          return itemKey(it) !== actedKey;
        });
      }
    }
    /* inboxClickOpen10f: chiudi PRIMA di qualsiasi remount (renderDetail+rAF riapriva lo sheet) */
    closeDetail({ force: true });
    try {
      cancelInboxSheetOpenRaf();
      closeResoSheet(true, { force: true });
    } catch (eForceClose) {}
    try {
      renderList({ force: true });
        renderTabs();
      } catch (eRtList) {}
    bumpSummaryAfterAction(body);
    T.hideStaffToast();
    inboxNotify(
      (out && out.data && out.data.message) ||
        (isStaleWorkflowAction(out) ? "Voce già gestita." : "Fatto."),
      false,
    );
    teardownChat();
    invalidateWorkflowCache();
    /* refresh lista subito dopo decisione (senza rimontare lo sheet) */
    scheduleInboxSoftRefresh();
        scheduleInboxRefreshFromRealtime({ immediate: true });
  }
  try {
    window.__vcStaffInboxApplyActionResult = applyActionResult;
  } catch (eProbeHook) {}

  function resocontoCardAction(item) {
    item = itemWithLocalDecision(item);
    if (!item) return "";
    var st = String(item.status || "pending").toLowerCase();
    if (st === "pending" || st === "cancelled") {
      return (
        (item.proposedLabel && String(item.proposedLabel)) ||
        resocontoProposedLabel(item) ||
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
      decidedBy: preferNonEmptyText(itemPatch.decidedBy, prev.decidedBy) || null,
      decidedByName: preferNonEmptyText(itemPatch.decidedByName, prev.decidedByName) || null,
      decidedAt: itemPatch.decidedAt || prev.decidedAt || null,
    });
    if (state.selectedKey && itemKey(state.items[idx]) === state.selectedKey) {
      var prevDetail = state.detail || {};
      var prevDecidedName = String(prevDetail.decidedByName || "").trim();
      state.detail = Object.assign({}, prevDetail, state.items[idx], {
        decidedBy: preferNonEmptyText(state.items[idx].decidedBy, prevDetail.decidedBy) || null,
        decidedByName:
          preferNonEmptyText(state.items[idx].decidedByName, prevDetail.decidedByName) || null,
        decidedAt: state.items[idx].decidedAt || prevDetail.decidedAt || null,
      });
    renderList();
      var nextDecidedName = String((state.detail && state.detail.decidedByName) || "").trim();
      if (!shouldRemountDetailForSoftSync(state.items[idx])) {
        if (nextDecidedName !== prevDecidedName || state.items[idx].decidedAt) {
          if (!patchDecisionMetaInDom(state.detail)) renderDetail();
        }
        return;
      }
    renderDetail();
      return;
    }
    renderList();
    // Mai teardown della discussione su sync lista (post-decisione: canSend→false via status).
    if (!shouldRemountDetailForSoftSync(state.items[idx])) {
      return;
    }
    renderDetail();
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
    var q = String(tab || state.tab || "").trim().toLowerCase();
    if (q === "pause") {
      var uid = String(item.userId || "").trim();
      var pid = String(item.id || item.pauseId || "").trim();
      if (item.dedupeKey && String(item.dedupeKey).indexOf("pause:") === 0) {
        return String(item.dedupeKey);
      }
      return uid && pid ? "pause:" + uid + ":" + pid : "";
    }
    // Prefer messageId so list→detail remount keeps the same chat key.
    var mid = String(item.messageId || "").trim();
    if (mid && q) return q + ":" + mid;
    if (item.dedupeKey) return String(item.dedupeKey);
    var rid = String(item.recordId || item.id || "").trim();
    if (!rid || !q) return "";
    return q + ":" + rid;
  }

  function captureWorkflowChatDraft() {
    try {
      if (window.VcWorkflowChat && typeof window.VcWorkflowChat.captureDraft === "function") {
        window.VcWorkflowChat.captureDraft();
      }
    } catch (eCap) {}
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
      // inboxReadonly1: never force archive mode; pending → composer, closed → sola lettura.
      forceReadOnly: false,
      panelTitle: "Discussione",
      panelHint: "Emoji · @utenti · #canali · risposte · allegati",
      closedHint: "Pratica chiusa",
      closedMessage: "Chat in sola lettura: la pratica non è più in attesa.",
      emptyReadOnlyMessage: "Nessun messaggio in discussione.",
      notify: function (msg, isError) {
        inboxNotify(msg, isError);
      },
    });
  }

  function teardownChat() {
    try {
      if (bootChatForDetail._timer) {
        window.clearTimeout(bootChatForDetail._timer);
        bootChatForDetail._timer = 0;
      }
    } catch (eT) {}
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
    if (!window.VcWorkflowChat || !item) return;
    // inboxDetailChatRace1: leave a beat so detail fetch goes first (avoids 429 stampede).
    try {
      if (bootChatForDetail._timer) window.clearTimeout(bootChatForDetail._timer);
    } catch (eClr) {}
    var key = itemKey(item);
    bootChatForDetail._timer = window.setTimeout(function () {
      bootChatForDetail._timer = 0;
      if (state.selectedKey !== key) return;
      try {
        window.VcWorkflowChat.boot(item, state.tab);
      } catch (eBoot) {}
    }, 420);
  }

  try {
  initWorkflowChat();
  } catch (eInitChat) {}

  function inboxNotify(msg, isError, opts) {
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
            if (q === "staff" || q === "personal") q = "";
      if (
        TABS.some(function (t) {
          return t.id === q;
        })
      ) {
        return q;
      }
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

  function isPuntiToltiTab() {
    return String(state.tab || "") === "punti-tolti";
  }

  function ensurePuntiToltiModule() {
    if (window.VCStaffPuntiTolti && typeof window.VCStaffPuntiTolti.mount === "function") {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      var existing = document.querySelector('script[data-vc-staff-pt-js="1"]');
      if (existing) {
        var started = Date.now();
        (function tick() {
          if (window.VCStaffPuntiTolti && typeof window.VCStaffPuntiTolti.mount === "function") {
            resolve(true);
            return;
          }
          if (Date.now() - started > 8000) {
            resolve(false);
            return;
          }
          setTimeout(tick, 40);
        })();
        return;
      }
      var s = document.createElement("script");
      s.src = "/js/staff-punti-tolti-page.js?v=20260918siteBatchFix3";
      s.async = true;
      s.setAttribute("data-vc-staff-pt-js", "1");
      s.onload = function () {
        resolve(Boolean(window.VCStaffPuntiTolti && window.VCStaffPuntiTolti.mount));
      };
      s.onerror = function () {
        resolve(false);
      };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function syncPuntiToltiMode() {
    var list = T.byId("vc-staff-inbox-list");
    var detail = T.byId("vc-staff-inbox-detail");
    var filters = T.byId("vc-staff-inbox-filters");
    var scopeEl = T.byId("vc-staff-inbox-scope");
    var week = T.byId("vc-staff-inbox-week");
    var pag = T.byId("vc-staff-inbox-pagination");
    var filterWrap =
      (scopeEl && scopeEl.parentElement) ||
      (filters && filters.parentElement) ||
      null;
    if (!isPuntiToltiTab()) {
      if (window.VCStaffPuntiTolti && typeof window.VCStaffPuntiTolti.unmount === "function") {
        try {
          window.VCStaffPuntiTolti.unmount();
        } catch (eUm) {}
      }
      if (list) list.classList.remove("vc-staff-pt-inbox-host", "is-loading");
      if (filterWrap) {
        filterWrap.hidden = false;
        filterWrap.removeAttribute("hidden");
      }
      if (filters) filters.hidden = false;
      if (scopeEl) scopeEl.hidden = false;
      return Promise.resolve(false);
    }
    if (detail) {
      detail.hidden = true;
      detail.innerHTML = "";
    }
        if (filterWrap) {
      filterWrap.hidden = false;
      filterWrap.removeAttribute("hidden");
      filterWrap.classList.add("vc-staff-inbox-board-toolbar");
    }
    if (filters) {
      filters.hidden = true;
      filters.innerHTML = "";
    }
    if (scopeEl) {
      scopeEl.hidden = false;
      scopeEl.removeAttribute("hidden");
    }
    if (week) {
      week.hidden = true;
      week.innerHTML = "";
    }
    if (pag) pag.hidden = true;
    if (list) {
      list.hidden = false;
      list.classList.remove("is-loading");
      list.classList.add("vc-staff-pt-inbox-host");
      list.removeAttribute("aria-busy");
    }
    return ensurePuntiToltiModule().then(function (ok) {
      if (!ok || !list) {
        if (list) {
          list.innerHTML =
            '<div class="vc-staff-inbox-empty"><p>Impossibile caricare Punti tolti. Ricarica la pagina.</p></div>';
        }
        return false;
      }
      try {
        window.VCStaffPuntiTolti.mount(list);
      } catch (eMount) {
        return false;
      }
      try {
        renderScopeToggle();
        renderTabs();
      } catch (eChrome) {}
      return true;
    });
  }

  function clearInboxPointerBlockers() {
    unlockInboxPageChrome();
  }

  function beginUserQueueSwitch(kind, value) {
    clearInboxPointerBlockers();
    /* inboxTabPaint1: switch utente = drop focus deep-link + sblocca empty cache tab */
    try {
      pendingFocusConsumed = true;
      pendingFocusItemId = "";
      pendingFocusRetryUntil = 0;
      window.clearTimeout(pendingFocusRetryTimer);
      clearPendingFocusFromUrl();
    } catch (eFocus) {}
    try {
      if (kind === "tab" && value) delete emptyLoadedTabs[String(value)];
      else if (kind === "tab") delete emptyLoadedTabs[state.tab];
    } catch (eEmpty) {}
  }

  /* inboxClickOpen10d: switch tab/scope DEVE chiudere lo sheet (altrimenti heartbeat lo tiene sopra la lista) */
  function dismissSheetForQueueSwitch() {
    try {
      window.clearInterval(window.__vcInboxSheetUnlockBeat);
      window.__vcInboxSheetUnlockBeat = 0;
    } catch (eHb) {}
    try {
      window.clearInterval(window.__vcInboxOpenKeepAlive);
      window.__vcInboxOpenKeepAlive = 0;
    } catch (eKa) {}
    inboxSheetOpenedAt = 0;
    try {
    teardownChat();
    } catch (eChat) {}
    state.detail = null;
    state.selectedKey = "";
    state.detailLoading = false;
    state.detailError = "";
    try {
      closeResoSheet(true, { force: true });
    } catch (eClose) {}
    try {
      var layout = T.byId("vc-staff-inbox");
      if (layout) layout.classList.remove("has-detail");
    } catch (eLay) {}
  }

  function setTab(tab) {
    beginUserQueueSwitch("tab", tab);
    state.tab = tab;
    dismissSheetForQueueSwitch();
    state.page = 1;
    state.filter = "";
    state.week = "";
    state.weeks = [];
    state.items = [];
    state.pagination = null;
    lastInboxListPaintSig = "";
    syncUrlState();
    showInboxLoading("skeleton");
    loadQueue({ soft: false, _userIntent: true, _scopeSwitch: true, cache: false });
  }
  try {
    window.__vcStaffInboxSetTab = setTab;
    window.__vcDismissSheetForQueueSwitch = dismissSheetForQueueSwitch;
  } catch (eTabExp) {}

  function setScope(scope) {
    beginUserQueueSwitch("scope");
    state.scope = scope === "pending" ? "pending" : "all";
    dismissSheetForQueueSwitch();
    state.page = 1;
    state.items = [];
    state.pagination = null;
    lastInboxListPaintSig = "";
    syncUrlState();
    showInboxLoading("skeleton");
    loadQueue({ soft: false, _userIntent: true, _scopeSwitch: true, cache: false });
  }

  function setFilter(filterId) {
    beginUserQueueSwitch("filter");
    state.filter = String(filterId || "").trim().toLowerCase();
    dismissSheetForQueueSwitch();
    state.page = 1;
    state.items = [];
    state.pagination = null;
    lastInboxListPaintSig = "";
    syncUrlState();
    showInboxLoading("skeleton");
    loadQueue({ soft: false, _userIntent: true, _scopeSwitch: true, cache: false });
  }

  function setWeek(weekKey) {
    state.week = String(weekKey || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(state.week)) state.week = "";
    dismissSheetForQueueSwitch();
    state.page = 1;
    state.items = [];
    state.pagination = null;
    syncUrlState();
    showInboxLoading("skeleton");
    loadQueue({ soft: false, _userIntent: true, _scopeSwitch: true });
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

  /* inboxTabHintKill1: niente sottotitoli sotto le tab inbox */
  function inboxFilterHint() {
    return "";
  }

  function inboxFilterWrap() {
    var scope = T.byId("vc-staff-inbox-scope");
    var filters = T.byId("vc-staff-inbox-filters");
    return (scope && scope.parentElement) || (filters && filters.parentElement) || null;
  }

  function syncInboxFilterHint() {
    var wrap = inboxFilterWrap();
    if (!wrap) return;
    wrap.classList.add("vc-staff-inbox-board-toolbar");
    wrap.querySelectorAll(".vc-staff-inbox-board-toolbar__hint").forEach(function (el) {
      el.remove();
    });
  }

  function renderQueueFilters() {
    var root = T.byId("vc-staff-inbox-filters");
    if (!root) return;
    if (isPuntiToltiTab()) {
      root.hidden = true;
      root.innerHTML = "";
      syncInboxFilterHint();
      return;
    }
    var options = QUEUE_FILTERS[state.tab] || [];
    if (!options.length) {
      root.innerHTML = "";
      root.hidden = true;
      syncInboxFilterHint();
      return;
    }
    root.hidden = false;
    root.className = "vc-staff-inbox-filter-group vc-staff-inbox-filter-group--board";
    root.innerHTML =
      '<div class="vc-staff-pt-seg" role="group" aria-label="' +
      T.esc(queueFilterGroupLabel()) +
      '">' +
      options
        .map(function (opt) {
          var active = String(state.filter || "") === String(opt.id || "");
          return (
            '<button type="button" class="vc-staff-pt-seg__btn' +
            (active ? " is-active" : "") +
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
    syncInboxFilterHint();
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
    var page = Math.max(1, Number(p.page) || state.page || 1);
    var totalPages = Math.max(1, Number(p.totalPages) || 1);
    var total = Math.max(0, Number(p.total) || 0);
    if (!total && !(state.items && state.items.length)) return "";
    if (totalPages <= 1) return "";

    function pageBtn(n, active) {
    return (
        '<button type="button" class="vc-staff-pt-seg__btn' +
        (active ? " is-active" : "") +
        '" data-page="' +
        n +
        '" aria-label="Pagina ' +
        n +
        '"' +
        (active ? ' aria-current="page"' : "") +
        ">" +
        n +
        "</button>"
      );
    }

    function gap() {
      return '<span class="vc-staff-pt-seg__btn vc-staff-inbox-pagination__gap" aria-hidden="true">\u2026</span>';
    }

    // Finestra numeri tipo switcher (mai "1 / 8" come label unica).
    var nums = [];
    var windowSize = 5;
    if (totalPages <= windowSize + 2) {
      for (var i = 1; i <= totalPages; i += 1) nums.push(i);
    } else {
      var half = Math.floor(windowSize / 2);
      var start = Math.max(2, page - half);
      var end = Math.min(totalPages - 1, page + half);
      if (page - half < 2) end = Math.min(totalPages - 1, windowSize + 1);
      if (page + half > totalPages - 1) start = Math.max(2, totalPages - windowSize);
      nums.push(1);
      if (start > 2) nums.push("…");
      for (var j = start; j <= end; j += 1) nums.push(j);
      if (end < totalPages - 1) nums.push("…");
      nums.push(totalPages);
    }

    var pagesHtml =
      '<button type="button" class="vc-staff-pt-seg__btn vc-staff-inbox-pagination__navbtn" data-page="prev"' +
      (page <= 1 ? " disabled" : "") +
      ' aria-label="Pagina precedente">\u2190</button>';
    nums.forEach(function (n) {
      if (n === "…") pagesHtml += gap();
      else pagesHtml += pageBtn(n, n === page);
    });
    pagesHtml +=
      '<button type="button" class="vc-staff-pt-seg__btn vc-staff-inbox-pagination__navbtn" data-page="next"' +
      (page >= totalPages ? " disabled" : "") +
      ' aria-label="Pagina successiva">\u2192</button>';

    return (
      '<div class="vc-staff-inbox-pagination__row">' +
      '<div class="vc-staff-pt-seg vc-staff-inbox-pagination__seg" role="navigation" aria-label="Pagine elenco (' +
      T.esc(String(total)) +
      ' voci)">' +
      pagesHtml +
      "</div></div>"
    );
  }

  function wirePaginationRoot(root, page) {
    if (!root) return;
    root.querySelectorAll("[data-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var dir = btn.getAttribute("data-page");
        var next = page;
        if (dir === "prev") next = page - 1;
        else if (dir === "next") next = page + 1;
        else {
          var n = Number(dir);
          if (Number.isFinite(n) && n >= 1) next = n;
        }
        if (next === page) return;
        setPage(next);
        /* scrollStayAll1: no scrollIntoView */
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
    return "vc-staff-pt-seg__btn" + (active ? " is-active" : "");
  }

  function renderScopeToggle() {
    var root = T.byId("vc-staff-inbox-scope");
    if (!root) return;
    var wrap = inboxFilterWrap();
    if (wrap) {
      wrap.hidden = false;
      wrap.removeAttribute("hidden");
      wrap.classList.add("vc-staff-inbox-board-toolbar");
    }
    if (isPuntiToltiTab()) {
      var pendingOnly = false;
      try {
        if (window.VCStaffPuntiTolti && typeof window.VCStaffPuntiTolti.isPendingOnly === "function") {
          pendingOnly = Boolean(window.VCStaffPuntiTolti.isPendingOnly());
        }
      } catch (ePt) {}
      root.hidden = false;
      root.removeAttribute("hidden");
      root.className = "vc-staff-inbox-filter-group vc-staff-inbox-filter-group--board";
      root.innerHTML =
        '<div class="vc-staff-pt-seg" role="group" aria-label="Filtro elenco">' +
        '<button type="button" class="' +
        filterBtnClass(!pendingOnly) +
        '" data-pt-scope="all">Tutti</button>' +
        '<button type="button" class="' +
        filterBtnClass(pendingOnly) +
        '" data-pt-scope="pending">In attesa</button>' +
        "</div>";
      root.querySelectorAll("[data-pt-scope]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var next = btn.getAttribute("data-pt-scope") === "pending";
          try {
            if (window.VCStaffPuntiTolti && typeof window.VCStaffPuntiTolti.setPendingOnly === "function") {
              window.VCStaffPuntiTolti.setPendingOnly(next);
            }
          } catch (eSet) {}
          renderScopeToggle();
        });
      });
      syncInboxFilterHint();
      return;
    }
    root.hidden = false;
    root.className = "vc-staff-inbox-filter-group vc-staff-inbox-filter-group--board";
    root.innerHTML =
      '<div class="vc-staff-pt-seg" role="group" aria-label="Filtro stato">' +
      '<button type="button" class="' +
      filterBtnClass(state.scope === "all") +
      '" data-scope="all">Tutti</button>' +
      '<button type="button" class="' +
      filterBtnClass(state.scope === "pending") +
      '" data-scope="pending">In attesa</button>' +
      "</div>";
    root.querySelectorAll("[data-scope]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setScope(btn.getAttribute("data-scope"));
        renderScopeToggle();
        renderQueueFilters();
      });
    });
    syncInboxFilterHint();
  }

  try {
    window.__vcRenderStaffInboxScope = renderScopeToggle;
  } catch (eScopeHook) {}

  function renderTabs() {
    var root = T.byId("vc-staff-inbox-tabs");
    if (!root) return;
    var embed = isInboxEmbed();
    if (embed) {
      root.className = "vc-staff-inbox-filter-group vc-staff-inbox-filter-group--board";
      root.hidden = false;
      root.removeAttribute("hidden");
    } else {
      root.className = "vc-staff-tools-tabs";
    }
    /* inboxPhoneTabs1: solo code attive (candidature/appelli) — no pause/resoconti/punti */
    var buttons = TABS.filter(function (t) {
      return canAccessTab(t.id) && (t.id === "candidature" || t.id === "appelli");
    })
      .map(function (t) {
        var count = state.summary && state.summary[t.id] != null ? Number(state.summary[t.id]) : 0;
        var active = state.tab === t.id;
        var btnClass = embed
          ? filterBtnClass(active)
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
      })
      .join("");
    root.innerHTML = embed
      ? '<div class="vc-staff-pt-seg" role="tablist" aria-label="Sezioni inbox">' + buttons + "</div>"
      : buttons;
    /* inboxTabPaint1: solo delegation (niente doppio setTab per-bottone) */
  }

  /* inboxTabClick1 / inboxClickOpen10d: un solo listener document; handler sostituibile a ogni load */
  function onChromeActivate(ev) {
    try {
      var t = ev && ev.target;
      if (!t || !t.closest) return;
      var host = t.closest("#vc-staff-inbox, .vc-notif-staff-inbox, #vc-staff-inbox-unified");
      if (!host) return;
      var tabBtn = t.closest("[data-tab]");
      if (tabBtn && host.contains(tabBtn)) {
        var tabId = tabBtn.getAttribute("data-tab");
        if (!tabId) return;
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e1) {}
        if (tabId === state.tab) {
          beginUserQueueSwitch("tab", tabId);
          dismissSheetForQueueSwitch();
          state.items = [];
          state.pagination = null;
          lastInboxListPaintSig = "";
          showInboxLoading("skeleton");
          loadQueue({ soft: false, _userIntent: true, _scopeSwitch: true, cache: false });
          return;
        }
        setTab(tabId);
        return;
      }
      var scopeBtn = t.closest("[data-scope]");
      if (scopeBtn && host.contains(scopeBtn)) {
        var sc = scopeBtn.getAttribute("data-scope");
        if (!sc) return;
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e2) {}
        if (sc === state.scope) {
          beginUserQueueSwitch("scope");
          dismissSheetForQueueSwitch();
          state.items = [];
          lastInboxListPaintSig = "";
          showInboxLoading("skeleton");
          loadQueue({ soft: false, _userIntent: true, _scopeSwitch: true, cache: false });
          return;
        }
        setScope(sc);
        return;
      }
      var ptBtn = t.closest("[data-pt-scope]");
      if (ptBtn && host.contains(ptBtn)) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e3) {}
        var next = ptBtn.getAttribute("data-pt-scope") === "pending";
        try {
          if (window.VCStaffPuntiTolti && typeof window.VCStaffPuntiTolti.setPendingOnly === "function") {
            window.VCStaffPuntiTolti.setPendingOnly(next);
          }
        } catch (eSet) {}
        renderScopeToggle();
        return;
      }
      var filterBtn = t.closest("[data-filter]");
      if (filterBtn && host.contains(filterBtn)) {
        var fid = filterBtn.getAttribute("data-filter") || "";
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e4) {}
        if (String(fid) === String(state.filter || "")) {
          beginUserQueueSwitch("filter");
          dismissSheetForQueueSwitch();
          state.items = [];
          lastInboxListPaintSig = "";
          showInboxLoading("skeleton");
          loadQueue({ soft: false, _userIntent: true, _scopeSwitch: true, cache: false });
          return;
        }
        setFilter(fid);
      }
    } catch (eAct) {}
  }
  function wireInboxChromeDelegation() {
    try {
      window.__vcInboxChromeActivate = onChromeActivate;
    } catch (eExp) {}
    if (window.__vcInboxChromeClickWired === "inboxClickOpen10d") return;
    window.__vcInboxChromeClickWired = "inboxClickOpen10d";
    document.addEventListener(
      "click",
      function (ev) {
        try {
          if (typeof window.__vcInboxChromeActivate === "function") window.__vcInboxChromeActivate(ev);
        } catch (eDel) {}
      },
      true,
    );
  }
  try {
    wireInboxChromeDelegation();
  } catch (eWireChrome) {}

  /* inboxClickOpen10: unlock + document capture per act/X (sheet listener poteva restare orphan) */
  var INBOX_SHEET_OPEN_GUARD_MS = 500;
  var INBOX_SHEET_Z = "121050";
  var inboxCardOpenDedupeKey = "";
  var inboxCardOpenDedupeAt = 0;
  function disarmSheetCloseGuard() {
    try {
      window.__vcSheetCloseGuardUntil = 0;
    } catch (e0) {}
    try {
      /* solo se arm supporta disarm reale (n===0 → until=0), altrimenti riarmerebbe */
      var armFn = window.__vcArmSheetCloseGuard;
      if (typeof armFn === "function" && window.__vcSheetGhostCloseWired === "inboxClickOpen10") {
        armFn(0);
      }
    } catch (e1) {}
  }

  function sheetOpenGuardActive() {
    return Date.now() - inboxSheetOpenedAt < INBOX_SHEET_OPEN_GUARD_MS;
  }

  function ensureSheetForceVisibleCss() {
    try {
      [
        "vc-inbox-sheet-force-open5",
        "vc-inbox-sheet-force-open6",
        "vc-inbox-sheet-force-open7",
        "vc-inbox-sheet-force-open8",
        "vc-inbox-sheet-force-open8b",
      ].forEach(function (oldId) {
        var old = document.getElementById(oldId);
        if (old && old.parentNode) old.parentNode.removeChild(old);
      });
      var id = "vc-inbox-sheet-force-open10";
      var st = document.getElementById(id);
      if (!st) {
        st = document.createElement("style");
        st.id = id;
        (document.head || document.documentElement).appendChild(st);
      }
      /* sheetUnlock1: stesso sblocco per reso + stat/manage/feedback */
      st.textContent =
        "html.vc-staff-reso-sheet-open,html.vc-staff-stat-sheet-open,html.vc-staff-manage-sheet-open,html.vc-feedback-sheet-open," +
        "html.vc-staff-reso-sheet-open body,html.vc-staff-stat-sheet-open body,html.vc-staff-manage-sheet-open body,html.vc-feedback-sheet-open body{" +
        "pointer-events:auto!important;touch-action:manipulation!important;cursor:auto!important}" +
        "html.vc-staff-reso-sheet-open #vc-staff-reso-sheet," +
        "#vc-staff-reso-sheet.is-in:not([hidden]){" +
        "display:grid!important;visibility:visible!important;opacity:1!important;" +
        "pointer-events:auto!important;touch-action:manipulation!important;z-index:" +
        INBOX_SHEET_Z +
        "!important;position:fixed!important;" +
        "inset:0!important;transform:none!important;place-items:end center!important}" +
        "html.vc-staff-reso-sheet-open #vc-staff-reso-sheet .vc-staff-reso-sheet__panel," +
        "#vc-staff-reso-sheet.is-in .vc-staff-reso-sheet__panel{" +
        "opacity:1!important;visibility:visible!important;transform:none!important;" +
        "display:flex!important;pointer-events:auto!important;touch-action:manipulation!important;" +
        "max-height:min(94dvh,58rem)!important}" +
        "html.vc-staff-reso-sheet-open #vc-staff-reso-sheet .vc-staff-reso-sheet__panel *," +
        "#vc-staff-reso-sheet.is-in .vc-staff-reso-sheet__panel *," +
        "html.vc-staff-stat-sheet-open .vc-staff-stat-sheet," +
        "html.vc-staff-stat-sheet-open .vc-staff-stat-sheet *," +
        "html.vc-staff-manage-sheet-open .vc-staff-manage-sheet," +
        "html.vc-staff-manage-sheet-open .vc-staff-manage-sheet *," +
        "html.vc-feedback-sheet-open .vc-feedback-sheet," +
        "html.vc-feedback-sheet-open .vc-feedback-sheet *{" +
        "pointer-events:auto!important;touch-action:manipulation!important;cursor:auto!important}" +
        "html.vc-staff-reso-sheet-open #vc-staff-reso-sheet .vc-staff-reso-sheet__backdrop," +
        "#vc-staff-reso-sheet.is-in .vc-staff-reso-sheet__backdrop{" +
        "opacity:1!important;pointer-events:auto!important}" +
        "html.vc-staff-reso-sheet-open #vc-staff-inbox-loading," +
        "html.vc-staff-stat-sheet-open #vc-staff-inbox-loading," +
        "html.vc-staff-manage-sheet-open #vc-staff-inbox-loading," +
        "html.vc-feedback-sheet-open #vc-staff-inbox-loading," +
        "html.vc-staff-reso-sheet-open .vc-staff-loading," +
        "html.vc-staff-reso-sheet-open #vc-necessity-banner," +
        "html.vc-staff-stat-sheet-open #vc-necessity-banner," +
        "html.vc-staff-manage-sheet-open #vc-necessity-banner," +
        "html.vc-feedback-sheet-open #vc-necessity-banner," +
        "html.vc-staff-reso-sheet-open .vc-necessity-banner," +
        "html.vc-staff-reso-sheet-open #vc-cine-boot-curtain," +
        "html.vc-staff-stat-sheet-open #vc-cine-boot-curtain," +
        "html.vc-staff-manage-sheet-open #vc-cine-boot-curtain," +
        "html.vc-feedback-sheet-open #vc-cine-boot-curtain," +
        "html.vc-staff-reso-sheet-open #vc-shared-boot-overlay," +
        "html.vc-staff-stat-sheet-open #vc-shared-boot-overlay," +
        "html.vc-staff-manage-sheet-open #vc-shared-boot-overlay," +
        "html.vc-feedback-sheet-open #vc-shared-boot-overlay," +
        "html.vc-staff-reso-sheet-open .vc-session-verify-overlay," +
        "html.vc-staff-stat-sheet-open .vc-session-verify-overlay," +
        "html.vc-staff-manage-sheet-open .vc-session-verify-overlay," +
        "html.vc-feedback-sheet-open .vc-session-verify-overlay{" +
        "display:none!important;visibility:hidden!important;opacity:0!important;" +
        "pointer-events:none!important}" +
        "html.vc-staff-reso-sheet-open .vc-dialog," +
        "html.vc-staff-stat-sheet-open .vc-dialog," +
        "html.vc-staff-manage-sheet-open .vc-dialog," +
        "html.vc-feedback-sheet-open .vc-dialog," +
        "html.vc-staff-reso-sheet-open .vc-dash-confirm," +
        "html.vc-staff-reso-sheet-open #vc-site-dialog{" +
        "z-index:130000!important;pointer-events:auto!important}";
    } catch (eCss) {}
  }

  function unlockSheetInteractions() {
    try {
      document.documentElement.classList.remove(
        "vc-interaction-hold",
        "vc-notif-staff-loading",
        "vc-notif-early-staff",
        "vc-loading-scroll-lock",
        "vc-loader-blocking-live",
        "vc-scroll-soft-lock",
        "vc-page-cine-boot",
      );
      document.documentElement.classList.add("vc-soft-fx-ready", "vc-page-cine-ready");
      window.__VC_INBOX_FS_GATE_HOLD = false;
      window.__VC_NOTIF_EARLY_STAFF = false;
    } catch (eCls) {}
    try {
      document.documentElement.style.setProperty("pointer-events", "auto", "important");
      document.documentElement.style.setProperty("touch-action", "manipulation", "important");
      if (document.body) {
        document.body.style.setProperty("pointer-events", "auto", "important");
        document.body.style.setProperty("touch-action", "manipulation", "important");
        document.body.style.setProperty("cursor", "auto", "important");
      }
    } catch (ePe) {}
    try {
      /* inboxClickOpen10: NON chiamare arm(0) — su vc-landing-notif vecchio arm(0)=arm(520)
         e lo swallow mangia TUTTI i click; l'heartbeat lo riarmava per sempre. */
      window.__vcSheetCloseGuardUntil = 0;
    } catch (eG) {}
    try {
      var ban = document.getElementById("vc-necessity-banner");
      if (ban) {
        ban.style.setProperty("display", "none", "important");
        ban.style.setProperty("pointer-events", "none", "important");
        ban.style.setProperty("visibility", "hidden", "important");
        ban.setAttribute("aria-hidden", "true");
      }
    } catch (eBan) {}
    try {
      var load = document.getElementById("vc-staff-inbox-loading");
      if (load) {
        load.hidden = true;
        load.setAttribute("hidden", "");
        load.classList.add("vc-staff-loading--hidden");
        load.style.setProperty("pointer-events", "none", "important");
        load.style.setProperty("display", "none", "important");
      }
    } catch (eLoad) {}
    try {
      state.busy = false;
    } catch (eBusy) {}
    try {
      if (typeof window.__vcReleaseInteractionHold === "function") window.__vcReleaseInteractionHold();
    } catch (eRel) {}
    try {
      if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
    } catch (eUn) {}
  }

  function forceSheetInlineVisible(sheet) {
    if (!sheet) return;
    try {
      sheet.style.setProperty("display", "grid", "important");
      sheet.style.setProperty("visibility", "visible", "important");
      sheet.style.setProperty("opacity", "1", "important");
      sheet.style.setProperty("pointer-events", "auto", "important");
      sheet.style.setProperty("z-index", INBOX_SHEET_Z, "important");
      sheet.style.setProperty("position", "fixed", "important");
      sheet.style.setProperty("inset", "0", "important");
      sheet.style.setProperty("transform", "none", "important");
      var panel = sheet.querySelector(".vc-staff-reso-sheet__panel");
      if (panel) {
        panel.style.setProperty("opacity", "1", "important");
        panel.style.setProperty("visibility", "visible", "important");
        panel.style.setProperty("transform", "none", "important");
        panel.style.setProperty("display", "flex", "important");
        panel.style.setProperty("pointer-events", "auto", "important");
      }
      var bd = sheet.querySelector(".vc-staff-reso-sheet__backdrop");
      if (bd) bd.style.setProperty("opacity", "1", "important");
    } catch (eInline) {}
  }

  function armSheetOpenGuard(ms) {
    var hold = Number(ms) > 0 ? Number(ms) : INBOX_SHEET_OPEN_GUARD_MS;
    inboxSheetOpenedAt = Date.now();
    try {
      window.__vcInboxSheetOpenedAt = inboxSheetOpenedAt;
    } catch (eAt) {}
    /* inboxClickOpen8: niente keepAlive / is-open-guard pe:none (rompevano i tap) */
    try {
      window.clearInterval(window.__vcInboxOpenKeepAlive);
      window.__vcInboxOpenKeepAlive = 0;
    } catch (eKa) {}
    try {
      var sheet = document.getElementById("vc-staff-reso-sheet");
      if (sheet) sheet.classList.remove("is-open-guard");
    } catch (eG) {}
    void hold;
  }

  function syncTabForCardOpen() {
    /* inboxClickOpen5: boot/URL a volte lasciano tab=punti-tolti mentre la lista è workflow → zero sheet */
    try {
      var sp = new URLSearchParams(location.search || "");
      var inbox = String(sp.get("inbox") || "")
        .trim()
        .toLowerCase();
      if (
        inbox === "resoconti" ||
        inbox === "candidature" ||
        inbox === "appelli" ||
        inbox === "pause"
      ) {
        state.tab = inbox;
      }
    } catch (eUrl) {}
    if (!usesWorkflowSheet()) {
      var guess = "resoconti";
      try {
        var active = document.querySelector(
          "#vc-staff-inbox-tabs [data-tab].is-active, #vc-staff-inbox-tabs [data-tab][aria-selected='true']",
        );
        var tid = active && active.getAttribute("data-tab");
        if (
          tid === "resoconti" ||
          tid === "candidature" ||
          tid === "appelli" ||
          tid === "pause"
        ) {
          guess = tid;
        }
      } catch (eTab) {}
      state.tab = guess;
    }
  }

  function openInboxCardByKey(key, ev) {
    key = String(key || "");
    if (!key) return false;
    clearInboxPointerBlockers();
    disarmSheetCloseGuard();
    ensureSheetForceVisibleCss();
    syncTabForCardOpen();
    unlockSheetInteractions();
    var item = state.items.find(function (it) {
      return itemKey(it) === key;
    });
    if (!item) {
      item =
        state.tab === "pause"
          ? { id: key.split(":").slice(1).join(":") || key, userId: key.split(":")[0] || "" }
          : { messageId: key, recordId: key, id: key, displayName: "Resoconto" };
    }
    var sheetOpenNow = isWorkflowSheetOpen();
    if (
      sheetOpenNow &&
      state.selectedKey &&
      state.selectedKey === key &&
      (state.detail || state.detailLoading)
    ) {
      /* anti ghost: non chiudere entro guard dall'open */
      if (sheetOpenGuardActive()) return true;
      closeDetail();
      return true;
    }
    armSheetOpenGuard(INBOX_SHEET_OPEN_GUARD_MS);
    /* APRI SHEET SUBITO — prima di renderList/fetch */
    try {
      if (usesWorkflowSheet()) {
        openResoSheet();
        armSheetOpenGuard(INBOX_SHEET_OPEN_GUARD_MS);
        var bodyEarly = document.getElementById("vc-staff-reso-body");
        if (bodyEarly && !String(bodyEarly.innerHTML || "").trim()) {
          bodyEarly.innerHTML =
            '<div class="vc-staff-inbox-detail__loading">Apertura\u2026</div>';
        }
      }
    } catch (eEarly) {
      try {
        window.__vcInboxLastOpenErr = "earlySheet:" + (eEarly && eEarly.message ? eEarly.message : eEarly);
      } catch (e0) {}
    }
    try {
      openDetail(item);
      armSheetOpenGuard(INBOX_SHEET_OPEN_GUARD_MS);
    } catch (eOpen) {
      try {
        window.__vcInboxLastOpenErr = "openDetail:" + (eOpen && eOpen.message ? eOpen.message : eOpen);
      } catch (e1) {}
      try {
        if (usesWorkflowSheet()) {
          openResoSheet();
          armSheetOpenGuard(INBOX_SHEET_OPEN_GUARD_MS);
          state.detail = item;
          state.selectedKey = key;
          if (state.tab === "resoconti") renderResoSheet(item);
          else if (state.tab === "candidature") renderCandSheet(item);
          else if (state.tab === "appelli") renderAppealSheet(item);
          else if (state.tab === "pause") renderPauseSheet(item);
        }
      } catch (eFb) {
        try {
          window.__vcInboxLastOpenErr =
            String(window.__vcInboxLastOpenErr || "") +
            "|fb:" +
            (eFb && eFb.message ? eFb.message : eFb);
        } catch (e2) {}
      }
    }
    return true;
  }

  function wireInboxCardDelegation() {
    try {
      window.__vcStaffInboxOpenCardByKey = openInboxCardByKey;
    } catch (eExp0) {}
    if (window.__vcInboxCardClickWired === "inboxClickOpen10c") return;
    window.__vcInboxCardClickWired = "inboxClickOpen10c";
    function onCardActivate(ev) {
      try {
        if (!ev || !ev.target || !ev.target.closest) return;
        /* solo click — preventDefault su pointerdown iOS uccideva i tap successivi nello sheet */
        if (ev.type && ev.type !== "click") return;
        if (ev.__vcInboxCardOpen10c) return;
        var t = ev.target;
        /* sheet aperto: non toccare nulla (lascia azioni/X/chat) */
        if (document.documentElement.classList.contains("vc-staff-reso-sheet-open")) return;
        if (
          t.closest(
            "#vc-staff-reso-sheet, .vc-dialog, .vc-dash-confirm, #vc-site-dialog, .vc-wfc-root, .vc-workflow-chat, .vc-emoji-picker",
          )
        ) {
          return;
        }
        if (t.closest(".vc-notify-close-btn")) return;
        var card = t.closest(".vc-staff-inbox-item[data-item-key]");
        if (!card) return;
        if (!card.closest("#vc-staff-inbox, .vc-notif-staff-inbox, #vc-staff-inbox-list")) return;
        var key = card.getAttribute("data-item-key") || "";
        if (!key) return;
        if (
          key === inboxCardOpenDedupeKey &&
          Date.now() - inboxCardOpenDedupeAt < 700
        ) {
          ev.__vcInboxCardOpen10c = true;
          return;
        }
        inboxCardOpenDedupeKey = key;
        inboxCardOpenDedupeAt = Date.now();
        ev.__vcInboxCardOpen10c = true;
        try {
          window.__vcInboxLastTap = { key: key, type: ev.type, at: Date.now() };
        } catch (eTap) {}
        try {
          if (typeof ev.stopPropagation === "function") ev.stopPropagation();
        } catch (ePrev) {}
        openInboxCardByKey(key, ev);
      } catch (eCard) {
        try {
          window.__vcInboxLastOpenErr = "cardActivate:" + (eCard && eCard.message ? eCard.message : eCard);
        } catch (eLog) {}
      }
    }
    document.addEventListener("click", onCardActivate, true);
    try {
      window.__vcStaffInboxOpenCardByKey = openInboxCardByKey;
    } catch (eExp) {}
  }
  try {
    wireInboxCardDelegation();
  } catch (eWireCard) {}

  /* inboxClickOpen10: act/X su document capture — stesso fix delle card (niente listener orphan sullo sheet) */
  function wireInboxSheetActionDelegation() {
    if (window.__vcInboxSheetActWired === "inboxClickOpen10c") return;
    window.__vcInboxSheetActWired = "inboxClickOpen10c";
    function onSheetActivate(ev) {
      try {
        if (!ev || !ev.target || !ev.target.closest) return;
        if (ev.type && ev.type !== "click") return;
        if (ev.__vcInboxSheetAct10c) return;
        var t = ev.target;
        /* mai mangiare click del modal conferma */
        if (
          t &&
          t.closest &&
          t.closest(".vc-dialog, #vc-site-dialog, .vc-dash-confirm, .vc-dialog__panel, .vc-dialog__actions")
        ) {
          return;
        }
        var sheet = document.getElementById("vc-staff-reso-sheet");
        if (!sheet || sheet.hidden || sheet.hasAttribute("hidden")) return;
        if (!sheet.classList.contains("is-in") && !document.documentElement.classList.contains("vc-staff-reso-sheet-open")) {
          return;
        }
        if (!sheet.contains(t)) return;
        var actBtn = t.closest("[data-act], [data-reso-reject-ui]");
        if (actBtn && sheet.contains(actBtn)) {
          ev.__vcInboxSheetAct10c = true;
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch (ePrev) {}
          try {
            window.__vcInboxLastSheetAct = actBtn.getAttribute("data-act") || "reject-ui";
          } catch (eAct) {}
          try {
            unlockSheetInteractions();
          } catch (eUn) {}
          try {
            runSheetActionFromButton(actBtn, state.detail);
          } catch (eRun) {
            try {
              window.__vcInboxLastOpenErr = "sheetAct:" + (eRun && eRun.message ? eRun.message : eRun);
            } catch (eLog) {}
          }
          return;
        }
        var closer = t.closest("[data-reso-close]");
        if (!closer || !sheet.contains(closer)) return;
        if (
          closer.classList &&
          closer.classList.contains("vc-staff-reso-sheet__backdrop") &&
          sheetOpenGuardActive()
        ) {
          ev.__vcInboxSheetAct10c = true;
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch (eBd) {}
          return;
        }
        ev.__vcInboxSheetAct10c = true;
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (eCl) {}
        try {
          window.__vcInboxLastSheetAct = "close";
        } catch (eC) {}
        closeDetail({ force: true });
      } catch (eSheet) {
        try {
          window.__vcInboxLastOpenErr = "sheetActivate:" + (eSheet && eSheet.message ? eSheet.message : eSheet);
        } catch (eLog2) {}
      }
    }
    document.addEventListener("click", onSheetActivate, true);
  }
  try {
    wireInboxSheetActionDelegation();
  } catch (eWireSheet) {}

  function cleanDiscordText(text, opts) {
    var keepNewlines = Boolean(opts && opts.keepNewlines);
    var keepCustomEmoji = Boolean(opts && opts.keepCustomEmoji);
    var s = String(text || "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, "")
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

  function discordIdOnlyValue(item, rawValue) {
    var uid = String((item && item.userId) || "").trim();
    if (/^\d{16,22}$/.test(uid)) return uid;
    var raw = String(rawValue || "");
    var m = raw.match(/(\d{16,22})/);
    return m ? m[1] : "\u2014";
  }

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
            return tok;
    });
        s = s.replace(/\{\{VCEMOJI\d*$/, "").trim();
    return restoreDiscordEmojis(s, emojiSafe.tokens) + "\u2026";
  }

  function typeBadge(item) {
    if (state.tab === "pause" && item) {
      return pauseRoleBadgesHtml(item);
    }
    if (state.tab === "candidature" && item && item.type) {
    return (
      '<span class="vc-staff-inbox-type-badge">' + T.esc(formatWorkflowType(item.type)) + "</span>"
    );
    }
    if (state.tab === "appelli" && item && item.kind) {
      var kindLabel =
        item.kind === "unban" ? "Unban" : item.kind === "unmute" ? "Unmute" : "";
      if (!kindLabel) return "";
      return (
        '<span class="vc-staff-inbox-type-badge vc-staff-inbox-type-badge--appeal">' +
        T.esc(kindLabel) +
        "</span>"
      );
    }
    return "";
  }

  function pauseRoleBadgeLabels(item) {
    if (!item) return [];
    var track = String(item.ruoloTrack || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    var label = String(item.ruoloRichiesto || item.ruolo || "")
      .trim()
      .toLowerCase();
    if (
      track === "entrambi" ||
      track === "both" ||
      /entrambi|\bboth\b/.test(label)
    ) {
      return ["Staff", "Partner Manager"];
    }
    if (
      track === "partnermanager" ||
      track === "pm" ||
      /partner\s*manager|\bpm\b/.test(label)
    ) {
      return ["Partner Manager"];
    }
    var pretty = String(item.ruoloRichiesto || item.ruolo || "").trim();
    if (pretty && !/^(staff|partnermanager|partner manager|entrambi|both)$/i.test(pretty)) {
      return [pretty];
    }
    return ["Staff"];
  }

  function pauseRoleBadgesHtml(item) {
    var labels = pauseRoleBadgeLabels(item);
    if (!labels.length) return "";
    return labels
      .map(function (lab) {
        return (
          '<span class="vc-staff-inbox-type-badge vc-staff-inbox-type-badge--pause-role">' +
          T.esc(lab) +
          "</span>"
        );
      })
      .join("");
  }

    function resocontoStaffFlags(item) {
    if (!item) return { isNewStaff: false, inPause: false, pauseEnded: false };
    if (
      Object.prototype.hasOwnProperty.call(item, "isNewStaff") ||
      Object.prototype.hasOwnProperty.call(item, "inPause")
    ) {
      var apiInPause = item.inPause === true;
      return {
        isNewStaff: item.isNewStaff === true,
        inPause: apiInPause,
        pauseEnded: item.pauseEnded === true && !apiInPause,
      };
    }
    var azione = String(item.azioneDisplay || item.proposedLabel || "").toLowerCase();
    var body = String(item.body || item.content || item.preview || "").toLowerCase();
    var blob = azione + " " + body;
    var isNew = /nuovo in staff|nuovo partner manager|nuovo\s*pm\b/.test(blob);
    var inPause = /\bin pausa\b|pausa nella settimana/.test(azione) || /\bin pausa\b/.test(body);
    var pauseEnded = /rientrato da pausa/.test(blob);
    return {
      isNewStaff: isNew,
      inPause: inPause,
      pauseEnded: pauseEnded && !inPause,
    };
  }

  function resocontoFlagBadgesHtml(item) {
    if (state.tab !== "resoconti" || !item) return "";
    var f = resocontoStaffFlags(item);
    var bits = [];
    if (f.isNewStaff) {
      bits.push('<span class="vc-staff-reso-flag vc-staff-reso-flag--new">Nuovo</span>');
    }
    if (f.inPause) {
      bits.push('<span class="vc-staff-reso-flag vc-staff-reso-flag--pause">In pausa</span>');
    } else if (f.pauseEnded) {
      bits.push('<span class="vc-staff-reso-flag vc-staff-reso-flag--back">Rientrato</span>');
    }
    if (!bits.length) return "";
    return '<span class="vc-staff-reso-flags">' + bits.join("") + "</span>";
  }

  function parseNumberedSections(text, opts) {
    var sequential = Boolean(opts && opts.sequential);
    var raw = cleanDiscordText(text, { keepNewlines: true, keepCustomEmoji: true });
    if (!raw) return [];

    var normalized = raw
      .replace(/(\d{1,2})\\\./g, "$1.")
      .replace(/\*\*/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (sequential) {
      var lines = normalized.split("\n");
      var blocks = [];
      var expected = 1;
      var current = null;
      function flushSeq() {
        if (!current) return;
        var name = String(current.name || "").trim();
        var value = String(current.value || "").trim();
        if (!name && !value) {
          current = null;
          return;
        }
        var qInline = name.match(/^(\d{1,2}\.\s*[\s\S]{1,280}?\?)\s+([\s\S]+)$/);
        if (qInline && !value) {
          blocks.push({ name: qInline[1].trim(), value: qInline[2].trim() || "\u2014" });
        } else {
          blocks.push({ name: name || "Domanda " + (blocks.length + 1), value: value || "\u2014" });
        }
        current = null;
      }
      for (var li = 0; li < lines.length; li += 1) {
        var line = lines[li];
        var mSeq = String(line || "").match(/^(\d{1,2})\.\s*(.*)$/);
        var numSeq = mSeq ? Number(mSeq[1]) : 0;
        if (mSeq && Number.isFinite(numSeq) && numSeq === expected) {
          flushSeq();
          var restSeq = String(mSeq[2] || "").trim();
          var idLineSeq = restSeq.match(/^(ID(?:\s+Discord)?)\s+(.+)$/i);
          var ageLineSeq = restSeq.match(/^(Et[aà])\s+(.+)$/i);
          if (idLineSeq) {
            current = { name: "1. ID Discord", value: idLineSeq[2].trim() };
          } else if (/^ID(?:\s+Discord)?$/i.test(restSeq)) {
            current = { name: "1. ID Discord", value: "" };
          } else if (ageLineSeq) {
            current = { name: numSeq + ". " + ageLineSeq[1], value: ageLineSeq[2].trim() };
          } else {
            current = { name: (numSeq + ". " + restSeq).trim(), value: "" };
          }
          expected += 1;
          continue;
        }
        if (!current) continue;
        current.value = current.value ? current.value + "\n" + line : line;
      }
      flushSeq();
      return blocks;
    }

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

                var nl = rest.search(/\n/);
        if (nl > 0) {
          var qLine = rest.slice(0, nl).trim();
          var aBlock = rest.slice(nl + 1).trim();
          if (qLine && aBlock) {
            return { name: num + ". " + qLine, value: aBlock };
          }
        }

                var withQuestion = rest.match(/^([\s\S]{1,280}?\?)\s+([\s\S]+)$/);
        if (withQuestion && String(withQuestion[2] || "").trim()) {
          return {
            name: num + ". " + withQuestion[1].trim(),
            value: withQuestion[2].trim(),
          };
        }

        var idLine = rest.match(/^(ID(?:\s+Discord)?)\s+(.+)$/i);
        if (idLine) {
          return { name: "1. ID Discord", value: idLine[2].trim() || "\u2014" };
        }
        if (/^ID(?:\s+Discord)?$/i.test(rest)) {
          return { name: "1. ID Discord", value: "\u2014" };
        }

        var ageLine = rest.match(/^(Et[aà])\s+(.+)$/i);
        if (ageLine) {
          return { name: num + ". " + ageLine[1], value: ageLine[2].trim() || "\u2014" };
        }

                return { name: "Domanda " + num, value: rest };
      })
      .filter(Boolean);

    return out.length >= 2 ? out : out;
  }

    function breakNumberedProse(text) {
    return String(text || "")
      .replace(/(\d{1,2})\\\./g, "$1.")
      .replace(/([^\n])\s+(?=(\d{1,2})[.)]\s+)/g, "$1\n\n");
  }

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
      { re: /^Utente\s*:/i, title: "1. ID Discord" },
      { re: /^(?:\d{1,2}\.\s*)?ID(?:\s+Discord)?\s*:?/i, title: "1. ID Discord" },
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
    vp: "Valutazione positiva",
    vn: "Valutazione negativa",
    nl: "Nulla",
    px: "Pex",
    dp: "Depex",
    rc: "Richiamo",
    batch: "Azioni multiple",
  };

  function resocontoProposedLabel(item) {
    if (!item) return "";
            if (item.proposedLabel) return String(item.proposedLabel);
    var fromBody = extractResocontoAzione(item.body || item.content || item.preview || "");
    if (fromBody) {
      var short = shortenResocontoAzioneLabel(fromBody);
      if (short) return short;
    }
    var fromKey = resocontoActionCodeLabel(item.actionKey);
    if (fromKey) return fromKey;
    return fromBody || "";
  }

  function shortenResocontoAzioneLabel(azioneRaw) {
    var azione = String(azioneRaw || "").trim();
    if (!azione) return "";
    if (/^nulla\b/i.test(azione)) {
      var dash = azione.match(/^nulla\s*[—–-]\s*(.+)$/i);
      if (dash && dash[1]) return ("Nulla — " + String(dash[1]).trim()).slice(0, 48);
      return "Nulla";
    }
    var hasPos = /valutazione positiva|compito sanzioni/i.test(azione);
    var hasNeg = /valutazione negativa/i.test(azione);
    var gia = /gi[aà]\s*registrat/i.test(azione);
    if (!hasPos && !hasNeg) return "";
    var label =
      hasPos && hasNeg
        ? "Valutazione positiva / negativa"
        : hasPos
          ? "Valutazione positiva"
          : "Valutazione negativa";
    if (gia) label += hasPos && hasNeg ? " (già fatte)" : " (già fatta)";
    return label;
  }

  function resocontoNeedsReasonForAction(item, actionKey) {
    var kind = String(item && item.kind || "").toLowerCase();
    var key = String(actionKey || item && item.actionKey || "")
      .trim()
      .toLowerCase();
    if (kind === "p") return key === "dp";
    if (key === "nl" || key === "rc" || key === "batch") return false;
    if (key === "px" || key === "dp" || key === "vp" || key === "vn") return true;
    var label = resocontoActionCodeLabel(key) || resocontoProposedLabel(item);
    if (/^nulla$/i.test(label) || /^richiamo$/i.test(label)) return false;
    if (/^pex$|^depex$|^valutazione positiva$|^valutazione negativa$|^val \+|^val -$/i.test(label)) return true;
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
    var opts = {
        title: "Motivo · " + label,
        message: "Inserisci la motivazione per applicare " + label + ".",
        label: "Motivazione",
        placeholder: placeholder,
        confirmLabel: "Applica " + label,
        cancelLabel: "Annulla",
        multiline: true,
        maxLength: 500,
    };
    if (runner) {
      return runner(opts).then(function (val) {
        if (val == null) return null;
        return String(val || "").trim();
      });
    }
    return (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.prompt !== "function") return null;
      return D.prompt(opts).then(function (val) {
        if (val == null) return null;
        return String(val || "").trim();
      });
    });
  }

  function resocontoEffectiveActionKey(body) {
    return String((body && body.overrideActionKey) || (body && body.actionKey) || "")
      .trim()
      .toLowerCase();
  }

  function ensureResocontoReason(body, item) {
    var effectiveKey = resocontoEffectiveActionKey(body);
    if (String((body && body.reason) || "").trim()) {
      return Promise.resolve(String(body.reason).trim());
    }
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
    if (/valutazione positiva/.test(outcome)) return "Valutazione positiva";
    if (/valutazione negativa/.test(outcome)) return "Valutazione negativa";
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

      function splitLeadingDiscordEmojis(text) {
    var s = String(text || "");
    var m = s.match(/^(?:<a?:[\w~-]+:\d+>\s*)+/);
    if (!m) return { emojis: "", rest: s.trim() };
    return { emojis: m[0].replace(/\s+/g, " ").trim(), rest: s.slice(m[0].length).trim() };
  }

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

  function stripResocontoText(text, opts) {
    var keepNewlines = Boolean(opts && opts.keepNewlines);
    var s = cleanDiscordText(text || "", { keepCustomEmoji: false, keepNewlines: keepNewlines });
    s = s
      .replace(/:[a-zA-Z0-9_~-]+:/g, "")
      .replace(/\{\{VCEMOJI\d+\}\}/g, "")
      .replace(/<(a?):[\w~-]+:\d+>/g, "");
    try {
      s = s.replace(/\p{Extended_Pictographic}/gu, "");
    } catch (ePic) {
      s = s.replace(/(?:[\u2600-\u27BF]|(?:\uD83C[\uDC00-\uDFFF])|(?:\uD83D[\uDC00-\uDFFF])|(?:\uD83E[\uDC00-\uDFFF]))/g, "");
    }
    s = s.replace(/\uFE0F|\u200D/g, "");
    if (keepNewlines) {
      return s
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
    }
    return s.replace(/\s+/g, " ").trim();
  }

  function extractHoursLabelFromRaw(raw) {
    var cleaned = stripResocontoText(raw || "");
    if (!cleaned) return "";
    var m = cleaned.match(/(\d+(?:[.,]\d+)?)\s*h\b/i);
    if (m) {
      var n = Number(String(m[1]).replace(",", "."));
      if (Number.isFinite(n)) return formatVoiceHours(n * 3600);
    }
    var only = cleaned.replace(/[^\d.,]/g, "");
    if (only && /^\d+(?:[.,]\d+)?$/.test(only)) {
      var n2 = Number(only.replace(",", "."));
      if (Number.isFinite(n2)) return formatVoiceHours(n2 * 3600);
    }
    return cleaned;
  }

  function extractResocontoListPreview(text, item) {
    var sections = parseResocontoSections(text);
    var isPm = item && String(item.kind || "").toLowerCase() === "p";
    var msgs = null;
    var ore = "";
    var sanzioni = "";
    var partners = null;
    var azione = "";
    if (sections.length) {
      sections.forEach(function (s) {
        var name = stripResocontoText(s.name || "");
        var value = stripResocontoText(s.value || "");
        if (!name && !value) return;
        var key = name.toLowerCase();
        if (/^azione$/.test(key)) {
          azione = value;
          return;
        }
        if (/messaggi/.test(key)) {
          var mNum = value.replace(/[^\d]/g, "");
          if (mNum) msgs = Number(mNum);
          return;
        }
        if (/^ore\b|ore in una settimana/.test(key)) {
          ore = extractHoursLabelFromRaw(value);
          return;
        }
        if (/sanzioni/.test(key)) {
          sanzioni = value;
          return;
        }
        if (/^partner$/.test(key)) {
          var pNum = value.replace(/[^\d]/g, "");
          if (pNum) partners = Number(pNum);
        }
      });
    }
    if (item) {
      if (msgs == null && item.weeklyMessages != null && Number.isFinite(Number(item.weeklyMessages))) {
        msgs = Math.max(0, Math.floor(Number(item.weeklyMessages)));
      }
      if (!ore && item.weeklyVoiceSeconds != null && Number.isFinite(Number(item.weeklyVoiceSeconds))) {
        ore = formatVoiceHours(item.weeklyVoiceSeconds);
      }
      if (partners == null && item.weeklyPartners != null && Number.isFinite(Number(item.weeklyPartners))) {
        partners = Math.max(0, Math.floor(Number(item.weeklyPartners)));
      }
      if (!azione) azione = resocontoProposedLabel(item) || "";
    }
    azione = shortenResocontoAzioneLabel(azione) || stripResocontoText(azione);
    var parts = [];
    if (isPm) {
      if (partners != null) parts.push(partners + " partner");
      if (azione) parts.push(azione);
      return parts.join(" · ");
    }
    if (msgs != null) parts.push(msgs + " msg");
    if (ore) parts.push(ore);
    if (sanzioni) parts.push("Sanzioni " + sanzioni);
    if (azione) parts.push(azione);
    return parts.join(" · ");
  }

    function normalizeResocontoBody(text) {
    var s = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u2028|\u2029/g, "\n")
      .trim();
    if (!s) return "";
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

            var colon = cleaned.match(/^(.*):\s*(.*)$/);
      if (!colon) return null;
      var label = String(colon[1] || "").trim();
      var value = String(colon[2] || "").trim();
            if (!label || label.length > 96) return null;
      if (/[{}]{2}VCEMOJI\d+[{}]{2}\s*$/.test(label) && !/\S/.test(label.replace(/\{\{VCEMOJI\d+\}\}/g, ""))) {
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
    var dateOnly = Boolean(opts && opts.dateOnly);
    var meta = [];
    if (item.start && item.end) meta.push(item.start + " \u2192 " + item.end);
    // Role lives in the sheet kicker for candidature — never as a hero "HELPER" chip.
    if (!dateOnly && state.tab !== "candidature" && item.ruoloRichiesto) {
      meta.push(item.ruoloRichiesto);
    }
    // Appelli: Unban/Unmute = type badge next to name; never dump userId in meta.
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

  function clearSheetTitle(titleEl) {
    if (!titleEl) return;
    titleEl.textContent = "";
    titleEl.hidden = true;
    titleEl.setAttribute("hidden", "");
    titleEl.setAttribute("aria-hidden", "true");
  }

  function actionButtons(item, tab) {
    if (!item.canAct) return "";
    if (tab === "pause") {
      return (
        '<div class="vc-staff-inbox-actions vc-staff-inbox-actions--forge">' +
        '<div class="vc-staff-rank-forge__rail">' +
        '<button type="button" class="vc-staff-rank-forge__card is-up" data-act="accept" data-user-id="' +
        T.esc(item.userId) +
        '" data-id="' +
        T.esc(item.id) +
        '">' +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-check"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Accetta</span>' +
        '<span class="vc-staff-rank-forge__hint">Approva la pausa richiesta</span></button>' +
        '<button type="button" class="vc-staff-rank-forge__card is-down" data-act="reject" data-user-id="' +
        T.esc(item.userId) +
        '" data-id="' +
        T.esc(item.id) +
        '">' +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-times"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Rifiuta</span>' +
        '<span class="vc-staff-rank-forge__hint">Chiudi senza accettare</span></button>' +
        "</div></div>"
      );
    }
    if (tab === "candidature") {
      var candMid = T.esc(item.messageId);
      var candType = T.esc(item.type);
      var candUid = T.esc(item.userId);
      return (
        '<div class="vc-staff-inbox-actions vc-staff-inbox-actions--forge">' +
        '<div class="vc-staff-rank-forge__rail">' +
        '<button type="button" class="vc-staff-rank-forge__card is-up" data-act="accept" data-message-id="' +
        candMid +
        '" data-type="' +
        candType +
        '" data-user-id="' +
        candUid +
        '">' +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-check"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Accetta</span>' +
        '<span class="vc-staff-rank-forge__hint">Approva la candidatura</span></button>' +
        '<button type="button" class="vc-staff-rank-forge__card is-down" data-act="reject" data-message-id="' +
        candMid +
        '" data-type="' +
        candType +
        '" data-user-id="' +
        candUid +
        '">' +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-times"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Rifiuta</span>' +
        '<span class="vc-staff-rank-forge__hint">Chiudi senza accettare</span></button>' +
        "</div></div>"
      );
    }
    if (tab === "appelli") {
      var appealMid = T.esc(item.messageId);
      var appealKind = T.esc(item.kind);
      var appealUid = T.esc(item.userId);
      var appealHint =
        item.kind === "unban"
          ? "Approva l'appello unban"
          : item.kind === "unmute"
            ? "Approva l'appello unmute"
            : "Approva l'appello";
      return (
        '<div class="vc-staff-inbox-actions vc-staff-inbox-actions--forge">' +
        '<div class="vc-staff-rank-forge__rail">' +
        '<button type="button" class="vc-staff-rank-forge__card is-up" data-act="accept" data-message-id="' +
        appealMid +
        '" data-kind="' +
        appealKind +
        '" data-user-id="' +
        appealUid +
        '">' +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-check"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Accetta</span>' +
        '<span class="vc-staff-rank-forge__hint">' +
        T.esc(appealHint) +
        "</span></button>" +
        '<button type="button" class="vc-staff-rank-forge__card is-down" data-act="reject" data-message-id="' +
        appealMid +
        '" data-kind="' +
        appealKind +
        '" data-user-id="' +
        appealUid +
        '">' +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-times"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Rifiuta</span>' +
        '<span class="vc-staff-rank-forge__hint">Chiudi senza accettare</span></button>' +
        "</div></div>"
      );
    }
    if (tab === "resoconti") {
      var mid = T.esc(item.messageId || "");
      var uid = T.esc(item.userId || "");
      var kind = T.esc(item.kind || "");
      var roleId = T.esc(item.roleId || "");
      var actionKey = T.esc(item.actionKey || "");
      var channelId = T.esc(item.channelId || "");
      var isPm = String(item.kind || "") === "p";
      var attrs =
        ' data-message-id="' +
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
        '"';
      var alts = isPm
        ? [
            { key: "rc", label: "Richiamo", reason: "" },
            { key: "dp", label: "Depex", reason: "" },
          ]
        : [
            {
              key: "vp",
              label: "Valutazione positiva · limiti raggiunti",
              reason: "Limiti settimanali completati.",
            },
            {
              key: "vp",
              label: "Valutazione positiva · limiti doppi",
              reason: "Limiti settimanali superati almeno del doppio.",
            },
            {
              key: "vn",
              label: "Valutazione negativa · limiti non raggiunti",
              reason: "Limiti settimanali non raggiunti.",
            },
            {
              key: "vp",
              label: "Valutazione positiva · compito sanzioni",
              reason: "Compito sanzioni completato.",
            },
            {
              key: "vp",
              label: "Valutazione positiva · griglia",
              reason: "Valutazione positiva da griglia attività/condotta.",
            },
            {
              key: "vn",
              label: "Valutazione negativa · griglia",
              reason: "Valutazione negativa da griglia attività/condotta.",
            },
            { key: "nl", label: "Nulla", reason: "" },
          ];
      return (
        '<div class="vc-staff-inbox-actions vc-staff-inbox-actions--resoconti vc-staff-inbox-actions--forge" data-reso-actions="1">' +
        '<p class="vc-staff-inbox-actions__hint">' +
        T.esc(
          isPm
            ? "Conferma l\u2019esito automatico oppure rifiuta per scegliere Richiamo o Depex."
            : "Conferma le valutazioni automatiche oppure rifiuta per sceglierne altre.",
        ) +
        "</p>" +
        '<div class="vc-staff-rank-forge__rail vc-staff-inbox-actions__decide vc-staff-inbox-actions__decide--pair">' +
        '<button type="button" class="vc-staff-rank-forge__card is-up vc-staff-inbox-btn--confirm" data-act="accept"' +
        attrs +
        ">" +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-check"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Conferma</span>' +
        '<span class="vc-staff-rank-forge__hint">' +
        T.esc(isPm ? "Applica l\u2019esito proposto" : "Conferma le proposte automatiche") +
        "</span></button>" +
        '<button type="button" class="vc-staff-rank-forge__card is-down" data-reso-reject-ui="1"' +
        attrs +
        ">" +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-times"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Rifiuta</span>' +
        '<span class="vc-staff-rank-forge__hint">' +
        T.esc(isPm ? "Scegli Richiamo o Depex" : "Scegli un\u2019altra valutazione") +
        "</span></button>" +
        "</div>" +
        '<div class="vc-staff-inbox-alt vc-staff-inbox-alt--reso" hidden data-reso-alts="1" aria-label="Valutazioni alternative">' +
        '<span class="vc-staff-inbox-alt__label">' +
        T.esc(isPm ? "Scegli azione" : "Valutazioni alternative") +
        "</span>" +
        '<div class="vc-staff-inbox-alt__pills">' +
        alts
          .map(function (alt) {
            return (
              '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--alt" data-act="accept" data-override-key="' +
              T.esc(alt.key) +
              '"' +
              (alt.reason ? ' data-reason="' + T.esc(alt.reason) + '"' : "") +
              attrs +
              ">" +
              T.esc(alt.label) +
              "</button>"
            );
          })
          .join("") +
        "</div></div></div>"
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
    body.reason = String(btn.getAttribute("data-reason") || "").trim();
    return body;
  }

  function revealResocontoRejectAlts(root) {
    if (!root) return;
    var alts = root.querySelector("[data-reso-alts]");
    if (alts) {
      alts.hidden = false;
      alts.removeAttribute("hidden");
    }
    root.classList.add("is-rejected-plan");
    var box = document.getElementById("vc-staff-reso-auto-box");
    if (box) {
      box.classList.add("is-cleared");
      var list = box.querySelector(".vc-staff-reso-auto__list");
      if (list) {
        list.innerHTML =
          '<p class="vc-staff-reso-auto__empty">Esito automatico annullato. Scegli un\u2019opzione sotto.</p>';
      }
    }
    var rejectBtn = root.querySelector("[data-reso-reject-ui]");
    if (rejectBtn) {
      rejectBtn.disabled = true;
      rejectBtn.setAttribute("aria-pressed", "true");
    }
  }

  function confirmSheetAction(opts) {
    opts = opts || {};
    var payload = {
      title: opts.title || "Confermi?",
      message: opts.message || "Confermi questa azione?",
      confirmLabel: opts.confirmLabel || "Conferma",
      cancelLabel: opts.cancelLabel || "Annulla",
      danger: Boolean(opts.danger),
      icon: opts.icon || (opts.danger ? "fa-exclamation-triangle" : "fa-check-circle"),
    };
    if (T && typeof T.confirm === "function") {
      return Promise.resolve(T.confirm(payload)).then(function (ok) {
        return ok === true;
      });
    }
    return (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.confirm !== "function") return true;
      return D.confirm(payload);
    }).then(function (ok) {
      return ok === true;
    });
  }

  function sheetActionConfirmCopy(tab, act, overrideKey) {
    var a = String(act || "").toLowerCase();
    var t = String(tab || "").toLowerCase();
    var ov = String(overrideKey || "").trim();
    if (t === "pause") {
      if (a === "reject") {
        return {
          title: "Rifiuta pausa",
          message: "Rifiutare questa richiesta di pausa?",
          confirmLabel: "Rifiuta",
          danger: true,
          icon: "fa-times-circle",
        };
      }
      return {
        title: "Accetta pausa",
        message: "Accettare questa richiesta di pausa?",
        confirmLabel: "Accetta",
        danger: false,
        icon: "fa-check-circle",
      };
    }
    if (t === "candidature") {
      if (a === "reject") {
        return {
          title: "Rifiuta candidatura",
          message: "Rifiutare questa candidatura?",
          confirmLabel: "Rifiuta",
          danger: true,
          icon: "fa-times-circle",
        };
      }
      return {
        title: "Accetta candidatura",
        message: "Accettare questa candidatura?",
        confirmLabel: "Accetta",
        danger: false,
        icon: "fa-check-circle",
      };
    }
    if (t === "appelli") {
      if (a === "reject") {
        return {
          title: "Rifiuta appello",
          message: "Rifiutare questo appello?",
          confirmLabel: "Rifiuta",
          danger: true,
          icon: "fa-times-circle",
        };
      }
      return {
        title: "Accetta appello",
        message: "Accettare questo appello?",
        confirmLabel: "Accetta",
        danger: false,
        icon: "fa-check-circle",
      };
    }
    if (t === "resoconti") {
      if (a === "reject" || ov) {
        return {
          title: ov ? "Conferma esito" : "Rifiuta resoconto",
          message: ov
            ? "Applicare l\u2019esito selezionato a questo resoconto?"
            : "Rifiutare questo resoconto?",
          confirmLabel: ov ? "Conferma" : "Rifiuta",
          danger: true,
          icon: ov ? "fa-gavel" : "fa-times-circle",
        };
      }
      return {
        title: "Conferma resoconto",
        message: "Confermare questo resoconto?",
        confirmLabel: "Conferma",
        danger: false,
        icon: "fa-check-circle",
      };
    }
    return {
      title: a === "reject" ? "Rifiuta" : "Conferma",
      message: a === "reject" ? "Rifiutare questa richiesta?" : "Confermare questa azione?",
      confirmLabel: a === "reject" ? "Rifiuta" : "Conferma",
      danger: a === "reject",
      icon: a === "reject" ? "fa-times-circle" : "fa-check-circle",
    };
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
    var act = btn && btn.getAttribute("data-act");
    var overrideKey = btn && btn.getAttribute("data-override-key");
    ensureResocontoReason(body, item).then(function (reasonOk) {
      if (reasonOk == null) return;
      return confirmSheetAction(sheetActionConfirmCopy("resoconti", act, overrideKey)).then(function (ok) {
        if (!ok) return;
        /* inboxClickOpen10f: chiudi subito al tap Conferma (POST in background) */
        try {
          closeDetail({ force: true });
          cancelInboxSheetOpenRaf();
        } catch (eCloseEarly) {}
        postAction(body);
      });
    });
  }

  function runSheetActionFromButton(btn, itemOverride) {
    if (!btn || state.busy) return;
    if (btn.hasAttribute("data-reso-reject-ui")) {
      var wrap = btn.closest("[data-reso-actions]") || btn.parentElement;
        revealResocontoRejectAlts(wrap);
      return;
    }
    if (!btn.hasAttribute("data-act")) return;
        var act = btn.getAttribute("data-act");
        if (state.tab === "resoconti") {
          runResocontoAction(btn, itemOverride);
          return;
        }
    var item = itemOverride || state.detail || null;
        var body = { queue: state.tab, action: act };
        if (state.tab === "pause") {
          body.userId = btn.getAttribute("data-user-id") || (item && item.userId);
          body.pauseId = btn.getAttribute("data-id") || (item && item.id);
        } else {
          body.messageId = btn.getAttribute("data-message-id") || (item && item.messageId);
          body.userId = btn.getAttribute("data-user-id") || (item && item.userId);
          if (state.tab === "candidature") {
            body.type = btn.getAttribute("data-type") || (item && item.type);
          }
          if (state.tab === "appelli") body.kind = btn.getAttribute("data-kind") || (item && item.kind);
        }
        confirmSheetAction(sheetActionConfirmCopy(state.tab, act)).then(function (ok) {
          if (!ok) return;
      try {
        closeDetail({ force: true });
        cancelInboxSheetOpenRaf();
      } catch (eCloseEarly2) {}
          postAction(body);
        });
  }

  function bindActionButtons(root, itemOverride) {
    if (!root) return;
    /* inboxClickOpen8: resta come backup; la delegation sullo sheet è il path principale */
    root.querySelectorAll("[data-reso-reject-ui]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        runSheetActionFromButton(btn, itemOverride);
      });
    });
    root.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        runSheetActionFromButton(btn, itemOverride);
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

  function renderList(opts) {
    opts = opts || {};
    var root = T.byId("vc-staff-inbox-list");
    if (!root) return;
    if (!opts.force && state.items.length) {
      var sig = inboxListPaintSig();
      if (sig && sig === lastInboxListPaintSig && root.querySelector(".vc-staff-inbox-item, .vc-notify-row")) {
        /* inboxLoadingEmoji1: early return non deve lasciare is-refreshing attivo */
        root.classList.remove("is-loading", "is-refreshing");
        root.setAttribute("aria-busy", "false");
        return;
      }
      lastInboxListPaintSig = sig;
    } else if (state.items.length) {
      lastInboxListPaintSig = inboxListPaintSig();
    } else {
      lastInboxListPaintSig = "";
    }
    if (!state.items.length) {
      if (listEmptyDespitePending()) {
        if (inboxLoadBusy()) {
          root.hidden = false;
          root.classList.add("is-loading");
          root.classList.remove("is-refreshing");
          root.innerHTML = inboxListSkeletonHtml();
                    if (inboxBooting || !initialQueueLoaded) {
            showInboxFsLoading("Carico " + tabLabel(state.tab).toLowerCase() + "\u2026");
          }
          schedulePendingListRetry();
          return;
        }
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
            {
              title: "Aggiornamento in corso",
              rawHtml: true,
            },
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
      root.removeAttribute("data-inbox-loading");
      root.innerHTML = inboxEmptyBoxHtml("", "fa-inbox", {
        title: inboxEmptyMessage(),
        sub: inboxEmptySubMessage(),
      });
      try {
        initialQueueLoaded = true;
        inboxBooting = false;
        hideInboxFsLoading(true);
        hideInboxBootScreen(true);
      } catch (eLiftEmpty) {}
      /* inboxPendingBadgeSync1: empty pending senza filtro tipo → badge 0 subito */
      try {
        if (state.scope === "pending" && !String(state.filter || "").trim() && state.page <= 1) {
          syncTabBadgeFromLoadedQueue(
            state.tab,
            state.scope,
            state.filter,
            [],
            state.pagination || { total: 0 },
            1,
          );
        }
      } catch (eBadgeEmpty) {}
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
          var key = itemKey(item);
          var selected = state.selectedKey && state.selectedKey === key;
          var flagBits = resocontoFlagBadgesHtml(item);
          // inboxListCompactAll1: tutte le tab = avatar + nome/badge + azione a destra (come resoconti).
          var sideBit =
            state.tab === "resoconti" ? resocontoRoleBadgeHtml(item) : typeBadge(item);
          var actionLabel =
            state.tab === "resoconti"
              ? String(resocontoCardAction(item) || statusLabel(item) || "").trim() || "—"
              : String(statusLabel(item) || "").trim() || "—";
          if (embed) {
            return (
              '<li class="vc-notify-row vc-notify-row--link vc-staff-inbox-item vc-staff-inbox-item--list-compact' +
              (selected ? " is-selected" : "") +
              '" data-item-key="' +
              T.esc(key) +
              '" tabindex="0" role="button">' +
              '<span class="vc-notify-row-icon">' +
              T.avatarImgHtml(item.avatarUrl, item.userId, {
                width: 44,
                height: 44,
                loading: "eager",
                fetchPriority: "high",
              }) +
              "</span>" +
              '<div class="vc-notify-row-main">' +
              '<p class="vc-notify-row-title">' +
              T.esc(title) +
              (sideBit ? " " + sideBit : "") +
              (flagBits ? " " + flagBits : "") +
              "</p></div>" +
              '<span class="vc-notify-row-badge ' +
              notifyBadgeClass(item) +
              '">' +
              T.esc(actionLabel) +
              "</span></li>"
            );
          }
          return (
            '<li class="vc-staff-inbox-item vc-staff-inbox-item--card vc-staff-inbox-item--list-compact' +
            (selected ? " is-selected" : "") +
            '" data-item-key="' +
            T.esc(key) +
            '" tabindex="0" role="button">' +
            '<span class="vc-staff-avatar-wrap">' +
            T.avatarImgHtml(item.avatarUrl, item.userId, {
              width: 44,
              height: 44,
              loading: "eager",
              fetchPriority: "high",
            }) +
            "</span>" +
            '<div class="vc-staff-inbox-item__body">' +
            '<div class="vc-staff-inbox-item__head">' +
            '<div class="vc-staff-inbox-item__titles">' +
            '<div class="vc-staff-inbox-item__title-row">' +
            '<h3 class="vc-staff-inbox-item__title">' +
            T.esc(title) +
            "</h3>" +
            sideBit +
            flagBits +
            "</div></div>" +
            '<span class="vc-staff-inbox-status ' +
            statusClass(item) +
            '">' +
            T.esc(actionLabel) +
            "</span></div></div></li>"
          );
        })
        .join("") +
      "</ul>";

    /* inboxStuckKill2: lista dipinta = fine soft/hard + alza sempre il gate FS */
    root.classList.remove("is-loading", "is-refreshing");
    root.setAttribute("aria-busy", "false");
    root.removeAttribute("data-inbox-loading");
    clearSoftRefreshFailsafe();
    try {
      initialQueueLoaded = true;
      inboxBooting = false;
      hideInboxFsLoading(true);
      hideInboxBootScreen(true);
    } catch (eLift) {}
    /* notifQueueFast1: items visibili → sblocca click (hold/gate residui) */
    try {
      document.documentElement.classList.remove(
        "vc-interaction-hold",
        "vc-notif-staff-loading",
        "vc-notif-early-staff",
        "vc-loading-scroll-lock",
        "vc-scroll-soft-lock",
      );
      window.__VC_INBOX_FS_GATE_HOLD = false;
      window.__VC_NOTIF_EARLY_STAFF = false;
    } catch (eHoldClr) {}

    root.querySelectorAll(".vc-staff-inbox-item").forEach(function (card) {
      function openCard(ev) {
        /* inboxClickOpen10c: path diretto; delegation è il fallback stabile */
        if (document.documentElement.classList.contains("vc-staff-reso-sheet-open")) return;
        if (ev && ev.__vcInboxCardOpen10c) return;
        try {
          if (ev) ev.__vcInboxCardOpen10c = true;
        } catch (eMark) {}
        openInboxCardByKey(card.getAttribute("data-item-key"), ev);
      }
      card.addEventListener("click", openCard);
      card.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          openCard(ev);
        }
      });
    });
    scanInboxAvatars(root);
  }

  function scanInboxAvatars(root) {
    var base = root && root.querySelectorAll ? root : document;
    try {
      if (typeof window.VcWakeDeferredMedia === "function") {
        window.VcWakeDeferredMedia(base);
      }
    } catch (eWake) {}
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.scan === "function") {
        window.VcDiscordAvatar.scan(base);
      }
    } catch (eDa) {}
    try {
      if (window.VcAvatarFallback && typeof window.VcAvatarFallback.scan === "function") {
        window.VcAvatarFallback.scan(base);
      }
    } catch (eFb) {}
    try {
      var imgs = base.querySelectorAll
        ? base.querySelectorAll("img[data-vc-avatar], img.vc-staff-avatar, img.vc-avatar")
        : [];
      for (var i = 0; i < imgs.length; i += 1) {
        var img = imgs[i];
        if (img && img.complete && img.naturalWidth > 0) {
          img.classList.add("vc-avatar", "vc-avatar--ready");
          img.classList.remove("vc-avatar--pending");
          if (window.VcAvatarFallback && typeof window.VcAvatarFallback.markReady === "function") {
            window.VcAvatarFallback.markReady(img);
          }
        }
      }
    } catch (eReady) {}
    try {
      if (window.VcAvatarFallback && typeof window.VcAvatarFallback.sweepStuckPending === "function") {
        window.setTimeout(function () {
          try {
            window.VcAvatarFallback.sweepStuckPending();
          } catch (eSw) {}
        }, 120);
        window.setTimeout(function () {
          try {
            window.VcAvatarFallback.sweepStuckPending();
          } catch (eSw2) {}
        }, 600);
        window.setTimeout(function () {
          try {
            window.VcAvatarFallback.sweepStuckPending();
          } catch (eSw3) {}
        }, 1600);
      }
    } catch (eSched) {}
  }

  function clearDetailState(opts) {
    opts = opts || {};
    /* inboxClickOpen5: refresh/empty-list NON devono chiudere durante open guard */
    if (!opts.force && sheetOpenGuardActive() && (state.selectedKey || state.detail || state.detailLoading)) {
      try {
        window.__vcInboxLastOpenErr = "clearDetailBlocked:" + (Date.now() - inboxSheetOpenedAt) + "ms";
      } catch (eBlk0) {}
      return;
    }
    detailSeq += 1;
    teardownChat();
    /* notifTapEmptyFix1: arma ghost-guard SOLO se lo sheet era davvero aperto */
    var sheetWasOpen = false;
    try {
      var sheetChk = document.getElementById("vc-staff-reso-sheet");
      sheetWasOpen = Boolean(
        sheetChk &&
          !sheetChk.hidden &&
          !sheetChk.hasAttribute("hidden") &&
          sheetChk.classList.contains("is-in"),
      );
    } catch (eWas) {
      sheetWasOpen = false;
    }
    if (sheetWasOpen) {
      try {
        if (typeof window.__vcArmSheetCloseGuard === "function") window.__vcArmSheetCloseGuard(420);
    } catch (eGhost) {}
    }
    closeResoSheet(true, { force: true });
    state.detail = null;
    state.detailLoading = false;
    state.detailError = "";
    state.selectedKey = "";
    renderDetail();
  }

  function closeDetail(opts) {
    opts = opts || {};
    /* inboxClickOpen7: ghost-close bloccato; X/azioni user passano force:true */
    if (!opts.force && sheetOpenGuardActive()) {
      try {
        window.__vcInboxLastOpenErr = "closeDetailBlocked:" + (Date.now() - inboxSheetOpenedAt) + "ms";
      } catch (eBlk) {}
      return;
    }
    try {
      window.clearInterval(window.__vcInboxOpenKeepAlive);
      window.__vcInboxOpenKeepAlive = 0;
    } catch (eKa) {}
    inboxSheetOpenedAt = 0;
    clearDetailState({ force: true });
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

    function repairBrokenEmojiField(field) {
    if (!field) return field;
    var name = String(field.name || "");
    var value = String(field.value || "");
    var left = name.match(/^(.*)<(a?):([\w~-]+)$/);
    var right = value.match(/^(\d{16,22})>([\s\S]*)$/);
    if (!left || !right) return field;
    var emoji = "<" + left[2] + ":" + left[3] + ":" + right[1] + ">";
    var rest = String(right[2] || "").replace(/^\s*/, "");
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

  function fieldValueByName(fields, re) {
    var list = Array.isArray(fields) ? fields : [];
    for (var i = 0; i < list.length; i++) {
      var n = cleanDiscordText(String((list[i] && list[i].name) || ""), { keepCustomEmoji: false });
      if (re.test(n)) return String((list[i] && list[i].value) || "").trim();
    }
    return "";
  }

  function parseSanzioniDisplay(raw) {
    var s = stripResocontoText(raw || "").trim();
    if (!s || s === "—") return { count: "—", min: null };
    var m = s.match(/^(\d+)\s*(?:\(?\s*minimo\s*(\d+)\s*\)?)?/i);
    if (m) {
      return { count: m[1], min: m[2] ? String(m[2]) : null };
    }
    var loose = s.match(/minimo\s*(\d+)/i);
    var digits = s.replace(/[^\d].*$/, "").replace(/[^\d]/g, "");
    return {
      count: digits || s,
      min: loose ? String(loose[1]) : null,
    };
  }

  function resoTipHtml(text) {
    var tip = String(text || "").trim();
    if (!tip) return "";
    return (
      '<span class="vc-staff-reso-tip">' +
      '<button type="button" class="vc-staff-reso-tip__btn" aria-label="Info">i</button>' +
      '<span class="vc-staff-reso-tip__pop" role="tooltip">' +
      T.esc(tip) +
      "</span></span>"
    );
  }

    var RESOCONTO_ROLE_LIMITS = {
    "1442568904311570555": { label: "Helper", messages: 400, hours: 4, sanctions: 1 },
    "1442568901887000618": { label: "Mod", messages: 500, hours: 5, sanctions: 2 },
    "1544831236868931636": { label: "Senior Moderator", messages: 600, hours: 6, sanctions: 2 },
    "1502322782602530977": { label: "Director", messages: 550, hours: 5.5, sanctions: 1 },
    "1544831242510270464": { label: "Partner Manager", messages: 0, hours: 0, sanctions: 0 },
    "1442568910070349985": { label: "Staff", messages: 0, hours: 0, sanctions: 0 },
  };

  function resocontoRoleBadgeLabel(item) {
    if (!item) return "";
    if (String(item.kind || "").toLowerCase() === "p") return "Partner Manager";
    var explicit = String(item.roleLabel || "").trim();
    if (explicit && !/^\d{16,22}$/.test(explicit) && explicit.toLowerCase() !== "questo ruolo") {
      return explicit;
    }
    var byId = RESOCONTO_ROLE_LIMITS[String(item.roleId || "")] || null;
    if (byId && byId.label) return byId.label;
    if (String(item.kind || "").toLowerCase() === "s") return "Staff";
    return "";
  }

  function resocontoRoleBadgeHtml(item) {
    if (state.tab !== "resoconti" || !item) return "";
    var label = resocontoRoleBadgeLabel(item);
    if (!label) return "";
    return (
      '<span class="vc-staff-inbox-type-badge vc-staff-inbox-type-badge--reso-role">' +
      T.esc(label) +
      "</span>"
    );
  }

  function resocontoRoleLimits(item) {
    var wfLimits =
      item && item.activityLimits && typeof item.activityLimits === "object"
        ? item.activityLimits
        : null;
    var byId = RESOCONTO_ROLE_LIMITS[String((item && item.roleId) || "")] || null;
    var label =
      String((item && item.roleLabel) || "").trim() ||
      (byId && byId.label) ||
      "questo ruolo";
    var messages =
      wfLimits && wfLimits.messages != null
        ? Number(wfLimits.messages)
        : byId
          ? byId.messages
          : null;
    var hours =
      wfLimits && wfLimits.hours != null ? Number(wfLimits.hours) : byId ? byId.hours : null;
    var sanctions =
      item && item.sanctionLimit != null && Number.isFinite(Number(item.sanctionLimit))
        ? Number(item.sanctionLimit)
        : byId
          ? byId.sanctions
          : null;
    return { label: label, messages: messages, hours: hours, sanctions: sanctions };
  }

  function formatHoursLimit(h) {
    var n = Number(h);
    if (!Number.isFinite(n)) return "—";
    if (Math.abs(n - Math.round(n)) < 0.01) return String(Math.round(n));
    return String(n).replace(".", ",");
  }

  function niceChartCeil(value, kind) {
    var v = Math.max(0, Number(value) || 0);
    if (kind === "voice") {
      var paddedV = Math.max(v * 1.55, v + 0.45, 2.5);
      return Math.ceil(paddedV * 4) / 4;
    }
    var padded = Math.max(v * 1.45, v + 18, 50);
    if (padded <= 80) return Math.ceil(padded / 10) * 10;
    if (padded <= 200) return Math.ceil(padded / 25) * 25;
    return Math.ceil(padded / 50) * 50;
  }

  function parseResocontoDetailModel(item) {
    var body = item.body || item.content || item.preview || "";
    var fields = Array.isArray(item.fields) ? item.fields.slice() : [];
    var parsed = parseResocontoSections(body);
    if (parsed.length) fields = filterResocontoDetailFields(parsed);
    var isPm = String(item.kind || "").toLowerCase() === "p";
    var msgs =
      item.weeklyMessages != null && Number.isFinite(Number(item.weeklyMessages))
        ? Math.max(0, Math.floor(Number(item.weeklyMessages)))
        : null;
    var voiceSec =
      item.weeklyVoiceSeconds != null && Number.isFinite(Number(item.weeklyVoiceSeconds))
        ? Math.max(0, Math.floor(Number(item.weeklyVoiceSeconds)))
        : null;
    var msgsRaw = fieldValueByName(fields, /messaggi/i);
    var oreRaw = fieldValueByName(fields, /^ore\b|ore in una settimana/i);
    if (msgs == null && msgsRaw) {
      var mNum = String(stripResocontoText(msgsRaw)).replace(/[^\d]/g, "");
      if (mNum) msgs = Number(mNum);
    }
    var partnersRaw =
      item.weeklyPartners != null && Number.isFinite(Number(item.weeklyPartners))
        ? String(Math.max(0, Math.floor(Number(item.weeklyPartners))))
        : fieldValueByName(fields, /^partner$/i);
    var partnersNum = null;
    if (partnersRaw) {
      var pNum = String(stripResocontoText(partnersRaw)).replace(/[^\d]/g, "");
      if (pNum) partnersNum = Number(pNum);
    }
    var activity = String(item.activityGrade || "").trim() || fieldValueByName(fields, /attivit/i);
    var conduct = String(item.behaviorGrade || "").trim() || fieldValueByName(fields, /condotta/i);
    var azione =
      String(item.azioneDisplay || "").trim() ||
      fieldValueByName(fields, /^azione$/i) ||
      resocontoProposedLabel(item) ||
      "";
    var sanzioni = fieldValueByName(fields, /sanzioni/i);
    var pause = fieldValueByName(fields, /pausa/i);
    var chart = Array.isArray(item.costanzaChart) ? item.costanzaChart : [];
    var oreLabel =
      voiceSec != null
        ? formatVoiceHours(voiceSec)
        : extractHoursLabelFromRaw(oreRaw) || "—";
    var sanzioniParsed = parseSanzioniDisplay(sanzioni);
    if (!sanzioniParsed.min && item.sanctionLimit != null) {
      sanzioniParsed.min = String(item.sanctionLimit);
    }
    return {
      isPm: isPm,
      fields: fields,
      msgs: msgs,
      voiceSec: voiceSec,
      oreLabel: oreLabel,
      partners: partnersNum,
      partnersLabel: partnersNum != null ? String(partnersNum) : partnersRaw ? stripResocontoText(partnersRaw) || "—" : "—",
      activity: stripResocontoText(activity) || "—",
      conduct: stripResocontoText(conduct) || "—",
      azione: stripResocontoText(azione) || stripResocontoText(resocontoProposedLabel(item)) || "—",
      sanzioni: sanzioniParsed.count,
      sanzioniMin: sanzioniParsed.min,
      pause: stripResocontoText(pause),
      chart: chart,
      limits: resocontoRoleLimits(item),
      rolesHistory: Array.isArray(item.rolesHistory) ? item.rolesHistory : [],
      weeklySanctions:
        item.weeklySanctions != null && Number.isFinite(Number(item.weeklySanctions))
          ? Number(item.weeklySanctions)
          : null,
      sanctionLimit:
        item.sanctionLimit != null && Number.isFinite(Number(item.sanctionLimit))
          ? Number(item.sanctionLimit)
          : sanzioniParsed.min
            ? Number(sanzioniParsed.min)
            : null,
    };
  }

  function formatVoiceHours(sec) {
    var s = Math.max(0, Number(sec) || 0);
    var h = s / 3600;
    if (h >= 10) return h.toFixed(1).replace(/\.0$/, "") + "h";
    return h.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + "h";
  }

  function weekdayShortFromDayKey(dayKey) {
    try {
      var parts = String(dayKey || "").split("-");
      if (parts.length !== 3) return "—";
      var dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12));
      return dt.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "");
    } catch (e) {
      return "—";
    }
  }

  function renderCostanzaBarChart(chart) {
    var points = Array.isArray(chart)
      ? chart
          .slice()
          .sort(function (a, b) {
            return String(a.dayKey || "").localeCompare(String(b.dayKey || ""));
          })
          .slice(-7)
      : [];
    if (!points.length) {
      return (
        '<div class="vc-staff-reso-chart vc-staff-reso-chart--empty">' +
        '<p>Costanza non disponibile per questo resoconto.</p></div>'
      );
    }
    var maxMsgRaw = 0;
    var maxVoiceRaw = 0;
    points.forEach(function (p) {
      maxMsgRaw = Math.max(maxMsgRaw, Number(p.text) || 0);
      maxVoiceRaw = Math.max(maxVoiceRaw, (Number(p.voiceSeconds) || 0) / 3600);
    });
    var maxMsg = niceChartCeil(maxMsgRaw, "msg");
    var maxVoiceH = niceChartCeil(maxVoiceRaw, "voice");
    var bars = points
      .map(function (p) {
        var msg = Math.max(0, Number(p.text) || 0);
        var voiceH = Math.max(0, (Number(p.voiceSeconds) || 0) / 3600);
        var msgPct = msg > 0 ? Math.max(3, Math.round((100 * msg) / maxMsg)) : 0;
        var voicePct = voiceH > 0.004 ? Math.max(3, Math.round((100 * voiceH) / maxVoiceH)) : 0;
        var label = weekdayShortFromDayKey(p.dayKey);
        var dayNum = String(p.dayKey || "").slice(8, 10);
        var voiceLabel = formatVoiceHours(p.voiceSeconds);
        return (
          '<div class="vc-staff-reso-chart__col" title="' +
          T.esc(label + " " + dayNum + " · " + msg + " msg · " + voiceLabel) +
          '">' +
          '<div class="vc-staff-reso-chart__pair">' +
          '<div class="vc-staff-reso-chart__slot">' +
          '<span class="vc-staff-reso-chart__val vc-staff-reso-chart__val--msg' +
          (msg > 0 ? "" : " is-empty") +
          '">' +
          T.esc(msg > 0 ? String(msg) : "0") +
          "</span>" +
          '<div class="vc-staff-reso-chart__track">' +
          '<span class="vc-staff-reso-chart__bar vc-staff-reso-chart__bar--msg" style="height:' +
          msgPct +
          '%"></span></div></div>' +
          '<div class="vc-staff-reso-chart__slot">' +
          '<span class="vc-staff-reso-chart__val vc-staff-reso-chart__val--voice' +
          (voiceH > 0.004 ? "" : " is-empty") +
          '">' +
          T.esc(voiceH > 0.004 ? voiceLabel : "0h") +
          "</span>" +
          '<div class="vc-staff-reso-chart__track">' +
          '<span class="vc-staff-reso-chart__bar vc-staff-reso-chart__bar--voice" style="height:' +
          voicePct +
          '%"></span></div></div></div>' +
          '<div class="vc-staff-reso-chart__day"><b>' +
          T.esc(label) +
          "</b><span>" +
          T.esc(dayNum) +
          "</span></div></div>"
        );
      })
      .join("");
    var active = points.filter(function (p) {
      return (Number(p.text) || 0) > 0 || (Number(p.voiceSeconds) || 0) >= 600;
    }).length;
    return (
      '<section class="vc-staff-reso-section vc-staff-reso-section--chart">' +
      '<div class="vc-staff-reso-section__head">' +
      "<h3>Costanza</h3>" +
      '<span class="vc-staff-reso-pill">' +
      T.esc(String(active) + "/" + String(points.length) + " giorni attivi") +
      "</span></div>" +
      '<div class="vc-staff-reso-chart__legend">' +
      '<span><i class="vc-staff-reso-chart__swatch vc-staff-reso-chart__swatch--msg"></i> Messaggi</span>' +
      '<span><i class="vc-staff-reso-chart__swatch vc-staff-reso-chart__swatch--voice"></i> Ore in voc</span>' +
      "</div>" +
      '<div class="vc-staff-reso-chart" role="img" aria-label="Grafico costanza messaggi e ore vocali">' +
      bars +
      "</div></section>"
    );
  }

  function dedupeResoRoleRows(rows) {
        if (!Array.isArray(rows) || !rows.length) return [];
    var aliases = {
      mod: "moderator",
      mods: "moderator",
      moderator: "moderator",
      "senior moderator": "senior moderator",
      "sr moderator": "senior moderator",
      srmod: "senior moderator",
      "senior mod": "senior moderator",
      helper: "helper",
      "trial helper": "helper",
      "partner manager": "partner manager",
      pm: "partner manager",
      director: "director",
      admin: "admin",
      manager: "manager",
      founder: "founder",
      member: "member",
    };
    function normRole(value) {
      var s = String(value == null ? "" : value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      if (!s) return "";
      if (aliases[s]) return aliases[s];
      if (s.charAt(s.length - 1) === "s" && aliases[s.slice(0, -1)]) return aliases[s.slice(0, -1)];
      return s;
    }
    function dayKey(iso) {
      if (!iso) return "";
      try {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Rome",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(iso));
      } catch (eDay) {
        return String(iso).slice(0, 10);
      }
    }
    function preferRow(a, b) {
      var aLen =
        String(a && (a.to || a.newRole || "")).length + String(a && (a.from || a.oldRole || "")).length;
      var bLen =
        String(b && (b.to || b.newRole || "")).length + String(b && (b.from || b.oldRole || "")).length;
      return bLen > aLen ? b : a;
    }
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (!row) continue;
      var fromRaw = String(row.from || row.oldRole || "").trim();
      var toRaw = String(row.to || row.newRole || "").trim();
      var from = normRole(fromRaw);
      var to = normRole(toRaw);
      var day = dayKey(row.dateIso || row.date || "");
      var reason = String(row.reason || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      var tripKey = from && to ? day + "|" + from + "|" + to : "";
      var key = day + "|" + from + "|" + to + "|" + reason;
      var softKey = to ? day + "|*|" + to + "|" + reason : "";
      if (!from && !to) {
        out.push(row);
        continue;
      }
      if (tripKey && Object.prototype.hasOwnProperty.call(seen, tripKey)) {
        out[seen[tripKey]] = preferRow(out[seen[tripKey]], row);
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(seen, key)) {
        out[seen[key]] = preferRow(out[seen[key]], row);
        continue;
      }
      if (softKey && Object.prototype.hasOwnProperty.call(seen, softKey)) {
        out[seen[softKey]] = preferRow(out[seen[softKey]], row);
        continue;
      }
      var idx = out.length;
      if (tripKey) seen[tripKey] = idx;
      seen[key] = idx;
      if (softKey) seen[softKey] = idx;
      out.push(row);
    }
    return out;
  }

  function normalizeResoCareerRoleToken(value) {
    var s = String(value == null ? "" : value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (!s) return "";
    var aliases = {
      mod: "moderator",
      mods: "moderator",
      moderator: "moderator",
      "senior moderator": "senior moderator",
      "sr moderator": "senior moderator",
      srmod: "senior moderator",
      "senior mod": "senior moderator",
      helper: "helper",
      "trial helper": "helper",
      "partner manager": "partner manager",
      pm: "partner manager",
      director: "director",
      admin: "admin",
      manager: "manager",
      founder: "founder",
      member: "member",
    };
    if (aliases[s]) return aliases[s];
    if (/\bstaff\b/.test(s)) {
      var withoutStaff = s.replace(/\bstaff\b/g, " ").replace(/\s+/g, " ").trim();
      if (withoutStaff && aliases[withoutStaff]) return aliases[withoutStaff];
    }
    if (s.charAt(s.length - 1) === "s" && aliases[s.slice(0, -1)]) return aliases[s.slice(0, -1)];
    return s;
  }

  function filterResoRolesToProfileCareer(rows, opts) {
    opts = opts || {};
    var mapped = (Array.isArray(rows) ? rows : [])
      .filter(Boolean)
      .map(function (row) {
        var from = String(row.from || row.oldRole || "").trim();
        var to = String(row.to || row.newRole || "").trim();
        return {
          from: from || null,
          to: to || null,
          oldRole: from || null,
          newRole: to || null,
          dateIso: row.dateIso || row.date || null,
          date: row.date || row.dateIso || null,
          dateLabel: row.dateLabel || null,
          reason: row.reason || null,
        };
      });
    var R = typeof window !== "undefined" ? window.VCStaffProfileRender : null;
    if (R && typeof R.sliceToLatestCareer === "function" && typeof R.dedupeCareerRows === "function") {
      return R.dedupeCareerRows(
        R.sliceToLatestCareer(mapped, {
          stillActive: opts.stillActive !== false,
          currentRole: opts.currentRole || "",
          track: opts.track || "staff",
        }),
      );
    }
    // Fallback: same rules as profilo carriera (staff-profile-render).
    function careerRowSortMs(row) {
      var iso = row && (row.dateIso || row.date);
      if (!iso) return 0;
      var t = new Date(iso).getTime();
      return Number.isFinite(t) ? t : 0;
    }
    function isOnLadder(token) {
      if (!token || token === "member" || token === "community" || token === "partner manager") return false;
      return !!(
        {
          helper: 1,
          moderator: 1,
          "senior moderator": 1,
          director: 1,
          admin: 1,
          manager: 1,
          founder: 1,
        }[token]
      );
    }
    function isPm(token) {
      return token === "partner manager";
    }
    var chrono = mapped.slice().sort(function (a, b) {
      return careerRowSortMs(a) - careerRowSortMs(b);
    });
    var stillActive = opts.stillActive !== false;
    var currentRole = normalizeResoCareerRoleToken(opts.currentRole || "");
    var trackPm = opts.track === "pm" || isPm(currentRole);
    var start = 0;
    var found = false;
    var onTrack = false;
    var i;
    if (trackPm) {
      for (i = 0; i < chrono.length; i += 1) {
        var toPm = normalizeResoCareerRoleToken(chrono[i].newRole);
        var fromPm = normalizeResoCareerRoleToken(chrono[i].oldRole);
        if (isPm(toPm) && !isPm(fromPm)) {
          start = i;
          found = true;
          onTrack = true;
          continue;
        }
        if (onTrack && isPm(fromPm) && !isPm(toPm)) onTrack = false;
      }
      if (!found) return [];
      if (!onTrack && !stillActive) return [];
      var keptPm = [];
      for (var j = start; j < chrono.length; j += 1) {
        var toJ = normalizeResoCareerRoleToken(chrono[j].newRole);
        var fromJ = normalizeResoCareerRoleToken(chrono[j].oldRole);
        if (isPm(toJ)) {
          keptPm.push(chrono[j]);
          continue;
        }
        if (isPm(fromJ) && !isPm(toJ)) break;
      }
      return keptPm.sort(function (a, b) {
        return careerRowSortMs(b) - careerRowSortMs(a);
      });
    }
    for (i = 0; i < chrono.length; i += 1) {
      var to = normalizeResoCareerRoleToken(chrono[i].newRole);
      var from = normalizeResoCareerRoleToken(chrono[i].oldRole);
      if (isOnLadder(to) && (!isOnLadder(from) || !onTrack)) {
        start = i;
        found = true;
        onTrack = true;
        continue;
      }
      if (onTrack && !isOnLadder(to)) onTrack = false;
    }
    if (!found) {
      if (!stillActive) return [];
      start = 0;
    } else if (!onTrack && !stillActive) {
      return [];
    }
    var endExclusive = chrono.length;
    while (
      endExclusive > start &&
      !isOnLadder(normalizeResoCareerRoleToken(chrono[endExclusive - 1].newRole))
    ) {
      endExclusive -= 1;
    }
    if (endExclusive <= start) return [];
    return chrono.slice(start, endExclusive).sort(function (a, b) {
      return careerRowSortMs(b) - careerRowSortMs(a);
    });
  }

  function renderRolesChronology(rows, opts) {
    opts = opts || {};
    var raw = Array.isArray(rows) ? rows.filter(Boolean) : [];
    var list = dedupeResoRoleRows(raw);
    list = filterResoRolesToProfileCareer(list, opts);
    if (!list.length) return "";
    var items = list
      .map(function (row) {
        var to = String(row.to || row.newRole || "").trim();
        var from = String(row.from || row.oldRole || "").trim();
        // Never show bare snowflakes in the UI.
        if (/^\d{16,22}$/.test(to)) to = "";
        if (/^\d{16,22}$/.test(from)) from = "";
        if (!to && !from) return "";
        var when = String(row.dateLabel || "").trim();
        var label = to ? (from ? from + " \u2192 " + to : to) : from;
        return (
          '<li><span class="vc-staff-reso-hero__role-name">' +
          T.esc(label) +
          "</span>" +
          (when ? '<span class="vc-staff-reso-hero__role-date">' + T.esc(when) + "</span>" : "") +
          "</li>"
        );
      })
      .filter(Boolean)
      .join("");
    if (!items) return "";
    return (
      '<div class="vc-staff-reso-hero__roles" aria-label="Cronologia ruoli">' +
      '<p class="vc-staff-reso-hero__roles-kicker">Cronologia ruoli</p>' +
      '<ul class="vc-staff-reso-hero__roles-list">' +
      items +
      "</ul></div>"
    );
  }

  function ensureResoSheet() {
    var sheet = document.getElementById("vc-staff-reso-sheet");
    if (sheet && sheet.getAttribute("data-reso-bound") === "resoClose10") return sheet;
    if (sheet) {
      try {
        sheet.remove();
      } catch (eRm) {}
    }
    sheet = document.createElement("div");
    sheet.id = "vc-staff-reso-sheet";
    sheet.className = "vc-staff-reso-sheet";
    sheet.setAttribute("data-reso-bound", "resoClose10");
    sheet.hidden = true;
    sheet.innerHTML =
      '<button type="button" class="vc-staff-reso-sheet__backdrop" data-reso-close="1" aria-label="Chiudi"></button>' +
      '<div class="vc-staff-reso-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="vc-staff-reso-title">' +
      '<div class="vc-staff-reso-sheet__head">' +
      "<div><p class=\"vc-staff-reso-sheet__kicker\">Resoconto</p>" +
      '<h2 id="vc-staff-reso-title" class="vc-staff-reso-sheet__title">Dettaglio</h2></div>' +
      '<button type="button" class="vc-staff-reso-sheet__close" data-reso-close="1" aria-label="Chiudi">\u2715</button>' +
      "</div>" +
      '<div class="vc-staff-reso-sheet__body" id="vc-staff-reso-body"></div>' +
      '<div class="vc-staff-reso-sheet__foot" id="vc-staff-reso-foot"></div>' +
      "</div>";
    document.body.appendChild(sheet);
    /* backup locale; path principale = wireInboxSheetActionDelegation (document capture) */
    document.addEventListener("keydown", function resoEsc(ev) {
      if (ev.key !== "Escape") return;
      if (!sheet || sheet.hidden || !sheet.classList.contains("is-in")) return;
      ev.preventDefault();
      closeDetail({ force: true });
    });
    return sheet;
  }

  function cancelInboxSheetOpenRaf() {
    try {
      if (window.__vcInboxSheetOpenRaf) {
        window.cancelAnimationFrame(window.__vcInboxSheetOpenRaf);
        window.__vcInboxSheetOpenRaf = 0;
      }
    } catch (eRaf) {}
  }

  function closeResoSheet(silent, opts) {
    opts = opts || {};
    /* inboxClickOpen5: clearDetailState/renderList NON devono killare lo sheet appena aperto */
    if (!opts.force && sheetOpenGuardActive()) {
      try {
        window.__vcInboxLastOpenErr = "closeResoBlocked:" + (Date.now() - inboxSheetOpenedAt) + "ms";
      } catch (eBlk2) {}
      return;
    }
    cancelInboxSheetOpenRaf();
    try {
      window.clearInterval(window.__vcInboxSheetUnlockBeat);
      window.__vcInboxSheetUnlockBeat = 0;
    } catch (eHb) {}
    var sheet = document.getElementById("vc-staff-reso-sheet");
    try {
      document.documentElement.classList.remove("vc-staff-reso-sheet-open");
    } catch (e) {}
    /* ripristina banner cookie dopo close */
    try {
      var ban = document.getElementById("vc-necessity-banner");
      if (ban) {
        ban.style.removeProperty("display");
        ban.style.removeProperty("pointer-events");
        ban.style.removeProperty("visibility");
        ban.removeAttribute("aria-hidden");
      }
    } catch (eBan) {}
    if (!sheet) return;
    sheet.classList.remove("is-in", "is-open-guard");
    sheet.hidden = true;
    sheet.setAttribute("hidden", "");
    try {
      sheet.style.setProperty("display", "none", "important");
      sheet.style.setProperty("pointer-events", "none", "important");
    } catch (eSt) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSync) {}
    if (!silent) {
          }
  }

  function openResoSheet() {
    var sheet = ensureResoSheet();
    var alreadyOpen = false;
    try {
      alreadyOpen = !sheet.hidden && !sheet.hasAttribute("hidden") && sheet.classList.contains("is-in");
    } catch (eAlready) {}
    cancelInboxSheetOpenRaf();
    sheet.hidden = false;
    try {
      sheet.removeAttribute("hidden");
    } catch (eHid) {}
    try {
      sheet.style.removeProperty("display");
      sheet.style.removeProperty("pointer-events");
    } catch (eStOpen) {}
    try {
      document.documentElement.classList.add("vc-staff-reso-sheet-open");
    } catch (e) {}
    unlockSheetInteractions();
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSync) {}
    try {
      sheet.classList.add("is-in");
    } catch (eIn) {}
    ensureSheetForceVisibleCss();
    forceSheetInlineVisible(sheet);
    try {
      if (sheet.parentNode !== document.body) document.body.appendChild(sheet);
    } catch (eMove) {}
    /* heartbeat: se hold/banner tornano, ri-sblocca finché lo sheet è aperto */
    try {
      window.clearInterval(window.__vcInboxSheetUnlockBeat);
      window.__vcInboxSheetUnlockBeat = window.setInterval(function () {
        try {
          if (!document.documentElement.classList.contains("vc-staff-reso-sheet-open")) {
            window.clearInterval(window.__vcInboxSheetUnlockBeat);
            window.__vcInboxSheetUnlockBeat = 0;
            return;
          }
          /* inboxClickOpen10d: niente sheet fantasma dopo switch tab (detail già azzerato) */
          if (!state.selectedKey && !state.detail && !state.detailLoading) {
            closeResoSheet(true, { force: true });
            window.clearInterval(window.__vcInboxSheetUnlockBeat);
            window.__vcInboxSheetUnlockBeat = 0;
            return;
          }
          unlockSheetInteractions();
          forceSheetInlineVisible(document.getElementById("vc-staff-reso-sheet"));
        } catch (eBeat) {}
      }, 400);
    } catch (eHb) {}
    if (alreadyOpen) return;
    try {
      window.__vcInboxSheetOpenRaf = window.requestAnimationFrame(function () {
        window.__vcInboxSheetOpenRaf = 0;
        try {
          /* se nel frattempo abbiamo chiuso (azione confermata), non riaprire */
          if (!document.documentElement.classList.contains("vc-staff-reso-sheet-open")) return;
          if (!state.selectedKey && !state.detail) return;
      sheet.classList.add("is-in");
          forceSheetInlineVisible(sheet);
          unlockSheetInteractions();
        } catch (eRaf) {}
    });
    } catch (eRaf2) {}
  }

  function splitAutoValutazioneParts(azione) {
    var raw = stripResocontoText(azione || "");
    if (!raw || /^—$|^-$|^nulla$/i.test(raw)) return [];
    return raw
      .split(/\s*\+\s*/)
      .map(function (part) {
        return String(part || "").trim();
      })
      .filter(Boolean);
  }

  function renderPmEsitoBox(model) {
    var raw = stripResocontoText((model && model.azione) || "") || "Nulla";
    // Collapse duplicated "Nulla + Nulla" / "Nulla — Nulla" noise from older payloads.
    raw = String(raw)
      .replace(/(?:^|\s*)nulla(?:\s*[+—–-]\s*nulla)+/gi, "Nulla")
      .replace(/\s{2,}/g, " ")
      .trim();
    var label = "Nulla";
    var hint =
      "Esito automatico Partner Manager: sotto 30 partner \u2192 Richiamo; sotto soglia critica \u2192 Depex; altrimenti Nulla (o promozione in finestra).";
    if (/^depex\b/i.test(raw) || /\bdepex\b/i.test(raw)) label = "Depex";
    else if (/^richiamo\b/i.test(raw) || /\brichiamo\b/i.test(raw)) label = "Richiamo";
    else if (/^pex\b/i.test(raw) || /\bpex\b/i.test(raw)) label = "Pex";
    else if (/^nulla\b/i.test(raw) || /^—$|^-$/i.test(raw)) label = "Nulla";
    else label = raw.slice(0, 64) || "Nulla";
    return (
      '<article id="vc-staff-reso-auto-box" class="vc-staff-reso-grade vc-staff-reso-grade--action vc-staff-reso-grade--wide vc-staff-reso-auto vc-staff-reso-auto--pm" data-pm-esito="1">' +
      '<div class="vc-staff-reso-grade__head"><span>Esito proposto</span>' +
      resoTipHtml(hint) +
      "</div>" +
      '<p class="vc-staff-reso-auto__pm-outcome"><strong>' +
      T.esc(label) +
      "</strong></p></article>"
    );
  }

  function renderAutoValutazioniBox(model, isPm) {
    if (isPm) return renderPmEsitoBox(model);
    var parts = splitAutoValutazioneParts(model.azione);
    if (!parts.length && model.azione && !/^—$/.test(model.azione)) {
      parts = [model.azione];
    }
    var autoTip =
      "Proposte automatiche da attività/condotta, limiti, pause e compito sanzioni. Conferma o rifiuta sotto.";
    var sanzioniDone = null;
    var sanzioniMin = null;
    if (model.sanctionLimit != null && Number.isFinite(Number(model.sanctionLimit))) {
      sanzioniMin = Number(model.sanctionLimit);
      sanzioniDone =
        model.weeklySanctions != null && Number.isFinite(Number(model.weeklySanctions))
          ? Number(model.weeklySanctions)
          : model.sanzioni
            ? Number(String(model.sanzioni).replace(/[^\d]/g, "")) || null
            : null;
      if (sanzioniDone != null) {
        autoTip +=
          " Compito sanzioni: " + sanzioniDone + "/" + sanzioniMin + " questa settimana.";
      }
    }
    var rows =
      parts.length > 0
        ? parts
            .map(function (part) {
              var isNeg = /valutazione negativa/i.test(part);
              var isCompito = /compito sanzioni/i.test(part);
              var isPos = /valutazione positiva/i.test(part) || isCompito;
              var isSimple =
                /^nulla\b/i.test(part) || /^richiamo\b/i.test(part) || /^depex\b/i.test(part);
              var tone = isNeg ? "is-neg" : isPos ? "is-pos" : "is-neutral";
              var title = isNeg
                ? "Valutazione negativa"
                : isCompito
                  ? "Compito sanzioni"
                  : isPos
                    ? "Valutazione positiva"
                    : /^nulla\b/i.test(part)
                      ? "Nulla"
                      : /^richiamo\b/i.test(part)
                        ? "Richiamo"
                        : /^depex\b/i.test(part)
                          ? "Depex"
                          : "Esito";
              var already = /gi[aà]\s*registrat/i.test(part);
              var detail = "";
              var purposeMatch = String(part || "").match(
                /[—–]\s*(.+?)(?:\s*\(\s*gi[aà]\s*registrat[aoe]?\s*\))?\s*$/i,
              );
              if (purposeMatch && purposeMatch[1]) {
                detail = String(purposeMatch[1] || "")
                  .replace(/\(\s*gi[aà]\s*registrat[aoe]?\s*\)/gi, "")
                  .replace(/\bgi[aà]\s*registrat[aoe]?\b/gi, "")
                  .replace(/\s{2,}/g, " ")
                  .replace(/\s*[—–-]\s*$/g, "")
                  .trim();
              }
              if (!detail) {
                detail = String(part || "")
                  .replace(/^Valutazione (Positiva|Negativa)\s*[—–-]?\s*/i, "")
                  .replace(/\(\s*gi[aà]\s*registrat[aoe]?\s*\)/gi, "")
                  .replace(/\bgi[aà]\s*registrat[aoe]?\b/gi, "")
                  .replace(/\s{2,}/g, " ")
                  .replace(/\s*[—–-]\s*$/g, "")
                  .trim();
              }
              if (isSimple && (!detail || /^nulla$|^richiamo$|^depex$/i.test(detail))) {
                return (
                  '<li class="vc-staff-reso-auto__item ' +
                  tone +
                  ' is-simple"><strong>' +
                  T.esc(title) +
                  "</strong>" +
                  (already
                    ? '<span class="vc-staff-reso-flag vc-staff-reso-flag--done">già registrata</span>'
                    : "") +
                  "</li>"
                );
              }
              if (isCompito) {
                if (!detail || /^compito sanzioni\s*$/i.test(detail)) {
                  detail = "compito sanzioni completato";
                }
                if (sanzioniMin != null && sanzioniDone != null) {
                  detail =
                    "minimo sanzioni raggiunto (" + sanzioniDone + "/" + sanzioniMin + ")";
                } else if (/^completato\.?$/i.test(detail)) {
                  detail = "compito sanzioni completato";
                }
              }
              if (!detail || /gi[aà]\s*registrat/i.test(detail)) {
                detail = isCompito
                  ? "compito sanzioni completato"
                  : isPos
                    ? "valutazione positiva"
                    : isNeg
                      ? "valutazione negativa"
                      : String(part || "").replace(/\bgi[aà]\s*registrat[aoe]?\b/gi, "").trim() ||
                        "\u2014";
              }
              if (detail.toLowerCase() === title.toLowerCase()) {
                return (
                  '<li class="vc-staff-reso-auto__item ' +
                  tone +
                  ' is-simple"><strong>' +
                  T.esc(title) +
                  "</strong>" +
                  (already
                    ? '<span class="vc-staff-reso-flag vc-staff-reso-flag--done">già registrata</span>'
                    : "") +
                  "</li>"
                );
              }
              return (
                '<li class="vc-staff-reso-auto__item ' +
                tone +
                '"><span class="vc-staff-reso-auto__kind">' +
                T.esc(title) +
                (already
                  ? '<span class="vc-staff-reso-flag vc-staff-reso-flag--done">già registrata</span>'
                  : "") +
                "</span><strong>" +
                T.esc(detail) +
                "</strong></li>"
              );
            })
            .join("")
        : '<li class="vc-staff-reso-auto__item is-neutral is-simple"><strong>Nulla</strong></li>';
    return (
      '<article id="vc-staff-reso-auto-box" class="vc-staff-reso-grade vc-staff-reso-grade--action vc-staff-reso-grade--wide vc-staff-reso-auto">' +
      '<div class="vc-staff-reso-grade__head"><span>Valutazioni automatiche</span>' +
      resoTipHtml(autoTip) +
      "</div>" +
      '<ul class="vc-staff-reso-auto__list">' +
      rows +
      "</ul></article>"
    );
  }

  function renderResoSheet(item) {
    if (!item) return;
    openResoSheet();
    var sheet = ensureResoSheet();
    var body = sheet.querySelector("#vc-staff-reso-body");
    var foot = sheet.querySelector("#vc-staff-reso-foot");
    var titleEl = sheet.querySelector("#vc-staff-reso-title");
    var model = parseResocontoDetailModel(item);
    var isPm = model.isPm || String(item.kind || "").toLowerCase() === "p";
    var kindLabel = isPm ? "Partner Manager" : "Staff";
    var limits = model.limits || {};
    sheet.classList.remove("is-cand-sheet", "is-appeal-sheet", "is-pause-sheet");
    sheet.classList.add("is-reso-sheet");
    var displayName =
      cleanDiscordText(item.displayName || "") || itemTitle(item) || "Resoconto";
    // Nickname only in the hero (next to avatar), never as sheet header title.
    clearSheetTitle(titleEl);
    var kicker = sheet.querySelector(".vc-staff-reso-sheet__kicker");
    if (kicker) {
      kicker.textContent =
        "Resoconto · " + kindLabel + (item.weekLabel ? " · " + item.weekLabel : "");
    }

    var msgTip =
      limits.messages != null
        ? "Limite settimanale " +
          limits.label +
          ": " +
          limits.messages +
          " messaggi. Scambio ammesso: 100 msg ↔ 1 ora vocale."
        : isPm
          ? "I Partner Manager non hanno limite messaggi settimanale."
          : "Nessun limite messaggi per questo ruolo.";
    var oreTip =
      limits.hours != null
        ? "Limite settimanale " +
          limits.label +
          ": " +
          formatHoursLimit(limits.hours) +
          " ore in vocale. Scambio ammesso: 100 msg ↔ 1 ora."
        : isPm
          ? "I Partner Manager non hanno limite ore vocali settimanale."
          : "Nessun limite ore vocali per questo ruolo.";
    var sanzTip =
      limits.sanctions != null
        ? "Minimo settimanale " +
          limits.label +
          ": " +
          limits.sanctions +
          " sanzioni applicate (warn/mute/kick/ban)."
        : "Nessun minimo sanzioni per questo ruolo.";
    var partnerTip = "Minimo settimanale Partner Manager: 30 partner.";
    var activityTip =
      limits.messages != null
        ? "Attività su limiti " +
          limits.label +
          " (" +
          limits.messages +
          " msg / " +
          formatHoursLimit(limits.hours) +
          "h, scambio 100↔1h): Sufficiente = 1×; Discreto = +150 msg/+1,5h; Buono = 2×; Ottimo = 2×+300/+2h; Eccellente = 3×."
        : "Ruolo senza griglia messaggi/vocale: Attività = Nessun limite.";
    var conductTip =
      "Condotta da valutazioni ±: Ottimo ≥3 positive e 0 negative; Discreto se positive > negative; Sufficiente se pari o nessuna; Insufficiente se negative > positive; Non classificato se solo negative.";

    var gradeCards;
    var stats;
    if (isPm) {
      stats =
        '<div class="vc-staff-reso-stats vc-staff-reso-stats--pm">' +
        '<div class="vc-staff-reso-stat"><div class="vc-staff-reso-stat__head"><span>Partner</span>' +
        resoTipHtml(partnerTip) +
        '</div><div class="vc-staff-reso-stat__value"><strong>' +
        T.esc(model.partnersLabel) +
        "</strong></div></div>" +
        '<div class="vc-staff-reso-stat"><div class="vc-staff-reso-stat__head"><span>Minimo</span>' +
        resoTipHtml(partnerTip) +
        '</div><div class="vc-staff-reso-stat__value"><strong>30</strong></div></div></div>';
      gradeCards =
        '<div class="vc-staff-reso-grades vc-staff-reso-grades--pm">' +
        renderAutoValutazioniBox(model, true) +
        "</div>";
    } else {
      stats =
        '<div class="vc-staff-reso-stats">' +
        '<div class="vc-staff-reso-stat"><div class="vc-staff-reso-stat__head"><span>Messaggi</span>' +
        resoTipHtml(msgTip) +
        '</div><div class="vc-staff-reso-stat__value"><strong>' +
        T.esc(model.msgs != null ? String(model.msgs) : "—") +
        "</strong></div></div>" +
        '<div class="vc-staff-reso-stat"><div class="vc-staff-reso-stat__head"><span>Ore vocali</span>' +
        resoTipHtml(oreTip) +
        '</div><div class="vc-staff-reso-stat__value"><strong>' +
        T.esc(model.oreLabel) +
        "</strong></div></div>" +
        '<div class="vc-staff-reso-stat"><div class="vc-staff-reso-stat__head"><span>Sanzioni</span>' +
        resoTipHtml(sanzTip) +
        '</div><div class="vc-staff-reso-stat__value"><strong>' +
        T.esc(model.sanzioni || "—") +
        "</strong></div></div></div>";
      gradeCards =
        '<div class="vc-staff-reso-grades">' +
        '<article class="vc-staff-reso-grade"><div class="vc-staff-reso-grade__head"><span>Attività</span>' +
        resoTipHtml(activityTip) +
        "</div><strong>" +
        T.esc(model.activity) +
        "</strong></article>" +
        '<article class="vc-staff-reso-grade"><div class="vc-staff-reso-grade__head"><span>Condotta</span>' +
        resoTipHtml(conductTip) +
        "</div><strong>" +
        T.esc(model.conduct) +
        "</strong></article>" +
        renderAutoValutazioniBox(model, false) +
        "</div>";
    }

    var extras = "";
    if (model.pause) {
      extras += '<p class="vc-staff-reso-note"><b>Pausa</b> · ' + T.esc(model.pause) + "</p>";
    }
    if (isPm && model.partners != null && model.partners < 30) {
      extras +=
        '<p class="vc-staff-reso-note vc-staff-reso-note--warn"><b>Sotto soglia</b> · servono almeno 30 partner nella settimana.</p>';
    }

    var heroFlags = resocontoFlagBadgesHtml(item);
    var isPmTrack = isPm || String(item.kind || "").toLowerCase() === "p";
    var sheetRoleLabel =
      resocontoRoleBadgeLabel(item) ||
      cardMeta(item, { roleOnly: true }) ||
      (isPmTrack ? "Partner Manager" : "") ||
      "";
    var rolesChrono = renderRolesChronology(model.rolesHistory || item.rolesHistory || [], {
      stillActive: true,
      track: isPmTrack ? "pm" : "staff",
      currentRole: isPmTrack ? "Partner Manager" : sheetRoleLabel || "",
    });
    captureWorkflowChatDraft();
    // sheetNoActionBadge1: niente badge azione (Nulla / Val+/…) nell'hero — restano solo flag contesto.
    body.innerHTML =
      '<div class="vc-staff-reso-hero vc-staff-reso-hero--reso' +
      (rolesChrono ? " has-roles" : "") +
      '">' +
      '<span class="vc-staff-avatar-wrap vc-staff-avatar-wrap--lg">' +
      T.avatarImgHtml(item.avatarUrl, item.userId, { width: 64, height: 64 }) +
      '</span><div class="vc-staff-reso-hero__main">' +
      '<h3 class="vc-staff-reso-hero__name">' +
      T.esc(displayName) +
      "</h3>" +
      '<p class="vc-staff-reso-hero__meta">' +
      T.esc(sheetRoleLabel || kindLabel) +
      "</p>" +
      (heroFlags
        ? '<div class="vc-staff-reso-hero__badges">' + heroFlags + "</div>"
        : "") +
      "</div>" +
      rolesChrono +
      "</div>" +
      stats +
      (isPm ? "" : renderCostanzaBarChart(model.chart)) +
      '<section class="vc-staff-reso-section"><div class="vc-staff-reso-section__head"><h3>' +
      (isPm ? "Esito" : "Valutazione") +
      "</h3></div>" +
      gradeCards +
      extras +
      "</section>" +
      renderDecisionMeta(item) +
      '<section class="vc-staff-reso-section vc-staff-reso-section--chat"><div class="vc-staff-reso-section__head"><h3>Chat</h3></div>' +
      renderChatPanel(item) +
      "</section>";

    foot.innerHTML = actionButtons(item, "resoconti") || "";
    bindActionButtons(foot, item);
    bootChatForDetail(item);
    scanInboxAvatars(sheet);
    clearInboxSoftLoadingUi();
  }

  function normalizeCandidaturaDetailFields(fields, item) {
    var uid = String((item && item.userId) || "").trim();
    return (Array.isArray(fields) ? fields : [])
      .filter(function (field) {
        if (!field) return false;
        return !/^(utente|user)$/i.test(String(field.name || "").trim());
      })
      .map(function (field) {
        var name = String(field.name || "").trim();
        var value = String(field.value || "").trim();
        var idName = name.match(/^(?:\d{1,2}\.\s*)?(ID(?:\s+Discord)?)$/i);
        if (idName) {
          var lines = value
            .split(/\n+/)
            .map(function (l) {
              return String(l || "").trim();
            })
            .filter(Boolean);
          var snow = "";
          for (var i = 0; i < lines.length; i += 1) {
            var m = lines[i].match(/(\d{16,22})/);
            if (m) {
              snow = m[1];
              break;
            }
          }
          if (!snow) {
            var inline = value.match(/(\d{16,22})/);
            if (inline) snow = inline[1];
          }
          if (!snow && uid) snow = uid;
          return { name: "1. ID Discord", value: snow || value || "\u2014" };
        }
        // "Discord" alone as value prefix under a plain ID question
        if (/^(?:\d{1,2}\.\s*)?ID$/i.test(name) && /^discord\b/i.test(value)) {
          var onlyId = (value.match(/(\d{16,22})/) || [])[1] || uid || value.replace(/^discord\s*/i, "").trim();
          return { name: "1. ID Discord", value: onlyId || "\u2014" };
        }
        return field;
      });
  }

  function candidaturaRoleLabel(item) {
    return formatWorkflowType(item && item.type) || "";
  }

  function candidaturaKickerLabel(item) {
    var role = candidaturaRoleLabel(item);
    return role ? "Candidatura " + role : "Candidatura";
  }

  function candidaturaDisplayName(item) {
    var name = cleanDiscordText((item && item.displayName) || "");
    if (
      name &&
      !isRoleSlug(name, item && item.type) &&
      !/^\d{16,22}$/.test(name) &&
      !looksLikeCandidaturaTitle(name)
    ) {
      return name;
    }
    return "";
  }

  function renderCandSheet(item) {
    openResoSheet();
    var sheet = ensureResoSheet();
    var body = sheet.querySelector("#vc-staff-reso-body");
    var foot = sheet.querySelector("#vc-staff-reso-foot");
    var titleEl = sheet.querySelector("#vc-staff-reso-title");
    var kicker = sheet.querySelector(".vc-staff-reso-sheet__kicker");
    if (!body || !foot) return;
    sheet.classList.remove("is-reso-sheet", "is-appeal-sheet", "is-pause-sheet");
    sheet.classList.add("is-cand-sheet");
    if (kicker) kicker.textContent = candidaturaKickerLabel(item);
    var displayName = candidaturaDisplayName(item);
    if (!displayName) {
      var fallbackTitle = itemTitle(item);
      if (
        fallbackTitle &&
        !looksLikeCandidaturaTitle(fallbackTitle) &&
        !/^candidatura\b/i.test(fallbackTitle) &&
        !isRoleSlug(fallbackTitle, item && item.type)
      ) {
        displayName = fallbackTitle;
      }
    }
    if (!displayName) displayName = "Candidatura";
    // Nickname only beside the avatar — header title stays empty.
    clearSheetTitle(titleEl);
    var detailErrorHtml = state.detailError
      ? '<div class="vc-staff-inbox-detail__error" role="alert">' + T.esc(state.detailError) + "</div>"
      : "";
    var candFull =
      String(item.content || "").length > 200 ||
      String(item.body || "").length > 200 ||
      (Array.isArray(item.fields) && item.fields.length >= 2) ||
      String(item.preview || "").length > 80;
    var heroMeta = cardMeta(item, { dateOnly: true });
    var heroType = typeBadge(item);
    var heroHtml =
      '<div class="vc-staff-reso-hero vc-staff-reso-hero--cand">' +
      '<span class="vc-staff-avatar-wrap vc-staff-avatar-wrap--lg">' +
      T.avatarImgHtml(item.avatarUrl, item.userId, { width: 56, height: 56 }) +
      '</span><div class="vc-staff-reso-hero__main">' +
      '<div class="vc-staff-reso-hero__name-row">' +
      '<h3 class="vc-staff-reso-hero__name">' +
      T.esc(displayName) +
      "</h3>" +
      (heroType || "") +
      "</div>" +
      (heroMeta
        ? '<p class="vc-staff-reso-hero__meta">' + T.esc(heroMeta) + "</p>"
        : "") +
      "</div>" +
      '<span class="vc-staff-inbox-status vc-staff-reso-hero__status ' +
      statusClass(item) +
      '">' +
      T.esc(statusLabel(item)) +
      "</span></div>";
    if (state.detailLoading && !candFull) {
      captureWorkflowChatDraft();
      body.innerHTML =
        detailErrorHtml +
        heroHtml +
        '<div class="vc-staff-inbox-detail__loading">Caricamento risposte\u2026</div>';
      foot.innerHTML = "";
      return;
    }
    /* inboxSheetLoadKill1: contenuto pronto → niente stato loading residuo */
    if (state.detailLoading && candFull) state.detailLoading = false;
    clearInboxSoftLoadingUi();
    captureWorkflowChatDraft();
    body.innerHTML =
      detailErrorHtml +
      heroHtml +
      renderDetailFields(item) +
      renderChatPanel(item);
    foot.innerHTML = actionButtons(item, "candidature") || "";
    bindActionButtons(foot, item);
    bootChatForDetail(item);
    scanInboxAvatars(sheet);
  }

  function appealKickerLabel(item) {
    if (item && item.kind === "unban") return "Appello unban";
    if (item && item.kind === "unmute") return "Appello unmute";
    return "Appello";
  }

  function appealDisplayName(item) {
    var name = cleanDiscordText((item && item.displayName) || "");
    if (name && !/^\d{16,22}$/.test(name) && !isGenericAppealLabel(name)) return name;
    var title = cleanDiscordText((item && item.title) || "");
    if (
      title &&
      !isGenericAppealLabel(title) &&
      !/richiesta\s+(unban|unmute)/i.test(title)
    ) {
      return title;
    }
    return "";
  }

  function renderAppealSheet(item) {
    openResoSheet();
    var sheet = ensureResoSheet();
    var body = sheet.querySelector("#vc-staff-reso-body");
    var foot = sheet.querySelector("#vc-staff-reso-foot");
    var titleEl = sheet.querySelector("#vc-staff-reso-title");
    var kicker = sheet.querySelector(".vc-staff-reso-sheet__kicker");
    if (!body || !foot) return;
    sheet.classList.remove("is-reso-sheet", "is-cand-sheet", "is-pause-sheet");
    sheet.classList.add("is-appeal-sheet", "is-cand-sheet");
    if (kicker) kicker.textContent = appealKickerLabel(item);
    var displayName = appealDisplayName(item) || itemTitle(item) || "Appello";
    clearSheetTitle(titleEl);
    var detailErrorHtml = state.detailError
      ? '<div class="vc-staff-inbox-detail__error" role="alert">' + T.esc(state.detailError) + "</div>"
      : "";
    var appealFull =
      String(item.content || "").length > 120 ||
      String(item.body || "").length > 120 ||
      (Array.isArray(item.fields) && item.fields.length >= 1) ||
      String(item.preview || "").length > 60;
    var heroMeta = cardMeta(item, { dateOnly: true });
    var heroType = typeBadge(item);
    var heroHtml =
      '<div class="vc-staff-reso-hero vc-staff-reso-hero--cand vc-staff-reso-hero--appeal">' +
      '<span class="vc-staff-avatar-wrap vc-staff-avatar-wrap--lg">' +
      T.avatarImgHtml(item.avatarUrl, item.userId, { width: 56, height: 56 }) +
      '</span><div class="vc-staff-reso-hero__main">' +
      '<div class="vc-staff-reso-hero__name-row">' +
      '<h3 class="vc-staff-reso-hero__name">' +
      T.esc(displayName) +
      "</h3>" +
      (heroType || "") +
      "</div>" +
      (heroMeta
        ? '<p class="vc-staff-reso-hero__meta">' + T.esc(heroMeta) + "</p>"
        : "") +
      "</div>" +
      '<span class="vc-staff-inbox-status vc-staff-reso-hero__status ' +
      statusClass(item) +
      '">' +
      T.esc(statusLabel(item)) +
      "</span></div>";
    if (state.detailLoading && !appealFull) {
      captureWorkflowChatDraft();
      body.innerHTML =
        detailErrorHtml +
        heroHtml +
        '<div class="vc-staff-inbox-detail__loading">Caricamento appello\u2026</div>';
      foot.innerHTML = "";
      return;
    }
    if (state.detailLoading && appealFull) state.detailLoading = false;
    clearInboxSoftLoadingUi();
    captureWorkflowChatDraft();
    body.innerHTML =
      detailErrorHtml +
      heroHtml +
      renderDetailFields(item) +
      renderChatPanel(item);
    foot.innerHTML = actionButtons(item, "appelli") || "";
    bindActionButtons(foot, item);
    bootChatForDetail(item);
    scanInboxAvatars(sheet);
  }

  function usesWorkflowSheet() {
    return (
      state.tab === "resoconti" ||
      state.tab === "candidature" ||
      state.tab === "appelli" ||
      state.tab === "pause"
    );
  }

  function pauseCalApiUrl(year, month) {
    var base = T.resolveApiUrl(window.__VC_STAFF_PAUSE || {}, "/webhooks/site-staff-pause");
    var sep = base.indexOf("?") >= 0 ? "&" : "?";
    return (
      base +
      sep +
      "year=" +
      encodeURIComponent(String(year)) +
      "&month=" +
      encodeURIComponent(String(month))
    );
  }

  function parsePauseDayFlexible(raw) {
    var s = String(raw || "").trim();
    if (!s) return null;
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    }
    var it = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (it) {
      return new Date(Date.UTC(Number(it[3]), Number(it[2]) - 1, Number(it[1])));
    }
    var t = Date.parse(s);
    if (Number.isFinite(t)) {
      var d = new Date(t);
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    return null;
  }

  function pauseIsoDay(y, m, d) {
    return (
      String(y) +
      "-" +
      String(m).padStart(2, "0") +
      "-" +
      String(d).padStart(2, "0")
    );
  }

  function pauseMonthLabelIt(y, m) {
    var names = [
      "Gennaio",
      "Febbraio",
      "Marzo",
      "Aprile",
      "Maggio",
      "Giugno",
      "Luglio",
      "Agosto",
      "Settembre",
      "Ottobre",
      "Novembre",
      "Dicembre",
    ];
    return names[m - 1] + " " + y;
  }

  function pauseRequestDayKeys(item) {
    var a = parsePauseDayFlexible(item && (item.startIso || item.start));
    var b = parsePauseDayFlexible(item && (item.endIso || item.end));
    if (!a || !b || b < a) return [];
    var keys = [];
    for (var t = a.getTime(); t <= b.getTime(); t += 86400000) {
      var d = new Date(t);
      keys.push(
        pauseIsoDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      );
    }
    return keys;
  }

  function pickPauseSheetMonth(item) {
    var start = parsePauseDayFlexible(item && (item.startIso || item.start));
    if (start) {
      return { y: start.getUTCFullYear(), m: start.getUTCMonth() + 1 };
    }
    var now = new Date();
    try {
      var fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
      });
      var parts = fmt.formatToParts(now);
      var py = parts.find(function (p) {
        return p.type === "year";
      });
      var pm = parts.find(function (p) {
        return p.type === "month";
      });
      if (py && pm) return { y: Number(py.value), m: Number(pm.value) };
    } catch (e) {}
    return { y: now.getFullYear(), m: now.getMonth() + 1 };
  }

  function mergePauseRequestIntoDays(daysMap, item) {
    var out = daysMap && typeof daysMap === "object" ? Object.assign({}, daysMap) : {};
    var keys = pauseRequestDayKeys(item);
    var uid = String((item && item.userId) || "").trim();
    var pid = String((item && item.id) || "").trim();
    keys.forEach(function (key) {
      var list = Array.isArray(out[key]) ? out[key].slice() : [];
      var exists = list.some(function (e) {
        return String(e.userId || "") === uid && (!pid || String(e.id || "") === pid);
      });
      if (!exists) {
        list.push({
          id: pid,
          userId: uid,
          displayName: (item && item.displayName) || "Staff",
          avatarUrl: (item && item.avatarUrl) || "",
          phase: String((item && item.phase) || "planned") || "planned",
          ruolo: pauseRoleBadgeLabels(item).join(" · "),
          start: (item && item.start) || "",
          end: (item && item.end) || "",
          isRequest: true,
        });
      }
      out[key] = list;
    });
    return out;
  }

  function buildPauseSheetCalHtml(item, year, month, daysMap, selectedDay) {
    var days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    var firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    var mondayFirst = (firstDow + 6) % 7;
    var map = mergePauseRequestIntoDays(daysMap, item);
    var reqKeys = {};
    pauseRequestDayKeys(item).forEach(function (k) {
      reqKeys[k] = true;
    });
    var cells = "";
    var i;
    for (i = 0; i < mondayFirst; i += 1) {
      cells += '<span class="vc-staff-pause-sheet-cal__day is-empty" aria-hidden="true"></span>';
    }
    for (var d = 1; d <= days; d += 1) {
      var key = pauseIsoDay(year, month, d);
      var entries = map[key] || [];
      var cls = "vc-staff-pause-sheet-cal__day";
      if (entries.length) cls += " is-marked is-" + String(entries[0].phase || "active");
      if (reqKeys[key]) cls += " is-request";
      if (selectedDay && selectedDay === key) cls += " is-selected";
      var chips = "";
      if (entries.length) {
        chips = '<span class="vc-staff-pause-sheet-cal__chips">';
        var maxShow = Math.min(3, entries.length);
        for (var c = 0; c < maxShow; c += 1) {
          var av = String(entries[c].avatarUrl || "").replace(/"/g, "");
          chips +=
            '<span class="vc-staff-pause-sheet-cal__chip" title="' +
            T.esc(entries[c].displayName || "") +
            '"' +
            (av ? ' style="background-image:url(\'' + av + "')\"" : "") +
            "></span>";
        }
        if (entries.length > 3) {
          chips +=
            '<span class="vc-staff-pause-sheet-cal__more">+' +
            (entries.length - 3) +
            "</span>";
        }
        chips += "</span>";
      }
      cells +=
        '<button type="button" class="' +
        cls +
        '" data-pause-cal-day="' +
        T.esc(key) +
        '" aria-label="Giorno ' +
        d +
        (entries.length ? ", " + entries.length + " in pausa" : "") +
        '"><span class="vc-staff-pause-sheet-cal__num">' +
        d +
        "</span>" +
        chips +
        "</button>";
    }

    var dayEntries = selectedDay && map[selectedDay] ? map[selectedDay] : [];
    var previewHtml = "";
    if (selectedDay && dayEntries.length) {
      previewHtml =
        '<div class="vc-staff-pause-sheet-cal__preview">' +
        '<p class="vc-staff-pause-sheet-cal__preview-title">' +
        T.esc(selectedDay) +
        " · " +
        dayEntries.length +
        (dayEntries.length === 1 ? " in pausa" : " in pausa") +
        '</p><ul class="vc-staff-pause-sheet-cal__preview-list">' +
        dayEntries
          .map(function (e) {
            return (
              "<li>" +
              '<span class="vc-staff-avatar-wrap vc-staff-avatar-wrap--sm">' +
              T.avatarImgHtml(e.avatarUrl, e.userId, { width: 28, height: 28 }) +
              "</span><div><strong>" +
              T.esc(e.displayName || "Staff") +
              "</strong>" +
              (e.ruolo
                ? '<span class="vc-staff-pause-sheet-cal__preview-role">' +
                  T.esc(e.ruolo) +
                  "</span>"
                : "") +
              (e.start && e.end
                ? "<em>" + T.esc(e.start + " → " + e.end) + "</em>"
                : "") +
              "</div></li>"
            );
          })
          .join("") +
        "</ul></div>";
    } else if (selectedDay) {
      previewHtml =
        '<p class="vc-staff-pause-sheet-cal__preview-empty">Nessuno in pausa in questo giorno.</p>';
    } else {
      previewHtml =
        '<p class="vc-staff-pause-sheet-cal__preview-empty">Tocca un giorno per vedere chi è in pausa.</p>';
    }

    return (
      '<section class="vc-staff-pause-sheet-cal" data-pause-cal-y="' +
      year +
      '" data-pause-cal-m="' +
      month +
      '" aria-label="Calendario pause">' +
      '<div class="vc-staff-pause-sheet-cal__nav">' +
      '<button type="button" class="vc-staff-pause-sheet-cal__navbtn" data-pause-cal-nav="-1" aria-label="Mese precedente"><i class="fa fa-chevron-left" aria-hidden="true"></i></button>' +
      '<span class="vc-staff-pause-sheet-cal__title">' +
      T.esc(pauseMonthLabelIt(year, month)) +
      "</span>" +
      '<button type="button" class="vc-staff-pause-sheet-cal__navbtn" data-pause-cal-nav="1" aria-label="Mese successivo"><i class="fa fa-chevron-right" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-staff-pause-sheet-cal__dows" aria-hidden="true"><span>L</span><span>M</span><span>M</span><span>G</span><span>V</span><span>S</span><span>D</span></div>' +
      '<div class="vc-staff-pause-sheet-cal__grid">' +
      cells +
      "</div>" +
      previewHtml +
      "</section>"
    );
  }

  function bindPauseSheetCal(root, item, calState) {
    if (!root || !item) return;
    var mount = root.querySelector("[data-pause-cal-mount]");
    if (!mount) return;
    function paint() {
      mount.innerHTML = buildPauseSheetCalHtml(
        item,
        calState.y,
        calState.m,
        calState.days || {},
        calState.selectedDay || "",
      );
      mount.querySelectorAll("[data-pause-cal-nav]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var delta = Number(btn.getAttribute("data-pause-cal-nav") || 0);
          var nm = calState.m + delta;
          var ny = calState.y;
          if (nm < 1) {
            nm = 12;
            ny -= 1;
          } else if (nm > 12) {
            nm = 1;
            ny += 1;
          }
          calState.y = ny;
          calState.m = nm;
          calState.selectedDay = "";
          loadPauseCalMonth(item, calState, mount);
        });
      });
      mount.querySelectorAll("[data-pause-cal-day]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          calState.selectedDay = btn.getAttribute("data-pause-cal-day") || "";
          paint();
        });
      });
    }
    calState._paint = paint;
    paint();
  }

  function loadPauseCalMonth(item, calState, mount) {
    if (!mount) return;
    mount.classList.add("is-loading");
    T.fetchJson(pauseCalApiUrl(calState.y, calState.m), {
      timeoutMs: T.resolveFetchTimeoutMs ? T.resolveFetchTimeoutMs(18000) : 18000,
      cache: false,
    })
      .then(function (out) {
        if (out && out.res && out.res.ok && out.data && out.data.ok) {
          calState.days = out.data.days || {};
          calState.pauses = out.data.pauses || [];
        } else {
          calState.days = calState.days || {};
        }
      })
      .catch(function () {
        calState.days = calState.days || {};
      })
      .then(function () {
        mount.classList.remove("is-loading");
        if (typeof calState._paint === "function") calState._paint();
      });
  }

  function renderPauseSheet(item) {
    openResoSheet();
    var sheet = ensureResoSheet();
    var body = sheet.querySelector("#vc-staff-reso-body");
    var foot = sheet.querySelector("#vc-staff-reso-foot");
    var titleEl = sheet.querySelector("#vc-staff-reso-title");
    var kicker = sheet.querySelector(".vc-staff-reso-sheet__kicker");
    if (!body || !foot) return;
    sheet.classList.remove("is-reso-sheet", "is-cand-sheet", "is-appeal-sheet");
    sheet.classList.add("is-pause-sheet");
    if (kicker) kicker.textContent = "Richiesta pausa";
    var displayName = cleanDiscordText((item && item.displayName) || "") || "Staff";
    clearSheetTitle(titleEl);
    var detailErrorHtml = state.detailError
      ? '<div class="vc-staff-inbox-detail__error" role="alert">' + T.esc(state.detailError) + "</div>"
      : "";
    var rangeMeta =
      item.start && item.end ? String(item.start) + " \u2192 " + String(item.end) : cardMeta(item, { dateOnly: true });
    var roleBadges = pauseRoleBadgesHtml(item);
    var heroHtml =
      '<div class="vc-staff-reso-hero vc-staff-reso-hero--pause">' +
      '<span class="vc-staff-avatar-wrap vc-staff-avatar-wrap--lg">' +
      T.avatarImgHtml(item.avatarUrl, item.userId, { width: 56, height: 56 }) +
      '</span><div class="vc-staff-reso-hero__main">' +
      '<div class="vc-staff-reso-hero__name-row">' +
      '<h3 class="vc-staff-reso-hero__name">' +
      T.esc(displayName) +
      "</h3>" +
      roleBadges +
      "</div>" +
      (rangeMeta
        ? '<p class="vc-staff-reso-hero__meta">' + T.esc(rangeMeta) + "</p>"
        : "") +
      "</div>" +
      '<span class="vc-staff-inbox-status vc-staff-reso-hero__status ' +
      statusClass(item) +
      '">' +
      T.esc(statusLabel(item)) +
      "</span></div>";
    var motivazione = String(
      item.motivazione || item.content || item.body || item.preview || "",
    ).trim();
    var motiveHtml = motivazione
      ? '<div class="vc-staff-inbox-detail__field vc-staff-inbox-detail__qa"><h4>Motivazione</h4><div class="vc-staff-inbox-detail__answer">' +
        formatDiscordHtml(motivazione, { keepNewlines: true }) +
        "</div></div>"
      : "";
    var month = pickPauseSheetMonth(item);
    var reqKeys = pauseRequestDayKeys(item);
    var initialDay = reqKeys[0] || "";
    captureWorkflowChatDraft();
    body.innerHTML =
      detailErrorHtml +
      heroHtml +
      motiveHtml +
      '<div class="vc-staff-pause-sheet-cal-mount" data-pause-cal-mount></div>' +
      renderChatPanel(item);
    foot.innerHTML = actionButtons(item, "pause") || "";
    bindActionButtons(foot, item);
    var calState = {
      y: month.y,
      m: month.m,
      days: {},
      pauses: [],
      selectedDay: initialDay,
    };
    bindPauseSheetCal(body, item, calState);
    loadPauseCalMonth(item, calState, body.querySelector("[data-pause-cal-mount]"));
    bootChatForDetail(item);
    scanInboxAvatars(sheet);
    clearInboxSoftLoadingUi();
  }

  function renderDetailFields(item) {
    var fields = Array.isArray(item.fields) ? item.fields : [];
    /* inboxSheetFullText1: content pieno prima del body preview (500) */
    var sourceBody = item.content || item.body || item.preview || "";
    if (state.tab === "appelli") {
      var appealParsed = parseAppealSections(sourceBody);
      if (appealParsed.length) fields = appealParsed;
      else if (!fieldsLookUseful(fields)) fields = parseNumberedSections(sourceBody);
      fields = (fields || []).map(function (field) {
        if (!field) return field;
        var fname = String(field.name || "").trim();
        if (/utente/i.test(fname) || /^(?:\d{1,2}\.\s*)?id(?:\s+discord)?$/i.test(fname)) {
          return { name: "1. ID Discord", value: discordIdOnlyValue(item, field.value) };
        }
                var cleanedVal = String(field.value || "")
          .replace(/\(\s*`?\d{16,20}`?\s*\)/g, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        return { name: field.name, value: cleanedVal || field.value };
      });
      var hasDiscordId = (fields || []).some(function (f) {
        return f && /id discord/i.test(String(f.name || ""));
      });
      if (!hasDiscordId) {
        fields = [{ name: "1. ID Discord", value: discordIdOnlyValue(item, "") }].concat(fields || []);
      }
    } else if (state.tab === "candidature") {
      var candSource =
        item.content ||
        (String(item.body || "").length >= String(item.preview || "").length ? item.body : "") ||
        item.body ||
        item.preview ||
        sourceBody ||
        "";
      if (
        String(candSource || "").length < String(sourceBody || "").length
      ) {
        candSource = sourceBody;
      }
      var parsedCand = parseNumberedSections(candSource, { sequential: true });
      if (parsedCand.length >= 2) {
        fields = parsedCand;
      } else if (!fieldsLookUseful(fields)) {
        var parsedLoose = parseNumberedSections(candSource);
        if (parsedLoose.length) fields = parsedLoose;
      } else if (
        parsedCand.length > (Array.isArray(fields) ? fields.length : 0)
      ) {
        fields = parsedCand;
      }
      // Hero already shows name/avatar; normalize ID field → "1. ID Discord" (solo snowflake).
      fields = normalizeCandidaturaDetailFields(fields, item);
    } else if (state.tab === "resoconti") {
      var resocontoParsed = parseResocontoSections(sourceBody);
      if (resocontoParsed.length) fields = resocontoParsed;
      fields = filterResocontoDetailFields(fields);
    } else if (!fieldsLookUseful(fields) && sourceBody) {
      fields = parseNumberedSections(sourceBody);
    }
    if (!fieldsLookUseful(fields)) {
      var fallbackBody = breakNumberedProse(item.body || item.content || item.preview || sourceBody || "");
      if (state.tab === "resoconti") {
        fallbackBody = stripResocontoText(fallbackBody, { keepNewlines: true });
        if (!fallbackBody) return appendDetailExtras("", item);
        return appendDetailExtras(
          '<div class="vc-staff-inbox-detail__body vc-staff-inbox-detail__prose">' +
          T.esc(fallbackBody).replace(/\n/g, "<br>") +
            "</div>",
          item,
        );
      }
      if (!cleanDiscordText(fallbackBody, { keepNewlines: true, keepCustomEmoji: true })) {
        return appendDetailExtras("", item);
      }
      return appendDetailExtras(
        '<div class="vc-staff-inbox-detail__body vc-staff-inbox-detail__prose">' +
        formatDiscordHtml(fallbackBody, { keepNewlines: true }) +
          "</div>",
        item,
      );
    }
    return appendDetailExtras(
      '<div class="vc-staff-inbox-detail__fields">' +
      fields
        .map(function (field) {
          field = repairBrokenEmojiField(field);
          if (state.tab === "resoconti") {
            var qR = stripResocontoText(field.name || "");
            var aR = stripResocontoText(field.value || "", { keepNewlines: true });
            return (
              '<div class="vc-staff-inbox-detail__field vc-staff-inbox-detail__qa"><h4>' +
              T.esc(qR || "Campo") +
              '</h4><div class="vc-staff-inbox-detail__answer">' +
              T.esc(aR || "\u2014").replace(/\n/g, "<br>") +
              "</div></div>"
            );
          }
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
        "</div>",
      item,
    );
  }

  function appendDetailExtras(fieldsHtml, item) {
    var timing = renderTimingMeta(item);
    var decision = renderDecisionMeta(item);
    if (!timing && !decision) return fieldsHtml || "";
    if (/vc-staff-inbox-detail__fields/.test(String(fieldsHtml || ""))) {
      return String(fieldsHtml).replace(/<\/div>\s*$/, timing + decision + "</div>");
    }
    return (
      '<div class="vc-staff-inbox-detail__fields">' +
      (fieldsHtml || "") +
      timing +
      decision +
      "</div>"
    );
  }

  function preferNonEmptyText(next, prev) {
    var a = String(next == null ? "" : next).trim();
    var b = String(prev == null ? "" : prev).trim();
    if (a) return a;
    return b || "";
  }

  function resolveDecidedByLabel(item) {
    if (!item) return "";
    var name = String(item.decidedByName || "").trim();
    var id = String(item.decidedBy || "").trim();
    if (/^system$/i.test(name) || /^system$/i.test(id)) return "Sistema";
    if (name && !/^\d{16,22}$/.test(name)) return name;
    if (id && !/^\d{16,22}$/.test(id) && !/^system$/i.test(id)) return id;
    if (id) return "Staff";
    return "";
  }

  function renderDecisionMeta(item) {
    if (!item || item.status === "pending" || item.canAct) return "";
    var by = resolveDecidedByLabel(item);
    var when = item.decidedAt ? formatDate(item.decidedAt) : "";
    if (!by && !when) return "";
    var status = String(item.status || "").toLowerCase();
    var verb =
      status === "rejected"
        ? "Rifiutata"
        : status === "accepted"
          ? "Accettata"
          : status === "cancelled"
            ? "Annullata"
            : "Gestita";
    var heading = by ? verb + " da " + by : verb;
    return (
      '<div class="vc-staff-inbox-detail__field vc-staff-inbox-detail__qa vc-staff-inbox-detail__field--decision"><h4>' +
      T.esc(heading) +
      "</h4>" +
      (when ? "<p>" + T.esc(when) + "</p>" : "") +
      "</div>"
    );
  }

  function patchDecisionMetaInDom(item) {
    var html = renderDecisionMeta(item);
    var existing = document.querySelector(".vc-staff-inbox-detail__field--decision");
    if (!html) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return true;
    }
    var wrap = document.createElement("div");
    wrap.innerHTML = html;
    var fresh = wrap.firstChild;
    if (!fresh) return false;
    if (existing && existing.parentNode) {
      existing.replaceWith(fresh);
      return true;
    }
    var fields = document.querySelector(
      "#vc-staff-reso-body .vc-staff-inbox-detail__fields, #vc-staff-inbox-detail .vc-staff-inbox-detail__fields",
    );
    if (fields) {
      fields.appendChild(fresh);
      return true;
    }
    return false;
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
    /* inboxCardOpen1: sheet workflow anche se manca il pannello side-detail */
    if (!panel && !(usesWorkflowSheet() && (state.detail || state.detailLoading))) return;

        if (usesWorkflowSheet() && (state.detail || state.detailLoading)) {
      if (layout) layout.classList.remove("has-detail");
      if (panel) {
      panel.hidden = true;
      panel.innerHTML = "";
      }
      if (state.tab === "resoconti") {
        if (state.detailLoading && !state.detail) {
          openResoSheet();
          var loadingBody = document.getElementById("vc-staff-reso-body");
          var kickerR = document.querySelector("#vc-staff-reso-sheet .vc-staff-reso-sheet__kicker");
          if (kickerR) kickerR.textContent = "Resoconto";
          if (loadingBody) {
            captureWorkflowChatDraft();
            loadingBody.innerHTML =
              '<div class="vc-staff-inbox-detail__loading">Caricamento resoconto\u2026</div>';
          }
          return;
        }
        if (state.detail) renderResoSheet(state.detail);
        return;
      }
      if (state.tab === "candidature") {
        if (state.detailLoading && !state.detail) {
          openResoSheet();
          var loadingCand = document.getElementById("vc-staff-reso-body");
          var kickerC = document.querySelector("#vc-staff-reso-sheet .vc-staff-reso-sheet__kicker");
          if (kickerC) kickerC.textContent = "Candidatura";
          if (loadingCand) {
            captureWorkflowChatDraft();
            loadingCand.innerHTML =
              '<div class="vc-staff-inbox-detail__loading">Caricamento candidatura\u2026</div>';
          }
          return;
        }
        if (state.detail) renderCandSheet(state.detail);
        return;
      }
      if (state.tab === "appelli") {
        if (state.detailLoading && !state.detail) {
          openResoSheet();
          var loadingAppeal = document.getElementById("vc-staff-reso-body");
          var kickerA = document.querySelector("#vc-staff-reso-sheet .vc-staff-reso-sheet__kicker");
          if (kickerA) kickerA.textContent = "Appello";
          if (loadingAppeal) {
            captureWorkflowChatDraft();
            loadingAppeal.innerHTML =
              '<div class="vc-staff-inbox-detail__loading">Caricamento appello\u2026</div>';
          }
          return;
        }
        if (state.detail) renderAppealSheet(state.detail);
        return;
      }
      if (state.tab === "pause") {
        if (state.detailLoading && !state.detail) {
          openResoSheet();
          var loadingPause = document.getElementById("vc-staff-reso-body");
          var kickerP = document.querySelector("#vc-staff-reso-sheet .vc-staff-reso-sheet__kicker");
          if (kickerP) kickerP.textContent = "Richiesta pausa";
          if (loadingPause) {
            captureWorkflowChatDraft();
            loadingPause.innerHTML =
              '<div class="vc-staff-inbox-detail__loading">Caricamento pausa\u2026</div>';
          }
          return;
        }
        if (state.detail) renderPauseSheet(state.detail);
        return;
      }
    }

    closeResoSheet(true, { force: !sheetOpenGuardActive() });

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
      captureWorkflowChatDraft();
      panel.innerHTML = '<div class="vc-staff-inbox-detail__loading">Caricamento dettaglio\u2026</div>';
      return;
    }
    var item = state.detail;
    if (!item) return;
    var title = itemTitle(item);
    var detailErrorHtml = state.detailError
      ? '<div class="vc-staff-inbox-detail__error" role="alert">' + T.esc(state.detailError) + "</div>"
      : "";
    captureWorkflowChatDraft();
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

  function preferLongerRolesHistory(a, b) {
    function score(rows) {
      return (Array.isArray(rows) ? rows : []).reduce(function (n, r) {
        if (!r) return n;
        var f = String(r.from || r.oldRole || "").trim();
        var t = String(r.to || r.newRole || "").trim();
        if (f && t) return n + 2;
        if (f || t) return n + 1;
        return n;
      }, 0);
    }
    var aa = Array.isArray(a) ? a : [];
    var bb = Array.isArray(b) ? b : [];
    var sa = score(aa);
    var sb = score(bb);
    if (sa !== sb) return sa >= sb ? aa : bb;
    if (aa.length !== bb.length) return aa.length >= bb.length ? aa : bb;
    return aa.length ? aa : bb;
  }

  function scheduleResoStatsSoftRefresh(seq, key, detailId, listItem) {
    try {
      var cur = state.detail || listItem || {};
      var model = parseResocontoDetailModel(cur);
      var isPm = model.isPm || String(cur.kind || "").toLowerCase() === "p";
      var needsChart = !isPm && !(Array.isArray(model.chart) && model.chart.length);
      var needsStats = isPm
        ? model.partners == null && (!model.partnersLabel || model.partnersLabel === "—")
        : model.msgs == null;
      if (!needsChart && !needsStats) return;
      window.setTimeout(function () {
        if (seq !== detailSeq || state.selectedKey !== key || state.tab !== "resoconti") return;
        var url =
          apiBase() +
          (apiBase().indexOf("?") >= 0 ? "&" : "?") +
          "queue=resoconti&itemId=" +
          encodeURIComponent(detailId || "");
        T.fetchJson(url, {
          timeoutMs: T.resolveFetchTimeoutMs ? T.resolveFetchTimeoutMs(20000) : 20000,
        })
          .then(function (out) {
            if (seq !== detailSeq || state.selectedKey !== key) return;
            if (!out.res.ok || !out.data || !out.data.ok || !out.data.item) return;
            var prevDetail = state.detail || listItem || {};
            var nextItem = out.data.item || {};
                        state.detail = Object.assign({}, prevDetail, nextItem, {
              rolesHistory: preferLongerRolesHistory(
                nextItem.rolesHistory,
                prevDetail.rolesHistory,
              ),
            });
            if (shouldRemountDetailForSoftSync(state.detail)) {
            renderDetail();
            }
          })
          .catch(function () {});
      }, 1100);
    } catch (eSoft) {}
  }

  function isResoSheetOpen() {
    try {
      if (document.documentElement.classList.contains("vc-staff-reso-sheet-open")) return true;
    } catch (eCls) {}
    try {
      var sheet = document.getElementById("vc-staff-reso-sheet");
      return Boolean(sheet && !sheet.hidden && sheet.classList.contains("is-in"));
    } catch (eSheet) {}
    return false;
  }

  function clearInboxSoftLoadingUi() {
    try {
      clearInboxLoading();
    } catch (eClr) {}
    try {
      T.hideStaffToast();
    } catch (eToast) {}
    try {
      if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") {
        window.VcSiteToast.hide();
      }
    } catch (eSite) {}
  }

  function openDetail(listItem) {
    var seq = (detailSeq += 1);
    var key = itemKey(listItem);
    var hasLocalBody = Boolean(
      (listItem && (listItem.body || listItem.content || listItem.motivazione || listItem.preview)) ||
        (listItem && Array.isArray(listItem.fields) && listItem.fields.length),
    );
    if (state.tab === "candidature" || state.tab === "appelli") {
      var fullEnough =
        (listItem && String(listItem.content || "").length > 200) ||
        (listItem && String(listItem.body || "").length > 200) ||
        (listItem && Array.isArray(listItem.fields) && listItem.fields.length >= 2) ||
        (listItem && String(listItem.preview || "").length > 80);
      if (state.tab === "appelli") {
        fullEnough =
          fullEnough ||
          (listItem && Array.isArray(listItem.fields) && listItem.fields.length >= 1) ||
          (listItem && String(listItem.body || listItem.content || listItem.preview || "").length > 80);
      }
      hasLocalBody = Boolean(fullEnough || hasLocalBody);
    }
    /* inboxSheetLoadKill1 / inboxClickOpen3: spegni soft-refresh + apri sheet PRIMA di renderList */
    clearInboxSoftLoadingUi();
    state.detailLoading = !hasLocalBody;
    state.detailError = "";
    state.detail = listItem;
    state.selectedKey = key;
    inboxSheetOpenedAt = Date.now();
    if (usesWorkflowSheet()) {
      try {
        ensureSheetForceVisibleCss();
        openResoSheet();
      } catch (eSheetFirst) {}
    }
    try {
    renderList();
    } catch (eList) {
      try {
        window.__vcInboxLastOpenErr = "renderList:" + (eList && eList.message ? eList.message : eList);
      } catch (eL) {}
    }
    try {
    renderDetail();
    } catch (eDet) {
      try {
        window.__vcInboxLastOpenErr = "renderDetail:" + (eDet && eDet.message ? eDet.message : eDet);
      } catch (eD) {}
      if (usesWorkflowSheet()) {
        try {
          openResoSheet();
          if (state.tab === "resoconti") renderResoSheet(listItem);
        } catch (eFb2) {}
      }
    }
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
    function applyDetailFail(out, isNet) {
      if (seq !== detailSeq || state.selectedKey !== key) return;
      state.detailLoading = false;
      var err = String((out && out.data && out.data.error) || "").toLowerCase();
      var st = Number(out && out.res && out.res.status) || 0;
      var rateish =
        isNet ||
        Boolean(out && out.soft) ||
        Boolean(out && out.data && out.data.soft) ||
        err === "rate_limited_client" ||
        err === "rate_limited" ||
        err === "timeout" ||
        err === "aborted" ||
        err === "network_error" ||
        err === "invalid_json" ||
        err === "empty_body" ||
        err === "missing_token" ||
        st === 401 ||
        st === 429 ||
        st === 408 ||
        st === 0 ||
        st === 502 ||
        st === 503 ||
        st === 504;
      var usableLocal =
        hasLocalBody ||
        (listItem && Array.isArray(listItem.fields) && listItem.fields.length > 0) ||
        (listItem &&
          String(listItem.content || listItem.body || listItem.preview || "").trim().length > 40);
      if (usableLocal || rateish) {
        // inboxDetailChatRace1 / notifApiErr1: no red banner on soft/race; keep local + silent retry
        state.detailError = "";
        state.detail = listItem;
        T.hideStaffToast();
        /* inboxDetailPaint1: sempre ripaintare — altrimenti resta "Caricamento…" (loading flag spento senza remount) */
        renderDetail();
        if (rateish) {
          window.setTimeout(function () {
            if (seq !== detailSeq || state.selectedKey !== key) return;
            T.fetchJson(url, {
              timeoutMs: T.resolveFetchTimeoutMs ? T.resolveFetchTimeoutMs(28000) : 28000,
              cache: false,
            })
              .then(function (retryOut) {
                if (seq !== detailSeq || state.selectedKey !== key) return;
                if (!retryOut.res.ok || !retryOut.data || !retryOut.data.ok || !retryOut.data.item) {
                  return;
                }
                state.detailError = "";
                state.detail = Object.assign({}, listItem, retryOut.data.item, {
                  dedupeKey: retryOut.data.item.dedupeKey || listItem.dedupeKey || "",
                  messageId: retryOut.data.item.messageId || listItem.messageId || "",
                  channelId: retryOut.data.item.channelId || listItem.channelId || "",
                  rolesHistory: preferLongerRolesHistory(
                    retryOut.data.item.rolesHistory,
                    listItem.rolesHistory,
                  ),
                });
                renderDetail();
              })
              .catch(function () {});
          }, 1600);
        }
        return;
      }
      state.detailError =
        (out && out.data && out.data.message) ||
        (isNet ? "Errore di rete sul dettaglio." : "Impossibile caricare il dettaglio.");
      state.detail = listItem;
      T.hideStaffToast();
      renderDetail();
    }
    T.fetchJson(url, {
      timeoutMs: T.resolveFetchTimeoutMs ? T.resolveFetchTimeoutMs(25000) : 25000,
      cache: false,
    })
      .then(function (out) {
        if (seq !== detailSeq || state.selectedKey !== key) return;
        state.detailLoading = false;
        if (!out.res.ok || !out.data || !out.data.ok || !out.data.item) {
          applyDetailFail(out, false);
          return;
        }
        state.detailError = "";
        state.detail = Object.assign({}, listItem, out.data.item, {
          dedupeKey: out.data.item.dedupeKey || listItem.dedupeKey || "",
          messageId: out.data.item.messageId || listItem.messageId || "",
          channelId: out.data.item.channelId || listItem.channelId || "",
          rolesHistory: preferLongerRolesHistory(
            out.data.item.rolesHistory,
            listItem.rolesHistory,
          ),
        });
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
            body: detailItem.body || detailItem.content || prev.body || "",
            content: detailItem.content || detailItem.body || prev.content || "",
            fields:
              Array.isArray(detailItem.fields) &&
              detailItem.fields.length >=
                (Array.isArray(prev.fields) ? prev.fields.length : 0)
                ? detailItem.fields
                : Array.isArray(detailItem.fields) && detailItem.fields.length
                  ? detailItem.fields
                  : prev.fields,
            ruoloRichiesto: detailItem.ruoloRichiesto || prev.ruoloRichiesto || "",
            timing: detailItem.timing || prev.timing || null,
            decidedBy: detailItem.decidedBy || prev.decidedBy || null,
            decidedByName: detailItem.decidedByName || prev.decidedByName || null,
            decidedAt: detailItem.decidedAt || prev.decidedAt || null,
            weeklyMessages:
              detailItem.weeklyMessages != null ? detailItem.weeklyMessages : prev.weeklyMessages,
            weeklyVoiceSeconds:
              detailItem.weeklyVoiceSeconds != null
                ? detailItem.weeklyVoiceSeconds
                : prev.weeklyVoiceSeconds,
            costanzaChart:
              Array.isArray(detailItem.costanzaChart) && detailItem.costanzaChart.length
                ? detailItem.costanzaChart
                : prev.costanzaChart,
            rolesHistory: preferLongerRolesHistory(
              detailItem.rolesHistory,
              prev.rolesHistory,
            ),
          });
          renderList();
        }
        renderDetail();
                /* inboxSheetLoadKill1: dopo paint dettaglio spegni eventuali soft-load */
        clearInboxSoftLoadingUi();
                if (state.tab === "resoconti") {
          scheduleResoStatsSoftRefresh(seq, key, detailId, listItem);
        }
      })
      .catch(function () {
        applyDetailFail({ res: { ok: false, status: 0 }, data: { ok: false, error: "network" } }, true);
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
    var el = T.byId("vc-staff-inbox-loading");
    if (el) return el;
    el = document.createElement("div");
    el.id = "vc-staff-inbox-loading";
    el.className = "vc-staff-loading vc-staff-loading--hidden";
    el.hidden = true;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-label", "Caricamento…");
    el.innerHTML =
      '<div class="vc-staff-loading__card">' +
      '<span class="vc-ul-loading-spinner" aria-hidden="true"></span>' +
      '<p class="vc-staff-loading__text">Caricamento\u2026</p>' +
      '<p class="vc-staff-loading__hint" id="vc-staff-inbox-loading-hint">Un momento\u2026</p>' +
      "</div>";
    var host = T.byId("vc-notif-pane-staff") || document.body;
    host.insertBefore(el, host.firstChild);
    return el;
  }

  function isInboxFsLoadingVisible() {
    var el = T.byId("vc-staff-inbox-loading");
    if (!el) return false;
    if (el.hidden || el.hasAttribute("hidden")) return false;
    if (el.classList.contains("vc-staff-loading--hidden")) return false;
    return true;
  }

  function setInboxFsLoadingHint(text) {
    var hint = T.byId("vc-staff-inbox-loading-hint");
    if (!hint) return;
    hint.textContent = text || "Candidature · Appelli";
  }

  function showInboxFsLoading(hint) {
    /* inboxFreezeKill2: overlay FS (.vc-staff-loading fixed inset:0) freeza TUTTA la pagina.
       Mai mostrarlo — solo skeleton in lista + hide immediato di ogni residuo. */
    try {
      if (hint) setInboxFsLoadingHint(hint);
    } catch (eHint) {}
    try {
      hideInboxFsLoading(true);
    } catch (eNoGate) {}
  }

  function hideInboxFsLoading(force) {
    // Hold the fullscreen gate until the first queue paint is ready.
    if (!force && (inboxBooting || !initialQueueLoaded)) return;
    var el = T.byId("vc-staff-inbox-loading");
    if (el) {
      el.hidden = true;
      el.setAttribute("hidden", "");
      el.classList.add("vc-staff-loading--hidden");
    }
    try {
      window.__VC_INBOX_FS_GATE_HOLD = false;
    } catch (eHold) {}
    try {
      document.documentElement.classList.remove("vc-notif-staff-loading", "vc-notif-early-staff");
      window.__VC_NOTIF_EARLY_STAFF = false;
    } catch (eCls) {}
    try {
      window.clearTimeout(window.__vcNotifStaffLoadWatch);
    } catch (eTo) {}
    try {
      window.clearTimeout(window.__vcInboxFsGateHardFailsafe);
    } catch (eHf) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSync) {}
    try {
      if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
    } catch (eUnpin) {}
  }

  function armInboxFsGateHardFailsafe() {
    try {
      window.clearTimeout(window.__vcInboxFsGateHardFailsafe);
    } catch (eClr) {}
    /* inboxUnblockKill1: max 2s — prima 4.5–6.5s lasciava l'inbox morta */
    var ms = 2000;
    try {
      window.__vcInboxFsGateHardFailsafe = window.setTimeout(function () {
        window.__vcInboxFsGateHardFailsafe = 0;
        forceReleaseStuckInboxLoad();
        try {
          finishQueueLoad(loadSeq, {
            force: true,
            message: "Caricamento inbox troppo lento. Tocca Ricarica.",
          });
        } catch (eFin) {}
      }, ms);
    } catch (eArm) {}
  }

  function inboxListSkeletonHtml() {
    var label = tabLabel(state.tab).toLowerCase();
    /* inboxLoadingEmoji1: VC_Loading al posto della rotellina CSS */
    return (
      '<div class="vc-staff-inbox-loading" role="status" aria-live="polite" aria-busy="true">' +
      '<div class="vc-staff-inbox-loading__head">' +
      '<img class="vc-staff-inbox-loading__emoji" src="/images/vc-loading.gif?v=20260920vcLoadingSpokes1" width="22" height="22" alt="" decoding="async" draggable="false" data-vc-emoji-skip="1" />' +
      "<p>Carico " +
      T.esc(label) +
      "\u2026</p></div>" +
      '<div class="vc-staff-inbox-loading__skel">' +
      '<div class="vc-staff-inbox-loading__card"></div>' +
      '<div class="vc-staff-inbox-loading__card"></div>' +
      '<div class="vc-staff-inbox-loading__card"></div>' +
      "</div></div>"
    );
  }

  function inboxBootLoadingHtml() {
    return inboxListSkeletonHtml();
  }

  function showInboxBootScreen() {
    var panel = T.byId("vc-staff-inbox");
    if (panel) {
      inboxBooting = true;
      panel.classList.add("is-booting");
      panel.hidden = false;
    }
    showInboxFsLoading("Candidature · Appelli");
    var list = T.byId("vc-staff-inbox-list");
    if (!list) return;
    // Keep existing skeleton if already booting — rewriting the list looks like a second loading page.
    if (list.classList.contains("is-loading") && list.querySelector(".vc-staff-inbox-loading")) {
      return;
    }
    state.items = [];
    state.pagination = null;
    list.hidden = false;
    list.classList.remove("is-refreshing");
    list.classList.add("is-loading");
    list.setAttribute("aria-busy", "true");
    list.innerHTML = inboxListSkeletonHtml();
  }

  function hideInboxBootScreen(force) {
    if (!force && !initialQueueLoaded) return;
    inboxBooting = false;
    var panel = T.byId("vc-staff-inbox");
    if (panel) panel.classList.remove("is-booting");
    hideInboxFsLoading(Boolean(force) || initialQueueLoaded);
    var boot = T.byId("vc-staff-inbox-boot");
    if (boot) boot.remove();
  }

  function prepareBootTab() {
    emptyLoadedTabs = Object.create(null);
    readPendingFocusFromUrl();
    pickBestTabFromSummary({ respectUrl: true });
    var anyPending = false;
    for (var i = 0; i < TABS.length; i += 1) {
      var tid = TABS[i].id;
      if (!canAccessTab(tid)) continue;
      if (Number(state.summary && state.summary[tid] || 0) > 0) {
        anyPending = true;
        break;
      }
    }
            if (anyPending || !String(location.search || "").match(/(?:^|[?&])scope=/) || pendingFocusItemId) {
      state.scope = "pending";
    }
        var panel = T.byId("vc-staff-inbox");
    if (panel) {
      panel.classList.add("is-booting");
      panel.hidden = false;
    }
    showInboxFsLoading(
      "Carico " + tabLabel(state.tab).toLowerCase() + " e le altre code\u2026",
    );
    renderTabs();
    renderScopeToggle();
    renderQueueFilters();
    syncUrlState();
  }

  function applySummaryPayload(data, opts) {
    opts = opts || {};
    if (!data || !data.summary || typeof data.summary !== "object") return false;
    var incoming = data.summary;
    var merged = Object.assign({}, state.summary || {}, incoming);
    /* inboxPendingBadgeSync1: non rialzare badge già azzerati dalla lista vuota
       (cache/prefetch summary stale), salvo refresh forzato/live. */
    if (!opts.force && !opts.fromLive) {
      Object.keys(emptyLoadedTabs).forEach(function (id) {
        if (!emptyLoadedTabs[id]) return;
        if (Number(merged[id] || 0) > 0 && Number((state.summary && state.summary[id]) || 0) === 0) {
          merged[id] = 0;
        }
      });
    }
    state.summary = merged;
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
    persistSummaryCache();
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
    if (permissionsReady() && T.getToken()) return Promise.resolve();
    try {
      if (T.getToken() && (window.__VC_ACCESS_OK || window.__VC_STAFF_MENU_ALLOWED || window.__VC_NOTIF_EARLY_STAFF)) {
        return Promise.resolve();
      }
    } catch (eFast) {}
    var cap = T.isCoarseMobile && T.isCoarseMobile() ? 500 : 700;
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        window.removeEventListener("vc:staff-access-ok", onOk);
        window.removeEventListener("vc-discord-profile", onOk);
        seedPermissionsFromGate();
        resolve();
      }
      function onOk() {
        seedPermissionsFromGate();
        if (permissionsReady() && T.getToken()) finish();
        else if (T.getToken()) finish();
      }
      window.addEventListener("vc:staff-access-ok", onOk);
      window.addEventListener("vc-discord-profile", onOk);
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
        /* siteApiW4: summary + queue in parallel after gate */
        return Promise.all([
          runBootQueueLoad(),
          loadSummary({ cache: false }).catch(function () {}),
        ]);
      })
      .finally(function () {
        window.setTimeout(function () {
          initialLoadPromise = null;
        }, 0);
      });
    return initialLoadPromise;
  }
  function loadSummary(opts) {
    opts = opts || {};
    return T.fetchJson(apiBase() + (apiBase().indexOf("?") >= 0 ? "&" : "?") + "queue=summary", {
      timeoutMs: T.resolveFetchTimeoutMs ? T.resolveFetchTimeoutMs(12000) : 12000,
      cache: opts.cache === false ? false : opts.cache,
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
    return "";
  }

  function inboxEmptyBoxHtml(messageHtml, iconClass, opts) {
    opts = opts || {};
    var ic = String(iconClass || "fa-inbox").trim() || "fa-inbox";
    var title = String(opts.title || "").trim();
    var sub = String(opts.sub || "").trim();
    if (!title && !sub && messageHtml) {
      if (opts.rawHtml) sub = String(messageHtml || "");
      else title = String(messageHtml || "");
    }
    if (!title) title = "Nessuna richiesta";
    return (
      '<div class="vc-staff-inbox-empty vc-notify-empty" role="status">' +
      '<div class="vc-notif-empty-ico" aria-hidden="true"><i class="fa ' +
      T.esc(ic) +
      '"></i></div>' +
      '<p class="vc-notif-empty-title">' +
      T.esc(title) +
      "</p>" +
      (sub
        ? '<p class="vc-notif-empty-sub">' + (opts.rawHtml ? sub : T.esc(sub)) + "</p>"
        : "") +
      "</div>"
    );
  }

  function inboxEmptyMessage() {
    if (state.scope === "pending") {
      return "Nessuna richiesta in attesa con i filtri selezionati.";
    }
    return "Nessuna richiesta trovata con i filtri selezionati.";
  }

  function inboxEmptySubMessage() {
    if (state.scope === "pending") {
      return "Prova ad ampliare i filtri o passa a Tutti.";
    }
    return "Modifica i filtri per vedere altre richieste.";
  }

  var inboxLoadingShownAt = 0;
  var softRefreshFailsafeTimer = 0;

  function clearSoftRefreshFailsafe() {
    if (softRefreshFailsafeTimer) {
      clearTimeout(softRefreshFailsafeTimer);
      softRefreshFailsafeTimer = 0;
    }
  }

  function armSoftRefreshFailsafe() {
    clearSoftRefreshFailsafe();
    softRefreshFailsafeTimer = window.setTimeout(function () {
      softRefreshFailsafeTimer = 0;
      var list = T.byId("vc-staff-inbox-list");
      if (!list) return;
      var soft = list.classList.contains("is-refreshing");
      var hard = list.classList.contains("is-loading");
      if (!soft && !hard && !isInboxFsLoadingVisible()) return;
      /* inboxStuckKill2: soft/hard refresh bloccato → sblocca lista + gate */
      list.classList.remove("is-refreshing", "is-loading");
      list.setAttribute("aria-busy", "false");
      list.removeAttribute("data-inbox-loading");
      loadInFlightNonQuiet = false;
      try {
        if (hard || isInboxFsLoadingVisible() || document.documentElement.classList.contains("vc-notif-staff-loading")) {
          forceReleaseStuckInboxLoad();
        }
      } catch (eFs) {}
    }, 1800);
  }

  function clearInboxLoading() {
    var list = T.byId("vc-staff-inbox-list");
    clearSoftRefreshFailsafe();
    if (!list) return;
    list.classList.remove("is-loading", "is-refreshing");
    list.removeAttribute("aria-busy");
    list.setAttribute("aria-busy", "false");
    list.removeAttribute("data-inbox-loading");
  }

  function showInboxLoading(mode) {
    var list = T.byId("vc-staff-inbox-list");
    if (!list) return;

    if (mode === "off") {
      inboxLoadingShownAt = 0;
      clearInboxLoading();
      if (initialQueueLoaded) hideInboxFsLoading(true);
      return;
    }

    if (mode === "soft" && (state.items.length || state.selectedKey || pendingFocusItemId)) {
      /* vcLoadingSpokes1: soft = :VC_Loading: a raggi (non pallini cyan / wait blu),
         click restano aperti (pointer-events auto in CSS). */
      list.classList.remove("is-loading");
      list.classList.add("is-refreshing");
      list.setAttribute("aria-busy", "true");
      armSoftRefreshFailsafe();
      return;
    }

    /* inboxClickOpen2: se lo sheet è aperto, non wipe detail/lista (chiudeva il resoconto) */
    try {
      if (
        mode === "skeleton" &&
        (isWorkflowSheetOpen() || state.selectedKey || state.detailLoading) &&
        (state.items.length || state.selectedKey)
      ) {
        list.classList.remove("is-loading");
        list.classList.add("is-refreshing");
        list.setAttribute("aria-busy", "true");
        armSoftRefreshFailsafe();
        return;
      }
    } catch (eKeepLoad) {}

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
    list.setAttribute("aria-busy", "true");
    list.setAttribute("data-inbox-loading", "1");
    list.innerHTML = inboxListSkeletonHtml();
    inboxLoadingShownAt = Date.now();
    armSoftRefreshFailsafe();
    // Fullscreen gate solo al primo boot; dopo resta lo skeleton in lista.
    if (inboxBooting || !initialQueueLoaded) {
      showInboxFsLoading("Carico " + tabLabel(state.tab).toLowerCase() + "\u2026");
    } else {
      if (initialQueueLoaded) hideInboxFsLoading(true);
    }
  }

  function clearLoadWatchdog() {
    if (loadWatchdogTimer) {
      clearTimeout(loadWatchdogTimer);
      loadWatchdogTimer = null;
    }
  }

  function chainQueueLoad(seq, nextOpts) {
            if (!nextOpts.quiet && seq === loadSeq) {
      loadInFlightNonQuiet = false;
      clearLoadWatchdog();
    }
    return loadQueue(nextOpts);
  }

  function armLoadWatchdog(seq) {
    clearLoadWatchdog();
    var capMs =
      state.tab === "appelli"
        ? T.isCoarseMobile && T.isCoarseMobile()
          ? 7000
          : 8000
        : state.tab === "resoconti"
          ? T.isCoarseMobile && T.isCoarseMobile()
            ? 5500
            : 7000
          : T.isCoarseMobile && T.isCoarseMobile()
            ? 10000
            : 14000;
    loadWatchdogTimer = setTimeout(function () {
      loadWatchdogTimer = null;
      if (seq !== loadSeq) return;
      var list = T.byId("vc-staff-inbox-list");
      var softStuck = list && list.classList.contains("is-refreshing");
      var hardStuck = list && list.classList.contains("is-loading");
      if (!list || (!hardStuck && !softStuck && !isInboxFsLoadingVisible())) return;
      if (softStuck && !hardStuck && !isInboxFsLoadingVisible()) {
        /* Soft-only: sblocca senza svuotare la lista */
        clearInboxLoading();
        loadInFlightNonQuiet = false;
        return;
      }
            forceReleaseStuckInboxLoad();
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
    if (!opts.force && seq !== loadSeq) return;
    if (seq === loadSeq) clearLoadWatchdog();
    clearSkeletonWatchdog();
    // Release FS gate only when first paint is ready, or on hard failure (force + message).
    if (initialQueueLoaded || (opts.force && opts.message)) {
      hideInboxBootScreen(true);
    }
    try {
      renderTabs();
      renderScopeToggle();
      renderQueueFilters();
      renderWeekNav();
    } catch (eChrome) {}
    var list = T.byId("vc-staff-inbox-list");
    if (!list) return;
    clearInboxLoading();
    list.removeAttribute("data-inbox-loading");
    var sk = list.querySelector(".vc-staff-inbox-loading");
    if (sk) sk.remove();
    try {
      renderList();
      tryOpenPendingFocusItem();
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
            if (state.items && state.items.length) {
        try {
          initialQueueLoaded = true;
          hideInboxBootScreen(true);
        } catch (eHide) {}
      }
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
        if (isInboxEmbed() && !isStaffScopeActive()) {
      T.hideStaffToast();
      return Promise.resolve();
    }
    if (isPuntiToltiTab()) {
      clearSkeletonWatchdog();
      loadInFlightNonQuiet = false;
      initialQueueLoaded = true;
      lastQueueLoadFailed = false;
      try {
        if (typeof clearInboxLoading === "function") clearInboxLoading();
      } catch (eClr) {}
      try {
        renderTabs();
      } catch (eTabs) {}
      return syncPuntiToltiMode();
    }
        try {
      syncPuntiToltiMode();
    } catch (eLeave) {}
        if (quiet && loadInFlightNonQuiet) {
      inboxRealtimeRefreshPending = true;
      return Promise.resolve();
    }
                if (
      !quiet &&
      loadInFlightNonQuiet &&
      loadQueueCoalesce &&
      !opts._internal &&
      !opts._retried &&
      !opts._retryCount &&
      !opts._waitedPerms &&
      !opts._waitedToken &&
      !opts._userIntent &&
      !opts._scopeSwitch
    ) {
      return loadQueueCoalesce;
    }
    var seq = (loadSeq += 1);
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
            try {
      renderTabs();
      renderScopeToggle();
      renderQueueFilters();
      renderWeekNav();
    } catch (eChrome) {}
    if (!quiet && !opts._noSkeleton) {
            var useSoft =
        soft &&
        !opts._scopeSwitch &&
        !opts._userIntent &&
        (state.items.length || state.selectedKey || pendingFocusItemId);
      showInboxLoading(useSoft ? "soft" : "skeleton");
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
                if (opts.sync === true || opts._forceDiscordSync === true) {
          url += "&sync=1";
        }

        var prefetched = consumeQueuePrefetch(requestedTab, requestedScope, requestedPage);
        var fetchOpts = {
          /* notifQueueFast1: timeout più corti — paint DB prima, sync Discord non blocca 28s */
          timeoutMs:
            requestedTab === "appelli"
              ? T.resolveFetchTimeoutMs
                ? T.resolveFetchTimeoutMs(opts.sync ? 14000 : 10000)
                : opts.sync
                  ? 14000
                  : 10000
              : requestedTab === "resoconti"
                ? T.resolveFetchTimeoutMs
                  ? T.resolveFetchTimeoutMs(opts.sync ? 14000 : 10000)
                  : opts.sync
                    ? 14000
                    : 10000
                : T.resolveFetchTimeoutMs
                  ? T.resolveFetchTimeoutMs(12000)
                  : 12000,
          signal: loadAbortCtrl ? loadAbortCtrl.signal : null,
        };
        /* inboxLiveDecisionFix1 / inboxTabPaint1: switch tab/scope sempre network */
        if (quiet || opts._realtime || opts.cache === false || opts._scopeSwitch || opts._userIntent) {
          fetchOpts.cache = false;
        }
        var fetchPromise = prefetched
          ? prefetched.then(function (out) {
              if (out && out.res && !(quiet || opts._realtime || opts.cache === false)) return out;
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
            /* notifApiErr1: soft/abort/json/rete → retry, no scary toast if list already ok */
            var is429 =
              errCode === "rate_limited_client" ||
              errCode === "rate_limited" ||
              Number(out.res && out.res.status) === 429;
            var softFail =
              Boolean(out.soft) ||
              Boolean(out.data && out.data.soft) ||
              errCode === "aborted" ||
              errCode === "timeout" ||
              errCode === "network_error" ||
              errCode === "invalid_json" ||
              errCode === "empty_body" ||
              is429 ||
              Number(out.res && out.res.status) === 0 ||
              Number(out.res && out.res.status) === 408;
            var retryCount = Number(opts._retryCount || 0) + (opts._retried ? 1 : 0);
            if (!opts._retryCount && opts._retried) retryCount = 1;
            /* rateLimitCalm1: 429 = stop stampede; su switch tab ritenta 1 volta dopo cooldown */
            if (is429) {
              try {
                if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
                  window.VcApiCache.noteWebhook429(20, apiBase());
                }
              } catch (e429n) {}
              if (!quiet) endNonQuietQueueLoad(seq);
              if (!quiet) {
                lastQueueLoadFailed = true;
                finalizeVisibleQueueLoad(seq, quiet);
                var wantRetry =
                  (opts._userIntent || opts._scopeSwitch) &&
                  !opts._rateLimitRetry &&
                  !state.items.length &&
                  state.tab === requestedTab;
                if (wantRetry) {
                  showInboxLoading("skeleton");
                  window.setTimeout(function () {
                    if (state.tab !== requestedTab) return;
                    if (state.items.length) return;
                    loadQueue({
                      soft: false,
                      _userIntent: true,
                      _scopeSwitch: true,
                      cache: false,
                      _rateLimitRetry: true,
                      _internal: true,
                    }).catch(function () {});
                  }, 2800);
                } else if (!state.items.length) {
                  safeRenderList();
                }
              }
              return;
            }
            if (errCode === "aborted") {
              if (!quiet) endNonQuietQueueLoad(seq);
              finalizeVisibleQueueLoad(seq, quiet);
              return;
            }
            if ((timedOut || unauthorized || softFail || !out.res.ok) && retryCount < 3 && !quiet) {
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
              if (softFail && (soft || state.items.length)) {
                finalizeVisibleQueueLoad(seq, quiet);
                return;
              }
              var loadMsg =
                (out.data && out.data.message) ||
                (Number(out.res && out.res.status) >= 500
                  ? "Servizio inbox temporaneamente non disponibile. Riprova tra qualche secondo."
                  : unauthorized
                    ? "Sessione scaduta. Ricarica la pagina e accedi di nuovo."
                    : softFail
                      ? ""
                    : "Impossibile caricare la coda.");
              if (loadMsg) inboxNotify(loadMsg, true);
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
                    pendingListRetryCount = 0;
          clearSkeletonWatchdog();
          appealFixWaitCount = 0;
          if (out.data.summary) applySummaryPayload(out.data);
          var incomingItems = Array.isArray(out.data.items) ? out.data.items : [];
          // Quiet boot soft refresh must never wipe a good first stamp with an empty payload.
          // inboxLiveDecisionFix1: after initial load / realtime, empty pending is a real decision result.
          if (
            !(
              quiet &&
              !incomingItems.length &&
              state.items &&
              state.items.length &&
              !initialQueueLoaded &&
              !opts._realtime
            )
          ) {
            state.items = mergeIncomingWorkflowItems(incomingItems);
          }
          if (state.items.length) initialQueueLoaded = true;
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
          /* inboxPendingBadgeSync1: dopo summary API, la lista pending vince sul badge */
          syncTabBadgeFromLoadedQueue(
            requestedTab,
            requestedScope,
            requestedFilter,
            state.items,
            state.pagination,
            state.page,
          );
          if (state.summary && state.page <= 1 && state.items.length > 0) {
            delete emptyLoadedTabs[requestedTab];
            renderTabs();
          }
          if (!quiet) T.hideStaffToast();
          renderPagination();
          renderWeekNav();
          syncDetailWithList();
          /* inboxTabPaint1: paint SUBITO (anche non-quiet) — prima aspettava solo finalize */
          try {
            lastInboxListPaintSig = "";
            renderList({ force: true });
          } catch (ePaintNow) {
            safeRenderList();
          }
          if (quiet) {
            try {
              renderTabs();
            } catch (eQt) {}
          }
          try {
            tryOpenPendingFocusItem();
          } catch (eFocusOpen) {}
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
                soft: false,
                _internal: true,
                _boot: true,
                _switchedBootTab: true,
                _userIntent: true,
              });
            }
          }
          var summaryCount =
            state.summary && state.summary[requestedTab] != null
              ? Number(state.summary[requestedTab]) || 0
              : 0;
          if (
            !quiet &&
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
                /* inboxTabPaint1: sync Discord su TUTTE le code dopo switch vuoto */
                sync: true,
                soft: false,
                _userIntent: true,
                cache: false,
              }),
            );
          }
          if (
            !quiet &&
            !state.items.length &&
            (opts._scopeSwitch || opts._userIntent) &&
            !opts._emptyRetry &&
            !opts.sync &&
            !summaryCount
          ) {
            /* switch tab con summary 0: un sync prima di stampare empty definitivo */
            return chainQueueLoad(
              seq,
              Object.assign({}, opts, {
                _emptyRetry: true,
                _internal: true,
                sync: true,
                soft: false,
                _userIntent: true,
                cache: false,
              }),
            );
          }
          if (
            !quiet &&
            requestedTab === "appelli" &&
            requestedScope === "pending" &&
            !state.items.length &&
            summaryCount > 0 &&
            Number(opts._appealRetry || 0) < 2
          ) {
            var appealTry = Number(opts._appealRetry || 0) + 1;
            return new Promise(function (resolve) {
              window.setTimeout(resolve, 350 + appealTry * 400);
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
            initialQueueLoaded &&
            !pendingFocusItemId &&
            !urlHasExplicitInboxTab() &&
            (Number(opts._appealRetry || 0) >= 2 || requestedTab !== "appelli")
          ) {
            markTabConfirmedEmpty(requestedTab);
          }
          if (
            !quiet &&
            requestedScope === "pending" &&
            !state.items.length &&
            summaryCount > 0 &&
            (opts._emptyRetry || opts.sync) &&
            !opts._switchedEmptyTab &&
            initialQueueLoaded &&
            !pendingFocusItemId &&
            !urlHasExplicitInboxTab() &&
            !(
              requestedTab === "appelli" &&
              Number(opts._appealRetry || 0) < 2 &&
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
                    if (
            !quiet &&
            (opts._boot || !initialQueueLoaded) &&
            !state.items.length &&
            summaryCount > 0 &&
            !opts._bootEmptyRescue
          ) {
            // Keep the same FS gate through the rescue fetch — don't hide then re-show.
            if (seq === loadSeq) {
              loadInFlightNonQuiet = false;
              clearLoadWatchdog();
            }
            showInboxFsLoading("Carico " + tabLabel(state.tab).toLowerCase() + "\u2026");
            armInboxFsGateHardFailsafe();
            window.setTimeout(function () {
              if (!isStaffScopeActive()) {
                forceReleaseStuckInboxLoad();
                return;
              }
              if (state.items.length) {
                initialQueueLoaded = true;
                hideInboxBootScreen(true);
                return;
              }
              loadQueue({
                soft: true,
                sync: requestedTab === "appelli" || requestedTab === "resoconti" || requestedTab === "candidature",
                quiet: false,
                _internal: true,
                _bootEmptyRescue: true,
                _boot: true,
                _userIntent: true,
                _forceDiscordSync:
                  requestedTab === "appelli" || requestedTab === "resoconti" || requestedTab === "candidature",
              })
                .catch(function () {
                  forceReleaseStuckInboxLoad();
                  finishQueueLoad(loadSeq, { force: true });
                })
                .then(function () {
                  /* inboxStuckKill2: se rescue non sblocca, alza comunque */
                  window.setTimeout(function () {
                    if (state.items.length) return;
                    var listEl = T.byId("vc-staff-inbox-list");
                    var stillStuck =
                      isInboxFsLoadingVisible() ||
                      (listEl &&
                        (listEl.classList.contains("is-loading") ||
                          listEl.querySelector(".vc-staff-inbox-loading")));
                    if (!stillStuck) return;
                    forceReleaseStuckInboxLoad();
                    finishQueueLoad(loadSeq, { force: true });
                  }, 2800);
                });
            }, 180);
            return;
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
          /* notifApiErr1: abort/rete soft già ritentati — niente toast se lista presente */
          if (!(soft || state.items.length)) {
          inboxNotify("Errore di rete. Controlla la connessione e riprova.", true);
          }
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
                    if (loadInFlightNonQuiet && !state.items.length) {
            window.setTimeout(function () {
              if (seq !== loadSeq) return;
              if (!loadInFlightNonQuiet) return;
              var list = T.byId("vc-staff-inbox-list");
              if (list && (list.classList.contains("is-loading") || isInboxFsLoadingVisible()) && listEmptyDespitePending()) {
                forceReleaseStuckInboxLoad();
                finishQueueLoad(seq, { force: true });
                loadQueue({
                  soft: Boolean(state.items.length || state.selectedKey || pendingFocusItemId),
                  sync: true,
                  _internal: true,
                  _userIntent: true,
                }).catch(function () {});
              }
            }, 100);
          }
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
            return;
    }
    initStarted = true;
    unlockInboxPageChrome();
    readUrlState();
    seedPermissionsFromGate();
    ensureAccessibleTab();
    renderTabs();
    renderScopeToggle();
    renderQueueFilters();
    if (!T.getToken()) {
      showInboxBootScreen();
      initStarted = false;
      var tokenWait = T.isCoarseMobile && T.isCoarseMobile() ? 400 : 300;
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
        unlockInboxPageChrome();
        connectInboxWebSocket();
        ensureInboxPoll();
        scheduleMobileAppealBootGuarantee();
        if (lastQueueLoadFailed || !state.items.length) {
          window.setTimeout(function () {
            if (!isStaffScopeActive()) return;
            if (state.items.length && initialQueueLoaded) return;
            forceReleaseStuckInboxLoad({ abort: true, restart: true });
          }, 900);
        }
      })
      .catch(function () {
        initialQueueLoaded = true;
        hideInboxBootScreen(true);
        unlockInboxPageChrome();
        finishQueueLoad(loadSeq, { force: true });
        loadInFlightNonQuiet = false;
        lastQueueLoadFailed = true;
        inboxNotify("Impossibile caricare l'inbox.", true);
        connectInboxWebSocket();
        ensureInboxPoll();
        window.setTimeout(function () {
          forceReleaseStuckInboxLoad({ abort: true, restart: true });
        }, 600);
      });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      /* inboxUnblockKill1: al ritorno tab spegni gate stuck subito */
      try {
        if (
          document.documentElement.classList.contains("vc-notif-staff-loading") ||
          isInboxFsLoadingVisible()
        ) {
          forceReleaseStuckInboxLoad();
        }
      } catch (eVisGate) {}
      if (Date.now() - lastVisibleRefreshAt < 8000) return;
      lastVisibleRefreshAt = Date.now();
      scheduleInboxRefreshFromRealtime({ immediate: true });
    });
  }

  /* inboxRefreshUnlock1: heartbeat rapido — unlock UI; restart fetch solo se lista vuota */
  (function armInboxUnblockHeartbeat() {
    try {
      if (window.__vcInboxUnblockHeartbeat) return;
      window.__vcInboxUnblockHeartbeat = window.setInterval(function () {
        try {
          if (document.hidden || document.visibilityState === "hidden") return;
        } catch (eHid) {}
        try {
          if (!isStaffScopeActive()) return;
          var list = T.byId("vc-staff-inbox-list");
          var hasRows = Boolean(
            list && list.querySelector(".vc-staff-inbox-item, .vc-notify-row"),
          );
          var soft = list && list.classList.contains("is-refreshing");
          var hard = list && list.classList.contains("is-loading");
          var hold = document.documentElement.classList.contains("vc-interaction-hold");
          var gateCls = document.documentElement.classList.contains("vc-notif-staff-loading");
          var early = document.documentElement.classList.contains("vc-notif-early-staff");
          var bootCls = document.documentElement.classList.contains("vc-page-cine-boot");
          var notReady = !document.documentElement.classList.contains("vc-page-cine-ready");
          var gateEl = isInboxFsLoadingVisible();
          var gateHold = Boolean(window.__VC_INBOX_FS_GATE_HOLD);
          var stuckEmpty =
            !hasRows &&
            (hard || soft || gateCls || early || gateHold || !initialQueueLoaded || lastQueueLoadFailed);
          /* Con righe: solo unlock UI, NON abort del fetch */
          if (hasRows && (soft || hard || hold || gateCls || early || gateEl || gateHold || bootCls || notReady)) {
            forceReleaseStuckInboxLoad({ abort: false });
            return;
          }
          if (stuckEmpty) {
            forceReleaseStuckInboxLoad({ abort: true, restart: !loadInFlightNonQuiet });
            return;
          }
          if (hold || gateCls || early || gateEl || gateHold || bootCls || notReady) {
            unlockInboxPageChrome();
          }
        } catch (eHb) {}
      }, 1400);
      window.__vcForceReleaseInbox = forceReleaseStuckInboxLoad;
      /* notifSheetOpenFix1: soft-open da campanella/notifica già su /notifications */
      window.__vcStaffInboxOpenDeepLink = function (opts) {
        opts = opts || {};
        try {
          if (isInboxEmbed() && !isStaffScopeActive()) {
            try {
              if (window.VcNotifScope && typeof window.VcNotifScope.setScope === "function") {
                window.VcNotifScope.setScope("staff", { push: false, remember: false });
              }
            } catch (eForceSc) {}
            if (!isStaffScopeActive()) return false;
          }
        } catch (eScope) {
          return false;
        }
        var tab = String(opts.inbox || "").trim().toLowerCase();
        var item = String(opts.item || "").trim();
        var scope = String(opts.scope || "pending").trim().toLowerCase() || "pending";
        if (tab) {
          var okTab = TABS.some(function (t) {
            return t.id === tab;
          });
          if (!okTab && tab !== "punti-tolti") return false;
          state.tab = tab;
          state.filter = "";
          state.week = "";
          state.page = 1;
        }
        if (scope === "pending" || scope === "all" || scope === "done") state.scope = scope;
        if (item) {
          pendingFocusConsumed = false;
          pendingFocusItemId = item;
          pendingFocusRetryUntil = 0;
        }
        try {
          syncUrlState();
          if (item) {
            var u = new URL(location.href);
            u.searchParams.set("item", item);
            u.searchParams.set("scope", state.scope || "pending");
            if (isInboxEmbed()) u.searchParams.set("view", "staff");
            history.replaceState({}, "", u.pathname + u.search);
          }
        } catch (eUrl) {}
        try {
          renderTabs();
          renderScopeToggle();
        } catch (eChrome) {}
        /* notifQueueFast1: prima paint da DB (soft, no sync), poi sync background se vuoto */
        loadQueue({ soft: true, sync: false, _userIntent: true, _internal: true })
          .then(function () {
            tryOpenPendingFocusItem();
            schedulePendingFocusRetry();
            try {
              forceReleaseStuckInboxLoad();
            } catch (eRel) {}
            if (!state.items.length && (tab === "appelli" || tab === "candidature" || tab === "resoconti")) {
              return loadQueue({
                soft: true,
                sync: true,
                _forceDiscordSync: true,
                quiet: true,
                _internal: true,
                _userIntent: true,
              }).then(function () {
                tryOpenPendingFocusItem();
                try {
                  forceReleaseStuckInboxLoad();
                } catch (eRel2) {}
              });
            }
          })
          .catch(function () {
            schedulePendingFocusRetry();
            try {
              forceReleaseStuckInboxLoad();
            } catch (eRel3) {}
          });
        return true;
      };
    } catch (eArmHb) {}
  })();

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
      T.whenDiscordSessionReady(init, T.getToken() ? 1 : 400);
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
      forceRelease: function () {
        forceReleaseStuckInboxLoad({ abort: true, restart: true });
      },
      unlock: unlockInboxPageChrome,
      boot: function () {
        T.hideStaffToast();
        unlockInboxPageChrome();
        if (isInboxEmbed() && !isStaffScopeActive()) return;
        if (initStarted) {
          if (lastQueueLoadFailed || !initialQueueLoaded || !state.items.length) {
            forceReleaseStuckInboxLoad({ abort: true, restart: true });
            return;
          }
          if (needsMobileAppealReload()) {
            armMobileAppealBootFix(500);
          }
                    try {
            hideInboxBootScreen(true);
          } catch (eHideBoot) {}
          lastInboxListPaintSig = "";
          safeRenderList();
          return;
        }
        if (T.getToken()) {
          init();
        } else {
          T.whenDiscordSessionReady(init, T.isCoarseMobile && T.isCoarseMobile() ? 400 : 300);
        }
      },
    };
  } catch (eExport) {}

  try {
    window.__vcStaffInboxSetTab = setTab;
    window.__vcDismissSheetForQueueSwitch = dismissSheetForQueueSwitch;
    window.__vcInboxChromeActivate = onChromeActivate;
  } catch (eTabExp2) {}

  T.bootPage(function () {
    ensureInboxCineLayout();
    var inboxPageshowSeen = false;
    window.addEventListener("pageshow", function (ev) {
      if (isInboxEmbed() && !isStaffScopeActive()) return;
      seedPermissionsFromGate();
      repairInboxAfterBack();
      unlockInboxPageChrome();
      /* inboxCenterEmpty1: pageshow iniziale = stesso load del boot → no double fetch */
      if (!ev.persisted) {
        if (inboxPageshowSeen) return;
        inboxPageshowSeen = true;
        if (initialQueueLoaded && !lastQueueLoadFailed) safeRenderList();
        return;
      }
      /* inboxRefreshUnlock1: bfcache/back-forward → network + paint */
      emptyLoadedTabs = Object.create(null);
      lastInboxListPaintSig = "";
      if ((!initialQueueLoaded || lastQueueLoadFailed || !state.items.length) && !inboxLoadBusy()) {
        loadQueue({
          soft: false,
          sync: true,
          cache: false,
          _userIntent: true,
          _internal: true,
          _refreshUnlock: true,
        }).catch(function () {});
      } else {
        safeRenderList();
      }
    });
    window.addEventListener("vc-discord-profile", function () {
      if (!isStaffScopeActive()) return;
      if (!initStarted) {
        T.whenDiscordSessionReady(init, T.getToken() ? 1 : T.isCoarseMobile && T.isCoarseMobile() ? 400 : 300);
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
        if (T.getToken()) {
          init();
        } else {
          T.whenDiscordSessionReady(init, T.isCoarseMobile && T.isCoarseMobile() ? 400 : 300);
        }
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
      /* siteApiW4: queue + summary parallel on pull-to-refresh */
      return Promise.all([
        loadQueue({
          soft: Boolean(state.items.length),
          _internal: true,
          sync: state.tab === "appelli" || state.scope === "pending",
        }),
        loadSummary().catch(function () {}),
      ]);
    });
    if (isStaffScopeActive()) {
      T.whenDiscordSessionReady(init, T.getToken() ? 1 : 400);
    }
  });
})();
/* inboxCenterEmpty1 */
