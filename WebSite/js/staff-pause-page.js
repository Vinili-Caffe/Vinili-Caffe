(function () {
  var MONTH_NAMES = [
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
  var WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  var state = {
    year: 0,
    month: 0,
    payload: null,
    selectedDay: "",
    me: null,
    selectedRole: "",
    requestOpen: false,
    requestBusy: false,
    pauseWs: null,
    pauseWsReconnectTimer: null,
    pauseWsRefreshTimer: null,
    pendingChatKey: "",
  };

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
    return s && !/\{\{/.test(s) ? s : "";
  }

  function pauseApiBase() {
    var c = window.__VC_STAFF_PAUSE || {};
    var local = cfgValueOrEmpty(c.apiUrlLocal);
    var base = isLocalOrigin() && local ? local : cfgValueOrEmpty(c.apiUrl) || "/webhooks/site-staff-pause";
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

  function pauseApiUrl(year, month) {
    var base = pauseApiBase();
    var sep = base.indexOf("?") >= 0 ? "&" : "?";
    return base + sep + "year=" + encodeURIComponent(year) + "&month=" + encodeURIComponent(month);
  }

  function pauseRealtimeWsUrl() {
    var c = window.__VC_STAFF_PAUSE || {};
    var explicit = cfgValueOrEmpty(c.wsUrl);
    if (explicit) return explicit;
    var api = pauseApiBase();
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
    } catch (e) {
      return "";
    }
  }

  function disconnectPauseWebSocket() {
    if (state.pauseWsReconnectTimer) {
      clearTimeout(state.pauseWsReconnectTimer);
      state.pauseWsReconnectTimer = null;
    }
    try {
      if (state.pauseWs) {
        state.pauseWs.onclose = null;
        state.pauseWs.close();
      }
    } catch (e2) {}
    state.pauseWs = null;
  }

  function schedulePauseWsReconnect() {
    if (state.pauseWsReconnectTimer) return;
    state.pauseWsReconnectTimer = setTimeout(function () {
      state.pauseWsReconnectTimer = null;
      connectPauseWebSocket();
    }, 8000);
  }

  function applyMonthPayload(out, quiet) {
    if (!out || !out.res) {
      if (!quiet) setStatus("Errore di rete nel caricamento pause.", true);
      return;
    }
    if (!out.res.ok || !out.data || !out.data.ok) {
      if (!quiet) {
        setStatus((out.data && out.data.message) || "Impossibile caricare le pause.", true);
        state.payload = { days: {}, pauses: [], today: "" };
        renderCalendar();
        renderSidebar();
      }
      return;
    }
    state.payload = out.data;
    applyRequestMeta(out.data.me);
    var count = Number(out.data.count || 0);
    setStatus(
      count === 0
        ? "Nessuna pausa accettata in questo mese."
        : count === 1
          ? "1 pausa in questo mese."
          : count + " pause in questo mese.",
      false,
    );
    renderCalendar();
    renderSidebar();
    if (state.selectedDay) renderDayDetail(state.selectedDay);
  }

  function refreshMonthQuiet() {
    if (!pageInited || !state.year || !state.month) return;
    if (state.requestBusy) return;
    monthFetchKey = "";
    monthFetchPromise = null;
    var y = state.year;
    var m = state.month;
    prefetchMonth(y, m).then(function (out) {
      if (state.year !== y || state.month !== m) return;
      monthFetchPromise = null;
      applyMonthPayload(out, true);
    });
  }

  function scheduleRefreshFromRealtime() {
    if (state.pauseWsRefreshTimer) clearTimeout(state.pauseWsRefreshTimer);
    state.pauseWsRefreshTimer = setTimeout(function () {
      state.pauseWsRefreshTimer = null;
      refreshMonthQuiet();
    }, 250);
  }

  function connectPauseWebSocket() {
    if (typeof WebSocket === "undefined") return;
    var url = pauseRealtimeWsUrl();
    if (!url) return;
    if (state.pauseWsReconnectTimer) {
      clearTimeout(state.pauseWsReconnectTimer);
      state.pauseWsReconnectTimer = null;
    }
    try {
      if (state.pauseWs) {
        state.pauseWs.onclose = null;
        state.pauseWs.close();
      }
    } catch (e3) {}
    state.pauseWs = null;
    try {
      var ws = new WebSocket(url);
      state.pauseWs = ws;
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || ""));
          if (!data) return;
          if (data.type === "staff_pauses_changed") {
            scheduleRefreshFromRealtime();
            return;
          }
          if (
            data.type === "staff_workflow_changed" &&
            String(data.queue || "").toLowerCase() === "pause"
          ) {
            scheduleRefreshFromRealtime();
          }
        } catch (e4) {}
      };
      ws.onclose = function () {
        state.pauseWs = null;
        schedulePauseWsReconnect();
      };
      ws.onerror = function () {
        try {
          ws.close();
        } catch (e5) {}
      };
    } catch (e6) {
      schedulePauseWsReconnect();
    }
  }

  function getToken() {
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      if (!t) return "";
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function isoDay(y, m, d) {
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

    function mondayIndexFirst(y, m) {
    var dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return (dow + 6) % 7;
  }

  function phaseLabel(phase) {
    if (phase === "cancelled") return "Annullata";
    if (phase === "planned") return "Programmata";
    if (phase === "ended") return "Finita";
    return "In corso";
  }
  
  function phaseLabelCurrent(phase) {
    if (phase === "cancelled") return "Stato: annullata";
    if (phase === "planned") return "Stato: programmata";
    if (phase === "ended") return "Stato: finita";
    return "Stato: in corso";
  }

  function parseDisplayDate(s) {
    var m = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  }

  function parseIsoDay(s) {
    var m = String(s || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }

  function phaseOnCalendarDay(startStr, endStr, dayIso) {
    var start = parseDisplayDate(startStr) || parseIsoDay(startStr);
    var end = parseDisplayDate(endStr) || parseIsoDay(endStr);
    var day = parseIsoDay(dayIso);
    if (!start || !end || !day) return "active";
    if (day < start) return "planned";
    if (day > end) return "ended";
    return "active";
  }

  function setStatus(text, isError) {
    var el = byId("vc-staff-pause-status");
    if (el) {
      el.textContent = "";
      el.hidden = true;
      el.classList.remove("vc-staff-pause-status--error");
    }
    var msg = String(text || "").trim();
    if (window.VcSiteToast) {
      if (!msg) window.VcSiteToast.hide();
      else window.VcSiteToast.show(msg, Boolean(isError));
      return;
    }
    if (window.VCStaffTools && window.VCStaffTools.showStaffToast) {
      window.VCStaffTools.showStaffToast(msg, Boolean(isError));
      return;
    }
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
    el.classList.toggle("vc-staff-pause-status--error", Boolean(isError));
  }

  function syncSidePanelHeight() {
    var cal = document.querySelector(".vc-staff-cal-panel");
    var side = document.querySelector(".vc-staff-side-panel");
    if (!cal || !side) return;
    if (window.matchMedia && window.matchMedia("(max-width: 980px)").matches) {
      side.style.height = "";
      side.style.maxHeight = "";
      return;
    }
    var h = Math.round(cal.getBoundingClientRect().height);
    if (h < 80) return;
    side.style.height = h + "px";
    side.style.maxHeight = h + "px";
  }

  function afterRenderLayout() {
    requestAnimationFrame(function () {
      syncSidePanelHeight();
    });
  }

  function renderMonthLabel() {
    var el = byId("vc-staff-cal-label");
    if (!el) return;
    el.textContent = MONTH_NAMES[state.month - 1] + " " + state.year;
  }

  function renderWeekdayHeader(grid) {
    for (var i = 0; i < WEEKDAYS.length; i += 1) {
      var h = document.createElement("div");
      h.className = "vc-staff-cal__weekday";
      h.textContent = WEEKDAYS[i];
      grid.appendChild(h);
    }
  }

  function pickPrimaryPhase(entries) {
    var hasActive = false;
    var hasPlanned = false;
    for (var i = 0; i < entries.length; i += 1) {
      var p = String(entries[i].phase || "");
      if (p === "active") hasActive = true;
      else if (p === "planned") hasPlanned = true;
    }
    if (hasActive) return "active";
    if (hasPlanned) return "planned";
    return "ended";
  }

  function renderDayDetail(dayKey) {
    var panel = byId("vc-staff-day-detail");
    var title = byId("vc-staff-day-detail-title");
    var list = byId("vc-staff-day-detail-list");
    if (!panel || !list) return;

    state.selectedDay = dayKey || "";
    if (!dayKey) {
      panel.setAttribute("hidden", "");
      list.innerHTML = "";
      afterRenderLayout();
      return;
    }

    var entries = (state.payload && state.payload.days && state.payload.days[dayKey]) || [];
    var parts = dayKey.split("-");
    var nice = parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : dayKey;
    if (title) title.textContent = "Pause del " + nice;

    if (!entries.length) {
      list.innerHTML = '<p class="vc-staff-day-detail__empty">Nessuno staffer in pausa in questo giorno.</p>';
      panel.removeAttribute("hidden");
      afterRenderLayout();
      return;
    }

    var html = "";
    for (var i = 0; i < entries.length; i += 1) {
      var e = entries[i];
      var onDay = phaseOnCalendarDay(e.start, e.end, dayKey);
      var onDayText =
        onDay === "active"
          ? "Quel giorno: in pausa"
          : onDay === "planned"
            ? "Quel giorno: non ancora iniziata"
            : "Quel giorno: già terminata";
      var avatar = e.avatarUrl
        ? '<img class="vc-staff-day-detail__avatar" src="' +
          esc(e.avatarUrl) +
          '" alt="" width="40" height="40" loading="lazy" />'
        : '<span class="vc-staff-day-detail__avatar vc-staff-day-detail__avatar--fallback" aria-hidden="true"></span>';
      html +=
        '<article class="vc-staff-day-detail__card vc-staff-day-detail__card--' +
        esc(e.phase || "active") +
        '">' +
        avatar +
        '<div class="vc-staff-day-detail__meta">' +
        '<p class="vc-staff-day-detail__name">' +
        esc((window.VCStaffTools && VCStaffTools.userLabel ? VCStaffTools.userLabel(e.displayName, e.userId) : e.displayName) || "Utente") +
        "</p>" +
        '<p class="vc-staff-day-detail__range">' +
        "Periodo: " +
        esc(e.start) +
        " \u2192 " +
        esc(e.end) +
        "</p>" +
        '<p class="vc-staff-day-detail__phase">' +
        esc(onDayText) +
        "</p>" +
        '<p class="vc-staff-day-detail__phase">' +
        esc(phaseLabelCurrent(e.phase)) +
        (e.ruolo ? " \u00B7 " + esc(e.ruolo) : "") +
        "</p>" +
        "</div></article>";
    }
    list.innerHTML = html;
    panel.removeAttribute("hidden");
    afterRenderLayout();
  }

  function renderSidebar() {
    var list = byId("vc-staff-pause-list");
    if (!list) return;
    var pauses = (state.payload && state.payload.pauses) || [];
    if (!pauses.length) {
      list.innerHTML = '<p class="vc-staff-pause-list__empty">Nessuna pausa in questo mese.</p>';
      afterRenderLayout();
      return;
    }
    var html = "";
    for (var i = 0; i < pauses.length; i += 1) {
      var p = pauses[i];
      var cancelled = Boolean(p.cancelled) || String(p.status || "") === "cancelled" || String(p.phase || "") === "cancelled";
      var phase = cancelled ? "cancelled" : p.phase || "active";
      var statusText = cancelled
        ? "Stato: annullata"
        : phaseLabelCurrent(phase);
      html +=
        '<article class="vc-staff-pause-list__item vc-staff-pause-list__item--' +
        esc(phase) +
        (cancelled ? " is-cancelled" : "") +
        '">' +
        '<div class="vc-staff-pause-list__bookmark" aria-hidden="true"></div>' +
        '<div class="vc-staff-pause-list__body">' +
        '<p class="vc-staff-pause-list__name">' +
        esc(p.displayName) +
        "</p>" +
        '<p class="vc-staff-pause-list__range">' +
        esc(p.start) +
        " \u2192 " +
        esc(p.end) +
        "</p>" +
        '<p class="vc-staff-pause-list__phase">' +
        esc(statusText) +
        (p.ruolo ? " \u00B7 " + esc(p.ruolo) : "") +
        "</p>" +
        (p.motivazione
          ? '<p class="vc-staff-pause-list__reason">' + esc(p.motivazione) + "</p>"
          : "") +
        "</div></article>";
    }
    list.innerHTML = html;
    afterRenderLayout();
  }

  function renderCalendar() {
    var grid = byId("vc-staff-cal-grid");
    if (!grid) return;
    grid.innerHTML = "";
    renderWeekdayHeader(grid);

    var y = state.year;
    var m = state.month;
    var total = daysInMonth(y, m);
    var offset = mondayIndexFirst(y, m);
    var today = (state.payload && state.payload.today) || "";
    var daysMap = (state.payload && state.payload.days) || {};

    for (var i = 0; i < offset; i += 1) {
      var blank = document.createElement("div");
      blank.className = "vc-staff-cal__day vc-staff-cal__day--muted";
      blank.setAttribute("aria-hidden", "true");
      grid.appendChild(blank);
    }

    for (var d = 1; d <= total; d += 1) {
      var key = isoDay(y, m, d);
      var entries = daysMap[key] || [];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-staff-cal__day";
      btn.setAttribute("data-day", key);
      btn.setAttribute("aria-label", "Giorno " + d + (entries.length ? ", " + entries.length + " in pausa" : ""));

      if (key === today) btn.classList.add("vc-staff-cal__day--today");
      if (key === state.selectedDay) btn.classList.add("vc-staff-cal__day--selected");
      if (entries.length) {
        btn.classList.add("vc-staff-cal__day--marked");
        btn.classList.add("vc-staff-cal__day--" + pickPrimaryPhase(entries));
      }

      var num = document.createElement("span");
      num.className = "vc-staff-cal__num";
      num.textContent = String(d);
      btn.appendChild(num);

      if (entries.length) {
        var mark = document.createElement("span");
        mark.className = "vc-staff-cal__bookmark";
        mark.setAttribute("aria-hidden", "true");
        btn.appendChild(mark);

        var chips = document.createElement("span");
        chips.className = "vc-staff-cal__chips";
        var maxShow = Math.min(3, entries.length);
        for (var c = 0; c < maxShow; c += 1) {
          var chip = document.createElement("span");
          chip.className = "vc-staff-cal__chip";
          chip.title = String(entries[c].displayName || "");
          if (entries[c].avatarUrl) {
            chip.style.backgroundImage = 'url("' + String(entries[c].avatarUrl).replace(/"/g, "") + '")';
          }
          chips.appendChild(chip);
        }
        if (entries.length > 3) {
          var more = document.createElement("span");
          more.className = "vc-staff-cal__more";
          more.textContent = "+" + (entries.length - 3);
          chips.appendChild(more);
        }
        btn.appendChild(chips);
      }

      btn.addEventListener("click", function (ev) {
        var day = ev.currentTarget.getAttribute("data-day");
        renderDayDetail(day);
        var nodes = grid.querySelectorAll(".vc-staff-cal__day--selected");
        for (var n = 0; n < nodes.length; n += 1) nodes[n].classList.remove("vc-staff-cal__day--selected");
        ev.currentTarget.classList.add("vc-staff-cal__day--selected");
      });

      grid.appendChild(btn);
    }
    afterRenderLayout();
  }

  function currentRomeYearMonth() {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth() + 1;
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
      if (py && pm) {
        y = Number(py.value);
        m = Number(pm.value);
      }
    } catch (eTz) {}
    return { year: y, month: m };
  }

  var monthFetchPromise = null;
  var monthFetchKey = "";

  function prefetchMonth(year, month) {
    var key = year + "-" + month;
    if (monthFetchKey === key && monthFetchPromise) return monthFetchPromise;
    var token = getToken();
    if (!token) return Promise.resolve(null);
    monthFetchKey = key;
    monthFetchPromise = pauseChatFetchJson(pauseApiUrl(year, month), { timeoutMs: 30000 }).catch(function () {
      return null;
    });
    return monthFetchPromise;
  }

  function setRequestFeedback(text, kind) {
    var el = byId("vc-staff-request-feedback");
    if (!el) return;
    el.textContent = String(text || "");
    el.classList.toggle("is-error", kind === "error");
    el.classList.toggle("is-ok", kind === "ok");
  }

  function setRequestOpen(open) {
    state.requestOpen = Boolean(open);
    var root = byId("vc-staff-request");
    var body = byId("vc-staff-request-body");
    var toggle = byId("vc-staff-request-toggle");
    if (!root || !body || !toggle) return;
    root.classList.toggle("is-open", state.requestOpen);
    toggle.setAttribute("aria-expanded", state.requestOpen ? "true" : "false");
    if (state.requestOpen) body.removeAttribute("hidden");
    else body.setAttribute("hidden", "");
    afterRenderLayout();
  }

  function renderRolePills(choices) {
    var wrap = byId("vc-staff-request-roles");
    var pills = byId("vc-staff-request-role-pills");
    if (!wrap || !pills) return;
    var list = Array.isArray(choices) ? choices : [];
    if (list.length <= 1) {
      wrap.setAttribute("hidden", "");
      pills.innerHTML = "";
      state.selectedRole = list[0] ? String(list[0].value || "") : "";
      return;
    }
    wrap.removeAttribute("hidden");
    pills.innerHTML = "";
    if (!state.selectedRole || !list.some(function (c) { return c.value === state.selectedRole; })) {
      state.selectedRole = String(list[0].value || "");
    }
    list.forEach(function (choice) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "vc-staff-request__pill" + (choice.value === state.selectedRole ? " is-active" : "");
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", choice.value === state.selectedRole ? "true" : "false");
      btn.textContent = String(choice.label || choice.value || "");
      btn.addEventListener("click", function () {
        state.selectedRole = String(choice.value || "");
        renderRolePills(list);
      });
      pills.appendChild(btn);
    });
  }

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function chatApiBase() {
    var T = window.VCStaffTools;
    if (T && typeof T.resolveApiUrl === "function") {
      return T.resolveApiUrl(window.__VC_STAFF_WORKFLOW_CHAT, "/webhooks/site-staff-workflow-chat");
    }
    return "/webhooks/site-staff-workflow-chat";
  }

  function formatDiscordHtml(text, opts) {
    var keepNewlines = Boolean(opts && opts.keepNewlines);
    var tokens = [];
    var withPlaceholders = String(text || "").replace(/<(a?):([\w~-]+):(\d+)>/g, function (_m, animated, name, id) {
      var i = tokens.length;
      var src =
        "https://cdn.discordapp.com/emojis/" +
        escHtml(id) +
        ".webp?size=64" +
        (animated === "a" ? "&animated=true" : "&quality=lossless");
      tokens.push(
        '<img class="vc-emoji vc-discord-emoji" src="' +
          src +
          '" alt=":' +
          escHtml(name) +
          ':" title=":' +
          escHtml(name) +
          ':" width="20" height="20" loading="lazy" decoding="async" />',
      );
      return "{{E" + i + "}}";
    });
    var html = escHtml(withPlaceholders);
    if (keepNewlines) html = html.replace(/\n/g, "<br>");
    tokens.forEach(function (img, i) {
      html = html.split("{{E" + i + "}}").join(img);
    });
    return html;
  }

  function avatarHtml(url, userId) {
    var T = window.VCStaffTools;
    if (T && typeof T.avatarImgHtml === "function") {
      return T.avatarImgHtml(url, userId, { size: 28 });
    }
    var src = String(url || "").trim();
    if (!src) src = "https://cdn.discordapp.com/embed/avatars/0.png";
    return '<img src="' + escHtml(src) + '" alt="" width="28" height="28" loading="lazy" decoding="async" />';
  }

  function pauseChatFetchJson(url, opts) {
    var T = window.VCStaffTools;
    if (T && typeof T.fetchJson === "function") return T.fetchJson(url, opts);
    opts = opts || {};
    var token = getToken();
    var headers = Object.assign({ Accept: "application/json" }, opts.headers || {});
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(url, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body,
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { res: res, data: data };
        });
    });
  }

  function initPauseWorkflowChat() {
    if (!window.VcWorkflowChat) return;
    var T = window.VCStaffTools || {};
    window.VcWorkflowChat.init({
      apiBase: chatApiBase,
      getProfileId: function () {
        return String((window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) || "");
      },
      getToken: getToken,
      dedupeKeyForItem: function (item) {
        return String((item && item.dedupeKey) || "").trim();
      },
      formatMessageHtml: formatDiscordHtml,
      esc: T.esc || escHtml,
      avatarHtml: avatarHtml,
      fetchJson: pauseChatFetchJson,
      byId: byId,
      sendBtnClass: "vc-staff-request__submit",
      userKindLabel: "Tu",
      panelTitle: "Discussione",
      panelHint: "Chat privata sulla richiesta · si chiude alla decisione",
      closedMessage: "Chat in sola lettura: la richiesta non è più in attesa.",
    });
  }

  function teardownPendingChat() {
    if (window.VcWorkflowChat) window.VcWorkflowChat.teardown();
    state.pendingChatKey = "";
    var mount = byId("vc-staff-pause-chat-mount");
    if (mount) mount.innerHTML = "";
    var root = byId("vc-staff-pause-chat");
    if (root) root.setAttribute("hidden", "");
  }

  function syncPendingChatPanel(pending) {
    var root = byId("vc-staff-pause-chat");
    var mount = byId("vc-staff-pause-chat-mount");
    var meta = byId("vc-staff-pause-chat-meta");
    if (!root || !mount) return;

    var req = pending && typeof pending === "object" ? pending : null;
    var key = req ? String(req.dedupeKey || "").trim() : "";
    if (!key) {
      teardownPendingChat();
      return;
    }

    var bits = [];
    if (req.start || req.end) bits.push((req.start || "?") + " \u2192 " + (req.end || "?"));
    if (req.ruoloRichiesto) bits.push(String(req.ruoloRichiesto));
    if (req.statusLabel) bits.push(String(req.statusLabel));
    if (meta) meta.textContent = bits.join(" \u00b7 ");

    root.removeAttribute("hidden");
    initPauseWorkflowChat();
    if (!window.VcWorkflowChat) return;

    var item = {
      dedupeKey: key,
      status: String(req.status || "pending"),
      pauseId: String(req.pauseId || ""),
    };
    if (state.pendingChatKey !== key || !byId("vc-wfc-root")) {
      mount.innerHTML = window.VcWorkflowChat.renderPanel(item, "pause");
      state.pendingChatKey = key;
    }
    window.VcWorkflowChat.boot(item, "pause");
  }

  function applyRequestMeta(me) {
    state.me = me && typeof me === "object" ? me : null;
    var root = byId("vc-staff-request");
    if (!root) return;
    if (!state.me || !state.me.canRequest) {
      root.setAttribute("hidden", "");
      setRequestOpen(false);
      syncPendingChatPanel(null);
      return;
    }
    root.removeAttribute("hidden");
    var minStart = String(state.me.minStartIso || "").trim();
    var start = byId("vc-staff-request-start");
    var end = byId("vc-staff-request-end");
    if (start) {
      if (minStart) start.setAttribute("min", minStart);
      if (!start.value && minStart) start.value = minStart;
      var startWrap = start.closest ? start.closest(".vc-staff-datefield") : null;
      if (startWrap) syncDatefieldLabel(startWrap, start.value);
    }
    if (end) {
      if (minStart) end.setAttribute("min", minStart);
      if (start && start.value && (!end.value || end.value < start.value)) end.value = start.value;
      var endWrap = end.closest ? end.closest(".vc-staff-datefield") : null;
      if (endWrap) syncDatefieldLabel(endWrap, end.value);
    }
    renderRolePills(state.me.roleChoices || []);
    syncPendingChatPanel(state.me.pendingRequest || null);
  }

  function submitPauseRequest(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (state.requestBusy) return;
    state.requestBusy = true;
    var submit = byId("vc-staff-request-submit");
    if (submit) submit.disabled = true;

    var start = byId("vc-staff-request-start");
    var end = byId("vc-staff-request-end");
    var reasonEl = byId("vc-staff-request-reason");
    var startVal = start ? String(start.value || "").trim() : "";
    var endVal = end ? String(end.value || "").trim() : "";
    var reason = reasonEl ? String(reasonEl.value || "").trim() : "";
    var reasonMin = Number((state.me && state.me.reasonMin) || 8);

    function unlock() {
      state.requestBusy = false;
      if (submit) submit.disabled = false;
    }

    if (!startVal || !endVal) {
      setRequestFeedback("Indica inizio e ritorno.", "error");
      unlock();
      return;
    }
    if (endVal < startVal) {
      setRequestFeedback("La data di ritorno deve essere dopo l'inizio.", "error");
      unlock();
      return;
    }
    if (reason.length < reasonMin) {
      setRequestFeedback("Scrivi una motivazione di almeno " + reasonMin + " caratteri.", "error");
      unlock();
      return;
    }
    var needsPick = Boolean(state.me && state.me.needsRolePick);
    if (needsPick && !state.selectedRole) {
      setRequestFeedback("Indica quale attività mettere in pausa.", "error");
      unlock();
      return;
    }

    var token = getToken();
    if (!token) {
      setRequestFeedback("Accedi per continuare.", "error");
      unlock();
      return;
    }

    setRequestFeedback("Invio in corso\u2026", "");

    var body = {
      start: startVal,
      end: endVal,
      reason: reason,
    };
    if (state.selectedRole) body.role = state.selectedRole;

    fetch(pauseApiBase(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      mode: "cors",
      credentials: "omit",
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { res: res, data: data };
          });
      })
      .then(function (out) {
        if (!out || !out.res) {
          setRequestFeedback("Errore di rete. Riprova.", "error");
          return;
        }
        if (!out.res.ok || !out.data || !out.data.ok) {
          setRequestFeedback(
            (out.data && out.data.message) || "Impossibile inviare la richiesta.",
            "error",
          );
          return;
        }
        setRequestFeedback(
          out.data.message || "Richiesta inviata. Chat aperta qui sotto.",
          "ok",
        );
        if (reasonEl) reasonEl.value = "";
        var count = byId("vc-staff-request-reason-count");
        if (count) count.textContent = "0";
        var dedupeKey = String(out.data.dedupeKey || "").trim();
        var pauseId = String(out.data.pauseId || "").trim();
        if (dedupeKey) {
          if (!state.me) state.me = {};
          state.me.pendingRequest = {
            dedupeKey: dedupeKey,
            pauseId: pauseId,
            status: "pending",
            statusLabel: "In attesa",
            start: startVal,
            end: endVal,
            ruoloRichiesto: state.selectedRole || "",
            preview: reason,
          };
          setRequestOpen(false);
          syncPendingChatPanel(state.me.pendingRequest);
          var chatEl = byId("vc-staff-pause-chat");
          if (chatEl && typeof chatEl.scrollIntoView === "function") {
            try {
              chatEl.scrollIntoView({ behavior: "smooth", block: "start" });
            } catch (eScroll) {}
          }
        }
        refreshMonthQuiet();
      })
      .catch(function () {
        setRequestFeedback("Errore di rete. Riprova.", "error");
      })
      .finally(unlock);
  }

  var requestFormWired = false;
  var activeDatePopover = null;

  function isoToDisplayIt(iso) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return m[3] + "/" + m[2] + "/" + m[1];
  }

  function closeDarkDatePopover() {
    if (activeDatePopover && activeDatePopover.parentNode) {
      activeDatePopover.parentNode.removeChild(activeDatePopover);
    }
    activeDatePopover = null;
    document.removeEventListener("mousedown", onDarkDateOutside, true);
    window.removeEventListener("resize", closeDarkDatePopover, true);
    window.removeEventListener("scroll", onDarkDateScrollClose, true);
    var bg = document.getElementById("vc-staff-datepicker-backdrop");
    if (bg) {
      bg.hidden = true;
      bg.setAttribute("hidden", "");
    }
    try {
      document.documentElement.classList.remove("vc-staff-datepicker-open");
    } catch (eRm) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      else if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
    } catch (eUnpin) {}
  }

  function onDarkDateScrollClose() {
    if (activeDatePopover && activeDatePopover.classList.contains("is-sheet")) return;
    closeDarkDatePopover();
  }

  function onDarkDateOutside(ev) {
    if (!activeDatePopover) return;
    if (activeDatePopover.contains(ev.target)) return;
    if (ev.target && ev.target.closest && ev.target.closest(".vc-staff-datefield")) return;
    if (ev.target && ev.target.id === "vc-staff-datepicker-backdrop") return;
    closeDarkDatePopover();
  }

  function isMobileDateSheet() {
    try {
      return window.matchMedia && window.matchMedia("(max-width: 639.98px), (pointer: coarse) and (max-width: 900px)").matches;
    } catch (eM) {
      return (window.innerWidth || 900) < 640;
    }
  }

  function ensureDateSheetBackdrop() {
    var bg = document.getElementById("vc-staff-datepicker-backdrop");
    if (bg) return bg;
    bg = document.createElement("button");
    bg.type = "button";
    bg.id = "vc-staff-datepicker-backdrop";
    bg.className = "vc-staff-datepicker-backdrop";
    bg.setAttribute("aria-label", "Chiudi calendario");
    bg.addEventListener("click", function () {
      closeDarkDatePopover();
    });
    document.body.appendChild(bg);
    return bg;
  }

  function placeDarkDatePopover(pop, anchorBtn) {
    var vw = window.innerWidth || document.documentElement.clientWidth || 360;
    var vh = window.innerHeight || document.documentElement.clientHeight || 640;
    if (isMobileDateSheet()) {
      pop.classList.add("is-sheet");
      var bg = ensureDateSheetBackdrop();
      bg.hidden = false;
      bg.removeAttribute("hidden");
      try {
        document.documentElement.classList.add("vc-staff-datepicker-open");
      } catch (eCl) {}
      try {
        if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
        else if (typeof window.__vcPinPageScroll === "function") window.__vcPinPageScroll();
      } catch (ePin) {}
      pop.style.position = "fixed";
      pop.style.left = "50%";
      pop.style.right = "auto";
      pop.style.top = "auto";
      pop.style.bottom = "max(0.65rem, env(safe-area-inset-bottom, 0px))";
      pop.style.width = "min(22.5rem, calc(100vw - 1.1rem))";
      pop.style.maxWidth = "calc(100vw - 1.1rem)";
      pop.style.transform = "translateX(-50%)";
      pop.style.zIndex = "2147483002";
      return;
    }
    pop.classList.remove("is-sheet");
    pop.style.transform = "";
    var rect = anchorBtn.getBoundingClientRect();
    var width = Math.min(17.5 * 16, Math.max(15 * 16, rect.width));
        var estH = 15.5 * 16;
    var gap = 6;
    var left = Math.min(Math.max(8, rect.left), Math.max(8, vw - width - 8));
    var top = rect.bottom + gap;
    if (top + estH > vh - 8 && rect.top - gap - estH > 8) {
      top = Math.max(8, rect.top - gap - estH);
      pop.classList.add("is-above");
    } else {
      pop.classList.remove("is-above");
      top = Math.min(top, Math.max(8, vh - estH - 8));
    }
    pop.style.position = "fixed";
    pop.style.left = Math.round(left) + "px";
    pop.style.top = Math.round(top) + "px";
    pop.style.width = Math.round(width) + "px";
    pop.style.right = "auto";
    pop.style.bottom = "auto";
    pop.style.zIndex = "2147483002";
  }

  function openDarkDatePopover(fieldWrap, hiddenInput, minIso) {
    closeDarkDatePopover();
    var current = String(hiddenInput.value || minIso || "").trim();
    var parts = current.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    var viewY = parts ? Number(parts[1]) : state.year || new Date().getFullYear();
    var viewM = parts ? Number(parts[2]) : state.month || new Date().getMonth() + 1;
    var selected = current;
    var anchorBtn = fieldWrap.querySelector(".vc-staff-datefield__btn") || fieldWrap;

    var pop = document.createElement("div");
    pop.className = "vc-staff-datepicker";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Scegli data");

    function paint() {
      var days = new Date(Date.UTC(viewY, viewM, 0)).getUTCDate();
      var firstDow = new Date(Date.UTC(viewY, viewM - 1, 1)).getUTCDay();
      var mondayFirst = (firstDow + 6) % 7;
      var html =
        '<div class="vc-staff-datepicker__nav">' +
        '<button type="button" class="vc-staff-datepicker__navbtn" data-dp-nav="-1" aria-label="Mese precedente"><i class="fa fa-chevron-left"></i></button>' +
        '<span class="vc-staff-datepicker__title">' +
        esc(MONTH_NAMES[viewM - 1] + " " + viewY) +
        "</span>" +
        '<button type="button" class="vc-staff-datepicker__navbtn" data-dp-nav="1" aria-label="Mese successivo"><i class="fa fa-chevron-right"></i></button>' +
        "</div>" +
        '<div class="vc-staff-datepicker__dows" aria-hidden="true">' +
        "<span>L</span><span>M</span><span>M</span><span>G</span><span>V</span><span>S</span><span>D</span></div>" +
        '<div class="vc-staff-datepicker__grid">';
      var i;
      for (i = 0; i < mondayFirst; i += 1) {
        html += '<span class="vc-staff-datepicker__cell is-empty"></span>';
      }
      for (var d = 1; d <= days; d += 1) {
        var iso = isoDay(viewY, viewM, d);
        var disabled = minIso && iso < minIso;
        var cls = "vc-staff-datepicker__cell";
        if (iso === selected) cls += " is-selected";
        if (disabled) cls += " is-disabled";
        html +=
          '<button type="button" class="' +
          cls +
          '" data-dp-day="' +
          esc(iso) +
          '"' +
          (disabled ? " disabled" : "") +
          ">" +
          d +
          "</button>";
      }
      html += "</div>";
      html +=
        '<div class="vc-staff-datepicker__footer">' +
        '<button type="button" class="vc-staff-datepicker__link" data-dp-clear>Cancella</button>' +
        '<button type="button" class="vc-staff-datepicker__link" data-dp-today>Oggi</button>' +
        "</div>";
      pop.innerHTML = html;
      placeDarkDatePopover(pop, anchorBtn);
    }

    paint();
    document.body.appendChild(pop);
    activeDatePopover = pop;
    placeDarkDatePopover(pop, anchorBtn);
    document.addEventListener("mousedown", onDarkDateOutside, true);
    window.addEventListener("resize", closeDarkDatePopover, true);
    window.addEventListener("scroll", onDarkDateScrollClose, true);

    pop.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-dp-nav],[data-dp-day],[data-dp-clear],[data-dp-today]") : null;
      if (!t) return;
      if (t.hasAttribute("data-dp-nav")) {
        var delta = Number(t.getAttribute("data-dp-nav") || "0");
        viewM += delta;
        while (viewM < 1) {
          viewM += 12;
          viewY -= 1;
        }
        while (viewM > 12) {
          viewM -= 12;
          viewY += 1;
        }
        paint();
        return;
      }
      if (t.hasAttribute("data-dp-clear")) {
        hiddenInput.value = "";
        syncDatefieldLabel(fieldWrap, "");
        closeDarkDatePopover();
        hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (t.hasAttribute("data-dp-today")) {
        var now = new Date();
        var todayIso = isoDay(now.getFullYear(), now.getMonth() + 1, now.getDate());
        if (minIso && todayIso < minIso) return;
        hiddenInput.value = todayIso;
        syncDatefieldLabel(fieldWrap, todayIso);
        closeDarkDatePopover();
        hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (t.hasAttribute("data-dp-day")) {
        var day = t.getAttribute("data-dp-day");
        if (!day || t.disabled) return;
        hiddenInput.value = day;
        syncDatefieldLabel(fieldWrap, day);
        closeDarkDatePopover();
        hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  function syncDatefieldLabel(wrap, iso) {
    var label = wrap.querySelector(".vc-staff-datefield__value");
    if (!label) return;
    var text = isoToDisplayIt(iso);
    label.textContent = text || "Scegli data";
    label.classList.toggle("is-placeholder", !text);
  }

  function enhanceDateInput(input) {
    if (!input || input.getAttribute("data-vc-dark-date") === "1") return;
    input.setAttribute("data-vc-dark-date", "1");
    var wrap = document.createElement("div");
    wrap.className = "vc-staff-datefield";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.type = "hidden";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vc-staff-datefield__btn";
    btn.innerHTML =
      '<span class="vc-staff-datefield__value is-placeholder">Scegli data</span>' +
      '<i class="fa fa-calendar" aria-hidden="true"></i>';
    wrap.appendChild(btn);
    syncDatefieldLabel(wrap, input.value);
    btn.addEventListener("click", function () {
      var minIso = String(input.getAttribute("min") || (state.me && state.me.minStartIso) || "").trim();
      openDarkDatePopover(wrap, input, minIso);
    });
  }

  function wireRequestForm() {
    if (requestFormWired) return;
    requestFormWired = true;
    var toggle = byId("vc-staff-request-toggle");
    var form = byId("vc-staff-request-form");
    var reasonEl = byId("vc-staff-request-reason");
    var start = byId("vc-staff-request-start");
    var end = byId("vc-staff-request-end");
    if (toggle) {
      toggle.addEventListener("click", function () {
        setRequestOpen(!state.requestOpen);
      });
    }
    if (form) form.addEventListener("submit", submitPauseRequest);
    if (reasonEl) {
      reasonEl.addEventListener("input", function () {
        var count = byId("vc-staff-request-reason-count");
        if (count) count.textContent = String(reasonEl.value.length);
      });
    }
    if (start) enhanceDateInput(start);
    if (end) enhanceDateInput(end);
    if (start) {
      start.addEventListener("change", function () {
        if (end && start.value && (!end.value || end.value < start.value)) {
          end.value = start.value;
          var endWrap = end.closest ? end.closest(".vc-staff-datefield") : null;
          if (endWrap) syncDatefieldLabel(endWrap, end.value);
        }
        if (end && start.value) end.setAttribute("min", start.value);
      });
    }
  }

  function loadMonth(year, month) {
    state.year = year;
    state.month = month;
    renderMonthLabel();
        if (!state.payload) {
      state.payload = { days: {}, pauses: [], today: "" };
      renderCalendar();
      renderSidebar();
    }

    var token = getToken();
    if (!token) {
      setStatus("Accedi per continuare.", true);
      return;
    }

    prefetchMonth(year, month).then(function (out) {
      monthFetchPromise = null;
      applyMonthPayload(out, false);
    });
  }

  function shiftMonth(delta) {
    var y = state.year;
    var m = state.month + delta;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    state.selectedDay = "";
    renderDayDetail("");
    loadMonth(y, m);
  }

  var pageInited = false;
  function initAfterAccess() {
    if (pageInited) return;
    pageInited = true;
    var ym = currentRomeYearMonth();
    var prev = byId("vc-staff-cal-prev");
    var next = byId("vc-staff-cal-next");
    if (prev) prev.addEventListener("click", function () {
      shiftMonth(-1);
    });
    if (next) next.addEventListener("click", function () {
      shiftMonth(1);
    });
    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncSidePanelHeight, 80);
    });
    wireRequestForm();
    loadMonth(ym.year, ym.month);
    connectPauseWebSocket();
    window.__vcStaffPageRefresh = function () {
      var cur = currentRomeYearMonth();
      return Promise.resolve(loadMonth(cur.year, cur.month));
    };
    window.__vcPtrSoftRefresh = window.__vcStaffPageRefresh;
  }

  function boot() {
    var ym = currentRomeYearMonth();
        try {
      if (getToken()) prefetchMonth(ym.year, ym.month);
    } catch (ePf) {}

    function tryInit() {
      if (pageInited) return true;
      if (
        document.documentElement.classList.contains("vc-staff-app-revealed") ||
        window.__VC_STAFF_PERMS ||
        window.__VC_ACCESS_OK ||
        window.__VC_STAFF_ACCESS_OPTIMISTIC
      ) {
        initAfterAccess();
        return true;
      }
      return false;
    }

    if (tryInit()) return;
    window.addEventListener("vc:staff-access-ok", initAfterAccess, { once: true });
    window.addEventListener("vc:access-ok", initAfterAccess, { once: true });
        var tries = 0;
    var timer = window.setInterval(function () {
      tries += 1;
      if (tryInit() || tries > 40) window.clearInterval(timer);
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  window.addEventListener("beforeunload", disconnectPauseWebSocket);
})();
