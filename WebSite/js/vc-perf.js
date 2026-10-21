/**
 * Fixed perf tier for everyone (no device/network autodetection).
 * Tiers available in CSS/API: full | mid | lite
 * forceMidAll1: always mid — detection + localStorage pref ignored.
 * Sets html.vc-perf-{tier} and data-vc-perf early for CSS.
 * bootCpuHoldAll1: settle restano su TUTTE le pagine fino a chrome-load-done+hold
 *   (prima solo home; altrove pointerdown toglieva settle → CPU 100%+ a lungo).
 * assetPageFilter1: come apiPageFilter — JS/CSS off-path neutri PRIMA degli altri defer
 *   (look invariato: solo pezzi route-specifici, chrome/cine restano).
 * siteOptAll1: + kill landing-notif/i18n-locales/pages-extra off-path; __vcYield INP.
 * siteOptAll2: LCP hero fetchpriority + lazy sotto-fold early.
 */
(function (global) {
  if (global.VcPerf && global.VcPerf.__ready) return;

  /* siteOptAll1: yield helper — spezza long task senza cambiare look */
  try {
    if (typeof global.__vcYield !== "function") {
      global.__vcYield = function (fn) {
        var run = typeof fn === "function" ? fn : function () {};
        try {
          if (global.scheduler && typeof global.scheduler.yield === "function") {
            return global.scheduler.yield().then(function () {
              return run();
            });
          }
        } catch (eY) {}
        return new Promise(function (resolve) {
          global.setTimeout(function () {
            try {
              resolve(run());
            } catch (eR) {
              resolve(undefined);
            }
          }, 0);
        });
      };
    }
  } catch (eYieldBoot) {}

  /* siteOptAll2: LCP — hero/cine photo high; resto defer via lazyEverywhere */
  (function armLcpHeroBoost() {
    try {
      if (global.__vcLcpHeroBoost2) return;
      global.__vcLcpHeroBoost2 = "20261021siteOptAll2";
      function boost() {
        try {
          var heroes = document.querySelectorAll(
            "img.vc-home-cine__photo, .vc-home-cine__picture img, img[data-vc-lcp], .vc-page-cine-hero img.vc-hero-photo",
          );
          for (var i = 0; i < heroes.length; i++) {
            var img = heroes[i];
            if (!img) continue;
            try {
              img.setAttribute("fetchpriority", "high");
              img.setAttribute("loading", "eager");
              if (!img.getAttribute("decoding")) img.setAttribute("decoding", "async");
              img.setAttribute("data-vc-nolazy", "1");
            } catch (eImg) {}
          }
        } catch (eB) {}
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boost, { once: true });
      } else {
        boost();
      }
      try {
        boost();
      } catch (eEarly) {}
    } catch (eLcp) {}
  })();

  /* siteOptAll1 / assetPageFilter2: first defer → spegne script/CSS off-path */
  (function assetPageFilter1Early() {
    try {
      if (global.__vcAssetPageFilter1 === "20261021siteOptAll2") return;
      global.__vcAssetPageFilter1 = "20261021siteOptAll2";
      function normPath() {
        try {
          var path = String(location.pathname || "/")
            .replace(/\/index\.html$/i, "")
            .replace(/\/+$/, "");
          if (!path) path = "/";
          path = path.replace(/^\/(en|it)(?=\/|$)/i, "") || "/";
          return path;
        } catch (eNp) {
          return "/";
        }
      }
      function pathRe(re) {
        try {
          return re.test(normPath());
        } catch (eRe) {
          return false;
        }
      }
      function isHome() {
        return normPath() === "/";
      }
      function needsDialog() {
        return pathRe(
          /^\/(candidature|feedback|tickets|appelli|seratafilm|confessionale|bacheca|dashboard|staff|user|classifiche|notifications)(\/|$)/i,
        );
      }
      function needsDrafts() {
        return pathRe(
          /^\/(candidature|feedback|tickets|appelli|seratafilm|confessionale|bacheca|dashboard)(\/|$)/i,
        );
      }
      function needsLightbox() {
        return pathRe(
          /^\/(confessionale|bacheca|feedback|recensioni|staff|user|classifiche|tickets)(\/|$)/i,
        );
      }
      function needsChatTyping() {
        return pathRe(/^\/(tickets|confessionale|bacheca|notifications)(\/|$)/i);
      }
      function needsTicketsPush() {
        return pathRe(/^\/tickets(\/|$)/i);
      }
      function needsMiniPager() {
        return pathRe(/^\/(tickets|bacheca|staff\/compiti|dashboard)(\/|$)/i);
      }
      function needsThinLanding() {
        if (isHome()) return true;
        return pathRe(
          /^\/(user|classifiche|vote|tickets|perks|personalizza|confessionale|notifications|bacheca|seratafilm|puzzle|donazioni)(\/|$)/i,
        );
      }
      function needsTypeSfx() {
        return pathRe(
          /^\/(candidature|confessionale|feedback|tickets|appelli|seratafilm|bacheca|dashboard|personalizza|staff\/compiti)(?=\/|$)/i,
        );
      }
      function killScript(matchFn) {
        var nodes = document.querySelectorAll("script[src],script[data-src]");
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          try {
            var src = String(el.getAttribute("src") || el.getAttribute("data-src") || "");
            if (!src || !matchFn(src)) continue;
            el.type = "text/plain";
            el.setAttribute("data-vc-asset-filter", "20261021siteOptAll1");
            if (el.getAttribute("src")) {
              el.setAttribute("data-vc-killed-src", src);
              el.removeAttribute("src");
            }
            el.removeAttribute("data-src");
          } catch (eKill) {}
        }
      }
      function killStylesheet(substr) {
        var links = document.querySelectorAll('link[rel="stylesheet"][href],link[href]');
        for (var i = 0; i < links.length; i++) {
          var lk = links[i];
          try {
            var href = String(lk.getAttribute("href") || lk.href || "");
            if (href.indexOf(substr) === -1) continue;
            if (lk.parentNode) lk.parentNode.removeChild(lk);
          } catch (eCss) {}
        }
      }
      function needsPagesExtra() {
        return pathRe(
          /^\/(perks|wiki|sponsor|status|seratafilm|bacheca|donazioni|recensioni)(\/|$)/i,
        );
      }
      if (!needsDialog()) killScript(function (s) { return /vc-dialog(\.|$|\?)/i.test(s); });
      if (!needsDrafts()) killScript(function (s) { return /vc-form-drafts(\.|$|\?)/i.test(s); });
      if (!needsLightbox()) {
        killScript(function (s) { return /vc-image-lightbox(\.|$|\?)/i.test(s); });
        killStylesheet("vc-image-lightbox");
      }
      if (!needsChatTyping()) killScript(function (s) { return /vc-chat-typing(\.|$|\?)/i.test(s); });
      if (!needsTicketsPush()) killScript(function (s) { return /vc-tickets-push-gate(\.|$|\?)/i.test(s); });
      if (!needsMiniPager()) killScript(function (s) { return /vc-mini-pager(\.|$|\?)/i.test(s); });
      if (!needsTypeSfx()) killScript(function (s) { return /vc-type-sfx(\.|$|\?)/i.test(s); });
      if (!needsThinLanding()) {
        killScript(function (s) {
          if (/vc-landing-notif/i.test(s)) return false;
          return /vc-landing(\.|$|\?)/i.test(s);
        });
      }
      /* siteOptAll1: landing-notif MAI da HTML — solo inject (tap + idle auth) */
      killScript(function (s) { return /vc-landing-notif(\.|$|\?)/i.test(s); });
      /* mega 3MB locales: solo JSON on-demand da vc-i18n */
      killScript(function (s) { return /vc-i18n-locales(\.|$|\?)/i.test(s); });
      if (!needsPagesExtra()) {
        killScript(function (s) { return /vc-i18n-pages-extra(\.|$|\?)/i.test(s); });
      }
      if (!isHome()) {
        killScript(function (s) { return /vc-kick-pip(\.|$|\?)/i.test(s); });
        killScript(function (s) { return /vc-twitch-pip(\.|$|\?)/i.test(s); });
        killScript(function (s) { return /(?:^|\/)live-stats(\.|$|\?)/i.test(s); });
        killScript(function (s) { return /vc-home-boot-gate(\.|$|\?)/i.test(s); });
        killScript(function (s) { return /vc-home-sw-cache-guard(\.|$|\?)/i.test(s); });
        killScript(function (s) { return /vc-live-config(\.|$|\?)/i.test(s); });
      }
      /* page-home CSS solo su home */
      if (!isHome()) killStylesheet("vc-page-home");
    } catch (eFilter) {}
  })();

    /* lookStaticBorder1b: solid sand — no conic (CPU) */
  function classicMetalCardPaint(light) {
    if (light) {
      return {
        border: "2px solid rgba(92,58,34,0.38)",
        bgc: "#faf6f0",
        shadow: "0 10px 28px rgba(60,40,20,0.12)",
        bg:
          "radial-gradient(120% 90% at 0% 0%, rgba(111,78,55,0.08), transparent 52%)," +
          "radial-gradient(90% 70% at 100% 0%, rgba(168,118,82,0.10), transparent 48%)," +
          "linear-gradient(175deg,#fffaf4 0%,#f7f1ea 48%,#efe6dc 100%)",
        origin: "padding-box",
        clip: "padding-box",
      };
    }
    return {
      border: "2px solid rgba(245,214,183,0.38)",
      bgc: "#100c09",
      shadow: "0 10px 28px rgba(0,0,0,0.42)",
      bg:
        "radial-gradient(120% 90% at 0% 0%, rgba(236,205,176,0.12), transparent 52%)," +
        "radial-gradient(90% 70% at 100% 0%, rgba(111,78,55,0.16), transparent 48%)," +
        "linear-gradient(175deg,#17130f 0%,#100c09 55%,#0b0807 100%)",
      origin: "padding-box",
      clip: "padding-box",
    };
  }

  /* fxFlatKill1o + metalBorderSocial1: beat mega page-CSS with classic metal border */
  function pinFlatCardChrome() {
    try {
      if (!document.documentElement.classList.contains("vc-fx-flat")) return;
      var light = false;
      try {
        light = document.documentElement.getAttribute("data-vc-theme") === "light";
      } catch (eTh) {}
      var paint = classicMetalCardPaint(light);
      var sel =
        ".vc-hero-head,.vc-page-cine-card,.vc-fx-card,.vc-home-panel," +
        ".vc-wt-sidebar,.vc-reviews-stage__card,.vc-reviews-card,.vc-reviews-formcard," +
        ".vc-role-card,.vc-ul-card,.vc-stat-strip.vc-glass,.vc-stat-card," +
        ".vc-boards-card,.vc-boards-mine-card,.vc-faq-group,.vc-wiki-cmd-shell," +
        ".vc-perks-card,.vc-regole-card,.vc-legal-card,.vc-sponsor-card,.vc-candidature-card," +
        ".vc-page-cine-aside-inline .grid > [class*='rounded']," +
        ".vc-page-cine-aside-inline > [class*='rounded']," +
        ".vc-hero-head .grid > [class*='rounded']," +
        ".vc-support-page-hero .grid.gap-4 > div," +
        "main [class*='rounded-[1.6rem']";
      var nodes = document.querySelectorAll(sel);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el || !el.style) continue;
        try {
          if (el.closest && el.closest("header, footer, .vc-nav-shell")) continue;
          /* shellGlowKill1: intro shell resta trasparente */
          if (el.classList && el.classList.contains("vc-support-intro-shell")) continue;
        } catch (eSkip) {}
        /* heroMetalStats1: hero = stesso metallo stats (2px + conic), no fill-only */
        var isHero =
          el.classList && el.classList.contains("vc-hero-head");
        if (isHero) {
          /* sitewideSolid1h: inline !important — beat soft/theme-light light dark-sand */
          var lightHero =
            document.documentElement.getAttribute("data-vc-theme") === "light";
          var heroBorder = lightHero
            ? "2px solid rgba(111,78,55,.28)"
            : "2px solid rgba(245,214,183,.38)";
          var heroColor = lightHero
            ? "rgba(111,78,55,.28)"
            : "rgba(245,214,183,.38)";
          el.style.setProperty("border", heroBorder, "important");
          el.style.setProperty("border-width", "2px", "important");
          el.style.setProperty("border-style", "solid", "important");
          el.style.setProperty("border-color", heroColor, "important");
          el.style.setProperty("box-shadow", "none", "important");
          el.style.setProperty("filter", "none", "important");
          el.style.setProperty("background-origin", "padding-box", "important");
          el.style.setProperty("background-clip", "padding-box", "important");
          el.style.setProperty(
            "-webkit-background-clip",
            "padding-box",
            "important",
          );
          continue;
        }
        /* sitewideSolid1: borders owned by site-chrome — glow kill only */
        el.style.setProperty("box-shadow", "none", "important");
        el.style.setProperty("filter", "none", "important");
        el.style.setProperty(
          "background-origin",
          "padding-box",
          "important",
        );
        el.style.setProperty(
          "background-clip",
          "padding-box",
          "important",
        );
        el.style.setProperty(
          "-webkit-background-clip",
          "padding-box",
          "important",
        );
      }
      /* chromeOwnerUnify1: account border owned by site-chrome — only kill glow inline */
      try {
        var pops = document.querySelectorAll(
          "header .discord-account-popover, .discord-account-popover",
        );
        for (var pi = 0; pi < pops.length; pi++) {
          var pop = pops[pi];
          if (!pop || !pop.style) continue;
          pop.style.setProperty("box-shadow", "none", "important");
          pop.style.setProperty("filter", "none", "important");
        }
      } catch (ePopPin) {}
      var btns = document.querySelectorAll(
        ".vc-wt-new-btn,.vc-wt-new-btn--cta,.vc-wt-btn,.vc-wt-chip,.vc-wt-item,.vc-wt-composer,.vc-wt-composer__send",
      );
      for (var j = 0; j < btns.length; j++) {
        var b = btns[j];
        if (!b || !b.style) continue;
        b.style.setProperty("box-shadow", "none", "important");
        b.style.setProperty("filter", "none", "important");
        b.style.setProperty("text-shadow", "none", "important");
      }

      /* sitewideSolid1h: nav/foot inline solid */
      try {
        var lightChrome =
          document.documentElement.getAttribute("data-vc-theme") === "light";
        var chromeBorder = lightChrome
          ? "2px solid rgba(111,78,55,.28)"
          : "2px solid rgba(245,214,183,.38)";
        var chromeColor = lightChrome
          ? "rgba(111,78,55,.28)"
          : "rgba(245,214,183,.38)";
        var chromeNodes = document.querySelectorAll(
          "header .vc-nav-shell, footer .vc-premium-footer__outer",
        );
        for (var ci = 0; ci < chromeNodes.length; ci++) {
          var cn = chromeNodes[ci];
          if (!cn || !cn.style) continue;
          cn.style.setProperty("border", chromeBorder, "important");
          cn.style.setProperty("border-width", "2px", "important");
          cn.style.setProperty("border-style", "solid", "important");
          cn.style.setProperty("border-color", chromeColor, "important");
          cn.style.setProperty("box-shadow", "none", "important");
          cn.style.setProperty("background-clip", "padding-box", "important");
          cn.style.setProperty(
            "-webkit-background-clip",
            "padding-box",
            "important",
          );
        }
      } catch (eChromePin) {}
    } catch (ePin) {}
  }

  /* fxFlatKill1o: card 2px solid sitewide + kill glow; pin ALWAYS lastChild */
  function ensureFxFlatCss() {
    try {
      var root = document.documentElement;
      root.classList.add("vc-fx-flat");
      var id = "vc-fx-flat-css";
      var MARK = "sitewideSolid1j";
      var s = document.getElementById(id);
      var mount = document.body || document.head || document.documentElement;
      if (
        s &&
        s.getAttribute("data-vc") === MARK &&
        document.body &&
        s.parentNode === document.body &&
        document.body.lastChild === s
      ) {
        try {
          window.__vcFxFlatReady = MARK;
        } catch (eMark0) {}
        /* heroMetalStats1: CSS già ok — ripinna card (hero arriva dopo il primo pass) */
        pinFlatCardChrome();
        return;
      }
      var css =
        /* load UI ALWAYS wins — vinyl / barra / toast / sipario */
        "html.vc-fx-flat #vc-pre-cine-hard-sipario,html.vc-fx-flat #vc-boot-load-screen," +
        "html.vc-fx-flat #vc-boot-load-screen .vc-boot-load-screen__spin," +
        "html.vc-fx-flat #vc-boot-load-screen .vc-boot-load-screen__title," +
        "html.vc-fx-flat #vc-boot-load-screen .vc-boot-load-screen__sub," +
        "html.vc-fx-flat #vc-site-progress,html.vc-fx-flat #vc-site-progress__bar," +
        "html.vc-fx-flat #vc-site-toast-host,html.vc-fx-flat #vc-site-toast-host .vc-dash-save-toast," +
        "html.vc-fx-flat .vc-dash-save-toast[data-vc-boot-load-toast]," +
        "html.vc-fx-flat .vc-ui-spinner,html.vc-fx-flat .vc-ui-spinner *{" +
        "filter:none!important;-webkit-filter:none!important}" +
        "html.vc-fx-flat:not(.vc-cine-curtain-off) #vc-boot-load-screen{" +
        "display:flex!important;opacity:1!important;visibility:visible!important;" +
        "pointer-events:auto!important}" +
        "html.vc-fx-flat:not(.vc-cine-curtain-off) #vc-boot-load-screen .vc-boot-load-screen__spin{" +
        "display:block!important;opacity:1!important;visibility:visible!important;" +
        "background-color:transparent!important;" +
        "background-image:url(/images/vc-loading.gif?v=20260920vcLoadingSpokes1)!important;" +
        "background-position:center!important;background-size:contain!important;" +
        "background-repeat:no-repeat!important;box-shadow:none!important}" +
        "html.vc-fx-flat #vc-site-progress,html.vc-fx-flat #vc-site-progress.is-loading{" +
        "opacity:1!important;visibility:visible!important;display:block!important;" +
        "background:transparent!important;background-image:none!important;" +
        "box-shadow:none!important;filter:none!important}" +
        "html.vc-fx-flat #vc-site-progress__bar{" +
        "display:block!important;opacity:1!important;visibility:visible!important;" +
        "background-color:#d4a888!important;" +
        "background-image:linear-gradient(90deg,#8f6b3f,#c49a72,#e8c9a8,#fffaf3,#e8c9a8,#d4a888,#b88968)!important;" +
        "box-shadow:none!important;filter:none!important}" +
        "html.vc-fx-flat #vc-site-toast-host .vc-dash-save-toast," +
        "html.vc-fx-flat .vc-dash-save-toast[data-vc-boot-load-toast]{" +
        "background-image:linear-gradient(145deg,#17130f,#100c09)!important;" +
        "background-color:#100c09!important;opacity:1!important;visibility:visible!important;" +
        "box-shadow:none!important;filter:none!important;backdrop-filter:none!important}" +
        /* brand TITLE stays visible — only kill glow adornments */
        "html.vc-fx-flat h1.vc-brand-glow,html.vc-fx-flat .vc-brand-glow," +
        "html.vc-fx-flat .vc-hero-brand-pre,html.vc-fx-flat .vc-hero-brand-caffe," +
        "html.vc-fx-flat .vc-brand-glow .text-emerald-300{" +
        "display:revert!important;opacity:1!important;visibility:visible!important;" +
        "pointer-events:auto!important;filter:none!important;text-shadow:none!important;" +
        "box-shadow:none!important}" +
        "html.vc-fx-flat .vc-brand-glow::before,html.vc-fx-flat .vc-brand-glow::after," +
        "html.vc-fx-flat .vc-brand-shimmer,html.vc-fx-flat .vc-fx-sheen," +
        "html.vc-fx-flat [class*='__sheen']{" +
        "display:none!important;opacity:0!important;visibility:hidden!important;" +
        "pointer-events:none!important;animation:none!important;background:none!important;" +
        "box-shadow:none!important;filter:none!important}" +
        /* decorative glow layers only (NOT .vc-brand-glow text host) */
        "html.vc-fx-flat :is(" +
        ".vc-soft-vote-glow,.vc-soft-vote-glow::before,.vc-soft-vote-glow::after," +
        "#vc-site-cursor-light,#vc-site-cursor-light::before,#vc-site-cursor-light::after," +
        ".vc-nav-shell::before,.vc-nav-shell::after," +
        ".vc-premium-footer__outer::before," +
        /* mqHoverGifFooter1: footer ::after ring resta (come navbar) */
        ".vc-page-cine-card::before,.vc-fx-card::before," +
        "[class*='vc-vote-progress']::before,[class*='vc-vote-progress']::after," +
        ".vc-home-cine__grain,.vc-home-cine__spotlight,.vc-page-cine-hero__grain,.vc-page-cine-hero__aura" +
        "){display:none!important;opacity:0!important;visibility:hidden!important;" +
        "pointer-events:none!important;animation:none!important;background:none!important;" +
        "box-shadow:none!important;filter:none!important}" +
        /* glass / panels — no blur/glow; solid fill + visible border base */
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body#top header .vc-header-snav .vc-snav-panel," +
        "html.vc-fx-flat.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme='light'] body.vc-body#top header .vc-header-snav .vc-snav-panel," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body .vc-snav-panel," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body .vc-lang-panel," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body .vc-notif-panel," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body .vc-mobile-nav-drawer__panel," +
        "html.vc-fx-flat[data-vc-theme='light'] body.vc-body header .vc-snav-panel," +
        "html.vc-fx-flat.vc-site-polish body.vc-body .vc-snav-panel," +
        "html.vc-fx-flat.vc-site-polish body.vc-body .vc-notif-panel," +
        "html.vc-fx-flat.vc-site-polish body.vc-body .vc-lang-panel," +
        "html.vc-fx-flat.vc-site-polish body.vc-body .vc-mobile-nav-drawer__panel," +
        "html.vc-fx-flat :is(" +
        ".vc-glass,.vc-glass-panel,.backdrop-blur,[class*='backdrop-blur']," +
        ".vc-nav-shell,.vc-nav-shell.vc-glass,.vc-snav-panel,.vc-notif-panel,.vc-lang-panel," +
        ".vc-notif-dropdown,.vc-mobile-nav-drawer,.vc-mobile-nav-drawer__panel," +
        ".vc-dialog,.vc-dialog__panel,.vc-dialog__card," +
        ".vc-dash-confirm,.vc-dash-confirm__panel,.vc-feedback-sheet,.vc-staff-stat-sheet," +
        ".vc-staff-manage-sheet,.vc-staff-reso-sheet,.vc-wt-user-pick,.vc-wt-user-pick__panel," +
        ".vc-emoji-picker,.vc-mention-menu,#vc-wt-mention-menu,#vc-wt-command-menu," +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel" +
        "){backdrop-filter:none!important;-webkit-backdrop-filter:none!important;" +
        "box-shadow:none!important;filter:none!important;text-shadow:none!important}" +
        /* solid fill only — NO border on .vc-glass / notif-dropdown (caused nav squares) */
        "html.vc-fx-flat:not([data-vc-theme='light']) :is(" +
        ".vc-glass-panel,.vc-nav-shell," +
        ".vc-snav-panel,.vc-notif-panel,.vc-lang-panel," +
        ".vc-mobile-nav-drawer__panel," +
        ".vc-dialog__panel,.vc-dialog__card,.vc-dash-confirm__panel," +
        ".vc-feedback-sheet,.vc-staff-stat-sheet,.vc-staff-manage-sheet,.vc-staff-reso-sheet," +
        ".vc-wt-user-pick__panel,.vc-emoji-picker,#vc-wt-mention-menu,#vc-wt-command-menu" +
        "){background-color:#140f0c!important;background-image:none!important}" +
        "html.vc-fx-flat[data-vc-theme='light'] :is(" +
        ".vc-glass-panel,.vc-nav-shell,.vc-snav-panel,.vc-notif-panel," +
        ".vc-lang-panel,.vc-mobile-nav-drawer__panel," +
        ".vc-dialog__panel,.vc-dash-confirm__panel,.vc-feedback-sheet" +
        "){background-color:#f7efe6!important;background-image:none!important}" +
        /* panels: thin border only, zero glow (account popover → metal sotto) */
        "html.vc-fx-flat :is(" +
        ".vc-snav-panel,.vc-notif-panel,.vc-lang-panel," +
        ".vc-mobile-nav-drawer__panel," +
        ".vc-dialog__panel,.vc-dialog__card,.vc-dash-confirm__panel," +
        ".vc-feedback-sheet,.vc-emoji-picker,#vc-wt-mention-menu,#vc-wt-command-menu" +
        "){box-shadow:none!important;filter:none!important;text-shadow:none!important;" +
        "outline:none!important;" +
        "border:1px solid rgba(236,205,176,.42)!important;border-color:rgba(236,205,176,.42)!important}" +
        /* kill squares: chrome wrappers must stay borderless */
        "html.vc-fx-flat body.vc-body header :is(" +
        ".vc-header-snav,.vc-header-snav.vc-glass,.vc-notif-dropdown," +
        ".vc-lang-dropdown,.vc-lang-toggle,#vc-notif-dropdown," +
        ".vc-snav-details,.vc-snav-summary" +
        "){border:0!important;border-color:rgba(245,214,183,.38)!important;outline:none!important;" +
        "box-shadow:none!important;filter:none!important}" +
        /* account pill: bordo sottile, niente glow/outline doppio */
        "html.vc-fx-flat body.vc-body header #discord-account-btn," +
        "html.vc-fx-flat body.vc-body header .discord-account-btn," +
        "html.vc-fx-flat body.vc-body header [data-vc-account-btn]," +
        "html.vc-fx-flat body.vc-body header .vc-nav-user," +
        "html.vc-fx-flat body.vc-body header .vc-nav-user-btn{" +
        "box-shadow:none!important;filter:none!important;outline:none!important;" +
        "border:1px solid rgba(236,205,176,.45)!important;border-color:rgba(236,205,176,.45)!important}" +
        "html.vc-fx-flat body.vc-body header #discord-account-btn img," +
        "html.vc-fx-flat body.vc-body header .discord-account-btn img," +
        "html.vc-fx-flat body.vc-body header .vc-nav-user img," +
        "html.vc-fx-flat body.vc-body header .discord-account-popover img," +
        "html.vc-fx-flat body.vc-body header .discord-account-avatar," +
        "html.vc-fx-flat body.vc-body header .vc-nav-user__avatar{" +
        "box-shadow:none!important;filter:none!important;outline:none!important;" +
        "border:1px solid rgba(236,205,176,.4)!important}" +
        /* chromeOwnerUnify1: account border owned by site-chrome — fx-flat only kills glow */
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body#top header .discord-account-popover," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body header .discord-account-popover," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off) body.vc-body#top header .discord-account-popover," +
        "html.vc-fx-flat.vc-site-polish body.vc-body#top header .discord-account-popover," +
        "html.vc-fx-flat.vc-site-polish body.vc-body header .discord-account-popover," +
        "html.vc-fx-flat body.vc-body#top header .discord-account-popover," +
        "html.vc-fx-flat body.vc-body header .discord-account-popover," +
        "html.vc-fx-flat body.vc-body .discord-account-popover{" +
        "box-shadow:none!important;filter:none!important;-webkit-filter:none!important;" +
        "outline:none!important;text-shadow:none!important;" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
        "html.vc-fx-flat body.vc-body .discord-account-popover :is(" +
        ".discord-account-popover__item,a,button,i,span,.fa" +
        "){border:0!important;outline:none!important;" +
        "background:transparent!important;background-image:none!important;" +
        "box-shadow:none!important;text-shadow:none!important;filter:none!important}" +
        /* beat vc-shell metal clip:text on FA (was the icon squares) */
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body header .discord-account-popover__item > i," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body header .discord-account-popover__item .fa," +
        "html.vc-fx-flat.vc-site-polish body.vc-body header .discord-account-popover__item > i," +
        "html.vc-fx-flat.vc-site-polish body.vc-body header .discord-account-popover__item .fa," +
        "html.vc-fx-flat body.vc-body header .discord-account-popover__item > i," +
        "html.vc-fx-flat body.vc-body header .discord-account-popover__item .fa{" +
        "background:none!important;background-image:none!important;" +
        "-webkit-background-clip:border-box!important;background-clip:border-box!important;" +
        "color:rgba(236,205,176,.92)!important;-webkit-text-fill-color:rgba(236,205,176,.92)!important;" +
        "text-shadow:none!important;filter:none!important;box-shadow:none!important;" +
        "border:0!important;outline:none!important}" +
        "html.vc-fx-flat body.vc-body .discord-account-popover__item--danger," +
        "html.vc-fx-flat body.vc-body header #discord-logout-btn{" +
        "box-shadow:none!important;filter:none!important;outline:none!important;" +
        "border:0!important}" +
        "html.vc-fx-flat :is(" +
        ".vc-dialog__backdrop,.vc-dash-confirm__backdrop," +
        ".vc-sheet-backdrop" +
        "){backdrop-filter:none!important;-webkit-backdrop-filter:none!important;" +
        "background:#0a0705!important;filter:none!important}" +
        /* homeHoverMq1: no kill transform/ring su logo hover (GIF+scale tornano) */
        /* hero: mirror glowFormSandRestore2 + theme-light (ID/#top) so we WIN */
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body--home#top .vc-home-cine-hero .vc-hero-head:not(#discord-login-btn)," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body--home#top section#intro.vc-home-cine-hero .vc-hero-head:not(#discord-login-btn)," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body--home#top .vc-home-cine-hero .vc-support-intro-shell .vc-hero-head:not(#discord-login-btn)," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body#top #vc-page-intro .vc-hero-head:not(#discord-login-btn)," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body#top #vc-page-content .vc-hero-head:not(#discord-login-btn)," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-page-cine-layout#top .vc-page-cine-hero .vc-hero-head:not(#discord-login-btn)," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body#top .vc-support-page-hero .vc-hero-head:not(#discord-login-btn)," +
        "html.vc-fx-flat.vc-site-photo-bg.vc-perf-mid.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body--home#top .vc-home-cine-hero .vc-hero-head:not(#discord-login-btn)," +
                /* heroDeckMatch1: hero = stesso metallo stats (cardGlowRestore4) */
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body#top #vc-page-content .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body#top #vc-page-intro .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-page-cine-layout#top .vc-page-cine-hero .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-web-tickets-page#top .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body#top .vc-hero-head.vc-glass," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body--home#top .vc-home-cine-hero .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body#top :is(.vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-legal-card)," +
        "html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body#top .vc-hero-head," +
        "html.vc-fx-flat:not([data-vc-theme='light']) body.vc-body .vc-hero-head{" +
        "filter:none!important;-webkit-filter:none!important;" +
        "border:2px solid rgba(111,78,55,.28)!important;border-width:2px!important;border-style:solid!important;" +
        "border-color:rgba(111,78,55,.28)!important;" +
        "background-color:#100c09!important;" +
        "background-image:radial-gradient(120% 90% at 0% 0%,rgba(236,205,176,.12),transparent 52%)," +
        "radial-gradient(90% 70% at 100% 0%,rgba(111,78,55,.16),transparent 48%)," +
        "linear-gradient(175deg,#17130f 0%,#100c09 55%,#0b0807 100%)!important;" +
        "background-origin:padding-box!important;" +
        "background-clip:padding-box!important;" +
        "-webkit-background-clip:padding-box!important;" +
        /* heroMetalStats1: hairline solid (no conic) */
        "box-shadow:0 0 0 1px rgba(255,247,236,.2)!important}" +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content :is(.vc-hero-head,.vc-page-cine-card,.vc-legal-card)," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body#top #vc-page-intro .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-page-cine-layout .vc-page-cine-hero .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-web-tickets-page#top .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body main :is(.vc-hero-head,.vc-page-cine-card,.vc-legal-card)," +
        "html.vc-fx-flat.vc-site-photo-bg.vc-site-polish[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body .vc-hero-head{" +
        "border:2px solid rgba(111,78,55,.28)!important;border-width:2px!important;border-style:solid!important;" +
        "border-color:rgba(111,78,55,.28)!important;" +
        "background-color:#faf6f0!important;" +
        "background-image:radial-gradient(120% 90% at 0% 0%,rgba(111,78,55,.08),transparent 52%)," +
        "radial-gradient(90% 70% at 100% 0%,rgba(168,118,82,.10),transparent 48%)," +
        "linear-gradient(175deg,#fffaf4 0%,#f7f1ea 48%,#efe6dc 100%)!important;" +
        "background-origin:padding-box!important;" +
        "background-clip:padding-box!important;" +
        "-webkit-background-clip:padding-box!important;" +
        "box-shadow:none!important;filter:none!important}" +
        /* heroRing2px1: kill solo ::before wash — ::after ring resta (soft/look) */
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body--home#top .vc-home-cine-hero .vc-hero-head:not(#discord-login-btn)::before," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body--home#top section#intro.vc-home-cine-hero .vc-hero-head:not(#discord-login-btn)::before," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body--home#top .vc-home-cine-hero .vc-support-intro-shell .vc-hero-head:not(#discord-login-btn)::before," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body#top #vc-page-intro .vc-hero-head:not(#discord-login-btn)::before," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body--home .vc-home-cine-hero .vc-hero-head:not(#discord-login-btn)::before," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-page-cine-layout .vc-page-cine-hero .vc-hero-head:not(#discord-login-btn)::before," +
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body .vc-support-page-hero .vc-hero-head:not(#discord-login-btn)::before{" +
        "display:none!important;content:none!important;opacity:0!important;" +
        "visibility:hidden!important;pointer-events:none!important;" +
        "animation:none!important;background:none!important;background-image:none!important;" +
        "box-shadow:none!important;filter:none!important;-webkit-mask:none!important;mask:none!important}" +
        /* sitewide cards/pills/buttons — beat look-core + page-* !important glow */
        "html.vc-fx-flat.vc-site-polish body.vc-body#top :is(" +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-support-intro-shell,.vc-hero-head," +
        ".vc-support-page-hero,.vc-page-cine-hero,.vc-home-cine-hero,.vc-reviews-hero-star," +
        ".vc-support-page-hero__icon,.vc-tickets-hero-ticket,.vc-wt-hero-icon," +
        ".vc-header-pill,a.vc-header-pill,.horiz-cta,.vc-btn-sand,.vc-home-cine-cta," +
        ".vc-vote-platform-cta,.vc-vote-more-btn,.vc-role-card-cta,.vc-role-card," +
        ".vc-ul-card,.vc-stat-strip,.vc-stat-card,.vc-cmd-pill,.vc-cmd-tab,.vc-cmd-tab--on," +
        ".vc-nav-feat-badge,.vc-nav-bell,.vc-lang-btn,#discord-account-btn,.discord-account-btn," +
        ".vc-nav-user,.vc-nav-user-btn,.vc-wt-btn,.vc-wt-new-btn,.vc-wt-new-btn--cta," +
        ".vc-wt-composer,.vc-wt-composer__editor,.vc-wt-composer__send," +
        ".vc-wt-chip,.vc-wt-tab,.vc-wt-item,.vc-dash-save-toast," +
        ".vc-wiki-bot-switch__btn,.vc-regole-tab,.vc-staff-tab,.vc-user-profile-tabs__btn," +
        ".vc-user-profile-customize,.vc-user-profile-backbtn," +
        "button,.vc-btn,[class*='__cta'],[class*='-cta'],[class*='__btn'],[class*='-btn']" +
        ")," +
        "html.vc-fx-flat.vc-site-polish body.vc-body#top main :is(" +
        ".vc-cmd-pill,.vc-header-pill,a.vc-header-pill,.horiz-cta,.vc-btn-sand," +
        ".vc-home-cine-cta,.vc-cmd-tab--on,.vc-wt-new-btn,.vc-wt-chip,.vc-wt-item,button" +
        ")," +
        "html.vc-fx-flat.vc-site-polish body.vc-body#top :is(" +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-hero-head,.vc-header-pill," +
        "a.vc-header-pill,.horiz-cta,.vc-btn-sand,.vc-home-cine-cta,.vc-wt-new-btn,button,.vc-btn" +
        ")::before," +
        "html.vc-fx-flat.vc-site-polish body.vc-body#top :is(" +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-hero-head,.vc-header-pill," +
        "a.vc-header-pill,.horiz-cta,.vc-btn-sand,.vc-home-cine-cta,.vc-wt-new-btn,button,.vc-btn" +
        ")::after," +
        "html.vc-fx-flat body.vc-body :is(" +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-hero-head,.vc-header-pill," +
        "a.vc-header-pill,.horiz-cta,.vc-btn-sand,.vc-home-cine-cta,.vc-reviews-hero-star," +
        ".vc-cmd-pill,.vc-wt-new-btn,.vc-wt-chip,.vc-wt-item,button" +
        "){" +
        "box-shadow:none!important;filter:none!important;-webkit-filter:none!important;" +
        "text-shadow:none!important;backdrop-filter:none!important;" +
        "-webkit-backdrop-filter:none!important}" +
        /* tickets: beat look-core #vc-page-content chip/cta glow */
        "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body#top #vc-page-content :is(.vc-wt-new-btn,.vc-wt-new-btn--cta,.vc-wt-chip,.vc-wt-chip.is-active,.vc-wt-filter.is-active)," +
        "html.vc-fx-flat.vc-site-polish body.vc-body#top.vc-web-tickets-page :is(.vc-wt-new-btn,.vc-wt-new-btn--cta,.vc-wt-chip.is-active)," +
        "html.vc-fx-flat.vc-site-polish body.vc-web-tickets-page#top :is(.vc-wt-item,.vc-wt-chip,.vc-wt-new-btn,.vc-wt-new-btn--cta)," +
        "html.vc-fx-flat body.vc-web-tickets-page :is(.vc-wt-item,.vc-wt-chip,.vc-wt-new-btn,.vc-wt-new-btn--cta){" +
        "box-shadow:none!important;filter:none!important;animation:none!important;" +
        "border:1px solid rgba(236,205,176,.48)!important;" +
        "border-style:solid!important;border-width:1px!important;" +
        "border-color:rgba(236,205,176,.48)!important;" +
        "background-clip:padding-box!important;-webkit-background-clip:padding-box!important}" +
        "html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body#top #vc-page-content :is(.vc-wt-new-btn,.vc-wt-new-btn--cta){" +
        "background-image:linear-gradient(to right,rgba(111,78,55,.98),rgba(74,52,37,.98))!important;" +
        "box-shadow:none!important}" +
        "html.vc-fx-flat.vc-site-polish body.vc-web-tickets-page#top .vc-wt-item.is-active," +
        "html.vc-fx-flat body.vc-web-tickets-page .vc-wt-chip.is-active{" +
        "box-shadow:none!important;border-color:rgba(236,205,176,.62)!important}" +
        /* heroDeckMatch1 LAST: stats/cards = conic border-box; hero ESCLUSO (mask ::after) */
        "html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body#top :is(" +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-home-deck,.vc-home-index," +
        ".vc-wt-sidebar,.vc-wt-board,.vc-reviews-stage__card,.vc-reviews-card," +
        ".vc-reviews-formcard,.vc-role-card,.vc-ul-card,.vc-stat-strip,.vc-stat-strip.vc-glass," +
        ".vc-stat-card,.vc-boards-card,.vc-boards-mine-card,.vc-faq-group," +
        ".vc-wiki-cmd-shell,.vc-perks-card,.vc-regole-card,.vc-legal-card,.vc-sponsor-card," +
        ".vc-candidature-card,.vc-premium-card" +
        ")," +
        "html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body#top .vc-page-cine-aside-inline .grid > [class*='rounded']," +
        "html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body#top .vc-page-cine-aside-inline > [class*='rounded']," +
        "html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body#top .vc-hero-head .grid > [class*='rounded']," +
        "html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-web-tickets-page#top .vc-wt-sidebar," +
        "html.vc-fx-flat:not([data-vc-theme='light']) body.vc-body .vc-wt-sidebar," +
        "html.vc-fx-flat:not([data-vc-theme='light']) body.vc-body .vc-page-cine-aside-inline .grid > [class*='rounded']{" +
        "border:2px solid rgba(245,214,183,.38)!important;border-width:2px!important;border-style:solid!important;" +
        "border-color:rgba(245,214,183,.38)!important;" +
        "filter:none!important;-webkit-filter:none!important;outline:none!important;" +
        "background-color:#100c09!important;" +
        "background-image:radial-gradient(120% 90% at 0% 0%,rgba(236,205,176,.12),transparent 52%)," +
        "radial-gradient(90% 70% at 100% 0%,rgba(111,78,55,.16),transparent 48%)," +
        "linear-gradient(175deg,#17130f 0%,#100c09 55%,#0b0807 100%)!important;" +
        "background-origin:padding-box!important;" +
        "background-clip:padding-box!important;" +
        "-webkit-background-clip:padding-box!important;" +
        "box-shadow:0 0 0 1px rgba(255,247,236,.16)!important}" +
        /* heroMetalStats1: hero dark = stesso 2px solid stats (batte fill-only) */
        "html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body#top :is(.vc-hero-head,.vc-hero-head.vc-glass,.vc-hero-head.vc-hero-head--has-aside)," +
        "html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-page-cine-layout#top .vc-page-cine-hero .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-web-tickets-page#top .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body--home#top .vc-home-cine-hero .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body--home#top section#intro.vc-home-cine-hero .vc-hero-head," +
        "html.vc-fx-flat:not([data-vc-theme='light']) body.vc-body .vc-hero-head{" +
        "border:2px solid rgba(245,214,183,.38)!important;border-width:2px!important;border-style:solid!important;" +
        "border-color:rgba(245,214,183,.38)!important;" +
        "filter:none!important;-webkit-filter:none!important;outline:none!important;" +
        "background-color:#100c09!important;" +
        "background-image:radial-gradient(120% 90% at 0% 0%,rgba(236,205,176,.12),transparent 52%)," +
        "radial-gradient(90% 70% at 100% 0%,rgba(111,78,55,.16),transparent 48%)," +
        "linear-gradient(175deg,#17130f 0%,#100c09 55%,#0b0807 100%)!important;" +
        "background-origin:padding-box!important;" +
        "background-clip:padding-box!important;" +
        "-webkit-background-clip:padding-box!important;" +
        "box-shadow:0 0 0 1px rgba(255,247,236,.2)!important}" +

        /* heroRing2px1: light cards ok conic; hero = fill + mask ring (no 1px outline) */
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body#top :is(" +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-home-deck," +
        ".vc-stat-strip,.vc-stat-strip.vc-glass,.vc-wt-sidebar,.vc-legal-card" +
        ")," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body--home#top #stats .vc-stat-strip," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body#top .vc-page-cine-aside-inline .grid > [class*='rounded']{" +
        "border:2px solid rgba(111,78,55,.28)!important;border-width:2px!important;border-color:rgba(111,78,55,.28)!important;" +
        "background-color:#faf6f0!important;" +
        "background-image:radial-gradient(120% 90% at 0% 0%,rgba(111,78,55,.08),transparent 52%)," +
        "radial-gradient(90% 70% at 100% 0%,rgba(168,118,82,.10),transparent 48%)," +
        "linear-gradient(175deg,#fffaf4 0%,#f7f1ea 48%,#efe6dc 100%)!important;" +
        "background-origin:padding-box!important;" +
        "background-clip:padding-box!important;" +
        "-webkit-background-clip:padding-box!important;" +
        "box-shadow:none!important;filter:none!important;" +
        "overflow:visible!important}" +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body#top #vc-page-intro .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body--home#top .vc-home-cine-hero .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body--home#top section#intro.vc-home-cine-hero .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-web-tickets-page#top .vc-hero-head," +
        "html.vc-fx-flat.vc-site-photo-bg.vc-site-polish[data-vc-theme='light'] body.vc-body--home#top .vc-home-cine-hero .vc-hero-head," +
        "html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body#top :is(.vc-hero-head){" +
        "border:2px solid rgba(111,78,55,.28)!important;border-width:2px!important;border-style:solid!important;" +
        "border-color:rgba(111,78,55,.28)!important;" +
        "background-color:#faf6f0!important;" +
        "background-image:radial-gradient(120% 90% at 0% 0%,rgba(111,78,55,.08),transparent 52%)," +
        "radial-gradient(90% 70% at 100% 0%,rgba(168,118,82,.10),transparent 48%)," +
        "linear-gradient(175deg,#fffaf4 0%,#f7f1ea 48%,#efe6dc 100%)!important;" +
        "background-origin:padding-box!important;" +
        "background-clip:padding-box!important;" +
        "-webkit-background-clip:padding-box!important;" +
        "box-shadow:none!important;filter:none!important;overflow:visible!important}" +
        /* tickets bottom board/sidebar + CTA: zero glow/shadow */
        "html.vc-fx-flat.vc-site-polish body.vc-web-tickets-page#top :is(" +
        ".vc-wt-sidebar,.vc-wt-board,.vc-wt-item,.vc-wt-chip,.vc-wt-tab," +
        ".vc-wt-new-btn,.vc-wt-new-btn--cta,.vc-wt-btn,.vc-wt-composer," +
        ".vc-wt-composer__editor,.vc-wt-composer__send,.vc-wt-filter" +
        ")," +
        "html.vc-fx-flat body.vc-web-tickets-page :is(" +
        ".vc-wt-sidebar,.vc-wt-new-btn,.vc-wt-new-btn--cta,.vc-wt-btn,.vc-wt-item,.vc-wt-chip" +
        ")," +
        "html.vc-fx-flat.vc-site-polish body.vc-web-tickets-page#top :is(" +
        ".vc-wt-sidebar,.vc-wt-new-btn,.vc-wt-new-btn--cta" +
        ")::before," +
        "html.vc-fx-flat.vc-site-polish body.vc-web-tickets-page#top :is(" +
        ".vc-wt-sidebar,.vc-wt-new-btn,.vc-wt-new-btn--cta" +
        ")::after{" +
        "box-shadow:none!important;filter:none!important;-webkit-filter:none!important;" +
        "text-shadow:none!important;animation:none!important}" +
        "html.vc-fx-flat.vc-site-polish body.vc-web-tickets-page#top :is(.vc-wt-new-btn,.vc-wt-new-btn--cta)," +
        "html.vc-fx-flat body.vc-web-tickets-page :is(.vc-wt-new-btn,.vc-wt-new-btn--cta){" +
        "border:1px solid rgba(236,205,176,.48)!important;border-width:1px!important;" +
        "box-shadow:none!important;filter:none!important}" +
        "html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish.vc-perf-mid.vc-site-photo-bg[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body#top > header .vc-nav-shell,html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body header .vc-nav-shell,html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish.vc-perf-mid.vc-site-photo-bg[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body#top > footer.vc-premium-footer .vc-premium-footer__outer,html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__outer,html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body#top > footer.vc-premium-footer .vc-premium-footer__outer{border:2px solid rgba(111,78,55,.28)!important;border-width:2px!important;border-style:solid!important;border-color:rgba(111,78,55,.28)!important;box-shadow:none!important;filter:none!important;background-image:none!important;background-clip:padding-box!important;-webkit-background-clip:padding-box!important}html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish.vc-perf-mid[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body#top :is(.vc-hero-head,.vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-legal-card,.vc-wiki-cmd-shell,.vc-faq-group,.vc-role-card,.vc-wt-sidebar,.vc-stat-strip),html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-web-tickets-page#top .vc-hero-head,html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-page-cine-layout#top .vc-hero-head,html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body#top .vc-hero-head{border:2px solid rgba(111,78,55,.28)!important;border-width:2px!important;border-style:solid!important;border-color:rgba(111,78,55,.28)!important;box-shadow:none!important;background-clip:padding-box!important;-webkit-background-clip:padding-box!important}html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish.vc-perf-mid:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body#top :is(.vc-hero-head,.vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-legal-card,.vc-wiki-cmd-shell,.vc-faq-group,.vc-role-card,.vc-wt-sidebar,.vc-stat-strip),html.vc-fx-flat:not([data-vc-theme='light']) body.vc-body .vc-hero-head{border:2px solid rgba(245,214,183,.38)!important;border-width:2px!important;border-style:solid!important;border-color:rgba(245,214,183,.38)!important;box-shadow:none!important;background-clip:padding-box!important;-webkit-background-clip:padding-box!important}" +
        /* homeHoverMq1b LAST: logo ring (no scale=GIF ok) + wordmark/n:not([data-vc-theme='light']) body.vc-body#top :is(.vc-hero-head,.vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-legal-card,.vc-wiki-cmd-shell,.vc-faq-group,.vc-role-card,.vc-wt-sidebar,.vc-stat-strip),html.vc-fx-flat:not([data-vc-theme='light']) body.vc-body .vc-hero-head{border:2px solid rgba(245,214,183,.38)!important;border-width:2px!important;border-style:solid!important;border-color:rgba(245,214,183,.38)!important;box-shadow:none!important;background-clip:padding-box!important;-webkit-background-clip:padding-box!important}" +
        /* homeHoverMq1b LAST: logo ring (no scale=GIF ok) + wordmark/nome hover vs settle */
        "html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish body.vc-body#top header :is(a.vc-header-logo-link,#vc-mq-logo-hover-boost):hover," +
        "html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish body.vc-body#top header :is(a.vc-header-logo-link,#vc-mq-logo-hover-boost):focus-visible," +
        "html.vc-fx-flat body.vc-body header a.vc-header-logo-link:hover," +
        "html.vc-fx-flat body.vc-body header a.vc-header-logo-link:focus-visible{" +
        "transform:none!important;-webkit-transform:none!important;filter:none!important;" +
        "box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 0 0 2px rgba(232,201,168,.42),0 0 18px rgba(232,201,168,.22)!important}" +
        /* mqHeroMetal1c: keyframes su `translate` (batte transform:none look-core) */
        "@keyframes vc-guild-name-marquee{from{translate:0 0}to{translate:calc(-1 * var(--vc-marquee-distance,160px)) 0}}" +
        "@keyframes vc-nav-user-name-marquee{from{translate:0 0}to{translate:calc(-1 * var(--vc-marquee-distance,160px)) 0}}" +
        /* mqNoSnapSettle1: solo play-state (no animation-name → no restart al settle) */
        "html:not(.vc-page-hidden).vc-cpu-settle body.vc-body header a.vc-header-site-name.is-marquee:hover .vc-header-site-name__track," +
        "html:not(.vc-page-hidden).vc-cpu-settle body.vc-body header a.vc-header-site-name.is-marquee:focus-visible .vc-header-site-name__track," +
        "html:not(.vc-page-hidden) body.vc-body header a.vc-header-site-name.is-marquee:hover .vc-header-site-name__track," +
        "html:not(.vc-page-hidden) body.vc-body header a.vc-header-site-name.is-marquee:focus-visible .vc-header-site-name__track{" +
        "animation-play-state:running!important;animation-delay:0s!important;" +
        "-webkit-animation-play-state:running!important;will-change:translate!important}" +
        "html:not(.vc-page-hidden).vc-cpu-settle body.vc-body header .discord-profile-link:hover .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html:not(.vc-page-hidden).vc-cpu-settle body.vc-body #header-quick-actions .discord-profile-link:hover .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html:not(.vc-page-hidden) body.vc-body header .discord-profile-link:hover .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html:not(.vc-page-hidden) body.vc-body #header-quick-actions .discord-profile-link:hover .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track{" +
        "animation-play-state:running!important;animation-delay:0s!important;" +
        "-webkit-animation-play-state:running!important;will-change:translate!important}" +
        "/* sitewideSolid1g PIN */html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish.vc-perf-mid.vc-site-photo-bg[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body header .vc-nav-shell,html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body header .vc-nav-shell,html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish.vc-perf-mid.vc-site-photo-bg[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__outer,html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-body footer.vc-premium-footer .vc-premium-footer__outer{border:2px solid rgba(111,78,55,.28)!important;border-width:2px!important;border-style:solid!important;border-color:rgba(111,78,55,.28)!important;box-shadow:none!important;background-image:none!important;background-clip:padding-box!important;-webkit-background-clip:padding-box!important}html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish.vc-perf-mid[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content .vc-hero-head,html.vc-fx-flat.vc-site-polish[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body#top #vc-page-content .vc-hero-head,html.vc-fx-flat.vc-site-polish[data-vc-theme='light']:not(.vc-soft-fx-off) body.vc-body#top #vc-page-intro .vc-hero-head,html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-web-tickets-page .vc-hero-head,html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-web-tickets-page#top .vc-hero-head,html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-page-cine-layout .vc-hero-head,html.vc-fx-flat.vc-site-polish[data-vc-theme='light'] body.vc-wiki-page .vc-hero-head,html.vc-fx-flat[data-vc-theme='light'] body.vc-body .vc-hero-head.vc-glass,html[data-vc-theme='light'] body.vc-body .vc-hero-head{border:2px solid rgba(111,78,55,.28)!important;border-width:2px!important;border-style:solid!important;border-color:rgba(111,78,55,.28)!important;box-shadow:none!important;background-clip:padding-box!important;-webkit-background-clip:padding-box!important}html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish.vc-perf-mid.vc-site-photo-bg:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body header .vc-nav-shell,html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body header .vc-nav-shell,html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish.vc-perf-mid.vc-site-photo-bg:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body footer.vc-premium-footer .vc-premium-footer__outer,html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body footer.vc-premium-footer .vc-premium-footer__outer{border:2px solid rgba(245,214,183,.38)!important;border-width:2px!important;border-style:solid!important;border-color:rgba(245,214,183,.38)!important;box-shadow:none!important;background-image:none!important;background-clip:padding-box!important;-webkit-background-clip:padding-box!important}html.vc-fx-flat.vc-soft-fx-ready.vc-site-polish.vc-perf-mid:not(.vc-soft-fx-off):not([data-vc-theme='light']) body.vc-body#top #vc-page-content .vc-hero-head,html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body#top #vc-page-content .vc-hero-head,html.vc-fx-flat.vc-site-polish:not([data-vc-theme='light']) body.vc-body#top #vc-page-intro .vc-hero-head,html.vc-fx-flat:not([data-vc-theme='light']) body.vc-body .vc-hero-head{border:2px solid rgba(245,214,183,.38)!important;border-width:2px!important;border-style:solid!important;border-color:rgba(245,214,183,.38)!important;box-shadow:none!important;background-clip:padding-box!important;-webkit-background-clip:padding-box!important}";
      if (!s) {
        s = document.createElement("style");
        s.id = id;
      }
      s.setAttribute("data-vc", MARK);
      s.textContent = css;
      /* always remount last — beat snav/marquee style pins */
      (document.body || mount).appendChild(s);
      try {
        window.__vcFxFlatReady = MARK;
      } catch (eMark) {}
      pinFlatCardChrome();
    } catch (eFx) {}
  }
  try {
    window.__vcEnsureFxFlatCss = ensureFxFlatCss;

  /* sitewideSolid1j: re-pin solid borders on theme flip (rAF x2) */
  try {
    if (!window.__vcSitewideSolidThemePin) {
      window.__vcSitewideSolidThemePin = true;
      var __vcPinThemeT = 0;
      function __vcPinThemeSoon() {
        try {
          pinFlatCardChrome();
        } catch (e0) {}
        try {
          requestAnimationFrame(function () {
            try {
              pinFlatCardChrome();
            } catch (e1) {}
            requestAnimationFrame(function () {
              try {
                pinFlatCardChrome();
              } catch (e2) {}
            });
          });
        } catch (eRaf) {}
        try {
          clearTimeout(__vcPinThemeT);
          __vcPinThemeT = setTimeout(function () {
            try {
              pinFlatCardChrome();
            } catch (e3) {}
          }, 120);
        } catch (eTo) {}
      }
      var __vcPinThemeMo = new MutationObserver(function () {
        __vcPinThemeSoon();
      });
      __vcPinThemeMo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-vc-theme"],
      });
      document.addEventListener("vc:theme-change", __vcPinThemeSoon, false);
    }
  } catch (eHook) {}
    document.documentElement.classList.add("vc-fx-flat");
    ensureFxFlatCss();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", ensureFxFlatCss, { once: true });
    }
    window.addEventListener("load", ensureFxFlatCss, { once: true });
    document.addEventListener("vc:soft-fx-ready", ensureFxFlatCss, false);
    document.addEventListener("vc:cine-curtain-off", ensureFxFlatCss, false);
    window.setTimeout(ensureFxFlatCss, 0);
    /* bootCpuSettle1: meno pin post-paint (era 0.8+2+4.5+8s + pin×3 = RecalcStyle storm) */
    window.setTimeout(ensureFxFlatCss, 600);
    var __vcHomePinLite = false;
    try {
      var __pinP = String(location.pathname || "/").replace(/\/+$/, "") || "/";
      __vcHomePinLite = __pinP === "/" || __pinP === "/index.html";
    } catch (eHomePin) {}
    if (!__vcHomePinLite) {
      window.setTimeout(ensureFxFlatCss, 1800);
      window.setTimeout(pinFlatCardChrome, 900);
      window.setTimeout(function () {
        try {
          var s = document.getElementById("vc-fx-flat-css");
          if (s && document.body && document.body.lastChild !== s) {
            document.body.appendChild(s);
          }
          pinFlatCardChrome();
        } catch (eBootPin) {}
      }, 2200);
    } else {
      window.setTimeout(function () {
        try {
          var s = document.getElementById("vc-fx-flat-css");
          if (s && document.body && document.body.lastChild !== s) {
            document.body.appendChild(s);
          }
          pinFlatCardChrome();
        } catch (eHomeBootPin) {}
      }, 900);
    }
  } catch (eFxArm) {}

    /* navMetalBridge1: stub Cache API SEMPRE in page (non solo PWA) —
     Storage Service CPU da caches.open/match; SW push resta nel proprio scope */
  /* pushOpenCold2: whitelist pending-nav/read — altrimenti cold-start push non raggiunge la dest */
  try {
    if ("caches" in global && !global.__vcPageCachesStub) {
      global.__vcPageCachesStub = 1;
      var nativeCaches = global.caches;
      var PASS_CACHE = {
        "vc-pending-nav-v1": 1,
        "vc-notif-pending-read-v1": 1,
      };
      var deadCache = {
        match: function () {
          return Promise.resolve(undefined);
        },
        matchAll: function () {
          return Promise.resolve([]);
        },
        add: function () {
          return Promise.resolve();
        },
        addAll: function () {
          return Promise.resolve();
        },
        put: function () {
          return Promise.resolve();
        },
        delete: function () {
          return Promise.resolve(false);
        },
        keys: function () {
          return Promise.resolve([]);
        },
      };
      var deadCaches = {
        open: function (name) {
          var key = String(name || "");
          if (PASS_CACHE[key] && nativeCaches && typeof nativeCaches.open === "function") {
            return nativeCaches.open(key);
          }
          return Promise.resolve(deadCache);
        },
        has: function (name) {
          var key = String(name || "");
          if (PASS_CACHE[key] && nativeCaches && typeof nativeCaches.has === "function") {
            return nativeCaches.has(key);
          }
          return Promise.resolve(false);
        },
        delete: function (name) {
          var key = String(name || "");
          if (PASS_CACHE[key] && nativeCaches && typeof nativeCaches.delete === "function") {
            return nativeCaches.delete(key);
          }
          return Promise.resolve(false);
        },
        keys: function () {
          return Promise.resolve([]);
        },
        match: function () {
          return Promise.resolve(undefined);
        },
      };
      try {
        Object.defineProperty(global, "caches", {
          configurable: true,
          get: function () {
            return deadCaches;
          },
        });
      } catch (eDef) {
        try {
          global.caches = deadCaches;
        } catch (eAssign) {}
      }
    }
  } catch (eSwBoot) {}

  /* cssFoucKill1: early baseline + no libro flash + hold paint finché soft-fx è pronto */
  try {
    var earlyId = "vc-phone-top-flash-kill1";
    var earlyCss =
      "html body.vc-body .vc-home-cine::after{content:none!important;display:none!important;opacity:0!important;background:none!important}" +
      "html body.vc-body .vc-home-cine{overflow:hidden!important}" +
      "@media (min-width:1200px){" +
      "html body.vc-body .vc-home-cine__veil{" +
      "background:linear-gradient(180deg,rgba(10,7,5,.55) 0%,rgba(10,7,5,.24) 32%,rgba(10,7,5,.3) 62%,rgba(10,7,5,.8) 100%)," +
      "radial-gradient(ellipse 72% 55% at 50% 42%,rgba(10,7,5,.2),transparent 72%)!important;" +
      "filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
      "html body.vc-body .vc-home-cine__photo{" +
      "object-position:center center!important;transform:none!important;" +
      "filter:none!important;-webkit-filter:none!important}}" +
      "@media (max-width:1199.98px),(pointer:coarse){" +
      "html body.vc-body .vc-home-cine__veil{" +
      "background:linear-gradient(180deg,transparent 0%,transparent 42%,rgba(10,7,5,.18) 72%,rgba(10,7,5,.62) 100%)!important;" +
      "filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
      "html body.vc-body .vc-home-cine__photo{" +
      "object-position:center 58%!important;object-fit:cover!important;" +
      "width:116vw!important;height:116vh!important;height:116dvh!important;" +
      "left:-8vw!important;top:-8vh!important;top:-8dvh!important;" +
      "right:auto!important;bottom:auto!important;inset:auto!important;" +
      "transform:none!important;filter:none!important;-webkit-filter:none!important;" +
      "contain:none!important}}" +
      ".vc-forbidden-book:not(.vc-forbidden-book--flying),.vc-forbidden-book[hidden]," +
      "html body .vc-forbidden-book:not(.vc-forbidden-book--flying)," +
      "html body.vc-body .vc-forbidden-book:not(.vc-forbidden-book--flying)," +
      "html body.vc-body h1 .vc-forbidden-book:not(.vc-forbidden-book--flying){" +
      "display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;" +
      "font-size:0!important;width:0!important;height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;" +
      "position:absolute!important;left:-9999px!important;top:-9999px!important}" +
      "html:not(.vc-soft-fx-ready) body.vc-body>header," +
      "html:not(.vc-soft-fx-ready) body.vc-body>main," +
      "html:not(.vc-soft-fx-ready) body.vc-body main," +
      "html:not(.vc-soft-fx-ready) body.vc-body>footer," +
      "html:not(.vc-soft-fx-ready) body.vc-body #intro," +
      "html:not(.vc-soft-fx-ready) body.vc-body .vc-home-cine-hero," +
      "html:not(.vc-soft-fx-ready) body.vc-body .vc-page-cine-hero," +
      "html:not(.vc-cine-curtain-off) body.vc-body>header," +
      "html:not(.vc-cine-curtain-off) body.vc-body>main," +
      "html:not(.vc-cine-curtain-off) body.vc-body>footer{" +
      "opacity:0!important;visibility:hidden!important;pointer-events:none!important}";
    var early = document.getElementById(earlyId);
    if (!early) {
      early = document.createElement("style");
      early.id = earlyId;
      var rootEl = document.documentElement;
      (document.head || rootEl).insertBefore(early, (document.head || rootEl).firstChild);
    }
    early.setAttribute("data-vc", "preCineFlashKill1");
    early.textContent = earlyCss;
    /* perfDeskCut1 / holdFreezeKill1: svela + togli hold (mai cursore loading stuck) */
    window.setTimeout(function () {
      clearBootHoldWithCurtain();
    }, 1200);
    window.setTimeout(function () {
      try {
        var soft = document.getElementById("vc-soft-fx-css") || document.querySelector('link[href*="vc-soft-fx"]');
        if (!soft) {
          clearBootHoldWithCurtain();
          return;
        }
        var ok = false;
        try {
          ok = !!(soft.sheet && ((soft.sheet.cssRules && soft.sheet.cssRules.length) || (soft.sheet.rules && soft.sheet.rules.length)));
        } catch (eSh) {
          ok = soft.getAttribute("data-vc-sheet-loaded") === "1";
        }
        if (ok) clearBootHoldWithCurtain();
      } catch (eFs) {}
    }, 2800);
  } catch (eEarlyBlur) {}

  /* forceMidAll1 → … → pwaCpuRamCut1 → pwaCpuNuke1 */
  var FORCE_DESKTOP_TIER = "mid";
  var STORAGE_KEY = "vc_perf_tier_pref_v3";
  var lastTier = "";
  /* perfBgRam1 marker */
  /* notifTapEmptyFix1 marker */
  /* holdFreezeKill1 marker */
  /* pwaCpuRamCut1 marker */
  /* pwaCpuNuke1 marker */
  /* pwaCpuNuke3 marker */
  /* pwaCpuNuke4 marker */
  /* pwaCpuNuke5 marker */
  /* swStorageCpu2 marker */
  /* brandLogoStillAlways1 marker — logo/favicon/serata_film always still (no 1.4MB GIF wake storm) */
  /* gifGradRestore1 marker */
  /* phoneFxRestore1 marker */
  /* perfDeskCut1 marker */
  /* pwaFgCpu1 marker */
  /* pwaGifGlow1 marker */
  /* gifAlwaysOn2 marker */
  /* bgIdealSize1 marker — still 1920x768 / 1200x480 (5:2) */
  /* cpuPagesIdle1 marker */
  /* ulCountStick1 marker */
  /* cpuQuiet1 marker */
  /* bgCpuHard1 marker — hidden: still GIF+filter kill; fg idle: cine still */
  /* fgDecorCpu1 marker — fg idle: pause decorative infinite + GIF still + no cursor glow */
  /* idleGifGlowFix1: settle hides cursor glow (beat soft-fx); still a_*.webp + logo/avatar GIF */
  /* bgCpuSpike1 marker — hidden: marquee kill (chrome pin running!important) + still sync */
  /* navUserMqFix1 marker — user marquee pause SOLO page-hidden (non ui-gif-paused) */
  /* bgCpuHard2 marker — BG: pause inline marquee (batte CSS) + GIF freeze sync */
  /* pwaStillHard1 marker — PWA: FORCE still sfondo (GIF = 100% CPU; home-cine remounta) */
  /* pwaCpuKill2 marker — PWA: freeze TUTTE le GIF anche a focus; no thaw */
  /* pwaCpuKill3 marker — GIF sfondo+logo OFF sempre; Brave app senza standalone */
  /* pwaCpuKill4 marker — nuke CSS/anim SEMPRE (glow/vinyl/marquee = Browser 90%+) */
  /* pwaCpuKill5 marker — togli body* filter thrash; soft-fx-off; selettori mirati */
  /* fgRevertBgOnly1 marker — revert nuke in-app; quiet solo hidden */
  /* touchFxLite1 marker */

  /* fgRevertBgOnly1: niente FORCE/nuke in foreground — solo quiet a tab/app hidden */
  try {
    window.__VC_FORCE_PHOTO_STILL = 0;
    window.__VC_PWA_FREEZE_ALL_GIF = 0;
    window.__VC_PWA_CPU_NUKE = 0;
    /* bootCpuSettle1: tieni settle al boot (niente remove→spike); idle arm lo gestisce */
    document.documentElement.classList.remove("vc-pwa-cpu-nuke", "vc-soft-fx-off");
    document.documentElement.classList.add("vc-cpu-settle");
  } catch (ePwaStillEarly) {}

  /* touchFxLite1: mobile/coarse → meno filter/blur/marquee (anche in home) */
  function armTouchFxLite() {
    try {
      var root = document.documentElement;
      var ua = String((navigator && navigator.userAgent) || "");
      var touch =
        /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ||
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1);
      if (!touch) return;
      root.classList.add("vc-perf-touch", "vc-touch-fx-lite");
      var id = "vc-touch-fx-lite-css";
      if (document.getElementById(id)) return;
      var css =
        "html.vc-touch-fx-lite body.vc-body .vc-soft-vote-glow::before," +
        "html.vc-touch-fx-lite body.vc-body .vc-soft-vote-glow::after," +
        "html.vc-touch-fx-lite body.vc-body .vc-brand-glow{" +
        "filter:none!important;-webkit-filter:none!important;animation:none!important}" +
        "html.vc-touch-fx-lite body.vc-body .is-marquee:not(.vc-header-site-name):not([data-vc-nav-user-marquee])," +
        "html.vc-touch-fx-lite body.vc-body .vc-marquee:not([data-vc-nav-user-marquee]) > .vc-marquee__track{" +
        "animation:none!important;transform:none!important}" +
        "html.vc-touch-fx-lite body.vc-body .vc-nav-shell," +
        "html.vc-touch-fx-lite body.vc-body .vc-glass{" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}";
      var s = document.createElement("style");
      s.id = id;
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    } catch (eTouchLite) {}
  }
  try {
    armTouchFxLite();
  } catch (eTouchBoot) {}

  function isHomePage() {
    try {
      var b = document.body;
      if (b && b.classList.contains("vc-body--home")) return true;
      var p = String((typeof location !== "undefined" && location.pathname) || "/").replace(/\/+$/, "") || "/";
      return p === "/";
    } catch (eHome) {
      return false;
    }
  }

  function isStandalonePwa() {
    try {
      if (window.__VC_PWA_CPU_NUKE) return true;
      if (document.documentElement && document.documentElement.classList.contains("vc-pwa-cpu-nuke")) {
        return true;
      }
      if (window.matchMedia) {
        if (window.matchMedia("(display-mode: standalone)").matches) return true;
        if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
        if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
        if (window.matchMedia("(display-mode: window-controls-overlay)").matches) return true;
      }
      if (navigator.standalone) return true;
    } catch (e) {}
    return false;
  }

  /* cpuPagesIdle1: riporta soft-css DOPO soft-fx pin */
  function remountSiteCpuSoftCssLast() {
    try {
      var s = document.getElementById("vc-site-cpu-soft-css");
      if (!s) return;
      var mount = document.body || document.documentElement;
      if (s.parentNode === mount && mount.lastChild === s) return;
      mount.appendChild(s);
    } catch (eRm) {}
  }

  /* boardsAnimBannerClear1 + boardsAnimIconLive1: icone/banner bacheca restano GIF (no demote → webp statico) */
  function isBoardsAnimMediaImg(img) {
    if (!img) return false;
    try {
      if (img.getAttribute("data-vc-anim-media") === "1") return true;
      var cls = img.classList;
      if (
        cls &&
        (cls.contains("vc-boards-detail__icon") ||
          cls.contains("vc-boards-card__icon") ||
          cls.contains("vc-boards-mine-card__icon") ||
          cls.contains("vc-boards-form-hero__img") ||
          cls.contains("vc-boards-vote__icon") ||
          cls.contains("vc-boards-guild-tag__badge"))
      ) {
        return true;
      }
      if (cls && cls.contains("vc-boards-claim-card__ico-img")) return true;
      var src = String(img.getAttribute("src") || img.getAttribute("data-vc-gif-live") || "");
      if (/\/(?:icons|banners|app-icons)\/\d+\//i.test(src)) return true;
    } catch (eSkip) {}
    return false;
  }

  /* idleGifGlowFix1: still animated Discord CDN (gif + a_*.webp avatars) */
  function stillDiscordAnimUrl(src) {
    var s = String(src || "");
    if (!s) return "";
    if (/cdn\.discordapp\.com|media\.discordapp\.net/i.test(s)) {
      if (/\.gif(\?|$)/i.test(s)) return s.replace(/\.gif(\?|$)/i, ".webp$1");
      /* animated avatar/banner hash a_* → static png */
      var m = s.match(/\/(avatars|banners|icons|role-icons)\/([^/]+)\/a_([a-f0-9]+)\.(webp|gif)(\?.*)?$/i);
      if (m) {
        return s.replace(
          /\/(avatars|banners|icons|role-icons)\/([^/]+)\/a_([a-f0-9]+)\.(webp|gif)/i,
          "/$1/$2/$3.png",
        );
      }
    }
    if (/og-server-icon\.gif/i.test(s)) return "/images/og-server-icon-still.png?v=20261014bgCpuHard1";
    if (/discord\.gif/i.test(s) && !/discord\.com|cdn\.discord/i.test(s)) {
      return "/images/discord-still.png?v=20260915footerLogoGif1";
    }
    /* viewAsEyeHover2: eye gestito da vc-view-as (idle still / hover GIF) — no remap qui */
    if (/eyedarkmoving-trans\.gif/i.test(s)) {
      return "";
    }
    /* brandLogoStillAlways1: seratafilm card GIF */
    if (/serata_film\.gif/i.test(s)) {
      return "/seratafilm/serata_film-still.png?v=20261017brandLogoStill1";
    }
    return "";
  }

  /* brandLogoStillAlways1: favicon GIF = wake storm su ogni tab */
  function forceFaviconStill() {
    try {
      var still = "/images/og-server-icon-still.png?v=20261014bgCpuHard1";
      var links = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
      for (var i = 0; i < links.length; i++) {
        var href = String(links[i].getAttribute("href") || "");
        if (/og-server-icon\.gif/i.test(href)) links[i].setAttribute("href", still);
      }
    } catch (eFav) {}
  }

  function stillDiscordContentGifs() {
    /* brandLogoStillAlways1: brand/logo/serata_film sempre still (anche FG, non solo settle) */
    try {
      forceFaviconStill();
      var settle = false;
      try {
        settle = document.documentElement.classList.contains("vc-cpu-settle");
      } catch (eS) {}
      var imgs = document.querySelectorAll(
        settle
          ? 'img[src*=".gif"], img[src*="/a_"][src*=".webp"], img[src*="og-server-icon"], img.vcva-eye, header img, footer img, .discord-avatar-img, .vc-header-logo-img'
          : 'img[src*=".gif"], img[src*="og-server-icon"], img[src*="serata_film"], img.vc-header-logo-img, img.vc-premium-footer__logo-img, main img[src*=".gif"], #vc-page-content img[src*=".gif"], .vc-page-cine-body img[src*=".gif"], .vc-wiki-cmd-shell img[src*=".gif"], footer img[src*=".gif"]',
      );
      var i = 0;
      var CHUNK = 10;
      function step() {
        var end = Math.min(i + CHUNK, imgs.length);
          for (; i < end; i++) {
          var img = imgs[i];
          if (!img) continue;
          /* viewAsEyeHover2: Anteprima eye = solo view-as (no freeze/thaw) */
          try {
            if (img.classList && img.classList.contains("vcva-eye")) continue;
            if (img.closest && img.closest("#vc-view-as-launch[data-vc-eye-hovering='1']")) continue;
          } catch (eEyeSkip) {}
          /* logoHoverGif1: chrome-ui mette GIF su hover (__vcBrandHover) — non ributtare a still */
          try {
            if (img.__vcBrandHover) continue;
            if (img.getAttribute && img.getAttribute("data-vc-brand-hover") === "1") continue;
          } catch (eHovSkip) {}
          var src = String(img.getAttribute("src") || "");
          var isBrand =
            img.classList.contains("vc-header-logo-img") ||
            img.classList.contains("vc-premium-footer__logo-img") ||
            img.getAttribute("data-vc-brand-logo") === "1" ||
            /og-server-icon|serata_film\.gif/i.test(src);
          if (!settle) {
            /* brandLogoStillAlways1: non skippare brand — still subito (idle) */
            if (!isBrand) {
              if (img.classList.contains("vc-discord-login-emoji") || img.classList.contains("discord-avatar-img")) {
                continue;
              }
            }
          }
          if (isBoardsAnimMediaImg(img)) continue;
          var next = stillDiscordAnimUrl(src);
          if (!next || next === src) continue;
          try {
            if (!img.getAttribute("data-vc-gif-live")) img.setAttribute("data-vc-gif-live", src);
            img.setAttribute("src", next);
          } catch (eWp) {}
        }
        if (i < imgs.length) {
          window.setTimeout(step, 0);
        }
      }
      window.setTimeout(step, 0);
    } catch (eG) {}
  }

  /* mqIdleResumeAll2 + userMqIdlePause1: tab hidden / FG settle → pause soft
     (no reset@0 mid-spin). bustle → running dalla posizione corrente.
     Prima freezeInline thaw-ava il NOME in settle → restava vivo in idle. */
  function resetMqTrackToStart(el) {
    if (!el || !el.style) return;
    try {
      el.style.removeProperty("transform");
    } catch (eTx0) {}
    try {
      el.style.setProperty("animation-play-state", "paused", "important");
      el.style.setProperty("-webkit-animation-play-state", "paused", "important");
      el.style.setProperty("will-change", "auto", "important");
    } catch (eSt) {}
    try {
      if (el.__vcMqWaapi && typeof el.__vcMqWaapi.pause === "function") el.__vcMqWaapi.pause();
    } catch (eWp) {}
    try {
      var list = el.getAnimations ? el.getAnimations() : [];
      for (var ai = 0; ai < list.length; ai++) {
        try {
          if (typeof list[ai].pause === "function") list[ai].pause();
        } catch (eA) {}
      }
    } catch (eGa) {}
  }
  function thawMqTrack(el) {
    if (!el || !el.style) return;
    /* wmResumeHover1: transform:0 !important da resetMqTrackToStart
       bloccava i keyframes anche con play-state:running; play() su getAnimations
       altrimenti pause() WAAPI restava stuck dopo BG. */
    try {
      el.style.removeProperty("transform");
    } catch (eTx) {}
    try {
      el.style.setProperty("animation-play-state", "running", "important");
      el.style.setProperty("-webkit-animation-play-state", "running", "important");
      el.style.setProperty("will-change", "transform", "important");
    } catch (ePs) {}
    try {
      if (el.__vcMqWaapi && typeof el.__vcMqWaapi.play === "function") el.__vcMqWaapi.play();
    } catch (eWp) {}
    try {
      var list = el.getAnimations ? el.getAnimations() : [];
      for (var ai = 0; ai < list.length; ai++) {
        try {
          if (typeof list[ai].play === "function") list[ai].play();
        } catch (eA) {}
      }
    } catch (eGa) {}
  }
  function softPauseMqTrack(el) {
    /* mqNoSnapSettle1: pause soft — tiene currentTime (no reset@0 / no tx:0).
       Hard reset solo tab-hidden via resetMqTrackToStart. */
    if (!el || !el.style) return;
    try {
      el.style.setProperty("animation-play-state", "paused", "important");
      el.style.setProperty("-webkit-animation-play-state", "paused", "important");
      el.style.setProperty("will-change", "auto", "important");
    } catch (ePs) {}
    try {
      if (el.__vcMqWaapi && typeof el.__vcMqWaapi.pause === "function") el.__vcMqWaapi.pause();
    } catch (eWp) {}
    try {
      var list = el.getAnimations ? el.getAnimations() : [];
      for (var ai = 0; ai < list.length; ai++) {
        try {
          if (typeof list[ai].pause === "function") list[ai].pause();
        } catch (eA) {}
      }
    } catch (eGa) {}
  }
  function freezeInlineMarqueesForBg(on) {
    try {
      var pageHidden = false;
      try {
        pageHidden = Boolean(document.hidden) || document.visibilityState === "hidden";
      } catch (eHid) {}
      var pause = !!(on || pageHidden);
      /* userMqIdlePause1: settle FG + tab-hidden → pause NOME+wordmark (no thaw nome in idle) */
      var hard = pageHidden;
      var userTracks = document.querySelectorAll(
        "header .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track," +
          "#header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track," +
          "#vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track," +
          ".vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track",
      );
      /* cpuHoverIdle1b: settle/BG = pause; FG = clear inline (CSS paused+hover, no thaw) */
      function clearMqPlayInline(el) {
        if (!el || !el.style) return;
        try {
          el.style.removeProperty("animation-play-state");
          el.style.removeProperty("-webkit-animation-play-state");
          el.style.removeProperty("will-change");
          el.style.removeProperty("transform");
        } catch (eClr) {}
      }
      for (var u = 0; u < userTracks.length; u++) {
        var ut = userTracks[u];
        if (!ut || !ut.style) continue;
        if (pause) {
          /* hoverMqSocial1: FG settle = solo CSS (:hover può running). Inline !important bloccava hover. */
          if (hard) resetMqTrackToStart(ut);
          else clearMqPlayInline(ut);
        } else {
          clearMqPlayInline(ut);
        }
      }
      var wmTracks = document.querySelectorAll(
        "header a.vc-header-site-name.is-marquee .vc-header-site-name__track," +
          ".vc-mobile-nav-drawer__brand a.vc-header-site-name.is-marquee .vc-header-site-name__track",
      );
      for (var w = 0; w < wmTracks.length; w++) {
        var wt = wmTracks[w];
        if (!wt || !wt.style) continue;
        /* hoverMqSocial1b: MAI paused !important inline in FG —
           bloccava CSS :hover + setTrackRunning (bustle riscriveva paused).
           settle/bustle = clear inline; CSS paused + :hover/JS running. */
        if (pause && hard) resetMqTrackToStart(wt);
        else clearMqPlayInline(wt);
      }
      /* hoverMqSocial1b: promo come wordmark — no paused !important in settle FG */
      var promoTracks = document.querySelectorAll("header .vc-header-promo-btn__track");
      for (var i = 0; i < promoTracks.length; i++) {
        var el = promoTracks[i];
        if (!el || !el.style) continue;
        if (pause && hard) {
          el.style.setProperty("animation-play-state", "paused", "important");
          el.style.setProperty("will-change", "auto", "important");
        } else {
          clearMqPlayInline(el);
        }
      }
      var promoDots = document.querySelectorAll("header .vc-header-promo-btn__dot");
      for (var d = 0; d < promoDots.length; d++) {
        var dot = promoDots[d];
        if (!dot || !dot.style) continue;
        try {
          dot.style.removeProperty("animation-play-state");
          dot.style.removeProperty("-webkit-animation-play-state");
          dot.style.removeProperty("will-change");
        } catch (eDotClr) {}
      }
    } catch (eMq) {}
  }

  /* cpuQuiet1 + violKill1 + bgCpuHard2: tab hidden → freeze GIF subito (no 48ms GIF decode) */
  function freezeGifDecodeForBg(on) {
    try {
      try {
        if (!on && (document.hidden || document.visibilityState === "hidden")) on = true;
      } catch (eHidFr) {}
      var imgs = null;
      var i = 0;
      var CHUNK = on ? 8 : 4;
      function step() {
        try {
          if (!imgs) {
            imgs = document.querySelectorAll(
              on
                ? 'img[src*=".gif"], img[src*="/a_"][src*=".webp"], img[src*="og-server-icon"], img[src*="discord.gif"], img.vcva-eye, .discord-avatar-img, .vc-header-logo-img'
                : "img[data-vc-gif-live]",
            );
          }
        } catch (eQ) {
          return;
        }
        var end = Math.min(i + CHUNK, imgs.length);
          for (; i < end; i++) {
          var img = imgs[i];
          if (!img) continue;
          var cur = String(img.getAttribute("src") || "");
          if (on) {
            if (isBoardsAnimMediaImg(img)) continue;
            /* viewAsEyeHover2: non toccare eye Anteprima */
            try {
              if (img.classList && img.classList.contains("vcva-eye")) continue;
            } catch (eEyeFr) {}
            /* logoHoverGif1: non spezzare GIF mentre l'utente è in hover sul logo */
            try {
              if (img.__vcBrandHover) continue;
              if (img.getAttribute && img.getAttribute("data-vc-brand-hover") === "1") continue;
            } catch (eFrHov) {}
            var nextFr = stillDiscordAnimUrl(cur);
            if (!nextFr && !/\.gif(\?|$)/i.test(cur)) continue;
            if (!img.getAttribute("data-vc-gif-live")) img.setAttribute("data-vc-gif-live", cur);
            if (nextFr) img.setAttribute("src", nextFr);
          } else {
            /* viewAsEyeHover2: eye solo hover view-as — mai thaw GIF da perf */
            if (img.classList && img.classList.contains("vcva-eye")) {
              try {
                img.removeAttribute("data-vc-gif-live");
                if (/\.gif(\?|$)/i.test(cur)) {
                  img.setAttribute(
                    "src",
                    "/images/eyedarkmoving-trans-still.png?v=20261019viewAsEyeHover2",
                  );
                }
              } catch (eEyeClr) {}
              continue;
            }
            /* logoHoverGif1: brand/discord hover gestiti da chrome-ui */
            try {
              if (img.__vcBrandHover) continue;
              if (img.getAttribute && img.getAttribute("data-vc-brand-hover") === "1") continue;
            } catch (eThHov) {}
            var live = img.getAttribute("data-vc-gif-live");
            if (!live) continue;
            if (live !== cur) img.setAttribute("src", live);
          }
        }
        if (i < imgs.length) {
          window.setTimeout(step, on ? 0 : 24);
        }
      }
      /* bgCpuHard2: freeze sync primo chunk; thaw resta defer */
      if (on) step();
      else window.setTimeout(step, 48);
    } catch (eFr) {}
  }

  function cancelRunningCssAnimations() {
    /* perfIdleReflow1: getAnimations() = Forced reflow (fino a ~1s) — CSS nuke basta */
    return;
  }

  /* alias legacy */
  function cancelPwaCssAnimations() {
    cancelRunningCssAnimations();
  }

  /* violKillCue1/Cue2: solo setTimeout — rIC({timeout}) → Violation idle 140ms+ */
  function deferHeavy(fn) {
    var ran = false;
    function run() {
      if (ran) return;
      ran = true;
      try {
        fn();
      } catch (eF) {}
    }
    window.setTimeout(run, 48);
  }

  /* cssConsol1: un solo blocco late-wins — kill décor (animation:none), keep user+wordmark */
  function remountPageHiddenCpuCssLast() {
    try {
      var s = document.getElementById("vc-page-hidden-cpu-css");
      if (!s) return;
      var mount = document.body || document.documentElement;
      if (s.parentNode === mount && mount.lastChild === s) return;
      mount.appendChild(s);
    } catch (eRmCpu) {}
  }
  function ensurePageHiddenCpuCss() {
    try {
      var id = "vc-page-hidden-cpu-css";
      var MARK = "cpuIdleAll1b";
      var s = document.getElementById(id);
      if (s && s.getAttribute("data-vc") === MARK) {
        remountPageHiddenCpuCssLast();
        return;
      }
      if (!s) {
        s = document.createElement("style");
        s.id = id;
        (document.head || document.documentElement).appendChild(s);
      }
      s.setAttribute("data-vc", MARK);
      /* cpuIdleAll1: footer dots + décor infinite; promo candidature = CSS :hover only
         (no animation:none shorthand sul promo — bloccava play-state:running) */
      var pulseKill =
        "html body.vc-body .vc-footer-sys-status__dot," +
        "html.vc-site-polish body.vc-body .vc-footer-sys-status__dot," +
        "html body.vc-body .vc-footer-heart," +
        "html.vc-site-polish body.vc-body .vc-footer-heart{" +
        "animation:none!important;-webkit-animation:none!important;" +
        "animation-play-state:paused!important;will-change:auto!important}" +
        "html body.vc-body header #discord-login-btn .vc-discord-login-icon," +
        "html body.vc-body header button.vc-discord-login-btn .vc-discord-login-icon," +
        "html body.vc-body .vc-mobile-nav-footer__login.vc-discord-login-btn .vc-discord-login-icon," +
        "html body.vc-body header #discord-login-btn .fa-discord," +
        "html body.vc-body header button.vc-discord-login-btn .fa-discord," +
        "html body.vc-body .vc-kick-pip__live-dot," +
        "html body.vc-body .vc-sponsor-promo-badge," +
        "html body.vc-body .vc-sponsor-tier-promo{" +
        "animation:none!important;-webkit-animation:none!important;" +
        "animation-play-state:paused!important;transform:none!important;will-change:auto!important}" +
        "html body.vc-body #vc-header-promo-btn .vc-header-promo-btn__dot," +
        "html.vc-site-polish body.vc-body #vc-header-promo-btn .vc-header-promo-btn__dot," +
        "html body.vc-body #header-quick-actions #vc-header-promo-btn .vc-header-promo-btn__dot{" +
        "animation-play-state:paused!important;-webkit-animation-play-state:paused!important;" +
        "will-change:auto!important}" +
        "html body.vc-body #vc-header-promo-btn.vc-header-promo-btn--candidature:hover .vc-header-promo-btn__dot," +
        "html body.vc-body #vc-header-promo-btn.vc-header-promo-btn--candidature:focus-visible .vc-header-promo-btn__dot," +
        "html.vc-site-polish body.vc-body #vc-header-promo-btn.vc-header-promo-btn--candidature:hover .vc-header-promo-btn__dot," +
        "html.vc-site-polish body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn--candidature:hover .vc-header-promo-btn__dot," +
        "html body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn--candidature:hover .vc-header-promo-btn__dot," +
        "html body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn--candidature:focus-visible .vc-header-promo-btn__dot{" +
        "animation-name:vc-header-promo-dot-pulse!important;" +
        "animation-duration:1.6s!important;animation-timing-function:ease-in-out!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-play-state:running!important;-webkit-animation-play-state:running!important;" +
        "will-change:transform,opacity!important}";
      var settleKill =
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__grain," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__aura," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__canvas," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__photo," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-page-cine-hero__grain," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-page-cine-hero__aura," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-forbidden-book," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-forbidden-book--flying," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-footer-heart," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-kick-pip__live-dot," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-sponsor-promo-badge," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-sponsor-tier-promo," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body header #discord-login-btn .vc-discord-login-icon," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body header button.vc-discord-login-btn .vc-discord-login-icon," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body--home .vc-home-cine-hero h1.vc-brand-glow," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body--home .vc-home-cine-hero h1.vc-brand-glow .vc-hero-brand-pre," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body--home .vc-home-cine-hero h1.vc-brand-glow .vc-hero-brand-caffe," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body--home .vc-home-cine-hero h1.vc-brand-glow .text-emerald-300," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body--home .vc-home-cine-hero h1.vc-brand-glow span," +
        /* hoverToastAnim1b: promo track/dot restano gestiti da :hover (no settle kill) */
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-soft-vote-glow," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-soft-vote-glow::before," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-soft-vote-glow::after," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body [class*='vc-vote-progress']::before," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body [class*='vc-vote-progress']::after," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body [class*='vc-home-metal']," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-fx-sheen," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body [class*='__sheen']," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-nav-shell::before," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-nav-shell::after," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-premium-footer__outer::after," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-page-cine-card::before," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-fx-card::before," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-vote-live-statbox::before," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-footer-sys-status__dot," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-scroll-cue," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-scroll-cue *{" +
        "animation:none!important;-webkit-animation:none!important;" +
        "animation-play-state:paused!important;" +
        "transition:none!important;transition-duration:0s!important;" +
        "will-change:auto!important}" +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__canvas," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__grain," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__aura," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-page-cine-hero__grain," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-page-cine-hero__aura{" +
        "display:none!important;visibility:hidden!important;opacity:0!important;" +
        "pointer-events:none!important}";
      s.textContent =
        "html.vc-page-hidden body.vc-body," +
        "html.vc-page-hidden body.vc-body *," +
        "html.vc-page-hidden body.vc-body *::before," +
        "html.vc-page-hidden body.vc-body *::after," +
        "html.vc-ui-gif-paused body.vc-body," +
        "html.vc-ui-gif-paused body.vc-body *," +
        "html.vc-ui-gif-paused body.vc-body *::before," +
        "html.vc-ui-gif-paused body.vc-body *::after{" +
        "animation-play-state:paused!important;" +
        "transition:none!important;" +
        "filter:none!important;-webkit-filter:none!important;" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
        pulseKill +
        settleKill +
        /* hoverToastAnim1b late-win: candidature pulse + marquee solo hover anche in settle */
        "html.vc-cpu-settle body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn--candidature:hover .vc-header-promo-btn__dot," +
        "html.vc-cpu-settle body.vc-body #vc-header-promo-btn.vc-header-promo-btn--candidature:hover .vc-header-promo-btn__dot," +
        "html.vc-cpu-settle body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn--candidature:focus-visible .vc-header-promo-btn__dot{" +
        "animation-name:vc-header-promo-dot-pulse!important;" +
        "animation-duration:1.6s!important;animation-timing-function:ease-in-out!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-play-state:running!important;-webkit-animation-play-state:running!important;" +
        "will-change:transform,opacity!important}" +
        "html.vc-cpu-settle body.vc-body #header-quick-actions #vc-header-promo-btn.is-marquee:hover .vc-header-promo-btn__track," +
        "html.vc-cpu-settle body.vc-body #vc-header-promo-btn.is-marquee:hover .vc-header-promo-btn__track," +
        "html.vc-cpu-settle body.vc-body #header-quick-actions #vc-header-promo-btn.is-marquee:focus-visible .vc-header-promo-btn__track{" +
        "animation-play-state:running!important;-webkit-animation-play-state:running!important;" +
        "will-change:transform!important}" +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-ui-spinner," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-ui-spinner *{" +
        "animation-play-state:running!important}" +
        /* mqIdleResumeAll2: settle → pause nome+wordmark (no running override) */
        "html.vc-cpu-settle body.vc-body header a.vc-header-site-name.is-marquee:not(:hover):not(:focus-visible) .vc-header-site-name__track," +
        "html.vc-cpu-settle.vc-site-polish body.vc-body header a.vc-header-site-name.is-marquee:not(:hover):not(:focus-visible) .vc-header-site-name__track," +
        "html.vc-cpu-settle body.vc-body .vc-mobile-nav-drawer__brand a.vc-header-site-name.is-marquee:not(:hover):not(:focus-visible) .vc-header-site-name__track," +
        "html.vc-cpu-settle body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee:not(:hover):not(:focus-within) .vc-marquee__track," +
        "html.vc-cpu-settle body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee:not(:hover):not(:focus-within) .vc-marquee__track," +
        "html.vc-cpu-settle.vc-site-polish body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee:not(:hover):not(:focus-within) .vc-marquee__track," +
        "html.vc-cpu-settle body.vc-body #vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee:not(:hover):not(:focus-within) .vc-marquee__track{" +
        "animation-play-state:paused!important;" +
        "-webkit-animation-play-state:paused!important;" +
        "will-change:auto!important}" +
        "html.vc-cpu-settle #vc-site-cursor-light," +
        "html.vc-cpu-settle.vc-site-cursor-on #vc-site-cursor-light," +
        "html.vc-cpu-settle #vc-site-cursor-light::before," +
        "html.vc-cpu-settle #vc-site-cursor-light::after{" +
        "display:none!important;opacity:0!important;visibility:hidden!important;" +
        "pointer-events:none!important;background:none!important}" +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body .vc-ul-card," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body .vc-reviews-list>.vc-reviews-card," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body .vc-staff-inbox-item," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body .vc-wt-thread-row," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body .vc-notif-item," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body .vc-boards-card:not(.vc-boards-compose)," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-faq-page main details," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-regole-page main details," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body main .vc-regole-card details{" +
        "content-visibility:auto;" +
        "contain-intrinsic-size:auto 140px}";
      remountPageHiddenCpuCssLast();
    } catch (eCss) {}
  }

  function armGlobalCpuQuiet() {
    if (window.__vcCpuQuietArmed) return;
    window.__vcCpuQuietArmed = 1;
    ensurePageHiddenCpuCss();
    function sleep() {
      /* fgRevertBgOnly1 + bgCpuHard2: class + still + pause marquee inline subito */
      try {
        document.documentElement.classList.add("vc-page-hidden", "vc-ui-gif-paused");
      } catch (eCls) {}
      try {
        applyCineGifStillSwap(true);
      } catch (eCineSync) {}
      try {
        freezeInlineMarqueesForBg(true);
      } catch (eMqSleep) {}
      try {
        freezeGifDecodeForBg(true);
      } catch (eGifSync) {}
      try {
        window.dispatchEvent(new CustomEvent("vc:cpu-sleep"));
      } catch (eEv) {}
      deferHeavy(function () {
        try {
          applyCineGifStillSwap(true);
        } catch (eCine) {}
        try {
          freezeInlineMarqueesForBg(true);
        } catch (eMq2) {}
        freezeGifDecodeForBg(true);
      });
    }
    function wake() {
      /* bootResumeCpu1: FG = class + marquee clear; GIF restano still
         (thaw GIF = decode storm 50–100% al ritorno da BG). Logo hover = chrome-ui. */
      try {
        document.documentElement.classList.remove(
          "vc-page-hidden",
          "vc-ui-gif-paused",
          "vc-pwa-bg-frozen",
          "vc-gif-paused",
          "vc-photo-idle",
        );
      } catch (eRm) {}
      try {
        var homeWake = false;
        try {
          homeWake = !!(document.body && document.body.classList.contains("vc-body--home"));
        } catch (eHw) {}
        if (homeWake) document.documentElement.classList.add("vc-cpu-settle");
      } catch (eSetHome) {}
      try {
        freezeInlineMarqueesForBg(false);
      } catch (eMqWake) {}
      try {
        window.dispatchEvent(new CustomEvent("vc:cpu-wake"));
      } catch (eEv2) {}
      deferHeavy(function () {
        try {
          stillDiscordContentGifs();
        } catch (eStillW) {}
        try {
          freezeGifDecodeForBg(true);
        } catch (eGifKeep) {}
        try {
          applyCineGifStillSwap(true);
        } catch (eCineKeep) {}
        try {
          freezeInlineMarqueesForBg(false);
        } catch (eMqW2) {}
        try {
          remountPageHiddenCpuCssLast();
        } catch (eRmW) {}
      });
    }
    function sync() {
      /* perfIdleReflow1: class sync in rAF; heavy fuori (no nested idle→idle) */
      try {
        if (document.hidden || document.visibilityState === "hidden") sleep();
        else wake();
      } catch (eSy) {
        try {
          wake();
        } catch (eW) {}
      }
    }
    try {
      document.addEventListener("visibilitychange", sync, false);
      window.addEventListener("pageshow", sync, false);
      /* sitePerfAll1: Page Lifecycle freeze/resume (oltre visibility) */
      document.addEventListener(
        "freeze",
        function () {
          try {
            sleep();
          } catch (eFrz) {}
        },
        false,
      );
      document.addEventListener(
        "resume",
        function () {
          try {
            sync();
          } catch (eRes) {}
        },
        false,
      );
      window.addEventListener(
        "pagehide",
        function () {
          try {
            document.documentElement.classList.add("vc-page-hidden", "vc-ui-gif-paused");
          } catch (ePh) {}
          try {
            freezeInlineMarqueesForBg(true);
          } catch (ePhMq) {}
          try {
            applyCineGifStillSwap(true);
          } catch (ePhStill) {}
          try {
            freezeGifDecodeForBg(true);
          } catch (ePhGif) {}
        },
        false,
      );
      window.setTimeout(sync, 0);
      window.setTimeout(function () {
        deferHeavy(stillDiscordContentGifs);
      }, 1200);
    } catch (eArm) {}
  }

  /* focusCssShedRevert1: NON disabilitare landing-core — sfascia layout non-home.
     Framelag: ridotto sotto con contain/hover-soft, non togliendo il CSS. */
  function shedHeavyLandingCss() {
    try {
      /* safety: se un build precedente ha disabilitato landing-core, riattivalo */
      document.querySelectorAll('link[rel="stylesheet"][data-vc-shed="landing-core"]').forEach(function (l) {
        try {
          l.disabled = false;
          l.removeAttribute("data-vc-shed");
        } catch (eOn) {}
      });
      document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
        try {
          var h = l.getAttribute("href") || "";
          if (/vc-landing-core/i.test(h) && l.disabled) {
            l.disabled = false;
          }
        } catch (eOn2) {}
      });
      window.__vcLandingCoreShed = 0;
      var crit = document.getElementById("vc-pages-crit-css");
      if (crit && crit.parentNode) {
        try {
          crit.parentNode.removeChild(crit);
        } catch (eRm) {}
      }
    } catch (eShed) {}
  }

  /* cpuPagesIdle1: non-home — soft kill filter/GIF/anim (home resta piena) */
  function armSiteCpuSoft() {
    if (isStandalonePwa()) return;
    try {
      var root = document.documentElement;
      if (!document.body) {
        if (!window.__vcSiteCpuSoftWaitBody) {
          window.__vcSiteCpuSoftWaitBody = 1;
          document.addEventListener(
            "DOMContentLoaded",
            function () {
              window.__vcSiteCpuSoftWaitBody = 0;
              armSiteCpuSoft();
            },
            { once: true },
          );
        }
        /* pathname-only: marca soft subito se non-home */
        if (!isHomePage()) root.classList.add("vc-site-cpu-soft");
        return;
      }
      var soft = !isHomePage();
      root.classList.toggle("vc-site-cpu-soft", soft);
      if (!soft) {
        var oldOff = document.getElementById("vc-site-cpu-soft-css");
        if (oldOff && oldOff.parentNode) {
          try {
            oldOff.parentNode.removeChild(oldOff);
          } catch (eRmOff) {}
        }
        return;
      }
      var id = "vc-site-cpu-soft-css";
      if (window.__vcSiteCpuSoftOneShot && document.getElementById(id)) {
        remountSiteCpuSoftCssLast();
        stillDiscordContentGifs();
        return;
      }
      var existing = document.getElementById(id);
      if (existing) {
        try {
          if (existing.parentNode) existing.parentNode.removeChild(existing);
        } catch (eRmEx) {}
      }
      var s = document.createElement("style");
      s.id = id;
      s.setAttribute("data-vc", "cpuPagesIdle1");
      s.textContent =
        "html.vc-site-cpu-soft body.vc-body .vc-forbidden-book," +
        "html.vc-site-cpu-soft body.vc-body .vc-forbidden-book--flying{" +
        "display:none!important}" +
        "html.vc-site-cpu-soft{" +
        "--vc-nav-glow-angle:0deg!important}" +
        /* header chrome glow (drop-shadow + GIF) = idle CPU */
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-header-logo-link," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-notif-summary," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-lang-toggle," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .discord-account-btn," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-nav-shell," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-nav-shell.vc-glass," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-nav-shell::before," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-nav-shell::after," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body footer .vc-premium-footer__outer," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body footer .vc-premium-footer__outer::after," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body footer .vc-premium-footer__wordmark," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body .vc-soft-vote-glow," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body .vc-soft-vote-glow::before," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body .vc-soft-vote-glow::after{" +
        "filter:none!important;-webkit-filter:none!important;" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important;" +
        "animation:none!important}" +
        /* page-cine cards: no filter/blur compositing — NO content-visibility
           (ulCountStick1: content-vis spezzava grid 9 card + countup IO flash 0) */
        "html.vc-site-cpu-soft body.vc-page-cine-layout :is(" +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-glass,.vc-hero-head," +
        ".vc-faq-group,.vc-faq-item,.vc-regole-card,.vc-role-card,.vc-ul-card," +
        ".vc-wiki-cmd-shell,.vc-reviews-card,.vc-reviews-formcard,.vc-legal-card," +
        ".vc-perks-card,.vc-staff-block,.vc-sponsor-card,.vc-sponsor-embed," +
        ".vc-candidature-card,.vc-snav-panel,.vc-notif-panel,.discord-account-popover" +
        "){" +
        "filter:none!important;-webkit-filter:none!important;" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
        "html.vc-site-cpu-soft body.vc-users-page #vc-ul-grid," +
        "html.vc-site-cpu-soft body.vc-users-page .vc-ul-grid," +
        "html.vc-site-cpu-soft body.vc-users-page .vc-ul-card," +
        "html.vc-site-cpu-soft body.vc-users-page .vc-notify-stat," +
        "html.vc-site-cpu-soft body.vc-roles-page .vc-role-card," +
        "html.vc-site-cpu-soft body.vc-roles-page #vc-roles-grid{" +
        "content-visibility:visible!important;contain:none!important;" +
        "contain-intrinsic-size:none!important}" +
        "@media (min-width:1024px){" +
        "html.vc-site-cpu-soft body.vc-users-page #vc-ul-grid," +
        "html.vc-site-cpu-soft body.vc-users-page .vc-ul-grid{" +
        "grid-template-columns:repeat(3,minmax(0,1fr))!important}}" +
        "html.vc-site-cpu-soft body.vc-page-cine-layout :is(" +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-faq-group,.vc-regole-card," +
        ".vc-role-card,.vc-ul-card,.vc-wiki-cmd-shell,.vc-reviews-card,.vc-legal-card," +
        ".vc-perks-card,.vc-staff-block" +
        ")::before," +
        "html.vc-site-cpu-soft body.vc-page-cine-layout :is(" +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-faq-group,.vc-regole-card," +
        ".vc-role-card,.vc-ul-card,.vc-wiki-cmd-shell,.vc-reviews-card,.vc-legal-card," +
        ".vc-perks-card,.vc-staff-block" +
        ")::after{" +
        "filter:none!important;-webkit-filter:none!important;" +
        "animation:none!important;backdrop-filter:none!important}" +
        /* navUserNameMarqueeKeep1: non killare nome chip account (data-vc-nav-user-marquee) */
        "html.vc-site-cpu-soft body.vc-body .is-marquee:not(.vc-header-site-name):not([data-vc-nav-user-marquee])," +
        "html.vc-site-cpu-soft body.vc-body .vc-marquee:not([data-vc-nav-user-marquee]) > .vc-marquee__track{" +
        "animation:none!important;transform:none!important}" +
        /* mqHoverOnly1: brand in cpu-soft — keyframes ok, play SOLO hover */
        "html.vc-site-cpu-soft:not(.vc-page-hidden):not(.vc-cpu-settle) body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track{" +
        "animation-name:vc-guild-name-marquee!important;" +
        "animation-duration:var(--vc-marquee-duration,12s)!important;" +
        "animation-timing-function:linear!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-delay:0.35s!important;" +
        "animation-fill-mode:none!important;" +
        "animation-play-state:paused!important;" +
        "-webkit-animation-play-state:paused!important;" +
        "will-change:auto!important}" +
        /* homeHoverMq1: hover wordmark anche in settle */
        /* mqVisFix1: MAI transform:none su track — spegneva i keyframes (ct avanza, testo fermo) */
        "html.vc-site-cpu-soft:not(.vc-page-hidden) body.vc-body header a.vc-header-site-name.is-marquee:hover .vc-header-site-name__track," +
        "html.vc-site-cpu-soft:not(.vc-page-hidden) body.vc-body header a.vc-header-site-name.is-marquee:focus-visible .vc-header-site-name__track," +
        "html.vc-site-cpu-soft.vc-cpu-settle:not(.vc-page-hidden) body.vc-body header a.vc-header-site-name.is-marquee:hover .vc-header-site-name__track," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body header a.vc-header-site-name.is-marquee:hover .vc-header-site-name__track{" +
        "animation-play-state:running!important;" +
        "-webkit-animation-play-state:running!important;" +
        "will-change:transform!important}" +
        /* homeHoverMq1: nome — running fuori settle; in settle solo hover */
        "html.vc-site-cpu-soft:not(.vc-page-hidden):not(.vc-cpu-settle) body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-site-cpu-soft:not(.vc-page-hidden):not(.vc-cpu-settle) body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-site-cpu-soft:not(.vc-page-hidden) body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee:hover .vc-marquee__track," +
        "html.vc-site-cpu-soft:not(.vc-page-hidden) body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee:hover .vc-marquee__track," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee:hover .vc-marquee__track," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee:hover .vc-marquee__track{" +
        "animation-name:vc-guild-name-marquee!important;" +
        "animation-duration:var(--vc-marquee-duration,12s)!important;" +
        "animation-timing-function:linear!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-delay:0s!important;" +
        "animation-fill-mode:none!important;" +
        "animation-play-state:running!important;" +
        "will-change:transform!important}" +
        /* focusCssShedRevert1: meno lavoro a focus — no cursor glow, no transition thrash */
        "html.vc-site-cpu-soft #vc-site-cursor-light," +
        "html.vc-site-cpu-soft #vc-site-cursor-light::before," +
        "html.vc-site-cpu-soft #vc-site-cursor-light::after{" +
        "display:none!important;opacity:0!important;visibility:hidden!important;" +
        "pointer-events:none!important}" +
        /* cursorMqStable1: vinyl su html/body; * inherit */
        "html.vc-site-cpu-soft.vc-site-cursor-on," +
        "html.vc-site-cpu-soft.vc-site-cursor-ok," +
        "html.vc-site-cpu-soft.vc-site-cursor-ok body{" +
        "cursor:url(/images/musicrecordspin-cursor-static.png) 12 12," +
        "url(/images/musicrecordspin-cursor-static.png) 12 12, auto!important}" +
        "html.vc-site-cpu-soft.vc-site-cursor-ok *{cursor:inherit!important}" +
        "html.vc-site-cpu-soft body.vc-page-cine-layout main," +
        "html.vc-site-cpu-soft body.vc-web-tickets-page .vc-wt-board," +
        "html.vc-site-cpu-soft body.vc-web-tickets-page .vc-wt-app{" +
        "contain:layout!important}" +
        "html.vc-site-cpu-soft body.vc-page-cine-layout :is(a,button,.vc-header-pill,.vc-snav-row," +
        ".vc-wt-card,.vc-reviews-card,.vc-faq-item,.vc-legal-card,.vc-role-card,.vc-ul-card):hover{" +
        "filter:none!important;-webkit-filter:none!important;" +
        "transform:none!important}";
      var mount = document.body || document.head || root;
      mount.appendChild(s);
      window.__vcSiteCpuSoftOneShot = 1;
      /* ulCountStick1: NO cancelPwaCssAnimations — spegneva countup / layout mid-boot */
      /* perfIdleReflow1: gif still deferred */
      deferHeavy(stillDiscordContentGifs);
      window.setTimeout(function () {
        remountSiteCpuSoftCssLast();
        deferHeavy(stillDiscordContentGifs);
      }, 900);
    } catch (eSoft) {}
  }

  /* pwaIdleCpu1: riporta nuke-css DOPO soft-fx pin (altrimenti glow/marquee vincono) */
  function remountNukeCssLast() {
    /* pwaCpuKill4: remount anche fuori standalone */
    if (!window.__VC_PWA_CPU_NUKE && !isStandalonePwa()) return;
    try {
      var s = document.getElementById("vc-pwa-cpu-nuke-css");
      if (!s) return;
      var mount = document.body || document.documentElement;
      if (s.parentNode === mount && mount.lastChild === s) return;
      mount.appendChild(s);
    } catch (eRm) {}
  }

  function cineStillUrlFor(photo) {
    /* homePerfIdle1: sfondo always webp still (stessa foto, meno bytes) */
    var ver = "20261019homePerfIdle1";
    try {
      var src = String((photo && (photo.getAttribute("src") || photo.src)) || "");
      if (/sfondo-mobile/i.test(src)) return "/images/sfondo-mobile-still.webp?v=" + ver;
      if (window.matchMedia && window.matchMedia("(max-width:639.98px)").matches) {
        return "/images/sfondo-mobile-still.webp?v=" + ver;
      }
    } catch (eStill) {}
    return "/images/sfondo-still.webp?v=" + ver;
  }

  function cineGifUrlFor(photo) {
    /* homePerfIdle1: mai GIF sfondo — stesso webp still */
    return cineStillUrlFor(photo);
  }

  function applyCineGifStillSwap(freeze) {
    /* bgGifAlways2: freeze→still; thaw→GIF (mai still su tab visibile)
       confBgNoGifBlack1: mai toccare foto locked / confessionale (JPG → sfondo.gif = nero) */
    try {
      var confRoute = false;
      try {
        confRoute =
          document.documentElement.classList.contains("vc-confessionale-route") ||
          (document.body && document.body.classList.contains("vc-confessionale-page"));
      } catch (eConf) {
        confRoute = false;
      }
      var photos = document.querySelectorAll("img.vc-home-cine__photo, .vc-home-cine img[src*='sfondo']");
      for (var i = 0; i < photos.length; i++) {
        var photo = photos[i];
        if (!photo || !photo.tagName || photo.tagName.toLowerCase() !== "img") continue;
        if (photo.classList.contains("discord-avatar-img") || photo.classList.contains("vc-avatar")) continue;
        try {
          if (
            confRoute ||
            photo.getAttribute("data-vc-cine-photo-lock") === "1" ||
            (photo.dataset && photo.dataset.vcCinePhotoLock === "1") ||
            /Confessionale-GF/i.test(String(photo.getAttribute("src") || ""))
          ) {
            continue;
          }
        } catch (eLock) {}
        if (!freeze) {
          /* prima che home-cine armi: non toccare (LCP still) */
          try {
            if (!window.__VC_SITE_PHOTO_GIF_ARMED) continue;
          } catch (eArm) {}
        }
        var want = freeze ? cineStillUrlFor(photo) : cineGifUrlFor(photo);
        var cur = String(photo.getAttribute("src") || "");
        if (cur.indexOf(want.split("?")[0]) < 0) {
          photo.setAttribute("src", want);
        }
      }
    } catch (eSwap) {}
  }

  function setPwaBgFrozen(on) {
    try {
      var hidden = false;
      try {
        hidden = Boolean(document.hidden || document.visibilityState === "hidden");
      } catch (eH) {}
      document.documentElement.classList.toggle("vc-page-hidden", hidden);
      document.documentElement.classList.remove("vc-ui-gif-paused", "vc-pwa-bg-frozen", "vc-photo-idle");
      if (!hidden) document.documentElement.classList.remove("vc-gif-paused");
    } catch (eCls) {}
    /* bgGifRestore1: still solo hidden; thaw → GIF */
    applyCineGifStillSwap(Boolean(on) || Boolean(document.hidden));
    if (!on && !document.hidden) {
      try {
        window.dispatchEvent(new CustomEvent("vc:pwa-bg-thaw"));
      } catch (eEv2) {}
    }
  }

  function pwaShouldFreezeBg() {
    try {
      if (document.visibilityState === "hidden" || document.hidden) return true;
    } catch (eH) {}
    return false;
  }

  /* bgGifRestore1 + cpuQuiet1 + pwaResumeLag1: PWA — still solo dopo hide lunga (resume corto no swap) */
  function armPwaIdleGifFreeze() {
    if (!isStandalonePwa()) return;
    if (window.__vcPwaGifFreezeArmed) return;
    window.__vcPwaGifFreezeArmed = 1;
    var lastHidden = null;
    var stillSwapTimer = 0;
    var STILL_SWAP_AFTER_MS = 18000;
    function clearStillSwapTimer() {
      if (!stillSwapTimer) return;
      try {
        window.clearTimeout(stillSwapTimer);
      } catch (eClr) {}
      stillSwapTimer = 0;
    }
    function syncVis() {
      var hidden = false;
      try {
        hidden = Boolean(document.hidden || document.visibilityState === "hidden");
      } catch (eH) {
        hidden = false;
      }
      if (lastHidden === hidden) return;
      lastHidden = hidden;
      try {
        if (hidden) {
          document.documentElement.classList.add("vc-page-hidden", "vc-gif-paused");
        } else {
          document.documentElement.classList.remove(
            "vc-page-hidden",
            "vc-gif-paused",
            "vc-ui-gif-paused",
            "vc-pwa-bg-frozen",
            "vc-photo-idle",
          );
        }
      } catch (eCls) {}
      if (hidden) {
        /* pwaResumeLag1: non swap→still subito (riapertura da app switch = lag da re-decode) */
        clearStillSwapTimer();
        stillSwapTimer = window.setTimeout(function () {
          stillSwapTimer = 0;
          try {
            if (!document.hidden) return;
            applyCineGifStillSwap(true);
            freezeGifDecodeForBg(true);
          } catch (eLate) {}
        }, STILL_SWAP_AFTER_MS);
        deferHeavy(function () {
          freezeGifDecodeForBg(true);
        });
        return;
      }
      clearStillSwapTimer();
      deferHeavy(function () {
        /* pwaCpuKill2: focus PWA → restano still (no thaw logo/sfondo) */
        if (window.__VC_PWA_FREEZE_ALL_GIF || window.__VC_FORCE_PHOTO_STILL) {
          try {
            document.documentElement.classList.add("vc-cpu-settle");
            applyCineGifStillSwap(true);
            freezeGifDecodeForBg(true);
          } catch (eKeepStill) {}
          return;
        }
        try {
          applyCineGifStillSwap(false);
        } catch (eSw) {}
        freezeGifDecodeForBg(false);
        stillDiscordContentGifs();
      });
    }
    try {
      document.addEventListener("visibilitychange", syncVis, false);
      window.addEventListener("pageshow", syncVis, false);
      window.setTimeout(syncVis, 0);
      /* cpuIdleHard1: NO keepalive / no multi-sync 400/1200 */
      if (window.__vcPwaAnimKeepAlive) {
        try {
          window.clearInterval(window.__vcPwaAnimKeepAlive);
        } catch (eClr) {}
        window.__vcPwaAnimKeepAlive = 0;
      }
    } catch (eArm) {}
  }

  /* pwaIdleCpu1: Niente walk su body * (getComputedStyle × N = picchi 50–60% al cambio pagina).
     Solo nodi noti con blur/drop-shadow. */
  function stripPwaComputedFilters() {
    if (!window.__VC_PWA_CPU_NUKE && !isStandalonePwa()) return;
    try {
      var nodes = document.querySelectorAll(
        "header .vc-nav-shell, header .vc-nav-shell.vc-glass," +
          "header .vc-header-logo-link, header .vc-notif-summary," +
          "header .vc-lang-toggle, header .discord-account-btn," +
          "header img, header .vc-brand-glow," +
          "footer .vc-premium-footer__outer, footer .vc-premium-footer__wordmark," +
          ".vc-glass, .vc-fx-card, .vc-page-cine-card, .vc-home-panel," +
          ".vc-snav-panel, .vc-notif-panel, .discord-account-popover," +
          ".vc-soft-vote-glow, .vc-stat-num, .vc-stat-num-inner, .vc-home-deck__title",
      );
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        try {
          el.style.setProperty("filter", "none", "important");
          el.style.setProperty("-webkit-filter", "none", "important");
          el.style.setProperty("backdrop-filter", "none", "important");
          el.style.setProperty("-webkit-backdrop-filter", "none", "important");
        } catch (eEl) {}
      }
    } catch (eStrip) {}
  }

  function armPwaCpuNuke() {
    /* fgRevertBgOnly1: nuke in-app DISATTIVATO — resta solo armGlobalCpuQuiet (bg) */
    try {
      window.__VC_FORCE_PHOTO_STILL = 0;
      window.__VC_PWA_FREEZE_ALL_GIF = 0;
      window.__VC_PWA_CPU_NUKE = 0;
      document.documentElement.classList.remove("vc-pwa-cpu-nuke", "vc-cpu-settle");
      var oldNuke = document.getElementById("vc-pwa-cpu-nuke-css");
      if (oldNuke && oldNuke.parentNode) oldNuke.parentNode.removeChild(oldNuke);
      var oldEarly = document.getElementById("vc-cpu-kill5-early-css");
      if (oldEarly && oldEarly.parentNode) oldEarly.parentNode.removeChild(oldEarly);
    } catch (eOff) {}
    return;
    try {
      var root = document.documentElement;
      var id = "vc-pwa-cpu-nuke-css";
      if (window.__vcPwaNukeOneShot && document.getElementById(id)) {
        remountNukeCssLast();
        return;
      }
      /* pwaStillHard1: kill blur + still; niente marquee running override */
      root.classList.add(
        "vc-pwa-cpu-nuke",
        "vc-soft-fx-ready",
        "vc-site-polish",
        "vc-cine-curtain-off",
        "vc-cursor-trail-off",
        "vc-cpu-settle",
      );
      /* lookCpuFix1: soft-fx ON di nuovo (look); CPU = still+anim kill mirato */
      root.classList.remove("vc-soft-fx-off", "vc-perf-lite", "vc-interaction-hold");
      window.__VC_PWA_CPU_NUKE = 1;
      try {
        if (typeof window.__vcReleaseInteractionHold === "function") window.__vcReleaseInteractionHold();
      } catch (eRel) {}
      var existingNuke = document.getElementById(id);
      if (existingNuke) {
        try {
          if (existingNuke.parentNode) existingNuke.parentNode.removeChild(existingNuke);
        } catch (eRm) {}
        existingNuke = null;
      }
      var s = document.createElement("style");
      s.id = id;
      s.setAttribute("data-vc", "lookCpuFix1");
      /* lookCpuFix1: solo kill ANIM infinite — look/glass/filter soft-fx restano */
      s.textContent =
        "html.vc-pwa-cpu-nuke body.vc-body .vc-forbidden-book," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-forbidden-book--flying{" +
        "display:none!important}" +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-home-cine__canvas{" +
        "display:none!important;visibility:hidden!important;pointer-events:none!important}" +
        /* mqCssCursor2: NON killare wordmark / nome utente (come cpu-soft keep) */
        "html.vc-pwa-cpu-nuke body.vc-body .is-marquee:not(.vc-header-site-name):not([data-vc-nav-user-marquee]) .vc-marquee__track," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-marquee:not([data-vc-nav-user-marquee]) > .vc-marquee__track," +
        "html.vc-pwa-cpu-nuke body.vc-body--home .vc-home-deck__kicker," +
        "html.vc-pwa-cpu-nuke body.vc-body--home .vc-home-index__kicker," +
        "html.vc-pwa-cpu-nuke body.vc-body--home .vc-home-pulse-cta," +
        "html.vc-pwa-cpu-nuke body.vc-body--home .vc-home-scrollcue__chev," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-polish-vinyl{" +
        "animation:none!important;animation-name:none!important;" +
        "animation-play-state:paused!important;background-position:50% 50%!important;" +
        "will-change:auto!important}" +
        "html.vc-pwa-cpu-nuke:not(.vc-cpu-settle) body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track{" +
        "animation-name:vc-guild-name-marquee!important;" +
        "animation-duration:var(--vc-marquee-duration,12s)!important;" +
        "animation-timing-function:linear!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-play-state:paused!important;" +
        "-webkit-animation-play-state:paused!important;will-change:auto!important}" +
        "html.vc-pwa-cpu-nuke:not(.vc-cpu-settle) body.vc-body header a.vc-header-site-name.is-marquee:hover .vc-header-site-name__track," +
        "html.vc-pwa-cpu-nuke:not(.vc-cpu-settle) body.vc-body header a.vc-header-site-name.is-marquee:focus-visible .vc-header-site-name__track{" +
        "animation-play-state:running!important;" +
        "-webkit-animation-play-state:running!important;will-change:transform!important}" +
        /* userMqIdlePause1: pwa-nuke — nome running solo fuori settle */
        "html.vc-pwa-cpu-nuke:not(.vc-page-hidden):not(.vc-cpu-settle) body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-pwa-cpu-nuke:not(.vc-page-hidden):not(.vc-cpu-settle) body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track{" +
        "animation-name:vc-guild-name-marquee!important;" +
        "animation-duration:var(--vc-marquee-duration,8s)!important;" +
        "animation-timing-function:linear!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-play-state:running!important;will-change:transform!important}" +
        "html.vc-pwa-cpu-nuke.vc-site-cursor-ok,html.vc-pwa-cpu-nuke.vc-site-cursor-ok body{" +
        "cursor:url(/images/musicrecordspin-cursor-static.png) 12 12," +
        "url(/images/musicrecordspin-cursor-static.png) 12 12, auto!important}" +
        "html.vc-pwa-cpu-nuke.vc-site-cursor-ok *{cursor:inherit!important}";
      /* Append in coda a body così batte soft-fx.css in cascata (pari specificità). */
      var mount = document.body || document.head || root;
      mount.appendChild(s);
      window.__vcPwaNukeOneShot = 1;
      /* pwaCpuKill5: no stripPwaComputedFilters walk (era CPU); no cancelAnims spam */
      window.setTimeout(remountNukeCssLast, 900);
      armPwaIdleGifFreeze();
      /* swBackPwa1: SW push resta (ensureServiceWorkerRegistration → /sw-m1.js) */
      clearBootHoldWithCurtain();
      window.setTimeout(clearBootHoldWithCurtain, 200);
      window.setTimeout(clearBootHoldWithCurtain, 800);
    } catch (eNuke) {}
  }

  function clearPwaOrphanLocks() {
    /* hangKill1: unlock orphan anche fuori PWA (freeze su tutte le pagine) */
    /* scrollPostSiparioYoyo1: dopo unlock non richiamare forceUnlock (scrollTo 0 → yoyo) */
    try {
      var root = document.documentElement;
      if (!root.classList.contains("vc-page-cine-ready") && !root.classList.contains("vc-cine-curtain-off")) {
        if (!isStandalonePwa()) return;
      }
      /* bootBarGate1c: non ammazzare barra/lock finché chrome-ui non ha chiuso (o età lunga) */
      try {
        var progGate = document.getElementById("vc-site-progress");
        var barLive =
          (progGate && progGate.classList.contains("is-loading")) ||
          root.classList.contains("vc-chrome-bar-loading") ||
          (window.__vcChromeUiBooted && window.__vcChromeLoadDone === false);
        if (barLive) {
          var bootAt = Number(window.__vcCineBootStartedAt || 0) || 0;
          var age = bootAt ? Date.now() - bootAt : 0;
          if (!bootAt || age < 4500) return;
        }
      } catch (eBarGate) {}
      var alreadyUnlocked =
        window.__vcChromeLoadDone === true &&
        (window.__vcChromeScrollArmed || root.classList.contains("vc-chrome-scroll-armed"));
      root.classList.add("vc-chrome-scroll-armed", "vc-soft-fx-ready");
      root.classList.remove(
        "vc-loading-scroll-lock",
        "vc-loader-blocking-live",
        "vc-interaction-hold",
        "vc-chrome-bar-loading",
        "vc-scroll-soft-lock",
        "vc-notif-staff-loading",
        "vc-notif-early-staff",
      );
      try {
        var prog = document.getElementById("vc-site-progress");
        if (prog) prog.classList.remove("is-loading");
      } catch (eProg) {}
      try {
        var inboxLoad = document.getElementById("vc-staff-inbox-loading");
        if (inboxLoad) {
          inboxLoad.hidden = true;
          inboxLoad.setAttribute("hidden", "");
          inboxLoad.classList.add("vc-staff-loading--hidden");
        }
      } catch (eInbox) {}
      try {
        root.style.removeProperty("touch-action");
        if (document.body) document.body.style.removeProperty("touch-action");
      } catch (eTa) {}
      if (!alreadyUnlocked) {
        try {
          if (typeof window.__vcForceUnlockChromeScroll === "function") {
            window.__vcForceUnlockChromeScroll("pwaOrphan");
          }
        } catch (eForce) {}
        try {
          if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
        } catch (eUn) {}
      }
      try {
        if (typeof window.__vcReleaseInteractionHold === "function") window.__vcReleaseInteractionHold();
      } catch (eRel) {}
    } catch (eClr) {}
  }
  try {
    armPwaCpuNuke();
    window.setTimeout(clearPwaOrphanLocks, 700);
    window.setTimeout(clearPwaOrphanLocks, 1600);
    window.setTimeout(clearPwaOrphanLocks, 3200);
  } catch (eArmNuke) {}

  function clearBootHoldWithCurtain() {
    try {
      var root = document.documentElement;
      root.classList.add("vc-soft-fx-ready");
      /* bootOneShot3: soft/look ready ≠ aprire pagina — aspetta chrome (no 2° load) */
      var lookOk =
        root.classList.contains("vc-look-core-ready") || root.classList.contains("vc-soft-fx-off");
      var notCineBoot =
        !root.classList.contains("vc-page-cine-boot") || root.classList.contains("vc-page-cine-ready");
      var chromeDone =
        window.__vcChromeLoadDone === true || window.__vcChromeVisualReady === 1;
      var bootAt = Number(window.__vcCineBootStartedAt || window.__vcSoftFxCssReadyAt || 0) || 0;
      var age = bootAt ? Date.now() - bootAt : Number(performance.now && performance.now()) || 0;
      var hardOk = age >= 2800;
      if ((lookOk || notCineBoot) && (chromeDone || hardOk)) {
        root.classList.add("vc-cine-curtain-off");
      } else if ((lookOk || notCineBoot) && !chromeDone && !hardOk) {
        if (!window.__vcPerfCurtainWait) {
          window.__vcPerfCurtainWait = 1;
          var waitN = 0;
          (function waitChromeLift() {
            waitN += 1;
            try {
              if (
                window.__vcChromeLoadDone === true ||
                window.__vcChromeVisualReady === 1 ||
                waitN > 90
              ) {
                window.__vcPerfCurtainWait = 0;
                try {
                  if (
                    window.__vcChromeLoadDone === true ||
                    window.__vcChromeVisualReady === 1 ||
                    waitN > 90
                  ) {
                    document.documentElement.classList.add("vc-cine-curtain-off");
                  }
                } catch (eLift) {}
                return;
              }
            } catch (eW) {}
            window.setTimeout(waitChromeLift, 40);
          })();
        }
      }
      /* holdFreezeKill1: togli hold solo a sipario davvero giù (altrimenti 1° release fantasma) */
      if (root.classList.contains("vc-cine-curtain-off")) {
        root.classList.remove("vc-interaction-hold");
        if (typeof window.__vcReleaseInteractionHold === "function") {
          try {
            window.__vcReleaseInteractionHold();
          } catch (eRel) {}
        }
      }
    } catch (eClr) {}
  }

  function conn() {
    try {
      return global.navigator && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
    } catch (e) {
      return null;
    }
  }

  function saveDataOn() {
    try {
      if (conn() && conn().saveData === true) return true;
    } catch (e) {}
    return false;
  }

  function effectiveType() {
    try {
      return String((conn() && conn().effectiveType) || "").toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function isPhoneOrPwa() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      if (
        window.matchMedia &&
        window.matchMedia("(hover: none)").matches &&
        Number(navigator.maxTouchPoints || 0) > 0
      ) {
        return true;
      }
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
      if (navigator.standalone) return true;
      if ((window.innerWidth || 999) <= 920) return true;
    } catch (e) {}
    return false;
  }

  function detectAutoTier() {
    return isPhoneOrPwa() ? "lite" : FORCE_DESKTOP_TIER;
  }

  function manualPref() {
    return detectAutoTier();
  }

  function tier() {
    /* perfPhoneLite1 marker */
    if (saveDataOn()) return "lite";
    var et = effectiveType();
    if (et === "slow-2g" || et === "2g") return "lite";
    return detectAutoTier();
  }

  function isLite() {
    return tier() === "lite";
  }

  function isMidOrLite() {
    var t = tier();
    return t === "lite" || t === "mid";
  }

  function applyToDocument(forceTier) {
    var t = forceTier || tier() || "mid";
    if (t !== "lite" && t !== "mid" && t !== "full") t = "mid";
    var root = document.documentElement;
    if (!root) return t;
    root.classList.remove("vc-perf-full", "vc-perf-mid", "vc-perf-lite");
    root.classList.add("vc-perf-" + t);
    root.setAttribute("data-vc-perf", t);
    /* lookCpuFix1: soft-fx sempre on; trail off solo lite/phone/nuke */
    root.classList.remove("vc-soft-fx-off");
    root.classList.add("vc-soft-fx-ready", "vc-site-polish");
    if (t === "lite" || isPhoneOrPwa() || window.__VC_PWA_CPU_NUKE) root.classList.add("vc-cursor-trail-off");
    else root.classList.remove("vc-cursor-trail-off");
    /* vc-perf-touch resta per layout touch, ma NON spegne più glass/gradient */
    if (isPhoneOrPwa()) root.classList.add("vc-perf-touch");
    else root.classList.remove("vc-perf-touch");
    if (t !== lastTier) {
      lastTier = t;
      try {
        document.dispatchEvent(new CustomEvent("vc:perf-tier", { detail: { tier: t } }));
      } catch (eEv) {}
    }
    try {
      disableHeavySoftFxSheet();
    } catch (eSoftOff) {}
    return t;
  }

  function disableHeavySoftFxSheet() {
    /* gifGradRestore1: non spegnere più soft-fx.css */
    try {
      clearBootHoldWithCurtain();
    } catch (eDis) {}
  }

  /* phoneFxRestore1: niente kill glass/gradient/glow su telefono —
     solo empty[hidden], pause tab nascosta, no libri volanti. */
  function injectTouchPerfCss() {
    try {
      var existing = document.getElementById("vc-perf-phone-lite1-css");
      if (existing) {
        if (existing.getAttribute("data-vc") === "bgGifRestore1") return;
        if (existing.parentNode) existing.parentNode.removeChild(existing);
      }
      var s = document.createElement("style");
      s.id = "vc-perf-phone-lite1-css";
      s.setAttribute("data-vc", "bgGifRestore1");
      s.textContent =
        "html.vc-perf-mid body.vc-body .vc-forbidden-book--flying," +
        "html.vc-perf-touch body.vc-body .vc-forbidden-book--flying," +
        "html.vc-perf-lite body.vc-body .vc-forbidden-book--flying," +
        "html.vc-soft-fx-off body.vc-body .vc-forbidden-book--flying{" +
        "display:none!important}" +
        "html.vc-page-hidden body.vc-body *," +
        "html.vc-ui-gif-paused body.vc-body *," +
        "html.vc-pwa-bg-frozen body.vc-body *{" +
        "animation-play-state:paused!important;" +
        "filter:none!important;-webkit-filter:none!important;" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
        /* gifNoIdleStill1: pause CSS solo tab nascosta; avatar sempre ok */
        "html.vc-ui-gif-paused body.vc-body header img.discord-avatar-img," +
        "html.vc-pwa-bg-frozen body.vc-body header img.discord-avatar-img," +
        "html.vc-page-hidden body.vc-body header img.discord-avatar-img," +
        "html.vc-ui-gif-paused body.vc-body #header-quick-actions img.discord-avatar-img," +
        "html.vc-pwa-bg-frozen body.vc-body #header-quick-actions img.discord-avatar-img," +
        "html.vc-page-hidden body.vc-body #header-quick-actions img.discord-avatar-img," +
        "html.vc-ui-gif-paused body.vc-body header img.vc-avatar," +
        "html.vc-pwa-bg-frozen body.vc-body header img.vc-avatar," +
        "html.vc-page-hidden body.vc-body header img.vc-avatar{" +
        "visibility:visible!important;content-visibility:visible!important;opacity:1!important}" +
        "html body .vc-notify-empty[hidden]," +
        "html body .vc-staff-inbox-empty[hidden]," +
        "html body .vc-reviews-empty[hidden]," +
        "html.vc-soft-fx-off body .vc-notify-empty[hidden]," +
        "html.vc-soft-fx-off body .vc-staff-inbox-empty[hidden]{" +
        "display:none!important;visibility:hidden!important;opacity:0!important;" +
        "pointer-events:none!important;height:0!important;max-height:0!important;" +
        "margin:0!important;padding:0!important;overflow:hidden!important;border:0!important}" +
        "html.vc-soft-fx-ready.vc-site-polish:not(.vc-soft-fx-off):not(.vc-pwa-cpu-nuke) body.vc-body header .vc-nav-shell," +
        "html.vc-soft-fx-ready.vc-site-polish:not(.vc-soft-fx-off):not(.vc-pwa-cpu-nuke) body.vc-body header .vc-nav-shell.vc-glass," +
        "html.vc-soft-fx-ready.vc-site-polish:not(.vc-soft-fx-off):not(.vc-pwa-cpu-nuke) body.vc-body header .vc-nav-shell.vc-nav-shell--scrolled{" +
        /* cpuAnimSoft1: nav già fill opaco — blur(18px) era costo a vuoto (~CPU idle) */
        "backdrop-filter:none!important;" +
        "-webkit-backdrop-filter:none!important;" +
        "filter:none!important;" +
        "box-shadow:none!important}";
      (document.head || document.documentElement).appendChild(s);
    } catch (eCss) {}
  }

  function fetchTimeouts(base) {
    var b = base && typeof base === "object" ? base : {};
    var fetchTimeoutMs = Math.max(1000, Number(b.fetchTimeoutMs) || 12000);
    var failsafeMs = Math.max(fetchTimeoutMs, Number(b.failsafeMs) || 35000);
    var t = tier();
    if (t === "lite") {
      fetchTimeoutMs = Math.max(fetchTimeoutMs, 24000);
      failsafeMs = Math.max(failsafeMs, 48000);
    } else if (t === "mid") {
      fetchTimeoutMs = Math.max(fetchTimeoutMs, 18000);
      failsafeMs = Math.max(failsafeMs, 42000);
    }
    return { fetchTimeoutMs: fetchTimeoutMs, failsafeMs: failsafeMs, tier: t };
  }

  function shouldAttachApiHeaders(url) {
    try {
      var base =
        typeof location !== "undefined" && location.origin ? location.origin : "https://localhost";
      var u = new URL(String(url || ""), base);
      if (typeof location !== "undefined" && u.origin !== location.origin) return false;
      return String(u.pathname || "").indexOf("/webhooks/") === 0;
    } catch (e) {
      return false;
    }
  }

  function apiHeaders(extra, url) {
    var out = extra && typeof extra === "object" ? Object.assign({}, extra) : {};
    if (url && !shouldAttachApiHeaders(url)) return out;
    out["X-VC-Perf"] = tier();
    if (saveDataOn()) out["Save-Data"] = "on";
    return out;
  }

  function apiQuery(params) {
    var out = params && typeof params === "object" ? Object.assign({}, params) : {};
    var t = tier();
    if (t === "lite") {
      out.lite = "1";
      out.perf = "lite";
    } else if (t === "mid") {
      out.perf = "mid";
    }
    return out;
  }

  function leaderboardPerPage(defaultN) {
    /* ulNineAlways1: sempre 9 (niente cap lite→6) */
    var n = Math.max(1, Number(defaultN) || 9);
    return Math.max(n, 9);
  }

  function notificationsLimit(defaultN) {
    var n = Math.max(1, Number(defaultN) || 50);
    var t = tier();
    if (t === "lite") return Math.min(n, 30);
    if (t === "mid") return Math.min(n, 50);
    return n;
  }

  function setPref() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    var t = applyToDocument();
    injectTouchPerfCss();
    return t;
  }

  var api = {
    __ready: true,
    tier: tier,
    isLite: isLite,
    isMidOrLite: isMidOrLite,
    isPhoneOrPwa: isPhoneOrPwa,
    isStandalonePwa: isStandalonePwa,
    isHomePage: isHomePage,
    armPwaCpuNuke: armPwaCpuNuke,
    armGlobalCpuQuiet: armGlobalCpuQuiet,
    stillDiscordContentGifs: stillDiscordContentGifs,
    armSiteCpuSoft: armSiteCpuSoft,
    ensureFxFlatCss: ensureFxFlatCss,
    shedHeavyLandingCss: shedHeavyLandingCss,
    remountNukeCssLast: remountNukeCssLast,
    remountSiteCpuSoftCssLast: remountSiteCpuSoftCssLast,
    remountPageHiddenCpuCssLast: remountPageHiddenCpuCssLast,
    clearPwaOrphanLocks: clearPwaOrphanLocks,
    apply: applyToDocument,
    fetchTimeouts: fetchTimeouts,
    shouldAttachApiHeaders: shouldAttachApiHeaders,
    apiHeaders: apiHeaders,
    apiQuery: apiQuery,
    leaderboardPerPage: leaderboardPerPage,
    notificationsLimit: notificationsLimit,
    setPref: setPref,
    getPref: manualPref,
    saveDataOn: saveDataOn,
    effectiveType: effectiveType,
    forcedTier: FORCE_DESKTOP_TIER,
  };

  /* fase3Cpu1 + bootResumeCpu1: settle rapido; home tiene settle (no décor/GIF thaw).
   * bgCpuHard1 + pageCpuIdle1: idle FG → pause wordmark+nome+promo (no keepAlive).
   * bootCpuHoldAll1: hold settle sitewide durante boot (no thaw mid-load). */
  function armFgCpuSettle() {
    if (window.__vcFgCpuSettleArmed) return;
    window.__vcFgCpuSettleArmed = 1;
    ensurePageHiddenCpuCss();
    var idleTimer = 0;
    /* cpuQuietMove1: pointermove SOLO reset idle timer — niente thaw GIF/marquee
       (prima microjitter → thaw continuo → CPU alta). Thaw su pointerdown/key/touch. */
    var IDLE_MS = 900; /* bootCpuHoldAll1: re-settle più rapido post-hold */
    var bootHoldUntil = 0;
    try {
      bootHoldUntil = (performance.now && performance.now()) || Date.now();
      bootHoldUntil += 6500;
    } catch (eHold0) {
      bootHoldUntil = Date.now() + 6500;
    }
    function extendBootHold(ms) {
      try {
        var now = (performance.now && performance.now()) || Date.now();
        var until = now + Math.max(800, Number(ms) || 2500);
        if (until > bootHoldUntil) bootHoldUntil = until;
      } catch (eExt) {}
    }
    function inBootCpuHold() {
      try {
        if (window.__vcChromeLoadDone !== true) return true;
      } catch (eDone) {}
      try {
        var now = (performance.now && performance.now()) || Date.now();
        return now < bootHoldUntil;
      } catch (eNow) {
        return false;
      }
    }
    function isHomeBody() {
      try {
        return !!(document.body && document.body.classList.contains("vc-body--home"));
      } catch (eH) {
        return false;
      }
    }
    function keepSettleMode() {
      /* home forever-soft + boot hold su ogni pagina */
      return isHomeBody() || inBootCpuHold();
    }
    try {
      document.addEventListener(
        "vc:chrome-load-done",
        function () {
          extendBootHold(2800);
          try {
            settle();
          } catch (eSetDone) {}
        },
        { once: true },
      );
      window.addEventListener(
        "vc:chrome-load-done",
        function () {
          extendBootHold(2800);
        },
        { once: true },
      );
    } catch (eHoldLis) {}
    function settle() {
      try {
        if (document.hidden || document.visibilityState === "hidden") return;
      } catch (eH) {}
      try {
        document.documentElement.classList.add("vc-cpu-settle");
      } catch (eCls) {}
      try {
        ensurePageHiddenCpuCss();
        remountPageHiddenCpuCssLast();
      } catch (eCssSet) {}
      try {
        /* userMqIdlePause1: settle → pause nome+wordmark */
        freezeInlineMarqueesForBg(true);
      } catch (eMqSet) {}
      try {
        document.dispatchEvent(new CustomEvent("vc:cpu-settle"));
      } catch (eEvS) {}
      try {
        window.dispatchEvent(new CustomEvent("vc:cpu-settle"));
      } catch (eEvS2) {}
      deferHeavy(function () {
        try {
          applyCineGifStillSwap(true);
        } catch (eSw) {}
        try {
          freezeGifDecodeForBg(true);
        } catch (eFr) {}
        try {
          stillDiscordContentGifs();
        } catch (eStill) {}
        try {
          freezeInlineMarqueesForBg(true);
        } catch (eMqSet2) {}
        try {
          remountPageHiddenCpuCssLast();
        } catch (eRm2) {}
      });
    }
    function bumpIdleOnly() {
      try {
        if (document.hidden || document.visibilityState === "hidden") return;
      } catch (eH2) {}
      try {
        window.clearTimeout(idleTimer);
      } catch (eClrM) {}
      idleTimer = window.setTimeout(settle, IDLE_MS);
    }
    function bustle(ev) {
      try {
        if (document.hidden || document.visibilityState === "hidden") return;
      } catch (eH2) {}
      /* cpuQuietMove1: pointermove non thaw — solo rinnova idle */
      try {
        if (ev && ev.type === "pointermove") {
          bumpIdleOnly();
          return;
        }
      } catch (eTh) {}
      /* bootCpuHoldAll1 / bootResumeCpu1: during boot (+ home) settle resta.
         Togliere settle mid-boot = grain/sheen/mq → CPU 100%+ a lungo. */
      if (keepSettleMode()) {
        try {
          if (!document.documentElement.classList.contains("vc-cpu-settle")) {
            document.documentElement.classList.add("vc-cpu-settle");
            ensurePageHiddenCpuCss();
            remountPageHiddenCpuCssLast();
          }
          /* clear inline così :hover CSS può running */
          freezeInlineMarqueesForBg(false);
        } catch (eHomeKeep) {}
        bumpIdleOnly();
        return;
      }
      /* homeLoadCpu1: touch/scroll non thaw GIF/marquee (picchi 70% mid-scroll).
         Thaw solo mouse/pen o target interattivo (link/btn/input). */
      var allowThaw = true;
      try {
        var typ = ev && ev.type ? String(ev.type) : "";
        var ptr = ev && ev.pointerType != null ? String(ev.pointerType) : "";
        var isTouchish =
          typ === "touchstart" ||
          ptr === "touch" ||
          (typ === "pointerdown" && ptr === "touch");
        if (isTouchish) {
          allowThaw = false;
          try {
            var tgt = ev && ev.target;
            if (
              tgt &&
              tgt.closest &&
              tgt.closest(
                "a,button,input,textarea,select,summary,label,[role='button'],[role='menuitem'],.discord-account-btn,.vc-header-logo-link,.vc-header-site-name",
              )
            ) {
              allowThaw = true;
            }
          } catch (eInt) {}
        }
      } catch (eTouch) {}
      if (!allowThaw) {
        bumpIdleOnly();
        return;
      }
      var was = false;
      try {
        was = document.documentElement.classList.contains("vc-cpu-settle");
        document.documentElement.classList.remove("vc-cpu-settle");
      } catch (eRm) {}
      if (was) {
        try {
          freezeInlineMarqueesForBg(false);
        } catch (eMqWake) {}
        try {
          document.dispatchEvent(new CustomEvent("vc:cpu-bustle"));
        } catch (eEvB) {}
        try {
          window.dispatchEvent(new CustomEvent("vc:cpu-bustle"));
        } catch (eEvB2) {}
        /* bootResumeCpu1: no GIF thaw — still restano; solo marquee clear */
        deferHeavy(function () {
          try {
            if (!document.documentElement.classList.contains("vc-cpu-settle")) {
              freezeInlineMarqueesForBg(false);
            }
          } catch (eThaw) {}
        });
      }
      bumpIdleOnly();
    }
    try {
      /* pageCpuIdle1: no scroll/wheel → bustle (liste lunghe tenevano settle spento) */
      window.addEventListener("pointermove", bumpIdleOnly, { passive: true, capture: true });
      ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
        window.addEventListener(ev, bustle, { passive: true, capture: true });
      });
    } catch (eEv) {}
    function start() {
      try {
        window.clearTimeout(idleTimer);
      } catch (eClr2) {}
      idleTimer = window.setTimeout(settle, IDLE_MS);
    }
    try {
      document.addEventListener(
        "vc:page-cine-ready",
        function () {
          try {
            if (isHomeBody()) settle();
          } catch (eSet1) {}
          start();
        },
        { once: true },
      );
      document.addEventListener("vc:cpu-wake", function () {
        try {
          extendBootHold(1800);
          settle();
        } catch (eWakeSet) {}
        start();
      });
    } catch (eReady) {}
    window.setTimeout(function () {
      try {
        settle();
      } catch (eBootSet) {}
      start();
    }, 200); /* bootCpuHoldAll1: settle subito */
    try {
      document.addEventListener(
        "vc:cine-curtain-off",
        function () {
          try {
            extendBootHold(3200);
            settle();
          } catch (eSet0) {}
          start();
        },
        { once: true },
      );
    } catch (eCurt) {}
  }

  /* lazyEverywhere1: native lazy on below-fold / dynamic media (no LCP/hero/header) */
  function shouldKeepMediaEager(el) {
    try {
      if (!el || el.nodeType !== 1) return true;
      if (el.getAttribute("loading") === "eager") return true;
      if (el.getAttribute("fetchpriority") === "high") return true;
      if (el.getAttribute("data-vc-nolazy") === "1") return true;
      var cls = String(el.className || "");
      if (
        /vc-home-cine__photo|vc-header-logo|vc-discord-login|vc-hero|vc-sipario|vc-pre-cine/i.test(
          cls,
        )
      ) {
        return true;
      }
      if (el.closest && el.closest("header, .vc-site-header, #vc-site-header, .vc-nav, .vc-hero-head")) {
        return true;
      }
      return false;
    } catch (eKeep) {
      return true;
    }
  }

  function markLazyMedia(root) {
    try {
      var scope = root && root.querySelectorAll ? root : document;
      var imgs = scope.querySelectorAll ? scope.querySelectorAll("img") : [];
      var vh = 0;
      try {
        vh = window.innerHeight || 800;
      } catch (eVh) {
        vh = 800;
      }
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        if (!img || shouldKeepMediaEager(img)) continue;
        function ensureLazyDims(el) {
          /* lazyImgDims2: Chrome Issues — lazy SENZA width+height = CLS; sempre entrambi */
          try {
            if (!el || !el.getAttribute) return;
            if (String(el.getAttribute("loading") || "").toLowerCase() !== "lazy") return;
            if (el.getAttribute("width") && el.getAttribute("height")) return;
            var nw = Number(el.naturalWidth || 0);
            var nh = Number(el.naturalHeight || 0);
            var dw = nw > 0 ? nw : 64;
            var dh = nh > 0 ? nh : 64;
            if (!el.getAttribute("width")) el.setAttribute("width", String(dw));
            if (!el.getAttribute("height")) el.setAttribute("height", String(dh));
          } catch (eDim) {}
        }
        if (!img.getAttribute("loading")) {
          var top = 0;
          try {
            top = img.getBoundingClientRect().top;
          } catch (eR) {
            top = vh + 1;
          }
          if (top > vh + 120) {
            img.setAttribute("loading", "lazy");
            ensureLazyDims(img);
          }
        } else {
          ensureLazyDims(img);
        }
        if (!img.getAttribute("decoding")) img.setAttribute("decoding", "async");
      }
      var iframes = scope.querySelectorAll ? scope.querySelectorAll("iframe") : [];
      for (var j = 0; j < iframes.length; j++) {
        var fr = iframes[j];
        if (!fr || shouldKeepMediaEager(fr)) continue;
        if (!fr.getAttribute("loading")) fr.setAttribute("loading", "lazy");
      }
      /* sitePerfAll1: video sottofold — preload none + lazy attr dove supportato */
      var vids = scope.querySelectorAll ? scope.querySelectorAll("video") : [];
      for (var v = 0; v < vids.length; v++) {
        var vid = vids[v];
        if (!vid || shouldKeepMediaEager(vid)) continue;
        try {
          if (!vid.getAttribute("preload") || vid.getAttribute("preload") === "auto") {
            vid.setAttribute("preload", "none");
          }
        } catch (ePre) {}
        try {
          if (!vid.getAttribute("loading")) {
            var vTop = 0;
            try {
              vTop = vid.getBoundingClientRect().top;
            } catch (eVt) {
              vTop = vh + 1;
            }
            if (vTop > vh + 120) vid.setAttribute("loading", "lazy");
          }
        } catch (eVl) {}
      }
    } catch (eMark) {}
  }

  function armLazyMediaPass() {
    if (window.__vcLazyMediaPassArmed) return;
    window.__vcLazyMediaPassArmed = 1;
    function run() {
      markLazyMedia(document);
      /* lazyImgDims1: stamp dims after lazy mark (Chrome Issues) */
      try {
        if (typeof window.__vcStampLazyImgDims === "function") window.__vcStampLazyImgDims(document);
      } catch (eStamp) {}
    }
    try {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run, { once: true });
      } else {
        run();
      }
    } catch (eDom) {
      run();
    }
    try {
      document.addEventListener("vc:page-cine-ready", run, { once: true });
      document.addEventListener("vc:post-curtain-lazy", run, { once: true });
    } catch (eEv) {}
    window.setTimeout(run, 900);
    window.setTimeout(run, 2200);
    try {
      if (typeof MutationObserver === "function" && !window.__vcLazyMediaMo) {
        window.__vcLazyMediaMo = new MutationObserver(function (muts) {
          for (var i = 0; i < muts.length; i++) {
            var nodes = muts[i].addedNodes;
            for (var j = 0; j < nodes.length; j++) {
              var n = nodes[j];
              if (!n || n.nodeType !== 1) continue;
              if (n.tagName === "IMG" || n.tagName === "IFRAME") markLazyMedia(n.parentNode || n);
              else if (n.querySelector && n.querySelector("img,iframe")) markLazyMedia(n);
            }
          }
        });
        var moRoot = document.body || document.documentElement;
        if (moRoot) {
          window.__vcLazyMediaMo.observe(moRoot, { childList: true, subtree: true });
        }
      }
    } catch (eMo) {}
  }

  global.VcPerf = api;
  try {
    armGlobalCpuQuiet();
    armPwaCpuNuke();
    applyToDocument();
    injectTouchPerfCss();
    armPwaCpuNuke();
    armSiteCpuSoft();
    armFgCpuSettle();
    forceFaviconStill();
    deferHeavy(stillDiscordContentGifs);
    armLazyMediaPass();
  } catch (eInit) {}
  try {
    document.addEventListener("vc:page-cine-ready", function () {
      try {
        armSiteCpuSoft();
        shedHeavyLandingCss();
      } catch (eReady) {}
    });
    window.addEventListener("pageshow", function () {
      try {
        armSiteCpuSoft();
        shedHeavyLandingCss();
      } catch (eShow) {}
    });
    window.setTimeout(function () {
      try {
        shedHeavyLandingCss();
      } catch (eShed0) {}
    }, 0);
    window.setTimeout(function () {
      try {
        shedHeavyLandingCss();
      } catch (eShed1) {}
    }, 600);
    window.setTimeout(function () {
      try {
        shedHeavyLandingCss();
      } catch (eShed2) {}
    }, 1600);
  } catch (eArmSoftEv) {}

  /* siteApiW6: soft-fx può partire media=print (non-blocking); promote on load. Mai appendChild. */
  try {
    function softSheetOk(link) {
      if (!link) return false;
      /* perfIdleReflow1: non leggere cssRules (Forced reflow) — solo marker/attr */
      try {
        if (link.getAttribute("data-vc-sheet-loaded") === "1") return true;
        if (link.sheet) return true;
      } catch (eOk) {}
      return false;
    }
    function layoutCssOk() {
      try {
        var look =
          document.getElementById("vc-look-core-css") ||
          document.querySelector('link[href*="vc-look-core"]');
        if (look && !softSheetOk(look)) return false;
        var ext =
          document.getElementById("vc-landing-ext-css") ||
          document.querySelector('link[href*="vc-landing-ext"]');
        if (!ext) return true;
        try {
          var med = String(ext.media || "all").toLowerCase();
          if (med && med !== "all" && med.indexOf("all") === -1) return false;
        } catch (eMed) {}
        return softSheetOk(ext);
      } catch (eLay) {
        return true;
      }
    }
    function armLayoutCssWait(link) {
      try {
        ["vc-look-core-css", "vc-landing-ext-css"].forEach(function (id) {
          var el =
            document.getElementById(id) ||
            document.querySelector(
              id === "vc-look-core-css" ? 'link[href*="vc-look-core"]' : 'link[href*="vc-landing-ext"]',
            );
          if (!el || el.__vcFoucGateBound) return;
          el.__vcFoucGateBound = 1;
          function kick() {
            try {
              el.setAttribute("data-vc-sheet-loaded", "1");
              if (el.media && el.media !== "all") el.media = "all";
              promoteSoft(link);
            } catch (eK) {}
          }
          el.addEventListener("load", kick, { once: true });
          el.addEventListener("error", kick, { once: true });
        });
        window.setTimeout(function () {
          try {
            promoteSoft(link);
          } catch (eT) {}
        }, 80);
      } catch (eArm) {}
    }
    function promoteSoft(link) {
      if (!link) return;
      /* foucKillStruct1: non aprire sipario finché look-core + landing-ext non applicano */
      if (!layoutCssOk()) {
        armLayoutCssWait(link);
        return;
      }
      link.id = "vc-soft-fx-css";
      /* gifGradRestore1: attiva sempre soft-fx (gradient/bordi) */
      try {
        link.disabled = false;
        link.removeAttribute("data-vc-soft-disabled");
      } catch (eEn) {}
      link.media = "all";
      link.setAttribute("data-vc-sheet-loaded", "1");
      link.removeAttribute("onload");
      document.querySelectorAll('link[href*="vc-soft-fx"]').forEach(function (l) {
        if (l !== link && l.parentNode) l.parentNode.removeChild(l);
      });
      try {
        var lookR =
          document.getElementById("vc-look-core-css") ||
          document.querySelector('link[href*="vc-look-core"]');
        if (lookR) lookR.setAttribute("data-vc-sheet-loaded", "1");
        var extR =
          document.getElementById("vc-landing-ext-css") ||
          document.querySelector('link[href*="vc-landing-ext"]');
        if (extR) extR.setAttribute("data-vc-sheet-loaded", "1");
      } catch (eMark) {}
      document.documentElement.classList.remove("vc-soft-fx-off");
      document.documentElement.classList.add(
        "vc-look-core-ready",
        "vc-soft-fx-ready",
        "vc-core-styles-ready",
        "vc-home-styles-ready",
        "vc-styles-ready",
      );
      clearBootHoldWithCurtain();
      /* soft-fx arriva dopo: ri-append nuke CSS in coda + cancel WAAPI */
      try {
        armPwaCpuNuke();
      } catch (eReNuke) {}
      try {
        armSiteCpuSoft();
      } catch (eReSoft) {}
      try {
        shedHeavyLandingCss();
      } catch (eReShed) {}
    }
    function markReadyFromSoft() {
      try {
        var softPin = document.getElementById("vc-soft-fx-css");
        if (!softPin) softPin = document.querySelector('link[href*="vc-soft-fx"]');
        if (!softPin) return;
        softPin.id = "vc-soft-fx-css";
        if (softSheetOk(softPin) || softPin.getAttribute("data-vc-sheet-loaded") === "1") {
          promoteSoft(softPin);
          return;
        }
        softPin.addEventListener(
          "load",
          function () {
            try {
              promoteSoft(softPin);
            } catch (eLd) {}
          },
          { once: true }
        );
      } catch (ePin2) {}
    }
    function ensureSoftFxLink() {
      try {
        /* bootFast1SoftSel */
        var soft =
          document.getElementById("vc-soft-fx-css") ||
          document.querySelector('link[href*="vc-soft-fx"]');
        if (soft) {
          promoteSoft(soft);
          return;
        }
        var l = document.createElement("link");
        l.rel = "stylesheet";
        l.id = "vc-soft-fx-css";
        l.href = "/css/vc-soft-fx.20261006bootFast1.css?v=20261006bootFast1";
        l.media = "all";
        (document.head || document.documentElement).appendChild(l);
        l.addEventListener(
          "load",
          function () {
            try {
              promoteSoft(l);
            } catch (eLd2) {}
          },
          { once: true },
        );
        window.setTimeout(function () {
          try {
            promoteSoft(l);
          } catch (eLd3) {}
        }, 400);
      } catch (eEns) {}
    }
    markReadyFromSoft();
    ensureSoftFxLink();
    window.setTimeout(markReadyFromSoft, 0);
    window.setTimeout(ensureSoftFxLink, 0);
    window.setTimeout(markReadyFromSoft, 200);
    window.setTimeout(ensureSoftFxLink, 200);
    window.setTimeout(markReadyFromSoft, 800);
  } catch (eSoftFx) {}
  /* skipGhost1: skip-link visibile solo dopo Tab reale (no focus spurio) */
  try {
    if (!global.__vcSkipGhost1) {
      global.__vcSkipGhost1 = 1;
      var SKIP_KB = "vc-skip-link--kb";
      function skipLinkEl() {
        try {
          return document.querySelector("a.vc-skip-link");
        } catch (eQ) {
          return null;
        }
      }
      function armSkipKb() {
        var s = skipLinkEl();
        if (s) s.classList.add(SKIP_KB);
      }
      function disarmSkipKb() {
        var s = skipLinkEl();
        if (!s) return;
        try {
          s.classList.remove(SKIP_KB);
        } catch (eRm) {}
        try {
          if (document.activeElement === s) s.blur();
        } catch (eBl) {}
      }
      document.addEventListener(
        "keydown",
        function (e) {
          try {
            if (e.key === "Tab" || e.keyCode === 9) armSkipKb();
          } catch (eKd) {}
        },
        true,
      );
      document.addEventListener(
        "focusin",
        function (e) {
          try {
            var t = e && e.target;
            if (!t || !t.classList || !t.classList.contains("vc-skip-link")) return;
            if (!t.classList.contains(SKIP_KB)) t.blur();
          } catch (eFi) {}
        },
        true,
      );
      document.addEventListener("mousedown", disarmSkipKb, true);
      document.addEventListener("pointerdown", disarmSkipKb, true);
      document.addEventListener("touchstart", disarmSkipKb, { capture: true, passive: true });
      window.addEventListener("pageshow", disarmSkipKb, false);
      document.addEventListener(
        "visibilitychange",
        function () {
          try {
            if (document.hidden) disarmSkipKb();
          } catch (eVis) {}
        },
        false,
      );
    }
  } catch (eSkipGh) {}
})(typeof window !== "undefined" ? window : this);
/* violKill1 */
/* extOnlyFix1 */
/* perfIdleReflow1 */
/* navUserNameMarqueeKeep1 */
/* userMqIdlePause1 */
/* lazyImgDims1 */
/* lazyImgDims2 */
/* bootResumeCpu1 */
/* assetPageFilter1 */
/* siteOptAll1 */

