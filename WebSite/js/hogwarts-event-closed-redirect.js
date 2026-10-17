/* hogwartsSiteDead1 — evento finito: /evento → home; strip libri; zero API */
(function () {
  "use strict";
  function homeUrl() {
    try {
      var u = String(window.__VC_SITE_HOME_URL || "").trim();
      if (u) return u;
      var auth = window.__VC_AUTH;
      if (auth && auth.homeUrl) return String(auth.homeUrl).trim();
    } catch (e) {}
    return "/";
  }
  function isEventoPath() {
    try {
      var p = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
      return p === "/evento" || p.indexOf("/evento/") === 0;
    } catch (e2) {
      return false;
    }
  }
  function strip() {
    try {
      var sec = document.getElementById("evento");
      if (sec) {
        sec.setAttribute("hidden", "");
        sec.style.display = "none";
      }
    } catch (e3) {}
    try {
      var books = document.querySelectorAll("[data-vc-forbidden-book], .vc-forbidden-book, #vc-forbidden-book-toast");
      for (var i = 0; i < books.length; i++) {
        var el = books[i];
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    } catch (e4) {}
    try {
      window.localStorage.setItem("vc:forbidden-books:gone", "1");
    } catch (e5) {}
  }
  function boot() {
    if (isEventoPath()) {
      try {
        window.location.replace(homeUrl());
      } catch (e6) {
        window.location.href = homeUrl();
      }
      return;
    }
    strip();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
