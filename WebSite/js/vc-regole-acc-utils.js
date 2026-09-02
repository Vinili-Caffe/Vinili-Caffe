(function () {
  var SELECTOR =
    "#vc-regole-list .vc-regole-card, #vc-regole-tabs .vc-regole-tab, " +
    "#vc-staff-guide-list .vc-regole-card, #vc-staff-guide-tabs .vc-regole-tab";

  function revealInstant(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    var nodes;
    try {
      nodes = root.querySelectorAll(SELECTOR);
    } catch (e) {
      return;
    }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || !el.classList) continue;
      el.classList.add("is-in", "vc-regole-acc-ready");
      el.classList.remove("vc-home-rise");
      el.removeAttribute("data-vc-body-cascade");
      try {
        el.style.removeProperty("--vc-rise-delay");
      } catch (e2) {}
    }
    try {
      document.dispatchEvent(new Event("vc:regole-acc-ready"));
    } catch (e3) {}
  }

  window.__vcRevealRegoleAccordion = revealInstant;
})();
