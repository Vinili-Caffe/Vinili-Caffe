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

  var currentUser = null;
  var activeKind = "helper";
  var eligibilityState = { loading: false, data: null };

  var GATE_GLOBAL =
    "mt-6 rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm leading-relaxed text-red-100";
  var GATE_TAB =
    "mt-6 rounded-2xl border border-amber-500/40 bg-amber-950/35 p-4 text-sm leading-relaxed text-amber-50";

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

  function syncEligibilityToDom() {
    var gate = byId("vc-candidature-gate");
    var inner = byId("vc-candidature-form-inner");
    var sub = byId("vc-candidature-submit");
    if (!gate || !inner) return;

    if (!currentUser) {
      gate.hidden = true;
      inner.hidden = false;
      setFieldsDisabled(false);
      if (sub) sub.disabled = false;
      return;
    }

    if (!eligibilityApiUrl()) {
      gate.hidden = true;
      inner.hidden = false;
      setFieldsDisabled(false);
      if (sub) sub.disabled = false;
      return;
    }

    if (eligibilityState.loading) {
      gate.hidden = true;
      inner.hidden = false;
      setFieldsDisabled(false);
      if (sub) sub.disabled = false;
      return;
    }

    var d = eligibilityState.data;
    if (!d || d.ok !== true) {
      gate.hidden = true;
      inner.hidden = false;
      setFieldsDisabled(false);
      if (sub) sub.disabled = false;
      return;
    }

    if (hasGlobalBlock(d)) {
      gate.hidden = false;
      gate.className = GATE_GLOBAL;
      gate.textContent =
        globalBlockMessage(d) ||
        "Non puoi usare il modulo candidature con questo account.";
      inner.hidden = true;
      if (sub) sub.disabled = true;
      return;
    }

    inner.hidden = false;

    if (!currentTypeEligible(d)) {
      var row = rowForActiveKind(d);
      gate.hidden = false;
      gate.className = GATE_TAB;
      gate.textContent =
        (row && row.message) ||
        "Per il ruolo selezionato non puoi inviare una candidatura con questo account.";
      setFieldsDisabled(true);
      if (sub) sub.disabled = true;
      return;
    }

    gate.hidden = true;
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

  function validateAnswers(ans) {
    var cfg = APPLICATIONS[activeKind];
    for (var i = 0; i < cfg.questions.length; i++) {
      var q = cfg.questions[i];
      var v = ans[q.id];
      if (!v) return "Compila il campo: " + q.text;
    }
    return "";
  }

  async function submitCandidature() {
    var api = String(cfgCandidature().submitApiUrl || "").trim();
    if (!api) {
      alert(
        "Manca candidatureSubmitApiUrl in site.config.json (URL del bot che riceve POST /webhooks/site-candidature, es. https://www.viniliecaffe.it/webhooks/site-candidature dietro proxy).",
      );
      return;
    }
    if (!currentUser) {
      alert("Accedi con Discord per inviare.");
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
    var err = validateAnswers(ans);
    if (err) {
      alert(err);
      return;
    }
    var sub = byId("vc-candidature-submit");
    if (sub) sub.disabled = true;
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
        alert(data.message || data.error || "Invio non riuscito (" + res.status + ").");
        return;
      }
      alert(data.message || "Candidatura inviata.");
      await refreshEligibility();
    } catch (e) {
      var pageOrigin = "";
      try {
        pageOrigin = window.location.origin;
      } catch (e2) {}
      alert(
        "Impossibile contattare l’API (" +
          String(api || "") +
          "). Origine: " +
          (pageOrigin || "?") +
          ". Se sei in locale: avvia il bot con WEBSITE_CANDIDATURE_HTTP=1 e CORS con questa origine; controlla che candidatureSubmitApiUrlLocal in site.config coincida con la porta HTTP del bot. Se invece usi l’API di produzione da localhost, serve WEBSITE_CANDIDATURE_CORS_ORIGIN sul server con questa origine.",
      );
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[candidatura] POST fallita", api, e && e.message);
      }
    } finally {
      syncEligibilityToDom();
    }
  }

  function applyUser(user) {
    currentUser = user;
    setWelcome(user);
    showFormWrap(Boolean(user));
    if (!user) {
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
        });
    } else {
      applyUser(null);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();