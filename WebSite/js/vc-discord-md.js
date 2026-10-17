/**
 * vc-discord-md1 — markdown Discord unica per boards / feedback / staff inbox.
 * Feature: bold/italic/underline/strike/spoiler/code/quote/headers/lists + [t](u) + <url> + bare URL + custom emoji.
 */
(function (global) {
  var VER = "20261006discordMdUnify1";
  if (global.VcDiscordMd && global.VcDiscordMd.ver === VER) return;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cls(prefix, name) {
    return String(prefix || "vc-discord-md") + "__" + name;
  }

  function format(raw, opts) {
    opts = opts || {};
    var inline = opts.inline === true;
    var prefix = opts.classPrefix || "vc-discord-md";
    var emojiClass = opts.emojiClass || "vc-emoji vc-discord-emoji";
    var text = String(raw == null ? "" : raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!String(text).trim()) return "";

    var slots = [];
    function park(html) {
      var i = slots.length;
      slots.push(html);
      return "%%VCMD" + i + "%%";
    }
    function unpark(str) {
      var out = String(str == null ? "" : str);
      var guard = 0;
      while (/%%VCMD\d+%%/.test(out) && guard < 32) {
        guard += 1;
        out = out.replace(/%%VCMD(\d+)%%/g, function (_m, idx) {
          var i = Number(idx);
          return slots[i] != null ? slots[i] : "";
        });
      }
      return out;
    }
    function labelToHtml(label) {
      return String(label || "")
        .split(/(%%VCMD\d+%%)/g)
        .map(function (part) {
          if (!part) return "";
          if (/^%%VCMD\d+%%$/.test(part)) return unpark(part);
          return esc(part);
        })
        .join("");
    }
    function normalizeMdUrl(rawUrl) {
      var u = String(rawUrl || "").trim();
      if (!u) return "";
      u = u.replace(/^<|>$/g, "").trim();
      if (/^https?:\/\//i.test(u)) return u;
      if (/^(discord\.gg\/|discord\.com\/|www\.)/i.test(u)) return "https://" + u.replace(/^\/+/, "");
      return "";
    }
    function parkLink(label, rawUrl) {
      var url = normalizeMdUrl(rawUrl);
      if (!url) return null;
      return park(
        '<a class="' +
          cls(prefix, "link") +
          '" href="' +
          esc(url) +
          '" target="_blank" rel="noopener noreferrer">' +
          labelToHtml(label) +
          "</a>",
      );
    }

    text = text.replace(/<(a?):([\w~-]+):(\d+)>/g, function (_m, animated, name, id) {
      var src =
        "https://cdn.discordapp.com/emojis/" +
        esc(id) +
        ".webp?size=64" +
        (animated === "a" ? "&animated=true" : "&quality=lossless");
      return park(
        '<img class="' +
          emojiClass +
          '" src="' +
          src +
          '" alt=":' +
          esc(name) +
          ':" title=":' +
          esc(name) +
          ':" width="20" height="20" loading="lazy" decoding="async" />',
      );
    });

    if (!inline) {
      text = text.replace(/```(?:[a-z0-9_+-]*)\n?([\s\S]*?)```/gi, function (_m, body) {
        return park(
          '<pre class="' +
            cls(prefix, "pre") +
            '"><code>' +
            esc(String(body || "").replace(/\n$/, "")) +
            "</code></pre>",
        );
      });
    }
    text = text.replace(/(^|[^`])(`+)(?!`)([^\n]*?)\2(?!`)/g, function (_m, pre, _ticks, body) {
      var inner = String(body || "");
      if (_ticks.length >= 2 && /^ /.test(inner) && / $/.test(inner)) {
        inner = inner.slice(1, -1);
      }
      return pre + park("<code>" + esc(inner) + "</code>");
    });
    text = text.replace(/\[([^\]]+)\]\(\s*<?([^)\s>]+)>?\s*\)/g, function (full, label, rawUrl) {
      var parked = parkLink(label, rawUrl);
      return parked == null ? full : parked;
    });
    text = text.replace(/<(https?:\/\/[^>\s]+)>/g, function (_m, url) {
      return park(
        '<a class="' +
          cls(prefix, "link") +
          '" href="' +
          esc(url) +
          '" target="_blank" rel="noopener noreferrer">' +
          esc(url) +
          "</a>",
      );
    });
    text = text.replace(/(^|[\s(>（\[{])(https?:\/\/[^\s<>"'\)\]}>]+)/gi, function (_m, pre, url) {
      var clean = String(url || "").replace(/[),.;:!?]+$/g, "");
      var trail = String(url || "").slice(clean.length);
      if (!clean) return pre + url;
      return (
        pre +
        park(
          '<a class="' +
            cls(prefix, "link") +
            '" href="' +
            esc(clean) +
            '" target="_blank" rel="noopener noreferrer">' +
            esc(clean) +
            "</a>",
        ) +
        trail
      );
    });

    var s = esc(text);

    s = s.replace(/\|\|([\s\S]+?)\|\|/g, function (_m, inner) {
      return (
        '<span class="' +
        cls(prefix, "spoiler") +
        '" tabindex="0" role="button" aria-label="Spoiler">' +
        inner +
        "</span>"
      );
    });

    s = s.replace(/__\*\*\*(.+?)\*\*\*__/g, "<u><strong><em>$1</em></strong></u>");
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    s = s.replace(/__\*\*(.+?)\*\*__/g, "<u><strong>$1</strong></u>");
    s = s.replace(/\*\*__(.+?)__\*\*/g, "<strong><u>$1</u></strong>");
    s = s.replace(/__\*(.+?)\*__/g, "<u><em>$1</em></u>");
    s = s.replace(/\*__(.+?)__\*/g, "<em><u>$1</u></em>");
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__(.+?)__/g, "<u>$1</u>");
    s = s.replace(/~~(.+?)~~/g, "<s>$1</s>");
    s = s.replace(/\*(?!\s)([^*\n]+?)(?!\s)\*/g, "<em>$1</em>");
    s = s.replace(/(^|[\s(>（\[{])_(?!_)([^_\n]+?)_(?=[\s).,!?;:）\]}]|$)/g, "$1<em>$2</em>");

    if (!inline) {
      s = s.replace(/^###### (.+)$/gm, "<h6>$1</h6>");
      s = s.replace(/^##### (.+)$/gm, "<h5>$1</h5>");
      s = s.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
      s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
      s = s.replace(/^## (.+)$/gm, "<h2>$1</h2>");
      s = s.replace(/^# (.+)$/gm, "<h2>$1</h2>");
      s = s.replace(/^&gt;&gt;&gt; ?([\s\S]*)$/m, function (_m, body) {
        return (
          '<blockquote class="' +
          cls(prefix, "quote") +
          '">' +
          String(body || "").replace(/\n/g, "<br>") +
          "</blockquote>"
        );
      });
      s = s.replace(
        /^&gt; (.+)$/gm,
        '<blockquote class="' + cls(prefix, "quote") + '">$1</blockquote>',
      );
      s = s.replace(/^(?:- |\* )(.+)$/gm, "<li>$1</li>");
      s = s.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, function (block) {
        return "<ul>" + block.replace(/\n/g, "") + "</ul>";
      });
      s = s.replace(/\n{2,}/g, "</p><p>");
      s = s.replace(/\n/g, "<br>");
      if (!/^<(?:h[2-6]|ul|pre|blockquote|p)\b/i.test(s)) s = "<p>" + s + "</p>";
      s = s.replace(/<p>\s*<(h[2-6]|ul|pre|blockquote)\b/gi, "<$1");
      s = s.replace(/<\/(h[2-6]|ul|pre|blockquote)>\s*<\/p>/gi, "</$1>");
      s = s.replace(/<p>\s*<\/p>/g, "");
    } else {
      s = s.replace(/\n/g, "<br>");
    }

    return unpark(s);
  }

  function wireOnce() {
    if (global.__vcDiscordMdWired) return;
    global.__vcDiscordMdWired = 1;
    function toggleSpoiler(el) {
      if (!el || !el.classList) return;
      el.classList.toggle("is-open");
    }
    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var spoiler =
          t.closest(".vc-discord-md__spoiler") || t.closest(".vc-boards-md__spoiler");
        if (!spoiler) return;
        toggleSpoiler(spoiler);
      },
      true,
    );
    document.addEventListener(
      "keydown",
      function (ev) {
        if (!ev || (ev.key !== "Enter" && ev.key !== " ")) return;
        var t = ev.target;
        if (!t || !t.classList) return;
        if (
          !t.classList.contains("vc-discord-md__spoiler") &&
          !t.classList.contains("vc-boards-md__spoiler")
        ) {
          return;
        }
        ev.preventDefault();
        toggleSpoiler(t);
      },
      true,
    );
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wireOnce);
    } else {
      wireOnce();
    }
  } catch (eWire) {}

  global.VcDiscordMd = {
    ver: VER,
    format: format,
    esc: esc,
    wire: wireOnce,
  };
})(typeof window !== "undefined" ? window : this);
