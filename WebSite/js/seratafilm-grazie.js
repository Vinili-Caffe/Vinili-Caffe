(function () {
  /* sfGrazieCountdown1: next-film countdown; strip data-i18n so i18n cannot wipe #timer */
  var tickTimer = 0;

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

  function claimTimerEl() {
    var te = document.getElementById("timer");
    if (!te) return null;
    try {
      te.removeAttribute("data-i18n");
      te.removeAttribute("data-i18n-src");
      te.removeAttribute("data-i18n-html");
    } catch (eRm) {}
    return te;
  }

  function pad2(n) {
    return String(Math.max(0, Math.floor(Number(n) || 0)));
  }

  function renderCountdown(te, next, nowMs) {
    var atMs = Number(next && next.atMs) || 0;
    var dist = Math.max(0, atMs - nowMs);
    var giorni = Math.floor(dist / (1000 * 60 * 60 * 24));
    var ore = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minuti = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
    var secondi = Math.floor((dist % (1000 * 60)) / 1000);
    var u = utils();
    var dateLabel = u ? u.formatScreeningDateLabel(next.dateKey, next.hour, next.minute) : "presto";
    var title = String((next && next.title) || "il prossimo film").trim() || "il prossimo film";
    var existing = te.querySelectorAll(".tile .num");
    if (existing && existing.length === 4 && te.querySelector(".vc-seratafilm-thanks-next")) {
      existing[0].textContent = pad2(giorni);
      existing[1].textContent = pad2(ore);
      existing[2].textContent = pad2(minuti);
      existing[3].textContent = pad2(secondi);
      return;
    }
    te.innerHTML =
      '<div class="tile" data-unit="days"><span class="num">' +
      pad2(giorni) +
      '</span><span class="lbl">Giorni</span></div>' +
      '<div class="tile" data-unit="hours"><span class="num">' +
      pad2(ore) +
      '</span><span class="lbl">Ore</span></div>' +
      '<div class="tile" data-unit="minutes"><span class="num">' +
      pad2(minuti) +
      '</span><span class="lbl">Minuti</span></div>' +
      '<div class="tile" data-unit="seconds"><span class="num">' +
      pad2(secondi) +
      '</span><span class="lbl">Secondi</span></div>' +
      '<div class="tile vc-seratafilm-thanks-next">' +
      '<span class="lbl">Prossima serata: <strong>' +
      (u ? u.escapeHtml(dateLabel) : dateLabel) +
      "</strong> · <strong>" +
      (u ? u.escapeHtml(title) : title) +
      "</strong></span></div>";
  }

  function startThanksCountdown() {
    var u = utils();
    var te = claimTimerEl();
    if (!u || !te || typeof u.resolveNextScreening !== "function") return false;
    if (tickTimer) {
      try {
        clearInterval(tickTimer);
      } catch (eCl) {}
      tickTimer = 0;
    }
    function tick() {
      var now = Date.now();
      var next = u.resolveNextScreening(now);
      var atMs = Number(next && next.atMs) || 0;
      var remaining = Math.max(0, atMs - now);
      renderCountdown(claimTimerEl() || te, next, now);
      if (typeof window.__vcSeratafilmBgmOnTick === "function") {
        window.__vcSeratafilmBgmOnTick(remaining);
      }
    }
    tick();
    tickTimer = setInterval(tick, 1000);
    return true;
  }

  exitPresentationMode();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", exitPresentationMode);
  }

  window.__vcSeratafilmRenderThanks = function () {
    exitPresentationMode();
    var tries = 0;
    function attempt() {
      tries += 1;
      if (startThanksCountdown()) return;
      if (tries < 20) setTimeout(attempt, 150);
    }
    attempt();
  };
})();
