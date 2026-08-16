(function () {
  "use strict";

  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var CHIP_ID = "vc-dash-credits-chip";
  var POLL_MS = 20000;
  var loadSeq = 0;

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_SITE_DASHBOARD) || {};
  }

  function resolveApiBase() {
    var c = cfg();
    var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    var raw = String(isLocal && c.apiUrlLocal ? c.apiUrlLocal : c.apiUrl || "").trim();
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function creditsShopUrl() {
    var c = cfg();
    var fromCfg = String(c.premiumCreditsPageUrl || "").trim();
    if (fromCfg) return fromCfg;
    try {
      var base = String(c.premiumPageUrl || "").trim();
      if (base) {
        return base.replace(/\/?$/, "/") + "crediti/";
      }
    } catch (e) {}
    return "/dashboard/premium/crediti/";
  }

  function getToken() {
    if (typeof window.__vcDiscordGetAccessToken === "function") {
      var t = window.__vcDiscordGetAccessToken();
      if (t) return t;
    }
    try {
      var t2 = localStorage.getItem(ACCESS_TOKEN_KEY);
      var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
      if (!t2 || !exp || Date.now() >= exp) return "";
      return t2;
    } catch (e) {
      return "";
    }
  }

  function t(key, vars, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key, vars);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    var out = fallback != null ? fallback : key;
    if (vars && typeof out === "string") {
      out = out.replace(/\{(\w+)\}/g, function (_, k) {
        return vars[k] != null ? String(vars[k]) : "{" + k + "}";
      });
    }
    return out;
  }

  function formatCredits(n) {
    var value = Math.max(0, Math.floor(Number(n) || 0));
    try {
      return value.toLocaleString(undefined);
    } catch (e) {
      return String(value);
    }
  }

  function ensureChip() {
    var existing = byId(CHIP_ID);
    if (existing) return existing;

    var actions = byId("header-quick-actions");
    if (!actions) return null;

    var a = document.createElement("a");
    a.id = CHIP_ID;
    a.className = "vc-dash-credits-chip";
    a.href = creditsShopUrl();
    a.setAttribute("data-i18n-attr", "aria-label:dashCredits.aria,title:dashCredits.title");
    a.setAttribute("aria-label", t("dashCredits.aria", null, "I tuoi crediti Premium"));
    a.title = t("dashCredits.title", null, "Acquista crediti Premium");

    a.innerHTML =
      '<span class="vc-dash-credits-chip__ico" aria-hidden="true"><i class="fa fa-money"></i></span>' +
      '<span class="vc-dash-credits-chip__count" id="vc-dash-credits-count">—</span>' +
      '<span class="vc-dash-credits-chip__label" data-i18n="dashCredits.label">crediti</span>';

    var notif = byId("vc-notif-dropdown");
    if (notif && notif.parentNode === actions) {
      actions.insertBefore(a, notif);
    } else {
      var loginBtn = byId("discord-login-btn");
      if (loginBtn && loginBtn.parentNode === actions) {
        actions.insertBefore(a, loginBtn);
      } else {
        actions.insertBefore(a, actions.firstChild);
      }
    }
    return a;
  }

  function setCount(credits) {
    var el = byId("vc-dash-credits-count");
    if (!el) return;
    el.textContent = formatCredits(credits);
  }

  function setVisible(show) {
    var chip = byId(CHIP_ID);
    if (!chip) return;
    chip.hidden = !show;
  }

  function refreshI18n() {
    var chip = byId(CHIP_ID);
    if (!chip) return;
    chip.setAttribute("aria-label", t("dashCredits.aria", null, "I tuoi crediti Premium"));
    chip.title = t("dashCredits.title", null, "Acquista crediti Premium");
    var label = chip.querySelector(".vc-dash-credits-chip__label");
    if (label) label.textContent = t("dashCredits.label", null, "crediti");
  }

  async function loadCredits() {
    var token = getToken();
    if (!token) {
      setVisible(false);
      return null;
    }
    ensureChip();
    setVisible(true);
    var seq = ++loadSeq;
    try {
      var res = await fetch(resolveApiBase() + "/credits", {
        method: "GET",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
        },
        credentials: "omit",
        cache: "no-store",
      });
      if (seq !== loadSeq) return null;
      if (!res.ok) return null;
      var data = await res.json().catch(function () {
        return null;
      });
      if (seq !== loadSeq) return null;
      if (!data || data.ok !== true) return null;
      var credits = Math.max(0, Math.floor(Number(data.credits) || 0));
      setCount(credits);
      return credits;
    } catch (e) {
      return null;
    }
  }

  function emitChanged(credits) {
    try {
      window.dispatchEvent(
        new CustomEvent("vc:credits-changed", {
          detail: { credits: credits },
        }),
      );
    } catch (e) {}
  }

  function refresh(opts) {
    opts = opts || {};
    return loadCredits().then(function (credits) {
      if (opts.emit && credits != null) emitChanged(credits);
      return credits;
    });
  }

  function boot() {
    var path = String(window.location.pathname || "");
    var isDash =
      (document.body &&
        (document.body.classList.contains("vc-dashboard-page") ||
          document.body.classList.contains("vc-dashboard-premium-page"))) ||
      /\/dashboard(\/|$)/.test(path);
    if (!isDash) return;

    ensureChip();
    refreshI18n();
    loadCredits();
    document.addEventListener("vc:langchange", refreshI18n);
    window.addEventListener("vc:credits-changed", function (ev) {
      var detail = ev && ev.detail;
      if (detail && detail.credits != null) {
        ensureChip();
        setVisible(Boolean(getToken()));
        setCount(detail.credits);
        return;
      }
      loadCredits();
    });
    window.addEventListener("storage", function (ev) {
      if (!ev) return;
      if (ev.key === ACCESS_TOKEN_KEY || ev.key === ACCESS_EXPIRES_KEY) loadCredits();
    });
    window.addEventListener("focus", function () {
      if (getToken()) loadCredits();
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && getToken()) loadCredits();
    });
    // Login/logout same-tab: discord-auth updates localStorage + login button.
    var loginBtn = byId("discord-login-btn");
    var loginState = byId("discord-login-state");
    if (window.MutationObserver && (loginBtn || loginState)) {
      var mo = new MutationObserver(function () {
        loadCredits();
      });
      if (loginBtn) mo.observe(loginBtn, { attributes: true, attributeFilter: ["hidden", "class"] });
      if (loginState) mo.observe(loginState, { attributes: true, childList: true, subtree: true, attributeFilter: ["hidden", "class"] });
    }
    setInterval(function () {
      var token = getToken();
      var chip = byId(CHIP_ID);
      if (!token) {
        if (chip && !chip.hidden) setVisible(false);
        return;
      }
      if (typeof document !== "undefined" && document.hidden) return;
      loadCredits();
    }, POLL_MS);
  }

  window.VcDashCredits = {
    refresh: refresh,
    setCount: setCount,
    load: loadCredits,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
