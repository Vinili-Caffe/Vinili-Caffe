/**
 * emojiColorFix1: wrap emoji in .vc-emoji so soft-fx text-fill/clip don't flatten them.
 * violKillEmoji1: chunked idle walk + mutation-scoped roots (no 8s setTimeout on body).
 * copyLegalText1: ©®™ restano testo (no span.vc-emoji / emoji font nel footer).
 * emojiColorFast1: primo pass sync su header/titoli (niente idle) — via tint testo subito.
 * cueEmojiBoot1: wordmark/footer in CRITICAL_SEL + sync budget più alto.
 * persRankEmojiFix1: same critical path (stamp bust).
 * titleBrandMatch1: MAI wrap <title> — aria-hidden span toglie 🎃🍂 da document.title (Win doppione).
 */
(function (global) {
  "use strict";

  var EMOJI_RE =
    /(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|\p{Regional_Indicator}{2})/gu;
  var LEGAL_SYMBOL_RE = /^[\u00A9\u00AE\u2122]$/;
  var SKIP =
    "TITLE,HEAD TITLE,SCRIPT,STYLE,TEXTAREA,INPUT,CODE,PRE,SVG,CANVAS,IFRAME,.fa,.vc-emoji,.vc-lang-flag,[contenteditable='true'],[data-vc-emoji-skip='1'],.vc-footer-copy-link,.vc-premium-footer__legal,footer .vc-footer-copy";
  var STAMP = "20261011inputLagKill1";
  var CRITICAL_SEL =
    "header, .vc-nav-shell, a.vc-header-site-name, .vc-premium-footer__wordmark, footer .vc-premium-footer__brand, .vc-page-cine-hero, .vc-home-cine-hero, #vc-page-intro, .vc-support-page-hero, main h1, main h2, main h3, main h4, .vc-brand-glow, .vc-page-cine-title, .vc-role-card, .vc-roles-grid, .vc-ul-row, .vc-user-profile-name, .discord-profile-link__name, .vc-profile-extras__option-label, .vc-cpf-stage__title";
  var pendingRoots = [];
  var pendingSet = typeof WeakSet !== "undefined" ? new WeakSet() : null;
  var running = false;
  var SLICE_MS = 10;
  var MAX_NODES_PER_SLICE = 80;
  /* cueEmojiBoot1: budget sync più alto per wordmark/nav al primo paint */
  var SYNC_BUDGET_MS = 48;

  function isLegalSymbol(s) {
    return LEGAL_SYMBOL_RE.test(String(s || ""));
  }

  function shouldSkip(el) {
    if (!el || el.nodeType !== 1) return true;
    try {
      var tag = String(el.tagName || "").toUpperCase();
      if (tag === "TITLE" || tag === "HEAD" || tag === "META" || tag === "LINK") return true;
    } catch (_) {}
    try {
      if (el.closest && el.closest(SKIP)) return true;
    } catch (_) {}
    return false;
  }

  /* titleBrandMatch1: ripristina testo piatto nel <title> se già wrappato */
  function unwrapTitleEmojiSpans() {
    try {
      var titleEl = document.querySelector("title");
      if (!titleEl) return;
      titleEl.setAttribute("data-vc-emoji-skip", "1");
      if (!titleEl.querySelector || !titleEl.querySelector("span.vc-emoji, img.vc-emoji, img.vc-twemoji")) {
        return;
      }
      var plain = String(titleEl.textContent || "").replace(/\s+/g, " ").trim();
      if (!plain) return;
      while (titleEl.firstChild) titleEl.removeChild(titleEl.firstChild);
      titleEl.appendChild(document.createTextNode(plain));
      if (String(document.title || "") !== plain) document.title = plain;
    } catch (_) {}
  }

  function hasEmoji(s) {
    if (!s) return false;
    EMOJI_RE.lastIndex = 0;
    var m;
    while ((m = EMOJI_RE.exec(s))) {
      if (!isLegalSymbol(m[0])) return true;
    }
    return false;
  }

  function unwrapLegalEmojiSpans(root) {
    if (!root || !root.querySelectorAll) return;
    try {
      var spans = root.querySelectorAll("span.vc-emoji");
      for (var i = 0; i < spans.length; i++) {
        var span = spans[i];
        if (!span || !span.parentNode) continue;
        var t = String(span.textContent || "").trim();
        if (!isLegalSymbol(t)) continue;
        span.parentNode.replaceChild(document.createTextNode(t), span);
      }
    } catch (_) {}
  }

  function markEmojiHost(fromEl) {
    try {
      var p = fromEl && fromEl.nodeType === 1 ? fromEl : fromEl && fromEl.parentElement;
      var hops = 0;
      while (p && p.nodeType === 1 && hops < 10) {
        hops++;
        var tag = String(p.tagName || "").toUpperCase();
        var hit =
          tag === "H1" ||
          tag === "H2" ||
          tag === "H3" ||
          tag === "H4" ||
          (p.classList &&
            (p.classList.contains("vc-brand-glow") ||
              p.classList.contains("vc-page-cine-title") ||
              p.classList.contains("vc-role-card-name") ||
              p.classList.contains("vc-role-card__name") ||
              p.classList.contains("vc-ul-card__name") ||
              p.classList.contains("vc-user-profile-name") ||
              p.classList.contains("discord-profile-link__name")));
        if (!hit && p.classList) {
          /* qualsiasi *name / *title card tipica */
          try {
            hit = p.matches(
              ".vc-role-card-name, .vc-role-card__name, .vc-ul-card__name, [class*='card-name'], [class*='card__name'], [class*='__title']",
            );
          } catch (_) {}
        }
        if (hit) {
          /* discordRoleLook2: niente ink inline sui nomi Discord (font/colore ruolo) */
          try {
            if (
              (p.hasAttribute && p.getAttribute("data-vc-emoji-skip") === "1") ||
              (p.classList && p.classList.contains("vc-discord-entity"))
            ) {
              return;
            }
          } catch (_) {}
          p.classList.add("vc-has-emoji");
          /* emojiColorFast1: inline batte theme-light main h2 clip (cascade war) */
          try {
            var light = false;
            try {
              light = document.documentElement.getAttribute("data-vc-theme") === "light";
            } catch (_) {}
            var ink = light ? "#2a1c14" : "#f5d6b7";
            p.style.setProperty("background-image", "none", "important");
            p.style.setProperty("background", "none", "important");
            p.style.setProperty("-webkit-background-clip", "border-box", "important");
            p.style.setProperty("background-clip", "border-box", "important");
            p.style.setProperty("color", ink, "important");
            p.style.setProperty("-webkit-text-fill-color", ink, "important");
            p.style.setProperty("filter", "none", "important");
          } catch (_) {}
          return;
        }
        p = p.parentElement;
      }
    } catch (_) {}
  }

  function wrapTextNode(textNode) {
    try {
      var p0 = textNode && textNode.parentElement;
      if (p0 && (String(p0.tagName || "").toUpperCase() === "TITLE" || (p0.closest && p0.closest("title")))) {
        return;
      }
    } catch (_) {}
    var raw = textNode.nodeValue;
    if (!hasEmoji(raw)) return;
    EMOJI_RE.lastIndex = 0;
    var frag = document.createDocumentFragment();
    var last = 0;
    var m;
    var changed = false;
    var parent = textNode.parentNode;
    while ((m = EMOJI_RE.exec(raw))) {
      if (m.index > last) frag.appendChild(document.createTextNode(raw.slice(last, m.index)));
      if (isLegalSymbol(m[0])) {
        frag.appendChild(document.createTextNode(m[0]));
      } else {
        var span = document.createElement("span");
        span.className = "vc-emoji";
        span.setAttribute("aria-hidden", "true");
        span.textContent = m[0];
        frag.appendChild(span);
        changed = true;
      }
      last = m.index + m[0].length;
    }
    if (!changed && last === 0) return;
    if (last < raw.length) frag.appendChild(document.createTextNode(raw.slice(last)));
    if (parent) parent.replaceChild(frag, textNode);
    if (changed && parent && parent.nodeType === 1) markEmojiHost(parent);
  }

  function enqueueRoot(root) {
    if (!root || root.nodeType !== 1) return;
    if (pendingSet) {
      if (pendingSet.has(root)) return;
      pendingSet.add(root);
    } else if (pendingRoots.indexOf(root) >= 0) {
      return;
    }
    pendingRoots.push(root);
  }

  function scheduleNext(fn) {
    try {
      if (typeof window.__vcLight === "function") {
        window.__vcLight(fn, 48);
        return;
      }
    } catch (_) {}
    try {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(
          function () {
            fn();
          },
          { timeout: 400 },
        );
        return;
      }
    } catch (_) {}
    window.setTimeout(fn, 48);
  }

  function nowMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function drainQueue(budgetMs, maxNodes) {
    var t0 = nowMs();
    var n = 0;
    var budget = budgetMs == null ? SLICE_MS : budgetMs;
    var cap = maxNodes == null ? MAX_NODES_PER_SLICE : maxNodes;
    try {
      while (pendingRoots.length && n < cap) {
        var root = pendingRoots.shift();
        if (pendingSet && root) {
          try {
            pendingSet.delete(root);
          } catch (_) {}
        }
        if (!root || !root.isConnected) continue;
        if (shouldSkip(root) && root !== document.body) continue;
        unwrapLegalEmojiSpans(root);

        var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode: function (node) {
            if (!node || !node.nodeValue || !node.parentElement) return NodeFilter.FILTER_REJECT;
            if (shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;
            return hasEmoji(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          },
        });
        var batch = [];
        var cur;
        while ((cur = tw.nextNode())) {
          batch.push(cur);
          n++;
          if (n >= cap || nowMs() - t0 >= budget) break;
        }
        for (var i = 0; i < batch.length; i++) wrapTextNode(batch[i]);
        if (cur) {
          enqueueRoot(root);
          break;
        }
        if (nowMs() - t0 >= budget) break;
      }
    } catch (_) {}
    return pendingRoots.length > 0;
  }

  function processQueue() {
    if (running) return;
    running = true;

    function slice() {
      var more = drainQueue(SLICE_MS, MAX_NODES_PER_SLICE);
      if (more) {
        scheduleNext(slice);
      } else {
        running = false;
      }
    }

    scheduleNext(slice);
  }

  function markExistingEmojiHosts(root) {
    try {
      var scope = root && root.querySelectorAll ? root : document;
      if (!scope.querySelectorAll) scope = document;
      /* prima i host tipici (h2.vc-role-card-name ecc.) — più affidabile del walk dallo span */
      var hosts = scope.querySelectorAll(
        "h1, h2, h3, h4, .vc-brand-glow, .vc-page-cine-title, .vc-role-card-name, .vc-role-card__name, .vc-ul-card__name, .vc-user-profile-name, .discord-profile-link__name",
      );
      var i;
      for (i = 0; i < hosts.length; i++) {
        try {
          if (hosts[i].querySelector("span.vc-emoji, img.vc-emoji, img.vc-twemoji, svg.vc-emoji")) {
            markEmojiHost(hosts[i]);
          }
        } catch (_) {}
      }
      var nodes = scope.querySelectorAll("span.vc-emoji, img.vc-emoji, img.vc-twemoji, svg.vc-emoji");
      for (i = 0; i < nodes.length; i++) markEmojiHost(nodes[i]);
    } catch (_) {}
  }

  function flushCriticalSync() {
    try {
      var nodes = document.querySelectorAll(CRITICAL_SEL);
      for (var i = 0; i < nodes.length; i++) enqueueRoot(nodes[i]);
    } catch (_) {}
    /* emojiColorFast1: wrap sync sopra-la-piega prima dell'idle (niente tint a lungo) */
    var guard = 0;
    while (pendingRoots.length && guard < 12) {
      guard++;
      if (!drainQueue(SYNC_BUDGET_MS, 120)) break;
    }
    markExistingEmojiHosts(document);
  }

  function schedule(root) {
    enqueueRoot(root || document.body);
    processQueue();
  }

  function walk(root) {
    schedule(root || document.body);
  }

  function boot() {
    unwrapTitleEmojiSpans();
    flushCriticalSync();
    unwrapTitleEmojiSpans();
    if (document.body) enqueueRoot(document.body);
    processQueue();
    /* ripassa dopo paint/API (ruoli/classifiche montano titoli tardi) */
    try {
      [0, 200, 600, 1400].forEach(function (ms) {
        setTimeout(function () {
          try {
            unwrapTitleEmojiSpans();
            markExistingEmojiHosts(document);
            flushCriticalSync();
            unwrapTitleEmojiSpans();
          } catch (_) {}
        }, ms);
      });
    } catch (_) {}
    try {
      if (window.__vcEmojiColorObs) return;
      var obs = new MutationObserver(function (records) {
        /* inputLagKill1: mentre digiti non walk/enqueue */
        try {
          if (window.__vcTypingHot) return;
        } catch (eHot) {}
        var i;
        var j;
        var criticalHit = false;
        var titleTouched = false;
        for (i = 0; i < records.length; i++) {
          var rec = records[i];
          var nodes = rec.addedNodes;
          if (!nodes || !nodes.length) continue;
          for (j = 0; j < nodes.length; j++) {
            var node = nodes[j];
            if (!node) continue;
            try {
              if (
                (node.nodeType === 1 && String(node.tagName || "").toUpperCase() === "TITLE") ||
                (node.parentElement && String(node.parentElement.tagName || "").toUpperCase() === "TITLE")
              ) {
                titleTouched = true;
                continue;
              }
            } catch (_) {}
            if (node.nodeType === 1) {
              try {
                var tag = String(node.tagName || "").toUpperCase();
                if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") continue;
                if (node.isContentEditable) continue;
              } catch (eSkip) {}
              enqueueRoot(node);
              try {
                if (
                  node.matches &&
                  node.matches(CRITICAL_SEL + ", .vc-role-card *, .vc-ul-row *, main h2, main h3")
                ) {
                  criticalHit = true;
                }
              } catch (_) {}
            }
          }
        }
        if (titleTouched) unwrapTitleEmojiSpans();
        if (criticalHit) {
          try {
            drainQueue(SYNC_BUDGET_MS, 80);
            markExistingEmojiHosts(document);
          } catch (_) {}
        }
        processQueue();
        try {
          markExistingEmojiHosts(document);
        } catch (_) {}
        if (titleTouched) unwrapTitleEmojiSpans();
      });
      /* inputLagKill1: no characterData — storm su contenteditable/title mentre digiti */
      obs.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: false,
      });
      window.__vcEmojiColorObs = obs;
    } catch (_) {}
  }

  global.VcEmojiColor = {
    wrap: walk,
    schedule: schedule,
    flushCritical: flushCriticalSync,
    unwrapTitle: unwrapTitleEmojiSpans,
    stamp: STAMP,
    escHtml: function (s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    wrapHtml: function (escaped) {
      var t = String(escaped == null ? "" : escaped);
      EMOJI_RE.lastIndex = 0;
      return t.replace(EMOJI_RE, function (m) {
        if (isLegalSymbol(m)) return m;
        return '<span class="vc-emoji" aria-hidden="true">' + m + "</span>";
      });
    },
    unwrapLegal: unwrapLegalEmojiSpans,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
