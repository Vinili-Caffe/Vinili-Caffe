(function (global) {
  "use strict";
  /* siteChatLagAll1: refreshDom soft-patch messaggi (no remount composer su poll/WS) */

  var cfg = null;
  var state = {
    dedupeKey: "",
    tab: "",
    messages: [],
    // null = unknown (pre-boot). false only after API/boot says closed.
    canSend: null,
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
    draftText: "",
    draftSelStart: null,
    draftSelEnd: null,
    guildEmojis: null,
    profileId: "",
    isStaffReviewer: false,
    isSubject: false,
    subjectChat: null,
    status: "pending",
    typingRoom: null,
    mentionNames: {},
    mentionMenu: { open: false, q: "", items: [], index: 0, mode: "user", filter: "all", loading: false },
    mentionTimer: null,
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
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        return window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eSite) {}
    return (
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>',
      )
    );
  }

  function avatarHtml(url, id, opts) {
    var fn = c("avatarHtml");
    if (fn) return fn(url, id, opts);
    opts = opts || {};
    var cls = String(opts.className || "vc-wfc-avatar").trim() || "vc-wfc-avatar";
    var w = Number(opts.width) || 28;
    var h = Number(opts.height) || 28;
    var uid = String(id || "").trim();
    var siteFb = defaultAvatarUrl(uid);
    var raw = String(url || "").trim();
    if (/cdn\.discordapp\.com\/embed\/avatars\//i.test(raw)) raw = "";
    var src = raw || siteFb;
    var onerr =
      "this.onerror=null;this.src='" + siteFb.replace(/'/g, "%27") + "';";
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
      .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/[*_`~|]+/g, "")
      .trim();
  }

  function plainPreviewText(text) {
    return cleanText(text)
      .replace(/<@!?(\d{5,32})>/g, function (_m, id) {
        return "@" + resolveMentionName("user", id);
      })
      .replace(/<@&(\d{5,32})>/g, function (_m, id) {
        return "@" + resolveMentionName("role", id);
      })
      .replace(/<#(\d{5,32})>/g, function (_m, id) {
        return "#" + resolveMentionName("channel", id);
      })
      .replace(/\s+/g, " ")
      .trim();
  }

  function rememberMentionName(type, id, name) {
    var cleaned = String(name || "")
      .replace(/^[@#]+/, "")
      .trim();
    if (!cleaned || !id) return;
    if (!state.mentionNames) state.mentionNames = {};
    state.mentionNames[String(type) + ":" + String(id)] = cleaned;
  }

  function resolveMentionName(type, id) {
    var key = String(type) + ":" + String(id);
    if (state.mentionNames && state.mentionNames[key]) return state.mentionNames[key];
    if (type === "role") return "ruolo";
    if (type === "channel") return "canale";
    return "utente";
  }

  function seedMentionNamesFromMessages(list) {
    (Array.isArray(list) ? list : []).forEach(function (m) {
      if (!m) return;
      if (m.authorId && m.authorName) rememberMentionName("user", m.authorId, m.authorName);
      if (m.replyTo && m.replyTo.authorName && m.replyTo.id) {
        /* reply preview only */
      }
    });
  }

  function formatBodyWithMentions(text) {
    var raw = String(text || "");
    var tokens = [];
    var withPlaceholders = raw.replace(/<@!?(\d{5,32})>|<@&(\d{5,32})>|<#(\d{5,32})>/g, function (_all, uid, rid, cid) {
      var i = tokens.length;
      if (uid) {
        tokens.push(
          '<span class="vc-wt-msg-mention vc-wt-msg-mention--user" data-mention-user="' +
            esc(uid) +
            '">@' +
            esc(resolveMentionName("user", uid)) +
            "</span>",
        );
      } else if (rid) {
        tokens.push(
          '<span class="vc-wt-msg-mention vc-wt-msg-mention--role" data-mention-role="' +
            esc(rid) +
            '">@' +
            esc(resolveMentionName("role", rid)) +
            "</span>",
        );
      } else {
        tokens.push(
          '<span class="vc-wt-msg-mention vc-wt-msg-mention--channel" data-mention-channel="' +
            esc(cid) +
            '">#' +
            esc(resolveMentionName("channel", cid)) +
            "</span>",
        );
      }
      return "{{M" + i + "}}";
    });
    var html = formatMessageHtml(withPlaceholders, { keepNewlines: true });
    tokens.forEach(function (tok, i) {
      html = html.split("{{M" + i + "}}").join(tok);
    });
    return html;
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
            '" alt="" width="320" height="180" loading="lazy" decoding="async" />' +
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
        '" data-vc-avatar="0" alt="" width="16" height="16" />'
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
      esc(plainPreviewText(m.replyTo.content) || m.replyTo.content || "") +
      "</span></div>"
    );
  }

  function messageActionsHtml(m, closed) {
    if (String(m.authorKind || "") === "system") return "";
    var mine = String(m.authorId || "") === String(state.profileId || "");
    var canCopy = Boolean(plainPreviewText(m.content));
    var canEdit = !closed && mine && state.canSend !== false;
    var canDelete = canEdit;
    var canReply = !closed && state.canSend !== false;
    if (!canCopy && !canEdit && !canDelete && !canReply) return "";
    return (
      '<div class="vc-wfc-msg__tools">' +
      (canReply
        ? '<button type="button" class="vc-wfc-msg__tool" data-reply-msg="' +
          esc(m.id) +
          '" title="Rispondi" aria-label="Rispondi"><i class="fa fa-reply" aria-hidden="true"></i></button>'
        : "") +
      (canCopy
        ? '<button type="button" class="vc-wfc-msg__tool" data-copy-msg="' +
          esc(m.id) +
          '" title="Copia testo" aria-label="Copia testo"><i class="fa fa-clipboard" aria-hidden="true"></i></button>'
        : "") +
      (canEdit
        ? '<button type="button" class="vc-wfc-msg__tool" data-edit-msg="' +
          esc(m.id) +
          '" title="Modifica" aria-label="Modifica"><i class="fa fa-pencil" aria-hidden="true"></i></button>'
        : "") +
      (canDelete
        ? '<button type="button" class="vc-wfc-msg__tool vc-wfc-msg__tool--danger" data-del-msg="' +
          esc(m.id) +
          '" title="Elimina" aria-label="Elimina"><i class="fa fa-trash-o" aria-hidden="true"></i></button>'
        : "") +
      "</div>"
    );
  }

  function renderOneMessageHtml(m) {
    if (!m || !m.id) return "";
    var kind = String(m.authorKind || "staff").toLowerCase();
    var body = String(m.content || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, "");
    if (kind === "system") {
      return (
        '<li class="vc-wfc-msg vc-wfc-msg--system" data-msg-id="' +
        esc(m.id) +
        '">' +
        '<div class="vc-wfc-system" role="status">' +
        '<span class="vc-wfc-system__label">Sistema</span>' +
        '<span class="vc-wfc-system__text">' +
        esc(plainPreviewText(body) || "Aggiornamento") +
        "</span>" +
        '<time class="vc-wfc-system__time">' +
        esc(formatChatTime(m.createdAt)) +
        "</time></div></li>"
      );
    }
    var mine = String(m.authorId || "") === String(state.profileId || "");
    var userLabel = String(c("userKindLabel") || "Richiedente");
    var roleLabel = String(m.authorRoleLabel || "").trim();
    var kindLabel =
      kind === "user" ? userLabel : roleLabel || String(c("staffKindLabel") || "").trim() || "Staff";
    return (
      '<li class="vc-wfc-msg' +
      (mine ? " is-mine" : "") +
      (kind === "user" ? " is-requester" : "") +
      '" data-msg-id="' +
      esc(m.id) +
      '">' +
      '<span class="vc-wfc-msg__av">' +
      avatarHtml(m.authorAvatarUrl, m.authorId, {
        width: 28,
        height: 28,
        className: "vc-wfc-avatar",
      }) +
      "</span>" +
      '<div class="vc-wfc-msg__bubble">' +
      messageActionsHtml(m, !state.canSend) +
      '<div class="vc-wfc-msg__meta"><strong>' +
      esc(m.authorName || (kind === "user" ? "Richiedente" : "Staff")) +
      '</strong><span class="vc-wfc-role">' +
      esc(kindLabel) +
      "</span><time>" +
      esc(formatChatTime(m.createdAt)) +
      "</time>" +
      receiptTicksHtml(m, mine) +
      (m.editedAt ? '<span class="vc-wfc-msg__edited">(modificato)</span>' : "") +
      "</div>" +
      replyQuoteHtml(m) +
      (body ? '<div class="vc-wfc-msg__text">' + formatBodyWithMentions(body) + "</div>" : "") +
      mediaGalleryHtml(m.imageUrls) +
      reactionsBarHtml(m, !state.canSend) +
      "</div></li>"
    );
  }

  function renderMessagesHtml() {
    if (state.loading && !state.messages.length) {
      return '<p class="vc-wfc-empty">Caricamento chat…</p>';
    }
    if (!state.messages.length) {
      if (c("forceReadOnly") === true || state.canSend === false) {
        return (
          '<p class="vc-wfc-empty">' +
          esc(String(c("emptyReadOnlyMessage") || "Nessun messaggio in discussione.")) +
          "</p>"
        );
      }
      return '<p class="vc-wfc-empty">Nessun messaggio. Scrivi qui come su Discord (emoji, risposte, allegati).</p>';
    }
    return (
      '<ul class="vc-wfc-list" role="list">' +
      state.messages.map(renderOneMessageHtml).join("") +
      "</ul>"
    );
  }

  function panelShellKey() {
    var forceReadOnly = c("forceReadOnly") === true;
    var item = { status: state.status || "pending", dedupeKey: state.dedupeKey };
    var canSend = panelCanSend(item, state.dedupeKey);
    var meta = subjectChatMeta();
    var subj = "";
    if (state.isStaffReviewer && meta && meta.inviteOnly) {
      subj = [
        meta.canRemove ? "rm" : "",
        meta.canInvite ? "inv" : "",
        meta.active ? "on" : "",
      ].join("");
    }
    return [
      String(state.dedupeKey || ""),
      forceReadOnly ? "1" : "0",
      canSend ? "1" : "0",
      state.replyTo && state.replyTo.id ? String(state.replyTo.id) : "",
      String((state.composerImages || []).length),
      subj,
    ].join("|");
  }

  function patchErrorDom(root) {
    if (!root) return;
    var existing = null;
    var kids = root.children;
    for (var i = 0; i < kids.length; i += 1) {
      if (kids[i].classList && kids[i].classList.contains("vc-wfc-error")) {
        existing = kids[i];
        break;
      }
    }
    var want = state.error && state.dedupeKey ? String(state.error) : "";
    if (!want) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return;
    }
    if (!existing) {
      existing = document.createElement("p");
      existing.className = "vc-wfc-error";
      existing.setAttribute("role", "alert");
      var form = byId("vc-wfc-form");
      var closed = root.querySelector(".vc-wfc-closed");
      var before = form || closed;
      if (before) root.insertBefore(existing, before);
      else root.appendChild(existing);
    }
    existing.textContent = want;
  }

  function syncMessagesDom() {
    var scroll = byId("vc-wfc-scroll");
    if (!scroll) return false;
    var nextFp = messagesFingerprint(state.messages);
    var prevFp = scroll.getAttribute("data-vc-msg-fp") || "";
    if (prevFp === nextFp && scroll.querySelector(".vc-wfc-list")) return true;
    if ((state.loading && !state.messages.length) || !state.messages.length) {
      scroll.innerHTML = renderMessagesHtml();
      scroll.setAttribute("data-vc-msg-fp", nextFp);
      return true;
    }
    var list = scroll.querySelector(".vc-wfc-list");
    if (!list) {
      scroll.innerHTML = renderMessagesHtml();
      scroll.setAttribute("data-vc-msg-fp", nextFp);
      return true;
    }
    var oldIds = [];
    var kids = list.children;
    for (var i = 0; i < kids.length; i += 1) {
      if (!kids[i].getAttribute) continue;
      var oid = String(kids[i].getAttribute("data-msg-id") || "");
      if (oid) oldIds.push(oid);
    }
    var newIds = state.messages.map(function (m) {
      return String((m && m.id) || "");
    });
    var canAppend =
      newIds.length > oldIds.length &&
      oldIds.every(function (id, idx) {
        return id === newIds[idx];
      });
    if (canAppend) {
      for (var j = oldIds.length; j < state.messages.length; j += 1) {
        list.insertAdjacentHTML("beforeend", renderOneMessageHtml(state.messages[j]));
      }
      scroll.setAttribute("data-vc-msg-fp", nextFp);
      return true;
    }
    scroll.innerHTML = renderMessagesHtml();
    scroll.setAttribute("data-vc-msg-fp", nextFp);
    return true;
  }

  function receiptTicksHtml(m, mine) {
    if (!mine) return "";
    var read =
      m.read === true ||
      String(m.receiptStatus || "").toLowerCase() === "read" ||
      (Array.isArray(m.readBy) &&
        m.readBy.some(function (r) {
          return String((r && r.userId) || "") && String(r.userId) !== String(m.authorId || "");
        }));
    var label = read ? "Letto" : "Inviato";
    return (
      '<span class="vc-msg-ticks' +
      (read ? " is-read" : " is-sent") +
      '" title="' +
      label +
      '" aria-label="' +
      label +
      '">' +
      '<svg class="vc-msg-ticks__svg" viewBox="0 0 16 11" width="16" height="11" aria-hidden="true" focusable="false">' +
      (read
        ? '<path d="M11.1 1.1 5.6 7.2 3.1 4.8l-1.2 1.2 3.7 3.7 6.7-7.4z"/><path d="M14.4 1.1 8.9 7.2 7.6 5.9l-1.1 1.2 2.4 2.4 6.7-7.4z"/>'
        : '<path d="M13.2 1.1 6.5 8.5 2.8 4.9 1.6 6.1 6.5 11l8-8.7z"/>') +
      "</svg></span>"
    );
  }

  function applyReceiptsToOwnMessages(messageIds, readerId) {
    var ids = Array.isArray(messageIds) ? messageIds : [];
    if (!ids.length) return;
    var idSet = {};
    for (var i = 0; i < ids.length; i += 1) idSet[String(ids[i])] = 1;
    var reader = String(readerId || "").trim();
    var changed = false;
    state.messages = state.messages.map(function (m) {
      if (!m || !idSet[String(m.id || "")]) return m;
      if (String(m.authorId || "") !== String(state.profileId || "")) return m;
      if (m.read === true || String(m.receiptStatus || "") === "read") return m;
      changed = true;
      var next = Object.assign({}, m, { read: true, receiptStatus: "read" });
      if (reader) {
        var rb = Array.isArray(m.readBy) ? m.readBy.slice() : [];
        if (
          !rb.some(function (r) {
            return String((r && r.userId) || "") === reader;
          })
        ) {
          rb.push({ userId: reader, at: new Date().toISOString() });
        }
        next.readBy = rb;
      }
      return next;
    });
    if (!changed) return;
    for (var j = 0; j < ids.length; j += 1) {
      var mid = String(ids[j] || "");
      var node = document.querySelector('.vc-wfc-msg[data-msg-id="' + mid + '"] .vc-msg-ticks');
      if (!node) continue;
      node.classList.remove("is-sent");
      node.classList.add("is-read");
      node.setAttribute("title", "Letto");
      node.setAttribute("aria-label", "Letto");
      node.innerHTML =
        '<svg class="vc-msg-ticks__svg" viewBox="0 0 16 11" width="16" height="11" aria-hidden="true" focusable="false">' +
        '<path d="M11.1 1.1 5.6 7.2 3.1 4.8l-1.2 1.2 3.7 3.7 6.7-7.4z"/><path d="M14.4 1.1 8.9 7.2 7.6 5.9l-1.1 1.2 2.4 2.4 6.7-7.4z"/>' +
        "</svg>";
    }
  }

  function markChatRead(messageIds) {
    if (!state.dedupeKey) return;
    var token = "";
    try {
      if (typeof c("getToken") === "function") token = String(c("getToken")() || "");
    } catch (eTok) {}
    if (!token) {
      try {
        token = String(localStorage.getItem("vc_discord_access_token") || "");
      } catch (eLs) {}
    }
    if (!token) return;
    var body = { dedupeKey: state.dedupeKey };
    if (Array.isArray(messageIds) && messageIds.length) body.messageIds = messageIds.slice(0, 80);
    fetchJson(apiBase() + "/read", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: 12000,
    }).catch(function () {});
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
    if (c("forceReadOnly") === true) {
      return String(c("closedMessage") || "Discussione in sola lettura.");
    }
    var meta = subjectChatMeta();
    if (state.isSubject && meta && meta.inviteOnly && meta.invited && !meta.active) {
      return "Non sei più nella discussione. Puoi ancora leggere i messaggi ricevuti mentre eri presente.";
    }
    return String(c("closedMessage") || "Chat in sola lettura: la pratica non è più in attesa.");
  }

  function itemIsPending(item) {
    return String((item && item.status) || state.status || "").toLowerCase() === "pending";
  }

  function panelCanSend(item, key) {
    if (c("forceReadOnly") === true) return false;
    if (!itemIsPending(item)) return false;
    // inboxReadonly1: before boot (or different key) canSend is null/stale —
    // do not treat initial false as closed or every discussion opens read-only.
    var keyed = Boolean(state.dedupeKey) && String(state.dedupeKey) === String(key || "");
    if (!keyed || state.canSend == null) return true;
    return state.canSend !== false;
  }

  function renderPanel(item, tab) {
    var key = dedupeKeyFor(item, tab);
    if (!key) return "";
    var forceReadOnly = c("forceReadOnly") === true;
    var canSend = panelCanSend(item, key);
    var err =
      state.error && state.dedupeKey === key
        ? '<p class="vc-wfc-error" role="alert">' + esc(state.error) + "</p>"
        : "";
    var sendClass = String(c("sendBtnClass") || "vc-wfc-send-btn");
    var panelTitle = String(c("panelTitle") || "Discussione");
    // Only archive/force mode uses the "Solo lettura \u00B7 cronologia" copy.
    var panelHint = forceReadOnly
      ? "Solo lettura \u00B7 cronologia completa"
      : canSend
        ? String(c("panelHint") || "Emoji \u00B7 @utenti \u00B7 #canali \u00B7 risposte \u00B7 allegati")
        : String(c("closedHint") || c("panelHint") || "Discussione chiusa");
    var manage = forceReadOnly || !canSend ? "" : subjectManageHtml();
    return (
      '<section class="vc-wfc' +
      (forceReadOnly || !canSend ? " vc-wfc--readonly" : "") +
      '" id="vc-wfc-root" data-dedupe-key="' +
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
          '<input type="file" id="vc-wfc-file" name="wfcAttachments" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple hidden />' +
          "</label>" +
          '<button type="button" class="vc-wfc-composer__emoji" id="vc-wfc-emoji" title="Emoji"><i class="fa fa-smile-o" aria-hidden="true"></i></button>' +
          '<textarea id="vc-wfc-input" name="wfcMessage" rows="2" maxlength="2000" enterkeyhint="send" placeholder="Scrivi… (@ utenti, # canali)" autocomplete="off"></textarea>' +
          '<button type="submit" class="' +
          esc(sendClass) +
          '" id="vc-wfc-send"' +
          (state.sending ? " disabled" : "") +
          ">Invia</button></div>" +
          '<div id="vc-wfc-typing" class="vc-chat-typing" hidden aria-live="polite"></div></form>'
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
    /* Soft dedupe: same author+content within 15s (WS + POST race / double-send). */
    try {
      var content = String(msg.content || "").trim();
      var authorId = String(msg.authorId || "").trim();
      var created = Date.parse(String(msg.createdAt || "")) || Date.now();
      if (content && authorId) {
        var dup = state.messages.some(function (m) {
          if (!m || String(m.id) === String(msg.id)) return false;
          if (String(m.authorId || "") !== authorId) return false;
          if (String(m.content || "").trim() !== content) return false;
          var t = Date.parse(String(m.createdAt || "")) || 0;
          return Math.abs(created - t) < 15000;
        });
        if (dup) return;
      }
    } catch (eDedup) {}
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
      input.addEventListener("input", function () {
        captureDraft();
        scheduleMentionSuggest(input);
        pulseWorkflowTyping(Boolean(String(state.draftText || "").trim()));
      });
      input.addEventListener("keydown", function (ev) {
        if (state.mentionMenu.open) {
          if (ev.key === "ArrowDown" && state.mentionMenu.items.length) {
            ev.preventDefault();
            state.mentionMenu.index = (state.mentionMenu.index + 1) % state.mentionMenu.items.length;
            renderMentionMenu();
            return;
          }
          if (ev.key === "ArrowUp" && state.mentionMenu.items.length) {
            ev.preventDefault();
            state.mentionMenu.index =
              (state.mentionMenu.index - 1 + state.mentionMenu.items.length) % state.mentionMenu.items.length;
            renderMentionMenu();
            return;
          }
          if ((ev.key === "Enter" || ev.key === "Tab") && state.mentionMenu.items.length) {
            ev.preventDefault();
            applyMentionPick(state.mentionMenu.items[state.mentionMenu.index]);
            return;
          }
          if (ev.key === "Escape") {
            ev.preventDefault();
            hideMentionMenu();
            return;
          }
        }
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
    var typingEl = byId("vc-wfc-typing");
    if (typingEl && state.typingRoom) state.typingRoom.renderInto(typingEl);
  }

  function mentionTriggerContext(textarea) {
    if (!textarea) return null;
    var val = String(textarea.value || "");
    var caret = Number(textarea.selectionStart);
    if (!Number.isFinite(caret)) caret = val.length;
    var before = val.slice(0, caret);
    var line = before.split("\n").pop() || "";
    var channel = line.match(/#([^\s#]*)$/);
    if (channel) return { kind: "channel", q: channel[1] || "" };
    var mention = line.match(/@([^\s@]*)$/);
    if (mention) return { kind: "mention", q: mention[1] || "" };
    return null;
  }

  function scheduleMentionSuggest(textarea) {
    var ctx = mentionTriggerContext(textarea);
    if (!ctx) {
      hideMentionMenu();
      return;
    }
    if (state.mentionTimer) clearTimeout(state.mentionTimer);
    state.mentionTimer = setTimeout(function () {
      state.mentionTimer = null;
      fetchMentions(ctx.q, ctx.kind === "channel" ? "channel" : "user");
    }, 120);
  }

  var mentionFloatBound = false;

  function ensureMentionMenu() {
    var menu = byId("vc-wfc-mention-menu");
    if (menu && menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
    if (menu) return menu;
    menu = document.createElement("div");
    menu.id = "vc-wfc-mention-menu";
    menu.className = "vc-wt-mention-menu vc-wfc-mention-menu";
    menu.hidden = true;
    document.body.appendChild(menu);
    return menu;
  }

  /* pickerFloatFix1: riposiziona @/# su scroll/resize/visualViewport (mobile) */
  function syncMentionMenuFloat() {
    if (!(state.mentionMenu && state.mentionMenu.open)) return;
    if (window.__vcWfcMentionRaf) return;
    window.__vcWfcMentionRaf = window.requestAnimationFrame(function () {
      window.__vcWfcMentionRaf = 0;
      positionMentionMenu();
    });
  }

  function bindMentionFloatListeners() {
    if (mentionFloatBound) return;
    mentionFloatBound = true;
    window.addEventListener("resize", syncMentionMenuFloat, { passive: true });
    window.addEventListener("scroll", syncMentionMenuFloat, { passive: true, capture: true });
    try {
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", syncMentionMenuFloat, { passive: true });
        window.visualViewport.addEventListener("scroll", syncMentionMenuFloat, { passive: true });
      }
    } catch (eVv) {}
  }

  function hideMentionMenu() {
    state.mentionMenu = {
      open: false,
      q: "",
      items: [],
      index: 0,
      mode: "user",
      filter: state.mentionMenu.filter || "all",
      loading: false,
    };
    var menu = byId("vc-wfc-mention-menu");
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = "";
    }
  }

  function positionMentionMenu() {
    var menu = ensureMentionMenu();
    var input = byId("vc-wfc-input");
    if (!menu || !input || menu.hidden) return;
    bindMentionFloatListeners();
    var rect = input.getBoundingClientRect();
    var row = (input.closest && input.closest(".vc-wfc-composer__row")) || input;
    var widthRect = row.getBoundingClientRect ? row.getBoundingClientRect() : rect;
    var vv = window.visualViewport;
    var vpTop = vv && vv.offsetTop != null ? Number(vv.offsetTop) || 0 : 0;
    var vpH = vv && vv.height ? Number(vv.height) : window.innerHeight || 0;
    var vpW = vv && vv.width ? Number(vv.width) : window.innerWidth || 0;
    var vpLeft = vv && vv.offsetLeft != null ? Number(vv.offsetLeft) || 0 : 0;
    var gap = 8;
    var visibleTop = vpTop + gap;
    var visibleBottom = vpTop + vpH - gap;
    var layoutH = (document.documentElement && document.documentElement.clientHeight) || window.innerHeight || 0;
    var keyboardOpen = layoutH > 0 && vpH > 0 && vpH < layoutH * 0.85;
    var wantMax = state.mentionMenu.mode === "channel" ? 360 : 280;
    var spaceAbove = Math.max(0, rect.top - visibleTop);
    var spaceBelow = Math.max(0, visibleBottom - rect.bottom);
    var preferAbove = keyboardOpen || spaceAbove >= 96 || spaceAbove >= spaceBelow;
    if (preferAbove && spaceAbove < 72 && spaceBelow > spaceAbove + 24) preferAbove = false;
    var maxH = Math.min(wantMax, Math.max(96, (preferAbove ? spaceAbove : spaceBelow) - gap));
    var width = Math.min(Math.max(widthRect.width || rect.width || 240, 240), Math.max(200, vpW - gap * 2));
    var left = Math.max(vpLeft + gap, Math.min(widthRect.left, vpLeft + vpW - width - gap));
    menu.style.position = "fixed";
    menu.style.zIndex = "200000";
    menu.style.left = Math.round(left) + "px";
    menu.style.width = Math.round(width) + "px";
    menu.style.maxHeight = Math.round(maxH) + "px";
    menu.style.bottom = "auto";
    menu.style.visibility = "hidden";
    var menuH = 0;
    try {
      menuH = Math.ceil(menu.getBoundingClientRect().height || menu.offsetHeight || 0);
    } catch (e) {
      menuH = 0;
    }
    if (!menuH) menuH = Math.min(maxH, 56);
    menuH = Math.min(menuH, maxH);
    var top;
    if (preferAbove) {
      top = rect.top - menuH - gap;
      if (top < visibleTop) {
        if (spaceBelow > spaceAbove) {
          top = rect.bottom + gap;
        } else {
          top = visibleTop;
        }
      }
    } else {
      top = rect.bottom + gap;
      if (top + Math.min(96, menuH) > visibleBottom) {
        top = Math.max(visibleTop, rect.top - menuH - gap);
      }
    }
    menu.style.top = Math.round(Math.max(visibleTop, Math.min(top, visibleBottom - Math.min(menuH, maxH)))) + "px";
    menu.style.visibility = "visible";
    menu.setAttribute("data-vc-float", "pickerFloatFix1");
  }

  function wireMentionMenuFilters(menu) {
    if (!menu) return;
    menu.querySelectorAll("[data-mention-filter]").forEach(function (btn) {
      if (btn._vcWfcFilterWired) return;
      btn._vcWfcFilterWired = true;
      btn.addEventListener("mousedown", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var next = String(btn.getAttribute("data-mention-filter") || "all");
        if (next === String(state.mentionMenu.filter || "all")) return;
        state.mentionMenu.filter = next;
        fetchMentions(state.mentionMenu.q || "", state.mentionMenu.mode || "user");
      });
    });
  }

  function renderMentionMenu() {
    var menu = ensureMentionMenu();
    var mode = state.mentionMenu.mode || "user";
    var filter = state.mentionMenu.filter || "all";
    var showFilters = mode !== "channel" && state.isStaffReviewer;
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
              '">' +
              f.label +
              "</button>"
            );
          })
          .join("") +
        "</div>"
      : "";
    if (!state.mentionMenu.open) {
      menu.hidden = true;
      menu.innerHTML = "";
      return;
    }
    if (state.mentionMenu.loading) {
      menu.hidden = false;
      menu.innerHTML =
        filtersHtml +
        '<p class="vc-wt-mention-menu__hint">' +
        (mode === "channel" ? "Caricamento canali…" : "Caricamento menzioni…") +
        "</p>";
      wireMentionMenuFilters(menu);
      positionMentionMenu();
      return;
    }
    var items = state.mentionMenu.items || [];
    if (!items.length) {
      menu.hidden = false;
      menu.innerHTML =
        filtersHtml +
        '<p class="vc-wt-mention-menu__hint">' +
        (mode === "channel" ? "Nessun canale trovato" : "Nessuna menzione trovata") +
        "</p>";
      wireMentionMenuFilters(menu);
      positionMentionMenu();
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
          var avMark = type === "role" ? "R" : type === "channel" ? "#" : "@";
          var av =
            type === "user" && it.avatarUrl
              ? '<img class="vc-wt-mention-menu__av" src="' + esc(it.avatarUrl) + '" alt="" />'
              : '<span class="vc-wt-mention-menu__av vc-wt-mention-menu__av--fallback">' + avMark + "</span>";
          var prefix = type === "channel" ? "#" : "@";
          var sub = type === "role" ? "Ruolo" : type === "channel" ? it.channelKind || "Canale" : it.username || "Utente";
          if (type === "channel" && it.parentName) sub += " \u00B7 " + it.parentName;
          if (type === "user" && it.roleName) sub = it.roleName + (it.username ? " \u00B7 @" + it.username : "");
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
    menu.querySelectorAll("[data-mention-idx]").forEach(function (btn) {
      if (btn._vcWfcPickWired) return;
      btn._vcWfcPickWired = true;
      function pick(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        var i = Number(btn.getAttribute("data-mention-idx"));
        applyMentionPick((state.mentionMenu.items || [])[i]);
      }
      btn.addEventListener("mousedown", pick);
      btn.addEventListener("click", pick);
    });
    positionMentionMenu();
  }

  function applyMentionPick(item) {
    if (!item) return;
    var input = byId("vc-wfc-input");
    if (!input) return;
    var type = String(item.type || "user");
    var id = String(item.id || "").trim();
    if (!id) return;
    var markup = String(item.markup || "").trim();
    if (!markup) {
      if (type === "channel") markup = "<#" + id + ">";
      else if (type === "role") markup = "<@&" + id + ">";
      else markup = "<@" + id + ">";
    }
    rememberMentionName(type, id, item.name);
    var trigger = type === "channel" ? "#" : "@";
    var q = String(state.mentionMenu.q != null ? state.mentionMenu.q : "");
    var caret = Number(input.selectionStart);
    if (!Number.isFinite(caret)) caret = String(input.value || "").length;
    var val = String(input.value || "");
    var before = val.slice(0, caret);
    var after = val.slice(caret);
    var re = new RegExp(trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$");
    if (re.test(before)) before = before.replace(re, markup + " ");
    else before = before + markup + " ";
    input.value = before + after;
    var pos = before.length;
    input.selectionStart = input.selectionEnd = pos;
    input.focus();
    captureDraft();
    hideMentionMenu();
    pulseWorkflowTyping(Boolean(String(state.draftText || "").trim()));
  }

  function fetchMentions(q, mode) {
    mode = mode || "user";
    if (!state.dedupeKey) return Promise.resolve();
    var filter = mode === "channel" ? "all" : String(state.mentionMenu.filter || "all");
    state.mentionMenu = {
      open: true,
      q: q || "",
      items: [],
      index: 0,
      mode: mode,
      filter: filter,
      loading: true,
    };
    renderMentionMenu();
    var url =
      apiBase() +
      "/mentions?dedupeKey=" +
      encodeURIComponent(state.dedupeKey) +
      "&q=" +
      encodeURIComponent(q || "") +
      (mode === "channel" ? "&kind=channels" : "") +
      (mode !== "channel" && filter !== "all" ? "&filter=" + encodeURIComponent(filter) : "");
    return fetchJson(url, { method: "GET", headers: authHeaders(false), cache: false, timeoutMs: 10000 })
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          state.mentionMenu.loading = false;
          state.mentionMenu.items = [];
          renderMentionMenu();
          return;
        }
        var items = [];
        if (mode === "channel") {
          items = Array.isArray(out.data.channels) ? out.data.channels : [];
          items.forEach(function (ch) {
            rememberMentionName("channel", ch.id, ch.name);
          });
        } else {
          var users = Array.isArray(out.data.users) ? out.data.users : [];
          var roles = state.isStaffReviewer && Array.isArray(out.data.roles) ? out.data.roles : [];
          users.forEach(function (u) {
            rememberMentionName("user", u.id, u.name);
          });
          roles.forEach(function (r) {
            rememberMentionName("role", r.id, r.name);
          });
          items = users.concat(roles).slice(0, 24);
        }
        state.mentionMenu.loading = false;
        state.mentionMenu.items = mode === "channel" ? items.slice(0, 80) : items;
        state.mentionMenu.index = 0;
        renderMentionMenu();
      })
      .catch(function () {
        state.mentionMenu.loading = false;
        state.mentionMenu.items = [];
        renderMentionMenu();
      });
  }

  function ensureWorkflowTypingRoom() {
    if (state.typingRoom) {
      state.typingRoom.selfId = String(state.profileId || "").trim();
      return state.typingRoom;
    }
    if (!global.VcChatTyping || !global.VcChatTyping.TypingRoom) return null;
    state.typingRoom = new global.VcChatTyping.TypingRoom({
      selfId: String(state.profileId || "").trim(),
      minInterval: 2000,
      onChange: function () {
        var el = byId("vc-wfc-typing");
        if (state.typingRoom) state.typingRoom.renderInto(el);
      },
      sendFn: function (opts) {
        if (!state.dedupeKey || !state.canSend) return;
        void fetchJson(apiBase() + "/typing", {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify(
            opts && opts.stop
              ? { dedupeKey: state.dedupeKey, stop: true }
              : { dedupeKey: state.dedupeKey },
          ),
          timeoutMs: 6000,
        }).catch(function () {});
      },
    });
    return state.typingRoom;
  }

  function pulseWorkflowTyping(hasText) {
    var room = ensureWorkflowTypingRoom();
    if (room) room.pulse(Boolean(hasText));
  }

  function stopWorkflowTypingRoom() {
    if (state.typingRoom) {
      try {
        state.typingRoom.pulse(false);
      } catch (e0) {}
      state.typingRoom.reset();
    }
    hideMentionMenu();
  }

  function onChatClick(ev) {
    var replyBtn = ev.target.closest("[data-reply-msg]");
    if (replyBtn) {
      var rid = replyBtn.getAttribute("data-reply-msg");
      var msg = state.messages.find(function (m) {
        return String(m.id) === String(rid);
      });
      if (msg) {
        state.replyTo = { id: msg.id, authorName: msg.authorName, content: plainPreviewText(msg.content) || "Allegato" };
        refreshDom();
        var input = byId("vc-wfc-input");
        if (input) input.focus();
      }
      return;
    }
    var copyBtn = ev.target.closest("[data-copy-msg]");
    if (copyBtn) {
      copyMessageText(copyBtn.getAttribute("data-copy-msg"));
      return;
    }
    var editBtn = ev.target.closest("[data-edit-msg]");
    if (editBtn) {
      startEditMessage(editBtn.getAttribute("data-edit-msg"));
      return;
    }
    var delBtn = ev.target.closest("[data-del-msg]");
    if (delBtn) {
      deleteMessage(delBtn.getAttribute("data-del-msg"));
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

  function copyMessageText(messageId) {
    var msg = state.messages.find(function (m) {
      return String(m.id) === String(messageId);
    });
    var text = plainPreviewText(msg && msg.content);
    if (!text) return;
    var done = function () {
      notifyUi("Testo copiato.", false);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        notifyUi("Copia non riuscita.", true);
      });
      return;
    }
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch (eCopy) {
      notifyUi("Copia non riuscita.", true);
    }
  }

  function removeMessageFromState(messageId) {
    state.messages = state.messages.filter(function (m) {
      return String(m.id) !== String(messageId);
    });
    refreshDom();
  }

  function startEditMessage(messageId) {
    var msg = state.messages.find(function (m) {
      return String(m.id) === String(messageId);
    });
    if (!msg) return;
    var node = document.querySelector('#vc-wfc-scroll [data-msg-id="' + messageId + '"]');
    if (!node) return;
    var bubble = node.querySelector(".vc-wfc-msg__bubble");
    if (!bubble || bubble.querySelector(".vc-wfc-msg__edit")) return;
    var textEl = bubble.querySelector(".vc-wfc-msg__text");
    if (textEl) textEl.hidden = true;
    var form = document.createElement("form");
    form.className = "vc-wfc-msg__edit";
    form.innerHTML =
      '<textarea class="vc-wfc-msg__edit-input" id="vc-wfc-edit-input" name="wfcEditMessage" rows="3" maxlength="2000" autocomplete="off"></textarea>' +
      '<div class="vc-wfc-msg__edit-actions">' +
      '<button type="button" data-edit-cancel>Annulla</button>' +
      '<button type="submit">Salva</button>' +
      "</div>";
    var ta = form.querySelector("textarea");
    ta.value = String(msg.content || "").replace(/\u200b/g, "");
    var insertAfter = textEl || bubble.querySelector(".vc-wfc-msg__meta");
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
    if (!state.dedupeKey || !messageId || state.sending) return;
    var text = String(content || "").trim();
    var existing = state.messages.find(function (m) {
      return String(m.id) === String(messageId);
    });
    var imageCount = existing && Array.isArray(existing.imageUrls) ? existing.imageUrls.length : 0;
    if (!text && !imageCount) {
      deleteMessage(messageId, { fromEmptyEdit: true });
      return;
    }
    state.sending = true;
    fetchJson(apiBase() + "/messages/" + encodeURIComponent(messageId), {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ dedupeKey: state.dedupeKey, content: text }),
      timeoutMs: 15000,
    })
      .then(function (out) {
        state.sending = false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          state.error = (out.data && out.data.message) || "Modifica non riuscita.";
          refreshDom();
          return;
        }
        if (out.data.deleted && out.data.messageId) {
          removeMessageFromState(out.data.messageId);
          return;
        }
        if (out.data.message) patchMessage(out.data.message);
        refreshDom();
      })
      .catch(function () {
        state.sending = false;
        state.error = "Errore di rete sulla modifica.";
        refreshDom();
      });
  }

  function deleteMessage(messageId, opts) {
    if (!state.dedupeKey || !messageId || state.sending) return;
    opts = opts || {};
    var run = function () {
      state.sending = true;
      fetchJson(
        apiBase() +
          "/messages/" +
          encodeURIComponent(messageId) +
          "?dedupeKey=" +
          encodeURIComponent(state.dedupeKey),
        {
          method: "DELETE",
          headers: authHeaders(true),
          body: JSON.stringify({ dedupeKey: state.dedupeKey }),
          timeoutMs: 15000,
        },
      )
        .then(function (out) {
          state.sending = false;
          if (!out.res.ok || !out.data || !out.data.ok) {
            state.error = (out.data && out.data.message) || "Eliminazione non riuscita.";
            refreshDom();
            return;
          }
          removeMessageFromState(messageId);
        })
        .catch(function () {
          state.sending = false;
          state.error = "Errore di rete sull\u2019eliminazione.";
          refreshDom();
        });
    };
    if (opts.fromEmptyEdit) {
      run();
      return;
    }
    (typeof global.__vcEnsureDialog === "function"
      ? global.__vcEnsureDialog()
      : Promise.resolve(global.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.confirm !== "function") return;
      return D.confirm({
        title: "Eliminare il messaggio?",
        message: "Eliminare questo messaggio?",
        confirmLabel: "Elimina",
        cancelLabel: "Annulla",
        danger: true,
        icon: "fa-trash-o",
      }).then(function (ok) {
        if (ok) run();
      });
    });
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

  function captureAnchorRect(el) {
    try {
      if (!el || !el.getBoundingClientRect) return null;
      var r0 = el.getBoundingClientRect();
      if (!r0 || (r0.width <= 1 && r0.height <= 1)) return null;
      return {
        left: r0.left,
        top: r0.top,
        width: r0.width,
        height: r0.height,
        right: r0.right,
        bottom: r0.bottom,
      };
    } catch (e) {
      return null;
    }
  }

  function openEmojiPickerForComposer(ev) {
    var anchor = ev && ev.currentTarget ? ev.currentTarget : byId("vc-wfc-emoji");
    var input = byId("vc-wfc-input");
    if (!global.VcEmojiPicker || !anchor) return;
    var anchorRect = captureAnchorRect(anchor);
    ensureGuildEmojis(function (emojis) {
      var live = document.getElementById("vc-wfc-emoji") || anchor;
      global.VcEmojiPicker.open({
        anchor: live,
        anchorSelector: "#vc-wfc-emoji",
        anchorRect: anchorRect,
        guildEmojis: emojis,
        preferCustom: true,
        preferAbove: true,
        focusTarget: input,
        onPick: function (pick) {
          if (pick.custom && global.VcEmojiPicker.formatCustom) {
            insertAtCursor(input, global.VcEmojiPicker.formatCustom(pick));
          } else if (pick.unicode) {
            insertAtCursor(input, pick.unicode);
          }
          captureDraft();
        },
      });
    });
  }

  function openEmojiPickerForReaction(messageId) {
    var sel = '[data-msg-id="' + messageId + '"] .vc-wfc-react--add';
    var msgEl = document.querySelector(sel);
    if (!global.VcEmojiPicker) return;
    var anchorRect = captureAnchorRect(msgEl || byId("vc-wfc-scroll"));
    ensureGuildEmojis(function (emojis) {
      var live = document.querySelector(sel) || byId("vc-wfc-scroll");
      global.VcEmojiPicker.open({
        anchor: live,
        anchorSelector: sel,
        anchorRect: anchorRect,
        guildEmojis: emojis,
        preferCustom: false,
        preferAbove: true,
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
    captureDraft();
    if (!state.dedupeKey || state.sending) return;
    var content = String(state.draftText || "").trim();
    var images = state.composerImages.slice();
    if (!content && !images.length) return;
    stopWorkflowTypingRoom();
    var replySnap = state.replyTo;
    var replyToId = replySnap && replySnap.id ? replySnap.id : undefined;
    /* Clear composer immediately so refreshDom/captureDraft cannot resurrect the text. */
    clearDraft();
    state.composerImages = [];
    state.replyTo = null;
    state.sending = true;
    state.error = "";
    refreshDom({ skipCapture: true });
    fetchJson(apiBase(), {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ dedupeKey: state.dedupeKey, content: content, images: images, replyToId: replyToId }),
      timeoutMs: 20000,
    })
      .then(function (out) {
        state.sending = false;
        if (!out.res.ok || !out.data || !out.data.ok || !out.data.message) {
          state.draftText = content;
          state.composerImages = images.slice();
          state.replyTo = replySnap;
          state.error = (out.data && out.data.message) || "Invio non riuscito.";
          refreshDom({ skipCapture: true });
          return;
        }
        clearDraft();
        state.composerImages = [];
        state.replyTo = null;
        appendMessage(out.data.message);
        refreshDom({ skipCapture: true });
        scrollToBottom();
      })
      .catch(function () {
        state.sending = false;
        state.draftText = content;
        state.composerImages = images.slice();
        state.replyTo = replySnap;
        state.error = "Errore di rete sulla chat.";
        refreshDom({ skipCapture: true });
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
          patchMessage(data.message);
          if (data.message.authorId) {
            var roomClr = ensureWorkflowTypingRoom();
            if (roomClr) roomClr.clearUser(data.message.authorId);
          }
          if (
            String(data.message.authorId || "") &&
            String(data.message.authorId) !== String(state.profileId || "") &&
            String(data.message.authorKind || "") !== "system"
          ) {
            markChatRead([data.message.id]);
          }
          refreshDom();
          scrollToBottom();
        } else if (data.type === "workflow_chat_receipts") {
          applyReceiptsToOwnMessages(data.messageIds, data.readerId);
        } else if (data.type === "workflow_chat_message_deleted" && data.messageId) {
          removeMessageFromState(data.messageId);
        } else if (data.type === "workflow_chat_reaction" && data.message) {
          if (messageVisibleToSubjectClient(data.message)) {
            patchMessage(data.message);
            refreshDom();
          }
        } else if (data.type === "workflow_chat_subject") {
          if (data.subjectChat) state.subjectChat = data.subjectChat;
          loadMessages(dedupeKey, { silent: true });
        } else if (data.type === "workflow_chat_typing") {
          var room = ensureWorkflowTypingRoom();
          if (!room) return;
          if (data.stop) room.clearUser(data.userId);
          else room.note(data.userId, data.userName);
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

  function chatErrorMessage(out) {
    var data = out && out.data && typeof out.data === "object" ? out.data : null;
    var msg = data && data.message ? String(data.message).trim() : "";
    var err = data && data.error ? String(data.error).trim().toLowerCase() : "";
    var st = Number(out && out.res && out.res.status) || 0;
    var soft = Boolean((out && out.soft) || (data && data.soft));
    /* notifApiErr1: abort / soft / rate → niente banner rosso */
    if (err === "aborted" || soft) return "";
    if (err === "rate_limited_client" || err === "rate_limited" || st === 429) return "";
    if (err === "network_error" || err === "invalid_json" || err === "empty_body") return "";
    if (msg && err !== "missing_token" && err !== "invalid_token" && st !== 401) return msg;
    if (err === "missing_token" || err === "invalid_token" || st === 401) {
      return "";
    }
    if (err === "not_found" || st === 404) return "Pratica non trovata per la chat.";
    if (err === "timeout" || err === "oauth_timeout" || st === 408 || st === 504) {
      return "Chat lenta a rispondere. Riprova tra un attimo.";
    }
    if (err === "forbidden" || err === "not_invited" || st === 403) {
      return msg || "Non autorizzato ad aprire questa chat.";
    }
    if (st >= 500) return "Servizio chat temporaneamente non disponibile.";
    if (msg) return msg;
    if (err) return "Chat non disponibile (" + err + ").";
    return "Chat non disponibile.";
  }

  function waitForChatToken(maxMs) {
    function tok() {
      var fn = c("getToken");
      return fn ? String(fn() || "").trim() : "";
    }
    if (tok()) return Promise.resolve(true);
    var left = Math.max(400, Number(maxMs) || 2500);
    return new Promise(function (resolve) {
      (function poll() {
        if (tok()) {
          resolve(true);
          return;
        }
        left -= 120;
        if (left <= 0) {
          resolve(Boolean(tok()));
          return;
        }
        window.setTimeout(poll, 120);
      })();
    });
  }

  function loadMessages(dedupeKey, opts) {
    opts = opts || {};
    var seq = state.seq;
    var url = apiBase() + "?dedupeKey=" + encodeURIComponent(dedupeKey);
    var start = Promise.resolve();
    if (!opts.silent && !opts._skippedTokenWait) {
      start = waitForChatToken(2800);
    }
    return start
      .then(function () {
        if (seq !== state.seq || state.dedupeKey !== dedupeKey) return null;
        var tokFn = c("getToken");
        var tok = tokFn ? String(tokFn() || "").trim() : "";
        if (!tok && !opts.silent) {
          return {
            res: { ok: false, status: 401 },
            data: { ok: false, error: "missing_token", message: "Sessione non pronta. Ricarica o riapri il dettaglio." },
          };
        }
        return fetchJson(url, {
          timeoutMs: opts._retried ? 14000 : 10000,
          cache: false,
        });
      })
      .then(function (out) {
        if (!out) return;
        if (seq !== state.seq || state.dedupeKey !== dedupeKey) return;
        if (!out.res.ok || !out.data || !out.data.ok) {
          var err = String((out.data && out.data.error) || "").toLowerCase();
          var st = Number(out.res && out.res.status) || 0;
          var retryCount = Number(opts._retryCount || 0);
          var isRate =
            err === "rate_limited_client" ||
            err === "rate_limited" ||
            st === 429;
          /* staffRevChatKey1: 404 not_found = pratica assente — non ritentare (spam console) */
          var hardMiss = err === "not_found" || st === 404;
          var canRetry =
            !hardMiss &&
            retryCount < (isRate ? 6 : opts.silent ? 0 : 3) &&
            (err === "aborted" ||
              err === "timeout" ||
              err === "oauth_timeout" ||
              err === "missing_token" ||
              err === "network_error" ||
              err === "invalid_json" ||
              err === "empty_body" ||
              Boolean(out.soft) ||
              Boolean(out.data && out.data.soft) ||
              isRate ||
              st === 401 ||
              st === 408 ||
              st === 0 ||
              st === 502 ||
              st === 503 ||
              st === 504 ||
              (!opts.silent && (!out.data || !Object.keys(out.data || {}).length)));
          if (canRetry) {
            var delay = isRate
              ? Math.min(9000, 900 + retryCount * 1100)
              : 350;
            // Keep loading; never flash "Chat in coda…" during backoff.
            if (!opts.silent) {
              state.error = "";
              state.loading = true;
              refreshDom();
            }
            return new Promise(function (resolve) {
              window.setTimeout(resolve, delay);
            }).then(function () {
              if (seq !== state.seq || state.dedupeKey !== dedupeKey) return;
              return loadMessages(
                dedupeKey,
                Object.assign({}, opts, {
                  _retried: true,
                  _skippedTokenWait: err !== "missing_token",
                  _retryCount: retryCount + 1,
                }),
              );
            });
          }
          if (!opts.silent) {
            var mapped = chatErrorMessage(out);
            if (!mapped) {
              /* notifApiErr1: benign → lascia loading spento senza banner rosso */
              state.error = "";
              state.loading = false;
              refreshDom();
              return;
            }
            state.error = mapped;
            state.loading = false;
            refreshDom();
          }
          return;
        }
        state.loading = false;
        state.error = "";
        var nextMessages = Array.isArray(out.data.messages) ? out.data.messages.slice() : [];
        // chatKeepMsgs2: silent poll con payload vuoto non cancella la cronologia già in schermo.
        if (
          opts.silent &&
          !nextMessages.length &&
          Array.isArray(state.messages) &&
          state.messages.length
        ) {
          nextMessages = state.messages.slice();
        }
        var nextCanSend = c("forceReadOnly") === true ? false : Boolean(out.data.canSend);
        var nextStatus = String(out.data.status || "pending");
        var unchanged =
          Boolean(opts.silent) &&
          messagesFingerprint(nextMessages) === messagesFingerprint(state.messages) &&
          nextCanSend === Boolean(state.canSend) &&
          nextStatus === String(state.status || "pending");
        state.canSend = nextCanSend;
        state.maxImages = Number(out.data.maxImages) || 3;
        state.isStaffReviewer = Boolean(out.data.isStaffReviewer);
        state.isSubject = Boolean(out.data.isSubject);
        state.status = nextStatus;
        state.subjectChat = out.data.subjectChat || null;
        state.messages = nextMessages;
        seedMentionNamesFromMessages(state.messages);
        if (out.data.viewerId) state.profileId = String(out.data.viewerId || state.profileId || "");
        if (unchanged) return;
        refreshDom();
        if (!opts.silent) scrollToBottom();
      })
      .catch(function () {
        if (seq !== state.seq || state.dedupeKey !== dedupeKey) return;
        if (!opts.silent && Number(opts._retryCount || 0) < 2) {
          return loadMessages(
            dedupeKey,
            Object.assign({}, opts, {
              _retried: true,
              _skippedTokenWait: true,
              _retryCount: Number(opts._retryCount || 0) + 1,
            }),
          );
        }
        if (!opts.silent) {
          /* notifApiErr1: rete soft dopo retry → niente banner rosso (lista/chat possono riprendersi) */
          state.loading = false;
          state.error = "";
          refreshDom();
        }
      });
  }

  function captureDraft() {
    var input = byId("vc-wfc-input");
    if (!input) return;
    state.draftText = String(input.value || "");
    try {
      state.draftSelStart = input.selectionStart;
      state.draftSelEnd = input.selectionEnd;
    } catch (e0) {
      state.draftSelStart = null;
      state.draftSelEnd = null;
    }
  }

  function restoreDraft() {
    var input = byId("vc-wfc-input");
    if (!input) return;
    var text = String(state.draftText || "");
    if (input.value !== text) input.value = text;
    try {
      if (state.draftSelStart != null && state.draftSelEnd != null) {
        input.setSelectionRange(state.draftSelStart, state.draftSelEnd);
      }
    } catch (e1) {}
  }

  function clearDraft() {
    state.draftText = "";
    state.draftSelStart = null;
    state.draftSelEnd = null;
    try {
      var input = byId("vc-wfc-input");
      if (input) input.value = "";
    } catch (eClr) {}
  }

  function messagesFingerprint(list) {
    return (Array.isArray(list) ? list : [])
      .map(function (m) {
        var reactions = Array.isArray(m && m.reactions) ? m.reactions.length : 0;
        return String((m && m.id) || "") + ":" + reactions + ":" + String((m && m.content) || "").length;
      })
      .join("|");
  }

  function refreshDom(opts) {
    opts = opts || {};
    var root = byId("vc-wfc-root");
    if (!root) return;
    if (!opts.skipCapture) captureDraft();
    var scroll = byId("vc-wfc-scroll");
    var nearBottom = scroll ? scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 48 : true;
    var shell = panelShellKey();
    var item = { status: state.status || "pending", dedupeKey: state.dedupeKey };
    var canSend = panelCanSend(item, state.dedupeKey);
    var hasForm = Boolean(byId("vc-wfc-form"));
    var canSoft =
      !opts.force &&
      root.getAttribute("data-vc-shell") === shell &&
      Boolean(scroll) &&
      ((canSend && hasForm) || (!canSend && !hasForm));
    if (canSoft) {
      syncMessagesDom();
      patchErrorDom(root);
      var sendBtn = byId("vc-wfc-send");
      if (sendBtn) sendBtn.disabled = Boolean(state.sending);
      var inv = byId("vc-wfc-subject-invite");
      var rm = byId("vc-wfc-subject-remove");
      if (inv) inv.disabled = Boolean(state.managingSubject);
      if (rm) rm.disabled = Boolean(state.managingSubject);
      if (nearBottom) scrollToBottom();
      return;
    }
    var wrap = document.createElement("div");
    wrap.innerHTML = renderPanel(item, state.tab);
    var fresh = wrap.firstChild;
    if (!fresh) return;
    fresh.setAttribute("data-vc-shell", shell);
    var freshScroll = fresh.querySelector("#vc-wfc-scroll");
    if (freshScroll) freshScroll.setAttribute("data-vc-msg-fp", messagesFingerprint(state.messages));
    root.replaceWith(fresh);
    bindComposer();
    restoreDraft();
    if (nearBottom) scrollToBottom();
  }

  function syncWatchingWorkflowFlag() {
    try {
      var key = String(state.dedupeKey || "").trim();
      if (key) {
        window.__VC_WATCHING_WORKFLOW = { dedupeKey: key, at: Date.now() };
      } else if (window.__VC_WATCHING_WORKFLOW) {
        delete window.__VC_WATCHING_WORKFLOW;
      }
    } catch (eW) {}
  }

  function teardown() {
    captureDraft();
    stopWorkflowTypingRoom();
    state.seq += 1;
    state.dedupeKey = "";
    syncWatchingWorkflowFlag();
    state.tab = "";
    state.messages = [];
    state.canSend = null;
    state.loading = false;
    state.sending = false;
    state.managingSubject = false;
    state.error = "";
    state.replyTo = null;
    state.composerImages = [];
    clearDraft();
    state.isStaffReviewer = false;
    state.isSubject = false;
    state.subjectChat = null;
    state.status = "pending";
    state.typingRoom = null;
    if (state.mentionTimer) {
      clearTimeout(state.mentionTimer);
      state.mentionTimer = null;
    }
    hideMentionMenu();
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

  function keysShareConversation(prevKey, nextKey, item) {
    var a = String(prevKey || "").trim();
    var b = String(nextKey || "").trim();
    if (!a || !b) return false;
    if (a === b) return true;
    var mid = String(
      (item && (item.messageId || item.recordId || item.id)) || "",
    ).trim();
    if (mid && a.indexOf(mid) >= 0 && b.indexOf(mid) >= 0) return true;
    var pa = a.split(":");
    var pb = b.split(":");
    if (pa[0] && pa[0] === pb[0] && pa[0] === "pause" && pa.length >= 3 && pb.length >= 3) {
      return pa[1] === pb[1] && pa[2] === pb[2];
    }
    // Same queue prefix + overlapping snowflake tail (messageId upgrade).
    if (pa[0] && pa[0] === pb[0] && pa.length >= 2 && pb.length >= 2) {
      var ta = pa[pa.length - 1];
      var tb = pb[pb.length - 1];
      if (/^\d{16,22}$/.test(ta) && ta === tb) return true;
    }
    return false;
  }

  function boot(item, tab) {
    var key = dedupeKeyFor(item, tab);
    if (!key) {
      teardown();
      return;
    }
    state.profileId = c("getProfileId") ? String(c("getProfileId")() || "") : "";
    var prevKey = String(state.dedupeKey || "");
    var sameKey = prevKey === key;
    var sameConv = keysShareConversation(prevKey, key, item);
    var root = byId("vc-wfc-root");

    // Sheet re-render / soft-refresh: keep messages; never teardown the same pratica.
    if (sameConv) {
      if (!sameKey) {
        state.dedupeKey = key;
        syncWatchingWorkflowFlag();
        if (state.pollTimer) {
          try {
            clearInterval(state.pollTimer);
          } catch (ePoll) {}
          state.pollTimer = null;
        }
        connectWs(key);
      }
      state.tab = tab || state.tab || "";
      if (c("forceReadOnly") === true) {
        state.canSend = false;
      } else if (item && String(item.status || "").toLowerCase() === "pending") {
        // Remount of an open pratica: keep API canSend if known, else optimistic write.
        if (state.canSend == null) state.canSend = true;
      } else if (item && String(item.status || "").toLowerCase() !== "pending") {
        state.canSend = false;
        state.status = String(item.status || state.status || "closed");
      }
      if (root) {
        if (!state.messages.length && !state.loading) {
          state.loading = true;
          state.error = "";
          refreshDom();
          loadMessages(key);
        } else {
          refreshDom();
        }
        bindComposer();
        restoreDraft();
        return;
      }
      // Panel missing from DOM but state still warm — re-insert via caller HTML, then paint.
      if (state.messages.length) {
        // Caller just wiped #vc-wfc-root; wait a tick for new empty panel in DOM.
        window.setTimeout(function () {
          if (!keysShareConversation(state.dedupeKey, key, item) && state.dedupeKey !== key) return;
          var again = byId("vc-wfc-root");
          if (!again) return;
          refreshDom();
          bindComposer();
          restoreDraft();
        }, 0);
        return;
      }
      if (!state.loading) {
        state.loading = true;
        loadMessages(key);
      }
      connectWs(key);
      return;
    }

    teardown();
    state.dedupeKey = key;
    syncWatchingWorkflowFlag();
    state.tab = tab || "";
    state.loading = true;
    state.error = "";
    state.status = String(item.status || "pending").toLowerCase() || "pending";
    state.canSend =
      c("forceReadOnly") === true
        ? false
        : state.status === "pending";
    // Paint composer immediately for pending (don't wait for messages fetch).
    refreshDom();
    bindComposer();
    restoreDraft();
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
    captureDraft: captureDraft,
  };
})(window);
