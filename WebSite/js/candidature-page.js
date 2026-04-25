(function () {
  /** Allineato a Vinyls/Events/interaction/candidatureApplicationHandlers.js (APPLICATIONS). */
  var APPLICATIONS = {
    helper: {
      label: "Helper",
      questions: [
        { id: "id_discord", text: "1. ID Discord", modalLabel: "1. ID", placeholder: "Dal profilo OAuth", kind: "short" },
        { id: "eta", text: "2. Età", modalLabel: "2. Età", placeholder: "Scrivi la tua età", kind: "short" },
        {
          id: "staff_server",
          text: "3. Nomina tutti i server dove sei stato staff, per quanto tempo e che ruolo avevi",
          modalLabel: "3. Esperienze staff",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "motivo_candidatura",
          text: "4. Come mai ti sei voluto candidare su Vinili & Caffè?",
          modalLabel: "4. Motivo candidatura",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "aiuto_economico",
          text: "5. Saresti disposto ad aiutare il server economicamente?",
          modalLabel: "5. Aiuto economico",
          placeholder: "Si / No",
          kind: "paragraph",
        },
        {
          id: "flame_testuale",
          text: "6. Se due utenti si flammano a vicenda su un determinato argomento, come ti comporti? (in testuale)",
          modalLabel: "6. Gestione flame",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "comandi_dyno",
          text: "7. Elenca i comandi di moderazioni più importanti di Dyno",
          modalLabel: "7. Comandi Dyno",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "critica_staff",
          text: "8. Se una persona critica il server o lo staff in maniera non idonea, come ti comporti?",
          modalLabel: "8. Gestione critica",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "vocale",
          text: "9. Potrai stare in vocale? In caso di risposta positiva, potrai parlare?",
          modalLabel: "9. Disponibilità vocale",
          placeholder: "",
          kind: "paragraph",
        },
        { id: "definizione_flame", text: "10. Definizione di flame", modalLabel: "10. Definizione flame", placeholder: "", kind: "paragraph" },
        {
          id: "troll_pubblico",
          text: "11. Se due utenti iniziassero a trollare in pubblico, come agiresti?",
          modalLabel: "11. Gestione troll",
          placeholder: "",
          kind: "paragraph",
        },
      ],
    },
    partnermanager: {
      label: "Partner Manager",
      questions: [
        { id: "id_discord", text: "1. ID Discord", modalLabel: "1. ID", placeholder: "Dal profilo OAuth", kind: "short" },
        {
          id: "luminous_nova",
          text: "2. Conosci il bot Luminous Nova/SkyForce?",
          modalLabel: "2. Luminous Nova/SkyForce",
          placeholder: "Si / No",
          kind: "short",
        },
        {
          id: "partner_giorno",
          text: "3. Quante partner fai al giorno?",
          modalLabel: "3. Partner al giorno",
          placeholder: "<15 / 15+",
          kind: "short",
        },
      ],
    },
  };

  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var ACCESS_REQUIRED_PATH = "/candidature/accesso-richiesto/";

  function byId(id) {
    return document.getElementById(id);
  }

  function getToken() {
    var t = localStorage.getItem(ACCESS_TOKEN_KEY);
    var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
    if (!t || !exp || Date.now() >= exp) return "";
    return t;
  }

  function fetchMe(token) {
    return fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: "Bearer " + token },
    }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }

  function accessRequiredUrl() {
    try {
      var from = window.location.pathname + window.location.search;
      var u = new URL(ACCESS_REQUIRED_PATH, window.location.origin);
      if (from) u.searchParams.set("from", from);
      return u.toString();
    } catch (e) {
      return ACCESS_REQUIRED_PATH;
    }
  }

  function redirectToAccessRequired() {
    var path = "";
    try {
      path = String(window.location.pathname || "");
    } catch (e) {
      path = "";
    }
    if (path.indexOf(ACCESS_REQUIRED_PATH) !== -1) return;
    window.location.href = accessRequiredUrl();
  }

  var currentUser = null;
  var activeKind = "helper";
  var eligibilityState = { loading: false, data: null };

  function cfgCandidature() {
    return (typeof window !== "undefined" && window.__VC_CANDIDATURE) || {};
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  /** In locale (localhost) usa submitApiUrlLocal se valorizzato, così niente CORS verso il dominio pubblico. */
  function resolvedSubmitApiUrl() {
    var c = cfgCandidature();
    var local = String(c.submitApiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local) {
      try {
        var u = new URL(local);
        var p = String(window.location.port || "");
        if (!p) {
          if (window.location.protocol === "https:") p = "443";
          else if (window.location.protocol === "http:") p = "80";
        }
        if (p && u.port && String(u.port) === p) {
          console.warn(
            "[candidature] submitApiUrlLocal usa la stessa porta del sito (" +
              p +
              "). Deve essere la porta HTTP del bot (Vinyls config discadia.webhookPort, di solito 3000), non quella di npx serve. Correggi candidatureSubmitApiUrlLocal in site.config.json e rifai il build.",
          );
        }
      } catch (e) {}
      return local;
    }
    return String(c.submitApiUrl || "").trim();
  }

  /** Bot su IP/dominio diverso dalla pagina: senza CORS il fetch fallisce anche se /webhooks/status si apre in un tab. */
  function hintCorsOriginForRemoteApi(apiUrl) {
    var pageOrigin = "";
    try {
      pageOrigin = window.location.origin;
    } catch (e) {
      return "";
    }
    var host = "";
    try {
      host = String(new URL(String(apiUrl || "")).hostname || "").toLowerCase();
    } catch (e2) {
      return "";
    }
    if (!pageOrigin || !host) return "";
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return "";
    var apiOrigin = "";
    try {
      apiOrigin = new URL(String(apiUrl || "")).origin;
    } catch (e4) {
      apiOrigin = "";
    }
    return (
      " Sul .env del bot (VPS): WEBSITE_CANDIDATURE_CORS_ORIGIN deve includere esattamente " +
      pageOrigin +
      " (come nella barra degli indirizzi, porta inclusa), poi riavvia il bot. In DevTools — Rete, la risposta OPTIONS/POST deve avere Access-Control-Allow-Origin uguale a quella stringa." +
      (apiOrigin
        ? " Oppure sul PC: in un terminale lascia aperto: node WebSite/scripts/dev-candidature-proxy.mjs --target " +
          apiOrigin +
          " (se lo chiudi -> connessione rifiutata su 3042). Poi candidatureSubmitApiUrlLocal http://127.0.0.1:3042/webhooks/site-candidature e rebuild. Prova http://127.0.0.1:3042/webhooks/status nel browser."
        : "")
    );
  }

  /** localhost/127: o proxy dev (3042) o promemoria VPS. */
  function hintLocalApiHostnameMismatch(api) {
    try {
      var u = new URL(String(api || ""));
      var host = String(u.hostname || "").toLowerCase();
      var path = String(u.pathname || "");
      if (
        (host === "localhost" || host === "127.0.0.1" || host === "[::1]") &&
        path.indexOf("site-candidature") !== -1 &&
        String(u.port || "") === "3042"
      ) {
        return " Stai usando il proxy su 3042: dalla root del repo avvia e NON chiudere il terminale con: node WebSite/scripts/dev-candidature-proxy.mjs --target http://IP_DEL_VPS:3000 (stessa porta del webhook sul server). Poi http://127.0.0.1:3042/webhooks/status deve dare JSON.";
      }
      if (host === "localhost" || host === "127.0.0.1") {
        return " Nota: localhost/127.0.0.1 si riferisce al PC dove apri il browser. Se il bot gira su un VPS (PM2) o su un altro computer, imposta candidatureSubmitApiUrlLocal (o la variabile VC_CANDIDATURE_SUBMIT_API_URL_LOCAL in build) con un URL raggiungibile da qui (es. http://IP:3000/... o HTTPS dietro proxy), apri la porta sul server e WEBSITE_CANDIDATURE_CORS_ORIGIN con l'origine del sito (es. http://localhost:5173).";
      }
    } catch (e) {}
    return "";
  }

  function eligibilityApiUrl() {
    var api = resolvedSubmitApiUrl();
    if (!api) return "";
    return api.replace(/\/+$/, "") + "/eligibility";
  }

  function rowForActiveKind(d) {
    return activeKind === "partnermanager" ? d.partnermanager : d.helper;
  }

  function hasGlobalBlock(d) {
    if (!d || d.ok !== true) return false;
    if (d.inGuild === false) return true;
    if (d.noModuliBlocked === true) return true;
    return false;
  }

  function globalBlockMessage(d) {
    if (!d || d.ok !== true) return "";
    if (d.inGuild === false) return (d.helper && d.helper.message) || "";
    if (d.noModuliBlocked) return (d.helper && d.helper.message) || "";
    return "";
  }

  function currentTypeEligible(d) {
    if (!d || d.ok !== true) return false;
    if (hasGlobalBlock(d)) return false;
    var row = rowForActiveKind(d);
    return Boolean(row && row.eligible === true);
  }

  function setFieldsDisabled(disabled) {
    var root = byId("vc-candidature-fields");
    if (!root) return;
    var nodes = root.querySelectorAll("input, textarea");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].disabled = Boolean(disabled);
    }
  }

  function clearGate() {
    var gate = byId("vc-candidature-gate");
    var body = byId("vc-candidature-gate-body");
    if (gate) {
      gate.hidden = true;
      gate.className = "vc-candidature-notice mt-6";
    }
    if (body) body.textContent = "";
  }

  function showGateMessage(variant, message) {
    var gate = byId("vc-candidature-gate");
    var body = byId("vc-candidature-gate-body");
    var icoWrap = gate ? gate.querySelector(".vc-candidature-notice-ico i") : null;
    if (!gate || !body) return;
    gate.hidden = false;
    gate.className =
      "vc-candidature-notice mt-6 vc-candidature-notice--" + (variant === "amber" ? "amber" : "slate");
    body.textContent = message || "";
    if (icoWrap) {
      icoWrap.className = variant === "amber" ? "fa fa-exclamation-triangle" : "fa fa-info-circle";
    }
  }

  function isSuccessBannerVisible() {
    var s = byId("vc-candidature-submit-success");
    return Boolean(s && !s.hidden);
  }

  function syncEligibilityToDom() {
    var gate = byId("vc-candidature-gate");
    var inner = byId("vc-candidature-form-inner");
    var sub = byId("vc-candidature-submit");
    if (!gate || !inner) return;

    if (!currentUser) {
      clearGate();
      inner.hidden = false;
      setFieldsDisabled(false);
      if (sub) sub.disabled = false;
      return;
    }

    if (!eligibilityApiUrl()) {
      clearGate();
      inner.hidden = false;
      setFieldsDisabled(false);
      if (sub) sub.disabled = false;
      return;
    }

    if (eligibilityState.loading) {
      clearGate();
      inner.hidden = false;
      setFieldsDisabled(false);
      if (sub) sub.disabled = false;
      return;
    }

    var d = eligibilityState.data;
    if (!d || d.ok !== true) {
      clearGate();
      inner.hidden = false;
      setFieldsDisabled(false);
      if (sub) sub.disabled = false;
      return;
    }

    if (hasGlobalBlock(d)) {
      showGateMessage(
        "amber",
        globalBlockMessage(d) || "Non puoi usare il modulo candidature con questo account.",
      );
      inner.hidden = true;
      if (sub) sub.disabled = true;
      return;
    }

    inner.hidden = false;

    if (!currentTypeEligible(d)) {
      var row = rowForActiveKind(d);
      if (isSuccessBannerVisible()) {
        clearGate();
      } else {
        showGateMessage(
          "slate",
          (row && row.message) ||
            "Per il ruolo selezionato non puoi inviare una candidatura con questo account.",
        );
      }
      setFieldsDisabled(true);
      if (sub) sub.disabled = true;
      return;
    }

    clearGate();
    setFieldsDisabled(false);
    if (sub) sub.disabled = false;
  }

  async function refreshEligibility() {
    var url = eligibilityApiUrl();
    var token = getToken();
    if (!url || !currentUser || !token) {
      eligibilityState = { loading: false, data: null };
      syncEligibilityToDom();
      return;
    }
    eligibilityState = { loading: true, data: null };
    syncEligibilityToDom();
    try {
      var res = await fetch(url, {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
      });
      var data = {};
      try {
        data = await res.json();
      } catch (e2) {
        data = {};
      }
      if (res.ok && data && data.ok === true) {
        eligibilityState = { loading: false, data: data };
      } else {
        eligibilityState = { loading: false, data: null };
      }
    } catch (e) {
      eligibilityState = { loading: false, data: null };
    }
    syncEligibilityToDom();
  }

  function clientSubmitBlockMessage() {
    var d = eligibilityState.data;
    if (!d || d.ok !== true) return "";
    if (hasGlobalBlock(d)) return globalBlockMessage(d) || "Blocco candidature.";
    var row = rowForActiveKind(d);
    if (row && row.eligible === false) return row.message || "Non idoneo per questo ruolo.";
    return "";
  }

  function setWelcome(user) {
    var el = byId("candidature-welcome");
    if (!el) return;
    if (!user) {
      el.textContent = "Accedi con Discord (in alto a destra) per compilare il modulo: l’ID viene preso dal tuo profilo e non è modificabile.";
      return;
    }
    var name = String(user.username || user.global_name || "utente").trim() || "utente";
    el.textContent = "Benvenuto " + name + "! Scegli il ruolo e compila tutti i campi.";
  }

  function showFormWrap(show) {
    var w = byId("vc-candidature-form-wrap");
    if (w) w.hidden = !show;
  }

  function renderFields() {
    var root = byId("vc-candidature-fields");
    if (!root) return;
    root.innerHTML = "";
    var cfg = APPLICATIONS[activeKind];
    if (!cfg || !currentUser) return;
    var uid = String(currentUser.id || "");
    cfg.questions.forEach(function (q) {
      var wrap = document.createElement("div");
      wrap.className = "vc-candidature-field";
      var lab = document.createElement("label");
      lab.className = "vc-candidature-label";
      lab.setAttribute("for", "vc-cf-" + q.id);
      lab.textContent = q.text;
      var input;
      if (q.kind === "paragraph") {
        input = document.createElement("textarea");
        input.rows = 4;
      } else {
        input = document.createElement("input");
        input.type = "text";
      }
      input.id = "vc-cf-" + q.id;
      input.className = "vc-candidature-input";
      input.setAttribute("data-qid", q.id);
      if (q.placeholder) input.placeholder = q.placeholder;
      if (q.id === "id_discord") {
        input.value = uid;
        input.readOnly = true;
        input.setAttribute("readonly", "readonly");
        input.setAttribute("aria-readonly", "true");
        input.classList.add("vc-candidature-input--readonly");
      }
      wrap.appendChild(lab);
      wrap.appendChild(input);
      root.appendChild(wrap);
    });
  }

  function setKind(kind) {
    activeKind = kind === "partnermanager" ? "partnermanager" : "helper";
    var b1 = byId("vc-candidature-tab-helper");
    var b2 = byId("vc-candidature-tab-pm");
    if (b1) b1.classList.toggle("vc-candidature-tab--on", activeKind === "helper");
    if (b2) b2.classList.toggle("vc-candidature-tab--on", activeKind === "partnermanager");
    renderFields();
    syncEligibilityToDom();
  }

  function collectAnswers() {
    var cfg = APPLICATIONS[activeKind];
    var out = {};
    cfg.questions.forEach(function (q) {
      var el = byId("vc-cf-" + q.id);
      if (!el) return;
      out[q.id] = String(el.value || "").trim();
    });
    return out;
  }

  function firstMissingQuestionId(ans) {
    var cfg = APPLICATIONS[activeKind];
    for (var i = 0; i < cfg.questions.length; i++) {
      var q = cfg.questions[i];
      if (!ans[q.id]) return q.id;
    }
    return "";
  }

  function setSubmitLoading(loading) {
    var sub = byId("vc-candidature-submit");
    if (!sub) return;
    if (!sub.getAttribute("data-default-html")) {
      sub.setAttribute("data-default-html", sub.innerHTML);
    }
    if (loading) {
      sub.disabled = true;
      sub.classList.add("vc-candidature-submit--loading");
      sub.innerHTML = '<span class="vc-submit-spinner" aria-hidden="true"></span><span>Invio in corso...</span>';
      return;
    }
    sub.classList.remove("vc-candidature-submit--loading");
    var fallback = '<i class="fa fa-paper-plane-o" aria-hidden="true"></i> Invia candidatura';
    sub.innerHTML = sub.getAttribute("data-default-html") || fallback;
    sub.disabled = false;
  }

  function setSubmitSuccessVisible(visible) {
    var box = byId("vc-candidature-submit-success");
    if (!box) return;
    box.hidden = !visible;
  }

  function formatCooldownUntil(ms) {
    var ts = Number(ms || 0);
    if (!ts || !isFinite(ts) || ts <= 0) return "";
    try {
      return new Date(ts).toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }

  function applyLocalCooldown(type, untilMs) {
    var t = type === "partnermanager" ? "partnermanager" : "helper";
    var untilText = formatCooldownUntil(untilMs);
    var msg = untilText
      ? "Hai già inviato una candidatura di questo tipo: attendi fino al " + untilText + "."
      : "Hai già inviato una candidatura di questo tipo di recente: attendi il cooldown.";
    var base =
      eligibilityState && eligibilityState.data && eligibilityState.data.ok === true
        ? eligibilityState.data
        : {
          ok: true,
          inGuild: true,
          noModuliBlocked: false,
          helper: { eligible: true, code: "", message: "" },
          partnermanager: { eligible: true, code: "", message: "" },
        };
    base[t] = {
      eligible: false,
      code: "cooldown",
      message: msg,
      cooldown_until_ms: Number(untilMs || 0),
    };
    eligibilityState = { loading: false, data: base };
    syncEligibilityToDom();
  }

  async function submitCandidature() {
    var api = resolvedSubmitApiUrl();
    if (!api) {
      alert(
        "Manca l’URL API candidature: in site.config.json imposta candidatureSubmitApiUrl (produzione) e, per provare da localhost, anche candidatureSubmitApiUrlLocal (stessa base URL del bot, es. http://127.0.0.1:3000/webhooks/site-candidature). Poi rifai il build del sito.",
      );
      return;
    }
    if (!currentUser) {
      redirectToAccessRequired();
      return;
    }
    var token = getToken();
    if (!token) {
      alert("Sessione scaduta: effettua di nuovo il login.");
      return;
    }
    var blockMsg = clientSubmitBlockMessage();
    if (blockMsg) {
      alert(blockMsg);
      return;
    }
    var ans = collectAnswers();
    var missingId = firstMissingQuestionId(ans);
    if (missingId) {
      var fieldEl = byId("vc-cf-" + missingId);
      if (window.vcFieldValidationTip) window.vcFieldValidationTip.show(fieldEl);
      else alert("Compila tutti i campi obbligatori.");
      return;
    }
    setSubmitSuccessVisible(false);
    setSubmitLoading(true);
    try {
      var res = await fetch(api, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ type: activeKind, answers: ans }),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (e2) {
        data = {};
      }
      if (!res.ok || !data.ok) {
        if (res.status === 401 && (data.error === "missing_token" || data.error === "invalid_token")) {
          redirectToAccessRequired();
          return;
        }
        var baseMsg = data.message || data.error || "Invio non riuscito (" + res.status + ").";
        var hint404 = "";
        if (res.status === 404) {
          var origin = "";
          try {
            origin = window.location.origin;
          } catch (e3) {}
          hint404 =
            " Di solito: 404 su POST significa che la richiesta non arriva al bot Express (route assente). Controlla: 1) non servire il sito sulla stessa porta del bot (es. `npx serve` su 3000 mentre il bot è sulla 3000 — usa 5173 per il sito); 2) sul bot WEBSITE_CANDIDATURE_HTTP=1; 3) prova GET " +
            String(api || "").replace(/\/webhooks\/site-candidature\/?$/i, "") +
            "/webhooks/status dalla stessa macchina. Origine pagina: " +
            (origin || "?") +
            ".";
        }
        alert(baseMsg + hint404);
        return;
      }
      setSubmitSuccessVisible(true);
      var okBox = byId("vc-candidature-submit-success");
      if (okBox && typeof okBox.scrollIntoView === "function") {
        try {
          okBox.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (eScroll) {}
      }
      applyLocalCooldown(activeKind, data.cooldown_until_ms);
      await refreshEligibility();
    } catch (e) {
      var pageOrigin = "";
      try {
        pageOrigin = window.location.origin;
      } catch (e2) {}
      var statusBase = String(api || "").replace(/\/webhooks\/site-candidature\/?$/i, "");
      alert(
        "Impossibile contattare l’API (" +
          String(api || "") +
          "). Origine: " +
          (pageOrigin || "?") +
          "." +
          hintCorsOriginForRemoteApi(api) +
          " Altre verifiche: WEBSITE_CANDIDATURE_HTTP=1; candidatureSubmitApiUrlLocal punta al bot (stessa porta di discadia.webhookPort); in browser apri " +
          statusBase +
          "/webhooks/status (deve dare JSON). Ricarica con Ctrl+F5 dopo ogni build." +
          hintLocalApiHostnameMismatch(api),
      );
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[candidatura] POST fallita", api, e && e.message);
      }
    } finally {
      setSubmitLoading(false);
      syncEligibilityToDom();
    }
  }

  function applyUser(user) {
    currentUser = user;
    setWelcome(user);
    showFormWrap(Boolean(user));
    if (!user) {
      setSubmitSuccessVisible(false);
      eligibilityState = { loading: false, data: null };
      syncEligibilityToDom();
      return;
    }
    renderFields();
    refreshEligibility();
  }

  function init() {
    var tabH = byId("vc-candidature-tab-helper");
    var tabPm = byId("vc-candidature-tab-pm");
    var sub = byId("vc-candidature-submit");
    if (tabH) tabH.addEventListener("click", function () { setKind("helper"); });
    if (tabPm) tabPm.addEventListener("click", function () { setKind("partnermanager"); });
    if (sub) sub.addEventListener("click", submitCandidature);

    window.addEventListener("vc-discord-profile", function (ev) {
      var u = ev.detail && ev.detail.user;
      applyUser(u || null);
    });

    var t = getToken();
    if (t) {
      fetchMe(t)
        .then(function (u) {
          applyUser(u);
        })
        .catch(function () {
          applyUser(null);
          redirectToAccessRequired();
        });
    } else {
      applyUser(null);
      redirectToAccessRequired();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();