(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var state = {
    payload: null,
    editModalOpen: false,
    editSuggestionId: null,
    draftContent: "",
    pendingReply: null,
    editingComment: null,
    livePollTimer: null,
    suggestionsWs: null,
    wsReconnectTimer: null,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function getDiscordUserSync() {
    var u = typeof window !== "undefined" ? window.__VC_DISCORD_PROFILE : null;
    if (!u || typeof u !== "object") return null;
    if (u.id || u.username) return u;
    return null;
  }

  function hideGate() {
    var g = byId("vc-suggestions-gate");
    if (!g) return;
    g.setAttribute("hidden", "");
    g.classList.add("vc-reviews-gate--dismissed");
    g.setAttribute("aria-hidden", "true");
  }

  function showGate() {
    var g = byId("vc-suggestions-gate");
    if (!g) return;
    g.removeAttribute("hidden");
    g.classList.remove("vc-reviews-gate--dismissed");
    g.setAttribute("aria-hidden", "false");
  }

  function wireGateLoginCta() {
    var gateBtn = byId("vc-suggestions-gate-login-cta");
    var headerBtn = byId("discord-login-btn");
    if (!gateBtn) return;
    gateBtn.addEventListener("click", function () {
      if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
        window.__vcDiscordStartOAuthRedirect(gateBtn);
        return;
      }
      if (headerBtn) headerBtn.click();
    });
  }

  function stopLiveSuggestionsPoll() {
    if (state.livePollTimer) {
      clearInterval(state.livePollTimer);
      state.livePollTimer = null;
    }
  }

  function clearContent() {
    disconnectSuggestionsWebSocket();
    stopLiveSuggestionsPoll();
    state.payload = null;
    state.editModalOpen = false;
    state.editSuggestionId = null;
    state.pendingReply = null;
    state.editingComment = null;
    var wrap = byId("vc-suggestions-list");
    if (wrap) wrap.innerHTML = "";
    closeModalDom();
  }

  function closeModalDom() {
    state.editModalOpen = false;
    state.editSuggestionId = null;
    var root = byId("vc-suggestions-edit-modal");
    if (root) {
      root.innerHTML = "";
      root.className = "vc-reviews-modal";
      root.hidden = true;
    }
    try {
      document.documentElement.classList.remove("vc-reviews-modal-open");
    } catch (e) {}
  }

  function shouldUnlockPage() {
    return Boolean(getDiscordUserSync());
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_SITE_SUGGESTIONS) || {};
  }

  function livePollIntervalMs() {
    var n = Number(cfg().livePollMs);
    if (Number.isFinite(n) && n >= 3000 && n <= 120000) return Math.floor(n);
    return 6000;
  }

  function isTypingInSuggestionField() {
    var a = document.activeElement;
    if (!a || !a.id) return false;
    var id = String(a.id);
    if (id.indexOf("vc-sug-comment-") === 0) return true;
    if (id.indexOf("vc-sug-comment-edit-") === 0) return true;
    if (id.indexOf("vc-sug-staff-reason-") === 0) return true;
    return false;
  }

  function refreshPayloadQuiet() {
    if (state.editModalOpen || state.editingComment || isTypingInSuggestionField()) return Promise.resolve();
    if (!byId("vc-suggestions-list")) return Promise.resolve();
    return fetch(apiUrl(), {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    })
      .then(parseSuggestionsApiJson)
      .then(function (body) {
        if (!body || body.ok !== true) return;
        state.payload = body;
        render();
      })
      .catch(function () {});
  }

  function startLiveSuggestionsPoll() {
    stopLiveSuggestionsPoll();
    if (state.suggestionsWs && state.suggestionsWs.readyState === 1) return;
    state.livePollTimer = setInterval(function () {
      if (document.visibilityState === "hidden") return;
      void refreshPayloadQuiet();
    }, livePollIntervalMs());
  }

  function suggestionsWsUrl() {
    var explicit = String(cfg().wsUrl || "").trim();
    if (explicit) return explicit;
    var api = apiUrl();
    if (!api || typeof URL === "undefined") return "";
    try {
      var u = new URL(api);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      var path = String(u.pathname || "").replace(/\/$/, "");
      var dir = path.replace(/\/[^/]+$/, "");
      u.pathname = (dir || "") + "/site-realtime-ws";
      u.search = "";
      u.hash = "";
      return u.href;
    } catch (e) {
      return "";
    }
  }

  function disconnectSuggestionsWebSocket() {
    if (state.wsReconnectTimer) {
      clearTimeout(state.wsReconnectTimer);
      state.wsReconnectTimer = null;
    }
    try {
      if (state.suggestionsWs) {
        state.suggestionsWs.onclose = null;
        state.suggestionsWs.close();
      }
    } catch (e2) {}
    state.suggestionsWs = null;
  }

  function scheduleSuggestionsWsReconnect() {
    if (state.wsReconnectTimer) return;
    state.wsReconnectTimer = setTimeout(function () {
      state.wsReconnectTimer = null;
      connectSuggestionsWebSocket();
    }, 8000);
  }

  function connectSuggestionsWebSocket() {
    if (typeof WebSocket === "undefined") return;
    var url = suggestionsWsUrl();
    if (!url) return;
    disconnectSuggestionsWebSocket();
    try {
      var ws = new WebSocket(url);
      state.suggestionsWs = ws;
      ws.onopen = function () {
        stopLiveSuggestionsPoll();
      };
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || "{}"));
          if (data.type === "suggestions_changed" || data.type === "suggestions_hello") {
            void refreshPayloadQuiet();
          }
        } catch (e3) {}
      };
      ws.onclose = function () {
        state.suggestionsWs = null;
        startLiveSuggestionsPoll();
        scheduleSuggestionsWsReconnect();
      };
      ws.onerror = function () {
        try {
          ws.close();
        } catch (e4) {}
      };
    } catch (e5) {
      state.suggestionsWs = null;
    }
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function getToken() {
    var token = localStorage.getItem(ACCESS_TOKEN_KEY);
    var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
    if (!token || !exp || Date.now() >= exp) return "";
    return token;
  }

  function apiUrl() {
    var conf = cfg();
    var host = String(window.location.hostname || "").toLowerCase();
    var local = String(conf.apiUrlLocal || "").trim();
    var remote = String(conf.apiUrl || "").trim();
    if ((host === "localhost" || host === "127.0.0.1") && local) return local;
    return remote || local;
  }

  /** Evita `response.json()` su pagine HTML (manutenzione, 502, path sbagliato): messaggio leggibile. */
  function parseSuggestionsApiJson(response) {
    return response.text().then(function (text) {
      var s = String(text || "").trim();
      if (!s) {
        throw new Error("Risposta vuota dall'API suggerimenti.");
      }
      if (s.charCodeAt(0) === 65279) {
        s = s.slice(1).trim();
      }
      if (s.charAt(0) === "<") {
        throw new Error(
          "Il server ha risposto con una pagina HTML invece che con JSON: spesso sito in manutenzione, bot offline o URL `suggestionsApiUrl` che non punta a `/webhooks/site-suggestions`. Controlla `site.config.json` e che il bot sia avviato con gli HTTP webhook attivi.",
        );
      }
      try {
        return JSON.parse(s);
      } catch (e) {
        throw new Error("Risposta non JSON dall'API suggerimenti.");
      }
    });
  }

  function formatDateIt(value) {
    var date = value ? new Date(value) : null;
    if (!date || !Number.isFinite(date.getTime())) return "";
    try {
      return date.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch (e) {
      return date.toISOString().slice(0, 10);
    }
  }

  function statusLabel(st) {
    var s = String(st || "pending");
    if (s === "accepted") return "Accettato";
    if (s === "rejected") return "Rifiutato";
    return "In valutazione";
  }

  function orderedSuggestionComments(s) {
    var flat = Array.isArray(s.comments) ? s.comments : [];
    function ts(x) {
      return new Date(x.createdAt || 0).getTime();
    }
    function sortArr(arr) {
      return arr.slice().sort(function (a, b) {
        return ts(a) - ts(b);
      });
    }
    var roots = sortArr(
      flat.filter(function (c) {
        return !c.parentCommentId;
      }),
    );
    var out = [];
    roots.forEach(function (r) {
      out.push(r);
      sortArr(
        flat.filter(function (c) {
          return String(c.parentCommentId || "") === String(r.id);
        }),
      ).forEach(function (ch) {
        out.push(ch);
      });
    });
    return out;
  }

  function setStatus(text, isError) {
    var node = byId("vc-suggestions-status");
    if (!node) return;
    if (!text) {
      node.hidden = true;
      node.textContent = "";
      node.className = "vc-reviews-status";
      return;
    }
    node.hidden = false;
    node.textContent = text;
    node.className = "vc-reviews-status" + (isError ? " is-error" : "");
  }

  function suggestionCardMarkup(s) {
    var viewer = state.payload && state.payload.viewer;
    var tokenOk = Boolean(getToken());
    var canMod = Boolean(viewer && viewer.canModerateSuggestions);
    var pending = String(s.status || "") === "pending";
    var rawSid = String(s.id || "").trim();
    var viewerId = viewer && viewer.id ? String(viewer.id) : "";
    var isOwnSuggestion = Boolean(viewerId && String(s.userId || "") === viewerId);

    var staffBox = "";
    if (!pending && String(s.staffReason || "").trim()) {
      staffBox =
        '<div class="vc-reviews-card__reply">' +
        '<span class="vc-reviews-card__reply-label">Decisione staff</span>' +
        '<p class="vc-reviews-card__reply-text">' +
        esc(s.staffReason) +
        "</p>" +
        (s.decidedAt ? '<span class="vc-reviews-card__reply-meta">' + esc(formatDateIt(s.decidedAt)) + "</span>" : "") +
        "</div>";
    }

    var pr = state.pendingReply;
    var prLine = "";
    if (pending && tokenOk && pr && pr.suggestionId === rawSid) {
      prLine =
        '<p class="mt-2 text-xs text-teal-200/90">Risposta a <strong>' +
        esc(pr.parentName || "commento") +
        '</strong> · <button type="button" class="text-teal-100 underline" data-suggestion-reply-cancel="' +
        esc(rawSid) +
        '">Annulla</button></p>';
    }

    var ordered = orderedSuggestionComments(s);
    var threadHtml =
      '<div class="mt-4 space-y-3 border-t border-white/10 pt-4">' +
      '<p class="text-xs font-semibold uppercase tracking-wider text-slate-400">Discussione</p>';
    if (!ordered.length) {
      threadHtml += '<p class="text-sm text-slate-400">Nessun commento ancora.</p>';
    } else {
      threadHtml += ordered
        .map(function (c) {
          var cid = String(c.id || "").trim();
          var isOwnComment = Boolean(viewerId && String(c.userId || "") === viewerId);
          var isEditing =
            state.editingComment &&
            state.editingComment.suggestionId === rawSid &&
            state.editingComment.commentId === cid;
          var cup = Math.max(0, Math.round(Number(c.upvoteCount || 0)));
          var cdn = Math.max(0, Math.round(Number(c.downvoteCount || 0)));
          var cupOn = Boolean(c.upvotedByViewer);
          var cdnOn = Boolean(c.downvotedByViewer);
          var cvoteLock = !pending || !tokenOk || isOwnComment;
          var cvTitle = !pending ? "Discussione chiusa" : !tokenOk ? "Accedi per votare" : isOwnComment ? "Non sul tuo commento" : "";
          var cvEx = cvoteLock ? ' disabled title="' + esc(cvTitle) + '"' : "";

          var actions = "";
          if (pending && tokenOk && !c.parentCommentId) {
            actions +=
              '<button type="button" class="mt-2 text-xs text-teal-200 underline" data-suggestion-reply-start="' +
              esc(rawSid) +
              '" data-suggestion-reply-parent="' +
              esc(cid) +
              '" data-suggestion-reply-name="' +
              esc(c.authorName || "Utente") +
              '">Rispondi</button>';
          }
          if (pending && tokenOk && isOwnComment) {
            actions +=
              (actions ? " " : "") +
              '<button type="button" class="mt-2 text-xs text-slate-300 underline" data-suggestion-comment-edit-start="' +
              esc(rawSid) +
              '" data-suggestion-comment-edit-id="' +
              esc(cid) +
              '">Modifica</button>' +
              ' <button type="button" class="mt-2 text-xs text-red-300 underline" data-suggestion-comment-delete="' +
              esc(rawSid) +
              '" data-suggestion-comment-delete-id="' +
              esc(cid) +
              '">Elimina</button>';
          } else if (pending && canMod && !isOwnComment) {
            actions +=
              (actions ? " " : "") +
              '<button type="button" class="mt-2 text-xs text-amber-200 underline" data-suggestion-comment-delete="' +
              esc(rawSid) +
              '" data-suggestion-comment-delete-id="' +
              esc(cid) +
              '">Elimina (staff)</button>';
          }

          var innerBody = "";
          if (isEditing) {
            innerBody =
              '<textarea id="vc-sug-comment-edit-' +
              esc(cid) +
              '" class="vc-reviews-textarea mt-2" rows="2">' +
              esc(c.content) +
              "</textarea>" +
              '<div class="mt-2 flex flex-wrap gap-2">' +
              '<button type="button" class="vc-reviews-submit" data-suggestion-comment-edit-save="' +
              esc(rawSid) +
              '" data-suggestion-comment-edit-save-id="' +
              esc(cid) +
              '">Salva</button>' +
              '<button type="button" class="vc-reviews-submit vc-suggestions-btn-muted" data-suggestion-comment-edit-cancel="' +
              esc(rawSid) +
              '">Annulla</button>' +
              "</div>";
          } else {
            innerBody = '<p class="mt-2 text-sm leading-relaxed text-slate-200/90">' + esc(c.content) + "</p>";
          }

          var replyCls = c.parentCommentId
            ? " vc-suggestions-comment-card--reply vc-sug-comment--reply ml-5 border-l border-white/15 pl-4"
            : "";

          return (
            '<div class="vc-suggestions-comment-card rounded-xl border border-white/8 bg-white/[0.03] p-3' +
            replyCls +
            '">' +
            '<div class="flex flex-wrap items-center gap-2 text-sm">' +
            (c.authorAvatarUrl
              ? '<img class="h-7 w-7 rounded-full object-cover" src="' +
                esc(c.authorAvatarUrl) +
                '" alt="" loading="lazy" />'
              : '<span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10"><i class="fa fa-user text-slate-300"></i></span>') +
            "<strong>" +
            esc(c.authorName || "Utente") +
            "</strong>" +
            '<span class="text-xs text-slate-500">' +
            esc(formatDateIt(c.updatedAt || c.createdAt)) +
            "</span>" +
            '<span class="flex flex-1 flex-wrap items-center justify-end gap-2">' +
            '<button type="button" class="vc-reviews-like text-xs' +
            (cupOn ? " is-liked" : "") +
            '" data-suggestion-comment-vote-up="' +
            esc(rawSid) +
            '" data-suggestion-comment-vote-id="' +
            esc(cid) +
            '"' +
            cvEx +
            '><i class="fa ' +
            (cupOn ? "fa-thumbs-up" : "fa-thumbs-o-up") +
            '" aria-hidden="true"></i><span class="vc-reviews-like__n">' +
            esc(String(cup)) +
            '</span></button>' +
            '<button type="button" class="vc-reviews-like vc-suggestions-vote--down text-xs' +
            (cdnOn ? " is-down" : "") +
            '" data-suggestion-comment-vote-down="' +
            esc(rawSid) +
            '" data-suggestion-comment-vote-id="' +
            esc(cid) +
            '"' +
            cvEx +
            '><i class="fa ' +
            (cdnOn ? "fa-thumbs-down" : "fa-thumbs-o-down") +
            '" aria-hidden="true"></i><span class="vc-reviews-like__n">' +
            esc(String(cdn)) +
            "</span></button></span></div>" +
            innerBody +
            actions +
            "</div>"
          );
        })
        .join("");
    }
    if (pending && tokenOk) {
      threadHtml +=
        prLine +
        '<div class="mt-3">' +
        '<label class="mb-1 block text-xs font-medium text-slate-400" for="vc-sug-comment-' +
        esc(rawSid) +
        '">Il tuo commento</label>' +
        '<textarea id="vc-sug-comment-' +
        esc(rawSid) +
        '" class="vc-reviews-textarea" rows="2" placeholder="Scrivi un commento o una risposta..."></textarea>' +
        '<div class="mt-2">' +
        '<button type="button" class="vc-reviews-submit" data-suggestion-comment-submit="' +
        esc(rawSid) +
        '">Pubblica</button>' +
        "</div></div>";
    } else if (pending && !tokenOk) {
      threadHtml += '<p class="text-sm text-slate-500">Accedi con Discord per commentare.</p>';
    }
    threadHtml += "</div>";

    var staffActions = "";
    if (pending && canMod) {
      staffActions =
        '<div class="vc-suggestions-staff-card mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">' +
        '<p class="vc-suggestions-staff-card__title text-xs font-semibold uppercase tracking-wider text-amber-200/80">High Staff</p>' +
        '<label class="vc-suggestions-staff-card__label mt-2 mb-1 block text-xs text-slate-400" for="vc-sug-staff-reason-' +
        esc(rawSid) +
        '">Motivo (obbligatorio, min. 3 caratteri)</label>' +
        '<textarea id="vc-sug-staff-reason-' +
        esc(rawSid) +
        '" class="vc-reviews-textarea" rows="2" placeholder="Motivazione visibile nella scheda..."></textarea>' +
        '<div class="mt-3 flex flex-wrap gap-2">' +
        '<button type="button" class="vc-reviews-submit" data-suggestion-accept="' +
        esc(rawSid) +
        '">Accetta</button>' +
        '<button type="button" class="vc-reviews-submit vc-suggestions-btn-danger" data-suggestion-reject="' +
        esc(rawSid) +
        '">Rifiuta</button>' +
        "</div></div>";
    }

    var staffDelete = "";
    if (canMod) {
      staffDelete =
        '<div class="vc-suggestions-staff-delete-card mt-4 rounded-xl border border-slate-500/30 bg-slate-900/40 p-3">' +
        '<p class="vc-suggestions-staff-delete-card__title text-xs font-semibold uppercase tracking-wider text-slate-300/90">High Staff</p>' +
        '<button type="button" class="vc-reviews-submit vc-suggestions-btn-muted mt-2" data-suggestion-staff-delete="' +
        esc(rawSid) +
        '">Elimina definitivamente</button>' +
        '<p class="vc-suggestions-staff-delete-card__note mt-1 text-xs text-slate-500">Rimuove il suggerimento dal database (irreversibile).</p>' +
        "</div>";
    }

    var authorTools = "";
    if (pending && tokenOk && isOwnSuggestion) {
      authorTools =
        '<div class="mt-2 flex flex-wrap gap-2">' +
        '<button type="button" class="vc-reviews-submit vc-suggestions-btn-muted" data-suggestion-author-edit="' +
        esc(rawSid) +
        '">Modifica suggerimento</button>' +
        '<button type="button" class="vc-reviews-submit vc-suggestions-btn-danger" data-suggestion-author-delete="' +
        esc(rawSid) +
        '">Elimina il mio suggerimento</button></div>';
    }

    var statusWrap =
      "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ";
    if (String(s.status) === "accepted") {
      statusWrap += "border-emerald-400/35 bg-emerald-500/15 text-emerald-100";
    } else if (String(s.status) === "rejected") {
      statusWrap += "border-red-400/35 bg-red-500/12 text-red-100";
    } else {
      statusWrap += "border-amber-400/35 bg-amber-500/10 text-amber-100";
    }

    var upc = Math.max(0, Math.round(Number(s.upvoteCount || 0)));
    var dwc = Math.max(0, Math.round(Number(s.downvoteCount || 0)));
    var upOn = Boolean(s.upvotedByViewer);
    var downOn = Boolean(s.downvotedByViewer);
    var voteLocked = !pending || !tokenOk;
    var voteTitle = !pending ? "Votazione chiusa" : !tokenOk ? "Accedi con Discord per votare" : "";
    var voteExtras = voteLocked ? ' disabled title="' + esc(voteTitle) + '"' : "";
    var voteHtml =
      '<div class="vc-reviews-card__foot">' +
      '<button type="button" class="vc-reviews-like' +
      (upOn ? " is-liked" : "") +
      '" data-suggestion-vote="' +
      esc(rawSid) +
      '" data-vote-dir="up"' +
      voteExtras +
      '><i class="fa ' +
      (upOn ? "fa-thumbs-up" : "fa-thumbs-o-up") +
      '" aria-hidden="true"></i><span class="vc-reviews-like__n">' +
      esc(String(upc)) +
      '</span></button>' +
      '<button type="button" class="vc-reviews-like vc-suggestions-vote--down' +
      (downOn ? " is-down" : "") +
      '" data-suggestion-vote="' +
      esc(rawSid) +
      '" data-vote-dir="down"' +
      voteExtras +
      '><i class="fa ' +
      (downOn ? "fa-thumbs-down" : "fa-thumbs-o-down") +
      '" aria-hidden="true"></i><span class="vc-reviews-like__n">' +
      esc(String(dwc)) +
      "</span></button></div>";

    return (
      '<article class="vc-reviews-card" id="vc-suggestion-' +
      esc(rawSid) +
      '" data-suggestion-id="' +
      esc(rawSid) +
      '">' +
      '<div class="vc-reviews-card__head">' +
      '<div class="vc-reviews-card__author">' +
      (s.authorAvatarUrl
        ? '<img class="vc-reviews-card__avatar" src="' + esc(s.authorAvatarUrl) + '" alt="" loading="lazy" decoding="async" />'
        : '<span class="vc-reviews-card__avatar vc-reviews-card__avatar--fallback"><i class="fa fa-user"></i></span>') +
      '<div><strong>' +
      esc(s.authorName || "Utente") +
      "</strong>" +
      '<span>' +
      esc(formatDateIt(s.updatedAt || s.createdAt)) +
      "</span></div></div>" +
      '<div class="vc-reviews-card__head-meta">' +
      '<span class="' +
      statusWrap +
      '">' +
      esc(statusLabel(s.status)) +
      "</span></div></div>" +
      authorTools +
      '<p class="vc-reviews-card__text">' +
      esc(s.content) +
      "</p>" +
      voteHtml +
      staffBox +
      threadHtml +
      staffActions +
      staffDelete +
      "</article>"
    );
  }

  function emptyMarkup() {
    return (
      '<article class="vc-reviews-empty">' +
      '<span class="vc-reviews-empty__icon"><i class="fa fa-lightbulb-o" aria-hidden="true"></i></span>' +
      "<strong>Nessun suggerimento</strong>" +
      "<p>Sii il primo a proporre un&apos;idea per la community.</p>" +
      "</article>"
    );
  }

  function ensureModalRoot() {
    var root = byId("vc-suggestions-edit-modal");
    if (!root) {
      root = document.createElement("div");
      root.id = "vc-suggestions-edit-modal";
      document.body.appendChild(root);
    }
    return root;
  }

  function modalInnerMarkup() {
    var isEdit = Boolean(state.editSuggestionId);
    var title = isEdit ? "Modifica suggerimento" : "Nuovo suggerimento";
    var btnLabel = isEdit ? "Salva modifiche" : "Invia suggerimento";
    return (
      '<div class="vc-reviews-modal__backdrop" data-suggestion-modal-dismiss tabindex="-1"></div>' +
      '<div class="vc-reviews-modal__panel" role="dialog" aria-modal="true" aria-labelledby="vc-suggestions-modal-title">' +
      '<div class="vc-reviews-modal__toolbar">' +
      '<h2 id="vc-suggestions-modal-title" class="vc-reviews-modal__title">' +
      esc(title) +
      "</h2>" +
      '<button type="button" class="vc-reviews-modal__close" data-suggestion-modal-dismiss aria-label="Chiudi"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-reviews-modal__body">' +
      '<div class="vc-reviews-field"><label for="vc-suggestion-modal-content">Testo (minimo 12 caratteri)</label>' +
      '<textarea id="vc-suggestion-modal-content" class="vc-reviews-textarea" rows="6" placeholder="Descrivi la tua idea in modo chiaro...">' +
      esc(state.draftContent) +
      "</textarea></div>" +
      '<div class="vc-reviews-formcard__actions">' +
      '<button type="button" class="vc-reviews-submit" data-suggestion-submit>' +
      esc(btnLabel) +
      "</button>" +
      "</div></div></div>"
    );
  }

  function syncModal() {
    var root = ensureModalRoot();
    if (!state.editModalOpen) {
      root.innerHTML = "";
      root.className = "vc-reviews-modal";
      root.hidden = true;
      try {
        document.documentElement.classList.remove("vc-reviews-modal-open");
      } catch (e0) {}
      return;
    }
    root.hidden = false;
    root.innerHTML = modalInnerMarkup();
    root.className = "vc-reviews-modal vc-reviews-modal--open";
    try {
      document.documentElement.classList.add("vc-reviews-modal-open");
    } catch (e1) {}
  }

  function openFormModal() {
    var token = getToken();
    var viewer = state.payload && state.payload.viewer;
    if (!token || !viewer || !viewer.id) {
      setStatus("Devi effettuare il login con Discord per pubblicare un suggerimento.", true);
      return;
    }
    state.editSuggestionId = null;
    state.draftContent = "";
    state.editModalOpen = true;
    render();
    var ta = byId("vc-suggestion-modal-content");
    if (ta) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          try {
            ta.focus();
          } catch (e2) {}
        });
      });
    }
  }

  function syncHeadButton() {
    var btn = byId("vc-suggestions-open-form-btn");
    if (!btn) return;
    var viewer = state.payload && state.payload.viewer;
    var tokenOk = Boolean(getToken());
    var isLogged = Boolean(viewer && viewer.id);
    btn.hidden = false;
    if (!isLogged || !tokenOk) {
      btn.textContent = "Nuovo suggerimento";
      btn.setAttribute("aria-label", "Accedi con Discord per pubblicare un suggerimento");
    } else {
      btn.textContent = "Nuovo suggerimento";
      btn.setAttribute("aria-label", "Apri modulo nuovo suggerimento");
    }
    btn.onclick = function () {
      openFormModal();
    };
  }

  function applySuggestionDeepLink() {
    try {
      var h = String(window.location.hash || "").trim();
      if (!h || h.indexOf("#vc-suggestion-") !== 0) return;
      var raw = h.slice("#vc-suggestion-".length).trim();
      if (!raw || !/^[a-f0-9]{24}$/i.test(raw)) return;
      var el = document.getElementById("vc-suggestion-" + raw);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("vc-deep-link-flash");
      window.setTimeout(function () {
        try {
          el.classList.remove("vc-deep-link-flash");
        } catch (e0) {}
      }, 2200);
    } catch (e1) {}
  }

  function render() {
    var wrap = byId("vc-suggestions-list");
    if (!wrap) return;
    var list = (state.payload && state.payload.suggestions) || [];
    wrap.innerHTML = list.length ? list.map(function (s) { return suggestionCardMarkup(s); }).join("") : emptyMarkup();
    syncModal();
    syncHeadButton();
    bind();
    window.requestAnimationFrame(function () {
      applySuggestionDeepLink();
    });
  }

  function bind() {
    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-modal-dismiss]")).forEach(function (el) {
      el.addEventListener("click", function () {
        state.editModalOpen = false;
        state.editSuggestionId = null;
        render();
      });
    });

    var taModal = byId("vc-suggestion-modal-content");
    if (taModal) {
      taModal.addEventListener("input", function () {
        state.draftContent = taModal.value;
      });
    }

    var submitBtn = document.querySelector("[data-suggestion-submit]");
    if (submitBtn) {
      submitBtn.addEventListener("click", function () {
        submitNewSuggestion();
      });
    }

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-vote]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var id = String(btn.getAttribute("data-suggestion-vote") || "").trim();
        var dir = String(btn.getAttribute("data-vote-dir") || "").trim();
        if (!id || (dir !== "up" && dir !== "down")) return;
        submitSuggestionVote(id, dir, btn);
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-submit]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = String(btn.getAttribute("data-suggestion-comment-submit") || "").trim();
        if (!id) return;
        var ta = byId("vc-sug-comment-" + id);
        var text = ta ? String(ta.value || "").trim() : "";
        if (text.length < 2) {
          setStatus("Il commento è troppo breve.", true);
          return;
        }
        var pr = state.pendingReply;
        var body = { content: text };
        if (pr && pr.suggestionId === id && pr.parentCommentId) {
          body.parentCommentId = pr.parentCommentId;
        }
        btn.disabled = true;
        setStatus("Pubblicazione commento...", false);
        fetch(apiUrl() + "/" + encodeURIComponent(id) + "/comments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken(),
          },
          body: JSON.stringify(body),
        })
          .then(parseSuggestionsApiJson)
          .then(function (body) {
            if (!body || body.ok !== true) {
              throw new Error((body && body.message) || "Errore commento.");
            }
            if (ta) ta.value = "";
            state.pendingReply = null;
            setStatus(body.message || "Commento pubblicato.", false);
            return fetchPayload();
          })
          .catch(function (err) {
            setStatus(err && err.message ? err.message : "Errore.", true);
          })
          .then(function () {
            btn.disabled = false;
          });
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-reply-start]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sid = String(btn.getAttribute("data-suggestion-reply-start") || "").trim();
        var pid = String(btn.getAttribute("data-suggestion-reply-parent") || "").trim();
        var nm = String(btn.getAttribute("data-suggestion-reply-name") || "").trim() || "Utente";
        if (!sid || !pid) return;
        state.pendingReply = { suggestionId: sid, parentCommentId: pid, parentName: nm };
        render();
        var ta = byId("vc-sug-comment-" + sid);
        if (ta) {
          try {
            ta.focus();
          } catch (e0) {}
        }
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-reply-cancel]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.pendingReply = null;
        render();
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-author-edit]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sid = String(btn.getAttribute("data-suggestion-author-edit") || "").trim();
        if (!sid) return;
        var list = (state.payload && state.payload.suggestions) || [];
        var row = list.find(function (x) {
          return String(x.id) === sid;
        });
        if (!row) return;
        state.editModalOpen = true;
        state.editSuggestionId = sid;
        state.draftContent = String(row.content || "");
        render();
        var ta = byId("vc-suggestion-modal-content");
        if (ta) {
          window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
              try {
                ta.focus();
              } catch (e1) {}
            });
          });
        }
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-author-delete]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = String(btn.getAttribute("data-suggestion-author-delete") || "").trim();
        if (!id || !getToken()) return;
        if (!window.confirm("Eliminare il tuo suggerimento? Non potrai ripristinarlo.")) return;
        btn.disabled = true;
        setStatus("Eliminazione in corso...", false);
        fetch(apiUrl() + "/" + encodeURIComponent(id), {
          method: "DELETE",
          headers: { Authorization: "Bearer " + getToken() },
        })
          .then(parseSuggestionsApiJson)
          .then(function (body) {
            if (!body || body.ok !== true) {
              throw new Error((body && body.message) || "Eliminazione non riuscita.");
            }
            setStatus(body.message || "Eliminato.", false);
            return fetchPayload();
          })
          .catch(function (err) {
            setStatus(err && err.message ? err.message : "Errore.", true);
          })
          .then(function () {
            btn.disabled = false;
          });
      });
    });

    function submitCommentVote(suggestionId, commentId, direction, buttonEl) {
      var token = getToken();
      if (!token) {
        setStatus("Accedi con Discord per votare.", true);
        return;
      }
      if (buttonEl) buttonEl.disabled = true;
      setStatus("", false);
      fetch(
        apiUrl() + "/" + encodeURIComponent(suggestionId) + "/comments/" + encodeURIComponent(commentId) + "/vote",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ direction: direction }),
        },
      )
        .then(parseSuggestionsApiJson)
        .then(function (body) {
          if (!body || body.ok !== true) {
            throw new Error((body && body.message) || "Voto non registrato.");
          }
          return fetchPayload();
        })
        .catch(function (err) {
          setStatus(err && err.message ? err.message : "Errore voto.", true);
        })
        .then(function () {
          if (buttonEl) buttonEl.disabled = false;
        });
    }

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-vote-up]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var sid = String(btn.getAttribute("data-suggestion-comment-vote-up") || "").trim();
        var cid = String(btn.getAttribute("data-suggestion-comment-vote-id") || "").trim();
        if (!sid || !cid) return;
        submitCommentVote(sid, cid, "up", btn);
      });
    });
    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-vote-down]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var sid = String(btn.getAttribute("data-suggestion-comment-vote-down") || "").trim();
        var cid = String(btn.getAttribute("data-suggestion-comment-vote-id") || "").trim();
        if (!sid || !cid) return;
        submitCommentVote(sid, cid, "down", btn);
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-edit-start]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sid = String(btn.getAttribute("data-suggestion-comment-edit-start") || "").trim();
        var cid = String(btn.getAttribute("data-suggestion-comment-edit-id") || "").trim();
        if (!sid || !cid) return;
        state.editingComment = { suggestionId: sid, commentId: cid };
        render();
        var ta = byId("vc-sug-comment-edit-" + cid);
        if (ta) {
          try {
            ta.focus();
          } catch (e2) {}
        }
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-edit-cancel]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.editingComment = null;
        render();
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-edit-save]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sid = String(btn.getAttribute("data-suggestion-comment-edit-save") || "").trim();
        var cid = String(btn.getAttribute("data-suggestion-comment-edit-save-id") || "").trim();
        if (!sid || !cid || !getToken()) return;
        var ta = byId("vc-sug-comment-edit-" + cid);
        var text = ta ? String(ta.value || "").trim() : "";
        if (text.length < 2) {
          setStatus("Il commento è troppo breve.", true);
          return;
        }
        btn.disabled = true;
        setStatus("Salvataggio commento...", false);
        fetch(apiUrl() + "/" + encodeURIComponent(sid) + "/comments/" + encodeURIComponent(cid), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken(),
          },
          body: JSON.stringify({ content: text }),
        })
          .then(parseSuggestionsApiJson)
          .then(function (body) {
            if (!body || body.ok !== true) {
              throw new Error((body && body.message) || "Salvataggio non riuscito.");
            }
            state.editingComment = null;
            setStatus(body.message || "Commento aggiornato.", false);
            return fetchPayload();
          })
          .catch(function (err) {
            setStatus(err && err.message ? err.message : "Errore.", true);
          })
          .then(function () {
            btn.disabled = false;
          });
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-comment-delete]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sid = String(btn.getAttribute("data-suggestion-comment-delete") || "").trim();
        var cid = String(btn.getAttribute("data-suggestion-comment-delete-id") || "").trim();
        if (!sid || !cid || !getToken()) return;
        if (!window.confirm("Eliminare questo commento?")) return;
        btn.disabled = true;
        setStatus("Eliminazione commento...", false);
        fetch(apiUrl() + "/" + encodeURIComponent(sid) + "/comments/" + encodeURIComponent(cid), {
          method: "DELETE",
          headers: { Authorization: "Bearer " + getToken() },
        })
          .then(parseSuggestionsApiJson)
          .then(function (body) {
            if (!body || body.ok !== true) {
              throw new Error((body && body.message) || "Eliminazione non riuscita.");
            }
            state.editingComment = null;
            setStatus(body.message || "Commento eliminato.", false);
            return fetchPayload();
          })
          .catch(function (err) {
            setStatus(err && err.message ? err.message : "Errore.", true);
          })
          .then(function () {
            btn.disabled = false;
          });
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-accept]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        staffDecision(String(btn.getAttribute("data-suggestion-accept") || ""), "accept", btn);
      });
    });
    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-reject]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        staffDecision(String(btn.getAttribute("data-suggestion-reject") || ""), "reject", btn);
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-staff-delete]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        staffDeleteSuggestion(String(btn.getAttribute("data-suggestion-staff-delete") || "").trim(), btn);
      });
    });
  }

  function staffDeleteSuggestion(id, btn) {
    if (!id || !getToken()) return;
    if (
      !window.confirm(
        "Eliminare permanentemente questo suggerimento dal sito? L'operazione non è annullabile.",
      )
    ) {
      return;
    }
    if (btn) btn.disabled = true;
    setStatus("Eliminazione in corso...", false);
    fetch(apiUrl() + "/" + encodeURIComponent(id) + "/delete", {
      method: "POST",
      headers: { Authorization: "Bearer " + getToken() },
    })
      .then(parseSuggestionsApiJson)
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || "Eliminazione non riuscita.");
        }
        setStatus(body.message || "Eliminato.", false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Errore.", true);
      })
      .then(function () {
        if (btn) btn.disabled = false;
      });
  }

  function submitSuggestionVote(suggestionId, direction, buttonEl) {
    var token = getToken();
    if (!token) {
      setStatus("Accedi con Discord per votare.", true);
      return;
    }
    if (buttonEl) buttonEl.disabled = true;
    setStatus("", false);
    fetch(apiUrl() + "/" + encodeURIComponent(suggestionId) + "/vote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ direction: direction }),
    })
      .then(parseSuggestionsApiJson)
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || "Voto non registrato.");
        }
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Errore voto.", true);
      })
      .then(function () {
        if (buttonEl) buttonEl.disabled = false;
      });
  }

  function staffDecision(id, kind, btn) {
    if (!id || !getToken()) return;
    var ta = byId("vc-sug-staff-reason-" + id);
    var reason = ta ? String(ta.value || "").trim() : "";
    if (reason.length < 3) {
      setStatus("Inserisci un motivo di almeno 3 caratteri.", true);
      return;
    }
    if (btn) btn.disabled = true;
    setStatus(kind === "accept" ? "Accettazione in corso..." : "Rifiuto in corso...", false);
    var path = kind === "accept" ? "accept" : "reject";
    fetch(apiUrl() + "/" + encodeURIComponent(id) + "/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getToken(),
      },
      body: JSON.stringify({ reason: reason }),
    })
      .then(parseSuggestionsApiJson)
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || "Operazione non riuscita.");
        }
        setStatus(body.message || "Ok.", false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Errore.", true);
      })
      .then(function () {
        if (btn) btn.disabled = false;
      });
  }

  function authHeaders() {
    var token = getToken();
    return token ? { Authorization: "Bearer " + token } : {};
  }

  function fetchPayload() {
    setStatus("", false);
    return fetch(apiUrl(), {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    })
      .then(parseSuggestionsApiJson)
      .then(function (body) {
        if (!body || body.ok !== true) throw new Error((body && body.message) || "Impossibile caricare i suggerimenti.");
        state.payload = body;
        render();
        startLiveSuggestionsPoll();
        var wsRs = state.suggestionsWs ? state.suggestionsWs.readyState : 3;
        if (wsRs !== 0 && wsRs !== 1) {
          connectSuggestionsWebSocket();
        }
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Impossibile caricare i suggerimenti.", true);
      });
  }

  function submitNewSuggestion() {
    var token = getToken();
    if (!token) {
      setStatus("Devi effettuare il login con Discord.", true);
      return;
    }
    var ta = byId("vc-suggestion-modal-content");
    var content = ta ? String(ta.value || "").trim() : String(state.draftContent || "").trim();
    if (content.length < 12) {
      setStatus("Scrivi almeno 12 caratteri.", true);
      return;
    }
    var editId = state.editSuggestionId ? String(state.editSuggestionId).trim() : "";
    setStatus(editId ? "Salvataggio in corso..." : "Invio in corso...", false);
    var url = editId ? apiUrl() + "/" + encodeURIComponent(editId) : apiUrl();
    var method = editId ? "PATCH" : "POST";
    fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ content: content }),
    })
      .then(parseSuggestionsApiJson)
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || "Salvataggio non riuscito.");
        }
        state.editModalOpen = false;
        state.editSuggestionId = null;
        state.draftContent = "";
        setStatus(body.message || (editId ? "Suggerimento aggiornato." : "Suggerimento pubblicato."), false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Errore durante l'invio.", true);
      });
  }

  function main() {
    wireGateLoginCta();
    if (shouldUnlockPage()) {
      hideGate();
      fetchPayload();
      return;
    }
    if (!getToken()) {
      showGate();
      return;
    }
    hideGate();
    fetchPayload();
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var u = ev && ev.detail ? ev.detail.user : null;
    if (u) {
      hideGate();
      fetchPayload();
      return;
    }
    clearContent();
    showGate();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && state.payload) {
      void refreshPayloadQuiet();
    }
  });

  window.addEventListener("beforeunload", function () {
    stopLiveSuggestionsPoll();
    disconnectSuggestionsWebSocket();
  });

  document.addEventListener("keydown", function (ev) {
    if (!state.editModalOpen) return;
    if (ev.key !== "Escape") return;
    state.editModalOpen = false;
    state.editSuggestionId = null;
    render();
  });

  window.addEventListener("hashchange", function () {
    if (byId("vc-suggestions-list")) {
      window.requestAnimationFrame(function () {
        applySuggestionDeepLink();
      });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();