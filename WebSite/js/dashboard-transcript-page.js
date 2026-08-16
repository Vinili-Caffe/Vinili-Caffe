(function () {
  "use strict";

  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_AT_KEY = "vc_discord_expires_at";
  var ACCESS_CACHE_PREFIX = "vc_tx_ok:";
  var blobUrl = null;
  var loadSeq = 0;
  var loadingTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function getToken() {
    if (typeof window.__vcDiscordGetAccessToken === "function") {
      var t = window.__vcDiscordGetAccessToken();
      if (t) return t;
    }
    try {
      var t2 = localStorage.getItem(ACCESS_TOKEN_KEY);
      var exp = Number(localStorage.getItem(EXPIRES_AT_KEY) || "0");
      if (!t2) return "";
      // Allinea a discord-auth: senza expires_at la sessione resta valida.
      if (exp && Date.now() >= exp) return "";
      return t2;
    } catch (e) {
      return "";
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(EXPIRES_AT_KEY);
    } catch (e) {}
  }

  function readTokenParam() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var t = String(q.get("t") || q.get("token") || "").trim().toLowerCase();
      if (/^[a-f0-9]{64}$/.test(t)) return t;
    } catch (e) {}
    return "";
  }

  function loginUrl() {
    var ret = String(window.location.pathname || "/dashboard/transcript/") + String(window.location.search || "");
    return "/webhooks/site-verify/oauth-start?r=" + encodeURIComponent(ret);
  }

  function accessCacheKey(tokenParam) {
    return ACCESS_CACHE_PREFIX + String(tokenParam || "");
  }

  function rememberAccess(tokenParam, userId) {
    try {
      sessionStorage.setItem(
        accessCacheKey(tokenParam),
        JSON.stringify({ userId: String(userId || ""), at: Date.now() }),
      );
    } catch (e) {}
  }

  function readRememberedAccess(tokenParam) {
    try {
      var raw = sessionStorage.getItem(accessCacheKey(tokenParam));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function currentProfile() {
    try {
      return window.__VC_DISCORD_PROFILE || null;
    } catch (e) {
      return null;
    }
  }

  function profileLabel(user) {
    if (!user) return "";
    var name = String(user.global_name || user.username || "").trim();
    return name || String(user.id || "");
  }

  function updateSessionChip() {
    var chip = byId("vc-tx-session");
    var nameEl = byId("vc-tx-session-name");
    var user = currentProfile();
    var tok = getToken();
    if (!chip) return;
    if (!tok || !user) {
      chip.setAttribute("hidden", "");
      return;
    }
    chip.removeAttribute("hidden");
    if (nameEl) nameEl.textContent = profileLabel(user);
  }

  function ensureTxLoadingOverlay() {
    var el = byId("vc-session-verify-overlay");
    if (el) return el;
    el = document.createElement("div");
    el.id = "vc-session-verify-overlay";
    el.className = "vc-session-verify-overlay";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-busy", "true");
    el.innerHTML =
      '<div class="vc-session-verify-inner">' +
      '<span class="vc-session-verify-spinner" aria-hidden="true"></span>' +
      '<p class="vc-session-verify-text">Verifica sessione in corso...</p>' +
      "</div>";
    document.body.appendChild(el);
    return el;
  }

  function showTxLoading(message) {
    try {
      document.documentElement.classList.add("vc-tx-session-known");
      document.documentElement.classList.add("vc-session-verify-pending");
    } catch (e0) {}
    var gate = byId("vc-tx-gate");
    var viewer = byId("vc-tx-viewer");
    if (viewer) viewer.setAttribute("hidden", "");
    if (gate) {
      gate.setAttribute("hidden", "");
      gate.classList.add("vc-tx-gate--hidden");
      gate.classList.add("is-verifying");
    }
    var el = ensureTxLoadingOverlay();
    var text = el.querySelector(".vc-session-verify-text");
    if (text) {
      text.textContent = message || "Verifica sessione in corso...";
    }
    el.classList.remove("vc-session-verify-overlay--hidden");
    el.setAttribute("aria-busy", "true");
  }

  function hideTxLoading() {
    try {
      document.documentElement.classList.remove("vc-session-verify-pending");
      document.documentElement.classList.remove("vc-tx-session-known");
    } catch (e0) {}
    var el = byId("vc-session-verify-overlay");
    if (!el) return;
    el.classList.add("vc-session-verify-overlay--hidden");
    el.setAttribute("aria-busy", "false");
  }

  function showGate(message, opts) {
    opts = opts || {};
    hideTxLoading();
    var gate = byId("vc-tx-gate");
    var viewer = byId("vc-tx-viewer");
    var err = byId("vc-tx-gate-error");
    var body = byId("vc-tx-gate-body");
    var title = byId("vc-tx-gate-title");
    var loginBtn = byId("vc-tx-gate-login");
    if (viewer) viewer.setAttribute("hidden", "");
    if (gate) {
      gate.removeAttribute("hidden");
      gate.classList.remove("vc-tx-gate--hidden");
      gate.classList.toggle("is-verifying", Boolean(opts.hideLogin));
    }
    if (title) {
      title.textContent = opts.title || "Accedi per vedere il transcript";
    }
    if (body) {
      body.textContent =
        opts.body ||
        "Solo l’autore del ticket o lo staff con i permessi giusti possono aprirlo. Accedi con Discord per confermare la tua identità.";
    }
    if (loginBtn) {
      if (opts.hideLogin) {
        loginBtn.setAttribute("hidden", "");
        loginBtn.setAttribute("aria-hidden", "true");
        loginBtn.style.display = "none";
      } else {
        loginBtn.removeAttribute("hidden");
        loginBtn.removeAttribute("aria-hidden");
        loginBtn.style.display = "";
      }
      if (opts.loginLabel) {
        var span = loginBtn.querySelector("span");
        if (span) span.textContent = opts.loginLabel;
      } else {
        var spanDef = loginBtn.querySelector("span");
        if (spanDef) spanDef.textContent = "Accedi con Discord";
      }
    }
    if (err) {
      if (message) {
        err.hidden = false;
        err.textContent = message;
      } else {
        err.hidden = true;
        err.textContent = "";
      }
    }
    updateSessionChip();
  }

  function showViewer() {
    hideTxLoading();
    var gate = byId("vc-tx-gate");
    var viewer = byId("vc-tx-viewer");
    if (gate) {
      gate.setAttribute("hidden", "");
      gate.classList.add("vc-tx-gate--hidden");
      gate.classList.remove("is-verifying");
    }
    if (viewer) viewer.removeAttribute("hidden");
  }

  function setLoading(on) {
    var el = byId("vc-tx-loading");
    if (!el) return;
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
    if (on) {
      el.removeAttribute("hidden");
      el.classList.remove("is-done");
    } else {
      el.setAttribute("hidden", "");
      el.classList.add("is-done");
    }
  }

  function revokeBlob() {
    if (!blobUrl) return;
    try {
      URL.revokeObjectURL(blobUrl);
    } catch (e) {}
    blobUrl = null;
  }

  function mountHtml(html) {
    var frame = byId("vc-tx-frame");
    if (!frame) {
      setLoading(false);
      return;
    }
    revokeBlob();
    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    blobUrl = URL.createObjectURL(blob);
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      setLoading(false);
    }
    frame.onload = finish;
    frame.onerror = finish;
    frame.src = blobUrl;
    // blob + sandbox a volte non sparano onload: fallback sicuro.
    loadingTimer = setTimeout(finish, 1200);
    requestAnimationFrame(function () {
      try {
        if (frame.contentDocument && frame.contentDocument.readyState === "complete") finish();
      } catch (e) {}
    });
  }

  function decodeHeader(value) {
    try {
      return decodeURIComponent(String(value || "").trim());
    } catch (e) {
      return String(value || "").trim();
    }
  }

  function applyMeta(res) {
    var num = String(res.headers.get("X-Ticket-Number") || "").trim();
    var tag = decodeHeader(res.headers.get("X-Ticket-User-Tag"));
    var type = String(res.headers.get("X-Ticket-Type") || "").trim();
    var title = byId("vc-tx-title");
    var meta = byId("vc-tx-meta");
    if (title) title.textContent = num ? "ticket-" + num : "transcript";
    if (meta) {
      var parts = [];
      if (tag) parts.push(tag);
      if (type) parts.push(type.charAt(0).toUpperCase() + type.slice(1));
      meta.textContent = parts.join(" · ");
    }
  }

  async function loadTranscript(tokenParam) {
    var tok = getToken();
    if (!tok) {
      showGate("");
      return;
    }
    var seq = ++loadSeq;
    var user = currentProfile();
    var remembered = readRememberedAccess(tokenParam);
    showTxLoading(
      remembered
        ? "Apertura transcript…"
        : "Verifica sessione in corso...",
    );
    try {
      var res = await fetch("/ticket-transcript/" + encodeURIComponent(tokenParam), {
        headers: {
          Authorization: "Bearer " + tok,
          Accept: "text/html, application/json;q=0.9, */*;q=0.8",
        },
        credentials: "omit",
        cache: "no-store",
      });
      if (seq !== loadSeq) return;
      if (res.status === 401) {
        clearToken();
        showGate("Sessione Discord scaduta. Accedi di nuovo.");
        return;
      }
      if (res.status === 403) {
        showGate("Accesso negato: non sei l’autore del ticket e non hai un ruolo staff adatto.", {
          title: "Accesso negato",
          body: user
            ? "Sei connesso come " + profileLabel(user) + ". Prova con un altro account staff, oppure chiedi a chi ha chiuso il ticket."
            : "L’account Discord in sessione non ha i permessi per questo transcript.",
          loginLabel: "Cambia account Discord",
        });
        return;
      }
      if (res.status === 410) {
        showGate("Questo transcript è scaduto.");
        return;
      }
      if (res.status === 404) {
        var detail404 = "";
        try {
          detail404 = String(await res.text() || "").trim();
        } catch (e404) {}
        if (/non disponibile|rimosso|assente/i.test(detail404)) {
          showGate("File transcript non disponibile sul server.");
        } else if (detail404 && detail404.length < 180 && !/</.test(detail404)) {
          showGate(detail404);
        } else {
          showGate("Transcript non trovato.");
        }
        return;
      }
      if (!res.ok) {
        showGate("Impossibile caricare il transcript. Riprova.");
        return;
      }
      applyMeta(res);
      var html = await res.text();
      if (seq !== loadSeq) return;
      rememberAccess(tokenParam, user && user.id);
      showViewer();
      setLoading(true);
      mountHtml(html);
      updateSessionChip();
    } catch (e) {
      if (seq !== loadSeq) return;
      showGate("Errore di rete. Riprova.");
    }
  }

  function wireGate() {
    var btn = byId("vc-tx-gate-login");
    if (btn && !btn.__vcWired) {
      btn.__vcWired = true;
      btn.addEventListener("click", function () {
        // Re-login: se c’è già una sessione, forziamo OAuth pulito.
        if (btn.textContent && /cambia account/i.test(btn.textContent)) {
          clearToken();
        }
        if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
          window.__vcDiscordStartOAuthRedirect(btn);
          return;
        }
        window.location.href = loginUrl();
      });
    }
    var switchBtn = byId("vc-tx-session-switch");
    if (switchBtn && !switchBtn.__vcWired) {
      switchBtn.__vcWired = true;
      switchBtn.addEventListener("click", function () {
        clearToken();
        if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
          window.__vcDiscordStartOAuthRedirect(byId("vc-tx-gate-login"));
          return;
        }
        window.location.href = loginUrl();
      });
    }
  }

  function boot() {
    wireGate();
    updateSessionChip();
    var tokenParam = readTokenParam();
    if (!tokenParam) {
      showGate("Link transcript non valido.");
      return;
    }
    // Hash OAuth ancora da processare da discord-auth: aspetta il profilo.
    try {
      if (String(window.location.hash || "").indexOf("access_token=") !== -1) {
        showTxLoading("Completo il login Discord…");
        return;
      }
    } catch (e) {}
    if (!getToken()) {
      showGate("");
      return;
    }
    showTxLoading("Verifica sessione in corso...");
    loadTranscript(tokenParam);
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var u = ev && ev.detail ? ev.detail.user : null;
    var tokenParam = readTokenParam();
    updateSessionChip();
    if (!tokenParam) return;
    if (!u) {
      if (!getToken()) showGate("");
      return;
    }
    loadTranscript(tokenParam);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.addEventListener("beforeunload", revokeBlob);
})();
