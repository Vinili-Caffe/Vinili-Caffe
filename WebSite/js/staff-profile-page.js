(function () {
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

  function profileApiUrl() {
    var c = window.__VC_STAFF_PROFILE || {};
    var local = cfgValueOrEmpty(c.apiUrlLocal);
    var base = isLocalOrigin() && local ? local : cfgValueOrEmpty(c.apiUrl) || "/webhooks/site-staff-profile";
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

  function setStatus(text, isError) {
    var el = byId("vc-staff-profile-status");
    if (!el) return;
    el.textContent = String(text || "");
    el.hidden = !text;
    el.classList.toggle("is-error", Boolean(isError));
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statCard(value, label, hint) {
    return (
      '<div class="vc-staff-profile-stat">' +
      '<p class="vc-staff-profile-stat__value">' +
      esc(value) +
      "</p>" +
      '<p class="vc-staff-profile-stat__label">' +
      esc(label) +
      "</p>" +
      (hint ? '<p class="vc-staff-profile-stat__hint">' + esc(hint) + "</p>" : "") +
      "</div>"
    );
  }

  function recentHtml(items, emptyText) {
    if (!items || !items.length) {
      return '<li class="vc-staff-profile-recent__empty">' + esc(emptyText || "Nessun dettaglio.") + "</li>";
    }
    return items
      .map(function (line) {
        return "<li>" + esc(line) + "</li>";
      })
      .join("");
  }

  function modPeriodHtml(title, pack) {
    pack = pack || {};
    return (
      '<div class="vc-staff-profile-mod">' +
      '<p class="vc-staff-profile-mod__title">' +
      esc(title) +
      "</p>" +
      '<ul class="vc-staff-profile-mod__list">' +
      "<li><span>Mute</span><strong>" +
      esc(pack.mute || 0) +
      "</strong></li>" +
      "<li><span>Ban</span><strong>" +
      esc(pack.ban || 0) +
      "</strong></li>" +
      "<li><span>Kick</span><strong>" +
      esc(pack.kick || 0) +
      "</strong></li>" +
      "<li><span>Warn</span><strong>" +
      esc(pack.warn || 0) +
      "</strong></li>" +
      '<li class="is-total"><span>Totale</span><strong>' +
      esc(pack.total || 0) +
      "</strong></li>" +
      "</ul></div>"
    );
  }

  function renderPayload(payload) {
    var root = byId("vc-staff-profile");
    if (!root || !payload || !payload.ok) return;

    var id = payload.identity || {};
    var role = payload.role || {};
    var pause = payload.pause || {};
    var quota = pause.quota || {};
    var val = payload.valutazioni || {};
    var warn = payload.warn || {};
    var partner = payload.partner;
    var mod = payload.modstats;
    var career = payload.career || {};
    var tenure = career.tenure;
    var history = Array.isArray(pause.history) ? pause.history : [];
    var rolesHistory = Array.isArray(career.rolesHistory) ? career.rolesHistory : [];
    var sf = payload.serataFilm;

    var stats = [];
    stats.push(statCard(quota.remaining != null ? quota.remaining : "—", "Pause residue", "su " + (quota.max != null ? quota.max : "—") + " giorni"));
    stats.push(statCard(val.positive != null ? val.positive : 0, "Val +", "positive"));
    stats.push(statCard(val.negative != null ? val.negative : 0, "Val −", "negative"));
    stats.push(statCard(warn.count != null ? warn.count : 0, "Warn staff", "attivi"));
    if (partner) {
      stats.push(statCard(partner.points != null ? partner.points : 0, "Punti PM", "disponibili"));
      stats.push(statCard(partner.partnerCount != null ? partner.partnerCount : 0, "Partnership", "totali"));
    }
    if (mod && mod.all) {
      stats.push(statCard(mod.all.total || 0, "Sanzioni", "all time"));
    }

    var pauseRows = history.length
      ? history
          .map(function (row) {
            return (
              '<li class="vc-staff-profile-row">' +
              '<span class="vc-staff-profile-row__main">' +
              esc(row.start || "?") +
              " → " +
              esc(row.end || "?") +
              "</span>" +
              '<span class="vc-staff-profile-row__tag">' +
              esc(row.statusLabel || row.status || "") +
              "</span>" +
              (row.motivazione
                ? '<span class="vc-staff-profile-row__sub">' + esc(row.motivazione) + "</span>"
                : "") +
              "</li>"
            );
          })
          .join("")
      : '<li class="vc-staff-profile-recent__empty">Nessuna pausa in cronologia.</li>';

    var roleRows = rolesHistory.length
      ? rolesHistory
          .map(function (row) {
            return (
              '<li class="vc-staff-profile-row">' +
              '<span class="vc-staff-profile-row__main">' +
              esc(row.oldRole) +
              " → " +
              esc(row.newRole) +
              "</span>" +
              (row.dateLabel
                ? '<span class="vc-staff-profile-row__tag">' + esc(row.dateLabel) + "</span>"
                : "") +
              (row.reason
                ? '<span class="vc-staff-profile-row__sub">' + esc(row.reason) + "</span>"
                : "") +
              "</li>"
            );
          })
          .join("")
      : '<li class="vc-staff-profile-recent__empty">Nessuna variazione ruolo registrata.</li>';

    var html = "";
    html +=
      '<header class="vc-staff-profile-identity">' +
      '<div class="vc-staff-profile-identity__avatar-wrap" aria-hidden="true">' +
      (window.VCStaffTools && window.VCStaffTools.avatarImgHtml
        ? window.VCStaffTools.avatarImgHtml(id.avatarUrl, id.userId || id.id, {
            width: 120,
            height: 120,
            className: "vc-staff-profile-identity__avatar",
          })
        : id.avatarUrl
          ? '<img class="vc-staff-profile-identity__avatar" src="' +
            esc(id.avatarUrl) +
            '" alt="" width="120" height="120" data-vc-avatar="1" onerror="this.onerror=null;this.src=\'https://cdn.discordapp.com/embed/avatars/0.png\'" />'
          : "") +
      "</div>" +
      '<div class="vc-staff-profile-identity__copy">' +
      '<p class="vc-staff-profile-identity__name">' +
      esc(id.displayName || "Staff") +
      "</p>" +
      '<p class="vc-staff-profile-identity__user">' +
      (id.username ? "@" + esc(id.username) : "") +
      "</p>" +
      '<div class="vc-staff-profile-identity__meta">' +
      '<p class="vc-staff-profile-identity__role" style="--vc-staff-role-color:' +
      esc(role.color || "#d4a888") +
      '">' +
      esc(role.label || "—") +
      "</p>" +
      (tenure && tenure.label
        ? '<p class="vc-staff-profile-identity__tenure">In staff dal ' + esc(tenure.label) + "</p>"
        : "") +
      (sf ? '<p class="vc-staff-profile-identity__sf">' + esc(sf.label) + "</p>" : "") +
      "</div></div></header>";

    html += '<div class="vc-staff-profile-stats">' + stats.join("") + "</div>";

    if (sf) {
      html +=
        '<section class="vc-staff-profile-section vc-staff-profile-section--wide vc-staff-sf">' +
        '<h2 class="vc-staff-profile-section__title">Serata film</h2>' +
        '<p class="vc-staff-profile-section__lead">' +
        esc(sf.label) +
        "</p>" +
        (sf.editable
          ? '<div class="vc-staff-tools-tabs">' +
            '<button type="button" class="vc-staff-tools-tab" data-sf="absent">Segnala assenza</button>' +
            '<button type="button" class="vc-staff-tools-tab" data-sf="present">Conferma presenza</button></div>' +
            '<p class="vc-staff-profile-section__meta">Modificabile fino alle 20:45 di sabato.</p>'
          : '<p class="vc-staff-profile-section__meta">Finestra di modifica chiusa per questa settimana.</p>') +
        "</section>";
    }

    html += '<div class="vc-staff-profile-sections vc-staff-profile-sections--rich">';

    html +=
      '<section class="vc-staff-profile-section">' +
      '<div class="vc-staff-profile-section__head">' +
      '<h2 class="vc-staff-profile-section__title">Pause</h2>' +
      '<a class="vc-staff-profile-section__link" href="/staff/pause/">Calendario</a></div>' +
      '<p class="vc-staff-profile-section__lead">' +
      esc(pause.statusLine || "—") +
      "</p>" +
      '<p class="vc-staff-profile-section__meta">Usati ' +
      esc(quota.used != null ? quota.used : "—") +
      " / " +
      esc(quota.max != null ? quota.max : "—") +
      " · rimanenti " +
      esc(quota.remaining != null ? quota.remaining : "—") +
      (quota.bonus > 0 ? " · bonus +" + esc(quota.bonus) : "") +
      (quota.tradedBonus > 0 ? " (di cui +" + esc(quota.tradedBonus) + " da scambio val+)" : "") +
      "</p>" +
      '<ul class="vc-staff-profile-rows">' +
      pauseRows +
      "</ul></section>";

    html +=
      '<section class="vc-staff-profile-section">' +
      '<h2 class="vc-staff-profile-section__title">Valutazioni</h2>' +
      '<div class="vc-staff-profile-val-counts">' +
      '<span class="vc-staff-profile-val-pill vc-staff-profile-val-pill--pos">+' +
      esc(val.positive || 0) +
      "</span>" +
      '<span class="vc-staff-profile-val-pill vc-staff-profile-val-pill--neg">−' +
      esc(val.negative || 0) +
      "</span></div>" +
      '<p class="vc-staff-profile-section__meta">Ultime motivazioni</p>' +
      '<ul class="vc-staff-profile-recent">' +
      recentHtml(
        [].concat(
          (val.recentPositive || []).map(function (t) {
            return "+ " + t;
          }),
          (val.recentNegative || []).map(function (t) {
            return "− " + t;
          }),
        ).slice(0, 8),
        "Nessuna motivazione recente.",
      ) +
      "</ul></section>";

    html +=
      '<section class="vc-staff-profile-section">' +
      '<h2 class="vc-staff-profile-section__title">Warn staff</h2>' +
      '<p class="vc-staff-profile-section__lead">' +
      (Number(warn.count || 0) === 0
        ? "Nessun warn staff."
        : Number(warn.count) === 1
          ? "1 warn staff attivo."
          : esc(warn.count) + " warn staff attivi.") +
      "</p>" +
      '<ul class="vc-staff-profile-recent">' +
      recentHtml(warn.recent || [], Number(warn.count || 0) ? "Nessuna motivazione recente." : "") +
      "</ul></section>";

    if (partner) {
      html +=
        '<section class="vc-staff-profile-section">' +
        '<h2 class="vc-staff-profile-section__title">Partner Manager</h2>' +
        '<div class="vc-staff-profile-pm-grid">' +
        '<div><span>Punti disponibili</span><strong>' +
        esc(partner.points || 0) +
        "</strong></div>" +
        "<div><span>Partnership</span><strong>" +
        esc(partner.partnerCount || 0) +
        "</strong></div>" +
        "<div><span>Spesi in shop</span><strong>" +
        esc(partner.redeemSpend || 0) +
        "</strong></div></div>" +
        '<p class="vc-staff-profile-section__meta">Shop e redeem restano su Discord.</p></section>';
    }

    if (mod) {
      html +=
        '<section class="vc-staff-profile-section vc-staff-profile-section--wide">' +
        '<h2 class="vc-staff-profile-section__title">Statistiche sanzioni</h2>' +
        '<div class="vc-staff-profile-mod-grid">' +
        modPeriodHtml("Ultimi 7 giorni", mod.d7) +
        modPeriodHtml("Ultimi 30 giorni", mod.d30) +
        modPeriodHtml("All time", mod.all) +
        "</div></section>";
    }

    html +=
      '<section class="vc-staff-profile-section vc-staff-profile-section--wide">' +
      '<h2 class="vc-staff-profile-section__title">Carriera</h2>' +
      (tenure && tenure.label
        ? '<p class="vc-staff-profile-section__lead">In staff dal ' + esc(tenure.label) + "</p>"
        : '<p class="vc-staff-profile-section__lead">Data ingresso non disponibile.</p>') +
      '<p class="vc-staff-profile-section__meta">Storico ruoli</p>' +
      '<ul class="vc-staff-profile-rows">' +
      roleRows +
      "</ul></section>";

    html += "</div>";

    root.innerHTML = html;
    root.hidden = false;
    setStatus("", false);

    root.querySelectorAll("[data-sf]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var willAttend = btn.getAttribute("data-sf") !== "absent";
        postSerataFilm(willAttend);
      });
    });
  }

  function serataApiUrl() {
    var c = window.__VC_STAFF_SERATAFILM || {};
    var local = cfgValueOrEmpty(c.apiUrlLocal);
    var base = isLocalOrigin() && local ? local : cfgValueOrEmpty(c.apiUrl) || "/webhooks/site-staff-seratafilm";
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

  function postSerataFilm(willAttend) {
    var token = getToken();
    if (!token) {
      setStatus("Sessione Discord assente.", true);
      return;
    }
    setStatus("Aggiorno Serata Film…", false);
    fetch(serataApiUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify({ willAttend: Boolean(willAttend) }),
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
        if (!out.res.ok || !out.data || !out.data.ok) {
          setStatus((out.data && out.data.message) || "Impossibile aggiornare la Serata Film.", true);
          return;
        }
        loadProfile();
      })
      .catch(function () {
        setStatus("Errore di rete sulla Serata Film.", true);
      });
  }

  function loadProfile() {
    var token = getToken();
    if (!token) {
      setStatus("Sessione Discord assente.", true);
      return;
    }
    setStatus("Caricamento profilo…", false);
    fetch(profileApiUrl(), {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
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
          setStatus("Errore di rete nel caricamento profilo.", true);
          return;
        }
        if (!out.res.ok || !out.data || !out.data.ok) {
          setStatus((out.data && out.data.message) || "Impossibile caricare il profilo staff.", true);
          var root = byId("vc-staff-profile");
          if (root) root.hidden = true;
          return;
        }
        renderPayload(out.data);
      })
      .catch(function () {
        setStatus("Errore di rete nel caricamento profilo.", true);
      });
  }

  var pageInited = false;
  function initAfterAccess() {
    if (pageInited) return;
    pageInited = true;
    loadProfile();
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
