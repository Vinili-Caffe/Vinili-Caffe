(function () {
  function utils() {
    return window.__vcSeratafilmEventUtils || null;
  }

  function exitPresentationMode() {
    try {
      document.body.classList.remove("vc-seratafilm-final10", "vc-seratafilm-final-fullscreen", "vc-seratafilm-film-active");
      document.documentElement.classList.remove("vc-seratafilm-film-active");
    } catch (eCls) {}
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        var p = document.exitFullscreen();
        if (p && typeof p.catch === "function") p.catch(function () {});
      }
    } catch (eFs) {}
    try {
      if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch (eWk) {}
  }

  exitPresentationMode();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", exitPresentationMode);
  }

  window.__vcSeratafilmRenderThanks = function () {
    exitPresentationMode();
    var u = utils();
    if (!u) return;
    var next = u.resolveNextScreening(Date.now());
    var dateLabel = u.escapeHtml(u.formatScreeningDateLabel(next.dateKey, next.hour, next.minute));
    var title = u.escapeHtml(next.title);
    var te = document.getElementById("timer");
    if (!te) return;
    te.innerHTML =
      '<div class="tile" style="grid-column: 1 / -1; padding: 18px 14px;">' +
      '<span class="num vc-seratafilm-thanks-kicker">Grazie per la visione!</span>' +
      '<span class="lbl">Ci vediamo <strong>' +
      dateLabel +
      "</strong> con <strong>" +
      title +
      "</strong></span>" +
      "</div>";
  };
})();