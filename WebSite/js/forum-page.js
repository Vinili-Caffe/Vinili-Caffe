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
  };

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
    return state.threads.filter(function (t) {
      if (state.filter === "active" && t.archived) return false;
      if (state.filter === "archived" && !t.archived) return false;
      if (!q) return true;
      return String(t.title || "").toLowerCase().indexOf(q) !== -1 || String(t.lastMessagePreview || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderThreads() {
    var wrap = byId("vc-forum-threads");
    if (!wrap) return;
    var rows = filteredThreads();
    if (!rows.length) {
      wrap.innerHTML = '<p class="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">Nessuna discussione disponibile.</p>';
      return;
    }
    wrap.innerHTML = rows
      .map(function (t) {
        var active = String(t.id) === String(state.selectedThreadId);
        var unread = Number(state.unreadByThread[String(t.id)] || 0);
        return (
          '<button type="button" class="vc-forum-thread-item w-full rounded-xl border p-3 text-left ' +
          (active ? 'border-[#d4a888]/80 bg-[#d4a888]/20' : "border-white/10 bg-black/20 hover:border-white/30") +
          '" data-thread-id="' +
          esc(t.id) +
          '">' +
          '<p class="flex items-center justify-between gap-2 text-sm font-semibold text-white">' +
          '<span class="min-w-0 truncate">' +
          esc(t.title || "Discussione") +
          "</span>" +
          (unread > 0 ? '<span class="shrink-0 rounded-full bg-[#d4a888] px-2 py-0.5 text-[10px] font-bold text-[#2b1f19]">+' + esc(String(unread)) + "</span>" : "") +
          "</p>" +
          '<p class="mt-1 text-xs text-slate-300">' +
          (t.archived ? "Archiviato" : "Attivo") +
          " · " +
          esc(String(t.messageCount || 0)) +
          " msg</p>" +
          '<p class="mt-1 line-clamp-2 text-xs text-slate-400">' +
          esc(String(t.lastMessagePreview || "Nessuna anteprima disponibile.")) +
          "</p>" +
          "</button>"
        );
      })
      .join("");
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
          '<p class="text-xs font-semibold text-[#e8c9a8]">' +
          esc((m.author && m.author.username) || "Utente") +
          "</p>" +
          '<p class="mt-1 whitespace-pre-wrap text-sm text-slate-100">' +
          esc(m.content || "") +
          "</p>" +
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

  function syncWriteUi() {
    var hasToken = Boolean(token());
    var msgInput = byId("vc-forum-message-input");
    var msgBtn = byId("vc-forum-message-send");
    var cTitle = byId("vc-forum-create-title");
    var cBody = byId("vc-forum-create-content");
    var cBtn = byId("vc-forum-create-send");
    if (msgInput) msgInput.disabled = !hasToken;
    if (msgBtn) msgBtn.disabled = !hasToken;
    if (cTitle) cTitle.disabled = !hasToken;
    if (cBody) cBody.disabled = !hasToken;
    if (cBtn) cBtn.disabled = !hasToken;
    if (!hasToken) {
      setState("Per scrivere nel forum devi prima fare login Discord.", false);
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
      if (!state.selectedThreadId && state.threads.length) state.selectedThreadId = String(state.threads[0].id);
      if (state.selectedThreadId && !state.threads.some(function (t) { return String(t.id) === String(state.selectedThreadId); })) {
        state.selectedThreadId = state.threads.length ? String(state.threads[0].id) : "";
      }
      renderThreads();
      if (state.selectedThreadId) await loadMessages(state.selectedThreadId, true);
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
    if (content.length < 1) return;
    try {
      var url = resolvedApiUrl() + "/" + encodeURIComponent(String(state.selectedThreadId)) + "/messages";
      var r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + t,
        },
        body: JSON.stringify({ content: content }),
      });
      var body = await r.json().catch(function () { return null; });
      if (!r.ok || !body || body.ok !== true) throw new Error((body && body.message) || "Invio fallito");
      if (input) input.value = "";
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
    if (title.length < 3 || content.length < 2) {
      setState("Inserisci titolo (min 3) e messaggio (min 2).", true);
      return;
    }
    try {
      var r = await fetch(resolvedApiUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + t,
        },
        body: JSON.stringify({ title: title, content: content }),
      });
      var body = await r.json().catch(function () { return null; });
      if (!r.ok || !body || body.ok !== true) throw new Error((body && body.message) || "Creazione thread fallita");
      if (titleEl) titleEl.value = "";
      if (bodyEl) bodyEl.value = "";
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
        if (!tid || tid === state.selectedThreadId) return;
        state.selectedThreadId = tid;
        state.unreadByThread[tid] = 0;
        state.messageCursorBefore = "";
        state.messageHasMore = false;
        renderThreads();
        loadMessages(tid, false, "", false);
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
          toggle(other, "border-[#d4a888]/70", on);
          toggle(other, "bg-[#d4a888]/20", on);
          if (!on) {
            other.classList.remove("border-[#d4a888]/70");
            other.classList.remove("bg-[#d4a888]/20");
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
    window.addEventListener("vc-discord-profile", function () {
      syncWriteUi();
    });
  }

  function main() {
    if (!byId("vc-forum-threads")) return;
    bind();
    syncWriteUi();
    loadThreads();
    startPoll();
    connectWs();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})(); 