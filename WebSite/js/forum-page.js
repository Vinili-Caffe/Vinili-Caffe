(function () {
  var state = {
    threads: [],
    selectedThreadId: "",
    pollTimer: null,
    ws: null,
    loadingMessages: false,
    search: "",
    filter: "all",
    tagFilterId: "",
    unreadByThread: {},
    messageCursorBefore: "",
    messageHasMore: false,
    messagesByThread: {},
    availableTags: [],
    lastMessagesRequestId: 0,
    threadsPage: 1,
    createSelectedTagIds: [],
    createTagsTouched: false,
    selectedThread: null,
    selectedThreadPermissions: null,
    selectedThreadSyncKey: "",
    pendingMessageFocusId: "",
    forceScrollBottomOnce: false,
  };
  var THREADS_PAGE_SIZE = 8;
  var MAX_MEDIA_FILES = 6;

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_SITE_FORUM) || {};
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function resolvedApiUrl() {
    var c = cfg();
    var local = String(c.apiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local) return local;
    return String(c.apiUrl || "").trim() || "/webhooks/site-forum";
  }

  function setState(msg, isErr) {
    var el = byId("vc-forum-state");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isErr ? "#fca5a5" : "";
  }

  function token() {
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (!t || !exp || Date.now() >= exp) return "";
      return String(t);
    } catch (e) {
      return "";
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toggle(el, onClass, isOn) {
    if (!el || !el.classList) return;
    el.classList.toggle(onClass, Boolean(isOn));
  }

  function formatDateTime(value) {
    var d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    try {
      return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return d.toISOString();
    }
  }

  function renderMessageContentWithMentions(msg) {
    var content = String((msg && msg.content) || "");
    var mentions = Array.isArray(msg && msg.mentions) ? msg.mentions : [];
    var mentionRoles = Array.isArray(msg && msg.mentionRoles) ? msg.mentionRoles : [];
    if (!content) return "";
    var byId = {};
    var roleById = {};
    for (var i = 0; i < mentions.length; i += 1) {
      var m = mentions[i] || {};
      var id = String(m.id || "").trim();
      var username = String(m.username || "").trim();
      if (!id || !username) continue;
      byId[id] = username;
    }
    for (var r = 0; r < mentionRoles.length; r += 1) {
      var mr = mentionRoles[r] || {};
      var rid = String(mr.id || "").trim();
      var rname = String(mr.name || "").trim();
      if (!rid || !rname) continue;
      roleById[rid] = rname;
    }
    var out = esc(content);
    out = out.replace(/&lt;@!?(\d{17,22})&gt;/g, function (_, uid) {
      var uname = byId[String(uid)] || ("utente-" + String(uid).slice(-4));
      return '<span class="rounded-md border border-cyan-300/35 bg-cyan-300/15 px-1 py-0.5 text-cyan-100">@' + esc(uname) + "</span>";
    });
    out = out.replace(/&lt;@&(\d{17,22})&gt;/g, function (_, rid) {
      var rname = roleById[String(rid)] || ("ruolo-" + String(rid).slice(-4));
      return '<span class="rounded-md border border-fuchsia-300/35 bg-fuchsia-300/15 px-1 py-0.5 text-fuchsia-100">@' + esc(rname) + "</span>";
    });
    out = out.replace(/&lt;(a?):([a-zA-Z0-9_]{2,32}):(\d{17,22})&gt;/g, function (_, animated, emojiName, emojiId) {
      var ext = String(animated || "") === "a" ? "gif" : "png";
      var url = "https://cdn.discordapp.com/emojis/" + String(emojiId) + "." + ext + "?size=64&quality=lossless";
      return '<img src="' + esc(url) + '" alt=":' + esc(String(emojiName)) + ':" class="mx-0.5 inline-block h-5 w-5 align-[-0.2em]" loading="lazy" decoding="async" />';
    });
    return out;
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      try {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || "")); };
        reader.onerror = function () { reject(new Error("Errore lettura file")); };
        reader.readAsDataURL(file);
      } catch (e) {
        reject(e);
      }
    });
  }

  function pickMediaFiles(inputId) {
    var el = byId(inputId);
    if (!el || !el.files || !el.files.length) return [];
    return Array.prototype.slice.call(el.files, 0, MAX_MEDIA_FILES);
  }

  async function buildMediaPayloadFromInput(inputId) {
    var files = pickMediaFiles(inputId);
    if (!files.length) return [];
    var out = [];
    for (var i = 0; i < files.length; i += 1) {
      var f = files[i];
      var dataUrl = await fileToDataUrl(f);
      out.push({
        name: String(f.name || "media_" + (i + 1)),
        type: String(f.type || ""),
        data: dataUrl,
      });
    }
    return out;
  }

  function syncFileState(inputId, outputId, emptyLabel) {
    var input = byId(inputId);
    var out = byId(outputId);
    if (!input || !out) return;
    var count = input.files && input.files.length ? input.files.length : 0;
    out.textContent = count > 0 ? count + " media selezionati" : emptyLabel;
  }

  function renderCreateTags() {
    var sel = byId("vc-forum-create-tags");
    if (!sel) return;
    var tags = Array.isArray(state.availableTags) ? state.availableTags : [];
    if (!tags.length) {
      sel.innerHTML = "";
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = tags
      .map(function (t) {
        var emoji = (t && t.emoji && t.emoji.name) ? (t.emoji.name + " ") : "";
        return '<option value="' + esc(String(t.id || "")) + '">' + esc(emoji + String(t.name || "Tag")) + "</option>";
      })
      .join("");
    var selected = Array.isArray(state.createSelectedTagIds) ? state.createSelectedTagIds : [];
    if (selected.length) {
      for (var i = 0; i < sel.options.length; i += 1) {
        var op = sel.options[i];
        op.selected = selected.indexOf(String(op.value || "")) !== -1;
      }
    } else {
      for (var j = 0; j < sel.options.length; j += 1) {
        sel.options[j].selected = false;
      }
    }
  }

  function renderTagFilterSelect() {
    var sel = byId("vc-forum-filter-tag");
    if (!sel) return;
    var prev = String(state.tagFilterId || "");
    var tags = Array.isArray(state.availableTags) ? state.availableTags : [];
    sel.innerHTML =
      '<option value="">Tutti i tag</option>' +
      tags.map(function (t) {
        var emoji = (t && t.emoji && t.emoji.name) ? (t.emoji.name + " ") : "";
        return '<option value="' + esc(String((t && t.id) || "")) + '">' + esc(emoji + String((t && t.name) || "Tag")) + "</option>";
      }).join("");
    sel.value = prev;
  }

  function buildWsUrl() {
    try {
      var base = resolvedApiUrl();
      if (!base) return "";
      var u = new URL(base, window.location.origin);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      var p = String(u.pathname || "");
      p = p.replace(/\/webhooks\/site-forum\/?$/i, "/webhooks/site-realtime-ws");
      if (!/site-realtime-ws$/i.test(p)) p = "/webhooks/site-realtime-ws";
      u.pathname = p;
      u.search = "";
      return u.toString();
    } catch (e) {
      return "";
    }
  }

  function filteredThreads() {
    var q = String(state.search || "").trim().toLowerCase();
    var rows = state.threads.filter(function (t) {
      if (state.filter === "active" && t.archived) return false;
      if (state.filter === "archived" && !t.archived) return false;
      if (state.tagFilterId) {
        var ids = Array.isArray(t && t.appliedTagIds) ? t.appliedTagIds.map(function (x) { return String(x || ""); }) : [];
        if (ids.indexOf(String(state.tagFilterId)) === -1) return false;
      }
      if (!q) return true;
      return String(t.title || "").toLowerCase().indexOf(q) !== -1 || String(t.lastMessagePreview || "").toLowerCase().indexOf(q) !== -1;
    });
    rows.sort(function (a, b) {
      var aPinned = Boolean(a && a.pinned);
      var bPinned = Boolean(b && b.pinned);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      var aArchived = Boolean(a && a.archived);
      var bArchived = Boolean(b && b.archived);
      if (aArchived !== bArchived) return aArchived ? 1 : -1;
      var aLast = Number(new Date((a && (a.lastMessageAt || a.lastActivityAt || a.createdAt)) || 0).getTime() || 0);
      var bLast = Number(new Date((b && (b.lastMessageAt || b.lastActivityAt || b.createdAt)) || 0).getTime() || 0);
      return bLast - aLast;
    });
    return rows;
  }

  function resetChatPanel() {
    var head = byId("vc-forum-thread-head");
    if (head) head.innerHTML = "Seleziona una discussione per aprire la chat.";
    var wrap = byId("vc-forum-messages");
    if (wrap) {
      wrap.innerHTML = '<p class="text-sm text-slate-300">Apri una discussione dalla lista a sinistra per leggere o scrivere messaggi.</p>';
    }
    state.messageCursorBefore = "";
    state.messageHasMore = false;
    state.selectedThread = null;
    state.selectedThreadPermissions = null;
    state.selectedThreadSyncKey = "";
    syncLoadOlderButton();
  }

  function buildThreadSyncKey(thread) {
    if (!thread || !thread.id) return "";
    return [
      String(thread.id || ""),
      String(thread.lastMessageId || ""),
      String(thread.lastMessageAt || ""),
      String(thread.lastActivityAt || ""),
      String(thread.messageCount || 0),
      thread.archived ? "1" : "0",
      thread.locked ? "1" : "0",
      String(thread.title || ""),
    ].join("|");
  }

  function renderThreadHead(thread, permissions) {
    var head = byId("vc-forum-thread-head");
    if (!head) return;
    if (!thread) {
      head.innerHTML = "Seleziona una discussione per aprire la chat.";
      return;
    }
    var perms = permissions || {};
    var actions = [];
    if (perms.canEditTitle) {
      actions.push(
        '<button type="button" data-thread-action="rename" class="rounded-lg border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-slate-100 transition hover:border-emerald-400/60 hover:text-emerald-200">Titolo</button>'
      );
    }
    if (perms.canEditContent) {
      actions.push(
        '<button type="button" data-thread-action="edit-content" class="rounded-lg border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-slate-100 transition hover:border-cyan-400/60 hover:text-cyan-200">Testo post</button>'
      );
    }
    if (perms.canArchive) {
      actions.push(
        '<button type="button" data-thread-action="' + (thread.archived ? "unarchive" : "archive") + '" class="rounded-lg border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-slate-100 transition hover:border-amber-400/60 hover:text-amber-200">' + (thread.archived ? "Riapri" : "Chiudi") + "</button>"
      );
    }
    if (perms.canLock) {
      actions.push(
        '<button type="button" data-thread-action="' + (thread.locked ? "unlock" : "lock") + '" class="rounded-lg border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-slate-100 transition hover:border-rose-400/60 hover:text-rose-200">' + (thread.locked ? "Sblocca" : "Blocca") + "</button>"
      );
    }
    var title = esc(String(thread.title || "Discussione")) + (thread.archived ? " (archiviata)" : "");
    head.innerHTML =
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
      '<span class="text-sm font-semibold text-white">' + title + "</span>" +
      (actions.length ? '<div class="flex flex-wrap items-center gap-1.5">' + actions.join("") + "</div>" : "") +
      "</div>";
  }

  function renderThreads() {
    var wrap = byId("vc-forum-threads");
    if (!wrap) return;
    var rows = filteredThreads();
    if (!rows.length) {
      wrap.innerHTML = '<p class="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">Nessuna discussione disponibile.</p>';
      return;
    }
    var renderThreadButton = function (t) {
        var active = String(t.id) === String(state.selectedThreadId);
        var unread = Number(state.unreadByThread[String(t.id)] || 0);
        var ownerName = String((t.owner && t.owner.username) || "Utente");
        var createdAtText = formatDateTime(t.createdAt);
        var lastAtText = formatDateTime(t.lastMessageAt || t.lastActivityAt || t.createdAt);
        var appliedTagIds = Array.isArray(t && t.appliedTagIds) ? t.appliedTagIds : [];
        var tagRows = appliedTagIds
          .map(function (tagId) {
            var id = String(tagId || "");
            if (!id) return null;
            for (var i = 0; i < state.availableTags.length; i += 1) {
              var tag = state.availableTags[i] || {};
              if (String(tag.id || "") !== id) continue;
              var emoji = tag.emoji && tag.emoji.name ? String(tag.emoji.name) + " " : "";
              return emoji + String(tag.name || "Tag");
            }
            return null;
          })
          .filter(Boolean);
        return (
          '<button type="button" class="vc-forum-thread-item w-full rounded-2xl border p-4 text-left transition ' +
          (active ? 'border-emerald-400/70 bg-emerald-400/12 shadow-[0_0_0_1px_rgba(52,211,153,0.22)]' : "border-white/10 bg-black/20 hover:border-emerald-400/35") +
          '" data-thread-id="' +
          esc(t.id) +
          '">' +
          '<p class="flex items-center justify-between gap-2 text-base font-bold text-white">' +
          '<span class="min-w-0 truncate">' +
          esc(t.title || "Discussione") +
          "</span>" +
          (unread > 0 ? '<span class="shrink-0 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">+' + esc(String(unread)) + "</span>" : "") +
          "</p>" +
          '<p class="mt-1 flex items-center gap-2 text-xs text-slate-300">' +
          (t.pinned ? '<span class="rounded-full border border-amber-300/45 bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold text-amber-100">Pinnato</span>' : "") +
          '<span>' +
          (t.archived ? "Archiviato" : "Attivo") +
          " · " +
          esc(String(t.messageCount || 0)) +
          " msg</span></p>" +
          '<p class="mt-1 text-[11px] text-slate-400">Creato da <span class="font-semibold text-slate-300">' + esc(ownerName) + "</span>" +
          (createdAtText ? " · " + esc(createdAtText) : "") +
          "</p>" +
          (tagRows.length
            ? '<div class="mt-2 flex flex-wrap gap-1.5">' + tagRows.map(function (tagLabel) {
              return '<span class="rounded-full border border-cyan-300/35 bg-cyan-300/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">' + esc(tagLabel) + "</span>";
            }).join("") + "</div>"
            : "") +
          '<p class="mt-2 line-clamp-2 text-sm text-slate-300/90">' +
          esc(String(t.lastMessagePreview || "Nessuna anteprima disponibile.")) +
          "</p>" +
          (lastAtText ? '<p class="mt-1 text-[11px] text-slate-400">Ultimo messaggio: ' + esc(lastAtText) + "</p>" : "") +
          "</button>"
        );
      };

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / THREADS_PAGE_SIZE));
    if (state.threadsPage > totalPages) state.threadsPage = totalPages;
    if (state.threadsPage < 1) state.threadsPage = 1;
    var startIdx = (state.threadsPage - 1) * THREADS_PAGE_SIZE;
    var endIdx = startIdx + THREADS_PAGE_SIZE;
    var pageRows = rows.slice(startIdx, endIdx);
    var pinnedRows = pageRows.filter(function (t) { return Boolean(t && t.pinned); });
    var activeRows = pageRows.filter(function (t) { return !t.pinned && !t.archived; });
    var archivedRows = pageRows.filter(function (t) { return !t.pinned && t.archived; });
    var chunks = [];
    var pushSection = function (title, list) {
      if (!Array.isArray(list) || !list.length) return;
      chunks.push(
        '<div class="px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">' +
          esc(title) +
        "</div>"
      );
      chunks.push(list.map(renderThreadButton).join(""));
    };

    pushSection("Pinnati", pinnedRows);
    pushSection("Attive", activeRows);
    pushSection("Archiviate", archivedRows);
    if (total > THREADS_PAGE_SIZE) {
      chunks.push(
        '<div class="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">' +
          '<button type="button" id="vc-forum-page-prev" class="rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-slate-100 transition hover:border-emerald-400/60 hover:text-emerald-200 ' + (state.threadsPage <= 1 ? "cursor-not-allowed opacity-40" : "") + '"' + (state.threadsPage <= 1 ? " disabled" : "") + '>Prec</button>' +
          '<span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">Pagina ' + esc(String(state.threadsPage)) + " / " + esc(String(totalPages)) + "</span>" +
          '<button type="button" id="vc-forum-page-next" class="rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-slate-100 transition hover:border-emerald-400/60 hover:text-emerald-200 ' + (state.threadsPage >= totalPages ? "cursor-not-allowed opacity-40" : "") + '"' + (state.threadsPage >= totalPages ? " disabled" : "") + '>Succ</button>' +
        "</div>"
      );
    }
    wrap.innerHTML = chunks.join("");
  }

  function renderMessages(messages) {
    var wrap = byId("vc-forum-messages");
    if (!wrap) return;
    if (!messages.length) {
      wrap.innerHTML = '<p class="text-sm text-slate-300">Nessun messaggio in questa discussione.</p>';
      return;
    }
    wrap.innerHTML = messages
      .map(function (m) {
        var author = (m && m.author) || {};
        var avatar = esc(String(author.avatarUrl || ""));
        var username = esc(String(author.username || "Utente"));
        var msgTime = formatDateTime(m && m.createdAt);
        return (
          '<article class="rounded-xl border border-white/10 bg-black/30 p-3" data-message-id="' + esc(String((m && m.id) || "")) + '">' +
          '<div class="flex items-center gap-2">' +
          (avatar
            ? '<img src="' + avatar + '" alt="" class="h-7 w-7 rounded-full border border-white/15 object-cover" loading="lazy" decoding="async" />'
            : '<span class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/30 text-[10px] font-bold text-emerald-200">U</span>') +
          '<p class="text-xs font-semibold text-emerald-200">' + username + (msgTime ? '<span class="ml-2 font-normal text-slate-400">' + esc(msgTime) + "</span>" : "") + "</p>" +
          "</div>" +
          (m.content
            ? '<p class="mt-1 whitespace-pre-wrap text-sm text-slate-100">' + renderMessageContentWithMentions(m) + "</p>"
            : "") +
          (Array.isArray(m.attachments) && m.attachments.length
            ? '<div class="mt-2 space-y-2">' + m.attachments.map(function (a) {
              var url = esc(String((a && a.url) || ""));
              var name = esc(String((a && a.name) || "media"));
              var type = String((a && a.contentType) || "").toLowerCase();
              if (type.indexOf("image/") === 0) {
                return '<a href="' + url + '" target="_blank" rel="noopener noreferrer"><img src="' + url + '" alt="' + name + '" class="max-h-72 rounded-xl border border-white/10 object-cover" /></a>';
              }
              if (type.indexOf("video/") === 0) {
                return '<video controls preload="metadata" class="max-h-72 w-full rounded-xl border border-white/10"><source src="' + url + '"></video>';
              }
              return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="text-xs text-cyan-200 underline">' + name + "</a>";
            }).join("") + "</div>"
            : "") +
          "</article>"
        );
      })
      .join("");
  }

  function focusMessageInView(messageId) {
    var mid = String(messageId || "").trim();
    if (!mid) return;
    var sel = '[data-message-id="' + mid.replace(/"/g, '\\"') + '"]';
    var node = document.querySelector(sel);
    if (!node) return;
    try {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {
      try { node.scrollIntoView(); } catch (e2) {}
    }
    node.classList.add("ring-1", "ring-cyan-300/60");
    setTimeout(function () {
      node.classList.remove("ring-1", "ring-cyan-300/60");
    }, 1800);
  }

  function scrollMessagesToBottom() {
    var wrap = byId("vc-forum-messages");
    if (!wrap) return;
    try {
      wrap.scrollTop = wrap.scrollHeight;
    } catch (e) {}
  }

  function scrollMessagesToBottomStrong() {
    scrollMessagesToBottom();
    setTimeout(scrollMessagesToBottom, 40);
    setTimeout(scrollMessagesToBottom, 140);
  }

  function syncLoadOlderButton() {
    var btn = byId("vc-forum-load-older");
    if (!btn) return;
    btn.classList.toggle("hidden", !state.messageHasMore || !state.selectedThreadId);
  }

  function syncForumLayout() {
    var layout = byId("vc-forum-layout");
    var sidebar = byId("vc-forum-sidebar");
    var chat = byId("vc-forum-chat-panel");
    if (!layout || !sidebar || !chat) return;
    var opened = Boolean(state.selectedThreadId);
    layout.classList.toggle("lg:grid-cols-[320px_minmax(0,1fr)]", opened);
    layout.classList.toggle("lg:grid-cols-1", !opened);
    chat.classList.toggle("hidden", !opened);
    chat.classList.toggle("lg:hidden", !opened);
    chat.classList.toggle("lg:flex", opened);
    chat.classList.toggle("lg:flex-col", opened);
    syncChatPanelHeight();
  }

  function isDesktopForumLayout() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(min-width: 1024px)").matches);
    } catch (e) {
      return (window.innerWidth || 0) >= 1024;
    }
  }

  function syncChatPanelHeight() {
    var sidebar = byId("vc-forum-sidebar");
    var chat = byId("vc-forum-chat-panel");
    if (!sidebar || !chat) return;
    if (!state.selectedThreadId || !isDesktopForumLayout()) {
      chat.style.height = "";
      chat.style.maxHeight = "";
      return;
    }
    var h = Math.max(320, Math.floor(Number(sidebar.offsetHeight) || 0));
    if (!Number.isFinite(h) || h <= 0) {
      chat.style.height = "";
      chat.style.maxHeight = "";
      return;
    }
    chat.style.height = String(h) + "px";
    chat.style.maxHeight = String(h) + "px";
  }

  function syncWriteUi() {
    var hasToken = Boolean(token());
    var msgInput = byId("vc-forum-message-input");
    var msgBtn = byId("vc-forum-message-send");
    var openCreateBtn = byId("vc-forum-open-create");
    var cTitle = byId("vc-forum-create-title");
    var cBody = byId("vc-forum-create-content");
    var cBtn = byId("vc-forum-create-send");
    var cTags = byId("vc-forum-create-tags");
    var cMedia = byId("vc-forum-create-media");
    var mMedia = byId("vc-forum-message-media");
    if (msgInput) msgInput.disabled = !hasToken;
    if (msgBtn) msgBtn.disabled = !hasToken;
    if (openCreateBtn) openCreateBtn.disabled = !hasToken;
    if (cTitle) cTitle.disabled = !hasToken;
    if (cBody) cBody.disabled = !hasToken;
    if (cBtn) cBtn.disabled = !hasToken;
    if (cTags) cTags.disabled = !hasToken || !state.availableTags.length;
    if (cMedia) cMedia.disabled = !hasToken;
    if (mMedia) mMedia.disabled = !hasToken;
    if (!hasToken) {
      setState("Per scrivere nel forum devi prima fare login Discord.", false);
    }
  }

  function setCreateModalOpen(isOpen) {
    var modal = byId("vc-forum-create-modal");
    if (!modal) return;
    var open = Boolean(isOpen);
    modal.classList.toggle("hidden", !open);
    modal.classList.toggle("flex", open);
    if (open) {
      state.createSelectedTagIds = [];
      state.createTagsTouched = false;
      var tagsEl = byId("vc-forum-create-tags");
      if (tagsEl) {
        for (var i = 0; i < tagsEl.options.length; i += 1) {
          tagsEl.options[i].selected = false;
        }
      }
    }
    if (open) {
      var titleEl = byId("vc-forum-create-title");
      if (titleEl && !titleEl.disabled) {
        setTimeout(function () {
          try { titleEl.focus(); } catch (e) {}
        }, 30);
      }
    }
  }

  async function loadThreads() {
    var url = resolvedApiUrl();
    if (!url) return;
    try {
      var r = await fetch(url, { cache: "no-store", credentials: "omit" });
      var body = await r.json().catch(function () { return null; });
      if (!r.ok || !body || body.ok !== true) throw new Error((body && body.message) || "Errore caricamento forum");
      state.threads = Array.isArray(body.threads) ? body.threads : [];
      state.availableTags = Array.isArray(body.availableTags) ? body.availableTags : [];
      if (state.selectedThreadId && !state.threads.some(function (t) { return String(t.id) === String(state.selectedThreadId); })) {
        state.selectedThreadId = "";
      }
      renderThreads();
      renderCreateTags();
      renderTagFilterSelect();
      if (state.selectedThreadId) {
        var selectedThread = state.threads.find(function (t) {
          return String((t && t.id) || "") === String(state.selectedThreadId);
        }) || null;
        var nextSyncKey = buildThreadSyncKey(selectedThread);
        if (!state.selectedThreadSyncKey || (nextSyncKey && nextSyncKey !== state.selectedThreadSyncKey)) {
          await loadMessages(state.selectedThreadId, true);
          state.selectedThreadSyncKey = nextSyncKey;
        }
      } else {
        resetChatPanel();
      }
      syncForumLayout();
      setTimeout(syncChatPanelHeight, 30);
    } catch (err) {
      setState(err && err.message ? err.message : "Errore caricamento discussioni.", true);
    }
  }

  async function loadMessages(threadId, quiet, beforeId, appendOlder) {
    if (!threadId) return;
    var requestId = Number(state.lastMessagesRequestId || 0) + 1;
    state.lastMessagesRequestId = requestId;
    state.loadingMessages = true;
    try {
      var url = resolvedApiUrl() + "/" + encodeURIComponent(String(threadId)) + "/messages";
      if (beforeId) {
        url += "?before=" + encodeURIComponent(String(beforeId));
      }
      var headers = {};
      var tk = token();
      if (tk) headers.Authorization = "Bearer " + tk;
      var r = await fetch(url, { cache: "no-store", credentials: "omit", headers: headers });
      var body = await r.json().catch(function () { return null; });
      if (!r.ok || !body || body.ok !== true) throw new Error((body && body.message) || "Errore caricamento messaggi");
      if (requestId !== state.lastMessagesRequestId) return;
      var th = body.thread || null;
      state.selectedThread = th || null;
      state.selectedThreadPermissions = (body && body.permissions) || null;
      renderThreadHead(state.selectedThread, state.selectedThreadPermissions);
      var incoming = Array.isArray(body.messages) ? body.messages : [];
      var existing = Array.isArray(state.messagesByThread[threadId]) ? state.messagesByThread[threadId] : [];
      var merged = appendOlder ? incoming.concat(existing) : incoming;
      var uniq = {};
      var finalRows = [];
      for (var i = 0; i < merged.length; i += 1) {
        var row = merged[i];
        var k = String((row && row.id) || "");
        if (!k || uniq[k]) continue;
        uniq[k] = true;
        finalRows.push(row);
      }
      state.messagesByThread[threadId] = finalRows;
      state.messageCursorBefore = String((body.paging && body.paging.before) || "");
      state.messageHasMore = Boolean(body.paging && body.paging.hasMore);
      renderMessages(finalRows);
      syncLoadOlderButton();
      if (state.pendingMessageFocusId) {
        var targetId = String(state.pendingMessageFocusId || "");
        state.pendingMessageFocusId = "";
        setTimeout(function () {
          focusMessageInView(targetId);
        }, 60);
      } else if (!appendOlder && state.forceScrollBottomOnce) {
        state.forceScrollBottomOnce = false;
        setTimeout(scrollMessagesToBottomStrong, 20);
      }
      var selectedThread = state.threads.find(function (t) {
        return String((t && t.id) || "") === String(threadId || "");
      }) || null;
      state.selectedThreadSyncKey = buildThreadSyncKey(selectedThread);
      if (!quiet) setState("", false);
      setTimeout(syncChatPanelHeight, 20);
    } catch (err) {
      if (requestId !== state.lastMessagesRequestId) return;
      if (!quiet) setState(err && err.message ? err.message : "Errore caricamento messaggi.", true);
    } finally {
      if (requestId === state.lastMessagesRequestId) state.loadingMessages = false;
    }
  }

  async function postMessage(ev) {
    ev.preventDefault();
    var t = token();
    if (!t || !state.selectedThreadId) return;
    var input = byId("vc-forum-message-input");
    var content = String((input && input.value) || "").trim();
    var mediaPayload = await buildMediaPayloadFromInput("vc-forum-message-media");
    if (content.length < 1 && mediaPayload.length < 1) return;
    try {
      var url = resolvedApiUrl() + "/" + encodeURIComponent(String(state.selectedThreadId)) + "/messages";
      var r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + t,
        },
        body: JSON.stringify({ content: content, media: mediaPayload }),
      });
      var body = await r.json().catch(function () { return null; });
      if (!r.ok || !body || body.ok !== true) throw new Error((body && body.message) || "Invio fallito");
      if (input) input.value = "";
      var mInput = byId("vc-forum-message-media");
      if (mInput) mInput.value = "";
      syncFileState("vc-forum-message-media", "vc-forum-message-media-state", "Nessun media selezionato");
      await loadMessages(state.selectedThreadId, true, "", false);
      await loadThreads();
    } catch (err) {
      setState(err && err.message ? err.message : "Invio messaggio fallito.", true);
    }
  }

  async function createThread(ev) {
    ev.preventDefault();
    var t = token();
    if (!t) return;
    var titleEl = byId("vc-forum-create-title");
    var bodyEl = byId("vc-forum-create-content");
    var title = String((titleEl && titleEl.value) || "").trim();
    var content = String((bodyEl && bodyEl.value) || "").trim();
    var tagsEl = byId("vc-forum-create-tags");
    var selectedTagIds = state.createTagsTouched
      ? (Array.isArray(state.createSelectedTagIds) ? state.createSelectedTagIds.slice(0, 20) : [])
      : [];
    var mediaPayload = await buildMediaPayloadFromInput("vc-forum-create-media");
    if (title.length < 3 || content.length < 2 || selectedTagIds.length < 1) {
      setState("Titolo, descrizione e almeno 1 tag sono obbligatori.", true);
      return;
    }
    try {
      var r = await fetch(resolvedApiUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + t,
        },
        body: JSON.stringify({ title: title, content: content, media: mediaPayload, tagIds: selectedTagIds }),
      });
      var body = await r.json().catch(function () { return null; });
      if (!r.ok || !body || body.ok !== true) throw new Error((body && body.message) || "Creazione thread fallita");
      if (titleEl) titleEl.value = "";
      if (bodyEl) bodyEl.value = "";
      var cMediaInput = byId("vc-forum-create-media");
      if (cMediaInput) cMediaInput.value = "";
      syncFileState("vc-forum-create-media", "vc-forum-create-media-state", "Nessun media selezionato");
      if (tagsEl) tagsEl.selectedIndex = -1;
      state.createSelectedTagIds = [];
      state.createTagsTouched = false;
      setCreateModalOpen(false);
      state.selectedThreadId = String((body.thread && body.thread.id) || "");
      state.unreadByThread[state.selectedThreadId] = 0;
      await loadThreads();
    } catch (err) {
      setState(err && err.message ? err.message : "Creazione discussione fallita.", true);
    }
  }

  async function patchThread(payload) {
    var tk = token();
    if (!tk || !state.selectedThreadId) return { ok: false, message: "Login richiesto." };
    var url = resolvedApiUrl() + "/" + encodeURIComponent(String(state.selectedThreadId));
    var r = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + tk,
      },
      body: JSON.stringify(payload || {}),
    });
    var body = await r.json().catch(function () { return null; });
    if (!r.ok || !body || body.ok !== true) {
      throw new Error((body && body.message) || "Modifica post fallita");
    }
    return body;
  }

  async function handleThreadAction(action) {
    if (!state.selectedThreadId || !state.selectedThread) return;
    var th = state.selectedThread;
    if (action === "rename") {
      var nextTitle = window.prompt("Nuovo titolo del post:", String(th.title || ""));
      if (nextTitle == null) return;
      nextTitle = String(nextTitle).trim();
      if (nextTitle.length < 3) {
        setState("Titolo troppo corto (min 3 caratteri).", true);
        return;
      }
      await patchThread({ title: nextTitle });
    } else if (action === "edit-content") {
      var current = "";
      var rows = Array.isArray(state.messagesByThread[state.selectedThreadId]) ? state.messagesByThread[state.selectedThreadId] : [];
      if (rows.length) current = String((rows[0] && rows[0].content) || "");
      var nextContent = window.prompt("Nuovo testo del post iniziale:", current);
      if (nextContent == null) return;
      nextContent = String(nextContent).trim();
      if (nextContent.length < 2) {
        setState("Testo troppo corto (min 2 caratteri).", true);
        return;
      }
      await patchThread({ content: nextContent });
    } else if (action === "archive") {
      await patchThread({ archived: true });
    } else if (action === "unarchive") {
      await patchThread({ archived: false });
    } else if (action === "lock") {
      await patchThread({ locked: true });
    } else if (action === "unlock") {
      await patchThread({ locked: false });
    }
    await loadMessages(state.selectedThreadId, true, "", false);
    await loadThreads();
    setState("Post aggiornato.", false);
  }

  function connectWs() {
    var url = buildWsUrl();
    if (!url || typeof WebSocket === "undefined") return;
    try {
      if (state.ws) {
        try { state.ws.close(); } catch (e) {}
        state.ws = null;
      }
      var ws = new WebSocket(url);
      state.ws = ws;
      ws.onmessage = function (ev) {
        var data = null;
        try { data = JSON.parse(String(ev && ev.data || "{}")); } catch (e) {}
        var type = String(data && data.type || "");
        if (type === "forum_changed" || type === "realtime_hello") {
          var changedThreadId = String(data && data.threadId || "");
          if (changedThreadId && changedThreadId !== state.selectedThreadId) {
            state.unreadByThread[changedThreadId] = Number(state.unreadByThread[changedThreadId] || 0) + 1;
          }
          loadThreads();
          if (changedThreadId && changedThreadId === state.selectedThreadId) {
            loadMessages(state.selectedThreadId, true, "", false);
          }
        }
      };
      ws.onclose = function () {
        if (state.ws === ws) state.ws = null;
        setTimeout(connectWs, 2500);
      };
    } catch (e) {}
  }

  function startPoll() {
    var ms = Math.max(5000, Number(cfg().livePollMs) || 9000);
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      loadThreads();
    }, ms);
  }

  function bind() {
    var list = byId("vc-forum-threads");
    if (list) {
      list.addEventListener("click", function (ev) {
        var prevBtn = ev.target && ev.target.closest ? ev.target.closest("#vc-forum-page-prev") : null;
        if (prevBtn && !prevBtn.disabled) {
          state.threadsPage = Math.max(1, Number(state.threadsPage || 1) - 1);
          renderThreads();
          return;
        }
        var nextBtn = ev.target && ev.target.closest ? ev.target.closest("#vc-forum-page-next") : null;
        if (nextBtn && !nextBtn.disabled) {
          state.threadsPage = Number(state.threadsPage || 1) + 1;
          renderThreads();
          return;
        }
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-thread-id]") : null;
        if (!btn) return;
        var tid = String(btn.getAttribute("data-thread-id") || "");
        if (!tid) return;
        if (tid === state.selectedThreadId) {
          state.selectedThreadId = "";
          renderThreads();
          resetChatPanel();
          syncForumLayout();
          return;
        }
        state.selectedThreadId = tid;
        state.selectedThreadSyncKey = "";
        state.forceScrollBottomOnce = true;
        state.unreadByThread[tid] = 0;
        state.messageCursorBefore = "";
        state.messageHasMore = false;
        renderThreads();
        loadMessages(tid, false, "", false);
        syncForumLayout();
      });
    }
    var threadHead = byId("vc-forum-thread-head");
    if (threadHead) {
      threadHead.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-thread-action]") : null;
        if (!btn) return;
        var action = String(btn.getAttribute("data-thread-action") || "");
        if (!action) return;
        handleThreadAction(action).catch(function (err) {
          setState(err && err.message ? err.message : "Azione sul post fallita.", true);
        });
      });
    }
    var search = byId("vc-forum-search");
    if (search) {
      search.addEventListener("input", function () {
        state.search = String(search.value || "");
        state.threadsPage = 1;
        renderThreads();
      });
    }
    var filterIds = ["vc-forum-filter-all", "vc-forum-filter-active", "vc-forum-filter-archived"];
    for (var i = 0; i < filterIds.length; i += 1) {
      var btn = byId(filterIds[i]);
      if (!btn) continue;
      btn.addEventListener("click", function (ev) {
        var b = ev.currentTarget;
        var next = String((b && b.getAttribute("data-forum-filter")) || "all");
        state.filter = next;
        state.threadsPage = 1;
        for (var j = 0; j < filterIds.length; j += 1) {
          var other = byId(filterIds[j]);
          if (!other) continue;
          var on = String(other.getAttribute("data-forum-filter") || "") === state.filter;
          toggle(other, "border-emerald-400/70", on);
          toggle(other, "bg-emerald-400/20", on);
          if (!on) {
            other.classList.remove("border-emerald-400/70");
            other.classList.remove("bg-emerald-400/20");
          }
        }
        renderThreads();
      });
    }
    var tagFilter = byId("vc-forum-filter-tag");
    if (tagFilter) {
      tagFilter.addEventListener("change", function () {
        state.tagFilterId = String(tagFilter.value || "");
        state.threadsPage = 1;
        renderThreads();
      });
    }
    var older = byId("vc-forum-load-older");
    if (older) {
      older.addEventListener("click", function () {
        if (!state.selectedThreadId || !state.messageHasMore || !state.messageCursorBefore) return;
        loadMessages(state.selectedThreadId, true, state.messageCursorBefore, true);
      });
    }
    var mf = byId("vc-forum-message-form");
    if (mf) mf.addEventListener("submit", postMessage);
    var cf = byId("vc-forum-create-form");
    if (cf) cf.addEventListener("submit", createThread);
    var openCreate = byId("vc-forum-open-create");
    if (openCreate) {
      openCreate.addEventListener("click", function () {
        if (openCreate.disabled) return;
        setCreateModalOpen(true);
      });
    }
    var closeCreate = byId("vc-forum-create-close");
    if (closeCreate) {
      closeCreate.addEventListener("click", function () {
        setCreateModalOpen(false);
      });
    }
    var modal = byId("vc-forum-create-modal");
    if (modal) {
      modal.addEventListener("click", function (ev) {
        if (ev.target === modal) setCreateModalOpen(false);
      });
    }
    window.addEventListener("keydown", function (ev) {
      if (String(ev && ev.key || "") === "Escape") setCreateModalOpen(false);
    });
    window.addEventListener("vc-discord-profile", function () {
      syncWriteUi();
    });
    window.addEventListener("resize", function () {
      syncChatPanelHeight();
    });
    var msgMedia = byId("vc-forum-message-media");
    if (msgMedia) {
      msgMedia.addEventListener("change", function () {
        syncFileState("vc-forum-message-media", "vc-forum-message-media-state", "Nessun media selezionato");
      });
    }
    var createMedia = byId("vc-forum-create-media");
    if (createMedia) {
      createMedia.addEventListener("change", function () {
        syncFileState("vc-forum-create-media", "vc-forum-create-media-state", "Nessun media selezionato");
      });
    }
    var createTags = byId("vc-forum-create-tags");
    if (createTags) {
      createTags.addEventListener("change", function () {
        var ids = createTags.selectedOptions
          ? Array.prototype.slice.call(createTags.selectedOptions).map(function (o) { return String(o.value || ""); }).filter(Boolean)
          : [];
        state.createSelectedTagIds = ids;
        state.createTagsTouched = true;
      });
    }
  }

  function main() {
    if (!byId("vc-forum-threads")) return;
    try {
      var qp = new URLSearchParams(window.location.search || "");
      var qThread = String(qp.get("thread") || "").trim();
      var qMessage = String(qp.get("message") || "").trim();
      if (/^\d{17,22}$/.test(qThread)) state.selectedThreadId = qThread;
      if (/^\d{17,22}$/.test(qMessage)) state.pendingMessageFocusId = qMessage;
    } catch (e) {}
    bind();
    syncWriteUi();
    loadThreads();
    syncForumLayout();
    startPoll();
    connectWs();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})(); 