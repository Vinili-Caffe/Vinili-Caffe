/**
 * Chat pratica workflow (inbox staff + richiedente pausa / candidatura / appelli).
 * Emoji, risposte, allegati, reazioni — stile ticket web.
 * Pause: soggetto sempre incluso. Candidature/appelli: solo se invitato (finestre).
 */
(function (global) {
  "use strict";

  var cfg = null;
  var state = {
    dedupeKey: "",
    tab: "",
    messages: [],
    canSend: false,
    maxImages: 3,
    loading: false,
    sending: false,
    managingSubject: false,
    error: "",
    ws: null,
    pollTimer: null,
    seq: 0,
    replyTo: null,
    composerImages: [],
    guildEmojis: null,
    profileId: "",
    isStaffReviewer: false,
    isSubject: false,
    subjectChat: null,
    status: "pending",
  };

  function c(key) {
    return cfg && cfg[key] != null ? cfg[key] : null;
  }

  function esc(v) {
    var fn = c("esc");
    return fn ? fn(v) : String(v == null ? "" : v);
  }

  function byId(id) {
    var fn = c("byId");
    return fn ? fn(id) : document.getElementById(id);
  }

  function fetchJson(url, opts) {
    return c("fetchJson")(url, opts);
  }

  function apiBase() {
    var fn = c("apiBase");
    return fn ? String(fn() || "").replace(/\/+$/, "") : "";
  }

  function dedupeKeyFor(item, tab) {
    var fn = c("dedupeKeyForItem");
    return fn ? String(fn(item, tab) || "") : "";
  }

  function defaultAvatarUrl(userId) {
    var uid = String(userId || "").trim();
    var idx = 0;
    if (/^\d{17,20}$/.test(uid)) {
      try {
        idx = Number((BigInt(uid) >> 22n) % 6n);
      } catch (e) {
        idx = 0;
      }
    }
    return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
  }

  function avatarHtml(url, id, opts) {
    var fn = c("avatarHtml");
    if (fn) return fn(url, id, opts);
    opts = opts || {};
    var cls = String(opts.className || "vc-wfc-avatar").trim() || "vc-wfc-avatar";
    var w = Number(opts.width) || 28;
    var h = Number(opts.height) || 28;
    var uid = String(id || "").trim();
    var src = String(url || "").trim() || defaultAvatarUrl(uid);
    var fb = defaultAvatarUrl(uid);
    var svg =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(%23g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>',
      );
    var onerr =
      "this.onerror=function(){this.onerror=null;this.src='" +
      svg.replace(/'/g, "%27") +
      "';};this.src='" +
      fb.replace(/'/g, "\\'") +
      "';";
    return (
      '<img class="' +
      esc(cls) +
      '" src="' +
      esc(src) +
      '" alt="" width="' +
      esc(w) +
      '" height="' +
      esc(h) +
      '" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1"' +
      (uid ? ' data-user-id="' + esc(uid) + '"' : "") +
      ' onerror="' +
      onerr +
      '" />'
    );
  }

  function formatMessageHtml(text, opts) {
    var fn = c("formatMessageHtml");
    if (fn) return fn(text, opts);
    return esc(text);
  }

  function cleanText(text) {
    return String(text || "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, "")
      .replace(/[\u200B\u200C\uFEFF]/g, "")
      .replace(/<(?:@(?:!|&)?|#)\d+>/g, "")
      .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/[*_`~|]+/g, "")
      .trim();
  }

  function formatChatTime(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function authHeaders(json) {
    var h = {};
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  function normalizeMediaUrl(url) {
    var u = String(url || "").trim();
    if (!u) return u;
    var base = apiBase();
    if (!base) return u;
    var m = u.match(/^\/webhooks\/site-(?:staff|user)-workflow-chat\/files\/(.+)$/);
    if (!m) return u;
    return base.replace(/\/+$/, "") + "/files/" + m[1];
  }

  function fileUrlWithAuth(url) {
    var u = normalizeMediaUrl(url);
    if (!u || !state.dedupeKey) return u;
    var sep = u.indexOf("?") >= 0 ? "&" : "?";
    u = u + sep + "dedupeKey=" + encodeURIComponent(state.dedupeKey);
    var tokenFn = c("getToken");
    var token = tokenFn ? String(tokenFn() || "").trim() : "";
    if (token) u += "&accessToken=" + encodeURIComponent(token);
    return u;
  }

  function mediaGalleryHtml(urls) {
    var list = Array.isArray(urls) ? urls.filter(Boolean) : [];
    if (!list.length) return "";
    return (
      '<div class="vc-wfc-media">' +
      list
        .map(function (url) {
          var src = esc(fileUrlWithAuth(url));
          if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
            return '<video class="vc-wfc-media__vid" controls preload="metadata" src="' + src + '"></video>';
          }
          return (
            '<a class="vc-wfc-media__img" href="' +
            src +
            '" target="_blank" rel="noopener noreferrer">' +
            '<img src="' +
            src +
            '" alt="" loading="lazy" decoding="async" />' +
            "</a>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function reactionEmojiHtml(r) {
    if (r.emojiId && global.VcEmojiPicker && global.VcEmojiPicker.customUrl) {
      return (
        '<img class="vc-wfc-react__emoji" src="' +
        esc(global.VcEmojiPicker.customUrl(r.emojiId, r.animated, 20)) +
        '" alt="" width="16" height="16" />'
      );
    }
    return '<span class="vc-wfc-react__emoji">' + esc(r.emoji || "?") + "</span>";
  }

  function reactionsBarHtml(m, closed) {
    if (String(m.authorKind || "") === "system") return "";
    var reactions = Array.isArray(m.reactions) ? m.reactions : [];
    if (closed && !reactions.length) return "";
    var out =
      '<div class="vc-wfc-reactions" data-msg-id="' +
      esc(m.id) +
      '">' +
      reactions
        .map(function (r) {
          var mine =
            state.profileId &&
            (r.userIds || []).some(function (id) {
              return String(id) === String(state.profileId);
            });
          return (
            '<button type="button" class="vc-wfc-react' +
            (mine ? " is-mine" : "") +
            '" data-react-msg="' +
            esc(m.id) +
            '" data-react-emoji="' +
            esc(r.emoji) +
            '" title="' +
            esc((r.users || []).map(function (u) { return u.name || u.id; }).join(", ")) +
            '">' +
            reactionEmojiHtml(r) +
            '<span class="vc-wfc-react__count">' +
            esc(String((r.userIds || []).length || 0)) +
            "</span></button>"
          );
        })
        .join("") +
      (!closed
        ? '<button type="button" class="vc-wfc-react vc-wfc-react--add" data-react-add="' +
          esc(m.id) +
          '" title="Aggiungi reazione">+</button>'
        : "") +
      "</div>";
    return out;
  }

  function replyQuoteHtml(m) {
    if (!m || !m.replyTo) return "";
    return (
      '<div class="vc-wfc-reply-quote">' +
      '<span class="vc-wfc-reply-quote__author">' +
      esc(m.replyTo.authorName || "Messaggio") +
      "</span>" +
      '<span class="vc-wfc-reply-quote__text">' +
      esc(m.replyTo.content || "") +
      "</span></div>"
    );
  }

  function messageActionsHtml(m, closed) {
    if (closed || String(m.authorKind || "") === "system") return "";
    return (
      '<div class="vc-wfc-msg__tools">' +
      '<button type="button" class="vc-wfc-msg__tool" data-reply-msg="' +
      esc(m.id) +
      '" title="Rispondi"><i class="fa fa-reply" aria-hidden="true"></i></button>' +
      "</div>"
    );
  }

  function renderMessagesHtml() {
    if (state.loading && !state.messages.length) {
      return '<p class="vc-wfc-empty">Caricamento chat…</p>';
    }
    if (!state.messages.length) {
      return '<p class="vc-wfc-empty">Nessun messaggio. Scrivi qui come su Discord (emoji, risposte, allegati).</p>';
    }
    return (
      '<ul class="vc-wfc-list" role="list">' +
      state.messages
        .map(function (m) {
          var kind = String(m.authorKind || "staff").toLowerCase();
          var body = cleanText(m.content);
          if (kind === "system") {
            return (
              '<li class="vc-wfc-msg vc-wfc-msg--system" data-msg-id="' +
              esc(m.id) +
              '">' +
              '<div class="vc-wfc-system" role="status">' +
              '<span class="vc-wfc-system__label">Sistema</span>' +
              '<span class="vc-wfc-system__text">' +
              esc(body || "Aggiornamento") +
              "</span>" +
              '<time class="vc-wfc-system__time">' +
              esc(formatChatTime(m.createdAt)) +
              "</time></div></li>"
            );
          }
          var mine = String(m.authorId || "") === String(state.profileId || "");
          var userLabel = String(c("userKindLabel") || "Richiedente");
          var kindLabel = kind === "user" ? userLabel : "Staff";
          return (
            '<li class="vc-wfc-msg' +
            (mine ? " is-mine" : "") +
            (kind === "user" ? " is-requester" : "") +
            '" data-msg-id="' +
            esc(m.id) +
            '">' +
            '<span class="vc-wfc-msg__av">' +
            avatarHtml(m.authorAvatarUrl, m.authorId, { width: 28, height: 28 }) +
            "</span>" +
            '<div class="vc-wfc-msg__bubble">' +
            messageActionsHtml(m, !state.canSend) +
            '<div class="vc-wfc-msg__meta"><strong>' +
            esc(m.authorName || (kind === "user" ? "Richiedente" : "Staff")) +
            '</strong><span class="vc-wfc-role">' +
            esc(kindLabel) +
            "</span><time>" +
            esc(formatChatTime(m.createdAt)) +
            "</time></div>" +
            replyQuoteHtml(m) +
            (body
              ? '<div class="vc-wfc-msg__text">' + formatMessageHtml(body, { keepNewlines: true }) + "</div>"
              : "") +
            mediaGalleryHtml(m.imageUrls) +
            reactionsBarHtml(m, !state.canSend) +
            "</div></li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function composerReplyBarHtml() {
    if (!state.replyTo || !state.replyTo.id) return "";
    return (
      '<div class="vc-wfc-reply-bar" id="vc-wfc-reply-bar">' +
      '<span class="vc-wfc-reply-bar__label">Risposta a <strong>' +
      esc(state.replyTo.authorName || "messaggio") +
      "</strong></span>" +
      '<button type="button" class="vc-wfc-reply-bar__close" id="vc-wfc-reply-cancel" aria-label="Annulla risposta">&times;</button></div>'
    );
  }

  function composerPreviewsHtml() {
    if (!state.composerImages.length) return "";
    return (
      '<div class="vc-wfc-previews" id="vc-wfc-previews">' +
      state.composerImages
        .map(function (src, i) {
          return (
            '<div class="vc-wfc-preview">' +
            '<img src="' +
            esc(src) +
            '" alt="" />' +
            '<button type="button" class="vc-wfc-preview__rm" data-rm-preview="' +
            esc(String(i)) +
            '" aria-label="Rimuovi">&times;</button></div>'
          );
        })
        .join("") +
      "</div>"
    );
  }

  function subjectChatMeta() {
    return state.subjectChat && typeof state.subjectChat === "object" ? state.subjectChat : null;
  }

  function messageVisibleToSubjectClient(msg) {
    var meta = subjectChatMeta();
    if (!state.isSubject || state.isStaffReviewer) return true;
    if (!meta || !meta.inviteOnly) return true;
    var windows = Array.isArray(meta.windows) ? meta.windows : [];
    if (!windows.length) return false;
    var t = Date.parse(String(msg && msg.createdAt || ""));
    if (!Number.isFinite(t)) return false;
    return windows.some(function (w) {
      var from = Date.parse(String(w.joinedAt || ""));
      if (!Number.isFinite(from) || t < from) return false;
      if (!w.leftAt) return true;
      var to = Date.parse(String(w.leftAt || ""));
      return Number.isFinite(to) && t <= to;
    });
  }

  function subjectManageHtml() {
    var meta = subjectChatMeta();
    if (!state.isStaffReviewer || !meta || !meta.inviteOnly) return "";
    if (meta.canRemove) {
      return (
        '<button type="button" class="vc-wfc-subject-btn vc-wfc-subject-btn--rm" id="vc-wfc-subject-remove"' +
        (state.managingSubject ? " disabled" : "") +
        '>Rimuovi richiedente</button>'
      );
    }
    if (meta.canInvite) {
      return (
        '<button type="button" class="vc-wfc-subject-btn vc-wfc-subject-btn--add" id="vc-wfc-subject-invite"' +
        (state.managingSubject ? " disabled" : "") +
        '>Aggiungi richiedente</button>'
      );
    }
    if (meta.active) {
      return '<span class="vc-wfc-subject-badge">Richiedente in chat</span>';
    }
    return "";
  }

  function closedMessageText() {
    var meta = subjectChatMeta();
    if (state.isSubject && meta && meta.inviteOnly && meta.invited && !meta.active) {
      return "Non sei più nella discussione. Puoi ancora leggere i messaggi ricevuti mentre eri presente.";
    }
    return String(c("closedMessage") || "Chat in sola lettura: la pratica non è più in attesa.");
  }

  function renderPanel(item, tab) {
    var key = dedupeKeyFor(item, tab);
    if (!key) return "";
    var pending = String(item.status || state.status || "").toLowerCase() === "pending";
    var canSend = pending && state.canSend !== false;
    var err =
      state.error && state.dedupeKey === key
        ? '<p class="vc-wfc-error" role="alert">' + esc(state.error) + "</p>"
        : "";
    var sendClass = String(c("sendBtnClass") || "vc-wfc-send-btn");
    var panelTitle = String(c("panelTitle") || "Discussione");
    var panelHint = String(c("panelHint") || "Emoji · risposte · allegati · reazioni");
    var manage = subjectManageHtml();
    return (
      '<section class="vc-wfc" id="vc-wfc-root" data-dedupe-key="' +
      esc(key) +
      '" aria-label="Discussione pratica">' +
      '<div class="vc-wfc-head"><div class="vc-wfc-head__title"><h3>' +
      esc(panelTitle) +
      '</h3><span class="vc-wfc-hint">' +
      esc(panelHint) +
      "</span></div>" +
      (manage ? '<div class="vc-wfc-head__actions">' + manage + "</div>" : "") +
      "</div>" +
      '<div class="vc-wfc-scroll" id="vc-wfc-scroll">' +
      renderMessagesHtml() +
      "</div>" +
      err +
      (canSend
        ? '<form class="vc-wfc-composer" id="vc-wfc-form" autocomplete="off">' +
          composerReplyBarHtml() +
          composerPreviewsHtml() +
          '<div class="vc-wfc-composer__row">' +
          '<label class="vc-wfc-composer__attach" title="Allega immagine o video">' +
          '<i class="fa fa-picture-o" aria-hidden="true"></i>' +
          '<input type="file" id="vc-wfc-file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple hidden />' +
          "</label>" +
          '<button type="button" class="vc-wfc-composer__emoji" id="vc-wfc-emoji" title="Emoji"><i class="fa fa-smile-o" aria-hidden="true"></i></button>' +
          '<textarea id="vc-wfc-input" rows="2" maxlength="2000" placeholder="Scrivi un messaggio…"></textarea>' +
          '<button type="submit" class="' +
          esc(sendClass) +
          '" id="vc-wfc-send"' +
          (state.sending ? " disabled" : "") +
          ">Invia</button></div></form>"
        : '<p class="vc-wfc-closed">' + esc(closedMessageText()) + "</p>") +
      "</section>"
    );
  }

  function scrollToBottom() {
    var el = byId("vc-wfc-scroll");
    if (!el) return;
    try {
      el.scrollTop = el.scrollHeight;
    } catch (e) {}
  }

  function patchMessage(next) {
    if (!next || !next.id) return;
    var idx = state.messages.findIndex(function (m) {
      return String(m.id) === String(next.id);
    });
    if (idx >= 0) state.messages[idx] = next;
    else appendMessage(next);
  }

  function appendMessage(msg) {
    if (!msg || !msg.id) return;
    if (!messageVisibleToSubjectClient(msg)) return;
    if (
      state.messages.some(function (m) {
        return String(m.id) === String(msg.id);
      })
    ) {
      return;
    }
    state.messages.push(msg);
    state.messages.sort(function (a, b) {
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
  }

  function bindSubjectActions() {
    var inviteBtn = byId("vc-wfc-subject-invite");
    if (inviteBtn) {
      inviteBtn.addEventListener("click", function () {
        manageSubject("invite");
      });
    }
    var removeBtn = byId("vc-wfc-subject-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        manageSubject("remove");
      });
    }
  }

  function notifyUi(msg, isError) {
    var fn = c("notify");
    if (typeof fn === "function") {
      try {
        fn(String(msg || ""), Boolean(isError));
        return;
      } catch (e0) {}
    }
    if (global.VcSiteToast && typeof global.VcSiteToast.show === "function") {
      try {
        global.VcSiteToast.show(String(msg || ""), Boolean(isError));
      } catch (e1) {}
    }
  }

  function manageSubject(action) {
    if (!state.dedupeKey || state.managingSubject) return;
    state.managingSubject = true;
    state.error = "";
    refreshDom();
    fetchJson(apiBase() + "/subject", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ dedupeKey: state.dedupeKey, action: action }),
      timeoutMs: 15000,
    })
      .then(function (out) {
        state.managingSubject = false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          state.error = (out.data && out.data.message) || "Operazione non riuscita.";
          refreshDom();
          return;
        }
        if (out.data.subjectChat) state.subjectChat = out.data.subjectChat;
        state.error = "";
        if (out.data.message) notifyUi(out.data.message, false);
        loadMessages(state.dedupeKey, { silent: false });
      })
      .catch(function () {
        state.managingSubject = false;
        state.error = "Errore di rete sulla gestione chat.";
        refreshDom();
      });
  }

  function bindComposer() {
    var form = byId("vc-wfc-form");
    if (form) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        sendMessage();
      });
    }
    bindSubjectActions();
    var input = byId("vc-wfc-input");
    if (input) {
      input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          sendMessage();
        }
      });
    }
    var file = byId("vc-wfc-file");
    if (file) {
      file.addEventListener("change", onFilesSelected);
    }
    var emojiBtn = byId("vc-wfc-emoji");
    if (emojiBtn) {
      emojiBtn.addEventListener("click", openEmojiPickerForComposer);
    }
    var cancelReply = byId("vc-wfc-reply-cancel");
    if (cancelReply) {
      cancelReply.addEventListener("click", function () {
        state.replyTo = null;
        refreshDom();
      });
    }
    var scroll = byId("vc-wfc-scroll");
    if (scroll) {
      scroll.addEventListener("click", onChatClick);
    }
    var previews = byId("vc-wfc-previews");
    if (previews) {
      previews.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-rm-preview]");
        if (!btn) return;
        var i = Number(btn.getAttribute("data-rm-preview"));
        if (!Number.isFinite(i)) return;
        state.composerImages.splice(i, 1);
        refreshDom();
      });
    }
  }

  function onChatClick(ev) {
    var replyBtn = ev.target.closest("[data-reply-msg]");
    if (replyBtn) {
      var rid = replyBtn.getAttribute("data-reply-msg");
      var msg = state.messages.find(function (m) {
        return String(m.id) === String(rid);
      });
      if (msg) {
        state.replyTo = { id: msg.id, authorName: msg.authorName, content: cleanText(msg.content) || "Allegato" };
        refreshDom();
        var input = byId("vc-wfc-input");
        if (input) input.focus();
      }
      return;
    }
    var reactBtn = ev.target.closest("[data-react-msg]");
    if (reactBtn) {
      toggleReaction(reactBtn.getAttribute("data-react-msg"), reactBtn.getAttribute("data-react-emoji"));
      return;
    }
    var addBtn = ev.target.closest("[data-react-add]");
    if (addBtn) {
      openEmojiPickerForReaction(addBtn.getAttribute("data-react-add"));
    }
  }

  function ensureGuildEmojis(cb) {
    if (state.guildEmojis) {
      cb(state.guildEmojis);
      return;
    }
    var url =
      apiBase() +
      "/emojis?dedupeKey=" +
      encodeURIComponent(state.dedupeKey || "");
    fetchJson(url, { timeoutMs: 8000 })
      .then(function (out) {
        state.guildEmojis = out.res.ok && out.data && out.data.ok && Array.isArray(out.data.emojis) ? out.data.emojis : [];
        cb(state.guildEmojis);
      })
      .catch(function () {
        cb([]);
      });
  }

  function insertAtCursor(textarea, text) {
    if (!textarea) return;
    var start = textarea.selectionStart || 0;
    var end = textarea.selectionEnd || 0;
    var val = String(textarea.value || "");
    textarea.value = val.slice(0, start) + text + val.slice(end);
    var pos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    textarea.focus();
  }

  function openEmojiPickerForComposer(ev) {
    var anchor = ev && ev.currentTarget ? ev.currentTarget : byId("vc-wfc-emoji");
    var input = byId("vc-wfc-input");
    if (!global.VcEmojiPicker || !anchor) return;
    ensureGuildEmojis(function (emojis) {
      global.VcEmojiPicker.open({
        anchor: anchor,
        guildEmojis: emojis,
        preferCustom: true,
        onPick: function (pick) {
          if (pick.custom && global.VcEmojiPicker.formatCustom) {
            insertAtCursor(input, global.VcEmojiPicker.formatCustom(pick));
          } else if (pick.unicode) {
            insertAtCursor(input, pick.unicode);
          }
        },
      });
    });
  }

  function openEmojiPickerForReaction(messageId) {
    var msgEl = document.querySelector('[data-msg-id="' + messageId + '"] .vc-wfc-react--add');
    if (!global.VcEmojiPicker) return;
    ensureGuildEmojis(function (emojis) {
      global.VcEmojiPicker.open({
        anchor: msgEl || byId("vc-wfc-scroll"),
        guildEmojis: emojis,
        preferCustom: false,
        onPick: function (pick) {
          var emoji = pick.custom && global.VcEmojiPicker.formatCustom ? global.VcEmojiPicker.formatCustom(pick) : pick.unicode;
          if (emoji) toggleReaction(messageId, emoji);
        },
      });
    });
  }

  function onFilesSelected(ev) {
    var files = ev.target && ev.target.files ? Array.from(ev.target.files) : [];
    if (!files.length) return;
    var remain = Math.max(0, (state.maxImages || 3) - state.composerImages.length);
    files.slice(0, remain).forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        if (typeof reader.result === "string") {
          state.composerImages.push(reader.result);
          refreshDom();
        }
      };
      reader.readAsDataURL(file);
    });
    ev.target.value = "";
  }

  function sendMessage() {
    var input = byId("vc-wfc-input");
    if (!state.dedupeKey || !input || state.sending) return;
    var content = String(input.value || "").trim();
    var images = state.composerImages.slice();
    if (!content && !images.length) return;
    state.sending = true;
    state.error = "";
    refreshDom();
    var replyToId = state.replyTo && state.replyTo.id ? state.replyTo.id : undefined;
    fetchJson(apiBase(), {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ dedupeKey: state.dedupeKey, content: content, images: images, replyToId: replyToId }),
      timeoutMs: 20000,
    })
      .then(function (out) {
        state.sending = false;
        if (!out.res.ok || !out.data || !out.data.ok || !out.data.message) {
          state.error = (out.data && out.data.message) || "Invio non riuscito.";
          refreshDom();
          return;
        }
        input.value = "";
        state.composerImages = [];
        state.replyTo = null;
        appendMessage(out.data.message);
        refreshDom();
        scrollToBottom();
      })
      .catch(function () {
        state.sending = false;
        state.error = "Errore di rete sulla chat.";
        refreshDom();
      });
  }

  function toggleReaction(messageId, emoji) {
    if (!state.dedupeKey || !messageId || !emoji) return;
    fetchJson(apiBase() + "/reactions", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ dedupeKey: state.dedupeKey, messageId: messageId, emoji: emoji }),
      timeoutMs: 10000,
    })
      .then(function (out) {
        if (out.res.ok && out.data && out.data.ok && out.data.message) {
          patchMessage(out.data.message);
          refreshDom();
        }
      })
      .catch(function () {});
  }

  function realtimeWsUrl() {
    try {
      var base = apiBase();
      var u = new URL(base, location.origin);
      var parts = u.pathname.split("/");
      parts[parts.length - 1] = "site-realtime-ws";
      u.pathname = parts.join("/");
      u.search = "";
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      return u.toString();
    } catch (e) {
      return "";
    }
  }

  function connectWs(dedupeKey) {
    var url = realtimeWsUrl();
    if (!url || !global.WebSocket) {
      startPoll(dedupeKey);
      return;
    }
    try {
      if (state.ws) {
        state.ws.onclose = null;
        state.ws.close();
      }
    } catch (e0) {}
    var ws;
    try {
      ws = new WebSocket(url);
    } catch (e1) {
      startPoll(dedupeKey);
      return;
    }
    state.ws = ws;
    ws.onmessage = function (ev) {
      try {
        var data = JSON.parse(ev.data);
        if (!data || String(data.dedupeKey || "") !== String(dedupeKey)) return;
        if (data.type === "workflow_chat_message" && data.message) {
          appendMessage(data.message);
          refreshDom();
          scrollToBottom();
        } else if (data.type === "workflow_chat_reaction" && data.message) {
          if (messageVisibleToSubjectClient(data.message)) {
            patchMessage(data.message);
            refreshDom();
          }
        } else if (data.type === "workflow_chat_subject") {
          if (data.subjectChat) state.subjectChat = data.subjectChat;
          loadMessages(dedupeKey, { silent: true });
        }
      } catch (e2) {}
    };
    ws.onerror = function () {};
    ws.onclose = function () {
      if (state.dedupeKey !== dedupeKey) return;
      startPoll(dedupeKey);
      setTimeout(function () {
        if (state.dedupeKey === dedupeKey) connectWs(dedupeKey);
      }, 4000);
    };
  }

  function startPoll(dedupeKey) {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(function () {
      if (state.dedupeKey !== dedupeKey || document.hidden) return;
      loadMessages(dedupeKey, { silent: true });
    }, 12000);
  }

  function loadMessages(dedupeKey, opts) {
    opts = opts || {};
    var seq = state.seq;
    var url = apiBase() + "?dedupeKey=" + encodeURIComponent(dedupeKey);
    return fetchJson(url, { timeoutMs: 8000 })
      .then(function (out) {
        if (seq !== state.seq || state.dedupeKey !== dedupeKey) return;
        if (!out.res.ok || !out.data || !out.data.ok) {
          if (!opts.silent) {
            state.error = (out.data && out.data.message) || "Chat non disponibile.";
            state.loading = false;
            refreshDom();
          }
          return;
        }
        state.loading = false;
        state.error = "";
        state.canSend = Boolean(out.data.canSend);
        state.maxImages = Number(out.data.maxImages) || 3;
        state.isStaffReviewer = Boolean(out.data.isStaffReviewer);
        state.isSubject = Boolean(out.data.isSubject);
        state.status = String(out.data.status || "pending");
        state.subjectChat = out.data.subjectChat || null;
        state.messages = Array.isArray(out.data.messages) ? out.data.messages.slice() : [];
        refreshDom();
        if (!opts.silent) scrollToBottom();
      })
      .catch(function () {
        if (seq !== state.seq || state.dedupeKey !== dedupeKey) return;
        if (!opts.silent) {
          state.loading = false;
          state.error = "Errore di rete sulla chat.";
          refreshDom();
        }
      });
  }

  function refreshDom() {
    var root = byId("vc-wfc-root");
    if (!root) return;
    var scroll = byId("vc-wfc-scroll");
    var nearBottom = scroll ? scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 48 : true;
    var item = { status: state.status || "pending", dedupeKey: state.dedupeKey };
    var wrap = document.createElement("div");
    wrap.innerHTML = renderPanel(item, state.tab);
    var fresh = wrap.firstChild;
    if (!fresh) return;
    root.replaceWith(fresh);
    bindComposer();
    if (nearBottom) scrollToBottom();
  }

  function teardown() {
    state.seq += 1;
    state.dedupeKey = "";
    state.tab = "";
    state.messages = [];
    state.canSend = false;
    state.loading = false;
    state.sending = false;
    state.managingSubject = false;
    state.error = "";
    state.replyTo = null;
    state.composerImages = [];
    state.isStaffReviewer = false;
    state.isSubject = false;
    state.subjectChat = null;
    state.status = "pending";
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    if (state.ws) {
      try {
        state.ws.onclose = null;
        state.ws.onmessage = null;
        state.ws.close();
      } catch (e) {}
      state.ws = null;
    }
  }

  function boot(item, tab) {
    var key = dedupeKeyFor(item, tab);
    if (!key) {
      teardown();
      return;
    }
    state.profileId = c("getProfileId") ? String(c("getProfileId")() || "") : "";
    var sameKey = state.dedupeKey === key;
    if (sameKey && byId("vc-wfc-root")) {
      bindComposer();
      if (!state.messages.length && !state.loading) loadMessages(key);
      return;
    }
    if (sameKey && (state.messages.length || state.loading)) {
      refreshDom();
      bindComposer();
      return;
    }
    teardown();
    state.dedupeKey = key;
    state.tab = tab || "";
    state.loading = true;
    state.canSend = String(item.status || "").toLowerCase() === "pending";
    bindComposer();
    loadMessages(key);
    connectWs(key);
  }

  function init(config) {
    cfg = config || {};
  }

  global.VcWorkflowChat = {
    init: init,
    teardown: teardown,
    boot: boot,
    renderPanel: renderPanel,
    refreshDom: refreshDom,
  };
})(window);
