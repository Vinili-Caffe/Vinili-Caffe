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
      "unban.welcomeBack": "Benvenuto {name}.",
      "unban.welcomeDefault": "Accedi con Discord per inviare la richiesta.",
      "unban.notBanned": "Non sei bannato",
      "unban.canSubmit": "Puoi inviare la richiesta unban.",
      "unban.alreadySubmitted": "Richiesta già inviata. Prossimo invio disponibile: {date}",
      "unban.checkError": "Impossibile verificare lo stato unban. Riprova più tardi.",
      "unban.submitting": "Invio in corso...",
      "unban.userFallback": "utente",
      "unban.statusLoading": "Caricamento stato...",
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
    return fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: "Bearer " + token },
    }).then(function (r) {
      if (!r.ok) {
        var err = new Error(String(r.status));
        err.status = r.status;
        throw err;
      }
      return r.json();
    });
  }

  function cfgUnban() {
    return (typeof window !== "undefined" && window.__VC_UNBAN) || {};
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
    var c = cfgUnban();
    var local = String(c.submitApiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local) return local;
    return String(c.submitApiUrl || "").trim();
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

  function setStatus(text, ok) {
    var box = byId("unban-status-box");
    if (!box) return;
    box.className = ok ? "vc-unban-status vc-unban-status--ok" : "vc-unban-status";
    setShuffleText(box, text);
  }

  function setSubmitLoading(loading) {
    var btn = byId("unban-submit");
    if (!btn) return;
    if (!btn.getAttribute("data-default-html")) {
      btn.setAttribute("data-default-html", btn.innerHTML);
    }
    if (loading) {
      btn.disabled = true;
      btn.classList.add("vc-candidature-submit--loading");
      btn.innerHTML = '<span class="vc-submit-spinner" aria-hidden="true"></span><span>' + t("unban.submitting") + "</span>";
      return;
    }
    btn.disabled = false;
    btn.classList.remove("vc-candidature-submit--loading");
    btn.innerHTML = btn.getAttribute("data-default-html");
  }

  function setSuccess(visible) {
    var el = byId("unban-submit-success");
    if (!el) return;
    el.hidden = !visible;
  }

  function readForm() {
    return {
      reason: String((byId("unban-reason") || {}).value || "").trim(),
      apology: String((byId("unban-apology") || {}).value || "").trim(),
      extra: String((byId("unban-extra") || {}).value || "").trim(),
      acceptedRules: Boolean((byId("unban-rules-accepted") || {}).checked),
    };
  }

  function toggleForm(canShow) {
    var wrap = byId("vc-unban-form-wrap");
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

  async function refreshEligibility() {
    var token = getToken();
    var url = eligibilityApiUrl();
    if (!token || !url) {
      setStatus(t("unban.checkError"), false);
      toggleForm(false);
      return null;
    }
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    try {
      if (ctrl) timer = setTimeout(function () { try { ctrl.abort(); } catch (eA) {} }, 12000);
      var res = await fetch(url, {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
        signal: ctrl ? ctrl.signal : undefined,
      });
      var data = {};
      try {
        data = await res.json();
      } catch (e) {}
      if (!res.ok || !data.ok) {
        setStatus(t("unban.checkError"), false);
        toggleForm(false);
        return null;
      }
      lastEligibility = data;
      if (!data.is_banned) {
        setStatus(t("unban.notBanned"), true);
        toggleForm(false);
        return data;
      }
      if (data.cooldown_until_ms) {
        setStatus(t("unban.alreadySubmitted", { date: formatUntil(data.cooldown_until_ms) }), false);
        toggleForm(false);
        return data;
      }
      setStatus(t("unban.canSubmit"), true);
      toggleForm(true);
      return data;
    } catch (e2) {
      setStatus(t("unban.checkError"), false);
      toggleForm(false);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function notify(message, opts) {
    var text = String(message || "").trim();
    if (!text) return Promise.resolve();
    if (window.VcDialog && typeof window.VcDialog.alert === "function") {
      return window.VcDialog.alert(
        Object.assign(
          {
            title: (opts && opts.title) || t("unban.alertTitle", "Avviso"),
            message: text,
            okLabel: (opts && opts.okLabel) || "OK",
            danger: Boolean(opts && opts.danger),
            icon: (opts && opts.icon) || "fa-info-circle",
          },
          opts || {},
        ),
      );
    }
    window.alert(text);
    return Promise.resolve();
  }

  async function submitUnban() {
    var token = getToken();
    if (!currentUser || !token) {
      redirectToAccessRequired();
      return;
    }
    var api = resolvedSubmitApiUrl();
    if (!api) {
      await notify(t("unban.apiNotConfigured"));
      return;
    }
    if (!lastEligibility || !lastEligibility.is_banned || lastEligibility.cooldown_until_ms) {
      await refreshEligibility();
      return;
    }
    var form = readForm();
    if (!form.reason) {
      if (window.vcFieldValidationTip) window.vcFieldValidationTip.show(byId("unban-reason"));
      else await notify(t("unban.fillRequired"));
      return;
    }
    if (!form.apology) {
      if (window.vcFieldValidationTip) window.vcFieldValidationTip.show(byId("unban-apology"));
      else await notify(t("unban.fillRequired"));
      return;
    }
    if (!form.acceptedRules) {
      if (window.vcFieldValidationTip) {
        window.vcFieldValidationTip.show(
          byId("unban-rules-accepted"),
          t("unban.acceptRulesTip"),
        );
      } else {
        await notify(t("unban.acceptRulesAlert"));
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
        await notify(data.message || t("unban.sendFailed"), { danger: true });
        return;
      }
      setSuccess(true);
      if (window.VcFormDrafts) {
        window.VcFormDrafts.clear("unban:unban-reason");
        window.VcFormDrafts.clear("unban:unban-apology");
        window.VcFormDrafts.clear("unban:unban-extra");
        window.VcFormDrafts.clear("unban:rules");
      }
      await refreshEligibility();
    } catch (e3) {
      await notify(t("unban.networkError"), { danger: true });
    } finally {
      setSubmitLoading(false);
    }
  }

  function replayUnbanFx() {
    var welcome = byId("unban-welcome");
    if (welcome && !isShuffleHidden(welcome)) {
      welcome.classList.add("vc-hero-about", "vc-home-rise", "is-in");
    }
    replayShuffle(welcome);
    replayShuffle(byId("unban-status-box"));
  }

  function init() {
    document.addEventListener("vc:appelli-tab", function (ev) {
      var tipo = ev && ev.detail && ev.detail.tipo;
      if (tipo && tipo !== "unban") return;
      replayUnbanFx();
    });
    document.addEventListener("vc:page-cine-ready", replayUnbanFx);
    var sub = byId("unban-submit");
    if (sub) sub.addEventListener("click", submitUnban);
    window.addEventListener("vc-discord-profile", function (ev) {
      var u = ev.detail && ev.detail.user;
      currentUser = u || null;
      var welcome = byId("unban-welcome");
      if (welcome) {
        if (!currentUser) {
          setShuffleText(welcome, t("unban.welcomeDefault"));
        } else {
          setShuffleText(welcome, t("unban.welcomeBack", { name: String(currentUser.username || t("unban.userFallback")) }));
        }
      }
      if (!currentUser) {
                if (!getToken()) redirectToAccessRequired();
        return;
      }
      refreshEligibility();
    });

    if (oauthHashPending()) {
      return;
    }

    var accessToken = getToken();
    if (!accessToken) {
      redirectToAccessRequired();
      return;
    }
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    if (ctrl) timer = setTimeout(function () { try { ctrl.abort(); } catch (eT) {} }, 10000);
    fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: "Bearer " + accessToken },
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
      .then(function (u) {
        currentUser = u;
        var welcome = byId("unban-welcome");
        if (welcome && currentUser) {
          setShuffleText(welcome, t("unban.welcomeBack", { name: String(currentUser.username || t("unban.userFallback")) }));
        }
        return refreshEligibility();
      })
      .catch(function (err) {
        var status = err && err.status;
        if (status === 401 || !getToken()) {
          redirectToAccessRequired();
          return;
        }
        setStatus(t("unban.checkError"), false);
        toggleForm(false);
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function bindUnbanDraftFields() {
    if (!window.VcFormDrafts) return;
    ["unban-reason", "unban-apology", "unban-extra"].forEach(function (id) {
      var el = byId(id);
      if (el) window.VcFormDrafts.bindField(el, "unban:" + id);
    });
    var rules = byId("unban-rules-accepted");
    if (rules) window.VcFormDrafts.bindField(rules, "unban:rules");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bindUnbanDraftFields();
      init();
    });
  } else {
    bindUnbanDraftFields();
    init();
  }
})();