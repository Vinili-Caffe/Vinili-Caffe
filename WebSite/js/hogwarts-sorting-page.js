(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_AT_KEY = "vc_discord_expires_at";

  var state = {
    bootstrap: null,
    eligibility: null,
    questions: [],
    answers: {},
    index: 0,
    submitting: false,
    initStarted: false,
    eventsBound: false,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_HOGWARTS) || {};
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function isTemplatePlaceholder(value) {
    return /\{\{.*\}\}/.test(String(value || ""));
  }

  function apiBase() {
    var c = cfg();
    var local = String(c.apiUrlLocal || "").trim();
    var direct = String(c.apiUrl || "").trim();
    if (isLocalFrontendOrigin() && local && !isTemplatePlaceholder(local)) return local.replace(/\/+$/, "");
    if (direct && !isTemplatePlaceholder(direct)) return direct.replace(/\/+$/, "");
    return "/webhooks/site-hogwarts-sorting";
  }

  function crestFileName(meta, ext) {
    if (!meta) return "";
    var custom = String(meta.crestUrl || "").trim();
    if (custom) return "";
    var file = String(meta.crestFile || "").trim();
    if (!file) {
      var id = String(meta.id || "").trim();
      if (!id) return "";
      file = id + "." + (ext || "png");
    } else if (ext && file.indexOf(".") !== -1) {
      file = file.replace(/\.[a-z0-9]+$/i, "." + ext);
    }
    return file;
  }

  function pageRelativeAssetPrefix() {
    try {
      var pathname = window.location.pathname || "/";
      var segs = pathname.split("/").filter(function (s) {
        return s && s.length;
      });
      if (segs.length && /\.html?$/i.test(segs[segs.length - 1])) segs.pop();
      if (!segs.length) return "";
      return new Array(segs.length + 1).join("../");
    } catch (e) {
      return "../../";
    }
  }

  function crestPathPrefixes() {
    var out = [];
    var seen = {};
    function push(prefix) {
      var p = String(prefix || "").trim();
      if (!p || seen[p]) return;
      seen[p] = 1;
      out.push(p.endsWith("/") ? p : p + "/");
    }
    var raw = String(cfg().crestsPath || "").trim();
    if (raw && !isTemplatePlaceholder(raw)) {
      try {
        if (/^https?:\/\//i.test(raw)) push(new URL(raw).pathname || raw);
        else push(raw);
      } catch (e0) {
        push(raw);
      }
    }
    push(pageRelativeAssetPrefix() + "images/evento-hogwarts/crests/");
    push("/images/evento-hogwarts/crests/");
    return out;
  }

  function crestSrcList(meta, ext) {
    if (!meta) return [];
    var custom = String(meta.crestUrl || "").trim();
    if (custom) {
      try {
        if (/^https?:\/\//i.test(custom)) {
          var cu = new URL(custom);
          return [window.location.origin + cu.pathname + (cu.search || "")];
        }
      } catch (e1) {}
      return [custom];
    }
    var file = crestFileName(meta, ext);
    if (!file) return [];
    var urls = [];
    var seenUrl = {};
    crestPathPrefixes().forEach(function (prefix) {
      var href = "";
      try {
        if (prefix.charAt(0) === "/") href = new URL(prefix + file, window.location.origin).href;
        else href = new URL(prefix + file, window.location.href).href;
      } catch (e2) {
        href = prefix + file;
      }
      if (href && !seenUrl[href]) {
        seenUrl[href] = 1;
        urls.push(href);
      }
    });
    return urls;
  }

  function applyResultCrest(meta) {
    var img = byId("vc-hw-result-crest");
    if (!img) return;
    if (!meta || (!meta.crestUrl && !meta.crestFile && !meta.id)) {
      img.removeAttribute("src");
      setHidden(img, true);
      return;
    }
    var label = String(meta.label || meta.id || "Casa");
    var crestUrls = crestSrcList(meta, "png").concat(crestSrcList(meta, "svg"));
    img.alt = "Stemma " + label;
    if (!crestUrls.length) {
      img.removeAttribute("src");
      setHidden(img, true);
      return;
    }
    var crestIdx = 0;
    img.onload = function () {
      setHidden(img, false);
    };
    img.onerror = function () {
      crestIdx += 1;
      if (crestIdx >= crestUrls.length) {
        setHidden(img, true);
        return;
      }
      img.src = crestUrls[crestIdx];
    };
    setHidden(img, false);
    img.src = crestUrls[0];
  }

  function getToken() {
    try {
      var token = String(localStorage.getItem(ACCESS_TOKEN_KEY) || "").trim();
      var exp = Number(localStorage.getItem(EXPIRES_AT_KEY) || "0");
      if (!token || !exp || Date.now() >= exp) return "";
      return token;
    } catch (e) {
      return "";
    }
  }

  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function showGate(msg) {
    var gate = byId("vc-hw-gate");
    var msgEl = byId("vc-hw-gate-msg");
    if (msgEl) msgEl.textContent = String(msg || "");
    setHidden(gate, !msg);
    setHidden(byId("vc-hw-intro"), true);
    setHidden(byId("vc-hw-quiz"), true);
    setHidden(byId("vc-hw-sorting"), true);
    setHidden(byId("vc-hw-result"), true);
  }

  function updateWindowLabel() {
    var el = byId("vc-hw-window");
    var ev = state.bootstrap && state.bootstrap.event;
    if (!el || !ev) return;
    var label = String(ev.windowLabel || "").trim();
    if (label) {
      el.textContent = label;
      setHidden(el, false);
    } else if (ev.startDate && ev.endDate) {
      el.textContent = "Evento attivo dal " + ev.startDate + " al " + ev.endDate;
      setHidden(el, false);
    }
    if (ev.previewMode) {
      el.textContent = (el.textContent ? el.textContent + " · " : "") + "Anteprima staff";
      setHidden(el, false);
    }
  }

  async function fetchJson(url, opts) {
    var res = await fetch(url, opts || {});
    var data = {};
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }
    return { res: res, data: data };
  }

  async function loadBootstrap() {
    var out = await fetchJson(apiBase() + "/bootstrap", { method: "GET" });
    if (!out.res.ok || !out.data.ok) throw new Error(out.data.message || "bootstrap_failed");
    state.bootstrap = out.data;
    state.questions = Array.isArray(out.data.questions) ? out.data.questions : [];
    updateWindowLabel();
  }

  async function loadEligibility() {
    var token = getToken();
    if (!token) {
      state.eligibility = { ok: false, needsLogin: true };
      return;
    }
    var out = await fetchJson(apiBase() + "/eligibility", {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
    });
    state.eligibility = out.data || {};
    if (out.res.status === 401) {
      state.eligibility = { ok: false, needsLogin: true };
      return;
    }
    if (out.res.status === 403 && out.data && out.data.error === "preview_forbidden") {
      state.eligibility = {
        ok: false,
        previewForbidden: true,
        canSort: false,
        message: out.data.message || "In anteprima lo smistamento è riservato all'High Staff del server.",
      };
      return;
    }
    if (!out.res.ok && out.data.error !== "missing_token" && out.data.error !== "invalid_token") {
      return;
    }
  }

  function syncUiFromState() {
    var ev = state.bootstrap && state.bootstrap.event;
    var elig = state.eligibility;
    var token = getToken();

    if (!ev || !ev.enabled) {
      showGate("L'evento Hogwarts  non è attivo al momento.");
      return;
    }

    if (!token || (elig && elig.needsLogin)) {
      showGate("Accedi con Discord per fare lo smistamento.");
      return;
    }

    if (elig && elig.alreadySorted && elig.houseMeta) {
      showResult(elig.houseMeta, elig.message || "", false);
      return;
    }

    if (ev && ev.open === false) {
      var phaseMsg =
        elig && elig.message
          ? elig.message
          : ev.phase === "before_start"
            ? "Lo smistamento aprirà a giugno. Torna quando l'evento sarà live!"
            : "L'evento è terminato.";
      showGate(phaseMsg);
      return;
    }

    if (elig && elig.previewForbidden) {
      showGate(elig.message || "In anteprima lo smistamento è riservato all'High Staff del server.");
      return;
    }

    if (elig && elig.canSort === false && !elig.alreadySorted) {
      showGate(elig.message || "Smistamento non disponibile.");
      return;
    }

    if (introJustFinished() && canShowQuizNow(ev, elig, token)) {
      startQuiz();
      scrollToQuizPanel();
      return;
    }

    revealIntroSection();
  }

  function introJustFinished() {
    try {
      return window.__vcHogwartsIntroCompleted === true;
    } catch (e) {
      return false;
    }
  }

  function canShowQuizNow(ev, elig, token) {
    if (!token || (elig && elig.needsLogin)) return false;
    if (elig && elig.previewForbidden) return false;
    if (elig && elig.alreadySorted && elig.houseMeta) return false;
    if (ev && ev.open === false && !(ev.previewMode && token)) return false;
    if (elig && elig.canSort === false && !elig.alreadySorted) return false;
    if (!state.questions.length) return false;
    return true;
  }

  function scrollToQuizPanel() {
    try {
      var el = byId("vc-hw-quiz");
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (eSc) {}
  }

  function revealIntroSection() {
    setHidden(byId("vc-hw-gate"), true);
    setHidden(byId("vc-hw-intro"), false);
    setHidden(byId("vc-hw-quiz"), true);
    setHidden(byId("vc-hw-sorting"), true);
    setHidden(byId("vc-hw-result"), true);
  }

  function currentQuestion() {
    return state.questions[state.index] || null;
  }

  function renderQuestion() {
    var q = currentQuestion();
    var total = state.questions.length;
    if (!q) return;

    var textEl = byId("vc-hw-question-text");
    var choicesEl = byId("vc-hw-choices");
    var labelEl = byId("vc-hw-progress-label");
    var bar = byId("vc-hw-progress-bar");
    var prevBtn = byId("vc-hw-prev-btn");
    var nextBtn = byId("vc-hw-next-btn");

    if (textEl) textEl.textContent = q.text;
    if (labelEl) labelEl.textContent = "Domanda " + (state.index + 1) + " di " + total;
    if (bar) bar.style.width = String(Math.round(((state.index + 1) / total) * 100)) + "%";

    if (choicesEl) {
      choicesEl.innerHTML = "";
      var picked = state.answers[q.id];
      (q.choices || []).forEach(function (c) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "vc-hw-choice" + (picked === c.id ? " vc-hw-choice--on" : "");
        btn.setAttribute("role", "radio");
        btn.setAttribute("aria-checked", picked === c.id ? "true" : "false");
        btn.dataset.choiceId = c.id;
        btn.textContent = c.text;
        btn.addEventListener("click", function () {
          state.answers[q.id] = c.id;
          renderQuestion();
        });
        choicesEl.appendChild(btn);
      });
    }

    if (prevBtn) prevBtn.disabled = state.index <= 0 || state.submitting;
    if (nextBtn) {
      var hasPick = Boolean(state.answers[q.id]);
      nextBtn.disabled = !hasPick || state.submitting;
      nextBtn.textContent = state.index >= total - 1 ? "Concludi smistamento" : "Avanti";
    }
  }

  function startQuiz() {
    if (!state.questions.length) {
      showGate("Quiz non disponibile: riprova tra poco.");
      return;
    }
    state.index = 0;
    state.answers = {};
    setHidden(byId("vc-hw-gate"), true);
    setHidden(byId("vc-hw-intro"), true);
    setHidden(byId("vc-hw-quiz"), false);
    renderQuestion();
  }

  function showSortingAnimation() {
    setHidden(byId("vc-hw-quiz"), true);
    setHidden(byId("vc-hw-sorting"), false);
  }

  function showResult(meta, message, animated) {
    setHidden(byId("vc-hw-gate"), true);
    setHidden(byId("vc-hw-intro"), true);
    setHidden(byId("vc-hw-quiz"), true);
    setHidden(byId("vc-hw-sorting"), true);
    var result = byId("vc-hw-result");
    setHidden(result, false);

    var house = meta && meta.label ? meta.label : "Hogwarts";
    var houseEl = byId("vc-hw-result-house");
    var mottoEl = byId("vc-hw-result-motto");
    var msgEl = byId("vc-hw-result-msg");

    applyResultCrest(meta);
    if (houseEl) {
      houseEl.textContent = house;
      houseEl.className = "vc-hw-result-house vc-hw-result-house--" + String((meta && meta.id) || "").trim();
    }
    if (mottoEl) mottoEl.textContent = (meta && meta.motto) || "";
    if (msgEl) msgEl.textContent = message || "";

    if (result && meta && meta.primary) {
      result.style.setProperty("--hw-primary", meta.primary);
      result.style.setProperty("--hw-accent", meta.accent || meta.primary);
    }

    if (animated && result) {
      result.classList.remove("vc-hw-result--reveal");
      void result.offsetWidth;
      result.classList.add("vc-hw-result--reveal");
    }
  }

  function collectAnswersPayload() {
    return state.questions.map(function (q) {
      return { questionId: q.id, choiceId: state.answers[q.id] };
    });
  }

  async function submitSorting() {
    if (state.submitting) return;
    var token = getToken();
    if (!token) {
      showGate("Sessione scaduta: effettua di nuovo il login.");
      return;
    }
    state.submitting = true;
    showSortingAnimation();
    try {
      var out = await fetchJson(apiBase(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ answers: collectAnswersPayload() }),
      });
      if (!out.res.ok || !out.data.ok) {
        setHidden(byId("vc-hw-sorting"), true);
        if (out.res.status === 409 && out.data.houseMeta) {
          showResult(out.data.houseMeta, out.data.message, true);
          return;
        }
        showGate(out.data.message || "Smistamento non riuscito.");
        return;
      }
      showResult(out.data.houseMeta, out.data.message, true);
    } catch (e) {
      setHidden(byId("vc-hw-sorting"), true);
      showGate("Impossibile contattare il server. Verifica che il bot sia online e riprova.");
    } finally {
      state.submitting = false;
    }
  }

  function onNext() {
    var q = currentQuestion();
    if (!q || !state.answers[q.id]) return;
    if (state.index >= state.questions.length - 1) {
      submitSorting();
      return;
    }
    state.index += 1;
    renderQuestion();
  }

  function onPrev() {
    if (state.index <= 0) return;
    state.index -= 1;
    renderQuestion();
  }

  function bindEvents() {
    if (state.eventsBound) return;
    state.eventsBound = true;
    var startBtn = byId("vc-hw-start-btn");
    var nextBtn = byId("vc-hw-next-btn");
    var prevBtn = byId("vc-hw-prev-btn");
    if (startBtn) startBtn.addEventListener("click", startQuiz);
    if (nextBtn) nextBtn.addEventListener("click", onNext);
    if (prevBtn) prevBtn.addEventListener("click", onPrev);
    document.addEventListener("vc-discord-auth-ready", function () {
      loadEligibility().then(syncUiFromState).catch(function () {});
    });
  }

  async function init() {
    bindEvents();
    if (!state.initStarted) {
      state.initStarted = true;
      try {
        await loadBootstrap();
        await loadEligibility();
      } catch (e) {
        showGate("Non riesco a caricare il quiz. Ricarica la pagina o riprova più tardi.");
        return;
      }
    } else {
      try {
        await loadEligibility();
      } catch (e2) {}
    }
    syncUiFromState();
  }

  window.__vcHogwartsInit = init;

  window.__vcHogwartsStartQuizAfterIntro = function (retried) {
    var ev = state.bootstrap && state.bootstrap.event;
    var elig = state.eligibility;
    var token = getToken();
    if (!state.bootstrap || !state.questions.length) {
      if (retried) {
        showGate("Non riesco a caricare il quiz. Ricarica la pagina.");
        return;
      }
      init()
        .then(function () {
          window.__vcHogwartsStartQuizAfterIntro(true);
        })
        .catch(function () {
          showGate("Non riesco a caricare il quiz. Ricarica la pagina.");
        });
      return;
    }
    if (!token || (elig && elig.needsLogin)) {
      if (ev && ev.previewMode) {
        showGate("Anteprima staff: accedi con Discord (account High Staff) per avviare il quiz.");
      } else {
        showGate("Accedi con Discord per fare lo smistamento.");
      }
      return;
    }
    if (elig && elig.previewForbidden) {
      showGate(elig.message || "In anteprima lo smistamento è riservato all'High Staff del server.");
      return;
    }
    if (elig && elig.alreadySorted && elig.houseMeta) {
      showResult(elig.houseMeta, elig.message || "", false);
      return;
    }
    if (ev && ev.open === false && !ev.previewMode) {
      showGate(elig && elig.message ? elig.message : "Smistamento non ancora disponibile.");
      return;
    }
    if (elig && elig.canSort === false && !elig.alreadySorted) {
      showGate(elig.message || "Smistamento non disponibile.");
      return;
    }
    startQuiz();
    scrollToQuizPanel();
  };

  function setupBgm() {
    try {
      if (typeof window.__vcHogwartsYoutubeSetupIfConfigured === "function") {
        window.__vcHogwartsYoutubeSetupIfConfigured();
      }
    } catch (eBgm) {}
  }

  function boot() {
    if (window.__VC_HOGWARTS_USE_ACCESS_GATE) return;
    var app = byId("vc-hogwarts-app");
    if (app) app.style.display = "";
    if (typeof window.__vcHogwartsIntroOpen === "function") {
      window.__vcHogwartsIntroOpen(function () {
        init();
        setupBgm();
      });
      return;
    }
    init();
    setupBgm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();