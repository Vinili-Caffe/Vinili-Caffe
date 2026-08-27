/**
 * Site-wide emoji polish:
 * - Unicode emoji → Twemoji SVG (consistent on Windows)
 * - Soft-sanitize decorative Discord channel chars in plain text nodes
 */
(function () {
  if (window.__vcEmojiRender) return;
  window.__vcEmojiRender = true;

  var TWEMOJI_SRC = "https://cdn.jsdelivr.net/npm/@twemoji/api@15.1.0/dist/twemoji.min.js";
  var TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/";
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
    if (node.closest && node.closest("[contenteditable='true'], [data-vc-emoji-skip='1']")) return true;
    return false;
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

  function parseTwemoji(root) {
    if (!root || !window.twemoji || typeof window.twemoji.parse !== "function") return;
    try {
      window.twemoji.parse(root, {
        base: TWEMOJI_BASE,
        folder: "svg",
        ext: ".svg",
        className: "vc-emoji vc-twemoji",
        attributes: function () {
          return { loading: "lazy", decoding: "async", draggable: "false" };
        },
      });
    } catch (eParse) {}
  }

  function enhance(root) {
    root = root || document.body;
    if (!root) return;
    sanitizeTextNodes(root);
    parseTwemoji(root);
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
    var s = document.createElement("script");
    s.src = TWEMOJI_SRC;
    s.async = true;
    s.onload = function () {
      var q = window.__vcTwemojiLoading || [];
      window.__vcTwemojiLoading = null;
      for (var i = 0; i < q.length; i++) {
        try {
          q[i]();
        } catch (eCb) {}
      }
    };
    s.onerror = function () {
      window.__vcTwemojiLoading = null;
    };
    (document.head || document.documentElement).appendChild(s);
  }

  function boot() {
    loadTwemoji(function () {
      enhance(document.body);
    });
  }

  function observe() {
    if (!window.MutationObserver || !document.body) return;
    var scheduled = false;
    var pending = [];
    function flush() {
      scheduled = false;
      var roots = pending.splice(0, pending.length);
      for (var i = 0; i < roots.length; i++) {
        try {
          enhance(roots[i]);
        } catch (eRoot) {}
      }
    }
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        if (rec.type === "childList") {
          for (var j = 0; j < rec.addedNodes.length; j++) {
            var n = rec.addedNodes[j];
            if (n.nodeType === 1) pending.push(n);
            else if (n.nodeType === 3 && n.parentElement) pending.push(n.parentElement);
          }
        } else if (rec.type === "characterData" && rec.target && rec.target.parentElement) {
          pending.push(rec.target.parentElement);
        }
      }
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(flush);
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
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
      observe();
    });
  } else {
    boot();
    observe();
  }
})();
