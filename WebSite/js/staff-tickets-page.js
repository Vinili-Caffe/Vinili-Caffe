(function () {
  var T = window.VCStaffTools;
  if (!T) return;
  var filter = "all";

  function apiUrl() {
    var base = T.resolveApiUrl(window.__VC_STAFF_TICKETS, "/webhooks/site-staff-tickets");
    var q = [];
    if (filter === "mine") q.push("mine=1");
    if (filter === "unclaimed") q.push("unclaimed=1");
    return q.length ? base + (base.indexOf("?") >= 0 ? "&" : "?") + q.join("&") : base;
  }

  function render(payload) {
    var root = T.byId("vc-staff-ticket");
    if (!root || !payload || !payload.ok) return;

    var html =
      '<div class="vc-staff-tools-tabs">' +
      '<button type="button" data-f="all" class="vc-staff-tools-tab' +
      (filter === "all" ? " is-active" : "") +
      '">Tutti (' +
      T.esc(payload.count || 0) +
      ")</button>" +
      '<button type="button" data-f="unclaimed" class="vc-staff-tools-tab' +
      (filter === "unclaimed" ? " is-active" : "") +
      '">Non claimati</button>' +
      '<button type="button" data-f="mine" class="vc-staff-tools-tab' +
      (filter === "mine" ? " is-active" : "") +
      '">I miei</button></div>';

    html += '<ul class="vc-staff-tools-rows">';
    (payload.tickets || []).forEach(function (t) {
      html +=
        '<li class="vc-staff-profile-row">' +
        '<span class="vc-staff-profile-row__main">#' +
        T.esc(t.ticketNumber != null ? t.ticketNumber : "?") +
        " · " +
        T.esc(t.ticketType || "ticket") +
        "</span>" +
        '<span class="vc-staff-profile-row__tag">' +
        T.esc(T.formatAge(t.createdAt)) +
        "</span>" +
        '<span class="vc-staff-profile-row__sub">' +
        T.esc(t.userTag || t.userId || "utente") +
        (t.claimedBy ? " · claim " + T.esc(t.claimedBy) : " · non claimato") +
        "</span></li>";
    });
    if (!(payload.tickets || []).length) {
      html += '<li class="vc-staff-tools-empty">Nessun ticket aperto con questo filtro.</li>';
    }
    html += '</ul><p class="vc-staff-profile-section__meta">Per claim/close apri il ticket su Discord.</p>';

    root.innerHTML = html;
    root.hidden = false;
    T.setStatus("vc-staff-ticket-status", "", false);
    root.querySelectorAll("[data-f]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        filter = btn.getAttribute("data-f") || "all";
        load();
      });
    });
  }

  function load() {
    if (!T.getToken()) {
      T.setStatus("vc-staff-ticket-status", "Sessione Discord assente.", true);
      return;
    }
    T.setStatus("vc-staff-ticket-status", "Caricamento ticket…", false);
    T.fetchJson(apiUrl())
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          T.setStatus(
            "vc-staff-ticket-status",
            (out.data && out.data.message) || "Impossibile caricare i ticket.",
            true,
          );
          return;
        }
        render(out.data);
      })
      .catch(function () {
        T.setStatus("vc-staff-ticket-status", "Errore di rete.", true);
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
