(function () {
  if (document.getElementById("vc-ptr-scroll-restore-css")) return;

  var SCROLL_KEY = "vc_ptr_scroll_v1";

  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch (e0) {}

  function pagePath() {
    var p = String(window.location.pathname || "") + String(window.location.search || "");
    if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
    return p || "/";
  }

  try {
    var raw = sessionStorage.getItem(SCROLL_KEY);
    if (!raw) return;
    var data = JSON.parse(raw);
    if (!data || data.p !== pagePath()) return;
    var y = Math.max(0, Math.round(Number(data.y) || 0));
    if (y < 2) return;
    var at = Number(data.t) || 0;
    if (at && Date.now() - at > 5 * 60 * 1000) {
      sessionStorage.removeItem(SCROLL_KEY);
      return;
    }

    window.__vcPtrRestoreY = y;
    try {
      document.documentElement.setAttribute("data-vc-ptr-restore-y", String(y));
    } catch (eAttr) {}

    var css = document.createElement("style");
    css.id = "vc-ptr-scroll-restore-css";
    css.setAttribute("data-vc", "phonePtrScrollFix1");
    css.textContent =
      "html.vc-ptr-scroll-restore-pending,html.vc-ptr-scroll-restore-pending body{" +
      "overflow:hidden!important;overscroll-behavior:none!important;height:100%!important;" +
      "max-height:100dvh!important;touch-action:none!important}" +
      "html.vc-ptr-scroll-restore-pending body{" +
      "position:fixed!important;width:100%!important;left:0!important;right:0!important;" +
      "top:-" +
      y +
      "px!important;margin:0!important}";
    (document.head || document.documentElement).appendChild(css);
    document.documentElement.classList.add("vc-ptr-scroll-restore-pending");
  } catch (e1) {}
})();
