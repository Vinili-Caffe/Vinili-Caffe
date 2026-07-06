(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var ACCESS_REQUIRED_PATH = "/unban/accesso-richiesto/";

  function byId(id) {
    return document.getElementById(id);
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
      if (!r.ok) throw new Error(String(r.status));
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
    if (path.indexOf("/unban/accesso-richiesto") !== -1) return;
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
      btn.innerHTML = '<span class="vc-submit-spinner" aria-hidden="true"></span><span>Invio in corso...</span>';
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
      if (!data.is_banned) {
        setStatus("Non sei bannato", true);
        toggleForm(false);
        return data;
      }
      if (data.cooldown_until_ms) {
        setStatus("Richiesta già inviata. Prossimo invio disponibile: " + formatUntil(data.cooldown_until_ms), false);
        toggleForm(false);
        return data;
      }
      setStatus("Puoi inviare la richiesta unban.", true);
      toggleForm(true);
      return data;
    } catch (e2) {
      setStatus("Impossibile verificare lo stato unban. Riprova più tardi.", false);
      toggleForm(false);
      return null;
    }
  }

  async function submitUnban() {
    var token = getToken();
    if (!currentUser || !token) {
      redirectToAccessRequired();
      return;
    }
    var api = resolvedSubmitApiUrl();
    if (!api) {
      alert("API unban non configurata.");
      return;
    }
    if (!lastEligibility || !lastEligibility.is_banned || lastEligibility.cooldown_until_ms) {
      await refreshEligibility();
      return;
    }
    var form = readForm();
    if (!form.reason) {
      if (window.vcFieldValidationTip) window.vcFieldValidationTip.show(byId("unban-reason"));
      else alert("Compila i campi obbligatori.");
      return;
    }
    if (!form.apology) {
      if (window.vcFieldValidationTip) window.vcFieldValidationTip.show(byId("unban-apology"));
      else alert("Compila i campi obbligatori.");
      return;
    }
    if (!form.acceptedRules) {
      if (window.vcFieldValidationTip) {
        window.vcFieldValidationTip.show(
          byId("unban-rules-accepted"),
          "Accetta le regole del server per inviare la richiesta.",
        );
      } else {
        alert("Devi accettare le regole del server per inviare la richiesta.");
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
        alert(data.message || "Invio non riuscito.");
        return;
      }
      setSuccess(true);
      await refreshEligibility();
    } catch (e3) {
      alert("Errore di rete durante l'invio.");
    } finally {
      setSubmitLoading(false);
    }
  }

  function init() {
    var sub = byId("unban-submit");
    if (sub) sub.addEventListener("click", submitUnban);
    window.addEventListener("vc-discord-profile", function (ev) {
      var u = ev.detail && ev.detail.user;
      currentUser = u || null;
      var welcome = byId("unban-welcome");
      if (welcome) {
        if (!currentUser) {
          setShuffleText(welcome, "Accedi con Discord per inviare la richiesta.");
        } else {
          setShuffleText(welcome, "Benvenuto " + String(currentUser.username || "utente") + ".");
        }
      }
      if (!currentUser) {
        redirectToAccessRequired();
        return;
      }
      refreshEligibility();
    });

    if (oauthHashPending()) {
      return;
    }

    var t = getToken();
    if (!t) {
      redirectToAccessRequired();
      return;
    }
    fetchMe(t)
      .then(function (u) {
        currentUser = u;
        refreshEligibility();
      })
      .catch(function () {
        redirectToAccessRequired();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();