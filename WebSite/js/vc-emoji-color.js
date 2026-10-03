/**
 * emojiColorFix1: wrap emoji in .vc-emoji so soft-fx text-fill/clip don't flatten them.
 */
(function (global) {
  "use strict";

  var EMOJI_RE =
    /(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|\p{Regional_Indicator}{2})/gu;
  var SKIP =
    "SCRIPT,STYLE,TEXTAREA,INPUT,CODE,PRE,SVG,CANVAS,IFRAME,.fa,.vc-emoji,.vc-lang-flag,[contenteditable='true']";
  var timer = null;
  var busy = false;

  function shouldSkip(el) {
    if (!el || el.nodeType !== 1) return true;
    try {
      if (el.closest && el.closest(SKIP)) return true;
    } catch (_) {}
    return false;
  }

  function hasEmoji(s) {
    if (!s) return false;
    EMOJI_RE.lastIndex = 0;
    return EMOJI_RE.test(s);
  }

  function wrapTextNode(textNode) {
    var raw = textNode.nodeValue;
    if (!hasEmoji(raw)) return;
    EMOJI_RE.lastIndex = 0;
    var frag = document.createDocumentFragment();
    var last = 0;
    var m;
    while ((m = EMOJI_RE.exec(raw))) {
      if (m.index > last) frag.appendChild(document.createTextNode(raw.slice(last, m.index)));
      var span = document.createElement("span");
      span.className = "vc-emoji";
      span.setAttribute("aria-hidden", "true");
      span.textContent = m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < raw.length) frag.appendChild(document.createTextNode(raw.slice(last)));
    if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
  }

  function walk(root) {
    if (!root || busy) return;
    busy = true;
    try {
      var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n || !n.nodeValue || !n.parentElement) return NodeFilter.FILTER_REJECT;
          if (shouldSkip(n.parentElement)) return NodeFilter.FILTER_REJECT;
          return hasEmoji(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      var nodes = [];
      var cur;
      while ((cur = tw.nextNode())) nodes.push(cur);
      for (var i = 0; i < nodes.length; i++) wrapTextNode(nodes[i]);
    } catch (_) {}
    busy = false;
  }

  function schedule(root) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      walk(root || document.body);
    }, 80);
  }

  function boot() {
    if (document.body) walk(document.body);
    try {
      if (window.__vcEmojiColorObs) return;
      var obs = new MutationObserver(function () {
        schedule(document.body);
      });
      obs.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      window.__vcEmojiColorObs = obs;
    } catch (_) {}
  }

  global.VcEmojiColor = {
    wrap: walk,
    schedule: schedule,
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
      return t.replace(EMOJI_RE, '<span class="vc-emoji" aria-hidden="true">$&</span>');
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
