(function () {
  var T = window.VCStaffTools;
  if (!T) return;

  var HISTORY_PAGE_SIZE = 20;

  var state = {
    sections: [],
    pexHistory: [],
    historyStats: null,
    historyFilterUserId: "",
    historyKindFilter: "all",
    historyPage: 1,
    staffDelMese: null,
    staffDelSettimana: null,
    loading: false,
    loaded: false,
    error: "",
  };

  function apiUrl(userId, opts) {
    var base = T.resolveApiUrl(window.__VC_STAFF_ORGANICO, "/webhooks/site-staff-organico");
    var q = [];
    if (userId) q.push("userId=" + encodeURIComponent(userId));
    if (opts && opts.rosterOnly) q.push("rosterOnly=1");
    if (!q.length) return base;
    return base + (base.indexOf("?") >= 0 ? "&" : "?") + q.join("&");
  }

  function selectedUserIdFromUrl() {
    try {
      return String(new URLSearchParams(location.search).get("userId") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function setUrlUser(userId) {
    try {
      var u = new URL(location.href);
      if (userId) u.searchParams.set("userId", userId);
      else u.searchParams.delete("userId");
      history.replaceState({}, "", u.pathname + u.search);
    } catch (e) {}
  }

  function memberLabel(userId) {
    var uid = String(userId || "");
    for (var i = 0; i < (state.sections || []).length; i += 1) {
      var members = state.sections[i].members || [];
      for (var j = 0; j < members.length; j += 1) {
        if (String(members[j].userId) === uid) return T.userLabel(members[j].displayName, uid);
      }
    }
    var row = (state.pexHistory || []).find(function (r) {
      return String(r.userId) === uid;
    });
    return T.userLabel(row && row.displayName, uid);
  }

  function renderBestStaffCard(cardId, block, opts) {
    var card = T.byId(cardId);
    if (!card) return;
    var holders = block && Array.isArray(block.holders) ? block.holders : [];
    var label = String((block && block.roleLabel) || (opts && opts.fallbackLabel) || "").trim();
    var lead = String((opts && opts.lead) || "").trim();
    var prizes = Array.isArray(opts && opts.prizes) ? opts.prizes : [];
    if (!holders.length && !(opts && opts.forceShow)) {
      card.hidden = true;
      card.setAttribute("aria-hidden", "true");
      card.innerHTML = "";
      return;
    }
    var holdersHtml = holders.length
      ? '<ul class="vc-staff-organico-sdm__holders">' +
        holders
          .map(function (h) {
            var name = T.esc(String((h && (h.displayName || h.username)) || h.userId || "").trim() || "Staff");
            /* organicoAvatarEager1: stesso hub avatar delle altre pagine staff (no raw <img>) */
            var avHtml = T.avatarImgHtml(h && h.avatarUrl, h && h.userId, {
              width: 28,
              height: 28,
              className: "vc-staff-avatar",
              loading: "eager",
              fetchPriority: "high",
            });
            return (
              '<li><span class="vc-staff-organico-sdm__av" aria-hidden="true">' +
              avHtml +
              "</span><span>" +
              name +
              "</span></li>"
            );
          })
          .join("") +
        "</ul>"
      : '<p class="vc-staff-organico-sdm__empty">Nessun holder al momento.</p>';
    var prizesHtml = prizes.length
      ? '<ul class="vc-staff-organico-sdm__prizes">' +
        prizes.map(function (p) {
          return "<li>" + T.esc(String(p || "")) + "</li>";
        }).join("") +
        "</ul>"
      : "";
    card.hidden = false;
    card.setAttribute("aria-hidden", "false");
    card.innerHTML =
      '<div class="vc-staff-organico-sdm__inner">' +
      '<p class="vc-staff-organico-sdm__kicker">' +
      T.esc((opts && opts.kicker) || "Premio") +
      "</p>" +
      "<h2>" +
      T.esc(label || (opts && opts.fallbackLabel) || "Premio") +
      "</h2>" +
      (lead ? '<p class="vc-staff-organico-sdm__lead">' + T.esc(lead) + "</p>" : "") +
      prizesHtml +
      '<div class="vc-staff-organico-sdm__now"><p class="vc-staff-organico-sdm__now-label">In carica</p>' +
      holdersHtml +
      "</div></div>";
  }

  function renderStaffDelMese() {
    renderBestStaffCard("vc-staff-organico-sdm", state.staffDelMese, {
      kicker: "Premio mensile",
      fallbackLabel: "Staffer del Mese",
      lead: "Riconoscimento mensile allo staffer più votato.",
      prizes: ["+5 giorni di pausa per l'anno", "Nitro Boost (processo staff)"],
    });
  }

  function renderStaffDelSettimana() {
    renderBestStaffCard("vc-staff-organico-sdw", state.staffDelSettimana, {
      kicker: "Premio settimanale",
      fallbackLabel: "Staffer della Settimana",
      lead: "+1 giorno di pausa e +1 switch compiti per ogni settimana vinta, spendibili solo nel mese della settimana (anche a cavallo tra due mesi). Se domenica entro le 21 ha ancora il ruolo, vince di nuovo.",
      prizes: ["+1 giorno di pausa (mese della settimana)", "+1 switch compiti (mese della settimana)"],
    });
  }

  function renderRoster() {
      }

  function historyKindCounts() {
    var all = state.pexHistory || [];
    return {
      all: all.length,
      pex: all.filter(function (r) {
        return r.kind === "pex";
      }).length,
      depex: all.filter(function (r) {
        return r.kind === "depex";
      }).length,
    };
  }

  function historyRowsForRender() {
    var rows = state.pexHistory || [];
    var kind = String(state.historyKindFilter || "all");
    if (kind === "pex" || kind === "depex") {
      rows = rows.filter(function (r) {
        return r.kind === kind;
      });
    }
    return rows;
  }

  function historyPageCount(rows) {
    return Math.max(1, Math.ceil((rows.length || 0) / HISTORY_PAGE_SIZE) || 1);
  }

  function historyPageRows(rows) {
    var totalPages = historyPageCount(rows);
    var page = Math.min(Math.max(1, state.historyPage || 1), totalPages);
    state.historyPage = page;
    var start = (page - 1) * HISTORY_PAGE_SIZE;
    return rows.slice(start, start + HISTORY_PAGE_SIZE);
  }

  function goHistoryPage(nextPage) {
    var rows = historyRowsForRender();
    var maxPage = historyPageCount(rows);
    var page = Math.min(Math.max(1, Number(nextPage) || 1), maxPage);
    if (page === state.historyPage) return false;
    state.historyPage = page;
    renderHistory();
    var history = T.byId("vc-staff-organico-history");
    var list = history && history.querySelector(".vc-staff-organico-hist");
    if (list && list.scrollTop != null) list.scrollTop = 0;
    return true;
  }

  function buildHistoryPaginationHtml(rows) {
    var total = rows.length;
    if (total <= HISTORY_PAGE_SIZE) return "";
    var totalPages = historyPageCount(rows);
    var page = state.historyPage;

    /* organicoPagerJump1: "…" apre input per andare a pagina */
    function gap() {
      return (
        '<span class="vc-staff-inbox-pagination__jump">' +
        '<button type="button" class="vc-staff-pt-seg__btn vc-staff-inbox-pagination__gap" data-hist-jump aria-label="Vai a pagina" title="Vai a pagina">\u2026</button>' +
        '<input class="vc-staff-inbox-pagination__jump-input" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" min="1" max="' +
        totalPages +
        '" placeholder="#" name="vcOrganicoPage" data-hist-page-input hidden aria-label="Numero pagina" />' +
        "</span>"
      );
    }
    function pageBtn(n, active) {
      return (
        '<button type="button" class="vc-staff-pt-seg__btn' +
        (active ? " is-active" : "") +
        '" data-hist-page="' +
        n +
        '"' +
        (active ? ' aria-current="page"' : "") +
        ">" +
        n +
        "</button>"
      );
    }

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
      '<button type="button" class="vc-staff-pt-seg__btn vc-staff-inbox-pagination__navbtn" data-hist-page="prev"' +
      (page <= 1 ? " disabled" : "") +
      ' aria-label="Pagina precedente">\u2190</button>';
    nums.forEach(function (n) {
      if (n === "…") pagesHtml += gap();
      else pagesHtml += pageBtn(n, n === page);
    });
    pagesHtml +=
      '<button type="button" class="vc-staff-pt-seg__btn vc-staff-inbox-pagination__navbtn" data-hist-page="next"' +
      (page >= totalPages ? " disabled" : "") +
      ' aria-label="Pagina successiva">\u2192</button>';

    return (
      '<div class="vc-staff-inbox-pagination vc-staff-organico-hist__pagination" data-pager-total="' +
      totalPages +
      '">' +
      '<div class="vc-staff-inbox-pagination__row">' +
      '<div class="vc-staff-pt-seg vc-staff-inbox-pagination__seg" role="navigation" aria-label="Pagine (' +
      total +
      ' voci)">' +
      pagesHtml +
      "</div></div></div>"
    );
  }

  function tabMeta(kind, counts) {
    if (kind === "all") return { label: "Tutti", count: counts.all || 0 };
    if (kind === "pex") return { label: "Pex", count: counts.pex || 0 };
    return { label: "Depex", count: counts.depex || 0 };
  }

  function scanOrganicoAvatars(panel) {
    if (!panel) return;
    try {
      if (window.VcAvatarFallback && typeof window.VcAvatarFallback.scan === "function") {
        window.VcAvatarFallback.scan(panel);
      }
    } catch (eScan) {}
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.scan === "function") {
        window.VcDiscordAvatar.scan(panel);
      }
    } catch (eDa) {}
  }

  function renderHistory() {
    var panel = T.byId("vc-staff-organico-history");
    var switchHost = T.byId("vc-staff-organico-switch");
    if (!panel) return;

    var rows = historyRowsForRender();
    var pageRows = historyPageRows(rows);
    var filterId = String(state.historyFilterUserId || "");
    var filterLabel = filterId ? memberLabel(filterId) : "";
    var kind = String(state.historyKindFilter || "all");
    var counts = historyKindCounts();

    /* organicoSwitchOut2: switcher FUORI dalla card (#vc-staff-organico-board) */
    var chrome =
      '<div class="vc-staff-organico-hist__switch">' +
      '<div class="vc-staff-pt-seg vc-staff-organico-seg" role="group" aria-label="Filtra cronologia">' +
      ["all", "pex", "depex"]
        .map(function (k) {
          var meta = tabMeta(k, counts);
          var pressed = kind === k ? ' aria-selected="true"' : ' aria-selected="false"';
          return (
            '<button type="button" class="vc-staff-pt-seg__btn' +
            (kind === k ? " is-active" : "") +
            '" data-kind="' +
            T.esc(k) +
            '" role="tab"' +
            pressed +
            ">" +
            T.esc(meta.label) +
            (meta.count
              ? ' <span class="vc-staff-organico-hist__count" aria-hidden="true">' + meta.count + "</span>"
              : "") +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      (filterId
        ? '<button type="button" class="vc-staff-organico-hist__clear" id="vc-staff-organico-clear-filter">Mostra tutti</button>'
        : "") +
      "</div>";

    if (filterId) {
      chrome +=
        '<p class="vc-staff-organico-hist__filter">Filtrato per <strong>' +
        T.esc(filterLabel) +
        "</strong></p>";
    }

    if (switchHost) {
      switchHost.hidden = false;
      switchHost.setAttribute("aria-hidden", "false");
      switchHost.innerHTML = chrome;
    }

    if (!rows.length) {
      panel.innerHTML =
        '<div class="vc-staff-manage-placeholder"><p>Nessuna ' +
        (kind === "pex" ? "pex" : kind === "depex" ? "depex" : "variazione") +
        " registrata" +
        (filterId ? " per questo membro." : " al momento.") +
        "</p></div>";
      return;
    }

    var pagination = buildHistoryPaginationHtml(rows);

    panel.innerHTML =
      '<div class="vc-staff-organico-hist__main">' +
      '<ul class="vc-staff-organico-hist">' +
      pageRows
        .map(function (r) {
          var kindLabel = r.kind === "depex" ? "Depex" : "Pex";
          return (
            '<li class="vc-staff-organico-hist__item vc-staff-organico-hist__item--' +
            T.esc(r.kind) +
            '">' +
            '<div class="vc-staff-organico-hist__row">' +
            '<div class="vc-staff-organico-hist__av">' +
            T.avatarImgHtml(r.avatarUrl, r.userId, {
              width: 44,
              height: 44,
              className: "vc-staff-avatar",
              loading: "eager",
              fetchPriority: "high",
            }) +
            "</div>" +
            '<div class="vc-staff-organico-hist__body">' +
            '<div class="vc-staff-organico-hist__top">' +
            '<p class="vc-staff-organico-hist__who">' +
            '<span class="vc-staff-organico-hist__badge">' +
            T.esc(kindLabel) +
            "</span>" +
            "<strong>" +
            T.esc(T.userLabel(r.displayName, r.userId)) +
            "</strong></p>" +
            (r.dateLabel
              ? '<time class="vc-staff-organico-hist__date" datetime="' +
                T.esc(r.dateIso || "") +
                '">' +
                T.esc(r.dateLabel) +
                "</time>"
              : "") +
            "</div>" +
            '<p class="vc-staff-organico-hist__roles">' +
            '<span class="vc-staff-organico-hist__role-from">' +
            T.esc(r.fromRole || "—") +
            '</span><span class="vc-staff-organico-hist__role-arrow" aria-hidden="true">→</span><span class="vc-staff-organico-hist__role-to">' +
            T.esc(r.toRole || "—") +
            "</span></p>" +
            (r.reason ? '<p class="vc-staff-organico-hist__reason">' + T.esc(r.reason) + "</p>" : "") +
            "</div></div></li>"
          );
        })
        .join("") +
      "</ul>" +
      "</div>" +
      (pagination
        ? pagination.replace(
            "vc-staff-organico-hist__pagination",
            "vc-staff-organico-hist__pagination vc-staff-organico-hist__pagination--foot",
          )
        : "");
    scanOrganicoAvatars(panel);
  }

  function applyRosterLite(data) {
    if (!data) return;
    state.sections = data.sections || state.sections || [];
    state.staffDelMese = data.staffDelMese || state.staffDelMese || null;
    state.staffDelSettimana = data.staffDelSettimana || state.staffDelSettimana || null;
    renderStaffDelMese();
    renderStaffDelSettimana();
    renderRoster();
    try {
      scanOrganicoAvatars(T.byId("vc-staff-organico-sdm"));
      scanOrganicoAvatars(T.byId("vc-staff-organico-sdw"));
    } catch (eLite) {}
  }

  function applyPayload(data) {
    state.sections = data.sections || [];
    state.pexHistory = data.pexHistory || [];
    state.historyStats = data.historyStats || null;
    state.historyPage = 1;
    state.staffDelMese = data.staffDelMese || null;
    state.staffDelSettimana = data.staffDelSettimana || null;
    state.historyFilterUserId = String(data.historyFilterUserId || state.historyFilterUserId || "");
    var root = T.byId("vc-staff-organico-board");
    if (root) root.hidden = false;
    var switchHost = T.byId("vc-staff-organico-switch");
    if (switchHost) switchHost.hidden = false;
    renderStaffDelMese();
    renderStaffDelSettimana();
    renderRoster();
    renderHistory();
    try {
      scanOrganicoAvatars(T.byId("vc-staff-organico-sdm"));
      scanOrganicoAvatars(T.byId("vc-staff-organico-sdw"));
    } catch (eScanSdm) {}
  }

  function loadHistory(filterUserId) {
    state.historyFilterUserId = String(filterUserId || "");
    setUrlUser(state.historyFilterUserId);
    state.loading = true;
    state.error = "";
    var root = T.byId("vc-staff-organico-board");
    if (root) root.hidden = false;
    var switchHost = T.byId("vc-staff-organico-switch");
    if (switchHost) switchHost.hidden = false;
    renderRoster();
    T.showPanelLoading("vc-staff-organico-history");
    return T.whenDiscordSessionReady(function () {
      if (!T.getToken()) {
        state.loading = false;
        state.error = "Accedi per continuare.";
        T.clearPanelLoading("vc-staff-organico-history");
        renderRoster();
        return;
      }
      /* organicoFastPaint1: roster subito, cronologia subito dopo */
      T.fetchJson(apiUrl(state.historyFilterUserId, { rosterOnly: true }), { timeoutMs: 20000 })
        .then(function (lite) {
          if (lite && lite.res && lite.res.ok && lite.data && lite.data.ok) {
            applyRosterLite(lite.data);
          }
        })
        .catch(function () {});

      function handleOrganicoResponse(out, retried) {
        state.loading = false;
        T.clearPanelLoading("vc-staff-organico-history");
        if (!out.res.ok || !out.data || !out.data.ok) {
          var timedOut = out.data && String(out.data.error || "").toLowerCase() === "timeout";
          if (timedOut && !retried) {
            state.loading = true;
            T.showPanelLoading("vc-staff-organico-history");
            return T.fetchJson(apiUrl(state.historyFilterUserId), { timeoutMs: 60000 }).then(
              function (out2) {
                return handleOrganicoResponse(out2, true);
              },
            );
          }
          state.error =
            (out.data && out.data.message) ||
            (timedOut
              ? "Caricamento troppo lento. Riprova tra qualche secondo."
              : "Impossibile caricare l'organico." +
                (out.res && out.res.status ? " HTTP " + out.res.status : ""));
          state.loaded = false;
          renderRoster();
          renderHistory();
          return;
        }
        state.loaded = true;
        state.error = "";
        applyPayload(out.data);
      }
      return T.fetchJson(apiUrl(state.historyFilterUserId), { timeoutMs: 60000 })
        .then(function (out) {
          return handleOrganicoResponse(out, false);
        })
        .catch(function (err) {
          state.loading = false;
          state.loaded = false;
          state.error =
            (err && err.data && err.data.message) ||
            (err && err.message) ||
            "Errore di rete.";
          T.clearPanelLoading("vc-staff-organico-history");
          renderRoster();
          renderHistory();
        });
    });
  }

  function closeHistoryJumps(exceptWrap) {
    var history = T.byId("vc-staff-organico-history");
    if (!history) return;
    var wraps = history.querySelectorAll(".vc-staff-inbox-pagination__jump");
    for (var i = 0; i < wraps.length; i += 1) {
      var wrap = wraps[i];
      if (exceptWrap && wrap === exceptWrap) continue;
      var btn = wrap.querySelector("[data-hist-jump]");
      var input = wrap.querySelector("[data-hist-page-input]");
      if (btn) btn.hidden = false;
      if (input) {
        input.hidden = true;
        input.value = "";
      }
      wrap.classList.remove("is-editing");
    }
  }

  function commitHistoryJump(input) {
    if (!input) return;
    var pager = input.closest(".vc-staff-organico-hist__pagination");
    var maxPage =
      Number(pager && pager.getAttribute("data-pager-total")) ||
      historyPageCount(historyRowsForRender());
    var raw = parseInt(String(input.value || ""), 10);
    closeHistoryJumps(null);
    if (!Number.isFinite(raw)) return;
    goHistoryPage(Math.min(Math.max(1, raw), maxPage));
  }

  function openHistoryJump(jumpBtn) {
    if (!jumpBtn) return false;
    var wrap = jumpBtn.closest(".vc-staff-inbox-pagination__jump");
    var input = wrap && wrap.querySelector("[data-hist-page-input]");
    closeHistoryJumps(wrap);
    if (!wrap || !input) return false;
    jumpBtn.hidden = true;
    input.hidden = false;
    input.removeAttribute("hidden");
    wrap.classList.add("is-editing");
    input.value = "";
    /* organicoPagerJumpFocus1: focus sync (no setTimeout) */
    try {
      input.focus({ preventScroll: true });
    } catch (eF) {
      try {
        input.focus();
      } catch (eF2) {}
    }
    try {
      input.select();
    } catch (eSel) {}
    return true;
  }

  function bind() {
    var history = T.byId("vc-staff-organico-history");
    var switchHost = T.byId("vc-staff-organico-switch");
    var scope = T.byId("vc-page-content") || document;

    function onOrganicoPointerDown(ev) {
      if (!history || !history.contains(ev.target)) return;
      if (ev.button != null && ev.button !== 0) return;
      var jumpBtn = ev.target.closest ? ev.target.closest("[data-hist-jump]") : null;
      if (!jumpBtn) return;
      ev.preventDefault();
      openHistoryJump(jumpBtn);
    }

    function onOrganicoClick(ev) {
      var clear = ev.target && ev.target.closest ? ev.target.closest("#vc-staff-organico-clear-filter") : null;
      if (clear) {
        loadHistory("");
        return;
      }
      var tab =
        ev.target && ev.target.closest
          ? ev.target.closest(".vc-staff-pt-seg__btn[data-kind]")
          : null;
      if (tab && (switchHost ? switchHost.contains(tab) : true)) {
        var nextKind = String(tab.getAttribute("data-kind") || "all");
        if (nextKind === state.historyKindFilter) return;
        state.historyKindFilter = nextKind;
        state.historyPage = 1;
        renderHistory();
        return;
      }
      if (!history || !history.contains(ev.target)) return;

      var jumpBtn = ev.target.closest ? ev.target.closest("[data-hist-jump]") : null;
      if (jumpBtn) {
        ev.preventDefault();
        if (!jumpBtn.hidden) openHistoryJump(jumpBtn);
        return;
      }

      var pageBtn = ev.target && ev.target.closest ? ev.target.closest("[data-hist-page]") : null;
      if (pageBtn && !pageBtn.disabled) {
        var dir = String(pageBtn.getAttribute("data-hist-page") || "");
        var rows = historyRowsForRender();
        var maxPage = historyPageCount(rows);
        var nextPage = state.historyPage;
        if (dir === "prev" && state.historyPage > 1) nextPage = state.historyPage - 1;
        else if (dir === "next" && state.historyPage < maxPage) nextPage = state.historyPage + 1;
        else {
          var n = Number(dir);
          if (Number.isFinite(n) && n >= 1 && n <= maxPage) nextPage = n;
        }
        goHistoryPage(nextPage);
      }
    }

    function onOrganicoKey(ev) {
      if (!history || !history.contains(ev.target)) return;
      if (!ev.target.matches || !ev.target.matches("[data-hist-page-input]")) return;
      if (ev.key === "Enter") {
        ev.preventDefault();
        commitHistoryJump(ev.target);
        return;
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeHistoryJumps(null);
      }
    }

    function onOrganicoFocusOut(ev) {
      if (!history || !ev.target || !ev.target.matches || !ev.target.matches("[data-hist-page-input]")) return;
      window.setTimeout(function () {
        if (!history.contains(document.activeElement)) commitHistoryJump(ev.target);
      }, 0);
    }

    if (scope && !scope.dataset.vcOrganicoBound) {
      scope.dataset.vcOrganicoBound = "1";
      scope.addEventListener("pointerdown", onOrganicoPointerDown, true);
      scope.addEventListener("click", onOrganicoClick);
      scope.addEventListener("keydown", onOrganicoKey);
      scope.addEventListener("focusout", onOrganicoFocusOut);
    }
  }

  function load() {
    /* organicoPexNotifCine1: notifica PEX apriva ?userId= → cronologia filtrata a 1 persona.
       Mostra sempre tutta la cronologia; pulisci query legacy. */
    if (selectedUserIdFromUrl()) setUrlUser("");
    loadHistory("");
  }

  var pageInited = false;
  function initAfterAccess() {
    if (pageInited) return;
    pageInited = true;
    /* notifMobileOpenFix1: forza cine dopo deep-link push/in-app */
    try {
      if (typeof window.__vcBootStaffCineLayout === "function") {
        window.__vcBootStaffCineLayout(true);
      }
    } catch (eCine) {}
    window.setTimeout(function () {
      try {
        if (typeof window.__vcBootStaffCineLayout === "function") {
          window.__vcBootStaffCineLayout(true);
        }
      } catch (eCine2) {}
    }, 180);
    bind();
    load();
    try {
      window.__vcStaffPageRefresh = function () {
        return Promise.resolve().then(function () {
          return load();
        });
      };
      window.__vcPtrSoftRefresh = window.__vcStaffPageRefresh;
    } catch (ePtr) {}
  }
  function boot() {
    /* siteApiW5: if staff already allowed, don't wait for second access event */
    var already =
      document.documentElement.classList.contains("vc-staff-app-revealed") ||
      window.__VC_STAFF_MENU_ALLOWED === true;
    if (already) {
      initAfterAccess();
      return;
    }
    window.addEventListener("vc:staff-access-ok", function once() {
      window.removeEventListener("vc:staff-access-ok", once);
      initAfterAccess();
    });
    /* also race: access may already be cached before event */
    window.setTimeout(function () {
      try {
        if (!pageInited && window.__VC_STAFF_MENU_ALLOWED === true) {
          initAfterAccess();
        }
      } catch (eRace) {}
    }, 400);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
