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

    html +=
      '<div class="vc-staff-tools-tabs">' +
      '<button type="button" data-lb="totale" class="vc-staff-tools-tab' +
      (mode === "totale" ? " is-active" : "") +
      '">All time</button>' +
      '<button type="button" data-lb="settimanale" class="vc-staff-tools-tab' +
      (mode === "settimanale" ? " is-active" : "") +
      '">Weekly</button></div>';

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

    if (me.isPm || me.isHighStaff) {
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
      html += '</ul><p class="vc-staff-profile-section__meta">Modifiche blacklist solo da Discord.</p></section>';
    }

    root.innerHTML = html;
    root.hidden = false;
    T.setStatus("vc-staff-pm-status", "", false);
    root.querySelectorAll("[data-lb]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        mode = btn.getAttribute("data-lb") || "totale";
        load();
      });
    });
  }

  function load() {
    if (!T.getToken()) {
      T.setStatus("vc-staff-pm-status", "Sessione Discord assente.", true);
      return;
    }
    T.setStatus("vc-staff-pm-status", "Caricamento hub PM…", false);
    T.fetchJson(apiUrl())
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          T.setStatus(
            "vc-staff-pm-status",
            (out.data && out.data.message) || "Impossibile caricare l'hub PM.",
            true,
          );
          return;
        }
        render(out.data);
      })
      .catch(function () {
        T.setStatus("vc-staff-pm-status", "Errore di rete.", true);
      });
  }

  var pageInited = false;
  function initAfterAccess() {
    if (pageInited) return;
    pageInited = true;
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
