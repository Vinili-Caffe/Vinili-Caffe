/**
 * Shared list skeletons — cards while async lists load (no empty flash).
 * listSkeletonBoot1 / listSkeletonBusy1 / listSkeletonClear1 / ticketsSkel1
 */
(function (w) {
  "use strict";

  var WATCHDOG_MS = 28000;
  var watchdogs = typeof WeakMap !== "undefined" ? new WeakMap() : null;

  function cardMarkup() {
    return (
      '<article class="vc-reviews-card vc-list-skel" aria-hidden="true">' +
      '<div class="vc-list-skel__row"><span class="vc-list-skel__avatar"></span><span class="vc-list-skel__lines"><i></i><i></i></span></div>' +
      '<span class="vc-list-skel__block"></span><span class="vc-list-skel__meta"></span></article>'
    );
  }

  function rowMarkup(tag) {
    var t = tag === "div" ? "div" : "li";
    return (
      "<" +
      t +
      ' class="' +
      (t === "li" ? "vc-notify-row " : "") +
      "vc-list-skel vc-list-skel--row" +
      (t === "div" ? " vc-wt-skel-row" : "") +
      '" aria-hidden="true">' +
      '<span class="vc-list-skel__avatar"></span>' +
      '<span class="vc-list-skel__lines"><i></i><i></i></span></' +
      t +
      ">"
    );
  }

  function cardsHtml(n) {
    var count = Math.max(1, Math.min(8, Number(n) || 4));
    var out = [];
    for (var i = 0; i < count; i += 1) out.push(cardMarkup());
    return out.join("");
  }

  function rowsHtml(n, tag) {
    var count = Math.max(1, Math.min(8, Number(n) || 4));
    var out = [];
    for (var i = 0; i < count; i += 1) out.push(rowMarkup(tag));
    return out.join("");
  }

  function failMarkup(mode, title, text) {
    var t = String(title || "Caricamento non riuscito");
    var d = String(text || "Ricarica la pagina o riprova tra poco.");
    if (mode === "rows") {
      return (
        '<li class="vc-reviews-empty vc-list-skel-fail" role="status" aria-live="polite">' +
        "<strong>" +
        t +
        "</strong><p>" +
        d +
        "</p></li>"
      );
    }
    return (
      '<div class="vc-reviews-empty vc-list-skel-fail" role="status" aria-live="polite">' +
      '<span class="vc-reviews-empty__icon"><i class="fa fa-exclamation-circle" aria-hidden="true"></i></span>' +
      "<strong>" +
      t +
      "</strong><p>" +
      d +
      "</p></div>"
    );
  }

  function clearWatchdog(el) {
    if (!el || !watchdogs) return;
    var tid = watchdogs.get(el);
    if (tid) {
      try {
        w.clearTimeout(tid);
      } catch (eT) {}
      watchdogs.delete(el);
    }
  }

  function scheduleWatchdog(el, mode) {
    if (!el || !watchdogs) return;
    clearWatchdog(el);
    var stamp = String(Date.now());
    try {
      el.setAttribute("data-vc-skel-at", stamp);
    } catch (eS) {}
    var tid = w.setTimeout(function () {
      try {
        if (!el || !el.isConnected) return;
        if (el.getAttribute("aria-busy") !== "true") return;
        if (el.getAttribute("data-vc-skel-at") !== stamp) return;
        if (!el.querySelector(".vc-list-skel")) return;
        paintFail(el, {
          mode: mode,
          title: "Caricamento troppo lungo",
          text: "Ricarica la pagina o riprova tra poco.",
        });
      } catch (eW) {}
    }, WATCHDOG_MS);
    watchdogs.set(el, tid);
  }

  function fill(el, opts) {
    if (!el) return false;
    opts = opts || {};
    var mode = opts.mode === "rows" ? "rows" : "cards";
    var count = opts.count != null ? opts.count : mode === "rows" ? 5 : 4;
    var itemTag = opts.itemTag === "div" ? "div" : "li";
    el.innerHTML = mode === "rows" ? rowsHtml(count, itemTag) : cardsHtml(count);
    try {
      el.setAttribute("aria-busy", "true");
      el.classList.add("is-loading");
      el.classList.remove("is-empty");
    } catch (eA) {}
    scheduleWatchdog(el, mode);
    return true;
  }

  function clearBusy(el) {
    if (!el) return;
    clearWatchdog(el);
    try {
      el.removeAttribute("aria-busy");
      el.removeAttribute("data-vc-skel-at");
      el.classList.remove("is-loading");
    } catch (eC) {}
  }

  function paintFail(el, opts) {
    if (!el) return false;
    opts = opts || {};
    var mode = opts.mode === "rows" ? "rows" : "cards";
    clearBusy(el);
    try {
      el.classList.add("is-empty");
      el.classList.remove("is-loading");
      el.innerHTML = failMarkup(mode, opts.title, opts.text);
    } catch (eF) {}
    return true;
  }

  function stripSkeletons(el) {
    if (!el || !el.querySelectorAll) return;
    clearBusy(el);
    try {
      var nodes = el.querySelectorAll(".vc-list-skel");
      for (var i = 0; i < nodes.length; i += 1) {
        if (nodes[i] && nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
      }
    } catch (eR) {}
  }

  w.VcListSkeleton = {
    cardMarkup: cardMarkup,
    rowMarkup: rowMarkup,
    cardsHtml: cardsHtml,
    rowsHtml: rowsHtml,
    fill: fill,
    clearBusy: clearBusy,
    paintFail: paintFail,
    stripSkeletons: stripSkeletons,
  };
})(window);
