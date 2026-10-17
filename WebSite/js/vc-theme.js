/**
 * themeSync1: light|dark|auto synced across devices via site-chrome-prefs.
 * emojiColorFix3: titleGrad skips boards hero + .vc-emoji
 * pageHang1: no CSS move/rebuild storm on html class churn (“La pagina non risponde”)
 */
(function vcTheme() {
  if (window.__vcTheme) return;

  var STORAGE_KEY = "vc-theme-pref";
  var THEME_LIGHT = "#efe6dc";
  var THEME_DARK = "#140f0c";
  /* lightDarkParity5d: stesso stack dark (fill+conic bordo) invertito cream+mocha */
  var LIGHT_WASH =
    "radial-gradient(120% 90% at 0% 0%, rgba(255, 248, 238, 0.85), transparent 52%)," +
    "radial-gradient(90% 70% at 100% 0%, rgba(212, 168, 136, 0.22), transparent 48%)," +
    "linear-gradient(175deg, #fffaf4 0%, #f7f1ea 55%, #efe6dc 100%)," +
    "conic-gradient(from 0deg,rgba(111, 78, 55, 0.72) 0deg, rgba(180, 130, 90, 0.55) 90deg, rgba(139, 99, 70, 0.58) 180deg, rgba(180, 130, 90, 0.55) 270deg, rgba(111, 78, 55, 0.72) 360deg)";
  var applyingRemoteTheme = false;

  function systemIsDark() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (e) {
      return true;
    }
  }

  function normalizePref(raw) {
    var p = String(raw || "").trim().toLowerCase();
    if (p === "light" || p === "dark" || p === "auto") return p;
    return "";
  }

  /* swLsStorm2: theme pref in RAM — apply() lo rileggeva a raffica */
  var prefMem = null;
  var prefMemReady = false;

  function readPref() {
    if (prefMemReady && prefMem) return prefMem;
    try {
      var p = normalizePref(localStorage.getItem(STORAGE_KEY) || "auto");
      if (p) {
        prefMem = p;
        prefMemReady = true;
        return p;
      }
    } catch (e) {}
    prefMem = "auto";
    prefMemReady = true;
    return "auto";
  }

  function writePref(pref) {
    prefMem = normalizePref(pref) || "auto";
    prefMemReady = true;
    try {
      localStorage.setItem(STORAGE_KEY, prefMem);
    } catch (e) {}
  }

  function publishTheme(pref) {
    if (applyingRemoteTheme) return;
    try {
      if (window.__VC_CHROME_SYNC && typeof window.__VC_CHROME_SYNC.publish === "function") {
        window.__VC_CHROME_SYNC.publish({ theme: pref });
      }
    } catch (ePub) {}
  }

  function applyRemoteTheme(prefs) {
    if (!prefs) return;
    var remote = normalizePref(prefs.theme);
    if (!remote) return;
    if (remote === readPref()) return;
    applyingRemoteTheme = true;
    try {
      writePref(remote);
      apply(remote);
    } finally {
      applyingRemoteTheme = false;
    }
  }

  function bindChromeThemeSync() {
    if (window.__vcThemeChromeBound) return;
    function attach() {
      var sync = window.__VC_CHROME_SYNC;
      if (!sync || typeof sync.subscribe !== "function") return false;
      window.__vcThemeChromeBound = true;
      sync.subscribe(function (prefs, source) {
        applyRemoteTheme(prefs);
        /* themeSync1: migra tema locale → account solo dopo pull se server non ne ha */
        if (
          (source === "server" || source === "blocked") &&
          (!prefs || !normalizePref(prefs.theme))
        ) {
          publishTheme(readPref());
        }
      });
      try {
        var mirror = typeof sync.get === "function" ? sync.get() || {} : {};
        if (mirror.theme) applyRemoteTheme(mirror);
      } catch (eBoot) {}
      return true;
    }
    if (attach()) return;
    var tries = 0;
    var timer = window.setInterval(function () {
      tries += 1;
      if (attach() || tries >= 40) {
        try {
          clearInterval(timer);
        } catch (eClr) {}
      }
    }, 250);
    window.addEventListener("vc-discord-profile", function () {
      attach();
    });
  }

  function resolve(pref) {
    var p = pref || readPref();
    if (p === "light") return "light";
    if (p === "dark") return "dark";
    return systemIsDark() ? "dark" : "light";
  }

  function setThemeColor(resolved) {
    try {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", resolved === "light" ? THEME_LIGHT : THEME_DARK);
    } catch (e) {}
  }

  function syncSwitchers(resolved) {
    var mode = resolved || resolve(readPref());
    var nodes = document.querySelectorAll("[data-vc-theme-switch]");
    for (var i = 0; i < nodes.length; i++) {
      var root = nodes[i];
      root.setAttribute("data-mode", mode);
      root.setAttribute("aria-checked", mode === "dark" ? "true" : "false");
      root.setAttribute(
        "aria-label",
        mode === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro"
      );
      root.setAttribute("title", mode === "dark" ? "Tema scuro" : "Tema chiaro");
    }
  }

  function switchHtml() {
    return (
      '<button type="button" class="vc-theme-switch" data-vc-theme-switch data-vc-theme-toggle role="switch" aria-checked="false" aria-label="Cambia tema">' +
      '<span class="vc-theme-switch__track" aria-hidden="true">' +
      '<svg class="vc-theme-switch__sun vc-theme-switch__icon--track" viewBox="0 0 24 24" width="14" height="14" focusable="false">' +
      '<circle cx="12" cy="12" r="4" fill="currentColor"/>' +
      '<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' +
      '<path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>' +
      "</g></svg>" +
      '<svg class="vc-theme-switch__moon vc-theme-switch__icon--track" viewBox="0 0 24 24" width="14" height="14" focusable="false">' +
      '<path fill="currentColor" d="M20.2 14.1A8.2 8.2 0 0 1 9.9 3.8 8.5 8.5 0 1 0 20.2 14.1z"/>' +
      "</svg>" +
      '<span class="vc-theme-switch__knob">' +
      '<svg class="vc-theme-switch__sun vc-theme-switch__icon--knob" viewBox="0 0 24 24" width="13" height="13" focusable="false">' +
      '<circle cx="12" cy="12" r="4" fill="currentColor"/>' +
      '<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' +
      '<path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>' +
      "</g></svg>" +
      '<svg class="vc-theme-switch__moon vc-theme-switch__icon--knob" viewBox="0 0 24 24" width="13" height="13" focusable="false">' +
      '<path fill="currentColor" d="M20.2 14.1A8.2 8.2 0 0 1 9.9 3.8 8.5 8.5 0 1 0 20.2 14.1z"/>' +
      "</svg>" +
      "</span></span></button>"
    );
  }

  function placeSwitcher(legal, node) {
    if (!legal || !node) return;
    var nav = legal.querySelector(":scope > nav");
    if (nav) legal.insertBefore(node, nav);
    else legal.appendChild(node);
  }

  function upgradeOrInject(legal) {
    var existing = legal.querySelector("[data-vc-theme-switch]");
    var wrap = document.createElement("div");
    wrap.innerHTML = switchHtml();
    var node = wrap.firstChild;
    if (!node) return;
    if (existing) existing.replaceWith(node);
    var p = legal.querySelector(":scope > p");
    var nav = legal.querySelector(":scope > nav");
    if (nav) legal.insertBefore(node, nav);
    else if (p && p.nextSibling) legal.insertBefore(node, p.nextSibling);
    else if (!node.parentNode) legal.appendChild(node);
  }

  function ensureSwitcherInFooter() {
    var legals = document.querySelectorAll(".vc-premium-footer__legal");
    for (var i = 0; i < legals.length; i++) upgradeOrInject(legals[i]);
    syncSwitchers(resolve(readPref()));
  }


  /* themeSwitchAlways1: layout switcher sempre (dark mode non ha theme-light) */
  var THEME_SWITCH_VER = "20261006themeScrollFix1";
  function ensureThemeSwitchCss() {
    try {
      var id = "vc-theme-switch-css";
      var link = document.getElementById(id);
      if (!link) link = document.querySelector('link[href*="vc-theme-switch.css"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "stylesheet";
        link.id = id;
        link.href = "/css/vc-theme-switch.css?v=" + THEME_SWITCH_VER;
        (document.head || document.documentElement).appendChild(link);
      } else {
        link.id = id;
        if (String(link.href || "").indexOf(THEME_SWITCH_VER) === -1) {
          link.href = "/css/vc-theme-switch.css?v=" + THEME_SWITCH_VER;
        }
      }
      link.media = "all";
      try {
        link.disabled = false;
      } catch (eEn) {}
      return link;
    } catch (eSwCss) {
      return null;
    }
  }

  /* bootFast1ThemeLightOnDemand + bootPerfAll1: dark = zero download theme-light */
  var THEME_LIGHT_VER = "20261013bootPerfAll1";
  function ensureThemeLightCss(enable) {
    try {
      var link = document.getElementById("vc-theme-light-css");
      if (!link) link = document.querySelector('link[href*="vc-theme-light.css"]');
      if (!link) {
        if (!enable) return null;
        link = document.createElement("link");
        link.rel = "stylesheet";
        link.id = "vc-theme-light-css";
        link.href = "/css/vc-theme-light.css?v=" + THEME_LIGHT_VER;
        (document.head || document.documentElement).appendChild(link);
      }
      link.id = "vc-theme-light-css";
      if (enable) {
        link.media = "all";
        link.disabled = false;
        try {
          link.removeAttribute("data-vc-defer-css");
        } catch (eRm) {}
      } else {
        link.media = "not all";
        try { link.disabled = true; } catch (eDis) {}
      }
      return link;
    } catch (eEns) {
      return null;
    }
  }

  function pinThemeCssLast() {
    try {
      if (resolve(readPref()) !== "light") {
        ensureThemeLightCss(false);
        return;
      }
      ensureThemeLightCss(true);
      /* pageHang1: dopo il primo pin stabile non muovere più i link CSS (recalc totale) */
      if (pinThemeCssLast._done) return;
      if (pinThemeCssLast._busy) return;
      var theme = document.getElementById("vc-theme-light-css");
      if (!theme) theme = document.querySelector('link[href*="vc-theme-light.css"]');
      if (!theme || !theme.parentNode) return;
      theme.id = "vc-theme-light-css";
      var runtime = document.getElementById("vc-theme-light-runtime");
      var head = document.head;
      if (!head) return;
      /* lightPerf1: gia' in coda → no move (no MutationObserver storm) */
      var last = head.lastElementChild;
      if (runtime && last === runtime && runtime.previousElementSibling === theme) {
        pinThemeCssLast._done = 1;
        return;
      }
      if (!runtime && last === theme) {
        pinThemeCssLast._done = 1;
        return;
      }
      pinThemeCssLast._busy = true;
      head.appendChild(theme);
      if (runtime) head.appendChild(runtime);
      try {
        var emojiCss = document.getElementById("vc-emoji-color-css");
        if (!emojiCss) emojiCss = document.querySelector('link[href*="vc-emoji-color.css"]');
        if (emojiCss && !pinThemeCssLast._emojiPinned) {
          pinThemeCssLast._emojiPinned = 1;
          var mount = document.body || head;
          mount.appendChild(emojiCss);
        }
      } catch (eEmojiPin) {}
      pinThemeCssLast._busy = false;
      pinThemeCssLast._done = 1;
    } catch (ePin) {
      pinThemeCssLast._busy = false;
    }
  }

  function injectLightRuntime(resolved) {
    var id = "vc-theme-light-runtime";
    var style = document.getElementById(id);
    if (resolved !== "light") {
      if (style && style.parentNode) style.parentNode.removeChild(style);
      injectLightRuntime._built = "";
      return;
    }
    /* lightPerf1 + pageHang1: se già presente NON muovere/riscrivere (appendChild = style recalc → hang) */
    if (
      style &&
      style.parentNode &&
      style.getAttribute("data-vc-light-rt") === "pageHang1" &&
      style.textContent
    ) {
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = id;
    }
    var wash =
      "background-color:#faf6f0!important;background-image:" +
      LIGHT_WASH +
      "!important;background-origin:padding-box,padding-box,padding-box,border-box!important;" +
      "background-clip:padding-box,padding-box,padding-box,border-box!important;" +
      "-webkit-background-clip:padding-box,padding-box,padding-box,border-box!important;" +
      "border:1px solid transparent!important;border-color:transparent!important;" +
      "box-shadow:none!important;filter:none!important;color:#2a1c14!important;";
    var ink =
      "background:none!important;background-image:none!important;" +
      "-webkit-background-clip:border-box!important;background-clip:border-box!important;" +
      "color:#2a1c14!important;-webkit-text-fill-color:#2a1c14!important;text-shadow:none!important;filter:none!important;";
    var titleGrad =
      "background-color:transparent!important;background-image:var(--vc-look-grad-title)!important;" +
      "-webkit-background-clip:text!important;background-clip:text!important;" +
      "color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;filter:none!important;";
    if (!injectLightRuntime._built) {
    style.textContent =
      /* boardsSchedaBgFade2: non dipingere cream sul fill scheda bacheca */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off):not(.vc-boards-page-banner-bg) body.vc-body,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off):not(.vc-boards-page-banner-bg) body.vc-body#top,' +
      'html[data-vc-theme="light"]:not(.vc-boards-page-banner-bg) body.vc-body{' +
      "color:#2a1c14!important;background-color:#efe6dc!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-hero-head,.vc-home-deck,.vc-home-index," +
      ".vc-home-feature,.vc-home-highlights,.vc-home-highlight-card,.vc-faq-group,.vc-legal-card," +
      ".vc-regole-card,.vc-sponsor-card,.vc-perks-card,.vc-role-card,.vc-roles-card,.vc-roles-hero-guide,.vc-ul-card," +
      ".vc-reviews-card:not(.vc-reviews-stage__card),.vc-candidature-card,.vc-auth-required-card,.vc-staff-hub-card,.vc-staff-block," +
      ".vc-staff-manage-detail,.vc-staff-manage-board,.vc-staff-organico-history,.vc-staff-organico-board," +
      ".vc-vote-platform-card,.vc-vote-live-shell,.vc-wiki-cmd-shell,.vc-cmd-acc,.vc-wt-sidebar," +
      ".vc-feedback-card,.vc-user-profile-block,.vc-snav-panel,.vc-lang-panel,.vc-notif-panel," +
      ".vc-mobile-nav-drawer,.vc-stat-strip,.vc-support-page-hero,.vc-support-intro-shell," +
      ".vc-reviews-gate__card,.vc-regole-hero-card,.vc-wiki-hero-card,.vc-vote-page-hero)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-page-cine-layout .vc-page-cine-hero .vc-hero-head,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-page-cine-layout :is(.vc-support-page-hero,.vc-auth-required-card,.vc-support-intro-shell),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-staff-organico-page :is(.vc-hero-head,.vc-page-cine-card,.vc-support-page-hero),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-staff-cine-page .vc-support-page-hero,' +
      'html.vc-site-photo-bg.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body :is(.vc-hero-head,.vc-support-page-hero,.vc-auth-required-card),' +
      'html.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-page-cine-layout .vc-page-cine-hero .vc-hero-head,' +
      'html.vc-scroll-busy.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-hero-head,.vc-home-deck,.vc-home-index," +
      ".vc-home-feature,.vc-staff-hub-card,.vc-staff-block,.vc-staff-manage-detail,.vc-staff-organico-history," +
      ".vc-ul-card,.vc-roles-card,.vc-support-page-hero,.vc-auth-required-card)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body main :is(' +
      ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-hero-head,.vc-home-deck,.vc-home-index," +
      ".vc-home-feature,.vc-staff-hub-card,.vc-staff-block,.vc-staff-manage-detail,.vc-staff-organico-history," +
      ".vc-ul-card,.vc-roles-card,.vc-support-page-hero,.vc-auth-required-card,.vc-support-intro-shell)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body header .vc-nav-shell,' +
      'html.vc-site-photo-bg.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body header .vc-nav-shell,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body footer .vc-premium-footer__outer,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body footer .vc-premium-footer__card{' +
      wash +
      "}" +
      /* lightDarkParity5 + emojiColorFix3: skip boards hero title + emoji */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body :is(' +
      "main h1,main h2:not(.vc-boards-form-hero__title),.vc-brand-glow,h1.vc-brand-glow,.vc-page-cine-title,.vc-page-cine-hero h1," +
      ".vc-page-cine-hero .vc-brand-glow,.vc-home-cine-hero h1,.vc-home-cine-hero .vc-brand-glow)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body :is(.vc-brand-glow,.vc-page-cine-title,.vc-page-cine-hero h1) span:not(.vc-emoji):not(.vc-sponsor-emoji){' +
      titleGrad +
      "}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .vc-support-page-hero :is(h1,h2,h3,p,.text-white,span)' +
      ":not(.vc-vote-platform-cta):not(.vc-vote-more-badge):not(.vc-vote-platform-ico):not(.vc-vote-more-btn)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .vc-auth-required-card :is(h1,h2,p,.text-white){' +
      ink +
      "}" +
      /* voteCtaReadable3: CTA sabbia — specificità >= wipe hero span */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .vc-support-page-hero .vc-vote-platform-cta,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top .vc-support-page-hero .vc-vote-platform-cta,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-vote-page .vc-support-page-hero .vc-vote-platform-cta,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .vc-support-page-hero .vc-vote-more-btn--primary,' +
      'html[data-vc-theme="light"] body.vc-vote-page .vc-vote-platform-cta,' +
      'html[data-vc-theme="light"] body.vc-vote-page .vc-vote-more-btn--primary{' +
      "background-color:#d4a888!important;" +
      "background-image:linear-gradient(180deg,#f0dcc8 0%,#d4a888 58%,#b88968 100%),linear-gradient(135deg,rgba(255,247,236,.98) 0%,rgba(236,205,176,.85) 45%,rgba(168,118,82,.95) 100%)!important;" +
      "background-origin:padding-box,border-box!important;background-clip:padding-box,border-box!important;-webkit-background-clip:padding-box,border-box!important;" +
      "border:1px solid transparent!important;color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;" +
      "text-shadow:none!important;filter:none!important;opacity:1!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body :is(' +
      ".vc-page-cine-lead,.vc-hero-about,.vc-muted,.vc-page-cine-kicker){" +
      "color:rgba(42,28,20,.82)!important;-webkit-text-fill-color:rgba(42,28,20,.82)!important;" +
      "background-image:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;}" +
      /* scrollCueLightGrad1: label metal (mirror dark AlignGrad) */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__label,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-page-cine-layout .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__label,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__label{' +
      "background-color:transparent!important;background-image:var(--vc-look-grad-metal,var(--vc-look-grad-title))!important;" +
      "background-size:220% 100%!important;background-position:0% 50%!important;background-repeat:no-repeat!important;" +
      "-webkit-background-clip:text!important;background-clip:text!important;" +
      "color:transparent!important;-webkit-text-fill-color:transparent!important;" +
      "padding:0!important;border-radius:0!important;border:0!important;box-shadow:none!important;text-shadow:none!important;" +
      "filter:drop-shadow(0 1px 0 rgba(255,255,255,.35)) drop-shadow(0 0 8px rgba(111,78,55,.22))!important;" +
      "animation:none!important;opacity:1!important;}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .vc-header-snav,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .vc-header-snav.vc-glass,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body header .vc-header-snav,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body header .vc-header-snav.vc-glass{' +
      "background:transparent!important;background-color:transparent!important;background-image:none!important;border:0!important;box-shadow:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .vc-notif-dropdown-slot--hold,' +
      ".vc-notif-dropdown-slot--hold{display:none!important;width:0!important;height:0!important;min-width:0!important;flex:0 0 0!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body header :is(.vc-icon-btn,.vc-notif-summary,#vc-mobile-nav-toggle){' +
      "background:#f3ebe3!important;border:1px solid rgba(111,78,55,.28)!important;" +
      "box-shadow:0 0 0 1px rgba(212,168,136,.4),0 0 12px rgba(212,168,136,.35)!important;" +
      "color:#3a281c!important;-webkit-text-fill-color:#3a281c!important;filter:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body header .vc-notif-summary > i{' +
      "color:#3a281c!important;opacity:1!important;visibility:visible!important;}" +
      /* themeLightViewAsEye1 → DarkMatch: stesso look dark anche in light */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header #vc-view-as-launch,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header #vc-view-as-launch,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #header-quick-actions #vc-view-as-launch,' +
      'html[data-vc-theme="light"] body.vc-body header #vc-view-as-launch,' +
      'html[data-vc-theme="light"] #vc-view-as-launch{' +
      "background:linear-gradient(180deg,rgba(26,20,15,.94),rgba(16,12,9,.96))!important;background-color:rgba(16,12,9,.96)!important;" +
      "background-image:linear-gradient(180deg,rgba(26,20,15,.94),rgba(16,12,9,.96))!important;" +
      "border:1px solid rgba(245,214,183,.42)!important;" +
      "box-shadow:0 0 0 1.5px rgba(245,214,183,.4),0 0 12px rgba(236,205,176,.42),0 0 22px rgba(168,118,82,.24),inset 0 1px 0 rgba(255,244,232,.08)!important;" +
      "filter:none!important;color:#f7efe4!important;-webkit-text-fill-color:#f7efe4!important;}" +
      'html[data-vc-theme="light"]:not(.vc-auth-logged-out):not(.vc-view-as-guest) #vc-view-as-launch,' +
      'html[data-vc-theme="light"]:not(.vc-auth-logged-out):not(.vc-view-as-guest) body.vc-body header #vc-view-as-launch{' +
      "display:inline-flex!important;visibility:visible!important;opacity:1!important;" +
      "width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;pointer-events:auto!important;}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header #vc-view-as-launch .vcva-eye,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header #vc-view-as-launch .vcva-eye,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header #vc-view-as-launch img,' +
      'html[data-vc-theme="light"] #vc-view-as-launch .vcva-eye,' +
      'html[data-vc-theme="light"] #vc-view-as-launch img{' +
      "width:1.28rem!important;height:1.28rem!important;opacity:1!important;visibility:visible!important;display:block!important;" +
      "background:transparent!important;mix-blend-mode:normal!important;filter:none!important;-webkit-filter:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #stats .vc-stat-staff-chev{' +
      "border-right-color:rgba(90,62,42,.72)!important;border-bottom-color:rgba(90,62,42,.72)!important;opacity:1!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #stats :is(.vc-stat-num,.vc-stat-num-inner,.vc-stat-247){' +
      "background-image:var(--vc-look-grad-title)!important;-webkit-background-clip:text!important;background-clip:text!important;" +
      "color:transparent!important;-webkit-text-fill-color:transparent!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .vc-notif-panel :is(.vc-notif-panel-title,.vc-notif-panel-sub,.vc-notif-empty-title){' +
      "color:#2a1c14!important;-webkit-text-fill-color:#2a1c14!important;background-image:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top .vc-notif-scope-bar,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top .vc-notif-scope-switch__seg,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .vc-notif-panel :is(.vc-notif-scope-bar,.vc-notif-scope-switch__seg){' +
      "background:#efe6dc!important;background-color:#efe6dc!important;background-image:none!important;" +
      "border:1px solid rgba(111,78,55,.22)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.55)!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .vc-notif-panel :is(.vc-notif-cat-bar,.vc-notif-bell-inbox__link),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header :is(.vc-notif-cat-bar,.vc-notif-bell-inbox__link){' +
      "background:#f3ebe3!important;color:#2a1c14!important;border:1px solid rgba(111,78,55,.18)!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .vc-notif-panel :is(.vc-notif-cat-label,.vc-notif-bell-inbox__label,span,i){' +
      "color:#2a1c14!important;-webkit-text-fill-color:#2a1c14!important;background-image:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body footer .vc-premium-footer__legal{' +
      "border-top:1.5px solid rgba(111,78,55,.32)!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body--home .vc-home-deck__cell:hover .vc-home-deck__idx{' +
      "color:rgba(180,120,28,.92)!important;-webkit-text-fill-color:rgba(180,120,28,.92)!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top .vc-hero-kicker,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-hero-kicker{' +
      "background-color:#ead9c6!important;" +
      "background-image:linear-gradient(180deg,#fff8f0 0%,#ead9c6 58%,#dcc4a8 100%),linear-gradient(135deg,rgba(212,168,136,.7),rgba(111,78,55,.45))!important;" +
      "background-origin:padding-box,border-box!important;background-clip:padding-box,border-box!important;-webkit-background-clip:padding-box,border-box!important;" +
      "border:1px solid transparent!important;color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;" +
      "box-shadow:0 0 14px rgba(212,168,136,.35)!important;text-shadow:none!important;filter:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body footer .vc-premium-footer__outer{' +
      "border-radius:1.25rem!important;overflow:hidden!important;" +
      "box-shadow:0 14px 36px rgba(60,40,24,.12),0 0 22px rgba(212,168,136,.14)!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body footer :is(.vc-premium-footer__card,.vc-premium-footer__inner){' +
      "background:transparent!important;background-image:none!important;border:0!important;box-shadow:none!important;border-radius:inherit!important;}" +
      /* Full7b: batte soft-fx :not() chain — emojiColorFix4 skip boards hero */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main :is(' +
      "h1,h2:not(.vc-boards-form-hero__title),.vc-brand-glow,h1.vc-brand-glow,.vc-page-cine-title,.vc-page-cine-hero h1," +
      ".vc-page-cine-hero .vc-brand-glow,.vc-home-cine-hero h1,.vc-home-cine-hero .vc-brand-glow" +
      "):not(button):not(a.vc-header-pill):not(a.horiz-cta):not(.vc-btn-sand):not(.vc-home-cine-cta):not(#discord-login-btn):not(.vc-user-profile-name)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-page-cine-layout .vc-page-cine-hero :is(h1,.vc-brand-glow,.vc-page-cine-title):not(button){' +
      titleGrad +
      "}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main :is(' +
      ".vc-page-cine-lead,.vc-hero-about,.vc-muted,p.vc-page-cine-lead,.vc-hero-head p:not(.vc-candidature-notice-msg)," +
      "p:not(.vc-staff-compiti-book *):not(.vc-stat-label):not(.vc-stat-num):not(.vc-stat-247):not(.vc-user-profile-id):not(.vc-user-profile-handle):not(.vc-user-profile-block__sub):not(.vc-user-profile-stat__label):not(.vc-user-profile-levelbar__meta):not(.vc-candidature-notice-msg)" +
      "):not(button):not(.vc-header-pill):not(.horiz-cta):not(.vc-btn-sand):not(.vc-home-cine-cta):not(#discord-login-btn)" +
      ":not(.vc-hero-kicker):not(.vc-confessionale-kicker):not(.vc-support-donate-refund-note)" +
      ":not(.vc-regole-disclaimer):not(#vc-regole-disclaimer):not(.vc-regole-card-title):not(.vc-faq-group__title)" +
      ":not(.vc-perks-card__title):not(.vc-role-card-name):not(.vc-role-card__name):not(.vc-ul-card__name)" +
      ":not(.vc-legal-card__title):not(.vc-sponsor-card__title):not(.vc-candidature-card__title):not(.vc-staff-block__title)" +
      ":not(.vc-support-donate-role__title):not(.vc-home-deck__title):not(.vc-home-feature__title):not(.vc-home-index__title)" +
      ":not(.vc-cmd-acc-title):not(.vc-cmd-grp-title):not(.vc-cmd-heading):not(.vc-reviews-card__author)" +
      ":not(.vc-stat-label):not(.vc-stat-num):not(.vc-stat-num-inner):not(.vc-stat-247):not(.vc-candidature-notice-msg){" +
      "background-image:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;" +
      "color:rgba(42,28,20,.86)!important;-webkit-text-fill-color:rgba(42,28,20,.86)!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      "p,li,.vc-hero-about,.vc-home-deck__desc,.vc-home-feature__desc,.vc-page-cine-lead,.vc-muted," +
      ".text-white,.text-slate-100,.text-slate-200,.text-slate-300)" +
      ":not(.vc-user-profile-id):not(.vc-user-profile-handle):not(.vc-user-profile-block__sub):not(.vc-user-profile-stat__label):not(.vc-user-profile-levelbar__meta):not(.vc-candidature-notice-msg):not(.vc-candidature-notice-ico)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) :is(.vc-staff-organico-hist__who,.vc-staff-organico-hist__roles,.vc-staff-organico-hist__reason,' +
      ".vc-staff-organico-hist__date,.vc-staff-pt-seg__btn){" +
      "color:#2a1c14!important;-webkit-text-fill-color:#2a1c14!important;}" +
      /* candNoticeCream1f: gate charcoal forever — cream beats runtime mocha ink */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-candidature-gate #vc-candidature-gate-body,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-candidature-gate .vc-candidature-notice-msg,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-candidature-gate .vc-candidature-notice-ico,' +
      'html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body#top #vc-candidature-gate #vc-candidature-gate-body,' +
      'html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body#top #vc-candidature-gate .vc-candidature-notice-msg,' +
      'html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body#top #vc-candidature-gate .vc-candidature-notice-ico{' +
      "color:#f7ecdf!important;-webkit-text-fill-color:#f7ecdf!important;background-image:none!important;" +
      "-webkit-background-clip:border-box!important;background-clip:border-box!important;opacity:1!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body header :is(' +
      ".vc-icon-btn,#vc-mobile-nav-toggle,.vc-header-bar){" +
      ink +
      "}" +
      /* themeLightNuke1b: brand/snav = gradient mocha, non ink flat */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header :is(' +
      "a.vc-header-site-name,.vc-header-site-name__text,.vc-header-site-name__track,.vc-nav-brand-text)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .vc-header-site-name__text{' +
      "background-image:var(--vc-look-grad-brand)!important;background-color:transparent!important;" +
      "-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;-webkit-text-fill-color:transparent!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .vc-header-snav :is(.vc-snav-item,.vc-snav-summary){' +
      "background:transparent!important;background-image:var(--vc-look-grad-text)!important;" +
      "-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;-webkit-text-fill-color:transparent!important;box-shadow:none!important;}" +
      /* scrollCueUnify2c: light = stessi size/opacity della dark; solo colore bianco */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .vc-home-scrollcue .vc-home-scrollcue__chev,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-home-scrollcue .vc-home-scrollcue__chev,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__chev,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__chev,' +
      'html[data-vc-theme="light"] .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__chev{' +
      "flex:0 0 1.4rem!important;flex-basis:1.4rem!important;width:1.4rem!important;min-width:1.4rem!important;max-width:1.4rem!important;height:1.4rem!important;min-height:1.4rem!important;max-height:1.4rem!important;align-self:center!important;" +
      "border:0!important;background:transparent!important;background-image:none!important;box-shadow:none!important;}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__chev span,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__chev span,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__chev span,' +
      'html[data-vc-theme="light"] .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__chev span{' +
      "top:0.02rem!important;left:50%!important;width:0.7rem!important;height:0.7rem!important;" +
      "border:0!important;border-right-width:2.5px!important;border-bottom-width:2.5px!important;" +
      "border-right-style:solid!important;border-bottom-style:solid!important;" +
      "border-right-color:rgba(90,62,42,.92)!important;border-bottom-color:rgba(90,62,42,.92)!important;" +
      "background:none!important;background-color:transparent!important;opacity:1!important;" +
      "transform:translateX(-50%) rotate(45deg)!important;" +
      "filter:drop-shadow(0 1px 3px rgba(255,255,255,.45))!important;-webkit-filter:drop-shadow(0 1px 3px rgba(255,255,255,.45))!important;}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__chev span:nth-child(2),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__chev span:nth-child(2),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__chev span:nth-child(2),' +
      'html[data-vc-theme="light"] .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__chev span:nth-child(2){' +
      "top:0.36rem!important;opacity:0.65!important;" +
      "border-right-color:rgba(74,48,32,.82)!important;border-bottom-color:rgba(74,48,32,.82)!important;}" +
      /* scrollcueAway1: hide allo scroll batte light opacity:1 */
      'html[data-vc-theme="light"] .vc-home-scrollcue.is-away,' +
      'html.vc-site-polish[data-vc-theme="light"] .vc-home-scrollcue.is-away,' +
      'html[data-vc-theme="light"] .vc-home-scrollcue.is-away *,' +
      'html.vc-site-polish[data-vc-theme="light"] .vc-home-scrollcue.is-away *{' +
      "opacity:0!important;visibility:hidden!important;pointer-events:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .discord-account-popover,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body header .discord-account-popover,' +
      'html[data-vc-theme="light"] body.vc-body header .discord-account-popover{' +
      "background:#faf6f0!important;background-image:linear-gradient(175deg,#fffaf4 0%,#f7f1ea 52%,#efe6dc 100%)!important;" +
      "background-clip:padding-box,padding-box!important;-webkit-background-clip:padding-box,padding-box!important;" +
      "border:1.5px solid rgba(111,78,55,.28)!important;color:#2a1c14!important;" +
      "box-shadow:0 14px 36px rgba(60,40,24,.16),0 0 20px rgba(212,168,136,.18)!important;}" +
      'html[data-vc-theme="light"]:not(.vc-header-account-open) body.vc-body header .discord-account-menu:not(:hover):not(:focus-within) .discord-account-popover,' +
      'html[data-vc-theme="light"]:not(.vc-header-account-open) body.vc-body header .discord-account-menu:not(:hover):not(:focus-within) .discord-account-popover *{' +
      "opacity:0!important;visibility:hidden!important;pointer-events:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .discord-account-popover__item:not(.discord-account-popover__item--danger),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .discord-account-popover__item:not(.discord-account-popover__item--danger),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .discord-account-popover__item:not(.discord-account-popover__item--danger) :is(span,i,.fa){' +
      "background:none!important;background-image:none!important;color:#2a1c14!important;-webkit-text-fill-color:#2a1c14!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .discord-account-popover__name,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .discord-account-popover__name{' +
      "background-image:var(--vc-look-grad-brand)!important;-webkit-background-clip:text!important;background-clip:text!important;" +
      "color:transparent!important;-webkit-text-fill-color:transparent!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content .vc-home-deck__idx,' +
      'html[data-vc-theme="light"] .vc-home-deck__idx{color:rgba(90,62,42,.55)!important;-webkit-text-fill-color:rgba(90,62,42,.55)!important;opacity:1!important;}' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header #vc-view-as-launch .vcva-eye,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header #vc-view-as-launch img{' +
      "width:1.28rem!important;height:1.28rem!important;opacity:1!important;visibility:visible!important;display:block!important;" +
      "background:transparent!important;mix-blend-mode:normal!important;filter:none!important;-webkit-filter:none!important;}" +
      /* themeLightFull11c runtime: same :is(#stats…:not(:has())) max-spec as soft-fx dark */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-home-deck,.vc-home-index,.vc-home-feature,.vc-hero-head," +
      ".vc-stat-strip:not(:has(.vc-notify-stat)):not(:has(.vc-vote-live-statbox))," +
      "#stats .vc-stat-strip:not(:has(.vc-notify-stat)):not(:has(.vc-vote-live-statbox)))," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-home-deck,.vc-home-index,.vc-home-feature," +
      "#stats .vc-stat-strip:not(:has(.vc-notify-stat)):not(:has(.vc-vote-live-statbox))){" +
      wash +
      "}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .vc-header-snav .vc-snav-panel,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header :is(.vc-snav-panel,.vc-lang-panel,.vc-notif-panel),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body--home#top header .vc-header-snav .vc-snav-panel{' +
      wash +
      "}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header .vc-snav-panel :is(' +
      "a.vc-snav-row,.vc-snav-row span,.vc-snav-row i,.vc-snav-row-ico,small,.text-white,[class*=\"text-slate-\"]){" +
      "color:#2a1c14!important;-webkit-text-fill-color:#2a1c14!important;opacity:1!important;}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content .vc-home-cine-hero a.vc-header-pill:not(.vc-home-cine-cta),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content .vc-hero-head a.vc-header-pill:not(.vc-home-cine-cta),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top .vc-home-cine-hero a.vc-header-pill:not(.vc-home-cine-cta),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top .vc-hero-head a.vc-header-pill:not(.vc-home-cine-cta){' +
      "background-color:#f0e4d6!important;" +
      "background-image:linear-gradient(180deg,#fff8f0 0%,#ead9c6 100%),linear-gradient(135deg,rgba(212,168,136,.55),rgba(111,78,55,.35))!important;" +
      "background-origin:padding-box,border-box!important;background-clip:padding-box,border-box!important;-webkit-background-clip:padding-box,border-box!important;" +
      "border:1px solid transparent!important;color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;" +
      "text-shadow:none!important;filter:none!important;opacity:1!important;}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top .vc-home-cine-hero a.vc-header-pill:not(.vc-home-cine-cta) :is(i,span,svg,.fa),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top .vc-hero-head a.vc-header-pill:not(.vc-home-cine-cta) :is(i,span,svg,.fa),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content .vc-hero-head a.vc-header-pill:not(.vc-home-cine-cta) :is(i,span,svg,.fa){' +
      "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;opacity:1!important;" +
      "background:none!important;background-image:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top header img.vc-header-logo-img,' +
      'html[data-vc-theme="light"] body.vc-body header .vc-header-logo-link img{' +
      "opacity:1!important;visibility:visible!important;display:block!important;filter:none!important;mix-blend-mode:normal!important;}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top .vc-hero-head :is(' +
      "h1.vc-brand-glow,.vc-brand-glow,.vc-hero-brand-pre,.vc-hero-brand-caffe,.text-emerald-300)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-hero-head :is(.vc-brand-glow,.vc-hero-brand-pre,.vc-hero-brand-caffe){' +
      "background-image:var(--vc-look-grad-title)!important;background-color:transparent!important;" +
      "-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;-webkit-text-fill-color:transparent!important;}" +
      /* userLightInk1: cream SOLO shell esterne — le card interne restano nav-ring (cardInnerNavRing) */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(' +
      ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion" +
      "):not(:has(#vc-roles-grid)):not(:has(#vc-ul-grid)):not(:has(#vc-glow-kill-a)):not(:has(#vc-glow-kill-b))," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(' +
      ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion){" +
      "background:#faf6f0!important;background-color:#faf6f0!important;background-image:none!important;" +
      "background-clip:border-box!important;-webkit-background-clip:border-box!important;" +
      "border:1px solid rgba(111,78,55,.14)!important;box-shadow:0 8px 20px rgba(60,40,24,.08)!important;}" +
      /* cardInnerNavRing3 light: SOLO card INTERNE = --vc-nav-ring-light (batte userLightInk cream) */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(' +
      ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges" +
      "):not(:has(#vc-roles-grid)):not(:has(#vc-ul-grid)):not(:has(#vc-glow-kill-a)):not(:has(#vc-glow-kill-b))," +
      'html.vc-site-photo-bg.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(' +
      ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(' +
      ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-user-profile-page#top main :is(' +
      ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion) :is(" +
      ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges){" +
      "background-color:#faf6f0!important;" +
      "background-image:radial-gradient(120% 90% at 0% 0%,rgba(255,248,238,.92),transparent 52%)," +
      "radial-gradient(90% 70% at 100% 0%,rgba(212,168,136,.2),transparent 48%)," +
      "linear-gradient(175deg,#fffaf4 0%,#f7f1ea 48%,#efe6dc 100%),var(--vc-nav-ring-light)!important;" +
      "background-origin:padding-box,padding-box,padding-box,border-box!important;" +
      "background-clip:padding-box,padding-box,padding-box,border-box!important;" +
      "-webkit-background-clip:padding-box,padding-box,padding-box,border-box!important;" +
      "border:2px solid transparent!important;border-width:2px!important;border-color:transparent!important;" +
      "box-shadow:none!important;}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(' +
      ".vc-user-profile-name,.vc-user-profile-name__text,.vc-user-profile-block__title," +
      ".vc-user-profile-stat__value,.vc-user-profile-mini__value,h1.vc-user-profile-name)," +
      'html.vc-site-photo-bg.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(' +
      ".vc-user-profile-name,.vc-user-profile-name__text,.vc-user-profile-stat__value,h1.vc-user-profile-name)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(' +
      ".vc-user-profile-name,.vc-user-profile-name__text,.vc-user-profile-block__title," +
      ".vc-user-profile-stat__value,.vc-user-profile-mini__value,h1.vc-user-profile-name)," +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content .vc-user-profile-name,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content .vc-user-profile-name__text,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content .vc-user-profile-name .vc-user-profile-name__text{' +
      "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;" +
      "background-image:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(' +
      ".vc-user-profile-id,.vc-user-profile-handle,.vc-user-profile-block__sub," +
      ".vc-user-profile-stat__label,.vc-user-profile-mini__label,.vc-user-profile-levelbar__meta)," +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-user-profile-id,.vc-user-profile-handle,.vc-user-profile-stat__label,.vc-user-profile-levelbar__meta)," +
      'html.vc-site-photo-bg.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(' +
      ".vc-user-profile-id,.vc-user-profile-handle,.vc-user-profile-stat__label,.vc-user-profile-levelbar__meta)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(' +
      ".vc-user-profile-id,.vc-user-profile-handle,.vc-user-profile-stat__label,.vc-user-profile-levelbar__meta){" +
      "color:rgba(42,28,20,.62)!important;-webkit-text-fill-color:rgba(42,28,20,.62)!important;" +
      "background-image:none!important;}" +
      /* themeLightSwitcherSweep1 runtime: cream tracks + ink tabs */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-ul-board-tabs,.vc-ul-board-tabs.vc-ul-board-switcher,#vc-ul-board-tabs,.vc-candidature-tabs," +
      ".vc-regole-tabs,#vc-regole-tabs,.vc-cmd-tabs,.vc-notify-filter-bar,.vc-notif-scope-bar," +
      ".vc-notif-scope-switch__seg,.vc-staff-pt-seg,.vc-wt-tabs,.vc-dash-tabs,.vc-feedback-scope-bar)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-ul-board-tabs,#vc-ul-board-tabs,.vc-candidature-tabs,.vc-regole-tabs,.vc-cmd-tabs," +
      ".vc-notify-filter-bar,.vc-staff-pt-seg,.vc-confessionale-tabs)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body :is(' +
      ".vc-ul-board-tabs,#vc-ul-board-tabs,.vc-candidature-tabs,.vc-regole-tabs,.vc-cmd-tabs," +
      ".vc-notify-filter-bar,.vc-staff-pt-seg,.vc-wiki-bot-switch__seg,.vc-role-seg-switch__seg)," +
      'html[data-vc-theme="light"] :is(.vc-ul-board-tabs,#vc-ul-board-tabs,.vc-candidature-tabs){' +
      "background:#efe6dc!important;background-color:#efe6dc!important;background-image:none!important;" +
      "border:1px solid rgba(111,78,55,.28)!important;border-color:rgba(111,78,55,.28)!important;" +
      "box-shadow:inset 0 1px 0 rgba(255,255,255,.55)!important;filter:none!important;}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-ul-board-tabs,.vc-candidature-tabs,.vc-regole-tabs,#vc-ul-board-tabs) :is(" +
      ".vc-notify-filter-btn,.vc-ul-filter-tab,.vc-candidature-tab,.vc-regole-tab,.vc-cmd-tab,button[role=tab],a[role=tab])," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-ul-board-tabs,.vc-candidature-tabs) :is(.vc-notify-filter-btn,.vc-ul-filter-tab,.vc-candidature-tab)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body :is(' +
      ".vc-candidature-tab,.vc-ul-board-tabs .vc-notify-filter-btn,.vc-regole-tab,.vc-cmd-tab)," +
      'html[data-vc-theme="light"] :is(.vc-candidature-tab,.vc-ul-board-tabs .vc-notify-filter-btn){' +
      "background:transparent!important;background-image:none!important;border:0!important;box-shadow:none!important;" +
      "color:#3a281c!important;-webkit-text-fill-color:#3a281c!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-ul-board-tabs,.vc-candidature-tabs) :is(.vc-notify-filter-btn,.vc-candidature-tab) :is(span,i,svg)," +
      'html[data-vc-theme="light"] :is(.vc-candidature-tab,.vc-ul-board-tabs .vc-notify-filter-btn) :is(span,i,svg){' +
      "color:#3a281c!important;-webkit-text-fill-color:#3a281c!important;opacity:1!important;background-image:none!important;}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-ul-board-tabs .vc-notify-filter-btn--on,.vc-ul-board-tabs .vc-notify-filter-btn.is-active," +
      ".vc-candidature-tabs .vc-candidature-tab--on,.vc-candidature-tabs .vc-candidature-tab.is-active," +
      ".vc-regole-tabs .vc-regole-tab.is-active,.vc-regole-tabs .vc-regole-tab--on)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-notify-filter-btn--on,.vc-candidature-tab--on,.vc-regole-tab.is-active,.vc-cmd-tab--on)," +
      'html[data-vc-theme="light"] :is(.vc-candidature-tab--on,.vc-ul-board-tabs .vc-notify-filter-btn--on){' +
      "background:#faf6f0!important;background-color:#faf6f0!important;" +
      "background-image:linear-gradient(180deg,#fffaf4 0%,#f3ebe3 100%)!important;" +
      "border:1px solid rgba(111,78,55,.28)!important;color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;" +
      "box-shadow:0 0 0 1px rgba(111,78,55,.18),0 0 10px rgba(212,168,136,.22)!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-candidature-tab--on,.vc-notify-filter-btn--on) :is(span,i,svg)," +
      'html[data-vc-theme="light"] :is(.vc-candidature-tab--on,.vc-ul-board-tabs .vc-notify-filter-btn--on) :is(span,i,svg){' +
      "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;opacity:1!important;}" +
      /* footerCardNavRing1: IG/Discord/TikTok = anello navbar (no bordo mocha solido) */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top > footer.vc-premium-footer .vc-premium-footer__social,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__social,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body .vc-footer-social-ico,' +
      'html[data-vc-theme="light"] .vc-premium-footer__social{' +
      "background-color:var(--vc-nav-shell-fill-light,#f7f1ea)!important;" +
      "background-image:linear-gradient(var(--vc-nav-shell-fill-light,#f7f1ea),var(--vc-nav-shell-fill-light,#f7f1ea)),var(--vc-nav-ring-light)!important;" +
      "background-origin:padding-box,border-box!important;background-clip:padding-box,border-box!important;-webkit-background-clip:padding-box,border-box!important;" +
      "border:2px solid transparent!important;border-color:transparent!important;color:#3a281c!important;-webkit-text-fill-color:#3a281c!important;" +
      "box-shadow:none!important;filter:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"] body.vc-body > footer.vc-premium-footer .vc-premium-footer__outer,' +
      'html[data-vc-theme="light"] body.vc-body > footer.vc-premium-footer .vc-premium-footer__outer{' +
      "border:0!important;border-width:0!important;border-color:transparent!important;box-shadow:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__social :is(i,svg,path,.fa,.vc-footer-tiktok-ico),' +
      'html[data-vc-theme="light"] .vc-premium-footer__social :is(i,svg,path,.fa,.vc-footer-tiktok-ico){' +
      "color:#3a281c!important;-webkit-text-fill-color:#3a281c!important;fill:#3a281c!important;opacity:1!important;filter:none!important;}" +
      /* themeLightTipIcons1: tip/aside FA mocha */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top :is(' +
      ".vc-tip-row>.fa,.vc-tip-row>i,.vc-page-cine-aside-inline li>.fa,.vc-page-cine-aside-below li>.fa," +
      ".vc-wiki-tips-grid li>.fa,.vc-wiki-tips-below .vc-tip-row>.fa,.vc-suggestions-hero-bulb)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top :is(' +
      ".vc-tip-row>.fa,.vc-tip-row>i,.vc-page-cine-aside-inline li>.fa,.vc-wiki-tips-grid li>.fa)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-page-cine-layout .vc-tip-row>.fa,' +
      'html[data-vc-theme="light"] .vc-tip-row>.fa{' +
      "color:#3a281c!important;-webkit-text-fill-color:#3a281c!important;opacity:1!important;" +
      "filter:none!important;background-image:none!important;text-shadow:none!important;}" +
      /* themeLightWikiCmd2 */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content #wiki-comandi-panel > .vc-wiki-cmd-shell,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content #wiki-comandi-panel > .vc-wiki-cmd-shell,' +
      'html[data-vc-theme="light"] .vc-wiki-cmd-shell{' +
      "background:#faf6f0!important;background-color:#faf6f0!important;" +
      "background-image:" + LIGHT_WASH + "!important;" +
      "background-origin:padding-box,padding-box,padding-box,border-box!important;" +
      "background-clip:padding-box,padding-box,padding-box,border-box!important;" +
      "-webkit-background-clip:padding-box,padding-box,padding-box,border-box!important;" +
      "border:1px solid transparent!important;border-color:transparent!important;color:#2a1c14!important;" +
      "box-shadow:none!important;filter:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #wiki-comandi-panel .vc-cmd-heading,' +
      'html[data-vc-theme="light"] .vc-wiki-cmd-shell .vc-cmd-heading{' +
      "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;background-image:none!important;}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content #wiki-comandi-panel label.vc-cmd-search,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content #wiki-comandi-panel label.vc-cmd-search,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main label.vc-cmd-search,' +
      'html[data-vc-theme="light"] label.vc-cmd-search{' +
      "background:#f3ebe3!important;background-color:#f3ebe3!important;" +
      "background-image:linear-gradient(180deg,#fffaf4 0%,#efe6dc 100%)!important;" +
      "-webkit-background-clip:border-box!important;background-clip:border-box!important;" +
      "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;" +
      "border:1px solid rgba(111,78,55,.28)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.55)!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #wiki-comandi-panel .vc-cmd-search input,' +
      'html[data-vc-theme="light"] #wiki-cmd-search,html[data-vc-theme="light"] .vc-cmd-search input{' +
      "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;background:transparent!important;}" +
      'html[data-vc-theme="light"] .vc-cmd-search input::placeholder,html[data-vc-theme="light"] #wiki-cmd-search::placeholder{' +
      "color:rgba(58,40,28,.55)!important;-webkit-text-fill-color:rgba(58,40,28,.55)!important;}" +
      /* innerCardConic4: runtime NON wipe-are conic wiki (cmd body/item = nav-ring) */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content #wiki-comandi-panel :is(' +
      ".vc-cmd-item,details.vc-cmd-item,.vc-cmd-acc-body,.vc-cmd-grp-list,.vc-cmd-item-body,.vc-cmd-field)," +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main #wiki-comandi-panel :is(' +
      ".vc-cmd-item,details.vc-cmd-item,.vc-cmd-acc-body,.vc-cmd-grp-list,.vc-cmd-item-body)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-wiki-cmd-shell :is(' +
      ".vc-cmd-item,.vc-cmd-acc-body,.vc-cmd-grp-list,.vc-cmd-item-body)," +
      'html[data-vc-theme="light"] .vc-wiki-cmd-shell :is(.vc-cmd-item,.vc-cmd-acc-body,.vc-cmd-item-body){' +
      "background:#faf6f0!important;background-color:#faf6f0!important;" +
      "background-image:radial-gradient(120% 90% at 0% 0%,rgba(255,248,238,.9),transparent 52%)," +
      "linear-gradient(175deg,#fffaf4 0%,#f3ebe3 100%),var(--vc-nav-ring-light)!important;" +
      "background-origin:padding-box,padding-box,border-box!important;" +
      "background-clip:padding-box,padding-box,border-box!important;" +
      "-webkit-background-clip:padding-box,padding-box,border-box!important;" +
      "border:2px solid transparent!important;border-color:transparent!important;" +
      "color:#2a1c14!important;-webkit-text-fill-color:#2a1c14!important;filter:none!important;}" +
      /* themeLightCardsAll1 */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(' +
      ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-faq-group,.vc-legal-card,.vc-regole-card,.vc-sponsor-card," +
      ".vc-sponsor-embed,article.vc-sponsor-embed,.vc-sponsor-embed--popular,.vc-sponsor-embed--novita,.vc-perks-card," +
      ".vc-role-card,.vc-ul-card,.vc-reviews-card:not(.vc-reviews-stage__card),.vc-candidature-card,.vc-auth-required-card,.vc-staff-hub-card," +
      ".vc-staff-block,.vc-vote-platform-card,.vc-vote-live-shell,.vc-wiki-cmd-shell,.vc-support-donate-role,.vc-404-card,.vc-glass)," +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-sponsor-page.vc-body#top #vc-page-content .vc-sponsor-pricing-grid .vc-sponsor-embed,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-sponsor-page.vc-body#top main .vc-sponsor-embed,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main [class*="rounded-[1.6rem]"],' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main [class*="rounded-[1.7rem]"],' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content [class*="rounded-[1.6rem]"],' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content [class*="rounded-[1.7rem]"],' +
      'html[data-vc-theme="light"] :is(.vc-sponsor-embed,.vc-sponsor-card,.vc-support-donate-role,.vc-perks-card,.vc-404-card){' +
      "background:#faf6f0!important;background-color:#faf6f0!important;" +
      "background-image:" + LIGHT_WASH + "!important;" +
      "background-origin:padding-box,padding-box,padding-box,border-box!important;" +
      "background-clip:padding-box,padding-box,padding-box,border-box!important;" +
      "-webkit-background-clip:padding-box,padding-box,padding-box,border-box!important;" +
      "border:1px solid transparent!important;border-color:transparent!important;" +
      "color:#2a1c14!important;-webkit-text-fill-color:#2a1c14!important;box-shadow:none!important;filter:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-sponsor-page.vc-body#top #vc-page-content .vc-sponsor-embed :is(p,li,h2,h3,.vc-sponsor-embed__kicker),' +
      'html[data-vc-theme="light"] .vc-sponsor-embed :is(p,li,h2,h3,.vc-sponsor-embed__kicker){' +
      "color:#2a1c14!important;-webkit-text-fill-color:#2a1c14!important;background-image:none!important;" +
      "-webkit-background-clip:border-box!important;background-clip:border-box!important;filter:none!important;}" +
      /* themeLightCmdCode1 */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #wiki-comandi-panel :is(' +
      ".vc-cmd-code,.vc-cmd-code--usage,.vc-cmd-code--example,pre.vc-cmd-code)," +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main :is(' +
      ".vc-cmd-code,.vc-cmd-code--usage,.vc-cmd-code--example,pre.vc-cmd-code)," +
      'html[data-vc-theme="light"] :is(.vc-cmd-code,.vc-cmd-code--usage,.vc-cmd-code--example){' +
      "background:rgba(14,10,8,.92)!important;background-color:rgba(14,10,8,.92)!important;background-image:none!important;" +
      "color:rgba(247,236,223,.96)!important;-webkit-text-fill-color:rgba(247,236,223,.96)!important;" +
      "-webkit-background-clip:border-box!important;background-clip:border-box!important;" +
      "border:1px solid rgba(212,168,136,.28)!important;filter:none!important;opacity:1!important;}" +
      'html[data-vc-theme="light"] .vc-cmd-code--example{' +
      "color:rgba(232,201,168,.94)!important;-webkit-text-fill-color:rgba(232,201,168,.94)!important;}" +
      /* backTopConic2: anello conic navbar, zero glow (era themeLightBackTop1 con shadow) */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body #vc-site-back-top,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-site-back-top,' +
      'html[data-vc-theme="light"] #vc-site-back-top{' +
      "border:1.35px solid transparent!important;border-color:transparent!important;" +
      "background-color:#faf6f0!important;" +
      "background-image:linear-gradient(180deg,#fffaf4,#f3ebe3)," +
      "conic-gradient(from 0deg,rgba(111,78,55,.72) 0deg,rgba(180,130,90,.55) 90deg," +
      "rgba(139,99,70,.58) 180deg,rgba(180,130,90,.55) 270deg,rgba(111,78,55,.72) 360deg)!important;" +
      "background-origin:padding-box,border-box!important;" +
      "background-clip:padding-box,border-box!important;-webkit-background-clip:padding-box,border-box!important;" +
      "color:#3a281c!important;-webkit-text-fill-color:#3a281c!important;" +
      "box-shadow:none!important;filter:none!important;}" +
      'html[data-vc-theme="light"] #vc-site-back-top:hover,html[data-vc-theme="light"] #vc-site-back-top:focus-visible{' +
      "background-color:#fffaf4!important;" +
      "background-image:linear-gradient(180deg,#fffdf9,#efe6dc)," +
      "conic-gradient(from 0deg,rgba(111,78,55,.85) 0deg,rgba(168,118,82,.65) 90deg," +
      "rgba(139,99,70,.7) 180deg,rgba(168,118,82,.65) 270deg,rgba(111,78,55,.85) 360deg)!important;" +
      "background-origin:padding-box,border-box!important;" +
      "background-clip:padding-box,border-box!important;-webkit-background-clip:padding-box,border-box!important;" +
      "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;box-shadow:none!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body #vc-site-back-top .fa,' +
      'html[data-vc-theme="light"] #vc-site-back-top .fa,html[data-vc-theme="light"] #vc-site-back-top > i{' +
      "color:#3a281c!important;-webkit-text-fill-color:#3a281c!important;background:none!important;" +
      "background-image:none!important;text-shadow:none!important;filter:none!important;opacity:1!important;}" +
      /* themeLightHeroGlass1: hero shell = vetro (batte wash opaco runtime) */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body :is(.vc-support-page-hero,.vc-support-intro-shell,.vc-wiki-hero-card,.vc-regole-hero-card,.vc-vote-page-hero),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-page-cine-layout :is(.vc-support-page-hero,.vc-support-intro-shell),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-staff-organico-page .vc-support-page-hero,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-staff-cine-page .vc-support-page-hero,' +
      'html.vc-site-photo-bg.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body :is(.vc-support-page-hero,.vc-support-intro-shell,.vc-wiki-hero-card),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body main :is(.vc-support-page-hero,.vc-support-intro-shell),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(.vc-support-page-hero,.vc-wiki-hero-card),' +
      'html[data-vc-theme="light"] body.vc-body :is(.vc-support-page-hero,.vc-support-intro-shell,.vc-wiki-hero-card){' +
      "background-color:transparent!important;" +
      "background-image:radial-gradient(120% 90% at 0% 0%,rgba(255,248,238,.28),transparent 52%),radial-gradient(90% 70% at 100% 0%,rgba(212,168,136,.12),transparent 48%),linear-gradient(168deg,rgba(255,250,244,.52) 0%,rgba(247,241,234,.4) 100%)!important;" +
      "border-color:rgba(111,78,55,.18)!important;" +
      "box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 16px 40px rgba(60,40,24,.1),0 0 20px rgba(212,168,136,.08)!important;" +
      "backdrop-filter:blur(16px) saturate(130%)!important;-webkit-backdrop-filter:blur(16px) saturate(130%)!important;filter:none!important;}" +
      /* innerCardConic2: non wipe-are platform/perks card interne (nav-ring) */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top .vc-support-page-hero .grid.gap-4 > div:not(.vc-vote-platform-card):not(.vc-perks-tier-acc),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top .vc-support-page-hero [class*="rounded-[1.6rem]"]:not(.vc-vote-platform-card):not(a.vc-vote-platform-card),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-support-page-hero [class*="rounded-[1.6rem]"]:not(.vc-vote-platform-card):not(a.vc-vote-platform-card),' +
      'html[data-vc-theme="light"] body.vc-body .vc-support-page-hero [class*="rounded-[1.6rem]"]:not(.vc-vote-platform-card):not(a.vc-vote-platform-card){' +
      "background:rgba(255,250,244,.38)!important;background-color:rgba(255,250,244,.38)!important;background-image:none!important;" +
      "border-color:rgba(111,78,55,.16)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.35)!important;" +
      "backdrop-filter:blur(12px) saturate(120%)!important;-webkit-backdrop-filter:blur(12px) saturate(120%)!important;filter:none!important;}" +
      /* themeLightFooterGrad1: footer testo = gradient mocha come snav/brand */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer .vc-premium-footer__wordmark,' +
      'html[data-vc-theme="light"] .vc-premium-footer__wordmark{' +
      "background-image:var(--vc-look-grad-brand)!important;background-color:transparent!important;" +
      "-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;-webkit-text-fill-color:transparent!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer :is(.vc-premium-footer__col h4,.vc-premium-footer__heading),' +
      'html body.vc-body > footer.vc-premium-footer :is(.vc-premium-footer__col h4,.vc-premium-footer__heading),' +
      'html[data-vc-theme="light"] :is(.vc-premium-footer__heading,.vc-premium-footer__col h4){' +
      "background-image:var(--vc-look-grad-title)!important;background-color:transparent!important;" +
      "-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;-webkit-text-fill-color:transparent!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer :is(.vc-premium-footer__desc,.vc-premium-footer__col a,.vc-premium-footer__legal a,.vc-premium-footer__legal p,.vc-footer-copy-link, .vc-footer-copy-link span),' +
      'html body.vc-body > footer.vc-premium-footer :is(.vc-premium-footer__desc,.vc-premium-footer__col a,.vc-premium-footer__legal a,.vc-premium-footer__legal p),' +
      'html[data-vc-theme="light"] :is(.vc-premium-footer__desc,.vc-premium-footer__col a,.vc-premium-footer__legal a,.vc-premium-footer__legal p){' +
      "background-image:var(--vc-look-grad-text)!important;background-color:transparent!important;" +
      "-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;-webkit-text-fill-color:transparent!important;}" +
      /* lightDarkParity5 runtime EOF + emojiColorFix3 skip boards hero */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-intro .vc-hero-head :is(h1,h2,.vc-brand-glow),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main :is(h1,h2:not(.vc-boards-form-hero__title),.vc-brand-glow),.vc-page-cine-title{' +
      titleGrad + "}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-intro .vc-hero-head :is(a.vc-home-cine-cta,a.vc-header-pill.vc-home-cine-cta),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main :is(a.vc-home-cine-cta,a.vc-header-pill.vc-home-cine-cta),' +
      'html[data-vc-theme="light"] a.vc-home-cine-cta{' +
      "background-color:#d4a888!important;background-image:linear-gradient(180deg,#f0dcc8 0%,#d4a888 58%,#b88968 100%),linear-gradient(135deg,rgba(255,247,236,.98) 0%,rgba(212,168,136,.7) 50%,rgba(111,78,55,.92) 100%)!important;" +
      "background-origin:padding-box,border-box!important;background-clip:padding-box,border-box!important;-webkit-background-clip:padding-box,border-box!important;" +
      "border:1px solid transparent!important;color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;text-shadow:none!important;filter:none!important;opacity:1!important;}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-intro .vc-hero-head a.vc-header-pill:not(.vc-home-cine-cta),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main a.vc-header-pill:not(.vc-home-cine-cta),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-intro .vc-hero-head .vc-cmd-pill,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-cmd-pill,' +
      'html[data-vc-theme="light"] :is(a.vc-header-pill:not(.vc-home-cine-cta),.vc-cmd-pill){' +
      "border:1px solid transparent!important;background-image:linear-gradient(rgba(250,246,240,.96),rgba(250,246,240,.96)),linear-gradient(135deg,rgba(111,78,55,.85) 0%,rgba(180,130,90,.7) 42%,rgba(212,168,136,.68) 68%,rgba(139,99,70,.88) 100%)!important;" +
      "background-origin:padding-box,border-box!important;background-clip:padding-box,border-box!important;-webkit-background-clip:padding-box,border-box!important;" +
      "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;box-shadow:none!important;filter:none!important;}" +
      /* scrollCueLightGrad1b: EOF runtime metal label */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__label,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-home-scrollcue .vc-home-scrollcue__label,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content .vc-home-scrollcue__label,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__label,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-page-cine-layout .vc-home-scrollcue:not(.is-away) .vc-home-scrollcue__label,' +
      'html[data-vc-theme="light"] .vc-home-scrollcue__label{' +
      "background-color:transparent!important;background-image:var(--vc-look-grad-metal,var(--vc-look-grad-title))!important;" +
      "background-size:220% 100%!important;background-position:0% 50%!important;background-repeat:no-repeat!important;" +
      "-webkit-background-clip:text!important;background-clip:text!important;" +
      "color:transparent!important;-webkit-text-fill-color:transparent!important;" +
      "padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;text-shadow:none!important;" +
      "filter:drop-shadow(0 1px 0 rgba(255,255,255,.35)) drop-shadow(0 0 8px rgba(111,78,55,.22))!important;" +
      "animation:none!important;opacity:1!important;}" +
      /* lightDarkParity5b runtime titles max-spec */
      /* lightDarkParity5c runtime hero titles */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-intro .vc-hero-head :is(h1,h2,h3,.vc-brand-glow,.vc-page-cine-title),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-intro .vc-hero-head :is(h1,h2,.vc-brand-glow),' +
      'html.vc-site-polish[data-vc-theme="light"] body.vc-body#top #vc-page-intro .vc-hero-head :is(h1,h2,.vc-brand-glow){' +
      titleGrad +
      "}" +
      
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main :is(h1,h2:not(.vc-boards-form-hero__title),.vc-brand-glow,.vc-page-cine-title),' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(h1,h2:not(.vc-boards-form-hero__title),.vc-brand-glow),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main :is(h1,h2:not(.vc-boards-form-hero__title),.vc-brand-glow,.vc-page-cine-title):not(button):not(a):not(.vc-user-profile-name){' +
      titleGrad +
      "}" +
      /* emojiColorFix3 runtime: boards hero solid + emoji color last */
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-boards-page main h2.vc-boards-form-hero__title,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top.vc-boards-page main h2.vc-boards-form-hero__title{' +
      ink +
      "}" +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body span.vc-emoji,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top main span.vc-emoji{' +
      "background:none!important;background-image:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;" +
      "-webkit-text-fill-color:unset!important;font-variant-emoji:emoji!important;" +
      'font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",emoji!important;}' +
      /* lightDarkParity5d runtime home + wiki pill */
      /* lightDarkParity5d2 runtime wiki pill 3-ID */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top.vc-body--home .vc-home-cine-hero .vc-support-intro-shell h1.vc-brand-glow,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top.vc-body--home .vc-home-cine-hero h1.vc-brand-glow,' +
      'html.vc-site-polish[data-vc-theme="light"] body.vc-body--home .vc-home-cine-hero h1.vc-brand-glow{' +
      titleGrad +
      "}" +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #wiki-comandi-panel .vc-wiki-cmd-shell .vc-cmd-pill,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #wiki-comandi-panel .vc-wiki-cmd-shell .vc-cmd-pill,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #wiki-comandi-panel .vc-cmd-pill,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #wiki-comandi-panel .vc-wiki-cmd-shell p.vc-cmd-pill:not(#discord-login-btn):not(#vc-regole-disclaimer),' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #wiki-comandi-panel .vc-cmd-pill:not(#discord-login-btn):not(#vc-regole-disclaimer),' +
      'html.vc-site-polish[data-vc-theme="light"] body.vc-body#top #wiki-comandi-panel p.vc-cmd-pill:not(#discord-login-btn):not(#vc-regole-disclaimer),' +
      'html[data-vc-theme="light"] .vc-wiki-cmd-shell .vc-cmd-pill{' +
      "border:1px solid transparent!important;background-image:linear-gradient(rgba(250,246,240,.96),rgba(250,246,240,.96)),linear-gradient(135deg,rgba(111,78,55,.85) 0%,rgba(180,130,90,.7) 42%,rgba(212,168,136,.68) 68%,rgba(139,99,70,.88) 100%)!important;" +
      "background-origin:padding-box,border-box!important;background-clip:padding-box,border-box!important;-webkit-background-clip:padding-box,border-box!important;" +
      "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;box-shadow:none!important;filter:none!important;}" +
      /* reviewsStageCardDotsFix2: stage carousel cards — no multi-layer wash flash */
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content #vc-reviews-stage .vc-reviews-stage__card,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content #vc-reviews-stage .vc-reviews-stage__card,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content #vc-reviews-stage .vc-reviews-stage__card.vc-reviews-card,' +
      'html[data-vc-theme="light"] body.vc-reviews-page .vc-reviews-stage__card{' +
      "background:#f6efe6!important;background-color:#f6efe6!important;" +
      "background-image:linear-gradient(175deg,#fffaf4 0%,#efe4d6 100%)!important;" +
      "background-origin:padding-box!important;background-clip:padding-box!important;" +
      "-webkit-background-clip:padding-box!important;animation:none!important;filter:none!important;}" +
      /* boardsGuidelinesNoCardBg5: linee guida recensioni — niente box/anello mai */
      'html[data-vc-theme="light"] body.vc-boards-guidelines-page .vc-legal-card,' +
      'html[data-vc-theme="light"] body.vc-boards-guidelines-page .vc-legal-card:hover,' +
      'html[data-vc-theme="light"] body.vc-boards-guidelines-page .vc-legal-card:focus-within,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-boards-guidelines-page#top #vc-page-content .vc-legal-card,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-boards-guidelines-page#top #vc-page-content .vc-legal-card:is(:hover,:focus-within),' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-boards-guidelines-page#top #vc-page-content .vc-legal-card,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-boards-guidelines-page#top #vc-page-content .vc-legal-card:is(:hover,:focus-within),' +
      'html.vc-site-polish[data-vc-theme="light"] body.vc-boards-guidelines-page.vc-page-cine-layout .vc-legal-card:is(:hover,:focus-within){' +
      "background:transparent!important;background-color:transparent!important;background-image:none!important;" +
      "border-color:transparent!important;border-width:0!important;box-shadow:none!important;filter:none!important;" +
      "backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}" +
      'html[data-vc-theme="light"] body.vc-boards-guidelines-page .vc-legal-card::before,' +
      'html[data-vc-theme="light"] body.vc-boards-guidelines-page .vc-legal-card::after,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-boards-guidelines-page#top #vc-page-content .vc-legal-card::before,' +
      'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-boards-guidelines-page#top #vc-page-content .vc-legal-card::after,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-boards-guidelines-page#top #vc-page-content .vc-legal-card::before,' +
      'html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body.vc-boards-guidelines-page#top #vc-page-content .vc-legal-card::after{' +
      "content:none!important;display:none!important;opacity:0!important;visibility:hidden!important;" +
      "background:none!important;background-image:none!important;box-shadow:none!important;" +
      "-webkit-mask:none!important;mask:none!important;padding:0!important;border:0!important;}" +
      "";

      injectLightRuntime._built = style.textContent;
    } else {
      style.textContent = injectLightRuntime._built;
    }
    try {
      style.setAttribute("data-vc-light-rt", "pageHang1");
      if (!style.parentNode) document.head.appendChild(style);
    } catch (eMove) {}
  }

  /* scrollCueUnify2c: geometria identica light/dark; solo colori da tema */
  function forceScrollCueUnify() {
    try {
      var theme =
        document.documentElement.getAttribute("data-vc-theme") || "dark";
      /* navBootTrim1: una passata per tema — apply/boot/MO lo martellavano (600+ setProperty) */
      try {
        if (
          window.__vcScrollCueUnifyAt === theme &&
          document.querySelector(".vc-home-scrollcue__chev[data-vc-cue-uni='" + theme + "']")
        ) {
          return;
        }
        window.__vcScrollCueUnifyAt = theme;
      } catch (eGate) {}
      var chevs = document.querySelectorAll(".vc-home-scrollcue__chev");
      if (!chevs.length) return;
      var i;
      for (i = 0; i < chevs.length; i++) {
        var chev = chevs[i];
        chev.style.setProperty("flex", "0 0 1.4rem", "important");
        chev.style.setProperty("flex-basis", "1.4rem", "important");
        chev.style.setProperty("width", "1.4rem", "important");
        chev.style.setProperty("min-width", "1.4rem", "important");
        chev.style.setProperty("max-width", "1.4rem", "important");
        chev.style.setProperty("height", "1.4rem", "important");
        chev.style.setProperty("min-height", "1.4rem", "important");
        chev.style.setProperty("max-height", "1.4rem", "important");
        chev.style.setProperty("align-self", "center", "important");
        chev.style.setProperty("background", "transparent", "important");
        chev.style.setProperty("background-image", "none", "important");
        var spans = chev.querySelectorAll("span");
        var c0 =
          theme === "light"
            ? "rgba(90, 62, 42, 0.92)"
            : "rgba(247, 236, 223, 0.95)";
        var c1 =
          theme === "light"
            ? "rgba(74, 48, 32, 0.82)"
            : "rgba(245, 214, 183, 0.88)";
        var j;
        for (j = 0; j < spans.length; j++) {
          var sp = spans[j];
          sp.style.setProperty("top", j === 0 ? "0.02rem" : "0.36rem", "important");
          sp.style.setProperty("left", "50%", "important");
          sp.style.setProperty("width", "0.7rem", "important");
          sp.style.setProperty("height", "0.7rem", "important");
          sp.style.setProperty("border", "0", "important");
          sp.style.setProperty("border-right-width", "2.5px", "important");
          sp.style.setProperty("border-bottom-width", "2.5px", "important");
          sp.style.setProperty("border-right-style", "solid", "important");
          sp.style.setProperty("border-bottom-style", "solid", "important");
          sp.style.setProperty(
            "border-right-color",
            j === 0 ? c0 : c1,
            "important"
          );
          sp.style.setProperty(
            "border-bottom-color",
            j === 0 ? c0 : c1,
            "important"
          );
          sp.style.setProperty("opacity", j === 0 ? "1" : "0.65", "important");
          /* scrollCueNoLag1: no drop-shadow — lagga nello scroll */
          sp.style.setProperty("filter", "none", "important");
          sp.style.setProperty("-webkit-filter", "none", "important");
          sp.style.setProperty(
            "transform",
            "translateX(-50%) rotate(45deg)",
            "important"
          );
        }
        try {
          chev.setAttribute("data-vc-cue-uni", theme);
        } catch (eMark) {}
      }
    } catch (eUni) {}
  }

  /* scrollCueLightGrad1: light = metal gradient (mirror dark); dark lascia CSS */
  function forceScrollCueWhite() {
    try {
      var theme =
        document.documentElement.getAttribute("data-vc-theme") || "dark";
      try {
        if (
          window.__vcScrollCueWhiteAt === theme &&
          document.querySelector(".vc-home-scrollcue__label[data-vc-cue-wh='" + theme + "']")
        ) {
          return;
        }
        window.__vcScrollCueWhiteAt = theme;
      } catch (eGateW) {}
      var nodes = document.querySelectorAll(".vc-home-scrollcue__label");
      if (!nodes.length) return;
      var props = [
        "color",
        "-webkit-text-fill-color",
        "background",
        "background-color",
        "background-image",
        "background-size",
        "background-position",
        "background-repeat",
        "padding",
        "border",
        "border-radius",
        "box-shadow",
        "filter",
        "-webkit-filter",
        "-webkit-background-clip",
        "background-clip",
        "animation",
        "text-shadow",
      ];
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (theme === "light") {
          try {
            el.style.removeProperty("background");
          } catch (eBg) {}
          el.style.setProperty("background-color", "transparent", "important");
          el.style.setProperty(
            "background-image",
            "var(--vc-look-grad-metal, var(--vc-look-grad-title))",
            "important"
          );
          el.style.setProperty("background-size", "220% 100%", "important");
          el.style.setProperty("background-position", "0% 50%", "important");
          el.style.setProperty("background-repeat", "no-repeat", "important");
          el.style.setProperty("-webkit-background-clip", "text", "important");
          el.style.setProperty("background-clip", "text", "important");
          el.style.setProperty("color", "transparent", "important");
          el.style.setProperty("-webkit-text-fill-color", "transparent", "important");
          el.style.setProperty("padding", "0", "important");
          el.style.setProperty("border", "0", "important");
          el.style.setProperty("border-radius", "0", "important");
          el.style.setProperty("box-shadow", "none", "important");
          el.style.setProperty("text-shadow", "none", "important");
          el.style.setProperty(
            "filter",
            "drop-shadow(0 1px 0 rgba(255,255,255,.35)) drop-shadow(0 0 8px rgba(111,78,55,.22))",
            "important"
          );
          el.style.setProperty(
            "-webkit-filter",
            "drop-shadow(0 1px 0 rgba(255,255,255,.35)) drop-shadow(0 0 8px rgba(111,78,55,.22))",
            "important"
          );
          el.style.setProperty(
            "animation",
            "none",
            "important"
          );
        } else {
          for (var p = 0; p < props.length; p++) {
            try {
              el.style.removeProperty(props[p]);
            } catch (eRm) {}
          }
        }
        try {
          el.setAttribute("data-vc-cue-wh", theme);
        } catch (eMarkW) {}
      }
    } catch (eCue) {}
  }

  function scheduleScrollCuePaint() {
    if (window.__vcScrollCuePaintSched) return;
    window.__vcScrollCuePaintSched = 1;
    window.requestAnimationFrame(function () {
      window.__vcScrollCuePaintSched = 0;
      forceScrollCueWhite();
      forceScrollCueUnify();
    });
  }

  function apply(pref) {
    var p = pref || readPref();
    var resolved = resolve(p);
    var prevTheme = "";
    try {
      prevTheme = String(document.documentElement.getAttribute("data-vc-theme") || "");
    } catch (ePrev) {}
    try {
      document.documentElement.setAttribute("data-vc-theme-pref", p);
      document.documentElement.setAttribute("data-vc-theme", resolved);
      document.documentElement.style.colorScheme = resolved;
    } catch (e) {}
    if (prevTheme && prevTheme !== resolved) {
      pinThemeCssLast._done = 0;
      keepLightOnTop._last = 0;
    }
    setThemeColor(resolved);
    syncSwitchers(resolved);
    ensureThemeSwitchCss();
    ensureThemeLightCss(resolved === "light");
    injectLightRuntime(resolved);
    pinThemeCssLast();
    scheduleScrollCuePaint();
    return resolved;
  }

  function setPref(pref) {
    var p = normalizePref(pref) || "auto";
    writePref(p);
    publishTheme(p);
    return apply(p);
  }

  function toggle() {
    var next = resolve(readPref()) === "dark" ? "light" : "dark";
    return setPref(next);
  }

  function bind() {
    if (window.__vcThemeBound) return;
    window.__vcThemeBound = true;
    document.addEventListener("click", function (ev) {
      var toggleBtn =
        ev.target && ev.target.closest ? ev.target.closest("[data-vc-theme-toggle]") : null;
      if (toggleBtn) {
        toggle();
        return;
      }
      var btn =
        ev.target && ev.target.closest ? ev.target.closest("[data-vc-theme-set]") : null;
      if (!btn) return;
      setPref(String(btn.getAttribute("data-vc-theme-set") || "auto"));
    });
    try {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () {
        if (readPref() === "auto") apply("auto");
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (eMq) {}
    bindChromeThemeSync();
  }

  apply(readPref());
  bind();

  function bootDom() {
    ensureThemeSwitchCss();
    pinThemeCssLast();
    ensureSwitcherInFooter();
    injectLightRuntime(resolve(readPref()));
    scheduleScrollCuePaint();
    bindChromeThemeSync();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootDom);
  } else {
    bootDom();
  }
  /* navBootTrim1: niente secondo paint a t=0 (duplicava setProperty storm) */

  /* lightPerf1 + pageHang1: pin una volta; MO solo su data-vc-theme; disarm dopo ready */
  function keepLightOnTop() {
    if (resolve(readPref()) !== "light") return;
    var now = Date.now();
    if (keepLightOnTop._last && now - keepLightOnTop._last < 1500) return;
    keepLightOnTop._last = now;
    pinThemeCssLast();
    injectLightRuntime("light");
    scheduleScrollCuePaint();
  }
  function disarmThemeFlashObs() {
    try {
      if (window.__vcThemeFlashObs) {
        window.__vcThemeFlashObs.disconnect();
        window.__vcThemeFlashObs = null;
      }
    } catch (eOff) {}
  }
  try {
    var flashObs = new MutationObserver(function (muts) {
      if (resolve(readPref()) !== "light") return;
      var themeChange = false;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        /* pageHang1: ignora class churn (cine/chrome) — solo cambio tema */
        if (m.type === "attributes" && m.attributeName === "data-vc-theme") {
          themeChange = true;
          break;
        }
      }
      if (!themeChange) return;
      pinThemeCssLast._done = 0;
      if (flashObs._t) window.clearTimeout(flashObs._t);
      flashObs._t = window.setTimeout(keepLightOnTop, 160);
    });
    window.__vcThemeFlashObs = flashObs;
    flashObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-vc-theme"],
    });
    document.addEventListener(
      "vc:soft-fx-ready",
      function () {
        keepLightOnTop();
        window.setTimeout(disarmThemeFlashObs, 400);
      },
      { once: true }
    );
    window.setTimeout(keepLightOnTop, 300);
    window.setTimeout(disarmThemeFlashObs, 2500);
    try {
      document.addEventListener(
        "vc:page-cine-ready",
        function () {
          window.setTimeout(disarmThemeFlashObs, 200);
        },
        { once: true }
      );
    } catch (eCine) {}
  } catch (eFlash) {}

  window.__vcTheme = {
    apply: apply,
    setPref: setPref,
    toggle: toggle,
    readPref: readPref,
    resolve: resolve,
    ensureSwitcher: ensureSwitcherInFooter,
    pinLast: keepLightOnTop,
    forceScrollCueUnify: forceScrollCueUnify,
  };
  try {
    window.__vcForceScrollCueUnify = forceScrollCueUnify;
  } catch (eExp2) {}
})();
