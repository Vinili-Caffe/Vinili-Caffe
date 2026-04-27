(function () {
  var state = {
    threads: [],
    selectedThreadId: "",
    pollTimer: null,
    ws: null,
    loadingMessages: false,
    search: "",
    filter: "all",
    unreadByThread: {},
    messageCursorBefore: "",
    messageHasMore: false,
    messagesByThread: {},
    availableTags: [],
  };
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
    if (head) head.textContent = "Seleziona una discussione per aprire la chat.";
    var wrap = byId("vc-forum-messages");
    if (wrap) {
      wrap.innerHTML = '<p class="text-sm text-slate-300">Apri una discussione dalla lista a sinistra per leggere o scrivere messaggi.</p>';
    }
    state.messageCursorBefore = "";
    state.messageHasMore = false;
    syncLoadOlderButton();
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
          '<p class="mt-2 line-clamp-2 text-sm text-slate-300/90">' +
          esc(String(t.lastMessagePreview || "Nessuna anteprima disponibile.")) +
          "</p>" +
          "</button>"
        );
      };

    var pinnedRows = rows.filter(function (t) { return Boolean(t && t.pinned); });
    var activeRows = rows.filter(function (t) { return !t.pinned && !t.archived; });
    var archivedRows = rows.filter(function (t) { return !t.pinned && t.archived; });
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
        return (
          '<article class="rounded-xl border border-white/10 bg-black/30 p-3">' +
          '<p class="text-xs font-semibold text-emerald-200">' +
          esc((m.author && m.author.username) || "Utente") +
          "</p>" +
          (m.content
            ? '<p class="mt-1 whitespace-pre-wrap text-sm text-slate-100">' + esc(m.content || "") + "</p>"
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
    sidebar.classList.toggle("lg:max-w-[400px]", !opened);
    chat.classList.toggle("hidden", !opened);
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
      if (state.selectedThreadId) {
        await loadMessages(state.selectedThreadId, true);
      } else {
        resetChatPanel();
      }
      syncForumLayout();
    } catch (err) {
      setState(err && err.message ? err.message : "Errore caricamento discussioni.", true);
    }
  }

  async function loadMessages(threadId, quiet, beforeId, appendOlder) {
    if (!threadId || state.loadingMessages) return;
    state.loadingMessages = true;
    try {
      var url = resolvedApiUrl() + "/" + encodeURIComponent(String(threadId)) + "/messages";
      if (beforeId) {
        url += "?before=" + encodeURIComponent(String(beforeId));
      }
      var r = await fetch(url, { cache: "no-store", credentials: "omit" });
      var body = await r.json().catch(function () { return null; });
      if (!r.ok || !body || body.ok !== true) throw new Error((body && body.message) || "Errore caricamento messaggi");
      var th = body.thread || null;
      var head = byId("vc-forum-thread-head");
      if (head && th) {
        head.textContent = (th.title || "Discussione") + (th.archived ? " (archiviata)" : "");
      }
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
      if (!quiet) setState("", false);
    } catch (err) {
      if (!quiet) setState(err && err.message ? err.message : "Errore caricamento messaggi.", true);
    } finally {
      state.loadingMessages = false;
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
    var selectedTagIds = tagsEl && tagsEl.selectedOptions
      ? Array.prototype.slice.call(tagsEl.selectedOptions).map(function (o) { return String(o.value || ""); }).filter(Boolean)
      : [];
    var mediaPayload = await buildMediaPayloadFromInput("vc-forum-create-media");
    if (title.length < 3 || (content.length < 2 && mediaPayload.length < 1)) {
      setState("Inserisci titolo (min 3) e testo (min 2) oppure allega un media.", true);
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
      setCreateModalOpen(false);
      state.selectedThreadId = String((body.thread && body.thread.id) || "");
      state.unreadByThread[state.selectedThreadId] = 0;
      await loadThreads();
    } catch (err) {
      setState(err && err.message ? err.message : "Creazione discussione fallita.", true);
    }
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
        state.unreadByThread[tid] = 0;
        state.messageCursorBefore = "";
        state.messageHasMore = false;
        renderThreads();
        loadMessages(tid, false, "", false);
        syncForumLayout();
      });
    }
    var search = byId("vc-forum-search");
    if (search) {
      search.addEventListener("input", function () {
        state.search = String(search.value || "");
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
    var rf = byId("vc-forum-refresh");
    if (rf) rf.addEventListener("click", function () { loadThreads(); });
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
  }

  function main() {
    if (!byId("vc-forum-threads")) return;
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