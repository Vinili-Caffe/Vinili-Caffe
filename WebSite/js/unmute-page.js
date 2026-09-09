(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var ACCESS_REQUIRED_PATH = "/appelli/accesso-richiesto/";

  function byId(id) {
    return document.getElementById(id);
  }

  function t(key, vars) {
    if (window.VcI18n && typeof window.VcI18n.t === "function") {
      var v = window.VcI18n.t(key, vars);
      if (v && v !== key) return v;
    }
    var fallbacks = {
      "unmute.welcomeBack": "Benvenuto {name}.",
      "unmute.welcomeDefault": "Accedi con Discord per inviare la richiesta.",
      "unmute.notMuted": "Non sei mutato",
      "unmute.notMutedLead": "Il tuo account è in regola: non serve una richiesta unmute.",
      "unmute.canSubmit": "Puoi inviare la richiesta unmute.",
      "unmute.canSubmitLead": "Compila il modulo qui sotto con calma e trasparenza.",
      "unmute.alreadySubmitted": "Richiesta già inviata. Prossimo invio disponibile: {date}",
      "unmute.alreadySubmittedLead": "Attendi la fine del cooldown prima di riprovare.",
      "unmute.checkError": "Impossibile verificare lo stato unmute. Riprova più tardi.",
      "unmute.checkErrorLead": "Controlla la connessione e riprova tra poco.",
      "unmute.statusKicker": "Stato account",
      "unmute.submitting": "Invio in corso...",
      "unmute.userFallback": "utente",
      "unmute.statusLoading": "Caricamento stato...",
    };
    var raw = fallbacks[key] || key;
    if (!vars || typeof vars !== "object") return raw;
    return String(raw).replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] != null ? String(vars[k]) : "{" + k + "}";
    });
  }

  function isShuffleHidden(el) {
    if (!el) return true;
    if (el.hidden || el.hasAttribute("hidden")) return true;
    if (el.closest && el.closest("[hidden]")) return true;
    try {
      var root = document.documentElement;
      if (root && root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) {
        return true;
      }
    } catch (eReady) {}
    return false;
  }

  function setShuffleText(el, finalText) {
    if (!el) return;
    var target = String(finalText || "");
    el.__vcShuffleFinal = target;
    if (!target) {
      el.textContent = "";
      return;
    }
    if (isShuffleHidden(el)) {
      el.textContent = target;
      return;
    }
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = target;
      return;
    }
    if (el.__vcShuffleTimer) {
      clearInterval(el.__vcShuffleTimer);
      el.__vcShuffleTimer = null;
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

  function replayShuffle(el) {
    if (!el || isShuffleHidden(el)) return;
    var target = el.__vcShuffleFinal != null ? el.__vcShuffleFinal : String(el.textContent || "");
    if (!target) return;
    setShuffleText(el, target);
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
    if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) {
      return Promise.resolve(window.__VC_DISCORD_PROFILE);
    }
    var coarse = false;
    try {
      coarse =
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        Number(navigator.maxTouchPoints || 0) > 0;
    } catch (eC) {}
    var ms = coarse ? 16000 : 10000;
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    if (ctrl) timer = setTimeout(function () { try { ctrl.abort(); } catch (eT) {} }, ms);
    return fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: "Bearer " + token },
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (r) {
        if (!r.ok) {
          var err = new Error(String(r.status));
          err.status = r.status;
          throw err;
        }
        return r.json();
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function cfgUnmute() {
    return (typeof window !== "undefined" && window.__VC_UNMUTE) || {};
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
    var c = cfgUnmute();
    var local = String(c.submitApiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local && local !== "#") return local;
    var remote = String(c.submitApiUrl || "").trim();
    if (remote && remote !== "#") return remote;
    return "/webhooks/site-unmute";
  }

  function eligibilityApiUrl() {
    var api = resolvedSubmitApiUrl();
    if (!api) return "";
    return api.replace(/\/+$/, "") + "/eligibility";
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
    } catch (e) {}
    if (path.indexOf("/appelli/accesso-richiesto") !== -1 || path.indexOf("/unban/accesso-richiesto") !== -1) return;
    var dest = accessRequiredUrl();
    try {
      window.location.replace(dest);
    } catch (e2) {
      window.location.href = dest;
    }
  }

  function statusMeta(text, ok) {
    var title = String(text || "");
    if (ok && title === t("unmute.notMuted")) {
      return { tone: "ok", icon: "fa-check", lead: t("unmute.notMutedLead") };
    }
    if (ok && title === t("unmute.canSubmit")) {
      return { tone: "ok", icon: "fa-paper-plane", lead: t("unmute.canSubmitLead") };
    }
    if (title.indexOf(t("unmute.alreadySubmitted").split("{")[0]) === 0) {
      return { tone: "warn", icon: "fa-clock-o", lead: t("unmute.alreadySubmittedLead") };
    }
    if (title === t("unmute.checkPending", "Verifica in corso…")) {
      return {
        tone: "warn",
        icon: "fa-spinner fa-spin",
        lead: t("unmute.checkPendingLead", "Attendere: Discord o la rete possono essere lenti."),
      };
    }
    if (title === t("unmute.checkError") || title === t("unmute.checkSlow", "Rete lenta o Discord occupato. Riprova tra poco.") || !ok) {
      return { tone: "warn", icon: "fa-exclamation", lead: t("unmute.checkErrorLead") };
    }
    return { tone: ok ? "ok" : "warn", icon: ok ? "fa-check" : "fa-exclamation", lead: "" };
  }

  function setStatus(text, ok) {
    var box = byId("unmute-status-box");
    var wrap = byId("unmute-status-wrap");
    if (!box) return;
    var meta = statusMeta(text, ok);
    box.className =
      "vc-unmute-status vc-appelli-status vc-appelli-status--" +
      meta.tone +
      (meta.tone === "ok" ? " vc-unmute-status--ok" : "");
    if (wrap) {
      wrap.classList.toggle("vc-appelli-status-wrap--ok", meta.tone === "ok");
      wrap.classList.toggle("vc-appelli-status-wrap--warn", meta.tone === "warn");
    }
    box.innerHTML =
      '<div class="vc-appelli-status__badge" aria-hidden="true"><i class="fa ' +
      meta.icon +
      '"></i></div>' +
      '<p class="vc-appelli-status__kicker">' +
      t("unmute.statusKicker") +
      "</p>" +
      '<p class="vc-appelli-status__title"></p>' +
      (meta.lead ? '<p class="vc-appelli-status__lead">' + meta.lead + "</p>" : "");
    var titleEl = box.querySelector(".vc-appelli-status__title");
    setShuffleText(titleEl || box, text);
  }

  function setSubmitLoading(loading) {
    var btn = byId("unmute-submit");
    if (!btn) return;
    if (!btn.getAttribute("data-default-html")) {
      btn.setAttribute("data-default-html", btn.innerHTML);
    }
    if (loading) {
      btn.disabled = true;
      btn.classList.add("vc-candidature-submit--loading");
      btn.innerHTML = '<span class="vc-submit-spinner" aria-hidden="true"></span><span>' + t("unmute.submitting") + "</span>";
      return;
    }
    btn.disabled = false;
    btn.classList.remove("vc-candidature-submit--loading");
    btn.innerHTML = btn.getAttribute("data-default-html");
  }

  function setSuccess(visible) {
    var el = byId("unmute-submit-success");
    if (!el) return;
    el.hidden = !visible;
  }

  function readForm() {
    return {
      reason: String((byId("unmute-reason") || {}).value || "").trim(),
      apology: String((byId("unmute-apology") || {}).value || "").trim(),
      extra: String((byId("unmute-extra") || {}).value || "").trim(),
      acceptedRules: Boolean((byId("unmute-rules-accepted") || {}).checked),
    };
  }

  function toggleForm(canShow) {
    var wrap = byId("vc-unmute-form-wrap");
    if (wrap) wrap.hidden = !canShow;
    if (!canShow && window.vcFieldValidationTip) window.vcFieldValidationTip.hideAll();
  }

  function formatUntil(ms) {
    var ts = Number(ms || 0);
    if (!ts || !isFinite(ts) || ts <= 0) return "";
    try {
      var lang = window.VcI18n && typeof window.VcI18n.getLang === "function" ? window.VcI18n.getLang() : "it";
      return new Date(ts).toLocaleString(lang === "en" ? "en-GB" : "it-IT", {
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

  var currentUser = null;
  var lastEligibility = null;
  var eligSeq = 0;
  var eligInflight = null;
  var eligVisTimer = null;
  var MAX_ELIG_TRIES = 4;

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function isCoarseUi() {
    try {
      return (
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        Number(navigator.maxTouchPoints || 0) > 0
      );
    } catch (e) {
      return false;
    }
  }

  function eligTimeoutMs() {
    return isCoarseUi() ? 28000 : 20000;
  }

  function isTransientEligFailure(status, data, emptyBody) {
    var err = data && data.error != null ? String(data.error) : "";
    if (emptyBody) return true;
    if (status === 0 || status === 408 || status === 425 || status === 429) return true;
    if (status === 502 || status === 503 || status === 504) return true;
    return (
      err === "discord_unreachable" ||
      err === "guild_unavailable" ||
      err === "member_lookup_timeout" ||
      err === "member_fetch_failed" ||
      err === "upstream" ||
      err === "timeout" ||
      err === "internal"
    );
  }

  function scheduleEligRefresh(delayMs) {
    if (eligVisTimer) clearTimeout(eligVisTimer);
    eligVisTimer = setTimeout(function () {
      eligVisTimer = null;
      if (getToken() && currentUser) refreshEligibility();
    }, Math.max(400, Number(delayMs) || 1500));
  }

  async function refreshEligibility(attempt) {
    var tryN = Number(attempt) || 0;
    if (tryN === 0 && eligInflight) return eligInflight;
    var mySeq = tryN === 0 ? ++eligSeq : eligSeq;
    var run = (async function () {
      var token = getToken();
      var url = eligibilityApiUrl();
      if (!token) {
        redirectToAccessRequired();
        return null;
      }
      if (!url) {
        if (mySeq !== eligSeq) return null;
        setStatus(t("unmute.checkError"), false);
        toggleForm(false);
        return null;
      }
      if (tryN === 0) {
        setStatus(t("unmute.checkPending", "Verifica in corso…"), false);
        toggleForm(false);
      }
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = null;
      try {
        /* apiFalseErr1: touch budget lungo; empty/502/Discord = soft retry */
        if (ctrl) timer = setTimeout(function () { try { ctrl.abort(); } catch (eA) {} }, eligTimeoutMs());
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
        } catch (e) {
          data = {};
        }
        if (mySeq !== eligSeq) return null;
        if (res.status === 401 || data.error === "invalid_token" || data.error === "missing_token") {
          redirectToAccessRequired();
          return null;
        }
        var emptyBody = !String(rawText || "").trim();
        var parsedOk = data && data.ok === true;
        if (!res.ok || !parsedOk || emptyBody) {
          var transient = isTransientEligFailure(res.status, data, emptyBody);
          if (transient && tryN < MAX_ELIG_TRIES - 1) {
            setStatus(t("unmute.checkPending", "Verifica in corso…"), false);
            await sleep(450 + tryN * 500);
            if (mySeq !== eligSeq) return null;
            return refreshEligibility(tryN + 1);
          }
          if (transient) {
            setStatus(t("unmute.checkSlow", "Rete lenta o Discord occupato. Riprova tra poco."), false);
            toggleForm(false);
            return null;
          }
          var detail = String(data.message || data.error || "").trim();
          if (!detail && res.status) detail = "Errore HTTP " + res.status;
          setStatus(detail || t("unmute.checkError"), false);
          toggleForm(false);
          return null;
        }
        lastEligibility = data;
        if (!data.is_muted) {
          setStatus(t("unmute.notMuted"), true);
          toggleForm(false);
          return data;
        }
        if (data.cooldown_until_ms) {
          setStatus(t("unmute.alreadySubmitted", { date: formatUntil(data.cooldown_until_ms) }), false);
          toggleForm(false);
          return data;
        }
        setStatus(t("unmute.canSubmit"), true);
        toggleForm(true);
        return data;
      } catch (e2) {
        if (mySeq !== eligSeq) return null;
        if (tryN < MAX_ELIG_TRIES - 1) {
          setStatus(t("unmute.checkPending", "Verifica in corso…"), false);
          await sleep(500 + tryN * 550);
          if (mySeq !== eligSeq) return null;
          return refreshEligibility(tryN + 1);
        }
        setStatus(t("unmute.checkSlow", "Rete lenta o Discord occupato. Riprova tra poco."), false);
        toggleForm(false);
        return null;
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

  function notify(message, opts) {
    var text = String(message || "").trim();
    if (!text) return Promise.resolve();
    var payload = Object.assign(
      {
        title: (opts && opts.title) || t("unmute.alertTitle", "Avviso"),
        message: text,
        okLabel: (opts && opts.okLabel) || "OK",
        danger: Boolean(opts && opts.danger),
        icon: (opts && opts.icon) || "fa-info-circle",
      },
      opts || {},
    );
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

  async function submitUnmute() {
    var token = getToken();
    if (!currentUser || !token) {
      redirectToAccessRequired();
      return;
    }
    var api = resolvedSubmitApiUrl();
    if (!api) {
      await notify(t("unmute.apiNotConfigured"));
      return;
    }
    if (!lastEligibility || !lastEligibility.is_muted || lastEligibility.cooldown_until_ms) {
      await refreshEligibility();
      return;
    }
    var form = readForm();
    if (!form.reason) {
      if (window.vcFieldValidationTip) window.vcFieldValidationTip.show(byId("unmute-reason"));
      else await notify(t("unmute.fillRequired"));
      return;
    }
    if (!form.apology) {
      if (window.vcFieldValidationTip) window.vcFieldValidationTip.show(byId("unmute-apology"));
      else await notify(t("unmute.fillRequired"));
      return;
    }
    if (!form.acceptedRules) {
      if (window.vcFieldValidationTip) {
        window.vcFieldValidationTip.show(
          byId("unmute-rules-accepted"),
          t("unmute.acceptRulesTip"),
        );
      } else {
        await notify(t("unmute.acceptRulesAlert"));
      }
      return;
    }
    setSuccess(false);
    setSubmitLoading(true);
    try {
      var res = await fetch(api, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          answers: {
            reason: form.reason,
            apology: form.apology,
            extra: form.extra,
          },
          acceptedRules: form.acceptedRules,
        }),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (e2) {}
      if (!res.ok || !data.ok) {
        if (res.status === 401) {
          redirectToAccessRequired();
          return;
        }
        await notify(data.message || t("unmute.sendFailed"), { danger: true });
        return;
      }
      setSuccess(true);
      if (window.VcFormDrafts) {
        window.VcFormDrafts.clear("unmute:unmute-reason");
        window.VcFormDrafts.clear("unmute:unmute-apology");
        window.VcFormDrafts.clear("unmute:unmute-extra");
        window.VcFormDrafts.clear("unmute:rules");
      }
      await refreshEligibility();
    } catch (e3) {
      await notify(t("unmute.networkError"), { danger: true });
    } finally {
      setSubmitLoading(false);
    }
  }

  function replayUnmuteFx() {
    var welcome = byId("unmute-welcome");
    if (welcome && !isShuffleHidden(welcome)) {
      welcome.classList.add("vc-hero-about", "vc-home-rise", "is-in");
    }
    replayShuffle(welcome);
    var statusBox = byId("unmute-status-box");
    var statusTitle = statusBox && statusBox.querySelector(".vc-appelli-status__title");
    /* appelliStatusCard3: non shuffleare il box intero (appiattisce badge/kicker/lead) */
    replayShuffle(statusTitle || null);
  }

  function init() {
    document.addEventListener("vc:appelli-tab", function (ev) {
      var tipo = ev && ev.detail && ev.detail.tipo;
      if (tipo && tipo !== "unmute") return;
      replayUnmuteFx();
      if (getToken() && currentUser) scheduleEligRefresh(600);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (getToken() && currentUser) scheduleEligRefresh(1500);
    });
    window.addEventListener("pageshow", function (ev) {
      if (ev && ev.persisted && getToken() && currentUser) scheduleEligRefresh(800);
    });
    document.addEventListener("vc:page-cine-ready", replayUnmuteFx);
    var sub = byId("unmute-submit");
    if (sub) sub.addEventListener("click", submitUnmute);
    window.addEventListener("vc-discord-profile", function (ev) {
      var u = ev.detail && ev.detail.user;
      currentUser = u || null;
      var welcome = byId("unmute-welcome");
      if (welcome) {
        if (!currentUser) {
          setShuffleText(welcome, t("unmute.welcomeDefault"));
        } else {
          setShuffleText(welcome, t("unmute.welcomeBack", { name: String(currentUser.username || t("unmute.userFallback")) }));
        }
      }
      if (!currentUser) {
        if (!getToken()) redirectToAccessRequired();
        return;
      }
      scheduleEligRefresh(200);
    });

    if (oauthHashPending()) {
      return;
    }

    var accessToken = getToken();
    if (!accessToken) {
      redirectToAccessRequired();
      return;
    }
    setStatus(t("unmute.checkPending", "Verifica in corso…"), false);
    function bootMe(n) {
      return fetchMe(accessToken)
        .then(function (u) {
          currentUser = u;
          var welcome = byId("unmute-welcome");
          if (welcome && currentUser) {
            setShuffleText(welcome, t("unmute.welcomeBack", { name: String(currentUser.username || t("unmute.userFallback")) }));
          }
          refreshEligibility();
        })
        .catch(function (err) {
          var status = err && err.status;
          if (status === 401 || !getToken()) {
            redirectToAccessRequired();
            return;
          }
          if (n < 2) {
            return sleep(600 + n * 500).then(function () {
              return bootMe(n + 1);
            });
          }
          setStatus(t("unmute.checkSlow", "Rete lenta o Discord occupato. Riprova tra poco."), false);
          toggleForm(false);
        });
    }
    bootMe(0);
  }

  function bindUnmuteDraftFields() {
    if (!window.VcFormDrafts) return;
    ["unmute-reason", "unmute-apology", "unmute-extra"].forEach(function (id) {
      var el = byId(id);
      if (el) window.VcFormDrafts.bindField(el, "unmute:" + id);
    });
    var rules = byId("unmute-rules-accepted");
    if (rules) window.VcFormDrafts.bindField(rules, "unmute:rules");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bindUnmuteDraftFields();
      init();
    });
  } else {
    bindUnmuteDraftFields();
    init();
  }
})();