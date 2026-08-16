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
      "unmute.canSubmit": "Puoi inviare la richiesta unmute.",
      "unmute.alreadySubmitted": "Richiesta già inviata. Prossimo invio disponibile: {date}",
      "unmute.checkError": "Impossibile verificare lo stato unmute. Riprova più tardi.",
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

  function setShuffleText(el, finalText) {
    if (!el) return;
    var target = String(finalText || "");
    if (!target) {
      el.textContent = "";
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
    var box = byId("unmute-status-box");
    if (!box) return;
    box.className = ok ? "vc-unmute-status vc-unmute-status--ok" : "vc-unmute-status";
    setShuffleText(box, text);
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

  async function refreshEligibility() {
    var token = getToken();
    var url = eligibilityApiUrl();
    if (!token || !url) return null;
    try {
      var res = await fetch(url, {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
      });
      var data = {};
      try {
        data = await res.json();
      } catch (e) {}
      if (!res.ok || !data.ok) return null;
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
      setStatus(t("unmute.checkError"), false);
      toggleForm(false);
      return null;
    }
  }

  function notify(message, opts) {
    var text = String(message || "").trim();
    if (!text) return Promise.resolve();
    if (window.VcDialog && typeof window.VcDialog.alert === "function") {
      return window.VcDialog.alert(
        Object.assign(
          {
            title: (opts && opts.title) || t("unmute.alertTitle", "Avviso"),
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

  function init() {
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
    fetchMe(accessToken)
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
        }
      });
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