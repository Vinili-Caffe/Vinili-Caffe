(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_AT_KEY = "vc_discord_expires_at";
  var state = {
    data: null,
    answers: {},
    submitting: false,
    timer: null,
    loadSeq: 0,
    loading: false,
    bootBound: false,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_HOGWARTS_POTIONS) || {};
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function isTemplatePlaceholder(value) {
    return /\{\{.*\}\}/.test(String(value || ""));
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function apiUrl(path) {
    var c = cfg();
    var local = String(c.apiUrlLocal || "").trim();
    var direct = String(c.apiUrl || "").trim();
    var base = isLocalFrontendOrigin() && local && !isTemplatePlaceholder(local) ? local : direct;
    if (!base || isTemplatePlaceholder(base)) base = "/webhooks/site-hogwarts-sorting/potions";
    return base.replace(/\/+$/, "") + (path || "");
  }

  function getToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        return String(window.__vcDiscordGetAccessToken() || "").trim();
      }
      var token = String(localStorage.getItem(ACCESS_TOKEN_KEY) || "").trim();
      var exp = Number(localStorage.getItem(EXPIRES_AT_KEY) || "0");
      if (!token) return "";
      if (exp && Date.now() >= exp) return "";
      return token;
    } catch (e) {
      return "";
    }
  }

  function redirectUrl() {
    var url = String(cfg().redirectUrl || "/evento/shop").trim();
    if (!url || isTemplatePlaceholder(url)) return "/evento/shop";
    return url;
  }

  function startMs() {
    var raw = String(cfg().startDate || "2026-08-24T12:00:00").trim();
    var ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : new Date("2026-08-24T12:00:00").getTime();
  }

  function previewModeActive() {
    var nav = window.__VC_HOGWARTS_EVENT_NAV;
    return Boolean(nav && nav.previewMode === true);
  }

  function redirectIfLockedWithoutPreview() {
    if (previewModeActive()) return false;
    if (Date.now() >= startMs()) return false;
    if (getToken()) return false;
    try {
      window.location.replace(redirectUrl());
      return true;
    } catch (e) {
      window.location.href = redirectUrl();
      return true;
    }
  }

  function showLoading(show) {
    var el = byId("vc-hw-loading");
    if (!el) return;
    if (show) {
      try {
        document.documentElement.classList.remove("vc-hw-loading-done");
      } catch (e0) {}
      try {
        el.style.removeProperty("display");
      } catch (e1) {
        el.style.display = "";
      }
      return;
    }
    try {
      document.documentElement.classList.add("vc-hw-loading-done");
      el.style.setProperty("display", "none", "important");
    } catch (e) {
      el.style.display = "none";
    }
  }

  function showGate(message, mode) {
    setHidden(byId("vc-hw-potions-shell"), true);
    var gate = byId("vc-hw-potions-gate");
    var msg = byId("vc-hw-potions-gate-msg");
    if (msg) msg.textContent = message || "Pozioni non disponibili.";
    setHidden(byId("vc-hw-potions-gate-login"), mode !== "login");
    setHidden(byId("vc-hw-potions-sort-link"), mode !== "sort");
    setHidden(gate, false);
  }

  function showToast(message, kind) {
    var msg = String(message || "").trim();
    var isError = kind === "error" || kind === "err";
    if (window.VcSiteToast) {
      if (!msg) window.VcSiteToast.hide();
      else window.VcSiteToast.show(msg, isError, { pending: !kind || kind === "pending" });
      return;
    }
    var el = byId("vc-hw-potions-toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "vc-hw-shop-toast mt-6" + (kind ? " vc-hw-shop-toast--" + kind : "");
    setHidden(el, !msg);
  }

  function normalizeRequestError(res, data) {
    var payload = data && typeof data === "object" ? data : {};
    if (payload.error) return payload;
    var status = Number(res && res.status) || 0;
    if (status === 401) {
      return {
        error: "invalid_token",
        message: "Sessione Discord non valida o scaduta: effettua di nuovo il login.",
      };
    }
    if (status === 403) {
      return { error: "forbidden", message: "Accesso negato alle pozioni." };
    }
    if (status === 429 || status === 503) {
      return {
        error: "rate_limited",
        message: "Troppe richieste. Attendi un attimo e riprova.",
      };
    }
    if (status >= 500) {
      return { error: "internal", message: "Il server non risponde. Riprovo…" };
    }
    return {
      error: "request_failed",
      message: "Pozioni non disponibili al momento.",
      status: status || undefined,
    };
  }

  function request(method, body) {
    var token = getToken();
    if (!token) {
      return Promise.reject({
        error: "missing_token",
        message: "Accedi con Discord per aprire pozioni.",
      });
    }
    var headers = { Authorization: "Bearer " + token };
    if (body) headers["Content-Type"] = "application/json";
    return fetch(apiUrl(""), {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (data) {
            if (!res.ok || !data || data.ok !== true) {
              throw normalizeRequestError(res, data);
            }
            return data;
          });
      })
      .catch(function (err) {
        if (err && typeof err === "object" && err.error) throw err;
        throw {
          error: "network",
          message: "Connessione instabile. Riprovo…",
        };
      });
  }

  function isTransientPotionsError(err) {
    var code = String((err && err.error) || "").toLowerCase();
    return (
      code === "network" ||
      code === "internal" ||
      code === "request_failed" ||
      code === "rate_limited"
    );
  }

  function formatDuration(ms) {
    var total = Math.max(0, Math.ceil(Number(ms) / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    if (h > 0) return h + "h " + String(m).padStart(2, "0") + "m";
    return m + "m " + String(s).padStart(2, "0") + "s";
  }

  function syncCooldown() {
    if (state.timer) window.clearInterval(state.timer);
    var el = byId("vc-hw-potions-cooldown");
    var next = state.data && state.data.potions && state.data.potions.nextAvailableAt ? new Date(state.data.potions.nextAvailableAt).getTime() : 0;
    if (!el || !next || next <= Date.now()) {
      setHidden(el, true);
      return;
    }
    function tick() {
      var left = next - Date.now();
      if (left <= 0) {
        setHidden(el, true);
        if (state.timer) {
          window.clearInterval(state.timer);
          state.timer = null;
        }
        // Soft refresh: niente secondo overlay a tutto schermo.
        loadPotions(0, { quiet: true });
        return;
      }
      el.textContent = "Prossima prova tra " + formatDuration(left);
      setHidden(el, false);
    }
    tick();
    state.timer = window.setInterval(tick, 1000);
  }

  function optionLabel(effect) {
    return effect && effect.effect ? effect.effect : "";
  }

  function renderGame() {
    var game = byId("vc-hw-potions-game");
    var grid = byId("vc-hw-potions-grid");
    var submit = byId("vc-hw-potions-submit");
    var round = state.data && state.data.round;
    if (!round || !Array.isArray(round.potions) || !Array.isArray(round.effects)) {
      setHidden(game, true);
      return;
    }
    setHidden(game, false);
    grid.innerHTML = round.potions.map(function (potion) {
      var current = state.answers[potion.id] || "";
      return (
        '<article class="vc-hw-potion-card">' +
          '<div class="vc-hw-potion-card__bottle" aria-hidden="true"><span></span></div>' +
          '<div class="vc-hw-potion-card__body">' +
            '<p class="vc-hw-shop-card__rarity">Difficoltà' + esc(potion.difficulty || 1) + "</p>" +
            '<h3>' + esc(potion.name || "") + "</h3>" +
            '<p>' + esc(potion.flavor || "") + "</p>" +
            '<label>Effetto corretto<select data-potion-id="' + esc(potion.id) + '">' +
              '<option value="">Scegli effetto...</option>' +
              round.effects.map(function (effect) {
                return '<option value="' + esc(effect.potionId) + '"' + (current === effect.potionId ? " selected" : "") + ">" + esc(optionLabel(effect)) + "</option>";
              }).join("") +
            "</select></label>" +
          "</div>" +
        "</article>"
      );
    }).join("");
    if (submit) submit.disabled = state.submitting || round.potions.some(function (p) { return !state.answers[p.id]; });
  }

  function render() {
    var data = state.data || {};
    setHidden(byId("vc-hw-potions-app"), false);
    setHidden(byId("vc-hw-potions-gate"), true);
    setHidden(byId("vc-hw-potions-shell"), false);
    var reward = byId("vc-hw-potions-reward");
    if (reward && data.reward) {
      if (data.reward.previewDisabled) {
        reward.textContent = "Preview High Staff: premi disattivati";
      } else {
        var galeoni = Number(data.reward.galeoni || 0);
        var hp = Number(data.reward.housePoints || 0);
        var bits = [galeoni + " Galeoni + " + hp + " punti casa"];
        var petMult = Number(data.reward.petMultiplier || 0);
        var petName = String(data.reward.petName || "").trim();
        if (petMult > 1) bits.push("×" + petMult + (petName ? " " + petName : ""));
        reward.textContent = bits.join(" · ");
      }
    }
    syncCooldown();
    renderGame();
  }

  function loadPotions(attempt, opts) {
    var tryNo = Number(attempt) || 0;
    opts = opts || {};
    var quiet = Boolean(opts.quiet);
    setHidden(byId("vc-hw-potions-app"), false);
    if (tryNo === 0 && !quiet) showToast("", "");
    if (redirectIfLockedWithoutPreview()) return;
    if (!getToken()) {
      showLoading(false);
      state.loading = false;
      showGate("Accedi con Discord e completa lo smistamento per partecipare alle pozioni.", "login");
      return;
    }
    if (tryNo === 0) {
      if (state.loading) return;
      state.loading = true;
      state.loadSeq += 1;
    }
    var seq = state.loadSeq;
    // Overlay full-page solo al cold boot (mai se UI già pronta / quiet refresh).
    if (!quiet && !state.data) showLoading(true);
    if (tryNo > 0) {
      showToast("Connessione instabile. Riprovo…", "pending");
    }
    request("GET")
      .then(function (data) {
        if (seq !== state.loadSeq) return;
        state.loading = false;
        state.data = data;
        state.answers = {};
        showToast("", "");
        showLoading(false);
        render();
      })
      .catch(function (err) {
        if (seq !== state.loadSeq) return;
        if (tryNo < 3 && isTransientPotionsError(err)) {
          var waitMs =
            String((err && err.error) || "") === "rate_limited"
              ? 1200 + tryNo * 800
              : 400 + tryNo * 500;
          window.setTimeout(function () {
            if (seq !== state.loadSeq) return;
            loadPotions(tryNo + 1, opts);
          }, waitMs);
          return;
        }
        state.loading = false;
        showLoading(false);
        showToast("", "");
        // Una risposta fallita non deve cancellare una schermata già caricata.
        if (state.data) {
          showToast(
            err && err.message ? err.message : "Aggiornamento pozioni non riuscito.",
            "error",
          );
          return;
        }
        var code = String((err && err.error) || "");
        if (code === "missing_token" || code === "invalid_token") {
          showGate(err.message || "Accedi con Discord per aprire pozioni.", "login");
        } else if (code === "not_sorted") {
          showGate(err.message || "Completa prima lo smistamento per accedere alle pozioni.", "sort");
        } else if (
          code === "event_not_started" ||
          code === "preview_forbidden" ||
          code === "forbidden"
        ) {
          try {
            window.location.replace(err.redirectUrl || redirectUrl());
          } catch (e) {
            window.location.href = err.redirectUrl || redirectUrl();
          }
        } else {
          showGate(
            err && err.message
              ? String(err.message).replace(/\s*Riprovo…?\s*$/i, "").trim() ||
                  "Pozioni non disponibili al momento."
              : "Pozioni non disponibili al momento.",
            "",
          );
        }
      });
  }

  function submitPotions() {
    if (state.submitting || !state.data || !state.data.round) return;
    state.submitting = true;
    renderGame();
    showToast("Consegna in corso...", "");
    request("POST", { roundKey: state.data.round.seed, answers: state.answers })
      .then(function (data) {
        state.submitting = false;
        state.data = Object.assign({}, state.data, data, { round: null });
        showToast(data.message || "Compito consegnato.", data.success ? "success" : "error");
        render();
      })
      .catch(function (err) {
        state.submitting = false;
        showToast(err && err.message ? err.message : "Consegna non riuscita.", "error");
        renderGame();
      });
  }

  function bind() {
    var grid = byId("vc-hw-potions-grid");
    if (grid) {
      grid.addEventListener("change", function (ev) {
        var sel = ev.target && ev.target.closest ? ev.target.closest("select[data-potion-id]") : null;
        if (!sel) return;
        state.answers[sel.getAttribute("data-potion-id")] = sel.value;
        renderGame();
      });
    }
    var submit = byId("vc-hw-potions-submit");
    if (submit) submit.addEventListener("click", submitPotions);
  }

  function init() {
    if (state.bootBound) return;
    state.bootBound = true;
    bind();
    var started = false;
    function start() {
      if (started) return;
      started = true;
      loadPotions(0);
    }
    // Un solo cold boot. Il profilo Discord recupera solo un boot fallito (niente 2° overlay).
    window.addEventListener("vc-discord-profile", function onProfile() {
      if (state.loading || state.data) return;
      if (!getToken()) return;
      loadPotions(0);
    });
    if (window.__VC_DISCORD_PROFILE || getToken()) {
      start();
      return;
    }
    window.addEventListener("vc-discord-profile", start, { once: true });
    // Fallback: se il profilo Discord non arriva, prova comunque (login gate se manca token).
    window.setTimeout(start, 1600);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
