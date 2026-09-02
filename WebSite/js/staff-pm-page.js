(function () {
  var T = window.VCStaffTools;
  if (!T) return;
  var mode = "totale";

  function apiUrl() {
    var base = T.resolveApiUrl(window.__VC_STAFF_PM_HUB, "/webhooks/site-staff-pm-hub");
    return base + (base.indexOf("?") >= 0 ? "&" : "?") + "lb=" + encodeURIComponent(mode);
  }

  function render(payload) {
    var root = T.byId("vc-staff-pm");
    if (!root || !payload || !payload.ok) return;
    var me = payload.me || {};
    var lb = payload.leaderboard || {};
    var bl = payload.blacklist || {};

    var html =
      '<a class="vc-staff-pm-pt-link" href="/notifications/?view=staff&inbox=punti-tolti">' +
      '<div><strong>Punti tolti PM</strong><span>Registro delle segnalazioni partnership</span></div>' +
      '<i class="fa fa-chevron-right" aria-hidden="true"></i></a>' +
      '<div class="vc-staff-profile-stats">' +
      '<div class="vc-staff-profile-stat"><p class="vc-staff-profile-stat__value">' +
      T.esc(me.pointsSpendable || 0) +
      '</p><p class="vc-staff-profile-stat__label">Punti spendibili</p></div>' +
      '<div class="vc-staff-profile-stat"><p class="vc-staff-profile-stat__value">' +
      T.esc(me.pointsEarned || 0) +
      '</p><p class="vc-staff-profile-stat__label">Partnership</p></div>' +
      '<div class="vc-staff-profile-stat"><p class="vc-staff-profile-stat__value">' +
      T.esc(me.redeemSpend || 0) +
      '</p><p class="vc-staff-profile-stat__label">Spesi shop</p></div></div>';

    if (me.isPm && me.shop && window.VCStaffPmShop) {
      html += window.VCStaffPmShop.renderShopSection(me.shop);
    }

    html +=
      '<div class="vc-staff-tools-tabs">' +
      '<button type="button" data-lb="totale" class="vc-staff-tools-tab' +
      (mode === "totale" ? " is-active" : "") +
      '">Tutti i tempi</button>' +
      '<button type="button" data-lb="settimanale" class="vc-staff-tools-tab' +
      (mode === "settimanale" ? " is-active" : "") +
      '">Settimana</button></div>';

    html += '<section class="vc-staff-tools-section"><h2 class="vc-staff-tools-section__title">Classifica</h2><ol class="vc-staff-tools-rank">';
    (lb.rows || []).forEach(function (row) {
      html +=
        "<li>" +
        T.avatarImgHtml(row.avatarUrl, row.userId, { width: 36, height: 36 }) +
        "<div><strong>#" +
        T.esc(row.rank) +
        " " +
        T.esc(row.displayName) +
        "</strong><span>" +
        T.esc(row.score) +
        " pts</span></div></li>";
    });
    if (!(lb.rows || []).length) html += "<li class=\"vc-staff-tools-empty\">Nessun dato.</li>";
    html += "</ol></section>";

    if (me.isPm || me.isHighStaff || me.canManagePm) {
      html +=
        '<section class="vc-staff-tools-section"><h2 class="vc-staff-tools-section__title">Blacklist partnership <span>(' +
        T.esc(bl.count || 0) +
        ')</span></h2><ul class="vc-staff-tools-rows">';
      (bl.items || []).forEach(function (it) {
        html +=
          '<li class="vc-staff-profile-row"><span class="vc-staff-profile-row__main">' +
          T.esc(it.guildName || it.guildId || "Server") +
          "</span>" +
          (it.note ? '<span class="vc-staff-profile-row__sub">' + T.esc(it.note) + "</span>" : "") +
          (it.invite
            ? '<a class="vc-staff-profile-section__link" href="' +
              T.esc(it.invite) +
              '" target="_blank" rel="noopener noreferrer">Invite</a>'
            : "") +
          "</li>";
      });
      if (!(bl.items || []).length) html += '<li class="vc-staff-tools-empty">Nessun server in blacklist.</li>';
      html += "</ul>";
            if (me.isHighStaff) {
        html +=
          '<div class="vc-staff-inbox-actions vc-staff-pm-actions">' +
          '<h3 class="vc-staff-tools-section__title">Modifica punti</h3>' +
          '<label><span>ID membro</span><input id="vc-pm-points-uid" type="text" placeholder="ID numerico" /></label>' +
          '<label><span>Quantità</span><input id="vc-pm-points-amt" type="number" min="1" max="500" value="1" /></label>' +
          '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--ok" id="vc-pm-points-add">Aggiungi punti</button>' +
          '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--no" id="vc-pm-points-rm">Rimuovi punti</button></div>' +
          '<div class="vc-staff-inbox-actions vc-staff-pm-actions">' +
          '<h3 class="vc-staff-tools-section__title">Blacklist partnership</h3>' +
          '<label><span>Invite server</span><input id="vc-pm-bl-invite" type="text" placeholder="Link invite" /></label>' +
          '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--no" id="vc-pm-bl-add">Aggiungi blacklist</button>' +
          '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--ok" id="vc-pm-bl-rm">Rimuovi blacklist</button></div>';
      } else {
        html +=
          '<p class="vc-staff-profile-section__meta">Solo lettura: modifica punti e blacklist riservate all\'High Staff.</p>';
      }
      html += "</section>";
    }

    root.innerHTML = html;
    root.hidden = false;
    T.clearPanelLoading("vc-staff-pm");
    T.setStatus("vc-staff-pm-status", "", false);
    if (me.isPm && me.shop && window.VCStaffPmShop) {
      window.VCStaffPmShop.bindShop(root, {
        statusId: "vc-staff-pm-status",
        onReload: function () {
          load();
        },
        setStatus: function (msg, err) {
          T.setStatus("vc-staff-pm-status", msg, err);
        },
      });
    }
    root.querySelectorAll("[data-lb]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        mode = btn.getAttribute("data-lb") || "totale";
        load();
      });
    });
    wirePmActions();
  }

  function pmActionsApi(body) {
    var base = T.resolveApiUrl(window.__VC_STAFF_PM_ACTIONS, "/webhooks/site-staff-pm-actions");
    return T.fetchJson(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function wirePmActions() {
    function bind(id, fn) {
      var el = T.byId(id);
      if (el) el.addEventListener("click", fn);
    }
    bind("vc-pm-points-add", function () {
      var uid = String((T.byId("vc-pm-points-uid") || {}).value || "").trim();
      var amt = Number((T.byId("vc-pm-points-amt") || {}).value || 1);
      pmActionsApi({ action: "points_add", userId: uid, amount: amt }).then(function (out) {
        T.setStatus("vc-staff-pm-status", (out.data && out.data.message) || "Fatto.", !out.data || !out.data.ok);
        if (out.data && out.data.ok) load();
      });
    });
    bind("vc-pm-points-rm", function () {
      var uid = String((T.byId("vc-pm-points-uid") || {}).value || "").trim();
      var amt = Number((T.byId("vc-pm-points-amt") || {}).value || 1);
      pmActionsApi({ action: "points_remove", userId: uid, amount: amt }).then(function (out) {
        T.setStatus("vc-staff-pm-status", (out.data && out.data.message) || "Fatto.", !out.data || !out.data.ok);
        if (out.data && out.data.ok) load();
      });
    });
    bind("vc-pm-bl-add", function () {
      var invite = String((T.byId("vc-pm-bl-invite") || {}).value || "").trim();
      pmActionsApi({ action: "blacklist_add", invite: invite }).then(function (out) {
        T.setStatus("vc-staff-pm-status", (out.data && out.data.message) || "Fatto.", !out.data || !out.data.ok);
        if (out.data && out.data.ok) load();
      });
    });
    bind("vc-pm-bl-rm", function () {
      var invite = String((T.byId("vc-pm-bl-invite") || {}).value || "").trim();
      pmActionsApi({ action: "blacklist_remove", invite: invite }).then(function (out) {
        T.setStatus("vc-staff-pm-status", (out.data && out.data.message) || "Fatto.", !out.data || !out.data.ok);
        if (out.data && out.data.ok) load();
      });
    });
  }

  function load() {
    T.whenDiscordSessionReady(function () {
      if (!T.getToken()) {
        T.setStatus("vc-staff-pm-status", "Accedi per continuare.", true);
        return;
      }
      T.showPanelLoading("vc-staff-pm");
      T.fetchJson(apiUrl(), { timeoutMs: 45000 })
        .then(function (out) {
          if (!out.res.ok || !out.data || !out.data.ok) {
            T.clearPanelLoading("vc-staff-pm");
            T.setStatus(
              "vc-staff-pm-status",
              (out.data && out.data.message) ||
                "Impossibile caricare l'hub PM." +
                  (out.res && out.res.status ? " (HTTP " + out.res.status + ")" : ""),
              true,
            );
            return;
          }
          render(out.data);
        })
        .catch(function () {
          T.clearPanelLoading("vc-staff-pm");
          T.setStatus("vc-staff-pm-status", "Errore di rete.", true);
        });
    });
  }

  T.bootPage(function () {
    T.registerPtrRefresh(load);
    function maybeLoad() {
      var panel = document.getElementById("vc-staff-pm-panel");
      if (panel && panel.hidden) return;
      load();
    }
    window.addEventListener("vc:staff-manage-tab", function (ev) {
      if (ev && ev.detail && ev.detail.tab === "pm") load();
    });
    maybeLoad();
        if (!document.getElementById("vc-manage-tabs")) load();
  });
})();
