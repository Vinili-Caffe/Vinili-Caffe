(function () {
  var CONSENT_KEY = "vc_cookie_banner_ack_v3";
  var CONSENT_COOKIE = "vc_cookie_banner_ack_v3";

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

  function rememberCookieConsent() {
    try {
      if (window.localStorage) window.localStorage.setItem(CONSENT_KEY, "accepted");
    } catch (e) {}
    try {
      var maxAge = 60 * 60 * 24 * 180;
      var secure = String(window.location.protocol || "").toLowerCase() === "https:" ? "; Secure" : "";
      document.cookie = CONSENT_COOKIE + "=accepted; Max-Age=" + maxAge + "; Path=/; SameSite=Lax" + secure;
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

    var cookieIcon =
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M15.8 2.6a3.1 3.1 0 0 0 4 4A8.8 8.8 0 1 1 11 2.2c.2 1.8 1.7 3.1 3.5 3.1.5 0 1-.1 1.3-.3Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="9.1" cy="9.4" r="1.1" fill="currentColor"/>' +
      '<circle cx="14.8" cy="10.8" r="1" fill="currentColor"/>' +
      '<circle cx="8.8" cy="14.6" r="1" fill="currentColor"/>' +
      '<circle cx="13.1" cy="16.2" r=".9" fill="currentColor"/>' +
      "</svg>";
    var infoIcon =
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.9"/>' +
      '<path d="M12 10.4v5.1" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
      '<circle cx="12" cy="7.4" r="1.1" fill="currentColor"/>' +
      "</svg>";
    var shieldIcon =
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M12 3.4 19 6v5.4c0 4.3-2.7 7.4-7 9.1-4.3-1.7-7-4.8-7-9.1V6l7-2.6Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>' +
      "</svg>";
    var lockIcon =
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<rect x="5" y="10.2" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="1.9"/>' +
      '<path d="M8.5 10.2V7.8a3.5 3.5 0 1 1 7 0v2.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
      "</svg>";
    var closeIcon =
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
      "</svg>";
    var chevIcon =
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>";

    var root = document.createElement("section");
    root.id = "vc-necessity-banner";
    root.className = "vc-necessity-banner";
    root.setAttribute("aria-label", "Avviso utilizzo cookie");
    root.innerHTML =
      '<div class="vc-necessity-banner__card" role="dialog" aria-modal="false" aria-labelledby="vc-necessity-title">' +
      '<div class="vc-necessity-banner__head">' +
      '<span class="vc-necessity-banner__icon" aria-hidden="true">' + cookieIcon + "</span>" +
      '<div class="vc-necessity-banner__titlewrap">' +
      '<h2 id="vc-necessity-title">Cookie essenziali</h2>' +
      '<p>Usiamo solo dati tecnici necessari per login Discord, sicurezza e funzioni base del sito.</p>' +
      "</div>" +
      '<button type="button" class="vc-necessity-banner__close" data-vc-necessity-dismiss aria-label="Chiudi avviso cookie">' + closeIcon + "</button>" +
      "</div>" +
      '<div class="vc-necessity-banner__body">' +
      '<div class="vc-necessity-banner__scroll">' +
      '<div class="vc-necessity-banner__notice">' +
      '<span class="vc-necessity-banner__noticeico" aria-hidden="true">' + infoIcon + "</span>" +
      '<p><strong>Solo tecnici essenziali.</strong> Nessun cookie di marketing o profilazione: solo accesso, sicurezza e preferenze minime.</p>' +
      "</div>" +
      '<details class="vc-necessity-banner__details">' +
      '<summary><span><span class="vc-necessity-banner__summaryico" aria-hidden="true">' + shieldIcon + '</span> Dettagli tecnici</span><span class="vc-necessity-banner__chev" aria-hidden="true">' + chevIcon + "</span></summary>" +
      '<div class="vc-necessity-banner__tech">' +
      '<div><span class="vc-necessity-banner__techico" aria-hidden="true">' + lockIcon + '</span><span><strong>Token accesso Discord</strong><small>Salvato nel browser per mantenere la sessione (max 90 giorni)</small></span></div>' +
      '<div><span class="vc-necessity-banner__techico" aria-hidden="true">' + lockIcon + '</span><span><strong>Stato OAuth + nonce</strong><small>Controlli anti-CSRF per login Discord sicuro</small></span></div>' +
      '<div><span class="vc-necessity-banner__techico" aria-hidden="true">' + lockIcon + '</span><span><strong>Preferenza banner</strong><small>Ricorda accettazione/chiusura per 180 giorni</small></span></div>' +
      '<div class="vc-necessity-banner__chips"><span>Tecnici essenziali</span><span>Sicurezza</span><span>No marketing</span><span>No profilazione</span></div>' +
      '<a href="' + cookiePolicyUrl + '">Leggi la Cookie Policy completa <span aria-hidden="true">&rarr;</span></a>' +
      "</div>" +
      "</details>" +
      "</div>" +
      '<div class="vc-necessity-banner__dock">' +
      '<div class="vc-necessity-banner__actions">' +
      '<button type="button" class="vc-necessity-banner__accept" data-vc-necessity-confirm>Accetta</button>' +
      '<a class="vc-necessity-banner__link" href="' + cookiePolicyUrl + '">Cookie Policy</a>' +
      "</div>" +
      '<p class="vc-necessity-banner__foot"><strong>Accetta</strong> o <strong>X</strong> salvano la stessa scelta tecnica per 180 giorni. Se non scegli nulla, l’avviso ricompare alla visita successiva.</p>' +
      "</div>" +
      "</div>" +
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
    var closeEl = root.querySelector(".vc-necessity-banner__close");
    if (acceptEl) acceptEl.addEventListener("click", dismissFromUserAction);
    if (closeEl) closeEl.addEventListener("click", dismissFromUserAction);

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
  function injectForumLinkInCommunityMenus() {
    var allDetails = document.querySelectorAll("details.vc-snav-details");
    if (!allDetails || !allDetails.length) return;
    for (var i = 0; i < allDetails.length; i += 1) {
      var det = allDetails[i];
      var summary = det.querySelector(".vc-snav-summary span");
      var txt = String((summary && summary.textContent) || "").trim().toLowerCase();
      if (txt !== "community") continue;
      var panel = det.querySelector(".vc-snav-panel");
      if (!panel) continue;
      var forumRows = panel.querySelectorAll("a.vc-snav-row");
      var hasForum = false;
      forumRows.forEach(function (row) {
        var rowPath = pathnameFromHref(row.getAttribute("href"));
        if (rowPath !== "/forum") return;
        if (!hasForum) {
          hasForum = true;
          return;
        }
        row.remove();
      });
      if (hasForum) continue;
      var row = document.createElement("a");
      row.className = "vc-snav-row";
      row.href = "/forum";
      row.innerHTML =
        '<span class="vc-snav-row-ico" aria-hidden="true"><i class="fa fa-comments"></i></span><span>Forum</span>';
      panel.appendChild(row);
    }
  }

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
    injectForumLinkInCommunityMenus();
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    var HEADER_MENU_SYNC_KEY = "vc_header_menu_sync_v1";
    var localWindowId = String(Date.now()) + "-" + String(Math.random()).slice(2);
    var detailsList = bar.querySelectorAll("details.vc-snav-details");
    var notif = bar.querySelector("details.vc-notif-dropdown");
    var accountMenu = bar.querySelector(".discord-account-menu");
    function syncNotifOpenClass() {
      var root = document.documentElement;
      if (!root) return;
      root.classList.toggle("vc-notif-dropdown-open", Boolean(notif && notif.open));
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
        if (!d.open) return;
        broadcastHeaderMenuOpen(d.id || d.getAttribute("data-menu-id") || "snav");
        detailsList.forEach(function (other) {
          if (other !== d) other.open = false;
        });
        if (notif) notif.open = false;
        syncNotifOpenClass();
      });
    });
    if (notif) {
      notif.addEventListener("toggle", function () {
        syncNotifOpenClass();
        if (!notif.open) return;
        broadcastHeaderMenuOpen(notif.id || "notif");
        detailsList.forEach(function (other) {
          other.open = false;
        });
      });
    }
    if (accountMenu && notif) {
      accountMenu.addEventListener("pointerenter", function () {
        if (notif.open) notif.open = false;
        syncNotifOpenClass();
      });
      accountMenu.addEventListener("focusin", function () {
        if (notif.open) notif.open = false;
        syncNotifOpenClass();
      });
    }
    function closeAllHeaderDropdowns() {
      detailsList.forEach(function (d) {
        d.open = false;
      });
      if (notif) notif.open = false;
      syncNotifOpenClass();
    }
    document.addEventListener(
      "pointerdown",
      function (ev) {
        if (typeof ev.button === "number" && ev.button !== 0) return;
        var t = ev.target;
        if (!t || !t.closest) return;
        var opens = bar.querySelectorAll(
          "details.vc-snav-details[open], details.vc-notif-dropdown[open]",
        );
        if (!opens.length) return;
        for (var i = 0; i < opens.length; i++) {
          if (opens[i].contains(t)) return;
        }
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
    syncNotifOpenClass();
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

  function initSocialPreviews() {
    var links = document.querySelectorAll('a[href*="instagram.com"], a[href*="tiktok.com"]');
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
    animateNode(node, 0, to, kind, readDuration(node));
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
  var PENDING_LOGIN_NOTIF_KEY = "vc_pending_login_notification_v1";
  var NOTIFICATIONS_PATH = "/notifications/";
  var DEMO_ID = "__vc_ephemeral_demo__";
  var ephemeralDemo = null;
  var currentUserId = "";
  var siteNotifsTimer = null;
  var siteRealtimeWs = null;
  var siteRealtimeWsReconnectTimer = null;
  var SITE_NOTIFS_POLL_MS = 300000;
  /** Milliseconds the toast stays visible before flying to the bell. */
  var NOTIF_FLY_READ_MS = 4000;
  /** Fly animation duration (ms); match .vc-notif-fly-card--run in vc-landing.css. */
  var NOTIF_FLY_ANIM_MS = 1100;
  var notifFlyActiveCount = 0;
  var notifAudioCtx = null;
  var notifAudioUnlocked = false;
  var DISCORD_ACCESS_TOKEN_KEY = "vc_discord_access_token";
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
  function saveDismissedSet(setLike, userId) {
    var key = userDismissedKey(userId);
    if (!key) return;
    var arr = Array.from(setLike || []).filter(Boolean);
    if (arr.length > 500) arr = arr.slice(arr.length - 500);
    try {
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {}
  }
  function markDismissed(id, userId) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var set = loadDismissedSet(userId);
    set.add(sid);
    saveDismissedSet(set, userId);
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
    return buildStableNotifId(p, ownerId, kind, openUrl);
  }
  function isAutoClientNotifId(id) {
    return String(id || "").indexOf("auto:") === 0;
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
  function loadStored() {
    var key = userStorageKey();
    if (!key) return [];
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function saveStored(items) {
    var key = userStorageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(items));
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
    return "fa-bell-o";
  }
  function notificationsPageUrl() {
    try {
      return new URL(NOTIFICATIONS_PATH, window.location.origin).toString();
    } catch (e) {
      return NOTIFICATIONS_PATH;
    }
  }

  /** Swipe verticale sul foglio mobile: giù chiude, su apre /notifications/. */
  function applyNotifSheetSwipeDelta(dy, dd) {
    if (!dd || !dd.open) return false;
    if (Math.abs(dy) < 52) return false;
    if (dy > 0) {
      dd.removeAttribute("open");
      return true;
    }
    try {
      dd.removeAttribute("open");
    } catch (e) {}
    window.location.href = notificationsPageUrl();
    return true;
  }

  function bindNotifBackdropSwipe(bd, dd) {
    var y0 = 0;
    var track = false;
    bd.addEventListener(
      "touchstart",
      function (ev) {
        if (!isMobileNotifViewport() || !dd.open) return;
        if (ev.touches.length !== 1) return;
        y0 = ev.touches[0].clientY;
        track = true;
      },
      { passive: true },
    );
    bd.addEventListener(
      "touchend",
      function (ev) {
        if (!track) return;
        track = false;
        if (!isMobileNotifViewport() || !dd.open) return;
        var t = ev.changedTouches && ev.changedTouches[0];
        if (!t) return;
        applyNotifSheetSwipeDelta(t.clientY - y0, dd);
      },
      { passive: true },
    );
    bd.addEventListener(
      "touchcancel",
      function () {
        track = false;
      },
      { passive: true },
    );
  }

  function wireNotifSheetSwipeGestures(dd) {
    if (!dd || dd.dataset.vcNotifSwipe === "1") return;
    var panel = dd.querySelector(".vc-notif-panel");
    if (!panel) return;
    if (panel.querySelector(".vc-notif-sheet-handle")) {
      dd.dataset.vcNotifSwipe = "1";
      return;
    }
    dd.dataset.vcNotifSwipe = "1";
    var handle = document.createElement("div");
    handle.className = "vc-notif-sheet-handle";
    handle.setAttribute("aria-hidden", "true");
    panel.insertBefore(handle, panel.firstChild);
    var hy0 = 0;
    var hTrack = false;
    handle.addEventListener(
      "touchstart",
      function (ev) {
        if (!isMobileNotifViewport() || !dd.open) return;
        if (ev.touches.length !== 1) return;
        hy0 = ev.touches[0].clientY;
        hTrack = true;
      },
      { passive: true },
    );
    handle.addEventListener(
      "touchend",
      function (ev) {
        if (!hTrack) return;
        hTrack = false;
        if (!isMobileNotifViewport() || !dd.open) return;
        var t = ev.changedTouches && ev.changedTouches[0];
        if (!t) return;
        applyNotifSheetSwipeDelta(t.clientY - hy0, dd);
      },
      { passive: true },
    );
    handle.addEventListener(
      "touchcancel",
      function () {
        hTrack = false;
      },
      { passive: true },
    );
  }
  function timeAgoIt(atMs) {
    var s = Math.floor((Date.now() - atMs) / 1000);
    if (s < 45) return "Ora";
    var m = Math.floor(s / 60);
    if (m < 60) return m === 1 ? "1 minuto fa" : m + " minuti fa";
    var h = Math.floor(m / 60);
    if (h < 24) return h === 1 ? "1 ora fa" : h + " ore fa";
    var d = Math.floor(h / 24);
    if (d < 7) return d === 1 ? "1 giorno fa" : d + " giorni fa";
    return "Più di una settimana fa";
  }
  function render() {
    var root = document.getElementById("vc-notif-dropdown");
    var listEl = document.getElementById("vc-notif-list");
    var badge = document.getElementById("vc-notif-badge");
    var sub = document.getElementById("vc-notif-unread-sub");
    if (!root || !listEl || !badge || !sub) return;
    var all = rows();
    var unread = all.filter(function (n) {
      return !n.read;
    }).length;
    if (unread > 0) {
      badge.hidden = false;
      badge.textContent = unread > 99 ? "99+" : String(unread);
    } else {
      badge.hidden = true;
    }
    sub.textContent = unread + " non lette";
    if (all.length > 0) root.classList.add("vc-notif-dropdown--has-items");
    else root.classList.remove("vc-notif-dropdown--has-items");
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
      time.textContent = timeAgoIt(n.at || Date.now());
      main.appendChild(title);
      main.appendChild(desc);
      main.appendChild(time);
      var dot = document.createElement("span");
      dot.className = "vc-notif-item-dot";
      if (n.read) dot.setAttribute("aria-hidden", "true");
      else dot.setAttribute("aria-label", "Non letta");
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
        return Object.assign({}, x, { read: true });
      }),
    );
    markAllSiteNotificationsReadOnServer();
    render();
  }
  function clearAll() {
    ephemeralDemo = null;
    var uid = normalizeUserId(currentUserId);
    saveStored([]);
    saveDismissedSet(new Set(), uid);
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
    saveStored(
      loadStored().map(function (x) {
        if (x.id === id) return Object.assign({}, x, { read: true });
        return x;
      }),
    );
    markSiteNotificationReadOnServer(id);
    render();
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
    if (notifAudioUnlocked) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!notifAudioCtx) notifAudioCtx = new AC();
      if (notifAudioCtx.state === "suspended" && typeof notifAudioCtx.resume === "function") {
        notifAudioCtx.resume();
      }
      notifAudioUnlocked = true;
    } catch (e) {}
  }

  function playNotifSound() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!notifAudioCtx) notifAudioCtx = new AC();
      if (notifAudioCtx.state === "suspended") return;
      var now = notifAudioCtx.currentTime;
      var osc = notifAudioCtx.createOscillator();
      var gain = notifAudioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1244, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain);
      gain.connect(notifAudioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {}
  }

  function showNotifFlyToast(row) {
    var bell = document.querySelector("#vc-notif-dropdown summary.vc-notif-summary");
    if (!bell) return;
    var title = row && row.title ? String(row.title) : "Nuova notifica";
    var body = row && row.body ? String(row.body) : "";
    if (body.length > 80) body = body.slice(0, 79) + "…";
    var root = document.createElement("div");
    root.className = "vc-notif-fly-card";
    root.setAttribute("role", "status");
    var t = document.createElement("strong");
    t.className = "vc-notif-fly-card__t";
    t.textContent = title;
    var b = document.createElement("span");
    b.className = "vc-notif-fly-card__b";
    b.textContent = body;
    root.appendChild(t);
    root.appendChild(b);
    document.body.appendChild(root);
    notifFlyActiveCount += 1;
    syncGlobalNotifOverlayClass();
    function applyFlyVars() {
      var br = bell.getBoundingClientRect();
      var cr = root.getBoundingClientRect();
      var sx = br.left + br.width / 2;
      var sy = br.top + br.height / 2;
      var cx = cr.left + cr.width / 2;
      var cy = cr.top + cr.height / 2;
      root.style.setProperty("--vc-fly-tx", String(sx - cx) + "px");
      root.style.setProperty("--vc-fly-ty", String(sy - cy) + "px");
    }
    applyFlyVars();
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      try {
        root.remove();
      } catch (e2) {}
      notifFlyActiveCount = Math.max(0, notifFlyActiveCount - 1);
      syncGlobalNotifOverlayClass();
      pulseNotifSummary();
    }
    window.setTimeout(function () {
      if (finished) return;
      applyFlyVars();
      window.requestAnimationFrame(function () {
        if (finished) return;
        root.classList.add("vc-notif-fly-card--run");
        root.addEventListener("animationend", finish, { once: true });
      });
    }, NOTIF_FLY_READ_MS);
    window.setTimeout(finish, NOTIF_FLY_READ_MS + NOTIF_FLY_ANIM_MS + 600);
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
    s.unshift(item);
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
      return window.matchMedia("(max-width: 639.98px)").matches;
    } catch (e) {
      return (window.innerWidth || 999) <= 640;
    }
  }

  function syncNotifMobileSheetChrome() {
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return;
    var root = document.documentElement;
    if (dd.open && isMobileNotifViewport()) {
      try {
        root.classList.add("vc-notif-sheet-open");
      } catch (e0) {}
      if (!dd.querySelector(".vc-notif-mobile-backdrop")) {
        var bd = document.createElement("div");
        bd.className = "vc-notif-mobile-backdrop";
        bd.setAttribute("aria-hidden", "true");
        bd.addEventListener("click", function () {
          dd.removeAttribute("open");
        });
        bindNotifBackdropSwipe(bd, dd);
        dd.insertBefore(bd, dd.firstChild);
      }
    } else {
      try {
        root.classList.remove("vc-notif-sheet-open");
      } catch (e1) {}
      var oldBd = dd.querySelector(".vc-notif-mobile-backdrop");
      if (oldBd) oldBd.remove();
    }
    syncGlobalNotifOverlayClass();
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
  function siteRealtimeWsUrl() {
    var c = typeof window !== "undefined" && window.__VC_SITE_NOTIFS ? window.__VC_SITE_NOTIFS : {};
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
        stopSiteNotifsPoll();
        syncSiteNotificationsFromServer();
      };
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || "{}"));
          if (data.type === "notifications_changed" || data.type === "realtime_hello") {
            syncSiteNotificationsFromServer();
          }
        } catch (e3) {}
      };
      ws.onclose = function () {
        siteRealtimeWs = null;
        if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
          stopSiteNotifsPoll();
          siteNotifsTimer = setInterval(syncSiteNotificationsFromServer, SITE_NOTIFS_POLL_MS);
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
      return String(localStorage.getItem(DISCORD_ACCESS_TOKEN_KEY) || "").trim();
    } catch (e) {
      return "";
    }
  }
  function markSiteNotificationReadOnServer(id) {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    var sid = String(id || "").trim();
    if (!token || !uid || !sid) return;
    fetch(resolvedSiteNotificationsReadUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify({ id: sid }),
    }).catch(function () {});
  }
  function markAllSiteNotificationsReadOnServer() {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if (!token || !uid) return;
    fetch(resolvedSiteNotificationsReadUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify({ all: true }),
    }).catch(function () {});
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
    var oldIdMap = {};
    for (var oi = 0; oi < oldItems.length; oi += 1) {
      var oix = oldItems[oi];
      var oid = String((oix && oix.id) || "").trim();
      if (oid) oldIdMap[oid] = true;
    }
    var serverIdMap = {};
    var fromServer = [];
    for (var i = 0; i < list.length; i += 1) {
      var row = list[i];
      if (!row || !row.title) continue;
      var sid = String(row.id || "").trim();
      if (!sid) continue;
      serverIdMap[sid] = true;
      fromServer.unshift(mapServerRowToStoredItem(row));
    }
    var dismissed = loadDismissedSet(uid);
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
    saveStored(keepLocal.concat(fromServer));
    var freshMs = 600000;
    var toastRow = null;
    for (var ti = 0; ti < fromServer.length; ti += 1) {
      var fr = fromServer[ti];
      if (!fr) continue;
      var frid = String(fr.id || "").trim();
      if (!frid || oldIdMap[frid]) continue;
      if (Date.now() - (fr.at || 0) < freshMs) {
        toastRow = {
          id: fr.id,
          title: fr.title,
          body: fr.body,
          kind: fr.kind,
          at: fr.at,
          read: fr.read,
          openUrl: fr.openUrl,
        };
        break;
      }
    }
    return toastRow;
  }
  function syncSiteNotificationsFromServer() {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if (!token || !uid) return;
    var url = resolvedSiteNotificationsUrl();
    fetch(url, { headers: { Authorization: "Bearer " + token }, credentials: "omit" })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j || j.ok !== true || !Array.isArray(j.items)) return;
        var list = j.items.slice().reverse();
        var toastRow = mergeStoredWithServerNotificationList(list, uid);
        render();
        if (toastRow) {
          playNotifSound();
          window.requestAnimationFrame(function () {
            showNotifFlyToast(toastRow);
          });
        }
      })
      .catch(function () {});
  }
  function scheduleSiteNotificationsPolling() {
    stopSiteNotifsPoll();
    disconnectSiteRealtimeWs();
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    syncSiteNotificationsFromServer();
    var rs = siteRealtimeWs ? siteRealtimeWs.readyState : 3;
    if (rs !== 0 && rs !== 1) connectSiteRealtimeWebSocket();
    if (!siteRealtimeWs || siteRealtimeWs.readyState !== 1) {
      siteNotifsTimer = setInterval(syncSiteNotificationsFromServer, SITE_NOTIFS_POLL_MS);
    }
  }
  function wireNotifMobileSheet() {
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return;
    wireNotifSheetSwipeGestures(dd);
    dd.addEventListener("toggle", syncNotifMobileSheetChrome);
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
      closeM.setAttribute("aria-label", "Chiudi");
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
  }
  window.addEventListener("vc-discord-profile", function (ev) {
    setCurrentUser(ev && ev.detail ? ev.detail.user : null);
    render();
    syncGlobalNotifOverlayClass();
    flushPendingLoginNotification();
    if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
      scheduleSiteNotificationsPolling();
    } else {
      stopSiteNotifsPoll();
      disconnectSiteRealtimeWs();
    }
  });
  window.addEventListener("beforeunload", function () {
    stopSiteNotifsPoll();
    disconnectSiteRealtimeWs();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && normalizeUserId(currentUserId) && getDiscordAccessToken()) {
      syncSiteNotificationsFromServer();
    }
  });
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

  function createTileFromRow(row) {
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
    a.addEventListener("click", function () {
      closeDrawer();
    });
    return a;
  }

  function createTileFromItem(item) {
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
        sec2.appendChild(h2);
        sec2.appendChild(g2);
        gridRoot.appendChild(sec2);
      }
      i += 1;
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
    });
  }

  function init() {
    ensure();
    var m = getMq();
    if (m.addEventListener) m.addEventListener("change", onMqChange);
    else if (m.addListener) m.addListener(onMqChange);
    syncDrawerFooter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();