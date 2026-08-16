(function () {
  var T = window.VCStaffTools;
  if (!T) return;

  function apiUrl(withTeam) {
    var base = T.resolveApiUrl(window.__VC_STAFF_VALWARN, "/webhooks/site-staff-valwarn");
    return withTeam ? base + (base.indexOf("?") >= 0 ? "&" : "?") + "team=1" : base;
  }

  function render(payload) {
    var root = T.byId("vc-staff-val");
    if (!root || !payload || !payload.ok) return;
    var val = payload.valutazioni || {};
    var warn = payload.warn || {};
    var target = payload.target || {};

    var html =
      '<header class="vc-staff-tools__summary"><strong>' +
      T.esc(target.displayName || "Tu") +
      "</strong> — i tuoi conteggi staff</header>";

    html +=
      '<div class="vc-staff-profile-stats">' +
      '<div class="vc-staff-profile-stat"><p class="vc-staff-profile-stat__value">' +
      T.esc(val.positive || 0) +
      '</p><p class="vc-staff-profile-stat__label">Val +</p></div>' +
      '<div class="vc-staff-profile-stat"><p class="vc-staff-profile-stat__value">' +
      T.esc(val.negative || 0) +
      '</p><p class="vc-staff-profile-stat__label">Val −</p></div>' +
      '<div class="vc-staff-profile-stat"><p class="vc-staff-profile-stat__value">' +
      T.esc(warn.count || 0) +
      '</p><p class="vc-staff-profile-stat__label">Warn</p></div></div>';

    html +=
      '<div class="vc-staff-profile-sections vc-staff-profile-sections--rich">' +
      '<section class="vc-staff-profile-section"><h2 class="vc-staff-profile-section__title">Ultime val +</h2><ul class="vc-staff-profile-recent">' +
      ((val.recentPositive || []).length
        ? val.recentPositive.map(function (l) {
            return "<li>" + T.esc(l) + "</li>";
          }).join("")
        : '<li class="vc-staff-profile-recent__empty">Nessuna.</li>') +
      "</ul></section>" +
      '<section class="vc-staff-profile-section"><h2 class="vc-staff-profile-section__title">Ultime val −</h2><ul class="vc-staff-profile-recent">' +
      ((val.recentNegative || []).length
        ? val.recentNegative.map(function (l) {
            return "<li>" + T.esc(l) + "</li>";
          }).join("")
        : '<li class="vc-staff-profile-recent__empty">Nessuna.</li>') +
      "</ul></section>" +
      '<section class="vc-staff-profile-section vc-staff-profile-section--wide"><h2 class="vc-staff-profile-section__title">Warn recenti</h2><ul class="vc-staff-profile-recent">' +
      ((warn.recent || []).length
        ? warn.recent.map(function (l) {
            return "<li>" + T.esc(l) + "</li>";
          }).join("")
        : '<li class="vc-staff-profile-recent__empty">Nessun warn.</li>') +
      "</ul></section></div>";

    if (payload.viewerIsHighStaff && Array.isArray(payload.team)) {
      html +=
        '<section class="vc-staff-tools-section"><h2 class="vc-staff-tools-section__title">Overview team (High Staff)</h2>' +
        '<p class="vc-staff-tools__summary" style="margin-bottom:0.75rem"><a href="/staff/gestione/" style="color:#e8c9a8;font-weight:700">Apri console gestione →</a></p>' +
        '<ul class="vc-staff-tools-list">';
      payload.team.forEach(function (m) {
        html +=
          '<li><a class="vc-staff-tools-person vc-staff-tools-person--link" href="/staff/gestione/?userId=' +
          encodeURIComponent(m.userId) +
          '">' +
          T.avatarImgHtml(m.avatarUrl, m.userId, { width: 40, height: 40 }) +
          "<div><strong>" +
          T.esc(m.displayName) +
          "</strong><span class=\"vc-staff-tools-person__meta\">+" +
          T.esc(m.positive) +
          " / −" +
          T.esc(m.negative) +
          " · warn " +
          T.esc(m.warn) +
          (m.onPause ? " · in pausa" : "") +
          "</span></div></a></li>";
      });
      if (!payload.team.length) html += '<li class="vc-staff-tools-empty">Nessun dato team.</li>';
      html += "</ul></section>";
    }

    root.innerHTML = html;
    root.hidden = false;
    T.setStatus("vc-staff-val-status", "", false);
  }

  function load() {
    if (!T.getToken()) {
      T.setStatus("vc-staff-val-status", "Sessione Discord assente.", true);
      return;
    }
    T.setStatus("vc-staff-val-status", "Caricamento valutazioni…", false);
    T.fetchJson(apiUrl(true))
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          T.setStatus(
            "vc-staff-val-status",
            (out.data && out.data.message) || "Impossibile caricare i dati.",
            true,
          );
          return;
        }
        render(out.data);
      })
      .catch(function () {
        T.setStatus("vc-staff-val-status", "Errore di rete.", true);
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
