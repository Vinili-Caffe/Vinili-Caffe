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
    val_pos: "Valutazione positiva",
    val_neg: "Valutazione negativa",
    warn: "Warn staff",
    val_pos_rm: "Valutazione positiva rimossa",
    val_neg_rm: "Valutazione negativa rimossa",
    warn_rm: "Warn staff rimosso",
  };

  function isViewingSelf() {
    var vid = String(state.viewerId || "").trim();
    var sid = String(state.selectedId || (state.member && state.member.userId) || "").trim();
    return Boolean(vid && sid && vid === sid);
  }

  function canSelfServiceOnView() {
    return Boolean(state.selfService && isViewingSelf());
  }

  function apiUrl(userId, opts) {
    opts = opts || {};
    var base = T.resolveApiUrl(window.__VC_STAFF_MANAGE, "/webhooks/site-staff-manage");
    if (!userId) return base;
    var q = "userId=" + encodeURIComponent(userId);
    if (opts.roster === 0 || opts.roster === "0" || state._modalMode) q += "&roster=0";
    if (opts.fresh) q += "&fresh=1";
    return base + (base.indexOf("?") >= 0 ? "&" : "?") + q;
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
          "<span><strong class=\"vc-staff-manage-person__name\">" +
          T.esc(m.displayName) +
          (m.isNew
            ? '<span class="vc-staff-list-pop__chip vc-staff-list-pop__chip--new" title="Nuovo in staff">Nuovo</span>'
            : "") +
          (m.onPause
            ? '<span class="vc-staff-list-pop__chip vc-staff-list-pop__chip--pause" title="In pausa">Pausa</span>'
            : "") +
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
      ((!state.readOnly && state.canManage) || selfOk) &&
      (kind === "val_neg_rm" || kind === "val_neg") &&
      pos >= 3;
    var canTradeWarn =
      !state.readOnly && state.canManage && !selfOk && kind === "warn_rm" && pos >= 1;
    var canRemove = !state.readOnly && state.canManage && !selfOk;
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
    var rows =
      Array.isArray(m.trackHistory) && m.trackHistory.length
        ? m.trackHistory.slice()
        : (Array.isArray(m.rolesHistory) ? m.rolesHistory : []).map(function (r) {
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

    // Fallback: warn.entries may exist even if trackHistory omitted undated warns.
    try {
      var haveWarn = new Set();
      rows.forEach(function (r) {
        var k = String((r && r.kind) || "").toLowerCase();
        if (k !== "warn" && k !== "warn_rm") return;
        var reason = String((r && r.reason) || "")
          .trim()
          .slice(0, 120)
          .toLowerCase();
        var id = Number((r && r.entryId) || 0);
        if (id > 0) haveWarn.add("id:" + id);
        if (reason) haveWarn.add("r:" + reason);
      });
      var warnEntries =
        m.warn && Array.isArray(m.warn.entries) ? m.warn.entries : [];
      for (var wi = 0; wi < warnEntries.length; wi += 1) {
        var we = warnEntries[wi] || {};
        var wid = Number(we.id || 0);
        var wtext = String(we.text || "").trim();
        var wreason = wtext.slice(0, 120).toLowerCase();
        if ((wid > 0 && haveWarn.has("id:" + wid)) || (wreason && haveWarn.has("r:" + wreason))) {
          continue;
        }
        if (wid > 0) haveWarn.add("id:" + wid);
        if (wreason) haveWarn.add("r:" + wreason);
        rows.push({
          kind: "warn",
          reason: wtext || null,
          date: null,
          actorId: null,
          actorName: null,
          from: null,
          to: null,
          entryId: wid > 0 ? wid : null,
        });
      }
    } catch (eWarnMerge) {}

    if (state._modalMode) {
      rows = rows.filter(function (r) {
        var k = String((r && r.kind) || "").toLowerCase();
        return (
          k === "val_pos" ||
          k === "val_neg" ||
          k === "warn" ||
          k === "val_pos_rm" ||
          k === "val_neg_rm" ||
          k === "warn_rm"
        );
      });
    }

    rows.sort(function (a, b) {
      return historySortKey(b).localeCompare(historySortKey(a));
    });
    return rows;
  }

  function historySortKey(r) {
    var dated = String((r && r.date) || "").trim();
    if (dated) return dated;
    var k = String((r && r.kind) || "").toLowerCase();
    if (k === "warn") {
      var id = Math.max(0, Math.floor(Number((r && r.entryId) || 0)));
      return "9999-12-31T23:59:" + String(Math.min(59, id)).padStart(2, "0") + ".000Z";
    }
    return "";
  }

  function historyEntryIdPart(r) {
    var id = Number(r && r.entryId);
    if (!Number.isFinite(id) || id <= 0) return "";
    return "#" + T.esc(String(Math.floor(id))) + " \u00B7 ";
  }

  function historyMainLine(r) {
    var kind = String(r.kind || "").toLowerCase();
    var idPart = historyEntryIdPart(r);
    if (kind === "pex" || kind === "depex") {
      return T.esc(r.from || "—") + " \u2192 " + T.esc(r.to || "—");
    }
    var reason = String(r.reason || "").trim();
    if (reason && (kind.indexOf("val_") === 0 || kind.indexOf("warn") === 0)) {
      return idPart + T.esc(reason);
    }
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
    if (window.__vcMiniPager && typeof window.__vcMiniPager.html === "function") {
      return window.__vcMiniPager.html(cur, pages, {
        aria: "Paginazione cronologia",
        prevAttr: 'data-hist-page="prev"',
        nextAttr: 'data-hist-page="next"',
        goAttr: "data-hist-page",
      }).replace(
        'class="vc-mini-pager vc-pill-pager vc-staff-inbox-pagination"',
        'class="vc-staff-manage-history-pager vc-mini-pager vc-pill-pager vc-staff-inbox-pagination" data-hist-pager',
      );
    }
    return (
      '<nav class="vc-staff-manage-history-pager vc-mini-pager vc-pill-pager vc-staff-inbox-pagination" data-hist-pager aria-label="Paginazione cronologia">' +
      '<div class="vc-staff-inbox-pagination__row"><div class="vc-staff-pt-seg vc-staff-inbox-pagination__seg">' +
      '<button type="button" class="vc-staff-pt-seg__btn vc-staff-inbox-pagination__navbtn" data-hist-page="prev"' +
      (cur <= 1 ? " disabled" : "") +
      ' aria-label="Pagina precedente">\u2190</button>' +
      '<button type="button" class="vc-staff-pt-seg__btn is-active" data-hist-page="' +
      T.esc(String(cur)) +
      '" aria-current="page">' +
      T.esc(String(cur)) +
      "</button>" +
      '<button type="button" class="vc-staff-pt-seg__btn vc-staff-inbox-pagination__navbtn" data-hist-page="next"' +
      (cur >= pages ? " disabled" : "") +
      ' aria-label="Pagina successiva">\u2192</button>' +
      "</div></div></nav>"
    );
  }

  function historyHtml(rows, page) {
    if (!rows || !rows.length) {
      return state._modalMode
        ? '<p class="vc-staff-manage-empty">Nessuna valutazione o warn registrato.</p>'
        : '<p class="vc-staff-manage-empty">Nessuna variazione registrata.</p>';
    }
    var pages = Math.max(1, Math.ceil(rows.length / HISTORY_PAGE_SIZE));
    var cur = Math.min(pages, Math.max(1, Number(page) || 1));
    var start = (cur - 1) * HISTORY_PAGE_SIZE;
    var slice = rows.slice(start, start + HISTORY_PAGE_SIZE);
    return (
      '<ul class="vc-staff-manage-history">' +
      slice
        .map(function (r) {
          var kind = String(r.kind || "").toLowerCase();
          var reason = String(r.reason || "").trim();
          var reasonIsMain =
            Boolean(reason) && (kind.indexOf("val_") === 0 || kind.indexOf("warn") === 0);
          return (
            '<li class="vc-staff-manage-history__item is-' +
            T.esc(String(r.kind || "event").replace(/_/g, "-")) +
            '"><span class="vc-staff-manage-history__kind">' +
            T.esc(historyKindLabel(r.kind)) +
            "</span><strong>" +
            historyMainLine(r) +
            "</strong>" +
            (reason && !reasonIsMain ? "<span>" + T.esc(reason) + "</span>" : "") +
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
    if (el) {
      el.textContent = "";
      el.hidden = true;
      el.classList.remove("is-error");
    }
    showManageToast(text, isError);
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

  function askReasonThenConfirm(opts) {
    opts = opts || {};
    return T.prompt({
      title: opts.title || "Motivo",
      message: opts.message || "Inserisci il motivo, poi conferma l\u2019azione.",
      label: "Motivo",
      placeholder: "Descrivi il motivo (min. 3 caratteri)\u2026",
      defaultValue: "",
      confirmLabel: opts.continueLabel || "Continua",
      cancelLabel: "Annulla",
      danger: Boolean(opts.danger),
      icon: opts.icon || "fa-pencil",
      multiline: true,
      maxLength: 500,
    }).then(function (raw) {
      if (raw == null) return null;
      var reason = String(raw || "").trim();
      if (reason.length < 3) {
        return T.alert({
          title: "Motivo troppo corto",
          message: "Serve un motivo di almeno 3 caratteri.",
          icon: "fa-exclamation-circle",
        }).then(function () {
          return null;
        });
      }
      return T.confirm({
        title: opts.confirmTitle || opts.title || "Conferma",
        message:
          (opts.confirmMessage || "Confermi l\u2019operazione?") +
          "\n\nMotivo: " +
          reason,
        confirmLabel: opts.confirmLabel || "Conferma",
        cancelLabel: "Annulla",
        danger: Boolean(opts.danger),
        icon: opts.icon || "fa-check",
      }).then(function (ok) {
        return ok ? reason : null;
      });
    });
  }

  function forgeRoleLabel(m) {
    if (!m) return "Staff";
    // Prefer full Discord badge label (e.g. "Founder & Partner Manager"), not ladder-only.
    var raw = String(m.displayRoleLabel || "").trim();
    if (!raw) raw = String(m.ladderRoleLabel || "").trim();
    var parts = raw.split(/\s*&\s*/);
    var keep = [];
    for (var i = 0; i < parts.length; i += 1) {
      var part = String(parts[i] || "")
        .replace(/^[^A-Za-z0-9]+/, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!part) continue;
      var low = part.toLowerCase();
      if (
        low === "staff" ||
        low === "high staff" ||
        low === "highstaff" ||
        low === "staffer del mese" ||
        low === "staff del mese" ||
        low.indexOf("staffer del mese") !== -1 ||
        low.indexOf("staff del mese") !== -1 ||
        low === "staffer della settimana" ||
        low === "staff della settimana" ||
        low.indexOf("staffer della settimana") !== -1 ||
        low.indexOf("staff della settimana") !== -1
      ) {
        continue;
      }
      keep.push(part);
    }
    if (m && m.isPm) {
      var hasPm = keep.some(function (p) {
        return String(p || "")
          .toLowerCase()
          .indexOf("partner manager") !== -1;
      });
      if (!hasPm) keep.push("Partner Manager");
    }
    return keep.join(" & ").trim() || "Staff";
  }

  function renderCareerRoleHtml(m) {
    return (
      '<strong class="vc-staff-rank-forge__role">' + T.esc(forgeRoleLabel(m)) + "</strong>"
    );
  }

  function chooseCareerAction(hub) {
    var m = state.member;
    if (!m || state.readOnly || state.busy) return Promise.resolve(null);
    var D = window.VcDialog;
    var chooseFn =
      D && typeof D.choose === "function"
        ? function (o) {
            return D.choose(o);
          }
        : null;
    var arrow = " → ";
    var pexDest = String(m.pexTargetLabel || "").trim() || "Ruolo nuovo";
    var depexDest = String(m.depexTargetLabel || "").trim() || "Ruolo nuovo";
    var memberDest = String(m.memberRoleLabel || "").trim() || "Member";
    var isPm = Boolean(m.isPm);
    var choices = [];
    if (hub === "pex") {
      // pexPmRolePick1: da PM-only mostra scelta grado (non auto-Helper).
      if (m.canPexProspect && Array.isArray(m.prospectPexChoices) && m.prospectPexChoices.length) {
        m.prospectPexChoices.forEach(function (opt) {
          if (!opt || !opt.id) return;
          choices.push({
            id: String(opt.id),
            label: String(opt.label || opt.roleLabel || opt.id),
          });
        });
      } else if (m.canPex) {
        choices.push({ id: "pex", label: "Pex" + arrow + pexDest });
      }
      if (m.canPexPm && !isPm) {
        choices.push({ id: "pex_pm", label: memberDest + arrow + "Partner Manager" });
      }
      if (!choices.length) {
        setActionStatus("Nessuna opzione di pex disponibile.", true);
        return Promise.resolve(null);
      }
      if (choices.length === 1) return Promise.resolve(choices[0].id);
      if (!chooseFn) return Promise.resolve(choices[0].id);
      return chooseFn({
        title: "Pex",
        message: m.canPexProspect
          ? "Scegli il ruolo staff da aggiungere (mantiene Partner Manager)."
          : "Scegli il tipo di promozione.",
        cancelLabel: "Annulla",
        icon: "fa-arrow-up",
        danger: false,
        choices: choices,
      });
    }
    if (hub === "depex") {
      /* depexDupMember1: se il depex a un grado = già Member, non duplicare Depex→Member */
      var depexSameAsMember = false;
      try {
        var destN = String(depexDest || "")
          .trim()
          .toLowerCase();
        var memN = String(memberDest || "")
          .trim()
          .toLowerCase();
        depexSameAsMember =
          Boolean(m.depexLadderIsMember) ||
          destN === memN ||
          destN === "member" ||
          String(m.depexTargetRoleId || "") === "" ||
          /^member$/i.test(String(m.depexTargetLabel || "").trim());
      } catch (eSame) {
        depexSameAsMember = false;
      }
      if (m.canDepexLadder && !depexSameAsMember) {
        choices.push({ id: "depex", label: "Depex" + arrow + depexDest });
      }
      /* depexPmDupMember1 / depexPmOnlyFullFix1: PM-only → depex_pm (non depex_full: API non tocca PM) */
      var isPmOnly = Boolean(m.isPmOnly);
      if (m.canDepexPm && isPm && !isPmOnly) {
        choices.push({ id: "depex_pm", label: "Rimuovi Partner Manager", danger: true });
      }
      if (isPmOnly && m.canDepexPm && isPm) {
        choices.push({ id: "depex_pm", label: "Depex" + arrow + memberDest, danger: true });
      } else if (m.canDepexFull) {
        choices.push({ id: "depex_full", label: "Depex" + arrow + memberDest, danger: true });
      }
      if (!choices.length && m.canDepexLadder && depexSameAsMember) {
        choices.push({ id: "depex_full", label: "Depex" + arrow + memberDest, danger: true });
      }
      if (!choices.length && m.canDepexPm && isPm) {
        choices.push({ id: "depex_pm", label: "Depex" + arrow + memberDest, danger: true });
      }
      if (!choices.length) {
        setActionStatus("Nessuna opzione di depex disponibile.", true);
        return Promise.resolve(null);
      }
      if (choices.length === 1) return Promise.resolve(choices[0].id);
      if (!chooseFn) return Promise.resolve(choices[0].id);
      return chooseFn({
        title: "Depex",
        message: "Scegli il tipo di depex.",
        cancelLabel: "Annulla",
        icon: "fa-arrow-down",
        danger: true,
        choices: choices,
      });
    }
    return Promise.resolve(hub);
  }

  function renderCareerForge(m) {
    var canAct = !state.readOnly;
    var isPm = Boolean(m.isPm);
    /* staffCareerRankGuard1: canDepexFull false = blocco reale (prima !== false apriva comunque) */
    var canPexHub = Boolean(m.canPex || m.canPexProspect || (m.canPexPm && !isPm));
    var canDepexHub = Boolean(m.canDepexLadder || (m.canDepexPm && isPm) || m.canDepexFull);
    var rankBlocked = Boolean(m.careerRankBlocked);
    var rankMsg = String(m.careerRankBlockMessage || "").trim();
    var html =
      '<section class="vc-staff-rank-forge" aria-label="Gestione carriera">' +
      '<div class="vc-staff-rank-forge__badge">' +
      '<span class="vc-staff-rank-forge__kicker">Ruolo attuale</span>' +
      '<div class="vc-staff-rank-forge__roles">' +
      renderCareerRoleHtml(m) +
      "</div></div>";

    if (!canAct) {
      html +=
        '<p class="vc-staff-manage-readonly" role="status">Consultazione: nessun permesso di modifica carriera.</p>';
    } else {
      html +=
        '<div class="vc-staff-rank-forge__rail">' +
        '<button type="button" class="vc-staff-rank-forge__card is-up" data-career-hub="pex"' +
        (canPexHub ? "" : " disabled") +
        ">" +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-arrow-up"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Pex</span>' +
        '<span class="vc-staff-rank-forge__hint">Scegli tipo di promozione</span></button>' +
        '<button type="button" class="vc-staff-rank-forge__card is-down" data-career-hub="depex"' +
        (canDepexHub ? "" : " disabled") +
        ">" +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-arrow-down"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Depex</span>' +
        '<span class="vc-staff-rank-forge__hint">Scegli tipo di depex</span></button>' +
        "</div>";
      if (rankBlocked && rankMsg) {
        html +=
          '<p class="vc-staff-manage-readonly" role="status">' + T.esc(rankMsg) + "</p>";
      }
    }

    html +=
      '<p id="vc-staff-manage-action-status" class="vc-staff-manage-action-status" role="status" hidden></p>' +
      "</section>";
    return html;
  }

  function renderPmOnlyDetail(m) {
    var html = readOnlyBannerHtml() + renderCareerForge(m);
    html +=
      '<section class="vc-staff-manage-history-sec"><h3>Cronologia valutazioni & warn</h3>' +
      historyHtml(historyRowsForMember(m), state.historyPage) +
      "</section>";
    return html;
  }

  function renderStaffDetail(m) {
    var html = readOnlyBannerHtml() + renderCareerForge(m);
    html +=
      '<section class="vc-staff-manage-history-sec"><h3>Cronologia valutazioni & warn</h3>' +
      historyHtml(historyRowsForMember(m), state.historyPage) +
      "</section>";
    return html;
  }

  function detailPanel() {
    if (state._detailPanel) return state._detailPanel;
    return T.byId("vc-staff-manage-detail");
  }

  function renderDetail() {
    var panel = detailPanel();
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
            notifyModalUpdated();
          }
        });
      })
      .catch(function () {
        state.busy = false;
        setActionStatus("Errore di rete.", true);
      });
  }

  /* depexToast1: progress + outcome → toast float (niente riga inline sotto Pex/Depex). */
  function showManageToast(text, isError) {
    var msg = String(text || "").trim();
    if (!msg) {
      try {
        if (typeof T.hideStaffToast === "function") T.hideStaffToast();
        else if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") {
          window.VcSiteToast.hide();
        }
      } catch (eHide) {}
      return;
    }
    var pending =
      !isError && /in corso|Aggiornamento punti|Scambio in corso/i.test(msg);
    var opts = pending ? { pending: true } : null;
    try {
      if (typeof T.showStaffToast === "function") {
        T.showStaffToast(msg, Boolean(isError), opts);
        return;
      }
      if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
        window.VcSiteToast.show(msg, Boolean(isError), opts || undefined);
      }
    } catch (eToast) {}
  }

  function setActionStatus(text, isError) {
    var el = T.byId("vc-staff-manage-action-status");
    if (el) {
      el.textContent = "";
      el.hidden = true;
      el.classList.remove("is-error");
    }
    showManageToast(text, isError);
  }

  function memberStillOnStaff(m) {
    if (!m || typeof m !== "object") return false;
    return Boolean(
      m.ladderRoleId ||
        m.isPm ||
        m.isPmOnly ||
        m.canDepexFull ||
        m.canDepexLadder ||
        m.canDepexPm ||
        m.canPex,
    );
  }

  function wasPmOnlyProfile(m) {
    if (!m || typeof m !== "object") return false;
    if (m.isPmOnly === true) return true;
    var kind = String(m.profileKind || "").trim().toLowerCase();
    if (kind === "pm_only") return true;
    return Boolean(m.isPm && !m.ladderRoleId);
  }

  /* pexPmHelperClose1: PM → Helper (o altro grado ladder) = chiudi sheet + hard refresh come depex. */
  function shouldHardRefreshAfterCareer(action, beforeMember, afterMember) {
    var act = String(action || "").trim().toLowerCase();
    if (!wasPmOnlyProfile(beforeMember)) return false;
    if (act === "pex_pm") return false;
    if (act === "pex" || act.indexOf("pex_") === 0) {
      if (afterMember && afterMember.ladderRoleId && !afterMember.isPmOnly) return true;
      /* POST ok ma member fetch ancora PM-only: comunque reshape. */
      return true;
    }
    return false;
  }

  function closeManageSheetSafe() {
    try {
      if (typeof window.__vcCloseStaffManageSheet === "function") {
        window.__vcCloseStaffManageSheet();
      }
    } catch (eClose) {}
    /* pexCloseSheet1: mai lasciare la class che nasconde le frecce peer */
    try {
      var sheet = document.getElementById("vc-staff-manage-sheet");
      if (sheet) sheet.remove();
    } catch (eRm) {}
    try {
      document.documentElement.classList.remove("vc-staff-manage-sheet-open");
    } catch (eCls) {}
    try {
      document.dispatchEvent(new CustomEvent("vc:staff-manage-sheet-closed"));
    } catch (eEv) {}
  }

  /* pexCloseSheet1: dopo pex/depex chiudi sempre lo sheet (CSS sheet-open nascondeva le frecce). */
  function finishCareerActionUi(info) {
    notifyModalUpdated(info || { leftStaff: false, member: state.member });
    closeManageSheetSafe();
  }

  function refreshAfterCareerAction(action, meta) {
    meta = meta || {};
    var act = String(action || "").trim().toLowerCase();
    var beforeMember = meta.beforeMember || null;
    var leftStaff = act.indexOf("depex") === 0 && !memberStillOnStaff(state.member);
    var hardRefresh = shouldHardRefreshAfterCareer(act, beforeMember, state.member);
    if (leftStaff) {
      if (state.member && typeof state.member === "object") {
        state.member = Object.assign({}, state.member, {
          leftStaff: true,
          ladderRoleId: null,
          canDepexFull: false,
          canDepexLadder: false,
          canPex: false,
        });
      }
      finishCareerActionUi({
        leftStaff: true,
        hardRefresh: true,
        action: act,
        member: state.member,
      });
      return Promise.resolve();
    }
    if (hardRefresh) {
      finishCareerActionUi({
        leftStaff: false,
        hardRefresh: true,
        joinedLadder: true,
        action: act,
        member: state.member,
      });
      return Promise.resolve();
    }
    return T.fetchJson(apiUrl(state.selectedId, { fresh: true }), { cache: false, ttlMs: 0, persistMs: 0 })
      .then(function (memberOut) {
        var data = (memberOut && memberOut.data) || {};
        var err = String(data.error || "").trim();
        var status = memberOut && memberOut.res ? Number(memberOut.res.status || 0) : 0;
        if (data.ok) {
          if (data.sections) state.sections = data.sections;
          state.member = data.member || state.member;
          if (act.indexOf("depex") === 0 && !memberStillOnStaff(state.member)) {
            finishCareerActionUi({
              leftStaff: true,
              hardRefresh: true,
              action: act,
              member: state.member,
            });
            return;
          }
          if (shouldHardRefreshAfterCareer(act, beforeMember, state.member)) {
            finishCareerActionUi({
              leftStaff: false,
              hardRefresh: true,
              joinedLadder: true,
              action: act,
              member: state.member,
            });
            return;
          }
          finishCareerActionUi({
            leftStaff: false,
            hardRefresh: false,
            action: act,
            member: state.member,
          });
          return;
        }
        /* Dopo depex completo il GET torna not_staff: non è un errore di rete. */
        if (
          act.indexOf("depex") === 0 &&
          (err === "not_staff" || status === 400 || status === 403 || status === 404)
        ) {
          if (state.member && typeof state.member === "object") {
            state.member = Object.assign({}, state.member, {
              leftStaff: true,
              ladderRoleId: null,
              canDepexFull: false,
              canDepexLadder: false,
              canPex: false,
            });
          }
          finishCareerActionUi({
            leftStaff: true,
            hardRefresh: true,
            action: act,
            member: state.member,
          });
          return;
        }
        finishCareerActionUi({
          leftStaff: false,
          hardRefresh: false,
          action: act,
          member: state.member,
        });
      })
      .catch(function () {
        /* POST già ok: non mascherare il successo con errore di rete sul refresh. */
        if (act.indexOf("depex") === 0 && !memberStillOnStaff(state.member)) {
          finishCareerActionUi({
            leftStaff: true,
            hardRefresh: true,
            action: act,
            member: state.member,
          });
          return;
        }
        if (shouldHardRefreshAfterCareer(act, beforeMember, state.member)) {
          finishCareerActionUi({
            leftStaff: false,
            hardRefresh: true,
            joinedLadder: true,
            action: act,
            member: state.member,
          });
          return;
        }
        finishCareerActionUi({
          leftStaff: false,
          hardRefresh: false,
          action: act,
          member: state.member,
        });
      });
  }

  function selectMember(userId, opts) {
    opts = opts || {};
    state.selectedId = String(userId || "");
    state.historyPage = 1;
    if (!opts.modal && !state._modalMode) setUrlUser(state.selectedId);
    if (!state._modalMode) renderRoster();
    if (!state.selectedId) {
      state.member = null;
      renderDetail();
      return Promise.resolve();
    }
    return T.fetchJson(apiUrl(state.selectedId, { fresh: Boolean(opts.fresh || opts.modal || state._modalMode) }), {
      cache: false,
      timeoutMs: 55000,
    })
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          if (!state._modalMode) {
            T.setStatus(
              "vc-staff-manage-status",
              (out.data && out.data.message) || "Impossibile caricare il membro.",
              true,
            );
          }
          return Promise.reject(out);
        }
        if (out.data.sections) state.sections = out.data.sections;
        state.member = out.data.member || null;
        state.pmManageOnly = Boolean(out.data.pmManageOnly);
        state.readOnly = Boolean(out.data.readOnly) || out.data.canManage === false;
        state.selfService = Boolean(out.data.selfService) || state.readOnly;
        state.canManage = Boolean(out.data.canManage) && !state.readOnly;
        state.viewerId = String(
          (out.data.viewer && (out.data.viewer.userId || out.data.viewer.id)) || "",
        ).trim();
        state.historyPage = 1;
        if (!state._modalMode) renderRoster();
        renderDetail();
        if (!state._modalMode) T.setStatus("vc-staff-manage-status", "", false);
        return out.data;
      })
      .catch(function (err) {
        if (!state._modalMode) T.setStatus("vc-staff-manage-status", "Errore di rete.", true);
        return Promise.reject(err);
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
            if (state._modalMode) {
              renderDetail();
              notifyModalUpdated();
              return;
            }
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
        if (!state._modalMode) renderRoster();
        renderDetail();
        notifyModalUpdated();
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
            state._modalMode
              ? Promise.resolve()
              : T.fetchJson(apiUrl()).then(function (rosterOut) {
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
    if (canSelfServiceOnView() || isViewingSelf()) {
      setActionStatus("Non puoi toglierti i warn da solo: serve High Staff.", true);
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
    extra = extra || {};
    var reasonEl = T.byId("vc-staff-manage-reason");
    var reason = reasonEl ? String(reasonEl.value || "").trim() : String(extra.reason || "").trim();
    var needsReason = action.indexOf("_rm") === -1;

    var labels = {
      pex: { title: "Pex staff", msg: "Confermi il pex di un grado?", danger: false, icon: "fa-arrow-up" },
      pex_helper: {
        title: "Partner Manager → Helper",
        msg: "Aggiungere Helper (mantiene Partner Manager)?",
        danger: false,
        icon: "fa-arrow-up",
      },
      pex_mod: {
        title: "Partner Manager → Moderator",
        msg: "Aggiungere Moderator (mantiene Partner Manager)?",
        danger: false,
        icon: "fa-arrow-up",
      },
      pex_senior_moderator: {
        title: "Partner Manager → Senior Moderator",
        msg: "Aggiungere Senior Moderator (mantiene Partner Manager)?",
        danger: false,
        icon: "fa-arrow-up",
      },
      pex_director: {
        title: "Partner Manager → Director",
        msg: "Aggiungere Director (mantiene Partner Manager)?",
        danger: false,
        icon: "fa-arrow-up",
      },
      pex_admin: {
        title: "Partner Manager → Admin",
        msg: "Aggiungere Admin (mantiene Partner Manager)?",
        danger: false,
        icon: "fa-arrow-up",
      },
      pex_manager: {
        title: "Partner Manager → Manager",
        msg: "Aggiungere Manager (mantiene Partner Manager)?",
        danger: false,
        icon: "fa-arrow-up",
      },
      pex_pm: {
        title: "Member → Partner Manager",
        msg: "Assegnare il ruolo Partner Manager?",
        danger: false,
        icon: "fa-handshake-o",
      },
      depex: { title: "Depex staff", msg: "Confermi il depex di un grado?", danger: true, icon: "fa-arrow-down" },
      depex_pm: {
        title: "Rimuovi Partner Manager",
        msg: "Rimuovere il ruolo Partner Manager (resta lo staff ladder)?",
        danger: true,
        icon: "fa-handshake-o",
      },
      depex_full: {
        title: "Depex → Member",
        msg: "Rimuovere tutto lo staff da questo membro?",
        danger: true,
        icon: "fa-bolt",
      },
    };
    var meta = labels[action] || { title: "Azione", msg: "Confermi?", danger: false, icon: "fa-check" };
    try {
      var m = state.member || {};
      var arrow = " → ";
      var memberDest = String(m.memberRoleLabel || "").trim() || "Member";
      if (action === "pex" && m.pexTargetLabel) meta.title = "Pex" + arrow + String(m.pexTargetLabel).trim();
      if (action === "depex" && m.depexTargetLabel) meta.title = "Depex" + arrow + String(m.depexTargetLabel).trim();
      if (action === "depex_full" && m.memberRoleLabel) meta.title = "Depex" + arrow + String(m.memberRoleLabel).trim();
      if (action === "pex_pm") meta.title = memberDest + arrow + "Partner Manager";
      if (action === "depex_pm") meta.title = "Rimuovi Partner Manager";
      if (Array.isArray(m.prospectPexChoices)) {
        m.prospectPexChoices.forEach(function (opt) {
          if (opt && String(opt.id) === String(action) && opt.label) meta.title = String(opt.label);
        });
      }
    } catch (eTitle) {}

    var run = function (finalReason) {
      state.busy = true;
      setActionStatus("Esecuzione in corso\u2026", false);
      var beforeMember = state.member
        ? {
            isPm: Boolean(state.member.isPm),
            isPmOnly: Boolean(state.member.isPmOnly),
            ladderRoleId: state.member.ladderRoleId || null,
            profileKind: state.member.profileKind || null,
          }
        : null;
      var body = Object.assign(
        {
          action: action,
          userId: state.selectedId,
          reason: finalReason || undefined,
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
          return refreshAfterCareerAction(action, { beforeMember: beforeMember });
        })
        .catch(function () {
          state.busy = false;
          setActionStatus("Errore di rete.", true);
        });
    };

    if (extra.skipConfirm) {
      if (needsReason && reason.length < 3) {
        setActionStatus("Inserisci un motivo (almeno 3 caratteri).", true);
        return;
      }
      run(reason);
      return;
    }

    if (needsReason) {
      askReasonThenConfirm({
        title: meta.title,
        message: meta.msg + " Inserisci il motivo.",
        confirmTitle: meta.title,
        confirmMessage: meta.msg,
        confirmLabel: "Conferma",
        danger: meta.danger,
        icon: meta.icon,
      }).then(function (okReason) {
        if (okReason) run(okReason);
      });
      return;
    }

    T.confirm({
      title: meta.title,
      message: meta.msg,
      confirmLabel: "Conferma",
      cancelLabel: "Annulla",
      danger: meta.danger,
      icon: meta.icon,
    }).then(function (ok) {
      if (ok) run(reason);
    });
  }

  function notifyModalUpdated(info) {
    if (!state._modalMode) return;
    try {
      if (
        window.VCStaffManagePanel &&
        typeof window.VCStaffManagePanel.onMemberUpdated === "function"
      ) {
        window.VCStaffManagePanel.onMemberUpdated(
          info || { leftStaff: false, member: state.member },
        );
      }
    } catch (eN) {}
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
    document.addEventListener("click", function manageDetailClick(ev) {
      var detailRoot =
        ev.target && ev.target.closest ? ev.target.closest(".vc-staff-manage-detail") : null;
      if (!detailRoot) return;
        var histBtn =
          ev.target && ev.target.closest ? ev.target.closest("[data-hist-page]") : null;
        if (histBtn && !histBtn.disabled) {
          var dir = String(histBtn.getAttribute("data-hist-page") || "");
          var m = state.selectedMember;
          var rows = m ? historyRowsForMember(m) : [];
          var maxPage = Math.max(1, Math.ceil((rows.length || 0) / HISTORY_PAGE_SIZE) || 1);
          var nextPage = state.historyPage;
          if (dir === "prev" && state.historyPage > 1) nextPage = state.historyPage - 1;
          else if (dir === "next" && state.historyPage < maxPage) nextPage = state.historyPage + 1;
          else {
            var n = Number(dir);
            if (Number.isFinite(n) && n >= 1 && n <= maxPage) nextPage = n;
          }
          if (nextPage !== state.historyPage) {
            state.historyPage = nextPage;
            renderDetail();
          }
          return;
        }
        var hub = ev.target && ev.target.closest ? ev.target.closest("[data-career-hub]") : null;
        if (hub && !hub.disabled) {
          chooseCareerAction(hub.getAttribute("data-career-hub")).then(function (action) {
            if (action) postAction(action);
          });
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
        setManageTab(selectedTabFromUrl(), { loadStaff: false });
  }

  var panelBound = false;

  function ensurePanelBound() {
    if (panelBound) return;
    try {
      bind();
      panelBound = true;
    } catch (eBind) {
      try {
        console.error("[staff-manage] bind failed", eBind);
      } catch (eLog) {}
      throw eBind;
    }
  }

  window.VCStaffManagePanel = {
    openMember: function (userId, panelEl) {
      state._modalMode = true;
      state._detailPanel = panelEl || null;
      state.historyPage = 1;
      var panel = detailPanel();
      if (panel) {
        panel.innerHTML =
          '<div class="vc-staff-manage-modal-loading" role="status">' +
          '<span class="vc-user-profile-loader__spin" aria-hidden="true"></span>' +
          "<p>Caricamento scheda gestione\u2026</p></div>";
      }
      try {
        ensurePanelBound();
      } catch (eBind2) {
        if (panel) {
          panel.innerHTML =
            '<div class="vc-staff-manage-modal-error"><p>Errore inizializzazione gestione. Ricarica la pagina.</p></div>';
        }
        return Promise.reject(eBind2);
      }
      return selectMember(userId, { modal: true, fresh: true }).catch(function (out) {
        if (panel) {
          var msg =
            (out && out.data && out.data.message) ||
            (out && out.timedOut
              ? "Timeout caricamento scheda. Riprova."
              : out && out.res && out.res.status === 403
                ? "Non hai permessi per gestire questo profilo."
                : out && out.res && out.res.status === 503
                  ? "Discord lento o non disponibile. Riprova tra poco."
                  : "Impossibile caricare la scheda.");
          panel.innerHTML =
            '<div class="vc-staff-manage-modal-error">' +
            "<p>" +
            T.esc(msg) +
            "</p>" +
            '<p class="vc-staff-manage-modal-error__hint">Chiudi e riprova, oppure ricarica la pagina.</p>' +
            "</div>";
        }
        return Promise.reject(out);
      });
    },
    closeModal: function () {
      state._modalMode = false;
      state._detailPanel = null;
    },
    onMemberUpdated: null,
  };

  T.bootPage(function () {
    ensurePanelBound();
    if (!T.byId("vc-staff-manage")) return;
    bindTabs();
    T.registerPtrRefresh(function () {
      load({ force: true });
    });
    if (currentManageTab() === "staff") load();
  });
})();
