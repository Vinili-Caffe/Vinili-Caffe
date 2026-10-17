/**
 * ticketsComposerLazy1: composer/interact chunk (guild emoji, rich input, menus, picker, wireComposer).
 * Loaded by web-tickets-page.js after list/openTicket — public list first paint unchanged.
 */
(function () {
  var VER = "20261015ticketsMsgRailCpu1";
  if (window.__VC_WT_COMPOSER_CHUNK === VER) return;
  var H = window.__VC_WT_COMPOSER_HOST;
  if (!H || typeof H !== "object") {
    try { console.warn("[vc] wt-composer host missing"); } catch (e0) {}
    return;
  }
  window.__VC_WT_COMPOSER_CHUNK = VER;
  var state = H.state;
  var addComposerMediaFiles = H.addComposerMediaFiles;
  var apiActionFailed = H.apiActionFailed;
  var apiBase = H.apiBase;
  var apiErrorText = H.apiErrorText;
  var appendMessage = H.appendMessage;
  var authHeaders = H.authHeaders;
  var avatarHtml = H.avatarHtml;
  var byId = H.byId;
  var capturePageScrollY = H.capturePageScrollY;
  var chatHeadHtml = H.chatHeadHtml;
  var clearReplyTarget = H.clearReplyTarget;
  var composerHtml = H.composerHtml;
  var composerLockedReason = H.composerLockedReason;
  var dismissFloatingUi = H.dismissFloatingUi;
  var effectivePermissions = H.effectivePermissions;
  var esc = H.esc;
  var fetchJson = H.fetchJson;
  var getToken = H.getToken;
  var jumpToMessage = H.jumpToMessage;
  var mergeTicketDetail = H.mergeTicketDetail;
  var messageHtml = H.messageHtml;
  var pulseTicketTyping = H.pulseTicketTyping;
  var queueContentResolve = H.queueContentResolve;
  var ratingDockHtml = H.ratingDockHtml;
  var readComposerContext = H.readComposerContext;
  var refreshChatLogMarkup = H.refreshChatLogMarkup;
  var refreshChatPane = H.refreshChatPane;
  var refreshListPane = H.refreshListPane;
  var refreshTicketInList = H.refreshTicketInList;
  var rememberMentionName = H.rememberMentionName;
  var rememberStaffRole = H.rememberStaffRole;
  var renderPreviews = H.renderPreviews;
  var renderShell = H.renderShell;
  var resolveMentionName = H.resolveMentionName;
  var restorePageScroll = H.restorePageScroll;
  var runPartnershipCommandFlow = H.runPartnershipCommandFlow;
  var saveTicketComposerDraft = H.saveTicketComposerDraft;
  var scheduleComposerLivePreview = H.scheduleComposerLivePreview;
  var scheduleComposerSuggest = H.scheduleComposerSuggest;
  var scheduleSaveTicketComposerDraft = H.scheduleSaveTicketComposerDraft;
  var scrollChatBottom = H.scrollChatBottom;
  var sendMessage = H.sendMessage;
  var setStatus = H.setStatus;
  var startReplyToMessage = H.startReplyToMessage;
  var stillDiscordMediaUrl = H.stillDiscordMediaUrl;
  var syncComposerAutosize = H.syncComposerAutosize;
  var syncComposerReplyBar = H.syncComposerReplyBar;
  var wakeTicketAvatars = H.wakeTicketAvatars;
  var wireChatActions = H.wireChatActions;
  var wireEmojiImgFallback = H.wireEmojiImgFallback;
  var withPageScrollPreserved = H.withPageScrollPreserved;
  var ensureTicketsEmojiMaps = H.ensureTicketsEmojiMaps;

  function ensureGuildEmojis() {
    if (state.guildEmojisLoaded) return Promise.resolve(state.guildEmojis);
    if (state.guildEmojisLoading) {
      return new Promise(function (resolve) {
        var n = 0;
        var t = setInterval(function () {
          n += 1;
          if (state.guildEmojisLoaded || n > 40) {
            clearInterval(t);
            resolve(state.guildEmojis);
          }
        }, 100);
      });
    }
    state.guildEmojisLoading = true;
    return fetchJson(apiBase() + "/emojis", { headers: authHeaders(false) })
      .then(function (out) {
        state.guildEmojisLoading = false;
        state.guildEmojisLoaded = true;
        state.guildEmojis =
          out.data && out.data.ok && Array.isArray(out.data.emojis) ? out.data.emojis : [];
        if (out.data && out.data.guildId) state.guildId = String(out.data.guildId);
        refreshEmojiDependentUi();
        return state.guildEmojis;
      })
      .catch(function () {
        state.guildEmojisLoading = false;
        state.guildEmojisLoaded = true;
        state.guildEmojis = [];
        return state.guildEmojis;
      });
  }

  function refreshEmojiDependentUi() {
    refreshListPane();
    if (state.messages && state.messages.length && byId("vc-wt-chat-log")) {
      refreshChatLogMarkup();
    }
  }

  function isRichInput(el) {
    return Boolean(el && el.isContentEditable);
  }

  function customEmojiUrl(id, animated, size) {
    var sz = size || 32;
    /* ticketsCpuHard3: ignore animated flag */
    if (window.VcEmojiPicker && typeof window.VcEmojiPicker.customUrl === "function") {
      return window.VcEmojiPicker.customUrl(id, false, sz);
    }
    return "https://cdn.discordapp.com/emojis/" + id + ".webp?size=" + sz;
  }

  function freezeTicketsAnimatedMedia(root) {
    try {
      var imgs;
      if (root && root.tagName === "IMG") {
        imgs = [root];
      } else {
        var scope = root && root.querySelectorAll ? root : document;
        imgs = scope.querySelectorAll("img");
      }
      for (var i = 0; i < imgs.length; i += 1) {
        var img = imgs[i];
        if (!img || img.getAttribute("data-vc-tickets-still") === "1") continue;
        var src = String(img.getAttribute("src") || img.currentSrc || "").trim();
        if (!src) continue;
        if (!/cdn\.discordapp\.com|media\.discordapp\.net/i.test(src)) continue;
        if (!/\.gif(?:$|[?#])/i.test(src) && !/[?&]animated=true/i.test(src)) {
          img.setAttribute("data-vc-tickets-still", "1");
          continue;
        }
        var next = stillDiscordMediaUrl(src, 0);
        if (next && next !== src) {
          img.setAttribute("data-vc-avatar-static", "1");
          img.setAttribute("src", next);
          try {
            img.src = next;
          } catch (eSrc) {}
        }
        img.setAttribute("data-vc-tickets-still", "1");
      }
    } catch (eFreeze) {}
  }

  function makeEmojiTokenEl(markup, name, id, animated) {
    var img = document.createElement("img");
    img.className = "vc-wt-inline-emoji vc-wt-composer__emoji-token";
    img.src = customEmojiUrl(id, animated, 32);
    img.alt = ":" + (name || "emoji") + ":";
    img.title = ":" + (name || "emoji") + ":";
    img.draggable = false;
    img.setAttribute("data-emoji-markup", String(markup || ""));
    img.setAttribute("data-vc-emoji-id", String(id || ""));
    img.setAttribute("data-vc-emoji-animated", animated ? "1" : "0");
    return img;
  }

  function makeMentionTokenEl(item) {
    var span = document.createElement("span");
    var type =
      item && item.type === "channel" ? "channel" : item && item.type === "role" ? "role" : "user";
    span.className = "vc-wt-mention vc-wt-mention--" + type;
    span.contentEditable = "false";
    span.setAttribute("data-mention-markup", String((item && item.markup) || ""));
    span.setAttribute("data-mention-type", type);
    span.setAttribute("data-mention-id", String((item && item.id) || ""));
    var label =
      type === "channel"
        ? "#" + String((item && item.name) || "canale")
        : "@" + String((item && item.name) || (type === "role" ? "ruolo" : "utente"));
    if (type === "user" && item && item.roleName) {
      label += " · " + String(item.roleName);
      span.classList.add("is-staff");
      rememberStaffRole(item.id, item.roleId, item.roleName, item.roleKey);
    }
    span.textContent = label;
    rememberMentionName(type, item && item.id, item && item.name);
    return span;
  }

  function serializeRichRoot(root) {
    if (!root) return "";
    var out = "";
    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        out += String(node.nodeValue || "");
        return;
      }
      if (node.nodeType !== 1) return;
      var mention = node.getAttribute && node.getAttribute("data-mention-markup");
      if (mention) {
        out += mention;
        return;
      }
      var markup = node.getAttribute && node.getAttribute("data-emoji-markup");
      if (markup) {
        out += markup;
        return;
      }
      var tag = String(node.tagName || "").toUpperCase();
      if (tag === "BR") {
        out += "\n";
        return;
      }
      var kids = node.childNodes;
      for (var i = 0; i < kids.length; i += 1) walk(kids[i]);
      if ((tag === "DIV" || tag === "P") && node !== root) out += "\n";
    }
    walk(root);
    return out.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "").slice(0, 2000);
  }

  function getRichCaretSerializeOffset(el) {
    if (!el || !isRichInput(el)) return -1;
    try {
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount) return -1;
      var node = sel.focusNode;
      var off = sel.focusOffset;
      if (!node || (node !== el && !el.contains(node))) return -1;
      var range = document.createRange();
      range.selectNodeContents(el);
      range.setEnd(node, off);
      var wrap = document.createElement("div");
      wrap.appendChild(range.cloneContents());
      return serializeRichRoot(wrap).length;
    } catch (eOff) {
      return -1;
    }
  }

  function setRichCaretSerializeOffset(el, offset) {
    if (!el || !isRichInput(el)) return;
    var target = Math.max(0, Number(offset) || 0);
    try {
      var range = document.createRange();
      var placed = false;
      var seen = 0;
      function visit(n) {
        if (placed || !n) return;
        if (n.nodeType === 3) {
          var tlen = String(n.nodeValue || "").length;
          if (seen + tlen >= target) {
            var at = Math.max(0, Math.min(tlen, target - seen));
            range.setStart(n, at);
            range.collapse(true);
            placed = true;
            return;
          }
          seen += tlen;
          return;
        }
        if (n.nodeType !== 1) return;
        var mention = n.getAttribute && n.getAttribute("data-mention-markup");
        var emoji = n.getAttribute && n.getAttribute("data-emoji-markup");
        var tag = String(n.tagName || "").toUpperCase();
        if (mention || emoji || tag === "BR") {
          var tok = mention ? String(mention) : emoji ? String(emoji) : "\n";
          var tokLen = tok.length;
          if (seen + tokLen >= target) {
            try {
              range.setStartAfter(n);
              range.collapse(true);
              placed = true;
            } catch (eAfter) {
              seen += tokLen;
            }
            return;
          }
          seen += tokLen;
          return;
        }
        var kids = n.childNodes;
        for (var i = 0; i < kids.length && !placed; i += 1) visit(kids[i]);
        if (!placed && (tag === "DIV" || tag === "P") && n !== el) seen += 1;
      }
      visit(el);
      if (!placed) {
        range.selectNodeContents(el);
        range.collapse(false);
      }
      var sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (eSet) {}
  }

  function unwrapComposerAutolinks(el) {
    /* composerMdCaret1: Chrome/Safari auto-<a> dopo URL/markdown completo → caret rotto */
    if (!el || !isRichInput(el) || !el.querySelector) return false;
    var links = el.querySelectorAll("a");
    if (!links.length) return false;
    var caret = getRichCaretSerializeOffset(el);
    for (var i = links.length - 1; i >= 0; i -= 1) {
      var a = links[i];
      if (!a || !a.parentNode) continue;
      if (a.getAttribute && (a.getAttribute("data-mention-markup") || a.getAttribute("data-emoji-markup"))) {
        continue;
      }
      var text = document.createTextNode(String(a.textContent || ""));
      a.parentNode.replaceChild(text, a);
    }
    if (caret >= 0) setRichCaretSerializeOffset(el, caret);
    return true;
  }

  function applyRichInputPlaintextMode(el) {
    /* composerMentionShow1: contenteditable=true — plaintext-only flattenava i chip
       menzione/emoji in testo grezzo <@id>. Autolink → unwrapComposerAutolinks. */
    if (!el || !el.setAttribute) return;
    try {
      el.setAttribute("contenteditable", "true");
    } catch (ePl) {}
  }

  function serializeRichInput(el) {
    if (!el) return "";
    if (!isRichInput(el)) return String(el.value || "");
    return serializeRichRoot(el);
  }

  function fillRichInput(el, text) {
    if (!el) return;
    if (!isRichInput(el)) {
      el.value = String(text || "");
      return;
    }
    applyRichInputPlaintextMode(el);
    el.innerHTML = "";
    var s = String(text || "");
    if (!s) {
      el.classList.add("is-empty");
      scheduleComposerLivePreview(el);
      return;
    }
    var re = /<(a?):([a-zA-Z0-9_]+):(\d{5,32})>|<@!?(\d{5,32})>|<@&(\d{5,32})>|<#(\d{5,32})>/g;
    var last = 0;
    var m;
    var frag = document.createDocumentFragment();
    while ((m = re.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      if (m[4]) {
        frag.appendChild(
          makeMentionTokenEl({
            type: "user",
            id: m[4],
            name: resolveMentionName("user", m[4]),
            markup: "<@" + m[4] + ">",
          }),
        );
      } else if (m[5]) {
        if (resolveMentionName("role", m[5]) === "ruolo") {
          queueContentResolve({ roleIds: [m[5]] });
        }
        frag.appendChild(
          makeMentionTokenEl({
            type: "role",
            id: m[5],
            name: resolveMentionName("role", m[5]),
            markup: "<@&" + m[5] + ">",
          }),
        );
      } else if (m[6]) {
        frag.appendChild(
          makeMentionTokenEl({
            type: "channel",
            id: m[6],
            name: resolveMentionName("channel", m[6]),
            markup: "<#" + m[6] + ">",
          }),
        );
      } else {
        frag.appendChild(makeEmojiTokenEl(m[0], m[2], m[3], m[1] === "a"));
      }
      last = m.index + m[0].length;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    el.appendChild(frag);
    el.classList.toggle("is-empty", !serializeRichInput(el));
    wireEmojiImgFallback(el);
    scheduleComposerLivePreview(el);
  }

  function richInputHasVisualTokens(el) {
    return Boolean(el && el.querySelector && el.querySelector("img, .vc-wt-mention"));
  }

  function syncRichInputEmptyState(el, knownText) {
    if (!el || !isRichInput(el)) return;
    var text = knownText != null ? String(knownText) : serializeRichInput(el);
    var empty = !String(text || "").trim() && !richInputHasVisualTokens(el);
    if (empty) {
      if (el.childNodes.length) el.innerHTML = "";
      el.classList.add("is-empty");
      if (document.activeElement === el) placeCaretInRichInput(el);
    } else {
      el.classList.remove("is-empty");
    }
  }

  function placeCaretInRichInput(el) {
    if (!el) return;
    try {
      try {
        el.focus({ preventScroll: true });
      } catch (eF) {
        el.focus();
      }
      var range = document.createRange();
      range.setStart(el, 0);
      range.collapse(true);
      var sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  function placeCaretAtEnd(el) {
    if (!el) return;
    try {
      try {
        el.focus({ preventScroll: true });
      } catch (eF) {
        el.focus();
      }
      var range = document.createRange();
      if (!el.childNodes.length) {
        range.setStart(el, 0);
        range.collapse(true);
      } else {
        range.selectNodeContents(el);
        range.collapse(false);
      }
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  function insertAtCursor(el, text, pick) {
    if (!el) return;
    var insert = String(text || "");
    if (!isRichInput(el)) {
      var value = String(el.value || "");
      var start = typeof el.selectionStart === "number" ? el.selectionStart : value.length;
      var end = typeof el.selectionEnd === "number" ? el.selectionEnd : value.length;
      var next = value.slice(0, start) + insert + value.slice(end);
      if (next.length > 2000) next = next.slice(0, 2000);
      el.value = next;
      var caret = Math.min(2000, start + insert.length);
      try {
        el.focus();
        el.setSelectionRange(caret, caret);
      } catch (e2) {}
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    el.focus();
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) placeCaretAtEnd(el);
    sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== el) {
      placeCaretAtEnd(el);
      sel = window.getSelection();
      range = sel.getRangeAt(0);
    }
    range.deleteContents();

    var node = null;
    if (pick && pick.type === "custom" && pick.markup) {
      var cm = String(pick.markup).match(/^<(a?):([a-zA-Z0-9_]+):(\d{5,32})>$/);
      if (cm) {
        node = makeEmojiTokenEl(pick.markup, cm[2] || pick.name, cm[3] || pick.id, cm[1] === "a" || pick.animated);
      }
    }
    if (!node && insert) {
      var custom = insert.match(/^<(a?):([a-zA-Z0-9_]+):(\d{5,32})>$/);
      if (custom) {
        node = makeEmojiTokenEl(insert, custom[2], custom[3], custom[1] === "a");
      } else {
        node = document.createTextNode(insert);
      }
    }
    if (!node) return;

    var piece =
      (node.getAttribute && node.getAttribute("data-emoji-markup")) ||
      String(node.nodeValue || "");
    if (serializeRichInput(el).length + String(piece).length > 2000) return;

    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    el.classList.remove("is-empty");
    if (node.tagName === "IMG") wireEmojiImgFallback(el);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function textBeforeCaret(el) {
    if (!el || !isRichInput(el)) return "";
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return serializeRichInput(el);
    try {
      var endRange = sel.getRangeAt(0);
      var range = document.createRange();
      range.selectNodeContents(el);
      range.setEnd(endRange.endContainer, endRange.endOffset);
      var frag = range.cloneContents();
      var tmp = document.createElement("div");
      tmp.appendChild(frag);
      return serializeRichInput(tmp);
    } catch (e) {
      return serializeRichInput(el);
    }
  }

  function textAfterCaret(el) {
    if (!el || !isRichInput(el)) return "";
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return "";
    try {
      var range = sel.getRangeAt(0).cloneRange();
      range.selectNodeContents(el);
      range.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
      return String(range.toString() || "");
    } catch (e2) {
      return "";
    }
  }

  function ensureMentionMenu() {
    var menu = byId("vc-wt-mention-menu");
    if (menu && menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
    if (menu) return menu;
    menu = document.createElement("div");
    menu.id = "vc-wt-mention-menu";
    menu.className = "vc-wt-mention-menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Menzioni");
    document.body.appendChild(menu);
    return menu;
  }

  function ensureCommandMenu() {
    var menu = byId("vc-wt-command-menu");
    if (menu && menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
    if (menu) return menu;
    menu = document.createElement("div");
    menu.id = "vc-wt-command-menu";
    menu.className = "vc-wt-command-menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Comandi staff");
    document.body.appendChild(menu);
    return menu;
  }

  function botCommandPrefix() {
    return String(state.commandPrefix || "+");
  }

  function composerMenuAnchor(el) {
    if (!el) return null;
    if (el.closest) {
      var row = el.closest(".vc-wt-composer__row");
      if (row) return row;
      var form = el.closest(".vc-wt-composer");
      if (form) return form;
    }
    return el;
  }

  function floatingMenuViewport() {
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
    } catch (eVv) {}
    return {
      top: 0,
      left: 0,
      width: window.innerWidth || 0,
      height: window.innerHeight || 0,
    };
  }

  function floatingMenuLayoutHeight() {
    try {
      var docH = document.documentElement && document.documentElement.clientHeight;
      if (docH && docH > 0) return docH;
    } catch (eDoc) {}
    return window.innerHeight || 0;
  }

  /* ticketComposerEmptyMenu1: empty /+/#/@ menu height must not inflate to 140 */
  function positionFloatingMenu(menu, el, maxHeight) {
    if (!menu || !el || menu.hidden) return;
    var inputRect = el.getBoundingClientRect();
    var widthAnchor = composerMenuAnchor(el) || el;
    var widthRect = widthAnchor.getBoundingClientRect();
    var vp = floatingMenuViewport();
    var layoutH = floatingMenuLayoutHeight();
    var gap = 8;
    var visibleTop = vp.top + gap;
    var visibleBottom = vp.top + vp.height - gap;
    var spaceAbove = Math.max(0, inputRect.top - visibleTop);
    var spaceBelow = Math.max(0, visibleBottom - inputRect.bottom);
    var wantMax = maxHeight || 280;
    var keyboardOpen = layoutH > 0 && vp.height > 0 && vp.height < layoutH * 0.85;
    var preferAbove =
      keyboardOpen || spaceAbove >= Math.min(120, wantMax) || spaceAbove >= spaceBelow;
    if (preferAbove && spaceAbove < 72 && spaceBelow > spaceAbove + 24) {
      preferAbove = false;
    }
    var room = Math.max(0, (preferAbove ? spaceAbove : spaceBelow) - gap);
    var maxH = Math.min(wantMax, Math.max(96, room || 96));
    var width = Math.min(
      Math.max(widthRect.width || inputRect.width || 240, 240),
      Math.max(200, vp.width - gap * 2),
    );
    var left = Math.max(
      vp.left + gap,
      Math.min(widthRect.left, vp.left + vp.width - width - gap),
    );
    menu.style.position = "fixed";
    menu.style.zIndex = "200000";
    menu.style.left = Math.round(left) + "px";
    menu.style.width = Math.round(width) + "px";
    menu.style.maxWidth = Math.round(vp.width - gap * 2) + "px";
    menu.style.bottom = "auto";
    menu.style.maxHeight = Math.round(maxH) + "px";
    menu.style.visibility = "hidden";
    menu.style.opacity = "0";
    menu.style.pointerEvents = "none";
    /* Misura altezza reale del contenuto (1 riga ≠ maxH) così non fluttua a metà chat.
       Non gonfiare gli empty state (~hint): altrimenti top = input - 140 e la barra
       sottile resta sospesa in mezzo alla chat. */
    var menuH = 0;
    try {
      menuH = Math.ceil(menu.getBoundingClientRect().height || menu.offsetHeight || 0);
    } catch (eH) {
      menuH = 0;
    }
    if (!menuH) {
      /* Misura fallita: fallback solo se zero, non se compact empty */
      menuH = Math.min(maxH, 56);
    }
    menuH = Math.min(menuH, maxH);

    var top;
    if (preferAbove) {
      top = inputRect.top - menuH - gap;
      if (top < visibleTop) {
        if (spaceBelow > spaceAbove + 16) {
          preferAbove = false;
          top = inputRect.bottom + gap;
          maxH = Math.min(wantMax, Math.max(96, spaceBelow - gap));
          menu.style.maxHeight = Math.round(maxH) + "px";
          try {
            menuH = Math.min(
              Math.ceil(menu.getBoundingClientRect().height || menu.offsetHeight || menuH),
              maxH,
            );
          } catch (eH2) {}
        } else {
          top = visibleTop;
          maxH = Math.max(72, Math.min(maxH, inputRect.top - gap - top));
          menu.style.maxHeight = Math.round(maxH) + "px";
          top = Math.max(visibleTop, inputRect.top - Math.min(menuH, maxH) - gap);
        }
      }
    } else {
      top = inputRect.bottom + gap;
      if (top + Math.min(96, menuH) > visibleBottom) {
        if (spaceAbove > spaceBelow + 16) {
          preferAbove = true;
          maxH = Math.min(wantMax, Math.max(96, spaceAbove - gap));
          menu.style.maxHeight = Math.round(maxH) + "px";
          try {
            menuH = Math.min(
              Math.ceil(menu.getBoundingClientRect().height || menu.offsetHeight || menuH),
              maxH,
            );
          } catch (eH3) {}
          top = Math.max(visibleTop, inputRect.top - menuH - gap);
        } else {
          top = Math.max(visibleTop, visibleBottom - maxH);
          maxH = Math.max(72, Math.min(maxH, visibleBottom - top));
          menu.style.maxHeight = Math.round(maxH) + "px";
        }
      }
    }
    menu.style.top = Math.round(top) + "px";
    menu.style.visibility = "visible";
    menu.style.opacity = "1";
    menu.style.pointerEvents = "auto";
    var placeKey =
      (preferAbove ? "a:" : "b:") +
      Math.round(top) +
      ":" +
      Math.round(maxH) +
      ":" +
      Math.round(left) +
      ":" +
      Math.round(width) +
      ":" +
      Math.round(menuH);
    menu.setAttribute("data-vc-float-place", placeKey);
  }

  var floatMenuSyncTimer = 0;
  function syncFloatingMenus() {
    if (!(state.mentionMenu.open || state.commandMenu.open)) return;
    if (window.__vcWtFloatMenuRaf) return;
    window.__vcWtFloatMenuRaf = window.requestAnimationFrame(function () {
      window.__vcWtFloatMenuRaf = 0;
      syncFloatingMenusNow();
    });
  }

  function syncFloatingMenusNow() {
    if (floatMenuSyncTimer) return;
    floatMenuSyncTimer = window.setTimeout(function () {
      floatMenuSyncTimer = 0;
      if (state.commandMenu.open) {
        positionCommandMenu(byId(state.commandMenu.elId || "vc-wt-composer-text"));
      }
      if (state.mentionMenu.open) {
        positionMentionMenu(byId(state.mentionMenu.elId || "vc-wt-composer-text"));
      }
    }, 48);
  }

  function positionMentionMenu(el) {
    var maxH = (state.mentionMenu.mode || "") === "channel" ? 360 : 260;
    positionFloatingMenu(byId("vc-wt-mention-menu"), el, maxH);
  }

  function hideMentionMenu() {
    state.mentionMenu = { open: false, q: "", items: [], index: 0, elId: "", mode: "user", filter: "all" };
    var menu = byId("vc-wt-mention-menu");
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = "";
      try {
        menu.removeAttribute("data-vc-float-place");
        menu.style.top = "";
        menu.style.bottom = "";
      } catch (eHideMm) {}
    }
  }

  function renderMentionMenu() {
    var menu = ensureMentionMenu();
    var mode = state.mentionMenu.mode || "user";
    var filter = state.mentionMenu.filter || "all";
    var showFilters = mode !== "channel" && effectivePermissions().isStaffViewer;
    var filtersHtml = showFilters
      ? '<div class="vc-wt-mention-menu__filters" role="tablist">' +
        [
          { id: "all", label: "Tutti" },
          { id: "users", label: "Utenti" },
          { id: "roles", label: "Ruoli" },
        ]
          .map(function (f) {
            return (
              '<button type="button" class="vc-wt-mention-menu__filter' +
              (filter === f.id ? " is-on" : "") +
              '" data-mention-filter="' +
              f.id +
              '" role="tab" aria-selected="' +
              (filter === f.id ? "true" : "false") +
              '">' +
              f.label +
              "</button>"
            );
          })
          .join("") +
        "</div>"
      : "";
    if (state.mentionMenu.loading) {
      menu.hidden = false;
      menu.innerHTML =
        filtersHtml +
        '<p class="vc-wt-mention-menu__hint">' +
        (mode === "channel" ? "Caricamento canali…" : "Caricamento menzioni…") +
        "</p>";
      wireMentionMenuFilters(menu);
      positionMentionMenu(byId(state.mentionMenu.elId || "vc-wt-composer-text"));
      return;
    }
    var items = state.mentionMenu.items || [];
    if (!state.mentionMenu.open) {
      menu.hidden = true;
      menu.innerHTML = "";
      return;
    }
    if (!items.length) {
      menu.hidden = false;
      menu.innerHTML =
        filtersHtml +
        '<p class="vc-wt-mention-menu__hint">' +
        (mode === "channel" ? "Nessun canale trovato" : "Nessuna menzione trovata") +
        "</p>";
      wireMentionMenuFilters(menu);
      positionMentionMenu(byId(state.mentionMenu.elId || "vc-wt-composer-text"));
      return;
    }
    menu.hidden = false;
    menu.innerHTML =
      filtersHtml +
      items
        .map(function (it, idx) {
          var type = String(it.type || "user");
          var icon = String(it.channelIcon || "");
          var cls =
            "vc-wt-mention-menu__item" +
            (idx === state.mentionMenu.index ? " is-active" : "") +
            (type === "role" ? " is-role" : type === "channel" ? " is-channel is-channel--" + (icon || "text") : " is-user");
          var avMark = "#";
          if (type === "role") avMark = "R";
          else if (type === "channel") {
            if (icon === "voice" || icon === "stage") avMark = "♫";
            else if (icon === "thread") avMark = "⎘";
            else if (icon === "forum" || icon === "media") avMark = "☰";
            else if (icon === "news") avMark = "!";
            else avMark = "#";
          } else avMark = "@";
          var av =
            type === "user" && it.avatarUrl
              ? avatarHtml(it.avatarUrl, it.name, "vc-wt-mention-menu__av", it.id)
              : '<span class="vc-wt-mention-menu__av vc-wt-mention-menu__av--fallback">' +
                avMark +
                "</span>";
          var prefix = type === "channel" ? "#" : "@";
          var sub = "Utente";
          if (type === "role") sub = "Ruolo";
          else if (type === "channel") {
            sub = it.channelKind || "Canale";
            if (it.parentName) sub += " · " + it.parentName;
          } else if (it.roleName) {
            sub = String(it.roleName);
            if (it.username) sub += " · @" + it.username;
          } else if (it.username) sub = it.username;
          return (
            '<button type="button" class="' +
            cls +
            '" data-mention-idx="' +
            idx +
            '">' +
            av +
            '<span class="vc-wt-mention-menu__meta"><strong>' +
            prefix +
            esc(it.name) +
            "</strong><small>" +
            esc(sub) +
            "</small></span></button>"
          );
        })
        .join("");
    wireMentionMenuFilters(menu);
    wakeTicketAvatars(menu);
    menu.querySelectorAll("[data-mention-idx]").forEach(function (btn) {
      if (btn._vcMentionPickWired) return;
      btn._vcMentionPickWired = true;
      function pick(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        var i = Number(btn.getAttribute("data-mention-idx"));
        var item = (state.mentionMenu.items || [])[i];
        applyMentionPick(item);
      }
      /* ticketMentionTab1: solo mousedown (no click doppio → doppio insert) */
      btn.addEventListener("mousedown", pick);
      btn.addEventListener("mouseenter", function () {
        var i = Number(btn.getAttribute("data-mention-idx"));
        if (!Number.isFinite(i) || i < 0) return;
        if (state.mentionMenu.index === i) return;
        state.mentionMenu.index = i;
        menu.querySelectorAll("[data-mention-idx]").forEach(function (b) {
          b.classList.toggle("is-active", Number(b.getAttribute("data-mention-idx")) === i);
        });
      });
    });
    positionMentionMenu(byId(state.mentionMenu.elId || "vc-wt-composer-text"));
  }

  function wireMentionMenuFilters(menu) {
    if (!menu) return;
    menu.querySelectorAll("[data-mention-filter]").forEach(function (btn) {
      if (btn._vcMentionFilterWired) return;
      btn._vcMentionFilterWired = true;
      btn.addEventListener("mousedown", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var next = String(btn.getAttribute("data-mention-filter") || "all");
        if (next === String(state.mentionMenu.filter || "all")) return;
        /* ticketPhoneTabList1: forza reload (prima sameOpen restava true perché filter già aggiornato) */
        state.mentionMenu.filter = next;
        state.mentionMenu.items = [];
        state.mentionMenu.loading = true;
        state.mentionMenu.index = 0;
        fetchMentions(state.mentionMenu.q || "", state.mentionMenu.elId, state.mentionMenu.mode || "user");
      });
    });
  }

  function escapeRegExp(s) {
    return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function applyMentionPick(item) {
    if (!item) return;
    var el = byId(state.mentionMenu.elId || "vc-wt-composer-text");
    if (!el) return;
    var type = String(item.type || "user");
    var id = String(item.id || "").trim();
    if (!id) return;
    var markup = String(item.markup || "").trim();
    if (!markup) {
      if (type === "channel") markup = "<#" + id + ">";
      else if (type === "role") markup = "<@&" + id + ">";
      else markup = "<@" + id + ">";
    }
    item.markup = markup;
    rememberMentionName(type, id, item.name);
    if (type === "user" && item.roleName) rememberStaffRole(id, item.roleId, item.roleName, item.roleKey);

    var trigger = type === "channel" ? "#" : "@";
    var q = String(state.mentionMenu.q != null ? state.mentionMenu.q : "");
    /* ticketMentionTab1: sostituisci solo il trigger sotto il caret (no append cieco) */
    var before = (isRichInput(el) ? textBeforeCaret(el) : String(el.value || "").slice(0, el.selectionStart || 0)).replace(
      /\u00a0/g,
      " ",
    );
    var after = (isRichInput(el) ? textAfterCaret(el) : String(el.value || "").slice(el.selectionStart || 0)).replace(
      /\u00a0/g,
      " ",
    );
    if (!before && !after) {
      before = serializeRichInput(el).replace(/\u00a0/g, " ");
      after = "";
    }
    var needle = trigger + q;
    var idx = before.lastIndexOf(needle);
    var replaced = false;
    if (idx >= 0 && before.slice(idx) === needle) {
      var prev = idx > 0 ? before.charAt(idx - 1) : "";
      var insideMarkup = prev === "<" || (trigger === "@" && prev === "!");
      if (!insideMarkup) {
        before = before.slice(0, idx) + markup + " ";
        replaced = true;
      }
    }
    if (!replaced) {
      /* fallback: fine del testo serializzato (mousedown può aver perso il caret) */
      var fullFallback = serializeRichInput(el).replace(/\u00a0/g, " ");
      var tIdx = fullFallback.lastIndexOf(needle);
      if (tIdx >= 0 && fullFallback.slice(tIdx) === needle) {
        var tPrev = tIdx > 0 ? fullFallback.charAt(tIdx - 1) : "";
        if (!(tPrev === "<" || (trigger === "@" && tPrev === "!"))) {
          before = fullFallback.slice(0, tIdx) + markup + " ";
          after = "";
          replaced = true;
        }
      }
    }
    if (!replaced) {
      hideMentionMenu();
      return;
    }
    var full = before + after;

    fillRichInput(el, full);
    setRichCaretSerializeOffset(el, before.length);
    try {
      el.focus({ preventScroll: true });
    } catch (eFocus) {
      try {
        el.focus();
      } catch (eFocus2) {}
    }
    el.classList.remove("is-empty");
    if (el.id === "vc-wt-composer-text") {
      state.composerText = serializeRichInput(el);
      saveTicketComposerDraft();
    }
    scheduleComposerLivePreview(el);
    hideMentionMenu();
  }

  function fetchMentions(q, elId, mode) {
    mode = mode || "user";
    var filter = mode === "channel" ? "all" : String(state.mentionMenu.filter || "all");
    var sameOpen =
      state.mentionMenu &&
      state.mentionMenu.open &&
      String(state.mentionMenu.q || "") === String(q || "") &&
      String(state.mentionMenu.mode || "") === mode &&
      String(state.mentionMenu.filter || "all") === filter;
    var keepIndex = sameOpen ? Math.max(0, Number(state.mentionMenu.index) || 0) : 0;
    state.mentionMenu = {
      open: true,
      q: q || "",
      items: sameOpen ? state.mentionMenu.items || [] : [],
      index: keepIndex,
      elId: elId || "vc-wt-composer-text",
      loading: !sameOpen || !(state.mentionMenu.items && state.mentionMenu.items.length),
      mode: mode,
      filter: filter,
    };
    renderMentionMenu();
    var url =
      apiBase() +
      "/mentions?q=" +
      encodeURIComponent(q || "") +
      (mode === "channel" ? "&kind=channels" : "") +
      (mode !== "channel" && filter !== "all" ? "&filter=" + encodeURIComponent(filter) : "") +
      (state.selectedId ? "&ticketId=" + encodeURIComponent(state.selectedId) : "");
    return fetchJson(url, { method: "GET", headers: authHeaders(), cache: "no-store" }).then(function (out) {
      if (!out.res.ok || !out.data || !out.data.ok) {
        state.mentionMenu = {
          open: true,
          q: q || "",
          items: [],
          index: 0,
          elId: elId || "vc-wt-composer-text",
          loading: false,
          mode: mode,
          filter: filter,
        };
        renderMentionMenu();
        return;
      }
      var items = [];
      if (mode === "channel") {
        items = Array.isArray(out.data.channels) ? out.data.channels : [];
        items.forEach(function (c) {
          rememberMentionName("channel", c.id, c.name);
        });
      } else {
        var users = Array.isArray(out.data.users) ? out.data.users : [];
        var roles = [];
        if (effectivePermissions().isStaffViewer) {
          roles = Array.isArray(out.data.roles) ? out.data.roles : [];
        }
        users.forEach(function (u) {
          rememberMentionName("user", u.id, u.name);
          if (u.roleName) rememberStaffRole(u.id, u.roleId, u.roleName, u.roleKey);
        });
        roles.forEach(function (r) {
          rememberMentionName("role", r.id, r.name);
        });
        items = users.concat(roles).slice(0, 24);
      }
      var list = mode === "channel" ? items.slice(0, 80) : items.slice(0, 24);
      var idx = keepIndex;
      if (idx >= list.length) idx = Math.max(0, list.length - 1);
      state.mentionMenu = {
        open: true,
        q: q || "",
        items: list,
        index: idx,
        elId: elId || "vc-wt-composer-text",
        loading: false,
        mode: mode,
        filter: filter,
      };
      renderMentionMenu();
    }).catch(function () {
      state.mentionMenu = {
        open: true,
        q: q || "",
        items: [],
        index: 0,
        elId: elId || "vc-wt-composer-text",
        loading: false,
        mode: mode,
        filter: filter,
      };
      renderMentionMenu();
    });
  }

  function hideCommandMenu() {
    state.commandMenu = { open: false, q: "", items: [], index: 0, prefix: "+", elId: "" };
    var menu = byId("vc-wt-command-menu");
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = "";
      try {
        menu.removeAttribute("data-vc-float-place");
        menu.style.top = "";
        menu.style.bottom = "";
      } catch (eHideCm) {}
    }
  }

  function positionCommandMenu(el) {
    positionFloatingMenu(byId("vc-wt-command-menu"), el, 320);
  }

  function ensureCommandCatalog() {
    var ticketId = String(state.selectedId || (state.detail && state.detail.id) || "").trim();
    if (!ticketId) {
      state.commandCatalog = [];
      state.slashCatalog = [];
      state.commandCatalogLoaded = false;
      state.commandCatalogTicketId = "";
      return Promise.resolve(state.commandCatalog);
    }
    /* ticketCommandsSoft1: fetch solo se partnership / canUseCommands */
    var perms = effectivePermissions();
    if (!perms || !perms.canUseCommands) {
      state.commandCatalog = [];
      state.slashCatalog = [];
      state.commandCatalogLoaded = true;
      state.commandCatalogTicketId = ticketId;
      return Promise.resolve(state.commandCatalog);
    }
    if (state.commandCatalogLoaded && state.commandCatalogTicketId === ticketId) {
      return Promise.resolve(state.commandCatalog);
    }
    if (state.commandCatalogLoading && state.commandCatalogLoadTicketId === ticketId) {
      return state.commandCatalogLoading;
    }
    state.commandCatalogLoadTicketId = ticketId;
    state.commandCatalogLoading = fetchJson(
      apiBase() + "/commands?ticketId=" + encodeURIComponent(ticketId),
      {
        method: "GET",
        headers: authHeaders(),
        cache: "no-store",
      }
    )
      .then(function (out) {
        state.commandCatalogLoading = null;
        var stillSame =
          String(state.selectedId || (state.detail && state.detail.id) || "") === ticketId;
        if (!stillSame) return state.commandCatalog;
        if (!out.res.ok || !out.data || !out.data.ok) {
          state.commandCatalog = [];
          state.slashCatalog = [];
          state.commandCatalogLoaded = false;
          state.commandCatalogTicketId = "";
          return state.commandCatalog;
        }
        state.commandPrefix = String(out.data.prefix || "+") || "+";
        state.commandCatalog = Array.isArray(out.data.commands) ? out.data.commands : [];
        state.slashCatalog = Array.isArray(out.data.slashCommands) ? out.data.slashCommands : [];
        state.commandCatalogLoaded = true;
        state.commandCatalogTicketId = ticketId;
        return state.commandCatalog;
      })
      .catch(function () {
        state.commandCatalogLoading = null;
        if (String(state.selectedId || (state.detail && state.detail.id) || "") !== ticketId) {
          return state.commandCatalog;
        }
        state.commandCatalog = [];
        state.slashCatalog = [];
        state.commandCatalogLoaded = false;
        state.commandCatalogTicketId = "";
        return state.commandCatalog;
      });
    return state.commandCatalogLoading;
  }

  function filterCommandCatalog(q, prefixChar) {
    var needle = String(q || "").toLowerCase();
    var isSlash = String(prefixChar || "") === "/";
    var list = isSlash ? state.slashCatalog || [] : state.commandCatalog || [];
    var prefix = isSlash ? "/" : botCommandPrefix() || "+";
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      var c = list[i];
      var name = String(c.name || "").toLowerCase();
      var aliases = Array.isArray(c.aliases) ? c.aliases : [];
      var invoke = String(c.invoke || name).toLowerCase();
      if (needle) {
        var aliasHit = "";
        for (var a = 0; a < aliases.length; a += 1) {
          if (String(aliases[a]).indexOf(needle) === 0) {
            aliasHit = String(aliases[a]);
            break;
          }
        }
        if (
          invoke.indexOf(needle) !== 0 &&
          name.indexOf(needle) !== 0 &&
          !aliasHit &&
          invoke.indexOf(needle) < 0 &&
          name.indexOf(needle) < 0
        ) {
          var any = false;
          for (var b = 0; b < aliases.length; b += 1) {
            if (String(aliases[b]).indexOf(needle) >= 0) {
              any = true;
              aliasHit = String(aliases[b]);
              break;
            }
          }
          if (!any) continue;
        }
        if (invoke.indexOf(needle) !== 0 && name.indexOf(needle) !== 0 && aliasHit) invoke = aliasHit;
      }
      out.push({
        name: name,
        invoke: invoke,
        description: c.description || "",
        usage: c.usage || prefix + invoke,
        category: c.category || "",
        prefix: prefix,
        kind: isSlash ? "slash" : "prefix",
      });
    }
    return out.slice(0, 12);
  }

  function renderCommandMenu() {
    var menu = ensureCommandMenu();
    if (state.commandMenu.loading) {
      menu.hidden = false;
      menu.innerHTML = '<p class="vc-wt-command-menu__hint">Caricamento comandi…</p>';
      positionCommandMenu(byId(state.commandMenu.elId || "vc-wt-composer-text"));
      return;
    }
    var items = state.commandMenu.items || [];
    if (!state.commandMenu.open) {
      menu.hidden = true;
      menu.innerHTML = "";
      return;
    }
    if (!items.length) {
      menu.hidden = false;
      menu.innerHTML = '<p class="vc-wt-command-menu__hint">Nessun comando trovato</p>';
      positionCommandMenu(byId(state.commandMenu.elId || "vc-wt-composer-text"));
      return;
    }
    menu.hidden = false;
    menu.innerHTML =
      '<p class="vc-wt-command-menu__hint">' +
      (String(state.commandMenu.trigger || "") === "/" ? "Slash command" : "Comandi prefix") +
      "</p>" +
      items
        .map(function (it, idx) {
          var cls = "vc-wt-command-menu__item" + (idx === state.commandMenu.index ? " is-active" : "");
          var label = esc(it.prefix + it.invoke);
          var cmdLabel = it.prefix + it.invoke;
          var descText = it.description || "";
          if (!descText && it.usage && it.usage !== cmdLabel) descText = it.usage;
          var desc = esc(descText);
          return (
            '<button type="button" class="' +
            cls +
            '" data-cmd-idx="' +
            idx +
            '">' +
            '<span class="vc-wt-command-menu__ico" aria-hidden="true">' +
            esc(it.prefix) +
            "</span>" +
            '<span class="vc-wt-command-menu__meta"><strong>' +
            label +
            "</strong>" +
            (desc ? "<small>" + desc + "</small>" : "") +
            "</span></button>"
          );
        })
        .join("");
    menu.querySelectorAll("[data-cmd-idx]").forEach(function (btn) {
      if (btn._vcCmdPickWired) return;
      btn._vcCmdPickWired = true;
      function pick(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        var i = Number(btn.getAttribute("data-cmd-idx"));
        var item = (state.commandMenu.items || [])[i];
        applyCommandPick(item);
      }
      /* ticketMentionTab1: solo mousedown; hover aggiorna selezione Tab/Enter */
      btn.addEventListener("mousedown", pick);
      btn.addEventListener("mouseenter", function () {
        var i = Number(btn.getAttribute("data-cmd-idx"));
        if (!Number.isFinite(i) || i < 0) return;
        if (state.commandMenu.index === i) return;
        state.commandMenu.index = i;
        menu.querySelectorAll("[data-cmd-idx]").forEach(function (b) {
          b.classList.toggle("is-active", Number(b.getAttribute("data-cmd-idx")) === i);
        });
      });
    });
    positionCommandMenu(byId(state.commandMenu.elId || "vc-wt-composer-text"));
  }

  function applyCommandPick(item) {
    if (!item || !item.invoke) return;
    var invokeLower = String(item.invoke || "").trim().toLowerCase();
    if (item.kind === "slash" && (invokeLower === "partnership" || String(item.name || "").toLowerCase() === "partnership")) {
      hideCommandMenu();
      var elClear = byId(state.commandMenu.elId || "vc-wt-composer-text");
      if (elClear) {
        fillRichInput(elClear, "");
        state.composerText = "";
        saveTicketComposerDraft();
      }
      // Sempre riapribile: non dipendere da busy di un comando precedente.
      state.busy = false;
      runPartnershipCommandFlow("/partnership");
      return;
    }
    var el = byId(state.commandMenu.elId || "vc-wt-composer-text");
    if (!el) return;
    var prefix = String(item.prefix || state.commandMenu.trigger || botCommandPrefix() || "+").charAt(0) || "+";
    var invoke = String(item.invoke || "").trim();
    if (!invoke) return;
    var cmdText = prefix + invoke + " ";
    var full = serializeRichInput(el).replace(/\u00a0/g, " ");
    var lines = full.split("\n");
    var last = lines[lines.length - 1] || "";
    var m = last.match(/^([+!/])([^\s]*)$/);
    if (m) {
      lines[lines.length - 1] = prefix + invoke + " ";
      full = lines.join("\n");
    } else {
      var q = String(state.commandMenu.q != null ? state.commandMenu.q : "");
      var trailing = new RegExp(
        "(?:^|\\n)([+!/])" + escapeRegExp(q) + "\\s*$",
      );
      if (trailing.test(full)) {
        full = full.replace(/(?:^|\n)([+!/])[^\s]*\s*$/, function (all) {
          var nl = all.charAt(0) === "\n" ? "\n" : "";
          return nl + prefix + invoke + " ";
        });
      } else {
        full = (full ? full.replace(/\s*$/, "") + "\n" : "") + cmdText;
      }
    }
    fillRichInput(el, full);
    placeCaretAtEnd(el);
    try {
      el.focus({ preventScroll: true });
    } catch (eFocus) {
      try {
        el.focus();
      } catch (eFocus2) {}
    }
    el.classList.remove("is-empty");
    state.composerText = serializeRichInput(el);
    saveTicketComposerDraft();
    scheduleComposerLivePreview(el);
    hideCommandMenu();
  }

  function showCommandMenu(q, triggerChar, elId) {
    var trigger = String(triggerChar || botCommandPrefix() || "+").charAt(0) || "+";
    var prefix = trigger === "/" ? "/" : botCommandPrefix() || "+";
    var sameOpen =
      state.commandMenu &&
      state.commandMenu.open &&
      String(state.commandMenu.q || "") === String(q || "") &&
      String(state.commandMenu.trigger || "") === trigger;
    var keepIndex = sameOpen ? Math.max(0, Number(state.commandMenu.index) || 0) : 0;
    state.commandMenu = {
      open: true,
      q: q || "",
      items: sameOpen ? state.commandMenu.items || [] : [],
      index: keepIndex,
      prefix: prefix,
      trigger: trigger,
      elId: elId || "vc-wt-composer-text",
      loading: !sameOpen || !(state.commandMenu.items && state.commandMenu.items.length),
    };
    renderCommandMenu();
    ensureCommandCatalog().then(function () {
      var items = filterCommandCatalog(q, trigger);
      var idx = keepIndex;
      if (idx >= items.length) idx = Math.max(0, items.length - 1);
      state.commandMenu = {
        open: true,
        q: q || "",
        items: items,
        index: idx,
        prefix: prefix,
        trigger: trigger,
        elId: elId || "vc-wt-composer-text",
        loading: false,
      };
      renderCommandMenu();
    });
  }

  function activeInputLine(before) {
    var lines = String(before || "").split("\n");
    return lines[lines.length - 1] || "";
  }

  /* ticketsRailComposer1: schedule locale — non passare dal host (ReferenceError post-lazy) */
  scheduleComposerSuggest = function (el, immediate) {
    if (!el) return;
    if (state.composerSuggestTimer) {
      clearTimeout(state.composerSuggestTimer);
      state.composerSuggestTimer = null;
    }
    if (immediate) {
      onRichInputMaybeMention(el);
      return;
    }
    state.composerSuggestTimer = setTimeout(function () {
      state.composerSuggestTimer = null;
      onRichInputMaybeMention(el);
    }, 60);
  };

  function onRichInputMaybeMention(el) {
    if (!el) return;
    if (!isRichInput(el) && el.tagName !== "TEXTAREA" && el.tagName !== "INPUT") return;
    var ctx = readComposerContext(el);
    if (!ctx) {
      hideMentionMenu();
      hideCommandMenu();
      syncRichInputEmptyState(el);
      return;
    }
    if (ctx.kind === "mention") {
      hideCommandMenu();
      if (state.mentionTimer) clearTimeout(state.mentionTimer);
      var userDelay = ctx.q ? 120 : 0;
      state.mentionTimer = setTimeout(function () {
        state.mentionTimer = null;
        fetchMentions(ctx.q, el.id, "user");
      }, userDelay);
      return;
    }
    if (ctx.kind === "channel") {
      hideCommandMenu();
      if (state.mentionTimer) clearTimeout(state.mentionTimer);
      var chDelay = ctx.q ? 120 : 0;
      state.mentionTimer = setTimeout(function () {
        state.mentionTimer = null;
        fetchMentions(ctx.q, el.id, "channel");
      }, chDelay);
      return;
    }
    if (ctx.kind === "command") {
      hideMentionMenu();
      if (state.commandTimer) clearTimeout(state.commandTimer);
      state.commandTimer = setTimeout(function () {
        state.commandTimer = null;
        showCommandMenu(ctx.q, ctx.prefix, el.id);
      }, 0);
      return;
    }
  }

  function ensureEmojiPickerScript() {
    if (window.VcEmojiPicker) return Promise.resolve(window.VcEmojiPicker);
    if (typeof window.__vcEnsureEmojiPickerScript === "function") {
      return window.__vcEnsureEmojiPickerScript();
    }
    if (window.__vcEmojiPickerLoading) return window.__vcEmojiPickerLoading;
    window.__vcEmojiPickerLoading = new Promise(function (resolve, reject) {
      var ver = "20261009emojiAnchorPos1";
      try {
        var m = window.__VC_ASSET_VERS;
        if (m && m.EMOJI_PICKER_VER) ver = String(m.EMOJI_PICKER_VER);
      } catch (eV) {}
      var s = document.createElement("script");
      s.src = "/js/vc-emoji-picker.js?v=" + ver;
      s.async = true;
      s.onload = function () {
        window.__vcEmojiPickerLoading = null;
        resolve(window.VcEmojiPicker || null);
      };
      s.onerror = function () {
        window.__vcEmojiPickerLoading = null;
        reject(new Error("emoji-picker"));
      };
      (document.body || document.documentElement).appendChild(s);
    });
    return window.__vcEmojiPickerLoading;
  }

  function openEmojiPicker(anchor, onPick, preferCustom) {
    if (!window.VcEmojiPicker) {
      ensureEmojiPickerScript()
        .then(function () {
          if (window.VcEmojiPicker) openEmojiPicker(anchor, onPick, preferCustom);
          else setStatus("Picker emoji non disponibile.", true);
        })
        .catch(function () {
          setStatus("Picker emoji non disponibile.", true);
        });
      return;
    }
    if (typeof window.VcEmojiPicker.isOpen === "function" && window.VcEmojiPicker.isOpen()) {
      state.emojiPickerToken += 1;
      state.emojiPickerOpening = false;
      window.VcEmojiPicker.close();
      return;
    }
    if (state.emojiPickerOpening) {
      state.emojiPickerToken += 1;
      state.emojiPickerOpening = false;
      window.VcEmojiPicker.close();
      return;
    }
    var token = (state.emojiPickerToken += 1);
    state.emojiPickerOpening = true;
    var anchorRect = null;
    try {
      if (anchor && anchor.getBoundingClientRect) {
        var r0 = anchor.getBoundingClientRect();
        if (r0 && (r0.width > 1 || r0.height > 1)) {
          anchorRect = {
            left: r0.left,
            top: r0.top,
            width: r0.width,
            height: r0.height,
            right: r0.right,
            bottom: r0.bottom,
          };
        }
      }
    } catch (eRect0) {}
    ensureGuildEmojis().then(function (emojis) {
      state.emojiPickerOpening = false;
      if (token !== state.emojiPickerToken) return;
      if (typeof window.VcEmojiPicker.isOpen === "function" && window.VcEmojiPicker.isOpen()) return;
      var live = anchor && document.body.contains(anchor) ? anchor : anchor;
      var opts = {
        anchor: live,
        anchorRect: anchorRect,
        guildEmojis: emojis,
        preferCustom: preferCustom === true && emojis && emojis.length > 0,
        onPick: onPick,
      };
      if (typeof window.VcEmojiPicker.toggle === "function") {
        window.VcEmojiPicker.toggle(opts);
        return;
      }
      window.VcEmojiPicker.open(opts);
    });
  }

  function patchMessageInState(msg) {
    if (!msg || !msg.id) return;
    var found = false;
    state.messages = state.messages.map(function (m) {
      if (m.id === msg.id) {
        found = true;
        return msg;
      }
      return m;
    });
    if (!found) return;
    var node = document.querySelector('[data-msg-id="' + msg.id + '"]');
    if (node) {
      var tmp = document.createElement("div");
      tmp.innerHTML = messageHtml(msg);
      var next = tmp.firstElementChild;
      if (next) {
        node.replaceWith(next);
        wireMessageReactions(next);
        wireMessageTools(next);
      }
    }
  }

  function toggleReaction(messageId, emojiMarkup) {
    if (!state.selectedId || !messageId || !emojiMarkup || state.busy) return;
    fetchJson(
      apiBase() +
        "/" +
        encodeURIComponent(state.selectedId) +
        "/messages/" +
        encodeURIComponent(messageId) +
        "/reactions",
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ emoji: emojiMarkup }),
      },
    )
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          setStatus(apiErrorText(out.data && out.data.message, "Reazione fallita."), true);
          return;
        }
        if (out.data.message) patchMessageInState(out.data.message);
        if (out.data.ticket) refreshTicketInList(out.data.ticket);
      })
      .catch(function () {
        setStatus("Errore di rete.", true);
      });
  }

  function hideReactionTipPortal() {
    var tip = document.getElementById("vc-wt-reaction-tip-portal");
    if (tip) tip.remove();
  }

  function showReactionTipPortal(btn) {
    hideReactionTipPortal();
    if (!btn) return;
    var text = btn.getAttribute("data-react-tip") || btn.getAttribute("aria-label") || "";
    if (!text) return;
    var tip = document.createElement("div");
    tip.id = "vc-wt-reaction-tip-portal";
    tip.className = "vc-wt-reaction-tip-portal";
    tip.textContent = text;
    document.body.appendChild(tip);
    var rect = btn.getBoundingClientRect();
    var pad = 8;
    var tw = tip.offsetWidth || 120;
    var th = tip.offsetHeight || 28;
    var left = Math.min(Math.max(pad, rect.left + rect.width / 2 - tw / 2), window.innerWidth - tw - pad);
    var top = rect.top - th - 8;
    if (top < pad) top = rect.bottom + 8;
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  }

  function wireMessageReactions(scope) {
    var root = scope || document;
    var closed = state.detail && state.detail.status === "closed";
    root.querySelectorAll("[data-react-emoji]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function () {
        if (closed) return;
        var msgEl = btn.closest("[data-msg-id]");
        var mid = msgEl && msgEl.getAttribute("data-msg-id");
        var emoji = btn.getAttribute("data-react-emoji");
        if (mid && emoji) toggleReaction(mid, emoji);
      });
      btn.addEventListener("mouseenter", function () {
        showReactionTipPortal(btn);
      });
      btn.addEventListener("mouseleave", hideReactionTipPortal);
      btn.addEventListener("focus", function () {
        showReactionTipPortal(btn);
      });
      btn.addEventListener("blur", hideReactionTipPortal);
    });
    root.querySelectorAll("[data-react-add]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function () {
        if (closed) return;
        var mid = btn.getAttribute("data-react-add");
        openEmojiPicker(btn, function (pick) {
          if (!pick || !pick.markup || !mid) return;
          toggleReaction(mid, pick.markup);
        }, true);
      });
    });
    root.querySelectorAll("[data-wt-spoiler]").forEach(function (el) {
      if (el._vcWired) return;
      el._vcWired = true;
      function reveal(ev) {
        if (el.classList.contains("is-open")) {
                    if (ev && ev.target && ev.target.closest && ev.target.closest("a")) return;
                    if (ev) {
            ev.preventDefault();
            ev.stopPropagation();
          }
          el.classList.remove("is-open");
          return;
        }
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        el.classList.add("is-open");
      }
      el.addEventListener("click", reveal);
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          reveal(ev);
        }
      });
    });
    wireMessageTools(root);
    wireEmojiImgFallback(root);
  }

  function removeMessageFromUi(messageId) {
    if (!messageId) return;
    state.deletedMessageIds[messageId] = true;
    state.messages = state.messages.filter(function (m) {
      return m && m.id !== messageId;
    });
        state.seenMessageIds[messageId] = true;
    var node = document.querySelector('[data-msg-id="' + messageId + '"]');
    if (node) node.remove();
  }

  function startEditMessage(messageId) {
    var msg = null;
    for (var i = 0; i < state.messages.length; i += 1) {
      if (state.messages[i] && state.messages[i].id === messageId) {
        msg = state.messages[i];
        break;
      }
    }
    if (!msg) return;
    var node = document.querySelector('[data-msg-id="' + messageId + '"]');
    if (!node) return;
    var bubble = node.querySelector(".vc-wt-msg__bubble");
    if (!bubble || bubble.querySelector(".vc-wt-msg__edit")) return;
    var textEl = bubble.querySelector(".vc-wt-msg__text");
    if (textEl) textEl.hidden = true;
    var form = document.createElement("form");
    form.className = "vc-wt-msg__edit";
    form.innerHTML =
      '<textarea class="vc-wt-msg__edit-input" rows="3" maxlength="2000"></textarea>' +
      '<div class="vc-wt-msg__edit-actions">' +
      '<button type="button" class="vc-wt-action vc-wt-action--ghost" data-edit-cancel>Annulla</button>' +
      '<button type="submit" class="vc-wt-action">Salva</button>' +
      "</div>";
    var ta = form.querySelector("textarea");
    ta.value = String(msg.content || "");
    var insertAfter = textEl || bubble.querySelector(".vc-wt-msg__meta");
    if (insertAfter && insertAfter.nextSibling) bubble.insertBefore(form, insertAfter.nextSibling);
    else bubble.appendChild(form);
    ta.focus();
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      saveEditMessage(messageId, ta.value);
    });
    form.querySelector("[data-edit-cancel]").addEventListener("click", function () {
      form.remove();
      if (textEl) textEl.hidden = false;
    });
  }

  function saveEditMessage(messageId, content) {
    if (!state.selectedId || !messageId || state.busy) return;
    var text = String(content || "").trim();
    var existing = null;
    for (var i = 0; i < state.messages.length; i += 1) {
      if (state.messages[i] && state.messages[i].id === messageId) {
        existing = state.messages[i];
        break;
      }
    }
    var imageCount = existing && Array.isArray(existing.imageUrls) ? existing.imageUrls.length : 0;
        if (!text && !imageCount) {
      deleteMessage(messageId, { fromEmptyEdit: true });
      return;
    }
    state.busy = true;
    fetchJson(
      apiBase() +
        "/" +
        encodeURIComponent(state.selectedId) +
        "/messages/" +
        encodeURIComponent(messageId),
      {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ content: text }),
      },
    )
      .then(function (out) {
        state.busy = false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          setStatus(apiErrorText(out.data && out.data.message, "Modifica fallita."), true);
          return;
        }
        if (out.data.deleted && out.data.messageId) {
          removeMessageFromUi(out.data.messageId);
          if (out.data.ticket) refreshTicketInList(out.data.ticket);
          return;
        }
        if (out.data.message) patchMessageInState(out.data.message);
        if (out.data.ticket) refreshTicketInList(out.data.ticket);
      })
      .catch(function () {
        state.busy = false;
        setStatus("Errore di rete.", true);
      });
  }

  function deleteMessage(messageId, opts) {
    if (!state.selectedId || !messageId || state.busy) return;
    opts = opts || {};
    var scrollY = capturePageScrollY();
    var run = function () {
            removeMessageFromUi(messageId);
      state.busy = true;
      fetchJson(
        apiBase() +
          "/" +
          encodeURIComponent(state.selectedId) +
          "/messages/" +
          encodeURIComponent(messageId),
        {
          method: "DELETE",
          headers: authHeaders(true),
        },
      )
        .then(function (out) {
          state.busy = false;
                    var alreadyGone =
            out.res &&
            out.res.status === 404 &&
            out.data &&
            (out.data.error === "not_found" || /non trovato/i.test(String(out.data.message || "")));
          if ((!out.res.ok || !out.data || !out.data.ok) && !alreadyGone) {
            setStatus(apiErrorText(out.data && out.data.message, "Eliminazione fallita."), true);
            return;
          }
          removeMessageFromUi(messageId);
          if (out.data && out.data.ticket) refreshTicketInList(out.data.ticket);
          setStatus("");
        })
        .catch(function () {
          state.busy = false;
          setStatus("Errore di rete.", true);
        })
        .finally(function () {
          restorePageScroll(scrollY);
        });
    };
    var confirmTitle = opts.fromEmptyEdit ? "Elimina messaggio" : "Elimina messaggio";
    var confirmMsg = opts.fromEmptyEdit
      ? "Hai lasciato il messaggio vuoto. Vuoi eliminarlo?"
      : "Vuoi eliminare questo messaggio? L’azione non si può annullare.";
    (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.confirm !== "function") return;
      return D.confirm({
        title: confirmTitle,
        message: confirmMsg,
        confirmLabel: "Elimina",
        cancelLabel: "Annulla",
        danger: true,
        icon: "fa-trash-o",
      }).then(function (ok) {
        restorePageScroll(scrollY);
        if (ok) run();
      });
    });
  }

  function copyMessageText(messageId) {
    var id = String(messageId || "");
    var msg = (state.messages || []).filter(function (m) {
      return m && m.id === id;
    })[0];
    var text = msg ? String(msg.content || "").trim() : "";
    if (!text) {
      setStatus("Questo messaggio non ha testo da copiare.", true);
      return;
    }
    function done() {
      setStatus("Testo copiato.");
    }
    function fail() {
      setStatus("Impossibile copiare il testo.", true);
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text).then(done).catch(fail);
      return;
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand("copy")) done();
      else fail();
    } catch (e) {
      fail();
    }
    document.body.removeChild(ta);
  }

  function wireMessageTools(scope) {
    var root = scope || document;
    root.querySelectorAll("[data-msg-copy]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        copyMessageText(btn.getAttribute("data-msg-copy"));
      });
    });
    root.querySelectorAll("[data-msg-edit]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        startEditMessage(btn.getAttribute("data-msg-edit"));
      });
    });
    root.querySelectorAll("[data-msg-del]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        deleteMessage(btn.getAttribute("data-msg-del"));
      });
    });
    root.querySelectorAll("[data-msg-reply]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        startReplyToMessage(btn.getAttribute("data-msg-reply"));
      });
    });
    root.querySelectorAll("[data-jump-msg]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        jumpToMessage(btn.getAttribute("data-jump-msg"));
      });
    });
    root.querySelectorAll(".vc-wt-msg-embed[data-open-url]").forEach(function (el) {
      if (el._vcWired) return;
      el._vcWired = true;
      function openEmbed(ev) {
        if (ev && ev.target && ev.target.closest && ev.target.closest("a,button")) return;
        var url = String(el.getAttribute("data-open-url") || "").trim();
        if (!url || url === "#") return;
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        try {
          window.open(url, "_blank", "noopener,noreferrer");
        } catch (eOpen) {}
      }
      el.addEventListener("click", openEmbed);
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") openEmbed(ev);
      });
    });
  }

  function ensureChatLogScroll() {
    var log = byId("vc-wt-chat-log");
    if (!log) return;
    log.style.minHeight = "0";
    log.style.overflowY = "scroll";
    var stage = log.closest(".vc-wt-chat__stage");
    if (stage) {
      stage.style.minHeight = "0";
      stage.style.flex = "1 1 auto";
      stage.style.overflow = "hidden";
    }
  }

  function patchComposerHtml() {
    var chat = document.querySelector(".vc-wt-chat");
    if (!chat || !state.detail) return;
    var lock = composerLockedReason();
    chat.classList.toggle("vc-wt-chat--closed", lock === "closed");
    var existing = chat.querySelector(".vc-wt-composer, form.vc-wt-composer");
    if (!lock && existing && existing.id === "vc-wt-composer") {
      syncComposerReplyBar();
      wireComposer();
      ensureChatLogScroll();
      return;
    }
    if (existing) {
      var tmp = document.createElement("div");
      tmp.innerHTML = composerHtml();
      var next = tmp.firstElementChild;
      if (next) {
        dismissFloatingUi();
        existing.replaceWith(next);
      }
    }
    if (lock === "closed") {
      var oldDock = byId("vc-wt-rate-dock");
      if (oldDock) oldDock.remove();
      patchRateDock({ settled: true });
      wireChatActions();
      wireRatingPanel();
      ensureChatLogScroll();
      return;
    }
    if (lock === "claimed" || lock === "unclaimed") {
      wireChatActions();
      ensureChatLogScroll();
      return;
    }
    var oldDockOpen = byId("vc-wt-rate-dock");
    if (oldDockOpen) oldDockOpen.remove();
    wireComposer();
    ensureChatLogScroll();
  }

  function patchRateDock(opts) {
    opts = opts || {};
    var chat = document.querySelector(".vc-wt-chat");
    if (!chat || !state.detail) return;
    var existing = byId("vc-wt-rate-dock");
    var html = ratingDockHtml(state.detail, { settled: Boolean(opts.settled || existing) });
    if (!html) {
      if (existing) existing.remove();
      ensureChatLogScroll();
      return;
    }
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    var next = tmp.firstElementChild;
    if (!next) return;
    var stage = chat.querySelector(".vc-wt-chat__stage");
    var log = byId("vc-wt-chat-log");
    if (existing) {
      existing.replaceWith(next);
    } else if (stage && log) {
      if (log.nextSibling) stage.insertBefore(next, log.nextSibling);
      else stage.appendChild(next);
    } else {
      var composer = chat.querySelector(".vc-wt-composer, form.vc-wt-composer");
      if (composer) chat.insertBefore(next, composer);
      else chat.appendChild(next);
    }
    wireChatActions();
    wireRatingPanel();
    ensureChatLogScroll();
  }

  function wireRatingPanel() {
    document.querySelectorAll("[data-rate-set]").forEach(function (btn) {
      if (btn._vcWired) return;
      btn._vcWired = true;
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-rate-set");
        var value = Math.max(1, Math.min(5, Math.round(Number(btn.getAttribute("data-rate-value") || 0) || 0)));
        if (kind === "ticket") state.rateDraftTicket = value;
        else if (kind === "staffer") state.rateDraftStaffer = value;
        patchRateDock({ settled: true });
      });
    });
  }

  function submitTicketRating() {
    if (!state.selectedId || state.busy) return;
    var ticketRating = Math.max(1, Math.min(5, Math.round(Number(state.rateDraftTicket) || 0)));
    var stafferRating = Math.max(1, Math.min(5, Math.round(Number(state.rateDraftStaffer) || 0)));
    if (!ticketRating || !stafferRating) {
      setStatus("Scegli un voto da 1 a 5 per il ticket e per lo staffer.", true);
      return;
    }
    state.busy = true;
    setStatus("Invio valutazione…", false);
    fetchJson(apiBase() + "/" + encodeURIComponent(state.selectedId) + "/rate", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ ticketRating: ticketRating, stafferRating: stafferRating }),
    })
      .then(function (out) {
        state.busy = false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          setStatus(apiErrorText(out.data && out.data.message, "Valutazione non inviata."), true);
          return;
        }
        state.rateDraftTicket = 0;
        state.rateDraftStaffer = 0;
        if (out.data.ticket) {
          state.detail = out.data.ticket;
          refreshTicketInList(out.data.ticket);
        }
        var avg = out.data.staffer && out.data.staffer.avgRating;
        var stafferId = out.data.staffer && out.data.staffer.id;
        if (stafferId && avg != null) {
          state.messages = (state.messages || []).map(function (m) {
            if (String(m.authorId) === String(stafferId) && String(m.authorKind) === "staff") {
              return Object.assign({}, m, { authorAvgRating: avg });
            }
            return m;
          });
          renderShell();
        } else {
          patchComposerHtml();
        }
        setStatus("Grazie! Valutazione salvata.", false);
      })
      .catch(function () {
        state.busy = false;
        setStatus("Errore di rete.", true);
      });
  }

  function postAction(suffix, body, preservedScrollY) {
    if (!state.selectedId) {
      setStatus("Apri un ticket prima.", true);
      return;
    }
    if (state.busy) {
      setStatus("Operazione già in corso…", false);
      return;
    }
    if (!getToken()) {
      setStatus("Sessione Discord assente. Ricarica o accedi di nuovo.", true);
      return;
    }
    var scrollY = Math.max(0, Number(preservedScrollY) || 0);
    if (!scrollY) scrollY = capturePageScrollY();
    state.busy = true;
    setChatActionsBusy(true);
    /* ticketCloseTimeout1: 35s anche desktop — Discord member resolve può superare 18s */
    var actionId = String(state.selectedId || "");
    fetchJson(apiBase() + "/" + encodeURIComponent(actionId) + suffix, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(body || {}),
      timeoutMs: 35000,
    })
      .then(function (out) {
        if (apiActionFailed(out)) {
          var apiMsg = apiErrorText(out.data && out.data.message, "");
          var code = String((out.data && out.data.error) || "");
          var status = Number((out.res && out.res.status) || 0);
          var fallback =
            status === 401 || code === "unauthorized" || code === "missing_token" || code === "invalid_token"
              ? "Sessione Discord scaduta in questo browser. Riaccedi qui (ogni browser ha login separato)."
              : status === 403 || code === "forbidden"
                ? "Non hai i permessi per questa azione."
                : status === 409
                  ? apiMsg || "Azione non disponibile (ticket già aggiornato)."
                  : status === 429 || code === "rate_limited"
                    ? "Troppe richieste. Riprova tra poco."
                    : status >= 500 || code === "internal" || code === "member_unavailable" || code === "discord_unreachable"
                      ? "Discord lento o errore server. Riprova tra poco."
                      : status
                        ? "Operazione non riuscita (" + status + "). Riprova."
                        : "Operazione non riuscita. Riprova.";
          if (status === 401 || code === "unauthorized" || code === "missing_token" || code === "invalid_token") {
            try {
              if (typeof window.__vcNotifyAuthFailure === "function") {
                window.__vcNotifyAuthFailure(status, out.data, { reason: "web-tickets-401", skipRedirect: true });
              } else if (typeof window.__vcDiscordCompleteLogout === "function") {
                window.__vcDiscordCompleteLogout({ reason: "web-tickets-401", forceToast: true, skipRedirect: true });
              }
            } catch (eAuth) {}
          }
          setStatus(apiMsg || fallback, true);
          return;
        }
        withPageScrollPreserved(function () {
          if (out.data.ticket) {
            state.detail = mergeTicketDetail(out.data.ticket, { trustPermissions: true });
            refreshTicketInList(state.detail);
            refreshChatChrome();
          }
          if (out.data.message && typeof out.data.message === "object") {
            appendMessage(out.data.message, out.data.ticket);
          }
          patchComposerHtml();
          scrollChatBottom(true);
        });
        if (suffix === "/claim") setStatus("Ticket claimato.", false);
        else if (suffix === "/unclaim") setStatus("Ticket rilasciato.", false);
        else if (suffix === "/close" || suffix.indexOf("/close-request") === 0) setStatus("Operazione completata.", false);
        else setStatus("Operazione completata.", false);
      })
      .catch(function (err) {
        var aborted = err && (err.name === "AbortError" || err.code === 20);
        var shouldReconcile =
          aborted &&
          actionId &&
          (suffix === "/close" ||
            suffix === "/claim" ||
            suffix === "/unclaim" ||
            suffix.indexOf("/close-request") === 0);
        if (!shouldReconcile) {
          setStatus(aborted ? "Timeout: riprova (rete lenta)." : "Errore di rete. Riprova.", true);
          return;
        }
        /* ticketCloseTimeout1: server spesso ha già chiuso/claimato mentre il client abortiva */
        setStatus("Verifico stato ticket…", false);
        return fetchJson(apiBase() + "/" + encodeURIComponent(actionId), {
          method: "GET",
          headers: authHeaders(),
          cache: "no-store",
          timeoutMs: 12000,
        })
          .then(function (out) {
            if (!(out.res && out.res.ok && out.data && out.data.ok && out.data.ticket)) {
              setStatus("Timeout: riprova (rete lenta).", true);
              return;
            }
            if (state.selectedId !== actionId) return;
            withPageScrollPreserved(function () {
              state.detail = mergeTicketDetail(out.data.ticket, { trustPermissions: true });
              if (Array.isArray(out.data.messages)) {
                state.messages = out.data.messages;
                state.seenMessageIds = {};
                state.messages.forEach(function (m) {
                  if (m && m.id) state.seenMessageIds[m.id] = true;
                });
              }
              refreshTicketInList(state.detail);
              refreshChatPane();
              patchComposerHtml();
              scrollChatBottom(true);
            });
            var st = String((state.detail && state.detail.status) || "");
            if (suffix === "/close" && st === "closed") {
              setStatus("Operazione completata.", false);
              return;
            }
            if (suffix === "/claim" && String((state.detail && state.detail.claimedBy) || "").trim()) {
              setStatus("Ticket claimato.", false);
              return;
            }
            if (suffix === "/unclaim" && !String((state.detail && state.detail.claimedBy) || "").trim()) {
              setStatus("Ticket rilasciato.", false);
              return;
            }
            if (suffix === "/close-request" && state.detail && state.detail.closeRequestedAt) {
              setStatus("Operazione completata.", false);
              return;
            }
            if (
              (suffix === "/close-request/accept" && st === "closed") ||
              (suffix === "/close-request/reject" && state.detail && !state.detail.closeRequestedAt)
            ) {
              setStatus("Operazione completata.", false);
              return;
            }
            setStatus("Timeout: riprova (rete lenta).", true);
          })
          .catch(function () {
            setStatus("Timeout: riprova (rete lenta).", true);
          });
      })
      .finally(function () {
        state.busy = false;
        setChatActionsBusy(false);
        restorePageScroll(scrollY);
        try {
          requestAnimationFrame(function () {
            restorePageScroll(scrollY);
          });
        } catch (eRaf) {}
        try {
          if (typeof window.__vcHoldPageScroll === "function") window.__vcHoldPageScroll(220);
        } catch (eHold) {}
      });
  }

  function setChatActionsBusy(on) {
    try {
      document.querySelectorAll(".vc-wt-action[data-act]").forEach(function (btn) {
        if (on) btn.setAttribute("aria-busy", "true");
        else btn.removeAttribute("aria-busy");
        btn.disabled = Boolean(on);
      });
    } catch (eBusyUi) {}
  }

  function refreshChatChrome() {
    if (!state.detail) return;
    var top = byId("vc-wt-chat-top");
    if (!top) return;
    var wrap = document.createElement("div");
    wrap.innerHTML = chatHeadHtml(state.detail);
    var next = wrap.firstElementChild;
    if (next) top.replaceWith(next);
    wireChatActions();
    patchComposerHtml();
  }

  function wireComposer() {
    var form = byId("vc-wt-composer");
    if (!form || form._vcWired) return;
    form._vcWired = true;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      sendMessage();
    });
    form.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-reply-cancel]")) {
        ev.preventDefault();
        clearReplyTarget();
      }
    });
    var ta = byId("vc-wt-composer-text");
    if (ta && !ta._vcWired) {
      ta._vcWired = true;
      applyRichInputPlaintextMode(ta);
      fillRichInput(ta, state.composerText || "");
      syncComposerAutosize(ta);
      ta.addEventListener("input", function () {
        unwrapComposerAutolinks(ta);
        var nextText = serializeRichInput(ta);
        syncRichInputEmptyState(ta, nextText);
        var prevLen = Number(ta._vcComposerLen || 0);
        var nextLen = String(nextText || "").length;
        if (nextLen < prevLen) ta._vcAutoGrowShrink = 1;
        ta._vcComposerLen = nextLen;
        state.composerText = nextText;
        scheduleSaveTicketComposerDraft();
        /* ticketsChatLag2: un solo path rAF (live+autosize); no sync autosize + keyup/beforeinput doppi */
        scheduleComposerLivePreview(ta);
        scheduleComposerSuggest(ta, false);
        pulseTicketTyping(Boolean(String(state.composerText || "").trim()));
      });
      ta.addEventListener("paste", function () {
        window.setTimeout(function () {
          unwrapComposerAutolinks(ta);
          var nextText = serializeRichInput(ta);
          syncRichInputEmptyState(ta, nextText);
          ta._vcComposerLen = String(nextText || "").length;
          ta._vcAutoGrowShrink = 1;
          state.composerText = nextText;
          scheduleSaveTicketComposerDraft();
          scheduleComposerLivePreview(ta);
        }, 0);
      });
      ta.addEventListener("scroll", function () {
        var live =
          ta.parentElement &&
          ta.parentElement.classList.contains("vc-wt-composer__editor")
            ? ta.parentElement.querySelector(".vc-wt-composer__md-live")
            : null;
        if (live && ta.classList.contains("has-md-live")) {
          if (live.scrollTop !== ta.scrollTop) live.scrollTop = ta.scrollTop;
          if (live.scrollLeft !== ta.scrollLeft) live.scrollLeft = ta.scrollLeft;
        }
      }, { passive: true });
      window.addEventListener("resize", function () {
        syncComposerAutosize(ta, { force: true });
      });
      ta.addEventListener("keyup", function (ev) {
        var key = String(ev.key || "");
        if (key === ")" || key === " " || key === "Enter") {
          unwrapComposerAutolinks(ta);
        }
      });
      ta.addEventListener("click", function () {
        scheduleComposerSuggest(ta, true);
      });
      ta.addEventListener("focus", function () {
        if (effectivePermissions().canUseCommands) void ensureCommandCatalog();
      });
      ta.addEventListener(
        "keydown",
        function (ev) {
        /* ticketMentionTab1: capture + sync index da .is-active (hover) prima di Tab/Enter */
        function activeMenuIndex(menuId, attr, fallback) {
          var menu = byId(menuId);
          var active = menu && menu.querySelector(".is-active[" + attr + "]");
          if (active) {
            var i = Number(active.getAttribute(attr));
            if (Number.isFinite(i) && i >= 0) return i;
          }
          return Math.max(0, Number(fallback) || 0);
        }
        if (state.commandMenu.open && state.commandMenu.items.length) {
          if (ev.key === "ArrowDown") {
            ev.preventDefault();
            ev.stopPropagation();
            state.commandMenu.index = (state.commandMenu.index + 1) % state.commandMenu.items.length;
            renderCommandMenu();
            return;
          }
          if (ev.key === "ArrowUp") {
            ev.preventDefault();
            ev.stopPropagation();
            state.commandMenu.index =
              (state.commandMenu.index - 1 + state.commandMenu.items.length) % state.commandMenu.items.length;
            renderCommandMenu();
            return;
          }
          if (ev.key === "Enter" || ev.key === "Tab") {
            ev.preventDefault();
            ev.stopPropagation();
            state.commandMenu.index = activeMenuIndex(
              "vc-wt-command-menu",
              "data-cmd-idx",
              state.commandMenu.index,
            );
            applyCommandPick(state.commandMenu.items[state.commandMenu.index]);
            return;
          }
          if (ev.key === "Escape") {
            ev.preventDefault();
            hideCommandMenu();
            return;
          }
        }
        if (state.mentionMenu.open) {
          if (ev.key === "ArrowDown" && state.mentionMenu.items.length) {
            ev.preventDefault();
            ev.stopPropagation();
            state.mentionMenu.index = (state.mentionMenu.index + 1) % state.mentionMenu.items.length;
            renderMentionMenu();
            return;
          }
          if (ev.key === "ArrowUp" && state.mentionMenu.items.length) {
            ev.preventDefault();
            ev.stopPropagation();
            state.mentionMenu.index =
              (state.mentionMenu.index - 1 + state.mentionMenu.items.length) % state.mentionMenu.items.length;
            renderMentionMenu();
            return;
          }
          if ((ev.key === "Enter" || ev.key === "Tab") && state.mentionMenu.items.length) {
            ev.preventDefault();
            ev.stopPropagation();
            state.mentionMenu.index = activeMenuIndex(
              "vc-wt-mention-menu",
              "data-mention-idx",
              state.mentionMenu.index,
            );
            applyMentionPick(state.mentionMenu.items[state.mentionMenu.index]);
            return;
          }
          if (ev.key === "Tab" && state.mentionMenu.open) {
            /* menu aperto ma ancora loading: non togliere focus dal composer */
            ev.preventDefault();
            ev.stopPropagation();
            return;
          }
          if (ev.key === "Escape") {
            ev.preventDefault();
            hideMentionMenu();
            return;
          }
        }
        if (ev.key === "Escape" && state.replyTo) {
          ev.preventDefault();
          clearReplyTarget();
          return;
        }
        if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && (ev.key === "@" || ev.key === "#" || ev.key === "+" || ev.key === "!" || ev.key === "/")) {
          setTimeout(function () {
            scheduleComposerSuggest(ta, true);
          }, 0);
        }
        if (ev.key === "Backspace" || ev.key === "Delete") {
          setTimeout(function () {
            syncRichInputEmptyState(ta);
            scheduleComposerSuggest(ta, true);
          }, 0);
        }
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          sendMessage();
        }
      },
        true,
      );
      ta.addEventListener("paste", function (ev) {
        var cd = ev.clipboardData || window.clipboardData || null;
        var files = [];
        if (cd && cd.items && cd.items.length) {
          for (var i = 0; i < cd.items.length; i += 1) {
            var it = cd.items[i];
            if (!it || it.kind !== "file") continue;
            var f = it.getAsFile && it.getAsFile();
            if (f) files.push(f);
          }
        }
        if (!files.length && cd && cd.files && cd.files.length) {
          files = Array.prototype.slice.call(cd.files);
        }
        if (files.length) {
          ev.preventDefault();
          void addComposerMediaFiles(files);
          return;
        }
        var clip = (cd && cd.getData && cd.getData("text")) || "";
        if (!clip) return;
        ev.preventDefault();
        if (/<(a?):([a-zA-Z0-9_]+):(\d{5,32})>/.test(clip)) {
          var parts = clip.split(/(<(?:a?):[a-zA-Z0-9_]+:\d{5,32}>)/g);
          parts.forEach(function (part) {
            if (!part) return;
            insertAtCursor(ta, part);
          });
        } else {
          insertAtCursor(ta, clip.slice(0, 2000));
        }
        state.composerText = serializeRichInput(ta);
        scheduleComposerLivePreview(ta);
        scheduleComposerSuggest(ta, true);
      });
    }
    var emojiBtn = byId("vc-wt-composer-emoji");
    if (emojiBtn && !emojiBtn._vcWired) {
      emojiBtn._vcWired = true;
      emojiBtn.addEventListener("click", function () {
        openEmojiPicker(emojiBtn, function (pick) {
          if (!pick || !pick.markup) return;
          insertAtCursor(byId("vc-wt-composer-text"), pick.markup, pick);
          state.composerText = serializeRichInput(byId("vc-wt-composer-text"));
          scheduleComposerLivePreview(byId("vc-wt-composer-text"));
        });
      });
    }
    var file = byId("vc-wt-composer-file");
    if (file && !file._vcWired) {
      file._vcWired = true;
      file.addEventListener("change", function () {
        void addComposerMediaFiles(file.files).then(function () {
          file.value = "";
        });
      });
    }
    if (form && !form._vcDropWired) {
      form._vcDropWired = true;
      form.addEventListener("dragover", function (ev) {
        if (!ev.dataTransfer) return;
        var types = ev.dataTransfer.types;
        var hasFiles = false;
        if (types) {
          for (var ti = 0; ti < types.length; ti += 1) {
            if (String(types[ti]).toLowerCase() === "files") {
              hasFiles = true;
              break;
            }
          }
        }
        if (!hasFiles) return;
        ev.preventDefault();
        form.classList.add("is-drop-target");
      });
      form.addEventListener("dragleave", function (ev) {
        if (ev.relatedTarget && form.contains(ev.relatedTarget)) return;
        form.classList.remove("is-drop-target");
      });
      form.addEventListener("drop", function (ev) {
        form.classList.remove("is-drop-target");
        var files = ev.dataTransfer && ev.dataTransfer.files ? ev.dataTransfer.files : null;
        if (!files || !files.length) return;
        ev.preventDefault();
        void addComposerMediaFiles(files);
      });
    }
    var prev = byId("vc-wt-composer-previews");
    if (prev && !prev._vcWired) {
      prev._vcWired = true;
      renderPreviews("vc-wt-composer-previews", state.composerImages || []);
      prev.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-rm-img]");
        if (!btn) return;
        var i = Number(btn.getAttribute("data-rm-img"));
        state.composerImages.splice(i, 1);
        renderPreviews("vc-wt-composer-previews", state.composerImages);
      });
    }
  }


  H.install({
    ver: VER,
    ensureGuildEmojis: ensureGuildEmojis,
    refreshEmojiDependentUi: refreshEmojiDependentUi,
    openEmojiPicker: openEmojiPicker,
    wireMessageReactions: wireMessageReactions,
    wireMessageTools: wireMessageTools,
    wireComposer: wireComposer,
    hideMentionMenu: hideMentionMenu,
    hideCommandMenu: hideCommandMenu,
    hideReactionTipPortal: hideReactionTipPortal,
    serializeRichInput: serializeRichInput,
    fillRichInput: fillRichInput,
    applyMentionPick: applyMentionPick,
    applyCommandPick: applyCommandPick,
    renderMentionMenu: renderMentionMenu,
    renderCommandMenu: renderCommandMenu,
    syncFloatingMenus: syncFloatingMenus,
    onRichInputMaybeMention: onRichInputMaybeMention,
    textBeforeCaret: textBeforeCaret,
    scheduleComposerSuggest: scheduleComposerSuggest,
    /* ticketsMsgRailCpu1: API per delegation host */
    copyMessageText: copyMessageText,
    startEditMessage: startEditMessage,
    deleteMessage: deleteMessage,
    toggleReaction: toggleReaction,
    freezeTicketsAnimatedMedia: freezeTicketsAnimatedMedia,
  });
  try {
    document.dispatchEvent(new CustomEvent("vc:wt-composer-chunk-ready", { detail: { ver: VER } }));
  } catch (eEv) {}
})();
