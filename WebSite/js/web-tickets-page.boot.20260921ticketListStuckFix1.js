/* wave2TicketsSplit1 / ticketsSkel1: lazy-load heavy tickets page after gate/idle */
(function () {
  /* ticketListStuckFix1 / ticketViewSwitch3 / ticketViewSwitch2 / ticketCatFilter1 */
  var VER = "20260921ticketListStuckFix1";
  if (window.__VC_WEB_TICKETS_BOOT === VER) return;
  window.__VC_WEB_TICKETS_BOOT = VER;

  var loaded = false;
  function scriptPrefix() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = String(scripts[i].getAttribute("src") || scripts[i].src || "");
      var m = src.match(/^(.*\/js\/)web-tickets-page\.boot(?:\.[^/?#]+)?\.js/);
      if (m) return m[1];
    }
    return "/js/";
  }

  function loadMain() {
    if (loaded) return;
    loaded = true;
    var s = document.createElement("script");
    s.src = scriptPrefix() + "web-tickets-page.20260921ticketListStuckFix1.js?v=" + VER;
    s.defer = true;
    (document.head || document.documentElement).appendChild(s);
  }

  function schedule() {
    var run = function () {
      loadMain();
    };
    /* ticketsSkel1: load sooner — skeleton already paints; don't wait 1.8s idle */
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 500 });
    } else {
      window.setTimeout(run, 120);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }
})();
