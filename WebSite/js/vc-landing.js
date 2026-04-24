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
    var cookiePolicyUrl = "/cookie/";

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
      '<h2 id="vc-necessity-title">Utilizzo dei Cookie</h2>' +
      '<p>Usiamo solo cookie tecnici essenziali per login, sicurezza e corretto funzionamento del sito.</p>' +
      "</div>" +
      '<button type="button" class="vc-necessity-banner__close" data-vc-necessity-dismiss aria-label="Chiudi avviso cookie">' + closeIcon + "</button>" +
      "</div>" +
      '<div class="vc-necessity-banner__body">' +
      '<div class="vc-necessity-banner__scroll">' +
      '<div class="vc-necessity-banner__notice">' +
      '<span class="vc-necessity-banner__noticeico" aria-hidden="true">' + infoIcon + "</span>" +
      '<p><strong>Cookie necessari.</strong> Servono per login, sicurezza, preferenza banner e funzioni base. Nessun uso marketing.</p>' +
      "</div>" +
      '<details class="vc-necessity-banner__details">' +
      '<summary><span><span class="vc-necessity-banner__summaryico" aria-hidden="true">' + shieldIcon + '</span> Dettagli tecnici</span><span class="vc-necessity-banner__chev" aria-hidden="true">' + chevIcon + "</span></summary>" +
      '<div class="vc-necessity-banner__tech">' +
      '<div><span class="vc-necessity-banner__techico" aria-hidden="true">' + lockIcon + '</span><span><strong>Session Token</strong><small>Mantiene il login attivo fino a 90 giorni</small></span></div>' +
      '<div><span class="vc-necessity-banner__techico" aria-hidden="true">' + lockIcon + '</span><span><strong>CSRF Token</strong><small>Protezione da attacchi informatici</small></span></div>' +
      '<div><span class="vc-necessity-banner__techico" aria-hidden="true">' + lockIcon + '</span><span><strong>OAuth State</strong><small>Autenticazione Discord sicura</small></span></div>' +
      '<div><span class="vc-necessity-banner__techico" aria-hidden="true">' + lockIcon + '</span><span><strong>Preferenza banner</strong><small>Ricorda la scelta per 180 giorni</small></span></div>' +
      '<div class="vc-necessity-banner__chips"><span>HttpOnly</span><span>Secure</span><span>SameSite</span><span>Crittografati</span></div>' +
      '<a href="' + cookiePolicyUrl + '">Leggi la Cookie Policy completa <span aria-hidden="true">&rarr;</span></a>' +
      "</div>" +
      "</details>" +
      "</div>" +
      '<div class="vc-necessity-banner__dock">' +
      '<div class="vc-necessity-banner__actions">' +
      '<button type="button" class="vc-necessity-banner__accept" data-vc-necessity-confirm>Accetta</button>' +
      '<a class="vc-necessity-banner__link" href="' + cookiePolicyUrl + '">Cookie Policy</a>' +
      "</div>" +
      '<p class="vc-necessity-banner__foot"><strong>Accetta</strong> o la <strong>X</strong> in alto: salvano la stessa preferenza (180 giorni) e nascondono l’avviso. Se chiudi il sito senza fare nulla, alla prossima visita l’avviso compare di nuovo.</p>' +
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

  function isInternalNavigableLink(a) {
    if (!a || !a.getAttribute) return false;
    var hrefAttr = String(a.getAttribute("href") || "").trim();
    if (!hrefAttr || hrefAttr.charAt(0) === "#") return false;
    if (/^(mailto|tel|javascript):/i.test(hrefAttr)) return false;
    var target = String(a.getAttribute("target") || "").toLowerCase();
    if (target && target !== "_self") return false;
    if (a.hasAttribute("download")) return false;
    try {
      var url = new URL(hrefAttr, window.location.href);
      if (url.origin !== window.location.origin) return false;
      var current = window.location.pathname + window.location.search;
      var next = url.pathname + url.search;
      if (current === next && (url.hash || "").length > 0) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

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
      if (!isInternalNavigableLink(a)) return;
      ev.preventDefault();
      var nextHref = a.href;
      showTransitionOverlay("page");
      afterOverlayPaint(function () {
        navigateToHref(nextHref);
      });
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
    var p = String(path || "");
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p;
  }

  function markSnavDetailsCurrentFromLocation() {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    var cur = normalizePathname(window.location.pathname);
    bar.querySelectorAll("details.vc-snav-details").forEach(function (det) {
      var hit = false;
      det.querySelectorAll("a.vc-snav-row").forEach(function (a) {
        if (a.classList.contains("vc-snav-row--active") || a.getAttribute("aria-current") === "page") {
          hit = true;
          return;
        }
        var href = a.getAttribute("href");
        if (!href || href.charAt(0) === "#") return;
        try {
          var u = new URL(href, window.location.href);
          if (u.origin !== window.location.origin) return;
          if (normalizePathname(u.pathname) === cur) hit = true;
        } catch (e) {}
      });
      if (hit) det.classList.add("vc-snav-details--current");
    });
  }

  function initHeaderNavAccordion() {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    var detailsList = bar.querySelectorAll("details.vc-snav-details");
    var notif = bar.querySelector("details.vc-notif-dropdown");
    detailsList.forEach(function (d) {
      d.addEventListener("toggle", function () {
        if (!d.open) return;
        detailsList.forEach(function (other) {
          if (other !== d) other.open = false;
        });
        if (notif) notif.open = false;
      });
    });
    if (notif) {
      notif.addEventListener("toggle", function () {
        if (!notif.open) return;
        detailsList.forEach(function (other) {
          other.open = false;
        });
      });
    }
    function closeAllHeaderDropdowns() {
      detailsList.forEach(function (d) {
        d.open = false;
      });
      if (notif) notif.open = false;
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
    markSnavDetailsCurrentFromLocation();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeaderNavAccordion);
  } else {
    initHeaderNavAccordion();
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

  function formatValue(raw, kind) {
    var n = Number(raw);
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (kind === "hours") return String(n.toFixed(1)).replace(".", ",") + "h";
    if (kind === "percent") return String(Math.round(n)) + "%";
    if (kind === "plain") return String(Math.round(n));
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
  var PENDING_LOGIN_NOTIF_KEY = "vc_pending_login_notification_v1";
  var NOTIFICATIONS_PATH = "/notifications/";
  var DEMO_ID = "__vc_ephemeral_demo__";
  var ephemeralDemo = null;
  var currentUserId = "";
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
  function setCurrentUser(user) {
    currentUserId = normalizeUserId(user && user.id);
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
    if (kind === "vote") return "fa-check-square-o";
    if (kind === "success") return "fa-check-circle-o";
    return "fa-info-circle";
  }
  function notificationsPageUrl() {
    try {
      return new URL(NOTIFICATIONS_PATH, window.location.origin).toString();
    } catch (e) {
      return NOTIFICATIONS_PATH;
    }
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
    render();
  }
  function clearAll() {
    ephemeralDemo = null;
    saveStored([]);
    render();
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
    render();
  }
  function addNotif(p) {
    var ownerId = normalizeUserId((p && p.userId) || currentUserId);
    if (!ownerId) return;
    var kindRaw = p && p.kind;
    var kind =
      kindRaw === "vote" ? "vote" : kindRaw === "success" ? "success" : "info";
    var openUrl = "";
    if (p && typeof p.openUrl === "string") openUrl = String(p.openUrl).trim();
    var item = {
      id: String(Date.now()) + "-" + String(Math.floor(Math.random() * 1e9)),
      title: String((p && p.title) || ""),
      body: String((p && p.body) || ""),
      at: typeof (p && p.at) === "number" ? p.at : Date.now(),
      read: false,
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
    s.unshift(item);
    try {
      localStorage.setItem(key, JSON.stringify(s));
    } catch (e2) {}
    render();
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
  function init() {
    setCurrentUser(window.__VC_DISCORD_PROFILE || null);
    render();
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
        if (id) markOneRead(id);
      });
    }
    window.vcNotify = { add: addNotif, refresh: render };
    flushPendingLoginNotification();
  }
  window.addEventListener("vc-discord-profile", function (ev) {
    setCurrentUser(ev && ev.detail ? ev.detail.user : null);
    render();
    flushPendingLoginNotification();
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();