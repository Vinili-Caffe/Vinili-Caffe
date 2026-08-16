(function () {
  var CONSENT_KEY = "vc_cookie_banner_ack_v3";
  var CONSENT_COOKIE = "vc_cookie_banner_ack_v3";
  var DISCORD_ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var DISCORD_EXPIRES_AT_KEY = "vc_discord_expires_at";
  var FORBIDDEN_BOOKS_KEY = "vc_forbidden_section_books_v1";
  var FORBIDDEN_BOOKS_START_MS = new Date("2026-06-20T12:00:00").getTime();
  var FORBIDDEN_BOOKS_END_MS = new Date("2026-09-01T10:00:00").getTime();
  var FORBIDDEN_SITE_BOOKS_TOTAL = 8;
  var PAGE_REVEAL_SESSION_KEY = "vc_site_session_reveal_v1";

  try {
    if (sessionStorage.getItem(PAGE_REVEAL_SESSION_KEY)) {
      document.documentElement.classList.add("vc-skip-page-reveal");
    } else {
      sessionStorage.setItem(PAGE_REVEAL_SESSION_KEY, "1");
    }
  } catch (eReveal) {}

  function normalizeLegalPath(pathname) {
    var path = String(pathname || "/").replace(/\/+$/, "") || "/";
    path = path.replace(/\/index\.html$/i, "");
    return path || "/";
  }

  function isLegalCookiePage() {
    try {
      var path = normalizeLegalPath(window.location.pathname);
      return path === "/cookie" || path === "/privacy" || path === "/terms";
    } catch (e) {
      return false;
    }
  }

  function hasCookieConsent() {
    try {
      if (window.sessionStorage && window.sessionStorage.getItem(CONSENT_KEY) === "accepted") return true;
    } catch (e) {}
    try {
      if (window.localStorage && window.localStorage.getItem(CONSENT_KEY) === "accepted") return true;
    } catch (e) {}
    try {
      return document.cookie.split(";").some(function (part) {
        return part.trim().indexOf(CONSENT_COOKIE + "=accepted") === 0;
      });
    } catch (e) {
      return false;
    }
  }

  function cookieDomainSuffixForConsent() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      if (!h || h === "localhost" || h === "127.0.0.1" || h === "[::1]") return "";
      if (h.endsWith(".localhost")) return "";
      if (h === "viniliecaffe.it" || h.endsWith(".viniliecaffe.it")) return "; Domain=.viniliecaffe.it";
    } catch (e) {}
    return "";
  }

  function rememberCookieConsent() {
    try {
      if (window.localStorage) window.localStorage.setItem(CONSENT_KEY, "accepted");
    } catch (e) {}
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(CONSENT_KEY, "accepted");
    } catch (e) {}
    try {
      var maxAge = 60 * 60 * 24 * 180;
      var secure = String(window.location.protocol || "").toLowerCase() === "https:" ? "; Secure" : "";
      var domain = cookieDomainSuffixForConsent();
      document.cookie =
        CONSENT_COOKIE + "=accepted; Max-Age=" + maxAge + "; Path=/; SameSite=Lax" + secure + domain;
    } catch (e) {}
  }

  function closeCookieBanner(root) {
    if (!root) return;
    root.classList.add("vc-necessity-banner--leaving");
    window.setTimeout(function () {
      if (root && root.parentNode) root.parentNode.removeChild(root);
    }, 220);
  }

  /** Banner preferenze: id/class senza "cookie-consent" per evitare filtri cosmetic (uBlock/ecc.) che nascondono il nodo. */
  function initCookieConsent() {
    if (isLegalCookiePage()) return;
    if (hasCookieConsent()) return;
    if (document.getElementById("vc-necessity-banner")) return;
    if (document.getElementById("cookieyes")) return;
    if (!document.documentElement) return;
    function sanitizeLegalHref(raw) {
      var value = String(raw || "").trim();
      if (!value) return "";
      if (/^javascript:/i.test(value)) return "";
      if (value.startsWith("/")) return value;
      if (/^https?:\/\//i.test(value)) return value;
      return "";
    }
    function resolveCookiePolicyUrl() {
      var fromWindow = "";
      try {
        fromWindow = sanitizeLegalHref(window.__VC_COOKIE_POLICY_URL);
      } catch (e0) {}
      if (fromWindow) return fromWindow;
      var fromDom = "";
      try {
        var link = document.querySelector('a[href*="/cookie"], a[href*="cookie-policy"], a[href*="cookie"]');
        fromDom = sanitizeLegalHref(link && link.getAttribute("href"));
      } catch (e1) {}
      if (fromDom) return fromDom;
      return "/cookie/";
    }
    var cookiePolicyUrl = resolveCookiePolicyUrl();

    var root = document.createElement("section");
    root.id = "vc-necessity-banner";
    root.className = "vc-necessity-banner";
    root.setAttribute("aria-label", "Avviso utilizzo cookie");
    root.style.width = "fit-content";
    root.style.maxWidth = "calc(100vw - 1.5rem)";
    root.innerHTML =
      '<div class="vc-necessity-banner__pill" role="dialog" aria-modal="false" aria-labelledby="vc-necessity-text" style="display:inline-flex;width:auto;gap:0.65rem">' +
      '<p id="vc-necessity-text" class="vc-necessity-banner__text">' +
      'Questo sito utilizza <a class="vc-necessity-banner__policy" href="' + cookiePolicyUrl + '">cookie essenziali</a>' +
      "</p>" +
      '<button type="button" class="vc-necessity-banner__accept" data-vc-necessity-confirm>Accetta</button>' +
      "</div>";

    function dismissFromUserAction(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      rememberCookieConsent();
      closeCookieBanner(root);
    }
    var acceptEl = root.querySelector(".vc-necessity-banner__accept");
    if (acceptEl) acceptEl.addEventListener("click", dismissFromUserAction);

    (document.documentElement || document.body).appendChild(root);
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (!root.parentNode) return;
        root.classList.add("vc-necessity-banner--visible");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCookieConsent);
  } else {
    initCookieConsent();
  }
  window.addEventListener("pageshow", function () {
    if (hasCookieConsent()) return;
    if (document.getElementById("vc-necessity-banner")) return;
    initCookieConsent();
  });
})();
(function () {
  function normalizePrettyProfilePath() {
    try {
      if (window.__VC_DISABLE_PRETTY_PROFILE_REDIRECT === true) return false;
      var customizeMatch = String(window.location.pathname || "").match(/^\/user\/(\d{17,20})\/personalizza\/?$/);
      if (customizeMatch) {
        window.location.replace("/user/personalizza/?id=" + encodeURIComponent(customizeMatch[1]));
        return true;
      }
      var legacyCustomizeMatch = String(window.location.pathname || "").match(/^\/users\/(\d{17,20})\/customize\/?$/);
      if (legacyCustomizeMatch) {
        window.location.replace("/user/customize/?id=" + encodeURIComponent(legacyCustomizeMatch[1]));
        return true;
      }
      var m = String(window.location.pathname || "").match(/^\/users?\/(\d{17,20})\/?$/);
      if (!m) return false;
      var q = new URLSearchParams(window.location.search || "");
      if (String(q.get("id") || "").trim() === m[1] && /^\/user\/?$/.test(String(window.location.pathname || ""))) {
        return false;
      }
      window.location.replace("/user/?id=" + encodeURIComponent(m[1]));
      return true;
    } catch (e) {
      return false;
    }
  }

  if (normalizePrettyProfilePath()) return;

  function hideTransitionOverlay() {
    var ov = document.getElementById("vc-page-transition");
    if (ov) ov.classList.remove("vc-page-transition--on");
  }

  function afterOverlayPaint(fn) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(fn);
    });
  }

  function navigateToHref(href) {
    var u = String(href || "").trim();
    if (!u) return;
    try {
      window.location.href = u;
    } catch (e) {
      try {
        window.location.assign(u);
      } catch (e2) {}
    }
  }

  window.addEventListener("pageshow", function () {
    hideTransitionOverlay();
  });

  window.addEventListener("load", function () {
    hideTransitionOverlay();
  });

  function ensureTransitionOverlay() {
    var existing = document.getElementById("vc-page-transition");
    if (existing) return existing;
    var wrap = document.createElement("div");
    wrap.id = "vc-page-transition";
    wrap.className = "vc-page-transition";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<div class="vc-page-transition-content">' +
      '<div class="vc-page-transition-vote-iconwrap" aria-hidden="true">' +
      '<span class="vc-page-transition-vote-spark vc-page-transition-vote-spark--a"><i class="fa fa-star-o"></i></span>' +
      '<span class="vc-page-transition-vote-spark vc-page-transition-vote-spark--b"><i class="fa fa-star-o"></i></span>' +
      '<span class="vc-page-transition-vote-spark vc-page-transition-vote-spark--c"><i class="fa fa-star-o"></i></span>' +
      '<span class="vc-page-transition-vote-iconring"></span>' +
      '<span class="vc-page-transition-vote-icon"><i class="fa fa-certificate"></i></span>' +
      "</div>" +
      '<span class="vc-page-transition-spinner" aria-hidden="true"></span>' +
      '<p class="vc-page-transition-text">Caricamento...</p>' +
      '<p class="vc-page-transition-sub">Sto preparando la pagina...</p>' +
      '<span class="vc-page-transition-bar" aria-hidden="true"><span class="vc-page-transition-barfill"></span></span>' +
      "</div>";
    document.body.appendChild(wrap);
    return wrap;
  }

  function setTransitionOverlayContent(ov, kind) {
    if (!ov) return;
    var text = ov.querySelector(".vc-page-transition-text");
    var sub = ov.querySelector(".vc-page-transition-sub");
    ov.classList.toggle("vc-page-transition--vote", kind === "vote");
    ov.classList.toggle("vc-page-transition--login", kind === "login");
    if (text) text.textContent = kind === "vote" ? "Caricamento..." : "Caricamento...";
    if (sub) {
      sub.textContent =
        kind === "vote"
          ? "Preparazione del sistema di voto"
          : kind === "login"
            ? "Accesso in corso..."
            : "Sto preparando la pagina...";
    }
  }

  function showTransitionOverlay(kind) {
    var ov = ensureTransitionOverlay();
    if (!ov) return;
    setTransitionOverlayContent(ov, kind || "page");
    ov.classList.remove("vc-page-transition--on");
    void ov.offsetHeight;
    ov.classList.add("vc-page-transition--on");
  }

  try {
    window.vcShowPageTransition = showTransitionOverlay;
  } catch (e) {}

  function isVoteLoadingLink(a) {
    if (!a || !a.getAttribute) return false;
    return String(a.getAttribute("data-vc-loading") || "").toLowerCase() === "vote";
  }

  function initPageTransition() {
    hideTransitionOverlay();
    document.addEventListener("click", function (ev) {
      if (ev.defaultPrevented || ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      var t = ev.target;
      if (!t || !t.closest) return;
      var a = t.closest("a[href]");
      if (!a) return;
      if (isVoteLoadingLink(a)) {
        ev.preventDefault();
        var voteHref = a.href;
        showTransitionOverlay("vote");
        afterOverlayPaint(function () {
          window.setTimeout(function () {
            navigateToHref(voteHref);
          }, 180);
        });
        return;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPageTransition);
  } else {
    initPageTransition();
  }
})();
(function () {
  if (window.location.hash !== "#intro") return;
  if (window.history && window.history.replaceState) {
    window.history.replaceState(
      null,
      document.title,
      window.location.pathname + window.location.search,
    );
  }
})();
(function () {
  var btn = document.getElementById("vc-mobile-menu-btn");
  var nav = document.getElementById("mobile-nav");
  if (!btn || !nav) return;
  btn.addEventListener("click", function () {
    var open = nav.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener(
    "pointerdown",
    function (ev) {
      if (!nav.classList.contains("is-open")) return;
      if (typeof ev.button === "number" && ev.button !== 0) return;
      var t = ev.target;
      if (!t || !t.closest) return;
      if (btn.contains(t) || nav.contains(t)) return;
      nav.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    },
    true,
  );
})();
(function () {
  function normalizePathname(path) {
    var p = String(path || "/").trim() || "/";
    p = p.replace(/\\/g, "/");
    p = p.replace(/\/{2,}/g, "/");
    if (p.charAt(0) !== "/") p = "/" + p;
    p = p.replace(/\/index\.html$/i, "");
    if (p.length > 1) p = p.replace(/\/+$/, "");
    return p || "/";
  }

  function pathnameFromHref(href) {
    var raw = String(href || "").trim();
    if (!raw || raw.charAt(0) === "#") return "";
    try {
      var u = new URL(raw, window.location.href);
      if (u.origin !== window.location.origin) return "";
      return normalizePathname(u.pathname);
    } catch (e) {
      return "";
    }
  }

  function markSnavDetailsCurrentFromLocation() {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    var cur = normalizePathname(window.location.pathname);
    var isUserProfileDetail = false;
    try {
      if (/^\/users\/\d{17,20}$/.test(cur)) {
        isUserProfileDetail = true;
      } else if (cur === "/user") {
        var q = new URLSearchParams(window.location.search || "");
        isUserProfileDetail = /^\d{17,20}$/.test(String(q.get("id") || "").trim());
      }
    } catch (e0) {}
    var allRows = bar.querySelectorAll("a.vc-snav-row");
    var allItems = bar.querySelectorAll("a.vc-snav-item");
    allRows.forEach(function (a) {
      a.classList.remove("vc-snav-row--active");
      a.removeAttribute("aria-current");
    });
    allItems.forEach(function (a) {
      a.classList.remove("vc-snav-item--active");
      a.removeAttribute("aria-current");
    });
    bar.querySelectorAll("details.vc-snav-details").forEach(function (d) {
      d.classList.remove("vc-snav-details--current");
    });

    var itemHit = false;
    allItems.forEach(function (a) {
      var p = pathnameFromHref(a.getAttribute("href"));
      if (!p || p !== cur) return;
      itemHit = true;
      a.classList.add("vc-snav-item--active");
      a.setAttribute("aria-current", "page");
    });

    var rowHit = false;
    bar.querySelectorAll("details.vc-snav-details").forEach(function (det) {
      var hit = false;
      det.querySelectorAll("a.vc-snav-row").forEach(function (a) {
        var p = pathnameFromHref(a.getAttribute("href"));
        if (!p || p !== cur) return;
        if (isUserProfileDetail && p === "/user") return;
        hit = true;
        rowHit = true;
        a.classList.add("vc-snav-row--active");
        a.setAttribute("aria-current", "page");
      });
      if (hit) det.classList.add("vc-snav-details--current");
    });

  }

  function initHeaderNavAccordion() {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    var HEADER_MENU_SYNC_KEY = "vc_header_menu_sync_v1";
    var localWindowId = String(Date.now()) + "-" + String(Math.random()).slice(2);
    var detailsList = bar.querySelectorAll("details.vc-snav-details");
    var notif = bar.querySelector("details.vc-notif-dropdown");
    var accountMenuOpen = false;
    function closeLangMenu() {
      try {
        if (window.VcI18n && typeof window.VcI18n.closeLangMenu === "function") {
          window.VcI18n.closeLangMenu();
        }
      } catch (e) {}
    }
    function syncHeaderDropdownOpenClasses() {
      var root = document.documentElement;
      if (!root) return;
      var notifOpen = Boolean(notif && notif.open);
      root.classList.toggle("vc-notif-dropdown-open", notifOpen);
      root.classList.toggle("vc-header-account-open", accountMenuOpen);
    }
    function setAccountMenuOpen(on) {
      accountMenuOpen = Boolean(on);
      syncHeaderDropdownOpenClasses();
    }
    function broadcastHeaderMenuOpen(sourceId) {
      try {
        localStorage.setItem(
          HEADER_MENU_SYNC_KEY,
          JSON.stringify({
            t: Date.now(),
            src: localWindowId,
            id: String(sourceId || ""),
          }),
        );
      } catch (e) {}
    }
    detailsList.forEach(function (d) {
      d.addEventListener("toggle", function () {
        if (d.open) {
          broadcastHeaderMenuOpen(d.id || d.getAttribute("data-menu-id") || "snav");
          detailsList.forEach(function (other) {
            if (other !== d) other.open = false;
          });
          if (notif) notif.open = false;
          closeLangMenu();
        }
        syncHeaderDropdownOpenClasses();
      });
    });
    if (notif) {
      notif.addEventListener("toggle", function () {
        syncHeaderDropdownOpenClasses();
        if (!notif.open) return;
        broadcastHeaderMenuOpen(notif.id || "notif");
        detailsList.forEach(function (other) {
          other.open = false;
        });
        setAccountMenuOpen(false);
        try {
          var accBtn = bar.querySelector(".discord-profile-link");
          if (accBtn && document.activeElement === accBtn) accBtn.blur();
        } catch (eBlur) {}
        closeLangMenu();
      });
    }
    document.addEventListener("vc:langmenuopen", function () {
      detailsList.forEach(function (other) {
        other.open = false;
      });
      if (notif) notif.open = false;
      setAccountMenuOpen(false);
      syncHeaderDropdownOpenClasses();
    });
    // Account menu nasce dopo il login: delegation sul bar, non query una tantum.
    bar.addEventListener("pointerover", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var menu = t.closest(".discord-account-menu");
      if (!menu || !bar.contains(menu)) return;
      var related = ev.relatedTarget;
      if (related && menu.contains(related)) return;
      // Notifiche aperte con click: restano aperte (niente chiusura solo per hover sull’avatar).
      if (notif && notif.open) return;
      detailsList.forEach(function (other) {
        other.open = false;
      });
      closeLangMenu();
      setAccountMenuOpen(true);
    });
    bar.addEventListener("pointerout", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var menu = t.closest(".discord-account-menu");
      if (!menu || !bar.contains(menu)) return;
      var related = ev.relatedTarget;
      if (related && menu.contains(related)) return;
      setAccountMenuOpen(false);
    });
    bar.addEventListener("focusin", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (!t.closest(".discord-account-menu")) return;
      if (notif && notif.open) return;
      detailsList.forEach(function (other) {
        other.open = false;
      });
      closeLangMenu();
      setAccountMenuOpen(true);
    });
    bar.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (!t.closest(".discord-account-menu")) return;
      if (!(notif && notif.open)) return;
      notif.open = false;
      detailsList.forEach(function (other) {
        other.open = false;
      });
      closeLangMenu();
      setAccountMenuOpen(true);
      syncHeaderDropdownOpenClasses();
    });
    bar.addEventListener("focusout", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var menu = t.closest(".discord-account-menu");
      if (!menu) return;
      var next = ev.relatedTarget;
      if (next && menu.contains(next)) return;
      setAccountMenuOpen(false);
    });
    function pointInside(el, ev) {
      if (!el || typeof ev.clientX !== "number" || typeof ev.clientY !== "number") return false;
      try {
        var r = el.getBoundingClientRect();
        return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      } catch (e) {
        return false;
      }
    }
    function eventInsideOpenDropdown(openEl, ev) {
      if (!openEl) return false;
      var t = ev.target;
      if (t && openEl.contains(t)) return true;
      return pointInside(openEl, ev);
    }
    function closeAllHeaderDropdowns() {
      detailsList.forEach(function (d) {
        d.open = false;
      });
      var liveNotif = document.getElementById("vc-notif-dropdown") || notif;
      if (liveNotif) liveNotif.open = false;
      closeLangMenu();
      syncHeaderDropdownOpenClasses();
    }
    document.addEventListener(
      "pointerdown",
      function (ev) {
        if (typeof ev.button === "number" && ev.button !== 0) return;
        var t = ev.target;
        if (!t || !t.closest) return;
        var opens = Array.prototype.slice.call(
          bar.querySelectorAll("details.vc-snav-details[open]"),
        );
        // Dopo il portal mobile lo sheet è su <body>, non più dentro la bar.
        var liveNotif = document.getElementById("vc-notif-dropdown");
        if (liveNotif && liveNotif.open) opens.push(liveNotif);
        if (!opens.length) return;
        for (var i = 0; i < opens.length; i++) {
          if (eventInsideOpenDropdown(opens[i], ev)) return;
        }
        // Tap sulla summary della campanella: lascia aprire/chiudere al <details>.
        if (t.closest && t.closest("summary.vc-notif-summary, .vc-notif-summary")) return;
        closeAllHeaderDropdowns();
      },
      true,
    );
    window.addEventListener("storage", function (ev) {
      if (!ev || ev.key !== HEADER_MENU_SYNC_KEY || !ev.newValue) return;
      var payload = null;
      try {
        payload = JSON.parse(ev.newValue);
      } catch (e) {
        payload = null;
      }
      if (!payload || payload.src === localWindowId) return;
      closeAllHeaderDropdowns();
    });
    syncHeaderDropdownOpenClasses();
    markSnavDetailsCurrentFromLocation();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeaderNavAccordion);
  } else {
    initHeaderNavAccordion();
  }
})();
(function () {
  /** Stesso path del glyph footer (build-site.mjs `tiktokGlyphSvg`), fill via currentColor. */
  var TIKTOK_PREVIEW_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43V7.36a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.21z"/></svg>';
  var DISCORD_PREVIEW_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.946 2.419-2.157 2.419z"/></svg>';

  function siteDisplayNameForPreview() {
    try {
      var w = document.querySelector(".vc-premium-footer__wordmark");
      var t = w && w.textContent ? String(w.textContent).trim() : "";
      if (t) return t;
    } catch (e) {}
    return "Vinili & Caffè";
  }

  function discordInvitePathNorm(cleanPath) {
    return String(cleanPath || "").trim().toLowerCase();
  }

  function isSiteDiscordInvite(cleanPath) {
    var path = discordInvitePathNorm(cleanPath);
    if (!path) return false;
    if (path.indexOf("viniliecaffe") !== -1) return true;
    var siteInvite = "";
    try {
      var live = window.__VC_LIVE;
      if (live && live.inviteCode) siteInvite = String(live.inviteCode).trim().toLowerCase();
    } catch (e) {}
    return Boolean(siteInvite && (path === siteInvite || path.indexOf(siteInvite + "-") === 0));
  }

  function discordPreviewSubtitle(anchor, cleanPath) {
    var custom = anchor && anchor.getAttribute("data-vc-preview-subtitle");
    if (custom && String(custom).trim()) return String(custom).trim();
    var sponsorCfg = typeof window !== "undefined" ? window.__VC_SITE_SPONSOR_AD : null;
    if (sponsorCfg && sponsorCfg.buttonUrl) {
      try {
        var sponsorUrl = new URL(String(sponsorCfg.buttonUrl), window.location.href);
        var sponsorPath = String(sponsorUrl.pathname || "").replace(/^\/+/, "");
        if (discordInvitePathNorm(sponsorPath) === discordInvitePathNorm(cleanPath)) {
          var sponsorTitle = String(sponsorCfg.title || "").trim();
          if (sponsorTitle) return "Entra su " + sponsorTitle;
        }
      } catch (e) {}
    }
    if (isSiteDiscordInvite(cleanPath)) return "Entra su " + siteDisplayNameForPreview();
    return "Server Discord";
  }

  function socialPreviewHandleFromCleanPath(cleanPath) {
    var seg = String(cleanPath || "").split("/")[0] || "";
    if (!seg) return "";
    return seg.charAt(0) === "@" ? seg : "@" + seg;
  }

  function buildSocialPreviewMeta(anchor) {
    var href = String((anchor && anchor.getAttribute("href")) || "").trim();
    if (!href) return null;
    var u;
    try {
      u = new URL(href, window.location.href);
    } catch (e) {
      return null;
    }
    var host = String(u.hostname || "").toLowerCase();
    var path = String(u.pathname || "/");
    var cleanPath = path.replace(/^\/+/, "").replace(/\/+$/, "");
    var handle = socialPreviewHandleFromCleanPath(cleanPath);
    if (host.indexOf("instagram.com") !== -1) {
      return {
        iconClass: "fa fa-instagram",
        title: "Instagram",
        subtitle: handle || "Profilo social",
        urlText: "instagram.com/" + (cleanPath || ""),
      };
    }
    if (host.indexOf("tiktok.com") !== -1) {
      return {
        iconHtml: TIKTOK_PREVIEW_SVG,
        icoExtraClass: "vc-social-preview__ico--tiktok",
        title: "TikTok",
        subtitle: handle || "Profilo social",
        urlText: "tiktok.com/" + (cleanPath || ""),
      };
    }
    if (host === "discord.gg" || host.indexOf("discord.com") !== -1) {
      return {
        iconHtml: DISCORD_PREVIEW_SVG,
        icoExtraClass: "vc-social-preview__ico--discord",
        title: "Discord",
        subtitle: discordPreviewSubtitle(anchor, cleanPath),
        urlText: host + "/" + (cleanPath || ""),
      };
    }
    return null;
  }

  function ensurePreviewNode() {
    var n = document.getElementById("vc-social-preview");
    if (n) return n;
    n = document.createElement("div");
    n.id = "vc-social-preview";
    n.className = "vc-social-preview";
    n.setAttribute("aria-hidden", "true");
    document.body.appendChild(n);
    return n;
  }

  function placePreview(preview, anchor) {
    if (!preview || !anchor || !anchor.getBoundingClientRect) return;
    var rect = anchor.getBoundingClientRect();
    var pw = preview.offsetWidth || 220;
    var ph = preview.offsetHeight || 96;
    var left = rect.left + rect.width / 2 - pw / 2;
    var top = rect.top - ph - 12;
    var maxLeft = window.innerWidth - pw - 10;
    if (left < 10) left = 10;
    if (left > maxLeft) left = maxLeft;
    if (top < 10) top = rect.bottom + 12;
    preview.style.left = Math.round(left) + "px";
    preview.style.top = Math.round(top) + "px";
  }

  function showPreview(anchor) {
    var meta = buildSocialPreviewMeta(anchor);
    if (!meta) return;
    var preview = ensurePreviewNode();
    var icoClass = "vc-social-preview__ico";
    if (meta.icoExtraClass) icoClass += " " + meta.icoExtraClass;
    var icoInner =
      meta.iconHtml && String(meta.iconHtml).trim()
        ? String(meta.iconHtml)
        : '<i class="' + String(meta.iconClass || "") + '" aria-hidden="true"></i>';
    preview.innerHTML =
      '<div class="vc-social-preview__head">' +
      '<span class="' + icoClass + '">' + icoInner + "</span>" +
      '<div class="vc-social-preview__copy">' +
      '<strong class="vc-social-preview__title">' + meta.title + "</strong>" +
      '<span class="vc-social-preview__sub">' + meta.subtitle + "</span>" +
      "</div>" +
      "</div>" +
      '<p class="vc-social-preview__url">' + meta.urlText + "</p>";
    preview.classList.add("is-visible");
    preview.setAttribute("aria-hidden", "false");
    placePreview(preview, anchor);
  }

  function hidePreview() {
    var preview = document.getElementById("vc-social-preview");
    if (!preview) return;
    preview.classList.remove("is-visible");
    preview.setAttribute("aria-hidden", "true");
  }

  function bindSocialPreview(anchor) {
    if (!anchor || anchor.__vcSocialPreviewBound) return;
    anchor.__vcSocialPreviewBound = true;
    anchor.addEventListener("mouseenter", function () {
      if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;
      showPreview(anchor);
    });
    anchor.addEventListener("mouseleave", hidePreview);
    anchor.addEventListener("focus", function () {
      showPreview(anchor);
    });
    anchor.addEventListener("blur", hidePreview);
  }

  window.__vcBindSocialPreview = bindSocialPreview;

  function initSocialPreviews() {
    var links = document.querySelectorAll(
      'a[href*="instagram.com"], a[href*="tiktok.com"], a[href*="discord.gg"], a[href*="discord.com/invite"]',
    );
    for (var i = 0; i < links.length; i += 1) {
      bindSocialPreview(links[i]);
    }
    window.addEventListener("scroll", hidePreview, { passive: true });
    window.addEventListener("resize", hidePreview, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSocialPreviews);
  } else {
    initSocialPreviews();
  }
})();
(function () {
  function initHeaderScrollState() {
    var navShell = document.querySelector("header .vc-nav-shell.vc-glass");
    if (!navShell) return;
    var ticking = false;

    function applyScrollState() {
      ticking = false;
      navShell.classList.toggle("vc-nav-shell--scrolled", window.scrollY > 16);
    }

    applyScrollState();
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(applyScrollState);
      },
      { passive: true },
    );
    window.addEventListener("resize", applyScrollState, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeaderScrollState);
  } else {
    initHeaderScrollState();
  }
})();
(function () {
  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function formatIntIt(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try {
      return Math.round(x).toLocaleString("it-IT");
    } catch (e) {
      return String(Math.round(x));
    }
  }

  function normalizeValue(raw, kind) {
    var n = Number(raw);
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (kind === "hours") return n / 3600;
    return n;
  }

  function formatMult(m) {
    var x = Number(m);
    if (!Number.isFinite(x) || x <= 0) return "x1";
    if (Math.abs(x - Math.round(x)) < 0.02) return "x" + String(Math.round(x));
    return "x" + String(x.toFixed(1)).replace(".", ",");
  }

  function formatValue(raw, kind) {
    var n = Number(raw);
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (kind === "hours") return String(n.toFixed(1)).replace(".", ",") + "h";
    if (kind === "percent") return String(Math.round(n)) + "%";
    if (kind === "plain") return String(Math.round(n));
    if (kind === "mult") return formatMult(n);
    return formatIntIt(n);
  }

  function readKind(node) {
    return String(node.getAttribute("data-vc-count-kind") || "int");
  }

  function readTarget(node) {
    return normalizeValue(node.getAttribute("data-vc-count-value"), readKind(node));
  }

  function readDuration(node) {
    var ms = Number(node.getAttribute("data-vc-count-duration"));
    if (!Number.isFinite(ms) || ms <= 0) return 900;
    return ms;
  }

  function canRepeat(node) {
    return String(node.getAttribute("data-vc-count-repeat") || "true").toLowerCase() !== "false";
  }

  function stopAnimation(node) {
    if (node && node._vcCountRaf) {
      cancelAnimationFrame(node._vcCountRaf);
      node._vcCountRaf = null;
    }
  }

  function animateNode(node, from, to, kind, durationMs) {
    if (!node) return;
    stopAnimation(node);
    if (prefersReducedMotion()) {
      node.textContent = formatValue(to, kind);
      node.setAttribute("data-vc-count-current", String(to));
      return;
    }
    if (Math.abs(from - to) < 0.001) {
      node.textContent = formatValue(to, kind);
      node.setAttribute("data-vc-count-current", String(to));
      return;
    }
    var start = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - start) / durationMs);
      var eased = easeOutQuart(t);
      var current = from + (to - from) * eased;
      node.textContent = formatValue(current, kind);
      if (t < 1) {
        node._vcCountRaf = requestAnimationFrame(frame);
      } else {
        node.textContent = formatValue(to, kind);
        node.setAttribute("data-vc-count-current", String(to));
        node._vcCountRaf = null;
      }
    }
    node._vcCountRaf = requestAnimationFrame(frame);
  }

  function resetNode(node) {
    if (!node || !canRepeat(node)) return;
    stopAnimation(node);
    var kind = readKind(node);
    node.textContent = formatValue(0, kind);
    node.setAttribute("data-vc-count-current", "0");
    node.setAttribute("data-vc-count-visible", "false");
  }

  function playNode(node) {
    if (!node) return;
    var kind = readKind(node);
    var to = readTarget(node);
    node.setAttribute("data-vc-count-visible", "true");
    var fromRaw = node.getAttribute("data-vc-count-current");
    var from = normalizeValue(fromRaw, kind);
    if (!Number.isFinite(from)) from = 0;
    animateNode(node, from, to, kind, readDuration(node));
  }

  function createObserver() {
    if (typeof IntersectionObserver === "undefined") return null;
    return new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i += 1) {
          var entry = entries[i];
          if (!entry.isIntersecting || entry.intersectionRatio < 0.35) {
            resetNode(entry.target);
            continue;
          }
          playNode(entry.target);
        }
      },
      {
        root: null,
        rootMargin: "0px 0px -8% 0px",
        threshold: [0, 0.12, 0.2, 0.35, 0.5, 0.75, 1],
      },
    );
  }

  var observer = createObserver();

  function registerNode(node) {
    if (!node) return;
    if (!observer) {
      playNode(node);
      return;
    }
    observer.observe(node);
  }

  function refresh(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll("[data-vc-countup]");
    for (var i = 0; i < nodes.length; i += 1) {
      registerNode(nodes[i]);
    }
  }

  function set(node, rawValue, kind) {
    if (!node) return;
    node.setAttribute("data-vc-countup", "true");
    node.setAttribute("data-vc-count-value", String(Number(rawValue) || 0));
    if (kind) node.setAttribute("data-vc-count-kind", String(kind));
    registerNode(node);
    if (!observer) {
      playNode(node);
      return;
    }
    var rect = node.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var visible = rect.bottom > 0 && rect.top < vh * 0.92;
    if (visible) playNode(node);
    else resetNode(node);
  }

  window.VCCountUp = {
    refresh: refresh,
    set: set,
    reset: resetNode,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      refresh(document);
    });
  } else {
    refresh(document);
  }
})();
(function () {
  var STORAGE_PREFIX = "vc_notifications_v1:";
  var DISMISSED_PREFIX = "vc_notifications_dismissed_v1:";
  var NOTIF_SYNC_KEY = "vc_notifications_sync_v1";
  var PENDING_READ_PREFIX = "vc_notifications_pending_read_v1:";
  var CLICK_READ_KEY = "vc_notifications_click_read_v1";
  var SW_PENDING_READ_CACHE = "vc-notif-pending-read-v1";
  var SW_PENDING_READ_URL = "/__vc/pending-notif-read";
  var PENDING_LOGIN_NOTIF_KEY = "vc_pending_login_notification_v1";
  var NOTIFICATIONS_PATH = "/notifications/";
  var DEMO_ID = "__vc_ephemeral_demo__";
  var ephemeralDemo = null;
  var currentUserId = "";
  var siteNotifsTimer = null;
  var siteRealtimeWs = null;
  var siteRealtimeWsReconnectTimer = null;
  var SITE_NOTIFS_POLL_MS = 15000;
  var SITE_NOTIFS_POLL_HIDDEN_MS = 60000;
  var siteNotifsVisibilityTimer = null;
  var notifPeerSyncTimer = null;
  var notifSyncBc = null;
  var lastNotifRenderSig = "";
  var ignoreSelfNotifSync = 0;
  try {
    notifSyncBc = new BroadcastChannel("vc_notifications_sync_v1");
  } catch (eBc) {
    notifSyncBc = null;
  }
  /** Tempo in cui il pop resta leggibile sotto la campanella. */
  var NOTIF_FLY_READ_MS = 3400;
  /** Durata animazione di uscita (ms); match .vc-notif-fly-card--out. */
  var NOTIF_FLY_ANIM_MS = 280;
  var notifFlyActiveCount = 0;
  var notifAudioCtx = null;
  var notifAudioUnlocked = false;
  var DISCORD_ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var baseDocumentTitle = "";
  var lastTabUnreadShown = -1;
  var baseFaviconHref = "";
  var faviconBadgeGen = 0;
  var faviconLinkEl = null;
  try {
    if (new URLSearchParams(window.location.search).get("notif") === "demo") {
      ephemeralDemo = {
        id: DEMO_ID,
        title: "Voto registrato!",
        body: "Il tuo voto è stato registrato con successo.",
        at: Date.now() - 3 * 60 * 60 * 1000,
        read: false,
        kind: "vote",
      };
    }
  } catch (e) {}
  function captureBaseDocumentTitle() {
    var raw = String(document.title || "").trim();
    var cleaned = raw.replace(/^\(\d+\+?\)\s+/, "").trim();
    if (!baseDocumentTitle) {
      baseDocumentTitle = cleaned || raw || "Vinili & Caffè";
      return;
    }
    // Se la pagina ha cambiato titolo (navigazione SPA / i18n), aggiorna la base.
    if (cleaned && cleaned !== baseDocumentTitle && !/^\(\d+\+?\)\s+/.test(raw)) {
      baseDocumentTitle = cleaned;
    }
  }

  function resolveFaviconLink() {
    if (faviconLinkEl && faviconLinkEl.isConnected) return faviconLinkEl;
    faviconLinkEl =
      document.querySelector('link[rel="icon"]') ||
      document.querySelector('link[rel="shortcut icon"]');
    if (!faviconLinkEl) {
      faviconLinkEl = document.createElement("link");
      faviconLinkEl.rel = "icon";
      document.head.appendChild(faviconLinkEl);
    }
    if (!baseFaviconHref) {
      baseFaviconHref = String(faviconLinkEl.href || faviconLinkEl.getAttribute("href") || "").trim();
    }
    return faviconLinkEl;
  }

  function drawFaviconBadgeOnCanvas(ctx, size, unread) {
    var label = unread > 99 ? "99+" : String(unread);
    var r = size * 0.22;
    var cx = size - r - size * 0.06;
    var cy = size - r - size * 0.06;
    ctx.beginPath();
    ctx.arc(cx, cy, r + size * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20, 12, 8, 0.92)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#e11d48";
    ctx.fill();
    ctx.fillStyle = "#fff7ed";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font =
      "700 " +
      Math.max(10, Math.floor(size * (label.length > 2 ? 0.28 : 0.34))) +
      "px system-ui,Segoe UI,sans-serif";
    ctx.fillText(label, cx, cy + size * 0.02);
  }

  function paintPlainFaviconBadge(unread) {
    var size = 64;
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#1a120e";
    ctx.fillRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = "#0b0908";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#d4a888";
    ctx.fill();
    drawFaviconBadgeOnCanvas(ctx, size, unread);
    try {
      return canvas.toDataURL("image/png");
    } catch (e) {
      return "";
    }
  }

  function updateFaviconBadge(unread) {
    var link = resolveFaviconLink();
    var n = Math.max(0, Math.floor(Number(unread) || 0));
    var gen = ++faviconBadgeGen;
    if (n <= 0) {
      if (baseFaviconHref) link.href = baseFaviconHref;
      return;
    }
    var size = 64;
    var applyDataUrl = function (dataUrl) {
      if (gen !== faviconBadgeGen || !dataUrl) return;
      link.href = dataUrl;
    };
    if (!baseFaviconHref) {
      applyDataUrl(paintPlainFaviconBadge(n));
      return;
    }
    var img = new Image();
    img.decoding = "async";
    try {
      img.crossOrigin = "anonymous";
    } catch (eCo) {}
    img.onload = function () {
      if (gen !== faviconBadgeGen) return;
      try {
        var canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          applyDataUrl(paintPlainFaviconBadge(n));
          return;
        }
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        drawFaviconBadgeOnCanvas(ctx, size, n);
        applyDataUrl(canvas.toDataURL("image/png"));
      } catch (eDraw) {
        applyDataUrl(paintPlainFaviconBadge(n));
      }
    };
    img.onerror = function () {
      applyDataUrl(paintPlainFaviconBadge(n));
    };
    img.src = baseFaviconHref;
  }

  function syncBrowserTabNotifBadge(unread) {
    var n = Math.max(0, Math.floor(Number(unread) || 0));
    captureBaseDocumentTitle();
    if (n === lastTabUnreadShown) {
      // Titolo potrebbe essere stato resettato da altro script: ripristina se serve.
      var want =
        n > 0
          ? "(" + (n > 99 ? "99+" : String(n)) + ") " + baseDocumentTitle
          : baseDocumentTitle;
      if (String(document.title || "") !== want) document.title = want;
      return;
    }
    lastTabUnreadShown = n;
    if (n > 0) {
      document.title = "(" + (n > 99 ? "99+" : String(n)) + ") " + baseDocumentTitle;
    } else {
      document.title = baseDocumentTitle;
    }
    updateFaviconBadge(n);
  }

  function normalizeUserId(value) {
    var id = String(value || "").trim();
    return /^\d{17,20}$/.test(id) ? id : "";
  }
  function userStorageKey(userId) {
    var id = normalizeUserId(userId || currentUserId);
    return id ? STORAGE_PREFIX + id : "";
  }
  function userDismissedKey(userId) {
    var id = normalizeUserId(userId || currentUserId);
    return id ? DISMISSED_PREFIX + id : "";
  }
  function setCurrentUser(user) {
    currentUserId = normalizeUserId(user && user.id);
  }
  function loadDismissedSet(userId) {
    var key = userDismissedKey(userId);
    if (!key) return new Set();
    try {
      var raw = localStorage.getItem(key);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return new Set();
      return new Set(
        arr
          .map(function (x) {
            return String(x || "").trim();
          })
          .filter(Boolean),
      );
    } catch (e) {
      return new Set();
    }
  }
  function notifyNotifStorePeers() {
    try {
      localStorage.setItem(NOTIF_SYNC_KEY, String(Date.now()) + ":" + Math.random().toString(36).slice(2, 8));
    } catch (ePing) {}
    try {
      if (notifSyncBc) notifSyncBc.postMessage({ t: Date.now() });
    } catch (eBcPost) {}
    ignoreSelfNotifSync += 1;
    try {
      window.dispatchEvent(new CustomEvent("vc:notifications-sync"));
    } catch (eEv) {
    } finally {
      ignoreSelfNotifSync -= 1;
    }
  }
  function onNotifStorePeerSync() {
    if (ignoreSelfNotifSync > 0) return;
    lastNotifRenderSig = "";
    render({ force: true });
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    if (notifPeerSyncTimer) clearTimeout(notifPeerSyncTimer);
    notifPeerSyncTimer = setTimeout(function () {
      notifPeerSyncTimer = null;
      syncSiteNotificationsFromServer();
    }, 250);
  }
  function isNotifStorageSyncKey(key) {
    var k = String(key || "");
    if (!k) return false;
    if (k === NOTIF_SYNC_KEY) return true;
    if (k.indexOf(STORAGE_PREFIX) === 0) return true;
    if (k.indexOf(DISMISSED_PREFIX) === 0) return true;
    return false;
  }
  function saveDismissedSet(setLike, userId) {
    var key = userDismissedKey(userId);
    if (!key) return;
    var arr = Array.from(setLike || []).filter(Boolean);
    if (arr.length > 500) arr = arr.slice(arr.length - 500);
    var next = JSON.stringify(arr);
    try {
      if (localStorage.getItem(key) === next) return;
      localStorage.setItem(key, next);
      notifyNotifStorePeers();
    } catch (e) {}
  }
  function markDismissed(id, userId) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var set = loadDismissedSet(userId);
    set.add(sid);
    saveDismissedSet(set, userId);
  }
  function rememberDismissedNotif(item, userId) {
    if (!item) return;
    var uid = normalizeUserId(userId || currentUserId);
    var lid = String((item && item.id) || "").trim();
    if (!lid) return;
    var set = loadDismissedSet(uid);
    set.add(lid);
    if (!isServerBackedNotifId(lid)) {
      var fpId = buildNotifFingerprintId(item, uid, String((item && item.kind) || "info"), String((item && item.openUrl) || ""));
      if (fpId && fpId !== lid) set.add(fpId);
    }
    saveDismissedSet(set, uid);
  }
  function isNotifDismissed(item, uid, dismissed) {
    if (!item) return true;
    var set = dismissed || loadDismissedSet(uid);
    var lid = String((item && item.id) || "").trim();
    if (isServerBackedNotifId(lid)) return false;
    if (lid && set.has(lid)) return true;
    var fpId = buildNotifFingerprintId(item, uid, String((item && item.kind) || "info"), String((item && item.openUrl) || ""));
    return Boolean(fpId && set.has(fpId));
  }
  function hashText(input) {
    var s = String(input || "");
    var h = 5381;
    for (var i = 0; i < s.length; i += 1) {
      h = ((h << 5) + h) + s.charCodeAt(i);
      h = h >>> 0;
    }
    return h.toString(36);
  }
  function buildStableNotifId(payload, ownerId, kind, openUrl) {
    var explicit = payload && payload.id != null ? String(payload.id).trim() : "";
    if (explicit) return explicit;
    var title = String((payload && payload.title) || "").trim();
    var body = String((payload && payload.body) || "").trim();
    var atRaw = payload && payload.at;
    var at = Number.isFinite(Number(atRaw)) ? String(Math.floor(Number(atRaw))) : "";
    return "auto:" + hashText([ownerId, kind, title, body, String(openUrl || ""), at].join("|"));
  }
  function buildNotifFingerprintId(payload, ownerId, kind, openUrl) {
    var p = payload && typeof payload === "object" ? Object.assign({}, payload) : {};
    delete p.id;
    delete p.read;
    delete p.readAt;
    return buildStableNotifId(p, ownerId, kind, openUrl);
  }
  function isAutoClientNotifId(id) {
    return String(id || "").indexOf("auto:") === 0;
  }
  function isServerBackedNotifId(id) {
    return /^[a-f0-9]{24}$/i.test(String(id || "").trim());
  }
  function sameNotifCore(a, b) {
    if (!a || !b) return false;
    return (
      String((a && a.title) || "").trim() === String((b && b.title) || "").trim() &&
      String((a && a.body) || "").trim() === String((b && b.body) || "").trim() &&
      String((a && a.kind) || "").trim() === String((b && b.kind) || "").trim() &&
      String((a && a.openUrl) || "").trim() === String((b && b.openUrl) || "").trim()
    );
  }
  function pendingReadKey() {
    var uid = normalizeUserId(currentUserId);
    return uid ? PENDING_READ_PREFIX + uid : "";
  }
  function loadPendingReadMap() {
    var key = pendingReadKey();
    if (!key) return {};
    try {
      var raw = sessionStorage.getItem(key);
      var arr = raw ? JSON.parse(raw) : [];
      var map = {};
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i += 1) {
          var id = String(arr[i] || "").trim();
          if (id) map[id] = true;
        }
      }
      return map;
    } catch (e) {
      return {};
    }
  }
  function savePendingReadMap(map) {
    var key = pendingReadKey();
    if (!key) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(Object.keys(map || {})));
    } catch (e) {}
  }
  function isPendingRead(id) {
    var sid = String(id || "").trim();
    return Boolean(sid && loadPendingReadMap()[sid]);
  }
  function rememberPendingRead(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var map = loadPendingReadMap();
    map[sid] = true;
    savePendingReadMap(map);
  }
  function loadClickReadIds() {
    try {
      var arr = JSON.parse(sessionStorage.getItem(CLICK_READ_KEY) || "[]");
      return Array.isArray(arr)
        ? arr
            .map(function (x) {
              return String(x || "").trim();
            })
            .filter(Boolean)
        : [];
    } catch (e) {
      return [];
    }
  }
  function rememberClickRead(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var arr = loadClickReadIds();
    if (arr.indexOf(sid) === -1) arr.push(sid);
    try {
      sessionStorage.setItem(CLICK_READ_KEY, JSON.stringify(arr));
    } catch (e) {}
    rememberPendingRead(sid);
  }
  function clearClickReadIds() {
    try {
      sessionStorage.removeItem(CLICK_READ_KEY);
    } catch (e) {}
  }
  function tryFlushClickReads() {
    var ids = loadClickReadIds();
    if (!ids.length) return;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    for (var i = 0; i < ids.length; i += 1) markOneRead(ids[i]);
    clearClickReadIds();
  }
  function consumePendingReadFromSwCache() {
    if (!("caches" in window)) return Promise.resolve();
    return caches
      .open(SW_PENDING_READ_CACHE)
      .then(function (cache) {
        return cache.match(SW_PENDING_READ_URL).then(function (res) {
          if (!res) return;
          return res.json().then(function (data) {
            var ids = Array.isArray(data && data.ids) ? data.ids : [];
            for (var i = 0; i < ids.length; i += 1) rememberClickRead(ids[i]);
            return cache.delete(SW_PENDING_READ_URL);
          });
        });
      })
      .catch(function () {})
      .then(function () {
        tryFlushClickReads();
      });
  }
  function isWatchingTicketChat(ticketId, openUrl) {
    var tid = String(ticketId || "").trim().toLowerCase();
    if (!tid) {
      try {
        var u = new URL(String(openUrl || ""), window.location.origin);
        tid = String(u.hash || "").replace(/^#/, "").toLowerCase();
      } catch (e0) {
        tid = "";
      }
    }
    if (!/^[a-f0-9]{24}$/i.test(tid)) return false;
    if (document.visibilityState !== "visible") return false;
    try {
      if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    } catch (eFocus) {}
    try {
      var watching = window.__VC_WATCHING_TICKET;
      if (watching && String(watching.id || "").toLowerCase() === tid) return true;
    } catch (e1) {}
    try {
      var path = String(window.location.pathname || "");
      if (path.indexOf("/tickets") === -1) return false;
      var hash = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
      return hash === tid;
    } catch (e2) {
      return false;
    }
  }
  function forgetPendingRead(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var map = loadPendingReadMap();
    if (!map[sid]) return;
    delete map[sid];
    savePendingReadMap(map);
  }
  function flushPendingReadsToServer() {
    var map = loadPendingReadMap();
    var ids = Object.keys(map);
    for (var fi = 0; fi < ids.length; fi += 1) {
      (function (id) {
        markSiteNotificationReadOnServer(id).then(function (ok) {
          if (ok) forgetPendingRead(id);
        });
      })(ids[fi]);
    }
  }
  function applyPendingReads(items) {
    var map = loadPendingReadMap();
    var keys = Object.keys(map);
    if (!keys.length) return Array.isArray(items) ? items : [];
    return (Array.isArray(items) ? items : []).map(function (x) {
      var id = String((x && x.id) || "").trim();
      if (id && map[id] && !x.read) return Object.assign({}, x, { read: true });
      return x;
    });
  }
  function loadStored() {
    var key = userStorageKey();
    if (!key) return [];
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return applyPendingReads(sortNotifItems(Array.isArray(arr) ? arr : []));
    } catch (e) {
      return [];
    }
  }
  function notifTime(item) {
    var n = Number(item && item.at);
    return Number.isFinite(n) ? n : 0;
  }
  function sortNotifItems(items) {
    return (Array.isArray(items) ? items.slice() : []).sort(function (a, b) {
      var dt = notifTime(b) - notifTime(a);
      if (dt !== 0) return dt;
      return String(b && b.id || "").localeCompare(String(a && a.id || ""));
    });
  }
  function saveStored(items) {
    var key = userStorageKey();
    if (!key) return;
    var next = JSON.stringify(sortNotifItems(items));
    try {
      if (localStorage.getItem(key) === next) return;
      localStorage.setItem(key, next);
      notifyNotifStorePeers();
    } catch (e) {}
  }
  function rows() {
    var s = loadStored();
    return ephemeralDemo ? [ephemeralDemo].concat(s) : s;
  }
  function iconClass(kind) {
    if (kind === "vote") return "fa-trophy";
    if (kind === "vote_reminder") return "fa-clock-o";
    if (kind === "success") return "fa-check-circle";
    if (kind === "review") return "fa-star";
    if (kind === "mod") return "fa-shield";
    if (kind === "suggestion") return "fa-magic";
    if (kind === "web_ticket" || kind === "web_ticket_mention") return "fa-ticket";
    return "fa-bell-o";
  }
  function notificationsPageUrl() {
    try {
      return new URL(NOTIFICATIONS_PATH, window.location.origin).toString();
    } catch (e) {
      return NOTIFICATIONS_PATH;
    }
  }

  function buildNotifStoreSignature(items) {
    var parts = [];
    for (var si = 0; si < items.length; si += 1) {
      var n = items[si];
      if (!n) continue;
      parts.push(
        String(n.id || "") +
          "\x1e" +
          (n.read ? "1" : "0") +
          "\x1e" +
          String(n.at || 0) +
          "\x1e" +
          String(n.kind || "") +
          "\x1e" +
          String(n.title || "") +
          "\x1e" +
          String(n.body || "") +
          "\x1e" +
          String(n.openUrl || ""),
      );
    }
    return parts.join("\x1f");
  }

  function timeAgoLocalized(atMs) {
    function nt(key, vars, fallback) {
      try {
        if (window.VcI18n && typeof window.VcI18n.t === "function") {
          var v = window.VcI18n.t(key, vars);
          if (v && v !== key) return v;
        }
      } catch (e) {}
      var out = fallback != null ? fallback : key;
      if (vars && typeof out === "string") {
        out = out.replace(/\{(\w+)\}/g, function (_, k) {
          return vars[k] != null ? String(vars[k]) : "{" + k + "}";
        });
      }
      return out;
    }
    var s = Math.floor((Date.now() - atMs) / 1000);
    if (s < 45) return nt("notif.justNow", null, "Ora");
    var m = Math.floor(s / 60);
    if (m < 60) {
      return m === 1
        ? nt("notif.minuteAgo", null, "1 minuto fa")
        : nt("notif.minutesAgo", { n: m }, "{n} minuti fa");
    }
    var h = Math.floor(m / 60);
    if (h < 24) {
      return h === 1
        ? nt("notif.hourAgo", null, "1 ora fa")
        : nt("notif.hoursAgo", { n: h }, "{n} ore fa");
    }
    var d = Math.floor(h / 24);
    if (d < 7) {
      return d === 1
        ? nt("notif.dayAgo", null, "1 giorno fa")
        : nt("notif.daysAgo", { n: d }, "{n} giorni fa");
    }
    return nt("notif.weekPlusAgo", null, "Più di una settimana fa");
  }
  function render(options) {
    var root = document.getElementById("vc-notif-dropdown");
    var listEl = document.getElementById("vc-notif-list");
    var badge = document.getElementById("vc-notif-badge");
    var sub = document.getElementById("vc-notif-unread-sub");
    var all = rows();
    var unread = all.filter(function (n) {
      return !n.read;
    }).length;
    if (!root || !listEl || !badge || !sub) {
      syncBrowserTabNotifBadge(unread);
      return;
    }
    var sig = buildNotifStoreSignature(all) + "|u:" + unread;
    var force = options && options.force === true;
    if (unread > 0) {
      badge.hidden = false;
      badge.textContent = unread > 99 ? "99+" : String(unread);
    } else {
      badge.hidden = true;
    }
    syncBrowserTabNotifBadge(unread);
    sub.textContent =
      window.VcI18n && typeof window.VcI18n.t === "function"
        ? window.VcI18n.t("notif.unread", { n: unread })
        : unread + " non lette";
    if (all.length > 0) root.classList.add("vc-notif-dropdown--has-items");
    else root.classList.remove("vc-notif-dropdown--has-items");
    syncPushPromptUi();
    if (!force && sig === lastNotifRenderSig) return;
    lastNotifRenderSig = sig;
    listEl.innerHTML = "";
    all.forEach(function (n) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-notif-item";
      if (n.kind === "success") btn.classList.add("vc-notif-item--success");
      if (n.read) btn.classList.add("vc-notif-item--read");
      btn.setAttribute("data-id", n.id);
      btn.setAttribute("data-open-url", String(n.openUrl || "").trim());
      btn.setAttribute("data-kind", String(n.kind || "info"));
      var ico = document.createElement("span");
      ico.className = "vc-notif-item-ico";
      ico.setAttribute("aria-hidden", "true");
      var fi = document.createElement("i");
      fi.className = "fa " + iconClass(n.kind);
      fi.setAttribute("aria-hidden", "true");
      ico.appendChild(fi);
      var main = document.createElement("div");
      main.className = "vc-notif-item-main";
      var title = document.createElement("p");
      title.className = "vc-notif-item-title";
      title.textContent = n.title || "";
      var desc = document.createElement("p");
      desc.className = "vc-notif-item-desc";
      desc.textContent = n.body || "";
      var time = document.createElement("time");
      time.className = "vc-notif-item-time";
      time.dateTime = new Date(n.at || Date.now()).toISOString();
      time.textContent = timeAgoLocalized(n.at || Date.now());
      main.appendChild(title);
      main.appendChild(desc);
      main.appendChild(time);
      var dot = document.createElement("span");
      dot.className = "vc-notif-item-dot";
      if (n.read) dot.setAttribute("aria-hidden", "true");
      else
        dot.setAttribute(
          "aria-label",
          window.VcI18n && typeof window.VcI18n.t === "function"
            ? window.VcI18n.t("notif.unreadDot")
            : "Non letta",
        );
      btn.appendChild(ico);
      btn.appendChild(main);
      btn.appendChild(dot);
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }
  function markAllRead() {
    if (ephemeralDemo) ephemeralDemo.read = true;
    saveStored(
      loadStored().map(function (x) {
        if (x && x.id) rememberPendingRead(x.id);
        return Object.assign({}, x, { read: true });
      }),
    );
    render();
    markAllSiteNotificationsReadOnServer()
      .then(function (ok) {
        if (!ok) return;
        savePendingReadMap({});
      })
      .finally(function () {
        syncSiteNotificationsFromServer();
      });
  }
  function clearAll() {
    ephemeralDemo = null;
    var uid = normalizeUserId(currentUserId);
    var items = loadStored();
    for (var ci = 0; ci < items.length; ci += 1) {
      rememberDismissedNotif(items[ci], uid);
    }
    saveStored([]);
    render();
    clearAllSiteNotificationsOnServer().finally(function () {
      syncSiteNotificationsFromServer();
    });
  }
  function markOneRead(id) {
    if (ephemeralDemo && ephemeralDemo.id === id) {
      ephemeralDemo.read = true;
      render();
      return;
    }
    rememberPendingRead(id);
    saveStored(
      loadStored().map(function (x) {
        if (x.id === id) return Object.assign({}, x, { read: true });
        return x;
      }),
    );
    render();
    markSiteNotificationReadOnServer(id)
      .then(function (ok) {
        if (ok) forgetPendingRead(id);
      })
      .finally(function () {
        syncSiteNotificationsFromServer();
      });
  }
  function consumeNotifReadFromUrl() {
    try {
      var u = new URL(window.location.href);
      var id = String(u.searchParams.get("vcNotifRead") || "").trim();
      if (!id) return;
      rememberClickRead(id);
      u.searchParams.delete("vcNotifRead");
      var cleaned = u.pathname + u.search + u.hash;
      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState({}, "", cleaned);
      }
    } catch (e) {}
    tryFlushClickReads();
  }
  function wirePushNotifMarkRead() {
    consumeNotifReadFromUrl();
    consumePendingReadFromSwCache();
    try {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker.addEventListener("message", function (ev) {
        var data = ev && ev.data ? ev.data : null;
        if (!data || !data.type) return;
        if (data.type === "vc:push-received") {
          var p = data.payload && typeof data.payload === "object" ? data.payload : {};
          if (isWatchingTicketChat(p.ticketId, p.openUrl)) {
            var seenId = String(p.id || "").trim();
            if (seenId) {
              rememberClickRead(seenId);
              tryFlushClickReads();
            }
            return;
          }
          playNotifSound();
          showNotifFlyToast({
            id: String(p.id || "").trim() || "push-" + Date.now(),
            title: String(p.title || "Vinili & Caffè"),
            body: String(p.body || ""),
            kind: String(p.kind || "info"),
            openUrl: String(p.openUrl || "").trim(),
            read: false,
          });
          return;
        }
        if (data.type === "vc:push-resubscribe") {
          refreshPushSubscriptionState().then(function (ok) {
            if (!ok) syncPushPromptUi();
          });
          return;
        }
        if (data.type !== "vc:notif-mark-read") return;
        var id = String(data.id || "").trim();
        if (!id) return;
        rememberClickRead(id);
        tryFlushClickReads();
      });
    } catch (e2) {}
  }
  function resolveNotifDestUrl(dest) {
    var u = String(dest || "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    try {
      return new URL(u, window.location.origin).href;
    } catch (e) {
      return u;
    }
  }

  function shouldOpenNotifInNewTab(href, kind) {
    var k = String(kind || "").toLowerCase();
    if (k !== "vote" && k !== "vote_reminder") return false;
    try {
      var u = new URL(String(href || ""), window.location.origin);
      var host = String(u.hostname || "").toLowerCase();
      return host.indexOf("top.gg") !== -1 || host.indexOf("discadia.com") !== -1;
    } catch (e) {
      return false;
    }
  }

  function openNotifDestination(href, kind) {
    if (!href) return;
    if (shouldOpenNotifInNewTab(href, kind)) {
      try {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      } catch (e) {}
    }
    try {
      var dest = new URL(String(href), window.location.origin);
      var here = window.location;
      var destPath = String(dest.pathname || "").replace(/\/+$/, "") || "/";
      var herePath = String(here.pathname || "").replace(/\/+$/, "") || "/";
      var isTicketsDest = /\/tickets$/i.test(destPath);
      var onTicketsPage = /\/tickets$/i.test(herePath);
      if (isTicketsDest && onTicketsPage) {
        var ticketId = String(dest.hash || "").replace(/^#/, "").trim();
        var wantStaff = false;
        try {
          wantStaff = dest.searchParams.get("view") === "staff";
        } catch (eSp) {}
        if (wantStaff) {
          var cur = String(here.search || "");
          if (cur.indexOf("view=staff") < 0) {
            // Cambia anche la query: serve un reload per allineare lo stato.
            window.location.href = dest.pathname + "?view=staff" + (ticketId ? "#" + ticketId : "");
            return;
          }
        }
        if (ticketId && /^[a-f0-9]{24}$/i.test(ticketId)) {
          if (String(here.hash || "").replace(/^#/, "") !== ticketId) {
            here.hash = ticketId;
          }
          try {
            window.dispatchEvent(
              new CustomEvent("vc:web-tickets-open", {
                detail: { id: ticketId, staff: wantStaff },
              }),
            );
          } catch (eEv) {}
          return;
        }
      }
    } catch (eNav) {}
    window.location.href = href;
  }

  function pulseNotifSummary() {
    var sm = document.querySelector("#vc-notif-dropdown summary.vc-notif-summary");
    if (!sm) return;
    try {
      sm.classList.remove("vc-notif-summary--pulse");
      void sm.offsetWidth;
      sm.classList.add("vc-notif-summary--pulse");
    } catch (e) {}
  }

  function syncGlobalNotifOverlayClass() {
    var dd = document.getElementById("vc-notif-dropdown");
    var root = document.documentElement;
    if (!root) return;
    var isDropdownOpen = Boolean(dd && dd.open);
    var hasFlyToast = notifFlyActiveCount > 0;
    root.classList.toggle("vc-notif-overlay-active", isDropdownOpen || hasFlyToast);
  }

  function unlockNotifAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve(false);
    try {
      if (!notifAudioCtx) notifAudioCtx = new AC();
      if (notifAudioCtx.state === "suspended" && typeof notifAudioCtx.resume === "function") {
        return notifAudioCtx
          .resume()
          .then(function () {
            notifAudioUnlocked = true;
            return true;
          })
          .catch(function () {
            return false;
          });
      }
      notifAudioUnlocked = true;
      return Promise.resolve(true);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function playNotifTone(ctx, freq, when, dur, peak) {
    var master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, when);
    master.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), when + 0.015);
    master.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    master.connect(ctx.destination);

    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3400, when);
    filter.Q.setValueAtTime(0.65, when);
    filter.connect(master);

    var sine = ctx.createOscillator();
    sine.type = "sine";
    sine.frequency.setValueAtTime(freq, when);
    sine.connect(filter);

    var sparkle = ctx.createOscillator();
    var sparkleGain = ctx.createGain();
    sparkle.type = "triangle";
    sparkle.frequency.setValueAtTime(freq * 2, when);
    sparkleGain.gain.setValueAtTime(0.28, when);
    sparkle.connect(sparkleGain);
    sparkleGain.connect(filter);

    sine.start(when);
    sparkle.start(when);
    sine.stop(when + dur + 0.03);
    sparkle.stop(when + dur + 0.03);
  }

  var lastNotifSoundAt = 0;
  var lastFlyToastId = "";
  var lastFlyToastAt = 0;

  function playNotifSound() {
    var nowMs = Date.now();
    if (nowMs - lastNotifSoundAt < 1200) return;
    lastNotifSoundAt = nowMs;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    unlockNotifAudio().then(function (ok) {
      if (!ok || !notifAudioCtx) return;
      try {
        var ctx = notifAudioCtx;
        if (ctx.state === "suspended") return;
        var now = ctx.currentTime + 0.02;
        // Doppio “ping” tipo Instagram: udibile ma non aggressivo.
        playNotifTone(ctx, 784.0, now, 0.17, 0.22);
        playNotifTone(ctx, 1174.7, now + 0.1, 0.22, 0.18);
      } catch (e) {}
    });
  }

  function placeNotifPopNearBell(root, bell) {
    if (!root || !bell) return;
    var br = bell.getBoundingClientRect();
    var gap = 10;
    var stack = Math.max(0, notifFlyActiveCount - 1) * 10;
    var rw = Math.min(296, Math.max(220, window.innerWidth - 24));
    root.style.width = rw + "px";
    var left = br.right - rw;
    if (left < 12) left = 12;
    if (left + rw > window.innerWidth - 12) left = Math.max(12, window.innerWidth - 12 - rw);
    var top = br.bottom + gap + stack;
    if (top + 88 > window.innerHeight - 12) {
      top = Math.max(12, br.top - gap - 72 - stack);
    }
    root.style.top = Math.round(top) + "px";
    root.style.left = Math.round(left) + "px";
    root.style.right = "auto";
    root.style.bottom = "auto";
    var ox = Math.max(16, Math.min(rw - 16, br.left + br.width / 2 - left));
    root.style.setProperty("--vc-pop-ox", Math.round(ox) + "px");
  }

  function showNotifFlyToast(row) {
    var toastId = String((row && row.id) || "");
    var nowMs = Date.now();
    if (toastId && toastId === lastFlyToastId && nowMs - lastFlyToastAt < 2500) return;
    lastFlyToastId = toastId;
    lastFlyToastAt = nowMs;
    var bell = document.querySelector("#vc-notif-dropdown summary.vc-notif-summary");
    if (!bell) return;
    var dd = document.getElementById("vc-notif-dropdown");
    if (dd && dd.open) {
      pulseNotifSummary();
      return;
    }
    var title = row && row.title ? String(row.title) : "Nuova notifica";
    var body = row && row.body ? String(row.body) : "";
    if (body.length > 72) body = body.slice(0, 71) + "…";
    var kind = String((row && row.kind) || "info");
    var dest = resolveNotifDestUrl(String((row && row.openUrl) || "").trim());

    var root = document.createElement("button");
    root.type = "button";
    root.className = "vc-notif-fly-card";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");

    var ico = document.createElement("span");
    ico.className = "vc-notif-fly-card__ico";
    ico.setAttribute("aria-hidden", "true");
    var fi = document.createElement("i");
    fi.className = "fa " + iconClass(kind);
    ico.appendChild(fi);

    var main = document.createElement("span");
    main.className = "vc-notif-fly-card__main";
    var t = document.createElement("strong");
    t.className = "vc-notif-fly-card__t";
    t.textContent = title;
    var b = document.createElement("span");
    b.className = "vc-notif-fly-card__b";
    b.textContent = body;
    main.appendChild(t);
    if (body) main.appendChild(b);

    root.appendChild(ico);
    root.appendChild(main);
    document.body.appendChild(root);
    notifFlyActiveCount += 1;
    syncGlobalNotifOverlayClass();
    placeNotifPopNearBell(root, bell);
    pulseNotifSummary();

    root.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      finish(true);
      if (row && row.id) markOneRead(row.id);
      if (dest) {
        openNotifDestination(dest, kind);
        return;
      }
      try {
        if (dd && !dd.open) dd.setAttribute("open", "");
      } catch (eOpen) {}
    });

    var finished = false;
    function finish(fromClick) {
      if (finished) return;
      finished = true;
      root.classList.add("vc-notif-fly-card--out");
      window.setTimeout(function () {
        try {
          root.remove();
        } catch (e2) {}
        notifFlyActiveCount = Math.max(0, notifFlyActiveCount - 1);
        syncGlobalNotifOverlayClass();
        if (!fromClick) pulseNotifSummary();
      }, NOTIF_FLY_ANIM_MS + 40);
    }

    var onResize = function () {
      if (finished) return;
      placeNotifPopNearBell(root, bell);
    };
    window.addEventListener("resize", onResize);
    window.setTimeout(function () {
      window.removeEventListener("resize", onResize);
      if (!finished) finish(false);
    }, NOTIF_FLY_READ_MS);
  }

  function addNotif(p) {
    var ownerId = normalizeUserId((p && p.userId) || currentUserId);
    if (!ownerId) return { added: false };
    var kindRaw = p && p.kind;
    var kind =
      kindRaw === "vote"
        ? "vote"
        : kindRaw === "vote_reminder"
          ? "vote_reminder"
        : kindRaw === "success"
          ? "success"
          : kindRaw === "review"
            ? "review"
            : kindRaw === "mod"
              ? "mod"
              : kindRaw === "suggestion"
                ? "suggestion"
                : kindRaw === "web_ticket" || kindRaw === "web_ticket_mention"
                  ? "web_ticket"
                : "info";
    var openUrl = "";
    if (p && typeof p.openUrl === "string") openUrl = String(p.openUrl).trim();
    var stableId = buildStableNotifId(p, ownerId, kind, openUrl);
    var titleRaw = String((p && p.title) || "").toLowerCase();
    var bodyRaw = String((p && p.body) || "").toLowerCase();
    if (
      kind === "vote" &&
      (titleRaw.indexOf("promemoria") !== -1 ||
        bodyRaw.indexOf("promemoria") !== -1)
    ) {
      kind = "vote_reminder";
    }
    var fpId = buildNotifFingerprintId(p, ownerId, kind, openUrl);
    var dismissed = loadDismissedSet(ownerId);
    if ((stableId && dismissed.has(stableId)) || (fpId && dismissed.has(fpId))) return { added: false };
    var incomingRead = Boolean(p && (p.read === true || p.readAt));
    var item = {
      id: stableId || String(Date.now()) + "-" + String(Math.floor(Math.random() * 1e9)),
      title: String((p && p.title) || ""),
      body: String((p && p.body) || ""),
      at: typeof (p && p.at) === "number" ? p.at : Date.now(),
      read: incomingRead,
      kind: kind,
      openUrl: openUrl,
    };
    var key = userStorageKey(ownerId);
    var s = [];
    try {
      var raw = localStorage.getItem(key);
      var arr = raw ? JSON.parse(raw) : [];
      s = Array.isArray(arr) ? arr : [];
    } catch (e) {
      s = [];
    }
    if (stableId || fpId) {
      for (var dup = 0; dup < s.length; dup += 1) {
        var exId = String((s[dup] && s[dup].id) || "").trim();
        var exKind = String((s[dup] && s[dup].kind) || kind);
        var exOpen = String((s[dup] && s[dup].openUrl) || openUrl);
        var exFp = buildNotifFingerprintId(s[dup], ownerId, exKind, exOpen);
        var idMatch = Boolean(stableId && exId === stableId);
        var fpMatch = Boolean(fpId && (exId === fpId || exFp === fpId));
        var mongoToAutoFp = Boolean(
          stableId &&
            !isAutoClientNotifId(stableId) &&
            isAutoClientNotifId(exId) &&
            exFp === fpId,
        );
        if (!idMatch && !fpMatch && !mongoToAutoFp) continue;
        var merged = Object.assign({}, s[dup], item, {
          id: stableId || exId,
          read: Boolean(s[dup].read) || incomingRead,
        });
        s[dup] = merged;
        try {
          localStorage.setItem(key, JSON.stringify(s));
        } catch (e3) {}
        if (!p || !p.__noRender) render();
        return { added: false };
      }
    }
    if (stableId && !isAutoClientNotifId(stableId)) {
      for (var c = 0; c < s.length; c += 1) {
        var cid = String((s[c] && s[c].id) || "").trim();
        if (!cid || cid === stableId) continue;
        if (!isAutoClientNotifId(cid) && cid.length === 24) continue;
        if (!sameNotifCore(s[c], item)) continue;
        var mergedC = Object.assign({}, s[c], item, {
          id: stableId,
          read: Boolean(s[c].read) || incomingRead,
        });
        s[c] = mergedC;
        try {
          localStorage.setItem(key, JSON.stringify(s));
        } catch (e4) {}
        if (!p || !p.__noRender) render();
        return { added: false };
      }
    }
    s.push(item);
    s = sortNotifItems(s);
    try {
      localStorage.setItem(key, JSON.stringify(s));
    } catch (e2) {}
    if (!p || !p.__noRender) render();
    return { added: true };
  }
  function flushPendingLoginNotification() {
    var raw = "";
    try {
      raw = String(localStorage.getItem(PENDING_LOGIN_NOTIF_KEY) || "");
    } catch (e) {
      raw = "";
    }
    if (!raw) return;
    var data = null;
    try {
      data = JSON.parse(raw);
    } catch (e2) {
      data = null;
    }
    if (!data || typeof data !== "object") return;
    var ownerId = normalizeUserId(data.userId);
    if (!ownerId) {
      try {
        localStorage.removeItem(PENDING_LOGIN_NOTIF_KEY);
      } catch (e4) {}
      return;
    }
    if (!currentUserId || ownerId !== currentUserId) return;
    try {
      localStorage.removeItem(PENDING_LOGIN_NOTIF_KEY);
    } catch (e3) {}
    addNotif(data);
  }
  function isMobileNotifViewport() {
    try {
      // Telefoni in landscape (>640px) altrimenti aprono il dropdown “desktop”
      // dentro la pillola header → campanella/sheet rotti (specie homepage).
      return window.matchMedia(
        "(max-width: 639.98px), ((pointer: coarse) and (max-width: 920px))",
      ).matches;
    } catch (e) {
      return (window.innerWidth || 999) <= 640;
    }
  }

  var notifPortalGuardUntil = 0;
  var notifPortalSyncing = false;

  function portalNotifDropdownToBody(dd, enable) {
    if (!dd) return;
    var slotId = "vc-notif-dropdown-slot";
    var slot = document.getElementById(slotId);
    if (enable) {
      if (dd.parentElement !== document.body) {
        if (!slot) {
          slot = document.createElement("span");
          slot.id = slotId;
          slot.hidden = true;
          slot.setAttribute("aria-hidden", "true");
          if (dd.parentNode) dd.parentNode.insertBefore(slot, dd);
        }
        document.body.appendChild(dd);
      }
      // Safari/iOS: spostare un <details open> nel DOM lo chiude; riforziamo subito + rAF.
      function forceOpen() {
        try {
          dd.open = true;
          dd.setAttribute("open", "");
        } catch (eOpen) {}
      }
      forceOpen();
      try {
        window.requestAnimationFrame(forceOpen);
      } catch (eRaf) {}
      notifPortalGuardUntil = Date.now() + 700;
      return;
    }
    if (slot && slot.parentNode && dd.parentElement === document.body) {
      slot.parentNode.insertBefore(dd, slot);
      return;
    }
    if (dd.parentElement === document.body) {
      var actions = document.getElementById("header-quick-actions");
      if (actions) {
        var promo = document.getElementById("vc-header-promo-btn");
        var toggle = document.getElementById("vc-mobile-nav-toggle");
        // Ripristina ordine: promo → campanella → hamburger → login
        if (promo && promo.parentElement === actions) {
          if (promo.nextSibling) actions.insertBefore(dd, promo.nextSibling);
          else actions.appendChild(dd);
        } else if (toggle && toggle.parentElement === actions) {
          actions.insertBefore(dd, toggle);
        } else {
          actions.appendChild(dd);
        }
      }
    }
  }

  function syncNotifMobileSheetChrome() {
    if (notifPortalSyncing) return;
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return;
    var root = document.documentElement;
    var mobile = isMobileNotifViewport();
    // Ignora il toggle "close" spurio subito dopo il portal su body.
    if (!dd.open && mobile && Date.now() < notifPortalGuardUntil) {
      try {
        dd.open = true;
        dd.setAttribute("open", "");
      } catch (eRe) {}
      return;
    }
    notifPortalSyncing = true;
    try {
      if (dd.open && mobile) {
        try {
          root.classList.add("vc-notif-sheet-open");
          root.classList.add("vc-notif-dropdown-open");
        } catch (e0) {}
        portalNotifDropdownToBody(dd, true);
        if (!dd.querySelector(".vc-notif-mobile-backdrop")) {
          var bd = document.createElement("div");
          bd.className = "vc-notif-mobile-backdrop";
          bd.setAttribute("aria-hidden", "true");
          bd.addEventListener("click", function () {
            notifPortalGuardUntil = 0;
            dd.removeAttribute("open");
          });
          dd.insertBefore(bd, dd.firstChild);
        }
      } else {
        try {
          root.classList.remove("vc-notif-sheet-open");
          if (!dd.open) root.classList.remove("vc-notif-dropdown-open");
        } catch (e1) {}
        var oldBd = dd.querySelector(".vc-notif-mobile-backdrop");
        if (oldBd) oldBd.remove();
        portalNotifDropdownToBody(dd, false);
      }
      syncGlobalNotifOverlayClass();
    } finally {
      notifPortalSyncing = false;
    }
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }
  function resolvedSiteNotificationsUrl() {
    var c = typeof window !== "undefined" && window.__VC_SITE_NOTIFS ? window.__VC_SITE_NOTIFS : {};
    var local = String(c.apiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local) return local;
    var u = String(c.apiUrl || "").trim();
    if (u) return u;
    return "/webhooks/site-notifications";
  }
  function resolvedSiteNotificationsReadUrl() {
    var base = resolvedSiteNotificationsUrl();
    if (!base) return "/webhooks/site-notifications/read";
    return String(base).replace(/\/+$/, "") + "/read";
  }
  function resolvedSiteNotificationsClearUrl() {
    var base = resolvedSiteNotificationsUrl();
    if (!base) return "/webhooks/site-notifications/clear";
    return String(base).replace(/\/+$/, "") + "/clear";
  }
  function resolvedSiteNotificationsPushUrl(suffix) {
    var base = resolvedSiteNotificationsUrl();
    var path = String(suffix || "").replace(/^\/+/, "");
    if (!base) return "/webhooks/site-notifications/push/" + path;
    return String(base).replace(/\/+$/, "") + "/push/" + path;
  }
  var PUSH_NATIVE_ASKED_KEY = "vc_push_native_asked_v1";
  var PUSH_PROMPT_DISMISS_KEY = "vc_push_prompt_dismissed_v1";
  var pushSubscribeInFlight = false;
  /** null = non ancora controllato, true = push attiva, false = non attiva */
  var pushSubActive = null;
  var refreshPushInFlight = null;
  var lastPostedPushEndpoint = "";
  var lastPostedPushAt = 0;
  var PUSH_RESYNC_MIN_MS = 10 * 60 * 1000;
  var cachedPushReg = null;
  var cachedVapidPublicKey = "";
  function tNotif(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }
  function isStandalonePwa() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e) {}
    return Boolean(navigator.standalone);
  }
  function isIosLikeDevice() {
    var ua = String(navigator.userAgent || "");
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    try {
      return navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1;
    } catch (e2) {
      return false;
    }
  }
  function webPushSupported() {
    return (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  }
  function wasPushPromptDismissed() {
    try {
      return sessionStorage.getItem(PUSH_PROMPT_DISMISS_KEY) === "1";
    } catch (e) {
      return false;
    }
  }
  function dismissPushPrompt() {
    try {
      sessionStorage.setItem(PUSH_PROMPT_DISMISS_KEY, "1");
    } catch (e) {}
    clearPushCustomUi();
  }
  function shouldShowPushPrompt() {
    if (!webPushSupported()) return false;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return false;
    if (typeof Notification !== "undefined" && Notification.permission === "denied") return false;
    if (wasPushPromptDismissed()) return false;
    if (pushSubActive === true) return false;
    // iOS Safari (non Home Screen): spiega che serve la PWA.
    if (isIosLikeDevice() && !isStandalonePwa()) return true;
    // Mostra anche se permesso già granted ma subscription non salvata (tipico Windows).
    return true;
  }
  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (String(base64String || "").length % 4)) % 4);
    var base64 = String(base64String || "").replace(/-/g, "+").replace(/_/g, "/") + padding;
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function uint8ToBase64Url(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  function normalizeVapidKey(s) {
    return String(s || "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "")
      .trim();
  }
  function subscriptionMatchesVapid(sub, publicKey) {
    if (!sub || !publicKey) return false;
    try {
      var opts = typeof sub.options === "object" && sub.options ? sub.options : null;
      var key = opts && opts.applicationServerKey ? opts.applicationServerKey : null;
      if (!key) return true; // browser non espone la key → non forzare unsubscribe
      var have = key instanceof ArrayBuffer ? new Uint8Array(key) : new Uint8Array(key);
      return normalizeVapidKey(uint8ToBase64Url(have)) === normalizeVapidKey(publicKey);
    } catch (e) {
      return true;
    }
  }
  function wasNativePushAsked() {
    try {
      return sessionStorage.getItem(PUSH_NATIVE_ASKED_KEY) === "1";
    } catch (e) {
      return false;
    }
  }
  function markNativePushAsked() {
    try {
      sessionStorage.setItem(PUSH_NATIVE_ASKED_KEY, "1");
    } catch (e) {}
  }
  function ensureServiceWorkerRegistration() {
    if (!webPushSupported()) return Promise.resolve(null);
    return navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(function (reg) {
        try {
          if (reg && typeof reg.update === "function") reg.update();
        } catch (eUp) {}
        return navigator.serviceWorker.ready;
      })
      .catch(function () {
        return null;
      });
  }
  function prefetchPushPrereqs() {
    if (!webPushSupported()) return Promise.resolve(null);
    return Promise.all([ensureServiceWorkerRegistration(), fetchVapidPublicKey()])
      .then(function (pair) {
        if (pair[0]) cachedPushReg = pair[0];
        if (pair[1]) cachedVapidPublicKey = pair[1];
        return { reg: cachedPushReg, publicKey: cachedVapidPublicKey };
      })
      .catch(function () {
        return { reg: cachedPushReg, publicKey: cachedVapidPublicKey };
      });
  }
  function fetchVapidPublicKey() {
    if (cachedVapidPublicKey) return Promise.resolve(cachedVapidPublicKey);
    return fetch(resolvedSiteNotificationsPushUrl("vapid-public-key"), {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
    })
      .then(function (r) {
        return r.json().catch(function () {
          return null;
        });
      })
      .then(function (j) {
        if (!j || !j.ok || !j.enabled) return "";
        var key = String(j.publicKey || "").trim();
        if (key) cachedVapidPublicKey = key;
        return key;
      })
      .catch(function () {
        return "";
      });
  }
  function postPushSubscription(subscription, opts) {
    opts = opts || {};
    var token = getDiscordAccessToken();
    if (!token || !subscription) return Promise.resolve(false);
    var json = typeof subscription.toJSON === "function" ? subscription.toJSON() : subscription;
    var endpoint = "";
    try {
      endpoint = String((json && json.endpoint) || subscription.endpoint || "").trim();
    } catch (eEp) {}
    var now = Date.now();
    if (
      !opts.force &&
      endpoint &&
      endpoint === lastPostedPushEndpoint &&
      now - lastPostedPushAt < PUSH_RESYNC_MIN_MS
    ) {
      return Promise.resolve(true);
    }
    return fetch(resolvedSiteNotificationsPushUrl("subscribe"), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify({ subscription: json }),
    })
      .then(function (r) {
        if (r && r.ok && endpoint) {
          lastPostedPushEndpoint = endpoint;
          lastPostedPushAt = Date.now();
        }
        return r.ok;
      })
      .catch(function () {
        return false;
      });
  }
  function setPushSubActive(active) {
    pushSubActive = active === true;
    syncPushPromptUi();
  }
  function clearPushCustomUi() {
    try {
      var root = document.getElementById("vc-notif-dropdown");
      if (root) root.classList.remove("vc-notif-dropdown--push-cta");
      var banner = document.getElementById("vc-notif-push-banner");
      if (banner) banner.remove();
      var headBtn = document.getElementById("vc-notif-push-toggle");
      if (headBtn) headBtn.remove();
    } catch (e) {}
  }
  function syncPushPromptUi() {
    var root = document.getElementById("vc-notif-dropdown");
    var body = document.querySelector("#vc-notif-dropdown .vc-notif-panel-body");
    if (!body) return;
    var el = document.getElementById("vc-notif-push-banner");
    if (!shouldShowPushPrompt()) {
      if (el) el.remove();
      if (root) root.classList.remove("vc-notif-dropdown--push-cta");
      return;
    }
    if (root) root.classList.add("vc-notif-dropdown--push-cta");
    if (!el) {
      el = document.createElement("div");
      el.id = "vc-notif-push-banner";
      el.className = "vc-notif-push-banner";
      el.innerHTML =
        '<div class="vc-notif-push-banner-text">' +
        '<strong class="vc-notif-push-banner-title"></strong>' +
        '<span class="vc-notif-push-banner-sub"></span>' +
        "</div>" +
        '<div class="vc-notif-push-banner-actions">' +
        '<button type="button" class="vc-notif-push-enable"></button>' +
        '<button type="button" class="vc-notif-push-dismiss" aria-label=""></button>' +
        "</div>";
      body.insertBefore(el, body.firstChild);
      var enableBtn = el.querySelector(".vc-notif-push-enable");
      var dismissBtn = el.querySelector(".vc-notif-push-dismiss");
      if (enableBtn) {
        enableBtn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          subscribeWebPushFromUserGesture(enableBtn);
        });
      }
      if (dismissBtn) {
        dismissBtn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          dismissPushPrompt();
        });
      }
    }
    var titleEl = el.querySelector(".vc-notif-push-banner-title");
    var subEl = el.querySelector(".vc-notif-push-banner-sub");
    var enableEl = el.querySelector(".vc-notif-push-enable");
    var dismissEl = el.querySelector(".vc-notif-push-dismiss");
    if (titleEl) titleEl.textContent = tNotif("notif.pushTitle", "Notifiche sul dispositivo");
    if (subEl) {
      subEl.textContent =
        isIosLikeDevice() && !isStandalonePwa()
          ? tNotif(
              "notif.pushIosHint",
              "Su iPhone/iPad: aggiungi il sito alla Home, aprilo da lì, poi attiva le notifiche push.",
            )
          : tNotif(
              "notif.pushSub",
              "Senza questo gli avvisi arrivano solo quando riapri il sito. Attiva le push di sistema.",
            );
    }
    if (enableEl) {
      enableEl.textContent = tNotif("notif.pushEnable", "Attiva");
      enableEl.disabled = Boolean(isIosLikeDevice() && !isStandalonePwa()) || pushSubscribeInFlight;
    }
    if (dismissEl) {
      dismissEl.setAttribute("aria-label", tNotif("notif.pushDismiss", "Nascondi"));
      dismissEl.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
    }
  }
  function subscribeWebPushFromUserGesture(btn) {
    if (isIosLikeDevice() && !isStandalonePwa()) {
      syncPushPromptUi();
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = tNotif("notif.pushEnabling", "Attivazione…");
    }
    subscribeWebPushNative({ forcePermissionPrompt: true, fromGesture: true })
      .then(function (ok) {
        if (!ok) {
          try {
            console.warn("[vc-push] subscribe failed", {
              permission: typeof Notification !== "undefined" ? Notification.permission : "n/a",
              standalone: isStandalonePwa(),
            });
          } catch (e0) {}
          if (btn) {
            btn.disabled = false;
            btn.textContent = tNotif("notif.pushEnable", "Attiva");
          }
          try {
            showNotifFlyToast({
              id: "push-err-" + Date.now(),
              title: tNotif("notif.pushTitle", "Notifiche sul dispositivo"),
              body: tNotif(
                "notif.pushError",
                "Non sono riuscito ad attivare le push. Controlla le autorizzazioni del browser.",
              ),
              kind: "info",
              read: true,
            });
          } catch (e1) {}
        } else {
          syncPushPromptUi();
        }
      })
      .catch(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = tNotif("notif.pushEnable", "Attiva");
        }
      });
  }
  function createOrRepairPushSubscription(reg, publicKey) {
    function doSubscribe() {
      return reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    return reg.pushManager.getSubscription().then(function (existing) {
      if (existing && !subscriptionMatchesVapid(existing, publicKey)) {
        return existing
          .unsubscribe()
          .catch(function () {
            return false;
          })
          .then(function () {
            return null;
          });
      }
      return existing;
    }).then(function (existing) {
      if (existing) return existing;
      return doSubscribe().catch(function (err) {
        // Chrome Windows a volte ha uno stato push corrotto: reset e ritenta una volta.
        return reg.pushManager
          .getSubscription()
          .then(function (ghost) {
            return ghost && typeof ghost.unsubscribe === "function"
              ? ghost.unsubscribe().catch(function () {
                  return false;
                })
              : false;
          })
          .then(function () {
            return doSubscribe();
          })
          .catch(function () {
            throw err;
          });
      });
    });
  }
  function refreshPushSubscriptionState(opts) {
    opts = opts || {};
    if (!webPushSupported()) {
      pushSubActive = false;
      return Promise.resolve(false);
    }
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) {
      pushSubActive = false;
      return Promise.resolve(false);
    }
    if (refreshPushInFlight) return refreshPushInFlight;
    refreshPushInFlight = ensureServiceWorkerRegistration()
      .then(function (reg) {
        if (!reg || !reg.pushManager) {
          pushSubActive = false;
          return false;
        }
        return reg.pushManager.getSubscription().then(function (sub) {
          if (!sub) {
            pushSubActive = false;
            return false;
          }
          return postPushSubscription(sub, opts).then(function (ok) {
            pushSubActive = Boolean(ok);
            return pushSubActive;
          });
        });
      })
      .catch(function () {
        pushSubActive = false;
        return false;
      })
      .then(function (ok) {
        refreshPushInFlight = null;
        return ok;
      });
    return refreshPushInFlight;
  }
  /** Crea/ripara la subscription. Su Chrome Windows `pushManager.subscribe` richiede un gesto utente ancora "vivo": niente fetch in mezzo. */
  function subscribeWebPushNative(opts) {
    var fromGesture = opts && opts.fromGesture === true;
    var forcePermissionPrompt = opts && opts.forcePermissionPrompt === true;
    if (pushSubscribeInFlight) return Promise.resolve(false);
    if (!webPushSupported()) return Promise.resolve(false);
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return Promise.resolve(false);
    if (isIosLikeDevice() && !isStandalonePwa()) return Promise.resolve(false);
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      return Promise.resolve(false);
    }

    function finishSub(sub) {
      if (!sub) throw new Error("no_subscription");
      return postPushSubscription(sub, { force: true }).then(function (ok) {
        if (!ok) throw new Error("subscribe_api");
        return true;
      });
    }

    function subscribeCached() {
      var reg = cachedPushReg;
      var publicKey = cachedVapidPublicKey;
      if (!reg || !reg.pushManager) throw new Error("sw_failed");
      if (!publicKey) throw new Error("vapid_missing");
      return createOrRepairPushSubscription(reg, publicKey).then(finishSub);
    }

    if (!fromGesture) {
      // Permesso già granted: su Windows si può (ri)creare la sub senza nuovo click.
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return refreshPushSubscriptionState();
      }
    }

    pushSubscribeInFlight = true;
    var permNow =
      typeof Notification !== "undefined" ? String(Notification.permission || "") : "denied";
    var ask =
      permNow === "granted"
        ? Promise.resolve("granted")
        : forcePermissionPrompt || permNow === "default"
          ? Notification.requestPermission()
          : Promise.resolve(permNow);

    return ask
      .then(function (perm) {
        if (perm === "granted" || perm === "denied") markNativePushAsked();
        if (perm !== "granted") throw new Error("permission_" + perm);
        if (cachedPushReg && cachedVapidPublicKey) return subscribeCached();
        return prefetchPushPrereqs().then(subscribeCached);
      })
      .then(function () {
        pushSubscribeInFlight = false;
        setPushSubActive(true);
        syncPushPromptUi();
        return true;
      })
      .catch(function (err) {
        try {
          console.warn("[vc-push] subscribe error", err && err.message ? err.message : err);
        } catch (eLog) {}
        pushSubscribeInFlight = false;
        setPushSubActive(false);
        syncPushPromptUi();
        return false;
      });
  }
  function maybeAskNativePush() {
    if (!webPushSupported()) return;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    if (typeof Notification !== "undefined" && Notification.permission === "denied") return;
    if (isIosLikeDevice() && !isStandalonePwa()) return;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      subscribeWebPushNative().then(function () {
        syncPushPromptUi();
      });
    }
  }
  function syncExistingWebPushSubscription() {
    if (!webPushSupported()) return;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (isIosLikeDevice() && !isStandalonePwa()) return;
    subscribeWebPushNative().then(function () {
      syncPushPromptUi();
    });
  }
  function siteRealtimeWsUrl() {
    var c = typeof window !== "undefined" && window.__VC_SITE_NOTIFS ? window.__VC_SITE_NOTIFS : {};
    if (c.wsEnabled === false || c.wsEnabled === "false") return "";
    var explicit = String(c.wsUrl || "").trim();
    if (explicit) return explicit;
    var http = resolvedSiteNotificationsUrl();
    if (!http || typeof URL === "undefined") return "";
    try {
      var u = new URL(http);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      var path = String(u.pathname || "").replace(/\/$/, "");
      var dir = path.replace(/\/[^/]+$/, "");
      u.pathname = (dir || "") + "/site-realtime-ws";
      u.search = "";
      u.hash = "";
      return u.href;
    } catch (e) {
      return "";
    }
  }
  function disconnectSiteRealtimeWs() {
    if (siteRealtimeWsReconnectTimer) {
      clearTimeout(siteRealtimeWsReconnectTimer);
      siteRealtimeWsReconnectTimer = null;
    }
    try {
      if (siteRealtimeWs) {
        siteRealtimeWs.onclose = null;
        siteRealtimeWs.close();
      }
    } catch (e2) {}
    siteRealtimeWs = null;
  }
  function scheduleSiteRealtimeWsReconnect() {
    if (siteRealtimeWsReconnectTimer) return;
    siteRealtimeWsReconnectTimer = setTimeout(function () {
      siteRealtimeWsReconnectTimer = null;
      connectSiteRealtimeWebSocket();
    }, 8000);
  }
  function stopSiteNotifsPoll() {
    if (siteNotifsTimer) {
      clearInterval(siteNotifsTimer);
      siteNotifsTimer = null;
    }
  }
  function connectSiteRealtimeWebSocket() {
    if (typeof WebSocket === "undefined") return;
    var url = siteRealtimeWsUrl();
    if (!url) return;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    if (siteRealtimeWsReconnectTimer) {
      clearTimeout(siteRealtimeWsReconnectTimer);
      siteRealtimeWsReconnectTimer = null;
    }
    try {
      if (siteRealtimeWs) {
        siteRealtimeWs.onclose = null;
        siteRealtimeWs.close();
      }
    } catch (e0) {}
    siteRealtimeWs = null;
    try {
      var ws = new WebSocket(url);
      siteRealtimeWs = ws;
      ws.onopen = function () {
        // Poll resta attivo anche con WS (backup se realtime non arriva).
        syncSiteNotificationsFromServer();
      };
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || "{}"));
          if (data.type === "notifications_changed") {
            syncSiteNotificationsFromServer();
          }
        } catch (e3) {}
      };
      ws.onclose = function () {
        siteRealtimeWs = null;
        if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
          restartSiteNotifsPollTimer();
          scheduleSiteRealtimeWsReconnect();
        }
      };
      ws.onerror = function () {
        try {
          ws.close();
        } catch (e4) {}
      };
    } catch (e5) {
      siteRealtimeWs = null;
    }
  }
  function getDiscordAccessToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        var viaAuth = String(window.__vcDiscordGetAccessToken() || "").trim();
        if (viaAuth) return viaAuth;
      }
      return String(localStorage.getItem(DISCORD_ACCESS_TOKEN_KEY) || "").trim();
    } catch (e) {
      return "";
    }
  }
  function markSiteNotificationReadOnServer(id) {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    var sid = String(id || "").trim();
    if (!token || !uid || !sid) return Promise.resolve(false);
    return fetch(resolvedSiteNotificationsReadUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({ id: sid }),
    })
      .then(function (r) {
        return r && r.ok;
      })
      .catch(function () {
        return false;
      });
  }
  function markAllSiteNotificationsReadOnServer() {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if (!token || !uid) return Promise.resolve(false);
    return fetch(resolvedSiteNotificationsReadUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({ all: true }),
    })
      .then(function (r) {
        return r && r.ok;
      })
      .catch(function () {
        return false;
      });
  }
  function clearAllSiteNotificationsOnServer() {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if (!token || !uid) return Promise.resolve(false);
    return fetch(resolvedSiteNotificationsClearUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify({}),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return null;
        });
      })
      .then(function (j) {
        return Boolean(j && j.ok);
      })
      .catch(function () {
        return false;
      });
  }
  function mapServerRowToStoredItem(row) {
    var kindRaw = row && row.kind;
    var kind =
      kindRaw === "vote"
        ? "vote"
        : kindRaw === "vote_reminder"
          ? "vote_reminder"
          : kindRaw === "success"
            ? "success"
            : kindRaw === "review"
              ? "review"
              : kindRaw === "mod"
                ? "mod"
                : kindRaw === "suggestion"
                  ? "suggestion"
                  : "info";
    var titleRaw = String((row && row.title) || "").toLowerCase();
    var bodyRaw = String((row && row.body) || "").toLowerCase();
    if (
      kind === "vote" &&
      (titleRaw.indexOf("promemoria") !== -1 ||
        bodyRaw.indexOf("promemoria") !== -1)
    ) {
      kind = "vote_reminder";
    }
    var openUrl = "";
    if (row && typeof row.openUrl === "string") openUrl = String(row.openUrl).trim();
    var atMs = typeof row.at === "number" ? row.at : Date.now();
    return {
      id: String(row.id || "").trim(),
      title: String((row && row.title) || ""),
      body: String((row && row.body) || ""),
      at: atMs,
      read: Boolean(row.read === true || row.readAt),
      kind: kind,
      openUrl: openUrl,
    };
  }
  function mergeStoredWithServerNotificationList(list, uid) {
    var oldItems = loadStored();
    var beforeSig = buildNotifStoreSignature(oldItems);
    var dismissed = loadDismissedSet(uid);
    var oldIdMap = {};
    var oldReadMap = {};
    for (var oi = 0; oi < oldItems.length; oi += 1) {
      var oix = oldItems[oi];
      var oid = String((oix && oix.id) || "").trim();
      if (oid) oldIdMap[oid] = true;
      if (oid && oix && oix.read) oldReadMap[oid] = true;
    }
    var pendingReadMap = loadPendingReadMap();
    var serverIdMap = {};
    var fromServer = [];
    for (var i = 0; i < list.length; i += 1) {
      var row = list[i];
      if (!row || !row.title) continue;
      var sid = String(row.id || "").trim();
      if (!sid) continue;
      var mapped = mapServerRowToStoredItem(row);
      var fpId = buildNotifFingerprintId(mapped, uid, mapped.kind, mapped.openUrl);
      // Server = source of truth: dismissed locale non nasconde item ancora presenti in API
      // (es. "cancella tutto" fallito lato server lasciava gli id in dismissed per sempre).
      if (!isServerBackedNotifId(sid) && dismissed.has(sid)) continue;
      if (!isServerBackedNotifId(sid) && fpId && dismissed.has(fpId)) continue;
      serverIdMap[sid] = true;
      if (mapped.read) forgetPendingRead(sid);
      fromServer.push(
        Object.assign({}, mapped, {
          read: Boolean(mapped.read) || Boolean(oldReadMap[sid]) || Boolean(pendingReadMap[sid]),
        }),
      );
    }
    var keepLocal = [];
    for (var li = 0; li < oldItems.length; li += 1) {
      var it = oldItems[li];
      var lid = String((it && it.id) || "").trim();
      if (!lid) continue;
      if (!isAutoClientNotifId(lid) || serverIdMap[lid]) continue;
      var exKind = String((it && it.kind) || "info");
      var exOpen = String((it && it.openUrl) || "");
      var fpId = buildNotifFingerprintId(it, uid, exKind, exOpen);
      if (dismissed.has(lid) || dismissed.has(fpId)) continue;
      keepLocal.push(it);
    }
    var merged = keepLocal.concat(fromServer);
    saveStored(merged);
    var changed = beforeSig !== buildNotifStoreSignature(merged);
    var freshMs = 600000;
    var toastRow = null;
    for (var ti = 0; ti < fromServer.length; ti += 1) {
      var fr = fromServer[ti];
      if (!fr) continue;
      var frid = String(fr.id || "").trim();
      if (!frid || oldIdMap[frid]) continue;
      if (isNotifDismissed(fr, uid, dismissed)) continue;
      if (Date.now() - (fr.at || 0) >= freshMs) continue;
      var candidate = {
        id: fr.id,
        title: fr.title,
        body: fr.body,
        kind: fr.kind,
        at: fr.at,
        read: fr.read,
        openUrl: fr.openUrl,
      };
      // Preferisci "voto completato" rispetto a un promemoria più vecchio nella stessa sync.
      if (!toastRow || fr.kind === "vote") {
        toastRow = candidate;
        if (fr.kind === "vote") break;
      }
    }
    return { toastRow: toastRow, changed: changed };
  }
  function syncSiteNotificationsFromServer() {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if (!token || !uid) return;
    var url = resolvedSiteNotificationsUrl();
    if (!url) return;
    var ctrl = null;
    var tid = null;
    try {
      ctrl = new AbortController();
      tid = setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eAb) {}
      }, 12000);
    } catch (e0) {
      ctrl = null;
    }
    var opts = {
      headers: { Authorization: "Bearer " + token },
      credentials: "omit",
    };
    if (ctrl) opts.signal = ctrl.signal;
    fetch(url, opts)
      .then(function (r) {
        if (r && r.status === 401) {
          try {
            if (typeof window.__vcDiscordGetAccessToken === "function" && !window.__vcDiscordGetAccessToken()) {
              localStorage.removeItem(DISCORD_ACCESS_TOKEN_KEY);
            }
          } catch (e401) {}
          return null;
        }
        return r.json();
      })
      .then(function (j) {
        if (!j || j.ok !== true || !Array.isArray(j.items)) return;
        var list = j.items.slice().reverse();
        var mergeResult = mergeStoredWithServerNotificationList(list, uid);
        if (mergeResult.changed) render();
        if (mergeResult.toastRow) {
          playNotifSound();
          window.requestAnimationFrame(function () {
            showNotifFlyToast(mergeResult.toastRow);
          });
        }
      })
      .catch(function () {})
      .finally(function () {
        try {
          if (tid) clearTimeout(tid);
        } catch (e1) {}
      });
  }
  function siteNotifsPollDelayMs() {
    try {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return SITE_NOTIFS_POLL_HIDDEN_MS;
      }
    } catch (e) {}
    return SITE_NOTIFS_POLL_MS;
  }
  function restartSiteNotifsPollTimer() {
    stopSiteNotifsPoll();
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    siteNotifsTimer = setInterval(syncSiteNotificationsFromServer, siteNotifsPollDelayMs());
  }
  function scheduleSiteNotificationsPolling() {
    stopSiteNotifsPoll();
    disconnectSiteRealtimeWs();
    try {
      if (document.body && document.body.classList.contains("vc-dashboard-page")) return;
      if (window.__VC_SITE_DASHBOARD && !window.__VC_SITE_NOTIFS) return;
      if (!document.getElementById("vc-notif-dropdown")) return;
    } catch (eDd) {}
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    syncSiteNotificationsFromServer();
    if (pushSubActive !== true) syncExistingWebPushSubscription();
    // Sempre poll di backup: con SITE_API_EXTERNAL il WS può aprirsi sul processo sbagliato.
    restartSiteNotifsPollTimer();
    var wsUrl = siteRealtimeWsUrl();
    var rs = siteRealtimeWs ? siteRealtimeWs.readyState : 3;
    if (wsUrl && rs !== 0 && rs !== 1) connectSiteRealtimeWebSocket();
  }
  function wireNotifMobileSheet() {
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return;
    dd.addEventListener("toggle", function () {
      syncNotifMobileSheetChrome();
      if (dd.open) {
        syncPushPromptUi();
        maybeAskNativePush();
      } else {
        syncPushPromptUi();
      }
    });
    window.addEventListener("resize", function () {
      if (!isMobileNotifViewport()) syncNotifMobileSheetChrome();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (!isMobileNotifViewport() || !dd.open) return;
      dd.removeAttribute("open");
    });
    var head = dd.querySelector(".vc-notif-panel-head");
    if (head && !head.querySelector(".vc-notif-close-mobile")) {
      var closeM = document.createElement("button");
      closeM.type = "button";
      closeM.className = "vc-notif-action vc-notif-close-mobile";
      closeM.setAttribute(
        "aria-label",
        window.VcI18n && typeof window.VcI18n.t === "function" ? window.VcI18n.t("notif.close") : "Chiudi",
      );
      closeM.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
      closeM.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        dd.removeAttribute("open");
      });
      head.appendChild(closeM);
    }
  }

  function init() {
    setCurrentUser(window.__VC_DISCORD_PROFILE || null);
    wirePushNotifMarkRead();
    flushPendingReadsToServer();
    tryFlushClickReads();
    window.addEventListener("pageshow", function () {
      consumeNotifReadFromUrl();
      consumePendingReadFromSwCache();
    });
    render();
    syncGlobalNotifOverlayClass();
    document.addEventListener("pointerdown", unlockNotifAudio, true);
    document.addEventListener("keydown", unlockNotifAudio, true);
    wireNotifMobileSheet();
    var markBtn = document.getElementById("vc-notif-mark-all");
    var clearBtn = document.getElementById("vc-notif-clear-all");
    var seeAll = document.getElementById("vc-notif-see-all");
    var listEl = document.getElementById("vc-notif-list");
    if (markBtn) markBtn.addEventListener("click", markAllRead);
    if (clearBtn) clearBtn.addEventListener("click", clearAll);
    if (seeAll) {
      seeAll.addEventListener("click", function (ev) {
        ev.preventDefault();
        window.location.href = notificationsPageUrl();
      });
    }
    if (listEl) {
      listEl.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var btn = t.closest("button.vc-notif-item");
        if (!btn || !listEl.contains(btn)) return;
        var id = btn.getAttribute("data-id");
        var dest = String(btn.getAttribute("data-open-url") || "").trim();
        var kind = String(btn.getAttribute("data-kind") || "info").toLowerCase();
        if (id) markOneRead(id);
        var href = resolveNotifDestUrl(dest);
        if (href) {
          ev.preventDefault();
          var ddNav = document.getElementById("vc-notif-dropdown");
          if (ddNav) ddNav.removeAttribute("open");
          openNotifDestination(href, kind);
        }
      });
    }
    window.vcNotify = { add: addNotif, refresh: render };
    flushPendingLoginNotification();
    scheduleSiteNotificationsPolling();
    syncPushPromptUi();
    if (webPushSupported()) {
      prefetchPushPrereqs().then(function () {
        if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
          syncExistingWebPushSubscription();
        }
      });
    } else if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
      syncExistingWebPushSubscription();
    }
  }
  window.addEventListener("vc-discord-profile", function (ev) {
    setCurrentUser(ev && ev.detail ? ev.detail.user : null);
    lastNotifRenderSig = "";
    render({ force: true });
    syncGlobalNotifOverlayClass();
    flushPendingLoginNotification();
    consumeNotifReadFromUrl();
    consumePendingReadFromSwCache();
    tryFlushClickReads();
    flushPendingReadsToServer();
    syncPushPromptUi();
    if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
      scheduleSiteNotificationsPolling();
      prefetchPushPrereqs().then(function () {
        syncExistingWebPushSubscription();
      });
    } else {
      stopSiteNotifsPoll();
      disconnectSiteRealtimeWs();
    }
  });
  document.addEventListener("vc:langchange", function () {
    lastNotifRenderSig = "";
    baseDocumentTitle = "";
    lastTabUnreadShown = -1;
    render({ force: true });
  });
  window.addEventListener("beforeunload", function () {
    stopSiteNotifsPoll();
    disconnectSiteRealtimeWs();
  });
  document.addEventListener("visibilitychange", function () {
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    restartSiteNotifsPollTimer();
    if (document.visibilityState !== "visible") return;
    if (siteNotifsVisibilityTimer) clearTimeout(siteNotifsVisibilityTimer);
    siteNotifsVisibilityTimer = setTimeout(function () {
      siteNotifsVisibilityTimer = null;
      syncSiteNotificationsFromServer();
    }, 400);
  });
  window.addEventListener("storage", function (ev) {
    if (!ev || !isNotifStorageSyncKey(ev.key)) return;
    onNotifStorePeerSync();
  });
  window.addEventListener("vc:notifications-sync", function () {
    onNotifStorePeerSync();
  });
  if (notifSyncBc) {
    notifSyncBc.addEventListener("message", function () {
      onNotifStorePeerSync();
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
(function () {
  var DRAWER_ID = "vc-mobile-nav-drawer";
  var TOGGLE_ID = "vc-mobile-nav-toggle";
  var BODY_OPEN_CLASS = "vc-mobile-nav-open";
  var DISCORD_ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var DISCORD_EXPIRES_AT_KEY = "vc_discord_expires_at";
  var FORBIDDEN_BOOKS_KEY = "vc_forbidden_section_books_v1";
  var FORBIDDEN_BOOKS_START_MS = new Date("2026-06-20T12:00:00").getTime();
  var FORBIDDEN_BOOKS_END_MS = new Date("2026-09-01T10:00:00").getTime();
  var FORBIDDEN_SITE_BOOKS_TOTAL = 8;
  var revealForbiddenBooksTimer = null;
  var forbiddenBooksSyncGen = 0;
  var forbiddenBooksPreviewViewer = false;
  var forbiddenBooksRoundState = null;
  var mq = null;
  var drawer = null;
  var toggle = null;
  var backdrop = null;
  var focusPrev = null;
  var onEscapeDrawer = null;

  function getMq() {
    if (!mq) {
      mq = window.matchMedia("(max-width: 639.98px)");
    }
    return mq;
  }

  function isMobile() {
    try {
      return getMq().matches;
    } catch (e) {
      return (window.innerWidth || 999) <= 640;
    }
  }

  function closeNotifDropdown() {
    var d = document.getElementById("vc-notif-dropdown");
    if (d) d.removeAttribute("open");
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("vc-mobile-nav-drawer--open");
    drawer.setAttribute("aria-hidden", "true");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    try {
      document.documentElement.classList.remove(BODY_OPEN_CLASS);
    } catch (e0) {}
    if (onEscapeDrawer) {
      document.removeEventListener("keydown", onEscapeDrawer);
      onEscapeDrawer = null;
    }
    if (focusPrev && typeof focusPrev.focus === "function") {
      try {
        focusPrev.focus();
      } catch (e1) {}
    }
    focusPrev = null;
  }

  function openDrawer() {
    if (!drawer) return;
    closeNotifDropdown();
    rebuildGrid();
    syncDrawerFooter();
    drawer.classList.add("vc-mobile-nav-drawer--open");
    drawer.setAttribute("aria-hidden", "false");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
    focusPrev = document.activeElement;
    try {
      document.documentElement.classList.add(BODY_OPEN_CLASS);
    } catch (e2) {}
    onEscapeDrawer = function (ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeDrawer();
      }
    };
    document.addEventListener("keydown", onEscapeDrawer);
    var closeBtn = document.getElementById("vc-mobile-nav-close");
    if (closeBtn) {
      window.requestAnimationFrame(function () {
        try {
          closeBtn.focus();
        } catch (e3) {}
      });
    }
  }

  function mobileAvatarUrl(u) {
    if (!u || !u.id) return "";
    if (u.avatar) {
      var ext = String(u.avatar).indexOf("a_") === 0 ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + "." + ext + "?size=64";
    }
    if (typeof BigInt === "undefined") return "";
    try {
      var bi = BigInt(String(u.id));
      var idx = Number((bi >> 22n) % 6n);
      return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
    } catch (e4) {
      return "";
    }
  }

  function mobileProfileHref(userId) {
    try {
      var p = String(window.location.pathname || "").toLowerCase().replace(/\/+$/, "") || "/";
      if (p === "/dashboard" || p.indexOf("/dashboard/") === 0) {
        var d = window.__VC_SITE_DASHBOARD || {};
        if (d.profilePageUrl) return String(d.profilePageUrl);
        return "/dashboard/profilo/";
      }
    } catch (e0) {}
    var id = String(userId || "").trim();
    return id ? "/users/" + encodeURIComponent(id) : "/user";
  }

  function syncDrawerFooter() {
    var foot = document.getElementById("vc-mobile-nav-drawer-footer");
    if (!foot) return;
    foot.innerHTML = "";
    var profile = window.__VC_DISCORD_PROFILE;
    var logoutBtn = document.getElementById("discord-logout-btn");
    var loginBtn = document.getElementById("discord-login-btn");
    var loginState = document.getElementById("discord-login-state");
    var hasToken = false;
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      hasToken = Boolean(t) && (!exp || exp > Date.now());
    } catch (eTok) {}
    var pendingShell = loginState && loginState.querySelector(".vc-auth-pending-shell");
    if (pendingShell || (hasToken && !profile)) {
      var pending = document.createElement("div");
      pending.className = "vc-mobile-nav-footer__account";
      pending.setAttribute("aria-busy", "true");
      pending.innerHTML =
        '<div class="vc-mobile-nav-footer__account-start"><span class="vc-mobile-nav-footer__avatar vc-mobile-nav-footer__avatar--fb" aria-hidden="true"><span class="vc-ui-spinner"></span></span></div>' +
        '<div class="vc-mobile-nav-footer__meta"><span class="vc-mobile-nav-footer__name">Verifica sessione…</span></div>';
      foot.appendChild(pending);
      return;
    }
    if (profile && logoutBtn) {
      var wrap = document.createElement("div");
      wrap.className = "vc-mobile-nav-footer__account";
      var imgUrl = mobileAvatarUrl(profile);
      var name = String(profile.username || "Utente").trim() || "Utente";
      var left = document.createElement("div");
      left.className = "vc-mobile-nav-footer__account-start";
      if (imgUrl) {
        var im = document.createElement("img");
        im.className = "vc-mobile-nav-footer__avatar";
        im.src = imgUrl;
        im.alt = "";
        im.width = 40;
        im.height = 40;
        im.decoding = "async";
        left.appendChild(im);
      } else {
        var fb = document.createElement("span");
        fb.className = "vc-mobile-nav-footer__avatar vc-mobile-nav-footer__avatar--fb";
        fb.setAttribute("aria-hidden", "true");
        fb.innerHTML = '<i class="fa fa-user"></i>';
        left.appendChild(fb);
      }
      var meta = document.createElement("div");
      meta.className = "vc-mobile-nav-footer__meta";
      var nm = document.createElement("span");
      nm.className = "vc-mobile-nav-footer__name";
      nm.textContent = name;
      meta.appendChild(nm);
      var prof = document.createElement("a");
      prof.className = "vc-mobile-nav-footer__profile";
      prof.href = mobileProfileHref(profile.id);
      prof.textContent = "Profilo";
      meta.appendChild(prof);
      var lo = document.createElement("button");
      lo.type = "button";
      lo.className = "vc-mobile-nav-footer__logout";
      lo.textContent = "Logout";
      lo.addEventListener("click", function () {
        logoutBtn.click();
        closeDrawer();
      });
      wrap.appendChild(left);
      wrap.appendChild(meta);
      wrap.appendChild(lo);
      foot.appendChild(wrap);
      return;
    }
    if (loginBtn && !loginBtn.hidden) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "vc-mobile-nav-footer__login";
      b.textContent = "LOGIN";
      b.addEventListener("click", function () {
        if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
          window.__vcDiscordStartOAuthRedirect(b);
          closeDrawer();
          return;
        }
        loginBtn.click();
      });
      foot.appendChild(b);
    }
  }

  function sectionLabel(text) {
    return String(text || "")
      .trim()
      .toUpperCase();
  }

  function navItemHidden(el) {
    return !el || el.hidden || el.hasAttribute("hidden");
  }

  function i18nLabel(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function resolveDashboardHref() {
    var link = document.getElementById("discord-dashboard-link");
    if (link) {
      var h = String(link.getAttribute("href") || "").trim();
      if (h) return h;
    }
    try {
      var d = window.__VC_SITE_DASHBOARD || {};
      if (d.pageUrl) return String(d.pageUrl);
    } catch (e0) {}
    return "/dashboard/";
  }

  function isDashboardNavAllowed() {
    if (window.__VC_DASHBOARD_MENU_BLACKLISTED === true) return false;
    if (window.__VC_DASHBOARD_ACCESS_OK === true) return true;
    if (window.__VC_DASHBOARD_MENU_ALLOWED === true) return true;
    var link = document.getElementById("discord-dashboard-link");
    return Boolean(link && !navItemHidden(link) && !link.classList.contains("is-blacklisted"));
  }

  function shouldInjectDashboardTile() {
    try {
      if (document.body && document.body.classList.contains("vc-dashboard-page")) return false;
    } catch (e) {}
    return isDashboardNavAllowed();
  }

  function createDashboardTile() {
    if (!shouldInjectDashboardTile()) return null;
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = resolveDashboardHref();
    a.setAttribute("data-vc-mobile-dashboard", "1");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = '<i class="fa fa-server"></i>';
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    lab.textContent = i18nLabel("auth.dashboard", "Dashboard");
    a.appendChild(ico);
    a.appendChild(lab);
    a.addEventListener("click", function () {
      closeDrawer();
    });
    return a;
  }

  function removeHeaderDashboardBtn() {
    var existing = document.getElementById("vc-mobile-dashboard-btn");
    if (existing) existing.remove();
  }

  function markTileActive(a, source) {
    if (!a || !source) return;
    if (
      source.classList.contains("is-active") ||
      source.classList.contains("vc-snav-item--active") ||
      source.classList.contains("vc-snav-row--active") ||
      source.getAttribute("aria-current") === "page"
    ) {
      a.classList.add("is-active");
      a.setAttribute("aria-current", "page");
    }
  }

  function createTileFromRow(row) {
    if (navItemHidden(row)) return null;
    var href = row.getAttribute("href");
    if (!href) return null;
    var target = row.getAttribute("target");
    var rel = row.getAttribute("rel");
    var dvl = row.getAttribute("data-vc-loading");
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = href;
    if (target) a.setAttribute("target", target);
    if (rel) a.setAttribute("rel", rel);
    if (dvl) a.setAttribute("data-vc-loading", dvl);
    var icoWrap = row.querySelector(".vc-snav-row-ico");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    if (icoWrap) ico.innerHTML = icoWrap.innerHTML;
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    var spans = row.querySelectorAll("span");
    var labelText = "";
    var j;
    for (j = 0; j < spans.length; j += 1) {
      if (spans[j].classList.contains("vc-snav-row-ico")) continue;
      labelText = spans[j].textContent || "";
      if (labelText) break;
    }
    if (!labelText) labelText = String(row.textContent || "").trim();
    lab.textContent = labelText;
    a.appendChild(ico);
    a.appendChild(lab);
    markTileActive(a, row);
    a.addEventListener("click", function () {
      closeDrawer();
    });
    return a;
  }

  function createTileFromItem(item) {
    if (navItemHidden(item)) return null;
    var href = item.getAttribute("href");
    if (!href) return null;
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = href;
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    var fi = item.querySelector("i.fa");
    if (fi) ico.innerHTML = fi.outerHTML;
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    var innerSpan = item.querySelector("span");
    lab.textContent = innerSpan ? String(innerSpan.textContent || "").trim() : String(item.textContent || "").trim();
    a.appendChild(ico);
    a.appendChild(lab);
    markTileActive(a, item);
    a.addEventListener("click", function () {
      closeDrawer();
    });
    return a;
  }

  function rebuildGrid() {
    var gridRoot = document.getElementById("vc-mobile-nav-drawer-grid");
    var nav = document.querySelector("nav.vc-header-snav");
    if (!gridRoot || !nav) return;
    gridRoot.innerHTML = "";
    var kids = nav.children;
    var i = 0;
    while (i < kids.length) {
      var el = kids[i];
      if (!el || el.tagName === "SPAN") {
        i += 1;
        continue;
      }
      if (el.tagName === "A" && el.classList.contains("vc-snav-item")) {
        var sec = document.createElement("section");
        sec.className = "vc-mobile-nav-section";
        var h = document.createElement("h3");
        h.className = "vc-mobile-nav-section-title";
        h.textContent = "PRINCIPALE";
        var g = document.createElement("div");
        g.className = "vc-mobile-nav-grid";
        while (i < kids.length) {
          var el2 = kids[i];
          if (!el2 || el2.tagName === "SPAN") {
            i += 1;
            continue;
          }
          if (!(el2.tagName === "A" && el2.classList.contains("vc-snav-item"))) break;
          var t = createTileFromItem(el2);
          if (t) g.appendChild(t);
          i += 1;
        }
        if (!g.children.length) continue;
        sec.appendChild(h);
        sec.appendChild(g);
        gridRoot.appendChild(sec);
        continue;
      }
      if (el.tagName === "DETAILS" && el.classList.contains("vc-snav-details")) {
        var sum = el.querySelector(".vc-snav-summary");
        var titleTxt = "MENU";
        if (sum) {
          var sp = sum.querySelector("span");
          titleTxt = sectionLabel(sp ? sp.textContent : sum.textContent);
        }
        var sec2 = document.createElement("section");
        sec2.className = "vc-mobile-nav-section";
        var h2 = document.createElement("h3");
        h2.className = "vc-mobile-nav-section-title";
        h2.textContent = titleTxt;
        var g2 = document.createElement("div");
        g2.className = "vc-mobile-nav-grid";
        var rows = el.querySelectorAll(".vc-snav-panel .vc-snav-row");
        var r;
        for (r = 0; r < rows.length; r += 1) {
          var tile = createTileFromRow(rows[r]);
          if (tile) g2.appendChild(tile);
        }
        if (!g2.children.length) {
          i += 1;
          continue;
        }
        sec2.appendChild(h2);
        sec2.appendChild(g2);
        gridRoot.appendChild(sec2);
      }
      i += 1;
    }
    var dashTile = createDashboardTile();
    if (dashTile) {
      var secDash = document.createElement("section");
      secDash.className = "vc-mobile-nav-section vc-mobile-nav-section--dashboard";
      var hDash = document.createElement("h3");
      hDash.className = "vc-mobile-nav-section-title";
      hDash.textContent = i18nLabel("footer.dashboard", "Dashboard").toUpperCase();
      var gDash = document.createElement("div");
      gDash.className = "vc-mobile-nav-grid";
      gDash.appendChild(dashTile);
      secDash.appendChild(hDash);
      secDash.appendChild(gDash);
      gridRoot.appendChild(secDash);
    }
  }

  function cloneBrand(intoEl) {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar || !intoEl) return;
    var brandSource = bar.children[0];
    intoEl.innerHTML = "";
    if (!brandSource) return;
    var clone = brandSource.cloneNode(true);
    var walks = clone.querySelectorAll("[id]");
    var w;
    for (w = 0; w < walks.length; w += 1) {
      walks[w].removeAttribute("id");
    }
    intoEl.appendChild(clone);
    try {
      if (typeof window.__vcSyncHeaderSiteNameMarquee === "function") {
        window.__vcSyncHeaderSiteNameMarquee(intoEl);
      }
    } catch (eMarquee) {}
  }

  function onMqChange() {
    if (!isMobile()) closeDrawer();
  }

  function ensure() {
    if (document.getElementById(TOGGLE_ID)) return;
    var quick = document.getElementById("header-quick-actions");
    var bar = document.querySelector(".vc-header-bar");
    if (!quick || !bar) return;
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = TOGGLE_ID;
    toggle.className = "vc-mobile-nav-toggle vc-icon-btn";
    toggle.setAttribute("aria-label", "Apri menu di navigazione");
    toggle.setAttribute("aria-controls", DRAWER_ID);
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML =
      '<span class="vc-mobile-nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
    var notif = document.getElementById("vc-notif-dropdown");
    if (notif) {
      if (notif.nextSibling) quick.insertBefore(toggle, notif.nextSibling);
      else quick.appendChild(toggle);
    } else {
      quick.insertBefore(toggle, quick.firstChild);
    }
    drawer = document.createElement("div");
    drawer.id = DRAWER_ID;
    drawer.className = "vc-mobile-nav-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Menu di navigazione");
    drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML =
      '<div class="vc-mobile-nav-drawer__backdrop" tabindex="-1"></div>' +
      '<div class="vc-mobile-nav-drawer__panel">' +
      '<div class="vc-mobile-nav-drawer__top">' +
      '<div class="vc-mobile-nav-drawer__brand" id="vc-mobile-nav-drawer-brand"></div>' +
      '<div class="vc-mobile-nav-drawer__top-actions">' +
      '<button type="button" class="vc-mobile-nav-drawer__close vc-icon-btn" id="vc-mobile-nav-close" aria-label="Chiudi menu"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div></div>" +
      '<div class="vc-mobile-nav-drawer__scroll" id="vc-mobile-nav-drawer-grid"></div>' +
      '<div class="vc-mobile-nav-drawer__footer" id="vc-mobile-nav-drawer-footer"></div>' +
      "</div>";
    document.body.appendChild(drawer);
    backdrop = drawer.querySelector(".vc-mobile-nav-drawer__backdrop");
    cloneBrand(document.getElementById("vc-mobile-nav-drawer-brand"));
    rebuildGrid();
    toggle.addEventListener("click", function () {
      if (drawer.classList.contains("vc-mobile-nav-drawer--open")) closeDrawer();
      else openDrawer();
    });
    var closeBtn = document.getElementById("vc-mobile-nav-close");
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);
    window.addEventListener("vc-discord-profile", function () {
      syncDrawerFooter();
      rebuildGrid();
      removeHeaderDashboardBtn();
    });
    window.addEventListener("vc-dashboard-access", function () {
      rebuildGrid();
      removeHeaderDashboardBtn();
    });
  }

  function refreshMobileNav() {
    ensure();
    rebuildGrid();
    removeHeaderDashboardBtn();
    syncDrawerFooter();
  }

  function init() {
    revealForbiddenSectionBooks();
    window.setInterval(revealForbiddenSectionBooks, 30000);
    ensure();
    var m = getMq();
    if (m.addEventListener) m.addEventListener("change", onMqChange);
    else if (m.addListener) m.addListener(onMqChange);
    removeHeaderDashboardBtn();
    syncDrawerFooter();
  }

  if (!window.__vcMobileNavRebuild) {
    window.__vcMobileNavRebuild = refreshMobileNav;
  }

  function mergeForbiddenCollected(extra) {
    var merged = [];
    var add = function (id) {
      id = String(id || "").trim();
      if (!id || merged.indexOf(id) !== -1) return;
      merged.push(id);
    };
    var stored = readForbiddenBooks();
    for (var i = 0; i < stored.length; i += 1) add(stored[i]);
    if (Array.isArray(extra)) {
      for (var j = 0; j < extra.length; j += 1) add(extra[j]);
    }
    return merged;
  }

  function applyForbiddenBooksVisibility(books, collected, options) {
    var list = mergeForbiddenCollected(collected);
    var status = forbiddenBooksRoundState || {};
    var activeIds = Array.isArray(status.bookIds) ? status.bookIds.map(String) : [];
    var canShow = status.roundActive === true || Boolean(options && options.previewViewer);
    for (var i = 0; i < books.length; i += 1) {
      var id = forbiddenBookId(books[i]);
      if (activeIds.length && activeIds.indexOf(id) === -1) {
        if (books[i].__vcFlyTimer) window.clearInterval(books[i].__vcFlyTimer);
        books[i].remove();
        continue;
      }
      if (list.indexOf(id) !== -1) {
        if (books[i].__vcFlyTimer) window.clearInterval(books[i].__vcFlyTimer);
        books[i].__vcFlyTimer = null;
        books[i].remove();
        continue;
      }
      if (!canShow) {
        hideForbiddenBooks([books[i]]);
        continue;
      }
      setupForbiddenBook(books[i], list);
    }
  }

  function revealForbiddenSectionBooks() {
    if (revealForbiddenBooksTimer) window.clearTimeout(revealForbiddenBooksTimer);
    revealForbiddenBooksTimer = window.setTimeout(revealForbiddenSectionBooksImpl, 80);
  }

  function revealForbiddenSectionBooksImpl() {
    revealForbiddenBooksTimer = null;
    var now = Date.now();

    function proceed() {
      ensureForbiddenBookForCurrentPage();
      var books = document.querySelectorAll("[data-vc-forbidden-book]");
      if (!books.length) return;
      if (!Number.isFinite(FORBIDDEN_BOOKS_START_MS) || (Number.isFinite(FORBIDDEN_BOOKS_END_MS) && now > FORBIDDEN_BOOKS_END_MS)) {
        removeForbiddenBooks(books);
        return;
      }
      if (getDiscordAccessTokenForForbiddenBooks()) {
        syncForbiddenBooksFromServer(books);
        return;
      }
      if (now < FORBIDDEN_BOOKS_START_MS) {
        hideForbiddenBooks(books);
        return;
      }
      applyForbiddenBooksVisibility(books, readForbiddenBooks(), {});
    }

    fetchForbiddenBooksPublicStatus().then(function (status) {
      forbiddenBooksRoundState = status && status.ok === true ? status : null;
      if (status && status.ok && (status.enabled === false || forbiddenHuntEnded(status))) {
        removeAllForbiddenBooks();
        return;
      }
      proceed();
    }).catch(function () {
      forbiddenBooksRoundState = null;
      proceed();
    });
  }

  function currentForbiddenBookPageId() {
    var path = String(window.location.pathname || "/").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
    var map = {
      "/": "home",
      "/faq": "faq",
      "/wiki": "wiki",
      "/regole": "regole",
      "/donazioni": "donazioni",
      "/vote": "vote",
      "/ruoli": "ruoli",
      "/sponsor": "sponsor",
      "/candidature": "candidature",
      "/evento/shop": "evento_shop",
      "/evento/pozioni": "evento_pozioni",
      "/evento/smistamento": "evento_smistamento",
      "/evento/coppa": "evento_coppa",
      "/recensioni": "recensioni",
      "/dashboard/recensioni": "recensioni_bot",
      "/suggerimenti": "suggerimenti",
      "/supporto": "supporto",
      "/tickets": "supporto",
      "/user": "user",
      "/perks": "perks",
      "/notifications": "notifications",
      "/appelli": "appelli",
      "/unban": "appelli",
      "/privacy": "privacy",
      "/terms": "terms",
      "/cookie": "cookie",
    };
    return map[path] || "";
  }

  function ensureForbiddenBookForCurrentPage() {
    if (document.querySelector("[data-vc-forbidden-book]")) return;
    var id = currentForbiddenBookPageId();
    if (!id || !document.body) return;
    var status = forbiddenBooksRoundState || {};
    if (status.roundActive !== true) return;
    var activeIds = Array.isArray(status.bookIds) ? status.bookIds.map(String) : [];
    if (activeIds.length && activeIds.indexOf(id) === -1) return;
    var el = document.createElement("span");
    el.className = "vc-forbidden-book";
    el.setAttribute("data-vc-forbidden-book", id);
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "libro proibito");
    el.hidden = true;
    el.textContent = "📖";
    document.body.appendChild(el);
  }

  function hideForbiddenBooks(books) {
    for (var i = 0; i < books.length; i += 1) {
      books[i].hidden = true;
      books[i].setAttribute("hidden", "");
    }
  }

  function forbiddenBooksStorageKey() {
    var roundId = forbiddenBooksRoundState && forbiddenBooksRoundState.roundId;
    return FORBIDDEN_BOOKS_KEY + (roundId ? "_" + String(roundId) : "");
  }

  function readForbiddenBooks() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(forbiddenBooksStorageKey()) : "";
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function saveForbiddenBooks(ids) {
    try {
      if (window.localStorage) window.localStorage.setItem(forbiddenBooksStorageKey(), JSON.stringify(ids));
    } catch (_) {}
  }

  function forbiddenBookId(el) {
    var explicit = String(el.getAttribute("data-vc-forbidden-book") || "").trim();
    if (explicit && explicit !== "true") return explicit;
    var path = String(window.location.pathname || "/").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "home";
    return path.replace(/[^\w-]+/g, "_");
  }

  function setupForbiddenBook(el, collected) {
    var id = forbiddenBookId(el);
    var already = collected.indexOf(id) !== -1;
    if (already) {
      el.remove();
      return;
    }
    if (el.__vcForbiddenBookReady) {
      el.hidden = false;
      el.removeAttribute("hidden");
      if (!el.classList.contains("vc-forbidden-book--flying") && !el.__vcFlyTimer) startFlyingForbiddenBook(el);
      return;
    }
    el.__vcForbiddenBookReady = true;
    el.hidden = false;
    el.removeAttribute("hidden");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("title", "Cattura il libro proibito");
    el.setAttribute("aria-label", "Cattura libro proibito");
    startFlyingForbiddenBook(el);
    var collect = function () {
      if (el.__vcClaiming) return;
      var now = Date.now();
      if (now - Number(el.__vcLastCollectAttempt || 0) < 500) return;
      el.__vcLastCollectAttempt = now;
      el.__vcClaiming = true;
      claimForbiddenBook(id).then(function (data) {
        var current = Array.isArray(data.collectedBookIds) ? data.collectedBookIds.map(String) : readForbiddenBooks();
        saveForbiddenBooks(current);
        if (el.__vcFlyTimer) window.clearInterval(el.__vcFlyTimer);
        el.classList.add("vc-forbidden-book--caught");
        el.setAttribute("title", "Libro raccolto");
        el.setAttribute("aria-label", "Libro proibito raccolto");
        showForbiddenBookToast(current.length, forbiddenHuntEnded(data) ? "Libro raccolto. La caccia ai libri proibiti è conclusa!" : "");
        window.setTimeout(function () {
          el.remove();
        }, 220);
        if (forbiddenHuntEnded(data)) removeAllForbiddenBooks();
      }).catch(function (err) {
        el.__vcClaiming = false;
        showForbiddenBookToast(readForbiddenBooks().length, err && err.message ? err.message : "Per raccoglierlo devi accedere e aver completato lo smistamento.");
      });
    };
    el.addEventListener("pointerup", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      collect();
    });
    el.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      collect();
    });
  }

  function forbiddenBooksApiUrl() {
    return String(window.__VC_HOGWARTS_FORBIDDEN_BOOKS_API || "/webhooks/site-hogwarts-sorting/forbidden-books").trim() || "/webhooks/site-hogwarts-sorting/forbidden-books";
  }

  function forbiddenBooksPublicStatusUrl() {
    return String(window.__VC_HOGWARTS_FORBIDDEN_BOOKS_STATUS_API || "/webhooks/site-hogwarts-sorting/forbidden-books/status").trim() || "/webhooks/site-hogwarts-sorting/forbidden-books/status";
  }

  function forbiddenHuntEnded(data) {
    if (!data || data.ok !== true) return false;
    if (data.roundActive !== true) return true;
    return data.closed === true;
  }

  function fetchForbiddenBooksPublicStatus() {
    return fetch(forbiddenBooksPublicStatusUrl(), { cache: "no-store" })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        });
      })
      .catch(function () {
        return {};
      });
  }

  function getDiscordAccessTokenForForbiddenBooks() {
    try {
      var token = localStorage.getItem(DISCORD_ACCESS_TOKEN_KEY);
      var expiresAt = Number(localStorage.getItem(DISCORD_EXPIRES_AT_KEY) || "0");
      if (!token || !expiresAt || Date.now() >= expiresAt) return "";
      return token;
    } catch (_) {
      return "";
    }
  }

  function forbiddenBooksRequest(method, body) {
    var token = getDiscordAccessTokenForForbiddenBooks();
    if (!token) return Promise.reject(new Error("Accedi con Discord e completa lo smistamento per raccogliere i libri."));
    return fetch(forbiddenBooksApiUrl(), {
      method: method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || !data || data.ok !== true) {
          throw new Error((data && data.message) || "Libro non raccolto.");
        }
        return data;
      });
    });
  }

  function claimForbiddenBook(bookId) {
    return forbiddenBooksRequest("POST", { bookId: bookId });
  }

  function syncForbiddenBooksFromServer(books) {
    var localCollected = readForbiddenBooks();
    if (!getDiscordAccessTokenForForbiddenBooks()) {
      applyForbiddenBooksVisibility(books, localCollected, {
        previewViewer: forbiddenBooksPreviewViewer,
      });
      return;
    }
    var gen = ++forbiddenBooksSyncGen;
    forbiddenBooksRequest("GET").then(function (data) {
      if (gen !== forbiddenBooksSyncGen) return;
      forbiddenBooksPreviewViewer = data.previewViewer === true;
      forbiddenBooksRoundState = data;
      var collected = Array.isArray(data.collectedBookIds) ? data.collectedBookIds.map(String) : [];
      saveForbiddenBooks(collected);
      if (forbiddenHuntEnded(data)) {
        removeAllForbiddenBooks();
        return;
      }
      applyForbiddenBooksVisibility(books, collected, {
        previewViewer: forbiddenBooksPreviewViewer,
      });
    }).catch(function () {
      if (gen !== forbiddenBooksSyncGen) return;
      applyForbiddenBooksVisibility(books, localCollected, {
        previewViewer: forbiddenBooksPreviewViewer,
      });
    });
  }

  function removeForbiddenBooks(books) {
    for (var i = 0; i < books.length; i += 1) {
      if (books[i].__vcFlyTimer) window.clearInterval(books[i].__vcFlyTimer);
      books[i].remove();
    }
  }

  function removeAllForbiddenBooks() {
    var books = document.querySelectorAll("[data-vc-forbidden-book]");
    removeForbiddenBooks(books);
  }

  function forbiddenBookViewport() {
    var vv = window.visualViewport;
    if (vv && Number.isFinite(vv.width) && Number.isFinite(vv.height)) {
      return {
        width: vv.width,
        height: vv.height,
        offsetLeft: vv.offsetLeft || 0,
        offsetTop: vv.offsetTop || 0,
      };
    }
    return {
      width: window.innerWidth || document.documentElement.clientWidth || 320,
      height: window.innerHeight || document.documentElement.clientHeight || 320,
      offsetLeft: 0,
      offsetTop: 0,
    };
  }

  function isForbiddenBookMobile() {
    try {
      return window.matchMedia("(max-width: 639.98px), (pointer: coarse)").matches;
    } catch (_) {
      return false;
    }
  }

  function prefersForbiddenBookReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }

  function pauseForbiddenBookFlight(el, pauseMs) {
    if (!el) return;
    el.__vcFlyPaused = true;
    if (el.__vcFlyTimer) {
      window.clearInterval(el.__vcFlyTimer);
      el.__vcFlyTimer = null;
    }
    window.clearTimeout(el.__vcPauseResumeTimer);
    el.__vcPauseResumeTimer = window.setTimeout(function () {
      el.__vcFlyPaused = false;
      resumeForbiddenBookFlight(el);
    }, Math.max(1200, Number(pauseMs) || 2200));
  }

  function resumeForbiddenBookFlight(el) {
    if (!el || !el.isConnected || el.__vcFlyPaused || el.__vcFlyTimer) return;
    if (prefersForbiddenBookReducedMotion()) return;
    var move = el.__vcFlyMove;
    if (typeof move !== "function") return;
    move();
    var base = isForbiddenBookMobile() ? 1650 : 850;
    el.__vcFlyTimer = window.setInterval(move, base + Math.floor(Math.random() * 450));
  }

  function startFlyingForbiddenBook(el) {
    try {
      if (el.parentNode !== document.body) document.body.appendChild(el);
    } catch (_) {}
    var move = function () {
      if (el.__vcFlyPaused) return;
      var vp = forbiddenBookViewport();
      var margin = isForbiddenBookMobile() ? 52 : 72;
      var minX = vp.offsetLeft + margin;
      var minY = vp.offsetTop + margin;
      var maxX = vp.offsetLeft + Math.max(margin + 8, vp.width - margin);
      var maxY = vp.offsetTop + Math.max(margin + 8, vp.height - margin);
      var x = minX + Math.random() * Math.max(8, maxX - minX);
      var y = minY + Math.random() * Math.max(8, maxY - minY);
      var rotate = Math.round(-28 + Math.random() * 56);
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.setProperty("--vc-book-rotate", rotate + "deg");
    };
    el.__vcFlyMove = move;
    el.classList.add("vc-forbidden-book--flying");
    move();
    if (!prefersForbiddenBookReducedMotion()) {
      window.setTimeout(move, 80);
      resumeForbiddenBookFlight(el);
    }
    if (!el.__vcFlyListeners) {
      el.__vcFlyListeners = true;
      el.addEventListener("pointerenter", function () {
        pauseForbiddenBookFlight(el, 2800);
      });
      el.addEventListener("pointerdown", function () {
        pauseForbiddenBookFlight(el, 4500);
      });
      var onViewportChange = function () {
        if (!el.isConnected) return;
        move();
      };
      window.addEventListener("resize", onViewportChange);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", onViewportChange);
        window.visualViewport.addEventListener("scroll", onViewportChange);
      }
    }
  }

  function showForbiddenBookToast(count, customMessage) {
    var total = FORBIDDEN_SITE_BOOKS_TOTAL;
    var toast = document.getElementById("vc-forbidden-book-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "vc-forbidden-book-toast";
      toast.className = "vc-forbidden-book-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = customMessage || ("Libro raccolto: " + Math.min(count, total) + "/" + total + " sul sito. Ricorda: 2 sono negli status dei bot.");
    toast.classList.add("vc-forbidden-book-toast--show");
    window.clearTimeout(toast.__vcTimer);
    toast.__vcTimer = window.setTimeout(function () {
      toast.classList.remove("vc-forbidden-book-toast--show");
    }, 3600);
  }

  window.addEventListener("vc-discord-profile", function () {
    revealForbiddenSectionBooks();
  });
  document.addEventListener("vc-hogwarts-staff-preview-unlock", function () {
    revealForbiddenSectionBooks();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();