(function () {
  var T = window.VCStaffTools;
  if (!T) return;

  var state = {
    sections: [],
    member: null,
    selectedId: "",
    busy: false,
    pmManageOnly: false,
    readOnly: false,
    selfService: false,
    canManage: false,
    viewerId: "",
    historyPage: 1,
  };

  var HISTORY_PAGE_SIZE = 8;

  var HISTORY_KIND_LABEL = {
    pex: "Pex",
    depex: "Depex",
    val_pos: "Val +",
    val_neg: "Val −",
    warn: "Warn",
    val_pos_rm: "Val + rimossa",
    val_neg_rm: "Val − rimossa",
    warn_rm: "Warn rimosso",
  };

  function isViewingSelf() {
    var vid = String(state.viewerId || "").trim();
    var sid = String(state.selectedId || (state.member && state.member.userId) || "").trim();
    return Boolean(vid && sid && vid === sid);
  }

  function canSelfServiceOnView() {
    return Boolean(state.selfService && isViewingSelf());
  }

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

  function renderRoster() {
    var list = T.byId("vc-staff-manage-roster");
    if (!list) return;
    var html = "";
    var shown = 0;
    (state.sections || []).forEach(function (sec) {
      var members = sec.members || [];
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
        var isPmOnly =
          m.isPmOnly === true ||
          String(m.profileKind || "").toLowerCase() === "pm_only";
        var meta = isPmOnly
          ? m.onPause
            ? "Partner Manager \u00B7 pausa"
            : "Partner Manager"
          : "+" +
            T.esc(m.positive || 0) +
            " / \u2212" +
            T.esc(m.negative || 0) +
            " \u00B7 w" +
            T.esc(m.warn || 0) +
            (m.onPause ? " \u00B7 pausa" : "");
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
          "</strong><em>" +
          meta +
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
    var pos = Number(
      (state.member && state.member.valutazioni && state.member.valutazioni.positive) || 0,
    );
    var selfOk = canSelfServiceOnView();
    var canTradeNeg =
      ((!state.readOnly && state.canManage) || selfOk) && kind === "val_neg_rm" && pos >= 3;
    var canTradeWarn = !state.readOnly && state.canManage && kind === "warn_rm" && pos >= 1;
    var canRemove = !state.readOnly && state.canManage;
    return (
      '<ul class="vc-staff-manage-entries">' +
      entries
        .map(function (e) {
          var actions = "";
          if (canTradeNeg || canTradeWarn || canRemove) {
            actions =
              '<span class="vc-staff-manage-entry-acts">' +
              (canTradeNeg
                ? '<button type="button" class="vc-staff-manage-entry-trade" data-val-trade="neg_trade" data-neg-id="' +
                  T.esc(e.id) +
                  '" title="Scambia 3 val + per rimuovere questa val −">Compensa 3+</button>'
                : "") +
              (canTradeWarn
                ? '<button type="button" class="vc-staff-manage-entry-trade" data-val-trade="warn_trade" data-warn-id="' +
                  T.esc(e.id) +
                  '" title="Scambia val + per rimuovere questo warn">Scambia val +</button>'
                : "") +
              (canRemove
                ? '<button type="button" class="vc-staff-manage-entry-rm" data-rm-kind="' +
                  T.esc(kind) +
                  '" data-rm-id="' +
                  T.esc(e.id) +
                  '">Rimuovi</button>'
                : "") +
              "</span>";
          }
          return (
            "<li><span>#" +
            T.esc(e.id) +
            " \u00B7 " +
            T.esc(e.text) +
            "</span>" +
            actions +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function pauseTradeRowHtml(m) {
    if (state.readOnly || !state.canManage) return "";
    var pos = Number((m.valutazioni && m.valutazioni.positive) || 0);
    if (pos < 1) return "";
    return (
      '<div class="vc-staff-manage-pause-trade">' +
      '<span class="vc-staff-manage-pause-trade__label">Val + \u2192 pausa</span>' +
      '<input id="vc-staff-manage-trade-pos-count" type="number" min="1" max="50" value="1" aria-label="Val + da usare" />' +
      '<input id="vc-staff-manage-trade-pause-days" type="number" min="1" max="60" value="1" aria-label="Giorni pausa" />' +
      '<button type="button" class="vc-staff-manage-entry-trade" data-val-trade="pos_pause_trade">Scambia</button>' +
      "</div>"
    );
  }

  function historyKindLabel(kind) {
    var k = String(kind || "").toLowerCase();
    return HISTORY_KIND_LABEL[k] || k || "Evento";
  }

  function historyRowsForMember(m) {
    if (!m) return [];
    if (Array.isArray(m.trackHistory) && m.trackHistory.length) return m.trackHistory;
    var legacy = Array.isArray(m.rolesHistory) ? m.rolesHistory : [];
    return legacy.map(function (r) {
      return {
        kind: r.kind || "pex",
        from: r.from,
        to: r.to,
        reason: r.reason,
        date: r.date,
        actorId: r.actorId || null,
        actorName: r.actorName || null,
        entryId: null,
      };
    });
  }

  function historyMainLine(r) {
    var kind = String(r.kind || "").toLowerCase();
    if (kind === "pex" || kind === "depex") {
      return T.esc(r.from || "—") + " \u2192 " + T.esc(r.to || "—");
    }
    var idPart = r.entryId ? "#" + T.esc(String(r.entryId)) + " \u00B7 " : "";
    return idPart + T.esc(historyKindLabel(kind));
  }

  function historyActorLine(r) {
    var name = String(r.actorName || "").trim();
    var id = String(r.actorId || "").trim();
    if (!name && !id) return "Autore non registrato";
    var verb = String(r.kind || "").indexOf("_rm") >= 0 ? "Rimosso da" : "Eseguito da";
    if (String(r.kind || "") === "pex") verb = "Pexato da";
    if (String(r.kind || "") === "depex") verb = "Depexato da";
    if (String(r.kind || "") === "warn") verb = "Assegnato da";
    if (String(r.kind || "") === "warn_rm") verb = "Rimosso da";
    if (String(r.kind || "") === "val_pos" || String(r.kind || "") === "val_neg") verb = "Assegnato da";
    return verb + " " + T.esc(name || id);
  }

  function historyPagerHtml(total, page) {
    var pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
    if (pages <= 1) return "";
    var cur = Math.min(pages, Math.max(1, page || 1));
    return (
      '<nav class="vc-staff-manage-history-pager vc-mini-pager" data-hist-pager aria-label="Paginazione cronologia">' +
      '<button type="button" class="vc-mini-pager__arrow" data-hist-page="' +
      T.esc(String(cur - 1)) +
      '"' +
      (cur <= 1 ? " disabled" : "") +
      ' aria-label="Pagina precedente"><i class="fa fa-chevron-left" aria-hidden="true"></i></button>' +
      '<span class="vc-staff-manage-history-pager__label">Pagina ' +
      T.esc(String(cur)) +
      " / " +
      T.esc(String(pages)) +
      "</span>" +
      '<button type="button" class="vc-mini-pager__arrow" data-hist-page="' +
      T.esc(String(cur + 1)) +
      '"' +
      (cur >= pages ? " disabled" : "") +
      ' aria-label="Pagina successiva"><i class="fa fa-chevron-right" aria-hidden="true"></i></button>' +
      "</nav>"
    );
  }

  function historyHtml(rows, page) {
    if (!rows || !rows.length) {
      return '<p class="vc-staff-manage-empty">Nessuna variazione registrata.</p>';
    }
    var pages = Math.max(1, Math.ceil(rows.length / HISTORY_PAGE_SIZE));
    var cur = Math.min(pages, Math.max(1, Number(page) || 1));
    var start = (cur - 1) * HISTORY_PAGE_SIZE;
    var slice = rows.slice(start, start + HISTORY_PAGE_SIZE);
    return (
      '<ul class="vc-staff-manage-history">' +
      slice
        .map(function (r) {
          return (
            '<li class="vc-staff-manage-history__item is-' +
            T.esc(String(r.kind || "event").replace(/_/g, "-")) +
            '"><span class="vc-staff-manage-history__kind">' +
            T.esc(historyKindLabel(r.kind)) +
            "</span><strong>" +
            historyMainLine(r) +
            "</strong>" +
            (r.reason ? "<span>" + T.esc(r.reason) + "</span>" : "") +
            '<em class="vc-staff-manage-history__meta">' +
            historyActorLine(r) +
            (r.date ? " \u00B7 " + T.esc(String(r.date).slice(0, 10)) : "") +
            "</em></li>"
          );
        })
        .join("") +
      "</ul>" +
      historyPagerHtml(rows.length, cur)
    );
  }

  function pauseStatusClass(label) {
    var s = String(label || "").toLowerCase();
    if (s.indexOf("corso") >= 0 || s.indexOf("programmata") >= 0) return "is-live";
    if (s.indexOf("richiesta") >= 0) return "is-pending";
    if (s.indexOf("finita") >= 0) return "is-ended";
    if (s.indexOf("annull") >= 0 || s.indexOf("rifiut") >= 0) return "is-cancelled";
    return "";
  }

  function pauseEntryActions(entry) {
    if (!entry) return "";
    var selfOk = canSelfServiceOnView();
    if (state.readOnly && !selfOk) return "";
    var html = '<div class="vc-staff-manage-pause-actions">';
    if (!state.readOnly && entry.canAct) {
      html +=
        '<button type="button" class="vc-staff-manage-pause-act vc-staff-manage-pause-act--ok" data-pause-action="pause_accept" data-pause-id="' +
        T.esc(entry.id) +
        '">Accetta</button>' +
        '<button type="button" class="vc-staff-manage-pause-act vc-staff-manage-pause-act--no" data-pause-action="pause_reject" data-pause-id="' +
        T.esc(entry.id) +
        '">Rifiuta</button>';
    } else if (entry.canCancel && (!state.readOnly || selfOk)) {
      html +=
        '<button type="button" class="vc-staff-manage-pause-act vc-staff-manage-pause-act--warn" data-pause-action="pause_cancel" data-pause-id="' +
        T.esc(entry.id) +
        '">Annulla pausa</button>';
    }
    html += "</div>";
    return html;
  }

  function pauseSectionHtml(m) {
    var p = m.pause || {};
    var sum = p.summary || {};
    var history = p.history || [];
    var html =
      '<section class="vc-staff-manage-pause"><h3><i class="fa fa-coffee" aria-hidden="true"></i> Pause</h3>' +
      '<p class="vc-staff-manage-pause-summary">' +
      T.esc(sum.daysUsed || 0) +
      " usati \u00B7 " +
      T.esc(sum.daysRemaining || 0) +
      " rimanenti \u00B7 limite " +
      T.esc(sum.maxDays || sum.baseLimit || 0) +
      (sum.bonusDays ? " · +" + T.esc(sum.bonusDays) + " extra" : "") +
      "</p>" +
      pauseTradeRowHtml(m);

    if (sum.activePause) {
      var ap = sum.activePause;
      html +=
        '<div class="vc-staff-manage-pause-banner is-live"><strong>In pausa adesso</strong><span>' +
        T.esc(ap.start) +
        " \u2192 " +
        T.esc(ap.end) +
        (ap.ruolo ? " \u00B7 " + T.esc(ap.ruolo) : "") +
        "</span>" +
        pauseEntryActions(ap) +
        "</div>";
    } else if (sum.pendingPause) {
      var pp = sum.pendingPause;
      html +=
        '<div class="vc-staff-manage-pause-banner is-pending"><strong>Richiesta in attesa</strong><span>' +
        T.esc(pp.start) +
        " \u2192 " +
        T.esc(pp.end) +
        (pp.ruoloRichiesto ? " \u00B7 " + T.esc(pp.ruoloRichiesto) : "") +
        "</span>" +
        pauseEntryActions(pp) +
        "</div>";
    }

    if (!history.length) {
      if (!sum.activePause && !sum.pendingPause) {
        html += '<p class="vc-staff-manage-empty">Nessuna pausa registrata.</p>';
      }
    } else {
      html += '<ul class="vc-staff-manage-pause-list">';
      history.forEach(function (entry) {
        html +=
          '<li class="vc-staff-manage-pause-item ' +
          pauseStatusClass(entry.statusLabel) +
          '"><div class="vc-staff-manage-pause-item__head"><strong>' +
          T.esc(entry.start) +
          " \u2192 " +
          T.esc(entry.end) +
          '</strong><span class="vc-staff-manage-pause-chip">' +
          T.esc(entry.statusLabel || entry.status || "") +
          "</span></div>" +
          '<p class="vc-staff-manage-pause-item__meta">' +
          (entry.ruoloRichiesto || entry.ruolo
            ? T.esc(entry.ruolo || entry.ruoloRichiesto) + " \u00B7 "
            : "") +
          T.esc(entry.giorniScalati || 0) +
          " giorni conteggiati quest'anno" +
          (entry.timing ? " \u00B7 " + T.esc(entry.timing) : "") +
          "</p>" +
          (entry.motivazione
            ? '<p class="vc-staff-manage-pause-item__reason">' + T.esc(entry.motivazione) + "</p>"
            : "") +
          pauseEntryActions(entry) +
          "</li>";
      });
      html += "</ul>";
    }

    html +=
      '<p id="vc-staff-manage-pause-status" class="vc-staff-manage-pause-status" role="status" hidden></p></section>';
    return html;
  }

  function setPauseStatus(text, isError) {
    var el = T.byId("vc-staff-manage-pause-status");
    if (!el) return;
    el.textContent = String(text || "");
    el.hidden = !text;
    el.classList.toggle("is-error", Boolean(isError));
  }

  function memberHeadHtml(m) {
    return (
      '<header class="vc-staff-manage-detail__head">' +
      T.avatarImgHtml(m.avatarUrl, m.userId, { width: 56, height: 56 }) +
      "<div><h2>" +
      T.esc(m.displayName) +
      "</h2><p>" +
      T.esc(m.displayRoleLabel || "") +
      (((m.pause && m.pause.onPause) || m.onPause) ? " \u00B7 in pausa" : "") +
      (m.isPm ? " \u00B7 PM" : "") +
      "</p></div></header>"
    );
  }

  function partnerActionsHtml(rows) {
    if (!rows || !rows.length) return '<p class="vc-staff-manage-empty">Nessuna partnership registrata.</p>';
    return (
      '<ul class="vc-staff-manage-partner-hist">' +
      rows
        .map(function (r) {
          return (
            "<li><strong>" +
            T.esc(r.actionLabel || r.action || "Evento") +
            "</strong>" +
            (r.partner ? "<span>" + T.esc(r.partner) + "</span>" : "") +
            (r.dateLabel ? "<em>" + T.esc(r.dateLabel) + "</em>" : "") +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function readOnlyBannerHtml() {
    if (!state.readOnly) return "";
    if (state.selfService) {
      return (
        '<p class="vc-staff-manage-readonly" role="status">' +
        "<strong>Consultazione staff</strong> — puoi vedere le schede. Sulla tua: annullare le pause e compensare 1 val − con 3 val +." +
        "</p>"
      );
    }
    return (
      '<p class="vc-staff-manage-readonly" role="status">' +
      "<strong>Solo lettura</strong> — puoi consultare le schede, ma non eseguire azioni." +
      "</p>"
    );
  }

  function renderPmOnlyDetail(m) {
    var p = m.partner || {};
    var html = memberHeadHtml(m) + readOnlyBannerHtml();
    html +=
      '<p class="vc-staff-manage-pm-lead">Scheda Partner Manager con punti, partnership e attività recenti.</p>' +
      '<div class="vc-staff-profile-stats">' +
      '<div class="vc-staff-profile-stat"><p class="vc-staff-profile-stat__value">' +
      T.esc(p.pointsSpendable || 0) +
      '</p><p class="vc-staff-profile-stat__label">Punti spendibili</p></div>' +
      '<div class="vc-staff-profile-stat"><p class="vc-staff-profile-stat__value">' +
      T.esc(p.pointsEarned || 0) +
      '</p><p class="vc-staff-profile-stat__label">Partnership</p></div>' +
      '<div class="vc-staff-profile-stat"><p class="vc-staff-profile-stat__value">' +
      T.esc(p.partnerCount || 0) +
      '</p><p class="vc-staff-profile-stat__label">Server partner</p></div></div>';
    html +=
      '<p class="vc-staff-manage-pm-meta">' +
      T.esc(p.redeemSpend || 0) +
      " punti già riscattati · " +
      T.esc(p.pointsEarned || 0) +
      " guadagnati · " +
      T.esc(p.pointsSpendable || 0) +
      " spendibili</p>";
    html += pauseSectionHtml(m);
    if (!state.readOnly) {
      html +=
        '<section class="vc-staff-manage-actions"><h3>Azioni PM</h3>' +
        '<div class="vc-staff-manage-action-grid">' +
        actionBtn("pex", "Pex Helper", !m.canPexProspect) +
        actionBtn("depex_pm", "Depex PM", !m.canDepexPm, true) +
        "</div>";
      if (!state.pmManageOnly) {
        html +=
          '<div class="vc-staff-manage-pm-points">' +
          '<label><span>Punti partnership</span><input id="vc-staff-manage-pm-points-amt" type="number" min="1" max="500" value="1" /></label>' +
          '<div class="vc-staff-manage-action-grid">' +
          '<button type="button" class="vc-staff-manage-act" data-pm-points-action="points_add">Aggiungi punti</button>' +
          '<button type="button" class="vc-staff-manage-act vc-staff-manage-act--danger" data-pm-points-action="points_remove">Rimuovi punti</button>' +
          "</div></div>";
      } else {
        html +=
          '<p class="vc-staff-manage-pm-meta">Punti: ' +
          T.esc(p.pointsSpendable || 0) +
          " spendibili (modifica riservata all'High Staff).</p>";
      }
      html +=
        '<label class="vc-staff-manage-reason"><span>Motivo</span>' +
        '<textarea id="vc-staff-manage-reason" rows="2" maxlength="500" placeholder="Descrivi il motivo dell\u2019azione\u2026"></textarea></label>' +
        '<p id="vc-staff-manage-action-status" class="vc-staff-manage-action-status" role="status" hidden></p>' +
        "</section>";
    }
    html +=
      "<section><h3>Cronologia partnership</h3>" + partnerActionsHtml(p.recentActions) + "</section>";
    html +=
      '<section class="vc-staff-manage-history-sec"><h3>Cronologia pex / depex / val / warn</h3>' +
      historyHtml(historyRowsForMember(m), state.historyPage) +
      "</section>";
    return html;
  }

  function renderStaffDetail(m) {
    var html = memberHeadHtml(m) + readOnlyBannerHtml();
    html +=
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
    if (!state.readOnly) {
      html +=
        '<section class="vc-staff-manage-actions"><h3>Azioni</h3>' +
        '<div class="vc-staff-manage-action-grid">' +
        actionBtn("pex", "Pex", !m.canPex && !m.canPexProspect) +
        actionBtn("depex", "Depex", !m.canDepexLadder) +
        actionBtn("depex_pm", "Depex PM", !m.canDepexPm) +
        actionBtn("depex_full", "Depex completo", false, true) +
        actionBtn("val_pos", "Val +", false) +
        actionBtn("val_neg", "Val −", false) +
        actionBtn("warn_add", "Warn", false, true) +
        "</div>";
      if (m.isPm && m.partner) {
        html +=
          '<div class="vc-staff-manage-pm-points">' +
          '<p class="vc-staff-manage-pm-meta">PM: ' +
          T.esc(m.partner.pointsSpendable || 0) +
          " punti spendibili · " +
          T.esc(m.partner.partnerCount || 0) +
          " partnership</p>";
        if (!state.pmManageOnly) {
          html +=
            '<label><span>Modifica punti</span><input id="vc-staff-manage-pm-points-amt" type="number" min="1" max="500" value="1" /></label>' +
            '<div class="vc-staff-manage-action-grid">' +
            '<button type="button" class="vc-staff-manage-act" data-pm-points-action="points_add">Aggiungi punti</button>' +
            '<button type="button" class="vc-staff-manage-act vc-staff-manage-act--danger" data-pm-points-action="points_remove">Rimuovi punti</button>' +
            "</div>";
        } else {
          html +=
            '<p class="vc-staff-manage-pm-meta">Modifica punti riservata all\'High Staff.</p>';
        }
        html += "</div>";
      }
      html +=
        '<label class="vc-staff-manage-reason"><span>Motivo</span>' +
        '<textarea id="vc-staff-manage-reason" rows="2" maxlength="500" placeholder="Descrivi il motivo dell\u2019azione\u2026"></textarea></label>' +
        '<p id="vc-staff-manage-action-status" class="vc-staff-manage-action-status" role="status" hidden></p>' +
        "</section>";
    } else if (m.isPm && m.partner) {
      html +=
        '<p class="vc-staff-manage-pm-meta">PM: ' +
        T.esc(m.partner.pointsSpendable || 0) +
        " punti spendibili · " +
        T.esc(m.partner.partnerCount || 0) +
        " partnership</p>";
    }
    html +=
      '<div class="vc-staff-manage-cols">' +
      '<section><h3>Val +</h3>' +
      entriesHtml((m.valutazioni && m.valutazioni.positiveEntries) || [], "val_pos_rm") +
      "</section>" +
      "<section><h3>Val −</h3>" +
      entriesHtml((m.valutazioni && m.valutazioni.negativeEntries) || [], "val_neg_rm") +
      "</section>" +
      "<section><h3>Warn</h3>" +
      entriesHtml((m.warn && m.warn.entries) || [], "warn_rm") +
      "</section></div>";
    html +=
      '<section class="vc-staff-manage-history-sec"><h3>Cronologia pex / depex / val / warn</h3>' +
      historyHtml(historyRowsForMember(m), state.historyPage) +
      "</section>";
    html += pauseSectionHtml(m);
    return html;
  }

  function renderDetail() {
    var panel = T.byId("vc-staff-manage-detail");
    if (!panel) return;
    var m = state.member;
    if (!m) {
      panel.innerHTML =
        '<div class="vc-staff-manage-placeholder"><p>Seleziona un membro per aprire la scheda.</p></div>';
      return;
    }
    try {
      panel.innerHTML = m.isPmOnly ? renderPmOnlyDetail(m) : renderStaffDetail(m);
    } catch (err) {
      panel.innerHTML =
        '<div class="vc-staff-manage-placeholder"><p>Errore nel rendering della scheda.</p></div>';
      try {
        console.error("[staff-manage] renderDetail", err);
      } catch (e0) {}
    }
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

  function pmActionsApi(body) {
    var base = T.resolveApiUrl(window.__VC_STAFF_PM_ACTIONS, "/webhooks/site-staff-pm-actions");
    return T.fetchJson(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function postPmPoints(action) {
    if (state.readOnly || state.pmManageOnly) {
      setActionStatus(
        state.pmManageOnly
          ? "Come gestore PM non puoi modificare i punti (solo High Staff)."
          : "Modalità solo lettura: non puoi eseguire azioni.",
        true,
      );
      return;
    }
    if (state.busy || !state.selectedId) return;
    var amtEl = T.byId("vc-staff-manage-pm-points-amt");
    var amount = amtEl ? Number.parseInt(String(amtEl.value || "1"), 10) : 1;
    if (!Number.isInteger(amount) || amount < 1 || amount > 500) {
      setActionStatus("Importo punti tra 1 e 500.", true);
      return;
    }
    state.busy = true;
    setActionStatus("Aggiornamento punti\u2026", false);
    pmActionsApi({ action: action, userId: state.selectedId, amount: amount })
      .then(function (out) {
        state.busy = false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          setActionStatus((out.data && out.data.message) || "Operazione punti non riuscita.", true);
          return;
        }
        setActionStatus(out.data.message || "Punti aggiornati.", false);
        return T.fetchJson(apiUrl(state.selectedId)).then(function (memberOut) {
          if (memberOut.data && memberOut.data.ok) {
            if (memberOut.data.sections) state.sections = memberOut.data.sections;
            state.member = memberOut.data.member || state.member;
            renderRoster();
            renderDetail();
          }
        });
      })
      .catch(function () {
        state.busy = false;
        setActionStatus("Errore di rete.", true);
      });
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
    state.historyPage = 1;
    setUrlUser(state.selectedId);
    renderRoster();
    if (!state.selectedId) {
      state.member = null;
      renderDetail();
      return;
    }
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
        state.historyPage = 1;
        renderRoster();
        renderDetail();
        T.setStatus("vc-staff-manage-status", "", false);
      })
      .catch(function () {
        T.setStatus("vc-staff-manage-status", "Errore di rete.", true);
      });
  }

  function postPauseAction(action, pauseId) {
    var selfCancel = action === "pause_cancel" && canSelfServiceOnView();
    if (state.readOnly && !selfCancel) {
      setActionStatus("Modalità solo lettura: non puoi eseguire azioni.", true);
      return;
    }
    if (state.busy || !state.selectedId || !pauseId) return;

    var confirmPromise = Promise.resolve(true);
    if (action === "pause_cancel") {
      confirmPromise = T.confirm({
        title: "Annulla pausa",
        message: "Annullare la pausa? I giorni già trascorsi verranno scalati dal budget annuale.",
        confirmLabel: "Annulla pausa",
        cancelLabel: "Indietro",
        danger: true,
        icon: "fa-ban",
      });
    } else if (action === "pause_reject") {
      confirmPromise = T.confirm({
        title: "Rifiuta pausa",
        message: "Rifiutare questa richiesta di pausa?",
        confirmLabel: "Rifiuta",
        cancelLabel: "Indietro",
        danger: true,
        icon: "fa-times-circle",
      });
    } else if (action === "pause_accept") {
      confirmPromise = T.confirm({
        title: "Accetta pausa",
        message: "Accettare questa richiesta di pausa?",
        confirmLabel: "Accetta",
        cancelLabel: "Indietro",
        icon: "fa-check-circle",
      });
    }

    confirmPromise.then(function (ok) {
      if (!ok) return;
      state.busy = true;
      setPauseStatus("Esecuzione in corso\u2026", false);
      T.fetchJson(apiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action,
          userId: state.selectedId,
          pauseId: pauseId,
          confirmCancel: action === "pause_cancel",
        }),
      })
        .then(function (out) {
          state.busy = false;
          if (!out.res.ok || !out.data || !out.data.ok) {
            setPauseStatus((out.data && out.data.message) || "Azione pausa non riuscita.", true);
            return;
          }
          state.member = out.data.member || state.member;
          setPauseStatus(out.data.message || "Pausa aggiornata.", false);
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
          setPauseStatus("Errore di rete.", true);
        });
    });
  }

  function valTradeApi(body) {
    var base = T.resolveApiUrl(window.__VC_STAFF_VALTRADE, "/webhooks/site-staff-valtrade");
    return T.fetchJson(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function refreshSelectedMember() {
    return T.fetchJson(apiUrl(state.selectedId)).then(function (memberOut) {
      if (memberOut.data && memberOut.data.ok) {
        if (memberOut.data.sections) state.sections = memberOut.data.sections;
        state.member = memberOut.data.member || state.member;
        renderRoster();
        renderDetail();
      }
    });
  }

  function postValTrade(action, extra) {
    var selfNeg = action === "neg_trade" && canSelfServiceOnView();
    if (state.readOnly && !selfNeg) {
      setActionStatus("Modalità solo lettura: non puoi eseguire azioni.", true);
      return;
    }
    if (action === "pos_pause_trade" && (state.readOnly || !state.canManage)) {
      setActionStatus("Solo High Staff può convertire val + in giorni pausa.", true);
      return;
    }
    if (state.busy || !state.selectedId) return;
    var body = Object.assign({ action: action, userId: state.selectedId }, extra || {});
    var confirmPromise = Promise.resolve(true);

    if (action === "neg_trade") {
      var negId = Number(body.negativeId || 0);
      if (!Number.isInteger(negId) || negId < 1) {
        setActionStatus("Indica l'ID della val − da compensare.", true);
        return;
      }
      confirmPromise = T.confirm({
        title: "Compensa val −",
        message: "Scambiare 3 val + per rimuovere la val − #" + negId + "?",
        confirmLabel: "Compensa",
        cancelLabel: "Annulla",
        icon: "fa-exchange",
      });
    } else if (action === "pos_pause_trade") {
      var posCount = Number(body.positiveCount || 0);
      var pauseDays = Number(body.pauseDays || 0);
      if (!Number.isInteger(posCount) || posCount < 1 || !Number.isInteger(pauseDays) || pauseDays < 1) {
        setActionStatus("Inserisci val + e giorni pausa validi (≥ 1).", true);
        return;
      }
      confirmPromise = T.confirm({
        title: "Val + → pausa",
        message: "Convertire " + posCount + " val + in +" + pauseDays + " giorni pausa extra?",
        confirmLabel: "Scambia",
        cancelLabel: "Annulla",
        icon: "fa-coffee",
      });
    } else {
      setActionStatus("Scambio non valido.", true);
      return;
    }

    confirmPromise.then(function (ok) {
      if (!ok) return;
      state.busy = true;
      setActionStatus("Scambio in corso\u2026", false);
      valTradeApi(body)
        .then(function (out) {
          state.busy = false;
          if (!out.res.ok || !out.data || !out.data.ok) {
            setActionStatus((out.data && out.data.message) || "Scambio non riuscito.", true);
            return;
          }
          setActionStatus(out.data.message || "Scambio completato.", false);
          return Promise.all([
            refreshSelectedMember(),
            T.fetchJson(apiUrl()).then(function (rosterOut) {
              if (rosterOut.data && rosterOut.data.ok && rosterOut.data.sections) {
                state.sections = rosterOut.data.sections;
                renderRoster();
              }
            }),
          ]);
        })
        .catch(function () {
          state.busy = false;
          setActionStatus("Errore di rete.", true);
        });
    });
  }

  function postWarnTrade(warnId) {
    if (state.readOnly) {
      setActionStatus("Modalità solo lettura: non puoi eseguire azioni.", true);
      return;
    }
    if (state.busy || !state.selectedId) return;
    var id = Number(warnId || 0);
    if (!Number.isInteger(id) || id < 1) {
      setActionStatus("ID warn non valido.", true);
      return;
    }
    var pos = Number(
      (state.member && state.member.valutazioni && state.member.valutazioni.positive) || 0,
    );
    T.prompt({
      title: "Scambia val + → warn",
      message: "Quante val + usare per togliere il warn #" + id + "?",
      label: "Val + da scambiare",
      placeholder: "es. 10",
      defaultValue: String(Math.min(10, pos) || 1),
      confirmLabel: "Continua",
      cancelLabel: "Annulla",
      maxLength: 3,
      icon: "fa-exchange",
    }).then(function (raw) {
      if (raw == null) return;
      var tradeCount = Math.floor(Number(String(raw).trim()));
      if (!Number.isInteger(tradeCount) || tradeCount < 1) {
        setActionStatus("Numero val + non valido.", true);
        return;
      }
      if (tradeCount > pos) {
        setActionStatus("Non ci sono abbastanza val + (ne ha " + pos + ").", true);
        return;
      }
      return T.confirm({
        title: "Conferma scambio warn",
        message: "Scambiare " + tradeCount + " val + e rimuovere il warn #" + id + "?",
        confirmLabel: "Scambia e rimuovi",
        cancelLabel: "Annulla",
        danger: true,
        icon: "fa-exclamation-triangle",
      }).then(function (ok) {
        if (!ok) return;
        var reasonEl = T.byId("vc-staff-manage-reason");
        var reason = reasonEl ? String(reasonEl.value || "").trim() : "";
        postAction("warn_rm", {
          removeId: id,
          positiveTradeCount: tradeCount,
          reason: reason || "Scambio " + tradeCount + " val + → rimozione warn #" + id,
          skipConfirm: true,
        });
      });
    });
  }

  function postAction(action, extra) {
    if (state.readOnly) {
      setActionStatus("Modalità solo lettura: non puoi eseguire azioni.", true);
      return;
    }
    if (state.busy || !state.selectedId) return;
    var reasonEl = T.byId("vc-staff-manage-reason");
    var reason = reasonEl ? String(reasonEl.value || "").trim() : "";
    var needsReason = action.indexOf("_rm") === -1;
    if (needsReason && reason.length < 3) {
      setActionStatus("Inserisci un motivo (almeno 3 caratteri).", true);
      return;
    }
    var confirmOpts = null;
    if (!(extra && extra.skipConfirm)) {
      if (action === "depex_full") {
        confirmOpts = {
          title: "Depex completo",
          message: "Confermi il depex completo di questo membro?",
          confirmLabel: "Depex completo",
          cancelLabel: "Annulla",
          danger: true,
          icon: "fa-exclamation-triangle",
        };
      } else if (action === "warn_add") {
        confirmOpts = {
          title: "Warn staff",
          message: "Confermi il warn staff?",
          confirmLabel: "Assegna warn",
          cancelLabel: "Annulla",
          danger: true,
          icon: "fa-exclamation-triangle",
        };
      }
    }

    var run = function () {
      state.busy = true;
      setActionStatus("Esecuzione in corso\u2026", false);
      var body = Object.assign(
        {
          action: action,
          userId: state.selectedId,
          reason: reason || undefined,
        },
        extra || {},
      );
      delete body.skipConfirm;
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
    };

    if (confirmOpts) {
      T.confirm(confirmOpts).then(function (ok) {
        if (ok) run();
      });
      return;
    }
    run();
  }

  function bind() {
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
        var histBtn =
          ev.target && ev.target.closest ? ev.target.closest("[data-hist-page]") : null;
        if (histBtn && !histBtn.disabled) {
          var nextPage = Number(histBtn.getAttribute("data-hist-page") || 0);
          if (Number.isFinite(nextPage) && nextPage >= 1) {
            state.historyPage = nextPage;
            renderDetail();
          }
          return;
        }
        var act = ev.target && ev.target.closest ? ev.target.closest("[data-action]") : null;
        if (act && !act.disabled) {
          postAction(act.getAttribute("data-action"));
          return;
        }
        var rm = ev.target && ev.target.closest ? ev.target.closest("[data-rm-kind]") : null;
        if (rm) {
          var kind = rm.getAttribute("data-rm-kind");
          var id = Number(rm.getAttribute("data-rm-id") || 0);
          T.confirm({
            title: "Rimuovi voce",
            message: "Rimuovere la voce #" + id + "?",
            confirmLabel: "Rimuovi",
            cancelLabel: "Annulla",
            danger: true,
            icon: "fa-trash-o",
          }).then(function (ok) {
            if (!ok) return;
            postAction(kind, { removeId: id, skipConfirm: true });
          });
          return;
        }
        var pauseAct =
          ev.target && ev.target.closest ? ev.target.closest("[data-pause-action]") : null;
        if (pauseAct) {
          postPauseAction(pauseAct.getAttribute("data-pause-action"), pauseAct.getAttribute("data-pause-id"));
          return;
        }
        var pmPts =
          ev.target && ev.target.closest ? ev.target.closest("[data-pm-points-action]") : null;
        if (pmPts) {
          postPmPoints(pmPts.getAttribute("data-pm-points-action"));
          return;
        }
        var tradeBtn =
          ev.target && ev.target.closest ? ev.target.closest("[data-val-trade]") : null;
        if (tradeBtn && !tradeBtn.disabled) {
          var tradeAction = String(tradeBtn.getAttribute("data-val-trade") || "");
          if (tradeAction === "neg_trade") {
            postValTrade("neg_trade", {
              negativeId: Number(tradeBtn.getAttribute("data-neg-id") || 0),
            });
            return;
          }
          if (tradeAction === "warn_trade") {
            postWarnTrade(tradeBtn.getAttribute("data-warn-id"));
            return;
          }
          if (tradeAction === "pos_pause_trade") {
            var posEl = T.byId("vc-staff-manage-trade-pos-count");
            var daysEl = T.byId("vc-staff-manage-trade-pause-days");
            postValTrade("pos_pause_trade", {
              positiveCount: posEl ? Number(posEl.value || 0) : 0,
              pauseDays: daysEl ? Number(daysEl.value || 0) : 0,
            });
          }
        }
      });
    }
  }

  var loadInflight = null;
  var loadRetryTimer = null;

  function applyManagePayload(out, initial) {
    state.sections = out.data.sections || [];
    state.member = out.data.member || null;
    state.selectedId = (state.member && state.member.userId) || initial || "";
    state.pmManageOnly = Boolean(out.data.pmManageOnly);
    state.readOnly = Boolean(out.data.readOnly) || out.data.canManage === false;
    state.selfService = Boolean(out.data.selfService) || state.readOnly;
    state.canManage = Boolean(out.data.canManage) && !state.readOnly;
    state.viewerId = String(
      (out.data.viewer && (out.data.viewer.userId || out.data.viewer.id)) || "",
    ).trim();
    var root = T.byId("vc-staff-manage");
    var pmTab = document.querySelector('#vc-manage-tabs [data-manage-tab="pm"]');
    if (state.readOnly && pmTab) {
      pmTab.hidden = true;
      if (currentManageTab() === "pm") setManageTab("staff", { loadStaff: false });
    } else if (pmTab) {
      pmTab.hidden = false;
    }
    if (state.pmManageOnly) {
      var staffTab = document.querySelector('#vc-manage-tabs [data-manage-tab="staff"]');
      if (staffTab) staffTab.textContent = "Elenco PM";
      if (currentManageTab() !== "pm") {
        setManageTab("staff", { loadStaff: false });
      }
    }
    // Non riaprire Staff se l'utente è già sulla tab PM (race col fetch).
    if (root) root.hidden = currentManageTab() !== "staff";
    var counts = out.data.counts || {};
    var summary = T.byId("vc-staff-manage-summary");
    if (summary) {
      summary.hidden = false;
      summary.textContent = state.pmManageOnly
        ? (counts.total || counts.pm || 0) + " Partner Manager"
        : (counts.total || 0) +
          " in staff \u00B7 " +
          (counts.onPause || 0) +
          " in pausa" +
          (state.selfService
            ? " \u00B7 consultazione (+ azioni su di te)"
            : state.readOnly
              ? " \u00B7 solo lettura"
              : "");
    }
    // Staff in consultazione: apri subito la propria scheda se non c'è userId in URL.
    if (state.selfService && state.viewerId && !state.selectedId && !initial) {
      state.selectedId = state.viewerId;
      setUrlUser(state.viewerId);
    }
    renderRoster();
    if (state.selfService && state.viewerId && !state.member && state.selectedId === state.viewerId) {
      selectMember(state.viewerId);
    } else {
      renderDetail();
    }
    T.setStatus("vc-staff-manage-status", "", false);
  }

  function load(opts) {
    var options = opts || {};
    T.whenDiscordSessionReady(function () {
      if (!T.getToken()) {
        T.setStatus("vc-staff-manage-status", "Accedi per continuare.", true);
        return;
      }
      if (loadInflight && !options.force) return;
      var initial = selectedUserIdFromUrl();
      T.showPanelLoading("vc-staff-manage-roster");
      var attempt = 0;
      function runFetch() {
        attempt += 1;
        loadInflight = T.fetchJson(apiUrl(initial || ""), { timeoutMs: 45000 })
          .then(function (out) {
            loadInflight = null;
            T.clearPanelLoading("vc-staff-manage-roster");
            if (out.res.status === 403) {
              T.setStatus("vc-staff-manage-status", "", false);
              var root403 = T.byId("vc-staff-manage");
              if (root403) {
                var denyMsg = T.esc(
                  (out.data && out.data.message) ||
                    "Solo High Staff può usare la gestione staff dal sito.",
                );
                root403.innerHTML =
                  '<div class="vc-staff-manage-forbidden" role="status">' +
                  '<div class="vc-staff-manage-forbidden__card">' +
                  '<div class="vc-staff-manage-forbidden__icon" aria-hidden="true"><i class="fa fa-lock"></i></div>' +
                  '<p class="vc-staff-manage-forbidden__kicker">High Staff</p>' +
                  '<h2 class="vc-staff-manage-forbidden__title">Accesso limitato</h2>' +
                  '<p class="vc-staff-manage-forbidden__msg">' +
                  denyMsg +
                  "</p>" +
                  '<div class="vc-staff-manage-forbidden__actions">' +
                  '<a class="vc-staff-manage-forbidden__btn vc-staff-manage-forbidden__btn--primary" href="/staff/">Torna al profilo</a>' +
                  '<a class="vc-staff-manage-forbidden__btn vc-staff-manage-forbidden__btn--ghost" href="/staff/organico/">Vai all\'organico</a>' +
                  "</div></div></div>";
                root403.hidden = currentManageTab() !== "staff";
              }
              return;
            }
            if (out.res.status === 429 && attempt < 3) {
              T.setStatus("vc-staff-manage-status", "Troppe richieste, riprovo\u2026", false);
              if (loadRetryTimer) window.clearTimeout(loadRetryTimer);
              loadRetryTimer = window.setTimeout(runFetch, 900 * attempt);
              return;
            }
            if (!out.res.ok || !out.data || !out.data.ok) {
              var errMsg =
                (out.data && out.data.message) ||
                (out.res.status === 401
                  ? "Sessione scaduta. Accedi di nuovo."
                  : out.res.status === 429
                    ? "Troppe richieste. Attendi un attimo e riprova."
                    : "Impossibile caricare la gestione.") +
                  (out.res.status && out.res.status !== 429 ? " (HTTP " + out.res.status + ")" : "");
              T.setStatus("vc-staff-manage-status", errMsg, true);
              var rootErr = T.byId("vc-staff-manage");
              if (rootErr) rootErr.hidden = true;
              return;
            }
            applyManagePayload(out, initial);
          })
          .catch(function () {
            loadInflight = null;
            T.clearPanelLoading("vc-staff-manage-roster");
            T.setStatus("vc-staff-manage-status", "Errore di rete.", true);
            var rootNet = T.byId("vc-staff-manage");
            if (rootNet) rootNet.hidden = true;
          });
      }
      runFetch();
    });
  }

  function selectedTabFromUrl() {
    try {
      var t = String(new URLSearchParams(location.search).get("tab") || "staff").toLowerCase();
      return t === "pm" || t === "partner" ? "pm" : "staff";
    } catch (e) {
      return "staff";
    }
  }

  function currentManageTab() {
    var active = document.querySelector("#vc-manage-tabs [data-manage-tab].is-active");
    if (active) {
      return active.getAttribute("data-manage-tab") === "pm" ? "pm" : "staff";
    }
    return selectedTabFromUrl();
  }

  function setManageTab(tab, opts) {
    var options = opts || {};
    var next = tab === "pm" ? "pm" : "staff";
    document.querySelectorAll("#vc-manage-tabs [data-manage-tab]").forEach(function (btn) {
      var on = btn.getAttribute("data-manage-tab") === next;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-manage-panel]").forEach(function (panel) {
      var on = panel.getAttribute("data-manage-panel") === next;
      panel.hidden = !on;
    });
    try {
      var u = new URL(location.href);
      if (next === "pm") u.searchParams.set("tab", "pm");
      else u.searchParams.delete("tab");
      history.replaceState({}, "", u.pathname + u.search);
    } catch (e2) {}
    if (next === "pm") {
      try {
        window.dispatchEvent(new CustomEvent("vc:staff-manage-tab", { detail: { tab: "pm" } }));
      } catch (e3) {}
    } else if (options.loadStaff !== false && !(state.sections && state.sections.length)) {
      load();
    }
  }

  function bindTabs() {
    var tabs = T.byId("vc-manage-tabs");
    if (!tabs) return;
    tabs.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-manage-tab]") : null;
      if (!btn) return;
      setManageTab(btn.getAttribute("data-manage-tab"));
    });
    // Solo UI iniziale: il fetch lo fa bootPage una volta sola.
    setManageTab(selectedTabFromUrl(), { loadStaff: false });
  }

  T.bootPage(function () {
    bind();
    bindTabs();
    T.registerPtrRefresh(function () {
      load({ force: true });
    });
    if (currentManageTab() === "staff") load();
  });
})();
