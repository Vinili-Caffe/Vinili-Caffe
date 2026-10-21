/**
 * copyText1: ©®™ restano testo (no twemoji viola)
 * emojiDiscordFast1: same-origin twemoji + PNG 72 (più veloce degli SVG) + warm brand + Cache API
 * wmMqEmojiFree1: preferisci /emoji/ same-origin, CDN solo fallback; pin CSS anti-clip
 * emojiColorFast1: parse header/titoli subito dopo twemoji; no delay auth
 * emojiNo404Local1: local solo per PNG presenti su /emoji/72x72 — resto CDN (no 404 console)
 */
(function () {
  var STAMP = "20261019wmEmojiFree2";
  if (window.__vcEmojiRender === STAMP) return;
  window.__vcEmojiRender = STAMP;

  var TWEMOJI_SRC = "/js/vendor/twemoji.min.js?v=20261009wmMqEmojiFree1";
  var TWEMOJI_SRC_FALLBACK =
    "https://cdn.jsdelivr.net/npm/@twemoji/api@15.1.0/dist/twemoji.min.js";
  var TWEMOJI_BASE_LOCAL = "/emoji/";
  var TWEMOJI_BASE_CDN = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/";
  /* default CDN: evita burst 404 su icone non mirrorate in /emoji/72x72 */
  var TWEMOJI_BASE = TWEMOJI_BASE_CDN;
  /* PNG 72: decode più leggero degli SVG per decine di emoji in pagina */
  var TWEMOJI_FOLDER = "72x72";
  var TWEMOJI_EXT = ".png";
  var CACHE_NAME = "vc-twemoji-png-v2";
  /* solo file realmente presenti in /emoji/72x72 (mirror brand) */
  var LOCAL_CODES = {
    "1f1ee-1f1f9": 1,
    "1f342": 1,
    "1f382": 1,
    "1f383": 1,
    "1f3b5": 1,
    "1f3b6": 1,
    "2615": 1,
    "2764": 1,
  };
  /* solo brand wordmark (🎃🍂) — niente preload unused di icone non in chrome */
  var WARM_CODES = ["1f383", "1f342"];

  var SKIP_TAGS = {
    SCRIPT: 1,
    STYLE: 1,
    TEXTAREA: 1,
    INPUT: 1,
    SELECT: 1,
    OPTION: 1,
    CODE: 1,
    PRE: 1,
    SVG: 1,
    MATH: 1,
    NOSCRIPT: 1,
  };

  function ensureHints() {
    try {
      if (document.getElementById("vc-emoji-preconnect")) return;
      var head = document.head || document.documentElement;
      var a = document.createElement("link");
      a.id = "vc-emoji-preconnect";
      a.rel = "preconnect";
      a.href = "https://cdn.jsdelivr.net";
      a.crossOrigin = "anonymous";
      head.appendChild(a);
      var b = document.createElement("link");
      b.rel = "dns-prefetch";
      b.href = "https://cdn.jsdelivr.net";
      head.appendChild(b);
    } catch (eHint) {}
  }

  function emojiUrl(icon, base) {
    return String(base || TWEMOJI_BASE) + TWEMOJI_FOLDER + "/" + icon + TWEMOJI_EXT;
  }

  function warmBrand() {
    try {
      var urls = [];
      for (var i = 0; i < WARM_CODES.length; i++) {
        urls.push(emojiUrl(WARM_CODES[i], TWEMOJI_BASE_LOCAL));
      }
      if (window.caches && caches.open) {
        caches.open(CACHE_NAME).then(function (cache) {
          return Promise.all(
            urls.map(function (u) {
              return cache.match(u).then(function (hit) {
                if (hit) return;
                return cache.add(u).catch(function () {});
              });
            }),
          );
        }).catch(function () {});
      }
      for (var j = 0; j < urls.length; j++) {
        var img = new Image();
        try {
          img.decoding = "async";
        } catch (eDec) {}
        img.src = urls[j];
      }
    } catch (eWarm) {}
  }

  function pinEmojiImgFallback(root) {
    if (!root || !root.querySelectorAll) return;
    try {
      var nodes = root.querySelectorAll("img.vc-emoji, img.vc-twemoji");
      for (var i = 0; i < nodes.length; i++) {
        var img = nodes[i];
        if (!img || img.getAttribute("data-vc-emoji-fb") === "1") continue;
        img.setAttribute("data-vc-emoji-fb", "1");
        img.addEventListener(
          "error",
          function () {
            try {
              /* bugListBoot1: CDN fail (phone) → local brand codes; local fail → CDN */
              var el = this;
              var src = String(el.currentSrc || el.src || "");
              if (!src) return;
              var m = /\/([0-9a-f-]+)\.png(?:\?|$)/i.exec(src);
              if (!m) return;
              var code = m[1];
              if (/cdn\.jsdelivr\.net/i.test(src)) {
                if (LOCAL_CODES[code]) el.src = emojiUrl(code, TWEMOJI_BASE_LOCAL);
                return;
              }
              el.src = emojiUrl(code, TWEMOJI_BASE_CDN);
            } catch (eFb) {}
          },
          { once: true },
        );
      }
    } catch (ePin) {}
  }

  function sanitizeDiscordDecorText(raw) {
    var s = String(raw || "");
    if (!s) return s;
    try {
      s = s.normalize("NFKC");
    } catch (eN) {}
    s = s.replace(/[\uFE30-\uFE4F]/g, "·");
    s = s.replace(/[\u0F00-\u0FFF]/g, "");
    s = s.replace(/[\u1C90-\u1CBF]/g, " ");
    s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "");
    s = s.replace(/[·\u00B7\u2022\u2219]{2,}/g, "·");
    s = s.replace(/\s+/g, " ");
    return s;
  }

  function shouldSkipNode(node) {
    if (!node || node.nodeType !== 1) return true;
    if (SKIP_TAGS[node.tagName]) return true;
    if (node.isContentEditable) return true;
    if (
      node.closest &&
      node.closest(
        /* perksRoleKeep1: NON strippare ༄ / apex Discord nei chip ruolo (NFKC+tibetan kill) */
        "[contenteditable='true'], [data-vc-emoji-skip='1'], .vc-footer-copy-link, .vc-premium-footer__legal, footer .vc-footer-copy, .vc-sponsor-mention, .vc-perks-tier-acc__headline, .vc-discord-entity, [data-vc-role-id]"
      )
    ) {
      return true;
    }
    return false;
  }

  var LEGAL_SYMBOL_IDS = { a9: 1, ae: 1, "2122": 1 };
  function isLegalSymbolIcon(icon) {
    var id = String(icon || "")
      .toLowerCase()
      .replace(/^0+/, "");
    return !!LEGAL_SYMBOL_IDS[id];
  }

  function demojifyLegalSymbols(root) {
    if (!root || !root.querySelectorAll) return;
    try {
      var COPY = String.fromCharCode(0xa9);
      var REG = String.fromCharCode(0xae);
      var TM = String.fromCharCode(0x2122);
      var imgs = root.querySelectorAll(
        "img.vc-twemoji, img.vc-emoji, .vc-footer-copy-link img, .vc-premium-footer__legal img"
      );
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        if (!img || !img.parentNode) continue;
        var alt = String(img.getAttribute("alt") || "");
        var src = String(img.getAttribute("src") || "").toLowerCase();
        var base = (src.split("/").pop() || "").split("?")[0];
        var legal =
          alt === COPY ||
          alt === REG ||
          alt === TM ||
          base === "a9.png" ||
          base === "00a9.png" ||
          base === "ae.png" ||
          base === "00ae.png" ||
          base === "2122.png";
        if (!legal) continue;
        var ch = COPY;
        if (alt === REG || base === "ae.png" || base === "00ae.png") ch = REG;
        else if (alt === TM || base === "2122.png") ch = TM;
        else if (alt === COPY || alt === REG || alt === TM) ch = alt;
        img.parentNode.replaceChild(document.createTextNode(ch), img);
      }
    } catch (eDm) {}
  }

  function sanitizeTextNodes(root) {
    if (!root || !root.querySelectorAll) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
        if (!/[\u0F00-\u0FFF\u1C90-\u1CBF\uFE30-\uFE4F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/.test(node.nodeValue)) {
          return NodeFilter.FILTER_REJECT;
        }
        var p = node.parentElement;
        if (!p || shouldSkipNode(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var next = sanitizeDiscordDecorText(n.nodeValue);
      if (next !== n.nodeValue) n.nodeValue = next;
    }
  }

  function ensureEmojiSizeCss() {
    var style = document.getElementById("vc-emoji-size-css");
    if (!style) {
      style = document.createElement("style");
      style.id = "vc-emoji-size-css";
      (document.head || document.documentElement).appendChild(style);
    }
    if (style.getAttribute("data-vc") === "emojiColorFast2") return;
    style.setAttribute("data-vc", "emojiColorFast2");
    style.textContent =
      "html.vc-site-polish body.vc-body img.vc-emoji," +
      "html.vc-site-polish body.vc-body img.vc-twemoji," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body img.vc-emoji," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body img.vc-twemoji," +
      "html.vc-site-polish[data-vc-theme=light] body.vc-body img.vc-emoji," +
      "html.vc-site-polish[data-vc-theme=light] body.vc-body img.vc-twemoji," +
      "img.vc-emoji,img.vc-twemoji,img.vc-discord-emoji,img.vc-staff-guide-emoji{" +
      "height:1.2em!important;width:1.2em!important;" +
      "max-width:1.35em!important;max-height:1.35em!important;" +
      "margin:0 .08em!important;padding:0!important;" +
      "display:inline-block!important;vertical-align:-.2em!important;" +
      "object-fit:contain!important;flex:0 0 auto!important;" +
      "border:0!important;border-radius:0!important;box-shadow:none!important;" +
      "background:transparent!important;background-image:none!important;" +
      "-webkit-background-clip:border-box!important;background-clip:border-box!important;" +
      "color:initial!important;-webkit-text-fill-color:initial!important;" +
      "filter:none!important;-webkit-filter:none!important;" +
      "opacity:1!important;visibility:visible!important;" +
      "text-shadow:none!important;transform:none!important;" +
      "forced-color-adjust:none!important}" +
      /* wmMqEmojiFree1: wordmark/nav/profile — mai clip-text / fill trasparente sulle emoji */
      "html body.vc-body header a.vc-header-site-name .vc-emoji," +
      "html body.vc-body header a.vc-header-site-name img.vc-emoji," +
      "html body.vc-body header a.vc-header-site-name img.vc-twemoji," +
      "html body.vc-body .vc-user-profile-name .vc-emoji," +
      "html body.vc-body .vc-user-profile-name img.vc-emoji," +
      "html body.vc-body .vc-user-profile-name img.vc-twemoji," +
      "html body.vc-body .discord-profile-link__name .vc-emoji," +
      "html body.vc-body .discord-profile-link__name img.vc-emoji," +
      "html body.vc-body .discord-profile-link__name img.vc-twemoji{" +
      "background:none!important;background-image:none!important;" +
      "-webkit-background-clip:border-box!important;background-clip:border-box!important;" +
      "color:inherit!important;-webkit-text-fill-color:initial!important;" +
      "filter:none!important;opacity:1!important;visibility:visible!important;" +
      "display:inline-block!important}" +
      "html body.vc-body .vc-user-profile-name img.vc-emoji," +
      "html body.vc-body .vc-user-profile-name img.vc-twemoji{" +
      "height:1em!important;width:1em!important;" +
      "max-width:1.15em!important;max-height:1.15em!important;" +
      "vertical-align:-.12em!important}" +
      ".vc-footer-copy-link,.vc-premium-footer__legal,.vc-premium-footer__legal a," +
      ".vc-premium-footer__legal p{font-variant-emoji:text!important;" +
      "font-family:inherit!important}";
  }

  function isAboveFold(el) {
    try {
      if (!el || !el.closest) return false;
      return !!el.closest(
        "header, .vc-nav-shell, .vc-header-site-name, .vc-page-cine-hero, .vc-home-cine-hero, #vc-page-intro, .vc-support-page-hero",
      );
    } catch (eFold) {
      return false;
    }
  }

  /* discordRoleLook2: non parse-are sotto [data-vc-emoji-skip] (chip/canali Discord native) */
  /* wmEmojiFree2: wordmark brand (header/footer) mai twemoji — plain text */
  function withEmojiSkipShelved(root, fn) {
    var held = [];
    try {
      var nodes = root && root.querySelectorAll
        ? root.querySelectorAll(
            '[data-vc-emoji-skip="1"], a.vc-header-site-name, .vc-header-site-name, .vc-premium-footer__wordmark',
          )
        : [];
      var seen = [];
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el || !el.parentNode) continue;
        if (seen.indexOf(el) !== -1) continue;
        seen.push(el);
        try {
          el.setAttribute("data-vc-emoji-skip", "1");
        } catch (eAttr) {}
        var ph = document.createComment("vc-emoji-skip");
        el.parentNode.replaceChild(ph, el);
        held.push({ el: el, ph: ph });
      }
    } catch (eShelve) {}
    try {
      fn();
    } finally {
      for (var j = 0; j < held.length; j++) {
        try {
          if (held[j].ph && held[j].ph.parentNode) {
            held[j].ph.parentNode.replaceChild(held[j].el, held[j].ph);
          }
        } catch (eRestore) {}
      }
    }
  }

  function parseTwemoji(root) {
    if (!root || !window.twemoji || typeof window.twemoji.parse !== "function") return;
    try {
      /* discordRoleLook2: root stesso con skip → non parse (querySelectorAll non include root) */
      try {
        if (
          root.getAttribute &&
          root.getAttribute("data-vc-emoji-skip") === "1"
        ) {
          return;
        }
        if (root.closest && root.closest('[data-vc-emoji-skip="1"]')) {
          return;
        }
      } catch (eSkipRoot) {}
      ensureEmojiSizeCss();
      var fold = isAboveFold(root) || root === document.body;
      withEmojiSkipShelved(root, function () {
        window.twemoji.parse(root, {
          base: TWEMOJI_BASE,
          folder: TWEMOJI_FOLDER,
          ext: TWEMOJI_EXT,
          className: "vc-emoji vc-twemoji",
          callback: function (icon) {
            if (isLegalSymbolIcon(icon)) return false;
            var id = String(icon || "").toLowerCase();
            if (LOCAL_CODES[id]) return emojiUrl(id, TWEMOJI_BASE_LOCAL);
            return emojiUrl(id, TWEMOJI_BASE_CDN);
          },
          attributes: function () {
            return {
              loading: fold ? "eager" : "lazy",
              decoding: "async",
              draggable: "false",
              width: "20",
              height: "20",
            };
          },
        });
      });
      demojifyLegalSymbols(root);
      pinEmojiImgFallback(root);
      /* dopo parse: header/nav/profile eager + fetchpriority + mark host */
      try {
        var nodes = root.querySelectorAll
          ? root.querySelectorAll(
              "header img.vc-emoji, .vc-header-site-name img.vc-emoji, .vc-nav-shell img.vc-emoji, .vc-user-profile-name img.vc-emoji, .discord-profile-link__name img.vc-emoji, main img.vc-emoji, main img.vc-twemoji",
            )
          : [];
        for (var i = 0; i < nodes.length; i++) {
          nodes[i].loading = "eager";
          try {
            nodes[i].fetchPriority = "high";
          } catch (eFp) {}
          try {
            var hp = nodes[i].parentElement;
            var hops = 0;
            while (hp && hops < 6) {
              hops++;
              var tg = String(hp.tagName || "").toUpperCase();
              if (tg === "H1" || tg === "H2" || tg === "H3" || tg === "H4" || (hp.classList && hp.classList.contains("vc-brand-glow"))) {
                hp.classList.add("vc-has-emoji");
                break;
              }
              hp = hp.parentElement;
            }
          } catch (eMark) {}
        }
      } catch (eEager) {}
    } catch (eParse) {}
  }

  function enhance(root) {
    root = root || document.body;
    if (!root) return;
    ensureEmojiSizeCss();
    try {
      var copies = root.querySelectorAll
        ? root.querySelectorAll(
            ".vc-footer-copy-link, .vc-premium-footer__legal, a.vc-header-site-name, .vc-header-site-name, .vc-premium-footer__wordmark",
          )
        : [];
      for (var ci = 0; ci < copies.length; ci++) {
        copies[ci].setAttribute("data-vc-emoji-skip", "1");
      }
    } catch (eMark) {}
    sanitizeTextNodes(root);
    parseTwemoji(root);
    demojifyLegalSymbols(root);
    pinEmojiImgFallback(root);
  }

  function loadTwemoji(cb) {
    if (window.twemoji) {
      cb();
      return;
    }
    if (window.__vcTwemojiLoading) {
      window.__vcTwemojiLoading.push(cb);
      return;
    }
    window.__vcTwemojiLoading = [cb];
    ensureHints();
    warmBrand();
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      var q = window.__vcTwemojiLoading || [];
      window.__vcTwemojiLoading = null;
      for (var i = 0; i < q.length; i++) {
        try {
          q[i]();
        } catch (eCb) {}
      }
    }
    function inject(src, isFallback) {
      var s = document.createElement("script");
      s.src = src;
      /* cueEmojiBoot1: sync parse — twemoji pronto prima del body enhance */
      s.async = false;
      s.onload = finish;
      s.onerror = function () {
        if (!isFallback) inject(TWEMOJI_SRC_FALLBACK, true);
        else {
          window.__vcTwemojiLoading = null;
        }
      };
      (document.head || document.documentElement).appendChild(s);
    }
    inject(TWEMOJI_SRC, false);
  }

  function markEmojiBootDone() {
    try {
      window.__vcEmojiBootDone = 1;
      document.dispatchEvent(new CustomEvent("vc-emoji-boot", { detail: { stamp: STAMP } }));
    } catch (eMark) {}
  }

  function isLegalEmojiScope() {
    try {
      if (window.__vcEmojiLegalScope) return true;
      return /\/(privacy|terms|cookie|copyright|dati|regole)(\/|$)/i.test(
        String(location.pathname || "/"),
      );
    } catch (eSc) {
      return false;
    }
  }

  function enhanceCritical() {
    try {
      if (window.VcEmojiColor && typeof window.VcEmojiColor.flushCritical === "function") {
        window.VcEmojiColor.flushCritical();
      } else if (window.VcEmojiColor && typeof window.VcEmojiColor.wrap === "function") {
        window.VcEmojiColor.wrap(document.querySelector("header") || document.body);
      }
    } catch (eWrap) {}
    /* wmEmojiFree2: niente parse sul brand wordmark (🎃🍂 restano fuori) */
    var urgent = ["header"];
    var rest = isLegalEmojiScope()
      ? []
      : [
          ".vc-page-cine-hero",
          ".vc-home-cine-hero",
          "#vc-page-intro",
          "main h1",
          "main h2",
          "main h3",
          "main h4",
          ".vc-brand-glow",
          ".vc-role-card",
          ".vc-user-profile-name",
        ];
    try {
      var brands = document.querySelectorAll(
        "a.vc-header-site-name, .vc-header-site-name, .vc-premium-footer__wordmark",
      );
      for (var bi = 0; bi < brands.length; bi++) {
        brands[bi].setAttribute("data-vc-emoji-skip", "1");
      }
    } catch (eBrandSkip) {}
    function runSels(sels) {
      for (var i = 0; i < sels.length; i++) {
        try {
          var list = document.querySelectorAll(sels[i]);
          for (var j = 0; j < list.length; j++) enhance(list[j]);
        } catch (eSel) {}
      }
    }
    runSels(urgent);
    window.setTimeout(function () {
      runSels(rest);
    }, 0);
  }

  function boot() {
    ensureHints();
    warmBrand();
    ensureEmojiSizeCss();
    /* cueEmojiBoot1: wrap critical PRIMA di twemoji (tint subito), poi PNG */
    try {
      if (window.VcEmojiColor && typeof window.VcEmojiColor.flushCritical === "function") {
        window.VcEmojiColor.flushCritical();
      }
    } catch (ePre) {}
    loadTwemoji(function () {
      enhanceCritical();
      try {
        document.documentElement.classList.add("vc-emoji-boot-done");
      } catch (eCls) {}
      /* legalPerfPack1: no full-body enhance su policy */
      if (isLegalEmojiScope()) {
        markEmojiBootDone();
        return;
      }
      var bodyGo = function () {
        try {
          enhance(document.body);
        } catch (eBody) {}
        markEmojiBootDone();
      };
      if (typeof window.requestIdleCallback === "function") {
        try {
          window.requestIdleCallback(bodyGo, { timeout: 400 });
        } catch (eIdle) {
          window.setTimeout(bodyGo, 48);
        }
      } else {
        window.setTimeout(bodyGo, 48);
      }
    });
  }

  function isTypingHot() {
    try {
      if (window.__vcTypingHot) return true;
      var ae = document.activeElement;
      if (!ae) return false;
      var tag = String(ae.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (ae.isContentEditable) return true;
    } catch (eHot) {}
    return false;
  }

  function shouldSkipEnhanceRoot(n) {
    if (!n || n.nodeType !== 1) return true;
    try {
      var tag = String(n.tagName || "").toUpperCase();
      if (SKIP_TAGS[tag]) return true;
      if (n.isContentEditable) return true;
      if (n.closest && n.closest("input, textarea, select, [contenteditable='true'], [data-vc-emoji-skip='1']")) {
        return true;
      }
    } catch (eSkip) {}
    return false;
  }

  function observe() {
    if (!window.MutationObserver || !document.body) return;
    var scheduled = false;
    var pending = [];
    function flush() {
      scheduled = false;
      /* inputLagKill1: mentre digiti non enhance — evita jank frame */
      if (isTypingHot()) {
        if (pending.length) {
          scheduled = true;
          window.setTimeout(flush, 120);
        }
        return;
      }
      /* violRafWheel1: max 8 root/tick — evita Violation MO→rAF 50–65ms */
      var roots = pending.splice(0, 8);
      for (var i = 0; i < roots.length; i++) {
        try {
          if (shouldSkipEnhanceRoot(roots[i])) continue;
          enhance(roots[i]);
        } catch (eRoot) {}
      }
      if (pending.length) {
        scheduled = true;
        window.setTimeout(flush, 16);
      }
    }
    var mo = new MutationObserver(function (records) {
      /* inputLagKill1: no characterData — contenteditable/title storm mentre digiti */
      if (isTypingHot()) return;
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        if (rec.type === "childList") {
          for (var j = 0; j < rec.addedNodes.length; j++) {
            var n = rec.addedNodes[j];
            if (n.nodeType === 1) {
              if (!shouldSkipEnhanceRoot(n)) pending.push(n);
            }
          }
        }
      }
      if (scheduled || !pending.length) return;
      scheduled = true;
      window.setTimeout(flush, 0);
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: false });
  }

  window.VcEmojiRender = {
    enhance: enhance,
    sanitizeDiscordDecorText: sanitizeDiscordDecorText,
    sanitizeDiscordChannelName: function (raw) {
      var s = sanitizeDiscordDecorText(raw).replace(/\s+/g, " ").trim();
      s = s.replace(/^[·\-\s|_]+|[·\-\s|_]+$/g, "").trim();
      return s || String(raw || "").trim();
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot();
      /* legalPerfPack1: no MutationObserver full-DOM su policy */
      if (!isLegalEmojiScope()) observe();
    });
  } else {
    boot();
    if (!isLegalEmojiScope()) observe();
  }
})();
