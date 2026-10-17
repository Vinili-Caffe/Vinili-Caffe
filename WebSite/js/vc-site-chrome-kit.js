/* siteChromeKit4: kit3 + toast dismiss su sheet open (CSS hide + JS).
   NO MutationObserver su class (evita fight home-cine → freeze Compiti).
   Scroll-cue: allinea home-cine — staff cine (compiti) PUÒ avere cue; kill solo profilo/skip. */
(function () {
  "use strict";
  /* homeCssAlign2: VER = chromeGap1 (mai siteChromeKit5 — riscriveva CSS stamp vecchio) */
  var VER = "20261016chromeGap1";
  var TITLE_VER = "20261011titlePwaDingbat3"; /* titleSepFix1: keep dingbat ǀ */
  var CSS_ID = "vc-site-chrome-kit-css";
  if (window.__VC_SITE_CHROME_KIT === VER && window.VcSiteChromeKit) return;
  window.__VC_SITE_CHROME_KIT = VER;

  var cssPinned = false;

  function ensureBodyChrome() {
    try {
      var body = document.body;
      if (!body) return;
      if (!body.id) body.id = "top";
      if (!body.classList.contains("vc-body")) body.classList.add("vc-body");
    } catch (eBody) {}
  }

  function pinCssLast(force) {
    try {
      if (cssPinned && !force) {
        var existing = document.getElementById(CSS_ID);
        if (existing && String(existing.getAttribute("href") || "").indexOf(VER) >= 0) return;
      }
      var head = document.head || document.documentElement;
      if (!head) return;
      var link = document.getElementById(CSS_ID);
      if (!link) link = document.querySelector('link[href*="vc-site-chrome-kit"]');
      var href = "/css/vc-site-chrome-kit." + VER + ".css?v=" + VER;
      if (!link) {
        link = document.createElement("link");
        link.rel = "stylesheet";
        link.id = CSS_ID;
        link.setAttribute("data-vc", "siteChromeKit3");
        head.appendChild(link);
      }
      link.id = CSS_ID;
      link.media = "all";
      var cur = String(link.getAttribute("href") || "");
      if (cur.indexOf(VER) < 0 || cur.indexOf("vc-site-chrome-kit") < 0) {
        link.setAttribute("href", href);
      }
      if (link.parentNode) link.parentNode.appendChild(link);
      cssPinned = true;
      try {
        ["vc-notif-badge-social5", "vc-esci-flat-nosheen5", "vc-badge-in-bell-live1"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el && el.tagName === "STYLE" && el.parentNode) el.parentNode.removeChild(el);
        });
      } catch (eRm) {}
    } catch (ePin) {}
  }

  function forceBadgeCorner() {
    try {
      window.__vcBadgeCornerForce4 = 1;
      var badges = document.querySelectorAll(
        "header #vc-notif-dropdown > summary.vc-notif-summary > .vc-notif-badge, " +
          "header .vc-notif-summary > .vc-notif-badge, " +
          "#header-quick-actions #vc-notif-dropdown > summary.vc-notif-summary > .vc-notif-badge"
      );
      for (var i = 0; i < badges.length; i++) {
        var bd = badges[i];
        if (!bd || !bd.style) continue;
        var txt = String(bd.textContent || "").trim();
        if (!txt || txt === "0") {
          bd.setAttribute("hidden", "");
          bd.style.setProperty("display", "none", "important");
          continue;
        }
        bd.removeAttribute("hidden");
        bd.style.setProperty("position", "absolute", "important");
        bd.style.setProperty("top", "0", "important");
        bd.style.setProperty("right", "0", "important");
        bd.style.setProperty("left", "auto", "important");
        bd.style.setProperty("bottom", "auto", "important");
        bd.style.setProperty("transform", "translate(48%, -48%)", "important");
        bd.style.setProperty("-webkit-transform", "translate(48%, -48%)", "important");
        bd.style.setProperty("z-index", "30", "important");
        bd.style.setProperty("display", "inline-flex", "important");
      }
    } catch (eBadge) {}
  }

  function forceEsciFlat() {
    try {
      var btn = document.getElementById("discord-logout-btn");
      if (!btn || !btn.style) return;
      btn.style.setProperty("background", "#b91c1c", "important");
      btn.style.setProperty("background-color", "#b91c1c", "important");
      btn.style.setProperty("background-image", "none", "important");
      btn.style.setProperty("box-shadow", "none", "important");
      btn.style.setProperty("filter", "none", "important");
      btn.style.setProperty("border", "1px solid #991b1b", "important");
    } catch (eEsci) {}
  }

  function pathNorm() {
    try {
      return (
        String((location && location.pathname) || "/")
          .replace(/\/index\.html$/i, "")
          .replace(/\/+$/, "") || "/"
      );
    } catch (eP) {
      return "/";
    }
  }

  function isStaffCinePage() {
    try {
      var body = document.body;
      if (!body) return false;
      if (body.classList.contains("vc-staff-cine-page")) return true;
      if (
        body.classList.contains("vc-staff-compiti-page") &&
        body.classList.contains("vc-page-cine-layout")
      ) {
        return true;
      }
      if (
        body.classList.contains("vc-staff-pause-page") &&
        body.classList.contains("vc-page-cine-layout")
      ) {
        return true;
      }
    } catch (eS) {}
    try {
      var p = pathNorm();
      if (/^\/staff\/(compiti|pause)(\/|$)/i.test(p)) return true;
    } catch (eP) {}
    return false;
  }

  function isUserProfileRoute() {
    try {
      var body = document.body;
      if (
        body &&
        (body.classList.contains("vc-user-profile-route") ||
          body.classList.contains("vc-user-profile-page"))
      ) {
        return true;
      }
    } catch (eB) {}
    try {
      var p = pathNorm();
      if (/^\/users?\/\d{17,20}$/.test(p)) return true;
      if (p === "/user" || p === "/users") {
        var q = new URLSearchParams((location && location.search) || "");
        var id = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
        if (/^\d{17,20}$/.test(id)) return true;
      }
    } catch (ePath) {}
    return false;
  }

  /* Allineato a vc-home-cine skipScrollCuePage: staff cine = NON skip (no fight). */
  function skipScrollCuePage() {
    try {
      if (isUserProfileRoute()) return true;
      /* CRITICO: non killare cue su Compiti/Pause cine — home-cine lo gestisce */
      if (isStaffCinePage()) return false;
      var body = document.body;
      if (!body) return false;
      if (body.classList.contains("vc-notifications-page")) return true;
      if (body.classList.contains("vc-staff-profile-home")) return true;
      var p = pathNorm();
      if (/^\/staff\/inbox(\/|$)/i.test(p)) return true;
      if (/^\/bacheca\/scheda(\/|$)/i.test(p)) return true;
      if (
        !body.classList.contains("vc-page-cine-layout") &&
        !body.classList.contains("vc-body--home")
      ) {
        return true;
      }
    } catch (eSkip) {}
    return false;
  }

  function killScrollCueDom() {
    /* solo hide DOM — NON toggle html.vc-scrollcue-away (evita MO/fight) */
    try {
      var staleAll = document.querySelectorAll(".vc-home-scrollcue");
      for (var si = 0; si < staleAll.length; si++) {
        var el = staleAll[si];
        try {
          if (el.style) {
            el.style.setProperty("display", "none", "important");
            el.style.setProperty("visibility", "hidden", "important");
            el.style.setProperty("opacity", "0", "important");
            el.style.setProperty("pointer-events", "none", "important");
          }
        } catch (eHid) {}
        try {
          el.remove();
        } catch (eRm) {
          try {
            if (el.parentNode) el.parentNode.removeChild(el);
          } catch (eRm2) {}
        }
      }
    } catch (eKill) {}
  }

  function killStuckFloats() {
    var sheetOpen = false;
    try {
      sheetOpen =
        document.documentElement.classList.contains("vc-notif-sheet-open") ||
        document.documentElement.classList.contains("vc-notif-drawer-open");
    } catch (eOpen) {
      sheetOpen = false;
    }
    try {
      var toasts = document.querySelectorAll(
        ".vc-notif-ig-toast, .vc-notif-fly-card, .vc-notif-fly-card.vc-notif-ig-toast"
      );
      for (var i = 0; i < toasts.length; i++) {
        var t = toasts[i];
        var countEl = t.querySelector(".vc-notif-ig-toast__count");
        var n = countEl ? String(countEl.textContent || "").trim() : "";
        if (sheetOpen || !n || n === "0") {
          try {
            t.remove();
          } catch (eRm) {
            try {
              t.style.setProperty("display", "none", "important");
              t.style.setProperty("visibility", "hidden", "important");
              t.style.setProperty("pointer-events", "none", "important");
            } catch (eH) {}
          }
        }
      }
    } catch (eT) {}
    try {
      /* ptrCardDesktop1: NON stampare opacity:0!important sull'idle —
         restava inline e bloccava il vinile anche con .is-on (pull / F5). */
      var ptr = document.querySelector(".vc-ptr");
      if (!ptr) return;
      var active =
        ptr.classList.contains("is-on") ||
        ptr.classList.contains("is-armed") ||
        ptr.classList.contains("is-refreshing") ||
        !!window.__vcPtrTracking;
      if (sheetOpen && !active) {
        try {
          ptr.style.setProperty("opacity", "0", "important");
          ptr.style.setProperty("visibility", "hidden", "important");
          ptr.style.setProperty("pointer-events", "none", "important");
        } catch (eSt) {}
      } else {
        try {
          ptr.style.removeProperty("opacity");
          ptr.style.removeProperty("visibility");
          ptr.style.removeProperty("pointer-events");
        } catch (eClr) {}
      }
    } catch (ePtr) {}
  }

  function ensurePageTitle() {
    try {
      if (window.VcPageTitle || window.__VC_PAGE_TITLE_VER) return;
      var nodes = document.querySelectorAll("script[src]");
      for (var i = 0; i < nodes.length; i++) {
        var src = String(nodes[i].getAttribute("src") || "");
        if (src.indexOf("vc-page-title") >= 0) return;
      }
      var s = document.createElement("script");
      s.src = "/js/vc-page-title." + TITLE_VER + ".js?v=" + TITLE_VER;
      s.defer = true;
      (document.head || document.documentElement).appendChild(s);
    } catch (eTitle) {}
  }

  function apply(opts) {
    opts = opts || {};
    ensureBodyChrome();
    pinCssLast(!!opts.forceCss);
    forceBadgeCorner();
    forceEsciFlat();
    if (skipScrollCuePage()) killScrollCueDom();
    killStuckFloats();
    ensurePageTitle();
  }

  function armEsciWatch() {
    if (window.__vcEsciFlatWatch5) return;
    window.__vcEsciFlatWatch5 = 1;
    var reFlat = function () {
      try {
        forceEsciFlat();
        forceBadgeCorner();
      } catch (eA) {}
    };
    document.addEventListener(
      "click",
      function (ev) {
        try {
          var t = ev && ev.target;
          if (!t || !t.closest) return;
          if (t.closest("#vc-notif-dropdown, .vc-notif-summary, .vc-notif-panel, .vc-notif-ig-toast")) {
            return;
          }
          if (
            t.closest("#discord-account-btn") ||
            t.closest(".discord-account-btn") ||
            t.closest("#discord-account-popover") ||
            t.closest(".discord-account-popover")
          ) {
            setTimeout(reFlat, 0);
            setTimeout(reFlat, 120);
          }
        } catch (eClick) {}
      },
      true
    );
    setTimeout(reFlat, 900);
  }

  window.VcSiteChromeKit = {
    ver: VER,
    apply: apply,
    pinCssLast: pinCssLast,
    ensureBodyChrome: ensureBodyChrome,
    killScrollCueDom: killScrollCueDom,
    killStuckFloats: killStuckFloats,
    skipScrollCuePage: skipScrollCuePage,
  };

  apply({ forceCss: true });
  armEsciWatch();
  /* one-shot extra after body ready — NO MutationObserver */
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      function () {
        apply({ forceCss: false });
      },
      { once: true }
    );
  }
  try {
    window.addEventListener(
      "load",
      function () {
        forceBadgeCorner();
        killStuckFloats();
        if (skipScrollCuePage()) killScrollCueDom();
      },
      { once: true }
    );
  } catch (eLoad) {}
})();
