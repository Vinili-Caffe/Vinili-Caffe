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
    loading: false,
    loaded: false,
    error: "",
  };

  function apiUrl(userId) {
    var base = T.resolveApiUrl(window.__VC_STAFF_ORGANICO, "/webhooks/site-staff-organico");
    if (!userId) return base;
    return base + (base.indexOf("?") >= 0 ? "&" : "?") + "userId=" + encodeURIComponent(userId);
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

  function renderStaffDelMese() {
    var card = T.byId("vc-staff-organico-sdm");
    if (!card) return;
    var block = state.staffDelMese || {};
    var holders = block.holders || [];
    var holdersHtml = "";
    if (holders.length) {
      holdersHtml =
        '<ul class="vc-staff-organico-sdm__holders">' +
        holders
          .map(function (m) {
            return (
              "<li>" +
              T.avatarImgHtml(m.avatarUrl, m.userId, { width: 40, height: 40 }) +
              "<span><strong>" +
              T.esc(T.userLabel(m.displayName, m.userId)) +
              "</strong></span></li>"
            );
          })
          .join("") +
        "</ul>";
    } else {
      holdersHtml = '<p class="vc-staff-organico-sdm__empty">Nessuno con il ruolo al momento.</p>';
    }
    card.innerHTML =
      '<div class="vc-staff-organico-sdm__inner">' +
      '<p class="vc-staff-organico-sdm__kicker">Premio mensile</p>' +
      "<h2>Staff del Mese</h2>" +
      '<p class="vc-staff-organico-sdm__lead">Ogni mese viene scelto <strong>un solo</strong> staffer da premiare. La scelta tiene conto di attività, presenza e contributo al team.</p>' +
      '<ul class="vc-staff-organico-sdm__prizes">' +
      "<li>Ruolo <strong>" +
      T.esc(block.roleLabel || "Staffer del Mese") +
      "</strong></li>" +
      "<li><strong>5 giorni di pausa in più</strong></li>" +
      "<li><strong>Nitro Boost</strong> (almeno un boost a Vinili &amp; Caffè)</li>" +
      "</ul>" +
      '<div class="vc-staff-organico-sdm__now"><p class="vc-staff-organico-sdm__now-label">Staffer del Mese ora</p>' +
      holdersHtml +
      "</div></div>";
    card.hidden = false;
  }

  function renderRoster() {
    /* Staff list rimossa: resta solo la cronologia pex/depex. */
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

  function buildHistoryPaginationHtml(rows) {
    var total = rows.length;
    if (total <= HISTORY_PAGE_SIZE) return "";
    var totalPages = historyPageCount(rows);
    var page = state.historyPage;
    var from = (page - 1) * HISTORY_PAGE_SIZE + 1;
    var to = Math.min(total, page * HISTORY_PAGE_SIZE);
    return (
      '<div class="vc-staff-inbox-pagination vc-staff-organico-hist__pagination">' +
      '<div class="vc-staff-inbox-pagination__info">' +
      T.esc(from + "\u2013" + to + " di " + total) +
      "</div>" +
      '<div class="vc-staff-inbox-pagination__nav">' +
      '<button type="button" class="vc-staff-inbox-page-btn" data-hist-page="prev"' +
      (page <= 1 ? " disabled" : "") +
      ">\u2190 Prec</button>" +
      '<span class="vc-staff-inbox-pagination__label">Pagina ' +
      page +
      " / " +
      totalPages +
      "</span>" +
      '<button type="button" class="vc-staff-inbox-page-btn" data-hist-page="next"' +
      (page >= totalPages ? " disabled" : "") +
      ">Succ \u2192</button>" +
      "</div></div>"
    );
  }

  function tabLabel(kind, counts) {
    if (kind === "all") return "Tutti" + (counts.all ? " · " + counts.all : "");
    if (kind === "pex") return "Pex" + (counts.pex ? " · " + counts.pex : "");
    return "Depex" + (counts.depex ? " · " + counts.depex : "");
  }

  function renderHistory() {
    var panel = T.byId("vc-staff-organico-history");
    if (!panel) return;

    var rows = historyRowsForRender();
    var pageRows = historyPageRows(rows);
    var filterId = String(state.historyFilterUserId || "");
    var filterLabel = filterId ? memberLabel(filterId) : "";
    var kind = String(state.historyKindFilter || "all");
    var counts = historyKindCounts();

    var head =
      '<header class="vc-staff-organico-hist__head">' +
      "<div><h2>Cronologia del team</h2>" +
      (counts.all
        ? '<p class="vc-staff-organico-hist__counts">' +
          T.esc(String(counts.pex)) +
          " pex · " +
          T.esc(String(counts.depex)) +
          " depex</p>"
        : "") +
      "</div>" +
      (filterId
        ? '<button type="button" class="vc-staff-organico-hist__clear" id="vc-staff-organico-clear-filter">Mostra tutti</button>'
        : "") +
      "</header>" +
      '<div class="vc-staff-organico-hist__tabs" role="tablist" aria-label="Filtra cronologia">' +
      ['all', 'pex', 'depex']
        .map(function (k) {
          var label = tabLabel(k, counts);
          var pressed = kind === k ? ' aria-selected="true"' : ' aria-selected="false"';
          return (
            '<button type="button" class="vc-staff-organico-hist__tab' +
            (kind === k ? " is-active" : "") +
            '" data-kind="' +
            T.esc(k) +
            '" role="tab"' +
            pressed +
            ">" +
            T.esc(label) +
            "</button>"
          );
        })
        .join("") +
      "</div>";

    if (filterId) {
      head +=
        '<p class="vc-staff-organico-hist__filter">Filtrato per <strong>' +
        T.esc(filterLabel) +
        "</strong></p>";
    }

    if (!rows.length) {
      panel.innerHTML =
        head +
        '<div class="vc-staff-manage-placeholder"><p>Nessuna ' +
        (kind === "pex" ? "pex" : kind === "depex" ? "depex" : "variazione") +
        " registrata" +
        (filterId ? " per questo membro." : " al momento.") +
        "</p></div>";
      return;
    }

    var pagination = buildHistoryPaginationHtml(rows);

    panel.innerHTML =
      head +
      '<ul class="vc-staff-organico-hist">' +
      pageRows
        .map(function (r) {
          var kindLabel = r.kind === "depex" ? "Depex" : "Pex";
          return (
            '<li class="vc-staff-organico-hist__item vc-staff-organico-hist__item--' +
            T.esc(r.kind) +
            '">' +
            '<div class="vc-staff-organico-hist__row">' +
            T.avatarImgHtml(r.avatarUrl, r.userId, { width: 40, height: 40 }) +
            '<div class="vc-staff-organico-hist__body">' +
            '<p class="vc-staff-organico-hist__who">' +
            '<span class="vc-staff-organico-hist__badge">' +
            T.esc(kindLabel) +
            "</span> " +
            "<strong>" +
            T.esc(T.userLabel(r.displayName, r.userId)) +
            "</strong></p>" +
            '<p class="vc-staff-organico-hist__roles">' +
            T.esc(r.fromRole || "—") +
            " → " +
            T.esc(r.toRole || "—") +
            "</p>" +
            (r.reason ? '<p class="vc-staff-organico-hist__reason">' + T.esc(r.reason) + "</p>" : "") +
            (r.dateLabel ? '<p class="vc-staff-organico-hist__date">' + T.esc(r.dateLabel) + "</p>" : "") +
            "</div></div></li>"
          );
        })
        .join("") +
      "</ul>" +
      pagination;
  }

  function applyPayload(data) {
    state.sections = data.sections || [];
    state.pexHistory = data.pexHistory || [];
    state.historyStats = data.historyStats || null;
    state.historyPage = 1;
    state.staffDelMese = data.staffDelMese || null;
    state.historyFilterUserId = String(data.historyFilterUserId || state.historyFilterUserId || "");
    var root = T.byId("vc-staff-organico-board");
    if (root) root.hidden = false;
    renderStaffDelMese();
    renderRoster();
    renderHistory();
  }

  function loadHistory(filterUserId) {
    state.historyFilterUserId = String(filterUserId || "");
    setUrlUser(state.historyFilterUserId);
    state.loading = true;
    state.error = "";
    var root = T.byId("vc-staff-organico-board");
    if (root) root.hidden = false;
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

  function bind() {
    var history = T.byId("vc-staff-organico-history");
    if (history) {
      history.addEventListener("click", function (ev) {
        var clear = ev.target && ev.target.closest ? ev.target.closest("#vc-staff-organico-clear-filter") : null;
        if (clear) {
          loadHistory("");
          return;
        }
        var tab = ev.target && ev.target.closest ? ev.target.closest("[data-kind]") : null;
        if (tab) {
          var nextKind = String(tab.getAttribute("data-kind") || "all");
          if (nextKind === state.historyKindFilter) return;
          state.historyKindFilter = nextKind;
          state.historyPage = 1;
          renderHistory();
          return;
        }
        var pageBtn = ev.target && ev.target.closest ? ev.target.closest("[data-hist-page]") : null;
        if (pageBtn && !pageBtn.disabled) {
          var dir = pageBtn.getAttribute("data-hist-page");
          var rows = historyRowsForRender();
          var maxPage = historyPageCount(rows);
          if (dir === "prev" && state.historyPage > 1) state.historyPage -= 1;
          else if (dir === "next" && state.historyPage < maxPage) state.historyPage += 1;
          renderHistory();
          var list = history.querySelector(".vc-staff-organico-hist");
          if (list && list.scrollIntoView) list.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
  }

  function load() {
    var initial = selectedUserIdFromUrl();
    loadHistory(initial);
  }

  var pageInited = false;
  function initAfterAccess() {
    if (pageInited) return;
    pageInited = true;
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
    if (document.documentElement.classList.contains("vc-staff-app-revealed")) {
      initAfterAccess();
      return;
    }
    window.addEventListener("vc:staff-access-ok", function once() {
      window.removeEventListener("vc:staff-access-ok", once);
      initAfterAccess();
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
