/* vcLoadingEmojiKill3: inject as last stylesheet so chrome-ui / late CSS cannot restore rings */
(function () {
  "use strict";
  var VER = "20260920vcLoadingCursorClean1";
  var HREF = "/css/vc-loading-emoji.css?v=" + VER;
  var LINK_ID = "vc-loading-emoji-css";

  function ensureLast() {
    try {
      var head = document.head || document.documentElement;
      if (!head) return;
      var link = document.getElementById(LINK_ID);
      if (!link) {
        link = document.createElement("link");
        link.id = LINK_ID;
        link.rel = "stylesheet";
        link.href = HREF;
        link.media = "all";
      } else if (link.href.indexOf(VER) < 0) {
        link.href = HREF;
      }
      /* always last among stylesheets */
      head.appendChild(link);
    } catch (e) {}
  }

  ensureLast();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureLast, { once: true });
  }
  window.addEventListener("load", ensureLast, { once: true });
  try {
    var mo = new MutationObserver(function () {
      var link = document.getElementById(LINK_ID);
      var head = document.head;
      if (!link || !head || head.lastElementChild === link) return;
      /* another stylesheet appended after us — re-assert last */
      if (link.nextSibling) head.appendChild(link);
    });
    if (document.head) {
      mo.observe(document.head, { childList: true });
      window.setTimeout(function () {
        try {
          mo.disconnect();
        } catch (e2) {}
      }, 15000);
    }
  } catch (eMo) {}
})();
