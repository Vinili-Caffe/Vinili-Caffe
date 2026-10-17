/**
 * Bacheca — coda moderazione staff.
 */
(function () {
  "use strict";

  function boot(attempt) {
    var B = window.VcBoards;
    var root = document.getElementById("vc-boards-root");
    if (!root) return;
    if (!B) {
      if ((attempt || 0) < 50) {
        setTimeout(function () {
          boot((attempt || 0) + 1);
        }, 40);
        return;
      }
      root.innerHTML =
        '<div class="vc-boards-empty">Impossibile caricare Bacheca. Ricarica la pagina.</div>';
      return;
    }
    if (root.getAttribute("data-vc-boards-booted") === "1") return;
    root.setAttribute("data-vc-boards-booted", "1");
    run(B, root);
  }

  async function run(B, root) {
    /* boardsLoginGate1 */
    if (!B.token()) {
      if (B.showBoardsGate) {
        B.showBoardsGate({ mode: "login" });
      } else {
        root.innerHTML =
          '<div class="vc-boards-empty">Accedi con Discord. Serve accesso staff Vinili & Caffè.</div>';
      }
      try {
        if (B.markContentReady) B.markContentReady();
      } catch (_) {}
      return;
    }
    if (B.dismissBoardsGate) B.dismissBoardsGate();
    root.innerHTML =
      B.navHtml("mod", { hideKind: true }) +
      '<div class="vc-boards-shell">' +
      '<div class="vc-boards-shell__filters">' +
      '<select id="vc-boards-mod-status" class="vc-boards-sort"><option value="pending">In attesa</option><option value="approved">Approvate</option><option value="rejected">Rifiutate</option><option value="suspended">Sospese</option><option value="all">Tutte</option></select>' +
      '<button type="button" class="vc-boards-icon-btn" id="vc-boards-mod-refresh" title="Aggiorna" aria-label="Aggiorna"><i class="fa fa-refresh" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div id="vc-boards-msg" class="vc-boards-msg" hidden></div>' +
      '<div id="vc-boards-mod-list"></div></div>';

    var msg = document.getElementById("vc-boards-msg");
    var listEl = document.getElementById("vc-boards-mod-list");

    async function load() {
      var st = document.getElementById("vc-boards-mod-status").value;
      /* boardsMsgToast1 */
      if (msg) {
        msg.hidden = true;
        msg.textContent = "";
      }
      if (B.toastMsg) B.toastMsg("Caricamento…");
      var out = await B.api("/mod/listings?status=" + encodeURIComponent(st));
      if (!out.ok) {
        if (B.toastMsg) B.toastMsg(out.message || "Accesso negato.", true);
        listEl.innerHTML = "";
        return;
      }
      if (B.toastMsg) B.toastMsg("");
      var rows = out.listings || [];
      if (!rows.length) {
        listEl.innerHTML = '<div class="vc-boards-empty">Coda vuota.</div>';
        return;
      }
      listEl.innerHTML = rows
        .map(function (L) {
          return (
            '<div class="vc-boards-mod-row" data-id="' +
            B.esc(L.id) +
            '">' +
            "<div><strong>" +
            B.esc(L.name) +
            "</strong> · " +
            B.esc(B.kindLabel(L.kind)) +
            " · " +
            B.esc(L.discordId) +
            " · <em>" +
            B.esc(L.status) +
            "</em></div>" +
            (L.tagline
              ? '<p class="vc-boards-md">' + B.formatDescHtml(L.tagline, { inline: true }) + "</p>"
              : "") +
            (L.description ? "<p class=\"text-sm text-slate-300/80\">" + B.esc(L.description) + "</p>" : "") +
            '<div class="vc-boards-mod-row__actions">' +
            '<button type="button" class="vc-boards-btn" data-act="approve">Approva</button>' +
            '<button type="button" class="vc-boards-btn vc-boards-btn--danger" data-act="reject">Rifiuta</button>' +
            '<button type="button" class="vc-boards-btn vc-boards-btn--ghost" data-act="suspend">Sospendi</button>' +
            "</div></div>"
          );
        })
        .join("");

      listEl.querySelectorAll("[data-act]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var id = btn.closest("[data-id]").getAttribute("data-id");
          var decision = btn.getAttribute("data-act");
          var reason = "";
          if (decision === "reject" || decision === "suspend") {
            reason = window.prompt("Motivo (opzionale)") || "";
          }
          var r = await B.api("/mod/listings/" + encodeURIComponent(id), {
            method: "POST",
            json: { decision: decision, reason: reason },
          });
          if (!r.ok) {
            if (B.toastMsg) B.toastMsg(r.message || "Errore.", true);
            return;
          }
          load();
        });
      });
    }

    document.getElementById("vc-boards-mod-refresh").addEventListener("click", load);
    document.getElementById("vc-boards-mod-status").addEventListener("change", load);
    await load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot(0);
    });
  } else {
    boot(0);
  }
})();
