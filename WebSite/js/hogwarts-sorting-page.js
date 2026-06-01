(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_AT_KEY = "vc_discord_expires_at";
  var PENDING_SORTING_KEY = "vc_hogwarts_pending_sorting_submit";
  var SORTING_DONE_KEY = "vc_hogwarts_sorting_done";
  var retryTimer = null;
  var retryInFlight = false;

  var state = {
    bootstrap: null,
    eligibility: null,
    questions: [],
    answers: {},
    index: 0,
    submitting: false,
    gringott: null,
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

  function crestCacheBustSegment() {
    var v = String(cfg().crestsCacheBust || "").trim();
    if (!v || isTemplatePlaceholder(v)) return "";
    return "v=" + encodeURIComponent(v);
  }

  function withCrestCacheBust(href) {
    var seg = crestCacheBustSegment();
    if (!seg) return href;
    var h = String(href || "");
    if (!h) return h;
    return h + (h.indexOf("?") >= 0 ? "&" : "?") + seg;
  }

  function crestSrcList(meta, ext) {
    if (!meta) return [];
    var custom = String(meta.crestUrl || "").trim();
    if (custom) {
      try {
        if (/^https?:\/\//i.test(custom)) {
          var cu = new URL(custom);
          return [withCrestCacheBust(window.location.origin + cu.pathname + (cu.search || ""))];
        }
      } catch (e1) {}
      return [withCrestCacheBust(custom)];
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
        urls.push(withCrestCacheBust(href));
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

  function formatGaleoni(amount) {
    var n = Math.max(0, Math.floor(Number(amount) || 0));
    return String(n) + " " + (n === 1 ? "Galeone d'Oro" : "Galeoni d'Oro");
  }

  function formatLedgerDate(value) {
    if (!value) return "";
    try {
      var d = new Date(value);
      if (!Number.isFinite(d.getTime())) return "";
      return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function readLocalSortingDone() {
    try {
      var raw = localStorage.getItem(SORTING_DONE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !String(parsed.houseId || "").trim()) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeLocalSortingDone(houseId, houseMeta) {
    try {
      var ev = state.bootstrap && state.bootstrap.event;
      localStorage.setItem(
        SORTING_DONE_KEY,
        JSON.stringify({
          houseId: String(houseId || (houseMeta && houseMeta.id) || "").trim(),
          houseMeta: houseMeta || null,
          eventKey: String((ev && ev.eventKey) || "").trim(),
          savedAt: Date.now(),
        }),
      );
    } catch (_) {}
  }

  function clearLocalSortingDone() {
    try {
      localStorage.removeItem(SORTING_DONE_KEY);
    } catch (_) {}
  }

  function sortingResultMeta(elig) {
    if (elig && elig.houseMeta) return elig.houseMeta;
    var house = elig && String(elig.house || "").trim();
    if (house) return houseMetaFromBootstrap(house);
    var local = readLocalSortingDone();
    if (local && local.houseMeta) return local.houseMeta;
    if (local && local.houseId) return houseMetaFromBootstrap(local.houseId);
    return null;
  }

  function isAlreadySorted(elig) {
    if (elig && elig.alreadySorted) return true;
    if (elig && String(elig.house || "").trim()) return true;
    var local = readLocalSortingDone();
    if (!local || !local.houseId) return false;
    var ev = state.bootstrap && state.bootstrap.event;
    var eventKey = ev && String(ev.eventKey || "").trim();
    if (eventKey && local.eventKey && local.eventKey !== eventKey) return false;
    return true;
  }

  function hasCompletedSorting() {
    return isAlreadySorted(state.eligibility);
  }

  function markSortingCompleted(houseMeta) {
    if (!state.eligibility) state.eligibility = { ok: true };
    state.eligibility.alreadySorted = true;
    state.eligibility.canSort = false;
    if (houseMeta) {
      state.eligibility.houseMeta = houseMeta;
      state.eligibility.house = String(houseMeta.id || "").trim() || state.eligibility.house;
    }
    writeLocalSortingDone(state.eligibility.house, houseMeta);
  }

  function applyLocalSortingDoneToEligibility() {
    if (!state.eligibility) state.eligibility = { ok: true };
    if (isAlreadySorted(state.eligibility) && sortingResultMeta(state.eligibility)) return;
    var local = readLocalSortingDone();
    if (!local || !local.houseId) return;
    var ev = state.bootstrap && state.bootstrap.event;
    var eventKey = ev && String(ev.eventKey || "").trim();
    if (eventKey && local.eventKey && local.eventKey !== eventKey) return;
    state.eligibility.alreadySorted = true;
    state.eligibility.canSort = false;
    state.eligibility.house = local.houseId;
    if (!state.eligibility.houseMeta) {
      state.eligibility.houseMeta = local.houseMeta || houseMetaFromBootstrap(local.houseId);
    }
  }

  function renderGringott() {
    var box = byId("vc-hw-gringott");
    if (!box) return;
    var token = getToken();
    var data = state.gringott;
    if (!token || !data || !hasCompletedSorting()) {
      setHidden(box, true);
      return;
    }
    var balance = Math.max(0, Math.floor(Number(data.balance) || 0));
    var balanceEl = byId("vc-hw-gringott-balance");
    var hintEl = byId("vc-hw-gringott-hint");
    var ledgerEl = byId("vc-hw-gringott-ledger");
    if (balanceEl) balanceEl.textContent = String(balance);
    if (hintEl) {
      hintEl.textContent =
        balance > 0
          ? "Il tuo forziere stagionale custodisce " + formatGaleoni(balance) + "."
          : "Il tuo forziere è pronto: i Galeoni compariranno qui dopo i premi dell'evento.";
    }
    if (ledgerEl) {
      var ledger = Array.isArray(data.ledger) ? data.ledger.slice(0, 3) : [];
      ledgerEl.innerHTML = "";
      if (ledger.length) {
        ledger.forEach(function (entry) {
          var row = document.createElement("p");
          var sign = entry.type === "debit" ? "-" : "+";
          var date = formatLedgerDate(entry.createdAt);
          row.textContent = sign + formatGaleoni(entry.amount) + " · " + (entry.reason || "Movimento Gringott") + (date ? " · " + date : "");
          ledgerEl.appendChild(row);
        });
        setHidden(ledgerEl, false);
      } else {
        setHidden(ledgerEl, true);
      }
    }
    setHidden(box, false);
  }

  function showGate(msg) {
    var gate = byId("vc-hw-gate");
    var msgEl = byId("vc-hw-gate-msg");
    var gateLogin = byId("vc-hw-gate-login");
    if (msgEl) msgEl.textContent = String(msg || "");
    if (gateLogin) {
      var showLogin = /accedi con discord/i.test(String(msg || ""));
      if (showLogin) gateLogin.removeAttribute("hidden");
      else gateLogin.setAttribute("hidden", "");
    }
    setHidden(gate, !msg);
    setHidden(byId("vc-hw-intro"), true);
    setHidden(byId("vc-hw-quiz"), true);
    setHidden(byId("vc-hw-sorting"), true);
    setHidden(byId("vc-hw-result"), true);
    renderGringott();
  }

  function formatEventWindowLabelIt(startDate, endDate, timezone) {
    var tz = String(timezone || "Europe/Rome").trim() || "Europe/Rome";
    function fmt(value, endOfDay) {
      var raw = String(value || "").trim();
      if (!raw) return "";
      var ms = Date.parse(raw);
      if (!Number.isFinite(ms) && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        ms = Date.parse(raw + (endOfDay ? "T23:59:59" : "T12:00:00"));
      }
      if (!Number.isFinite(ms)) return "";
      return new Date(ms).toLocaleString("it-IT", {
        timeZone: tz,
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    var start = fmt(startDate, false);
    var end = fmt(endDate, true);
    if (start && end) return "Evento attivo dal " + start + " al " + end;
    if (start) return "Evento attivo dal " + start;
    return "";
  }

  function updateWindowLabel() {
    var el = byId("vc-hw-window");
    var ev = state.bootstrap && state.bootstrap.event;
    if (!el || !ev) return;
    var label = String(ev.windowLabel || "").trim();
    if (!label && ev.startDate && ev.endDate) {
      label = formatEventWindowLabelIt(ev.startDate, ev.endDate, ev.timezone);
    } else if (label && /^dal\s/i.test(label)) {
      label = "Evento attivo " + label;
    }
    if (label) {
      el.textContent = label;
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

  async function fetchJsonWithTimeout(url, opts, timeoutMs) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    var nextOpts = opts || {};
    if (controller) {
      nextOpts = Object.assign({}, nextOpts, { signal: controller.signal });
      timer = setTimeout(function () {
        try {
          controller.abort();
        } catch (_) {}
      }, Math.max(5000, Number(timeoutMs) || 25000));
    }
    try {
      return await fetchJson(url, nextOpts);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function loadBootstrap() {
    var staticBootstrap = typeof window !== "undefined" && window.__VC_HOGWARTS_STATIC_BOOTSTRAP;
    var out = null;
    try {
      out = await fetchJson(apiBase() + "/bootstrap", { method: "GET" });
    } catch (eBootstrap) {
      out = null;
    }
    if (out && out.res.ok && out.data && out.data.ok) {
      state.bootstrap = out.data;
      if (staticBootstrap && Array.isArray(staticBootstrap.questions) && staticBootstrap.questions.length) {
        state.bootstrap.questions = staticBootstrap.questions;
      }
      state.questions = Array.isArray(state.bootstrap.questions) ? state.bootstrap.questions : [];
      updateWindowLabel();
      return;
    }
    if (staticBootstrap && staticBootstrap.ok && Array.isArray(staticBootstrap.questions)) {
      state.bootstrap = staticBootstrap;
      state.questions = staticBootstrap.questions;
      updateWindowLabel();
      return;
    }
    throw new Error((out && out.data && out.data.message) || "bootstrap_failed");
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
    state.gringott = out.data && out.data.gringott ? out.data.gringott : state.gringott;
    if (out.data && (out.data.alreadySorted || out.data.house)) {
      writeLocalSortingDone(out.data.house, out.data.houseMeta || sortingResultMeta(out.data));
    } else if (out.data && out.data.canSort) {
      clearLocalSortingDone();
    }
    if (out.res.status === 401) {
      state.eligibility = { ok: false, needsLogin: true };
      state.gringott = null;
      return;
    }
    if (out.res.status === 403 && out.data && out.data.error === "preview_forbidden") {
      state.eligibility = {
        ok: false,
        previewForbidden: true,
        canSort: false,
        message: out.data.message || "In anteprima lo smistamento non è ancora disponibile.",
      };
      return;
    }
    if (!out.res.ok && out.data.error !== "missing_token" && out.data.error !== "invalid_token") {
      return;
    }
  }

  function applyEligibilityFallbackFromBootstrap() {
    var token = getToken();
    var ev = state.bootstrap && state.bootstrap.event;
    state.gringott = state.gringott || null;
    if (!token) {
      state.eligibility = { ok: false, needsLogin: true };
      return;
    }
    var canSort = Boolean(ev && ev.open);
    var msg = "";
    if (!canSort && ev) {
      if (ev.phase === "before_start") {
        msg = ev.windowLabel
          ? "Lo smistamento aprirà " + String(ev.windowLabel).replace(/^dal\s/i, "") + "."
          : "Lo smistamento non è ancora aperto.";
      } else if (ev.phase === "after_end") {
        msg = "L'evento Hogwarts è terminato.";
      } else {
        msg = "Smistamento non disponibile al momento.";
      }
    }
    state.eligibility = { ok: true, canSort: canSort, alreadySorted: false, message: msg };
    applyLocalSortingDoneToEligibility();
  }

  function syncUiFromState() {
    var ev = state.bootstrap && state.bootstrap.event;
    var elig = state.eligibility;
    var token = getToken();
    renderGringott();

    if (!ev || !ev.enabled) {
      showGate("L'evento Hogwarts  non è attivo al momento.");
      return;
    }

    if (!token || (elig && elig.needsLogin)) {
      showGate(
        ev && ev.previewMode
          ? "Anteprima: accedi con Discord per provare lo smistamento quando sarà disponibile."
          : "Accedi con Discord per fare lo smistamento.",
      );
      return;
    }

    if (elig && elig.previewForbidden) {
      showGate(elig.message || "In anteprima lo smistamento non è ancora disponibile.");
      return;
    }

    if (isAlreadySorted(elig)) {
      var sortedMeta = sortingResultMeta(elig);
      if (sortedMeta) {
        showResult(sortedMeta, (elig && elig.message) || "Hai già completato lo smistamento.", false);
        return;
      }
    }

    if (ev && ev.open === false && !(elig && elig.canSort)) {
      var phaseMsg =
        elig && elig.message
          ? elig.message
          : ev.phase === "before_start"
            ? "Lo smistamento aprirà a giugno. Torna quando l'evento sarà live!"
            : "L'evento è terminato.";
      showGate(phaseMsg);
      return;
    }

    if (elig && elig.canSort === false && !isAlreadySorted(elig)) {
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
    if (isAlreadySorted(elig)) return false;
    if (ev && ev.open === false && !(elig && elig.canSort)) return false;
    if (elig && elig.canSort === false && !isAlreadySorted(elig)) return false;
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
    renderGringott();
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
    if (isAlreadySorted(state.eligibility)) {
      var doneMeta = sortingResultMeta(state.eligibility);
      if (doneMeta) {
        showResult(doneMeta, "Hai già completato lo smistamento.", false);
        return;
      }
    }
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

  function resetSortingVideo() {
    var vid = byId("vc-hw-sorting-video");
    if (!vid) return;
    try {
      vid.pause();
      vid.currentTime = 0;
    } catch (_) {}
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
      requestAnimationFrame(function () {
        result.classList.add("vc-hw-result--reveal");
      });
    }
  }

  function collectAnswersPayload() {
    return state.questions.map(function (q) {
      return { questionId: q.id, choiceId: state.answers[q.id] };
    });
  }

  function savePendingSortingSubmit(answers) {
    try {
      var payload = {
        answers: Array.isArray(answers) ? answers : collectAnswersPayload(),
        savedAt: Date.now(),
        attempts: 0,
      };
      localStorage.setItem(PENDING_SORTING_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function clearPendingSortingSubmit() {
    try {
      localStorage.removeItem(PENDING_SORTING_KEY);
    } catch (_) {}
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function loadPendingSortingSubmit() {
    try {
      var raw = localStorage.getItem(PENDING_SORTING_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.answers) || !parsed.answers.length) return null;
      if (Date.now() - Number(parsed.savedAt || 0) > 24 * 60 * 60 * 1000) {
        clearPendingSortingSubmit();
        return null;
      }
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function schedulePendingSortingRetry(delayMs) {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(function () {
      flushPendingSortingSubmit();
    }, Math.max(3000, Number(delayMs) || 10000));
  }

  async function flushPendingSortingSubmit() {
    if (retryInFlight) return;
    var pending = loadPendingSortingSubmit();
    var token = getToken();
    if (!pending || !token) return;
    if (isAlreadySorted(state.eligibility)) {
      clearPendingSortingSubmit();
      return;
    }
    retryInFlight = true;
    try {
      try {
        var eligOut = await fetchJson(apiBase() + "/eligibility", {
          method: "GET",
          headers: { Authorization: "Bearer " + token },
        });
        if (eligOut.res.ok && eligOut.data) {
          state.eligibility = eligOut.data;
          if (eligOut.data.alreadySorted || eligOut.data.house) {
            markSortingCompleted(eligOut.data.houseMeta || sortingResultMeta(eligOut.data));
            clearPendingSortingSubmit();
            syncUiFromState();
            return;
          }
        }
      } catch (_) {}
      var out = await fetchJsonWithTimeout(apiBase(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ answers: pending.answers }),
      }, 12000);
      if (out.res && out.res.ok && out.data && out.data.ok) {
        if (out.data.alreadySorted || out.data.house) {
          markSortingCompleted(out.data.houseMeta || sortingResultMeta(out.data));
          syncUiFromState();
        }
        clearPendingSortingSubmit();
        return;
      }
      pending.attempts = Math.min(20, Math.floor(Number(pending.attempts) || 0) + 1);
      localStorage.setItem(PENDING_SORTING_KEY, JSON.stringify(pending));
      schedulePendingSortingRetry(Math.min(60000, 5000 + pending.attempts * 5000));
    } catch (_) {
      pending.attempts = Math.min(20, Math.floor(Number(pending.attempts) || 0) + 1);
      try {
        localStorage.setItem(PENDING_SORTING_KEY, JSON.stringify(pending));
      } catch (_) {}
      schedulePendingSortingRetry(Math.min(60000, 5000 + pending.attempts * 5000));
    } finally {
      retryInFlight = false;
    }
  }

  function houseMetaFromBootstrap(houseId) {
    var id = String(houseId || "").trim();
    var houses = state.bootstrap && Array.isArray(state.bootstrap.houses) ? state.bootstrap.houses : [];
    for (var i = 0; i < houses.length; i += 1) {
      if (String(houses[i] && houses[i].id || "").trim() === id) return houses[i];
    }
    return id ? { id: id, label: id } : null;
  }

  function computeLocalSortingResult() {
    var scoring = state.bootstrap && Array.isArray(state.bootstrap.scoringQuestions) ? state.bootstrap.scoringQuestions : [];
    if (!scoring.length) return null;
    var houses = ["gryffindor", "ravenclaw", "hufflepuff", "slytherin"];
    var totals = { gryffindor: 0, ravenclaw: 0, hufflepuff: 0, slytherin: 0 };
    var decisive = { gryffindor: 0, ravenclaw: 0, hufflepuff: 0, slytherin: 0 };
    for (var i = 0; i < scoring.length; i += 1) {
      var q = scoring[i];
      var picked = state.answers[q.id];
      if (!picked) return null;
      var choices = Array.isArray(q.choices) ? q.choices : [];
      var choice = null;
      for (var c = 0; c < choices.length; c += 1) {
        if (String(choices[c].id) === String(picked)) {
          choice = choices[c];
          break;
        }
      }
      if (!choice || !choice.weights) return null;
      var maxW = -1;
      for (var h0 = 0; h0 < houses.length; h0 += 1) {
        var w0 = Number(choice.weights[houses[h0]] || 0);
        if (w0 > maxW) maxW = w0;
      }
      for (var h1 = 0; h1 < houses.length; h1 += 1) {
        var id = houses[h1];
        var w = Number(choice.weights[id] || 0);
        totals[id] += w;
        if (w === maxW && maxW > 0) decisive[id] += 1;
      }
    }
    var bestScore = -1;
    var winners = [];
    for (var h2 = 0; h2 < houses.length; h2 += 1) {
      var house = houses[h2];
      if (totals[house] > bestScore) {
        bestScore = totals[house];
        winners = [house];
      } else if (totals[house] === bestScore) {
        winners.push(house);
      }
    }
    var chosen = winners[0];
    if (winners.length > 1) {
      var bestDec = -1;
      for (var h3 = 0; h3 < winners.length; h3 += 1) {
        var candidate = winners[h3];
        if (decisive[candidate] > bestDec) {
          bestDec = decisive[candidate];
          chosen = candidate;
        }
      }
    }
    return { house: chosen, houseMeta: houseMetaFromBootstrap(chosen) };
  }

  function showLocalFallbackResult(detail) {
    var local = computeLocalSortingResult();
    if (!local || !local.houseMeta) return false;
    var msg = "Il Cappello Parlante ti assegna " + (local.houseMeta.label || local.house) + "!";
    msg += " Il server Discord non ha risposto in tempo: se il ruolo o i Galeoni non arrivano, riprova più tardi.";
    if (detail) msg += " Dettaglio: " + String(detail).slice(0, 120);
    showResult(local.houseMeta, msg, true);
    return true;
  }

  async function submitSorting() {
    if (state.submitting) return;
    if (isAlreadySorted(state.eligibility)) {
      var lockedMeta = sortingResultMeta(state.eligibility);
      if (lockedMeta) {
        showResult(lockedMeta, "Hai già completato lo smistamento.", false);
        return;
      }
    }
    var token = getToken();
    if (!token) {
      showGate("Sessione scaduta: effettua di nuovo il login.");
      return;
    }
    state.submitting = true;
    var answersPayload = collectAnswersPayload();

    var videoDone = false;
    var fetchDone = false;
    var fetchOut = null;
    var videoSafetyTimer = null;
    var resultShown = false;
    var localResultShown = false;

    function finishSortingPhase() {
      if (!videoDone) return;
      if (videoSafetyTimer) {
        clearTimeout(videoSafetyTimer);
        videoSafetyTimer = null;
      }
      if (resultShown) {
        if (localResultShown && fetchDone && fetchOut && fetchOut.res.ok && fetchOut.data && fetchOut.data.ok) {
          markSortingCompleted(fetchOut.data.houseMeta);
          if (fetchOut.data.gringott) state.gringott = fetchOut.data.gringott;
          renderGringott();
          showResult(fetchOut.data.houseMeta, fetchOut.data.message, true);
          localResultShown = false;
        }
        return;
      }
      state.submitting = false;
      try {
        if (typeof window.__vcHogwartsYoutubeResumeAfterEmbeddedVideo === "function") {
          window.__vcHogwartsYoutubeResumeAfterEmbeddedVideo();
        }
      } catch (_) {}
      resetSortingVideo();
      setHidden(byId("vc-hw-sorting"), true);
      if (!fetchDone) {
        if (showLocalFallbackResult("salvataggio Discord in corso")) {
          resultShown = true;
          localResultShown = true;
          return;
        }
      }
      var out = fetchOut;
      if (!out) {
        savePendingSortingSubmit(answersPayload);
        schedulePendingSortingRetry(5000);
        if (showLocalFallbackResult("timeout del server")) {
          resultShown = true;
          localResultShown = true;
          return;
        }
        showGate("Impossibile contattare il server. Verifica che il bot sia online e riprova.");
        resultShown = true;
        return;
      }
      if (out.data && (out.data.alreadySorted || out.data.house)) {
        markSortingCompleted(out.data.houseMeta || sortingResultMeta(out.data));
        if (out.data.gringott) state.gringott = out.data.gringott;
        clearPendingSortingSubmit();
        renderGringott();
        showResult(
          sortingResultMeta(out.data) || out.data.houseMeta,
          out.data.message || "Hai già completato lo smistamento.",
          true,
        );
        resultShown = true;
        return;
      }
      if (!out.res.ok || !out.data || !out.data.ok) {
        savePendingSortingSubmit(answersPayload);
        schedulePendingSortingRetry(5000);
        if (out.data && out.data.gringott && out.data.houseMeta) {
          state.gringott = out.data.gringott;
          markSortingCompleted(out.data.houseMeta);
          renderGringott();
        }
        if (showLocalFallbackResult(out.data && out.data.message)) {
          resultShown = true;
          localResultShown = true;
          return;
        }
        showGate((out.data && out.data.message) || "Smistamento non riuscito.");
        resultShown = true;
        return;
      }
      markSortingCompleted(out.data.houseMeta);
      if (out.data.gringott) state.gringott = out.data.gringott;
      renderGringott();
      clearPendingSortingSubmit();
      showResult(out.data.houseMeta, out.data.message, true);
      resultShown = true;
    }

    function signalVideoDone() {
      if (videoDone) return;
      videoDone = true;
      finishSortingPhase();
    }

    setHidden(byId("vc-hw-quiz"), true);
    setHidden(byId("vc-hw-sorting"), false);
    try {
      var sortEl = byId("vc-hw-sorting");
      if (sortEl && sortEl.scrollIntoView) sortEl.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (_) {}

    resetSortingVideo();
    try {
      if (typeof window.__vcHogwartsYoutubePauseForEmbeddedVideo === "function") {
        window.__vcHogwartsYoutubePauseForEmbeddedVideo();
      }
    } catch (_) {}
    var vid = byId("vc-hw-sorting-video");
    if (vid) {
      var onVideoStopped = function () {
        signalVideoDone();
      };
      vid.addEventListener("ended", onVideoStopped, { once: true });
      vid.addEventListener("error", onVideoStopped, { once: true });
      vid.addEventListener("stalled", onVideoStopped, { once: true });
      videoSafetyTimer = setTimeout(onVideoStopped, 18000);
      try {
        var playP = vid.play();
        if (playP && typeof playP.catch === "function") playP.catch(onVideoStopped);
      } catch (_) {
        onVideoStopped();
      }
    } else {
      signalVideoDone();
    }

    try {
      fetchOut = await fetchJsonWithTimeout(apiBase(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ answers: answersPayload }),
      }, 25000);
    } catch (e) {
      fetchOut = null;
      savePendingSortingSubmit(answersPayload);
      schedulePendingSortingRetry(5000);
    }
    fetchDone = true;
    finishSortingPhase();
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
      flushPendingSortingSubmit();
    });
    window.addEventListener("online", flushPendingSortingSubmit);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) flushPendingSortingSubmit();
    });
  }

  async function init() {
    bindEvents();
    if (!state.initStarted) {
      state.initStarted = true;
      try {
        await loadBootstrap();
        try {
          await loadEligibility();
        } catch (eEligibility) {
          applyEligibilityFallbackFromBootstrap();
        }
      } catch (e) {
        showGate("Non riesco a caricare il quiz. Ricarica la pagina o riprova più tardi.");
        return;
      }
    } else {
      try {
        await loadEligibility();
      } catch (e2) {
        applyEligibilityFallbackFromBootstrap();
      }
    }
    syncUiFromState();
    flushPendingSortingSubmit();
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
        showGate("Anteprima: accedi con Discord quando lo smistamento sarà disponibile.");
      } else {
        showGate("Accedi con Discord per fare lo smistamento.");
      }
      return;
    }
    if (elig && elig.previewForbidden) {
      showGate(elig.message || "In anteprima lo smistamento non è ancora disponibile.");
      return;
    }
    if (isAlreadySorted(elig)) {
      var doneMetaIntro = sortingResultMeta(elig);
      if (doneMetaIntro) {
        showResult(doneMetaIntro, (elig && elig.message) || "Hai già completato lo smistamento.", false);
        return;
      }
    }
    if (!canShowQuizNow(ev, elig, token)) {
      showGate(
        elig && elig.message
          ? elig.message
          : ev && ev.open === false && ev.phase === "before_start"
            ? "Lo smistamento aprirà a breve. Torna tra poco!"
            : "Smistamento non ancora disponibile.",
      );
      return;
    }
    if (elig && elig.canSort === false && !isAlreadySorted(elig)) {
      showGate(elig.message || "Smistamento non disponibile.");
      return;
    }
    startQuiz();
    scrollToQuizPanel();
  };

  window.__vcHogwartsShouldPlayIntro = function () {
    var ev = state.bootstrap && state.bootstrap.event;
    var elig = state.eligibility;
    return canShowQuizNow(ev, elig, getToken());
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
    init().then(function () {
      if (typeof window.__vcHogwartsIntroOpen === "function" && window.__vcHogwartsShouldPlayIntro()) {
        window.__vcHogwartsIntroOpen(function () {
          setupBgm();
          window.__vcHogwartsStartQuizAfterIntro();
        });
        return;
      }
      setupBgm();
    }).catch(function () {
      setupBgm();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  try {
    if (/\{\{/.test(String(typeof document !== "undefined" ? document.title || "" : ""))) {
      console.warn(
        "[VC Hogwarts] Pagina senza build: nel titolo compaiono {{ }}. Esegui `node WebSite/scripts/build-site.mjs` e servi `WebSite/dist`, non i file modello in `WebSite/`.",
      );
    }
  } catch (eUnb) {}
})();