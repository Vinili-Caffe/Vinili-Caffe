/**
 * notifStaffLazy1: staff inbox queue fetch/expand (lazy).
 * Loaded by vc-landing-notif when staff expands a row (or preload).
 */
(function () {
  var VER = "20261014notifStaffLazy1";
  if (window.__VC_NOTIF_STAFF_CHUNK === VER) return;
  var H = window.__VC_NOTIF_STAFF_HOST;
  if (!H || typeof H !== "object") {
    try { console.warn("[vc] notif-staff host missing"); } catch (e0) {}
    return;
  }
  window.__VC_NOTIF_STAFF_CHUNK = VER;

  var getDiscordAccessToken = H.getDiscordAccessToken;
  var getState = H.getState;
  var setState = H.setState;
  var BELL_INBOX_ROWS = H.BELL_INBOX_ROWS;
  var BELL_INBOX_PAGE_SIZE = H.BELL_INBOX_PAGE_SIZE;
  var tNotif = H.tNotif;
  var canBellInboxRow = H.canBellInboxRow;
  var hideBellInboxForbiddenRow = H.hideBellInboxForbiddenRow;
  var isBellInboxForbiddenErr = H.isBellInboxForbiddenErr;
  var isBellInboxBenignErr = H.isBellInboxBenignErr;
  var escBellHtml = H.escBellHtml;
  var bellInboxItemFocusId = H.bellInboxItemFocusId;
  var bellInboxItemLabel = H.bellInboxItemLabel;
  var bellInboxItemDetail = H.bellInboxItemDetail;
  var navigateBellInboxHref = H.navigateBellInboxHref;
  var puntiToltiApiBase = H.puntiToltiApiBase;
  var staffWorkflowsApiBase = H.staffWorkflowsApiBase;
  var notificationsStaffPageUrl = H.notificationsStaffPageUrl;
  var readCachedBellStaffSummary = H.readCachedBellStaffSummary;
  var paintNotifBellBadgeFromStore = H.paintNotifBellBadgeFromStore;
  var bellStaffQueueCache = H.getState("bellStaffQueueCache");
  var bellStaffQueueInFlight = H.getState("bellStaffQueueInFlight");
  var bellStaffPerms = H.getState("bellStaffPerms");

  function fetchBellInboxQueueItems(row) {
    var id = row && row.id ? String(row.id) : "";
    if (!id) return Promise.resolve([]);
    if (bellStaffQueueInFlight[id]) return bellStaffQueueInFlight[id];
    var cached = bellStaffQueueCache[id];
    if (cached && cached.ok !== false && Date.now() - Number(cached.at || 0) < 20000) {
      return Promise.resolve(cached.items || []);
    }
    var token = getDiscordAccessToken();
    if (!token) {
      return Promise.reject(new Error("Accedi per vedere questa coda."));
    }

    var url;
    if (row.punti || id === "punti-tolti") {
      var pt = puntiToltiApiBase();
      url =
        pt +
        (pt.indexOf("?") >= 0 ? "&" : "?") +
        "limit=" +
        encodeURIComponent(String(BELL_INBOX_PAGE_SIZE)) +
        "&pending=1";
    } else {
      var api = staffWorkflowsApiBase();
      /* notifQueueFast1: solo DB — niente sync=1 (Discord sync fino a 22s+) */
      url =
        api +
        (api.indexOf("?") >= 0 ? "&" : "?") +
        "queue=" +
        encodeURIComponent(id) +
        "&scope=pending&pageSize=" +
        encodeURIComponent(String(BELL_INBOX_PAGE_SIZE));
    }

    /* notifQueueFast1: timeout 8s — no hang 1min su Caricamento… */
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var abortTimer = window.setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (eAb) {}
    }, 8000);
    var fetchOpts = {
      method: "GET",
      credentials: "include",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cache: "no-store",
    };
    if (ctrl) fetchOpts.signal = ctrl.signal;

    bellStaffQueueInFlight[id] = fetch(url, fetchOpts)
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
      })
      .then(function (out) {
        /* notifApiErr1: ok:true senza items → lista vuota, non errore */
        if (out && out.body && out.body.ok === true) {
          var itemsOk = Array.isArray(out.body.items) ? out.body.items : [];
          itemsOk = itemsOk.slice(0, BELL_INBOX_PAGE_SIZE);
          bellStaffQueueCache[id] = { at: Date.now(), items: itemsOk, ok: true };
          if (out.body.permissions) {
            bellStaffPerms = out.body.permissions; setState("bellStaffPerms", bellStaffPerms);
          }
          return itemsOk;
        }
        var st = Number(out && out.status) || 0;
        var msg =
          (out && out.body && (out.body.message || out.body.error)) ||
          (st === 401 ? "Accedi per vedere questa coda." : "Impossibile caricare la coda.");
        var err = new Error(String(msg));
        err.status = st;
        err.benign =
          st === 401 ||
          st === 403 ||
          st === 0 ||
          st === 408 ||
          st === 429 ||
          st >= 500 ||
          !out ||
          !out.body;
        throw err;
      })
      .catch(function (err) {
        var aborted =
          (err && (err.name === "AbortError" || /abort/i.test(String(err.message || "")))) ||
          (ctrl && ctrl.signal && ctrl.signal.aborted);
        if (aborted) {
          var toErr = new Error("Caricamento troppo lento");
          toErr.status = 408;
          toErr.benign = true;
          if (cached && cached.ok !== false && Array.isArray(cached.items) && cached.items.length) {
            return cached.items;
          }
          throw toErr;
        }
        if (cached && cached.ok !== false && Array.isArray(cached.items)) {
          return cached.items;
        }
        throw err || new Error("Impossibile caricare la coda.");
      })
      .finally(function () {
        try {
          window.clearTimeout(abortTimer);
        } catch (eClr) {}
        bellStaffQueueInFlight[id] = null;
      });
    return bellStaffQueueInFlight[id];
  }

  function renderBellInboxItems(row, host, items) {
    if (!host) return;
    host.innerHTML = "";
    host.hidden = false;
    host.removeAttribute("hidden");
    var queueItems = Array.isArray(items) ? items.slice() : [];
    var ptExtra = [];
    if (row && row.id === "punti-tolti") {
      ptExtra = inboxNotifsForBucket("punti-tolti");
      ptExtra.forEach(function (n) {
        var item = document.createElement("li");
        item.className =
          "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--rich" + (n.read ? "" : " is-unread");
        var a = document.createElement("a");
        a.className = "vc-notif-bell-inbox__item-link vc-notif-bell-inbox__item-link--rich";
        var dest = String(n.openUrl || "").trim();
        a.href = dest ? resolveNotifDestUrl(dest) : notificationsStaffPageUrl("punti-tolti");
        var bodySnip = String(n.body || "").trim().slice(0, 110);
        var whenTxt = timeAgoLocalized(n.at || Date.now());
        a.innerHTML =
          '<span class="vc-notif-bell-inbox__item-dot" aria-hidden="true"></span>' +
          '<span class="vc-notif-bell-inbox__item-copy">' +
          '<span class="vc-notif-bell-inbox__item-label">' +
          escBellHtml(String(n.title || "Punti tolti")) +
          "</span>" +
          (bodySnip
            ? '<span class="vc-notif-bell-inbox__item-sub">' + escBellHtml(bodySnip) + "</span>"
            : "") +
          '<span class="vc-notif-bell-inbox__item-time">' +
          escBellHtml(whenTxt) +
          "</span>" +
          "</span>" +
          (!n.read
            ? '<span class="vc-notif-bell-inbox__item-badge is-pending" aria-label="In attesa"></span>'
            : "");
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          try {
            markOneRead(n.id);
          } catch (eMark) {}
          navigateBellInboxHref(a.href);
        });
        item.appendChild(a);
        host.appendChild(item);
      });
    }
    if (!queueItems.length && !ptExtra.length) {
      var empty = document.createElement("li");
      empty.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--empty";
      empty.textContent = "Nessuna richiesta";
      host.appendChild(empty);
      return;
    }
    /* loadSyncPack1: helper — append one queue item to host */
    function appendOneQueueItem(r, h, item) {
      var li = document.createElement("li");
      li.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--rich";
      var a = document.createElement("a");
      a.className = "vc-notif-bell-inbox__item-link vc-notif-bell-inbox__item-link--rich";
      var focusId = bellInboxItemFocusId(r.id, item);
      a.href = notificationsStaffPageUrl(r.id, focusId);
      var det = bellInboxItemDetail(r.id, item);
      var avHtml = det.avatarUrl
        ? '<img class="vc-notif-bell-inbox__item-av" src="' +
          escBellHtml(det.avatarUrl) +
          '" alt="" width="28" height="28" loading="lazy" decoding="async" />'
        : '<span class="vc-notif-bell-inbox__item-av vc-notif-bell-inbox__item-av--ph" aria-hidden="true"><i class="fa fa-user"></i></span>';
      a.innerHTML =
        avHtml +
        '<span class="vc-notif-bell-inbox__item-copy">' +
        '<span class="vc-notif-bell-inbox__item-label">' +
        escBellHtml(det.title) +
        "</span>" +
        (det.subtitle
          ? '<span class="vc-notif-bell-inbox__item-sub">' + escBellHtml(det.subtitle) + "</span>"
          : "") +
        (det.when
          ? '<span class="vc-notif-bell-inbox__item-time">' + escBellHtml(det.when) + "</span>"
          : "") +
        "</span>" +
        /* notifPendingSwitch1: pip rosso, niente testo Pending */
        '<span class="vc-notif-bell-inbox__item-badge is-pending" aria-label="In attesa"></span>' +
        '<i class="fa fa-chevron-right" aria-hidden="true"></i>';
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        navigateBellInboxHref(a.href);
      });
      li.appendChild(a);
      h.appendChild(li);
    }
    /* loadSyncPack1: window to 20 + load more */
    var INBOX_WIN = 20;
    var queueRest = queueItems.slice(INBOX_WIN);
    queueItems.slice(0, INBOX_WIN).forEach(function (item) { appendOneQueueItem(row, host, item); });
    /* loadSyncPack1: "Carica altre" before "Apri inbox completa" */
    if (queueRest.length) {
      (function () {
        var restRef = { items: queueRest };
        var loadMoreLi = document.createElement("li");
        loadMoreLi.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--more";
        var loadMoreBtn = document.createElement("button");
        loadMoreBtn.type = "button";
        loadMoreBtn.className = "vc-notif-bell-inbox__item-link vc-notif-bell-inbox__item-link--more";
        loadMoreBtn.textContent = "Carica altre (" + String(restRef.items.length) + ")";
        loadMoreBtn.addEventListener("click", function (ev) {
          ev.preventDefault();
          if (loadMoreLi.parentNode) loadMoreLi.parentNode.removeChild(loadMoreLi);
          var batch = restRef.items.slice(0, INBOX_WIN);
          restRef.items = restRef.items.slice(INBOX_WIN);
          batch.forEach(function (item) { appendOneQueueItem(row, host, item); });
          if (restRef.items.length) {
            loadMoreBtn.textContent = "Carica altre (" + String(restRef.items.length) + ")";
            /* re-insert before "Apri inbox completa" */
            var moreEl = host.querySelector(".vc-notif-bell-inbox__item--more a");
            var moreParent = moreEl && moreEl.parentNode;
            if (moreParent && moreParent.parentNode) {
              moreParent.parentNode.insertBefore(loadMoreLi, moreParent);
            } else {
              host.appendChild(loadMoreLi);
            }
          }
        });
        loadMoreLi.appendChild(loadMoreBtn);
        host.appendChild(loadMoreLi);
      })();
    }
    var more = document.createElement("li");
    more.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--more";
    var moreA = document.createElement("a");
    moreA.className = "vc-notif-bell-inbox__item-link vc-notif-bell-inbox__item-link--more";
    moreA.href = notificationsStaffPageUrl(row.id);
    moreA.textContent = "Apri inbox completa";
    moreA.addEventListener("click", function (ev) {
      ev.preventDefault();
      navigateBellInboxHref(moreA.href);
    });
    more.appendChild(moreA);
    host.appendChild(more);
  }

  function renderBellInboxLoadError(row, host, message) {
    if (!host) return;
    host.innerHTML = "";
    host.hidden = false;
    host.removeAttribute("hidden");
    var li = document.createElement("li");
    li.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--empty vc-notif-bell-inbox__item--error";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vc-notif-bell-inbox__retry";
    btn.textContent = String(message || "Errore di caricamento") + " — riprova";
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      host.removeAttribute("data-loaded");
      host.removeAttribute("data-loading");
      host.innerHTML =
        '<li class="vc-notif-bell-inbox__item vc-notif-bell-inbox__item--empty">Caricamento…</li>';
      loadBellInboxSectionItems(row, host);
    });
    li.appendChild(btn);
    host.appendChild(li);
  }

  function shouldPreserveBellInboxList() {
    try {
      if (bellNotifScope !== "staff") return false;
      if (Date.now() < Number(getState("bellInboxExpandLockUntil") || 0)) return true;
      var list = document.getElementById("vc-notif-bell-inbox-list");
      if (!list) return false;
      if (list.querySelector('[data-loading="1"]')) return true;
      if (list.querySelector(".vc-notif-bell-inbox__row.is-open")) return true;
    } catch (ePres) {}
    return false;
  }

  function loadBellInboxSectionItems(row, itemsHost) {
    if (!row || !itemsHost) return;
    var gen = String((Number(itemsHost.getAttribute("data-gen") || 0) || 0) + 1);
    itemsHost.setAttribute("data-gen", gen);
    itemsHost.setAttribute("data-loading", "1");
    itemsHost.setAttribute("data-load-started", String(Date.now()));
    fetchBellInboxQueueItems(row)
      .then(function (items) {
        if (itemsHost.getAttribute("data-gen") !== gen) return;
        if (!itemsHost.isConnected) return;
        itemsHost.removeAttribute("data-loading");
        itemsHost.setAttribute("data-loaded", "1");
        renderBellInboxItems(row, itemsHost, items || []);
        /* inboxBadgeLive1 / pageHang2: SOLO patch count — mai applyBellStaffSummaryLive qui
           (wipe+keepOpen+reload = loop → “La pagina non risponde”). */
        try {
          var nItems = Array.isArray(items) ? items.length : 0;
          if (row && row.id) {
            var cachedSum = readCachedBellStaffSummary();
            var sumObj =
              cachedSum && cachedSum.summary && typeof cachedSum.summary === "object"
                ? Object.assign({}, cachedSum.summary)
                : {};
            /* notifAutoDismissSync1: anche discesa a 0 (auto-cancel) aggiorna badge */
            sumObj[row.id] = nItems;
            try {
              var cachePayload = {
                summary: sumObj,
                permissions: (cachedSum && cachedSum.permissions) || bellStaffPerms || null,
                at: Date.now(),
              };
              sessionStorage.setItem("vc_inbox_summary_v1", JSON.stringify(cachePayload));
              localStorage.setItem("vc_inbox_summary_local_v1", JSON.stringify(cachePayload));
              window.__VC_INBOX_SUMMARY_PREFETCH = {
                ok: true,
                summary: sumObj,
                permissions: cachePayload.permissions,
              };
            } catch (eCacheP) {}
            /* aggiorna sig così un render successivo non wipea per lo stesso bump */
            try {
              var sigPartsFix = [];
              (BELL_INBOX_ROWS || []).forEach(function (r) {
                if (!r || !r.id) return;
                sigPartsFix.push(r.id + ":" + String(Number(sumObj[r.id]) || 0));
              });
              sigPartsFix.push("p:" + JSON.stringify(bellStaffPerms || {}));
              bellStaffSummarySig = sigPartsFix.join("|");
            } catch (eSigFix) {}
            patchBellStaffInboxCounts(sumObj);
          }
          paintNotifBellBadgeFromStore();
          syncNotifScopeSwitchPending();
        } catch (eBadgeLive) {}
        try {
          setState("bellInboxExpandLockUntil", Math.max(bellInboxExpandLockUntil, Date.now() + 800));
        } catch (eLock) {}
      })
      .catch(function (err) {
        if (itemsHost.getAttribute("data-gen") !== gen) return;
        if (!itemsHost.isConnected) return;
        itemsHost.removeAttribute("data-loading");
        itemsHost.removeAttribute("data-loaded");
        try {
          setState("bellInboxExpandLockUntil", Math.max(bellInboxExpandLockUntil, Date.now() + 600));
        } catch (eLock2) {}
        /* notifInboxGate1: never show "Solo High Staff — riprova"; hide gated queues. */
        if (isBellInboxForbiddenErr(err) || !canBellInboxRow(row)) {
          /* notifSheetScopeFix1: se summary ha count > 0 non nascondere — mostra retry */
          var sumCount = 0;
          try {
            var cachedSum = readCachedBellStaffSummary();
            sumCount = Number(cachedSum && cachedSum.summary && cachedSum.summary[row.id]) || 0;
          } catch (eSumC) {}
          if (sumCount <= 0) {
            hideBellInboxForbiddenRow(row);
            return;
          }
        }
        /* notifApiErr1: niente toast globale — solo retry inline; benign = copy soft */
        var benign = isBellInboxBenignErr(err);
        var msg = benign
          ? Number(err && err.status) === 401
            ? "Accedi per vedere questa coda."
            : "Caricamento non riuscito"
          : (err && err.message) || "Impossibile caricare la coda.";
        renderBellInboxLoadError(row, itemsHost, msg);
      });
  }

  function toggleBellInboxSection(row, btn, itemsHost, forceOpen) {
    if (!btn || !itemsHost) return;
    if (!canBellInboxRow(row)) {
      hideBellInboxForbiddenRow(row);
      return;
    }
    var wantOpen =
      typeof forceOpen === "boolean" ? forceOpen : btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", wantOpen ? "true" : "false");
    btn.classList.toggle("is-open", wantOpen);
    var rowEl = btn.closest(".vc-notif-bell-inbox__row");
    if (rowEl) rowEl.classList.toggle("is-open", wantOpen);
    try {
      var barEl = rowEl && rowEl.querySelector(".vc-notif-cat-bar, .vc-notif-bell-inbox__link");
      if (barEl) barEl.classList.toggle("is-open", wantOpen);
    } catch (eBarOpen) {}
    try {
      var rid = row && row.id ? String(row.id) : "";
      if (rid) {
        if (wantOpen) delete bellUserCollapsedCats["q:" + rid];
        else bellUserCollapsedCats["q:" + rid] = 1;
      }
    } catch (eCol) {}
    if (!wantOpen) {
      itemsHost.hidden = true;
      itemsHost.setAttribute("hidden", "");
      return;
    }
    /* notifCatLoadFix1: lock più lungo — peer-sync non deve wipe a metà fetch */
    setState("bellInboxExpandLockUntil", Date.now() + 2400);
    itemsHost.hidden = false;
    itemsHost.removeAttribute("hidden");
    var loaded = itemsHost.getAttribute("data-loaded") === "1";
    var loading = itemsHost.getAttribute("data-loading") === "1";
    var hasRows = Boolean(itemsHost.querySelector(".vc-notif-bell-inbox__item-link, .vc-notif-bell-inbox__retry"));
    if (loaded && hasRows && forceOpen !== true) return;
    if (loading) {
      var started = Number(itemsHost.getAttribute("data-load-started") || 0) || 0;
      if (started && Date.now() - started < 9000 && forceOpen !== true) return;
      /* stuck loading → riprova */
      itemsHost.removeAttribute("data-loading");
      itemsHost.removeAttribute("data-loaded");
    }
    itemsHost.innerHTML =
      '<li class="vc-notif-bell-inbox__item vc-notif-bell-inbox__item--empty">Caricamento…</li>';
    loadBellInboxSectionItems(row, itemsHost);
  }

  H.install({
    ver: VER,
    fetchBellInboxQueueItems: fetchBellInboxQueueItems,
    renderBellInboxItems: renderBellInboxItems,
    renderBellInboxLoadError: renderBellInboxLoadError,
    shouldPreserveBellInboxList: shouldPreserveBellInboxList,
    loadBellInboxSectionItems: loadBellInboxSectionItems,
    toggleBellInboxSection: toggleBellInboxSection,
  });
  try {
    document.dispatchEvent(new CustomEvent("vc:notif-staff-chunk-ready", { detail: { ver: VER } }));
  } catch (eEv) {}
})();
