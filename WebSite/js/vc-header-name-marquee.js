(function () {
  if (typeof window === "undefined") return;
  var STAMP = "20261020mqNoSnapSettle1b";
  if (window.__vcHeaderSiteNameMarqueeWired === STAMP) return;
  window.__vcHeaderSiteNameMarqueeWired = STAMP;

  var timer = null;
  var syncing = false;
  var pendingSync = false;
  var TEXT_CLASS = "vc-header-site-name__text";
  var TRACK_CLASS = "vc-header-site-name__track";
  var ROOT_CLASS = "vc-header-site-name";

  /* wmUlUnify2: dark+light con picco chiaro (luce marrone flat = lettere invisibili su dark) */
  var METAL_DARK =
    "linear-gradient(180deg,#6f4e37 0%,#8b6e4d 16%,#c4a07a 34%,#f4e9d8 50%,#c4a07a 66%,#8b6e4d 84%,#6f4e37 100%)";
  var METAL_LIGHT =
    "linear-gradient(180deg,#3a281c 0%,#6f4e37 16%,#a67c52 32%,#f0e0c8 50%,#a67c52 68%,#6f4e37 84%,#3a281c 100%)";

  function isLightTheme() {
    try {
      var html = document.documentElement;
      if (html.getAttribute("data-vc-theme") === "light") return true;
      if (html.getAttribute("data-vc-theme") === "dark") return false;
      if (html.classList && html.classList.contains("vc-theme-light")) return true;
    } catch (eTh) {}
    return false;
  }

  /* wmGradUl2: host/track senza metallo (niente ghost); __text = clip metallo inline */
  function marqueeHostClearOne(el) {
    if (!el || !el.style) return;
    try {
      el.style.setProperty("background", "none", "important");
      el.style.setProperty("background-image", "none", "important");
      el.style.setProperty("background-color", "transparent", "important");
      el.style.setProperty("-webkit-background-clip", "border-box", "important");
      el.style.setProperty("background-clip", "border-box", "important");
      el.style.setProperty("color", "transparent", "important");
      el.style.setProperty("-webkit-text-fill-color", "transparent", "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.style.setProperty("filter", "none", "important");
      el.style.setProperty("-webkit-filter", "none", "important");
    } catch (eHost) {}
  }

  function marqueeMetalPaintOne(el) {
    if (!el || !el.style) return;
    var metal = isLightTheme() ? METAL_LIGHT : METAL_DARK;
    try {
      el.style.setProperty("background-image", metal, "important");
      el.style.setProperty("background-color", "transparent", "important");
      el.style.setProperty("background-size", "100% 100%", "important");
      el.style.setProperty("-webkit-background-clip", "text", "important");
      el.style.setProperty("background-clip", "text", "important");
      el.style.setProperty("color", "transparent", "important");
      el.style.setProperty("-webkit-text-fill-color", "transparent", "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.style.setProperty("text-decoration", "none", "important");
      el.style.setProperty("border-bottom", "none", "important");
      el.style.setProperty("box-shadow", "none", "important");
      /* wmUlSingleBar1: no pad sotto metal — con clip:text vira seconda barra */
      el.style.setProperty("padding-bottom", "0", "important");
      el.style.setProperty("filter", "none", "important");
      el.style.setProperty("-webkit-filter", "none", "important");
      el.style.setProperty("-webkit-backface-visibility", "hidden", "important");
      el.style.setProperty("backface-visibility", "hidden", "important");
      /* wmUlUnify2: niente uppercase/tracking diversi dal non-marquee */
      el.style.removeProperty("text-transform");
      el.style.removeProperty("letter-spacing");
      el.style.removeProperty("font-weight");
    } catch (ePaint) {}
  }

  /* wmDupKill1b: clear nested, poi metal solo sul leaf che ha i glyphs */
  function marqueeClearNestedGhost(textEl) {
    if (!textEl || !textEl.querySelectorAll) return;
    try {
      var nested = textEl.querySelectorAll("span, b, i, em, strong");
      for (var i = 0; i < nested.length; i++) marqueeHostClearOne(nested[i]);
    } catch (eNest) {}
  }

  function paintTextTree(textEl) {
    if (!textEl) return;
    ensureMetalTextSpans(textEl);
  }

  function repaintAllMarqueeMetal() {
    try {
      var hosts = document.querySelectorAll("header a.vc-header-site-name");
      for (var h = 0; h < hosts.length; h++) {
        var host = hosts[h];
        var track = host.querySelector("." + TRACK_CLASS);
        var texts = host.querySelectorAll("." + TEXT_CLASS);
        marqueeHostClearOne(host);
        marqueeHostClearOne(track);
        for (var i = 0; i < texts.length; i++) paintTextTree(texts[i]);
      }
    } catch (eRep) {}
  }

  function marqueeSolidPaint(el) {
    /* wmGradUl2: compat nome — host clear, __text metal (niente solid #f5d6b7) */
    if (!el) return;
    try {
      if (el.classList && el.classList.contains(TEXT_CLASS)) {
        marqueeMetalPaintOne(el);
        return;
      }
      if (el.classList && (el.classList.contains(ROOT_CLASS) || el.classList.contains(TRACK_CLASS))) {
        marqueeHostClearOne(el);
        return;
      }
    } catch (eCls) {}
    marqueeMetalPaintOne(el);
  }

  function clearMarqueeSolidPaint(el) {
    if (!el || !el.style) return;
    function clr(node) {
      if (!node || !node.style) return;
      try {
        node.style.removeProperty("background");
        node.style.removeProperty("background-image");
        node.style.removeProperty("background-color");
        node.style.removeProperty("background-size");
        node.style.removeProperty("-webkit-background-clip");
        node.style.removeProperty("background-clip");
        node.style.removeProperty("color");
        node.style.removeProperty("-webkit-text-fill-color");
        node.style.removeProperty("text-shadow");
        node.style.removeProperty("text-decoration");
        node.style.removeProperty("border-bottom");
        node.style.removeProperty("box-shadow");
        node.style.removeProperty("padding-bottom");
        node.style.removeProperty("filter");
        node.style.removeProperty("-webkit-filter");
        node.style.removeProperty("-webkit-backface-visibility");
        node.style.removeProperty("backface-visibility");
      } catch (eClr) {}
    }
    clr(el);
    try {
      var nodes = el.querySelectorAll("span, b, i, em, strong, a");
      for (var i = 0; i < nodes.length; i++) clr(nodes[i]);
    } catch (eDeepClr) {}
  }

  function wantsHeaderNavMarquee() {
    /* wmMqAllPages1: marquee wordmark su TUTTE le pagine (anche /tickets/) */
    return true;
  }

  function isDrawerBrandName(el) {
    try {
      return Boolean(el && el.closest && el.closest(".vc-mobile-nav-drawer__brand"));
    } catch (e) {
      return false;
    }
  }

  function isMobileNavOpen() {
    try {
      if (document.documentElement.classList.contains("vc-mobile-nav-open")) return true;
      var d = document.getElementById("vc-mobile-nav-drawer");
      return Boolean(d && d.classList.contains("vc-mobile-nav-drawer--open"));
    } catch (eO) {
      return false;
    }
  }

  function clearMarquee(nameEl, trackEl, textEl) {
    if (!nameEl) return;
    nameEl.classList.remove("is-marquee");
    nameEl.style.removeProperty("--vc-marquee-distance");
    nameEl.style.removeProperty("--vc-marquee-duration");
    nameEl.removeAttribute("data-vc-marquee-dist");
    nameEl.removeAttribute("data-vc-marquee-cw");
    nameEl.removeAttribute("data-vc-marquee-text");
    clearMarqueeSolidPaint(nameEl);
    if (trackEl) {
      var nodes = trackEl.querySelectorAll("." + TEXT_CLASS);
      for (var i = nodes.length - 1; i >= 1; i--) {
        if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
      }
      trackEl.style.transform = "";
      trackEl.style.animation = "";
      for (var j = 0; j < nodes.length; j++) clearMarqueeSolidPaint(nodes[j]);
    }
    if (textEl) {
      clearMarqueeSolidPaint(textEl);
      textEl.style.paddingInlineEnd = "";
    }
  }

  function measureSegmentWidth(trackEl, textEl) {
    /* violPass2: una sola lettura scrollWidth — no void offsetWidth + getBCR (Forced reflow) */
    var fromText = 0;
    try {
      fromText = Math.ceil((textEl && textEl.scrollWidth) || 0);
    } catch (eSw) {}
    if (fromText > 0) return Math.max(fromText, 36);
    try {
      return Math.max(Math.round((trackEl.scrollWidth || 0) / 2), 36);
    } catch (eTw) {
      return 36;
    }
  }

  function isBrandNameLink(el) {
    if (!el || el.tagName !== "A") return false;
    if (el.classList.contains("vc-dashboard-header-guild-name")) return false;
    if (el.classList.contains("vc-header-logo-link")) return false;
    // Nav tiles must never be treated as the brand/home name.
    if (el.classList.contains("vc-snav-item") || el.classList.contains("vc-snav-row")) return false;
    try {
      if (el.closest && el.closest("nav.vc-header-snav, .vc-snav-panel, .vc-mobile-nav-drawer__scroll")) return false;
    } catch (eNav) {}
    if (el.classList.contains("vc-header-site-name")) {
      var prev = el.previousElementSibling;
      return Boolean(prev && prev.classList && prev.classList.contains("vc-header-logo-link"));
    }
    var prev2 = el.previousElementSibling;
    return Boolean(prev2 && prev2.classList && prev2.classList.contains("vc-header-logo-link"));
  }

  function collectBrandNameLinks(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var logos = scope.querySelectorAll("a.vc-header-logo-link");
    var out = [];
    var seen = typeof WeakSet === "function" ? new WeakSet() : null;
    function add(next) {
      if (!isBrandNameLink(next)) return;
      /* drawerWmMarquee1: includi anche wordmark hamburger (prima escluso) */
      if (seen) {
        if (seen.has(next)) return;
        seen.add(next);
      } else if (out.indexOf(next) !== -1) {
        return;
      }
      out.push(next);
    }
    for (var i = 0; i < logos.length; i++) {
      add(logos[i].nextElementSibling);
    }
    var named = scope.querySelectorAll("a.vc-header-site-name");
    for (var n = 0; n < named.length; n++) add(named[n]);
    return out;
  }

  function stripTruncateClass(el) {
    if (!el || !el.classList) return;
    el.classList.remove("truncate");
    try {
      var cls = String(el.getAttribute("class") || "");
      if (/\btruncate\b/.test(cls)) {
        el.setAttribute("class", cls.replace(/\btruncate\b/g, " ").replace(/\s+/g, " ").trim());
      }
    } catch (e) {}
  }

  /* cpuHoverIdle1: niente emoji nel wordmark (no twemoji/decode cost) */
  function stripBrandEmoji(s) {
    var t = String(s || "");
    try {
      t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "");
    } catch (eRe) {
      t = t.replace(/🎃|🍂|🎃|›/g, "").replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");
    }
    return t.replace(/\s{2,}/g, " ").replace(/\s+•/g, " •").replace(/•\s+/g, "• ").trim();
  }

  function brandFallbackText(nameEl) {
    /* wmUlHomeOnly1 + cpuHoverIdle1: wordmark testo plain (no emoji) */
    var fallback = "Vinili & Caffè • Italia • Social • Gaming";
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var branded = stripBrandEmoji(String(window.VcI18n.t("brand.name") || "").trim());
        if (branded && branded !== "brand.name" && /Italia|Social|Gaming/i.test(branded)) {
          return branded;
        }
      }
    } catch (eBrand) {}
    var aria = stripBrandEmoji(String((nameEl && nameEl.getAttribute("aria-label")) || "").trim());
    if (!aria || /vai alla homepage|go to homepage|homepage/i.test(aria)) return fallback;
    if (!/Italia|Social|Gaming/i.test(aria)) return fallback;
    return aria;
  }

  function normalizeBrandLabel(nameEl) {
    if (!nameEl) return;
    try {
      if (nameEl.classList && (nameEl.classList.contains("vc-snav-item") || nameEl.classList.contains("vc-snav-row"))) {
        return;
      }
      /* dashboard guild chip: non forzare brand home */
      if (nameEl.classList && nameEl.classList.contains("vc-dashboard-header-guild-name")) return;
      var full = brandFallbackText(nameEl);
      try {
        nameEl.setAttribute("data-vc-emoji-skip", "1");
      } catch (eSkip) {}
      var textEl =
        nameEl.querySelector("." + TEXT_CLASS) ||
        nameEl.querySelector(".text-emerald-300") ||
        nameEl.querySelector("span:not(.vc-header-site-name__track)");
      if (!textEl) return;
      /* togli img emoji / twemoji dal wordmark */
      try {
        var emImgs = textEl.querySelectorAll("img.vc-emoji, img.vc-twemoji, img.emoji, .vc-emoji, .vc-twemoji");
        for (var ei = 0; ei < emImgs.length; ei++) {
          var em = emImgs[ei];
          if (em && em.parentNode) em.parentNode.removeChild(em);
        }
      } catch (eEm) {}
      var cur = stripBrandEmoji(String(textEl.textContent || "").trim());
      var looksBrand = /Vinili/i.test(cur) && /Italia|Social|Gaming/i.test(cur);
      /* wmMqDashBrand1 + cpuHoverIdle1: plain wordmark sempre */
      if (!cur || !looksBrand || cur !== full) {
        textEl.textContent = full;
        try {
          nameEl.removeAttribute("data-i18n");
        } catch (eDi) {}
      }
    } catch (eNorm) {}
  }

  var METAL_CLASS = "vc-header-site-name__metal";

  /* wmDupKill1c: unwrap emerald; metallo SOLO su span testo (img fuori = no ghost WebKit) */
  function flattenTextEmerald(textEl) {
    if (!textEl || !textEl.querySelector) return;
    try {
      var wraps = textEl.querySelectorAll(".text-emerald-300");
      for (var i = 0; i < wraps.length; i++) {
        var wrap = wraps[i];
        if (!wrap || !wrap.parentNode) continue;
        while (wrap.firstChild) wrap.parentNode.insertBefore(wrap.firstChild, wrap);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    } catch (eFlat) {}
  }

  /* wmMqEmojiFree1: img/.vc-emoji MAI dentro .__metal (clip-text li appiattisce / nasconde) */
  function isEmojiLeafNode(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      if (node.tagName === "IMG") return true;
      if (node.classList && (node.classList.contains("vc-emoji") || node.classList.contains("vc-twemoji"))) {
        return true;
      }
      if (node.querySelector && node.querySelector("img.vc-emoji, img.vc-twemoji, img.emoji")) {
        return true;
      }
    } catch (eLeaf) {}
    return false;
  }

  function metalStructureOk(textEl) {
    if (!textEl || !textEl.querySelector) return false;
    try {
      if (textEl.querySelector("." + METAL_CLASS + " img")) return false;
      if (textEl.querySelector("." + METAL_CLASS + " .vc-emoji, ." + METAL_CLASS + " .vc-twemoji")) return false;
      if (textEl.querySelector(".text-emerald-300")) return false;
      var metals = textEl.querySelectorAll("." + METAL_CLASS);
      if (!metals.length) return false;
      return true;
    } catch (eOk) {
      return false;
    }
  }

  function ensureMetalTextSpans(textEl) {
    if (!textEl) return;
    flattenTextEmerald(textEl);
    try {
      /* wmMqFast1: se già img+metal ok → solo repaint, niente rebuild (era reflow 300–400ms) */
      if (metalStructureOk(textEl)) {
        var keep = textEl.querySelectorAll("." + METAL_CLASS);
        for (var k = 0; k < keep.length; k++) marqueeMetalPaintOne(keep[k]);
        marqueeHostClearOne(textEl);
        return;
      }
      var oldMetals = textEl.querySelectorAll("." + METAL_CLASS);
      for (var um = 0; um < oldMetals.length; um++) {
        var wrap = oldMetals[um];
        if (!wrap || !wrap.parentNode) continue;
        while (wrap.firstChild) wrap.parentNode.insertBefore(wrap.firstChild, wrap);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
      var nodes = [];
      for (var i = 0; i < textEl.childNodes.length; i++) nodes.push(textEl.childNodes[i]);
      while (textEl.firstChild) textEl.removeChild(textEl.firstChild);
      var buf = null;
      function flushBuf() {
        if (!buf || !String(buf.textContent || "").length) {
          buf = null;
          return;
        }
        textEl.appendChild(buf);
        marqueeMetalPaintOne(buf);
        buf = null;
      }
      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        if (!node) continue;
        if (isEmojiLeafNode(node)) {
          flushBuf();
          textEl.appendChild(node);
          continue;
        }
        if (!buf) {
          buf = document.createElement("span");
          buf.className = METAL_CLASS;
        }
        buf.appendChild(node);
      }
      flushBuf();
      marqueeHostClearOne(textEl);
    } catch (eMetal) {
      try {
        marqueeMetalPaintOne(textEl);
      } catch (ePaint) {}
    }
  }

  /* wmMqFast1: niente coda __vcLight (gap 320ms) per avvio marquee */
  function mqSoon(fn, delayMs) {
    var d = Math.max(0, Number(delayMs) || 0);
    window.setTimeout(function () {
      try {
        fn();
      } catch (eMq) {}
    }, d);
  }

  /* cpuHoverIdle1 + wmEmojiFree2: footer plain come header (no 🎃🍂 / twemoji) */
  var footerWmSyncing = false;
  function syncFooterWordmark() {
    if (footerWmSyncing) return;
    footerWmSyncing = true;
    try {
      var plain = brandFallbackText(null);
      var nodes = document.querySelectorAll("footer .vc-premium-footer__wordmark");
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        try {
          el.setAttribute("data-vc-emoji-skip", "1");
          var emImgs = el.querySelectorAll("img.vc-emoji, img.vc-twemoji, img.emoji, .vc-emoji, .vc-twemoji");
          for (var ei = 0; ei < emImgs.length; ei++) {
            var em = emImgs[ei];
            if (em && em.parentNode) em.parentNode.removeChild(em);
          }
          var cur = stripBrandEmoji(String(el.textContent || "").trim());
          if (!cur || cur !== plain || el.querySelector("img")) {
            el.textContent = plain;
          }
        } catch (eStrip) {}
        ensureMetalTextSpans(el);
      }
    } catch (eFoot) {
    } finally {
      footerWmSyncing = false;
    }
  }

  function ensureStructure(nameEl) {
    if (!nameEl) return null;
    nameEl.classList.add(ROOT_CLASS);
    stripTruncateClass(nameEl);
    var track = nameEl.querySelector("." + TRACK_CLASS);
    if (track) {
      /* navBrandHostNoClip1: sposta nodi fuori dal track (testo fantasma sotto marquee) */
      var stray = [];
      for (var si = 0; si < nameEl.childNodes.length; si++) {
        var ch = nameEl.childNodes[si];
        if (ch !== track) stray.push(ch);
      }
      var texts = track.querySelectorAll("." + TEXT_CLASS);
      var textEl = texts[0] || null;
      if (!textEl) {
        textEl = document.createElement("span");
        textEl.className = TEXT_CLASS;
        track.insertBefore(textEl, track.firstChild);
      }
      for (var sj = 0; sj < stray.length; sj++) {
        textEl.appendChild(stray[sj]);
      }
      flattenTextEmerald(textEl);
      if (!String(textEl.textContent || "").trim()) {
        textEl.textContent = brandFallbackText(nameEl);
      }
      return { track: track, text: textEl };
    }
    track = document.createElement("span");
    track.className = TRACK_CLASS;
    var text = document.createElement("span");
    text.className = TEXT_CLASS;
    while (nameEl.firstChild) text.appendChild(nameEl.firstChild);
    flattenTextEmerald(text);
    if (!String(text.textContent || "").trim()) {
      text.textContent = brandFallbackText(nameEl);
    }
    track.appendChild(text);
    nameEl.appendChild(track);
    return { track: track, text: text };
  }

  /* wmDupKill1b: metallo SOLO sull'elemento che ha i text node (emerald o __text).
     Clip sul parent + fill transparent sul child = ghost WebKit. */
  function applySingleMetalLayer(nameEl, trackEl, textEl) {
    marqueeHostClearOne(nameEl);
    marqueeHostClearOne(trackEl);
    paintTextTree(textEl);
  }

  function syncOne(nameEl) {
    normalizeBrandLabel(nameEl);
    var parts = ensureStructure(nameEl);
    if (!parts || !parts.track || !parts.text) return;
    var trackEl = parts.track;
    var textEl = parts.text;
    normalizeBrandLabel(nameEl);
    var textNodes = trackEl.querySelectorAll("." + TEXT_CLASS);
    var nextText = String(textEl.textContent || "").trim();

    /* drawerWmMarquee2: wordmark hamburger SEMPRE marquee (come navbar);
       con width ampia preMeasure “ci sta” → niente anim (bug live confessionale) */
    var drawerBrand = isDrawerBrandName(nameEl);
    if (drawerBrand) {
      stripTruncateClass(nameEl);
      try {
        nameEl.style.maxWidth = "100%";
        nameEl.style.minWidth = "0";
        nameEl.style.overflow = "hidden";
      } catch (eDw) {}
    }

    if (!wantsHeaderNavMarquee()) {
      if (nameEl.classList.contains("is-marquee")) clearMarquee(nameEl, trackEl, textEl);
      applySingleMetalLayer(nameEl, trackEl, textEl);
      return;
    }

    /* mqNoRestart1 + mqIdleResumeAll1: clone+dist ok → ZERO touch (emoji/MO non ripartono)
       drawerWmMarquee2: se drawer aperto senza is-marquee, non early-return da altri host */
    if (nameEl.classList.contains("is-marquee")) {
      var hasClone = trackEl.querySelector("." + TEXT_CLASS + ".is-clone");
      var stored = Number(nameEl.getAttribute("data-vc-marquee-dist") || 0);
      var prevText = String(nameEl.getAttribute("data-vc-marquee-text") || "");
      /* soglia 80: emoji enhance non deve forzare rebuild mid-spin */
      if (hasClone && Number.isFinite(stored) && stored >= 80) {
        if (nextText && nextText !== prevText) {
          nameEl.setAttribute("data-vc-marquee-text", nextText);
        }
        return;
      }
    }

    /* metal solo se serve setup/rebuild */
    applySingleMetalLayer(nameEl, trackEl, textEl);

    nameEl.classList.remove("is-marquee");
    nameEl.style.removeProperty("--vc-marquee-distance");
    nameEl.style.removeProperty("--vc-marquee-duration");
    nameEl.removeAttribute("data-vc-marquee-dist");
    nameEl.removeAttribute("data-vc-marquee-cw");
    for (var i = textNodes.length - 1; i >= 1; i--) {
      textNodes[i].parentNode.removeChild(textNodes[i]);
    }
    textEl.style.paddingInlineEnd = "";
    trackEl.style.transform = "";

    /* wmMqFast1: is-marquee SYNC con distanza approx — measure refine async (no __vcLight) */
    try {
      var containerW = 0;
      try {
        containerW = Math.floor(Number(nameEl.getAttribute("data-vc-mq-cw") || 0));
      } catch (eCwA) {}
      if (!(containerW > 8)) {
        try {
          containerW = nameEl.clientWidth || 0;
          if (containerW > 8) nameEl.setAttribute("data-vc-mq-cw", String(containerW));
        } catch (eCwB) {}
      }
      if (!(containerW > 8)) {
        try {
          var bar = nameEl.closest && nameEl.closest(".vc-header-bar, header");
          if (bar) containerW = Math.floor((bar.clientWidth || 0) * 0.45) || 0;
        } catch (eCwC) {}
      }
      if (!(containerW > 8)) containerW = 220;
      var approxSeg = Math.max(180, Math.min(640, String(nextText || "").length * 10 + 40));
      /* misura PRIMA di is-marquee (host font-size:0 falsava scrollWidth → 36px / lento) */
      var preMeasure = 0;
      try {
        preMeasure = measureSegmentWidth(trackEl, textEl) || 0;
      } catch (ePre) {}
      if (preMeasure > 0 && preMeasure < approxSeg * 0.55) preMeasure = 0;
      /* wmMqDashBrand1: se il testo ci sta, niente marquee (evita "Dashboard" lento)
         drawerWmMarquee2: nel drawer forza sempre (testo brand lungo come navbar) */
      if (!drawerBrand && preMeasure > 0 && preMeasure <= containerW - 6) {
        applySingleMetalLayer(nameEl, trackEl, textEl);
        return;
      }
      if (drawerBrand && !(containerW > 40)) {
        try {
          var brandRow = nameEl.closest && nameEl.closest(".vc-mobile-nav-drawer__brand");
          if (brandRow) containerW = Math.max(120, Math.floor((brandRow.clientWidth || 0) * 0.72) || 0);
        } catch (eDwCw) {}
        if (!(containerW > 40)) containerW = 180;
      }
      var startSeg = Math.max(approxSeg, preMeasure || 0);
      var clone = textEl.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.classList.add("is-clone");
      textEl.style.paddingInlineEnd = "2rem";
      paintTextTree(clone);
      trackEl.appendChild(clone);
      nameEl.classList.add("is-marquee");
      nameEl.style.setProperty("--vc-marquee-distance", startSeg + "px", "important");
      /* wmMqDashBrand1: ~26px/s come home (era 40px/s clamp 12s → loop corto/lento su label) */
      var dur0 = Math.max(5, Math.min(18, startSeg / 26));
      nameEl.style.setProperty("--vc-marquee-duration", dur0.toFixed(1) + "s", "important");
      nameEl.setAttribute("data-vc-marquee-text", nextText);
      nameEl.setAttribute("data-vc-marquee-dist", String(startSeg));
      nameEl.setAttribute("data-vc-marquee-cw", String(containerW));
      nameEl.setAttribute("data-vc-wm-mq", STAMP);
      /* mqHoverOnly1: parte in pausa — gira solo hover */
      try {
        trackEl.style.setProperty("animation-play-state", "paused", "important");
        trackEl.style.setProperty("-webkit-animation-play-state", "paused", "important");
        trackEl.style.setProperty("transform", "translate3d(0,0,0)", "important");
      } catch (ePause0) {}
      /* mqNoRestart1: niente refine --vc-marquee-* post-start (var change = CSS anim restart mid-spin) */
      /* post-twemoji: metal/emoji SENZA toccare track/is-marquee (niente restart) */
      mqSoon(function () {
        try {
          if (!nameEl.classList.contains("is-marquee")) return;
          ensureMetalTextSpans(textEl);
          if (clone && clone.isConnected) ensureMetalTextSpans(clone);
          if (window.VcEmojiRender && typeof window.VcEmojiRender.enhance === "function") {
            window.VcEmojiRender.enhance(textEl);
            if (clone && clone.isConnected) window.VcEmojiRender.enhance(clone);
          }
        } catch (ePostEmoji) {}
      }, 480);
    } catch (eSync1) {}
  }

  function finishSyncing(root) {
    syncing = false;
    if (pendingSync) {
      pendingSync = false;
      schedule(root || document);
    }
  }

  function syncAll(root) {
    if (syncing) {
      pendingSync = true;
      return;
    }
    syncing = true;
    try {
      var links = collectBrandNameLinks(root);
      /* wmMqFast1: tutti i brand sync (niente gap 24ms — ritardava is-marquee) */
      for (var bi = 0; bi < links.length; bi++) {
        try {
          syncOne(links[bi]);
        } catch (eOne) {}
      }
      /* handlerPerf2: niente Mo/Ro refresh a ogni sync (era ~700ms+ Violation) */
      var n = links.length;
      if (window.__vcHeaderSiteNameLinkCount !== n) {
        window.__vcHeaderSiteNameLinkCount = n;
        if (typeof window.__vcHeaderSiteNameMoRefresh === "function") {
          try {
            window.__vcHeaderSiteNameMoRefresh();
          } catch (eRefMo) {}
        }
        if (typeof window.__vcHeaderSiteNameRoRefresh === "function") {
          try {
            window.__vcHeaderSiteNameRoRefresh();
          } catch (eRefRo) {}
        }
      }
    } catch (eSyncAll) {
    } finally {
      finishSyncing(root);
    }
  }

  function schedule(root) {
    if (syncing) {
      pendingSync = true;
      return;
    }
    try {
      if (document.hidden || document.visibilityState === "hidden") {
        /* fxStable1: hidden defer — non droppare il kick (tab/boot race) */
        if (!window.__vcWmMqHiddenKick) {
          window.__vcWmMqHiddenKick = 1;
          document.addEventListener(
            "visibilitychange",
            function onVis() {
              if (document.hidden) return;
              window.__vcWmMqHiddenKick = 0;
              document.removeEventListener("visibilitychange", onVis);
              schedule(root || document);
            },
            { passive: true }
          );
        }
        return;
      }
    } catch (eHid) {}
    if (timer) clearTimeout(timer);
    /* violKillConsole1: mai 0ms — setTimeout(0)+syncAll veniva attribuito al visibility/DCL */
    timer = setTimeout(function () {
      timer = null;
      try {
        if (document.hidden || document.visibilityState === "hidden") return;
      } catch (eHid2) {}
      try {
        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(
            function () {
              try {
                syncAll(root);
              } catch (eIdle) {}
            },
            { timeout: 220 },
          );
          return;
        }
      } catch (eRic) {}
      syncAll(root);
    }, 64);
  }

  function observeBrandHosts() {
    try {
      if (typeof MutationObserver !== "function") return;
      if (window.__vcHeaderSiteNameHostMo) return;
      var mo = new MutationObserver(function (records) {
        if (syncing) return;
        for (var i = 0; i < records.length; i++) {
          var rec = records[i];
          if (rec.type === "childList") {
            var nodes = [];
            if (rec.addedNodes && rec.addedNodes.length) nodes = nodes.concat([].slice.call(rec.addedNodes));
            if (rec.removedNodes && rec.removedNodes.length) nodes = nodes.concat([].slice.call(rec.removedNodes));
            for (var n = 0; n < nodes.length; n++) {
              var node = nodes[n];
              if (!node || node.nodeType !== 1) continue;
              if (
                (node.matches &&
                  node.matches("a.vc-header-logo-link, a.vc-header-site-name, .vc-header-bar, header")) ||
                (node.querySelector &&
                  node.querySelector("a.vc-header-logo-link, a.vc-header-site-name, .vc-header-bar"))
              ) {
                schedule(document);
                return;
              }
            }
          }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      window.__vcHeaderSiteNameHostMo = mo;
    } catch (eHostMo) {}
  }

  window.__vcSyncHeaderSiteNameMarquee = function (root) {
    /* violKillVis1: mai syncAll sync entro visibility/callers (era Violation 2s+) */
    schedule(root || document);
  };

  function brandMarqueeAlreadyRunning() {
    try {
      return !!document.querySelector(
        "a.vc-header-site-name.is-marquee .vc-header-site-name__text.is-clone",
      );
    } catch (eBr) {
      return false;
    }
  }

  function wire() {
    window.addEventListener(
      "resize",
      function () {
        if (brandMarqueeAlreadyRunning()) return;
        schedule(document);
      },
      { passive: true },
    );
    if (window.visualViewport) {
      window.visualViewport.addEventListener(
        "resize",
        function () {
          if (brandMarqueeAlreadyRunning()) return;
          schedule(document);
        },
        { passive: true },
      );
    }
    document.addEventListener("visibilitychange", function () {
      /* wmResumeHover1: al ritorno FG ri-arma play-state (anche se clone già lì);
         schedule solo se marquee non montato — early-return prima lasciava pause stuck. */
      if (document.hidden) return;
      window.setTimeout(function () {
        try {
          resumeBrandTracksIfActive();
          if (brandMarqueeAlreadyRunning()) return;
          schedule(document);
        } catch (eVis) {}
      }, 120);
    });
    document.addEventListener("vc:page-cine-ready", function () {
      if (brandMarqueeAlreadyRunning()) return;
      schedule(document);
    });
    document.addEventListener("vc:soft-fx-ready", function () {
      /* mqNoRestart1: soft-fx late non deve ripartire marquee già in moto */
      if (brandMarqueeAlreadyRunning()) return;
      schedule(document);
    });
    document.addEventListener("vc:chrome-ready", function () {
      if (brandMarqueeAlreadyRunning()) return;
      schedule(document);
    });
    /* drawerWmMarquee4: sync UNA volta all’apertura drawer —
       niente observe su <html> (class thrash → 200+ restart → transform stuck) */
    try {
      if (typeof MutationObserver === "function") {
        try {
          if (window.__vcDrawerWmMqMo && window.__vcDrawerWmMqMo.disconnect) {
            window.__vcDrawerWmMqMo.disconnect();
          }
        } catch (eDisc) {}
        window.__vcDrawerWmMqMo = null;
        var drawerWasOpen = isMobileNavOpen();
        var drawerSyncTimer = 0;
        function syncDrawerBrandOnce(forceRebuild) {
          try {
            var drawerNames = document.querySelectorAll(
              ".vc-mobile-nav-drawer__brand a.vc-header-site-name",
            );
            for (var di = 0; di < drawerNames.length; di++) {
              try {
                var el = drawerNames[di];
                if (!forceRebuild && el.classList.contains("is-marquee")) {
                  var hasClone = el.querySelector("." + TEXT_CLASS + ".is-clone");
                  var stored = Number(el.getAttribute("data-vc-marquee-dist") || 0);
                  if (hasClone && Number.isFinite(stored) && stored >= 120) continue;
                }
                el.classList.remove("is-marquee");
                el.removeAttribute("data-vc-marquee-dist");
                syncOne(el);
              } catch (eOneD) {}
            }
          } catch (eDs) {}
        }
        var drawerMo = new MutationObserver(function () {
          var open = isMobileNavOpen();
          if (open === drawerWasOpen) return;
          drawerWasOpen = open;
          if (!open) return;
          if (drawerSyncTimer) {
            try {
              clearTimeout(drawerSyncTimer);
            } catch (eClr) {}
            drawerSyncTimer = 0;
          }
          drawerSyncTimer = window.setTimeout(function () {
            drawerSyncTimer = 0;
            if (!isMobileNavOpen()) return;
            syncDrawerBrandOnce(true);
          }, 120);
        });
        var drawerEl = document.getElementById("vc-mobile-nav-drawer");
        if (drawerEl) {
          drawerMo.observe(drawerEl, { attributes: true, attributeFilter: ["class"] });
        }
        window.__vcDrawerWmMqMo = drawerMo;
        window.__vcDrawerWmMqSync = syncDrawerBrandOnce;
      }
    } catch (eDmo) {}
    document.addEventListener("vc:langchange", function () {
      window.setTimeout(function () {
        try {
          schedule(document);
        } catch (eL) {}
      }, 48);
    });
    document.addEventListener("vc:themechange", function () {
      window.setTimeout(function () {
        try {
          repaintAllMarqueeMetal();
          schedule(document);
        } catch (eTh) {}
      }, 48);
    });
    /* mqNoSnapSettle1: leave-hover / tab-hidden → reset@0.
       settle FG → soft pause (tiene currentTime, no tx:0). */
    function resetTrackToOrigin(tr) {
      if (!tr || !tr.style) return;
      try {
        tr.removeAttribute("data-vc-mq-hover-run");
      } catch (eAttr0) {}
      try {
        tr.style.setProperty("animation-play-state", "paused", "important");
        tr.style.setProperty("-webkit-animation-play-state", "paused", "important");
        tr.style.setProperty("will-change", "auto", "important");
      } catch (ePs) {}
      try {
        if (tr.__vcMqWaapi) {
          if (typeof tr.__vcMqWaapi.pause === "function") tr.__vcMqWaapi.pause();
          try {
            tr.__vcMqWaapi.currentTime = 0;
          } catch (eCtW) {}
        }
      } catch (eWp) {}
      try {
        var plist = tr.getAnimations ? tr.getAnimations() : [];
        for (var pi = 0; pi < plist.length; pi++) {
          try {
            if (typeof plist[pi].pause === "function") plist[pi].pause();
            if ("currentTime" in plist[pi]) plist[pi].currentTime = 0;
          } catch (eP) {}
        }
      } catch (eGaP) {}
      try {
        tr.style.setProperty("transform", "translate3d(0,0,0)", "important");
      } catch (eTx0) {}
    }
    function softPauseTrackKeepPos(tr) {
      if (!tr || !tr.style) return;
      try {
        tr.style.setProperty("animation-play-state", "paused", "important");
        tr.style.setProperty("-webkit-animation-play-state", "paused", "important");
        tr.style.setProperty("will-change", "auto", "important");
      } catch (ePs) {}
      try {
        if (tr.__vcMqWaapi && typeof tr.__vcMqWaapi.pause === "function") tr.__vcMqWaapi.pause();
      } catch (eWp) {}
      try {
        var plist = tr.getAnimations ? tr.getAnimations() : [];
        for (var pi = 0; pi < plist.length; pi++) {
          try {
            if (typeof plist[pi].pause === "function") plist[pi].pause();
          } catch (eP) {}
        }
      } catch (eGaP) {}
    }
    function trackHostIsHovered(tr) {
      try {
        var host = tr && tr.closest
          ? tr.closest(
              "a.vc-header-site-name.is-marquee, #vc-header-promo-btn, .vc-header-promo-btn",
            )
          : null;
        if (!host) return false;
        if (host.matches(":hover") || host.matches(":focus-visible")) return true;
        if (host.matches(":focus-within")) return true;
      } catch (eHov) {}
      return false;
    }
    function pageIsHardHidden() {
      try {
        return Boolean(document.hidden) || document.visibilityState === "hidden";
      } catch (eH) {
        return false;
      }
    }
    function setBrandTracksIdle(pause) {
      try {
        var hard = pageIsHardHidden();
        var tracks = document.querySelectorAll(
          "header a.vc-header-site-name.is-marquee .vc-header-site-name__track, header .vc-header-promo-btn__track, .vc-mobile-nav-drawer__brand a.vc-header-site-name.is-marquee .vc-header-site-name__track",
        );
        for (var i = 0; i < tracks.length; i++) {
          /* mqHoverNoRestart1: non toccare track sotto hover attivo */
          if (trackHostIsHovered(tracks[i])) continue;
          if (hard) resetTrackToOrigin(tracks[i]);
          else softPauseTrackKeepPos(tracks[i]);
        }
      } catch (eIdle) {}
      void pause;
    }
    function setTrackRunning(tr, on) {
      if (!tr || !tr.style) return;
      if (!on) {
        resetTrackToOrigin(tr);
        return;
      }
      var keepGoing = false;
      try {
        keepGoing = tr.getAttribute("data-vc-mq-hover-run") === "1";
      } catch (eKeep) {}
      if (!keepGoing) {
        try {
          var prev = tr.getAnimations ? tr.getAnimations() : [];
          for (var pj = 0; pj < prev.length; pj++) {
            if (
              prev[pj].playState === "running" &&
              (Number(prev[pj].currentTime) || 0) > 20
            ) {
              keepGoing = true;
              break;
            }
          }
        } catch (ePrev) {}
      }
      try {
        tr.style.removeProperty("transform");
      } catch (eTx) {}
      tr.style.setProperty("animation-play-state", "running", "important");
      tr.style.setProperty("-webkit-animation-play-state", "running", "important");
      tr.style.setProperty("will-change", "transform", "important");
      try {
        tr.setAttribute("data-vc-mq-hover-run", "1");
      } catch (eAttr1) {}
      try {
        if (tr.__vcMqWaapi) {
          if (!keepGoing) {
            try {
              tr.__vcMqWaapi.currentTime = 0;
            } catch (eCt) {}
          }
          if (typeof tr.__vcMqWaapi.play === "function") tr.__vcMqWaapi.play();
        }
      } catch (eWr) {}
      try {
        var list = tr.getAnimations ? tr.getAnimations() : [];
        for (var ai = 0; ai < list.length; ai++) {
          try {
            if (!keepGoing && "currentTime" in list[ai]) list[ai].currentTime = 0;
            if (typeof list[ai].play === "function") list[ai].play();
          } catch (eA) {}
        }
      } catch (eGa) {}
    }
    window.__vcMqSetBrandTrackRunning = setTrackRunning;
    function trackFromHoverTarget(t) {
      try {
        if (!t || !t.closest) return null;
        var brand = t.closest("a.vc-header-site-name.is-marquee");
        if (brand) {
          return brand.querySelector(".vc-header-site-name__track");
        }
        var promo = t.closest("#vc-header-promo-btn, .vc-header-promo-btn");
        if (promo) {
          return promo.querySelector(".vc-header-promo-btn__track");
        }
      } catch (eT) {}
      return null;
    }
    try {
      if (!window.__vcMqHoverNoRestart1) {
        window.__vcMqHoverNoRestart1 = 1;
        document.addEventListener(
          "pointerover",
          function (ev) {
            var tr = trackFromHoverTarget(ev && ev.target);
            if (!tr) return;
            var run = window.__vcMqSetBrandTrackRunning || setTrackRunning;
            run(tr, true);
          },
          true,
        );
        document.addEventListener(
          "pointerout",
          function (ev) {
            var related = ev && ev.relatedTarget;
            var still = related ? trackFromHoverTarget(related) : null;
            var tr = trackFromHoverTarget(ev && ev.target);
            if (tr && still !== tr) {
              var run = window.__vcMqSetBrandTrackRunning || setTrackRunning;
              run(tr, false);
            }
          },
          true,
        );
        document.addEventListener(
          "focusin",
          function (ev) {
            var tr = trackFromHoverTarget(ev && ev.target);
            if (!tr) return;
            var run = window.__vcMqSetBrandTrackRunning || setTrackRunning;
            run(tr, true);
          },
          true,
        );
        document.addEventListener(
          "focusout",
          function (ev) {
            var tr = trackFromHoverTarget(ev && ev.target);
            if (!tr) return;
            var run = window.__vcMqSetBrandTrackRunning || setTrackRunning;
            run(tr, false);
          },
          true,
        );
      }
    } catch (eHover) {}
    function pageIsSettled() {
      try {
        return document.documentElement.classList.contains("vc-cpu-settle");
      } catch (eS) {
        return false;
      }
    }
    function resumeBrandTracksIfActive(force) {
      /* hoverMqSocial1b: bustle NON reset@0 — pointerdown spegneva hover appena partito */
      void force;
      try {
        var hov = document.querySelector(
          "header a.vc-header-site-name.is-marquee:hover," +
            ".vc-mobile-nav-drawer__brand a.vc-header-site-name.is-marquee:hover," +
            "header .vc-header-promo-btn:hover," +
            "#vc-header-promo-btn:hover," +
            "header .vc-header-promo-btn:focus-visible," +
            "#vc-header-promo-btn:focus-visible",
        );
        if (hov) {
          var trH = trackFromHoverTarget(hov);
          if (trH) setTrackRunning(trH, true);
          return;
        }
      } catch (eHov) {}
    }
    document.addEventListener(
      "vc:cpu-settle",
      function () {
        setBrandTracksIdle(true);
      },
      false,
    );
    document.addEventListener(
      "vc:cpu-sleep",
      function () {
        setBrandTracksIdle(true);
      },
      false,
    );
    document.addEventListener(
      "vc:cpu-bustle",
      function () {
        resumeBrandTracksIfActive(false);
      },
      false,
    );
    try {
      if (!window.__vcWmIdleWatch4) {
        window.__vcWmIdleWatch4 = 1;
        document.addEventListener("vc:cpu-settle", function () {
          try {
            setBrandTracksIdle(true);
          } catch (eW) {}
        });
        document.addEventListener("visibilitychange", function () {
          try {
            setBrandTracksIdle(true);
          } catch (eV) {}
        });
        if (typeof MutationObserver === "function") {
          var settleWas = pageIsSettled();
          var settleMo = new MutationObserver(function () {
            var now = pageIsSettled();
            if (now === settleWas) return;
            settleWas = now;
            try {
              /* mqNoSnapSettle1: settle ON → soft idle; settle OFF → resume hover se attivo */
              if (now) setBrandTracksIdle(true);
              else resumeBrandTracksIfActive(false);
            } catch (eSm) {}
          });
          settleMo.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
          });
        }
      }
    } catch (eWatch) {}
    document.addEventListener(
      "vc:cpu-wake",
      function () {
        resumeBrandTracksIfActive(true);
      },
      false,
    );
    try {
      if (typeof MutationObserver === "function" && !window.__vcHeaderWmThemeMo) {
        var themeMo = new MutationObserver(function () {
          repaintAllMarqueeMetal();
        });
        themeMo.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-vc-theme", "class"],
        });
        window.__vcHeaderWmThemeMo = themeMo;
      }
    } catch (eThemeMo) {}
    try {
      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
        document.fonts.ready.then(function () {
          schedule(document);
        });
      }
    } catch (eFonts) {}
    try {
      if (typeof ResizeObserver === "function") {
        var ro = new ResizeObserver(function () {
          try {
            if (document.querySelector("a.vc-header-site-name.is-marquee .vc-header-site-name__text.is-clone")) {
              return;
            }
          } catch (eRoSkip) {}
          schedule(document);
        });
        function observeBars() {
          var bars = document.querySelectorAll(".vc-header-bar > div:first-child, .vc-mobile-nav-drawer__brand, header.fixed, body > header");
          for (var i = 0; i < bars.length; i++) {
            try {
              ro.observe(bars[i]);
            } catch (eObs) {}
          }
        }
        observeBars();
        window.__vcHeaderSiteNameRo = ro;
        window.__vcHeaderSiteNameRoRefresh = observeBars;
      }
    } catch (eRo) {}
    observeBrandHosts();
    try {
      if (typeof MutationObserver === "function") {
        var mo = new MutationObserver(function () {
          /* mqIdleResumeAll1: emoji/subtree thrash non deve schedule→rebuild mid-spin */
          if (brandMarqueeAlreadyRunning()) return;
          schedule(document);
        });
        function observeLinks() {
          var links = collectBrandNameLinks(document);
          for (var li = 0; li < links.length; li += 1) {
            try {
              mo.observe(links[li], { childList: true, subtree: true, characterData: true });
            } catch (eLink) {}
          }
        }
        observeLinks();
        window.__vcHeaderSiteNameMo = mo;
        window.__vcHeaderSiteNameMoRefresh = observeLinks;
      }
    } catch (eMo) {}
    /* wmMqFast1: kick sync subito + retry brevi finché brand/coda ok */
    syncAll(document);
    var bootTry = 0;
    function bootKick() {
      schedule(document);
      bootTry += 1;
      var hasMq = false;
      try {
        hasMq = !!document.querySelector("a.vc-header-site-name.is-marquee");
      } catch (eHas) {}
      if (!hasMq && bootTry < 30) window.setTimeout(bootKick, 40);
    }
    window.setTimeout(bootKick, 0);
    setTimeout(function () {
      schedule(document);
      syncFooterWordmark();
    }, 120);
    setTimeout(function () {
      schedule(document);
      syncFooterWordmark();
    }, 900);
    setTimeout(function () {
      /* post-twemoji: ripulli img fuori da .__metal */
      syncFooterWordmark();
    }, 2800);
    document.addEventListener("vc:langchange", function () {
      syncFooterWordmark();
      schedule(document);
    });
    document.addEventListener("vc:themechange", function () {
      syncFooterWordmark();
      repaintAllMarqueeMetal();
    });
    try {
      if (typeof MutationObserver === "function" && !window.__vcFooterWmMo) {
        var footTimer = 0;
        var footMo = new MutationObserver(function () {
          if (footTimer) return;
          footTimer = window.setTimeout(function () {
            footTimer = 0;
            syncFooterWordmark();
          }, 280);
        });
        function observeFoot() {
          var foots = document.querySelectorAll("footer .vc-premium-footer__wordmark");
          for (var fi = 0; fi < foots.length; fi++) {
            try {
              footMo.observe(foots[fi], { childList: true, subtree: true });
            } catch (eFo) {}
          }
        }
        observeFoot();
        window.__vcFooterWmMo = footMo;
        window.setTimeout(observeFoot, 1200);
      }
    } catch (eFootMo) {}
    try {
      var soft = document.getElementById("vc-soft-fx-css");
      if (soft) {
        soft.addEventListener(
          "load",
          function () {
            schedule(document);
          },
          { once: true },
        );
      }
    } catch (eSoft) {}
  }

  function wireDeferred() {
    /* violKillConsole1: wire fuori dal DCL sync (era Violation ~200ms) */
    window.setTimeout(function () {
      try {
        wire();
      } catch (eW) {}
    }, 0);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireDeferred, { once: true });
  } else {
    wireDeferred();
  }
})();

(function () {
  if (typeof window === "undefined") return;
  if (window.__vcNameMarqueeWired) return;
  window.__vcNameMarqueeWired = true;

  var timer = null;
  var TRACK_CLASS = "vc-marquee__track";
  var TEXT_CLASS = "vc-marquee__text";

  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function collect(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var out = [];
    var seen = typeof WeakSet === "function" ? new WeakSet() : null;
    function isRosterNameMarquee(el) {
      return !!(el && el.closest && el.closest("#vc-home-staff-roster"));
    }

    function add(el) {
      if (!el || !el.classList) return;
      if (isRosterNameMarquee(el)) return;
      if (seen) {
        if (seen.has(el)) return;
        seen.add(el);
      } else if (out.indexOf(el) !== -1) {
        return;
      }
      out.push(el);
    }
    if (root && root.matches && root.matches("[data-vc-marquee]")) add(root);
    var nodes = scope.querySelectorAll("[data-vc-marquee]");
    for (var i = 0; i < nodes.length; i += 1) add(nodes[i]);
    return out;
  }

  function ensureStructure(el) {
    if (!el) return null;
    el.classList.add("vc-marquee");
    var track = el.querySelector("." + TRACK_CLASS);
    if (track) {
      var texts = track.querySelectorAll("." + TEXT_CLASS);
      return { track: track, text: texts[0] || null };
    }
    track = document.createElement("span");
    track.className = TRACK_CLASS;
    var text = document.createElement("span");
    text.className = TEXT_CLASS;
    while (el.firstChild) text.appendChild(el.firstChild);
    track.appendChild(text);
    el.appendChild(track);
    return { track: track, text: text };
  }

  function syncOne(el) {
    if (el && el.closest && el.closest("#vc-home-staff-roster")) return;
    var parts = ensureStructure(el);
    if (!parts || !parts.track || !parts.text) return;
    var trackEl = parts.track;
    var textEl = parts.text;
    var textNodes = trackEl.querySelectorAll("." + TEXT_CLASS);
    var rawText = String(textEl.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

    /* mqNoRestart1: già in marquee con stesso testo → non smontare (resize/RO ripartivano) */
    try {
      if (
        el.classList.contains("is-marquee") &&
        trackEl.querySelector("." + TEXT_CLASS + ".is-clone")
      ) {
        var prevSig = String(el.getAttribute("data-vc-marquee-sig") || "");
        var prevText = prevSig ? prevSig.split("|")[0] : "";
        if (!prevText || prevText === rawText) {
          if (!prevSig && rawText) el.setAttribute("data-vc-marquee-sig", rawText + "|ok");
          return;
        }
      }
    } catch (eStable) {}

    el.classList.remove("is-marquee");
    el.style.removeProperty("--vc-marquee-distance");
    el.style.removeProperty("--vc-marquee-duration");
    el.removeAttribute("data-vc-marquee-sig");
    for (var i = textNodes.length - 1; i >= 1; i -= 1) {
      textNodes[i].parentNode.removeChild(textNodes[i]);
    }
    textEl.style.paddingInlineEnd = "";
    trackEl.style.transform = "";

    /* violKillReflow1: niente getComputedStyle + offsetWidth children (Forced reflow) */
    var containerW = el.clientWidth || 0;
    if (containerW <= 0) {
      try {
        var person = el.closest && el.closest(".vc-home-staff-roster__person");
        if (person) containerW = Math.floor((person.clientWidth || 0) * 0.55) || 0;
      } catch (ePers) {}
    }
    if (containerW <= 0) return;

    /* violKillCue1: data-marquee senza rAF */
    window.setTimeout(function () {
      try {
        if (!el.isConnected) return;
        /* se un altro pass ha già armato, non rifare */
        if (el.classList.contains("is-marquee") && trackEl.querySelector("." + TEXT_CLASS + ".is-clone")) {
          return;
        }
        var textW = Math.ceil(textEl.scrollWidth || 0);
        if (textW <= containerW + 2) return;
        if (prefersReducedMotion()) {
          el.style.textOverflow = "ellipsis";
          return;
        }
        var clone = textEl.cloneNode(true);
        clone.setAttribute("aria-hidden", "true");
        clone.classList.add("is-clone");
        trackEl.appendChild(clone);
        textEl.style.paddingInlineEnd = "1.6rem";
        var segmentW = Math.ceil(textW + 26);
        el.style.setProperty("--vc-marquee-distance", segmentW + "px");
        var duration = Math.max(6, Math.min(12, segmentW / 40));
        el.style.setProperty("--vc-marquee-duration", duration.toFixed(1) + "s");
        el.setAttribute("data-vc-marquee-sig", rawText + "|" + segmentW);
        el.classList.add("is-marquee");
      } catch (eDataMq) {}
    }, 0);
  }

  function syncAll(root) {
    var nodes = collect(root);
    for (var i = 0; i < nodes.length; i += 1) syncOne(nodes[i]);
  }

  function schedule(root) {
    try {
      if (document.hidden || document.visibilityState === "hidden") return;
    } catch (eHid) {}
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      try {
        if (document.hidden || document.visibilityState === "hidden") return;
      } catch (eHid2) {}
      /* violKillIdle1: setTimeout — rIC({timeout}) → Violation idle */
      function run() {
        try {
          syncAll(root);
        } catch (eSync) {}
      }
      window.setTimeout(run, 48); /* violKillRest1 */
    }, 220);
  }

  window.__vcSyncNameMarquees = function (root) {
    schedule(root || document);
  };

  function nodeAddsMarquee(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches && node.matches("[data-vc-marquee]")) return true;
    if (node.querySelector && node.querySelector("[data-vc-marquee]")) return true;
    return false;
  }

  function wire() {
    window.addEventListener("resize", function () {
      schedule(document);
    }, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () {
        schedule(document);
      }, { passive: true });
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      window.setTimeout(function () {
        try {
          schedule(document);
        } catch (eVis2) {}
      }, 120);
    });
    try {
      if (typeof MutationObserver === "function") {
        var mo = new MutationObserver(function (records) {
          for (var i = 0; i < records.length; i += 1) {
            var rec = records[i];
            if (rec.type !== "childList") continue;
            var added = rec.addedNodes || [];
            for (var j = 0; j < added.length; j += 1) {
              if (nodeAddsMarquee(added[j])) {
                schedule(document);
                return;
              }
            }
          }
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
      }
    } catch (eMo) {}
    try {
      if (typeof ResizeObserver === "function") {
        var ro = new ResizeObserver(function () {
          schedule(document);
        });
        var hosts = document.querySelectorAll("[data-vc-marquee]");
        for (var i = 0; i < hosts.length; i += 1) ro.observe(hosts[i]);
        window.__vcNameMarqueeRo = ro;
      }
    } catch (eRo) {}
    setTimeout(function () {
      schedule(document);
    }, 220);
  }

  function wireNameDeferred() {
    window.setTimeout(function () {
      try {
        wire();
      } catch (eWn) {}
    }, 0);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireNameDeferred, { once: true });
  } else {
    wireNameDeferred();
  }
})();
/* handlerPerf1 marker */
/* violPass2 */
/* violKillConsole1 */
/* mqNoRestart1 */
