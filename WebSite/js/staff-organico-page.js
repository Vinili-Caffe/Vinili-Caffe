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
    if (card) {
      card.hidden = true;
      card.innerHTML = "";
    }
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

  function buildHistoryPaginationHtml(rows) {
    var total = rows.length;
    if (total <= HISTORY_PAGE_SIZE) return "";
    var totalPages = historyPageCount(rows);
    var page = state.historyPage;

    function gap() {
      return '<span class="vc-staff-pt-seg__btn vc-staff-inbox-pagination__gap" aria-hidden="true">\u2026</span>';
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
      '<div class="vc-staff-inbox-pagination vc-staff-organico-hist__pagination">' +
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
    // organicoSilhouette3: force site silhouette — never Discord embed/CDN on organico list.
    try {
      var siteFb =
        window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function"
          ? window.VcDiscordAvatar.siteFallbackAvatarUrl()
          : "";
      if (!siteFb) return;
      var imgs = panel.querySelectorAll(".vc-staff-organico-hist__av img");
      for (var i = 0; i < imgs.length; i += 1) {
        var img = imgs[i];
        var src = String(img.getAttribute("src") || img.src || "").trim();
        var isDiscord =
          /discord(app)?\.(com|net)/i.test(src) ||
          /\/embed\/avatars\//i.test(src) ||
          !src ||
          /^https?:\/\//i.test(src);
        var keepSvg = /^data:image\/svg\+xml/i.test(src) && src.indexOf("stop-color") >= 0;
        if (keepSvg && !/discord/i.test(src)) continue;
        if (isDiscord || !keepSvg) {
          img.removeAttribute("srcset");
          img.src = siteFb;
          img.setAttribute("src", siteFb);
          img.classList.add("vc-avatar", "vc-avatar--ready", "vc-avatar-fallback-img");
          img.classList.remove("vc-avatar--pending");
          try {
            img.dataset.vcAvatarOk = "1";
            img.dataset.vcAvatarFallbackFinal = "1";
          } catch (eDs) {}
        }
      }
    } catch (eForce) {}
  }

  function organicoSafeAvatarUrl(url) {
    // organicoSilhouette3: always empty → site silhouette (no Discord embed/CDN).
    var s = String(url || "").trim();
    if (/^data:image\/svg\+xml/i.test(s) && !/discord/i.test(s)) return s;
    return "";
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

    // organicoOnePag1: single pagination bar at bottom (inbox pattern).
    var pagination = buildHistoryPaginationHtml(rows);

    panel.innerHTML =
      head +
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
            T.avatarImgHtml(organicoSafeAvatarUrl(r.avatarUrl), r.userId, {
              width: 44,
              height: 44,
              className: "vc-staff-avatar",
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
        var tab =
          ev.target && ev.target.closest
            ? ev.target.closest(".vc-staff-pt-seg__btn[data-kind]")
            : null;
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
          if (nextPage === state.historyPage) return;
          state.historyPage = nextPage;
          renderHistory();
          var list = history.querySelector(".vc-staff-organico-hist");
          if (list && list.scrollTop != null) list.scrollTop = 0;
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
