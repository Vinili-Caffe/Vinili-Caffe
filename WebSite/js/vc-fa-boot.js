(function () {
    var root = document.documentElement;
  var done = false;
  var FA_URL = "/css/font-awesome/fonts/fontawesome-webfont.woff2?v=4.7.0";

  function markReady() {
    if (done) return;
    done = true;
    try {
      root.classList.add("vc-fa-ready");
    } catch (e) {}
  }

  try {
    if (
      window.matchMedia &&
      (window.matchMedia("(min-width: 1200px)").matches ||
        window.matchMedia("(hover: hover) and (pointer: fine)").matches)
    ) {
      markReady();
    }
  } catch (eDesk) {}

  if (!done) {
    try {
      if (window.FontFace) {
        var ff = new FontFace(
          "FontAwesome",
          'url("' + FA_URL + '") format("woff2")',
          { style: "normal", weight: "normal", display: "swap" },
        );
        ff.load()
          .then(function (font) {
            try {
              document.fonts.add(font);
            } catch (eAdd) {}
            markReady();
          })
          .catch(markReady);
      } else if (document.fonts && typeof document.fonts.load === "function") {
        document.fonts.load('1em "FontAwesome"').then(markReady).catch(markReady);
      } else {
        markReady();
      }
    } catch (eBoot) {
      markReady();
    }
  }

  window.setTimeout(markReady, 400);
})();
