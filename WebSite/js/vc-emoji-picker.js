(function (global) {
  "use strict";
  /* emojiAnchorPos1: keep last good anchor rect; re-resolve selector if DOM re-rendered */
  /* pickerFloatFix1: visualViewport + clamp mobile (tastiera / chrome UI) */

  var ROOT_ID = "vc-emoji-picker-root";
  var FLOAT_STAMP = "pickerFloatFix1";
  var PAGE_SIZE = 72;
  var SEARCH_DEBOUNCE_MS = 140;
  var searchTimer = null;
  var UNICODE = [
    "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘",
    "😗", "☺️", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐",
    "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷",
    "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕",
    "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱",
    "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩",
    "🤡", "👹", "👺", "👻", "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿",
    "😾", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉",
    "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏",
    "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴",
    "👀", "👁️", "👅", "👄", "💋", "💘", "💝", "💖", "💗", "💓", "💞", "💕", "💟", "❣️", "💔", "❤️",
    "🧡", "💛", "💚", "💙", "💜", "🤎", "🖤", "🤍", "💯", "✅", "☑️", "✔️", "❌", "❎", "❗", "❓",
    "💬", "💭", "🗯️", "♠️", "♥️", "♦️", "♣️", "🃏", "🎴", "🀄", "🕐", "🔥", "✨", "⭐", "🌟", "💫",
    "⚡", "💥", "💢", "💦", "💨", "🕳️", "💣", "💤", "🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "🥈", "🥉",
    "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🥅", "🏒", "🏑", "🏏", "⛳", "🏹",
    "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛷", "⛸️", "🥌", "🎿", "⛷️", "🏂", "🪂", "🏋️", "🤼", "🤸",
    "☕", "🍵", "🧋", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🧉", "🍾", "🧊", "🥄", "🍴", "🍽️",
    "🍕", "🍔", "🍟", "🌭", "🥪", "🌮", "🌯", "🥙", "🧆", "🥚", "🍳", "🥘", "🍲", "🥣", "🥗", "🍿",
    "🧈", "🧂", "🥫", "🍱", "🍘", "🍙", "🍚", "🍛", "🍜", "🍝", "🍠", "🍢", "🍣", "🍤", "🍥", "🥮",
    "🍡", "🥟", "🥠", "🥡", "🦪", "🍦", "🍧", "🍨", "🍩", "🍪", "🎂", "🍰", "🧁", "🥧", "🍫", "🍬",
    "🍭", "🍮", "🍯", "🍼", "🥛", "🎵", "🎶", "🎼", "🎤", "🎧", "🎷", "🎸", "🎹", "🎺", "🎻", "🥁",
    "🎬", "🎮", "🕹️", "🎲", "🧩", "🧸", "🪅", "🪆", "♠️", "🎯", "🎳", "🎰", "🎨", "🧵", "🪡", "🧶",
    "👓", "🕶️", "🥽", "🥼", "🦺", "👔", "👕", "👖", "🧣", "🧤", "🧥", "🧦", "👗", "👘", "🥻", "🩱",
    "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵",
    "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗",
    "🐴", "🦄", "🐝", "🪱", "🐛", "🦋", "🐌", "🐞", "🐜", "🪰", "🪲", "🪳", "🦟", "🦗", "🕷️", "🕸️",
    "🌸", "💮", "🏵️", "🌹", "🥀", "🌺", "🌻", "🌼", "🌷", "🌱", "🪴", "🌲", "🌳", "🌴", "🌵", "🌾",
    "🌿", "☘️", "🍀", "🍁", "🍂", "🍃", "☀️", "🌝", "🌞", "🪐", "⭐", "🌟", "✨", "⚡", "☄️", "💥",
    "🔥", "🌈", "☁️", "⛅", "⛈️", "🌤️", "🌥️", "🌦️", "🌧️", "🌨️", "🌩️", "🌪️", "🌫️", "🌬️", "🌀", "🌈",
    "🎫", "📩", "✉️", "📧", "📥", "📤", "📨", "💌", "🗳️", "📋", "📝", "🖊️", "✏️", "📌", "📍", "🛠️",
    "🔧", "⚙️", "🧰", "🔑", "🔐", "🔒", "🔓", "🛡️", "⚔️", "🏹", "🎯", "💡", "🔔", "📢", "📣", "🏠",
    "🏡", "🏰", "🏛️", "🗺️", "🧭", "🚀", "✈️", "👑", "💎", "🪄", "🧿", "☕",
  ];

  var pending = null;
  var gridState = { items: [], shown: 0, useCustom: false, token: 0 };
  var docHandlersBound = false;
  var repositionBound = false;
  var scrollTargets = [];

  function listScrollParents(el) {
    var out = [];
    var node = el && el.parentElement;
    while (node && node !== document.documentElement) {
      try {
        var style = window.getComputedStyle(node);
        var oy = style.overflowY || style.overflow || "";
        var ox = style.overflowX || style.overflow || "";
        if (/(auto|scroll|overlay)/.test(oy) || /(auto|scroll|overlay)/.test(ox)) {
          out.push(node);
        }
      } catch (e) {}
      node = node.parentElement;
    }
    out.push(window);
    return out;
  }

  function clearScrollTargets() {
    for (var i = 0; i < scrollTargets.length; i += 1) {
      try {
        scrollTargets[i].removeEventListener("scroll", onViewportChange, true);
      } catch (e2) {}
    }
    scrollTargets = [];
  }

  function bindScrollTargets(anchor) {
    clearScrollTargets();
    scrollTargets = listScrollParents(anchor);
    for (var i = 0; i < scrollTargets.length; i += 1) {
      scrollTargets[i].addEventListener("scroll", onViewportChange, true);
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function customUrl(id, animated, size) {
    var idStr = String(id || "").trim();
    if (!idStr) return "";
    var sz = Number(size) > 0 ? Number(size) : 48;
        if (animated) {
      return "https://cdn.discordapp.com/emojis/" + idStr + ".webp?size=" + sz + "&animated=true";
    }
    return "https://cdn.discordapp.com/emojis/" + idStr + ".webp?size=" + sz;
  }

  function formatCustom(emoji) {
    if (!emoji || !emoji.id) return "";
    return "<" + (emoji.animated ? "a" : "") + ":" + (emoji.name || "emoji") + ":" + emoji.id + ">";
  }

  function isOpenFor(anchor) {
    if (!pending) return false;
    if (anchor == null || anchor === undefined) return true;
    return pending.anchor === anchor;
  }

  function ensureRoot() {
    var existing = document.getElementById(ROOT_ID);
    if (existing) return existing;
    var root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "vc-emoji-picker";
    root.setAttribute("hidden", "");
    root.innerHTML =
      '<div class="vc-emoji-picker__panel" role="dialog" aria-label="Scegli emoji">' +
      '<div class="vc-emoji-picker__tabs" data-vc-ep-tabs>' +
      '<button type="button" class="vc-emoji-picker__tab is-active" data-vc-ep-tab="unicode">Emoji</button>' +
      '<button type="button" class="vc-emoji-picker__tab" data-vc-ep-tab="custom">Server</button>' +
      "</div>" +
      '<div class="vc-emoji-picker__search-row">' +
      '<input type="search" class="vc-emoji-picker__search" id="vc-ep-search" placeholder="Cerca…" autocomplete="off" />' +
      "</div>" +
      '<div class="vc-emoji-picker__grid" id="vc-ep-grid" role="listbox"></div>' +
      '<div class="vc-emoji-picker__empty" id="vc-ep-empty" hidden>Nessuna emoji</div>' +
      "</div>";
    document.body.appendChild(root);

    root.addEventListener("click", function (ev) {
      var tab = ev.target && ev.target.closest ? ev.target.closest("[data-vc-ep-tab]") : null;
      if (tab && pending) {
        setTab(tab.getAttribute("data-vc-ep-tab") === "custom");
        return;
      }
      var opt = ev.target && ev.target.closest ? ev.target.closest("[data-vc-ep-pick]") : null;
      if (!opt || !pending) return;
      var kind = opt.getAttribute("data-vc-ep-kind") || "unicode";
      var value = opt.getAttribute("data-vc-ep-pick") || "";
      var pick =
        kind === "custom"
          ? {
              type: "custom",
              markup: value,
              text: value,
              id: opt.getAttribute("data-vc-ep-id") || "",
              name: opt.getAttribute("data-vc-ep-name") || "",
              animated: opt.getAttribute("data-vc-ep-animated") === "1",
              url: opt.getAttribute("data-vc-ep-url") || "",
            }
          : { type: "unicode", markup: value, text: value };
      var cb = pending.onPick;
      closePicker();
      if (typeof cb === "function") cb(pick);
    });

    var search = root.querySelector("#vc-ep-search");
    if (search) {
      search.addEventListener("input", function () {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          searchTimer = null;
          renderGrid();
        }, SEARCH_DEBOUNCE_MS);
      });
    }

    var grid = root.querySelector("#vc-ep-grid");
    if (grid) {
      grid.addEventListener("scroll", function () {
        if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 48) {
          appendGridPage();
        }
      });
      grid.addEventListener(
        "error",
        function (ev) {
          var img = ev.target;
          if (!img || String(img.tagName || "").toUpperCase() !== "IMG") return;
          var id = String(img.getAttribute("data-vc-emoji-id") || "").trim();
          var animated = img.getAttribute("data-vc-emoji-animated") === "1";
          var step = Number(img.dataset.vcEmojiFallback || "0") || 0;
          if (!id) {
            var btn0 = img.closest ? img.closest(".vc-emoji-picker__opt") : null;
            if (btn0) btn0.classList.add("is-broken");
            return;
          }
          var next = "";
          if (step < 1 && animated) {
            next = customUrl(id, false, 48);
          } else if (step < 2) {
            next = "https://cdn.discordapp.com/emojis/" + id + ".png?size=48";
          } else if (step < 3) {
            next = "https://cdn.discordapp.com/emojis/" + id + ".gif?size=48";
          } else {
            var btn = img.closest ? img.closest(".vc-emoji-picker__opt") : null;
            if (btn) btn.classList.add("is-broken");
            return;
          }
          img.dataset.vcEmojiFallback = String(step + 1);
          img.src = next;
        },
        true,
      );
    }
    return root;
  }

  function resolveAnchor() {
    if (!pending) return null;
    if (pending.anchorSelector) {
      try {
        var live = document.querySelector(pending.anchorSelector);
        if (live) pending.anchor = live;
      } catch (eSel) {}
    }
    if (pending.anchor && document.body.contains(pending.anchor)) return pending.anchor;
    return null;
  }

  function readAnchorRect(anchor, fallback) {
    var connected = false;
    try {
      connected = Boolean(anchor && (anchor.isConnected === true || document.body.contains(anchor)));
    } catch (eConn) {
      connected = false;
    }
    if (connected && anchor.getBoundingClientRect) {
      try {
        var r = anchor.getBoundingClientRect();
        if (r && (r.width > 1 || r.height > 1)) {
          return {
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            right: r.right,
            bottom: r.bottom,
          };
        }
      } catch (eRect) {}
    }
    if (fallback && (fallback.width > 1 || fallback.height > 1)) return fallback;
    return null;
  }

  function onViewportChange() {
    if (!pending) return;
    var anchor = resolveAnchor();
    var rect = readAnchorRect(anchor, pending.anchorRect);
    if (!rect) {
      closePicker();
      return;
    }
    pending.anchorRect = rect;
    if (
      rect.bottom < 8 ||
      rect.top > window.innerHeight - 8 ||
      rect.right < 8 ||
      rect.left > window.innerWidth - 8
    ) {
      closePicker();
      return;
    }
    positionNear(anchor || pending.anchor);
  }

  function bindReposition(anchor) {
    if (!repositionBound) {
      repositionBound = true;
      window.addEventListener("resize", onViewportChange, true);
      try {
        if (window.visualViewport) {
          window.visualViewport.addEventListener("resize", onViewportChange, true);
          window.visualViewport.addEventListener("scroll", onViewportChange, true);
        }
      } catch (eVv) {}
    }
    bindScrollTargets(anchor || (pending && pending.anchor));
  }

  function unbindReposition() {
    if (repositionBound) {
      repositionBound = false;
      window.removeEventListener("resize", onViewportChange, true);
      try {
        if (window.visualViewport) {
          window.visualViewport.removeEventListener("resize", onViewportChange, true);
          window.visualViewport.removeEventListener("scroll", onViewportChange, true);
        }
      } catch (eVv2) {}
    }
    clearScrollTargets();
  }

  function bindDocHandlers() {
    if (docHandlersBound) return;
    docHandlersBound = true;
    document.addEventListener(
      "mousedown",
      function (ev) {
        var root = document.getElementById(ROOT_ID);
        if (!root || root.hasAttribute("hidden") || !pending) return;
        var panel = root.querySelector(".vc-emoji-picker__panel");
        if (panel && panel.contains(ev.target)) return;
        if (pending.anchor && pending.anchor.contains && pending.anchor.contains(ev.target)) return;
        closePicker();
      },
      true,
    );
    document.addEventListener(
      "keydown",
      function (ev) {
        if (ev.key === "Escape" && pending) {
          ev.preventDefault();
          closePicker();
        }
      },
      true,
    );
  }

  function setTab(useCustom) {
    if (!pending) return;
    pending.useCustom = pending.unicodeOnly ? false : Boolean(useCustom);
    var root = ensureRoot();
    root.querySelectorAll("[data-vc-ep-tab]").forEach(function (btn) {
      var isCustom = btn.getAttribute("data-vc-ep-tab") === "custom";
      btn.classList.toggle("is-active", isCustom === pending.useCustom);
    });
    var search = root.querySelector("#vc-ep-search");
    if (search) search.value = "";
    renderGrid();
    requestAnimationFrame(function () {
      if (pending && pending.anchor) positionNear(pending.anchor);
    });
  }

  function filteredUnicode(q) {
    if (!q) return UNICODE.slice();
    return UNICODE.filter(function (e) {
      return String(e).indexOf(q) >= 0;
    });
  }

  function filteredCustom(q) {
    var list = Array.isArray(pending && pending.guildEmojis) ? pending.guildEmojis : [];
    if (!q) return list.slice();
    return list.filter(function (e) {
      return String(e && e.name ? e.name : "")
        .toLowerCase()
        .indexOf(q) >= 0;
    });
  }

  function renderGrid() {
    var root = ensureRoot();
    var grid = root.querySelector("#vc-ep-grid");
    var empty = root.querySelector("#vc-ep-empty");
    var search = root.querySelector("#vc-ep-search");
    if (!grid) return;
    var q = String(search && search.value ? search.value : "")
      .trim()
      .toLowerCase();
    gridState.token += 1;
    gridState.shown = 0;
    gridState.useCustom = Boolean(pending && pending.useCustom);
    grid.innerHTML = "";

    if (gridState.useCustom) {
      var items = filteredCustom(q);
      gridState.items = items;
      if (!items.length) {
        if (empty) {
          empty.hidden = false;
          empty.textContent =
            pending && pending.guildEmojis && pending.guildEmojis.length
              ? "Nessuna emoji trovata"
              : "Nessuna emoji del server";
        }
        return;
      }
      if (empty) empty.hidden = true;
      appendGridPage(true);
      return;
    }

    var uni = filteredUnicode(q);
    gridState.items = uni;
    if (!uni.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = "Nessuna emoji trovata";
      }
      return;
    }
    if (empty) empty.hidden = true;
    appendGridPage(true);
  }

  function appendGridPage(eagerFirst) {
    var root = ensureRoot();
    var grid = root.querySelector("#vc-ep-grid");
    if (!grid) return;
    var items = gridState.items || [];
    var start = gridState.shown || 0;
    if (start >= items.length) return;
    var end = Math.min(items.length, start + PAGE_SIZE);
    var html = "";
    if (gridState.useCustom) {
      for (var i = start; i < end; i += 1) {
        var e = items[i] || {};
        var id = String(e.id || "").trim();
        if (!id) continue;
        var name = String(e.name || "emoji");
        var animated = Boolean(e.animated);
        var markup = formatCustom({ id: id, name: name, animated: animated });
        var preview = customUrl(id, animated, 48);
        var fullUrl = customUrl(id, animated, 48);
        var loading = eagerFirst && i < start + 24 ? "eager" : "lazy";
        html +=
          '<button type="button" class="vc-emoji-picker__opt vc-emoji-picker__opt--custom" role="option" data-vc-ep-kind="custom" data-vc-ep-pick="' +
          esc(markup) +
          '" data-vc-ep-id="' +
          esc(id) +
          '" data-vc-ep-name="' +
          esc(name) +
          '" data-vc-ep-animated="' +
          (animated ? "1" : "0") +
          '" data-vc-ep-url="' +
          esc(fullUrl) +
          '" title=":' +
          esc(name) +
          ':"><img src="' +
          esc(preview) +
          '" alt=":' +
          esc(name) +
          ':" width="22" height="22" data-vc-avatar="0" data-vc-emoji-id="' +
          esc(id) +
          '" data-vc-emoji-animated="' +
          (animated ? "1" : "0") +
          '" loading="' +
          loading +
          '" decoding="async" /></button>';
      }
    } else {
      for (var u = start; u < end; u += 1) {
        var ch = items[u];
        if (!ch) continue;
        html +=
          '<button type="button" class="vc-emoji-picker__opt" role="option" data-vc-ep-kind="unicode" data-vc-ep-pick="' +
          esc(ch) +
          '" title="' +
          esc(ch) +
          '">' +
          esc(ch) +
          "</button>";
      }
    }
    grid.insertAdjacentHTML("beforeend", html);
    gridState.shown = end;
  }

  function appendCustomPage(eagerFirst) {
    appendGridPage(eagerFirst);
  }

  function readViewportBox() {
    try {
      var vv = window.visualViewport;
      if (vv && typeof vv.height === "number" && vv.height > 0) {
        return {
          top: Number(vv.offsetTop) || 0,
          left: Number(vv.offsetLeft) || 0,
          width: Number(vv.width) || window.innerWidth || 0,
          height: Number(vv.height) || window.innerHeight || 0,
        };
      }
    } catch (eVvBox) {}
    return {
      top: 0,
      left: 0,
      width: window.innerWidth || 0,
      height: window.innerHeight || 0,
    };
  }

  function positionNear(anchor) {
    var root = ensureRoot();
    var panel = root.querySelector(".vc-emoji-picker__panel");
    if (!panel) return;
    if (root.parentElement !== document.body) {
      try {
        document.body.appendChild(root);
      } catch (eBody) {}
    }
    var live = resolveAnchor() || anchor || (pending && pending.anchor) || null;
    var rect = readAnchorRect(live, pending && pending.anchorRect);
    var vp = readViewportBox();
    if (!rect) {
      var cw = 40;
      var ch = 40;
      rect = {
        left: Math.max(vp.left, vp.left + vp.width / 2 - cw / 2),
        top: Math.max(vp.top, vp.top + vp.height / 2 - ch / 2),
        width: cw,
        height: ch,
        right: 0,
        bottom: 0,
      };
      rect.right = rect.left + rect.width;
      rect.bottom = rect.top + rect.height;
    }
    if (pending) pending.anchorRect = rect;
    var pad = 8;
    var gap = 8;
    var visibleTop = vp.top + pad;
    var visibleBottom = vp.top + vp.height - pad;
    var visibleLeft = vp.left + pad;
    var visibleRight = vp.left + vp.width - pad;
    var w = Math.min(340, Math.max(200, vp.width - pad * 2));
    var spaceAbove = Math.max(0, rect.top - visibleTop - gap);
    var spaceBelow = Math.max(0, visibleBottom - rect.bottom - gap);
    var preferAbove = !pending || pending.preferAbove !== false;
    var placeAbove = preferAbove
      ? spaceAbove >= 140 || spaceAbove >= spaceBelow
      : spaceBelow >= 140 || spaceBelow > spaceAbove;
    var maxH = Math.min(320, Math.max(140, placeAbove ? spaceAbove : spaceBelow));
    if (maxH < 140) maxH = Math.min(320, Math.max(140, Math.max(spaceAbove, spaceBelow)));
    panel.style.position = "fixed";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.width = w + "px";
    panel.style.maxHeight = maxH + "px";
    panel.setAttribute("data-vc-ep-float", FLOAT_STAMP);
    void panel.offsetHeight;
    var h = Math.min(Math.max(panel.offsetHeight || 200, 140), maxH);
    var left = Math.min(
      Math.max(visibleLeft, rect.left + rect.width / 2 - w / 2),
      visibleRight - w,
    );
    var top;
    if (placeAbove) {
      top = rect.top - h - gap;
      if (top < visibleTop) {
        if (spaceBelow > spaceAbove) {
          placeAbove = false;
          top = rect.bottom + gap;
          maxH = Math.min(320, Math.max(140, spaceBelow));
          panel.style.maxHeight = maxH + "px";
          h = Math.min(h, maxH);
        } else {
          top = visibleTop;
        }
      }
    } else {
      top = rect.bottom + gap;
      if (top + h > visibleBottom) {
        if (spaceAbove > spaceBelow) {
          top = Math.max(visibleTop, rect.top - h - gap);
        } else {
          top = Math.max(visibleTop, visibleBottom - h);
        }
      }
    }
    panel.style.left = Math.round(left) + "px";
    panel.style.top = Math.round(Math.max(visibleTop, Math.min(top, visibleBottom - h))) + "px";
    panel.style.zIndex = "121200";
  }

  function openPicker(opts) {
    opts = opts || {};
    bindDocHandlers();
    var unicodeOnly = opts.unicodeOnly === true;
    var anchor = opts.anchor || null;
    var anchorSelector = opts.anchorSelector ? String(opts.anchorSelector) : "";
    var anchorRect = readAnchorRect(anchor, opts.anchorRect || null);
    pending = {
      anchor: anchor,
      anchorSelector: anchorSelector,
      anchorRect: anchorRect,
      guildEmojis: unicodeOnly ? [] : Array.isArray(opts.guildEmojis) ? opts.guildEmojis : [],
      useCustom: unicodeOnly ? false : opts.preferCustom === true,
      unicodeOnly: unicodeOnly,
      preferAbove: opts.preferAbove !== false,
      onPick: typeof opts.onPick === "function" ? opts.onPick : null,
    };
    resolveAnchor();
    bindReposition(pending.anchor);
    var root = ensureRoot();
    root.removeAttribute("hidden");
    root.classList.add("is-open");
    root.classList.toggle("is-unicode-only", unicodeOnly);
    var tabs = root.querySelector("[data-vc-ep-tabs]");
    if (tabs) tabs.hidden = unicodeOnly;
    var customTab = root.querySelector('[data-vc-ep-tab="custom"]');
    if (customTab) customTab.hidden = unicodeOnly;
    /* sync position before paint — avoid top-left flash / stale detached anchors */
    positionNear(pending.anchor);
    setTab(pending.useCustom);
    requestAnimationFrame(function () {
      if (!pending) return;
      positionNear(pending.anchor);
      requestAnimationFrame(function () {
        if (!pending) return;
        positionNear(pending.anchor);
      });
      var restore = opts.focusTarget || null;
      if (restore && typeof restore.focus === "function") {
        try {
          restore.focus({ preventScroll: true });
        } catch (eFocus) {
          try {
            restore.focus();
          } catch (eFocus2) {}
        }
      }
    });
  }

  function closePicker() {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    pending = null;
    unbindReposition();
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.classList.remove("is-open");
    root.classList.remove("is-unicode-only");
    root.setAttribute("hidden", "");
  }

  function togglePicker(opts) {
    opts = opts || {};
    if (isOpenFor(opts.anchor || null)) {
      closePicker();
      return false;
    }
    openPicker(opts);
    return true;
  }

  global.VcEmojiPicker = {
    open: openPicker,
    close: closePicker,
    toggle: togglePicker,
    isOpen: isOpenFor,
    formatCustom: formatCustom,
    customUrl: customUrl,
    UNICODE: UNICODE,
  };
})(typeof window !== "undefined" ? window : globalThis);
