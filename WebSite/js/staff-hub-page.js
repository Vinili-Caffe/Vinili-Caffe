(function () {
  var T = window.VCStaffTools;
  if (!T) return;

  function apiUrl() {
    return T.resolveApiUrl(window.__VC_STAFF_DASHBOARD, "/webhooks/site-staff-dashboard");
  }

  function kpiHtml(stats, canManage) {
    var items = [
      { label: "In staff", value: stats.staffTotal || 0, hint: "membri attivi" },
      { label: "In pausa", value: stats.onPause || 0, hint: "ora" },
      { label: "Ticket aperti", value: stats.openTickets || 0, hint: (stats.unclaimedTickets || 0) + " non claimati" },
      { label: "Partner Manager", value: stats.pmCount || 0, hint: "con ruolo PM" },
    ];
    if (canManage) {
      items.push({
        label: "Pause in attesa",
        value: stats.pendingPauses || 0,
        hint: "da gestire su Discord",
        accent: true,
      });
    }
    return (
      '<div class="vc-staff-dash-kpis">' +
      items
        .map(function (it) {
          return (
            '<div class="vc-staff-dash-kpi' +
            (it.accent ? " vc-staff-dash-kpi--accent" : "") +
            '"><p class="vc-staff-dash-kpi__value">' +
            T.esc(it.value) +
            '</p><p class="vc-staff-dash-kpi__label">' +
            T.esc(it.label) +
            '</p><p class="vc-staff-dash-kpi__hint">' +
            T.esc(it.hint) +
            "</p></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function viewerCardHtml(viewer) {
    if (!viewer) return "";
    return (
      '<a class="vc-staff-hub-preview" href="/staff/profilo/">' +
      T.avatarImgHtml(viewer.avatarUrl, viewer.userId, { width: 52, height: 52, className: "vc-staff-hub-preview__avatar vc-staff-avatar" }) +
      "<span><p class=\"vc-staff-hub-preview__name\">" +
      T.esc(viewer.displayName || "Il tuo profilo") +
      '</p><p class="vc-staff-hub-preview__role">' +
      T.esc(viewer.displayRoleLabel || "Staff") +
      (viewer.onPause ? " · in pausa" : "") +
      " · +" +
      T.esc(viewer.positive || 0) +
      " / −" +
      T.esc(viewer.negative || 0) +
      " · warn " +
      T.esc(viewer.warn || 0) +
      '</p></span><span class="vc-staff-hub-preview__hint">Apri profilo →</span></a>'
    );
  }

  function manageBannerHtml(canManage, stats) {
    if (!canManage) return "";
    var pending = Number(stats && stats.pendingPauses) || 0;
    return (
      '<a class="vc-staff-dash-manage" href="/staff/gestione/">' +
      '<span class="vc-staff-dash-manage__icon" aria-hidden="true"><i class="fa fa-sliders"></i></span>' +
      "<span><strong>Gestione staff</strong>" +
      "<span>Pex, depex, val+/− e warn dal sito (High Staff)." +
      (pending ? " · " + pending + " pause in attesa" : "") +
      '</span></span><span class="vc-staff-dash-manage__cta">Apri console →</span></a>'
    );
  }

  function roleBarsHtml(byRole) {
    if (!byRole || !byRole.length) return "";
    var max = 1;
    byRole.forEach(function (r) {
      if (r.count > max) max = r.count;
    });
    return (
      '<section class="vc-staff-dash-roles"><h2 class="vc-staff-dash-section__title">Composizione staff</h2><ul class="vc-staff-dash-roles__list">' +
      byRole
        .map(function (r) {
          var pct = Math.max(8, Math.round((100 * (r.count || 0)) / max));
          return (
            '<li class="vc-staff-dash-roles__item"><span class="vc-staff-dash-roles__name" style="--vc-staff-role-color:' +
            T.esc(r.color || "#d4a888") +
            '">' +
            T.esc(r.roleLabel) +
            '</span><span class="vc-staff-dash-roles__bar"><i style="width:' +
            pct +
            '%;background:' +
            T.esc(r.color || "#d4a888") +
            '"></i></span><span class="vc-staff-dash-roles__count">' +
            T.esc(r.count) +
            "</span></li>"
          );
        })
        .join("") +
      "</ul></section>"
    );
  }

  function toolsHtml(tools, canManage) {
    var list = (tools || []).slice();
    if (canManage) {
      list.unshift({
        id: "gestione",
        href: "/staff/gestione/",
        title: "Gestione",
        desc: "Console High Staff: pex, val, warn",
        icon: "sliders",
        featured: true,
      });
    }
    return (
      '<div class="vc-staff-hub-grid">' +
      list
        .map(function (t) {
          return (
            '<a class="vc-staff-hub-card' +
            (t.featured ? " vc-staff-hub-card--featured" : "") +
            '" href="' +
            T.esc(t.href) +
            '"><span class="vc-staff-hub-card__icon" aria-hidden="true"><i class="fa fa-' +
            T.esc(t.icon || "circle") +
            '"></i></span><h2 class="vc-staff-hub-card__title">' +
            T.esc(t.title) +
            '</h2><p class="vc-staff-hub-card__desc">' +
            T.esc(t.desc) +
            "</p></a>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function render(payload) {
    var root = T.byId("vc-staff-dash");
    if (!root || !payload || !payload.ok) return;
    var stats = payload.stats || {};
    var html = "";
    html += viewerCardHtml(payload.viewer);
    html += manageBannerHtml(payload.canManage, stats);
    html += kpiHtml(stats, payload.canManage);
    html += roleBarsHtml(payload.byRole);
    html += '<h2 class="vc-staff-dash-section__title vc-staff-dash-section__title--tools">Strumenti</h2>';
    html += toolsHtml(payload.tools, payload.canManage);
    root.innerHTML = html;
    root.hidden = false;
    T.setStatus("vc-staff-dash-status", "", false);
  }

  function load() {
    if (!T.getToken()) {
      T.setStatus("vc-staff-dash-status", "Sessione Discord assente.", true);
      return;
    }
    T.setStatus("vc-staff-dash-status", "Caricamento dashboard…", false);
    T.fetchJson(apiUrl())
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          T.setStatus(
            "vc-staff-dash-status",
            (out.data && out.data.message) || "Impossibile caricare la dashboard.",
            true,
          );
          return;
        }
        render(out.data);
      })
      .catch(function () {
        T.setStatus("vc-staff-dash-status", "Errore di rete.", true);
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
