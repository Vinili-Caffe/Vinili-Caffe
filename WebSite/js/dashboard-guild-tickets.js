(function (G) {
  "use strict";
  /* guildCoreSplit1: tickets UI chunk (lazy) */
  var state = G.state;
  var byId = G.byId;
  var canUseTickets = G.canUseTickets;
  var esc = G.esc;
  var escHtml = G.escHtml;
  var fetchDashboardJson = G.fetchDashboardJson;
  var fillSelect = G.fillSelect;
  var fillTicketCategorySelect = G.fillTicketCategorySelect;
  var findLiveTicketCategoryName = G.findLiveTicketCategoryName;
  var getToken = G.getToken;
  var i18n = G.i18n;
  var normalizeView = G.normalizeView;
  var resolveApiBase = G.resolveApiBase;
  var setError = G.setError;
  var setSuccess = G.setSuccess;
  var showSaveToast = G.showSaveToast;
  var syncTicketCategoryNameVisibility = G.syncTicketCategoryNameVisibility;
  var refreshDashFancySelect = G.refreshDashFancySelect;
  var enhanceAllDashFancySelects = G.enhanceAllDashFancySelects;
  var closeAllDashFancySelects = G.closeAllDashFancySelects;
  var wireForm = G.wireForm;

  function ticketTypeLabel(type) {
    var t = String(type || "").toLowerCase();
    if (t === "partnership") return "Partnership";
    if (t === "high" || t === "highstaff") return "High Staff";
    if (t === "perks") return "Perks";
    return "Supporto";
  }

  function syncTicketsModuleCard() {
    var enabled = Boolean(state.tickets && state.tickets.enabled);
    var card = document.querySelector('[data-module="tickets"]');
    if (card) {
      if (enabled) card.classList.add("is-on");
      else card.classList.remove("is-on");
    }
    var sw = document.querySelector('[data-module-switch="tickets"]');
    if (sw && sw.checked !== enabled) sw.checked = enabled;
    var badge = document.querySelector('[data-module-live-badge="tickets"]');
    if (badge) {
      if (enabled) badge.removeAttribute("hidden");
      else badge.setAttribute("hidden", "");
    }
  }

  function msToDhms(ms) {
    var total = Math.max(0, Math.floor(Number(ms) || 0));
    var minutesTotal = Math.floor(total / 60000);
    return {
      d: Math.floor(minutesTotal / (24 * 60)),
      h: Math.floor((minutesTotal % (24 * 60)) / 60),
      m: minutesTotal % 60,
    };
  }

  function dhmsToMs(prefix) {
    var d = Number((byId(prefix + "-d") && byId(prefix + "-d").value) || 0);
    var h = Number((byId(prefix + "-h") && byId(prefix + "-h").value) || 0);
    var m = Number((byId(prefix + "-m") && byId(prefix + "-m").value) || 0);
    if (!Number.isFinite(d)) d = 0;
    if (!Number.isFinite(h)) h = 0;
    if (!Number.isFinite(m)) m = 0;
    return ((Math.max(0, d) * 24 + Math.max(0, h)) * 60 + Math.max(0, m)) * 60 * 1000;
  }

  function setChecked(id, value) {
    var el = byId(id);
    if (el) el.checked = Boolean(value);
  }

  function setValue(id, value) {
    var el = byId(id);
    if (el) el.value = value == null ? "" : String(value);
  }

  function fillTicketsForm() {
    var s = state.tickets || {};
    var pickers = state.ticketsPickers || state.pickers || state.settingsPickers || {};
    var text = pickers.textChannels || [];
    var categories = pickers.categories || [];
    fillSelect(byId("tk-transcriptChannelId"), text, s.transcriptChannelId || s.logChannelId, i18n("dash.disabled", "Disabilitato"));
    var ticketCatId = s.ticketCategoryId || s.overflowCategoryId || "";
    fillTicketCategorySelect(byId("tk-ticketCategoryId"), categories, ticketCatId);
    var fancyFallback = s.categoryNameLive || s.defaultDiscordCategoryName || "";
    var liveCatName =
      s.categoryNameLive ||
      findLiveTicketCategoryName(categories, s.categoryName || "Tickets", fancyFallback);
        var displayCatName = liveCatName || fancyFallback || s.categoryName || "Tickets";
    if (
      String(displayCatName).toLowerCase() === "tickets" &&
      fancyFallback &&
      String(fancyFallback).toLowerCase() !== "tickets"
    ) {
      displayCatName = fancyFallback;
    }
    setValue("tk-categoryName", displayCatName);
    syncTicketCategoryNameVisibility();
    var ticketCatSelect = byId("tk-ticketCategoryId");
    if (ticketCatSelect && !ticketCatSelect._tkCatBound) {
      ticketCatSelect._tkCatBound = true;
      ticketCatSelect.addEventListener("change", syncTicketCategoryNameVisibility);
    }
    setValue("tk-maxOpenTicketsPerUser", s.maxOpenTicketsPerUser != null ? s.maxOpenTicketsPerUser : 5);
    setChecked("tk-allowUserClose", s.allowUserClose === true);
    setChecked("tk-closeConfirmation", s.closeConfirmation === true);
    setChecked("tk-ratingEnabled", s.ratingEnabled === true);
    setChecked("tk-anonymiseDashboardResponses", s.anonymiseDashboardResponses === true);
    setChecked("tk-storeTranscripts", s.storeTranscripts !== false);
    setChecked("tk-hideCloseButton", s.hideCloseButton === true);
    setChecked("tk-hideCloseReasonButton", s.hideCloseReasonButton === true);
    setChecked("tk-hideClaimButton", s.hideClaimButton === true);
    setChecked("tk-claimedStaffCanView", s.claimedStaffCanView !== false);
    setChecked("tk-claimedStaffCanType", s.claimedStaffCanType === true);
    setValue(
      "tk-panelSwitchBehavior",
      s.panelSwitchBehavior === "keep_claim" ? "keep_access" : s.panelSwitchBehavior || "auto_unclaim",
    );
    setChecked("tk-autoCloseEnabled", s.autoCloseEnabled === true);
    setChecked("tk-autoCloseOnUserLeave", s.autoCloseOnUserLeave === true);
    var acso = msToDhms(s.autoCloseSinceOpenMs != null ? s.autoCloseSinceOpenMs : 0);
    var acslm = msToDhms(s.autoCloseSinceLastMessageMs != null ? s.autoCloseSinceLastMessageMs : 0);
    setValue("tk-acso-d", acso.d);
    setValue("tk-acso-h", acso.h);
    setValue("tk-acso-m", acso.m);
    setValue("tk-acslm-d", acslm.d);
    setValue("tk-acslm-h", acslm.h);
    setValue("tk-acslm-m", acslm.m);
    var perms = s.ticketPerms || {};
    setChecked("tk-perm-addReactions", perms.addReactions !== false);
    setChecked("tk-perm-sendTtsMessages", perms.sendTtsMessages === true);
    setChecked("tk-perm-embedLinks", perms.embedLinks !== false);
    setChecked("tk-perm-attachFiles", perms.attachFiles !== false);
    setChecked("tk-perm-useExternalEmojis", perms.useExternalEmojis !== false);
    setChecked("tk-perm-useExternalStickers", perms.useExternalStickers !== false);
    setChecked("tk-perm-sendVoiceMessages", perms.sendVoiceMessages === true);
    enhanceAllDashFancySelects(byId("vc-dashboard-tickets-form") || document);
    syncTicketsModuleCard();
  }

  function readTicketsFormPatch() {
    var prev = state.tickets || {};
    return {
      maxOpenTicketsPerUser: Number((byId("tk-maxOpenTicketsPerUser") && byId("tk-maxOpenTicketsPerUser").value) || 1),
            language: String(prev.language || "server"),
      allowUserClose: Boolean(byId("tk-allowUserClose") && byId("tk-allowUserClose").checked),
      closeConfirmation: Boolean(byId("tk-closeConfirmation") && byId("tk-closeConfirmation").checked),
      ratingEnabled: Boolean(byId("tk-ratingEnabled") && byId("tk-ratingEnabled").checked),
      anonymiseDashboardResponses: Boolean(byId("tk-anonymiseDashboardResponses") && byId("tk-anonymiseDashboardResponses").checked),
      threadMode: Boolean(prev.threadMode),
      transcriptChannelId: String((byId("tk-transcriptChannelId") && byId("tk-transcriptChannelId").value) || "").trim() || null,
      overflowCategoryId: String((byId("tk-ticketCategoryId") && byId("tk-ticketCategoryId").value) || "").trim() || null,
      ticketCategoryId: String((byId("tk-ticketCategoryId") && byId("tk-ticketCategoryId").value) || "").trim() || null,
      categoryName: (function () {
        var typed = String((byId("tk-categoryName") && byId("tk-categoryName").value) || "").trim();
        var live = String((prev.categoryNameLive || prev.defaultDiscordCategoryName || "")).trim();
                if ((!typed || typed.toLowerCase() === "tickets") && live && live.toLowerCase() !== "tickets") {
          return live;
        }
        return typed || "Tickets";
      })(),
      storeTranscripts: Boolean(byId("tk-storeTranscripts") && byId("tk-storeTranscripts").checked),
      hideCloseButton: Boolean(byId("tk-hideCloseButton") && byId("tk-hideCloseButton").checked),
      hideCloseReasonButton: Boolean(byId("tk-hideCloseReasonButton") && byId("tk-hideCloseReasonButton").checked),
      hideClaimButton: Boolean(byId("tk-hideClaimButton") && byId("tk-hideClaimButton").checked),
      openCommandEnabled: prev.openCommandEnabled !== false,
      contextMenuEnabled: Boolean(prev.contextMenuEnabled),
      claimedStaffCanView: Boolean(byId("tk-claimedStaffCanView") && byId("tk-claimedStaffCanView").checked),
      claimedStaffCanType: Boolean(byId("tk-claimedStaffCanType") && byId("tk-claimedStaffCanType").checked),
      panelSwitchBehavior: String((byId("tk-panelSwitchBehavior") && byId("tk-panelSwitchBehavior").value) || "auto_unclaim"),
      autoCloseEnabled: Boolean(byId("tk-autoCloseEnabled") && byId("tk-autoCloseEnabled").checked),
      autoCloseOnUserLeave: Boolean(byId("tk-autoCloseOnUserLeave") && byId("tk-autoCloseOnUserLeave").checked),
      autoCloseSinceOpen: { d: Number((byId("tk-acso-d") && byId("tk-acso-d").value) || 0), h: Number((byId("tk-acso-h") && byId("tk-acso-h").value) || 0), m: Number((byId("tk-acso-m") && byId("tk-acso-m").value) || 0) },
      autoCloseSinceLastMessage: { d: Number((byId("tk-acslm-d") && byId("tk-acslm-d").value) || 0), h: Number((byId("tk-acslm-h") && byId("tk-acslm-h").value) || 0), m: Number((byId("tk-acslm-m") && byId("tk-acslm-m").value) || 0) },
      autoCloseSinceOpenMs: dhmsToMs("tk-acso"),
      autoCloseSinceLastMessageMs: dhmsToMs("tk-acslm"),
      ticketPerms: {
        addReactions: Boolean(byId("tk-perm-addReactions") && byId("tk-perm-addReactions").checked),
        sendTtsMessages: Boolean(byId("tk-perm-sendTtsMessages") && byId("tk-perm-sendTtsMessages").checked),
        embedLinks: Boolean(byId("tk-perm-embedLinks") && byId("tk-perm-embedLinks").checked),
        attachFiles: Boolean(byId("tk-perm-attachFiles") && byId("tk-perm-attachFiles").checked),
        useExternalEmojis: Boolean(byId("tk-perm-useExternalEmojis") && byId("tk-perm-useExternalEmojis").checked),
        useExternalStickers: Boolean(byId("tk-perm-useExternalStickers") && byId("tk-perm-useExternalStickers").checked),
        sendVoiceMessages: Boolean(byId("tk-perm-sendVoiceMessages") && byId("tk-perm-sendVoiceMessages").checked),
      },
    };
  }

  async function loadTickets(opts) {
    var options = opts || {};
    var token = getToken();
    if (!token || !state.guildId || !canUseTickets()) return false;
    var seq = ++state.ticketsLoadSeq;
    try {
      var out = await fetchDashboardJson(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/tickets",
        token,
        { attempts: options.silent ? 1 : 3 },
      );
      if (seq !== state.ticketsLoadSeq) return false;
      if (!out.res.ok || !out.data || out.data.ok === false) return false;
      state.tickets = out.data.settings || null;
      state.ticketsOverview = out.data.overview || null;
      state.ticketsPickers = out.data.pickers || null;
      fillTicketsForm();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function saveTickets(patch) {
    var token = getToken();
    if (!token || !state.guildId || state.ticketsSaving) return false;
    state.ticketsSaving = true;
    showSaveToast(i18n("dash.savingShort", "Salvataggio…"), false, { pending: true });
    try {
      var out = await fetchDashboardJson(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/tickets",
        token,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch || readTicketsFormPatch()),
        },
      );
      if (!out.res.ok || !out.data || out.data.ok === false) {
        showSaveToast(
          (out.data && out.data.message) || i18n("dash.tickets.errSave", "Salvataggio tickets non riuscito."),
          true,
        );
        return false;
      }
      var prevTickets = state.tickets || {};
      var nextTickets = out.data.settings || prevTickets || null;
            if (nextTickets && prevTickets) {
        if (!nextTickets.categoryNameLive && prevTickets.categoryNameLive) {
          nextTickets.categoryNameLive = prevTickets.categoryNameLive;
        }
        if (!nextTickets.defaultDiscordCategoryName && prevTickets.defaultDiscordCategoryName) {
          nextTickets.defaultDiscordCategoryName = prevTickets.defaultDiscordCategoryName;
        }
        var nextCn = String(nextTickets.categoryName || "").trim();
        var liveCn = String(nextTickets.categoryNameLive || prevTickets.categoryNameLive || "").trim();
        if ((!nextCn || nextCn.toLowerCase() === "tickets") && liveCn && liveCn.toLowerCase() !== "tickets") {
          nextTickets.categoryName = liveCn;
        }
      }
      state.tickets = nextTickets;
      if (out.data.overview) state.ticketsOverview = out.data.overview;
      if (out.data.pickers) state.ticketsPickers = out.data.pickers;
      fillTicketsForm();
      showSaveToast(i18n("dash.tickets.saved", "Impostazioni tickets salvate."), false);
      return true;
    } catch (_) {
      showSaveToast(i18n("dash.tickets.errNetwork", "Errore di rete durante il salvataggio tickets."), true);
      return false;
    } finally {
      state.ticketsSaving = false;
    }
  }

  function readFancySelectValue(id) {
    var el = byId(id);
    if (!el) return "";
    var nativeVal = String(el.value || "").trim();
    if (nativeVal) return nativeVal;
    var root = el.closest ? el.closest(".vc-dash-select") : null;
    var selected = root && root.querySelector
      ? root.querySelector(".vc-dash-select__option.is-selected[data-value]")
      : null;
    if (selected) {
      var fromUi = String(selected.getAttribute("data-value") || "").trim();
      if (fromUi) {
        try {
          el.value = fromUi;
        } catch (_) {}
        return fromUi;
      }
    }
    return "";
  }

  function readTranscriptFilters() {
    var panel = readFancySelectValue("tk-tx-panel");
    var rating = readFancySelectValue("tk-tx-rating");
    return {
      ticketId: String((byId("tk-tx-ticketId") && byId("tk-tx-ticketId").value) || "").trim(),
      username: String((byId("tk-tx-username") && byId("tk-tx-username").value) || "").trim(),
      userId: String((byId("tk-tx-userId") && byId("tk-tx-userId").value) || "").trim(),
      closedBy: String((byId("tk-tx-closedBy") && byId("tk-tx-closedBy").value) || "").trim(),
      panel: panel,
      ticketType: panel,
      rating: rating,
      claimedBy: String((byId("tk-tx-claimedBy") && byId("tk-tx-claimedBy").value) || "").trim(),
      closeReason: String((byId("tk-tx-closeReason") && byId("tk-tx-closeReason").value) || "").trim(),
    };
  }

  function formatTranscriptRating(score) {
    var n = Number(score);
    if (!Number.isFinite(n) || n < 1) return '<span class="vc-dash-tk-tx-muted">—</span>';
    var stars = "";
    var i;
    for (i = 0; i < Math.min(5, Math.round(n)); i += 1) stars += "★";
    return '<span class="vc-dash-tk-tx-rating" title="' + escHtml(String(Math.round(n))) + '/5">' + stars + "</span>";
  }

  function renderTranscriptRows(rows) {
    var body = byId("tk-tx-body");
    if (!body) return;
    body.innerHTML = "";
    (rows || []).forEach(function (row) {
      var tr = document.createElement("tr");
      var num = row.ticketNumber != null ? String(row.ticketNumber) : String(row.id || "—");
      var userLabel = row.username
        ? escHtml(row.username)
        : row.userId
          ? "<code>" + escHtml(row.userId) + "</code>"
          : "—";
      var reason = row.closeReason ? escHtml(row.closeReason) : '<span class="vc-dash-tk-tx-muted">—</span>';
      var openBtn =
        '<button type="button" class="vc-dashboard-btn" data-tk-tx-open="' +
        escHtml(String(row.id || "")) +
        '"' +
        (row.canOpenTranscript === false ? " disabled" : "") +
        '><i class="fa fa-eye" aria-hidden="true"></i> <span>' +
        escHtml(i18n("dash.tickets.txOpen", "Apri")) +
        "</span></button>";
      tr.innerHTML =
        "<td><strong>#" +
        escHtml(num) +
        "</strong></td>" +
        "<td>" +
        userLabel +
        "</td>" +
        "<td>" +
        formatTranscriptRating(row.ratingScore) +
        "</td>" +
        "<td>" +
        reason +
        "</td>" +
        "<td>" +
        escHtml(ticketTypeLabel(row.ticketType)) +
        "</td>" +
        "<td>" +
        openBtn +
        "</td>";
      body.appendChild(tr);
    });
  }

  function revokeTranscriptViewerBlob() {
    if (state.transcriptViewerBlobUrl) {
      try {
        URL.revokeObjectURL(state.transcriptViewerBlobUrl);
      } catch (_) {}
      state.transcriptViewerBlobUrl = null;
    }
  }

  function closeTranscriptViewer() {
    var viewer = byId("tk-tx-viewer");
    var list = byId("tk-tx-list-wrap");
    var intro = byId("tk-tx-intro");
    var frame = byId("tk-tx-viewer-frame");
    var loading = byId("tk-tx-viewer-loading");
    if (viewer) {
      viewer.setAttribute("hidden", "");
      viewer.style.display = "";
    }
    if (list) list.removeAttribute("hidden");
    if (intro) intro.removeAttribute("hidden");
    if (loading) loading.setAttribute("hidden", "");
    if (frame) {
      try {
        frame.removeAttribute("src");
        frame.src = "about:blank";
      } catch (_) {}
    }
    revokeTranscriptViewerBlob();
    state.transcriptViewerTicketId = null;
  }

  function showTranscriptViewerShell(row) {
    var viewer = byId("tk-tx-viewer");
    var list = byId("tk-tx-list-wrap");
    var intro = byId("tk-tx-intro");
    var title = byId("tk-tx-viewer-title");
    var meta = byId("tk-tx-viewer-meta");
    var loading = byId("tk-tx-viewer-loading");
    var frame = byId("tk-tx-viewer-frame");
    if (!viewer) return;
    if (list) list.setAttribute("hidden", "");
    if (intro) intro.setAttribute("hidden", "");
    viewer.removeAttribute("hidden");
    if (loading) loading.removeAttribute("hidden");
    if (frame) {
      try {
        frame.src = "about:blank";
      } catch (_) {}
    }
    var num =
      row && row.ticketNumber != null
        ? String(row.ticketNumber)
        : row && row.id
          ? String(row.id)
          : "—";
    if (title) title.textContent = "ticket-" + num;
    if (meta) {
      var bits = [];
      if (row && row.username) bits.push(String(row.username));
      else if (row && row.userId) bits.push("ID " + String(row.userId));
      if (row && row.ticketType) bits.push(ticketTypeLabel(row.ticketType));
      meta.textContent = bits.join(" · ");
    }
  }

  function mountTranscriptViewerHtml(html) {
    var frame = byId("tk-tx-viewer-frame");
    var loading = byId("tk-tx-viewer-loading");
    if (!frame) return;
    revokeTranscriptViewerBlob();
    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    state.transcriptViewerBlobUrl = URL.createObjectURL(blob);
    frame.onload = function () {
      if (loading) loading.setAttribute("hidden", "");
    };
    frame.src = state.transcriptViewerBlobUrl;
  }

  function mountTranscriptViewerUrl(url) {
    var frame = byId("tk-tx-viewer-frame");
    var loading = byId("tk-tx-viewer-loading");
    if (!frame) return;
    revokeTranscriptViewerBlob();
    frame.onload = function () {
      if (loading) loading.setAttribute("hidden", "");
    };
    frame.src = String(url || "");
  }

  function transcriptApiUrlFromPublicOrRow(urlOrRow) {
    if (urlOrRow && typeof urlOrRow === "object") {
      var rowUrl = String(urlOrRow.transcriptUrl || "").trim();
      if (rowUrl) return transcriptApiUrlFromPublicOrRow(rowUrl);
      return "";
    }
    var raw = String(urlOrRow || "").trim();
    if (!raw) return "";
    try {
      var u = new URL(raw, window.location.origin);
      var path = String(u.pathname || "");
      var mApi = path.match(/\/ticket[-_]transcript\/([a-f0-9]{64})\/?$/i);
      if (mApi) {
        return u.origin + "/ticket-transcript/" + mApi[1].toLowerCase();
      }
      if (/\/dashboard\/transcript\/?/i.test(path)) {
        var t = String(u.searchParams.get("t") || u.searchParams.get("token") || "")
          .trim()
          .toLowerCase();
        if (/^[a-f0-9]{64}$/.test(t)) {
          return u.origin + "/ticket-transcript/" + t;
        }
      }
    } catch (_) {}
    return "";
  }

  async function fetchTranscriptHtmlWithBearer(apiUrl, token) {
    var res = await fetch(String(apiUrl), {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      redirect: "manual",
    });
    if (!res.ok) {
      var errMsg = i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript.");
      try {
        var ctype = String(res.headers.get("content-type") || "");
        if (ctype.indexOf("application/json") !== -1) {
          var data = await res.json();
          if (data && data.message) errMsg = String(data.message);
        }
      } catch (_) {}
      var err = new Error(errMsg);
      err.status = res.status;
      throw err;
    }
    return await res.text();
  }

  async function openTranscriptRow(ticketId) {
    var token = getToken();
    var tid = String(ticketId || "").trim();
    if (!token || !state.guildId || !tid) return;
    var row = (state.transcriptsList || []).find(function (r) {
      return String(r.id || "") === tid;
    }) || { id: tid };
    state.transcriptViewerTicketId = tid;
    showTranscriptViewerShell(row);
    try {
      var res = await fetch(
        resolveApiBase() +
          "/guilds/" +
          encodeURIComponent(state.guildId) +
          "/tickets/transcripts/" +
          encodeURIComponent(tid),
        {
          method: "GET",
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
          redirect: "manual",
        },
      );
      if (String(state.transcriptViewerTicketId || "") !== tid) return;
      if (res.status >= 300 && res.status < 400) {
        var loc = res.headers.get("Location") || res.headers.get("location") || "";
        var fromRedirect = transcriptApiUrlFromPublicOrRow(loc);
        if (fromRedirect) {
          var htmlRedirect = await fetchTranscriptHtmlWithBearer(fromRedirect, token);
          if (String(state.transcriptViewerTicketId || "") !== tid) return;
          mountTranscriptViewerHtml(htmlRedirect);
          return;
        }
        closeTranscriptViewer();
        showSaveToast(i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript."), true);
        return;
      }
      if (!res.ok) {
        closeTranscriptViewer();
        showSaveToast(i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript."), true);
        return;
      }
      var ctype = String(res.headers.get("content-type") || "");
      if (ctype.indexOf("application/json") !== -1) {
        var data = await res.json().catch(function () {
          return {};
        });
        if (data && (data.apiUrl || data.redirectUrl)) {
          var apiUrl =
            String(data.apiUrl || "").trim() ||
            transcriptApiUrlFromPublicOrRow(data.redirectUrl);
          if (!apiUrl) {
            closeTranscriptViewer();
            showSaveToast(i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript."), true);
            return;
          }
          var htmlViaApi = await fetchTranscriptHtmlWithBearer(apiUrl, token);
          if (String(state.transcriptViewerTicketId || "") !== tid) return;
          mountTranscriptViewerHtml(htmlViaApi);
          return;
        }
        closeTranscriptViewer();
        showSaveToast(
          (data && data.message) || i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript."),
          true,
        );
        return;
      }
      var html = await res.text();
      if (String(state.transcriptViewerTicketId || "") !== tid) return;
            if (/vc-tx-gate|Accedi per vedere il transcript/i.test(html)) {
        var fallbackApi = transcriptApiUrlFromPublicOrRow(row);
        if (fallbackApi) {
          var html2 = await fetchTranscriptHtmlWithBearer(fallbackApi, token);
          if (String(state.transcriptViewerTicketId || "") !== tid) return;
          mountTranscriptViewerHtml(html2);
          return;
        }
        closeTranscriptViewer();
        showSaveToast(i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript."), true);
        return;
      }
      mountTranscriptViewerHtml(html);
    } catch (err) {
      if (String(state.transcriptViewerTicketId || "") !== tid) return;
      var fallback = transcriptApiUrlFromPublicOrRow(row);
      if (fallback) {
        try {
          var htmlFb = await fetchTranscriptHtmlWithBearer(fallback, token);
          if (String(state.transcriptViewerTicketId || "") !== tid) return;
          mountTranscriptViewerHtml(htmlFb);
          return;
        } catch (_) {}
      }
      closeTranscriptViewer();
      showSaveToast(
        (err && err.message) || i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript."),
        true,
      );
    }
  }

  function formatOpenTicketWhen(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return "—";
    }
  }

  function readOpenTicketsFilters() {
    return {
      ticketId: String((byId("tk-open-ticketId") && byId("tk-open-ticketId").value) || "").trim(),
      username: String((byId("tk-open-username") && byId("tk-open-username").value) || "").trim(),
      userId: String((byId("tk-open-userId") && byId("tk-open-userId").value) || "").trim(),
      claimedBy: String((byId("tk-open-claimedBy") && byId("tk-open-claimedBy").value) || "").trim(),
      panel: String((byId("tk-open-panel") && byId("tk-open-panel").value) || "").trim(),
      sort: String((byId("tk-open-sort") && byId("tk-open-sort").value) || "priority").trim() || "priority",
      mineOrUnclaimed: Boolean(byId("tk-open-mineOrUnclaimed") && byId("tk-open-mineOrUnclaimed").checked),
    };
  }

  function fillOpenTicketsPanelSelect(panels) {
    var sel = byId("tk-open-panel");
    if (!sel) return;
    var current = String(sel.value || "").trim();
    var types = {};
    (panels || []).forEach(function (p) {
      var t = String(p.ticketType || "").trim();
      if (t) types[t] = true;
    });
    var options = Object.keys(types)
      .sort()
      .map(function (t) {
        return { id: t, name: String(t).toUpperCase() };
      });
    fillSelect(sel, options, current, i18n("dash.tickets.openPanelAll", "Tutti i pannelli"));
    enhanceAllDashFancySelects(byId("tk-open-root") || document);
  }

  function renderOpenTicketRows(rows) {
    var body = byId("tk-open-body");
    if (!body) return;
    body.innerHTML = "";
    (rows || []).forEach(function (row) {
      var tr = document.createElement("tr");
      var num = row.ticketNumber != null ? String(row.ticketNumber) : String(row.id || "—");
      var userLabel = row.username
        ? escHtml(row.username)
        : row.userId
          ? "<code>" + escHtml(row.userId) + "</code>"
          : "—";
      var claimedLabel = row.claimedByUsername
        ? escHtml(row.claimedByUsername)
        : row.claimedBy
          ? "<code>" + escHtml(row.claimedBy) + "</code>"
          : '<span class="vc-dash-tk-tx-muted">' +
            escHtml(i18n("dash.tickets.openUnclaimed", "Non claimato")) +
            "</span>";
      var lastBits = [];
      if (row.lastMessageAt) lastBits.push(formatOpenTicketWhen(row.lastMessageAt));
      if (row.lastMessagePreview) lastBits.push(escHtml(row.lastMessagePreview));
      var lastHtml = lastBits.length
        ? lastBits.join(" · ")
        : '<span class="vc-dash-tk-tx-muted">—</span>';
      var awaiting = row.awaitingResponse === true;
      var awaitingHtml = awaiting
        ? '<span class="vc-dash-tk-open-awaiting"><i class="fa fa-clock-o" aria-hidden="true"></i> ' +
          escHtml(i18n("dash.yes", "Sì")) +
          "</span>"
        : '<span class="vc-dash-tk-open-awaiting is-no">' +
          escHtml(i18n("dash.no", "No")) +
          "</span>";
      var idCell = row.channelUrl
        ? '<a class="vc-dash-tk-open-link" href="' +
          escHtml(row.channelUrl) +
          '" target="_blank" rel="noopener noreferrer"><strong>#' +
          escHtml(num) +
          "</strong></a>"
        : "<strong>#" + escHtml(num) + "</strong>";
      tr.innerHTML =
        "<td>" +
        idCell +
        "</td>" +
        "<td>" +
        escHtml(row.panelTitle || String(row.ticketType || "").toUpperCase() || "—") +
        "</td>" +
        "<td>" +
        userLabel +
        "</td>" +
        "<td>" +
        claimedLabel +
        "</td>" +
        "<td>" +
        lastHtml +
        "</td>" +
        "<td>" +
        awaitingHtml +
        "</td>";
      body.appendChild(tr);
    });
  }

  function stopOpenTicketsPoll() {
    if (state.openTicketsPollTimer) {
      clearInterval(state.openTicketsPollTimer);
      state.openTicketsPollTimer = null;
    }
  }

  function startOpenTicketsPoll() {
    stopOpenTicketsPoll();
    state.openTicketsPollTimer = setInterval(function () {
      if (normalizeView(window.location.hash || "") !== "tickets/aperti") {
        stopOpenTicketsPoll();
        return;
      }
      refreshOpenTicketsList({ silent: true });
    }, 10000);
  }

  function scheduleOpenTicketsFilterRefresh() {
    if (state.openTicketsFilterTimer) clearTimeout(state.openTicketsFilterTimer);
    state.openTicketsFilterTimer = setTimeout(function () {
      state.openTicketsFilterTimer = null;
      state.openTicketsOffset = 0;
      refreshOpenTicketsList({ silent: true });
    }, 550);
  }

  function flushOpenTicketsFilterRefresh() {
    if (state.openTicketsFilterTimer) {
      clearTimeout(state.openTicketsFilterTimer);
      state.openTicketsFilterTimer = null;
    }
    state.openTicketsOffset = 0;
    refreshOpenTicketsList({ silent: true });
  }

  async function refreshOpenTicketsList(opts) {
    opts = opts || {};
    if (!state.guildId || !getToken()) return;
    var requestId = (state.openTicketsRequestId || 0) + 1;
    state.openTicketsRequestId = requestId;
    state.openTicketsLoading = true;
    var filters = readOpenTicketsFilters();
    var pageSize = Number(state.openTicketsPageSize || 30);
    var offset = Number(state.openTicketsOffset || 0);
    try {
      var params = new URLSearchParams();
      params.set("status", "open");
      params.set("limit", String(pageSize));
      params.set("offset", String(offset));
      params.set("sort", filters.sort || "priority");
      if (filters.ticketId) params.set("ticketId", filters.ticketId);
      if (filters.username) params.set("username", filters.username);
      if (filters.userId) params.set("userId", filters.userId);
      if (filters.claimedBy) params.set("claimedBy", filters.claimedBy);
      if (filters.panel) params.set("type", filters.panel);
      if (filters.mineOrUnclaimed) params.set("mineOrUnclaimed", "1");
      var res = await fetch(
        resolveApiBase() +
          "/guilds/" +
          encodeURIComponent(state.guildId) +
          "/tickets/list?" +
          params.toString(),
        {
          method: "GET",
          headers: { Authorization: "Bearer " + getToken(), Accept: "application/json" },
          cache: "no-store",
        },
      );
      var data = await res.json().catch(function () {
        return null;
      });
      if (requestId !== state.openTicketsRequestId) return;
      if (!res.ok || !data || !data.ok) {
        if (!opts.silent) {
          setError(
            (data && data.message) ||
              i18n("dash.tickets.openErrList", "Impossibile caricare i ticket aperti."),
          );
        }
        return;
      }
      setError("");
      state.openTicketsList = data.tickets || [];
      state.openTicketsTotal = Number(data.total || 0);
      state.openTicketsViewerId = data.viewerId || null;
      if (Array.isArray(data.panels)) {
        state.openTicketsPanels = data.panels;
        fillOpenTicketsPanelSelect(data.panels);
      }
      renderOpenTicketRows(state.openTicketsList);
      var empty = byId("tk-open-empty");
      var tableWrap = document.querySelector("#tk-open-root .vc-dash-tk-tx-table-wrap");
      if (empty) {
        if (state.openTicketsList.length) empty.setAttribute("hidden", "");
        else empty.removeAttribute("hidden");
      }
      if (tableWrap) {
        if (state.openTicketsList.length) tableWrap.removeAttribute("hidden");
        else tableWrap.setAttribute("hidden", "");
      }
      var countShown = byId("tk-open-count-shown");
      var countTotal = byId("tk-open-count-total");
      if (countShown) countShown.textContent = String(state.openTicketsList.length);
      if (countTotal) countTotal.textContent = String(state.openTicketsTotal);
      var pager = byId("tk-open-pager");
      var pageNum = Math.floor(offset / pageSize) + 1;
      var pageTotal = Math.max(1, Math.ceil(Number(state.openTicketsTotal || 0) / pageSize) || 1);
      var mp = window.__vcMiniPager;
      if (pager) {
        if (state.openTicketsTotal > pageSize && mp && typeof mp.fill === "function") {
          pager.removeAttribute("hidden");
          mp.fill(pager, pageNum, pageTotal, { aria: "Paginazione ticket aperti" }, {
            go: function (p) {
              var size = Number(state.openTicketsPageSize || 30);
              var tot = Math.max(1, Number(state.openTicketsTotal || 0));
              var pages = Math.max(1, Math.ceil(tot / size) || 1);
              var next = Math.max(1, Math.min(pages, Number(p) || 1));
              state.openTicketsOffset = (next - 1) * size;
              refreshOpenTicketsList({ silent: true });
            },
          });
        } else if (state.openTicketsTotal > pageSize) {
          pager.removeAttribute("hidden");
        } else {
          pager.setAttribute("hidden", "");
        }
      }
      if (!opts.silent) enhanceAllDashFancySelects(byId("tk-open-root") || document);
    } catch (_) {
      if (requestId !== state.openTicketsRequestId) return;
      if (!opts.silent) {
        setError(i18n("dash.tickets.openErrList", "Impossibile caricare i ticket aperti."));
      }
    } finally {
      if (requestId === state.openTicketsRequestId) state.openTicketsLoading = false;
    }
  }

  function stopTranscriptsPoll() {
    if (state.transcriptsPollTimer) {
      clearInterval(state.transcriptsPollTimer);
      state.transcriptsPollTimer = null;
    }
  }

  function startTranscriptsPoll() {
    if (state.transcriptsPollTimer) return;
    state.transcriptsPollTimer = setInterval(function () {
      if (String(state.view || "") !== "tickets/transcripts") {
        stopTranscriptsPoll();
        return;
      }
      if (document.visibilityState === "hidden") return;
      if (state.transcriptsLoading) return;
      if (state.transcriptsFilterTimer) return;
      refreshTranscriptsList({ silent: true });
    }, 8000);
  }

  function flushTranscriptsFilterRefresh() {
    if (state.transcriptsFilterTimer) {
      clearTimeout(state.transcriptsFilterTimer);
      state.transcriptsFilterTimer = null;
    }
    state.transcriptsOffset = 0;
    refreshTranscriptsList({ silent: true });
  }

  function scheduleTranscriptsFilterRefresh() {
    if (state.transcriptsFilterTimer) clearTimeout(state.transcriptsFilterTimer);
        state.transcriptsFilterTimer = setTimeout(function () {
      state.transcriptsFilterTimer = null;
      flushTranscriptsFilterRefresh();
    }, 550);
  }

  async function refreshTranscriptsList(opts) {
    var options = opts || {};
    var token = getToken();
    if (!token || !state.guildId || !canUseTickets()) return;
    var requestId = (state.transcriptsRequestId = Number(state.transcriptsRequestId || 0) + 1);
    state.transcriptsLoading = true;
    var pageSize = Number(state.transcriptsPageSize || 25);
    var offset = Number(state.transcriptsOffset || 0);
    var filters = readTranscriptFilters();
    state.transcriptsFilters = filters;
    var payload = {
      limit: pageSize,
      offset: offset,
    };
    Object.keys(filters).forEach(function (key) {
      if (filters[key]) payload[key] = filters[key];
    });
    try {
      var out = await fetchDashboardJson(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/tickets/transcripts",
        token,
        {
          attempts: options.silent ? 1 : 3,
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      if (requestId !== state.transcriptsRequestId) return;
      if (!out.res.ok || !out.data || out.data.ok === false) {
        if (!options.silent) {
          setError(
            (out.data && out.data.message) ||
              i18n("dash.tickets.txErrList", "Impossibile caricare i transcript."),
          );
        }
        return;
      }
      var applied = (out.data && out.data.appliedFilters) || {};
      if (filters.panel && String(applied.panel || applied.ticketType || "") !== String(filters.panel)) {
        if (!options.silent) {
          showSaveToast(
            i18n(
              "dash.tickets.txFilterMismatch",
              "Il filtro pannello non è stato applicato. Riprova o fai hard refresh.",
            ),
            true,
          );
        }
      }
      state.transcriptsList = out.data.transcripts || [];
      state.transcriptsTotal = Number(out.data.total || 0);
      renderTranscriptRows(state.transcriptsList);
      var empty = byId("tk-tx-empty");
      var tableWrap = document.querySelector("#tk-tx-root .vc-dash-tk-tx-table-wrap");
      if (empty) {
        if (state.transcriptsList.length) empty.setAttribute("hidden", "");
        else empty.removeAttribute("hidden");
      }
      if (tableWrap) {
        if (state.transcriptsList.length) tableWrap.removeAttribute("hidden");
        else tableWrap.setAttribute("hidden", "");
      }
      var countShown = byId("tk-tx-count-shown");
      var countTotal = byId("tk-tx-count-total");
      if (countShown) countShown.textContent = String(state.transcriptsList.length);
      if (countTotal) countTotal.textContent = String(state.transcriptsTotal);
      var count = byId("tk-tx-count");
      if (count) {
        count.setAttribute(
          "title",
          i18n("dash.tickets.listCount", "{shown} di {total}", {
            shown: String(state.transcriptsList.length),
            total: String(state.transcriptsTotal),
          }),
        );
      }
      var pager = byId("tk-tx-pager");
      var pageNum = Math.floor(offset / pageSize) + 1;
      var pageTotal = Math.max(1, Math.ceil(Number(state.transcriptsTotal || 0) / pageSize) || 1);
      var mp = window.__vcMiniPager;
      if (pager) {
        if (state.transcriptsTotal > pageSize && mp && typeof mp.fill === "function") {
          pager.removeAttribute("hidden");
          mp.fill(pager, pageNum, pageTotal, { aria: "Paginazione transcript" }, {
            go: function (p) {
              var size = Number(state.transcriptsPageSize || 25);
              var tot = Math.max(1, Number(state.transcriptsTotal || 0));
              var pages = Math.max(1, Math.ceil(tot / size) || 1);
              var next = Math.max(1, Math.min(pages, Number(p) || 1));
              state.transcriptsOffset = (next - 1) * size;
              refreshTranscriptsList({ silent: true });
            },
          });
        } else if (state.transcriptsTotal > pageSize) {
          pager.removeAttribute("hidden");
        } else {
          pager.setAttribute("hidden", "");
        }
      }
      if (!options.silent) enhanceAllDashFancySelects(byId("tk-tx-root") || document);
    } catch (_) {
      if (requestId !== state.transcriptsRequestId) return;
      if (!options.silent) {
        setError(i18n("dash.tickets.txErrList", "Impossibile caricare i transcript."));
      }
    } finally {
      if (requestId === state.transcriptsRequestId) {
        state.transcriptsLoading = false;
      }
    }
  }

  function ticketPanelsApi(path, method, body) {
    var token = getToken();
    var opts = {
      method: method || "GET",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
      },
    };
    if (body != null) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(
      resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/tickets" + path,
      opts,
    ).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, message: "Risposta non valida." };
      }).then(function (data) {
        return { res: res, data: data };
      });
    });
  }

  var TEAM_PERM_LABELS = {
    addReactions: "Add Reactions",
    sendMessages: "Send Messages",
    sendTtsMessages: "Send TTS Messages",
    embedLinks: "Embed Links",
    attachFiles: "Attach Files",
    mentionEveryone: "Mention Everyone",
    useExternalEmojis: "Use External Emojis",
    useApplicationCommands: "Use Application Commands",
    useExternalStickers: "Use External Stickers",
    sendVoiceMessages: "Send Voice Messages",
  };

  function ticketTeamsApi(path, method, body) {
    return ticketPanelsApi(path, method, body);
  }

  function getSelectedTicketTeam() {
    var id = String(state.ticketTeamsSelectedId || "").trim();
    var teams = (state.ticketTeams && state.ticketTeams.teams) || [];
    if (!id) return teams[0] || null;
    return (
      teams.find(function (t) {
        return String(t.id) === id;
      }) ||
      teams[0] ||
      null
    );
  }

  function fillTicketTeamsSelect() {
    var sel = byId("tk-teams-select");
    if (!sel) return;
    var teams = (state.ticketTeams && state.ticketTeams.teams) || [];
    var selected = String(state.ticketTeamsSelectedId || (teams[0] && teams[0].id) || "");
    fillSelect(
      sel,
      teams.map(function (t) {
        var label = String(t.name || "").trim() || t.id;
                if (t.isDefault && label.toLowerCase() !== "default") {
          label = label + " (Default)";
        }
        return { id: t.id, name: label };
      }),
      selected,
      i18n("dash.tickets.teamsSelectEmpty", "Seleziona un team"),
    );
    state.ticketTeamsSelectedId = String(sel.value || selected || "").trim() || null;
    enhanceAllDashFancySelects(byId("tk-teams-root") || document);
  }

  function ticketTeamMembersPayload(team) {
    return ((team && (team.memberIds || team.members)) || []).map(function (m) {
      return { type: m.type === "user" ? "user" : "role", id: String(m.id) };
    });
  }

  function renderTicketTeamsMembers() {
    var list = byId("tk-teams-members");
    var empty = byId("tk-teams-members-empty");
    if (!list) return;
    list.innerHTML = "";
    var team = getSelectedTicketTeam();
    var members = (team && team.members) || [];
    if (!members.length) {
      if (empty) empty.removeAttribute("hidden");
      return;
    }
    if (empty) empty.setAttribute("hidden", "");
    members.forEach(function (m) {
      var li = document.createElement("li");
      li.className = "vc-dash-tk-teams__member";
      var label = String(m.label || m.id || "");
      if (m.type === "user" && label && label.charAt(0) !== "@") label = "@" + label;
      li.innerHTML =
        '<span class="vc-dash-tk-teams__member-label">' +
        escHtml(label) +
        "</span>" +
        '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger" data-tk-team-member-remove="' +
        escHtml(String(m.type || "role") + ":" + String(m.id || "")) +
        '">' +
        escHtml(i18n("dash.tickets.teamsMemberRemove", "Elimina")) +
        "</button>";
      list.appendChild(li);
    });
  }

  function fillTicketTeamsAddRoleSelect() {
    var sel = byId("tk-teams-add-role");
    if (!sel) return;
    var roles = ((state.ticketTeams && state.ticketTeams.pickers) || {}).roles || [];
    var team = getSelectedTicketTeam();
    var taken = {};
    ticketTeamMembersPayload(team).forEach(function (m) {
      if (m.type === "role") taken[m.id] = true;
    });
    var options = roles
      .filter(function (r) {
        return !taken[String(r.id)];
      })
      .map(function (r) {
        return { id: r.id, name: "@" + String(r.name || r.id) };
      });
    fillSelect(sel, options, "", i18n("dash.tickets.teamsSearchRole", "Cerca ruolo…"));
    enhanceAllDashFancySelects(byId("tk-teams-root") || document);
  }

  function fillTicketTeamsAddUserSelect(members, selectedId) {
    var sel = byId("tk-teams-add-user");
    if (!sel) return;
    var team = getSelectedTicketTeam();
    var taken = {};
    ticketTeamMembersPayload(team).forEach(function (m) {
      if (m.type === "user") taken[m.id] = true;
    });
    var options = (members || [])
      .filter(function (m) {
        return m && m.id && !taken[String(m.id)];
      })
      .map(function (m) {
        return { id: m.id, name: "@" + String(m.username || m.label || m.id) };
      });
    fillSelect(
      sel,
      options,
      selectedId || "",
      options.length
        ? i18n("dash.tickets.teamsPickUser", "Seleziona utente…")
        : i18n("dash.tickets.teamsSearchUserEmpty", "Nessun utente trovato"),
    );
    enhanceAllDashFancySelects(byId("tk-teams-root") || document);
  }

  var ticketTeamsUserSearchTimer = null;
  var ticketTeamsUserSearchSeq = 0;

  async function searchTicketTeamUsers(query) {
    var q = String(query || "").trim();
    var sel = byId("tk-teams-add-user");
    if (!sel) return;
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) {
      fillTicketTeamsAddUserSelect([]);
      return;
    }
    var seq = ++ticketTeamsUserSearchSeq;
    try {
      var out = await ticketTeamsApi(
        "/teams/members/search?q=" + encodeURIComponent(q),
        "GET",
      );
      if (seq !== ticketTeamsUserSearchSeq) return;
      if (!out.res || !out.res.ok || !out.data || !out.data.ok) {
        fillTicketTeamsAddUserSelect([]);
        return;
      }
      var members = out.data.members || [];
      var selected = members.length === 1 ? String(members[0].id) : "";
      fillTicketTeamsAddUserSelect(members, selected);
    } catch (_) {
      if (seq === ticketTeamsUserSearchSeq) fillTicketTeamsAddUserSelect([]);
    }
  }

  function scheduleTicketTeamUserSearch() {
    var input = byId("tk-teams-add-user-q");
    var q = String((input && input.value) || "").trim();
    if (ticketTeamsUserSearchTimer) clearTimeout(ticketTeamsUserSearchTimer);
    ticketTeamsUserSearchTimer = setTimeout(function () {
      searchTicketTeamUsers(q);
    }, 320);
  }

  function renderTicketTeamsPerms() {
    var card = byId("tk-teams-perms-card");
    var root = byId("tk-teams-perms");
    if (!card || !root) return;
    var team = getSelectedTicketTeam();
    if (!team || team.isDefault) {
      card.setAttribute("hidden", "");
      root.innerHTML = "";
      return;
    }
    card.removeAttribute("hidden");
    var perms = team.perms || (state.ticketTeams && state.ticketTeams.defaultPerms) || {};
    var keys = (state.ticketTeams && state.ticketTeams.permKeys) || Object.keys(TEAM_PERM_LABELS);
    root.innerHTML = keys
      .map(function (key) {
        var on = perms[key] === true;
        return (
          '<label class="vc-dash-tk-teams__perm">' +
          '<span class="vc-dash-tk-teams__perm-label">' +
          escHtml(TEAM_PERM_LABELS[key] || key) +
          "</span>" +
          '<span class="vc-dash-switch">' +
          '<input type="checkbox" data-tk-team-perm="' +
          escHtml(key) +
          '"' +
          (on ? " checked" : "") +
          " />" +
          '<span class="vc-dash-switch__track" aria-hidden="true"><span class="vc-dash-switch__thumb"></span></span>' +
          "</span></label>"
        );
      })
      .join("");
  }

  function renderTicketTeamsEditor() {
    fillTicketTeamsSelect();
    var team = getSelectedTicketTeam();
    var delBtn = byId("tk-teams-delete-btn");
    var renameBtn = byId("tk-teams-rename-btn");
    if (delBtn) {
      if (team && !team.isDefault) delBtn.removeAttribute("hidden");
      else delBtn.setAttribute("hidden", "");
    }
    if (renameBtn) {
      if (team && !team.isDefault) renameBtn.removeAttribute("hidden");
      else renameBtn.setAttribute("hidden", "");
    }
    renderTicketTeamsMembers();
    fillTicketTeamsAddRoleSelect();
    fillTicketTeamsAddUserSelect([]);
    renderTicketTeamsPerms();
  }

  async function refreshTicketTeams(options) {
    options = options || {};
    if (!state.guildId || !getToken()) return;
    if (state.ticketTeamsLoading) return;
    state.ticketTeamsLoading = true;
    try {
      var out = await ticketTeamsApi("/teams", "GET");
      if (!out.res || !out.res.ok || !out.data || !out.data.ok) {
        if (!options.silent) {
          var msg =
            (out.data && out.data.message) ||
            i18n("dash.tickets.teamsErrLoad", "Impossibile caricare i team.");
          if (out.res && out.res.status === 404) {
            msg = i18n(
              "dash.tickets.teamsErrApiMissing",
              "API Staff Teams non disponibile. Riprova tra poco.",
            );
          }
          setError(msg);
        }
        return;
      }
      state.ticketTeams = out.data;
      if (!state.ticketTeamsSelectedId && out.data.teams && out.data.teams[0]) {
        state.ticketTeamsSelectedId = String(out.data.teams[0].id);
      } else if (
        state.ticketTeamsSelectedId &&
        !(out.data.teams || []).some(function (t) {
          return String(t.id) === String(state.ticketTeamsSelectedId);
        })
      ) {
        state.ticketTeamsSelectedId =
          out.data.teams && out.data.teams[0] ? String(out.data.teams[0].id) : null;
      }
      renderTicketTeamsEditor();
    } catch (_) {
      if (!options.silent) {
        setError(i18n("dash.tickets.teamsErrLoad", "Impossibile caricare i team."));
      }
    } finally {
      state.ticketTeamsLoading = false;
    }
  }

  async function patchSelectedTicketTeam(patch) {
    var team = getSelectedTicketTeam();
    if (!team || state.ticketTeamsSaving) return null;
    state.ticketTeamsSaving = true;
    try {
      var out = await ticketTeamsApi("/teams/" + encodeURIComponent(team.id), "PATCH", patch);
      if (!out.res.ok || !out.data || !out.data.ok) {
        showSaveToast(
          (out.data && out.data.message) ||
            i18n("dash.tickets.teamsErrSave", "Salvataggio team non riuscito."),
          true,
        );
        return null;
      }
      state.ticketTeams = Object.assign({}, state.ticketTeams || {}, {
        teams: out.data.teams || [],
      });
      if (out.data.team) state.ticketTeamsSelectedId = String(out.data.team.id);
      renderTicketTeamsEditor();
      return out.data.team;
    } finally {
      state.ticketTeamsSaving = false;
    }
  }

  function wireTicketTeamsUi() {
    var createForm = byId("tk-teams-create-form");
    if (createForm && !createForm.__vcWired) {
      createForm.__vcWired = true;
      createForm.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        if (state.ticketTeamsSaving) return;
        var nameEl = byId("tk-teams-create-name");
        var name = String((nameEl && nameEl.value) || "").trim();
        if (!name) return;
        state.ticketTeamsSaving = true;
        try {
          var out = await ticketTeamsApi("/teams", "POST", { name: name });
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.teamsErrCreate", "Creazione team non riuscita."),
              true,
            );
            return;
          }
          if (nameEl) nameEl.value = "";
          state.ticketTeams = Object.assign({}, state.ticketTeams || {}, {
            teams: out.data.teams || [],
          });
          if (out.data.team) state.ticketTeamsSelectedId = String(out.data.team.id);
          renderTicketTeamsEditor();
          showSaveToast(i18n("dash.tickets.teamsCreated", "Team creato."));
        } finally {
          state.ticketTeamsSaving = false;
        }
      });
    }

    var select = byId("tk-teams-select");
    if (select && !select.__vcWired) {
      select.__vcWired = true;
      select.addEventListener("change", function () {
        state.ticketTeamsSelectedId = String(select.value || "").trim() || null;
        renderTicketTeamsEditor();
      });
    }

    var addBtn = byId("tk-teams-add-role-btn");
    if (addBtn && !addBtn.__vcWired) {
      addBtn.__vcWired = true;
      addBtn.addEventListener("click", async function () {
        var team = getSelectedTicketTeam();
        var roleSel = byId("tk-teams-add-role");
        var roleId = String((roleSel && roleSel.value) || "").trim();
        if (!team || !roleId) return;
        var members = ticketTeamMembersPayload(team).concat([{ type: "role", id: roleId }]);
        await patchSelectedTicketTeam({ members: members });
      });
    }

    var userQ = byId("tk-teams-add-user-q");
    if (userQ && !userQ.__vcWired) {
      userQ.__vcWired = true;
      userQ.addEventListener("input", function () {
        scheduleTicketTeamUserSearch();
      });
      userQ.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          if (ticketTeamsUserSearchTimer) clearTimeout(ticketTeamsUserSearchTimer);
          searchTicketTeamUsers(String(userQ.value || "").trim());
        }
      });
    }

    var addUserBtn = byId("tk-teams-add-user-btn");
    if (addUserBtn && !addUserBtn.__vcWired) {
      addUserBtn.__vcWired = true;
      addUserBtn.addEventListener("click", async function () {
        var team = getSelectedTicketTeam();
        var userSel = byId("tk-teams-add-user");
        var userId = String((userSel && userSel.value) || "").trim();
        if (!team || !/^\d{16,22}$/.test(userId)) {
          showSaveToast(
            i18n("dash.tickets.teamsErrPickUser", "Seleziona un utente dalla ricerca."),
            true,
          );
          return;
        }
        var already = ticketTeamMembersPayload(team).some(function (m) {
          return m.type === "user" && m.id === userId;
        });
        if (already) return;
        var members = ticketTeamMembersPayload(team).concat([{ type: "user", id: userId }]);
        var saved = await patchSelectedTicketTeam({ members: members });
        if (saved) {
          var qEl = byId("tk-teams-add-user-q");
          if (qEl) qEl.value = "";
          fillTicketTeamsAddUserSelect([]);
        }
      });
    }

    var membersList = byId("tk-teams-members");
    if (membersList && !membersList.__vcWired) {
      membersList.__vcWired = true;
      membersList.addEventListener("click", async function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-tk-team-member-remove]") : null;
        if (!btn) return;
        var raw = String(btn.getAttribute("data-tk-team-member-remove") || "");
        var parts = raw.split(":");
        var type = parts[0] === "user" ? "user" : "role";
        var id = parts.slice(1).join(":");
        var team = getSelectedTicketTeam();
        if (!team || !id) return;
        var members = ticketTeamMembersPayload(team).filter(function (m) {
          return !(m.type === type && m.id === id);
        });
        await patchSelectedTicketTeam({ members: members });
      });
    }

    var permsRoot = byId("tk-teams-perms");
    if (permsRoot && !permsRoot.__vcWired) {
      permsRoot.__vcWired = true;
      permsRoot.addEventListener("change", async function (ev) {
        var input = ev.target && ev.target.closest ? ev.target.closest("[data-tk-team-perm]") : null;
        if (!input) return;
        var team = getSelectedTicketTeam();
        if (!team || team.isDefault) return;
        var perms = Object.assign({}, team.perms || {});
        perms[input.getAttribute("data-tk-team-perm")] = Boolean(input.checked);
        await patchSelectedTicketTeam({ perms: perms });
      });
    }

    var renameBtn = byId("tk-teams-rename-btn");
    if (renameBtn && !renameBtn.__vcWired) {
      renameBtn.__vcWired = true;
      renameBtn.addEventListener("click", async function () {
        var team = getSelectedTicketTeam();
        if (!team || team.isDefault) return;
        var D = window.VcDialog;
        if (!D || typeof D.prompt !== "function") {
          if (typeof window.__vcEnsureDialog === "function") D = await window.__vcEnsureDialog();
        }
        if (!D || typeof D.prompt !== "function") return;
        var next = await D.prompt({
          title: i18n("dash.tickets.teamsRenameTitle", "Rinomina team"),
          message: i18n("dash.tickets.teamsRenamePrompt", "Nuovo nome team"),
          label: i18n("dash.tickets.teamsName", "Nome"),
          defaultValue: team.name,
          confirmLabel: i18n("dash.tickets.teamsRenameOk", "Rinomina"),
          cancelLabel: i18n("dash.bl.cancel", "Annulla"),
          icon: "fa-pencil",
        });
        if (next == null) return;
        next = String(next).trim();
        if (!next || next === team.name) return;
        await patchSelectedTicketTeam({ name: next });
      });
    }

    var deleteBtn = byId("tk-teams-delete-btn");
    if (deleteBtn && !deleteBtn.__vcWired) {
      deleteBtn.__vcWired = true;
      deleteBtn.addEventListener("click", async function () {
        var team = getSelectedTicketTeam();
        if (!team || team.isDefault || state.ticketTeamsSaving) return;
        var D = window.VcDialog;
        if (!D || typeof D.confirm !== "function") {
          if (typeof window.__vcEnsureDialog === "function") D = await window.__vcEnsureDialog();
        }
        if (!D || typeof D.confirm !== "function") return;
        var confirmed = await D.confirm({
          title: i18n("dash.tickets.teamsDeleteTitle", "Eliminare il team?"),
          message: i18n("dash.tickets.teamsDeleteConfirm", "Eliminare il team \"{name}\"?", {
            name: team.name,
          }),
          confirmLabel: i18n("dash.tickets.teamsDeleteOk", "Elimina"),
          cancelLabel: i18n("dash.bl.cancel", "Annulla"),
          danger: true,
          icon: "fa-trash-o",
        });
        if (!confirmed) {
          return;
        }
        state.ticketTeamsSaving = true;
        try {
          var out = await ticketTeamsApi("/teams/" + encodeURIComponent(team.id), "DELETE");
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.teamsErrDelete", "Eliminazione non riuscita."),
              true,
            );
            return;
          }
          state.ticketTeams = Object.assign({}, state.ticketTeams || {}, {
            teams: out.data.teams || [],
          });
          state.ticketTeamsSelectedId =
            out.data.teams && out.data.teams[0] ? String(out.data.teams[0].id) : null;
          renderTicketTeamsEditor();
          showSaveToast(i18n("dash.tickets.teamsDeleted", "Team eliminato."));
        } finally {
          state.ticketTeamsSaving = false;
        }
      });
    }
  }

  function ticketBlacklistApi(path, method, body) {
    return ticketPanelsApi(path, method, body);
  }

  function syncTicketBlacklistTypeUi() {
    var typeEl = byId("tk-bl-type");
    var type = String((typeEl && typeEl.value) || "user");
    var userWrap = byId("tk-bl-user-wrap");
    var userPick = byId("tk-bl-user-pick-wrap");
    var roleWrap = byId("tk-bl-role-wrap");
    var isUser = type !== "role";
    if (userWrap) userWrap.hidden = !isUser;
    if (userPick) userPick.hidden = !isUser;
    if (roleWrap) roleWrap.hidden = isUser;
  }

  function fillTicketBlacklistPanelSelect() {
    var sel = byId("tk-bl-panel");
    if (!sel) return;
    var panels = (state.ticketBlacklist && state.ticketBlacklist.panels) || [];
    var options = [{ id: "", name: i18n("dash.tickets.blacklistPanelAll", "Tutti i pannelli") }].concat(
      panels.map(function (p) {
        return { id: p.id, name: String(p.title || p.id) };
      }),
    );
    fillSelect(sel, options, String(sel.value || ""), i18n("dash.tickets.blacklistPanelAll", "Tutti i pannelli"));
    enhanceAllDashFancySelects(byId("tk-bl-root") || document);
  }

  function fillTicketBlacklistRoleSelect() {
    var sel = byId("tk-bl-role");
    if (!sel) return;
    var roles = ((state.ticketBlacklist && state.ticketBlacklist.pickers) || {}).roles || [];
    fillSelect(
      sel,
      roles.map(function (r) {
        return { id: r.id, name: "@" + String(r.name || r.id) };
      }),
      "",
      i18n("dash.tickets.blacklistSearchRole", "Cerca ruolo…"),
    );
    enhanceAllDashFancySelects(byId("tk-bl-root") || document);
  }

  function fillTicketBlacklistUserSelect(members, selectedId) {
    var sel = byId("tk-bl-user");
    if (!sel) return;
    var options = (members || []).map(function (m) {
      return { id: m.id, name: "@" + String(m.username || m.label || m.id) };
    });
    fillSelect(
      sel,
      options,
      selectedId || "",
      options.length
        ? i18n("dash.tickets.blacklistPickUser", "Seleziona utente…")
        : i18n("dash.tickets.blacklistSearchUserEmpty", "Nessun utente trovato"),
    );
    enhanceAllDashFancySelects(byId("tk-bl-root") || document);
  }

  async function searchTicketBlacklistUsers(query) {
    var q = String(query || "").trim();
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) {
      fillTicketBlacklistUserSelect([]);
      return;
    }
    var seq = ++state.ticketBlacklistUserSearchSeq;
    try {
      var out = await ticketBlacklistApi(
        "/teams/members/search?q=" + encodeURIComponent(q),
        "GET",
      );
      if (seq !== state.ticketBlacklistUserSearchSeq) return;
      if (!out.res || !out.res.ok || !out.data || !out.data.ok) {
        fillTicketBlacklistUserSelect([]);
        return;
      }
      var members = out.data.members || [];
      fillTicketBlacklistUserSelect(members, members.length === 1 ? String(members[0].id) : "");
    } catch (_) {
      if (seq === state.ticketBlacklistUserSearchSeq) fillTicketBlacklistUserSelect([]);
    }
  }

  function scheduleTicketBlacklistUserSearch() {
    var input = byId("tk-bl-user-q");
    var q = String((input && input.value) || "").trim();
    if (state.ticketBlacklistUserSearchTimer) clearTimeout(state.ticketBlacklistUserSearchTimer);
    state.ticketBlacklistUserSearchTimer = setTimeout(function () {
      searchTicketBlacklistUsers(q);
    }, 320);
  }

  function renderTicketBlacklistList() {
    var list = byId("tk-bl-list");
    var empty = byId("tk-bl-empty");
    var count = byId("tk-bl-count");
    if (!list) return;
    list.innerHTML = "";
    var entries = (state.ticketBlacklist && state.ticketBlacklist.entries) || [];
    if (count) {
      count.textContent = entries.length
        ? i18n("dash.tickets.blacklistCount", "{n} in blacklist").replace("{n}", String(entries.length))
        : i18n("dash.tickets.blacklistCountEmpty", "Nessuna entry");
    }
    if (!entries.length) {
      if (empty) empty.removeAttribute("hidden");
      return;
    }
    if (empty) empty.setAttribute("hidden", "");
    entries.forEach(function (e) {
      var li = document.createElement("li");
      li.className = "vc-dash-tk-bl__row";
      var kind =
        e.type === "role"
          ? i18n("dash.tickets.blacklistTypeRole", "Ruolo")
          : i18n("dash.tickets.blacklistTypeUser", "Utente");
      var panelLabel = e.panelTitle
        ? e.panelTitle
        : i18n("dash.tickets.blacklistPanelAll", "Tutti i pannelli");
      var reason = e.reason ? " · " + e.reason : "";
      li.innerHTML =
        '<div class="vc-dash-tk-bl__main">' +
        '<span class="vc-dash-tk-bl__label">' +
        escHtml(e.label || e.targetId) +
        "</span>" +
        '<span class="vc-dash-tk-bl__meta">' +
        escHtml(kind + reason) +
        "</span></div>" +
        '<span class="vc-dash-tk-bl__panel">' +
        escHtml(panelLabel) +
        "</span>" +
        '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger" data-tk-bl-remove="' +
        escHtml(String(e.id || "")) +
        '">' +
        escHtml(i18n("dash.tickets.blacklistRemove", "Rimuovi")) +
        "</button>";
      list.appendChild(li);
    });
  }

  function renderTicketBlacklistEditor() {
    syncTicketBlacklistTypeUi();
    fillTicketBlacklistPanelSelect();
    fillTicketBlacklistRoleSelect();
    renderTicketBlacklistList();
  }

  async function refreshTicketBlacklist(options) {
    options = options || {};
    if (!state.guildId || !getToken()) return;
    if (state.ticketBlacklistLoading) return;
    state.ticketBlacklistLoading = true;
    try {
      var out = await ticketBlacklistApi("/blacklist", "GET");
      if (!out.res || !out.res.ok || !out.data || !out.data.ok) {
        if (!options.silent) {
          setError(
            (out.data && out.data.message) ||
              i18n("dash.tickets.blacklistErrLoad", "Impossibile caricare la blacklist."),
          );
        }
        return;
      }
      state.ticketBlacklist = out.data;
      renderTicketBlacklistEditor();
      setError("");
    } catch (_) {
      if (!options.silent) {
        setError(i18n("dash.tickets.blacklistErrLoad", "Impossibile caricare la blacklist."));
      }
    } finally {
      state.ticketBlacklistLoading = false;
    }
  }

  function wireTicketBlacklistUi() {
    var typeEl = byId("tk-bl-type");
    if (typeEl && !typeEl.__vcWired) {
      typeEl.__vcWired = true;
      typeEl.addEventListener("change", function () {
        syncTicketBlacklistTypeUi();
        enhanceAllDashFancySelects(byId("tk-bl-root") || document);
      });
    }

    var userQ = byId("tk-bl-user-q");
    if (userQ && !userQ.__vcWired) {
      userQ.__vcWired = true;
      userQ.addEventListener("input", scheduleTicketBlacklistUserSearch);
      userQ.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          if (state.ticketBlacklistUserSearchTimer) clearTimeout(state.ticketBlacklistUserSearchTimer);
          searchTicketBlacklistUsers(String(userQ.value || "").trim());
        }
      });
    }

    var addBtn = byId("tk-bl-add-btn");
    if (addBtn && !addBtn.__vcWired) {
      addBtn.__vcWired = true;
      addBtn.addEventListener("click", async function () {
        if (state.ticketBlacklistSaving) return;
        var type = String((byId("tk-bl-type") && byId("tk-bl-type").value) || "user");
        var targetId = "";
        if (type === "role") {
          targetId = String((byId("tk-bl-role") && byId("tk-bl-role").value) || "").trim();
        } else {
          targetId = String((byId("tk-bl-user") && byId("tk-bl-user").value) || "").trim();
        }
        if (!/^\d{16,22}$/.test(targetId)) {
          showSaveToast(
            i18n("dash.tickets.blacklistErrTarget", "Seleziona un utente o un ruolo valido."),
            true,
          );
          return;
        }
        var panelId = String((byId("tk-bl-panel") && byId("tk-bl-panel").value) || "").trim() || null;
        var reason = String((byId("tk-bl-reason") && byId("tk-bl-reason").value) || "").trim();
        state.ticketBlacklistSaving = true;
        try {
          var out = await ticketBlacklistApi("/blacklist", "POST", {
            type: type === "role" ? "role" : "user",
            targetId: targetId,
            panelId: panelId,
            reason: reason || null,
          });
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.blacklistErrAdd", "Aggiunta non riuscita."),
              true,
            );
            return;
          }
          state.ticketBlacklist = Object.assign({}, state.ticketBlacklist || {}, {
            entries: out.data.entries || [],
            panels: out.data.panels || (state.ticketBlacklist && state.ticketBlacklist.panels) || [],
          });
          if (byId("tk-bl-reason")) byId("tk-bl-reason").value = "";
          if (byId("tk-bl-user-q")) byId("tk-bl-user-q").value = "";
          fillTicketBlacklistUserSelect([]);
          renderTicketBlacklistEditor();
          showSaveToast(
            (out.data && out.data.message) || i18n("dash.tickets.blacklistAdded", "Aggiunto alla blacklist."),
          );
        } finally {
          state.ticketBlacklistSaving = false;
        }
      });
    }

    var list = byId("tk-bl-list");
    if (list && !list.__vcWired) {
      list.__vcWired = true;
      list.addEventListener("click", async function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-tk-bl-remove]") : null;
        if (!btn || state.ticketBlacklistSaving) return;
        var id = String(btn.getAttribute("data-tk-bl-remove") || "").trim();
        if (!id) return;
        var D = window.VcDialog;
        if (!D || typeof D.confirm !== "function") {
          if (typeof window.__vcEnsureDialog === "function") D = await window.__vcEnsureDialog();
        }
        if (!D || typeof D.confirm !== "function") return;
        var confirmed = await D.confirm({
          title: i18n("dash.tickets.blacklistRemoveTitle", "Rimuovere dalla blacklist?"),
          message: i18n("dash.tickets.blacklistConfirmRemove", "Rimuovere questa entry dalla blacklist?"),
          confirmLabel: i18n("dash.tickets.blacklistRemoveOk", "Rimuovi"),
          cancelLabel: i18n("dash.bl.cancel", "Annulla"),
          danger: true,
          icon: "fa-trash-o",
        });
        if (!confirmed) {
          return;
        }
        state.ticketBlacklistSaving = true;
        try {
          var out = await ticketBlacklistApi("/blacklist/" + encodeURIComponent(id), "DELETE");
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.blacklistErrRemove", "Rimozione non riuscita."),
              true,
            );
            return;
          }
          state.ticketBlacklist = Object.assign({}, state.ticketBlacklist || {}, {
            entries: out.data.entries || [],
          });
          renderTicketBlacklistList();
          showSaveToast(
            (out.data && out.data.message) || i18n("dash.tickets.blacklistRemoved", "Rimossa dalla blacklist."),
          );
        } finally {
          state.ticketBlacklistSaving = false;
        }
      });
    }
  }

  var TICKET_FORM_TYPE_LABELS = {
    text_input: "Text Input",
    string_select: "String Select",
    user_select: "User Select",
    role_select: "Role Select",
    mentionable_select: "Mentionable Select",
    channel_select: "Channel Select",
    radio_group: "Radio Group",
    checkbox_group: "Checkbox Group",
  };

  var TICKET_FORM_TYPE_CONFIG_TITLES = {
    string_select: "String Select Options",
    user_select: "User Select Configuration",
    role_select: "Role Select Configuration",
    mentionable_select: "Mentionable Select Configuration",
    channel_select: "Channel Select Configuration",
    radio_group: "Radio Group Options",
    checkbox_group: "Checkbox Group Options",
  };

  function ticketFormsApi(path, method, body) {
    return ticketPanelsApi(path, method, body);
  }

  function getSelectedTicketForm() {
    var id = String(state.ticketFormsSelectedId || "").trim();
    var forms = (state.ticketForms && state.ticketForms.forms) || [];
    if (!id) return forms[0] || null;
    return (
      forms.find(function (f) {
        return String(f.id) === id;
      }) ||
      forms[0] ||
      null
    );
  }

  function ticketFormTypeNeedsOptions(type) {
    return type === "string_select" || type === "radio_group" || type === "checkbox_group";
  }

  function ticketFormTypeSupportsMinMax(type) {
    return (
      type === "string_select" ||
      type === "user_select" ||
      type === "role_select" ||
      type === "mentionable_select" ||
      type === "channel_select" ||
      type === "checkbox_group"
    );
  }

  function ticketFormMaxOptions(type) {
    if (type === "radio_group" || type === "checkbox_group") return 10;
    if (type === "string_select") return 25;
    return 0;
  }

  function ticketFormMinOptions(type) {
    if (type === "radio_group") return 2;
    if (type === "string_select" || type === "checkbox_group") return 1;
    return 0;
  }

  function newTicketFormFieldDraft() {
    return {
      id: "f" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
      type: "text_input",
      label: "",
      description: "",
      placeholder: "",
      required: true,
      style: "short",
      minLength: 0,
      maxLength: 255,
      minValues: 0,
      maxValues: 1,
      options: [],
    };
  }

  function newTicketFormOptionDraft() {
    return {
      id: "o" + Math.random().toString(36).slice(2, 10),
      label: "",
      value: "",
    };
  }

  function fillTicketFormsSelect() {
    var sel = byId("tk-forms-select");
    if (!sel) return;
    var forms = (state.ticketForms && state.ticketForms.forms) || [];
    var selected = String(state.ticketFormsSelectedId || (forms[0] && forms[0].id) || "");
    if (selected && !forms.some(function (f) { return String(f.id) === selected; })) {
      selected = forms[0] ? String(forms[0].id) : "";
    }
    fillSelect(
      sel,
      forms.map(function (f) {
        return { id: f.id, name: String(f.title || f.id) };
      }),
      selected,
      i18n("dash.tickets.formsSelectEmpty", "Seleziona un form…"),
    );
    state.ticketFormsSelectedId = String(sel.value || "").trim() || null;
    enhanceAllDashFancySelects(byId("tk-forms-root") || document);
  }

  function fillTicketPanelFormSelects(panel) {
    var forms = (state.ticketForms && state.ticketForms.forms) || [];
    if (!forms.length && state.ticketPanels && Array.isArray(state.ticketPanels.forms)) {
      forms = state.ticketPanels.forms;
    }
    var options = forms.map(function (f) {
      return { id: f.id, name: String(f.title || f.id) };
    });
    var emptyLabel = options.length
      ? i18n("dash.none", "Nessuno")
      : i18n("dash.tickets.formsSelectEmpty", "Seleziona un form…");
    fillSelect(
      byId("tk-panel-formId"),
      options,
      (panel && panel.formId) || "",
      emptyLabel,
    );
  }

  function collectTicketFormFieldsFromDom() {
    var root = byId("tk-forms-fields");
    if (!root) return [];
    var cards = root.querySelectorAll("[data-tk-form-field]");
    var out = [];
    Array.prototype.forEach.call(cards, function (card) {
      var type = String((card.querySelector("[data-field='type']") || {}).value || "text_input");
      var options = [];
      if (ticketFormTypeNeedsOptions(type)) {
        Array.prototype.forEach.call(card.querySelectorAll("[data-tk-form-option]"), function (row) {
          var label = String((row.querySelector("[data-opt='label']") || {}).value || "").trim();
          var value = String((row.querySelector("[data-opt='value']") || {}).value || "").trim() || label;
          if (!label && !value) return;
          options.push({
            id: String(row.getAttribute("data-tk-form-option") || "") || undefined,
            label: label || value,
            value: value || label,
          });
        });
      }
      var minValues = Number((card.querySelector("[data-field='minValues']") || {}).value);
      var maxValues = Number((card.querySelector("[data-field='maxValues']") || {}).value);
      var reqEl =
        type === "text_input"
          ? card.querySelector("[data-field='required']")
          : card.querySelector("[data-field='required-select']") ||
            card.querySelector("[data-field='required']");
      out.push({
        id: String(card.getAttribute("data-tk-form-field") || "") || undefined,
        type: type,
        label: String((card.querySelector("[data-field='label']") || {}).value || "").trim(),
        description: String((card.querySelector("[data-field='description']") || {}).value || "").trim(),
        placeholder: String((card.querySelector("[data-field='placeholder']") || {}).value || "").trim(),
        required: Boolean(reqEl && reqEl.checked),
        style: String((card.querySelector("[data-field='style']") || {}).value || "short"),
        minLength: Number((card.querySelector("[data-field='minLength']") || {}).value) || 0,
        maxLength: Number((card.querySelector("[data-field='maxLength']") || {}).value) || 255,
        minValues: Number.isFinite(minValues) ? minValues : 0,
        maxValues: Number.isFinite(maxValues) ? maxValues : 1,
        options: options,
      });
    });
    return out;
  }

  function ticketFormFieldValidationMessage(field) {
    if (!field) return "";
    if (!String(field.label || "").trim()) {
      return i18n("dash.tickets.formsFieldLabelRequired", "Label is required");
    }
    var type = String(field.type || "text_input");
    if (!ticketFormTypeNeedsOptions(type)) return "";
    var count = (field.options || []).filter(function (o) {
      return String((o && o.label) || "").trim();
    }).length;
    var minOpts = ticketFormMinOptions(type);
    var maxOpts = ticketFormMaxOptions(type);
    if (count < minOpts) {
      if (type === "radio_group") {
        return i18n(
          "dash.tickets.formsOptsRadioMin",
          'At least 2 options are required. Click "Add Option" to create up to 10 options.',
        );
      }
      if (type === "checkbox_group") {
        return i18n(
          "dash.tickets.formsOptsCheckboxMin",
          'At least 1 option is required. Click "Add Option" to create up to 10 options.',
        );
      }
      return i18n(
        "dash.tickets.formsOptsSelectMin",
        'At least 1 option is required. Click "Add Option" to create up to 25 options.',
      );
    }
    if (count > maxOpts) {
      return i18n("dash.tickets.formsOptsMax", "Massimo {n} opzioni.").replace("{n}", String(maxOpts));
    }
    return "";
  }

  function ticketFormTextLengthCap(style) {
    return String(style || "short") === "paragraph" ? 1024 : 255;
  }

  function syncTicketFormLengthSlider(card) {
    if (!card) return;
    var minEl = card.querySelector("[data-field='minLength']");
    var maxEl = card.querySelector("[data-field='maxLength']");
    if (!minEl || !maxEl) return;
    var styleEl = card.querySelector("[data-field='style']");
    var cap = ticketFormTextLengthCap(styleEl && styleEl.value);
    minEl.min = "0";
    maxEl.min = "0";
    minEl.max = String(cap);
    maxEl.max = String(cap);
    var minV = Math.max(0, Math.min(cap, Number(minEl.value) || 0));
    var maxV = Math.max(0, Math.min(cap, Number(maxEl.value) || 0));
    if (maxV < minV) {
      if (document.activeElement === minEl) maxV = minV;
      else minV = maxV;
    }
    minEl.value = String(minV);
    maxEl.value = String(maxV);
    var dual = card.querySelector(".vc-dash-tk-forms__dual");
    var fill = card.querySelector("[data-len-fill]");
    var minOut = card.querySelector("[data-len-min]");
    var maxOut = card.querySelector("[data-len-max]");
    var pad = 8;
    var trackW = dual ? Math.max(0, dual.clientWidth - pad * 2) : 0;
    var minPct = cap > 0 ? minV / cap : 0;
    var maxPct = cap > 0 ? maxV / cap : 0;
    if (fill) {
      if (trackW > 0) {
        fill.style.left = pad + minPct * trackW + "px";
        fill.style.width = Math.max(0, (maxPct - minPct) * trackW) + "px";
        fill.style.right = "auto";
      } else {
        fill.style.left = minPct * 100 + "%";
        fill.style.width = Math.max(0, (maxPct - minPct) * 100) + "%";
        fill.style.right = "auto";
      }
    }
    if (minOut) {
      minOut.textContent = String(minV);
      if (trackW > 0) minOut.style.left = pad + minPct * trackW + "px";
      else minOut.style.left = minPct * 100 + "%";
    }
    if (maxOut) {
      maxOut.textContent = String(maxV);
      if (trackW > 0) maxOut.style.left = pad + maxPct * trackW + "px";
      else maxOut.style.left = maxPct * 100 + "%";
    }
        if (minEl && maxEl) {
      var minOnTop = document.activeElement === minEl;
      minEl.style.zIndex = minOnTop ? "4" : "2";
      maxEl.style.zIndex = minOnTop ? "3" : "4";
    }
  }

  function syncTicketFormTextStyleUi(card) {
    if (!card) return;
    var styleEl = card.querySelector("[data-field='style']");
    var ph = card.querySelector("[data-field='placeholder']");
    var multi = String((styleEl && styleEl.value) || "short") === "paragraph";
    if (ph) {
      ph.rows = multi ? 6 : 2;
      ph.classList.toggle("is-multiline", multi);
    }
    card.classList.toggle("is-text-multiline", multi);
        syncTicketFormLengthSlider(card);
  }

  function syncTicketFormFieldCardUi(card) {
    if (!card) return;
    var typeEl = card.querySelector("[data-field='type']");
    var type = String((typeEl && typeEl.value) || "text_input");
    Array.prototype.forEach.call(card.querySelectorAll("[data-tk-form-show]"), function (el) {
      var want = String(el.getAttribute("data-tk-form-show") || "");
      var show =
        want === "text_input"
          ? type === "text_input"
          : want === "options"
            ? ticketFormTypeNeedsOptions(type)
            : want === "minmax"
              ? ticketFormTypeSupportsMinMax(type)
              : want === "selectish"
                ? type !== "text_input"
                : false;
      el.hidden = !show;
    });
    var titleEl = card.querySelector("[data-tk-form-config-title]");
    if (titleEl) {
      titleEl.textContent =
        TICKET_FORM_TYPE_CONFIG_TITLES[type] ||
        i18n("dash.tickets.formsFieldConfig", "Configuration");
    }
    var labelEl = card.querySelector("[data-field='label']");
    var labelErr = card.querySelector("[data-tk-form-label-error]");
    if (labelErr) {
      labelErr.hidden = !!String((labelEl && labelEl.value) || "").trim();
    }
    if (type === "text_input") {
      syncTicketFormTextStyleUi(card);
      syncTicketFormLengthSlider(card);
    }
    var optErr = card.querySelector("[data-tk-form-options-error]");
    if (optErr) {
      var draft = {
        type: type,
        label: String((labelEl && labelEl.value) || "").trim() || "_",
        options: [],
      };
      Array.prototype.forEach.call(card.querySelectorAll("[data-tk-form-option]"), function (row) {
        var label = String((row.querySelector("[data-opt='label']") || {}).value || "").trim();
        if (label) draft.options.push({ label: label, value: label });
      });
      var msg = "";
      if (ticketFormTypeNeedsOptions(type)) {
        var count = draft.options.length;
        var minOpts = ticketFormMinOptions(type);
        if (count < minOpts) {
          msg =
            type === "radio_group"
              ? i18n(
                  "dash.tickets.formsOptsRadioMin",
                  'At least 2 options are required. Click "Add Option" to create up to 10 options.',
                )
              : type === "checkbox_group"
                ? i18n(
                    "dash.tickets.formsOptsCheckboxMin",
                    'At least 1 option is required. Click "Add Option" to create up to 10 options.',
                  )
                : i18n(
                    "dash.tickets.formsOptsSelectMin",
                    'At least 1 option is required. Click "Add Option" to create up to 25 options.',
                  );
        }
      }
      optErr.textContent = msg;
      optErr.hidden = !msg;
    }
  }

  function renderTicketFormOptionsHtml(field) {
    var options = Array.isArray(field.options) ? field.options : [];
    if (!options.length) return "";
    return options
      .map(function (o, i) {
        var oid = String(o.id || "opt" + i);
        return (
          '<div class="vc-dash-tk-forms__option" data-tk-form-option="' +
          escHtml(oid) +
          '">' +
          '<input type="text" data-opt="label" maxlength="100" placeholder="' +
          escHtml(i18n("dash.tickets.formsOptionPh", "Option label")) +
          '" value="' +
          escHtml(String(o.label || "")) +
          '" />' +
          '<input type="text" data-opt="value" maxlength="100" placeholder="' +
          escHtml(i18n("dash.tickets.formsOptionValuePh", "Value (optional)")) +
          '" value="' +
          escHtml(String(o.value && o.value !== o.label ? o.value : "")) +
          '" />' +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger" data-tk-form-option-remove="1" title="Elimina">' +
          '<i class="fa fa-trash" aria-hidden="true"></i></button>' +
          "</div>"
        );
      })
      .join("");
  }

  function renderTicketFormsFields() {
    closeAllDashFancySelects();
    var root = byId("tk-forms-fields");
    var card = byId("tk-forms-editor-card");
    var empty = byId("tk-forms-empty");
    var renameBtn = byId("tk-forms-rename-btn");
    var deleteBtn = byId("tk-forms-delete-btn");
    var form = getSelectedTicketForm();
    if (!root) return;
    if (!form) {
      root.innerHTML = "";
      if (card) card.setAttribute("hidden", "");
      if (empty) empty.removeAttribute("hidden");
      if (renameBtn) {
        renameBtn.removeAttribute("hidden");
        renameBtn.disabled = true;
      }
      if (deleteBtn) {
        deleteBtn.removeAttribute("hidden");
        deleteBtn.disabled = true;
        var delLabelEmpty = deleteBtn.querySelector("span");
        if (delLabelEmpty) {
          delLabelEmpty.textContent = i18n("dash.tickets.formsDelete", "Elimina form");
        }
      }
      return;
    }
    if (empty) empty.setAttribute("hidden", "");
    if (card) card.removeAttribute("hidden");
    if (renameBtn) {
      renameBtn.removeAttribute("hidden");
      renameBtn.disabled = false;
    }
    if (deleteBtn) {
      deleteBtn.removeAttribute("hidden");
      deleteBtn.disabled = false;
      var delLabel = deleteBtn.querySelector("span");
      if (delLabel) {
        delLabel.textContent = i18n("dash.tickets.formsDeleteNamed", "Elimina {name}").replace(
          "{name}",
          String(form.title || ""),
        );
      }
    }
    var fields = Array.isArray(state.ticketFormsDraftFields)
      ? state.ticketFormsDraftFields
      : Array.isArray(form.fields)
        ? form.fields
        : [];
    state.ticketFormsDraftFields = fields.map(function (f) {
      return Object.assign({}, f, {
        options: Array.isArray(f.options)
          ? f.options.map(function (o, i) {
              return Object.assign({}, o, {
                id: o.id || "o" + i + String(f.id || "").slice(0, 6),
              });
            })
          : [],
      });
    });
    root.innerHTML = state.ticketFormsDraftFields
      .map(function (f, idx) {
        var type = String(f.type || "text_input");
        var fieldCount = state.ticketFormsDraftFields.length;
        var textStyle = f.style === "paragraph" ? "paragraph" : "short";
        var lenCap = ticketFormTextLengthCap(textStyle);
        var lenMin = Math.max(0, Math.min(lenCap, Number(f.minLength) || 0));
        var lenMaxRaw = f.maxLength != null ? Number(f.maxLength) : textStyle === "paragraph" ? 1024 : 255;
        var lenMax = Math.max(0, Math.min(lenCap, Number.isFinite(lenMaxRaw) ? lenMaxRaw : lenCap));
        if (lenMax < lenMin) lenMax = lenMin;
        var typeOptionsSelected = Object.keys(TICKET_FORM_TYPE_LABELS)
          .map(function (k) {
            return (
              '<option value="' +
              escHtml(k) +
              '"' +
              (k === type ? " selected" : "") +
              ">" +
              escHtml(TICKET_FORM_TYPE_LABELS[k]) +
              "</option>"
            );
          })
          .join("");
        var minValuesDefault =
          type === "string_select" ? 1 : type === "checkbox_group" ? 0 : 0;
        var maxValuesDefault =
          type === "string_select" ? 1 : 25;
        return (
          '<div class="vc-dash-tk-forms__field" data-tk-form-field="' +
          escHtml(String(f.id || idx)) +
          '">' +
          '<div class="vc-dash-tk-forms__field-top">' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldLabel", "Label")) +
          '</span><input type="text" data-field="label" maxlength="45" placeholder="' +
          escHtml(i18n("dash.tickets.formsFieldLabelPh", "Name of the field")) +
          '" value="' +
          escHtml(String(f.label || "")) +
          '" /></label>' +
          '<div class="vc-dash-tk-forms__reorder" role="group" aria-label="' +
          escHtml(i18n("dash.tickets.formsReorder", "Ordine campo")) +
          '">' +
          '<button type="button" class="vc-dash-tk-forms__reorder-btn" data-tk-form-move="up"' +
          (idx === 0 ? " disabled" : "") +
          ' title="' +
          escHtml(i18n("dash.tickets.formsMoveUp", "Sposta su")) +
          '" aria-label="' +
          escHtml(i18n("dash.tickets.formsMoveUp", "Sposta su")) +
          '"><i class="fa fa-chevron-up" aria-hidden="true"></i></button>' +
          '<button type="button" class="vc-dash-tk-forms__reorder-btn" data-tk-form-move="down"' +
          (idx >= fieldCount - 1 ? " disabled" : "") +
          ' title="' +
          escHtml(i18n("dash.tickets.formsMoveDown", "Sposta giù")) +
          '" aria-label="' +
          escHtml(i18n("dash.tickets.formsMoveDown", "Sposta giù")) +
          '"><i class="fa fa-chevron-down" aria-hidden="true"></i></button>' +
          "</div>" +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldType", "Type")) +
          '</span><select data-field="type">' +
          typeOptionsSelected +
          "</select></label>" +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger" data-tk-form-field-remove="1"><i class="fa fa-trash"></i> ' +
          escHtml(i18n("dash.tickets.formsFieldDelete", "Delete")) +
          "</button>" +
          "</div>" +
          '<p class="vc-dash-tk-forms__field-error" data-tk-form-label-error hidden>' +
          escHtml(i18n("dash.tickets.formsFieldLabelRequired", "Label is required")) +
          "</p>" +
          '<div class="vc-dash-tk-forms__field-mid">' +
          '<label class="vc-dash-picker vc-dash-picker--full"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldDesc", "Description (optional)")) +
          '</span><input type="text" data-field="description" maxlength="100" placeholder="' +
          escHtml(i18n("dash.tickets.formsFieldDescPh", "Description for the field")) +
          '" value="' +
          escHtml(String(f.description || "")) +
          '" /></label>' +
          "</div>" +
          '<div class="vc-dash-tk-forms__type-body" data-tk-form-show="text_input">' +
          '<div class="vc-dash-tk-forms__field-bottom">' +
          '<label class="vc-dash-picker vc-dash-tk-forms__placeholder"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldPlaceholder", "Placeholder (optional)")) +
          '</span><textarea data-field="placeholder" rows="2" maxlength="100" placeholder="' +
          escHtml(
            i18n(
              "dash.tickets.formsFieldPlaceholderPh",
              "Placeholder text for the field, just like this text",
            ),
          ) +
          '">' +
          escHtml(String(f.placeholder || "")) +
          "</textarea></label>" +
          '<div class="vc-dash-tk-forms__side">' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldStyle", "Style")) +
          '</span><select data-field="style">' +
          '<option value="short"' +
          (textStyle === "short" ? " selected" : "") +
          ">" +
          escHtml(i18n("dash.tickets.formsStyleShort", "Short")) +
          '</option><option value="paragraph"' +
          (textStyle === "paragraph" ? " selected" : "") +
          ">" +
          escHtml(i18n("dash.tickets.formsStyleMulti", "Multi-line")) +
          "</option></select></label>" +
          '<div class="vc-dash-tk-forms__side-meta">' +
          '<span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldRequired", "Required")) +
          "</span>" +
          '<span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldLength", "Answer length range")) +
          "</span>" +
          '<label class="vc-dash-switch vc-dash-switch--solo" aria-label="' +
          escHtml(i18n("dash.tickets.formsFieldRequired", "Required")) +
          '"><input type="checkbox" data-field="required"' +
          (f.required !== false ? " checked" : "") +
          ' /><span class="vc-dash-switch__track" aria-hidden="true"><span class="vc-dash-switch__thumb"></span></span></label>' +
          '<div class="vc-dash-tk-forms__dual-wrap">' +
          '<span class="vc-dash-tk-forms__len-bubble" data-len-min>' +
          escHtml(String(lenMin)) +
          "</span>" +
          '<span class="vc-dash-tk-forms__len-bubble" data-len-max>' +
          escHtml(String(lenMax)) +
          "</span>" +
          '<div class="vc-dash-tk-forms__dual">' +
          '<div class="vc-dash-tk-forms__dual-rail" aria-hidden="true"></div>' +
          '<div class="vc-dash-tk-forms__dual-fill" data-len-fill aria-hidden="true"></div>' +
          '<input type="range" data-field="minLength" min="0" max="' +
          escHtml(String(lenCap)) +
          '" step="1" value="' +
          escHtml(String(lenMin)) +
          '" aria-label="Min length" />' +
          '<input type="range" data-field="maxLength" min="0" max="' +
          escHtml(String(lenCap)) +
          '" step="1" value="' +
          escHtml(String(lenMax)) +
          '" aria-label="Max length" />' +
          "</div></div>" +
          "</div></div></div></div>" +
          '<div class="vc-dash-tk-forms__type-body" data-tk-form-show="selectish" hidden>' +
          '<div class="vc-dash-tk-forms__config">' +
          '<div class="vc-dash-tk-forms__config-head">' +
          '<h4 class="vc-dash-tk-forms__config-title" data-tk-form-config-title>' +
          escHtml(TICKET_FORM_TYPE_CONFIG_TITLES[type] || "Configuration") +
          "</h4>" +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--primary" data-tk-form-add-option="1" data-tk-form-show="options" hidden>' +
          '<i class="fa fa-plus" aria-hidden="true"></i> ' +
          escHtml(i18n("dash.tickets.formsAddOption", "Add Option")) +
          "</button>" +
          "</div>" +
          '<div class="vc-dash-tk-forms__options-list" data-tk-form-show="options" hidden>' +
          renderTicketFormOptionsHtml(f) +
          "</div>" +
          '<p class="vc-dash-tk-forms__field-error" data-tk-form-options-error data-tk-form-show="options" hidden></p>' +
          '<div class="vc-dash-tk-forms__minmax" data-tk-form-show="minmax" hidden>' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsMinSelections", "Minimum selections")) +
          '</span><input type="number" data-field="minValues" min="0" max="25" value="' +
          escHtml(String(f.minValues != null ? f.minValues : minValuesDefault)) +
          '" /></label>' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsMaxSelections", "Maximum selections")) +
          '</span><input type="number" data-field="maxValues" min="1" max="25" value="' +
          escHtml(String(f.maxValues != null ? f.maxValues : maxValuesDefault)) +
          '" /></label>' +
          "</div>" +
          '<div class="vc-dash-tk-forms__req">' +
          '<span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldRequired", "Required")) +
          "</span>" +
          '<label class="vc-dash-switch vc-dash-switch--solo" aria-label="' +
          escHtml(i18n("dash.tickets.formsFieldRequired", "Required")) +
          '"><input type="checkbox" data-field="required-select"' +
          (f.required !== false ? " checked" : "") +
          ' /><span class="vc-dash-switch__track" aria-hidden="true"><span class="vc-dash-switch__thumb"></span></span></label>' +
          "</div>" +
          "</div></div></div>"
        );
      })
      .join("");
    Array.prototype.forEach.call(root.querySelectorAll("[data-tk-form-field]"), function (el) {
      var typeEl = el.querySelector("[data-field='type']");
      var styleEl = el.querySelector("[data-field='style']");
      var reqText = el.querySelector('[data-field="required"]');
      var reqSelect = el.querySelector('[data-field="required-select"]');
      var fieldId = el.getAttribute("data-tk-form-field");
      var src = state.ticketFormsDraftFields.find(function (x) {
        return String(x.id) === String(fieldId);
      });
      if (typeEl && src) typeEl.value = src.type || "text_input";
      if (styleEl && src) styleEl.value = src.style === "paragraph" ? "paragraph" : "short";
      if (reqText && src) reqText.checked = src.required !== false;
      if (reqSelect && src) reqSelect.checked = src.required !== false;
      syncTicketFormFieldCardUi(el);
    });
    enhanceAllDashFancySelects(byId("tk-forms-root") || document);
    requestAnimationFrame(function () {
      Array.prototype.forEach.call(root.querySelectorAll("[data-tk-form-field]"), function (el) {
        syncTicketFormLengthSlider(el);
      });
    });
  }

  function renderTicketFormsEditor() {
    fillTicketFormsSelect();
    var form = getSelectedTicketForm();
    if (!form) {
      state.ticketFormsDraftFields = null;
      state.ticketFormsDraftFormId = null;
      state.ticketFormsDraftDirty = false;
    } else if (
      state.ticketFormsDraftDirty &&
      Array.isArray(state.ticketFormsDraftFields) &&
      String(state.ticketFormsDraftFormId || "") === String(form.id)
    ) {
          } else {
      state.ticketFormsDraftFields = (form.fields || []).map(function (f) {
        return Object.assign({}, f, { options: Array.isArray(f.options) ? f.options.slice() : [] });
      });
            if (!state.ticketFormsDraftFields.length) {
        state.ticketFormsDraftFields = [newTicketFormFieldDraft()];
        state.ticketFormsDraftDirty = true;
      } else {
        state.ticketFormsDraftDirty = false;
      }
      state.ticketFormsDraftFormId = form.id;
    }
    renderTicketFormsFields();
    updateTicketFormsDiscordHint(form);
  }

  function updateTicketFormsDiscordHint(form) {
    var hint = byId("tk-forms-discord-hint");
    if (!hint) return;
    var fields = Array.isArray(form && form.fields)
      ? form.fields
      : Array.isArray(state.ticketFormsDraftFields)
        ? state.ticketFormsDraftFields
        : [];
    var textCount = fields.filter(function (f) {
      return f && (f.type === "text_input" || !f.type);
    }).length;
    var otherCount = fields.length - textCount;
    if (!fields.length) {
      hint.hidden = true;
      return;
    }
    hint.hidden = false;
    if (textCount === 0) {
      hint.textContent = i18n(
        "dash.tickets.formsDiscordHintNone",
        "Attenzione: in Discord all'apertura ticket compaiono solo i campi Text Input. Questo form non ne ha — il modal non si aprirà.",
      );
      hint.classList.add("is-warn");
    } else if (otherCount > 0) {
      hint.textContent = i18n(
        "dash.tickets.formsDiscordHintPartial",
        "In Discord all'apertura ticket compaiono solo i campi Text Input ({n} di {total}). Gli altri tipi restano salvati ma non nel modal.",
      )
        .replace("{n}", String(textCount))
        .replace("{total}", String(fields.length));
      hint.classList.add("is-warn");
    } else {
      hint.textContent = i18n(
        "dash.tickets.formsDiscordHintOk",
        "All'apertura ticket in Discord verrà mostrato questo form (modal, max 5 Text Input).",
      );
      hint.classList.remove("is-warn");
    }
  }

  async function refreshTicketForms(options) {
    options = options || {};
    if (!state.guildId || !getToken()) return;
    if (state.ticketFormsLoading) return;
    state.ticketFormsLoading = true;
    try {
      var out = await ticketFormsApi("/forms", "GET");
      if (!out.res || !out.res.ok || !out.data || !out.data.ok) {
        if (!options.silent) {
          setError(
            (out.data && out.data.message) ||
              i18n("dash.tickets.formsErrLoad", "Impossibile caricare i form."),
          );
        }
        return;
      }
      state.ticketForms = out.data;
      if (!state.ticketFormsSelectedId && out.data.forms && out.data.forms[0]) {
        state.ticketFormsSelectedId = String(out.data.forms[0].id);
      } else if (
        state.ticketFormsSelectedId &&
        !(out.data.forms || []).some(function (f) {
          return String(f.id) === String(state.ticketFormsSelectedId);
        })
      ) {
        state.ticketFormsSelectedId =
          out.data.forms && out.data.forms[0] ? String(out.data.forms[0].id) : null;
        state.ticketFormsDraftFields = null;
        state.ticketFormsDraftFormId = null;
        state.ticketFormsDraftDirty = false;
      }
      renderTicketFormsEditor();
      fillTicketPanelFormSelects(
        (state.ticketPanelsEditor && state.ticketPanelsEditor.panel) || null,
      );
    } catch (_) {
      if (!options.silent) {
        setError(i18n("dash.tickets.formsErrLoad", "Impossibile caricare i form."));
      }
    } finally {
      state.ticketFormsLoading = false;
    }
  }

  function wireTicketFormsUi() {
    var createForm = byId("tk-forms-create-form");
    if (createForm && !createForm.__vcWired) {
      createForm.__vcWired = true;
      createForm.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        if (state.ticketFormsSaving) return;
        var titleEl = byId("tk-forms-create-title");
        var title = String((titleEl && titleEl.value) || "").trim();
        if (!title) return;
        state.ticketFormsSaving = true;
        try {
          var out = await ticketFormsApi("/forms", "POST", { title: title });
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.formsErrCreate", "Creazione form non riuscita."),
              true,
            );
            return;
          }
          if (titleEl) titleEl.value = "";
          state.ticketForms = Object.assign({}, state.ticketForms || {}, {
            forms: out.data.forms || [],
          });
          if (out.data.form) {
            state.ticketFormsSelectedId = String(out.data.form.id);
                        state.ticketFormsDraftFields = [newTicketFormFieldDraft()];
            state.ticketFormsDraftFormId = out.data.form.id;
            state.ticketFormsDraftDirty = true;
          }
          renderTicketFormsEditor();
          fillTicketPanelFormSelects(
            (state.ticketPanelsEditor && state.ticketPanelsEditor.panel) || null,
          );
          showSaveToast(i18n("dash.tickets.formsCreated", "Form creato."));
        } finally {
          state.ticketFormsSaving = false;
        }
      });
    }

    var select = byId("tk-forms-select");
    if (select && !select.__vcWired) {
      select.__vcWired = true;
      select.addEventListener("change", function () {
        state.ticketFormsSelectedId = String(select.value || "").trim() || null;
        state.ticketFormsDraftFields = null;
        state.ticketFormsDraftFormId = null;
        state.ticketFormsDraftDirty = false;
        renderTicketFormsEditor();
      });
    }

    var renameBtn = byId("tk-forms-rename-btn");
    if (renameBtn && !renameBtn.__vcWired) {
      renameBtn.__vcWired = true;
      renameBtn.addEventListener("click", async function () {
        var form = getSelectedTicketForm();
        if (!form || state.ticketFormsSaving) return;
        var D = window.VcDialog;
        if (!D || typeof D.prompt !== "function") {
          if (typeof window.__vcEnsureDialog === "function") D = await window.__vcEnsureDialog();
        }
        if (!D || typeof D.prompt !== "function") return;
        var next = await D.prompt({
          title: i18n("dash.tickets.formsRenameTitle", "Rinomina form"),
          message: i18n("dash.tickets.formsRenamePrompt", "Nuovo titolo del form:"),
          label: i18n("dash.tickets.formsTitle", "Titolo"),
          defaultValue: String(form.title || ""),
          confirmLabel: i18n("dash.tickets.formsRenameOk", "Rinomina"),
          cancelLabel: i18n("dash.bl.cancel", "Annulla"),
          icon: "fa-pencil",
        });
        if (next == null) return;
        next = String(next).trim();
        if (!next || next === form.title) return;
        state.ticketFormsSaving = true;
        try {
          var out = await ticketFormsApi("/forms/" + encodeURIComponent(form.id), "PATCH", {
            title: next,
            fields: collectTicketFormFieldsFromDom(),
          });
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.formsErrSave", "Salvataggio non riuscito."),
              true,
            );
            return;
          }
          state.ticketForms = Object.assign({}, state.ticketForms || {}, {
            forms: out.data.forms || [],
          });
          state.ticketFormsDraftFields = null;
          state.ticketFormsDraftFormId = null;
          state.ticketFormsDraftDirty = false;
          renderTicketFormsEditor();
          fillTicketPanelFormSelects(
            (state.ticketPanelsEditor && state.ticketPanelsEditor.panel) || null,
          );
          showSaveToast(i18n("dash.tickets.formsSaved", "Form aggiornato."));
        } finally {
          state.ticketFormsSaving = false;
        }
      });
    }

    var deleteBtn = byId("tk-forms-delete-btn");
    if (deleteBtn && !deleteBtn.__vcWired) {
      deleteBtn.__vcWired = true;
      deleteBtn.addEventListener("click", async function () {
        var form = getSelectedTicketForm();
        if (!form || state.ticketFormsSaving) return;
        var formName = String(form.title || "").trim() || form.id;
        var ok = await (typeof window.__vcEnsureDialog === "function"
          ? window.__vcEnsureDialog()
          : Promise.resolve(window.VcDialog)
        ).then(function (D) {
          if (!D || typeof D.confirm !== "function") return false;
          return D.confirm({
              title: i18n("dash.tickets.formsDeleteTitle", "Eliminare il form?"),
              message: i18n(
                "dash.tickets.formsConfirmDelete",
                "Eliminare il form «{name}»? L'operazione non si può annullare.",
              ).replace("{name}", formName),
              confirmLabel: i18n("dash.tickets.formsDeleteNamed", "Elimina {name}").replace(
                "{name}",
                formName,
              ),
              cancelLabel: i18n("dash.bl.cancel", "Annulla"),
              danger: true,
              icon: "fa-trash-o",
            });
        });
        if (!ok) return;
        state.ticketFormsSaving = true;
        try {
          var out = await ticketFormsApi("/forms/" + encodeURIComponent(form.id), "DELETE");
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.formsErrDelete", "Eliminazione non riuscita."),
              true,
            );
            return;
          }
          state.ticketForms = Object.assign({}, state.ticketForms || {}, {
            forms: out.data.forms || [],
          });
          state.ticketFormsSelectedId =
            out.data.forms && out.data.forms[0] ? String(out.data.forms[0].id) : null;
          state.ticketFormsDraftFields = null;
          state.ticketFormsDraftFormId = null;
          state.ticketFormsDraftDirty = false;
          renderTicketFormsEditor();
          fillTicketPanelFormSelects(
            (state.ticketPanelsEditor && state.ticketPanelsEditor.panel) || null,
          );
          showSaveToast(i18n("dash.tickets.formsDeleted", "Form eliminato."));
        } finally {
          state.ticketFormsSaving = false;
        }
      });
    }

    var addBtn = byId("tk-forms-add-field-btn");
    if (addBtn && !addBtn.__vcWired) {
      addBtn.__vcWired = true;
      addBtn.addEventListener("click", function () {
        var max = (state.ticketForms && state.ticketForms.quotas && state.ticketForms.quotas.maxFields) || 5;
        state.ticketFormsDraftFields = collectTicketFormFieldsFromDom();
        if (state.ticketFormsDraftFields.length >= max) {
          showSaveToast(
            i18n("dash.tickets.formsMaxFields", "Massimo {n} campi per form.").replace("{n}", String(max)),
            true,
          );
          return;
        }
        state.ticketFormsDraftFields.push(newTicketFormFieldDraft());
        var form = getSelectedTicketForm();
        if (form) state.ticketFormsDraftFormId = form.id;
        state.ticketFormsDraftDirty = true;
        renderTicketFormsFields();
        updateTicketFormsDiscordHint(form);
      });
    }

    var saveBtn = byId("tk-forms-save-btn");
    if (saveBtn && !saveBtn.__vcWired) {
      saveBtn.__vcWired = true;
      saveBtn.addEventListener("click", async function () {
        var form = getSelectedTicketForm();
        if (!form || state.ticketFormsSaving) return;
        var fields = collectTicketFormFieldsFromDom();
        var invalidMsg = "";
        fields.some(function (f) {
          var msg = ticketFormFieldValidationMessage(f);
          if (msg) {
            invalidMsg = msg;
            return true;
          }
          return false;
        });
        if (invalidMsg) {
          state.ticketFormsDraftFields = fields;
          state.ticketFormsDraftFormId = form.id;
          state.ticketFormsDraftDirty = true;
          renderTicketFormsFields();
          updateTicketFormsDiscordHint(form);
          showSaveToast(invalidMsg, true);
          return;
        }
        state.ticketFormsSaving = true;
        try {
          var out = await ticketFormsApi("/forms/" + encodeURIComponent(form.id), "PATCH", {
            fields: fields,
          });
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.formsErrSave", "Salvataggio non riuscito."),
              true,
            );
            return;
          }
          state.ticketForms = Object.assign({}, state.ticketForms || {}, {
            forms: out.data.forms || [],
          });
          state.ticketFormsDraftFields = null;
          state.ticketFormsDraftFormId = null;
          state.ticketFormsDraftDirty = false;
          renderTicketFormsEditor();
          fillTicketPanelFormSelects(
            (state.ticketPanelsEditor && state.ticketPanelsEditor.panel) || null,
          );
          showSaveToast(i18n("dash.tickets.formsSaved", "Form salvato."));
        } finally {
          state.ticketFormsSaving = false;
        }
      });
    }

    var fieldsRoot = byId("tk-forms-fields");
    if (fieldsRoot && !fieldsRoot.__vcWired) {
      fieldsRoot.__vcWired = true;
      fieldsRoot.addEventListener("input", function (ev) {
        var t = ev.target;
        if (!t) return;
        state.ticketFormsDraftDirty = true;
        var card = t.closest ? t.closest("[data-tk-form-field]") : null;
        if (!card) return;
        var field = t.getAttribute && t.getAttribute("data-field");
        if (field === "minLength" || field === "maxLength") {
          syncTicketFormLengthSlider(card);
          return;
        }
        syncTicketFormFieldCardUi(card);
        updateTicketFormsDiscordHint(getSelectedTicketForm());
      });
      fieldsRoot.addEventListener("change", function (ev) {
        var t = ev.target;
        if (!t || !t.getAttribute) return;
        state.ticketFormsDraftDirty = true;
        var field = t.getAttribute("data-field");
        var card = t.closest ? t.closest("[data-tk-form-field]") : null;
        if (!card) return;
        if (field === "style") {
          syncTicketFormTextStyleUi(card);
          return;
        }
        if (field !== "type") return;
        var nextType = String(t.value || "text_input");
        if (!ticketFormTypeNeedsOptions(nextType)) {
          var optsList = card.querySelector(".vc-dash-tk-forms__options-list");
          if (optsList) optsList.innerHTML = "";
        }
        var minEl = card.querySelector("[data-field='minValues']");
        var maxEl = card.querySelector("[data-field='maxValues']");
        if (!ticketFormTypeSupportsMinMax(nextType)) {
          if (minEl) minEl.value = nextType === "radio_group" ? "1" : "0";
          if (maxEl) maxEl.value = "1";
        } else {
          if (minEl && !String(minEl.value || "").trim()) {
            minEl.value = nextType === "string_select" ? "1" : "0";
          }
          if (maxEl && !String(maxEl.value || "").trim()) {
            maxEl.value = nextType === "string_select" ? "1" : "25";
          }
        }
        syncTicketFormFieldCardUi(card);
        updateTicketFormsDiscordHint(getSelectedTicketForm());
      });
      fieldsRoot.addEventListener("click", function (ev) {
        var addOpt = ev.target && ev.target.closest ? ev.target.closest("[data-tk-form-add-option]") : null;
        if (addOpt) {
          var addCard = addOpt.closest("[data-tk-form-field]");
          if (!addCard) return;
          var fieldsAdd = collectTicketFormFieldsFromDom();
          var addId = String(addCard.getAttribute("data-tk-form-field") || "");
          var addIdx = fieldsAdd.findIndex(function (f) {
            return String(f.id) === addId;
          });
          if (addIdx < 0) return;
          var maxOpts = ticketFormMaxOptions(fieldsAdd[addIdx].type);
          fieldsAdd[addIdx].options = fieldsAdd[addIdx].options || [];
          if (fieldsAdd[addIdx].options.length >= maxOpts) {
            showSaveToast(
              i18n("dash.tickets.formsOptsMax", "Massimo {n} opzioni.").replace("{n}", String(maxOpts)),
              true,
            );
            return;
          }
          fieldsAdd[addIdx].options.push(newTicketFormOptionDraft());
          state.ticketFormsDraftFields = fieldsAdd;
          var formAdd = getSelectedTicketForm();
          if (formAdd) state.ticketFormsDraftFormId = formAdd.id;
          state.ticketFormsDraftDirty = true;
          renderTicketFormsFields();
          updateTicketFormsDiscordHint(formAdd);
          return;
        }
        var remOpt =
          ev.target && ev.target.closest ? ev.target.closest("[data-tk-form-option-remove]") : null;
        if (remOpt) {
          var optRow = remOpt.closest("[data-tk-form-option]");
          var remCard = remOpt.closest("[data-tk-form-field]");
          if (!optRow || !remCard) return;
          var fieldsRem = collectTicketFormFieldsFromDom();
          var remId = String(remCard.getAttribute("data-tk-form-field") || "");
          var remIdx = fieldsRem.findIndex(function (f) {
            return String(f.id) === remId;
          });
          var optId = String(optRow.getAttribute("data-tk-form-option") || "");
          if (remIdx < 0) return;
          fieldsRem[remIdx].options = (fieldsRem[remIdx].options || []).filter(function (o) {
            return String(o.id) !== optId;
          });
          state.ticketFormsDraftFields = fieldsRem;
          var formRem = getSelectedTicketForm();
          if (formRem) state.ticketFormsDraftFormId = formRem.id;
          state.ticketFormsDraftDirty = true;
          renderTicketFormsFields();
          updateTicketFormsDiscordHint(formRem);
          return;
        }
        var btn =
          ev.target && ev.target.closest
            ? ev.target.closest("[data-tk-form-field-remove],[data-tk-form-move]")
            : null;
        if (!btn || btn.disabled) return;
        var card = btn.closest("[data-tk-form-field]");
        if (!card) return;
        var fields = collectTicketFormFieldsFromDom();
        var id = String(card.getAttribute("data-tk-form-field") || "");
        var idx = fields.findIndex(function (f) {
          return String(f.id) === id;
        });
        if (idx < 0) return;
        if (btn.hasAttribute("data-tk-form-field-remove")) {
          fields.splice(idx, 1);
        } else {
          var dir = btn.getAttribute("data-tk-form-move");
          var swap = dir === "up" ? idx - 1 : idx + 1;
          if (swap < 0 || swap >= fields.length) return;
          var tmp = fields[idx];
          fields[idx] = fields[swap];
          fields[swap] = tmp;
        }
        state.ticketFormsDraftFields = fields;
        var form = getSelectedTicketForm();
        if (form) state.ticketFormsDraftFormId = form.id;
        state.ticketFormsDraftDirty = true;
        renderTicketFormsFields();
        updateTicketFormsDiscordHint(form);
      });
    }
  }

  function scrollTicketPanelsViewTop() {
    try {
      var view = byId("vc-dashboard-view-tickets-pannelli");
      if (view && view.scrollIntoView) view.scrollIntoView({ block: "start" });
      window.scrollTo(0, 0);
    } catch (_) {}
  }

  function setTicketPanelsMode(mode) {
    var intro = byId("tk-panels-intro");
    var list = byId("tk-panels-root");
    var editor = byId("tk-panel-editor");
    var multiEditor = byId("tk-multipanel-editor");
    var grid = list ? list.querySelector(".vc-dash-tk-panels__grid") : null;
    var isList = mode === "list";
    if (intro) {
      if (isList) intro.removeAttribute("hidden");
      else intro.setAttribute("hidden", "");
    }
    if (grid) {
      if (isList) grid.removeAttribute("hidden");
      else grid.setAttribute("hidden", "");
    }
    if (editor) {
      if (mode === "single") editor.removeAttribute("hidden");
      else editor.setAttribute("hidden", "");
    }
    if (multiEditor) {
      if (mode === "multi") multiEditor.removeAttribute("hidden");
      else multiEditor.setAttribute("hidden", "");
    }
    if (!isList) scrollTicketPanelsViewTop();
  }

  function parseTicketPanelsRoute() {
    var v = String(window.location.hash || "")
      .replace(/^#/, "")
      .trim();
    if (!v || v === "tickets/pannelli") return { mode: "list", id: null };
    if (v === "tickets/pannelli/new") return { mode: "single", id: null };
    if (v === "tickets/pannelli/m/new") return { mode: "multi", id: null };
    var single = v.match(/^tickets\/pannelli\/p\/([^/?#]+)$/);
    if (single) return { mode: "single", id: decodeURIComponent(single[1]) };
    var multi = v.match(/^tickets\/pannelli\/m\/([^/?#]+)$/);
    if (multi) return { mode: "multi", id: decodeURIComponent(multi[1]) };
    if (v.indexOf("tickets/pannelli/") === 0) return { mode: "list", id: null };
    return null;
  }

  function ticketPanelsRouteHash(mode, id) {
    if (mode === "single") {
      return id ? "tickets/pannelli/p/" + encodeURIComponent(id) : "tickets/pannelli/new";
    }
    if (mode === "multi") {
      return id ? "tickets/pannelli/m/" + encodeURIComponent(id) : "tickets/pannelli/m/new";
    }
    return "tickets/pannelli";
  }

  function setTicketPanelsRoute(mode, id, options) {
    var opts = options || {};
    var next = ticketPanelsRouteHash(mode, id);
    var want = "#" + next;
    if ((window.location.hash || "") === want) return;
    var url = window.location.pathname + window.location.search + want;
    try {
      if (opts.replace === true) history.replaceState(null, "", url);
      else history.pushState(null, "", url);
    } catch (_) {
      window.location.hash = next;
    }
  }

  function ticketPanelsDraftKey() {
    return "vcDashTkPanelDraft:v1:" + String(state.guildId || "");
  }

  function readTicketPanelsDraft() {
    try {
      var raw = sessionStorage.getItem(ticketPanelsDraftKey());
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeTicketPanelsDraft(payload) {
    try {
      sessionStorage.setItem(ticketPanelsDraftKey(), JSON.stringify(payload));
    } catch (_) {}
  }

  function clearTicketPanelsDraft() {
    try {
      sessionStorage.removeItem(ticketPanelsDraftKey());
    } catch (_) {}
  }

  function scheduleTicketPanelsDraftSave() {
    if (state.ticketPanelsDraftTimer) clearTimeout(state.ticketPanelsDraftTimer);
    state.ticketPanelsDraftTimer = setTimeout(function () {
      state.ticketPanelsDraftTimer = null;
      persistTicketPanelsDraftNow();
    }, 250);
  }

  function persistTicketPanelsDraftNow() {
    var editor = byId("tk-panel-editor");
    var multiEditor = byId("tk-multipanel-editor");
    var singleOpen = editor && !editor.hasAttribute("hidden");
    var multiOpen = multiEditor && !multiEditor.hasAttribute("hidden");
    if (!singleOpen && !multiOpen) return;
    if (singleOpen) {
      var sid = String((byId("tk-panel-id") && byId("tk-panel-id").value) || "").trim() || null;
      var form = readSinglePanelForm();
      delete form.publish;
      writeTicketPanelsDraft({
        mode: "single",
        id: sid,
        form: form,
        updatedAt: Date.now(),
      });
      return;
    }
    var mid = String((byId("tk-multipanel-id") && byId("tk-multipanel-id").value) || "").trim() || null;
    var multiForm = readMultiPanelForm();
    delete multiForm.publish;
    writeTicketPanelsDraft({
      mode: "multi",
      id: mid,
      form: multiForm,
      updatedAt: Date.now(),
    });
  }

  function draftMatchesRoute(draft, route) {
    if (!draft || !route) return false;
    if (String(draft.mode || "") !== String(route.mode || "")) return false;
    return String(draft.id || "") === String(route.id || "");
  }

  function applySinglePanelFormData(data) {
    if (!data || typeof data !== "object") return;
    if (data.ticketType != null) setValue("tk-panel-ticketType", data.ticketType);
    if (data.channelId != null) setValue("tk-panel-channelId", data.channelId || "");
    if (data.title != null) setValue("tk-panel-title", data.title);
    if (data.color != null) setValue("tk-panel-color", data.color || "#6f4e37");
    if (data.content != null) setValue("tk-panel-content", data.content);
    if (data.buttonText != null) setValue("tk-panel-buttonText", data.buttonText);
    if (data.buttonStyle != null) setValue("tk-panel-buttonStyle", data.buttonStyle);
    if (data.buttonEmoji != null) {
      setValue(
        "tk-panel-buttonEmoji",
        typeof data.buttonEmoji === "string"
          ? data.buttonEmoji
          : data.buttonEmoji && data.buttonEmoji.id
            ? "<" +
              (data.buttonEmoji.animated ? "a" : "") +
              ":" +
              (data.buttonEmoji.name || "e") +
              ":" +
              data.buttonEmoji.id +
              ">"
            : data.buttonEmoji && data.buttonEmoji.name
              ? data.buttonEmoji.name
              : "",
      );
      syncTicketPanelButtonEmojiUi({ silent: true });
    }
    if (data.largeImageUrl != null) setValue("tk-panel-largeImageUrl", data.largeImageUrl || "");
    if (data.smallImageUrl != null) setValue("tk-panel-smallImageUrl", data.smallImageUrl || "");
    if (data.disabled != null) setChecked("tk-panel-disabled", Boolean(data.disabled));
    if (data.deleteMentionsOnOpen != null) {
      setChecked("tk-panel-deleteMentionsOnOpen", data.deleteMentionsOnOpen === true);
    }
    if (data.openCooldownSeconds != null) setValue("tk-panel-openCooldownSeconds", data.openCooldownSeconds || 0);
    if (Object.prototype.hasOwnProperty.call(data, "maxOpenTicketsPerUser")) {
      setValue(
        "tk-panel-maxOpenTicketsPerUser",
        data.maxOpenTicketsPerUser != null ? data.maxOpenTicketsPerUser : "",
      );
    }
    if (Object.prototype.hasOwnProperty.call(data, "hideCloseButton")) {
      setValue("tk-panel-hideCloseButton", triStateSelectValue(data.hideCloseButton));
    }
    if (Object.prototype.hasOwnProperty.call(data, "hideCloseReasonButton")) {
      setValue("tk-panel-hideCloseReasonButton", triStateSelectValue(data.hideCloseReasonButton));
    }
    if (Object.prototype.hasOwnProperty.call(data, "hideClaimButton")) {
      setValue("tk-panel-hideClaimButton", triStateSelectValue(data.hideClaimButton));
    }
    if (data.formId != null) setValue("tk-panel-formId", data.formId || "");
    if (data.transcriptChannelId != null) {
      setValue("tk-panel-transcriptChannelId", data.transcriptChannelId || "");
    }
    if (data.categoryId != null) setValue("tk-panel-categoryId", data.categoryId || "");
    if (data.welcome) fillWelcomeForm(data.welcome);
    if (Object.prototype.hasOwnProperty.call(data, "ticketPerms")) fillTicketPermsForm(data.ticketPerms);
    if (data.accessRules) renderAccessRulesList(data.accessRules);
    if (data.supportHours) fillSupportHoursForm(data.supportHours);
    if (data.mentionOnOpen) {
      var pickers = (state.ticketPanels && state.ticketPanels.pickers) || state.ticketsPickers || {};
      renderMentionPillSelect(
        "tk-panel-mentionOnOpen-list",
        pickers.roles || [],
        data.mentionOnOpen,
        TICKET_PANEL_MENTION_EXTRA_ITEMS,
      );
    }
    if (data.supportTeamIds) {
      var teamExtrasDraft = ((state.ticketPanels && state.ticketPanels.teams) || []).map(function (t) {
        return { value: String(t.id), label: String(t.name || t.id) };
      });
      renderMentionPillSelect(
        "tk-panel-supportTeamIds-list",
        [],
        data.supportTeamIds,
        teamExtrasDraft,
        {
          placeholder: i18n("dash.tickets.teamsSearchPh", "Cerca team…"),
          emptyLabel: i18n("dash.tickets.teamsNone", "Nessun team"),
        },
      );
    }
    syncTicketPanelGlobalInheritedControls(data);
        if (Object.prototype.hasOwnProperty.call(data, "maxOpenTicketsPerUser")) {
      setValue(
        "tk-panel-maxOpenTicketsPerUser",
        data.maxOpenTicketsPerUser != null ? data.maxOpenTicketsPerUser : "",
      );
    }
    if (Object.prototype.hasOwnProperty.call(data, "hideCloseButton")) {
      setValue("tk-panel-hideCloseButton", triStateSelectValue(data.hideCloseButton));
    }
    if (Object.prototype.hasOwnProperty.call(data, "hideCloseReasonButton")) {
      setValue("tk-panel-hideCloseReasonButton", triStateSelectValue(data.hideCloseReasonButton));
    }
    if (Object.prototype.hasOwnProperty.call(data, "hideClaimButton")) {
      setValue("tk-panel-hideClaimButton", triStateSelectValue(data.hideClaimButton));
    }
    if (data.transcriptChannelId != null) {
      setValue("tk-panel-transcriptChannelId", data.transcriptChannelId || "");
    }
    if (data.categoryId != null) setValue("tk-panel-categoryId", data.categoryId || "");
    enhanceAllDashFancySelects(byId("tk-panel-editor") || document);
  }

  function syncMultiPanelDropdownPlaceholderUi() {
    var toggle = byId("tk-multipanel-useDropdown");
    var input = byId("tk-multipanel-dropdownPlaceholder");
    if (!input) return;
    var enabled = !toggle || toggle.checked;
    input.disabled = !enabled;
    input.setAttribute("aria-disabled", enabled ? "false" : "true");
    var wrap = input.closest(".vc-dash-picker");
    if (wrap) wrap.classList.toggle("is-disabled", !enabled);
    if (!String(input.value || "").trim()) {
      input.value = "";
      input.placeholder = "Seleziona un argomento...";
    }
  }

  function applyMultiPanelFormData(data) {
    if (!data || typeof data !== "object") return;
    if (data.channelId != null) setValue("tk-multipanel-channelId", data.channelId || "");
    if (data.useDropdown != null) setChecked("tk-multipanel-useDropdown", data.useDropdown !== false);
    if (data.dropdownPlaceholder != null) {
      setValue("tk-multipanel-dropdownPlaceholder", data.dropdownPlaceholder || "");
    }
    if (data.title != null) setValue("tk-multipanel-title", data.title || "");
    if (data.titleUrl != null) setValue("tk-multipanel-titleUrl", data.titleUrl || "");
    if (data.color != null) setValue("tk-multipanel-color", data.color || "#6f4e37");
    if (data.description != null) setValue("tk-multipanel-description", data.description || "");
    if (data.authorName != null) setValue("tk-multipanel-authorName", data.authorName || "");
    if (data.authorIconUrl != null) setValue("tk-multipanel-authorIconUrl", data.authorIconUrl || "");
    if (data.authorUrl != null) setValue("tk-multipanel-authorUrl", data.authorUrl || "");
    if (data.largeImageUrl != null) setValue("tk-multipanel-largeImageUrl", data.largeImageUrl || "");
    if (data.smallImageUrl != null) setValue("tk-multipanel-smallImageUrl", data.smallImageUrl || "");
    if (data.footerText != null) setValue("tk-multipanel-footerText", data.footerText || "");
    if (data.footerIconUrl != null) setValue("tk-multipanel-footerIconUrl", data.footerIconUrl || "");
    if (data.footerTimestamp != null) setChecked("tk-multipanel-footerTimestamp", Boolean(data.footerTimestamp));
    if (data.fields) renderMultiPanelFieldsList(data.fields);
    if (data.panelIds && data.panelIds.length) {
      fillMultiPanelSelectOptions(data.panelIds, data.optionOverrides || {});
    } else if (data.optionOverrides) {
      renderMultiPanelOptionCustomizations(data.optionOverrides);
    }
    syncMultiPanelDropdownPlaceholderUi();
    enhanceAllDashFancySelects(byId("tk-multipanel-editor") || document);
  }

  function restoreTicketPanelsEditorFromRoute(options) {
    var opts = options || {};
    var route = parseTicketPanelsRoute() || { mode: "list", id: null };
    var draft = opts.applyDraft ? readTicketPanelsDraft() : null;
    state.ticketPanelsEditor = { mode: route.mode, id: route.id };

    if (route.mode === "list") {
      setTicketPanelsMode("list");
      return;
    }

    if (route.mode === "single") {
      var panel = null;
      if (route.id) {
        panel =
          ((state.ticketPanels && state.ticketPanels.singles) || []).find(function (p) {
            return String(p.id) === String(route.id);
          }) || null;
        if (!panel) {
          setTicketPanelsRoute("list", null, { replace: true });
          setTicketPanelsMode("list");
          return;
        }
      }
      openSinglePanelEditor(panel, { skipRoute: true, skipDraft: true });
      if (draftMatchesRoute(draft, route) && draft.form) {
        applySinglePanelFormData(draft.form);
      }
      return;
    }

    if (route.mode === "multi") {
      var multi = null;
      if (route.id) {
        multi =
          ((state.ticketPanels && state.ticketPanels.multis) || []).find(function (m) {
            return String(m.id) === String(route.id);
          }) || null;
        if (!multi) {
          setTicketPanelsRoute("list", null, { replace: true });
          setTicketPanelsMode("list");
          return;
        }
      }
      openMultiPanelEditor(multi, { skipRoute: true, skipDraft: true });
      if (draftMatchesRoute(draft, route) && draft.form) applyMultiPanelFormData(draft.form);
    }
  }

  function showTicketPanelsList() {
    persistTicketPanelsDraftNow();
    state.ticketPanelsEditor = { mode: "list", id: null };
    setTicketPanelsRoute("list", null, { replace: true });
    setTicketPanelsMode("list");
  }

  var TICKET_PANEL_MENTION_EXTRA_ITEMS = [
    { value: "opener", label: "Ticket Opener" },
    { value: "everyone", label: "@everyone" },
    { value: "here", label: "@here" },
  ];
  var TICKET_PANEL_PERM_KEYS = [
    "addReactions",
    "sendTtsMessages",
    "embedLinks",
    "attachFiles",
    "useExternalEmojis",
    "useExternalStickers",
    "sendVoiceMessages",
  ];
  var TICKET_PANEL_SUPPORT_HOURS_DAYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  function triStateSelectValue(value) {
    if (value === true) return "1";
    if (value === false) return "0";
    return "";
  }

  function triStateFromSelectValue(value) {
    if (value === "1") return true;
    if (value === "0") return false;
    return null;
  }

  function mentionOptionLabel(value, roles, extraItems) {
    var v = String(value || "");
    var extras = extraItems || TICKET_PANEL_MENTION_EXTRA_ITEMS;
    for (var i = 0; i < extras.length; i += 1) {
      if (String(extras[i].value) === v) return extras[i].label;
    }
    var list = roles || [];
    for (var r = 0; r < list.length; r += 1) {
      if (String(list[r].id) === v) return "@" + String(list[r].name || v);
    }
    return v.indexOf("@") === 0 ? v : "@" + v;
  }

  function closeAllMentionPillSelects(exceptRoot) {
    Array.prototype.forEach.call(document.querySelectorAll(".vc-dash-tk-pillsel.is-open"), function (root) {
      if (exceptRoot && root === exceptRoot) return;
      root.classList.remove("is-open");
      var input = root.querySelector(".vc-dash-tk-pillsel__input");
      if (input) input.value = "";
      var menu = root.__vcPillMenu;
      if (menu) {
        menu.setAttribute("hidden", "");
        menu.classList.remove("is-fixed-pos");
        menu.style.cssText = "";
        if (menu.__vcHomeParent && menu.parentElement !== menu.__vcHomeParent) {
          menu.__vcHomeParent.appendChild(menu);
        }
      }
    });
  }

  function positionMentionPillMenu(root) {
    var menu = root && root.__vcPillMenu;
    var control = root && root.querySelector(".vc-dash-tk-pillsel__control");
    if (!menu || !control) return;
    if (!menu.__vcHomeParent) menu.__vcHomeParent = root;
    if (menu.parentElement !== document.body) document.body.appendChild(menu);
    var rect = control.getBoundingClientRect();
    var gap = 6;
    var spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - 8);
    var spaceAbove = Math.max(0, rect.top - gap - 8);
    var preferUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    var available = preferUp ? spaceAbove : spaceBelow;
    var maxH = Math.max(140, Math.min(280, available));
    menu.classList.add("is-fixed-pos");
    menu.style.position = "fixed";
    menu.style.left =
      Math.max(8, Math.min(window.innerWidth - 8 - Math.round(rect.width), Math.round(rect.left))) + "px";
    menu.style.width = Math.max(160, Math.round(rect.width)) + "px";
    menu.style.right = "auto";
    menu.style.zIndex = "10360";
    menu.style.maxHeight = maxH + "px";
    if (preferUp) {
      menu.style.top = "auto";
      menu.style.bottom = Math.max(8, Math.round(window.innerHeight - rect.top + gap)) + "px";
    } else {
      menu.style.bottom = "auto";
      menu.style.top = Math.round(rect.bottom + gap) + "px";
    }
  }

  function renderMentionPillSelect(containerId, roles, selectedIds, extraItems, options) {
    var root = byId(containerId);
    if (!root) return;
    var opts = options && typeof options === "object" ? options : {};
    var extras = extraItems || TICKET_PANEL_MENTION_EXTRA_ITEMS;
    var roleList = Array.isArray(roles) ? roles : [];
    var values = [];
    var seen = {};
    (selectedIds || []).forEach(function (id) {
      var v = String(id || "").trim();
      if (!v || seen[v]) return;
      seen[v] = true;
      values.push(v);
    });
    root.className = "vc-dash-tk-pillsel";
    root.__vcPillValues = values.slice();
    root.__vcPillRoles = roleList;
    root.__vcPillExtras = extras;
    root.__vcPillPlaceholder = String(opts.placeholder || "Cerca ruolo…");
    root.__vcPillEmptyLabel = String(opts.emptyLabel || "");
    root.__vcPillNoResultsLabel = String(opts.noResultsLabel || "Nessun risultato");

    function allOptions() {
      return extras
        .map(function (it) {
          return { value: String(it.value), label: it.label };
        })
        .concat(
          roleList.map(function (r) {
            return { value: String(r.id), label: "@" + String(r.name || r.id) };
          }),
        );
    }

    function paintControl() {
      var selected = root.__vcPillValues || [];
      var pillsHtml = selected
        .map(function (v) {
          return (
            '<span class="vc-dash-tk-pillsel__pill" data-pill-value="' +
            escHtml(v) +
            '">' +
            '<span class="vc-dash-tk-pillsel__pill-label">' +
            escHtml(mentionOptionLabel(v, root.__vcPillRoles, root.__vcPillExtras)) +
            "</span>" +
            '<button type="button" class="vc-dash-tk-pillsel__pill-x" data-pill-remove="' +
            escHtml(v) +
            '" aria-label="Rimuovi">×</button></span>'
          );
        })
        .join("");
      var inputVal = root.querySelector(".vc-dash-tk-pillsel__input")
        ? root.querySelector(".vc-dash-tk-pillsel__input").value
        : "";
      var control = root.querySelector(".vc-dash-tk-pillsel__control");
      if (!control) {
        root.innerHTML =
          '<div class="vc-dash-tk-pillsel__control">' +
          '<div class="vc-dash-tk-pillsel__pills"></div>' +
          '<button type="button" class="vc-dash-tk-pillsel__clear" aria-label="Svuota" hidden>×</button>' +
          "</div>" +
          '<div class="vc-dash-tk-pillsel__menu" role="listbox" hidden></div>';
        control = root.querySelector(".vc-dash-tk-pillsel__control");
        root.__vcPillMenu = root.querySelector(".vc-dash-tk-pillsel__menu");
        if (root.__vcPillMenu) root.__vcPillMenu.__vcHomeParent = root;
      }
      var pills = root.querySelector(".vc-dash-tk-pillsel__pills");
      var clearBtn = root.querySelector(".vc-dash-tk-pillsel__clear");
      if (pills) {
        pills.innerHTML =
          pillsHtml +
          '<input type="text" class="vc-dash-tk-pillsel__input" autocomplete="off" spellcheck="false" placeholder="' +
          (selected.length ? "" : escHtml(root.__vcPillPlaceholder || "Cerca ruolo…")) +
          '" />';
        var input = pills.querySelector(".vc-dash-tk-pillsel__input");
        if (input) input.value = inputVal;
      }
      if (clearBtn) {
        if (selected.length) clearBtn.removeAttribute("hidden");
        else clearBtn.setAttribute("hidden", "");
      }
    }

    function paintMenu() {
      var menu = root.__vcPillMenu || root.querySelector(".vc-dash-tk-pillsel__menu");
      if (!menu) return;
      root.__vcPillMenu = menu;
      menu.__vcHomeParent = root;
      var selectedMap = {};
      (root.__vcPillValues || []).forEach(function (v) {
        selectedMap[v] = true;
      });
      var q = String((root.querySelector(".vc-dash-tk-pillsel__input") || {}).value || "")
        .trim()
        .toLowerCase();
      var opts = allOptions().filter(function (opt) {
        if (selectedMap[opt.value]) return false;
        if (!q) return true;
        return (
          String(opt.label || "")
            .toLowerCase()
            .indexOf(q) >= 0 || String(opt.value).toLowerCase().indexOf(q) >= 0
        );
      });
      if (!opts.length) {
        var emptyMsg =
          root.__vcPillEmptyLabel ||
          (roleList.length || (root.__vcPillExtras || []).length
            ? root.__vcPillNoResultsLabel || "Nessun risultato"
            : "Nessun ruolo disponibile");
        menu.innerHTML = '<div class="vc-dash-tk-pillsel__empty">' + escHtml(emptyMsg) + "</div>";
      } else {
        menu.innerHTML = opts
          .map(function (opt) {
            return (
              '<button type="button" class="vc-dash-tk-pillsel__option" role="option" data-pill-add="' +
              escHtml(opt.value) +
              '">' +
              escHtml(opt.label) +
              "</button>"
            );
          })
          .join("");
      }
    }

    function openMenu(focusInput) {
      closeAllMentionPillSelects(root);
      root.classList.add("is-open");
      paintControl();
      paintMenu();
      var menu = root.__vcPillMenu;
      if (menu) {
        menu.removeAttribute("hidden");
        positionMentionPillMenu(root);
        requestAnimationFrame(function () {
          positionMentionPillMenu(root);
        });
      }
      if (focusInput) {
        var input = root.querySelector(".vc-dash-tk-pillsel__input");
        if (input) input.focus();
      }
    }

    function addValue(v) {
      v = String(v || "").trim();
      if (!v) return;
      if ((root.__vcPillValues || []).indexOf(v) >= 0) return;
      root.__vcPillValues = (root.__vcPillValues || []).concat([v]);
      paintControl();
      openMenu(true);
      if (typeof root.__vcPillOnChange === "function") root.__vcPillOnChange(root.__vcPillValues.slice());
    }

    function removeValue(v) {
      v = String(v || "");
      root.__vcPillValues = (root.__vcPillValues || []).filter(function (x) {
        return x !== v;
      });
      paintControl();
      if (root.classList.contains("is-open")) openMenu(true);
      if (typeof root.__vcPillOnChange === "function") root.__vcPillOnChange(root.__vcPillValues.slice());
    }

    if (!root.__vcPillWired) {
      root.__vcPillWired = true;
      root.addEventListener("mousedown", function (ev) {
                if (ev.target && ev.target.closest && ev.target.closest(".vc-dash-tk-pillsel")) {
          ev.stopPropagation();
        }
      });
      root.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t) return;
        var removeBtn = t.closest ? t.closest("[data-pill-remove]") : null;
        if (removeBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          removeValue(removeBtn.getAttribute("data-pill-remove"));
          return;
        }
        if (t.closest && t.closest(".vc-dash-tk-pillsel__clear")) {
          ev.preventDefault();
          ev.stopPropagation();
          root.__vcPillValues = [];
          paintControl();
          openMenu(true);
          if (typeof root.__vcPillOnChange === "function") root.__vcPillOnChange([]);
          return;
        }
        if (t.closest && t.closest(".vc-dash-tk-pillsel__control")) {
          ev.preventDefault();
          openMenu(true);
        }
      });
      root.addEventListener("input", function (ev) {
        if (!ev.target || !ev.target.classList.contains("vc-dash-tk-pillsel__input")) return;
        if (!root.classList.contains("is-open")) openMenu(false);
        else {
          paintMenu();
          positionMentionPillMenu(root);
        }
      });
      root.addEventListener("focusin", function () {
        if (!root.classList.contains("is-open")) openMenu(false);
      });
      root.addEventListener("keydown", function (ev) {
        if (!ev.target || !ev.target.classList.contains("vc-dash-tk-pillsel__input")) return;
        if (ev.key === "Backspace" && !ev.target.value && (root.__vcPillValues || []).length) {
          ev.preventDefault();
          removeValue(root.__vcPillValues[root.__vcPillValues.length - 1]);
        } else if (ev.key === "Escape") {
          closeAllMentionPillSelects(null);
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          var menu = root.__vcPillMenu;
          var first = menu && menu.querySelector(".vc-dash-tk-pillsel__option");
          if (first) addValue(first.getAttribute("data-pill-add"));
        }
      });
    }

    if (!document.__vcMentionPillDocWired) {
      document.__vcMentionPillDocWired = true;
      document.addEventListener("mousedown", function (ev) {
        var t = ev.target;
        if (t && t.closest && (t.closest(".vc-dash-tk-pillsel") || t.closest(".vc-dash-tk-pillsel__menu"))) {
          return;
        }
        closeAllMentionPillSelects(null);
      });
      document.addEventListener(
        "scroll",
        function () {
          Array.prototype.forEach.call(document.querySelectorAll(".vc-dash-tk-pillsel.is-open"), function (r) {
            positionMentionPillMenu(r);
          });
        },
        true,
      );
      window.addEventListener(
        "resize",
        function () {
          Array.prototype.forEach.call(document.querySelectorAll(".vc-dash-tk-pillsel.is-open"), function (r) {
            positionMentionPillMenu(r);
          });
        },
        { passive: true },
      );
    }

        if (!document.__vcMentionPillMenuWired) {
      document.__vcMentionPillMenuWired = true;
      document.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-tk-pillsel__option[data-pill-add]") : null;
        if (!btn) return;
        var menu = btn.closest(".vc-dash-tk-pillsel__menu");
        if (!menu) return;
        var host = menu.__vcHomeParent;
        if (!host || typeof host.__vcPillAdd !== "function") {
                    host = document.querySelector(".vc-dash-tk-pillsel.is-open");
        }
        if (!host) return;
        ev.preventDefault();
        ev.stopPropagation();
        var v = btn.getAttribute("data-pill-add");
        if ((host.__vcPillValues || []).indexOf(v) >= 0) return;
        host.__vcPillValues = (host.__vcPillValues || []).concat([String(v)]);
        if (typeof host.__vcPillPaintControl === "function") host.__vcPillPaintControl();
        if (typeof host.__vcPillOpenMenu === "function") host.__vcPillOpenMenu(true);
        if (typeof host.__vcPillOnChange === "function") host.__vcPillOnChange(host.__vcPillValues.slice());
      });
    }

    root.__vcPillPaintControl = paintControl;
    root.__vcPillOpenMenu = openMenu;
    root.__vcPillAdd = addValue;
    root.__vcPillRemove = removeValue;
    if (typeof opts.onChange === "function") root.__vcPillOnChange = opts.onChange;

    paintControl();
    paintMenu();
    if (!root.__vcPillMenu) {
      root.__vcPillMenu = root.querySelector(".vc-dash-tk-pillsel__menu");
      if (root.__vcPillMenu) root.__vcPillMenu.__vcHomeParent = root;
    }
  }

  function readRoleCheckList(containerId) {
    var list = byId(containerId);
    if (!list) return [];
    if (Array.isArray(list.__vcPillValues)) return list.__vcPillValues.slice();
    var out = [];
    Array.prototype.forEach.call(list.querySelectorAll("input[data-role-check]:checked"), function (input) {
      if (input && input.value) out.push(String(input.value));
    });
    return out;
  }

  function renderWelcomeFieldsList(fields) {
    var list = byId("tk-panel-welcome-fields-list");
    if (!list) return;
    var rows = Array.isArray(fields) ? fields : [];
    list.innerHTML = rows
      .map(function (f) {
        return (
          '<div class="vc-dash-tk-field-row">' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">Nome campo</span>' +
          '<input type="text" class="vc-dash-tk-field-name" maxlength="256" value="' +
          escHtml((f && f.name) || "") +
          '" /></label>' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">Valore</span>' +
          '<input type="text" class="vc-dash-tk-field-value" maxlength="1024" value="' +
          escHtml((f && f.value) || "") +
          '" /></label>' +
          '<label class="vc-dash-tk-field-inline"><input type="checkbox" class="vc-dash-tk-field-inline-check"' +
          (f && f.inline ? " checked" : "") +
          " /><span>Inline</span></label>" +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger vc-dash-tk-field-remove" aria-label="Rimuovi campo">' +
          '<i class="fa fa-trash" aria-hidden="true"></i></button>' +
          "</div>"
        );
      })
      .join("");
  }

  function readWelcomeFieldsList() {
    var list = byId("tk-panel-welcome-fields-list");
    var out = [];
    if (!list) return out;
    Array.prototype.forEach.call(list.querySelectorAll(".vc-dash-tk-field-row"), function (row) {
      var nameEl = row.querySelector(".vc-dash-tk-field-name");
      var valueEl = row.querySelector(".vc-dash-tk-field-value");
      var inlineEl = row.querySelector(".vc-dash-tk-field-inline-check");
      var name = nameEl ? String(nameEl.value || "").trim() : "";
      var value = valueEl ? String(valueEl.value || "").trim() : "";
      if (!name || !value) return;
      out.push({ name: name, value: value, inline: Boolean(inlineEl && inlineEl.checked) });
    });
    return out;
  }

  function fillWelcomeForm(welcome) {
    var w = welcome || {};
    setValue("tk-panel-welcome-color", w.color || "#6f4e37");
    setValue("tk-panel-welcome-title", w.title || "");
    setValue("tk-panel-welcome-titleUrl", w.titleUrl || "");
    setValue("tk-panel-welcome-description", w.description || "");
    setValue("tk-panel-welcome-authorName", w.authorName || "");
    setValue("tk-panel-welcome-authorIconUrl", w.authorIconUrl || "");
    setValue("tk-panel-welcome-authorUrl", w.authorUrl || "");
    setValue("tk-panel-welcome-largeImageUrl", w.largeImageUrl || "");
    setValue("tk-panel-welcome-smallImageUrl", w.smallImageUrl || "");
    setValue("tk-panel-welcome-footerText", w.footerText || "");
    setValue("tk-panel-welcome-footerIconUrl", w.footerIconUrl || "");
    setChecked("tk-panel-welcome-footerTimestamp", Boolean(w.footerTimestamp));
    renderWelcomeFieldsList(w.fields || []);
  }

  function isWelcomeFormEmpty(w) {
    if (!w || typeof w !== "object") return true;
    return !(
      String(w.title || "").trim() ||
      String(w.description || "").trim() ||
      String(w.authorName || "").trim() ||
      String(w.largeImageUrl || "").trim() ||
      String(w.smallImageUrl || "").trim() ||
      String(w.footerText || "").trim() ||
      (Array.isArray(w.fields) && w.fields.length)
    );
  }

  function welcomeDefaultsForType(ticketType) {
    var defaults = (state.ticketPanels && state.ticketPanels.welcomeDefaults) || {};
    var key = String(ticketType || "supporto").toLowerCase();
    if (key === "highstaff") key = "high";
    return defaults[key] || defaults.supporto || null;
  }

  function resolveWelcomeForEditor(panel) {
    if (panel && panel.welcome && !isWelcomeFormEmpty(panel.welcome)) return panel.welcome;
    var type = panel && panel.ticketType ? String(panel.ticketType) : "";
    if (!type) return null;
    return welcomeDefaultsForType(type);
  }

  function ticketPanelRoleOptions() {
    var pickers =
      (state.ticketPanels && state.ticketPanels.pickers) ||
      state.pickers ||
      state.settingsPickers ||
      {};
    return pickers.roles || [];
  }

  function rewriteWelcomeDescriptionMentions(description, roleIds) {
    var out = String(description || "");
    var byId = {};
    ticketPanelRoleOptions().forEach(function (r) {
      if (r && (r.id || r.value)) byId[String(r.id || r.value)] = r;
    });
    var preferred = (roleIds || [])
      .map(String)
      .filter(function (id) {
        return /^\d{16,22}$/.test(id);
      })
      .map(function (id) {
        var r = byId[id];
        return { id: id, name: String((r && (r.name || r.label)) || "").trim() };
      })
      .filter(function (r) {
        return r.name;
      })
      .sort(function (a, b) {
        return b.name.length - a.name.length;
      });
    preferred.forEach(function (role) {
      var mention = "<@&" + role.id + ">";
      if (out.indexOf(mention) !== -1) return;
      var escaped = role.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var re = new RegExp("(?:\\*{1,2}|_{1,2})*" + escaped + "(?:\\*{1,2}|_{1,2})*", "gi");
      out = out.replace(re, mention);
    });
    return out;
  }

  function insertSelectedRoleMentionsIntoWelcome() {
    var ta = byId("tk-panel-welcome-description");
    if (!ta) return;
    var roleIds = readRoleCheckList("tk-panel-mentionOnOpen-list").filter(function (t) {
      return /^\d{16,22}$/.test(String(t));
    });
    if (!roleIds.length) return;
    var mentions = roleIds.map(function (id) {
      return "<@&" + id + ">";
    });
    var cur = String(ta.value || "");
    var missing = mentions.filter(function (m) {
      return cur.indexOf(m) === -1;
    });
    if (!missing.length) {
      ta.value = rewriteWelcomeDescriptionMentions(cur, roleIds);
      return;
    }
    var sep = cur && !/\s$/.test(cur) ? " " : "";
    ta.value = rewriteWelcomeDescriptionMentions(cur + sep + missing.join(" "), roleIds);
    try {
      ta.focus();
    } catch (_) {}
  }

  function readWelcomeForm() {
    var mentionRoleIds = readRoleCheckList("tk-panel-mentionOnOpen-list").filter(function (t) {
      return /^\d{16,22}$/.test(String(t));
    });
    var rawDesc = (byId("tk-panel-welcome-description") || {}).value || "";
    return {
      color: (byId("tk-panel-welcome-color") || {}).value || "#6f4e37",
      title: (byId("tk-panel-welcome-title") || {}).value || "",
      titleUrl: (byId("tk-panel-welcome-titleUrl") || {}).value || "",
      description: rewriteWelcomeDescriptionMentions(rawDesc, mentionRoleIds),
      authorName: (byId("tk-panel-welcome-authorName") || {}).value || "",
      authorIconUrl: (byId("tk-panel-welcome-authorIconUrl") || {}).value || "",
      authorUrl: (byId("tk-panel-welcome-authorUrl") || {}).value || "",
      largeImageUrl: (byId("tk-panel-welcome-largeImageUrl") || {}).value || "",
      smallImageUrl: (byId("tk-panel-welcome-smallImageUrl") || {}).value || "",
      footerText: (byId("tk-panel-welcome-footerText") || {}).value || "",
      footerIconUrl: (byId("tk-panel-welcome-footerIconUrl") || {}).value || "",
      footerTimestamp: Boolean(byId("tk-panel-welcome-footerTimestamp") && byId("tk-panel-welcome-footerTimestamp").checked),
      fields: readWelcomeFieldsList(),
    };
  }

  function getGlobalTicketPermsForPanel() {
    var fromPanels =
      state.ticketPanels &&
      state.ticketPanels.settings &&
      state.ticketPanels.settings.ticketPerms;
    if (fromPanels && typeof fromPanels === "object") return fromPanels;
    var fromTickets = state.tickets && state.tickets.ticketPerms;
    if (fromTickets && typeof fromTickets === "object") return fromTickets;
    return {
      addReactions: true,
      sendTtsMessages: false,
      embedLinks: true,
      attachFiles: true,
      useExternalEmojis: true,
      useExternalStickers: true,
      sendVoiceMessages: false,
    };
  }

  function isGlobalTicketPermOn(globalPerms, key) {
    var g = globalPerms || {};
    if (key === "sendTtsMessages" || key === "sendVoiceMessages") return g[key] === true;
    return g[key] !== false;
  }

  function fillTicketPermsForm(perms) {
    var global = getGlobalTicketPermsForPanel();
    var extras = perms && typeof perms === "object" ? perms : null;
    var replace = Boolean(extras && (extras.replace === true || extras.__replace === true));
    var grid = byId("tk-panel-ticketPerms-grid");
    if (grid) grid.classList.remove("is-disabled");
    TICKET_PANEL_PERM_KEYS.forEach(function (key) {
      var gOn = isGlobalTicketPermOn(global, key);
      var on = gOn;
      if (extras) {
        if (replace) on = extras[key] === true;
        else on = gOn || extras[key] === true;
      }
      setChecked("tk-panel-perm-" + key, on);
      var el = byId("tk-panel-perm-" + key);
      if (el) el.disabled = false;
      var row = el && el.closest ? el.closest(".vc-dash-settings-row") : null;
      if (row) {
        row.classList.toggle("is-global-perm", gOn && on);
        row.classList.toggle("is-perm-override", Boolean(extras) && on !== gOn);
        var hint = row.querySelector(".vc-dash-tk-perm-global-hint");
        if (hint) {
          if (on !== gOn) {
            hint.textContent = gOn ? "Disattivato rispetto al globale" : "Attivato rispetto al globale";
            hint.removeAttribute("hidden");
          } else if (gOn) {
            hint.textContent = "Attivo anche in globale";
            hint.removeAttribute("hidden");
          } else {
            hint.setAttribute("hidden", "");
          }
        }
      }
    });
  }

  function readTicketPermsForm() {
    var global = getGlobalTicketPermsForPanel();
    var out = { replace: true };
    var differs = false;
    TICKET_PANEL_PERM_KEYS.forEach(function (key) {
      var el = byId("tk-panel-perm-" + key);
      var on = Boolean(el && el.checked);
      out[key] = on;
      if (on !== isGlobalTicketPermOn(global, key)) differs = true;
    });
        return differs ? out : null;
  }

  function renderAccessRulesList(rules) {
    var list = byId("tk-panel-accessRules-list");
    if (!list) return;
    var pickers = (state.ticketPanels && state.ticketPanels.pickers) || state.ticketsPickers || {};
    var roles = pickers.roles || [];
    var rows = Array.isArray(rules) && rules.length ? rules : [{ roleId: "everyone", allow: true }];
    list.innerHTML = rows
      .map(function (rule) {
        var roleId = String((rule && rule.roleId) || "everyone");
        var options =
          '<option value="everyone"' +
          (roleId === "everyone" ? " selected" : "") +
          ">@everyone</option>" +
          roles
            .map(function (r) {
              var id = String(r.id);
              return (
                '<option value="' +
                escHtml(id) +
                '"' +
                (roleId === id ? " selected" : "") +
                ">" +
                escHtml(r.name || id) +
                "</option>"
              );
            })
            .join("");
        var allow = rule && rule.allow === false ? "0" : "1";
        return (
          '<div class="vc-dash-tk-rule-row">' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">Ruolo</span>' +
          '<select class="vc-dash-tk-rule-role">' +
          options +
          "</select></label>" +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">Accesso</span>' +
          '<select class="vc-dash-tk-rule-allow">' +
          '<option value="1"' +
          (allow === "1" ? " selected" : "") +
          ">Consenti</option>" +
          '<option value="0"' +
          (allow === "0" ? " selected" : "") +
          ">Nega</option>" +
          "</select></label>" +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger vc-dash-tk-rule-remove" aria-label="Rimuovi regola">' +
          '<i class="fa fa-trash" aria-hidden="true"></i></button>' +
          "</div>"
        );
      })
      .join("");
    enhanceAllDashFancySelects(list);
  }

  function readAccessRulesList() {
    var list = byId("tk-panel-accessRules-list");
    var out = [];
    if (!list) return out;
    Array.prototype.forEach.call(list.querySelectorAll(".vc-dash-tk-rule-row"), function (row) {
      var roleSel = row.querySelector(".vc-dash-tk-rule-role");
      var allowSel = row.querySelector(".vc-dash-tk-rule-allow");
      var roleId = roleSel ? String(roleSel.value || "") : "";
      if (!roleId) return;
      out.push({ roleId: roleId, allow: allowSel ? allowSel.value !== "0" : true });
    });
    return out;
  }

  function fillSupportHoursForm(hours) {
    var h = hours || {};
    setValue("tk-panel-supportHours-timezone", h.timezone || "Europe/Rome");
    TICKET_PANEL_SUPPORT_HOURS_DAYS.forEach(function (day) {
      var d = (h.days && h.days[day]) || {};
      var enabled = Boolean(d.enabled);
      var allDay = enabled ? d.allDay === true : true;
      setChecked("tk-panel-supportHours-" + day + "-enabled", enabled);
      setChecked("tk-panel-supportHours-" + day + "-allDay", allDay);
      setValue("tk-panel-supportHours-" + day + "-start", d.start || "09:00");
      setValue("tk-panel-supportHours-" + day + "-end", d.end || "17:00");
    });
    syncSupportHoursUi();
    enhanceAllDashFancySelects(byId("tk-panel-supportHours-timezone") ? byId("tk-panel-editor") : document);
  }

  function readSupportHoursForm() {
    var days = {};
    TICKET_PANEL_SUPPORT_HOURS_DAYS.forEach(function (day) {
      var enabledEl = byId("tk-panel-supportHours-" + day + "-enabled");
      var allDayEl = byId("tk-panel-supportHours-" + day + "-allDay");
      var startEl = byId("tk-panel-supportHours-" + day + "-start");
      var endEl = byId("tk-panel-supportHours-" + day + "-end");
      var enabled = Boolean(enabledEl && enabledEl.checked);
      days[day] = {
        enabled: enabled,
        allDay: enabled ? Boolean(allDayEl && allDayEl.checked) : true,
        start: (startEl && startEl.value) || "09:00",
        end: (endEl && endEl.value) || "17:00",
      };
    });
    return {
      timezone: (byId("tk-panel-supportHours-timezone") || {}).value || "Europe/Rome",
      days: days,
    };
  }

  function supportHoursDayLabels() {
    return {
      sunday: "domenica",
      monday: "lunedì",
      tuesday: "martedì",
      wednesday: "mercoledì",
      thursday: "giovedì",
      friday: "venerdì",
      saturday: "sabato",
    };
  }

  function formatSupportHoursNow(timezone) {
    var tz = String(timezone || "Europe/Rome");
    try {
      var now = new Date();
      var time = new Intl.DateTimeFormat("it-IT", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);
      var weekday = new Intl.DateTimeFormat("it-IT", {
        timeZone: tz,
        weekday: "long",
      }).format(now);
      var offsetParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        timeZoneName: "shortOffset",
        hour: "2-digit",
        minute: "2-digit",
      }).formatToParts(now);
      var offset = "";
      for (var i = 0; i < offsetParts.length; i++) {
        if (offsetParts[i].type === "timeZoneName") {
          offset = String(offsetParts[i].value || "").replace("GMT", "UTC");
          break;
        }
      }
      return (
        "Ora sono le " +
        time +
        " di " +
        weekday +
        " in " +
        tz +
        (offset ? " (" + offset + ")" : "")
      );
    } catch (_) {
      return "Fuso: " + tz;
    }
  }

  function syncSupportHoursUi() {
    var hours = readSupportHoursForm();
    var restricted = TICKET_PANEL_SUPPORT_HOURS_DAYS.some(function (day) {
      return hours.days[day] && hours.days[day].enabled;
    });
    var copyBtn = byId("tk-panel-supportHours-copyWeekdays");
    if (copyBtn) copyBtn.disabled = !(hours.days.monday && hours.days.monday.enabled);

    TICKET_PANEL_SUPPORT_HOURS_DAYS.forEach(function (day) {
      var row = document.querySelector('.vc-dash-tk-hours-day[data-day="' + day + '"]');
      if (!row) return;
      var d = hours.days[day] || {};
      var enabled = Boolean(d.enabled);
      var allDay = Boolean(d.allDay);
      var allDayEl = byId("tk-panel-supportHours-" + day + "-allDay");
      var badge = row.querySelector("[data-hours-badge]");
      var range = row.querySelector(".vc-dash-tk-hours-day__range");
      row.classList.toggle("is-enabled", enabled);

      if (enabled && !allDay) {
        if (allDayEl) allDayEl.checked = false;
        if (badge) badge.setAttribute("hidden", "");
        if (range) range.removeAttribute("hidden");
        return;
      }

      if (enabled && allDay) {
        if (allDayEl) allDayEl.checked = true;
        if (range) range.setAttribute("hidden", "");
        if (badge) {
          badge.removeAttribute("hidden");
          badge.textContent = "24/7";
          badge.classList.remove("is-closed");
        }
        return;
      }

            if (allDayEl) allDayEl.checked = true;
      if (range) range.setAttribute("hidden", "");
      if (badge) {
        badge.removeAttribute("hidden");
        if (restricted) {
          badge.textContent = "Chiuso";
          badge.classList.add("is-closed");
        } else {
          badge.textContent = "24/7";
          badge.classList.remove("is-closed");
        }
      }
    });

    var nowEl = byId("tk-panel-supportHours-now");
    var availEl = byId("tk-panel-supportHours-avail");
    if (nowEl) nowEl.textContent = formatSupportHoursNow(hours.timezone);
    if (availEl) {
      availEl.classList.remove("is-restricted", "is-closed");
      if (!restricted) {
        availEl.textContent = "Pannello disponibile 24/7 (nessuna restrizione)";
        return;
      }
      var labels = supportHoursDayLabels();
      try {
        var zoned = new Intl.DateTimeFormat("en-GB", {
          timeZone: hours.timezone || "Europe/Rome",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(new Date());
        var map = {};
        zoned.forEach(function (p) {
          map[p.type] = p.value;
        });
        var wd = String(map.weekday || "").toLowerCase();
        var dayKey =
          {
            sun: "sunday",
            mon: "monday",
            tue: "tuesday",
            wed: "wednesday",
            thu: "thursday",
            fri: "friday",
            sat: "saturday",
          }[wd] || "monday";
        var today = hours.days[dayKey] || {};
        var mins = Number(map.hour || 0) * 60 + Number(map.minute || 0);
        if (!today.enabled) {
          availEl.textContent = "Chiuso oggi (" + (labels[dayKey] || dayKey) + ")";
          availEl.classList.add("is-closed");
        } else if (today.allDay) {
          availEl.textContent = "Aperto oggi 24/7 (" + (labels[dayKey] || dayKey) + ")";
          availEl.classList.add("is-restricted");
        } else {
          var startParts = String(today.start || "09:00").split(":");
          var endParts = String(today.end || "17:00").split(":");
          var start = Number(startParts[0] || 0) * 60 + Number(startParts[1] || 0);
          var end = Number(endParts[0] || 0) * 60 + Number(endParts[1] || 0);
          var open = start <= end ? mins >= start && mins < end : mins >= start || mins < end;
          if (open) {
            availEl.textContent =
              "Aperto ora · " + (today.start || "09:00") + "–" + (today.end || "17:00");
            availEl.classList.add("is-restricted");
          } else {
            availEl.textContent =
              "Chiuso ora · orario " + (today.start || "09:00") + "–" + (today.end || "17:00");
            availEl.classList.add("is-closed");
          }
        }
      } catch (_) {
        availEl.textContent = "Orari personalizzati attivi";
        availEl.classList.add("is-restricted");
      }
    }
  }

  function applySupportHoursDay(day, cfg) {
    var enabled = Boolean(cfg && cfg.enabled);
    var allDay = enabled ? Boolean(cfg && cfg.allDay) : true;
    setChecked("tk-panel-supportHours-" + day + "-enabled", enabled);
    setChecked("tk-panel-supportHours-" + day + "-allDay", allDay);
    setValue("tk-panel-supportHours-" + day + "-start", (cfg && cfg.start) || "09:00");
    setValue("tk-panel-supportHours-" + day + "-end", (cfg && cfg.end) || "17:00");
  }

  function fillTicketPanelChannelSelects(panel) {
    var pickers = (state.ticketPanels && state.ticketPanels.pickers) || state.ticketsPickers || {};
    var text = pickers.textChannels || [];
    var categories = pickers.categories || [];
    var roles = pickers.roles || [];
    var globals = getTicketPanelGlobalSettings();
    fillSelect(
      byId("tk-panel-channelId"),
      text,
      (panel && panel.channelId) || "",
      i18n("dash.selectChannelOpt", "— Seleziona canale —"),
    );
    fillSelect(
      byId("tk-multipanel-channelId"),
      text,
      (byId("tk-multipanel-channelId") && byId("tk-multipanel-channelId").value) || "",
      i18n("dash.selectChannelOpt", "— Seleziona canale —"),
    );
    fillSelect(
      byId("tk-panel-transcriptChannelId"),
      text,
      (panel && panel.transcriptChannelId) || "",
      { inherit: true, detail: ticketPanelGlobalTranscriptDetail(globals, text) },
    );
    fillSelect(
      byId("tk-panel-categoryId"),
      categories,
      (panel && panel.categoryId) || "",
      { inherit: true, detail: ticketPanelGlobalCategoryDetail(globals, categories) },
    );
    syncTicketPanelGlobalInheritedControls(panel, globals);
    renderMentionPillSelect(
      "tk-panel-mentionOnOpen-list",
      roles,
      (panel && panel.mentionOnOpen) || [],
      TICKET_PANEL_MENTION_EXTRA_ITEMS,
    );
    var teamExtras = ((state.ticketPanels && state.ticketPanels.teams) || []).map(function (t) {
      return { value: String(t.id), label: String(t.name || t.id) };
    });
    renderMentionPillSelect(
      "tk-panel-supportTeamIds-list",
      [],
      (panel && panel.supportTeamIds) || [],
      teamExtras,
      {
        placeholder: i18n("dash.tickets.teamsSearchPh", "Cerca team…"),
        emptyLabel: i18n("dash.tickets.teamsNone", "Nessun team"),
      },
    );
    fillTicketPanelFormSelects(panel);
  }

  function getTicketPanelGlobalSettings() {
    var fromPanels = (state.ticketPanels && state.ticketPanels.settings) || {};
    var fromTickets = state.tickets || {};
    var overflow =
      fromPanels.overflowCategoryId ||
      fromTickets.overflowCategoryId ||
      fromTickets.ticketCategoryId ||
      null;
    if (String(overflow || "") === "__custom__") overflow = null;
    return {
      maxOpenTicketsPerUser: Math.max(
        1,
        Number(
          fromPanels.maxOpenTicketsPerUser != null
            ? fromPanels.maxOpenTicketsPerUser
            : fromTickets.maxOpenTicketsPerUser != null
              ? fromTickets.maxOpenTicketsPerUser
              : 1,
        ) || 1,
      ),
      hideCloseButton:
        fromPanels.hideCloseButton != null
          ? fromPanels.hideCloseButton === true
          : fromTickets.hideCloseButton === true,
      hideCloseReasonButton:
        fromPanels.hideCloseReasonButton != null
          ? fromPanels.hideCloseReasonButton === true
          : fromTickets.hideCloseReasonButton === true,
      hideClaimButton:
        fromPanels.hideClaimButton != null
          ? fromPanels.hideClaimButton === true
          : fromTickets.hideClaimButton === true,
      transcriptChannelId:
        fromPanels.transcriptChannelId || fromTickets.transcriptChannelId || null,
      overflowCategoryId: overflow ? String(overflow) : null,
    };
  }

  function pickerNameById(rows, id) {
    var want = String(id || "").trim();
    if (!want) return null;
    var list = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i].id) === want) {
        var name = String(list[i].name || "").trim();
        return name || want;
      }
    }
    return want;
  }

  function ticketPanelGlobalTranscriptDetail(globals, channels) {
    var id = globals && globals.transcriptChannelId;
    if (!id) return "Disabilitato";
    var name = pickerNameById(channels, id);
    if (name && name.charAt(0) !== "#") name = "#" + name;
    return name || String(id);
  }

  function ticketPanelGlobalCategoryDetail(globals, categories) {
    var id = globals && globals.overflowCategoryId;
    if (!id) return "Automatica";
    var name = pickerNameById(categories, id);
    return name || String(id);
  }

  function fillPanelTriStateSelect(selectId, currentValue, globalOn) {
    var select = byId(selectId);
    if (!select) return;
    var globalLabel = globalOn ? "Nascondi" : "Mostra";
    var selected = triStateSelectValue(currentValue);
    select.innerHTML =
      '<option value="" data-inherit="1" data-inherit-detail="' +
      esc(globalLabel) +
      '">' +
      esc(globalLabel) +
      "</option>" +
      '<option value="0">Mostra</option>' +
      '<option value="1">Nascondi</option>';
    select.value = selected;
    refreshDashFancySelect(select);
  }

  function fillPanelMaxOpenSelect(panel, globals) {
    var select = byId("tk-panel-maxOpenTicketsPerUser");
    if (!select) return;
    var g = globals || getTicketPanelGlobalSettings();
    var globalVal = String(g.maxOpenTicketsPerUser || 1);
    var current =
      panel && panel.maxOpenTicketsPerUser != null && panel.maxOpenTicketsPerUser !== ""
        ? String(panel.maxOpenTicketsPerUser)
        : "";
    var html =
      '<option value="" data-inherit="1" data-inherit-detail="' +
      esc(globalVal) +
      '">' +
      esc(globalVal) +
      "</option>";
    for (var n = 1; n <= 25; n += 1) {
      html += '<option value="' + n + '">' + n + "</option>";
    }
    select.innerHTML = html;
    select.value = current;
    if (current && select.value !== current) {
            var extra = document.createElement("option");
      extra.value = current;
      extra.textContent = current;
      select.appendChild(extra);
      select.value = current;
    }
    refreshDashFancySelect(select);
  }

  function syncTicketPanelGlobalInheritedControls(panel, globals) {
    var g = globals || getTicketPanelGlobalSettings();
    fillPanelMaxOpenSelect(panel, g);
    fillPanelTriStateSelect(
      "tk-panel-hideCloseButton",
      panel ? panel.hideCloseButton : null,
      g.hideCloseButton,
    );
    fillPanelTriStateSelect(
      "tk-panel-hideCloseReasonButton",
      panel ? panel.hideCloseReasonButton : null,
      g.hideCloseReasonButton,
    );
    fillPanelTriStateSelect(
      "tk-panel-hideClaimButton",
      panel ? panel.hideClaimButton : null,
      g.hideClaimButton,
    );
  }

  function panelPickLabelParts(p) {
    var title = String((p && p.title) || "").trim();
    var type = String((p && (p.ticketTypeLabel || p.ticketType)) || "").trim();
    var same =
      title &&
      type &&
      title.toLocaleLowerCase("it") === type.toLocaleLowerCase("it");
    return {
      title: title || type || String((p && p.id) || "Pannello"),
      type: same || !type ? "" : type,
    };
  }

  var MULTI_OPTION_DEFAULT_META = {
    supporto: {
      description: "Supporto generale • Segnalazioni • Problemi",
      emoji: { id: "1443651872258003005", name: "discordstaff" },
    },
    partnership: {
      description: "Partnership",
      emoji: { id: "1443651871125409812", name: "partneredserverowner" },
    },
    high: {
      description: "Donazioni • Sponsor • Amministrazione",
      emoji: { id: "1443670575376765130", name: "reportmessage" },
    },
    highstaff: {
      description: "Donazioni • Sponsor • Amministrazione",
      emoji: { id: "1443670575376765130", name: "reportmessage" },
    },
    perks: {
      description: "Verifica Selfie • Supporter • Follower",
      emoji: { id: "1482534921472835895", name: "VC_Vip" },
    },
  };

  function emojiValueToInputString(emoji) {
    if (!emoji) return "";
    if (typeof emoji === "string") return String(emoji).trim();
    if (emoji.id) return formatCustomEmojiMarkup(emoji);
    return String(emoji.name || "").trim();
  }

  function resolveMultiOptionFormState(panel, ov) {
    var typeKey = String((panel && panel.ticketType) || "").toLowerCase();
    var meta = MULTI_OPTION_DEFAULT_META[typeKey] || {};
    var defaultLabel =
      String((panel && panel.buttonText) || "").trim() ||
      ticketTypeLabel(panel && panel.ticketType) ||
      "Open a ticket!";
    var defaultDesc = String(meta.description || "").trim();
    var defaultEmoji = (panel && panel.buttonEmoji) || meta.emoji || null;

    var label =
      ov && ov.label != null && String(ov.label).trim() !== ""
        ? String(ov.label).trim()
        : defaultLabel;
    var description =
      ov && ov.description != null && String(ov.description).trim() !== ""
        ? String(ov.description).trim()
        : defaultDesc;

            var emojiVal = "";
    if (ov && ov.useCustomEmoji) {
      emojiVal = emojiValueToInputString(ov.emoji);
    } else {
      emojiVal = emojiValueToInputString(defaultEmoji);
    }
    var parsed = parseTicketButtonEmoji(emojiVal);
    return {
      label: label,
      description: description,
      catalogCustom: parsed.custom === true,
      emojiVal: emojiVal,
      defaultLabel: defaultLabel,
      defaultDesc: defaultDesc || "Optional description",
    };
  }

  function readMultiPanelOptionOverrides() {
    var host = byId("tk-multipanel-optionCustomizations");
    var out = {};
    if (!host) return out;
    var singles = (state.ticketPanels && state.ticketPanels.singles) || [];
    var byIdMap = {};
    singles.forEach(function (p) {
      if (p && p.id != null) byIdMap[String(p.id)] = p;
    });
    Array.prototype.forEach.call(host.querySelectorAll(".vc-dash-tk-optcust__block[data-panel-id]"), function (block) {
      var panelId = String(block.getAttribute("data-panel-id") || "").trim();
      if (!panelId) return;
      var emojiInput = block.querySelector('[data-optcust-field="emoji"]');
      var labelInput = block.querySelector('[data-optcust-field="label"]');
      var descInput = block.querySelector('[data-optcust-field="description"]');
      var label = String((labelInput && labelInput.value) || "").trim();
      var description = String((descInput && descInput.value) || "").trim();
      var emoji = String((emojiInput && emojiInput.value) || "").trim();
      var panel = byIdMap[panelId] || null;
      var typeKey = String((panel && panel.ticketType) || "").toLowerCase();
      var meta = MULTI_OPTION_DEFAULT_META[typeKey] || {};
      var defaultEmoji = emojiValueToInputString((panel && panel.buttonEmoji) || meta.emoji || null);
      var defaultLabel =
        String((panel && panel.buttonText) || "").trim() ||
        ticketTypeLabel(panel && panel.ticketType) ||
        "";
      var defaultDesc = String(meta.description || "").trim();
      var labelChanged = label && label !== defaultLabel;
      var descChanged = description && description !== defaultDesc;
      var emojiChanged = emoji !== defaultEmoji;
            var useCustomEmoji = emojiChanged;
      if (!labelChanged && !descChanged && !useCustomEmoji) return;
      out[panelId] = {
        label: labelChanged ? label : label || null,
        description: descChanged ? description : description || null,
        useCustomEmoji: useCustomEmoji,
        emoji: useCustomEmoji ? emoji || null : null,
      };
            if (!labelChanged) out[panelId].label = null;
      if (!descChanged) out[panelId].description = null;
      if (!out[panelId].label && !out[panelId].description && !out[panelId].useCustomEmoji) {
        delete out[panelId];
      }
    });
    return out;
  }

  function syncMultiPanelOptionCustEmojiRow(block, opts) {
    var options = opts || {};
    if (!block) return;
    var useToggle = block.querySelector('[data-optcust-field="catalogCustom"]');
    var emojiInput = block.querySelector('[data-optcust-field="emoji"]');
    var preview = block.querySelector("[data-optcust-preview]");
    if (!emojiInput || !preview) return;
    var parsed = parseTicketButtonEmoji(emojiInput.value);
    if (options.preferCustom === true && useToggle) useToggle.checked = true;
    else if (options.preferCustom === false && useToggle) useToggle.checked = false;
    else if (useToggle && !options.keepToggle) useToggle.checked = parsed.custom === true;

    preview.classList.toggle("is-empty", parsed.kind === "empty");
    if (parsed.kind === "custom" && parsed.url) {
      preview.innerHTML =
        '<img src="' +
        escHtml(parsed.url) +
        '" alt=":' +
        escHtml(parsed.name || "emoji") +
        ':" width="22" height="22" loading="lazy" decoding="async" />';
    } else if (parsed.kind === "unicode") {
      preview.textContent = parsed.text;
    } else {
      preview.textContent = "";
    }
  }

  function closeOptcustEmojiMenu() {
    var menu = byId("tk-multipanel-optcust-emoji-menu");
    var park = byId("tk-multipanel-optionCustomizations-empty");
    var parkParent = park && park.parentNode ? park.parentNode : null;
    if (menu && parkParent && menu.parentNode !== parkParent) {
      parkParent.appendChild(menu);
    }
    if (menu) menu.setAttribute("hidden", "");
    var host = byId("tk-multipanel-optionCustomizations");
    if (host) host.classList.remove("is-emoji-open");
    Array.prototype.forEach.call(document.querySelectorAll(".vc-dash-tk-optcust__block.is-emoji-open"), function (b) {
      b.classList.remove("is-emoji-open");
    });
    state.optcustEmojiBlock = null;
  }

  function renderOptcustEmojiGrid() {
    var grid = byId("tk-multipanel-optcust-emoji-grid");
    var search = byId("tk-multipanel-optcust-emoji-search");
    var block = state.optcustEmojiBlock;
    if (!grid) return;
    var q = String((search && search.value) || "")
      .trim()
      .toLowerCase();
    var useToggle = block && block.querySelector('[data-optcust-field="catalogCustom"]');
    var useCustom = Boolean(useToggle && useToggle.checked);

    if (useCustom) {
      var emojis = ((getTicketPanelEmojiPickers().emojis) || []).filter(function (e) {
        if (!e || !e.id) return false;
        if (!q) return true;
        return String(e.name || "")
          .toLowerCase()
          .indexOf(q) !== -1;
      });
      if (!emojis.length) {
        grid.innerHTML =
          '<div class="vc-dash-tk-emoji__empty">' +
          (q ? "Nessuna emoji trovata." : "Nessuna emoji custom in questo server.") +
          "</div>";
        return;
      }
      grid.innerHTML = emojis
        .slice(0, 240)
        .map(function (e) {
          return buildTicketPanelEmojiOptHtml(e, { eager: false });
        })
        .join("");
      return;
    }

    var unicode = (typeof TK_UNICODE_EMOJIS !== "undefined" ? TK_UNICODE_EMOJIS : []).filter(function (emoji) {
      if (!q) return true;
      return String(emoji).toLowerCase().indexOf(q) !== -1;
    });
    if (!unicode.length) {
      grid.innerHTML = '<div class="vc-dash-tk-emoji__empty">Nessuna emoji trovata.</div>';
      return;
    }
    grid.innerHTML = unicode
      .map(function (emoji) {
        return (
          '<button type="button" class="vc-dash-tk-emoji__opt" role="option" data-emoji="' +
          escHtml(emoji) +
          '" title="' +
          escHtml(emoji) +
          '">' +
          escHtml(emoji) +
          "</button>"
        );
      })
      .join("");
  }

  function openOptcustEmojiMenu(block) {
    var menu = byId("tk-multipanel-optcust-emoji-menu");
    var host = byId("tk-multipanel-optionCustomizations");
    var search = byId("tk-multipanel-optcust-emoji-search");
    if (!menu || !block) return;
    closeOptcustEmojiMenu();
    state.optcustEmojiBlock = block;
    block.classList.add("is-emoji-open");
    if (host) host.classList.add("is-emoji-open");
    block.appendChild(menu);
    menu.removeAttribute("hidden");
    if (search) search.value = "";
    renderOptcustEmojiGrid();
    var useToggle = block.querySelector('[data-optcust-field="catalogCustom"]');
    if (useToggle && useToggle.checked) {
      var have = ((getTicketPanelEmojiPickers().emojis) || []).length;
      if (!have && typeof refreshTicketPanels === "function") {
        refreshTicketPanels({ silent: true }).then(function () {
          if (state.optcustEmojiBlock === block) renderOptcustEmojiGrid();
        });
      }
    }
    if (search) {
      try {
        search.focus();
      } catch (_) {}
    }
  }

  function setOptcustEmojiValue(block, raw, opts) {
    var options = opts || {};
    if (!block) return;
    var input = block.querySelector('[data-optcust-field="emoji"]');
    var value = String(raw || "").trim();
    if (input) input.value = value;
    var parsed = parseTicketButtonEmoji(value);
    if (parsed.kind === "custom") block.__vcOptcustEmojiCustom = value;
    else if (parsed.kind === "unicode") block.__vcOptcustEmojiUnicode = value;
    syncMultiPanelOptionCustEmojiRow(block, {
      preferCustom: options.preferCustom,
      keepToggle: options.keepToggle,
    });
    if (!options.silent) scheduleTicketPanelsDraftSave();
  }

  function rememberOptcustEmojiSlot(block) {
    if (!block) return;
    var input = block.querySelector('[data-optcust-field="emoji"]');
    var value = String((input && input.value) || "").trim();
    if (!value) return;
    var parsed = parseTicketButtonEmoji(value);
    if (parsed.kind === "custom") block.__vcOptcustEmojiCustom = value;
    else if (parsed.kind === "unicode") block.__vcOptcustEmojiUnicode = value;
  }

  function wireMultiPanelOptcustEmojiUi() {
    if (document.__vcOptcustEmojiWired) return;
    document.__vcOptcustEmojiWired = true;
    var host = byId("tk-multipanel-optionCustomizations");
    var menu = byId("tk-multipanel-optcust-emoji-menu");
    var search = byId("tk-multipanel-optcust-emoji-search");
    var clearBtn = byId("tk-multipanel-optcust-emoji-clear");
    var grid = byId("tk-multipanel-optcust-emoji-grid");

    if (host) {
      host.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var block = t.closest(".vc-dash-tk-optcust__block");
        if (!block) return;
        if (t.closest("[data-optcust-emoji-pick]") || t.closest("[data-optcust-emoji-value]")) {
          ev.preventDefault();
          if (block.classList.contains("is-emoji-open") && menu && !menu.hasAttribute("hidden")) {
            closeOptcustEmojiMenu();
          } else {
            openOptcustEmojiMenu(block);
          }
        }
      });
      host.addEventListener("change", function (ev) {
        var t = ev.target;
        if (!t || !t.matches || !t.matches('[data-optcust-field="catalogCustom"]')) return;
        var block = t.closest(".vc-dash-tk-optcust__block");
        if (!block) return;
        rememberOptcustEmojiSlot(block);
        var nextValue = "";
        if (t.checked) {
          nextValue = String(block.__vcOptcustEmojiCustom || "").trim();
        } else {
          nextValue = String(block.__vcOptcustEmojiUnicode || "").trim();
        }
        setOptcustEmojiValue(block, nextValue, {
          preferCustom: t.checked,
          keepToggle: true,
        });
                if (menu && !menu.hasAttribute("hidden") && state.optcustEmojiBlock === block) {
          renderOptcustEmojiGrid();
        }
        scheduleTicketPanelsDraftSave();
      });
    }
    if (search) {
      search.addEventListener("input", function () {
        renderOptcustEmojiGrid();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        var block = state.optcustEmojiBlock;
        var useToggle = block && block.querySelector('[data-optcust-field="catalogCustom"]');
        setOptcustEmojiValue(block, "", {
          preferCustom: Boolean(useToggle && useToggle.checked),
          keepToggle: true,
        });
        closeOptcustEmojiMenu();
      });
    }
    if (grid) {
      grid.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-emoji]") : null;
        if (!btn || btn.classList.contains("is-broken")) return;
        var block = state.optcustEmojiBlock;
        var useToggle = block && block.querySelector('[data-optcust-field="catalogCustom"]');
        setOptcustEmojiValue(block, btn.getAttribute("data-emoji") || "", {
          preferCustom: Boolean(useToggle && useToggle.checked),
        });
        closeOptcustEmojiMenu();
      });
      grid.addEventListener(
        "error",
        function (ev) {
          var img = ev.target;
          if (!img || img.tagName !== "IMG") return;
          var src = String(img.getAttribute("src") || img.src || "");
          if (!img.dataset.vcEmojiFallback && /\.gif(\?|$)/i.test(src)) {
            img.dataset.vcEmojiFallback = "1";
            img.src = src.replace(/\.gif(\?|$)/i, ".png$1");
            return;
          }
          var btn = img.closest ? img.closest(".vc-dash-tk-emoji__opt") : null;
          if (btn) {
            btn.classList.add("is-broken");
            btn.setAttribute("hidden", "");
          } else {
            img.remove();
          }
        },
        true,
      );
    }
    document.addEventListener(
      "pointerdown",
      function (ev) {
        if (!menu || menu.hasAttribute("hidden")) return;
        var t = ev.target;
        if (menu.contains(t)) return;
        if (t && t.closest && t.closest("[data-optcust-emoji-pick], [data-optcust-emoji-value]")) return;
        if (t && t.closest && t.closest('[data-optcust-field="catalogCustom"]')) return;
        closeOptcustEmojiMenu();
      },
      true,
    );
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      closeOptcustEmojiMenu();
    });
  }

  function renderMultiPanelOptionCustomizations(overridesMap) {
    var host = byId("tk-multipanel-optionCustomizations");
    var empty = byId("tk-multipanel-optionCustomizations-empty");
    if (!host) return;
    closeOptcustEmojiMenu();
    var selectedIds = readRoleCheckList("tk-multipanel-panelIds-list");
    var authoritative = arguments.length >= 1;
    var preserved = authoritative ? {} : readMultiPanelOptionOverrides();
    var incoming =
      authoritative && overridesMap && typeof overridesMap === "object" && !Array.isArray(overridesMap)
        ? overridesMap
        : {};
    var singles = (state.ticketPanels && state.ticketPanels.singles) || [];
    var byIdMap = {};
    singles.forEach(function (p) {
      if (p && p.id != null) byIdMap[String(p.id)] = p;
    });

    if (!selectedIds.length) {
      host.innerHTML = "";
      if (empty) empty.removeAttribute("hidden");
      return;
    }
    if (empty) empty.setAttribute("hidden", "");

    var pickSvg =
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7">' +
      '<circle cx="12" cy="12" r="9"></circle>' +
      '<path d="M8.5 10.2h.01M15.5 10.2h.01" stroke-linecap="round"></path>' +
      '<path d="M8.8 14.2c1.1 1.2 2.1 1.6 3.2 1.6s2.1-.4 3.2-1.6" stroke-linecap="round"></path>' +
      "</svg>";

    host.innerHTML = selectedIds
      .map(function (panelId) {
        var pid = String(panelId);
        var panel = byIdMap[pid] || null;
        var parts = panelPickLabelParts(panel || { id: pid, title: pid });
        var heading = parts.type ? parts.title + " · " + parts.type : parts.title;
        var ov = incoming[pid] || incoming[panelId] || preserved[pid] || null;
        var formState = resolveMultiOptionFormState(panel, ov);
        return (
          '<div class="vc-dash-tk-optcust__block" data-panel-id="' +
          escHtml(pid) +
          '">' +
          '<h4 class="vc-dash-tk-optcust__heading">' +
          escHtml(heading) +
          "</h4>" +
          '<div class="vc-dash-picker-grid">' +
          '<div class="vc-dash-picker vc-dash-picker--full vc-dash-tk-emoji">' +
          '<span class="vc-dash-picker__label">Emoji</span>' +
          '<span class="vc-dash-tk-emoji__sublabel">Emoji custom</span>' +
          '<div class="vc-dash-tk-emoji__controls">' +
          '<label class="vc-dash-switch" title="Emoji custom">' +
          '<input type="checkbox" data-optcust-field="catalogCustom"' +
          (formState.catalogCustom ? " checked" : "") +
          " />" +
          '<span class="vc-dash-switch__track" aria-hidden="true"><span class="vc-dash-switch__thumb"></span></span>' +
          "</label>" +
          '<div class="vc-dash-tk-emoji__field">' +
          '<input type="hidden" data-optcust-field="emoji" value="' +
          escHtml(formState.emojiVal) +
          '" />' +
          '<button type="button" class="vc-dash-tk-emoji__value" data-optcust-emoji-value aria-label="Emoji selezionata">' +
          '<span class="vc-dash-tk-emoji__preview" data-optcust-preview></span>' +
          "</button>" +
          '<button type="button" class="vc-dash-tk-emoji__pick" data-optcust-emoji-pick aria-label="Scegli emoji" title="Scegli emoji">' +
          pickSvg +
          "</button>" +
          "</div>" +
          "</div>" +
          "</div>" +
          '<label class="vc-dash-picker">' +
          '<span class="vc-dash-picker__label">Etichetta custom</span>' +
          '<input type="text" data-optcust-field="label" maxlength="100" placeholder="' +
          escHtml(formState.defaultLabel) +
          '" value="' +
          escHtml(formState.label) +
          '" />' +
          "</label>" +
          '<label class="vc-dash-picker vc-dash-picker--full">' +
          '<span class="vc-dash-picker__label">Descrizione</span>' +
          '<input type="text" data-optcust-field="description" maxlength="100" placeholder="' +
          escHtml(formState.defaultDesc) +
          '" value="' +
          escHtml(formState.description) +
          '" />' +
          "</label>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    Array.prototype.forEach.call(host.querySelectorAll(".vc-dash-tk-optcust__block"), function (block) {
      syncMultiPanelOptionCustEmojiRow(block);
      rememberOptcustEmojiSlot(block);
    });
    wireMultiPanelOptcustEmojiUi();
  }

  function fillMultiPanelSelectOptions(selectedIds, optionOverrides) {
    var empty = byId("tk-multipanel-panelIds-empty");
    var singles = (state.ticketPanels && state.ticketPanels.singles) || [];
    if (empty) {
      if (singles.length >= 2) empty.setAttribute("hidden", "");
      else empty.removeAttribute("hidden");
    }
    var extras = singles.map(function (p) {
      var parts = panelPickLabelParts(p);
      var label = parts.type ? parts.title + " · " + parts.type : parts.title;
      return { value: String(p.id), label: label };
    });
    renderMentionPillSelect("tk-multipanel-panelIds-list", [], selectedIds || [], extras, {
      placeholder: "Seleziona pannello…",
      emptyLabel: singles.length ? "" : "Nessun pannello disponibile",
      noResultsLabel: "Nessun pannello trovato",
      onChange: function () {
        renderMultiPanelOptionCustomizations();
        scheduleTicketPanelsDraftSave();
      },
    });
    renderMultiPanelOptionCustomizations(
      optionOverrides && typeof optionOverrides === "object" ? optionOverrides : {},
    );
  }

  function renderTicketPanelsTables() {
    var data = state.ticketPanels || {};
    var singles = data.singles || [];
    var multis = data.multis || [];
    var quota = data.quota || {};
    var qEl = byId("tk-panels-quota");
    if (qEl) {
      qEl.textContent =
        String(quota.singlesUsed != null ? quota.singlesUsed : singles.length) +
        " / " +
        String(quota.singlesMax != null ? quota.singlesMax : 25);
    }
    var mq = byId("tk-multipanels-quota");
    if (mq) {
      mq.textContent = String(quota.multisUsed != null ? quota.multisUsed : multis.length);
    }

    var settingsChannelId =
      (data.settings && data.settings.panelChannelId) || null;
    var pickerChannels =
      (data.pickers && data.pickers.textChannels) ||
      (state.ticketsPickers && state.ticketsPickers.textChannels) ||
      [];

    function panelChannelLabel(panel) {
      if (panel && panel.channelName) return panel.channelName;
      var cid =
        (panel && panel.channelId) ||
        settingsChannelId ||
        "";
      cid = String(cid || "").trim();
      if (!cid) return "—";
      var ch = pickerChannels.find(function (c) {
        return String(c.id) === cid;
      });
      if (ch && ch.name) {
        var n = String(ch.name);
        return n.charAt(0) === "#" ? n : "#" + n;
      }
      return "#" + cid;
    }

    var body = byId("tk-panels-body");
    var empty = byId("tk-panels-empty");
    if (body) {
      body.innerHTML = singles
        .map(function (p) {
          return (
            "<tr>" +
            "<td>" +
            escHtml(panelChannelLabel(p)) +
            "</td>" +
            "<td>" +
            escHtml(p.title || p.ticketTypeLabel || "—") +
            "</td>" +
            "<td>" +
            escHtml(p.supportHoursLabel || "24/7") +
            "</td>" +
            '<td class="vc-dash-tk-panels__actions"><div class="vc-dash-tk-panels__actions-inner">' +
            '<button type="button" class="vc-dashboard-btn vc-dash-tk-panels__btn" data-tk-panel-edit="' +
            escHtml(p.id) +
            '" title="Modifica" aria-label="Modifica"><i class="fa fa-pencil" aria-hidden="true"></i></button>' +
            '<button type="button" class="vc-dashboard-btn vc-dash-tk-panels__btn" data-tk-panel-publish="' +
            escHtml(p.id) +
            '" title="Manda" aria-label="Manda"><i class="fa fa-paper-plane" aria-hidden="true"></i></button>' +
            '<button type="button" class="vc-dashboard-btn vc-dash-tk-panels__btn is-danger" data-tk-panel-delete="' +
            escHtml(p.id) +
            '" title="Elimina" aria-label="Elimina"><i class="fa fa-trash-o" aria-hidden="true"></i></button>' +
            "</div></td></tr>"
          );
        })
        .join("");
    }
    if (empty) {
      if (singles.length) empty.setAttribute("hidden", "");
      else empty.removeAttribute("hidden");
    }

    var mbody = byId("tk-multipanels-body");
    var mempty = byId("tk-multipanels-empty");
    if (mbody) {
      mbody.innerHTML = multis
        .map(function (m) {
          var label = m.authorName || m.title || "Multi-panel";
          return (
            "<tr>" +
            "<td>" +
            escHtml(m.channelName || panelChannelLabel(m) || "—") +
            "</td>" +
            "<td>" +
            escHtml(label) +
            "</td>" +
            "<td>" +
            escHtml(String(m.panelCount || (m.panelIds && m.panelIds.length) || 0)) +
            "</td>" +
            '<td class="vc-dash-tk-panels__actions"><div class="vc-dash-tk-panels__actions-inner">' +
            '<button type="button" class="vc-dashboard-btn vc-dash-tk-panels__btn" data-tk-multi-edit="' +
            escHtml(m.id) +
            '" title="Modifica" aria-label="Modifica"><i class="fa fa-pencil" aria-hidden="true"></i></button>' +
            '<button type="button" class="vc-dashboard-btn vc-dash-tk-panels__btn" data-tk-multi-publish="' +
            escHtml(m.id) +
            '" title="Manda" aria-label="Manda"><i class="fa fa-paper-plane" aria-hidden="true"></i></button>' +
            '<button type="button" class="vc-dashboard-btn vc-dash-tk-panels__btn is-danger" data-tk-multi-delete="' +
            escHtml(m.id) +
            '" title="Elimina" aria-label="Elimina"><i class="fa fa-trash-o" aria-hidden="true"></i></button>' +
            "</div></td></tr>"
          );
        })
        .join("");
    }
    if (mempty) {
      if (multis.length) mempty.setAttribute("hidden", "");
      else mempty.removeAttribute("hidden");
    }
  }

  var TK_UNICODE_EMOJIS = [
    "🎫", "📩", "✉️", "📧", "📥", "📤", "📨", "💌", "🗳️", "📋", "📝", "🖊️", "✏️", "📌", "📍",
    "🛠️", "🔧", "⚙️", "🧰", "🔑", "🔐", "🔒", "🔓", "🛡️", "⚔️", "🏹", "🎯", "💡", "🔥", "⭐",
    "🌟", "✨", "💫", "⚡", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💯", "✅",
    "☑️", "✔️", "❌", "❎", "⚠️", "🚫", "🛑", "ℹ️", "❓", "❗", "💬", "🗨️", "📢", "📣", "🔔",
    "🎵", "🎶", "🎧", "🎤", "🎬", "🎮", "🕹️", "🏆", "🥇", "🥈", "🥉", "🎁", "🎀", "🎉", "🎊",
    "☕", "🍵", "🧋", "🍺", "🍷", "🍕", "🍔", "🍩", "🍪", "🎂", "🏠", "🏡", "🏰", "🏛️", "🗺️",
    "🧭", "🚀", "✈️", "🌈", "☀️", "🌙", "🌸", "🍀", "🌿", "🌹", "🐶", "🐱", "🦊", "🐻", "🐼",
    "🦄", "🐲", "👋", "🤝", "👍", "👎", "👏", "🙏", "💪", "👀", "🧠", "👑", "💎", "🪄", "🧿",
  ];

  function parseTicketButtonEmoji(raw) {
    var s = String(raw || "").trim();
    if (!s) return { kind: "empty", text: "", custom: false };
    var m = s.match(/^<(a?):([a-zA-Z0-9_]+):(\d{5,32})>$/);
    if (m) {
      var animated = m[1] === "a";
      var id = m[3];
      return {
        kind: "custom",
        text: s,
        custom: true,
        name: m[2],
        id: id,
        animated: animated,
        url: ticketPanelCustomEmojiPreviewUrl(id, animated),
      };
    }
    return { kind: "unicode", text: s, custom: false };
  }

  function ticketPanelCustomEmojiPreviewUrl(id, animated) {
    var ext = animated ? "gif" : "png";
    return (
      "https://cdn.discordapp.com/emojis/" +
      String(id || "").trim() +
      "." +
      ext +
      "?size=48"
    );
  }

  function formatCustomEmojiMarkup(emoji) {
    if (!emoji || !emoji.id) return "";
    return "<" + (emoji.animated ? "a" : "") + ":" + (emoji.name || "e") + ":" + emoji.id + ">";
  }

  function getTicketPanelEmojiPickers() {
    return (
      (state.ticketPanels && state.ticketPanels.pickers) ||
      state.ticketsPickers ||
      state.pickers ||
      state.settingsPickers ||
      {}
    );
  }

  function setTicketPanelButtonEmojiValue(raw, opts) {
    var options = opts || {};
    var input = byId("tk-panel-buttonEmoji");
    if (input) input.value = String(raw || "").trim();
    syncTicketPanelButtonEmojiUi({
      preferCustom: options.preferCustom,
      keepMenu: options.keepMenu,
    });
    if (!options.silent) scheduleTicketPanelsDraftSave();
  }

  function syncTicketPanelButtonEmojiUi(opts) {
    var options = opts || {};
    var input = byId("tk-panel-buttonEmoji");
    var preview = byId("tk-panel-buttonEmoji-preview");
    var customToggle = byId("tk-panel-buttonEmoji-custom");
    if (!input || !preview) return;
    var parsed = parseTicketButtonEmoji(input.value);
    if (options.preferCustom === true && customToggle) customToggle.checked = true;
    else if (options.preferCustom === false && customToggle) customToggle.checked = false;
    else if (customToggle && !options.keepToggle) customToggle.checked = parsed.custom === true;

    preview.classList.toggle("is-empty", parsed.kind === "empty");
    if (parsed.kind === "custom" && parsed.url) {
      preview.innerHTML =
        '<img src="' +
        escHtml(parsed.url) +
        '" alt=":' +
        escHtml(parsed.name || "emoji") +
        ':" width="22" height="22" loading="lazy" decoding="async" />';
    } else if (parsed.kind === "unicode") {
      preview.textContent = parsed.text;
    } else {
      preview.textContent = "";
    }

    if (!options.keepMenu) closeTicketPanelButtonEmojiMenu();
    else renderTicketPanelButtonEmojiGrid();
  }

  function closeTicketPanelButtonEmojiMenu() {
    var wrap = byId("tk-panel-buttonEmoji-wrap");
    var menu = byId("tk-panel-buttonEmoji-menu");
    if (wrap) wrap.classList.remove("is-open");
    if (menu) menu.setAttribute("hidden", "");
  }

  function openTicketPanelButtonEmojiMenu() {
    var wrap = byId("tk-panel-buttonEmoji-wrap");
    var menu = byId("tk-panel-buttonEmoji-menu");
    var search = byId("tk-panel-buttonEmoji-search");
    var customToggle = byId("tk-panel-buttonEmoji-custom");
    if (!menu) return;
    if (wrap) wrap.classList.add("is-open");
    menu.removeAttribute("hidden");
    if (search) search.value = "";
    renderTicketPanelButtonEmojiGrid();
    if (search) {
      try {
        search.focus();
      } catch (_) {}
    }
        if (customToggle && customToggle.checked) {
      var have = ((getTicketPanelEmojiPickers().emojis) || []).length;
      if (!have && typeof refreshTicketPanels === "function") {
        refreshTicketPanels({ silent: true }).then(function () {
          renderTicketPanelButtonEmojiGrid();
        });
      }
    }
  }

  function toggleTicketPanelButtonEmojiMenu() {
    var menu = byId("tk-panel-buttonEmoji-menu");
    if (!menu || !menu.hasAttribute("hidden")) closeTicketPanelButtonEmojiMenu();
    else openTicketPanelButtonEmojiMenu();
  }

  var TK_EMOJI_PAGE_SIZE = 72;
  var tkEmojiGridState = { items: [], shown: 0, useCustom: false, token: 0 };

  function buildTicketPanelEmojiOptHtml(e, opts) {
    var markup = formatCustomEmojiMarkup(e);
    var preview =
      (e && e.url) || ticketPanelCustomEmojiPreviewUrl(e.id, e && e.animated);
    var loading = opts && opts.eager ? "eager" : "lazy";
    return (
      '<button type="button" class="vc-dash-tk-emoji__opt" role="option" data-emoji="' +
      escHtml(markup) +
      '" title=":' +
      escHtml(e.name || "emoji") +
      ':"><img src="' +
      escHtml(preview) +
      '" alt=":' +
      escHtml(e.name || "emoji") +
      ':" width="28" height="28" loading="' +
      loading +
      '" decoding="async" /></button>'
    );
  }

  function scheduleTicketPanelEmojiGridFill() {
    var token = tkEmojiGridState.token;
    requestAnimationFrame(function () {
      if (token !== tkEmojiGridState.token || !tkEmojiGridState.useCustom) return;
      var grid = byId("tk-panel-buttonEmoji-grid");
      if (!grid) return;
      var items = tkEmojiGridState.items || [];
      if (tkEmojiGridState.shown >= items.length) return;
            if (grid.scrollHeight <= grid.clientHeight + 12) {
        appendTicketPanelButtonEmojiPage();
      }
    });
  }

  function appendTicketPanelButtonEmojiPage() {
    var grid = byId("tk-panel-buttonEmoji-grid");
    if (!grid || !tkEmojiGridState.useCustom) return;
    var items = tkEmojiGridState.items || [];
    var start = tkEmojiGridState.shown || 0;
    if (start >= items.length) return;
    var slice = items.slice(start, start + TK_EMOJI_PAGE_SIZE);
    var eager = start === 0;
    tkEmojiGridState.shown = start + slice.length;
    var html = slice
      .map(function (e) {
        return buildTicketPanelEmojiOptHtml(e, { eager: eager });
      })
      .join("");
    if (!start) grid.innerHTML = html;
    else grid.insertAdjacentHTML("beforeend", html);
    scheduleTicketPanelEmojiGridFill();
  }

  function renderTicketPanelButtonEmojiGrid() {
    var grid = byId("tk-panel-buttonEmoji-grid");
    var customToggle = byId("tk-panel-buttonEmoji-custom");
    var search = byId("tk-panel-buttonEmoji-search");
    if (!grid) return;
    var q = String((search && search.value) || "")
      .trim()
      .toLowerCase();
    var useCustom = Boolean(customToggle && customToggle.checked);
    tkEmojiGridState.token += 1;
    if (useCustom) {
      var emojis = ((getTicketPanelEmojiPickers().emojis) || []).filter(function (e) {
        if (!e || !e.id) return false;
        if (!q) return true;
        return String(e.name || "")
          .toLowerCase()
          .indexOf(q) !== -1;
      });
      tkEmojiGridState = {
        items: emojis,
        shown: 0,
        useCustom: true,
        token: tkEmojiGridState.token,
      };
      if (!emojis.length) {
        grid.innerHTML =
          '<div class="vc-dash-tk-emoji__empty">' +
          (q ? "Nessuna emoji trovata." : "Nessuna emoji custom in questo server.") +
          "</div>";
        return;
      }
      grid.innerHTML = "";
      appendTicketPanelButtonEmojiPage();
      return;
    }

    tkEmojiGridState = { items: [], shown: 0, useCustom: false, token: tkEmojiGridState.token };
    var list = TK_UNICODE_EMOJIS.filter(function (emoji) {
      if (!q) return true;
      return String(emoji).toLowerCase().indexOf(q) !== -1;
    });
    if (!list.length) {
      grid.innerHTML = '<div class="vc-dash-tk-emoji__empty">Nessuna emoji trovata.</div>';
      return;
    }
    grid.innerHTML = list
      .map(function (emoji) {
        return (
          '<button type="button" class="vc-dash-tk-emoji__opt" role="option" data-emoji="' +
          escHtml(emoji) +
          '" title="' +
          escHtml(emoji) +
          '">' +
          escHtml(emoji) +
          "</button>"
        );
      })
      .join("");
  }

  function wireTicketPanelButtonEmojiUi() {
    if (document.__vcTkEmojiWired) return;
    document.__vcTkEmojiWired = true;

    var pick = byId("tk-panel-buttonEmoji-pick");
    var valueBtn = byId("tk-panel-buttonEmoji-value");
    var customToggle = byId("tk-panel-buttonEmoji-custom");
    var search = byId("tk-panel-buttonEmoji-search");
    var clearBtn = byId("tk-panel-buttonEmoji-clear");
    var grid = byId("tk-panel-buttonEmoji-grid");

    function openPick(ev) {
      if (ev) ev.preventDefault();
      toggleTicketPanelButtonEmojiMenu();
    }
    if (pick) pick.addEventListener("click", openPick);
    if (valueBtn) valueBtn.addEventListener("click", openPick);

    if (customToggle) {
      customToggle.addEventListener("change", function () {
        var input = byId("tk-panel-buttonEmoji");
        var parsed = parseTicketButtonEmoji(input && input.value);
        if (customToggle.checked && parsed.kind === "unicode") {
          setTicketPanelButtonEmojiValue("", { preferCustom: true, keepMenu: true, silent: false });
        } else if (!customToggle.checked && parsed.kind === "custom") {
          setTicketPanelButtonEmojiValue("", { preferCustom: false, keepMenu: true, silent: false });
        } else {
          syncTicketPanelButtonEmojiUi({ keepToggle: true, keepMenu: true });
        }
        var menu = byId("tk-panel-buttonEmoji-menu");
        if (menu && menu.hasAttribute("hidden")) openTicketPanelButtonEmojiMenu();
      });
    }

    if (search) {
      search.addEventListener("input", function () {
        renderTicketPanelButtonEmojiGrid();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        setTicketPanelButtonEmojiValue("", {
          preferCustom: Boolean(customToggle && customToggle.checked),
          silent: false,
        });
      });
    }
    if (grid) {
      grid.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-emoji]") : null;
        if (!btn || btn.classList.contains("is-broken")) return;
        setTicketPanelButtonEmojiValue(btn.getAttribute("data-emoji") || "", {
          preferCustom: Boolean(customToggle && customToggle.checked),
          silent: false,
        });
      });
      grid.addEventListener(
        "error",
        function (ev) {
          var img = ev.target;
          if (!img || img.tagName !== "IMG") return;
          var src = String(img.getAttribute("src") || img.src || "");
                    if (!img.dataset.vcEmojiFallback && /\.gif(\?|$)/i.test(src)) {
            img.dataset.vcEmojiFallback = "1";
            img.src = src.replace(/\.gif(\?|$)/i, ".png$1");
            return;
          }
          var btn = img.closest ? img.closest(".vc-dash-tk-emoji__opt") : null;
          if (btn) {
            btn.classList.add("is-broken");
            btn.setAttribute("hidden", "");
            btn.setAttribute("aria-hidden", "true");
            scheduleTicketPanelEmojiGridFill();
          } else {
            img.remove();
          }
        },
        true,
      );
      grid.addEventListener("scroll", function () {
        if (!tkEmojiGridState.useCustom) return;
        if (tkEmojiGridState.shown >= (tkEmojiGridState.items || []).length) return;
        if (grid.scrollTop + grid.clientHeight < grid.scrollHeight - 48) return;
        appendTicketPanelButtonEmojiPage();
      });
    }

    document.addEventListener(
      "pointerdown",
      function (ev) {
        var wrap = byId("tk-panel-buttonEmoji-wrap");
        var menu = byId("tk-panel-buttonEmoji-menu");
        if (!wrap || !menu || menu.hasAttribute("hidden")) return;
        if (wrap.contains(ev.target)) return;
        closeTicketPanelButtonEmojiMenu();
      },
      true,
    );
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      closeTicketPanelButtonEmojiMenu();
    });
  }

  async function refreshTicketPanels(opts) {
    var options = opts || {};
    var token = getToken();
    if (!token || !state.guildId || !canUseTickets()) return;
    if (state.ticketPanelsLoading) return;
    state.ticketPanelsLoading = true;
    try {
      var out = await fetchDashboardJson(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/tickets/panels",
        token,
        { attempts: options.silent ? 1 : 3 },
      );
      if (!out.res.ok || !out.data || out.data.ok === false) {
        if (!options.silent) {
          setError((out.data && out.data.message) || "Impossibile caricare i pannelli ticket.");
        }
        return;
      }
      state.ticketPanels = out.data;
      if (out.data.pickers) state.ticketsPickers = out.data.pickers;
      renderTicketPanelsTables();
      fillTicketPanelChannelSelects();
      enhanceAllDashFancySelects(byId("tk-panels-root") || document);
    } catch (_) {
      if (!options.silent) setError("Impossibile caricare i pannelli ticket.");
    } finally {
      state.ticketPanelsLoading = false;
    }
  }

  function openSinglePanelEditor(panel, options) {
    var opts = options || {};
    var isEdit = Boolean(panel && panel.id);
    var createType = String(opts.ticketType || (panel && panel.ticketType) || "").trim().toLowerCase();
    if (createType === "highstaff") createType = "high";
    state.ticketPanelsEditor = { mode: "single", id: isEdit ? String(panel.id) : null };
    if (!opts.skipRoute) {
      setTicketPanelsRoute("single", state.ticketPanelsEditor.id, { replace: true });
    }
    setTicketPanelsMode("single");
    var editor = byId("tk-panel-editor");
    fillTicketPanelChannelSelects(panel);
    byId("tk-panel-editor-title").textContent = isEdit ? "Modifica pannello" : "Crea pannello";
    byId("tk-panel-save-btn").querySelector("span").textContent = isEdit
      ? "Salva e invia"
      : "Crea e invia";
    byId("tk-panel-id").value = isEdit ? String(panel.id) : "";
    var typeSelect = byId("tk-panel-ticketType");
    if (typeSelect) {
            typeSelect.value = isEdit
        ? String((panel && panel.ticketType) || "supporto")
        : createType || "supporto";
    }
    byId("tk-panel-channelId").value =
      (panel && panel.channelId) ||
      (state.ticketPanels && state.ticketPanels.settings && state.ticketPanels.settings.panelChannelId) ||
      "";
    byId("tk-panel-title").value = (panel && panel.title) || "";
    byId("tk-panel-color").value = (panel && panel.color) || "#6f4e37";
    byId("tk-panel-content").value = (panel && panel.content) || "";
    byId("tk-panel-buttonText").value = (panel && panel.buttonText) || "Open a ticket!";
    byId("tk-panel-buttonStyle").value = (panel && panel.buttonStyle) || "Primary";
    var emoji = panel && panel.buttonEmoji;
    byId("tk-panel-buttonEmoji").value = emoji
      ? emoji.id
        ? "<" + (emoji.animated ? "a" : "") + ":" + (emoji.name || "e") + ":" + emoji.id + ">"
        : emoji.name || ""
      : "";
    syncTicketPanelButtonEmojiUi({ silent: true });
    byId("tk-panel-largeImageUrl").value = (panel && panel.largeImageUrl) || "";
    byId("tk-panel-smallImageUrl").value = (panel && panel.smallImageUrl) || "";
    byId("tk-panel-disabled").checked = Boolean(panel && panel.disabled);

      setChecked("tk-panel-deleteMentionsOnOpen", panel ? panel.deleteMentionsOnOpen === true : false);
    setValue("tk-panel-openCooldownSeconds", (panel && panel.openCooldownSeconds) || 0);
    setValue(
      "tk-panel-maxOpenTicketsPerUser",
      panel && panel.maxOpenTicketsPerUser != null ? panel.maxOpenTicketsPerUser : "",
    );
    setValue("tk-panel-formId", (panel && panel.formId) || "");

        syncTicketPanelGlobalInheritedControls(panel);

    var welcomePanel = panel;
    if (!isEdit && createType) {
      welcomePanel = { ticketType: createType };
    }
    fillWelcomeForm(resolveWelcomeForEditor(welcomePanel));
    fillTicketPermsForm(panel && panel.ticketPerms);
    renderAccessRulesList((panel && panel.accessRules) || [{ roleId: "everyone", allow: true }]);
    fillSupportHoursForm(panel && panel.supportHours);

    if (!opts.skipDraft) {
      var draft = readTicketPanelsDraft();
      if (draftMatchesRoute(draft, state.ticketPanelsEditor) && draft.form) {
        var draftForm = Object.assign({}, draft.form);
                if (!isEdit && createType) draftForm.ticketType = createType;
        applySinglePanelFormData(draftForm);
      } else {
        persistTicketPanelsDraftNow();
      }
    }

    if (!isEdit && typeSelect && createType) {
      typeSelect.value = createType;
    }
        Array.prototype.forEach.call(editor ? editor.querySelectorAll("details.vc-dash-tk-acc") : [], function (acc, idx) {
      if (idx < 2) acc.setAttribute("open", "");
      else acc.removeAttribute("open");
    });
    enhanceAllDashFancySelects(editor || document);
  }

  function renderMultiPanelFieldsList(fields) {
    var list = byId("tk-multipanel-fields-list");
    if (!list) return;
    var rows = Array.isArray(fields) ? fields : [];
    list.innerHTML = rows
      .map(function (f) {
        return (
          '<div class="vc-dash-tk-field-row">' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">Nome campo</span>' +
          '<input type="text" class="vc-dash-tk-field-name" maxlength="256" value="' +
          escHtml((f && f.name) || "") +
          '" /></label>' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">Valore</span>' +
          '<input type="text" class="vc-dash-tk-field-value" maxlength="1024" value="' +
          escHtml((f && f.value) || "") +
          '" /></label>' +
          '<label class="vc-dash-tk-field-inline"><input type="checkbox" class="vc-dash-tk-field-inline-check"' +
          (f && f.inline ? " checked" : "") +
          " /><span>Inline</span></label>" +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger vc-dash-tk-field-remove" aria-label="Rimuovi campo">' +
          '<i class="fa fa-trash" aria-hidden="true"></i></button>' +
          "</div>"
        );
      })
      .join("");
  }

  function readMultiPanelFieldsList() {
    var list = byId("tk-multipanel-fields-list");
    var out = [];
    if (!list) return out;
    Array.prototype.forEach.call(list.querySelectorAll(".vc-dash-tk-field-row"), function (row) {
      var nameEl = row.querySelector(".vc-dash-tk-field-name");
      var valueEl = row.querySelector(".vc-dash-tk-field-value");
      var inlineEl = row.querySelector(".vc-dash-tk-field-inline-check");
      var name = nameEl ? String(nameEl.value || "").trim() : "";
      var value = valueEl ? String(valueEl.value || "").trim() : "";
      if (!name || !value) return;
      out.push({ name: name, value: value, inline: Boolean(inlineEl && inlineEl.checked) });
    });
    return out;
  }

  function openMultiPanelEditor(multi, options) {
    var opts = options || {};
    var isEdit = Boolean(multi && multi.id);
    state.ticketPanelsEditor = { mode: "multi", id: isEdit ? String(multi.id) : null };
    if (!opts.skipRoute) {
      setTicketPanelsRoute("multi", state.ticketPanelsEditor.id, { replace: true });
    }
    setTicketPanelsMode("multi");
    var multiEditor = byId("tk-multipanel-editor");
    fillTicketPanelChannelSelects();
    fillMultiPanelSelectOptions((multi && multi.panelIds) || [], (multi && multi.optionOverrides) || {});
    byId("tk-multipanel-save-btn").querySelector("span").textContent = isEdit
      ? "Salva e invia"
      : "Crea e invia";
    var multiTitle = byId("tk-multipanel-editor-title");
    if (multiTitle) multiTitle.textContent = isEdit ? "Modifica multi-panel" : "Crea multi-panel";
    byId("tk-multipanel-id").value = isEdit ? String(multi.id) : "";
    byId("tk-multipanel-channelId").value =
      (multi && multi.channelId) ||
      (state.ticketPanels && state.ticketPanels.settings && state.ticketPanels.settings.panelChannelId) ||
      "";
    byId("tk-multipanel-useDropdown").checked = !multi || multi.useDropdown !== false;
    byId("tk-multipanel-dropdownPlaceholder").value =
      (multi && multi.dropdownPlaceholder) || "Seleziona un argomento...";
    byId("tk-multipanel-title").value = (multi && multi.title) || "";
    byId("tk-multipanel-titleUrl").value = (multi && multi.titleUrl) || "";
    byId("tk-multipanel-color").value = (multi && multi.color) || "#6f4e37";
    byId("tk-multipanel-description").value = (multi && multi.description) || "";
    byId("tk-multipanel-authorName").value = (multi && multi.authorName) || "";
    byId("tk-multipanel-authorIconUrl").value = (multi && multi.authorIconUrl) || "";
    byId("tk-multipanel-authorUrl").value = (multi && multi.authorUrl) || "";
    byId("tk-multipanel-largeImageUrl").value = (multi && multi.largeImageUrl) || "";
    byId("tk-multipanel-smallImageUrl").value = (multi && multi.smallImageUrl) || "";
    byId("tk-multipanel-footerText").value = (multi && multi.footerText) || "";
    byId("tk-multipanel-footerIconUrl").value = (multi && multi.footerIconUrl) || "";
    byId("tk-multipanel-footerTimestamp").checked = Boolean(multi && multi.footerTimestamp);
    renderMultiPanelFieldsList((multi && multi.fields) || []);
    Array.prototype.forEach.call(multiEditor ? multiEditor.querySelectorAll("details.vc-dash-tk-acc") : [], function (acc) {
      acc.setAttribute("open", "");
    });
    syncMultiPanelDropdownPlaceholderUi();
    enhanceAllDashFancySelects(multiEditor || document);

    if (!opts.skipDraft) {
      var draft = readTicketPanelsDraft();
      if (draftMatchesRoute(draft, state.ticketPanelsEditor) && draft.form) {
        applyMultiPanelFormData(draft.form);
                if (
          multi &&
          Array.isArray(multi.panelIds) &&
          multi.panelIds.length &&
          !readRoleCheckList("tk-multipanel-panelIds-list").length
        ) {
          fillMultiPanelSelectOptions(multi.panelIds, multi.optionOverrides || {});
        }
                        var savedOv =
          multi && multi.optionOverrides && typeof multi.optionOverrides === "object"
            ? multi.optionOverrides
            : {};
        if (Object.keys(savedOv).length) {
          renderMultiPanelOptionCustomizations(savedOv);
        } else {
          renderMultiPanelOptionCustomizations({});
        }
        if (
          multi &&
          multi.dropdownPlaceholder &&
          !String((byId("tk-multipanel-dropdownPlaceholder") && byId("tk-multipanel-dropdownPlaceholder").value) || "").trim()
        ) {
          byId("tk-multipanel-dropdownPlaceholder").value = multi.dropdownPlaceholder;
        }
        syncMultiPanelDropdownPlaceholderUi();
      } else {
        persistTicketPanelsDraftNow();
      }
    }
  }

  function readSinglePanelForm() {
    var emojiRaw = String((byId("tk-panel-buttonEmoji") && byId("tk-panel-buttonEmoji").value) || "").trim();
    var maxOpenRaw = String(
      (byId("tk-panel-maxOpenTicketsPerUser") && byId("tk-panel-maxOpenTicketsPerUser").value) || "",
    ).trim();
    return {
      ticketType: (function () {
        var el = byId("tk-panel-ticketType");
        if (!el) return "";
                return String(el.value || "").trim();
      })(),
      channelId: byId("tk-panel-channelId").value,
      title: byId("tk-panel-title").value,
      color: byId("tk-panel-color").value,
      content: byId("tk-panel-content").value,
      buttonText: byId("tk-panel-buttonText").value,
      buttonStyle: byId("tk-panel-buttonStyle").value,
      buttonEmoji: emojiRaw || null,
      largeImageUrl: byId("tk-panel-largeImageUrl").value || null,
      smallImageUrl: byId("tk-panel-smallImageUrl").value || null,
      disabled: Boolean(byId("tk-panel-disabled").checked),
      mentionOnOpen: readRoleCheckList("tk-panel-mentionOnOpen-list"),
      supportTeamIds: readRoleCheckList("tk-panel-supportTeamIds-list"),
      transcriptChannelId: byId("tk-panel-transcriptChannelId").value || null,
      deleteMentionsOnOpen: Boolean(byId("tk-panel-deleteMentionsOnOpen").checked),
      threadMode: false,
      threadNotificationChannelId: null,
      openCooldownSeconds: Number(byId("tk-panel-openCooldownSeconds").value) || 0,
      categoryId: byId("tk-panel-categoryId").value || null,
      maxOpenTicketsPerUser: maxOpenRaw === "" ? null : Number(maxOpenRaw),
      hideCloseButton: triStateFromSelectValue(byId("tk-panel-hideCloseButton").value),
      hideCloseReasonButton: triStateFromSelectValue(byId("tk-panel-hideCloseReasonButton").value),
      hideClaimButton: triStateFromSelectValue(byId("tk-panel-hideClaimButton").value),
      formId: byId("tk-panel-formId").value || null,
      welcome: readWelcomeForm(),
      ticketPerms: readTicketPermsForm(),
      accessRules: readAccessRulesList(),
      supportHours: readSupportHoursForm(),
            publish: false,
      syncExisting: true,
    };
  }

  function readMultiPanelForm() {
    return {
      channelId: byId("tk-multipanel-channelId").value,
      panelIds: readRoleCheckList("tk-multipanel-panelIds-list"),
      useDropdown: Boolean(byId("tk-multipanel-useDropdown").checked),
      dropdownPlaceholder: byId("tk-multipanel-dropdownPlaceholder").value,
      title: byId("tk-multipanel-title").value,
      titleUrl: byId("tk-multipanel-titleUrl").value || null,
      color: byId("tk-multipanel-color").value,
      description: byId("tk-multipanel-description").value,
      authorName: byId("tk-multipanel-authorName").value || null,
      authorIconUrl: byId("tk-multipanel-authorIconUrl").value || null,
      authorUrl: byId("tk-multipanel-authorUrl").value || null,
      largeImageUrl: byId("tk-multipanel-largeImageUrl").value || null,
      smallImageUrl: byId("tk-multipanel-smallImageUrl").value || null,
      footerText: byId("tk-multipanel-footerText").value || null,
      footerIconUrl: byId("tk-multipanel-footerIconUrl").value || null,
      footerTimestamp: Boolean(byId("tk-multipanel-footerTimestamp") && byId("tk-multipanel-footerTimestamp").checked),
      fields: readMultiPanelFieldsList(),
      optionOverrides: readMultiPanelOptionOverrides(),
            publish: false,
      syncExisting: true,
    };
  }

  async function saveSinglePanelForm(ev) {
    if (ev) ev.preventDefault();
    if (state.ticketPanelsSaving) return;
    state.ticketPanelsSaving = true;
    try {
      var id = String((byId("tk-panel-id") && byId("tk-panel-id").value) || "").trim();
      var body = readSinglePanelForm();
      if (!String(body.ticketType || "").trim()) body.ticketType = "supporto";
      var out = id
        ? await ticketPanelsApi("/panels/" + encodeURIComponent(id), "PATCH", body)
        : await ticketPanelsApi("/panels", "POST", body);
      if (!out.res.ok || !out.data || out.data.ok === false) {
        showSaveToast((out.data && out.data.message) || "Salvataggio fallito.", true);
        return;
      }
      if (out.data.publishWarning) showSaveToast(out.data.publishWarning, true);
      else showSaveToast(id ? "Pannello aggiornato." : "Pannello creato.");
      clearTicketPanelsDraft();
      await refreshTicketPanels({ silent: true });
      showTicketPanelsList();
    } catch (_) {
      showSaveToast("Salvataggio fallito.", true);
    } finally {
      state.ticketPanelsSaving = false;
    }
  }

  async function saveMultiPanelForm(ev) {
    if (ev) ev.preventDefault();
    if (state.ticketPanelsSaving) return;
    state.ticketPanelsSaving = true;
    try {
      var id = String((byId("tk-multipanel-id") && byId("tk-multipanel-id").value) || "").trim();
      var body = readMultiPanelForm();
      if (!body.panelIds || body.panelIds.length < 2) {
        showSaveToast("Seleziona almeno 2 pannelli.", true);
        return;
      }
      var out = id
        ? await ticketPanelsApi("/multipanels/" + encodeURIComponent(id), "PATCH", body)
        : await ticketPanelsApi("/multipanels", "POST", body);
      if (!out.res.ok || !out.data || out.data.ok === false) {
        showSaveToast((out.data && out.data.message) || "Salvataggio fallito.", true);
        return;
      }
      if (out.data.publishWarning) showSaveToast(out.data.publishWarning, true);
      else showSaveToast(id ? "Multi-panel aggiornato." : "Multi-panel creato.");
      clearTicketPanelsDraft();
      await refreshTicketPanels({ silent: true });
      showTicketPanelsList();
    } catch (_) {
      showSaveToast("Salvataggio fallito.", true);
    } finally {
      state.ticketPanelsSaving = false;
    }
  }

  function wireTicketsUi() {
    if (wireTicketsUi.__wired) return;
    wireTicketsUi.__wired = true;
    wireTicketTeamsUi();
    wireTicketFormsUi();
    wireTicketBlacklistUi();
    var saveBtn = byId("tk-save-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        saveTickets();
      });
    }
    ["tk-tx-ticketId", "tk-tx-username", "tk-tx-userId", "tk-tx-closedBy", "tk-tx-closeReason", "tk-tx-claimedBy"].forEach(
      function (id) {
        var el = byId(id);
        if (!el) return;
        el.addEventListener("input", function () {
          scheduleTranscriptsFilterRefresh();
        });
        el.addEventListener("blur", function () {
          if (state.transcriptsFilterTimer) flushTranscriptsFilterRefresh();
        });
        el.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") {
            ev.preventDefault();
            flushTranscriptsFilterRefresh();
          }
        });
      },
    );
    ["tk-tx-panel", "tk-tx-rating"].forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.addEventListener("change", function () {
        flushTranscriptsFilterRefresh();
      });
    });
    var txFirst = byId("tk-tx-first");
    if (txFirst) {
      txFirst.addEventListener("click", function () {
        state.transcriptsOffset = 0;
        refreshTranscriptsList({ silent: true });
      });
    }
    var txPrev = byId("tk-tx-prev");
    if (txPrev) {
      txPrev.addEventListener("click", function () {
        state.transcriptsOffset = Math.max(
          0,
          Number(state.transcriptsOffset || 0) - Number(state.transcriptsPageSize || 25),
        );
        refreshTranscriptsList({ silent: true });
      });
    }
    var txNext = byId("tk-tx-next");
    if (txNext) {
      txNext.addEventListener("click", function () {
        state.transcriptsOffset =
          Number(state.transcriptsOffset || 0) + Number(state.transcriptsPageSize || 25);
        refreshTranscriptsList({ silent: true });
      });
    }
    var txLast = byId("tk-tx-last");
    if (txLast) {
      txLast.addEventListener("click", function () {
        var size = Number(state.transcriptsPageSize || 25);
        var total = Number(state.transcriptsTotal || 0);
        var lastPage = Math.max(1, Math.ceil(total / size) || 1);
        state.transcriptsOffset = Math.max(0, (lastPage - 1) * size);
        refreshTranscriptsList({ silent: true });
      });
    }

    ["tk-open-ticketId", "tk-open-username", "tk-open-userId", "tk-open-claimedBy"].forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.addEventListener("input", function () {
        scheduleOpenTicketsFilterRefresh();
      });
      el.addEventListener("blur", function () {
        flushOpenTicketsFilterRefresh();
      });
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          flushOpenTicketsFilterRefresh();
        }
      });
    });
    ["tk-open-sort", "tk-open-panel"].forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.addEventListener("change", function () {
        flushOpenTicketsFilterRefresh();
      });
    });
    var mineToggle = byId("tk-open-mineOrUnclaimed");
    if (mineToggle) {
      mineToggle.addEventListener("change", function () {
        flushOpenTicketsFilterRefresh();
      });
    }
    var openFirst = byId("tk-open-first");
    if (openFirst) {
      openFirst.addEventListener("click", function () {
        state.openTicketsOffset = 0;
        refreshOpenTicketsList({ silent: true });
      });
    }
    var openPrev = byId("tk-open-prev");
    if (openPrev) {
      openPrev.addEventListener("click", function () {
        state.openTicketsOffset = Math.max(
          0,
          Number(state.openTicketsOffset || 0) - Number(state.openTicketsPageSize || 30),
        );
        refreshOpenTicketsList({ silent: true });
      });
    }
    var openNext = byId("tk-open-next");
    if (openNext) {
      openNext.addEventListener("click", function () {
        state.openTicketsOffset =
          Number(state.openTicketsOffset || 0) + Number(state.openTicketsPageSize || 30);
        refreshOpenTicketsList({ silent: true });
      });
    }
    var openLast = byId("tk-open-last");
    if (openLast) {
      openLast.addEventListener("click", function () {
        var size = Number(state.openTicketsPageSize || 30);
        var total = Number(state.openTicketsTotal || 0);
        var lastPage = Math.max(1, Math.ceil(total / size) || 1);
        state.openTicketsOffset = Math.max(0, (lastPage - 1) * size);
        refreshOpenTicketsList({ silent: true });
      });
    }

    var txBody = byId("tk-tx-body");
    if (txBody && !txBody.__vcTxOpenWired) {
      txBody.__vcTxOpenWired = true;
      txBody.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-tk-tx-open]") : null;
        if (!btn || btn.disabled) return;
        openTranscriptRow(btn.getAttribute("data-tk-tx-open"));
      });
    }
    var txBack = byId("tk-tx-viewer-back");
    if (txBack && !txBack.__vcWired) {
      txBack.__vcWired = true;
      txBack.addEventListener("click", function () {
        closeTranscriptViewer();
      });
    }
    var toggle = byId("vc-dashboard-sidebar-tickets-toggle");
    var group = byId("vc-dashboard-sidebar-tickets");
    if (toggle && group && !toggle.__vcTkWired) {
            toggle.__vcTkWired = true;
    }

    var newPanelBtn = byId("tk-panels-new-btn");
    if (newPanelBtn && !newPanelBtn.__vcNewPanelWired) {
      newPanelBtn.__vcNewPanelWired = true;
      newPanelBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        clearTicketPanelsDraft();
        openSinglePanelEditor(null);
      });
    }
    var newMultiBtn = byId("tk-multipanels-new-btn");
    if (newMultiBtn) {
      newMultiBtn.addEventListener("click", function () {
        openMultiPanelEditor(null);
      });
    }
    var backPanel = byId("tk-panel-editor-back");
    if (backPanel) backPanel.addEventListener("click", showTicketPanelsList);
    var backMulti = byId("tk-multipanel-editor-back");
    if (backMulti) backMulti.addEventListener("click", showTicketPanelsList);
    var panelForm = byId("tk-panel-form");
    if (panelForm) panelForm.addEventListener("submit", saveSinglePanelForm);
    wireTicketPanelButtonEmojiUi();
    wireMultiPanelOptcustEmojiUi();
    var multiForm = byId("tk-multipanel-form");
    if (multiForm) multiForm.addEventListener("submit", saveMultiPanelForm);
    var useDropdownToggle = byId("tk-multipanel-useDropdown");
    if (useDropdownToggle && !useDropdownToggle.__vcPlaceholderWired) {
      useDropdownToggle.__vcPlaceholderWired = true;
      useDropdownToggle.addEventListener("change", syncMultiPanelDropdownPlaceholderUi);
    }

    if (!document.__vcTkPanelDraftWired) {
      document.__vcTkPanelDraftWired = true;
      function onDraftEvent(ev) {
        var t = ev.target;
        if (!t) return;
        if (
          (t.closest && t.closest("#tk-panel-form")) ||
          (t.closest && t.closest("#tk-multipanel-form")) ||
          (t.closest && t.closest("#tk-panel-mentionOnOpen-list")) ||
          (t.closest && t.closest("#tk-panel-supportTeamIds-list")) ||
          (t.closest && t.closest("#tk-multipanel-panelIds-list"))
        ) {
          scheduleTicketPanelsDraftSave();
        }
      }
      document.addEventListener("input", onDraftEvent, true);
      document.addEventListener("change", onDraftEvent, true);
      window.addEventListener("beforeunload", function () {
        persistTicketPanelsDraftNow();
      });
      window.addEventListener("pagehide", function () {
        persistTicketPanelsDraftNow();
      });
    }

    var addFieldBtn = byId("tk-panel-welcome-fields-add");
    if (addFieldBtn) {
      addFieldBtn.addEventListener("click", function () {
        var current = readWelcomeFieldsList();
        if (current.length >= 25) return;
        current.push({ name: "", value: "", inline: false });
        renderWelcomeFieldsList(current);
      });
    }
    var insertMentionsBtn = byId("tk-panel-welcome-insert-mentions");
    if (insertMentionsBtn) {
      insertMentionsBtn.addEventListener("click", function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        insertSelectedRoleMentionsIntoWelcome();
      });
    }
    var fieldsList = byId("tk-panel-welcome-fields-list");
    if (fieldsList) {
      fieldsList.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-tk-field-remove") : null;
        if (!btn) return;
        var row = btn.closest(".vc-dash-tk-field-row");
        if (row) row.remove();
      });
    }

    var addMultiFieldBtn = byId("tk-multipanel-fields-add");
    if (addMultiFieldBtn) {
      addMultiFieldBtn.addEventListener("click", function () {
        var current = readMultiPanelFieldsList();
        if (current.length >= 25) return;
        current.push({ name: "", value: "", inline: false });
        renderMultiPanelFieldsList(current);
      });
    }
    var multiFieldsList = byId("tk-multipanel-fields-list");
    if (multiFieldsList) {
      multiFieldsList.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-tk-field-remove") : null;
        if (!btn) return;
        var row = btn.closest(".vc-dash-tk-field-row");
        if (row) row.remove();
      });
    }

    var addRuleBtn = byId("tk-panel-accessRules-add");
    if (addRuleBtn) {
      addRuleBtn.addEventListener("click", function () {
        var current = readAccessRulesList();
        if (current.length >= 25) return;
        current.push({ roleId: "everyone", allow: true });
        renderAccessRulesList(current);
      });
    }
    var rulesList = byId("tk-panel-accessRules-list");
    if (rulesList) {
      rulesList.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-tk-rule-remove") : null;
        if (!btn) return;
        var row = btn.closest(".vc-dash-tk-rule-row");
        if (row) row.remove();
      });
    }

    var permsGrid = byId("tk-panel-ticketPerms-grid");
    if (permsGrid && !permsGrid.__vcPermsWired) {
      permsGrid.__vcPermsWired = true;
      permsGrid.addEventListener("change", function (ev) {
        var input = ev.target;
        if (!input || !input.matches || !input.matches('input[type="checkbox"][id^="tk-panel-perm-"]')) return;
                var draft = { replace: true };
        TICKET_PANEL_PERM_KEYS.forEach(function (key) {
          var el = byId("tk-panel-perm-" + key);
          draft[key] = Boolean(el && el.checked);
        });
        fillTicketPermsForm(draft);
      });
    }

    var hoursDays = byId("tk-panel-supportHours-days");
    if (hoursDays && !hoursDays.__vcHoursWired) {
      hoursDays.__vcHoursWired = true;
      hoursDays.addEventListener("change", function (ev) {
        var input = ev.target;
        if (!input || !input.matches) return;
        var row = input.closest(".vc-dash-tk-hours-day");
        if (!row) return;
        var day = row.getAttribute("data-day");
        if (!day) return;
        if (input.matches('[id$="-enabled"]')) {
          var allDayEl = byId("tk-panel-supportHours-" + day + "-allDay");
          if (input.checked) {
                        if (allDayEl) allDayEl.checked = false;
            var startEl = byId("tk-panel-supportHours-" + day + "-start");
            var endEl = byId("tk-panel-supportHours-" + day + "-end");
            if (startEl && !startEl.value) startEl.value = "09:00";
            if (endEl && !endEl.value) endEl.value = "17:00";
          } else if (allDayEl) {
            allDayEl.checked = true;
          }
        }
        syncSupportHoursUi();
      });
    }
    var hoursTz = byId("tk-panel-supportHours-timezone");
    if (hoursTz && !hoursTz.__vcHoursTzWired) {
      hoursTz.__vcHoursTzWired = true;
      hoursTz.addEventListener("change", function () {
        syncSupportHoursUi();
      });
    }
    var hoursCopy = byId("tk-panel-supportHours-copyWeekdays");
    if (hoursCopy && !hoursCopy.__vcWired) {
      hoursCopy.__vcWired = true;
      hoursCopy.addEventListener("click", function () {
        var mon = {
          enabled: Boolean((byId("tk-panel-supportHours-monday-enabled") || {}).checked),
          allDay: Boolean((byId("tk-panel-supportHours-monday-allDay") || {}).checked),
          start: (byId("tk-panel-supportHours-monday-start") || {}).value || "09:00",
          end: (byId("tk-panel-supportHours-monday-end") || {}).value || "17:00",
        };
        ["tuesday", "wednesday", "thursday", "friday"].forEach(function (day) {
          applySupportHoursDay(day, mon);
        });
        syncSupportHoursUi();
      });
    }
    var hoursBusiness = byId("tk-panel-supportHours-business");
    if (hoursBusiness && !hoursBusiness.__vcWired) {
      hoursBusiness.__vcWired = true;
      hoursBusiness.addEventListener("click", function () {
        TICKET_PANEL_SUPPORT_HOURS_DAYS.forEach(function (day) {
          var isWeekday = day !== "saturday" && day !== "sunday";
          applySupportHoursDay(day, {
            enabled: isWeekday,
            allDay: false,
            start: "09:00",
            end: "17:00",
          });
        });
        syncSupportHoursUi();
      });
    }
    var hoursClear = byId("tk-panel-supportHours-clear");
    if (hoursClear && !hoursClear.__vcWired) {
      hoursClear.__vcWired = true;
      hoursClear.addEventListener("click", function () {
        TICKET_PANEL_SUPPORT_HOURS_DAYS.forEach(function (day) {
          applySupportHoursDay(day, { enabled: false, allDay: true, start: "09:00", end: "17:00" });
        });
        syncSupportHoursUi();
      });
    }
    if (!window.__vcSupportHoursClock) {
      window.__vcSupportHoursClock = setInterval(function () {
        if (!byId("tk-panel-supportHours-status")) return;
        syncSupportHoursUi();
      }, 30000);
    }
    var panelsBody = byId("tk-panels-body");
    if (panelsBody && !panelsBody.__vcPanelsWired) {
      panelsBody.__vcPanelsWired = true;
      panelsBody.addEventListener("click", async function (ev) {
        var t = ev.target && ev.target.closest ? ev.target.closest("[data-tk-panel-edit],[data-tk-panel-publish],[data-tk-panel-delete]") : null;
        if (!t) return;
        var editId = t.getAttribute("data-tk-panel-edit");
        var pubId = t.getAttribute("data-tk-panel-publish");
        var delId = t.getAttribute("data-tk-panel-delete");
        if (editId) {
          var panel = ((state.ticketPanels && state.ticketPanels.singles) || []).find(function (p) {
            return String(p.id) === String(editId);
          });
          openSinglePanelEditor(panel || null);
          return;
        }
        if (pubId) {
          var pout = await ticketPanelsApi("/panels/" + encodeURIComponent(pubId) + "/publish", "POST", {
            forceNew: true,
          });
          if (!pout.res.ok || !pout.data || pout.data.ok === false) {
            showSaveToast((pout.data && pout.data.message) || "Invio fallito.", true);
            return;
          }
          showSaveToast("Pannello inviato.");
          refreshTicketPanels({ silent: true });
          return;
        }
        if (delId) {
          var delOk = await (typeof window.__vcEnsureDialog === "function"
            ? window.__vcEnsureDialog()
            : Promise.resolve(window.VcDialog)
          ).then(function (D) {
            if (!D || typeof D.confirm !== "function") return false;
            return D.confirm({
                title: i18n("dash.tickets.panelDeleteTitle", "Eliminare il pannello?"),
                message: i18n(
                  "dash.tickets.panelConfirmDelete",
                  "Eliminare questo pannello? L'operazione non si può annullare.",
                ),
                confirmLabel: i18n("dash.tickets.panelDeleteOk", "Elimina pannello"),
                cancelLabel: i18n("dash.bl.cancel", "Annulla"),
                danger: true,
                icon: "fa-trash-o",
              });
          });
          if (!delOk) return;
          var dout = await ticketPanelsApi("/panels/" + encodeURIComponent(delId), "DELETE");
          if (!dout.res.ok || !dout.data || dout.data.ok === false) {
            showSaveToast((dout.data && dout.data.message) || "Eliminazione fallita.", true);
            return;
          }
          showSaveToast("Pannello eliminato.");
          refreshTicketPanels({ silent: true });
        }
      });
    }
    var multiBody = byId("tk-multipanels-body");
    if (multiBody && !multiBody.__vcMultiWired) {
      multiBody.__vcMultiWired = true;
      multiBody.addEventListener("click", async function (ev) {
        var t = ev.target && ev.target.closest ? ev.target.closest("[data-tk-multi-edit],[data-tk-multi-publish],[data-tk-multi-delete]") : null;
        if (!t) return;
        var editId = t.getAttribute("data-tk-multi-edit");
        var pubId = t.getAttribute("data-tk-multi-publish");
        var delId = t.getAttribute("data-tk-multi-delete");
        if (editId) {
          var multi = ((state.ticketPanels && state.ticketPanels.multis) || []).find(function (m) {
            return String(m.id) === String(editId);
          });
          openMultiPanelEditor(multi || null);
          return;
        }
        if (pubId) {
          var pout = await ticketPanelsApi("/multipanels/" + encodeURIComponent(pubId) + "/publish", "POST", {
            forceNew: true,
          });
          if (!pout.res.ok || !pout.data || pout.data.ok === false) {
            showSaveToast((pout.data && pout.data.message) || "Invio fallito.", true);
            return;
          }
          showSaveToast("Multi-panel inviato.");
          refreshTicketPanels({ silent: true });
          return;
        }
        if (delId) {
          var delOk = await (typeof window.__vcEnsureDialog === "function"
            ? window.__vcEnsureDialog()
            : Promise.resolve(window.VcDialog)
          ).then(function (D) {
            if (!D || typeof D.confirm !== "function") return false;
            return D.confirm({
                title: i18n("dash.tickets.multiDeleteTitle", "Eliminare il multi-panel?"),
                message: i18n(
                  "dash.tickets.multiConfirmDelete",
                  "Eliminare questo multi-panel? L'operazione non si può annullare.",
                ),
                confirmLabel: i18n("dash.tickets.multiDeleteOk", "Elimina multi-panel"),
                cancelLabel: i18n("dash.bl.cancel", "Annulla"),
                danger: true,
                icon: "fa-trash-o",
              });
          });
          if (!delOk) return;
          var dout = await ticketPanelsApi("/multipanels/" + encodeURIComponent(delId), "DELETE");
          if (!dout.res.ok || !dout.data || dout.data.ok === false) {
            showSaveToast((dout.data && dout.data.message) || "Eliminazione fallita.", true);
            return;
          }
          showSaveToast("Multi-panel eliminato.");
          refreshTicketPanels({ silent: true });
        }
      });
    }
  }


  G.loadTickets = loadTickets;
  G.wireTicketsUi = wireTicketsUi;
  G._ticketsReady = true;
  if (typeof G._flushTicketsQueue === "function") G._flushTicketsQueue();
})(window.__VC_DG);
