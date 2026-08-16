(function () {
  var T = window.VCStaffTools;
  if (!T) return;

  var canManage = false;

  function apiUrl() {
    return T.resolveApiUrl(window.__VC_STAFF_DIRECTORY, "/webhooks/site-staff-directory");
  }

  function personWrap(inner, userId, onPause) {
    var cls = "vc-staff-tools-person" + (onPause ? " is-paused" : "");
    if (!canManage || !userId) return '<li class="' + cls + '">' + inner + "</li>";
    return (
      '<li><a class="' +
      cls +
      ' vc-staff-tools-person--link" href="/staff/gestione/?userId=' +
      encodeURIComponent(userId) +
      '">' +
      inner +
      "</a></li>"
    );
  }

  function render(payload) {
    var root = T.byId("vc-staff-dir");
    if (!root || !payload || !payload.ok) return;
    var counts = payload.counts || {};
    var html =
      '<div class="vc-staff-tools__summary">' +
      "<strong>" +
      T.esc(counts.total || 0) +
      "</strong> in staff · <strong>" +
      T.esc(counts.onPause || 0) +
      "</strong> in pausa" +
      (canManage
        ? ' · <a href="/staff/gestione/" style="color:#e8c9a8;font-weight:700">Apri gestione →</a>'
        : "") +
      "</div>";

    (payload.sections || []).forEach(function (sec) {
      if (!sec.members || !sec.members.length) return;
      html +=
        '<section class="vc-staff-tools-section">' +
        '<h2 class="vc-staff-tools-section__title" style="--vc-staff-role-color:' +
        T.esc(sec.color || "#d4a888") +
        '">' +
        T.esc(sec.roleLabel || sec.roleKey || "Ruolo") +
        " <span>(" +
        sec.members.length +
        ")</span></h2>" +
        '<ul class="vc-staff-tools-list">';
      sec.members.forEach(function (m) {
        var inner =
          T.avatarImgHtml(m.avatarUrl, m.userId, { width: 40, height: 40 }) +
          "<div><strong>" +
          T.esc(m.displayName) +
          "</strong>" +
          '<span class="vc-staff-tools-person__meta">' +
          T.esc(m.displayRoleLabel || "") +
          (m.onPause ? " · in pausa" : "") +
          "</span></div>";
        html += personWrap(inner, m.userId, m.onPause);
      });
      html += "</ul></section>";
    });

    root.innerHTML = html;
    root.hidden = false;
    T.setStatus("vc-staff-dir-status", "", false);
  }

  function load() {
    if (!T.getToken()) {
      T.setStatus("vc-staff-dir-status", "Sessione Discord assente.", true);
      return;
    }
    T.setStatus("vc-staff-dir-status", "Caricamento directory…", false);
    var accessUrl = T.resolveApiUrl(window.__VC_STAFF_ACCESS, "/webhooks/site-staff-access");
    Promise.all([T.fetchJson(apiUrl()), T.fetchJson(accessUrl)])
      .then(function (results) {
        var out = results[0];
        var access = results[1];
        canManage = Boolean(access.data && access.data.ok && access.data.canManage);
        if (!out.res.ok || !out.data || !out.data.ok) {
          T.setStatus(
            "vc-staff-dir-status",
            (out.data && out.data.message) || "Impossibile caricare la directory.",
            true,
          );
          return;
        }
        render(out.data);
      })
      .catch(function () {
        T.setStatus("vc-staff-dir-status", "Errore di rete.", true);
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
