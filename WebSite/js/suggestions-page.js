(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var state = {
    payload: null,
    editModalOpen: false,
    draftContent: "",
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
    var wrap = byId("vc-suggestions-list");
    if (wrap) wrap.innerHTML = "";
    closeModalDom();
  }

  function closeModalDom() {
    state.editModalOpen = false;
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
    if (id.indexOf("vc-sug-staff-reason-") === 0) return true;
    return false;
  }

  function refreshPayloadQuiet() {
    if (state.editModalOpen || isTypingInSuggestionField()) return Promise.resolve();
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
    var sid = esc(s.id);
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
    var comments = Array.isArray(s.comments) ? s.comments : [];
    var threadHtml =
      '<div class="mt-4 space-y-3 border-t border-white/10 pt-4">' +
      '<p class="text-xs font-semibold uppercase tracking-wider text-slate-400">Discussione</p>';
    if (!comments.length) {
      threadHtml += '<p class="text-sm text-slate-400">Nessun commento ancora.</p>';
    } else {
      threadHtml += comments
        .map(function (c) {
          return (
            '<div class="rounded-xl border border-white/8 bg-white/[0.03] p-3">' +
            '<div class="flex items-center gap-2 text-sm">' +
            (c.authorAvatarUrl
              ? '<img class="h-7 w-7 rounded-full object-cover" src="' + esc(c.authorAvatarUrl) + '" alt="" loading="lazy" />'
              : '<span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10"><i class="fa fa-user text-slate-300"></i></span>') +
            "<strong>" +
            esc(c.authorName || "Utente") +
            "</strong>" +
            '<span class="text-xs text-slate-500">' +
            esc(formatDateIt(c.createdAt)) +
            "</span></div>" +
            '<p class="mt-2 text-sm leading-relaxed text-slate-200/90">' +
            esc(c.content) +
            "</p></div>"
          );
        })
        .join("");
    }
    if (pending && tokenOk) {
      threadHtml +=
        '<div class="mt-3">' +
        '<label class="mb-1 block text-xs font-medium text-slate-400" for="vc-sug-comment-' +
        sid +
        '">Il tuo commento</label>' +
        '<textarea id="vc-sug-comment-' +
        sid +
        '" class="vc-reviews-textarea" rows="2" placeholder="Scrivi un commento..."></textarea>' +
        '<div class="mt-2">' +
        '<button type="button" class="vc-reviews-submit" data-suggestion-comment-submit="' +
        sid +
        '">Pubblica commento</button>' +
        "</div></div>";
    } else if (pending && !tokenOk) {
      threadHtml += '<p class="text-sm text-slate-500">Accedi con Discord per commentare.</p>';
    }
    threadHtml += "</div>";

    var staffActions = "";
    if (pending && canMod) {
      staffActions =
        '<div class="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">' +
        '<p class="text-xs font-semibold uppercase tracking-wider text-amber-200/80">High Staff</p>' +
        '<label class="mt-2 mb-1 block text-xs text-slate-400" for="vc-sug-staff-reason-' +
        sid +
        '">Motivo (obbligatorio, min. 3 caratteri)</label>' +
        '<textarea id="vc-sug-staff-reason-' +
        sid +
        '" class="vc-reviews-textarea" rows="2" placeholder="Motivazione visibile nella scheda..."></textarea>' +
        '<div class="mt-3 flex flex-wrap gap-2">' +
        '<button type="button" class="vc-reviews-submit" data-suggestion-accept="' +
        sid +
        '">Accetta</button>' +
        '<button type="button" class="vc-reviews-submit" style="background-color:#b91c1c;border-color:rgba(255,255,255,0.12)" data-suggestion-reject="' +
        sid +
        '">Rifiuta</button>' +
        "</div></div>";
    }

    var staffDelete = "";
    if (canMod) {
      staffDelete =
        '<div class="mt-4 rounded-xl border border-slate-500/30 bg-slate-900/40 p-3">' +
        '<p class="text-xs font-semibold uppercase tracking-wider text-slate-300/90">High Staff</p>' +
        '<button type="button" class="vc-reviews-submit mt-2" style="background-color:#0f172a;border-color:rgba(255,255,255,0.12)" data-suggestion-delete="' +
        sid +
        '">Elimina definitivamente</button>' +
        '<p class="mt-1 text-xs text-slate-500">Rimuove il suggerimento dal database (irreversibile).</p>' +
        "</div>";
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
      sid +
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
      sid +
      '" data-vote-dir="down"' +
      voteExtras +
      '><i class="fa ' +
      (downOn ? "fa-thumbs-down" : "fa-thumbs-o-down") +
      '" aria-hidden="true"></i><span class="vc-reviews-like__n">' +
      esc(String(dwc)) +
      "</span></button></div>";

    return (
      '<article class="vc-reviews-card" data-suggestion-id="' +
      sid +
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
    return (
      '<div class="vc-reviews-modal__backdrop" data-suggestion-modal-dismiss tabindex="-1"></div>' +
      '<div class="vc-reviews-modal__panel" role="dialog" aria-modal="true" aria-labelledby="vc-suggestions-modal-title">' +
      '<div class="vc-reviews-modal__toolbar">' +
      '<h2 id="vc-suggestions-modal-title" class="vc-reviews-modal__title">Nuovo suggerimento</h2>' +
      '<button type="button" class="vc-reviews-modal__close" data-suggestion-modal-dismiss aria-label="Chiudi"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-reviews-modal__body">' +
      '<div class="vc-reviews-field"><label for="vc-suggestion-modal-content">Testo (minimo 12 caratteri)</label>' +
      '<textarea id="vc-suggestion-modal-content" class="vc-reviews-textarea" rows="6" placeholder="Descrivi la tua idea in modo chiaro...">' +
      esc(state.draftContent) +
      "</textarea></div>" +
      '<div class="vc-reviews-formcard__actions">' +
      '<button type="button" class="vc-reviews-submit" data-suggestion-submit>Invia suggerimento</button>' +
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

  function render() {
    var wrap = byId("vc-suggestions-list");
    if (!wrap) return;
    var list = (state.payload && state.payload.suggestions) || [];
    wrap.innerHTML = list.length ? list.map(function (s) { return suggestionCardMarkup(s); }).join("") : emptyMarkup();
    syncModal();
    syncHeadButton();
    bind();
  }

  function bind() {
    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-modal-dismiss]")).forEach(function (el) {
      el.addEventListener("click", function () {
        state.editModalOpen = false;
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
        btn.disabled = true;
        setStatus("Pubblicazione commento...", false);
        fetch(apiUrl() + "/" + encodeURIComponent(id) + "/comments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken(),
          },
          body: JSON.stringify({ content: text }),
        })
          .then(parseSuggestionsApiJson)
          .then(function (body) {
            if (!body || body.ok !== true) {
              throw new Error((body && body.message) || "Errore commento.");
            }
            if (ta) ta.value = "";
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

    Array.prototype.slice.call(document.querySelectorAll("[data-suggestion-delete]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        staffDeleteSuggestion(String(btn.getAttribute("data-suggestion-delete") || "").trim(), btn);
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
    setStatus("Invio in corso...", false);
    fetch(apiUrl(), {
      method: "POST",
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
        state.draftContent = "";
        setStatus(body.message || "Suggerimento pubblicato.", false);
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
    render();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();