/* footerEndBreath5 — solo bake/CSS, zero thrash (niente MO/interval/append loop) */
(function () {
  var VER = "20261006footerBreathFix2";
  var PAD = "0.65rem";
  var STYLE_ID = "vc-footer-end-breath-css";
  var CSS =
    "html.vc-site-polish body.vc-body > footer.vc-premium-footer," +
    "html body.vc-body > footer.vc-premium-footer," +
    "html.vc-site-polish body.vc-body--home > footer.vc-premium-footer," +
    "html.vc-site-polish body.vc-page-cine-layout > footer.vc-premium-footer," +
    "html.vc-site-polish body.vc-dashboard-page > footer.vc-premium-footer," +
    "html.vc-site-polish.vc-page-cine-ready body.vc-body > footer.vc-premium-footer," +
    "html.vc-site-photo-bg.vc-site-polish body.vc-body > footer.vc-premium-footer," +
    "html.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__inner{" +
    "padding-bottom:" + PAD + "!important;margin-bottom:0!important}" +
    "html.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__outer," +
    "html body.vc-body > footer.vc-premium-footer .vc-premium-footer__outer," +
    "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer .vc-premium-footer__outer," +
    "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__outer," +
    "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body footer .vc-premium-footer__outer," +
    "html[data-vc-theme=\"light\"] footer.vc-premium-footer .vc-premium-footer__outer{" +
    "border-radius:1.25rem!important;margin-bottom:0!important}";

  function once() {
    var head = document.head || document.documentElement;
    if (!head) return;
    var st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement("style");
      st.id = STYLE_ID;
      head.appendChild(st);
    }
    if (st.textContent !== CSS) st.textContent = CSS;
    var foot = document.querySelector("footer.vc-premium-footer");
    if (foot) {
      try {
        foot.style.setProperty("padding-bottom", PAD, "important");
        foot.style.setProperty("margin-bottom", "0", "important");
      } catch (e1) {}
      var outer = foot.querySelector(".vc-premium-footer__outer");
      if (outer) {
        try {
          outer.style.setProperty("margin-bottom", "0", "important");
          outer.style.setProperty("border-radius", "1.25rem", "important");
        } catch (e2) {}
      }
    }
  }

  once();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", once, { once: true });
  }
  window.addEventListener("load", once, { once: true });
  window.__vcFooterEndBreath = VER;
})();
