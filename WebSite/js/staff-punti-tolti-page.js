(function () {
  var PAGE_SIZE = 15;
  var state = {
    items: [],
    canReview: false,
    channelId: "",
    page: 1,
    cursors: [null],
    hasMore: false,
    pendingOnly: false,
    busy: false,
    reviewBusyId: "",
  };
  var hostEl = null;

  function T() {
    return window.VCStaffTools;
  }

  function qs(sel) {
    if (!hostEl) return null;
    return hostEl.querySelector(sel);
  }

  function apiBase() {
    var tools = T();
    if (!tools) return "/webhooks/site-staff-pm-points-removed";
    return tools.resolveApiUrl(window.__VC_STAFF_PM_POINTS_REMOVED, "/webhooks/site-staff-pm-points-removed");
  }

  function apiUrl(before) {
    var url = apiBase();
    var q = ["limit=" + encodeURIComponent(String(PAGE_SIZE))];
    if (state.pendingOnly) q.push("pending=1");
    if (before) q.push("before=" + encodeURIComponent(before));
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + q.join("&");
  }

  function statusLabel(status) {
    if (status === "pending") return "In attesa";
    if (status === "confirmed") return "Confermata";
    if (status === "denied") return "Negata";
    return "Registrata";
  }

  function statusClass(status) {
    if (status === "pending") return "vc-staff-pt-status--pending";
    if (status === "confirmed") return "vc-staff-pt-status--confirmed";
    if (status === "denied") return "vc-staff-pt-status--denied";
    return "vc-staff-pt-status--logged";
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return iso;
    }
  }

  function resetPagination() {
    state.page = 1;
    state.cursors = [null];
    state.hasMore = false;
  }

  function setStatus(msg, isError) {
    var tools = T();
    var el = qs("#vc-staff-pt-status");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle("is-error", Boolean(isError));
    if (tools && typeof tools.setStatus === "function") {
      try {
        tools.setStatus("vc-staff-pt-status", msg, Boolean(isError));
      } catch (eSt) {}
    }
  }

  function ensureShell() {
    if (!hostEl) return null;
    if (!qs("#vc-staff-pt-list")) {
      hostEl.innerHTML =
        '<div class="vc-staff-pt-embed">' +
        '<p id="vc-staff-pt-status" class="vc-staff-profile-status mb-3" role="status" aria-live="polite" hidden></p>' +
        '<div id="vc-staff-pt-toolbar"></div>' +
        '<div id="vc-staff-pt-panel" class="vc-staff-pt-board">' +
        '<div id="vc-staff-pt-list" class="vc-staff-pt-list" aria-live="polite"></div>' +
        '<div id="vc-staff-pt-pagination" class="vc-staff-pt-pager" hidden></div>' +
        "</div></div>";
    }
    return qs("#vc-staff-pt-list");
  }

  function renderToolbar() {
    var root = qs("#vc-staff-pt-toolbar");
    if (!root) return;
    root.innerHTML =
      '<div class="vc-staff-pt-board__toolbar">' +
      '<div class="vc-staff-pt-seg" role="group" aria-label="Filtro elenco">' +
      '<button type="button" class="vc-staff-pt-seg__btn' +
      (!state.pendingOnly ? " is-active" : "") +
      '" data-pt-filter="all">Tutti</button>' +
      '<button type="button" class="vc-staff-pt-seg__btn' +
      (state.pendingOnly ? " is-active" : "") +
      '" data-pt-filter="pending">In attesa</button>' +
      "</div>" +
      '<p class="vc-staff-pt-board__hint">Conferma o nega le segnalazioni in attesa prima di chiudere il turno.</p>' +
      "</div>";
    root.querySelectorAll("[data-pt-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = btn.getAttribute("data-pt-filter") === "pending";
        if (next === state.pendingOnly) return;
        state.pendingOnly = next;
        resetPagination();
        load();
      });
    });
  }

  function buildPaginationHtml() {
    var tools = T();
    var count = state.items.length;
    if (!count && state.page <= 1 && !state.hasMore) return "";
    var info =
      count === 1
        ? "1 voce"
        : count + " voci" + (state.page > 1 || state.hasMore ? " · pagina " + state.page : "");
    return (
      '<div class="vc-staff-pt-pager__info">' +
      (tools ? tools.esc(info) : info) +
      "</div>" +
      '<div class="vc-staff-pt-pager__nav">' +
      '<button type="button" class="vc-staff-pt-pager__btn" data-pt-page="prev"' +
      (state.page <= 1 ? " disabled" : "") +
      ">\u2190 Precedente</button>" +
      '<span class="vc-staff-pt-pager__page">Pagina ' +
      state.page +
      "</span>" +
      '<button type="button" class="vc-staff-pt-pager__btn" data-pt-page="next"' +
      (!state.hasMore ? " disabled" : "") +
      ">Successiva \u2192</button>" +
      "</div>"
    );
  }

  function wirePaginationRoot(root) {
    if (!root) return;
    root.querySelectorAll("[data-pt-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled || state.busy) return;
        var dir = btn.getAttribute("data-pt-page");
        if (dir === "prev" && state.page > 1) {
          state.page -= 1;
          load();
        } else if (dir === "next" && state.hasMore) {
          state.page += 1;
          load();
        }
      });
    });
  }

  function renderPagination() {
    var html = buildPaginationHtml();
    var root = qs("#vc-staff-pt-pagination");
    if (!root) return;
    if (!html) {
      root.hidden = true;
      root.innerHTML = "";
      return;
    }
    root.hidden = false;
    root.innerHTML = html;
    wirePaginationRoot(root);
  }

  function renderList() {
    var tools = T();
    var list = ensureShell();
    if (!list || !tools) return;
    if (!state.items.length) {
      list.innerHTML =
        '<div class="vc-staff-pt-empty" role="status">' +
        '<i class="fa fa-inbox vc-staff-pt-empty__ico" aria-hidden="true"></i>' +
        '<p class="vc-staff-pt-empty__title">' +
        (state.pendingOnly ? "Nessuna segnalazione in attesa" : "Nessuna voce trovata") +
        "</p>" +
        '<p class="vc-staff-pt-empty__text">' +
        (state.pendingOnly
          ? "Quando arriva una nuova segnalazione partnership comparirà qui."
          : "Prova a cambiare filtro o riprova più tardi.") +
        "</p></div>";
      renderPagination();
      return;
    }
    var html = "";
    state.items.forEach(function (item) {
      var pm = item.pm || {};
      html +=
        '<article class="vc-staff-pt-card' +
        (item.status === "pending" ? " is-pending" : "") +
        '" data-pt-id="' +
        tools.esc(item.messageId) +
        '">' +
        '<div class="vc-staff-pt-card__head">' +
        tools.avatarImgHtml(pm.avatarUrl, pm.userId, { width: 44, height: 44, className: "vc-staff-pt-card__avatar" }) +
        '<div class="vc-staff-pt-card__who"><strong>' +
        tools.esc(tools.userLabel(pm.displayName, pm.userId, "PM")) +
        '</strong><span class="vc-staff-pt-card__when">' +
        tools.esc(formatWhen(item.createdAt)) +
        '</span></div><span class="vc-staff-pt-status ' +
        statusClass(item.status) +
        '">' +
        tools.esc(statusLabel(item.status)) +
        "</span></div>" +
        '<p class="vc-staff-pt-card__rule">' +
        tools.esc(item.rule || "-") +
        "</p>" +
        '<div class="vc-staff-pt-card__meta">';
      if (item.reporter) {
        html +=
          "<span>Segnalato da <strong>" +
          tools.esc(tools.userLabel(item.reporter.displayName, item.reporter.userId)) +
          "</strong></span>";
      } else if (item.actor) {
        html +=
          "<span>Rimosso da <strong>" +
          tools.esc(tools.userLabel(item.actor.displayName, item.actor.userId)) +
          "</strong></span>";
      }
      if (item.invite) {
        html += "<span>Invite: <code>" + tools.esc(item.invite) + "</code></span>";
      }
      html += '</div><div class="vc-staff-pt-card__links">';
      if (item.messageLink) {
        html +=
          '<a class="vc-staff-pt-card__link" href="' +
          tools.esc(item.messageLink) +
          '" target="_blank" rel="noopener noreferrer"><i class="fa fa-external-link" aria-hidden="true"></i> Messaggio partnership</a>';
      }
      if (item.discordMessageUrl) {
        html +=
          '<a class="vc-staff-pt-card__link" href="' +
          tools.esc(item.discordMessageUrl) +
          '" target="_blank" rel="noopener noreferrer"><i class="fa fa-comments-o" aria-hidden="true"></i> Vai al messaggio</a>';
      }
      html += "</div>";
      if (state.canReview && item.canReview && item.status === "pending") {
        html +=
          '<div class="vc-staff-pt-card__actions">' +
          '<button type="button" class="vc-staff-pt-btn vc-staff-pt-btn--deny" data-pt-deny="' +
          tools.esc(item.messageId) +
          '">Nega</button>' +
          '<button type="button" class="vc-staff-pt-btn vc-staff-pt-btn--ok" data-pt-confirm="' +
          tools.esc(item.messageId) +
          '">Conferma rimozione</button></div>';
      }
      html += "</article>";
    });
    list.innerHTML = html;
    list.querySelectorAll("[data-pt-confirm]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        review(btn.getAttribute("data-pt-confirm"), "confirm");
      });
    });
    list.querySelectorAll("[data-pt-deny]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        review(btn.getAttribute("data-pt-deny"), "deny");
      });
    });
    renderPagination();
  }

  function review(messageId, action) {
    var tools = T();
    if (!tools || !messageId || state.reviewBusyId) return;
    state.reviewBusyId = messageId;
    setStatus("Elaborazione...", false);
    tools
      .fetchJson(apiBase(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action,
          messageId: messageId,
          channelId: state.channelId || undefined,
        }),
      })
      .then(function (out) {
        state.reviewBusyId = "";
        var ok = out.data && out.data.ok;
        setStatus((out.data && out.data.message) || "Operazione completata.", !ok);
        if (ok) load();
      })
      .catch(function () {
        state.reviewBusyId = "";
        setStatus("Errore di rete.", true);
      });
  }

  function load() {
    var tools = T();
    if (!tools || !hostEl || state.busy) return;
    state.busy = true;
    state.items = [];
    ensureShell();
    var list = qs("#vc-staff-pt-list");
    if (list) {
      list.innerHTML =
        '<div class="vc-staff-inbox-loading" role="status"><div class="vc-staff-inbox-loading__head">' +
        '<span class="vc-staff-inbox-loading__spinner" aria-hidden="true"></span>' +
        "<p>Caricamento punti tolti\u2026</p></div></div>";
    }
    var before = state.cursors[state.page - 1] || null;
    tools.whenDiscordSessionReady(function () {
      if (!tools.getToken()) {
        state.busy = false;
        setStatus("Accedi per continuare.", true);
        return;
      }
      tools
        .fetchJson(apiUrl(before), { timeoutMs: 45000 })
        .then(function (out) {
          state.busy = false;
          if (!out.res.ok || !out.data || !out.data.ok) {
            setStatus(
              (out.data && out.data.message) ||
                "Impossibile caricare i punti tolti." +
                  (out.res && out.res.status ? " (HTTP " + out.res.status + ")" : ""),
              true,
            );
            return;
          }
          var payload = out.data;
          state.canReview = Boolean(payload.canReview);
          state.channelId = String(payload.channelId || "");
          state.items = Array.isArray(payload.items) ? payload.items : [];
          var pag = payload.pagination || {};
          state.hasMore = Boolean(pag.hasMore && pag.nextBefore);
          if (state.hasMore && pag.nextBefore) {
            state.cursors[state.page] = pag.nextBefore;
          } else if (state.cursors.length > state.page) {
            state.cursors.length = state.page;
          }
          renderToolbar();
          renderList();
          setStatus("", false);
        })
        .catch(function () {
          state.busy = false;
          setStatus("Errore di rete.", true);
        });
    });
  }

  function mount(host) {
    if (!host) return false;
    if (!T()) return false;
    if (hostEl === host && qs("#vc-staff-pt-list")) {
      load();
      return true;
    }
    hostEl = host;
    host.classList.add("vc-staff-pt-inbox-host");
    resetPagination();
    state.pendingOnly = false;
    ensureShell();
    renderToolbar();
    load();
    return true;
  }

  function unmount() {
    state.busy = false;
    state.reviewBusyId = "";
    if (hostEl) {
      try {
        hostEl.classList.remove("vc-staff-pt-inbox-host");
        hostEl.innerHTML = "";
      } catch (eUm) {}
    }
    hostEl = null;
  }

  function refresh() {
    if (!hostEl) return;
    resetPagination();
    load();
  }

  window.VCStaffPuntiTolti = {
    mount: mount,
    unmount: unmount,
    refresh: refresh,
  };

  // Pagina legacy standalone (prima del redirect): se presente, monta sul panel.
  try {
    if (document.body && document.body.classList.contains("vc-staff-punti-tolti-page") && T()) {
      T().bootPage(function () {
        var panel = document.getElementById("vc-staff-pt-panel");
        var wrap = document.getElementById("vc-staff-pt-toolbar");
        var host = document.createElement("div");
        host.id = "vc-staff-pt-embed-host";
        if (wrap && wrap.parentNode) wrap.parentNode.insertBefore(host, wrap);
        else if (panel && panel.parentNode) panel.parentNode.insertBefore(host, panel);
        if (wrap) wrap.remove();
        if (panel) panel.remove();
        var st = document.getElementById("vc-staff-pt-status");
        if (st) st.remove();
        mount(host);
        T().registerPtrRefresh(refresh);
      });
    }
  } catch (eBoot) {}
})();
