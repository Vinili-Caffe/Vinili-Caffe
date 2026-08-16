(function () {
  var T = window.VCStaffTools;
  if (!T) return;

  var state = {
    sections: [],
    member: null,
    selectedId: "",
    query: "",
    busy: false,
  };

  function apiUrl(userId) {
    var base = T.resolveApiUrl(window.__VC_STAFF_MANAGE, "/webhooks/site-staff-manage");
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

  function flatMembers() {
    var out = [];
    (state.sections || []).forEach(function (sec) {
      (sec.members || []).forEach(function (m) {
        out.push(m);
      });
    });
    return out;
  }

  function matchesQuery(m, q) {
    if (!q) return true;
    var hay = (m.displayName + " " + m.username + " " + m.userId + " " + (m.displayRoleLabel || "")).toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function renderRoster() {
    var list = T.byId("vc-staff-manage-roster");
    if (!list) return;
    var q = String(state.query || "").trim().toLowerCase();
    var html = "";
    var shown = 0;
    (state.sections || []).forEach(function (sec) {
      var members = (sec.members || []).filter(function (m) {
        return matchesQuery(m, q);
      });
      if (!members.length) return;
      html +=
        '<div class="vc-staff-manage-sec"><p class="vc-staff-manage-sec__title" style="--vc-staff-role-color:' +
        T.esc(sec.color || "#d4a888") +
        '">' +
        T.esc(sec.roleLabel) +
        " (" +
        members.length +
        ")</p><ul class=\"vc-staff-manage-list\">";
      members.forEach(function (m) {
        shown += 1;
        var active = String(m.userId) === String(state.selectedId);
        html +=
          '<li><button type="button" class="vc-staff-manage-person' +
          (active ? " is-active" : "") +
          (m.onPause ? " is-paused" : "") +
          '" data-user-id="' +
          T.esc(m.userId) +
          '">' +
          T.avatarImgHtml(m.avatarUrl, m.userId, { width: 36, height: 36 }) +
          "<span><strong>" +
          T.esc(m.displayName) +
          "</strong><em>+" +
          T.esc(m.positive || 0) +
          " / −" +
          T.esc(m.negative || 0) +
          " · w" +
          T.esc(m.warn || 0) +
          (m.onPause ? " · pausa" : "") +
          "</em></span></button></li>";
      });
      html += "</ul></div>";
    });
    if (!shown) {
      html = '<p class="vc-staff-manage-empty">Nessun membro trovato.</p>';
    }
    list.innerHTML = html;
  }

  function entriesHtml(entries, kind) {
    if (!entries || !entries.length) {
      return '<p class="vc-staff-manage-empty">Nessuna voce.</p>';
    }
    return (
      '<ul class="vc-staff-manage-entries">' +
      entries
        .map(function (e) {
          return (
            "<li><span>#" +
            T.esc(e.id) +
            " · " +
            T.esc(e.text) +
            '</span><button type="button" class="vc-staff-manage-entry-rm" data-rm-kind="' +
            T.esc(kind) +
            '" data-rm-id="' +
            T.esc(e.id) +
            '">Rimuovi</button></li>'
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function historyHtml(rows) {
    if (!rows || !rows.length) return '<p class="vc-staff-manage-empty">Nessuna storia ruoli.</p>';
    return (
      '<ul class="vc-staff-manage-history">' +
      rows
        .map(function (r) {
          return (
            "<li><strong>" +
            T.esc(r.from) +
            " → " +
            T.esc(r.to) +
            "</strong>" +
            (r.reason ? "<span>" + T.esc(r.reason) + "</span>" : "") +
            (r.date ? "<em>" + T.esc(String(r.date).slice(0, 10)) + "</em>" : "") +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function renderDetail() {
    var panel = T.byId("vc-staff-manage-detail");
    if (!panel) return;
    var m = state.member;
    if (!m) {
      panel.innerHTML =
        '<div class="vc-staff-manage-placeholder"><p>Seleziona un membro dalla directory per gestirlo.</p></div>';
      return;
    }
    var html =
      '<header class="vc-staff-manage-detail__head">' +
      T.avatarImgHtml(m.avatarUrl, m.userId, { width: 56, height: 56 }) +
      "<div><h2>" +
      T.esc(m.displayName) +
      "</h2><p>" +
      T.esc(m.displayRoleLabel || "") +
      (m.onPause ? " · in pausa" : "") +
      (m.isPm ? " · PM" : "") +
      '</p></div></header>' +
      '<div class="vc-staff-profile-stats">' +
      '<div class="vc-staff-profile-stat"><p class="vc-staff-profile-stat__value">' +
      T.esc(m.valutazioni.positive) +
      '</p><p class="vc-staff-profile-stat__label">Val +</p></div>' +
      '<div class="vc-staff-profile-stat"><p class="vc-staff-profile-stat__value">' +
      T.esc(m.valutazioni.negative) +
      '</p><p class="vc-staff-profile-stat__label">Val −</p></div>' +
      '<div class="vc-staff-profile-stat"><p class="vc-staff-profile-stat__value">' +
      T.esc(m.warn.count) +
      '</p><p class="vc-staff-profile-stat__label">Warn</p></div></div>';

    html +=
      '<section class="vc-staff-manage-actions"><h3>Azioni</h3>' +
      '<div class="vc-staff-manage-action-grid">' +
      actionBtn("pex", "Pex (+1 livello)", !m.canPex) +
      actionBtn("depex", "Depex scala", !m.canDepexLadder) +
      actionBtn("depex_pm", "Depex PM", !m.canDepexPm) +
      actionBtn("depex_full", "Depex completo", false, true) +
      actionBtn("val_pos", "Valutazione +", false) +
      actionBtn("val_neg", "Valutazione −", false) +
      actionBtn("warn_add", "Warn staff", false, true) +
      "</div>" +
      '<label class="vc-staff-manage-reason"><span>Motivo</span>' +
      '<textarea id="vc-staff-manage-reason" rows="2" maxlength="500" placeholder="Motivo obbligatorio per le azioni…"></textarea></label>' +
      '<p id="vc-staff-manage-action-status" class="vc-staff-manage-action-status" role="status" hidden></p>' +
      "</section>";

    html +=
      '<div class="vc-staff-manage-cols">' +
      '<section><h3>Val +</h3>' +
      entriesHtml(m.valutazioni.positiveEntries, "val_pos_rm") +
      "</section>" +
      "<section><h3>Val −</h3>" +
      entriesHtml(m.valutazioni.negativeEntries, "val_neg_rm") +
      "</section>" +
      "<section><h3>Warn</h3>" +
      entriesHtml(m.warn.entries, "warn_rm") +
      "</section></div>";

    html += "<section><h3>Storia ruoli</h3>" + historyHtml(m.rolesHistory) + "</section>";
    panel.innerHTML = html;
  }

  function actionBtn(action, label, disabled, danger) {
    return (
      '<button type="button" class="vc-staff-manage-act' +
      (danger ? " vc-staff-manage-act--danger" : "") +
      '" data-action="' +
      T.esc(action) +
      '"' +
      (disabled ? " disabled" : "") +
      ">" +
      T.esc(label) +
      "</button>"
    );
  }

  function setActionStatus(text, isError) {
    var el = T.byId("vc-staff-manage-action-status");
    if (!el) return;
    el.textContent = String(text || "");
    el.hidden = !text;
    el.classList.toggle("is-error", Boolean(isError));
  }

  function selectMember(userId) {
    state.selectedId = String(userId || "");
    setUrlUser(state.selectedId);
    renderRoster();
    if (!state.selectedId) {
      state.member = null;
      renderDetail();
      return;
    }
    T.setStatus("vc-staff-manage-status", "Caricamento membro…", false);
    T.fetchJson(apiUrl(state.selectedId))
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          T.setStatus(
            "vc-staff-manage-status",
            (out.data && out.data.message) || "Impossibile caricare il membro.",
            true,
          );
          return;
        }
        if (out.data.sections) state.sections = out.data.sections;
        state.member = out.data.member || null;
        renderRoster();
        renderDetail();
        T.setStatus("vc-staff-manage-status", "", false);
      })
      .catch(function () {
        T.setStatus("vc-staff-manage-status", "Errore di rete.", true);
      });
  }

  function postAction(action, extra) {
    if (state.busy || !state.selectedId) return;
    var reasonEl = T.byId("vc-staff-manage-reason");
    var reason = reasonEl ? String(reasonEl.value || "").trim() : "";
    var needsReason = action.indexOf("_rm") === -1;
    if (needsReason && reason.length < 3) {
      setActionStatus("Inserisci un motivo (almeno 3 caratteri).", true);
      return;
    }
    var confirmMsg =
      action === "depex_full"
        ? "Confermi il depex completo di questo membro?"
        : action === "warn_add"
          ? "Confermi il warn staff?"
          : null;
    if (confirmMsg && !window.confirm(confirmMsg)) return;

    state.busy = true;
    setActionStatus("Esecuzione in corso…", false);
    var body = Object.assign(
      {
        action: action,
        userId: state.selectedId,
        reason: reason || undefined,
      },
      extra || {},
    );
    T.fetchJson(apiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (out) {
        state.busy = false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          setActionStatus((out.data && out.data.message) || "Azione non riuscita.", true);
          return;
        }
        state.member = out.data.member || state.member;
        setActionStatus(out.data.message || "Operazione completata.", false);
        if (reasonEl) reasonEl.value = "";
        // Refresh roster counts
        return T.fetchJson(apiUrl()).then(function (rosterOut) {
          if (rosterOut.data && rosterOut.data.ok && rosterOut.data.sections) {
            state.sections = rosterOut.data.sections;
            renderRoster();
          }
          renderDetail();
        });
      })
      .catch(function () {
        state.busy = false;
        setActionStatus("Errore di rete.", true);
      });
  }

  function bind() {
    var search = T.byId("vc-staff-manage-search");
    if (search) {
      search.addEventListener("input", function () {
        state.query = String(search.value || "");
        renderRoster();
      });
    }
    var roster = T.byId("vc-staff-manage-roster");
    if (roster) {
      roster.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-user-id]") : null;
        if (!btn) return;
        selectMember(btn.getAttribute("data-user-id"));
      });
    }
    var detail = T.byId("vc-staff-manage-detail");
    if (detail) {
      detail.addEventListener("click", function (ev) {
        var act = ev.target && ev.target.closest ? ev.target.closest("[data-action]") : null;
        if (act && !act.disabled) {
          postAction(act.getAttribute("data-action"));
          return;
        }
        var rm = ev.target && ev.target.closest ? ev.target.closest("[data-rm-kind]") : null;
        if (rm) {
          var kind = rm.getAttribute("data-rm-kind");
          var id = Number(rm.getAttribute("data-rm-id") || 0);
          if (!window.confirm("Rimuovere la voce #" + id + "?")) return;
          postAction(kind, { removeId: id });
        }
      });
    }
  }

  function load() {
    if (!T.getToken()) {
      T.setStatus("vc-staff-manage-status", "Sessione Discord assente.", true);
      return;
    }
    T.setStatus("vc-staff-manage-status", "Caricamento gestione…", false);
    var initial = selectedUserIdFromUrl();
    T.fetchJson(apiUrl(initial || ""))
      .then(function (out) {
        if (out.res.status === 403) {
          T.setStatus(
            "vc-staff-manage-status",
            (out.data && out.data.message) || "Solo High Staff può accedere alla gestione.",
            true,
          );
          var root = T.byId("vc-staff-manage");
          if (root) {
            root.innerHTML =
              '<div class="vc-staff-manage-forbidden"><p>Questa console è riservata agli High Staff.</p><a href="/staff/">Torna alla dashboard</a></div>';
            root.hidden = false;
          }
          return;
        }
        if (!out.res.ok || !out.data || !out.data.ok) {
          T.setStatus(
            "vc-staff-manage-status",
            (out.data && out.data.message) || "Impossibile caricare la gestione.",
            true,
          );
          return;
        }
        state.sections = out.data.sections || [];
        state.member = out.data.member || null;
        state.selectedId = (state.member && state.member.userId) || initial || "";
        var root = T.byId("vc-staff-manage");
        if (root) root.hidden = false;
        var counts = out.data.counts || {};
        var summary = T.byId("vc-staff-manage-summary");
        if (summary) {
          summary.hidden = false;
          summary.textContent =
            (counts.total || 0) + " in staff · " + (counts.onPause || 0) + " in pausa";
        }
        renderRoster();
        renderDetail();
        T.setStatus("vc-staff-manage-status", "", false);
      })
      .catch(function () {
        T.setStatus("vc-staff-manage-status", "Errore di rete.", true);
      });
  }

  var pageInited = false;
  function initAfterAccess() {
    if (pageInited) return;
    pageInited = true;
    bind();
    load();
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
