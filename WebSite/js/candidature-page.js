(function () {
  var APPLICATIONS = {
    helper: {
      label: "Helper",
      questions: [
        { 
          id: "id_discord", 
          text: "1. ID Discord", 
          modalLabel: "1. ID", 
          placeholder: "Copia e incolla il tuo ID di Discord", 
          kind: "short" 
        },
        { 
          id: "eta", 
          text: "2. Età", 
          modalLabel: "2. Età", 
          placeholder: "Scrivi la tua età", 
          kind: "short" 
        },
        {
          id: "tos_linee_guida",
          text: "3. Cosa sono i ToS e le Linee Guida di Discord?",
          modalLabel: "3. ToS e Linee Guida di Discord",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "motivo_candidatura",
          text: "4. Seleziona una o più opzioni che sei disposto a intraprendere per sostenere il server",
          modalLabel: "4. Opzioni di supporto",
          placeholder: "Le risposte verranno prese in considerazione per determinare i ruoli nello staff.",
          kind: "multi_choice",
          hint: "Puoi selezionare più di un’opzione.",
          options: [
            { value: "Facendo attività vocale", label: "Facendo attività vocale" },
            { value: "Scrivendo nei canali", label: "Scrivendo nei canali" },
            { value: "Pensando a eventi per il server", label: "Pensando a eventi per il server" },
            { value: "Giveaway di nitro, decorazioni o altro", label: "Giveaway di nitro, decorazioni o altro" },
            { value: "Boostando il server", label: "Boostando il server" },
            { value: "Aiutando economicamente il server", label: "Aiutando economicamente il server" },
          ],
        },
        {
          id: "gestione_community",
          text: "5. Se hai già gestito delle community Discord, su quale tema si basavano (esempio: anime, giochi, musica, sport, ecc.)?",
          modalLabel: "5. Gestione community",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "staff_altri_server",
          text: "6. Attualmente ricopri qualche carica da staffer in altri server? Se si, indica quali",
          modalLabel: "6. Staff in altri server",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "comandi_dyno",
          text: "7. Elenca i comandi di moderazioni più importanti",
          modalLabel: "7. Comandi Dyno",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "gestione_discussione",
          text: "8. Che comportamento assumi nel caso due utenti discutessero in un canale testuale o vocale?",
          modalLabel: "8. Gestione discussione",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "vocale",
          text: "9. Potrai stare in vocale? In caso di risposta positiva, potrai parlare?",
          modalLabel: "9. Disponibilità in vocale",
          kind: "choice",
          options: [
            { value: "Sì", label: "Sì" },
            { value: "No", label: "No" },
          ],
        },
        { id: "definizione_caps_wall_of_text", 
          text: "10. Definisci 'caps' e 'wall of text'.",
          modalLabel: "10. Definizione 'caps' e 'wall of text'",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "definizione_flood_spam",
          text: "11. Definisci e scrivi la differenza sostanziale tra flood e spam.",
          modalLabel: "11. Definizione flood e spam",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "compito_staffer",
          text: "12. Secondo te, qual è il compito di uno Staffer?",
          modalLabel: "12. Compito di uno Staffer",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "caratteristiche_vinili_caffe",
          text: "13. Su cosa si basa Vinili & Caffè e quali sono le sue caratteristiche principali e punti di forza?",
          modalLabel: "13. Caratteristiche di Vinili & Caffè",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "valutazione_abilita_staffer",
          text: "14. Quanto valuti le tue abilità da Staffer?",
          modalLabel: "14. Valutazione abilità da Staffer",
          kind: "choice",
          options: [
            { value: "Pessime", label: "Pessime" },
            { value: "Scarse", label: "Scarse" },
            { value: "Buone", label: "Buone" },
            { value: "Eccellenti", label: "Eccellenti" },
          ],
        },
        {
          id: "motivi_candidatura",
          text: "15. Perchè dovremmo scegliere te? Indica due motivi per il quale la tua candidatura dovrebbe essere presa in considerazione più delle altre.",
          modalLabel: "15. Punti di forza",
          placeholder: "",
          kind: "paragraph",
        },
        {
          id: "fascia_oraria_disponibilita",
          text: "16. In quale fascia oraria sei solitamente disponibile su discord?",
          modalLabel: "16. Fascia oraria disponibile",
          placeholder: "",
          kind: "multi_choice",
          hint: "Puoi selezionare più di un’opzione.",
          options: [
            { value: "Mattino (07:00 - 12:30)", label: "Mattino (07:00 - 12:30)" },
            { value: "Pomeriggio (12:30 - 18:30)", label: "Pomeriggio (12:30 - 18:30)" },
            { value: "Sera (18:30 - 00:00)", label: "Sera (18:30 - 00:00)" },
            { value: "Notte (00:00 - 07:00)", label: "Notte (00:00 - 07:00)" },
          ],
        },
        {
          id: "tempo_dedicato_server",
          text: "17. Quanto tempo riesci a dedicare giornalmente al server?",
          modalLabel: "17. Tempo dedicato al server",
          kind: "choice",
          options: [
            { value: "Da 1 a 3 ore", label: "Da 1 a 3 ore" },
            { value: "Da 3 a 5 ore", label: "Da 3 a 5 ore" },
            { value: "Da 5 a 8 ore", label: "Da 5 a 8 ore" },
            { value: "8+ ore", label: "8+ ore" },
          ],
        },
      ],
    },
    partnermanager: {
      label: "Partner Manager",
      questions: [
        { id: "id_discord", text: "1. ID Discord", modalLabel: "1. ID", placeholder: "Dal profilo OAuth", kind: "short" },
        {
          id: "partnership_tra_server",
          text: "2. Descrivi brevemente come si effettua una partnership tra server",
          modalLabel: "2. Partnership tra server",
          placeholder: "Descrivi brevemente come si effettua una partnership tra server",
          kind: "paragraph",
        },
        {
          id: "partner_giorno",
          text: "3. Quante partner fai al giorno?",
          modalLabel: "3. Partner al giorno",
          placeholder: "15- / 15+",
          kind: "choice",
          options: [
            { value: "-15", label: "15-" },
            { value: "15+", label: "15+" },
          ],
        },
        {
          id: "staff_altri_server",
          text: "4. Attualmente ricopri questo ruolo anche in altri server? Se si, indica quali",
          modalLabel: "4. Staff in altri server",
          placeholder: "Indica quali server",
          kind: "paragraph",
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

  function t(key, fallback) {
    try {
      if (window.VcI18n) {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function hydratePartnerManagerRewardIntro(root) {
    if (!root || !window.VCPartnerManagerRewards) return;
    var tiers = root.querySelector("#vc-pm-reward-tiers");
    if (!tiers) return;
    tiers.innerHTML = window.VCPartnerManagerRewards.buildWebsiteTierHtml();
  }

    function setRoleIntroFromTemplate(kind) {
    var intro = byId("vc-candidature-role-intro");
    if (!intro) return;
    intro.replaceChildren();
    var tid =
      kind === "partnermanager"
        ? "vc-candidature-role-intro-partnermanager"
        : "vc-candidature-role-intro-helper";
    var tpl = byId(tid);
    if (!tpl || !tpl.content) return;
    intro.appendChild(document.importNode(tpl.content, true));
    if (kind === "partnermanager") hydratePartnerManagerRewardIntro(intro);
  }

  function getToken() {
    try {
      var t = localStorage.getItem(ACCESS_TOKEN_KEY);
      var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
      if (!t || !exp || Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function oauthHashPending() {
    try {
      return String(window.location.hash || "").indexOf("access_token=") !== -1;
    } catch (e2) {
      return false;
    }
  }

  function fetchMe(token) {
    return fetch("/webhooks/site-discord-me", {
      headers: { Authorization: "Bearer " + token },
      credentials: "same-origin",
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

  function showLoginGate() {
    var g = byId("vc-candidature-login-gate");
    if (!g) return false;
    g.removeAttribute("hidden");
    g.classList.remove("vc-reviews-gate--dismissed");
    g.setAttribute("aria-hidden", "false");
    return true;
  }

  function hideLoginGate() {
    var g = byId("vc-candidature-login-gate");
    if (!g) return;
    g.setAttribute("hidden", "");
    g.classList.add("vc-reviews-gate--dismissed");
    g.setAttribute("aria-hidden", "true");
  }

  function redirectToAccessRequired() {
    /* loginRequiredModal1: modal sui bottoni, non gate fullscreen */
    hideLoginGate();
    if (window.VcLoginRequired && typeof window.VcLoginRequired.require === "function") {
      window.VcLoginRequired.require({
        title: "Candidature",
        sub: "Staff",
        body: "Accedi con Discord per inviare una candidatura.",
      });
      return;
    }
    if (showLoginGate()) return;
    var path = "";
    try {
      path = String(window.location.pathname || "");
    } catch (e) {
      path = "";
    }
    if (path.indexOf("/candidature/accesso-richiesto") !== -1) return;
    var dest = accessRequiredUrl();
    try {
      window.location.replace(dest);
    } catch (e2) {
      window.location.href = dest;
    }
  }

  var currentUser = null;
  var activeKind = "helper";
  /* candTabPreferApply1: dopo click utente non forzare di nuovo il preferred */
  var userSelectedKind = false;
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
      } catch (e) { }
      return local;
    }
    return String(c.submitApiUrl || "").trim();
  }

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
    } catch (e) { }
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

    function isKindInteractive(d, kind) {
    if (!d || d.ok !== true) return false;
    var row = kind === "partnermanager" ? d.partnermanager : d.helper;
    if (!row) return false;
    if (row.eligible === true) return true;
    var c = String(row.code || "").trim().toLowerCase();
    if (
      c === "cooldown" ||
      c === "already_role" ||
      c === "helper_blocked" ||
      c === "no_moduli" ||
      c === "no_member_role" ||
      c === "helper_level" ||
      c === "helper_tenure" ||
      c === "helper_join_unknown" ||
      c === "helper_requirements"
    ) {
      return true;
    }
        if (String((row && row.message) || "").trim()) return true;
    return false;
  }

  function candidatureRowCode(row) {
    return String((row && row.code) || "").trim().toLowerCase();
  }

  function isAlreadyStaffOrPmCode(code) {
    var c = String(code || "").trim().toLowerCase();
    return c === "already_role" || c === "helper_blocked";
  }

  function isAlreadyStaffOrPmRow(row) {
    return isAlreadyStaffOrPmCode(candidatureRowCode(row));
  }

  function shouldHideModuloCard(d, kind) {
    /* candHideModuloIfStaff1: già staff/PM → nascondi card modulo */
    if (!d || d.ok !== true) return false;
    if (hasGlobalBlock(d)) return false;
    var row = kind === "partnermanager" ? d.partnermanager : d.helper;
    if (isAlreadyStaffOrPmRow(row)) return true;
    var h = d.helper;
    var p = d.partnermanager;
    if (isAlreadyStaffOrPmRow(h) && isAlreadyStaffOrPmRow(p)) return true;
    return false;
  }

  function buildNoApplicableMessage(d) {
    var h = d.helper;
    var p = d.partnermanager;
    var hc = candidatureRowCode(h);
    var pc = candidatureRowCode(p);
    var hm = String((h && h.message) || "").trim();
    var pm = String((p && p.message) || "").trim();
    if (hc === "already_role" && pc === "already_role") {
      return t(
        "cand.eligibility.alreadyBoth",
        "Sei già Helper e Partner Manager: non puoi inviare nuove candidature da questo modulo.",
      );
    }
    if (hc === "helper_blocked" && pc === "already_role") {
      var staffLabel = String((h && h.roleLabel) || "").trim() || "Staff";
      return t(
        "cand.eligibility.pmBlocksHelperNamed",
        "Sei già Partner Manager e {role}: da qui non risultano candidature possibili.",
      ).replace(/\{role\}/g, staffLabel);
    }
    if (hm && pm && hm === pm) return hm;
    if (hm && pm) {
      return t(
        "cand.eligibility.nonePossible",
        "Non puoi inviare candidature Helper né candidarti come Partner Manager con questo account.",
      );
    }
    if (hm) return hm;
    if (pm) return pm;
    return t("cand.eligibility.cannotSubmit", "Non puoi inviare candidature con questo account.");
  }

  function syncTabActiveUi() {
    var b1 = byId("vc-candidature-tab-helper");
    var b2 = byId("vc-candidature-tab-pm");
    var helperOn = activeKind === "helper";
    if (b1) {
      b1.classList.toggle("vc-candidature-tab--on", helperOn);
      b1.classList.toggle("is-active", helperOn);
      b1.setAttribute("aria-selected", helperOn ? "true" : "false");
    }
    if (b2) {
      b2.classList.toggle("vc-candidature-tab--on", !helperOn);
      b2.classList.toggle("is-active", !helperOn);
      b2.setAttribute("aria-selected", !helperOn ? "true" : "false");
    }
  }

  function pickPreferredKind(d) {
    /* candFounderFirstPaint2: Founder/staff su helper → SEMPRE Helper al primo paint
       (anche con draft/userSelected PM: altrimenti “Sei già Founder” non stampava) */
    if (!d || d.ok !== true) return activeKind;
    var h = d.helper;
    var p = d.partnermanager;
    if (isAlreadyStaffOrPmRow(h)) return "helper";
    if (isAlreadyStaffOrPmRow(p)) {
      if (userSelectedKind && activeKind === "helper" && isKindInteractive(d, "helper")) return "helper";
      return "partnermanager";
    }
    var hElig = Boolean(h && h.eligible === true);
    var pElig = Boolean(p && p.eligible === true);
    if (hElig && !pElig) return "helper";
    if (pElig && !hElig) return "partnermanager";
    if (hElig && pElig) {
      return activeKind === "partnermanager" ? "partnermanager" : "helper";
    }
    if (activeKind === "helper" && !hElig && pElig) return "partnermanager";
    if (activeKind === "partnermanager" && !pElig && hElig) return "helper";
    return activeKind;
  }

  function helperAlreadyStaffNotice(d) {
    if (!d || d.ok !== true) return null;
    var h = d.helper;
    if (!isAlreadyStaffOrPmRow(h)) return null;
    var label = String((h && h.roleLabel) || "").trim();
    var msg = polishGateMessage(d, "helper", (h && h.message) || "");
    if (!String(msg || "").trim() && !label) return null;
    return {
      message: msg,
      icon: gateIconForEligibility(d, "helper", "slate"),
    };
  }

  function candidatureEligCacheKey() {
    var id = currentUser && (currentUser.id || currentUser.userId);
    return id ? "vc-cand-elig-v1:" + String(id) : "";
  }

  function readCachedEligibility() {
    var key = candidatureEligCacheKey();
    if (!key) return null;
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.ok !== true) return null;
      return parsed;
    } catch (eR) {
      return null;
    }
  }

  function writeCachedEligibility(data) {
    var key = candidatureEligCacheKey();
    if (!key || !data || data.ok !== true) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(data));
    } catch (eW) {}
  }

  function syncTabDisabledState() {
    var b1 = byId("vc-candidature-tab-helper");
    var b2 = byId("vc-candidature-tab-pm");
    if (!b1 || !b2) return;
        b1.disabled = false;
    b2.disabled = false;
    b1.setAttribute("aria-disabled", "false");
    b2.setAttribute("aria-disabled", "false");
  }

  function setFormInnerAndModuloTitleHidden(innerEl, hidden) {
    if (innerEl) innerEl.hidden = Boolean(hidden);
    var t = byId("candidature-modulo-title");
    if (t) t.hidden = Boolean(hidden);
  }

  function setFieldsDisabled(disabled) {
    var root = byId("vc-candidature-fields");
    if (!root) return;
    var nodes = root.querySelectorAll("input, textarea");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].disabled = Boolean(disabled);
    }
  }

  var ROLE_DISCORD_EMOJI = {
    helper: "https://cdn.discordapp.com/emojis/1502328751638450426.webp?size=48&quality=lossless",
    pm: "https://cdn.discordapp.com/emojis/1494286911286808576.webp?size=48&quality=lossless",
    staff: "https://cdn.discordapp.com/emojis/1494286904089247754.webp?size=48&quality=lossless",
  };

  function clearGate() {
    var gate = byId("vc-candidature-gate");
    var body = byId("vc-candidature-gate-body");
    if (body && body.__vcShuffleTimer) {
      try {
        clearInterval(body.__vcShuffleTimer);
      } catch (eClr) {}
      body.__vcShuffleTimer = null;
    }
    if (gate) {
      gate.hidden = true;
      gate.className = "vc-candidature-notice mt-4";
      gate.removeAttribute("data-gate-icon");
    }
    if (body) body.textContent = "";
  }

  function setShuffleText(el, finalText) {
    if (!el) return;
    var target = String(finalText || "");
    if (el.__vcShuffleTimer) {
      clearInterval(el.__vcShuffleTimer);
      el.__vcShuffleTimer = null;
    }
    if (!target) {
      el.textContent = "";
      return;
    }
    /* candFounderFirstPaint2: “Sei già …” stamp definitivo subito — no shuffle che lo fa sparire */
    el.textContent = target;
    if (
      /sei\s*gi[aà]|already\s+a\b|already\s+an\b/i.test(target) ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      return;
    }
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    var frame = 0;
    var totalFrames = Math.max(8, Math.min(26, target.length + 8));
    el.__vcShuffleTimer = setInterval(function () {
      frame += 1;
      var fixed = Math.floor((frame / totalFrames) * target.length);
      var out = "";
      for (var i = 0; i < target.length; i++) {
        var ch = target.charAt(i);
        if (ch === " ") out += " ";
        else if (i < fixed) out += ch;
        else out += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      el.textContent = out;
      if (frame >= totalFrames) {
        clearInterval(el.__vcShuffleTimer);
        el.__vcShuffleTimer = null;
        el.textContent = target;
      }
    }, 22);
  }

  function setGateIcon(gate, iconKind) {
    var wrap = gate ? gate.querySelector(".vc-candidature-notice-ico") : null;
    if (!wrap) return;
    var kind = String(iconKind || "info").trim().toLowerCase();
    var url = ROLE_DISCORD_EMOJI[kind] || "";
    if (url) {
      wrap.innerHTML =
        '<img class="vc-candidature-notice-roleico" src="' +
        url +
        '" alt="" width="20" height="20" decoding="async" referrerpolicy="no-referrer" />';
      gate.setAttribute("data-gate-icon", kind);
      return;
    }
    wrap.innerHTML =
      kind === "warn"
        ? '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>'
        : '<i class="fa fa-info-circle" aria-hidden="true"></i>';
    gate.setAttribute("data-gate-icon", kind === "warn" ? "warn" : "info");
  }

  function gateIconForEligibility(d, kind, variant) {
    if (variant === "amber") return "warn";
    if (!d || d.ok !== true) return "info";
    if (hasGlobalBlock(d)) return "warn";
    var row = kind === "partnermanager" ? d.partnermanager : d.helper;
    var rid = String((row && row.roleId) || "").trim();
    if (rid === "1544831242510270464") return "pm";
    if (rid === "1442568904311570555") return "helper";
    if (rid === "1442568910070349985") return "staff";
    var c = candidatureRowCode(row);
    if (c === "helper_blocked") {
      if (rid === "1442568904311570555") return "helper";
      return "staff";
    }
    if (c === "already_role") return kind === "partnermanager" ? "pm" : "helper";
    if (c === "cooldown") return kind === "partnermanager" ? "pm" : "helper";
    var hc = candidatureRowCode(d.helper);
    var pc = candidatureRowCode(d.partnermanager);
    if (hc === "already_role" && pc === "already_role") return "staff";
    if (hc === "helper_blocked" && pc === "already_role") return "staff";
    if (pc === "already_role") return "pm";
    if (hc === "helper_blocked") return "staff";
    if (hc === "already_role") return "helper";
    return "info";
  }

  function polishGateMessage(d, kind, raw) {
    var text = String(raw || "").trim();
    var row = kind === "partnermanager" ? d && d.partnermanager : d && d.helper;
    var c = candidatureRowCode(row);
    var label = String((row && row.roleLabel) || "").trim();
    /* candFounderNotice1: Founder/Manager/… → “Sei già un {role}” sempre se c’è label */
    if ((c === "helper_blocked" || c === "already_role") && label) {
      return t("cand.eligibility.alreadyRoleNamed", "Sei già un {role}.").replace(/\{role\}/g, label);
    }
    if (c === "helper_blocked") {
      return text || t("cand.eligibility.alreadyStaff", "Sei già un membro dello Staff.");
    }
    if (c === "already_role") {
      if (kind === "partnermanager") {
        return t("cand.eligibility.alreadyPm", "Sei già un Partner Manager.");
      }
      return t("cand.eligibility.alreadyHelper", "Sei già un Helper.");
    }
    if (kind === "helper" && /sei\s*gi[aà]/i.test(text) && label) {
      return t("cand.eligibility.alreadyRoleNamed", "Sei già un {role}.").replace(/\{role\}/g, label);
    }
    if (kind === "helper" && /partner\s*manager/i.test(text) && /sei gi[aà]/i.test(text)) {
      return t("cand.eligibility.alreadyHelper", "Sei già un Helper.");
    }
    return text;
  }

  function showGateMessage(variant, message, iconKind) {
    var gate = byId("vc-candidature-gate");
    var body = byId("vc-candidature-gate-body");
    if (!gate || !body) return;
    gate.hidden = false;
    gate.className =
      "vc-candidature-notice mt-4 vc-candidature-notice--" + (variant === "amber" ? "amber" : "slate");
    setShuffleText(body, message || "");
    setGateIcon(gate, iconKind || (variant === "amber" ? "warn" : "info"));
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
      /* candSwitchGuest1: non wipe del messaggio login allo switch Helper/PM */
      showGateMessage(
        "slate",
        t(
          "cand.loginRequired",
          "Accedi con Discord (in alto a destra) per compilare il modulo: l’ID viene preso dal tuo profilo e non è modificabile.",
        ),
        "info",
      );
      setFormInnerAndModuloTitleHidden(inner, true);
      syncTabDisabledState();
      setFieldsDisabled(false);
      if (sub) sub.disabled = false;
      return;
    }

    if (!eligibilityApiUrl()) {
      clearGate();
      setFormInnerAndModuloTitleHidden(inner, false);
      syncTabDisabledState();
      setFieldsDisabled(false);
      if (sub) sub.disabled = false;
      return;
    }

    if (eligibilityState.loading) {
      /* candFounderFirstPaint2: se c’è cache/stale, NON wipe della pill Founder */
      if (eligibilityState.data && eligibilityState.data.ok === true) {
        /* fall through: ridipinge con dati stale */
      } else {
        setFormInnerAndModuloTitleHidden(inner, true);
        syncTabDisabledState();
        setFieldsDisabled(true);
        if (sub) sub.disabled = true;
        return;
      }
    }

    var d = eligibilityState.data;
    if (!d || d.ok !== true) {
      if (currentUser && eligibilityApiUrl()) {
        showGateMessage(
          "amber",
          t(
            "cand.eligibility.checkFailed",
            "Non è stato possibile verificare se puoi inviare la candidatura (API non raggiungibile). Ricarica la pagina o riprova tra poco.",
          ),
          "warn",
        );
        setFormInnerAndModuloTitleHidden(inner, false);
        syncTabDisabledState();
        setFieldsDisabled(false);
        if (sub) sub.disabled = true;
        return;
      }
      clearGate();
      setFormInnerAndModuloTitleHidden(inner, true);
      syncTabDisabledState();
      setFieldsDisabled(false);
      if (sub) sub.disabled = false;
      return;
    }

    if (hasGlobalBlock(d)) {
      showGateMessage(
        "amber",
        globalBlockMessage(d) || t("cand.eligibility.blocked", "Non puoi usare il modulo candidature con questo account."),
        "warn",
      );
      setFormInnerAndModuloTitleHidden(inner, true);
      syncTabDisabledState();
      setFieldsDisabled(true);
      if (sub) sub.disabled = true;
      return;
    }

    var hInteractive = isKindInteractive(d, "helper");
    var pInteractive = isKindInteractive(d, "partnermanager");
    if (!hInteractive && !pInteractive) {
      showGateMessage("slate", buildNoApplicableMessage(d), gateIconForEligibility(d, activeKind, "slate"));
      setFormInnerAndModuloTitleHidden(inner, true);
      syncTabDisabledState();
      setFieldsDisabled(true);
      if (sub) sub.disabled = true;
      return;
    }

    syncTabDisabledState();
    /* candFounderFirstPaint2: staff/Founder su helper batte draft PM al primo paint */
    var staffNotice = helperAlreadyStaffNotice(d);
    var preferred;
    if (staffNotice && !userSelectedKind) {
      preferred = "helper";
    } else if (userSelectedKind) {
      preferred = activeKind;
    } else {
      preferred = pickPreferredKind(d);
    }
    if (!isKindInteractive(d, preferred)) {
      if (hInteractive) preferred = "helper";
      else if (pInteractive) preferred = "partnermanager";
    }
    if (preferred === "partnermanager" || preferred === "helper") activeKind = preferred;
    syncTabActiveUi();

    /* Founder/staff: pill SEMPRE se tab Helper (o se PM non selezionato dall’utente) */
    if (staffNotice && activeKind === "helper") {
      if (!isSuccessBannerVisible()) {
        showGateMessage("slate", staffNotice.message, staffNotice.icon);
      } else {
        clearGate();
      }
      setFormInnerAndModuloTitleHidden(inner, true);
      setFieldsDisabled(true);
      if (sub) sub.disabled = true;
      return;
    }

    if (!currentTypeEligible(d)) {
      var row = rowForActiveKind(d);
      var hideModulo = shouldHideModuloCard(d, activeKind);
      if (isSuccessBannerVisible()) {
        clearGate();
        setFormInnerAndModuloTitleHidden(inner, false);
        renderFields();
      } else {
        showGateMessage(
          "slate",
          polishGateMessage(
            d,
            activeKind,
            (row && row.message) ||
              t(
                "cand.eligibility.roleBlocked",
                "Per il ruolo selezionato non puoi inviare una candidatura con questo account.",
              ),
          ),
          gateIconForEligibility(d, activeKind, "slate"),
        );
        setFormInnerAndModuloTitleHidden(inner, hideModulo);
        if (!hideModulo) renderFields();
      }
      setFieldsDisabled(true);
      if (sub) sub.disabled = true;
      return;
    }

    clearGate();
    setFormInnerAndModuloTitleHidden(inner, false);
    renderFields();
    setFieldsDisabled(false);
    if (sub) sub.disabled = false;
  }

  function isTransientCandidatureError(status, data, emptyBody) {
    var err = data && data.error ? String(data.error) : "";
    if (emptyBody) return true;
    if (status === 0 || status === 408 || status === 425 || status === 429) return true;
    if (status === 503 || status === 502 || status === 504) return true;
    return (
      err === "member_fetch_failed" ||
      err === "discord_unreachable" ||
      err === "guild_unavailable" ||
      err === "member_lookup_timeout" ||
      err === "upstream" ||
      err === "timeout" ||
      err === "internal"
    );
  }

  async function sleepMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  var eligSeq = 0;
  var eligInflight = null;

  async function refreshEligibility(attempt) {
    var tryN = Number(attempt) || 0;
    var url = eligibilityApiUrl();
    var token = getToken();
    if (!url || !currentUser || !token) {
      if (!eligibilityState.data) {
        var cachedNoTok = readCachedEligibility();
        eligibilityState = { loading: false, data: cachedNoTok || null };
      } else {
        eligibilityState.loading = false;
      }
      syncEligibilityToDom();
      return;
    }
    if (tryN === 0 && eligInflight) return eligInflight;
    var mySeq = tryN === 0 ? ++eligSeq : eligSeq;
    if (tryN === 0) {
      /* candFounderFirstPaint2: keep stale data so Founder pill non sparisce al refresh */
      eligibilityState = { loading: true, data: eligibilityState.data || null };
      syncEligibilityToDom();
    }
    var run = (async function () {
      var maxAttempts = 4;
      var coarse = false;
      try {
        coarse =
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
          Number(navigator.maxTouchPoints || 0) > 0;
      } catch (eC) {}
      var timeoutMs = coarse ? 28000 : 20000;
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = null;
      try {
        if (ctrl) timer = setTimeout(function () { try { ctrl.abort(); } catch (eA) {} }, timeoutMs);
        var fetchUrl = url + (url.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now();
        var res = await fetch(fetchUrl, {
          method: "GET",
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/json",
          },
          cache: "no-store",
          signal: ctrl ? ctrl.signal : undefined,
        });
        var data = {};
        var rawText = "";
        try {
          rawText = await res.text();
          data = rawText && String(rawText).trim() ? JSON.parse(rawText) : {};
        } catch (e2) {
          data = {};
        }
        if (mySeq !== eligSeq) return;
        var emptyBody = !String(rawText || "").trim();
        if (res.ok && data && data.ok === true && !emptyBody) {
          eligibilityState = { loading: false, data: data };
          writeCachedEligibility(data);
          syncEligibilityToDom();
          return;
        }
        if (res.status === 401) {
          /* keep stale/cache — non cancellare Founder al 401 transient */
          eligibilityState = { loading: false, data: eligibilityState.data || readCachedEligibility() };
          syncEligibilityToDom();
          return;
        }
        if (tryN < maxAttempts - 1 && isTransientCandidatureError(res.status, data, emptyBody)) {
          await sleepMs(450 + tryN * 500);
          if (mySeq !== eligSeq) return;
          return refreshEligibility(tryN + 1);
        }
        eligibilityState = { loading: false, data: eligibilityState.data || readCachedEligibility() };
        syncEligibilityToDom();
      } catch (e) {
        if (mySeq !== eligSeq) return;
        if (tryN < maxAttempts - 1) {
          await sleepMs(500 + tryN * 550);
          if (mySeq !== eligSeq) return;
          return refreshEligibility(tryN + 1);
        }
        eligibilityState = { loading: false, data: eligibilityState.data || readCachedEligibility() };
        syncEligibilityToDom();
      } finally {
        if (timer) clearTimeout(timer);
      }
    })();
    if (tryN === 0) {
      eligInflight = run.finally(function () {
        if (eligInflight === run) eligInflight = null;
      });
      return eligInflight;
    }
    return run;
  }

  function clientSubmitBlockMessage() {
    var d = eligibilityState.data;
    if (!d || d.ok !== true) return "";
    if (hasGlobalBlock(d)) return globalBlockMessage(d) || t("cand.eligibility.blockShort", "Blocco candidature.");
    var row = rowForActiveKind(d);
    if (row && row.eligible === false) return row.message || t("cand.eligibility.notEligible", "Non idoneo per questo ruolo.");
    return "";
  }

  function setWelcome(user) {
    var el = byId("candidature-welcome");
    if (!el) return;
    if (!user) {
      setShuffleText(
        el,
        t("cand.welcome", "Accedi con Discord per compilare il modulo."),
      );
      return;
    }
    var name = String(user.username || "utente").trim() || "utente";
    setShuffleText(
      el,
      t("cand.welcomeUser", "Benvenuto {name}! Scegli il ruolo e compila tutti i campi.").replace(/\{name\}/g, name),
    );
  }

  function showFormWrap(show) {
    var w = byId("vc-candidature-form-wrap");
    if (w) w.hidden = !show;
  }

  function isSingleChoiceQuestion(q) {
    return Boolean(q && q.kind === "choice" && q.options && q.options.length);
  }

  function isMultiChoiceQuestion(q) {
    return Boolean(q && q.kind === "multi_choice" && q.options && q.options.length);
  }

  function renderFields() {
    var root = byId("vc-candidature-fields");
    if (!root) return;
    var cfg = APPLICATIONS[activeKind];
    if (!cfg || !currentUser) return;
    root.innerHTML = "";
    setRoleIntroFromTemplate(activeKind);
    var uid = String(currentUser.id || "");
    cfg.questions.forEach(function (q) {
      var wrap = document.createElement("div");
      wrap.className = "vc-candidature-field";
      if (isMultiChoiceQuestion(q)) {
        var mTitle = document.createElement("div");
        mTitle.className = "vc-candidature-label";
        mTitle.textContent = q.text;
        wrap.appendChild(mTitle);
        if (q.hint) {
          var mHint = document.createElement("p");
          mHint.className = "vc-candidature-field-hint";
          mHint.textContent = String(q.hint);
          wrap.appendChild(mHint);
        }
        var mGroup = document.createElement("div");
        mGroup.className = "vc-candidature-choice-group";
        mGroup.setAttribute("role", "group");
        mGroup.setAttribute("aria-label", q.text);
        for (var mi = 0; mi < q.options.length; mi++) {
          var mOpt = q.options[mi];
          var mRow = document.createElement("label");
          mRow.className = "vc-candidature-choice";
          var mChk = document.createElement("input");
          mChk.type = "checkbox";
          mChk.id = "vc-cf-" + q.id + "-" + mi;
          mChk.className = "vc-candidature-choice-input";
          mChk.setAttribute("data-qid", q.id);
          mChk.value = String(mOpt.value != null ? mOpt.value : "");
          var mCap = document.createElement("span");
          mCap.className = "vc-candidature-choice-label";
          mCap.textContent = String(mOpt.label != null ? mOpt.label : mOpt.value || "");
          mRow.appendChild(mChk);
          mRow.appendChild(mCap);
          mGroup.appendChild(mRow);
        }
        wrap.appendChild(mGroup);
        root.appendChild(wrap);
      } else if (isSingleChoiceQuestion(q)) {
        var title = document.createElement("div");
        title.className = "vc-candidature-label";
        title.textContent = q.text;
        var group = document.createElement("div");
        group.className = "vc-candidature-choice-group";
        group.setAttribute("role", "radiogroup");
        group.setAttribute("aria-label", q.text);
        var name = "vc-cf-" + q.id;
        for (var oi = 0; oi < q.options.length; oi++) {
          var opt = q.options[oi];
          var row = document.createElement("label");
          row.className = "vc-candidature-choice";
          var rad = document.createElement("input");
          rad.type = "radio";
          rad.name = name;
          rad.value = String(opt.value != null ? opt.value : "");
          rad.id = "vc-cf-" + q.id + "-" + oi;
          rad.className = "vc-candidature-choice-input";
          rad.setAttribute("data-qid", q.id);
          var cap = document.createElement("span");
          cap.className = "vc-candidature-choice-label";
          cap.textContent = String(opt.label != null ? opt.label : opt.value || "");
          row.appendChild(rad);
          row.appendChild(cap);
          group.appendChild(row);
        }
        wrap.appendChild(title);
        wrap.appendChild(group);
        root.appendChild(wrap);
      } else {
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
      }
    });
    restoreCandidatureDraft();
  }

  function candidatureDraftKey(kind) {
    return "candidature:" + (kind === "partnermanager" ? "partnermanager" : "helper");
  }

  function collectDraftAnswers() {
    var cfg = APPLICATIONS[activeKind];
    var fieldsRoot = byId("vc-candidature-fields");
    var out = {};
    if (!cfg || !fieldsRoot) return out;
    cfg.questions.forEach(function (q) {
      if (q.id === "id_discord") return;
      if (isMultiChoiceQuestion(q)) {
        var pickedMulti = fieldsRoot.querySelectorAll(
          'input[type="checkbox"][data-qid="' + q.id + '"]:checked',
        );
        var multiVals = [];
        for (var mvi = 0; mvi < pickedMulti.length; mvi++) {
          var mv = String(pickedMulti[mvi].value || "").trim();
          if (mv) multiVals.push(mv);
        }
        out[q.id] = multiVals;
        return;
      }
      if (isSingleChoiceQuestion(q)) {
        var picked = fieldsRoot.querySelector(
          'input[type="radio"][name="vc-cf-' + q.id + '"]:checked',
        );
        out[q.id] = picked ? String(picked.value || "").trim() : "";
        return;
      }
      var el = byId("vc-cf-" + q.id);
      if (!el) return;
      out[q.id] = String(el.value || "");
    });
    return out;
  }

  function applyDraftAnswers(draft) {
    if (!draft || typeof draft !== "object") return;
    var cfg = APPLICATIONS[activeKind];
    var fieldsRoot = byId("vc-candidature-fields");
    if (!cfg || !fieldsRoot) return;
    cfg.questions.forEach(function (q) {
      if (q.id === "id_discord") return;
      var saved = draft[q.id];
      if (saved == null || saved === "") return;
      if (isMultiChoiceQuestion(q)) {
        var vals = Array.isArray(saved)
          ? saved
          : String(saved)
              .split(/\n+/)
              .map(function (s) {
                return String(s || "")
                  .replace(/^•\s*/, "")
                  .trim();
              })
              .filter(Boolean);
        var boxes = fieldsRoot.querySelectorAll('input[type="checkbox"][data-qid="' + q.id + '"]');
        for (var bi = 0; bi < boxes.length; bi++) {
          boxes[bi].checked = vals.indexOf(String(boxes[bi].value || "")) >= 0;
        }
        return;
      }
      if (isSingleChoiceQuestion(q)) {
        var radios = fieldsRoot.querySelectorAll('input[type="radio"][name="vc-cf-' + q.id + '"]');
        for (var ri = 0; ri < radios.length; ri++) {
          if (String(radios[ri].value || "") === String(saved)) {
            radios[ri].checked = true;
            break;
          }
        }
        return;
      }
      var el = byId("vc-cf-" + q.id);
      if (el && !el.readOnly) el.value = String(saved);
    });
  }

  function persistCandidatureDraft() {
    if (!window.VcFormDrafts || !currentUser) return;
    window.VcFormDrafts.save(candidatureDraftKey(activeKind), collectDraftAnswers(), {
      notify: true,
    });
    window.VcFormDrafts.save("candidature:ui", { kind: activeKind });
  }

  function restoreCandidatureDraft() {
    if (!window.VcFormDrafts || !currentUser) return;
    applyDraftAnswers(window.VcFormDrafts.load(candidatureDraftKey(activeKind)));
  }

  function clearCandidatureDraft(kind) {
    if (!window.VcFormDrafts) return;
    window.VcFormDrafts.clear(candidatureDraftKey(kind || activeKind));
  }

  function wireCandidatureDraftPersistence() {
    var wrap = byId("vc-candidature-form-wrap");
    if (!wrap || wrap._vcDraftBound) return;
    var persist =
      window.VcFormDrafts && typeof window.VcFormDrafts.debounce === "function"
        ? window.VcFormDrafts.debounce(persistCandidatureDraft, 200)
        : persistCandidatureDraft;
    wrap.addEventListener("input", persist);
    wrap.addEventListener("change", persist);
    window.addEventListener("beforeunload", persistCandidatureDraft);
    wrap._vcDraftBound = true;
  }

  function setKind(kind) {
    persistCandidatureDraft();
    userSelectedKind = true;
    activeKind = kind === "partnermanager" ? "partnermanager" : "helper";
    syncTabActiveUi();
    renderFields();
    syncEligibilityToDom();
    persistCandidatureDraft();
  }

  function collectAnswers() {
    var cfg = APPLICATIONS[activeKind];
    var fieldsRoot = byId("vc-candidature-fields");
    var out = {};
    cfg.questions.forEach(function (q) {
      if (isMultiChoiceQuestion(q)) {
        var pickedMulti = fieldsRoot
          ? fieldsRoot.querySelectorAll(
              'input[type="checkbox"][data-qid="' + q.id + '"]:checked',
            )
          : [];
        var multiVals = [];
        for (var mvi = 0; mvi < pickedMulti.length; mvi++) {
          var mv = String(pickedMulti[mvi].value || "").trim();
          if (mv) multiVals.push(mv);
        }
        out[q.id] = multiVals.length ? multiVals.map(function (v) { return "• " + v; }).join("\n") : "";
        return;
      }
      if (isSingleChoiceQuestion(q)) {
        var picked = fieldsRoot
          ? fieldsRoot.querySelector('input[type="radio"][name="vc-cf-' + q.id + '"]:checked')
          : null;
        out[q.id] = picked ? String(picked.value || "").trim() : "";
        return;
      }
      var el = byId("vc-cf-" + q.id);
      if (!el) return;
      out[q.id] = String(el.value || "").trim();
    });
    return out;
  }

  function validationFocusControlForQuestion(qid) {
    var cfg = APPLICATIONS[activeKind];
    if (!cfg) return null;
    var q = null;
    for (var i = 0; i < cfg.questions.length; i++) {
      if (cfg.questions[i].id === qid) {
        q = cfg.questions[i];
        break;
      }
    }
    if (!q) return byId("vc-cf-" + qid);
    if (isMultiChoiceQuestion(q)) {
      return (
        document.querySelector('input[type="checkbox"][data-qid="' + qid + '"]') ||
        byId("vc-cf-" + qid + "-0")
      );
    }
    if (isSingleChoiceQuestion(q)) return byId("vc-cf-" + qid + "-0");
    return byId("vc-cf-" + qid);
  }

  function firstMissingQuestion(ans) {
    var cfg = APPLICATIONS[activeKind];
    for (var i = 0; i < cfg.questions.length; i++) {
      var q = cfg.questions[i];
      if (!ans[q.id]) return q;
    }
    return null;
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
      sub.innerHTML =
        '<span class="vc-submit-spinner" aria-hidden="true"></span><span>' +
        t("cand.submitting", "Invio in corso...") +
        "</span>";
      return;
    }
    sub.classList.remove("vc-candidature-submit--loading");
    var fallback =
      '<i class="fa fa-paper-plane-o" aria-hidden="true"></i> ' + t("cand.submit", "Invia candidatura");
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
    var kind = type === "partnermanager" ? "partnermanager" : "helper";
    var untilText = formatCooldownUntil(untilMs);
    var msg = untilText
      ? t(
          "cand.eligibility.cooldownUntil",
          "Hai già inviato una candidatura di questo tipo: attendi fino al {date}.",
        ).replace(/\{date\}/g, untilText)
      : t(
          "cand.eligibility.cooldownGeneric",
          "Hai già inviato una candidatura di questo tipo di recente: attendi il cooldown di 15 giorni.",
        );
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
    base[kind] = {
      eligible: false,
      code: "cooldown",
      message: msg,
      cooldown_until_ms: Number(untilMs || 0),
    };
    eligibilityState = { loading: false, data: base };
    syncEligibilityToDom();
  }

  async function submitCandidature() {
    function notify(message, opts) {
      var text = String(message || "").trim();
      if (!text) return Promise.resolve();
      var payload = {
        title: (opts && opts.title) || t("cand.alertTitle", "Avviso"),
        message: text,
        okLabel: "OK",
        danger: Boolean(opts && opts.danger),
        icon: (opts && opts.icon) || "fa-info-circle",
      };
      if (window.VcDialog && typeof window.VcDialog.alert === "function") {
        return window.VcDialog.alert(payload);
      }
      if (typeof window.__vcEnsureDialog === "function") {
        return window.__vcEnsureDialog().then(function (D) {
          if (D && typeof D.alert === "function") return D.alert(payload);
        });
      }
      return Promise.resolve();
    }

    var api = resolvedSubmitApiUrl();
    if (!api) {
      await notify(
        "Manca l’URL API candidature: in site.config.json imposta candidatureSubmitApiUrl (produzione) e, per provare da localhost, anche candidatureSubmitApiUrlLocal (stessa base URL del bot, es. http://127.0.0.1:3000/webhooks/site-candidature). Poi rifai il build del sito.",
        { danger: true },
      );
      return;
    }
    if (!currentUser) {
      redirectToAccessRequired();
      return;
    }
    var token = getToken();
    if (!token) {
      redirectToAccessRequired();
      return;
    }
    var blockMsg = clientSubmitBlockMessage();
    if (blockMsg) {
      await notify(blockMsg);
      return;
    }
    var ans = collectAnswers();
    var missingQ = firstMissingQuestion(ans);
    if (missingQ) {
      var fieldEl = validationFocusControlForQuestion(missingQ.id);
      if (window.vcFieldValidationTip) window.vcFieldValidationTip.show(fieldEl);
      else {
        await notify(
          t("cand.error.fillRequired", "Compila tutti i campi obbligatori.") +
            "\n\nManca: " +
            (missingQ.text || missingQ.id),
        );
      }
      return;
    }
    setSubmitSuccessVisible(false);
    setSubmitLoading(true);
    try {
      var res = null;
      var data = {};
      var attempt = 0;
      var maxAttempts = 3;
      while (attempt < maxAttempts) {
        attempt += 1;
        res = await fetch(api, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ type: activeKind, answers: ans }),
        });
        data = {};
        try {
          data = await res.json();
        } catch (e2) {
          data = {};
        }
        if (res.ok && data && data.ok) break;
        if (
          attempt < maxAttempts &&
          isTransientCandidatureError(res.status, data) &&
          !(res.status === 401)
        ) {
          await sleepMs(550 * attempt);
          continue;
        }
        break;
      }
      if (!res.ok || !data.ok) {
        if (res.status === 401 && (data.error === "missing_token" || data.error === "invalid_token")) {
          redirectToAccessRequired();
          return;
        }
        var baseMsg =
          data.message ||
          data.error ||
          t("cand.error.sendFailed", "Invio non riuscito ({status}).").replace(/\{status\}/g, String(res.status));
        if (data.field) {
          var cfgErr = APPLICATIONS[activeKind];
          if (cfgErr && cfgErr.questions) {
            for (var ei = 0; ei < cfgErr.questions.length; ei++) {
              if (cfgErr.questions[ei].id === data.field) {
                baseMsg += "\n\nCampo: " + cfgErr.questions[ei].text;
                break;
              }
            }
          }
        }
        var hint404 = "";
        if (res.status === 404) {
          var origin = "";
          try {
            origin = window.location.origin;
          } catch (e3) { }
          hint404 =
            " Di solito: 404 su POST significa che la richiesta non arriva al bot Express (route assente). Controlla: 1) non servire il sito sulla stessa porta del bot (es. `npx serve` su 3000 mentre il bot è sulla 3000 — usa 5173 per il sito); 2) sul bot WEBSITE_CANDIDATURE_HTTP=1; 3) prova GET " +
            String(api || "").replace(/\/webhooks\/site-candidature\/?$/i, "") +
            "/webhooks/status dalla stessa macchina. Origine pagina: " +
            (origin || "?") +
            ".";
        }
        await notify(baseMsg + hint404, { danger: true });
        return;
      }
      setSubmitSuccessVisible(true);
      clearCandidatureDraft(activeKind);
      var okBox = byId("vc-candidature-submit-success");
      if (okBox && typeof okBox.scrollIntoView === "function") {
        try {
          okBox.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (eScroll) { }
      }
      applyLocalCooldown(activeKind, data.cooldown_until_ms);
      await refreshEligibility();
    } catch (e) {
      var pageOrigin = "";
      try {
        pageOrigin = window.location.origin;
      } catch (e2) { }
      var statusBase = String(api || "").replace(/\/webhooks\/site-candidature\/?$/i, "");
      await notify(
        t("cand.error.network", "Impossibile contattare l’API. Riprova più tardi.") +
        " (" +
        String(api || "") +
        "). Origine: " +
        (pageOrigin || "?") +
        "." +
        hintCorsOriginForRemoteApi(api) +
        " Altre verifiche: WEBSITE_CANDIDATURE_HTTP=1; candidatureSubmitApiUrlLocal punta al bot (stessa porta di discadia.webhookPort); in browser apri " +
        statusBase +
        "/webhooks/status (deve dare JSON). Ricarica con Ctrl+F5 dopo ogni build." +
        hintLocalApiHostnameMismatch(api),
        { danger: true },
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
    /* candHeroCompact1: form sempre sotto hero — guest vede tabs + avviso login */
    showFormWrap(true);
    var inner = byId("vc-candidature-form-inner");
    setFormInnerAndModuloTitleHidden(inner, true);
    if (!user) {
      setSubmitSuccessVisible(false);
      eligibilityState = { loading: false, data: null };
      showGateMessage(
        "slate",
        t(
          "cand.loginRequired",
          "Accedi con Discord (in alto a destra) per compilare il modulo: l’ID viene preso dal tuo profilo e non è modificabile.",
        ),
        "info",
      );
      setFormInnerAndModuloTitleHidden(inner, true);
      syncTabDisabledState();
      var sub = byId("vc-candidature-submit");
      if (sub) sub.disabled = false;
      return;
    }
    hideLoginGate();
    /* candFounderFirstPaint2: pill da cache SUBITO, poi refresh API */
    userSelectedKind = false;
    var cached = readCachedEligibility();
    if (cached) {
      eligibilityState = { loading: true, data: cached };
      syncEligibilityToDom();
    } else {
      eligibilityState = { loading: true, data: null };
      setFormInnerAndModuloTitleHidden(inner, true);
    }
    refreshEligibility();
  }

  function init() {
    if (window.VcFormDrafts) {
      var ui = window.VcFormDrafts.load("candidature:ui");
      if (ui && (ui.kind === "helper" || ui.kind === "partnermanager")) {
        activeKind = ui.kind;
      }
    }
    syncTabActiveUi();
    wireCandidatureDraftPersistence();
    var tabH = byId("vc-candidature-tab-helper");
    var tabPm = byId("vc-candidature-tab-pm");
    var sub = byId("vc-candidature-submit");
    if (tabH) {
      tabH.addEventListener("click", function () {
        if (tabH.disabled) return;
        setKind("helper");
      });
    }
    if (tabPm) {
      tabPm.addEventListener("click", function () {
        if (tabPm.disabled) return;
        setKind("partnermanager");
      });
    }
    if (sub) sub.addEventListener("click", submitCandidature);

    window.addEventListener("vc-discord-profile", function (ev) {
      var u = ev.detail && ev.detail.user;
      applyUser(u || null);
    });

    if (oauthHashPending()) {
      return;
    }

    var t = getToken();
    hideLoginGate();
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